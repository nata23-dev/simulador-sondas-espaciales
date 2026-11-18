# Simulador de Sondas Espaciales — instrucciones para asistentes

Proyecto web Vite + Three.js de exploración del Sistema Solar, misiones históricas Voyager 1/2 y laboratorio experimental de sondas. La escena 3D es el centro de la experiencia; los cálculos científicos, su adaptación visual y la interfaz tienen responsabilidades distintas. Rama de trabajo de referencia: `revision/modo-historico-voyager`. Antes de actuar, comprobar rama, `git status` y código actual: hay trabajo local que no debe perderse.

## Lectura obligatoria según la tarea

1. [Contexto y estado](docs/PROJECT_CONTEXT.md), [mapa de arquitectura](docs/ARCHITECTURE_MAP.md), [sistema visual](docs/UI_DESIGN_SYSTEM.md) y [hoja de ruta](docs/DEVELOPMENT_ROADMAP.md).
2. Ciencia: [contrato](docs/contrato-cientifico.md), [proveedor](docs/proveedor-efemerides.md), [adquisición e interpolación](docs/adquisicion-interpolacion-1b.md), [consolidación](docs/consolidacion-1br-1c.md) y [dinámica](docs/motor-dinamica-orbital-2a-2b.md).
3. Histórico: [modo Voyager](docs/modo-historico-voyager.md), [encuentros](docs/VOYAGER_ENCOUNTER_CONTEXTS.md), [cortes SPK](docs/VOYAGER_STAGE08_VISUAL_CLOSEOUT.md), [causa de los cortes](docs/VOYAGER_STAGE09_SPK_ROOT_CAUSE.md) y [alternativas](docs/VOYAGER_STAGE09B_ALTERNATIVE_KERNELS.md).
4. Laboratorio: [12A](ETAPA-12A-LABORATORIO.md), [12A.1](docs/STAGE12A1_CORRECTIONS.md), [12B](docs/STAGE12B_MISSION_PLANNER.md), [12B.1](docs/STAGE12B1_NUMERICAL_RECONCILIATION.md) y [12C](docs/STAGE12C_MISSION_CONTROL.md). Algunos son archivos locales aún no añadidos a Git.

La documentación de etapa describe el momento en que se escribió; verificar funciones, CSS y pruebas actuales antes de cambiar un módulo. Los informes de auditoría son evidencia histórica, no sustituyen un control vigente. **12C está implementada y pasó pruebas locales, pero la aprobación independiente de Gemini sigue pendiente según el criterio del proyecto**, aunque exista un informe local llamado `STAGE12C_INDEPENDENT_AUDIT.md`.

## Invariantes técnicos y científicos

- `src/main.js` coordina los modos `exploracion`, `historico` y `experimental`; `src/science/` no debe depender de DOM ni Three.js. `src/integration/` convierte estados físicos a presentación; `src/graphics/` dibuja; `src/ui/` gestiona controles; `src/lab/` separa diseño, ingeniería, trayectoria, reproducción y telemetría.
- Conservar procedencia, origen, ejes, unidades y escala temporal de cada dato. No confundir UTC con TDB, AU con km, datos de Horizons con trayectorias integradas, ni tamaño visual con distancia física. Para el Sistema Solar la conversión de ejes es `(x,y,z) → (x,z,-y)` y los centros usan 32 unidades de escena/AU. La vista del Centro de Misión tiene una frontera gráfica propia de 1 unidad/10 000 km.
- Respetar límites de cobertura; señalar `no disponible`, conflictos y cortes. Nunca inventar estados, interpolar a través de empalmes SPK incompatibles ni extrapolar en silencio. La trayectoria global Voyager 1977–2026 no está certificada como continua. No modificar datos, hashes, kernels, fotografías o `Voyager.glb` para hacer coincidir una imagen.
- Conservar DOPRI54 y sus pruebas; un cambio en física, constantes, marcos, integrador o adquisición requiere fundamento, pruebas y validación independiente. Las piezas del Hangar tienen parámetros ilustrativos. Una misión `VIABLE SEGÚN EL MODELO` no equivale a éxito operativo.
- Las rutas de recursos públicos se construyen con `import.meta.env.BASE_URL`. GitHub Pages usa `GITHUB_PAGES=true` y el prefijo `/simulador-sondas-espaciales/`.

## Interfaz y forma de trabajo

- Preservar la identidad oscura, acento dorado, escena protagonista, paneles secundarios a demanda, controles accesibles y avisos de fidelidad. Antes de tocar CSS, leer [UI_DESIGN_SYSTEM.md](docs/UI_DESIGN_SYSTEM.md) y los estilos efectivos. Corregir la pantalla solicitada de forma localizada; no rediseñar todo el producto por una incidencia puntual.
- Trabajar **una etapa autorizada a la vez**. Inspeccionar cambios locales antes de editar; no borrar funcionalidades ni agregar dependencias sin necesidad. No iniciar etapas futuras, commits, pushes, despliegues, adquisición real de NASA/JPL o regeneración de datos por iniciativa propia.
- Implementación: Codex o Claude. Auditoría independiente: Gemini. Luego revisión, corrección puntual si procede y aprobación basada en evidencia antes de avanzar. Mantener separados pruebas locales, auditoría científica externa, revisión visual en navegador y publicación remota.
- Verificación habitual: `node --test tests/*.test.mjs`, `npm run build`, `git diff --check`; añadir pruebas y comprobación visual específicas cuando cambien lógica o interfaz. La etapa 00 de documentación no requiere build ni nuevas capturas. No llamar «validado» a un flujo que no se ejercitó.
- En cada entrega indicar archivos cambiados, motivo, pruebas ejecutadas y resultado, límites/pendientes, estado de Git y cualquier evidencia externa todavía necesaria.

## Otros agentes y comandos

Instrucciones hermanas, sin contradicción con este archivo: [AGENTS.md](AGENTS.md) (Codex) y [GEMINI.md](GEMINI.md) (auditorías independientes). Guía para desarrolladores: [DEVELOPMENT_GUIDE](docs/DEVELOPMENT_GUIDE.md), [CONTRIBUTING](CONTRIBUTING.md); índice documental: [docs/README.md](docs/README.md); datos: [DATOS_CIENTIFICOS](docs/DATOS_CIENTIFICOS.md). Comandos: `npm ci`, `npm run dev`, `npm test`, `npm run build`. Estado vigente: **12F implementada y probada localmente (213 pruebas), pendiente de auditoría de Gemini; 12E aprobada con observaciones, corregidas en 12E.1.** Commits y push solo con autorización explícita del usuario; mensajes en español, sin `--force`.
