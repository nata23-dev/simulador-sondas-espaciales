# Etapa 15 — registro de recuperación

Registro de trabajo para continuar si la sesión se interrumpe. Encargo: `VISION_FINAL.md` (finalizar el simulador), recibido el 19-11-2026.

## Línea base (19-11-2026)

- Rama `revision/modo-historico-voyager`, sin commits nuevos desde `235ffd3`; trabajo local de 12F–14.1 sin confirmar.
- `node --test tests/*.test.mjs`: 259/259.
- Auditoría: el Hangar usaba solo piezas ficticias; no había sondas históricas (Voyager/Cassini/Dawn/Juno), ni centro de masas, ni potencia según distancia solar, ni propulsión eléctrica dependiente de la potencia; la «Misión completa» (13) declaraba la energía como no evaluada.

## Plan de la etapa 15

1. `src/lab/HeritageCatalog.js`: fuentes, piezas de herencia, buses con puntos de montaje y configuraciones históricas con ficha.
2. `src/lab/SpacecraftPower.js`: potencia solar y RTG frente a distancia y tiempo; empuje eléctrico según potencia.
3. `ComponentCatalog.js` / `ProbeDesign.js`: categorías nuevas, puntos que aceptan varias categorías, interfaces mecánicas y adaptadores, envolventes, propelente de actitud separado.
4. `ProbeEngineering.js`: centro de masas, presupuesto de actitud, perfil de potencia, compatibilidades por tipo, calidad de datos.
5. `IntegratedMission.js`: comprobación de energía por fases y empuje eléctrico limitado por la potencia en el destino.
6. `HeritageModels.js` + `ProbeAssemblyView.js`: modelos procedimentales con dimensiones publicadas, orientación por punto, encuadre automático y marcador del centro de masas.
7. `ExperimentalLaboratory.js`: modo histórico / personalizado, ficha técnica con fuentes, filtro por herencia, adaptadores.
8. Comparación de misiones, perfiles de calidad gráfica, revisión responsiva y documentación.

## Progreso

### Bloque 1 — biblioteca de herencia e ingeniería (completado, pruebas locales)

- `src/lab/HeritageCatalog.js` (nuevo): fuentes, 4 buses y 41 piezas de Voyager, Cassini, Dawn y Juno con calidad por dato (documentado, secundario, derivado, estimado, desconocido). Masa del bus por cierre con la masa seca documentada.
- `src/lab/SpacecraftPower.js` (nuevo): potencia solar P₁·r^(−k) con k ajustado a dos puntos documentados; RTG P₀·e^(−λt); empuje eléctrico T = 2ηP/(g₀·Isp).
- `ComponentCatalog.js`: catálogo unificado (`ALL_COMPONENTS`), herrajes, adaptadores (máx(2 kg; 8 %)), envolventes. `ProbeDesign.js`: `HISTORICAL_PRESETS`, `historicalDesign`, validación de herraje y envolvente, `basedOn` y `adapter`.
- `ProbeEngineering.js`: masa estructural, adaptadores y RCS; centro de masas (dirección normalizada); alineación del empuje; perfil de potencia; propulsión eléctrica; compatibilidad por tipo; veredicto; calidad de datos.
- `MissionPlanStore.designSignature` no cambia. No necesita el adaptador: en un diseño válido `adapter` equivale a `needsAdapter(punto, pieza)` (`validateDesign` rechaza tanto el que falta como el innecesario), así que la firma sigue identificando el diseño. `parseDesign` conserva `adapter: true` al importar.

### Bloque 2 — misión integrada (completado, pruebas locales)

- `IntegratedMission.js`: la sonda lleva su modelo eléctrico; el empuje eléctrico se reduce con la potencia en el destino (si no alcanza el mínimo, la captura falla y sigue un sobrevuelo); fase `power` (480 muestras, déficit frente a batería, sin recarga); objetivo `moon.mode: 'flyby'` (fase `moon-flyby`, tramos `moon-flyby` y `moon-outbound`).
- `EncounterDesign.searchMoonTransfer`: parámetro `objective` (en sobrevuelo solo cuenta el Δv de salida).
- `IntegratedMissionPlayback.AUTO_RATE['moon-flyby'] = 300`.
- Cambio de criterio documentado: la sonda ilustrativa de 12A (1460 W a 1 AU, 98 W de servicio) **no** tiene energía en Júpiter; B1 termina ahora en NO VIABLE por energía (las pruebas de 13 no afirmaban el veredicto de B1).
- Escenario Europa (oportunidad refinada desde 2028-12-26, 1090 d):
  - Cassini + antena de Voyager: JOI de 574 m/s en órbita tipo Juno, transferencia a Europa y **sobrevuelo** completo. La **captura** en Europa es NO VIABLE (propelente agotado; harían falta ≈ 4,4 km/s más).
  - Cassini + NSTAR + alas de Juno: captura bloqueada por falta de potencia y déficit energético.
  - Juno histórica: margen eléctrico ≈ 78 W en Júpiter.

### Bloque 3 — Hangar 3D e interfaz (completado; revisado en Chrome/SwiftShader)

- `src/lab/HeritageModels.js` (nuevo): modelos procedimentales por `shape` con las dimensiones del catálogo (envergadura de Dawn 19,68 m; antenas de 3,66, 4, 1,52 y 2,5 m).
- `ProbeAssemblyView.js`: piezas de herencia orientadas según la normal del punto; alas con las células hacia el eje de la antena; anillo de adaptador; encuadre automático por esfera envolvente solo para buses de herencia (los ilustrativos conservan su vista); marcadores de centro de masas y de puntos libres.
- `MissionExecutionView.js`: las sondas de herencia se reducen visualmente a ≈ 3,6 m de radio (solo presentación).
- `ExperimentalLaboratory.js` y `experimental-laboratory.css`: modos «Sondas históricas» y «Personalizado»; ficha técnica con calidad y fuentes; «Crear variante personalizada»; filtro por programa; puntos compatibles con aviso de adaptador o de envolvente; confirmación del adaptador; panel de ingeniería ampliado.
- `IntegratedMissionPlanner.js`: objetivo en el satélite (captura o sobrevuelo); escenarios C1 (sobrevuelo) y C2 (captura) con la sonda del Hangar; sección «Energía eléctrica»; comparación de las últimas 6 misiones.

### Bloque 4 — calidad gráfica, energía en el Centro y cierre (completado)

- `src/graphics/QualityProfile.js` (nuevo): perfiles Automática, Alta, Media y Baja. Topes de relación de píxeles 2, 2, 1,5 y 1. El modo automático empieza en 1,5 en equipos limitados y baja un escalón tras dos ventanas de 2 s por debajo de 30 FPS. Se registran todas las vistas WebGL (Sistema Solar, Hangar, trayectoria y Centro). El selector está en el menú «Vista» (`#quality-controls`).
- `IntegratedMissionPlayback.deriveIntegratedTelemetry`: campo `power` (generación, consumo con el motor durante los encendidos de la sonda, margen y veredicto) calculado con el mismo modelo que la fase de energía. El Centro lo muestra en «Energía eléctrica, maniobras y límites».
- Corrección visual: a 1280 px, el botón «Crear variante personalizada» se salía de la ficha histórica. Los botones pasan a una columna cuando no caben dos de 150 px. El guion de revisión mide ahora los elementos que sobresalen de su tarjeta.
- Documentación: `STAGE15_HERITAGE_HANGAR.md`, `CLAUDE.md`, roadmap, PROJECT_CONTEXT, ARCHITECTURE_MAP, docs/README y UI_DESIGN_SYSTEM.

### Pruebas

- `tests/HeritageHangar.test.mjs` (20 pruebas, incluida la energía instantánea en el Centro) y `tests/QualityProfile.test.mjs` (4).
- Suite completa: **283/283** (`node --test tests/*.test.mjs`). `npm run build` y la compilación con `GITHUB_PAGES=true` (prefijo `/simulador-sondas-espaciales/`) correctas. `git diff --check` limpio.
- Navegador: `scripts/verify-stage15-browser.mjs` con las partes `flow`, `quality` y `responsive`. Resultados en `docs/STAGE15_HERITAGE_HANGAR.md` §7 y `evidence/stage15/`.

### Pendiente (fuera del alcance verificable en esta sesión)

1. Auditoría independiente de Gemini (criterio del proyecto).
2. Revisión con GPU real y medida de FPS. SwiftShader no es representativo.
3. Commits: los cambios de 15 comparten archivos con trabajo previo de 12G–14.1 que tampoco está en Git; no se pueden separar sin mezclar etapas. Queda pendiente de la decisión del usuario, ver la entrega.
4. Publicación en GitHub Pages: no se ha hecho; requiere autorización.
