# Simulador de Sondas Espaciales

Simulador web interactivo del Sistema Solar, de las misiones históricas **Voyager 1 y 2** y de un **laboratorio experimental** para diseñar y ensayar sondas. Construido con **Vite** y **Three.js**. La escena 3D es el centro de la experiencia; los cálculos científicos, su adaptación visual y la interfaz son capas separadas.

- Repositorio: <https://github.com/nata23-dev/simulador-sondas-espaciales>
- Versión web: <https://nata23-dev.github.io/simulador-sondas-espaciales/>

> **Meta del proyecto:** construir un simulador de misiones científicas a los planetas y lunas del Sistema Solar, con posiciones reales, épocas astronómicas, ventanas de lanzamiento, trayectorias verificables y capacidades físicas de los vehículos. Hoy existen sistemas **locales** (Sistema Solar, Voyager, órbita, lanzamiento, descenso); las **transferencias interplanetarias completas aún no existen**. Véase la [hoja de ruta](docs/DEVELOPMENT_ROADMAP.md).

## Estado real de las funcionalidades

| Área | Estado |
| --- | --- |
| Exploración del Sistema Solar (planetas, lunas, fechas, cámaras, medición) | Implementada. Datos locales de octubre de 2026. |
| Misiones históricas Voyager 1/2 (1977–2026) | Implementada; con cortes SPK declarados. La trayectoria global **no está certificada como continua**. |
| Sonda Experimental 01 (DOPRI54) | Módulo científico y pruebas numéricas conservados; **retirada de la interfaz en 17.1**. |
| Laboratorio: Hangar, Ingeniería, Planificador Tierra–Luna, Centro de Misión (12A–12C) | Implementado; auditorías independientes registradas en `docs/`. |
| Empuje finito (12D) y lanzamiento terrestre (12E) | Implementados; 12E con auditoría de Gemini «aprobada con observaciones» (corregidas en 12E.1). |
| Arquitectura multicuerpo y descenso propulsado (12F) | Implementada; aprobada por Gemini, observaciones corregidas en 12F.1. El descenso se retiró de la interfaz en 15.1; el motor se conserva. |
| Ventanas de lanzamiento y transferencias interplanetarias (12G) y misiones interplanetarias integradas (13) | Implementadas; 12G aprobada por Gemini; 13 **pendiente de auditoría**. |
| Identidad visual, flota NASA y laboratorio en tres etapas (14–17) | Implementadas y probadas localmente; **pendientes de auditoría**. |
| Reproducción en el Sistema Solar principal (17.1) | Implementada; **auditada por Claude (su implementador): aprobada con observaciones**, corregidas en 17.1.1 ([informe](docs/STAGE17_1_AUDIT_CLAUDE.md)). |
| Asistencias gravitatorias, descenso atmosférico, sondas de entrada | **No implementados.** Ver el [plan de mejora propuesto](docs/ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md). |

«Implementada» no significa «validada», y «viable según el modelo» no significa éxito operativo. Las piezas del Hangar y el lanzador/módulo de aterrizaje demostrativos tienen parámetros **ilustrativos**.

## Requisitos

- **Git** y **Node.js ≥ 22** (el flujo de CI prueba 22 y 24; desarrollo local verificado con Node 24). Incluye npm.
- Python 3 es **opcional**: solo algunos scripts de auditoría (`scripts/*.py`) lo usan; la aplicación, las pruebas y el build no.

## Instalación y uso

Funciona igual en Windows (PowerShell o Git Bash), Linux y macOS:

```bash
git clone https://github.com/nata23-dev/simulador-sondas-espaciales.git
cd simulador-sondas-espaciales
git checkout revision/modo-historico-voyager   # rama de desarrollo, si aún no es la predeterminada
npm ci                  # instala desde package-lock.json
npm run dev             # servidor de desarrollo; abre la URL que muestre Vite
npm test                # node --test "tests/*.test.mjs"
npm run build           # build de producción en dist/
npm run preview         # previsualiza dist/
```

Flujo comprobado en Windows (ver el informe de consolidación). Linux y macOS: no verificados localmente; la integración continua lo ejecuta en Ubuntu.

## Navegación

La barra superior alterna los tres modos:

1. **Exploración**: Sistema Solar por fecha; seleccionar un cuerpo y viajar hasta él.
2. **Histórico**: Voyager 1 y 2, hitos, encuentros, comparador con fotografías NASA. También `?mode=historical`.
3. **Laboratorio**: elegir sonda, planificar y reproducir. También `?mode=experimental`. El **Centro de Misión** («3 · Reproducir») reproduce la ejecución con cámaras y telemetría; desde 17.1 las misiones heliocéntricas (por ejemplo, Cassini → Marte) se reproducen en el **Sistema Solar principal**, y las geocéntricas o con satélite, en su escena local ([17.1](docs/STAGE17_1_MAIN_SCENE_PLAYBACK.md)).

## Ciencia y fidelidad

El proyecto mezcla tres niveles que deben distinguirse:

- **Datos astronómicos reales**: efemérides NASA/JPL Horizons y kernels SPK preservados con hashes (`public/data/`, `evidence/`).
- **Aproximaciones físicas**: dinámica DOPRI54, masa puntual, gravedad central, atmósfera US-1976 simplificada. Cada modelo declara sus límites.
- **Representación ilustrativa**: tamaños visuales ampliados, órbitas dibujadas, texturas ([créditos](public/textures/README.md)) y modelos 3D.

Nunca se mezclan en silencio UTC con TDB, AU con km, ni tamaño visual con distancia física. Contratos: [contrato científico](docs/contrato-cientifico.md).

## Documentación

Índice completo: [docs/README.md](docs/README.md). Lo esencial:

- [Contexto del proyecto](docs/PROJECT_CONTEXT.md) · [Arquitectura](docs/ARCHITECTURE_MAP.md) · [Hoja de ruta](docs/DEVELOPMENT_ROADMAP.md)
- [Guía de desarrollo](docs/DEVELOPMENT_GUIDE.md) · [Contribuir](CONTRIBUTING.md) · [Sistema visual](docs/UI_DESIGN_SYSTEM.md)
- Agentes: [AGENTS.md](AGENTS.md) (Codex), [CLAUDE.md](CLAUDE.md) (Claude Code), [GEMINI.md](GEMINI.md) (procedimiento de auditoría: Gemini o Claude)
- [Datos científicos y su integridad](docs/DATOS_CIENTIFICOS.md) · [Índice de evidencias](evidence/README.md)

## Publicación

GitHub Pages se despliega con `.github/workflows/deploy.yml` al enviar a `main`; la integración continua (`ci.yml`) ejecuta pruebas y build en cada push. Vite usa la ruta `/simulador-sondas-espaciales/` solo con `GITHUB_PAGES=true`.

## Licencia y créditos

No se ha declarado una licencia para el código. Los datos de NASA/JPL, las texturas de Solar System Scope y las fotografías conservan las condiciones de sus fuentes (ver documentación de cada recurso).
