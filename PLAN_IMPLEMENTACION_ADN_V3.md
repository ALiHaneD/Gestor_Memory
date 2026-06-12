# PLAN DE IMPLEMENTACIÓN — Gestor_Memory v3 "ADN ALIANED"

> **Documento autocontenido.** Eres el agente ingeniero de software fullstack ejecutor.
> Este plan fue elaborado por el Arquitecto/PM ALIHA tras una auditoría completa del código.
> No necesitas contexto adicional: todo lo que debes saber está aquí.
> Al terminar cada fase, actualiza la sección "Registro de Avance" al final de este archivo.
> El Auditor ALIHA revisará tu trabajo contra `Auditorias/CHECKLIST_AUDITORIA_ADN_V3.md`.

- **Proyecto:** `Gestor_Memory` (este repositorio)
- **Rol del proyecto:** ADN de todos los proyectos del ecosistema ALIANED. Al aplicarlo a cualquier app, módulo ERP, base de datos o tool, debe dar a CUALQUIER LLM (Claude, Gemini, Kimi, Qwen, etc.) memoria portátil, estructura comprensible y consumo de tokens optimizado, independiente de la sesión o el modelo.
- **Idioma:** comunicación y documentación en español; código e identificadores en inglés.
- **Fecha del plan:** 2026-06-11

---

## 0. Diagnóstico que motiva este plan (resumen de auditoría)

El sistema actual genera bien la estructura (`.dev/`, AGENTS.md, CLAUDE.md) pero la capa de
memoria/grafo es una fachada. Evidencia verificada en código:

| # | Problema | Evidencia |
|---|----------|-----------|
| D1 | Embeddings falsos (vectores `Math.random()`) | `cli/commands/zumo.ts:97-115` |
| D2 | Grafo falso: conecta nodos secuenciales i→i+1..i+4 con `related_to`; síntesis con métricas inventadas (`depends_on = edges*0.3`) | `cli/commands/zumo.ts:117-131, 209-215` |
| D3 | Circuito cortado: `zumo` escribe JSON en `.dev/zumo/` (gitignored) y NUNCA inserta en la DB; el MCP server lee de PostgreSQL que siempre está vacía | `cli/commands/zumo.ts:259-276` vs `mcp-server/index.ts:214-255` |
| D4 | `mem-search` semántico busca con vector de ceros `new Array(1536).fill(0)` | `mcp-server/index.ts:242-243` |
| D5 | Tools v3 (`mem-v3-search`, `mem-v3-lease`, `mem-v3-consolidate`) son mocks que devuelven texto fijo "✅ ejecutado" | `mcp-server/index.ts:341-377` |
| D6 | `init` no registra el MCP en el proyecto destino, no instala hooks, no copia skills | `cli/commands/init.ts` (solo escribe templates y `.dev/`) |
| D7 | Protocolo Session Start/End depende de la obediencia voluntaria del LLM; sin enforcement | `cli/templates/AGENTS.md.template` |
| D8 | Dependencia de PostgreSQL+pgvector+Apache AGE que no corre en ningún entorno real (`databases: []` en `.gestor-memory/config.json`) | arquitectura |
| D9 | **SEGURIDAD:** credenciales expuestas dentro del repo | `Doc-Arismendy/CUENTAS/GITHUB.txt`, `Doc-Arismendy/Clave-Vertex_AI/alianed-471922-*.json`, `Doc-Arismendy/Docuemntacion interna Alianed/credencial.env`, `Doc-Arismendy/Ali Code/CUENTA= angelarismendyroa.txt` |

---

## 1. Decisiones arquitectónicas (NO negociables — del Arquitecto)

**A1 — File-first.** La memoria/ADN vive en ARCHIVOS dentro del repo del proyecto destino:
Markdown + JSON + SQLite (`better-sqlite3`). PostgreSQL/pgvector pasa a ser un modo opcional
"enterprise" (no se elimina el código, se desacopla). Razón: cualquier LLM en cualquier
herramienta puede leer archivos; nadie tiene Postgres+AGE corriendo por proyecto.

**A2 — Una sola fuente de verdad.** Lo que escribe `zumo` es exactamente lo que leen el MCP
server, los hooks y los archivos de convención. Sin caminos paralelos.

**A3 — El ADN se versiona en git.** Nueva carpeta `.gestor-memory/` en el proyecto destino que
SÍ se sube al repo (excepto `cache/`). `.dev/` sigue gitignored para lo efímero.

**A4 — Grafo real o nada.** Las aristas se derivan de relaciones verificables: imports entre
archivos, links markdown, referencias a entidades, co-ocurrencia. Nada de aristas inventadas.
Si existe salida de graphify (`graphify-out/`), se ingiere como fuente preferente.

**A5 — Degradación elegante.** Si no hay proveedor de embeddings disponible, el sistema
funciona en modo keyword/BM25 (SQLite FTS5) y lo declara honestamente. PROHIBIDO simular:
ningún comando puede reportar éxito de algo que no hizo (lección de D5).

**A6 — Token tiers.** Todo el conocimiento se organiza en 3 niveles de presupuesto:
- **Tier 1 (≤2k tokens):** `CONTEXT.md` — cualquier agente entiende el proyecto leyendo solo esto.
- **Tier 2 (≤10k tokens):** + `MAP.md`, `roadmap.md`, `handoffs/current-state.md`, `graph/summary.md`.
- **Tier 3 (bajo demanda):** consultas al grafo vía MCP `mem-search` o CLI `gestor-memory ask`.

---

## 2. Estructura objetivo en el PROYECTO DESTINO (tras `gestor-memory init/apply`)

```
proyecto-destino/
├── .gestor-memory/                  # ← EL ADN. Se sube a git (salvo cache/)
│   ├── manifest.json                # respuestas de la entrevista + config + dnaVersion
│   ├── CONTEXT.md                   # Tier 1: síntesis maestra ≤2000 tokens
│   ├── MAP.md                       # Tier 2: índice jerárquico de carpetas con propósito
│   ├── decisions.md                 # registro de decisiones (ADR ligero, append-only)
│   ├── graph/
│   │   ├── nodes.json               # nodos reales
│   │   ├── edges.json               # aristas reales tipadas
│   │   └── summary.md               # síntesis legible del grafo (god nodes, comunidades)
│   └── cache/                       # gitignored: memory.db (SQLite), embeddings
├── .dev/                            # gitignored (igual que hoy): prd, specs, qa, handoffs
├── .mcp.json                        # ← registra el server gestor-memory (merge, no pisar)
├── .claude/settings.json            # ← hooks SessionStart/Stop (merge, no pisar)
├── AGENTS.md                        # puntero delgado → .gestor-memory/CONTEXT.md + protocolo
├── CLAUDE.md                        # puntero delgado (Claude Code)
├── GEMINI.md                        # puntero delgado (Antigravity/Gemini)
└── roadmap.md                       # público (igual que hoy)
```

Regla de los punteros: AGENTS/CLAUDE/GEMINI.md NO duplican contenido; cada uno tiene ≤30
líneas: instrucción de leer Tier 1, cuándo subir a Tier 2/3, y el protocolo de sesión.

---

## 3. FASES DE IMPLEMENTACIÓN

Ejecutar en orden. Cada fase termina con sus criterios de aceptación en verde y un commit
`feat(fase-N): descripción`. No avanzar de fase con criterios en rojo.

---

### FASE 0 — Seguridad y saneamiento (½ día)

**T0.1** Crear `Doc-Arismendy/.gitignore` o mover secretos: las credenciales listadas en D9
no deben quedar trackeadas por git ni ser ingeridas por el grafo. Acción mínima:
añadir a `.gitignore` raíz: `Doc-Arismendy/CUENTAS/`, `Doc-Arismendy/Clave-Vertex_AI/`,
`**/credencial.env`, `**/CUENTA*`. Si ya están en el historial git, documentarlo en
`Auditorias/SECRETS_PENDIENTES.md` para rotación manual por el CEO (NO rotar tú).

**T0.2** Definir lista de exclusión global de ingesta (constante `INGEST_DENYLIST` en
`core/engine/ingest.ts`): `node_modules`, `.git`, `dist`, `*.env*`, `*credencial*`,
`*CUENTA*`, `*secret*`, `*.key`, `*.pem`, `*token*`, imágenes/binarios/videos.
El motor de ingesta JAMÁS lee un archivo que matchee la denylist.

**T0.3** Eliminar los 3 mocks v3 del MCP server (D5). Las tools `mem-v3-*` se quitan del
registro de tools hasta que existan de verdad (la v3 real es la FASE 5, opcional).

**Aceptación F0:** `git status` no muestra secretos trackeados nuevos; `mcp-server` compila
sin tools mock; existe `INGEST_DENYLIST` con test unitario que prueba que `.env` se excluye.

---

### FASE 1 — Circuito de conocimiento real (2-3 días) → resuelve D1, D2, D3, D4, D8

**T1.1 — Capa de almacenamiento file-first.** Nuevo módulo `core/storage/local.ts`:
- SQLite vía `better-sqlite3` en `.gestor-memory/cache/memory.db` del proyecto destino.
- Tablas: `nodes(id, content, source, source_type, created_at, metadata)`,
  `edges(source_id, target_id, relationship, weight)`,
  `embeddings(node_id, vector BLOB, model, dims)`,
  tabla virtual FTS5 `nodes_fts(content)` para keyword search.
- Exportar/importar a `graph/nodes.json` + `graph/edges.json` (el JSON es lo que viaja en
  git; el SQLite es cache local reconstruible con `gestor-memory zumo --rebuild`).
- Interfaz `StorageAdapter` con dos implementaciones: `LocalStorageAdapter` (default) y
  `PostgresStorageAdapter` (envuelve el código existente de `core/db.ts`; solo se activa si
  `manifest.json` declara `storage: "postgres"` y la conexión responde).

**T1.2 — Proveedor de embeddings real.** Nuevo módulo `core/embeddings/provider.ts`:
- `OllamaProvider` (default — el CEO tiene Ollama instalado): `POST
  http://localhost:11434/api/embeddings` modelo `nomic-embed-text` (768 dims). Detectar
  disponibilidad con timeout de 2s.
- `GeminiProvider`: `text-embedding-004` si hay `GEMINI_API_KEY` en env.
- `OpenAIProvider`: `text-embedding-3-small` si hay `OPENAI_API_KEY` en env.
- `NoneProvider`: sin embeddings → el sistema opera en modo keyword (FTS5) y TODA salida
  de comandos lo indica: `⚠ modo keyword (sin embeddings)`. Nunca vectores aleatorios.
- Las dims se guardan por embedding junto al nombre del modelo (no hardcodear 1536). Si el
  modelo de embeddings del cache difiere del configurado, `doctor` lo marca y `zumo --rebuild`
  re-embebe.
- Nota: las suscripciones de chat (Claude Pro, ChatGPT Plus, Gemini) NO incluyen API key;
  OpenRouter no ofrece endpoint de embeddings. Por eso el orden de detección es:
  Ollama → GEMINI_API_KEY → OPENAI_API_KEY → keyword.

**T1.3 — Grafo real.** Reescribir `buildGraph` (nuevo módulo `core/engine/graph-builder.ts`):
- Aristas `imports` : parsear `import/require` en `.ts/.js/.tsx/.py` (regex es suficiente,
  no hace falta AST completo) → arista archivo→archivo.
- Aristas `links_to` : links markdown `[x](ruta)` y wikilinks `[[x]]` entre docs.
- Aristas `mentions` : co-ocurrencia de entidades nombradas del manifest (módulos/dominios
  declarados en la entrevista, ver FASE 3) en el mismo chunk.
- Aristas `similar_to` : solo si hay embeddings reales, top-k coseno > 0.75, k=3.
- Si existe `graphify-out/graph.json` en el proyecto (salida del skill graphify), ingerirlo
  y fusionar nodos/aristas (graphify es fuente preferente para código).

**T1.4 — Reconectar `zumo` al almacén.** `cli/commands/zumo.ts` reescrito para:
1) ingesta (usar `core/engine/ingest.ts` existente adaptado + denylist), 2) embeddings vía
provider, 3) grafo vía graph-builder, 4) persistir TODO vía StorageAdapter, 5) exportar
`graph/*.json`, 6) generar `graph/summary.md` con datos REALES: god nodes (mayor grado),
conteo por tipo de arista, top comunidades (algoritmo simple de componentes conexos basta;
no inventar números). 7) `--incremental`: solo re-procesar archivos con mtime > último zumo
(guardar timestamp en manifest).

**T1.5 — MCP server honesto.** `mcp-server/index.ts`:
- `mem-search` semántico: generar embedding del query con el provider antes de buscar (fix D4).
  Si el provider es None → degradar a keyword e indicarlo en la respuesta.
- Todas las tools usan StorageAdapter (funciona sin Postgres, fix D3/D8).
- `mem-save` también actualiza `graph/nodes.json` exportado (consistencia A2).
- Nueva tool `mem-context`: devuelve el contenido Tier 1 (`CONTEXT.md`) + estado del handoff;
  es la tool que cualquier agente llama al iniciar sesión para "entender todo el proyecto".

**Aceptación F1 (demostrar con comandos, guardar salida en `Auditorias/evidencia-f1.md`):**
```bash
gestor-memory zumo                  # en este mismo repo
# → debe reportar provider real usado (ollama|gemini|keyword), N archivos, nodos, aristas POR TIPO
cat .gestor-memory/graph/edges.json # → aristas con tipos imports/links_to/mentions (no solo related_to)
gestor-memory ask "¿dónde se genera el PRD?"   # (T2.4) o vía MCP mem-search
# → devuelve chunks de cli/lib/prd-generator.ts entre los top resultados
```
Test crítico: borrar `.gestor-memory/cache/` y verificar que `zumo --rebuild` reconstruye
el SQLite desde los JSON de git.

---

### FASE 2 — ADN portable multi-LLM (1-2 días) → resuelve D7 parcial, objetivo central del CEO

**T2.1 — Context Bundle.** Nuevo `cli/lib/context-bundle.ts` que genera/actualiza:
- `CONTEXT.md`: plantilla con secciones fijas — Qué es el proyecto (de la entrevista),
  Estado actual, Stack, Estructura (top-level), Reglas duras, Cómo pedir más contexto
  (instrucciones Tier 2/3). Límite duro: 2.000 tokens aprox (~8.000 chars); si excede, truncar
  con aviso.
- `MAP.md`: árbol de carpetas (profundidad 2-3, respetando denylist) donde CADA entrada tiene
  una línea de propósito. Las de la convención ALIANED se autoexplican desde plantilla; las
  desconocidas se marcan `(?)` para que el desarrollador las complete.
- `decisions.md`: se crea vacío con instrucciones; los agentes hacen append, nunca reescriben.

**T2.2 — Punteros multi-agente.** Rediseñar templates: `AGENTS.md` (estándar que leen Codex/GPT,
Kilo, Cursor, Qwen-Code, Kimi CLI y DeepSeek — es el puente universal para los modelos vía
OpenRouter), `CLAUDE.md`, `GEMINI.md` → cada uno ≤30 líneas con:
1) "Lee `.gestor-memory/CONTEXT.md` AHORA" 2) protocolo Session Start/End (versión corta)
3) regla de tiers ("no leas el codebase entero; usa MAP.md y mem-search")
4) dónde está el manifest. El contenido largo actual del AGENTS.md template se mueve a
`CONTEXT.md`/`MAP.md`. Generar también `.cursorrules` y `.windsurfrules` con el mismo puntero
si la entrevista (T3.1) declara que se usan esas herramientas.

**T2.3 — Protocolo de sesión accionable.** El Session End del template pasa de "consejo" a
checklist con comando: nueva orden `gestor-memory handoff` que pide por stdin (o flags) los
4 campos del handoff y reescribe `.dev/handoffs/current-state.md` + toca
`manifest.json.lastHandoff`. Los punteros instruyen: "antes de cerrar: `gestor-memory handoff`".

**Aceptación F2:** en un directorio temporal vacío, correr `gestor-memory init --no-interactive
--name demo` y verificar que se generan TODOS los archivos de la estructura objetivo (sección 2);
`CONTEXT.md` < 8KB; AGENTS/CLAUDE/GEMINI.md ≤ 30 líneas cada uno y los tres apuntan al bundle.

---

### FASE 3 — Entrevista guiada (1 día) → petición explícita del CEO

> Objetivo: que al implementar el ADN, Gestor_Memory haga preguntas que guíen al
> desarrollador, y que las respuestas queden en un manifest que CUALQUIER IA lee para saber
> qué se va a hacer y cómo implementarlo en ese proyecto.

**T3.1 — Comando `gestor-memory interview`** (también primer paso de `init` interactivo y
re-ejecutable a mitad de proyecto). Usar Inquirer (ya es dependencia). Preguntas, en español:

| # | Clave manifest | Pregunta | Tipo |
|---|----------------|----------|------|
| 1 | `projectType` | ¿Qué estás construyendo? | select: app web / módulo ERP-Odoo / API-backend / base de datos / skill-tool / agente IA / contenido-marketing / otro |
| 2 | `stage` | ¿En qué etapa está? | select: idea / desarrollo activo / producción / mantenimiento |
| 3 | `purpose` | Describe en 1-2 frases qué hace y para quién | input (alimenta CONTEXT.md §1) |
| 4 | `domains` | Nombra los módulos o dominios principales (separados por coma, ej: ventas, inventario, auth) | input → entidades para aristas `mentions` |
| 5 | `stack` | Stack detectado: [auto-detección]. ¿Correcto? ¿Algo más? | confirm + input |
| 6 | `agents` | ¿Qué herramientas IA trabajarán aquí? | multiselect: Claude Code / Antigravity-Gemini / GPT-Codex / DeepSeek / Kimi / Qwen-Code / Kilo / Cursor / OpenRouter-genérico / otro → decide qué punteros generar (AGENTS.md cubre Codex, DeepSeek, Kimi y Qwen; los demás tienen archivo propio) |
| 7 | `primaryModel` | ¿Qué modelo hará cada rol? (defaults ALIHA: auditoría/seguridad=Claude, contexto amplio=Gemini, volumen/boilerplate=Qwen-Kimi-DeepSeek vía OpenRouter) | confirm de defaults + ajuste → se escribe en CONTEXT.md §Reglas para que cualquier agente sepa cuándo escalar a un modelo superior |
| 8 | `embeddings` | Proveedor de embeddings: [auto-detección: Ollama local / GEMINI_API_KEY / OPENAI_API_KEY]. ¿Cuál usar? | select: ollama (recomendado) / gemini / openai / ninguno-keyword |
| 9 | `excludePaths` | ¿Carpetas con secretos o material que la IA NO debe leer ni indexar? | input → se suma a denylist del manifest |
| 10 | `enforcement` | ¿Instalar hooks automáticos (inyección de contexto al inicio de sesión, recordatorio de handoff)? | confirm |
| 11 | `obsidian` | ¿Sincronizar con un vault de Obsidian? Ruta: | confirm + input |
| 12 | `nextMilestone` | ¿Cuál es el próximo hito concreto? | input → siembra roadmap y current-state.md |

**T3.2 — Salida de la entrevista:**
- `.gestor-memory/manifest.json` con todas las respuestas + `dnaVersion: "3.0.0"` +
  `createdAt/updatedAt` + `lastZumo/lastHandoff`.
- `CONTEXT.md` y `MAP.md` sembrados con las respuestas (purpose, domains, stack).
- `current-state.md` inicial: "Proyecto inicializado. Próximo paso: {nextMilestone}".
- Solo los punteros de las herramientas seleccionadas en #6.
- Si `stage != idea` (proyecto existente): correr zumo inicial automáticamente al final.

**T3.3 — Modo no-interactivo** para agentes: `gestor-memory interview --answers answers.json`
(mismo esquema del manifest). Documentar en `docs/INTERVIEW.md`.

**Aceptación F3:** correr `gestor-memory interview` en un proyecto demo responde las 12
preguntas y produce manifest + bundle coherentes; re-ejecutarla actualiza sin destruir
`decisions.md` ni el grafo.

---

### FASE 4 — Enforcement e integración (1-2 días) → resuelve D6, D7

**T4.1 — Registro MCP automático.** En `init/apply`: escribir/mergear `.mcp.json` del proyecto
destino con el server `gestor-memory` (comando `node <ruta-global>/dist/mcp-server/index.js`,
env `GM_PROJECT_DIR` = proyecto destino). NUNCA pisar otros servers existentes (merge JSON).

**T4.2 — Hooks de Claude Code** (solo si `enforcement: true`): mergear en
`.claude/settings.json` del proyecto destino:
- `SessionStart` → comando `gestor-memory context --brief` que imprime CONTEXT.md +
  current-state.md (esto inyecta el ADN al inicio de CADA sesión sin depender de la
  obediencia del modelo).
- `Stop` → `gestor-memory handoff --check` que imprime advertencia si el handoff tiene >24h
  sin actualizar habiendo cambios en git.

**T4.3 — Hook git post-commit** (opcional, preguntar en entrevista futura; default off):
`gestor-memory zumo --incremental --quiet`.

**T4.4 — Comando `gestor-memory doctor`.** Verifica y reporta semáforo 🟢🟡🔴:
manifest válido y dnaVersion actual / provider de embeddings respondiendo / grafo poblado
(>0 nodos con aristas tipadas) / MCP registrado / hooks instalados / handoff <7 días /
secretos: denylist activa y sin archivos sensibles indexados / consistencia JSON↔SQLite.
Exit code ≠ 0 si hay rojos (usable en CI).

**T4.5 — Comando `gestor-memory apply`.** Idempotente para proyectos EXISTENTES: detecta qué
falta (diff contra estructura objetivo), aplica solo eso, nunca sobreescribe contenido
editado por humanos (si un archivo difiere del template, crear `*.gm-new` y avisar).
Incluir `gestor-memory migrate` para subir dnaVersion en proyectos viejos.

**Aceptación F4:** en proyecto demo: `doctor` todo verde tras `init`; abrir Claude Code en el
demo y comprobar que la sesión arranca con el contexto inyectado; `apply` ejecutado dos veces
seguidas no produce cambios la segunda vez (idempotencia).

---

### FASE 5 — OPCIONAL (no bloquea la entrega): v3 real

Solo si las fases 0-4 están auditadas en verde: implementar de verdad RRF
(`core/engine/v3/rrf.ts` ya existe como base), consolidación Ebbinghaus
(`core/engine/v3/ebbinghaus.ts`) corriendo sobre el StorageAdapter, y re-registrar las tools
`mem-v3-*` en el MCP. Métricas de ahorro de tokens en `doctor --stats`.

---

## 4. Reglas duras para el agente ejecutor

1. **NO simular nunca:** ningún comando reporta éxito de operaciones no realizadas; ninguna
   métrica se inventa. Si algo no está disponible, decirlo en la salida.
2. **NO tocar** `Doc-Arismendy/` (salvo T0.1 gitignore), ni borrar `core/db.ts` ni el código
   Postgres (se desacopla detrás de `StorageAdapter`, no se elimina).
3. **NO rotar ni mover credenciales** — solo excluirlas de git/ingesta y reportar (T0.1).
4. TypeScript estricto; compilar a `dist/` con el tsconfig existente; mantener Commander +
   Inquirer + chalk + ora ya presentes. Nueva dependencia permitida: `better-sqlite3`.
   Evitar dependencias pesadas adicionales.
5. Tests mínimos por fase (puede ser `node --test` o vitest): denylist, chunking, graph-builder
   (fixture con 3 archivos que se importan entre sí), storage round-trip JSON↔SQLite, tiers.
6. Commits: `feat(fase-N): ...` / `fix(...)` / `docs(...)`. Un commit por tarea T*.
7. Cada fase actualiza: `README.md` (si cambia el uso), `docs/` correspondiente, y el
   **Registro de Avance** de abajo.
8. Mensajes de usuario del CLI en español; código/identificadores en inglés.
9. Si una decisión no está cubierta por este plan: elegir la opción más simple compatible con
   A1-A6, y registrarla en `.gestor-memory/decisions.md` de ESTE repo.

## 5. Criterio de "terminado" (lo que el Auditor verificará)

La prueba reina, de punta a punta:

1. En una carpeta nueva: `gestor-memory init` → responder la entrevista → estructura objetivo
   completa generada.
2. Copiar dentro 5-10 archivos de código/docs reales → `gestor-memory zumo` → grafo con
   aristas tipadas reales y `summary.md` veraz.
3. Abrir el proyecto con UN LLM cualquiera (Claude Code o Antigravity): la sesión arranca
   entendiendo el proyecto leyendo solo Tier 1 (≤2k tokens), y puede responder "¿dónde está X?"
   vía `mem-search`/`ask` sin escanear el codebase.
4. Cerrar sesión con `gestor-memory handoff`; abrir con OTRO modelo distinto: retoma desde el
   handoff sin redescubrir nada.
5. `gestor-memory doctor` todo en verde. `git status` sin secretos.

---

## 6. Registro de Avance (lo completa el agente ejecutor)

| Fase | Estado | Archivos clave | Notas |
|------|--------|----------------|-------|
| F0 | ✅ completada | `.gitignore`, `core/engine/ingest.ts` (INGEST_DENYLIST), `mcp-server/index.ts` (mocks eliminados), `Auditorias/SECRETS_PENDIENTES.md` | tsc limpio |
| F1 | ✅ completada | `core/storage/local.ts`, `core/embeddings/provider.ts`, `core/engine/graph-builder.ts`, `cli/commands/zumo.ts` (reescrito), `mcp-server/index.ts` (honesto + mem-context) | tsc limpio |
| F2 | ✅ completada | `cli/lib/context-bundle.ts`, templates AGENTS/CLAUDE/GEMINI rediseñados, `cli/commands/handoff.ts` | tsc limpio |
| F3 | ✅ completada | `cli/commands/interview.ts` (12 preguntas, modo --answers) | tsc limpio |
| F4 | ✅ completada | `cli/commands/doctor.ts`, `cli/commands/apply.ts`, `cli/index.ts` actualizado | tsc limpio |
| F5 (opcional) | ⬜ pendiente | — | Depende de auditoría F0-F4 |

---
*Plan elaborado por el Arquitecto/PM ALIHA — 2026-06-11. Auditoría final obligatoria antes de cierre (protocolo ALIHA).*
