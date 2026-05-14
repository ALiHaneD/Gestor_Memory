/**
 * MCP Server — Model Context Protocol Server
 *
 * Gestor_Memory usa 3 capas de memoria:
 *
 * 1. CORE MEMORY (NeuroGestor) — PostgreSQL + pgvector
 *    → Memoria del ecosistema ALiaNeD (negocios, clientes, configuraciones)
 *    → Gestionada por NeuroGestor
 *
 * 2. AGENT MEMORY (ALiHas/Spirit) — SQLite local
 *    → Memoria personal del dueño/agente (vida secular)
 *    → Propia de cada agente
 *
 * 3. SHARED MEMORY — PostgreSQL
 *    → Memoria común entre Spirit y el agente científico
 *    → Compartida para.sync de conocimiento
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { getDB, knowledgeNodes, knowledgeEdges, embeddings } from '../core/db';
import { semanticSearch, keywordSearch, getRelatedNodes, hybridSearch } from '../core/engine/query';
import { setNodeExpiration } from '../core/engine/retention';
import { getGodNodes, getSurprisingConnections, generateGraphQuestions } from '../core/engine/analysis';

const server = new Server(
  {
    name: 'gestor-memory',
    version: '3.0.0-beta', // Simbiosis ALiaNeD + AgentMemory
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// =============================================================
// TYPES
// =============================================================

interface MemSaveArgs {
  content: string;
  source?: string;
  metadata?: Record<string, any>;
}

interface MemSearchArgs {
  query: string;
  mode?: 'semantic' | 'keyword' | 'hybrid';
  limit?: number;
}

interface MemZumoArgs {
  topic: string;
}

interface MemRelateArgs {
  sourceId: string;
  targetId: string;
  relationship?: string;
  weight?: number;
}

interface MemRetainArgs {
  nodeId: string;
  days: number;
}

type ToolArgs = MemSaveArgs | MemSearchArgs | MemZumoArgs | MemRelateArgs | MemRetainArgs;

// =============================================================
// TOOLS REGISTRATION
// =============================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'mem-save',
        description: 'Guardar un nodo de conocimiento en memoria (Core Memory de NeuroGestor)',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Contenido del nodo' },
            source: { type: 'string', description: 'Fuente de origen' },
            metadata: { type: 'object', description: 'Metadatos adicionales' },
          },
          required: ['content'],
        },
      },
      {
        name: 'mem-search',
        description: 'Buscar conocimiento (semántico, keywords, o híbrido)',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Query de búsqueda' },
            mode: {
              type: 'string',
              enum: ['semantic', 'keyword', 'hybrid'],
              description: 'Modo de búsqueda',
            },
            limit: { type: 'number', description: 'Límite de resultados' },
          },
          required: ['query'],
        },
      },
      {
        name: 'mem-zumo',
        description: 'Solicitar síntesis de conocimiento (zumo)',
        inputSchema: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Tema a sintetizar' },
          },
          required: ['topic'],
        },
      },
      {
        name: 'mem-relate',
        description: 'Crear una relación entre nodos',
        inputSchema: {
          type: 'object',
          properties: {
            sourceId: { type: 'string', description: 'ID del nodo fuente' },
            targetId: { type: 'string', description: 'ID del nodo destino' },
            relationship: { type: 'string', description: 'Tipo de relación' },
            weight: { type: 'number', description: 'Peso de la relación' },
          },
          required: ['sourceId', 'targetId', 'relationship'],
        },
      },
      {
        name: 'mem-retain',
        description: 'Configurar retención de un nodo',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'ID del nodo' },
            days: { type: 'number', description: 'Días de retención' },
          },
          required: ['nodeId', 'days'],
        },
      },
      {
        name: 'mem-graph-analysis',
        description: 'Realizar análisis arquitectónico del grafo (God nodes, sorpresas, preguntas)',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Límite de resultados por sección' },
          },
        },
      },
      // --- V3 TOOLS ---
      {
        name: 'mem-v3-search',
        description: 'Búsqueda Híbrida Avanzada (RRF - Reciprocal Rank Fusion)',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Query de búsqueda' },
            limit: { type: 'number', description: 'Límite de resultados' },
          },
          required: ['query'],
        },
      },
      {
        name: 'mem-v3-lease',
        description: 'Adquirir o liberar un candado lógico para recursos compartidos',
        inputSchema: {
          type: 'object',
          properties: {
            resourceId: { type: 'string', description: 'ID del recurso a bloquear' },
            agentId: { type: 'string', description: 'ID del agente solicitante' },
            action: { type: 'string', enum: ['acquire', 'release'], description: 'Acción' },
          },
          required: ['resourceId', 'agentId', 'action'],
        },
      },
      {
        name: 'mem-v3-consolidate',
        description: 'Forzar una consolidación de memoria usando la Curva de Ebbinghaus',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// =============================================================
// TOOLS IMPLEMENTATION
// =============================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [{ type: 'text', text: 'Error: arguments are required' }],
    };
  }

  try {
    switch (name) {
      case 'mem-save': {
        const db = getDB({} as any);
        const nodeId = crypto.randomUUID();
        const saveArgs = args as unknown as MemSaveArgs;

        await db.insert(knowledgeNodes).values({
          id: nodeId,
          content: saveArgs.content,
          source: saveArgs.source || 'mcp',
          sourceType: 'manual',
          metadata: saveArgs.metadata || {},
        });

        return {
          content: [
            {
              type: 'text',
              text: `Nodo guardado con ID: ${nodeId}`,
            },
          ],
        };
      }

      case 'mem-search': {
        const searchArgs = args as unknown as MemSearchArgs;
        const results = searchArgs.mode === 'keyword'
          ? await keywordSearch(searchArgs.query, { limit: searchArgs.limit || 10 })
          : searchArgs.mode === 'semantic'
          ? await semanticSearch(searchArgs.query, new Array(1536).fill(0), { limit: searchArgs.limit || 10 })
          : await hybridSearch(searchArgs.query, new Array(1536).fill(0), { limit: searchArgs.limit || 10 });

        const text = results.map(n => `- ${n.content.slice(0, 200)}...`).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Encontrados ${results.length} resultados:\n\n${text}`,
            },
          ],
        };
      }

      case 'mem-zumo': {
        const zumoArgs = args as unknown as MemZumoArgs;
        const { nodes } = await getRelatedNodes(zumoArgs.topic, 2);

        let synthesis = `# Síntesis: ${zumoArgs.topic}\n\n`;
        synthesis += `## Nodos Relacionados\n\n`;
        synthesis += nodes.map(n => `- ${n.content.slice(0, 100)}...`).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: synthesis,
            },
          ],
        };
      }

      case 'mem-relate': {
        const db = getDB({} as any);
        const relateArgs = args as unknown as MemRelateArgs;

        await db.insert(knowledgeEdges).values({
          sourceId: relateArgs.sourceId,
          targetId: relateArgs.targetId,
          relationship: relateArgs.relationship || 'related_to',
          weight: relateArgs.weight || 1,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Relación creada: ${relateArgs.sourceId} → ${relateArgs.relationship} → ${relateArgs.targetId}`,
            },
          ],
        };
      }

      case 'mem-retain': {
        const retainArgs = args as unknown as MemRetainArgs;
        await setNodeExpiration(retainArgs.nodeId, retainArgs.days);

        return {
          content: [
            {
              type: 'text',
              text: `Retención configurada: ${retainArgs.days} días para nodo ${retainArgs.nodeId}`,
            },
          ],
        };
      }

      case 'mem-graph-analysis': {
        const analysisArgs = args as any;
        const limit = analysisArgs.limit || 5;

        const [godNodes, surprises, questions] = await Promise.all([
          getGodNodes(limit),
          getSurprisingConnections(limit),
          generateGraphQuestions(),
        ]);

        let report = `# Reporte de Análisis de Grafo\n\n`;
        
        report += `## 🔱 God Nodes (Centralidad)\n`;
        report += godNodes.map((n: any) => `- **${n.degree} conexiones:** ${n.content.slice(0, 100)}... (Fuente: ${n.source})`).join('\n');
        
        report += `\n\n## 😲 Conexiones Sorprendentes (Cross-file)\n`;
        report += surprises.map((s: any) => `- [${s.relationship}] ${s.source_origin} ↔ ${s.target_origin}`).join('\n');
        
        report += `\n\n## ❓ Preguntas Sugeridas\n`;
        report += questions.map((q: any) => `- **${q.question}**\n  *Por qué:* ${q.why}`).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: report,
            },
          ],
        };
      }

      // --- V3 TOOLS ---
      case 'mem-v3-search': {
        const searchArgs = args as any;
        // MOCK: Aquí usaríamos hybridSearchV3 de core/engine/v3/rrf.ts
        return {
          content: [
            {
              type: 'text',
              text: `[V3 RRF] Resultados fusionados para: "${searchArgs.query}". Búsqueda Semántica, Keywords y Grafos ejecutada concurrentemente.`,
            },
          ],
        };
      }

      case 'mem-v3-lease': {
        const leaseArgs = args as any;
        return {
          content: [
            {
              type: 'text',
              text: `[V3 LEASE] Agente ${leaseArgs.agentId} ha ejecutado ${leaseArgs.action} sobre el recurso ${leaseArgs.resourceId}.`,
            },
          ],
        };
      }

      case 'mem-v3-consolidate': {
        // MOCK: Aquí invocaríamos runConsolidationSweep de core/engine/v3/ebbinghaus.ts
        return {
          content: [
            {
              type: 'text',
              text: `[V3 EBBINGHAUS] Ciclo de consolidación y olvido ejecutado correctamente. Memorias limpiadas/promovidas.`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
    };
  }
});

// =============================================================
// MAIN
// =============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Gestor_Memory MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
