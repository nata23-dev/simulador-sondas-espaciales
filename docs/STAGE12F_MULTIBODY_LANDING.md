# Etapa 12F — Arquitectura multicuerpo y descenso planetario (incluye 12E.1)

**Estado:** implementada y probada localmente (213/213 pruebas en la batería completa). **No está validada**: queda pendiente la auditoría independiente de Gemini. Sin commit, push, despliegue ni ZIP.

Documentos asociados: [capacidades por cuerpo](MULTIBODY_MISSION_CAPABILITY_MATRIX.md), [arquitectura](MULTIBODY_MISSION_ARCHITECTURE.md), [12E](STAGE12E_EARTH_LAUNCH.md).

## 1. Correcciones 12E.1 (hechas primero)

La auditoría de Gemini aprobó 12E con observaciones. Se corrigieron:

1. **Cámara local** (`MissionExecutionView.js`, modo `local`, botón «Cámara local» solo para `launch` y `landing`). Encuadre ilustrativo a distancia `0,0002·R + 0,45·altitud` (unidades de escena), vista lateral con el vehículo escalado (`distancia/15`) y plano cercano dinámico. Solo se mueven la cámara y la escala del modelo; las posiciones (km) no se alteran. Se alterna con la vista general. Sin efectos. La separación de etapas es un salto de masa (la etapa descartada no se propaga): se inspecciona saltando al evento con la cámara local.
2. **Transición atmosférica 180–200 km** (`LaunchAtmosphere.js`): la exponencial desde 86 km se multiplica por `s(u) = 1 − (3u² − 2u³)`, `u = (h − 180)/20`. Densidad y presión continuas, primera derivada continua en 180 y 200 km (`s'=0` en ambos), no negativas, nulas desde 200 km; capas bajo 180 km intactas. **Es una aproximación numérica**, no una representación física de la exosfera. Se modificó una prueba previa: el bucle de densidad estrictamente positiva ahora llega hasta `h < 200` (en 200 km la densidad es 0 por diseño); el modelo pasa a `us-standard-1976-layers-v2-smooth-cutoff`.
3. **Clasificación suborbital** (`LaunchOrbit.js`, `LaunchSimulation.js`): si la ventana termina bajo 150 km, descendiendo y sin impacto, se continúa la costa (sin empuje) hasta 7 200 s para localizar el contacto. `classification` conserva la familia `SUBORBITAL`; el campo `outcome` distingue **IMPACTO CONFIRMADO** (evento localizado), **SUBORBITAL DESCENDENTE** (bajo 100 km, ligada, descendente y con la elipse intersectando la Tierra, sin contacto detectado) y `SUBORBITAL` (elipse que intersecta). **NO VERIFICABLE** queda para estados no finitos o indeterminados a baja altitud. Resultados con el lanzador demostrativo: 561 kg → ÓRBITA TERRESTRE ALCANZADA SEGÚN EL MODELO; 3 000 kg → IMPACTO CONFIRMADO (T+1 761 s); 5 000 kg → IMPACTO CONFIRMADO (T+636 s). Las trayectorias no se forzaron.

## 2. Arquitectura implementada

| Archivo | Responsabilidad |
|---|---|
| `src/lab/CelestialBodyMissionRegistry.js` | Perfiles físicos, capacidades, contratos de marco, descriptor de marco local. |
| `src/lab/BodyLandingVehicle.js` | Módulo de aterrizaje ilustrativo, validación, carga útil desde el Hangar. |
| `src/lab/BodyLandingDynamics.js` | Entorno, cinemática respecto a la superficie, guiado, derivada, tramos con eventos, órbita inicial. |
| `src/lab/BodyLandingSimulation.js` | Fases, eventos, resultado y clasificación. |
| `src/lab/BodyLandingPlayback.js` | Ejecución reproducible, muestreo y telemetría. |
| `src/lab/BodyLandingPlan.js` | Cálculo, validación e invalidación. |
| `src/ui/LandingPlanner.js` | Sección «Descenso y aterrizaje». |

Cambios en módulos existentes: `MissionControlCenter.js` (rama `landing`, cámara local, fases y eventos), `MissionExecutionView.js` (escala y cuerpo central por ejecución, cámara local, Luna oculta), `ExperimentalLaboratory.js` (sección y encabezado «ETAPA 12F»), `experimental-laboratory.css` (selectores compartidos con `#lab-launch`), `LaunchAtmosphere/Orbit/Simulation/Playback.js` y `LaunchPlanner.js` (12E.1). No se tocaron 12B, 12D ni datos Voyager.

## 3. Destinos y capacidades

19 cuerpos descubiertos en los catálogos (Sol, 8 planetas, 10 satélites). Descenso: OPERATIVO en Luna y Europa; EXPERIMENTAL en Mercurio, Ío, Ganímedes, Calisto, Encélado, Titania y Miranda; PENDIENTE en Venus, Tierra, Marte, Titán y Tritón (atmósfera); NO APLICABLE en el Sol y los cuatro gigantes. Razones y datos faltantes: [matriz](MULTIBODY_MISSION_CAPABILITY_MATRIX.md).

## 4. Constantes y procedencia

- GM y radios del Sol, planetas y Luna: `SOLAR_SYSTEM_GM_CATALOG` (JPL DE440), sin duplicar. Radios de satélites: `PlanetaryMoons.js`.
- GM de 9 satélites: `SATELLITE_GM_JPL` (NASA/JPL SSD, <https://ssd.jpl.nasa.gov/sats/phys_par/>, leído el 2026-11-17, con σ). **No existían en el proyecto**; se añadieron con su fuente y requieren verificación independiente.
- `g0 = 9,80665 m/s²` (NIST SP 811 B.9).
- Rotación: **ninguna** (el proyecto no la define). Clasificación atmosférica: cualitativa, sin números.
- Parámetros del módulo (`DEMO_LANDER`): ilustrativos; ver §6.

## 5. Modelo y marcos

`dr/dt = v`, `dv/dt = −μ r/|r|³ + θ F_max û/(m·1000)`, `dm/dt = −θ F_max/(Isp·g0)`, `dΔv/dt = θ F_max/(m·1000)`; DOPRI54 (tolerancias absolutas `[1e-7×3, 1e-10×3, 1e-6, 1e-12]`, relativa 1e-10). Marco inercial **local** del cuerpo, ejes arbitrarios, origen en su centro; la época UTC es una etiqueta; `connectedToIcrf: false`. Con rotación declarada se usa `v_rel = v − ω × r` (probado con un perfil sintético; ningún cuerpo real la declara aún). Perturbaciones ausentes: atmósfera, J2, terceros cuerpos, mareas, radiación, actitud.

## 6. Módulo, propulsión y guiado

`DEMO_LANDER`: estructura 1 500 kg (cuerpo 900, depósitos 350, patas 250), propelente 4 200 kg, motor de 16 kN, Isp 311 s, estrangulable 10–100 %, reencendido ilimitado. Con la sonda interplanetaria del Hangar (561 kg) la masa inicial es 6 261 kg. Guiado de lazo cerrado descrito en la [arquitectura §10](MULTIBODY_MISSION_ARCHITECTURE.md). Se rechazan (con explicación) los motores no estrangulables y los módulos cuyo empuje mínimo supera la gravedad local.

## 7. Contacto y clasificación

`|r| = R` con tolerancia 1e-9 km y bisección a 1e-7 s; no se atraviesa la superficie ni se anula la velocidad. Se registran instante, posición, velocidad, altitud, velocidades vertical y horizontal respecto al suelo, masa, propelente, motor, destino y coordenadas locales. Umbrales (aproximaciones): suave ≤ 3 / 1,5 m/s; brusco ≤ 6 / 3 m/s; impacto en otro caso. Precedencia: contacto suave; EMPUJE INSUFICIENTE (empuje/peso ≤ 1 al iniciar el frenado); COMBUSTIBLE AGOTADO (si ocurrió antes del contacto); saturación del guiado en los últimos 120 s; brusco; impacto. DESCENSO INCOMPLETO si no hay contacto; NO VERIFICABLE si no es finito o la integración no converge. No se declara supervivencia estructural.

## 8. Resultados de los escenarios (módulo demostrativo, sonda de 561 kg, órbita circular de 100 km, periapsis de descenso 15 km)

| Escenario | Resultado | Notas |
|---|---|---|
| 1. Luna | ATERRIZAJE SUAVE SEGÚN EL MODELO | T+3 958 s; v_z 1,31 m/s, v_h 0,03 m/s; propelente usado 2 852 kg; Δv 1 854 m/s. |
| 2. Europa | ATERRIZAJE SUAVE SEGÚN EL MODELO | T+4 096 s; 2 517 kg; Δv 1 569 m/s. Ganímedes también suave (3 096 kg). |
| 3. Fallo | COMBUSTIBLE AGOTADO (1 500 kg de propelente); EMPUJE INSUFICIENTE (4 kN en la Luna, o el módulo estándar en Mercurio); IMPACTO (velocidad de contacto 9 m/s); ATERRIZAJE BRUSCO (4,5 m/s) | Surgen de la integración. |
| 4. Gigante | NO APLICABLE: sin superficie sólida convencional; categoría futura «Sonda de entrada atmosférica» | Selector y cálculo bloqueados. |
| 5. Atmósfera | PENDIENTE: «Descenso atmosférico pendiente» (Venus, Tierra, Marte, Titán; Tritón: atmósfera tenue sin analizar) | No se usa vacío. |

Encélado: el módulo demostrativo se rechaza (empuje mínimo 0,776 m/s² > g = 0,113 m/s²); un módulo de 1 200 N con 100 kg de carga útil aterriza suavemente.

## 9. Interfaz y Centro de Misión

Sección «Descenso y aterrizaje» tras «Lanzamiento»: selector derivado del registro (19 cuerpos con su estado), propiedades físicas, órbita local (periapsis, apoapsis, inclinación, nodo, anomalía, época), perfil de descenso, módulo editable, cálculo, resultados y reproducción. Cualquier cambio de destino, sonda, órbita, masa, motor, combustible o perfil invalida el resultado. El Centro reproduce en escena local (esfera central escalada a 0,6371 u, Luna oculta), con ×1…×86 400 de velocidad, pausa, retroceso, saltos a eventos, cámaras existentes y cámara local. Telemetría solo de valores calculados; nada terrestre aparece en un descenso lunar.

## 10. Pruebas (`tests/MultibodyLanding.test.mjs`, 29)

Cubren A–Z del encargo: catálogo e identificadores, perfiles válidos e inválidos, gravedad (Luna y Europa), velocidad circular, período y cierre de órbita, conservación de energía/momento angular, Tsiolkovsky y consumo, modulación, frenado orbital, `v − ω × r`, contacto contra la **solución analítica de caída radial de Kepler** (instante y velocidad), aterrizajes (Luna, Europa, Ganímedes, Encélado con módulo pequeño), brusco/impacto, combustible y empuje insuficientes, datos faltantes, gigantes y atmósferas, invalidación, reproducción determinista, convergencia al variar el paso máximo, integridad de 12D/12E, atmósfera suave, clasificación suborbital y cámara local. Total de la batería: 213/213.

## 11. Limitaciones y pendientes

Ver [arquitectura §22–23](MULTIBODY_MISSION_ARCHITECTURE.md). Además: el guiado es heurístico y conmuta el motor en el mínimo; los umbrales de contacto son del simulador; sin punto objetivo; la tabla de GM de satélites no está verificada de forma independiente; la comprobación manual en navegador se hizo en escritorio (1600×1000) y no pudo repetirse a 320 px en esta sesión; la revisión visual humana y la auditoría de Gemini siguen pendientes.

## 12. Recomendación siguiente

Efemérides absolutas y orientación de cuerpos (UTC↔TDB, IAU) más cambio de esfera de influencia: es la dependencia común de toda misión continua Tierra → otro cuerpo, y desbloquea además coordenadas fijas al cuerpo y velocidad de superficie real.
