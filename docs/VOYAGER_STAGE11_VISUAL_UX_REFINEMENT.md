# Etapa 11 — refinamiento visual y del comparador NASA / 3D

## Estado y alcance

La intervención se limitó a presentación, selección de fotografías, etiquetas de campo visual y cámara de **zoom visual** opcional. No se modificaron efemérides, kernels, posiciones, velocidades, radios, vectores locales, manifiestos científicos ni los dos cortes SPK. La rama al iniciar era `revision/modo-historico-voyager`, con modificaciones locales de las etapas 08–10; se conservaron. No se hizo commit, push ni despliegue.

**Resultado:** comparador móvil utilizable y FOV explicado; solapamiento del encabezado y del acceso al recorrido en 320×568 corregidos. La franja de Neptuno y las diferencias del mosaico de Ío **siguen visibles** y no se presentan como resueltas.

## Causas técnicas y cambios

| Observación | Diagnóstico | Acción y resultado |
|---|---|---|
| La foto y la ficha B ocupaban el centro del móvil | `workspace-layout.css` imponía a la tarjeta A `height:52%` y a B `height:40%`, y tenía prioridad sobre las reglas antiguas de `style.css` | Pestañas A/B en ≤760 px; la tarjeta no activa se oculta. La B usa el **canvas WebGL real** detrás de la barra; sus opciones se pliegan. En escritorio y tableta de 768 px se conservan las dos vistas simultáneas. |
| No se podía cambiar de fotografía dentro del comparador | El catálogo sólo se recorría en el inspector, que se cerraba al comparar | Selector compacto de fotografías del catálogo. Cambia foto, sonda, fecha de consulta y objetivo; el cierre recupera el estado anterior. |
| La recreación B de PIA00379 era pequeña en móvil | A la distancia de la foto, el campo ISS de 0,424° ocupa el eje corto del fotograma cuadrado; en retrato la pantalla añade campo vertical y el disco ocupa pocos píxeles | Botón opcional «Zoom 3D»: FOV **0,35° vertical**, rotulado como magnificación de visualización, no campo ISS. Sólo cambia la proyección de cámara; no acerca la nave ni modifica datos. El modo ISS sigue disponible. |
| Encabezado y barra temporal se rozaban a 320×568 | Título largo y botón «Iniciar recorrido» con desplazamiento fijo para móviles más altos | El título admite dos líneas compactas y el acceso al recorrido se eleva 30 px en pantallas de altura ≤650 px. |

El comparador **no promete coincidencia fotográfica exacta**. Algunas fotos NASA no publican hora precisa; el catálogo utiliza una hora de consulta nominal y la cámara no dispone de CK/IK ni de la geometría completa del instrumento. La foto A conserva archivo, crédito, identificador y enlace NASA/JPL. La B se identifica como recreación geométrica WebGL. En PIA00379, Ío está pequeño y mayormente nocturno desde la geometría consultada: el zoom aumenta su tamaño en pantalla, pero no ilumina el hemisferio oscuro.

La selección previa de sonda, fecha, objetivo, reproducción y cámara se guarda al abrir el comparador y se restaura al cerrarlo. Minimizar y recuperar únicamente cambia la presentación del panel. La prueba E2E verifica el retorno de JD TDB, ID de sonda y modo de cámara tras cambiar de foto.

### Archivos intervenidos en esta etapa

| Archivo | Función |
|---|---|
| `index.html` | Pestañas, selector de foto, minimización y opción de zoom. |
| `src/style.css`, `src/ui/workspace-layout.css` | Composición del comparador y correcciones en 320×568. |
| `src/ui/HistoricalModeControls.js` | Estado A/B, selección, etiquetas de FOV y acciones de panel. |
| `src/main.js`, `src/graphics/CameraController.js` | Zoom visual etiquetado, restringido a recreación fotográfica. |
| `tests/InstrumentFov.test.mjs` | Aspectos de las seis resoluciones y valor móvil exacto. |
| `scripts/audit-stage11-comparator.mjs`, `scripts/capture-stage11.mjs`, `scripts/audit-stage11-textures.py` | Diagnósticos reproducibles; los dos primeros generan capturas reales con Chrome. |
| `docs/VOYAGER_STAGE11_VISUAL_UX_REFINEMENT.md`, `evidence/voyager-stage11/` | Informe, resultados y evidencia. |

`src/main.js` y `src/ui/HistoricalModeControls.js` ya tenían cambios locales antes de empezar; se añadieron sólo las líneas de esta etapa. El archivo de auditoría anterior y el resto del trabajo no respaldado conservaron su contenido.

## FOV: comprobación matemática

`THREE.PerspectiveCamera.fov` es **vertical**. El campo ISS-NAC que usa el catálogo es **0,424° por lado de un fotograma cuadrado**. Para un lienzo de relación `a = ancho/alto`, el controlador conserva 0,424° en el eje corto:

```text
si a ≥ 1: FOV_vertical = 0,424°
si a < 1: FOV_vertical = 2 atan(tan(0,424°/2) / a)
FOV_horizontal = 2 atan(tan(FOV_vertical/2) · a)
```

| Canvas CSS efectivo | Aspecto | Horizontal | Vertical | Eje corto |
|---:|---:|---:|---:|---:|
| 1920×1080 | 1,777778 | 0,753770° | 0,424000° | vertical |
| 1366×768 | 1,778646 | 0,754138° | 0,424000° | vertical |
| 1280×720 | 1,777778 | 0,753770° | 0,424000° | vertical |
| 768×1024 | 0,750000 | 0,424000° | 0,565331° | horizontal |
| 390×844 | 0,462085 | 0,424000° | **0,917564°** | horizontal |
| 320×568 | 0,563380 | 0,424000° | 0,752593° | horizontal |

Por tanto, la diferencia 0,424°/0,917564° de la Etapa 10 es **correcta**, no un error de cámara. El diagnóstico E2E compara el FOV real con el aspecto del canvas y la fórmula anterior. La telemetría ahora distingue el campo cuadrado instrumental de los FOV horizontal y vertical del viewport; también distingue el FOV contextual del zoom visual. La cámara no recorta la fotografía original para producir una falsa equivalencia de encuadre.

## Neptuno: defecto pendiente

La vista exterior de Voyager 2 conserva la exposición estabilizada de la Etapa 10 y mantiene visibles tanto la nave como el planeta. La franja curva de color continúa siendo perceptible en [la captura actual](../evidence/voyager-stage11/after/voyager2-neptune-1920x1080.png). Una [segunda captura diez segundos después](../evidence/voyager-stage11/after/voyager2-neptune-rotation-check-1920x1080.png) muestra cambios en las nubes del mapa sin una nueva costura longitudinal. La prueba no permite atribuir toda la franja sólo a la textura frente a la combinación de gradiente cartográfico, iluminación y exposición.

El mapa activo `public/textures/neptune.jpg` procede de [Solar System Scope](https://www.solarsystemscope.com/textures/download/2k_neptune.jpg), como indica el README local. Es 2048×1024, SHA-256 `cb42ea82709741d28b0af44d8b283cbc6dbd0c521a7f0e1e1e010ade00977df6`. La distancia RGB media entre extremos longitudinales es **1,536** sobre 8 bits, frente a **0,516** entre columnas interiores adyacentes; la mayor transición media entre dos filas es **3,904**. Son métricas descriptivas en sRGB, no fotometría. La esfera de Neptuno sólo tiene una malla superficial, carga sRGB con anisotropía 4 y no usa una segunda atmósfera ni un mosaico de materiales. La evidencia no apunta a un error de UV o de filtrado que justifique retocar el mapa.

Se evaluaron [la textura 3D de NASA/JPL](https://science.nasa.gov/3d-resources/neptune/) y [la foto Voyager 2 PIA02210](https://science.nasa.gov/photojournal/neptune-3/). NASA identifica expresamente la primera como **ficticia**; la segunda es un disco observado y realzado en contraste, no un atlas global equirectangular. Ninguna sustituye honestamente al recurso actual como mapa histórico global medido de 1989. **No se cambió la textura y la franja permanece abierta.** El botón existente «Trayectorias» permite ocultar explícitamente las líneas cuando estorban a una vista cinematográfica; los datos y los cortes no se modifican.

## Ío: fidelidad y resolución de la fuente

La superficie activa sigue siendo el PNG derivado `io-voyager-usgs-seam-feathered.png` del [mosaico NASA/USGS/JPL de Voyager, Io A](https://science.nasa.gov/3d-resources/jupiter-io-a/). La Etapa 07B ya atenuó tres uniones del mosaico original y conserva máscara de observación y relleno ilustrativo distinguibles. El mapa es **1440×720** y la malla usa UV equirectangulares, `RepeatWrapping` horizontal, `ClampToEdgeWrapping` vertical, sRGB y anisotropía 4. No se encontró un cambio de UV ni de filtrado adicional defendible. La costura y la diferencia de nitidez/color siguen visibles en el [primer plano actual](../evidence/voyager-stage11/after/voyager1-io-1920x1080.png), especialmente en móvil. La inspección numérica de los archivos y sus hashes figura en [texture-diagnostics.json](../evidence/voyager-stage11/texture-diagnostics.json).

La [variante Io B de NASA](https://science.nasa.gov/3d-resources/jupiter-io-b/) se había evaluado en la Etapa 10: incorpora color de un mosaico **Galileo posterior** y mantiene límites de tesela parecidos. Sustituirla como si fuera la observación Voyager de 1979 confundiría épocas. No se inventó geografía ni se suavizó de nuevo la superficie. La orientación absoluta lunar aún carece de CK/PCK verificados. La recomendación es conseguir una cartografía Voyager coetánea con documentación de proyección, longitud y cobertura antes de cualquier sustitución.

## Evidencia de Chrome y revisión responsiva

Capturas auténticas tomadas con Google Chrome, WebGL 2/ANGLE SwiftShader, DPR 1. Los scripts usan Playwright externo al repositorio. `capture-stage11.mjs` recorre Sistema Solar, Experimental y Misiones Históricas en los seis tamaños; `audit-stage11-comparator.mjs` ejercita A/B, fotografía nueva, minimizar, restaurar, FOV y cierre. Los datos de ejecución están en `evidence/voyager-stage11/`.

La pasada completa produjo **55 capturas y 0 errores de consola/página/carga**: nueve escenarios por resolución más una segunda toma de Neptuno para observar el giro. [Manifiesto con estados de cámara](../evidence/voyager-stage11/after-results.json). El comparador produjo diez capturas adicionales y comprobó la restauración de estado en las seis resoluciones. [Resultados E2E del comparador](../evidence/voyager-stage11/comparator/results.json).

| Escenario | Antes | Después / estado final |
|---|---|---|
| Comparador Ío 390×844 | [Etapa 10: la foto tapa la escena](../evidence/voyager-stage10/comparator/voyager1-io-comparator-390x844.png) | [A · NASA](../evidence/voyager-stage11/comparator/voyager1-io-photo-390x844.png) · [B · WebGL](../evidence/voyager-stage11/comparator/voyager1-io-3d-390x844.png) · [B con zoom rotulado](../evidence/voyager-stage11/comparator/voyager1-io-3d-zoom-390x844.png) |
| Comparador Ío 320×568 | Sin captura previa de este tamaño | [A · NASA](../evidence/voyager-stage11/comparator/voyager1-io-photo-320x568.png) · [B · WebGL](../evidence/voyager-stage11/comparator/voyager1-io-3d-320x568.png) · [B con zoom](../evidence/voyager-stage11/comparator/voyager1-io-3d-zoom-320x568.png) |
| Comparador escritorio | [Etapa 10, 1920×1080](../evidence/voyager-stage10/comparator/voyager1-io-comparator-1920x1080.png) | [1920×1080](../evidence/voyager-stage11/comparator/voyager1-io-photo-1920x1080.png) · [1366×768](../evidence/voyager-stage11/comparator/voyager1-io-photo-1366x768.png) · [1280×720](../evidence/voyager-stage11/comparator/voyager1-io-photo-1280x720.png) · [768×1024](../evidence/voyager-stage11/comparator/voyager1-io-photo-768x1024.png) |
| Neptuno con Voyager 2 | [Etapa 10](../evidence/voyager-stage10/after/voyager2-neptune-1920x1080.png) | [Etapa 11, 1920×1080](../evidence/voyager-stage11/after/voyager2-neptune-1920x1080.png) · [320×568](../evidence/voyager-stage11/after/voyager2-neptune-320x568.png); franja **persistente** |
| Ío desde Voyager 1 | [Etapa 10](../evidence/voyager-stage10/after/voyager1-io-1920x1080.png) | [1920×1080](../evidence/voyager-stage11/after/voyager1-io-1920x1080.png) · [320×568](../evidence/voyager-stage11/after/voyager1-io-320x568.png); mosaico **persistente** |
| Titán | [Etapa 10](../evidence/voyager-stage10/after/voyager1-titan-1920x1080.png) | [1920×1080](../evidence/voyager-stage11/after/voyager1-titan-1920x1080.png) |
| Planetas interiores | [Mercurio Etapa 10](../evidence/voyager-stage10/after/inner-mercury-phase-1920x1080.png) | [Mercurio](../evidence/voyager-stage11/after/inner-mercury-phase-1920x1080.png) · [Tierra](../evidence/voyager-stage11/after/inner-earth-1920x1080.png) |
| Tres apartados a 320×568 | Sin captura previa de este tamaño | [Sistema Solar](../evidence/voyager-stage11/after/solar-overview-320x568.png) · [Experimental](../evidence/voyager-stage11/after/experimental-overview-320x568.png) · [Histórico](../evidence/voyager-stage11/after/voyager1-io-320x568.png) |
| Cortes SPK | [Etapa 08](../evidence/voyager-stage8/browser/) | [V1 antes](../evidence/voyager-stage11/gaps/v1-antes-1920x1080.png) · [V1 sin datos](../evidence/voyager-stage11/gaps/v1-sin-datos-1920x1080.png) · [V1 después](../evidence/voyager-stage11/gaps/v1-despues-1920x1080.png) · [V2 antes](../evidence/voyager-stage11/gaps/v2-antes-1920x1080.png) · [V2 sin datos](../evidence/voyager-stage11/gaps/v2-sin-datos-1920x1080.png) · [V2 después](../evidence/voyager-stage11/gaps/v2-despues-1920x1080.png) |
| Primera persona y regreso exterior en corte | [Etapa 08](../evidence/voyager-stage8/browser/) | [V1 antes](../evidence/voyager-stage11/gaps/v1-primera-persona-antes-1920x1080.png) · [V1 en corte](../evidence/voyager-stage11/gaps/v1-primera-persona-corte-1920x1080.png) · [V2 antes](../evidence/voyager-stage11/gaps/v2-primera-persona-antes-1920x1080.png) · [V2 en corte](../evidence/voyager-stage11/gaps/v2-primera-persona-corte-1920x1080.png) |

En todos los tamaños se inspeccionaron encabezado, tiempo, escena, selector, inspector y controles principales. No se observó desbordamiento horizontal del comparador. El cuerpo en B es un render WebGL vivo, no un PNG insertado. Las capturas de 320×568 muestran la escena con poco espacio disponible; los textos de detalle de A requieren desplazamiento dentro de su tarjeta.

## Pruebas y preservación científica

- `node --test tests/*.test.mjs`: **108/108**, incluido el test nuevo de la conversión exacta de 0,917564° y los aspectos de las seis resoluciones. [Salida completa](../evidence/voyager-stage11/tests-full.txt). Una ejecución simultánea a la captura WebGL falló exclusivamente en un límite de rendimiento experimental; se repitió sin carga concurrente y pasó sin cambiar la prueba.
- `node scripts/audit-voyager-stage8.mjs`: **49 conjuntos y 10 SPK originales** con SHA-256 correctos. [Resultado](../evidence/voyager-stage11/audit-result.json). El `evidence/voyager-stage8/audit.json` local se restauró tras la auditoría; SHA-256 antes/después `3fd453b66ba104baf8051967fb5891d991afeb945f7313ae73d1a028c58967c3`.
- `npm run build`: correcto, 82 módulos. [Salida](../evidence/voyager-stage11/build.txt). Persiste el aviso no bloqueante de bundle mayor a 500 kB.
- La prueba matemática existente conserva las nueve aproximaciones lunares, seis vectores directos planetarios y los dos cortes SPK. La ejecución en navegador de reproducción y primera persona se consigna en la evidencia de cortes de esta etapa.
- `node scripts/audit-voyager-stage8-browser.mjs`, con Chrome y la salida dirigida a esta etapa: **18 estados antes/durante/después**, **5 grupos de interacciones**, **0 errores** en 1920×1080, 1366×768 y 390×844. [Resultados JSON](../evidence/voyager-stage11/gaps/browser-results.json) y [capturas de los cortes](../evidence/voyager-stage11/gaps/). En los dos huecos `spk_segment_transition` no existe posición renderizada; la cámara sale de primera persona y el avance se pausa. La reproducción se reanuda con cobertura posterior. También se probaron retroceso, cambio de velocidad, vista cinematográfica y cambio entre los tres apartados.

## Límites y recomendación

La franja de Neptuno, la costura de Ío y la falta de hora/orientación instrumental exactas de ciertas fotografías siguen abiertas. Las capturas WebGL se tomaron con renderizado por software de Chrome; esto valida interacción y composición, no rendimiento de GPU ni equivalencia radiométrica con NASA Eyes. Las seis resoluciones se evaluaron como viewports CSS con DPR 1. El FOV instrumental se conserva geométricamente, pero el zoom 3D se declara una ayuda de observación. La continuidad global de Voyager 1 y Voyager 2 **no está certificada** y sus cortes permanecen visibles.

Antes de una nueva mejora cartográfica, buscar un atlas histórico observado de Neptuno con proyección y época verificables, y para Ío un mosaico Voyager documentado de mayor resolución. Validar CK/IK y tiempos de captura antes de reclamar coincidencias del comparador. Mantener el control explícito de trayectorias y los huecos SPK.
