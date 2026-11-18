# INFORME FINAL DE AUDITORÍA INDEPENDIENTE — ETAPA 12A.1
## VERIFICACIÓN DE CORRECCIONES DEL LABORATORIO EXPERIMENTAL 2.0 (CONSTRUCTOR MODULAR DE SONDAS)

---

**Fecha de auditoría:** 16 de noviembre de 2026  
**Auditor:** Agente Independiente de Auditoría (DeepMind Advanced Agentic AAC)  
**Documento base de Codex:** `docs/STAGE12A1_CORRECTIONS.md`  
**Auditoría previa de referencia:** `docs/STAGE12A_INDEPENDENT_AUDIT.md`  
**Entorno de pruebas:** Windows x64 · Node.js v24.14.0 · Google Chrome 133+ (WebGL 2, GPU acelerada) · Three.js r186 · Vite v8.3.4  
**Directorio de evidencias:** `evidence/stage12a1/`  
**Dictamen final para inicio de Etapa 12B:** **APROBADO — SISTEMA ESTABLE Y LISTO PARA LA ETAPA 12B**

---

## 1. RESUMEN EJECUTIVO Y TABLA DE ESTADO DE LOS OCHO DEFECTOS

Se auditó de forma exhaustiva la implementación de correcciones realizada por Codex en respuesta al informe `docs/STAGE12A_INDEPENDENT_AUDIT.md`. Se ejecutaron verificaciones matemáticas analíticas, inspecciones geométricas tridimensionales en mallas instanciadas, pruebas interactivas en navegador Chrome en 5 resoluciones reales y pruebas de regresión completas del simulador.

Los ocho defectos detectados en la Etapa 12A fueron resueltos en su totalidad, demostrándose matemáticamente y visualmente la efectividad de cada solución:

| Código | Defecto Original | Estado tras Etapa 12A.1 | Resumen de la Verificación | Evidencia Fotográfica |
| :---: | :--- | :---: | :--- | :--- |
| **DEF-01** | Tobera del motor más baja que las patas en el explorador lunar | **CORREGIDO** | Almohadillas descienden a $y = -2,080\text{ m}$; tobera en $y = -1,959\text{ m}$. Holgura positiva verificada de **$+12,10\text{ cm}$**. Rejilla reubicada a $y = -2,12\text{ m}$. | `01_def01_landing_clearance_after.png` |
| **DEF-02** | Bloqueo al sustituir motores con propelente incompatible | **CORREGIDO** | `planPartChange` detecta conflictos y despliega grupo interactivo con opciones atómicas de reemplazo compatible, retiro o cancelación sin mutar el diseño original. | `02_def02_propellant_replacement_dialog.png`<br>`02b_def02_propellant_replaced_after.png` |
| **DEF-03** | Distribución de escritorio comprimida en tabletas (768 px) | **CORREGIDO** | Breakpoint ampliado a `@media(max-width:820px)`. En 768×1024 activa la disposición vertical con visor 3D de ancho completo y paneles legibles. | `03_def03_tablet_768x1024_after.png` |
| **DEF-04** | Separación flotante de cámara y penetración de tanque | **CORREGIDO** | Mástil de cámara puentea separación de $8,3\text{ cm}$; collar de tanque visible une el depósito externo ($5,8\text{ cm}$ de luz) penetrando en el casco. | `04_def04_camera_and_tank_mounts_after.png` |
| **DEF-05** | Captura involuntaria de gestos táctiles en móvil | **CORREGIDO** | Dispositivos táctiles inician en `touch-action: pan-y` con OrbitControls inactivo. Botón explícito «Activar control 3D» alterna entre scroll y cámara 3D. | `05_def05_mobile_touch_toggle_after.png` |
| **DEF-06** | Solapamiento de cabecera en pantallas de 320 px | **CORREGIDO** | `ResizeObserver` dinámico mide el borde inferior real de la barra de navegación partida y fija `--lab-top: 104px` con holgura neta de $8\text{ px}$. | `06_def06_mobile_320x568_after.png` |
| **DEF-07** | Fugas residuales y falta de remoción del canvas en `dispose()` | **CORREGIDO** | `dispose()` elimina listeners, desconecta observers, destruye OrbitControls, texturas/materiales, fuerza pérdida de contexto y llama a `renderer.domElement.remove()`. 30 ciclos estables sin acumulación. | Medición heap $35,6\text{ MB}$, cero fugas |
| **DEF-08** | Pestaña «Experimental» desincronizada en navegación | **CORREGIDO** | `HistoricalModeControls.js` observa `data-app-mode` mediante MutationObserver, manteniendo `aria-pressed="true"` en la pestaña correspondiente. | `08_def08_navigation_active_tab_after.png` |

---

## 2. VERIFICACIÓN DETALLADA DE CADA DEFECTO

### DEF-01 — Tren de Aterrizaje y Holgura de la Tobera
- **Comprobación analítica y geométrica:** Se ejecutó la medición real con `THREE.Box3` sobre las mallas con transformaciones mundiales aplicadas (`measureLandingClearance`):
  - Base de la tobera del motor químico (`engineBottomY`): **$-1,9590\text{ m}$**.
  - Base de las cuatro almohadillas de aterrizaje (`padBottomY`): **$-2,0800\text{ m}$**.
  - **Holgura neta calculada:** $\Delta y = -1,9590 - (-2,0800) = \mathbf{+0,1210\text{ m} \ (+12,10\text{ cm})}$.
- **Inspección visual:** En `evidence/stage12a1/01_def01_landing_clearance_after.png`, los cuatro platos dorados de apoyo descansan en el plano horizontal de contacto, mientras la tobera queda suspendida $12,1\text{ cm}$ por encima. La rejilla de referencia fue reubicada a $y = -2,12\text{ m}$, quedando debajo de las patas.
- **Resultado:** **CORREGIDO**.

```
ESQUEMA DE COTAS DEL CONJUNTO DE DESCENSO (EJE Y):
==================================================
  (y = -1.260 m) [Plataforma de descenso - Ranura landing]
  (y = -1.449 m) [Ranura axial del motor]
  (y = -1.959 m) [Borde inferior de la tobera del motor químico]
        |
        |  <--- Holgura libre verificada: 12.1 cm (+0.121 m)
        v
  (y = -2.080 m) [Base de apoyo de las almohadillas doradas] === PLANO DE CONTACTO
  (y = -2.120 m) [Rejilla decorativa de escena Three.js]
```

---

### DEF-02 — Sustitución Atómica de Propulsión Incompatible
- **Mecanismo implementado:** `planPartChange()` en [`ProbeDesign.js`](../src/lab/ProbeDesign.js#L95-L116) y presentación en [`ExperimentalLaboratory.js`](../src/ui/ExperimentalLaboratory.js#L85-L123).
- **Pruebas interactivas ejecutadas:**
  1. *Detección de conflicto:* Con el preajuste Interplanetario cargado (motor químico + tanque químico), se seleccionó `engine-ion` en el catálogo. La interfaz no abortó ni emitió un error rojo; en su lugar desplegó el contenedor `#lab-replacement` con las opciones:
     - `Reemplazar por Tanque de xenón (58 kg llenos)`
     - `Retirar Tanque químico`
     - `Cancelar · conservar diseño`
  2. *Cancelación sin efectos secundarios:* Al pulsar «Cancelar», el diálogo se cerró y el diseño se preservó idéntico (motor químico, $190\text{ kg}$ de combustible, $\Delta v = 1257,1\text{ m/s}$).
  3. *Reemplazo atómico:* Al pulsar «Reemplazar», el motor se actualizó a `engine-ion` y el tanque a `tank-xenon` con $58\text{ kg}$ inicializados. La masa seca bajó a $356\text{ kg}$, la húmeda a $414\text{ kg}$, el empuje cambió a $0,04\text{ N}$ y el $\Delta v$ ideal aumentó a $3700,4\text{ m/s}$.
  4. *Cambio inverso:* Con propulsión iónica activa, seleccionar `engine-chemical` ofrece sustituir por `Tanque químico (190 kg llenos)`.
- **Resultado:** **CORREGIDO**.

---

### DEF-03 — Responsividad en Tabletas (768×1024)
- **Modificación:** En [`experimental-laboratory.css`](../src/ui/experimental-laboratory.css#L88), la regla se actualizó de `@media(max-width:760px)` a `@media(max-width:820px)`.
- **Prueba en Chrome a 768×1024 (iPad vertical):**
  - La propiedad `flex-direction` del espacio de trabajo conmuta a `column`.
  - El visor 3D ocupa el ancho completo de $752\text{ px}$ con altura de $430\text{ px}$, permitiendo manipular la sonda y rotar paneles solares sin recortes contra los bordes.
  - El catálogo se despliega abajo en 2 columnas y el panel de ingeniería debajo con tipografía legible y botones amplios (> 40 px de altura).
- **Resultado:** **CORREGIDO**.

---

### DEF-04 — Conexiones Físicas de Cámara y Tanque
- **Modificaciones de montaje:**
  - Ranura `tank` desplazada de $z = -1,03\text{ m}$ a $z = -1,37\text{ m}$. Se incorporó el cilindro `rod` con nombre `'tank-mount'` entre $z_{\text{local}} = 0,35$ y $0,52$.
  - Cámara multiespectral recibió un mástil de anclaje `'camera-mount'` entre $z_{\text{local}} = 0,17$ y $0,34$.
- **Verificación de distancias mundiales reales (`measureRearMountFit`):**
  - **Exploración Interplanetaria:** Luz del tanque al casco = $+5,80\text{ cm}$; penetración del soporte en el casco = $+6,20\text{ cm}$. Luz de la cámara = $+8,30\text{ cm}$; penetración del soporte = $+6,20\text{ cm}$.
  - **Orbitador Científico:** Luz del tanque = $+4,10\text{ cm}$; soporte = $+7,90\text{ cm}$. Luz de la cámara = $+8,40\text{ cm}$; soporte = $+6,10\text{ cm}$.
  - **Explorador Lunar:** Luz del tanque = $+7,85\text{ cm}$; soporte = $+4,15\text{ cm}$. Luz de la cámara = $+9,45\text{ cm}$; soporte = $+5,05\text{ cm}$.
- **Resultado:** Todos los cuerpos son 100% exteriores (`bodyGapM > 0`) y todos los soportes penetran en el casco (`mountReachM > 0`). Cero piezas flotantes y cero intersecciones volumétricas anómalas.
- **Resultado:** **CORREGIDO**.

---

### DEF-05 — Controles Táctiles y Scroll en Dispositivos Móviles
- **Mecanismo:** [`ProbeAssemblyView.js`](../src/lab/ProbeAssemblyView.js#L227-L232) evalúa `matchMedia('(pointer: coarse)')`.
  - Por defecto: `controls.enabled = false`, `touchAction = 'pan-y'`. El usuario puede deslizar el dedo verticalmente sobre el visor 3D para navegar hacia el catálogo y las métricas.
  - El botón `#lab-touch-toggle` («Activar control 3D») activa explícitamente `controls.enabled = true` y `touchAction = 'none'`, permitiendo rotación y zoom táctil.
  - Al pulsar nuevamente «Desactivar control 3D» o salir del modo constructor, se liberan todas las capturas de puntero activas (`releasePointerCapture`).
- **Inspección en Chrome móvil (390×844):** Confirmado en `evidence/stage12a1/05_def05_mobile_touch_toggle_after.png`.
- **Resultado:** **CORREGIDO**.

---

### DEF-06 — Prevención de Solapamiento en Pantallas Estrechas (320 px)
- **Mecanismo:** En [`ExperimentalLaboratory.js`](../src/ui/ExperimentalLaboratory.js#L331-L342), un `ResizeObserver` vigila `.app-header`, `#app-mode-switcher` y sus botones hijos. Calcula dinámicamente la posición máxima del borde inferior (`bottom + 8px`) y la inyecta como variable CSS `--lab-top`.
- **Medición real en 320×568 (iPhone SE):**
  - La barra de navegación se divide en dos líneas alcanzando $y = 96\text{ px}$.
  - La variable `--lab-top` se calcula en `104px`.
  - El contenedor `#experimental-lab` comienza en $y = 104\text{ px}$, dejando un margen limpio de exactamente **$8\text{ px}$** sobre el título `LABORATORIO EXPERIMENTAL / ETAPA 12A`. Cero texto cortado o solapado.
- **Resultado:** **CORREGIDO**.

---

### DEF-07 — Limpieza de Recursos y Ausencia de Acumulación de Memoria
- **Mecanismo:** En [`ProbeAssemblyView.js`](../src/lab/ProbeAssemblyView.js#L286-L307) y [`ExperimentalLaboratory.js`](../src/ui/ExperimentalLaboratory.js#L345-L350):
  - `dispose()` cancela el frame de animación, desconecta ResizeObservers y MutationObservers, remueve listeners de eventos, destruye controles orbitales, libera geometrías, materiales y texturas PBR, vacía listas de renderizado, fuerza la pérdida de contexto WebGL con `forceContextLoss()` y retira el elemento canvas del DOM (`renderer.domElement.remove()`).
- **Prueba de estrés (30 ciclos de alternancia):**
  - Heap JS inicial: **$39,39\text{ MB}$**.
  - Heap JS tras 30 alternancias entre Constructor, Simulación Orbital, Sistema Solar y Misiones Históricas: **$35,61\text{ MB}$**.
  - Estado del contexto WebGL tras los ciclos: `canvasFound: true`, `isContextLost: false`, `glError: 0`.
  - Ausencia absoluta de fugas de memoria monotónicas.
- **Resultado:** **CORREGIDO**.

---

### DEF-08 — Sincronización de Navegación y Pestaña Activa
- **Mecanismo:** En [`HistoricalModeControls.js`](../src/ui/HistoricalModeControls.js#L711-L719), un MutationObserver vigila `data-app-mode` en `#app`.
  - Cuando el simulador entra a `experimental` (ya sea por clic, carga inicial o enlace profundo), la pestaña «Experimental» actualiza automáticamente `aria-pressed="true"`.
  - Al cambiar a `solar` o `historical`, las pestañas correspondientes se iluminan y el constructor experimental oculta su interfaz de inmediato.
- **Resultado:** **CORREGIDO**.

---

## 3. PRUEBAS GENERALES Y NO REGRESIÓN

### 3.1. Batería automatizada de pruebas
- `node --test tests/*.test.mjs`:
  - **117 pruebas ejecutadas, 117 pruebas pasadas, 0 fallidas, 0 canceladas, 0 omitidas**.
  - Incluye las 6 pruebas de integración de correcciones en [`tests/ProbeLaboratoryCorrections.test.mjs`](../tests/ProbeLaboratoryCorrections.test.mjs).
- `node scripts/audit-voyager-stage8.mjs`:
  - **49 conjuntos de datos de producción y 10 kernels SPK verificados con SHA-256 intactos**.
- `npm run build`:
  - Compilación exitosa en **514 ms**. Paquetes generados sin errores en `dist/`.

### 3.2. Verificación de diseños y operaciones de taller
1. **Sonda Interplanetaria:** Ensamblaje íntegro de 11 piezas. Masa seca $371\text{ kg}$, total $561\text{ kg}$, $\Delta v = 1257,1\text{ m/s}$.
2. **Orbitador Científico:** Masa seca $278\text{ kg}$, total $336\text{ kg}$, $\Delta v = 4645,7\text{ m/s}$.
3. **Explorador Lunar:** Masa seca $479\text{ kg}$, total $669\text{ kg}$, $\Delta v = 1015,6\text{ m/s}$, holgura de motor $+12,1\text{ cm}$.
4. **Construcción desde cero:** Permite elegir bus, incorporar piezas progresivamente, editar combustible con recálculo dinámico en tiempo real y retirar piezas individuales o el bus entero.
5. **Persistencia:** Guardado local comprobado en `localStorage`, exportación e importación JSON roundtrip con preservación estricta de propiedades.

---

## 4. REGISTRO DE EVIDENCIAS FOTOGRÁFICAS (`evidence/stage12a1/`)

| Archivo | Contenido de la Evidencia |
| :--- | :--- |
| [`01_def01_landing_clearance_after.png`](../evidence/stage12a1/01_def01_landing_clearance_after.png) | Explorador Lunar: verificación visual de holgura $+12,1\text{ cm}$ de la tobera sobre el plano de contacto de las patas. |
| [`02_def02_propellant_replacement_dialog.png`](../evidence/stage12a1/02_def02_propellant_replacement_dialog.png) | Diálogo contextual ofreciendo Reemplazar por xenón lleno ($58\text{ kg}$), Retirar tanque químico o Cancelar. |
| [`02b_def02_propellant_replaced_after.png`](../evidence/stage12a1/02b_def02_propellant_replaced_after.png) | Resultado del reemplazo atómico a propulsión iónica con motor y tanque sustituidos en una sola operación. |
| [`03_def03_tablet_768x1024_after.png`](../evidence/stage12a1/03_def03_tablet_768x1024_after.png) | Disposición apilada en tableta (768×1024) con visor 3D de ancho completo y catálogo legible. |
| [`04_def04_camera_and_tank_mounts_after.png`](../evidence/stage12a1/04_def04_camera_and_tank_mounts_after.png) | Vista lateral/trasera mostrando el collar cilíndrico del tanque y el mástil de sujeción de la cámara al casco. |
| [`05_def05_mobile_touch_toggle_after.png`](../evidence/stage12a1/05_def05_mobile_touch_toggle_after.png) | Interfaz móvil en 390×844 mostrando el botón «Desactivar control 3D» tras ser activado. |
| [`06_def06_mobile_320x568_after.png`](../evidence/stage12a1/06_def06_mobile_320x568_after.png) | Vista en 320 px con barra superior partida en dos filas y holgura calculada de $8\text{ px}$ sin solapamiento. |
| [`08_def08_navigation_active_tab_after.png`](../evidence/stage12a1/08_def08_navigation_active_tab_after.png) | Barra superior con la pestaña «Experimental» activa (`aria-pressed="true"`). |
| [`09_desktop_1920x1080.png`](../evidence/stage12a1/09_desktop_1920x1080.png) | Vista general de escritorio Full HD (1920×1080). |
| [`09b_desktop_1366x768.png`](../evidence/stage12a1/09b_desktop_1366x768.png) | Vista general en resolución de portátil HD (1366×768). |
| [`09c_mobile_390x844.png`](../evidence/stage12a1/09c_mobile_390x844.png) | Vista general en resolución móvil moderna (390×844). |
| [`10a_preset_interplanetary.png`](../evidence/stage12a1/10a_preset_interplanetary.png) | Preajuste A: Sonda de exploración interplanetaria. |
| [`10b_preset_orbiter.png`](../evidence/stage12a1/10b_preset_orbiter.png) | Preajuste B: Orbitador científico compacto. |
| [`10c_preset_lander.png`](../evidence/stage12a1/10c_preset_lander.png) | Preajuste C: Explorador lunar con patas y brazo de muestreo. |

---

## 5. DICTAMEN FINAL Y TRANSICIÓN A LA ETAPA 12B

> ### **¿Está el constructor modular suficientemente estable para comenzar la Etapa 12B de planificación de misiones espaciales?**
> 
> # **SÍ, ESTÁ SUFICIENTEMENTE ESTABLE.**
> 
> **Fundamentos del dictamen:**
> 1. Los ocho defectos reportados en la auditoría 12A fueron resueltos en su raíz matemática, geométrica y funcional sin parches cosméticos frágiles.
> 2. Las estructuras mecánicas respetan holguras físicas reales y estables ($+12,1\text{ cm}$ en aterrizador, anclajes sólidos en instrumentos y depósitos).
> 3. El flujo de sustitución de piezas maneja las incompatibilidades de propelente de forma atómica y reversible.
> 4. La interfaz responde adecuadamente en todo el espectro de dispositivos móviles, tabletas y monitores de escritorio (320 px a 1920 px).
> 5. La arquitectura desacoplada (`ProbeDesign` y `ProbeEngineering`) proporciona un contrato JSON limpio y versionado, ideal para alimentar los subsistemas previstos para la **Etapa 12B** (maniobras orbitales, masa variable y perfiles de misión).
> 6. No se detectó ninguna regresión en el motor orbital DOPRI54, efemérides ni misiones históricas Voyager.
> 
> El código de producción permanece inalterado por esta auditoría.
