# Auditoría de la etapa 27 · Rendimiento adaptativo

- **Auditor:** Claude (Opus 5.5). **Claude también implementó la etapa**, así que esta auditoría usa métodos distintos de los de la implementación:
  - simulación del controlador con modelos de coste de varios equipos;
  - perfiles en Chrome con dibujo por software y con la GPU real;
  - perfil de CPU por CDP;
  - experimento de coste por objeto;
  - revisión adversaria del código;
  - cálculo del efecto del teselado reducido.
- **Fecha:** 22-11-2026.
- **Alcance:** presentación y rendimiento:
  - `src/graphics/QualityProfile.js`, `src/graphics/SolarSystem.js` y `src/launch/`;
  - los renderizadores del laboratorio;
  - `src/ui/FpsMeter.js`, `src/main.js`, `index.html` y `theme.css`.
  - **No toca `src/science/`, constantes, marcos, integradores ni datos**, así que la regla del proyecto no exige revisión científica independiente.
- **Veredicto:** **aprobada con observaciones.**
  - Dos defectos de diseño encontrados durante la etapa y corregidos (D-1 y D-2).
  - El objetivo de 50–60 FPS se cumple por software en el Sistema Solar y en la media del lanzamiento, no en todas las escenas (O-1).

## Comprobaciones

| # | Método | Resultado |
| --- | --- | --- |
| 1 | **Simulación del controlador** con un equipo modelado: intervalo = máx(1/60, CPU + K·p²), con K de 2 a 300 ms; también CPU dominante, tirones de 0,8 s y planos alternos baratos y caros | GPU potente: sin cambios. Intermedia y lenta: entre 48 y 61 FPS con 4 cambios como mucho. Software: baja al mínimo y pide menos detalle. Límite por CPU: no baja la resolución. Tirones: no bajan nada. Planos alternos: más de 45 FPS de media. Todo queda como prueba en [`Stage27AdaptivePerformance.test.mjs`](../tests/Stage27AdaptivePerformance.test.mjs) |
| 2 | **Lanzamiento por software**, instantes y reproducción completa ([evidencias](../evidence/stage27/)) | Instantes de 1,8–11 a 18,7–99,8 FPS. Reproducción completa: 57,8 FPS de media (52,9 limitada a 60 Hz) |
| 3 | **Resto por software** con el mismo recorrido antes y después | Sistema Solar de 11,9–17,8 a 49,3–57,5 FPS. Históricas de 12–14,5 a 31–37 FPS. Reproducción del laboratorio de 10,9 a 27,5 FPS |
| 4 | **GPU real** (AMD), lanzamiento | 164 FPS de media; instantes en el límite de cadencia (179,9) a relación ×1. Sin regresión |
| 5 | **Perfil de CPU (CDP)** en la vista de la plataforma por software | Hilo principal libre el 91 % del tiempo. El cuello está en el proceso de la GPU (rasterizador por software), no en el JavaScript |
| 6 | **Coste por objeto**, ocultando grupos de objetos uno a uno en la plataforma por software | 95 llamadas de dibujo, sin ninguna dominante: el globo aporta unos 5 FPS y el panel superpuesto unos 3. Explica el techo de 19–27 FPS de esas vistas (O-1) |
| 7 | **Revisión adversaria del código** | Ver abajo |
| 8 | **Teselado con la mitad de divisiones** (bajo y mínimo), calculado: hundimiento R·θ²/2 en el centro de cada celda | Globo de respaldo: ≈ 3,8 km (≈ 1 km con alto). Atmósfera: ≈ 16 km en una capa de 80 km. Cerca de la plataforma no se ve: Florida, el Cabo y LC-41 son mallas propias con su teselado intacto. En el limbo, desde la órbita, el borde puede verse ligeramente poligonal (≈ 2 px a 1600 × 900). Sin efecto en la trayectoria ni en la telemetría (O-2) |
| 9 | **Regresión en Chrome con la GPU real** de las etapas 24, 25 y 26, y comprobación del menú «Capas» (`verify-stage29-menus.mjs`) | Sin errores. «Mínima» da ×0,6; «Ahorro de energía» muestra el aviso de recarga; al volver a «Automática» y «Alto rendimiento» el aviso desaparece y se guarda lo elegido |

### Revisión del código (comprobación 7)

- **Solo fotogramas dibujados.** `SolarSystem.animar` no informa en pausa ni durante la precompilación. El lanzamiento informa del intervalo real entre fotogramas, no del `dt` recortado a 0,1 s.
- **Fugas.** El oyente de detalle del lanzamiento (`bajaDetalle`) se da de baja en `dispose`. `registerRenderer` devuelve su baja.
- **Perfiles fijos.** Con Alta, Media, Baja o Mínima, `reportFrame` no cambia nada. `setQualityProfile('auto')` reinicia ratio y detalle de todas las escenas.
- **Menú.** `bindQualityControls` ignora los avisos de la escena que no se está dibujando (`activo === false`). Así el estado del menú no salta entre el lanzamiento y el Sistema Solar.
- **Recompilación.** Bajar el detalle durante el lanzamiento solo apaga sombras y nubes mediante la visibilidad y la intensidad, sin cambiar defines. La lección de la etapa 26 (1,4 s de recompilación) se respeta.
- **Pestaña oculta.** Los intervalos de más de 1 s se descartan. Al volver, el contador de FPS descarta el intervalo de la espera.

## Defectos (corregidos durante la etapa)

- **D-1:** la primera versión detectaba el límite por CPU por tanteo: bajaba y, si no ganaba un 10 %, deshacía. En el lanzamiento, los cambios de plano confundían la prueba. En la primera medición completa por software, la resolución de los instantes quedaba en ×1 con 2,8–14,9 FPS en la plataforma y el vuelo (46,7 FPS de media en la reproducción). **Corregido:** medida directa del tiempo de CPU de cada fotograma.
- **D-2:** el estado era único para todas las escenas, y el bucle principal informaba también en pausa. La resolución aprendida en el lanzamiento se aplicaba al Sistema Solar y las pausas falseaban la media. **Corregido:** estado por escena e informe solo de fotogramas dibujados.

## Observaciones

- **O-1:** por software, las misiones históricas (31–37 FPS), la reproducción del laboratorio (27,5) y las vistas de la plataforma (19–27) no llegan a 50 FPS. Ahí ya se está en la resolución mínima y manda el coste por objeto. Opciones para una etapa futura: fusionar geometría estática con detalle mínimo, instanciar y reducir capas del modo histórico. Con aceleración por hardware no se da.
- **O-2:** el teselado reducido de la comprobación 8. Pendiente de revisión visual por una persona.
- **O-3:** la preferencia de GPU no puede comprobarse en este equipo, que tiene una sola GPU. Solo se comprobó que llega a `powerPreference`.
- **O-4:** sin medir en un equipo modesto real ni en un móvil real. SwiftShader en una CPU de 12 hilos no es un móvil.
