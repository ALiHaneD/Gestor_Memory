# Tutorial: Gestor_Memory — Sistema de Memoria del Ecosistema ALiaNeD

> Guía para implementar el sistema de memoria de 3 capas en NeuroGestor, ALiHas/Spirit, y los módulos de ALiaNeD OS.

---

## Arquitectura de Memoria: Los 3 Cerebros

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        ECOSISTEMA ALiaNeD                                           │
│                                                                                     │
│    ┌────────────────────────────────────────────────────────────────────────────┐   │
│    │                    OBSIDIAN COMÚN (Fuente de Verdad)                       │   │
│    │                                                                            │   │
│    │         ┌─────────────────┬─────────────────┬─────────────────┐            │   │
│    │         │   NeuroGestor   │      Spirit     │  Agente Cien.   │            │   │
│    │         │    (escribe)    │     (escribe)   │    (escribe)    │            │   │
│    │         └─────────────────┴─────────────────┴─────────────────┘            │   │
│    └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│    ┌────────────────────────────────────────────────────────────────────────────┐   │
│    │                    CORE MEMORY (NeuroGestor)                                │   │
│    │                    PostgreSQL + pgvector + Apache AGE                      │   │
│    │                                                                            │   │
│    │    • Datos del negocio (clientes, transacciones, configuraciones)           │   │
│    │    • Políticas de seguridad y auditoría                                   │   │
│    │    • Memoria corporativa del ecosistema                                    │   │
│    └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│         │                              │                              │              │
│         ▼                              ▼                              ▼              │
│  ┌─────────────┐               ┌─────────────┐               ┌─────────────┐       │
│  │  AGENT      │               │  AGENT      │               │  AGENT      │       │
│  │  MEMORY     │               │  MEMORY     │               │  MEMORY     │       │
│  │  (Spirit)   │               │  (Agente    │               │  (ALiHas)   │       │
│  │             │               │   Cient.)   │               │             │       │
│  └─────────────┘               └─────────────┘               └─────────────┘       │
│                                                                                     │
│                                                              ┌─────────────┐       │
│                                                              │  SECRET     │       │
│                                                              │  MEMORY     │       │
│                                                              │  (ALiHas)   │       │
│                                                              │             │       │
│                                                              │ Vida sec.   │       │
│                                                              │ del dueño   │       │
│                                                              └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Las 4 Capas de Memoria Explicadas

### 1. OBSIDIAN COMÚN — Fuente de Verdad Compartida

| Aspecto | Detalle |
|:---|:---|
| **Ubicación** | Una sola bóveda Obsidian por proyecto/organización |
| **Acceso** | Los 3 agentes pueden leer y escribir |
| **Contenido** | Conocimiento compartido, investigaciones, notas de equipo |
| **Gestor** | Los 3 agentes enriquecen conjuntamente |

**¿Qué almacena?**
- Notas de reuniones compartidas
- Investigaciones relevantes para el negocio
- Documentación técnica del equipo
- Hitos y seguimiento de proyectos
- Conocimiento que debe estar disponible para todos

**Ejemplo de nota compartida:**
```markdown
# Reunión: Plan de Expansión Barberías

## Asistentes
- Spirit (investigación de mercado)
- NeuroGestor (análisis de riesgo)
- Agente Científico (datos demográficos)

## Hallazgos
- Crecimiento del 40% en búsquedas de barberías premium
- Mejor día: viernes
- Zona objetivo: norte de la ciudad

## Acciones
- [ ] Spirit: Investigar competidores
- [ ] NeuroGestor: Crear políticas de seguridad
- [ ] Agente Científico: Analizar datos de encuestas
```

---

### 2. CORE MEMORY — NeuroGestor (Memoria Corporativa)

| Aspecto | Detalle |
|:---|:---|
| **Base de datos** | PostgreSQL + pgvector + Apache AGE |
| **Gestor** | NeuroGestor (Firewall Cognitivo) |
| **Acceso** | Compartido por todo el ecosistema |
| **Contenido** | Datos del negocio, clientes, configuraciones, políticas |

**¿Qué almacena?**
- Configuraciones de clientes y sus políticas
- Transacciones y datos empresariales
- Reglas de seguridad y auditoría
- Templates de AGENTS.md, CLAUDE.md, GEMINI.md
- PRD y roadmap de proyectos
- Handoffs entre agentes

**Ejemplo de contenido:**
```markdown
## Cliente: Barbería Los Reyes
- Plan: Agencia Media
- Políticas: 3 hilos activos
- NeuroGestor: Monitoreando 12 agentes
- último análisis: 2026-04-23
- Obsidian: /barberia-los-reyes/notas/
```

---

### 3. AGENT MEMORY — Cada Agente (Memoria Personal)

| Aspecto | Detalle |
|:---|:---|
| **Base de datos** | SQLite local (por agente) |
| **Gestor** | Cada agente tiene la suya propia |
| **Acceso** | Solo el agente específico |
| **Contenido** | Preferencias, estilo de trabajo, notas privadas |

**¿Qué almacena cada agente?**

| Agente | Contenido |
|:---|:---|
| **Spirit** | Investigaciones en proceso, borradores, artículos a revisar |
| **Agente Científico** | Modelos predictivos, hipótesis, datos de laboratorio |
| **ALiHas** | Notas personales, preferencias del usuario, historial de chat |

---

### 4. SECRET MEMORY — ALiHas (Memoria Privada del Dueño)

| Aspecto | Detalle |
|:---|:---|
| **Base de datos** | SQLite encriptado o PostgreSQL con RLS |
| **Gestor** | Solo ALiHas y el dueño tienen acceso |
| **Acceso** | TOTALMENTE PRIVADO - filtrado de vida personal |
| **Contenido** | Agenda personal, notas privadas, secretos |

**⚠️ IMPORTANTE: Esta capa está FILTRADA**

ALiHas tiene dos tipos de memoria:
1. **Agent Memory** - Notas profesionales que pueden compartirse
2. **Secret Memory** - Vida personal del dueño que NUNCA se comparte

**¿Qué almacena?**
- Notas personales del día a día
- Agenda y citas personales
- Información financiera personal
- Recetas, gustos, preferencias privadas
- Cualquier cosa que el dueño quiera mantener en privado

**Ejemplo:**
```markdown
## SECRET MEMORY — Miguel Ángel
- Doctor: Dr. García, cita 15 mayo
- Cuenta bancaria personal: NO compartir nunca
- Preferencias de regalo para esposa: flores blancas
- Proyecto secreto: Birthday surprise party
```

---

## Implementación en NeuroGestor

NeuroGestor gestiona el **CORE MEMORY** y supervisa el **OBSIDIAN COMÚN**.

### Estructura de Archivos

```
neurogestor/
├── config.yaml                 # Configuración del gestor
├── core-memory/
│   ├── db.ts                   # Conexión PostgreSQL
│   ├── schema/
│   │   ├── index.ts           # Tablas Drizzle
│   │   ├── knowledge_nodes.ts
│   │   ├── knowledge_edges.ts
│   │   ├── embeddings.ts
│   │   └── retention_policies.ts
│   └── engine/
│       ├── query.ts           # Búsqueda semántica
│       ├── ingest.ts          # Ingesta de datos
│       ├── retention.ts       # Políticas de retención
│       └── synthesis.ts       # Generación de síntesis
├── obsidian/
│   └── sync.ts                # Sincronización con bóveda común
└── agents/
    └── neurogestor-agent.ts    # Agente que supervisa hilos
```

### Código: Conexión al Core Memory

```typescript
// neurogestor/core-memory/db.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool } from './pool';
import * as schema from './schema';

export function getCoreMemory(config: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}) {
  const pool = getPool(config);

  return drizzle(pool, { schema });
}

// Guardar nodo de conocimiento
export async function saveKnowledgeNode(
  content: string,
  source: string,
  metadata: Record<string, any> = {}
) {
  const db = getCoreMemory(config);
  const nodeId = crypto.randomUUID();

  await db.insert(knowledgeNodes).values({
    id: nodeId,
    content,
    source,
    sourceType: 'neurogestor',
    metadata,
  });

  return nodeId;
}
```

### Código: Sincronización con Obsidian Común

```typescript
// neurogestor/obsidian/sync.ts
import * as fs from 'fs';
import * as path from 'path';

interface ObsidianSyncConfig {
  vaultPath: string;
  sharedVault: string;  // Ruta al Obsidian compartido
}

export async function syncToObsidianCommon(
  noteContent: string,
  fileName: string,
  config: ObsidianSyncConfig
) {
  const sharedDir = path.join(config.sharedVault, 'shared');

  // Guardar en Obsidian común
  const filePath = path.join(sharedDir, `${fileName}.md`);
  fs.writeFileSync(filePath, noteContent, 'utf-8');

  return filePath;
}

export async function readFromObsidianCommon(
  fileName: string,
  config: ObsidianSyncConfig
): Promise<string> {
  const filePath = path.join(config.sharedVault, 'shared', `${fileName}.md`);

  if (!fs.existsSync(filePath)) {
    return '';
  }

  return fs.readFileSync(filePath, 'utf-8');
}
```

---

## Implementación en Spirit (Agente Personal)

Spirit tiene **AGENT MEMORY** y contribuye al **OBSIDIAN COMÚN**.

### Estructura de Archivos

```
spirit/
├── config.yaml                 # Configuración de Spirit
├── agent-memory/
│   ├── db.ts                  # Conexión SQLite
│   ├── personal-notes.ts      # Notas personales
│   ├── investigations.ts      # Investigaciones activas
│   └── obsidian-sync.ts       # Sincronización con Obsidian común
└── shared/
    └── contributions/         # Lo que Spirit comparte al equipo
```

### Código: Agent Memory de Spirit

```typescript
// spirit/agent-memory/db.ts
import Database from 'better-sqlite3';

interface Investigation {
  id: string;
  topic: string;
  status: 'draft' | 'review' | 'published';
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export function getSpiritMemory(dbPath: string = './spirit-memory.db') {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

export function saveInvestigation(investigation: Omit<Investigation, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getSpiritMemory();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO investigations (id, topic, status, content)
    VALUES (?, ?, ?, ?)
  `).run(id, investigation.topic, investigation.status, investigation.content);

  return id;
}
```

### Código: Contribución a Obsidian Común

```typescript
// spirit/obsidian-sync.ts
import { syncToObsidianCommon } from '../neurogestor/obsidian/sync';

export async function shareWithTeam(
  topic: string,
  findings: string,
  vaultPath: string
) {
  const content = `# Investigación: ${topic}

## Hallazgos
${findings}

## Estado
- Agente: Spirit
- Fecha: ${new Date().toISOString().split('T')[0]}
- Status: En revisión

---
*Generado por Spirit para el equipo ALiaNeD*
`;

  await syncToObsidianCommon(content, `investigacion-${topic}`, {
    vaultPath,
    sharedVault: vaultPath,
  });
}
```

---

## Implementación en ALiHas (Asistente Personal)

ALiHas tiene **AGENT MEMORY** + **SECRET MEMORY** y contribuye al **OBSIDIAN COMÚN**.

### Estructura de Archivos

```
alihas/
├── config.yaml                 # Configuración de ALiHas
├── agent-memory/
│   ├── db.ts                  # Conexión SQLite (memoria profesional)
│   ├── preferences.ts         # Preferencias del usuario
│   └── markda.ts             # MarkDA (Markdown Daily)
└── secret-memory/
    ├── db.ts                  # Conexión SQLite encriptado
    ├── personal-agenda.ts     # Agenda personal
    ├── secrets.ts             # Información sensible filtrada
    └── vault.ts               # Bóveda de secretos
```

### Código: Agent Memory (Profesional)

```typescript
// alihas/agent-memory/db.ts
import Database from 'better-sqlite3';

export function getAgentMemory(dbPath: string = './alihas-memory.db') {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_memory (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

export function saveProfessionalNote(content: string, type: 'note' | 'task' | 'meeting') {
  const db = getAgentMemory();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO agent_memory (id, type, content, metadata)
    VALUES (?, ?, ?, '{}')
  `).run(id, type, content);

  return id;
}
```

### Código: Secret Memory (PRIVADO)

```typescript
// alihas/secret-memory/db.ts
import Database from 'better-sqlite3';
import * as crypto from 'crypto';

interface SecretConfig {
  key: string;  // Clave de encriptación
}

export function getSecretMemory(
  dbPath: string = './alihas-secrets.db',
  config: SecretConfig
) {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS secret_memory (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

// Encriptar contenido sensible
function encrypt(text: string, key: string): string {
  const iv = crypto.randomBytes(16);
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Desencriptar contenido
function decrypt(text: string, key: string): string {
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function saveSecret(
  type: 'personal' | 'financial' | 'health',
  content: string,
  key: string
) {
  const db = getSecretMemory('./alihas-secrets.db', { key });
  const encrypted = encrypt(content, key);
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO secret_memory (id, type, content, metadata)
    VALUES (?, ?, ?, '{}')
  `).run(id, type, encrypted);

  return id;
}
```

### Regla de Oro: FILTRADO

```
┌─────────────────────────────────────────────────────────────┐
│                    ALiHas — Regla de Filtrado               │
│                                                             │
│  Agent Memory  ──►  Obsidian Común  ──►  Compartido ✅      │
│                                                             │
│  Secret Memory ──►  NUNCA sale     ──►  Privado 🔒         │
│                                                             │
│  ⚠️ Si el usuario pregunta algo que está en Secret Memory,   │
│     ALiHas responde: "Eso es información personal, no        │
│     comparto eso."                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementación en Gestionapp / Smart ERP

Los módulos de ALiaNeD OS usan el **CORE MEMORY** para datos del negocio.

### Estructura de Archivos

```
gestionapp/  (o  smart-erp/)
├── config.yaml
├── modules/
│   ├── crm/                   # CRM - usa Core Memory
│   ├── accounting/            # Contabilidad
│   ├── inventory/             # Inventario
│   └── hr/                    # Recursos Humanos
└── gestor-memory/
    └── client.ts              # Cliente para conectar a Core Memory
```

### Código: Cliente para Core Memory

```typescript
// gestionapp/gestor-memory/client.ts
import { createClient } from '@supabase/supabase-js';

interface GestorMemoryConfig {
  coreMemoryUrl: string;
  coreMemoryKey: string;
}

export function getGestorMemoryClient(config: GestorMemoryConfig) {
  return createClient(config.coreMemoryUrl, config.coreMemoryKey);
}

// Guardar dato de módulo en Core Memory
export async function syncModuleData(
  module: string,
  entityType: string,
  data: Record<string, any>
) {
  const client = getGestorMemoryClient(config);

  await client.from('knowledge_nodes').insert({
    content: JSON.stringify(data),
    source: `gestionapp.${module}`,
    sourceType: entityType,
    metadata: { module, entityType },
  });
}
```

---

## Integración con Proyecto Existente

El sistema NO crea una nueva base de datos cada vez. Se integra a la arquitectura existente.

### Paso 1: Detectar la Arquitectura

```bash
# Detectar qué componentes ya existen
gestor-memory detect

# Output:
# ✅ Obsidian común encontrado: /path/to/vault
# ✅ Core Memory detectado: PostgreSQL en localhost:5432
# ✅ Agent Memories: 3 agentes detectados
# ✅ Secret Memory: Configurado para ALiHas
```

### Paso 2: Configurar Conexiones

```yaml
# .gestor-memory/config.yaml
version: "2.0.0"

obsidian:
  commonVault: "/path/to/obsidian-vault"
  agentVaults:
    spirit: "/path/to/spirit-vault"
    alihas: "/path/to/alihas-vault"
    neurogestor: "/path/to/neurogestor-vault"

coreMemory:
  host: "localhost"
  port: 5432
  database: "gestor_memory"
  user: "gestor"
  password: "${PG_PASSWORD}"

agentMemories:
  spirit:
    type: "sqlite"
    path: "./data/spirit-memory.db"
  agente-cientifico:
    type: "sqlite"
    path: "./data/cientifico-memory.db"
  alihas:
    type: "sqlite"
    path: "./data/alihas-memory.db"

secretMemory:
  alihas:
    type: "sqlite-encrypted"
    path: "./data/alihas-secrets.db"
    encryptionKey: "${SECRET_KEY}"
```

### Paso 3: Conectar a la Arquitectura

```bash
# Conectar al Obsidian común existente
gestor-memory obsidian --connect --vault /path/to/vault

# Conectar al Core Memory existente
gestor-memory connect --core-memory postgresql://localhost:5432/gestor_memory

# Verificar conexiones
gestor-memory status
```

### Arquitectura Final Integrada

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PROYECTO EXISTENTE INTEGRADO                          │
│                                                                         │
│   ┌─────────────────┐                                                   │
│   │  OBSIDIAN       │◄─────────────────────┐                            │
│   │  COMÚN          │                      │                            │
│   └────────┬────────┘                      │                            │
│            │                              │                            │
│   ┌────────┼────────┬─────────────────────┼────────────────┐          │
│   ▼        ▼        ▼                     ▼                ▼          │
│ ┌──────┐ ┌──────┐ ┌──────┐         ┌────────────┐ ┌───────────┐      │
│ │Neuro │ │Spirit│ │ALiHas│         │ Gestionapp │ │Smart ERP  │      │
│ │Gestor│ │      │ │      │         │ (módulo)   │ │(módulo)   │      │
│ └──┬───┘ └──┬───┘ └──┬───┘         └─────┬──────┘ └─────┬─────┘      │
│    │        │        │                     │              │            │
│    ▼        ▼        ▼                     ▼              ▼            │
│ ┌──────────────────────────────────────────────────────────────┐      │
│ │                    CORE MEMORY (PostgreSQL)                   │      │
│ │         Un solo PostgreSQL para todo el ecosistema           │      │
│ └──────────────────────────────────────────────────────────────┘      │
│                                                                         │
│    ┌─────────────┐        ┌─────────────┐        ┌─────────────┐      │
│    │  Spirit     │        │  ALiHas     │        │  Agente     │      │
│    │  Memory     │        │  Memory     │        │  Científico │      │
│    │  (SQLite)   │        │  (SQLite)   │        │  (SQLite)   │      │
│    └─────────────┘        └─────────────┘        └─────────────┘      │
│                                │                                          │
│                         ┌─────────────┐                                   │
│                         │  SECRET     │                                   │
│                         │  MEMORY     │                                   │
│                         │  (ALiHas)   │                                   │
│                         └─────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Comandos de Referencia

| Comando | Descripción |
|:---|:---|
| `gestor-memory init` | Inicializar/configurar proyecto |
| `gestor-memory detect` | Detectar arquitectura existente |
| `gestor-memory connect` | Conectar a Core Memory |
| `gestor-memory obsidian` | Configurar Obsidian |
| `gestor-memory status` | Ver estado del sistema |
| `gestor-memory save` | Guardar en Core Memory |
| `gestor-memory search` | Buscar en memoria |

---

## Flujo de Trabajo por Agente

### NeuroGestor (Supervisión)

```bash
# NeuroGestor vigila los hilos
neurogestor watch --threads all

# Analiza nuevo conocimiento
neurogestor analyse --source "nueva-informacion"

# Sincroniza con Obsidian común
neurogestor sync --to common-vault
```

### Spirit (Mantenieminto y Soporte del ERP)

```bash
# Spirit investiga un tema
spirit research --topic "tendencias-mercado"

# Comparte hallazgo con equipo
spirit share --finding "Crecimiento del 40%"

# Actualiza su Agent Memory
spirit note --type investigation --content "Nuevos datos sobre..."
```

### ALiHas (Asistente Personal)

```bash
# ALiHas responde al usuario
alihas ask "Qué tengo mañana?"

# ALiHas guarda nota profesional
alihas note --type professional --content "Reunión con cliente a las 3pm"

# ALiHas guarda secreto (nunca se comparte)
alihas secret --type personal --content "Cumpleaños de esposa el 20 de mayo"
```

---

## Variables de Entorno

```bash
# Core Memory
PG_HOST=localhost
PG_PORT=5432
PG_DB=gestor_memory
PG_USER=gestor
PG_PASSWORD=${PG_PASSWORD}

# Obsidian
OBSIDIAN_COMMON_VAULT=/path/to/common-vault

# Secret Memory (ALiHas)
SECRET_ENCRYPTION_KEY=${SECRET_KEY}

# Agent Memories
SPIRIT_DB=/data/spirit-memory.db
ALIHAS_DB=/data/alihas-memory.db
CIENTIFICO_DB=/data/cientifico-memory.db
```

---

## Próximos Pasos

1. **Ejecuta** `gestor-memory init` en tu proyecto
2. **Detecta** la arquitectura con `gestor-memory detect`
3. **Configura** las conexiones en `.gestor-memory/config.yaml`
4. **Implementa** cada capa según el rol:
   - NeuroGestor → Core Memory + Obsidian Común
   - Spirit → Agent Memory + Obsidian Común
   - ALiHas → Agent Memory + Secret Memory + Obsidian Común
   - Modulos ALiaNeD OS → Core Memory

---

## Recursos

- Docs: `docs/` en este repo
- BIBLIA: `Doc-Arismendy/BIBLIA-DEL-ECOSISTEMA/`
- Auditorías: `Auditorias/implementation_plan.md`
