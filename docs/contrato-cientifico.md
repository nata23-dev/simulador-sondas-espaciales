# Contrato científico inicial — Etapa 0

## 1. Propósito y alcance

Este contrato describe estados físicos sin depender del DOM, Three.js o unidades
de escena. Permite convertir y validar las muestras diarias actuales de
NASA/JPL Horizons antes de incorporarlas a cálculos orbitales. La Etapa 0 **no**
implementa gravedad, propagación, sondas, maniobras ni conversión UTC/TDB.

## 2. Módulos y relaciones

- `src/science/Units.js`: constantes y conversiones escalares puras.
- `src/science/Time.js`: instantes `jdTdb`, diferencias y aritmética temporal;
  etiquetas gregorianas solo para comprobar fechas del conjunto diario.
- `src/science/Frames.js`: identificación del marco admitido y rotación de ejes
  entre coordenadas eclípticas científicas y ejes visuales.
- `src/science/ScientificState.js`: creación validada e inmutable del estado.
- `src/science/HorizonsEphemerides.js`: validación del archivo local y adaptación
  de una muestra a dicho estado.

El adaptador depende de los cuatro módulos anteriores. Ninguno importa Three.js
ni módulos de interfaz. La aplicación visual sigue leyendo su JSON mediante
`src/astronomy/Ephemerides.js`; integrar el estado científico en la escena es
trabajo posterior. La ficha visual importa únicamente las constantes compartidas
de `Units.js` y conserva sus conversiones y exportaciones anteriores.

## 3. Contrato de estado

`createScientificState(input)` devuelve un objeto nuevo, con sus registros
anidados congelados:

| Propiedad | Significado y valores admitidos en esta etapa |
| --- | --- |
| `identity.id` | Identificador no vacío; para planetas Horizons, `199` a `899` según el planeta. |
| `identity.type` | `planet`, `probe`, `moon`, `star` o `sun`. La adaptación actual produce `planet`. |
| `identity.origin` | `SUN_CENTER`. Solo se admite el centro del Sol del conjunto actual. |
| `time.jdTdb`, `time.scale` | Número finito de día juliano y cadena `TDB`. |
| `position.x/y/z`, `position.unit` | Componentes finitas en `km`, en el marco científico. |
| `velocity.x/y/z`, `velocity.unit` | Componentes finitas en `km/s`, en el mismo marco. |
| `reference` | Marco `ICRF_ECLIPTIC_J2000`, origen `SUN_CENTER`, código `500@10`, sistema `ICRF`, plano `ECLIPTIC_J2000`, orientación explícita y corrección `NONE`. |
| `provenance.source` | Fuente no vacía. |
| `provenance.sourceUrl`, `version`, `queriedAtUtc` | Valor conocido o `null` si no se proporciona. La versión API es `null` en el JSON actual. |
| `provenance.precision`, `uncertainty` | `null` cuando la fuente no las proporciona; o un objeto con descripción y fuente si se incorporan en el futuro. |
| `provenance.sourceMetadata` | Copia inmutable de los metadatos primitivos de la fuente, más nombre y fecha de la muestra y unidades originales. |

El contrato inicial reconoce un solo marco y origen. Rechaza valores desconocidos
o incompatibles; no transforma automáticamente estados de otros marcos. Los
objetos de entrada no se modifican. La inmutabilidad del objeto devuelto protege
sus campos conocidos y los metadatos planos del JSON actual.

## 4. Unidades canónicas, constantes y fuentes

Las futuras operaciones científicas usarán kilómetros, kilómetros por segundo,
segundos y, para parámetros gravitacionales futuros, km³/s². Esta última unidad
es una convención: **no hay parámetros gravitacionales ni motor en esta etapa**.

`Units.js` centraliza **1 AU = 149 597 870,7 km** (definición exacta de la
[IAU 2012](https://iauarchive.eso.org/public/themes/measuring/)) y **1 día =
86 400 s**. `auToKm`, `kmToAu`, `auPerDayToKmPerSecond` y
`kmPerSecondToAuPerDay` son funciones puras; validan entradas y resultados
finitos. Sus inversas se comprueban con tolerancias de coma flotante. El JSON
permanece en AU y AU/día; la conversión ocurre solamente en el adaptador.

Las unidades de escena se rigen por `src/graphics/SpatialScale.js`: **32 unidades
visuales por AU** para centros planetarios y radios gráficos independientes.
Jamás deben introducirse esas unidades visuales en un estado científico.

## 5. Coordenadas y origen

El generador `scripts/descargar-efemerides.mjs` consulta Horizons con:
`CENTER='500@10'`, `EPHEM_TYPE='VECTORS'`, `VEC_CORR='NONE'`,
`REF_PLANE='ECLIPTIC'`, `REF_SYSTEM='ICRF'`, `TIME_TYPE='TDB'` y
`OUT_UNITS='AU-D'`. Los metadatos del JSON declaran Sol, eclíptica J2000, ICRF,
TDB, AU y AU/día. El estado adaptado conserva **vectores geométricos relativos al
centro del Sol**; no los presenta como estados baricéntricos absolutos.

La orientación científica se identifica así: +X alineado con el eje X de ICRF,
+Z hacia el norte eclíptico J2000 y +Y completa la terna dextrógira. Para
Three.js, la transformación existente rota `(x, y, z)` a `(x, z, -y)`, sin
cambiar longitudes. `Frames.js` ofrece esa rotación pura y su inversa;
`SpatialScale.js` sigue aplicando la misma rotación y luego su factor visual.
Las pruebas comprueban resultados conocidos, ida/vuelta y conservación de norma.

No existe todavía conversión entre eclíptico y ecuatorial, ni entre heliocéntrico
y baricéntrico. El marco de un futuro integrador deberá decidirse y documentarse
antes de usar estos vectores como condiciones iniciales.

## 6. Tiempo

Un instante científico es un número `jdTdb` acompañado por `scale: 'TDB'`.
`Time.js` valida números finitos, calcula `secondsBetweenJdTdb(from, to)`,
`advanceJdTdb(jd, seconds)` y `compareJdTdb(a, b)`. Un avance tan pequeño que
no cambie el `Number` del JD se rechaza para evitar una falsa promesa de precisión.
Alrededor de JD 2,46 millones, la resolución de `Number` es de decenas de
microsegundos; no es un reloj de precisión arbitraria.

`gregorianLabelToJulianMidnight` convierte **solo una etiqueta gregoriana**
`YYYY-MM-DD` al número juliano de la medianoche en **la misma escala que indique
la fuente**. Sirve para cotejar los registros diarios TDB con sus rótulos y
metadatos; no acepta un objeto `Date` y no calcula el desplazamiento UTC/TDB.
El tiempo real de `performance.now()`, la velocidad del control de reproducción,
la fecha civil de la interfaz y `jdTdb` siguen siendo conceptos distintos.

## 7. Procedencia y precisión

El archivo incluye fuente, URL, fecha de consulta UTC, intervalo, centro, plano,
referencia, unidades y tipo de vector. El adaptador conserva estos campos y la
fecha textual TDB del registro. El generador actual consulta `versionAPI` pero
no la guarda en el JSON; por ello `provenance.version` es `null` para el conjunto
actual. Tampoco hay incertidumbres numéricas ni una declaración de precisión
por vector: `precision` y `uncertainty` son `null`. No se infieren de la cantidad
de decimales del archivo.

## 8. Validación y advertencias

`validateHorizonsMetadata` exige el perfil conocido del archivo actual. No
acepta unidades, origen, referencia, corrección o escala temporal diferentes sin
un adaptador nuevo. `validateHorizonsSample` comprueba JD TDB, fecha textual
diaria a las 00:00 y las seis componentes finitas. Una discrepancia superior a
`1e-8` día (0,864 ms) entre JD y etiqueta se trata como error estructural.
`validateHorizonsDataset` exige los ocho planetas, igual número de muestras,
fechas entre `inicio` y `fin`, orden y paso de un día con la misma tolerancia.
Los errores incluyen la ruta de la propiedad que falló.

Se emiten **advertencias, sin rechazo**, si para uno de estos planetas la
distancia heliocéntrica es cero o supera 1000 AU, o la rapidez supera 1 AU/día.
Son umbrales conservadores para detectar errores groseros, no límites físicos ni
certificación de exactitud. No sustituyen la comparación independiente con
Horizons. El archivo actual pasa sin advertencias.

## 9. Ejemplo de uso

```js
import { adaptHorizonsSample, validateHorizonsDataset }
  from './src/science/HorizonsEphemerides.js';

// `dataset` es el JSON ya leído de public/data/efemerides-2026.json.
const report = validateHorizonsDataset(dataset);
const earth = adaptHorizonsSample(dataset, 'Tierra', 9);
console.log(report.sampleCountPerPlanet); // 32
console.log(earth.identity); // { id: '399', type: 'planet', origin: 'SUN_CENTER' }
console.log(earth.time); // { jdTdb: 2461323.5, scale: 'TDB' }
console.log(earth.position.unit, earth.velocity.unit); // km km/s
```

En esa muestra real del 10 de octubre de 2026, el vector de posición comienza
aproximadamente en `(143385080.851, 42029610.839, -3157.525) km`. El estado
completo añade velocidad en km/s, referencia y procedencia. Estos números son
conversiones de una efeméride almacenada, **no una propagación física**.

## 10. Límites y decisiones pendientes

- El proveedor actual cubre solo del 1 de octubre al 1 de noviembre de 2026;
  no interpola, extrapola ni actualiza efemérides automáticamente.
- No se ha verificado cada vector del JSON frente a una nueva consulta
  independiente de Horizons. No hay incertidumbre, versión de solución ni
  respuesta original archivadas.
- Solo se reconoce el perfil heliocéntrico eclíptico J2000/ICRF del JSON actual.
  Se deben diseñar transformaciones y un marco dinámico adecuado antes de
  integrar fuerzas de varios cuerpos.
- No hay conversión UTC/TDB, motor gravitacional, reloj físico de simulación,
  estados de sondas generados por integración ni persistencia de misiones.
- Antes del propagador deben definirse cuerpos y parámetros gravitacionales,
  modelo de fuerzas, horizonte, tolerancias y pruebas analíticas/de referencia.

Este contrato ayuda al futuro propagador porque le permite recibir estados con
unidades, época y marco comprobados, y rechazar entradas ambiguas antes de
calcular movimiento. No decide todavía el integrador ni promete precisión física.
