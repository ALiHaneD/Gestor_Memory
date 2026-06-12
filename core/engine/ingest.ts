/**
 * Ingest Engine — Motor de Ingesta de Conocimiento
 *
 * Procesa fuentes:
 * - Markdown (.md)
 * - Código (.ts, .tsx, .js)
 * - JSON (.json)
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================
// DENYLIST — Nunca ingerir estos paths/patrones (seguridad A5)
// =============================================================

export const INGEST_DENYLIST: RegExp[] = [
  /node_modules/,
  /\.git\b/,
  /dist\b/,
  /build\b/,
  /\.gestor-memory[/\\]cache/,
  /\.env/,
  /credencial/i,
  /CUENTA/i,
  /secret/i,
  /password/i,
  /\.key$/,
  /\.pem$/,
  /\.p12$/,
  /\.pfx$/,
  /token.*\.json$/i,
  /Clave-Vertex/i,
  /Doc-Arismendy/,
  /Doc-CEO/,
  // binarios y media
  /\.(png|jpg|jpeg|gif|svg|ico|mp4|mp3|mov|avi|pdf|docx?|xlsx?|zip|tar|gz|exe|dll|bin)$/i,
];

export function isDenied(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return INGEST_DENYLIST.some(pattern => pattern.test(normalized));
}

interface IngestConfig {
  sources: string[];
  chunkSize: number;
  overlap: number;
}

interface Chunk {
  id: string;
  content: string;
  source: string;
  sourceType: string;
  metadata: Record<string, unknown>;
}

// =============================================================
// CHUNKING
// =============================================================

export function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  
  if (text.length <= chunkSize) {
    chunks.push(text);
    return chunks;
  }
  
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  
  return chunks;
}

export function chunkByLines(text: string, maxLines: number = 100): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  
  for (let i = 0; i < lines.length; i += maxLines) {
    chunks.push(lines.slice(i, i + maxLines).join('\n'));
  }
  
  return chunks;
}

// =============================================================
// SOURCE PROCESSORS
// =============================================================

const processors: Record<string, (filePath: string) => Promise<Chunk[]>> = {
  '.md': processMarkdown,
  '.ts': processCode,
  '.tsx': processCode,
  '.js': processCode,
  '.json': processJSON,
  '.yaml': processYAML,
  '.yml': processYAML,
};

async function processMarkdown(filePath: string): Promise<Chunk[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const chunks = chunkText(content, 1000, 100);
  
  return chunks.map((chunk, i) => ({
    id: `${path.basename(filePath)}-${i}`,
    content: chunk,
    source: filePath,
    sourceType: 'markdown',
    metadata: {
      title: extractTitle(content),
      tags: extractTags(content),
    },
  }));
}

async function processCode(filePath: string): Promise<Chunk[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const chunks = chunkByLines(content, 80);
  
  return chunks.map((chunk, i) => ({
    id: `${path.basename(filePath)}-${i}`,
    content: chunk,
    source: filePath,
    sourceType: 'code',
    metadata: {
      language: path.extname(filePath).slice(1),
      functions: extractFunctions(chunk),
    },
  }));
}

async function processJSON(filePath: string): Promise<Chunk[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const json = JSON.parse(content);
  
  return [{
    id: path.basename(filePath),
    content: JSON.stringify(json, null, 2),
    source: filePath,
    sourceType: 'json',
    metadata: { keys: Object.keys(json) },
  }];
}

async function processYAML(filePath: string): Promise<Chunk[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  return [{
    id: path.basename(filePath),
    content,
    source: filePath,
    sourceType: 'yaml',
    metadata: {},
  }];
}

// =============================================================
// HELPERS
// =============================================================

function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1] : null;
}

function extractTags(markdown: string): string[] {
  const match = markdown.match(/tags?:\s*(.+)$/m);
  if (!match) return [];
  return match[1].split(',').map(t => t.trim().replace(/[[\]]/g, ''));
}

function extractFunctions(code: string): string[] {
  const regex = /(?:function|const|let|var)\s+(\w+)/g;
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(code)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

// =============================================================
// MAIN INGEST
// Acepta rutas de archivo ya resueltas (no patrones glob).
// El caller (zumo.ts) es responsable de resolver y filtrar con collectFiles().
// =============================================================

export async function ingest(config: IngestConfig): Promise<Chunk[]> {
  const allChunks: Chunk[] = [];

  for (const file of config.sources) {
    if (isDenied(file)) continue;

    const ext = path.extname(file).toLowerCase();
    const processor = processors[ext];

    if (processor) {
      try {
        const chunks = await processor(file);
        allChunks.push(...chunks);
      } catch (err) {
        console.error(`Error procesando ${file}:`, err);
      }
    }
  }

  return allChunks;
}

async function glob(pattern: string): Promise<string[]> {
  const results: string[] = [];
  const baseDir = pattern.replace(/\/\*\*.*/, '').replace(/\*.*/, '');
  
  if (!fs.existsSync(baseDir)) return results;
  
  const walk = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const exts = pattern.includes('*.ts') ? ['.ts', '.tsx'] :
                     pattern.includes('*.md') ? ['.md'] :
                     pattern.includes('*.json') ? ['.json'] : [];
          if (exts.length === 0 || exts.some(e => entry.name.endsWith(e))) {
            walk(fullPath);
          }
        } else {
          results.push(fullPath);
        }
      }
    } catch { /* ignore */ }
  };
  
  walk(baseDir);
  return results;
}