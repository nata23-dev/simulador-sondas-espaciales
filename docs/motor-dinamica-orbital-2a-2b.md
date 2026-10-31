# Etapas 2A y 2B: motor de dinámica orbital y primera sonda espacial

Este documento describe el modelo matemático, los contratos científicos, los métodos numéricos, la integración visual y las limitaciones reales de la primera versión operativa del motor de dinámica orbital.

---

## 1. Modelo físico implementado

El motor (`src/science/GravitationalDynamics.js`) distingue explícitamente tres formulaciones y prohíbe mezclarlas:

1. **Problema de dos cuerpos (`two-body-central`)**:
   - Un cuerpo central de parámetro gravitacional $\mu = GM$ en el origen y una sonda tratada como partícula de prueba ($m_{\text{sonda}} \to 0$):
     $$\mathbf{a}(\mathbf{r}) = -\frac{\mu}{|\mathbf{r}|^3}\,\mathbf{r}$$
2. **Modelo A — Sonda de masa despreciable bajo efemérides prescritas en marco heliocéntrico (`prescribed-ephemeris-heliocentric-probe`, modelo operativo principal de esta etapa)**:
   - La sonda responde simultáneamente a la atracción del Sol ($\mu_\odot$) y de $N$ cuerpos perturbadores con posiciones heliocéntricas prescritas $\mathbf{r}_j(t)$ procedentes de efemérides NASA/JPL Horizons:
     $$\ddot{\mathbf{r}} = -\frac{\mu_\odot}{|\mathbf{r}|^3}\mathbf{r} - \sum_{j=1}^{N}\mu_j\left(\frac{\mathbf{r}-\mathbf{r}_j}{|\mathbf{r}-\mathbf{r}_j|^3} + \frac{\mathbf{r}_j}{|\mathbf{r}_j|^3}\right)$$
   - La masa descriptiva de la sonda (`massKg`) no altera la aceleración gravitacional mientras `massTreatment === 'test_particle'`, ni la sonda retroactúa sobre los planetas.
3. **Modelo B — Núcleo extensible de interacción mutua N-cuerpos en marco inercial (`mutual-nbody-inertial`)**:
   - Evalúa aceleraciones mutuas $\mathbf{a}_i = \sum_{j \neq i} \mu_j (\mathbf{R}_j - \mathbf{R}_i)/|\mathbf{R}_j - \mathbf{R}_i|^3$ exclusivamente cuando el origen declarado es inercial/baricéntrico (`SSB` / `INERTIAL_BARYCENTER`), rechazando explícitamente coordenadas centradas en `SUN_CENTER`.

---

## 2. Unidades empleadas

| Magnitud | Unidad científica interna | Frontera / escena |
|---|---|---|
| Posición $\mathbf{r}$ | `km` | `32 unidades de escena / AU` (`1 AU = 149 597 870.700 km`) |
| Velocidad $\mathbf{v}$ | `km/s` | `km/s` en telemetría de sonda (`AU/día` solo donde lo exige la ficha planetaria existente) |
| Aceleración $\mathbf{a}$ | `km/s²` | Uso exclusivo en dinámica e interpolación quíntica |
| Parámetro gravitacional $\mu = GM$ | `km³/s²` | Catálogo inmutable validado |
| Tiempo interno de integración | `s` (`elapsedSeconds` desde `epochJdTdb`) | `JD TDB` en las fronteras del proveedor y etiquetas `TDB` en HUD |

---

## 3. Marco de referencia y origen

- **Marco**: `ICRF_ECLIPTIC_J2000` (ejes inerciales eclípticos J2000 compatibles con Horizons `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`).
- **Origen**: `SUN_CENTER` (`500@10`, centro del Sol).
- **Transformación a escena WebGL/Three.js** (`src/integration/ProbeVisualAdapter.js`): rotación ortogonal pura $(X_{\text{escena}}, Y_{\text{escena}}, Z_{\text{escena}}) = (x, z, -y) \cdot (32 / \text{KM\_PER\_AU})$, idéntica a `ScientificVisualPipeline.js`. Nunca muta los vectores físicos en `km`.

---

## 4. Tratamiento de términos indirectos y control de cancelación numérica

Como el centro del Sol está acelerado respecto al baricentro del Sistema Solar ($\ddot{\mathbf{R}}_\odot = \sum_j \mu_j \mathbf{r}_j / |\mathbf{r}_j|^3$), escribir únicamente la atracción directa $\mathbf{r} - \mathbf{r}_j$ en coordenadas heliocéntricas violaría la segunda ley de Newton en un sistema de referencia no inercial.

Además, cuando $|\mathbf{r}| \ll |\mathbf{r}_j|$ (por ejemplo, una sonda en el Sistema Solar interior perturbada por Júpiter o Saturno), los términos directo $(\mathbf{r}-\mathbf{r}_j)/|\mathbf{r}-\mathbf{r}_j|^3$ e indirecto $\mathbf{r}_j/|\mathbf{r}_j|^3$ son casi opuestos y su suma directa sufre cancelación sustractiva. El motor aplica la identidad algebraica exacta de Battin:

$$q_j = \frac{\mathbf{r}\cdot(\mathbf{r} - 2\mathbf{r}_j)}{|\mathbf{r}_j|^2}, \qquad f(q_j) = q_j\,\frac{3 + 3q_j + q_j^2}{1 + (1 + q_j)^{3/2}}$$

$$\frac{\mathbf{r}-\mathbf{r}_j}{|\mathbf{r}-\mathbf{r}_j|^3} + \frac{\mathbf{r}_j}{|\mathbf{r}_j|^3} = \frac{\mathbf{r} + f(q_j)\,\mathbf{r}_j}{|\mathbf{r}-\mathbf{r}_j|^3}$$

para $|q_j| \le 0.5$, y la suma directa + indirecta cuando $|q_j| > 0.5$ (cerca del planeta perturbador, donde no existe cancelación). En la Prueba Física 6 (sistema sintético Sol–planeta–sonda integrado durante ~10 revoluciones interiores), incluir el término indirecto reproduce la integración baricéntrica exacta con error de `2.44e-9 km`, frente a `187.44 km` de deriva al omitirlo.

---

## 5. Fuentes de parámetros gravitacionales

El módulo `src/science/GravitationalParameters.js` define valores inmutables verificados a partir de **NASA/JPL Solar System Dynamics — Astrodynamic Parameters** (`https://ssd.jpl.nasa.gov/astro_par.html`, consistentes con la efeméride planetaria **JPL DE440**, Park et al. 2021, *AJ* 161, 105):

| ID Horizons | Cuerpo | $\mu = GM$ (`km³/s²`) | Alcance de masa (`massScope`) | Radio de referencia (`km`) |
|---|---|---:|---|---:|
| `10` | Sol | `132712440041.279419` | `body_only` | `695700` (nominal UAI 2015 Res. B3) |
| `199` | Mercurio | `22031.868551` | `body_only` | `2439.4` |
| `299` | Venus | `324858.592000` | `body_only` | `6051.8` |
| `399` | Tierra | `398600.435507` | `body_only` | `6371.0084` |
| `301` | Luna | `4902.800118` | `body_only` | `1737.4` |
| `499` | Marte | `42828.375816` | `planetary_system_at_body_center` | `3389.50` |
| `599` | Júpiter | `126712764.100000` | `planetary_system_at_body_center` | `69911` |
| `699` | Saturno | `37940584.841800` | `planetary_system_at_body_center` | `58232` |
| `799` | Urano | `5794556.400000` | `planetary_system_at_body_center` | `25362` |
| `899` | Neptuno | `6836527.100580` | `planetary_system_at_body_center` | `24622` |

- Todos los objetos públicos están congelados (`Object.freeze`) y validan positividad, finitud y alcance de masa.
- Para pruebas unitarias controladas ($\mu = 1$, sistemas binarios sintéticos), existe `createSyntheticGravitationalCatalog`, marcado explícitamente con `isSynthetic: true` para impedir su confusión con constantes físicas reales.

---

## 6. Métodos numéricos disponibles

`src/science/NumericalIntegrator.js` implementa dos integradores deterministas para sistemas de EDO de primer orden $\dot{\mathbf{y}} = \mathbf{f}(t, \mathbf{y})$ en `Float64Array(6)` (hacia adelante y hacia atrás en el tiempo):

1. **`RK4` clásico de 4.º orden (`integrateRk4`)**:
   - Paso fijo configurable con ajuste exacto del último subpaso al instante objetivo.
   - Utilizado como método de referencia independiente y verificación de orden de convergencia ($\mathcal{O}(h^4)$ verificado empíricamente con órdenes `4.08` y `4.04`).
2. **`Dormand-Prince 5(4)` adaptativo (`integrateDopri54` / `DOPRI54`, método principal)**:
   - Par embebido de 7 etapas (Dormand & Prince 1980, *J. Comput. Appl. Math.* 6, 19–26) con coeficientes racionales exactos y propiedad **FSAL** (*First Same As Last*, 6 evaluaciones efectivas por paso aceptado).
   - Control adaptativo de paso mediante norma RMS ponderada por componente con tolerancias absolutas (`absTol`, vectoriales por posición/velocidad o escalares) y relativas (`relTol`), factor de seguridad `0.9`, límites de escala `[0.2, 5.0]`, rechazo explícito de pasos con error normalizado $> 1$, cota `minStepSeconds`, `maxStepSeconds`, `maxIterations` e interrupción segura mediante `shouldAbort`.
3. **Interpolación densa entre nodos de cálculo (`interpolateQuinticMechanicalState6`)**:
   - Cada nodo aceptado almacena $(t_k, \mathbf{r}_k, \mathbf{v}_k, \mathbf{a}_k)$, permitiendo interpolación de Hermite quíntica con continuidad $C^2$ en posición y $C^1$ en velocidad en $\mathcal{O}(\log N)$ sin reintegrar en tiempo de renderizado.

> **Advertencia científica**: Las tolerancias `absTol` y `relTol` controlan el error de truncamiento local respecto a la EDO definida, **no** certifican precisión astrométrica absoluta frente a la realidad física.

---

## 7. Representación interna del tiempo

En épocas cercanas a 2026 ($\text{JD} \approx 2\,461\,323.5$), un `Number` IEEE-754 `binary64` en días julianos posee $1\text{ ULP} = 2^{21-52}\text{ d} \approx 4.6566\times 10^{-10}\text{ d} \approx 40.23\text{ }\mu\text{s}$. Sumar incrementos pequeños directamente sobre `jdTdb` introduce deriva de cuantización (equivalente a ~`0.4 m` por redondeo de fecha en cuerpos rápidos como Mercurio).

`src/science/SimulationTime.js` representa cada instante mediante:
- `epochJdTdb`: época fija de referencia en `JD TDB`.
- `elapsedSeconds`: segundos físicos transcurridos desde `epochJdTdb` en `Float64` (resolución $< 10^{-9}\text{ s}$ en ventanas de meses o años).
- `jdTdb`: propiedad derivada `epochJdTdb + elapsedSeconds / 86400` usada únicamente en fronteras con contratos `ScientificState` y `EphemerisProvider`.
- `decomposeJdTdbCalendar`: conversión aritmética pura JDN $\to$ calendario gregoriano TDB sin utilizar `Date` ni introducir conversiones UTC/TDB implícitas.

---

## 8. Sonda de prueba utilizada: `Sonda Experimental 01`

Definida en `src/science/ExperimentalProbe01.js`:

- **Identificación**: `Sonda Experimental 01` (`id: 'sonda-experimental-01'`), clasificada explícitamente como `fictional_experimental` (`isAuthenticHistorical: false`). **No representa una trayectoria histórica de NASA.**
- **Masa descriptiva**: `480 kg` (`massTreatment: 'test_particle'`).
- **Época inicial ($T_0$)**: `2026-10-10 · 00:00:00 TDB` (`JD 2461323.5 TDB`, `elapsedSeconds = 0`).
- **Estado inicial heliocéntrico (`ICRF_ECLIPTIC_J2000`, `SUN_CENTER`)**:
  - $\mathbf{r}_0 = (151\,500\,000,\; 45\,200\,000,\; 2\,400\,000)\text{ km}$ ($|\mathbf{r}_0| \approx 1.0569\text{ AU}$, ~`9.04 × 10⁶ km` o ~6 radios de Hill en el exterior de la Tierra).
  - $\mathbf{v}_0 = (-4.2,\; 33.6,\; 3.1)\text{ km/s}$ ($|\mathbf{v}_0| \approx 34.003\text{ km/s}$, transferencia elíptica inclinada ~`5.6°` hacia la región orbital de Marte).
- **Intervalo propagado dentro de la cobertura actual**: `22.0 días` (`0 s` a `1 900 800 s`, hasta `2026-11-01 · 00:00:00 TDB`), completado en ~`5 ms` con `134` nodos de cálculo `DOPRI54` y `1057` muestras de renderizado separadas (cada `1800 s`), con concordancia de `2.60e-7 km` (`0.26 mm`) frente a `RK4` de paso fino (`h = 300 s`).

---

## 9. Alcance de las efemérides actuales

- El conjunto local activo (`horizons-planets-2026-10` / `public/data/efemerides-2026.json`) cubre exactamente del **`2026-10-01 00:00 TDB` (`JD 2461314.5`) al `2026-11-01 00:00 TDB` (`JD 2461345.5`)** con cadencia diaria (`86 400 s`, 32 muestras por cuerpo) para los 8 planetas (`199` a `899`).
- `preparePrescribedEphemerisField` precarga y valida la cobertura conjunta en tablas `Float64Array` para interpolación cúbica de Hermite síncrona durante la integración.
- **Cero extrapolación silenciosa**: cualquier intento de evaluar o propagar fuera de `[2026-10-01, 2026-11-01]` lanza `DynamicsError('OUTSIDE_EPHEMERIS_COVERAGE')` en política `'strict'`, o detiene limpiamente la trayectoria e informa el borde de cobertura en política `'clamp_to_coverage'`.

---

## 10. Limitaciones físicas actuales

1. **Partícula de prueba y efemérides prescritas**: la sonda no altera el movimiento planetario ni se reintegran mutuamente los planetas entre sí (Modelo A).
2. **Cadencia diaria de efemérides planetarias**: entre muestras diarias de Horizons, las posiciones planetarias se obtienen por interpolación cúbica de Hermite (cuyos residuales máximos medidos a 2 días alcanzan ~`177 km` en Mercurio y ~`1.16 km` en la Tierra; a 1 día son significativamente menores, pero suficientes para crucero interplanetario e insuficientes para sobrevuelos planetarios rasantes de precisión de navegación).
3. **Ausencia de la Luna (`301`) y satélites naturales en el archivo local actual**: el catálogo de constantes ya incluye la Luna (`301`, $\mu = 4902.800118\text{ km}^3/\text{s}^2$), pero `efemerides-2026.json` solo contiene los centros planetarios `199..899`. En Marte y los gigantes gaseosos se usa el `GM` del sistema planetario concentrado en el centro del planeta; para la Tierra se usa `399` (`body_only`). Para simular inyecciones cis-lunares o asistencias cercanas a sistemas con satélites será necesario adquirir las series Horizons de `301` y baricentros/satélites relevantes.
4. **Fuerzas no modeladas aún**: correcciones relativistas post-newtonianas (1PN / Einstein–Infeld–Hoffmann), presión de radiación solar (SRP), armónicos gravitacionales no esféricos ($J_2, C_{nm}, S_{nm}$), arrastre atmosférico y empuje propulsivo activo.

---

## 11. Limitaciones numéricas conocidas

1. **Aritmética IEEE-754 `binary64`**: límite de ~15–17 cifras decimales significativas; pasos inferiores a `minStepSeconds` se rechazan con `IntegrationError('STEP_UNDERFLOW')` para evitar estancamiento numérico.
2. **Integradores Runge–Kutta no simplécticos**: `DOPRI54` y `RK4` son óptimos para trayectorias de sondas con perturbaciones dependientes del tiempo y futuros eventos/maniobras (conservando energía relativa a `~2.1e-11` en órbitas excéntricas de prueba), pero no conservan una forma simpléctica exacta en integraciones seculares de miles de órbitas.
3. **Singularidades y encuentros extremos**: cada cuerpo define un umbral `minSafeDistanceKm` (su radio físico de referencia o cota explícita); aproximaciones a distancia inferior o nula se detienen con `DynamicsError('CLOSE_APPROACH_LIMIT' | 'SINGULARITY')` en lugar de introducir suavizados artificiales silenciosos.

---

## 12. Procedimiento para ejecutar la simulación y pruebas

### Ejecución interactiva
1. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
2. Abrir la aplicación en el navegador (`http://localhost:5173/`, o con `?ephemeris=scientific` para activar también el proveedor científico en los pasos diarios manuales).
3. En el panel izquierdo **`SONDA · EXPERIMENTAL / Sonda Experimental 01`**:
   - Pulsar **`Iniciar`** para ejecutar el reloj TDB continuo (1 día TDB/s a `1×`, ajustable entre `0,5×`, `1×`, `2×` y `4×` en el selector inferior **Velocidad**). Planetas y sonda avanzan sincronizados bajo el mismo instante TDB.
   - Pulsar **`Pausar`** / **`Reanudar`** para detener o continuar la evolución desde el instante actual.
   - Pulsar **`Reiniciar`** para volver a $T_0$ (`2026-10-10 · 00:00:00 TDB`).
   - Pulsar **`Enfocar`** (o hacer clic / doble clic sobre la sonda 3D en la escena) para seguir el vehículo espacial con la cámara.
   - Activar o desactivar **`Mostrar trayectoria`** para alternar el trazado 3D (arco completo predicho en cian tenue y tramo recorrido en ámbar).

### Verificación automatizada y compilación
```bash
node --test
npm run build
# Compilación con ruta base de GitHub Pages:
GITHUB_PAGES=true npm run build
```

---

## 13. Preparación para futuras maniobras y misiones históricas

- **Contratos listos para maniobras (`src/science/ProbeState.js`)**: `ProbeDefinition` reserva `maneuverSlot` (validando hoy que no se inyecten maniobras no soportadas sin motor propulsivo), y `ProbeDynamicState` incorpora `segmentIndex` para encadenar múltiples arcos continuos separados por impulsos $\Delta\mathbf{v}$ instantáneos o fases de empuje finito donde la interpolación quíntica no debe cruzar una discontinuidad de derivada.
- **Camino hacia misiones históricas (p. ej. Voyager 1/2)**:
  1. Adquirir mediante `scripts/fetch-horizons-ephemerides.mjs` series Horizons verificadas para la ventana histórica deseada con cadencia adaptada a los encuentros planetarios (incluyendo Luna/baricentros según se requiera) y un vector inicial de crucero documentado.
  2. Instanciar un descriptor `ProbeDefinition` (`classification: 'historical_reconstruction'`) y propagarlo por tramos con `propagateProbeTrajectory`, comparando residuales contra vectores de referencia de Horizons.
