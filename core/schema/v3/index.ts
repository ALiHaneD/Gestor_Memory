/**
 * Gestor_Memory v3.0 Core — Esquemas Psicológicos (Drizzle ORM)
 */

import { pgTable, uuid, text, timestamp, jsonb, real, customType } from 'drizzle-orm/pg-core';

// Vector type for pgvector
const vector = customType<{ data: number[] }>({
  dataType() {
    return 'vector(1536)';
  },
});

// 1. Working Memory (Memoria a corto plazo, logs de hooks)
export const workingMemory = pgTable('v3_working_memory', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: text('session_id').notNull(),
  agentId: text('agent_id').notNull(),
  toolName: text('tool_name'),
  observation: text('observation').notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at'), // Corta duración
});

// 2. Episodic Memory (Eventos comprimidos)
export const episodicMemory = pgTable('v3_episodic_memory', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: text('session_id').notNull(),
  summary: text('summary').notNull(),
  embedding: vector('embedding'),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  ebbinghausWeight: real('ebbinghaus_weight').default(1.0),
  createdAt: timestamp('created_at').defaultNow(),
  lastAccessedAt: timestamp('last_accessed_at').defaultNow(),
});

// 3. Semantic Memory (Hechos, reglas, conocimientos consolidados)
export const semanticMemory = pgTable('v3_semantic_memory', {
  id: uuid('id').defaultRandom().primaryKey(),
  concept: text('concept').notNull(),
  fact: text('fact').notNull(),
  embedding: vector('embedding'),
  confidence: real('confidence').default(1.0),
  sourceObservations: jsonb('source_observations').default([]), // IDs de episodic/working
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 4. Procedural Memory (Patrones, flujos de trabajo)
export const proceduralMemory = pgTable('v3_procedural_memory', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskType: text('task_type').notNull(),
  pattern: text('pattern').notNull(),
  successRate: real('success_rate').default(1.0),
  createdAt: timestamp('created_at').defaultNow(),
});

// 5. Agent Leases (Control de concurrencia multi-agente)
export const agentLeases = pgTable('v3_agent_leases', {
  id: uuid('id').defaultRandom().primaryKey(),
  resourceId: text('resource_id').notNull(),
  agentId: text('agent_id').notNull(),
  status: text('status').notNull(), // 'active', 'released'
  acquiredAt: timestamp('acquired_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});

// Type inference
export type WorkingMemory = typeof workingMemory.$inferSelect;
export type EpisodicMemory = typeof episodicMemory.$inferSelect;
export type SemanticMemory = typeof semanticMemory.$inferSelect;
export type ProceduralMemory = typeof proceduralMemory.$inferSelect;
export type AgentLease = typeof agentLeases.$inferSelect;
