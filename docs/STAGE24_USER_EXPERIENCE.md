# Etapa 24 · Experiencia de uso del Centro de Misión

Estado: **implementada y probada localmente (21-11-2026)**. Auditoría: Claude, que también la implementó ([informe](STAGE24_AUDIT_CLAUDE.md)).

Alcance: los ocho puntos del §7 de [ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md](ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md) y la consolidación de los `!important` del CSS que la etapa 19 dejó para esta. **Solo presentación**: no cambia física, constantes, marcos, integradores, efemérides, datos, hashes, kernels, fotografías ni modelos. La única línea fuera de la interfaz añade tres campos descriptivos a las fases de captura de `IntegratedMission.js` (objetivo pedido, radio y nombre del cuerpo), que ya estaban en la entrada del cálculo; ningún número del resultado cambia.

## Qué cambia

| # | Punto del §7 | Implementación | Archivos |
| --- | --- | --- | --- |
| 1 | Resultado de la captura a la vista | En «Resultados», cada captura de la misión completa muestra su **órbita final a escala**: el cuerpo (con su color `--body-*`), la órbita alcanzada (dorada) y la objetivo (discontinua), con periapsis y apoapsis marcados, una tabla «objetivo / alcanzada» de altitudes, la excentricidad y el periodo. Si la captura no deja una órbita cerrada, lo dice y no dibuja nada. El esquema declara que está en el plano de la órbita y no muestra su orientación | `MissionControlCenter.js` (`captureCard`), `MissionPlaybackAids.js` (`esquemaOrbita`), `IntegratedMission.js` (`objective`, `bodyRadiusKm`, `bodyName`) |
| 2 | Atajos de teclado | **Espacio** reproduce o pausa, **← / →** van al evento anterior o siguiente e **Inicio / Fin** llevan al principio o al final del cálculo. No actúan con modificadores, en campos de texto o listas, en el deslizador ni en pestañas; el espacio tampoco actúa sobre un botón enfocado (lo pulsaría dos veces). **Esc** cierra primero la hoja inferior y después la vista inmersiva | `MissionPlaybackAids.js` (`accionTeclaCentroMision`), `MissionControlCenter.js` (`onKey`), `ExperimentalLaboratory.js` (Esc respeta `defaultPrevented`) |
| 3 | Marcas agrupadas y zoom temporal | Las marcas que caerían a menos de 12 px se **agrupan** en una con su número; al pulsarla, la barra se **amplía** alrededor del grupo (su intervalo ocupa la mitad central, al menos 10 s) y aparece «Toda la misión» para volver. Si los eventos son simultáneos, no se amplía: salta al primero y los nombra. Si la reproducción sale del intervalo, la barra vuelve sola a la misión completa. El deslizador «Instante de misión» sigue cubriendo toda la misión. Las marcas se recalculan al cambiar el ancho de la barra | `MissionPlaybackAids.js` (`agruparMarcas`, `ventanaZoom`), `MissionControlCenter.js` (`renderTicks`, `zoomTo`) |
| 4 | Rótulos que eviten los controles | El Centro de Misión entrega como **obstáculos** la pastilla de estado, la fila superior, la barra de cámaras, el HUD y la barra de reproducción. Un rótulo de planeta, satélite o sonda que caería debajo se coloca bajo su marcador y, si tampoco cabe, se oculta (el marcador sigue y se puede pulsar). La escena lee los obstáculos como mucho cada 200 ms | `PlanetLabels.js` (`posicionEtiquetaLibre`), `SolarSystem.js`, `MissionControlCenter.js` (`mainSceneFrameZone`) |
| 5 | Comparación con la misión real | En «Resultados», una ficha **«Lo que hizo la sonda real»** con los hitos documentados de la sonda de la flota usada, su fuente y un resumen que no deja lugar a dudas: con Cassini → Marte, «La sonda real no fue a Marte: Cassini-Huygens tuvo como destino Saturno. Esta misión es un ejercicio del laboratorio, no una reconstrucción histórica». Si la sonda real sí pasó por el destino (Dawn y Marte), lo indica y recuerda que fecha, ruta y resultado simulados no son los históricos | `RealMissionHistory.js` (nuevo), `MissionControlCenter.js` (`realMissionCard`) |
| 6 | Móvil | En pantallas de 820 px o menos, la reproducción **empieza en vista inmersiva** (una vez por misión: si se sale, no se vuelve a imponer). Un botón «Panel» de la barra de reproducción abre el panel como **hoja inferior** (64 % de la altura como máximo) con sus propias pestañas y botón de cierre; elegir una pestaña sincroniza la del laboratorio, el foco va a la pestaña activa al abrir y vuelve a «Panel» al cerrar | `MissionControlCenter.js` (`setSheet`, `autoImmersive`), `ExperimentalLaboratory.js` (`onPane`), `lab-shell.css` |
| 7 | Encabezados | El título del panel lateral (`#mc-pane-title`) deja de ser un `h3` que repetía el `h2` del laboratorio («Reproducción», «Telemetría»…) y pasa a ser un rótulo `p.lab-panel-title`, que sigue nombrando el panel (`aria-labelledby`). Un solo encabezado por sección | `MissionControlCenter.js`, `experimental-laboratory.css`, `theme.css`, `lab-shell.css` |
| 8 | Unidades y escalas | En «Telemetría», un selector **Auto / km / AU** para las distancias derivadas («Auto» conserva lo de antes; 1 AU = 149 597 870,7 km, IAU 2012). La posición del estado y las altitudes siguen en km, y se dice. Nueva fila **«TDB − UTC»** con la diferencia en el instante reproducido. Al pasar por la fecha del HUD, una explicación: UTC es la hora civil y los cálculos usan TDB. El glosario explica «Fecha UTC» (las fechas futuras son una predicción) y «TDB − UTC» | `MissionControlCenter.js` (`distance`, `tdbMinusUtcText`), `LabGlossary.js` |

Además, el **anillo de foco de los campos de fecha**, pendiente desde la etapa 17. Chrome tiene una cuarta parada del tabulador dentro de `input[type=date]`: el botón del calendario, en la sombra interna del campo. En esa parada el campo es `document.activeElement`, pero no cumple `:focus` ni `:focus-visible`, solo `:focus-within`. Los campos de fecha usan ahora `:focus-within` (`theme.css`), así que muestran el anillo en sus cuatro paradas.

Y el **pie de escala del Centro de Misión**, que ya en 17.1 perdía su primera línea a 320 px («Sistema Solar principal: 32 unidades = 1 AU · radios 1:1…»). Con 820 px o menos estaba limitado a 48 px de alto, con el desbordamiento oculto y alineado abajo. Ahora no se recorta: un `ResizeObserver` publica su altura real en `--mc-foot-h` y la barra de reproducción se coloca 6 px por encima (`max(62px, …)`, o `max(58px, …)` con 420 px o menos). En escritorio no cambia nada. El pie cuenta además como obstáculo para los rótulos.

### Fuentes de la misión real (consultadas el 21-11-2026)

| Sonda | Hitos | Fuente |
| --- | --- | --- |
| Voyager 2 | Lanzamiento 1977-08-20; Júpiter 1979-07-09; Saturno 1981-08-26; Urano 1986-01-24; Neptuno 1989-08-25 | [NSSDCA 1977-076A](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1977-076A) |
| Voyager 1 | Lanzamiento 1977-09-05; Júpiter 1979-03-05; Saturno 1980-11-12 | [NSSDCA 1977-084A](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1977-084A) |
| Cassini-Huygens | Lanzamiento 1997-10-15; Venus 1998-04-26 (234 km) y 1999-06-24 (600 km); Tierra 1999-08-18; Júpiter 2000-12-30; llegada a Saturno 2004-07-01 UTC | [NASA Science, Quick Facts](https://science.nasa.gov/mission/cassini/quick-facts/) |
| Dawn | Lanzamiento 2007-09-27 11:34 UTC; Marte 2009-02-18; Vesta 2011-07-16 a 2012-09-05; Ceres 2015-03-06; fin de las comunicaciones 2018-10-31 | [NSSDCA 2007-043A](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2007-043A) |
| Juno | Lanzamiento 2011-08-05 16:25 UTC; Tierra 2013-10-09 (≈ 559 km); inserción en Júpiter 2016-07-05 | [NSSDCA 2011-040A](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2011-040A) |

Las fechas coinciden con las que citaba el plan para Cassini. Son datos de contexto: no alimentan ningún cálculo.

## Consolidación de `!important`

La etapa 19 contó 92 declaraciones `!important` y dejó su consolidación para esta etapa, con revisión visual. Quedan **26, todas utilidades**: ocultar con `[hidden]` (10), texto solo para lectores de pantalla `.sr-only` (9) y `prefers-reduced-motion` (7). Las otras 66 se resolvieron así:

- Retiradas las que no ganaban a nada (la mayoría de `theme.css`: botones principales, conmutadores, tarjetas destacadas, barra de cámaras, botón ocupado, objetivo de la misión guiada…).
- Sustituidas por especificidad donde había un competidor real, localizado con el método de abajo:
  - `.fm-card:hover` → `.fm-card:hover:not(:disabled)`, que gana a `button:hover:not(:disabled)` de `style.css`;
  - nota de rigor de la tarjeta de lanzamiento: `.historical-launch-card .launch-card-honesty` y `#app #context-inspector .launch-card-honesty`, que ganan a `.historical-launch-card p` y a `#app #context-inspector :is(p,li)`;
  - resultados de búsqueda del inspector: `#app #context-inspector #context-search-results { display:flex }`, que gana a la rejilla de `workspace-layout.css`;
  - etiqueta y hueco de imagen de los documentos: `#experimental-lab .lab-doc-card > .lab-doc-kind` y `> .lab-doc-missing`, que ganan a `.lab-doc-card > :not(img)`.
- Eliminada la regla `.lab-program`, que ningún HTML ni JS usa.

**Método** ([`scripts/css-computed-snapshot.mjs`](../scripts/css-computed-snapshot.mjs)):

- Instantánea de **38 propiedades calculadas** de **309 elementos** en **33 estados**: exploración, modo histórico y laboratorio a 1366 × 768, 390 × 844 y 1100 × 800.
- Incluye estados forzados por atributo (tarjetas destacadas plegadas, botón ocupado, objetivo de la misión guiada, cámara pulsada, documento sin imagen) y `:hover` forzado con el protocolo de depuración de Chrome.
- Transiciones y animaciones desactivadas, para comparar valores finales.
- La instantánea de referencia se tomó con las líneas originales, reconstruidas desde `HEAD` línea a línea.

Resultado: [**0 diferencias**](../evidence/stage24/css/diff.json) entre [antes](../evidence/stage24/css/antes.json) y [después](../evidence/stage24/css/despues.json). Un primer intento sin `!important` y sin ajustar especificidad dio 125 diferencias (búsqueda en lista en vez de rejilla, nota de rigor a 14 px en lugar de 9,5 px, márgenes de los documentos, fondo de las tarjetas al pasar el ratón), que son las que se corrigieron con especificidad. Una prueba nueva impide reintroducir `!important` fuera de las tres utilidades.

## Pruebas

- [`tests/Stage24UserExperience.test.mjs`](../tests/Stage24UserExperience.test.mjs), 13 pruebas:
  - agrupación de marcas y separación al ampliar; con más grupos que el máximo, se agrupa más sin perder ningún evento (D-01 de la auditoría);
  - ventana de zoom dentro de la misión;
  - atajos y sus exclusiones (campos, botones, deslizador, pestañas, modificadores);
  - geometría del esquema: foco en el cuerpo, P y A a la distancia correcta, todo dentro del lado y radio mínimo visible;
  - colocación de rótulos con obstáculos;
  - obstáculos entregados por el Centro de Misión;
  - fechas de la misión real (formato, orden, fuente de NASA y las de Cassini del plan);
  - resúmenes de la comparación;
  - encabezado del panel y glosario UTC/TDB;
  - campos de la fase de captura en la misión A1 real (Cassini → Marte), con el periapsis de 315,5 km que documentó la 17.1;
  - `!important` solo en utilidades;
  - regla de foco de los campos de fecha (la comprobación de comportamiento está en el guion del navegador).
- Suite completa: **357/357**.
- `npm run build` y la compilación para GitHub Pages (`GITHUB_PAGES=true`) correctas; `git diff --check` limpio.
- Tamaño: el módulo del laboratorio pasa de 294 kB (etapa 18) a 311 kB sin comprimir, con las etapas 24 y 25. El aviso de Vite por archivos de más de 500 kB es el de siempre: three.js, el decodificador Draco y el archivo principal.

## Verificación en el navegador

Chrome sin interfaz con la GPU real (AMD, Direct3D 11), servidor de desarrollo, [`scripts/verify-stage24-browser.mjs`](../scripts/verify-stage24-browser.mjs) ([registro](../evidence/stage24/verify-stage24-gpu.json), 12 capturas), con la misión A1 calculada con los mismos controles que el usuario:

| Comprobación | Resultado |
| --- | --- |
| Inicio → → → ← → Fin | 0 → entrada en la esfera de influencia (27 016 572 s) → inserción (27 188 873 s) → vuelta a 27 016 572 s → 27 377 841 s, el final exacto del cálculo |
| Espacio, Espacio | EN REPRODUCCIÓN → PAUSADA |
| → con el foco en el selector de velocidad | El instante no cambia (la flecha es del selector) |
| Marcas | 5 eventos en 2 marcas: salida y un grupo de 4 (esfera de influencia, inicio y fin de la inserción, fin del cálculo). Al pulsarlo, la barra pasa a 9,2 días con 3 marcas, se anuncia por `aria-live` y «Toda la misión» la restablece |
| Resultados | Esquema con 2 elipses y el cuerpo; tabla: periapsis 3 000 km pedido / 316 km alcanzado, apoapsis 100 000 / 100 000 km; excentricidad 0,9308, periodo 104,5 h. Ficha de Cassini con los 6 hitos y su fuente |
| Unidades | Auto: «1,42756 AU», «577 215 km». AU: «1,427564 AU», «0,003858 AU». km: «213 560 562 km» |
| Tiempo | «TDB − UTC: 69,182 s en este instante»; HUD «PAUSADA · 2029-10-08 · 09:25:49 UTC · …» con la explicación al pasar el puntero; glosario en «Fecha UTC», «Época TDB» y «TDB − UTC» |
| Encabezados | El título del panel es un `p`; no hay dos encabezados seguidos con el mismo texto |
| Rótulos en vista inmersiva | Mercurio, Venus, Tierra, Marte y Urano visibles; **0 solapes** con los controles, en la vista general y al final de la misión |
| Teléfono 390 × 844 | Entra en vista inmersiva sola; «Panel» abre la hoja (540 px de 844) con el foco en la pestaña activa; «Telemetría» en la hoja cambia también la pestaña del laboratorio; Esc cierra la hoja sin salir de la inmersiva; «Salir» la cierra y cambiar de pestaña no la vuelve a imponer; sin desbordamiento horizontal |
| Campo de fecha con el tabulador | `im-departure` enfocado: borde azul y sombra de 3 px |
| Errores y avisos de la página | Ninguno |

**Regresión de la etapa 17 con GPU** ([registro](../evidence/stage24/regresion17/stage17-browser-all.json)):

- recorrido completo (misión guiada, automática, flota, herramientas, 7 resoluciones, escena y modos): 102 capturas, 0 errores, sin desbordamientos;
- accesibilidad automática: 0 controles sin nombre, ARIA rotos, ocultos enfocables, imágenes sin texto alternativo o textos con contraste bajo;
- tabulador: la primera pasada repitió el pendiente de 17 (`im-departure` sin anillo). Tras la corrección, la parte `a11y` ([registro](../evidence/stage24/regresion17/stage17-browser-a11y.json)) da **0 sin anillo** en las tres etapas.

- pie de escala: tras la corrección, la parte `responsive` ([registro](../evidence/stage24/regresion17/stage17-browser-responsive.json), 42 capturas en 7 resoluciones) da 0 errores y 0 desbordamientos; a 320 × 568 el pie se lee completo.

Adaptaciones del guion de 17:

- `h.tab` usa la hoja inferior cuando la vista inmersiva está activa en pantallas estrechas, y la comprobación responsiva registra la entrada automática y la salida;
- la comprobación del anillo acepta `:focus-within` solo en los campos de fecha.

Siguiendo la política de la etapa 19, se conservan los registros JSON y 8 capturas en [`evidence/stage24/regresion17/`](../evidence/stage24/regresion17/). Las de 320 y 390 px son de la pasada posterior a la corrección del pie.

## Límites

- El esquema de la órbita está en el plano de la órbita: no muestra la inclinación ni la orientación del periapsis.
- Las marcas agrupadas se amplían en un paso; un grupo que siga junto se vuelve a pulsar.
- Los rótulos que no caben se ocultan en lugar de recolocarse en cualquier dirección. El marcador sigue visible y se puede pulsar.
- La ficha de la misión real resume hitos públicos. No compara trayectorias ni masas, y para la Voyager 2 no hay más hitos que los sobrevuelos planetarios.
- La vista inmersiva por defecto solo se aplica con 820 px o menos de ancho, una vez por misión.
- Pendiente:
  - revisión visual por una persona;
  - prueba con un lector de pantalla real (NVDA o Narrador): los anuncios y el foco solo se comprobaron leyendo el DOM;
  - prueba en un teléfono real: el gesto de la hoja inferior solo se probó con clics.
