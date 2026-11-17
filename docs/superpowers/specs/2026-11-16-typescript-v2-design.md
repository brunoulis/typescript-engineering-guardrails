# Evolución de TypeScript Engineering Guardrails hasta v2.0

Estado: diseño completo aprobado explícitamente por el usuario el 2026-11-16, incluyendo PostgreSQL y TimescaleDB. Implementación autorizada hasta v2.0; decisiones técnicas detalladas ejecutadas conforme al plan.

Revisión independiente inicial y de la ampliación PostgreSQL/TimescaleDB: completadas sin preguntas importantes pendientes. El usuario aprobó después la implementación completa y pidió trabajar en main sin rama codex. La revisión independiente del código y sus correcciones se documentan en el registro de verificación.

## Objetivo y punto de partida

Convertir el auditor sintáctico actual en una herramienta TypeScript mantenible que aporte evidencias sobre tipos, arquitectura y backends. Conservar los contratos existentes y distinguir señales estáticas de defectos demostrados. El código mantenido del auditor y sus tests estará escrito en TypeScript estricto; JavaScript será únicamente salida generada.

PostgreSQL tendrá un módulo independiente del ORM; TimescaleDB será su especialización para series temporales. Auditar SQL directo, node-postgres, postgres.js y Drizzle según las decisiones del proyecto, sin imponer una migración de driver ni el uso de TimescaleDB cuando PostgreSQL normal sea suficiente.

Repositorio: `typescript-engineering-guardrails-v1.1/typescript-engineering-guardrails`, revisión inicial `d1bf4e6`, versión 1.2.0. El árbol estaba limpio antes de esta propuesta. Node 24.22.1, npm 11.19.1 y TypeScript 6.0.3 instalados. `npm run verify` pasa: 57 tests del auditor, typecheck del ejemplo y 11 tests HTTP/SQLite.

El auditor reside en `scripts/ts-rails-audit.cjs`; usa `createSourceFile`, ocho reglas y reportes JSON schemaVersion 1. Exporta `getTS`, `audit`, `scan` y `files`. Los tres archivos de tests son CommonJS. El ejemplo Hono/SQLite usa autenticación inyectada; no contiene Better Auth ni Drizzle.

Entorno observado: Deno 2.9.8 disponible; Bun no encontrado en PATH. Docker Desktop está instalado, pero su motor Linux no responde. Esto condiciona la ejecución local de PostgreSQL; no permite dar por verificada esa integración.

## Enfoques

1. **Migración incremental conservando el CLI (recomendado).** Caracterizar los contratos, mover código a módulos TypeScript y añadir capacidades por etapas verificables. Reduce el riesgo de romper instalaciones y conserva el corpus existente.
2. **Reescritura simultánea del CLI y formato.** Permite una interfaz limpia, pero obliga a migrar consumidores y dificulta separar regresiones de cambios intencionados. Se descarta por su coste de compatibilidad.
3. **Envolver exclusivamente herramientas externas.** Aprovecha analizadores maduros, pero deja sin resolver las reglas diferenciales entre módulos y frameworks. Se usarán herramientas externas donde aporten valor, manteniendo un núcleo propio.

Se propone el primer enfoque y adaptadores explícitos del tercero. No se crearán carpetas vacías, interfaces por clase, contenedores de inyección ni motores de plugins anticipados.

## Contratos que se conservan

- El comando `node scripts/ts-rails-audit.cjs` sigue disponible. El adaptador CommonJS será generado desde una entrada TypeScript; no habrá dos implementaciones mantenidas.
- Se conservan las firmas y resultados de `getTS`, `audit`, `scan` y `files` para el modo sintáctico, incluidos `maxFileBytes`, selección de paths y exclusión de tests.
- El comportamiento predeterminado sigue siendo `syntax`. Los consumidores existentes no necesitan resolver dependencias del proyecto.
- JSON schemaVersion 1 y sus campos existentes se conservan en el modo sintáctico predeterminado. Nuevos campos serán aditivos; las extensiones v2 se identificarán explícitamente por modo y versión de sus secciones.
- Salidas 0/1/2 conservan su significado: análisis completo, error/incompleto y política optativa de señales. Los análisis incompletos tienen precedencia.
- El objetivo auditado permanece sin modificaciones. No se ejecutan sus módulos, scripts, plugins ni configuraciones JavaScript durante el análisis predeterminado.
- Compilador cargado desde la skill o un override absoluto deliberado, nunca desde el proyecto por búsqueda implícita de Node.
- Hallazgos estáticos P2/P3 `HEURISTIC`, con ámbito y limitaciones. Ninguna señal se convierte automáticamente en vulnerabilidad confirmada.

## v1.3: fuente y tests en TypeScript

Mantener un único package y lockfile en la raíz; `tool/` contiene el código, no una segunda instalación del compilador. Organización inicial:

```text
tool/src/cli.ts
tool/src/core/{project-discovery,ast-analyzer,rule-engine}.ts
tool/src/rules/...
tool/src/reporters/{text,json}.ts
tool/src/types/...
tool/src/interfaces/...
tool/src/constants/...
tool/test/{unit,integration,fixtures}/...
scripts/ts-rails-audit.cjs             # generado
```

Crear módulos solo cuando tengan responsabilidad real. `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` e `import type`; `tsc --noEmit` verifica fuente y tests. Compilar para Node 22+ con `tsc`, sin depender del type stripping. Mantener TypeScript 6.0.3 salvo incompatibilidad demostrada; verificar APIs contra sus declaraciones y fuentes oficiales. Añadir tipos de Node fijados al lockfile.

`npm run build` genera el ejecutable y los módulos; `npm test` construye y ejecuta los tests compilados con `node:test`. `npm run verify` incluye typecheck, build, tests y el ejemplo existente. La instalación de instrucciones sigue sin requerir Node. La preparación del auditor añade el build explícito tras `npm ci --ignore-scripts`; README, INSTALL, SKILL y CI se actualizan juntos. Los archivos generados no se editan manualmente.

Aceptación: las 57 caracterizaciones mantienen sus resultados y se prueban CLI, exports, carga segura del compilador y preparación desde una copia limpia.

## v1.4: semántica y dependencias

Añadir `--mode syntax|typed` y `--project PATH`. En typed, usar el tsconfig explícito, o el tsconfig raíz si existe; la ausencia es error de configuración. Las referencias de proyectos se resuelven sin ejecutar builds y se informa de cuáles pudieron analizarse. Un workspace sin una configuración agregadora se analiza con ejecuciones explícitas por proyecto.

Usar `createProgram` y `getTypeChecker` para símbolos, aliases, firmas y resolución de imports según el tsconfig. La selección `--path` limita los archivos que producen hallazgos; las dependencias necesarias aportan contexto y se contabilizan por separado. Configuraciones JSON y declaraciones se leen sin ejecutar código. Dependencias o referencias irresueltas y diagnósticos del compilador quedan en el reporte; un análisis semántico parcial será `INCOMPLETE`. Nunca habrá fallback silencioso a syntax ni desaparición silenciosa de reglas.

El host del compilador aplica límites documentados de lectura y tamaño. Puede leer dependencias declarativas necesarias fuera del scope de hallazgos; informa de lecturas externas y rechaza seguir fuentes mediante symlinks fuera de las raíces admitidas. Debe conservar la protección frente a cargar el compilador del proyecto.

Primeras mejoras verificables:

- Resolver `JSON.parse`, métodos de lectura JSON y símbolos sombreados; distinguir lectura externa y serializadores conocidos. Un validador se reconoce por una integración comprobada, nunca solo por llamarse `parse`.
- Resolver `Promise.all`, aliases y tipos de colecciones; retirar la señal únicamente cuando haya una cota estática demostrable y pequeña. Una tupla grande sigue pudiendo ser problemática. Los casos dinámicos permanecen como indicios.
- Grafo de imports y reexports locales resueltos, con ciclos concretos, separación de imports de tipos y restricciones de capas configuradas.
- Detectar dependencias Hono en módulos declarados como dominio por la configuración; el nombre de una carpeta por sí solo no demuestra una mala arquitectura.

Aceptación: casos positivos y negativos para aliases, símbolos sombreados, tsconfig paths, reexports, imports de tipos, dependencias ausentes, referencias de proyectos y diagnóstico parcial. Comparar syntax/typed sobre el mismo corpus y documentar diferencias, sin prometer análisis general de flujo de datos.

## v1.5: arquitectura, calidad y regresiones

Añadir configuración JSON `--config FILE` con esquema validado, versión, reglas habilitadas, umbrales y fronteras de módulos. Sin carga automática de JS ni herencia ejecutable. CLI explícito prevalece sobre configuración, y esta sobre defaults; opciones desconocidas fallan. Las exclusiones quedan visibles.

Análisis propio: duplicación de cuerpos con suficientes tokens conservando literales y llamadas significativas; complejidad ciclomática por función; ciclos; fronteras configuradas; clases que solo delegan sin contrato. Cada indicio contiene evidencia y admite usos legítimos. No asignar riesgo por longitud de archivo ni similitud entre una interfaz y una clase.

Integrar Knip para código/dependencias posiblemente sin uso y dependency-cruiser para contraste de dependencias cuando aporten cobertura. Ejecutarlos mediante adaptadores explícitos y optativos, versiones fijadas y configuración controlada por la herramienta. No ejecutar sus configuraciones del proyecto sin una selección deliberada. Los fallos o la ausencia del adaptador solicitado hacen incompleta esa sección; no equivalen a cero hallazgos. No reimplementar su análisis general en el núcleo. La ejecución externa requiere aislamiento del proceso, timeout y errores visibles.

Para promesas y usos de tipos ya cubiertos por typescript-eslint, ofrecer una receta ejecutable y versionada o un adaptador explícito; no duplicar el linter bajo otro nombre. Las pruebas de integración deben ejecutar realmente las herramientas integradas.

`--score` emite dimensiones separadas: duplicación, complejidad, acoplamiento, capas delegadoras y evidencia de tests. Grados 3/2/1/0 para 0/1–2/3–9/10+ indicios; `null` cuando no se evaluó. Sin suma ni comparación entre repositorios. La dimensión de tests identifica archivos sin evidencia de importación por tests; no afirma medir cobertura ni relevancia real. Evaluar contratos y calidad de tests exige revisión y pruebas de comportamiento.

Añadir `--baseline FILE`, `--write-baseline FILE`, `--fail-on-new` y `--format sarif` (SARIF 2.1.0). Baseline versionada, validada y asociada a modo, reglas y alcance normalizado. Identidad estable con regla, ruta relativa, contexto AST y ocurrencia; editar líneas ajenas no crea un hallazgo nuevo. Se documenta la ambigüedad al insertar duplicados idénticos. Separar nuevos, conocidos y ausentes; los ausentes de un escaneo incompleto o de scope incompatible no se declaran corregidos. Una baseline nunca oculta diagnósticos. `--write-baseline` es la única escritura explícita y se rechaza sobre fuentes/configuraciones o si el análisis está incompleto. No sobrescribir un archivo existente salvo opción explícita de reemplazo.

SARIF contiene ubicaciones relativas, reglas, fingerprints, invocación y fallos de análisis; conservar el nivel heurístico. Verificar contra el esquema oficial y probar caracteres especiales, rutas Windows y escaneos parciales. La política `--fail-on-new` devuelve 2 solo por nuevos indicios tras una comparación válida; los errores siguen devolviendo 1.

## v1.6: reglas y backend real

Mantener el ejemplo SQLite como regresión rápida. Añadir un ejemplo independiente con Hono, Better Auth, Drizzle y PostgreSQL real, versiones fijadas y migraciones reproducibles. No reutilizar datos, credenciales ni servicios productivos. Usar credenciales locales de prueba, base aislada, limpieza fiable y secretos de test identificados.

El flujo obtiene la sesión mediante Better Auth y resuelve el tenant mediante pertenencia persistida; no confía en headers de identidad. Drizzle aplica owner/tenant en lecturas y escrituras, allowlist de campos, unicidad de idempotencia y transacción para dato + outbox. Configuración explícita de orígenes y cookies conforme a las versiones/entorno.

Pruebas HTTP y persistencia: alta/login/sesión real, sesión ausente/expirada, actor y tenant ajenos, asignación masiva, origen rechazado cuando corresponda, idempotencia y repetición, rollback tras fallo real de PostgreSQL y concurrencia sobre una misma clave. Probar cancelación/lifecycle del servidor y cierre del pool donde aplique. No sustituir rollback o autenticación por mocks.

Reglas de framework: imports y símbolos reales para Context de Hono en dominio configurado; opciones inseguras de Better Auth; update/delete sin predicado y `.set` con entrada HTTP directa en Drizzle. Aislar pruebas que demuestren por qué fixtures, configuraciones de test y wrappers legítimos no equivalen a vulnerabilidades. Scopes sintácticos que no permitan prueba semántica quedan documentados como heurísticos. La autorización o necesidad de una transacción se demuestra con tests, no con la ausencia de un método en el AST.

### PostgreSQL: módulo independiente del ORM

Entregables: `references/postgresql.md`, checklist/plantilla de auditoría de datos y ejemplos TypeScript con SQL y fixtures propios. `references/drizzle.md` enlaza al módulo y trata solo sus particularidades. SKILL activa PostgreSQL por el stack real; no lo presupone por tratarse de un backend. Mantener las reglas específicas en `tool/src/rules/postgresql/` conforme existan comprobaciones implementadas.

| Área | Guardarraíles y evidencia requerida |
| --- | --- |
| Modelado | PK, FK, UNIQUE, CHECK y NOT NULL que representen invariantes; normalización razonable; relaciones y claves tenant-aware cuando el contrato lo exija. Pruebas negativas de integridad. |
| Consultas | Valores parametrizados, identificadores dinámicos mediante mecanismos seguros/allowlist; columnas necesarias, paginación determinista y límites; detectar N+1 mediante consultas reales y recuentos. No afirmar que todo SELECT sin LIMIT es un defecto. |
| Transacciones | Cliente/conexión única por transacción, rollback y liberación; aislamiento, locks y restricciones elegidos por el invariante; evitar read-modify-write vulnerable. Tests con conexiones concurrentes distintas y barreras deterministas. |
| Seguridad | Rol de aplicación con permisos mínimos, autorización por tenant y RLS cuando se adopte. Separar rol de migraciones y de aplicación; probar lecturas y escrituras con el rol efectivo, sin superusuario/BYPASSRLS ni dependencia accidental del owner. |
| Rendimiento | EXPLAIN (ANALYZE, BUFFERS), índices compuestos/parciales justificados por consultas y datos representativos; estadísticas y costes de escritura. No exigir un índice por tabla ni fijar planes exactos sobre fixtures pequeños. |
| Migraciones | Expand/contract, compatibilidad entre versión antigua y nueva, backfills acotados, locks y timeouts; rollback cuando sea viable o recuperación hacia delante documentada. Un borrado irreversible no se presenta como reversible. |
| Conexiones | Presupuesto de pool por proceso/instancia, espera/adquisición, statement/lock/idle-in-transaction timeouts y cierre limpio. Evitar I/O externo prolongado manteniendo una transacción abierta. |
| Testing | PostgreSQL real: conflictos de unicidad, FK/CHECK, rollback, aislamiento por actor/tenant, concurrencia, RLS y fugas de contexto/conexiones. Probar límites y datos inválidos además del camino feliz. |

Contrato obligatorio para node-postgres: `pool.connect()` obtiene el cliente; BEGIN, consultas, COMMIT/ROLLBACK usan ese cliente y se libera en finally. No repartir la transacción entre llamadas `pool.query()`. En postgres.js usar su transacción reservada (`sql.begin` y el objeto recibido en el callback); en Drizzle, el objeto transaccional correspondiente al driver. Verificar APIs contra las versiones fijadas durante la implementación. SQL parametrizado es compatible con cualquier opción: SQL directo no equivale a concatenar entradas.

RLS necesita pruebas de `USING` y `WITH CHECK`, y no sustituye la autenticación. Si se utiliza un contexto de tenant por conexión, su establecimiento debe partir de una identidad verificada y quedar limitado a la transacción; probar que el siguiente usuario del pool no lo hereda. La aplicación no puede ofrecer SQL arbitrario que cambie ese contexto. El propietario suele eludir las políticas y superusuarios/BYPASSRLS las eluden; usar FORCE ROW LEVEL SECURITY cuando proceda y verificar con el rol real. No activar RLS automáticamente en proyectos existentes.

Los ejemplos de EXPLAIN ANALYZE se ejecutan solo en las bases efímeras de prueba: ANALYZE ejecuta la consulta. El auditor offline no conecta a una base ni ejecuta SQL, migraciones o planes sobre el objetivo; cualquier inspección operativa será una acción explícitamente solicitada. Un rollback de prueba tampoco se considera garantía de revertir cualquier efecto externo.

### TimescaleDB: especialización de PostgreSQL

Entregables: `references/timescaledb.md`, ejemplo de telemetría en TypeScript, migraciones SQL propias, fixtures y reglas en `tool/src/rules/timescaledb/` cuando sean comprobables. Activación solo ante extensión/uso identificado. Versionar conjuntamente PostgreSQL, TimescaleDB y drivers; comprobar `server_version` y `pg_extension.extversion` y registrar también el artefacto/contenedor fijado. Diferenciar funciones self-hosted y de Tiger Cloud; ninguna cuenta cloud ni función comercial será requisito tácito del ejemplo.

| Aspecto | Diseño y pruebas |
| --- | --- |
| Hypertables | Justificar frente a tabla normal; columna temporal explícita, tenant/dispositivo, índices y chunk interval relacionados con ingestión/consulta. Probar consultas por rango y rechazo de claves inválidas. |
| time_bucket | Ventanas con límites claros, timestamptz y zona/origen explícitos donde corresponda; distinguir huecos de ceros, ventanas parciales y cambios de horario de verano. No suponer que time_bucket rellena huecos. |
| Continuous aggregates | Refresco incremental/políticas, materialized_only explícito, watermark y datos recientes; probar llegada tardía a un bucket histórico y refresco. La cola reciente no garantiza actualizar datos históricos ya materializados. |
| Hypercore/columnstore | Elegir APIs y capacidades de la versión fijada, orden/segmentación y umbral de conversión justificados con medición. Verificar fidelidad de consultas e inserciones/updates soportados tras conversión; no copiar sintaxis legacy de compresión como si fuera universal. |
| Retención | Presupuesto temporal de datos crudos y agregados, latencia de llegada/refresco y granularidad de chunks. Probar preservación de resúmenes históricos y también la configuración peligrosa que los pierde. |
| Integración TypeScript | Consultas parametrizadas, lotes acotados con atomicidad definida, límites temporales/filas y cancelación; probar SQL directo con drivers y una integración Drizzle sin exigir que el ORM modele todas las APIs de la extensión. |
| Anti-slop | Señales de políticas incompatibles, claves que omiten particiones, lecturas/ingestas sin límites y complejidad sin necesidad. Acompañar con casos válidos y evidencia, sin prometer inferir toda política dinámica o coste SQL mediante AST TypeScript. |

Dos invariantes obligatorios y verificables con la extensión real:

1. Una UNIQUE/PRIMARY KEY de hypertable incluye **todas las columnas de particionado**, incluida la temporal y las adicionales si existen. Probar tanto DDL rechazado como DDL válido; no confundir una clave compuesta con unicidad global de un identificador independiente del tiempo. Si el negocio exige esa unicidad global, diseñar un registro relacional separado o un mecanismo probado.
2. Refrescar un agregado sobre periodos cuyos datos crudos ya fueron eliminados puede borrar sus resúmenes. Diseñar conjuntamente retención y ventanas de refresco, incluidos refrescos manuales, chunks, buckets y datos tardíos. Prueba determinista con fechas fijas, refresco explícito y eliminación de chunks; no esperar días ni depender del scheduler. Añadir una prueba separada de alta/consulta de políticas que verifique su configuración.

La configuración de seguridad se comprueba también para agregados: no asumir que una vista materializada hereda el aislamiento RLS del origen. Verificar soporte y restricciones de la combinación de versiones; el ejemplo expone únicamente una ruta de acceso a agregados con aislamiento demostrado y roles mínimos. Una combinación no soportada debe ser rechazada y documentada, sin desactivar protecciones para obtener un test verde. Si hace falta, separar fixtures de RLS relacional y agregación temporal, sin afirmar que se probó su combinación.

La inspección estática analizará únicamente SQL literal/migraciones y opciones que reconozca con contexto suficiente; valores dinámicos y estado desconocido se indican como no evaluados. No se añadirá un parser SQL casero basado en regex ni detección universal de retenciones/índices mediante nombres. Los riesgos que requieren catálogo, carga o concurrencia se demuestran mediante el ejemplo real y la revisión guiada.

### Matriz mínima de pruebas de datos

No multiplicar cada driver por cada runtime. Compartir datos/casos SQL y ejecutar un conjunto de referencia con cada runtime real:

| Ejecución | Prueba obligatoria |
| --- | --- |
| Node + node-postgres + PostgreSQL | Suite completa de contratos de conexión/transacción, restricciones, RLS, migraciones y concurrencia. |
| Node + Drizzle + PostgreSQL | Backend Hono/Better Auth, aislamiento e idempotencia/outbox ya descritos. |
| Node + node-postgres + TimescaleDB | Suite completa de hypertables, claves, buckets, agregados, columnstore y retención. |
| Bun + postgres.js + PostgreSQL/TimescaleDB | Consultas y lotes parametrizados, rollback/errores, claves, buckets, refresco y retención; cierre del cliente. |
| Deno + postgres.js vía npm + PostgreSQL/TimescaleDB | Los mismos contratos de referencia con deno check/test y permisos de red/entorno mínimos documentados; cierre y fallo ante permisos ausentes. |
| Node + Drizzle + TimescaleDB | Inserción y consulta de la hypertable y consumo del agregado mediante APIs verificadas/SQL parametrizado. |

Las versiones exactas y configuración del driver de cada fila se fijan tras verificar compatibilidad; una fila no ejecutada queda pendiente, no se declara soportada por analogía con Node. Las suites de datos se pueden ejecutar en Linux CI con instancias efímeras fijadas. Los tests de retención/DDL destructivo usan exclusivamente instancias dedicadas de prueba y no aceptan una URL productiva como destino implícito.

### Fuentes oficiales consultadas para la ampliación (2026-11-16)

- [node-postgres: transacciones](https://node-postgres.com/features/transactions): mismo cliente para toda la transacción.
- [Postgres.js: transacciones](https://github.com/porsager/postgres#transactions): conexión reservada y objeto del callback.
- [PostgreSQL: RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): roles, owner/BYPASSRLS, USING y WITH CHECK.
- [PostgreSQL: EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html): medición y ejecución con ANALYZE.
- [Tiger Data: unicidad en hypertables](https://www.tigerdata.com/docs/build/performance-optimization/hypertables-and-unique-indexes): incluir todas las columnas de particionado.
- [Tiger Data: retención y agregados](https://www.tigerdata.com/docs/learn/data-lifecycle/data-retention/data-retention-with-continuous-aggregates): riesgo de refrescar periodos eliminados.
- [Tiger Data: agregados en tiempo real](https://www.tigerdata.com/docs/learn/continuous-aggregates/real-time-aggregates): configuración materialized_only y límites de la actualización histórica.
- [Tiger Data: ventanas temporales](https://www.tigerdata.com/docs/learn/data-lifecycle/time-buckets/about-time-buckets): alineación por tipo, origen y zona horaria.
- [Tiger Data: Hypercore](https://www.tigerdata.com/docs/build/columnar-storage/setup-hypercore): segmentación, ordenación y conversión por políticas o chunks.
- [Tiger Data: convert_to_columnstore](https://www.tigerdata.com/docs/reference/timescaledb/hypercore/convert_to_columnstore): API y transición desde compress_chunk según versión.

Estas fuentes sustentan los contratos de diseño; no establecen compatibilidad con dependencias todavía no instaladas. Antes de implementar se consultan las fuentes de las versiones efectivamente fijadas y las capacidades Hypercore/columnstore correspondientes.

## v2.0: ejecución, corpus y medición

- Matriz de CI con Node y versiones fijadas de Bun y Deno. Verificar el ejecutor real de cada fixture, evitando llamar a Node y presentarlo como cobertura de otro runtime.
- Node: auditor y suites completas; conservar Windows/macOS/Linux para el núcleo.
- Bun: fixture con ejecución TS, HTTP Hono, compatibilidad necesaria, errores y lifecycle; ejecutar typecheck separado. Obtener un binario de tarea si hace falta, sin cambiar la instalación global.
- Deno: `deno check`, tests y HTTP con permisos mínimos, import maps y dependencias npm/JSR conforme a las versiones fijadas. Probar rechazo de permisos ausentes.
- Ejecutar la matriz mínima de datos anterior en Linux CI con PostgreSQL y TimescaleDB efímeros y fijados. Node/Bun/Deno ejecutan realmente los ejemplos TypeScript de datos; no se exige cada combinación posible de driver/backend. Declarar exactamente qué combinación se ejecutó.
- Corpus sintético etiquetado por regla y contraejemplos. Complementar con fuentes upstream fijadas y atribuidas; no distribuir clones/caches dentro de la skill. Reportar falsos positivos/negativos sobre el corpus etiquetado, sin extrapolar a todo backend.
- Medir tiempo y memoria del auditor syntax/typed con tamaños de corpus definidos y condiciones repetibles; registrar medianas y dispersión. No hacer afirmaciones de mejora sin comparación equivalente. Límites de presupuesto se fijan tras medir y se documentan, sin inventar objetivos iniciales.
- Revisión independiente de contratos, límites, seguridad del análisis, complejidad del propio auditor y riesgos restantes. Toda corrección requiere la regresión que corresponda.

## Verificación y definición de terminado

Cada etapa deja typecheck/build/tests verdes antes de seguir. La prueba roja precede a cambios de comportamiento; no se añaden tests triviales que solo reproduzcan la implementación. Los fixtures verifican también inmutabilidad del objetivo, diagnósticos incompletos y determinismo. Una instalación limpia debe reproducir el build sin archivos generados previos.

v2.0 termina cuando pasan el auditor, el ejemplo SQLite, el backend PostgreSQL con autenticación real, la matriz mínima PostgreSQL/TimescaleDB (incluyendo restricciones, RLS relacional, concurrencia, retención y agregados), los fixtures efectivos Node/Bun/Deno, la validación SARIF, los adaptadores integrados y la revisión independiente, con comandos/versiones/resultados registrados. Un workflow escrito pero no ejecutado o una suite omitida no satisface esos criterios. Si el entorno impide alguna ejecución, se entrega el trabajo verificable y se identifica la comprobación pendiente; no se declara v2.0 validada.

Actualizar conjuntamente SKILL, README, INSTALL, CONTRIBUTING, scanner y referencias relevantes. La versión del paquete se mueve a 2.0.0 al cerrar el conjunto; los nombres v1.3–v1.6 son hitos del trabajo, no publicaciones automáticas.

## Límites, entrega y decisiones del implementador

Fuera de alcance: certificar seguridad, análisis arbitrario interprocedimental, demostrar autorización mediante AST, reemplazar compilador/linter, desplegar servicios públicos o publicar releases. No actualizar las otras skills ni las copias personales instaladas.

El implementador decide los cortes exactos de módulos, bibliotecas auxiliares mínimas, versiones compatibles de las nuevas integraciones tras consultar fuentes oficiales, organización de fixtures y detalles de scripts. Mantener las convenciones types/interfaces/constants/schemas sin declaraciones artificiales.

Entrega: cambios locales revisables, instrucciones de reproducción, resultados reales y limitaciones. Crear commits, push, PR o releases no forma parte de esta propuesta. La reversión conserva el snapshot Git inicial y permite volver al CLI v1.2.0; no requiere migrar datos de proyectos auditados.
