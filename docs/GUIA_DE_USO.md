# Guía de uso

Esta guía explica cómo recorrer los tres módulos del **Simulador de Sondas Espaciales** desde la versión web o en ejecución local.

## Barra superior y navegación general

- **Selector de modo:** alterna en cualquier momento entre **Sistema Solar**, **Misiones históricas** y **Laboratorio**.
- **Buscar (`Ctrl + K` o botón de búsqueda):** localiza planetas, lunas, sondas Voyager, hitos históricos o accesos directos del Laboratorio con navegación completa por teclado (`↑`, `↓`, `Enter`, `Esc`).
- **Menú y Capas:** permite activar o desactivar órbitas guía, etiquetas, campo estelar, contador de FPS y seleccionar el perfil de **Calidad gráfica** (`Automática`, `Alta`, `Media`, `Baja`, `Mínima`) o la preferencia de GPU.
- **Modo inmersivo (`I` / `Esc`):** oculta los paneles superpuestos para observar la escena 3D sin distracciones.

---

## 1. Sistema Solar

1. **Explorar cuerpos:** haz clic en cualquier planeta o elige un destino desde el menú lateral o la búsqueda; haz doble clic para viajar hasta él.
2. **Escala:** usa el botón **Escala 1:1 / Exploratoria** para alternar entre proporciones espaciales reales (`32 u/AU`) y encuadre cercano cómodo.
3. **Medición 3D:** abre **Distancias**, elige un **Objeto A** y un **Objeto B** y consulta la separación instantánea en `AU`, `km` y tiempo luz, con vector 3D opcional en escena.
4. **Línea temporal:** reproduce, pausa o cambia la fecha dentro de octubre de 2026 (`TDB`) y ajusta la velocidad de avance.

---

## 2. Misiones Históricas (Voyager 1 y 2)

1. Al entrar al modo histórico aparece un modal de bienvenida con accesos rápidos a **Voyager 1**, **Voyager 2** o **Lanzamiento 3D**.
2. **Sondas y cámara:** muestra ambas sondas o solo una; alterna entre cámara **Exterior** y cámara **Desde Voyager** (primera persona) con campos visuales `ISS 0,42°`, `WAC 3,2°`, `18°` y `45°`.
3. **Acontecimientos e hitos:** navega por lanzamientos, sobrevuelos de Júpiter, Saturno, Urano y Neptuno, *Pale Blue Dot* y cruces de la heliopausa.
4. **Fotografías y comparador A/B:** abre cualquier fotografía oficial NASA/JPL para contrastarla lado a lado con la recreación geométrica WebGL en el instante correspondiente.
5. **Lanzamiento 3D:** accede al despegue animado del **Titan IIIE-Centaur** desde la plataforma **LC-41** en Cabo Cañaveral, con barra de tiempo, salto entre eventos (encendido SRM, separación de etapas, cofia, Centaur y despliegue de Voyager) y múltiples ángulos de cámara.

---

## 3. Laboratorio de Misiones

El Laboratorio se organiza en tres pasos secuenciales:

1. **1 · Sonda (Flota NASA e Ingeniería):** selecciona una sonda histórica oficial (**Voyager**, **Cassini**, **Juno** o **Dawn**), inspecciona su modelo 3D interactivo y revisa su masa, propulsión, potencia eléctrica y documentación visual.
2. **2 · Planificar:** elige un escenario guiado (por ejemplo *Cassini → Marte* o *Juno → Júpiter y Europa*) o personaliza fechas, destino, tipo de llegada (órbita o sobrevuelo) y salida opcional desde plataforma LC-41. El cálculo corre en segundo plano mediante un Web Worker y muestra $\Delta v$, propelente, viabilidad según el modelo y comparación N-cuerpos.
3. **3 · Reproducir (Centro de Misión):** reproduce la trayectoria calculada en 3D (directamente en el Sistema Solar para misiones heliocéntricas o en escena local para misiones geocéntricas), con controles de velocidad, retroceso, saltos a eventos y telemetría en vivo.
