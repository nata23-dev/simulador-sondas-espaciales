# Proveedor local de efemérides — Etapa 1A

Este documento conserva el contrato de la Etapa 1A. La adquisición configurable y la consulta interpolada de la Etapa 1B se describen en [adquisicion-interpolacion-1b.md](adquisicion-interpolacion-1b.md).

## Alcance y arquitectura

`EphemerisCatalog.js` valida el manifiesto versionado `public/data/ephemerides-catalog-v1.json`: identifica archivos locales, cuerpos, cobertura JD TDB, cadencia, marco, origen, unidades del archivo, fuente y versión conocida de la fuente. `EphemerisFileReader.js` lee JSON estático bajo `import.meta.env.BASE_URL` cuando el consumidor lo solicita. `EphemerisProvider.js` valida el contenido al cargarlo, lo adapta a `ScientificState.js`, crea un índice por cuerpo e instante, conserva su procedencia y atiende las consultas. Ningún módulo depende de Three.js ni del DOM, calcula trayectorias o cambia el flujo visual actual.

El manifiesto registra el archivo auténtico existente. Añadir otro periodo consiste en incorporar un archivo local con datos reales, crear una entrada de catálogo y validar su contenido; el proveedor no tiene límites de fecha codificados. Cada entrada representa un archivo distinto. La cobertura declarada debe coincidir con el primer y último JD TDB reales del conjunto. Los cuerpos listados deben tener muestras y no puede haber cuerpos adicionales sin declarar. Las series deben estar estrictamente ordenadas por cuerpo y no admitir instantes duplicados dentro de un archivo.

## Formatos y unidades

- `horizons-daily-v1`: el JSON actual, con los ocho planetas, muestras diarias y vectores AU y AU/día. Conserva íntegro `validateHorizonsDataset()` de la Etapa 0. `adaptHorizonsSample()` convierte a km y km/s mediante `Units.js`; la validación estricta sigue vigente.
- `scientific-states-v1`: `{ "formatVersion": 1, "states": [ScientificState, ...] }`. Cada estado ya usa km, km/s, JD TDB y el marco `ICRF_ECLIPTIC_J2000` heliocéntrico. Admite subconjuntos de cuerpos y cualquier número de muestras. La cadencia positiva en segundos se declara en el catálogo, o `null` si la distribución es irregular o desconocida. No representa datos simulados: los archivos futuros deben conservar en cada estado su fuente auténtica y metadatos de adquisición.

La versión `catalogVersion` corresponde al manifiesto; `formatVersion` corresponde al esquema del archivo interno. `sourceVersion` y `provenance.version` corresponden a la versión de la fuente cuando se conoce. El JSON actual no registra esa versión, por lo que permanece `null`. No se atribuyen precisión ni incertidumbre inexistentes.

## Contrato de consulta

```js
import { createStaticJsonReader } from './science/EphemerisFileReader.js';
import { createEphemerisProvider } from './science/EphemerisProvider.js';

const readJson = createStaticJsonReader({ baseUrl: import.meta.env.BASE_URL });
const catalog = await readJson('data/ephemerides-catalog-v1.json');
const ephemerides = createEphemerisProvider({ catalog, loadJson: readJson });

const bodies = ephemerides.listBodies();
const datasets = ephemerides.listDatasets();
const coverage = await ephemerides.getCoverage('399');
const sample = await ephemerides.getExact('399', 2461314.5);
const provenance = await ephemerides.getProvenance('399', 2461314.5);
const samples = await ephemerides.getRange('399', 2461314.5, 2461316.5);
const datasetInfo = await ephemerides.getDatasetInfo('horizons-planets-2026-10');
```

`listBodies()` y `listDatasets()` muestran las declaraciones del catálogo sin leer archivos. Los métodos asíncronos validan los archivos implicados antes de responder. `getExact()` exige igualdad numérica exacta del JD TDB; no aplica tolerancia para buscar una muestra cercana, no interpola ni extrapola. Devuelve:

- `{status:'found', bodyId, jdTdb, state, datasetId, file, alternates}` para una muestra disponible. `state` cumple `ScientificState` y es inmutable.
- `{status:'missing', bodyId, jdTdb, reason:'outside_coverage'|'no_exact_sample'}` cuando no hay archivo que cubra ese instante o cuando no hay muestra exacta dentro de la cobertura declarada.
- `{status:'conflict', bodyId, jdTdb, candidates}` cuando dos archivos dan estados físicos diferentes para el mismo cuerpo e instante. Cada candidato conserva su estado y procedencia; ninguno se sobrescribe.

`getRange()` devuelve únicamente los instantes efectivamente muestreados dentro del intervalo inclusivo, ordenados por JD TDB. Cada resultado tiene la misma forma `found` o `conflict`; no rellena huecos. `getProvenance()` devuelve las procedencias de todos los candidatos de ese instante y preserva el estado `missing` si no hay dato. El estado contiene `provenance.sourceMetadata.ephemerisDatasetId`, `ephemerisFile`, `ephemerisFormat`, `ephemerisFormatVersion`, `filePositionUnit` y `fileVelocityUnit`, además de los metadatos originales de Horizons, como parámetros astronómicos y fecha de consulta. `getDatasetInfo()` devuelve metadatos y conteos validados.

## Cobertura, huecos y conflictos

`getCoverage()` entrega intervalos reales por archivo, con archivo, cadencia y número de muestras. Señala huecos `within_dataset` cuando una serie con cadencia conocida salta más de un paso, y `between_datasets` cuando los intervalos de cobertura no se tocan. También señala intervalos `overlaps` y conflictos en instantes coincidentes. Un hueco interno pertenece a ese archivo: otro archivo puede contener muestras en él. Si la cadencia es `null`, no se infieren huecos internos, pero una consulta a un instante no muestreado responde `no_exact_sample`.

Si dos conjuntos contienen exactamente el mismo estado físico para un cuerpo e instante, gana de forma determinista el primero en el catálogo; los demás figuran en `alternates` y en `getProvenance()`. Si difieren el tipo de cuerpo o cualquier componente de posición o velocidad, se devuelve `conflict` sin elegir un ganador. Las coordenadas se comparan en las unidades canónicas; el proveedor exige el mismo origen y marco para todos los conjuntos actuales. Una futura necesidad de marcos adicionales requeriría ampliar explícitamente el contrato científico antes de registrarlos.

## Carga, errores y memoria

La lectura es asíncrona y bajo demanda. La primera consulta a un conjunto valida todas sus muestras; consultas posteriores reutilizan el conjunto indexado y no repiten la validación. Peticiones simultáneas al mismo conjunto comparten la misma promesa. Un fallo de lectura o validación elimina la entrada de caché para permitir reintento. Los errores de HTTP, JSON malformado, formato desconocido, cobertura falsa, unidades/marcos incompatibles, fuente contradictoria y series desordenadas se propagan con contexto; no se sustituyen por datos vacíos.

Por defecto se admiten hasta 100 000 estados por archivo y se conservan en caché hasta ocho conjuntos ya resueltos. Los menos recientes se liberan cuando se supera el límite; una consulta posterior puede volver a leerlos y validarlos. Ambos límites pueden configurarse con `maxStatesPerDataset` y `maxCachedDatasets`. Las cargas concurrentes ya iniciadas pueden coexistir transitoriamente por encima del límite de caché. Los resultados individuales son inmutables, y el proveedor no modifica el JSON leído.

## Adquisición e interpolación posteriores

La Etapa 1B añadió una herramienta de adquisición configurable, con ejecución explícita y sin sobrescribir conjuntos, y un método `getInterpolated()` separado de `getExact()`. Sus parámetros, restricciones y pruebas están en la documentación de la Etapa 1B. La página no hace solicitudes directas a Horizons.

## Límite científico y siguiente integración

Estos estados son muestras de efemérides de una fuente identificada. La procedencia, la consistencia de formato y las unidades son comprobables; el proveedor no certifica exactitud astrométrica, precisión numérica ni incertidumbre que la fuente no declaró. Un motor orbital futuro podrá consumir `ScientificState` como condición inicial o referencia, pero los estados calculados por ese motor deberán identificarse como resultados de simulación con procedencia distinta. La integración con el control temporal visual y la adquisición de nuevos periodos reales siguen pendientes.
