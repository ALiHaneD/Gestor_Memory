#!/usr/bin/env node
/**
 * Gestor_Memory v3 — ADN ALIANED
 *
 *   gestor-memory interview     → Entrevista guiada (12 preguntas → manifest.json + bundle)
 *   gestor-memory init          → Inicializar estructura del proyecto
 *   gestor-memory zumo          → Construir grafo de conocimiento real
 *   gestor-memory handoff       → Actualizar handoff de sesión
 *   gestor-memory apply         → Aplicar/actualizar ADN en proyecto existente
 *   gestor-memory doctor        → Verificar estado del circuito completo
 *   gestor-memory qa            → Pipeline QA (Snyk/TestSprite/Postman)
 *   gestor-memory obsidian      → Sincronización con Obsidian
 *   gestor-memory status        → Estado del sistema
 *   gestor-memory sync          → Sincronizar con DB externa
 */

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { qaCommand } from './commands/qa';
import { obsidianCommand } from './commands/obsidian';
import { statusCommand } from './commands/status';
import { syncCommand } from './commands/sync';
import { zumoCommand } from './commands/zumo';
import { handoffCommand } from './commands/handoff';
import { interviewCommand } from './commands/interview';
import { applyCommand } from './commands/apply';
import { doctorCommand } from './commands/doctor';

const program = new Command();

program
  .name('gestor-memory')
  .description('Gestor_Memory v3 — ADN ALIANED: memoria portátil para cualquier LLM')
  .version('3.0.0');

interviewCommand(program);
initCommand(program);
zumoCommand(program);
handoffCommand(program);
applyCommand(program);
doctorCommand(program);
qaCommand(program);
obsidianCommand(program);
statusCommand(program);
syncCommand(program);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
