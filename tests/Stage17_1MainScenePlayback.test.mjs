// 17.1 — «3 · Reproducir» en el Sistema Solar principal y retirada de la Sonda Experimental 01 de la interfaz.
// La misión es la real del escenario A1 (Cassini → Marte), calculada igual que en el planificador. La escena es un doble
// que registra lo que el adaptador le pide dibujar: así se comprueban posiciones, ejes, época y límites sin WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS } from '../src/lab/IntegratedMission.js';
import { createIntegratedExecution, sampleIntegratedExecution, autoContextAt } from '../src/lab/IntegratedMissionPlayback.js';
import { createInterplanetaryExecution, sampleInterplanetaryExecution, deriveInterplanetaryTelemetry } from '../src/lab/InterplanetaryPlayback.js';
import { evaluateTransfer, refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';
import { KM_PER_AU } from '../src/science/Units.js';
import { createSolarSystemMissionView, mainSceneSupport, kmToScene, MAIN_SCENE_PLANETS, NEAR_BODY_PROBE_SCALE, MAIN_SCENE_CAMERA_MODES } from '../src/integration/SolarSystemMissionView.js';
import { FOOT_MAIN_SCENE, mainSceneFrameZone, MAIN_SCENE_MIN_FREE_HEIGHT } from '../src/ui/MissionControlCenter.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const source = file => readFileSync(file, 'utf8');
const fleet = id => ({ ...historicalDesign(id), id: `flota-${id}` });
const interplanetaryCatalog = json('public/data/interplanetary-ephemerides-catalog-v1.json');
const catalog = { catalogVersion: 1, datasets: [...interplanetaryCatalog.datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const loadJson = async file => json(`public/${file}`);
const plannerEphemeris = createInterplanetaryEphemeris({ catalog, loadJson });
// La aplicación crea un proveedor aparte (solo centros de planetas) para los planetas que la misión no cargó.
const sceneEphemeris = createInterplanetaryEphemeris({ catalog: interplanetaryCatalog, loadJson });

// Réplica de IntegratedMissionPlanner.compute() (misma ventana, refinamiento y entrada que en el navegador).
async function runScenario(id, design) {
  const v = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === id)), target = ENCOUNTER_TARGETS[v.destinationId];
  let departureJdTdb = datetimeLocalUtcToJdTdb(v.departureUtc), tofDays = v.tofDays;
  const covE = plannerEphemeris.coverage('399'), covT = plannerEphemeris.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tofDays) + 140;
  const helio = await plannerEphemeris.loadWindow(['399', target.ephemerisId], Math.max(covE.startJdTdb, covT.startJdTdb, departureJdTdb - margin), Math.min(covE.endJdTdb, covT.endJdTdb, departureJdTdb + tofDays + margin + 200));
  if (v.refine) {
    const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb, tofDays, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tofDays), halfSpanTofDays: refinementHalfSpanDays(tofDays) });
    if (Number.isFinite(r.score)) { departureJdTdb = r.departureJdTdb; tofDays = r.tofDays; }
  }
  const mission = computeIntegratedMission(integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb, tofDays }, design), { helio, moons: null });
  return createIntegratedExecution({ result: mission, data: { helio, moons: null }, design });
}

// Doble de createSolarSystem: guarda la última llamada de cada método.
function fakeScene() {
  const calls = [];
  const s = { calls, scale: 'exploratoria', planets: null, probe: null, probeTime: null, factor: 1, trajectory: null, name: null, model: null, moons: null, zone: null, hidden: 0, camera: null, trajectoryShown: null };
  Object.assign(s, {
    modoEscalaActual: () => s.scale,
    establecerModoEscala(mode) { calls.push(['escala', mode]); s.scale = mode; return true; },
    actualizarLunas(states, visible) { s.moons = visible; },
    configurarSondaMision({ nombre, modelo }) { s.name = nombre; s.model = modelo; },
    configurarTrayectoriaSonda(vertices, times) { s.trajectory = { vertices, times }; },
    establecerProveedorZonaEncuadre(fn) { s.zone = fn; },
    actualizarPosiciones(states, options) { s.planets = states; s.positionOptions = options; },
    actualizarEstadoSonda(position, t) { s.probe = position; s.probeTime = t; },
    establecerFactorEscalaSonda(f) { s.factor = f; },
    mostrarTrayectoriaSonda(v) { s.trajectoryShown = v; },
    ocultarSonda() { s.hidden++; s.probe = null; },
    enfocarSonda() { s.camera = 'sonda'; return true; },
    encuadrarDestinoConSonda(name) { s.camera = `destino:${name}`; return true; },
    encuadrarConjuntoMision(provider) { s.camera = 'conjunto'; s.overview = provider; return true; },
    vistaGeneral() { s.camera = 'general'; }
  });
  return s;
}
const close = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} frente a ${b}`);
const closeVec = (a, b, tol, label) => { for (const k of ['x', 'y', 'z']) close(a[k], b[k], tol, `${label}.${k}`); };

const cassini = fleet('cassini');
const missionA1 = runScenario('A1', cassini);

test('17.1: conversión de ejes de la escena principal (x,y,z) → (x,z,−y) a 32 unidades por AU, también con vectores [x,y,z]', () => {
  const p = kmToScene([KM_PER_AU, 2 * KM_PER_AU, 3 * KM_PER_AU]);
  closeVec(p, { x: 32, y: 96, z: -64 }, 1e-9, 'escena');
  closeVec(kmToScene({ x: KM_PER_AU, y: 2 * KM_PER_AU, z: 3 * KM_PER_AU }), p, 0, 'objeto');
});

test('17.1: qué misiones se dibujan en el Sistema Solar principal y cuáles siguen en la escena local', async () => {
  const execution = await missionA1;
  assert.equal(mainSceneSupport(execution).ok, true, 'Cassini → Marte (misión completa)');
  for (const kind of ['launch', 'mission', 'finite-thrust', 'landing']) {
    const r = mainSceneSupport({ kind });
    assert.equal(r.ok, false, kind); assert.match(r.reason, /escena local/);
  }
  const withMoon = { ...execution, mission: { ...execution.mission, moonId: '502', moonName: 'Europa' } };
  assert.match(mainSceneSupport(withMoon).reason, /Europa/);
  assert.deepEqual([...MAIN_SCENE_CAMERA_MODES], ['overview', 'exterior', 'destination']);
  assert.ok(FOOT_MAIN_SCENE.length <= 240, 'pie breve: cabe sobre la barra de reproducción');
  assert.match(FOOT_MAIN_SCENE, /1:1/); assert.match(FOOT_MAIN_SCENE, /sin extrapolar/); assert.match(FOOT_MAIN_SCENE, /nave ampliada/);
});

test('17.1: Cassini → Marte en la escena principal: ocho planetas y la sonda en la misma época TDB, con los estados del cálculo', async () => {
  const execution = await missionA1;
  assert.match(execution.mission.verdict, /^CADENA CALCULADA COMPLETA/);
  const scene = fakeScene();
  let released = 0, models = [];
  const view = createSolarSystemMissionView({ scene, loadEphemeris: async () => sceneEphemeris, onRelease: () => released++, onModel: status => models.push(status),
    createModel: design => ({ object: { name: `modelo-${design.name}` }, ready: Promise.resolve('nasa'), dispose() {} }) });
  const prepared = await view.prepare(execution, { name: cassini.name });
  assert.deepEqual(prepared, { ok: true });
  assert.equal(scene.planets, null, 'preparar no ocupa la escena mientras el Centro de Misión no está visible');
  view.setVisible(true);
  assert.equal(view.isControlling(), true);
  assert.deepEqual(scene.calls[0], ['escala', 'cientifica'], 'radios 1:1 durante la reproducción');
  assert.equal(scene.moons, false, 'sin satélites de otra época');
  assert.equal(scene.name, 'Cassini'); assert.equal(scene.model.name, 'modelo-Cassini');
  assert.equal(scene.trajectoryShown, true); assert.equal(scene.camera, 'conjunto', 'vista general de la misión');
  // La vista general encuadra la trayectoria muestreada, el recorrido de la Tierra y de Marte durante la misión y la sonda.
  const overview = scene.overview(), jdStart = execution.mission.departureJdTdb, jdEnd = jdStart + execution.durationSeconds / 86400;
  assert.ok(overview.length >= 100 && overview.length <= 160, `${overview.length} discos`);
  for (const id of ['399', '499']) for (const jd of [jdStart, jdEnd]) {
    const p = kmToScene(execution.data.helio.stateAt(id, jd).positionKm);
    assert.ok(overview.some(b => b.radio > 0.1 && Math.abs(b.x - p.x) < 1e-9 && Math.abs(b.z - p.z) < 1e-9), `${id} en JD ${jd}`);
  }
  assert.ok(overview.some(b => b.radio > 0.1 && b.x === scene.probe.x && b.z === scene.probe.z), 'sonda');
  const trajectory = execution.contexts.helio.transfer.trajectory;
  assert.equal(scene.trajectory.times.length, trajectory.length);
  closeVec({ x: scene.trajectory.vertices[0], y: scene.trajectory.vertices[1], z: scene.trajectory.vertices[2] }, kmToScene(trajectory[0].positionKm), 1e-5, 'primer vértice');
  assert.deepEqual(Object.keys(scene.planets).sort(), MAIN_SCENE_PLANETS.map(([name]) => name).sort());
  const helio = execution.data.helio, jd0 = execution.mission.departureJdTdb;
  for (const t of [0, execution.durationSeconds * 0.37, execution.durationSeconds]) {
    view.setTime(t);
    const jd = jd0 + t / 86400;
    assert.equal(view.getState().error, null);
    assert.equal(scene.positionOptions.reencuadrarVista, false);
    for (const p of Object.values(scene.planets)) close(p.jdTdb, jd, 1e-9, 'época de cada planeta');
    // La Tierra y Marte son los mismos cuerpos y la misma ventana que usó el cálculo.
    closeVec(scene.planets.Tierra.posicionEscena, kmToScene(helio.stateAt('399', jd).positionKm), 1e-12, 'Tierra');
    closeVec(scene.planets.Marte.posicionEscena, kmToScene(helio.stateAt('499', jd).positionKm), 1e-12, 'Marte');
    // Los demás, con las efemérides interplanetarias independientes en la misma época.
    const jupiter = (await sceneEphemeris.loadWindow(['599'], jd, jd)).stateAt('599', jd);
    closeVec(scene.planets.Jupiter.posicionEscena, kmToScene(jupiter.positionKm), 1e-9, 'Júpiter');
    closeVec(scene.probe, kmToScene(sampleIntegratedExecution(execution, t, 'helio').positionKm), 1e-12, 'Cassini');
    assert.equal(scene.factor, autoContextAt(execution, t) === 'helio' ? 1 : NEAR_BODY_PROBE_SCALE);
  }
  // Al final la sonda está en órbita de Marte: a menos de 2×10⁵ km de su centro y fuera del planeta.
  const dKm = Math.hypot(scene.probe.x - scene.planets.Marte.posicionEscena.x, scene.probe.y - scene.planets.Marte.posicionEscena.y, scene.probe.z - scene.planets.Marte.posicionEscena.z) / 32 * KM_PER_AU;
  assert.ok(dKm > 3390 && dKm < 2e5, `distancia a Marte ${dKm} km`);
  assert.equal(scene.factor, NEAR_BODY_PROBE_SCALE, 'nave reducida cerca de Marte');
  for (const mode of ['exterior', 'destination', 'overview']) view.setCameraMode(mode);
  assert.equal(view.setCameraMode('onboard'), false, 'sin cámara a bordo en la escena principal');
  view.setCameraMode('destination'); assert.equal(scene.camera, 'destino:Marte');
  view.setCameraMode('exterior'); assert.equal(scene.camera, 'sonda');
  // Al cambiar el tamaño de la ventana de la escena solo se recalcula la vista general; las otras cámaras se siguen solas.
  view.reframe(); assert.equal(scene.camera, 'sonda', 'reframe no cambia la cámara exterior');
  view.setCameraMode('overview'); scene.camera = 'movida por el usuario'; view.reframe();
  assert.equal(scene.camera, 'conjunto', 'reframe recalcula la vista general');
  view.setCameraMode('exterior');
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(models, ['cargando', 'nasa']);
  view.setVisible(false);
  assert.equal(view.isControlling(), false); assert.equal(released, 1);
  assert.equal(scene.scale, 'exploratoria', 'se restaura la escala anterior'); assert.equal(scene.hidden, 1); assert.equal(scene.zone, null);
  assert.equal(scene.name, 'Sonda'); assert.equal(scene.model, null); assert.equal(scene.factor, 1);
  view.setVisible(false); assert.equal(released, 1, 'ocultar dos veces no repite la restauración');
  view.setVisible(true); assert.equal(view.isControlling(), true, 'al volver a «3 · Reproducir» se recupera la misión');
  view.clear(); assert.equal(view.isControlling(), false); assert.equal(released, 2); assert.equal(view.getState().ready, false);
});

test('17.1: sin cobertura completa de algún planeta no se usa la escena principal (no se extrapola)', async () => {
  const execution = await missionA1;
  const scene = fakeScene();
  const shortCoverage = { coverage: id => (id === '899' ? { startJdTdb: 2461362.5, endJdTdb: 2461400.5 } : sceneEphemeris.coverage(id)), loadWindow: sceneEphemeris.loadWindow };
  const view = createSolarSystemMissionView({ scene, loadEphemeris: async () => shortCoverage });
  const result = await view.prepare(execution);
  assert.equal(result.ok, false); assert.match(result.reason, /Neptuno/); assert.match(result.reason, /no extrapola/);
  view.setVisible(true);
  assert.equal(view.isControlling(), false); assert.equal(scene.planets, null);
  // Un fallo de carga tampoco ocupa la escena.
  const failing = createSolarSystemMissionView({ scene, loadEphemeris: async () => { throw Error('HTTP 404'); } });
  assert.match((await failing.prepare(execution)).reason, /HTTP 404/);
});

test('17.1: una transferencia de Lambert (ventanas interplanetarias) también se dibuja en la escena principal', async () => {
  const window = await sceneEphemeris.loadWindow(['399', '499'], 2462050.5, 2462500.5);
  const result = evaluateTransfer(window, { originId: '399', destinationId: '499', departureJdTdb: 2462105.5, arrivalJdTdb: 2462105.5 + 210 });
  // createInterplanetaryExecution rechaza oportunidades no calculadas: si llega aquí, la transferencia es reproducible.
  const execution = createInterplanetaryExecution({ result, window, design: cassini, name: 'Lambert' });
  const scene = fakeScene();
  const view = createSolarSystemMissionView({ scene, loadEphemeris: async () => sceneEphemeris });
  assert.deepEqual(await view.prepare(execution), { ok: true });
  view.setVisible(true); view.setTime(execution.durationSeconds / 2);
  const jd = result.departureJdTdb + execution.durationSeconds / 2 / 86400;
  closeVec(scene.planets.Marte.posicionEscena, kmToScene(window.stateAt('499', jd).positionKm), 1e-12, 'Marte');
  assert.equal(scene.factor, 1);
  assert.equal(view.getState().destination, 'Marte');
  // La llegada heliocéntrica tiene su propia fase: no comparte identificador con la aproximación Tierra–Luna.
  assert.equal(deriveInterplanetaryTelemetry(execution, sampleInterplanetaryExecution(execution, execution.durationSeconds)).phase, 'arrival-helio');
  // 17.1.1 (O-05 de la auditoría): 12G está aprobada; el texto de validación que ve el usuario no puede decir lo contrario.
  assert.match(deriveInterplanetaryTelemetry(execution, sampleInterplanetaryExecution(execution, 0)).validation, /^12G aprobada en auditoría independiente/);
});

test('17.1: las etiquetas de fase del Centro de Misión no repiten clave (la segunda pisaría a la primera)', () => {
  const source = readFileSync(new URL('../src/ui/MissionControlCenter.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('const PHASE_LABELS'), source.indexOf('});', source.indexOf('const PHASE_LABELS')));
  const keys = [...block.matchAll(/(?:^|[{,]\s*)(?:'([^']+)'|([A-Za-z][\w-]*))\s*:/g)].map(m => m[1] ?? m[2]);
  assert.ok(keys.includes('arrival') && keys.includes('arrival-helio'));
  assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
});

test('17.1: la Sonda Experimental 01 ya no aparece en la interfaz; DOPRI54 y su módulo se conservan', () => {
  const html = source('index.html');
  assert.doesNotMatch(html, /Sonda Experimental 01/); assert.doesNotMatch(html, /id="mission-panel"/);
  assert.equal(existsSync('src/ui/MissionControls.js'), false, 'el panel de la sonda demostrativa se retiró');
  const main = source('src/main.js');
  assert.doesNotMatch(main, /ExperimentalProbe01|MissionControls|propagateExperimentalProbe01/);
  assert.match(main, /createSolarSystemMissionView\(/); assert.match(main, /createExperimentalLaboratory\(\{ missionScene: vistaMisionLaboratorio \}\)/);
  const lab = source('src/ui/ExperimentalLaboratory.js'), center = source('src/ui/MissionControlCenter.js');
  for (const text of [lab, center, source('src/ui/AppNavigator.js'), source('src/ui/WorkspaceLayout.js'), source('src/ui/DistanceToolControls.js'), source('src/ui/PlanetLabels.js'), source('src/ui/HudControls.js')]) {
    assert.doesNotMatch(text, /data-lab-action="orbital"|'Sonda Experimental 01'|experimental-probe|lab-return/);
  }
  assert.match(center, /sceneView\.setTime\(position\.elapsedSeconds\)/, 'el reloj del Centro de Misión mueve la escena principal');
  assert.match(source('src/ui/lab-shell.css'), /\[data-lab-scene="main"\] \.scene-panel > #solar-system \{ visibility:visible; pointer-events:auto; \}/);
  // Conservado: módulo científico y su prueba de propagación.
  assert.ok(existsSync('src/science/ExperimentalProbe01.js'));
  assert.match(source('tests/ProbePropagationAndVisual.test.mjs'), /DOPRI54 vs RK4/);
});

test('17.1: la vista general de la misión deja la trayectoria, la Tierra, el destino y la sonda dentro de la zona libre', async () => {
  const THREE = await import('three');
  const { calcularEncuadreVista } = await import('../src/graphics/OverviewFraming.js');
  const execution = await missionA1;
  const scene = fakeScene();
  const view = createSolarSystemMissionView({ scene, loadEphemeris: async () => sceneEphemeris });
  await view.prepare(execution); view.setVisible(true); view.setTime(execution.durationSeconds * 0.4);
  const bodies = scene.overview().map(c => ({ posicion: new THREE.Vector3(c.x, c.y, c.z), radio: c.radio }));
  // Zona libre de 1366×768: el área de la escena del Centro de Misión a la derecha de la ficha de telemetría.
  const camera = new THREE.PerspectiveCamera(45, 1366 / 704, 0.0001, 20000);
  const zona = { width: 1366, height: 704, left: 565, right: 1029, top: 272, bottom: 593 };
  const { posicion, objetivo } = calcularEncuadreVista(camera, new Map(), zona, { cuerpos: bodies });
  camera.position.copy(posicion); camera.lookAt(objetivo); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const inside = (v, label) => {
    const p = v.clone().project(camera), x = (p.x + 1) / 2 * zona.width, y = (1 - p.y) / 2 * zona.height;
    assert.ok(x >= zona.left - 1 && x <= zona.right + 1 && y >= zona.top - 1 && y <= zona.bottom + 1, `${label} fuera de la zona: ${x.toFixed(0)}, ${y.toFixed(0)}`);
  };
  for (const body of [{ posicion: new THREE.Vector3() }, ...bodies]) inside(body.posicion, 'disco');
  // El encuadre sigue valiendo mientras avanza la reproducción: la Tierra, Marte y la sonda en cualquier instante.
  for (let k = 0; k <= 40; k++) {
    view.setTime(execution.durationSeconds * k / 40);
    for (const p of [scene.planets.Tierra.posicionEscena, scene.planets.Marte.posicionEscena, scene.probe]) inside(new THREE.Vector3(p.x, p.y, p.z), `instante ${k}/40`);
  }
});

test('17.1: línea de tiempo al final = final exacto del cálculo; valor legible y fases anunciadas para lectores de pantalla', () => {
  const center = source('src/ui/MissionControlCenter.js');
  // El control usa paso de 0,001 s: su valor máximo no coincide con la duración en coma flotante. Se salta al final exacto.
  assert.match(center, /clock\.seek\(max - value < 0\.0015 \? max : value\)/);
  // El lector de pantalla oye «X d transcurridos · Y d restantes · fase» en lugar de los segundos en bruto.
  assert.match(center, /setAttribute\('aria-valuetext'/);
  // Región oculta (sr-only) que anuncia los cambios de fase; no se anuncia la preparación inicial.
  assert.match(center, /id="mc-announcer" class="sr-only" role="status" aria-live="polite"/);
  assert.match(center, /if \(hudPhase && phase\) \$\('#mc-announcer'\)\.textContent = `Fase: \$\{phase\}`/);
});

test('17.1: cámara de destino recalculada en cada fotograma hasta que el usuario toma el control; la vista general se reencuadra al cambiar la ventana', () => {
  const camera = source('src/graphics/CameraController.js'), view = source('src/integration/SolarSystemMissionView.js'), center = source('src/ui/MissionControlCenter.js');
  // Pose a unos 4 radios del planeta, del lado del Sol, mirando hacia la sonda; solo encuadre.
  assert.match(camera, /function poseMiradaDestino\(nombre\)/);
  assert.match(camera, /addScaledVector\(haciaSonda, -3\.2 \* radio\)/);
  // Arrastrar o usar la rueda devuelve el control al usuario.
  assert.match(camera, /function cancelarTransicionInteractiva\(\) \{\n    miradaDestino = null;/);
  // Cambio de tamaño de la ventana de la escena (vista inmersiva, panel oculto): solo se recalcula la vista general.
  assert.match(view, /reframe\(\) \{ if \(controlling && prepared && cameraMode === 'overview'\)/);
  assert.match(center, /new ResizeObserver/);
  assert.match(center, /stageObserver\?\.disconnect\(\)/);
});

test('17.1: la captura muestra la órbita resultante; A1 no promete un periapsis que el encendido largo no conserva', async () => {
  const execution = await missionA1, capture = execution.mission.phases.find(p => p.id === 'capture');
  const orbit = execution.mission.maneuvers.at(-1).orbitAfter;
  // El cálculo no cambia: el apoapsis es el objetivo (100 000 km) y el periapsis baja de 3000 a ~315,5 km durante 4,5 h de encendido.
  assert.ok(Math.abs(orbit.apoapsisAltitudeKm - 100000) < 1 && Math.abs(orbit.periapsisAltitudeKm - 315.55) < 0.1, JSON.stringify(orbit));
  assert.match(capture.detail, /Órbita resultante: 316 × 100 000 km de altitud \(periapsis apuntado 3 000 km; el encendido de 4\.5 h lo desplaza\)\./);
  const a1 = INTEGRATED_SCENARIOS.find(s => s.id === 'A1');
  assert.equal(a1.label, 'Marte · captura elíptica, apoapsis de 100 000 km');
  assert.match(source('src/ui/LabGuidedMission.js'), /«Marte · captura elíptica, apoapsis de 100 000 km»/);
});

test('17.1.1 (D-01 de la auditoría): la zona libre de la escena principal en la ventana del Centro de Misión, con rectángulos medidos en Chrome', () => {
  const canvas = { left: 0, top: 0, right: 320, bottom: 568 };
  // 320×568 antes de la corrección: ventana de 255 px, cámaras en dos filas y reproducción abajo → 24 px entre barras.
  const narrow = mainSceneFrameZone({ stage: { top: 110, bottom: 365, left: 7, right: 313, height: 255 }, bar: { top: 155, bottom: 222, height: 67 },
    transport: { top: 262, bottom: 306, height: 44 }, canvas, radius: 12 });
  assert.deepEqual([narrow.top, narrow.bottom], [118, 357], 'sin sitio entre las barras: se encuadra en toda la ventana');
  assert.ok(narrow.bottom - narrow.top >= 80 && narrow.right - narrow.left >= 80, 'zona aceptable para SolarSystem (≥ 80 px)');
  assert.deepEqual(narrow.recorte, { top: 110, right: 7, bottom: 203, left: 7, radius: 12 }, 'el lienzo se recorta a la ventana');
  // Con la ventana de 340 px (CSS de 17.1.1) quedan 109 px entre las barras: se usa esa franja.
  const fixed = mainSceneFrameZone({ stage: { top: 110, bottom: 450, left: 7, right: 313, height: 340 }, bar: { top: 155, bottom: 222, height: 67 },
    transport: { top: 347, bottom: 391, height: 44 }, canvas, radius: 12 });
  assert.deepEqual([fixed.top, fixed.bottom], [230, 339]);
  assert.ok(fixed.bottom - fixed.top >= MAIN_SCENE_MIN_FREE_HEIGHT);
  // Escritorio: a la derecha de la ficha de fase si quedan ≥ 380 px; coordenadas relativas al lienzo.
  const desk = mainSceneFrameZone({ stage: { top: 120, bottom: 700, left: 300, right: 1100, height: 580 }, bar: { top: 165, bottom: 200, height: 35 },
    transport: { top: 640, bottom: 684, height: 44 }, hud: { right: 560, width: 240 }, canvas: { left: 0, top: 50, right: 1366, bottom: 768 } });
  assert.deepEqual([desk.left, desk.right, desk.top, desk.bottom], [596, 1084, 158, 582]);
  assert.match(source('src/ui/experimental-laboratory.css'), /#lab-mission-center\[data-scene="main"\] \.mc-stage \{ min-height:340px; \}/);
});
