# Etapa 1B: adquisición e interpolación de efemérides

> Este documento describe la implementación inicial de 1B. Las correcciones y la integración posterior de 1B-R/1C se documentan en `consolidacion-1br-1c.md`; la nota de alcance pendiente al final corresponde al estado anterior.

## Arquitectura y ejecución

La herramienta de Node `scripts/descargar-efemerides.mjs` lee una configuración JSON y llama a `scripts/HorizonsAcquisition.mjs`. `--dry-run` solo valida y muestra los parámetros. `--execute` es la única opción que puede consultar Horizons. No se hicieron solicitudes reales durante esta implementación. La página WebGL no importa la herramienta y nunca consulta directamente a Horizons.

```powershell
node scripts/descargar-efemerides.mjs --config scripts/efemerides-2026-profile.json --dry-run
# Solo para una adquisición futura expresamente autorizada y después de revisar las políticas vigentes:
$env:HORIZONS_CONTACT = 'contacto-configurado-por-el-responsable@example.org'
node scripts/descargar-efemerides.mjs --config scripts/mi-nuevo-periodo.json --execute
```

El perfil `efemerides-2026-profile.json` reproduce los parámetros astronómicos del conjunto original: ocho identificadores planetarios, 2026-10-01 a 2026-11-01 TDB, paso de un día, centro solar `500@10`, eclíptica J2000/ICRF, vectores geométricos y salida AU/día. El archivo original ya existe y no tiene el archivo de integridad que genera esta herramienta; ejecutar ese perfil con `--execute` se detiene antes de consultar la red y no lo reemplaza. Para reproducirlo en otro archivo, use un `datasetId` y `outputFile` nuevos.

### Configuración

Se requieren `datasetId`, `bodies:[{id,type}]`, `startTdb`, `endTdb`, `cadenceSeconds`, `origin`, `frameId`, `timeScale`, `fileUnits` y `outputFile`. `type` pertenece al contrato `ScientificState` (`planet`, `probe`, `moon`, `star`, `sun`). Las fechas son etiquetas gregorianas en la escala TDB, no fechas UTC convertidas por JavaScript. `minIntervalMs` y `maxRetries` son opcionales (1000 ms y 3 por defecto). El intervalo debe contener pasos completos y como máximo 100 000 estados en total.

La configuración exige actualmente `SUN_CENTER`, `ICRF_ECLIPTIC_J2000`, `TDB` y vectores de archivo `AU`/`AU/dia`, porque esos son los contratos científicos validados. Una configuración distinta se rechaza; no se transforma silenciosamente. `outputFile` debe estar bajo `public/data/`. No se admiten identificadores de cuerpo repetidos ni rutas ascendentes. Un archivo nuevo puede cubrir otro periodo, paso o subconjunto de cuerpos sin cambiar el proveedor.

### Solicitudes, errores y reutilización

Las solicitudes se hacen secuencialmente, con al menos el intervalo configurado entre intentos. Las respuestas HTTP 429/5xx y los fallos de red admiten hasta `maxRetries` reintentos con espera progresiva. Se respeta `Retry-After` en segundos o fecha HTTP; una espera solicitada superior a cinco minutos detiene la ejecución para revisión manual. Los errores definitivos, JSON malformado, tablas incompletas, identificadores de cuerpo/centro erróneos, fechas y JD TDB incompatibles, componentes no finitas o versiones de API mezcladas detienen la adquisición. El `User-Agent` identifica la aplicación e incorpora `HORIZONS_CONTACT`, que debe configurar el responsable mediante una variable de entorno. Esa dirección no se escribe en los archivos públicos ni en el perfil versionado.

Los límites configurables son salvaguardas de esta herramienta, **no** cifras atribuidas a NASA/JPL. Antes de cualquier consulta real hay que revisar las condiciones oficiales vigentes sobre volumen, frecuencia, identificación y contacto. La presente etapa no verificó esas condiciones mediante solicitudes externas.

La salida nueva se escribe con exclusión (`wx`) y nunca reemplaza un conjunto anterior. Junto a `<nombre>.json` se genera `<nombre>.metadata.json` con SHA-256 del archivo, hash de configuración y `catalogEntry`. Si ambos archivos existen y coinciden configuración, integridad y validación del proveedor, una ejecución posterior reutiliza el conjunto sin red. Un conjunto existente sin metadata, una metadata huérfana o una divergencia detienen la operación. Un fallo de escritura entre los dos archivos requiere revisión manual; no se borra ni sobrescribe el primero.

### Formato y procedencia

La salida usa `scientific-states-v1`: `{formatVersion:1, acquisition:{...}, states:[ScientificState,...]}`. Los estados contienen km, km/s y JD TDB. La entrada `catalogEntry` generada en la metadata puede añadirse al catálogo versionado después de revisar el archivo; el generador comprueba la compatibilidad con `createEphemerisProvider()` antes de escribir.

Cada estado conserva la fuente, URL, fecha de adquisición, parámetros completos de consulta, unidades originales, configuración astronómica, hash de respuesta y versión de API cuando existe. El identificador de solución se extrae del encabezado `{source: ...}` de Horizons o de un campo explícito compatible; si no aparece, permanece `null`. Se registra por cuerpo y no se confunde con la versión de API. `formatVersion` es la versión del esquema local; `datasetId` es el identificador del conjunto; `sourceVersion`/`provenance.version` son la versión de API cuando se proporciona. El hash SHA-256 detecta alteraciones accidentales, pero no autentica a NASA/JPL ni certifica la exactitud astronómica. No se inventan precisión ni incertidumbre.

## Fundamento matemático de Hermite

`src/science/HermiteInterpolation.js` aplica Hermite cúbico a dos estados compatibles. Posición y velocidad en ambos extremos determinan un polinomio cúbico único por componente, apropiado cuando se dispone de vectores de posición **y** velocidad en las muestras. Sea `h = (JD₁ − JD₀) × 86400` segundos y `u = (JD − JD₀)/(JD₁ − JD₀)`. Para cada componente:

```text
p(u) = (2u³−3u²+1)p₀ + (u³−2u²+u)h v₀
     + (−2u³+3u²)p₁ + (u³−u²)h v₁

v(u) = [(6u²−6u)p₀ + (3u²−4u+1)h v₀
     + (−6u²+6u)p₁ + (3u²−2u)h v₁] / h
```

La segunda ecuación es exactamente la derivada temporal de la primera. Las posiciones se calculan en km, las velocidades en km/s y `h` en segundos. El instante sigue siendo JD TDB y el marco y origen son los de las muestras. En los extremos se devuelve el estado exacto. El cálculo no altera las muestras originales.

Hermite es una interpolación matemática local, **no** un propagador dinámico. Puede desviarse de la trayectoria real entre muestras, especialmente en intervalos largos o durante cambios rápidos de velocidad. La configuración por defecto limita `h` a 86 400 s. El límite puede ampliarse con `maxIntervalSeconds` si hay justificación y validación para el conjunto concreto.

## Contrato de consulta y condiciones de validez

```js
const exact = await provider.getExact('399', 2461314.5);
const estimate = await provider.getInterpolated('399', 2461314.75);
const selected = await provider.getInterpolated('399', 2461314.75,
  { datasetId: 'horizons-planets-2026-10', maxIntervalSeconds: 86400 });
```

`getExact()` permanece intacto y nunca estima. `getInterpolated()` devuelve `status:'exact'` para una muestra real, `status:'interpolated'` con estado, algoritmo, versión, intervalo, muestras origen y advertencias, `status:'missing'` fuera de cobertura, `status:'conflict'` ante datos contradictorios, o `status:'interpolation_rejected'` con motivo. Los estados interpolados indican como fuente la interpolación de Hermite; la procedencia original de ambos extremos permanece en el resultado y en `sourceMetadata`. Una estimación no se presenta como dato calculado directamente por Horizons.

Solo se usan muestras vecinas del **mismo conjunto**. Se exige igual cuerpo, tipo, origen, marco, escala y unidades; tiempos crecientes y límite temporal satisfecho. No hay extrapolación. Los huecos de una cadencia conocida se rechazan por defecto (`gap_requires_authorization`) y requieren `allowGap:true` más un límite suficiente. Una cadencia `null` requiere `allowIrregular:true`. El resultado informa estas excepciones en `warnings`. Si varios conjuntos ofrecen pares diferentes para el instante, se rechaza `ambiguous_overlap`; si sus extremos son físicamente idénticos, se elige el primero del catálogo. Un conflicto en cualquiera de los extremos se comunica como `conflict`. Seleccionar `datasetId` es una resolución explícita de la fuente cuando existen solapamientos o conflictos.

El proveedor conserva la carga asíncrona, la caché y el índice de la Etapa 1A. La búsqueda de vecinos dentro de una serie ordenada usa búsqueda binaria `O(log n)`; evaluar Hermite cuesta `O(1)` por estado. La validación completa ocurre al cargar un conjunto, no en cada consulta. Los límites de caché y estados por archivo de la Etapa 1A siguen vigentes. No se añadieron Web Workers.

## Validación y límites de precisión

Las pruebas analíticas incluyen posición constante, movimiento uniforme, polinomio cúbico, extremos, continuidad, derivada numérica, varios intervalos y datos incompatibles. Las pruebas del proveedor cubren huecos, irregularidad, conflictos, solapamientos, ausencia, opción de conjunto, procedencia e inmutabilidad. La herramienta de adquisición se prueba con respuestas locales construidas a partir de las muestras reales del JSON existente y con errores simulados; no se presentan como nuevas respuestas de Horizons.

Como comprobación reproducible preliminar se retuvo la muestra real de Tierra del 2 de octubre de 2026, se interpoló entre las del 1 y 3 de octubre y se comparó con la retenida: residuo de posición aproximado **0,790094 km** y de velocidad **4,71504×10⁻⁷ km/s**. Es una comparación interna de un único cuerpo y del mismo archivo, con intervalo de dos días que supera el límite por defecto; no demuestra una precisión general. Para una validación astronómica independiente futura se deben obtener, con autorización y bajo las políticas vigentes, muestras Horizons intermedias en una adquisición separada, excluirlas de los extremos, comparar posición y velocidad por cuerpo e intervalo, y publicar residuales máximos y RMS junto con parámetros y versiones de ambas adquisiciones. Hasta entonces la exactitud externa permanece pendiente y no se declara una tolerancia astronómica garantizada.

## Alcance pendiente

No se han adquirido periodos nuevos. No se ha modificado el control temporal, WebGL, cámaras, HUD ni Three.js. No existen propagación gravitatoria, maniobras ni misiones. La siguiente decisión técnica dentro de una etapa futura sería aprobar una campaña pequeña de muestras independientes para medir el error de interpolación por cuerpo y cadencia antes de ampliar la cobertura o integrar la consulta interpolada en la interfaz.
