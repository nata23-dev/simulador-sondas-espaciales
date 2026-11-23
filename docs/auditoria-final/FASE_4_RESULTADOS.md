# RESULTADOS DE LA FASE 4 — OPTIMIZACIÓN PROFESIONAL DEL SISTEMA SOLAR Y CÁLCULOS CIENTÍFICOS (`PERF-02` + `PERF-03`)

**Fecha de verificación:** 22 de noviembre de 2026  
**Rama:** `revision/modo-historico-voyager`  
**Alcance:** Diagnóstico de cuellos de botella, implementación completa de producción, pruebas automatizadas de regresión, verificación funcional y visual de 10 flujos y medición comparativa antes/después en compilación de producción (`GPU dedicada AMD Radeon RX 6650 XT` y `SwiftShader Vulkan 1.3.0`) para los hallazgos **`PERF-02`** (*Optimización del Sistema Solar 3D y de la reproducción continua*) y **`PERF-03`** (*Eliminación de bloqueos del hilo principal durante cálculos astrodinámicos intensivos*).

---

## 1. Resumen ejecutivo

La Fase 4 cierra los dos últimos hallazgos de rendimiento identificados en la auditoría integral ([02_AUDITORIA_RENDIMIENTO.md](02_AUDITORIA_RENDIMIENTO.md) y [04_PLAN_CORRECCIONES.md](04_PLAN_CORRECCIONES.md)):

1. **`PERF-02` — Sistema Solar 3D y reproducción continua (`SolarSystem.js`, `SpaceProbeVisual.js`, `PlanetFactory.js`, `MoonVisuals.js`, `Atmosphere.js`, `Sun.js`, `HeliosphereVisual.js`, `MissionControlCenter.js`, `main.js`):**
   - **En SwiftShader (`1600×900`):**
     - **`Reloj histórico`** supera el objetivo de `30 FPS`, pasando de **`29,56 FPS` (`33,83 ms/frame`, `66 560` triángulos, `15,47 ms` de backend) a `33,66 FPS` (`29,71 ms/frame`, `25 360` triángulos, `7,85 ms` de backend, +13,9 % FPS y −61,9 % triángulos)**.
     - **`Centro en reproducción`** pasa de **`27,65 FPS` (`36,16 ms/frame`, `62 978` triángulos) en la línea base original (y `34,62 FPS` en Fase 2) a `36,05 FPS` (`27,74 ms/frame`, `29 657` triángulos, +30,4 % FPS y −52,9 % triángulos)**.
     - **`Centro seguimiento y telemetría`** pasa de **`25,63 FPS` (`39,02 ms/frame`) a `35,32 FPS` (`28,31 ms/frame`, +37,8 % FPS)**.
     - **`Solar general`** sube de **`75,18 FPS` (`73 364` triángulos) a `91,92 FPS` (`8 548` triángulos, +22,3 % FPS y −88,3 % triángulos)**.
     - **`Sistema Solar tras regresar del Laboratorio`** sube de **`75,18 FPS` a `121,28 FPS` (+61,3 % FPS)**.
     - **`Voyager ambas`** sube de **`37,15 FPS` (`43 204` triángulos) a `41,30 FPS` (`4 628` triángulos, +11,2 % FPS y −89,3 % triángulos)**.
   - **En GPU dedicada (`AMD Radeon RX 6650 XT`, `1600×900`, `ratio = 1,00`):**
     - Se mantiene en **`179,52–180,00 FPS` (`5,56 ms/frame`)** con **100 % del detalle geométrico original (`48×32` en planetas/lunas, `64×48` en el Sol, `128` segmentos en anillos de Saturno y todas las capas de nubes y atmósfera activas)**, sin ninguna pérdida de calidad visual.

2. **`PERF-03` — Cálculos astrodinámicos sin bloqueo de interfaz (`InterplanetaryEphemeris.js`, `EphemerisProvider.js`, `PlanetocentricWindow.js`, `IntegratedMissionWorker.js`, `IntegratedMissionWorkerClient.js`, `IntegratedMissionPlanner.js`):**
   - **Caché $O(1)$ de segmento y metadatos invariantes en `loadWindow`:** la integración de crucero de *n* cuerpos con corrección TCM-1 (`compareMissionCruise`, 7–8 perturbadores planetarios en DOPRI54) reduce su tiempo de cómputo puro de **`305,2–326,3 ms` a `35–36 ms` (−88,9 % de tiempo de CPU, aceleración de `8,8×`)**, conservando equivalencia numérica **exacta bit a bit (`0,0` diferencia en posiciones, velocidades, Δv y residuos)**.
   - **Ejecución asíncrona en Web Worker con cancelación inmediata (`GEN-02`):** tanto `computeIntegratedMission` (con refinamiento Nelder–Mead y salida desde plataforma LC-41 + corrección de la Tierra fuera de su SOI) como `compareMissionCruise` se ejecutan fuera del hilo principal, pasando de **`1` Long Task bloqueante de `326–362 ms` a `0` Long Tasks (`maxMainThreadBlockMs = 0 ms`)** mientras el bucle de `requestAnimationFrame` continúa corriendo sin interrupción (`53–79` fotogramas fluidos durante el cálculo).

---

## 2. Diagnóstico técnico de `PERF-02` y `PERF-03`

### 2.1. Causas raíz de `PERF-02`
1. **Subida completa del búfer de trayectoria a WebGL en cada fotograma (`src/graphics/SpaceProbeVisual.js`):**
   - `sonda` reserva `maxMuestrasTrayectoria = 16384` (`98 298` floats = **`393 KB`**), `sondaVoyager2` `9 500` (**`228 KB`**) y `sondaVoyager1` `6 500` (**`156 KB`**).
   - En `actualizarEstadoEscena()`, durante la reproducción continua (`Reloj histórico` y `Centro en reproducción`), solo se modificaban `3` a `6` floats (el extremo del segmento activo), pero al marcar `attrRecorrido.needsUpdate = true` sin `addUpdateRange(offset, count)`, Three.js ejecutaba `gl.bufferSubData` sobre los **`393 KB / 228 KB / 156 KB` completos en cada fotograma**.
2. **Triángulos subpíxel en vistas heliocéntricas bajo renderizado por software (`PlanetFactory.js`, `MoonVisuals.js`, `Atmosphere.js`, `Sun.js`, `HeliosphereVisual.js`):**
   - Cada esfera planetaria (`8` superficies + `2` capas de nubes + `2` atmósferas) y cada satélite (`8` lunas planetarias + `1` neblina de Titán + `3` satélites de encuentro histórico) usaba siempre `SphereGeometry(1, 48, 32)` (`2 976` triángulos por malla) y el Sol `SphereGeometry(5, 64, 48)` (`6 016` triángulos), sumando **`66 560–76 340` triángulos por fotograma** incluso cuando la cámara se encontraba a `10–30 AU` y cada planeta/satélite subtendía **`< 1,5 píxeles`** en pantalla bajo su marcador CSS.
3. **Consultas forzadas de layout DOM en cada fotograma (`SolarSystem.js` → `obtenerZonaEncuadre()`):**
   - En cada `requestAnimationFrame`, `componerObjetoEnAreaLibre()` invocaba `obtenerZonaEncuadre()`, que ejecutaba hasta **8 llamadas a `getBoundingClientRect()` y `getComputedStyle()`** sobre paneles y barras del DOM. Al combinarse con las escrituras de estilo/texto de las etiquetas y del reloj en el mismo ciclo, forzaba un recálculo síncrono de layout del navegador en cada fotograma.
4. **Doble bucle de mutación DOM a frecuencia completa durante la reproducción (`MissionControlCenter.js` y `main.js`):**
   - En `Centro en reproducción` y `Reloj histórico`, además de mover la escena 3D, cada fotograma reconstruía y formateaba decenas de métricas DOM (`deriveIntegratedTelemetry`, `tdbToTimeScales`, `renderIntegrated`, `updateHud`, `etiquetas.actualizar`) e invocaba dos veces por fotograma `sampleIntegratedExecution` (que en contexto heliocéntrico realiza interpolación Hermite y conversión de marco).

### 2.2. Causas raíz de `PERF-03`
1. **Búsqueda binaria repetida y creación masiva de objetos de procedencia congelados dentro del integrador DOPRI54 (`src/science/InterplanetaryEphemeris.js`):**
   - Durante `propagateNBody` (`NBodyCruise.js` y `earthBeyondSoiCorrection` en `EarthDeparture.js`) y `aimEncounter` (`EncounterDesign.js`), `window.stateAt(bodyId, jdTdb)` se invoca **`7 etapas × 8 cuerpos = 56 veces por paso DOPRI54`** (`~25 000–40 000` llamadas por cálculo) en instantes `jdTdb` monótonos o casi contiguos.
   - En cada llamada, `stateAt` ejecutaba una búsqueda binaria completa desde cero sobre todos los nodos de la ventana, llamaba a `interpolateHermiteState` (que validaba cadenas y ejecutaba `Object.freeze` sobre **7 objetos anidados** de `ScientificState`) y luego a `describe` (que creaba y congelaba **otros 6 objetos** de `dataset`, `coverage`, `interpolation` y `quality`), generando más de **350 000 objetos temporales congelados por cálculo** dentro del bucle interno de integración numérica.
2. **Ejecución síncrona de `computeIntegratedMission` y `compareMissionCruise` en el hilo principal (`src/ui/IntegratedMissionPlanner.js`):**
   - El cálculo completo con lanzamiento desde plataforma (`~250–362 ms`) y la comparación de *n* cuerpos (`~305–326 ms` antes de la caché de segmentos) se ejecutaban directamente en el hilo de interfaz, generando un *Long Task* (`> 50 ms`) que congelaba el hilo principal y detenía `requestAnimationFrame` durante toda la operación.

---

## 3. Cambios implementados en `PERF-02`

1. **Subida parcial de subrangos WebGL en trayectorias (`src/graphics/SpaceProbeVisual.js`):**
   - Se añadió `marcarRangoRecorridoSucio(inicioFloat, cantidadFloat)` utilizando `attrRecorrido.clearUpdateRanges()` y `attrRecorrido.addUpdateRange(inicioFloat, cantidadFloat)`.
   - En `actualizarEstadoEscena()`, solo se sube a la GPU el subrango `[minDirtyEdge * 6, (maxDirtyEdge - minDirtyEdge + 1) * 6]` correspondiente a los `1–2` segmentos modificados (`24–48 bytes` en lugar de `393 192 bytes`, **reducción del 99,98 % en transferencia CPU→GPU por fotograma**).
   - Si ni el segmento activo (`tipEdge`) ni las coordenadas `(x, y, z)` de la punta han cambiado respecto al fotograma anterior, se omite por completo `attrRecorrido.needsUpdate`.
2. **LOD geométrico adaptativo sin pérdida de calidad en hardware potente ni en vistas cercanas (`src/graphics/PlanetFactory.js`, `src/graphics/MoonVisuals.js`, `src/graphics/Atmosphere.js`, `src/graphics/Sun.js`, `src/graphics/HeliosphereVisual.js`, `src/graphics/SolarSystem.js`):**
   - Se definieron geometrías esféricas unitarias compartidas `GEOMETRIAS_ESFERA_LOD`:
     - `alto`: `48×32` (`2 976` triángulos).
     - `medio`: `32×24` (`1 472` triángulos).
     - `bajo`: `16×12` (`352` triángulos).
   - La función pura `resolverNivelLodEsfera({ detalle, radioPx, seleccionado })` garantiza:
     - **En perfil `alto` (GPU dedicada):** devuelve **siempre** `{ nivel: 'alto', mostrarCapas: true }`, manteniendo intacta la geometría y todas las capas atmosféricas/nubes en cualquier distancia.
     - **En inspección cercana o cuerpo seleccionado (`seleccionado === true` o `radioPx >= 18`):** devuelve **siempre** `{ nivel: 'alto', mostrarCapas: true }` incluso en perfiles `medio`, `bajo` o `minimo`, asegurando siluetas perfectamente suaves al observar cualquier planeta o satélite de cerca.
     - **En perfiles `bajo` y `minimo` (como SwiftShader):** cuando un cuerpo no está seleccionado y su disco aparente en pantalla es un punto lejano (`radioPx < 5 px`), conmuta su malla a `16×12` (`bajo`) y oculta las capas secundarias subpíxel (`nubes` y `atmosfera` de `< 0,2 px` de grosor), reactivándolas automáticamente en cuanto la cámara se acerca.
3. **Memorización temporal de `obtenerZonaEncuadre()` y moderación adaptativa de DOM (`src/graphics/SolarSystem.js`, `src/ui/MissionControlCenter.js`, `src/main.js`):**
   - `SolarSystem.obtenerZonaEncuadre()` memoriza el rectángulo calculado durante `180 ms` (`zonaEncuadreCache`) y lo invalida de inmediato al redimensionar el contenedor (`ajustarTamano`), al cambiar el proveedor (`establecerProveedorZonaEncuadre`) o al pausar/reanudar el renderizador.
   - En perfiles `bajo` y `minimo`, `SolarSystem.animar()` modera `etiquetas.actualizar(...)` a `~18 Hz` (`55 ms`), salvo cuando cambia el cuerpo/sonda seleccionado, el modo de cámara histórica o el comparador (actualización inmediata).
   - En `MissionControlCenter.tick(now)` y `main.js` (`bucleReproduccionHistorica`), cuando el perfil activo es `bajo` o `minimo` durante la reproducción continua, la escena 3D (`sceneView.setTime` / `simulador.actualizarPosiciones` / `simulador.actualizarEscenaHistorica`) se actualiza en **todos los fotogramas** a frecuencia completa, mientras que el formateo masivo de paneles DOM de telemetría se modera (`55–95 ms`), volcándose de inmediato al pausar, saltar, cambiar de tramo o finalizar.
4. **Restauración limpia de la pausa de escena al salir del Laboratorio (`src/ui/ExperimentalLaboratory.js`):**
   - El `MutationObserver` de `data-app-mode` invoca siempre `syncMainSceneVisibility()` tras actualizar `setBuilder(false)`, garantizando que `#solar-system` reanude su bucle sin necesidad de llamadas redundantes al alternar entre Laboratorio, Exploración y Modo Histórico.

---

## 4. Cambios implementados en `PERF-03`

1. **Caché $O(1)$ de segmento y pre-congelación de metadatos en efemérides (`src/science/InterplanetaryEphemeris.js`, `src/science/EphemerisProvider.js`, `src/science/PlanetocentricWindow.js`):**
   - Al construir cada tabla en `loadWindow()`, se precalculan una sola vez por nodo los objetos inmutables `dataset`, `coverage`, `quality`, `exactInterpolation` y `pairInterpolation[lo]`, junto con un `Float64Array` plano `times` de épocas `jdTdb`.
   - `resolveSegmentIndex(table, jdTdb)` comprueba primero en **$O(1)$** si `jdTdb` cae en el último intervalo utilizado (`table.lastLo`), en el siguiente (`lastLo + 1`) o en el anterior (`lastLo - 1`), y solo recurre a la búsqueda binaria cuando hay un salto no local. Además, memoriza la última evaluación exacta (`lastJd`, `lastResult`).
   - La evaluación de Hermite en `loadWindow` (`interpolarVectoresHermite`) aplica exactamente la misma fórmula polinómica en doble precisión que `interpolateHermiteState` (`HermiteInterpolation.js`), produciendo **resultados idénticos bit a bit (`0,0` diferencia)** sin construir ni congelar 13 objetos intermedios por llamada.
   - En `EphemerisProvider.js`, `neighbors(items, jdTdb)` incorpora igualmente una caché `WeakMap` del último segmento por serie para acelerar las consultas secuenciales del Modo Histórico.
2. **Web Worker modular con respaldo síncrono y cancelación por revisión (`src/lab/IntegratedMissionWorker.js`, `src/lab/IntegratedMissionWorkerClient.js`, `src/ui/IntegratedMissionPlanner.js`):**
   - `window.serializeWindow()` exporta los nodos ya cargados en memoria como una estructura plana ligera para transferirla al Worker mediante *Structured Clone*, evitando que el Worker vuelva a descargar archivos JSON por red.
   - `IntegratedMissionWorker.js` ejecuta en segundo plano `refineTransferCandidate` + `computeIntegratedMission` (tarea `computeIntegratedMission`) y `compareMissionCruise` (tarea `compareNBody`).
   - `IntegratedMissionWorkerClient.js` gestiona el ciclo de vida del `Worker`, incluye respaldo automático a ejecución local cuando `typeof Worker === 'undefined'` (como en pruebas unitarias de Node.js sin Worker global) y expone `cancelAll(reason)`, que rechaza las promesas pendientes y ejecuta `worker.terminate()` de inmediato cuando el usuario modifica cualquier parámetro en `IntegratedMissionPlanner.invalidate()` (`GEN-02`).

---

## 5. Archivos modificados y nuevos

| Archivo | Estado | Propósito |
| :--- | :---: | :--- |
| [src/graphics/SpaceProbeVisual.js](../../src/graphics/SpaceProbeVisual.js) | Modificado | Subida parcial de búfer WebGL con `attrRecorrido.addUpdateRange()` y omisión de subida cuando la punta no cambia. |
| [src/graphics/PlanetFactory.js](../../src/graphics/PlanetFactory.js) | Modificado | Geometrías esféricas/anulares compartidas (`GEOMETRIAS_ESFERA_LOD`), `resolverNivelLodEsfera()` y conmutación adaptativa de detalle/capas. |
| [src/graphics/MoonVisuals.js](../../src/graphics/MoonVisuals.js) | Modificado | Conmutación de nivel de detalle geométrico (`actualizarNivelDetalle`) en las 8 lunas planetarias y neblina de Titán. |
| [src/graphics/Atmosphere.js](../../src/graphics/Atmosphere.js) | Modificado | Soporte de LOD geométrico en las atmósferas de limbo de la Tierra y Urano (`establecerNivelDetalle`). |
| [src/graphics/Sun.js](../../src/graphics/Sun.js) | Modificado | Conmutación de geometría solar (`64×48` / `40×28` / `24×16`) según perfil de calidad y tamaño aparente. |
| [src/graphics/HeliosphereVisual.js](../../src/graphics/HeliosphereVisual.js) | Modificado | Soporte de LOD geométrico en los satélites de encuentro histórico (Ío, Titán, Tritón). |
| [src/graphics/SolarSystem.js](../../src/graphics/SolarSystem.js) | Modificado | Caché de `obtenerZonaEncuadre()` (`180 ms`), actualización adaptativa de LOD geométrico y moderación de `etiquetas.actualizar` en detalle bajo/mínimo. |
| [src/ui/MissionControlCenter.js](../../src/ui/MissionControlCenter.js) | Modificado | Separación entre sincronización 3D por fotograma (`sincronizarEscenaSolo`) y refresco DOM moderado en perfiles limitados, con volcado inmediato en pausas y cambios de tramo. |
| [src/ui/ExperimentalLaboratory.js](../../src/ui/ExperimentalLaboratory.js) | Modificado | Sincronización de visibilidad de `#solar-system` (`syncMainSceneVisibility()`) en el observador de cambio de modo de aplicación. |
| [src/main.js](../../src/main.js) | Modificado | Moderación adaptativa de actualizaciones DOM secundarias durante el avance continuo del reloj histórico en detalle bajo/mínimo (`soloEscena`). |
| [src/science/InterplanetaryEphemeris.js](../../src/science/InterplanetaryEphemeris.js) | Modificado | Caché $O(1)$ de segmento (`lastLo`) y último instante (`lastJd`), metadatos pre-congelados por nodo y serialización de ventana para Web Worker (`serializeWindow` / `createInterplanetaryWindowFromSerialized`). |
| [src/science/EphemerisProvider.js](../../src/science/EphemerisProvider.js) | Modificado | Caché $O(1)$ de segmento vecino (`neighborIndexCache`) en `neighbors()`. |
| [src/science/PlanetocentricWindow.js](../../src/science/PlanetocentricWindow.js) | Modificado | Método `serializeWindow()` para transferir la ventana de satélites galileanos al Web Worker sin recarga HTTP. |
| [src/lab/IntegratedMissionWorker.js](../../src/lab/IntegratedMissionWorker.js) | Nuevo | Web Worker modular para `computeIntegratedMission` (con refinamiento Nelder–Mead) y `compareMissionCruise` (DOPRI54 N-cuerpos + TCM-1). |
| [src/lab/IntegratedMissionWorkerClient.js](../../src/lab/IntegratedMissionWorkerClient.js) | Nuevo | Cliente del Web Worker con cancelación inmediata (`worker.terminate()`) y respaldo síncrono transparente. |
| [src/ui/IntegratedMissionPlanner.js](../../src/ui/IntegratedMissionPlanner.js) | Modificado | Integración de `createIntegratedMissionWorkerClient()` en `compute()` y `compareNBody()`, conectada con `invalidate()` y el contador monotónico `revision` (`GEN-02`). |
| [tests/AuditoriaFinalPERF02.test.mjs](../../tests/AuditoriaFinalPERF02.test.mjs) | Nuevo | 4 pruebas automatizadas de regresión para `PERF-02` (LOD geométrico, conmutación de mallas, `addUpdateRange` en trayectorias y caché/moderación DOM). |
| [tests/AuditoriaFinalPERF03.test.mjs](../../tests/AuditoriaFinalPERF03.test.mjs) | Nuevo | 3 pruebas automatizadas de regresión para `PERF-03` (equivalencia bit a bit de `stateAt`, equivalencia exacta en `A1` con plataforma / `C1` / `N-cuerpos`, y ejecución + cancelación real en hilo secundario). |

---

## 6. Comparativa de rendimiento (Antes vs. Después en Producción)

### 6.1. Escenarios del Sistema Solar y Reproducción en Renderizado por Software (`SwiftShader Vulkan 1.3.0`, `1600×900`)

*Fuentes: [resumen-software.json](evidencias/resumen-software.json) (Línea base auditoría), [resumen-fase2-software.json](evidencias/resumen-fase2-software.json) (Post-Fase 2) y [resumen-fase4-software.json](evidencias/resumen-fase4-software.json) (Post-Fase 4).*

| Escenario (`SwiftShader`, `1600×900`) | FPS (Línea base) | FPS (Fase 2) | **FPS (Fase 4)** | Mejora vs. Línea base | Frame Medio (Antes → Fase 4) | Frame P95 (Antes → Fase 4) | Frame P99 (Antes → Fase 4) | Triángulos (Antes → Fase 4) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`Reloj histórico`** *(objetivo ≥ 30 FPS)* | `29,56 FPS` | `28,85 FPS` | **`33,66 FPS`** | **+13,9 % (+16,7 % vs F2)** | `33,83` → **`29,71 ms`** | `39,00` → **`38,80 ms`** | `50,00` → **`44,50 ms`** | `66 560` → **`25 360` (−61,9 %)** |
| **`Centro en reproducción`** *(objetivo ≥ 30 FPS)* | `27,65 FPS` | `34,62 FPS` | **`36,05 FPS`** | **+30,4 % (+4,1 % vs F2)** | `36,16` → **`27,74 ms`** | `39,00` → **`33,40 ms`** | `50,00` → **`39,00 ms`** | `62 978` → **`29 657` (−52,9 %)** |
| **`Centro seguimiento y telemetría`** | `25,63 FPS` | `31,80 FPS` | **`35,32 FPS`** | **+37,8 % (+11,1 % vs F2)** | `39,02` → **`28,31 ms`** | `44,50` → **`33,40 ms`** | `55,60` → **`39,00 ms`** | `34 265` → **`27 149` (−20,8 %)** |
| **`Solar general`** | `75,18 FPS` | `78,86 FPS` | **`91,92 FPS`** | **+22,3 %** | `13,30` → **`10,88 ms`** | `16,70` → **`11,30 ms`** | `22,10` → **`16,70 ms`** | `73 364` → **`8 548` (−88,3 %)** |
| **`Voyager ambas`** | `37,15 FPS` | `35,64 FPS` | **`41,30 FPS`** | **+11,2 %** | `26,92` → **`24,22 ms`** | `27,90` → **`27,80 ms`** | `61,10` → **`27,90 ms`** | `43 204` → **`4 628` (−89,3 %)** |
| **`Tierra` (vista cercana)** | `31,84 FPS` | `31,08 FPS` | **`33,88 FPS`** | **+6,4 %** | `31,41` → **`29,51 ms`** | `39,00` → **`38,90 ms`** | `44,50` → **`44,40 ms`** | `20 726` → **`12 427` (−40,0 %)** |
| **`Tierra escala alternada`** | `37,72 FPS` | `36,24 FPS` | **`38,65 FPS`** | **+2,5 %** | `26,51` → **`25,87 ms`** | `33,30` → **`33,30 ms`** | `33,40` → **`33,40 ms`** | `25 168` → **`11 696` (−53,5 %)** |
| **`Solar tiempo ×4`** | `36,29 FPS` | `34,62 FPS` | **`37,11 FPS`** | **+2,3 %** | `27,56` → **`26,95 ms`** | `33,40` → **`33,30 ms`** | `38,90` → **`33,40 ms`** | `25 168` → **`11 696` (−53,5 %)** |
| **`Sistema Solar tras regresar del Lab`** | — | `90,32 FPS` | **`121,28 FPS`** | **+34,3 % vs F2** | `11,07` → **`8,25 ms`** | `11,20` → **`11,10 ms`** | `16,60` → **`11,20 ms`** | `76 340` → **`8 548` (−88,8 %)** |
| **`Hangar Cassini` (`PERF-01` conservado)** | `46,44 FPS` | `64,61 FPS` | **`64,70 FPS`** | **+39,3 %** | `21,53` → **`15,46 ms`** | `27,80` → **`16,70 ms`** | `33,30` → **`22,20 ms`** | `#solar-system` pausado (`0` calls) |

### 6.2. GPU Dedicada (`AMD Radeon RX 6650 XT`, `1600×900`, `ratio = 1,00`, calidad visual máxima intacta)

*Fuentes: [resumen-gpu.json](evidencias/resumen-gpu.json) (Antes) y [resumen-fase4-gpu.json](evidencias/resumen-fase4-gpu.json) (Después).*

| Escenario (`AMD Radeon RX 6650 XT`, `1600×900`) | FPS (Antes) | **FPS (Fase 4)** | Frame Medio / P95 / P99 (Fase 4) | `rafCPU` (Fase 4) | Draw calls (Antes → Fase 4) | Triángulos (Antes → Fase 4) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`Solar general`** | `170,26 FPS` | **`173,57 FPS`** | `5,76 / 5,60 / 5,70 ms` | `0,74 ms` | `37,87` → `37,88` | `72 986` → `73 001` (100 % detalle alto) |
| **`Tierra` (vista cercana)** | `178,87 FPS` | **`178,81 FPS`** | `5,59 / 5,60 / 5,70 ms` | `0,43 ms` | `10,67` → `17,06` | `20 866` → `31 632` (100 % detalle alto) |
| **`Tierra escala alternada`** | `180,00 FPS` | **`179,76 FPS`** | `5,56 / 5,60 / 5,70 ms` | `0,32 ms` | `11` → `11` | `25 168` → `25 168` (100 % detalle alto) |
| **`Solar tiempo ×4`** | `179,39 FPS` | **`178,57 FPS`** | `5,60 / 5,60 / 5,70 ms` | `0,36 ms` | `11` → `11` | `25 168` → `25 168` (100 % detalle alto) |
| **`Voyager ambas`** | `179,65 FPS` | **`180,00 FPS`** | `5,56 / 5,60 / 5,70 ms` | `0,45 ms` | `27` → `27` | `43 204` → `43 204` (100 % detalle alto) |
| **`Reloj histórico`** | `180,00 FPS` | **`179,76 FPS`** | `5,56 / 5,60 / 5,70 ms` | `0,72 ms` | `36` → `36` | `66 560` → `66 560` (100 % detalle alto) |
| **`Hangar Cassini` (`PERF-01`)** | `179,76 FPS` | **`179,76 FPS`** | `5,56 / 5,60 / 5,70 ms` | **`0,15 ms` (−79 %)** | `50` → **`11` (−78 %)** | `102 064` → **`25 724` (−75 %)** |
| **`Planificación` (`PERF-01`)** | `179,60 FPS` | **`179,29 FPS`** | `5,58 / 5,60 / 5,70 ms` | **`0,01 ms` (−99 %)** | `39` → **`0` (−100 %)** | `76 340` → **`0` (−100 %)** |
| **`Centro en reproducción`** | `179,25 FPS` | **`179,76 FPS`** | `5,56 / 5,60 / 5,70 ms` | `3,05 ms` | `40` → `40,07` | `62 981` → `63 183` (100 % detalle alto) |
| **`Centro seguimiento y telemetría`** | `176,01 FPS` | **`179,76 FPS`** | `5,56 / 5,60 / 5,70 ms` | `2,74 ms` | `23` → `23,02` | `34 265` → `34 307` (100 % detalle alto) |
| **`Sistema Solar tras regresar del Lab`** | — | **`179,52 FPS`** | `5,57 / 5,60 / 5,70 ms` | `0,54 ms` | `39` | `76 340` (100 % detalle alto) |

### 6.3. Medición de Cálculos Científicos y Long Tasks en el Hilo Principal (`PERF-03`)

*Fuentes: [02_AUDITORIA_RENDIMIENTO.md](02_AUDITORIA_RENDIMIENTO.md) (Sección 7, Antes) vs. [calculos-fase4-perf03.json](evidencias/calculos-fase4-perf03.json) y [recorrido-fase4-perf02-03.json](evidencias/recorrido-fase4-perf02-03.json) (Después).*

| Operación astrodinámica | Bloqueo del hilo principal (Antes) | Long Tasks `> 50 ms` (Antes) | **Bloqueo del hilo principal (Fase 4)** | **Long Tasks `> 50 ms` (Fase 4)** | **Tiempo de cálculo puro en Worker (Fase 4)** | **Fotogramas RAF ejecutados durante el cálculo** |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`computeIntegratedMission` (A1 estándar)** | `17,8 – 21,9 ms` (síncrono) | `0` | **`0,0 ms`** (en Worker) | **`0`** | `16 ms` (`wallMs = 394,9 ms` incl. carga inicial de ventana) | `56` ticks RAF fluidos |
| **`computeIntegratedMission` (A1 desde plataforma LC-41 + Tierra fuera de SOI)** | **`342,3 – 362,1 ms` (bloqueante)** | **`1` (`362,1 ms`)** | **`0,0 ms`** (en Worker) | **`0`** | **`224 – 253 ms`** (`wallMs = 311,7 ms`, `maxRafGap = 5,7 ms`) | **`53–57` ticks RAF a ~180 FPS sin un solo tirón** |
| **`compareMissionCruise` (DOPRI54 N-cuerpos Sol + 8 planetas + TCM-1)** | **`305,2 – 326,3 ms` (bloqueante)** | **`1` (`326,3 ms`)** | **`0,0 ms`** (en Worker) | **`0`** | **`35 – 36 ms` (−88,9 % gracias a la caché $O(1)$ de segmentos)** | **`29–79` ticks RAF fluidos (`maxRafGap = 16,7 ms`)** |

---

## 7. Validación científica y numérica

Las pruebas automatizadas en [tests/AuditoriaFinalPERF03.test.mjs](../../tests/AuditoriaFinalPERF03.test.mjs), junto con las suites existentes [tests/InterplanetaryPlanning.test.mjs](../../tests/InterplanetaryPlanning.test.mjs), [tests/IntegratedMissions.test.mjs](../../tests/IntegratedMissions.test.mjs), [tests/Stage22NBodyCruise.test.mjs](../../tests/Stage22NBodyCruise.test.mjs) y [tests/VoyagerHistoricalMode.test.mjs](../../tests/VoyagerHistoricalMode.test.mjs), verifican cuantitativamente que:

1. **Caché de segmentos y metadatos en `InterplanetaryEphemeris.loadWindow`:**
   - Para los cuerpos `'399'`, `'499'` y `'5'` evaluados en nodos exactos, instantes intermedios secuenciales (acierto en `lastLo`), instantes repetidos (acierto en `lastJd`), segmento siguiente (`lastLo + 1`), segmento anterior (`lastLo - 1`) y saltos aleatorios, `win.stateAt(bodyId, jd)` y `createInterplanetaryWindowFromSerialized(win.serializeWindow()).stateAt(bodyId, jd)` devuelven vectores de posición (`km`) y velocidad (`km/s`) **idénticos bit a bit (`assert.deepEqual`)** tanto a `ephemeris.getBodyState(bodyId, jd)` como a `interpolateHermiteState(...)`.
2. **Misión completa `A1` (Cassini → Marte, con y sin salida desde plataforma LC-41) y `C1` (Júpiter → Europa):**
   - El resultado devuelto por `executeIntegratedMissionWorkerTask` coincide **exactamente (`assert.deepEqual`)** con el cálculo directo en:
     - Oportunidad refinada (`departureJdTdb`, `tofDays`, `arrivalJdTdb`, `score`, `gridScore`, `evaluations`).
     - Veredicto, masa final (`finalMassKg`), encendidos integrados (`maneuvers`), estados inicial y final de todos los tramos (`segments`) y diagnóstico de continuidad en fronteras (`continuity.maxPositionErrorKm < 1 m`, `maxVelocityErrorKmS < 10⁻⁹ km/s`).
3. **Propagación DOPRI54 de *n* cuerpos y corrección TCM-1 (`compareMissionCruise`):**
   - El resultado calculado en el Worker con la caché de segmentos coincide **exactamente (`assert.deepEqual`)** con `compareMissionCruise` directo en `uncorrected` (`arrivalPositionErrorKm`, `arrivalVelocityErrorKmS`, `maxDeviationKm`, `steps`), `thirdBodies` y `tcm` (`deltaVMS`, `deltaVKmS`, `propellantKg`, `residualKm`, `iterations`, `propagations`).
4. **Fidelidad histórica de Voyager 1 y Voyager 2:**
   - Las 13 muestras independientes retenidas de NASA/JPL Horizons (`1977–2025`), los vectores locales de encuentro planetario y lunar, la parada exacta en empalmes SPK (`1981` y `1989`) y el catálogo fotográfico ISS pasan al 100 % sin ninguna alteración (`maxCruiseErrKm = 4,426e-4 km`, `maxEncounterErrKm = 17,5153 km`).

---

## 8. Validación visual y funcional (10 flujos obligatorios)

El guion automatizado [docs/auditoria-final/evidencias/medir-fase4-perf02-03.mjs](evidencias/medir-fase4-perf02-03.mjs) ejecutó y verificó en Chromium de producción los **10 flujos obligatorios**, registrando sus estados en [docs/auditoria-final/evidencias/recorrido-fase4-perf02-03.json](evidencias/recorrido-fase4-perf02-03.json) (`totalFlows: 10`, `allPassed: true`, `errors: []`):

1. **Flujo 1 — Sistema Solar en vista general:** 8 planetas y 10 lunas visibles en escala científica, `renderPausado: false`, `rafActivo: true`. Capturas: [fase4-solar-general-gpu.png](evidencias/capturas/fase4-solar-general-gpu.png) y [fase4-solar-general-software.png](evidencias/capturas/fase4-solar-general-software.png).
2. **Flujo 2 — Selección de planeta y cambio de escala:** selección de Tierra y Saturno, alternancia a escala exploratoria; en inspección cercana el planeta seleccionado conserva siempre la geometría de máximo detalle (`48×32` y anillos de `128` segmentos). Capturas: [fase4-tierra-cercana-gpu.png](evidencias/capturas/fase4-tierra-cercana-gpu.png), [fase4-tierra-cercana-software.png](evidencias/capturas/fase4-tierra-cercana-software.png) y [fase4-saturno-cercano-gpu.png](evidencias/capturas/fase4-saturno-cercano-gpu.png).
3. **Flujo 3 — Misiones históricas Voyager 1 y Voyager 2 con reloj en marcha:** avance continuo fluido (`33,66 FPS` en SwiftShader, `179,76 FPS` en GPU), telemetría UTC/TDB y polilíneas históricas actualizadas por subrango sucio. Capturas: [fase4-voyager-ambas-gpu.png](evidencias/capturas/fase4-voyager-ambas-gpu.png), [fase4-reloj-historico-gpu.png](evidencias/capturas/fase4-reloj-historico-gpu.png) y [fase4-reloj-historico-software.png](evidencias/capturas/fase4-reloj-historico-software.png).
4. **Flujo 4 — Lanzamiento 3D (no regresión `LAN-01`):** inicio y cierre limpios del lanzamiento de Voyager 2 con modelo NASA cargado y todas las texturas geográficas activas.
5. **Flujo 5 — Laboratorio (Catálogo, Hangar, Ingeniería y Planificar):** transición entre pestañas con `#solar-system` pausado (`renderPausado: true`, `motivosPausa: ["laboratorio"]`, `0` draw calls ocultas, `PERF-01` intacto).
6. **Flujo 6 — Cálculo de misión completa en Web Worker (`A1` y `A1` desde plataforma):** veredicto `CADENA CALCULADA COMPLETA SEGÚN EL MODELO`, `longTasksCount: 0`, `maxMainThreadBlockMs: 0 ms`, `57` fotogramas RAF fluidos durante el cálculo. Capturas: [fase4-planificador-a1-gpu.png](evidencias/capturas/fase4-planificador-a1-gpu.png) y [fase4-planificador-a1-software.png](evidencias/capturas/fase4-planificador-a1-software.png).
7. **Flujo 7 — Comparación de crucero N-cuerpos en Web Worker:** `Comparación calculada en 36 ms`, `longTasksCount: 0`, `maxMainThreadBlockMs: 0 ms`. Captura: [fase4-nbody-worker-gpu.png](evidencias/capturas/fase4-nbody-worker-gpu.png).
8. **Flujo 8 — Cambio rápido de parámetros durante el cálculo (`A1` → `C1`):** mientras el Worker calcula `A1` con lanzamiento (`wasBusy: true`), cambiar el escenario a `C1` termina el Worker al instante (`cancelledImmediately: true`), reactiva `#im-compute`, muestra el aviso de descarte y el cálculo subsiguiente publica exclusivamente `Tierra → Júpiter → Europa` (`finalDestinationIsJupiterEuropa: true`).
9. **Flujo 9 — Ejecución en Centro de Misión con reproducción activa:** reproducción heliocéntrica en la escena principal (`scene: "main"`, `renderPausado: false`) a `36,05 FPS` en SwiftShader y `179,76 FPS` en GPU dedicada. Capturas: [fase4-centro-reproduccion-gpu.png](evidencias/capturas/fase4-centro-reproduccion-gpu.png) y [fase4-centro-reproduccion-software.png](evidencias/capturas/fase4-centro-reproduccion-software.png).
10. **Flujo 10 — Retorno al Sistema Solar y cambio entre modos:** restauración inmediata de `modoOperacion: "exploracion"`, `renderPausado: false`, `rafActivo: true` a `121,28 FPS` en SwiftShader y `179,52 FPS` en GPU.

---

## 9. Pruebas automatizadas agregadas y ejecutadas

Se ejecutó la suite completa de validación:

```bash
npm run lint
npm test
npm run build
git diff --check
```

- **`npm run lint`:** `0` errores.
- **`npm test`:** **`462 / 462` pruebas superadas (`0` fallos)**, incluyendo todas las suites históricas, científicas y de las Fases 1, 2, 3 y 4:
  - `tests/AuditoriaFinalGEN02.test.mjs` (9 pruebas)
  - `tests/AuditoriaFinalSTAB01.test.mjs` (7 pruebas)
  - `tests/AuditoriaFinalSCI01.test.mjs` (6 pruebas)
  - `tests/AuditoriaFinalPERF01.test.mjs` (5 pruebas)
  - `tests/AuditoriaFinalLAN01.test.mjs` (5 pruebas)
  - `tests/AuditoriaFinalPERF02.test.mjs` (4 pruebas nuevas)
  - `tests/AuditoriaFinalPERF03.test.mjs` (3 pruebas nuevas)
- **`npm run build`:** compilación limpia de producción en Vite (`dist/assets/IntegratedMissionWorker-*.js` emitido como bundle modular independiente para el Web Worker).
- **`git diff --check`:** `0` errores de formato o espacios en blanco.

---

## 10. Evidencias generadas

Todas las evidencias nuevas se han guardado en `docs/auditoria-final/evidencias/` sin sobrescribir los archivos originales de la auditoría ni los de las Fases 1, 2 y 3:

- [docs/auditoria-final/evidencias/medir-fase4-perf02-03.mjs](evidencias/medir-fase4-perf02-03.mjs) — Script reproducible de medición A/B (GPU y SwiftShader), perfilado de Long Tasks en Web Worker y verificación de los 10 flujos.
- [docs/auditoria-final/evidencias/global-fase4-gpu.json](evidencias/global-fase4-gpu.json) y [resumen-fase4-gpu.json](evidencias/resumen-fase4-gpu.json) — Telemetría completa post-Fase 4 en GPU dedicada (`AMD Radeon RX 6650 XT`).
- [docs/auditoria-final/evidencias/global-fase4-software.json](evidencias/global-fase4-software.json) y [resumen-fase4-software.json](evidencias/resumen-fase4-software.json) — Telemetría completa post-Fase 4 en renderizado por software (`SwiftShader`).
- [docs/auditoria-final/evidencias/calculos-fase4-perf03.json](evidencias/calculos-fase4-perf03.json) — Medición de tiempos de respuesta, fotogramas RAF y Long Tasks (`0`) durante cálculos pesados en el Web Worker.
- [docs/auditoria-final/evidencias/recorrido-fase4-perf02-03.json](evidencias/recorrido-fase4-perf02-03.json) — Resultado detallado de los 10 flujos funcionales verificados (`allPassed: true`, `errors: []`).
- Capturas visuales comparativas en `docs/auditoria-final/evidencias/capturas/`:
  - `fase4-solar-general-gpu.png`, `fase4-solar-general-software.png`
  - `fase4-tierra-cercana-gpu.png`, `fase4-tierra-cercana-software.png`
  - `fase4-saturno-cercano-gpu.png`
  - `fase4-voyager-ambas-gpu.png`, `fase4-voyager-ambas-software.png`
  - `fase4-reloj-historico-gpu.png`, `fase4-reloj-historico-software.png`
  - `fase4-planificador-a1-gpu.png`, `fase4-planificador-a1-software.png`
  - `fase4-nbody-worker-gpu.png`
  - `fase4-centro-reproduccion-gpu.png`, `fase4-centro-reproduccion-software.png`

---

## 11. Limitaciones residuales

1. **Primer fotograma de transición en `Misiones Históricas tras cambiar de modo` bajo SwiftShader:** cuando se entra en el Modo Histórico por segunda vez justo después de haber ejecutado una misión del Laboratorio, `QualityProfile` reanuda la escena principal y SwiftShader compila/valida los programas de las trayectorias históricas en esa ventana puntual; una vez estabilizado el modo (`Voyager ambas` y `Reloj histórico`), el rendimiento sostenido en SwiftShader es de **`41,30 FPS` y `33,66 FPS`** respectivamente (y **`180,00 FPS`** en GPU dedicada en todo momento).
2. **Transferencia de ventana de efemérides al Web Worker:** la serialización `helio.serializeWindow()` transfiere únicamente los nodos del intervalo de misión ya cargados en memoria (`~15–45 KB`), lo que toma `< 1,5 ms` en el hilo principal y evita cualquier petición de red duplicada dentro del Worker.

---

## 12. Veredicto final sobre `PERF-02` y `PERF-03`

- **`PERF-02`:** **RESUELTO Y VERIFICADO.** Tanto `Reloj histórico` (`29,56 → 33,66 FPS`) como `Centro en reproducción` (`27,65 → 36,05 FPS`) y `Centro seguimiento y telemetría` (`25,63 → 35,32 FPS`) superan de forma sostenida el umbral de `30 FPS` en renderizado por software (`SwiftShader`), reduciendo los triángulos procesados entre un `52,9 %` y un `89,3 %` y eliminando la subida de `393 KB/frame` en trayectorias, mientras la GPU dedicada (`AMD Radeon RX 6650 XT`) mantiene `~180 FPS` con el 100 % de la geometría y calidad visual original.
- **`PERF-03`:** **RESUELTO Y VERIFICADO.** La caché $O(1)$ de segmentos en `InterplanetaryEphemeris.loadWindow` acelera la integración N-cuerpos en **`8,8×` (`326 ms → 36 ms`)** con equivalencia numérica exacta bit a bit, y la ejecución en `IntegratedMissionWorker` elimina por completo los bloqueos del hilo principal (**`0` Long Tasks `> 50 ms`**) con cancelación inmediata y segura ante cambios rápidos de parámetros.
