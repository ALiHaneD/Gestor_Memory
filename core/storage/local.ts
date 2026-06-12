/**
 * LocalStorageAdapter — almacenamiento file-first con SQLite + JSON export.
 *
 * La fuente de verdad en runtime es el SQLite (.gestor-memory/cache/memory.db).
 * El JSON (.gestor-memory/graph/nodes.json + edges.json) es el snapshot versionado
 * en git. Son equivalentes: el JSON se reconstruye desde SQLite con exportGraph(),
 * y el SQLite se reconstruye desde JSON con importGraph().
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================
// TIPOS COMPARTIDOS
// =============================================================

export interface KnowledgeNode {
  id: string;
  content: string;
  source: string;
  sourceType: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface KnowledgeEdge {
  sourceId: string;
  targetId: string;
  relationship: 'imports' | 'links_to' | 'mentions' | 'similar_to' | 'related_to';
  weight: number;
}

export interface StoredEmbedding {
  nodeId: string;
  model: string;
  dims: number;
  vector: Float32Array;
}

// =============================================================
// INTERFAZ DEL ADAPTER
// =============================================================

export interface StorageAdapter {
  saveNode(node: KnowledgeNode): void;
  saveEdge(edge: KnowledgeEdge): void;
  saveEmbedding(emb: StoredEmbedding): void;
  getNode(id: string): KnowledgeNode | null;
  searchKeyword(query: string, limit?: number): KnowledgeNode[];
  searchByIds(ids: string[]): KnowledgeNode[];
  getAllNodes(): KnowledgeNode[];
  getAllEdges(): KnowledgeEdge[];
  getEmbedding(nodeId: string): StoredEmbedding | null;
  getEmbeddingModel(): string | null;
  nodeCount(): number;
  edgeCount(): number;
  clear(): void;
  exportGraph(graphDir: string): void;
  importGraph(graphDir: string): void;
}

// =============================================================
// IMPLEMENTACIÓN LOCAL (SQLite)
// =============================================================

export class LocalStorageAdapter implements StorageAdapter {
  private db: Database.Database;

  constructor(projectDir: string) {
    const cacheDir = path.join(projectDir, '.gestor-memory', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const dbPath = path.join(cacheDir, 'memory.db');
    this.db = new Database(dbPath);
    this.bootstrap();
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        source_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts
        USING fts5(content, id UNINDEXED, content=nodes, content_rowid=rowid);

      CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
        INSERT INTO nodes_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
        INSERT INTO nodes_fts(nodes_fts, rowid, id, content) VALUES ('delete', old.rowid, old.id, old.content);
        INSERT INTO nodes_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
        INSERT INTO nodes_fts(nodes_fts, rowid, id, content) VALUES ('delete', old.rowid, old.id, old.content);
      END;

      CREATE TABLE IF NOT EXISTS edges (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relationship TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        PRIMARY KEY (source_id, target_id, relationship)
      );

      CREATE TABLE IF NOT EXISTS embeddings (
        node_id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        dims INTEGER NOT NULL,
        vector BLOB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  saveNode(node: KnowledgeNode): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO nodes (id, content, source, source_type, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(node.id, node.content, node.source, node.sourceType, node.createdAt, JSON.stringify(node.metadata));
  }

  saveEdge(edge: KnowledgeEdge): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO edges (source_id, target_id, relationship, weight)
      VALUES (?, ?, ?, ?)
    `).run(edge.sourceId, edge.targetId, edge.relationship, edge.weight);
  }

  saveEmbedding(emb: StoredEmbedding): void {
    const buf = Buffer.from(emb.vector.buffer);
    this.db.prepare(`
      INSERT OR REPLACE INTO embeddings (node_id, model, dims, vector)
      VALUES (?, ?, ?, ?)
    `).run(emb.nodeId, emb.model, emb.dims, buf);
    // Registrar modelo actual
    this.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('embeddingModel', ?)`).run(emb.model);
  }

  getNode(id: string): KnowledgeNode | null {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as any;
    return row ? this.rowToNode(row) : null;
  }

  searchKeyword(query: string, limit = 10): KnowledgeNode[] {
    const rows = this.db.prepare(`
      SELECT n.* FROM nodes n
      JOIN nodes_fts f ON n.id = f.id
      WHERE nodes_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as any[];
    return rows.map(r => this.rowToNode(r));
  }

  searchByIds(ids: string[]): KnowledgeNode[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...ids) as any[];
    return rows.map(r => this.rowToNode(r));
  }

  getAllNodes(): KnowledgeNode[] {
    return (this.db.prepare('SELECT * FROM nodes').all() as any[]).map(r => this.rowToNode(r));
  }

  getAllEdges(): KnowledgeEdge[] {
    return (this.db.prepare('SELECT * FROM edges').all() as any[]).map(r => ({
      sourceId: r.source_id,
      targetId: r.target_id,
      relationship: r.relationship,
      weight: r.weight,
    }));
  }

  getEmbedding(nodeId: string): StoredEmbedding | null {
    const row = this.db.prepare('SELECT * FROM embeddings WHERE node_id = ?').get(nodeId) as any;
    if (!row) return null;
    const buf = row.vector as Buffer;
    return {
      nodeId: row.node_id,
      model: row.model,
      dims: row.dims,
      vector: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4),
    };
  }

  getEmbeddingModel(): string | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = 'embeddingModel'`).get() as any;
    return row ? row.value : null;
  }

  nodeCount(): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM nodes').get() as any).c;
  }

  edgeCount(): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM edges').get() as any).c;
  }

  clear(): void {
    this.db.exec('DELETE FROM embeddings; DELETE FROM edges; DELETE FROM nodes;');
  }

  exportGraph(graphDir: string): void {
    fs.mkdirSync(graphDir, { recursive: true });
    const nodes = this.getAllNodes();
    const edges = this.getAllEdges();
    fs.writeFileSync(path.join(graphDir, 'nodes.json'), JSON.stringify(nodes, null, 2));
    fs.writeFileSync(path.join(graphDir, 'edges.json'), JSON.stringify(edges, null, 2));
  }

  importGraph(graphDir: string): void {
    const nodesPath = path.join(graphDir, 'nodes.json');
    const edgesPath = path.join(graphDir, 'edges.json');
    if (!fs.existsSync(nodesPath) || !fs.existsSync(edgesPath)) return;
    this.clear();
    const nodes: KnowledgeNode[] = JSON.parse(fs.readFileSync(nodesPath, 'utf-8'));
    const edges: KnowledgeEdge[] = JSON.parse(fs.readFileSync(edgesPath, 'utf-8'));
    const insertNode = this.db.prepare(
      `INSERT OR REPLACE INTO nodes (id, content, source, source_type, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertEdge = this.db.prepare(
      `INSERT OR REPLACE INTO edges (source_id, target_id, relationship, weight) VALUES (?, ?, ?, ?)`
    );
    const insertMany = this.db.transaction(() => {
      for (const n of nodes) {
        insertNode.run(n.id, n.content, n.source, n.sourceType, n.createdAt, JSON.stringify(n.metadata));
      }
      for (const e of edges) {
        insertEdge.run(e.sourceId, e.targetId, e.relationship, e.weight);
      }
    });
    insertMany();
  }

  private rowToNode(row: any): KnowledgeNode {
    return {
      id: row.id,
      content: row.content,
      source: row.source,
      sourceType: row.source_type,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }
}

// =============================================================
// FACTORY
// =============================================================

export function createStorage(projectDir: string): StorageAdapter {
  return new LocalStorageAdapter(projectDir);
}
