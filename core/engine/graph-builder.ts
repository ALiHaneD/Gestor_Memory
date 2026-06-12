/**
 * graph-builder.ts — Construye aristas REALES entre nodos de conocimiento.
 *
 * Tipos de arista (todos verificables contra los archivos fuente):
 *   imports    — archivo A importa/require archivo B (código)
 *   links_to   — doc A tiene un link markdown/wikilink a doc B
 *   mentions   — dos chunks del mismo archivo mencionan una entidad de dominio
 *   similar_to — coseno > 0.75 entre embeddings reales (solo si hay proveedor)
 */

import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeNode, KnowledgeEdge, StorageAdapter } from '../storage/local';
import { cosineSimilarity } from '../embeddings/provider';

// =============================================================
// ARISTAS: imports
// =============================================================

function extractImports(content: string, filePath: string, allSources: string[]): string[] {
  const importedPaths: string[] = [];
  const dir = path.dirname(filePath);

  // import ... from './foo' | require('./foo')
  const regex = /(?:import\s+.*?\s+from\s+|require\s*\()\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    const importPath = m[1];
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue; // skip node_modules
    const resolved = path.resolve(dir, importPath);
    // buscar con extensiones posibles
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
      const candidate = resolved + ext;
      const match = allSources.find(s => s === candidate || s === resolved + '/index' + ext);
      if (match) { importedPaths.push(match); break; }
    }
  }
  return importedPaths;
}

// =============================================================
// ARISTAS: links_to (Markdown links y wikilinks)
// =============================================================

function extractMarkdownLinks(content: string, filePath: string, allSources: string[]): string[] {
  const dir = path.dirname(filePath);
  const linked: string[] = [];

  // [text](./path) — links relativos
  const mdLinkRegex = /\[.*?\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLinkRegex.exec(content)) !== null) {
    const href = m[1].split('#')[0].trim();
    if (!href || href.startsWith('http') || href.startsWith('mailto')) continue;
    const resolved = path.resolve(dir, href);
    const match = allSources.find(s => s === resolved || s === resolved + '.md');
    if (match) linked.push(match);
  }

  // [[WikiLink]] — Obsidian style
  const wikiRegex = /\[\[([^\]]+)\]\]/g;
  while ((m = wikiRegex.exec(content)) !== null) {
    const name = m[1].split('|')[0].split('#')[0].trim().toLowerCase();
    const match = allSources.find(s =>
      path.basename(s, path.extname(s)).toLowerCase() === name
    );
    if (match) linked.push(match);
  }

  return linked;
}

// =============================================================
// ARISTAS: mentions (entidades de dominio dentro del mismo archivo)
// =============================================================

function buildMentionEdges(
  nodes: KnowledgeNode[],
  domainEntities: string[],
): KnowledgeEdge[] {
  if (domainEntities.length === 0) return [];

  const edges: KnowledgeEdge[] = [];
  // Agrupar nodos por source
  const bySource = new Map<string, KnowledgeNode[]>();
  for (const n of nodes) {
    const arr = bySource.get(n.source) || [];
    arr.push(n);
    bySource.set(n.source, arr);
  }

  // Para cada par de FUENTES distintas, si ambas mencionan la misma entidad → arista
  const sources = Array.from(bySource.keys());
  const entityOccurrences = new Map<string, Set<string>>();

  for (const entity of domainEntities) {
    const lower = entity.toLowerCase();
    const occurringSources = new Set<string>();
    for (const src of sources) {
      const chunks = bySource.get(src)!;
      if (chunks.some(n => n.content.toLowerCase().includes(lower))) {
        occurringSources.add(src);
      }
    }
    entityOccurrences.set(entity, occurringSources);
  }

  const added = new Set<string>();
  for (const [entity, srcs] of entityOccurrences) {
    const srcArr = Array.from(srcs);
    for (let i = 0; i < srcArr.length; i++) {
      for (let j = i + 1; j < srcArr.length; j++) {
        const key = `${srcArr[i]}|${srcArr[j]}`;
        if (added.has(key)) continue;
        added.add(key);

        const srcNodes = bySource.get(srcArr[i])!;
        const tgtNodes = bySource.get(srcArr[j])!;
        if (srcNodes.length > 0 && tgtNodes.length > 0) {
          edges.push({
            sourceId: srcNodes[0].id,
            targetId: tgtNodes[0].id,
            relationship: 'mentions',
            weight: 0.5,
          });
        }
      }
    }
  }

  return edges;
}

// =============================================================
// ARISTAS: similar_to (coseno sobre embeddings reales)
// =============================================================

function buildSimilarityEdges(storage: StorageAdapter, threshold = 0.75, topK = 3): KnowledgeEdge[] {
  const nodes = storage.getAllNodes();
  if (nodes.length === 0) return [];

  const embeddingsMap = new Map<string, number[]>();
  for (const n of nodes) {
    const emb = storage.getEmbedding(n.id);
    if (emb) embeddingsMap.set(n.id, Array.from(emb.vector));
  }

  if (embeddingsMap.size === 0) return [];

  const edges: KnowledgeEdge[] = [];
  const ids = Array.from(embeddingsMap.keys());

  for (let i = 0; i < ids.length; i++) {
    const scores: { id: string; score: number }[] = [];
    for (let j = 0; j < ids.length; j++) {
      if (i === j) continue;
      const score = cosineSimilarity(embeddingsMap.get(ids[i])!, embeddingsMap.get(ids[j])!);
      if (score >= threshold) scores.push({ id: ids[j], score });
    }
    scores.sort((a, b) => b.score - a.score);
    for (const { id, score } of scores.slice(0, topK)) {
      edges.push({
        sourceId: ids[i],
        targetId: id,
        relationship: 'similar_to',
        weight: score,
      });
    }
  }

  return edges;
}

// =============================================================
// MAIN: buildRealEdges()
// =============================================================

export interface GraphBuildOptions {
  domainEntities?: string[];
  buildSimilarity?: boolean;
}

export function buildRealEdges(
  nodes: KnowledgeNode[],
  storage: StorageAdapter,
  opts: GraphBuildOptions = {},
): KnowledgeEdge[] {
  const allSources = [...new Set(nodes.map(n => n.source))];
  const edges: KnowledgeEdge[] = [];
  const added = new Set<string>();

  const addEdge = (e: KnowledgeEdge) => {
    const key = `${e.sourceId}|${e.relationship}|${e.targetId}`;
    if (!added.has(key)) { added.add(key); edges.push(e); }
  };

  // Agrupar nodos por source para obtener el ID representativo de cada archivo
  const sourceToFirstNode = new Map<string, string>();
  for (const n of nodes) {
    if (!sourceToFirstNode.has(n.source)) sourceToFirstNode.set(n.source, n.id);
  }

  // imports y links_to (por archivo)
  for (const src of allSources) {
    if (!fs.existsSync(src)) continue;
    const content = fs.readFileSync(src, 'utf-8');
    const ext = path.extname(src).toLowerCase();

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      const imported = extractImports(content, src, allSources);
      for (const target of imported) {
        const srcId = sourceToFirstNode.get(src);
        const tgtId = sourceToFirstNode.get(target);
        if (srcId && tgtId && srcId !== tgtId) {
          addEdge({ sourceId: srcId, targetId: tgtId, relationship: 'imports', weight: 1.0 });
        }
      }
    }

    if (['.md', '.mdx'].includes(ext)) {
      const linked = extractMarkdownLinks(content, src, allSources);
      for (const target of linked) {
        const srcId = sourceToFirstNode.get(src);
        const tgtId = sourceToFirstNode.get(target);
        if (srcId && tgtId && srcId !== tgtId) {
          addEdge({ sourceId: srcId, targetId: tgtId, relationship: 'links_to', weight: 0.8 });
        }
      }
    }
  }

  // mentions (entre archivos que comparten entidades de dominio)
  if (opts.domainEntities && opts.domainEntities.length > 0) {
    for (const e of buildMentionEdges(nodes, opts.domainEntities)) addEdge(e);
  }

  // similar_to (solo si hay embeddings reales)
  if (opts.buildSimilarity && storage.getEmbeddingModel()) {
    for (const e of buildSimilarityEdges(storage)) addEdge(e);
  }

  return edges;
}

// =============================================================
// SUMMARY: resumen legible del grafo (no inventa métricas)
// =============================================================

export function generateGraphSummary(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  projectName: string,
  embeddingModel: string | null,
): string {
  const byType: Record<string, number> = {};
  for (const e of edges) byType[e.relationship] = (byType[e.relationship] || 0) + 1;

  // God nodes: los 5 con más conexiones
  const degree: Record<string, number> = {};
  for (const e of edges) {
    degree[e.sourceId] = (degree[e.sourceId] || 0) + 1;
    degree[e.targetId] = (degree[e.targetId] || 0) + 1;
  }
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const topNodes = Object.entries(degree)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, deg]) => `  - ${deg} conexiones: \`${path.basename(nodeMap.get(id)?.source || id)}\``);

  const embLine = embeddingModel
    ? `Embeddings: \`${embeddingModel}\``
    : `Embeddings: ninguno — modo keyword (FTS5)`;

  return `# Resumen del Grafo — ${projectName}
> Generado por Gestor_Memory v3. Fecha: ${new Date().toISOString().split('T')[0]}

## Métricas reales

| Métrica | Valor |
|:--------|:------|
| Nodos | ${nodes.length} |
| Aristas | ${edges.length} |
| ${embLine} | |

## Aristas por tipo

${Object.entries(byType).map(([t, c]) => `- \`${t}\`: ${c}`).join('\n') || '- (sin aristas)'}

## Nodos más conectados (god nodes)

${topNodes.join('\n') || '- (sin conexiones)'}

---
*Todas las métricas son verificables contra \`.gestor-memory/graph/nodes.json\` y \`edges.json\`.*
`;
}
