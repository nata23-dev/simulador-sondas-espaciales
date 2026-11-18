# Etapa 12B — Planificador de misiones y maniobras orbitales

> **Reconciliación numérica 12B.1:** los valores de 4,324941 días (200 km) y 6,104695 días (100 000 km) pertenecen a configuraciones distintas. La energía lunar +0,288665 km²/s² del sobrevuelo es de la llegada nominal, mientras +0,288160 km²/s² corresponde al paso mínimo muestreado. Véase [STAGE12B1_NUMERICAL_RECONCILIATION.md](STAGE12B1_NUMERICAL_RECONCILIATION.md).

## Arquitectura

El apartado Experimental conserva el Hangar y la ingeniería de la Etapa 12A/12A.1. La navegación nueva ofrece **Hangar**, **Ingeniería**, **Planificador** y un **Centro de misión** deshabilitado y reservado. La simulación orbital DOPRI54 anterior sigue accesible con «Ver simulación orbital».

| Responsabilidad | Archivo |
| --- | --- |
| Transferencia lunar, efemérides, integración y apuntado | `src/lab/MissionPhysics.js` |
| Masa, combustible, potencia y estados de viabilidad | `src/lab/MissionEngineering.js` |
| Formato versionado, validación y persistencia de planes | `src/lab/MissionPlanStore.js` |
| Vista Three.js de la trayectoria y la Luna | `src/lab/MissionTrajectoryView.js` |
| Controles, fases, resultados e importación/exportación | `src/ui/MissionPlanner.js` |
| Integración con Hangar y navegación responsive | `src/ui/ExperimentalLaboratory.js`, `src/ui/experimental-laboratory.css` |
| Pruebas de la etapa | `tests/MissionPlanner.test.mjs` |

La edición del diseño en Hangar invalida el resultado de misión por identificador y firma de componentes, incluido el combustible de cada depósito. Cambiar fecha, altitud, destino u objetivo también lo invalida. El cálculo se realiza de nuevo a demanda. No se modifica el motor científico ni se consumen realmente los depósitos del diseño.

## Datos, marcos y constantes

- Efeméride lunar local: `public/data/moons-2026-10.json`, obtenida de [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/). Target 301 (Luna), center 500@399 (Tierra), ejes **ICRF eclípticos J2000**, calendario **TDB**, vectores geométricos sin corrección de luz, km y km/s. Los registros horarios cubren **2026-10-01 00:00 a 2026-11-01 00:00 TDB** (JD 2461314.5–2461345.5). La interpolación Hermite existente solo se usa dentro de esos límites. La salida, llegada y, para sobrevuelo, el día posterior deben estar cubiertos. No se extrapola.
- La sonda se representa directamente en coordenadas **geocéntricas** con los mismos ejes. No se restan posiciones heliocéntricas ni se mezclan cadenas de referencia. La conversión de esos ejes a los del visor Three.js es únicamente visual: `(x, y, z) → (x, z, −y)`.
- μ terrestre = **398 600,435507 km³/s²**, μ lunar = **4 902,800118 km³/s²** del catálogo DE440 existente y de [JPL Astrodynamic Parameters](https://ssd.jpl.nasa.gov/astro_par.html). Radio terrestre de referencia = **6 371,0084 km**; radio lunar = **1 737,4 km**, [JPL Satellite Physical Parameters](https://ssd.jpl.nasa.gov/sats/phys_par/). La efeméride local de Horizons indica DE441, mientras el catálogo de μ indica DE440; esta diferencia de versiones se conserva identificada. No se alteraron los datos originales.
- `src/science/Time.js` convierte etiquetas gregorianas **en la misma escala TDB** a JD. El control `datetime-local` se etiqueta expresamente como TDB y no usa `Date` ni realiza conversiones implícitas desde UTC o husos horarios.

## Modelo de trayectoria

La salida es desde una **órbita terrestre circular ya establecida**, con altitud seleccionable de 200 a 150 000 km. El coste de lanzamiento y de adquisición de esa órbita **no está incluido**. La fase y el plano orbital inicial son variables de diseño elegidas para permitir el encuentro; no se afirma conocer la fase de una sonda existente.

1. Una elipse terrestre con perigeo en la órbita inicial y apogeo cerca de la Luna futura sirve como **semilla**, no como trayectoria final. Su semieje es `a = (r_p + r_a)/2` y su tiempo semiperiódico `t = π√(a³/μ_Tierra)`. Se itera la posición lunar de llegada hasta que el tiempo sea consistente. El usuario elige una separación nominal del centro lunar entre 30 000 y 100 000 km para aproximación, o entre 5 000 y 25 000 km para el punto de llegada del sobrevuelo. Los valores iniciales son respectivamente 50 000 y 20 000 km. Son **condiciones de diseño**, no radios físicos de la Luna.
2. A partir de la semilla, una corrección numérica de tiro ajusta las tres componentes de la velocidad inicial. Cada evaluación integra con el DOPRI54 existente la ecuación geocéntrica restringida

   `r̈ = −μ_T r/|r|³ − μ_L (r−r_L)/|r−r_L|³ − μ_L r_L/|r_L|³`.

   El último término es la aceleración indirecta por el movimiento del origen terrestre. `r_L(t)` procede de la efeméride local a cada instante. Un Jacobiano por diferencias finitas y búsqueda de longitud de paso reducen el error de llegada; se exige un residuo inferior a 2 km. Una solución que cruza la superficie terrestre o lunar, no converge o sale de cobertura se rechaza.
3. En sobrevuelo, se propaga **un día adicional** con pasos máximos de 300 s, se registra la mínima separación muestreada y se exige que quede entre el radio lunar y 25 000 km y que la sonda se aleje de nuevo. La distancia mínima muestreada no es una solución analítica exacta de periapsis. No se calcula inserción lunar.
4. La línea sólida del visor usa los estados integrados de la sonda. La línea discontinua representa la trayectoria lunar interpolada; la esfera lunar muestra su posición en la llegada. Se visualizan el punto de salida, llegada y, si corresponde, paso mínimo. El visor permite órbita de cámara, zoom, enfoque en Tierra/Luna y selección de fases; en tacto se activa de forma explícita para permitir scroll normal.

El modelo es una **aproximación restringida Tierra–Luna**: omite Sol, otros planetas, presión de radiación, errores de navegación, eclipses y ejecución de empuje finito. La transferencia no se presenta como éxito de misión completa. Marte, Venus, Europa y Titán figuran en el catálogo como **pendientes**, sin trayectoria ni estado de viabilidad inventados.

## Presupuesto de maniobras y viabilidad

La inyección terrestre ideal usa el vector de diferencia entre velocidad circular inicial y velocidad de transferencia corregida. **Δv no se confunde con la velocidad orbital**. La masa inicial se toma del diseño del Hangar; los motores y depósitos deben compartir propelente. Se usa

`m_después = m_antes exp(−Δv/(Isp·g₀))`, con `g₀ = 9,80665 m/s²`.

`consumeManeuvers` aplica esta ecuación de forma secuencial, calcula combustible, masa y tiempo de encendido para cada maniobra y bloquea las posteriores si una falla. Nunca deja combustible negativo ni masa inferior a la seca. En esta etapa la misión lunar presupone **una inyección**; las maniobras de corrección, captura y aterrizaje están excluidas y se muestran como «No incluido».

El veredicto **VIABLE SEGÚN EL MODELO** exige combustible y compatibilidad, potencia nominal durante el encendido y crucero, encendido ideal inferior al 10 % del período de la órbita inicial, cobertura temporal, solución de apuntado y, en sobrevuelo, paso seguro muestreado. El umbral del 10 % es una regla conservadora de admisibilidad de la aproximación impulsiva, no una ley física universal. **INSUFICIENTE** indica déficit o incompatibilidad de recursos. **NO VERIFICABLE** indica que el modelo de maniobra no basta, en particular con propulsión iónica de bajo empuje. La potencia solar es nominal a 1 AU con iluminación directa; eclipses y orientación no están modelados. Incluso un veredicto viable certifica solo este presupuesto y la geometría del modelo, no éxito operativo.

Las masas, motores, paneles y baterías del catálogo 12A siguen siendo **parámetros ficticios ilustrativos**; no se alteraron para esta etapa. Por ejemplo, con los datos locales de 2026-10-15 12:00 TDB y la sonda interplanetaria predefinida, la salida desde 200 km requiere aproximadamente 3 123 m/s y 360 kg de propelente, frente a 190 kg disponibles: **INSUFICIENTE**. Una aproximación desde 100 000 km o un sobrevuelo desde 60 000 km puede satisfacer el presupuesto **según el modelo**; esa órbita inicial alta ya debe existir y su coste de adquisición queda excluido.

## Planes locales

Formato `simulador-sondas-mission-plan`, versión 1, clave independiente `probe-laboratory-mission-plans-v1`. Cada plan guarda nombre, parámetros, identificador y firma de la sonda, copia validada del diseño y versión del modelo. Recuperación e importación **no restauran automáticamente la sonda**: el usuario puede restaurarla mediante un control visible. El resultado numérico no se serializa como verdad permanente; siempre exige recalcular. Se rechazan JSON mal formados, asociaciones falsificadas, diseños incompatibles, destinos sin modelo y parámetros fuera de rango. Un plan con versión científica anterior puede recuperarse, pero queda marcado para revisión y recálculo. La persistencia de diseños de 12A no se sobrescribe.

## Verificación local y pendientes

- `node --test tests/MissionPlanner.test.mjs tests/ProbeLaboratoryCorrections.test.mjs tests/OrbitalDynamicsEngine.test.mjs tests/PlanetaryMoons.test.mjs tests/ScienceTime.test.mjs`: **31 pruebas aprobadas**. Cubren combustible secuencial, conservación de masa, fechas y estados iniciales, encuentro numérico, condiciones de llegada, sobrevuelo, propulsión iónica, energía, incompatibilidad, invalidación, persistencia, DOPRI54, Luna y TDB.
- `npm.cmd run build`: compilación correcta. Persiste el aviso preexistente de tamaño del paquete de Vite.
- `git diff --check`: sin errores de espacios.

Pendiente para una etapa posterior: adquisición de órbita inicial, correcciones de trayectoria con empuje finito, inserción lunar, eclipses y potencia dependiente de orientación, incertidumbre de efemérides, otros destinos y Centro de misión. Una geometría lunar para ciertas fechas/altitudes puede fallar al apuntar o interceptar la superficie; se informa como cálculo no disponible. Gemini hará la comprobación funcional y visual integral por separado; aquí no se generaron capturas ni auditoría de navegador.
