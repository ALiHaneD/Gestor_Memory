/**
 * Analysis Engine — Motor de Análisis de Grafos (Estilo Graphify)
 * 
 * Implementa lógica para extraer insights del grafo de conocimiento:
 * - God Nodes: Nodos centrales (posibles cuellos de botella)
 * - Surprising Connections: Relaciones entre fuentes distantes
 * - Graph Questions: Preguntas sugeridas basadas en la topología
 */

import { sql } from 'drizzle-orm';
import { getDB, knowledgeNodes, knowledgeEdges } from '../db';

/**
 * Encuentra los "God Nodes" (nodos con mayor grado de conexión).
 * Estos nodos suelen representar abstracciones core o acumuladores de deuda técnica.
 */
export async function getGodNodes(limit: number = 10) {
  const db = getDB({} as any);
  
  const query = sql`
    SELECT kn.id, kn.content, kn.source, count(ke.id) as degree
    FROM ${knowledgeNodes} kn
    LEFT JOIN ${knowledgeEdges} ke ON kn.id = ke.source_id OR kn.id = ke.target_id
    GROUP BY kn.id, kn.content, kn.source
    ORDER BY degree DESC
    LIMIT ${limit}
  `;

  const results = await db.execute(query);
  return results.rows;
}

/**
 * Identifica conexiones "sorprendentes".
 * En esta versión, se consideran sorprendentes las conexiones que cruzan diferentes archivos fuente.
 */
export async function getSurprisingConnections(limit: number = 5) {
  const db = getDB({} as any);
  
  const query = sql`
    SELECT 
      ke.id as edge_id,
      kn1.content as source_content,
      kn1.source as source_origin,
      kn2.content as target_content,
      kn2.source as target_origin,
      ke.relationship
    FROM ${knowledgeEdges} ke
    JOIN ${knowledgeNodes} kn1 ON ke.source_id = kn1.id
    JOIN ${knowledgeNodes} kn2 ON ke.target_id = kn2.id
    WHERE kn1.source != kn2.source
    ORDER BY ke.created_at DESC
    LIMIT ${limit}
  `;

  const results = await db.execute(query);
  return results.rows;
}

/**
 * Genera preguntas basadas en anomalías del grafo.
 */
export async function generateGraphQuestions() {
  const db = getDB({} as any);
  
  // 1. Nodos aislados (sin conexiones)
  const isolatedQuery = sql`
    SELECT kn.id, kn.content
    FROM ${knowledgeNodes} kn
    LEFT JOIN ${knowledgeEdges} ke ON kn.id = ke.source_id OR kn.id = ke.target_id
    WHERE ke.id IS NULL
    LIMIT 3
  `;
  const isolated = await db.execute(isolatedQuery);
  
  // 2. God Nodes para verificación
  const gods = await getGodNodes(3);
  
  const questions = [];
  
  for (const row of isolated.rows) {
    questions.push({
      type: 'isolated_node',
      question: `¿Qué relación tiene "${(row.content as string).slice(0, 60)}..." con el resto del proyecto?`,
      why: 'Este nodo existe en la memoria pero no tiene conexiones con otros conceptos.'
    });
  }
  
  for (const row of gods) {
    if (Number(row.degree) > 5) {
      questions.push({
        type: 'architectural_hub',
        question: `¿El componente "${(row.content as string).slice(0, 60)}..." está sobrecargado de responsabilidades?`,
        why: `Tiene ${row.degree} conexiones directas, lo que lo convierte en un "God Node".`
      });
    }
  }
  
  return questions;
}
