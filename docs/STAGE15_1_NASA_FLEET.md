# Etapa 15.1 — Flota fija con modelos 3D oficiales de NASA

Encargos del usuario (19-11-2026). Primero: «¿Puedes descargar y usar los modelos 3D de la NASA? Si puedes, hazlo e incorpóralos. […] Que solo tengamos disponibles las cuatro sondas. Quitemos eso de poder cambiar componentes. Solo misiones nuevas usando esas sondas, y poder elegirlas para las misiones que queramos. Analiza primero si puedes hacerlo y si es buena decisión.» Después: «Quita también el módulo de propulsión y el de aterrizaje.»

**Estado:** la etapa está implementada y pasa las pruebas locales y la revisión en Chrome con SwiftShader. Quedan pendientes la auditoría independiente de Gemini y la revisión con GPU real. No hay commits ni publicación.

## 1. Análisis

**¿Se puede hacer? Sí.**

- **Licencia:** el repositorio oficial [nasa/NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources) publica los modelos de Cassini, Dawn y Juno en GLB y declara «free and without copyright». Las [pautas de NASA](https://www.nasa.gov/nasa-brand-center/images-and-media) piden acreditar a NASA y no sugerir su respaldo. El proyecto ya usaba el modelo oficial de Voyager.
- **Tamaño:** Cassini ocupa 1,7 MB, Dawn 0,9 MB y Juno 9 MB. Juno solo se descarga al elegirla.
- **Escala:** las mallas están en metros. La envergadura de Dawn mide 19,70 m (19,7 m documentados) y la antena de Cassini 4,01 m (4 m documentados).
- **Orientación:** las mallas usan +Y hacia la antena principal, la misma convención del Centro de Misión.
- **Sin dependencias nuevas:** la compresión Draco se decodifica con el decodificador que ya trae three 0.186.1.

**¿Es buena decisión? Sí, y conviene hacerlo como flota fija.**

- **Las mallas no se pueden recombinar.** Un modelo oficial es una malla única y no se puede descomponer en piezas intercambiables. Mantener el modo de personalización obligaría a mostrar dos modelos distintos de la misma sonda.
- **Hay menos cifras estimadas.** Lo más estimado del simulador eran las combinaciones de piezas de programas distintos: adaptadores, consumos cruzados y centros de masas de mezclas. Al fijar las cuatro configuraciones históricas, cada misión usa datos con fuente y calidad declaradas.
- **El flujo es más claro:** elegir sonda → planificar → ejecutar. La sonda se cambia desde cualquier pantalla del laboratorio.
- **Contrapartida:** se pierde la exploración de diseños propios del modo personalizado de la etapa 15. El usuario lo decidió explícitamente.

## 2. Qué cambió

| Ámbito | Cambio |
| --- | --- |
| Hangar (`src/ui/ExperimentalLaboratory.js`, reescrito) | Muestra solo la flota: cuatro tarjetas y la ficha técnica con calidad y fuente de cada cifra, el crédito del modelo y el botón «Planificar una misión con…». Desaparecen el catálogo de piezas, los puntos de montaje, los adaptadores, la sustitución de piezas, las plantillas, guardar, exportar e importar. Ingeniería pasa a ser de solo lectura: subsistemas, masas, propulsión, energía según la distancia y calidad de los datos. |
| Sonda activa | Selector en la cabecera del laboratorio, visible también en el Planificador y en el Centro de Misión. La elección se guarda en `localStorage` (`simulador:sonda-activa`); si el navegador lo bloquea, se usa Cassini. Cada sonda tiene un identificador estable (`flota-<id>`), así que un cálculo se invalida al cambiar de sonda y no se mezcla con el de otra. |
| Modelos 3D (`src/graphics/NasaProbeModels.js`, nuevo) | Registro de procedencia (archivo, bytes, SHA-256, commit y crédito). Carga con `GLTFLoader` y `DRACOLoader` desde `import.meta.env.BASE_URL`. Usa una caché por modelo y vuelve a intentar la descarga si falla. Oculta el cubo auxiliar de exportación por su material. La caja envolvente se calcula en el espacio local. |
| Hangar 3D (`src/lab/ProbeAssemblyView.js`) | Monta primero la reconstrucción procedimental, que aparece al instante, y la sustituye por el modelo de NASA cuando termina de cargarse. Si la carga falla, la reconstrucción se queda en pantalla y el estado lo indica. |
| Centro de Misión (`src/lab/MissionExecutionView.js`) | Muestra el modelo de NASA de la sonda activa con la misma escala visual y la misma orientación (+Y en la dirección del movimiento). |
| Planificadores | Los rótulos dicen «Sonda activa». Las notas de los escenarios C1 y C2 se reescribieron con los resultados reales de las cuatro sondas (tabla 3). |
| Navegación | El grupo «Laboratorio · Elegir sonda» describe la flota. |
| Módulo de propulsión (segundo encargo) | Se retira del Planificador de misión completa la casilla «Módulo de propulsión orbital (ilustrativo)», con su propelente, empuje e Isp editables. También se retiran los escenarios B1 y B2, que dependían de un módulo de 80 t o de 50 t. Ahora toda maniobra la hace el motor de la sonda activa. |
| Módulo de aterrizaje (segundo encargo) | Se retiran del Planificador las casillas «Módulo de aterrizaje demostrativo de 12F» e «Intentar el descenso». Desaparecen también la sección «Descenso y aterrizaje» del laboratorio y su entrada en el navegador de áreas, porque su vehículo era ese módulo y la sonda solo viajaba como carga útil. Los enlaces antiguos a esa sección llevan al Hangar. En el Centro de Misión, las filas de telemetría de los módulos solo aparecen si un resultado los incluye. |
| Escenarios de Marte | A1 pasa a ser una captura elíptica de 3000 × 100 000 km. La de 400 × 33 000 km se llamaba «combustible suficiente», pero ninguna sonda de la flota la alcanzaba. A2 se renombra «órbita circular baja de 400 km (exigente)». Las notas recogen los resultados de las cuatro sondas (tabla 3). |

**Lo que se conserva sin cambios:**

- Motor de los módulos (`DEMO_PROPULSION_MODULE`, `BodyLandingVehicle.js`, `BodyLandingSimulation.js` y la rama de descenso de `IntegratedMission.js`), `src/ui/LandingPlanner.js` (ya no se monta, pero `tests/Stage12F1Corrections.test.mjs` lo inspecciona) y sus pruebas. La interfaz ya no los ofrece. Tras una captura en un satélite, la cadena muestra la fase de descenso como omitida («Sin módulo de aterrizaje en la configuración»).

- Motor de diseño (`ProbeDesign.js`, `ComponentCatalog.js`, adaptadores) y sus pruebas, porque la configuración histórica se construye con el mismo modelo de puntos de montaje y piezas.
- Física de misión, DOPRI54, efemérides, datos, `Voyager.glb` y modo histórico.
- La función síncrona `createProbeAssemblyModel`, que usan las pruebas.

**Copia de seguridad previa:** `evidence/backup-stage15-antes-de-15.1/`, con SHA-256 de cada archivo.

## 3. Escenarios de referencia con cada sonda

Perfil C1/C2: salida el 26-12-2028, 1090 días, captura en Júpiter a 4200 km × 8 000 000 km.

| Sonda | C1 · sobrevuelo de Europa a 100 km | C2 · captura en Europa | Energía |
| --- | --- | --- | --- |
| Voyager | No viable: con 100 kg de hidracina (Δv 279 m/s frente a unos 495 m/s necesarios) no se captura en Júpiter y sigue un sobrevuelo | No viable (la misma causa) | Correcta, peor margen +39 W (RTG) |
| Cassini | Cadena completa según el modelo | No viable: se agota el propelente (372 kg, 407 m/s frente a unos 4357 m/s) | Correcta, +107 W |
| Dawn | No viable: a 5,21 AU quedan 12 W para el motor iónico, por debajo del mínimo de 500 W | No viable (la misma causa) | Déficit de −43 W a 5,58 AU |
| Juno | Cadena completa según el modelo | No viable: se agota el propelente (532 kg, 899 m/s frente a unos 4539 m/s) | Correcta, +78 W |

Perfil A: salida el 30-11-2028 hacia Marte, 316 días.

| Sonda | A1 · captura 3000 × 100 000 km | A2 · órbita circular de 400 km | A3 · sobrevuelo |
| --- | --- | --- | --- |
| Voyager | No viable: agota los 100 kg de hidracina y sigue un sobrevuelo | No viable (la misma causa) | Completo |
| Cassini | Órbita alcanzada (2359 kg de propelente, Δv 1666 m/s) | No viable: impacto con Marte durante el encendido | Completo |
| Dawn | No viable: su motor iónico no puede frenar en un solo paso | No viable (la misma causa) | Completo |
| Juno | Órbita alcanzada (1303 kg, Δv 1390 m/s) | No viable: impacto durante el encendido | Completo |

Para elegir A1 se exploró una rejilla de periapsis (400, 1000 y 3000 km) por apoapsis (33 000, 100 000 y 300 000 km). Con periapsis de 400 km, Cassini y Juno chocan con Marte en las tres apoapsis porque su empuje es bajo para la masa que llevan. Dentro de esa rejilla, 3000 × 100 000 km es la combinación de menor apoapsis con la que ambas se capturan.

Las cifras proceden de `computeIntegratedMission`, con las mismas efemérides que el planificador. En el navegador se repitieron A1 con Cassini y C1 con Voyager y con Cassini, con el mismo resultado.

## 4. Verificación

- **Pruebas:** `node --test tests/*.test.mjs` da 287/287. Son las 283 anteriores más 4 nuevas en `tests/NasaProbeModels.test.mjs`, que comprueban:
  - tamaño y SHA-256 de los archivos servidos, iguales al registro y al README;
  - que las extensiones requeridas sean solo `KHR_draco_mesh_compression`;
  - que el decodificador sea idéntico al de three;
  - que las mallas estén en metros, comparadas con las medidas documentadas;
  - que el cubo auxiliar se detecte y que la caja local no dependa de la pose.
- **Compilación:** `npm run build` correcto, también con `GITHUB_PAGES=true` y el prefijo `/simulador-sondas-espaciales/`. `git diff --check` limpio.
- **Navegador** (`scripts/verify-stage15_1-browser.mjs`, Chrome sin interfaz con SwiftShader, evidencia en `evidence/stage15_1/`):
  - las cuatro sondas se muestran con el modelo de NASA (estado `nasa`);
  - el decodificador Draco se descarga desde `libs/draco/gltf/` una vez por carga de página (HTTP 200); *(etapa 18: ahora desde `assets/`, la copia de three)*;
  - no queda ningún control de personalización;
  - la sonda activa se conserva al recargar;
  - el cambio de sonda desde la cabecera invalida el cálculo;
  - el Centro de Misión muestra el modelo de Cassini en la máxima aproximación a Europa;
  - 0 errores de consola;
  - en las 7 resoluciones: sin desbordamiento horizontal y sin controles recortados (resultado en el JSON del registro).
- `scripts/verify-stage15-browser.mjs` queda marcado como sustituido en lo que toca al Hangar. Se conserva como evidencia de la etapa 15.

## 5. Límites y pendientes

- **Modelo 3D y cálculos:** el modelo es solo presentación. El centro de masas, las masas por subsistema y los consumos sin fuente siguen siendo estimaciones del catálogo, y la malla no los corrige. Sobre el modelo de NASA no se dibujan el marcador del centro de masas ni las piezas seleccionadas, que sí aparecían en la reconstrucción.
- **Juno:** su diámetro de antena no tiene fuente contrastada en el catálogo. El modelo mide 2,38 m y el catálogo indica 2,5 m, marcado como «desconocido».
- **Voyager:** el modelo representa una nave genérica de la serie. La flota agrupa Voyager 1 y 2 en una sola configuración.
- **Compilación:** `DRACOLoader` hace que Vite copie en `dist/assets` otro juego de decodificadores, de unos 1,3 MB, que no se descarga en tiempo de ejecución (ver `public/libs/draco/README.md`). *Etapa 18: resuelto; la copia de `public/libs/draco` se retiró y se usa solo la de three ([STAGE18_FAST_LOADING.md](STAGE18_FAST_LOADING.md)).*
- **Sin descensos:** con los dos módulos retirados, ninguna misión de la interfaz llega a la superficie. Es coherente con las cuatro sondas, que no eran módulos de aterrizaje.
- **Lanzador:** el lanzador ilustrativo de dos etapas de «Lanzamiento» se mantiene porque no se pidió retirarlo. Es un cohete ilustrativo, no uno real.
- **Revisiones pendientes:** auditoría de Gemini, revisión con GPU real y publicación. Commits y push solo con autorización.
