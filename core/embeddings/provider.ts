/**
 * Proveedor de embeddings — cadena de detección automática:
 * Ollama local → GEMINI_API_KEY → OPENAI_API_KEY → keyword (FTS5, sin vectores).
 *
 * Regla A5: si no hay proveedor real, el sistema DECLARA que opera en modo keyword.
 * PROHIBIDO retornar vectores aleatorios o de ceros.
 */

import * as http from 'http';
import * as https from 'https';

// =============================================================
// TIPOS
// =============================================================

export interface EmbeddingResult {
  vector: number[];
  model: string;
  dims: number;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly isKeywordOnly: boolean;
  embed(text: string): Promise<EmbeddingResult>;
  isAvailable(): Promise<boolean>;
}

// =============================================================
// OLLAMA (local, default — el CEO lo tiene instalado)
// =============================================================

export class OllamaProvider implements EmbeddingProvider {
  readonly name = 'ollama';
  readonly isKeywordOnly = false;
  private model: string;
  private host: string;

  constructor(model = 'nomic-embed-text', host = 'http://localhost:11434') {
    this.model = model;
    this.host = host;
  }

  async isAvailable(): Promise<boolean> {
    return new Promise(resolve => {
      const url = new URL('/api/tags', this.host);
      const req = http.get({ hostname: url.hostname, port: url.port || 11434, path: url.pathname, timeout: 2000 }, res => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const body = JSON.stringify({ model: this.model, prompt: text });
    const vector = await new Promise<number[]>((resolve, reject) => {
      const url = new URL('/api/embeddings', this.host);
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 11434,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.embedding as number[]);
          } catch (e) {
            reject(new Error(`Ollama parse error: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    return { vector, model: `ollama/${this.model}`, dims: vector.length };
  }
}

// =============================================================
// GEMINI (si hay GEMINI_API_KEY en env)
// =============================================================

export class GeminiProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  readonly isKeywordOnly = false;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'text-embedding-004') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const body = JSON.stringify({ model: `models/${this.model}`, content: { parts: [{ text }] } });
    const vector = await new Promise<number[]>((resolve, reject) => {
      const path = `/v1/models/${this.model}:embedContent?key=${this.apiKey}`;
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.embedding.values as number[]);
          } catch (e) {
            reject(new Error(`Gemini parse error: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    return { vector, model: `gemini/${this.model}`, dims: vector.length };
  }
}

// =============================================================
// OPENAI (si hay OPENAI_API_KEY en env — via API directa o OpenRouter)
// =============================================================

export class OpenAIProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly isKeywordOnly = false;
  private apiKey: string;
  private model: string;
  private baseHost: string;

  constructor(apiKey: string, model = 'text-embedding-3-small', baseHost = 'api.openai.com') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseHost = baseHost;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const body = JSON.stringify({ input: text, model: this.model });
    const vector = await new Promise<number[]>((resolve, reject) => {
      const req = https.request({
        hostname: this.baseHost,
        path: '/v1/embeddings',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
      }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.data[0].embedding as number[]);
          } catch (e) {
            reject(new Error(`OpenAI parse error: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    return { vector, model: `openai/${this.model}`, dims: vector.length };
  }
}

// =============================================================
// NONE (keyword-only — declara honestamente su modo)
// =============================================================

export class NoneProvider implements EmbeddingProvider {
  readonly name = 'none';
  readonly isKeywordOnly = true;

  async isAvailable(): Promise<boolean> { return true; }

  async embed(_text: string): Promise<EmbeddingResult> {
    throw new Error('NoneProvider no genera embeddings. Usar búsqueda keyword (FTS5).');
  }
}

// =============================================================
// COSINE SIMILARITY
// =============================================================

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// =============================================================
// AUTO-DETECCIÓN — resolveProvider()
// =============================================================

export async function resolveProvider(opts?: { model?: string }): Promise<EmbeddingProvider> {
  // 1. Ollama local
  const ollama = new OllamaProvider(opts?.model || 'nomic-embed-text');
  if (await ollama.isAvailable()) return ollama;

  // 2. Gemini (requiere API key real, no solo suscripción)
  const geminiKey = process.env['GEMINI_API_KEY'];
  if (geminiKey) {
    const gemini = new GeminiProvider(geminiKey);
    if (await gemini.isAvailable()) return gemini;
  }

  // 3. OpenAI (requiere API key real)
  const openaiKey = process.env['OPENAI_API_KEY'];
  if (openaiKey) {
    const openai = new OpenAIProvider(openaiKey);
    if (await openai.isAvailable()) return openai;
  }

  // 4. Sin embeddings — keyword-only (declarado, nunca silenciado)
  return new NoneProvider();
}
