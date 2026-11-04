# 08. Registro y Clasificación Exhaustiva de Defectos

**Proyecto:** Simulador de Sondas Espaciales (Sistema Solar y Misiones Voyager 1 y 2)  
**Fecha:** 31 de octubre de 2026  
**Regla de Clasificación:**
- **P0 - Crítico:** Imposibilita utilizar funciones esenciales o provoca cuelgues totales / pérdida de datos.
- **P1 - Alto:** Funcionalidad importante rota o experiencia gravemente degradada por excepciones.
- **P2 - Medio:** Problema funcional o visual relevante con alternativa de uso o degradación estética.
- **P3 - Bajo:** Detalle visual, inconsistencia menor o advertencia no bloqueante.

---

## Resumen de Defectos Identificados

| ID | Título del Defecto | Severidad | Modo Afectado | Componente Responsable | Estado |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **DEF-01** | `TypeError: hud.anunciar is not a function` en hitos guiados y lanzamiento | **P1 - Alto** | Histórico / Tour / Lanzamiento | `src/ui/HudControls.js` & `src/main.js` | Confirmado |
| **DEF-02** | Excepción `Falta estado para Tierra (outside_coverage)` en inyección V2 | **P1 - Alto** | Histórico | `src/science/HistoricalEphemerisResolver.js` | Confirmado |
| **DEF-03** | Telemetría en blanco (`—`) en fecha exacta de despegue (1977-08-20) | **P2 - Medio** | Histórico | `src/ui/HistoricalModeControls.js` | Confirmado |
| **DEF-04** | Densidad excesiva de controles en viewport móvil compacto (320×568) | **P2 - Medio** | Todos / Responsive | `src/ui/timeline-layout.css` | Confirmado |
| **DEF-05** | Activación fallida de Primera Persona con sonda en `pre_launch` | **P2 - Medio** | Histórico | `src/graphics/CameraController.js` | Confirmado |
| **DEF-06** | Conteo ambiguo de tarjetas de fotos por colisión de selector `data-photo-id` | **P3 - Bajo** | Histórico / Fotos | `src/ui/HistoricalModeControls.js` | Confirmado |
| **DEF-07** | Bundle único de producción de 960 kB sin división dinámica de código | **P3 - Bajo** | Build / Deploy | `vite.config.js` | Confirmado |

---

## Fichas Técnicas de Defectos

### DEF-01: Excepción `hud.anunciar is not a function` al cambiar de hito o completar lanzamiento
- **Severidad:** **P1 - Alto**
- **Modos Afectados:** Modo Histórico (Recorrido Guiado y Lanzamiento Cinematográfico).
- **Descripción:** Al cambiar de acontecimiento en el Recorrido Guiado (`ejecutarHitoGuiado`) o al completar/omitir la secuencia de lanzamiento de Titan IIIE (`alCompletarLanzamiento`), la consola del navegador arroja un error no controlado:
  ```
  TypeError: hud.anunciar is not a function
      at ejecutarHitoGuiado (main.js:973:7)
      at alCompletarLanzamiento (main.js:946:7)
  ```
- **Resultado Esperado:** El sistema debe actualizar el contenido del nodo accesible de región viva `#hud-announcement` sin lanzar excepciones en la consola.
- **Resultado Real:** La excepción detiene la ejecución del bloque de anuncio y satura la consola con errores JS no capturados.
- **Pasos para Reproducir:**
  1. Abrir la aplicación y entrar a "Misiones históricas".
  2. Pulsar "Recorrido guiado".
  3. Pulsar el botón "Siguiente" o seleccionar cualquier hito en la barra.
  4. Abrir la consola de herramientas de desarrollo (F12) y observar el TypeError.
- **Evidencias PNG:** `024-recorrido-hito-01-v2-launch-1977-1920x1080.png` a `035-recorrido-hito-12-v2-heliopause-2018-1920x1080.png`.
- **Registro Crudo:** `registros/javascript_exceptions.json`.
- **Archivo Responsable:** [src/ui/HudControls.js](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/src/ui/HudControls.js) y [src/main.js](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/src/main.js#L973).
- **Causa Confirmada:** `crearControlesHUD()` en `HudControls.js` devuelve únicamente `{ actualizarSeleccion, actualizarSeleccionSonda }`. El método `anunciar(mensaje)` no fue incluido en el objeto de retorno a pesar de que el nodo `#hud-announcement` existe en `index.html`.
- **Nivel de Confianza:** 100% (Causa raíz identificada y reproducida).
- **Recomendación Técnica para Codex:**
  En `src/ui/HudControls.js`, agregar la función:
  ```javascript
  function anunciar(mensaje) {
    if (anuncio) anuncio.textContent = mensaje;
  }
  ```
  y exponerla en el retorno: `return { actualizarSeleccion, actualizarSeleccionSonda, anunciar };`.
- **Criterio de Aceptación:** Navegar por los 12 hitos del recorrido guiado sin registrar ningún error en la consola y con `#hud-announcement` actualizado con el texto del hito.
- **Riesgo de Regresión:** Nulo (adición pura de método público faltante).

---

### DEF-02: Excepción de cobertura temporal en Tierra durante inyección de Voyager 2
- **Severidad:** **P1 - Alto**
- **Modos Afectados:** Modo Histórico.
- **Descripción:** Al posicionar la simulación en el instante exacto de primer vector heliocéntrico de Voyager 2 (`JD 2443376.1479166667` = 20 de agosto de 1977 a las 15:33 UTC), el resolvedor de efemérides arroja:
  ```
  Error: Falta estado histórico para Tierra en JD 2443376.1479166667: missing (outside_coverage)
      at Object.queryHistoricalSnapshot (HistoricalEphemerisResolver.js:423:15)
  ```
- **Resultado Esperado:** La Tierra debe resolver su estado orbital normalmente para calcular la distancia y el tiempo luz a la nave recién inyectada.
- **Resultado Real:** El resolvedor rechaza la consulta alegando que está fuera de cobertura.
- **Pasos para Reproducir:**
  1. En Modo Histórico, seleccionar Voyager 2.
  2. Situar la fecha en 1977-08-20 a las 15:33:00 UTC.
  3. Consultar la consola y verificar el rechazo de cobertura.
- **Evidencias PNG:** `019-hist-inspector-telemetria-1920x1080.png`.
- **Archivo Responsable:** [src/science/HistoricalEphemerisResolver.js](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/src/science/HistoricalEphemerisResolver.js#L423) y `public/data/historical-ephemerides-catalog-v1.json`.
- **Causa Confirmada:** En el catálogo `hist-launch-v2-injection-1977.json`, el límite `startJdTdb` está grabado como `2443376.147916667` (precisión de 9 decimales). El valor solicitado en JavaScript es `2443376.1479166667` (10 decimales). Al hacer la comparación estricta `jdTdb < dataset.coverage.startJdTdb`, la diferencia de `3.3 \times 10^{-16}` días (~28 picosegundos) se evalúa como `true`, rechazando la muestra como fuera de rango.
- **Nivel de Confianza:** 100%.
- **Recomendación Técnica para Codex:**
  En `HistoricalEphemerisResolver.js` y `EphemerisProvider.js`, aplicar una tolerancia numérica (`EPSILON_COVERAGE = 1e-9` días, equivalente a unos 86 microsegundos):
  ```javascript
  const EPSILON = 1e-9;
  if (jdTdb < dataset.coverage.startJdTdb - EPSILON || jdTdb > dataset.coverage.endJdTdb + EPSILON) {
    // fuera de rango real
  }
  ```
- **Criterio de Aceptación:** Consultar `JD 2443376.1479166667` sin lanzar excepciones y obteniendo el vector de la Tierra interpolado correctamente.
- **Riesgo de Regresión:** Extremadamente bajo. No altera la física ni los datos fuente.

---

### DEF-03: Ficha de telemetría muestra guiones mudos (`—`) durante ventana de pre-lanzamiento
- **Severidad:** **P2 - Medio**
- **Modos Afectados:** Modo Histórico.
- **Descripción:** Al iniciar el Modo Histórico, el reloj arranca en `1977-08-20 · 14:29:00 UTC` (instante del despegue). Los campos de Distancia al Sol, Distancia a la Tierra y Tiempo luz muestran `—`. Un usuario sin contexto interpreta que la aplicación no cargó datos.
- **Resultado Esperado:** La ficha debe mostrar un estado semántico claro: *"Fase de despegue / Inyección en curso"* o *"Lanzamiento a las 14:29 UTC"*.
- **Resultado Real:** Ficha vacía con campos en guiones.
- **Pasos para Reproducir:**
  1. Cargar la aplicación y pulsar "Misiones históricas".
  2. Abrir la pestaña "Telemetría" en el Inspector.
  3. Observar los guiones en las métricas principales.
- **Evidencias PNG:** `019-hist-inspector-telemetria-1920x1080.png`.
- **Archivo Responsable:** [src/ui/HistoricalModeControls.js](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/src/ui/HistoricalModeControls.js).
- **Recomendación Técnica:**
  En `HistoricalModeControls.js`, cuando el estado de la sonda sea `'pre_launch'` o `'launch_window'`, desplegar una etiqueta informativa: *"En plataforma de lanzamiento LC-41 (Inyección heliocéntrica a las 15:33 UTC)"*.
- **Criterio de Aceptación:** Al arrancar en agosto de 1977, la ficha explica claramente que el vuelo heliocéntrico aún no ha iniciado.

---

### DEF-04: Densidad excesiva de controles temporales en viewport móvil (320×568)
- **Severidad:** **P2 - Medio**
- **Modos Afectados:** Responsive en smartphones compactos.
- **Descripción:** En pantallas de 320 px de ancho, la coexistencia de los botones de transporte temporal (`Play`, `Anterior`, `Siguiente`, `Reversa`, `Último`), los 4 selectores desplegables de fecha numérica y el dock de misiones satura el área vertical, dejando menos del 45% del viewport para el lienzo 3D.
- **Resultado Esperado:** En pantallas `< 480px`, los controles secundarios deben ocultarse o agruparse en un menú colapsable, priorizando el slider continuo y el botón de reproducción.
- **Evidencias PNG:** `071-responsive-mobile-iphone-se1-320x568-solar.png` y `072-responsive-mobile-iphone-se1-320x568-historico.png`.
- **Archivo Responsable:** [src/ui/timeline-layout.css](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/src/ui/timeline-layout.css).
- **Recomendación Técnica:**
  Agregar media query `@media (max-width: 480px)` para ocultar `.hist-date-selectors` y reducir el margen de `.hist-transport-row`.
- **Criterio de Aceptación:** Lienzo 3D visible al menos en un 65% de la altura vertical en resolución 320x568.

---

### DEF-05: Fallo al activar Primera Persona con sonda en `pre_launch`
- **Severidad:** **P2 - Medio**
- **Modos Afectados:** Modo Histórico.
- **Descripción:** Si la fecha del simulador es agosto de 1977 (antes del lanzamiento de Voyager 1 el 5 de septiembre) y el usuario pulsa "Primera persona" teniendo Voyager 1 seleccionada, el método devuelve `false` silenciosamente y el indicador flotante no se muestra.
- **Resultado Esperado:** Un mensaje informativo en el HUD anunciando: *"Voyager 1 aún no ha despegado en esta fecha (Lanzamiento: 5 sep 1977)"*.
- **Evidencias PNG:** `022-hist-camara-primera-persona-pov-1920x1080.png`.
- **Archivo Responsable:** [src/graphics/CameraController.js](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/src/graphics/CameraController.js) y `src/main.js`.
- **Recomendación Técnica:** Notificar al usuario mediante un toast o aviso en escena cuando se intente entrar en primera persona en una sonda no lanzada.

---

### DEF-06: Colisión en selector de fotos por coincidencia con botones de tour
- **Severidad:** **P3 - Bajo**
- **Modos Afectados:** Modo Histórico (Inspección técnica).
- **Descripción:** El selector DOM `document.querySelectorAll('[data-photo-id]')` devuelve 10 elementos en lugar de 8, debido a que el botón "Comparar" del tour guiado y el botón del panel de eventos también portan dicho atributo.
- **Recomendación Técnica:** Usar selector específico `#hist-photo-list [data-photo-id]`.
- **Riesgo:** Inofensivo en la interfaz de usuario; relevante únicamente para aserciones de pruebas automatizadas.

---

### DEF-07: Advertencia de empaquetado Vite (>500 kB chunk)
- **Severidad:** **P3 - Bajo**
- **Modos Afectados:** Proceso de compilación (`vite build`).
- **Descripción:** Vite emite una advertencia de chunk grande para `dist/assets/index-CWWPHVs6.js` (960 kB).
- **Recomendación Técnica:** Configurar `build.rollupOptions.output.manualChunks` en `vite.config.js` para separar `three` en un vendor chunk independiente.
