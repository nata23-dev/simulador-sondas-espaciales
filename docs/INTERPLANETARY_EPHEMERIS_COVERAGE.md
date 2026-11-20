# Cobertura de efemérides interplanetarias (Etapa 12G)

**Estado:** datos adquiridos el 18-11-2026 desde NASA/JPL Horizons (API 1.2) y validados localmente. Pendiente de auditoría independiente. Marco y tiempo: [ASTRODYNAMICS_TIME_AND_FRAMES.md](ASTRODYNAMICS_TIME_AND_FRAMES.md).

## 1. Inventario previo y necesidad

| Conjunto existente | Cobertura | ¿Sirve para 12G? |
|---|---|---|
| `efemerides-2026.json` | 2026-10-01 → 2026-11-01 (diario) | No: un mes |
| `historical/planets/hist-planets-*` (Voyager) | 1977 → 2026-11-03/06 | No: termina antes del 2026-11-18. **No se modificó** |
| `moons-*.json` | octubre 2026 y ventanas Voyager | Satélites; se conserva el proveedor actual |

Faltaban posiciones y velocidades de los ocho planetas para 2026-11-18 → 2045-12-31. No se reutilizó ningún tramo existente porque ninguno solapa con la meta.

## 2. Conjuntos adquiridos

Script reproducible: `node scripts/acquire-stage12g-interplanetary.mjs` (`--dry-run` muestra las consultas). Reutiliza `scripts/HorizonsAcquisition.mjs` (validación de configuración, comprobación del cuerpo y centro devueltos, versión de API, cadencia exacta, hashes, sin sobrescritura). Peticiones **secuenciales** (≥ 1,5 s entre ellas, reintentos acotados ante HTTP 429/5xx), identificador de cliente genérico sin datos personales. Total: 20 peticiones de series + 10 de control. Parámetros: `EPHEM_TYPE=VECTORS`, `CENTER=500@10`, `REF_SYSTEM=ICRF`, `REF_PLANE=ECLIPTIC`, `TIME_TYPE=TDB`, `OUT_UNITS=KM-S`, `VEC_TABLE=2`, `VEC_CORR=NONE`, `CSV_FORMAT=YES`.

| Archivo (`public/data/interplanetary/`) | Cuerpos (solución JPL) | Cobertura TDB | Cadencia | Tamaño | SHA-256 |
|---|---|---|---|---|---|
| `ip-planets-inner-2026-2031.json` | 199, 299, 399 (DE441), 499 (mar099) | 2026-11-18 → 2031-06-01 | 1 d | 1,09 MB | `6f4e63b9d0db46224f8d5483a1ccdb464b59b2db462040935d49fd38655a241d` |
| `ip-planets-inner-2031-2036.json` | ídem | 2031-06-01 → 2036-01-01 | 1 d | 1,10 MB | `ca7fc94d5e3a2528519b361bc976136bc10b86df2cf99dfdaaf2c466fc67da24` |
| `ip-planets-inner-2036-2041.json` | ídem | 2036-01-01 → 2041-01-01 | 1 d | 1,20 MB | `b8528e736ee6e649a45471230c064587d22ce1d278017d27e636f460480f6e27` |
| `ip-planets-inner-2041-2046.json` | ídem | 2041-01-01 → 2046-01-01 | 1 d | 1,20 MB | `9b3e06c2305de064e771f8899a3656f17aeed088df825822c78a7b14ef2822bc` |
| `ip-planets-outer-2026-2046.json` | 599 (jup365_merged), 699 (sat441l), 799 (ura184_merged), 899 (nep098_merged) | 2026-11-18 → 2046-01-01 | 4 d | 1,15 MB | `cd4c6de0646c0fb7ba3973c2cb29e5f319fd4b08e420f62f050d28e264d6dd5d` |

La configuración (`configSha256`), los parámetros exactos de cada consulta, la versión de API, la solución JPL y el SHA-256 de cada respuesta están en el `*.metadata.json` hermano de cada archivo (comprobados con `sha256sum` el 18-11-2026).

Catálogo: `public/data/interplanetary-ephemerides-catalog-v1.json` (formato `horizons-compact-v1`, mismo contrato que los conjuntos históricos). Los segmentos internos comparten el nodo frontera (valores idénticos), por lo que se interpola en cualquier instante sin cruzar archivos. Último nodo: 2046-01-01 00:00 TDB, de modo que el 31-12-2045 queda cubierto entero. La aplicación publicada carga estos archivos estáticos con `import.meta.env.BASE_URL`; **no** consulta Horizons desde el navegador. Carga diferida: solo se leen los archivos que intersecan la ventana de búsqueda (p. ej., una búsqueda Tierra → Marte en 2028–2029 lee 1 archivo).

## 3. Proveedor e interpolación

`src/science/InterplanetaryEphemeris.js`:

- `getBodyState(bodyId, jdTdb)` (asíncrono) y `loadWindow(bodyIds, start, end).stateAt(bodyId, jdTdb)` (síncrono tras la carga) devuelven: identificador, nombre, época TDB, posición y velocidad, origen, marco completo, unidades, tipo de vector, dataset (id, archivo, fuente, versión de API, solución JPL), cobertura, método (`exact-node` o `cubic-hermite`), nodos usados e indicadores de calidad (sin extrapolación, cadencia y error máximo medido).
- Fuera de cobertura: `status: 'unavailable'` con el mensaje **«Efemérides no disponibles para el intervalo solicitado»**; nunca se sustituye por órbitas circulares ni se extrapola. Los huecos o conflictos entre archivos se rechazan.
- El Sol (`10`) es el origen por definición (`method: 'definition'`).
- Satélites: no se adquirieron series de 20 años. Se conserva el proveedor actual; cuando exista la etapa del sistema joviano se adquirirán ventanas de llegada concretas.

### Error de interpolación medido (prueba F)

Hermite cúbica con posición y velocidad entre dos nodos, contrastada con estados de Horizons pedidos en instantes que **no** son nodos (12:00 TDB, 06:00 TDB o días intermedios de la cadencia de 4 d), 10 instantes por planeta interior y 6 por exterior repartidos en 2026–2045 (`tests/fixtures/interplanetary-horizons-holdout-v1.json`):

| Cuerpo | Error máx. posición | Error máx. velocidad | Comentario |
|---|---|---|---|
| Mercurio | 18,7 km | 6,5×10⁻⁴ km/s | Curvatura alta en el perihelio con paso de 1 d |
| Venus | 0,18 km | 6,3×10⁻⁶ km/s | |
| Tierra | 0,088 km | 3,1×10⁻⁶ km/s | |
| Marte | 0,0091 km | 2,8×10⁻⁷ km/s | |
| Júpiter | 94,5 km | 1,3×10⁻³ km/s | El centro de Júpiter oscila ~10² km alrededor del baricentro del sistema por sus satélites (periodos de días); la cadencia de 4 d lo submuestrea |
| Saturno | 6,9 km | 8,0×10⁻⁵ km/s | Ídem (Titán) |
| Urano | 17,0 km | 1,5×10⁻⁴ km/s | Ídem |
| Neptuno | 47,4 km | 4,2×10⁻⁴ km/s | Ídem (Tritón) |

Impacto: en una transferencia de cientos de millones de km, 95 km de posición son ~10⁻⁷ relativo; el error de velocidad de Júpiter (≈1,3 m/s) se traslada casi íntegro a v∞ de llegada. Es aceptable para una planificación preliminar y queda declarado; una etapa de alta fidelidad debería usar cadencia de 1 d o el baricentro del sistema para los gigantes. Los errores declarados se exponen en `quality.measuredMaxError`.

## 4. Pendiente

- Satélites para ventanas de llegada específicas (sistema joviano, etc.).
- Mercurio y gigantes con cadencia más fina si una etapa futura lo exige.
- Cobertura posterior a 2045: ampliar con el mismo script y otra configuración (no se extrapola).
