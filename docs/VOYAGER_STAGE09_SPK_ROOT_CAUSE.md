# Etapa 09 — causa de los empalmes SPK de Voyager

**Fecha:** 5 de noviembre de 2026. **Base:** rama `revision/modo-historico-voyager`, HEAD `53063a8bc6e7ef793a4b5f81a5c4b03571ec769d`, con el cierre de Etapa 08 aún sin commit. No se modificaron efemérides, kernels, cálculos científicos ni comportamiento del simulador. Los cortes y controles de cobertura de Etapa 08 permanecen.

## Resultado científico

Los dos saltos son diferencias entre **soluciones oficiales distintas**, reproducidas con CSPICE sin pasar por el proveedor JavaScript. No se encontró un error de unidades, identidad, tiempo, transformación de marco, suma de centros o prioridad que permita suprimirlos. El viejo kernel **sí cubre** ambos minutos; la ausencia de cobertura que comunica el simulador significa que **su catálogo Horizons no contiene un estado global certificado y compatible con los dos extremos**. No significa que NAIF carezca de cualquier estado para esas fechas. Usar durante el minuto la vieja trayectoria aproximada, y volver después al refit, conservaría el salto. Dar preferencia al viejo kernel hasta 2026 produciría una curva sin ese empalme pero abandonaría la solución Horizons/refit 2022 y no resolvería su discrepancia científica.

| Sonda | Interior abierto sin estado global en el catálogo, TDB | JD TDB | Diferencia SPICE en el **mismo instante** | Diferencia de velocidad |
|---|---|---|---:|---:|
| Voyager 1 | 1981-01-01 00:00:00–00:01:00 | (2444605.5, 2444605.500694444) | 65 176,826154 km | 0,014882622 km/s |
| Voyager 2 | 1989-08-29 08:00:00–08:01:00 | (2447767.833333333, 2447767.834027778) | 13 362,162169 km | 0,001676506 km/s |

Las cifras de 65 176,826154 y 13 362,162169 km son la norma del **refit menos la solución antigua a la misma época**, no un movimiento ocurrido durante 60 segundos. Las cifras previas de Etapa 08 (65 176,826154 y 13 362,162169 km, redondeadas) se obtuvieron con estados a ±1 segundo y sustracción del desplazamiento esperado; coinciden en posición dentro de 0,000001 km. La diferencia de velocidades de Etapa 08 a ±1 segundo no es estrictamente la diferencia simultánea de la tabla.

## A. Identidad, procedencia y precedencia

Los identificadores son **−31 = Voyager 1** y **−32 = Voyager 2**. Las rutas, hashes SHA-256 de los cuatro kernels principales y los 49 conjuntos se conservan en [`spice-handoff-diagnostics.json`](../evidence/voyager-stage9/spice-handoff-diagnostics.json), [`spk-audit.json`](../evidence/voyager-reference-reconciliation/spk-audit.json) y [`audit.json`](../evidence/voyager-stage8/audit.json). Los límites siguientes son TDB/ET; los segmentos de nave son **SPK tipo 1** (*Modified Difference Arrays*), con marco nativo **DE-118, ID 4**, o **J2000, ID 1**. Los segmentos planetarios incorporados son tipo 2. Las épocas de empalme equivalen a **ET −599 572 800 s** (V1) y **ET −326 347 200 s** (V2) desde J2000 TDB.

| Empalme | Archivo/segmento de la nave | Centro | Marco nativo | Cobertura del segmento relevante | Procedencia |
|---|---|---:|---|---|---|
| V1 anterior | `Voyager_1.a54206u_V0.2_merged.bsp` / `vgr1_st.nio` | 10, Sol | DE-118 | 1980-12-20 16:45:19.847 a 1986-01-01 00:00:00 | Supertrayectoria de S. Mastousek, actualizada en 1987; modelo de cónicas parcheadas de precisión aproximada; planeta DE118; archivo proporcionado por J. Giorgini y publicado por NAIF en 2015. SHA `47c6f2be03668b50a1efb5f96978a2b68b2b501dae6f585841b1569baa3f4311`. |
| V1 posterior | `vgr1.x2100.bsp` / `pfile.nio` | 10, Sol | J2000 | 1981-01-01 00:00:00 a 2100-01-01 00:00:00 | Refit de R. Jacobson/JPL SSD, 2022, ajustado con datos del encuentro de Saturno a abril de 1992; DE440 incorporado; IOM 392R-22-002. SHA `aa8f37673b5ef60296d210566d01cc49f7b32711f37003393c3327616c9fc6d0`. |
| V2 anterior | `Voyager_2.m05016u.merged.bsp` / `vgr2_st.nio` | 8, baricentro de Neptuno | DE-118 | 1989-08-02 10:57:30.716 a 1989-09-16 20:56:57.938 | Misma supertrayectoria aproximada de 1987, con DE118; publicación NAIF de 2015. SHA `ce66cba12cf77bf3a1097f44142ef978f46656788ed08f9052238a102ed2e706`. |
| V2 posterior | `vgr2.x2100.bsp` / `pfile.nio` | 8, baricentro de Neptuno | J2000 | 1989-08-29 08:00:00 a 1989-10-19 08:27:54.431; después centro 10 hasta 2100 | Refit de R. Jacobson/JPL SSD, 2022, ajustado con datos del encuentro de Neptuno a octubre de 1992; DE440 incorporado; IOM 392R-22-002. SHA `391f5361773322e2242fb1c81578aeb1fbf9134c3878b2f325e9b8b5f46ad7cb`. |

Los comentarios originales de los kernels están preservados en [`evidence/voyager-reference-reconciliation/`](../evidence/voyager-reference-reconciliation/) y el [índice oficial NAIF](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/) confirma los archivos y [sus coberturas](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/aa_summaries.txt). En el diagnóstico se carga `naif0012.tls`, luego el viejo SPK, luego el refit. `spksfs` selecciona `vgr1_st.nio`/`vgr2_st.nio` para −600, −60, −10 y −1 s; desde 0 hasta +600 s selecciona `pfile.nio`. Al invertir la carga, el segmento antiguo gana incluso después de 0 s. Esto confirma la [regla de precedencia de SPICE](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/spk.html) y descarta un fallo de búsqueda del límite. La aplicación **no carga SPK en tiempo de ejecución**: sus muestras Horizons se capturaron con la solución compuesta `Voyager_1_ST+refit2022_m` / `Voyager_2_ST+refit2022_m` y el proveedor elige conjuntos por cobertura y cadencia.

| Extremo del catálogo | Conjunto Horizons utilizado | Cadencia | Época exacta TDB |
|---|---|---:|---|
| V1 anterior | `hist-cruise-v1-1977-1981` | 86 400 s | 1981-01-01 00:00:00 |
| V1 posterior | `hist-bridge-v1-1981-min` | 60 s | 1981-01-01 00:01:00 |
| V2 anterior | `hist-flyby-v2-neptune-1989` | 900 s | 1989-08-29 08:00:00 |
| V2 posterior | `hist-bridge-v2-1989-min` | 60 s | 1989-08-29 08:01:00 |

Los parámetros de adquisición preservados para los cuatro son `COMMAND='-31'` o `'-32'`, `CENTER='500@10'`, `TIME_TYPE='TDB'`, `REF_PLANE='ECLIPTIC'`, `REF_SYSTEM='ICRF'`, `OUT_UNITS='KM-S'`, `VEC_CORR='NONE'`, `EPHEM_TYPE='VECTORS'`, `VEC_TABLE='2'`. Sus cadenas completas `queryParameters`, hashes y nombres de solución están en [`input-inventory.json`](../evidence/voyager-reference-reconciliation/input-inventory.json) y en cada `.metadata.json` adyacente al JSON de producción. El marco de comparación es **ECLIPJ2000**, centro Sol (10), posiciones en km y velocidades en km/s. El [manual de Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html) define estas opciones de salida.

## B. Comparación numérica independiente

[`diagnose-voyager-stage9.py`](../scripts/diagnose-voyager-stage9.py) utiliza SpiceyPy 8.3.0 / **CSPICE N0067**. Para cada sonda obtiene los seis componentes con `spkezr(..., 'ECLIPJ2000', 'NONE', '10')`, inspecciona el segmento con `spksfs` y compara cada fuente a **−600, −60, −10, −1, 0, +1, +10, +60 y +600 s**. El refit comienza a 0: no se calculó un estado del refit antes de su cobertura. Los vectores y normas de cada muestra constan en el JSON. Esta es una comprobación independiente del proveedor JS; no se ejecutó `SPKDIFF`, que no está instalado.

| Magnitud | Voyager 1 | Voyager 2 |
|---|---:|---:|
| Refit − antiguo en el mismo instante, posición ECLIPJ2000 (km) | (−12 977,850310; +59 523,076528; +23 164,572724) | (−9 398,556767; −9 480,323172; +581,361413) |
| Norma de esa diferencia (km) | 65 176,826154 | 13 362,162169 |
| Norma de la diferencia de velocidad simultánea (km/s) | 0,014882622 | 0,001676506 |
| Separación de los extremos Horizons a 60 s (km) | 64 605,409688 | 13 634,601187 |
| Separación dividida entre 60 s (km/s) | 1 076,757614 | 227,243214 |
| Exceso respecto al desplazamiento predicho por las velocidades de los dos extremos (km) | 65 177,272185 | 13 362,138396 |
| Horizons anterior − SPICE antiguo, posición (km) | 0,000000246 | 0,000449707 |
| Horizons posterior − SPICE refit, posición (km) | 0,000941059 | 0,000164511 |

Las dos «velocidades» obtenidas dividiendo la separación por 60 s **no son velocidades físicas de la sonda**: combinan dos soluciones incompatibles. Los residuos Horizons–SPICE se aceptan con tolerancia de **0,002 km y 10⁻⁸ km/s**, que absorbe la precisión de JD en doble precisión y redondeo de exportación; no son incertidumbres astronómicas. Las cuatro comparaciones están por debajo de esos umbrales. La rotación J2000→ECLIPJ2000 con `sxform` cierra por debajo de `1,5×10⁻⁸ km`; la suma de estados nave→Neptuno + Neptuno→Sol cierra dentro de `1,5×10⁻⁷ km`. Por tanto, no se detecta una conversión de unidades, marco ni cadena de centros defectuosa.

El instante V1 `1981-01-01 00:00:00 TDB` equivale a `1980-12-31 23:59:08.816060 UTC` en CSPICE. El instante V2 `1989-08-29 08:00:00 TDB` equivale a `1989-08-29 07:59:03.817340 UTC`. La implementación UTC↔TDB, comprobada por las pruebas existentes, aplica los segundos intercalares correspondientes; las consultas Horizons y los SPK se compararon a la misma ET. Interpretar TDB como UTC habría desplazado los estados decenas de segundos, pero no explica estos resultados simultáneos.

### Descomposición de Voyager 2

Ambos segmentos de nave V2 tienen centro **8**. Al comparar las soluciones por separado en el empalme:

| Término refit − antiguo | Vector de posición ECLIPJ2000 (km) | Norma |
|---|---|---:|
| Nave relativa al baricentro de Neptuno | (−153,064268; +490,086769; +329,263084) | 609,940891 km |
| Baricentro de Neptuno relativo al Sol, DE440 frente a DE118 | (−9 245,492498; −9 970,409941; +252,098329) | 13 599,697037 km |
| Suma vectorial, nave relativa al Sol | (−9 398,556767; −9 480,323172; +581,361413) | 13 362,162169 km |

La mayor parte del salto heliocéntrico V2 está vinculada al cambio de efemérides planetarias **DE118→DE440**, junto con una diferencia real de 609,941 km entre soluciones de navegación relativas al mismo baricentro. Las normas no se suman: los vectores tienen direcciones distintas. En V1 ambos segmentos son heliocéntricos, de modo que los 65 176,826154 km son directamente diferencia entre trayectorias de la nave.

## C. Alternativas oficiales examinadas

- **Kernel viejo continuo:** los SPK de 2015 cubren físicamente ambos minutos y se extienden a 2031. Su propia documentación califica el tramo de 1987 como trayectoria de diseño de precisión aproximada. Continuarlo hasta el futuro en lugar del refit de 2022 contradice los vectores Horizons posteriores y no aporta una solución homogénea de navegación moderna. Se preserva como fuente histórica y contraste.
- **Refits `x2100`:** comienzan exactamente en 1981-01-01 00:00 V1 y 1989-08-29 08:00 V2. No suministran estados anteriores para conectar con el tramo desde el lanzamiento; sus ajustes posteriores no demuestran continuidad con la supertrayectoria de 1987.
- **`vgr2_nep097.bsp`:** kernel oficial de R. Jacobson/JPL SSD (2022), ya preservado y con hash `evidence/stage2-3/Kernels/vgr2_nep097.bsp.request.json`; cubre el empalme de Neptuno y es consistente con DE440 y NEP097 según sus comentarios. En la época exacta del corte difiere **13 322,542857 km** del viejo kernel y **50,943917 km** del refit. Puede ser adecuado para un análisis local de Neptuno, pero no elimina la discrepancia global de los extremos. No se instaló como sustituto de Horizons.
- **Seis SPK especializados de encuentros:** sus coberturas y discrepancias de bordes están en el [`spk-audit.json` anterior](../evidence/voyager-reference-reconciliation/spk-audit.json). V1 `vgr1_sat337` termina en noviembre de 1980; los demás de Júpiter, Saturno y Urano tampoco abarcan V1 enero de 1981 o V2 agosto de 1989. `vgr2_nep097` es la excepción analizada arriba.
- **Versiones anteriores `voyager_1.ST+1991_a54418u.merged.bsp` y `voyager_2.ST+1992_m05208u.merged.bsp`:** el [catálogo NAIF](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/aa_summaries.txt) indica cobertura de los empalmes, y los comentarios de los merged actuales identifican la misma supertrayectoria anterior con pfiles posteriores de 1991/1992. No se descargaron ni se compararon numéricamente en esta etapa; queda abierta la posibilidad de examinar sus diferencias de detalle. No hay evidencia de que cierren los saltos frente a los refits 2022.

Los kernels nuevos no se incorporaron porque ninguna alternativa verificada satisface la continuidad con las fuentes de producción. Los archivos consultados son públicos en el archivo oficial NAIF; no se encontró una licencia específica en los comentarios SPK preservados. No se adquirieron archivos nuevos, así que la integridad de los diez originales sigue expresada por sus SHA-256 registrados.

## D. Corrección y estado final

**No se efectuó ninguna corrección de trayectoria.** El diagnóstico indica incompatibilidad de soluciones, no un defecto de integración demostrado. El catálogo sigue sin un estado global interior; el resolver rechaza ese interior, la polilínea se corta y la reproducción muestra una pausa explícita. En el navegador, el seguimiento, primera persona, ficha de datos, cámara y reanudación ya quedaron verificados en [el cierre visual de Etapa 08](VOYAGER_STAGE08_VISUAL_CLOSEOUT.md), con [capturas auténticas](../evidence/voyager-stage8/browser/). Como no cambió el comportamiento, no se repitió la validación visual. Los modos principales conservan la cobertura funcional que comprueban las 107 pruebas.

**La trayectoria global 1977–2026 de ninguna de las dos Voyager puede considerarse científicamente continua con el catálogo actual.** Esto es distinto de un error de renderizado: la representación de Etapa 08 evita atribuir al vehículo una posición no sustentada entre soluciones.

## E. Regresión y evidencia reproducible

Se ejecutaron en esta computadora:

```text
python scripts/diagnose-voyager-stage9.py   # SpiceyPy 8.3.0 / CSPICE N0067
node scripts/audit-voyager-stage8.mjs
node --test tests/*.test.mjs
npm run build
```

El intérprete Python de la primera línea debe tener SpiceyPy 8.3.0; en esta ejecución se instaló en un entorno virtual temporal **fuera del repositorio**. El script comprueba hashes de los SPK que compara, parámetros y estados Horizons, precedencia en ambos órdenes de carga y residuos con tolerancias explícitas. [`spice-handoff-diagnostics.json`](../evidence/voyager-stage9/spice-handoff-diagnostics.json) contiene los estados de seis componentes y las muestras ±1/10/60/600 s. Los registros de [`tests-107.log`](../evidence/voyager-stage9/tests-107.log), [`hash-and-encounter-audit.log`](../evidence/voyager-stage9/hash-and-encounter-audit.log) y [`build.log`](../evidence/voyager-stage9/build.log) conservan la ejecución.

| Control | Resultado |
|---|---|
| Hashes de conjuntos de producción | **49/49** verificados |
| Hashes de SPK originales | **10/10** verificados |
| Pruebas automatizadas existentes | **107/107** correctas; 0 fallas |
| Aproximaciones planetarias | **6/6** presentes en `audit.json`; sus distancias directas se conservaron. Las diferencias conocidas al restar estados heliocéntricos de otras soluciones permanecen. |
| Encuentros lunares | **9/9** cubiertos por las pruebas existentes y por 81 épocas de la auditoría SPICE previa; no se modificaron los nueve vectores luna–nave. |
| Compilación | `vite build` correcta; aviso no bloqueante de tamaño del bundle |

Entre discrepancias previas que quedan abiertas están **0,537151 km y 0,098132 km** en comparaciones menores de bordes/conjuntos, más las diferencias de contextos planetarios descritas en [la reconciliación anterior](VOYAGER_TRAJECTORY_RECONCILIATION.md). Aprobar pruebas de software y reproducir SPK con CSPICE no constituye certificación de exactitud astronómica absoluta. Para certificar una trayectoria continua se necesitaría una reconstrucción oficial única desde antes de cada empalme hasta después, con observaciones, marco, centros, prioridades, covarianza y validación externa de posición y velocidad. Hasta entonces deben conservarse exactamente los cortes honestos de Etapa 08.
