import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEphemerisProvider } from '../src/science/EphemerisProvider.js';
import { HORIZONS_PLANETS } from '../src/science/HorizonsEphemerides.js';
import { DynamicsError, preparePrescribedEphemerisField } from '../src/science/GravitationalDynamics.js';
import { SOLAR_SYSTEM_GM_CATALOG } from '../src/science/GravitationalParameters.js';
import { INTEGRATOR_METHODS } from '../src/science/NumericalIntegrator.js';
import {
  createProbeDefinition,
  createProbeDynamicState,
  probeStateToScientificState
} from '../src/science/ProbeState.js';
import { propagateProbeTrajectory } from '../src/science/TrajectoryPropagator.js';
import {
  createExperimentalProbe01InitialState,
  EXPERIMENTAL_PROBE_01_DEFAULT_END_JD_TDB,
  EXPERIMENTAL_PROBE_01_EPOCH_JD_TDB,
  propagateExperimentalProbe01
} from '../src/science/ExperimentalProbe01.js';
import {
  evaluateVisualPlanetsFromField,
  probeStateToVisual,
  SCENE_UNITS_PER_KM,
  trajectoryRenderSamplesToScenePositions
} from '../src/integration/ProbeVisualAdapter.js';
import { KM_PER_AU, SECONDS_PER_DAY } from '../src/science/Units.js';
import { secondsBetweenJdTdb } from '../src/science/Time.js';

const ephemerisRawText = readFileSync(new URL('../public/data/efemerides-2026.json', import.meta.url), 'utf8');
const catalogRawText = readFileSync(new URL('../public/data/ephemerides-catalog-v1.json', import.meta.url), 'utf8');

function createLocalProvider() {
  const ephemerisJson = JSON.parse(ephemerisRawText);
  const catalogJson = JSON.parse(catalogRawText);
  const snapshotBefore = JSON.stringify(ephemerisJson);
  const provider = createEphemerisProvider({
    catalog: catalogJson,
    loadJson: async file => (file.endsWith('ephemerides-catalog-v1.json') ? catalogJson : ephemerisJson)
  });
  return { provider, ephemerisJson, snapshotBefore };
}

test('contrato de sonda separa metadatos, estado físico y gráficos; la masa no altera partícula de prueba', async () => {
  assert.throws(() => createProbeDefinition({
    id: 'bad-visual',
    name: 'Mezcla visual prohibida',
    classification: 'fictional_experimental',
    color: 0xff0000
  }), /no debe mezclar propiedades de representación gráfica/);

  assert.throws(() => createProbeDefinition({
    id: 'bad-maneuver',
    name: 'Maniobra prematura',
    classification: 'fictional_experimental',
    plannedManeuvers: [{ deltaVKmPerS: 1.2 }]
  }), /reservada para etapas posteriores/);

  const { provider } = createLocalProvider();
  const baseInitial = createExperimentalProbe01InitialState();
  const heavyInitial = createProbeDynamicState({
    ...baseInitial,
    probe: createProbeDefinition({
      id: baseInitial.probe.id,
      name: baseInitial.probe.name,
      classification: baseInitial.probe.classification,
      massKg: 95000, // Masa descriptiva muy superior
      massTreatment: 'test_particle',
      description: baseInitial.probe.description
    })
  });

  const targetJd = EXPERIMENTAL_PROBE_01_EPOCH_JD_TDB + 5;
  const trajA = await propagateProbeTrajectory({
    initialState: baseInitial,
    catalog: SOLAR_SYSTEM_GM_CATALOG,
    ephemerisProvider: provider,
    targetJdTdb: targetJd
  });
  const trajB = await propagateProbeTrajectory({
    initialState: heavyInitial,
    catalog: SOLAR_SYSTEM_GM_CATALOG,
    ephemerisProvider: provider,
    targetJdTdb: targetJd
  });

  const endA = trajA.getStateAtJdTdb(targetJd);
  const endB = trajB.getStateAtJdTdb(targetJd);
  assert.deepEqual(endA.position, endB.position);
  assert.deepEqual(endA.velocity, endB.velocity);

  const canonical = probeStateToScientificState(endA);
  assert.equal(canonical.identity.type, 'probe');
  assert.equal(canonical.position.unit, 'km');
  assert.equal(canonical.velocity.unit, 'km/s');
});

test('ventana síncrona de efemérides coincide con Hermite del proveedor y prohíbe extrapolación', async () => {
  const { provider } = createLocalProvider();
  const bodyIds = Object.values(HORIZONS_PLANETS);
  const field = await preparePrescribedEphemerisField({
    provider,
    bodyIds,
    epochJdTdb: EXPERIMENTAL_PROBE_01_EPOCH_JD_TDB,
    startJdTdb: 2461314.5,
    endJdTdb: 2461345.5
  });

  // Comparar en el MISMO instante exacto representado por queryJd en JD TDB
  const queryJd = EXPERIMENTAL_PROBE_01_EPOCH_JD_TDB + 0.37;
  const exactElapsedForQueryJd = secondsBetweenJdTdb(EXPERIMENTAL_PROBE_01_EPOCH_JD_TDB, queryJd);
  for (const bodyId of bodyIds) {
    const fromProvider = await provider.getInterpolated(bodyId, queryJd);
    const fromField = field.getBodyStateAtElapsedSeconds(bodyId, exactElapsedForQueryJd);
    const posDiffKm = Math.hypot(
      fromField.position.x - fromProvider.state.position.x,
      fromField.position.y - fromProvider.state.position.y,
      fromField.position.z - fromProvider.state.position.z
    );
    const velDiff = Math.hypot(
      fromField.velocity.x - fromProvider.state.velocity.x,
      fromField.velocity.y - fromProvider.state.velocity.y,
      fromField.velocity.z - fromProvider.state.velocity.z
    );
    assert.ok(posDiffKm < 1e-10, `Diferencia Hermite excesiva para ${bodyId}: ${posDiffKm} km`);
    assert.ok(velDiff < 1e-14, `Diferencia velocidad Hermite excesiva para ${bodyId}: ${velDiff} km/s`);
  }

  // Prohibición estricta de extrapolación fuera de cobertura
  assert.throws(
    () => field.getBodyPositionKm('399', field.coverage.endSeconds + 1),
    error => error instanceof DynamicsError && error.code === 'OUTSIDE_EPHEMERIS_COVERAGE'
  );
  assert.throws(
    () => field.getBodyPositionKm('399', field.coverage.startSeconds - 1),
    error => error instanceof DynamicsError && error.code === 'OUTSIDE_EPHEMERIS_COVERAGE'
  );
});

test('Sonda Experimental 01: propagación 22 días, acuerdo DOPRI54 vs RK4, límites de cobertura y rendimiento', async () => {
  const { provider, ephemerisJson, snapshotBefore } = createLocalProvider();
  const initial = createExperimentalProbe01InitialState();
  const initialSnapshot = JSON.stringify(initial);

  const trajectory = await propagateExperimentalProbe01({
    ephemerisProvider: provider,
    targetJdTdb: EXPERIMENTAL_PROBE_01_DEFAULT_END_JD_TDB,
    coveragePolicy: 'strict'
  });

  // Efemérides originales y estado inicial permanecen inalterados
  assert.equal(JSON.stringify(ephemerisJson), snapshotBefore);
  assert.equal(JSON.stringify(initial), initialSnapshot);

  // Separación clara entre nodos de cálculo y muestras de renderizado
  const knotTimes = trajectory.getComputationKnotTimes();
  const renderSamples = trajectory.getRenderSamplesKm();
  assert.ok(knotTimes.length >= 10);
  assert.notEqual(knotTimes.length, renderSamples.count);
  assert.equal(renderSamples.positionsKm.length, renderSamples.count * 3);

  // Verificación cruzada frente a integrador de referencia RK4 con paso fino (300 s)
  const rk4Trajectory = await propagateProbeTrajectory({
    initialState: initial,
    catalog: SOLAR_SYSTEM_GM_CATALOG,
    ephemerisField: trajectory.ephemerisField,
    targetJdTdb: EXPERIMENTAL_PROBE_01_DEFAULT_END_JD_TDB,
    integrator: {
      method: INTEGRATOR_METHODS.RK4,
      stepSeconds: 300
    }
  });

  const endDopri = trajectory.getStateAtJdTdb(EXPERIMENTAL_PROBE_01_DEFAULT_END_JD_TDB);
  const endRk4 = rk4Trajectory.getStateAtJdTdb(EXPERIMENTAL_PROBE_01_DEFAULT_END_JD_TDB);
  const diffDopriVsRk4Km = Math.hypot(
    endDopri.position.x - endRk4.position.x,
    endDopri.position.y - endRk4.position.y,
    endDopri.position.z - endRk4.position.z
  );

  // Reproducibilidad determinista exacta
  const repeated = await propagateExperimentalProbe01({
    ephemerisProvider: provider,
    targetJdTdb: EXPERIMENTAL_PROBE_01_DEFAULT_END_JD_TDB,
    coveragePolicy: 'strict'
  });
  assert.deepEqual(
    repeated.getStateAtJdTdb(EXPERIMENTAL_PROBE_01_DEFAULT_END_JD_TDB).position,
    endDopri.position
  );

  // Benchmark de consultas por fotograma (1000 recuperaciones intermedias sin reintegrar)
  const tLookup0 = performance.now();
  const scratch = new Float64Array(6);
  for (let i = 0; i < 1000; i++) {
    const tau = (i / 999) * trajectory.endSeconds;
    trajectory.writeStateVectorAtElapsedSeconds(tau, scratch);
  }
  const lookup1000Ms = performance.now() - tLookup0;

  console.log(
    `SONDA_EXP_01_22D knots=${trajectory.diagnostics.computationKnotCount} `
    + `renderSamples=${trajectory.diagnostics.renderSampleCount} `
    + `evals=${trajectory.diagnostics.functionEvaluations} `
    + `propMs=${trajectory.diagnostics.propagationWallTimeMs.toFixed(3)} `
    + `lookup1000Ms=${lookup1000Ms.toFixed(3)} `
    + `diffVsRK4_300s=${diffDopriVsRk4Km.toExponential(4)}km`
  );

  assert.ok(diffDopriVsRk4Km < 1e-3, `Discrepancia entre DOPRI54 y RK4 excesiva: ${diffDopriVsRk4Km} km`);
  assert.ok(trajectory.diagnostics.propagationWallTimeMs < 250, 'La propagación de 22 días debe ser fluida');
  assert.ok(lookup1000Ms < 50, 'La consulta de estados propagados debe ser sub-milisegundo por fotograma');

  // Fuera de cobertura: modo estricto rechaza, modo clamp_to_coverage detiene en la frontera e informa
  await assert.rejects(
    propagateProbeTrajectory({
      initialState: initial,
      catalog: SOLAR_SYSTEM_GM_CATALOG,
      ephemerisProvider: provider,
      targetJdTdb: 2461360.5, // Más allá del 2026-11-01
      coveragePolicy: 'strict'
    }),
    error => error instanceof DynamicsError && error.code === 'OUTSIDE_EPHEMERIS_COVERAGE'
  );

  const clamped = await propagateExperimentalProbe01({
    ephemerisProvider: provider,
    targetJdTdb: 2461360.5,
    coveragePolicy: 'clamp_to_coverage'
  });
  assert.equal(clamped.stoppedAtCoverageBoundary, true);
  assert.equal(clamped.endJdTdb, 2461345.5);
  assert.ok(typeof clamped.coverageLimitNotice === 'string' && clamped.coverageLimitNotice.length > 0);
});

test('Prueba 8: integración visual convierte km a escena sin mutar estados científicos', async () => {
  const { provider } = createLocalProvider();
  const trajectory = await propagateExperimentalProbe01({
    ephemerisProvider: provider
  });

  const midState = trajectory.getStateAtElapsedSeconds(10 * SECONDS_PER_DAY + 6 * 3600);
  const snapshot = JSON.stringify(midState);
  const visual = probeStateToVisual(midState);

  // Rotación eclíptica -> escena: sceneX = x*s, sceneY = z*s, sceneZ = -y*s (32 unidades / AU)
  assert.ok(Math.abs(visual.posicionEscena.x - midState.position.x * 32 / KM_PER_AU) < 1e-12);
  assert.ok(Math.abs(visual.posicionEscena.y - midState.position.z * 32 / KM_PER_AU) < 1e-12);
  assert.ok(Math.abs(visual.posicionEscena.z + midState.position.y * 32 / KM_PER_AU) < 1e-12);

  // Conservación exacta de norma euclidiana bajo la transformación de escena
  const distPhysicalScene = Math.hypot(
    midState.position.x,
    midState.position.y,
    midState.position.z
  ) * SCENE_UNITS_PER_KM;
  const distVisualScene = Math.hypot(
    visual.posicionEscena.x,
    visual.posicionEscena.y,
    visual.posicionEscena.z
  );
  assert.ok(Math.abs(distPhysicalScene - distVisualScene) < 1e-12);

  // El estado dinámico original permanece congelado e intacto
  assert.equal(JSON.stringify(midState), snapshot);
  assert.throws(() => { visual.posicionEscena.x = 999; }, TypeError);

  // Conversión de muestras de trayectoria al buffer Float32 de Three.js
  const renderSamples = trajectory.getRenderSamplesKm();
  const vertices = trajectoryRenderSamplesToScenePositions(renderSamples);
  assert.ok(vertices instanceof Float32Array);
  assert.equal(vertices.length, renderSamples.count * 3);
  assert.ok(Math.abs(vertices[0] - renderSamples.positionsKm[0] * SCENE_UNITS_PER_KM) < 1e-5);
  assert.ok(Math.abs(vertices[1] - renderSamples.positionsKm[2] * SCENE_UNITS_PER_KM) < 1e-5);
  assert.ok(Math.abs(vertices[2] + renderSamples.positionsKm[1] * SCENE_UNITS_PER_KM) < 1e-5);

  // Evaluación visual síncrona de los 8 planetas sincronizada al instante subdía
  const visualPlanets = evaluateVisualPlanetsFromField(trajectory.ephemerisField, midState.time.elapsedSeconds);
  assert.equal(visualPlanets.status, 'interpolated');
  assert.equal(Object.keys(visualPlanets.states).length, 8);
  assert.equal(visualPlanets.calendar.dateIso, '2026-10-20');
});
