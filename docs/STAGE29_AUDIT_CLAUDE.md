# Auditoría de la etapa 29 · Menús sin redundancias

- **Auditor:** Claude (Opus 5.5). **Claude también implementó la etapa**, así que esta auditoría usa métodos distintos de los de la implementación:
  - inventario de todos los controles de la cabecera y de sus destinos;
  - búsqueda de referencias a los identificadores retirados en código, estilos y guiones;
  - medida geométrica de la cabecera en seis anchos;
  - recorrido con el teclado y el ratón en Chrome;
  - lectura de las capturas.
- **Fecha:** 22-11-2026.
- **Alcance:**
  - `src/ui/AppNavigator.js`, `WorkspaceLayout.js` y `CommandPalette.js`;
  - `index.html`;
  - `theme.css` y `workspace-layout.css`.
  - Solo interfaz.
- **Veredicto:** **aprobada con observaciones.** Un defecto encontrado y corregido (D-1).

## Comprobaciones

| # | Método | Resultado |
| --- | --- | --- |
| 1 | **Inventario** de las entradas de la cabecera, la paleta y el dock, con su destino | Tabla en el [documento de la etapa](STAGE29_MENUS.md). Quedaban tres duplicidades: «Áreas»/«Buscar» sin texto, «Áreas»/«Menú» y la escala en «Capas» y en el dock. Las tres se han eliminado |
| 2 | **Referencias** a `#tools-menu`, `.main-menu`, `toolsMenu` y `#scale-*-option` en `src/`, `index.html`, `scripts/` y `tests/` | Ninguna en el código. Las reglas CSS se han trasladado o retirado. `VisualizationControls.js` usa `?.` con los botones de escala. Ninguna prueba los usaba. Un guion antiguo de las etapas 01–08, `scripts/verify-redesign.mjs`, abría `#tools-menu`: ahora abre el «Menú» único. No se ha ejecutado: se conecta a mano a un Chrome por CDP y ya esperaba una distribución anterior a la 14 (busca `#perspective-button` dentro del menú). Los 11 usos de `#app-nav-toggle` y `data-area` en los guiones de las etapas 20–25 siguen siendo válidos |
| 3 | **Geometría de la cabecera** en 1600, 1366, 1024, 760, 390 y 320 px: cajas de todos los botones visibles, desborde, botones fuera de la pantalla y solapes ([registro](../evidence/stage29/verify-stage29-menus.json)) | Desborde 0 px, nada fuera y ningún solape en los seis anchos. El panel cabe en la pantalla en todos ellos |
| 4 | **Recorrido** con teclado y ratón: Escape, clic fuera, clic dentro, exclusión con «Capas», Ctrl/⌘ + K, Intro sobre una acción | Todo según lo previsto, salvo D-1 |
| 5 | **Capturas** a 1600 y 390 px, del «Menú» abierto, de «Capas» y de «Buscar» sin texto | Mismo lenguaje visual que el panel de áreas: encabezados en mayúsculas grises, filas con icono y acento dorado al pasar. Sin recortes |
| 6 | **Regresión** de las etapas 24, 25 y 26 en Chrome, cuyos guiones usan `#app-nav-toggle` y `#view-menu` | Sin errores ([registros](../evidence/stage29/regresion/)) |

## Defecto (corregido)

- **D-1:** la acción «Medir distancias 3D» de «Buscar» abría el «Menú» con la herramienta desplegada, pero por debajo del borde del panel. Había que desplazarse para verla. **Corregido:** al desplegarse una herramienta o una ayuda dentro del panel, se lleva a la vista (`scrollIntoView`). Lo comprueba la captura `accion-distancias.png`.

## Observaciones

- **O-1:** el panel del «Menú» es más largo que el antiguo de «Áreas». En pantallas bajas las herramientas quedan tras desplazarse, aunque eso solo ocurre si se piden.
- **O-2:** con el «Menú» abierto en escritorio, el botón «Capas» del dock queda bajo el panel, como antes con «Áreas». Para llegar a «Capas» hay que cerrar el «Menú» con Escape o con un clic fuera.
- **O-3:** pendiente la prueba con un lector de pantalla real. El botón anuncia «Menú: áreas del simulador, herramientas y ayuda» y el panel es un diálogo llamado «Menú del simulador».
