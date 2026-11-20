# Etapa 12G — Efemérides, ventanas de lanzamiento y transferencias interplanetarias (incluye 12F.1)

**Estado:** implementada y probada localmente (241/241 pruebas en la batería completa: 213 previas + 24 de 12G + 4 de 12F.1). **Pendiente de auditoría independiente de Gemini; 12G no está validada.** Sin commit, push, despliegue ni ZIP. 12F quedó **aprobada** por Gemini según el informe local [STAGE12F_INDEPENDENT_AUDIT.md](STAGE12F_INDEPENDENT_AUDIT.md); sus dos observaciones se corrigieron en 12F.1 ([detalle](STAGE12F_MULTIBODY_LANDING.md#13-correcciones-12f1-18-11-2026)).

Documentos asociados: [tiempo y marcos](ASTRODYNAMICS_TIME_AND_FRAMES.md), [cobertura de efemérides](INTERPLANETARY_EPHEMERIS_COVERAGE.md), [capacidades](MULTIBODY_MISSION_CAPABILITY_MATRIX.md). Evidencia: `evidence/stage12g/` (capturas, `browser-verification.json`, `numerical-results.json`).

## 1. Correcciones 12F.1 (resumen)

| Punto | Causa verificada | Corrección |
|---|---|---|
| A. Visor gris en el contacto lunar | Cámara local con objetivo suavizado (retardo de km con la cámara a ~0,35 km), esfera facetada por debajo de R y «arriba» del mundo | Objetivo exacto, vertical local, plano cercano inmediato, parche de suelo a radio R exacto, modelo apoyado por su base (solo descensos). Estados intactos |
| B. «Misión preparada en la órbita terrestre inicial» en descensos | Mensaje fijo | Mensajes por tipo y cuerpo; «aterrizaje suave según el modelo (descenso local aislado)», «misión completa: no evaluada», «viabilidad operativa: no verificada» |
| C. Panel del módulo cerrado | `<details>` sin `open` | Abierto, «(ilustrativo · editable)», sin cambiar valores |
| D. Tolerancias | Se confundía 1e-9 km con la precisión | Cuatro magnitudes separadas y `diagnostics.contactTolerances` |

Pruebas: `tests/Stage12F1Corrections.test.mjs` (Z-A … Z-D). Captura: `evidence/stage12g/07_fix_12f1_touchdown_local_camera.png`.

## 2. Arquitectura

| Archivo | Capa | Responsabilidad |
|---|---|---|
| `src/science/AstrodynamicsTime.js` | ciencia | Cadena UTC → TAI → TT → TDB, DELTET de NAIF, etiquetas redondeadas |
| `src/science/Frames.js` (ampliado) | ciencia | Rotación eclíptica J2000 ↔ ecuatorial ICRF (ε = 84 381,448″) |
| `src/science/InterplanetaryEphemeris.js` | ciencia | `getBodyState`, `loadWindow().stateAt` sobre `EphemerisProvider` + Hermite; rechazo fuera de cobertura |
| `src/science/KeplerPropagator.js` | ciencia | Propagación de dos cuerpos por variables universales; funciones de Stumpff; elementos osculantes |
| `src/science/LambertSolver.js` | ciencia | Lambert cero revoluciones, diagnósticos y cierre independiente |
| `src/lab/InterplanetaryPlan.js` | laboratorio | Opciones, firma/invalidación, búsqueda en cuadrícula, v∞, C3, asíntota, Δv de inyección, requisitos, comparación con el Hangar, destinos satelitales |
| `src/lab/InterplanetaryPlayback.js` | laboratorio | Ejecución determinista, muestreo, eventos (salida, perihelio/afelio, llegada) y telemetría |
| `src/ui/InterplanetaryPlanner.js` | interfaz | Modalidad «Misiones interplanetarias»: formulario, mapa de oportunidades (canvas 2D), vista polar, tabla, detalle |
| `scripts/acquire-stage12g-interplanetary.mjs` | adquisición | Descarga reproducible y archivo de control |
| `scripts/report-stage12g-windows.mjs`, `scripts/verify-stage12g-browser.mjs` | evidencia | Informe numérico sin red y verificación en navegador |

Cambios en módulos existentes: `MissionControlCenter.js` (rama `interplanetary`, mensajes 12F.1, velocidades 10/30/100 d/s solo en transferencias), `MissionExecutionView.js` (escena heliocéntrica y cámara local 12F.1), `MissionPlayback.createPlaybackClock` (límite de velocidad configurable; por defecto sigue siendo 86 400), `ExperimentalLaboratory.js` (selector de modalidad del Planificador, encabezado «ETAPA 12G»), `experimental-laboratory.css` (estilos acotados de la modalidad), `HorizonsAcquisition.mjs` (identificador de cliente genérico opcional), `BodyLanding*.js` y `LandingPlanner.js` (12F.1). No se modificaron datos Voyager, DE440, kernels SPK, Hangar, Ingeniería ni los planificadores 12B/12D/12E.

## 3. Solucionador de Lambert

Formulación de variables universales (Bate, Mueller & White 1971 §5.3; Curtis 2014 alg. 5.2; Vallado 2013 alg. 58), cero revoluciones:

```
cos Δθ = r1·r2 / (|r1||r2|);  Δθ ∈ (0, 2π) según el sentido respecto a +Z (norte eclíptico): prógrado ⇒ h_z > 0
A = sin Δθ · sqrt(|r1||r2| / (1 − cos Δθ))
y(z) = |r1| + |r2| + A (z S(z) − 1) / sqrt(C(z))
√μ · t(z) = (y/C)^{3/2} S + A sqrt(y)
f = 1 − y/|r1|,   g = A sqrt(y/μ),   ġ = 1 − y/|r2|
v1 = (r2 − f r1)/g,   v2 = (ġ r2 − r1)/g
```

- `t(z)` es monótona creciente en el dominio admisible (`y > 0`, `z < 4π²`) para cero revoluciones; se extiende con `t = 0` donde `y ≤ 0`. Se acota el intervalo (`z` hasta `4π²(1 − 10⁻⁶)` arriba y hasta −4×10⁵ abajo) y se resuelve con regula falsi de Illinois con intervalo garantizado (no Newton sin protección). Tolerancia relativa de tiempo 10⁻¹³; se exige ≤ 10⁻¹⁰ para aceptar.
- Adimensionalización `L = |r1|`, `T = sqrt(L³/μ)`: el mismo código resuelve casos geocéntricos y heliocéntricos de decenas de AU; razones de escala fuera de 10⁻⁸–10⁸ se rechazan como entrada inválida.
- Estados de salida: `converged`, `invalid_input` (no finito, Δt ≤ 0, μ ≤ 0), `degenerate_geometry` (Δθ = 0° o 180° exactos, posición nula), `no_solution`, `not_converged`. Nunca se devuelven velocidades si no hay convergencia.
- Geometría casi colineal (|Δθ − 180°| < 1° o Δθ < 1°): `nearColinear` y advertencia; la búsqueda la clasifica como **GEOMETRÍA MAL CONDICIONADA** y la excluye del mejor candidato.
- **Cierre**: cada solución se propaga de forma independiente (ecuación de Kepler en la variable universal χ, otro algoritmo) desde `(r1, v1)` durante Δt; se acepta solo si `|r(Δt) − r2| ≤ 1 km`.
- Alcance: **solo cero revoluciones**. No hay multi-revolución, óptimo global, asistencias gravitacionales ni perturbaciones.

### Verificación (pruebas I–L)

| Caso | Referencia | Resultado |
|---|---|---|
| Curtis, ej. 5.2 (μ = 398 600) | v1 = (−5,9925; 1,9254; 3,2456), v2 = (−3,3125; −4,1966; −0,38529) km/s | (−5,992495; 1,925363; 3,245637), (−3,312460; −4,196617; −0,385288); tolerancia 6×10⁻⁵ km/s (mitad del último dígito publicado) |
| Vallado, ej. 7-5 | v0 = (2,058913; 2,915965; 0), v = (−3,451565; 0,910315; 0) | (2,0589134; 2,9159644; 0), (−3,4515648; 0,9103142; 0); tolerancia 2×10⁻⁶ |
| Analítico: cuarto de órbita circular a 1 AU en T/4 | v1 = (0, √(μ/r), 0) | error relativo < 10⁻⁹ |
| Cierre DOPRI54 independiente (dos cuerpos, `relTol = 10⁻¹³`), Tierra 2029-03 → Marte | — | 60 d: 1,6×10⁻⁶ km; 150 d: 5,5×10⁻⁵; 260 d: 1,1×10⁻⁴; 330 d: 9,9×10⁻⁵; 500 d: 5,4×10⁻⁴ km (tolerancia de prueba 1 km ≈ 10⁻⁸ relativo) |
| Convergencia | — | 9–11 iteraciones típicas (64 en un arco tipo II de 500 d); error de tiempo ≤ 10⁻¹² |
| Invariancia de escala (`r → k r`, `μ → k³ μ`) | `v → k v` | 10⁻¹² relativo |
| Degenerados e inválidos | — | 180° y 0° exactos, posición nula, NaN, Δt ≤ 0, μ = 0, Δt infinito, escala 10¹⁰: sin trayectoria |

## 4. Búsqueda de ventanas y costes

Para cada celda (salida, tiempo de vuelo) de la cuadrícula: estado de la Tierra en la salida y del destino en la llegada (Horizons + Hermite), Lambert prógrado, `v∞,salida = v_transferencia,salida − v_Tierra`, `C3 = |v∞,salida|²`, `v∞,llegada = v_transferencia,llegada − v_destino`, duración, diagnósticos. Criterios: C3 mínimo, v∞ de llegada mínima o `|v∞,s| + |v∞,ll|`. Estados de celda: calculada, **FECHA SIN COBERTURA**, **SOLUCIÓN NO CONVERGENTE**, **GEOMETRÍA MAL CONDICIONADA**. El resultado distingue el **MEJOR CANDIDATO DEL INTERVALO EXAMINADO** (mínimo de la cuadrícula; se advierte si está en su borde), **CANDIDATO FÍSICAMENTE CALCULADO** (cualquier otra celda seleccionada) y **MISIÓN NO EVALUADA COMPLETAMENTE** (siempre). La tabla lista mínimos locales de la cuadrícula (oportunidades distintas). Límite: 120 000 celdas.

Asíntota de salida: DLA/RLA de `v∞,salida` en ejes ecuatoriales ICRF. Inyección ideal (cónicas parcheadas) desde una órbita circular de estacionamiento de altitud h: `Δv = sqrt(v∞² + 2μ⊕/r) − sqrt(μ⊕/r)`, `r = R⊕ + h`, `μ⊕ = 398 600,435507 km³/s²`, `R⊕ = 6 371,0084 km` (catálogo DE440 del proyecto). Supuestos: impulso instantáneo en el perigeo de la hipérbola, órbita de estacionamiento coplanaria con la asíntota, sin pérdidas gravitatorias ni de dirección. **No** significa que el lanzador demostrativo de 12E pueda realizarla ni está conectado con él.

## 5. Ventanas calculadas (fechas obtenidas por la búsqueda, no impuestas)

Reproducibles con `node scripts/report-stage12g-windows.mjs` (sin red); valores en `evidence/stage12g/numerical-results.json`. Fechas de salida en UTC a las 00:00 (TDB = UTC + 69,18 s). Δv de inyección desde 200 km.

| Caso | Búsqueda | Mejor candidato del intervalo | C3 (km²/s²) | v∞ salida / llegada (km/s) | Δv inyección | Tipo |
|---|---|---|---|---|---|---|
| **A** Tierra → Marte | salida 2028-06-01 → 2029-06-01 (paso 2 d), vuelo 100–450 d (2 d); 32 208 celdas, 344 ms | 2028-11-30 → 2029-10-12, 316 d | 8,996 | 2,999 / 3,187 | 3,627 km/s | II, DLA 29,0° |
| A (otros mínimos) | | 2028-12-10 → 2029-07-20, 222 d (tipo I) | 9,029 | 3,005 / 4,892 | 3,629 | I |
| A2 Tierra → Marte | 2030-06-01 → 2031-08-01 | 2031-02-22 → 2032-01-08, 320 d | 8,171 | 2,859 / 5,507 | 3,591 | II |
| **B** Tierra → Venus | 2027-01-01 → 2028-12-31 (2 d), 60–250 d | 2028-03-26 → 2028-09-14, 172 d | 9,185 | 3,031 / 5,790 | 3,635 | II |
| B (otro mínimo) | | 2028-03-10 → 2028-07-02, 114 d | 11,184 | 3,344 / 5,978 | 3,723 | I |
| **C** Tierra → Júpiter (directa) | 2028-01-01 → 2029-12-31 (4 d), 400–1 400 d (10 d) | 2028-12-26 → 2031-12-21, 1 090 d | 75,73 | 8,702 / 5,697 | 6,249 | II |
| Tierra → Mercurio (directa) | 2030 (2 d), 60–200 d | 2030-09-20 → 2031-01-14, 116 d | 51,30 | 7,162 / 13,164 | 5,350 | II |
| Tierra → Saturno (directa) | 2030-01 → 2031-06 (6 d), 1 200–2 800 d | 2030-07-30 → 2034-10-17, 1 540 d | 109,87 | 10,48 / 6,54 | 7,417 | I |
| Tierra → Urano (directa) | 2030-01 → 2031-06 (8 d), 2 500–6 000 d | 2030-08-13 → 2041-08-15, 4 020 d | 136,72 | 11,69 / 5,69 | 8,275 | I |
| Tierra → Neptuno (directa) | 2030-01 → 2031-06 (10 d), 3 500–5 600 d | 2030-05-31 → 2045-09-29, 5 600 d **(borde)** | 159,03 | 12,61 / 6,83 | 8,955 | I |

Interpretación:

- **Marte y Venus**: los mínimos de C3 ≈ 8–9 km²/s² aparecen en las épocas sinódicas esperadas (oposición de Marte a comienzos de 2029/2031; conjunción inferior de Venus en 2028). La comparación cuantitativa con un catálogo publicado de oportunidades 2026–2045 (p. ej., el *Interplanetary Mission Design Handbook* de NASA para Marte) **queda pendiente** para la auditoría externa: aquí no se calibró nada contra él.
- **Júpiter, Saturno, Urano, Neptuno y Mercurio**: transferencias directas idealizadas con C3 de 51–159 km²/s². Las misiones reales usan asistencias gravitacionales (y Mercurio, frenado en varios sobrevuelos) para reducirlos; esas trayectorias no están implementadas. Para Neptuno el mínimo está en el **borde** de la cuadrícula (5 600 d) y la llegada en 2045: el mínimo real podría estar fuera de la cobertura; la interfaz lo advierte. Urano: 745 celdas sin cobertura (llegadas posteriores a 2045-12-31).

## 6. Interfaz

Planificador → selector «Tierra–Luna y empuje finito» / **«Misiones interplanetarias»**. El usuario elige origen (solo Tierra validada; otros planetas marcados como pendientes), destino (planetas, o satélites agrupados como destinos futuros), fechas de salida UTC, rango y paso de tiempo de vuelo, paso de salida, criterio y órbita de estacionamiento; «Rango sugerido» propone escalas de tiempo de vuelo por destino (no fechas). «Buscar ventanas» muestra el mapa de oportunidades (salida × tiempo de vuelo, color logarítmico de la métrica, celdas sin cobertura/no convergentes/mal condicionadas diferenciadas, mejor candidato y selección marcados; clic para seleccionar), una vista polar de la eclíptica con la cónica propagada y los recorridos efeméricos de origen y destino, el detalle del candidato (fechas UTC y TDB, C3, v∞, DLA/RLA, Δv, tipo, iteraciones, cierre, posiciones y procedencia) y la tabla ordenable. Cualquier cambio de destino, fechas, pasos, criterio u órbita invalida los resultados y retira la transferencia del Centro de Misión. Sin dependencias gráficas nuevas.

Satélites (las 10 lunas del registro): se muestra planeta anfitrión, si se puede calcular la transferencia preliminar hasta ese sistema (botón que la prepara), las operaciones locales disponibles (descenso de 12F) y las etapas pendientes (esfera de influencia → captura → transferencia en el sistema → aproximación y descenso). No se dibuja ningún salto desde la cónica heliocéntrica a una órbita del satélite. La Luna remite al Planificador Tierra–Luna.

## 7. Visualización, Centro de Misión y telemetría

«Reproducir en el Centro de Misión» crea una ejecución `interplanetary`: escena heliocéntrica con el Sol en el origen, 32 u/AU, la cónica de la sonda (480 muestras de la propagación kepleriana), los recorridos efeméricos de origen y destino, marcadores de salida y llegada y los planetas moviéndose según Horizons en la época TDB reproducida. La posición de la nave en cada instante es `propagateKepler(r1, v1_Lambert, t, μ☉)`; no hay interpolación lineal entre planetas (prueba V comprueba que a mitad de vuelo la nave está a > 0,05 AU de la cuerda). Tamaños ampliados ilustrativos declarados en el pie. Controles: iniciar/pausar/retroceder/reiniciar, 1 s/s a 100 d/s, línea temporal, saltos a salida/perihelio/afelio/llegada, cámaras general (centrada en el Sol), seguimiento, desde la sonda (mirar al destino, al origen o a la velocidad), destino y cinematográfica. Reproducción determinista: el estado es función pura del instante.

Telemetría: tipo de misión, origen → destino, fase, fecha UTC (marcada como predicción si es futura) y época TDB con JD, tiempo desde la salida y restante, marco, posición y velocidad heliocéntricas, distancia al Sol (km y AU), rapidez, distancias a origen y destino, velocidad relativa al destino, C3, v∞ de salida y llegada, duración, Δv ideal de inyección (no propagado), conjuntos y soluciones JPL, método de interpolación, modelo y estado de validación. **No** se muestra combustible consumido: no hay maniobras programadas ni integradas en el crucero.

## 8. Relación con el Hangar

`requirements` de cada oportunidad: C3, v∞ de salida y llegada, Δv de inyección y altitud, asíntota de salida, duración, condiciones de llegada y la maniobra de inyección marcada `propagated: false`, más la lista de lo no incluido. Única comprobación implementada (físicamente justificable y declarada como **condición necesaria**): Δv ideal del diseño (Tsiolkovsky, `ProbeEngineering`) frente al Δv de inyección. Con la sonda «Exploración interplanetaria» (Δv ideal 1 257 m/s) el resultado es «Δv IDEAL INSUFICIENTE PARA LA INYECCIÓN» frente a 3 627 m/s para Marte: haría falta una etapa superior (no evaluada). Que Lambert encuentre una solución **no** declara viable la misión.

## 9. Pruebas

`tests/InterplanetaryPlanning.test.mjs` (24) cubre A–Y del encargo: A/A2 UTC↔TDB contra Horizons y DELTET; B fechas julianas; C marcos (eclíptica ↔ ecuatorial ICRF contra Horizons `FRAME`); D unidades; E nodos contra una consulta Horizons independiente; F Hermite contra estados no usados como nodos; G rechazo fuera de cobertura; H origen, ejes y frontera entre archivos; I casos publicados y analítico; J cierre DOPRI54 con cinco tiempos de vuelo; K convergencia, escala y Stumpff; L degenerados; M–N v∞ y C3; O inyección y comparación con el Hangar; P búsqueda (completitud, mejor = mínimo, celdas sin cobertura, límite); Q Marte; R Venus; S Júpiter; S2 Mercurio, Saturno, Urano y Neptuno; T–U invalidación por fechas, vuelo, destino y órbita; V reproducción determinista y reloj; W telemetría física sin combustible; satélites como destinos futuros. X–Y: la batería previa (213) sigue pasando y el reloj por defecto conserva su límite. Z: `tests/Stage12F1Corrections.test.mjs` (4).

Comandos ejecutados: `npm test` (241/241), `npm run build` (correcto; aviso de tamaño de fragmento ya existente), `git diff --check`, `node scripts/verify-stage12g-browser.mjs` (8 capturas en Chrome sin interfaz, sin errores de consola), `node scripts/report-stage12g-windows.mjs`.

## 10. Limitaciones científicas (no se declara)

- Transferencia de alta fidelidad N-cuerpos, perturbaciones planetarias, presión de radiación, correcciones de trayectoria.
- Asistencias gravitacionales, multi-revolución, óptimos globales, bajo empuje.
- Esfera de influencia, captura, inserción orbital, transferencia entre lunas, aterrizaje conectado.
- Conexión del lanzamiento terrestre (12E) con la inyección; capacidad del lanzador para un C3 dado.
- Viabilidad total de una misión o precisión operativa de navegación.
- Errores de interpolación declarados (hasta 95 km / 1,3 m/s en Júpiter); fechas UTC futuras sujetas a segundos intercalares no anunciados; comparación con catálogos publicados de oportunidades pendiente.

## 11. Pendiente para misiones completas a las lunas

1. Efemérides de satélites por ventanas de llegada y GM/orientación del sistema anfitrión.
2. Paso de la cónica heliocéntrica a la hipérbola planetocéntrica (esfera de influencia, plano B, periapsis de llegada).
3. Captura/inserción orbital con empuje finito (12D generalizado fuera de la Tierra).
4. Transferencias dentro del sistema (Lambert planetocéntrico, sobrevuelos de lunas).
5. Aproximación y órbita del satélite conectadas con el descenso de 12F, con marco IAU del cuerpo y rotación.
6. Asistencias gravitacionales y búsqueda multi-revolución para los planetas exteriores.
