/**
 * qa.ts — Comando: `gestor-memory qa`
 *
 * Pipeline de QA que ejecuta herramientas de testing:
 * - Snyk (seguridad de dependencias + SAST)
 * - TestSprite (E2E desde PRD)
 * - Newman/Postman (API tests)
 *
 * Genera reporte unificado en .dev/qa/
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import {
  detectQATools,
  runSnykScan,
  runSnykCodeScan,
  generateTestSpriteConfig,
  generatePostmanCollection,
  generateQAReport,
  runGraphAnalysis,
  QAResult,
} from '../lib/qa-pipeline';

export function qaCommand(program: Command): void {
  program
    .command('qa')
    .description('Ejecutar pipeline de calidad (Snyk, TestSprite, Postman)')
    .option('--snyk-only', 'Ejecutar solo Snyk')
    .option('--testsprite-only', 'Ejecutar solo TestSprite')
    .option('--postman-only', 'Ejecutar solo Postman')
    .option('--graph', 'Ejecutar análisis de grafo')
    .option('--full', 'Ejecutar todas las herramientas')
    .option('--path <path>', 'Ruta del proyecto', '.')
    .action(async (options) => {
      const projectDir = options.path === '.' ? process.cwd() : options.path;
      const results: QAResult[] = [];

      console.log('');
      console.log(chalk.cyan.bold('  🧪 Gestor_Memory v2 — Pipeline de QA'));
      console.log('');

      // Detectar herramientas
      const tools = detectQATools();
      console.log(chalk.white('  Herramientas detectadas:'));
      for (const tool of tools) {
        const status = tool.isInstalled
          ? chalk.green('✅')
          : chalk.red('❌');
        console.log(`    ${status} ${tool.name}`);
      }
      console.log('');

      const runAll = options.full || (!options.snykOnly && !options.testspriteOnly && !options.postmanOnly && !options.graph);

      // ── Snyk ──────────────────────────────────
      if (runAll || options.snykOnly) {
        console.log(chalk.cyan('═'.repeat(50)));
        console.log(chalk.cyan.bold('  🔒 Snyk — Análisis de Seguridad'));
        console.log(chalk.cyan('═'.repeat(50)));
        console.log('');

        const depSpinner = ora('Escaneando dependencias...').start();
        const depResult = runSnykScan(projectDir);
        if (depResult.status === 'success') {
          depSpinner.succeed(`Dependencias: ${depResult.summary}`);
        } else if (depResult.status === 'warning') {
          depSpinner.warn(`Dependencias: ${depResult.summary}`);
        } else if (depResult.status === 'skipped') {
          depSpinner.info(`Dependencias: ${depResult.summary}`);
        } else {
          depSpinner.fail(`Dependencias: ${depResult.summary}`);
        }
        results.push(depResult);

        const codeSpinner = ora('Análisis de código (SAST)...').start();
        const codeResult = runSnykCodeScan(projectDir);
        if (codeResult.status === 'success') {
          codeSpinner.succeed(`Código: ${codeResult.summary}`);
        } else {
          codeSpinner.info(`Código: ${codeResult.summary}`);
        }
        results.push(codeResult);

        console.log('');
      }

      // ── TestSprite ────────────────────────────
      if (runAll || options.testspriteOnly) {
        console.log(chalk.cyan('═'.repeat(50)));
        console.log(chalk.cyan.bold('  🧪 TestSprite — Testing E2E desde PRD'));
        console.log(chalk.cyan('═'.repeat(50)));
        console.log('');

        const tsSpinner = ora('Configurando TestSprite...').start();
        const tsResult = generateTestSpriteConfig(projectDir);
        if (tsResult.status === 'success') {
          tsSpinner.succeed(tsResult.summary);
          console.log(chalk.gray('  Para ejecutar tests E2E:'));
          console.log(chalk.gray('  → En tu IDE: "Help me test this project with TestSprite"'));
          console.log(chalk.gray('  → TestSprite leerá .dev/prd.md y generará scripts'));
        } else {
          tsSpinner.info(tsResult.summary);
        }
        results.push(tsResult);

        console.log('');
      }

      // ── Postman ───────────────────────────────
      if (runAll || options.postmanOnly) {
        console.log(chalk.cyan('═'.repeat(50)));
        console.log(chalk.cyan.bold('  📮 Postman — Colección API'));
        console.log(chalk.cyan('═'.repeat(50)));
        console.log('');

        const pmSpinner = ora('Generando colección Postman...').start();
        const projectName = require('path').basename(projectDir);
        const pmResult = generatePostmanCollection(projectDir, projectName);
        pmSpinner.succeed(pmResult.summary);
        results.push(pmResult);

        console.log('');
      }

      // ── Graph Analysis ────────────────────────
      if (runAll || options.graph) {
        console.log(chalk.cyan('═'.repeat(50)));
        console.log(chalk.cyan.bold('  🕸️ Graph Analysis — Auditoría Arquitectónica'));
        console.log(chalk.cyan('═'.repeat(50)));
        console.log('');

        const graphSpinner = ora('Analizando grafo de conocimiento...').start();
        const graphResult = await runGraphAnalysis(projectDir);
        
        if (graphResult.status === 'success') {
          graphSpinner.succeed(graphResult.summary);
        } else if (graphResult.status === 'warning') {
          graphSpinner.warn(graphResult.summary);
        } else {
          graphSpinner.info(graphResult.summary);
        }
        results.push(graphResult);

        console.log('');
      }

      // ── Reporte ───────────────────────────────
      if (results.length > 0) {
        console.log(chalk.cyan('═'.repeat(50)));
        console.log(chalk.cyan.bold('  📊 Reporte Unificado'));
        console.log(chalk.cyan('═'.repeat(50)));
        console.log('');

        const reportPath = generateQAReport(projectDir, results);
        console.log(chalk.green(`  ✅ Reporte guardado en: ${reportPath}`));
        console.log('');

        // Resumen
        console.log(chalk.white('  Resumen:'));
        for (const r of results) {
          const emoji = r.status === 'success' ? '✅' :
                        r.status === 'warning' ? '⚠️' :
                        r.status === 'error' ? '❌' : '⏭️';
          console.log(`    ${emoji} ${r.tool}: ${r.summary}`);
        }
        console.log('');
      }
    });
}
