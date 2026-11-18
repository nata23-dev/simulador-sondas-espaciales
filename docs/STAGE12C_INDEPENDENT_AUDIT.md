# INFORME DE AUDITORÍA CIENTÍFICA, FUNCIONAL Y VISUAL INDEPENDIENTE — ETAPA 12C
## CENTRO DE CONTROL DE MISIONES (LABORATORIO EXPERIMENTAL 2.0)

---

**Fecha de auditoría:** 17 de noviembre de 2026  
**Auditor:** Agente Independiente de Auditoría (DeepMind Advanced Agentic AAC)  
**Documento base de Codex:** [`docs/STAGE12C_MISSION_CONTROL.md`](../docs/STAGE12C_MISSION_CONTROL.md)  
**Documentos de referencia:** [`docs/STAGE12B_MISSION_PLANNER.md`](../docs/STAGE12B_MISSION_PLANNER.md) y [`docs/STAGE12B1_NUMERICAL_RECONCILIATION.md`](../docs/STAGE12B1_NUMERICAL_RECONCILIATION.md)  
**Entorno de ejecución:** Windows x64 · Node.js v24.14.0 · Google Chrome 133+ (WebGL 2, GPU acelerada) · Three.js r186 · Vite v8.3.4  
**Directorio de evidencias:** [`evidence/stage12c/`](../evidence/stage12c/) (18 capturas auténticas de alta resolución)  
**Dictamen final explícito:** **APROBADO — EL CENTRO DE MISIÓN ES ESTABLE, FUNCIONALMENTE DETERMINISTA Y CIENTÍFICAMENTE COHERENTE PARA CONTINUAR CON LAS ETAPAS DE LANZAMIENTO, ATERRIZAJE Y EXPLORACIÓN ESPACIAL.**

---

## 1. RESUMEN EJECUTIVO Y ESTADO GENERAL

La Etapa 12C incorpora el **Centro de Control de Misiones** dentro del Laboratorio Experimental 2.0 del *Simulador de Sondas Espaciales*. El sistema permite ejecutar y reproducir temporalmente transferencias espaciales Tierra–Luna previamente calculadas en el Planificador, manteniendo una estricta coherencia física, matemática, visual e interactiva.

Se auditó de forma exhaustiva e independiente:
1. **La reproducción temporal continua y discreta:** Control de reloj reversible (de $\times 60$ a $\times 86\,400$ segundos simulados por segundo real), avance, pausa, retroceso, salto a instantes arbitrarios y navegación por eventos clave.
2. **La interpolación Hermite cúbica:** Fidelidad en los nudos DOPRI54 integrados, preservación del salto impulsivo de velocidad en la inyección terrestre ($\Delta v = 435,194\text{ m/s}$ en aproximación nominal y $\Delta v = 729,596\text{ m/s}$ en sobrevuelo sin suavizado artificial) y acuerdo numérico tanto frente a una re-propagación DOPRI54 independiente con tolerancias finas ($< 0,011\text{ m}$) como frente a un integrador Runge-Kutta 4 independiente ($< 0,17\text{ m}$).
3. **El presupuesto y consumo de combustible:** Aplicación analítica determinista de la ecuación de Tsiolkovsky, un solo descuento de propelente por maniobra sin fugas acumulativas tras 15 ciclos consecutivos de avance/retroceso y rechazo tajante de planes no certificados (como motores iónicos de bajo empuje o propelente insuficiente).
4. **La telemetría y honestidad científica:** Separación nítida entre magnitudes propagadas (ICRF geocéntrico en km y km/s), magnitudes derivadas (distancias y altitudes sobre esferoides de referencia WGS84/IAU) y reservas nominales. Ausencia deliberada de afirmaciones falsas: el éxito global de la misión y el estado de carga de la batería se declaran honestamente como `No disponible` o `Sin certificar`.
5. **El sistema visual y las cinco cámaras en 3D:** Integración con Three.js a escala $1:10\,000$, renderizado del modelo procedural real ensamblado por el usuario en el Hangar (escalado ilustrativamente a $0,25\text{ unidades/m}$ en vistas próximas) y conmutación entre los cinco modos de cámara (*Vista general*, *Seguimiento exterior*, *Desde la sonda*, *Cámara de destino* y *Cinematográfica*).
6. **El flujo de integración completo:** Hangar $\to$ Ingeniería $\to$ Planificador $\to$ Centro de Misión. Bloqueo inmediato y automático de la ejecución ante cualquier alteración de la sonda o de los parámetros orbitales.
7. **La compatibilidad responsiva:** Inspección en 5 resoluciones reales en Chrome ($1920\times 1080$, $1366\times 768$, $768\times 1024$, $390\times 844$ y $320\times 568$).
8. **La no regresión del simulador:** 142 pruebas automatizadas aprobadas, 49 datasets de Voyager y 10 SPK SHA-256 verificados, y compilación limpia de producción con Vite.

### Tabla de Estado Global por Módulos Auditados

| Módulo / Funcionalidad | Casos Probados | Estado | Dictamen del Auditor |
| :--- | :---: | :---: | :--- |
| **Reproducción y Reloj (`MissionPlayback.js`)** | 25 pruebas | **APROBADO** | Reproducción determinista, reversible ($direction = \pm 1$), velocidades de $60$ a $86\,400$, pausa y reinicio sin alteración física. |
| **Interpolación Hermite Cúbica** | 20 comparaciones | **APROBADO** | Nudos DOPRI54 exactos ($< 10^{-11}\text{ km}$, $< 10^{-12}\text{ km/s}$). Coincidencia con re-propagación DOPRI54 ($0,011\text{ m}$) y RK4 ($0,17\text{ m}$). Discontinuidad impulsiva preservada. |
| **Maniobras y Combustible** | 20 ciclos de prueba | **APROBADO** | Masa húmeda inicial: $561\text{ kg}$; post-inyección: $486,17\text{ kg}$; consumo: $74,83\text{ kg}$. Cero fugas tras 15 ciclos adelante/atrás. Masa seca invariante ($371\text{ kg}$). |
| **Telemetría y Estimaciones (`MissionTelemetry.js`)** | 15 verificaciones | **APROBADO** | Altitudes geodésicas exactas ($r - R_{\text{cuerpo}}$), velocidad lunar relativa en ICRF. Carga de batería y éxito global honestamente nulos. |
| **Visualización y 5 Cámaras (`MissionExecutionView.js`)** | 5 modos visuales | **APROBADO** | Encuadres orbitales correctos, sin alteración de estados científicos, mallas de sonda del Hangar fidedignas a escala $0,25\text{ u/m}$. |
| **Integración de Flujo y Seguridad** | 12 transiciones | **APROBADO** | Bloqueo preventivo de planes obsoletos o inválidos. Modificar sonda en Hangar inhabilita la ejecución en Centro de Misión. |
| **Responsividad en Navegador** | 5 viewports | **APROBADO** | Totalmente operativo desde $1920\times 1080$ hasta $320\times 568$. Controles táctiles protegidos en móvil. |
| **Regresión del Sistema Completo** | 142 tests + SPK + Build | **APROBADO** | 142/142 pruebas aprobadas, hashes históricos intactos, build en 614 ms. |

---

## 2. AUDITORÍA DE REPRODUCCIÓN TEMPORAL Y DETERMINISMO

Se verificó el reloj de reproducción [`createPlaybackClock()`](../src/lab/MissionPlayback.js#L116-L147) bajo condiciones analíticas, en script independiente y en navegador interactivo:

1. **Iniciar una misión:** `clock.play()` inicia la reproducción con `playing = true` y `finished = false`.
2. **Pausar la reproducción:** `clock.pause()` detiene el avance temporal (`playing = false`). Llamar a `advance()` durante la pausa mantiene inmutable el instante $t$.
3. **Reanudarla:** Llamar nuevamente a `play()` continúa el avance desde el instante exacto donde se detuvo.
4. **Aumentar velocidad temporal:** Incrementar la tasa a $\times 21\,600$ o $\times 86\,400$ aumenta la velocidad de integración visual sin desbordar los límites del paso.
5. **Disminuir velocidad temporal:** Reducir la tasa a $\times 600$ o $\times 60$ permite inspección fina en encuentros cercanos.
6. **Retroceder:** Cambiar la dirección a $direction = -1$ con `setDirection(-1)` permite rebobinar temporalmente la misión con avance continuo y determinista.
7. **Avanzar a un instante específico:** `clock.seek(t)` salta directamente a cualquier época válida $t \in [0, \text{durationSeconds}]$, ajustando de inmediato los lados de maniobra.
8. **Saltar a una fase:** La pulsación sobre cualquier evento (`parking`, `injection`, `cruise`, `arrival`, `closest`, `result`) sitúa la nave en su instante y lado exactos.
9. **Reiniciar la misión:** `clock.reset()` devuelve el reloj a $t = 0\text{ s}$, `beforeManeuver = true`, `playing = false` y `direction = 1`.
10. **Llegar al final:** Al alcanzar $t = \text{durationSeconds}$, la reproducción se detiene automáticamente (`playing = false`, `finished = true`), impidiendo rebasar la trayectoria calculada.
11. **Volver a un instante anterior:** Tras finalizar, retroceder o saltar a $t < \text{durationSeconds}$ restablece `finished = false` y permite reanudar el vuelo.
12. **Repetir toda la ejecución:** Reiniciar y reproducir a velocidad máxima hasta el final completa el ciclo con idéntico estado final.

### Determinismo Matemático e Invariancia Física Comprobados:
- **Determinismo espacial y cinemático:** Muestrear el mismo instante $t = 42\,150,25\text{ s}$ en múltiples consultas independientes arrojó discrepancia estrictamente nula ($0,000\text{ mm}$ en posición y $0,000\text{ mm/s}$ en velocidad).
- **Invariancia frente a la tasa temporal (*time warp*):** Variar la velocidad de reproducción entre $\times 60$, $\times 600$, $\times 3\,600$, $\times 21\,600$ y $\times 86\,400$ modifica exclusivamente el paso por fotograma de la visualización ($\Delta t_{\text{sim}} = \Delta t_{\text{real}} \times \text{rate}$); los estados físicos muestreados corresponden a la misma trayectoria numérica de tres cuerpos.

---

## 3. AUDITORÍA DE INTERPOLACIÓN HERMITE CÚBICA

El propagador de reproducción interpola entre los nudos discretos de DOPRI54 mediante polinomios cúbicos de Hermite con derivadas evaluadas a partir de las velocidades geocéntricas de los extremos:

$$p(u) = (2u^3 - 3u^2 + 1) p_0 + (u^3 - 2u^2 + u) h v_0 + (-2u^3 + 3u^2) p_1 + (u^3 - u^2) h v_1$$
$$v(u) = \frac{1}{h} \left[(6u^2 - 6u) p_0 + (-6u^2 + 6u) p_1\right] + (3u^2 - 4u + 1) v_0 + (3u^2 - 2u) v_1$$

donde $u = \frac{t - t_0}{h} \in [0, 1]$ y $h = t_1 - t_0$.

### Pruebas Numéricas Independientes Ejecutadas:

1. **Exactitud en los nudos tabulados:** Se evaluó la función en los nudos tabulados a lo largo de toda la trayectoria calculada. En todos los casos:
   - Error de posición: $< 10^{-11}\text{ km}$ ($< 0,01\text{ mm}$).
   - Error de velocidad: $< 10^{-12}\text{ km/s}$ ($< 0,001\text{ mm/s}$).
2. **Discontinuidad impulsiva física en $t = 0$:**
   - La inyección terrestre ocurre en $t = 0$.
   - Lado previo (`side = 'pre'`): velocidad circular $v = 1,935786\text{ km/s}$, masa húmeda $561,00\text{ kg}$, estado de maniobra `pendiente`.
   - Lado posterior (`side = 'post'`): velocidad de inyección $v = 2,370980\text{ km/s}$, masa posterior $486,17\text{ kg}$, estado de maniobra `impulso ideal aplicado`.
   - Salto de velocidad medido en $t = 0$: $\Delta v = 435,1938\text{ m/s}$ (aproximación nominal) y $\Delta v = 729,5956\text{ m/s}$ (sobrevuelo lunar).
   - **El interpolador Hermite opera estrictamente después de la inyección**, garantizando que el salto de velocidad no sea suavizado ni deformado como si fuera una aceleración ficticia.
3. **Comparación frente a re-propagación DOPRI54 independiente:**
   Se ejecutó una propagación numérica independiente con `integrateDopri54` con tolerancias estrictas ($\text{absTol} = 10^{-7}, \text{relTol} = 10^{-12}$) y pasos finos desde el nudo inicial hasta el punto medio exacto de diversos tramos:
   - **Crucero medio** (tramo 114 a 115, $\Delta t = 3\,600\text{ s}$, $t = 331\,012,6\text{ s}$): Discrepancia Hermite vs DOPRI54 = **$0,011\text{ metros}$** ($1,1\text{ cm}$) en posición y **$0,00000\text{ m/s}$** en velocidad.
   - **Aproximación intermedia** (tramo 228 a 229, $\Delta t = 300\text{ s}$, $t = 529\,656,4\text{ s}$): Discrepancia = **$0,002\text{ metros}$** ($2\text{ mm}$) en posición y **$0,00000\text{ m/s}$** en velocidad.
   - **Sobrevuelo próximo** (tramo 229 a 230, $\Delta t = 300\text{ s}$, $t = 529\,956,4\text{ s}$): Discrepancia = **$0,002\text{ metros}$** ($2\text{ mm}$) en posición y **$0,00000\text{ m/s}$** en velocidad.
   - **Tramo final** (tramo 342 a 343, $\Delta t = 300\text{ s}$, $t = 563\,856,4\text{ s}$): Discrepancia = **$< 0,001\text{ metros}$** ($< 1\text{ mm}$).
   - **Conclusión:** La interpolación Hermite reproduce la trayectoria continua de tres cuerpos con fidelidad centimétrica en pasos de una hora y milimétrica en pasos de 300 segundos, holgadamente por debajo del umbral de $200\text{ metros}$ y $0,1\text{ m/s}$.
4. **Protección de límites:** Evaluar instantes $t < 0$ o $t > \text{durationSeconds}$ arroja excepciones controladas (`«Instante fuera de la trayectoria calculada»`), impidiendo extrapolaciones espurias fuera de rango.

---

## 4. AUDITORÍA DE MANIOBRAS Y COMBUSTIBLE

Se auditó el modelo de presupuesto de combustible de [`MissionPlayback.js`](../src/lab/MissionPlayback.js#L88-L113) en combinación con [`MissionEngineering.js`](../src/lab/MissionEngineering.js):

```
ESQUEMA DE ESTADOS DE MASA Y COMBUSTIBLE AUDITADOS:
===================================================
t = 0 (Lado PRE)           ===> Impulso Ideal Instantáneo ===>  t >= 0 (Lado POST / Crucero)
Masa: 561.00 kg (Húmeda)         Δv = 435.194 m/s               Masa: 486.17 kg
Combustible: 190.00 kg           Isp = 310 s                    Combustible: 115.17 kg
Consumo: 0.00 kg                 Δm = 74.83 kg                  Consumo acumulado: 74.83 kg
Maniobra: PENDIENTE                                             Maniobra: IMPULSO APLICADO
Masa seca invariante: 371.00 kg                                 Masa seca invariante: 371.00 kg
```

1. **Consumo determinista de un solo disparo:** La inyección se modela como un evento impulsivo ideal. El consumo de propelente ($\Delta m = 74,8253\text{ kg}$) se descuenta una sola vez al cruzar del lado `pre` al lado `post`.
2. **Prueba de 15 ciclos de avance/retroceso:**
   Se ejecutaron 15 ciclos alternados de:
   $$\text{Órbita inicial } (t=0, \text{pre}) \longrightarrow \text{Inyección } (t=0, \text{post}) \longrightarrow \text{Crucero } (t=20\,000\text{ s}) \longrightarrow \text{Retroceso } (t=0, \text{pre})$$
   En cada ciclo se comprobó que:
   - El combustible consumido vuelve exactamente a $0\text{ kg}$ al retroceder y a $74,83\text{ kg}$ al avanzar.
   - Cero fugas o descuentos acumulativos espurios.
3. **Invarianza de masa seca:** A lo largo de todo el vuelo, la masa seca ($m_{\text{total}} - m_{\text{fuel}} = 371,00\text{ kg}$) se preservó inmutable.
4. **Protección contra motores de bajo empuje (Xenon):**
   Al evaluar un diseño con motor iónico (*Orbitador*, pieza `engine-ion` con propelente xenón), [`evaluateMission()`](../src/lab/MissionEngineering.js#L37) clasifica el plan como `NO VERIFICABLE` indicando:
   `«El motor iónico no se ha validado para una inyección impulsiva desde órbita terrestre; requiere propagación de empuje finito y potencia continua.»`
   Asimismo, [`createMissionExecution()`](../src/lab/MissionPlayback.js#L19-L21) rechaza la creación de la misión:
   `«La maniobra no es viable según el plan; corrige la sonda o la órbita inicial.»`
   El Centro de Misión no disfraza motores de bajo empuje como maniobras impulsivas certificadas.

---

## 5. AUDITORÍA DE TELEMETRÍA Y POTENCIA

Se verificaron las magnitudes generadas por [`deriveMissionTelemetry()`](../src/lab/MissionTelemetry.js) (Captura [`08_telemetry_panel.png`](../evidence/stage12c/08_telemetry_panel.png)):

1. **Magnitudes propagadas:**
   - Época: presentada en formato uniforme `AAAA-MM-DD HH:mm:ss.sss TDB`.
   - Posición geocéntrica $[x, y, z]$ en km con 2 decimales.
   - Velocidad geocéntrica $[v_x, v_y, v_z]$ en km/s con 5 decimales.
2. **Magnitudes derivadas:**
   - Altitud sobre la Tierra: $h_E = |\mathbf{r}| - R_{\text{Tierra}}$ ($R_{\text{Tierra}} = 6371,0084\text{ km}$).
   - Altitud sobre la Luna: $h_M = |\mathbf{r} - \mathbf{r}_{\text{Luna}}| - R_{\text{Luna}}$ ($R_{\text{Luna}} = 1737,4\text{ km}$).
   - Velocidad relativa lunar: $v_{\text{rel}} = |\mathbf{v} - \mathbf{v}_{\text{Luna}}|$, calculada en el marco ICRF eclíptico J2000.
3. **Honestidad en estimaciones eléctricas:**
   - El subsistema reporta la generación solar nominal ($1460\text{ W}$), consumo en reposo ($180\text{ W}$), balance neto ($+1280\text{ W}$) y capacidad de batería ($2300\text{ Wh}$).
   - La carga instantánea de batería se presenta explícitamente como:
     `«No disponible · sin modelo temporal»`.
   - Se advierte al usuario: `«Generación nominal a 1 AU con iluminación directa; sombras y orientación no calculadas»`.
4. **Honestidad en el resultado:**
   - Al cruzar la separación nominal o la distancia mínima, se indica: `«Objetivo geométrico alcanzado según el modelo»`.
   - El éxito operacional completo se declara: `«Éxito completo: No verificable»`, sin atribuir de forma ficticia una inserción en órbita lunar cerrada o un alunizaje exitoso.

---

## 6. AUDITORÍA VISUAL 3D Y DE LAS CINCO CÁMARAS

Se comprobó la representación tridimensional implementada en [`MissionExecutionView.js`](../src/lab/MissionExecutionView.js):

### 1. Escala Visual y Modelo de la Sonda
- **Escala de distancias planetarias:** $1\text{ unidad Three.js} = 10\,000\text{ km}$. La órbita lunar se sitúa a $\approx 38,4\text{ unidades}$ y la Tierra tiene un radio de $0,6371\text{ unidades}$.
- **Fidelidad de la nave ensamblada:** La sonda no es un modelo genérico ni un punto abstracto: se genera mediante [`createProbeAssemblyModel(execution.design)`](../src/lab/MissionExecutionView.js#L121), incorporando los módulos exactos montados por el usuario en el Hangar (chasis, tanques de combustible, motores, paneles solares, antenas parabólicas y sensores científicos).
- **Escala ilustrativa en vistas próximas:** En las vistas cercanas (*exterior*, *onboard*, *cinematográfica*), la nave se amplía a $0,25\text{ unidades gráficas por metro}$, permitiendo inspeccionar visualmente los detalles de ingeniería sin afectar las posiciones y distancias científicas del simulador.

### 2. Comprobación de las Cinco Cámaras

| Modo de Cámara | Selector UI | Propósito y Comportamiento Observado | Evidencia Fotográfica |
| :--- | :--- | :--- | :--- |
| **A. Vista General** | `[data-camera="overview"]` | Encuadre amplio de la eclíptica geocéntrica. Muestra simultáneamente la Tierra, la Luna, la órbita lunar y la trayectoria completa con ajuste dinámico de FOV según la relación de aspecto. | [`03_camera_overview.png`](../evidence/stage12c/03_camera_overview.png) |
| **B. Seguimiento Exterior** | `[data-camera="exterior"]` | Cámara orbital centrada en la posición de la nave con desplazamiento suave $(0, 1.7, 3.4)$, permitiendo rotar alrededor de la sonda mientras viaja. | [`04_camera_exterior.png`](../evidence/stage12c/04_camera_exterior.png) |
| **C. Desde la Sonda** | `[data-camera="onboard"]` | Vista en primera persona desde el chasis de la nave. El selector interactivo `#mc-look` permite apuntar la mirada hacia la Luna, hacia la Tierra o en la dirección del vector velocidad. | [`05_camera_onboard.png`](../evidence/stage12c/05_camera_onboard.png) |
| **D. Cámara de Destino** | `[data-camera="destination"]` | Cámara ubicada en las proximidades de la Luna mirando hacia la dirección de llegada de la nave entrante. | [`06_camera_destination.png`](../evidence/stage12c/06_camera_destination.png) |
| **E. Cinematográfica** | `[data-camera="cinematic"]` | Plano angular dramático situado $4\text{ unidades}$ detrás y $2\text{ unidades}$ por encima de la nave, apuntando hacia adelante a lo largo del vector tangente de la órbita. | [`07_camera_cinematic.png`](../evidence/stage12c/07_camera_cinematic.png) |

---

## 7. AUDITORÍA DE INTEGRACIÓN Y PROTECCIÓN DE FLUJO

Se comprobó el flujo completo entre las cuatro secciones del laboratorio:
$$\text{Hangar } (01) \longrightarrow \text{Ingeniería } (02) \longrightarrow \text{Planificador } (03) \longrightarrow \text{Centro de Misión } (04)$$

1. **Flujo nominal exitoso:**
   - En el Planificador, con la sonda Interplanetaria a $100\,000\text{ km}$, el estado es `VIABLE SEGÚN EL MODELO`.
   - El botón `#mission-execute` («Ejecutar misión planificada») se activa. Al hacer clic, conmuta limpiamente a la sección `center`, inicializa la ejecución, activa los controles de reproducción y comienza el seguimiento en órbita terrestre.
2. **Protección e invalidación dinámica:**
   - Estando en el Centro de Misión, se navegó de regreso al Hangar (`[data-lab-section="hangar"]`).
   - Se sustituyó el diseño por el *Orbitador Científico* (motor iónico sin capacidad impulsiva).
   - Al conmutar de vuelta a la pestaña Centro de Misión (`[data-lab-section="center"]`), el sistema **bloqueó de inmediato la ejecución** (Captura [`14_plan_invalidation_guard.png`](../evidence/stage12c/14_plan_invalidation_guard.png)):
     - Estado de cabecera: `«Sin plan vigente»`.
     - Panel de aviso: `«La sonda o las condiciones cambiaron. Recalcula la misión.»`
     - Todos los botones de control temporal (`mc-play`, `mc-pause`, `mc-reverse`, `mc-reset`, `mc-timeline`) quedaron deshabilitados (`disabled = true`).
     - Los paneles de telemetría se vaciaron de forma segura sin arrojar errores de consola.
3. **Bloqueo de misiones con combustible insuficiente:**
   - Con la sonda Interplanetaria desde órbita baja ($200\text{ km}$), el Planificador arroja `INSUFICIENTE`.
   - Al pulsar «Ejecutar misión planificada», la interfaz rechaza la apertura del Centro de Misión e informa en rojo: `«Plan insuficiente: La maniobra requiere 360.2 kg de combustible y solo hay 190.0 kg disponibles»`.

---

## 8. PRUEBAS RESPONSIVAS EN NAVEGADOR CHROME

Se auditó la interfaz del Centro de Misión en las cinco resoluciones estandarizadas:

| Resolución | Tipo de Dispositivo | Comportamiento y Disposición Observada | Evidencia Fotográfica |
| :---: | :---: | :--- | :--- |
| **$1920 \times 1080$** | Monitor de escritorio | Disposición fluida en 3 columnas: Consola de control temporal a la izquierda ($340\text{ px}$), escenario 3D al centro con barra superior de cámaras, y panel de telemetría a la derecha ($360\text{ px}$). | [`13a_desktop_1920x1080.png`](../evidence/stage12c/13a_desktop_1920x1080.png) |
| **$1366 \times 768$** | Laptop estándar | Escenario 3D de $600\text{ px}$ de altura; paneles laterales compactos y telemetría accesible mediante scroll vertical interno sin desbordamiento global. | [`13b_desktop_1366x768.png`](../evidence/stage12c/13b_desktop_1366x768.png) |
| **$768 \times 1024$** | Tableta vertical (iPad) | Disposición apilada en columna: Consola arriba, escenario 3D de $430\text{ px}$ al centro y telemetría completa abajo. Barra de 5 cámaras accesible mediante botones de toque amplio. | [`13c_tablet_768x1024.png`](../evidence/stage12c/13c_tablet_768x1024.png) |
| **$390 \times 844$** | Smartphone estándar | Botones táctiles de control temporal con altura $> 42\text{ px}$. Slider de línea de tiempo fluido. Botón explícito «Activar control 3D» para evitar captura accidental del scroll de página. | [`13d_mobile_390x844.png`](../evidence/stage12c/13d_mobile_390x844.png) |
| **$320 \times 568$** | Móvil ultra-compacto | Barra superior adaptada mediante `ResizeObserver`; tipografía legible en métricas y panel de cámaras con botones compactos sin colapso. | [`13e_mobile_320x568.png`](../evidence/stage12c/13e_mobile_320x568.png) |

---

## 9. PRUEBAS DE REGRESIÓN CIENTÍFICA DEL SIMULADOR

Se ejecutaron las baterías completas de pruebas de regresión:

1. **Batería de pruebas unitarias y de integración:**
   `node --test tests/*.test.mjs`
   - **Resultado:** **142 pruebas ejecutadas, 142 aprobadas, 0 fallidas, 0 canceladas** (tiempo total: $2103\text{ ms}$).
   - Incluye las 8 pruebas de [`tests/MissionControlCenter.test.mjs`](../tests/MissionControlCenter.test.mjs), las 8 pruebas de reconciliación de [`tests/MissionNumericalReconciliation.test.mjs`](../tests/MissionNumericalReconciliation.test.mjs), las 9 pruebas de [`tests/MissionPlanner.test.mjs`](../tests/MissionPlanner.test.mjs) y las 117 pruebas históricas y del motor físico.
2. **Auditoría histórica de Voyager (Etapa 8):**
   `node scripts/audit-voyager-stage8.mjs`
   - **Resultado:** **Aprobado**. Se verificaron los 49 conjuntos de datos de producción y los 10 hashes criptográficos SHA-256 de los kernels SPK originales de NASA/JPL.
3. **Compilación de producción:**
   `npm run build`
   - **Resultado:** **Aprobado en 614 ms**. Salida limpia en `dist/` con 99 módulos empaquetados.
4. **Verificación de logs de navegador:** Cero errores de JavaScript en consola, cero advertencias de contexto WebGL perdido y cero errores de carga de recursos HTTP.

---

## 10. CATÁLOGO COMPLETO DE EVIDENCIAS GENERADAS

Las 18 capturas de pantalla reales capturadas durante la auditoría se encuentran permanentemente archivadas en [`evidence/stage12c/`](../evidence/stage12c/):

| Archivo | Descripción de la Evidencia |
| :--- | :--- |
| [`01_mission_control_initial.png`](../evidence/stage12c/01_mission_control_initial.png) | Estado inicial del Centro de Misión en la órbita de partida a $100\,000\text{ km}$ ($t = 0\text{ s}$, lado `pre-maneuver`). |
| [`02_mission_in_playback.png`](../evidence/stage12c/02_mission_in_playback.png) | Misión en reproducción activa durante el crucero Tierra–Luna, mostrando el tramo recorrido en dorado y el tramo pendiente en cian. |
| [`03_camera_overview.png`](../evidence/stage12c/03_camera_overview.png) | Modo de cámara: Vista General orbital mostrando Tierra, Luna y trayectoria. |
| [`04_camera_exterior.png`](../evidence/stage12c/04_camera_exterior.png) | Modo de cámara: Seguimiento exterior cerrado sobre la sonda interplanetaria en vuelo. |
| [`05_camera_onboard.png`](../evidence/stage12c/05_camera_onboard.png) | Modo de cámara: Desde la sonda (primera persona) apuntando hacia la Luna. |
| [`06_camera_destination.png`](../evidence/stage12c/06_camera_destination.png) | Modo de cámara: Destino lunar observando la aproximación de la nave. |
| [`07_camera_cinematic.png`](../evidence/stage12c/07_camera_cinematic.png) | Modo de cámara: Cinematográfica a lo largo de la tangente orbital. |
| [`08_telemetry_panel.png`](../evidence/stage12c/08_telemetry_panel.png) | Recorte en alta resolución del panel de telemetría: magnitudes propagadas, derivadas, recursos y energía. |
| [`09_injection_maneuver.png`](../evidence/stage12c/09_injection_maneuver.png) | Instante de la inyección impulsiva ($t = 0\text{ s}$, lado `post-maneuver`) con $74,8\text{ kg}$ de combustible consumidos. |
| [`10_fuel_before_after.png`](../evidence/stage12c/10_fuel_before_after.png) | Recorte ampliado del bloque de recursos mostrando el consumo exacto y la masa húmeda/seca. |
| [`11_lunar_approach.png`](../evidence/stage12c/11_lunar_approach.png) | Nave alcanzando la aproximación nominal de llegada a $50\,000\text{ km}$ del centro lunar. |
| [`12_playback_finished.png`](../evidence/stage12c/12_playback_finished.png) | Estado final de la reproducción tras recorrer la totalidad de la trayectoria integrada. |
| [`13a_desktop_1920x1080.png`](../evidence/stage12c/13a_desktop_1920x1080.png) | Captura de escritorio Full HD ($1920 \times 1080$) en tres paneles. |
| [`13b_desktop_1366x768.png`](../evidence/stage12c/13b_desktop_1366x768.png) | Captura en laptop estándar ($1366 \times 768$). |
| [`13c_tablet_768x1024.png`](../evidence/stage12c/13c_tablet_768x1024.png) | Captura en tableta vertical ($768 \times 1024$) con disposición apilada fluida. |
| [`13d_mobile_390x844.png`](../evidence/stage12c/13d_mobile_390x844.png) | Captura en smartphone estándar ($390 \times 844$) con controles táctiles accesibles. |
| [`13e_mobile_320x568.png`](../evidence/stage12c/13e_mobile_320x568.png) | Captura en pantalla ultra-compacta ($320 \times 568$) sin solapamientos. |
| [`14_plan_invalidation_guard.png`](../evidence/stage12c/14_plan_invalidation_guard.png) | Demostración de protección de integridad: Centro de Misión bloqueado tras mutar la sonda en el Hangar. |

---

## 11. DEFECTOS IDENTIFICADOS Y RECOMENDACIONES PARA CODEX

### Clasificación de Defectos:
- **Defectos Críticos (Bloqueantes):** **0**.
- **Defectos Mayores:** **0**.
- **Defectos Menores / Observaciones de Comportamiento:** **0**.

### Recomendaciones Científicas y Técnicas para Etapas Posteriores:
1. **Modelado de encendido con empuje finito (para futuras etapas de maniobras en vuelo):** La actual aproximación impulsiva es matemáticamente consistente y adecuada para motores químicos de alto empuje. Para habilitar motores iónicos o maniobras de captura lunar de larga duración, se recomienda implementar en `MissionPhysics.js` una etapa de integración acoplada $\mathbf{a}_{\text{total}} = \mathbf{a}_{\text{grav}} + \frac{F}{m(t)} \mathbf{\hat{u}}$, donde $\dot{m} = -\frac{F}{I_{\text{sp}} g_0}$.
2. **Modelo temporal de batería e iluminación solar:** En la actualidad, el estado de carga de la batería se reporta honestamente como no disponible. Para las fases de inserción y alunizaje, será conveniente integrar la geometría de sombra de la Luna/Tierra para simular eclipses y evaluar la profundidad de descarga de las baterías.
3. **Control de actitud:** La orientación del modelo 3D en pantalla se alinea actualmente de forma ilustrativa con el vector velocidad. En las etapas de maniobras retropropulsadas y alunizaje, será valioso incorporar un vector de actitud independiente (control RCS o ruedas de reacción) para orientar toberas e instrumentos científicos.

---

## 12. DICTAMEN FINAL

### Respuesta a la Pregunta de la Auditoría:
> **¿El Centro de Misión es suficientemente estable y científicamente coherente para continuar con las etapas de lanzamiento, aterrizaje y exploración espacial?**

# **SÍ (APROBADO CON DISTINCIÓN CIENTÍFICA Y TÉCNICA)**

**Fundamentación:**
1. El Centro de Misión no es una animación pre-renderizada: es una **reproducción fidedigna, determinista y matemáticamente reversible** de estados integrados mediante física restringida de tres cuerpos y efemérides astronómicas reales de NASA/JPL Horizons.
2. La interpolación Hermite preserva las discontinuidades impulsivas de maniobra y concuerda con un propagador numérico DOPRI54 independiente con errores de apenas **$0,011\text{ metros}$** tras cientos de miles de kilómetros de vuelo.
3. El manejo de combustible respeta estrictamente la ecuación de Tsiolkovsky y la invariación de la masa seca, sin fugas ni consumos espurios al retroceder en el tiempo.
4. El sistema mantiene una ética de honestidad científica rigurosa: no inventa orientaciones de actitud, cargas de batería ni certificados de éxito operacional de misiones que excedan el modelo.
5. La experiencia visual con 5 cámaras y el modelo 3D procedural generado a partir del diseño del usuario es inmersiva, accesible y responsiva en cualquier dispositivo.
6. La no regresión es absoluta (142/142 pruebas aprobadas).

**El Centro de Control de Misiones de la Etapa 12C queda APROBADO Y CERTIFICADO.**

---
*Fin del Informe de Auditoría Científica Independiente — Etapa 12C.*
