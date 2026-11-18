# Etapa 12E — Lanzamiento terrestre, ascenso atmosférico y separación de etapas

**Estado:** implementada y comprobada localmente el 17-11-2026 (rama `revision/modo-historico-voyager`, sin commit). **No está aprobada**: queda pendiente la auditoría independiente de Gemini y la revisión visual humana. Incluye las correcciones 12D.1 (sección 0). Una órbita «alcanzada según el modelo» no es éxito operativo.

## 0. Correcciones 12D.1 (defectos de 12C)

| ID | Defecto a 320×568 | Corrección (CSS localizada en `src/ui/experimental-laboratory.css`) |
| --- | --- | --- |
| DEF-12C-HER-01 | `#mc-stage-status` se superponía con la etiqueta superior del escenario | Bajo 420 px la cabecera del escenario pasa a columna (`flex-direction:column`) y el estado de reproducción puede ajustar línea; ya no compite con la etiqueta. |
| DEF-12C-HER-02 | La barra de cámaras recortaba «Cámara de destino» | `.mc-camera-bar` envuelve sus botones (`flex-wrap`), con margen lateral reducido a 8 px y botones flexibles: todas las cámaras son alcanzables. |
| DEF-12C-HER-03 | La pestaña «Centro de misión» quedaba parcialmente inaccesible | `.lab-sections` (la navegación real del laboratorio) envuelve sus botones bajo 560 px en lugar de desplazarse en horizontal. |

Pruebas: `tests/Stage12D1MobileLayout.test.mjs` (3 pruebas estáticas sobre el CSS efectivo). Comprobación manual en Chrome sin cabeza a 320×568: sin desbordamiento horizontal del documento y las cinco pestañas visibles (la quinta pasa a la segunda fila).

## 1. Arquitectura

Todo el cálculo vive en `src/lab/` sin DOM ni Three.js. La interfaz (`src/ui/`) solo recoge parámetros y muestra resultados.

| Módulo | Responsabilidad |
| --- | --- |
| `LaunchEarth.js` | WGS84, geodesia, rotación terrestre, marco inercial ECI-L, base local y sitio de lanzamiento |
| `LaunchAtmosphere.js` | Atmósfera US-1976 por capas + extrapolación exponencial + vacío |
| `LaunchVehicle.js` | Lanzador demostrativo, validación, empuje/Isp dependientes de la presión, carga útil desde el Hangar |
| `LaunchDynamics.js` | Ecuaciones, guiado, fuerzas (una sola implementación), integración por tramos con detección de eventos |
| `LaunchSimulation.js` | Secuencia de lanzamiento, separación, circularización opcional, eventos, evaluación orbital |
| `LaunchOrbit.js` | Elementos osculadores y clasificación del resultado |
| `LaunchPlan.js` | Cálculo desde el diseño del Hangar, firma de obsolescencia |
| `LaunchPlayback.js` | Reproducción determinista y telemetría (compatible con `MissionControlCenter`) |
| `src/ui/LaunchPlanner.js` | Sección «Lanzamiento» del laboratorio |

El lanzador es **independiente de la sonda del Hangar**: la carga útil es la sonda actual con su masa húmeda real (seca + propelente cargado, `calculateEngineering`). Los parámetros del lanzador son ilustrativos y no corresponden a un cohete real. Se reutilizan `integrateDopri54`, `FiniteThrustError` y las constantes de 12A–12D; la física de 12D (`propagateFiniteThrust`) no se modificó.

## 2. Modelo gravitacional

Fuerza central de masa puntual: `a = −GM·r/|r|³`, con el mismo `GM` terrestre del catálogo del proyecto (398 600,4355 km³/s²). **No hay J2, ni gravedad lunar o solar** en esta etapa (efecto de J2 en elementos de una órbita de ~160–650 km: del orden de grados por día en los nodos, no incluido). El achatamiento se emplea solo para geodesia (altitud sobre el elipsoide), no en la gravedad.

## 3. Atmósfera

0–86 km: capas US-1976 con gradiente de temperatura constante y fórmula barométrica (valores de presión comprobados contra la tabla estándar a 0, 11, 20, 32 y 47 km geopotenciales, tolerancias 2·10⁻⁴–2·10⁻³). 86–200 km: extrapolación exponencial con la escala de altura de ese nivel (aproximación gruesa). Por encima de 200 km: densidad y presión nulas. **Sin viento**, sin variaciones diaria, estacional ni de latitud: no es un modelo meteorológico.

## 4. Rotación terrestre

Velocidad angular `ω = 7,292115·10⁻⁵ rad/s` constante. La atmósfera corrota: `v_rel = v − ω×r`. En el ecuador, 465,1 m/s; en la latitud de la plataforma, `ω·(N+h)·cos φ` (prueba E). La velocidad de rotación se suma por construcción: el estado inicial inercial ya incluye `ω×r`.

## 5. Marcos de referencia

**ECI-L** (propio): origen en el centro de la Tierra, eje z = eje de rotación, eje x = meridiano de longitud 0° en t = 0 girado el *ángulo de rotación terrestre inicial* declarado. La fecha de lanzamiento (UTC) es **una etiqueta**: no se convierte a UT1/TDB, ni hay precesión, nutación o movimiento polar. Por tanto **no se afirma conexión absoluta con ICRF, la eclíptica J2000 ni la Luna**. En la vista del Centro de Misión la Luna se coloca en el origen (oculta bajo la Tierra) y no se calcula ninguna posición lunar. Unidades: km, km/s, s, kg; conversiones explícitas N/kg = m/s² → ÷1000 → km/s².

## 6. Ecuaciones

Estado de 8 componentes `[x,y,z,vx,vy,vz,m,Δv]`:

- `dr/dt = v`
- `dv/dt = a_grav + a_empuje + a_arrastre`
- `a_empuje = F(p)·û/m` (F en N → m/s² → km/s²)
- `a_arrastre = −(q·Cd·A/m)·v̂_rel`, `q = ½ρ v_rel²` (v_rel respecto a la atmósfera corrotante)
- `dm/dt = −F_vac/(Isp_vac·g0)` con `g0 = 9,80665 m/s²`
- `dΔv/dt = F/m` (integrado, no impuesto)

Integrador DOPRI54 adaptativo (tolerancias abs `[1e-6 km ×3, 1e-9 km/s ×3, 1e-6 kg, 1e-12]`, rel `1e-10`).

## 7. Modelo del lanzador

Dos etapas, cada una con masa estructural, propelente, empuje a nivel del mar y en vacío, Isp en vacío, área de referencia y Cd constante. El flujo másico `ṁ = F_vac/(Isp_vac·g0)` es constante; el empuje depende de la presión: `F(p) = F_vac − (F_vac − F_SL)·p/p₀`, y el Isp efectivo es `F(p)/(ṁ·g0)`. Lanzador demostrativo: etapa 1: 6 000 kg estructura + 80 000 kg, 1,45/1,6 MN, 310 s; etapa 2: 1 800 kg + 15 000 kg, 160/190 kN, 350 s; Cd 0,3; A = 7,1 m². Valores de ajuste didáctico, **no** de un cohete real. Sin viento, sin Mach (Cd constante), sin cargas estructurales, sin actitud dinámica.

## 8. Etapas y separación

Secuencia: verificación de plataforma (empuje/peso ≥ 1 con la gravedad local; si no, el estado es `NO DESPEGA` y no se ejecuta ningún encendido) → encendido → despegue → ascenso programado → agotamiento de la etapa 1 (la masa integrada se verifica contra el consumo y se rechaza si difiere) → tramo balístico → **separación** (evento discreto: se descarta la estructura de la etapa 1 más su propelente residual, conservando posición y velocidad; el salto de masa es exactamente lo descartado y no se resta dos veces; el impulso de separación se limita a 0) → retardo de encendido → etapa 2 → apagado → circularización opcional → tramo balístico final → evaluación.

## 9. Programa de ascenso

Guiado idealizado (la orientación es una consigna, sin dinámica de actitud): ascenso vertical → inclinación inicial fija (`kick`) → *gravity turn* (empuje a lo largo de la velocidad relativa) hasta agotar la etapa 1 → en la etapa 2, programa de cabeceo (rampa lineal de la elevación del vector de empuje respecto al horizonte local, hacia la dirección horizontal de la velocidad). Parámetros editables: acimut, ascenso vertical, inclinación, rampa y elevación final, duración del primer encendido, circularización y su elevación de empuje. La circularización usa **el mismo motor y consume propelente real**; se apaga cuando el perigeo osculante supera el mínimo objetivo + 10 km de margen. No hay correcciones artificiales de velocidad.

## 10. Eventos

Encendido, despegue, Max-Q (refinado por búsqueda ternaria sobre la trayectoria muestreada), agotamiento (MECO), separación, inicio de la etapa 2, altitud objetivo, apagado (SECO o por perigeo), apogeo osculante, encendido de circularización, impacto y fin. Los eventos se ordenan por tiempo y los simultáneos (p. ej. con retardos 0) se conservan sin fallar.

## 11. Evaluación orbital

Energía específica, momento angular, semieje mayor, excentricidad, perigeo/apogeo, inclinación y carácter ligado/no ligado. La altitud mínima de la órbita se obtiene muestreando la elipse contra el radio del elipsoide a cada latitud. Clases: **SUBORBITAL** (impacto o la elipse intersecta la Tierra), **ÓRBITA TERRESTRE ALCANZADA SEGÚN EL MODELO** (ligada, sin intersección, perigeo ≥ 160 km, apogeo ≤ 2 000 km y, si se pide, inclinación en tolerancia), **OBJETIVO NO ALCANZADO** (no ligada, o perigeo bajo el mínimo, o fuera de los límites) y **NO VERIFICABLE** (estado no finito o final por debajo de 100 km de altitud sin impacto). Se distingue la «órbita matemática» (ligada sin intersección) de la sostenible (perigeo ≥ mínimo). El umbral de 160 km es un criterio del modelo, no una garantía de vida orbital.

Resultado del lanzador demostrativo con la sonda `Exploración interplanetaria` (561 kg): T/W 1,43; Max-Q ≈ 36,6 kPa a 11 km; MECO a 152 s; separación a 154 s; etapa 2 hasta 348 s; circularización en el apogeo (≈ 645 km); órbita ≈ 170 × 645 km (la circularización se detiene con 10 km de margen sobre el perigeo mínimo de 160 km), inclinación 29,3° (acimut 90° desde 28,5° N), Δv integrado 9,63 km/s frente a 11,37 km/s ideal de Tsiolkovsky, 1 467 kg de propelente restante. Una carga útil de 3 000 kg queda NO VERIFICABLE y una de 5 000 kg SUBORBITAL (impacto). **Estos números son resultados del modelo y de parámetros ajustados para esta demostración; no validan un cohete real.**

## 12. Telemetría

Solo magnitudes calculadas: tiempo, altitud WGS84, velocidad inercial, velocidad relativa a la atmósfera, presión dinámica, aceleración propia (m/s² y g), empuje, empuje/peso, masa, propelente total y por etapa, etapa activa, estado de motores, Δv propulsivo acumulado, apogeo/perigeo/excentricidad osculantes (instantáneos, dos cuerpos, sin arrastre) y resultado orbital al final. No hay temperatura, vibración, carga estructural ni cualquier otro parámetro inventado. Las unidades y límites se muestran en el panel.

## 13. Integración en el laboratorio

Nueva sección **Lanzamiento** entre Ingeniería y Planificador (flujo Hangar → Ingeniería → Lanzamiento → Planificador → Centro de Misión). Configura sitio, fecha (etiqueta), programa de ascenso, órbita objetivo y lanzador; calcula; muestra resultados; «Reproducir en el Centro de Misión» valida y envía una ejecución `kind: 'launch'`. El Centro de Misión reutiliza su reloj (retroceso, pausa, velocidades ×1 y ×10 añadidas, saltos por evento), cámaras y escena; para `launch` cambia los paneles de telemetría. La reproducción es una función pura del instante (Hermite en posición/velocidad, masa lineal por tramo): retroceder o repetir **no** vuelve a consumir propelente ni a separar. Un indicador `launchActive` impide que las notificaciones del Planificador sustituyan un lanzamiento en reproducción; cambiar la sonda o cualquier parámetro invalida el resultado y la ejecución. Visualmente: la trayectoria es integrada, la orientación del empuje es programada, y el modelo 3D es ilustrativo, **sin llamas ni humo**; la escala de 1 unidad = 10 000 km hace que el ascenso de ≤ ~650 km ocupe menos de 0,07 unidades. El ajuste mínimo de `MissionExecutionView.js` es un `overviewMinDistance` opcional (2,4 unidades) para encuadrar la Tierra completa.

## 14. Pruebas numéricas (`tests/EarthLaunch.test.mjs`, 17 pruebas)

| Prueba | Qué comprueba | Referencia independiente / tolerancia |
| --- | --- | --- |
| A | Sin empuje no hay despegue, masa constante, sin eventos de encendido | altitud fija 3 m (1e-9 km); empuje de vacío 0 es rechazado |
| B | T/W < 1 no despega; T/W = 1,1 asciende | `T_SL / (m·g)` con `g = GM/R²` |
| C | Empuje constante sin gravedad ni atmósfera: velocidad, masa y posición | ecuaciones del cohete: `v = ve·ln(m0/m)` (1e-9 km/s) y `x = ve/ṁ·(m0−m−m·ln(m0/m))` (1e-7 km); RK4 de paso 0,01 s con gravedad (1e-7 km) |
| D | Masa variable y Δv acumulado | Tsiolkovsky y consumo `F/(Isp·g0)` |
| E | Rotación y velocidad de superficie | `ω·(N+h)·cosφ` (1e-12 km/s); 465,10 m/s en el ecuador; geodesia reversible |
| F | Arrastre: dirección opuesta a `v_rel`, magnitud y unidades; cuerpo en reposo respecto del suelo sin arrastre | `½ρv²·Cd·A` (1e-9 N); densidad contra tabla US-1976 (0,5 %) |
| G | Separación: continuidad, masa descartada, sin doble resta, conservación de propelente | balance de masa a 1e-9–1e-3 kg |
| H | Agotamiento → balístico: energía conservada, masa constante, Δv no crece | energía específica (1e-6 km²/s²) |
| I | Carga pesada: suborbital, impacto, integración termina sobre la superficie | altitud final 0 ± 1e-6 km, sin muestras posteriores |
| J | Órbita ligada: elementos y vis-viva | `v² = μ(2/r − 1/a)` (1e-9) |
| K | Perigeo que intersecta la Tierra; perigeo atmosférico; circular; inclinación | `rp = 2a − ra` (1e-9); circular `e=0` |
| L | Escape: no ligada, `ε > 0`, hiperbólica/parabólica | `v²/2 − μ/r` (1e-9) |
| M | Reproducción determinista y reversible; la separación ocurre una sola vez; obsolescencia | `deepEqual` entre recorridos directo e inverso; reloj de reproducción |
| N | Eventos cercanos y simultáneos, orden estricto de nudos, Max-Q es máximo | tiempos coincidentes a 1e-9 s |
| O | Convergencia: paso máximo 5 s vs 0,25 s y RK4 fino; impacto por bisección | 1e-6 km / 1e-8 km/s |
| P | Regresión 12D: el empuje en vacío coincide con `propagateFiniteThrust` | 10 cm y 1 mm/s tras 900 s (secuencias de paso distintas); Tsiolkovsky a 1e-3 m/s |

Además: atmósfera (referencias de presión, monotonía, continuidad en 86 km, vacío) y validaciones. Resultado de la batería completa: ver el informe de entrega.

## 15. Precisión y convergencia

DOPRI54 con tolerancia relativa 1e-10 sobre una escala de ~10⁴ km (error local ≲ 1e-6 km). Las diferencias entre trayectorias con pasos distintos fueron de 10 cm tras 900 s (prueba P), de modo que **no se afirma precisión de metros en la órbita final**: el error del modelo (guiado idealizado, atmósfera sin viento, Cd constante) es mucho mayor que el numérico. El impacto se localiza por bisección a 1e-7 s; el resto de eventos se refinan por bisección o búsqueda ternaria sobre la interpolación de Hermite de los nudos.

## 16. Limitaciones

- Lanzador y guiado ilustrativos; el ajuste de la demostración (propelente de la etapa 2, programa de cabeceo, tiempo de apagado) se buscó numéricamente para que la sonda ligera alcance órbita.
- Sin J2, gravedad lunar/solar, viento, Mach, actitud, pérdidas por gimbal, sloshing, carenado ni cargas estructurales.
- Marco propio: la fecha UTC es solo una etiqueta; sin conexión con la Luna ni el plano de la eclíptica. Sin ventana de lanzamiento real ni plano de transferencia.
- Elementos osculadores sin perturbaciones; la sostenibilidad se mide con un perigeo mínimo, no con vida orbital.
- Una sola etapa de circularización opcional; sin rendez-vous ni inyección translunar (esa sigue en 12B/12D con órbita ya adquirida).
- La aprobación independiente está pendiente (Gemini).

## 17. Trabajo futuro

Conectar el estado de órbita terrestre con el Planificador (inyección translunar desde la órbita alcanzada), perturbaciones (J2, arrastre en órbita baja), viento y Mach, actitud, y modelos de lanzador con fuente verificada. No se inicia la etapa 12F.

## Addendum 12E.1 (Etapa 12F)

Tras la auditoría de Gemini se corrigió lo siguiente (detalle en [STAGE12F_MULTIBODY_LANDING.md](STAGE12F_MULTIBODY_LANDING.md#1-correcciones-12e1-hechas-primero)); este addendum **sustituye** lo contrario que diga el texto anterior:

- La densidad y la presión ya no se anulan de golpe a 200 km: entre 180 y 200 km la extrapolación exponencial se multiplica por un suavizado cúbico (continuo en valor y primera derivada; nulo desde 200 km). Es un artificio numérico, no la exosfera real.
- Una carga de 3 000 kg ya no queda «NO VERIFICABLE»: la costa se prolonga hasta localizar el contacto y se clasifica `SUBORBITAL` con resultado fino **IMPACTO CONFIRMADO** (o **SUBORBITAL DESCENDENTE** si el contacto no se localiza). 5 000 kg → IMPACTO CONFIRMADO; 561 kg sigue alcanzando órbita.
- Cámara local de seguimiento en el Centro de Misión.
