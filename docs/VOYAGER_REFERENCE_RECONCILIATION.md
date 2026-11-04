# Reconciliación Voyager / SPK / Horizons

> **Actualización 2026-11-02:** este informe registra el estado anterior a la implementación de contextos locales. Los nueve encuentros lunares ya tienen vectores directos validados para las vistas Voyager. Véase [Geometría local Voyager–lunas](VOYAGER_ENCOUNTER_CONTEXTS.md). La trayectoria global y sus limitaciones de continuidad descritas aquí permanecen.

Entrega: 2 de noviembre de 2026. **Resultado: causa demostrada; reconciliación global pendiente.** No se sustituyeron trayectorias por una corrección que solo funciona durante un encuentro. Los 49 archivos de efemérides históricas conservan los SHA-256 registrados antes de esta intervención. El único cambio de producción está en la validez temporal del proveedor durante dos transiciones SPK.

## Resultado numérico de los nueve acontecimientos

Distancias **centro a centro**, en km; diferencia = local − Horizons. El error vectorial es `norm((L_local − V_local) − (L − V)_Horizons)`, no la diferencia entre distancias. Los horarios son los del catálogo, no necesariamente los máximos acercamientos ni horas de obturación verificadas. Los resultados locales siguen pendientes de reconciliación.

| Encuentro | UTC | Local km | Horizons km | Diferencia km | Error vectorial km | Estado |
|---|---|---:|---:|---:|---:|---|
| V1–Ío | 1979-03-05 12:05:26 | 159303.757 | 159220.448 | +83.309 | 383.598 | Pendiente |
| V1–Europa | 1979-03-04 18:00:00 | 1874256.001 | 1874145.559 | +110.443 | 383.202 | Pendiente |
| V1–Ganímedes | 1979-03-05 18:00:00 | 552539.988 | 552693.797 | −153.808 | 383.527 | Pendiente |
| V1–Calisto | 1979-03-03 12:00:00 | 4740551.394 | 4740388.502 | +162.893 | 382.794 | Pendiente |
| V1–Titán | 1980-11-12 05:41:21 | 5568.718 | 6664.046 | −1095.328 | 1355.963 | Pendiente |
| V2–Europa | 1979-07-09 12:00:00 | 307747.143 | 308044.212 | −297.069 | 424.267 | Pendiente |
| V2–Titania | 1986-01-24 06:00:00 | 636068.318 | 635071.476 | +996.843 | 5221.266 | Pendiente |
| V2–Miranda | 1986-01-24 12:00:00 | 353411.204 | 354629.298 | −1218.094 | 5221.325 | Pendiente |
| V2–Tritón | 1989-08-25 09:10:00 | 34969.042 | 39734.574 | −4765.532 | 13594.727 | Pendiente |

[CSV completo](../evidence/voyager-reference-reconciliation/encounter-comparison.csv) incluye JD TDB, etiqueta TDB, IDs NAIF, velocidades relativas locales/directas y residuos de velocidad. [encounters.json](../evidence/voyager-reference-reconciliation/encounters.json) conserva los seis componentes de cada estado, estados de planeta/luna/nave, las ocho cadenas de consulta, IDs de conjuntos y SHA de respuestas originales. Se compararon nueve épocas por acontecimiento: −24 h, −1 h, −15 min, −1 min, instante del catálogo, +1 min, +15 min, +1 h y +24 h.

## Fuentes reales, marcos y procesamiento

| Objeto / NAIF | Solución de los archivos locales y consultas |
|---|---|
| Voyager 1 / −31 | `Voyager_1_ST+refit2022_m` |
| Voyager 2 / −32 | `Voyager_2_ST+refit2022_m` |
| Tierra / 399, Luna / 301 | DE441 |
| Júpiter / 599; Ío, Europa, Ganímedes, Calisto / 501–504 | `jup365_merged` |
| Saturno / 699; Titán, Encélado / 606, 602 | `sat441l` |
| Urano / 799; Titania, Miranda / 703, 705 | `ura184_merged` |
| Neptuno / 899; Tritón / 801 | `nep098_merged` |

La adquisición histórica usa origen heliocéntrico nominal `500@10`, `REF_SYSTEM=ICRF`, `REF_PLANE=ECLIPTIC`, J2000, `TIME_TYPE=TDB`, `OUT_UNITS=KM-S`, `VEC_CORR=NONE`, posición y velocidad geométricas. SPICE se consulta en `ECLIPJ2000`, `NONE`, segundos TDB desde J2000. No se comparan posiciones aparentes ni se aplica tiempo de vuelo de la luz.

Las lunas históricas se almacenan como **planeta heliocéntrico local + luna relativa al centro planetario**, tanto en posición como en velocidad. Esta composición conserva luna–planeta, pero no hace compatible automáticamente la nave. Los 19 archivos lunares tienen cobertura limitada a ventanas históricas; no constituyen una efeméride lunar completa de 1977–2026. El inventario de los 49 conjuntos, coberturas, cadencias, soluciones y hashes está en [input-inventory.json](../evidence/voyager-reference-reconciliation/input-inventory.json).

`HistoricalEphemerisResolver.js` selecciona primero la menor cadencia entre conjuntos que cubren el cuerpo y la fecha; después `referencePriority` y extensión de la cobertura. `EphemerisProvider.js` conserva identidad, marco, unidades y fechas, rechaza huecos/extrapolación y proporciona las muestras. `HermiteInterpolation.js` interpola posición y su derivada con Hermite cúbico, en forma numéricamente estable. Los ejes de escena se transforman por `(x,y,z) → (x,z,−y)`; la comparación científica ocurre antes de esa rotación y no usa unidades gráficas.

## Causa demostrada, no inferida de una distancia

Los comentarios internos de `Voyager_1.a54206u_V0.2_merged.bsp` y `Voyager_2.m05016u.merged.bsp` identifican **DE118**. Los resúmenes DAF identifican centros nativos Tierra (`399`), Sol (`10`) y baricentros `5/6/7/8`; los segmentos antiguos emplean el marco SPICE ID 4, `DE-118`. CSPICE transforma ese marco a `ECLIPJ2000`: no se ha confundido directamente DE-118 con J2000.

Los SPK antiguos contienen su propia cadena de posiciones de los baricentros. En cambio, la consulta separada de un centro planetario moderno emplea la cadena de su solución satelital. Aunque los dos resultados nominalmente digan «Sol», no comparten necesariamente la misma realización dinámica. La [documentación de Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html#spacecraft-trajectories-in-horizons) advierte expresamente este problema de las trayectorias archivadas.

Con `V` = nave, `L` = luna, `P` = centro planetario, `B` = baricentro del sistema y `S` = Sol, se comprobó:

```
R_directo = (L − B)_Horizons − (V − B)_Horizons
B_moderno = (P − S)_Horizons − (P − B)_Horizons
V_candidato = B_moderno + (V − B)_Horizons
R_local − R_directo = error_de_cadena + error_de_interpolación
```

En las **81 épocas**, el cierre por baricentro común tiene máximo `1,07e−9 km` y `1,14e−14 km/s`. Usando la nave del **SPK original** y la luna baricéntrica de Horizons, el máximo residuo respecto del vector directo es **1,066 m** y `1,77e−8 km/s`. La diferencia entre el baricentro SPK antiguo y el moderno reconstruido explica el desplazamiento de cadenas con un cierre máximo de **0,604 m**. Esto demuestra la causa dominante con estados de seis componentes; no se ajustó una constante a la distancia escalar.

La inversión de objetivo/observador también se verificó en Titán, incluyendo la consulta heliocéntrica y la baricéntrica solar: no elimina el conflicto. Las respuestas originales están conservadas. La comparación SPICE/Horizons es una comprobación independiente de implementación y encadenamiento, **no una solución orbital observacional independiente**, pues ambos reutilizan el mismo archivo de nave.

Hay además una distinción que corrige la simplificación «todos los planetas usan DE441» del informe antiguo. En Titania, `799@10 − 799@7` difiere de `7@10` en **62,030 km**; en Miranda, **62,020 km**. Las [notas oficiales de Horizons](https://ssd.jpl.nasa.gov/horizons/news.html) documentan que desde URA183 los objetos uranianos usan implícitamente DE442 mientras la consulta del ID 7 sigue usando DE440/441, y que URA184 sustituyó esa solución en septiembre de 2025. NEP098 también incorpora DE442 según sus [comentarios oficiales](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/nep098_part-1.cmt); la diferencia de sus dos cadenas de baricentro es **0,094 km** en Tritón. Por tanto, sustituir simplemente por el baricentro genérico no es una reconciliación suficiente.

El parent uraniano DE442 incluido en `vgr2.ura182.bsp` se contrastó adicionalmente con la cadena implícita de URA184: queda hasta **0,184 km** de diferencia. No se atribuye a una versión concreta no inspeccionada de la fusión interna de Horizons. Esta diferencia menor queda registrada en `uranusDe442ParentChecks`, sin presentarla como identidad exacta.

## Tiempo y precisión de interpolación

Los UTC del catálogo se convierten mediante segundos intercalares, TT y TDB. La conversión local se contrastó con `str2et` y `naif0012.tls`: diferencia máxima **26 microsegundos** en los nueve UTC. La representación JD en doble precisión tiene pasos de unos 40 microsegundos en estas épocas. Ninguno de esos efectos explica cientos o miles de kilómetros. Se conservaron UTC, JD TDB y etiquetas de respuesta; todas las comparaciones de estados usan exactamente los JD solicitados.

En el instante de Titán, el término de interpolación nave–luna es **0,630 km**; en Tritón, **0,000636 km**. Sus errores de cadena dominan claramente. Se comprobó además el **interpolador JavaScript de producción** frente a estados interiores del SPK: cuartos y mitad de intervalos, en ventanas de aproximadamente ±2 h de cada acontecimiento, con cadencia actual, 5 min y 1 min. Son **8133 comparaciones** de diagnóstico, no una suite general del producto.

| Ventana | Paso actual | Máximo posición con paso actual km | Con 5 min km | Con 1 min km |
|---|---:|---:|---:|---:|
| V1 Ío | 30 min | 0.420671 | 0.000327 | 0.000005 |
| V1 Europa | 30 min | 0.003477 | 0.000005 | 0.000003 |
| V1 Ganímedes | 30 min | 0.125808 | 0.000105 | 0.000005 |
| V1 Calisto | 30 min | 0.000076 | 0.000002 | 0.000002 |
| V1 Titán | 20 min | 3.217983 | 0.074816 | 0.000151 |
| V2 Europa | 30 min | 0.005585 | 0.000006 | 0.000003 |
| V2 Titania | 20 min | 0.000414 | 0.000003 | 0.000003 |
| V2 Miranda | 20 min | 0.010654 | 0.000038 | 0.000001 |
| V2 Tritón | 15 min | 0.008849 | 0.000099 | 0.000002 |

Datos y máximos de velocidad: [interpolation.json](../evidence/voyager-reference-reconciliation/interpolation.json). Los valores de la tabla son **residuos de representación de la misma fuente**, no exactitud física de la órbita. No se instalaron las cadencias experimentales sobre una cadena global incompatible.

Para este diagnóstico se consideran adecuados `1e−6 km` y `1e−9 km/s` para comprobar el cierre algebraico directo; **2 m** y `1e−7 km/s` para reproducir las 81 consultas desde el SPK publicado, contemplando redondeo temporal y diferencias observadas de representación. Estos umbrales no son incertidumbres orbitales certificadas. Un error inferior a 1 m de interpolación es alcanzable en las ventanas de 1 min comprobadas; no está garantizado entre todos los puntos ni en el recorrido completo. Los grandes residuos locales incumplen ampliamente incluso una tolerancia de kilómetros.

## Por qué no se instaló la traslación baricéntrica

`V_candidato` reproduce la geometría de cada sistema durante sus encuentros; con la luna local interpolada quedan hasta **21,904 m** en las 81 muestras. No obstante, al aplicarlo de forma dependiente del centro nativo, cambia la traslación cuando el SPK pasa a un tramo heliocéntrico. Se evaluaron los **13 cambios de centro** previos al refit, en −60 s, −1 s, 0, +1 s y +60 s. Restando el avance cinemático de los dos segundos centrales:

| Nave / cambio de centro | Fecha TDB | Salto del candidato km |
|---|---|---:|
| V1, Tierra→Sol | 1977-09-08 | 11.828 |
| V1, Sol→5 / 5→Sol | 1979-01-14 / 1979-04-24 | 367.265 / 399.691 |
| V1, Sol→6 / 6→Sol | 1980-10-06 / 1980-12-20 | 1345.040 / 1367.808 |
| V2, Tierra→Sol | 1977-08-23 | 11.133 |
| V2, Sol→5 / 5→Sol | 1979-05-03 / 1979-09-15 | 402.811 / 445.518 |
| V2, Sol→6 / 6→Sol | 1981-07-04 / 1981-10-17 | 1421.116 / 1446.104 |
| V2, Sol→7 / 7→Sol | 1986-01-04 / 1986-02-14 | 5216.548 / 5226.177 |
| V2, Sol→8 | 1989-08-02 | 13565.558 |

En esos mismos límites, el SPK original mantiene cierre posicional de orden milimétrico o inferior. Las diferencias de velocidades a ambos lados están registradas; incluyen la aceleración durante esos dos segundos y no se etiquetan como impulsos físicos. Un suavizado de las traslaciones produciría una trayectoria nueva y velocidades derivadas de una función elegida arbitrariamente: no está autorizado ni constituye navegación reconstruida.

Los SPK `vgr1.x2100.bsp` y `vgr2.x2100.bsp`, descargados del [archivo oficial NAIF](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/), corresponden al refit de 2022 con DE440. Sus comentarios describen ajuste a datos hasta 1992 y extensión predictiva hasta 2100. **No cubren el lanzamiento ni todos los sobrevuelos anteriores.** Las consultas heliocéntricas directas de Horizons confirman en sus transiciones:

| Nave | Transición TDB | Residuo posicional km | Cambio de velocidad en 2 s km/s |
|---|---|---:|---:|
| V1 | 1981-01-01 00:00:00 | 65176.826 | 0.014883 |
| V2 | 1989-08-29 08:00:00 | 13362.162 | 0.001677 |

Son diferencias **heliocéntricas**; no deben compararse directamente con cifras antiguas calculadas respecto de otro origen. También se releyeron los seis SPK especializados `vgr1_jup230`, `vgr2_jup230`, `vgr1_sat337`, `vgr2_sat337`, `vgr2.ura182` y `vgr2_nep097`. Al superponer cada uno al SPK de misión antiguo, sus 12 bordes producen residuos entre **533,747 y 15032,916 km**. Los rangos, centros, marcos, comentarios y orden de carga están en [spk-audit.json](../evidence/voyager-reference-reconciliation/spk-audit.json). La prueba usa la prioridad real de SPICE: último archivo/segmento aplicable, según la [documentación SPK](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/spk.html). Tampoco es una solución global válida.

## Cobertura, continuidad y cambio implementado

La cobertura local de la nave empieza en **1977-09-05 14:00 TDB** para V1 y **1977-08-20 15:33 TDB** para V2, después del lanzamiento, y termina en **2026-11-02 00:00 TDB**. Se contrastaron **108 épocas de V1 y 148 de V2**, distribuidas en todo ese intervalo: comienzo, salida de Tierra, muestras anuales, muestras trimestrales de la fase planetaria y límites de los archivos a ±1 s. No se está certificando cada instante de 49 años ni la trayectoria atmosférica previa a la primera muestra.

Frente a la **misma consulta heliocéntrica**, el máximo residuo de interpolación de esas muestras fue **0,537 km** para V1 y **3,926 km** para V2. Esto no contradice los residuos nave–luna, pues son comparaciones distintas. Hay pequeños saltos por selección de conjuntos: aproximadamente **0,537 km** al salir de la ventana Pale Blue Dot y **0,098 km** al entrar V2 en la ventana de salida de V1. Se documentan como pendientes; no se ocultaron con una corrección de posición. Además, un redondeo de una unidad de JD junto al borde V2 puede producir `missing` durante unos 40 microsegundos; se mantiene la ausencia de extrapolación.

**Fallo corregido:** dentro del minuto de protección de cada transición al refit, el proveedor elegía la muestra del borde más próximo y la marcaba `isRealData: true`, aunque pertenecía a otra época. La telemetría conservaba la fecha solicitada. Ahora devuelve `status: spk_segment_transition`, **`state: null`, `isRealData: false`**, sin inventar un estado ni una velocidad. Los extremos conservan sus muestras auténticas. Se mantiene el aviso de transición y el manejo existente de datos no disponibles; no se editaron cámaras, HUD ni navegación. El estado puede estar no disponible durante esos intervalos: este cambio no elimina el salto de las soluciones originales.

Evidencia anterior y posterior: `global-continuity-before.json`, `global-continuity.json` y copia del proveedor anterior en la carpeta de evidencia. Prueba dirigida: ambas misiones, cinco puntos interiores y los extremos, incluida la telemetría del snapshot. No debe interpretarse esta corrección acotada como una reconciliación orbital.

## Entrega y reproducción

- Producción: `src/science/HistoricalEphemerisResolver.js`.
- Regresión puntual: `tests/VoyagerHistoricalMode.test.mjs`; se mantienen las pruebas anteriores.
- Documentación: este archivo y la nota de actualización en `docs/STAGE_06.md`.
- Scripts nuevos: `voyager-reference-utils.mjs`, `audit-voyager-reference-reconciliation.mjs`, `audit-voyager-spk-reference.py`, `audit-voyager-global-reference.mjs`, `audit-voyager-interpolation.mjs`, `summarize-voyager-reference-reconciliation.mjs`.
- [Evidencia](../evidence/voyager-reference-reconciliation/): respuestas originales, parámetros/URL/fecha/SHA, SPK 2022, comentarios de los diez SPK inspeccionados, fuentes oficiales archivadas, estados y resultados numéricos, CSV, registros y resumen `summary.json`. Los SPK anteriores se reutilizan desde `evidence/stage2-3/Kernels/` y sus hashes se verifican.

Comandos, desde la raíz del proyecto:

```text
node scripts/audit-voyager-reference-reconciliation.mjs
py scripts/audit-voyager-spk-reference.py
node scripts/audit-voyager-global-reference.mjs
node scripts/audit-voyager-interpolation.mjs
node scripts/summarize-voyager-reference-reconciliation.mjs
```

Python requiere `spiceypy==8.3.0` y NumPy. En esta máquina se usó `PYTHONPATH=%LOCALAPPDATA%\CodexScientificTools\voyager-spice`; no se añadió una dependencia de producción. Con la evidencia conservada, las consultas Horizons reutilizan sus archivos verificados. Si faltan respuestas, los dos scripts de consulta realizan peticiones reales y guardan los originales sin reemplazar archivos existentes.

**Verificaciones ejecutadas:** cuatro pruebas dirigidas de identidad/lanzamiento, UTC–TDB, transiciones SPK y reproducción temporal, **4/4 aprobadas**; `npm run build`, correcto con la advertencia preexistente de bloque mayor de 500 kB. Registros: `focused-tests.txt` y `build.txt`. Se verificaron los SHA de 130 peticiones originales y la conservación de los 49 archivos de efemérides. No se ejecutaron suites extensas, navegador, capturas ni empaquetado; no hubo commit, push o despliegue.

## Bloqueo científico que permanece

Falta una reconstrucción de navegación que conecte los tramos con una realización planetaria compatible y un ajuste validado de posiciones **y velocidades**. La existencia de una fuente oficial no demuestra que sea intercambiable con otra. Los candidatos comprobados no satisfacen simultáneamente los vectores directos, los planetas/lunas preservados y la continuidad global. No se afirma que sea imposible obtener una solución futura; se afirma que **no se obtuvo una solución fiable con las fuentes inspeccionadas**.

La mayor densidad temporal solo resolvería la parte de interpolación una vez elegida esa fuente coherente. Quedan pendientes los empalmes globales, las pequeñas discontinuidades entre cadencias, la diferencia residual entre la cadena URA184 y el parent DE442 comprobado, y cualquier incertidumbre orbital absoluta no publicada para esta combinación. La geometría nave–luna de producción **no cumple el criterio científico de aceptación**. Gemini dispone de los originales para una verificación independiente; no se ha anticipado su resultado ni iniciado otra etapa.
