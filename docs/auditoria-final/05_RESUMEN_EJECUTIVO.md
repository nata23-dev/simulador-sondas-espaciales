# Resumen Ejecutivo — Auditoría Final Integral (`05_RESUMEN_EJECUTIVO.md`)

Este documento responde de forma directa, objetiva y respaldada por las mediciones de producción (`docs/auditoria-final/evidencias/`) a las diez preguntas ejecutivas formuladas para determinar si el **Simulador de Sondas Espaciales** está listo para considerarse una versión final.

---

## Respuestas Directas a las 10 Preguntas Ejecutivas

### 1. ¿El proyecto está listo o no para considerarse versión final?

**Está prácticamente listo (Aprobado con observaciones menores/medias), condicionado a un ciclo corto y acotado de cierre (Fase 1 a Fase 3 del plan de correcciones).**

- **Estado de la base actual:** `npm run lint` pasa con **0 errores**, la suite automatizada supera **420/420 pruebas** (`7,38 s`) y la compilación de producción (`npm run build`) genera los artefactos en `~600 ms` sin errores.
- **Por qué aún requiere un pase puntual antes del sello definitivo:** Se verificaron tres hallazgos de prioridad alta/inmediata que conviene cerrar antes de etiquetar la versión final:
  1. **`GEN-02` (P0):** Una condición de carrera asíncrona en `IntegratedMissionPlanner.compute()` permite que, si el usuario cambia el escenario durante los primeros milisegundos de cálculo, la misión anterior termine habilitando el botón «Ejecutar misión en 3D» con un destino distinto al mostrado en los selectores.
  2. **`STAB-01` (P0):** Si el navegador no puede crear un contexto WebGL 2, la excepción síncrona en `src/main.js` detiene el arranque dejando el cartel `"Esperando datos…"` sin mensaje de incompatibilidad para el usuario.
  3. **`PERF-01` y `LAN-01` (P1):** El lienzo principal `#solar-system` sigue renderizando oculto detrás del Laboratorio en las etapas 1 y 2, y el plano de plataforma LC-41 (`T−8 s`) bajo renderizado por software puro promedia `22,31 FPS` (`44,82 ms`), por debajo del umbral mínimo de `30 FPS`.

---

### 2. ¿Cuáles son los 5 problemas más importantes encontrados?

1. **`GEN-02` (ALTO · P0 · Funcional/Laboratorio):** Condición de carrera asíncrona en `src/ui/IntegratedMissionPlanner.js` (`compute()`), que no verifica si `invalidate()` fue llamado durante `await setTimeout(30)` o `await helioEphemeris.loadWindow(...)`.
2. **`PERF-01` (ALTO · P1 · Rendimiento global):** El lienzo principal `#solar-system` permanece renderizando a `60–180 Hz` (`39 draw calls`, `76.340 triángulos`) y proyectando etiquetas DOM mientras está completamente cubierto por la capa opaca `#experimental-lab` en las etapas `1 · Elegir sonda` (Catálogo, Hangar, Ingeniería) y `2 · Planificar`. Pausarlo cuando está oculto eleva los FPS del Hangar en software de **46,44 a 64,85 FPS (+39,6 %)** y ahorra **4,6–7,9 ms/frame** de GPU.
3. **`LAN-01` (ALTO · P1 · Lanzamiento 3D en software/dispositivos sin GPU):** En renderizado por software (SwiftShader, ratio adaptativo `0,30`), los planos cercanos a la plataforma LC-41 (`T−8 s` y `T−2 s`) promedian **22,31 FPS** (`44,82 ms`) y **27,45 FPS** (`36,43 ms`) debido al coste por píxel (overdraw y muestreo anisotrópico de capas superpuestas de terreno `globo` + `florida` + `cabo` + `lc41`).
4. **`STAB-01` (ALTO · P0 · Estabilidad):** Excepción síncrona no capturada (`THREE.WebGLRenderer: Error creating WebGL context.`) en el nivel superior de `src/main.js` cuando WebGL 2 no está disponible, dejando la interfaz sin aviso de error.
5. **`SCI-01` (MEDIO · P1 · Científico):** En `src/science/HistoricalTime.js`, `parseUtcTimestamp` acepta `:60` en cualquier fecha/hora/minuto y `utcTimestampToTdb` sufre un redondeo en float64 (`midnightPseudoJd + (86400 - 1e-6) / 86400` redondea a `midnightPseudoJd + 1.0`), provocando que `2016-12-31 23:59:60` evalúe `TAI−UTC = 37 s` y devuelva exactamente el mismo `jdTdb` que `2017-01-01 00:00:00` (`+1 s` de desplazamiento en el segundo intercalar).

---

### 3. ¿Cuál es el rendimiento actual real del simulador?

Medido sobre la compilación de producción (`vite build` con `GITHUB_PAGES=true`, viewport `1600×900`, `1280×720` y `2560×1440`, DPR 1, Chrome `157.0.8103.79`, Ryzen 5 5600) en dos perfiles extremos:

- **Con aceleración por hardware GPU (AMD Radeon RX 6650 XT, ratio 1,0, perfil `high`):**
  - **Sistema Solar (7 escenarios):** **170,26 – 180,00 FPS** (`5,56 – 5,87 ms/frame`, P95 `5,6 – 5,7 ms`, CPU render `0,19 – 0,67 ms`, GPU `0,18 – 0,79 ms`). Incluso a `2560×1440` sostiene **178,61 FPS** (`5,60 ms`).
  - **Misiones Históricas Voyager 1/2 (4 escenarios):** **176,75 – 180,00 FPS** (`5,56 – 5,66 ms/frame`, P95 `5,6 – 5,7 ms`, CPU render `0,09 – 0,48 ms`, GPU `0,14 – 0,17 ms`).
  - **Laboratorio de Misiones (7 escenarios):** **179,28 – 180,00 FPS** (`5,56 – 5,58 ms/frame`, P95 `5,6 – 5,7 ms`).
  - **Lanzamiento 3D Voyager (7 ventanas desde plataforma hasta órbita):** **179,80 – 180,00 FPS** (`5,56 ms/frame`, P95 `5,60 ms`, P99 `5,70 ms`, CPU render `0,44 – 1,43 ms`, GPU `0,29 – 2,22 ms`).
- **En fallback de renderizado por software en CPU (SwiftShader Vulkan, perfil adaptativo `low`, ratio `0,30 – 1,00`):**
  - **Sistema Solar:** **75,18 FPS** en vista general (`1600×900`, ratio `0,70`), **71,09 FPS** a `1280×720` (ratio `1,00`), **83,30 FPS** en sistema interior, **39,92 FPS** a `2560×1440`, y **31,84 – 37,72 FPS** en acercamiento a la Tierra y tiempo acelerado `×4`.
  - **Misiones Históricas:** **37,15 FPS** con ambas Voyager, **39,49 FPS** en encuentro con Europa, **164,52 FPS** en comparador NASA y **29,56 FPS** (`33,83 ms`) con el reloj histórico en marcha.
  - **Laboratorio:** **46,01 – 46,44 FPS** en Catálogo, Hangar Cassini e Ingeniería (que suben a **64,85 FPS** al pausar el lienzo `#solar-system` oculto), **132,56 FPS** en Planificación, **32,07 FPS** en seguimiento con telemetría y **27,65 FPS** (`36,16 ms`) en reproducción general del Centro de Misión.
  - **Lanzamiento 3D:** **22,31 FPS** (`44,82 ms`) en plataforma general (`T−8 s`), **27,45 FPS** (`36,43 ms`) en base (`T−2 s`), **33,17 FPS** (`30,15 ms`) en ascenso dinámico (`T+0 → +5,5 s`), **51,49 FPS** en despegue (`T+5 s`) y **67,32 – 75,06 FPS** en seguimiento (`T+30 s`), separación (`T+130 s`) y órbita (`T+1500 s`).

---

### 4. ¿Cuál es la causa exacta del bajo rendimiento del Lanzamiento 3D?

Hay dos respuestas complementarias según la época del código y el entorno gráfico:

1. **Por qué en versiones anteriores caía a 7–10 FPS (y sufría pausas de >1 s):**
   - Antes de las Etapas 26 y 27, el director de lanzamiento alternaba dinámicamente `sol.castShadow` y `material.side` durante la animación (provocando una recompilación síncrona de shaders de **1.412 ms** en mitad del vuelo), decodificaba texturas 8K en el hilo principal y carecía de detección de renderizador por software y resolución adaptativa, por lo que en navegadores sin aceleración GPU caía a **1,8–11 FPS**.
2. **Qué ocurre en la versión actual:**
   - **Con GPU dedicada activa:** El problema de 7–10 FPS **ya no existe**; toda la secuencia de lanzamiento corre a **180 FPS estables** (`5,56 ms/frame`, `0` Long Tasks).
   - **Cuando el navegador cae a renderizado por software (SwiftShader):** Durante la transición de entrada se observó un frame mínimo puntual equivalente a `9,29 FPS` (`107,7 ms`) mientras el perfil adaptativo bajaba el pixel ratio de `0,50` a `0,35`, y el plano fijo de plataforma (`T−8 s`) se estabiliza en **22,31 FPS** (`44,82 ms`).
   - **Causa raíz demostrada mediante experimentos A/B en `T−8 s` (`LAN-01`):**
     - Ocultar toda la plataforma LC-41 (`95 → 55` draw calls) apenas cambia de `22,31` a `23,11 FPS` (`44,82 → 43,28 ms`).
     - Ocultar el shader del cielo (`sinCielo`) apenas cambia de `22,61` a `23,95 FPS`.
     - Reducir las dimensiones de píxeles a la mitad (`ratio 0,30 → 0,15`) dispara el rendimiento de **22,31 a 54,24 FPS** (`44,82 → 18,44 ms`).
     - Esto demuestra de forma concluyente que el cuello de botella residual en software a `T−8 s` **no es la geometría de la torre ni las partículas de humo**, sino el **coste de rasterización por píxel (overdraw y filtrado anisotrópico)** de los parches de terreno superpuestos (`globo` + `florida` + `cabo` + `lc41` + `explanada`) que cubren casi todo el viewport en los planos cercanos al suelo.

---

### 5. ¿Cuántos FPS se estima que pueden ganarse con las optimizaciones propuestas?

- **En GPU dedicada / integrada moderna:** El simulador ya opera en el techo del refresco (**60 FPS en monitores de 60 Hz; hasta 180 FPS sin límite**). La ganancia allí no es en FPS brutos sino en **ahorro de carga de GPU/energía** (**−4,6 a −7,9 ms de GPU por frame** en el Laboratorio al pausar el lienzo `#solar-system` oculto) y **eliminación de bloqueos de 310–370 ms** al calcular misiones (`PERF-03`).
- **En renderizado por software / dispositivos muy limitados (donde realmente se pierden FPS):**
  - **Hangar 3D, Catálogo e Ingeniería (`PERF-01`):** Ganancia medida en experimento A/B de **+18,4 FPS (+39,6 %)**, pasando de **46,44 FPS a 64,85 FPS** simplemente pausando `#solar-system` cuando está cubierto por `#experimental-lab`.
  - **Plataforma de Lanzamiento 3D a `T−8 s` y `T−2 s` (`LAN-01`):** Ganancia estimada de **+8 a +15 FPS**, pasando de **22,31 FPS (`44,82 ms`) a 30–38 FPS (`26–33 ms`)** al reducir el overdraw de parches de terreno superpuestos, fijar `anisotropy = 1` en perfil `low`/software y permitir un escalón adaptativo adicional en plataforma.
  - **Reproducción en Centro de Misión y Reloj Histórico (`PERF-02`):** Ganancia estimada de **+3 a +6 FPS**, llevando `Centro en reproducción` de **27,65 FPS a ~32–34 FPS** y `Reloj histórico` de **29,56 FPS a ~33–35 FPS** mediante throttling de etiquetas DOM/telemetría en perfil `low` y `setDrawRange` en trayectorias.

---

### 6. ¿Qué optimizaciones tienen mejor relación beneficio/esfuerzo?

1. **Pausar `#solar-system` cuando `#experimental-lab` está en etapas `1 · Elegir sonda` o `2 · Planificar` (`PERF-01`):**
   - *Esfuerzo:* ~20 líneas de código.
   - *Beneficio:* **+18,4 FPS (+39,6 %)** en software y eliminación del **88 % del coste GPU** durante el diseño y planificación en el Laboratorio, con riesgo visual y científico nulo.
2. **Reducir overdraw y anisotropía de las capas de terreno en `LaunchWorld.js` para perfil `low`/software (`LAN-01`):**
   - *Esfuerzo:* ~60 líneas de código.
   - *Beneficio:* Lleva el único tramo del Lanzamiento 3D que baja de 30 FPS en software (`T−8 s` a `22,31 FPS`) por encima del presupuesto de `30 FPS`, sin tocar la calidad visual en GPUs dedicadas.
3. **Cachear el último índice de segmento de Chebyshev en `sampleEphemerisState` (`PERF-03`):**
   - *Esfuerzo:* ~15 líneas en `HeliocentricEphemeris.js`.
   - *Beneficio:* Reduce el coste de CPU de la función más caliente del perfilador V8 (`24,8 %` del tiempo total de `computeIntegratedMission`) con resultado numérico bit a bit idéntico.
4. **Token de generación asíncrona en `IntegratedMissionPlanner.compute()` (`GEN-02`) y `try/catch` de WebGL 2 (`STAB-01`):**
   - *Esfuerzo:* ~55 líneas entre ambos.
   - *Beneficio:* Cierra los dos únicos defectos funcionales/estabilidad de prioridad `P0`.

---

### 7. ¿Qué correcciones científicas son necesarias?

El núcleo astrodinámico y numérico del simulador (**DOPRI54, conservación de energía y momento angular a niveles de `10⁻¹⁴`, ecuación de Tsiolkovsky, caída radial, solucionador de Lambert, plano B, captura por empuje finito, corrección Tierra-Luna más allá de la SOI de la Etapa 28 y efemérides SPK de Horizons**) **superó todas las verificaciones independientes sin errores matemáticos ni de unidades**.

La **única corrección científica necesaria** es:
- **`SCI-01` en `src/science/HistoricalTime.js` (MEDIO · P1):**
  1. Restringir `second === 60` en `parseUtcTimestamp()` exclusivamente a `23:59:60` de fechas que correspondan a un segundo intercalar real en la tabla `LEAP_SECONDS` del IERS (actualmente acepta `:60` en cualquier fecha y minuto).
  2. Corregir la evaluación de `taiMinusUtcAtPseudoJd` durante `23:59:60` en `utcTimestampToTdb()`: sumar `(SECONDS_PER_DAY - 1e-6) / SECONDS_PER_DAY` a un Día Juliano de magnitud `2.4577535e6` desborda la precisión de 53 bits de mantisa IEEE-754 y redondea al día siguiente (`+1.0`), devolviendo el `TAI−UTC` posterior y haciendo que `2016-12-31 23:59:60` colisione con `2017-01-01 00:00:00`. Evaluar `taiMinusUtcAtPseudoJd(parsed.midnightPseudoJd + 0.5)` cuando `parsed.second === 60` resuelve por completo el problema.

---

### 8. ¿Qué problemas funcionales existen en los tres módulos?

- **Módulo A — Sistema Solar (Exploración):**
  - Funcionalmente completo y estable en todas las resoluciones (`320×568` a `2560×1440`).
  - Solo afectado en arranque si el navegador carece por completo de soporte WebGL 2 (`STAB-01`).
  - En el buscador global (`#command-palette`, `UX-01`), al filtrar acciones queda visible el encabezado vacío `"Cuerpos y sondas"`, y pulsar `Tab` saca el foco del modal impidiendo cerrarlo con `Escape`.
- **Módulo B — Misiones Históricas (Voyager 1 y Voyager 2):**
  - Efemérides reales NASA/JPL Horizons, cambio automático a encuentro local, recreación fotográfica de las 22 imágenes oficiales PIA, comparador NASA/3D y Lanzamiento 3D verificados y operativos.
  - Detalle menor de interacción (`UX-02`): el modal `#historical-welcome-modal` puede interceptar clics hacia la barra superior `#app-header` si no se cierra antes, y no se cierra con `Escape` ni clic en el fondo exterior.
- **Módulo C — Laboratorio de Misiones (`Elegir sonda → Planificar → Reproducir`):**
  - Las 5 sondas tienen parámetros diferenciados que alteran físicamente los resultados (p. ej. `A1` es viable con Cassini consumiendo `2.396 kg` de propelente y `11.869 kg` de Centaur D-1T, y no viable con Voyager por presupuesto de captura hidracina), y cambiar de sonda invalida inmediatamente el Centro de Misión y oculta el transporte 3D.
  - **Defecto funcional activo (`GEN-02`):** Si el usuario pulsa «Calcular misión» y cambia el escenario o destino dentro de la ventana asíncrona de cesión (`setTimeout(30)` / descarga de ventana SPK), `compute()` finaliza con los datos antiguos y habilita «Ejecutar misión en 3D» para un planeta que ya no coincide con el selector visible.

---

### 9. ¿Qué cambios deben hacerse primero?

En estricto orden de ejecución para Codex (Fases 1, 2 y 3 de `04_PLAN_CORRECCIONES.md`):

1. **`GEN-02` (`src/ui/IntegratedMissionPlanner.js`):** Añadir contador de época `computeEpoch` para abortar cálculos asíncronos invalidados y fijar snapshot de entradas antes del primer `await`.
2. **`STAB-01` (`src/main.js` y vistas 3D del Lab):** Envolver la inicialización de `WebGLRenderer` en `try/catch` con mensaje de incompatibilidad WebGL 2 en `#data-status`.
3. **`SCI-01` (`src/science/HistoricalTime.js`):** Corregir la consulta de `TAI−UTC` en `23:59:60` para evitar el redondeo float64 y validar `:60` contra la tabla IERS `LEAP_SECONDS`.
4. **`PERF-01` (`src/main.js` / `src/ui/ExperimentalLaboratory.js`):** Pausar `SolarSystem` (`setRenderPaused(true)`) mientras el usuario está en las etapas `1 · Elegir sonda` o `2 · Planificar` del Laboratorio y reanudarlo en `3 · Reproducir` o al salir del Laboratorio.
5. **`LAN-01` (`src/launch/LaunchWorld.js` / `src/graphics/QualityProfile.js`):** Reducir el coste de fragmentos por píxel de las capas de terreno superpuestas en los planos de plataforma (`T−8 s`, `T−2 s`) bajo perfil `low`/software.

---

### 10. ¿Qué riesgos deben evitarse durante la fase de implementación?

1. **No degradar la calidad visual en GPUs capaces por optimizar el fallback por software:** Cualquier simplificación de materiales de terreno o reducción de ratio adicional (`< 0,30`) para `LAN-01` debe aplicarse **exclusivamente** cuando `QualityProfile` esté en nivel `low` o `isSoftwareRenderer === true`. En GPUs dedicadas/integradas capaces (`high`/`medium`) la escena ya rinde a `180 FPS` y debe conservar sus sombras `4096`, PMREM, `MeshStandardMaterial` y ratio `1,0+`.
2. **No alterar tolerancias numéricas ni modelos físicos:** Está prohibido relajar `rtol`/`atol` del integrador DOPRI54, eliminar perturbaciones gravitatorias (Tierra-Luna en Etapa 28 o planetas en Etapa 22) o acoplar el paso de integración al `dt` de `requestAnimationFrame`.
3. **No dejar `#solar-system` pausado al salir de las etapas 1–2 del Laboratorio:** Al implementar `PERF-01`, toda transición hacia `3 · Reproducir` (`stage === 'play'`), `Sistema Solar`, `Misiones Históricas` o búsqueda global (`CommandPalette`) debe garantizar `sistemaSolar.setRenderPaused(false)` y actualizar dimensiones si hubo `resize`.
4. **No romper los pivotes cinemáticos de `LC41Pad1977.js`:** Si se agrupan geometrías estáticas de la plataforma (`LAN-02`), los brazos umbilicales que rotan en el despegue deben permanecer en sus grupos con pivote independiente.
