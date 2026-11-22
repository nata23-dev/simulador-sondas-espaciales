# Etapa 26 · Rendimiento (lanzamiento 3D y general) y contador de FPS

Estado: **implementada y probada localmente (22-11-2026)**. Revisada en Chrome con la GPU AMD real (1920 × 1080 con densidad 2, 1600 × 900 y 390 × 844). Auditoría: Claude, que también la implementó ([informe](STAGE26_AUDIT_CLAUDE.md)). **No cambia la física, las constantes, los marcos, el integrador ni los datos**: `src/science/` no se ha tocado.

## Petición

> «Mejorar el rendimiento de FPS del simulador y añadir, en un lugar que no estorbe, una opción para ver los FPS. Centrarse en que sea fluida la simulación del lanzamiento 3D, donde noté pérdida de FPS y fluidez.»

## Qué causaba la pérdida de fluidez

Medido antes de tocar nada con [`scripts/profile-launch-performance.mjs`](../scripts/profile-launch-performance.mjs). La configuración fue la compilación de producción, Chrome con la GPU real, 1920 × 1080 con densidad de píxeles 2 y la reproducción completa de la Voyager 2 a ×1. El perfil de CPU se tomó con el protocolo de depuración de Chrome.

El tiempo de GPU por fotograma ya era bajo, de 1 a 5 ms. Las sombras, el humo, las llamas y el cielo cuestan cada uno menos de 0,3 ms; lo que más pesa es la resolución. **La pérdida de fluidez no venía de dibujar, sino de bloqueos puntuales del hilo principal:**

| Momento | Bloqueo | Causa |
| --- | --- | --- |
| T − 13,4 s (aproximación, visible) | **1 412 ms** | Al activar las sombras cerca del suelo se cambiaba `castShadow` de la luz solar. Para three.js eso cambia el número de luces con sombra, y **recompila todos los materiales iluminados** de la escena de golpe |
| T − 17,9 s y T − 16,4 s (visible) | 64 y 53 ms | Texturas (globo de 8 192 px, ortoimágenes) que se subían a la GPU la primera vez que entraban en el encuadre |
| Paso a la atmósfera exterior | recompilación | La atmósfera cambiaba `material.side` (cara interior o exterior según la altitud), que también forma parte del programa |
| Preparación (rótulo «Preparando Cabo Cañaveral…») | 434, 195, 828 y 718 ms | Compilación síncrona del filtro del entorno (PMREM), decodificación de JPEG en el hilo principal y subida de texturas |
| Cada fotograma | 0,5–2,5 ms de CPU | Partículas nuevas (objetos) en cada fotograma, copia e inversión de la lista de acontecimientos, ordenación de todo el búfer de humo |

## Cambios

### Lanzamiento 3D (`src/launch/`)

- **Sombras sin recompilar** (`LaunchWorld.js`). La luz solar proyecta sombras siempre (`castShadow` fijo). Fuera del suelo, la sombra se apaga con `shadow.intensity = 0` y el mapa de sombras deja de dibujarse (`shadowMap.autoUpdate = false`). Para tener el mismo aspecto sin recompilar, se dibuja al menos una vez, para que su textura de profundidad exista. Sin ella, WebGL rechazaba la textura vacía que three enlaza al muestreador de sombras; la etapa 25 se repitió hasta corregir esos 256 avisos, que aparecieron a mitad de esta etapa.
- **Atmósfera en dos mallas**, una con la cara interior y otra con la exterior. Comparten geometría y uniformes, y se alterna su visibilidad en lugar de cambiar `material.side`.
- **Texturas decodificadas fuera del hilo principal** con `createImageBitmap`. Si el navegador no lo admite, se usa el cargador de siempre. Además, se **suben a la GPU antes de reproducir** (`subirTexturas`, con un fotograma de respiro entre una y otra).
- **Entorno precompilado en paralelo** (`KHR_parallel_shader_compile`): el filtro GGX de PMREM y el cielo que lo alimenta se compilan mientras se descargan las texturas. Un detalle clave: la clave del programa incluye si la geometría tiene atributo de posición, así que se compila con la misma geometría que usa el filtro. Si la parte interna de three cambia, se vuelve al camino síncrono, con el mismo resultado.
- **Modelo oficial de la Voyager** precompilado en cuanto se descarga.
- **Primer dibujo de calentamiento con el lienzo aún oculto.** El lienzo aparece después de él: el coste del primer uso de cada programa ya no cae en un fotograma visible.
- **Calidad gráfica también en el lanzamiento**. El lienzo del lanzamiento se registra en el perfil de calidad (`registerRenderer`): misma densidad de píxeles que el resto y bajada automática si la cadencia cae por debajo de 30 FPS durante 4 s.
- **Textura del globo según el equipo** (`archivoGlobo`). La de 8 192 px se usa con calidad «alta» y con «automática» en un equipo de escritorio cuya GPU la admite. En los demás casos se usa la de 4 096 px. Son los mismos dos archivos de Blue Marble de la etapa 25; no se añade ni se cambia ningún recurso.
- **Menos trabajo por fotograma** (`VoyagerLaunchDirector.js`, `LaunchEffects.js`):
  - grupos fijos de partículas de humo y estela, sin objetos nuevos en cada fotograma, con las mismas fórmulas;
  - búsqueda del último acontecimiento sin copiar ni invertir la lista;
  - viento y separaciones precalculados;
  - ordenación solo de las partículas activas.

### General

- **Reproducción de una misión del laboratorio en el Sistema Solar.** Al abrirla, el modelo de la sonda y las líneas de la misión se compilaban de forma síncrona en el primer dibujo (586 ms). Ahora `SolarSystem.precompilarEscena()` los compila en paralelo y, mientras tanto, conserva el último fotograma en lugar de bloquear la página. Tiene un tope de 2 s. La llamada se hace en `SolarSystemMissionView.take()`.
- **Formato de números** del Centro de Misión y del lanzamiento. Se usaban en cada fotograma y creaban un `Intl.NumberFormat` nuevo en cada llamada; ahora se reutiliza uno por número de decimales.
  - El texto no cambia: idéntico en 12 090 comparaciones con valores aleatorios, −0, NaN e infinitos.
  - Cada llamada es 40 veces más rápida: de 27 a 0,7 µs.
- **Barra de reproducción del Centro de Misión** (`theme.css`). Este defecto venía de la etapa 24. El texto «… d restantes» que la acompaña cambiaba de ancho según sus decimales (de 104 a 111,5 px). Eso movía el final de la barra 7,5 px, de modo que la barra temblaba, y el `ResizeObserver` reconstruía sus marcas y forzaba la maquetación en la mitad de los fotogramas (117–135 de cada 240).
  - El texto tiene ahora un ancho mínimo de 11 em, suficiente para «2.190,123 d restantes».
  - Resultado: 0 reconstrucciones y la barra queda fija.
  - Entre 421 y 520 px de ancho la fila ya desbordaba antes de esta etapa: 43 px a 440 px y 3 px a 480 px, medido en Chrome. Ahí el tiempo restante no se muestra en la fila, como ya ocurría por debajo de 420 px. El HUD da el tiempo transcurrido y el panel, el restante.
  - Medido a 421, 440, 480, 520, 521, 560, 600, 768, 1024 y 1366 px: sin desborde, y la barra nunca baja de 70 px.
- **Centro de Misión: el DOM solo se escribe si cambia** (`MissionControlCenter.js`, funciones `setText` y `setAttr`).
  - En cada fotograma se reescribían, con los mismos valores:
    - las etiquetas de las métricas;
    - los resúmenes de las secciones;
    - `aria-current` y `aria-pressed`;
    - `disabled` y `hidden` de los marcos;
    - el icono del botón de reproducir, que era un SVG nuevo por fotograma.
  - Cada escritura invalidaba estilos y despertaba al glosario, que volvía a anotar los términos.
  - El texto y los atributos resultantes son los mismos.
- **Efecto combinado de las dos correcciones.** Con el reloj de exploración en marcha, la reproducción de A1 en el Sistema Solar pasa de ≈ 70 FPS (percentil 95 de 14,1 ms) a la cadencia completa (7,2 ms).

### Contador de FPS (`src/ui/FpsMeter.js`)

- **Cómo se activa.** Con la casilla **Capas → Calidad gráfica → «Mostrar FPS»** o con `?fps=1` en la dirección, que no cambia la preferencia guardada. La preferencia se recuerda en el navegador.
- **Qué muestra.** Mide la cadencia real de `requestAnimationFrame` en cualquier vista: Sistema Solar, misiones históricas, laboratorio y lanzamiento 3D. Muestra los FPS medios de los últimos 0,5 s, el tiempo medio por fotograma y el peor. El valor cambia a ámbar por debajo de 50 FPS y a rojo por debajo de 30.
- **Cuánto cuesta.** Mientras está oculto no ejecuta nada.
- **Dónde aparece.** En escritorio, en la esquina inferior derecha, libre en todas las vistas revisadas. En móvil (≤ 760 px), donde la parte inferior la ocupan el tiempo y los controles, se reduce a una línea:
  - en el Sistema Solar y las misiones históricas, bajo las pestañas, a la izquierda de la columna de botones;
  - en el lanzamiento y el laboratorio, cuyas cabeceras ocupan todo el ancho, en el borde derecho a media altura.
- **No estorba.** Tiene `pointer-events: none`, así que nunca intercepta un clic.

## Resultados

### Lanzamiento 3D

Voyager 2 completa a ×1, compilación de producción, Chrome con la GPU AMD real, 1920 × 1080 con densidad de píxeles 2. Datos: [antes](../evidence/stage26/launch-profile-dpr2-antes.json) y [después](../evidence/stage26/launch-profile-dpr2-despues.json).

| | Antes | Después |
| --- | --- | --- |
| Fotogramas > 50 ms con el reloj de la misión en marcha | 3 (1 412, 64 y 53 ms) | **0** |
| Peor fotograma con el reloj en marcha | 1 412,7 ms | **35,2 ms** (uno solo) |
| Percentil 95 del intervalo entre fotogramas, por plano | 5,6–9,7 ms | 7,2 ms |
| Fotogramas > 50 ms en la preparación (T − 24 s, reloj parado) | 5, en total 2,24 s | 6, en total 1,14 s |
| CPU media por fotograma, por plano | 0,54–2,51 ms | 0,52–1,23 ms |
| GPU media por fotograma, 12 instantes | 1,05–4,96 ms | 1,07–4,90 ms (0,29–4,22 ms sin límite de cadencia) |
| Hasta ver la escena desde «Ver lanzamiento 3D» | 4,9 s | 4,9–5,1 s |
| Avisos o errores de WebGL en consola | 0 | 0 |

**Preparación.** Los fotogramas largos que quedan (0,08–0,42 s cada uno) ocurren con el reloj parado, mientras la pantalla muestra la Tierra quieta al final del acercamiento con el rótulo «Preparando Cabo Cañaveral, 1977…». Vienen de crear el perfil de ascenso calibrado, subir la textura del globo y el dibujo de calentamiento. Con marcas de tiempo se comprobó que el lienzo del lanzamiento aparece 3 ms después del último. El perfil registra ahora, para cada fotograma, si el lienzo ya se ve. El único fotograma largo con el lienzo «visible» es el que termina justo cuando aparece.

**Cómo leer las cifras.**

- *Cadencia.* En Chrome sin interfaz está limitada: ≈ 180 Hz en la sesión «antes» y ≈ 142 Hz en la de «después». Por eso los FPS medios no se comparan bien; lo que importa son el peor fotograma y los percentiles.
- *Tiempo de GPU.* Depende del estado de reloj de la GPU. Sin límite de cadencia, los mismos instantes miden 0,29–4,22 ms y van de 235 a 1 490 FPS a 3 840 × 2 160 píxeles.
- *Sombra siempre compilada.* En la misma sesión, tener la sombra compilada con intensidad 0 no cuesta nada medible: 3,96 frente a 3,99 ms en el seguimiento, y 4,30 frente a 4,34 ms en la órbita de aparcamiento.
- *CPU.* Las diferencias por plano entre sesiones (±30 %) están dentro de la variación entre ejecuciones; en todos los casos queda por debajo de 1,3 ms de un presupuesto de 16,7 ms. Lo que sí desaparece son los ≈ 2 500 objetos nuevos por fotograma de las partículas, que el recolector de memoria tenía que limpiar.

### Resto del simulador

Repaso con [`scripts/profile-general-performance.mjs`](../scripts/profile-general-performance.mjs): exploración en reposo, con el tiempo en marcha y arrastrando la cámara; modo histórico; laboratorio con el cálculo de A1 (Cassini → Marte) y su reproducción en el Sistema Solar. 1600 × 900, GPU real. Datos: [antes](../evidence/stage26/general-profile-antes.json) y [después](../evidence/stage26/general-profile.json).

- **Uso continuo sin tirones.** En todas las fases el percentil 95 del intervalo entre fotogramas es 7,2 ms, también en la reproducción de A1 con el reloj de exploración en marcha (antes, 14,1 ms). El peor fotograma no pasa de 15 ms en ninguna de ellas.
- **Abrir la reproducción de A1 en el Sistema Solar:** el peor fotograma baja de **629 ms a 105–155 ms**. Lo que queda es la lectura de los datos de la misión, una sola vez.
- **Transiciones que no se tocaron**, por ser de una sola vez y poco visibles:
  - primer fotograma tras la carga: ≈ 0,15 s, texturas bajo demanda;
  - entrada al modo histórico: ≈ 0,1 s, lectura de datos;
  - entrada al laboratorio: ≈ 0,2 s, construcción de la interfaz;
  - cálculo de la misión: ≈ 80 ms.
- **Una limitación de la medida «antes».** En ella el botón de reproducir no llegó a pulsarse (selector equivocado), así que las fases «reproducir» de esa medida son de reposo; el script ya está corregido.

## Pruebas

- `tests/Stage26Performance.test.mjs` (3 pruebas):
  - el resumen del contador (media, peor fotograma, tirones y descarte de intervalos no válidos);
  - el estado de color y el texto con coma decimal;
  - la elección de la textura del globo según calidad, equipo y tamaño máximo de textura de la GPU.
- `tests/Stage17_1MainScenePlayback.test.mjs`: la comprobación de cableado de `aria-valuetext` acepta ahora `setAttr`. Además comprueba que `setAttr` solo escribe si el valor cambia. No se ha quitado ninguna comprobación.
- Total: **402 pruebas, 402 superadas**. También pasan `npm run lint`, `npm run build` y `git diff --check`.
- Regresión en Chrome de las etapas 23 y 24, que recorren el Centro de Misión: línea de tiempo, anunciador, HUD, paneles, marcas agrupadas, zoom temporal y hoja inferior en el teléfono. Pasan sin errores ([registros](../evidence/stage26/regresion/)).
  - La 23 coincide con sus evidencias salvo ruido de coma flotante (10⁻¹² relativo).
  - La 24 muestra A1 terminando en 3 000 km de periapsis y no en 316 km. Sus evidencias se generaron el 21-11 a las 21:47 UTC, antes de que la etapa 20 (21:58 UTC) activara por defecto la captura apuntada. Es el comportamiento documentado y no lo cambia esta etapa.
- Las correcciones del lanzamiento necesitan WebGL. Se comprobaron en Chrome:
  - `GPU=1 node scripts/verify-stage25-launch.mjs` con las dos misiones: todas las comprobaciones de la etapa 25 se cumplen y no hay errores de WebGL.
  - Se compararon píxel a píxel con las capturas de la etapa 25 ([resultado](../evidence/stage26/regresion/diferencias-capturas-stage25.txt)). Son idénticas (diferencia 0) en la aproximación a Florida y al Cabo, la plataforma, la separación de la nave, los mástiles y el final.
    - La aproximación al Cabo usa la ortoimagen con perfil ICC: confirma que la decodificación sin conversión de color da los mismos valores que antes.
    - Las diferencias de los demás instantes están donde hay nubes, humo o tiempo en movimiento, y en el primer fotograma: la captura cae unos milisegundos antes o después en el descenso. Se revisaron a ojo.
- Contador: `GPU=1 node scripts/verify-stage26-fps-meter.mjs` ([evidencias](../evidence/stage26/)). Comprueba:
  - la casilla y que el contador aparece en exploración, histórico y lanzamiento;
  - en móvil, exploración, histórico, laboratorio y lanzamiento, sin desbordamiento horizontal;
  - que se conserva al recargar, que se desactiva y que `?fps=1` no altera la preferencia;
  - que no hay errores de consola.

## Límites y pendientes

- Las mediciones son de **un equipo**: GPU AMD RX 6650 XT y Chrome. En una GPU integrada o un móvil el tiempo de GPU será mayor. Para eso está la calidad automática, que ahora también rige el lanzamiento, y el contador permite comprobarlo. Falta probarlo en un equipo modesto real.
- El perfil de ascenso calibrado (`trayectoriaLanzamiento`, ≈ 0,2–0,4 s de cálculo la primera vez) sigue calculándose al abrir el lanzamiento, tras el rótulo. Moverlo a un *worker* tocaría el módulo científico y no se ha hecho.
- La precompilación del entorno usa partes internas de `PMREMGenerator` de three r186. Está protegida por `try/catch`: si una versión futura las cambia, se vuelve a la compilación síncrona (≈ 0,5 s tras el rótulo).
- Pendiente, como en las etapas anteriores: una revisión visual por una persona y una prueba con lector de pantalla real. El contador tiene un `title` descriptivo, pero no se anuncia, para no interrumpir.
