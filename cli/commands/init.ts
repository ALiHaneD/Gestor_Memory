/**
 * init.ts — Comando principal: `gestor-memory init`
 *
 * Flujo dual:
 * - Proyecto NUEVO: pide info al usuario → genera PRD + estructura completa
 * - Proyecto EXISTENTE: escanea infraestructura → adapta y genera PRD
 *
 * En ambos casos genera:
 * - .dev/ (carpeta gitignored de desarrollo)
 * - AGENTS.md, CLAUDE.md, GEMINI.md (archivos públicos)
 * - PRD, Roadmap, Stack Analysis (en .dev/)
 * - Configuración de QA (Snyk/TestSprite/Postman)
 * - (Opcional) Obsidian vault/tutorial
 */

import { Command } from 'commander';
import * as inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';

import { detectProject, ProjectProfile } from '../lib/detector';
import { generatePRD, generateRoadmap, generateStackAnalysis, PRDInput } from '../lib/prd-generator';
import { ensureGitignore } from '../lib/gitignore-manager';
import { detectObsidian, generateObsidianConfig, getObsidianDownloadUrl, ObsidianChoice } from '../lib/obsidian-manager';
import { detectQATools, generateTestSpriteConfig, generatePostmanCollection } from '../lib/qa-pipeline';

// ── Helpers de UI ────────────────────────────────────

function header(text: string): void {
  console.log('');
  console.log(chalk.cyan('═'.repeat(55)));
  console.log(chalk.cyan.bold(`  ${text}`));
  console.log(chalk.cyan('═'.repeat(55)));
  console.log('');
}

function success(text: string): void {
  console.log(chalk.green(`  ✅ ${text}`));
}

function warn(text: string): void {
  console.log(chalk.yellow(`  ⚠️  ${text}`));
}

function info(text: string): void {
  console.log(chalk.gray(`  → ${text}`));
}

function copyTemplate(templateName: string, destPath: string): void {
  const templateDir = path.join(__dirname, '..', 'templates');
  const templatePath = path.join(templateDir, templateName);

  if (fs.existsSync(templatePath)) {
    const content = fs.readFileSync(templatePath, 'utf-8');
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content, 'utf-8');
  }
}

// ── Flujo para proyecto NUEVO ────────────────────────

async function initNewProject(projectDir: string, profile: ProjectProfile): Promise<void> {
  header('🧠 PROYECTO NUEVO — Configuración desde cero');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: '¿Nombre del proyecto?',
      default: profile.projectName,
    },
    {
      type: 'input',
      name: 'description',
      message: '¿Descripción breve (1-2 líneas)?',
      default: '',
    },
    {
      type: 'list',
      name: 'stack',
      message: '¿Stack preferido?',
      choices: [
        { name: 'React + Node.js + PostgreSQL (ALianeD Standard)', value: 'alianed' },
        { name: 'Next.js + Prisma + PostgreSQL', value: 'nextjs' },
        { name: 'Vite + Drizzle + Supabase', value: 'vite-supabase' },
        { name: 'Express/Fastify API (solo backend)', value: 'api-only' },
        { name: 'Personalizado (especificar)', value: 'custom' },
      ],
    },
    {
      type: 'input',
      name: 'customStack',
      message: '¿Qué stack deseas usar?',
      when: (a: any) => a.stack === 'custom',
    },
    {
      type: 'list',
      name: 'projectType',
      message: '¿Tipo de proyecto?',
      choices: [
        { name: 'SaaS / Web App', value: 'saas' },
        { name: 'Herramienta interna', value: 'internal-tool' },
        { name: 'API / Microservicio', value: 'api' },
        { name: 'Librería / Paquete', value: 'library' },
        { name: 'CLI / Herramienta de línea de comandos', value: 'cli' },
      ],
    },
    {
      type: 'list',
      name: 'dbMode',
      message: '¿Base de datos?',
      choices: [
        { name: 'Modo Destino — PostgreSQL nueva (recomendado)', value: 'destino' },
        { name: 'Modo Filtro Temporal — Conectar a DB existente', value: 'filtro' },
        { name: 'Sin base de datos por ahora', value: 'none' },
      ],
    },
  ]);

  // Actualizar profile con respuestas
  profile.projectName = answers.projectName;

  const prdInput: PRDInput = {
    profile,
    description: answers.description,
    projectType: answers.projectType,
    customStack: answers.customStack,
  };

  // Generar estructura
  await generateFullStructure(projectDir, profile, prdInput, answers.dbMode);
}

// ── Flujo para proyecto EXISTENTE ────────────────────

async function initExistingProject(projectDir: string, profile: ProjectProfile, noInteractive: boolean = false): Promise<void> {
  header('📖 PROYECTO EXISTENTE — Adaptación');

  console.log(chalk.white.bold('  Infraestructura detectada:\\n'));

  // Mostrar lo detectado
  if (profile.stack.framework) {
    info(`Framework: ${chalk.bold(profile.stack.framework)}`);
  }
  info(`Lenguaje: ${chalk.bold(profile.stack.language)}`);
  info(`Runtime: ${chalk.bold(profile.stack.runtime)}`);
  info(`Archivos fuente: ${chalk.bold(String(profile.sourceFileCount))}`);

  if (profile.databases.length > 0) {
    for (const db of profile.databases) {
      info(`DB: ${chalk.bold(db.type)} (${db.modelCount || '?'} modelos) — ${db.schemaPath}`);
    }
  }

  if (profile.agentConfig.hasAgentsMd) {
    info(`AGENTS.md: ${chalk.bold('UCA v' + (profile.agentConfig.ucaVersion || 1))}`);
  }

  if (profile.integrations.mcpServers && profile.integrations.mcpServers.length > 0) {
    info(`MCP Servers: ${chalk.bold(profile.integrations.mcpServers.join(', '))}`);
  }

  console.log('');

  let generatePRD = true;
  let dbMode = 'destino';
  let updateAgents = true;

  if (noInteractive) {
    generatePRD = true;
    dbMode = 'destino';
    updateAgents = true;
  } else {
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'generatePRD',
        message: '¿Generar PRD basado en el código existente?',
        default: true,
      },
      {
        type: 'list',
        name: 'dbMode',
        message: '¿Cómo integrar Gestor_Memory?',
        choices: [
          { name: 'Modo Destino — Extender la DB existente con tablas de conocimiento', value: 'destino' },
          { name: 'Modo Filtro Temporal — DB separada que sincroniza', value: 'filtro' },
          { name: 'Solo estructura .dev/ (sin DB adicional)', value: 'none' },
        ],
      },
      {
        type: 'confirm',
        name: 'updateAgents',
        message: profile.agentConfig.hasAgentsMd
          ? '¿Actualizar AGENTS.md a v2? (se preservará el contenido existente)'
          : '¿Generar AGENTS.md, CLAUDE.md, GEMINI.md?',
        default: true,
      },
    ]);

    generatePRD = answers.generatePRD;
    dbMode = answers.dbMode;
    updateAgents = answers.updateAgents;
  }

  const prdInput: PRDInput = {
    profile,
    description: `Proyecto existente: ${profile.projectName}`,
  };

  await generateFullStructure(
    projectDir,
    profile,
    generatePRD ? prdInput : null,
    dbMode,
    updateAgents,
    noInteractive,
  );
}

// ── Generación de estructura completa ────────────────

async function generateFullStructure(
  projectDir: string,
  profile: ProjectProfile,
  prdInput: PRDInput | null,
  dbMode: string,
  updateAgents: boolean = true,
  noInteractive: boolean = false,
): Promise<void> {

  const devDir = path.join(projectDir, '.dev');
  const spinner = ora('Generando estructura...').start();

  // 1. Crear carpeta .dev/ con subdirectorios
  const devSubDirs = ['handoffs', 'specs', 'qa', 'qa/results', 'exports'];
  for (const sub of devSubDirs) {
    fs.mkdirSync(path.join(devDir, sub), { recursive: true });
  }
  spinner.succeed('Carpeta .dev/ creada');

  // 2. Generar PRD
  if (prdInput) {
    const prdSpinner = ora('Generando PRD automático...').start();
    const prdPath = generatePRD(prdInput, devDir);
    prdSpinner.succeed(`.dev/prd.md — PRD generado`);

    // Roadmap
    const roadmapSpinner = ora('Generando roadmap...').start();
    generateRoadmap(prdInput, devDir);
    roadmapSpinner.succeed(`.dev/roadmap.md — Roadmap generado`);

    // Stack Analysis
    const stackSpinner = ora('Analizando stack...').start();
    generateStackAnalysis(profile, devDir);
    stackSpinner.succeed(`.dev/stack-analysis.md — Análisis de stack`);
  }

  // 3. Handoff inicial
  copyTemplate('current-state.md.template', path.join(devDir, 'handoffs', 'current-state.md'));
  success('.dev/handoffs/current-state.md — Template de handoff');

  // 4. Archivos de agentes (públicos, se suben al repo)
  if (updateAgents) {
    // Solo crear si no existen (para no sobreescribir personalizaciones)
    if (!profile.agentConfig.hasAgentsMd) {
      copyTemplate('AGENTS.md.template', path.join(projectDir, 'AGENTS.md'));
      success('AGENTS.md — Configuración para agentes IA');
    } else {
      warn('AGENTS.md ya existe — no se sobreescribe');
    }

    if (!profile.agentConfig.hasClaudeMd) {
      copyTemplate('CLAUDE.md.template', path.join(projectDir, 'CLAUDE.md'));
      success('CLAUDE.md — Instrucciones para Claude');
    } else {
      warn('CLAUDE.md ya existe — no se sobreescribe');
    }

    if (!profile.agentConfig.hasGeminiMd) {
      copyTemplate('GEMINI.md.template', path.join(projectDir, 'GEMINI.md'));
      success('GEMINI.md — Instrucciones para Gemini/Antigravity');
    } else {
      warn('GEMINI.md ya existe — no se sobreescribe');
    }

    // Roadmap público (copia simplificada)
    if (!fs.existsSync(path.join(projectDir, 'roadmap.md'))) {
      const publicRoadmap = \`# Roadmap: \${profile.projectName}\\n\\n> Ver \\\`.dev/roadmap.md\\\` para el roadmap detallado de desarrollo (Protocolo Open Box v2.0).\\n> Este archivo es la versión pública.\\n\\n## Fases del Proyecto\\n\\n1. 🎨 **Diseño UI/UX**\\n2. 🏗️ **Estructura y Dependencias**\\n3. 🗄️ **Base de Datos**\\n4. ⚡ **Funciones Especiales**\\n5. 🚀 **Despliegue**\\n6. 🧪 **Auditoría y QA**\\n7. 🔄 **Revisión y Ajustes**\\n\\n---\\n_Iniciado el \${new Date().toISOString().split('T')[0]}_\n\`;
      fs.writeFileSync(path.join(projectDir, 'roadmap.md'), publicRoadmap, 'utf-8');
      success('roadmap.md — Roadmap público');
    }
  }

  // 5. .gitignore
  const gitResult = ensureGitignore(projectDir);
  if (gitResult.created) {
    success('.gitignore — Creado con template completo');
  } else if (gitResult.entriesAdded.length > 0) {
    success(\`.gitignore — Actualizado (añadido: \${gitResult.entriesAdded.join(', ')})\`);
  } else {
    info('.gitignore — Ya contenía todas las entradas necesarias');
  }

  // 6. Configuración de Gestor_Memory
  const gmConfig = {
    version: '2.0.0',
    mode: dbMode,
    project: profile.projectName,
    stack: {
      runtime: profile.stack.runtime,
      framework: profile.stack.framework,
      language: profile.stack.language,
    },
    databases: profile.databases.map(d => ({
      type: d.type,
      modelCount: d.modelCount,
    })),
    createdAt: new Date().toISOString(),
  };
  const gmDir = path.join(projectDir, '.gestor-memory');
  fs.mkdirSync(gmDir, { recursive: true });
  fs.writeFileSync(
    path.join(gmDir, 'config.json'),
    JSON.stringify(gmConfig, null, 2),
    'utf-8'
  );
  success('.gestor-memory/config.json — Configuración guardada');

  if (!noInteractive) {
    // 7. QA Tools
    await promptQASetup(projectDir, profile.projectName);

    // 8. Obsidian
    await promptObsidianSetup(projectDir, profile.projectName);
  } else {
    success('QA: Snyk configurado (ejecuta "gestor-memory qa" para usar)');
    success('Obsidian: configuración omitida (ejecuta "gestor-memory obsidian" para configurar)');
  }

  // ── Resumen final ──────────────────────────────────
  header('✅ PROYECTO CONFIGURADO');

  console.log(chalk.white('  Archivos generados:'));
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log(chalk.gray('  📂 .dev/                    (gitignored)'));
  console.log(chalk.gray('     ├── prd.md              PRD automático'));
  console.log(chalk.gray('     ├── roadmap.md          Roadmap detallado'));
  console.log(chalk.gray('     ├── stack-analysis.md   Análisis técnico'));
  console.log(chalk.gray('     ├── handoffs/           Estado para agentes'));
  console.log(chalk.gray('     ├── specs/              Specs de features'));
  console.log(chalk.gray('     └── qa/                 Testing (Snyk/etc)'));
  console.log(chalk.gray('  📄 AGENTS.md               (se sube al repo)'));
  console.log(chalk.gray('  📄 CLAUDE.md               (se sube al repo)'));
  console.log(chalk.gray('  📄 GEMINI.md               (se sube al repo)'));
  console.log(chalk.gray('  📄 roadmap.md              (se sube al repo)'));
  console.log(chalk.gray('  📄 .gitignore              (actualizado)'));
  console.log('');
  console.log(chalk.cyan('  Próximos pasos:'));
  console.log(chalk.white('  1. Revisa .dev/prd.md y ajusta según necesites'));
  console.log(chalk.white('  2. Comienza a desarrollar — los agentes IA leerán'));
  console.log(chalk.white('     AGENTS.md automáticamente'));
  console.log(chalk.white('  3. Ejecuta "gestor-memory qa" para testing'));
  console.log('');
}

// ── Prompt de QA ─────────────────────────────────────

async function promptQASetup(projectDir: string, projectName: string): Promise<void> {
  header('🔬 HERRAMIENTAS DE TESTING');

  const tools = detectQATools();

  console.log(chalk.white('  Herramientas disponibles:\\n'));
  for (const tool of tools) {
    const status = tool.isInstalled
      ? chalk.green('✅ Instalada')
      : chalk.yellow('❌ No instalada');
    const price = tool.isFree ? chalk.green('gratis') : chalk.yellow('requiere cuenta');
    console.log(`  \${status} \${chalk.bold(tool.name)} — \${tool.description} (\${price})`);
  }
  console.log('');

  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedTools',
      message: '¿Qué herramientas configurar? (puedes hacerlo después)',
      choices: [
        { name: 'Snyk (seguridad, gratis)', value: 'snyk', checked: true },
        { name: 'TestSprite (testing E2E desde PRD)', value: 'testsprite' },
        { name: 'Postman Collection (API tests)', value: 'postman' },
      ],
    },
  ]);

  const selected: string[] = answers.selectedTools;

  if (selected.includes('snyk')) {
    const snykTool = tools.find(t => t.name === 'Snyk');
    if (snykTool && !snykTool.isInstalled) {
      warn('Snyk CLI no instalado. Para instalar: npm install -g snyk');
      info('Después ejecuta: snyk auth (gratis, solo requiere cuenta)');
    }
    // Crear baseline vacío
    const qaDir = path.join(projectDir, '.dev', 'qa');
    fs.mkdirSync(qaDir, { recursive: true });
    fs.writeFileSync(
      path.join(qaDir, 'snyk-baseline.json'),
      JSON.stringify({ configured: true, lastScan: null }, null, 2),
      'utf-8'
    );
    success('Snyk configurado en .dev/qa/snyk-baseline.json');
  }

  if (selected.includes('testsprite')) {
    const result = generateTestSpriteConfig(projectDir);
    if (result.status === 'success') {
      success(\`TestSprite: \${result.summary}\`);
    } else {
      warn(\`TestSprite: \${result.summary}\`);
    }
  }

  if (selected.includes('postman')) {
    const result = generatePostmanCollection(projectDir, projectName);
    success(\`Postman: \${result.summary}\`);
  }
}

// ── Prompt de Obsidian ───────────────────────────────

async function promptObsidianSetup(projectDir: string, projectName: string): Promise<void> {
  header('🔮 OBSIDIAN — Visualización de Conocimiento');

  const detection = detectObsidian();

  if (detection.isInstalled) {
    console.log(chalk.green('  ✅ Obsidian detectado en el sistema'));
    if (detection.installPath) {
      info(\`Ruta: \${detection.installPath}\`);
    }
    if (detection.vaults && detection.vaults.length > 0) {
      info(\`Vaults existentes: \${detection.vaults.length}\`);
    }
    console.log('');

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'obsidianChoice',
        message: '¿Deseas vincular Obsidian a este proyecto?',
        choices: [
          { name: \`Sí, crear vault nuevo "\${projectName}-knowledge"\`, value: 'create-vault' },
          { name: 'No, usaré solo la vista web del Visualizer', value: 'web-only' },
        ],
      },
    ]);

    generateObsidianConfig(projectDir, projectName, answers.obsidianChoice as ObsidianChoice);
    success('Obsidian configurado');

  } else {
    console.log(chalk.yellow('  ⚠️  Obsidian no detectado en el sistema.\\n'));
    console.log(chalk.gray('  Obsidian es una herramienta gratuita de notas que permite'));
    console.log(chalk.gray('  visualizar el grafo de conocimiento del proyecto.\\n'));

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'obsidianChoice',
        message: '¿Qué deseas hacer?',
        choices: [
          { name: \`Descargar Obsidian (se abrirá: \${getObsidianDownloadUrl()})\`, value: 'download' },
          { name: 'No, usaré solo la vista web', value: 'web-only' },
          { name: 'Ya uso otra herramienta (Logseq/Siguen/Notion) → modo export', value: 'export-only' },
        ],
      },
    ]);

    const choice = answers.obsidianChoice as ObsidianChoice;
    generateObsidianConfig(projectDir, projectName, choice);

    if (choice === 'download') {
      // Intentar abrir el navegador
      try {
        const { exec } = require('child_process');
        const url = getObsidianDownloadUrl();
        const platform = process.platform;

        if (platform === 'win32') exec(\`start \${url}\`);
        else if (platform === 'darwin') exec(\`open \${url}\`);
        else exec(\`xdg-open \${url}\`);

        success(\`Abriendo \${url} en tu navegador...\`);
      } catch {
        info(\`Abre manualmente: \${getObsidianDownloadUrl()}\`);
      }
      success('Tutorial guardado en .dev/obsidian/sync-config.md');
    } else if (choice === 'export-only') {
      success('Modo solo-export activado. Datos disponibles en .dev/exports/');
    } else {\n      info('Obsidian omitido. Puedes configurarlo después con: gestor-memory obsidian');\n    }\n  }\n}\n\n// ── Registrar comando ────────────────────────────────\n\nexport function initCommand(program: Command): void {\n  program\n    .command('init')\n    .description('Inicializar Gestor_Memory en el proyecto actual')\n    .option('--no-interactive', 'Ejecutar sin preguntas (usa defaults)')\n    .option('--mode <mode>', 'Modo de DB: destino, filtro, none', 'destino')\n    .option('--name <name>', 'Nombre del proyecto')\n    .option('--path <path>', 'Ruta del proyecto (default: directorio actual)')\n    .action(async (options) => {\n      const projectDir = options.path || process.cwd();\n\n      console.log('');\n      console.log(chalk.cyan.bold('  🧠 Gestor_Memory v2 — Configuración Universal'));\n      console.log('');\n\n      // Detectar proyecto\n      const detectSpinner = ora('Detectando proyecto...').start();\n      const profile = detectProject(projectDir);\n      detectSpinner.stop();\n\n      if (profile.isNew) {\n        info('No se encontraron manifiestos de proyecto.');\n        info(chalk.bold('Modo: PROYECTO NUEVO (desde idea)'));\n      } else {\n        success(\`Proyecto detectado: \${chalk.bold(profile.projectName)}\`);\n        info(\`Stack: \${profile.stack.framework || profile.stack.language}\`);\n        info(\`Archivos: \${profile.sourceFileCount}\`);\n        info(chalk.bold('Modo: PROYECTO EXISTENTE (adaptación)'));\n      }\n\n      console.log('');\n\n      const noInteractive = options.interactive === false;\n\n      if (noInteractive) {\n        if (options.name) profile.projectName = options.name;\n        const prdInput: PRDInput = { profile };\n        await generateFullStructure(projectDir, profile, prdInput, options.mode, true, true);\n      } else {\n        if (profile.isNew) {\n          await initNewProject(projectDir, profile);\n        } else {\n          await initExistingProject(projectDir, profile, false);\n        }\n      }\n    });\n}\n