# Etapas 1B-R y 1C: contrato operativo

## Datos, identidad y adquisición

`responseHeader` exige exactamente una línea `Target body name`, un único grupo numérico entre paréntesis y que sea el último grupo del nombre. Permite calificativos previos como `(spacecraft)` y nombres compuestos. Exige `Center body name: Sun (10)`. Los encabezados de las pruebas son **sintéticos**, construidos a partir del formato esperado; no se han probado respuestas nuevas de Horizons para todas las clases de objetos. No se realizó ninguna solicitud externa.

`--dry-run` valida y emite consultas sin llamar al flujo de adquisición ni requerir contacto. `--execute` requiere `HORIZONS_CONTACT`, mantiene solicitudes secuenciales, separación mínima de 1 s, reintentos acotados con `Retry-After`, escrituras exclusivas `wx`, SHA-256 y reutilización solo con configuración e integridad iguales. Un archivo parcial por fallo de escritura no se presenta como completo: la siguiente ejecución se detiene para revisión. La entrada del catálogo se entrega para registro **manual**, tras revisar datos y metadatos. Los límites de frecuencia son de esta herramienta; antes de uso real se deben revisar las políticas actuales de NASA/JPL. Versión, precisión e incertidumbre permanecen `null` cuando la respuesta no los aporta. El JSON astronómico original no se modifica.

## Cobertura y selección

En `catalogVersion:1`, `coverage` conserva el intervalo global del archivo. La extensión opcional `bodyCoverage` declara los extremos de cada cuerpo. El proveedor verifica esos extremos contra muestras presentes; catálogos antiguos sin ese campo siguen funcionando y el índice cargado determina la cobertura real. `getCoverage` conserva `intervals` como **envolventes por conjunto**, y añade `segments` como tramos sin huecos según la cadencia. `gaps` señala huecos internos y entre conjuntos; `overlaps` se calcula con tramos efectivos, no con envolventes. Con cadencia `null`, las muestras son puntos aislados y la interpolación requiere autorización explícita. Cada conjunto puede tener su propia cadencia; cada cuerpo puede tener una sola muestra.

`getExact` nunca interpola. Devuelve `found`, `missing` (`outside_coverage` o `no_exact_sample`) o `conflict`. En solapamientos compatibles elige el primer conjunto del catálogo y conserva los alternativos; contradicciones no se resuelven automáticamente. `getInterpolated` usa dos muestras del mismo conjunto, exige el intervalo máximo y, por defecto, rechaza huecos y cadencia desconocida. Rechaza solapamientos ambiguos y conflictos de extremos. Ninguna consulta extrapola.

## Hermite: matemática y precisión

Para `u=(t-t0)/h`, con `h` en segundos, `p(u)=h00 p0+h10 h v0+h01 p1+h11 h v1`, donde `h01=u²(3-2u)`, `h10=u(1-u)²`, `h11=-u²(1-u)` y `h00=1-h01`. Las derivadas son `d00=6u(u-1)`, `d01=-d00`, `d10=(1-u)(1-3u)` y `d11=u(3u-2)`. Por ello `v=d00(p0-p1)/h+d10 v0+d11 v1` (km/s). Se evalúa la posición como `p0+h01(p1-p0)+h(h10 v0+h11 v1)` (km). Los extremos se devuelven sin recalcular. Esta identidad algebraica evita restar términos del orden de la posición absoluta al calcular la velocidad.

En un caso controlado con `p0=10¹² km`, desplazamiento `1000 km` y paso aproximado de 1 s, el máximo error de velocidad respecto al movimiento lineal bajó de `2.830799212460988e-4` a `4.547473508864641e-13 km/s`; el máximo error de posición fue `0.0001220703125 km` en ambas formulaciones. Es una medición numérica de un caso, no una garantía universal. IEEE 754 limita la representación del JD, las posiciones grandes y los incrementos inferiores a una ULP. La identidad matemática de las fórmulas no implica resultados numéricos idénticos. La interpolación tampoco certifica una órbita física.

## Regresión interna con muestras retenidas

Se usaron los 32 días originales de octubre de 2026. Para cada planeta se retuvo cada índice impar 1, 3, …, 29 (15 referencias); solo los dos días adyacentes fueron extremos. Cada intervalo es de **2 días**. La tabla registra los máximos de norma euclidiana entre interpolación y muestra retenida. Los límites de prueba se fijaron por encima de los máximos observados con margen para detectar cambios sustanciales; son **límites de regresión de este archivo**, no tolerancias astrométricas certificadas.

| Cuerpo | Máx. posición km | Límite km | Máx. velocidad km/s | Límite km/s |
|---|---:|---:|---:|---:|
| Mercurio | 177.402138 | 200 | 6.80874355e-5 | 8e-5 |
| Venus | 2.753405 | 4 | 1.78372063e-7 | 3e-7 |
| Tierra | 1.160894 | 2 | 6.23475350e-7 | 1e-6 |
| Marte | 0.059481 | 0.1 | 4.97026082e-8 | 1e-7 |
| Júpiter | 57.906593 | 70 | 6.05380322e-4 | 7e-4 |
| Saturno | 1.352168 | 2 | 1.29969185e-5 | 2e-5 |
| Urano | 3.608878 | 5 | 2.49821922e-5 | 3e-5 |
| Neptuno | 3.827336 | 5 | 1.41881702e-5 | 2e-5 |

`node --test tests/ScienceHermiteInterpolation.test.mjs` imprime los máximos con más cifras. Las pruebas algebraicas (polinomio y extremos), numéricas (cancelación y paso corto) y de regresión son distintas. No existe en esta etapa una adquisición independiente de Horizons en puntos intermedios; los datos retenidos del mismo archivo no constituyen validación astronómica independiente.

## Rendimiento

El proveedor crea y valida cada `ScientificState` en la frontera de carga. Al añadir metadatos del catálogo a estados ya validados, copia y congela únicamente la envoltura y los metadatos. `scripts/benchmark-provider-enrichment.mjs` compara la ruta anterior (revalidación completa) con la actual, 20 000 operaciones, mediana de seis corridas medidas tras calentamiento: **43.93 ms frente a 3.59 ms** en este equipo. Es un microbenchmark del enriquecimiento, sin E/S, parseo JSON ni consultas; no predice una mejora de la misma proporción para la carga completa. El formato diario aún valida metadatos por muestra en su adaptador público; se conservó esa validación hasta disponer de una ruta interna encapsulada que pueda demostrar integridad.

## Integración visual

El modo predeterminado sigue siendo el flujo anterior. Para activar la primera integración, abrir `/?ephemeris=scientific` localmente o `/simulador-sondas-espaciales/?ephemeris=scientific` en Pages; quitar el parámetro o usar `ephemeris=legacy` la desactiva tras recargar. El catálogo y el dataset se leen desde `import.meta.env.BASE_URL` y pasan por el proveedor. La línea temporal actual sigue enumerando los días del archivo visual original; en esos días el proveedor devuelve muestras exactas. La API de integración también acepta instantes intermedios y usa Hermite cuando lo permite el contrato.

`ScientificVisualPipeline` es puro: convierte km a las 32 unidades de escena por AU y cambia `(x,y,z)` a `(x,z,-y)`, sin modificar el estado físico. Devuelve además valores AU y AU/día compatibles con la ficha. La cámara, el renderizado, la composición, el HUD, las texturas y los controles permanecen en los módulos actuales. Ante un error científico, el modo activado muestra explícitamente **Fallback visual del flujo anterior**, con sus posiciones y datos de ficha; no muestra el resultado fallido como científico. Las respuestas tardías de fechas anteriores se descartan. La activación no amplía aún la línea temporal a otros archivos ni ofrece un control de subdía.
