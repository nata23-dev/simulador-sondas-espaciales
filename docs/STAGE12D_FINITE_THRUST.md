# Etapa 12D — Propulsión de empuje finito y maniobras dinámicas

**Estado:** implementada y probada localmente (17-11-2026, rama `revision/modo-historico-voyager`, sin commit). **Auditoría independiente de Gemini: pendiente.** Este documento describe lo implementado y sus límites; no declara el modelo físicamente validado en sentido operativo. Véanse [12B](STAGE12B_MISSION_PLANNER.md), [12B.1](STAGE12B1_NUMERICAL_RECONCILIATION.md) y [12C](STAGE12C_MISSION_CONTROL.md).

**Estado documental de 12C verificado antes de implementar:** `STAGE12C_INDEPENDENT_AUDIT.md` existe localmente sin seguimiento Git, firmado por un «Agente Independiente de Auditoría (DeepMind Advanced Agentic AAC)» y con dictamen «APROBADO». El criterio del proyecto (CLAUDE.md, contexto y hoja de ruta) exige la aprobación independiente de Gemini y la mantiene **pendiente**; no se comprobó su independencia ni se aceptó. Además, su afirmación de «totalmente operativo» a 320×568 contrasta con la captura `evidence/stage12c/13e_mobile_320x568.png`, donde la barra de cámaras y las pestañas aparecen recortadas y el título se solapa. 12D no depende de esa aprobación ni la presupone.

## 1. Objetivo

Añadir una modalidad **B, «Maniobra de empuje finito»**, que integra aceleración propulsiva, consumo continuo de masa y gravedad, y permite reproducirla en el Centro de Misión. Coexiste con la modalidad **A** (planificación impulsiva de 12B, sin cambios). Prioridad: la corrección física; no hay cambios estéticos.

## 2. Arquitectura

| Módulo | Responsabilidad |
| --- | --- |
| `src/lab/FiniteThrustDynamics.js` | Física pura: conversiones, direcciones, validación del programa, propagador segmentado con DOPRI54. Sin DOM, Three.js ni Hangar. |
| `src/lab/FiniteThrustPlan.js` | Ingeniería: lee el diseño del Hangar, bloquea por motor/propelente/potencia, estado inicial, modelo Tierra–Luna, comparaciones, vigencia del resultado. |
| `src/lab/FiniteThrustPlayback.js` | Ejecución y telemetría reproducibles (funciones puras del instante). |
| `src/ui/FiniteThrustPlanner.js` | Controles mínimos y resultados en el Planificador. |
| Cambios mínimos | `MissionPhysics.js` (se exporta `restrictedDerivative`, sin alterar su lógica), `MissionPlayback.js` (se exporta `sampleIntegratedState`), `MissionPlanner.js`, `MissionControlCenter.js`, `experimental-laboratory.css` (bloque `.ft-*` al final). |

No se duplicó el integrador: se reutiliza `integrateDopri54` con un vector de estado de 8 componentes. `MissionEngineering.js`, `ProbeEngineering.js`, `ComponentCatalog.js`, `MissionPlanStore.js`, `ProbeDesign.js` y los datos no se modificaron.

## 3. Ecuaciones

Estado `[x, y, z, vx, vy, vz, m, Δv_acum]`:

```
dr/dt = v
dv/dt = a_gravedad + (θ·F/m)·û / 1000      [km/s²]
dm/dt = −θ·F/(Isp·g0)
dΔv/dt = θ·F/(m·1000)                       [km/s]   (control independiente de Tsiolkovsky)
```

θ es el acelerador (0 < θ ≤ 1), constante dentro de cada encendido; `û` la dirección unitaria. `a_gravedad` procede del modelo restringido de 12B (Tierra + Luna con término indirecto y efeméride lunar local). Tsiolkovsky: `Δv = Isp·g0·ln(m0/m1)`.

## 4. Unidades

Propagación en km, km/s, s y kg; el empuje en N y la masa en kg. `accelerationKmS2(F, m) = F/m/1000` (N/kg = m/s²; ÷1000 → km/s²) y `kmS2ToMS2` se prueban explícitamente. `g0 = 9,80665 m/s²` (NIST SP 811, B.9), idéntico a `STANDARD_GRAVITY_M_S2` de la ingeniería 12A (comparado en pruebas). Tiempo de misión en segundos desde la salida (TDB); la entrada del usuario es horas (inicio), minutos (duración) y días (horizonte).

## 5. Referencias físicas

Ecuación del cohete de Tsiolkovsky; definición de Isp en segundos con g0 convencional; solución analítica de empuje constante en espacio libre (v = ve·ln(m0/m), x = ve·[t − (m/ṁ)·ln(m0/m)]); órbita kepleriana de dos cuerpos para el caso sin empuje. Constantes gravitacionales y radios: `GravitationalParameters.js` vía `MissionPhysics.js`.

## 6. Motores

Se usan los componentes reales del catálogo, identificados como **especificaciones ilustrativas** (`provenance: «Diseño ficticio ilustrativo»`). No se inventó ninguna característica.

| Motor | Empuje | Isp | Propelente | Potencia activa | Papel |
| --- | --- | --- | --- | --- | --- |
| `engine-chemical` | 650 N | 310 s | químico | 80 W | Encendidos cortos, alto consumo, Δv de cientos de m/s. |
| `engine-ion` | 0,04 N | 2500 s | xenón | 900 W | Encendidos de horas–días, aceleración ~10⁻⁴ m/s² creciente con la pérdida de masa. |

Cada diseño del Hangar tiene un único alojamiento de motor y de tanque; se admite un motor. Un motor y un tanque de propelentes distintos se rechazan.

**Potencia:** el encendido se **bloquea** si `generación nominal < consumo en reposo + potencia activa del motor`. No existe modelo de reducción de potencia ni se usa la batería para habilitar el encendido (la autonomía de batería no está modelada). El acelerador no reduce la potencia exigida (criterio conservador).

## 7. Dirección del empuje

Marco: geocéntrico inercial, ICRF eclíptico J2000 (el de `MissionPhysics.js`); `r` y `v` respecto al centro de la Tierra.

| Opción | Vector |
| --- | --- |
| Progrado / retrógrado | ±v̂ |
| Radial exterior / interior | ±r̂ (desde el centro de la Tierra; no ortogonal a v̂ en órbitas elípticas) |
| Normal / antinormal | ±ĥ, h = r × v |
| Inercial fija | Vector unitario constante en ICRF, normalizado a partir del dato del usuario |

Las seis direcciones orbitales se reevalúan en cada evaluación de la derivada (cambian durante el encendido); la inercial no. Casos degenerados que se rechazan con error controlado: radio < 10⁻⁶ km, velocidad < 10⁻¹² km/s, `|r×v|/(|r||v|) < 10⁻⁹` (normal no definida) y vector inercial nulo. La orientación gráfica de la nave no interviene: no hay dinámica de actitud.

## 8. Consumo de combustible

`ṁ = θ·F/(Isp·g0)` constante en cada encendido, de modo que el instante de agotamiento es **analítico**: `t_ag = (m − m_seca)/ṁ`. El encendido se trunca exactamente en `t_ag` (precisión de punto flotante; la masa integrada coincide con la analítica a ~10⁻¹³ kg, y se verifica |m − m_seca| ≤ 10⁻⁶ kg antes de fijar `m = m_seca`). Después se continúa de forma balística. Los encendidos posteriores con menos de 1 ms de propelente se **omiten** (evento `skipped`, sin consumo). La masa nunca cae por debajo de la masa seca ni es negativa; masa o combustible no finitos se rechazan.

## 9. Integración DOPRI54

`integrateDopri54` con paso adaptable, `relTol = 1e-11` y `absTol = [1e-5 km ×3, 1e-8 km/s ×3, 1e-9 kg, 1e-12 km/s]`. Pasos máximos: 3600 s en tramos balísticos y 600 s en encendidos. Reutilizar el integrador existente conserva su control de error y sus pruebas.

## 10. Manejo de eventos

La línea de tiempo se divide en **segmentos** (balístico / encendido) cuyas fronteras son instantes exactos (inicio y fin de cada encendido y el agotamiento); cada segmento se integra por separado y su estado final es el inicial del siguiente. Ningún paso numérico cruza una frontera de empuje; las fronteras son nudos de la solución. Eventos emitidos: `burn-start`, `burn-end`, `depletion`, `skipped`. Un encendido que termina exactamente al agotarse el propelente se registra como `depletion`.

## 11. Integración con el Hangar

`getPropulsionSystem(design)` lee, sin modificarlo, masa seca/húmeda, combustible por tanque, motor, compatibilidad de propelente y potencia mediante `calculateEngineering`. El resultado guarda la firma del diseño (`designSignature`) y las opciones canónicas; `isFiniteThrustResultCurrent` y `createFiniteThrustExecution` rechazan un resultado cuyo diseño u opciones cambiaron («obsoleto … Recalcula»). La interfaz invalida el resultado al cambiar el diseño o cualquier campo. **No se modificó el formato de diseños guardados ni se añadió migración**; los resultados de empuje finito no se persisten.

## 12. Integración con el Planificador

Sección plegable «Maniobra de empuje finito» (panel izquierdo) y resultados (panel derecho), sin tocar la planificación impulsiva. Estado inicial: órbita circular directa de altitud `h` en el plano orbital instantáneo de la Luna a la época de salida, con fase `φ` medida desde la dirección lunar (órbita ya adquirida; no hay lanzamiento). Opciones: altitud 200–150 000 km, salida TDB dentro de la cobertura lunar, fase, horizonte (60 s–30 d) y hasta 8 encendidos (inicio ≥ 0, duración ≥ 1 s, acelerador, dirección). Se validan solapes (un solo motor: se **rechazan** encendidos simultáneos), horizonte, cobertura (`hasLunarCoverage`) y parámetros.

Comparación mostrada: **Δv impulsivo presupuestado** (Tsiolkovsky de lo programado con masas secuenciales), **Δv propulsivo acumulado** (integrado numéricamente), **cambio de velocidad observado** frente a la trayectoria sin empuje al final del último encendido, duración de encendido, combustible, masa final, distancia final a la Luna, diferencia de posición respecto a la trayectoria balística y respecto a una **referencia impulsiva** (mismo Δv aplicado instantáneamente al inicio de cada encendido, mismo modelo gravitacional). La referencia impulsiva **no es físicamente equivalente**; solo cuantifica la aproximación. El Δv presupuestado y el acumulado coinciden por construcción (Tsiolkovsky); su concordancia es una comprobación de consistencia, no de misión. La propagación **no afirma alcanzar la Luna**: se muestra la distancia lunar final.

## 13. Integración con el Centro de Misión

«Reproducir en el Centro de Misión» crea una ejecución de tipo `finite-thrust` compatible con la vista 3D existente (sin cambios gráficos). Telemetría por instante: estado orbital, motor ENCENDIDO/APAGADO e id del encendido, empuje, acelerador, aceleración propulsiva (m/s²), masa instantánea, combustible restante y consumido, Δv propulsivo acumulado, estado del vehículo, consumo y balance nominal de potencia (la carga de batería sigue «No disponible»). Eventos de inicio/fin de encendido y agotamiento aparecen en la lista de fases. La reproducción es una **función pura del instante**: Hermite para posición/velocidad, masa lineal por tramo (exacta con ṁ constante), Δv por Tsiolkovsky desde la masa. Avanzar, retroceder o repetir no consume combustible adicional. No se añadió llama ni efecto de propulsión. Los resultados y la ejecución impulsivos de 12C no cambian; el Planificador evita que una notificación impulsiva sustituya una ejecución de empuje finito activa.

## 14. Casos numéricos (`tests/FiniteThrust.test.mjs`)

| Caso | Comprobación y tolerancia |
| --- | --- |
| A | Sin empuje: estado final = `calculateLunarTransfer` (Δr < 1 m, Δv < 10⁻⁵ m/s); masa exactamente constante. Kepler circular: regreso tras un período (Δr < 0,1 m). |
| B | Empuje constante sin gravedad: masa 10⁻⁹ kg, velocidad 10⁻⁶ m/s, posición 1 mm frente a la solución analítica. |
| C | Tsiolkovsky con 3 motores/duraciones: Δv integrado frente a `Isp·g0·ln(m0/mf)` (≤ 10⁻⁷ relativo). |
| D | Motor químico: consumo `ṁ·t` (10⁻⁹ kg), aceleración 650/561 m/s² en el instante inicial. |
| E | Motor iónico: 3 d de encendido; a(t_fin)/a(0) = m0/m(t_fin) (10⁻⁹); la trayectoria difiere de la balística. |
| F | Agotamiento: instante analítico a 10⁻⁹ s, `m = m_seca` exacta, velocidad constante después; en el Hangar los encendidos posteriores se omiten sin consumo. |
| G | Potencia insuficiente: bloqueo con mensaje; la batería existente no habilita el encendido. |
| H | Tres encendidos secuenciales: `masaAntes[n+1] = masaDespués[n]` exacta; nudos en fronteras; continuidad de posición/velocidad. |
| I | Reloj adelante/atrás/repetido: muestras idénticas (`deepEqual`); consumo función del instante; masa monótona. |
| J | Cobertura: salida/horizonte fuera de cobertura, encendido fuera de horizonte, horizonte > 30 d, sin encendidos y solapes se rechazan. |
| Convergencia | Pasos máximos 600/3600 s frente a 20/600 s: Δr < 0,5 m, Δv < 10⁻⁵ m/s, masa 10⁻⁹ kg. Hermite entre nudos frente a malla de 10 s: Δr < 50 m. |
| Otros | Conversiones, g0 = constante de 12A, direcciones y degenerados, validaciones de masa/parámetros, firma/obsolescencia del diseño sin mutarlo, telemetría. |

Las tolerancias son límites de aserción elegidos por encima del error observado y justificados por `relTol/absTol`; no se ajustaron resultados a una referencia.

## 15. Pruebas realizadas (17-11-2026)

- `node --test tests/*.test.mjs`: **164 aprobadas, 0 fallos** (142 previas + 22 nuevas).
- `node scripts/audit-voyager-stage8.mjs`: 49 conjuntos de producción y 10 hashes SPK verificados; **reescribió `evidence/voyager-stage8/audit.json`**, que ya figuraba modificado en Git al iniciar la sesión.
- `npm run build`: correcto (solo el aviso previo de tamaño de chunk).
- `git diff --check`: sin errores.
- Comprobación mínima en Chrome headless (no es auditoría): Planificador → calcular → reproducir; telemetría con motor ENCENDIDO/APAGADO, masa y Δv; mismo estado al volver al mismo instante; invalidación al editar parámetros; rechazo de solape; sin excepciones en consola. Solo escritorio 1600×1000, motor químico; no se probaron el iónico, móvil ni cámaras en el navegador.

## 16. Limitaciones del modelo

- Órbita inicial circular directa, ya adquirida, en el plano lunar; sin lanzamiento ni separación de etapas.
- Gravedad restringida Tierra–Luna; sin Sol, presión de radiación, achatamiento terrestre ni errores de navegación.
- Dirección ideal e instantánea; sin actitud, control ni tiempos de orientación.
- Isp constante e independiente del acelerador; potencia nominal a 1 AU sin eclipses; batería no modelada temporalmente.
- Un motor por diseño; sin encendidos simultáneos; sin gimbal, ullage ni pérdidas de tobera.
- La eficiencia de la referencia impulsiva y las diferencias reportadas son comparaciones de este modelo, no certificación de misión. Los parámetros de piezas son ilustrativos.
- La ejecución de empuje finito no se guarda ni exporta; el horizonte máximo es 30 d (cobertura lunar local).
- La interfaz no se probó en móvil ni con el motor iónico en navegador; los controles reutilizan las clases del laboratorio.

## 17. Pendiente

Auditoría independiente de Gemini (ciencia, interacción y 320 px); decidir si se aceptan las tolerancias de la sección 14; persistencia/exportación de planes de empuje finito con migración validada; modelo de potencia por acelerador y eclipses; objetivos de encuentro/captura de bajo empuje; actitud; empuje con varios motores; actualizar los textos de `PROJECT_CONTEXT.md` y `DEVELOPMENT_ROADMAP.md` (recuentos de pruebas y estado) cuando se apruebe la etapa. Las etapas de lanzamiento, aterrizaje y minería no se iniciaron.
