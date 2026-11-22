# Etapa 21 · Lanzamiento → inyección

«La misión empieza en la plataforma». En «Misión completa» hay una opción nueva, **«Empezar en la plataforma»**. Con ella, el mismo cálculo encadena:

1. el despegue desde el LC-41 de Cabo Cañaveral (lanzamiento de 12E);
2. la órbita de aparcamiento;
3. la inyección de empuje finito con una etapa Centaur D-1T;
4. la hipérbola de escape hasta la frontera de la esfera de influencia (SOI) terrestre;
5. el crucero, la llegada y la captura de las etapas 13 y 20.

Sin la opción, la misión es la de la etapa 20: empieza ya lanzada, con la velocidad de salida aplicada en el centro de la Tierra. La opción viene **desmarcada** por defecto.

Estado: implementada, con pruebas locales y revisión en Chrome con la GPU real. Auditoría de Claude, que también la implementó: [STAGE21_AUDIT_CLAUDE.md](STAGE21_AUDIT_CLAUDE.md). **Pendientes:**
- revisión independiente, necesaria porque añade dinámica y un marco nuevo;
- revisión visual por una persona;
- prueba con un lector de pantalla real.

## Problema

Hasta la etapa 20, la salida era una condición inicial: el estado heliocéntrico de la Tierra más la v∞ del Lambert, con el aviso «inyección externa no modelada». El lanzamiento de 12E («Lanzamiento terrestre») y el empuje finito de 12B existían, pero como herramientas separadas que no llegaban a la misión. La hoja de ruta (§8 de [ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md](ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md)) pedía enlazarlas: órbita de aparcamiento e inyección de empuje finito hacia el destino.

## Modelo

| Tramo | Modelo | Código |
| --- | --- | --- |
| Ascenso | 12E sin cambios: atmósfera US-1976 corrotante, Tierra que gira, masa puntual y guiado por defecto. Lanzador **ilustrativo**: el demostrativo de 12E escalado ×9, con el mismo empuje/peso, Isp y Cd. Su capacidad, medida por bisección con acimut 90°, es ≈ 24,6 t. La carga es la sonda más la Centaur llena | `EarthDeparture.js`, `LaunchSimulation.js` |
| Orientación de la Tierra | El ascenso se calcula una vez con ángulo de rotación inicial 0. Después se gira alrededor del eje z al GMST del despegue (IAU 1982, el de la etapa 25). Luego pasa del ecuador medio de la fecha al J2000 (precesión IAU 1976 transpuesta) y del ecuador a la eclíptica J2000 | `science/EarthOrientation.js` |
| Órbita de aparcamiento | Kepler (dos cuerpos), con duración incógnita (≤ 3 h) | `KeplerPropagator.js` |
| Inyección | Empuje finito progrado, integrado con DOPRI54 (`propagateFiniteThrust` de 12B), con la Centaur D-1T: 30 000 lbf, Isp 444 s, 29 750 lb de propelente y 4 400 lb de masa seca. Son los datos del resumen de sistemas de 1973, los mismos de la etapa 25 | `FiniteThrustDynamics.js` |
| Escape | Hipérbola de Kepler hasta el radio de la SOI de Laplace, a·(μ⊕/μ☉)^0,4, con la órbita osculadora de la Tierra (≈ 923 910 km) | `EarthDeparture.js` |
| Empalme | En la salida de la SOI, la velocidad heliocéntrica (efemérides de la Tierra + velocidad geocéntrica) debe coincidir con la del Lambert desde **ese** punto y **ese** instante hasta la llegada apuntada | `IntegratedMission.js` |

**Apuntado.** Las incógnitas son x = (desfase del despegue, espera en la órbita de aparcamiento, duración de la inyección). Cada una controla un aspecto de la salida:
- el instante del despegue gira el plano de la órbita alrededor del eje terrestre (ascensión recta de la asíntota);
- la espera coloca la asíntota en el plano (declinación);
- la duración de la inyección fija el módulo (C3).

El método:
- **Newton amortiguado**, con jacobiano por diferencias finitas (pasos de 2 s, 1 s y 0,02 s).
- **Pasos limitados:** 1 h, 10 min y 20 s.
- **Valores iniciales:** dos, analíticos, uno por cada ventana del día en que el plano de la órbita contiene la asíntota. Se prueba antes la más cercana a la salida prevista.
- **Tolerancia:** 10⁻⁸ km/s (0,01 mm/s); se acepta hasta 10⁻⁷ km/s; como máximo 20 iteraciones.
- **Despegue sin efemérides:** si el despegue queda fuera de la cobertura de efemérides de la Tierra, se rechaza. No se extrapola.

**Acimut automático.**
- Se usa 90° (este) si la inclinación resultante supera la declinación de la asíntota en al menos 0,5°.
- Si no, se busca por bisección, en la rama noreste, el acimut que da una inclinación de |δ| + 1°.
- Si con acimutes menores el lanzador ya no llega a la órbita, el fallo lo dice («Es la inclinación máxima con esta carga…»).

**Vueltas con la llegada (etapa 20).** La salida de la SOI ocurre días después del despegue y en otro punto. Por eso la llegada (captura apuntada) se rediseña desde allí y se repite hasta que el periapsis apuntado cambia menos de 1 m (como máximo 4 vueltas). Cada vuelta parte de la solución anterior.

**Tiempo.** Con la opción marcada, t = 0 es el despegue:
- `departureJdTdb` es el instante del despegue;
- `plannedDepartureJdTdb` conserva la salida de la oportunidad;
- el despegue queda dentro de ± 12 h de esa salida.

**Masas y separaciones.** Las masas cambian solo en separaciones declaradas: etapa 1, etapa 2 y Centaur. En cada frontera de tramo, la masa es la del tramo siguiente. La continuidad de la cadena (posición, velocidad y masa en cada frontera, con los cambios de marco Tierra → Sol → planeta) se comprueba como desde la etapa 13.

**Versión del modelo.** `INTEGRATED_MISSION_VERSION` pasa a `21-integrated-mission-3` y `EARTH_DEPARTURE_VERSION` es `21-earth-departure-1`. Los planes guardados con la versión anterior se recalculan.

## Resultados

**A1 · Cassini → Marte** (escenario guiado, valores de la interfaz con la GPU):

| Magnitud | Valor |
| --- | --- |
| Despegue | 2028-11-29 · 13:00:03 UTC, 3,83 h antes de la salida prevista; GMST 263,951° |
| Acimut | 70,23°: con 90° la inclinación (29,38°) no supera en 0,5° la declinación de la asíntota (29,21°) |
| Lanzador (ilustrativo) | 946 t al despegue · empuje/peso 1,41 · Max-Q 37,5 kPa a 11 km |
| Órbita de aparcamiento | 169 × 575 km · i 30,21° · periodo 92 min · espera 44,2 min |
| Inyección | 384 s · Δv 3 553,7 m/s (impulsivo equivalente 3 520,2; pérdidas por gravedad 33,5) · 11 769 kg de propelente (quedan 1 725) |
| C3 | 8,117 km²/s² (8,993 desde el centro de la Tierra; ver Límites) |
| Salida de la SOI | 2028-12-02 · 19:40:15 UTC, 3,24 d tras la inyección, a 923 910 km |
| Empalme con el crucero | 0,0025 mm/s · 1 iteración · 2 vueltas con la llegada |
| Llegada y captura | Captura apuntada a 5 832,4 km (5 833,7 sin plataforma); órbita final 3 000 × 100 000 km, la pedida |
| Continuidad | Posición ≤ 3,9·10⁻⁴ km y velocidad ≤ 3,4·10⁻⁹ km/s en todas las fronteras; ningún salto de masa no declarado |
| Cálculo | 172 ms en Node; «Cálculo en 254–261 ms» en el navegador |

**Flota × escenarios** (20 combinaciones, barrido de la [auditoría](STAGE21_AUDIT_CLAUDE.md)). El **veredicto final es igual con y sin la plataforma** en los 20 casos:
- **Marte (A1, A2, A3):** las cuatro sondas salen desde la plataforma (C3 ≈ 8,12; acimut ≈ 70,2°).
- **Júpiter (C1, C2):**
  - Voyager y Dawn salen (C3 74,85; inyección de 408 s, quedan 975 kg en el caso de Voyager).
  - Con Cassini y Juno, la Centaur no tiene Δv suficiente: «sin Δv en la etapa de inyección», con el Δv necesario y el disponible.
  - En los cuatro casos la misión sigue siendo no viable, como sin la plataforma.

## Interfaz

- **Planificador · «Configuración básica»:** casilla «Empezar en la plataforma…» con su explicación (`#im-launch`, `#im-launch-hint`). Marcarla no cambia el escenario a «Personalizado», porque no altera el destino ni las fechas.
- **Resumen:**
  - «Despegue (TDB → UTC)», con el sitio;
  - el C3, con «inyección de empuje finito calculada»;
  - la masa de la nave, de la Centaur y al despegue;
  - si el lanzamiento no es viable, una fila con el motivo.
- **«Resultados técnicos → Salida desde la plataforma»** (`#im-launch-box`): sitio, despegue, acimut, lanzador, órbita de aparcamiento, inyección, C3, salida de la SOI y empalme. «Acimut», «Órbita de aparcamiento» y «Empalme con el crucero» tienen entrada nueva en el glosario.
- **Fases:** «Lanzamiento desde Cabo Cañaveral (12E)», «Órbita de aparcamiento», «Inyección interplanetaria (empuje finito, Centaur D-1T)» y «Salida de la esfera de influencia terrestre». El gráfico tiene un marco nuevo, «Tierra».
- **Totales de la sonda:** excluyen la Centaur. «Propelente consumido» es el de la nave, y la Centaur aparece en su propia fila de masas y en «Resultados» del Centro de Misión.
- **Centro de Misión:**
  - eventos de despegue, órbita, encendido y apagado de la inyección y salida de la SOI;
  - telemetría con el tanque de la Centaur;
  - en los tramos terrestres, «Altitud WGS84» geodésica y velocidad inercial, declaradas en el marco;
  - contexto local «Tierra», para cuando no se usa el Sistema Solar principal.
- **Sistema Solar principal (17.1):** reproduce también los tramos terrestres, con la nave en su posición heliocéntrica.

## Pruebas

[`tests/Stage21LaunchInjection.test.mjs`](../tests/Stage21LaunchInjection.test.mjs), 13 pruebas. Las comprobaciones usan **fórmulas propias** sobre los vectores de estado de los tramos:

- **Precesión:** IAU 1976 frente a IAU 2006 (otra formulación), < 0,5″ en 1977–2050; deriva del equinoccio de 46,12″/año; matriz ortonormal.
- **Invariancia del ascenso al girar la Tierra:** coincide salvo el error de integración (0,23 m; 5·10⁻⁵ s en el corte).
- **Centaur D-1T y lanzador:** datos documentados de la Centaur; capacidad del lanzador ×9 medida por bisección (24,6 t ± 1 %).
- **Escape:** tiempo hasta un radio en la hipérbola, comparado con bisección sobre Kepler.
- **A1 desde la plataforma:** fases, órbita final 3 000 × 100 000 km, continuidad < 1 m y < 1 mm/s, y separaciones declaradas.
- **A1 · sitio y salida, con métodos propios:**
  - sitio en el despegue, con un GMST propio (ángulo de rotación de la Tierra, IERS 2010), la precesión IAU 2006 y WGS84;
  - velocidad en la plataforma igual a ω·ρ;
  - inclinación de la órbita de aparcamiento ≥ |δ|;
  - C3 propio al final del encendido y energía conservada hasta la SOI;
  - radio de la SOI de Laplace calculado aquí;
  - balance de masas y ecuación del cohete.
- **Sin la opción:** el resultado es el de la etapa 20.
- **Reproducción:**
  - contexto «Tierra»;
  - altitud geodésica de 0 km en la plataforma y velocidad inercial;
  - motor y tanque de la Centaur durante la inyección;
  - paso al contexto heliocéntrico.
- **Casos no viables:**
  - C1 con Cassini (Centaur sin Δv);
  - una asíntota de 70° con acimut fijo de 90°;
  - límite del lanzador con una asíntota de 60°;
  - despegue fuera de la cobertura de efemérides: se usa la otra ventana.
- **Apuntado sintético:** alcanza la velocidad pedida en la SOI.
- **Planificador:** pasa la opción al perfil, desactivada por defecto.
- **Glosario:** reconoce los rótulos nuevos.

Suite completa **379/379**; `npm run build` y `GITHUB_PAGES=true npm run build` correctos; `git diff --check` limpio. No se ha retirado ni debilitado ninguna prueba anterior.

## Verificación en el navegador

Chrome sin interfaz con la GPU real (AMD, Direct3D 11), [`scripts/verify-stage21-browser.mjs`](../scripts/verify-stage21-browser.mjs) ([registro](../evidence/stage21/verify-stage21-gpu.json), 7 capturas). Recorrido con los controles del usuario:
1. A1;
2. marcar la casilla y calcular;
3. gráfico «Tierra»;
4. Centro de Misión en el despegue, en la inyección (cámara exterior) y en el crucero;
5. «Resultados»;
6. volver a «Planificar», desmarcar y calcular;
7. ancho de 390 px.

| Comprobación | Resultado |
| --- | --- |
| Escenario tras marcar | Sigue siendo A1 |
| Veredicto | «CADENA CALCULADA COMPLETA SEGÚN EL MODELO»; las cuatro fases de salida, «completada según el modelo» |
| «Salida desde la plataforma» | Las nueve filas de la tabla de resultados; términos del glosario: acimut, órbita de aparcamiento, C3 y empalme |
| Gráfico «Tierra» | Activo; Tierra al centro, radio encuadrado de 20 091 km ([captura](../evidence/stage21/03_grafico_tierra.png)) |
| Centro de Misión, t = 0 | Sistema Solar principal; fase «Lanzamiento desde Cabo Cañaveral (12E)»; altitud 0 km, velocidad 0,40873 km/s (rotación terrestre), masa 946 296 kg ([captura](../evidence/stage21/04_centro_mision_despegue.png)) |
| Centro de Misión, t = 3 400 s | «Inyección interplanetaria (empuje finito, Centaur D-1T)», con la cámara exterior ([captura](../evidence/stage21/05_centro_mision_inyeccion_exterior.png)) |
| Eventos | Despegue 13:00:03, órbita 13:10:17, encendido 13:54:30, apagado 14:00:54 (C3 = 8,12) y salida de la SOI el 2 de diciembre a las 19:40:15 |
| «Resultados» | Propelente consumido por la sonda: 2 396 kg; «Propelente de la Centaur D-1T (inyección): 11 769 kg (quedan 1 725 kg)» |
| Sin la opción | «Salida (TDB → UTC)», «inyección externa no modelada», sin la caja de salida, gráfico «Tierra» desactivado, fases desde «Inyección interplanetaria» |
| 390 px | Casilla y explicación dentro de la página, sin desbordamiento horizontal ([captura](../evidence/stage21/07_movil_casilla_plataforma.png)) |
| Errores y avisos de la página | Ninguno |

**No ejercitado en el navegador:** el contexto local «Tierra» del Centro de Misión, que solo aparece cuando la misión no se reproduce en el Sistema Solar principal. Se comprueba únicamente en las pruebas.

## Límites

- **Lanzador ilustrativo.** El ×9 del demostrativo de 12E no es un Titan IIIE ni ningún cohete real. En vuelo, el primer encendido de la Centaur (MES-1) completaba la órbita de aparcamiento; aquí la Centaur solo hace la inyección. Tampoco se modelan la evaporación, el asentamiento del propelente ni las restricciones de reencendido. El empuje es progrado, sin optimizar.
- **C3 de la plataforma frente al del centro de la Tierra.** El empalme iguala la **velocidad** en la frontera de la SOI, para que la trayectoria sea continua. Más allá de la SOI se ignora la gravedad terrestre, como en cualquier cónica parcheada continua. Por eso el C3 necesario baja en ≈ 2μ⊕/R_SOI = 0,863 km²/s²:
  - A1: 8,117 frente a 8,993 desde el centro de la Tierra;
  - C1: 74,846 frente a 75,733.

  En Δv impulsivo son ≈ 39 m/s menos en A1 y ≈ 32 m/s menos en C1. El modelo convencional de radio de SOI nulo iguala la asíntota y pide el C3 mayor, pero introduciría un salto de velocidad en la frontera.

  **Medido en la etapa 22** ([crucero de n cuerpos](STAGE22_NBODY_CRUISE.md)): con la Tierra actuando también fuera de su SOI, la llegada de A1 se aparta 13,2 millones de km del punto de la cónica (45 159 km sin la Tierra). **Con la plataforma, el C3 de esta etapa es demasiado bajo para el sistema solar real.** Corregirlo exige apuntar la salida con la Tierra fuera de la SOI; es una decisión de modelo pendiente de la revisión independiente.
- **Tierra puntual dentro de la SOI**, sin J2, sin la Luna, sin el Sol y sin resistencia en la órbita de aparcamiento.
- **Orientación terrestre sin nutación** (≲ 0,5 km en la superficie), sin movimiento del polo (≲ 15 m) y sin UT1 − UTC (≲ 0,4 km en Cabo Cañaveral). Son valores del orden indicado, no medidos aquí.
- **Restricciones no comprobadas:** los límites de acimut del campo de tiro, la luz, el tiempo meteorológico y las ventanas reales. El despegue se elige dentro del día de la salida prevista, sin optimizarlo.
- **Sitio:** la altitud de la plataforma LC-41 no está en las fuentes del proyecto; se usa 0 m.
- **Escena:** el Sistema Solar principal muestra el despegue a la escala del Sistema Solar (radios 1:1), sin una vista dedicada de la plataforma. La cinemática de la etapa 25 es solo de las Voyager históricas.
- **Pendientes:** revisión independiente (Gemini u otra sesión de Claude sin este contexto), revisión visual por una persona y prueba con un lector de pantalla real.
