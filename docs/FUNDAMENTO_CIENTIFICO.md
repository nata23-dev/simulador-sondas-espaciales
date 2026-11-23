# Fundamento científico, modelos y límites

Este documento resume las convenciones físicas, las fuentes de datos reales, los métodos numéricos y los límites declarados del **Simulador de Sondas Espaciales**.

## 1. Unidades, marcos de referencia y escalas de tiempo

- **Unidades físicas internas:** distancias en kilómetros (`km`), velocidades en `km/s`, tiempos en segundos (`s`) y fechas julianas (`JD TDB`), masas en `kg` y fuerzas en newtons (`N`). La conversión `AU ↔ km` usa el valor exacto de la IAU (`149 597 870,7 km`) y la velocidad de la luz `c = 299 792,458 km/s` (`src/science/Units.js`).
- **Marco de referencia:** `ICRF eclíptico J2000` (`src/science/Frames.js`). Al pasar al espacio 3D de Three.js se aplica la permutación de mano derecha `(x, y, z) → (x, z, −y)` y la escala posicional fija de `32 unidades de escena por AU` (`src/graphics/SpatialScale.js`).
- **Escalas de tiempo (`src/science/HistoricalTime.js`, `src/science/AstrodynamicsTime.js`):** nunca se confunden `UTC` y `TDB`. Las conversiones aplican la cadena completa `UTC ↔ TAI ↔ TT ↔ TDB` utilizando la tabla oficial de segundos intercalares del **IERS** (validando instantes reales `:60` y rechazando fechas `:60` inexistentes).

## 2. Datos astronómicos reales e integridad

Todos los conjuntos de datos de efemérides se obtuvieron de **NASA/JPL Horizons** y se sirven localmente desde `public/data/`:

| Conjunto | Cobertura | Paso / uso | Verificación |
| --- | --- | --- | --- |
| Planetas del Sistema Solar (`efemerides-2026.json`) | `2026-10-01` → `2026-11-01` TDB | Diario · modo Sistema Solar | `tests/ScienceHorizons*.test.mjs` |
| Diez satélites principales (`moons-2026-10.json`, `moons-stage6-2026-10.json`) | `2026-10-01` → `2026-11-01` TDB | Horario · planetocéntrico | Hashes SHA-256 en `evidence/stage4/` y `evidence/stage6/` |
| Catálogo histórico Voyager 1 y 2 (`historical-ephemerides-catalog-v1.json`) | `1977-08-20` → `2026-11-02` | Crucero + 6 encuentros locales + contextos lunares | `npm run audit:voyager` (49 conjuntos y 10 SPK) |
| Efemérides interplanetarias (`interplanetary-ephemerides-catalog-v1.json`) | `2026-11-18` → `2046-01-01` TDB | Planificación del Laboratorio (sin extrapolar) | `tests/InterplanetaryPlanning.test.mjs` |
| Satélites galileanos (`galilean-moons-jsb-2031-2032.json`) | Ventana Júpiter–Europa 2031–2032 | Encuentros integrados y escena 3D | `tests/IntegratedMissions.test.mjs` |

- **Interpolación:** polinomios cúbicos de **Hermite ($C^1$)** que usan posición y velocidad en ambos extremos de cada intervalo (`src/science/HermiteInterpolation.js`).
- **Regla estricta sin extrapolación:** cualquier consulta fuera de cobertura o a través de un corte de kernel SPK devuelve estado no disponible en lugar de extrapolar.

## 3. Modelos físicos e integradores numéricos

- **Integrador adaptativo DOPRI54 (`src/science/NumericalIntegrator.js`):** Runge-Kutta embebido Dormand-Prince de orden 5(4) con control adaptativo de paso y tolerancias absolutas/relativas explícitas por problema.
- **Problema de Lambert (`src/science/LambertSolver.js`):** formulación en variables universales para transferencias heliocéntricas de cero revoluciones (trayectorias progradas y retrógradas), validado contra propagación RK4 independiente.
- **Misiones interplanetarias por cónicas parcheadas (`src/lab/IntegratedMission.js`):**
  1. Salida desde órbita terrestre baja o, opcionalmente, desde plataforma **LC-41** (`src/lab/EarthDeparture.js`) usando empalme por la asíntota hiperbólica y corrección de gravedad terrestre fuera de la SOI.
  2. Crucero heliocéntrico de Lambert entre efemérides reales NASA/JPL, acompañado **solo como comparación** por un propagador de **n cuerpos** (`src/lab/NBodyCruise.js`) con los ocho planetas como masas puntuales y maniobra correctiva TCM.
  3. Llegada planetaria con puntería en el **plano B** (`src/lab/EncounterDesign.js`) y captura orbital con empuje finito integrado con DOPRI54 (`src/lab/OrbitalInsertion.js`), siguiendo la ecuación de masa de Tsiolkovsky.
- **Constantes gravitacionales (`src/science/GravitationalParameters.js`):** parámetros $\mu = GM$ del Sol, ocho planetas y la Luna procedentes de **JPL DE440**, y de los satélites galileanos/exteriores procedentes de **NASA/JPL SSD** (`g₀ = 9,80665 m/s²` según NIST SP 811).
- **Lanzamiento terrestre (`src/lab/LaunchAtmosphere.js`, `LaunchDynamics.js`):** atmósfera estándar US-1976 por capas con transición suave entre `180` y `200 km` (densidad y primera derivada continuas, nula desde `200 km`).

## 4. Reconciliación numérica del planificador Tierra–Luna

Como referencia verificada por pruebas automatizadas (`tests/MissionNumericalReconciliation.test.mjs`), los escenarios de control con la sonda predefinida *Exploración interplanetaria* y salida `2026-10-15 12:00:00.000 TDB` (`JD 2461329.0`) producen:

| Caso | Objetivo y altitud | Δv inyección | Llegada nominal TDB | Duración al encuentro | Resultado del modelo |
| --- | --- | ---: | --- | ---: | --- |
| **CASO-A** | Aproximación, 200 km | 3 123,100 m/s | `2026-10-19 19:47:54.888 TDB` | `373 674,888 s` (`4,324941 días`) | Insuficiente propelente (190 kg vs ≈360 kg) |
| **CASO-B** | Aproximación, 100 000 km | 435,194 m/s | `2026-10-21 14:30:45.609 TDB` | `527 445,609 s` (`6,104695 días`) | Viable según el modelo para la inyección |
| **CASO-F** | Sobrevuelo, 200 km (llegada a 20 000 km) | 3 133,328 m/s | `2026-10-20 08:17:00.772 TDB` | `418 620,771 s` (`4,845148 días`) | Mínimo muestreado `19 175,984 km` |

En **CASO-F**, la energía osculante lunar de dos cuerpos $\varepsilon_L = \frac{1}{2}|\mathbf{v}_{\text{sonda}} - \mathbf{v}_{\text{Luna}}|^2 - \mu_L / r$ evaluada en estados de una sola época vale **`+0,288665` km²/s²** en la llegada nominal (`2026-10-20 08:17:00.772 TDB`) y **`+0,288160` km²/s²** en la distancia mínima muestreada (`2026-10-20 10:02:00.771 TDB`). La pequeña variación proviene de la dinámica de tres cuerpos Tierra–Luna y no constituye una anomalía de conservación.

## 5. Tolerancias de contacto en descenso multicuerpo

El motor de descenso propulsado en cuerpos sin atmósfera (`src/lab/BodyLandingDynamics.js`, conservado como motor científico y probado en `tests/MultibodyLanding.test.mjs` y `tests/Stage12F1Corrections.test.mjs`) separa explícitamente cuatro magnitudes:

| Magnitud | Valor | Qué controla |
| --- | --- | --- |
| **Predicado geométrico** | `\|r\| < R − 1e-9 km` (`CONTACT_PREDICATE_KM`) | Confirma el signo geométrico bajo el radio superficial `R`. |
| **Intervalo temporal** | Bisección hasta `Δt ≤ 1e-7 s` (`CONTACT_BRACKET_SECONDS`) | Acota temporalmente el instante exacto de contacto. |
| **Cota espacial de localización** | `≲ \|v_r\| · Δt` | Error radial máximo derivado de la velocidad vertical al contacto. |
| **Error de integración** | DOPRI54 abs. `1e-7 km`, rel. `1e-10` | Precisión de la trayectoria integrada, validada contra caída radial analítica de Kepler. |

## 6. Límites científicos declarados

1. **Sin asistencias gravitatorias ni N-cuerpos continuo global:** las misiones del Laboratorio usan cónicas parcheadas (masa puntual dentro de cada SOI, sin armónicos `J2`, presión de radiación solar ni perturbaciones de actitud). El crucero N-cuerpos se calcula en paralelo únicamente como herramienta comparativa.
2. **Cortes SPK en Voyager 1 y 2:** los cambios de kernel SPK en 1981 (Voyager 1) y 1989 (Voyager 2) introducen discontinuidades medidas y se cortan explícitamente en la visualización; la trayectoria global no se presenta como continua certificada.
3. **Orientación y fotografía:** las vistas en primera persona desde Voyager y el comparador A/B usan apuntado geométrico sin kernels `CK/IK` ni fotometría física de cámaras `ISS`.
4. **Lanzamiento 3D de Voyager:** el ascenso desde el Complejo LC-41 (`src/science/VoyagerLaunchProfile.js`) es una reconstrucción ilustrativa calibrada con hitos documentados del vehículo Titan IIIE-Centaur y no una telemetría real segundo a segundo.
5. **Sin descenso atmosférico:** los cuerpos con atmósfera densa (Venus, Tierra, Marte, Titán) y gigantes gaseosos bloquean el motor de descenso en vacío.
6. **Alcance académico:** ninguna salida «viable según el modelo» constituye certificación operativa para navegación espacial real.
