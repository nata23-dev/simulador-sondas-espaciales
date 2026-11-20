# Sistema visual del simulador

**Estado:** inventario del CSS y de capturas existentes, 17-11-2026; actualizado el 18-11-2026 con la identidad de la etapa 14.1 ([detalle](STAGE14_1_VISUAL_IDENTITY.md)). Esta guía describe la identidad efectiva y orienta cambios futuros; no autoriza rediseños ni altera cálculos. Leer con [contexto](PROJECT_CONTEXT.md), [arquitectura](ARCHITECTURE_MAP.md) y [etapas](DEVELOPMENT_ROADMAP.md).

## Filosofía y referencia

La escena espacial 3D es protagonista. La información científica aparece cerca de la acción, con procedencia y límites legibles; búsqueda, inspector y herramientas se abren a demanda. El lenguaje oscuro, la luz contenida y el acento dorado apoyan una exploración inmersiva y cinematográfica sin prometer una fotografía científicamente idéntica. [NASA Eyes](https://science.nasa.gov/eyes/) es referencia externa de exploración 3D de datos e imágenes y navegación temporal. Es **inspiración de calidad, claridad y flujo**, no un paquete gráfico ni una especificación que deba copiarse. La identidad del proyecto ya existe en CSS y en las capturas del repositorio.

## Tokens y medidas observados

Los valores siguientes se leen de [src/style.css](../src/style.css), [workspace-layout.css](../src/ui/workspace-layout.css), [timeline-layout.css](../src/ui/timeline-layout.css) y [experimental-laboratory.css](../src/ui/experimental-laboratory.css). No todos son variables CSS; los colores de componentes están escritos en sus selectores.

| Papel | Valor implementado | Ubicación |
| --- | --- | --- |
| Fondo y texto base | `#030406`, `#e8eaed` | `:root` de `src/style.css` |
| Fuente | `"Segoe UI Variable", "Aptos", "Segoe UI", system-ui, sans-serif`; sin fuente web declarada | `:root` de `src/style.css` |
| Atenuado, línea, superficie | `--muted:#989da5`, `--line:rgba(255,255,255,.09)`, `--surface:rgba(12,14,18,.82)` | `src/style.css` |
| Acento principal | `--accent:#d3bd91`; también bordes/velos con alfa `#d3bd91..` | `src/style.css` y CSS de UI |
| Marco activo de exploración | `--surface:#111316f5`; cabecera `#08090ce8`; inspector `#101215f5` | `workspace-layout.css` |
| Laboratorio | fondo radial `#15243b → #080d16 → #070a10`; panel `#0b111cef`; escena `#080d16`; texto `#e7eaf0` | `experimental-laboratory.css` |
| Estados | verde `#9ed9be` / `#a9e2c5`; error `#ffad9d`; métricas doradas `#f0e2c6`; foco `#dcc38d` en laboratorio | `experimental-laboratory.css` |
| Base de botones | `min-height:40px`, `padding:9px 14px`, radio `24px`, texto `11px`, transición `0.18s` | `src/style.css` |
| Iconos | SVG de trazo, `18×18px`, `stroke-width:1.5`; símbolos en `index.html`, recurso `public/icons.svg` | `src/style.css`, `index.html`, `public/icons.svg` |
| Cabecera y escena | cabecera de marco `74px` de alto con `24px` laterales; escena `inset:0`; móvil hasta 760px: cabecera `100px` | `workspace-layout.css`, `src/style.css` |
| Inspector | lateral de `360px`, `right:24px`, `top:158px`, `bottom:146px`; panel `12px` de radio; contenido `16px` | `workspace-layout.css` |
| Hangar | cuadrícula `minmax(235px,20%) minmax(0,1fr) minmax(275px,23%)`, `gap:12px`, `padding:12px`; panel radio `12px` | `experimental-laboratory.css` |
| Planificador / Centro | planificador `23% / flexible / 27%`; Centro `22% / flexible / 25%`, ambos con `gap:10px` | `experimental-laboratory.css` |

La tipografía usa contraste de tamaños más que muchas familias: rótulo `.eyebrow` de `9px`, seminegrita y espaciado `.17em`; título de escena del marco `clamp(22px,2.4vw,34px)` y peso `350`; título de laboratorio `clamp(20px,2vw,29px)` con peso `400`; cabeceras de panel del laboratorio `18px`; datos y controles compactos de `10–12px`. Las medidas son CSS del estado actual, **no** mínimos recomendados universales. Los paneles combinan borde claro semitransparente, fondo translúcido, sombra negra y `overflow:auto` interno. La decoración del espacio incluye gradiente de viñeta sobre la escena, estrellas, mapas de planetas/lunas y luz solar en Three.js.

## Capa común de las etapas 14 y 14.1

Desde la etapa 14, [src/ui/theme.css](../src/ui/theme.css) se importa **al final** de `src/main.js` y unifica la presentación sin reescribir las hojas anteriores. La tabla anterior describe las bases que siguen existiendo debajo. Detalle: [etapa 14](STAGE14_UI_UX_SHOWCASE.md) y [etapa 14.1](STAGE14_1_VISUAL_IDENTITY.md).

En la 14.1 la identidad pasa de tonos azulados a negro y grafito neutros, con color solo cuando significa algo (criterio inspirado en NASA Eyes, sin copiar sus recursos):

- un color por cuerpo;
- azul para la acción principal;
- oro para naves, misiones, fechas y progreso;
- verde y naranja para el tiempo en curso o en pausa.

La tipografía es Inter, alojada en `src/ui/fonts/`.

| Papel | Token(s) |
| --- | --- |
| Espacio | `--space-950 #000`, `--space-900`, `--space-850` |
| Paneles | `--panel` (grafito translúcido), `--panel-raised #1d1d20`, `--panel-solid #141416`, `--field #0e0e10`; vidrio `--glass` (desenfoque 16px) |
| Líneas | `--line-soft`, `--line-strong`, `--line-focus` (`--line` apunta a `--line-soft`) |
| Texto | `--text-1 #fff` principal, `--text-2` secundario, `--text-3` rótulos, `--text-4` créditos |
| Acción principal | `--action #3f6fe8`, `--action-strong` |
| Misiones y naves | `--gold #d6a85c` (= `--accent`), `--gold-strong`, `--gold-soft`, `--gold-line` |
| Foco y procedencia | `--blue #7fb2ff`, `--blue-soft`, `--blue-line`; `:focus-visible` azul |
| Tiempo | `--live #46d38a` (en curso), `--paused #ff9f45` (en pausa) |
| Estados | `--ok`, `--warn`, `--bad` |
| Cuerpos | `--body-<Nombre>` (Sol, planetas, lunas, `voyager-1`, `voyager-2`, `experimental-probe`); mismos valores en `PlanetLabels.js` y en las órbitas de `SolarSystem.js` |
| Tipografía | `--font-ui` Inter 300–700; rótulos en mayúsculas espaciadas; texto de lectura ≥ 12px; cifras tabulares |
| Forma y movimiento | `--r-sm/md/lg` 8/12/16px; `--shadow-1/2`; `--ease`; `--dur-fast` 140ms, `--dur` 240ms |

Reglas de la capa: las bases de botones y campos usan `:where()` (especificidad cero) para que las reglas específicas previas sigan mandando; las animaciones (`ui-enter`, `ui-pop`, `hud-phase`, `ui-spin`) se reducen a 1 ms con `prefers-reduced-motion`; la cabecera no usa `backdrop-filter` porque crearía un bloque contenedor para el panel fijo del mapa de áreas. Componentes nuevos: mapa de áreas (`.app-navigator`, `#app-nav-panel` en `#app`), ruta y contexto del laboratorio (`.lab-breadcrumb`, `.lab-context`, `.lab-nav-group`), HUD y barra de reproducción del Centro (`.mc-hud`, `.mc-transport`, `.mc-track`, `.mc-tick`), interruptores de panel (`.mc-layout-toggles`, `data-console`/`data-telemetry` en `#lab-mission-center`), indicador `button[aria-busy=true]` y estados vacíos de resultados. Cortes propios: 1280, 1180, 1100, 820, 760, 560 y 420 px.

Componentes de la 14.1:

- paleta de búsqueda global: `#command-palette`, que se abre con Ctrl/⌘+K, `/` o «Buscar»;
- portada «Misiones destacadas» (`#featured-panel`);
- ruta de la cabecera (`.app-crumb`);
- indicador del tiempo (`.temporal-state[data-state]`);
- en los formularios del laboratorio: cifras clave (`.lab-kpis`), resúmenes de sección (`.section-summary`), tono del veredicto (`data-hero-tone`) e interruptores (`input[type=checkbox]` sin `.keep-native`).

La 14.1 añade cortes por alto: ≤ 860 px compacta las tarjetas destacadas.

Componentes de la etapa 15 ([detalle](STAGE15_HERITAGE_HANGAR.md)). Usan los mismos tokens; el oro se reserva para las sondas y el verde, el naranja y el rojo para los estados.

- Hangar:
  - selector de modo `[data-hangar-mode]`;
  - tarjetas `.lab-probe-card`;
  - ficha `.lab-history-sheet` con `.lab-facts`;
  - insignias de calidad `.lab-quality[data-quality=documented|secondary|derived|estimated|unknown]`.
- Ingeniería:
  - veredicto `#lab-assessment[data-tone]`;
  - tabla de energía `.lab-power-table`;
  - compatibilidades agrupadas por tipo y gravedad.
- Menú «Vista»: perfiles de calidad `#quality-controls` (`.menu-pill-group--quad`, `.menu-note`).
- Planificador de misión completa:
  - secciones «Energía eléctrica» (`#im-power`) y «Comparación» (`#im-compare`);
  - nota del escenario (`#im-scenario-note`).

En la ficha histórica, los dos botones pasan a una sola columna cuando no caben dos de 150 px.

Cambios de la etapa 15.1 ([detalle](STAGE15_1_NASA_FLEET.md)):

- Se retiran el selector de modo `[data-hangar-mode]`, el catálogo de piezas y los controles de montaje. Sus selectores CSS quedan sin efecto.
- Cabecera: selector de la sonda activa `#lab-ctx-probe` (borde y texto dorados) junto al resumen `#lab-ctx-design`.
- Tarjetas de la flota: marca `.lab-probe-active` en la sonda activa.
- Crédito del modelo `.lab-model-credit`: enlaces en azul.
- Planificador de misión completa: el grupo «2 · Vehículo» muestra solo la sonda activa (`#im-design`); se retiran `#im-module*`, `#im-lander` e `#im-landing`, y la pestaña «Descenso y aterrizaje».
- Estado del modelo 3D `#lab-assembly-status[data-state=nasa|cargando|procedural]`: dorado si es el oficial, gris mientras carga y naranja si se usa el respaldo procedimental.

Cambios de la etapa 16 ([detalle](STAGE16_COHERENCE.md)):

- Barra de secciones del laboratorio en tres grupos numerados (`.lab-nav-group` con su rótulo `.lab-nav-step`): Elegir sonda, Planificar (un botón por modalidad, `data-planner-mode`) y Reproducir. Se retira la segunda fila `.lab-planner-modes`. El botón `.lab-guide-launch` (píldora dorada) va a la derecha. Por debajo de 1340 px la barra pasa a dos filas, y por debajo de 560 px el botón ocupa todo el ancho.
- Tarjeta de bienvenida `.lab-welcome` (borde y fondo dorados suaves) en el Hangar.
- Misión guiada `.lab-guide`: tarjeta fija abajo a la derecha (370 px; por debajo de 560 px ocupa el ancho, con altura máxima del 48 % de la ventana y desplazamiento), progreso con segmentos dorado/verde, estado con texto (`#lab-guide-status[data-state=done|hint|wait]`) y modo minimizado. El control indicado lleva `.lab-guide-target`: contorno dorado con pulso, sin pulso si se pide movimiento reducido.
- Resultado esperado `.im-outcome[data-tone=ok|warn|idle]`: borde izquierdo verde o ámbar, siempre con texto. Se usa también en el consejo de Tierra–Luna (`#mission-probe-advice`).
- «Misión completa»: pasos `.im-howto` y ajustes plegados en `details.im-advanced`.
- Lanzamiento: selector `#ln-launcher` y nota `#ln-launcher-hint`.
- Cabecera: el resumen `#lab-ctx-design` puede pasar a una segunda línea. Centro de Misión: en pantallas de más de 760 px, su fila superior no se parte en dos.
- Se eliminan los selectores sin uso de 15/15.1 (`.lab-component*`, `.lab-part-*`, `.lab-replacement*`, `.lab-hangar-modes`, `#lab-landing`/`#ld-*`, `#lab-load-preset`, `#lab-import`, `#lab-export`, `[data-section="engineering"]`).

## Componentes y comportamiento

| Componente | Implementación y regla que conservar |
| --- | --- |
| Navegación principal | `#app-mode-switcher` en `index.html`; `WorkspaceLayout.js` reubica controles; cabecera fija de `workspace-layout.css`. Activo por `aria-pressed` con velo dorado y subrayado interior. Tres modos visibles. |
| Menús y búsqueda | `#workspace-dock` y `.tools-content`; búsqueda de destinos y herramientas a demanda. En escritorio dock lateral; en móvil controles de 44px por encima del tiempo. No tapar el objeto enfocado. |
| Inspector | `#context-inspector` con pestañas Telemetría, Historia, Fotografías y Cámaras según modo; estados `closed`, `half`, `expanded`. Cerrado queda `inert`; teclado y foco se gestionan en `WorkspaceLayout.js`. En ≤760px es panel inferior, con scroll interno. |
| Línea temporal | `TimelineLayout.js`, `TimelineControls.js`, `HistoricalModeControls.js` y `timeline-layout.css`. Transporte y fecha siempre reconocibles; velocidad/opciones/hitos en desplegables; hito activo usa `aria-current=step`. El control histórico distingue UTC mostrado y TDB interno. |
| Datos y telemetría | `PlanetInfoPanel.js`, `MoonInfoPanel.js`, ficha Voyager y `MissionControlCenter.js`. Etiquetas pequeñas, cifras alineadas, unidad y época visibles, `No disponible` donde falta estado. Datos físicos no se recalculan en CSS. |
| Cámaras | botones de cámara exterior, desde sonda y recreación histórica; el Centro ofrece cinco botones (`overview`, `exterior`, `onboard`, `destination`, `cinematic`). Activo por `aria-pressed`; FOV y apuntado se explican. No sustituir orientación desconocida por una supuesta toma real. |
| Fotografías y comparador | tarjeta A de foto NASA con crédito y fuente, tarjeta B de render WebGL con aviso de fidelidad; en móvil se alternan A/B. La selección y cierre deben restaurar fecha/cámara del recorrido. `workspace-layout.css` y `style.css`. |
| Hangar / Ingeniería | panel de catálogo, escena de ensamblaje y panel de métricas. Piezas seleccionadas con borde dorado; campos oscuros `#111a29`, `min-height:37px`; botones del laboratorio con radio `7px` y alto `38px`. Catálogo y métricas tienen scroll propio en escritorio. |
| Planificador | condiciones a la izquierda, trayectoria Three.js en el centro, evaluación a la derecha. Veredicto tiene estados visuales verde, ámbar o rojo; se acompaña de texto del alcance del modelo. |
| Centro de Misión | control temporal/eventos, escena con barra de cámaras, telemetría. Línea recorrida y futura, épocas y masa se derivan del mismo resultado calculado. El color de línea es presentación; no cambia la trayectoria. |

Los controles principales usan botones HTML y SVG propios; `aria-pressed`, `aria-selected`, `aria-current`, `role=status` y `:focus-visible` ya expresan estado. `prefers-reduced-motion:reduce` aparece en `workspace-layout.css` y `src/style.css`. Las transiciones de botones e inspector son de `0.18s`; `src/style.css` también tiene `@keyframes panel-in`. Respetar la reducción de movimiento al ampliar animaciones. La escena emplea interpolación/encuadre de cámara propios de Three.js; su movimiento no es una fuente de datos científicos.

## Responsividad y composición

| Rango existente | CSS observado | Criterio al evolucionar |
| --- | --- | --- |
| Escritorio amplio | Cabecera de 74px, escena completa, dock lateral, inspector de 360px; laboratorio de tres columnas. | Mantener horizonte 3D y controles secundarios discretos. Comprobar que inspector/comparador no oculten el objetivo. |
| Laptop / 1280–1100px | Ajustes en `workspace-layout.css` a 1050px y en laboratorio a 1100px; paneles laterales mínimos de 205–230px. | Evitar truncado de datos, medir ancho real de las tres columnas. |
| Tableta ≤820px | Laboratorio, Planificador y Centro se apilan con visor primero; `#experimental-lab` desplaza verticalmente. | Mantener visor accesible y scroll de controles/telemetría sin bloquear gestos 3D. |
| Móvil ≤760px | Cabecera de 100px en dos filas; inspector inferior; tiempo junto al borde inferior; comparador adaptado. | Cuidar zonas seguras, foco, controles de 44px y área visible de escena. |
| 420px y 370/320px | Reglas compactas en los cuatro CSS; laboratorio de una columna y escena de 34dvh; Centro de 38dvh, cámaras con scroll horizontal; barra histórica reduce botones. `body` tiene `min-width:320px`. | Probar 320×568 de verdad. El scroll horizontal de cámaras es deliberado; no permitir desbordamiento de página ni ocultar el botón de retorno. Evitar texto/cámaras encima de la nave. |

La captura existente de **12C a 320×568** muestra una composición muy densa y botones de cámara parcialmente fuera del área visible hasta desplazarse. Es una observación de imagen estática, no un defecto funcional certificado ni una auditoría actual. Tratarla como motivo para una revisión independiente de interacción antes de aprobar 12C.

## Recursos y composición científica

`src/graphics/SolarSystem.js` y `src/graphics/README.md` documentan centros proporcionales; `ScaleModeConfig.js` alterna radios científicos/exploratorios sin mover centros. Las órbitas planetarias de exploración son ilustrativas; la trayectoria de misión lunar es calculada y se rotula de forma distinta. `Sun.js`, `SolarIllumination.js`, `PlanetFactory.js`, `MoonVisuals.js`, `StarField.js`, `HeliosphereVisual.js` y `SpaceProbeVisual.js` construyen el espacio; fotos, texturas y modelo se encuentran en `public/`. [Créditos de texturas](../public/textures/README.md) y [lunas](../public/textures/moons/README.md). La luz de inspección opcional de Ío y la exposición visual no son calibración fotométrica; véanse [10](VOYAGER_STAGE10_VISUAL_PHOTOMETRY.md) y [11B](VOYAGER_STAGE11B_FINAL_REFINEMENT.md).

## Referencias visuales auténticas

Capturas del proyecto ya existentes, inspeccionadas para este inventario; **no se generó ninguna**. Las dos primeras referencias históricas de UI pertenecen a una fase anterior y deben cotejarse con CSS actual. Las capturas 12A.1–12C existen localmente pero están **sin seguimiento Git** en este corte: un clon nuevo no las tendrá hasta incorporarlas por un proceso autorizado.

| Vista | Referencia | Qué muestra |
| --- | --- | --- |
| Sistema Solar | [exploración](../evidence/stage3/Antes/30-modo-exploracion.png) y [lunas](../evidence/stage6/01-sistema-solar-lunas.png) | Escena, navegación y cuerpos; referencia de etapa, no captura nueva del estado actual. |
| Histórico y comparador | [comparador NASA / 3D](../evidence/stage3/Regresion/13-comparador-nasa-3d.png), [corte Voyager móvil](../evidence/voyager-stage11b/gap-regression/v2-sin-datos-390x844.png) | Tarjetas A/B, tiempo y representación honesta de una ausencia de datos. |
| Constructor e Ingeniería | [Hangar 12A.1](../evidence/stage12a1/09_desktop_1920x1080.png) | Catálogo, nave 3D, guardado y métricas. Local sin seguimiento. |
| Planificador | [12B escritorio](../evidence/stage12b/11a_desktop_1920x1080.png), [12B 320×568](../evidence/stage12b/11e_mobile_320x568.png) | Tres columnas y apilamiento móvil. Locales sin seguimiento. |
| Centro de Misión | [12C escritorio](../evidence/stage12c/13a_desktop_1920x1080.png), [12C 320×568](../evidence/stage12c/13e_mobile_320x568.png) | Controles, trayectoria, telemetría y densidad móvil; **no acredita aprobación independiente de 12C**. Locales sin seguimiento. |

Hay además capturas en `evidencias/` y `capturas/` ignoradas por Git. No usarlas como única referencia transferible. Las imágenes oficiales NASA usadas por el producto están en `public/images/voyager/`; NASA Eyes es referencia externa, no un recurso gráfico del repositorio.

## Reglas de evolución visual

**Conservar:** escena 3D primaria, jerarquía oscura/dorada, telemetría con unidades y estados, procedencia fotográfica, paneles a demanda, controles de teclado/tacto y distinción entre escala/datos físicos y ayudas visuales. Preferir ajustes de `min-width:0`, envoltura y scroll vertical donde una pantalla se desborda. Revisar tanto imagen como estado de DOM, cámara y datos al verificar cambios.

**Inconsistencias o límites actuales:** `src/style.css` y `workspace-layout.css` contienen reglas históricas y posteriores para las mismas vistas; comprobar cascada real antes de cambiar. Las tipografías de 9–11px en laboratorio pueden requerir evaluación de legibilidad en 320px. Algunas diferencias de textura, iluminación y foto/3D siguen documentadas en 11/11B; no ocultarlas alterando efemérides. 12C espera auditoría independiente.

**Posibles mejoras, no aprobadas aquí:** mejorar legibilidad de datos y cámaras en móvil, reducir solapes durante comparador/recorrido, afinar transiciones y criterios de foco, ofrecer encuadres cinematográficos más claros y explicar cada estado de fidelidad. Cualquier rediseño transversal, nuevo token global, sustitución de modelo/textura o cambio del lenguaje visual necesita alcance y autorización propios. Para una corrección de una pantalla, modificar sólo lo necesario y preservar las demás vistas.
