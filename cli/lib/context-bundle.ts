/**
 * context-bundle.ts — Genera y actualiza el ADN portable del proyecto.
 *
 * Archivos producidos en .gestor-memory/:
 *   CONTEXT.md   — Tier 1 (≤2000 tokens): resumen maestro que cualquier LLM lee primero
 *   MAP.md       — Tier 2: árbol de carpetas con propósito de cada entrada
 *   decisions.md — Registro de decisiones ADR (append-only, nunca se reescribe)
 */

import * as fs from 'fs';
import * as path from 'path';
import { isDenied } from '../../core/engine/ingest';

// =============================================================
// TIPOS
// =============================================================

export interface Manifest {
  dnaVersion: string;
  project: string;
  projectType?: string;
  stage?: string;
  purpose?: string;
  domains?: string[];
  stack?: Record<string, string>;
  agents?: string[];
  primaryModel?: string;
  embeddings?: string;
  excludePaths?: string[];
  enforcement?: boolean;
  obsidian?: string;
  nextMilestone?: string;
  createdAt: string;
  updatedAt: string;
  lastZumo?: string;
  lastHandoff?: string;
}

// =============================================================
// CONTEXT.md (Tier 1) — límite ≈8 KB / ~2000 tokens
// =============================================================

export function generateContext(manifest: Manifest, projectDir: string): string {
  const modelGuide = buildModelGuide(manifest);
  const stackStr = manifest.stack
    ? Object.entries(manifest.stack).map(([k, v]) => `  - ${k}: ${v}`).join('\n')
    : '  (ejecuta gestor-memory init para detectar el stack)';

  const domains = (manifest.domains || []).join(', ') || '(sin definir)';
  const milestone = manifest.nextMilestone || '(sin definir — ejecuta gestor-memory interview)';

  return `# CONTEXT.md — ADN del Proyecto
> **Tier 1 · Lee este archivo primero.** ≤2000 tokens.
> Generado por Gestor_Memory v${manifest.dnaVersion} · Actualizado: ${manifest.updatedAt.split('T')[0]}

---

## ¿Qué es este proyecto?

**Nombre:** ${manifest.project}
**Tipo:** ${manifest.projectType || '(sin definir)'}
**Etapa:** ${manifest.stage || '(sin definir)'}

${manifest.purpose || '_Propósito no definido. Ejecuta `gestor-memory interview` para completarlo._'}

---

## Dominios / Módulos principales

${domains}

---

## Stack técnico

${stackStr}

---

## Próximo hito

${milestone}

---

## Reglas para cualquier agente IA

${modelGuide}

---

## Protocolo de sesión (SIEMPRE)

**Al iniciar:**
1. Lee este archivo (ya lo estás leyendo ✓)
2. Lee \`.dev/handoffs/current-state.md\` para ver el estado exacto
3. Si necesitas más contexto: lee \`.gestor-memory/MAP.md\` (Tier 2)
4. Para buscar en el codebase: usa \`mem-search\` (MCP) o \`gestor-memory ask\`
5. Anuncia: "Retomando desde [estado]. Próximo paso: [hito]."

**Al terminar:**
\`\`\`
gestor-memory handoff
\`\`\`
No es opcional. Es lo que hace posible el multi-agente.

---

## ¿Cómo pedir más contexto?

| Necesito | Qué leer |
|:---------|:---------|
| Estructura de carpetas y propósito | \`.gestor-memory/MAP.md\` |
| Historial de decisiones | \`.gestor-memory/decisions.md\` |
| Grafo de conocimiento | \`.gestor-memory/graph/summary.md\` |
| Buscar algo específico | MCP: \`mem-search "consulta"\` |
| PRD completo | \`.dev/prd.md\` |
| Roadmap detallado | \`.dev/roadmap.md\` o \`roadmap.md\` |

---
*Ecosistema ALIANED · Gestor_Memory v${manifest.dnaVersion}*
`;
}

function buildModelGuide(manifest: Manifest): string {
  const agents = manifest.agents || [];
  const primaryModel = manifest.primaryModel || 'mixto';

  const defaults = [
    '- **Auditoría / seguridad / decisiones críticas** → Claude (Auditor ALIHA)',
    '- **Contexto amplio / research / Google ecosystem** → Gemini',
    '- **Volumen / boilerplate / tareas rutinarias** → Qwen / Kimi / DeepSeek (vía OpenRouter)',
  ];

  const tierNote = primaryModel === 'economico'
    ? '> Presupuesto económico: usa modelos abiertos para el 80% del trabajo; escala a Claude solo para auditoría final.'
    : primaryModel === 'premium'
    ? '> Presupuesto premium: todos los modelos disponibles según especialización.'
    : '> Presupuesto mixto: Claude para auditoría, modelos abiertos para construcción.';

  const toolNote = agents.length > 0
    ? `Herramientas IA configuradas en este proyecto: ${agents.join(', ')}.`
    : '';

  return [tierNote, ...defaults, toolNote].filter(Boolean).join('\n');
}

// =============================================================
// MAP.md (Tier 2) — árbol de carpetas con propósito
// =============================================================

const KNOWN_DIRS: Record<string, string> = {
  '.gestor-memory': 'ADN del proyecto — CONTEXT.md, MAP.md, grafo de conocimiento',
  '.dev': 'Entorno de desarrollo (gitignored) — PRD, roadmap, specs, handoffs, QA',
  'src': 'Código fuente principal',
  'app': 'Aplicación principal (Next.js/React/etc.)',
  'pages': 'Páginas (Next.js pages router)',
  'components': 'Componentes reutilizables de UI',
  'lib': 'Utilidades y helpers',
  'api': 'Endpoints y lógica de API',
  'core': 'Módulos de negocio centrales',
  'cli': 'Interfaz de línea de comandos',
  'mcp-server': 'Servidor MCP (Model Context Protocol)',
  'tests': 'Tests automatizados',
  'test': 'Tests automatizados',
  '__tests__': 'Tests automatizados',
  'docs': 'Documentación técnica',
  'scripts': 'Scripts de utilidad / automatización',
  'public': 'Archivos estáticos públicos',
  'prisma': 'Schema y migraciones de Prisma ORM',
  'supabase': 'Configuración y migraciones de Supabase',
  'migrations': 'Migraciones de base de datos',
  'templates': 'Plantillas generadas por el CLI',
  'dist': 'Build compilado (gitignored)',
  'node_modules': 'Dependencias npm (gitignored)',
  'visualizer': 'Visualizador del grafo de conocimiento',
};

export function generateMap(projectDir: string, manifest: Manifest): string {
  const lines: string[] = [
    `# MAP.md — Estructura del Proyecto`,
    `> **Tier 2.** Lee si Tier 1 no es suficiente para entender dónde está algo.`,
    `> Actualizado: ${manifest.updatedAt.split('T')[0]}`,
    ``,
    `## Archivos raíz importantes`,
    ``,
  ];

  // Archivos raíz conocidos
  const rootFiles = [
    ['AGENTS.md', 'Protocolo para TODOS los agentes IA (leer primero)'],
    ['CLAUDE.md', 'Configuración específica para Claude Code'],
    ['GEMINI.md', 'Configuración específica para Gemini/Antigravity'],
    ['.cursorrules', 'Reglas para Cursor IDE'],
    ['.windsurfrules', 'Reglas para Windsurf IDE'],
    ['roadmap.md', 'Roadmap público del proyecto'],
    ['package.json', 'Dependencias y scripts npm'],
  ];
  for (const [file, desc] of rootFiles) {
    if (fs.existsSync(path.join(projectDir, file))) {
      lines.push(`- \`${file}\` — ${desc}`);
    }
  }

  lines.push('', '## Estructura de carpetas', '');
  lines.push('```');

  // Árbol de primer nivel (no recursivo para mantener Tier 2 legible)
  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !isDenied(path.join(projectDir, e.name)))
      .filter(e => !e.name.startsWith('.') || ['.gestor-memory', '.dev'].includes(e.name));

    for (const entry of entries) {
      const known = KNOWN_DIRS[entry.name];
      const subCount = countChildren(path.join(projectDir, entry.name));
      const note = known ? ` ← ${known}` : subCount > 0 ? ` (${subCount} entradas)` : ' (?)';
      lines.push(`${entry.name}/${note}`);
    }
  } catch { /* ignore */ }

  lines.push('```', '');

  // Carpeta .gestor-memory expandida
  lines.push('## .gestor-memory/ (el ADN)', '');
  lines.push('```');
  lines.push('.gestor-memory/');
  lines.push('  manifest.json     ← config + respuestas entrevista + timestamps');
  lines.push('  CONTEXT.md        ← Tier 1: resumen maestro (≤2000 tokens)');
  lines.push('  MAP.md            ← Tier 2: este archivo');
  lines.push('  decisions.md      ← registro de decisiones (ADR ligero, append-only)');
  lines.push('  graph/');
  lines.push('    nodes.json      ← nodos del grafo de conocimiento');
  lines.push('    edges.json      ← aristas tipadas (imports, links_to, mentions...)');
  lines.push('    summary.md      ← análisis legible del grafo');
  lines.push('  cache/            ← gitignored: memory.db SQLite + embeddings');
  lines.push('```', '');

  lines.push('## .dev/ (gitignored — estado de trabajo)', '');
  lines.push('```');
  lines.push('.dev/');
  lines.push('  prd.md                      ← requisitos del producto');
  lines.push('  roadmap.md                  ← hitos y sprint actual');
  lines.push('  stack-analysis.md           ← stack detectado');
  lines.push('  handoffs/');
  lines.push('    current-state.md          ← QUÉ se hizo y QUÉ sigue (actualizar al cerrar)');
  lines.push('  specs/                      ← especificaciones de features');
  lines.push('  qa/                         ← resultados de tests');
  lines.push('```', '');

  lines.push('---');
  lines.push(`*Gestor_Memory v${manifest.dnaVersion} · Ecosistema ALIANED*`);

  return lines.join('\n');
}

function countChildren(dir: string): number {
  try { return fs.readdirSync(dir).length; } catch { return 0; }
}

// =============================================================
// decisions.md — solo se crea si no existe (append-only)
// =============================================================

export function ensureDecisions(gmDir: string, projectName: string): void {
  const p = path.join(gmDir, 'decisions.md');
  if (fs.existsSync(p)) return;
  fs.writeFileSync(p, `# Decisiones del Proyecto — ${projectName}

> Registro ADR ligero. Los agentes hacen APPEND, nunca reescriben.
> Formato sugerido por entrada:

---

## [YYYY-MM-DD] Título de la decisión

**Contexto:** por qué surgió esta decisión.
**Decisión:** qué se decidió.
**Consecuencias:** qué cambia a partir de esto.

---
`);
}

// =============================================================
// WRITE BUNDLE — escribe los 3 archivos en .gestor-memory/
// =============================================================

export function writeBundle(projectDir: string, manifest: Manifest): void {
  const gmDir = path.join(projectDir, '.gestor-memory');
  fs.mkdirSync(gmDir, { recursive: true });
  fs.mkdirSync(path.join(gmDir, 'graph'), { recursive: true });

  fs.writeFileSync(path.join(gmDir, 'CONTEXT.md'), generateContext(manifest, projectDir));
  fs.writeFileSync(path.join(gmDir, 'MAP.md'), generateMap(projectDir, manifest));
  ensureDecisions(gmDir, manifest.project);
}
