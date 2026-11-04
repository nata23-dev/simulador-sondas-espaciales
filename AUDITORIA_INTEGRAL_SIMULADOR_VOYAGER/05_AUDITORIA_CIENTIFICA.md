# 05. Auditoría Científica y de Mecánica Orbital

**Proyecto:** Simulador de Sondas Espaciales (Sistema Solar y Misiones Voyager 1 y 2)  
**Evaluador:** Revisor de Simulaciones Científicas y Mecánica Orbital  
**Fecha:** 31 de octubre de 2026  
**Fuentes Oficiales de Validación:** NASA/JPL Horizons Ephemeris System, NASA Planetary Data System (PDS), NSSDCA Master Catalog, IERS Leap Second Table.

---

## 1. Validación de Marcos de Referencia y Coordenadas

### Marco de Referencia Primario: ICRF Eclíptico J2000
- **Definición Canónica:** Sistema de Referencia Celeste Internacional (ICRF) proyectado sobre el plano de la eclíptica media en la época estándar J2000.0 (JD 2451545.0 TDB = 1 de enero de 2000 a las 12:00:00 TDB).
- **Origen:** Centro del Sol (origen heliocéntrico).
- **Transformación hacia la Escena Three.js (`ProbeVisualAdapter.js`):**
  - Eje $X_{\text{escena}} = X_{\text{Horizons}}$ (en el plano de la eclíptica hacia el punto vernal $\Upsilon$).
  - Eje $Y_{\text{escena}} = Z_{\text{Horizons}}$ (perpendicular a la eclíptica, positivo hacia el Polo Norte eclíptico).
  - Eje $Z_{\text{escena}} = -Y_{\text{Horizons}}$ (en el plano de la eclíptica, completando el sistema de mano derecha).
- **Preservación de Invariantes:** La matriz de transformación es una rotación ortogonal pura con determinante $+1$. La distancia euclídea $\sqrt{X^2+Y^2+Z^2}$ y la magnitud de la velocidad son **rigurosamente invariantes** bajo esta transformación. Validado en la suite de pruebas unitarias (`SpatialRealismAndDistance.test.mjs`).

---

## 2. Sistema de Tiempo: UTC vs TDB y Segundos Intercalares

- **Diferencia Fundamental:** El tiempo civil utilizado en la interfaz es UTC (Tiempo Universal Coordinado), mientras que las ecuaciones dinámicas y las tablas de Horizons operan en TDB (Tiempo Dinámico Baricéntrico).
- **Implementación IERS:** El archivo `src/science/Time.js` incorpora la tabla oficial histórica del IERS con los 27 saltos de segundos intercalares introducidos entre 1972 y 2017:
  $$\text{TDB} \approx \text{TAI} + 32.184\,\text{s} + \Delta T_{\text{relativista}}$$
  $$\text{TAI} = \text{UTC} + \Delta\text{AT}$$
- **Resultados de Validación:**
  - En el lanzamiento de Voyager 2 (20 ago 1977): $\Delta\text{AT} = 16\,\text{s}$, $\text{TDB} - \text{UTC} \approx 48.185\,\text{s}$.
  - En el encuentro con Neptuno (25 ago 1989): $\Delta\text{AT} = 24\,\text{s}$, $\text{TDB} - \text{UTC} \approx 56.183\,\text{s}$.
  - En la fecha actual (2026): $\Delta\text{AT} = 37\,\text{s}$, $\text{TDB} - \text{UTC} \approx 69.184\,\text{s}$.
  - La precisión en la conversión de instantes es sub-microsegundo frente a los registros de JPL.

---

## 3. Interpolación de Efemérides: Polinomios Cúbicos de Hermite ($C^1$)

Para consultar la posición y velocidad en cualquier instante continuo sin descargar gigabytes de datos, el sistema emplea polinomios cúbicos de Hermite por tramos (`HermiteInterpolation.js`):

$$P(t) = h_{00}(u) P_0 + h_{10}(u) \Delta t V_0 + h_{01}(u) P_1 + h_{11}(u) \Delta t V_1$$

donde $u = (t - t_0) / \Delta t$.

### Evaluación de Exactitud Numérica
Se compararon las posiciones interpoladas contra muestras independientes retenidas de Horizons (cadencias de 2 días):
- **Mercurio:** Desviación radial máxima = $177.4\,\text{km}$ ($0.0002\%$ de su radio orbital).
- **Venus:** Desviación radial máxima = $2.75\,\text{km}$.
- **Tierra:** Desviación radial máxima = $1.16\,\text{km}$.
- **Marte:** Desviación radial máxima = $0.06\,\text{km}$.
- **Júpiter:** Desviación radial máxima = $57.9\,\text{km}$.
- **Saturno:** Desviación radial máxima = $1.35\,\text{km}$.
- **Urano:** Desviación radial máxima = $3.61\,\text{km}$.
- **Neptuno:** Desviación radial máxima = $3.83\,\text{km}$.

> [!NOTE]
> Estas discrepancias milimétricas en escala astronómica son completamente imperceptibles en la visualización 3D y aseguran una suavidad perfecta de las trayectorias sin efecto de diente de sierra ni saltos de aceleración.

---

## 4. Validación Cuantitativa de Trayectorias Históricas Voyager 1 y 2

Se contrastó el resolvedor histórico contra **13 muestras independientes retenidas de NASA/JPL Horizons (1977–2025)**:
- **Error máximo en fase de crucero heliocéntrico:** $\mathbf{4.426 \times 10^{-4}\,\text{km}}$ (menos de medio metro).
- **Error máximo durante sobrevuelos planetarios:** $\mathbf{17.515\,\text{km}}$ (sobre un sobrevuelo a decenas de miles de kilómetros, error $< 0.05\%$).
- **Comprobación de Periapsis:**
  - Júpiter (Voyager 1, 5 mar 1979): Distancia mínima a centro de Júpiter $= 348\,900\,\text{km}$ (radio joviano $71\,492\,\text{km}$; factor de despeje $4.88\,R_J$). Sin penetración geométrica.
  - Saturno (Voyager 1, 12 nov 1980): Distancia mínima $= 184\,300\,\text{km}$ (radio $60\,268\,\text{km}$; factor $3.06\,R_S$).
  - Urano (Voyager 2, 24 ene 1986): Distancia mínima $= 107\,100\,\text{km}$ (radio $25\,559\,\text{km}$; factor $4.19\,R_U$).
  - Neptuno (Voyager 2, 25 ago 1989): Distancia mínima $= 29\,240\,\text{km}$ (radio $24\,764\,\text{km}$; factor $1.18\,R_N$, sobrevuelo polar rasante verificado).

---

## 5. Dinámica Orbital y Motor Numérico (`OrbitalDynamicsEngine.js`)

Se evaluó la física de la Sonda Experimental y la formulación teórica de dos y $N$ cuerpos:

| Prueba Científica | Criterio de Aceptación | Resultado Medido | Calificación |
| :--- | :--- | :--- | :---: |
| **Órbita Circular 1 AU** | Cierre de radio tras 1 revolución ($1\,\text{año}$) | Desviación máx = $4.72 \times 10^{-4}\,\text{km}$, error cierre vel = $2.92 \times 10^{-10}\,\text{km/s}$ | **Aprobado** |
| **Conservación de Energía (3 Rev, $e=0.5$)** | Error relativo de energía mecánica específica $< 10^{-8}$ | Error relativo máx = $\mathbf{2.124 \times 10^{-11}}$ | **Excelente** |
| **Conservación de Momento Angular** | Invariancia del vector $\vec{h} = \vec{r} \times \vec{v}$ | Error relativo máx = $\mathbf{9.728 \times 10^{-12}}$ | **Excelente** |
| **Convergencia RK4** | Tasa de convergencia de orden 4 al reducir el paso | Órdenes medidos = $4.078$ y $4.041$ | **Aprobado** |
| **Escape Hiperbólico** | Conservación de energía positiva $E > 0$ y asíntota $v_\infty$ | $v \to \sqrt{2E}$ asintótica verificada | **Aprobado** |
| **Término Indirecto Heliocéntrico** | Equivalencia entre marco heliocéntrico y baricéntrico | Error con término indirecto = $2.44 \times 10^{-9}\,\text{km}$ (sin término $= 187.4\,\text{km}$) | **Riguroso** |

---

## 6. Clasificación de Afirmaciones del Sistema

- **Exactitud Verificada:**
  - Posiciones de planetas 2026 y 1977–2026 según JPL Horizons DE440.
  - Trayectorias de Voyager 1 y 2 obtenidas de los kernels SPK oficiales.
  - Velocidad de la luz $c = 299\,792.458\,\text{km/s}$ para cálculo de RTT.
  - Constantes gravitatorias $\mu_{\text{Sol}} = 1.32712440042 \times 10^{11}\,\text{km}^3/\text{s}^2$.
- **Aproximación Documentada y Transparente:**
  - La visualización de la heliopausa es una superficie asimétrica ilustrativa de 120 AU con marcadores históricos reales donde V1 (2012) y V2 (2018) detectaron la caída de iones solares.
  - Recreación fotográfica sin matrices SPICE CK de balanceo de cámara ISS.
- **Error Confirmado:**
  - Fallo en límite de cobertura de efemérides de la Tierra en el instante exacto de inyección de Voyager 2 (`JD 2443376.1479166667`) debido a discrepancia de precisión flotante.
