import { fileURLToPath } from 'node:url';
import { PRESETS } from '../../../src/lab/ProbeDesign.js';
import {
  EARTH_GM_KM3_S2, EARTH_ROTATION_RATE_RAD_S, WGS84_A_KM, WGS84_B_KM, WGS84_F, WGS84_E2,
  corotatingVelocityKmS, ecefToInertial, ellipsoidRadiusKm, geodeticFromPosition, geodeticToEcefKm,
  launchSiteState, localFrame, norm3, dot3
} from '../../../src/lab/LaunchEarth.js';
import { ATMOSPHERE_MODEL, atmosphereAt } from '../../../src/lab/LaunchAtmosphere.js';
import { DEMO_LAUNCHER, ispAt, liftoffThrustToWeight, massFlowKgS, payloadFromDesign, stackMassKg, thrustAt, validateLauncher } from '../../../src/lab/LaunchVehicle.js';
import { createEnvironment, evaluateForces, makeDerivative, runSegment } from '../../../src/lab/LaunchDynamics.js';
import { ORBIT_CLASSES, classifyOrbit, minimumOrbitAltitudeKm, orbitalElements } from '../../../src/lab/LaunchOrbit.js';
import { DEFAULT_GUIDANCE, DEFAULT_SCHEDULE, LAUNCH_MODEL_VERSION, describeStack, simulateLaunch, validateLaunchOptions } from '../../../src/lab/LaunchSimulation.js';
import { calculateLaunch } from '../../../src/lab/LaunchPlan.js';
import { createLaunchExecution, sampleLaunchExecution } from '../../../src/lab/LaunchPlayback.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const G0 = 9.80665;
const evidenceDir = fileURLToPath(new URL('../', import.meta.url));

const baseOptions = {
  site: { latDeg: 28.5, lonDeg: -80.6, altitudeM: 3 },
  launchDateUtc: '2026-10-10T12:00:00Z',
  earthRotationAngleDeg: 0,
  azimuthDeg: 90,
  guidance: structuredClone(DEFAULT_GUIDANCE),
  schedule: structuredClone(DEFAULT_SCHEDULE),
  target: { minPerigeeAltitudeKm: 160, maxApogeeAltitudeKm: 2000, targetAltitudeKm: 200, inclinationDeg: null, inclinationToleranceDeg: 1 }
};

console.log('--- Starting Independent Mathematical Verification (Stage 12E) ---');

// 1. Analytical Rocket Equation vs DOPRI54
console.log('Verifying Analytical Rocket Equation...');
const m0 = 100000; // 100,000 kg
const Isp = 310;
const F_vac = 1600000; // 1.6 MN
const mdot = F_vac / (Isp * G0); // kg/s
const t_burn = 100; // 100 s
const m_final_analytical = m0 - mdot * t_burn;
const delta_v_analytical = Isp * G0 * Math.log(m0 / m_final_analytical); // m/s
// Exact position analytical integral for constant thrust/mdot in free space:
// r(t) = r0 + v0*t + Isp*g0/mdot * [ m0 - m(t) - m(t)*ln(m0/m(t)) ]
const pos_analytical = (Isp * G0 / mdot) * (m0 - m_final_analytical - m_final_analytical * Math.log(m0 / m_final_analytical)); // meters

// Integrate numerically using runSegment with zero gravity and no atmosphere
const vacuumEnv = createEnvironment({ atmosphere: false, rotation: false, mu: 0, omega: 0 });
const testStage = {
  thrustVacuumN: F_vac,
  thrustSeaLevelN: F_vac,
  ispVacuumS: Isp,
  referenceAreaM2: 7.1,
  dragCoefficient: 0
};
const initialState = new Float64Array([100000, 0, 0, 0, 0, 0, m0, 0]);
const numRun = runSegment({
  env: vacuumEnv,
  cfg: { stage: testStage, guidance: { mode: 'inertial', vector: [1, 0, 0] }, aero: null },
  state: initialState,
  t0: 0,
  t1: t_burn,
  maxStepSeconds: 2
});

const m_num = numRun.state[6];
const v_num_ms = numRun.state[3] * 1000; // km/s -> m/s
const pos_num_m = (numRun.state[0] - 100000) * 1000; // km -> m (relative to initial)
const dv_num_ms = numRun.state[7] * 1000;

const mathAnalyticalComparison = {
  m0_kg: m0,
  Isp_s: Isp,
  thrust_N: F_vac,
  burn_time_s: t_burn,
  massFlowKgS: mdot,
  mass: {
    analytical_kg: m_final_analytical,
    integrated_kg: m_num,
    residual_kg: m_num - m_final_analytical,
    relative_error: Math.abs((m_num - m_final_analytical) / m_final_analytical)
  },
  velocity: {
    analytical_ms: delta_v_analytical,
    integrated_ms: v_num_ms,
    residual_ms: v_num_ms - delta_v_analytical,
    relative_error: Math.abs((v_num_ms - delta_v_analytical) / delta_v_analytical)
  },
  position: {
    analytical_m: pos_analytical,
    integrated_m: pos_num_m,
    residual_m: pos_num_m - pos_analytical,
    relative_error: Math.abs((pos_num_m - pos_analytical) / pos_analytical)
  },
  deltaV: {
    analytical_ms: delta_v_analytical,
    integrated_ms: dv_num_ms,
    residual_ms: dv_num_ms - delta_v_analytical,
    relative_error: Math.abs((dv_num_ms - delta_v_analytical) / delta_v_analytical)
  }
};
console.log('Math comparison results:', mathAnalyticalComparison);

// 2. Atmosphere Model US-1976 Checks
console.log('Verifying US-1976 Atmosphere Model...');
const geometricFromGeopotential = h => 6356.766 * h / (6356.766 - h);
const atmosphereSamples = [
  { h_geopot_km: 0, h_geom_km: 0, expected_p_pa: 101325, expected_t_k: 288.15, expected_rho_kgm3: 1.225 },
  { h_geopot_km: 11, h_geom_km: geometricFromGeopotential(11), expected_p_pa: 22632, expected_t_k: 216.65, expected_rho_kgm3: 0.36391 },
  { h_geopot_km: 20, h_geom_km: geometricFromGeopotential(20), expected_p_pa: 5474.9, expected_t_k: 216.65, expected_rho_kgm3: 0.088035 },
  { h_geopot_km: 32, h_geom_km: geometricFromGeopotential(32), expected_p_pa: 868.02, expected_t_k: 228.65, expected_rho_kgm3: 0.013225 },
  { h_geopot_km: 47, h_geom_km: geometricFromGeopotential(47), expected_p_pa: 110.91, expected_t_k: 270.65, expected_rho_kgm3: 0.0014275 }
].map(s => {
  const atm = atmosphereAt(s.h_geom_km);
  return {
    ...s,
    computed_p_pa: atm.pressurePa,
    computed_t_k: atm.temperatureK,
    computed_rho_kgm3: atm.densityKgM3,
    pressure_rel_err: Math.abs(atm.pressurePa - s.expected_p_pa) / s.expected_p_pa,
    temperature_abs_err: Math.abs(atm.temperatureK - s.expected_t_k)
  };
});

// Boundary checks: 86 km continuity and 200 km cutoff
const atm_86_minus = atmosphereAt(86 - 1e-6);
const atm_86_plus = atmosphereAt(86 + 1e-6);
const atm_200_minus = atmosphereAt(200 - 1e-6);
const atm_200_plus = atmosphereAt(200 + 1e-6);
const atmosphereBoundaries = {
  at_86km: {
    density_below: atm_86_minus.densityKgM3,
    density_above: atm_86_plus.densityKgM3,
    ratio: atm_86_plus.densityKgM3 / atm_86_minus.densityKgM3,
    pressure_below: atm_86_minus.pressurePa,
    pressure_above: atm_86_plus.pressurePa
  },
  at_200km: {
    density_below: atm_200_minus.densityKgM3,
    density_above: atm_200_plus.densityKgM3,
    pressure_below: atm_200_minus.pressurePa,
    pressure_above: atm_200_plus.pressurePa
  }
};

// 3. Earth Rotation & Geodesy
console.log('Verifying Geodesy & Earth Rotation...');
const equatorSite = launchSiteState({ latDeg: 0, lonDeg: 0, altitudeM: 0 });
const kscSite = launchSiteState({ latDeg: 28.5, lonDeg: -80.6, altitudeM: 3 });
const polarSite = launchSiteState({ latDeg: 90, lonDeg: 0, altitudeM: 0 });
const geodesyVerification = {
  equator: {
    speed_ms: equatorSite.surfaceSpeedKmS * 1000,
    theoretical_ms: EARTH_ROTATION_RATE_RAD_S * WGS84_A_KM * 1000,
    residual_ms: equatorSite.surfaceSpeedKmS * 1000 - EARTH_ROTATION_RATE_RAD_S * WGS84_A_KM * 1000
  },
  ksc: {
    speed_ms: kscSite.surfaceSpeedKmS * 1000,
    positionKm: kscSite.positionKm,
    altitudeKm: geodeticFromPosition(kscSite.positionKm).altitudeKm
  },
  polar: {
    speed_ms: polarSite.surfaceSpeedKmS * 1000,
    radiusKm: norm3(polarSite.positionKm),
    wgs84_b_km: WGS84_B_KM,
    residual_km: norm3(polarSite.positionKm) - WGS84_B_KM
  }
};

// 4. Scenarios Simulation & Deep Investigation
console.log('Simulating Launch Scenarios (561 kg, 3000 kg, 5000 kg)...');

// Scenario 1: Default probe (561 kg)
const sim561 = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 561, options: baseOptions });

// Scenario 2: Heavy payload 3000 kg
const sim3000 = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 3000, options: baseOptions });

// Scenario 3: Heavy payload 5000 kg
const sim5000 = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 5000, options: baseOptions });

// Scenario 4: TWR < 1 (Heavy payload e.g. 150,000 kg)
const simNoLiftoff = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 150000, options: baseOptions });

// Scenario 5: Circularization disabled (561 kg)
const optsNoCirc = structuredClone(baseOptions);
optsNoCirc.schedule.circularization.enabled = false;
const sim561NoCirc = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 561, options: optsNoCirc });

function summarizeSim(sim) {
  const last = sim.knots.at(-1);
  const alt = geodeticFromPosition(last.positionKm).altitudeKm;
  return {
    status: sim.status,
    classification: sim.orbit.classification,
    reasons: sim.orbit.reasons,
    liftoffThrustToWeight: sim.diagnostics.thrustToWeight,
    propulsiveDeltaVMS: sim.totals.propulsiveDeltaVMS,
    propellantConsumedKg: sim.totals.propellantConsumedKg,
    durationSeconds: sim.endSeconds,
    finalAltitudeKm: alt,
    finalSpeedKmS: norm3(last.velocityKmS),
    elements: sim.orbit.elements ? {
      semiMajorAxisKm: sim.orbit.elements.semiMajorAxisKm,
      eccentricity: sim.orbit.elements.eccentricity,
      periapsisRadiusKm: sim.orbit.elements.periapsisRadiusKm,
      apoapsisRadiusKm: sim.orbit.elements.apoapsisRadiusKm,
      inclinationDeg: sim.orbit.elements.inclinationDeg,
      specificEnergyKm2S2: sim.orbit.elements.specificEnergyKm2S2,
      bound: sim.orbit.elements.bound
    } : null,
    minimumAltitudeKm: sim.orbit.minimumAltitudeKm,
    apogeeAltitudeKm: sim.orbit.apogeeAltitudeKm,
    failure: sim.failure,
    impact: sim.impact,
    maxQ: sim.maxQ,
    eventsCount: sim.events.length,
    events: sim.events.map(e => ({ id: e.id, title: e.title, elapsedSeconds: e.elapsedSeconds }))
  };
}

const scenarioSummaries = {
  payload_561kg: summarizeSim(sim561),
  payload_3000kg: summarizeSim(sim3000),
  payload_5000kg: summarizeSim(sim5000),
  payload_150000kg_no_liftoff: summarizeSim(simNoLiftoff),
  payload_561kg_no_circularization: summarizeSim(sim561NoCirc)
};

console.log('561 kg Summary:', scenarioSummaries.payload_561kg.classification, scenarioSummaries.payload_561kg.minimumAltitudeKm, scenarioSummaries.payload_561kg.apogeeAltitudeKm);
console.log('3000 kg Summary:', scenarioSummaries.payload_3000kg.classification, scenarioSummaries.payload_3000kg.reasons, scenarioSummaries.payload_3000kg.finalAltitudeKm);
console.log('5000 kg Summary:', scenarioSummaries.payload_5000kg.classification, scenarioSummaries.payload_5000kg.reasons, scenarioSummaries.payload_5000kg.impact);

// 5. Staging mass continuity test
console.log('Testing Staging Continuity & Reversibility...');
const defaultDesign = PRESETS[1].create();
const exec561 = createLaunchExecution({ result: calculateLaunch({ design: defaultDesign, launcher: DEMO_LAUNCHER, options: baseOptions }), design: defaultDesign });

// Sample at key times:
// t = 0 (pad)
// t = 100 (stage 1 burn)
// t = 152 (MECO)
// t = 154 (separation)
// t = 200 (stage 2 burn)
// t = 400 (coast to apogee)
// t = 700 (circularized)
const sampleTimes = [0, 50, 150, 153, 155, 200, 340, 500, exec561.durationSeconds];
const samples = sampleTimes.map(t => {
  const s = sampleLaunchExecution(exec561, t);
  return {
    t,
    phase: s.phase,
    activeStage: s.activeStage,
    engineOn: s.engineOn,
    engineLabel: s.engineLabel,
    massKg: s.massKg,
    fuelKg: s.fuelKg,
    altitudeKm: s.altitudeKm,
    speedKmS: s.inertialSpeedKmS,
    relSpeedKmS: s.relativeSpeedKmS,
    dynPressurePa: s.dynamicPressurePa,
    thrustN: s.thrustN,
    thrustToWeight: s.thrustToWeight,
    propulsiveDeltaVMS: s.propulsiveDeltaVMS
  };
});

// Reversibility check: Forward -> Rewind -> Forward 10 cycles
let reversibilityPassed = true;
let maxStateDrift = 0;
const testT = 250;
const refSample = sampleLaunchExecution(exec561, testT);
for (let cycle = 1; cycle <= 10; cycle++) {
  sampleLaunchExecution(exec561, 0);
  sampleLaunchExecution(exec561, exec561.durationSeconds);
  const s = sampleLaunchExecution(exec561, testT);
  const drift = Math.abs(s.massKg - refSample.massKg) + Math.abs(s.fuelKg - refSample.fuelKg) + Math.abs(s.propulsiveDeltaVMS - refSample.propulsiveDeltaVMS);
  if (drift > 1e-12) reversibilityPassed = false;
  if (drift > maxStateDrift) maxStateDrift = drift;
}

const stagingAndReversibility = {
  samples,
  reversibilityCyclesTested: 10,
  reversibilityPassed,
  maxStateDrift
};

// Write output JSONs
const fullMathResults = {
  auditDate: '2026-11-17',
  stage: '12E',
  title: 'Verificación Numérica y Analítica Independiente — Lanzamiento Terrestre y Ascenso Atmosférico',
  constants: {
    g0_m_s2: G0,
    earth_mu_km3_s2: EARTH_GM_KM3_S2,
    wgs84_a_km: WGS84_A_KM,
    wgs84_b_km: WGS84_B_KM,
    wgs84_f: WGS84_F,
    wgs84_e2: WGS84_E2,
    earth_rotation_rad_s: EARTH_ROTATION_RATE_RAD_S
  },
  mathAnalyticalComparison,
  atmosphereSamples,
  atmosphereBoundaries,
  geodesyVerification,
  stagingAndReversibility
};

await fs.writeFile(path.join(evidenceDir, 'math_verification_results.json'), JSON.stringify(fullMathResults, null, 2));
await fs.writeFile(path.join(evidenceDir, 'launch_scenarios_comparison.json'), JSON.stringify(scenarioSummaries, null, 2));
console.log('Successfully wrote math verification evidence files.');
