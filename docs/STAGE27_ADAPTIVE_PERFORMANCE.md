# Etapa 27 · Rendimiento adaptativo (50–60 FPS como objetivo en cualquier equipo)

Estado: **implementada y probada localmente (22-11-2026)**.

- **Revisión en Chrome:**
  - con la GPU AMD real;
  - con SwiftShader, que dibuja por software en la CPU como un navegador sin aceleración gráfica;
  - en ambos casos a 1600 × 900 con densidad 1.
- **Auditoría:** Claude, que también la implementó ([informe](STAGE27_AUDIT_CLAUDE.md)).
- **Solo presentación:** no cambia la física, las constantes, los marcos, el integrador ni los datos. La trayectoria, el reloj y la telemetría del lanzamiento 3D son los de la etapa 25 en todos los niveles de detalle.

## Petición

> «Que en cualquier dispositivo tenga un promedio de 50–60 FPS. Puedes agregar opciones de usar CPU o GPU dependiendo del dispositivo, que se adapte; también bajar la calidad de la animación del lanzamiento 3D, hacerla más simple pero con las matemáticas correctas, porque durante esa animación tengo un promedio de 7–10 FPS. Aplica prácticas profesionales.»

## Diagnóstico

- **Con la GPU AMD de este equipo**, el lanzamiento 3D ya iba a 160–180 FPS tras la etapa 26. Los 7–10 FPS no se reproducen con una GPU.
- **Se reproducen dibujando por software**, que es lo que hace el navegador si la aceleración por hardware está desactivada o la GPU está en su lista de bloqueo. Con SwiftShader y el modo automático de la etapa 26:
  - lanzamiento: de 1,8 a 11 FPS en los 12 instantes medidos;
  - Sistema Solar en reposo: 11,9 FPS;
  - mitad de la tabla de abajo.
- **Qué cuesta por software:**
  - **los píxeles**: el tiempo por fotograma crece con el cuadrado de la relación de píxeles;
  - **cada objeto dibujado**: en las vistas de la plataforma hay 95 llamadas de dibujo, sin ninguna dominante.
  - El hilo de JavaScript está libre el 91 % del tiempo (perfil de CDP).
- **Por qué el modo automático de la etapa 26 no bastaba:**
  - bajaba en escalones fijos solo por debajo de 30 FPS;
  - compartía un único estado para todas las escenas: lo aprendido en el lanzamiento se aplicaba al Sistema Solar y al revés;
  - contaba los fotogramas de las pausas y de las cargas;
  - no tocaba el nivel de detalle.

## Cambios

### Calidad adaptativa (`src/graphics/QualityProfile.js`)

- **Clase del procesador gráfico** (`clasificarRenderizador`, `detectarEquipo`):
  - el nombre que da WebGL (`WEBGL_debug_renderer_info`) distingue GPU dedicada, integrada, de móvil, dibujo por software o desconocida;
  - `failIfMajorPerformanceCaveat` confirma el dibujo por software;
  - `nombreLegible` limpia el nombre para el menú.
- **Punto de partida del modo automático por equipo** (`perfilInicialAuto`):

  | Equipo | Tope | Valor inicial | Detalle |
  | --- | --- | --- | --- |
  | GPU dedicada | ×2 | ×2 | alto |
  | GPU integrada | ×1,5 | ×1,25 | medio |
  | Móvil | ×1,5 | ×1 | bajo |
  | Software | ×1 | ×0,5 | mínimo |

  Nunca por encima de la densidad de la pantalla, y con pantalla táctil, como mucho «medio».
- **Resolución dinámica** (`createResolutionController`):
  - **Medición:** ventanas de 1 s, con la mediana de los intervalos para que un tirón aislado no cuente. Se descartan las dos primeras ventanas y los intervalos de más de 1 s (pestaña oculta).
  - **Bajada:** cuando la mediana baja de 48 FPS, la relación pasa a p·√(fps/55), porque el coste es ∝ p².
  - **Subida:** ×1,15 tras dos ventanas seguidas a 57 FPS o más.
  - **Histéresis:** cada bajada fija un techo que no se vuelve a superar durante 15 s, el doble tras cada fallo.
- **Límite por CPU, medido** y no por tanteo:
  - cada escena informa del tiempo de CPU de su fotograma;
  - si la mediana es ≥ 75 % del intervalo, bajar la resolución no ayudaría y no se toca.
- **Nivel de detalle:** si tres ventanas seguidas no llegan a 48 FPS con la resolución mínima o por límite de CPU, el controlador pide un nivel menos (alto → medio → bajo → mínimo).
- **Estado por escena** (`principal` y `lanzamiento`):
  - cada una aprende su resolución y su detalle;
  - `reportFrame(dt, { contexto, cpu })` se llama solo en fotogramas realmente dibujados;
  - al cambiar de escena se reinicia su controlador.
- **Cargas:** `suspenderAdaptacion(promesa)` hace que, mientras se prepara el lanzamiento, los fotogramas lentos no cuenten.
- **Perfil «Mínima»** (×0,6 y detalle mínimo) para equipos sin aceleración. Los perfiles fijos (Alta, Media, Baja, Mínima) nunca cambian solos.
- **Preferencia de GPU** (`setGpuPreference`), «Alto rendimiento» o «Ahorro de energía»:
  - pasa `powerPreference` a cada contexto WebGL que se cree;
  - en equipos con dos GPU elige cuál pide el navegador;
  - la escena principal la toma al recargar.
- **Suavizado de bordes (MSAA)** solo con detalle alto o medio (`opcionesRenderizador`).

### Lanzamiento 3D (`src/launch/`)

`ajustesLanzamiento(detalle)`, función pura y probada, define qué se dibuja en cada nivel:

| Detalle | Suavizado y sombras | Reflejos del cielo y nubes | Teselado del globo, nubes y atmósfera | Humo (partículas) | Nubes de suelo y base | Globo de 8k |
| --- | --- | --- | --- | --- | --- | --- |
| alto | sí | sí | completo | 2 200 | 340 y 90 | sí (escritorio) |
| medio | sí | sí | completo | 1 600 | 260 y 70 | no |
| bajo | no | sí | mitad | 900 | 160 y 40 | no |
| mínimo | no | no | mitad | 600 | 110 y 28 | no |

- Con menos partículas, las emisiones se reparten por el mismo intervalo y cada bocanada es algo mayor, para cubrir lo mismo.
- Si el modo automático baja el detalle durante el lanzamiento, se apagan las sombras y las nubes sin recompilar sombreadores (`reducirDetalle`).
- **Lo que no cambia en ningún nivel:**
  - la trayectoria, el reloj y los acontecimientos;
  - la telemetría;
  - el Sol, las estrellas, las ortoimágenes de Florida, el Cabo y LC-41;
  - los modelos y `Voyager.glb`.

### Escenas e interfaz

- `SolarSystem.js`: informa del tiempo de CPU de cada fotograma dibujado; no informa en pausa ni durante la precompilación.
- `main.js`: suspende la adaptación mientras se prepara el lanzamiento y le pasa el detalle aprendido para su escena.
- Las vistas del laboratorio crean sus renderizadores con `opcionesRenderizador`.
- **Menú «Capas» → Calidad gráfica:**
  - «Automática» ocupa la fila; debajo, Alta, Media, Baja y **Mínima**;
  - nuevo grupo **Procesador gráfico** con «Alto rendimiento» y «Ahorro de energía»;
  - el estado dice con qué dibuja el navegador. Si es por software, explica cómo activar la aceleración por hardware;
  - aviso «Se aplica al recargar la página» al cambiar la preferencia.
- **Contador de FPS:** añade la resolución de render (p. ej. «×0,5») y «CPU» si se dibuja por software.

## Resultados

### Lanzamiento 3D por software (SwiftShader, Voyager 2)

Instantes en pausa ([antes](../evidence/stage27/lanzamiento-swiftshader-antes.json), [después](../evidence/stage27/lanzamiento-swiftshader-despues.json)):

| Instante | Antes | Después |
| --- | --- | --- |
| Aproximación | 2,8 | 18,7* |
| Plataforma, plano general | 1,8 | 18,9 |
| Base, cuenta atrás | 2,3 | 27,3 |
| Despegue | 5,2 | 50,5 |
| Seguimiento | 11,0 | 67,2 |
| Persecución | 7,9 | 49,4 |
| Separación de los SRM | 2,2 | 35,1 |
| Cofia | 2,4 | 48,4 |
| Centaur MES-1 | 3,8 | 58,3 |
| Aparcamiento | 2,9 | 68,2 |
| Separación de la nave | 7,5 | 92,9 |
| Mástiles (NASA) | 10,8 | 99,8 |

\* Medido nada más saltar a ese instante, antes de que la resolución se adapte. En la reproducción, la aproximación va a 35 FPS.

**Reproducción completa a ×1** (245 s, 14 248 fotogramas):

- antes no pasaba de la aproximación en el tiempo disponible: 3,6 FPS;
- ahora, **57,8 FPS de media** con el lienzo visible, o **52,9 FPS** si se limita a 60 Hz como una pantalla normal;
- el 22,6 % del tiempo transcurre en planos por debajo de 50 FPS:
  - aproximación, 35;
  - plataforma, 22–27;
  - despegue, 46;
  - laterales, 44–46.

### Resto del simulador por software

[Antes](../evidence/stage27/general-swiftshader-antes.json) y [después](../evidence/stage27/general-swiftshader-despues.json), en FPS:

| Momento | Antes | Después |
| --- | --- | --- |
| Sistema Solar en reposo | 11,9 | **57,5** |
| Sistema Solar reproduciendo | 17,8 | **53,0** |
| Sistema Solar arrastrando la cámara | 16,8 | **49,3** |
| Misiones históricas en reposo | 12,1 | 30,8 |
| Misiones históricas reproduciendo | 14,5 | 36,8 |
| Volver al Sistema Solar | 21,5 | 75,6 |
| Entrar en el laboratorio | 15,9 | 44,7 |
| Reproducción del laboratorio | 10,9 | 27,5 |

### Con la GPU real (sin regresión)

- Lanzamiento ([perfil](../evidence/stage27/lanzamiento-gpu-despues.json)): 164 FPS de media; en los 12 instantes, 179,9 FPS, que es el límite de cadencia del Chrome sin ventana.
- Relación ×1 y 0,3–2,2 ms de GPU por fotograma.
- La regresión en Chrome de las etapas 24, 25 y 26 no da errores ([registros](../evidence/stage29/regresion/)).
  - Despegue a 162–170 FPS.
  - El único aviso es el X4122 del compilador de sombreadores de Direct3D, que ya estaba en las evidencias de las etapas 25 y 26.

## Pruebas

- [`tests/Stage27AdaptivePerformance.test.mjs`](../tests/Stage27AdaptivePerformance.test.mjs) (11 pruebas):
  - clase del procesador gráfico con nombres reales y nombre legible;
  - perfil inicial por equipo;
  - resolución dinámica con un modelo de coste: con GPU potente, intermedia y lenta, cada una acaba entre 48 y 61 FPS sin oscilar; por software baja al mínimo y pide menos detalle;
  - límite por CPU medido;
  - tirones aislados y planos alternos;
  - niveles de detalle del lanzamiento y textura del globo;
  - opciones del renderizador;
  - estado separado por escena;
  - suspensión durante cargas;
  - textos del menú y del contador.
- [`tests/QualityProfile.test.mjs`](../tests/QualityProfile.test.mjs): la prueba del modo automático usa ahora un modelo de coste ∝ p². La comprobación de bajada se conserva.
- Total del proyecto: **420 pruebas**, todas pasan.

## Límites

- **No en todas las escenas se llega a 50 FPS por software.** Las misiones históricas se quedan en 31–37 FPS, la reproducción del laboratorio en 27,5 y las vistas de la plataforma en 19–27. Ahí manda el coste por objeto del rasterizador por software, no la resolución, que ya está en el mínimo.
  - **Siguiente paso posible, no hecho:** fusionar la geometría estática de la plataforma y del cohete con detalle mínimo.
  - **Con aceleración por hardware**, cualquier GPU actual supera de sobra los 60 FPS. El menú lo indica cuando detecta dibujo por software.
- **Una página web no puede elegir entre CPU y GPU**: lo decide el navegador.
  - El simulador detecta cuál se usa y se adapta.
  - Con dos GPU, puede pedir la potente o la de bajo consumo.
- **Sin medir en un equipo modesto real ni en un móvil real.** Las cifras por software dependen de la CPU de este equipo (12 hilos).
- **No comprobado en un equipo con dos GPU:** que «Ahorro de energía» cambie de GPU. Sí se comprobó que la opción llega a la creación del contexto (prueba) y que el aviso de recarga aparece.
- **Pendientes:**
  - revisión visual por una persona, en especial del lanzamiento con detalle mínimo;
  - prueba con un lector de pantalla real.
