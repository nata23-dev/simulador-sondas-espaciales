# Auditoría de la etapa 25 · Lanzamiento 3D de las Voyager

- **Auditor:** Claude (Opus 5.5). **Claude también implementó la etapa**, así que esta auditoría usa métodos distintos de la implementación:
  - consulta propia a JPL Horizons, con otra magnitud y otro observador que los usados en las pruebas;
  - comprobación de integridad de los recursos;
  - revisión adversaria del código;
  - prueba de ciclos y saltos extremos en el navegador con GPU real;
  - barrido de altitudes.
- **Fecha:** 21-11-2026.
- **Alcance:** presentación nueva y un módulo científico nuevo (`VoyagerLaunchProfile.js`) que no modifica física, constantes, marcos, integradores ni datos existentes. Al ser física nueva, **la regla del proyecto exige además la revisión de alguien que no la implementó** (Gemini u otra sesión de Claude sin este contexto). Sigue pendiente.
- **Veredicto:** **aprobada con observaciones.** Tres defectos encontrados durante la auditoría y corregidos (D-1 a D-3).

## Comprobaciones

| # | Método | Resultado |
| --- | --- | --- |
| 1 | **Punto subsolar frente a JPL Horizons en línea**, cantidad 15 «SunSub-LON/LAT» y observador en la Luna (tiempo de luz 1,3 s). Las pruebas usan otra magnitud: altura y acimut del Sol en LC-41. La latitud del simulador (geocéntrica) se pasa a geodésica para compararla | Δlon −0,006° (V1) y −0,008° (V2); Δlat +0,002° y +0,003°. Coincide dentro de la precisión declarada (≈ 0,01°). Primero se probó con el observador en el Sol (cantidad 14): salía 2,08° más al este, que es justo la rotación terrestre durante los 499 s de luz; no es un error. [Datos](../evidence/stage25/auditoria/horizons-punto-subsolar.json) |
| 2 | SHA-256 de las cinco imágenes de `public/launch/` frente a su README | Las cinco coinciden |
| 3 | `Voyager.glb` frente a `HEAD` | Idéntico (SHA-256 `5338241f…aec731`). No hay cambios en `public/data` ni en los kernels |
| 4 | Búsqueda de referencias a los archivos retirados (`LaunchCinematicController`, `LaunchPadLC41`, `TitanCentaurRocket`) en `src/`, `tests/` y `scripts/` | Ninguna |
| 5 | **Revisión adversaria del cierre:** qué libera `destruir()` y qué comparte con la escena principal | **D-2** y **D-3** |
| 6 | **Saltos extremos** en el navegador (`irALanzamiento` con NaN, −1e9, 1e9 e Infinity) | **D-1** con NaN; los demás se acotan a los extremos |
| 7 | **Seis ciclos de abrir y cerrar** alternando misiones, cada uno hasta cargar el modelo de NASA ([guion](../scripts/audit-stage25-cycles.mjs), [registro](../evidence/stage25/auditoria/ciclos-y-saltos.json)) | Tras las correcciones: un solo lienzo (el de la escena principal), memoria JS estable entre 60 y 88 MB sin tendencia, modelo cargado en los seis, sin avisos ni errores |
| 8 | **Barrido de altitudes** de la Voyager 1 (36, 51, 76, 103 y 141 km), con capturas en la GPU | Antes del ajuste, a 51 km la Tierra se veía casi negra y a 76–103 km quedaba como un azul claro uniforme. Se ajustaron la perspectiva aérea según la columna de aire y la escala del velo exterior: ahora la Tierra aparece con un velo azul que crece hacia el horizonte, y las nubes y el océano se distinguen desde 140 km |
| 9 | Revisión de 25 capturas finales en tres pantallas (1600 × 900 de ambas misiones y 390 × 844) y del final natural y la vuelta | Correctas. En vertical se corrigió el encuadre y se hizo opaco el fondo de «Volver», que no se leía sobre el cielo claro |
| 10 | Suite completa, compilación normal y para GitHub Pages, y `git diff --check` | 344/344; ambas compilaciones correctas con `BASE_URL` en las rutas del lanzamiento; sin errores de espacios |

## Defectos (corregidos)

- **D-1 · Salto a un instante no numérico.** `irAMision(NaN)` dejaba la presentación en NaN: el reloj mostraba «T + NaN:NaN» y el panel lanzaba dos `RangeError: Invalid time value`. Solo era alcanzable desde la API de diagnóstico.
  - Corrección: `irAPresentacion` ignora NaN (±∞ se acotan).
  - Verificado con la prueba de ciclos: el estado sigue válido y no hay errores.
- **D-2 · Geometrías compartidas desechadas al cerrar.** El modelo de NASA se clona con `clone(true)`, que comparte geometrías y texturas con la plantilla de la escena principal. El cierre las desechaba al recorrer el vehículo y la escena, y el renderizador principal tenía que volver a subirlas.
  - Corrección: antes de desechar, se separa el modelo y solo se liberan sus materiales clonados.
- **D-3 · Contexto WebGL retenido.** `renderer.dispose()` no libera el contexto hasta que actúa el recolector, y Chrome limita los contextos activos.
  - Corrección: se añade `forceContextLoss()`.

Durante la auditoría se corrigió también el guion de verificación, no el producto. En pantallas estrechas, el selector de misión está dentro del panel contextual, y `checkVisibility()` sin opciones no detecta `visibility:hidden`.

## Observaciones

- **O-1 · Revisión científica independiente pendiente** del perfil de lanzamiento (fuentes, calibración y validación con el TC-6). El modelo se aparta del TC-6 en +3 % de C3 tras el Centaur, +1,4 % tras el módulo de propulsión y +0,16° de inclinación. Es coherente con un modelo sin atmósfera y con guiado simplificado, y se declara ilustrativo.
- **O-2 · Voyager 2 parcialmente reconstruida.** No se localizó el informe de vuelo del TC-7; los tramos reconstruidos están marcados en el panel y en el código.
- **O-3 · Comprobaciones tomadas de la implementación.** Las pruebas de validación con el TC-6 y con Horizons (altura y acimut del Sol) las escribió el mismo implementador. Esta auditoría las complementa con el punto subsolar, pero no relee el PDF del TC-6.
- **O-4 · Fotograma de transición.** Si se pulsa «Volver» justo cuando el final natural ya está devolviendo la escena, durante un instante se ven las órbitas de canto antes del encuadre de la Tierra. No se reproduce en los flujos normales (clic a mitad del vuelo o final natural).
- **O-5 · Perfil de calidad «Baja» no ejercitado** en el navegador.
- **O-6 · Sin revisión humana.** Falta la revisión visual por una persona y la prueba con un lector de pantalla real. Los anuncios `aria-live` solo se comprobaron leyendo el DOM.
- **O-7 · Medidas de un solo equipo.** Rendimiento y tiempos medidos con un solo equipo (GPU AMD) y con el servidor de desarrollo.
- **O-8 · Aviso X4122 de ANGLE** (sombreador del cielo de three.js): aparece en la consola con D3D11 y es inocuo.
