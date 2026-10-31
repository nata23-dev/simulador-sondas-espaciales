# MODO HISTÓRICO VOYAGER 1 Y VOYAGER 2 — DOCUMENTACIÓN TÉCNICA Y PROCEDENCIA CIENTÍFICA

## 1. Visión General y Propósito

El **Modo Histórico Voyager 1 y Voyager 2** es una extensión astrodinámica y visual del **Simulador de Sondas Espaciales**. Permite reproducir con precisión científica las trayectorias de las dos sondas espaciales interplanetarias e interestelares más longevas de la humanidad:
- **Voyager 1** (NAIF ID: `-31`, lanzada el 5 de septiembre de 1977 desde Cabo Cañaveral SLC-41).
- **Voyager 2** (NAIF ID: `-32`, lanzada el 20 de agosto de 1977 desde Cabo Cañaveral SLC-41).

La arquitectura garantiza la coexistencia simultánea y aislada de tres modos operativos en el simulador:
1. **Sistema Solar (`Exploración`)**: visualización interactiva y efemérides planetarias.
2. **Misiones Históricas (`Modo Histórico`)**: reproducción temporal 1977–2026 de Voyager 1 y 2, encuentros planetarios y satelitales, cámaras en primera persona y comparador de fotografías auténticas de NASA.
3. **Simulación Experimental (`Motor de Propagación`)**: integración numérica DOPRI54/RK4 con perturbaciones gravitacionales n-cuerpos DE440 para la Sonda Experimental 01.

---

## 2. Fuentes de Efemérides, Procedencia y Soluciones de Órbita

Todos los datos orbitales provienen del sistema oficial **NASA/JPL Horizons** del Jet Propulsion Laboratory (Caltech / NASA), calculados en el marco de referencia inercial baricéntrico/heliocéntrico ICRF/J2000 referenciado al plano eclíptico fundamental:

- **Efemérides Planetarias y Lunares**: Efemérides Numéricas DE440 del JPL (*Park et al., 2021*), masa y baricentros del Sistema Solar.
- **Solución Orbital Voyager 1**: `Voyager_1_ST+refit2022_m` (JPL Solar System Dynamics Group / R. A. Jacobson, 2022).
  - *Segmento 1*: Diseño cónico de crucero y sobrevuelos planetarios (1977–1981).
  - *Segmento 2*: Reconstrucción radioastronómica DSN con DE440 (1981–2100).
  - *Unión de segmentos SPK*: 1 de enero de 1981 00:00:00 TDB (`JD 2444605.5`).
- **Solución Orbital Voyager 2**: `Voyager_2_ST+refit2022_m` (JPL Solar System Dynamics Group / R. A. Jacobson, 2022).
  - *Segmento 1*: Gran Tour Planetario de Júpiter, Saturno, Urano y Neptuno (1977–1989).
  - *Segmento 2*: Reconstrucción DE440 y ajuste de crucero interestelar (1989–2100).
  - *Unión de segmentos SPK*: 29 de agosto de 1989 08:00:00 TDB (`JD 2447767.833333333`).

### Cuerpos Celestes Muestreados
| NAIF ID | Nombre del Cuerpo | Misión / Encuentro Asociado | Razón de Inclusión |
| :--- | :--- | :--- | :--- |
| `10` | Sol | Marco heliocéntrico ICRF | Centro de coordenadas primario |
| `399` | Tierra | Lanzamientos 1977, Pale Blue Dot 1990 | Medición de distancias y tiempo luz (OWLT) |
| `599` | Júpiter | V1 (marzo 1979) / V2 (julio 1979) | Asistencia gravitatoria y sobrevuelos |
| `501` | Ío | V1 (5 marzo 1979) | Actividad volcánica y fotografías ISS |
| `699` | Saturno | V1 (noviembre 1980) / V2 (agosto 1981) | Inclinación hiperbólica (+35°) / Tour exterior |
| `606` | Titán | V1 (12 noviembre 1980) | Sobrevuelo cercano (5.569 km del centro) |
| `799` | Urano | V2 (24 enero 1986) | Primer sobrevuelo histórico del sistema uraniano |
| `899` | Neptuno | V2 (25 agosto 1989) | Asistencia gravitatoria hacia el sur (−48°) |
| `801` | Tritón | V2 (25 agosto 1989) | Sobrevuelo polar cercano (39.800 km) |
| `-31` | Voyager 1 | 1977–2026 | Sonda heliosférica / interestelar norte |
| `-32` | Voyager 2 | 1977–2026 | Sonda heliosférica / interestelar sur |

---

## 3. Particionamiento, Cobertura y Almacenamiento

El catálogo histórico consta de **30 conjuntos de datos independientes** (`public/data/historical/`), organizados en:
1. `probes/`: Series de crucero decenales (1977–1989, 1989–2002, 2002–2014, 2014–2026) con cadencia de 5 días (432.000 s).
2. `encounters/`: Ventanas de alta resolución para fases de inyección Titan IIIE-Centaur (cadencia 180 s a 300 s), sobrevuelos planetarios (cadencia 900 s a 1.800 s) y puentes de unión SPK (cadencia 60 s).
3. `planets/`: Efemérides sincrónicas de los cuerpos celestes acompañantes.

- **Volumen Total**: 74.345 tuplas de estado físico `[jd, utc, x, y, z, vx, vy, vz]`.
- **Integridad**: Catálogo central `public/data/historical-ephemerides-catalog-v1.json` con comprobación de firma SHA-256, metadatos de solución JPL y límites temporales estrictos.
- **Rendimiento**: Gestor de caché LRU (`HistoricalEphemerisResolver`) limitado a 22 conjuntos en memoria activa. Carga diferida mediante fetch asíncrono.

---

## 4. Escala Temporal: Conversión UTC ↔ TDB y Segundos Intercalares

El tiempo interno científico se rige por **JD TDB** (Tiempo Dinámico Baricéntrico en Días Julianos). Dado que las fuentes históricas registran fechas civiles en UTC, la conversión implementa:
1. **Tabla de Segundos Intercalares IERS Bulletin C**:
   - 37 saltos discretos desde 1972 hasta 2026 (e.g., $\Delta\text{AT} = 17\text{ s}$ en 1977; $\Delta\text{AT} = 37\text{ s}$ en 2026).
   - $T_{\text{TAI}} = T_{\text{UTC}} + \Delta\text{AT}$.
   - $T_{\text{TT}} = T_{\text{TAI}} + 32{,}184\text{ s}$.
2. **Término Relativista Fairhead & Bretagnon (1990) / UAI SOFA**:
   $$T_{\text{TDB}} - T_{\text{TT}} \approx 0{,}001657 \sin(g) + 0{,}000022 \sin(2g)\text{ s}$$
   donde $g = 357{,}5277233^\circ + 0{,}9856002831^\circ \times (JD - 2451545{,}0)$.
3. **Representación de Tiempo Dividido**:
   Para evitar la pérdida de precisión de coma flotante en navegadores (microsegundos en fechas de 1977), los instantes se descomponen en `midnightPseudoJd` entero y `daySeconds` de alta precisión, garantizando determinismo exacto y compatibilidad total sin depender del objeto `Date` nativo del navegador.

---

## 5. Reglas de Interpolación y Salvaguardas Físicas

- **Interpolación Cúbica Hermite $C^1$**: Garantiza continuidad geométrica en posición $\mathbf{r}(t)$ y velocidad $\mathbf{v}(t)$ dentro de un mismo archivo continuo respetando el intervalo máximo admitido (`maxIntervalSeconds`).
- **Prohibición de Extrapolación**: Toda consulta fuera de los límites documentados devuelve de forma explícita `out_of_coverage` sin generar trayectorias ficticias.
- **Protección de Uniones SPK (`spkSegmentSplice`)**:
  En el salto entre el segmento analítico antiguo y la reconstrucción numérica DE440, el resolver detecta el intervalo de transición, prohíbe la interpolación Hermite a través del hueco y clasifica el estado como `spk_segment_transition`, emitiendo una advertencia científica con la causa técnica documentada por JPL.
- **Fase de Ascenso e Inyección (`launch_ascent_visual`)**:
  El primer vector heliocéntrico de Horizons inicia aproximadamente 63 minutos después del despegue, tras la separación de la etapa Centaur. Durante ese breve intervalo de 1 hora, el simulador identifica explícitamente el estado como `launch_ascent_visual` con una interpolación visual desde Cabo Cañaveral hacia el primer punto orbital.

---

## 6. Cámaras Exteriores y Primera Persona Científica

- **Cámara Exterior**:
  - Seguimiento cinemático de Voyager 1, Voyager 2 o vista dual de conjunto.
  - Orbitación y zoom interactivo respetando el centro de masas del modelo 3D.
- **Cámara en Primera Persona (Perspectiva de la Sonda)**:
  - Posicionada exactamente en las coordenadas heliocéntricas $(\mathbf{r}_{\text{probe}})$ del instante seleccionado.
  - Escala angular física estricta **1:1** (`SpatialScale = 1.0`).
  - Campo de visión dinámico ajustable entre **0,35°** (equivalente al telescopio de ángulo estrecho ISS de 1500 mm de focal) y **65°** (gran angular para inspección panorámica del firmamento).
  - Orientación libre de 360° (panorámica horizontal y cabeceo vertical) mediante puntero o teclado.
  - Botón de bloqueo visual instantáneo hacia la **Tierra** o cuerpos planetarios mayores.
  - Retícula de puntería con colimador y telescopio angular.

---

## 7. Catálogo de Fotografías Auténticas de NASA y Comparador A/B

El catálogo contiene 8 fotografías auténticas capturadas por el subsistema de cámaras ISS (*Imaging Science Subsystem*) de Voyager, alojadas localmente bajo `public/images/voyager/`:

| ID | Fecha (UTC) | Objeto / Encuentro | Instrumento / PIA | SHA-256 Verificado |
| :--- | :--- | :--- | :--- | :--- |
| `v1-jupiter-great-red-spot-1979` | 1979-02-25 12:00:00 | Gran Mancha Roja de Júpiter | ISS Narrow-Angle · PIA00452 | `100% verificado local` |
| `v1-io-volcanic-plumes-1979` | 1979-03-04 17:00:00 | Penachos volcánicos en Ío | ISS Wide-Angle · PIA01970 | `100% verificado local` |
| `v1-saturn-rings-approach-1980` | 1980-10-18 00:00:00 | Sistema de anillos de Saturno | ISS Narrow-Angle · PIA00029 | `100% verificado local` |
| `v1-pale-blue-dot-1990` | 1990-02-14 05:30:00 | Retrato de Familia · Pale Blue Dot | ISS Narrow-Angle · PIA01977 | `100% verificado local` |
| `v2-jupiter-ring-1979` | 1979-07-08 12:00:00 | Anillo tenuemente iluminado | ISS Wide-Angle · PIA01967 | `100% verificado local` |
| `v2-saturn-rings-titan-shadow-1981` | 1981-08-11 18:00:00 | Saturno y radios de los anillos | ISS Narrow-Angle · PIA00451 | `100% verificado local` |
| `v2-crescent-uranus-1986` | 1986-01-25 05:45:00 | Creciente de Urano en salida | ISS Narrow-Angle · PIA01391 | `100% verificado local` |
| `v2-crescent-neptune-triton-1989` | 1989-08-31 06:00:00 | Creciente de Neptuno y Tritón | ISS Narrow-Angle · PIA01492 | `100% verificado local` |

### Comparador A/B y Nivel de Fidelidad
El comparador permite contrastar lado a lado la fotografía auténtica de NASA con la vista 3D generada por WebGL.
- **Fidelidad**: Identificada honestamente como `geometric_approximation` (recreación geométrica). Se calcula la posición de la cámara y la línea de visión al objetivo astronómico según las efemérides DE440, pero se advierte que no reproduce la matriz de rotación de actitud fina (*roll attitude*) de los archivos SPICE CK de la nave ni la dispersión espectral de los filtros ópticos analógicos.
- **Apagado Histórico de Cámaras**: El sistema documenta el apagado de las cámaras de Voyager 2 (2 de octubre de 1989) y Voyager 1 (14 de febrero de 1990 tras el Retrato de Familia). En fechas posteriores, el visor muestra la notificación oficial de desactivación para reservar energía a la Misión Interestelar.

---

## 8. Heliosfera y Espacio Interestelar

La heliosfera se modela conceptualmente reconociendo la asimetría del viento solar frente al flujo del medio interestelar local:
- **Onda de choque de terminación (*Termination Shock*)**:
  - Voyager 1: cruzado en diciembre de 2004 a ~94 AU.
  - Voyager 2: cruzado en agosto de 2007 a ~84 AU.
- **Heliopausa (*Heliopause*)**:
  - Voyager 1: cruzada el 25 de agosto de 2012 a ~121{,}6 AU.
  - Voyager 2: cruzada el 5 de noviembre de 2018 a ~119{,}0 AU.
- En la interfaz se identifican como estructuras ilustrativas tridimensionales, sin pretender una geometría esférica rígida ficticia, complementadas con marcadores de acontecimiento en los instantes respaldados por publicaciones de NASA/JPL.
