---
name: graph-analysis
description: Realiza análisis arquitectónico de grafos (God Nodes, Surprising Connections) en proyectos de Gestor_Memory. Úsalo para auditorías de código y QA.
---

# Graph Analysis Skill

Esta skill te permite auditar la arquitectura de un proyecto usando el grafo de conocimiento de Gestor_Memory.

## Flujo de Trabajo

1. **Exploración:** Usa `mem-graph-analysis` para obtener una visión general de la salud del grafo.
2. **Identificación de God Nodes:** Revisa los nodos con mayor grado de conexión. Si un archivo o clase aparece con muchas conexiones, sugiere una refactorización para mejorar la modularidad.
3. **Investigación de Sorpresas:** Analiza las conexiones cross-file. Pregunta al usuario si estas relaciones son intencionales o si son "leaks" de abstracción.
4. **Resolución de Lagunas:** Usa las preguntas sugeridas para encontrar áreas del código que no están bien integradas o documentadas en el grafo.

## Comandos Relacionados
- `gestor-memory qa --graph` (Si está disponible)
- MCP Tool: `mem-graph-analysis`

## Mejores Prácticas
- Realiza un análisis de grafo después de cada "Zumo" (`gestor-memory zumo`) importante.
- Incluye los hallazgos de esta skill en los documentos de `handoff` y `roadmap`.
