# Geometría local Voyager–lunas: reconstrucción verificable

2 de noviembre de 2026. Resultado: **los nueve encuentros disponen de geometría local nave–luna directa validada; la trayectoria global sigue siendo la solución anterior y sus incompatibilidades entre archivos no se consideran resueltas**. No se modificaron los 49 conjuntos históricos previos, efemérides planetarias/lunares, trayectorias, radios, velocidades globales ni datos de 2026.

## Selección científica

Se aplicó la preferencia 2 del encargo. El [análisis previo](VOYAGER_REFERENCE_RECONCILIATION.md) ya demostró que restar trayectorias heliocéntricas de cadenas distintas causa errores de 383 a 13 595 km en nave–luna. La traslación baricéntrica reproduce la geometría durante el encuentro pero crea saltos de 11 a 13 566 km en cambios de centro. Los seis SPK especializados tampoco enlazan suavemente con el SPK global: 12 bordes, 533,747 a 15 032,916 km. Los refit posteriores muestran saltos heliocéntricos de 65 176,826 km (V1) y 13 362,162 km (V2). No se interpola entre esas soluciones.

Se descargaron 5 series **directas nave−planeta** y 9 series **directas luna−nave** de [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html), en ECLIPTIC/ICRF J2000, TDB, km y km/s, corrección geométrica `NONE`. Las peticiones tienen objetivo, observador y época explícitos; los 287 originales tienen URL/parámetros, cabeceras y SHA-256 verificados. Cada serie cubre al menos ±24 h alrededor de su acontecimiento; paso ≤5 min, 1 min cerca del encuentro. Los instantes de los nueve acontecimientos y otras 162 épocas quedaron **fuera de la malla** para medir interpolación, salvo coincidencias matemáticas de minuto. `HistoricalEncounterContext.js` usa Hermite con posiciones y velocidades de la misma consulta y rechaza huecos y extrapolación.

El visor conserva las posiciones globales en Sistema Solar, las trayectorias y la telemetría histórica global. En vista Voyager de un objetivo cubierto, la cámara se sitúa por el **vector relativo directo de ese mismo objetivo**: `observador_escena = objetivo_global_escena − rotación_escala(luna−nave)_Horizons` para luna; para planeta, `planeta_global_escena + rotación_escala(nave−planeta)_Horizons`. Esta traslación es una elección de origen gráfico del contexto local, **no una nueva posición heliocéntrica de Voyager**. Por construcción, distancia, dirección y diámetro/FOV de ese objetivo proceden del mismo vector. La velocidad local relativa se conserva en el objeto `localFrames` y el comparador usa su distancia directa. Al salir de cobertura, se abandona la vista local hacia exterior sin animar una supuesta transferencia física; el HUD declara si se usa geometría local o global. No se mueve el cuerpo para alcanzar una distancia y no se reescribe la nave global.

Las dos familias de vector local son casi coincidentes entre sí en los nueve acontecimientos: al combinar `luna−planeta` local con `nave−planeta` directo, el máximo residuo frente al directo `luna−nave` en 81 épocas es 22,047 m y 0,0665 m/s; en 162 épocas retenidas, 31,463 m y 0,0686 m/s. Por ello los otros cuerpos del mismo sistema permanecen aproximadamente coherentes en la vista local; **sólo el objetivo seleccionado** tiene la exactitud directa de la tabla. No se presenta la vista local como estado absoluto de una cadena única para toda la escena.

## Nueve acontecimientos: antes y después

Distancias centro a centro, en km. «Error vectorial después» es la norma 3D frente a la consulta directa Horizons retenida del mismo instante. Los horarios son los del catálogo, no se afirman como periapsis fotográficos. La diferencia escalar después es inferior a 0,001 km en los nueve renglones.

| Objetivo | UTC | Local anterior | Horizons directo | Local nuevo | Error vectorial nuevo, m |
|---|---|---:|---:|---:|---:|
| V1–Ío | 1979-03-05 12:05:26 | 159303,757 | 159220,448 | 159220,448 | 0,117 |
| V1–Europa | 1979-03-04 18:00:00 | 1874256,001 | 1874145,559 | 1874145,558 | 0,796 |
| V1–Ganímedes | 1979-03-05 18:00:00 | 552539,988 | 552693,797 | 552693,796 | 0,758 |
| V1–Calisto | 1979-03-03 12:00:00 | 4740551,394 | 4740388,502 | 4740388,501 | 0,635 |
| V1–Titán | 1980-11-12 05:41:21 | 5568,718 | 6664,046 | 6664,046 | 0,058 |
| V2–Europa | 1979-07-09 12:00:00 | 307747,143 | 308044,212 | 308044,212 | 0,463 |
| V2–Titania | 1986-01-24 06:00:00 | 636068,318 | 635071,476 | 635071,475 | 0,624 |
| V2–Miranda | 1986-01-24 12:00:00 | 353411,204 | 354629,298 | 354629,297 | 0,752 |
| V2–Tritón | 1989-08-25 09:10:00 | 34969,042 | 39734,574 | 39734,574 | 0,008 |

En 81 épocas retenidas (nueve por acontecimiento), máximo error nuevo: **2,714 m en posición y 0,0227 m/s en velocidad**. En las 162 épocas adicionales: **2,714 m y 0,0217 m/s**. Las cotas de aceptación de implementación son 3 m y 0,025 m/s para estas muestras; se basan en residuos observados con la malla de 1/5 min, no en una incertidumbre orbital publicada. Las diferencias escalares y vectoriales, velocidades, tiempos, fuente y SHA están en [relative-audit.json](../evidence/voyager-encounter-context/relative-audit.json). Reducir el número de decimales de la tabla no equivale a igualar artificialmente las distancias.

## Auditoría independiente de kernels

Se leyó la tabla DAF de segmentos con CSPICE N0067 / SpiceyPy 8.3.0 y se verificaron hashes de los archivos NAIF conservados. Se cargaron los archivos en el orden indicado y se calculó `spkezr(luna, ET, ECLIPJ2000, NONE, nave)`, en el mismo JD TDB de cada acontecimiento. [specialized-audit.json](../evidence/voyager-encounter-context/specialized-audit.json) registra centros NAIF, marco, tipo, cobertura ET, SHA, URL y residuos.

| Candidato especializado | Objetivo | Residuo frente a Horizons directo | Resultado |
|---|---|---:|---|
| `vgr1_jup230.bsp`, `vgr2_jup230.bsp` | Lunas de Júpiter | — | No contienen segmento lunar suficiente; requerirían `jup230-short.bsp` (~98,75 MB). Se eligió el producto directo verificable de Horizons. |
| `vgr1_sat337.bsp` + `sat337.bsp` | Titán | 99,801 km; 0,002715 km/s | Cadena ejecutable, solución distinta de Horizons actual `sat441l`. |
| `vgr2.ura182.bsp` | Titania | 119,146 km; 0,002720 km/s | Incluye luna y nave; URA182/DE442 según comentarios del archivo. No coincide con URA184 actual. |
| `vgr2.ura182.bsp` | Miranda | 62,199 km; 0,002735 km/s | Mismo límite de solución. |
| `vgr2_nep097.bsp` | Tritón | 49,703 km; 0,001953 km/s | Incluye luna y nave; no coincide con NEP098 actual. |

El [directorio Voyager NAIF](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/) y los [comentarios de URA182](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/vgr2.ura182.cmt) son las fuentes primarias de procedencia. El [aareadme general](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/aareadme.txt) es anterior a URA182; por eso se inspeccionaron segmentos y comentarios propios, sin asumir compatibilidad por fecha de publicación. Los SPK `x2100` cubren tramos tardíos; no reemplazan de forma continua los encuentros iniciales.

## Continuidad y límites reales

Las posiciones/velocidades globales son exactamente las del proveedor anterior: la prueba compara ambos estados de producción en los nueve eventos y consulta V1/V2 en 2026, donde no se crea contexto local. El [muestreo global previo](../evidence/voyager-reference-reconciliation/global-continuity.json) cubrió 108 épocas V1 y 148 V2, antes/durante/después de encuentros y en bordes de fuentes. Los grandes empalmes de refit tienen estado explícitamente ausente durante su minuto de protección, por lo que no se muestra una nave con fecha falsa. Permanecen diferencias entre conjuntos de unos **0,537 km** y **0,098 km**, y un hueco de redondeo de JD de ~40 μs en V2. Por rigor, **no se certifica continuidad matemática perfecta de la trayectoria global durante los 49 años**; tampoco se ha inventado un ajuste para eliminar esos residuos.

Los SPK especializados no se integraron en la trayectoria global por los saltos medidos. Los vectores directos locales son de la solución Horizons vigente al adquirirlos; sus pequeñas diferencias de interpolación **no son incertidumbre física certificada**. Para fotografías fuera de las ventanas de ±24 h (por ejemplo, la de plumas de Ío del 8 de marzo), el comparador conserva el modo global y comunica falta de vector local validado. La orientación real de cámara sigue limitada por CK/IK; iluminación, texturas y terminador visual no se convierten por esta corrección en una reconstrucción fotométrica.

## Reproducción y verificaciones

- `node scripts/audit-voyager-encounter-frames.mjs`: hashes de los 49 conjuntos previos, 14 series nuevas y 287 respuestas originales; tabla de 81+162 épocas retenidas.
- `PYTHONPATH=<directorio con spiceypy> py scripts/audit-voyager-specialized-context.py`: lectura DAF y comparación SPICE de candidatos (SpiceyPy 8.3.0).
- `node --test tests/VoyagerLocalEncounterContext.test.mjs tests/VoyagerHistoricalMode.test.mjs tests/HistoricalCameraState.test.mjs tests/AngularGeometry.test.mjs tests/VoyagerEncounterAudit.test.mjs tests/VoyagerHorizonsIndependent.test.mjs tests/VoyagerSpkChainAudit.test.mjs`: **26/26 aprobadas**.
- `npm run build`: correcto; permanece advertencia Vite por bloque >500 kB.

Las 14 series y el catálogo están en `public/data/historical/encounter-relative/` y `public/data/historical-encounter-contexts-v1.json`. Los originales, registros de petición y kernels descargados están en `evidence/voyager-encounter-context/`. No se hicieron capturas, ZIP, commit, push ni despliegue.
