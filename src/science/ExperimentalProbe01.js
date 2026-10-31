import { HORIZONS_FRAME } from './Frames.js';
import { DYNAMICAL_MODELS } from './GravitationalDynamics.js';
import { SOLAR_SYSTEM_GM_CATALOG, SUN_BODY_ID } from './GravitationalParameters.js';
import { HORIZONS_PLANETS } from './HorizonsEphemerides.js';
import { INTEGRATOR_METHODS } from './NumericalIntegrator.js';
import {
  createDynamicalModelDescriptor,
  createInitialConditionProvenance,
  createProbeDefinition,
  createProbeDynamicState
} from './ProbeState.js';
import { createSimulationInstant } from './SimulationTime.js';
import { gregorianLabelToJulianMidnight } from './Time.js';
import { propagateProbeTrajectory } from './TrajectoryPropagator.js';

export const EXPERIMENTAL_PROBE_01_EPOCH_DATE = '2026-10-10';
export const EXPERIMENTAL_PROBE_01_END_DATE = '2026-11-01';
export const EXPERIMENTAL_PROBE_01_EPOCH_JD_TDB = gregorianLabelToJulianMidnight(EXPERIMENTAL_PROBE_01_EPOCH_DATE);
export const EXPERIMENTAL_PROBE_01_DEFAULT_END_JD_TDB = gregorianLabelToJulianMidnight(EXPERIMENTAL_PROBE_01_END_DATE);

const PERTURBING_PLANET_IDS = Object.freeze(Object.values(HORIZONS_PLANETS));

export const EXPERIMENTAL_PROBE_01_DEFINITION = createProbeDefinition({
  id: 'sonda-experimental-01',
  name: 'Sonda Experimental 01',
  classification: 'fictional_experimental',
  massKg: 480,
  massTreatment: 'test_particle',
  description: 'Misión experimental ficticia en crucero interplanetario diseñada para verificar la propagación numérica heliocéntrica bajo la gravedad del Sol y los ocho planetas.'
});

export const EXPERIMENTAL_PROBE_01_MODEL = createDynamicalModelDescriptor({
  id: 'heliocentric-sun-8planets-prescribed-dopri54',
  kind: DYNAMICAL_MODELS.PRESCRIBED_EPHEMERIS_HELIOCENTRIC_PROBE,
  centralBodyId: SUN_BODY_ID,
  perturbingBodyIds: PERTURBING_PLANET_IDS,
  includeIndirectTerms: true,
  frameId: HORIZONS_FRAME.id,
  origin: HORIZONS_FRAME.origin,
  integratorMethod: INTEGRATOR_METHODS.DOPRI54,
  notes: 'Partícula de prueba en SUN_CENTER / ICRF_ECLIPTIC_J2000 con efemérides Horizons interpoladas mediante Hermite cúbica y términos de aceleración indirecta solar.'
});

export const EXPERIMENTAL_PROBE_01_PROVENANCE = createInitialConditionProvenance({
  kind: 'synthetic_interplanetary_injection',
  source: 'Definición experimental interna del simulador (Etapa 2B — no corresponde a una misión histórica de NASA)',
  epochJdTdb: EXPERIMENTAL_PROBE_01_EPOCH_JD_TDB,
  referenceBodyId: '399',
  isAuthenticHistorical: false,
  description: 'Estado de crucero interplanetario post-escape situado ~9.04e6 km (~6 radios de Hill terrestres) en el exterior de la Tierra el 2026-10-10 00:00:00 TDB, en transferencia elíptica inclinada (~5.6 deg) hacia la región orbital de Marte.'
});

/**
 * Construye el estado inicial explícito e inmutable de la Sonda Experimental 01.
 */
export function createExperimentalProbe01InitialState(catalog = SOLAR_SYSTEM_GM_CATALOG) {
  const gmSnapshot = catalog.snapshotForBodies([
    SUN_BODY_ID,
    ...PERTURBING_PLANET_IDS
  ]);

  return createProbeDynamicState({
    probe: EXPERIMENTAL_PROBE_01_DEFINITION,
    time: createSimulationInstant(EXPERIMENTAL_PROBE_01_EPOCH_JD_TDB, 0),
    position: {
      x: 151500000,
      y: 45200000,
      z: 2400000,
      unit: 'km'
    },
    velocity: {
      x: -4.2,
      y: 33.6,
      z: 3.1,
      unit: 'km/s'
    },
    origin: HORIZONS_FRAME.origin,
    reference: HORIZONS_FRAME,
    dynamicalModel: EXPERIMENTAL_PROBE_01_MODEL,
    gravitationalParameters: gmSnapshot,
    initialConditionProvenance: EXPERIMENTAL_PROBE_01_PROVENANCE,
    segmentIndex: 0
  });
}

/**
 * Propaga la trayectoria de la Sonda Experimental 01 dentro de la cobertura
 * disponible del proveedor de efemérides.
 */
export async function propagateExperimentalProbe01({
  ephemerisProvider,
  catalog = SOLAR_SYSTEM_GM_CATALOG,
  targetJdTdb = EXPERIMENTAL_PROBE_01_DEFAULT_END_JD_TDB,
  coveragePolicy = 'clamp_to_coverage',
  renderSampleIntervalSeconds = 1800
}) {
  const initialState = createExperimentalProbe01InitialState(catalog);
  return propagateProbeTrajectory({
    initialState,
    catalog,
    ephemerisProvider,
    targetJdTdb,
    coveragePolicy,
    integrator: {
      method: INTEGRATOR_METHODS.DOPRI54,
      absTol: [1e-6, 1e-6, 1e-6, 1e-9, 1e-9, 1e-9],
      relTol: 1e-11,
      minStepSeconds: 1e-2,
      maxStepSeconds: 14400
    },
    sampling: {
      renderSampleIntervalSeconds,
      maxComputationKnots: 50000,
      maxRenderSamples: 4096
    }
  });
}
