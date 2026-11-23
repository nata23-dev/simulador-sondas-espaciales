# Plan Priorizado de Correcciones y Optimizaciones (`04_PLAN_CORRECCIONES.md`)

Este documento consolida todos los hallazgos técnicos, científicos, de rendimiento, estabilidad y experiencia de usuario detectados durante la auditoría final integral sobre el commit `b199f076ab773b6d6a7e34bbc2a16dbe4b3073d4` (rama `revision/modo-historico-voyager`).

Ningún archivo de código de producción (`src/`, `public/`, `tests/`, `scripts/`) ha sido modificado durante esta auditoría. El plan está estructurado y especificado a nivel de módulos, funciones y pruebas para que **Codex** (o el equipo de desarrollo) pueda ejecutarlo secuencialmente sin ambigüedades y sin degradar la precisión científica ni la calidad visual.

---

## 1. Catálogo Clasificado de Hallazgos

### `GEN-02` — Condición de carrera asíncrona en el Planificador de Misión Completa

- **ID:** `GEN-02`
- **Módulo:** Laboratorio de Misiones / Planificador Integrado (`src/ui/IntegratedMissionPlanner.js`)
- **Estado de certeza:** **VERIFICADO**
- **Descripción:** La función `compute()` cede el hilo principal en dos puntos asíncronos (`await new Promise((r) => setTimeout(r, 30))` para pintar el estado «Calculando…» y `await helioEphemeris.loadWindow(...)` cuando el destino requiere un tramo SPK adicional), pero al reanudarse vuelve a leer controles del DOM (`#im-soi`, `#im-mode`, `#im-bmode`, `#im-compensate`, `#im-launch`) y escribe el resultado en `mission` y `execution` sin comprobar si `invalidate()` o un cambio de escenario/sonda ocurrió durante la espera.
- **Evidencia:** `docs/auditoria-final/evidencias/ciencia/carrera.json` y script reproducible `docs/auditoria-final/evidencias/ciencia/carrera-planificador.mjs`. En la prueba automatizada, tras pulsar `#im-compute` con el escenario `A1` (Marte) y cambiar inmediatamente `#im-scenario` a `C1` (Júpiter, destino `599`), el estado final deja `#im-scenario = "C1"` y `#im-dest = "599"`, pero `missionDestination = "Marte"`, `#im-execute` habilitado (`executeDisabled: false`), y al pulsar `#im-execute` se carga en el Centro de Misión `"Tierra → Marte (2028-11-29)"`.
- **Pasos para reproducirlo:**
  1. Abrir modo Laboratorio → etapa `2 · Planificar` → pestaña `Misión completa`.
  2. Seleccionar escenario `A1` (Cassini a Marte) y pulsar `#im-compute` («Calcular misión»).
  3. Durante la ventana de cesión (`< 30 ms` o durante la descarga SPK), cambiar `#im-scenario` a `C1` (Júpiter) o modificar `#im-dest`.
  4. Observar que al concluir el cálculo, la ficha de resultados y el botón `#im-execute` corresponden a Marte mientras los selectores del formulario indican Júpiter.
- **Causa raíz:** Ausencia de un contador monótono de generación/época (`computeGeneration`) compartido entre `invalidate()` y `compute()`, junto con la lectura diferida de controles DOM después de `await`.
- **Impacto:** El usuario puede ejecutar en 3D y evaluar en el Centro de Misión una trayectoria calculada para un planeta o configuración distinta a la que muestran los controles activos del formulario, rompiendo la invariante de invalidación de la Etapa 17/21.
- **Severidad:** **ALTO**
- **Prioridad:** **P0** (Corrección inmediata)
- **Archivos relacionados:** `src/ui/IntegratedMissionPlanner.js` (funciones `invalidate`, `compute`, `executeInScene`), `tests/integrated-mission.test.mjs`.
- **Propuesta de solución:**
  1. Añadir un contador entero `let computeEpoch = 0;` en `createIntegratedMissionPlanner`.
  2. Incrementar `computeEpoch += 1;` al inicio de `invalidate()` y al inicio de `compute()`, capturando `const myEpoch = computeEpoch;`.
  3. Capturar una instantánea inmutable de **todas** las entradas del formulario y de la sonda activa (`getProbe()`) **antes** del primer `await`.
  4. Tras cada `await` (`setTimeout` y `helioEphemeris.loadWindow`), verificar `if (myEpoch !== computeEpoch) return;`.
  5. Si el cálculo fue cancelado por una invalidación posterior, no escribir `mission` ni `execution`, no habilitar `#im-execute` y no sobrescribir el mensaje de invalidación.
- **Riesgos:** Ninguno si el botón `#im-compute` se rehabilita en el bloque `finally` únicamente cuando `myEpoch === computeEpoch` (o siempre que no haya otro cálculo en vuelo).
- **Prueba necesaria:** Prueba automatizada de regresión que dispare `compute()`, invoque un cambio de `#im-scenario` / `invalidate()` antes de que resuelva la promesa de `setTimeout(30)` y verifique que `mission === null`, `#im-execute.disabled === true` y `#im-verdict` conserva `"Resultado invalidado: recalcula"`.

---

### `STAB-01` — Fallo crítico no capturado al inicializar sin contexto WebGL2

- **ID:** `STAB-01`
- **Módulo:** Inicialización general y motor gráfico (`src/main.js`, `src/graphics/SolarSystem.js`)
- **Estado de certeza:** **VERIFICADO**
- **Descripción:** Cuando el navegador o el entorno no puede crear un contexto WebGL2 (aceleración deshabilitada sin SwiftShader, bloqueo de driver o límite de contextos excedido), `new THREE.WebGLRenderer(...)` en `createSolarSystem()` lanza una excepción síncrona durante la evaluación superior de `src/main.js` (línea 967), antes de registrar la interfaz y antes de invocar `iniciar()`.
- **Evidencia:** `docs/auditoria-final/evidencias/ciencia/fallos.json` (`sinWebGL2`): `pageErrors: ["THREE.WebGLRenderer: Error creating WebGL context."]`, dejando `#data-status` permanentemente en `"Esperando datos…"` sin mensaje explicativo al usuario.
- **Pasos para reproducirlo:**
  1. Sobrescribir o bloquear `HTMLCanvasElement.prototype.getContext` para `'webgl2'` / `'webgl'`.
  2. Cargar la aplicación.
  3. Observar la excepción no capturada en consola y la interfaz congelada en `"Esperando datos…"`.
- **Causa raíz:** `const sistemaSolar = createSolarSystem(lienzo);` se ejecuta en el ámbito de módulo superior de `src/main.js` fuera de cualquier bloque `try / catch`.
- **Impacto:** En dispositivos o navegadores con WebGL2 bloqueado, el usuario recibe una pantalla negra con el texto `"Esperando datos…"` en lugar de un aviso claro de requisito técnico (WebGL2).
- **Severidad:** **ALTO**
- **Prioridad:** **P0** (Corrección inmediata)
- **Archivos relacionados:** `src/main.js`, `src/graphics/SolarSystem.js`, `src/lab/ProbeAssemblyView.js`, `src/lab/MissionTrajectoryView.js`, `src/lab/MissionExecutionView.js`.
- **Propuesta de solución:**
  1. Envolver la creación de `createSolarSystem(lienzo)` en un bloque `try / catch` o comprobar previamente `Boolean(window.WebGL2RenderingContext && lienzo.getContext('webgl2'))`.
  2. Si falla la creación del contexto principal, actualizar `#data-status` y mostrar un aviso accesible en pantalla indicando que el simulador requiere WebGL 2 activo en el navegador.
  3. En las vistas secundarias del laboratorio (`ProbeAssemblyView`, `MissionTrajectoryView`, `MissionExecutionView`), capturar fallos de `new THREE.WebGLRenderer` para degradar con mensaje en el panel sin romper el resto del laboratorio.
- **Riesgos:** Mínimos; es código defensivo en la ruta de arranque.
- **Prueba necesaria:** Verificar con Playwright (`docs/auditoria-final/evidencias/ciencia/fallos.mjs`) que al anular `getContext('webgl2')` no se produce `pageerror` no capturado y la UI informa explícitamente de la ausencia de WebGL 2.

---

### `SCI-01` — Colapso de precisión IEEE-754 en segundo intercalar (`:60`) y validación permisiva en `HistoricalTime.js`

- **ID:** `SCI-01`
- **Módulo:** Motor científico de escalas temporales (`src/science/HistoricalTime.js`)
- **Estado de certeza:** **VERIFICADO**
- **Descripción:** Se identificaron dos defectos acoplados en el tratamiento de segundos intercalares UTC:
  1. `parseUtcTimestamp()` (línea 101) acepta `second === 60` para **cualquier** fecha, hora y minuto (p. ej. `2020-03-03 12:34:60`), siempre que la fracción sea `0`, sin validar que sea las `23:59:60` de una fecha con segundo intercalar real en la tabla IERS (`LEAP_SECONDS`).
  2. En `utcTimestampToTdb()` (línea 123), para consultar `taiMinusUtcAtPseudoJd` durante `23:59:60` se calcula `parsed.midnightPseudoJd + Math.min(parsed.daySeconds, SECONDS_PER_DAY - 1e-6) / SECONDS_PER_DAY`. Dado que `(86400 - 1e-6) / 86400 = 1 - 1.1574e-11` y `midnightPseudoJd ≈ 2.4577535e6`, la suma en coma flotante IEEE-754 de 64 bits pierde los bits menos significativos (ULP `≈ 4.66e-10` días) y redondea exactamente a `midnightPseudoJd + 1.0` (`2457754.5`, medianoche del día siguiente). Como consecuencia, en `2016-12-31 23:59:60` evalúa `TAI−UTC = 37 s` (el valor del `2017-01-01`) en vez de `36 s`, y además al sumar `daySeconds = 86400` produce `jdTdb = 2457754.50080074`, **idéntico** al de `2017-01-01 00:00:00` (+1 s de error durante el segundo intercalar).
- **Evidencia:** `docs/auditoria-final/evidencias/ciencia/utc.txt`.
  - `utcTimestampToTdb('2016-12-31 23:59:59')` → `jdTdb: 2457754.500777592`, `taiMinusUtcSeconds: 36`.
  - `utcTimestampToTdb('2016-12-31 23:59:60')` → `jdTdb: 2457754.50080074`, `taiMinusUtcSeconds: 37`.
  - `utcTimestampToTdb('2017-01-01 00:00:00')` → `jdTdb: 2457754.50080074`, `taiMinusUtcSeconds: 37`.
  - `utcTimestampToTdb('2020-03-03 12:34:60')` → aceptado y convertido silenciosamente a `"2020-03-03 12:35:00"`.
- **Pasos para reproducirlo:**
  1. Ejecutar `node -e "import('./src/science/HistoricalTime.js').then(m => console.log(m.utcTimestampToTdb('2016-12-31 23:59:60'), m.utcTimestampToTdb('2017-01-01 00:00:00')))"`.
  2. Comprobar que ambos devuelven exactamente `jdTdb: 2457754.50080074` y `taiMinusUtcSeconds: 37`.
- **Causa raíz:**
  1. Pérdida de precisión al sumar `1 - 1.1574e-11` a un Día Juliano de magnitud `2.45e6` en float64.
  2. Falta de validación contra la tabla `LEAP_SECONDS` cuando `second === 60`.
  3. En un segundo intercalar positivo (`23:59:60`), el día UTC tiene `86401` segundos (`TAI−UTC` sigue siendo el del día que termina, y el offset respecto a la medianoche UTC de inicio del día es `86400 s + (TAI−UTC)_prev + 32.184 s`), mientras que a las `00:00:00` del día siguiente `midnightPseudoJd` avanza `+1` día (`86400 s` de pseudo-JD) pero `TAI−UTC` incrementa en `+1 s`, dando `86400 s + ((TAI−UTC)_prev + 1) + 32.184 s` (1 segundo TDB posterior, sin colisión).
- **Impacto:** Desplazamiento de +1 s durante cualquier segundo intercalar real (`:60`) y aceptación silenciosa de estampas UTC inválidas con `:60` fuera de fechas IERS. No afecta a las ventanas históricas nominales de Voyager (que no caen exactamente en `23:59:60`), pero compromete la exactitud formal del motor `HistoricalTime`.
- **Severidad:** **MEDIO**
- **Prioridad:** **P1** (Alta prioridad)
- **Archivos relacionados:** `src/science/HistoricalTime.js`, `tests/historical-time.test.mjs`.
- **Propuesta de solución:**
  1. En `parseUtcTimestamp()`, si `second === 60`, exigir que `hour === 23 && minute === 59` y que `midnightPseudoJd + 1` coincida con el `pseudoJd` de una entrada positiva en `LEAP_SECONDS`; en caso contrario, devolver `null`.
  2. Para buscar `taiMinusUtc` dentro del día UTC en `utcTimestampToTdb()`, dado que los cambios de `LEAP_SECONDS` ocurren siempre en fronteras de medianoche (`pseudoJd` semientero `.5`), si `parsed.second === 60` evaluar `taiMinusUtcAtPseudoJd(parsed.midnightPseudoJd + 0.5)` (mitad del día en curso, lejos del borde de redondeo float64).
  3. Con `taiMinusUtc = 36` en `2016-12-31 23:59:60` y `daySeconds = 86400`, la fórmula `parsed.midnightPseudoJd + (parsed.daySeconds + tdbMinusUtcSeconds) / SECONDS_PER_DAY` producirá `2457753.5 + (86400 + 68.184) / 86400`, que se sitúa exactamente a `+1 s` de `23:59:59` y a `−1 s` de `2017-01-01 00:00:00` (`2457754.5 + 69.184 / 86400`).
  4. En `tdbToUtcTimestamp()`, conservar la monotonicidad y documentar si la conversión inversa representa el instante intercalar o la estampa estándar.
- **Riesgos:** Bajo; circunscrito a estampas con `:60`.
- **Prueba necesaria:** Añadir casos en `tests/historical-time.test.mjs` que verifiquen que `2016-12-31 23:59:59`, `2016-12-31 23:59:60` y `2017-01-01 00:00:00` están separados por `1 / 86400` días TDB (`±1e-4 s`) y que `2020-03-03 12:34:60` lanza error de estampa UTC inválida.

---

### `LAN-01` — Sobrecoste de sombreado por píxel en vistas de plataforma LC-41 (`T−8 s` y `T−2 s`) bajo renderizado por software

- **ID:** `LAN-01`
- **Módulo:** Lanzamiento 3D (`src/launch/LaunchWorld.js`, `src/launch/VoyagerLaunchDirector.js`, `src/graphics/QualityProfile.js`)
- **Estado de certeza:** **VERIFICADO**
- **Descripción:** Mientras que en GPU dedicada (AMD Radeon RX 6650 XT) toda la secuencia de Lanzamiento 3D mantiene **179,8–180,0 FPS** (`5,56 ms/frame`, `1,27–1,43 ms` CPU render, `1,88–2,22 ms` GPU timer en plataforma a `1600×900`, ratio `1,0`), en el fallback de renderizado por software (SwiftShader, cuando el navegador no dispone de aceleración por hardware) el plano general de plataforma a `T−8 s` cae a **22,31 FPS** (`44,82 ms` media, `P95 = 49,90 ms`, `P99 = 79,50 ms`) y el plano de base a `T−2 s` a **27,45 FPS** (`36,43 ms` media, `P95 = 40,60 ms`), aun con ratio adaptativo `0,30` (`480×270` internos), incumpliendo el objetivo mínimo de `30 FPS` (`33,33 ms`).
- **Evidencia:** `docs/auditoria-final/evidencias/lanzamiento-gpu.json`, `docs/auditoria-final/evidencias/lanzamiento-software.json`, `docs/auditoria-final/evidencias/lanzamiento-software-capas.json` y análisis en `docs/auditoria-final/03_AUDITORIA_LANZAMIENTO_3D.md`.
- **Pasos para reproducirlo:**
  1. Compilar y servir producción (`GITHUB_PAGES=true`).
  2. Ejecutar `node docs/auditoria-final/evidencias/medir-lanzamiento.mjs software http://127.0.0.1:4299/simulador-sondas-espaciales/`.
  3. Inspeccionar las ventanas `plataforma` (`T−8 s`) y `base` (`T−2 s`) en `lanzamiento-software.json`.
- **Causa raíz:** Los experimentos A/B demostraron que:
  - Ocultar toda la estructura 3D de la plataforma LC-41 (`sinPlataforma`, reduciendo de `95` a `55` draw calls y de `51.532` a `44.448` triángulos) solo mejora el rendimiento en software de `22,31` a `23,11 FPS` (`44,82 → 43,28 ms`).
  - Ocultar el shader Preetham Sky (`sinCielo`) solo pasa de `22,61` a `23,95 FPS` (`40,17 → 35,69 ms` de backend).
  - En cambio, reducir a la mitad las dimensiones internas (`medioDPR`, ratio `0,15`) eleva los FPS de **22,31 a 54,24 FPS** (`44,82 → 18,44 ms`, backend `41,11 → 13,72 ms`).
  - Por tanto, el cuello de botella en software en los planos cercanos al suelo (`T−8 s` a `T+2 s`) es el **coste de rasterización y sombreado de fragmentos por píxel (overdraw)** sobre las capas superpuestas de terreno (`globo` + `florida` + `cabo` + `lc41` + `explanada`), que emplean `MeshStandardMaterial` con `alphaMap`, `transparent: true` y muestreo de texturas con anisotropía elevada. Una vez el cohete asciende (`T+5 s` en adelante), los FPS en software suben a **51,49–75,06 FPS**.
- **Impacto:** En equipos sin aceleración GPU por hardware (o con iGPU muy limitada que caiga al perfil `low`/software), los primeros segundos en plataforma (`T−12 s` a `T+2 s`) se perciben por debajo de 30 FPS (`22–27 FPS`).
- **Severidad:** **ALTO**
- **Prioridad:** **P1** (Alta prioridad — Prioridad #1 de rendimiento del usuario)
- **Archivos relacionados:** `src/launch/LaunchWorld.js`, `src/launch/VoyagerLaunchDirector.js`, `src/graphics/QualityProfile.js`.
- **Propuesta de solución:**
  1. **Optimización de materiales y overdraw de terreno en perfil `low`/software (`LaunchWorld.js`):**
     - En perfil `low` (o `isSoftwareRenderer === true`), forzar `anisotropy = 1` en todas las texturas de parches (`florida`, `cabo`, `lc41`, `globo`) en lugar de `Math.min(maxAnisotropy, 16)`.
     - Cuando la cámara está en planos de plataforma a baja altitud (`altitud < 0.8 km`), ocultar temporalmente las capas de terreno exteriores redundantes que quedan cubiertas por el parche local `lc41`/`cabo` o reemplazar `MeshStandardMaterial` de los parches de terreno por `MeshLambertMaterial` / `MeshBasicMaterial` preiluminado exclusivamente en el nivel `low`/software (conservando `MeshStandardMaterial` PBR completo en perfiles `high` y `medium`).
  2. **Escala de resolución adaptativa específica de plataforma en software (`QualityProfile.js` / `VoyagerLaunchDirector.js`):**
     - Permitir que en `isSoftwareRenderer === true` y exclusivamente durante las cámaras de plataforma (`altitud < 0.5 km`) si `avgFrameMs > 33.3`, el pixel ratio del canvas de lanzamiento descienda un escalón adicional (`0.25`) y recupere `0.30–0.50` automáticamente en cuanto comienza el seguimiento de ascenso (`T+5 s`, donde ya rinde a `51–75 FPS`).
- **Riesgos:** Bajar de `0.30` globalmente degrada la nitidez; por ello debe priorizarse la reducción de overdraw/anisotropía/complejidad de shader de terreno en `low` y limitar cualquier ajuste de ratio al plano de plataforma en software.
- **Prueba necesaria:** Reejecutar `medir-lanzamiento.mjs software` y `medir-lanzamiento.mjs gpu` verificando que:
  1. En GPU física se mantienen `180 FPS` (`~5,56 ms`) con calidad visual idéntica (`MeshStandardMaterial`, sombras 4096, ratio `1,0`).
  2. En software (`SwiftShader`), la ventana `plataforma` (`T−8 s`) y `base` (`T−2 s`) bajan de `44,82 ms` a `≤ 33,3 ms` (`≥ 30 FPS`).

---

### `PERF-01` — Bucle de renderizado 3D y proyección DOM del Sistema Solar activos mientras el lienzo está oculto tras el Laboratorio

- **ID:** `PERF-01`
- **Módulo:** Arquitectura de renderizado / Laboratorio (`src/main.js`, `src/graphics/SolarSystem.js`, `src/ui/ExperimentalLaboratory.js`, `src/lab/ProbeAssemblyView.js`)
- **Estado de certeza:** **VERIFICADO**
- **Descripción:** Cuando el usuario entra al modo Laboratorio en las etapas `1 · Elegir sonda` (Catálogo, Hangar 3D, Ingeniería) o `2 · Planificar`, el contenedor `#experimental-lab` cubre por completo la pantalla con fondo opaco y `#solar-system` queda oculto tras él (`visibility: "hidden"` en la prueba de oclusión visual). Sin embargo:
  1. `SolarSystem.animar()` continúa ejecutándose en cada `requestAnimationFrame` (`180 Hz` en GPU, `46–132 Hz` en software), actualizando rotaciones planetarias, controlador de cámara, etiquetas DOM (`PlanetLabels.update`) y ejecutando `renderer.render(scene, camera)` (`39 draw calls`, `76.340 triángulos`).
  2. Al mismo tiempo, `ProbeAssemblyView.render()` ejecuta un **segundo** bucle `requestAnimationFrame` sobre `#lab-canvas` (`11 draw calls`, `25.724 triángulos`).
  3. Además, `SolarSystem.animar()` sigue llamando a `reportFrame()`, por lo que `QualityProfile` adapta la calidad global midiendo el coste combinado con una escena oculta.
- **Evidencia:** `docs/auditoria-final/evidencias/resumen-gpu.json` y `docs/auditoria-final/evidencias/resumen-software.json` (escenarios `Catálogo`, `Hangar Cassini`, `Hangar omitir oculto`, `Hangar retorno`, `Ingeniería`, `Planificación`).
  - En software (`SwiftShader`), durante `Hangar Cassini`, se ejecutan **390 renders en 4,18 s** (`195` de `#solar-system` oculto con `20,86 ms` de backend + `195` de `#lab-canvas` visible con `2,81 ms` de backend), resultando en **46,44 FPS** (`21,53 ms/frame`).
  - En el experimento A/B `Hangar omitir oculto` (pausando el render de `#solar-system` cuando está oculto tras el laboratorio), los FPS en software suben inmediatamente de **46,44 a 64,85 FPS** (`+39,6 %`, tiempo de fotograma `21,53 → 15,42 ms`, P95 `27,8 → 16,8 ms`, CPU rAF `1,52 → 0,98 ms`), y en GPU el tiempo de CPU rAF baja de `0,69` a `0,53 ms` eliminando `4,88 ms` de trabajo GPU redundante por fotograma.
- **Pasos para reproducirlo:**
  1. Abrir el simulador y entrar en `Laboratorio` (`1 · Elegir sonda` → `Hangar 3D`).
  2. Observar en `resumen-gpu.json` / `resumen-software.json` que el contexto `id: 0` (`#solar-system`, oculto) y el contexto `id: 1` (`#lab-canvas`, visible) renderizan simultáneamente a la frecuencia del monitor.
- **Causa raíz:** `SolarSystem.setRenderPaused(true)` solo se invoca cuando se abre el director de Lanzamiento 3D (`VoyagerLaunchDirector`), pero **no** cuando `#experimental-lab` está abierto en las etapas `probe` o `plan` (donde la escena principal del Sistema Solar no es visible; solo es visible en la etapa `play` / `3 · Reproducir`).
- **Impacto:** Desperdicio del **88 % del trabajo de backend gráfico** durante el uso del Catálogo, Hangar 3D, Ingeniería y Planificador; pérdida de ~18,4 FPS en renderizado por software/iGPU y consumo innecesario de energía/GPU en equipos portátiles y de escritorio.
- **Severidad:** **ALTO**
- **Prioridad:** **P1** (Alta prioridad)
- **Archivos relacionados:** `src/main.js`, `src/ui/ExperimentalLaboratory.js`, `src/graphics/SolarSystem.js`.
- **Propuesta de solución:**
  1. En `src/main.js` / `ExperimentalLaboratory.js`, sincronizar un estado `isMainSceneOccludedByLab = (modoActual === 'experimental' && labStage !== 'play')`.
  2. Cuando `isMainSceneOccludedByLab` sea `true` (y no haya lanzamiento 3D activo), pausar el renderizado de `SolarSystem` (`sistemaSolar.setRenderPaused(true)` o cancelar el `requestAnimationFrame` mientras esté pausado y reanudarlo en `setRenderPaused(false)`).
  3. Hacer que `ProbeAssemblyView` (y cualquier vista 3D activa del laboratorio) o el bucle visible sea quien alimente `reportFrame()` si se desea adaptación dinámica, o mantener el nivel actual sin contaminar `QualityProfile` con frames vacíos.
- **Riesgos:** Al pasar de `1 · Elegir sonda` o `2 · Planificar` a `3 · Reproducir` (o al volver a `Sistema Solar` / `Misiones Históricas`), debe reactivarse `setRenderPaused(false)` antes del primer fotograma visible y forzarse un `resize` por si la ventana cambió de tamaño mientras estaba oculto (`SolarSystem.setRenderPaused(false)` ya reinicia `ultimoTiempoFotograma = 0`).
- **Prueba necesaria:** Verificar con `medir-global.mjs` que en `Catálogo`, `Hangar Cassini`, `Ingeniería` y `Planificación` el número de llamadas a `renderer.render` sobre `#solar-system` es `0`, y que al pasar a `Centro en reproducción` (`stage === 'play'`) o regresar a `Sistema Solar` el renderizado de `#solar-system` se reanuda inmediatamente sin parpadeos.

---

### `PERF-02` — Coste de reproducción en escena principal con trayectorias y etiquetas bajo software (`Reloj histórico` y `Centro en reproducción`)

- **ID:** `PERF-02`
- **Módulo:** Escena principal 3D (`src/graphics/SolarSystem.js`, `src/graphics/SpaceProbeVisual.js`, `src/ui/PlanetLabels.js`)
- **Estado de certeza:** **VERIFICADO**
- **Descripción:** En hardware GPU (`RX 6650 XT`), la reproducción con trayectorias en `Reloj histórico` y `Centro en reproducción` mantiene **180,0 FPS** y **179,28 FPS** respectivamente (`5,56–5,58 ms`). Sin embargo, en renderizado por software (`SwiftShader` a ratio `0,30`), `Reloj histórico` promedia **29,56 FPS** (`33,83 ms`, `P95 = 39,0 ms`, `36 draw calls`, `66.560 triángulos`, `rafCPU = 1,47 ms`, `gpu/backend = 14,95 ms`) y `Centro en reproducción` promedia **27,65 FPS** (`36,16 ms`, `P95 = 44,4 ms`, `40 draw calls`, `62.978 triángulos`, `rafCPU = 2,79 ms`, `gpu/backend = 28,34 ms`).
- **Evidencia:** `docs/auditoria-final/evidencias/resumen-software.json` (escenarios `Reloj histórico` y `Centro en reproducción`).
- **Pasos para reproducirlo:**
  1. Ejecutar `medir-global.mjs software` y consultar `Reloj histórico` y `Centro en reproducción` en `resumen-software.json`.
- **Causa raíz:**
  1. Durante `Centro en reproducción`, en cada fotograma se actualiza la geometría parcial del tubo/línea de trayectoria recorrida, la pose de la sonda experimental, las lunas locales, la proyección de etiquetas DOM (`PlanetLabels.update`) y la telemetría del Centro de Misión (`rafCPU` sube de `0,70 ms` a `2,79 ms`).
  2. La geometría de esferas planetarias y anillos en la escena principal (`SolarSystem.js`) se crea con subdivisiones fijas (`64×64` en planetas principales) independientemente del perfil `QualityProfile` inicial, sumando `62.978–76.340` triángulos que SwiftShader debe transformar y rasterizar en cada frame.
- **Impacto:** En renderizado por software (sin GPU), la reproducción histórica y de misión experimental roza los `27,6–29,6 FPS` (ligeramente por debajo del umbral de `30 FPS`).
- **Severidad:** **MEDIO**
- **Prioridad:** **P2** (Media prioridad)
- **Archivos relacionados:** `src/graphics/SolarSystem.js`, `src/ui/PlanetLabels.js`, `src/ui/MissionControlCenter.js`, `src/graphics/SpaceProbeVisual.js`.
- **Propuesta de solución:**
  1. En `PlanetLabels.js` y `MissionControlCenter.js`, limitar las actualizaciones de texto DOM y lecturas/escrituras de layout de telemetría a `15–20 Hz` (cada `50–66 ms`) cuando `QualityProfile` está en nivel `low`, manteniendo la interpolación 3D de cámara y sonda en cada frame.
  2. En `SpaceProbeVisual.js`, evitar recalcular o subir buffers completos de trayectoria si el índice del tramo recorrido no ha cambiado o usar `geometry.setDrawRange(0, count)` sobre un `BufferGeometry` prealojado en lugar de reconstruir subarreglos durante el avance temporal.
  3. En `SolarSystem.js`, escalar los segmentos de `SphereGeometry` de planetas secundarios/lunas según el perfil inicial (`64×64` en `high`, `48×48` en `medium`, `32×24` en `low`).
- **Riesgos:** Bajo; usar `setDrawRange` conserva exactamente los mismos vértices calculados por el motor físico sin alterar la trayectoria.
- **Prueba necesaria:** Confirmar que todas las pruebas científicas (`npm test`) siguen pasando y que `Reloj histórico` y `Centro en reproducción` en `medir-global.mjs software` superan los `30 FPS` (`≤ 33,3 ms`) con `rafCPU < 2,0 ms`.

---

### `PERF-03` — Bloqueo síncrono del hilo principal durante cálculos intensivos del Planificador (`earthBeyondSoiCorrection` y `compareMissionCruise`)

- **ID:** `PERF-03`
- **Módulo:** Laboratorio / Motores científicos (`src/ui/IntegratedMissionPlanner.js`, `src/science/IntegratedMission.js`, `src/science/DepartureLeg.js`, `src/science/MultiBodyCruiser.js`)
- **Estado de certeza:** **VERIFICADO**
- **Descripción:** Los cálculos astrodinámicos pesados del Planificador de Misión Completa se ejecutan de manera síncrona en el hilo principal de la UI:
  - `Cassini A1` (`computeIntegratedMission` con corrección `earthBeyondSoiCorrection` de la Etapa 28): **341–362 ms** de bloqueo síncrono continuo (1 Long Task de `344–370 ms`).
  - `Crucero n cuerpos` (`compareMissionCruise` con integración DOPRI54 multicuerpo de la Etapa 22): **305–326 ms** de bloqueo síncrono continuo (1 Long Task de `309–332 ms`).
  - `Ventana porkchop` (`searchLambertWindow` en malla 2D): **21,6–24,1 ms** (sin Long Task).
- **Evidencia:** `docs/auditoria-final/evidencias/global-gpu.json`, `docs/auditoria-final/evidencias/global-software.json` (sección `calculations`) y perfil de CPU V8 `docs/auditoria-final/evidencias/calculo-gpu.cpuprofile`.
  - El perfilador V8 (`profileTop`) identifica dónde se concentra el tiempo de CPU en `computeIntegratedMission`:
    - `sampleEphemerisState` (`HeliocentricEphemeris.js:116`): `84,5 ms` self (`~24,8 %`)
    - `evalChebyshev` (`Chebyshev.js:13`): `83,7 ms` self (`~24,5 %`)
    - `propagate3D` (`CaptureNumerics.js:34`): `48,9 ms` self (`~14,3 %`)
    - `accel` (`DepartureLeg.js:115`): `33,2 ms` self (`~9,7 %`)
    - `stepDopri54` (`Dopri54.js:61`): `21,7 ms` self (`~6,4 %`)
- **Pasos para reproducirlo:**
  1. En `2 · Planificar` → `Misión completa`, activar `#im-soi` («Corregir salida más allá de la esfera terrestre») y pulsar `#im-compute`.
  2. A continuación, pulsar `#im-nbody-run` («Comparar crucero con n cuerpos»).
  3. Observar en PerformanceObserver (`longtask`) las dos tareas de `~310–370 ms` que congelan el hilo principal durante el cálculo.
- **Causa raíz:** Aunque `src/science/` está limpiamente desacoplado del DOM y de Three.js, `IntegratedMissionPlanner.js` invoca `computeIntegratedMission()` y `compareMissionCruise()` directamente en el hilo de eventos de la UI en lugar de delegarlos a un Web Worker (o seccionar las iteraciones de disparo de `earthBeyondSoiCorrection`).
- **Impacto:** Pausa perceptible de `0,3–0,4 s` (hasta `0,8 s` en CPUs móviles más lentas) al pulsar «Calcular misión» o «Comparar crucero con n cuerpos». No afecta a los FPS durante la reproducción porque el cálculo solo ocurre bajo demanda al pulsar el botón.
- **Severidad:** **MEDIO**
- **Prioridad:** **P2** (Media prioridad)
- **Archivos relacionados:** `src/ui/IntegratedMissionPlanner.js`, `src/science/IntegratedMission.js`, `src/science/DepartureLeg.js`, `src/science/MultiBodyCruiser.js`, `src/science/Chebyshev.js`.
- **Propuesta de solución:**
  1. **Opción recomendada (Web Worker científico sin pérdida de precisión):** Dado que `src/science/` es JavaScript puro sin DOM ni Three.js, encapsular `computeIntegratedMission` y `compareMissionCruise` en un Worker (`new Worker(new URL('../science/missionWorker.js', import.meta.url), { type: 'module' })`) con fallback directo al hilo principal en entornos de test Node.js (`typeof Worker === 'undefined'`).
  2. **Micro-optimización matemática sin cambiar resultados (`Chebyshev.js` / `HeliocentricEphemeris.js`):** En `DepartureLeg.js`, durante un mismo paso de `stepDopri54`, las 7 evaluaciones de etapa en sub-instantes muy próximos consultan repetidamente el mismo segmento de Chebyshev de la Tierra y la Luna. Cachear el último índice de segmento por cuerpo en `sampleEphemerisState` (comprobando primero si `jdTdb` sigue dentro de `[t0, t1]` del segmento anterior antes de hacer búsqueda binaria) reduce el coste de `sampleEphemerisState` sin cambiar un solo bit del resultado numérico.
- **Riesgos:** El Worker requiere serializar los tramos de efemérides ya cargados o cargarlos en el Worker; la caché de último segmento en `sampleEphemerisState` tiene riesgo nulo y acelera tanto el hilo principal como los tests.
- **Prueba necesaria:** Verificar que los 420 tests existentes en `npm test` producen resultados numéricos idénticos (diferencia `0` en `jdTdb`, `deltaV`, `periapsis`, `bPlaneErrorKm`) y que al calcular desde la UI no se bloquea el hilo principal por encima de `50 ms`.

---

### `UX-01` — Pérdida de foco (`Tab`) y cierre con `Escape` inoperante tras tabular en la paleta de comandos (`#command-palette`)

- **ID:** `UX-01`
- **Módulo:** Experiencia de Usuario y Accesibilidad (`src/ui/CommandPalette.js`)
- **Estado de certeza:** **VERIFICADO**
- **Descripción:** Al abrir el buscador global (`Ctrl+K` / botón `Buscar`), el diálogo modal `#command-palette` presenta dos problemas de accesibilidad por teclado:
  1. No tiene trampa de foco (*focus trap*): al pulsar `Tab`, el foco abandona `#command-palette` y salta a elementos del fondo (`BODY`, botones de la cabecera).
  2. El manejador de la tecla `Escape` (y de las flechas `ArrowDown`/`ArrowUp`/`Enter`) está registrado únicamente sobre `input` (`input.addEventListener('keydown', ...)` en `CommandPalette.js`, línea 135). En consecuencia, en cuanto el usuario pulsa `Tab` y el foco sale de `#cp-input`, pulsar `Escape` **no cierra** el modal `#command-palette`.
  3. Además, cuando el filtro de búsqueda no tiene coincidencias en el primer grupo, se renderiza la cabecera `<div class="cp-group">Cuerpos y sondas</div>` vacía sin elementos debajo (`emptyGroups: ["Cuerpos y sondas"]`).
- **Evidencia:** `docs/auditoria-final/evidencias/ux/chrome.json` (líneas 515–538: `emptyGroups: ["Cuerpos y sondas"]`, `tab: [{ focus: "BODY", inside: false }, { focus: "BUTTON", inside: false }]`, `escapeAfterTab: true` indicando que el modal permaneció visible tras pulsar `Escape`).
- **Pasos para reproducirlo:**
  1. Pulsar `Ctrl+K` o hacer clic en `#header-search` («Buscar»).
  2. Escribir `"Medir distancias"` (observar el encabezado `"Cuerpos y sondas"` vacío encima de `"Acciones y vistas"`).
  3. Pulsar `Tab` una vez y luego pulsar `Escape`.
  4. Observar que `#command-palette` sigue abierto.
- **Causa raíz:** Listener de teclado atado únicamente a `#cp-input` en vez del contenedor `overlay` (o `window` cuando está abierto), ausencia de gestión de `Tab` dentro del modal y renderizado incondicional de `<div class="cp-group">Cuerpos y sondas</div>` aunque `grouped.bodies` esté vacío.
- **Impacto:** Fricción de teclado y fallo de conformidad WCAG 2.1 AA (criterios 2.1.1 Teclado y 2.4.3 Orden del foco en diálogos modales).
- **Severidad:** **MEDIO**
- **Prioridad:** **P2** (Media prioridad)
- **Archivos relacionados:** `src/ui/CommandPalette.js`.
- **Propuesta de solución:**
  1. En `CommandPalette.js` (`renderList`), renderizar `<div class="cp-group">Cuerpos y sondas</div>` únicamente cuando `grouped.bodies.length > 0` (igual que ya se hace con `if (grouped.actions.length)` en la línea 95).
  2. Mover o delegar el listener `keydown` de `Escape`, `ArrowDown`, `ArrowUp` y `Enter` al `overlay` (y/o interceptar `Tab` dentro de `overlay` para ciclar el foco entre `#cp-input` y los botones `.cp-item`, o mantener el foco en `#cp-input` con navegación por flechas `aria-activedescendant`).
  3. Al cerrar la paleta (`close()`), devolver el foco al elemento que la abrió (`document.activeElement` previo, p. ej. `#header-search`).
- **Riesgos:** Ninguno.
- **Prueba necesaria:** Ejecutar `docs/auditoria-final/evidencias/ux/verificar.mjs` y comprobar que `emptyGroups` es `[]`, `tab[*].inside` es `true` y `escapeAfterTab` es `false` (el modal se cierra con `Escape` tras pulsar `Tab`).

---

### `UX-02` — Intercepción de eventos de puntero por `#historical-welcome-modal` en navegación rápida y botones de seguimiento contextuales

- **ID:** `UX-02`
- **Módulo:** Experiencia de Usuario / Modo Histórico (`src/main.js`, `src/ui/AppMenus.js`)
- **Estado de certeza:** **VERIFICADO**
- **Descripción:**
  1. Al entrar por primera vez a `Misiones Históricas`, se abre `#historical-welcome-modal`. Si el usuario o un flujo automatizado interactúa con la barra superior (`#app-nav-toggle` o selectores de misión) mientras el modal está abierto o si una transición vuelve a invocar `mostrarBienvenidaHistoricaSiCorresponde()`, el overlay `.welcome-modal-overlay` intercepta los clics sobre la cabecera global (`#app-header`), bloqueando el cambio de modo o la apertura del menú `Vistas y ayuda` hasta que se cierra explícitamente el modal.
  2. Cuando se visualizan `Ambas` sondas (`voyager-1` y `voyager-2`), los botones rápidos `#hist-follow-v1-btn` y `#hist-follow-v2-btn` se ocultan/desactivan según la selección actual sin un estado visual/ARIA homogéneo cuando ya se está siguiendo a una de ellas.
- **Evidencia:** `docs/auditoria-final/evidencias/ux/edge.json` (timeout de clic en `#app-nav-toggle` interceptado por `#historical-welcome-modal`) y `docs/auditoria-final/evidencias/global-gpu.json` (`errors: ["Control inactivo hist-follow-v1-btn"]`).
- **Pasos para reproducirlo:**
  1. Entrar en `Misiones Históricas` con almacenamiento limpio (se muestra `#historical-welcome-modal`).
  2. Intentar pulsar `#app-nav-toggle` («Vistas y ayuda») o cambiar de modo en la barra superior sin cerrar antes el modal.
- **Causa raíz:** `#historical-welcome-modal` cubre el viewport completo con un `z-index` superior o igual al de `#app-header` y no se cierra automáticamente si el usuario pulsa un botón de navegación global.
- **Impacto:** En pantallas de portátil (`1366×768`) o flujos rápidos, el modal de bienvenida puede bloquear la navegación global si el usuario intenta usar la cabecera directamente.
- **Severidad:** **BAJO**
- **Prioridad:** **P2** (Media prioridad)
- **Archivos relacionados:** `src/main.js`, `src/style.css`, `index.html`.
- **Propuesta de solución:**
  1. Cerrar automáticamente `#historical-welcome-modal` si el usuario hace clic fuera de `.welcome-modal-card` (en el backdrop `.welcome-modal-overlay`) o si activa cualquier control de `#app-header`.
  2. Añadir cierre con tecla `Escape` para `#historical-welcome-modal` cuando esté visible.
- **Riesgos:** Ninguno.
- **Prueba necesaria:** Verificar en `verificar.mjs` sobre Chrome y Edge que `#historical-welcome-modal` se cierra con clic en backdrop, con `Escape` y con `#welcome-explore-free`, sin interceptar `#app-nav-toggle`.

---

### `LAN-02` — Granularidad de mallas estáticas en LC-41 (`40 draw calls`) y liberación explícita del `WebGLRenderTarget` de PMREM

- **ID:** `LAN-02`
- **Módulo:** Lanzamiento 3D (`src/launch/LC41Pad1977.js`, `src/launch/LaunchWorld.js`)
- **Estado de certeza:** **VERIFICADO**
- **Descripción:**
  1. La plataforma `LC41Pad1977.js` construye los elementos estáticos (báculos de iluminación, lámparas, pedestales, conductos) como `Mesh` individuales, aportando `~40 draw calls` (`~7.084 triángulos`, `~0,62 ms` de CPU en el envío de comandos de render).
  2. En `LaunchWorld.js` (línea 134), `scene.environment = pmrem.fromScene(entorno, 0.04).texture;` guarda únicamente la propiedad `.texture` del `WebGLRenderTarget` devuelto por `pmrem.fromScene(...)`. Al cerrar el lanzamiento, se llama a `texturaEntorno?.dispose()`, pero no a `renderTargetEntorno?.dispose()`.
- **Evidencia:** `docs/auditoria-final/03_AUDITORIA_LANZAMIENTO_3D.md` (experimento A/B `Ocultar LC-41 durante render`: `164 → 95` llamadas en GPU con sombra, `95 → 55` llamadas en software; ahorro de `0,62–0,66 ms` de CPU render) e inspección de `src/launch/LaunchWorld.js` líneas 133–136 y 445.
- **Pasos para reproducirlo:**
  1. Inspeccionar `renderer.info.render.calls` en `T−8 s` con y sin el grupo de plataforma LC-41 visible.
  2. Inspeccionar `LaunchWorld.js` línea 134 (`pmrem.fromScene`).
- **Causa raíz:** Creación de nodos `THREE.Mesh` separados para piezas estáticas que comparten el mismo material y no requieren pivote de animación, y descarte de la referencia al `WebGLRenderTarget` contenedor de PMREM.
- **Impacto:** Coste menor de CPU (`~0,62 ms/frame` en planos de plataforma) y posible retención menor del framebuffer de PMREM hasta que el recolector o la pérdida de contexto destruyen el renderer de lanzamiento.
- **Severidad:** **BAJO**
- **Prioridad:** **P3** (Opcional / Pulido técnico)
- **Archivos relacionados:** `src/launch/LC41Pad1977.js`, `src/launch/LaunchWorld.js`.
- **Propuesta de solución:**
  1. En `LaunchWorld.js`, guardar `renderTargetEntorno = pmrem.fromScene(entorno, 0.04)` y en `dispose()` invocar `renderTargetEntorno?.dispose()`.
  2. En `LC41Pad1977.js`, si se desea reducir draw calls en planos de plataforma, fusionar o instanciar (`InstancedMesh`) únicamente los postes/lámparas estáticos que comparten material, manteniendo separados los brazos umbilicales animados con pivote.
- **Riesgos:** Bajo si no se alteran los pivotes de animación de los brazos de servicio.
- **Prueba necesaria:** Comprobar que los brazos umbilicales se retraen con la misma cinemática en `T+0 s` y que `renderer.info.memory` libera el target de entorno al cerrar el lanzamiento.

---

### `GEN-01` — Desfase puntual en `README.md` y duplicación menor de constantes físicas

- **ID:** `GEN-01`
- **Módulo:** Documentación y constantes (`README.md`, `src/science/`)
- **Estado de certeza:** **VERIFICADO**
- **Descripción:**
  1. `README.md` afirma en su línea 8: *«Hoy solo están implementados los sistemas planetarios locales; las transferencias interplanetarias completas aún no existen»*, contradiciendo las líneas 20–25 del mismo archivo y las Etapas 12G, 13 y 20–28 ya implementadas y verificadas.
  2. Constantes universales como `KM_PER_AU = 149597870.7` y `G0_M_S2 = 9.80665` se declaran localmente en varios módulos de `src/science/` con valores numéricos idénticos.
- **Evidencia:** `README.md` líneas 8 y 20–25; `docs/auditoria-final/01_AUDITORIA_GENERAL.md`.
- **Pasos para reproducirlo:** Leer `README.md` líneas 7–25.
- **Causa raíz:** Actualización parcial del párrafo introductorio de `README.md` tras completar las etapas interplanetarias del laboratorio.
- **Impacto:** Confusión documental para nuevos evaluadores o desarrolladores. Sin impacto funcional en ejecución.
- **Severidad:** **BAJO**
- **Prioridad:** **P3** (Mejora de pulido)
- **Archivos relacionados:** `README.md`, `AGENTS.md`.
- **Propuesta de solución:** Actualizar el párrafo introductorio de `README.md` para reflejar que el Laboratorio incluye transferencias interplanetarias heliocéntricas por cónicas parcheadas (Lambert + plano B + captura de empuje finito + corrección Tierra-Luna más allá de la SOI + comparador multicuerpo DOPRI54), distinguiendo claramente su alcance frente a la integración N-cuerpos continua extremo a extremo con efemérides completas de sistemas joviano/saturniano.
- **Riesgos:** Ninguno.
- **Prueba necesaria:** `git diff --check` y revisión documental.

---

## 2. Plan de Ejecución en 7 Fases (Listo para Codex)

### Fase 1 — Problemas críticos, funcionales y científicos (`P0` y `P1 científico`)
1. **Corregir `GEN-02` en `src/ui/IntegratedMissionPlanner.js`:**
   - Implementar el token monótono `computeEpoch` en `invalidate()` y `compute()`.
   - Capturar entradas antes del primer `await` y abortar la escritura de estado si `myEpoch !== computeEpoch`.
   - Añadir test de regresión asíncrona en `tests/integrated-mission.test.mjs`.
2. **Corregir `STAB-01` en `src/main.js` y vistas 3D del Laboratorio:**
   - Capturar de forma segura cualquier excepción al instanciar `THREE.WebGLRenderer` cuando WebGL 2 no esté disponible.
   - Mostrar estado claro en `#data-status` y aviso en interfaz sin `pageerror` no controlado.
3. **Corregir `SCI-01` en `src/science/HistoricalTime.js`:**
   - Validar que `second === 60` solo se acepte en `23:59:60` de fechas presentes en `LEAP_SECONDS`.
   - Evitar el redondeo IEEE-754 de `midnightPseudoJd + (SECONDS_PER_DAY - 1e-6) / SECONDS_PER_DAY` consultando `taiMinusUtcAtPseudoJd(parsed.midnightPseudoJd + 0.5)` cuando `parsed.second === 60`.
   - Añadir pruebas unitarias de frontera `2016-12-31 23:59:59` → `23:59:60` → `2017-01-01 00:00:00` en `tests/historical-time.test.mjs`.

### Fase 2 — Optimización del Lanzamiento 3D (`LAN-01`, `LAN-02`)
1. **Reducir el coste de fragmentos por píxel en planos de plataforma bajo perfil `low` / software (`src/launch/LaunchWorld.js`):**
   - Limitar `anisotropy = 1` en nivel `low` / software.
   - Reducir overdraw de parches de terreno superpuestos (`globo`, `florida`, `cabo`, `lc41`) cuando la cámara está en `plataforma-general` / `plataforma-base` y usar sombreado ligero para el terreno en perfil `low`/software sin alterar el perfil `high`/`medium` en GPU dedicada.
2. **Liberar `WebGLRenderTarget` de PMREM (`src/launch/LaunchWorld.js`) y agrupar estáticos opcionales (`src/launch/LC41Pad1977.js`).**

### Fase 3 — Optimización global del renderizado (`PERF-01`, `PERF-02`)
1. **Pausar el renderizado del lienzo oculto `#solar-system` cuando el Laboratorio cubre la pantalla (`PERF-01`):**
   - En `src/main.js` / `src/ui/ExperimentalLaboratory.js`, pausar `SolarSystem` durante las etapas `probe` (`1 · Elegir sonda`) y `plan` (`2 · Planificar`), y reanudarlo automáticamente al entrar en `play` (`3 · Reproducir`) o al cambiar a `Sistema Solar` / `Misiones Históricas`.
2. **Optimizar actualización de trayectoria y etiquetas DOM en reproducción (`PERF-02`):**
   - Moderar la frecuencia de actualización de etiquetas DOM y paneles de telemetría en perfil `low` (`15–20 Hz`) y reutilizar `BufferGeometry.setDrawRange` en trazos de trayectoria.

### Fase 4 — Optimización de CPU, memoria y cálculos (`PERF-03`)
1. **Cachear el último segmento de Chebyshev por cuerpo en `src/science/HeliocentricEphemeris.js` (`sampleEphemerisState`):**
   - Evitar búsquedas repetidas en pasos consecutivos de `stepDopri54` sin modificar el resultado numérico.
2. **Desacoplar `computeIntegratedMission` y `compareMissionCruise` mediante Web Worker opcional (`PERF-03`):**
   - Ejecutar los cálculos de `300–400 ms` fuera del hilo principal en navegador para eliminar las Long Tasks (`> 50 ms`) al pulsar «Calcular misión» o «Comparar crucero con n cuerpos».

### Fase 5 — Rendimiento adaptativo y compatibilidad (`QualityProfile.js`)
1. **Evitar contaminación de métricas en `QualityProfile.reportFrame`:**
   - Asegurar que ningún bucle pausado u oculto envíe tiempos a `reportFrame()`.
2. **Ajuste selectivo en software:**
   - Permitir escalado de resolución puntual en planos de plataforma de Lanzamiento 3D bajo software (`0,25`) con recuperación inmediata en ascenso (`0,30–0,50`).

### Fase 6 — Mejoras de UX/UI y accesibilidad (`UX-01`, `UX-02`, `GEN-01`)
1. **Accesibilidad de `#command-palette` (`src/ui/CommandPalette.js`):**
   - Mantener `Escape` operativo desde todo el overlay, gestionar `Tab` dentro del diálogo, devolver el foco al cerrar y ocultar cabeceras `.cp-group` vacías.
2. **Cierre limpio de `#historical-welcome-modal` (`src/main.js`):**
   - Permitir cierre con `Escape`, clic en backdrop o al interactuar con la navegación global.
3. **Actualizar `README.md` (`GEN-01`).**

### Fase 7 — Validación final y pruebas de no regresión
1. Ejecutar la batería obligatoria:
   ```bash
   npm run lint && npm test && npm run build && git diff --check
   ```
2. Reejecutar los scripts de evidencia en `docs/auditoria-final/evidencias/`:
   - `ciencia/carrera-planificador.mjs` (confirmar desaparición de `GEN-02`).
   - `ciencia/fallos.mjs` (confirmar manejo limpio de `STAB-01`).
   - `ux/verificar.mjs` (confirmar resolución de `UX-01` y `UX-02`).
   - `medir-lanzamiento.mjs gpu` y `medir-lanzamiento.mjs software` (confirmar `180 FPS` en GPU y `≥ 30 FPS` en plataforma bajo software).
   - `medir-global.mjs gpu`, `medir-global.mjs software` y `resumir-global.mjs` (confirmar eliminación de renderizado oculto en `Catálogo`/`Hangar`/`Ingeniería`/`Planificación`).

---

## 3. Tabla de Priorización Cuantificable

| Orden | ID | Fase | Hallazgo / Intervención | Ganancia esperada de rendimiento / calidad | Esfuerzo | Riesgo técnico | Riesgo visual | Riesgo científico |
|---:|---|---:|---|---|---|---|---|---|
| **1** | `GEN-02` | 1 | Token de generación asíncrona en `IntegratedMissionPlanner.compute()` | Elimina 100 % de desincronización entre escenario elegido y misión ejecutada | Bajo (`~25` líneas) | Muy bajo | Nulo | **Elimina riesgo de ejecutar misión equivocada** |
| **2** | `STAB-01` | 1 | Captura defensiva de fallo de contexto WebGL 2 en arranque y vistas Lab | Elimina crash síncrono (`pageerror`) en equipos sin WebGL 2 | Bajo (`~30` líneas) | Muy bajo | Nulo | Nulo |
| **3** | `SCI-01` | 1 | Precisión float64 en segundo intercalar (`:60`) y validación IERS en `HistoricalTime.js` | Elimina error de `+1 s` durante `23:59:60` y rechaza `:60` inválidos | Bajo (`~25` líneas) | Bajo | Nulo | **Mejora exactitud formal UTC↔TDB** |
| **4** | `PERF-01` | 3 | Pausar renderizado de `#solar-system` cuando está oculto tras `#experimental-lab` | **+18,4 FPS (+39,6 %)** en Hangar/Catálogo/Ingeniería por software (`46,4 → 64,9 FPS`) y **−4,6 a −7,9 ms/frame** de carga GPU oculta | Bajo (`~20` líneas) | Bajo | Nulo (lienzo cubierto) | Nulo |
| **5** | `LAN-01` | 2 / 5 | Reducción de overdraw/anisotropía de terreno en plataforma LC-41 (`T−8 s`) bajo perfil `low`/software | **+8 a +15 FPS** en plano general LC-41 por software (`22,3 → ≥ 30 FPS`, bajando de `44,8 ms` a `≤ 33,3 ms`), manteniendo `180 FPS` en GPU | Medio (`~60` líneas) | Medio | Bajo (limitado a perfil `low`/software) | Nulo (no toca `VoyagerLaunchProfile.js`) |
| **6** | `PERF-02` | 3 | Throttling de etiquetas DOM/telemetría en `low` y `setDrawRange` en trayectorias | **+3 a +6 FPS** en `Centro en reproducción` (`27,7 → > 31 FPS`) y `Reloj histórico` (`29,6 → > 33 FPS`) por software; menor `rafCPU` | Medio (`~50` líneas) | Bajo | Muy bajo | Nulo (mismos puntos de trayectoria) |
| **7** | `PERF-03` | 4 | Caché de último segmento en `sampleEphemerisState` + Web Worker para `computeIntegratedMission` / `compareMissionCruise` | Reduce CPU de cálculo en **~20–30 %** y reduce bloqueo del hilo principal de **310–370 ms a < 16 ms** | Medio (`~90` líneas) | Medio (mensajería Worker) | Nulo | Nulo (misma aritmética DOPRI54) |
| **8** | `UX-01` | 6 | Foco (`Tab`), cierre con `Escape` y ocultación de grupo vacío en `#command-palette` | Conformidad WCAG 2.1 AA en diálogo modal de búsqueda | Bajo (`~30` líneas) | Muy bajo | Nulo | Nulo |
| **9** | `UX-02` | 6 | Cierre de `#historical-welcome-modal` en backdrop / `Escape` / navegación global | Elimina bloqueo de clics en cabecera al entrar a Modo Histórico | Bajo (`~20` líneas) | Muy bajo | Nulo | Nulo |
| **10** | `LAN-02` | 2 | Liberar `WebGLRenderTarget` de PMREM en `LaunchWorld.dispose()` y agrupar estáticos opcionales en `LC41Pad1977.js` | Ahorra **~0,4–0,6 ms** de envío CPU en plataforma y asegura liberación de framebuffer PMREM | Bajo (`~35` líneas) | Bajo | Nulo | Nulo |
| **11** | `GEN-01` | 6 | Actualizar introducción de `README.md` al estado real de las Etapas 20–29 | Coherencia documental completa | Muy bajo (`~10` líneas) | Nulo | Nulo | Nulo |
