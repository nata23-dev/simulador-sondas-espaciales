# Arquitectura de misiones multicuerpo

Documento de diseño de la Etapa 12F. Define contratos simples y reutilizables para que cada nuevo planeta o satélite se incorpore **por datos de perfil**, sin reescribir motores. Describe lo implementado y, expresamente, lo que falta. No declara capacidades que no existen.

## 1. Visión del simulador

Un simulador de misiones espaciales donde cualquier cuerpo del catálogo pueda ser destino u origen de las operaciones físicamente aplicables: lanzamiento, transferencia, inserción orbital, sobrevuelo, descenso atmosférico o propulsado, superficie. Prioridad: física correcta → funcionalidad real → integración → validación → experiencia → refinamiento visual. La Etapa 12F construye la base multicuerpo y **una** operación completa sobre ella (descenso propulsado en vacío).

## 2. Catálogo de destinos

Fuente única: `src/lab/CelestialBodyMissionRegistry.js` (`listBodyProfiles`, `getBodyProfile`). Se deriva de `SOLAR_SYSTEM_GM_CATALOG` (Sol, planetas, Luna), `PlanetaryMoons.js` (satélites y radios) y `Ephemerides.js` (`PLANETAS`). 19 cuerpos con identificadores NAIF estables (`'10'`, `'199'`…`'899'`, `'301'`, `'501'`…`'801'`). La interfaz y las pruebas no mantienen listas propias. Detalle por cuerpo: [matriz de capacidades](MULTIBODY_MISSION_CAPABILITY_MATRIX.md).

## 3. Perfiles físicos

`createBodyProfile(raw)` valida y congela: `id`, `name`, `type` (`star`, `rocky-planet`, `gas-giant`, `ice-giant`, `rocky-moon`, `icy-moon`), `parentId`, `gm {value, sigma?, source, scope}`, `radiusKm {value, source}`, `shape` (`sphere`; con radio medio), `rotation` (`null` o `{angularVelocityRadS, axis, source}`), `atmosphere {atmosphere, note}` (clasificación cualitativa), `ephemeris`, `missing[]`, `frames`. Rechaza `gm` o radio no positivos, tipos desconocidos y rotaciones degeneradas. **No inventa datos:** los parámetros ausentes se declaran en `missing` y la capacidad resultante es PENDIENTE con la razón. El GM de los satélites sin entrada en DE440 viene de `SATELLITE_GM_JPL` con su fuente y fecha de lectura; hay que verificarlo de forma independiente.

`landingCapability(perfil)` devuelve `{state, group, reason, missing}` aplicando los grupos A (sólidos sin atmósfera), B (con atmósfera), C (gigantes), D (Sol).

## 4. Marcos de referencia

`FRAME_CONTRACTS` distingue cinco contratos: baricéntrico/heliocéntrico, relativo a un planeta, relativo a una luna (los tres con efemérides TDB e ICRF), **inercial local** y **fijo al cuerpo**. Los dos últimos no son absolutos. `localFrameDescriptor(perfil, {epochUtc})` produce el descriptor que acompaña a cada resultado: `connectedToIcrf: false`, `epochTdbJd: null`, orientación arbitraria. Una transformación local → ICRF solo es legítima si se conocen marcos, época, orientación del cuerpo y estado del cuerpo central; hoy no se conoce la orientación de ningún cuerpo (`rotation: null`), así que **no se implementa ninguna transformación** y no se falsifica una posición astronómica.

## 5. Tiempo

Cuatro escalas, nunca mezcladas: tiempo de simulación (s, desde el inicio de la operación), TDB (efemérides), UTC (solo etiqueta de época) y fecha juliana. 12F usa solo el primero; `epochUtc` es una etiqueta y `epochTdbJd` es `null`. Conectar con efemérides exige UTC→TDB y cobertura temporal (las efemérides locales cubren un mes de 2026).

## 6. Vehículos

Se reutiliza el Hangar: la sonda es la **carga útil** y aporta su masa húmeda real (`payloadFromDesign`, 561 kg en el preset interplanetario). El **módulo de aterrizaje** es independiente de las piezas del Hangar (`BodyLandingVehicle.js`, `DEMO_LANDER`, ilustrativo): estructura (cuerpo, depósitos, patas), propelente propio, motor (empuje máximo, Isp, estrangulable sí/no, acelerador mínimo, reencendido). No se alteran los motores validados del catálogo. Limitación del Hangar: no tiene concepto de «módulo de aterrizaje»; hoy un diseño solo sirve como carga útil rígida. Para que una sonda sea además módulo, haría falta un modelo de patas/tren y de depósitos propios en `ComponentCatalog.js`.

## 7. Tipos de misión

Reproducibles hoy en el Centro de Misión: `transfer` (Tierra–Luna), `finite-thrust` (12D), `launch` (12E) y `landing` (12F). El Centro identifica el tipo por `execution.kind`; el cuerpo central y la escala viajan en `execution.transfer` (`bodyRadiusKm`, `sceneScale`, `centralBody`, `hideMoon`).

## 8. Estados dinámicos

Estado integrado de 8 componentes `[x, y, z, vx, vy, vz, m, Δv]` en km, km/s, kg y km/s (igual que 12D/12E). Estados reproducibles (`knots`): tiempo, posición, velocidad, masa, Δv. Todo lo demás (empuje, acelerador, altitud, fases) se **reevalúa** con las mismas funciones puras.

## 9. Propulsión

`dm/dt = −θ·F_max/(Isp·g0)`, `dΔv/dt = θ·F_max/(m·1000)`; `g0 = 9,80665 m/s²`. La modulación (`θ ∈ [θ_min, 1]`) solo existe si el motor la declara; un motor no estrangulable se rechaza para el guiado implementado (no se simula un estrangulamiento inexistente). La masa nunca baja de la seca: el agotamiento es un evento que detiene la integración, fija la masa y continúa balístico. Tsiolkovsky se verifica como identidad sobre toda la misión.

## 10. Navegación y guiado

Guiado idealizado y determinista de lazo cerrado, función pura del estado (`landingCommand`):

- Perfil vertical `v_z,obj = −√(v_td² + 2·a_d·máx(h − h_ref, 0))`, con `a_d = fracción·(F_max/m − g)` y corredor `h_ref = c·v_h^1,5 + τ_c·v_h`: el vehículo no desciende mientras queda velocidad horizontal por frenar. Es una ley heurística, no un óptimo.
- Prealimentación `a_d` que se anula al acercarse a la velocidad de contacto.
- Canal horizontal `a_h = mín(v_h/τ, √(A² − a_up²))`: prioridad al canal vertical.
- Fases (`braking`, `horizontal-reduction`, `terminal`) por umbrales de velocidad horizontal (200 y 5 m/s). Son etiquetas, no lógica de control.

Limitaciones: la ley conmuta el motor en el umbral de acelerador mínimo; por eso se rechazan los módulos cuyo empuje mínimo supere la gravedad local (vuelo estacionario imposible).

## 11. Eventos

Detección numérica por `shouldAbort` + bisección (hasta 1e-7 s): contacto `|r| = R`, agotamiento (`m ≤ m_seca`), periapsis objetivo y paso por periapsis. Fases derivadas de la trayectoria integrada por bisección sobre el estado interpolado.

## 12. Fases de misión

Órbita inicial → salida de órbita (encendido retrógrado a θ = 1 hasta alcanzar el periapsis de descenso) → aproximación al periapsis → frenado principal → reducción horizontal → descenso terminal → contacto → evaluación.

## 13. Transferencias

**No implementadas.** Distinguir tres escalas: heliocéntrica (ICRF, efemérides planetarias), planetocéntrica (esfera de influencia, cónicas empalmadas) y local (marco inercial del cuerpo, 12F). Hoy: Tierra–Luna restringido (12B, geocéntrico con efeméride lunar) y órbita local. Necesario: solucionador de Lambert, esferas de influencia, cambio de cuerpo gravitacional principal, ventanas de lanzamiento, cobertura de efemérides.

## 14. Inserción orbital

**No implementada** como operación independiente. Con `initialOrbitState` y el empuje finito de 12D (hoy ligado a la Tierra) sería la composición natural.

## 15. Sobrevuelos

Solo el sobrevuelo lunar de 12B. Nada multicuerpo.

## 16. Descenso

`BodyLanding{Vehicle,Dynamics,Simulation,Playback,Plan}.js` + `LandingPlanner.js`. Un único motor con parámetros del perfil: μ, R y ω opcional. Modelo de masa puntual, gravedad central `−μ r/|r|³`. Perturbaciones ausentes y declaradas: atmósfera, J2, terceros cuerpos, mareas, radiación solar, actitud. Contacto esférico `|r| = R`. Clasificación: suave (|v_z| ≤ 3 m/s y v_h ≤ 1,5 m/s), brusco (≤ 6 y ≤ 3), impacto; más COMBUSTIBLE AGOTADO, EMPUJE INSUFICIENTE, DESCENSO INCOMPLETO, NO VERIFICABLE. Los umbrales son del simulador.

## 17. Superficies

Solo la esfera de radio medio. Sin elipsoide (salvo la Tierra en 12E con WGS84), sin relieve, sin ángulo de pendiente. Coordenadas del contacto: latitud/longitud **en el marco local arbitrario**; las coordenadas fijas al cuerpo son «no disponibles» mientras no exista rotación/orientación.

## 18. Atmósferas

Tierra: US-1976 hasta 86 km, exponencial hasta 180 km y transición cúbica a 0 entre 180 y 200 km (12E.1). Resto: **pendiente**. La clasificación cualitativa decide si el modelo de vacío es defendible; Venus, Tierra, Marte, Titán y Tritón se bloquean con «Descenso atmosférico pendiente». Interfaces preparadas, no implementadas: arrastre (existe en 12E), entrada, calentamiento, paracaídas, propulsión terminal, contacto.

## 19. Reproducción

`createLandingExecution`, `sampleLandingExecution`, `deriveLandingTelemetry`: función pura del instante. Hermite para posición/velocidad (`sampleIntegratedState`), masa lineal entre nudos, empuje reevaluado. Retroceder o repetir no recalcula combustible. El Centro adapta cuerpo central, escala (`R_cuerpo → 0,6371 u`), color y oculta la Luna cuando `hideMoon`. Cámara «local» (también en lanzamiento): solo encuadre y escala del modelo; las posiciones científicas (km) no se tocan.

## 20. Telemetría

Mostrada: cuerpo, tiempo, posición/velocidad inerciales, radio y altitud, gravedad local (calculada con el GM del cuerpo), velocidad respecto a la superficie, vertical y horizontal, empuje, acelerador, aceleración, empuje/peso, masa, propelente, Δv, fase, eventos y resultado. «Distancia al punto objetivo»: «No definido» (no hay objetivo). Nada de sensores ni terreno.

## 21. Integración de módulos

```
Catálogos → CelestialBodyMissionRegistry → perfil
Hangar (design) → payloadFromDesign ─┐
BodyLandingVehicle (lander) ─────────┼→ BodyLandingPlan → BodyLandingSimulation (DOPRI54, BodyLandingDynamics)
LandingPlanner (UI) ─────────────────┘            └→ BodyLandingPlayback → MissionControlCenter → MissionExecutionView
```

La invalidación se basa en `key = JSON(bodyId, lander, options)` y `designSignature(design)`.

## 22. Dependencias futuras (revisión de 12A–12E)

- **Hangar/Ingeniería (§20.1):** las piezas sirven como carga útil rígida y sonda orbital; no hay noción de módulo de aterrizaje, patas ni depósitos separados. No obliga a duplicar piezas: bastaría añadir tipos de componente.
- **Planificador (§20.2):** `MissionPhysics.js` fija Tierra y Luna (`EARTH_MU_KM3_S2`, `MOON_MU_KM3_S2`, `EARTH_RADIUS_KM`, `MOON_RADIUS_KM`) y exige cobertura de la efeméride lunar. Para Tierra–Marte, Júpiter–Europa, etc. hay que parametrizar cuerpo central/destino con el registro y separar transferencia heliocéntrica, planetocéntrica y local. No se hizo en 12F.
- **Empuje finito (§20.3):** `FiniteThrustDynamics.js` es genérico en la dinámica, pero `FiniteThrustPlan.js`/`Playback.js` importan constantes terrestres y lunares de `MissionPhysics.js`. La parte reutilizable (`propagateFiniteThrust`, direcciones, masa variable) no depende de la Tierra.
- **Lanzamientos (§20.4):** `LaunchEarth.js` (WGS84, rotación terrestre), `LaunchAtmosphere.js` (US-1976) y `LaunchSimulation.js` contienen Tierra. Generalizables a otros sólidos: el integrador, la geometría local, los eventos, la clasificación y el playback. Exigen perfil con elipsoide y rotación, y un modelo atmosférico por cuerpo (Marte, Venus, Titán); la Luna sería vacío.
- **Centro de Misión (§20.5):** dependía de Tierra/Luna en la vista (esfera azul, Luna, escala fija). 12F lo desacopla con `transfer.{bodyRadiusKm, sceneScale, centralBody, hideMoon}`. La telemetría de `transfer`/`finite-thrust` sigue siendo Tierra–Luna.
- **Efemérides y tiempo (§20.6):** faltan UTC↔TDB, orientación/rotación de cuerpos (IAU), efemérides de cobertura amplia, cambio de esfera de influencia y perturbaciones de terceros cuerpos para enlazar un lanzamiento terrestre con una transferencia y una llegada local.

## 23. Limitaciones actuales

Un cuerpo y masa puntual; sin atmósfera fuera de la Tierra; sin rotación de ningún cuerpo; sin perturbaciones; sin actitud ni modelo de patas; sin punto objetivo ni terreno; guiado heurístico con motor estrangulable y reencendido ilimitado; escena local no ubicada en el Sistema Solar; GM de satélites pendiente de verificación independiente; tolerancia de contacto 1e-9 km y 1e-7 s.
