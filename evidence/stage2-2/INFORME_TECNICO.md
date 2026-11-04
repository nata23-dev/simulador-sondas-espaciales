# Etapa 02.2 — Validación científica de los encuentros Voyager

**Fecha de adquisición:** 31 de octubre de 2026 (UTC en los metadatos de cada respuesta).  
**Estado:** investigación reproducible; la causa operativa de la discrepancia está demostrada, pero las trayectorias locales aún no están reconciliadas con un conjunto único de kernels.

## Fuentes y método

- [NASA NSSDCA, Voyager 1/2 Closest Approach Distances/Times](https://nssdc.gsfc.nasa.gov/planetary/voyager-periapse.html), copia íntegra en `ConsultasOriginales/nssdc-voyager-periapse.html`, SHA-256 `cb16dc2a84c839c494ebb2190fe3e8a47678e2a6257762b170c3d7bfefdee892`. La tabla indica expresamente horas UTC y distancias al centro en radios planetarios, redondeadas a dos decimales.
- [NASA/JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html): 18 consultas nuevas para los seis encuentros, cada una con 121 muestras a un minuto, de UTC oficial ±60 min. Por encuentro: nave respecto al centro del planeta (`CENTER=500@599/699/799/899`), nave respecto al Sol (`CENTER=500@10`) y centro del planeta respecto al Sol. Las respuestas JSON originales, URL exacta, parámetros, instante de descarga, estado HTTP y SHA-256 están en `ConsultasOriginales/`.
- Parámetros comunes: `EPHEM_TYPE=VECTORS`, `TIME_TYPE=UT`, `TIME_DIGITS=SECONDS`, `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`, `VEC_CORR=NONE`, `OUT_UNITS=KM-S`, `VEC_TABLE=2`, `CSV_FORMAT=YES`. Es una distancia **geométrica de centro a centro**, sin corrección de luz; altitud = distancia al centro menos radio. Horizonte indica UTC en la tabla y eclíptica J2000 en el encabezado. ID NAIF: Voyager 1 `-31`, Voyager 2 `-32`, Júpiter `599`, Saturno `699`, Urano `799`, Neptuno `899`.
- Se comprobaron además dos consultas TDB de la nave respecto al planeta, dos consultas inversas planeta respecto a Voyager 2 y dos consultas baricéntricas para Neptuno. Las consultas TDB reproducen los vectores UTC a menos de 0,01 km, y las inversas cambian el signo a menos de 0,001 km: la conversión temporal y la dirección del vector quedan contrastadas.
- El análisis local usa `scripts/audit-stage2-1-encounters.mjs`, sin cambiar el catálogo. El análisis nuevo verifica hashes, sincronía temporal y posiciones antes de calcular distancias: `scripts/audit-stage2-2-horizons.mjs`. Los resultados completos están en `Resultados/local-audit.json` y `Resultados/horizons-audit.json`.

## Comparación al UTC publicado

Distancias en km; Δ es respecto a la cifra NSSDCA obtenida del múltiplo por su radio de referencia. El mínimo D se eligió en la malla de un minuto (precisión temporal ±30 s), no mediante ajuste a la cifra publicada.

| Encuentro (UTC oficial) | A: local | B: Horizons directo | C: NSSDCA | D: mínimo Horizons y UTC | ΔA / C | ΔB / C |
|---|---:|---:|---:|---|---:|---:|
| V1–Júpiter, 1979-03-05 12:05:26 | 348 092,8 | 348 437,0 | 349 136,2 | 348 435,3 · 12:04:26 | −1 043,4 (−0,30 %) | −699,2 (−0,20 %) |
| V2–Júpiter, 1979-07-09 22:29:51 | 721 017,7 | 721 375,9 | 721 833,8 | 721 375,5 · 22:28:51 | −816,1 (−0,11 %) | −457,9 (−0,06 %) |
| V1–Saturno, 1980-11-12 23:46:30 | 183 545,9 | 184 033,3 | 186 419,7 | 184 030,1 · 23:45:30 | −2 873,8 (−1,54 %) | −2 386,4 (−1,28 %) |
| V2–Saturno, 1981-08-26 03:24:57 | 159 580,8 | 160 694,2 | 161 081,1 | 160 691,3 · 03:23:57 | −1 500,3 (−0,93 %) | −386,9 (−0,24 %) |
| V2–Urano, 1986-01-24 17:59:47 | 102 310,7 | 107 158,1 | 107 092,2 | 107 154,2 · 17:58:47 | −4 781,6 (−4,46 %) | +65,9 (+0,06 %) |
| V2–Neptuno, 1989-08-25 03:56:36 | 34 377,1 | 29 263,5 | 29 216,8 | 29 236,2 · 03:55:36 | +5 160,3 (+17,66 %) | +46,7 (+0,16 %) |

Los 65,9 km de Urano y 46,7 km de Neptuno están dentro del redondeo de ±0,005 radios de la tabla NSSDCA (±127,8 y ±123,8 km). Las diferencias directas de Júpiter y Saturno exceden ese redondeo en varios casos; permanecen como diferencias entre la tabla histórica y la solución actual de Horizons. La tabla NSSDCA no identifica la solución orbital ni el procedimiento de reducción empleados, por lo que no se atribuye esa diferencia a una versión concreta sin evidencia.

## Investigación causal

**Demostrado:** la resta de dos vectores heliocéntricos independientes de Horizons reproduce la geometría local casi exactamente (Neptuno: 34 383,5 km nuevo, 34 377,1 km local con Hermite). La consulta directa de Voyager 2 respecto a Neptuno, al mismo UTC, marco, ejes y sin corrección de luz, da 29 263,5 km. La incompatibilidad vectorial entre ambas construcciones es 13 594,4 km en Neptuno y 5 221,4 km en Urano. También aparece en los otros cuatro encuentros (383–1 434 km de residuo vectorial). Por tanto, la discrepancia principal **no nace del renderizado ni de la fórmula de diámetro angular**; el simulador combinó estados que no forman un par relativo consistente para el sobrevuelo.

**Controles que excluyen explicaciones simples:** la conversión UTC→TDB reproduce la consulta TDB independiente; ignorarla cambia la distancia local de Neptuno unos 276 km, no 5 160 km. Hermite frente a interpolación lineal cambia unos 390 km, tampoco explica el desfase. Los IDs `899` y `799` son centros de planeta, no baricentros `8`/`7`, y `VEC_CORR=NONE` excluye tiempo de luz. En Neptuno, cambiar ambos objetivos a `CENTER=500@0` aún produce 34 359,1 km al sustraerlos, frente a 29 263,5 km de la consulta relativa: cambiar solo el origen común nominal no basta.

**Inferencia, no causa interna demostrada:** los encabezados Horizons muestran `Voyager_2_ST+refit2022_m` para la nave y `nep098_merged` para Neptuno; en las consultas heliocéntricas el origen Sol aparece asociado a fuentes distintas. La documentación [NAIF SPK Required Reading](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/spk.html) explica que los estados se encadenan a partir de segmentos y que la prioridad depende del orden de los kernels; [NAIF Common Problems](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/problems.html) advierte que soluciones planetarias distintas no tienen por qué concordar en estados baricéntricos. Estos mecanismos son compatibles con lo observado, pero los encabezados de Horizons no exponen el conjunto exacto de segmentos y prioridades usado en cada consulta. Haría falta reconstruir y comparar las cadenas con kernels SPICE Voyager/planetarios, sus coberturas y orden de carga, antes de atribuir el residuo a un segmento específico o reemplazar todos los datos de trayectoria.

El mínimo de la malla Horizons cae un minuto antes de la hora NSSDCA en los seis casos. No se cambió ninguna fecha oficial. La malla a un minuto y la diferencia entre soluciones impiden usar este resultado para redefinir la hora histórica.

## Cambios en el simulador

- Se actualizaron las fichas de Urano y Neptuno para mostrar, al UTC oficial, las tres cifras etiquetadas: NSSDCA, Horizons directo y geometría local. La ficha declara que la trayectoria local sigue pendiente de reconciliación.
- Se añadieron scripts de adquisición y auditoría, cinco pruebas científicas nuevas, respuestas originales, resultados y capturas auténticas antes/después de ambas fichas a 1366×768 y 390×844.
- **No se cambiaron posiciones, velocidades, radios, fechas, interpolación ni cámaras.** Corregir solo las muestras cercanas introduciendo un salto respecto a los segmentos de crucero violaría la continuidad y equivaldría a construir posiciones no avaladas. La vista Voyager de Urano/Neptuno sigue representando la geometría local histórica previa; no debe presentarse como encuentro ya validado al nivel de kilómetros.

## Pruebas y evidencias

- Instalación limpia `npm ci`: completada, 0 vulnerabilidades reportadas por npm. Suite `node --test`: **91/91** (86 previas + 5 nuevas), registro `Resultados/automated-tests.txt`. Compilación `npm run build`: exitosa, registro `Resultados/production-build.txt`; Vite advierte que un chunk minificado supera 500 kB.
- El ZIP se extrajo en un directorio temporal nuevo; se comprobaron 668 hashes SHA-256, y desde el proyecto extraído se ejecutaron de nuevo `npm ci`, las 91 pruebas y `npm run build` con salida 0. Registros: `Resultados/zip-verification.txt`, `zip-npm-ci.txt`, `zip-tests.txt` y `zip-build.txt`.
- Chrome real por CDP: Etapa 02, **80 comprobaciones, 35 capturas, 0 errores JavaScript/HTTP** (`Resultados/browser-stage2.txt`, `Despues/stage2-results.json`); Etapa 01, **55 comprobaciones, 20 capturas** (`Resultados/browser-stage1.txt`). Se probaron cambios de fecha, seguimiento, cámaras, comparador, restauración, modos y móvil. Las fichas de Urano/Neptuno tienen cuatro capturas nuevas en `Fichas/` y cuatro `Antes/` tomadas con el proyecto aprobado de Etapa 02.1. Los manifiestos registran texto, resolución y cámara.
- Las 18 respuestas principales se validan por SHA-256 y contienen exactamente el UTC oficial. Las pruebas verifican redondeo NSSDCA de Urano/Neptuno, incompatibilidad de vectores, equivalencia UTC/TDB y reciprocidad de los vectores relativos. Los seis mínimos de la ventana quedan fuera de los radios físicos NSSDCA, sin penetración planetaria en estos datos directos.
- **Límites de esta validación:** los tests y el navegador confirman comportamiento e integridad de los datos consultados; no validan la continuidad física de una trayectoria nueva porque no se instaló una nueva. Tampoco prueban que la iluminación, texturas ni la orientación instrumental sean reconstrucciones fotométricas; faltan kernels CK/IK aplicados a las cámaras. No se añadieron lunas.

## Reproducción

Desde la raíz del proyecto, en PowerShell:

```powershell
npm ci
$testFiles = Get-ChildItem tests -Filter '*.test.mjs' | ForEach-Object FullName
node --test $testFiles
npm run build
$env:AUDIT_OUTPUT='evidence/stage2-2/Resultados/local-audit-regenerado.json'
node scripts/audit-stage2-1-encounters.mjs
node scripts/audit-stage2-2-horizons.mjs evidence/stage2-2/ConsultasOriginales evidence/stage2-2/Resultados/local-audit-regenerado.json evidence/stage2-2/Resultados/horizons-audit-regenerado.json
```

`scripts/acquire-stage2-2-horizons.mjs <directorio>` reproduce las 18 descargas oficiales en un directorio nuevo y no sobrescribe respuestas existentes; exige acceso a NASA/JPL. Las pruebas y el análisis anteriores usan las respuestas originales ya incluidas y funcionan sin red. Las capturas nuevas se reproducen con Vite en `127.0.0.1:5173` y Chrome CDP en `127.0.0.1:9338` mediante `scripts/capture-stage2-2-notes.mjs`.

**Decisión para la siguiente etapa:** aún no es científicamente suficiente incorporar lunas en los sobrevuelos cercanos. Primero debe definirse y auditarse una cadena SPK coherente para nave y planeta, reconstituir la trayectoria completa o sus segmentos de cruce sin saltos, y contrastar distancias y velocidades en toda la ventana. La investigación documenta el error de combinación de estados, no una corrección geométrica completa.
