# Etapa 09B — kernels históricos alternativos de Voyager

**Fecha:** 5 de noviembre de 2026. **Proyecto:** Simulador de Sondas Espaciales, Modo Histórico 1977–2026. **Base local:** `revision/modo-historico-voyager`, HEAD `53063a8bc6e7ef793a4b5f81a5c4b03571ec769d`, con trabajo de Etapas 08 y 09 todavía sin commit. Esta investigación no modificó el proveedor, las efemérides de producción, los diez SPK originales ni la interfaz.

## 1. Objetivo y conclusión

Se evaluaron archivos históricos oficiales de NAIF que cruzan los empalmes **1981-01-01 00:00:00 TDB** (Voyager 1, NAIF −31) y **1989-08-29 08:00:00 TDB** (Voyager 2, NAIF −32). Se buscaron soluciones con cobertura real, procedencia documentada y acuerdo con los refits 2022 y las referencias Horizons ya validadas. **No apareció una fuente que justifique una trayectoria global científicamente continua para ninguna de las dos sondas.** Los cortes de Etapa 08 permanecen.

La cobertura matemática y la exactitud histórica son cuestiones separadas: `vgr1_st.bsp` y `vgr2_st.bsp` suministran estados por el minuto y hasta 2049, pero son supertrayectorias aproximadas de diseño. Los merged de 2013 y las supertrayectorias reproducen *exactamente* el mismo estado antiguo en el empalme, de modo que no reducen el salto frente al refit. Los kernels especializados de Saturno y Neptuno dan estados alternativos, pero ninguno coincide en posición y velocidad con ambos tramos de producción; además tienen cobertura local y discrepancias en encuentros. La evidencia numérica está en [`spice-alternative-comparison.json`](../evidence/voyager-stage9b/spice-alternative-comparison.json) y en la [tabla completa de vectores por offset](../evidence/voyager-stage9b/all-offset-comparisons.csv).

La aplicación usa el [catálogo histórico](../public/data/historical-ephemerides-catalog-v1.json), no carga SPK en tiempo de ejecución. [`HistoricalEphemerisResolver.js`](../src/science/HistoricalEphemerisResolver.js) elige un conjunto por cobertura y cadencia; [`VoyagerHistoricalMissions.js`](../src/science/VoyagerHistoricalMissions.js) impide resolver el interior abierto de cada empalme. Para V1, `hist-cruise-v1-1977-1981` termina en **JD TDB 2444605.5** y `hist-bridge-v1-1981-min` comienza en **2444605.500694444**. Para V2, `hist-flyby-v2-neptune-1989` termina en **2447767.833333333** y `hist-bridge-v2-1989-min` comienza en **2447767.834027778**. La línea y los controles de Etapa 08 respetan esos intervalos; los SPK de este estudio son contrastes independientes.

## 2. Fuentes oficiales, inventario e integridad

Se consultaron el [archivo Voyager SPK vigente](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/), su carpeta [a_older_versions](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/a_older_versions/), el [resumen oficial de coberturas](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/aa_summaries.txt) y la [guía NAIF de selección de kernels](https://naif.jpl.nasa.gov/naif/kernel_selection.html). Se descargaron **11 binarios oficiales**: diez del archivo Voyager y `de421.bsp` como cadena planetaria necesaria para `vgr2_nep081.bsp`. El ya conservado `vgr2_nep097.bsp` se volvió a verificar, sin descargarlo. Los archivos retienen sus nombres originales en [`evidence/voyager-stage9b/Kernels/`](../evidence/voyager-stage9b/Kernels/). El [manifiesto](../evidence/voyager-stage9b/kernel-manifest.csv) registra para **cada descarga** URL, bytes, SHA-256 completo, fecha HTTP y fecha de adquisición; cada `.request.json` adyacente permite comprobarla de nuevo. El [inventario CSPICE](../evidence/voyager-stage9b/alternative-kernel-inventory.json) contiene todos sus segmentos, IDs, centros, marcos, tipos y límites ET/TDB. Sus comentarios originales se extrajeron a archivos `.comments.txt` en la misma carpeta de evidencia.

| Archivo oficial y URL base | Bytes | SHA-256 | Uso en esta evaluación |
|---|---:|---|---|
| [voyager_1.ST+1991_a54418u.merged.bsp](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/voyager_1.ST%2B1991_a54418u.merged.bsp) | 5 268 480 | `35c471f379c27f2215504be6ed63fce839c6b2ad231110ea91c8355d36ef8a8c` | Empalme V1; supertrayectoria + pfile de 1991 |
| [voyager_2.ST+1992_m05208u.merged.bsp](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/voyager_2.ST%2B1992_m05208u.merged.bsp) | 5 330 944 | `727e014fbdbfc398437fcdccd7324df88b1be70faafcce8d2567a12d6ade50cf` | Empalme V2; supertrayectoria + pfile de 1992 |
| [vgr1_st.bsp](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/a_older_versions/vgr1_st.bsp) | 8 885 248 | `819e178a81027f48fca683026d1c6573619365cf6410d576c3893b25b97c3b7d` | Solución única V1 hasta 2049 |
| [vgr2_st.bsp](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/a_older_versions/vgr2_st.bsp) | 9 020 416 | `6bafebc64c27281ea85d90ddea7b1663b504255b5b67f2a4848ba42e56ed79e5` | Solución única V2 hasta 2049 |
| [vg1_sat.bsp](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/a_older_versions/vg1_sat.bsp) | 2 329 600 | `474ebbadd105b5c4b014ba2cbbdb371604880e701c368ff5a0a2c15b6059394f` | Tramo V1 Saturno que cruza parte del minuto |
| [vg2_nep.bsp](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/a_older_versions/vg2_nep.bsp) | 2 001 920 | `235ce2311d68ea4ceb4ef91efffb4fda03eb3ca6ad4d93d5aa78225fa53ec273` | Tramo V2 Neptuno con DE130 |
| [vgr2_nep081.bsp](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/vgr2_nep081.bsp) | 850 944 | `9d39fab0f3132d8f88c341ce7fc3106c465ca21f04650d8f3ae8940601d5e5e6` | Tramo V2 Neptuno 2009 |
| [de421.bsp](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/a_old_versions/de421.bsp) | 16 790 528 | `08b20db2ae22488650641c5a9033e5bfda4b1c4b440cfeaf20f621cfa18ecdb3` | Sólo centro planetario para NEP081 |
| [vgr1_saturn.bsp](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/a_older_versions/vgr1_saturn.bsp), [vgr1_sat261.bsp](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/a_older_versions/vgr1_sat261.bsp), [vgr1.sat286.bsp](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/a_older_versions/vgr1.sat286.bsp) | 486 400; 479 232; 479 232 | SHA completos en el manifiesto | Excluidos tras inspección: terminan el 20-XI-1980 |

El kernel ya existente [vgr2_nep097.bsp](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/vgr2_nep097.bsp) (1 469 440 bytes; SHA-256 `1aee50e5e4a5253c660d06f7359eb4dac2fe4a5dab5fdc821d2b868469bdc473`) se incluyó en la comparación. Los `*.xsp` del archivo antiguo son formatos de transferencia de la misma familia de archivos; no se usaron como nuevas soluciones. Los archivos de Júpiter, Saturno V2 y Urano V2 están asociados a otros encuentros y no se descargaron para estos empalmes. Por ello la evaluación cubre **todos los candidatos plausibles identificados para estas fechas**, pero no constituye una inspección binaria de cada objeto listado en el archivo NAIF.

## 3. Cobertura, segmentos y procedencia

Los segmentos de nave siguientes son **SPK tipo 1**. Los kernels merged y `*_st.bsp` llevan también segmentos planetarios tipo 2. `vgr2_nep081.bsp` contiene sólo la nave relativa al baricentro de Neptuno; se cargó **DE421 oficial** como cadena 8→10. No se mezcló con DE440 para su estado solar. Los marcos nativos DE-118 (ID 4), DE-111 (ID 8), DE-130 (ID 12) y J2000 (ID 1) se transformaron mediante CSPICE a ECLIPJ2000.

| Candidato y sonda | Segmento seleccionado en el empalme | Centro NAIF | Marco | Cobertura relevante TDB | Procedencia/alcance |
|---|---|---:|---|---|---|
| Merged 2013 V1 | `vgr1_st.nio` | 10 | DE-118 | 1980-12-20 16:45:19.847–1986-01-01 00:00:55.183; `pfile_a54418u.nio` hasta 2021-01-01 | Supertrayectoria de S. Matousek (1987), cónicas parcheadas de precisión aproximada. Pfile posterior basado en seguimiento 1986–1992, IOM 314.7-175. Archivo merged creado 2004 y publicado en el índice NAIF 2013. |
| `vgr1_st.bsp` | `vgr1_st.nio` | 10 | DE-118 | 1980-12-20 16:45:19.847–2049-12-31 | Misma supertrayectoria aproximada, compilada 1996 y archivada 1999; DE118. |
| `vg1_sat.bsp` | `T801202` | 10 | DE-111 | 1980-12-20 16:48:13.887–1981-01-01 00:00:51.183 | Segmento de Saturno anterior; archivo del índice 1996 sin comentarios internos de precisión. **Termina 8,817 s antes** del extremo posterior Horizons. |
| Merged 2013 V2 | `vgr2_st.nio` | 8 | DE-118 | 1989-08-02 10:57:30.716–1989-09-16 20:56:57.938; `pfile_m05208u.nio` desde 1990-01-23 hasta 2021-01-05 | Misma supertrayectoria aproximada. Pfile de equipo de navegación basado en seguimiento 1990–1992, IOM 314.7-227; el empalme de 1989 aún está en `vgr2_st.nio`. |
| `vgr2_st.bsp` | `vgr2_st.nio` | 8 | DE-118 | 1989-08-02 10:57:30.716–1989-09-16 20:56:57.938; luego centro 10 hasta 2049-12-31 | Supertrayectoria aproximada de 1987, compilada 1996 y archivada 1999; DE118. |
| `vg2_nep.bsp` | `T891004` | 8 | DE-130 | 1989-06-30 23:27:24.367–1989-10-03 00:00:56.182 | Kernel de encuentro Neptuno de archivo 1999, con cadena planetaria DE130 y segmentos de satélites. Documentación interna escasa. |
| `vgr2_nep081.bsp` + `de421.bsp` | `vgr2.nep081.nio` | 8 | J2000 | 1989-06-30 23:27:23.382–1989-10-01 12:00:00 | Reconstrucción 2009 de R. Jacobson con Doppler, rango, VLBI y ocultaciones; consistente con NEP081 y DE421 según los comentarios oficiales. |
| `vgr2_nep097.bsp` (ya conservado) | `pf` | 8 | J2000 | 1989-06-30 23:27:24.263–1989-10-01 12:00:00 | Reconstrucción 2022 de R. Jacobson para NEP097; incluye DE440 y satélites Neptuno. |

Los tres `vgr1_saturn`/`sat261`/`sat286` terminan **1980-11-20 00:00:00 TDB**, por lo que no cubren el corte V1. El inventario JSON preserva la lista de **todos** los segmentos internos, incluidos los de centros planetarios y satélites, y sus fechas exactas. La documentación del merged describe explícitamente la precisión aproximada de la supertrayectoria; la fecha más reciente de un archivo no se tomó como medida de exactitud.

## 4. Método CSPICE y referencias Horizons

[`audit-voyager-stage9b-alternatives.py`](../scripts/audit-voyager-stage9b-alternatives.py) verifica SHA, descarga sólo los candidatos indicados y extrae inventario/comentarios. [`compare-voyager-stage9b.py`](../scripts/compare-voyager-stage9b.py) vuelve a comprobar los SHA y llama a `spkezr` y `spksfs` de **SpiceyPy 8.3.0 / CSPICE N0067**. Se usaron exactamente el mismo ET/TDB, **centro Sol (10), ECLIPJ2000, aberración NONE, km y km/s**. Para cada alternativa se evaluaron **−600, −60, −10, −1, 0, +1, +10, +60 y +600 s**; las muestras fuera de cobertura son nulas, no extrapoladas. El CSV conserva para cada comparación sus seis diferencias vectoriales y normas. El JSON registra además los estados, segmento seleccionado, prioridad al invertir el orden de carga, cierre de la cadena de centros y continuidad interna de la solución.

Las [seis consultas planetarias originales](../evidence/stage2-2/ConsultasOriginales/) se volvieron a verificar por SHA-256. **Su primera columna es JDUT, no JD TDB**, porque las solicitudes usan `TIME_TYPE='UT'`. Para compararlas se convirtió la etiqueta UTC a ET con `str2et` y `naif0012.tls`; interpretarlas como TDB daría un desplazamiento temporal falso. Los nueve conjuntos [luna–nave de Horizons](../evidence/voyager-reference-reconciliation/encounters.json) ya están en JD TDB. Parámetros originales (`COMMAND`, `CENTER`, `REF_SYSTEM`, `REF_PLANE`, `VEC_CORR`, unidades, tiempos) y SHA de cada consulta están en los `.request.json` y en el JSON de comparación. El [manual de Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html) documenta los sistemas de tiempo y vectores.

Se considera coincidencia **numérica** de estados preservados dentro de 0,002 km y 10⁻⁸ km/s, por el redondeo de exportación y JD doble; **no** es un límite de incertidumbre de navegación ni autoriza declarar continuidad. Todas las separaciones residuales decisivas de la tabla siguiente son de decenas a decenas de miles de km, muy superiores a esa tolerancia. El cierre nave→centro + centro→Sol de los candidatos evaluados fue menor de `2×10⁻⁶ km`, por lo que no se atribuyen los saltos a una suma de centros equivocada.

## 5. Comparación numérica en los empalmes

Las normas siguientes se miden a **la misma época exacta**, no entre fotogramas. Un cero para los merged/ST significa igualdad de estado con el kernel antiguo en ese instante. La velocidad es la norma de la **diferencia vectorial de velocidades**.

| Sonda / candidato | Δ posición vs antiguo en 0 s (km) | Δ posición vs refit en 0 s (km) | Δ velocidad vs refit (km/s) | Δ posición vs refit en +60 s (km) |
|---|---:|---:|---:|---:|
| V1 merged 2013 `a54418u` | 0 | 65 176,826154 | 0,014882622 | 65 177,719066 |
| V1 `vgr1_st` | 0 | 65 176,826154 | 0,014882622 | 65 177,719066 |
| V1 `vg1_sat` | 64 474,871967 | 854,981502 | 0,000133661 | **sin cobertura** |
| V2 merged 2013 `m05208u` | 0 | 13 362,162169 | 0,001676506 | 13 362,114912 |
| V2 `vgr2_st` | 0 | 13 362,162169 | 0,001676506 | 13 362,114912 |
| V2 `vg2_nep` / DE130 | 14 052,429674 | 1 026,592652 | 0,000135017 | 1 026,600665 |
| V2 `vgr2_nep081` / DE421 | 13 346,558625 | 297,411558 | 0,000111821 | 297,417666 |
| V2 `vgr2_nep097` / DE440 | 13 322,542857 | 50,943917 | 0,000090886 | 50,945237 |

**Prioridad real:** al cargar antiguo→alternativo→refit, `spksfs` elige `pfile.nio` desde 0 s; al cargar antiguo→refit→alternativo, el último segmento gana donde el alternativo tenga cobertura. `vg1_sat` deja de ganar antes de +60 s porque termina a +51,183 s. Invertir el orden de carga no reconcilia ninguna solución: sólo decide cuál de los estados incompatibles se muestra. Los **72 pares candidato–época** y sus **144 comparaciones con antiguo/refit**, incluidos ±1/10/60/600 s, figuran con vectores completos en el CSV y JSON citados.

### Cadena de centros V2

En el empalme V2 los cuatro candidatos especializados tienen centro **8**. Esta tabla separa la diferencia nave→Neptuno de la diferencia Neptuno→Sol frente al refit 2022; las magnitudes no se suman escalarmente.

| Solución V2 | Δ nave→baricentro 8 (km) | Δ baricentro 8→Sol (km) | Δ heliocéntrico total (km) |
|---|---:|---:|---:|
| Antiguo DE118 | 609,940891 | 13 599,697037 | 13 362,162169 |
| `vg2_nep` DE130 | 23,999767 | 1 029,881014 | 1 026,592652 |
| NEP081 + DE421 | 41,611713 | 276,624746 | 297,411558 |
| NEP097 + DE440 | 50,943917 | 0 | 50,943917 |

La reducción aparente del salto al cambiar el centro planetario no prueba que la trayectoria de nave del candidato coincida con el refit. En particular, la alternativa DE130 aún difiere 23,999767 km **en el mismo centro 8**, y la DE421 41,611713 km. Reemplazar sólo el centro por DE440 mezclando modelos no está respaldado por esos kernels.

## 6. Una sola solución durante el minuto y hasta 2026

La comprobación de desplazamiento interno resta al desplazamiento medido el movimiento predicho por las velocidades de *la misma* solución; el residuo no se usa como criterio de exactitud astronómica. Los merged de 2013 y `*_st` tienen residuos inferiores a `0,000002 km` entre −1 y +1 s y entre 0 y +60 s. `vg1_sat` es internamente continuo entre −1 y +1 s, pero **termina antes de +60 s**. Los tres kernels de Neptuno también son internamente continuos en esas ventanas. Esto demuestra sólo continuidad **matemática local** de cada kernel, no compatibilidad con los dos extremos Horizons.

| Solución única o reemplazo local | Problema al extenderla |
|---|---|
| Merged V1 2013 | Mismo salto de 65 176,826154 km frente al refit en 1981; otro residuo de empalme de **2 268 440,404 km** al pasar a `pfile_a54418u.nio` en 1986; termina en 2021. |
| Merged V2 2013 | Mismo salto de 13 362,162169 km frente al refit en 1989; otro residuo de **39 219,971 km** al pasar a `pfile_m05208u.nio` en 1990; termina en 2021. |
| `vgr1_st` hasta noviembre de 2026 | Estado matemáticamente disponible, pero difiere **18 875 652,567 km** y **0,013032033 km/s** del vector Horizons de 2026-11-02. |
| `vgr2_st` hasta noviembre de 2026 | Estado disponible, pero difiere **854 650,371 km** y **0,003339851 km/s** del vector Horizons de 2026-11-02. |
| `vg1_sat` | Al entrar en su cobertura ya difiere **12 307,613 km** del antiguo; al terminar queda a **854,978 km** del refit. La cobertura se agota antes del extremo +60 s. |
| `vg2_nep`, NEP081, NEP097 | En el mismo instante del empalme aún difieren del antiguo **14 052,430**, **13 346,559** y **13 322,543 km**; y del refit **1 026,593**, **297,412** y **50,944 km**. Cada uno termina en 1989, de modo que requeriría otro empalme posterior. |

Los grandes residuos en los pfiles de 2013 se calcularon a ±1 s de sus límites restando el movimiento predicho por ambas velocidades. Son incompatibilidades entre segmentos oficiales, no desplazamientos físicos de las sondas. Los estados finales de 2026 se compararon con el último vector preservado y verificado por SHA de `hist-cruise-v1-2011-2026` y `hist-cruise-v2-2014-2026`.

## 7. Contraste con encuentros planetarios y lunares

Las seis distancias planetarias **directas** Horizons permanecen sin cambio en producción. En los mismos instantes UTC convertidos correctamente a ET, los merged/ST alternativos coinciden con el vector heliocéntrico de nave Horizons a menos de **0,001 km** en los seis casos cubiertos. El candidato V1 Saturno difiere **371,253 km** en la aproximación de Saturno; los especializados V2 Neptuno difieren **14 268,290 km** (DE130), **13 601,599 km** (DE421) y **13 595,136 km** (NEP097) del vector heliocéntrico Horizons del encuentro. Esas diferencias V2 incluyen **cambio de planeta/modelo** y no deben atribuirse íntegramente a la nave.

| Aproximación | Fecha UTC de la consulta | Distancia directa Horizons (km) | Δ nave merged/ST vs Horizons (km) | Alternativa local cubierta: Δ nave heliocéntrica (km) |
|---|---|---:|---:|---:|
| V1 Júpiter | 1979-03-05 12:05:26 | 348 437,032 | 0,000095 | — |
| V2 Júpiter | 1979-07-09 22:29:51 | 721 375,863 | 0,000204 | — |
| V1 Saturno | 1980-11-12 23:46:30 | 184 033,255 | 0,000871 | `vg1_sat`: 371,253 |
| V2 Saturno | 1981-08-26 03:24:57 | 160 694,249 | 0,000665 | — |
| V2 Urano | 1986-01-24 17:59:47 | 107 158,107 | 0,000178 | — |
| V2 Neptuno | 1989-08-25 03:56:36 | 29 263,539 | 0,000569 | DE130: 14 268,290; DE421: 13 601,599; NEP097: 13 595,136 |

El JSON también calcula una distancia de nave candidata a **planeta heliocéntrico Horizons**. Es una comparación de fuentes mezcladas: por ejemplo, el viejo estado de nave frente al centro planetario Horizons difiere de la consulta relativa directa en hasta 5 119,948 km. Esa distancia híbrida **no** se toma como distancia certificada de encuentro. La distancia directa y la fecha histórica siguen siendo la referencia; no se buscaron nuevas fechas de mínimo con cada solución, pues exigirían una cadena planetaria y satelital homogénea y validación externa adicional.

Para los **nueve encuentros lunares**, se comparó cada candidato con los nueve tiempos por evento conservados de Horizons, usando nave y luna referidas al mismo baricentro y la distancia **directa** como referencia. La tabla muestra el máximo valor absoluto de `distancia candidata − distancia directa` en km. «—» indica que el candidato carece de cobertura; no se extrapoló.

| Encuentro luna–nave | Época UTC de referencia | Merged/ST de la sonda (km) | Kernel especializado del encuentro (km) |
|---|---|---:|---:|
| V1 Ío | 1979-03-05 12:05:26 | 0,000638 | — |
| V1 Europa | 1979-03-04 18:00:00 | 0,000658 | — |
| V1 Ganímedes | 1979-03-05 18:00:00 | 0,000783 | — |
| V1 Calisto | 1979-03-03 12:00:00 | 0,000684 | — |
| V1 Titán | 1980-11-12 05:41:21 | 0,000036 | `vg1_sat`: **236,868392** |
| V2 Europa | 1979-07-09 12:00:00 | 0,000381 | — |
| V2 Titania | 1986-01-24 06:00:00 | 0,000194 | — |
| V2 Miranda | 1986-01-24 12:00:00 | 0,000196 | — |
| V2 Tritón | 1989-08-25 09:10:00 | 0,000355 | DE130: **170,460131**; DE421: **170,827079**; NEP097: **169,648141** |

Estas diferencias expresan incompatibilidad con los **vectores luna–nave actualmente validados**; por sí solas no establecen qué reconstrucción local es astronómicamente más exacta. No se modificaron dichos vectores. Cualquier integración futura de una solución local requeriría sustituir y validar de forma independiente **todo el contexto** de nave, planeta y satélite, además de resolver sus uniones globales.

## 8. Clasificación y decisión

| Alternativa | Clase | Motivo de la decisión para la trayectoria global |
|---|---|---|
| Merged V1/V2 de 2013 | **C — incompatible** | Repiten exactamente la solución antigua en los empalmes, introducen otros saltos internos y no cubren 2026. |
| `vgr1_st` y `vgr2_st` | **B — parcialmente compatible** | Cubren matemáticamente el minuto y respetan los encuentros antiguos; son aproximadas y divergen fuertemente de Horizons/refit en 2026. |
| `vg1_sat` | **B — parcialmente compatible** | Reduce la diferencia frente al refit a 854,982 km en 0 s, pero termina antes de +60 s, tiene dos uniones incompatibles y difiere 236,868 km del vector local de Titán. Su precisión no está documentada en comentarios del propio archivo. |
| `vg2_nep` / DE130 | **B — parcialmente compatible** | Cubre el minuto, pero aún deja 1 026,593 km frente al refit y 170,460 km frente al vector local de Tritón. |
| NEP081 / DE421 | **B — parcialmente compatible** | Reconstrucción local con procedencia de ajuste documentada; aún deja 297,412 km frente al refit y 170,827 km frente a Tritón del catálogo. |
| NEP097 / DE440 | **B — parcialmente compatible** | Es la alternativa globalmente más próxima al refit en el empalme V2, pero deja 50,944 km y 169,648 km respecto al vector de Tritón validado. No conecta con la supertrayectoria antigua. |
| `vgr1_saturn`, `vgr1_sat261`, `vgr1.sat286` | **C — incompatible para el empalme** | Acaban el 20-XI-1980, antes de enero de 1981. |
| `de421.bsp` | **No es alternativa de nave** | Se usó sólo para el centro planetario de NEP081. |

No hubo candidato **A — compatible**. Los archivos enumerados que no se descargaron no se clasifican como solución demostrada; no se afirma exhaustividad binaria del archivo completo. No se integró ningún kernel, no se movió ninguna muestra, no se interpoló el minuto ni se desactivó la cobertura.

## 9. Pruebas, archivos y recomendación

La evaluación es reproducible con:

```text
python scripts/audit-voyager-stage9b-alternatives.py
python scripts/compare-voyager-stage9b.py
node scripts/audit-voyager-stage8.mjs
node --test tests/*.test.mjs
npm run build
```

Los dos scripts Python requieren **SpiceyPy 8.3.0**; en esta computadora se usó el entorno temporal de Etapa 09, fuera del repositorio. La segunda ejecución del primer script verifica los SHA y no vuelve a descargar. Evidencia estructurada: [inventario](../evidence/voyager-stage9b/alternative-kernel-inventory.json), [manifiesto](../evidence/voyager-stage9b/kernel-manifest.csv), [comparaciones](../evidence/voyager-stage9b/spice-alternative-comparison.json) y [CSV de vectores completos](../evidence/voyager-stage9b/all-offset-comparisons.csv). Registros: [hashes originales](../evidence/voyager-stage9b/hash-audit.log), [pruebas](../evidence/voyager-stage9b/tests-107.log) y [compilación](../evidence/voyager-stage9b/build.log).

| Control | Resultado |
|---|---|
| Conjuntos de efemérides originales | **49/49 SHA-256** |
| SPK originales | **10/10 SHA-256** |
| Binarios alternativos descargados | **11/11 SHA-256** registrados y vueltos a verificar; NEP097 existente verificado aparte |
| Pruebas existentes | **107/107** aprobadas, 0 fallas |
| Aproximaciones planetarias | **6/6** referencias originales comparadas y conservadas |
| Encuentros lunares | **9/9** contrastados, con nueve épocas por encuentro; sin alterar vectores |
| `npm run build` | Correcto; persiste aviso no bloqueante de tamaño del bundle |

**Recomendación definitiva para el catálogo disponible:** mantener los cortes visuales, la pausa, la telemetría honesta y la recuperación de cámara de Etapa 08. **Voyager 1: no** puede representarse como una trayectoria global científicamente continua 1977–2026 con estas fuentes. **Voyager 2: tampoco.** Una futura reconciliación necesitaría una reconstrucción oficial homogénea que cruce cada empalme con procedencia, prioridades, planetas y satélites consistentes, incertidumbres y comprobaciones independientes de posición/velocidad en las uniones y encuentros. Las pruebas de software aprobadas no certifican exactitud astronómica absoluta. No hubo cambios de aplicación; por ello no se generaron nuevas capturas de Chrome. No se hizo commit, push, ZIP ni despliegue.
