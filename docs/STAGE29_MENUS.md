# Etapa 29 · «Áreas», «Buscar» y «Menú» sin redundancias

Estado: **implementada y probada localmente (22-11-2026)**.

- **Revisión en Chrome** con la GPU AMD real, en seis anchos (1600, 1366, 1024, 760, 390 y 320 px) y en los tres modos.
- **Auditoría:** Claude, que también la implementó ([informe](STAGE29_AUDIT_CLAUDE.md)).
- **Solo interfaz:** no cambia la física, los datos ni ninguna escena.

## Petición

> «Quiero que chequees la parte de Áreas, Buscar y Menú, y verifiques que no sean redundantes las opciones. Creo que dos de ellas hacen lo mismo u ofrecen lo mismo; corrige eso, quita, agrega o cambia.»

## Inventario antes del cambio

| Entrada | Qué ofrecía | Repetido en |
| --- | --- | --- |
| **Áreas** (cabecera, icono de cuadrícula) | Panel con las 11 áreas: Sistema Solar, Voyager y las nueve del laboratorio | «Buscar» sin texto mostraba las mismas 11 áreas |
| **Buscar** (cabecera, Ctrl/⌘ + K o «/») | Cuerpos y sondas; las 11 áreas; 8 acciones de vista y herramientas | Áreas, el dock de la escena y «Menú» |
| **Menú** (cabecera, icono de hamburguesa) | Distancias, Ayuda de navegación, Fuente y escala | — |
| «Buscar planetas y sondas» (panel Explorar) | Filtro de la lista de destinos del panel | Se leía como un segundo «Buscar» |
| «Capas» → «Escala y encuadre» | Botones «Científica 1:1» y «Exploratoria» | El botón de escala del mismo dock, que además la indica siempre |

**Diagnóstico:**

- **«Áreas» y «Menú» eran dos menús de navegación** contiguos con iconos casi iguales. Uno llevaba a sitios y el otro a herramientas, pero nada en la cabecera lo distinguía.
- **«Buscar» sin texto repetía «Áreas» entero** y además las acciones.
- **La escala se cambiaba en dos sitios** del mismo dock.

## Cambios

- **Un solo «Menú»** (`AppNavigator.js`, `WorkspaceLayout.js`):
  - el botón de la cabecera se llama «Menú» (icono de hamburguesa) y su panel reúne:
    - las áreas del simulador, como antes;
    - debajo, **Herramientas** (Distancias);
    - y **Ayuda y datos** (Ayuda de navegación, Fuente y escala);
  - el antiguo `<details id="tools-menu">` desaparece. Sus controles (`#distance-menu`, `#camera-help`, `#source-menu`) se trasladan sin cambios a `#main-tools`, una sección del panel;
  - se conservan `#app-nav-toggle`, `#app-nav-panel` y los botones `data-area`, que usan los guiones de verificación;
  - abrir el «Menú» cierra el inspector, «Capas» y los ajustes temporales; abrir «Capas» cierra el «Menú». Antes lo hacía el menú de herramientas; ahora los eventos son `app:menu-open` y `app:close-menu`;
  - al desplegar una herramienta dentro del panel, se lleva a la vista.
- **«Buscar» solo busca** (`CommandPalette.js`):
  - sin texto muestra solo cuerpos y sondas, que es lo que más se busca;
  - las áreas y las acciones aparecen al escribir («lanz», «distancia», «escala»…);
  - la acción «Medir distancias 3D» abre el «Menú» con la herramienta desplegada y visible;
  - sin texto ni resultados, sugiere qué escribir.
- **Filtro del panel Explorar:** se rotula «Filtrar la lista de destinos», porque filtra esa lista y no busca en todo el simulador.
- **«Capas»:**
  - se quitan los botones de escala repetidos;
  - la escala se cambia y se lee en el botón «Escala 1:1 / Exploratoria» del dock, el aviso de fidelidad visible;
  - los botones de encuadre van bajo el encabezado «Encuadre»;
  - `VisualizationControls.js` ya toleraba la ausencia de esos botones.
- **Estilos** (`theme.css`, `workspace-layout.css`):
  - las reglas de `#tools-menu` y `.main-menu` pasan a `#main-tools` o se retiran;
  - la cabecera móvil tiene tres columnas (marca, «Buscar», «Menú») en lugar de cuatro.

## Verificación en el navegador

[`scripts/verify-stage29-menus.mjs`](../scripts/verify-stage29-menus.mjs) ([registro y capturas](../evidence/stage29/)), con la GPU real:

- **Cabecera** en 1600, 1366, 1024, 760, 390 y 320 px:
  - solo «Buscar» y «Menú»;
  - ningún resto del menú antiguo;
  - sin desborde horizontal, sin botones fuera de la pantalla y sin solapes.
- **Panel del «Menú»** en todos los anchos:
  - cabe en la pantalla (con desplazamiento);
  - 11 áreas, Herramientas y Ayuda y datos;
  - se cierra con Escape y con un clic fuera;
  - un clic dentro (desplegar Distancias) no lo cierra.
- **Exclusión:** abrir el «Menú» cierra «Capas», y abrir «Capas» cierra el «Menú».
- **«Buscar»:**
  - sin texto, solo «Cuerpos y sondas» (10 resultados);
  - «lanz» da el área «Lanzamiento terrestre»;
  - «distancia» da «Medir distancias 3D»;
  - con Intro se abre el «Menú» con Distancias desplegada y a la vista.
- **«Capas»:**
  - sin los botones de escala; el dock sigue indicando «Escala 1:1»;
  - encabezados «Capas de visualización», «Encuadre», «Calidad gráfica» y «Procesador gráfico» (etapa 27).
- **Navegación desde el «Menú»** al modo histórico y al Hangar del laboratorio: la cabecera y el panel siguen bien en cada modo.
- Sin errores de consola.

## Límites

- Quien conociera «Áreas» encontrará el mismo panel bajo «Menú». El botón «Todas las áreas» de las misiones destacadas sigue abriéndolo.
- El panel es más largo: las herramientas quedan debajo de las áreas, con desplazamiento en pantallas bajas.
- **Pendientes:** revisión visual por una persona y prueba con un lector de pantalla real (NVDA o Narrador).
