# RESULTADOS DE LA FASE 2 — OPTIMIZACIÓN DEL RENDERIZADO GENERAL (`PERF-01`)

**Fecha de verificación:** 22 de noviembre de 2026  
**Rama:** `revision/modo-historico-voyager`  
**Alcance:** Implementación, verificación funcional, pruebas de regresión y medición comparativa antes/después del hallazgo **`PERF-01`** (*Eliminación del renderizado oculto del Sistema Solar cuando queda cubierto por el contenedor opaco del Laboratorio*).

---

## 1. Problema identificado

Durante la auditoría integral de rendimiento ([02_AUDITORIA_RENDIMIENTO.md](02_AUDITORIA_RENDIMIENTO.md)) se demostró que el lienzo principal `#solar-system` continuaba ejecutando su bucle completo de `requestAnimationFrame` a frecuencia máxima mientras el usuario operaba en las vistas de construcción del **Laboratorio Experimental** (`1 · Elegir sonda` —Catálogo, Arquitectura/Hangar 3D, Ingeniería— y `2 · Planificar`).

A pesar de que las reglas CSS ocultan por completo la escena principal cuando `data-app-mode="experimental"`, `data-lab-view="builder"` y `data-lab-scene` no es `"main"` (`#solar-system { visibility: hidden; pointer-events: none; }` y `#experimental-lab` con fondo opaco `z-index: 35`), cada fotograma del bucle principal seguía ejecutando:

- **`renderer.render(escena, camara)`** sobre `#solar-system`: **39 llamadas de dibujo (*draw calls*)** y **76 340 triángulos** procesados en vano en cada fotograma.
- **`controladorCamara.actualizar(delta)`** y rotación de cuerpos celestes invisibles.
- **`actualizarEtiquetas()`** (proyección 3D→2D y lectura/escritura DOM sobre etiquetas ocultas por `visibility: hidden`).
- **`perfilCalidad.reportFrame(delta, ...)`**, contaminando el escalado adaptativo de calidad del Sistema Solar con tiempos de fotograma correspondientes al trabajo del Laboratorio.

---

## 2. Causa raíz

1. **`establecerRenderPausado` en [src/graphics/SolarSystem.js](../../src/graphics/SolarSystem.js) solo se utilizaba para la animación de lanzamiento 3D** (`VoyagerLaunchDirector`) y mantenía el bucle `requestAnimationFrame(animar)` corriendo indefinidamente en vacío (`if (renderPausado) return;` tras volver a encolar `requestAnimationFrame(animar)`), además de no distinguir entre múltiples motivos concurrentes de pausa.
2. **Ausencia de sincronización entre el estado visual del Laboratorio (`data-app-mode`, `data-lab-view`, `data-lab-scene`) y el estado de renderizado de `SolarSystem`:** ni [src/ui/ExperimentalLaboratory.js](../../src/ui/ExperimentalLaboratory.js), ni [src/integration/SolarSystemMissionView.js](../../src/integration/SolarSystemMissionView.js), ni [src/main.js](../../src/main.js) notificaban a `SolarSystem` cuando `#experimental-lab` cubría o descubría el lienzo `#solar-system`.
3. **Acumulación de `delta` al pausar:** en `SolarSystem.js`, `tiempoAnterior` conservaba la marca temporal previa a la pausa, por lo que al reanudar tras varios segundos o minutos el primer fotograma calculaba un `delta` gigante y lo enviaba a `controladorCamara.actualizar(delta)`, `componerObjetoEnAreaLibre(objetivo, delta)` y `perfilCalidad.reportFrame(delta, ...)`.

---

## 3. Archivos modificados y nuevos

| Archivo | Tipo | Propósito del cambio |
| :--- | :--- | :--- |
| [src/graphics/SolarSystem.js](../../src/graphics/SolarSystem.js) | Modificado | Gestión de pausa multi-motivo (`motivosPausa = new Set()`), cancelación real de `requestAnimationFrame` (`cancelAnimationFrame(rafId)`), prevención de bucles RAF duplicados (`programarFotograma()`), reinicio de `tiempoAnterior = null` (`delta = 0` en el primer fotograma reanudado sin salto temporal ni contaminación de `reportFrame`), guarda de dimensiones en `ajustarTamano()` para no limpiar el buffer WebGL si el tamaño no cambió, y ampliación de `obtenerDiagnosticoEscena()`. |
| [src/integration/SolarSystemMissionView.js](../../src/integration/SolarSystemMissionView.js) | Modificado | Nuevo método `setMainSceneOccluded(occluded)` que delega en `scene.establecerRenderPausado?.(Boolean(occluded), 'laboratorio')`. |
| [src/ui/ExperimentalLaboratory.js](../../src/ui/ExperimentalLaboratory.js) | Modificado | Función pura exportada `isMainSceneOccludedByLab(app)` y método `syncMainSceneVisibility()` invocado síncronamente en `onSceneMode`, `updateSection()` y `dispose()`. |
| [src/main.js](../../src/main.js) | Modificado | `sincronizarVisibilidadEscenaPrincipal()` conectada a los cambios de modo y al `MutationObserver` sobre `#app` (`attributeFilter: ['data-app-mode', 'data-lab-view', 'data-lab-scene']`). |
| [tests/AuditoriaFinalPERF01.test.mjs](../../tests/AuditoriaFinalPERF01.test.mjs) | Nuevo | 5 pruebas automatizadas de regresión para `PERF-01` (predicado de oclusión, propagación en `SolarSystemMissionView`, invariantes de `SolarSystem.js`/`main.js` y simulación completa de la máquina de estados RAF). |
| [docs/auditoria-final/evidencias/medir-fase2-perf01.mjs](evidencias/medir-fase2-perf01.mjs) | Nuevo | Script reproducible de medición antes/después (GPU dedicada y Software SwiftShader) y recorrido funcional automatizado de 13 pasos en Chromium. |
| [docs/auditoria-final/evidencias/global-fase2-gpu.json](evidencias/global-fase2-gpu.json) | Nuevo | Telemetría completa post-Fase 2 en GPU dedicada (AMD Radeon RX 6650 XT). |
| [docs/auditoria-final/evidencias/global-fase2-software.json](evidencias/global-fase2-software.json) | Nuevo | Telemetría completa post-Fase 2 en renderizado por software (SwiftShader Vulkan 1.3.0). |
| [docs/auditoria-final/evidencias/resumen-fase2-gpu.json](evidencias/resumen-fase2-gpu.json) | Nuevo | Resumen comparativo de FPS, tiempos de fotograma, draw calls y triángulos en GPU dedicada. |
| [docs/auditoria-final/evidencias/resumen-fase2-software.json](evidencias/resumen-fase2-software.json) | Nuevo | Resumen comparativo de FPS, tiempos de fotograma, draw calls y triángulos en software. |
| [docs/auditoria-final/evidencias/recorrido-fase2-perf01.json](evidencias/recorrido-fase2-perf01.json) | Nuevo | Evidencia del recorrido funcional de 13 pasos verificando estado de cámara, selección, pausa RAF y ausencia de errores. |

*(Los archivos originales de línea base `global-gpu.json`, `global-software.json`, `resumen-gpu.json` y `resumen-software.json` se conservaron intactos).*

---

## 4. Solución implementada

### 4.1. Criterio exacto de oclusión (`isMainSceneOccludedByLab`)
En [src/ui/ExperimentalLaboratory.js](../../src/ui/ExperimentalLaboratory.js#L16-L22), la función `isMainSceneOccludedByLab(app)` refleja con exactitud las reglas de visibilidad CSS de `experimental-laboratory.css` y `lab-shell.css`:

```javascript
export function isMainSceneOccludedByLab(app) {
    const dataset = app?.dataset;
    if (!dataset) return false;
    return dataset.appMode === 'experimental'
        && dataset.labView === 'builder'
        && dataset.labScene !== 'main';
}
```

- Cuando el usuario entra a `1 · Elegir sonda` (Catálogo, Arquitectura/Hangar 3D o Ingeniería) o a `2 · Planificar`, `isMainSceneOccludedByLab(app)` devuelve `true` y suspende el bucle de `#solar-system` bajo el motivo `'laboratorio'`.
- Cuando el usuario abre `3 · Reproducir` (Centro de Misión) con una misión heliocéntrica (`Tierra → Marte`, donde `MissionExecutionView` activa `onSceneMode(true)` y establece `data-lab-scene="main"`), `isMainSceneOccludedByLab(app)` devuelve `false` y `#solar-system` se reactiva de inmediato para mostrar la sonda integrada en el Sistema Solar.
- Si en `3 · Reproducir` se visualiza una misión local (`Cassini en Saturno`, `JUICE en Júpiter`, etc., donde `data-lab-scene="local"` y la vista se renderiza en `#mission-exec-canvas`), `#solar-system` permanece oculto y pausado.
- Al salir a `Sistema Solar` (`data-app-mode="exploracion"`) o `Misiones Históricas` (`data-app-mode="historico"`), `isMainSceneOccludedByLab(app)` devuelve `false` y `#solar-system` reanuda su renderizado normal.

### 4.2. Suspensión real del bucle `requestAnimationFrame` y motivos independientes
En [src/graphics/SolarSystem.js](../../src/graphics/SolarSystem.js#L1401-L1443):

- **`motivosPausa = new Set()`**: permite que `'laboratorio'` y `'lanzamiento'` coexistan sin interferirse. El renderizado solo está activo cuando `motivosPausa.size === 0`.
- **`cancelAnimationFrame(rafId)`**: al pausarse, se cancela inmediatamente el `requestAnimationFrame` pendiente (`rafId = null`), reduciendo a **cero** las invocaciones por fotograma del bucle principal mientras está oculto.
- **`programarFotograma()`**: garantiza que jamás exista más de un `requestAnimationFrame` activo (`if (renderPausado || rafId !== null) return;`), incluso ante cambios rápidos y repetidos de pestaña o modo.
- **Reanudación limpia sin salto temporal (`delta = 0`)**: al pausar se restablece `tiempoAnterior = null`. En el primer fotograma tras reanudar, `delta` vale `0` segundos (`tiempoAnterior === null ? 0 : (tiempo - tiempoAnterior) * 0.001`), evitando saltos bruscos en `controladorCamara.actualizar(delta)` o en la rotación planetaria, y omitiendo `perfilCalidad.reportFrame(delta, ...)` en ese fotograma de transición (`if (delta > 0)`).
- **Preservación de estado y recursos WebGL**: no se destruye el contexto WebGL 2 ni se liberan texturas, geometrías, efemérides ni estado de selección/cámara. Además, `ajustarTamano()` verifica si `ancho !== ultimoAncho || alto !== ultimoAlto` antes de invocar `renderer.setSize()`, evitando limpiar el framebuffer o forzar relayouts innecesarios al reanudar.

---

## 5. Pruebas ejecutadas

### 5.1. Batería automatizada, linter y compilación
- **`npm run lint`**: **0 errores** (ESLint limpio).
- **`npm test`**: **447 / 447 pruebas superadas** (`0` fallos) en `7,35 s`:
  - `420` pruebas originales del proyecto.
  - `22` pruebas de la Fase 1 (`GEN-02`, `STAB-01`, `SCI-01`).
  - `5` pruebas nuevas de la Fase 2 en [tests/AuditoriaFinalPERF01.test.mjs](../../tests/AuditoriaFinalPERF01.test.mjs).
- **`npm run build`**: compilación limpia de producción con Vite en `619 ms`.
- **`git diff --check`**: sin errores de formato ni espacios residuales.

### 5.2. Recorrido funcional de 13 pasos en navegador
Ejecutado automáticamente mediante [docs/auditoria-final/evidencias/medir-fase2-perf01.mjs](evidencias/medir-fase2-perf01.mjs) y registrado en [docs/auditoria-final/evidencias/recorrido-fase2-perf01.json](evidencias/recorrido-fase2-perf01.json) (`0` errores de consola, `0` excepciones de página):

| Paso | Acción | `appMode` / `labScene` | `#solar-system` CSS | `renderPausado` | `rafActivo` | `motivosPausa` | Cuerpo seleccionado y cámara |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **1** | Abrir el Sistema Solar | `exploracion` / `null` | `visible` | `false` | `true` | `[]` | `Sol` |
| **2** | Seleccionar un planeta (`Marte`) | `exploracion` / `null` | `visible` | `false` | `true` | `[]` | `Marte` (`[-144.87, 387.66, 666.36]`) |
| **3** | Abrir el Laboratorio (`Catálogo`) | `experimental` / `null` | `hidden` | **`true`** | **`false`** | `["laboratorio"]` | `Marte` preservado |
| **4** | Pasar por `Hangar / Arquitectura` | `experimental` / `null` | `hidden` | **`true`** | **`false`** | `["laboratorio"]` | `Marte` preservado |
| **5** | Seleccionar sonda `Cassini` | `experimental` / `null` | `hidden` | **`true`** | **`false`** | `["laboratorio"]` | `Marte` preservado |
| **6** | Abrir `Ingeniería` | `experimental` / `null` | `hidden` | **`true`** | **`false`** | `["laboratorio"]` | `Marte` preservado |
| **7** | Abrir `2 · Planificar` | `experimental` / `null` | `hidden` | **`true`** | **`false`** | `["laboratorio"]` | `Marte` preservado |
| **8** | Calcular misión heliocéntrica (`A1: Tierra → Marte`) | `experimental` / `null` | `hidden` | **`true`** | **`false`** | `["laboratorio"]` | `Marte` preservado |
| **9** | Abrir `3 · Reproducir` (Centro de Misión en escena principal) | `experimental` / **`main`** | **`visible`** | **`false`** | **`true`** | `[]` | Sonda visible en escena principal (`probeVisibleInMainScene: true`) |
| **10** | Regresar al Laboratorio (`1 · Elegir sonda`) | `experimental` / `null` | `hidden` | **`true`** | **`false`** | `["laboratorio"]` | Escena principal pausada inmediatamente |
| **11** | Volver al `Sistema Solar` | `exploracion` / `null` | `visible` | **`false`** | **`true`** | `[]` | Renderizado reactivado sin parpadeo ni salto |
| **12** | Cambiar a `Misiones Históricas` | `historico` / `null` | `visible` | **`false`** | **`true`** | `[]` | Modo histórico operativo |
| **13** | Regresar nuevamente al `Laboratorio` | `experimental` / `null` | `hidden` | **`true`** | **`false`** | `["laboratorio"]` | Escena principal pausada inmediatamente |

---

## 6. FPS anteriores (Línea base de auditoría)

Extraídos de [docs/auditoria-final/evidencias/resumen-gpu.json](evidencias/resumen-gpu.json) y [docs/auditoria-final/evidencias/resumen-software.json](evidencias/resumen-software.json) (`1600×900`, `DPR 1`, build de producción):

| Escenario | FPS Software (Antes) | Frame avg / P95 Software (Antes) | FPS GPU dedicada (Antes) | `rafCPU` GPU (Antes) | Carga GPU oculta `#solar-system` (Antes) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Laboratorio: Catálogo** | `46,01 FPS` | `21,73 ms` / `27,80 ms` | `179,98 FPS` | `0,73 ms` | `4,60 ms/frame` (`39` draws, `76 340` tris) |
| **Laboratorio: Hangar Cassini** | `46,44 FPS` | `21,53 ms` / `27,80 ms` | `179,78 FPS` | `0,69 ms` | `4,88 ms/frame` (`39` draws, `76 340` tris) |
| **Laboratorio: Ingeniería** | `46,26 FPS` | `21,62 ms` / `27,80 ms` | `180,00 FPS` | `0,70 ms` | `4,54 ms/frame` (`39` draws, `76 340` tris) |
| **Laboratorio: Planificación** | `132,56 FPS` | `7,54 ms` / `5,60 ms` (`P99 94,40 ms`) | `179,67 FPS` | `0,50 ms` | `7,90 ms/frame` (`39` draws, `76 340` tris) |

---

## 7. FPS posteriores (Fase 2 verificada)

Extraídos de [docs/auditoria-final/evidencias/resumen-fase2-gpu.json](evidencias/resumen-fase2-gpu.json) y [docs/auditoria-final/evidencias/resumen-fase2-software.json](evidencias/resumen-fase2-software.json) bajo las mismas condiciones (`1600×900`, `DPR 1`, build de producción):

| Escenario | FPS Software (Después) | Variación FPS Software | Frame avg / P95 Software (Después) | FPS GPU dedicada (Después) | `rafCPU` GPU (Después) | Carga GPU oculta `#solar-system` (Después) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Laboratorio: Catálogo** | **`64,53 FPS`** | **+40,3 %** (`+18,52 FPS`) | **`15,50 ms` / `16,80 ms`** | **`179,99 FPS`** | **`0,19 ms` (−74,0 %)** | **`0,00 ms/frame`** (`0` draws, `0` tris) |
| **Laboratorio: Hangar Cassini** | **`64,69 FPS`** | **+39,3 %** (`+18,25 FPS`) | **`15,46 ms` / `16,70 ms`** | **`179,99 FPS`** | **`0,18 ms` (−73,9 %)** | **`0,00 ms/frame`** (`0` draws, `0` tris) |
| **Laboratorio: Ingeniería** | **`64,00 FPS`** | **+38,3 %** (`+17,74 FPS`) | **`15,63 ms` / `16,80 ms`** | **`180,00 FPS`** | **`0,16 ms` (−77,1 %)** | **`0,00 ms/frame`** (`0` draws, `0` tris) |
| **Laboratorio: Planificación** | **`178,83 FPS`** | **+34,9 %** (`+46,27 FPS`) | **`5,59 ms` / `5,60 ms`** (`P99 5,70 ms`) | **`180,00 FPS`** | **`0,01 ms` (−98,0 %)** | **`0,00 ms/frame`** (`0` draws, `0` tris) |
| **Centro en reproducción (`main`)** | `34,62 FPS` | Sin regresión | `28,89 ms` / `33,50 ms` | **`178,57 FPS`** | `0,96 ms` | Escena `#solar-system` visible y activa |
| **Sistema Solar tras regresar del Lab** | **`86,90 FPS`** | Reactivación limpia | `11,51 ms` / `16,70 ms` | **`180,00 FPS`** | `0,59 ms` | Escena `#solar-system` visible y activa |

---

## 8. Draw calls y triángulos anteriores y posteriores

| Vista del Laboratorio | Renderizadores activos (Antes → Después) | Draw calls por fotograma (Antes → Después) | Triángulos por fotograma (Antes → Después) | Reducción geométrica |
| :--- | :---: | :---: | :---: | :---: |
| **Catálogo (`1 · Elegir sonda`)** | `2 → 1` (`#lab-canvas`) | `50 (39 + 11) → 11` | `102 064 (76 340 + 25 724) → 25 724` | **−78,0 % draw calls / −74,8 % triángulos** |
| **Hangar Cassini (`1 · Elegir sonda`)** | `2 → 1` (`#lab-canvas`) | `50 (39 + 11) → 11` | `102 064 (76 340 + 25 724) → 25 724` | **−78,0 % draw calls / −74,8 % triángulos** |
| **Ingeniería (`1 · Elegir sonda`)** | `2 → 1` (`#lab-canvas`) | `50 (39 + 11) → 11` | `102 064 (76 340 + 25 724) → 25 724` | **−78,0 % draw calls / −74,8 % triángulos** |
| **Planificación (`2 · Planificar`)** | `1 → 0` (ningún canvas 3D activo) | `39 → 0` | `76 340 → 0` | **−100,0 % draw calls / −100,0 % triángulos** |

---

## 9. Impacto en CPU y GPU

1. **Reducción de tiempo de CPU por fotograma (`rafCPU`):**
   - **En GPU dedicada (AMD Radeon RX 6650 XT):**
     - `Catálogo`: de `0,73 ms` a **`0,19 ms` (−74,0 %)**.
     - `Hangar Cassini`: de `0,69 ms` a **`0,18 ms` (−73,9 %)**.
     - `Ingeniería`: de `0,70 ms` a **`0,16 ms` (−77,1 %)**.
     - `Planificación`: de `0,50 ms` a **`0,01 ms` (−98,0 %)**.
   - **En renderizado por software (SwiftShader):**
     - `Catálogo`: de `1,88 ms` a **`0,39 ms` (−79,3 %)**.
     - `Hangar Cassini`: de `1,52 ms` a **`0,37 ms` (−75,7 %)**.
     - `Ingeniería`: de `1,44 ms` a **`0,36 ms` (−75,0 %)**.
     - `Planificación`: de `0,65 ms` a **`0,01 ms` (−98,5 %)**.
2. **Eliminación total de la carga GPU en segundo plano:**
   - En GPU dedicada, el trabajo GPU por fotograma mientras se usa el Hangar o Ingeniería cae de **`4,60–4,94 ms/frame` a `0,06 ms/frame` (−98,7 %)**, y en el Planificador cae de **`7,90 ms/frame` a `0,00 ms/frame` (−100 %)**.
   - En SwiftShader, eliminar los `20,86–22,03 ms/frame` de rasterización oculta de `#solar-system` eleva la fluidez del Hangar, Catálogo e Ingeniería de **~46 FPS (por debajo de 60 FPS) a ~64,5 FPS sostenidos**, duplicando el `1% low` en Catálogo (`22,47 → 45,05 FPS`) y multiplicando por `17,7×` el `1% low` en Planificación (`6,21 → 109,89 FPS`).
3. **Menor presión de memoria JS Heap en el Laboratorio:**
   - Al no ejecutarse `actualizarEtiquetas()` ni cálculos matriciales/temporales de `#solar-system` en segundo plano, el heap utilizado durante las vistas del Laboratorio en GPU dedicada disminuye de `49,10–58,18 MiB` a **`29,71–39,19 MiB`**.

---

## 10. Regresiones detectadas y corregidas durante la implementación

1. **Salto temporal (`delta`) en el primer fotograma al regresar al Sistema Solar:**
   - *Riesgo detectado:* si `tiempoAnterior` conservaba el valor de `performance.now()` previo a la entrada al Laboratorio, el primer fotograma tras regresar al Sistema Solar recibía un `delta` de varios segundos o minutos, provocando un salto en `controladorCamara.actualizar(delta)` y enviando un falso fotograma lento a `perfilCalidad.reportFrame(delta, ...)`.
   - *Corrección aplicada:* al pausar `SolarSystem` se asigna `tiempoAnterior = null`. En el primer fotograma tras reanudar (`tiempoAnterior === null`), `delta` se fija en `0` y solo se invoca `perfilCalidad.reportFrame(delta, ...)` cuando `delta > 0`.
2. **Coexistencia de múltiples motivos de pausa (`'laboratorio'` y `'lanzamiento'`):**
   - *Riesgo detectado:* un booleano simple permitiría que un cierre o cambio de vista en un subsistema reactivara `#solar-system` si otro subsistema lo mantenía pausado.
   - *Corrección aplicada:* `motivosPausa = new Set()` administra cada motivo de manera independiente (`establecerRenderPausado(valor, motivo)`).
3. **Limpieza innecesaria del framebuffer WebGL al reanudar (`ajustarTamano`):**
   - *Riesgo detectado:* llamar incondicionalmente a `renderer.setSize(ancho, alto)` al reanudar limpia el buffer de dibujo de WebGL incluso si la ventana no cambió de dimensiones.
   - *Corrección aplicada:* `ajustarTamano()` guarda `ultimoAncho` y `ultimoAlto` y solo invoca `renderer.setSize()` cuando las dimensiones reales de la ventana han cambiado.

---

## 11. Limitaciones y alcance respetado

- En el **Centro de Misión (`3 · Reproducir`)** para misiones heliocéntricas (`data-lab-scene="main"`, como `Tierra → Marte`), el lienzo `#solar-system` **es la vista activa y visible** donde se representa la sonda y su trayectoria interplanetaria; por diseño, en ese estado `isMainSceneOccludedByLab(app)` es `false` y `#solar-system` permanece activo (`177–178 FPS` en GPU dedicada).
- Tal como se solicitó, en esta Fase 2 **no se han tocado** los hallazgos de etapas posteriores (`LAN-01`, `PERF-02`, `PERF-03`, etc.) ni se ha reducido ningún parámetro de calidad visual (texturas, geometrías, atmósfera, iluminación o precisión de `DOPRI54`).

---

## 12. Estado final de `PERF-01`

**`PERF-01`: CORREGIDO, MEDIDO Y VERIFICADO.**
