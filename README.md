# Simulador de Sondas Espaciales

Simulador web interactivo del Sistema Solar, de las misiones históricas **Voyager 1 y 2** y de un **laboratorio experimental** para diseñar y ensayar sondas. Construido con **Vite** y **Three.js**. La escena 3D es el centro de la experiencia; los cálculos científicos, su adaptación visual y la interfaz son capas separadas.

- Repositorio: <https://github.com/nata23-dev/simulador-sondas-espaciales>
- Versión web: <https://nata23-dev.github.io/simulador-sondas-espaciales/>

> **Meta del proyecto:** construir un simulador de misiones científicas a los planetas y lunas del Sistema Solar, con posiciones reales, épocas astronómicas, ventanas de lanzamiento, trayectorias verificables y capacidades físicas de los vehículos. Hoy el laboratorio calcula misiones **Tierra → planeta (→ satélite)** con un modelo de **cónicas parcheadas** sobre efemérides de NASA/JPL Horizons guardadas en el repositorio (cobertura 2026-11-18 → 2046-01-01, sin extrapolar): ventanas con Lambert heliocéntrico, salida desde la órbita terrestre o, opcionalmente, desde la plataforma LC-41, encuentro apuntado por el plano B, captura con empuje finito integrado (DOPRI54) y, solo como comparación, un crucero de n cuerpos en paralelo a la cónica con su corrección de trayectoria. **No hay** integración de n cuerpos continua de toda la misión ni asistencias gravitatorias, y una misión «viable según el modelo» no está validada como misión real. Véase la [hoja de ruta](docs/DEVELOPMENT_ROADMAP.md).

## Estado real de las funcionalidades

| Área | Estado |
| --- | --- |
| Exploración del Sistema Solar (planetas, lunas, fechas, cámaras, medición) | Implementada. Datos locales de octubre de 2026. |
| Misiones históricas Voyager 1/2 (1977–2026) | Implementada; con cortes SPK declarados. La trayectoria global **no está certificada como continua**. |
| Sonda Experimental 01 (DOPRI54) | Módulo científico y pruebas numéricas conservados; **retirada de la interfaz en 17.1**. |
| Laboratorio: Hangar, Ingeniería, Planificador Tierra–Luna, Centro de Misión (12A–12C) | Implementado; auditorías independientes registradas en `docs/`. |
| Empuje finito (12D) y lanzamiento terrestre (12E) | Implementados; 12E con auditoría de Gemini «aprobada con observaciones» (corregidas en 12E.1). |
| Arquitectura multicuerpo y descenso propulsado (12F) | Implementada; aprobada por Gemini, observaciones corregidas en 12F.1. El descenso se retiró de la interfaz en 15.1; el motor se conserva. |
| Ventanas de lanzamiento y transferencias interplanetarias (12G) y misiones interplanetarias integradas (13) | Implementadas con **cónicas parcheadas**: Lambert heliocéntrico de cero revoluciones entre efemérides reales; dentro de cada esfera de influencia solo actúa el cuerpo central como masa puntual (sin J2, otros satélites ni presión de radiación); encendidos finitos integrados con DOPRI54. Destinos: los siete planetas y los satélites de la ventana cargada. 12G aprobada por Gemini; 13 **pendiente de auditoría externa**. |
| Identidad visual, flota NASA y laboratorio en tres etapas (14–17) | Implementadas y probadas localmente; **pendientes de auditoría**. |
| Reproducción en el Sistema Solar principal (17.1) | Implementada; **auditada por Claude (su implementador): aprobada con observaciones**, corregidas en 17.1.1 ([informe](docs/STAGE17_1_AUDIT_CLAUDE.md)). |
| Plan de mejora 18–25 (21-11-2026) | Implementado y probado localmente: carga rápida, limpieza, captura apuntada, lanzamiento → inyección opcional desde LC-41, crucero de n cuerpos en paralelo a la cónica, satélites galileanos en la escena principal, experiencia de uso del Centro de Misión y lanzamiento 3D de las Voyager. Cada etapa, **auditada por Claude (su implementador): aprobada con observaciones**; **pendiente la revisión independiente** de 20, 21, 22 y del perfil científico de 25 ([índice](docs/README.md#plan-de-mejora)). |
| Rendimiento y contador de FPS (26, 22-11-2026) | Implementado y probado en Chrome con GPU real: lanzamiento 3D sin bloqueos con el reloj en marcha, reproducción del laboratorio en el Sistema Solar a la cadencia completa y contador opcional en el menú «Capas» (o `?fps=1`). Sin cambios de física ni datos. **Auditado por Claude (su implementador): aprobado con observaciones** ([detalle](docs/STAGE26_PERFORMANCE.md), [informe](docs/STAGE26_AUDIT_CLAUDE.md)). |
| Rendimiento adaptativo, salida desde la plataforma y menús (27–29, 22-11-2026) | **27:** calidad automática que detecta la GPU (o el dibujo por software), ajusta la resolución y el detalle para buscar 50–60 FPS, perfil «Mínima» y preferencia de GPU en «Capas»; lanzamiento 3D con niveles de detalle sin tocar la trayectoria. **28:** la salida desde LC-41 usa el empalme convencional por la asíntota y se apunta con la gravedad terrestre fuera de la SOI. A1 vuelve a C3 = 8,932 km²/s² y la nave real llega a 45 029 km en n cuerpos, frente a 13,2 millones antes; **cambia física: pendiente la revisión independiente**. **29:** un solo «Menú» (áreas, herramientas y ayuda) y «Buscar» solo busca. Cada etapa, **auditada por Claude (su implementador): aprobada con observaciones** ([27](docs/STAGE27_ADAPTIVE_PERFORMANCE.md), [28](docs/STAGE28_DEPARTURE_PATCH.md), [29](docs/STAGE29_MENUS.md)). |
| Auditoría final y correcciones (fases 1–5, 22-11-2026) | Implementadas y probadas localmente: carrera del planificador, aviso sin WebGL 2 y segundos intercalares (fase 1); pausa del dibujo con la escena oculta (2); optimización del lanzamiento 3D (3); Sistema Solar y cálculos científicos en un Web Worker (4); accesibilidad de «Buscar» y de la bienvenida histórica, liberación de memoria del lanzamiento 3D y este README (5). **Pendiente la validación final completa** ([informes](docs/auditoria-final/)). |
| Asistencias gravitatorias, integración de n cuerpos continua de toda la misión, descenso atmosférico, sondas de entrada | **No implementados.** Ver el [análisis y plan de mejora](docs/ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md). |

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
npm run lint            # ESLint, solo reglas que detectan errores
npm test                # node --test "tests/*.test.mjs"
npm run build           # build de producción en dist/
npm run preview         # previsualiza dist/
```

Flujo comprobado en Windows (ver el informe de consolidación). Linux y macOS: no verificados localmente; la integración continua lo ejecuta en Ubuntu.

## Navegación

La barra superior alterna los tres modos:

1. **Exploración**: Sistema Solar por fecha; seleccionar un cuerpo y viajar hasta él.
2. **Histórico**: Voyager 1 y 2, hitos, encuentros, comparador con fotografías NASA y «Lanzamiento 3D»: acercamiento desde el Sistema Solar hasta el Complejo 41 de Cabo Cañaveral y lanzamiento del Titan IIIE-Centaur hasta la nave desplegada ([25](docs/STAGE25_VOYAGER_LAUNCH.md)). También `?mode=historical`.
3. **Laboratorio**: elegir sonda, planificar y reproducir. También `?mode=experimental`. El **Centro de Misión** («3 · Reproducir») reproduce la ejecución con cámaras y telemetría; desde 17.1 las misiones heliocéntricas (por ejemplo, Cassini → Marte) se reproducen en el **Sistema Solar principal**, con los satélites galileanos de Horizons para el sobrevuelo de Europa ([23](docs/STAGE23_MAIN_SCENE_MOONS.md)); las geocéntricas, en su escena local ([17.1](docs/STAGE17_1_MAIN_SCENE_PLAYBACK.md)).

## Ciencia y fidelidad

El proyecto mezcla tres niveles que deben distinguirse:

- **Datos astronómicos reales**: efemérides NASA/JPL Horizons y kernels SPK preservados con hashes (`public/data/`, `evidence/`).
- **Aproximaciones físicas**: dinámica DOPRI54, masa puntual, gravedad central, cónicas parcheadas con Lambert heliocéntrico, crucero de n cuerpos (ocho planetas como masas puntuales) solo como comparación con la cónica, atmósfera US-1976 simplificada. Cada modelo declara sus límites.
- **Representación ilustrativa**: tamaños visuales ampliados, órbitas dibujadas, texturas ([créditos](public/textures/README.md)) y modelos 3D.

Nunca se mezclan en silencio UTC con TDB, AU con km, ni tamaño visual con distancia física. Contratos: [contrato científico](docs/contrato-cientifico.md).

## Documentación

Índice completo: [docs/README.md](docs/README.md). Lo esencial:

- [Contexto del proyecto](docs/PROJECT_CONTEXT.md) · [Arquitectura](docs/ARCHITECTURE_MAP.md) · [Hoja de ruta](docs/DEVELOPMENT_ROADMAP.md)
- [Guía de desarrollo](docs/DEVELOPMENT_GUIDE.md) · [Contribuir](CONTRIBUTING.md) · [Sistema visual](docs/UI_DESIGN_SYSTEM.md)
- Agentes: [AGENTS.md](AGENTS.md) (Codex), [CLAUDE.md](CLAUDE.md) (Claude Code), [GEMINI.md](GEMINI.md) (procedimiento de auditoría: Gemini o Claude)
- [Datos científicos y su integridad](docs/DATOS_CIENTIFICOS.md) · [Índice de evidencias](evidence/README.md)

## Publicación

GitHub Pages se despliega con `.github/workflows/deploy.yml` al enviar a `main`; la integración continua (`ci.yml`) ejecuta ESLint, pruebas y build en cada push. Vite usa la ruta `/simulador-sondas-espaciales/` solo con `GITHUB_PAGES=true`.

## Licencia y créditos

No se ha declarado una licencia para el código. Los datos de NASA/JPL, las texturas de Solar System Scope y las fotografías conservan las condiciones de sus fuentes (ver documentación de cada recurso).
