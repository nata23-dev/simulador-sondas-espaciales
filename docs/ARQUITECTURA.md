# Arquitectura del software

El **Simulador de Sondas Espaciales** está construido con **JavaScript (ES Modules)**, **Three.js (`0.186.1`)**, **WebGL 2** y **Vite**, sin frameworks de interfaz de usuario. Su diseño separa con claridad la física astronómica del renderizado 3D y de los controles del navegador.

## 1. Mapa de capas

```
index.html + src/style.css + src/ui/*.css
        │
        ▼
    src/main.js  (coordinación global de modos, carga diferida y ciclo de vida)
   ┌────┴────────────────┬──────────────────────┬───────────────────────┐
   ▼                     ▼                      ▼                       ▼
src/ui/           src/integration/        src/graphics/            src/launch/
(controles,       (adaptación físico →    (escena 3D principal,    (escena 3D dedicada
paneles, modales,  escena 3D y pausa       planetas, lunas, LOD,    del lanzamiento
accesibilidad)     del lienzo oculto)      cámara, GLB, WebGL2)     Voyager en LC-41)
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
  src/science/                        src/lab/
  (ciencia pura: tiempo, marcos,      (flota NASA, ingeniería, Lambert,
   efemérides, Hermite, DOPRI54,       cónicas parcheadas, empuje finito,
   Lambert, catálogo Voyager)          Web Worker y vistas locales 3D)
```

### Principios estructurales
- **`src/science/` no importa Three.js ni el DOM.** Puede ejecutarse íntegramente en Node.js para pruebas automatizadas (`npm test`) y auditorías independientes.
- **`src/astronomy/`** carga el conjunto inicial de efemérides planetarias de octubre de 2026 (`public/data/efemerides-2026.json`) usando `import.meta.env.BASE_URL`.
- **`src/integration/`** traduce estados físicos (`km`, `km/s`, `ICRF eclíptico J2000`) a coordenadas de Three.js (`(x, y, z) → (x, z, −y)`, `32 unidades de escena por AU`) y coordina la pausa de renderizado cuando el Laboratorio cubre por completo el lienzo principal.
- **`src/graphics/`** gestiona el renderizador WebGL 2 principal (`SolarSystem.js`), control de cámara (`CameraController.js`), planetas y atmósferas con niveles de detalle geométrico (`PlanetFactory.js`, `Atmosphere.js`, `Sun.js`), lunas (`MoonVisuals.js`), campo estelar (`StarField.js`), sondas 3D oficiales con decodificador Draco (`NasaProbeModels.js`, `SpaceProbeVisual.js`), perfiles adaptativos (`QualityProfile.js`) y detección segura de ausencia de WebGL 2 (`WebGLSupport.js`).
- **`src/launch/`** encapsula la escena 3D independiente del lanzamiento histórico de Voyager desde el Complejo LC-41 (`VoyagerLaunchDirector.js`, `LaunchWorld.js`, `LC41Pad1977.js`, `TitanIIIECentaur3D.js`, `LaunchEffects.js`, `LaunchTimeline.js` y `LaunchSharedResources.js`), cargada de forma diferida al abrir el lanzamiento y liberada completamente al cerrarlo.
- **`src/lab/`** implementa el motor de ingeniería y planificación del Laboratorio: catálogo de flota histórica (`HeritageCatalog.js`, `HeritageModels.js`), planificación interplanetaria e integrada (`InterplanetaryPlan.js`, `IntegratedMission.js`, `EncounterDesign.js`, `OrbitalInsertion.js`, `EarthDeparture.js`, `NBodyCruise.js`), motores de empuje finito, lanzamiento y descenso multicuerpo, vistas 3D locales (`ProbeAssemblyView.js`, `MissionExecutionView.js`, `MissionTrajectoryView.js`) y ejecución en segundo plano mediante **Web Workers** (`IntegratedMissionWorker.js`, `IntegratedMissionWorkerClient.js`).
- **`src/ui/`** gestiona los tres modos de navegación (`AppNavigator.js`, `WorkspaceLayout.js`), la paleta de búsqueda accesible (`CommandPalette.js`, `DialogFocus.js`), los controles del modo histórico y su comparador A/B (`HistoricalModeControls.js`, `HistoricalWelcomeModal.js`, `HistoricalGuidedTour.js`), el Laboratorio (`ExperimentalLaboratory.js`, `IntegratedMissionPlanner.js`, `MissionControlCenter.js`) y los avisos accesibles sin WebGL 2 (`WebGLUnavailableNotice.js`).

## 2. Rendimiento, Web Workers y gestión de recursos WebGL

- **Pausa de renderizado oculto:** `SolarSystem.js` cancela su bucle `requestAnimationFrame` por motivos independientes (`pestaña oculta`, `lanzamiento 3D`, `laboratorio`). Cuando `#experimental-lab` cubre `#solar-system` en Hangar o Planificación, la escena principal consume `0` cuadros por segundo.
- **Calidad gráfica adaptativa (`QualityProfile.js`):** detecta si el navegador dibuja con GPU dedicada o por software (p. ej. SwiftShader) y ajusta resolución de render, sombras, anisotropía y geometría LOD (`PlanetFactory.js`, `Atmosphere.js`, `Sun.js`) para conservar fluidez sin reducir el detalle en hardware capaz.
- **Cálculos pesados fuera del hilo principal:** `IntegratedMissionWorkerClient.js` serializa la ventana de efemérides ya cargada y delega en `IntegratedMissionWorker.js` el cálculo completo de misiones interplanetarias, refinamiento y comparación N-cuerpos, cancelando inmediatamente solicitudes anteriores cuando el usuario cambia de escenario o sonda.
- **Liberación estricta de memoria en Lanzamiento 3D:** `LaunchSharedResources.js` separa recursos compartidos del renderizador (como las texturas internas DFG y las geometrías de sprites) y garantiza que cada cierre del lanzamiento 3D deseche sus geometrías, materiales, texturas y contexto WebGL sin retener renderizadores en memoria.
- **División de paquetes (`vite.config.js`):** `three.js` se compila en su propio paquete cacheable, y tanto el Laboratorio como el Lanzamiento 3D y `SpaceProbeVisual` se importan de manera diferida para acelerar el arranque inicial.

## 3. Estructura del repositorio

```
├── .github/workflows/    # Integración continua (ci.yml) y despliegue a Pages (deploy.yml)
├── docs/                 # Documentación final y auditoría de aceptación
├── evidence/             # Consultas NASA/JPL originales y kernels SPK verificados con SHA-256
├── public/               # Datos JSON/TSV, modelos GLB NASA, texturas y fotografías servidos en runtime
├── scripts/              # Scripts activos de adquisición de efemérides y verificación offline
├── source-assets/        # Imágenes fuente originales de mosaicos lunares (referencia de procedencia)
├── src/                  # Código fuente modular del simulador
├── tests/                # 485 pruebas automatizadas (node:test)
├── index.html            # Documento principal
├── package.json          # Dependencias y comandos npm
├── vite.config.js        # Configuración de compilación y ruta base de GitHub Pages
└── eslint.config.js      # Reglas de detección de errores
```
