# Auditoría de la etapa 24 · Experiencia de uso del Centro de Misión

- **Auditor:** Claude (Opus 5.5). **Claude también implementó la etapa.** Por eso esta auditoría usa métodos distintos de los de la implementación:
  - casos límite escritos aparte de las pruebas de la etapa;
  - cálculo propio de la geometría del esquema;
  - comparación de estilos calculados antes y después de quitar `!important`;
  - contraste WCAG calculado con los valores reales de los tokens;
  - contraste de las fechas con fuentes de NASA y con el catálogo del modo histórico;
  - recorrido en Chrome con la GPU real.
- **Fecha:** 21-11-2026.
- **Alcance:** solo presentación. No hay cambios de física, constantes, marcos, integrador, efemérides ni datos, así que no hace falta la revisión adicional por otro agente que exige [CLAUDE.md](../CLAUDE.md) para esos cambios. Los tres campos nuevos de las fases de captura (`objective`, `bodyRadiusKm`, `bodyName`) copian valores de la entrada del cálculo; la prueba A1 confirma que el periapsis alcanzado sigue en 315,5 km.
- **Veredicto:** **aprobada con observaciones.** Hubo dos defectos menores (D-01 y D-02, este heredado de 17.1), ya corregidos, y se cerró el pendiente del anillo de foco de las etapas 17 y 17.1.

## Comprobaciones

| # | Método | Resultado |
| --- | --- | --- |
| 1 | Cálculo propio del esquema de la órbita A1 (Marte, R = 3 389,5 km; 315,5 × 100 000 km; lado 220 px, margen 22 px): r<sub>p</sub>·k, r<sub>a</sub>·k, b = √(r<sub>p</sub> r<sub>a</sub>)·k y centro a (a − r<sub>p</sub>)·k del foco | Coincide con `esquemaOrbita` a 0,01 px (5,94 / 165,76 / 31,38 / −79,91 px). Las dos elipses quedan dentro del margen |
| 2 | Casos límite del esquema: hiperbólica, apoapsis negativa, circular, radio del cuerpo 0, órbita de 8 millones de km en Júpiter, periapsis bajo la superficie | Hiperbólica y apoapsis negativa → `null` (la tarjeta dice que no hay órbita cerrada). Circular → círculo. Cuerpo diminuto → radio mínimo de 3 px. Periapsis bajo la superficie → se dibuja tal cual, cortando el cuerpo, que es lo que ocurre |
| 3 | Casos límite de las marcas: sin eventos, fuera de la ventana, desordenados, `NaN`, ancho o duración 0, 1 000 eventos | Correctos salvo el último: **D-01** |
| 4 | Casos límite del zoom: al principio, al final, misión más corta que el mínimo | La ventana nunca sale de [0, total] |
| 5 | Atajos: `contenteditable`, campo de opción, Mayús + Fin, «Spacebar» de navegadores antiguos, flecha sobre un botón | Los tres primeros no actúan. «Spacebar» reproduce o pausa. La flecha sobre un botón salta de evento: ningún botón del Centro de Misión usa flechas (no hay grupos con `tabindex` itinerante), así que no se pierde nada |
| 6 | Rótulos: sin obstáculos, arriba tapado, ambos tapados, borde exacto | Arriba; abajo; oculto; arriba (tocar el borde no cuenta como solape) |
| 7 | Misión real: sonda desconocida, sin destinos, «MARTE» en mayúsculas, Juno → Tierra, Voyager → Neptuno; formato y orden de todas las fechas | Sin ficha en los dos primeros casos. Coincidencia sin depender de mayúsculas ni tildes. Artículo correcto («por la Tierra»). Todas las fechas son ISO válidas y van en orden |
| 8 | Fechas frente a fuentes | Voyager: iguales a `VoyagerHistoricalEvents.js` (Júpiter 1979-03-05 y 1979-07-09, Saturno 1980-11-12 y 1981-08-26, Urano 1986-01-24, Neptuno 1989-08-25) y a los lanzamientos de `VoyagerHistoricalMissions.js`. Cassini: la página de JPL confirma lanzamiento 1997-10-15, Júpiter 2000-12-30 y llegada el 30-06-2004 en hora del Pacífico, que la ficha da como 2004-07-01 UTC y lo aclara |
| 9 | Una ensambladura experimental no recibe ficha de misión real | `ExperimentalAssembly.js` no conserva `basedOn`, así que la ficha no aparece: correcto, porque esa nave no es la histórica |
| 10 | Contraste WCAG 2.x de los textos nuevos sobre su fondo efectivo (capas translúcidas compuestas) | Mínimo **5,74:1** (rótulo «DISTANCIAS», `--text-3`); los demás entre 8,39:1 y 12,23:1. Todos ≥ 4,5:1 |
| 11 | Estilos calculados antes y después de consolidar `!important` (309 elementos, 38 propiedades, 33 estados, tres resoluciones, `:hover` forzado) | **0 diferencias.** La primera pasada encontró 125, que eran dependencias reales y se resolvieron con especificidad |
| 12 | Depuración del anillo de foco pendiente de 17: estado de `:focus`, `:focus-visible` y `:focus-within` en cada pulsación del tabulador sobre `im-departure` | Cuatro paradas; en la cuarta (botón del calendario) solo aplica `:focus-within`. Con la regla nueva, la regresión de accesibilidad da 0 sin anillo |
| 13 | Regresión completa de la etapa 17 con GPU, comparando sus capturas de 320 px con las de 17.1 | 102 capturas, 0 errores, 0 desbordamientos, 0 problemas de accesibilidad automática. La comparación encontró un defecto heredado de 17.1, **D-02** |
| 14 | Recorrido en Chrome con GPU AMD real (A1 a 1366 × 768 y 390 × 844) | Ver [STAGE24_USER_EXPERIENCE.md](STAGE24_USER_EXPERIENCE.md#verificación-en-el-navegador): atajos, zoom, resultados, unidades, TDB − UTC, encabezados, 0 solapes de rótulos, hoja inferior y teléfono, sin errores ni avisos de la página |

## Defectos

- **D-01 (menor).** `agruparMarcas` limita la barra a 80 marcas con `slice(0, maximo)`. Si una misión tuviera más grupos, los eventos sobrantes se quedarían **sin marca y sin avisar** (sí seguirían en la lista de eventos). Con las misiones actuales (5–15 eventos y una barra de unos 450 px, que admite unos 37 grupos) no ocurre, pero es un límite silencioso. **Corregido:** si salen más grupos que el máximo, se repite el agrupamiento con 1,5 veces más separación hasta que caben, así que todo evento conserva su marca. Prueba nueva con 1 000 eventos.

- **D-02 (menor, heredado de 17.1).** A 320 × 568 px, el pie del Centro de Misión perdía la línea que declara la escala: estaba limitado a 48 px, con el desbordamiento oculto y alineado abajo. **Corregido:** el pie no se recorta y la barra de reproducción se coloca sobre su altura real, medida con un `ResizeObserver`. La parte responsiva de la regresión de 17 da 0 errores y 0 desbordamientos, y la captura a 320 px muestra el pie completo.

## Observaciones

- **O-1.** La verificación del foco y de los anuncios es de DOM (qué elemento tiene el foco, qué texto llega a `aria-live`). Falta una prueba con NVDA o Narrador.
- **O-2.** La hoja inferior se probó con clics en un navegador sin interfaz, no en un teléfono con gestos táctiles.
- **O-3.** Los rótulos que no caben se ocultan. Es la opción conservadora; recolocarlos en cualquier dirección exigiría un algoritmo de colocación que la etapa no justifica.
- **O-4.** La prueba que impide reintroducir `!important` cuenta exactamente 26. Si se añade una utilidad nueva legítima (por ejemplo otra regla de `[hidden]`), habrá que actualizar el número de forma consciente.
