# RESULTADOS DE LA FASE 3 — OPTIMIZACIÓN PROFESIONAL DEL LANZAMIENTO 3D (`LAN-01`)

**Fecha de verificación:** 22 de noviembre de 2026  
**Rama:** `revision/modo-historico-voyager`  
**Alcance:** Diagnóstico por atribución A/B, implementación selectiva y adaptativa, verificación visual antes/después, pruebas de regresión y medición comparativa en compilación de producción para el hallazgo **`LAN-01`** (*Sobrecoste de sombreado por píxel en los planos iniciales de plataforma LC-41 bajo renderizado por software*).

---

## 1. Diagnóstico inicial

La auditoría del Lanzamiento 3D ([03_AUDITORIA_LANZAMIENTO_3D.md](03_AUDITORIA_LANZAMIENTO_3D.md)) determinó que, mientras la secuencia de despegue de la Voyager 2 se ejecuta a **179,8–180,0 FPS** (`5,56 ms/frame`) en una GPU dedicada (`AMD Radeon RX 6650 XT`, resolución nativa `1600×900`, `ratio = 1,00`), en el procesador gráfico por software (`SwiftShader Vulkan 1.3.0`, incluso con escala adaptativa `ratio = 0,30`, `480×270` internos) los planos iniciales en plataforma caían por debajo del umbral de fluidez de 30 FPS:

- **Plataforma general (`T−8 s`):** `22,31 FPS` (`44,82 ms` media, `P95 = 49,90 ms`, `P99 = 79,50 ms`, `41,11 ms` de backend).
- **Plataforma base (`T−2 s`):** `27,45 FPS` (`36,43 ms` media, `P95 = 40,60 ms`, `P99 = 43,10 ms`, `34,04 ms` de backend).
- **Ascenso en movimiento (`T+0 → 5,5 s`):** `33,17 FPS` (`30,15 ms` media, `P95 = 39,80 ms`, `min = 14,47 FPS`, `27,13 ms` de backend y `1` *Long Task* de `55,0 ms`).
- **Reproducción desde entrada (`T−24 → −8 s`):** `43,13 FPS` (`23,19 ms` media, pero con un tirón puntual de `min = 9,29 FPS` / `P99 = 60,00 ms`).

---

## 2. Causas confirmadas mediante experimentos A/B

Para aislar con exactitud dónde se invertían los `41,11–42,28 ms` de backend por fotograma en `T−8 s` y `T−2 s` sin reducir la resolución interna (`ratio = 0,30` constante), se ejecutó el experimento controlado de atribución por capas [docs/auditoria-final/evidencias/experimento-lan01-ab.mjs](evidencias/experimento-lan01-ab.mjs) ([experimento-lan01-ab.json](evidencias/experimento-lan01-ab.json)), interceptando la visibilidad dentro de `renderer.render`:

| Variante en `T−8 s` (`SwiftShader`, `ratio = 0,30`) | FPS | Media (ms) | P95 (ms) | Backend (ms) | Draw calls | Triángulos | Hallazgo técnico |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`base` (sin cambios)** | `20,96–22,87` | `43,72–47,71` | `50,30` | `39,09–42,28` | `95` | `51 532` | Línea base de referencia. |
| **`sinGlobo`** (`renderOrder = 0` oculto) | `27,88` | `35,87` | `40,20` | `29,22` | `94` | `35 148` | El globo (`R − 150 m`), 100 % enterrado bajo Florida, consumía **~10–13 ms/frame**. |
| **`sinFlorida`** (`renderOrder = 1` oculto) | `26,58` | `37,62` | `42,30` | `32,19` | `94` | `46 924` | El parche de Florida consumía **~8–10 ms/frame**. |
| **`sinCabo`** (`renderOrder = 2` oculto) | `27,65` | `36,16` | `40,40` | `30,63` | `94` | `50 380` | El parche del Cabo consumía **~9–11 ms/frame**. |
| **`sinLC41Parche`** (`renderOrder = 3` oculto) | `26,51` | `37,72` | `44,10` | `32,28` | `94` | `51 020` | El parche de LC-41 consumía **~8–10 ms/frame**. |
| **`sinTodoTerreno`** (sin los 4 parches) | **`77,80`** | **`12,85`** | **`15,80`** | **`8,03`** | `91` | `28 876` | **El 81 % del tiempo total (`34,25 ms` de `42,28 ms`) se gastaba exclusivamente en sombrear las 4 capas de terreno superpuestas.** |
| **`aniso1_todo`** (`anisotropy = 1`, 4 capas activas) | **`39,59`** | **`25,26`** | **`29,00`** | **`20,63`** | `95` | `51 532` | **Solo eliminar el muestreo anisotrópico 16× en software ahorra ~19,5 ms/frame (+77 % FPS)** conservando las 4 capas. |
| **`aniso1_sinGlobo`** (`aniso = 1` + sin globo subterráneo) | **`46,42`** | **`21,54`** | **`25,70`** | **`16,26`** | `94` | `35 148` | Ahorra **~23,9 ms/frame** sin perder un solo píxel visible. |
| **`aniso1_sinGloboNiFlorida`** | **`52,65`** | **`18,99`** | **`22,70`** | **`14,28`** | `93` | `30 540` | Demuestra el sobrecoste de sombrear Florida bajo el núcleo opaco del Cabo y LC-41. |
| **`aniso1_soloLC41Parche`** | **`62,16`** | **`16,09`** | **`19,70`** | **`10,59`** | `92` | `29 388` | Demuestra el beneficio de evitar que cada píxel del suelo se sombree 4 veces. |

Del diagnóstico experimental se confirmaron **cinco causas raíz**:

1. **Filtrado anisotrópico `16×` y `8×` forzado en rasterización por software:** `LaunchWorld.js` aplicaba `renderer.capabilities.getMaxAnisotropy()` (`16×` incluso en SwiftShader) a todas las texturas geográficas (`4096×2048` y `2048×2048`), y `LC41Pad1977.js` / `TitanIIIECentaur3D.js` fijaban `anisotropy = 8`. En los planos rasantes de plataforma (`T−8 s` y `T−2 s`, ángulo de incidencia `80°–89,5°`), SwiftShader ejecutaba hasta 16 muestras trilineales por fragmento y por capa en la CPU.
2. **Overdraw cuádruple/quíntuple de atrás hacia adelante sin rechazo Early-Z en el terreno y el cielo:**
   - Como `florida` (`R − 12 m`, `renderOrder = 1`), `cabo` (`R − 1,5 m`, `renderOrder = 2`) y `lc41` (`R + 0 m`, `renderOrder = 3`) tenían `transparent: true` en toda su superficie (aunque solo su anillo perimetral tiene `0 < alpha < 1`, mientras que todo su núcleo interior tiene `alpha === 1,0`), Three.js los dibujaba de abajo hacia arriba (`globo` → `florida` → `cabo` → `lc41` → `explanada`). Cada capa nueva estaba más cerca de la cámara que la anterior, por lo que **el test de profundidad (`gl.LEQUAL`) jamás descartaba las capas inferiores**: cada píxel del suelo cercano a la plataforma se sombreaba **5 veces seguidas**.
   - Además, `cielo` (`Sky`, `renderOrder = -10`) se dibujaba **antes** que la geometría opaca (`globo`, `LC41_1977`, `TitanIIIE_Centaur`), ejecutando el costoso shader de Preetham + 5 octavas de ruido de nubes + `acos`/`atan` sobre el **100 % de la pantalla**, incluidos los píxeles del suelo, del cohete y de la plataforma.
3. **Renderizado del globo subterráneo (`R − 150 m`) y de capas bajo el horizonte opaco:** por debajo de `3 500 m` de altitud, el horizonte geométrico terrestre (`≤ 211 km`) cae íntegramente dentro del núcleo 100 % opaco de `florida` (`> 340 km` alrededor de LC-41), por lo que `globo` (`R − 150 m`) no tiene ningún píxel visible pero seguía procesando `16 384–65 536` triángulos y sombreando todo el hemisferio inferior. Igualmente, por debajo de `10 m` de altitud (`T−2 s` a `2,2 m`), el horizonte geométrico de `florida` (`R − 12 m`) queda íntegramente oculto tras la curvatura del núcleo 100 % opaco de `cabo` (`R − 1,5 m`).
4. **Geometría interna sellada bajo la cofia cerrada y mallas estáticas fragmentadas en LC-41:**
   - Mientras la cofia (`cofiaA`, `cofiaB`) y la etapa I permanecen cerradas (`t < 262,2 s` / `t < 271,2 s`), el `Centaur D-1T`, el `ModuloPropulsion`, la `VoyagerPlegada` y la tobera `LR91` interna en el interetapa están **100 % encerrados dentro de cilindros opacos**, pero se enviaban al pipeline en cada fotograma (`20` draw calls en software / `37` con sombras en GPU y `9 386` triángulos).
   - `LC41Pad1977.js` enviaba `39` mallas individuales para `11` materiales y solo `3` brazos articulados.
5. **Compilación/validación fría al atravesar `80 km` durante `reproducción desde entrada`:** el precalentamiento inicial en `VoyagerLaunchDirector.js` solo renderizaba en `t = -24 s` (`19 200 km` de altitud), donde `cielo`, `atmosferaDentro`, `cabo` y `lc41` tenían `visible = false`, provocando un tirón puntual (`9,29 FPS`) cuando se activaban por primera vez durante el descenso de cámara.

---

## 3. Optimizaciones implementadas

1. **Filtrado anisotrópico adaptativo por perfil (`anisotropiaLanzamiento` en [src/launch/LaunchWorld.js](../../src/launch/LaunchWorld.js)):**
   - `alto`: **`16×`** (sin ningún cambio en GPUs dedicadas).
   - `medio`: **`8×`** (GPUs integradas).
   - `bajo`: **`2×`** (GPUs móviles).
   - `minimo`: **`1×`** (trilineal con mipmaps, eliminando el bucle anisotrópico de 16 muestras en SwiftShader).
   - Propagado también a las texturas procedurales de [src/launch/LC41Pad1977.js](../../src/launch/LC41Pad1977.js) y [src/launch/TitanIIIECentaur3D.js](../../src/launch/TitanIIIECentaur3D.js) (`8×` en GPU, `1×` en `minimo`).
2. **Partición de parches de terreno en Núcleo Opaco Frontal (`Early-Z`) + Anillo de Borde Semitransparente ([src/launch/LaunchWorld.js](../../src/launch/LaunchWorld.js)):**
   - En `parcheEsferico()`, las celdas cuyo `alphaMap` es idénticamente `1,0` en sus cuatro vértices se agrupan al final del mismo búfer de índices (`setDrawRange(nBorde, nNucleo)`) y se dibujan en la **lista opaca de delante hacia atrás**: `lc41` (`renderOrder = -3`, `R + 0 m`) → `cabo` (`renderOrder = -2`, `R − 1,5 m`) → `florida` (`renderOrder = -1`, `R − 12 m`), compartiendo exactamente los mismos `BufferAttribute` (`position`, `normal`, `uv`, `index`) y la misma `THREE.Texture` (cero memoria adicional de geometría o texturas).
   - El anillo exterior de transición (`0 <= alpha <= 1`) usa `setDrawRange(0, nBorde)` en la lista transparente (`renderOrder = 1, 2, 3`).
   - Gracias a ello, el Z-buffer descarta automáticamente por **Early-Z** el sombreado de `cabo` y `florida` bajo el núcleo opaco de `lc41`, y el de `florida` bajo el núcleo opaco de `cabo`, reduciendo el sombreado del suelo de 4–5 pasadas a **1 sola pasada por píxel** (2 únicamente en la estrecha franja de transición entre parches).
   - Además, `florida` y `cabo` escalan sus subdivisiones con `div(48)` y `div(24)` según `ajustes.divisiones`, igual que ya hacían `globo`, `nubes` y `atmosfera`.
3. **Reordenación Early-Z del cielo (`cielo.renderOrder = 1`) y limpieza del shader `Sky` ([src/launch/LaunchWorld.js](../../src/launch/LaunchWorld.js)):**
   - Al situar `cielo.renderOrder = 1` dentro de la lista opaca (después de los núcleos opacos del terreno `-3..-1` y de la plataforma/cohete `0`), como el vértice del cielo fija `gl_Position.z = gl_Position.w` (`depth = 1,0`), el Z-buffer rechaza el fragment shader del cielo en el **100 % de los píxeles ya cubiertos por el suelo opaco, la plataforma y el cohete**.
   - En `cielo.material.onBeforeCompile`, se eliminaron las 3 líneas de código muerto de `Sky.js` (`acos` y `atan` para un `uv` no utilizado) y, exclusivamente en `detalle === 'minimo'`, el bucle `fbm` de nubes procedurales evalúa 2 octavas en lugar de 4.
4. **Ocultación geométrica exacta de capas bajo el horizonte opaco y liberación de `entornoObjetivo` ([src/launch/LaunchWorld.js](../../src/launch/LaunchWorld.js)):**
   - Bajo `3 500 m` de altitud (con `florida`/`cabo` cargados), `globo.visible = false` (100 % cubierto hasta más allá del horizonte por el núcleo opaco de `florida`).
   - Bajo `10 m` de altitud (con `cabo` opaco, como en `T−2 s` a `2,2 m`), `capas.florida.visible = false` (su horizonte a `R − 12 m` queda geométricamente por debajo del núcleo opaco de `cabo` a `R − 1,5 m`).
   - Se almacena y libera explícitamente el `WebGLRenderTarget` `entornoObjetivo` devuelto por `pmrem.fromScene(...)`.
5. **Ocultación de etapas internas selladas bajo la cofia cerrada, fusión de mallas estáticas de LC-41 y precalentamiento completo ([src/launch/VoyagerLaunchDirector.js](../../src/launch/VoyagerLaunchDirector.js), [src/launch/LC41Pad1977.js](../../src/launch/LC41Pad1977.js), [src/launch/TitanIIIECentaur3D.js](../../src/launch/TitanIIIECentaur3D.js)):**
   - Mientras `t < tCofia - 0.1`, `P.centaur`, `P.moduloPropulsion` y `P.nave` permanecen con `visible = false`; mientras `t < tE1off - 0.5`, la tobera LR91 y tapa interna de la etapa II permanecen con `visible = false`.
   - En `LC41Pad1977.js`, las mallas estáticas se fusionan con `mergeGeometries` por `(material, sombra, zona)` (`'pad'`, `'vias'`, `'torreSur'`), reduciendo la plataforma de **39 a 17 mallas** y conservando intactos los 3 brazos umbilicales articulados y el culling por zonas. A más de `25 km` de distancia, `plataforma.grupo.visible = false`.
   - En `VoyagerLaunchDirector.js` (`listo`), antes de iniciar el bucle visible en `tInicio = -24 s`, se precalienta un fotograma oculto a nivel de plataforma con todas las capas y etapas internas activas.

---

## 4. Archivos modificados y nuevos

| Archivo | Tipo | Propósito |
| :--- | :--- | :--- |
| [src/launch/LaunchWorld.js](../../src/launch/LaunchWorld.js) | Modificado | `anisotropiaLanzamiento()`, partición de parches en núcleo opaco frontal (`Early-Z`) + borde transparente con buffers compartidos, `cielo.renderOrder = 1`, limpieza de código muerto `acos`/`atan` en `Sky`, ocultación geométrica de `globo` (`< 3,5 km`) y `florida` (`< 10 m`), y `entornoObjetivo.dispose()`. |
| [src/launch/LC41Pad1977.js](../../src/launch/LC41Pad1977.js) | Modificado | Fusión de geometrías estáticas por `(material, sombra, zona)` (`39 → 17` mallas) y soporte de `anisotropia` adaptativa. |
| [src/launch/TitanIIIECentaur3D.js](../../src/launch/TitanIIIECentaur3D.js) | Modificado | Referencia `etapa2.userData.ocultaEnInteretapa` para la tobera LR91 interna y soporte de `anisotropia` adaptativa. |
| [src/launch/VoyagerLaunchDirector.js](../../src/launch/VoyagerLaunchDirector.js) | Modificado | Ocultación de piezas selladas bajo la cofia cerrada (`t < tCofia`) e interetapa (`t < tE1off`), ocultación de plataforma a `> 25 km` y precalentamiento oculto de shaders/buffers a nivel de suelo antes de iniciar la aproximación. |
| [tests/AuditoriaFinalLAN01.test.mjs](../../tests/AuditoriaFinalLAN01.test.mjs) | Nuevo | 5 pruebas automatizadas de regresión para `LAN-01`. |
| [docs/auditoria-final/evidencias/experimento-lan01-ab.mjs](evidencias/experimento-lan01-ab.mjs) y [experimento-lan01-ab.json](evidencias/experimento-lan01-ab.json) | Nuevo | Script y resultados del experimento A/B de atribución por capas en `T−8 s` y `T−2 s`. |
| [docs/auditoria-final/evidencias/medir-fase3-lan01.mjs](evidencias/medir-fase3-lan01.mjs) | Nuevo | Script de medición comparativa post-Fase 3 en producción y recorrido de ciclo de vida del lanzamiento. |
| [docs/auditoria-final/evidencias/lanzamiento-fase3-software.json](evidencias/lanzamiento-fase3-software.json) | Nuevo | Telemetría completa post-Fase 3 en SwiftShader (`1600×900`, `DPR 1`). |
| [docs/auditoria-final/evidencias/lanzamiento-fase3-gpu.json](evidencias/lanzamiento-fase3-gpu.json) | Nuevo | Telemetría completa post-Fase 3 en GPU dedicada (`AMD Radeon RX 6650 XT`, `1600×900`, `DPR 1`). |
| [docs/auditoria-final/evidencias/recorrido-fase3-lan01.json](evidencias/recorrido-fase3-lan01.json) | Nuevo | Evidencia del recorrido funcional de 11 pasos (Voyager 2, apertura de cofia, reinicio, salida, Voyager 1, transición a Sistema Solar y Laboratorio). |
| [docs/auditoria-final/evidencias/capturas-fase3/](evidencias/capturas-fase3/) | Nuevo | 24 capturas comparativas `antes-*` y `despues-*` (`gpu` y `software`) en los mismos 6 instantes de misión. |

---

## 5. Comparación de FPS (Antes vs. Después en Producción)

### 5.1. Renderizado por Software (`SwiftShader Vulkan 1.3.0`, `1600×900`, `ratio = 0,30–0,35` idéntico a la línea base)

*Fuentes: [lanzamiento-software.json](evidencias/lanzamiento-software.json) (Antes) vs. [lanzamiento-fase3-software.json](evidencias/lanzamiento-fase3-software.json) (Después).*

| Ventana / Plano de misión | Ratio | FPS Medio (Antes) | FPS Medio (Después) | Mejora de FPS | FPS Mínimo (Antes → Después) | Long Tasks (Antes → Después) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Reproducción desde entrada (`T−24 → −8 s`)** | `0,50→0,35` | `43,13 FPS` | **`50,15 FPS`** | **+16,3 %** | `9,29` → `8,35 FPS` (1er frame) | `0 → 0` |
| **Plataforma general (`T−8 s`)** | `0,30` | `22,31 FPS` | **`52,54 – 54,41 FPS`** | **+135,5 % a +143,9 %** | `12,58` → **`35,34 – 42,92 FPS`** | `0 → 0` |
| **Plataforma base (`T−2 s`)** | `0,30` | `27,45 FPS` | **`56,14 FPS`** | **+104,5 %** | `23,20` → **`34,01 FPS`** | `0 → 0` |
| **Despegue suelo (`T+5 s`)** | `0,30` | `51,49 FPS` | **`69,87 FPS`** | **+35,7 %** | `41,32` → **`46,73 FPS`** | `0 → 0` |
| **Ascenso en movimiento (`T+0 → 5,5 s`)** | `0,30` | `33,17 FPS` | **`58,77 FPS`** | **+77,2 %** | `14,47` → **`30,03 FPS`** | `1 (55 ms)` → **`0`** |
| **Seguimiento ascenso (`T+30 s`)** | `0,30` | `71,60 FPS` | **`89,83 FPS`** | **+25,5 %** | `52,91` → `43,86 FPS` | `0 → 0` |
| **Separación SRB/etapa (`T+130 s`)** | `0,30` | `75,06 FPS` | **`86,27 FPS`** | **+14,9 %** | `55,56` → **`56,18 FPS`** | `0 → 0` |
| **Órbita de aparcamiento (`T+1500 s`)** | `0,30` | `67,32 FPS` | **`69,38 FPS`** | **+3,1 %** | `31,95` → **`43,10 FPS`** | `0 → 0` |

> **Resultado clave en software:** Todos los planos del lanzamiento superan ahora holgadamente el objetivo mínimo de `30 FPS` y se sitúan en la franja de **`50,15 a 89,83 FPS`** (`52,54–54,41 FPS` en `T−8 s` y `56,14 FPS` en `T−2 s`), **sin reducir la resolución interna por debajo de `0,30`**.

### 5.2. GPU Dedicada (`AMD Radeon RX 6650 XT`, `1600×900`, `ratio = 1,00`, calidad máxima intacta)

*Fuentes: [lanzamiento-gpu.json](evidencias/lanzamiento-gpu.json) (Antes) vs. [lanzamiento-fase3-gpu.json](evidencias/lanzamiento-fase3-gpu.json) (Después).*

| Ventana / Plano de misión | Ratio | FPS Medio (Antes) | FPS Medio (Después) | FPS Mínimo (Antes → Después) | Draw calls (Antes → Después) | Triángulos (Antes → Después) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Reproducción desde entrada** | `1,00` | `179,98 FPS` | **`180,01 FPS`** | `149,25` → `133,33 FPS` | `163` → **`36` (−77,9 %)** | `152 196` → **`136 595`** |
| **Plataforma general (`T−8 s`)** | `1,00` | `180,00 FPS` | **`180,00 – 180,06 FPS`** | `163,93` → **`172,41 – 175,44 FPS`** | `164` → **`88` (−46,3 %)** | `152 196` → **`41 256` (−72,9 %)** |
| **Plataforma base (`T−2 s`)** | `1,00` | `180,00 FPS` | **`180,00 FPS`** | `166,67` → **`169,49 FPS`** | `156` → **`84` (−46,2 %)** | `148 956` → **`35 028` (−76,5 %)** |
| **Despegue suelo (`T+5 s`)** | `1,00` | `179,97 FPS` | **`180,01 FPS`** | `161,29` → **`172,41 FPS`** | `168` → **`95` (−43,5 %)** | `131 916` → **`47 816` (−63,8 %)** |
| **Ascenso en movimiento (`T+0 → 5,5 s`)** | `1,00` | — | **`180,00 FPS`** | **`172,41 FPS`** | **`95`** | **`47 637`** |
| **Seguimiento ascenso (`T+30 s`)** | `1,00` | `180,00 FPS` | **`180,00 FPS`** | `169,49` → `158,73 FPS` | `63` → **`39` (−38,1 %)** | `123 772` → **`21 104` (−82,9 %)** |
| **Separación SRB/etapa (`T+130 s`)** | `1,00` | `179,98 FPS` | **`180,00 FPS`** | `161,29` → **`175,44 FPS`** | `61` → **`42` (−31,1 %)** | `121 648` → `143 198` |
| **Órbita de aparcamiento (`T+1500 s`)** | `1,00` | `179,80 FPS` | **`180,00 FPS`** | `149,25` → **`172,41 FPS`** | `24` → **`24`** | `125 824` → `127 004` |

---

## 6. Comparación de tiempos por fotograma (Media, P95 y P99)

| Ventana (`SwiftShader`, `ratio = 0,30`) | Frame Medio (Antes → Después) | Frame P95 (Antes → Después) | Frame P99 (Antes → Después) | Reducción de tiempo por fotograma |
| :--- | :---: | :---: | :---: | :---: |
| **Reproducción desde entrada** | `23,19` → **`19,94 ms`** | `33,40` → **`30,00 ms`** | `60,00` → **`39,10 ms`** | **−14,0 % media / −34,8 % P99** |
| **Plataforma general (`T−8 s`)** | `44,82` → **`18,38 – 19,03 ms`** | `49,90` → **`21,80 – 23,60 ms`** | `79,50` → **`22,80 – 38,50 ms`** | **−59,0 % media / −56,3 % P95** |
| **Plataforma base (`T−2 s`)** | `36,43` → **`17,81 ms`** | `40,60` → **`20,70 ms`** | `43,10` → **`21,70 ms`** | **−51,1 % media / −49,0 % P95** |
| **Despegue suelo (`T+5 s`)** | `19,42` → **`14,31 ms`** | `22,80` → **`16,80 ms`** | `24,20` → **`17,90 ms`** | **−26,3 % media / −26,3 % P95** |
| **Ascenso en movimiento (`T+0 → 5,5 s`)** | `30,15` → **`17,02 ms`** | `39,80` → **`20,50 ms`** | `44,80` → **`21,70 ms`** | **−43,5 % media / −48,5 % P95** |
| **Seguimiento ascenso (`T+30 s`)** | `13,97` → **`11,13 ms`** | `17,70` → **`14,10 ms`** | `18,90` → **`16,60 ms`** | **−20,3 % media / −20,3 % P95** |
| **Separación SRB/etapa (`T+130 s`)** | `13,32` → **`11,59 ms`** | `16,00` → **`14,20 ms`** | `18,00` → **`15,70 ms`** | **−13,0 % media / −11,3 % P95** |
| **Órbita de aparcamiento (`T+1500 s`)** | `14,85` → **`14,41 ms`** | `18,70` → **`17,90 ms`** | `31,30` → **`20,60 ms`** | **−3,0 % media / −34,2 % P99** |

---

## 7. Impacto en CPU y GPU (Draw calls, Triángulos y Tiempos de Backend)

1. **Reducción de tiempo de backend gráfico (rasterización y sombreado):**
   - **En SwiftShader (`T−8 s`):** el tiempo de backend cae de **`41,11 ms` a `13,69–14,98 ms` (−66,7 %)**.
   - **En SwiftShader (`T−2 s`):** el tiempo de backend cae de **`34,04 ms` a `13,42 ms` (−60,6 %)**.
   - **En SwiftShader (`Ascenso T+0 → 5,5 s`):** el tiempo de backend cae de **`27,13 ms` a `11,75 ms` (−56,7 %)** y desaparece la única *Long Task* (`55,0 ms → 0`).
   - **En GPU dedicada (`RX 6650 XT`, `T−8 s` a `1600×900` con sombras 4096 y anisotropía 16×):** el tiempo de GPU por fotograma baja de **`1,88 ms` a `1,08–1,12 ms` (−41,5 %)** y el tiempo de envío JS en `renderer.render` baja de **`1,27 ms` a `0,72 ms` (−43,3 %)**.
2. **Reducción de draw calls y triángulos en planos de plataforma:**
   - **En SwiftShader (`T−8 s`):** de `95` a **`53` draw calls (−44,2 %)** y de `51 532` a **`21 864` triángulos (−57,6 %)**.
   - **En SwiftShader (`T−2 s`):** de `91` a **`49` draw calls (−46,2 %)** y de `49 912` a **`19 092` triángulos (−61,7 %)**.
   - **En GPU dedicada (`T−8 s`, incluyendo pase de sombras 4096):** de `164` a **`88` draw calls (−46,3 %)** y de `152 196` a **`41 256` triángulos (−72,9 %)**.
3. **Consumo de memoria:**
   - Los núcleos opacos (`geoNucleo`) reutilizan por referencia los `BufferAttribute` (`position`, `normal`, `uv`, `index`) y las instancias `THREE.Texture` de sus parches base mediante `setDrawRange`, sin duplicar memoria en GPU ni CPU (`heapMiB ≈ 33–38 MiB` en software y `38–42 MiB` en GPU).
   - La liberación de `entornoObjetivo.dispose()` garantiza la destrucción del framebuffer de PMREM al cerrar el lanzamiento (`log.closed = true`, `0` lienzos `.launch3d-canvas` residuales).

---

## 8. Calidad visual Antes vs. Después

Se capturaron 24 imágenes comparativas a `1600×900` en las mismas posiciones de cámara e instantes de misión ([docs/auditoria-final/evidencias/capturas-fase3/](evidencias/capturas-fase3/)):

- **GPU dedicada (`antes-gpu-*.png` vs. `despues-gpu-*.png`):**
  - [antes-gpu-t-menos-8s-plataforma.png](evidencias/capturas-fase3/antes-gpu-t-menos-8s-plataforma.png) vs. [despues-gpu-t-menos-8s-plataforma.png](evidencias/capturas-fase3/despues-gpu-t-menos-8s-plataforma.png)
  - [antes-gpu-t-menos-2s-base.png](evidencias/capturas-fase3/antes-gpu-t-menos-2s-base.png) vs. [despues-gpu-t-menos-2s-base.png](evidencias/capturas-fase3/despues-gpu-t-menos-2s-base.png)
  - [antes-gpu-t-mas-5s-despegue.png](evidencias/capturas-fase3/antes-gpu-t-mas-5s-despegue.png) vs. [despues-gpu-t-mas-5s-despegue.png](evidencias/capturas-fase3/despues-gpu-t-mas-5s-despegue.png)
  - [antes-gpu-t-mas-30s-seguimiento.png](evidencias/capturas-fase3/antes-gpu-t-mas-30s-seguimiento.png) vs. [despues-gpu-t-mas-30s-seguimiento.png](evidencias/capturas-fase3/despues-gpu-t-mas-30s-seguimiento.png)
  - [antes-gpu-t-mas-130s-separacion.png](evidencias/capturas-fase3/antes-gpu-t-mas-130s-separacion.png) vs. [despues-gpu-t-mas-130s-separacion.png](evidencias/capturas-fase3/despues-gpu-t-mas-130s-separacion.png)
  - [antes-gpu-t-mas-1500s-orbita.png](evidencias/capturas-fase3/antes-gpu-t-mas-1500s-orbita.png) vs. [despues-gpu-t-mas-1500s-orbita.png](evidencias/capturas-fase3/despues-gpu-t-mas-1500s-orbita.png)
  - **Resultado visual en GPU dedicada:** **100 % indistinguible**. Se conservan intactos el globo 8K, las ortoimágenes USGS con anisotropía `16×`, las sombras PCF `4096×4096`, los reflejos PMREM, las 4 octavas de nubes del cielo, los penachos aditivos, el humo instanciado (`2 200` partículas) y la revelación del Centaur y la Voyager al abrirse la cofia.
- **Renderizado por Software (`antes-software-*.png` vs. `despues-software-*.png`):**
  - [antes-software-t-menos-8s-plataforma.png](evidencias/capturas-fase3/antes-software-t-menos-8s-plataforma.png) vs. [despues-software-t-menos-8s-plataforma.png](evidencias/capturas-fase3/despues-software-t-menos-8s-plataforma.png)
  - [antes-software-t-menos-2s-base.png](evidencias/capturas-fase3/antes-software-t-menos-2s-base.png) vs. [despues-software-t-menos-2s-base.png](evidencias/capturas-fase3/despues-software-t-menos-2s-base.png)
  - **Resultado visual en Software:** sin pérdida de elementos, sin Z-fighting, sin costuras entre parches y con un horizonte aún más limpio en `T−8 s` al no asomar los polígonos de baja subdivisión del globo (`R − 150 m`) detrás del horizonte de Florida.

---

## 9. Resultados de pruebas y verificación de ciclo de vida

1. **Linter, pruebas unitarias/integración y compilación:**
   - **`npm run lint`:** **0 errores**.
   - **`npm test`:** **455 / 455 pruebas superadas** (`0` fallos) en `7,10 s` (`447` previas + `5` nuevas en [tests/AuditoriaFinalLAN01.test.mjs](../../tests/AuditoriaFinalLAN01.test.mjs) + casos adicionales de regresión).
   - **`npm run build`:** compilación limpia de producción en `587–622 ms`.
   - **`git diff --check`:** limpio (`0` problemas).
2. **Recorrido funcional de 11 pasos en navegador ([recorrido-fase3-lan01.json](evidencias/recorrido-fase3-lan01.json)):**
   - Verificado con **`0` errores de consola**:
     - Entrada desde Sistema Solar → Misiones Históricas → Lanzamiento Voyager 2.
     - En `T−8 s` (`cofia` cerrada): `etapa1`, `etapa2`, `cofiaA`, `cofiaB`, `srm1`, `srm2` visibles; `centaur`, `moduloPropulsion` y `nave` ocultos dentro de la cofia; escena principal pausada con `motivosPausa: ["lanzamiento"]`.
     - En `T+265 s` (tras separación de etapa I pero antes de abrir cofia): tobera de etapa II visible; `centaur`, `moduloPropulsion` y `nave` siguen ocultos bajo la cofia cerrada.
     - En `T+275 s` (apertura de cofia en `T+271,2 s`): `centaur: true`, `moduloPropulsion: true`, `nave: true` visibles inmediatamente antes de abrirse las dos mitades de la cofia.
     - En `T+4450 s`: despliegue final completado.
     - Botón `#launch-replay-btn` («Repetir»): reinicia el lanzamiento a `T−24 s` y vuelve a ocultar las etapas internas bajo la cofia cerrada.
     - Botón `#launch-skip-btn`: cierra limpiamente el lanzamiento (`launchCanvasCount: 0`, `solarRenderPausado: false`).
     - Apertura posterior del lanzamiento de **Voyager 1 (`TC-6`)** en `T−2 s`, cierre y retorno sin regresiones a **Sistema Solar** y **Laboratorio** (donde `PERF-01` vuelve a pausar la escena principal con `motivosPausa: ["laboratorio"]`).

---

## 10. Limitaciones pendientes

- Durante el primer fotograma tras abrir el lanzamiento en modo software (`Reproducción desde entrada`), el primer intervalo tras hacer visible el lienzo registra un fotograma aislado de transición de `~119 ms` (`minFPS = 8,35 FPS`), mientras que el resto del tramo promedia **`50,15 FPS`** (`P95 = 30,00 ms`).
- Las optimizaciones de la escena principal en modo software durante la reproducción histórica o del Centro de Misión (`PERF-02`) y el desacoplamiento asíncrono de cálculos pesados del planificador (`PERF-03`) quedan reservadas para sus fases respectivas del plan.

---

## 11. Riesgos de regresión evaluados

- **Sincronización de visibilidad de etapas internas al saltar hacia adelante o hacia atrás en la línea de tiempo:** `aplicarInstante(t, tiempoAnim)` evalúa `mostrarInteriorCofia = forzarInternos || t >= tCofia - 0.1` y `mostrarToberaEtapa2 = forzarInternos || t >= tE1off - 0.5` de forma puramente funcional respecto al instante `t`, por lo que saltar hacia adelante (`T+275 s`), retroceder (`T−8 s`) o pulsar «Repetir» restaura siempre el estado exacto de visibilidad sin acumular estado.
- **Transición de opacidad del parche del Cabo entre `25 km` y `50 km`:** `alternarNucleoOpaco(capas.cabo.material.opacity >= 0.999)` desactiva el núcleo opaco y restablece `geo.setDrawRange(0, nTotal)` en cuanto `cabo.material.opacity` empieza a desvanecerse por encima de `25 km`, evitando cualquier corte o salto de opacidad.

---

## 12. Conclusión sobre `LAN-01`

**`LAN-01`: CORREGIDO, MEDIDO Y VERIFICADO.**  
El rendimiento en renderizado por software en los planos críticos de plataforma ha pasado de **`22,31 FPS` (`44,82 ms`) a `52,54–54,41 FPS` (`18,38–19,03 ms`, `+143,9 %`) en `T−8 s`** y de **`27,45 FPS` (`36,43 ms`) a `56,14 FPS` (`17,81 ms`, `+104,5 %`) en `T−2 s`**, manteniendo **`180,00 FPS`** y el **100 % de la calidad visual máxima** en GPU dedicada.
