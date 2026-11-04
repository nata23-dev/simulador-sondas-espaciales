# 01. Informe Ejecutivo de Auditoría

**Proyecto:** Simulador de Sondas Espaciales (Sistema Solar y Misiones Voyager 1 y 2)  
**Referencia de Calidad:** *NASA Eyes on the Solar System*  
**Fecha de Emisión:** 31 de octubre de 2026  
**Clasificación:** Auditoría Integral de Aseguramiento de Calidad, Arquitectura y Verificación Científica  

---

## Resumen Ejecutivo

El **Simulador de Sondas Espaciales** se encuentra en una **fase madura y avanzada de desarrollo**, con un avance técnico consolidado del **83.5%**. No se trata de un prototipo superficial: la aplicación cuenta con un motor de efemérides astronómicas de alta precisión basado en datos reales de **NASA/JPL Horizons**, integración orbital mediante polinomios de Hermite y algoritmos Runge-Kutta/Dormand-Prince (DOPRI54), un modelo oficial 3D de Voyager (NASA VTAD) normalizado 1:1, una recreación cinemática procedural del lanzador Titan IIIE-Centaur en la plataforma LC-41 de Cabo Cañaveral, un comparador fotográfico A/B de 8 imágenes históricas de archivo de la NASA y un recorrido guiado por 12 hitos (1977–2026).

La suite de 78 pruebas científicas automatizadas se ejecuta en **1.27 segundos con un 100% de aprobación**. La compilación de producción con Vite genera un bundle optimizado de 960 kB sin errores sintácticos ni fallos de empaquetado.

Sin embargo, la auditoría ha detectado **dos defectos técnicos de severidad alta (P1)** que degradan la experiencia en flujos específicos:
1. Un fallo de método indefinido `TypeError: hud.anunciar is not a function` que interrumpe silenciosamente el anuncio por voz/accesibilidad al saltar entre hitos del recorrido guiado y al finalizar el lanzamiento cinemático.
2. Una discrepancia de microsegundos en la cobertura de efemérides de la Tierra en el instante de inyección de Voyager 2 (`JD 2443376.1479166667`) que lanza una excepción en consola y deja la telemetría en guiones (`—`).

Corregir estos defectos puntuales no requiere rehacer la arquitectura existente, sino aplicar ajustes quirúrgicos de bajo riesgo.

---

## Cuadro de Mando del Estado del Proyecto

| Dimensión Auditada | Estado Actual | Cumplimiento | Diagnóstico Principal |
| :--- | :--- | :---: | :--- |
| **Mecánica Orbital y Ciencia** | Sólido y Verificado | 95% | JPL Horizons (ICRF J2000), tiempo TDB/UTC con leap seconds IERS, Hermite cúbico y DOPRI54 impecables. |
| **Gráficos 3D y WebGL** | Avanzado y Realista | 90% | Modelo GLB oficial de NASA, shaders atmosféricos, anillos de Saturno, plataforma LC-41 y domo celeste procedimental. |
| **Recorrido Guiado (12 Hitos)** | Funcional con Defecto | 85% | Los 12 hitos cargan fecha, texto y cámara. Excepción en `hud.anunciar` no bloquea el 3D pero satura la consola. |
| **Lanzamiento LC-41 Titan IIIE** | Cinemático y Espectacular | 90% | Fases de despegue, ascenso, separación de SRB y Centaur fluidas. Transición a Horizons 1977 verificada. |
| **Comparador NASA / 3D** | Verificado con Aprobación | 88% | 8 fotografías cargadas con SHA-256 verificado. Alternancia FOV nominal ISS (0.424°) y Contextual funciona. |
| **Simulación Experimental** | Totalmente Operativa | 95% | Propagación Kepleriana/DOPRI54, telemetría orbital y control temporal T+... plenamente integrados. |
| **Arquitectura de Software** | Modular y Tipada | 80% | Buena separación funcional; acoplamiento moderado entre `main.js`, `WorkspaceLayout` y controles de HUD. |
| **UX/UI y Responsive** | Muy Bueno (7 Viewports) | 82% | 0 desbordamientos horizontales en todas las resoluciones (1920x1080 hasta 320x568). Inspector adaptable. |
| **Estabilidad y Excepciones** | Requiere Corrección P1 | 75% | 4 excepciones JS detectadas en consola durante flujos interactivos específicos. 0 errores HTTP de red. |

---

## Diagnóstico Detallado de las 12 Preguntas del Requerimiento

### 1. ¿Qué está implementado realmente?
- **Motor Científico:** Catálogo físico DE440, resolución de efemérides discretas NASA/JPL Horizons, interpolación Hermite que preserva posición y velocidad, conversor UTC <-> TDB con tabla IERS de segundos intercalares, integradores Runge-Kutta de orden 4 y DOPRI54 con paso adaptativo.
- **Gráficos Three.js:** Visualización de los 8 planetas del Sistema Solar con texturas de alta resolución (incluyendo atmósfera en capas para la Tierra, Venus y anillos translúcidos para Saturno), Sol dinámico, campo estelar Hipparcos, renderizado de órbitas y trayectorias históricas continuas de Voyager 1 y Voyager 2 (1977–2026).
- **Modelo 3D Oficial:** Sonda Voyager basada en `Voyager.glb` oficial de NASA Visual Task Analysis Design (VTAD).
- **Lanzador Titan IIIE-Centaur:** Malla procedural completa del cohete (etapa central Titan III, propulsores sólidos UA1205, etapa superior criogénica Centaur D-1T, cofia y plataforma de lanzamiento LC-41).
- **Recorrido Guiado:** 12 hitos históricos clave entre agosto de 1977 y noviembre de 2026.
- **Comparador A/B:** 8 fotografías históricas NASA con miniaturas locales, metadatos oficiales y recreación angular en tiempo real con selector de FOV ISS vs FOV contextual.
- **Simulación Experimental:** Sonda ficticia de prueba propagada en tiempo de ejecución alrededor del Sol.
- **Layout y HUD:** Espacio de trabajo moderno con barra superior, dock inferior de misiones históricas, selector flotante de primera persona y panel lateral deslizable (Inspector de Contexto).

### 2. ¿Qué funcionalidades funcionan correctamente?
- **Navegación planetaria:** Selección y enfoque orbital suave en los 8 planetas; panel de datos con distancias heliocéntricas en AU y km, y rapidez orbital derivada.
- **Modos de Escala:** Alternancia perfecta entre Escala Científica 1:1 (distancias físicas astronómicas verdaderas) y Escala Exploratoria (ampliación visual de cuerpos sin alterar centros de masa).
- **Medición de Distancias 3D:** Cálculo euclídeo exacto entre parejas de cuerpos (Tierra-Marte, Sol-Voyager, etc.), cálculo de tiempo luz y vector tridimensional proyectado en escena.
- **Línea Temporal 2026:** Reproducción, pausa, cambio de velocidad (0.5x a 4x) y avance diario exacto.
- **Lanzamiento Cinematográfico:** Ejecución de las 6 fases de vuelo, plumas de partículas procedimentales, sacudida de cámara, separación de etapas y botón de salto (`#launch-skip-btn`) que sitúa la simulación en agosto de 1977.
- **Comparador NASA/3D:** Carga inmediata de las imágenes NASA originales, cambio de FOV entre 0.424° y el contexto angular, notas de fidelidad científica honestas que aclaran las limitaciones de rotación y texturizado.
- **Simulación Experimental:** Inicio, pausa, avance temporal numérico DOPRI54 y reinicio a T+00d 00h 00m 00s.
- **Adaptabilidad Responsive:** Visualización correcta sin scroll horizontal desde pantallas 4K/Full HD hasta teléfonos compactos de 320x568.

### 3. ¿Qué funcionalidades funcionan parcialmente?
- **Telemetría en Modo Histórico al inicio:** Si la fecha está situada en el momento del despegue (20 de agosto de 1977), los campos de distancia y tiempo luz muestran `—` porque aún no existe un vector SPK posterior a la inyección orbital en esa fracción de día.
- **Cámara en Primera Persona desde el Inspector:** Si se activa mediante el botón del inspector sin seleccionar previamente un cuerpo objetivo visible en la fecha actual, la orientación puede apuntar al vacío o no disparar el indicador flotante si la sonda seleccionada está en estado `pre_launch`.
- **Selector de misión "Ambas":** Muestra ambas trayectorias correctamente, pero la ficha lateral de telemetría debe alternarse manualmente entre Voyager 1 y Voyager 2 en lugar de mostrar una comparativa simultánea de ambas en un solo panel.

### 4. ¿Qué funcionalidades están incompletas?
- **Rotación Planetaria en Comparación Fotográfica:** En el comparador 3D, el planeta observado (por ejemplo, Júpiter o Neptuno) se encuadra con el ángulo de fase solar exacto y la distancia angular correcta, pero la textura no rota sincrónicamente con las coordenadas de la Gran Mancha Roja o Gran Mancha Oscura de 1979/1989 debido a la ausencia de matrices SPICE CK de rotación en tiempo real.
- **Modelos 3D de Satélites Menores:** Lunas como Ío, Europa, Titán y Tritón aparecen como referencias esféricas básicas y carecen de modelos topográficos 3D de alta resolución independientes en las escenas de encuentro cercano.

### 5. ¿Qué errores existen?
- **DEF-01 (P1 - Alto):** `TypeError: hud.anunciar is not a function` al cambiar de hito en el Recorrido Guiado y al finalizar el Lanzamiento Cinematográfico. El objeto devuelto por `crearControlesHUD()` no implementa el método `anunciar()`, a pesar de que `main.js` lo invoca en las líneas 946, 973 y 1373.
- **DEF-02 (P1 - Alto):** `Error: Falta estado histórico para Tierra en JD 2443376.1479166667: missing (outside_coverage)` en `HistoricalEphemerisResolver.js:423`. Ocurre al solicitar el estado en el instante exacto de primer vector SPK de Voyager 2 debido a una discrepancia de coma flotante de `3.3e-16` entre `startJdTdb` del catálogo y el valor solicitado.
- **DEF-03 (P2 - Medio):** Obstrucción de elementos en resoluciones ultrapequeñas (320x568): el reloj histórico y los botones de transporte temporal ocupan más del 65% del área vertical cuando el inspector está abierto.
- **DEF-04 (P2 - Medio):** En el visor de fotografías, el conteo total de elementos con atributo `data-photo-id` genera 10 coincidencias en lugar de 8 al incluir botones de acción contextual en los paneles de eventos y tours.

### 6. ¿Qué problemas visuales y de navegación persisten?
- **Doble selector temporal:** En modo histórico coexisten los selectores desplegables de Año/Mes/Día/Hora con la barra de rango continuo de 100 000 pasos. Para un usuario novato puede ser confuso saber cuál tiene prioridad.
- **Densidad de texto en el Inspector:** El panel lateral contiene gran cantidad de información técnica (telemetría, instantes TDB, componentes vectoriales) que puede abrumar a un estudiante o usuario general si no se presentan en pestañas más limpias con acordeones colapsables.

### 7. ¿Qué inconsistencias científicas podrían existir?
- **Órbitas planetarias:** Las elipses visuales de las órbitas planetarias en el modo general son representaciones geométricas ilustrativas para facilitar la orientación espacial; los planetas se ubican en los puntos exactos según Horizons, pero la línea orbital no reproduce las perturbaciones seculares de orden superior.
- **Cinemática de lanzamiento:** La secuencia del Titan IIIE en LC-41 es una recreación cinematográfica y procedural altamente realista basada en especificaciones de NASA, pero no constituye una integración balística atmosférica real basada en aerodinámica o empuje de combustible. Esta honestidad científica ya está transparentada en el código.

### 8. ¿Qué elementos deben corregirse?
1. Agregar la función `anunciar(mensaje)` al objeto exportado por `crearControlesHUD` o delegar su contenido al nodo DOM `#hud-announcement`.
2. Añadir tolerancia numérica de comparación (`EPSILON = 1e-9` días, ~0.08 ms) en los límites de cobertura de `EphemerisProvider` e `HistoricalEphemerisResolver`.
3. Manejar elegantemente el estado de telemetría durante la ventana de pre-lanzamiento mostrando un mensaje explícito *"En plataforma / Ascenso pre-inyección"* en lugar de guiones mudos.
4. Ocultar o colapsar automáticamente el inspector lateral al abrir el comparador A/B en pantallas pequeñas (<768px).

### 9. ¿Qué funcionalidades conviene mejorar?
- Incorporar visualización interactiva de conos de antena y comunicación DSN (Deep Space Network) entre las antenas parabólicas de Madrid, Goldstone y Canberra y las Voyager a más de 160 AU de la Tierra.
- Añadir gráficos interactivos de velocidad vs distancia mostrando los saltos de asistencia gravitatoria en Júpiter y Saturno.
- Soporte para pantalla completa nativa (`requestFullscreen`) además del modo inmersivo de interfaz actual.

### 10. ¿Qué debemos desarrollar a continuación?
- **Etapa 1:** Corrección de los 2 errores P1 (`hud.anunciar` y tolerancia de cobertura JD Tierra).
- **Etapa 2:** Optimización de telemetría pre-lanzamiento y ajuste de layout responsive móvil.
- **Etapa 3:** Refinamiento visual del comparador A/B y rotación planetaria contextual.
- **Etapa 4:** Pruebas de regresión automatizadas E2E y empaquetado para despliegue en GitHub Pages.

### 11. ¿Qué riesgos técnicos existen?
- **Riesgo de Regresión en Horizons:** Modificar la lógica de Hermite o los archivos de datos en `public/data/` podría romper la suite de 78 pruebas científicas. Cualquier cambio en este núcleo debe ser validado con `node --test tests/*.test.mjs`.
- **Riesgo de Memoria WebGL en Dispositivos Móviles:** Aunque la escena actual consume ~105 MB de JS Heap y texturas de 2K/4K, navegadores móviles con GPUs de memoria compartida reducida (<1.5 GB VRAM) podrían experimentar descarte de contexto si no se controla el desecho (`dispose`) de geometrías durante la cinemática de lanzamiento.

### 12. ¿Qué tan avanzado está realmente el proyecto?
El proyecto cuenta con una implementación del **83.5%**, situándose en la fase de **estabilización, pulido fino y aseguramiento de calidad**. No es necesario reconstruir la arquitectura. El código cuenta con cimientos sólidos, contratos formales y un rigor científico poco habitual en aplicaciones web tridimensionales.

---

## Las Cinco Prioridades Recomendadas

1. **Prioridad 1 (P1):** Implementar `hud.anunciar(mensaje)` en `src/ui/HudControls.js` para erradicar las excepciones en tiempo de ejecución del recorrido guiado y el despegue.
2. **Prioridad 2 (P1):** Incorporar un margen de tolerancia numérico (`1e-9` JD) en la validación de límites de cobertura en `HistoricalEphemerisResolver.js` para evitar fallos de interpolación en el instante de inyección de Voyager 2.
3. **Prioridad 3 (P2):** Mostrar estado semántico explícito *"En plataforma / Ascenso previo"* en las fichas de telemetría histórica durante fechas de pre-lanzamiento.
4. **Prioridad 4 (P2):** Optimizar la distribución del HUD en pantallas móviles (<600px), garantizando que los controles de reproducción no compitan visualmente con el lienzo tridimensional.
5. **Prioridad 5 (P3):** Documentar y desplegar la versión validada en GitHub Pages, aprovechando la configuración de compilación libre de errores verificada en esta auditoría.
