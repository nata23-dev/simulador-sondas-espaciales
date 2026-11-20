# Etapa 14.1 — Identidad visual y experiencia de uso (fases 1, 2 y 3)

**Estado:** implementada el 18-11-2026 y verificada localmente: 259/259 pruebas, build, `git diff --check` y recorridos en Chrome sin interfaz (SwiftShader) a 1600×900, 1366×768 y 390×844, más el guion de escritorio de la etapa 14 (§6). **Pendiente:** revisión humana en un navegador con GPU y documentación visual independiente de Gemini. Es **solo presentación**: no cambia modelos físicos, efemérides, kernels, fotografías, `Voyager.glb`, resultados de 12G/13 ni pruebas. La etapa 13 sigue pendiente de auditoría.

Continúa la [etapa 14](STAGE14_UI_UX_SHOWCASE.md). Leer con el [sistema visual](UI_DESIGN_SYSTEM.md) y la [arquitectura](ARCHITECTURE_MAP.md).

## 1. Referencia y criterio

La petición fue que el simulador «se sienta como NASA Eyes»: profesional, moderno, limpio, fluido y ordenado, sin perder funciones. Se estudió [NASA Eyes on the Solar System](https://eyes.nasa.gov/apps/solar-system/#/home) en Chrome sin interfaz: capturas y valores CSS efectivos. Se tomaron **criterios**, no recursos:

- espacio negro y paneles grafito neutros;
- texto blanco y gris, con color solo cuando significa algo (cuerpos, naves, estado del tiempo, acción principal);
- títulos ligeros y rótulos en mayúsculas espaciadas;
- cabecera transparente con ruta de navegación y acciones sin borde;
- banda de tiempo abierta, con estado «en curso / en pausa»;
- un color por planeta en rótulos y órbitas;
- portada con misiones destacadas.

No se copian logotipos, nombres de producto, iconos, tipografía ni imágenes de NASA Eyes. Las únicas fotografías de la portada son imágenes Voyager de NASA/JPL que el proyecto ya incluía, con su crédito. La textura terrestre también estaba en el proyecto.

## 2. Qué cambió

| Fase | Cambio | Archivos |
|---|---|---|
| 1 · Paleta y tipografía | Tokens neutros:<ul><li>fondo `#000` y paneles grafito `#141416`/`#1d1d20`;</li><li>texto `#fff`/`#c6c6cb`/`#8d8d96`;</li><li>azul de acción `--action` para el botón principal;</li><li>oro `--gold` reservado a naves, misiones, fechas destacadas y progreso;</li><li>`--live` verde y `--paused` naranja para el estado del tiempo.</li></ul>Tipografía Inter variable 300–700, alojada en el proyecto (latín y griego). Interruptores en lugar de casillas: es el mismo `<input type=checkbox>` y su estado no cambia. | `src/ui/theme.css` (reescrita), `src/ui/fonts/` (nuevo: `inter-latin.woff2`, `inter-greek.woff2`, `OFL.txt`) |
| 1 · Cuerpos | Un color por cuerpo (`--body-*`, mismos valores en CSS y Three.js):<ul><li>rótulos en mayúsculas espaciadas, sin punto, con subrayado del color del cuerpo cuando está seleccionado;</li><li>marcadores en anillo;</li><li>arcos orbitales de referencia del color del planeta.</li></ul>La geometría, los radios y las posiciones no cambian. | `src/ui/PlanetLabels.js`, `src/graphics/SolarSystem.js` |
| 1 · Cabecera | Rótulo «SIMULADOR DE SONDAS ESPACIALES» con ruta `› Área › objeto o herramienta`, leída de títulos ya presentes. Selector de modos subrayado. «Áreas», «Buscar» y «Menú» son acciones sin borde. Degradado transparente sobre la escena; fondo negro en el laboratorio. | `src/ui/AppNavigator.js`, `src/ui/WorkspaceLayout.js`, `index.html` (iconos), `theme.css` |
| 1 · Laboratorio | Formularios en dos columnas cuando hay ancho (contenedor `labform` ≥ 460 px). Secciones plegables como tarjetas que, cerradas, muestran un resumen de sus tres primeros valores (`.section-summary`). Franja de cifras clave sobre los resultados (`.lab-kpis`). Veredicto destacado con borde de color según el texto ya mostrado (`data-hero-tone`). Filas de métricas en dos columnas en paneles anchos. Botón principal azul; «Reproducir en el Centro de Misión» con contorno dorado. | `src/ui/LabFormEnhancer.js` (nuevo), `theme.css` |
| 2 · Tiempo | Banda sin caja sobre un degradado oscuro. Indicador «En curso» (verde, pulso suave) / «En pausa» (naranja), leído del botón de reproducción existente. Fecha grande con cifras tabulares. Botón de reproducción circular. | `src/ui/TimelineLayout.js`, `theme.css` |
| 2 · Portada | Panel «Misiones destacadas» en Sistema Solar con cuatro tarjetas: Voyager 1, Voyager 2, Misión completa a Europa (etapa 13, rotulada «pendiente de auditoría») y Lanzamiento terrestre. Cada tarjeta navega con los controles existentes. Se puede contraer: el estado se recuerda en `localStorage` y en ≤ 760 px empieza contraído. Solo se muestra en exploración con el inspector cerrado. | `src/ui/FeaturedMissions.js` (nuevo), `theme.css` |
| 2 · Encuadre | La zona libre del encuadre general descuenta la portada (a la izquierda) y la columna de herramientas (a la derecha, en escritorio). Así ningún rótulo queda tapado. `calcularEncuadreVista` y su prueba no cambian. | `src/graphics/SolarSystem.js` (`obtenerZonaEncuadre`) |
| 2 · Inspector | Panel grafito con pestañas subrayadas. Lista de destinos con el color de cada cuerpo. Acontecimientos Voyager como filas (sonda, año dorado, título). Procedencia con filete azul. Modal de bienvenida y menús con la misma superficie. | `src/ui/WorkspaceLayout.js`, `theme.css` |
| 3 · Búsqueda global | Paleta de búsqueda: «Buscar», Ctrl/⌘+K o `/`. Reúne cuerpos y sondas (botones de destino existentes), las 12 áreas y acciones de vista (reiniciar, vista general, sistema interior, escala, perspectiva, inmersivo, distancias, inspector). Filtra sin tildes y se maneja con flechas, Enter y Esc. Cada opción pulsa el control original. | `src/ui/CommandPalette.js` (nuevo), `src/ui/WorkspaceLayout.js` |
| 3 · Centro de Misión | Eventos como filas (título, instante y tipo), con el evento actual marcado en oro. La cabecera de escena no parte el estado. Píldoras de cámara y contexto, transporte con botón circular, HUD grafito. | `theme.css` |
| 3 · Menú principal | Columnas «Herramientas» y «Ayuda y datos» con filas alineadas a la izquierda. Una regla heredada colocaba la primera en una segunda columna de la rejilla. | `theme.css` |

## 3. Garantías de presentación

- `LabFormEnhancer` solo **lee** el texto ya presentado en filas `.lab-metric` y en campos. Copia las cifras clave y los resúmenes de sección. El tono del veredicto se deduce de las palabras ya mostradas: solo cambia el color, nunca el texto. Ignora sus propios nodos y las actualizaciones por fotograma del Centro de Misión.
- La paleta, la portada y el mapa de áreas navegan pulsando los botones existentes (`data-mode-btn`, `data-destination`, `lab:navigate`). No crean estados de misión.
- El indicador del tiempo lee `#play-label` y `#hist-play-btn`. No controla el reloj.
- El cambio de `obtenerZonaEncuadre` solo mueve los límites del rectángulo libre de pantalla. No altera posiciones, escalas ni distancias físicas.
- Las rutas de imágenes usan `import.meta.env.BASE_URL`. La fuente usa una URL relativa que Vite reescribe con la base de GitHub Pages.
- Animaciones: `ui-enter`, `ui-pop`, `ui-fade`, `hud-phase` y el nuevo `live-pulse`. Con `prefers-reduced-motion: reduce` quedan a 1 ms y una sola iteración.

## 4. Tokens

| Papel | Token(s) |
|---|---|
| Espacio y superficies | `--space-950 #000`, `--panel` (grafito translúcido), `--panel-raised #1d1d20`, `--panel-solid #141416`, `--field #0e0e10` |
| Líneas | `--line-soft` (8 % blanco), `--line-strong` (16 %), `--line-focus` (42 %) |
| Texto | `--text-1 #fff`, `--text-2 #c6c6cb`, `--text-3 #8d8d96`, `--text-4 #64646c` |
| Significado | <ul><li>`--action #3f6fe8`: acción principal;</li><li>`--gold #d6a85c` (= `--accent`): misiones, naves, fechas y progreso;</li><li>`--blue #7fb2ff`: foco y procedencia;</li><li>`--live #46d38a`, `--paused #ff9f45`;</li><li>`--ok`, `--warn`, `--bad`.</li></ul> |
| Cuerpos | <ul><li>`--body-Sol`, `--body-Mercurio` `#a88bc9`, `--body-Venus` `#d9a443`, `--body-Tierra` `#35b4e8`, `--body-Marte` `#d97842`, `--body-Jupiter` `#e3a68c`, `--body-Saturno` `#dcc78f`, `--body-Urano` `#7fd8e2`, `--body-Neptuno` `#7b97f2`;</li><li>lunas;</li><li>`--body-voyager-1`, `--body-voyager-2`, `--body-experimental-probe`.</li></ul> |
| Tipografía | `--font-ui` Inter. Títulos de peso 300–400. Rótulos de 10–11 px en mayúsculas con 0,16–0,24 em de espaciado. Texto de lectura ≥ 12 px. Cifras tabulares. |

## 5. Defectos encontrados y corregidos en la revisión en navegador

1. **Campos del laboratorio en una sola columna.**
   - Causa: un `<details>` no reparte su contenido en una rejilla directa.
   - Corrección: la rejilla se aplica a `::details-content`.
2. **Botones secundarios del laboratorio con el estilo antiguo.**
   - Afectaba a «Nuevo vacío», «Cargar configuración», «Exportar JSON», cámaras y contexto, entre otros.
   - Corrección: se unifican.
3. **Filas de acontecimientos Voyager solapadas.**
   - Causa: una rejilla con altura máxima encogía cada fila a su `min-height`.
   - Corrección: se usa una columna flexible. Se aplica lo mismo a los eventos del Centro de Misión.
4. **Cifras clave truncadas en paneles de tres columnas** («75.683 k…»).
   - Corrección: dos columnas y valores que pueden partirse.
5. **Estado «FINALIZADA LA REPRODUCCIÓN» recortado y «Vista amplia» partido** en la cabecera de escena del Centro.
6. **Etiqueta de Neptuno bajo la columna de herramientas** en 1366 y 1600 px.
   - Corrección: la zona de encuadre descuenta la columna.
7. **Problemas solo en móvil.**
   - Causa: reglas de posición de escritorio pisaban las de móvil.
   - Síntomas: inspector sobre la fecha, herramientas bajo las pestañas de modo y rótulo «Buscar» duplicado.
   - Corrección: esas reglas quedan limitadas a ≥ 761 px. La hoja del inspector termina sobre la banda de tiempo.
8. **«Distancias» desplazado a la derecha en el menú principal.**
   - Causa: una regla heredada con `grid-column:2`.
9. **Tarjetas destacadas sin espacio en pantallas bajas.**
   - Corrección: por debajo de 860 px de alto, las tarjetas se compactan y ocultan la descripción.
10. **Ruta del laboratorio en dos líneas a 1366 px.**
    - Corrección: se omite el primer tramo, redundante con la cabecera.

## 6. Verificación

| Control | Resultado |
|---|---|
| `node --test tests/*.test.mjs` | 259/259 (ninguna prueba modificada) |
| `npm run build` | correcto (aviso de tamaño de bloque ya existente) |
| `git diff --check` | sin errores |
| Revisión manual en Chrome sin interfaz (SwiftShader) | Diez rondas de capturas, sin errores de página ni de consola y sin desbordamiento horizontal. Dos pasos del guion de revisión fallaron por el orden de los pasos, no por la aplicación. Tamaños revisados:<ul><li>1600×900: portada, paleta, Júpiter, mapa de áreas, Voyager (bienvenida, explorar, historia), Hangar, Lanzamiento vacío y calculado, Descenso, Tierra–Luna, Interplanetarias, Misión completa B1, Centro de Misión (JOI y contacto en Europa), menú, tiempo, capas y portada contraída;</li><li>1366×768: portada, paleta, Voyager, historia, Lanzamiento, Misión completa y Centro;</li><li>390×844: portada, paleta, Júpiter, áreas, Voyager, Lanzamiento, Misión completa y Centro.</li></ul> |
| `EVIDENCE_DIR=evidence/stage14_1 node scripts/verify-stage14-browser.mjs desktop` | completo: 30 capturas a 1920×1080, 0 errores, 0 desbordamientos (§6.1) |

El guion `scripts/verify-stage14-browser.mjs` se adaptó a la búsqueda global: escribe en la paleta y pulsa Enter. Además registra el número de tarjetas destacadas y la primera opción de la paleta, y acepta `EVIDENCE_DIR` para no sobrescribir las capturas de la etapa 14. El guion heredado `scripts/capture-batch2-details.mjs` recibió el mismo ajuste de búsqueda. **No se ejecutó**, porque escribe en `evidence/tercer_avance/`.

### 6.1 Ejecución del guion de escritorio

Resultado de la segunda ejecución, el 19-11-2026, en `evidence/stage14_1/`: 30 capturas de 1920×1080 y el registro `browser-verification-desktop.json`. Sin errores de página, consola ni guion, y sin desbordamiento horizontal. Comprobaciones registradas:

- **Navegación y portada:**
  - 12 entradas en el mapa de áreas; las 12 rutas llegan a su modo, sección y herramienta, y el panel se cierra con Escape;
  - 4 tarjetas destacadas;
  - la paleta propone «Júpiter · Planeta» y abre su ficha (5,309864 AU).
- **Laboratorio y Centro de Misión:**
  - HUD del Centro en lanzamiento y en descenso;
  - B1 «CADENA CALCULADA COMPLETA SEGÚN EL MODELO»;
  - 19 marcas para 19 eventos;
  - vista amplia a 1900 px;
  - transporte: «siguiente», reproducción y pausa;
  - contacto en Europa.
- **Accesibilidad:** con movimiento reducido, las animaciones duran 0,001 s.

**Tierra–Luna «no reproducida».** Es el comportamiento esperado: con el diseño por defecto el veredicto es INSUFICIENTE y «Ejecutar misión planificada» no abre el Centro, como ya anota el guion. Lo mismo ocurría en la ejecución de la etapa 14.

**Primera ejecución.** Se detuvo en el paso «Propulsión y maniobras» tras 19 capturas. Con SwiftShader cargado, la animación de entrada del mapa de áreas tardó varios segundos (opacidad 0,03 a los 400 ms) y Playwright no consideró estable el botón. El ayudante `area()` del guion ahora espera a que terminen las animaciones del panel. No es un defecto observable con GPU, pero sí indica que esa animación depende del ritmo de fotogramas.

## 7. Límites y pendientes

- **SwiftShader no sustituye una GPU.** Falta una revisión humana de nitidez de texto, antialiasing de órbitas y rendimiento de la paleta y la portada.
- **Encuadre inicial.** Sigue ajustando todos los planetas en la zona libre, de modo que el Sol no queda exactamente en el centro geométrico. Centrar el Sol exigiría cambiar `calcularEncuadreVista`, que tiene prueba propia, y se dejó fuera.
- **Portada contraída.** Contraer la portada no reencuadra la cámara; «Vista general» sí lo hace.
- **Mapa de calor interplanetario.** Sus colores son una escala de datos y no se tocaron.
- **Interruptores.** Cambian solo la apariencia de las casillas. La clase `keep-native` permite conservar una casilla nativa si alguna vista lo necesita.
- **Inter.** Se distribuye bajo SIL OFL 1.1 (`src/ui/fonts/OFL.txt`).
- **Pendientes del proyecto.** Gemini debe documentar visualmente la nueva identidad; la etapa 13 sigue pendiente de auditoría. Sin commit, push, despliegue ni ZIP.
