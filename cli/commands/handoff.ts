/**
 * handoff.ts — Comando: `gestor-memory handoff`
 *
 * Actualiza .dev/handoffs/current-state.md y manifest.lastHandoff.
 * Convierte el "consejo" del Session End Protocol en un comando accionable.
 * --check: solo verifica si el handoff está desactualizado (para hooks).
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

function readManifest(projectDir: string): Record<string, unknown> {
  const p = path.join(projectDir, '.gestor-memory', 'manifest.json');
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return {}; }
}

function writeManifest(projectDir: string, data: Record<string, unknown>): void {
  const p = path.join(projectDir, '.gestor-memory', 'manifest.json');
  if (!fs.existsSync(path.dirname(p))) return;
  const existing = readManifest(projectDir);
  fs.writeFileSync(p, JSON.stringify({ ...existing, ...data }, null, 2));
}

export function handoffCommand(program: Command): void {
  program
    .command('handoff')
    .description('Actualizar el handoff de sesión (.dev/handoffs/current-state.md)')
    .option('--path <path>', 'Ruta del proyecto', '.')
    .option('--check', 'Solo verificar si el handoff está desactualizado (exit 1 si sí)')
    .action(async (options) => {
      const projectDir = path.resolve(options.path);
      const handoffDir = path.join(projectDir, '.dev', 'handoffs');
      const handoffPath = path.join(handoffDir, 'current-state.md');
      const manifest = readManifest(projectDir);

      // --check: para hooks automáticos
      if (options.check) {
        const lastHandoff = manifest['lastHandoff'] as string | undefined;
        if (!lastHandoff) {
          console.log(chalk.yellow('⚠  Handoff nunca actualizado. Ejecuta: gestor-memory handoff'));
          process.exit(1);
        }
        const ageHours = (Date.now() - new Date(lastHandoff).getTime()) / 3600000;
        if (ageHours > 24) {
          console.log(chalk.yellow(`⚠  Handoff desactualizado (${Math.round(ageHours)}h). Ejecuta: gestor-memory handoff`));
          process.exit(1);
        }
        console.log(chalk.green(`✓ Handoff al día (hace ${Math.round(ageHours)}h)`));
        return;
      }

      console.log('');
      console.log(chalk.cyan.bold('  Gestor_Memory — Session Handoff'));
      console.log(chalk.gray('  Actualiza el estado para el próximo agente/sesión'));
      console.log('');

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'lastCompleted',
          message: '¿Qué fue lo último que completaste?',
          validate: (v: string) => v.trim().length > 0 || 'Requerido',
        },
        {
          type: 'input',
          name: 'nextStep',
          message: '¿Cuál es el próximo paso exacto?',
          validate: (v: string) => v.trim().length > 0 || 'Requerido',
        },
        {
          type: 'input',
          name: 'modifiedFiles',
          message: '¿Qué archivos modificaste? (separados por coma)',
        },
        {
          type: 'input',
          name: 'decisions',
          message: '¿Alguna decisión importante tomada? (o Enter para omitir)',
        },
        {
          type: 'input',
          name: 'gotchas',
          message: '¿Algo que el próximo agente debe saber? (o Enter para omitir)',
        },
      ]);

      const now = new Date().toISOString();
      const content = `# Estado actual — Handoff de sesión
> Actualizado: ${now.split('T')[0]} · Gestor_Memory v3

## Último paso completado

${answers.lastCompleted}

## Próximo paso

${answers.nextStep}

## Archivos modificados

${answers.modifiedFiles
  ? answers.modifiedFiles.split(',').map((f: string) => `- \`${f.trim()}\``).join('\n')
  : '_(no especificados)_'}

## Decisiones tomadas

${answers.decisions || '_(ninguna)_'}

## Gotchas para el próximo agente

${answers.gotchas || '_(ninguno)_'}

---
*Generado con \`gestor-memory handoff\` · Modelo: ${process.env['GM_AGENT'] || 'desconocido'}*
`;

      fs.mkdirSync(handoffDir, { recursive: true });
      fs.writeFileSync(handoffPath, content);
      writeManifest(projectDir, { lastHandoff: now });

      console.log('');
      console.log(chalk.green.bold('  ✓ Handoff guardado'));
      console.log(chalk.gray(`  → ${path.relative(projectDir, handoffPath)}`));
      console.log('');
    });
}
