# Etapa 18 · Carga rápida

Estado: **implementada y probada localmente (21-11-2026)**. Auditoría: Claude, que también la implementó ([informe](STAGE18_AUDIT_CLAUDE.md)). Solo presentación y entrega de archivos: no cambia física, constantes, marcos, efemérides, datos, hashes, kernels, fotografías ni modelos (`Voyager.glb` y los GLB de NASA se sirven byte a byte como antes).

## Objetivo (plan de mejora, §8)

Bajar la descarga inicial, que era de 20 MB en 65 peticiones igual en móvil: modelos GLB y texturas bajo demanda, el código del laboratorio en un módulo aparte, una sola copia de Draco y un perfil de texturas ligero.

## Qué cambió

| Pieza | Antes | Ahora | Archivo |
| --- | --- | --- | --- |
| Texturas de planetas y lunas | Todas al crear la escena (≈ 12 MB de JPG/PNG) | Cada cuerpo registra su carga; se pide cuando el cuerpo es visible y su disco mide al menos **2 px de radio** en pantalla. Hasta entonces conserva su color de respaldo, indistinguible a ese tamaño | `src/graphics/DeferredTextures.js` (nuevo), `PlanetFactory.js`, `MoonVisuals.js`, `HeliosphereVisual.js`, `SolarSystem.js` |
| Tierra | Al arrancar | Se adelanta cuando el navegador queda libre (`requestIdleCallback`, 2,5 s tras arrancar), salvo con ahorro de datos o conexión 2G/3G | `main.js` |
| `Voyager.glb` (3,0 MB) | Al arrancar, aunque se empezara en exploración | Al entrar en el modo histórico (`precargarModelosHistoricos`) o cuando una Voyager se muestra | `SpaceProbeVisual.js`, `SolarSystem.js`, `main.js` |
| GLB de la flota en el laboratorio (Cassini 1,6 MB…) | Al montar la vista, aunque estuviera oculta | Cuando la vista 3D de la sonda es visible | `src/lab/ProbeAssemblyView.js` |
| Código del laboratorio (294 kB, 94 kB comprimido) | En el archivo principal | Módulo aparte que se importa al entrar en el laboratorio; la navegación pedida antes de cargarlo (`lab:navigate`) se retiene y se repite | `main.js`, `src/ui/AppNavigator.js` (`attachLab`) |
| Hoja del laboratorio | Importada por el laboratorio | La importa `main.js` en su posición de siempre, para que la cascada no cambie (la regresión detectó que, al llegar después de `theme.css` y `lab-shell.css`, pisaba reglas de esas capas); el CSS compilado es idéntico byte a byte al anterior | `main.js`, `ExperimentalLaboratory.js` |
| three.js | En el archivo principal | Archivo propio (`three-*.js`), que el navegador conserva en caché entre publicaciones | `vite.config.js` |
| Decodificador Draco | Copia en `public/libs/draco` y otra que Vite emitía desde three (1,3 MB duplicados en `dist`) | Solo la de three (`DRACO_GLTF_CONFIG`); la copia de `public/` se retiró | `NasaProbeModels.js` |
| Perfil de texturas ligero | — | Con calidad «Baja» o ahorro de datos, la Tierra no descarga sus mapas de relieve y rugosidad (0,7 MB), que solo matizan la luz; los mapas de color se conservan | `DeferredTextures.js` (`texturasLigeras`), `PlanetFactory.js` |

## Medidas (compilación de producción, `vite preview`, Chrome sin interfaz con GPU)

Guion: `node scripts/measure-startup.mjs` (con `GPU=1`). Datos en [`evidence/stage18/startup-antes.json`](../evidence/stage18/startup-antes.json) y [`startup-despues-2.json`](../evidence/stage18/startup-despues-2.json).

| Medida al arrancar | Antes | Después |
| --- | --- | --- |
| Escritorio 1366 × 768: peticiones · descarga | 65 · 20,13 MB | **20 · 3,87 MB** |
| Móvil 390 × 844 (DPR 3): peticiones · descarga | 61 · 20,08 MB | **16 · 3,11 MB** |
| Primera pintura con contenido | 904 ms | 832 ms |
| Escena lista | 1 618 ms | 1 029 ms |
| Tarea larga mayor | 736 ms | 393 ms |
| Al abrir el modo histórico | +2,25 MB | +5,24 MB (incluye `Voyager.glb`, que antes se pagaba al arrancar) |
| Al abrir el laboratorio | +0,02 MB | +2,33 MB (código del laboratorio, GLB de Cassini y Draco) |

El plan estimaba 6–8 MB al arrancar; la medida da 3,9 MB en escritorio, de los que 2,1 MB son JPG (sobre todo la Tierra adelantada y Marte, visible en la vista inicial). Son medidas locales en un solo equipo: en una red real cambian los tiempos, no los bytes.

## Pruebas

- `tests/Stage18FastLoading.test.mjs` (7 pruebas de comportamiento): radio aparente frente al cálculo de la proyección perspectiva; una textura se pide una sola vez y solo visible y con ≥ 2 px (lejos, oculta y cerca); crear planetas y lunas no descarga nada; precarga en reposo en orden y sin repetir (temporizadores simulados); ahorro de datos y 2G/3G; perfil ligero; y la estructura de carga diferida (importación dinámica del laboratorio, `Voyager.glb` y GLB del laboratorio).
- `tests/NasaProbeModels.test.mjs`: el decodificador es el de three, los archivos existen y la copia de `public/libs/draco` ya no está.
- Suite completa: **330/330**. `npm run build` y `GITHUB_PAGES=true npm run build` correctos. `git diff --check` limpio.
- **Navegador (GPU AMD real, D3D11)**: regresión completa `scripts/verify-stage17-browser.mjs all` → 102 capturas, **0 errores, sin desbordamiento horizontal**, accesibilidad automática igual que en la etapa 17 (el único control sin anillo de foco es el campo de fecha, pendiente conocido). Evidencias en `evidence/stage18/regresion/`: el registro JSON completo y 8 capturas representativas (las 102 se regeneran con el guion; se aligeró la evidencia según la etapa 19). Comprobación aparte en desarrollo: al seleccionar Ío se descargan las texturas de Ío, Europa y Ganímedes, y Draco se sirve desde three.

## Límites

- Los módulos del modo histórico no se separaron del archivo principal: están entrelazados con `main.js` (estado, bucle y controles compartidos) y separarlos sería una reestructuración, no una optimización localizada.
- El lanzamiento se separa en la etapa 25, que lo rehace.
- Una textura pedida tarda lo que tarde la red: durante ese intervalo el cuerpo se ve con su color de respaldo.
- No se generaron texturas reducidas para móvil (sería regenerar recursos); el perfil ligero solo omite mapas secundarios.
- Pendiente: medir en un móvil real y en una red real.
