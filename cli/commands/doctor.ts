/**
 * doctor.ts — Comando: `gestor-memory doctor`
 *
 * Verifica el circuito completo del ADN y reporta semáforo verde/amarillo/rojo.
 * Exit code 1 si hay items en rojo (usable en CI).
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { createStorage } from '../../core/storage/local';
import { resolveProvider } from '../../core/embeddings/provider';

interface CheckResult {
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

function check(label: string, ok: boolean, detail: string, warnOnly = false): CheckResult {
  return { label, status: ok ? 'ok' : warnOnly ? 'warn' : 'fail', detail };
}

export function doctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Verificar el estado completo del ADN ALIANED (semáforo verde/amarillo/rojo)')
    .option('--path <path>', 'Ruta del proyecto', '.')
    .action(async (options) => {
      const projectDir = path.resolve(options.path);
      const gmDir = path.join(projectDir, '.gestor-memory');
      const results: CheckResult[] = [];

      console.log('');
      console.log(chalk.cyan.bold('  Gestor_Memory v3 — Doctor'));
      console.log(chalk.gray(`  Proyecto: ${projectDir}`));
      console.log('');

      // 1. Manifest válido y dnaVersion 3.x
      const manifestPath = path.join(gmDir, 'manifest.json');
      let manifest: Record<string, unknown> = {};
      let manifestOk = false;
      if (fs.existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          manifestOk = typeof manifest['dnaVersion'] === 'string' && manifest['dnaVersion'].startsWith('3.');
        } catch { /* fail */ }
      }
      results.push(check('manifest.json válido (dnaVersion 3.x)', manifestOk,
        manifestOk ? `v${manifest['dnaVersion']}` : 'Falta o incompleto — ejecuta: gestor-memory interview'));

      // 2. CONTEXT.md existe y no está vacío
      const contextPath = path.join(gmDir, 'CONTEXT.md');
      const contextOk = fs.existsSync(contextPath) && fs.statSync(contextPath).size > 100;
      results.push(check('CONTEXT.md (Tier 1) presente', contextOk,
        contextOk ? `${fs.existsSync(contextPath) ? Math.round(fs.statSync(contextPath).size / 1024) : 0} KB` : 'Falta — ejecuta: gestor-memory interview'));

      // 3. MAP.md existe
      const mapOk = fs.existsSync(path.join(gmDir, 'MAP.md'));
      results.push(check('MAP.md (Tier 2) presente', mapOk,
        mapOk ? 'OK' : 'Falta — ejecuta: gestor-memory interview', true));

      // 4. Grafo poblado con aristas tipadas
      const nodesPath = path.join(gmDir, 'graph', 'nodes.json');
      const edgesPath = path.join(gmDir, 'graph', 'edges.json');
      let graphOk = false;
      let edgeTypeOk = false;
      let nodeCount = 0;
      let edgeCount = 0;
      if (fs.existsSync(nodesPath) && fs.existsSync(edgesPath)) {
        try {
          const nodes = JSON.parse(fs.readFileSync(nodesPath, 'utf-8'));
          const edges = JSON.parse(fs.readFileSync(edgesPath, 'utf-8'));
          nodeCount = nodes.length;
          edgeCount = edges.length;
          graphOk = nodeCount > 0;
          const realTypes = ['imports', 'links_to', 'mentions', 'similar_to'];
          edgeTypeOk = edges.some((e: any) => realTypes.includes(e.relationship));
        } catch { /* fail */ }
      }
      results.push(check('Grafo poblado (nodos > 0)', graphOk,
        graphOk ? `${nodeCount} nodos, ${edgeCount} aristas` : 'Vacío — ejecuta: gestor-memory zumo'));
      results.push(check('Aristas tipadas reales (no solo related_to)', edgeTypeOk,
        edgeTypeOk ? 'OK' : 'Solo aristas genéricas o sin aristas — re-ejecuta: gestor-memory zumo', true));

      // 5. Proveedor de embeddings
      const provider = await resolveProvider();
      const embOk = !provider.isKeywordOnly;
      results.push(check('Proveedor de embeddings activo', embOk,
        embOk ? provider.name : 'Modo keyword únicamente — instala Ollama o configura GEMINI_API_KEY', true));

      // 6. SQLite cache consistente con JSON
      let dbOk = false;
      let dbDetail = 'cache no encontrado — ejecuta: gestor-memory zumo (reconstruye con --rebuild)';
      const dbPath = path.join(gmDir, 'cache', 'memory.db');
      if (fs.existsSync(dbPath) && graphOk) {
        try {
          const storage = createStorage(projectDir);
          const dbNodes = storage.nodeCount();
          const diff = Math.abs(dbNodes - nodeCount);
          dbOk = diff < 5; // tolerancia pequeña
          dbDetail = dbOk ? `${dbNodes} nodos en DB` : `Desincronizado (JSON:${nodeCount} vs DB:${dbNodes}) — ejecuta: gestor-memory zumo --rebuild`;
        } catch (e: any) {
          dbDetail = `Error al leer DB: ${e.message}`;
        }
      }
      results.push(check('SQLite consistente con graph/nodes.json', dbOk,
        dbDetail, !graphOk));

      // 7. MCP registrado en .mcp.json
      const mcpPath = path.join(projectDir, '.mcp.json');
      let mcpOk = false;
      if (fs.existsSync(mcpPath)) {
        try {
          const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
          mcpOk = !!(mcp?.mcpServers?.['gestor-memory'] || mcp?.servers?.['gestor-memory']);
        } catch { /* fail */ }
      }
      results.push(check('MCP registrado en .mcp.json', mcpOk,
        mcpOk ? 'OK' : 'Falta — ejecuta: gestor-memory apply', true));

      // 8. Hooks de Claude Code instalados
      const hooksPath = path.join(projectDir, '.claude', 'settings.json');
      let hooksOk = false;
      if (fs.existsSync(hooksPath)) {
        try {
          const settings = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
          hooksOk = !!settings?.hooks?.SessionStart;
        } catch { /* fail */ }
      }
      results.push(check('Hook SessionStart instalado (.claude/settings.json)', hooksOk,
        hooksOk ? 'OK' : 'Falta — ejecuta: gestor-memory apply', true));

      // 9. Handoff reciente (<7 días)
      const lastHandoff = manifest['lastHandoff'] as string | undefined;
      let handoffOk = false;
      let handoffDetail = 'Sin handoff registrado — ejecuta: gestor-memory handoff al cerrar sesión';
      if (lastHandoff) {
        const ageDays = (Date.now() - new Date(lastHandoff).getTime()) / 86400000;
        handoffOk = ageDays < 7;
        handoffDetail = handoffOk
          ? `Hace ${Math.round(ageDays * 24)}h`
          : `Hace ${Math.round(ageDays)} días — ejecuta: gestor-memory handoff`;
      }
      results.push(check('Handoff reciente (<7 días)', handoffOk, handoffDetail, true));

      // 10. Seguridad: denylist activa (verificar que nodes.json no tenga contenido sensible)
      let securityOk = true;
      let securityDetail = 'OK (sin patrones sensibles detectados en el grafo)';
      if (fs.existsSync(nodesPath)) {
        try {
          const nodesRaw = fs.readFileSync(nodesPath, 'utf-8');
          const patterns = [/password/i, /api.?key/i, /secret/i, /CUENTA/i, /credencial/i];
          const found = patterns.filter(p => p.test(nodesRaw));
          if (found.length > 0) {
            securityOk = false;
            securityDetail = `Posible contenido sensible en nodes.json (${found.length} patrones). Revisa INGEST_DENYLIST y re-ejecuta zumo.`;
          }
        } catch { /* ignore */ }
      }
      results.push(check('Sin contenido sensible en el grafo', securityOk, securityDetail));

      // ─── REPORTE ───────────────────────────────────────────────
      console.log('');
      let hasFail = false;
      for (const r of results) {
        const icon = r.status === 'ok' ? chalk.green('  ✓') : r.status === 'warn' ? chalk.yellow('  ⚠') : chalk.red('  ✗');
        const label = r.status === 'fail' ? chalk.red(r.label) : r.status === 'warn' ? chalk.yellow(r.label) : r.label;
        const detail = chalk.gray(r.detail);
        console.log(`${icon}  ${label}`);
        if (r.status !== 'ok') console.log(`       ${detail}`);
        if (r.status === 'fail') hasFail = true;
      }

      const oks = results.filter(r => r.status === 'ok').length;
      const warns = results.filter(r => r.status === 'warn').length;
      const fails = results.filter(r => r.status === 'fail').length;

      console.log('');
      console.log(chalk.gray(`  Resultado: ${oks} OK · ${warns} advertencias · ${fails} fallos`));

      if (hasFail) {
        console.log(chalk.red.bold('  Estado: ROJO — hay fallos críticos'));
      } else if (warns > 0) {
        console.log(chalk.yellow.bold('  Estado: AMARILLO — funcional con advertencias'));
      } else {
        console.log(chalk.green.bold('  Estado: VERDE — ADN completamente operativo'));
      }
      console.log('');

      if (hasFail) process.exit(1);
    });
}
