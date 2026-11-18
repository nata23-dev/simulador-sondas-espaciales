# AGENTS.md — instrucciones para Codex (y agentes genéricos)

Debes poder trabajar sin conversaciones previas. **Fuente única de verdad del estado:** [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md), [docs/ARCHITECTURE_MAP.md](docs/ARCHITECTURE_MAP.md) y [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md). Léelos antes de actuar. No dupliques su contenido aquí.

## Proyecto

Simulador web (Vite + Three.js, JavaScript ES modules, sin framework) del Sistema Solar, misiones históricas Voyager 1/2 y laboratorio experimental de sondas. Meta: simulador de misiones científicas a planetas y lunas con datos reales y modelos verificables. Hoy solo hay sistemas locales; las transferencias interplanetarias completas son futuras.

## Estructura

`src/science/` (ciencia pura, sin DOM ni Three.js) · `src/integration/` (físico → presentación) · `src/graphics/` (Three.js) · `src/ui/` (controles) · `src/lab/` (laboratorio: diseño, ingeniería, misión, lanzamiento, descenso) · `src/astronomy/` · `public/data|textures|images|models` · `tests/` · `scripts/` (adquisición y auditoría) · `docs/` · `evidence/`.

## Reglas de código y ciencia

- Unidades explícitas: km, km/s, s, kg, N. Conservar procedencia, marco, origen y escala temporal (UTC≠TDB, AU≠km, tamaño visual≠distancia). Ejes del Sistema Solar: `(x,y,z)→(x,z,−y)`; 32 unidades de escena/AU.
- **Prohibido inventar** efemérides, constantes, resultados o pruebas pasadas. Faltan datos → «no disponible», nunca extrapolar ni interpolar a través de cortes SPK.
- **No modificar** datos, hashes, kernels, fotografías ni `Voyager.glb` para que algo coincida. No debilitar pruebas.
- Conservar DOPRI54 y sus pruebas. Cambios en física, constantes, marcos, integrador o adquisición exigen fundamento, pruebas y validación independiente.
- Rutas públicas con `import.meta.env.BASE_URL`. Pages: `GITHUB_PAGES=true`, base `/simulador-sondas-espaciales/`.
- UI: identidad oscura con acento dorado; leer [UI_DESIGN_SYSTEM.md](docs/UI_DESIGN_SYSTEM.md) antes de tocar CSS. Cambios localizados, sin rediseños.
- Sin dependencias nuevas salvo necesidad justificada.

## Procedimiento por etapas

Una etapa autorizada a la vez. Inspecciona `git status` y el código vigente (la documentación describe el momento en que se escribió). Implementa → pruebas locales → documenta en `docs/` → auditoría independiente (Gemini) → corrección puntual. No declares «validado» ni «aprobado» sin la auditoría; no llames validado a un flujo que no ejecutaste.

## Validación

```bash
npm ci && npm test && npm run build && git diff --check
```

Línea base actual: ver [roadmap](docs/DEVELOPMENT_ROADMAP.md). Evita reejecutar scripts que reescriben `evidence/` salvo que sea necesario y registra el cambio.

## Git

Commits cortos, claros y en español (p. ej. `Integrar aterrizajes multicuerpo`). Sin `--force`, sin `reset --hard`, sin `clean -fd`, sin reescribir historial publicado. Commit/push solo cuando el usuario lo autorice. Nunca subas secretos ni rutas absolutas del equipo.

## Entrega

Informa: archivos cambiados, motivo, pruebas y resultado, límites, estado de Git, evidencia externa pendiente. Guía completa: [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) y [CONTRIBUTING.md](CONTRIBUTING.md).
