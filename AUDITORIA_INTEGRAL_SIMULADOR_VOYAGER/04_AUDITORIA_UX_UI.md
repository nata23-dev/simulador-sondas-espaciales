# 04. Auditoría de Experiencia de Usuario (UX) e Interfaz (UI)

**Proyecto:** Simulador de Sondas Espaciales (Sistema Solar y Misiones Voyager 1 y 2)  
**Referencia de Calidad:** *NASA Eyes on the Solar System*  
**Evaluador:** Especialista Senior en UX/UI y Diseño de Interfaces Científicas  
**Fecha:** 31 de octubre de 2026  

---

## 1. Evaluación por Arquetipos de Usuario (Personas)

### Perfil 1: Visitante Ocasional (Sin conocimientos astronómicos previos)
- **Experiencia de Entrada:** El modal de bienvenida (`#historical-welcome-modal`) es un acierto rotundo. Evita la desorientación inicial y ofrece dos caminos inequívocos: *"Iniciar recorrido guiado"* o *"Explorar libremente"*.
- **Interacción Espacial:** La navegación orbital mediante arrastre y rueda del ratón resulta natural e intuitiva. Las indicaciones en la base de la pantalla (*"Arrastra para orbitar · Doble clic para viajar"*) facilitan el aprendizaje sin fricción.
- **Puntos de Fricción:** En el modo histórico, la conmutación entre Voyager 1 y Voyager 2 situada en el dock inferior es clara, pero la existencia simultánea de una barra superior con botones *"Seguir V1 / Seguir V2"* genera duplicidad y duda sobre cuál pulsar.

### Perfil 2: Estudiante de Secundaria / Universidad
- **Comprensión Visual:** Las trayectorias tridimensionales permiten asimilar de inmediato el concepto del *Grand Tour* planetario y la asistencia gravitatoria.
- **Didáctica del Comparador NASA / 3D:** El comparador A/B es una herramienta pedagógica excepcional: muestra al estudiante cómo una cámara espacial ve un planeta real frente a cómo se proyecta en un mapa computacional.
- **Puntos de Fricción:** Los selectores numéricos de fecha histórica (Año, Mes, Día, Hora) en la línea temporal inferior compiten con el slider continuo. El estudiante suele preferir deslizar la barra de tiempo o pulsar los hitos preconfigurados en lugar de ajustar horas manualmente.

### Perfil 3: Investigador / Usuario con Conocimientos Científicos
- **Rigor y Metadatos:** Valora enormemente la precisión de los datos: marcos ICRF Eclíptico J2000, tiempos en TDB, segundos intercalares IERS y fuentes explícitas con identificadores NAIF (`-31`, `-32`, `399`, etc.).
- **Escala Científica 1:1:** La posibilidad de alternar a escala 1:1 física verdadera (donde los planetas son puntos milimétricos en la inmensidad del espacio) cumple los estándares de *NASA Eyes*.
- **Puntos de Fricción:** La falta de rotación de la mancha joviana o las tormentas neptunianas en la recreación fotográfica es comprensible, pero la nota aclaratoria debe destacar que las efemérides de actitud CK de SPICE están fuera del alcance actual.

### Perfil 4: Usuario de Primera Visita (First-time User)
- **Carga Inicial y Tiempo de Respuesta:** Carga en menos de 300 ms en local. No hay pantallas de carga infinitas ni pantallas negras desorientadoras.
- **Descubrimiento de Funciones:** El nuevo panel lateral (Inspector de Contexto) unifica de forma sobresaliente pestañas que antes estaban dispersas (Telemetría, Historia, Fotos, Cámaras).

---

## 2. Comparativa Frente a NASA Eyes on the Solar System

| Criterio de Diseño | NASA Eyes on the Solar System | Simulador Voyager (Estado Actual) | Veredicto Auditor |
| :--- | :--- | :--- | :--- |
| **Protagonismo del 3D** | Lienzo completo, interfaz flotante minimalista. | Lienzo completo, paneles flotantes translúcidos (`backdrop-filter: blur(16px)`). | **Alineado (95%)** |
| **Paleta Cromática** | Fondo negro espacial (`#000`), acentos cian y ámbar tenues. | Fondo `#030406`, acentos cian técnico (`#48cae4`), tipografía Inter/SF Pro. | **Excelente (95%)** |
| **Jerarquía Visual** | Título de cuerpo enfocado destacado; datos secundarios en acordeón. | Encabezado limpio (`VISTA CIENTÍFICA / 01`), fecha y distancia visibles. | **Muy Bueno (88%)** |
| **Línea Temporal** | Barra inferior interactiva con scrubber y marcas de encuentro. | Barra inferior con scrubber, marcas de décadas e hitos automáticos. | **Muy Bueno (85%)** |
| **Densidad de Información** | Información dosificada en tarjetas progresivas. | Buena dosificación mediante el Inspector de Contexto deslizable. | **Bueno (80%)** |
| **Modo Inmersivo** | Atajo de teclado y botón para ocultar todo el HUD. | Atajo tecla <kbd>I</kbd> o botón inferior que oculta todo el HUD con transición. | **Alineado (100%)** |

---

## 3. Análisis de Componentes de Interfaz

### Cabecera (Header) y Selector de Modo
- **Identidad Visual:** El isotipo orbital y la tipografía de marca (`EXPLORADOR ESPACIAL · Simulador de Sondas Espaciales`) transmiten seriedad institucional.
- **Selector de Modo Principal:** Los tres botones (`Sistema Solar`, `Misiones históricas`, `Experimental`) cuentan con estados activos claros (`aria-pressed="true"`, fondo cian semitransparente con borde iluminado).
- **Menú de Fuentes:** El indicador verde de estado (`NASA / JPL`) ofrece confianza inmediata sobre la procedencia de los datos.

### Inspector de Contexto (Panel Lateral Deslizable)
- **Estructura por Pestañas:** Dispone de 5 pestañas principales (`Explorar`, `Telemetría`, `Historia`, `Fotografías`, `Cámaras`).
- **Comportamiento Deslizable:** Admite estados cerrado, medio y expandido. Al abrirse, desplaza sutilmente el centro focal de la cámara para que el objeto enfocado no quede tapado por el panel.
- **Punto de Mejora:** En pantallas de 1366x768 (laptop estándar), el panel expandido ocupa 480px, lo que deja menos del 65% de la pantalla para el lienzo 3D. Se recomienda un ancho máximo del 35% del viewport en pantallas medianas.

### Dock Inferior de Misiones Voyager
- **Diseño del Dock:** Ubicado discretamente sobre la línea temporal, ofrece 3 botones redondeados (`Voyager 2`, `Voyager 1`, `Ambas`) con puntos de color identificativos (azul para V1, verde para V2).
- **Botones de Acción Rápida:** Incluye accesos directos al *Recorrido guiado*, *Lanzamiento 3D* y *¿Cómo funciona?*.
- **Punto de Mejora:** Existe una redundancia visual menor entre el selector del dock y la pestaña de "Cámaras" en el inspector lateral.

### Línea Temporal Histórica (1977–2026)
- **Lectura Temporal:** El reloj digital muestra fecha y hora UTC exacta (`YYYY-MM-DD · HH:MM:SS UTC`).
- **Transporte:** Botones de retroceso, reproducción/pausa, salto a hito anterior/siguiente y avance rápido a noviembre de 2026.
- **Puntos de Asistencia:** Las casillas *"Frenar"* (reduce la velocidad al acercarse a planetas) y *"Pausar hito"* (detiene la reproducción exactamente en el encuentro sin saltarse datos) ofrecen un control excelente.

---

## 4. Accesibilidad Web (WCAG 2.1 AA)

- **Contraste de Color:** La relación de contraste entre los textos blancos (`#f1f5f9`) y el fondo semitransparente oscuro supera **7.5:1** (cumple nivel AAA de WCAG).
- **Semántica y Atributos ARIA:** Los elementos interactivos disponen de `role="tab"`, `role="tabpanel"`, `role="group"`, `aria-label`, `aria-pressed` y `aria-selected` adecuadamente asignados.
- **Navegación por Teclado:** Se comprobó navegación fluida mediante <kbd>Tab</kbd> y teclas de dirección en pestañas y controles temporales. La tecla <kbd>Escape</kbd> cierra menús y restablece la cámara.
- **Movimiento Reducido (`prefers-reduced-motion`):** La hoja de estilos `workspace-layout.css` detecta la preferencia del sistema operativo y reduce las duraciones de transición a `0s`.
- **Defecto Crítico de Accesibilidad:** La ausencia del método `hud.anunciar` impide que las transiciones a los hitos históricos se anuncien al sintetizador de voz mediante la región viva `#hud-announcement` (`role="status"`).

---

## 5. Hallazgos UX/UI y Recomendaciones Específicas

1. **Eliminar Redundancia de Cámaras:** Eliminar los botones secundarios *"Seguir V1 / Seguir V2"* de la barra superior, consolidando toda la selección en el dock inferior unificado.
2. **Priorizar Scrubber Temporal en Móvil:** En viewports táctiles, ocultar los 4 desplegables numéricos de Año/Mes/Día/Hora para maximizar el área táctil del deslizador continuo.
3. **Cierre Automático del Inspector en Comparador A/B:** Cuando el usuario abre el comparador fotográfico NASA/3D, el inspector lateral debe replegarse automáticamente para otorgar el 100% del espacio al análisis visual comparativo.
