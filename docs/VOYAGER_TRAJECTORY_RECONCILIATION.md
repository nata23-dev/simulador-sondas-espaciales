# Etapa 08 — auditoría y reconciliación de trayectorias Voyager

**3 de noviembre de 2026. Estado: reconciliación global incompleta; representación de los dos empalmes SPK corregida.** Se preservaron las posiciones y velocidades de producción, los 49 conjuntos históricos, los diez SPK auditados y los nueve contextos locales directos. Ninguna distancia se ajustó para cerrar un ensayo. La trayectoria no es una solución dinámica única y continua desde 1977 hasta 2026.

## Método y evidencia reproducible

`node scripts/audit-voyager-stage8.mjs` verifica SHA-256 de los **49** conjuntos de producción y **10** SPK, inspecciona todas las coberturas de Voyager, identifica vacíos y solapamientos, calcula diferencias entre conjuntos solapados a igual época y resume la comparación heliocéntrica conservada con Horizons. Resultado íntegro: [audit.json](../evidence/voyager-stage8/audit.json). El inventario de los 49 archivos, sus consultas, versiones, coberturas por cuerpo, unidades y hashes está además en [input-inventory.json](../evidence/voyager-reference-reconciliation/input-inventory.json). Las respuestas originales y parámetros de consulta permanecen bajo `evidence/voyager-reference-reconciliation/` y `evidence/voyager-encounter-context/`; esta etapa **no realizó nuevas consultas de red**. Por tanto, «independiente» significa comparación con respuestas Horizons originales retenidas y una implementación SPICE distinta, no una nueva determinación orbital independiente.

Las fuentes primarias consultadas para interpretar los resultados son [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), su [manual de vectores y trayectorias de naves](https://ssd.jpl.nasa.gov/horizons/manual.html), el [archivo Voyager NAIF](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/) y la [documentación SPICE](https://naif.jpl.nasa.gov/naif/). Las consultas conservadas usan `COMMAND=-31/-32`, origen `500@10`, `REF_SYSTEM=ICRF`, `REF_PLANE=ECLIPTIC`, tiempo TDB, `OUT_UNITS=KM-S` y `VEC_CORR=NONE`. SPICE usó `ECLIPJ2000`, `NONE` y segundos TDB desde J2000; el proveedor usa km y km/s. La rotación de ejes al dibujar la escena ocurre después del cálculo científico. No se mezclaron estados aparentes con geométricos.

## Procedencia y orden de fuentes

Los archivos Voyager antiguos `Voyager_1.a54206u_V0.2_merged.bsp` y `Voyager_2.m05016u.merged.bsp` contienen segmentos con marco nativo **DE-118** y centros 399, 10 y baricentros 5–8. Los refits `vgr1.x2100.bsp` y `vgr2.x2100.bsp` incorporan segmentos J2000 y una cadena DE440 tardía. Los seis especializados `vgr1_jup230`, `vgr2_jup230`, `vgr1_sat337`, `vgr2_sat337`, `vgr2.ura182` y `vgr2_nep097` sólo cubren encuentros particulares. Todos los nombres exactos, hashes, tipos, marcos, centros, rangos ET/TDB, identificadores de segmento y orden de carga están en [spk-audit.json](../evidence/voyager-reference-reconciliation/spk-audit.json). Fueron inspeccionados con CSPICE N0067/SpiceyPy 8.3.0; el ejecutable `spkdiff` no está instalado en el entorno, por lo que no se atribuyen resultados a esa herramienta. La comparación de seis componentes equivalente está documentada en la evidencia SPICE existente.

| Familia de SPK | Segmentos DAF | Papel y límite |
|---|---:|---|
| Voyager 1 antiguo / Voyager 2 antiguo | 37 / 41 | Navegación planetaria archivada, centros y DE-118 nativos |
| `vgr1.x2100` / `vgr2.x2100` | 15 / 16 | Refit 2022; cobertura tardía, no reemplazo continuo del lanzamiento |
| `vgr1_jup230` / `vgr2_jup230` | 1 / 1 | Ventana joviana; faltan segmentos lunares necesarios para reconstruir los nueve vectores |
| `vgr1_sat337` / `vgr2_sat337` | 2 / 2 | Solución saturniana distinta de `sat441l` vigente |
| `vgr2.ura182` / `vgr2_nep097` | 13 / 18 | Soluciones distintas de `ura184_merged` y `nep098_merged` vigentes |

Los datos de producción no evalúan directamente estos SPK en tiempo de ejecución: reproducen respuestas de Horizons. `HistoricalEphemerisResolver` elige, entre las series que cubren cuerpo y fecha, la menor cadencia; desempata por prioridad declarada y longitud. `EphemerisProvider` verifica identidad y cobertura, exige muestras contiguas y usa Hermite cúbico para posición y velocidad; no extrapola. Esto hace que los archivos densos de encuentro prevalezcan sobre los cruceros de 1 o 5 días. Un SPK cargado en SPICE puede preferir el último segmento aplicable, por lo que **el orden de carga no equivale a la selección por cadencia** del catálogo JavaScript.

## Cobertura cronológica real de Voyager

Fechas en JD **TDB**, extremos inclusive; la tabla enumera **todos los 25 conjuntos de nave**. Los otros 24 conjuntos, principalmente planetas y lunas, están inventariados en `audit.json`. La cobertura global publicada empieza después de cada lanzamiento: Voyager 1 en **1977-09-05 14:00 TDB**, Voyager 2 en **1977-08-20 15:33 TDB**; ambas terminan en **2026-11-02 00:00 TDB**. La fase de ascenso anterior se declara visual, sin vector certificado.

| Nave | Conjunto | JD inicial | JD final | Paso s |
|---|---|---:|---:|---:|
| V1 | `hist-launch-v1-injection-1977` | 2443392.083333333 | 2443392.5 | 300 |
| V1 | `hist-launch-v1-departure-1977` | 2443392.5 | 2443400.5 | 3600 |
| V1 | `hist-cruise-v1-1977-1981` | 2443392.5 | 2444605.5 | 86400 |
| V1 | `hist-flyby-v1-jupiter-1979` | 2443933.5 | 2443942.5 | 1800 |
| V1 | `hist-flyby-v1-saturn-1980` | 2444551.5 | 2444560.5 | 1200 |
| V1 | `hist-bridge-v1-1981-min` | 2444605.500694444 | 2444605.541666667 | 60 |
| V1 | `hist-bridge-v1-1981-hours` | 2444605.541666667 | 2444606.5 | 3600 |
| V1 | `hist-cruise-v1-1981-1996` | 2444606.5 | 2450186.5 | 432000 |
| V1 | `hist-event-v1-palebluedot-1990` | 2447935.5 | 2447937.5 | 3600 |
| V1 | `hist-cruise-v1-1996-2011` | 2450186.5 | 2455766.5 | 432000 |
| V1 | `hist-cruise-v1-2011-2026` | 2455766.5 | 2461346.5 | 432000 |
| V2 | `hist-launch-v2-injection-1977` | 2443376.147916667 | 2443376.5 | 180 |
| V2 | `hist-launch-v2-departure-1977` | 2443376.5 | 2443384.5 | 3600 |
| V2 | `hist-cruise-v2-1977-1989` | 2443376.5 | 2447767.5 | 86400 |
| V2 | `hist-launch-v1-injection-1977` | 2443392.083333333 | 2443392.5 | 300 |
| V2 | `hist-launch-v1-departure-1977` | 2443392.5 | 2443400.5 | 3600 |
| V2 | `hist-flyby-v2-jupiter-1979` | 2444059.5 | 2444068.5 | 1800 |
| V2 | `hist-flyby-v2-saturn-1981` | 2444838.5 | 2444846.5 | 1200 |
| V2 | `hist-flyby-v2-uranus-1986` | 2446450.5 | 2446459.5 | 1200 |
| V2 | `hist-flyby-v2-neptune-1989` | 2447759.5 | 2447767.833333333 | 900 |
| V2 | `hist-bridge-v2-1989-min` | 2447767.834027778 | 2447767.875 | 60 |
| V2 | `hist-bridge-v2-1989-hours` | 2447767.875 | 2447771.5 | 3600 |
| V2 | `hist-cruise-v2-1989-2002` | 2447771.5 | 2452296.5 | 432000 |
| V2 | `hist-cruise-v2-2002-2014` | 2452296.5 | 2456821.5 | 432000 |
| V2 | `hist-cruise-v2-2014-2026` | 2456821.5 | 2461346.5 | 432000 |

El barrido de extremos encontró **un vacío catalogado por nave**: V1 `(2444605.5, 2444605.500694444)` = 59,999956 s; V2 `(2447767.833333333, 2447767.834027778)` = 60,000037 s. Entre fuentes con cobertura simultánea encontró 4 intervalos V1 y 7 V2. La diferencia de los archivos **de crucero interpolados** frente a los densos llega a **168 445,744 km y 4,697495 km/s** cerca de Júpiter V1; **24 579,357 km y 0,940293 km/s** cerca de Urano V2. Estos extremos miden la insuficiencia de una malla de un día en una región de fuerte curvatura, no una diferencia orbital entre SPK: las muestras densas tienen prioridad. Todos los intervalos y las dos comparaciones de seis componentes a igual fecha están en `audit.json`.

## Discrepancias, causas y estado antes/después

| Comprobación | Antes | Después de Etapa 08 | Interpretación |
|---|---:|---:|---|
| Refit V1, 1981-01-01 00:00–00:01 TDB | Salto heliocéntrico **65 176,826 km**; línea dibujada entre extremos | Salto físico de fuentes **igual**; estado interior ausente y línea cortada | Dos soluciones incompatibles; no se interpolan |
| Refit V2, 1989-08-29 08:00–08:01 TDB | Salto heliocéntrico **13 362,162 km**; línea dibujada entre extremos | Salto físico de fuentes **igual**; estado interior ausente y línea cortada | Igual |
| V1–Titán / V2–Tritón, resta antigua local | **−1 095,328 / −4 765,532 km** de distancia frente a directo | Contextos luna–nave directos ya aprobados, **sin cambio**; errores vectoriales en época de catálogo **0,058 / 0,008 m** | Cadenas de centros/soluciones distintas; no se aplicó traslación global |
| V2–Titania / V2–Miranda, resta antigua local | **+996,843 / −1 218,094 km** | Contextos directos ya aprobados, **sin cambio**; errores vectoriales **0,624 / 0,752 m** | Solución uraniana moderna distinta de cadena antigua |
| Especializados Saturno/Urano/Neptuno frente a Horizons actual | **49,703–119,146 km** | **Sin cambio** | `sat337`/`ura182`/`nep097` frente a `sat441l`/`ura184`/`nep098`; no son estados intercambiables |
| Borde Pale Blue Dot V1 / ventana de lanzamiento V2 | **0,537 / 0,098 km** | **Sin cambio** | Diferencias menores de selección/interpolación que aún exigen estudio |

La identidad de origen nominal «Sol» no prueba identidad de cadena dinámica. El cierre `(L−B)−(V−B)` con vectores directos del mismo baricentro fue `1,07e−9 km` máximo en 81 épocas. Un candidato que cambia el origen de la nave al baricentro planetario moderno aproxima la geometría local, pero introduce saltos de **11 a 13 566 km en 13 cambios de centro nativo**. Los seis SPK especializados producen **533,747–15 032,916 km** de salto al superponer sus 12 bordes al kernel de misión antiguo. Esto descarta ambos como arreglos globales automáticos. Las notas [previas](VOYAGER_REFERENCE_RECONCILIATION.md) documentan la derivación y los seis componentes de cada prueba. UTC→TDB contrastado con `str2et`/`naif0012.tls` difirió como máximo **26 μs** en los nueve eventos, insuficiente para explicar las discrepancias kilométricas. Las consultas y SPICE se compararon a la **misma época, objetivo, centro, marco, escala y corrección**.

## Exactitud numérica y nueve encuentros

Las 108 fechas V1 y 148 V2 de [global-continuity.json](../evidence/voyager-reference-reconciliation/global-continuity.json) incluyen comienzos, fechas anuales, trimestrales en la fase planetaria y extremos de archivo a ±1 s. En 106 V1 y 145 V2 había estado local válido **a la misma fecha** que la respuesta directa; los demás fueron estados ausentes en los refits. El residual refleja principalmente interpolación de los archivos conservados, no incertidumbre física de la órbita.

| Nave | Muestras válidas | Máximo posición km | Máximo velocidad km/s | Máximo relativo posición | Máximo relativo velocidad |
|---|---:|---:|---:|---:|---:|
| Voyager 1 | 106 | 0,537151 | 0,0003000 | 8,895×10⁻¹¹ | 6,887×10⁻⁶ |
| Voyager 2 | 145 | 3,926287 | 0,0003180 | 4,964×10⁻⁹ | 7,660×10⁻⁶ |

Las seis pruebas planetarias existentes confrontan **121 épocas por encuentro** de vector directo nave–planeta con la resta de nave y planeta referidos al mismo baricentro: cierre <`1e−6 km` en posición y <`1e−9 km/s` en velocidad. Esto es **cierre algebraico**, no cota de exactitud de la trayectoria heliocéntrica ni del SPK. Las pruebas también revisan continuidad en los bordes de los seis sobrevuelos y el salto en ambos refits. Se preservaron los nueve vectores **luna–nave** directos y sus 243 épocas retenidas. El reensayo de los 287 originales produjo máximo **2,714 m** y **0,0227 m/s**; distancias, direcciones y diámetros angulares locales no cambiaron porque no se editaron sus series, radios ni cámaras. El desglose de los nueve eventos (V1 Ío, Europa, Ganímedes, Calisto, Titán; V2 Europa, Titania, Miranda, Tritón) está en [relative-audit.json](../evidence/voyager-encounter-context/relative-audit.json). Su cota de regresión 3 m/0,025 m/s corresponde a residuos empíricos de interpolación de series directas retenidas, **no a precisión orbital certificada**.

Distancias **centro a centro** en las seis fechas de referencia UTC del catálogo, calculadas otra vez desde las 18 respuestas originales Horizons con SHA-256. La última columna es la resta de dos heliocéntricos de cadenas separadas **menos** el vector directo; no es error del vector directo.

| Encuentro | UTC | Directo km | Heliocéntricos separados km | Diferencia km |
|---|---|---:|---:|---:|
| V1–Júpiter | 1979-03-05 12:05:26 | 348 437,032 | 348 093,026 | −344,006 |
| V2–Júpiter | 1979-07-09 22:29:51 | 721 375,863 | 721 017,659 | −358,204 |
| V1–Saturno | 1980-11-12 23:46:30 | 184 033,255 | 183 546,141 | −487,114 |
| V2–Saturno | 1981-08-26 03:24:57 | 160 694,249 | 159 581,088 | −1 113,161 |
| V2–Urano | 1986-01-24 17:59:47 | 107 158,107 | 102 310,660 | −4 847,447 |
| V2–Neptuno | 1989-08-25 03:56:36 | 29 263,539 | 34 383,487 | +5 119,948 |

El valor directo de Neptuno equivale a **1,1819** radios de 24 760 km, compatible con los **1,18 radios redondeados** de [NASA NSSDCA](https://nssdc.gsfc.nasa.gov/planetary/voyager-periapse.html). La diferencia de ~46,7 km respecto de multiplicar exactamente `1,18 × 24 760` procede del redondeo de la razón publicada; no se usó ese dato redondeado para modificar la trayectoria.

## Cambio implementado y limitaciones

`loadMissionTrajectoryBackbone` señala sólo la arista que atraviesa cada vacío SPK, sin mover ni sustituir nudos. `HistoricalVisualPipeline` y `SolarSystem` transmiten esa bandera; `SpaceProbeVisual` dibuja segmentos independientes y convierte la arista no certificada en un segmento degenerado invisible. La trayectoria experimental sigue usando todas sus aristas. La prueba nueva verifica un corte por nave, ambos extremos contra estados científicos auténticos con residual <`1e−6 km` por coordenada y estado nulo en el interior. La política previa `spk_segment_transition` ya impedía atribuir un estado a ese minuto; no se modificó el FOV ni el HUD.

**Pendiente científico:** no hay una solución orbital global única que cierre simultáneamente la fase DE-118, el refit DE440, los centros planetarios modernos y las nueve lunas directas sin discontinuidades. Haría falta una reconstrucción de navegación publicada con cadena de kernels homogénea, prioridad documentada, observaciones de ajuste y covarianzas, y una validación externa de posiciones **y velocidades** a lo largo de las transiciones. Las discontinuidades de 0,537 y 0,098 km entre conjuntos menores permanecen; un borde de JD V2 puede dar `missing` en un entorno de ~40 μs por representación de doble precisión. No se introduce un redondeo que expanda cobertura física. La precisión numérica de la interpolación, el acuerdo con Horizons y la incertidumbre física son tres magnitudes diferentes. No se afirma exactitud absoluta ni continuidad global completa.

## Verificación ejecutada

- `node scripts/audit-voyager-stage8.mjs`: 49 conjuntos y 10 SPK íntegros; cobertura y solapamientos en `audit.json`.
- `node scripts/audit-voyager-encounter-frames.mjs`: 287 respuestas originales verificadas, 81 + 162 comparaciones locales; [registro](../evidence/voyager-stage8/local-encounters.log).
- `node --test tests/*.test.mjs`: **107/107 aprobadas**, incluidas fecha UTC/TDB, transformaciones, Hermite, posición/velocidad, encuentros y nueva arista SPK; [registro](../evidence/voyager-stage8/tests.log).
- `npm run build`: correcto, 82 módulos; permanece advertencia de tamaño de bloque >500 kB; [registro](../evidence/voyager-stage8/build.log).

No se ejecutó una nueva prueba visual en navegador: el corte de línea está verificado en los datos de entrada y compilación, pero su resultado renderizado queda por inspeccionar. No hubo ZIP, commit, push ni despliegue.
