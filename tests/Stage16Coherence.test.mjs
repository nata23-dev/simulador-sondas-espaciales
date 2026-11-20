// Etapa 16 — coherencia del laboratorio con la flota fija. Cada recomendación que la interfaz muestra (lanzador, altitud lunar,
// resultado de cada escenario con cada sonda y misión guiada) se recalcula aquí con el mismo motor y las mismas entradas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { calculateEngineering } from '../src/lab/ProbeEngineering.js';
import { DEMO_LAUNCHER, HEAVY_DEMO_LAUNCHER, HEAVY_LAUNCHER_SCALE, LAUNCHER_PRESETS, recommendedLauncherPreset, scaleLauncher, validateLauncher, liftoffThrustToWeight } from '../src/lab/LaunchVehicle.js';
import { calculateLaunch, estimatePayloadCapacityKg } from '../src/lab/LaunchPlan.js';
import { ORBIT_CLASSES } from '../src/lab/LaunchOrbit.js';
import { DEFAULT_GUIDANCE, DEFAULT_SCHEDULE } from '../src/lab/LaunchSimulation.js';
import { compareRequirementsWithDesign, refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS } from '../src/lab/IntegratedMission.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { createPlanetocentricWindow } from '../src/science/PlanetocentricWindow.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';
import { validateMoonDataset } from '../src/science/PlanetaryMoons.js';
import { gregorianTimestampToJdTdb } from '../src/science/Time.js';
import { calculateLunarTransfer } from '../src/lab/MissionPhysics.js';
import { evaluateMission } from '../src/lab/MissionEngineering.js';
import { DESTINATIONS } from '../src/lab/MissionPlanStore.js';
import { FLEET_PROBE_IDS, SCENARIO_OUTCOMES, scenarioOutcome, LUNAR_DEFAULTS, LUNAR_GUIDE, GUIDED_MISSION } from '../src/lab/FleetGuide.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { GUIDE_STEPS } from '../src/ui/LabGuidedMission.js';
import { AREAS } from '../src/ui/AppNavigator.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const fleet = id => ({ ...historicalDesign(id), id: `flota-${id}` }); // mismo diseño que el Hangar (ExperimentalLaboratory.js)
const launchOptions = () => ({ site: { latDeg: 28.5, lonDeg: -80.6, altitudeM: 3 }, launchDateUtc: '2026-10-10T12:00:00Z', earthRotationAngleDeg: 0, azimuthDeg: 90,
  guidance: { verticalRiseSeconds: DEFAULT_GUIDANCE.verticalRiseSeconds, kickDeg: DEFAULT_GUIDANCE.kickDeg, kickSeconds: DEFAULT_GUIDANCE.kickSeconds,
    stage2: { startElevationDeg: 'auto', endElevationDeg: DEFAULT_GUIDANCE.stage2.endElevationDeg, rampSeconds: DEFAULT_GUIDANCE.stage2.rampSeconds } },
  schedule: { ascentBurnSeconds: DEFAULT_SCHEDULE.ascentBurnSeconds, postCoastSeconds: DEFAULT_SCHEDULE.postCoastSeconds,
    circularization: { enabled: true, elevationDeg: DEFAULT_SCHEDULE.circularization.elevationDeg, maxCoastToApogeeSeconds: 7200, maxBurnSeconds: null } },
  target: { minPerigeeAltitudeKm: 160, maxApogeeAltitudeKm: 2000, targetAltitudeKm: 200, inclinationDeg: null, inclinationToleranceDeg: 1 } });

test('lanzador pesado: escala exacta del demostrativo (misma relación empuje/peso, Isp y Cd) y válido', () => {
  const k = HEAVY_LAUNCHER_SCALE;
  assert.deepEqual(validateLauncher(HEAVY_DEMO_LAUNCHER), []);
  HEAVY_DEMO_LAUNCHER.stages.forEach((stage, i) => {
    const base = DEMO_LAUNCHER.stages[i];
    for (const key of ['structuralMassKg', 'propellantMassKg', 'thrustSeaLevelN', 'thrustVacuumN']) assert.equal(stage[key], base[key] * k, key);
    assert.equal(stage.ispVacuumS, base.ispVacuumS); assert.equal(stage.dragCoefficient, base.dragCoefficient);
    assert.ok(Math.abs(stage.referenceAreaM2 - base.referenceAreaM2 * k ** (2 / 3)) < 0.01, 'área ∝ k^(2/3)');
  });
  assert.ok(Math.abs(liftoffThrustToWeight(HEAVY_DEMO_LAUNCHER, 1000 * k) - liftoffThrustToWeight(DEMO_LAUNCHER, 1000)) < 1e-12);
  assert.equal(DEMO_LAUNCHER.stages[0].propellantMassKg, 80000, 'el demostrativo no cambia');
  assert.throws(() => scaleLauncher(DEMO_LAUNCHER, 0));
  assert.match(HEAVY_DEMO_LAUNCHER.provenance, /ilustrativ/i);
});

test('capacidad orientativa de cada lanzador: la que muestra la interfaz coincide con la bisección del modelo (±5 %)', () => {
  for (const preset of LAUNCHER_PRESETS) {
    const capacity = estimatePayloadCapacityKg({ launcher: preset.launcher, options: launchOptions() });
    assert.ok(Math.abs(capacity - preset.nominalCapacityKg) / preset.nominalCapacityKg < 0.05, `${preset.id}: ${capacity} kg frente a ${preset.nominalCapacityKg}`);
  }
});

test('cada sonda de la flota llega a órbita con el lanzador recomendado; Cassini y Juno superan al ligero', () => {
  const expected = { voyager: DEMO_LAUNCHER.id, dawn: DEMO_LAUNCHER.id, cassini: HEAVY_DEMO_LAUNCHER.id, juno: HEAVY_DEMO_LAUNCHER.id };
  for (const id of FLEET_PROBE_IDS) {
    const design = fleet(id), preset = recommendedLauncherPreset(calculateEngineering(design).wetMassKg);
    assert.equal(preset.id, expected[id], id);
    const r = calculateLaunch({ design, launcher: preset.launcher, options: launchOptions() });
    assert.equal(r.status, ORBIT_CLASSES.orbit, `${id} con ${preset.id}`);
    assert.ok(r.simulation.knots.length > 2);
  }
  for (const id of ['cassini', 'juno']) assert.notEqual(calculateLaunch({ design: fleet(id), launcher: DEMO_LAUNCHER, options: launchOptions() }).status, ORBIT_CLASSES.orbit, `${id} con el ligero`);
});

test('interplanetario: con motor iónico la comprobación de Δv es «no verificable», igual que en Tierra–Luna', () => {
  const dawn = calculateEngineering(fleet('dawn'));
  assert.equal(dawn.propulsionType, 'electric');
  const cmp = compareRequirementsWithDesign({ injectionDeltaVKmS: 3.627 }, dawn);
  assert.match(cmp.status, /NO VERIFICABLE/); assert.doesNotMatch(cmp.status, /SUFICIENTE/);
  assert.ok(cmp.availableMS > cmp.requiredMS, 'el Δv ideal sí lo cubriría: por eso el aviso es necesario');
  const cassini = compareRequirementsWithDesign({ injectionDeltaVKmS: 3.627 }, calculateEngineering(fleet('cassini')));
  assert.match(cassini.status, /INSUFICIENTE/);
  assert.match(compareRequirementsWithDesign({ injectionDeltaVKmS: 0.5 }, calculateEngineering(fleet('juno'))).status, /SUFICIENTE PARA LA INYECCIÓN/);
});

// ---- «Misión completa»: los resultados que anuncia FleetGuide para cada escenario y sonda ----
const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const ephemeris = createInterplanetaryEphemeris({ catalog, loadJson: async file => json(`public/${file}`) });
const galilean = createPlanetocentricWindow(json('public/data/interplanetary/galilean-moons-jsb-2031-2032.json'));
// Réplica de IntegratedMissionPlanner.compute(): ventana de efemérides, refinamiento local (C3) y la misma función de entrada.
async function runScenario(scenario, probeId) {
  const v = scenarioFormValues(scenario), target = ENCOUNTER_TARGETS[v.destinationId];
  let departureJdTdb = datetimeLocalUtcToJdTdb(v.departureUtc), tofDays = v.tofDays;
  const covE = ephemeris.coverage('399'), covT = ephemeris.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tofDays) + 140;
  const helio = await ephemeris.loadWindow(['399', target.ephemerisId], Math.max(covE.startJdTdb, covT.startJdTdb, departureJdTdb - margin), Math.min(covE.endJdTdb, covT.endJdTdb, departureJdTdb + tofDays + margin + 200));
  if (v.refine) {
    const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb, tofDays, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tofDays), halfSpanTofDays: refinementHalfSpanDays(tofDays) });
    if (Number.isFinite(r.score)) { departureJdTdb = r.departureJdTdb; tofDays = r.tofDays; }
  }
  const input = integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb, tofDays }, fleet(probeId));
  return computeIntegratedMission(input, { helio, moons: v.moonId ? galilean : null });
}

test('cada escenario de «Misión completa» da con cada sonda el resultado que anuncia la interfaz', async () => {
  assert.deepEqual(Object.keys(SCENARIO_OUTCOMES).sort(), INTEGRATED_SCENARIOS.map(s => s.id).sort(), 'un resultado por escenario');
  for (const scenario of INTEGRATED_SCENARIOS) for (const probeId of FLEET_PROBE_IDS) {
    const m = await runScenario(scenario, probeId), expected = scenarioOutcome(scenario.id, probeId);
    const complete = m.verdict.startsWith('CADENA CALCULADA COMPLETA');
    assert.equal(complete, expected.ok, `${scenario.id} · ${probeId}: ${m.verdict}`);
    if (!expected.ok) assert.match(m.verdict, /^NO VIABLE/, `${scenario.id} · ${probeId}`);
  }
});

test('misión guiada: Cassini completa A1 en Marte, con encendido de captura y continuidad entre tramos', async () => {
  const scenario = INTEGRATED_SCENARIOS.find(s => s.id === GUIDED_MISSION.scenarioId);
  assert.ok(scenario, 'el escenario de la guía existe en el Planificador');
  assert.equal(ENCOUNTER_TARGETS[scenario.destinationId].name, GUIDED_MISSION.destinationName);
  const m = await runScenario(scenario, GUIDED_MISSION.probeId);
  assert.match(m.verdict, /^CADENA CALCULADA COMPLETA/);
  assert.ok(m.maneuvers.some(b => b.endEvent === 'cutoff' && b.propellantKg > 0), 'hay un encendido de captura que termina en la órbita pedida');
  assert.ok(m.continuity.maxPositionErrorKm < 1e-3 && m.continuity.undeclaredMassJumps === 0);
  assert.ok(m.finalMassKg > calculateEngineering(fleet('cassini')).dryMassKg, 'le queda propelente');
});

test('pasos de la guía: identificadores únicos, textos y acción verificable en cada paso', () => {
  const ids = GUIDE_STEPS.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(GUIDE_STEPS.length >= 5 && GUIDE_STEPS.length <= 8);
  for (const step of GUIDE_STEPS) {
    assert.ok(step.title && step.text, step.id);
    if (step.id !== 'intro' && step.id !== 'done') assert.equal(typeof step.isDone, 'function', step.id);
  }
  assert.ok(GUIDE_STEPS.some(s => /Cassini/.test(s.text)) && GUIDE_STEPS.some(s => /Marte/.test(s.text)));
});

// ---- «Tierra–Luna»: altitud inicial recomendada por sonda ----
const moons = validateMoonDataset(json('public/data/moons-2026-10.json'), { isolate: true }).data;
const lunar = (probeId, altitudeKm) => evaluateMission(fleet(probeId), calculateLunarTransfer({ dataset: moons, departureJd: gregorianTimestampToJdTdb(LUNAR_DEFAULTS.departureTdb),
  altitudeKm, target: LUNAR_DEFAULTS.objective, targetDistanceKm: LUNAR_DEFAULTS.targetDistanceKm })).status;

test('Tierra–Luna: la altitud recomendada da el estado anunciado y la mínima es la primera viable', () => {
  const scan = [200, 1000, 5000, 20000, 35786, 50000, 80000, 100000, 120000, 150000];
  for (const id of FLEET_PROBE_IDS) {
    const guide = LUNAR_GUIDE[id];
    assert.equal(lunar(id, guide.altitudeKm), guide.status, `${id} a ${guide.altitudeKm} km`);
    assert.notEqual(lunar(id, 200), 'VIABLE SEGÚN EL MODELO', `${id}: desde 200 km no es viable (por eso cambia el valor inicial)`);
    const firstViable = scan.find(alt => lunar(id, alt) === 'VIABLE SEGÚN EL MODELO') ?? null;
    assert.equal(firstViable, guide.minimumAltitudeKm, id);
  }
  assert.equal(lunar('dawn', 150000), 'NO VERIFICABLE', 'Dawn: motor iónico sin verificación impulsiva');
});

test('Tierra–Luna solo ofrece la Luna; la interfaz ya no lista destinos «pendientes»', () => {
  const ui = readFileSync('src/ui/MissionPlanner.js', 'utf8');
  assert.match(ui, /DESTINATIONS\.filter\(destination => destination\.available\)/);
  assert.doesNotMatch(ui, /· pendiente/);
  assert.equal(DESTINATIONS.filter(d => d.available).map(d => d.id).join(), 'moon');
  assert.ok(ui.includes('id="mission-altitude" type="number" min="200" max="150000" step="10" value="${LUNAR_DEFAULTS.defaultAltitudeKm}"'), 'altitud inicial por defecto desde FleetGuide');
  assert.equal(LUNAR_DEFAULTS.defaultAltitudeKm, 100000);
  for (const id of ['cassini', 'juno', 'dawn']) assert.equal(LUNAR_GUIDE[id].altitudeKm, LUNAR_DEFAULTS.defaultAltitudeKm, `${id}: el valor inicial ya es el recomendado`);
});

test('navegación: sin pestaña «Ingeniería» duplicada, con la misión guiada y la demostración orbital descrita como tal', () => {
  const items = AREAS.flatMap(group => group.items);
  assert.ok(!items.some(item => item.id === 'engineering'), 'la ingeniería forma parte del Hangar');
  assert.ok(items.some(item => item.id === 'guide' && item.guide), 'entrada de la misión guiada');
  const orbital = items.find(item => item.id === 'orbital');
  assert.match(orbital.desc, /no usa la sonda activa/i);
  const lab = readFileSync('src/ui/ExperimentalLaboratory.js', 'utf8');
  assert.doesNotMatch(lab, /data-lab-section="engineering"/);
  assert.doesNotMatch(lab, /id="lab-planner-modes"/);
});

test('interplanetario: los satélites no anuncian descensos «operativos» que el laboratorio ya no ofrece', () => {
  const ui = readFileSync('src/ui/InterplanetaryPlanner.js', 'utf8');
  assert.doesNotMatch(ui, /s\.localOperations/);
  assert.doesNotMatch(ui, /Etapas científicas pendientes/);
  assert.match(ui, /Misión completa/);
});
