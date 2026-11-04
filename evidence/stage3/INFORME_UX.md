# Etapa 03 — experiencia Voyager y navegación

Fecha de cierre: 1 de noviembre de 2026. Esta etapa cambia presentación, navegación y textos de ayuda. Conserva el motor, las efemérides, las trayectorias, las distancias y los campos de visión científicos. La reconciliación SPK pendiente de la etapa 02.3 sigue pendiente; la vista local de Neptuno no debe presentarse como una reconstrucción geométrica validada frente a Horizons directo.

## Problemas observados y correcciones

La navegación histórica mostraba seis pestañas, con «Acontecimientos» y «Recorrido» separados aunque compartían los mismos hitos. En 390×844 ocupaban dos filas y restaban espacio a la escena. El recorrido también podía perder su acción «Siguiente» bajo una descripción larga. Al abrir una foto desde el catálogo, el comparador cerraba la ficha y no restauraba su estado abierto. La cámara decía «posición histórica exacta» y «primera persona» aunque el apuntado instrumental CK/IK no está implementado y la cadena SPK local sigue en discrepancia.

La pestaña «Historia» reúne el recorrido de 12 pasos y el catálogo de 14 acontecimientos. Al iniciar o continuar el recorrido muestra el hito actual y deja el catálogo plegado, disponible con su propio encabezado. El paso indica también su posición en el catálogo. La navegación de pasos queda visible antes de la descripción en móvil; el relato puede desplazarse sin esconder el avance. El último paso ofrece «Finalizar recorrido»; salir con la X conserva progreso, finalizar permite comenzar otra vez desde el paso 1. Consultar «Datos», «Fotos» o «Cámaras» no borra el paso. El botón de reproducción temporal indica que reproduce tiempo continuo; los botones «Anterior/Siguiente acontecimiento» saltan entre hitos.

El panel histórico tiene cinco pestañas en una fila: Explorar, Datos, Historia, Fotos y Cámaras. En móvil se abre cerrado al entrar para dejar visible el espacio; «Buscar» y el botón de panel lo reabren. El panel cabe por encima de la línea temporal. Los controles de seguimiento exterior que conservan la visibilidad actual y las capas visuales están en secciones desplegables de Cámaras. El selector de misión en Explorar sigue cambiando la sonda visible y el encuadre. Estas acciones tienen alcances distintos y ahora están rotuladas como tales.

El estado de cámara indica «Desde Voyager 1/2 → objetivo» y ofrece «Exterior» para regresar. La ficha de Cámaras explica «Vista exterior», «Vista desde la sonda» o «Comparación fotográfica» y el apuntado geométrico sin CK/IK. Los textos de bienvenida, fidelidad y recorrido evitan afirmar que la orientación es instrumental exacta o que las distancias locales conflictivas ya están reconciliadas. Se retiraron dos cifras de Júpiter que no concordaban con la auditoría de la etapa 02.3. La consulta de información y el cierre del comparador restauran la pestaña, fecha, cámara y estado abierto del catálogo previos.

## Auditoría de controles

| Control antes | Estado actual | Motivo y capacidad conservada |
|---|---|---|
| Pestañas «Acontecimientos» y «Recorrido» | Unificadas en «Historia» | Recorrido de 12 pasos y catálogo de 14 siguen accesibles en un mismo contexto. |
| «Información» y «Fotografías» | Etiquetas «Datos» y «Fotos» | Cinco pestañas caben en una fila móvil; contenido y acciones originales siguen disponibles. |
| Selector Voyager 1/2/Ambas en Explorar | Conservado | Cambia visibilidad y encuadre de misión. |
| «Seguir V1/V2» y «Comparativa» en Cámaras | Reorganizados bajo «Seguimiento exterior sin cambiar las sondas visibles» | Mantienen su diferencia respecto al selector de misión; ya no parecen duplicados inmediatos. |
| Trayectorias y Heliosfera | Reorganizadas bajo «Capas visuales» | Capas avanzadas disponibles sin saturar la cámara principal. |
| Exterior / Primera persona | Conservados y rotulados «Exterior» / «Desde Voyager» | El modo y la salida quedan claros; no se afirma orientación CK/IK. |
| Avance del recorrido | «Siguiente paso» y «Finalizar recorrido» | Se diferencia del botón de reproducción de tiempo. |
| Reproducir/Pausar | Conservado con texto «Tiempo continuo» | La acción no se confunde con saltar acontecimientos. |
| Salida del comparador | Modificada | Restaura cámara, fecha, pestaña, progreso y estado del catálogo. |
| Botón de panel y cierre | Conservados | En móvil permiten escena despejada y regreso a la consulta. |
| FOV ISS/WAC/contextual, fotos, modo inmersivo y modos Experimental/Sistema Solar | Conservados | Verificados en la regresión; no se cambiaron cálculos ni capacidades. |

No se eliminó ningún control con capacidad exclusiva. La pestaña independiente «Recorrido» es la única entrada retirada; su botón de inicio y todos sus pasos viven en Historia.

## Evidencia visual auténtica

`Antes/` contiene 35 capturas de Chrome obtenidas **antes de editar** esta etapa; `Despues/` contiene las 35 vistas equivalentes tras el cambio. Las parejas con el mismo nombre permiten comparar, entre otras, `07-v1-jupiter.png` (1366×768), `12a-neptuno-movil-panel.png` (390×844) y `04-catalogo-escritorio.png` (1920×1080). Sus manifiestos `stage2-results.json` registran modo de cámara, observador, objetivo, FOV, fecha, estado de comparador y dimensiones; documentan que los encuadres científicos siguen iguales.

`Escenarios/` añade 20 capturas de flujos de usuario: primera visita, cambio entre las dos Voyager, Neptuno desde Voyager 2, lectura de datos, cambio manual de fecha, reanudación del recorrido, comparador con restauración, planeta libre, inmersión, finalización y reinicio, en 1366×768, 1920×1080 y 390×844. `Regresion/` contiene 20 capturas de navegación histórica, catálogo, fotos, tiempo y modos. Se inspeccionaron visualmente las vistas de Júpiter, Neptuno, guía inicial y datos en escritorio y móvil. El indicador de Neptuno y el planeta permanecen visibles con el panel móvil cerrado; la discrepancia de distancia local permanece.

## Pruebas y compilación

| Verificación | Resultado | Registro |
|---|---|---|
| Pruebas automatizadas | 94/94 aprobadas | `Resultados/automated-tests.txt` |
| Compilación Vite | Correcta, 74 módulos | `Resultados/production-build.txt` |
| Regresión de cámaras/geométría | 80 comprobaciones, 35 capturas, 0 errores JS/HTTP | `Resultados/browser-after-stage2.txt` |
| Regresión de navegación histórica | 55 comprobaciones, 20 capturas | `Resultados/browser-after-stage1.txt` |
| Escenarios UX de esta etapa | 30 comprobaciones, 20 capturas, 0 errores JS/HTTP | `Resultados/browser-after-stage3.txt` |
| Comparación SHA-256 con ZIP 02.3 | 108 archivos de `src/science`, `src/graphics` y datos públicos examinados, ninguno cambió | Auditoría local de esta entrega |

La compilación conserva la advertencia anterior de un bloque JavaScript mayor de 500 kB. La prueba de navegador usa Chrome real mediante CDP; el modo de métricas móviles emula 390×844 en Chrome de escritorio, por lo que no sustituye una prueba táctil en un dispositivo físico.

## Pendientes

- La trayectoria local de Voyager 2 a Neptuno permanece a ~34.377 km frente a ~29.264 km del vector directo de Horizons en el encuentro oficial. La etapa 02.3 documenta la causa baricéntrica y los saltos que impiden una sustitución continua simple. No se corrigieron aquí posiciones, velocidades, distancias ni FOV.
- La orientación instrumental y la recreación fotográfica requieren CK/IK; iluminación y texturas no constituyen una reconstrucción fotométrica calibrada.
- La interfaz móvil fue probada en 390×844 y Chrome emulado; conviene confirmar gestos y rendimiento en hardware telefónico antes de publicar.

**La mejora UX está terminada para revisión. La geometría Voyager no está lista para incorporar lunas.** No se hizo commit, push ni despliegue.
