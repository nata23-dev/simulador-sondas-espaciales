# 06. Auditoría Responsive y Adaptabilidad en Múltiples Dispositivos

**Proyecto:** Simulador de Sondas Espaciales (Sistema Solar y Misiones Voyager 1 y 2)  
**Evaluador:** Especialista en Pruebas Funcionales y Responsive Web Design  
**Fecha:** 31 de octubre de 2026  
**Metodología:** Emulación de Métricas de Dispositivo con Chrome CDP (`Emulation.setDeviceMetricsOverride`), inspección de `scrollWidth` vs `innerWidth`, colisiones de cajas y captura de evidencias PNG.

---

## 1. Matriz de Resultados en las 7 Resoluciones Exigidas

| Resolución | Dispositivo de Referencia | Aspect Ratio | Desbordamiento Horizontal | Visibilidad 3D | Estado General | Evidencias PNG (Solar / Histórico) |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| **1920 × 1080** | Escritorio Full HD / 1080p | 16:9 | **0 px (Ninguno)** | 100% | **Excelente** | `059-...` / `060-...` |
| **1600 × 900** | Escritorio HD+ / Monitor 20" | 16:9 | **0 px (Ninguno)** | 100% | **Excelente** | `061-...` / `062-...` |
| **1366 × 768** | Portátil Estándar (Laptop) | 16:9 | **0 px (Ninguno)** | 90% | **Muy Bueno** | `063-...` / `064-...` |
| **1280 × 720** | HD Ready / Portátil Pequeño | 16:9 | **0 px (Ninguno)** | 85% | **Muy Bueno** | `065-...` / `066-...` |
| **768 × 1024** | Tablet en Orientación Vertical (iPad) | 3:4 | **0 px (Ninguno)** | 75% | **Bueno** | `067-...` / `068-...` |
| **390 × 844** | Smartphone Moderno (iPhone 14) | 19.5:9 | **0 px (Ninguno)** | 65% | **Aceptable (P2)** | `069-...` / `070-...` |
| **320 × 568** | Smartphone Compacto (iPhone SE 1.ª gen) | 16:9 | **0 px (Ninguno)** | 50% | **Aceptable (P2)** | `071-...` / `072-...` |

---

## 2. Análisis Detallado por Resolución

### 1. Viewport 1920 × 1080 (Escritorio Full HD)
- **Evidencias:** `059-responsive-desktop-fhd-1920x1080-solar.png` y `060-responsive-desktop-fhd-1920x1080-historico.png`.
- **Comportamiento:** La interfaz se despliega con máxima holgura. El dock inferior histórico se alinea perfectamente sobre la línea temporal. El inspector lateral en estado expandido deja más del 70% del área de pantalla libre para la visualización Three.js.
- **Tipografía y Legibilidad:** Todos los textos de métricas, etiquetas planetarias y lecturas de telemetría son nítidos y legibles.

### 2. Viewport 1600 × 900 (Monitor HD+)
- **Evidencias:** `061-responsive-desktop-hdplus-1600x900-solar.png` y `062-responsive-desktop-hdplus-1600x900-historico.png`.
- **Comportamiento:** Idéntica ergonomía a 1080p. Los menús desplegables superiores (`Capas`, `Distancias`, `Fuentes`) no chocan con el encabezado de escena.

### 3. Viewport 1366 × 768 (Laptop Estándar)
- **Evidencias:** `063-responsive-laptop-standard-1366x768-solar.png` y `064-responsive-laptop-standard-1366x768-historico.png`.
- **Comportamiento:** En altura vertical (768px), los paneles laterales abiertos reducen el espacio visual efectivo del Sistema Solar.
- **Observación UX:** Cuando el Inspector de Contexto está en estado `half` (anchura de 380px), la escena 3D se conserva despejada. Si el usuario activa `expand`, el panel ocupa casi el 40% horizontal.

### 4. Viewport 1280 × 720 (HD Ready)
- **Evidencias:** `065-responsive-hd-ready-1280x720-solar.png` y `066-responsive-hd-ready-1280x720-historico.png`.
- **Comportamiento:** No se genera desbordamiento horizontal (`scrollWidth === 1280`). Las etiquetas largas en la barra superior se abrevian automáticamente (`Cine` en lugar de `Vista cinematográfica`, `Sistema` en lugar de `Sistema Solar`).

### 5. Viewport 768 × 1024 (Tablet Vertical)
- **Evidencias:** `067-responsive-tablet-portrait-768x1024-solar.png` y `068-responsive-tablet-portrait-768x1024-historico.png`.
- **Comportamiento:** La interfaz adopta el diseño adaptativo intermedio. Los paneles laterales se desplazan hacia el fondo y la línea temporal histórica reduce el padding horizontal.
- **Interacción Táctil:** Los botones del dock de misiones (`Voyager 2`, `Voyager 1`, `Ambas`) tienen un área táctil mínima de 44x40 px, cumpliendo con las pautas de accesibilidad táctil de Apple y Google.

### 6. Viewport 390 × 844 (Móvil iPhone 14)
- **Evidencias:** `069-responsive-mobile-iphone14-390x844-solar.png` y `070-responsive-mobile-iphone14-390x844-historico.png`.
- **Comportamiento:** En orientación vertical, la cabecera colapsa los títulos secundarios. El dock inferior se apila horizontalmente en la parte inferior sobre los controles de tiempo.
- **Punto de Mejora (DEF-03):** La coexistencia del dock de misiones, el reloj UTC y los controles de reproducción ocupa aproximadamente el 40% inferior de la pantalla vertical. Se recomienda ocultar los desplegables de fecha numérica en móviles y mostrar únicamente el slider táctil.

### 7. Viewport 320 × 568 (Móvil Compacto iPhone SE 1.ª gen)
- **Evidencias:** `071-responsive-mobile-iphone-se1-320x568-solar.png` y `072-responsive-mobile-iphone-se1-320x568-historico.png`.
- **Comportamiento:** El caso más extremo de visualización móvil. **Se confirmó 0 desbordamiento horizontal** (`scrollWidth === 320`).
- **Problema Detectado:** En este tamaño de pantalla tan reducido, el lienzo 3D queda restringido a una ventana central de unos 260px de alto. Para una experiencia inmersiva en este formato, es esencial utilizar el botón flotante de Modo Inmersivo (<kbd>I</kbd>).

---

## 3. Conclusiones y Recomendaciones Responsive

1. **Estructura CSS Robusta:** Las hojas de estilo `workspace-layout.css` y `timeline-layout.css` implementan `box-sizing: border-box`, `max-width: 100vw` y `overflow-x: hidden` de manera impecable. Ningún viewport probado sufrió desbordamiento horizontal.
2. **Media Queries Eficientes:** Se detectan breakpoints limpios en `768px` y `480px`.
3. **Optimización Sugerida para Móviles Pequeños (<480px):**
   - Reducir el tamaño tipográfico de los títulos principales de `1.15rem` a `0.95rem`.
   - Ocultar la barra de décadas históricas en pantallas de menos de 480px de ancho para conceder más altura vertical al lienzo WebGL.
