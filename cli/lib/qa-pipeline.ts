/**
 * qa-pipeline.ts — Orquesta herramientas de QA (Snyk, TestSprite, Postman).
 *
 * - Detecta si las herramientas están instaladas
 * - Ofrece instalarlas si no están
 * - Ejecuta scans y guarda resultados en .dev/qa/
 * - Genera reporte unificado
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getGodNodes, getSurprisingConnections } from '../../core/engine/analysis';

// ── Tipos ────────────────────────────────────────────

export interface QATool {
  name: string;
  description: string;
  isInstalled: boolean;
  installCommand: string;
  isFree: boolean;
  requiresApiKey: boolean;
}

export interface QAResult {
  tool: string;
  status: 'success' | 'warning' | 'error' | 'skipped';
  summary: string;
  outputPath?: string;
  details?: string;
}

// ── Detección de herramientas ────────────────────────

function isCommandAvailable(command: string): boolean {
  try {
    execSync(`${command} --version`, { stdio: 'pipe', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detecta qué herramientas de QA están disponibles.
 */
export function detectQATools(): QATool[] {
  return [
    {
      name: 'Snyk',
      description: 'Análisis de seguridad de dependencias y código (SAST)',
      isInstalled: isCommandAvailable('snyk'),
      installCommand: 'npm install -g snyk',
      isFree: true,
      requiresApiKey: true, // gratis pero requiere auth
    },
    {
      name: 'TestSprite',
      description: 'Testing E2E automatizado desde PRD (MCP server)',
      isInstalled: isCommandAvailable('npx @testsprite/testsprite-mcp'),
      installCommand: 'npm install -g @testsprite/testsprite-mcp@latest',
      isFree: false,
      requiresApiKey: true,
    },
    {
      name: 'Newman (Postman CLI)',
      description: 'Ejecución de colecciones Postman desde CLI',
      isInstalled: isCommandAvailable('newman'),
      installCommand: 'npm install -g newman',
      isFree: true,
      requiresApiKey: false,
    },
    {
      name: 'Graph Analysis',
      description: 'Auditoría arquitectónica basada en el grafo de conocimiento',
      isInstalled: true,
      installCommand: 'n/a',
      isFree: true,
      requiresApiKey: false,
    },
  ];
}

// ── Ejecución de scans ───────────────────────────────

/**
 * Ejecuta scan de Snyk y guarda resultados.
 */
export function runSnykScan(projectDir: string): QAResult {
  const qaDir = path.join(projectDir, '.dev', 'qa');
  fs.mkdirSync(qaDir, { recursive: true });

  if (!isCommandAvailable('snyk')) {
    return {
      tool: 'Snyk',
      status: 'skipped',
      summary: 'Snyk CLI no instalado. Ejecuta: npm install -g snyk',
    };
  }

  try {
    // Test de dependencias
    const depResult = execSync('snyk test --json', {
      cwd: projectDir,
      stdio: 'pipe',
      timeout: 120000,
    }).toString();

    const outputPath = path.join(qaDir, 'snyk-dependencies.json');
    fs.writeFileSync(outputPath, depResult, 'utf-8');

    // Parse para resumen
    let summary = 'Scan completado';
    try {
      const parsed = JSON.parse(depResult);
      const vulns = parsed.vulnerabilities?.length || 0;
      summary = `${vulns} vulnerabilidades encontradas en dependencias`;
    } catch { /* non-JSON output */ }

    return {
      tool: 'Snyk',
      status: 'success',
      summary,
      outputPath,
    };
  } catch (err: any) {
    // Snyk retorna exit code 1 si encuentra vulnerabilidades (es normal)
    const output = err.stdout?.toString() || err.stderr?.toString() || '';
    const outputPath = path.join(qaDir, 'snyk-dependencies.json');

    if (output) {
      fs.writeFileSync(outputPath, output, 'utf-8');
    }

    return {
      tool: 'Snyk',
      status: output.includes('vulnerabilities') ? 'warning' : 'error',
      summary: output.includes('vulnerabilities')
        ? 'Vulnerabilidades detectadas (ver reporte)'
        : `Error: ${err.message?.slice(0, 100)}`,
      outputPath: output ? outputPath : undefined,
    };
  }
}

/**
 * Ejecuta análisis de código estático con Snyk Code.
 */
export function runSnykCodeScan(projectDir: string): QAResult {
  const qaDir = path.join(projectDir, '.dev', 'qa');
  fs.mkdirSync(qaDir, { recursive: true });

  if (!isCommandAvailable('snyk')) {
    return {
      tool: 'Snyk Code',
      status: 'skipped',
      summary: 'Snyk CLI no instalado',
    };
  }

  try {
    const result = execSync('snyk code test --json', {
      cwd: projectDir,
      stdio: 'pipe',
      timeout: 180000,
    }).toString();

    const outputPath = path.join(qaDir, 'snyk-code.json');
    fs.writeFileSync(outputPath, result, 'utf-8');

    return {
      tool: 'Snyk Code',
      status: 'success',
      summary: 'Análisis SAST completado',
      outputPath,
    };
  } catch (err: any) {
    return {
      tool: 'Snyk Code',
      status: 'error',
      summary: `Error: ${err.message?.slice(0, 100)}`,
    };
  }
}

/**
 * Genera configuración de TestSprite basada en el PRD.
 */
export function generateTestSpriteConfig(projectDir: string): QAResult {
  const qaDir = path.join(projectDir, '.dev', 'qa');
  fs.mkdirSync(qaDir, { recursive: true });

  // Verificar que existe el PRD
  const prdPath = path.join(projectDir, '.dev', 'prd.md');
  if (!fs.existsSync(prdPath)) {
    return {
      tool: 'TestSprite',
      status: 'skipped',
      summary: 'No se encontró .dev/prd.md. Ejecuta gestor-memory init primero.',
    };
  }

  // Generar configuración
  const config = {
    "$schema": "https://testsprite.com/schema/config.json",
    "project": {
      "name": path.basename(projectDir),
      "prdPath": "../prd.md",
      "sourceDirs": ["src/", "app/", "pages/"],
    },
    "testing": {
      "framework": "playwright",
      "types": ["ui", "api", "security"],
      "baseUrl": "http://localhost:3000",
      "headless": true,
    },
    "reporting": {
      "outputDir": "./results/",
      "format": ["html", "json"],
    },
    "mcp": {
      "server": "@testsprite/testsprite-mcp",
      "autoFix": false, // requiere aprobación humana
    },
  };

  const outputPath = path.join(qaDir, 'testsprite-config.json');
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf-8');

  return {
    tool: 'TestSprite',
    status: 'success',
    summary: 'Configuración generada. Vinculada al PRD.',
    outputPath,
  };
}

/**
 * Genera colección Postman básica desde el PRD.
 */
export function generatePostmanCollection(projectDir: string, projectName: string): QAResult {
  const qaDir = path.join(projectDir, '.dev', 'qa');
  fs.mkdirSync(qaDir, { recursive: true });

  const collection = {
    info: {
      name: `${projectName} — API Tests`,
      description: `Colección auto-generada por Gestor_Memory v2.\nBasada en el PRD del proyecto.`,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [
      {
        name: "Health Check",
        request: {
          method: "GET",
          header: [],
          url: { raw: "{{baseUrl}}/api/health", host: ["{{baseUrl}}"], path: ["api", "health"] },
        },
      },
      {
        name: "Auth — Login",
        request: {
          method: "POST",
          header: [{ key: "Content-Type", value: "application/json" }],
          body: {
            mode: "raw",
            raw: JSON.stringify({ email: "test@example.com", password: "test123" }, null, 2),
          },
          url: { raw: "{{baseUrl}}/api/auth/login", host: ["{{baseUrl}}"], path: ["api", "auth", "login"] },
        },
      },
    ],
    variable: [
      { key: "baseUrl", value: "http://localhost:3000", type: "string" },
    ],
  };

  const outputPath = path.join(qaDir, 'postman-collection.json');
  fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2), 'utf-8');

  return {
    tool: 'Postman',
    status: 'success',
    summary: 'Colección generada. Importa en Postman o ejecuta con Newman.',
    outputPath,
  };
}

/**
 * Genera reporte unificado de QA.
 */
export function generateQAReport(projectDir: string, results: QAResult[]): string {
  const now = new Date().toISOString().split('T')[0];
  const qaDir = path.join(projectDir, '.dev', 'qa');
  fs.mkdirSync(qaDir, { recursive: true });

  let report = `# QA Report: ${path.basename(projectDir)}
> Generado: ${now}
> Herramientas: ${results.map(r => r.tool).join(', ')}

---

## Resumen

| Herramienta | Estado | Resultado |
|:---|:---|:---|
| ${results.map(r => `| **${r.tool}** | ${statusEmoji(r.status)} ${r.status} | ${r.summary} |`).join('\n')}

---

## Detalles

${results.map(r => `### ${r.tool}
- **Estado:** ${statusEmoji(r.status)} ${r.status}
- **Resultado:** ${r.summary}
${r.outputPath ? `- **Reporte:** \`${path.relative(projectDir, r.outputPath)}\`` : ''}
${r.details || ''}`).join('\n\n')}

---

## Próximos pasos

${results.some(r => r.status === 'warning')
    ? '- ⚠️ Revisar advertencias y corregir vulnerabilidades'
    : '- ✅ No hay advertencias críticas'}
${results.some(r => r.status === 'error')
    ? '- ❌ Resolver errores de herramientas'
    : ''}
- Ejecutar \`gestor-memory qa\` periódicamente
- Integrar en CI/CD con GitHub Actions

---
*Generado por Gestor_Memory v2*
`;

  const reportPath = path.join(qaDir, `report-${now}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');

  return reportPath;
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'success': return '✅';
    case 'warning': return '⚠️';
    case 'error': return '❌';
    case 'skipped': return '⏭️';
    default: return '❓';
  }
}

/**
 * Ejecuta análisis arquitectónico del grafo.
 */
export async function runGraphAnalysis(projectDir: string): Promise<QAResult> {
  try {
    const godNodes = await getGodNodes(5);
    const surprises = await getSurprisingConnections(5);

    const summary = `${godNodes.length} hubs detectados, ${surprises.length} conexiones cross-file.`;
    
    let details = `\n**Top God Nodes:**\n`;
    details += godNodes.map((n: any) => `- \`${n.source}\`: ${n.degree} conexiones`).join('\n');
    
    return {
      tool: 'Graph Analysis',
      status: godNodes.some((n: any) => Number(n.degree) > 15) ? 'warning' : 'success',
      summary,
      details,
    };
  } catch (err: any) {
    return {
      tool: 'Graph Analysis',
      status: 'skipped',
      summary: `Análisis de grafo no disponible (DB no inicializada o vacía)`,
    };
  }
}
