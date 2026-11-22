# Etapa 25 · Lanzamiento 3D de las Voyager desde LC-41

Estado: **implementada y probada localmente (21-11-2026)**, revisada en Chrome con GPU AMD real a 1600 × 900 (ambas misiones) y 390 × 844. Auditoría: Claude, que también la implementó ([informe](STAGE25_AUDIT_CLAUDE.md)). El perfil científico nuevo (`src/science/VoyagerLaunchProfile.js`) **necesita además la revisión de alguien que no lo implementó**: Gemini u otra sesión de Claude sin este contexto. No cambia DOPRI54, las efemérides, los kernels, las fotografías ni `Voyager.glb`.

## Objetivo

Petición del usuario: mejorar la animación «Lanzamiento 3D» de las Voyager 1 y 2 para que sea lo más realista posible:

- un acercamiento desde el Sistema Solar hasta la Tierra y la posición real de lanzamiento (Complejo 41 de Cabo Cañaveral, Florida);
- el vehículo, la plataforma, las texturas y el cielo, lo más fieles posible;
- al final, el modelo 3D de la Voyager que ya usa el simulador.

Sustituye a la cinemática anterior, que se dibujaba dentro de la escena principal con piezas esquemáticas. Se retiran `LaunchCinematicController.js`, `LaunchPadLC41.js` y `TitanCentaurRocket.js`.

## Recorrido

| Tramo | Qué se ve | Tiempo de misión |
| --- | --- | --- |
| Acercamiento en la escena principal (3,2 s) | La cámara del Sistema Solar se acerca a la Tierra. El meridiano se orienta con el punto subsolar del instante, así que el lado iluminado es el real (Américas por la mañana) | Antes de T − 24 s |
| Aproximación | La escena de lanzamiento empalma con el último fotograma y desciende hasta LC-41: globo Blue Marble, Florida, el Cabo y el complejo con ortoimágenes | T − 24 s → T − 10 s |
| Cuenta atrás | Plano general y plano desde la base: Titan IIIE-Centaur de 48,8 m, torre umbilical y torre de servicio retirada | T − 10 s → T 0 |
| Ignición y despegue | Motores sólidos UA1205, humo por los fosos de llamas, vibración de cámara en tierra | T 0 → T + 20 s |
| Ascenso | Programa de giro y cabeceo hacia el este, teleobjetivo desde tierra y persecución | Hasta T + 2 min |
| Separaciones | Motores sólidos (caen en vuelo libre), etapa I, cofia (se abre por bisagras), etapa II y Centaur | T + 2 min → T + 10 min |
| Órbita de aparcamiento | Crucero acelerado (hasta ×250) de unos 43 minutos | MECO-1 → MES-2 |
| Salida | Segundo encendido del Centaur, separación de la nave e inyección con el módulo de propulsión | Hasta T + 1 h 03 min |
| Despliegue y final | Suelta de los mástiles: fundido de la nave plegada al **modelo oficial `Voyager.glb`**, separación del módulo de propulsión y vuelta automática a la escena principal | Hasta T + 1 h 14 min |

Los acontecimientos van a velocidad real (×1) o casi (×1,5–×3). Los tramos sin cambios se aceleran con rampas suaves. La presentación dura unos 237 s.

## Fidelidad

| Clase | Contenido |
| --- | --- |
| **Documentado** (con fuente en cada acontecimiento) | Hora de ignición: Voyager 1, 12:56:00,958 UTC, informe TC-6; Voyager 2, 14:29:44 UTC de despegue, NASA History. Lugar: LC-41, 28,5833° N, 80,5828° O. Secuencias de vuelo: TC-6 medido para la Voyager 1; dossier de prensa de 1977 para la Voyager 2. Medidas, empujes, impulsos específicos y masas: resumen de sistemas de 1973. Masas de la nave: dossier de prensa |
| **Calculado** | Tiempo sidéreo (IAU 1982), posición aparente del Sol (fórmula del Astronomical Almanac, ≈ 0,01°), punto subsolar, estrellas Hipparcos (V ≤ 6,5) orientadas con el tiempo sidéreo. Contrastado con JPL Horizons: altura y acimut del Sol en LC-41 (pruebas) y punto subsolar (auditoría, ≤ 0,008°) |
| **Ilustrativo** | Trayectoria de ascenso, llamas, humo, estela, viento, nubes y bruma. La Voyager 2 tiene más nubosidad según la fotografía PIA21744; la Voyager 1, cielo casi despejado según PIA21746 |
| **Aproximado** | Plataforma y torres de 1977, a partir de PIA21739, PIA21742 y PIA21744, con el vehículo como escala. Reparto de los ≈ 2 m que faltan hasta los 160 ft, forma de narices y toberas, colores y marcas. Terreno: ortoimagen USGS de 2024 y Blue Marble de 2004, no la Tierra de 1977 |
| **Reconstruido** (marcado en el panel) | Voyager 2: giro, MES-2, MECO-2 y separación del módulo de propulsión, deducidos de duraciones documentadas, porque no se localizó el informe del TC-7. Voyager 1: suelta de los mástiles, por la secuencia típica del dossier |

### Ascenso ilustrativo calibrado

`VoyagerLaunchProfile.trayectoriaLanzamiento` es un modelo de masa puntual integrado con RK4 en un marco inercial. Usa:

- Tierra esférica que gira y sin atmósfera;
- empujes, Isp, masas y tiempos documentados;
- guiado vertical hasta 10 s, cabeceo lineal hasta la separación de los motores sólidos y, después, tangente lineal.

Tres parámetros (θ₁, c, β) se calibran por Newton para llegar en el MECO-1 documentado a 90 millas náuticas, en trayectoria horizontal y a velocidad circular.

Contraste independiente (datos del TC-6 que no se usan en la calibración):

| Magnitud | Modelo | TC-6 |
| --- | --- | --- |
| C3 tras el Centaur | 52,6 km²/s² | 51,0 km²/s² |
| C3 tras el módulo de propulsión | 106,9 km²/s² | 105,4 km²/s² |
| Inclinación de aparcamiento | 28,68° | 28,52° |

Para la Voyager 2 el modelo da 51,9 y 106,0 km²/s². **No es telemetría**: las fuentes no publican altitud ni velocidad durante el ascenso, y el panel lo dice («Ascenso ilustrativo calibrado, no telemetría»). Las piezas separadas siguen en vuelo libre de dos cuerpos (`propagarBalistico`) desde el estado del vehículo, y se ocultan al llegar al suelo.

## Arquitectura

| Archivo | Responsabilidad |
| --- | --- |
| `src/science/VoyagerLaunchProfile.js` (nuevo) | Datos documentados con fuente, tiempo sidéreo, Sol, punto subsolar, matriz ecuatorial → ENU, ascenso calibrado, estados ENU que giran con la Tierra y vuelo libre. Sin DOM ni Three.js |
| `src/launch/LaunchTimeline.js` | Tiempo de pantalla ↔ tiempo de misión (velocidad continua, tramos rápidos con rampas), fases, planos de cámara y reloj «T ± mm:ss» |
| `src/launch/LaunchWorld.js` | Renderizador propio (búfer logarítmico, ACES), globo, parches de Florida, Cabo y LC-41 por latitud y longitud, nubes, cielo Preetham con el Sol del instante, estrellas, Sol visto desde el espacio, capa atmosférica, perspectiva aérea según la altitud, sombras y exposición |
| `src/launch/LC41Pad1977.js` | Plataforma móvil, torre umbilical con brazos, torre de servicio retirada, vías, fosos de llamas, báculos y explanada |
| `src/launch/TitanIIIECentaur3D.js` | Vehículo a escala real con las medidas documentadas, piezas separables, nave plegada, módulo de propulsión y fundido por *alpha hash* |
| `src/launch/LaunchEffects.js` | Llamas por propulsante (sólido aluminizado, hipergólico, RL10, módulo de propulsión), humo instanciado, estela y Sol |
| `src/launch/VoyagerLaunchDirector.js` | Dirección: estado del vehículo, separaciones, humo determinista, planos de cámara (adaptados a pantallas verticales), modelo de NASA, bucle, controles y limpieza |
| `src/ui/LaunchCinematicOverlay.js` (reescrito) | Panel: misión, reloj, UTC, factor, altitud, velocidad inercial y respecto al suelo, fase, acontecimiento con fuente, marcas, controles y «Fidelidad y fuentes» |
| `src/graphics/SolarSystem.js`, `PlanetFactory.js` | `aproximarATierraParaLanzamiento`, `terminarAproximacionTierra`, `orientarMeridiano` y `direccionGeografica` |
| `src/main.js` | Apertura (carga diferida del director en paralelo con el acercamiento), cierre, Escape y diagnóstico (`obtenerEstadoLanzamiento`, `irALanzamiento`, `pausarLanzamiento`, `reanudarLanzamiento`, `interiorLanzamiento`) |
| `src/ui/workspace-layout.css` | Estilos del panel con los tokens del sistema visual: oscuro y grafito, dorado para la misión, `[hidden]`, móvil y movimiento reducido |
| `public/launch/` (nuevo) | Cinco imágenes de dominio público, con procedencia, peticiones y SHA-256 en su [README](../public/launch/README.md) |
| `scripts/derive-launch-cape-fill.mjs` | Relleno declarado de las zonas «sin datos» de la ortoimagen del Cabo |

Marco de la escena: ENU de LC-41 fijo a la Tierra (x = este, y = arriba, z = sur, en metros) con el centro de la Tierra en (0, −R, 0). Es independiente de la escala de 32 unidades/AU de la escena principal. Todo el estado visual se deriva del instante de misión: pausar, saltar, repetir o cambiar la velocidad es determinista.

## Descarga y rendimiento

- **Código.** El director es un fragmento aparte de 58 kB (22 kB comprimido) que solo se descarga al pulsar el botón.
- **Imágenes y catálogo.** 4,23 MB de imágenes (2,37 MB del globo a 8192 px y 1,86 MB de Florida, el Cabo y LC-41) más el catálogo Hipparcos (0,41 MB). `Voyager.glb` ya está en caché desde el modo histórico.
- **Calidad «Baja».** Usa el globo de 4096 px, menos humo y sombras de 2048 px. Este perfil **no se ejercitó** en el navegador.
- **Medidas** en este equipo (servidor de desarrollo, Chrome con GPU AMD real):

  | Pantalla | Escena lista tras el clic | Fotogramas/s en el despegue |
  | --- | --- | --- |
  | 1600 × 900, Voyager 2 | 5,3 s | 119 |
  | 1600 × 900, Voyager 1 | 4,3 s | 144 |
  | 390 × 844 | 5,2 s | 147 |

## Accesibilidad y controles

- **Botones nativos:** anterior y siguiente acontecimiento, pausa, ×1/×2/×4 (`aria-pressed`), repetir, marcas de acontecimientos con nombre y «Volver al Sistema Solar».
- **Escape** vuelve al Sistema Solar, también durante el acercamiento.
- **Anuncios** `aria-live="polite"`, solo cuando cambia el acontecimiento.
- **Movimiento reducido:** con `prefers-reduced-motion` no hay vibración de cámara y el lienzo aparece sin transición.
- **Pantallas estrechas:** el panel se compacta. En vertical, el campo de visión se amplía para conservar el encuadre horizontal de cada plano, sin pasar de 80°.

## Pruebas

`tests/Stage25VoyagerLaunch.test.mjs`: 14 pruebas. La suite completa tiene **344/344**.

- Tiempo sidéreo y Sol frente a Meeus (12.a, 12.b y 25.a).
- Sol en LC-41 en ambos despegues frente a JPL Horizons.
- Matriz ecuatorial → ENU.
- Secuencias ordenadas, con fuente y con nota cuando son reconstruidas.
- Vehículo en SI.
- Calibración hasta la órbita de aparcamiento, y validación con el TC-6 no usada para calibrar.
- Geometría ENU.
- Determinismo.
- Punto subsolar: mediodía de Greenwich y coherencia con la altura del Sol en LC-41.
- Línea de tiempo: monótona, invertible, ×1 en los acontecimientos y acelerada en el crucero.
- Reloj de misión.
- Vuelo libre de las piezas separadas, con conservación de la energía.

Además pasan `npm run build`, `GITHUB_PAGES=true npm run build` (rutas con el prefijo `/simulador-sondas-espaciales/`) y `git diff --check`.

## Verificación en el navegador

Guion: `GPU=1 node scripts/verify-stage25-launch.mjs ambas`, con `WIDTH`, `HEIGHT` y `EVIDENCE_DIR` opcionales. Recorre el flujo como lo haría una persona:

- modo histórico, misión e inspector («Explorar → Lanzamiento y ayuda»);
- el acercamiento, con 21 capturas relativas a los acontecimientos;
- fotogramas por segundo;
- controles, marcas y anuncios;
- vuelta al Sistema Solar y cancelación con Escape durante el acercamiento;
- comprobación de que no queda ningún lienzo.

Resultados en [`evidence/stage25/verify-stage25-gpu.json`](../evidence/stage25/verify-stage25-gpu.json) y [`movil-390/`](../evidence/stage25/movil-390/): sin errores de la aplicación. El único aviso es X4122, del compilador HLSL de ANGLE para el sombreador del cielo, y es inocuo. Se conservan 25 capturas representativas; el guion regenera el juego completo.

## Límites y pendientes

- **Revisión científica independiente** del perfil de lanzamiento (regla del proyecto para física y datos nuevos).
- **Revisión visual por una persona** y prueba con lector de pantalla real (NVDA o Narrador).
- **Rendimiento** solo medido en un equipo y en el servidor de desarrollo. Falta medir con la compilación de producción en un móvil real.
- **Datos de la Voyager 2:** no se localizó el informe de vuelo del TC-7, así que su secuencia mezcla el dossier de prensa y tramos reconstruidos (marcados).
- **Terreno de 2024:** en la ortoimagen de LC-41 se ven instalaciones actuales del Atlas V fuera de la explanada; la plataforma de 1977 es aproximada.
- **Escena principal:** al volver, la Tierra mantiene su giro ilustrativo (un día cada 140 s), previo a esta etapa.
