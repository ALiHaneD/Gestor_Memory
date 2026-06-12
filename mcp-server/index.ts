/**
 * MCP Server — Gestor_Memory v3
 *
 * Todas las tools usan LocalStorageAdapter (file-first, sin Postgres requerido).
 * Regla A5: ninguna tool simula éxito. Si hay error o no hay datos, lo declara.
 *
 * Tools disponibles:
 *   mem-context  — Tier 1 + handoff: para que cualquier agente empiece una sesión
 *   mem-save     — Guardar nodo de conocimiento
 *   mem-search   — Buscar (semántico si hay embeddings, keyword si no)
 *   mem-relate   — Crear arista entre nodos
 *   mem-retain   — Configurar TTL de un nodo
 *   mem-graph-analysis — Análisis del grafo (god nodes, conexiones, preguntas)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createStorage } from '../core/storage/local';
import { resolveProvider, cosineSimilarity } from '../core/embeddings/provider';

const PROJECT_DIR = process.env['GM_PROJECT_DIR'] || process.cwd();
const storage = createStorage(PROJECT_DIR);

const server = new Server(
  { name: 'gestor-memory', version: '3.0.0' },
  { capabilities: { tools: {} } }
);

// =============================================================
// TOOLS REGISTRATION
// =============================================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'mem-context',
      description: 'Devuelve el contexto Tier 1 del proyecto (CONTEXT.md + current-state.md). Llamar al inicio de cualquier sesión para entender el proyecto sin escanear el codebase.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'mem-save',
      description: 'Guardar un nodo de conocimiento en el grafo del proyecto.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Contenido del nodo' },
          source: { type: 'string', description: 'Archivo/origen' },
          metadata: { type: 'object', description: 'Metadatos opcionales' },
        },
        required: ['content'],
      },
    },
    {
      name: 'mem-search',
      description: 'Buscar conocimiento. Usa embeddings reales si disponibles, keyword (FTS5) si no. Declara qué modo usa.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Consulta de búsqueda' },
          limit: { type: 'number', description: 'Límite de resultados (default 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'mem-relate',
      description: 'Crear una arista tipada entre dos nodos.',
      inputSchema: {
        type: 'object',
        properties: {
          sourceId: { type: 'string' },
          targetId: { type: 'string' },
          relationship: {
            type: 'string',
            enum: ['imports', 'links_to', 'mentions', 'similar_to', 'related_to'],
          },
          weight: { type: 'number' },
        },
        required: ['sourceId', 'targetId', 'relationship'],
      },
    },
    {
      name: 'mem-retain',
      description: 'Marcar un nodo con TTL (días). Informativo — la limpieza se aplica en el próximo zumo.',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          days: { type: 'number' },
        },
        required: ['nodeId', 'days'],
      },
    },
    {
      name: 'mem-graph-analysis',
      description: 'Análisis del grafo: nodos más conectados, tipos de aristas, sugerencias.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Top N resultados por sección (default 5)' },
        },
      },
    },
  ],
}));

// =============================================================
// TOOLS IMPLEMENTATION
// =============================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (!args) return { content: [{ type: 'text', text: 'Error: se requieren argumentos' }] };

  try {
    switch (name) {

      // ─── mem-context ──────────────────────────────────────────
      case 'mem-context': {
        const parts: string[] = [];

        const contextPath = path.join(PROJECT_DIR, '.gestor-memory', 'CONTEXT.md');
        if (fs.existsSync(contextPath)) {
          parts.push(fs.readFileSync(contextPath, 'utf-8'));
        } else {
          parts.push('⚠ CONTEXT.md no encontrado. Ejecuta `gestor-memory init` para generarlo.');
        }

        const handoffPath = path.join(PROJECT_DIR, '.dev', 'handoffs', 'current-state.md');
        if (fs.existsSync(handoffPath)) {
          parts.push('\n---\n## Estado actual (handoff)\n');
          parts.push(fs.readFileSync(handoffPath, 'utf-8'));
        }

        return { content: [{ type: 'text', text: parts.join('\n') }] };
      }

      // ─── mem-save ─────────────────────────────────────────────
      case 'mem-save': {
        const { content, source, metadata } = args as any;
        const nodeId = crypto.randomUUID();
        storage.saveNode({
          id: nodeId,
          content,
          source: source || 'mcp-manual',
          sourceType: 'manual',
          createdAt: new Date().toISOString(),
          metadata: metadata || {},
        });
        return { content: [{ type: 'text', text: `Nodo guardado con ID: ${nodeId}` }] };
      }

      // ─── mem-search ───────────────────────────────────────────
      case 'mem-search': {
        const { query, limit = 10 } = args as any;
        const provider = await resolveProvider();

        if (!provider.isKeywordOnly) {
          // Búsqueda semántica real: embeber el query y calcular coseno
          try {
            const queryEmb = await provider.embed(query);
            const allNodes = storage.getAllNodes();
            const scored: { node: typeof allNodes[0]; score: number }[] = [];

            for (const node of allNodes) {
              const stored = storage.getEmbedding(node.id);
              if (!stored) continue;
              const score = cosineSimilarity(queryEmb.vector, Array.from(stored.vector));
              scored.push({ node, score });
            }

            scored.sort((a, b) => b.score - a.score);
            const top = scored.slice(0, limit);

            if (top.length === 0) {
              return { content: [{ type: 'text', text: `[${provider.name}] Sin resultados para: "${query}". El grafo puede estar vacío — ejecuta gestor-memory zumo.` }] };
            }

            const text = top.map(({ node, score }) =>
              `[${score.toFixed(3)}] ${path.basename(node.source)} — ${node.content.slice(0, 200)}...`
            ).join('\n\n');

            return { content: [{ type: 'text', text: `Búsqueda semántica (${provider.name}), ${top.length} resultados:\n\n${text}` }] };
          } catch (err: any) {
            // Fall through to keyword if embedding fails
          }
        }

        // Keyword FTS5
        const results = storage.searchKeyword(query, limit);
        if (results.length === 0) {
          return { content: [{ type: 'text', text: `[keyword/FTS5] Sin resultados para: "${query}". El grafo puede estar vacío — ejecuta gestor-memory zumo.` }] };
        }
        const text = results.map(n => `${path.basename(n.source)} — ${n.content.slice(0, 200)}...`).join('\n\n');
        return { content: [{ type: 'text', text: `Búsqueda keyword (FTS5), ${results.length} resultados:\n\n${text}` }] };
      }

      // ─── mem-relate ───────────────────────────────────────────
      case 'mem-relate': {
        const { sourceId, targetId, relationship, weight } = args as any;
        storage.saveEdge({ sourceId, targetId, relationship, weight: weight || 1.0 });
        return { content: [{ type: 'text', text: `Arista creada: ${sourceId} → [${relationship}] → ${targetId}` }] };
      }

      // ─── mem-retain ───────────────────────────────────────────
      case 'mem-retain': {
        const { nodeId, days } = args as any;
        const node = storage.getNode(nodeId);
        if (!node) return { content: [{ type: 'text', text: `Error: nodo ${nodeId} no encontrado.` }] };
        // Guardamos el TTL como metadata
        storage.saveNode({ ...node, metadata: { ...node.metadata, ttlDays: days, ttlSetAt: new Date().toISOString() } });
        return { content: [{ type: 'text', text: `TTL configurado: ${days} días para nodo ${nodeId}.` }] };
      }

      // ─── mem-graph-analysis ───────────────────────────────────
      case 'mem-graph-analysis': {
        const { limit = 5 } = args as any;
        const nodes = storage.getAllNodes();
        const edges = storage.getAllEdges();

        if (nodes.length === 0) {
          return { content: [{ type: 'text', text: 'El grafo está vacío. Ejecuta `gestor-memory zumo` primero.' }] };
        }

        const degree: Record<string, number> = {};
        const byType: Record<string, number> = {};
        for (const e of edges) {
          degree[e.sourceId] = (degree[e.sourceId] || 0) + 1;
          degree[e.targetId] = (degree[e.targetId] || 0) + 1;
          byType[e.relationship] = (byType[e.relationship] || 0) + 1;
        }

        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const godNodes = Object.entries(degree)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([id, deg]) => `- ${deg} conexiones: \`${path.basename(nodeMap.get(id)?.source || id)}\``);

        const typeLines = Object.entries(byType).map(([t, c]) => `- \`${t}\`: ${c} aristas`);

        const report = [
          `# Análisis del Grafo — ${nodes.length} nodos, ${edges.length} aristas\n`,
          `## Nodos más conectados\n${godNodes.join('\n') || '(sin conexiones)'}`,
          `\n## Aristas por tipo\n${typeLines.join('\n') || '(ninguna)'}`,
          `\n## Estado de embeddings\nModelo activo: ${storage.getEmbeddingModel() || 'ninguno (modo keyword)'}`,
        ].join('\n');

        return { content: [{ type: 'text', text: report }] };
      }

      default:
        throw new Error(`Tool desconocida: ${name}`);
    }
  } catch (error: any) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
  }
});

// =============================================================
// MAIN
// =============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Gestor_Memory MCP Server v3 corriendo | proyecto: ${PROJECT_DIR}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
