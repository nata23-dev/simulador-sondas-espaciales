# Etapa 13 — Misiones interplanetarias integradas

**Estado: implementada y probada localmente (259/259 pruebas: 241 previas sin modificar + 18 nuevas). Auditoría independiente de Gemini pendiente; la etapa no está validada.** Rama `revision/modo-historico-voyager`, sin commit.

La etapa conecta, con estados físicos continuos, las fases Tierra → transferencia heliocéntrica → encuentro planetario (esfera de influencia, hipérbola, plano B) → captura con empuje finito → órbita planetocéntrica → transferencia y aproximación a un satélite → captura en el satélite → descenso 12F. Cada fase declara su estado y su nivel: **OPERATIVO**, **EXPERIMENTAL**, **PENDIENTE** o **NO VIABLE para el escenario configurado**. Una cadena «completa según el modelo» no es una misión operativa.

## 1. Arquitectura

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Ciencia (sin DOM ni Three.js) | `src/science/PlanetaryEncounter.js` | SOI (Laplace, Hill), marco del plano B, hipérbola desde (v∞, rp, θ), plano B desde un estado, captura impulsiva, elementos clásicos, tiempo al periapsis. |
| | `src/science/PlanetocentricWindow.js` | Ventanas de efemérides de satélites centradas en el planeta (Hermite cúbico, sin extrapolar, huecos rechazados). |
| | `src/science/KeplerPropagator.js` | Variable universal; en 13 se añadió un horquillado Newton–bisección (§6). |
| Laboratorio | `src/lab/EncounterDesign.js` | Apuntado: Lambert hasta el punto de entrada en la SOI, iterado con Newton sobre v∞ hasta lograr la hipérbola pedida. |
| | `src/lab/OrbitalInsertion.js` | Captura con empuje finito (DOPRI54, masa variable, corte por evento) y su referencia impulsiva. |
| | `src/lab/IntegratedMission.js` | Modelo de tramos reutilizable (`kepler`, `burn`, `landing`), cadena de fases, comprobación de continuidad, conversión entre marcos. |
| | `src/lab/IntegratedMissionPlayback.js` | Contextos de vista (heliocéntrico, planeta, satélite, descenso), muestreo determinista, ritmo automático por fase, telemetría por depósito. |
| Interfaz | `src/ui/IntegratedMissionPlanner.js` | Modalidad «Misión completa» del Planificador (escenarios A1–A3, B1–B2, formulario, cadena de fases, resultados). |
| | `src/ui/MissionControlCenter.js`, `src/lab/MissionExecutionView.js` | Centro de Misión unificado para `kind: 'integrated'`. |

No hay interfaz específica por planeta: los destinos salen de `ENCOUNTER_TARGETS` (Mercurio, Venus, Marte al centro del planeta; Júpiter, Saturno, Urano y Neptuno al baricentro del sistema) y los satélites de la ventana cargada.

### 1.1 Modelo de tramos y continuidad

Cada tramo guarda cuerpo central, marco, μ, intervalo, estado inicial y final, masa y fase. `checkContinuity` compara el estado final de cada tramo con el inicial del siguiente en el **mismo instante TDB**, convirtiendo de marco con sumas de estados de efemérides (Sol → baricentro 5 → Europa). Se informan saltos de posición, velocidad, tiempo y masa no declarada (las separaciones se declaran como eventos).

## 2. Modelos físicos y límites

- **Cónicas parcheadas.** Dentro de cada SOI solo actúa el cuerpo central como masa puntual. Se omiten la gravedad solar dentro de la SOI, otros satélites, J2 y la presión de radiación.
- **SOI.** Laplace: r = a·(m/M)^(2/5). Hill: r = a(1−e)·(m/3M)^(1/3). El modelo es elegible y se declara.
- **Encuentro.** No se inventa la orientación: el ángulo θ del plano B lo elige el usuario o una regla declarada. Las reglas son mínima inclinación respecto a la eclíptica o, con satélite, al plano orbital del satélite según su efeméride en la llegada. El periapsis pedido se alcanza por apuntado desde la Tierra; si la hipérbola corta la superficie, la fase se marca NO VIABLE.
- **Inyección.** Es la condición inicial: Tierra(t₀) + v∞ apuntada, con lanzador externo no modelado. **12E no está conectado.**
- **Capturas.** El empuje es retrógrado continuo respecto al cuerpo central. El encendido empieza a la mitad de su duración estimada antes del periapsis y se corta al alcanzar el apoapsis objetivo.
  - Si el propelente se agota antes, el resultado es «captura parcial» o «sobrevuelo hiperbólico», según la energía final.
  - La referencia impulsiva es vis-viva en el periapsis.
- **Transferencia a un satélite.** Es una búsqueda acotada de arcos de Lambert de cero revoluciones, desde la órbita de captura hasta la SOI del satélite, sobre la efeméride real. Después se ejecuta un encendido finito de dirección inercial fija, apuntado por disparo (error en la SOI < 1 m).
- **Encuentros con otros satélites.** Las aproximaciones cercanas se cribran: si alguna entra en una SOI ajena, se avisa; no se integra su perturbación.
- **Descenso.** Se conecta con 12F solo si el estado final de la captura se representa exactamente como órbita inicial de 12F. Se comprueba con elementos clásicos y reconstrucción (residuo < 10⁻⁶ km). El descenso es de un solo cuerpo y omite la marea del planeta.
- **Descensos atmosféricos.** Marte, Venus y Titán quedan PENDIENTES y no se simulan.

## 3. Datos científicos

| Conjunto | Origen y marco | Cadencia y cobertura | SHA-256 |
|---|---|---|---|
| `public/data/interplanetary/ip-barycenters-outer-2026-2046.json` | Horizons API 1.2, DE441, baricentros 5–8, centro `500@10`, ICRF eclíptico J2000, TDB, km, km/s, sin correcciones | 4 d; 2026-11-18 → 2046-01-01 | `06b084ac…bd602a7`* |
| `public/data/interplanetary/galilean-moons-jsb-2031-2032.json` | Horizons API, Ío, Europa, Ganímedes y Calisto, centro `500@5`, ICRF eclíptico J2000, TDB, vectores geométricos | Europa 1 h, Ío 2 h, Ganímedes y Calisto 6 h; **solo 2031-08-01 → 2032-06-01** (ventana de llegada) | `f1699733922c7e59d2b2820d8098433050201babd1aebb8c5a921d9181cdf951` |
| `public/data/encounter-ephemerides-catalog-v1.json` | Catálogo que añade los baricentros a la búsqueda 12G | — | `5ef8417faa3a9b829e308b2b47de1052ecb4020840de8a466f21aaa867b59bbd` |
| `tests/fixtures/stage13-encounter-holdout-v1.json` | Estados Horizons fuera de los nodos y desplazamiento 599 − 5 | control | `54ec52dc795dca55c7345c8d9985f7d1af189d98e9b89f5aecf9a712bbd602a7` |
| `tests/fixtures/stage13-galilean-holdout-v1.json` | Estados Horizons de los satélites fuera de los nodos | control | `09c97e683eaf062727097a962ad5e03cf0bb092a1b853c24c914253c25d54a1c` |

\* Valor completo: `06b084acbbdc0397e64d02e1e984ea186a153c3cc4bf1a6b1040fa268a224703`.

**Adquisición.** El guion es `scripts/acquire-stage13-encounters.mjs`, ejecutado una vez, con el cliente genérico «13 (cliente cientifico)» y sin datos personales. Cada respuesta guarda su SHA-256 y sus parámetros. Los baricentros usan el tipo `planet` del formato compacto existente, porque el validador no admite otro tipo; la procedencia declara que son baricentros. No se tocaron datos, hashes ni kernels de Voyager.

**Errores medidos frente a Horizons fuera de los nodos** (`evidence/stage13/numerical-results.json`):

| Cuerpo | Error máx. de posición | Error máx. de velocidad |
|---|---|---|
| Baricentro 5 (Júpiter) | 3,2 m | 3,5·10⁻⁸ km/s |
| Baricentros 6–8 | ≤ 0,5 m | — |
| Europa | 0,056 km | — |
| Ío | 6,96 km | — |
| Ganímedes | 6,44 km | — |
| Calisto | 0,40 km | — |

Los errores declarados están en `MEASURED_MOON_INTERPOLATION_ERROR`. El centro de Júpiter (599) se aparta entre 52 y 201 km del baricentro en las muestras de control.

## 4. Observaciones de Gemini sobre 12G

- **OBS-12G-01 (refinamiento local).** `refineTransferCandidate` aplica Nelder–Mead acotado a ± media celda, y la interfaz ofrece «Seleccionar el candidato refinado». Sigue siendo el mejor del intervalo examinado, no un óptimo global.

  | Caso | C3 de la cuadrícula → refinado (km²/s²) |
  |---|---|
  | Marte | 8,9959 → 8,9952 |
  | Venus | 9,1852 → 9,1846 |
  | Júpiter | 75,7319 → 75,7242 |
  | Saturno | 109,8726 → 109,4396 |
  | Neptuno | 159,0303 → 157,3606 |

- **OBS-12G-02 (Júpiter).** Los encuentros usan el baricentro 5, con cadencia de 4 d y error ≤ 3,2 m, y el GM del sistema. Así se elimina el error de hasta ~95 km de interpolar el centro 599 a 4 d. El centro 599 se mantiene en 12G solo como destino de la búsqueda heliocéntrica.
- **OBS-12G-03 (bordes).** `candidateEdgeDiagnostics` avisa si el mínimo cae en el borde del intervalo de salida o de duración, o del intervalo recortado por cobertura (Neptuno: «Mínimo en el borde del intervalo de tiempos de vuelo»).

## 5. Resultados

Todos los resultados se reproducen con `node scripts/report-stage13-missions.mjs`.

### 5.1 Misión A — Tierra → Marte

**Ventana.** La semilla es la ventana 12G del 2028-11-30 con 316 d (C3 8,996 al centro). Refinada: salida 2028-11-29 16:49 UTC, 314,76 d.

**Llegada.** C3 apuntado 8,994 km²/s²; v∞ 3,1377 km/s; SOI de Laplace 577 215 km; periapsis 400,00 km de altitud; giro 64,6°.

| Escenario | Resultado | Δv finito (impulsivo) | Propelente | Masa final |
|---|---|---|---|---|
| A1 · apoapsis 33 000 km | Órbita objetivo alcanzada, corte por evento; 847 s; pérdida por gravedad 12,7 m/s | 1184,5 m/s (1171,8) | 181,0 kg | 380 kg |
| A2 · circular a 400 km | **Captura parcial**: agotado; NO VIABLE para el escenario | 1257,1 m/s de 2334,5 necesarios | 190 kg | 371 kg |
| A3 · sobrevuelo | Sale de la SOI y continúa en crucero heliocéntrico (hasta el fin de la cobertura) | — | — | — |

- **Continuidad:** ≤ 4,9·10⁻⁷ km y ≤ 7,5·10⁻¹² km/s, sin huecos ni masa no declarada.
- **Descenso atmosférico:** **PENDIENTE** (registro 12F). El lanzamiento 12E no está conectado.

### 5.2 Misión B — Tierra → Júpiter → Europa → descenso

**Ventana.** La semilla es la ventana 12G del 2028-12-26 con 1090 d. Refinada al baricentro: salida 2028-12-26 03:18 UTC, 1094,78 d; C3 75,724 (75,683 apuntado a la SOI).

**Vehículo.**
- Sonda «Exploración interplanetaria»: 561 kg.
- Módulo de propulsión **ilustrativo**: estructura 1500 kg, depósitos 6 %, 80 000 kg de propelente, 270 kN, Isp 323 s.
- Módulo de aterrizaje de 12F: 5700 kg.
- Masa en la inyección: 92 561 kg. **La capacidad del lanzador no se evalúa.**

**Llegada.**
- SOI: 48,2·10⁶ km; v∞ 5,1704 km/s.
- Plano B: B·T = 1 651 402 km, B·R = −45 678 km, θ = −1,58°, elegido por mínima inclinación respecto a Europa.
- Periapsis 3 RJ (209 733 km de altitud); 85,67 d de la SOI al periapsis.

| Maniobra | Duración | Δv finito (impulsivo) | Propelente | Final |
|---|---|---|---|---|
| Inserción en órbita de Júpiter (apoapsis 4·10⁶ km) | 393 s | 1424,6 m/s (1424,6) | 33 527 kg | corte por apoapsis |
| Transferencia hacia Europa (3162 arcos evaluados) | 226 s | 1252,6 m/s (1247,9) | 19 281 kg | apuntado, error en la SOI 0,4 m |
| Inserción en órbita de Europa (apoapsis 5000 km) | 300 s | 3256,9 m/s (3249,6) | 25 536 kg | corte |
| Reducción de apoapsis a 100 km | 18 s | 365,8 m/s | 1551 kg | corte |
| Descenso 12F en Europa | 3996 s | 1564,2 m/s | 2512 kg | ATERRIZAJE SUAVE SEGÚN EL MODELO (−1,28 / 0,04 m/s) |

**Aproximación a Europa.**
- v∞ 4,60 km/s; periapsis logrado 100,05 km (objetivo 100); SOI 9718 km.
- Distancias mínimas: Ío 698 680 km, Ganímedes 469 494 km, Calisto 141 291 km, todas fuera de sus SOI.

**Separación y descenso.**
- La reducción a 100 km deja un periapsis de 78,45 km por las pérdidas del encendido finito. La órbita resultante es la órbita inicial de 12F, con residuo 2·10⁻¹² km.
- El módulo de propulsión se separa y queda en órbita de Europa: 6406 kg, con 105,7 kg de propelente.

**Balance final.**
- Masa final 3749 kg; propelente del módulo de aterrizaje 1688 kg.
- Continuidad: 12 fronteras (2 con cambio de marco); máx. 0,76 m y 1,2·10⁻¹⁰ km/s. En el navegador, con el refinamiento de la interfaz, es de 1,42 m y 1,3·10⁻¹⁰ km/s.
  - El metro procede de la frontera crucero → Júpiter, tras 1095 d de propagación kepleriana heliocéntrica con Hermite de 4 d en el baricentro.
- Cálculo: ~160 ms en Node.

**Escenario B2 (50 000 kg de propelente).** La inserción en Europa agota el módulo tras 2805,4 m/s, de 3613 necesarios. Resultado: **SIN CAPTURA · SOBREVUELO HIPERBÓLICO**, cadena **NO VIABLE para el escenario configurado** y ningún descenso.

**Sensibilidad (observada, no optimizada).**
- Con 90 kN las pérdidas por gravedad en Europa crecen mucho.
- Más propelente con poco empuje puede empeorar la captura.
- Un apoapsis joviano de 10⁷ km abarata la inserción en Júpiter, pero encarece la de Europa.

**Sin efemérides.** Si la llegada cae fuera de la ventana galileana, la fase lunar es «datos no disponibles»: no se inventan estados ni se encadena automáticamente Júpiter → Europa.

## 6. Correcciones del propagador kepleriano

El encadenamiento expuso dos fallos de `propagateKepler` que no cubrían las pruebas de 12G:

1. **Falsa convergencia por redondeo.**
   - Síntoma: con apoapsis de 10⁷ km la captura parecía un sobrevuelo de 23 km/s.
   - Causa: el paso de Newton era menor que un ulp y la comparación exclusiva con el horquillado bisecaba lejos de la solución.
   - Corrección: el criterio |F| ≤ 16ε·escala se evalúa antes de cada paso, y el horquillado es inclusivo.
2. **No convergencia.**
   - Casos: elipses casi rectilíneas e hipérbolas lejanas con mala semilla.
   - Corrección: horquillado inicial (χ ∈ [0, 2π/√α] en elipses; lo = 0 o hi = 0 en otras cónicas), bisección si |F| no se reduce a la mitad y convergencia por ancho del horquillado.

Las 241 pruebas previas pasan sin cambios. Un barrido de 6000 cónicas aleatorias da 0 fallos y un error relativo máximo de 5·10⁻⁹.

## 7. Interfaz

**Planificador · «Misión completa».**
- Escenarios A1–A3 y B1–B2 y formulario: destino, satélite, fecha, duración, refinamiento, módulo, aterrizador, modo, SOI, periapsis, apoapsis, plano B y órbitas en el satélite.
- Cadena de fases con tonos, gráfico 2D por contexto (heliocéntrico, planeta, satélite) y resultados: veredicto, fases, maniobras, masas, aproximación, continuidad, avisos, procedencia y límites.

**Centro de Misión.**
- Una línea de tiempo continua con eventos en UTC: SOI, encendidos, cortes, agotamiento, separación y fases del descenso.
- Contexto de vista automático o fijado: heliocéntrico a 32 u/AU; planeta y satélite a 1 u = 10 000 km; escena local 12F.
- Ritmo «auto» por fase (crucero 10 d/s … captura en el satélite 10 s/s), que se detiene en las fronteras de tramo.
- Pausa, retroceso, aceleración y salto entre eventos; telemetría por fase con masa y propelente de cada depósito; cámaras existentes, incluida la local en el descenso.

Se mantiene la identidad visual oscura y dorada; los estilos nuevos están en `experimental-laboratory.css`, con reglas a 1100, 820 y 420 px.

## 8. Pruebas y verificación

**`tests/IntegratedMissions.test.mjs`** (18 pruebas). Cubre:
- Kepler: casos de fallo y barrido determinista.
- SOI: fórmulas cerradas.
- Hipérbola y plano B: e, b, giro, rp tras propagar, B·T/B·R recuperados.
- Captura impulsiva contra vis-viva.
- Captura finita:
  - Tsiolkovsky exacto.
  - **RK4 de paso fijo independiente** que reproduce el encendido: < 1 m y < 10⁻⁶ km/s.
  - Energía conservada en tramos balísticos.
- Agotamiento y sobrevuelo.
- Elementos clásicos ↔ órbita inicial 12F.
- Efemérides:
  - Baricentros contra Horizons fuera de los nodos (≤ 10 m).
  - Satélites dentro del error declarado.
  - Rechazo de huecos y de instantes fuera de la ventana.
- Apuntado a la SOI con el periapsis pedido (±1 m), diferente de Lambert al centro.
- Misiones A1, A2/A3, B1, B2 y B sin efemérides de satélites.
- Reproducción determinista: contextos coherentes con las efemérides, telemetría por depósito y continuidad recalculada.
- OBS-12G-01/03.

**Resultados.**
- `node --test tests/*.test.mjs`: **259/259**.
- `npm run build`: correcto; solo el aviso previo de tamaño de fragmento.
- `git diff --check`: sin errores.

**Navegador.** `node scripts/verify-stage13-browser.mjs` usa Chrome sin interfaz, SwiftShader y Playwright local.
- Recorrido: A1, A2, A3, B1 y B2 en el Planificador; A1 y B1 en el Centro de Misión. Incluye eventos, cambio de contexto en el mismo instante, separación, contacto con cámara local, retroceso y ritmo automático.
- Resoluciones: 1600×1000, 1366×768, 390×844 y 320×568.
- Resultado: 20 capturas en `evidence/stage13/`, **0 errores de consola** y 0 px de desbordamiento horizontal a 390 y 320 px.
- Correcciones tras la revisión visual:
  - Encuadre del contexto planetario.
  - Fase vigente en las fronteras.
  - Redondeo de los elementos en los títulos de eventos de 12F.
  - Etiqueta del laboratorio «ETAPA 13».

## 9. Matriz de estado

| Capacidad | Estado |
|---|---|
| Crucero heliocéntrico apuntado a la SOI | OPERATIVO (cónica, sin correcciones ni perturbaciones) |
| Aproximación hiperbólica, plano B y periapsis | OPERATIVO |
| Captura con empuje finito en un planeta o satélite | EXPERIMENTAL (ley de guiado simple, parámetros ilustrativos) |
| Órbita planetocéntrica, transferencia y aproximación al satélite | EXPERIMENTAL (solo galileanos y solo 2031-08 → 2032-06) |
| Descenso 12F conectado en Europa | EXPERIMENTAL (12F de un cuerpo) |
| Inyección desde el lanzamiento 12E | PENDIENTE (no conectado) |
| Descenso atmosférico (Marte, Venus, Titán) | PENDIENTE |
| Satélites de Saturno, Urano y Neptuno | PENDIENTE (sin efemérides por ventana) |
| Asistencias gravitacionales, multi-revolución, correcciones de crucero | PENDIENTE |
| Escenarios A2 y B2 | NO VIABLE para el escenario configurado (por diseño de la prueba) |

## 10. Pendiente y evidencia externa necesaria

- Auditoría científica independiente de Gemini sobre esta etapa y sobre los cambios en `KeplerPropagator.js`.
- Revisión visual humana en un navegador con GPU; la verificación usó SwiftShader.
- Sin commit, push, despliegue ni ZIP. Los conjuntos de datos y las pruebas nuevos son archivos locales sin añadir a Git.
