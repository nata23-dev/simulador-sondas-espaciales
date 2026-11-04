# Etapa 07 — validación visual y funcional de nueve encuentros Voyager

Fecha: 2 de noviembre de 2026. **Resultado: aprobable para la geometría local, el encuadre contextual, la navegación y el comparador dentro del alcance de esta etapa.** No se certifican la orientación instrumental CK/IK, la fotometría exacta ni una trayectoria global única y continua. Las mediciones científicas originales están en [la implementación de contextos](VOYAGER_ENCOUNTER_CONTEXTS.md); la [auditoría SPK previa](VOYAGER_REFERENCE_RECONCILIATION.md) y el [estado anterior de la Etapa 06](STAGE_06.md) permanecen como antecedentes históricos.

## Método reproducible

Se ejecutó la **compilación de producción** con `vite preview` en Google Chrome automatizado mediante Playwright 1.56.1, WebGL con SwiftShader, a **1920×1080, 1366×768 y 390×844**. Para cada uno de los nueve eventos se eligió el botón real del catálogo histórico y se esperó a que terminara la transición. La cámara reportó `first_person`, misión y luna correctas, `encuentro_local`, ID del conjunto directo, observador exactamente en `localFrames.observerPositionScene` y fecha TDB exacta del evento. Se verificó además que la posición de escena de la luna menos la cámara reprodujera el vector directo transformado por `(x,y,z) → (x,z,−y)`, con kilómetros convertidos a unidades de escena. Una prueba dirigida independiente construyó la cámara Three.js de los nueve casos y comprobó que su dirección real hacia el centro de la luna tiene producto escalar **>0,999999999** con la dirección geométrica esperada.

El diámetro esperado se calculó como `2 asin(radio físico / distancia directa)`. Las 27 vistas reprodujeron el diámetro informado por la cámara con residuo angular máximo observado de **5,76×10⁻¹⁰ grados**. Las distancias de navegador difirieron menos de **0,003 km** de las referencias Horizons retenidas. Esto verifica la transformación y el uso del mismo vector en distancia, posición de observador y FOV; **no mide la incertidumbre física de las efemérides**. El [resultado E2E completo](../evidence/voyager-stage7/e2e-results.json) guarda fecha, cámara, observador, distancia, ángulo, FOV, cobertura, comparadores, transición y errores.

## Estado de los nueve encuentros y FOV

FOV vertical contextual **con el panel cerrado**, en grados. En los nueve casos, los tres tamaños mostraron el cuerpo correcto dentro del área libre y la cámara apuntó a su centro geométrico. Los cuerpos muy lejanos conservan tamaño angular pequeño; el mínimo de FOV de 0,35° no altera su radio. No se detectó entrada de la cámara en ninguna esfera: el caso más cercano, Titán, conserva 6664 km centro a centro frente a un radio de 2574,76 km.

| Encuentro UTC del catálogo | Distancia local, km | Diámetro, ° | FOV 1920 | FOV 1366 | FOV 390 | Estado |
|---|---:|---:|---:|---:|---:|---|
| V1–Ío · 1979-03-05 12:05:26 | 159220,448 | 1,311 | 1,87 | 2,09 | 3,98 | Conforme |
| V1–Europa · 1979-03-04 18:00:00 | 1874145,558 | 0,095 | 0,35 | 0,35 | 0,35 | Conforme; disco pequeño físicamente |
| V1–Ganímedes · 1979-03-05 18:00:00 | 552693,796 | 0,546 | 0,78 | 0,87 | 1,66 | Conforme |
| V1–Calisto · 1979-03-03 12:00:00 | 4740388,501 | 0,058 | 0,35 | 0,35 | 0,35 | Conforme; disco pequeño físicamente |
| V1–Titán · 1980-11-12 05:41:21 | 6664,046 | 45,457 | 61,80 | 67,51 | 103,63 | Conforme con panel cerrado; fase oscura |
| V2–Europa · 1979-07-09 12:00:00 | 308044,212 | 0,581 | 0,83 | 0,93 | 1,76 | Conforme |
| V2–Titania · 1986-01-24 06:00:00 | 635071,475 | 0,142 | 0,35 | 0,35 | 0,43 | Conforme |
| V2–Miranda · 1986-01-24 12:00:00 | 354629,297 | 0,076 | 0,35 | 0,35 | 0,35 | Conforme; disco pequeño físicamente |
| V2–Tritón · 1989-08-25 09:10:00 | 39734,574 | 3,902 | 5,57 | 6,22 | 11,80 | Conforme; fase oscura |

Las capturas reales muestran los discos centrados en el espacio libre, sin la malla de Voyager atravesándolos ni pérdida del objetivo. Las fases oscuras de Titán y Tritón son visibles en Chrome; el programa conserva la luz solar existente y esta etapa no cambió material, textura ni fuente luminosa. La orientación de textura y la fase fotométrica no se cotejaron contra CK/IK ni contra una imagen calibrada; por tanto, **no se presentan como reconstrucción fotográfica exacta**. No hubo errores de página, consola ni solicitudes fallidas en la ejecución final de producción.

## Defectos demostrados y correcciones

1. **FOV móvil retenido del panel abierto.** Antes, seleccionar Tritón con el inspector abierto fijaba `68,476°`; tras cerrarlo el cuerpo quedaba de unos 40 px y el FOV no cambiaba. Titán llegaba al límite de `150°` y el encuadre se marcaba parcial aun con la escena despejada. `CameraController.js` mantiene ahora un estado explícito de FOV contextual automático y `SolarSystem.js` lo recalcula al cambiar el área libre. El FOV manual conserva la elección del usuario. Con el panel cerrado, Tritón usa `11,804°` y Titán `103,627°`; ambos caben. Mientras el panel móvil está abierto, Titán puede seguir marcado como **encuadre parcial** por la estrechez real del área libre; la interfaz lo informa y cerrarlo recupera el disco completo.
2. **Barra de herramientas sobre el limbo.** La cámara no consideraba el dock móvil al definir el área libre histórica. Ahora reserva su ancho; las capturas móviles finales muestran el disco al lado de los controles, manteniendo la escena principal y la navegación existente.
3. **Texto científico obsoleto.** La ficha de Tritón todavía decía que la geometría local daba `34 969 km`. Se actualizó para distinguir `39 735 km` del vector directo local de la trayectoria global de otra solución SPK. La insignia de primera persona también confundía ambos contextos y calculaba avisos de campo con la distancia global. Ahora indica el origen activo y usa la distancia del vector local cuando existe.
4. **Telemetría del comparador.** En distancias cortas se mostraba `0,0 min` de tiempo de luz y el aviso de recorte tenía concordancia incorrecta. Se expresan segundos cuando corresponde y se corrigió la frase. Las notas de las fotografías con fecha aproximada separan ahora las oraciones de limitación y orientación.

No se alteró ningún kernel, vector, efeméride, radio, textura, trayectoria global o parámetro orbital. No se rediseñó el HUD.

## Comparador NASA / 3D

Se abrieron y cerraron **24 comparaciones**: las ocho fotografías asociadas a estos nueve encuentros, en los tres tamaños. Ío en el instante joviano del 5 de marzo no tiene una foto catalogada para ese evento; su imagen de penachos corresponde al 8 de marzo y no se presentó como si fuera del 5. Para las ocho, Chrome cargó el JPEG local, mostró el ID y enlace oficial NASA, situó la cámara 3D en la luna indicada, declaró la comparación geométrica aproximada y restauró el objetivo anterior al cerrar. Calisto muestra un **montaje** identificado como tal; Ganímedes y Miranda son imágenes de regiones, no discos completos. Las fotos cuya hora de obturación no está publicada usan el mediodía del día documentado como referencia de escena; por ello la distancia del comparador puede diferir de la distancia del acontecimiento de la tabla. El FOV ISS-NAC puede recortar Titán y Tritón de forma esperable, y el comparador lo señala.

## Transiciones y controles temporales

En móvil se reprodujo Tritón desde el instante del encuentro: JD TDB `2447763,8825947074` → `2447763,9356530407`, conservando `encuentro_local` y el objetivo. Al seleccionar el 27 de agosto, fuera de cobertura, el estado pasó a `exterior` y `trayectoria_global`; no reutilizó el último vector local ni interpoló entre soluciones. Los límites exactos y la ausencia de extrapolación de las nueve series tienen prueba dirigida. La nave global, las velocidades y el recorrido histórico permanecieron sin cambios. La continuidad matemática de toda la trayectoria global **no se certifica**; sus pequeñas discontinuidades entre fuentes y los huecos SPK están documentados en la auditoría anterior.

## Capturas auténticas

Todas fueron tomadas por Chrome tras cargar recursos, terminar la transición y cerrar el inspector. Se incluye una sexta captura móvil de Titán para demostrar el comportamiento cercano que motivó la corrección.

- [V1–Ío · 1920×1080](../evidence/voyager-stage7/v1-io-encounter-1979-1920x1080.png)
- [V1–Titán · 1920×1080](../evidence/voyager-stage7/v1-titan-1980-1920x1080.png)
- [V2–Titania · 1366×768](../evidence/voyager-stage7/v2-titania-1986-1366x768.png)
- [V2–Miranda · 1366×768](../evidence/voyager-stage7/v2-miranda-1986-1366x768.png)
- [V2–Tritón · 390×844](../evidence/voyager-stage7/v2-triton-1989-390x844.png)
- [V1–Titán · 390×844, comprobación adicional](../evidence/voyager-stage7/v1-titan-1980-390x844.png)

## Pruebas y alcance de aprobación

- [E2E](../evidence/voyager-stage7/e2e-run.txt): 27 vistas, 24 comparadores, transición temporal; **0 errores** de página/consola/red en la ejecución final.
- [Pruebas dirigidas](../evidence/voyager-stage7/focused-tests.txt): **26/26 aprobadas**, incluidos FOV automático frente a manual y nueve vectores directos.
- [Auditoría numérica](../evidence/voyager-stage7/numeric-audit.txt): las nueve distancias siguen dentro de las tolerancias justificadas; 49 archivos científicos previos, 14 series locales y 287 respuestas originales conservan SHA-256.
- [Compilación](../evidence/voyager-stage7/build.txt): correcta; persiste la advertencia de tamaño de bloque de Vite, sin fallo funcional observado.

La etapa puede aprobarse **para el alcance visual y funcional pedido**. Quedan fuera de esa aprobación la orientación real de ISS por CK/IK, la fase/iluminación fotométrica exacta, la cobertura cartográfica incompleta de algunas lunas y la reconciliación global SPK pendiente. Las capturas proceden de Chrome con SwiftShader y no garantizan idéntico resultado en cada GPU física.
