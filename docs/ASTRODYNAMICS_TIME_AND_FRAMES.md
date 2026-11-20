# Tiempo y marcos para la planificación interplanetaria (Etapa 12G)

**Estado:** implementado y probado localmente; pendiente de auditoría independiente (Gemini). Documentos asociados: [planificación 12G](STAGE12G_INTERPLANETARY_PLANNING.md), [cobertura de efemérides](INTERPLANETARY_EPHEMERIS_COVERAGE.md), [contrato científico](contrato-cientifico.md).

## 1. Escalas de tiempo

| Escala | Definición | Uso en el proyecto |
|---|---|---|
| UTC | Tiempo civil; difiere de TAI en un número entero de segundos intercalares | Fechas que introduce el usuario y etiquetas de presentación |
| TAI | Tiempo atómico continuo | Paso intermedio: `TAI = UTC + (TAI − UTC)` |
| TT | `TT = TAI + 32,184 s` (exacto) | Paso intermedio |
| TDB | Tiempo dinámico baricéntrico, argumento de las efemérides JPL; `TDB − TT` oscila ±1,66 ms | **Única escala de cálculo**: efemérides, Lambert, propagación y reproducción |
| JD / MJD | Fecha juliana (días) en la MISMA escala que se indique; `MJD = JD − 2 400 000,5` | Siempre etiquetada con su escala (`jdTdb`) |
| Segundos de simulación | Segundos TDB desde la salida (`elapsedSeconds`) | Reloj del Centro de Misión |

Módulos: `src/science/AstrodynamicsTime.js` (nuevo) compone la cadena reutilizando `HistoricalTime.js` (tabla de segundos intercalares y TDB − TT) y `Time.js` (calendario ↔ JD sin `Date` del navegador).

- `utcToTimeScales(utc)` → `jdUtcPseudo`, `jdTai`, `jdTt`, `jdTdb` y cada diferencia.
- `tdbToTimeScales(jdTdb)` → inversa con etiquetas UTC/TDB redondeadas al segundo (un JD en doble precisión cerca de 2,46×10⁶ resuelve ~40 µs; sin redondeo aparecían marcas «23:59:59»).
- `naifDeltetTdbMinusTt(jdTt)`: algoritmo DELTET de NAIF/SPICE (`time.req`: `K·sin(E)`, `E = M + EB·sin M`, `K = 1,657×10⁻³ s`, `EB = 1,671×10⁻²`, `M0 = 6,239996`, `M1 = 1,99096871×10⁻⁷ rad/s`), usado como formulación independiente.
- No se usa ninguna diferencia fija UTC↔TDB: `TDB − UTC` varía con la época (69,18278 s el 2026-11-18; 69,18412 s el 2035-07-01).

### Segundos intercalares

Tabla `IERS_LEAP_SECONDS_TABLE` (IERS Bulletin C; equivalente al núcleo NAIF `naif0012.tls`): 28 entradas desde 1972-01-01 (10 s) hasta **2017-01-01 (37 s)**. Fuentes: <https://hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat>, <https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/>. **Cobertura:** exacta desde 1972 hasta el último salto tabulado. Para fechas futuras se supone que no habrá nuevos segundos intercalares (igual que Horizons); la etiqueta UTC de una fecha posterior a la ventana de anuncio se marca «predicción» (`utcPredicted`). La época TDB de cálculo se obtiene de la fecha UTC introducida con esa suposición; si IERS anunciara un salto, las fechas UTC futuras se desplazarían 1 s respecto a TDB.

### Verificación (pruebas A, A2, B)

| Comprobación | Resultado | Tolerancia y motivo |
|---|---|---|
| `TDB − UTC` frente a Horizons (`QUANTITIES=30`, TDB − UT) en 2026-11-18, 2030-01-01, 2035-07-01, 2045-12-31 | 69,182779 / 69,183918 / 69,184117 / 69,183884 s frente a 69,182808 / 69,183930 / 69,184143 / 69,183862 s (máx. 2,9×10⁻⁵ s) | 1×10⁻⁴ s: la serie de dos términos tiene error < 30 µs y Horizons imprime 1 µs |
| Fairhead–Bretagnon frente a DELTET (2026–2046, cada 7,3 d) | < 5×10⁻⁵ s | Ambas aproximan TDB − TT con error de decenas de µs |
| Saltos 2016-12-31 23:59:59 → 2017-01-01 00:00:00 | TAI − UTC = 36 → 37 s | Exacto |
| J2000 = 2000-01-01 12:00 TDB = JD 2 451 545,0; 2026-11-18 = 2 461 362,5 | Exacto | — |

Fuentes: <https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/time.html>, <https://ssd-api.jpl.nasa.gov/doc/horizons.html>.

## 2. Marco de referencia común

Todas las magnitudes de una operación (posiciones y velocidades de los planetas, de la sonda y del Lambert) comparten:

| Elemento | Valor |
|---|---|
| Origen | Centro del Sol (`500@10`), no el baricentro |
| Ejes | ICRF con plano fundamental en la **eclíptica J2000** de Horizons (`REF_SYSTEM=ICRF`, `REF_PLANE=ECLIPTIC`): +X hacia el equinoccio J2000 (eje X de ICRF), +Z polo norte de la eclíptica, +Y dextrógiro |
| Unidades | km y km/s (`OUT_UNITS=KM-S`) |
| Tiempo | TDB (`TIME_TYPE=TDB`) |
| Tipo de vector | Geométrico (`VEC_CORR=NONE`): sin tiempo de luz ni aberración |
| Inercialidad | Marco inercial (sin rotación); el Sol se trata como cuerpo central de μ☉ = 132 712 440 041,279419 km³/s² (DE440) |

**Por qué eclíptico y no `REF_PLANE=FRAME`:** el resto del proyecto (catálogos planetarios, históricos Voyager, escena con `(x,y,z) → (x,z,−y)`) ya usa ICRF eclíptico J2000; mantenerlo evita una transformación adicional en la frontera gráfica. La relación con los ejes ecuatoriales ICRF es una rotación fija de +ε alrededor de X con ε = 84 381,448″ (`Frames.eclipticJ2000ToIcrfEquatorial`). **No se confunden** ambos planos: la conversión se comprobó contra vectores de la Tierra pedidos a Horizons con `REF_PLANE=FRAME` («Reference frame: ICRF») en tres épocas: diferencia máxima 6×10⁻⁸ km en posición (prueba C, tolerancia 1×10⁻⁵ km). La asíntota de salida (DLA/RLA) se expresa en ejes ecuatoriales ICRF, que es como se especifica habitualmente.

Comprobaciones de coherencia (prueba H): todos los estados devueltos llevan `frame.id = ICRF_ECLIPTIC_J2000`, origen `SUN_CENTER` y escala TDB; `interpolateHermiteState` rechaza muestras de cuerpos, orígenes, marcos o unidades distintos; los archivos contiguos comparten el nodo frontera con valores idénticos (misma respuesta física), de modo que no hay salto ni conflicto.

## 3. Frontera gráfica

La escena heliocéntrica del Centro de Misión usa **32 unidades de escena por AU** (la misma escala de centros que el Sistema Solar) con la rotación de ejes `(x, y, z) → (x, z, −y)`. Los tamaños del Sol, los marcadores planetarios y la nave están ampliados con un factor ilustrativo declarado en el pie de la vista; la telemetría y los estados conservan km y km/s.
