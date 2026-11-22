# Etapa 17.1 — «3 · Reproducir» en el Sistema Solar principal

Estado: **implementada, auditada y corregida.** 323 pruebas, dos builds y verificación científica independiente de A1 (31/31). Revisada en Chrome/SwiftShader y, el 20-11-2026, en Chrome sin interfaz con la **GPU real** (AMD Radeon RX 6650 XT, Direct3D 11). **Auditada por Claude**, que también la implementó: [informe](STAGE17_1_AUDIT_CLAUDE.md), dictamen «**aprobado con observaciones**», con Horizons en línea, un integrador propio y pruebas adversarias. Su defecto menor D-01 (escena casi invisible a 320–375 px) y la observación O-05 se corrigieron en **17.1.1**. **Pendiente** de revisión visual por una persona y de prueba con un lector de pantalla real. Una segunda revisión de Gemini es opcional ([encargo](STAGE17_1_GEMINI_AUDIT_REQUEST.md)). Sin cambios de física, constantes, integrador, datos, hashes, kernels ni modelos.

## Petición

El usuario pidió:

- reproducir la misión planificada en el laboratorio (por ejemplo, la misión guiada Cassini → Marte) en el **Sistema Solar principal**, el mismo que usaba la Sonda Experimental 01;
- retirar de la interfaz la **Sonda Experimental 01**.

## Qué cambia

1. **Reproducción en la escena principal.** Con una misión heliocéntrica, la escena del Centro de Misión es una ventana al lienzo principal (`#solar-system`), con:
   - los ocho planetas en la época TDB de cada instante;
   - la sonda con su modelo 3D: el de NASA para la flota, o el procedural para un ensamblaje experimental;
   - la trayectoria calculada.

   El reloj, la línea de tiempo, los eventos, la telemetría, las pestañas, el panel ocultable y la vista inmersiva del Centro de Misión siguen igual. El reloj mueve la escena principal en lugar de la escena local.
2. **Retirada de la Sonda Experimental 01 de la interfaz.** Se eliminan:
   - el panel `#mission-panel` y `src/ui/MissionControls.js`;
   - el área «Demostración científica» del menú de áreas y del panel de etapas, y su botón de retorno `#lab-return`;
   - la pestaña «Sonda» del inspector lateral y su destino en la búsqueda;
   - su entrada en la herramienta de distancias (en el modo laboratorio por defecto: Tierra–Júpiter);
   - la propagación al arrancar.

   **Se conservan** `src/science/ExperimentalProbe01.js`, el integrador DOPRI54 y sus pruebas (`ProbePropagationAndVisual`, `SpatialRealismAndDistance`).

## Qué misiones usan la escena principal

| Misión | Escena | Motivo |
| --- | --- | --- |
| «Misión completa» heliocéntrica sin satélite (A1–A3 Tierra → Marte) | Sistema Solar principal | Todos los tramos se pueden expresar respecto al Sol |
| Ventanas interplanetarias (Lambert) | Sistema Solar principal | Cónica heliocéntrica |
| «Misión completa» con satélite o descenso (C1/C2 → Europa) | Escena local del Centro de Misión | La escena principal no tiene satélites cargados en la época de la misión (**desde la etapa 23**, C1/C2 se reproducen en el Sistema Solar principal con los satélites galileanos de la ventana del cálculo: [detalle](STAGE23_MAIN_SCENE_MOONS.md)) |
| Tierra–Luna, empuje finito, lanzamiento terrestre | Escena local | A escala del Sistema Solar no se distinguirían de la Tierra |
| Cualquier misión con un planeta sin cobertura en todo el intervalo | Escena local | No se extrapola |

Cuando no procede, el Centro de Misión dice por qué en su mensaje y usa la escena local como antes.

## Datos y fidelidad

- **Sonda:**
  - en cada instante, el estado heliocéntrico que ya calculó la misión (`sampleIntegratedExecution(…, 'helio')` o `sampleInterplanetaryExecution`);
  - sin recalcular ni interpolar entre tramos distintos.
- **Planetas:**
  - la Tierra y el destino salen de la misma ventana de efemérides que usó el cálculo;
  - en los planetas exteriores el destino es el baricentro, igual que en el cálculo;
  - los demás planetas salen de `public/data/interplanetary-ephemerides-catalog-v1.json` (ICRF eclíptico J2000, centro del Sol, TDB);
  - antes de ocupar la escena se comprueba que la cobertura de los ocho cubre la misión entera. Si no, se rechaza con el nombre del planeta.
- **Ejes y escala:**
  - los de la escena principal: `(x,y,z) → (x,z,−y)` y 32 unidades por AU;
  - durante la reproducción se fuerza la escala científica (radios 1:1) para que la órbita de llegada no quede dentro de un planeta ampliado.
- **Nave:**
  - ampliada como antes, y orientada con la antena hacia la Tierra, sin control de actitud;
  - en los tramos cercanos al destino se reduce a 0,1× para no tapar el planeta;
  - el pie de la escena lo declara.
- **Satélites:** ocultos mientras dura la reproducción.
- **Al salir de «3 · Reproducir» o del laboratorio**, la escena vuelve a la fecha de exploración, con sus lunas, su escala y sin la sonda.

## Cámaras

| Cámara | Escena principal |
| --- | --- |
| Vista general | Encuadra la trayectoria, el recorrido de la Tierra y del destino durante toda la misión, y la sonda; el encuadre sigue valiendo mientras avanza la reproducción |
| Seguimiento exterior | La cámara exterior de la escena principal sigue a la sonda |
| Cámara de destino | Cerca del planeta (a unos 4 radios, del lado del Sol y algo por encima), mirando hacia la sonda. Se recalcula en cada fotograma, porque planeta y sonda se mueven, hasta que el usuario arrastra o usa la rueda; entonces el control pasa al usuario. Si la sonda está oculta o dentro del planeta, encuadra el planeta como al explorarlo |

«Desde la sonda» y «Cinematográfica» no existen en esta escena y se ocultan. Las descripciones de la pestaña «Cámaras» cambian según la escena.

Si la ventana de la escena cambia de tamaño de forma apreciable (más de un 12 %: vista inmersiva, panel oculto, giro del móvil), la vista general se recalcula sola. Las otras cámaras ya se recalculan en cada fotograma.

## Correcciones del 20-11-2026 (revisión de los pendientes y análisis integral)

| # | Problema | Corrección |
| --- | --- | --- |
| 1 | Cámara de destino: Marte ocupaba pocos píxeles con la sonda a unos 30 radios | Pose cercana mirando a la sonda (arriba). Medido con la GPU real a 1366×768: cámara a 4,17 radios y disco de Marte de unos 222 px de radio |
| 2 | La vista general no se reencuadraba al entrar en vista inmersiva | `ResizeObserver` sobre la ventana de la escena y `reframe()` en `SolarSystemMissionView` |
| 3 | En Tierra–Luna, la fase de llegada se rotulaba «Llegada al destino (sin captura)» | La clave `arrival` estaba repetida en `PHASE_LABELS` (error anterior a 17.1). La llegada heliocéntrica usa ahora `arrival-helio` |
| 4 | Llevar la línea de tiempo al final no daba «Simulación finalizada» | El control tiene paso de 0,001 s y su máximo no coincide con la duración en coma flotante: se salta al final exacto |
| 5 | El rótulo de A1 prometía «3000 × 100 000 km», pero la órbita calculada es de 315,5 × 100 000 km | El encendido de 4,5 h baja el periapsis apuntado; el cálculo es correcto. Nuevo rótulo «Marte · captura elíptica, apoapsis de 100 000 km». La fase de captura (planeta y satélite) muestra la órbita resultante y el periapsis apuntado |
| 6 | Lector de pantalla: la línea de tiempo se leía en segundos; los cambios de fase no se anunciaban | `aria-valuetext` («X d transcurridos · Y d restantes · fase») y región oculta `#mc-announcer` («Fase: …») |
| 7 | Código sin uso | Restos de la plantilla de Vite; 13 importaciones y variables; una consulta del DOM en cada fotograma; 39 reglas CSS y una entrada de `WorkspaceLayout.js` del panel retirado |

Nada de esto cambia física, constantes, integrador, datos ni modelos. El análisis completo y el plan de mejora propuesto están en [ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md](ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md); el encargo para Gemini, en [STAGE17_1_GEMINI_AUDIT_REQUEST.md](STAGE17_1_GEMINI_AUDIT_REQUEST.md).

## Interfaz

- La proyección se centra en cada fotograma sobre la zona libre de la escena del Centro de Misión: entre la barra de cámaras y la de reproducción, a la derecha de la ficha de fase si hay sitio.
- El lienzo principal y sus rótulos se recortan a la ventana de la escena, borde redondeado incluido. Así no asoman por los huecos entre paneles, y el encuadre acompaña a la ventana si la página se desplaza (móvil).
- Solo los contenedores que llevan hasta la escena dejan pasar el puntero; el resto del laboratorio lo recupera, incluidos:
  - el panel de etapas;
  - la cabecera y las pestañas;
  - el panel lateral;
  - la misión guiada;
  - los diálogos y las barras de la escena.

  En pantallas táctiles se mantiene «Activar control 3D».
- La cabecera, las pestañas y el panel de etapas son opacos en este modo.
- La nota del panel de etapas pasa a `--text-3`, que da contraste de 4,5:1 o más. La auditoría la medía por primera vez al ser el panel opaco.

## Archivos

**Nuevos**

| Archivo | Contenido |
| --- | --- |
| `src/integration/SolarSystemMissionView.js` | Adaptador entre el Centro de Misión y la escena principal |
| `src/lab/MissionProbeSceneModel.js` | Modelo de la sonda para la escena principal |
| `tests/Stage17_1MainScenePlayback.test.mjs` | 11 pruebas |
| `scripts/audit-stage17_1-independent-science.mjs` | Verificación científica independiente de A1 y de las efemérides (31 comprobaciones) |
| `docs/STAGE17_1_MAIN_SCENE_PLAYBACK.md` | Este documento |
| `docs/ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md` | Análisis del proyecto y plan propuesto |
| `docs/STAGE17_1_GEMINI_AUDIT_REQUEST.md` | Encargo de auditoría |

**Modificados**

- **Orquestación:** `src/main.js`.
- **Gráficos:**
  - `src/graphics/SolarSystem.js`: sonda de misión, zona de encuadre, recorte y diagnóstico;
  - `CameraController.js`: vista general por conjunto y cámara de destino;
  - `OverviewFraming.js`;
  - `SpaceProbeVisual.js`: modelo externo y factor de escala.
- **Interfaz:**
  - `src/ui/MissionControlCenter.js`;
  - `ExperimentalLaboratory.js`;
  - `LabStages.js`;
  - `AppNavigator.js`, `CommandPalette.js`, `WorkspaceLayout.js`, `HudControls.js`, `HistoricalModeControls.js`;
  - `DistanceToolControls.js`, `PlanetLabels.js`;
  - estilos `lab-shell.css`, `experimental-laboratory.css` y `theme.css`.
- **Página:** `index.html`.
- **Pruebas:** `tests/Stage16Coherence.test.mjs` y `tests/Stage17LabReorganization.test.mjs` (ahora comprueban la retirada).
- **Verificación:** `scripts/verify-stage17-browser.mjs` (partes nuevas `scene` y `sr`; la de la demostración ahora comprueba su ausencia; `GPU=1` usa la GPU real).
- **Correcciones del 20-11-2026:** `src/lab/IntegratedMission.js` (texto de la órbita resultante), `InterplanetaryPlayback.js` (fase `arrival-helio`), `src/ui/IntegratedMissionPlanner.js` y `LabGuidedMission.js` (rótulo de A1); limpieza en `LaunchCinematicController.js`, `BodyLandingSimulation.js`, `IntegratedMissionPlayback.js`, `LaunchSimulation.js`, `GravitationalDynamics.js`, `PlanetaryEncounter.js`, `HistoricalGuidedTour.js`, `FiniteThrustPlanner.js`, `style.css` y `workspace-layout.css`.

**Eliminados:** `src/ui/MissionControls.js`; restos de la plantilla de Vite `src/counter.js`, `src/assets/hero.png`, `src/assets/javascript.svg`, `src/assets/vite.svg` y `public/icons.svg`.

## Pruebas

`node --test tests/*.test.mjs`: **323/323** (311 en la etapa 17, 318 al cerrar la implementación de 17.1, 322 tras las correcciones del 20-11-2026 y 323 tras 17.1.1). Las pruebas nuevas usan la misión A1 real (Cassini → Marte, calculada como en el planificador) y una escena doble que registra lo que se le pide dibujar. Comprueban:

- los ejes y la escala;
- qué misiones se admiten;
- los ocho planetas en la misma época TDB, con la Tierra y Marte idénticos al cálculo y Júpiter con el catálogo independiente;
- la sonda idéntica a la muestra heliocéntrica;
- la llegada a menos de 2×10⁵ km de Marte;
- las cámaras y la restauración al salir;
- el rechazo sin cobertura y ante un fallo de carga;
- una transferencia de Lambert;
- que la vista general deja dentro de la zona libre todos los cuerpos y, en 41 instantes de la misión, la Tierra, Marte y la sonda;
- la retirada de la Sonda Experimental 01 de la interfaz;
- la conservación del módulo DOPRI54;
- (20-11-2026) que no se repiten claves de fase, que el final de la línea de tiempo es el final exacto, que la cámara de destino queda cerca del planeta mirando a la sonda y se recalcula sola, que la vista general se reencuadra al cambiar el tamaño y el texto de la órbita resultante de A1.

`node scripts/audit-stage17_1-independent-science.mjs`: **31/31** ([JSON](../evidence/stage17_1/independent-science.json)). Rehace A1 con referencias propias (Kepler universal, Lambert por propagación, cohete, vis-viva, hipérbola, esfera de influencia, TDB−UTC) y compara las efemérides 2026–2046 con los elementos de Standish. Es una verificación del implementador, no la auditoría de Gemini.

`npm run build` y `GITHUB_PAGES=true npm run build`: correctos. `git diff --check`: sin incidencias.

## Verificación en navegador (Chrome sin interfaz, SwiftShader)

`node scripts/verify-stage17-browser.mjs scene` (con `EVIDENCE_DIR=evidence/stage17_1`).

En las cuatro resoluciones (1366×768, 390×844, 768×1024 y 1920×1080):

- Cassini → Marte en la escena principal, con el modelo de NASA.
- El centro de la escena llega al lienzo principal.
- Todos los controles visibles comprobados reciben el clic: 29, 13, 14 y 29, ninguno bloqueado.
- El reloj mueve la sonda y los planetas.
- Llegada a 103 351 km del centro de Marte, sin errores.

Además, a 1366×768:

- Cámaras general, exterior y de destino.
- Salir y volver a «3 · Reproducir».
- Al volver a «Sistema Solar», las posiciones de los planetas coinciden exactamente con las de antes (diferencia 0) y se recuperan 10 lunas.
- Tierra–Luna en la escena local, con la explicación.
- Una ventana interplanetaria (Lambert) en la escena principal.

Regresión (`EVIDENCE_DIR=evidence/stage17_1/regresion`):

- **`flow`:** misión guiada completa a 1366 px: cámaras, telemetría coherente con la cabecera, panel oculto, inmersiva, «Simulación finalizada» e invalidación al cambiar de sonda.
- **`tools`:** ensamblaje experimental reproducido con su modelo procedural, herramientas de «Planificar», lanzamiento en la escena local y menú de áreas sin la demostración.
- **`a11y`:** 0 controles sin nombre, ARIA rotos, ocultos enfocables o textos con contraste bajo. Queda un control sin anillo de foco en «Planificar»: el campo de fecha, igual que en la etapa 17.
- **`modes`:** Sistema Solar, histórico Voyager y laboratorio.

Capturas y registros JSON en `evidence/stage17_1/`.

## Revisión con la GPU real (20-11-2026)

`GPU=1 EVIDENCE_DIR=evidence/stage17_1/gpu node scripts/verify-stage17-browser.mjs <parte>` con el código final. Chrome sin interfaz, con la GPU AMD Radeon RX 6650 XT (ANGLE Direct3D 11) en lugar de SwiftShader. **No es una revisión visual por una persona.**

| Parte | Resultado |
| --- | --- |
| `smoke`, `flow`, `auto`, `fleet`, `tools`, `modes` | Sin errores; misión guiada completa, cuatro sondas, herramientas y los tres modos |
| `responsive` | 320, 375, 390, 768, 1280, 1366 y 1920 px: ningún control fuera de pantalla ni recortado, sin desbordamiento horizontal |
| `a11y` | 0 controles sin nombre, id repetidos, referencias ARIA rotas, ocultos enfocables o textos con contraste bajo |
| `scene` | 1366, 390, 768 y 1920 px: 21, 13, 14 y 29 controles reciben el clic; llegada a 103 351 km de Marte. A 1366: cámara de destino a 4,17 radios con el disco de Marte de unos 222 px de radio; la vista general se reencuadra sola al entrar en la vista inmersiva; al salir, planetas idénticos (diferencia 0) y 10 lunas; Tierra–Luna en la escena local; Lambert en la escena principal |
| `sr` (nueva) | Instantáneas del árbol de accesibilidad (`sr_0*.yaml`) de exploración, laboratorio, reproducción y llegada: un `h1`, regiones, escenas 3D con etiqueta, ningún control sin nombre. Durante 6 s de reproducción no hay anuncios por fotograma; al ir al final se anuncian «Fase: Captura en Marte (empuje finito)» y «Simulación finalizada». La línea de tiempo se lee «316.873 d transcurridos · 0 d restantes · Captura en Marte (empuje finito)» |

Rendimiento con la compilación de producción y la GPU real: 176–180 fotogramas por segundo en exploración, Voyager y reproducción ([JSON](../evidence/stage17_1/rendimiento-gpu.json)). La revisión del lector de pantalla es automática: falta probar con NVDA o Narrador.

## Corrección 17.1.1 (tras la auditoría de Claude)

- **D-01:**
  - a ≤ 420 px, la ventana del Sistema Solar principal mide al menos 340 px: quedan 109 px libres entre la barra de cámaras y la de reproducción a 320 y 375 px, frente a 24 px antes;
  - si aun así no hay sitio, se encuadra en toda la ventana (`mainSceneFrameZone`);
  - el lienzo se recorta a la ventana en todos los casos.
- **O-05:** el texto de validación ya no dice que 12G está pendiente.

Detalle y nueva verificación en el [informe](STAGE17_1_AUDIT_CLAUDE.md#8-corrección-puntual-posterior-a-la-auditoría-171).

## Límites y pendientes

- Revisión visual por una persona con GPU; prueba con un lector de pantalla real (NVDA o Narrador); opcionalmente, segunda auditoría de Gemini.
- Observaciones abiertas de la auditoría: O-01, O-02, O-04, O-06 y parte de O-03 ([informe](STAGE17_1_AUDIT_CLAUDE.md)).
- Las misiones con satélite, las geocéntricas y el lanzamiento siguen en la escena local. Mostrarlas en la escena principal exigiría efemérides de satélites en la época de la misión. **Etapa 23:** C1/C2 ya se reproducen en la escena principal con la ventana galileana del cálculo ([detalle](STAGE23_MAIN_SCENE_MOONS.md)).
- En la barra de reproducción, los eventos muy próximos (inserción y fin de la cadena) comparten píxel a escala de toda la misión, como antes.
- En capturas con encendidos largos, el periapsis final difiere del apuntado (A1: 315,5 km frente a 3000 km). El cálculo lo dice, pero no lo compensa: es una propuesta de cambio de modelo ([plan](ANALISIS_INTEGRAL_Y_PLAN_DE_MEJORA.md)).
- La reproducción no certifica una misión operativa: el resultado sigue siendo «según el modelo».
