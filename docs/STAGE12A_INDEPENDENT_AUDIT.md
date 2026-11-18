# INFORME DE AUDITORÍA TÉCNICA, CIENTÍFICA, VISUAL Y UX
## ETAPA 12A: LABORATORIO EXPERIMENTAL 2.0 (CONSTRUCTOR MODULAR DE SONDAS)

---

**Fecha de auditoría:** 16 de noviembre de 2026  
**Auditor:** Agente Independiente de Auditoría (DeepMind Advanced Agentic Coding)  
**Entorno de ejecución:** Windows x64 · Node.js v24.14.0 · Google Chrome 133+ (WebGL 2, GPU acelerada) · Three.js r186  
**Vite Dev Server:** `http://localhost:5174` (build v8.3.4)  
**Directorio de evidencias:** `evidence/stage12a/`  
**Estado general dictaminado:** **APROBADO CON OBSERVACIONES (NO BLOQUEANTE PARA DESARROLLO, REQUIERE REFINAMIENTOS GEOMÉTRICOS Y UX)**

---

## 1. RESUMEN EJECUTIVO

La Etapa 12A incorpora exitosamente un **constructor modular de sondas espaciales tridimensional** dentro del modo Experimental del simulador. La arquitectura desacoplada diseñada por Codex separa rigurosamente la representación paramétrica del catálogo, la validación del diseño, los cálculos matemáticos de ingeniería y el renderizado WebGL/Three.js.

### Principales conclusiones de la auditoría:
1. **Desacoplamiento arquitectónico:** Excelente. Los módulos `ComponentCatalog.js`, `ProbeDesign.js` y `ProbeEngineering.js` son funciones y contratos puros de JavaScript, completamente agnósticos respecto al DOM y Three.js.
2. **Exactitud matemática y científica:** Impecable. Los cálculos de masa seca, combustible, masa húmeda, empuje combinado, ponderación de $I_{sp}$ efectivo según flujo másico ($\dot{m}$), ecuación ideal de Tsiolkovsky con la gravedad normal NIST ($g_0 = 9,80665 \text{ m/s}^2$), balance eléctrico instantáneo a 1 AU y autonomía energética coinciden con las soluciones analíticas independientes hasta la última cifra decimal.
3. **Persistencia y robustez:** Excelente. Validación exhaustiva de contratos JSON. Se verificaron 71 pruebas adversarias (archivos vacíos, JSON truncados, entradas no numéricas, masas negativas, sobredimensionamiento, componentes desconocidos y cuota de almacenamiento local de 30 diseños); el sistema rechaza entradas inválidas sin fallos ni bloqueos.
4. **Regresión:** Cero regresiones. Las 111 pruebas automatizadas del simulador (`tests/*.test.mjs`) pasaron al 100%, la auditoría Voyager Etapa 8 (`scripts/audit-voyager-stage8.mjs`) validó los 49 conjuntos y 10 hashes SPK intactos, y `npm run build` compiló sin advertencias de sintaxis. La simulación orbital DOPRI54 anterior continúa plenamente accesible mediante el botón «Ver simulación orbital» y el enlace de retorno «Volver al constructor».
5. **Defectos detectados:**
   - **Geométrico/Visual:** En la configuración del explorador lunar (`bus-lander`), la tobera del motor químico desciende hasta $y = -1,959 \text{ m}$, mientras que las almohadillas del tren de aterrizaje finalizan en $y = -1,780 \text{ m}$. La tobera sobresale **~17,9 cm por debajo de las patas de aterrizaje**, lo que físicamente aplastaría el motor contra el suelo.
   - **Visual (montaje):** La cámara multiespectral presenta una separación en el aire de **8,3 cm** respecto al casco exterior sin barra de sujeción, mientras que el tanque químico penetra **~26 cm** en el interior del volumen del bus sin un nicho visible.
   - **UX (incompatibilidad de propelente al reemplazar):** Si un usuario intenta sustituir el motor químico por uno iónico mediante el catálogo sin haber retirado antes el tanque químico, la acción es abortada con el mensaje «Motor y tanque utilizan propelentes incompatibles», impidiendo el reemplazo directo a pesar de que la interfaz indica que «Una conexión ocupada se reemplaza».
   - **Responsividad:** En pantallas de tableta vertical estándar (768×1024, iPad), el punto de corte CSS `@media(max-width:760px)` mantiene la vista de escritorio en 3 columnas, comprimiendo el catálogo y el panel de ingeniería a anchuras excesivamente angostas (< 215 px).

---

## 2. INSPECCIÓN TÉCNICA Y ARQUITECTURA

Se revisó minuciosamente el código fuente de los 7 archivos componentes de la Etapa 12A:

| Archivo | Responsabilidad | Dependencias DOM / Three.js | Calidad y Desacoplamiento |
| :--- | :--- | :--- | :--- |
| `src/lab/ComponentCatalog.js` | Catálogo de piezas ficticias con especificaciones SI, dimensiones y ranuras (`slots`). | Ninguna (JS Puro). | Excelente. Exporta estructuras congeladas (`Object.freeze`). |
| `src/lab/ProbeDesign.js` | Definición de formato versionado, validación de diseño, agregado de piezas y almacenamiento local. | Solo `localStorage` en `saveDesign` / `loadSavedDesigns`. | Excelente. Validación estricta mediante expresiones regulares y rangos finitos. |
| `src/lab/ProbeEngineering.js` | Cálculos de masa, empuje, impulso específico, Tsiolkovsky y balance eléctrico. | Ninguna (JS Puro). | Excelente. Funciones deterministas puras sin efectos secundarios. |
| `src/lab/ProbeAssemblyView.js` | Ensamblaje tridimensional procedural, jerarquía Three.js, materiales PBR, BoxHelpers y OrbitControls. | `three`, `OrbitControls`, DOM host. | Muy buena. Reutiliza materiales singleton; libera geometrías al reconstruir el diseño. |
| `src/ui/ExperimentalLaboratory.js` | Controlador de interfaz, sincronización de vistas, catálogo, selección de piezas y gestión de eventos. | DOM (`document`, `Intl`, listeners). | Muy buena. Controla la visibilidad y sincronización entre modo orbital y constructor. |
| `src/ui/experimental-laboratory.css` | Hoja de estilos con variables de color, layout de cuadrícula, diseño adaptable y estados interactivos. | CSS nativo. | Muy buena. Utiliza `clamp()` y reglas específicas para dispositivos móviles. |
| `src/main.js` | Inicialización e integración del laboratorio experimental en el ciclo de vida de la aplicación. | Integración general. | Mínimo impacto (solo importa e invoca `createExperimentalLaboratory()`). |

### Evaluación de modularidad:
- **Separación de responsabilidades:** `ProbeEngineering.js` y `ProbeDesign.js` pueden ejecutarse íntegramente en Node.js o en un Web Worker sin simular `window` ni `document`.
- **Limpieza de memoria:** `ProbeAssemblyView.dispose()` cancela el bucle `requestAnimationFrame`, desconecta el `ResizeObserver`, destruye los controles orbitales y desecha el renderizador WebGL. Sin embargo, no retira explícitamente el elemento `<canvas>` del contenedor anfitrión (`renderer.domElement.remove()`), lo cual se recomienda formalizar para prevenir fugas residuales si el anfitrión se reutilizara.

---

## 3. AUDITORÍA MATEMÁTICA Y FÍSICA INDEPENDIENTE

Se ejecutó una verificación numérica independiente (`scratch/math_audit.mjs`) contrastando las fórmulas de Codex contra modelos analíticos puros.

### 3.1. Ecuaciones y constantes de referencia
1. **Aceleración normal convencional ($g_0$):**
   $$g_0 = 9,80665 \text{ m/s}^2 \quad \text{(conforme a NIST SP 811, Apéndice B.9)}$$
   *Verificación:* Constante exacta verificada en `STANDARD_GRAVITY_M_S2`.
2. **Masa seca ($m_f$) y masa húmeda ($m_0$):**
   $$m_f = m_{\text{core}} + \sum_{i=1}^n m_{\text{dry}, i}$$
   $$m_0 = m_f + \sum_{j=1}^m m_{\text{fuel}, j}$$
3. **Empuje total y ponderación de Impulso Específico ($I_{sp,eff}$):**
   Para $k$ motores simultáneos con empujes $F_k$ e impulsos específicos $I_{sp, k}$, el flujo másico total es:
   $$\dot{m}_{\text{tot}} = \sum_{k} \frac{F_k}{g_0 I_{sp, k}} \implies I_{sp,eff} = \frac{\sum_k F_k}{g_0 \dot{m}_{\text{tot}}} = \frac{\sum_k F_k}{\sum_k \frac{F_k}{I_{sp, k}}}$$
   *Verificación:* La implementación en `ProbeEngineering.js` (líneas 26–27) aplica exactamente esta formulación ponderada.
4. **Delta-v ideal de Tsiolkovsky ($\Delta v$):**
   $$\Delta v = g_0 \cdot I_{sp,eff} \cdot \ln\left(\frac{m_0}{m_f}\right)$$
5. **Balance de potencia eléctrica:**
   $$P_{\text{net, idle}} = \sum P_{\text{gen}} - \sum P_{\text{idle}}$$
   Si $P_{\text{idle}} > P_{\text{gen}}$ y existe capacidad de batería $E_{\text{bat}} > 0$:
   $$t_{\text{autonomía}} = \frac{E_{\text{bat}}}{P_{\text{idle}} - P_{\text{gen}}} \quad \left[\frac{\text{W}\cdot\text{h}}{\text{W}} = \text{horas}\right]$$

### 3.2. Casos de prueba numéricos

| Caso de prueba | Propiedad | Valor Esperado (Independiente) | Valor Obtenido (Codex) | Discrepancia | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Exploración Interplanetaria** | Masa seca | $371,000 \text{ kg}$ | $371,000 \text{ kg}$ | $0,000$ | **CORRECTO** |
| | Combustible químico | $190,000 \text{ kg}$ | $190,000 \text{ kg}$ | $0,000$ | **CORRECTO** |
| | Masa húmeda | $561,000 \text{ kg}$ | $561,000 \text{ kg}$ | $0,000$ | **CORRECTO** |
| | Empuje | $650,000 \text{ N}$ | $650,000 \text{ N}$ | $0,000$ | **CORRECTO** |
| | $I_{sp}$ efectivo | $310,000 \text{ s}$ | $310,000 \text{ s}$ | $0,000$ | **CORRECTO** |
| | $\Delta v$ Tsiolkovsky | $1257,122714 \text{ m/s}$ | $1257,122714 \text{ m/s}$ | $< 10^{-12}$ | **CORRECTO** |
| | Generación solar | $1460,000 \text{ W}$ | $1460,000 \text{ W}$ | $0,000$ | **CORRECTO** |
| | Consumo en reposo | $98,000 \text{ W}$ | $98,000 \text{ W}$ | $0,000$ | **CORRECTO** |
| | Balance en reposo | $+1362,000 \text{ W}$ | $+1362,000 \text{ W}$ | $0,000$ | **CORRECTO** |
| **Orbitador Científico** | Masa seca | $278,000 \text{ kg}$ | $278,000 \text{ kg}$ | $0,000$ | **CORRECTO** |
| | Combustible xenón | $58,000 \text{ kg}$ | $58,000 \text{ kg}$ | $0,000$ | **CORRECTO** |
| | Masa húmeda | $336,000 \text{ kg}$ | $336,000 \text{ kg}$ | $0,000$ | **CORRECTO** |
| | Empuje iónico | $0,040 \text{ N}$ | $0,040 \text{ N}$ | $0,000$ | **CORRECTO** |
| | $I_{sp}$ iónico | $2500,000 \text{ s}$ | $2500,000 \text{ s}$ | $0,000$ | **CORRECTO** |
| | $\Delta v$ Tsiolkovsky | $4645,656406 \text{ m/s}$ | $4645,656406 \text{ m/s}$ | $< 10^{-12}$ | **CORRECTO** |
| | Potencia activa iónica | $900,000 \text{ W}$ | $900,000 \text{ W}$ | $0,000$ | **CORRECTO** |
| **Explorador Lunar** | Masa seca | $479,000 \text{ kg}$ | $479,000 \text{ kg}$ | $0,000$ | **CORRECTO** |
| | Combustible químico | $190,000 \text{ kg}$ | $190,000 \text{ kg}$ | $0,000$ | **CORRECTO** |
| | Masa húmeda | $669,000 \text{ kg}$ | $669,000 \text{ kg}$ | $0,000$ | **CORRECTO** |
| | $\Delta v$ Tsiolkovsky | $1015,634273 \text{ m/s}$ | $1015,634273 \text{ m/s}$ | $< 10^{-12}$ | **CORRECTO** |
| | Consumo activo (motor+brazo) | $175,000 \text{ W}$ | $175,000 \text{ W}$ | $0,000$ | **CORRECTO** |
| **Caso Déficit Eléctrico** | Consumo reposo ($58 \text{ W}$), Gen ($0 \text{ W}$) | Déficit: $-58 \text{ W}$, Bat: $2300 \text{ Wh}$ | Autonomía: $39,655 \text{ h}$ | $0,000$ | **CORRECTO** |
| **Combustible Cero** | Tanque vacío ($0 \text{ kg}$) | $\Delta v = \text{null}$ | $\Delta v = \text{null}$ («No disponible») | N/A | **CORRECTO** |
| **Sin Motor / Sin Tanque** | Pieza faltante | Empuje / $\Delta v = \text{null}$ | Empuje / $\Delta v = \text{null}$ («No disponible») | N/A | **CORRECTO** |
| **Propelentes Opuestos** | Motor químico + Tanque xenón | $\Delta v = \text{null}$ | Incompatible; $\Delta v = \text{null}$ | N/A | **CORRECTO** |

### 3.3. Hallazgo sobre la topología de ranuras y capacidad máxima
- **Unicidad de ranuras de propulsión:** Aunque la función matemática de `ProbeEngineering.js` está preparada para múltiples motores e impulsos específicos ponderados heterogéneos, el catálogo define **una única ranura axial `engine`** y **una única ranura `tank`**. Por diseño del catálogo actual, no es posible montar más de un motor simultáneo ni más de un tanque sin expandir la lista de ranuras.
- **Límites de carga estructural inalcanzables:** La carga máxima admisible del bus más ligero (`bus-orbiter`) es de $620 \text{ kg}$. Si se montan las piezas más pesadas del catálogo en las 12 ranuras simultáneamente, la masa acoplada máxima posible es de $495 \text{ kg}$. Por consiguiente, bajo el catálogo oficial es físicamente imposible exceder el límite de masa mediante la interfaz normal (solo disparable mediante inyección JSON manipulada).

---

## 4. PRUEBAS DEL CONSTRUCTOR 3D Y DE LOS DISEÑOS PREDEFINIDOS

Se realizaron pruebas interactivas automatizadas en Chrome conectado a través de CDP (`browser_audit.mjs` e `interaction_audit.mjs`).

| Ítem evaluado | Descripción de la prueba | Resultado observado | Evaluación |
| :---: | :--- | :--- | :---: |
| 1 | Apertura del laboratorio | Se abre al activar `appMode = 'experimental'`. El layout se muestra ordenado e interactivo. | **APROBADO** |
| 2 | Visualización del catálogo | 12 categorías desplegadas con iconos glifos, nombres, masas secas y fichas técnicas. | **APROBADO** |
| 3 | Selección de estructuras | Permite alternar entre los 3 buses: interplanetario, orbitador y plataforma de descenso. | **APROBADO** |
| 4 | Motores (químico / iónico) | Geometría procedural diferenciada (anillo de vidrio emisivo en el iónico, tobera dorada). | **APROBADO** |
| 5 | Tanques de combustible | Tanque químico ($190 \text{ kg}$) y de xenón ($58 \text{ kg}$) cilíndricos con domos esféricos dorados. | **APROBADO** |
| 6 | Paneles solares | Celdas azules fotovoltaicas con rejilla metálica y barras de articulación simétricas. | **APROBADO** |
| 7 | Antenas | Plato parabólico con mástil y alimentador central dorado. | **APROBADO** |
| 8 | Baterías y módulos de datos | Cajas compactas oscuras con conectores e indicadores emisivos diferenciados. | **APROBADO** |
| 9 | Instrumentos y sensores | Mástil de sensor cónico y cuerpo de espectrómetro con óptica cilíndrica. | **APROBADO** |
| 10 | Tren de aterrizaje | Estructura cuadrípode con puntales inclinados y platos de apoyo circulares. | **APROBADO** |
| 11 | Eliminación de piezas | Botón «Retirar componente» elimina la pieza seleccionada y actualiza masa y métricas. | **APROBADO** |
| 12 | Retiro de estructura base | «Retirar estructura y piezas» limpia el ensamblaje completo y restaura el estado vacío. | **APROBADO** |
| 13 | Sustitución de componentes | Seleccionar una ranura ocupada actualiza la pieza en dicha ranura sin duplicar. | **APROBADO** |
| 14 | Selección directa 3D | El raycasting desde el canvas identifica el componente pulsado y lo resalta con `BoxHelper`. | **APROBADO** |
| 15 | Cámara orbital | OrbitControls permite rotación libre de 360°, inclinación y zoom con límites seguros ($2,7–17 \text{ m}$). | **APROBADO** |
| 16 | Restablecimiento de cámara | Botón «Restablecer cámara» reubica la vista en $(5,8; 3,3; 6,8)$ orientada al origen $(0,0,0)$. | **APROBADO** |
| 17 | Reactividad de combustible | Modificar la masa de combustible recalcula instantáneamente el $\Delta v$ y la masa total. | **APROBADO** |
| 18 | Conmutación modo orbital | «Ver simulación orbital» muestra la propagación DOPRI54; «Volver al constructor» regresa al lab. | **APROBADO** |

---

## 5. PERSISTENCIA Y ARCHIVOS JSON

Se evaluaron los mecanismos de serialización, deserialización y almacenamiento local (`json_persistence_audit.mjs`):

1. **Ciclo de vida Roundtrip:**
   - Se exportaron los 4 preajustes (`empty`, `interplanetary`, `orbiter`, `lander`) y se volvieron a importar.
   - En todos los casos se mantuvieron intactos los identificadores UUID, nombres, estructura principal, ranuras, identificadores de componentes y masas exactas de combustible.
2. **Capacidad de almacenamiento local:**
   - La clave `probe-laboratory-designs-v1` en `localStorage` gestiona correctamente una lista FIFO de hasta 30 diseños. Al guardar el diseño número 31, se descartan los más antiguos sin emitir errores de almacenamiento.
3. **Casos adversarios y de frontera:**
   - **Archivo vacío o solo espacios:** Rechazado con el mensaje `«El archivo no contiene JSON válido.»`.
   - **JSON malformado (corchetes o llaves abiertas):** Rechazado controladamente sin excepciones no capturadas.
   - **Componente inexistente (`warp-drive-9000`):** Detectado y rechazado con `«Componente desconocido.»`.
   - **Combustible negativo ($-50 \text{ kg}$):** Rechazado con `«Tanque químico: combustible fuera de capacidad.»`.
   - **Combustible no numérico (string `«cien»` o `NaN`):** Rechazado con `«Tanque químico: combustible fuera de capacidad.»`.
   - **Estructura desconocida (`death-star-chassis`):** Rechazado con `«Estructura principal desconocida.»`.
   - **Ranura incompatible (motor en ranura `antenna`):** Rechazado con `«Motor químico de maniobra: conexión incompatible (antenna).»`.
   - **Archivo sobredimensionado (> 100 KB):** Rechazado inmediatamente antes de procesar el texto (`«Archivo demasiado grande o inválido.»`).

---

## 6. AUDITORÍA UX/UI Y RESPONSIVIDAD

Se evaluó la interfaz en 6 resoluciones reales cubriendo escritorio, portátiles, tabletas y móviles:

```
+---------------------------------------------------------------------------------------+
| RESOLUCIONES PROBADAS                                                                 |
|                                                                                       |
|  1920x1080 (Desktop FHD)     1366x768 (Laptop HD)         1280x720 (Laptop 720p)     |
|  [01_initial_lab_view.png]   [10b_desktop_1366x768.png]   [10c_desktop_1280x720.png] |
|                                                                                       |
|  768x1024 (iPad Portrait)    390x844 (iPhone 12/13/14)    320x568 (iPhone SE 1st gen)|
|  [10d_tablet_768x1024.png]   [09_mobile_390x844.png]      [09b_mobile_320x568.png]   |
+---------------------------------------------------------------------------------------+
```

### 6.1. Experiencia en escritorio (1920×1080, 1366×768, 1280×720)
- **Distribución:** El esquema de 3 columnas (Catálogo 20–25%, Ensamblaje 3D central, Ingeniería 23–28%) permite una visualización despejada de la sonda mientras los paneles laterales permanecen completamente funcionales.
- **Jerarquía visual:** La tipografía técnica, los contrastes de color PBR (dorado `#c5a56b`, azul solar `#153b74`, estructura oscura `#252d39`) y las leyendas de ingeniería proporcionan una estética coherente con instrumental aeroespacial real.
- **Scroll independiente:** Cada panel lateral tiene su propio contenedor con `overflow: auto` y barras de desplazamiento delgadas, evitando que la página entera se desplace.

### 6.2. Experiencia en tableta (768×1024)
- **Observación crítica de maquetación:** A 768 px de ancho, la regla CSS `@media(max-width:760px)` **no se activa** por apenas 8 píxeles de diferencia. Como resultado, la tableta en orientación vertical recibe la distribución de escritorio en 3 columnas, reduciendo el área interactiva del catálogo a ~192 px de ancho y el visor 3D central a un estrecho corredor donde los paneles solares quedan recortados contra los bordes.

### 6.3. Experiencia en móvil (390×844 y 320×568)
- **Apilamiento vertical:** A $\le 760 \text{ px}$, el visor 3D se ubica en la parte superior con altura fija (`clamp(260px, 42dvh, 450px)`), seguido del catálogo en 2 columnas y finalmente el panel de ingeniería.
- **Conflicto de gestos táctiles:** En el visor 3D, OrbitControls intercepta los eventos táctiles para rotar y hacer zoom en la sonda. Al ocupar casi todo el ancho de la pantalla, el usuario que intenta hacer scroll vertical sobre el lienzo termina rotando la sonda en lugar de desplazarse hacia los paneles inferiores. Se requiere arrastrar desde los márgenes exteriores o los encabezados.
- **Solapamiento en 320 px (iPhone SE):** En pantallas ultra compactas de 320 px, los botones de la barra de navegación superior del simulador («Sistema Solar», «Misiones históricas», «Experimental») se quiebran en dos filas, elevando la barra de navegación a ~118 px. Dado que `#experimental-lab` tiene un `inset: 100px 0 0;` fijo, el subtítulo superior del constructor queda parcialmente cubierto por la barra de navegación.

### 6.4. Accesibilidad e interacción por teclado
- Se evaluaron los 25 botones y 5 campos interactivos del módulo:
  - Todos los botones tienen texto visible o etiquetas de rol descriptivas (`aria-label`, `aria-pressed`).
  - La navegación mediante la tecla `Tab` recorre secuencialmente el catálogo, las acciones de cámara, los preajustes y los controles de ingeniería.
  - Los estilos de foco visual `:focus-visible` muestran un contorno dorado claro `#dcc38d` con desplazamiento de 2 px.

---

## 7. ANÁLISIS DE DEFECTOS VISUALES Y GEOMÉTRICOS

Se detectaron tres defectos físicos/geométricos en el ensamblaje procedural de componentes:

### Defecto Geométrico 1 (Severidad Alta): Tobera del motor químico más baja que las almohadillas del tren de aterrizaje
- **Ubicación:** `bus-lander` con `engine-chemical` y `landing-legs` (Preset Explorador Lunar).
- **Evidencia fotográfica:** `evidence/stage12a/11a_lander_engine_nozzle_vs_legs.png` y `07c_lander.png`.
- **Causa en código:**
  - En `ComponentCatalog.js`: La estructura `bus-lander` escala las ranuras a $1,05$.
    - Ranura `landing`: $y = -1,2 \times 1,05 = -1,260 \text{ m}$.
    - Ranura `engine`: $y = -1,38 \times 1,05 = -1,449 \text{ m}$.
  - En `ProbeAssemblyView.js`:
    - Las patas terminan en $y_{\text{local}} = -0,52 \text{ m} \implies y_{\text{mundo}} = -1,260 - 0,52 = \mathbf{-1,780 \text{ m}}$.
    - La tobera del motor químico finaliza en $y_{\text{local}} = -0,51 \text{ m} \implies y_{\text{mundo}} = -1,449 - 0,51 = \mathbf{-1,959 \text{ m}}$.
- **Impacto:** La tobera del motor sobresale **$17,9 \text{ cm}$ por debajo del plano de contacto de las cuatro patas**. Al posarse sobre una superficie plana teórica, el módulo descansaría sobre la campana del motor de propulsión, dejando las patas suspendidas en el aire.

```
PLANO DE CONTACTO MECÁNICO (VISTA LATERAL ESQUEMÁTICA):
======================================================
  [Casco Plataforma Descenso]
            |
            |---- (y = -1.26m) ---> [Puntales de Aterrizaje]
            |                             \
            |                              \
            |---- (y = -1.45m) ---> [Motor] \
            |                         |      \
            |                         |       [Pata de apoyo] (y = -1.78m)
            |                         |          |
            |                      [Tobera] <----+--- ¡SOBRESALE 17.9 cm!
            |                         |
------------------------------------(y = -1.96m)------------------------ [SUPERFICIE]
```

### Defecto Geométrico 2 (Severidad Media): Separación flotante de la cámara multiespectral
- **Ubicación:** `camera-multispectral` montada en la ranura `camera`.
- **Causa en código:** La ranura se ubica en $z = -1,19 \text{ m}$. La caja de la cámara mide $0,39 \text{ m}$ de profundidad ($z$ relativo entre $-0,195$ y $+0,195$), finalizando su cara posterior en $z = -0,995 \text{ m}$. El radio externo del bus interplanetario es de $0,912 \text{ m}$.
- **Impacto:** Existe una holgura vacía de **$8,3 \text{ cm}$ en el aire** entre el bus y el cuerpo de la cámara. A diferencia de las antenas o sensores, que cuentan con un mástil cilíndrico (`rod()`), la cámara carece de soporte de fijación visible.

### Defecto Geométrico 3 (Severidad Baja): Penetración volumétrica del tanque en el casco
- **Ubicación:** `tank-chemical` montado en la ranura `tank`.
- **Evidencia fotográfica:** `evidence/stage12a/11b_tank_bus_clipping.png`.
- **Causa en código:** La ranura se ubica en $z = -1,03 \text{ m}$ con un radio cilíndrico de $0,38 \text{ m}$. La cara interna del tanque penetra hasta $z = -0,65 \text{ m}$, mientras la pared del bus está en $z = -0,912 \text{ m}$.
- **Impacto:** El tanque penetra **$26,2 \text{ cm}$ directamente a través de los paneles exteriores de la estructura**, apreciándose intersección de mallas poligonales sin un collar de inserción o bahía embutida.

---

## 8. PRUEBAS DE RENDIMIENTO Y ESTABILIDAD WEBGL

Se midió el comportamiento del motor bajo cargas continuas (`scratch/perf_audit.mjs`):

| Parámetro | Medición registrada | Umbral de referencia | Evaluación |
| :--- | :--- | :--- | :---: |
| **FPS en construcción 3D activa** | **180,9 fps** (frame time medio: $5,53 \text{ ms}$) | $\ge 60 \text{ fps}$ ($16,6 \text{ ms}$) | **ÓPTIMO** |
| **Heap de memoria JavaScript inicial** | $46,27 \text{ MB}$ | $< 100 \text{ MB}$ | **ÓPTIMO** |
| **Heap tras 50 cambios de diseño** | $36,96 \text{ MB}$ (recolector activo) | Sin fugas monotónicas | **ÓPTIMO** |
| **Heap tras 30 alternancias de modo** | $35,91 \text{ MB}$ | Sin fugas monotónicas | **ÓPTIMO** |
| **Pérdida de contexto WebGL** | `false` (`isContextLost() === false`) | Debe ser `false` | **ÓPTIMO** |
| **Código de error WebGL (`getError`)** | `0` (`GL_NO_ERROR`) | Debe ser `0` | **ÓPTIMO** |
| **Errores / Excepciones JS en consola** | **0 excepciones** registradas en ejecución | Debe ser `0` | **ÓPTIMO** |

---

## 9. PRUEBAS DE REGRESIÓN DEL SIMULADOR PRINCIPAL

Se confirmó rigurosamente que las modificaciones introducidas en `src/main.js` no afectaran ninguna de las funcionalidades previas del simulador:

1. **Batería de pruebas unitarias y de integración:**
   - Comando: `node --test tests/*.test.mjs`
   - Resultado: **111 pruebas ejecutadas, 111 aprobadas, 0 fallidas, 0 omitidas** (tiempo total: 1,53 s).
2. **Auditoría histórica de misiones Voyager (Etapa 8):**
   - Comando: `node scripts/audit-voyager-stage8.mjs`
   - Resultado: **Verificados 49 conjuntos de datos de producción y 10 hashes SHA-256 SPK sin alteraciones**.
3. **Compilación de producción:**
   - Comando: `npm run build`
   - Resultado: Vite v8.3.4 compiló exitosamente 89 módulos en 526 ms generando los paquetes en `dist/` sin advertencias de sintaxis.
4. **Comportamiento orbital del laboratorio:**
   - La sonda sintética previa `Sonda Experimental 01` mantiene intactos sus estados físicos, integrador DOPRI54, parámetros orbitales y acoplamiento visual al conmutar mediante el botón «Ver simulación orbital» (evidencia en `11d_orbital_mode_with_return_button.png`).

---

## 10. REGISTRO FOTOGRÁFICO DE EVIDENCIAS

Todas las capturas fueron generadas en resolución nativa durante la auditoría y se encuentran archivadas en `evidence/stage12a/`:

| Archivo de captura | Descripción de la evidencia |
| :--- | :--- |
| `01_initial_lab_view.png` | Vista general del constructor modular al iniciar el modo Experimental en 1920×1080. |
| `02_catalog_view.png` | Vista desplazada del catálogo mostrando categorías, iconos glifos y especificaciones. |
| `03_empty_probe.png` | Constructor en estado vacío con el mensaje guía «Elige una estructura...». |
| `04_probe_with_components.png` | Sonda en construcción intermedia (bus, motor químico y ala solar izquierda). |
| `05_fully_assembled_probe.png` | Sonda de exploración interplanetaria completamente ensamblada (11 piezas). |
| `06_engineering_panel.png` | Detalle del panel de ingeniería con balance de masas, empuje, Tsiolkovsky y energía. |
| `07a_interplanetary.png` | Preajuste A: Sonda de exploración interplanetaria orientada con dos alas solares. |
| `07b_orbiter.png` | Preajuste B: Orbitador científico con motor iónico, tanque de xenón y bus compacto. |
| `07c_lander.png` | Preajuste C: Explorador lunar con patas de descenso cuadrípodes y brazo robótico. |
| `08_save_and_restore.png` | Confirmación de persistencia tras renombrar, guardar y recuperar «Misión Apolo Experimental 2026». |
| `09_mobile_390x844.png` | Vista adaptable en dispositivo móvil estándar (iPhone 12/13/14, 390×844). |
| `09b_mobile_320x568.png` | Vista adaptable en pantalla reducida (iPhone SE 1st gen, 320×568) exhibiendo solapamiento en cabecera. |
| `10_desktop_1920x1080.png` | Vista de escritorio Full HD (1920×1080). |
| `10b_desktop_1366x768.png` | Vista en portátil común HD (1366×768). |
| `10c_desktop_1280x720.png` | Vista en resolución compacta 1280×720. |
| `10d_tablet_768x1024.png` | Vista en tableta vertical (768×1024) exhibiendo compresión excesiva de las 3 columnas. |
| `11a_lander_engine_nozzle_vs_legs.png` | Inspección cercana inferior evidenciando la tobera del motor sobresaliendo ~18 cm bajo las patas. |
| `11b_tank_bus_clipping.png` | Vista lateral revelando la penetración directa de la geometría del tanque dentro del casco. |
| `11c_propellant_mismatch_warning.png` | Mensaje de advertencia y bloqueo al intentar acoplar tanque de xenón a un motor químico. |
| `11d_orbital_mode_with_return_button.png` | Transición exitosa a la simulación orbital previa con el botón «Volver al constructor». |

---

## 11. CLASIFICACIÓN DE DEFECTOS Y ANOMALÍAS

### Defectos Críticos (Bloqueantes)
- *Ninguno detectado.* No hay caídas de sistema, pérdidas de datos, regresiones ni divergencias físicas que bloqueen el uso.

### Defectos Altos (Afectan la fidelidad o la experiencia central)
1. **[DEF-01] Longitud insuficiente del tren de aterrizaje frente a la tobera:**
   - La campana del motor químico sobresale $17,9 \text{ cm}$ por debajo de las almohadillas del tren de aterrizaje en la plataforma de descenso.
2. **[DEF-02] Bloqueo en el reemplazo de propulsión incompatible:**
   - Un usuario no puede reemplazar un motor químico por uno iónico en una ranura ocupada si ya existe un tanque químico instalado, porque la validación previa rechaza la coexistencia temporal antes de que se pueda cambiar el tanque.

### Defectos Medios (Problemas visuales o de adaptabilidad)
3. **[DEF-03] Punto de quiebre CSS inapropiado para tabletas (768 px):**
   - El breakpoint `@media(max-width:760px)` excluye pantallas estándar de tableta vertical ($768 \text{ px}$), forzando una distribución de tres columnas excesivamente estrecha.
4. **[DEF-04] Pieza flotante (cámara) e interpenetración (tanque):**
   - La cámara multiespectral tiene una holgura de $8,3 \text{ cm}$ sin soporte físico; el tanque se incrusta $26,2 \text{ cm}$ dentro del bus.
5. **[DEF-05] Captura de gestos táctiles en móvil:**
   - El área 3D acapara los gestos de desplazamiento vertical en pantallas táctiles, dificultando scrollear hacia el catálogo e ingeniería.

### Defectos Bajos (Detalles menores de maquetación y limpieza)
6. **[DEF-06] Solapamiento en cabecera en 320 px:**
   - `inset: 100px 0 0;` en `#experimental-lab` provoca que el encabezado del laboratorio roce la barra de navegación del simulador cuando los botones se parten en dos líneas a $320 \text{ px}$.
7. **[DEF-07] Falta de remoción explícita del `<canvas>` en `dispose()`:**
   - `ProbeAssemblyView.dispose()` destruye los recursos WebGL pero deja el elemento DOM `<canvas>` anexado a su elemento padre.

---

## 12. RECOMENDACIONES CONCRETAS PARA CODEX

Para subsanar las observaciones en la siguiente iteración de refinamiento, se recomienda a Codex aplicar las siguientes correcciones puntuales:

1. **Ajuste geométrico de patas de aterrizaje (`landing-legs`):**
   - En `ProbeAssemblyView.js` (función `makePart`, caso `landing`), incrementar la longitud de los puntales para que desciendan hasta $y = -0,75 \text{ m}$ (en lugar de $-0,48 \text{ m}$), o alternativamente elevar la posición relativa de la ranura `engine` en `bus-lander` para asegurar que las patas finalicen al menos $10 \text{ cm}$ por debajo de la tobera.
2. **Soporte de montaje para la cámara y collar para el depósito:**
   - En `makePart`, agregar un pequeño mástil de fijación (`rod(group, [0, 0, 0.19], [0, 0, 0.28], 0.04, metal)`) a la cámara multiespectral para unirla sólidamente con la pared exterior del bus.
3. **Flujo de asistencia en reemplazo de propelentes incompatibles:**
   - Cuando el usuario intente sustituir un motor por otro con propelente incompatible teniendo un tanque instalado, la interfaz de `ExperimentalLaboratory.js` debe ofrecer retirar automáticamente el tanque incompatible o emitir un mensaje orientativo: *«Retira primero el tanque actual para cambiar a propulsión iónica»*.
4. **Ajuste del punto de quiebre CSS para tabletas:**
   - En `experimental-laboratory.css`, actualizar el breakpoint de `@media(max-width:760px)` a `@media(max-width:820px)`. De este modo, dispositivos como el iPad portrait ($768 \text{ px}$) pasarán limpiamente a la disposición apilada con visor 3D central cómodo.
5. **Manejo de toque en móvil para permitir scroll:**
   - En dispositivos táctiles, agregar una indicación visual o una barra de deslizamiento que permita scrollear la página sin que los toques sean interceptados exclusivamente por el canvas de Three.js.
6. **Limpieza DOM completa:**
   - En `ProbeAssemblyView.dispose()`, añadir `renderer.domElement.remove();`.

---

## 13. CONCLUSIÓN Y DICTAMEN FINAL

La Etapa 12A representa un avance sustancial en la versatilidad interactiva y educativa del simulador. La arquitectura modular establecida es sólida, escalable y matemáticamente rigurosa. Los defectos identificados son de carácter geométrico y de refinamiento ergonómico, sin poner en riesgo la integridad científica ni la estabilidad del simulador.

**Dictamen:** **ETAPA 12A APROBADA TÉCNICA Y MATEMÁTICAMENTE CON OBSERVACIONES VISUALES Y DE UX REGISTRADAS PARA SU RESOLUCIÓN.**
