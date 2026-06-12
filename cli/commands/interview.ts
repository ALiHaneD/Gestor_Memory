/**
 * interview.ts — Comando: `gestor-memory interview`
 *
 * 12 preguntas guiadas → manifest.json + Context Bundle sembrado.
 * Re-ejecutable: actualiza manifest sin destruir decisions.md ni el grafo.
 * Modo no-interactivo: --answers answers.json (para agentes IA).
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { detectProject } from '../lib/detector';
import { resolveProvider } from '../../core/embeddings/provider';
import { writeBundle, Manifest } from '../lib/context-bundle';

// =============================================================
// HELPERS
// =============================================================

function readManifest(projectDir: string): Partial<Manifest> {
  const p = path.join(projectDir, '.gestor-memory', 'manifest.json');
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return {}; }
}

function saveManifest(projectDir: string, manifest: Manifest): void {
  const gmDir = path.join(projectDir, '.gestor-memory');
  fs.mkdirSync(gmDir, { recursive: true });
  fs.writeFileSync(path.join(gmDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// =============================================================
// PREGUNTAS DE LA ENTREVISTA (las 12 del plan)
// =============================================================

async function runInterview(projectDir: string, existing: Partial<Manifest>): Promise<Manifest> {
  const profile = detectProject(projectDir);
  const raw = profile?.stack || {};
  const detectedStack: Record<string, string> = {
    runtime: raw.runtime || 'unknown',
    ...(raw.framework ? { framework: raw.framework } : {}),
    ...(raw.language ? { language: raw.language } : {}),
  };
  const stackStr = Object.entries(detectedStack).map(([k, v]) => `${k}:${v}`).join(', ') || 'no detectado';

  // Detectar proveedor de embeddings disponible
  const embSpin = ora('Detectando proveedor de embeddings...').start();
  const provider = await resolveProvider();
  embSpin.succeed(`Proveedor detectado: ${provider.name}${provider.isKeywordOnly ? ' (solo keyword)' : ''}`);

  console.log('');
  console.log(chalk.cyan('  Responde las siguientes preguntas para configurar el ADN del proyecto.'));
  console.log(chalk.gray('  Puedes re-ejecutar esta entrevista en cualquier momento para actualizar.'));
  console.log('');

  const answers = await inquirer.prompt([
    // P1 — Tipo de proyecto
    {
      type: 'list',
      name: 'projectType',
      message: '1. ¿Qué estás construyendo?',
      choices: [
        { name: 'App web (Next.js, React, Vue, etc.)', value: 'app-web' },
        { name: 'Módulo ERP / Odoo', value: 'modulo-erp' },
        { name: 'API / Backend', value: 'api-backend' },
        { name: 'Base de datos / schema', value: 'base-de-datos' },
        { name: 'Skill / Tool / Plugin IA', value: 'skill-tool' },
        { name: 'Agente IA completo', value: 'agente-ia' },
        { name: 'Contenido / marketing', value: 'contenido' },
        { name: 'Otro', value: 'otro' },
      ],
      default: existing.projectType || 'app-web',
    },

    // P2 — Etapa
    {
      type: 'list',
      name: 'stage',
      message: '2. ¿En qué etapa está el proyecto?',
      choices: [
        { name: 'Idea (partiendo desde cero)', value: 'idea' },
        { name: 'Desarrollo activo', value: 'desarrollo' },
        { name: 'Producción (con usuarios)', value: 'produccion' },
        { name: 'Mantenimiento', value: 'mantenimiento' },
      ],
      default: existing.stage || 'desarrollo',
    },

    // P3 — Propósito (para CONTEXT.md §1)
    {
      type: 'input',
      name: 'purpose',
      message: '3. Describe en 1-2 frases qué hace y para quién:',
      default: existing.purpose || '',
      validate: (v: string) => v.trim().length > 0 || 'Este campo es requerido',
    },

    // P4 — Dominios (para aristas mentions del grafo)
    {
      type: 'input',
      name: 'domainsRaw',
      message: '4. Módulos o dominios principales (separados por coma, ej: ventas,auth,inventario):',
      default: (existing.domains || []).join(','),
    },

    // P5 — Stack (confirmar autodetección)
    {
      type: 'confirm',
      name: 'stackCorrect',
      message: `5. Stack detectado: [${stackStr}]. ¿Es correcto?`,
      default: true,
    },
    {
      type: 'input',
      name: 'stackExtra',
      message: '   Stack correcto o adicional (ej: "frontend:Next.js,db:PostgreSQL"):',
      when: (ans: any) => !ans.stackCorrect,
      default: stackStr,
    },

    // P6 — Herramientas IA (decide qué punteros generar)
    {
      type: 'checkbox',
      name: 'agents',
      message: '6. ¿Qué herramientas IA trabajarán en este proyecto?',
      choices: [
        { name: 'Claude Code', value: 'claude-code', checked: true },
        { name: 'Antigravity (Gemini CLI)', value: 'antigravity-gemini', checked: true },
        { name: 'GPT / Codex', value: 'gpt-codex' },
        { name: 'DeepSeek', value: 'deepseek' },
        { name: 'Kimi', value: 'kimi' },
        { name: 'Qwen-Code', value: 'qwen-code' },
        { name: 'Kilo', value: 'kilo' },
        { name: 'Cursor', value: 'cursor' },
        { name: 'OpenRouter (genérico)', value: 'openrouter' },
      ],
      default: existing.agents || ['claude-code', 'antigravity-gemini'],
    },

    // P7 — Presupuesto de tokens / modelo principal
    {
      type: 'list',
      name: 'primaryModel',
      message: '7. ¿Cuál es el presupuesto de tokens / modelo principal?',
      choices: [
        {
          name: 'Premium — Claude/Gemini para todo (máxima calidad)',
          value: 'premium',
        },
        {
          name: 'Mixto — Claude para auditoría, modelos abiertos para construcción (recomendado)',
          value: 'mixto',
        },
        {
          name: 'Económico — modelos abiertos (Qwen/Kimi/DeepSeek) para el 80%, Claude solo al final',
          value: 'economico',
        },
      ],
      default: existing.primaryModel || 'mixto',
    },

    // P8 — Proveedor de embeddings
    {
      type: 'list',
      name: 'embeddings',
      message: `8. Proveedor de embeddings para el grafo (detectado: ${provider.name}):`,
      choices: [
        { name: 'Ollama local — nomic-embed-text (gratis, recomendado)', value: 'ollama' },
        { name: 'Gemini API — text-embedding-004 (requiere GEMINI_API_KEY)', value: 'gemini' },
        { name: 'OpenAI API — text-embedding-3-small (requiere OPENAI_API_KEY)', value: 'openai' },
        { name: 'Sin embeddings — solo búsqueda keyword (FTS5)', value: 'none' },
      ],
      default: provider.isKeywordOnly ? 'none' : provider.name,
    },

    // P9 — Rutas a excluir de la ingesta
    {
      type: 'input',
      name: 'excludePathsRaw',
      message: '9. Carpetas con secretos o material que la IA NO debe indexar (separadas por coma, o Enter para omitir):',
      default: (existing.excludePaths || []).join(','),
    },

    // P10 — Enforcement (hooks automáticos)
    {
      type: 'confirm',
      name: 'enforcement',
      message: '10. ¿Instalar hooks automáticos en Claude Code? (inyecta contexto al inicio de sesión, recuerda el handoff)',
      default: existing.enforcement !== undefined ? existing.enforcement : true,
    },

    // P11 — Obsidian
    {
      type: 'confirm',
      name: 'obsidianEnabled',
      message: '11. ¿Sincronizar con un vault de Obsidian?',
      default: !!existing.obsidian,
    },
    {
      type: 'input',
      name: 'obsidian',
      message: '    Ruta del vault de Obsidian:',
      when: (ans: any) => ans.obsidianEnabled,
      default: existing.obsidian || '',
    },

    // P12 — Próximo hito
    {
      type: 'input',
      name: 'nextMilestone',
      message: '12. ¿Cuál es el próximo hito concreto?',
      default: existing.nextMilestone || '',
      validate: (v: string) => v.trim().length > 0 || 'Requerido — ayuda a sembrar el roadmap',
    },
  ]);

  // Construir stack final
  let stack: Record<string, string> = detectedStack;
  if (!answers.stackCorrect && answers.stackExtra) {
    stack = {};
    for (const part of answers.stackExtra.split(',')) {
      const [k, v] = part.split(':');
      if (k && v) stack[k.trim()] = v.trim();
    }
  }

  const now = new Date().toISOString();
  const manifest: Manifest = {
    dnaVersion: '3.0.0',
    project: path.basename(projectDir),
    projectType: answers.projectType,
    stage: answers.stage,
    purpose: answers.purpose,
    domains: answers.domainsRaw
      ? answers.domainsRaw.split(',').map((d: string) => d.trim()).filter(Boolean)
      : [],
    stack,
    agents: answers.agents,
    primaryModel: answers.primaryModel,
    embeddings: answers.embeddings,
    excludePaths: answers.excludePathsRaw
      ? answers.excludePathsRaw.split(',').map((p: string) => p.trim()).filter(Boolean)
      : [],
    enforcement: answers.enforcement,
    obsidian: answers.obsidianEnabled ? answers.obsidian : undefined,
    nextMilestone: answers.nextMilestone,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    lastZumo: existing.lastZumo as string | undefined,
    lastHandoff: existing.lastHandoff as string | undefined,
  };

  return manifest;
}

// =============================================================
// COMANDO
// =============================================================

export function interviewCommand(program: Command): void {
  program
    .command('interview')
    .description('Entrevista guiada para configurar el ADN del proyecto (12 preguntas)')
    .option('--path <path>', 'Ruta del proyecto', '.')
    .option('--answers <file>', 'Modo no-interactivo: cargar respuestas desde JSON')
    .action(async (options) => {
      const projectDir = path.resolve(options.path);
      const existing = readManifest(projectDir);

      console.log('');
      console.log(chalk.cyan.bold('  Gestor_Memory v3 — Configuración del Proyecto (ADN)'));
      console.log('');

      let manifest: Manifest;

      if (options.answers) {
        // Modo no-interactivo (para agentes IA)
        if (!fs.existsSync(options.answers)) {
          console.error(chalk.red(`Error: no se encontró el archivo ${options.answers}`));
          process.exit(1);
        }
        const loaded = JSON.parse(fs.readFileSync(options.answers, 'utf-8'));
        const now = new Date().toISOString();
        manifest = {
          dnaVersion: '3.0.0',
          project: path.basename(projectDir),
          createdAt: existing.createdAt || now,
          updatedAt: now,
          ...loaded,
        } as Manifest;
      } else {
        manifest = await runInterview(projectDir, existing);
      }

      // Guardar manifest
      const saveSpin = ora('Guardando manifest.json...').start();
      saveManifest(projectDir, manifest);
      saveSpin.succeed('manifest.json guardado');

      // Generar Context Bundle
      const bundleSpin = ora('Generando CONTEXT.md y MAP.md...').start();
      writeBundle(projectDir, manifest);
      bundleSpin.succeed('Context Bundle generado (.gestor-memory/)');

      // Sembrar current-state.md inicial si no existe
      const handoffPath = path.join(projectDir, '.dev', 'handoffs', 'current-state.md');
      if (!fs.existsSync(handoffPath)) {
        fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
        fs.writeFileSync(handoffPath, `# Estado actual\n> Inicializado por gestor-memory interview · ${new Date().toISOString().split('T')[0]}\n\n## Próximo paso\n\n${manifest.nextMilestone}\n\n## Historial\n\n- Proyecto inicializado con Gestor_Memory v3.\n`);
        console.log(chalk.gray('  → .dev/handoffs/current-state.md creado'));
      }

      // Si proyecto existente (no idea), ofrecer zumo automático
      if (manifest.stage !== 'idea') {
        const { runZumo } = await inquirer.prompt([{
          type: 'confirm',
          name: 'runZumo',
          message: 'Proyecto existente detectado. ¿Ejecutar zumo ahora para construir el grafo?',
          default: true,
        }]);

        if (runZumo) {
          const { zumoCommand } = await import('./zumo');
          const { Command: Cmd } = await import('commander');
          const tempProg = new Cmd();
          zumoCommand(tempProg);
          await tempProg.parseAsync(['node', 'gestor-memory', 'zumo', '--path', projectDir]);
        }
      }

      console.log('');
      console.log(chalk.green.bold('  ADN configurado'));
      console.log(chalk.gray('  .gestor-memory/CONTEXT.md    ← Tier 1 (cualquier IA lee esto primero)'));
      console.log(chalk.gray('  .gestor-memory/MAP.md         ← Tier 2 (estructura)'));
      console.log(chalk.gray('  .gestor-memory/manifest.json  ← Configuración completa'));
      if (manifest.enforcement) {
        console.log(chalk.gray('  Ejecuta: gestor-memory apply --path ' + projectDir + '  ← instala hooks + MCP'));
      }
      console.log('');
    });
}
