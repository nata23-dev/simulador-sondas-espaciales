# Mapa de arquitectura real

**Lectura conjunta:** [contexto](PROJECT_CONTEXT.md), [sistema visual](UI_DESIGN_SYSTEM.md), [hoja de ruta](DEVELOPMENT_ROADMAP.md). Referencias verificadas en el árbol local del 17-11-2026. La aplicación es JavaScript ES modular, sin framework de UI declarado.

## Árbol funcional

```text
index.html                  DOM, SVG de iconos y entrada /src/main.js
src/main.js                 composición, carga inicial, tres modos y bucles
src/astronomy/              lector planetario diario de la experiencia original
src/science/                unidades, tiempo, estados, efemérides y dinámica puros
src/integration/            frontera de estado físico hacia estado de escena
src/graphics/               Three.js: escena, cuerpos, sondas, cámara, luz y escala
src/ui/                     controles DOM, paneles, histórico y laboratorio
src/lab/                    catálogo, diseño, ingeniería y misión lunar
src/style.css               base, controles y vistas históricas
src/ui/*.css                marco, cronología y laboratorio
public/data/               conjuntos locales y catálogos de cobertura
public/textures/            texturas y notas de procedencia
public/images/voyager/      fotos NASA y miniaturas
public/models/voyager/      Voyager.glb
assets/                     imágenes de trabajo de etapas visuales
tests/                      pruebas Node de ciencia, integración y funciones
scripts/                    adquisición, auditoría, diagnósticos y capturas históricas
docs/                       contratos, informes y decisiones por etapa
evidence/                   manifiestos, registros y capturas de verificación
.github/workflows/deploy.yml pruebas, build y Pages desde main
```

`capturas/`, `evidencias/` y archivos `navigation-*.png` existen en este equipo pero están ignorados por `.gitignore`; no son garantías para otro clon. También hay informes y capturas de etapas 12 aún sin seguimiento Git. `dist/` y `node_modules/` son generados.

## Entrada, datos y gestión de modos

`index.html` declara los controles y el contenedor `#solar-system`; importa `src/main.js`. `main.js` crea escena con `createSolarSystem`, paneles/controles y `createExperimentalLaboratory`; llama `crearWorkspaceLayout` para reubicar nodos DOM existentes conservando identificadores y listeners. `iniciar()` carga `cargarEfemerides()` y lunas locales, intenta `loadScientificPipeline`, propaga `Sonda Experimental 01` y aplica el modo URL opcional. `cambiarModoOperacion()` alterna `exploracion`, `historico` y `experimental`, pausa bucles previos y configura escena/controles. La navegación usa `data-app-mode`. El parámetro `?ephemeris=scientific` es optativo para el flujo visual planetario; un fallo declarado conserva el flujo anterior. `window.__SIMULADOR_DIAGNOSTICO__` expone lecturas de estado para E2E; no es un proveedor científico ni debe usarse para mutar la escena.

### Sistema Solar: científico → adaptador → escena → UI

```text
public/data/efemerides-2026.json
  → astronomy/Ephemerides.cargarEfemerides + obtenerEstados (flujo diario)
  → main.js → graphics/SolarSystem.createSolarSystem → ui/*

public/data/ephemerides-catalog-v1.json + conjuntos asociados
  → science/EphemerisFileReader.createStaticJsonReader
  → science/EphemerisCatalog.createEphemerisCatalog
  → science/EphemerisProvider.createEphemerisProvider
  → integration/ScientificVisualPipeline.queryVisualStates
  → main.js → SolarSystem.actualizarPosiciones → paneles/medición
```

`science/Units.js`, `Time.js`, `Frames.js`, `ScientificState.js`, `HorizonsEphemerides.js`, `HermiteInterpolation.js` y `EphemerisProvider.js` forman el contrato de unidades, escala, marco, identidad, cobertura e interpolación. `getExact` exige muestra exacta; `getInterpolated` rechaza huecos, conflictos y extrapolación. `graphics/SpatialScale.js` y `SceneScale.js` aplican 32 unidades/AU y la rotación `(x,y,z)→(x,z,-y)` **solo en la frontera gráfica**. `SolarSystem.js` compone Sol, planetas, lunas, estrellas, sondas, capas, encuadre y cámara. `PlanetFactory.js`, `Sun.js`, `MoonVisuals.js`, `StarField.js`, `SolarIllumination.js`, `CameraController.js` y `ScaleModeConfig.js` son piezas gráficas. `ui/PlanetSelector.js`, `TimelineControls.js`, `PlanetInfoPanel.js`, `MoonInfoPanel.js`, `DistanceToolControls.js` y `VisualizationControls.js` muestran y controlan, sin definir un nuevo estado orbital.

### Sonda experimental clásica

`science/ExperimentalProbe01.js` establece condiciones iniciales y llama la propagación que usa `GravitationalParameters.js`, `GravitationalDynamics.js`, `NumericalIntegrator.js` (RK4/DOPRI54) y `TrajectoryPropagator.js`. `integration/ProbeVisualAdapter.js` convierte muestras km a escena; `graphics/SpaceProbeVisual.js` las dibuja. `ui/MissionControls.js` ofrece iniciar, pausar, reiniciar, enfocar y ver telemetría. Esta propagación no consume las piezas guardadas del Hangar.

### Histórico Voyager

```text
public/data/historical-ephemerides-catalog-v1.json + historical/*
  → HistoricalEphemerisResolver / HistoricalEncounterContext
  → HistoricalVisualPipeline.queryVisualHistoricalSnapshot
  → main.js + HistoricalMissionEngine (reloj/eventos)
  → SolarSystem / CameraController / SpaceProbeVisual
  → HistoricalModeControls / TimelineLayout / inspector
```

`HistoricalTime.js` separa UTC/TDB y tiempo dividido; `VoyagerHistoricalMissions.js` registra identidades; `VoyagerHistoricalEvents.js` alimenta hitos; `HistoricalMissionEngine.js` dirige reproducción, sentido, velocidad y pausas. `HistoricalEphemerisResolver.js` obtiene planetas, lunas y sondas por cobertura; `HistoricalEncounterContext.js` da marcos locales de encuentros. `HistoricalVisualPipeline.js` convierte snapshots y construye tramos visuales, sin insertar marcos locales en el estado global de la sonda. `HistoricalComparatorSession.js` guarda/restaura la sesión del comparador. `VoyagerPhotoCatalog.js` conecta imágenes con procedencia; `HistoricalModeControls.js`, `HistoricalGuidedTour.js`, `HistoricalWelcomeModal.js` y `LaunchCinematicOverlay.js` gestionan UI. `LaunchPadLC41.js`, `TitanCentaurRocket.js`, `LaunchCinematicController.js`, `HeliosphereVisual.js` y `InstrumentFov.js` pertenecen a la representación; lanzamiento y heliosfera incluyen elementos explícitamente conceptuales.

La continuidad global de Voyager **no se resuelve** fusionando soluciones SPK: el resolver y la polilínea dejan cortes sin estado, y el reloj pausa. Véanse [cierre 08](VOYAGER_STAGE08_VISUAL_CLOSEOUT.md), [diagnóstico 09](VOYAGER_STAGE09_SPK_ROOT_CAUSE.md) y [alternativas 09B](VOYAGER_STAGE09B_ALTERNATIVE_KERNELS.md).

## Laboratorio: Hangar → Ingeniería → Planificador → Centro

| Paso | Módulos y funciones reales | Salida / dependencia |
| --- | --- | --- |
| Hangar | `lab/ComponentCatalog.js` (`COMPONENTS`, `getComponent`); `ProbeDesign.js` (`newDesign`, `validateDesign`, `planPartChange`, `applyPartChange`, `parseDesign`); `ProbeAssemblyView.js` (`createProbeAssemblyView`, `createProbeAssemblyModel`). | Diseño versionado, ensamblaje procedural Three.js y selección de piezas. `ui/ExperimentalLaboratory.js` coordina vistas. |
| Ingeniería | `ProbeEngineering.calculateEngineering`. | Masa, combustible, empuje, Δv ideal y potencia nominal del diseño. No altera `ExperimentalProbe01`. |
| Planificador | `MissionPlanStore.validatePlanOptions`, `createMissionPlan`, `designSignature`, `isMissionResultCurrent`; `MissionPhysics.calculateLunarTransfer`; `MissionEngineering.evaluateMission`; `MissionTrajectoryView.createMissionTrajectoryView`; `ui/MissionPlanner.createMissionPlanner`. | Resultado lunar con trayectoria DOPRI54 y presupuesto de inyección. Solo Luna tiene modelo disponible. Un cambio de diseño u opciones invalida el resultado. |
| Centro de Misión | `MissionPlayback.createMissionExecution`, `sampleMissionExecution`, `createPlaybackClock`; `MissionTelemetry.deriveMissionTelemetry`; `MissionExecutionView.createMissionExecutionView`, `missionCameraPose`; `ui/MissionControlCenter.createMissionControlCenter`. | Reproduce estados ya calculados, eventos, cinco cámaras y telemetría. No reintegra ni consume combustible al reproducir. |

`MissionPhysics.js` usa efeméride geocéntrica lunar local `public/data/moons-2026-10.json`, el integrador existente y el término indirecto Tierra–Luna. El Centro muestra dos lados de la inyección impulsiva en `t=0` y Hermite entre nudos posteriores; su reloj visual no cambia la trayectoria. `MissionExecutionView.js` convierte centros km a 1 unidad/10 000 km y amplía la nave solo para inspección. [12A](../ETAPA-12A-LABORATORIO.md), [12B](STAGE12B_MISSION_PLANNER.md), [12C](STAGE12C_MISSION_CONTROL.md).

## Persistencia y verificación

`ProbeDesign.js` guarda hasta 30 diseños en `localStorage` y admite JSON validado; `MissionPlanStore.js` usa una clave separada para planes versionados, firma del diseño e importación/exportación. El resultado numérico no se guarda como verdad permanente: al recuperar un plan se recalcula. No hay servicio remoto de cuentas o misiones. Los lectores de `public/` usan `BASE_URL`; `vite.config.js` fija la base de Pages con `GITHUB_PAGES=true`.

`tests/*.test.mjs` ejercitan ciencia, escena e integración. Para una etapa: ejecutar pruebas relevantes y batería completa según el cambio, build, `git diff --check` y evidencia visual real si se modificó UI. Los scripts de `scripts/` tienen ámbitos diferentes; algunos consultan o descargan fuentes externas y otros producen capturas/evidencia, por lo que leerlos antes de ejecutarlos. [Metodología](DEVELOPMENT_ROADMAP.md#metodología-de-validación).
