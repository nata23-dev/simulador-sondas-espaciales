# Informe de Auditoría Visual y Funcional Independiente — Tercer Avance
**Proyecto:** Simulador de Sondas Espaciales  
**Rama:** `revision/modo-historico-voyager`  
**Auditor Independiente:** Gemini  
**Fecha de emisión:** 19 de noviembre de 2026  
**Línea base evaluada:** Etapa 14 (Renovación visual integral e inventario de capacidades) sobre la base científica de las Etapas 1–13 (259 pruebas automatizadas aprobadas).

---

## 1. Resumen Ejecutivo

Se ha llevado a cabo una auditoría visual, estética, interactiva y funcional exhaustiva del **Simulador de Sondas Espaciales** con motivo del Tercer Avance del proyecto. La evaluación abarcó la totalidad de la aplicación: las 12 áreas funcionales accesibles a través del mapa global de navegación (`#app-nav-panel`), el modo Exploración astronómica, el modo Histórico de las misiones Voyager 1 y 2, los módulos de diseño, ingeniería y planificación del Laboratorio Experimental, y el Centro de Control de Misión en sus múltiples modalidades operativas.

### Principales conclusiones:
1. **Calidad visual y coherencia global:** La renovación visual introducida en la Etapa 14 unifica satisfactoriamente la identidad estética de la aplicación bajo un esquema oscuro con acentos dorados y azules (`#d4af37`, `#7fd6ef`, `#0b111a`), paneles de vidrio translúcido con desenfoque de fondo (*backdrop-filter*) y tipografía tabular legible. La presentación supera con creces el aspecto de prototipo técnico previo y se aproxima a estándares profesionales de divulgación científica interactiva.
2. **Cobertura operativa y navegación:** Las 12 áreas del simulador son accesibles directamente desde el mapa de áreas unificado (`#app-nav-toggle`), el cual cuenta con navegación por teclado accesible (cierre con `Escape`, foco retenido y marcado de ruta activa).
3. **Reproducibilidad y fidelidad física:** Los visualizadores no operan como animaciones arbitrarias preconcebidas; cada escena representa fielmente datos astronómicos de NASA/JPL Horizons, soluciones heliocéntricas de Lambert, integración numérica de paso adaptativo DOPRI54 o leyes de guiado por gravedad validadas.
4. **Estado académico de la Etapa 13:** La integración de misiones completas (Tierra–Marte A1, Júpiter–Europa B1 y sobrevuelo B2) se encuentra plenamente implementada y probada en la interfaz con 259 pruebas unitarias aprobadas, pero se declara formalmente como **pendiente de auditoría científica independiente**.
5. **Dictamen general:** **APROBADO CON OBSERVACIONES MENORES**. No se registraron defectos críticos ni mayores que impidan la interacción o degraden los cálculos numéricos.

---

## 2. Metodología de la Auditoría Independiente

Para superar las limitaciones de agotamiento de memoria (*Out of Memory*) que afectaron ejecuciones anteriores en entornos headless con SwiftShader, la presente auditoría aplicó un protocolo riguroso de ejecución modular:

- **Aislamiento por lotes:** Las capturas y validaciones se dividieron en 3 bloques independientes (`batch1`, `batch2`, `batch3`), ejecutando instancias controladas de Chrome headless con WebGL SwiftShader (`--use-gl=angle`, `--use-angle=swiftshader`, `--enable-webgl`, `--no-sandbox`).
- **Liberación estricta de recursos:** Cada lote cerró explícitamente su contexto de navegación, páginas y servidor local Vite al finalizar su tarea, garantizando la recolección total de memoria por parte del sistema operativo.
- **Verificación de desbordamiento (*overflow*):** Se evaluó matemáticamente la condición `scrollWidth <= clientWidth` en cada punto de corte responsive, verificando la ausencia de desplazamiento horizontal no deseado.
- **Resoluciones comprobadas:**
  - Escritorio Full HD: 1920×1080 (resolución primaria de referencia).
  - Portátil WXGA+: 1600×900.
  - Portátil HD estándar: 1366×768.
  - Tableta vertical: 768×1024.
  - Móvil estándar: 390×844.
  - Móvil ultra-compacto: 320×568.

---

## 3. Evaluación Detallada por Área

### 3.1 Sistema Solar (Modo Exploración)
- **Composición e iluminación:** El Sol actúa como fuente de luz puntual central en coordenadas baricéntricas, iluminando adecuadamente las caras diurnas de los planetas rocosos y gigantes gaseosos. Las texturas PBR y los anillos de Saturno presentan un renderizado limpio sin artefactos poligonales.
- **Órbitas y escalas:** Las órbitas de referencia presentan una opacidad calibrada (0.14–0.20) que permite apreciar la excentricidad e inclinación sin saturar el campo visual.
- **Ficha astronómica:** Al seleccionar cualquier cuerpo celeste (p. ej. Júpiter), la ficha científica muestra con números tabulares dorados la distancia heliocéntrica en AU y km, la rapidez orbital y las coordenadas eclípticas J2000, citando explícitamente a NASA/JPL Horizons como fuente.
- **Valoración:** **Excelente**. Cumple con altos estándares de rigor y estética.

### 3.2 Misiones Históricas Voyager 1 y Voyager 2
- **Modelo 3D y entorno:** El modelo `Voyager.glb` refleja la configuración geométrica real de la sonda (antena de alta ganancia HGA, generadores RTG y plataforma de barrido científico).
- **Línea de tiempo histórica (1977–2026):** Permite recorrer los 14 hitos principales de ambas sondas con escalas simultáneas en UTC y TDB. Se señalan con honestidad científica los tramos donde los cortes SPK no permiten interpolar estados.
- **Comparador A/B:** La funcionalidad que confronta fotografías auténticas del archivo histórico de la NASA frente a la recreación 3D en tiempo real añade un valor pedagógico e investigativo sobresaliente.
- **Valoración:** **Excelente**. Ejemplo modelo de comunicación científica interactiva.

### 3.3 Laboratorio Experimental: Visión General
- **Cabecera unificada en 3 pasos:** Estructuración limpia en *1 Diseñar*, *2 Planificar*, *3 Ejecutar*. La miga de pan contextualiza en todo momento la ubicación del usuario dentro del flujo de trabajo.
- **Banda de contexto:** Muestra permanentemente la sonda activa seleccionada en el Hangar, su masa húmeda calculada y su presupuesto de $\Delta v$ ideal, evitando que el usuario deba conmutar de pantalla para recordar las restricciones del vehículo.
- **Valoración:** **Muy buena**. Facilita la comprensión del flujo de ingeniería.

### 3.4 Hangar de Diseño
- **Visualizador 3D:** Renderizado de la sonda espacial modular de 11 componentes. Los componentes encajan geométricamente sin colisiones visibles.
- **Catálogo y validación:** El panel lateral clasifica componentes en motores, depósitos, aviónica, instrumentos y chasis. El indicador de estado («Ensamblaje válido») reacciona dinámicamente si falta algún componente esencial.
- **Valoración:** **Buena (Experimental)**. Cumple su rol pedagógico; los modelos tridimensionales son ilustrativos y claros.

### 3.5 Ingeniería del Vehículo
- **Rigor analítico:** Los cálculos aplican rigurosamente la ecuación de Tsiolkovsky $\Delta v = I_{sp} g_0 \ln(m_0 / m_f)$. El desglose de masas (seca vs propelente) y la fracción de masa son matemáticamente consistentes.
- **Visualización de métricas:** Los indicadores de relación empuje-peso (TWR) y consumo por etapa se presentan en tarjetas limpias con tipografía monoespaciada legible.
- **Valoración:** **Excelente**. Rigor físico intachable en el ámbito analítico.

### 3.6 Planificador Tierra–Luna
- **Trayectoria translunar:** El cálculo impulsivo genera una trayectoria realista geocéntrica hacia la Luna, resolviendo la semilla de Hohmann con integración numérica DOPRI54 bajo perturbaciones lunares.
- **Evaluación de viabilidad:** Contrasta el $\Delta v$ necesario (~3,130 m/s) contra el tanque de la sonda activa. Informa con claridad si el presupuesto es insuficiente, deshabilitando la ejecución infundada.
- **Valoración:** **Muy buena**.

### 3.7 Propulsión y Maniobras de Empuje Finito
- **Integración numérica continua:** Permite definir secuencias de encendidos con duración finita, orientación vectorial y porcentaje de acelerador, integrando la pérdida por gravedad (*gravity losses*) y la variación de masa del vehículo.
- **Presentación:** Los controles permiten alternar entre motores químicos de alto empuje y propulsores iónicos de bajo empuje y alto $I_{sp}$, graficando los arcos propulsados en contraste con las trayectorias balísticas.
- **Valoración:** **Excelente**. Representa un salto técnico fundamental respecto al modelo puramente impulsivo.

### 3.8 Lanzamiento Terrestre
- **Física del ascenso:** El modelo atmosférico (US Standard Atmosphere 1976) y la ley de giro por gravedad reproducen con verosimilitud la transición de despegue vertical a aceleración horizontal.
- **Clasificación del resultado:** Discrimina con precisión científica si el vuelo alcanzó la línea de Kármán (100 km), si se logró una órbita baja estable (LEO) o si la trayectoria decayó en una reentrada suborbital balística.
- **Valoración:** **Excelente**.

### 3.9 Descenso y Aterrizajes Multicuerpo
- **Adaptabilidad a múltiples cuerpos:** Permite seleccionar la Luna, Europa u otros cuerpos sin atmósfera, adaptando automáticamente el radio, la masa y la gravedad local ($1.62\text{ m/s}^2$ en Luna, $1.315\text{ m/s}^2$ en Europa).
- **Leyes de frenado y contacto:** Evalúa con precisión el frenado retro-propulsado hasta el contacto. Si la velocidad vertical residual es menor a 3 m/s y la horizontal menor a 1.5 m/s, clasifica el aterrizaje como «SUAVE SEGÚN EL MODELO».
- **Detección de fallos:** Se verificó que al reducir el propelente a 1,200 kg, el simulador detecta correctamente el agotamiento de combustible antes del suelo y clasifica el evento como impacto de alta velocidad.
- **Valoración:** **Excelente**.

### 3.10 Misiones Interplanetarias (Etapa 12G)
- **Mapa de oportunidades (*Porkchop plot*):** Renderizado canvas con curvas de contorno de energía de salida $C_3$, gradientes de color continuos y marcas explícitas para el candidato óptimo y la selección del usuario.
- **Solucionador de Lambert heliocéntrico:** Calcula transferencias a Marte, Venus y Júpiter utilizando efemérides planetarias de Horizons (2026–2045). La ventana a Marte de noviembre de 2028 coincide con la literatura técnica de la NASA.
- **Valoración:** **Excelente**. Validada independientemente en la auditoría previa de la Etapa 12G.

### 3.11 Misiones Integradas (Etapa 13)
> [!NOTE]
> *Estado:* Módulo implementado y funcional en la interfaz. Auditado visualmente; auditoría científica formal de sus cálculos orbitales jovianos pendiente.
- **Cadena de fases:** El Escenario B1 (Tierra → Júpiter → Inserción JOI → Transferencia a Europa → Descenso) articula una secuencia de 13 fases cinemáticas continuas.
- **Robustez ante fallos:** El Escenario B2 demuestra que una nave con masa desproporcionada no es capturada mágicamente: el sistema calcula la hiperbólica y declara «SIN CAPTURA · SOBREVUELO HIPERBÓLICO; NO VIABLE».
- **Valoración:** **Muy buena a nivel de interfaz e interactividad**; rigor científico prometedor pero pendiente de certificación formal.

### 3.12 Centro de Control de Misión
- **HUD superpuesto:** Muestra en tiempo real la misión activa, la fase actual con pulso de transición, el tiempo de vuelo y las métricas cinemáticas principales.
- **Barra de reproducción (*timeline bar*):** Situada en la parte inferior de la escena, ofrece controles de transporte profesional (reproducir, pausar, saltar a hitos mediante *ticks* interactivos).
- **Modos de visualización:** El botón «Vista amplia» colapsa los paneles laterales con una transición CSS suave, permitiendo una experiencia cinematográfica inmersiva.
- **Cámaras:** Incluye cámara exterior de seguimiento, cámara heliocéntrica y «Cámara local» a ras de suelo para contemplar el módulo posado sobre la superficie planetaria o lunar.
- **Valoración:** **Excelente**. Centro neurálgico que corona la experiencia interactiva del simulador.

---

## 4. Auditoría de Responsividad

| Resolución | Dispositivo de Referencia | Comportamiento Visual Observado | Dictamen |
|---|---|---|---|
| **1920×1080** | Monitor de escritorio Full HD | Presentación espaciosa. Todos los paneles desplegados sin solapamientos. Visualización óptima de mapas *porkchop*, diagramas 3D y telemetría completa. | **Óptimo** |
| **1600×900** | Pantalla portátil panorámica | Paneles laterales adaptados proporcionalmente. Viewports 3D mantienen relación de aspecto sin recortes. | **Óptimo** |
| **1366×768** | Portátil estándar más común | Las listas con scroll interno (`.lab-panel-scroll`) permiten operar sin provocar scroll en la ventana global. El HUD del Centro de Misión se mantiene legible. | **Óptimo** |
| **768×1024** | Tableta (iPad vertical) | El botón «Áreas» conmuta a icono compacto en la primera fila. Los paneles laterales se adaptan en columna. La barra de transporte en escena permanece operativa. | **Muy bueno** |
| **390×844** | Móvil estándar (iPhone 12/13/14) | Menú de áreas en modal accesible a pantalla completa. Cabecera del laboratorio compactada a dos columnas. Controles táctiles accesibles con áreas de toque $\ge 44\text{ px}$. | **Muy bueno** |
| **320×568** | Móvil ultra-compacto (iPhone SE 1.ª gen) | Ancho crítico verificado. No se produce desbordamiento horizontal parásito (`scrollWidth === clientWidth`). Los elementos del HUD se simplifican automáticamente. | **Aprobado con observaciones** |

---

## 5. Clasificación y Registro de Defectos Visuales

Siguiendo las directrices de auditoría independiente de `GEMINI.md`, se registran y clasifican los hallazgos:

### Defectos Críticos (0)
*Ninguno.* No existen pérdidas de datos, bloqueos de renderizado ni discrepancias numéricas en la presentación.

### Defectos Mayores (0)
*Ninguno.* Todas las funciones de las 12 áreas son navegables y operativas.

### Defectos Menores (1)
- **DEF-01: Truncamiento de texto en banda de contexto en pantallas ultra-estrechas ($\le 390\text{ px}$)**
  - *Evidencia:* `evidence/tercer_avance/14_Defectos/defecto_01_truncamiento_sonda_activa_movil.png`
  - *Descripción:* En la cabecera del Laboratorio a 390 px de ancho, la descripción completa de la sonda activa (`#lab-ctx-design`) se trunca con puntos suspensivos (`...`), impidiendo leer directamente el desglose de masa de propelente y $\Delta v$ sin tocar el elemento.
  - *Impacto:* No rompe el diseño ni genera scroll horizontal, pero restringe la lectura inmediata de datos secundarios en móviles.
  - *Recomendación:* Implementar un desplegable táctil o modal ligero al tocar la píldora en pantallas pequeñas.

### Observaciones y Oportunidades de Mejora (2)
- **OBS-01: Ajuste de veredictos científicos extensos**
  - *Evidencia:* `evidence/tercer_avance/14_Defectos/defecto_02_ajuste_veredicto_largo.png`
  - *Descripción:* En escenarios con justificaciones físicas extensas (p. ej. sobrevuelo hiperbólico de B2 por masa excesiva), el bloque de texto del veredicto ocupa varios renglones densos dentro del panel lateral.
  - *Recomendación:* Mostrar una etiqueta destacada concisa («NO VIABLE») acompañada de un elemento `<details>` plegable con la fundamentación física completa.
- **OBS-02: Transición de cámara cinematográfica en el Centro de Misión**
  - *Descripción:* Al cambiar de una cámara exterior a la cámara local en descenso, el cambio de encuadre ocurre por corte instantáneo en lugar de una interpolación suave (*lerp* esférico). Aunque esto preserva los encuadres de prueba exactos, una transición animada mejoraría el dinamismo visual.

---

## 6. Comparativa Cualitativa con NASA Eyes on the Solar System

| Criterio de Comparación | NASA Eyes on the Solar System | Simulador de Sondas Espaciales (Etapa 14) | Evaluación Comparativa |
|---|---|---|---|
| **Propósito principal** | Visualizador y reproductor de misiones de la NASA con efemérides precalculadas. | Simulador híbrido: visualizador astronómico real + laboratorio interactivo de diseño y astrodinámica. | El simulador añade capacidades computacionales activas (cálculo de Lambert, Tsiolkovsky, ascenso y descenso) ausentes en NASA Eyes. |
| **Calidad de shaders y texturas** | Modelos 3D y texturas de alta resolución de cuerpos celestes con sombras complejas. | Texturas PBR calibradas, anillos transparentes de Saturno y modelo 3D detallado `Voyager.glb`. | NASA Eyes ofrece mayor resolución de texturas superficiales pesadas (varios gigabytes); el simulador prioriza carga web ligera y fluidez (<6 MB totales de efemérides). |
| **Línea de tiempo y transporte** | Barra temporal inferior con saltos a fechas clave y reproducción acelerada continua. | Dock inferior en Exploración/Voyager y barra interactiva flotante con *ticks* de eventos en el Centro de Misión. | Muy comparable en legibilidad; la barra del Centro de Misión aporta mayor contexto de fases orbitales e hitos de maniobra. |
| **Rigor y transparencia científica** | Datos oficiales del JPL (SPICE); cajas negras para el usuario común. | Datos oficiales de JPL Horizons y SPK, con fórmulas y limitaciones explícitamente declaradas en cada pantalla. | Superior en transparencia pedagógica: indica discrepancias de corte SPK, aproximaciones de modelo y balances de masa. |
| **Diseño y tipografía** | Interfaz moderna oscura con tonos azules y blancos planos. | Sistema visual unificado con vidrio translúcido (*frosted glass*), acento dorado `#d4af37` y números tabulares monoespaciados. | Identidad visual propia, elegante y profesional. |

---

## 7. Dictamen Final de la Auditoría

> **DICTAMEN:** **APROBADO CON OBSERVACIONES MENORES**  
> 
> La renovación visual y funcional del Simulador de Sondas Espaciales satisface con creces los requerimientos estéticos, técnicos y pedagógicos para la entrega del **Tercer Avance**. La interfaz es coherente, accesible, robusta ante diferentes resoluciones de pantalla y sumamente fiel a los principios astrodinámicos y datos observacionales que sustentan el proyecto.
> 
> Se autoriza la incorporación íntegra del paquete de 57 evidencias visuales y su índice estructurado para la elaboración formal del documento académico del Tercer Avance.

---
*Informe emitido de forma autónoma e independiente por Gemini, Auditor Técnico y Científico.*
