# Guiones del proyecto

Índice creado en la etapa 19 (21-11-2026). Los guiones **no se movieron**: los citan por su ruta los documentos de etapa y los informes de auditoría, y muchos calculan rutas relativas a esta carpeta. Este índice indica cuáles siguen vigentes y cuáles son evidencia de etapas cerradas.

Verificación habitual: `node --test tests/*.test.mjs`, `npm run build`, `git diff --check`; en navegador, `node scripts/verify-stage17-browser.mjs <parte>` (Playwright local y Chrome; `GPU=1` para usar la GPU real) y `node scripts/measure-startup.mjs`.

## Vigentes (8)

Se usan en la verificación habitual o en el estado actual del proyecto.

| Guion | Etapa | Uso | Docs que lo citan | Descripción (primer comentario) |
| --- | --- | --- | ---: | --- |
| `HorizonsAcquisition.mjs` | — | — | 4 | — |
| `audit-stage17_1-independent-science.mjs` | 17 | — | 3 | 17.1 · Verificación científica independiente de la misión guiada Cassini → Marte (escenario A1) y de las efemérides. |
| `audit-voyager-stage8.mjs` | 8 | package.json | 16 | Reproducible, offline audit of the production catalog and preserved Horizons comparisons. |
| `measure-startup.mjs` | — | — | 1 | Etapa 18 · Medición de la carga inicial sobre la compilación de producción (vite preview) en Chrome sin interfaz. |
| `report-stage12g-windows.mjs` | 12g | — | 1 | Etapa 12G — informe numérico reproducible (sin red): ventanas por destino, verificación de Lambert y de tiempo. |
| `report-stage13-missions.mjs` | 13 | — | 1 | Etapa 13 — informe numérico reproducible (sin red): misiones A y B, errores de efemérides de baricentros y satélites, |
| `verify-stage17-browser.mjs` | 17 | — | 6 | Etapa 17 — verificación en Chrome (sin interfaz, SwiftShader) del laboratorio en tres etapas: panel de etapas, pestañas, |
| `voyager-reference-utils.mjs` | — | — | 1 | Offline-first, traceable Horizons acquisition for the Voyager reference audit. |

## Auditorías y diagnósticos científicos de etapas cerradas (24)

Evidencia reproducible citada por los informes de auditoría. Solo leen datos; ninguno escribe en `public/`.

| Guion | Etapa | Uso | Docs que lo citan | Descripción (primer comentario) |
| --- | --- | --- | ---: | --- |
| `analyze-stage10-luminance.py` | 10 | — | 1 | Sample fixed, unobstructed regions of authentic Chrome before/after PNGs. |
| `analyze-stage10-phases.mjs` | 10 | — | 1 | The historical controller reports a contextual look target that is not a |
| `audit-stage10-visual-assets.py` | 10 | — | 1 | Audit Io source maps without altering any texture or historical data. |
| `audit-stage11-textures.py` | 11 | — | 1 | Read-only diagnostics for the original Neptune and Io maps. |
| `audit-stage2-1-encounters.mjs` | 2-1 | — | 0 | Radios y múltiplos publicados en la tabla NSSDCA, distintos de los radios |
| `audit-stage2-2-horizons.mjs` | 2-2 | — | 0 | — |
| `audit-stage2-3-local.mjs` | 2-3 | — | 0 | — |
| `audit-stage2-3-spice.py` | 2-3 | — | 0 | Audita las cadenas SPK Voyager con kernels oficiales NAIF y respuestas Horizons. |
| `audit-stage4-horizons.mjs` | 4 | — | 0 | — |
| `audit-stage4-preservation.py` | 4 | — | 0 | Compare historical Voyager source and data with the approved Stage 03.1 ZIP. |
| `audit-stage6-moons.mjs` | 6 | — | 1 | — |
| `audit-voyager-encounter-frames.mjs` | — | — | 2 | — |
| `audit-voyager-global-reference.mjs` | — | — | 1 | Targeted whole-span and native-center transition checks. Evidence only. |
| `audit-voyager-interpolation.mjs` | — | — | 1 | Compare the actual production interpolator to interior SPICE states. |
| `audit-voyager-reference-reconciliation.mjs` | — | — | 1 | — |
| `audit-voyager-specialized-context.py` | — | — | 1 | Independently compare archived NAIF encounter kernels with current direct Horizons. |
| `audit-voyager-spk-reference.py` | — | — | 1 | Read original NAIF segments and compare them with the Horizons audit. |
| `audit-voyager-stage9b-alternatives.py` | 9b | — | 1 | Acquire selected official NAIF alternatives and inventory their SPK segments. |
| `benchmark-provider-enrichment.mjs` | — | — | 1 | — |
| `compare-voyager-stage9b.py` | 9b | — | 1 | CSPICE comparison of official alternative Voyager kernels with preserved Horizons. |
| `diagnose-voyager-stage9.py` | 9 | — | 1 | Independent CSPICE audit of the two Voyager historical/refit handoffs. |
| `reconcile-stage6-historical-moons.mjs` | 6 | — | 1 | The parent planet's existing heliocentric vector defines the scene origin. |
| `summarize-voyager-reference-reconciliation.mjs` | — | — | 1 | Offline evidence summary and preservation check. Never writes public data. |
| `verify-stage9b-kernels.py` | 9b | — | 1 | Verifica sin red los once kernels alternativos conservados de la Etapa 09B. |

## Adquisición de datos (NASA/JPL, NAIF) (13)

**No ejecutar sin autorización expresa**: descargan de servicios externos y podrían regenerar datos publicados.

| Guion | Etapa | Uso | Docs que lo citan | Descripción (primer comentario) |
| --- | --- | --- | ---: | --- |
| `acquire-moons-stage4.mjs` | 4 | — | 0 | Geometric moon-to-planet-center states. Never subtract separately queried |
| `acquire-stage12g-interplanetary.mjs` | 12g | — | 3 | Etapa 12G — adquisición reproducible de efemérides planetarias de cobertura amplia (NASA/JPL Horizons). |
| `acquire-stage13-encounters.mjs` | 13 | — | 1 | Etapa 13 — adquisición reproducible de efemérides para encuentros planetarios (NASA/JPL Horizons). |
| `acquire-stage2-2-horizons.mjs` | 2-2 | — | 0 | — |
| `acquire-stage5-textures.py` | 5 | — | 0 | Acquire the five unmodified NASA image textures used by the moon renderer. |
| `acquire-stage6-historical-moons.mjs` | 6 | — | 0 | Encounter-local coverage only. No states are invented between these windows. |
| `acquire-stage6-moon-textures.mjs` | 6 | — | 0 | — |
| `acquire-stage6-moons.mjs` | 6 | — | 0 | Direct planet-centered vectors avoid introducing a fabricated satellite orbit. |
| `acquire-stage6-voyager-photos.mjs` | 6 | — | 0 | Original NASA/JPL Photojournal JPEGs. A JPEG may be a processed historical |
| `acquire-voyager-encounter-frames.mjs` | — | — | 0 | Capture direct geometric probe/planet states for separate local encounter frames. |
| `acquire-voyager-moon-contexts.mjs` | — | — | 0 | Direct moon-minus-spacecraft vectors, kept apart from the global trajectory. |
| `adquirir-efemerides-historicas.mjs` | — | — | 0 | — |
| `descargar-efemerides.mjs` | — | — | 2 | — |

## Derivación de recursos (7)

Generaron texturas, miniaturas, manifiestos o geometría a partir de originales conservados. Volver a ejecutarlos cambia archivos publicados.

| Guion | Etapa | Uso | Docs que lo citan | Descripción (primer comentario) |
| --- | --- | --- | ---: | --- |
| `build-stage2-manifest.mjs` | 2 | — | 0 | — |
| `build-stage5-1-textures.ps1` | 5-1 | — | 0 | Derive compact runtime images and provenance masks. Original Voyager JPEGs stay untouched. |
| `build-stage6-2-moon-mosaics.py` | 6-2 | — | 0 | Create WebGL-sized copies of official cylindrical moon mosaics. |
| `build-stage6-photo-thumbs.ps1` | 6 | — | 0 | — |
| `derive-io-seam-texture.py` | — | — | 1 | Feather documented rectangular stitch boundaries in the original Voyager Io mosaic. |
| `efemerides-2026-profile.json` | — | — | 1 | — |
| `generate-stage2-geometry.mjs` | 2 | — | 0 | — |

## Verificación visual y capturas de etapas cerradas (39)

Recorridos de Chrome y capturas de etapas anteriores; algunos dependen de la interfaz de su época y ya no pasan sin adaptarlos. La regresión vigente es `verify-stage17-browser.mjs`.

| Guion | Etapa | Uso | Docs que lo citan | Descripción (primer comentario) |
| --- | --- | --- | ---: | --- |
| `audit-stage10-comparator.mjs` | 10 | — | 1 | — |
| `audit-stage11-comparator.mjs` | 11 | — | 1 | — |
| `audit-stage11b-comparator.mjs` | 11b | — | 1 | — |
| `audit-stage11b-temporal.mjs` | 11b | — | 1 | — |
| `audit-voyager-stage8-browser.mjs` | 8 | — | 2 | — |
| `audit-voyager-visual-e2e.mjs` | — | — | 0 | — |
| `capture-batch1-interplanetary-integrated.mjs` | — | — | 0 | — |
| `capture-batch2-details.mjs` | — | — | 1 | — |
| `capture-batch3-final.mjs` | — | — | 0 | — |
| `capture-defect.mjs` | — | — | 0 | — |
| `capture-stage10.mjs` | 10 | — | 1 | — |
| `capture-stage11.mjs` | 11 | — | 1 | — |
| `capture-stage2-2-notes.mjs` | 2-2 | — | 0 | — |
| `capture-stage7b.mjs` | 7b | — | 1 | — |
| `compare-stage7b-captures.mjs` | 7b | — | 0 | — |
| `diagnose-stage11b-initial.mjs` | 11b | — | 1 | — |
| `diagnose-uranus.mjs` | — | — | 0 | — |
| `inspect-stage7b-light.mjs` | 7b | — | 0 | — |
| `preview-redesign.mjs` | — | — | 0 | — |
| `redesign-preview.mjs` | — | — | 0 | — |
| `redesign-query.mjs` | — | — | 0 | — |
| `redesign-state.mjs` | — | — | 0 | — |
| `reference-eyes.mjs` | — | — | 0 | — |
| `smoke-stage7b-modes.mjs` | 7b | — | 0 | — |
| `verify-guided-and-launch.mjs` | — | — | 0 | — |
| `verify-hud.mjs` | — | — | 0 | Ejecutar con Vite y una instancia de Chrome en el puerto de depuración 9338. |
| `verify-redesign.mjs` | — | — | 0 | — |
| `verify-spatial-scene.mjs` | — | — | 0 | Ejecutar con Vite y Chrome sin interfaz, con depuración remota en el puerto 9340. |
| `verify-stage1.mjs` | 1 | — | 0 | — |
| `verify-stage12g-browser.mjs` | 12g | — | 1 | Etapa 12G — verificación en navegador (Chrome sin interfaz + Playwright local) del flujo interplanetario y de 12F.1. |
| `verify-stage13-browser.mjs` | 13 | — | 1 | Etapa 13 — verificación en navegador (Chrome sin interfaz + Playwright local) de la «Misión completa»: misión A (Marte) y |
| `verify-stage14-browser.mjs` | 14 | — | 3 | Etapa 14 — verificación visual e interactiva en Chrome (sin interfaz, SwiftShader) de la renovación de la interfaz: |
| `verify-stage15-browser.mjs` | 15 | — | 3 | SUSTITUIDO en 15.1 para el Hangar: los pasos de piezas, adaptadores y variantes personalizadas ya no existen en la interfaz. |
| `verify-stage15_1-browser.mjs` | 15 | — | 1 | Etapa 15.1 — verificación en Chrome (sin interfaz, SwiftShader) de la flota fija con modelos 3D oficiales de NASA. |
| `verify-stage16-browser.mjs` | 16 | — | 1 | Etapa 16 — verificación en Chrome (sin interfaz, SwiftShader) de la coherencia del laboratorio con la flota y de la misión guiada. |
| `verify-stage2.mjs` | 2 | — | 0 | — |
| `verify-stage3-1.mjs` | 3-1 | — | 0 | — |
| `verify-stage3.mjs` | 3 | — | 0 | — |
| `verify-stage4.mjs` | 4 | — | 0 | — |

## Respaldo y empaquetado (4)

Utilidades para paquetes ZIP portátiles e inventarios de cambios.

| Guion | Etapa | Uso | Docs que lo citan | Descripción (primer comentario) |
| --- | --- | --- | ---: | --- |
| `audit-backup-inventory.py` | — | — | 0 | Inventario reproducible de los cambios pendientes antes del respaldo Git. |
| `package-portable-zip.py` | — | — | 0 | Build a complete project ZIP with explicit POSIX entry names. |
| `trim-backup-evidence.py` | — | — | 0 | Quita sólo blancos finales que Git detecta en evidencias de texto derivadas. |
| `verify-portable-zip.py` | — | — | 0 | Strict ZIP path/CRC/extraction/SHA-256 check. Usage: python verify-portable-zip.py FILE.zip |
