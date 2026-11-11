# Etapa 08 — cierre visual y funcional de los empalmes Voyager

**Fecha:** 5 de noviembre de 2026. **Base:** rama `revision/modo-historico-voyager`, commit `53063a8bc6e7ef793a4b5f81a5c4b03571ec769d`. El árbol estaba limpio antes de esta validación. No se modificaron efemérides, kernels SPK, posiciones, velocidades, modelos astronómicos ni materiales.

## Intervalos comprobados

Los extremos son muestras válidas; el **interior abierto** carece de posición global certificada. Se comprobaron visualmente instantes nominales a 30 segundos antes, en el centro y a 30 segundos después de cada intervalo, con error de selección inferior a 0,25 s. Las fechas de la tabla son TDB, no UTC.

| Sonda | Intervalo sin cobertura global certificada (TDB) | JD TDB abierto | Duración auditada | Discontinuidad entre fuentes |
|---|---|---|---:|---:|
| Voyager 1 | 1981-01-01 00:00:00–00:01:00 | (2444605.5, 2444605.500694444) | 59,999956 s | 65 176,826 km |
| Voyager 2 | 1989-08-29 08:00:00–08:01:00 | (2447767.833333333, 2447767.834027778) | 60,000037 s | 13 362,162 km |

Las diferencias kilométricas son **discontinuidades científicas entre soluciones SPK/Horizons**, ya documentadas en [la reconciliación](VOYAGER_TRAJECTORY_RECONCILIATION.md) y [la auditoría numérica](../evidence/voyager-stage8/audit.json). No son errores gráficos ni representan desplazamientos reales de la nave durante ese minuto. La reconstrucción global continua sigue pendiente de una fuente científica homogénea.

## Método de navegador y pruebas realizadas

Se usó el ejecutable instalado de **Google Chrome**, en modo sin ventana, con WebGL mediante SwiftShader y Playwright 1.56.1. El simulador se sirvió localmente con Vite. [El script reproducible](../scripts/audit-voyager-stage8-browser.mjs) guardó **24 PNG capturados por Chrome**, 18 estados antes/durante/después (dos sondas × tres instantes × tres resoluciones), y [resultados estructurados](../evidence/voyager-stage8/browser/browser-results.json). La dependencia Playwright de prueba se instaló fuera del repositorio.

Se ejercitaron 1920 × 1080, 1366 × 768 y 390 × 844; selección y cambio entre ambas sondas; seguimiento exterior; primera persona; vista cinematográfica; reproducción hacia adelante y retroceso; velocidades 1 h/s y 6 h/s; pausa y reanudación; saltos directos mediante los selectores UTC de fecha y hora; y desplazamiento de la barra temporal. Para seleccionar exactamente el minuto en las capturas, el script aumentó **sólo en la página de prueba** la resolución del control `range` y disparó su evento de entrada. No cambió la aplicación distribuida ni el tiempo científico. La barra visible también se accionó mediante un clic y desplazó el calendario. Se probó el cambio de modos Histórico → Sistema Solar → Experimental → Histórico.

En cada estado se revisaron el vector visual o su ausencia, modo y posición finita de cámara, centro del seguimiento, fecha UTC/TDB, velocidad, ficha científica, ancho de página y errores de Chrome. En los 12 estados con posición válida, el centro de cámara coincidió con la sonda a menos de `1,3 × 10⁻¹³` unidades de escena. Durante los dos cortes, el estado y la posición visual fueron nulos, la rapidez y distancia numéricas mostraron `—`, y no hubo texto `NaN`, desbordamiento horizontal ni errores de página. El modelo se ocultó; la línea se interrumpió y reapareció sólo al recuperar cobertura. La prueba de aristas de trayectoria automatizada confirma que no hay segmento entre extremos incompatibles.

La reproducción se detuvo explícitamente en el centro del minuto aun cuando un fotograma de 1 h/s o 6 h/s lo habría saltado. La fecha permaneció correcta, los controles siguieron operativos y **Reproducir** continuó en un estado interpolado válido posterior. Se verificó el mismo comportamiento en retroceso. Si el usuario estaba en primera persona, la cámara pasó a exterior al perder la posición; la interfaz actualizó ambos botones y el seguimiento exterior se trasladó al nuevo extremo cuando reapareció la sonda. No hubo salto descontrolado de la cámara ni presentación de la posición anterior como actual.

## Defectos de representación y correcciones

| Defecto observado antes de la corrección | Cambio aplicado |
|---|---|
| La ficha decía «fuera de cobertura», pero mostraba una explicación de la inyección de lanzamiento durante un corte de 1981 o 1989. El encabezado seguía anunciando el catálogo global sin explicar la ausencia. | Mensaje breve «Sin posición verificada · trayectoria interrumpida»; magnitudes no disponibles y explicación del minuto sin datos. No se añadieron paneles. |
| La cámara podía permanecer en primera persona durante el hueco, aunque la nave ya no tuviera posición. | Salida automática a exterior antes de ocultar el modelo; botones y estado de cámara sincronizados. |
| Al recuperar cobertura, el seguimiento exterior conservaba el centro anterior y la nave podía quedar fuera del encuadre. | Trasladar el centro y la cámara por la diferencia entre los dos extremos válidos, sin interpolar una posición intermedia. |
| El botón «Desde Voyager» podía tomar la misión de un hito previamente seleccionado, incluso si la ficha y el filtro eran de la otra Voyager. | Usa la sonda activa de la ficha; conserva el objetivo del hito sólo si pertenece a esa misma misión. |
| La reproducción rápida podía cruzar el minuto sin mostrar su estado ausente. | Detectar la entrada al intervalo en ambos sentidos, fijar su punto medio y pausar. Reproducir permite continuar. |

El corte de la arista de trayectoria y el rechazo científico de estados interiores ya existían en el commit de referencia; se mantuvieron. Los cambios de esta pasada afectan sólo a la presentación y al control funcional del estado sin cobertura.

## Capturas auténticas

Todas están en [`evidence/voyager-stage8/browser/`](../evidence/voyager-stage8/browser/). La terna **antes / sin datos / después** existe para cada sonda en las tres resoluciones; los archivos siguen el patrón `v1|v2-antes|sin-datos|despues-<ancho>x<alto>.png`.

| Evidencia | Voyager 1 | Voyager 2 |
|---|---|---|
| Escritorio 1920 × 1080, antes | [PNG](../evidence/voyager-stage8/browser/v1-antes-1920x1080.png) | [PNG](../evidence/voyager-stage8/browser/v2-antes-1920x1080.png) |
| Escritorio 1920 × 1080, minuto sin datos | [PNG](../evidence/voyager-stage8/browser/v1-sin-datos-1920x1080.png) | [PNG](../evidence/voyager-stage8/browser/v2-sin-datos-1920x1080.png) |
| Escritorio 1920 × 1080, después | [PNG](../evidence/voyager-stage8/browser/v1-despues-1920x1080.png) | [PNG](../evidence/voyager-stage8/browser/v2-despues-1920x1080.png) |
| Escritorio 1366 × 768, minuto sin datos | [PNG](../evidence/voyager-stage8/browser/v1-sin-datos-1366x768.png) | [PNG](../evidence/voyager-stage8/browser/v2-sin-datos-1366x768.png) |
| Móvil 390 × 844, minuto sin datos | [PNG](../evidence/voyager-stage8/browser/v1-sin-datos-390x844.png) | [PNG](../evidence/voyager-stage8/browser/v2-sin-datos-390x844.png) |
| Primera persona antes / salida a exterior en el corte | [antes](../evidence/voyager-stage8/browser/v1-primera-persona-antes-1920x1080.png) · [corte](../evidence/voyager-stage8/browser/v1-primera-persona-corte-1920x1080.png) | [antes](../evidence/voyager-stage8/browser/v2-primera-persona-antes-1920x1080.png) · [corte](../evidence/voyager-stage8/browser/v2-primera-persona-corte-1920x1080.png) |
| Pausa real de reproducción en el hueco | [PNG](../evidence/voyager-stage8/browser/v1-reproduccion-pausa-1920x1080.png) | [PNG](../evidence/voyager-stage8/browser/v2-reproduccion-pausa-1920x1080.png) |

Las capturas de móvil y 1366 × 768 **antes y después** completan las 24 imágenes en la misma carpeta. Ninguna captura fue generada ni editada artificialmente.

## Regresión y límites

| Verificación posterior a los cambios | Resultado |
|---|---|
| [Auditoría offline Etapa 08](../evidence/voyager-stage8/browser/scientific-audit.log) | 49 conjuntos y 10 SPK con SHA-256 correctos; dos huecos inalterados |
| [Contextos de encuentros](../evidence/voyager-stage8/browser/local-encounters.log) | Nueve encuentros luna–nave; 81 épocas de referencia y 162 muestras de retención, sin regresión; máximo lunar 2,714 m y 0,0227 m/s |
| [Pruebas automáticas](../evidence/voyager-stage8/browser/tests.log) | 107/107 aprobadas, incluida la arista SPK cortada |
| [Compilación](../evidence/voyager-stage8/browser/build.log) | Correcta; 82 módulos. Persiste la advertencia previa del bloque >500 kB |
| [Chrome E2E](../evidence/voyager-stage8/browser/browser-results.json) | 18 estados, cinco grupos de interacciones, 24 capturas, cero errores de página |

**Límites:** La barra temporal ordinaria cubre casi 50 años con 100 000 pasos y no permite fijar manualmente un minuto; los selectores directos llegan a la hora UTC. Para la selección subminuto se usó la resolución temporal de prueba indicada arriba. Las capturas reflejan Chrome con WebGL por SwiftShader; no sustituyen una revisión de rendimiento o color en una GPU física. La discontinuidad física de las fuentes y otras diferencias menores descritas en la reconciliación científica permanecen. No se afirma continuidad orbital global.

## Conclusión

La **representación funcional de los dos empalmes queda validada** en los tres tamaños probados: no se atribuye a Voyager una posición interior inventada, la línea no une soluciones incompatibles, la telemetría y el modo de cámara explican la ausencia, y la reproducción puede proseguir después del corte. La validación visual no resuelve las dos discontinuidades científicas entre SPK. No se creó ZIP, commit, push ni despliegue, y no se inició otra etapa.
