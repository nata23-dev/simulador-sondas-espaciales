// Etapa 15 — biblioteca de herencia, Hangar modular, ingeniería (potencia, propulsión eléctrica, centro de masas, compatibilidad)
// y su conexión con la misión integrada (energía por fases, empuje eléctrico limitado por la potencia, sobrevuelo de satélites).
// Las referencias numéricas son los valores DOCUMENTADOS de HeritageCatalog.js (NSSDCA, ESA, JPL); las tolerancias cubren solo
// el redondeo de las fuentes. Las comprobaciones independientes recalculan las fórmulas sin usar las funciones probadas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HERITAGE_COMPONENTS, HERITAGE_SOURCES, HISTORICAL_PROBES, DATA_QUALITY } from '../src/lab/HeritageCatalog.js';
import { getComponent, slotAccepts, needsAdapter, adapterMassKg, ALL_COMPONENTS } from '../src/lab/ComponentCatalog.js';
import { PRESETS, HISTORICAL_PRESETS, historicalDesign, validateDesign, planPartChange, applyPartChange, parseDesign } from '../src/lab/ProbeDesign.js';
import { calculateEngineering, ENGINEERING_STATUS, partCentroidM } from '../src/lab/ProbeEngineering.js';
import { solarArrayPowerW, rtgPowerW, electricThrust, generationAt, breakEvenDistanceAu, PU238_HALF_LIFE_YEARS, STANDARD_GRAVITY_M_S2 } from '../src/lab/SpacecraftPower.js';
import { designSignature } from '../src/lab/MissionPlanStore.js';
import { createProbeAssemblyModel, disposeProbeAssemblyModel, measureRearMountFit } from '../src/lab/ProbeAssemblyView.js';
import * as THREE from 'three';
import { computeIntegratedMission, PHASE_STATUS } from '../src/lab/IntegratedMission.js';
import { createIntegratedExecution, sampleIntegratedExecution, deriveIntegratedTelemetry, autoContextAt, AUTO_RATE } from '../src/lab/IntegratedMissionPlayback.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { createPlanetocentricWindow } from '../src/science/PlanetocentricWindow.js';
import { refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';

const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected} (tol ${tolerance})`);
const g0 = 9.80665;

// ---------- Catálogo y configuraciones históricas ----------
test('cada pieza de herencia declara calidad válida y fuentes existentes para sus cifras', () => {
  const qualities = new Set(Object.values(DATA_QUALITY));
  assert.ok(HERITAGE_COMPONENTS.length >= 40);
  for (const c of HERITAGE_COMPONENTS) {
    assert.ok(['voyager', 'cassini', 'dawn', 'juno'].includes(c.heritage), c.id);
    assert.ok(Object.keys(c.data).length > 0, `${c.id}: sin calidad de datos`);
    for (const [key, entry] of Object.entries(c.data)) {
      assert.ok(qualities.has(entry.quality), `${c.id}.${key}: calidad ${entry.quality}`);
      if (entry.quality === DATA_QUALITY.documented) assert.ok(HERITAGE_SOURCES[entry.source], `${c.id}.${key}: un dato documentado necesita fuente`);
      if (entry.source) assert.ok(HERITAGE_SOURCES[entry.source], `${c.id}.${key}: fuente desconocida ${entry.source}`);
    }
    for (const id of c.sources) assert.ok(HERITAGE_SOURCES[id], `${c.id}: fuente ${id}`);
    assert.ok(c.dryMassKg > 0 && c.dimensionsM.every(d => d > 0), c.id);
  }
  for (const src of Object.values(HERITAGE_SOURCES)) assert.match(src.url, /^https:\/\//);
});

test('las configuraciones históricas son válidas y reproducen las masas documentadas', () => {
  assert.equal(PRESETS.length, 4, 'las configuraciones iniciales ilustrativas conservan su lista');
  assert.equal(HISTORICAL_PRESETS.length, 4);
  for (const p of HISTORICAL_PRESETS) assert.deepEqual(validateDesign(p.create()), [], p.id);
  const e = id => calculateEngineering(historicalDesign(id));
  // Dawn (NSSDCA): 747,1 kg secos; 425 kg de xenón; 45,6 kg de hidracina; 1217,7 kg en el lanzamiento.
  near(e('dawn').structuralDryMassKg, 747.1, 1e-6, 'Dawn seco'); near(e('dawn').wetMassKg, 1217.7, 1e-6, 'Dawn lanzamiento');
  // Juno (JPL): 3625 kg en el lanzamiento con 1280 + 752 kg de propelente.
  near(e('juno').wetMassKg, 3625, 1e-6, 'Juno lanzamiento'); near(e('juno').fuelKg, 2032, 1e-9, 'Juno propelente');
  // Cassini (ESA/JPL): orbitador seco 2125 kg + Huygens (349 kg, secundario) + 3132 kg de propelente; el adaptador de lanzamiento no viaja.
  near(e('cassini').structuralDryMassKg, 2125 + 349, 1e-6, 'Cassini seco con Huygens'); near(e('cassini').fuelKg + e('cassini').rcsPropellantKg, 3132, 1e-9, 'Cassini propelente');
  assert.ok(5712 - e('cassini').wetMassKg > 0 && 5712 - e('cassini').wetMassKg < 150, 'diferencia con 5712 kg = adaptador de lanzamiento');
  // Voyager (secundario): 825,5 kg con 100 kg de hidracina.
  near(e('voyager').wetMassKg, 825.5, 1e-6, 'Voyager lanzamiento');
  for (const id of ['voyager', 'cassini', 'dawn', 'juno']) assert.notEqual(e(id).assessment.status, ENGINEERING_STATUS.modify, id);
});

test('los valores documentados de motores y generación se conservan exactamente', () => {
  assert.equal(getComponent('cas-main-engine').thrustN, 445);
  assert.equal(getComponent('juno-leros').thrustN, 645);
  assert.equal(getComponent('dawn-ion').thrustN, 0.092);
  assert.equal(getComponent('dawn-ion').electric.maxInputPowerW, 2600);
  assert.equal(getComponent('voy-rtg').generationW, 470);
  near(3 * getComponent('cas-rtg').generationW, 885, 1e-9, 'Cassini RTG');
  near(2 * getComponent('dawn-wing').generationW, 10300, 1e-9, 'Dawn 1 AU');
  near(3 * getComponent('juno-wing').generationW, 14000, 1e-9, 'Juno 1 AU');
  assert.equal(getComponent('voy-hga').dimensionsM[0], 3.66);
  assert.equal(getComponent('cas-hga').dimensionsM[0], 4);
  assert.equal(getComponent('dawn-hga').dimensionsM[0], 1.52);
});

// ---------- Modelos de potencia ----------
test('potencia solar: ajuste a dos puntos documentados e inverso del cuadrado por defecto', () => {
  const wing = getComponent('dawn-wing'), juno = getComponent('juno-wing');
  near(2 * solarArrayPowerW(wing, 1), 10300, 1e-9, 'Dawn 1 AU'); near(2 * solarArrayPowerW(wing, 3), 1300, 1e-6, 'Dawn 3 AU (fin de vida)');
  near(3 * solarArrayPowerW(juno, 5.4), 400, 1e-6, 'Juno en Júpiter');
  const illustrative = getComponent('solar-wing');
  near(solarArrayPowerW(illustrative, 2), illustrative.generationW / 4, 1e-9, 'inverso del cuadrado');
  assert.throws(() => solarArrayPowerW(wing, 0), RangeError);
});

test('RTG: disminución ajustada a Voyager y Cassini; sin ajuste, semivida del Pu-238', () => {
  near(rtgPowerW(getComponent('voy-rtg'), 1997.0 - 1977.7), 335, 1e-6, 'Voyager 1997');
  near(3 * rtgPowerW(getComponent('cas-rtg'), 11), 633, 1e-6, 'Cassini fin de misión nominal');
  const bare = { category: 'rtg', generationW: 100 };
  near(rtgPowerW(bare, PU238_HALF_LIFE_YEARS), 50, 1e-9, 'semivida');
  const g = generationAt([getComponent('cas-rtg'), getComponent('dawn-wing')], { distanceAu: 2, yearsSinceLaunch: 0 });
  near(g.rtgW, 295, 1e-9, 'el RTG no depende de la distancia'); near(g.solarW, 5150 * 2 ** -getComponent('dawn-wing').solarExponent, 1e-9, 'solar a 2 AU');
});

test('propulsión eléctrica: 92 mN a 2,6 kW, empuje proporcional a la potencia y umbral de encendido', () => {
  const ion = getComponent('dawn-ion');
  near(electricThrust(ion, 2600).thrustN, 0.092, 1e-12, 'NSSDCA');
  near(electricThrust(ion, 5000).thrustN, 0.092, 1e-12, 'limitado a la potencia máxima');
  const half = electricThrust(ion, 1300);
  near(half.thrustN, 0.046, 1e-12, 'mitad de potencia → mitad de empuje (Isp constante)');
  near(half.massFlowKgS, half.thrustN / (g0 * ion.ispS), 1e-15, 'caudal');
  assert.equal(electricThrust(ion, 499).operable, false);
  // η independiente: T·g₀·Isp / (2P).
  near(ion.electric.efficiency, 0.092 * g0 * 3100 / 5200, 1e-12, 'eficiencia');
  assert.equal(STANDARD_GRAVITY_M_S2, g0);
});

// ---------- Compatibilidad de ensamblaje ----------
test('montaje cruzado: herraje distinto exige adaptador y el propelente incompatible propone la pieza del mismo programa', () => {
  const cassini = historicalDesign('cassini');
  const plan = planPartChange(cassini, 'dawn-ion', 'main-engine');
  assert.ok(plan.adapter?.required); assert.equal(plan.adapter.massKg, adapterMassKg(getComponent('dawn-ion')));
  assert.equal(plan.conflicts.length, 1); assert.equal(plan.conflicts[0].replacement.id, 'dawn-xenon');
  assert.throws(() => applyPartChange(cassini, 'dawn-ion', 'main-engine', 'replace'), /adaptador/);
  const v = applyPartChange(cassini, 'dawn-ion', 'main-engine', 'replace', { adapter: true });
  assert.deepEqual(validateDesign(v), []);
  assert.ok(v.parts.filter(p => p.adapter).length === 2, 'motor y depósito con adaptador');
  assert.deepEqual(validateDesign(cassini), [], 'el diseño original no cambia');
  // Mismo herraje (antenas): sin adaptador.
  const hga = applyPartChange(cassini, 'voy-hga', 'hga');
  assert.equal(hga.parts.find(p => p.socketId === 'hga').adapter, undefined);
});

test('compatibilidad dimensional y de categoría: envolventes y puntos que no aceptan la pieza', () => {
  const dawn = historicalDesign('dawn');
  assert.throws(() => planPartChange(dawn, 'voy-hga', 'hga'), /envolvente/);
  assert.throws(() => planPartChange(dawn, 'cas-tanks', 'tank'), /envolvente/);
  assert.throws(() => planPartChange(dawn, 'juno-leros', 'hga'), /conexión incompatible/);
  const juno = historicalDesign('juno');
  assert.ok(slotAccepts(getComponent('bus-juno').slots.find(s => s.id === 'wing-1'), getComponent('cas-rtg')), 'un punto de potencia admite RTG o paneles');
  assert.ok(needsAdapter(getComponent('bus-juno').slots.find(s => s.id === 'wing-1'), getComponent('cas-rtg')));
  const invalid = structuredClone(juno); invalid.parts.find(p => p.socketId === 'wing-1').componentId = 'cas-rtg';
  assert.match(validateDesign(invalid).join(' '), /requiere adaptador/);
  invalid.parts.find(p => p.socketId === 'wing-1').adapter = true;
  assert.deepEqual(validateDesign(invalid), []);
  const pointless = historicalDesign('juno'); pointless.parts[0].adapter = true;
  assert.match(validateDesign(pointless).join(' '), /adaptador innecesario/);
});

test('ingeniería: motor iónico sin potencia se detecta, y alas solares lo hacen operable', () => {
  let v = applyPartChange(historicalDesign('cassini'), 'dawn-ion', 'main-engine', 'replace', { adapter: true });
  const rtgOnly = calculateEngineering(v);
  assert.equal(rtgOnly.assessment.status, ENGINEERING_STATUS.modify);
  assert.ok(rtgOnly.compatibility.some(c => c.type === 'eléctrica' && c.severity === 'error' && /no puede operar/.test(c.message)));
  assert.equal(rtgOnly.electric.operableAt1Au, false);
  near(rtgOnly.electric.availableInputAt1AuW, 885 - rtgOnly.idlePowerW, 1e-9, 'potencia disponible');
  for (const s of ['rtg-1', 'rtg-2', 'rtg-3']) v = applyPartChange(v, 'juno-wing', s, 'none', { adapter: true });
  const solar = calculateEngineering(v);
  assert.equal(solar.electric.operableAt1Au, true);
  near(solar.electric.thrustAt1AuN, 0.092, 1e-12, 'a plena potencia a 1 AU');
  assert.ok(solar.electric.operatingLimitAu > 1 && solar.electric.operatingLimitAu < 5.2);
  assert.ok(solar.assessment.mixed, 'variante de varios programas');
  assert.match(solar.assessment.nature, /experimental/);
  // Masa de adaptadores incluida en la masa seca.
  const adapters = v.parts.filter(p => p.adapter).reduce((n, p) => n + adapterMassKg(getComponent(p.componentId)), 0);
  near(solar.adapterMassKg, adapters, 1e-9, 'adaptadores');
});

test('centro de masas: cálculo independiente con centroides de las piezas', () => {
  const design = historicalDesign('dawn'), e = calculateEngineering(design), core = getComponent(design.coreId);
  let m = core.dryMassKg, mr = [0, 0, 0];
  for (const p of design.parts) {
    const c = getComponent(p.componentId), slot = core.slots.find(s => s.id === p.socketId);
    const pos = c.mount === 'internal' ? slot.position : slot.position.map((x, i) => x + slot.direction[i] * c.dimensionsM[1] / 2);
    const mass = c.dryMassKg + (c.rcsPropellantKg ?? 0) + (p.fuelKg ?? 0);
    m += mass; for (let i = 0; i < 3; i++) mr[i] += mass * pos[i];
  }
  for (let i = 0; i < 3; i++) near(e.centerOfMassM[i], mr[i] / m, 1e-12, `CM ${i}`);
  assert.deepEqual(partCentroidM(core.slots[0], getComponent('dawn-wing')).map(x => Math.round(x * 1000) / 1000), [-0.84 - 9.03 / 2, 0.1, 0].map(x => Math.round(x * 1000) / 1000));
  // Dos alas simétricas: el CM no se desplaza lateralmente por ellas.
  assert.ok(Math.abs(e.centerOfMassM[0]) < 0.1, 'simetría de las alas');
});

test('perfil de energía y distancia de equilibrio coherentes con la generación', () => {
  const e = calculateEngineering(historicalDesign('juno'));
  const jupiter = e.power.profile.find(p => p.label === 'Júpiter');
  near(jupiter.totalW, 14000 * 5.2 ** -getComponent('juno-wing').solarExponent, 1e-6, 'Juno a 5,2 AU');
  const r = breakEvenDistanceAu([getComponent('juno-wing'), getComponent('juno-wing'), getComponent('juno-wing')], e.idlePowerW);
  near(r, e.power.serviceBreakEvenAu, 1e-9, 'equilibrio');
  near(3 * solarArrayPowerW(getComponent('juno-wing'), r), e.idlePowerW, 1e-6, 'en el equilibrio la generación iguala el consumo');
  const voyager = calculateEngineering(historicalDesign('voyager'));
  assert.equal(voyager.power.serviceBreakEvenAu, Infinity, 'los RTG no dependen de la distancia');
});

test('importación y firma conservan adaptadores y referencia histórica', () => {
  const v = applyPartChange(historicalDesign('cassini'), 'juno-wing', 'rtg-1', 'none', { adapter: true });
  const round = parseDesign(JSON.stringify(v));
  assert.equal(round.basedOn, 'cassini');
  assert.equal(round.parts.find(p => p.socketId === 'rtg-1').adapter, true);
  assert.notEqual(designSignature(v), designSignature(historicalDesign('cassini')));
  // Los diseños sin adaptadores conservan su firma anterior (formato de 12B).
  const plain = PRESETS[1].create();
  assert.equal(designSignature(plain), JSON.stringify({ coreId: plain.coreId, parts: plain.parts.map(p => [p.socketId, p.componentId, p.fuelKg ?? null]).sort((a, b) => a[0].localeCompare(b[0])) }));
  assert.throws(() => parseDesign(JSON.stringify({ ...v, basedOn: 'apollo' })), /histórica desconocida/);
});

test('todas las piezas de herencia caben en al menos un bus y tienen un punto que las acepta', () => {
  const buses = ALL_COMPONENTS.filter(c => c.category === 'structure' && c.heritage !== 'ilustrativo');
  for (const c of HERITAGE_COMPONENTS.filter(item => item.category !== 'structure')) {
    assert.ok(buses.some(bus => bus.slots.some(s => slotAccepts(s, c) && Math.max(...c.dimensionsM) <= s.envelopeM)), `${c.id} sin punto`);
  }
});

test('el ensamblaje 3D reproduce las dimensiones publicadas y orienta las piezas según su punto de montaje', () => {
  const size = (object) => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  const model = id => { const a = createProbeAssemblyModel(historicalDesign(id)); a.updateMatrixWorld(true); return a; };
  const dawn = model('dawn');
  near(size(dawn).x, 19.7, 0.1, 'envergadura de Dawn (NSSDCA: 19,7 m)');
  for (const [id, diameter] of [['voyager', 3.66], ['cassini', 4], ['juno', 2.5]]) {
    const a = model(id), s = size(a.getObjectByName('hga-reflector'));
    near(Math.max(s.x, s.z), diameter, 1e-6, id + ': diámetro de la antena');
    assert.ok(a.userData.boundingRadiusM > 5 && a.userData.boundingRadiusM < 15, id + ': radio envolvente');
    disposeProbeAssemblyModel(a);
  }
  // La antena de Dawn está en una cara lateral (+Z): el reflector se abre hacia +Z.
  const reflector = size(dawn.getObjectByName('hga-reflector'));
  assert.ok(reflector.z < 0.3 && reflector.x > 1.4, 'antena lateral orientada');
  // Los diseños ilustrativos conservan su presentación (sin radio envolvente publicado) y sus medidas de 12A.1.
  assert.equal(createProbeAssemblyModel(PRESETS[1].create()).userData.boundingRadiusM, undefined);
  assert.ok(measureRearMountFit(PRESETS[1].create()).tank.bodyGapM > 0);
  // Un adaptador visible acompaña a cada pieza montada con adaptador.
  const v = applyPartChange(historicalDesign('cassini'), 'juno-wing', 'rtg-1', 'none', { adapter: true });
  let adapters = 0; createProbeAssemblyModel(v).traverse(n => { if (n.name === 'adapter') adapters++; });
  assert.equal(adapters, 1);
  disposeProbeAssemblyModel(dawn);
});

// ---------- Integración con la misión completa: escenario de referencia hacia Europa ----------
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const galilean = createPlanetocentricWindow(json('public/data/interplanetary/galilean-moons-jsb-2031-2032.json'));
let jupiterWindow, opportunity;
async function jupiter() {
  if (jupiterWindow) return;
  jupiterWindow = await createInterplanetaryEphemeris({ catalog, loadJson: async file => json(`public/${file}`) }).loadWindow(['399', '5'], 2462100.5, 2463400.5);
  const r = refineTransferCandidate(jupiterWindow, { destinationId: '5', departureJdTdb: datetimeLocalUtcToJdTdb('2028-12-26'), tofDays: 1090, criterion: 'c3', halfSpanDepartureDays: 2, halfSpanTofDays: 5 });
  opportunity = { departureJdTdb: r.departureJdTdb, arrivalJdTdb: r.arrivalJdTdb };
}
const europa = (design, moon, planet = { rp: 4200, ra: 8e6 }) => computeIntegratedMission({ destinationId: '599', moonId: '502', opportunity, design,
  profile: { planet: { mode: 'capture', periapsisAltitudeKm: planet.rp, captureBurns: [{ apoapsisAltitudeKm: planet.ra }], orbitCoastDays: 1 }, moon } }, { helio: jupiterWindow, moons: galilean });
const byId = m => Object.fromEntries(m.phases.map(p => [p.id, p]));
const continuityOk = m => {
  assert.ok(m.continuity.maxPositionErrorKm < 0.05, `posición ${m.continuity.maxPositionErrorKm}`);
  assert.ok(m.continuity.maxVelocityErrorKmS < 1e-6, `velocidad ${m.continuity.maxVelocityErrorKmS}`);
  assert.equal(m.continuity.undeclaredMassJumps, 0);
  assert.equal(m.continuity.maxTimeGapSeconds, 0);
};

test('Europa con variante de Cassini: captura en Júpiter y fracaso explicado de la captura en Europa por propelente', async () => {
  await jupiter();
  const variant = applyPartChange(historicalDesign('cassini'), 'voy-hga', 'hga');
  const m = europa(variant, { periapsisAltitudeKm: 100, captureBurns: [{ apoapsisAltitudeKm: 5000 }, { apoapsisAltitudeKm: 100 }] });
  const ph = byId(m);
  assert.equal(ph.capture.status, PHASE_STATUS.done);
  assert.equal(ph['moon-capture'].status, PHASE_STATUS.failed);
  assert.match(ph['moon-capture'].detail, /Propelente agotado/);
  assert.ok(m.verdict.startsWith('NO VIABLE'));
  assert.equal(ph.power.status, PHASE_STATUS.done);
  assert.ok(m.tanks.probe >= -1e-6 && m.tanks.probe < 1, 'el propelente se agota sin volverse negativo');
  continuityOk(m);
  // La masa final es la masa seca (con hidracina de actitud) más el propelente restante.
  near(m.finalMassKg, calculateEngineering(variant).dryMassKg + m.tanks.probe, 1e-3, 'masa final');
});

test('Europa con variante de Cassini: el sobrevuelo de Europa se calcula completo y balístico', async () => {
  await jupiter();
  const variant = applyPartChange(historicalDesign('cassini'), 'voy-hga', 'hga');
  const m = europa(variant, { mode: 'flyby', periapsisAltitudeKm: 100 });
  const ph = byId(m);
  for (const id of ['cruise', 'approach', 'capture', 'moon-transfer', 'moon-approach', 'moon-flyby', 'power']) assert.equal(ph[id].status, PHASE_STATUS.done, id);
  near(ph['moon-flyby'].flyby.periapsisAltitudeKm, 100, 0.5, 'altitud mínima');
  // Vis-viva independiente en el periapsis del sobrevuelo.
  const f = ph['moon-flyby'].flyby, muEuropa = m.segments.find(s => s.id === 'moon-flyby').mu, rp = 1560.8 + f.periapsisAltitudeKm;
  near(f.periapsisSpeedKmS, Math.sqrt(f.vInfKmS ** 2 + 2 * muEuropa / rp), 1e-9, 'vis-viva');
  assert.ok(m.segments.some(s => s.id === 'moon-outbound' && s.centralBodyId === '599'));
  assert.equal(m.maneuvers.filter(x => x.id.startsWith('moon-capture')).length, 0, 'sin encendido en Europa');
  continuityOk(m);
});

test('el sobrevuelo de Europa se reproduce en el Centro de Misión con contextos, telemetría y ritmo propios', async () => {
  await jupiter();
  const variant = applyPartChange(historicalDesign('cassini'), 'voy-hga', 'hga');
  const m = europa(variant, { mode: 'flyby', periapsisAltitudeKm: 100 });
  const exec = createIntegratedExecution({ result: m, data: { helio: jupiterWindow, moons: galilean }, design: variant });
  assert.ok(exec.contexts.helio && exec.contexts.planet && exec.contexts.moon);
  assert.ok(AUTO_RATE['moon-flyby'] > 0);
  const fly = m.segments.find(s => s.id === 'moon-flyby'), out = m.segments.find(s => s.id === 'moon-outbound');
  const mid = (fly.startSeconds + fly.endSeconds) / 2;
  assert.equal(autoContextAt(exec, mid), 'moon');
  assert.equal(autoContextAt(exec, (out.startSeconds + out.endSeconds) / 2), 'planet');
  for (const t of [0, m.approach ? fly.startSeconds : 0, mid, out.endSeconds]) {
    const sample = sampleIntegratedExecution(exec, t);
    assert.ok(sample.positionKm.every(Number.isFinite) && sample.velocityKmS.every(Number.isFinite), 'estado finito en ' + t);
    const tel = deriveIntegratedTelemetry(exec, sample);
    assert.ok(tel && typeof tel === 'object');
  }
  // En el periapsis la distancia al centro de Europa es el radio + la altitud del sobrevuelo.
  const peri = m.events.find(e => e.id === 'moon-closest');
  const sp = sampleIntegratedExecution(exec, peri.elapsedSeconds, 'moon');
  near(Math.hypot(...sp.native.positionKm), 1560.8 + byId(m)['moon-flyby'].flyby.periapsisAltitudeKm, 0.5, 'periapsis');
  // Energía en el instante: mismo modelo que la fase «power» (solo RTG, decaimiento según el tiempo desde la salida).
  const telPeri = deriveIntegratedTelemetry(exec, sp), pw = telPeri.power, p = m.vehicle.power;
  assert.ok(pw && pw.rtgW > 0 && pw.solarW === 0, 'potencia RTG en el sobrevuelo');
  near(pw.generationW, generationAt(p.sources, { distanceAu: telPeri.derived.sunDistanceAu, yearsSinceLaunch: peri.elapsedSeconds / 86400 / 365.25 }).totalW, 1e-6, 'generación');
  near(pw.marginW, pw.generationW - p.serviceW, 1e-6, 'margen sin motor');
  assert.equal(pw.missionSustainable, true);
  // Durante un encendido de la sonda el consumo incluye el motor declarado por la fase de energía.
  const joi = m.maneuvers.find(mv => mv.engineKey === 'probe' && mv.durationSeconds > 0);
  const burn = m.power.burns.find(b => b.id === joi.id);
  const telBurn = deriveIntegratedTelemetry(exec, sampleIntegratedExecution(exec, (joi.startSeconds + joi.endSeconds) / 2));
  near(telBurn.power.loadW, burn.loadW, 1e-9, 'consumo en el encendido');
});

test('motor iónico en Júpiter: la potencia en el destino impide la captura y el balance energético falla con alas solares', async () => {
  await jupiter();
  let v = applyPartChange(historicalDesign('cassini'), 'dawn-ion', 'main-engine', 'replace', { adapter: true });
  for (const s of ['rtg-1', 'rtg-2', 'rtg-3']) v = applyPartChange(v, 'juno-wing', s, 'none', { adapter: true });
  const m = europa(v, { mode: 'flyby', periapsisAltitudeKm: 100 });
  const ph = byId(m);
  assert.equal(ph.capture.status, PHASE_STATUS.failed);
  assert.match(ph.capture.detail, /no puede encenderse/);
  assert.equal(ph.power.status, PHASE_STATUS.failed);
  assert.ok(m.power.deficitWh > m.power.batteryWh);
  // Independiente: generación de las tres alas en la distancia del peor punto.
  const k = getComponent('juno-wing').solarExponent;
  near(m.power.worst.generationW, 14000 * m.power.worst.distanceAu ** -k, 1e-6, 'generación en el peor punto');
  assert.ok(m.verdict.startsWith('NO VIABLE'));
});

test('Juno histórica: energía suficiente en Júpiter con margen pequeño y sobrevuelo de Europa', async () => {
  await jupiter();
  const m = europa(historicalDesign('juno'), { mode: 'flyby', periapsisAltitudeKm: 100 });
  const ph = byId(m);
  assert.equal(ph.capture.status, PHASE_STATUS.done);
  assert.equal(ph.power.status, PHASE_STATUS.done);
  assert.ok(m.power.worst.marginW > 0 && m.power.worst.marginW < 150, `margen ${m.power.worst.marginW}`);
  assert.ok(m.power.worst.distanceAu > 4.9 && m.power.worst.distanceAu < 5.6);
  continuityOk(m);
});

test('la sonda ilustrativa del Hangar no tiene energía suficiente en Júpiter (cambio de criterio de 15, documentado)', async () => {
  await jupiter();
  const m = europa(PRESETS[1].create(), { mode: 'flyby', periapsisAltitudeKm: 100 }, { rp: 3 * 69911, ra: 4e6 });
  assert.equal(byId(m).power.status, PHASE_STATUS.failed);
  assert.ok(m.power.deficitWh > calculateEngineering(PRESETS[1].create()).batteryWh);
});
