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
src/launch/                 lanzamiento 3D de las Voyager desde LC-41 (etapa 25), cargado bajo demanda
src/style.css               base, controles y vistas históricas
src/ui/*.css                marco, cronología y laboratorio
public/data/               conjuntos locales y catálogos de cobertura
public/textures/            texturas y notas de procedencia
public/images/voyager/      fotos NASA y miniaturas
public/models/voyager/      Voyager.glb
public/launch/              Blue Marble (NASA GIBS) y ortoimágenes USGS del lanzamiento, con procedencia
assets/                     imágenes de trabajo de etapas visuales
tests/                      pruebas Node de ciencia, integración y funciones
scripts/                    adquisición, auditoría, diagnósticos y capturas históricas
docs/                       contratos, informes y decisiones por etapa
evidence/                   manifiestos, registros y capturas de verificación
.github/workflows/deploy.yml pruebas, build y Pages desde main
```

`capturas/`, `evidencias/` y archivos `navigation-*.png` existen en este equipo pero están ignorados por `.gitignore`; no son garantías para otro clon. También hay informes y capturas de etapas 12 aún sin seguimiento Git. `dist/` y `node_modules/` son generados.

## Entrada, datos y gestión de modos

`index.html` declara los controles y el contenedor `#solar-system`; importa `src/main.js`. `main.js` crea escena con `createSolarSystem`, paneles/controles y `createExperimentalLaboratory`; llama `crearWorkspaceLayout` para reubicar nodos DOM existentes conservando identificadores y listeners. `iniciar()` carga `cargarEfemerides()` y lunas locales, carga `loadScientificPipeline` solo con `?ephemeris=scientific` y aplica el modo URL opcional (desde 17.1 ya no propaga la Sonda Experimental 01). `main.js` crea también `createSolarSystemMissionView` y lo entrega al laboratorio para «3 · Reproducir». `cambiarModoOperacion()` alterna `exploracion`, `historico` y `experimental`, pausa bucles previos y configura escena/controles. La navegación usa `data-app-mode`. El parámetro `?ephemeris=scientific` es optativo para el flujo visual planetario; un fallo declarado conserva el flujo anterior. `window.__SIMULADOR_DIAGNOSTICO__` expone lecturas de estado para E2E; no es un proveedor científico ni debe usarse para mutar la escena.

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

`science/ExperimentalProbe01.js` establece condiciones iniciales y llama la propagación que usa `GravitationalParameters.js`, `GravitationalDynamics.js`, `NumericalIntegrator.js` (RK4/DOPRI54) y `TrajectoryPropagator.js`. `integration/ProbeVisualAdapter.js` convierte muestras km a escena. Desde 17.1 el módulo no tiene interfaz (se retiraron `ui/MissionControls.js` y `#mission-panel`); se conserva con sus pruebas DOPRI54.

### Reproducción del laboratorio en el Sistema Solar principal (17.1)

`ui/MissionControlCenter.js` recibe `sceneView` (`integration/SolarSystemMissionView.js`). Si la ejecución es heliocéntrica (`mainSceneSupport`), el adaptador:

- comprueba la cobertura de los ocho planetas y carga su ventana de efemérides (`science/InterplanetaryEphemeris.js`);
- crea el modelo con `lab/MissionProbeSceneModel.js`;
- en cada instante del reloj llama a `SolarSystem.actualizarPosiciones` (planetas en la época TDB) y `actualizarEstadoSonda` (estado heliocéntrico ya calculado).

Solo presentación: no calcula física ni extrapola. `SolarSystem` acepta un proveedor de zona de encuadre y de recorte (`establecerProveedorZonaEncuadre`), y `CameraController` añade `encuadrarConjuntoMision` y `encuadrarDestinoConSonda`. Al soltar la escena, `main.js` restaura la exploración (`restaurarEscenaTrasMisionLaboratorio`). `#app[data-lab-scene="main"]` (en `lab-shell.css`) convierte la escena del Centro de Misión en una ventana al lienzo principal.

### Histórico Voyager

```text
public/data/historical-ephemerides-catalog-v1.json + historical/*
  → HistoricalEphemerisResolver / HistoricalEncounterContext
  → HistoricalVisualPipeline.queryVisualHistoricalSnapshot
  → main.js + HistoricalMissionEngine (reloj/eventos)
  → SolarSystem / CameraController / SpaceProbeVisual
  → HistoricalModeControls / TimelineLayout / inspector
```

`HistoricalTime.js` separa UTC/TDB y tiempo dividido; `VoyagerHistoricalMissions.js` registra identidades; `VoyagerHistoricalEvents.js` alimenta hitos; `HistoricalMissionEngine.js` dirige reproducción, sentido, velocidad y pausas. `HistoricalEphemerisResolver.js` obtiene planetas, lunas y sondas por cobertura; `HistoricalEncounterContext.js` da marcos locales de encuentros. `HistoricalVisualPipeline.js` convierte snapshots y construye tramos visuales, sin insertar marcos locales en el estado global de la sonda. `HistoricalComparatorSession.js` guarda/restaura la sesión del comparador. `VoyagerPhotoCatalog.js` conecta imágenes con procedencia; `HistoricalModeControls.js`, `HistoricalGuidedTour.js`, `HistoricalWelcomeModal.js` y `LaunchCinematicOverlay.js` gestionan UI. `HeliosphereVisual.js` e `InstrumentFov.js` pertenecen a la representación; la heliosfera incluye elementos explícitamente conceptuales.

### Lanzamiento 3D de las Voyager (etapa 25)

```text
«Lanzamiento 3D» (inspector, Explorar)
  → main.iniciarLanzamientoHistorico
      ├─ SolarSystem.aproximarATierraParaLanzamiento (acercamiento en la escena principal; meridiano según science.puntoSubsolar)
      └─ import('./launch/VoyagerLaunchDirector.js') en paralelo
  → launch/VoyagerLaunchDirector.crearLanzamientoVoyager3D (lienzo y WebGLRenderer propios)
      ├─ science/VoyagerLaunchProfile (secuencias, vehículo, Sol, tiempo sidéreo, ascenso calibrado, vuelo libre)
      ├─ launch/LaunchTimeline (tiempo de misión ↔ tiempo de pantalla, fases y planos)
      ├─ launch/LaunchWorld (Tierra, parches de terreno, cielo, estrellas, Sol, luces, bruma)
      ├─ launch/LC41Pad1977 · TitanIIIECentaur3D · LaunchEffects (plataforma, vehículo, llamas, humo, estela)
      └─ graphics/SpaceProbeVisual.cargarPlantillaVoyagerCompartida (Voyager.glb sin modificar, al final)
  → ui/LaunchCinematicOverlay (reloj, telemetría del modelo, acontecimientos y fuentes, controles)
```

`science/VoyagerLaunchProfile.js` no depende de DOM ni de Three.js: reúne lo documentado (informe TC-6, dossier de prensa, resumen de sistemas de 1973), calcula el Sol y el tiempo sidéreo, e integra un ascenso **ilustrativo** (RK4, Tierra esférica que gira, sin atmósfera) calibrado para llegar a la órbita de aparcamiento documentada en MECO-1. La escena usa un marco ENU fijo a la Tierra en LC-41 (x = este, y = arriba, z = sur, metros, centro de la Tierra en (0, −R, 0)) y búfer de profundidad logarítmico; es independiente de la escala de 32 unidades/AU de la escena principal. Todo el estado visual se deriva del instante de misión, así que pausar, saltar o repetir es determinista. Al cerrar se libera el contexto WebGL y se separa el modelo de NASA, que comparte geometrías con la escena principal. Detalle: [STAGE25_VOYAGER_LAUNCH.md](STAGE25_VOYAGER_LAUNCH.md).

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
- `graphics/QualityProfile.js` registra todos los renderizadores WebGL y aplica la relación de píxeles del perfil. Desde la etapa 26 también el del lanzamiento 3D (`registerRenderer` en `launch/LaunchWorld.js`).
- Etapa 26 ([detalle](STAGE26_PERFORMANCE.md)):
  - `ui/FpsMeter.js` (`crearMedidorFps`, creado en `main.js`): contador opcional con su propio `requestAnimationFrame`, casilla `#show-fps` en el menú «Capas», preferencia `simulador:mostrar-fps` y `?fps=1`;
  - `SolarSystem.precompilarEscena()`: compila en paralelo (`compileAsync`, tope de 2 s) los programas nuevos al abrir una misión del laboratorio (`SolarSystemMissionView.take`) y mantiene mientras tanto el fotograma anterior.
- Etapa 27 ([detalle](STAGE27_ADAPTIVE_PERFORMANCE.md)), `graphics/QualityProfile.js`:
  - funciones puras: `clasificarRenderizador`, `perfilInicialAuto` y `createResolutionController`;
  - estado por escena (`CONTEXTO_PRINCIPAL` y `'lanzamiento'`);
  - `reportFrame(dt, { contexto, cpu })` solo en fotogramas dibujados y `suspenderAdaptacion(promesa)` durante cargas;
  - `opcionesRenderizador(extra, contexto)` crea todos los `WebGLRenderer` (suavizado según el detalle y `powerPreference`), y `setGpuPreference`;
  - `launch/LaunchWorld.ajustesLanzamiento(detalle)` dice qué dibuja el lanzamiento en cada nivel, y `reducirDetalle` baja sombras y nubes sin recompilar.
- Etapa 28 ([detalle](STAGE28_DEPARTURE_PATCH.md)):
  - `lab/EarthDeparture.js`: `hyperbolicExcessVelocity`, `DEPARTURE_PATCH_MODELS` (`'asymptote'` por defecto, `'velocity'` de la 21) y `earthBeyondSoiCorrection` (Sol + Tierra con `propagateNBody` de `NBodyCruise.js`);
  - `IntegratedMission.js` itera la corrección en las rondas del lanzamiento, declara el salto de la frontera en `patches` y `checkContinuity` lo excluye del error máximo;
  - `compareMissionCruise` arranca la nave real desde `launch.soiExitHelioState`.
- Etapa 29 ([detalle](STAGE29_MENUS.md)):
  - `ui/AppNavigator.js` es el único «Menú» de la cabecera y adopta `#main-tools` (herramientas y ayuda, creado en `WorkspaceLayout.js`);
  - los eventos `app:menu-open` y `app:close-menu` coordinan su cierre con el inspector y «Capas»;
  - `CommandPalette` abre el menú con `navigator.open()`.

**Flota fija con modelos de NASA (15.1):**

- `graphics/NasaProbeModels.js`: registro de procedencia de los GLB (`public/models/nasa/` y `Voyager.glb`), carga con `GLTFLoader` y `DRACOLoader` (decodificador propio de three vía `DRACO_GLTF_CONFIG`, publicado por Vite en `assets/`; etapa 18), caché por modelo, `attachNasaModel` y `localBounds`.
- `ProbeAssemblyView.js` (Hangar) y `MissionExecutionView.js` (Centro de Misión) montan primero la geometría procedimental y la sustituyen por el modelo de NASA cuando termina de cargarse; si falla, la conservan.
- `ui/ExperimentalLaboratory.js`: flota `flota-<id>` construida con `historicalDesign`, sonda activa en `#lab-ctx-probe` (persistida en `simulador:sonda-activa`) y difundida con `setDesign` a todos los planificadores. El motor de piezas y adaptadores sigue en `lab/` y en las pruebas, pero la interfaz no lo expone.
- Sin módulos auxiliares: `IntegratedMissionPlanner` llama siempre a `computeIntegratedMission` con `propulsionModule: null`, `lander: null` y `landing.enabled: false`. `LandingPlanner.js` ya no se monta (lo inspecciona una prueba de 12F.1) y la sección `landing` desaparece del laboratorio y del navegador de áreas.

**Coherencia y misión guiada (16):**

- `lab/FleetGuide.js`: resultados esperados por escenario y sonda (`SCENARIO_OUTCOMES`), consejo de Tierra–Luna (`LUNAR_GUIDE`, `LUNAR_DEFAULTS`) y la misión guiada (`GUIDED_MISSION`). Son textos de interfaz; `tests/Stage16Coherence.test.mjs` los compara con el motor.
- `lab/LaunchVehicle.js`: `scaleLauncher`, `HEAVY_DEMO_LAUNCHER`, `LAUNCHER_PRESETS` y `recommendedLauncherPreset`. `lab/LaunchPlan.js`: `estimatePayloadCapacityKg` (bisección con `simulateLaunch`).
- `ui/LabGuidedMission.js`: pasos `GUIDE_STEPS`, con `isDone` y `act` sobre una API que expone `ExperimentalLaboratory`. Esa API usa los mismos controles de la interfaz, sin atajos internos. También exporta `revealInScrollAreas`.
- `ui/IntegratedMissionPlanner.js` exporta `integratedMissionInput` y `scenarioFormValues`, que usan tanto la interfaz como las pruebas.

**Laboratorio en tres etapas (17):**

- `ui/LabStages.js`: `LAB_STAGES` (etapas `probe`, `plan` y `play`, cada una con sus pestañas) y `labTab`. No usa el DOM. Lo comparten `ExperimentalLaboratory`, la misión guiada, `AppNavigator` y las pruebas.
- `ui/ExperimentalLaboratory.js`:
  - estado `stage` y `tabByStage`; `go(stage, tab)` muestra los contenedores de la etapa y, en «Reproducir», llama a `center.setPane(tab)`;
  - `lab:navigate` acepta `{ stage, tab }` y los nombres antiguos;
  - la barra de estado se calcula con `planState`, `playState` y `updateStatus`;
  - `center.setPlan` está envuelto para conservar el motivo de una invalidación;
  - antes de pasar un diseño nuevo a los planificadores, se compara `designSignature` con el de la misión preparada y, si difiere, se vacía el Centro.
- `lab/FleetDocuments.js`: documentos oficiales por sonda (`public/images/fleet/`), fuentes de la ficha y grupos de la pestaña de arquitectura.
- `lab/ExperimentalAssembly.js`: ensamblaje experimental sobre el bus de una sonda real, con las reglas de `ProbeDesign.applyPartChange` y la verificación de `ProbeEngineering`.
- `lab/MissionPlanStore.designSignature`: añade `experimental: true` a los ensamblajes experimentales. Las firmas históricas no cambian.
- `lab/ProbeAssemblyView.setDesign(design, { procedural })`: muestra el esquema técnico en lugar del modelo de NASA.
- `ui/IntegratedMissionPlanner`:
  - `renderFlow` (siete pasos) y `renderBrief` (resultado principal);
  - `getState().executable` y `executionError`: si `createIntegratedExecution` falla (por ejemplo, por efemérides fuera de la ventana cargada), se conserva el resultado y se desactiva la reproducción;
  - `onStateChange` avisa al laboratorio al empezar y terminar un cálculo.
- `ui/MissionControlCenter`: `MC_PANES`, `setPane`, `getPane`, `setImmersive` y `getStatus()` (incluye `vehicle`). `ui/LabGlossary.js` añade la ayuda contextual y el diálogo del glosario.
- **24 (experiencia de uso):**
  - `ui/MissionPlaybackAids.js` reúne funciones puras probadas en Node: `agruparMarcas`, `ventanaZoom`, `accionTeclaCentroMision` y `esquemaOrbita`;
  - `lab/RealMissionHistory.js` guarda los hitos públicos de Voyager, Cassini, Dawn y Juno con su fuente (`REAL_MISSIONS`, `compararConMisionReal`); son contexto y no alimentan ningún cálculo;
  - `MissionControlCenter` recibe `onPane` (la hoja inferior sincroniza la pestaña del laboratorio) y `mainSceneFrameZone` devuelve también `obstaculos`, que `SolarSystem` pasa a `PlanetLabels.actualizar` (`posicionEtiquetaLibre`);
  - las fases `capture` y `moon-capture` de `IntegratedMission` llevan `objective`, `bodyRadiusKm` y `bodyName` para el esquema de «Resultados».
- **20 (captura apuntada):**
  - `IntegratedMission.compensateCapturePeriapsis` busca por secante el periapsis de llegada (`aimEncounter` + `simulateInsertion` completos en cada prueba) que deja la órbita final con el periapsis pedido;
  - la opción del perfil es `planet.periapsisCompensation` (por defecto `true`; casilla `#im-compensate`);
  - el resumen va en `approach.periapsisCompensation` y en la fase `capture`; `approach.periapsisTargetKm` es el periapsis de llegada y `orbitPeriapsisTargetKm` el de la órbita pedida;
  - `INTEGRATED_MISSION_VERSION = '20-integrated-mission-2'`.
- **21 (lanzamiento → inyección):**
  - `science/EarthOrientation.js` (sin DOM): GMST, precesión IAU 1976 (y la IAU 2006 para contrastarla) y `launchFrameToEclipticJ2000(jd)`, la matriz que lleva el ascenso de 12E (ejes de la Tierra con ángulo inicial 0) a la eclíptica J2000;
  - `lab/EarthDeparture.designEarthDeparture` encadena `simulateLaunch` (lanzador `DEPARTURE_LAUNCHER`, ×9 del demostrativo), Kepler en la órbita de aparcamiento, `propagateFiniteThrust` con `CENTAUR_D1T` y la hipérbola hasta la SOI. Resuelve por Newton (despegue, espera, inyección) para que la velocidad heliocéntrica en la SOI sea la de `requiredVelocityAt` (el Lambert desde ese punto);
  - `IntegratedMission` con `profile.launch.enabled`: tramos con `centralBodyId: '399'` (`launch-k`, `parking-coast`, `injection` con `engineKey: 'upper'` y `earth-escape`), fases `launch`, `parking`, `injection` y `earth-escape`, `result.launch` (resumen) y `plannedDepartureJdTdb`. Hace vueltas con `designArrival` hasta que la llegada apuntada cambia < 1 m;
  - `IntegratedMissionPlayback`: contexto `earth` y telemetría con altitud WGS84 y tanque `upper`; `MissionControlCenter`, botón de contexto «Tierra»; planificador, casilla `#im-launch` y caja `#im-launch-box`;
  - `INTEGRATED_MISSION_VERSION = '21-integrated-mission-3'`.
- **22 (crucero de n cuerpos):**
  - `lab/NBodyCruise.js` (sin DOM): `heliocentricAcceleration` (Sol + planetas, con término indirecto), `propagateNBody` (DOPRI54 sobre las efemérides de Horizons, `NBODY_EPHEMERIS_IDS` = 199–499 y baricentros 5–8), `compareNBodyCruise` (diferencia con la cónica, efectos aislados, «solo otros planetas» y TCM-1 cuasi-Newton) y `compareMissionCruise(mission, stateAt)`;
  - en paralelo a la misión: no cambia `computeIntegratedMission` ni su versión. El planificador lo calcula bajo demanda (`#im-nbody`) con una ventana de efemérides propia.
- **23 (satélites en la escena principal):**
  - `integration/SolarSystemMissionView.js`: `mainSceneSupport` acepta las misiones con satélite galileano si traen la ventana del cálculo centrada en el baricentro 5; `moonSceneStates(execution, jdTdb)` da los desplazamientos de Ío, Europa, Ganímedes y Calisto (solo dentro de la cobertura); `NEAR_MOON_PROBE_SCALE`; la cámara de destino encuadra el satélite en su fase; `moonInfoState(key)` para la ficha. La cobertura del proveedor de la escena se comprueba solo para los planetas que se cargan de él (la Tierra y el destino, con la ventana del cálculo);
  - `graphics/`: `encuadrarDestinoConSonda` acepta un satélite visible; `actualizarLunas` pasa la cámara al planeta si el satélite seleccionado deja de dibujarse; la baliza de la nave escala su mínimo con el factor de la nave;
  - `MissionControlCenter.mainSceneFoot(state)`: pie con la ventana de los satélites.

**Misiones integradas (13):** `interplanetary-ephemerides-catalog-v1.json` + `encounter-ephemerides-catalog-v1.json` (baricentros 5–8) y la ventana `interplanetary/galilean-moons-jsb-2031-2032.json` (`science/PlanetocentricWindow`) → `lab/EncounterDesign.aimEncounter` (Lambert a la SOI; `science/PlanetaryEncounter`) → `lab/OrbitalInsertion.simulateInsertion` (DOPRI54, masa variable) → `lab/IntegratedMission.computeIntegratedMission` (tramos `kepler`/`burn`/`landing`, conversión de marcos y continuidad; descenso por `BodyLandingSimulation` de 12F) → `ui/IntegratedMissionPlanner` (modalidad «Misión completa») → `lab/IntegratedMissionPlayback` (contextos heliocéntrico, planeta, satélite y descenso) → Centro de Misión (`kind: 'integrated'`). [13](STAGE13_INTEGRATED_MISSIONS.md).

`MissionPhysics.js` usa efeméride geocéntrica lunar local `public/data/moons-2026-10.json`, el integrador existente y el término indirecto Tierra–Luna. El Centro muestra dos lados de la inyección impulsiva en `t=0` y Hermite entre nudos posteriores; su reloj visual no cambia la trayectoria. `MissionExecutionView.js` convierte centros km a 1 unidad/10 000 km y amplía la nave solo para inspección. [12A](../ETAPA-12A-LABORATORIO.md), [12B](STAGE12B_MISSION_PLANNER.md), [12C](STAGE12C_MISSION_CONTROL.md).

## Persistencia y verificación

`ProbeDesign.js` guarda hasta 30 diseños en `localStorage` y admite JSON validado; `MissionPlanStore.js` usa una clave separada para planes versionados, firma del diseño e importación/exportación. El resultado numérico no se guarda como verdad permanente: al recuperar un plan se recalcula. No hay servicio remoto de cuentas o misiones. Los lectores de `public/` usan `BASE_URL`; `vite.config.js` fija la base de Pages con `GITHUB_PAGES=true`.

`tests/*.test.mjs` ejercitan ciencia, escena e integración. Para una etapa: ejecutar pruebas relevantes y batería completa según el cambio, build, `git diff --check` y evidencia visual real si se modificó UI. Los scripts de `scripts/` tienen ámbitos diferentes; algunos consultan o descargan fuentes externas y otros producen capturas/evidencia, por lo que leerlos antes de ejecutarlos. [Metodología](DEVELOPMENT_ROADMAP.md#metodología-de-validación).
