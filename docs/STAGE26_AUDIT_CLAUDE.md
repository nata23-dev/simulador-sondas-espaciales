# Auditoría de la etapa 26 · Rendimiento y contador de FPS

- **Auditor:** Claude (Opus 5.5). **Claude también implementó la etapa**, así que esta auditoría usa métodos distintos de los de la implementación:
  - prueba sobre el código de los sombreadores de three r186;
  - revisión adversaria del diff frente a la copia previa a la etapa;
  - comparación píxel a píxel de las capturas;
  - marcas de tiempo de la aparición del lienzo;
  - medida de GPU sin límite de cadencia;
  - recuento de mutaciones del DOM;
  - barrido de anchos de pantalla.
- **Fecha:** 22-11-2026.
- **Alcance:** presentación y rendimiento: `src/launch/`, `src/graphics/SolarSystem.js`, `src/integration/SolarSystemMissionView.js`, `src/ui/` y `theme.css`. **No toca `src/science/`, constantes, marcos, integradores ni datos**, así que la regla del proyecto no exige revisión científica independiente. Sí conviene una revisión visual por una persona.
- **Veredicto:** **aprobada con observaciones.**
  - Tres defectos encontrados durante la etapa y corregidos (D-1 a D-3).
  - Un defecto anterior, de la etapa 24, también corregido (D-4).

## Comprobaciones

| # | Método | Resultado |
| --- | --- | --- |
| 1 | **Sombra apagada sin recompilar.** Lectura de `getShadow` en los sombreadores de three r186 (variantes PCF, VSM y básica): devuelve `mix(1.0, sombra, shadowIntensity)` | Con `shadow.intensity = 0` el factor es exactamente 1,0, el mismo que sin sombra. El aspecto fuera del suelo no cambia. Medido en la misma sesión, tener la sombra compilada no cuesta nada: 3,96 frente a 3,99 ms en el seguimiento |
| 2 | **Revisión adversaria del diff** de `VoyagerLaunchDirector.js` y `LaunchEffects.js` frente a la copia previa a la etapa | Sin diferencias de comportamiento (detalle abajo) |
| 3 | **Píxel a píxel** frente a las capturas de la etapa 25, con las dos misiones ([resultado](../evidence/stage26/regresion/diferencias-capturas-stage25.txt)) | Idénticas en Florida, el Cabo (ortoimagen con perfil ICC), la plataforma, la separación, los mástiles y el final. Hay diferencias solo donde hay humo, nubes o tiempo en movimiento: la captura cae unos milisegundos antes o después. Esos instantes se revisaron a ojo |
| 4 | **Aparición del lienzo** con marcas de tiempo (`MutationObserver` de la clase `is-visible`) y registro de fotogramas largos | El lienzo aparece 3 ms después del último fotograma largo de la preparación. Ningún fotograma largo cae con el lienzo visible y el reloj en marcha |
| 5 | **GPU sin límite de cadencia** (`--disable-gpu-vsync --disable-frame-rate-limit`), 12 instantes a 3 840 × 2 160 píxeles | 0,29–4,22 ms por fotograma (235–1 490 FPS). Las cifras con cadencia limitada (1,07–4,90 ms) dependen del reloj de la GPU; por eso el informe compara el peor fotograma y los percentiles |
| 6 | **Avisos de WebGL** en la consola durante la verificación completa de la etapa 25 | 0 tras D-1. Antes había 256 «Mismatch between texture format and sampler type» |
| 7 | **Mutaciones del DOM** por fotograma en la reproducción de A1 en el Sistema Solar, con un `MutationObserver` sobre todo el documento y el ancho de la barra en cada fotograma | **D-4**. Tras la corrección: 0 reconstrucciones de marcas en 240 fotogramas (antes 117–135) y barra fija en 609 px. Las mutaciones del Centro de Misión bajan de más de 75 a 20 por fotograma; las que quedan son valores que cambian de verdad (tiempo, posición, velocidad). Las ≈ 55 restantes son los rótulos de la escena principal, que siguen a los cuerpos |
| 8 | **Barrido de anchos** de la fila de reproducción (421, 440, 480, 520, 521, 560, 600, 768, 1024 y 1366 px), midiendo el desborde horizontal | Sin desborde ni barra menor de 70 px. Entre 421 y 480 px ya desbordaba antes de la etapa (43 px a 440 px) y el ancho mínimo nuevo lo empeoraba 15 px; corregido |
| 9 | **Pausa de dibujo durante la precompilación** (`precompilarEscena`): lectura del bucle y casos límite | El siguiente fotograma se programa antes de la salida anticipada, así que el bucle no puede detenerse. Si `compileAsync` lanza una excepción (contexto perdido), no se pausa. Hay un tope de 2 s y varias llamadas comparten la misma promesa |
| 10 | **Regresión en Chrome** de las etapas 23, 24 y 25 y del contador (`verify-stage26-fps-meter.mjs`) | Sin errores ([registros](../evidence/stage26/regresion/)). La 23 coincide con sus evidencias hasta 10⁻¹² relativo. La 24 muestra A1 en 3 000 km de periapsis en lugar de 316 km: sus evidencias son de antes de que la etapa 20 activara por defecto la captura apuntada (21:47 frente a 21:58 UTC del 21-11) |
| 11 | Suite completa, compilación normal y `git diff --check` | 402/402 y sin errores de espacios |

### Revisión del diff (comprobación 2)

- **Último acontecimiento.** `ultimoEventoHasta` recorre la lista desde el final y devuelve el primer elemento con `t ≤ instante`. Es exactamente lo que hacía `[...eventos].reverse().find(...)`, también si la lista no estuviera ordenada.
- **Grupos fijos de partículas.**
  - `emitirParticula` y `emitirEstela` reutilizan objetos y llevan la cuenta.
  - Los consumidores (`humo.actualizar` y `estela.actualizar`) reciben esa cuenta. La única otra lectura, `puntosEstela.length` en la condición de la estela del Titan, se cambió por la cuenta.
  - Los objetos sobrantes de un fotograma anterior no se leen.
- **Viento y bocanadas precalculados.**
  - `viento` es una función pura de la altura, así que `viento(0)` es constante.
  - Los puntos de las bocanadas son las mismas referencias (`s.nariz` y `s.cola`) o constantes de la geometría del vehículo.
- **Ordenación del humo.** `orden[i] = i` se reescribe en cada fotograma para las `n` partículas activas antes de ordenar. Ordenar `subarray(0, n)` en el sitio da el mismo conjunto de índices que la copia anterior; la ordenación de V8 es estable en ambos casos.
- **Formato de números.** Se conservan las opciones: `signDisplay: 'negative'` (de la etapa 21) en el Centro de Misión y los decimales fijos en el lanzamiento. El texto fue idéntico en 12 090 comparaciones, con valores aleatorios, −0, NaN e infinitos.

## Defectos (corregidos)

- **D-1 · Avisos de WebGL al desactivar el dibujo del mapa de sombras antes de que existiera.**
  - Con `shadowMap.autoUpdate = false` desde el primer fotograma, three enlazaba al muestreador una textura vacía y Chrome avisaba 256 veces.
  - Corrección: el mapa se dibuja al menos una vez (`autoUpdate = sombras || !sol.shadow.map`).
- **D-2 · Precompilación del filtro del entorno sin efecto.**
  - La clave del programa de three incluye si la geometría tiene atributo de posición. La malla de prueba compilaba otro programa, y el filtro seguía compilándose de forma síncrona (≈ 0,4 s).
  - Corrección: se compila con la geometría del propio filtro.
- **D-3 · El contador tapaba el reloj del lanzamiento y los botones del laboratorio en el teléfono.**
  - Corrección: se coloca bajo la cabecera y, en el lanzamiento y el laboratorio, a media altura del borde derecho.
  - Comprobado con capturas a 390 × 844.
- **D-4 · La barra de reproducción del Centro de Misión forzaba la maquetación en la mitad de los fotogramas** (defecto de la etapa 24).
  - El texto del tiempo restante cambiaba de ancho al perder ceros finales, y el `ResizeObserver` reconstruía las marcas. Además, el Centro reescribía en cada fotograma textos y atributos sin cambios.
  - Con el reloj de exploración en marcha, la reproducción de A1 bajaba a ≈ 70 FPS (percentil 95 de 14,1 ms).
  - Corrección: ancho mínimo del tiempo y escrituras condicionales (`setText` y `setAttr`). Resultado: 7,2 ms.

## Observaciones

- **O-1 · Medidas de un solo equipo.** Chrome con GPU AMD RX 6650 XT. En una GPU integrada o un móvil real no se ha medido. La calidad automática, que ahora también rige el lanzamiento, y el contador están para eso.
- **O-2 · Preparación del lanzamiento.** Quedan ≈ 1,1 s de fotogramas largos (0,08–0,42 s cada uno) con la Tierra quieta y el rótulo «Preparando Cabo Cañaveral, 1977…».
  - El mayor es el perfil de ascenso calibrado. Moverlo a un *worker* tocaría `src/science/` y no se ha hecho.
- **O-3 · Dependencia de partes internas de three.** La precompilación del entorno usa partes internas de `PMREMGenerator` (r186). Está protegida con `try/catch`, y una versión futura volvería al camino síncrono con el mismo resultado visual.
- **O-4 · Transiciones de una sola vez sin tocar:**
  - primer fotograma tras la carga: ≈ 0,15–0,25 s;
  - entrada al histórico: ≈ 0,1 s;
  - entrada al laboratorio: ≈ 0,2 s;
  - apertura de la reproducción de A1: 0,1–0,15 s, la lectura de sus datos.
- **O-5 · Entre 421 y 520 px** la fila de reproducción no muestra el tiempo restante, como ya ocurría por debajo de 420 px. Sigue en el panel. Es un cambio visible menor.
- **O-6 · Sin revisión humana** ni prueba con lector de pantalla real. El contador no se anuncia (tiene `title`), a propósito.
- **O-7 · La medida general «antes» no pulsó reproducir** (selector equivocado). Sus fases «reproducir» son de reposo; el script ya está corregido y la medida «después» sí lo pulsa.
