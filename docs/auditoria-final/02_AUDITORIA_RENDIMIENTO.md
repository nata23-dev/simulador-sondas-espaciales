# Auditoría Exhaustiva de Rendimiento (`02_AUDITORIA_RENDIMIENTO.md`)

Este documento presenta la metodología de perfilado, el entorno de prueba reproducible, las tablas comparativas completas de los **19 escenarios globales** y las **8 ventanas del Lanzamiento 3D** bajo **GPU dedicada (AMD Radeon RX 6650 XT)** y **renderizado por software en CPU (SwiftShader Vulkan 1.3.0)**, el diagnóstico de cuellos de botella (CPU, GPU, memoria, DOM, contextos WebGL) y la evaluación de estrategias de optimización.

---

## 1. Metodología de Perfilado y Entorno de Prueba

### 1.1 Entorno de hardware y software (VERIFICADO)
- **Sistema operativo:** Windows 10/11 (`10.0.26200` x64).
- **CPU:** AMD Ryzen 5 5600 6-Core Processor (`12` hilos lógicos).
- **Memoria RAM:** `15,92 GiB`.
- **Navegador de medición:** Google Chrome Headless `157.0.8103.79` (automatizado mediante Playwright).
- **Perfil gráfico A — GPU por hardware (`gpu`):**
  - Adaptador WebGL2: `ANGLE (AMD, AMD Radeon RX 6650 XT (0x000073EF) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
  - Perfil de calidad automático (`QualityProfile`): `high` (`pixelRatio = 1,00` con DPR de dispositivo `1`).
- **Perfil gráfico B — Fallback por software (`software`):**
  - Flags de Chromium: `--disable-gpu`, `--use-gl=angle`, `--use-angle=swiftshader`, `--enable-unsafe-swiftshader`.
  - Adaptador WebGL2: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
  - Perfil de calidad automático (`QualityProfile`): `low` (`isSoftwareRenderer = true`, escala adaptativa `0,30 – 1,00`).
- **Compilación:** Producción (`GITHUB_PAGES=true`, `vite build` + `vite preview --host 127.0.0.1 --port 4299 --strictPort`).
- **Resoluciones de viewport evaluadas:**
  - Base comparativa: `1600 × 900` (`DPR = 1`).
  - Resoluciones adicionales en Sistema Solar: `1280 × 720` (HD) y `2560 × 1440` (QHD).
  - Resoluciones adicionales en UX/Responsividad (`docs/auditoria-final/evidencias/ux/chrome.json`): `320 × 568`, `375 × 812`, `768 × 1024`, `1024 × 768`, `1280 × 720`, `1366 × 768`, `1920 × 1080`, `2560 × 1440`.

### 1.2 Instrumentación y métricas capturadas
Los scripts reproducibles `docs/auditoria-final/evidencias/medir-global.mjs`, `resumir-global.mjs` y `medir-lanzamiento.mjs` instrumentan la compilación de producción antes de la carga del módulo principal mediante `page.addInitScript`:
1. **Interceptación de `HTMLCanvasElement.prototype.getContext`:**
   - Registra cada contexto `webgl2` creado por la aplicación (`#solar-system`, `#lab-canvas`, `#mission-canvas`, `#mc-canvas` y el canvas de `VoyagerLaunchDirector`).
   - Envuelve `gl.drawArrays`, `gl.drawElements`, `gl.drawArraysInstanced` y `gl.drawElementsInstanced` para contar exactamente las **draw calls** y **triángulos** emitidos por cada fotograma en cada contexto.
   - Instrumenta la extensión `EXT_disjoint_timer_query_webgl2` (`TIME_ELAPSED_EXT`) cada `8–12` renders para medir el **tiempo de backend/GPU** en milisegundos sin bloquear el pipeline, descartando muestras con `GPU_DISJOINT_EXT`.
2. **Interceptación de `requestAnimationFrame`:**
   - Mide el intervalo real entre fotogramas (`dt`), a partir del cual se calculan **FPS promedio** (`1000 / avgMs`), **FPS mínimo** (`1000 / maxMs`), **FPS 1 % bajo** (inverso de la media del 1 % de fotogramas más lentos cuando `n ≥ 100`), **tiempo medio por fotograma**, **P95** y **P99**, así como el **tiempo de CPU dentro del callback de `requestAnimationFrame`** (`rafCPU`) y el **tiempo de CPU exclusivo dentro de `renderer.render`** (`renderCPU`).
3. **Inspección de recursos de Three.js y WebGL:**
   - Captura el número de **geometrías**, **texturas**, **programas/shaders**, **materiales** y **objetos renderizados**, junto con la visibilidad efectiva del `<canvas>` (comprobando con `document.elementFromPoint` si está visible o cubierto por otra capa opaca).
4. **Memoria y bloqueos del hilo principal:**
   - Registra `performance.memory.usedJSHeapSize` (`heapMiB`) y `PerformanceObserver` para entradas `longtask` (`≥ 50 ms`, reportadas como `blocks`).

---

## 2. Resultados Medidos por Módulo (GPU vs Software)

### 2.1 Módulo A — Sistema Solar (Exploración)

Datos extraídos de `docs/auditoria-final/evidencias/resumen-gpu.json` y `docs/auditoria-final/evidencias/resumen-software.json` (duración de muestra: `4,2 s` por escenario tras `900 ms` de estabilización):

| Escenario | Backend | Ratio | n | FPS med | FPS mín | 1 % bajo | Frame med / P95 / P99 (ms) | rAF CPU / Render CPU (ms) | GPU / Backend (ms) | Heap (MiB) | Draw calls | Triángulos | Geom / Tex / Prog / Mat / Obj | Long tasks |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| Solar general (1600×900) | RX 6650 XT | 1,00 | 715 | **170,26** | 6,41* | 31,14* | 5,87 / 5,70 / 6,60 | 0,85 / 0,67 | 0,53 | 13,12 | 37,87 | 72.986 | 19 / 8 / 31 / 37 / 37 | 2* |
| Solar 1280×720 | RX 6650 XT | 1,00 | 756 | **180,00** | 175,44 | 175,44 | 5,56 / 5,60 / 5,70 | 0,42 / 0,29 | 0,18 | 14,93 | 38,00 | 73.364 | 19 / 8 / 31 / 37 / 37 | 0 |
| Solar 2560×1440 | RX 6650 XT | 1,00 | 750 | **178,61** | 53,48 | 105,54 | 5,60 / 5,70 / 6,50 | 0,53 / 0,36 | 0,79 | 13,03 | 38,00 | 73.364 | 19 / 8 / 31 / 37 / 37 | 0 |
| Sistema interior | RX 6650 XT | 1,00 | 754 | **179,60** | 151,52 | 152,38 | 5,57 / 5,70 / 6,50 | 0,34 / 0,19 | 0,58 | 17,15 | 21,06 | 28.401 | 19 / 8 / 31 / 21 / 21 | 0 |
| Tierra (acercamiento + seguimiento) | RX 6650 XT | 1,00 | 751 | **178,87** | 41,49 | 112,20 | 5,59 / 5,60 / 5,70 | 0,31 / 0,19 | 0,26 | 12,39 | 10,67 | 20.866 | 19 / 9 / 32 / 10 / 10 | 0 |
| Tierra escala alternada (exploratoria) | RX 6650 XT | 1,00 | 755 | **180,00** | 175,44 | 175,44 | 5,56 / 5,60 / 5,70 | 0,31 / 0,19 | 0,28 | 12,27 | 11,00 | 25.168 | 19 / 10 / 33 / 11 / 11 | 0 |
| Solar tiempo ×4 | RX 6650 XT | 1,00 | 753 | **179,39** | 151,52 | 151,52 | 5,57 / 5,60 / 6,60 | 0,40 / 0,20 | 0,28 | 15,51 | 11,00 | 25.168 | 19 / 10 / 33 / 11 / 11 | 0 |
| Solar general (1600×900) | SwiftShader | 0,70 | 302 | **75,18** | 25,77 | 36,04 | 13,30 / 16,70 / 22,10 | 1,13 / 0,69 | 11,38 | 15,57 | 38,00 | 73.364 | 19 / 8 / 30 / 37 / 37 | 0 |
| Solar 1280×720 | SwiftShader | 1,00 | 297 | **71,09** | 36,10 | 38,61 | 14,07 / 16,80 / 22,30 | 1,16 / 0,63 | 11,70 | 20,83 | 38,00 | 73.364 | 19 / 8 / 30 / 37 / 37 | 0 |
| Solar 2560×1440 | SwiftShader | 0,70 | 167 | **39,92** | 13,85 | 17,15 | 25,05 / 38,90 / 44,40 | 1,82 / 0,73 | 21,63 | 16,63 | 38,00 | 73.364 | 19 / 8 / 30 / 37 / 37 | 1 |
| Sistema interior | SwiftShader | 0,65 | 348 | **83,30** | 44,84 | 44,84 | 12,01 / 22,20 / 22,30 | 0,72 / 0,41 | 9,70 | 11,95 | 21,05 | 28.348 | 19 / 8 / 30 / 21 / 21 | 0 |
| Tierra (acercamiento + seguimiento) | SwiftShader | 0,40 | 133 | **31,84** | 16,34 | 18,92 | 31,41 / 39,00 / 44,50 | 1,29 / 0,35 | 23,30 | 13,44 | 10,68 | 20.726 | 19 / 8 / 30 / 10 / 10 | 0 |
| Tierra escala alternada (exploratoria) | SwiftShader | 0,30 | 158 | **37,72** | 29,94 | 29,94 | 26,51 / 33,30 / 33,40 | 0,66 / 0,35 | 12,22 | 14,40 | 11,00 | 25.168 | 19 / 10 / 32 / 11 / 11 | 0 |
| Solar tiempo ×4 | SwiftShader | 0,30 | 151 | **36,29** | 25,64 | 25,67 | 27,56 / 33,40 / 38,90 | 0,95 / 0,35 | 12,77 | 13,96 | 11,00 | 25.168 | 19 / 10 / 32 / 11 / 11 | 0 |

*\*Nota:* En la primera muestra `Solar general` en GPU se registraron 2 tareas puntuales de subida diferida de texturas iniciales (`DeferredTextures.js`, cuando pasa de `37` a `38` draw calls al activar la corona/halo diferido), tras lo cual todos los escenarios siguientes operan con `0` Long Tasks y `178–180 FPS`.

---

### 2.2 Módulo B — Misiones Históricas (Voyager 1 y Voyager 2)

| Escenario | Backend | Ratio | n | FPS med | FPS mín | 1 % bajo | Frame med / P95 / P99 (ms) | rAF CPU / Render CPU (ms) | GPU / Backend (ms) | Heap (MiB) | Draw calls | Triángulos | Geom / Tex / Prog / Mat / Obj | Long tasks |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| Voyager ambas (trayectorias visibles) | RX 6650 XT | 1,00 | 754 | **179,65** | 149,25 | 152,38 | 5,57 / 5,60 / 6,40 | 0,50 / 0,34 | 0,14 | 35,03 | 27,00 | 43.204 | 19 / 17 / 36 / 26 / 26 | 0 |
| Reloj histórico (reproducción activa) | RX 6650 XT | 1,00 | 756 | **180,00** | 175,44 | 175,44 | 5,56 / 5,60 / 5,70 | 0,70 / 0,48 | 0,17 | 32,67 | 36,00 | 66.560 | 29 / 21 / 48 / 35 / 35 | 0 |
| Encuentro Europa (sobrevuelo cercano) | RX 6650 XT | 1,00 | 742 | **176,75** | 50,76 | 74,07 | 5,66 / 5,70 / 6,60 | 0,41 / 0,11 | 0,15 | 42,48 | 4,00 | 4.336 | 30 / 24 / 50 / 4 / 4 | 0 |
| Comparador NASA / 3D (`PIA00143`) | RX 6650 XT | 1,00 | 754 | **179,52** | 149,25 | 152,09 | 5,57 / 5,70 / 6,50 | 0,32 / 0,09 | 0,14 | 36,88 | 4,00 | 4.336 | 30 / 24 / 50 / 4 / 4 | 0 |
| Voyager ambas (trayectorias visibles) | SwiftShader | 0,30 | 155 | **37,15** | 12,85 | 14,40 | 26,92 / 27,90 / 61,10 | 0,97 / 0,64 | 15,80 | 31,31 | 27,00 | 43.204 | 19 / 17 / 35 / 26 / 26 | 0 |
| Reloj histórico (reproducción activa) | SwiftShader | 0,30 | 123 | **29,56** | 20,00 | 20,00 | 33,83 / 39,00 / 50,00 | 1,47 / 0,97 | 14,95 | 33,48 | 36,00 | 66.560 | 29 / 21 / 47 / 35 / 35 | 0 |
| Encuentro Europa (sobrevuelo cercano) | SwiftShader | 0,30 | 165 | **39,49** | 30,03 | 32,68 | 25,32 / 27,90 / 27,90 | 0,70 / 0,23 | 7,86 | 34,92 | 4,00 | 4.336 | 30 / 24 / 49 / 4 / 4 | 0 |
| Comparador NASA / 3D (`PIA00143`) | SwiftShader | 0,35 | 691 | **164,52** | 59,52 | 83,33 | 6,08 / 11,10 / 11,20 | 0,44 / 0,13 | 2,33 | 39,66 | 4,00 | 4.336 | 30 / 24 / 49 / 4 / 4 | 0 |

---

### 2.3 Módulo C — Laboratorio de Misiones (y Experimento A/B de Lienzo Oculto `PERF-01`)

En las etapas `Catálogo`, `Hangar Cassini` e `Ingeniería`, coexisten dos contextos WebGL renderizando en bucle:
- Contexto `#0` (`#solar-system`, **oculto** detrás del overlay opaco `#experimental-lab`): `39 draw calls`, `76.340 triángulos`, `30` geometrías, `33` texturas, `53` programas.
- Contexto `#1` (`#lab-canvas` de `ProbeAssemblyView`, **visible**): `11 draw calls`, `25.724 triángulos`, `12` geometrías, `4` texturas, `5` programas.

| Escenario | Backend | Ratio | n | FPS med | FPS mín | 1 % bajo | Frame med / P95 / P99 (ms) | rAF CPU (ms) | Render CPU `#0` oculto / `#1` vis (ms) | GPU `#0` oculto / `#1` vis (ms) | Heap (MiB) | Calls `#0` + `#1` | Triángulos `#0` + `#1` | Long tasks |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Catálogo (`1 · Elegir sonda`) | RX 6650 XT | 1,00 | 756 | **180,00** | 172,41 | 173,54 | 5,56 / 5,60 / 5,70 | 0,73 | 0,39 / 0,12 | 4,60 / 0,06 | 58,18 | 39 + 11 | 76.340 + 25.724 | 0 |
| Hangar Cassini (control doble render) | RX 6650 XT | 1,00 | 755 | **179,99** | 169,49 | 172,04 | 5,56 / 5,60 / 5,80 | 0,69 | 0,37 / 0,12 | 4,88 / 0,06 | 49,10 | 39 + 11 | 76.340 + 25.724 | 0 |
| **Hangar omitir oculto (A/B `PERF-01`)** | RX 6650 XT | 1,00 | 756 | **180,00** | 172,41 | 174,67 | 5,56 / 5,60 / 5,70 | **0,53** | 0,00 / 0,14 | **0,00 / 0,06** | 45,54 | 0 + 11 | 0 + 25.724 | 0 |
| Hangar retorno (control) | RX 6650 XT | 1,00 | 756 | **180,00** | 169,49 | 170,94 | 5,56 / 5,70 / 5,80 | 0,70 | 0,41 / 0,10 | 4,57 / 0,06 | 38,12 | 39 + 11 | 76.340 + 25.724 | 0 |
| Ingeniería (`1 · Elegir sonda`) | RX 6650 XT | 1,00 | 756 | **180,00** | 172,41 | 175,05 | 5,56 / 5,60 / 5,70 | 0,70 | 0,40 / 0,11 | 4,54 / 0,06 | 54,22 | 39 + 11 | 76.340 + 25.724 | 0 |
| Planificación (`2 · Planificar`) | RX 6650 XT | 1,00 | 755 | **179,99** | 169,49 | 171,67 | 5,56 / 5,60 / 5,80 | 0,50 | 0,35 / — | 7,90 / — | 35,87 | 39 + 0 | 76.340 + 0 | 0 |
| Centro en reproducción (`3 · Reproducir`) | RX 6650 XT | 1,00 | 753 | **179,28** | 87,72 | 129,24 | 5,58 / 5,60 / 5,70 | 1,45 | 0,56 (visible) | 0,17 (visible) | 52,07 | 40 | 62.978 | 0 |
| Centro seguimiento y telemetría | RX 6650 XT | 1,00 | 753 | **179,33** | 89,29 | 139,62 | 5,58 / 5,70 / 6,50 | 1,15 | 0,36 (visible) | 0,17 (visible) | 59,38 | 23,02 | 34.307 | 0 |
| Catálogo (`1 · Elegir sonda`) | SwiftShader | 0,30 | 193 | **46,01** | 17,95 | 22,47 | 21,73 / 27,80 / 33,30 | 1,88 | 0,80 / 0,22 | 21,53 / 2,89 | 49,98 | 39 + 11 | 76.340 + 25.724 | 1 |
| Hangar Cassini (control doble render) | SwiftShader | 0,30 | 194 | **46,44** | 35,84 | 35,84 | 21,53 / 27,80 / 27,90 | 1,52 | 0,81 / 0,21 | 20,86 / 2,81 | 33,33 | 39 + 11 | 76.340 + 25.724 | 0 |
| **Hangar omitir oculto (A/B `PERF-01`)** | SwiftShader | 0,30 | 272 | **64,85** | **44,84** | **44,91** | **15,42 / 16,80 / 22,20** | **0,98** | **0,00 / 0,24** | **0,00 / 6,67** | 33,66 | **0 + 11** | **0 + 25.724** | 0 |
| Hangar retorno (control) | SwiftShader | 0,30 | 195 | **46,31** | 35,84 | 35,84 | 21,60 / 27,80 / 27,90 | 1,42 | 0,75 / 0,20 | 20,34 / 2,85 | 33,40 | 39 + 11 | 76.340 + 25.724 | 0 |
| Ingeniería (`1 · Elegir sonda`) | SwiftShader | 0,30 | 193 | **46,26** | 30,03 | 30,03 | 21,62 / 27,80 / 33,30 | 1,44 | 0,76 / 0,21 | 22,03 / 2,85 | 33,55 | 39 + 11 | 76.340 + 25.724 | 0 |
| Planificación (`2 · Planificar`) | SwiftShader | 0,30 | 545 | **132,56** | 4,86* | 6,21* | 7,54 / 5,60 / 94,40 | 0,65 | 0,43 / — | 6,05 / — | 33,56 | 39 + 0 | 76.340 + 0 | 0 |
| Centro en reproducción (`3 · Reproducir`) | SwiftShader | 0,30 | 114 | **27,65** | 12,87 | 13,85 | 36,16 / 44,40 / 66,70 | 2,79 | 0,97 (visible) | 28,34 (visible) | 61,52 | 40 | 62.978 | 0 |
| Centro seguimiento y telemetría | SwiftShader | 0,30 | 134 | **32,07** | 18,02 | 18,96 | 31,18 / 38,80 / 50,00 | 2,30 | 0,65 (visible) | 6,62 (visible) | 46,37 | 22,72 | 33.846 | 0 |

---

### 2.4 Escena de Lanzamiento 3D (Resumen Comparativo)

El análisis exhaustivo y los experimentos A/B por capas se encuentran en [03_AUDITORIA_LANZAMIENTO_3D.md](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/docs/auditoria-final/03_AUDITORIA_LANZAMIENTO_3D.md). A continuación se resumen las métricas principales de `docs/auditoria-final/evidencias/lanzamiento-gpu.json` y `lanzamiento-software.json`:

| Ventana de Lanzamiento 3D | Backend | Ratio | FPS med | FPS mín | 1 % bajo | Frame med / P95 / P99 (ms) | JS render (ms) | GPU / Backend (ms) | Draw calls | Triángulos | Geom / Tex / Prog / Mat / Obj | Long tasks |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| Reproducción desde entrada | RX 6650 XT | 1,00 | **179,98** | 149,25 | 164,83 | 5,56 / 5,60 / 5,70 | 1,28 | 1,97 | 163 | 152.196 | 110 / 24 / 27 / 39 / 96 | 0 |
| Plataforma general (T−8 s) | RX 6650 XT | 1,00 | **180,00** | 163,93 | 168,07 | 5,56 / 5,60 / 5,70 | 1,27 | 1,88 | 164 | 152.196 | 110 / 24 / 27 / 39 / 96 | 0 |
| Plataforma base (T−2 s) | RX 6650 XT | 1,00 | **180,00** | 166,67 | 170,94 | 5,56 / 5,60 / 5,70 | 1,43 | 2,22 | 156 | 148.956 | 110 / 24 / 27 / 39 / 96 | 0 |
| Despegue suelo (T+5 s) | RX 6650 XT | 1,00 | **179,97** | 161,29 | 166,67 | 5,56 / 5,60 / 5,70 | 1,19 | 1,39 | 168 | 131.916 | 110 / 24 / 27 / 39 / 99 | 0 |
| Seguimiento ascenso (T+30 s) | RX 6650 XT | 1,00 | **180,00** | 169,49 | 170,94 | 5,56 / 5,60 / 5,70 | 0,79 | 0,85 | 63 | 123.772 | 110 / 24 / 27 / 38 / 63 | 0 |
| Separación SRB/etapa (T+130 s) | RX 6650 XT | 1,00 | **179,98** | 161,29 | 165,29 | 5,56 / 5,60 / 5,70 | 0,88 | 0,81 | 61 | 121.648 | 110 / 24 / 27 / 38 / 61 | 0 |
| Órbita aparcamiento (T+1500 s) | RX 6650 XT | 1,00 | **179,80** | 149,25 | 153,85 | 5,56 / 5,60 / 5,70 | 0,44 | 0,29 | 24 | 125.824 | 110 / 24 / 28 / 23 / 24 | 0 |
| Reproducción desde entrada | SwiftShader | 0,50→0,35 | **43,13** | 9,29 | n<100 | 23,19 / 33,40 / 60,00 | 2,16 | 20,43 | 91 | 50.919 | 97 / 19 / 20 / 39 / 91 | 0 |
| Plataforma general (T−8 s) | SwiftShader | 0,30 | **22,31** | 12,58 | n<100 | 44,82 / 49,90 / 79,50 | 1,80 | 41,11 | 95 | 51.532 | 97 / 19 / 20 / 39 / 96 | 0 |
| Plataforma base (T−2 s) | SwiftShader | 0,30 | **27,45** | 23,20 | n<100 | 36,43 / 40,60 / 43,10 | 1,77 | 34,04 | 91 | 49.912 | 97 / 19 / 20 / 39 / 92 | 0 |
| Despegue suelo (T+5 s) | SwiftShader | 0,30 | **51,49** | 41,32 | n<100 | 19,42 / 22,80 / 24,20 | 2,23 | 14,76 | 97 | 41.392 | 97 / 19 / 20 / 39 / 98 | 0 |
| Ascenso en movimiento (T+0→5,5 s) | SwiftShader | 0,30 | **33,17** | 14,47 | 14,47 | 30,15 / 39,80 / 44,80 | 1,70 | 27,13 | 98,65 | 56.797 | 97 / 19 / 20 / 39 / 99 | 1 (55 ms) |
| Seguimiento ascenso (T+30 s) | SwiftShader | 0,30 | **71,60** | 52,91 | n<100 | 13,97 / 17,70 / 18,90 | 1,85 | 10,15 | 61 | 50.476 | 97 / 19 / 20 / 38 / 62 | 0 |
| Separación SRB/etapa (T+130 s) | SwiftShader | 0,30 | **75,06** | 55,56 | n<100 | 13,32 / 16,00 / 18,00 | 1,62 | 10,35 | 61 | 53.402 | 97 / 19 / 20 / 38 / 62 | 0 |
| Órbita aparcamiento (T+1500 s) | SwiftShader | 0,30 | **67,32** | 31,95 | n<100 | 14,85 / 18,70 / 31,30 | 0,85 | 13,45 | 23 | 28.244 | 97 / 19 / 21 / 23 / 24 | 0 |

---

## 3. Análisis de CPU, GPU, Memoria, Contextos WebGL y DOM

### 3.1 Perfilado de CPU durante cálculos astrodinámicos (`PERF-03`)
- Cuando el cálculo de misión completa (`computeIntegratedMission`) se ejecuta en modo estándar de cónicas parcheadas (`#im-soi` desactivado, escenario `A1` Cassini a Marte), el tiempo total de ventana es de **161 ms** en GPU y **220 ms** en software (incluyendo los `30 ms` de cesión inicial de `setTimeout` para pintar el estado de carga), con cálculo matemático puro inferior a `130–190 ms`.
- Cuando se activan los cálculos numéricos DOPRI54 de alta fidelidad:
  1. **Corrección Tierra-Luna más allá de la SOI (`earthBeyondSoiCorrection`, Etapa 28):** integra múltiples disparos de prueba en el sistema Tierra-Luna-Sol durante 6 días con DOPRI54, bloqueando el hilo principal durante **341–362 ms**.
  2. **Comparación de crucero multicuerpo (`compareMissionCruise`, Etapa 22):** propaga la trayectoria interplanetaria completa con perturbaciones planetarias N-cuerpos durante 317 días, bloqueando el hilo principal durante **305–326 ms**.
- **Desglose del perfilador de CPU V8 (`docs/auditoria-final/evidencias/calculo-gpu.cpuprofile`):**
  - `sampleEphemerisState` (`src/science/HeliocentricEphemeris.js:116`): **24,8 %** del tiempo propio (`self time`).
  - `evalChebyshev` (`src/science/Chebyshev.js:13`): **24,5 %** del tiempo propio.
  - `propagate3D` (`src/science/CaptureNumerics.js:34`): **14,3 %** del tiempo propio.
  - `accel` (`src/science/DepartureLeg.js:115`): **9,7 %** del tiempo propio.
  - `stepDopri54` (`src/science/Dopri54.js:61`): **6,4 %** del tiempo propio.
- **Diagnóstico:** No existe sobrecoste por cálculos científicos durante los fotogramas normales de animación (`rafCPU` es de solo `0,31–1,45 ms` en GPU y `0,65–2,79 ms` en software). Los bloqueos de CPU ocurren **únicamente al pulsar los botones de cálculo** en el Planificador (`PERF-03`).

### 3.2 Coexistencia de múltiples contextos WebGL y bucles de animación (`PERF-01`)
La prueba de estrés y recursos (`docs/auditoria-final/evidencias/ciencia/fallos.json`) verificó que:
- En `Sistema Solar` y `Misiones Históricas` existe **1 único `<canvas>`** (`#solar-system`, `WebGLRenderer #0`).
- Al abrir el `Laboratorio`, se instancian **6 lienzos adicionales** (total `7` `<canvas>` en el DOM):
  - **3 contextos `WebGLRenderer` adicionales:**
    - `#lab-canvas` (`ProbeAssemblyView.js`, Hangar 3D)
    - `#mission-canvas` (`MissionTrajectoryView.js`, vista orbital local)
    - `#mc-canvas` (`MissionExecutionView.js`, vista de ejecución local)
  - **3 lienzos 2D:** `#im-plot` (esquema de órbita capturada), `#ip-porkchop` (mapa porkchop) y `#ip-orbit` (diagrama de transferencia).
- **Problema principal verificado (`PERF-01`):** Mientras el usuario está en las etapas `1 · Elegir sonda` o `2 · Planificar` del Laboratorio, `#solar-system` queda completamente tapado por `#experimental-lab`, pero su bucle `SolarSystem.animar` sigue renderizando `39 draw calls` y `76.340 triángulos` en cada frame junto con `#lab-canvas`. Pausar `#solar-system` mientras está cubierto por el Laboratorio mejora el rendimiento del Hangar en software de **46,44 a 64,85 FPS (+39,6 %)**.

### 3.3 Estabilidad de memoria, listeners y reciclaje de recursos
En `docs/auditoria-final/evidencias/ciencia/fallos.json` se ejecutó un ciclo repetido de navegación por todos los modos, apertura y cierre de paneles, selección de las 5 sondas y cálculo/ejecución de misión:
- **Antes del ciclo:** `nodes = 835`, `canvases = 7`, `heap = 39.218.235 bytes` (`37,40 MiB`).
- **Después del ciclo completo:** `nodes = 921` (crecimiento acotado de +86 nodos por las filas de telemetría/eventos recién renderizadas del Centro de Misión), `canvases = 7` (sin duplicación de lienzos), `heap = 46.503.903 bytes` (`44,35 MiB`), `windowListenersAdded = 0` (ninguna fuga de listeners globales en `window` ni `document`).
- **Pérdida y restauración de contexto WebGL (`WEBGL_lose_context`):** Verificada en `docs/auditoria-final/evidencias/ux/chrome.json` (`restore: { supported: true, events: ["lost", "restored"], lost: false }`).

---

## 4. Evaluación de Estrategias de Optimización (Sección 12)

Se evalúa la aplicabilidad técnica real de cada estrategia sobre el código actual del repositorio:

| Estrategia | Estado actual en el código | Aplicabilidad y recomendación | Impacto esperado |
|---|---|---|---|
| **1. Pausar renderizado de lienzos ocultos (`PERF-01`)** | `SolarSystem.setRenderPaused(true)` solo se llama en Lanzamiento 3D, no cuando `#experimental-lab` cubre la pantalla en etapas 1 y 2. | **Muy alta (Prioridad #1 en Laboratorio).** Pausar `SolarSystem` en etapas `probe` y `plan`. | **+18,4 FPS (+39,6 %)** en software y **−4,6 a −7,9 ms GPU/frame**. |
| **2. Reducción de overdraw y anisotropía en terreno LC-41 (`LAN-01`)** | `LaunchWorld.js` apila `globo` + `florida` + `cabo` + `lc41` + `explanada` con `MeshStandardMaterial`, `alphaMap` y anisotropía hasta 16. | **Muy alta (Prioridad #1 en Lanzamiento 3D bajo software).** En perfil `low`/software fijar `anisotropy = 1`, ocultar capas exteriores cubiertas a baja altitud y simplificar material de terreno. | **+8 a +15 FPS** en `T−8 s` por software (`22,3 → ≥ 30 FPS`). |
| **3. `InstancedMesh` y `BufferGeometry`** | `LaunchEffects.js` ya usa `InstancedBufferGeometry` para el humo y `HeliosphereVisual.js` usa `BufferGeometry`. `LC41Pad1977.js` usa `Mesh` individuales para luminarias/postes estáticos (`LAN-02`). | **Media/Baja.** Agrupar o instanciar estáticos de `LC41Pad1977.js` ahorra `~40 draw calls` (`~0,62 ms` CPU), pero no es el cuello de botella principal. | **−0,4 a −0,6 ms CPU/frame** en plataforma. |
| **4. LOD (Level of Detail) geométrico** | `LaunchWorld.js` ya escala subdivisiones del globo (`96/64/40`) según perfil inicial. `SolarSystem.js` usa esferas fijas `64×64`. | **Media (`PERF-02`).** Ajustar segmentos de esferas secundarias en `SolarSystem.js` según perfil (`64/48/32`) y usar `setDrawRange` en líneas de trayectoria. | **+2 a +4 FPS** en reproducción por software. |
| **5. Frustum Culling** | Activo por defecto en cuerpos y piezas; desactivado (`frustumCulled = false`) en cúpula estelar y partículas dinámicas de humo. | **Mantener como está.** Activar frustum culling en partículas dinámicas sin recalcular `boundingSphere` cada frame causaría desaparición visual del penacho. | N/A |
| **6. Compresión de texturas y carga diferida** | `DeferredTextures.js` ya difiere la carga de texturas planetarias pesadas tras el primer pintado. | **Adecuado.** Notar que en `dist/assets/` se emiten decoders Draco (`.wasm` y `.js` de `719 kB`), aunque `Voyager.glb` es el único GLB; no bloquea los FPS en tiempo de ejecución. | Mejora tiempo de carga inicial, no FPS sostenidos. |
| **7. Optimización de sombras** | `QualityProfile.js` ya usa `4096` en `high`, `2048` en `medium` y desactiva sombras (`shadowMapSize = 0`) en `low`/software. Y `LaunchWorld.js` mantiene `sol.castShadow = true` fijo con `autoUpdate = false` en ascenso para evitar recompilación de shaders. | **Ya optimizado en Etapa 26/27.** En GPU con sombras `4096` activas rinde a `180 FPS` (`1,88 ms` GPU). No requiere recortar sombras en `high`. | Ya consolidado. |
| **8. Resolución dinámica (`QualityProfile.js`)** | Ya implementada (`0,30` a `2,00`) con detección de SwiftShader/llvmpipe y ventana de histéresis de 45 frames. | **Alta (ajuste puntual).** Impedir que `#solar-system` oculto llame a `reportFrame()` y permitir escalón `0,25` solo en plano `T−8 s` bajo software si `avgFrameMs > 33,3 ms`. | Estabilidad ≥ 30 FPS en software. |
| **9. Web Workers y caché de efemérides (`PERF-03`)** | `computeIntegratedMission` y `compareMissionCruise` corren en el hilo principal (`305–362 ms`). `sampleEphemerisState` busca segmento en cada evaluación de etapa DOPRI54. | **Alta para fluidez de UI.** Cachear último segmento en `sampleEphemerisState` y mover `computeIntegratedMission` / `compareMissionCruise` a un Web Worker. | Elimina bloqueos de **310–370 ms** al pulsar «Calcular». |
| **10. Throttling de DOM y etiquetas (`PERF-02`)** | `VoyagerLaunchDirector` ya limita callbacks de UI a `120 ms` (`~8,3 Hz`). `PlanetLabels.js` y `MissionControlCenter.js` actualizan cada frame. | **Media.** Limitar actualizaciones de texto/layout DOM de etiquetas y telemetría en perfil `low` a `15–20 Hz`. | **−0,5 a −1,0 ms CPU/frame** en reproducción. |
