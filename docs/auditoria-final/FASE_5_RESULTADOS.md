# Fase 5 — Resultados y Validación Final (`UX-01`, `UX-02`, `LAN-02`, `GEN-01`)

- **Rama:** `revision/modo-historico-voyager`
- **Fecha de cierre:** 22-11-2026
- **Contexto:** Continuación y cierre del trabajo iniciado por Claude Code para la Fase 5 de la auditoría final integral, preservando íntegramente las Fases 1–4 y todos los avances heredados de la Fase 5 sin modificaciones científicas ni regresiones visuales o de rendimiento.

---

## 1. Resumen ejecutivo

La **Fase 5** queda **completada y verificada** sobre sus cuatro hallazgos:

| Hallazgo | Área | Estado final | Verificación principal |
| --- | --- | --- | --- |
| **`UX-01`** | Paleta de búsqueda (`Buscar`) | **Resuelto y verificado** | 8 pruebas unitarias (`AuditoriaFinalUX01.test.mjs`) + recorrido completo en Chrome 157 (escritorio 1366×800 y móvil 390×844), teclado (`Ctrl+K`, `/`, `Tab`/`Shift+Tab`, flechas, `Enter`, `Escape`) y ratón; 0 fallos. |
| **`UX-02`** | Modal de bienvenida histórica | **Resuelto y verificado** | 5 pruebas unitarias (`AuditoriaFinalUX02.test.mjs`) + diagnóstico de causa raíz del fallo previo en `#hist-welcome-open-btn` (defecto de espera de transición CSS en el script, no en la app) + recorrido completo en Chrome (escritorio y móvil 390×844); 0 fallos. |
| **`LAN-02`** | Memoria y recursos compartidos del Lanzamiento 3D | **Resuelto y verificado** | 6 pruebas unitarias (`AuditoriaFinalLAN02.test.mjs`) + endurecimiento de cierre temprano en `LaunchWorld.js` + prueba de resistencia reproducible de **10 ciclos completos** + cierre temprano + coexistencia con Hangar 3D (`0/11` renderizadores retenidos, `0` errores WebGL, `178,8–181,4 FPS`). |
| **`GEN-01`** | Exactitud documental en `README.md` | **Resuelto y verificado** | 4 pruebas unitarias (`AuditoriaFinalGEN01.test.mjs`) + revisión línea por línea contra el código y el catálogo de efemérides (`2026-11-18 → 2046-01-01`); sin afirmaciones prematuras de validación operativa. |

- **Batería automatizada:** `npm run lint` sin errores, **`485 / 485`** pruebas superadas (`23 / 23` en las pruebas específicas de Fase 5), `npm run build` correcto en `930 ms` y `git diff --check` limpio.
- **Pruebas en navegador real (Chrome `157.0.8103.79` con GPU):** `0` comprobaciones fallidas, `0` errores de página (`pageerror`) y `0` errores de consola en ambos guiones reproducibles (`verificar-fase5.mjs` y `verificar-lan02-ciclos.mjs`).

---

## 2. Estado final de `UX-01` — Accesibilidad y navegación de «Buscar»

**Estado:** **Resuelto y verificado** (ratón, teclado, lector de pantalla y limpieza de listeners).

Comportamiento verificado sobre la versión final de `src/ui/CommandPalette.js`, `src/ui/DialogFocus.js` y `src/ui/WorkspaceLayout.js`:

- **Apertura y cierre:** botón `#header-search`, atajo `Ctrl+K` (alterna abrir/cerrar) y tecla `/` fuera de campos editables; cierre con `Escape` desde cualquier control o incluso con el foco desplazado a `<body>` (fase de captura a nivel de `document`), y cierre por clic en el fondo (`.cp-backdrop`).
- **Trampa y restauración de foco:** `Tab` y `Shift+Tab` permanecen dentro del diálogo mediante `moverFocoConTab()`; si un tercero desplaza el foco fuera mientras está abierto, `focusin` lo devuelve a `#cp-input`; al cerrar, `destinoFocoAlCerrar()` restaura el foco al disparador (o a `#header-search` como respaldo) y, si la herramienta elegida ya movió el foco (p. ej. `#distance-menu`), conserva el foco en la herramienta.
- **Navegación de resultados:** `ArrowDown`/`ArrowUp` actualizan de forma coherente `aria-activedescendant` y `aria-selected`; `Enter` (protegido contra `event.isComposing`) y clic de ratón ejecutan la opción seleccionada y cierran el diálogo.
- **Agrupación sin encabezados vacíos y ARIA:** `groupCommandResults()` nunca emite grupos sin elementos (confirmado con consultas vacías, `distancia` y `zzzz`); `#header-search` declara `aria-controls="command-palette"`, `aria-haspopup="dialog"` y `aria-expanded` sincronizado (sin interferencia de `WorkspaceLayout.js`); `#cp-input` declara `role="combobox"`, `aria-expanded="true"`, `aria-haspopup="listbox"` y `aria-controls="cp-results"`, y `#cp-status` anuncia los resultados con `role="status" aria-live="polite"`.
- **Limpieza de listeners:** `dispose()` retira los 4 oyentes registrados en `document` (`app:open-search`, `keydown` captura, `focusin` y `keydown` burbuja) y elimina el nodo raíz del DOM.
- **Sin conflictos con otros diálogos:** con `#command-palette` abierta encima de `#historical-welcome-modal`, el primer `Escape` cierra únicamente la paleta (`stopPropagation` + `preventDefault`), y el segundo `Escape` cierra la bienvenida.

---

## 3. Estado final de `UX-02` — Modal de bienvenida histórica y diagnóstico de `#hist-welcome-open-btn`

**Estado:** **Resuelto y verificado.**

### Diagnóstico de causa raíz del fallo heredado en `#hist-welcome-open-btn`

Durante la ejecución previa de Claude en `verificar-fase5.mjs`, `pruebaBienvenida` fallaba por timeout al intentar pulsar `#hist-welcome-open-btn` tras volver de `Laboratorio` → `Misiones históricas` → abrir `Menú` (`#app-nav-toggle`) → pulsar `Escape`.

La inspección directa del DOM y de los estilos computados demostró que **no se trataba de un defecto de la aplicación**, sino de un **defecto de detección de visibilidad en el script `verificar-fase5.mjs`** (combinado con una transición CSS en cascada):

1. Al abrir `Menú`, `WorkspaceLayout.js` cierra `#context-inspector` (`data-state="closed"`, `inert = true`, `opacity: 0`, `visibility: hidden`, `pointer-events: none`).
2. Dentro del inspector, `.hist-mission-dock` (`.hud-secondary`, `src/style.css:821`) define `transition: opacity .2s ease, visibility .2s`, y el botón hijo `#hist-welcome-open-btn` (`.hist-quick-btn`) define `transition: 0.15s` (shorthand que transiciona también `visibility`).
3. Al cerrarse `#context-inspector` en `t = 0 ms`, `#hist-mission-dock` mantiene `visibility: visible` hasta `t = 200 ms`, y en `t = 200 ms` su hijo `#hist-welcome-open-btn` inicia su propia transición de `visibility` durante `150 ms` adicionales (`200 ms → 350 ms`), aunque el panel padre ya sea totalmente invisible (`opacity: 0`) e inerte (`inert = true`).
4. En `verificar-fase5.mjs`, tras esperar `300 ms` (justo entre `200 ms` y `350 ms`), `abrirBienvenidaDesdePanel()` evaluaba únicamente `btn.checkVisibility({ visibilityProperty: true })` **sin `opacityProperty: true` ni comprobar `panel.dataset.state !== 'closed'`**. Esa comprobación devolvía `true` de forma errónea, hacía que el bucle omitiera pulsar `#inspector-toggle` y provocaba que Playwright intentara pulsar un botón dentro de un panel cerrado e inerte (`<canvas>` interceptaba el puntero durante los 50 ms restantes y luego el botón pasaba a `visibility: hidden`).

Al corregir `abrirBienvenidaDesdePanel()` en `verificar-fase5.mjs` para exigir `panel.dataset.state !== 'closed' && !panel.inert && btn.checkVisibility({ visibilityProperty: true, opacityProperty: true })`, todos los flujos de `UX-02` pasan sin modificaciones artificiales a la aplicación.

### Comportamientos verificados de `UX-02`

- Aparece automáticamente al entrar por primera vez en `Misiones históricas` con el foco en `#welcome-start-guided`, y la tarjeta queda por debajo de la cabecera tanto en escritorio (`1366×800`, cabecera abajo `64 px`, tarjeta `285–579 px`) como en móvil (`390×844`, cabecera abajo `96 px`, tarjeta `309–631 px`).
- La cabecera (`.app-header`) recibe el puntero sin bloqueos (`z-index: 41` frente a `z-index: 40` del fondo del modal) y activar cualquier control de la cabecera cierra la bienvenida sin impedir la navegación.
- `Tab` y `Shift+Tab` permanecen contenidos en la tarjeta.
- Cierre verificado por `Escape` (sin cerrar el panel lateral), clic en el fondo (`.historical-welcome-overlay`), `#welcome-close-btn`, `#welcome-explore-free`, apertura de `Menú`, cambio de modo por cabecera y cambio de sección desde `Buscar`.
- Restauración del foco al control que abrió el modal (`historico` o `#hist-welcome-open-btn`) salvo cuando se cierra usando la cabecera.
- `#welcome-start-guided` cierra la bienvenida e inicia el recorrido guiado; la casilla `#welcome-dont-show-again` impide la reapertura automática al salir y regresar a `Misiones históricas`; y `#hist-welcome-open-btn` vuelve a abrir la bienvenida de forma fiable tras cambiar de modo y cerrar el menú.
- Transiciones rápidas `historico → experimental → exploracion → historico → exploracion → experimental → historico` sin bloqueos ni apariciones indebidas de la bienvenida fuera de `Misiones históricas`.

---

## 4. Estado final de `LAN-02` — Recursos compartidos y ciclo de vida del Lanzamiento 3D

**Estado:** **Resuelto y verificado** (auditoría de seguridad en Three.js r186 + corrección de cierre temprano en `LaunchWorld.js` + prueba de resistencia de 10 ciclos y coexistencia multi-renderizador).

### Auditoría de la estrategia heredada (`LaunchSharedResources.js`)

1. **Geometrías y texturas del modelo NASA (`separarRecursosCompartidos`)**: crea envoltorios `BufferGeometry` propios que referencian exactamente los mismos `index`, `attributes` y `morphAttributes` sin duplicar buffers en CPU, y clones de `Texture` que comparten el mismo `Texture.source`. Al cerrarse el lanzamiento, `dispose()` retira los oyentes del renderizador del lanzamiento sin tocar la plantilla compartida usada por la escena principal.
2. **Sprites (`crearSpritePropio`) y textura de resplandor (`resplandor().clone()`)**: los sprites del penacho y del Sol espacial dejan de registrar oyentes del renderizador efímero en la geometría global de `THREE.Sprite` y en la textura en caché del módulo `LaunchEffects.js`.
3. **`WebGLRenderTarget` de PMREM (`entornoObjetivo`)**: ahora se guarda y desecha explícitamente tanto al regenerar el entorno como en `destruir()`.
4. **Seguridad de `texturaDfgCompartida(renderer, escena)` y `dfgCompartida?.dispose()`**:
   - Se inspeccionó el código real de Three.js r186 (`node_modules/three/build/three.module.js`, solo lectura) en `getDFGLUT`, `onTextureDispose`, `deallocateTexture`, `deleteTexture`, `initTexture`, `setTexture2D` y `uploadTexture`.
   - `getDFGLUT()` mantiene un singleton inmutable `DataTexture` de `16×16` (`RGFormat`, `HalfFloatType`, `512 B` de `DATA` en CPU, `version = 1`). Invocar `dispose()` **no** destruye `image.data` ni reinicia `version`; únicamente dispara el evento `dispose` para retirar el oyente `onTextureDispose` (que retenía el `WebGLRenderer` destruido) y elimina la textura WebGL en los renderizadores registrados.
   - En el siguiente fotograma de cualquier otro renderizador vivo (`#solar-system` o `#lab-canvas` del Hangar 3D), Three.js detecta `textureProperties.__version !== texture.version`, ejecuta `uploadTexture()`, recrea la `WebGLTexture` de `16×16` (`< 0,01 ms`, sin recompilación de shaders ni reconstrucción de geometrías) y vuelve a registrar únicamente el oyente del renderizador vivo.
   - Verificado experimentalmente en Chrome con **coexistencia simultánea** de `#solar-system`, `#lab-canvas` (Hangar 3D con modelo PBR Cassini) y el Lanzamiento 3D: `0` errores WebGL (`gl.getError() === 0`), `0` errores de consola, `dfgOyentesDispose` estable en `2` antes y después de abrir/cerrar el lanzamiento, y aspecto visual intacto en ambas escenas (ver captura del Hangar y del Sistema Solar).

### Hallazgo adicional corregido en `LaunchWorld.js` (cierre temprano)

Al revisar el requisito de cierre temprano durante la carga asíncrona (antes de terminar de cargar `Voyager.glb` o el mundo), se comprobó que `VoyagerLaunchDirector.js` ya protegía el callback de `cargarPlantillaVoyagerCompartida` con `if (destruido) return;`, pero `src/launch/LaunchWorld.js` carecía de bandera `destruido`:

- Si el usuario cerraba el lanzamiento antes de terminar `cargarTextura(...)`, los `ImageBitmap` tardíos (incluyendo Blue Marble de 8K) podían quedar sin cerrarse (`t.image?.close?.()`).
- Si el catálogo Hipparcos resolvía tras `destruir()`, creaba una `BufferGeometry` y la añadía a la escena ya destruida.
- Si `destruir()` se ejecutaba en mitad del bucle `await rAF` de `subirTexturas()`, la siguiente iteración invocaba `renderer.initTexture(t)` sobre un renderizador ya desechado y con contexto perdido.

Se añadió una guarda mínima `let destruido = false` en `src/launch/LaunchWorld.js` (desechando y cerrando `ImageBitmap` de cualquier textura tardía, abortando `estrellasListas`, `precompilarEntorno` y `subirTexturas`, y haciendo `destruir()` idempotente), junto con su verificación en `tests/AuditoriaFinalLAN02.test.mjs` y el ciclo de cierre temprano en `verificar-lan02-ciclos.mjs`.

---

## 5. Estado final de `GEN-01` — Documentación (`README.md`)

**Estado:** **Resuelto y verificado.**

Se contrastaron las afirmaciones del `README.md` modificado por Claude contra el código fuente y los datos reales:

- Ya no afirma que las transferencias interplanetarias no existen; describe con precisión el modelo actual de **cónicas parcheadas** (Lambert heliocéntrico de cero revoluciones, plano B, captura con empuje finito integrado con DOPRI54, salida opcional desde LC-41 y crucero de n cuerpos solo como comparación).
- La cobertura citada (`2026-11-18 → 2046-01-01, sin extrapolar`) y los siete planetas destino coinciden exactamente con `public/data/interplanetary-ephemerides-catalog-v1.json` y `ENCOUNTER_TARGETS` en `src/lab/IntegratedMission.js`.
- Declara explícitamente los límites («**No hay** integración de n cuerpos continua de toda la misión ni asistencias gravitatorias», ««Implementada» no significa «validada»», «una misión «viable según el modelo» no está validada como misión real») y mantiene «**Pendiente la validación final completa**» sin atribuirse la auditoría global de aceptación posterior.
- Conserva intactas las instrucciones de instalación, pruebas, build y despliegue en GitHub Pages (`npm ci`, `npm run dev`, `npm run lint`, `npm test`, `npm run build`, `npm run preview`, `GITHUB_PAGES=true`, `/simulador-sondas-espaciales/`, `.github/workflows/deploy.yml`).

No se requirieron cambios adicionales en `README.md`.

---

## 6. Cambios heredados de Claude

Se conservaron íntegramente todos los cambios implementados por Claude Code en la Fase 5 (además de las Fases 1–4 acumuladas en el árbol de trabajo):

- **`LAN-02`:** `src/launch/LaunchSharedResources.js` (nuevo), `src/launch/VoyagerLaunchDirector.js`, `src/launch/LaunchEffects.js`, `src/launch/LaunchWorld.js`, `tests/AuditoriaFinalLAN02.test.mjs` (nuevo).
- **`UX-01`:** `src/ui/DialogFocus.js` (nuevo), `src/ui/CommandPalette.js`, `src/ui/WorkspaceLayout.js`, `tests/AuditoriaFinalUX01.test.mjs` (nuevo).
- **`UX-02`:** `src/ui/HistoricalWelcomeModal.js`, `src/ui/workspace-layout.css`, `src/main.js`, `tests/AuditoriaFinalUX02.test.mjs` (nuevo).
- **`GEN-01`:** `README.md`, `tests/AuditoriaFinalGEN01.test.mjs` (nuevo).
- **Evidencias iniciales:** `docs/auditoria-final/evidencias/fase5/verificar-fase5.mjs`.

---

## 7. Cambios adicionales realizados en esta continuación

Cambios mínimos y localizados realizados para cerrar la Fase 5:

1. **`src/launch/LaunchWorld.js`**: guarda `destruido` para el cierre temprano durante descargas/decodificaciones asíncronas (`cargar`, `estrellasListas`, `precompilarEntorno`, `subirTexturas` y `destruir()` idempotente), evitando fugas de `ImageBitmap` y llamadas a `renderer.initTexture()` tras perder el contexto.
2. **`tests/AuditoriaFinalLAN02.test.mjs`**: ampliada la prueba de integración con aserciones de cierre temprano sobre `VoyagerLaunchDirector.js` y `LaunchWorld.js`.
3. **`docs/auditoria-final/evidencias/fase5/verificar-fase5.mjs`**:
   - Corregido `abrirBienvenidaDesdePanel()` para validar `#context-inspector` abierto/no inerte y `opacityProperty: true` en `checkVisibility()`.
   - Añadida la comprobación explícita del atajo de teclado `/` en `pruebaBuscar()`.
   - Añadida espera de `300 ms` antes de las capturas de la paleta de búsqueda para que concluya la animación `ui-pop` (`240 ms`).
4. **`docs/auditoria-final/evidencias/fase5/verificar-lan02-ciclos.mjs`** (nuevo): prueba reproducible en Chrome de 10 ciclos completos de Lanzamiento 3D + cierre temprano + coexistencia con Hangar 3D.
5. **`docs/auditoria-final/FASE_5_RESULTADOS.md`** (este informe).

---

## 8. Archivos modificados

### Archivos exclusivos de la Fase 5

| Archivo | Origen en Fase 5 | Propósito |
| --- | --- | --- |
| `src/launch/LaunchSharedResources.js` | Claude (nuevo) | Aislamiento de geometrías, texturas y sprites compartidos; localización de `dfgLUT`. |
| `src/launch/VoyagerLaunchDirector.js` | Claude | Separación y liberación de recursos del modelo NASA Voyager en `destruir()`. |
| `src/launch/LaunchEffects.js` | Claude | Sprites propios y clon de textura de resplandor con liberación en `destruir()`. |
| `src/launch/LaunchWorld.js` | Claude + esta continuación | Liberación de `entornoObjetivo` (PMREM), `solEspacio`, `dfgLUT` y guardas de cierre temprano (`destruido`). |
| `src/ui/DialogFocus.js` | Claude (nuevo) | Utilidades compartidas de trampa `Tab`/`Shift+Tab` y restauración de foco. |
| `src/ui/CommandPalette.js` | Claude | Accesibilidad completa (`UX-01`), teclado en captura, grupos sin cabeceras vacías, ARIA y `dispose()`. |
| `src/ui/WorkspaceLayout.js` | Claude | Evita pisar `aria-expanded` de `#header-search` cuando controla la paleta. |
| `src/ui/HistoricalWelcomeModal.js` | Claude | Cierre con `Escape`, fondo, `Cerrar` y cabecera; foco contenido y restaurado. |
| `src/ui/workspace-layout.css` | Claude | Eleva `.app-header` (`z-index: 41`) sobre el fondo de bienvenida (`z-index: 40`) y ajusta la tarjeta debajo. |
| `src/main.js` | Claude | Cierre de bienvenida al salir de modo histórico y guarda contra apertura tardía. |
| `README.md` | Claude | Documentación actualizada de cónicas parcheadas, cobertura y límites (`GEN-01`). |
| `tests/AuditoriaFinalLAN02.test.mjs` | Claude + esta continuación | 6 pruebas de aislamiento, DFG, PMREM y cierre temprano. |
| `tests/AuditoriaFinalUX01.test.mjs` | Claude | 8 pruebas de agrupación, foco cíclico, teclado y ARIA. |
| `tests/AuditoriaFinalUX02.test.mjs` | Claude | 5 pruebas de cierre, cabecera, foco y no bloqueo entre secciones. |
| `tests/AuditoriaFinalGEN01.test.mjs` | Claude | 4 pruebas de veracidad documental y cobertura de efemérides. |
| `docs/auditoria-final/evidencias/fase5/*` | Claude + esta continuación | Scripts reproducibles, resultados JSON y capturas verificadas. |
| `docs/auditoria-final/FASE_5_RESULTADOS.md` | Esta continuación (nuevo) | Informe de cierre de Fase 5. |

*(En el árbol de trabajo local siguen acumulados sin commit los cambios ya verificados de las Fases 1–4; ver sección 16.)*

---

## 9. Pruebas automatizadas

Ejecutadas tras la última modificación:

| Comando | Resultado | Detalle |
| --- | --- | --- |
| `npm run lint` | **OK (0 errores)** | ESLint limpio en todo el repositorio. |
| `npm test` | **485 / 485 OK** | `0` fallos, `0` omitidas, `0` canceladas (`6,97 s`). |
| `node --test tests/AuditoriaFinalLAN02.test.mjs tests/AuditoriaFinalUX01.test.mjs tests/AuditoriaFinalUX02.test.mjs tests/AuditoriaFinalGEN01.test.mjs` | **23 / 23 OK** | `LAN-02` (6), `UX-01` (8), `UX-02` (5), `GEN-01` (4) (`215 ms`). |
| `npm run build` | **OK** | Vite 8.3.4 (`167` módulos, `930 ms`). |
| `git diff --check` | **OK (0 avisos)** | Sin espacios finales ni conflictos. |

---

## 10. Resultados de navegador

### A) `verificar-fase5.mjs` (`UX-01`, `UX-02`, transiciones y móvil)

- **Entorno:** Chrome `157.0.8103.79` con aceleración GPU (`d3d11`), resoluciones `1366×800` y `390×844`.
- **Resultado global (`evidencias/fase5/verificacion-fase5.json`):**
  - `comprobacionesFallidas`: **`0`**
  - `erroresPagina`: **`0`**
  - `erroresConsola`: **`0`**
- **Cobertura confirmada:**
  - `UX-01`: apertura por botón `#header-search`, `Ctrl+K` y `/`; `distancia` sin cabecera `Cuerpos y sondas` vacía; `zzzz` sin cabeceras; 5 pasos `Tab`/`Shift+Tab` dentro del diálogo; `Escape` tras `Tab` y con foco en `<body>`; flechas desde `<body>` y coherencia `aria-activedescendant`/`aria-selected`; clic en `.cp-foot`; selección de `Júpiter` con `Enter` y `Marte` con ratón; clic en el fondo; conservación del foco en `#distance-menu`; cierre con `Escape` en móvil `390×844`.
  - `UX-02`: apertura automática con foco en `#welcome-start-guided`; los 5 botones de cabecera reciben el puntero; tarjeta completa debajo de la cabecera (`285–579 px` en escritorio y `309–631 px` en móvil); 7 pasos `Tab`/`Shift+Tab` contenidos; `Escape` cierra sin cerrar el panel lateral; reapertura desde `#hist-welcome-open-btn` tras cerrar y tras cambiar a Laboratorio y volver; cierre por fondo, `Cerrar`, `Explorar libremente`, `Menú`, paleta encima (doble `Escape`), cabecera a Laboratorio y `Buscar` → `Sistema Solar`; inicio de recorrido guiado; persistencia de `No mostrar`; 7 transiciones consecutivas de modo sin bloqueos.
- **Inspección visual directa de capturas:** revisadas `fase5-buscar-1366.png`, `fase5-buscar-390.png`, `fase5-bienvenida-1366.png` y `fase5-bienvenida-390.png` — contraste dark+gold intacto, diálogos nítidos y opacos, sin solapamientos ni recortes.

### B) `verificar-lan02-ciclos.mjs` (resistencia visual y funcional de 10 ciclos + Hangar)

- **Entorno:** Chrome `157.0.8103.79` con GPU (`d3d11`) y `--js-flags=--expose-gc`, `1366×800`.
- **Resultado global (`evidencias/fase5/verificacion-lan02.json`):**
  - `ciclosCompletados`: **`10`** (alternando `voyager-2` y `voyager-1`, incluyendo plataforma LC-41 y despliegue de `Voyager.glb` en `t = 4450 s`) + 1 cierre temprano + 1 ciclo adicional coexistiendo con el Hangar 3D (`11` lanzamientos totales).
  - `comprobacionesFallidas`: **`0`**
  - `erroresPagina`: **`0`**
  - `erroresConsola`: **`0`**
- **Inspección visual directa de capturas:** revisadas `fase5-lan02-plataforma-c1.png` (despegue en LC-41 con humo, llamas, sombras y cielo), `fase5-lan02-voyager-c1.png` (Voyager 2 NASA desplegada en ciclo 1), `fase5-lan02-voyager-c10.png` (Voyager 1 NASA desplegada en ciclo 10, calidad idéntica), `fase5-lan02-hangar-tras-lanzamiento.png` (Hangar 3D Cassini tras ciclo de lanzamiento + `dfgLUT.dispose()`, materiales PBR íntegros) y `fase5-lan02-solar-tras10.png` (Sistema Solar íntegro al finalizar).

---

## 11. Resultados de memoria (`LAN-02`)

Mediciones tras 3 ciclos explícitos de recolección de basura (`CDP HeapProfiler.collectGarbage` + `window.gc()`) en cada paso (`evidencias/fase5/verificacion-lan02.json`):

| Etapa | Renderizadores lanz. vivos / totales | Escenas lanz. vivas | Contextos WebGL2 vivos | Canvases DOM / desconectados vivos | Oyentes `dispose` en `dfgLUT` | Errores GL | Heap JS post-GC (MB) |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Línea base (Histórico) | `0 / 0` | `0` | `1` | `1 / 0` | `n/d` | `0` | `47,90` |
| Tras ciclo 1 (`voyager-2`) | `0 / 1` | `0` | `1` | `1 / 0` | `1` | `0` | `51,38` |
| Tras ciclo 2 (`voyager-1`) | `0 / 2` | `0` | `1` | `1 / 0` | `1` | `0` | `54,14` |
| Tras ciclo 3 (`voyager-2`) | `0 / 3` | `0` | `1` | `1 / 0` | `0` | `0` | `54,34` |
| Tras ciclo 4 (`voyager-1`) | `0 / 4` | `0` | `1` | `1 / 0` | `0` | `0` | `54,25` |
| Tras ciclo 5 (`voyager-2`) | `0 / 5` | `0` | `1` | `1 / 0` | `0` | `0` | `54,36` |
| Tras ciclo 6 (`voyager-1`) | `0 / 6` | `0` | `1` | `1 / 0` | `0` | `0` | `54,43` |
| Tras ciclo 7 (`voyager-2`) | `0 / 7` | `0` | `1` | `1 / 0` | `0` | `0` | `54,38` |
| Tras ciclo 8 (`voyager-1`) | `0 / 8` | `0` | `1` | `1 / 0` | `0` | `0` | `54,62` |
| Tras ciclo 9 (`voyager-2`) | `0 / 9` | `0` | `1` | `1 / 0` | `0` | `0` | `54,76` |
| Tras ciclo 10 (`voyager-1`) | `0 / 10` | `0` | `1` | `1 / 0` | `0` | `0` | `54,75` |
| Cierre temprano (`180 ms`) | `0 / 10` | `0` | `1` | `1 / 0` | `1` | `0` | `54,85` |
| Hangar 3D (antes de lanz. #11) | `0 / 10` | `0` | `4` | `7 / 0` | `2` | `0` | `67,36` |
| Hangar 3D (tras lanz. #11) | `0 / 11` | `0` | `4` | `7 / 0` | `2` | `0` | `62,60` |

**Interpretación técnica:**

- **Calentamiento inicial (base → ciclo 2, `+6,24 MB`):** corresponde a la carga bajo demanda y caché permanente del módulo `VoyagerLaunchDirector`, del catálogo estelar Hipparcos, de los perfiles de ambas Voyager y de la plantilla compartida `Voyager.glb`.
- **Estabilidad tras calentamiento (ciclo 2 → ciclo 10, `+0,61 MB` en 8 ciclos completos):** oscilación plana (`54,14` → `54,75 MB`, media `+0,076 MB/ciclo`), sin tendencia lineal de fuga, **`0 / 11` renderizadores retenidos**, **`0 / 11` escenas retenidas**, **`0` canvases desconectados vivos** y exactamente **`1` contexto WebGL2** fuera del Laboratorio (`4` al abrir las vistas persistentes del Laboratorio, idéntico antes y después del lanzamiento #11).
- En la prueba de coexistencia con el Hangar 3D, `escenaPrincipalActiva` registró `renderPausado: true`, `rafActivo: false` y `motivosPausa: ["laboratorio"]`, confirmando además la preservación intacta de `PERF-01`.
- Comparado con la comprobación previa de Claude (3 ciclos con 1 renderizador vivo al final), la verificación actual amplía la muestra a **10 ciclos completos + cierre temprano + coexistencia con Hangar 3D**, confirmando que no existe retención acumulativa.

---

## 12. Evidencias reproducibles

Todos los artefactos de la Fase 5 residen en `docs/auditoria-final/evidencias/fase5/`:

- **Guiones reproducibles:**
  - [verificar-fase5.mjs](evidencias/fase5/verificar-fase5.mjs) — `UX-01`, `UX-02`, transiciones de modo y móvil (`390×844`).
  - [verificar-lan02-ciclos.mjs](evidencias/fase5/verificar-lan02-ciclos.mjs) — `LAN-02` (10 ciclos + cierre temprano + coexistencia Hangar 3D).
- **Resultados estructurados (JSON):**
  - [verificacion-fase5.json](evidencias/fase5/verificacion-fase5.json)
  - [verificacion-lan02.json](evidencias/fase5/verificacion-lan02.json)
- **Capturas verificadas:**
  - [fase5-buscar-1366.png](evidencias/fase5/fase5-buscar-1366.png) · [fase5-buscar-390.png](evidencias/fase5/fase5-buscar-390.png)
  - [fase5-bienvenida-1366.png](evidencias/fase5/fase5-bienvenida-1366.png) · [fase5-bienvenida-390.png](evidencias/fase5/fase5-bienvenida-390.png)
  - [fase5-lan02-plataforma-c1.png](evidencias/fase5/fase5-lan02-plataforma-c1.png) · [fase5-lan02-voyager-c1.png](evidencias/fase5/fase5-lan02-voyager-c1.png) · [fase5-lan02-voyager-c10.png](evidencias/fase5/fase5-lan02-voyager-c10.png)
  - [fase5-lan02-hangar-tras-lanzamiento.png](evidencias/fase5/fase5-lan02-hangar-tras-lanzamiento.png) · [fase5-lan02-solar-tras10.png](evidencias/fase5/fase5-lan02-solar-tras10.png)

---

## 13. Comparación de rendimiento

El aislamiento de recursos de `LAN-02` y los ajustes de `UX-01`/`UX-02` no introducen ninguna degradación de FPS en GPU (AMD Radeon RX 6650 XT, tasa de refresco `180 Hz`):

| Escenario | FPS medidos (Fase 5) | Tiempo medio/fotograma | Referencia Fases 3–4 |
| --- | :---: | :---: | :---: |
| Escena principal (línea base) | **180,71 FPS** | `5,53 ms` | ~173–180 FPS |
| Lanzamiento 3D · ciclo 1 (`t = 4450 s`, NASA Voyager 2) | **181,09 FPS** | `5,52 ms` | ~180 FPS |
| Lanzamiento 3D · ciclo 5 (`t = 4450 s`, NASA Voyager 2) | **181,27 FPS** | `5,52 ms` | ~180 FPS |
| Lanzamiento 3D · ciclo 10 (`t = 4450 s`, NASA Voyager 1) | **180,99 FPS** | `5,53 ms` | ~180 FPS |
| Escena principal tras ciclo 1 / 5 / 10 | **181,38 / 180,83 / 181,25 FPS** | `5,51–5,53 ms` | ~173–180 FPS |
| Sistema Solar (Exploración) tras 11 lanzamientos + Hangar | **178,79 FPS** | `5,59 ms` | ~173–180 FPS |

---

## 14. Riesgos pendientes

1. **Dependencia interna de Three.js r186 en `texturaDfgCompartida()`**: el acceso a `renderer.properties.get(material)?.uniforms?.dfgLUT?.value` y el comportamiento de re-subida tras `dfgLUT.dispose()` son específicos de Three.js r186. Si en el futuro se actualiza Three.js a una versión que cambie el nombre del uniforme o el ciclo de vida de `DFGLUTData`, deberá revalidarse `AuditoriaFinalLAN02.test.mjs` y `verificar-lan02-ciclos.mjs`.
2. **Transición CSS encadenada de `visibility` en `#context-inspector`**: `.hist-mission-dock` (`.hud-secondary`, `0,2 s`) y `.hist-quick-btn` (`0,15 s`) siguen tardando `0,35 s` en pasar de `visibility: visible` a `visibility: hidden` al cerrar el panel lateral, aunque visualmente el panel ya esté en `opacity: 0` e `inert = true` (sin impacto para el usuario, pero relevante para cualquier automatización futura).
3. **Validación final global pendiente**: la auditoría de aceptación integral del simulador completo (tras acumular las Fases 1–5) queda pendiente para la siguiente etapa autorizada.

---

## 15. Limitaciones de las verificaciones

- Las pruebas de navegador y memoria se ejecutaron en **Windows + Chrome `157.0.8103.79` con GPU dedicada (ANGLE D3D11)**; no se repitió el perfilado en Firefox, Safari, Linux/macOS ni en renderizado por software para esta fase (SwiftShader ya fue validado en Fases 2–4 y no se modificó el pipeline de sombreado ni la calidad adaptativa).
- `performance.memory.usedJSHeapSize` mide el montón JavaScript de V8 y no cuantifica directamente la VRAM del controlador GPU; la ausencia de fugas GPU se infiere de `renderersLanzamientoVivos === 0`, `contextosWebGLVivos === 1`, `forceContextLoss()`, `ImageBitmap.close()` y `gl.getError() === 0` durante 11 ciclos.
- Una muestra de 10 ciclos completos + cierre temprano + coexistencia demuestra ausencia de retención acumulativa en dicho horizonte, pero no constituye una prueba matemática de ausencia absoluta de fugas bajo cualquier secuencia arbitraria de horas de uso.

---

## 16. Estado final de Git

- **Rama actual:** `revision/modo-historico-voyager`
- **Commits / push realizados:** **ninguno** (por restricción explícita del usuario; todos los cambios de Fases 1–5 permanecen en el árbol de trabajo local).
- **Resumen del árbol de trabajo:**
  - `32` archivos rastreados modificados (`git diff --check` limpio, 0 errores).
  - Archivos nuevos sin seguimiento correspondientes a Fases 1–5 (`src/graphics/WebGLSupport.js`, `src/lab/IntegratedMissionWorker.js`, `src/lab/IntegratedMissionWorkerClient.js`, `src/launch/LaunchSharedResources.js`, `src/ui/DialogFocus.js`, `src/ui/WebGLUnavailableNotice.js`, `tests/AuditoriaFinal*.test.mjs` y `docs/auditoria-final/`).
- No se modificaron `node_modules`, datos científicos, hashes, kernels ni `Voyager.glb`, ni se sobrescribieron evidencias de las Fases 1–4.

---

## 17. Conclusión sobre el cierre de la Fase 5

Se cumplen todas las condiciones de cierre de la **Fase 5**:

- `UX-01` funciona de forma completa y accesible con ratón y teclado.
- `UX-02` permite cerrar, navegar por la cabecera y reabrir la bienvenida mediante `#hist-welcome-open-btn` incluso tras cambiar de modo y usar el menú.
- `LAN-02` elimina la retención acumulativa de renderizadores WebGL del Lanzamiento 3D (`0 / 11` retenidos tras 10 ciclos completos, cierre temprano y coexistencia con el Hangar 3D) sin afectar a los recursos compartidos de otras escenas ni a la calidad visual ni al rendimiento (`~180 FPS`).
- `GEN-01` alinea `README.md` con las capacidades reales y sus límites científicos sin afirmaciones prematuras.
- Las `485` pruebas automatizadas, el lint, el build de producción y las dos baterías reproducibles en Chrome concluyeron con **0 fallos y 0 errores**.

La Fase 5 queda **cerrada**, lista para revisión del usuario y para la posterior auditoría de aceptación final del simulador.
