/**
 * apply.ts — Comando: `gestor-memory apply`
 *
 * Aplica/actualiza el ADN en el proyecto destino de forma idempotente:
 * - Registra el MCP en .mcp.json (merge, no pisa otros servers)
 * - Instala hooks de Claude Code en .claude/settings.json (merge)
 * - Genera/actualiza archivos de convención (AGENTS.md, CLAUDE.md, GEMINI.md, etc.)
 * - Si un archivo editado difiere del template → crea *.gm-new y avisa
 * - Segunda ejecución = 0 cambios
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Handlebars from 'handlebars';
import { writeBundle, Manifest } from '../lib/context-bundle';

// =============================================================
// HELPERS
// =============================================================

function readManifest(projectDir: string): Manifest | null {
  const p = path.join(projectDir, '.gestor-memory', 'manifest.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function mergeJson(filePath: string, patch: Record<string, unknown>): void {
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try { existing = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { /* start fresh */ }
  }
  const merged = deepMerge(existing, patch);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) &&
        typeof result[k] === 'object' && result[k] !== null && !Array.isArray(result[k])) {
      result[k] = deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function renderTemplate(templatePath: string, vars: Record<string, unknown>): string {
  const source = fs.readFileSync(templatePath, 'utf-8');
  return Handlebars.compile(source)(vars);
}

function writeConventionFile(filePath: string, content: string, log: string[]): void {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (existing === content) return; // idempotente
    // Si fue editado por un humano (no generado por gestor-memory), no pisar
    if (!existing.includes('Gestor_Memory')) {
      const newPath = filePath + '.gm-new';
      fs.writeFileSync(newPath, content);
      log.push(`  ${chalk.yellow('⚠')}  ${path.basename(filePath)} tiene contenido personalizado → nueva versión en ${path.basename(newPath)}`);
      return;
    }
  }
  fs.writeFileSync(filePath, content);
  log.push(`  ${chalk.green('✓')}  ${path.basename(filePath)}`);
}

// =============================================================
// MCP REGISTRATION (T4.1)
// =============================================================

function applyMcp(projectDir: string, log: string[]): void {
  const mcpPath = path.join(projectDir, '.mcp.json');
  // Buscar el dist del mcp-server de gestor-memory (ruta global)
  const mcpServerPath = path.resolve(__dirname, '../../mcp-server/index.js')
    .replace(/\\/g, '/');

  mergeJson(mcpPath, {
    mcpServers: {
      'gestor-memory': {
        command: 'node',
        args: [mcpServerPath],
        env: {
          GM_PROJECT_DIR: projectDir.replace(/\\/g, '/'),
        },
      },
    },
  });
  log.push(`  ${chalk.green('✓')}  .mcp.json — servidor gestor-memory registrado`);
}

// =============================================================
// CLAUDE CODE HOOKS (T4.2)
// =============================================================

function applyHooks(projectDir: string, log: string[]): void {
  const settingsPath = path.join(projectDir, '.claude', 'settings.json');
  const contextCmd = `node ${path.resolve(__dirname, '../../dist/cli/index.js').replace(/\\/g, '/')} context --brief --path "${projectDir.replace(/\\/g, '/')}"`;
  const handoffCmd = `node ${path.resolve(__dirname, '../../dist/cli/index.js').replace(/\\/g, '/')} handoff --check --path "${projectDir.replace(/\\/g, '/')}"`;

  mergeJson(settingsPath, {
    hooks: {
      SessionStart: [{ command: contextCmd }],
      Stop: [{ command: handoffCmd }],
    },
  });
  log.push(`  ${chalk.green('✓')}  .claude/settings.json — hooks SessionStart/Stop instalados`);
}

// =============================================================
// CONVENTION FILES (T2.2)
// =============================================================

function applyConventionFiles(projectDir: string, manifest: Manifest, log: string[]): void {
  const templatesDir = path.resolve(__dirname, '../templates');
  const vars = { dnaVersion: manifest.dnaVersion, project: manifest.project };
  const agents = manifest.agents || [];

  // AGENTS.md — siempre (es el universal)
  const agentsTpl = path.join(templatesDir, 'AGENTS.md.template');
  if (fs.existsSync(agentsTpl)) {
    writeConventionFile(path.join(projectDir, 'AGENTS.md'), renderTemplate(agentsTpl, vars), log);
  }

  // CLAUDE.md
  if (agents.includes('claude-code')) {
    const tpl = path.join(templatesDir, 'CLAUDE.md.template');
    if (fs.existsSync(tpl)) {
      writeConventionFile(path.join(projectDir, 'CLAUDE.md'), renderTemplate(tpl, vars), log);
    }
  }

  // GEMINI.md
  if (agents.includes('antigravity-gemini')) {
    const tpl = path.join(templatesDir, 'GEMINI.md.template');
    if (fs.existsSync(tpl)) {
      writeConventionFile(path.join(projectDir, 'GEMINI.md'), renderTemplate(tpl, vars), log);
    }
  }

  // .cursorrules (Cursor)
  if (agents.includes('cursor')) {
    const cursorContent = `# Cursor Rules — ${manifest.project}\nLee .gestor-memory/CONTEXT.md primero.\nSigue el protocolo de AGENTS.md.\nGenerado por Gestor_Memory v${manifest.dnaVersion}\n`;
    writeConventionFile(path.join(projectDir, '.cursorrules'), cursorContent, log);
  }

  // .windsurfrules (Windsurf)
  if (agents.includes('kilo')) {
    const windsurfContent = `# Windsurf Rules — ${manifest.project}\nLee .gestor-memory/CONTEXT.md primero.\nSigue el protocolo de AGENTS.md.\nGenerado por Gestor_Memory v${manifest.dnaVersion}\n`;
    writeConventionFile(path.join(projectDir, '.windsurfrules'), windsurfContent, log);
  }
}

// =============================================================
// COMANDO
// =============================================================

export function applyCommand(program: Command): void {
  program
    .command('apply')
    .description('Aplicar/actualizar el ADN en el proyecto destino (idempotente)')
    .option('--path <path>', 'Ruta del proyecto destino', '.')
    .action(async (options) => {
      const projectDir = path.resolve(options.path);

      console.log('');
      console.log(chalk.cyan.bold('  Gestor_Memory v3 — Apply'));
      console.log(chalk.gray(`  Proyecto: ${projectDir}`));
      console.log('');

      const manifest = readManifest(projectDir);
      if (!manifest) {
        console.error(chalk.red('  Error: no se encontró manifest.json. Ejecuta primero: gestor-memory interview'));
        process.exit(1);
      }

      const log: string[] = [];
      const spin = ora('Aplicando ADN...').start();

      // 1. Regenerar Context Bundle (CONTEXT.md, MAP.md — idempotente)
      writeBundle(projectDir, { ...manifest, updatedAt: new Date().toISOString() });
      log.push(`  ${chalk.green('✓')}  .gestor-memory/CONTEXT.md y MAP.md actualizados`);

      // 2. Archivos de convención
      applyConventionFiles(projectDir, manifest, log);

      // 3. MCP
      applyMcp(projectDir, log);

      // 4. Hooks (solo si enforcement: true)
      if (manifest.enforcement) {
        applyHooks(projectDir, log);
      }

      spin.stop();

      for (const line of log) console.log(line);

      console.log('');
      console.log(chalk.green.bold('  Apply completado'));
      console.log(chalk.gray('  Ejecuta: gestor-memory doctor  ← para verificar el estado completo'));
      console.log('');
    });
}
