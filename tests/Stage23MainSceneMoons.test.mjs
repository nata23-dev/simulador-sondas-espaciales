// Etapa 23 · Satélites en la escena principal: Ío, Europa, Ganímedes y Calisto de la ventana de Horizons de la misión C1
// (Júpiter y sobrevuelo de Europa) en el Sistema Solar principal. La escena es un doble que registra lo que el adaptador le pide
// dibujar; la colocación de los satélites se recalcula aquí con la fórmula de MoonVisuals y se compara con la posición
// heliocéntrica obtenida directamente de las filas de Horizons (nudos exactos) y del baricentro de Júpiter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS, sampleSegmentNative } from '../src/lab/IntegratedMission.js';
import { createIntegratedExecution, autoContextAt } from '../src/lab/IntegratedMissionPlayback.js';
import { refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { createPlanetocentricWindow } from '../src/science/PlanetocentricWindow.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';
import { KM_PER_AU } from '../src/science/Units.js';
import { createSolarSystemMissionView, mainSceneSupport, moonSceneStates, kmToScene, MAIN_SCENE_MOONS, NEAR_BODY_PROBE_SCALE, NEAR_MOON_PROBE_SCALE } from '../src/integration/SolarSystemMissionView.js';
import { FOOT_MAIN_SCENE, mainSceneFoot } from '../src/ui/MissionControlCenter.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const MOON_FILE = 'public/data/interplanetary/galilean-moons-jsb-2031-2032.json';
const moonJson = json(MOON_FILE);
const interplanetaryCatalog = json('public/data/interplanetary-ephemerides-catalog-v1.json');
const catalog = { catalogVersion: 1, datasets: [...interplanetaryCatalog.datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const loadJson = async file => json(`public/${file}`);
const plannerEphemeris = createInterplanetaryEphemeris({ catalog, loadJson });
const sceneEphemeris = createInterplanetaryEphemeris({ catalog: interplanetaryCatalog, loadJson });
const norm = a => Math.hypot(a[0], a[1], a[2]);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// Réplica de IntegratedMissionPlanner.compute() con la ventana de satélites que carga el planificador.
async function runScenario(id, probe) {
  const v = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === id)), target = ENCOUNTER_TARGETS[v.destinationId];
  let departureJdTdb = datetimeLocalUtcToJdTdb(v.departureUtc), tofDays = v.tofDays;
  const covE = plannerEphemeris.coverage('399'), covT = plannerEphemeris.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tofDays) + 140;
  const helio = await plannerEphemeris.loadWindow(['399', target.ephemerisId], Math.max(covE.startJdTdb, covT.startJdTdb, departureJdTdb - margin), Math.min(covE.endJdTdb, covT.endJdTdb, departureJdTdb + tofDays + margin + 200));
  if (v.refine) {
    const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb, tofDays, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tofDays), halfSpanTofDays: refinementHalfSpanDays(tofDays) });
    if (Number.isFinite(r.score)) { departureJdTdb = r.departureJdTdb; tofDays = r.tofDays; }
  }
  const moons = v.moonId ? createPlanetocentricWindow(moonJson) : null;
  const design = { ...historicalDesign(probe), id: `flota-${probe}` };
  const mission = computeIntegratedMission(integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb, tofDays }, design), { helio, moons });
  return createIntegratedExecution({ result: mission, data: { helio, moons }, design });
}

function fakeScene() {
  const s = { scale: 'exploratoria', planets: null, probe: null, factor: 1, moonStates: null, moonsVisible: null, moonCalls: 0, camera: null };
  Object.assign(s, {
    modoEscalaActual: () => s.scale, establecerModoEscala(mode) { s.scale = mode; return true; },
    actualizarLunas(states, visible) { s.moonStates = states; s.moonsVisible = visible; s.moonCalls++; },
    configurarSondaMision() {}, configurarTrayectoriaSonda() {}, establecerProveedorZonaEncuadre() {},
    actualizarPosiciones(states) { s.planets = states; }, actualizarEstadoSonda(position) { s.probe = position; },
    establecerFactorEscalaSonda(f) { s.factor = f; }, mostrarTrayectoriaSonda() {}, ocultarSonda() { s.probe = null; },
    enfocarSonda() { s.camera = 'sonda'; return true; }, encuadrarDestinoConSonda(name) { s.camera = `destino:${name}`; return true; },
    encuadrarConjuntoMision() { s.camera = 'conjunto'; return true; }, vistaGeneral() { s.camera = 'general'; }
  });
  return s;
}
// Colocación de MoonVisuals: posición del cuerpo padre + desplazamiento con la conversión de ejes (x, z, −y).
const moonScenePosition = (parent, offset) => ({ x: parent.x + offset[0], y: parent.y + offset[2], z: parent.z - offset[1] });
const closeVec = (a, b, tol, label) => { for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(a[k] - b[k]) <= tol, `${label}.${k}: ${a[k]} frente a ${b[k]}`); };

const c1 = runScenario('C1', 'cassini');
const a1 = runScenario('A1', 'cassini');
// Instante de máxima aproximación a Europa dentro del tramo de satélite.
async function flyby() {
  const ex = await c1, seg = ex.mission.segments.find(s => s.centralBodyId === ex.mission.moonId);
  let best = null;
  for (let i = 0; i <= 2000; i++) { const t = seg.startSeconds + (seg.endSeconds - seg.startSeconds) * i / 2000, r = norm(sampleSegmentNative(seg, t).positionKm); if (!best || r < best.r) best = { t, r }; }
  return { ex, seg, ...best };
}

test('23 · qué misiones con satélite se dibujan en el Sistema Solar principal', async () => {
  const ex = await c1, a = await a1;
  assert.match(ex.mission.verdict, /^CADENA CALCULADA COMPLETA/);
  assert.equal(ex.mission.moonId, '502');
  assert.deepEqual(mainSceneSupport(ex), { ok: true }, 'C1 con Cassini: Júpiter y sobrevuelo de Europa');
  assert.deepEqual(mainSceneSupport(a), { ok: true }, 'A1 sin satélite: igual que en 17.1');
  // Sin la ventana de satélites, con otra luna o con una ventana centrada en otro punto: escena local, con el motivo.
  const noWindow = { ...ex, data: { ...ex.data, moons: null } };
  assert.match(mainSceneSupport(noWindow).reason, /Europa.*ventana de Horizons/);
  const otherCenter = { ...ex, data: { ...ex.data, moons: { ...ex.data.moons, centerId: '599', coverage: ex.data.moons.coverage } } };
  assert.equal(mainSceneSupport(otherCenter).ok, false);
  const notGalilean = { ...ex, mission: { ...ex.mission, moonId: '606', moonName: 'Titán' } };
  assert.match(mainSceneSupport(notGalilean).reason, /Titán/);
  const landing = { ...ex, contexts: { ...ex.contexts, landing: {} } };
  assert.match(mainSceneSupport(landing).reason, /descenso/);
});

test('23 · estados de los satélites: nudos de Horizons exactos, centro en el baricentro de Júpiter y nada fuera de la ventana', async () => {
  const ex = await c1, body = moonJson.bodies.Europa;
  assert.equal(moonJson.centerId, '5'); assert.equal(ex.mission.target.ephemerisId, '5');
  const row = body.rows[1234], jd = row[0];
  const states = moonSceneStates(ex, jd);
  assert.deepEqual(Object.keys(states).sort(), [...MAIN_SCENE_MOONS].sort());
  // En un nudo, el desplazamiento es la fila de Horizons a 32 unidades por AU (ejes eclípticos, sin convertir todavía).
  const k = 32 / KM_PER_AU, off = states.Europa.positionSceneOffset;
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(off[i] - row[1 + i] * k) < 1e-12, `componente ${i}`);
  assert.equal(states.Europa.bodyId, '502'); assert.equal(states.Europa.centerId, '5');
  // Con la fórmula de MoonVisuals, la posición en la escena es la heliocéntrica (baricentro + fila) convertida a la escena.
  const bary = ex.data.helio.stateAt('5', jd).positionKm;
  closeVec(moonScenePosition(kmToScene(bary), off), kmToScene(add(bary, row.slice(1, 4))), 1e-9, 'Europa');
  // Fuera de la ventana adquirida: ningún satélite (no se extrapola).
  const start = body.rows[0][0], end = body.rows.at(-1)[0];
  assert.deepEqual(moonSceneStates(ex, start - 0.01), {});
  assert.deepEqual(moonSceneStates(ex, end + 0.01), {});
  assert.deepEqual(moonSceneStates(ex, ex.mission.departureJdTdb), {}, 'la salida de 2028 queda fuera de la ventana 2031–2032');
  // Misiones sin satélite: ninguno.
  assert.deepEqual(moonSceneStates(await a1, jd), {});
});

test('23 · reproducción de C1 en la escena principal: Europa y la nave en el mismo marco durante el sobrevuelo', async () => {
  const { ex, seg, t, r } = await flyby();
  assert.ok(r > 1560.8 && r < 2000, `máxima aproximación ${r} km del centro de Europa`);
  const scene = fakeScene(); let released = 0;
  const view = createSolarSystemMissionView({ scene, loadEphemeris: async () => sceneEphemeris, onRelease: () => released++ });
  assert.deepEqual(await view.prepare(ex, { name: 'Cassini' }), { ok: true });
  view.setVisible(true);
  // Salida (2028): ventana de satélites aún no cubierta → ninguno dibujado; la nave a tamaño de crucero.
  assert.deepEqual(scene.moonStates, {}); assert.equal(scene.factor, 1);
  let st = view.getState();
  assert.equal(st.moon, 'Europa'); assert.deepEqual(st.moonsShown, []);
  assert.deepEqual(st.moonCoverage, { startJdTdb: moonJson.bodies.Europa.rows[0][0], endJdTdb: moonJson.bodies.Europa.rows.at(-1)[0] });
  // Cámara de destino en crucero: Júpiter.
  view.setCameraMode('destination'); assert.equal(scene.camera, 'destino:Jupiter');
  // Máxima aproximación: los cuatro satélites visibles y Europa a la distancia calculada de la nave.
  view.setTime(t);
  assert.equal(autoContextAt(ex, t), 'moon');
  assert.equal(scene.moonsVisible, true);
  assert.deepEqual(Object.keys(scene.moonStates).sort(), [...MAIN_SCENE_MOONS].sort());
  assert.equal(scene.factor, NEAR_MOON_PROBE_SCALE);
  assert.equal(scene.camera, 'destino:Europa', 'la cámara de destino pasa a Europa en su fase');
  const europa = moonScenePosition(scene.planets.Jupiter.posicionEscena, scene.moonStates.Europa.positionSceneOffset);
  const dKm = Math.hypot(scene.probe.x - europa.x, scene.probe.y - europa.y, scene.probe.z - europa.z) * KM_PER_AU / 32;
  assert.ok(Math.abs(dKm - r) < 1e-3 * r, `nave–Europa en la escena ${dKm} km frente a ${r} km del tramo calculado`);
  st = view.getState();
  assert.equal(st.cameraFocus, 'Europa'); assert.equal(st.moonsShown.length, 4); assert.equal(st.error, null);
  // Tras el sobrevuelo (tramo centrado en Júpiter): la cámara vuelve a Júpiter y la nave al factor cercano al planeta.
  view.setTime(seg.endSeconds + 3600);
  assert.equal(autoContextAt(ex, seg.endSeconds + 3600), 'planet');
  assert.equal(scene.camera, 'destino:Jupiter'); assert.equal(scene.factor, NEAR_BODY_PROBE_SCALE);
  // Otra cámara: el cambio de fase ya no la mueve.
  view.setCameraMode('exterior'); view.setTime(t); assert.equal(scene.camera, 'sonda');
  // Al soltar la escena, los satélites de la misión se ocultan y la aplicación restaura los suyos.
  view.setVisible(false);
  assert.equal(scene.moonsVisible, false); assert.equal(released, 1);
});

test('23 · ficha del satélite en la época de la misión y sin datos fuera de la reproducción', async () => {
  const { ex, t } = await flyby();
  const view = createSolarSystemMissionView({ scene: fakeScene(), loadEphemeris: async () => sceneEphemeris });
  assert.deepEqual(await view.prepare(ex, { name: 'Cassini' }), { ok: true });
  assert.equal(view.moonInfoState('Europa'), null, 'sin ocupar la escena no hay estado');
  view.setVisible(true); view.setTime(t);
  const info = view.moonInfoState('Europa'), jd = ex.mission.departureJdTdb + t / 86400;
  assert.ok(Math.abs(info.jdTdb - jd) < 1e-9);
  assert.ok(Math.abs(info.distanceKm - norm(ex.data.moons.stateAt('Europa', jd).positionKm)) < 1e-6);
  assert.match(info.status, /ventana de la misión.*baricentro/);
  view.setTime(10 * 86400);
  assert.equal(view.moonInfoState('Europa'), null, '2028: fuera de la ventana de satélites');
  assert.equal(view.moonInfoState('Luna'), null);
});

test('23 · los cuerpos de la misión se comprueban con su propia ventana: sin cobertura al final, no se extrapola', async () => {
  const ex = await c1, endJd = ex.mission.departureJdTdb + ex.durationSeconds / 86400;
  // La ventana del cálculo trae el baricentro de Júpiter (5), que el proveedor de la escena no tiene: con ella, C1 se prepara.
  assert.equal(sceneEphemeris.coverage('5'), null);
  const view = createSolarSystemMissionView({ scene: fakeScene(), loadEphemeris: async () => sceneEphemeris });
  assert.equal((await view.prepare(ex)).ok, true);
  // Si esa ventana no llegara al final de la misión, la escena principal no se usa.
  const helio = ex.data.helio, cut = { ...ex, data: { ...ex.data, helio: { ...helio, stateAt: (id, jd) => (id === '5' && jd > endJd - 1 ? { status: 'unavailable' } : helio.stateAt(id, jd)) } } };
  const r = await view.prepare(cut);
  assert.equal(r.ok, false); assert.match(r.reason, /no se extrapola/);
});

test('23 · A1 sin satélite: la escena principal oculta los satélites como en 17.1', async () => {
  const scene = fakeScene(), view = createSolarSystemMissionView({ scene, loadEphemeris: async () => sceneEphemeris });
  const ex = await a1;
  assert.deepEqual(await view.prepare(ex, { name: 'Cassini' }), { ok: true });
  view.setVisible(true); view.setTime(ex.durationSeconds * 0.99);
  assert.equal(scene.moonsVisible, false); assert.deepEqual(scene.moonStates, {});
  assert.equal(view.getState().moon, null);
  view.setCameraMode('destination'); assert.equal(scene.camera, 'destino:Marte');
});

test('23 · pie de la escena principal: ventana de los satélites, sin extrapolar y breve', () => {
  const foot = mainSceneFoot({ moon: 'Europa', moonCoverage: { startJdTdb: moonJson.bodies.Europa.rows[0][0], endJdTdb: moonJson.bodies.Europa.rows.at(-1)[0] } });
  assert.match(foot, /2031-08-01 → 2032-06-01 TDB/); assert.match(foot, /sin extrapolar/); assert.match(foot, /galileanos de Horizons/);
  assert.ok(foot.length <= 240, `${foot.length} caracteres`);
  assert.equal(mainSceneFoot({ moon: null }), FOOT_MAIN_SCENE); assert.equal(mainSceneFoot(null), FOOT_MAIN_SCENE);
});
