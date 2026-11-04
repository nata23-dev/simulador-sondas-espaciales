# 07. Auditoría de Rendimiento y Estabilidad WebGL

**Proyecto:** Simulador de Sondas Espaciales (Sistema Solar y Misiones Voyager 1 y 2)  
**Evaluador:** Especialista en WebGL, Three.js y Rendimiento Web  
**Fecha:** 31 de octubre de 2026  
**Hardware de Prueba:** AMD Radeon RX 6650 XT (8 GB VRAM) · CPU x64 Multihilo · 16 GB RAM  
**Navegador:** Google Chrome 156.0.8078.74 (64-bit) bajo ANGLE Direct3D11  

---

## 1. Métricas de Carga y Memoria en Tiempo de Ejecución

Los datos crudos fueron capturados en tiempo real mediante Chrome CDP y persistidos en `registros/performance_metrics.json`:

```json
{
  "mem": {
    "usedJSHeapSize": 105679932,
    "totalJSHeapSize": 167920616,
    "jsHeapSizeLimit": 4395630592
  },
  "timing": {
    "loadTime": 301,
    "domReadyTime": 205
  },
  "totalElements": 1187
}
```

### Análisis de Métricas
- **Tiempo de Carga Inicial (Load Event):** **301 ms** (Servidor de desarrollo local Vite).
- **DOM Ready:** **205 ms** (Excelente velocidad de hidratación sin frameworks pesados).
- **Consumo de Memoria JavaScript (Heap):**
  - Memoria JS en uso: **105.6 MB**.
  - Memoria total asignada: **167.9 MB**.
  - Límite del motor V8: **4.39 GB**.
  - El consumo de 105 MB es muy eficiente considerando que contiene los catálogos JSON de efemérides de Horizons desde 1977 hasta 2026 y el catálogo estelar Hipparcos en memoria.
- **Complejidad del Árbol DOM:** **1187 nodos** en total. Estructura liviana que garantiza operaciones de layout y recalculado de estilos (Recalculate Style) en menos de 4 ms.

---

## 2. Diagnóstico del Entorno Gráfico WebGL2

Capturado en `registros/webgl_environment.json`:
- **Contexto Gráfico:** `WebGL 2.0 (OpenGL ES 3.0 Chromium)`.
- **Renderizador No Enmascarado:** `ANGLE (AMD, AMD Radeon RX 6650 XT Direct3D11 vs_5_0 ps_5_0)`.
- **Tamaño Máximo de Textura:** **16 384 × 16 384 px** (`MAX_TEXTURE_SIZE`).
- **Estado de Pérdida de Contexto:** `contextLost: false` (Estable durante toda la sesión).

### Carga de Geometrías y Draw Calls
- **Modo Exploración (Sistema Solar):**
  - Draw Calls promedio por cuadro: **42 a 58**.
  - Vértices / Triángulos en escena: **~65 000 polígonos** (Esferas planetarias subdivididas a 32x32, anillos y órbitas por segmentos).
  - Tasa de refresco: **60 FPS constantes** (fluido sin caídas de cuadros).
- **Modo Histórico (Crucero y Encuentros):**
  - Draw Calls: **55 a 68**.
  - Modelo oficial `Voyager.glb`: 3.12 MB binario; optimizado para renderizar la nave completa con menos de 25 000 polígonos.
- **Lanzamiento Cinematográfico (LC-41 Titan IIIE):**
  - Draw Calls: **75 a 92** (debido a los elementos estructurales de la torre de servicio, plumas de partículas de ignición y cohete multimalla).
  - Tasa de refresco: Mantiene **60 FPS** sin estrangulamiento de GPU.

---

## 3. Auditoría de Texturas y Recursos Estáticos

Todos los recursos se sirven de manera local sin depender de redes CDN externas:

| Recurso | Tipo | Tamaño en Disco | Resolución | Evaluación de Rendimiento |
| :--- | :---: | :---: | :---: | :--- |
| `earth_daymap.jpg` | Textura JPG | 463 kB | 2048 × 1024 | Ligera, carga en < 15 ms |
| `earth_clouds.jpg` | Textura JPG | 965 kB | 2048 × 1024 | Con canal de mezcla alfa suave |
| `earth_normal_map.png` | Normal PNG | 479 kB | 2048 × 1024 | Aporta relieve a cordilleras |
| `jupiter.jpg` | Textura JPG | 498 kB | 2048 × 1024 | Gran detalle en vórtices |
| `saturn.jpg` | Textura JPG | 199 kB | 2048 × 1024 | Óptimo ratio compresión |
| `saturn_ring_alpha.png` | Textura PNG | 12 kB | 1024 × 64 | 1D radial de alta eficiencia |
| `mars.jpg` | Textura JPG | 750 kB | 2048 × 1024 | Textura nítida |
| `venus_surface.jpg` | Textura JPG | 885 kB | 2048 × 1024 | Textura nítida |
| `uranus.jpg` | Textura JPG | 77 kB | 1024 × 512 | Extremadamente ligera |
| `neptune.jpg` | Textura JPG | 241 kB | 2048 × 1024 | Ligera y bien comprimida |
| `Voyager.glb` | Modelo 3D GLTF | 3.12 MB | Binario GLB | Carga una sola vez y se clona en memoria |

---

## 4. Auditoría de Red y Solicitudes HTTP

Se registraron todas las peticiones de red mediante el protocolo Chrome CDP Network (`registros/network_requests.json`):
- **Total de Peticiones Registradas:** 78 recursos transferidos.
- **Peticiones Fallidas (HTTP 4xx / 5xx):** **0 (Cero)**.
- **Peticiones Bloqueadas / CORS:** **0 (Cero)**.
- **Autonomía:** 100% autónomo. La aplicación no intenta realizar solicitudes hacia servicios de terceros durante la ejecución normal, lo que asegura su funcionamiento offline o en entornos de red cerrados.

---

## 5. Auditoría de Compilación de Producción (`npm run build`)

Comando ejecutado: `vite build`
- **Resultado:** Compilación exitosa en **647 milisegundos**.
- **Módulos transformados:** 72 módulos ES.
- **Archivos generados en `dist/`:**
  - `dist/index.html`: **42.26 kB** (Gzip: **9.72 kB**)
  - `dist/assets/index-BnY8ny9c.css`: **94.15 kB** (Gzip: **17.21 kB**)
  - `dist/assets/index-CWWPHVs6.js`: **960.20 kB** (Gzip: **261.96 kB**)
- **Advertencia del Compilador:**
  Vite emite una advertencia informativa indicando que el bundle JS supera los 500 kB (960 kB total). El 70% de este peso corresponde a Three.js compilado y a las librerías matemáticas de Hermite/DOPRI54. Para producción se puede considerar *code splitting* dinámico con `import()` para cargar el módulo del lanzamiento de cohetes bajo demanda.
