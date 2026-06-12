/**
 * zumo.ts — Comando: `gestor-memory zumo`
 *
 * Pipeline real (A5: sin simulación):
 * 1. Ingesta archivos reales (denylist aplicada)
 * 2. Genera embeddings con proveedor real (Ollama → Gemini → OpenAI → keyword)
 * 3. Construye grafo con aristas tipadas (imports, links_to, mentions, similar_to)
 * 4. Persiste en SQLite local (.gestor-memory/cache/memory.db)
 * 5. Exporta JSON versionable (.gestor-memory/graph/)
 * 6. Genera summary.md con métricas reales
 * 7. --incremental: solo reprocesa archivos con mtime > lastZumo
 * 8. --rebuild: borra cache y reconstruye desde los JSON de git
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import crypto from 'crypto';
import { detectProject } from '../lib/detector';
import { ingest, isDenied } from '../../core/engine/ingest';
import { createStorage, KnowledgeNode } from '../../core/storage/local';
import { resolveProvider } from '../../core/embeddings/provider';
import { buildRealEdges, generateGraphSummary } from '../../core/engine/graph-builder';

// =============================================================
// HELPERS
// =============================================================

function readManifest(projectDir: string): Record<string, unknown> {
  const p = path.join(projectDir, '.gestor-memory', 'manifest.json');
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return {}; }
}

function writeManifest(projectDir: string, data: Record<string, unknown>): void {
  const dir = path.join(projectDir, '.gestor-memory');
  fs.mkdirSync(dir, { recursive: true });
  const existing = readManifest(projectDir);
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ ...existing, ...data }, null, 2)
  );
}

function collectFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (isDenied(full)) continue;
      if (entry.isDirectory()) { walk(full); continue; }
      if (exts.some(e => entry.name.endsWith(e))) results.push(full);
    }
  };
  walk(dir);
  return results;
}

// =============================================================
// COMANDO
// =============================================================

export function zumoCommand(program: Command): void {
  program
    .command('zumo')
    .description('Extraer conocimiento real del proyecto (embeddings + grafo tipado)')
    .option('--path <path>', 'Ruta del proyecto', '.')
    .option('--incremental', 'Solo reprocesar archivos modificados desde el último zumo')
    .option('--rebuild', 'Borrar cache SQLite y reconstruir desde los JSON de git')
    .option('--dry-run', 'Simular sin guardar cambios')
    .option('--similarity', 'Construir aristas similar_to con coseno (requiere embeddings)')
    .action(async (options) => {
      console.log('');
      console.log(chalk.cyan.bold('  Gestor_Memory v3 — Zumo de Conocimiento'));
      console.log('');

      const projectDir = path.resolve(options.path);
      const gmDir = path.join(projectDir, '.gestor-memory');
      const graphDir = path.join(gmDir, 'graph');
      const manifest = readManifest(projectDir);

      const storage = createStorage(projectDir);

      // --rebuild: importar desde JSON y reconstruir DB
      if (options.rebuild) {
        const spin = ora('Reconstruyendo cache desde JSON de git...').start();
        storage.importGraph(graphDir);
        spin.succeed(`Cache reconstruida: ${storage.nodeCount()} nodos, ${storage.edgeCount()} aristas`);
        console.log('');
        return;
      }

      // 1. Detectar proveedor de embeddings
      const providerSpin = ora('Detectando proveedor de embeddings...').start();
      const provider = await resolveProvider();
      if (provider.isKeywordOnly) {
        providerSpin.warn(`${chalk.yellow('⚠ modo keyword')} (sin embeddings). Instala Ollama con nomic-embed-text o configura GEMINI_API_KEY para búsqueda semántica.`);
      } else {
        providerSpin.succeed(`Proveedor: ${chalk.green(provider.name)}`);
      }

      // 2. Recopilar archivos a procesar
      const fileSpin = ora('Recopilando fuentes...').start();
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.md', '.mdx', '.json', '.yaml', '.yml'];
      let allFiles = collectFiles(projectDir, extensions);

      // Si --incremental, filtrar por mtime
      let lastZumo: number | null = null;
      if (options.incremental && manifest['lastZumo']) {
        lastZumo = new Date(manifest['lastZumo'] as string).getTime();
        allFiles = allFiles.filter(f => {
          try { return fs.statSync(f).mtimeMs > lastZumo!; } catch { return true; }
        });
      }

      fileSpin.succeed(`${allFiles.length} archivos a procesar${options.incremental ? ' (incremental)' : ''}`);

      if (allFiles.length === 0) {
        console.log(chalk.gray('  Nada nuevo. El grafo está al día.'));
        return;
      }

      if (options.dryRun) {
        console.log(chalk.yellow('  Modo dry-run: no se guardaron cambios.'));
        allFiles.forEach(f => console.log(chalk.gray(`  → ${path.relative(projectDir, f)}`)));
        return;
      }

      // 3. Ingesta real
      const ingestSpin = ora('Ingiriendo archivos...').start();
      const allChunks = await ingest({
        sources: allFiles,
        chunkSize: 1200,
        overlap: 150,
      });
      ingestSpin.succeed(`${allChunks.length} chunks generados desde ${allFiles.length} archivos`);

      // 4. Guardar nodos en storage
      const nodes: KnowledgeNode[] = allChunks.map(chunk => ({
        id: crypto.randomUUID(),
        content: chunk.content,
        source: chunk.source,
        sourceType: chunk.sourceType,
        createdAt: new Date().toISOString(),
        metadata: chunk.metadata,
      }));

      const saveSpin = ora('Guardando nodos...').start();
      for (const node of nodes) storage.saveNode(node);
      saveSpin.succeed(`${nodes.length} nodos guardados en SQLite`);

      // 5. Generar embeddings (si proveedor real)
      if (!provider.isKeywordOnly) {
        const embSpin = ora(`Generando embeddings con ${provider.name}...`).start();
        let done = 0;
        for (const node of nodes) {
          try {
            const result = await provider.embed(node.content.slice(0, 2000));
            storage.saveEmbedding({
              nodeId: node.id,
              model: result.model,
              dims: result.dims,
              vector: new Float32Array(result.vector),
            });
            done++;
            if (done % 20 === 0) embSpin.text = `Embeddings: ${done}/${nodes.length}`;
          } catch (err: any) {
            embSpin.warn(`Error en embedding para nodo ${node.id.slice(0, 8)}: ${err.message}`);
          }
        }
        embSpin.succeed(`${done} embeddings generados (${provider.name})`);
      }

      // 6. Construir grafo real
      const graphSpin = ora('Construyendo grafo...').start();
      const domainEntities = (manifest['domains'] as string[] | undefined) || [];
      const edges = buildRealEdges(nodes, storage, {
        domainEntities,
        buildSimilarity: options.similarity && !provider.isKeywordOnly,
      });

      for (const edge of edges) storage.saveEdge(edge);

      const byType: Record<string, number> = {};
      for (const e of edges) byType[e.relationship] = (byType[e.relationship] || 0) + 1;
      const typeStr = Object.entries(byType).map(([t, c]) => `${t}:${c}`).join(', ');
      graphSpin.succeed(`${edges.length} aristas (${typeStr || 'ninguna'})`);

      // 7. Exportar JSON versionable + summary.md
      const exportSpin = ora('Exportando JSON y resumen...').start();
      storage.exportGraph(graphDir);
      const allNodes = storage.getAllNodes();
      const allEdges = storage.getAllEdges();
      const summary = generateGraphSummary(
        allNodes, allEdges,
        path.basename(projectDir),
        storage.getEmbeddingModel(),
      );
      fs.writeFileSync(path.join(graphDir, 'summary.md'), summary);
      exportSpin.succeed('Exportado a .gestor-memory/graph/');

      // 8. Actualizar manifest
      writeManifest(projectDir, { lastZumo: new Date().toISOString() });

      // Resumen final
      console.log('');
      console.log(chalk.green.bold('  Zumo completado'));
      console.log(chalk.gray(`  Nodos totales: ${storage.nodeCount()}`));
      console.log(chalk.gray(`  Aristas totales: ${storage.edgeCount()}`));
      console.log(chalk.gray(`  Proveedor: ${provider.name}`));
      if (provider.isKeywordOnly) {
        console.log(chalk.yellow('  Búsqueda: solo keyword (FTS5). Para semántica: instala Ollama o configura API key.'));
      }
      console.log('');
    });
}
