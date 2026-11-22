// Tarea continua O-03 (auditoría de 17.1): pruebas de COMPORTAMIENTO en lugar de comprobar el texto del código.
// · La cámara de destino de la escena principal se ejercita con el controlador real (CameraController) en Node: THREE para la
//   matemática, un lienzo que guarda sus escuchadores y unos controles mínimos. Se comprueba la pose, que se recalcula en cada
//   fotograma, que arrastrar o usar la rueda devuelve el control al usuario y (23) los satélites.
// · El reencuadre al cambiar la ventana de la escena se ejercita con SolarSystemMissionView y una escena doble.
// · La línea de tiempo y el anunciador del Centro de Misión, con sus funciones puras (MissionPlaybackAids).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { crearControladorCamara } from '../src/graphics/CameraController.js';
import { instanteLineaTiempo, textoValorLineaTiempo, anuncioCambioFase, TOLERANCIA_FINAL_LINEA_S } from '../src/ui/MissionPlaybackAids.js';
import { createSolarSystemMissionView } from '../src/integration/SolarSystemMissionView.js';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS } from '../src/lab/IntegratedMission.js';
import { createIntegratedExecution } from '../src/lab/IntegratedMissionPlayback.js';
import { refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';

const R_EUROPA = 1560.8 * 32 / 149597870.7;
// Escena mínima para el controlador: Júpiter y Marte (radios de escena 1:1), la sonda y Europa.
function harness() {
  const camera = new THREE.PerspectiveCamera(48, 1.6, 0.00004, 36000);
  camera.position.set(0, 50, 100);
  const controls = { target: new THREE.Vector3(), enabled: true, enablePan: true, minDistance: 0, maxDistance: Infinity, update() { camera.lookAt(this.target); } };
  const handlers = {};
  const canvas = { addEventListener(type, fn) { handlers[type] = fn; }, getBoundingClientRect: () => ({ left: 0, top: 0, x: 0, y: 0, width: 1600, height: 1000 }), clientWidth: 1600, clientHeight: 1000, style: {} };
  const body = (name, radio, pos) => { const g = new THREE.Group(); g.position.set(...pos); return [name, { posicion: g, planeta: { radio, nombre: name } }]; };
  const objetos = new Map([body('Jupiter', 0.0153, [100, 0, -120]), body('Marte', 0.000725, [30, 0, 35])]);
  // Sonda en dirección perpendicular a la del Sol vista desde Júpiter y desde Europa (sin el caso degenerado sonda–Sol alineados).
  const side = new THREE.Vector3(0.768, 0.05, 0.640).normalize();
  const probe = new THREE.Group(); probe.position.set(100, 0, -120).addScaledVector(side, 0.2); probe.visible = true;
  const sonda = { posicion: probe, visual: new THREE.Group(), obtenerRadioObservacionActual: () => 0.0025, establecerOcultaPorPrimeraPersona() {} };
  const moon = new THREE.Group(); moon.position.copy(probe.position).addScaledVector(side, -0.0004); moon.visible = true;
  const lunasPlanetarias = new Map([['Europa', { posicion: moon, radioEscena: R_EUROPA, mesh: { userData: {} }, definition: { parent: 'Jupiter' } }]]);
  const selections = [];
  const cc = crearControladorCamara({ camera, controls, canvas, objetos, orbitas: new Map(), obtenerZonaEncuadre: () => null, sonda, lunasPlanetarias,
    alSeleccionar: n => selections.push(['planeta', n]), alSeleccionarLuna: n => selections.push(['luna', n]) });
  const run = (frames = 300) => { for (let i = 0; i < frames; i++) cc.actualizar(1 / 60); };
  return { camera, controls, handlers, objetos, probe, moon, cc, run, selections };
}
// Pose esperada: a unos 4 radios del cuerpo, al otro lado de la sonda, del lado del Sol, mirando hacia la sonda.
function checkPose(h, center, radius, label) {
  const toProbe = h.probe.position.clone().sub(center).normalize(), cam = h.camera.position.clone().sub(center);
  const d = cam.length() / radius;
  assert.ok(d > 3.6 && d < 4.6, `${label}: cámara a ${d.toFixed(3)} radios`);
  assert.ok(cam.dot(toProbe) < 0, `${label}: la cámara queda detrás del cuerpo respecto a la sonda`);
  const toSun = center.clone().negate().normalize(), lateral = toSun.clone().addScaledVector(toProbe, -toSun.dot(toProbe));
  assert.ok(cam.dot(lateral) > 0, `${label}: desplazada hacia el lado del Sol`);
  // El objetivo está sobre la línea cuerpo–sonda, a 4 radios del centro (o en la sonda si está más cerca).
  const target = h.controls.target.clone().sub(center), expected = Math.min(4 * radius, h.probe.position.distanceTo(center));
  assert.ok(Math.abs(target.length() - expected) < 1e-9 && target.normalize().dot(toProbe) > 1 - 1e-12, `${label}: objetivo hacia la sonda`);
}

test('O-03 · cámara de destino: pose a unos 4 radios del planeta, del lado del Sol, mirando hacia la sonda', () => {
  const h = harness();
  assert.equal(h.cc.encuadrarDestinoConSonda('Jupiter'), true);
  h.run();
  checkPose(h, h.objetos.get('Jupiter').posicion.position, 0.0153 * 1.014, 'Júpiter');
  assert.deepEqual(h.selections.slice(-2), [['planeta', 'Jupiter'], ['luna', null]]);
});

test('O-03 · la pose se recalcula en cada fotograma mientras el planeta y la sonda se mueven', () => {
  const h = harness();
  h.cc.encuadrarDestinoConSonda('Jupiter'); h.run();
  const delta = new THREE.Vector3(0.37, -0.02, 0.51), before = h.camera.position.clone();
  h.objetos.get('Jupiter').posicion.position.add(delta); h.probe.position.add(delta);
  h.run(1);
  assert.ok(h.camera.position.distanceTo(before) > 0.6, 'la cámara acompaña al planeta y la sonda en el mismo fotograma');
  checkPose(h, h.objetos.get('Jupiter').posicion.position, 0.0153 * 1.014, 'tras trasladar planeta y sonda');
  // Si solo se mueve la sonda, la cámara gira alrededor del planeta para seguir mirándola.
  h.probe.position.add(new THREE.Vector3(0, 0.05, 0)); h.run(1);
  checkPose(h, h.objetos.get('Jupiter').posicion.position, 0.0153 * 1.014, 'tras mover la sonda');
});

test('O-03 · arrastrar o usar la rueda devuelve el control al usuario: la pose deja de imponerse', () => {
  for (const gesture of ['arrastre', 'rueda']) {
    const h = harness();
    h.cc.encuadrarDestinoConSonda('Jupiter'); h.run();
    if (gesture === 'arrastre') {
      h.handlers.pointerdown({ button: 0, pointerId: 1, clientX: 400, clientY: 300 });
      h.handlers.pointermove({ pointerId: 1, clientX: 420, clientY: 310 });
    } else h.handlers.wheel({ deltaY: 120, preventDefault() {} });
    const before = h.camera.position.clone();
    h.probe.position.add(new THREE.Vector3(0, 0.05, 0)); h.run(5);
    assert.ok(h.camera.position.distanceTo(before) < 1e-12, `${gesture}: la cámara ya no sigue la pose de destino`);
    // Un movimiento de menos de 5 px no es un arrastre (sería un clic).
  }
  const h = harness();
  h.cc.encuadrarDestinoConSonda('Jupiter'); h.run();
  h.handlers.pointerdown({ button: 0, pointerId: 1, clientX: 400, clientY: 300 });
  h.handlers.pointermove({ pointerId: 1, clientX: 402, clientY: 301 });
  h.probe.position.add(new THREE.Vector3(0, 0.05, 0)); h.run(1);
  checkPose(h, h.objetos.get('Jupiter').posicion.position, 0.0153 * 1.014, 'movimiento < 5 px');
});

test('23 · cámara de destino sobre un satélite visible; un satélite oculto no se encuadra y ocultarlo seleccionado no falla', () => {
  const h = harness();
  assert.equal(h.cc.encuadrarDestinoConSonda('Europa'), true);
  h.run();
  checkPose(h, h.moon.position, R_EUROPA * 1.014, 'Europa');
  assert.deepEqual(h.selections.slice(-2), [['planeta', null], ['luna', 'Europa']]);
  // Satélite oculto (fuera de su ventana): no se encuadra.
  const hidden = harness(); hidden.moon.visible = false;
  assert.equal(hidden.cc.encuadrarDestinoConSonda('Europa'), false);
  // Con Europa seleccionada, se oculta: el aviso de desplazamiento del satélite no falla (antes: «reading 'clone'»).
  const old = h.moon.position.clone(); h.moon.visible = false;
  assert.doesNotThrow(() => h.cc.alActualizarLuna(old));
});

// Misión A1 real para la vista de la escena principal.
const json = file => JSON.parse(readFileSync(file, 'utf8'));
async function missionA1() {
  const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
  const eph = createInterplanetaryEphemeris({ catalog, loadJson: async f => json(`public/${f}`) });
  const v = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === 'A1')), target = ENCOUNTER_TARGETS[v.destinationId];
  let dep = datetimeLocalUtcToJdTdb(v.departureUtc), tof = v.tofDays;
  const covE = eph.coverage('399'), covT = eph.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tof) + 140;
  const helio = await eph.loadWindow(['399', target.ephemerisId], Math.max(covE.startJdTdb, covT.startJdTdb, dep - margin), Math.min(covE.endJdTdb, covT.endJdTdb, dep + tof + margin + 200));
  const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb: dep, tofDays: tof, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tof), halfSpanTofDays: refinementHalfSpanDays(tof) });
  dep = r.departureJdTdb; tof = r.tofDays;
  const design = { ...historicalDesign('cassini'), id: 'flota-cassini' };
  const mission = computeIntegratedMission(integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb: dep, tofDays: tof }, design), { helio, moons: null });
  return { execution: createIntegratedExecution({ result: mission, data: { helio, moons: null }, design }), eph: createInterplanetaryEphemeris({ catalog: json('public/data/interplanetary-ephemerides-catalog-v1.json'), loadJson: async f => json(`public/${f}`) }) };
}

test('O-03 · al cambiar la ventana de la escena solo se reencuadra la vista general', async () => {
  const { execution, eph } = await missionA1();
  const calls = [];
  const scene = { modoEscalaActual: () => 'cientifica', establecerModoEscala() {}, actualizarLunas() {}, configurarSondaMision() {}, configurarTrayectoriaSonda() {}, establecerProveedorZonaEncuadre() {},
    actualizarPosiciones() {}, actualizarEstadoSonda() {}, establecerFactorEscalaSonda() {}, mostrarTrayectoriaSonda() {}, ocultarSonda() {},
    enfocarSonda: () => calls.push('exterior'), encuadrarDestinoConSonda: n => calls.push(`destino:${n}`), encuadrarConjuntoMision: () => calls.push('general'), vistaGeneral() {} };
  const view = createSolarSystemMissionView({ scene, loadEphemeris: async () => eph });
  assert.equal((await view.prepare(execution)).ok, true);
  view.reframe(); assert.deepEqual(calls, [], 'sin ocupar la escena no se reencuadra');
  view.setVisible(true); calls.length = 0;
  view.reframe(); assert.deepEqual(calls, ['general'], 'vista general: se recalcula con la nueva zona');
  for (const mode of ['exterior', 'destination']) {
    view.setCameraMode(mode); calls.length = 0;
    view.reframe(); assert.deepEqual(calls, [], `${mode}: no se toca la cámara`);
  }
});

test('O-03 · línea de tiempo: al final salta al final exacto del cálculo; texto para lectores de pantalla y anuncio de fase', () => {
  const max = 27341003.125;
  assert.equal(TOLERANCIA_FINAL_LINEA_S, 0.0015);
  assert.equal(instanteLineaTiempo(max - 0.001, max), max, 'el paso de 0,001 s no deja la reproducción a un milisegundo del final');
  assert.equal(instanteLineaTiempo(max, max), max);
  assert.equal(instanteLineaTiempo(max - 0.002, max), max - 0.002);
  assert.equal(instanteLineaTiempo(0, max), 0);
  assert.equal(textoValorLineaTiempo('316,4 d transcurridos', '0,5 d restantes', 'Captura en Marte'), '316,4 d transcurridos · 0,5 d restantes · Captura en Marte');
  assert.equal(textoValorLineaTiempo('1 d transcurridos', '2 d restantes', ''), '1 d transcurridos · 2 d restantes', 'sin fase, sin separador colgante');
  assert.equal(anuncioCambioFase(null, 'Crucero heliocéntrico'), null, 'la preparación inicial no se anuncia');
  assert.equal(anuncioCambioFase('Crucero heliocéntrico', 'Crucero heliocéntrico'), null);
  assert.equal(anuncioCambioFase('Crucero heliocéntrico', 'Sobrevuelo de Europa'), 'Fase: Sobrevuelo de Europa');
  assert.equal(anuncioCambioFase('Crucero heliocéntrico', ''), null);
});
