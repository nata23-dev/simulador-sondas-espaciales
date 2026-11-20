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

**Planificación interplanetaria (12G):** `public/data/interplanetary-ephemerides-catalog-v1.json` + `public/data/interplanetary/*.json` → `science/InterplanetaryEphemeris` (sobre `EphemerisProvider` y Hermite; `loadWindow().stateAt` síncrono) → `lab/InterplanetaryPlan.searchLaunchWindows` / `evaluateTransfer` (`science/LambertSolver`, `KeplerPropagator`, `AstrodynamicsTime`, `Frames`) → `ui/InterplanetaryPlanner` (modalidad del Planificador) → `lab/InterplanetaryPlayback` → Centro de Misión (`kind: 'interplanetary'`, escena heliocéntrica a 32 u/AU en `MissionExecutionView`). [12G](STAGE12G_INTERPLANETARY_PLANNING.md).

**Presentación común (14):** `ui/theme.css` se importa al final de `main.js` y superpone tokens y componentes a las hojas existentes; `ui/AppNavigator.js` añade el mapa de áreas (cambia de modo con los botones existentes y emite `lab:navigate` `{section, plannerMode, focus}`, que atiende `ExperimentalLaboratory.js`); el HUD y la barra de reproducción del Centro (`MissionControlCenter.js`) leen la telemetría ya renderizada y reutilizan los controles existentes. Ningún módulo de `science/` ni `lab/` cambia. [14](STAGE14_UI_UX_SHOWCASE.md).

**Identidad visual (14.1):** `ui/theme.css` reescrita con paleta grafito, tokens por cuerpo e Inter (`ui/fonts/`). La capa añade tres módulos, todos de solo presentación y conectados en `main.js` con su `dispose` para HMR:

- `ui/CommandPalette.js`: búsqueda global, abierta por el evento `app:open-search` o con Ctrl/⌘+K. Pulsa los botones de destino, áreas y acciones existentes.
- `ui/FeaturedMissions.js`: portada de misiones destacadas en `.scene-panel`. Navega con `AppNavigator.go`.
- `ui/LabFormEnhancer.js`: lee filas `.lab-metric` y campos ya presentados para mostrar cifras clave, resúmenes de sección y el tono del veredicto.

Otros cambios:

- `AppNavigator.js` añade la ruta `.app-crumb` en la cabecera.
- `TimelineLayout.js` añade el indicador `.temporal-state`.
- `PlanetLabels.js` y `SolarSystem.js` comparten los colores por cuerpo.
- `obtenerZonaEncuadre` descuenta la portada y la columna de herramientas.

**Biblioteca de herencia y Hangar modular (15):**

- `lab/HeritageCatalog.js`: fuentes, buses con puntos (`accepts`, `interface`, `envelopeM`, `direction`), piezas con `data` (calidad y fuente por campo) y `HISTORICAL_PROBES`.
- `lab/SpacecraftPower.js`: potencia solar y RTG, y empuje eléctrico según la potencia.
- `ComponentCatalog.js` une las piezas ilustrativas y las de herencia (`ALL_COMPONENTS`).
- `ProbeDesign.js`: `historicalDesign` y `HISTORICAL_PRESETS`; valida herraje, envolvente y adaptador.
- `ProbeEngineering.calculateEngineering` añade centro de masas, perfil de potencia, propulsión eléctrica, compatibilidad, veredicto y calidad de datos.
- `lab/HeritageModels.js` construye la geometría procedimental que monta `ProbeAssemblyView.js` (orientación por punto, encuadre, marcadores).
- `IntegratedMission.js` recibe el modelo eléctrico de la sonda (fase `power`, empuje eléctrico en el destino, `moon.mode: 'flyby'`).
- `graphics/QualityProfile.js` registra todos los renderizadores WebGL y aplica la relación de píxeles del perfil.

**Flota fija con modelos de NASA (15.1):**

- `graphics/NasaProbeModels.js`: registro de procedencia de los GLB (`public/models/nasa/` y `Voyager.glb`), carga con `GLTFLoader` y `DRACOLoader` (decodificador en `public/libs/draco/gltf/`), caché por modelo, `attachNasaModel` y `localBounds`.
- `ProbeAssemblyView.js` (Hangar) y `MissionExecutionView.js` (Centro de Misión) montan primero la geometría procedimental y la sustituyen por el modelo de NASA cuando termina de cargarse; si falla, la conservan.
- `ui/ExperimentalLaboratory.js`: flota `flota-<id>` construida con `historicalDesign`, sonda activa en `#lab-ctx-probe` (persistida en `simulador:sonda-activa`) y difundida con `setDesign` a todos los planificadores. El motor de piezas y adaptadores sigue en `lab/` y en las pruebas, pero la interfaz no lo expone.
- Sin módulos auxiliares: `IntegratedMissionPlanner` llama siempre a `computeIntegratedMission` con `propulsionModule: null`, `lander: null` y `landing.enabled: false`. `LandingPlanner.js` ya no se monta (lo inspecciona una prueba de 12F.1) y la sección `landing` desaparece del laboratorio y del navegador de áreas.

**Misiones integradas (13):** `interplanetary-ephemerides-catalog-v1.json` + `encounter-ephemerides-catalog-v1.json` (baricentros 5–8) y la ventana `interplanetary/galilean-moons-jsb-2031-2032.json` (`science/PlanetocentricWindow`) → `lab/EncounterDesign.aimEncounter` (Lambert a la SOI; `science/PlanetaryEncounter`) → `lab/OrbitalInsertion.simulateInsertion` (DOPRI54, masa variable) → `lab/IntegratedMission.computeIntegratedMission` (tramos `kepler`/`burn`/`landing`, conversión de marcos y continuidad; descenso por `BodyLandingSimulation` de 12F) → `ui/IntegratedMissionPlanner` (modalidad «Misión completa») → `lab/IntegratedMissionPlayback` (contextos heliocéntrico, planeta, satélite y descenso) → Centro de Misión (`kind: 'integrated'`). [13](STAGE13_INTEGRATED_MISSIONS.md).

`MissionPhysics.js` usa efeméride geocéntrica lunar local `public/data/moons-2026-10.json`, el integrador existente y el término indirecto Tierra–Luna. El Centro muestra dos lados de la inyección impulsiva en `t=0` y Hermite entre nudos posteriores; su reloj visual no cambia la trayectoria. `MissionExecutionView.js` convierte centros km a 1 unidad/10 000 km y amplía la nave solo para inspección. [12A](../ETAPA-12A-LABORATORIO.md), [12B](STAGE12B_MISSION_PLANNER.md), [12C](STAGE12C_MISSION_CONTROL.md).

## Persistencia y verificación

`ProbeDesign.js` guarda hasta 30 diseños en `localStorage` y admite JSON validado; `MissionPlanStore.js` usa una clave separada para planes versionados, firma del diseño e importación/exportación. El resultado numérico no se guarda como verdad permanente: al recuperar un plan se recalcula. No hay servicio remoto de cuentas o misiones. Los lectores de `public/` usan `BASE_URL`; `vite.config.js` fija la base de Pages con `GITHUB_PAGES=true`.

`tests/*.test.mjs` ejercitan ciencia, escena e integración. Para una etapa: ejecutar pruebas relevantes y batería completa según el cambio, build, `git diff --check` y evidencia visual real si se modificó UI. Los scripts de `scripts/` tienen ámbitos diferentes; algunos consultan o descargan fuentes externas y otros producen capturas/evidencia, por lo que leerlos antes de ejecutarlos. [Metodología](DEVELOPMENT_ROADMAP.md#metodología-de-validación).
