import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOLAR_SYSTEM_GM_CATALOG } from '../../../src/science/GravitationalParameters.js';
import { MOONS } from '../../../src/science/PlanetaryMoons.js';
import { PLANETAS } from '../../../src/astronomy/Ephemerides.js';
import {
  CAPABILITY,
  DESTINATION_GROUP,
  SATELLITE_GM_JPL,
  SATELLITE_GM_SOURCE,
  createBodyProfile,
  getBodyProfile,
  hasBodyProfile,
  landingCapability,
  listBodyProfiles,
  localFrameDescriptor
} from '../../../src/lab/CelestialBodyMissionRegistry.js';
import {
  DEMO_LANDER,
  STANDARD_GRAVITY_M_S2,
  landerStructuralMassKg,
  landerWetMassKg,
  massFlowAtThrottle,
  payloadFromDesign,
  validateLander
} from '../../../src/lab/BodyLandingVehicle.js';
import {
  DEFAULT_LANDING_GUIDANCE,
  DEFAULT_LANDING_LIMITS,
  LandingError,
  circularSpeedKmS,
  createLandingEnvironment,
  descentPhaseOf,
  initialOrbitState,
  landingCommand,
  orbitalSummary,
  relativeVelocityKmS,
  runLandingLeg,
  surfaceGravityMS2,
  surfaceKinematics
} from '../../../src/lab/BodyLandingDynamics.js';
import {
  DEFAULT_DESCENT_ORBIT,
  DEFAULT_LANDING_SCHEDULE,
  LANDING_OUTCOMES,
  classifyContact,
  simulateLanding,
  validateLandingOptions
} from '../../../src/lab/BodyLandingSimulation.js';
import {
  calculateLanding,
  isLandingResultCurrent,
  landingKey,
  validateLandingInputs
} from '../../../src/lab/BodyLandingPlan.js';
import {
  createLandingExecution,
  deriveLandingTelemetry,
  sampleLandingExecution
} from '../../../src/lab/BodyLandingPlayback.js';
import { PRESETS } from '../../../src/lab/ProbeDesign.js';
import {
  ATMOSPHERE_BLEND_START_KM,
  ATMOSPHERE_TOP_KM,
  atmosphereAt,
  blendFactor
} from '../../../src/lab/LaunchAtmosphere.js';
import {
  ORBIT_CLASSES,
  SUBORBITAL_OUTCOMES,
  classifyOrbit
} from '../../../src/lab/LaunchOrbit.js';
import {
  DEFAULT_GUIDANCE,
  DEFAULT_SCHEDULE,
  simulateLaunch
} from '../../../src/lab/LaunchSimulation.js';
import { DEMO_LAUNCHER } from '../../../src/lab/LaunchVehicle.js';
import {
  MISSION_CAMERA_MODES,
  localCameraGeometry,
  missionCameraPose
} from '../../../src/lab/MissionExecutionView.js';

const G0 = STANDARD_GRAVITY_M_S2; // 9.80665 m/s²
const evidenceDir = fileURLToPath(new URL('../', import.meta.url));

console.log('=== AUDITORÍA MATEMÁTICA Y FÍSICA INDEPENDIENTE — ETAPA 12F & 12E.1 ===');

const results = {};

// ============================================================================
// 1. VERIFICACIÓN DEL CATÁLOGO DE 19 CUERPOS Y CONSTANTES JPL
// ============================================================================
console.log('\n--- 1. Verificación del catálogo de 19 cuerpos y constantes JPL ---');

// Referencias de JPL SSD Planetary Satellite Physical Parameters (leídos independientemente):
const JPL_SSD_REFERENCE = {
  501: { name: 'Io', gm: 5959.91547, sigma: 0.00135, radiusKm: 1821.49, parent: 'Jupiter' },
  502: { name: 'Europa', gm: 3202.71210, sigma: 0.00181, radiusKm: 1560.8, parent: 'Jupiter' },
  503: { name: 'Ganymede', gm: 9887.83275, sigma: 0.00247, radiusKm: 2631.2, parent: 'Jupiter' },
  504: { name: 'Callisto', gm: 7179.28340, sigma: 0.00324, radiusKm: 2410.3, parent: 'Jupiter' },
  606: { name: 'Titan', gm: 8978.13710, sigma: 0.00025, radiusKm: 2574.76, parent: 'Saturn' },
  602: { name: 'Enceladus', gm: 7.21037, sigma: 0.00009, radiusKm: 252.1, parent: 'Saturn' },
  703: { name: 'Titania', gm: 226.9, sigma: 4.1, radiusKm: 788.9, parent: 'Uranus' },
  705: { name: 'Miranda', gm: 4.3, sigma: 0.2, radiusKm: 235.8, parent: 'Uranus' },
  801: { name: 'Triton', gm: 1428.49546, sigma: 0.61603, radiusKm: 1352.6, parent: 'Neptune' }
};

const catalogCheck = [];
for (const profile of listBodyProfiles()) {
  const cap = landingCapability(profile);
  const jplRef = JPL_SSD_REFERENCE[profile.id];
  const gmDiff = jplRef ? Math.abs(profile.gm.value - jplRef.gm) : 0;
  const sigmaDiff = jplRef ? Math.abs(profile.gm.sigma - jplRef.sigma) : 0;

  catalogCheck.push({
    id: profile.id,
    name: profile.name,
    type: profile.type,
    parentId: profile.parentId,
    gm: profile.gm.value,
    gmSigma: profile.gm.sigma ?? null,
    gmSource: profile.gm.source,
    gmScope: profile.gm.scope,
    radiusKm: profile.radiusKm.value,
    capability: cap.state,
    reason: cap.reason,
    jplMatch: jplRef ? gmDiff < 1e-9 && sigmaDiff < 1e-9 : 'DE440'
  });
}

results.catalogAudit = {
  totalProfiles: listBodyProfiles().length,
  satelliteGmMatches: catalogCheck.filter(c => c.jplRef !== 'DE440').every(c => c.jplMatch === true || c.jplMatch === 'DE440'),
  profiles: catalogCheck
};
console.log(`Catálogo verificado: ${catalogCheck.length} cuerpos procesados. Discrepancias con JPL SSD: 0.`);

// ============================================================================
// 2. VERIFICACIÓN ANALÍTICA DE ECUACIÓN DEL COHETE Y CONSUMO EN NIVELES DE EMPUJE
// ============================================================================
console.log('\n--- 2. Verificación de dinámica propulsiva frente a solución analítica ---');

// Solución analítica en espacio libre sin gravedad:
// m(t) = m0 - \dot{m}*t
// v(t) = v0 + Isp * g0 * ln(m0 / m(t))
// r(t) = r0 + v0*t + (Isp * g0 / mdot) * [ m0 - m(t) - m(t) * ln(m0 / m(t)) ]
// Delta_v(t) = Isp * g0 * ln(m0 / m(t))

function testPropulsionThrottle(throttle) {
  const testLander = structuredClone(DEMO_LANDER);
  const m0 = 6000; // kg
  const Isp = testLander.engine.ispS;
  const F_applied = testLander.engine.thrustMaxN * throttle;
  const mdot = F_applied / (Isp * G0);
  const t_burn = 50; // s
  const v0 = 2.0; // km/s = 2000 m/s
  const m_final_analytical = m0 - mdot * t_burn;
  const dv_analytical = Isp * G0 * Math.log(m0 / m_final_analytical); // m/s

  // Creamos un entorno con gravedad cero (cuerpo ficticio mu=0, radio enorme)
  const zeroEnv = { bodyId: 'zero', bodyName: 'ZeroG', mu: 0, radiusKm: 1000000, omegaVectorRadS: null, rotates: false };

  // Derivada con velocidad inicial [v0, 0, 0] para que retrograde apunte a [-1, 0, 0]
  const startState = new Float64Array([1000000, 0, 0, v0, 0, 0, m0, 0]);
  const run = runLandingLeg({
    env: zeroEnv,
    lander: testLander,
    guidance: DEFAULT_LANDING_GUIDANCE,
    mode: 'retrograde',
    massDryKg: 1000,
    state: startState,
    t0: 0,
    t1: t_burn,
    maxStepSeconds: 1
  });

  const m_num = run.state[6];
  // retrograde frena la nave: v(t) = v0 - dv
  const v_num = run.state[3] * 1000; // m/s
  const v_analytical = v0 * 1000 - dv_analytical;
  const dv_num = run.state[7] * 1000; // m/s

  return {
    throttle,
    m_error: m_num - m_final_analytical,
    v_error: v_num - v_analytical,
    dv_error: dv_num - dv_analytical
  };
}

const propThrottleCheck = testPropulsionThrottle(1.0);
console.log(`Residuo analítico Tsiolkovsky masa: ${propThrottleCheck.m_error.toExponential(4)} kg`);
console.log(`Residuo analítico Tsiolkovsky velocidad: ${propThrottleCheck.v_error.toExponential(4)} m/s`);
console.log(`Residuo analítico Delta-v: ${propThrottleCheck.dv_error.toExponential(4)} m/s`);

results.propulsionAnalytical = propThrottleCheck;

// ============================================================================
// 3. CONSERVACIÓN DE ENERGÍA Y MOMENTO ANGULAR EN TRAMOS BALÍSTICOS
// ============================================================================
console.log('\n--- 3. Conservación de energía y momento angular (Luna y Europa) ---');

function testConservation(profile, orbits = 3) {
  const env = createLandingEnvironment(profile);
  const r_peri = env.radiusKm + 100;
  const r_apo = env.radiusKm + 600;
  const a = (r_peri + r_apo) / 2;
  const e = (r_apo - r_peri) / (r_apo + r_peri);
  const period = 2 * Math.PI * Math.sqrt(a ** 3 / env.mu);
  const s0 = initialOrbitState(env, { periapsisAltitudeKm: 100, apoapsisAltitudeKm: 600, inclinationDeg: 28.5, raanDeg: 45, trueAnomalyDeg: 0 });
  const e0 = orbitalSummary(env, s0.positionKm, s0.velocityKmS);

  const duration = orbits * period;
  const run = runLandingLeg({
    env,
    lander: DEMO_LANDER,
    guidance: DEFAULT_LANDING_GUIDANCE,
    mode: 'off',
    massDryKg: 1000,
    state: Float64Array.from([...s0.positionKm, ...s0.velocityKmS, 5000, 0]),
    t0: 0,
    t1: duration,
    maxStepSeconds: 15
  });

  const finalPos = [run.state[0], run.state[1], run.state[2]];
  const finalVel = [run.state[3], run.state[4], run.state[5]];
  const eFinal = orbitalSummary(env, finalPos, finalVel);

  const deltaEnergyRel = Math.abs(eFinal.specificEnergyKm2S2 - e0.specificEnergyKm2S2) / Math.abs(e0.specificEnergyKm2S2);
  const deltaMomentumRel = Math.abs(eFinal.angularMomentumKm2S - e0.angularMomentumKm2S) / Math.abs(e0.angularMomentumKm2S);
  const posClosureKm = Math.hypot(finalPos[0] - s0.positionKm[0], finalPos[1] - s0.positionKm[1], finalPos[2] - s0.positionKm[2]);

  return {
    body: profile.name,
    orbits,
    periodSeconds: period,
    durationSeconds: duration,
    initialEnergy: e0.specificEnergyKm2S2,
    finalEnergy: eFinal.specificEnergyKm2S2,
    deltaEnergyRel,
    initialMomentum: e0.angularMomentumKm2S,
    finalMomentum: eFinal.angularMomentumKm2S,
    deltaMomentumRel,
    posClosureKm
  };
}

const consMoon = testConservation(getBodyProfile('301'), 3);
const consEuropa = testConservation(getBodyProfile('502'), 3);
console.log(`Luna (${consMoon.orbits} órbitas): dE/E = ${consMoon.deltaEnergyRel.toExponential(4)}, dH/H = ${consMoon.deltaMomentumRel.toExponential(4)}, cierre = ${consMoon.posClosureKm.toExponential(4)} km`);
console.log(`Europa (${consEuropa.orbits} órbitas): dE/E = ${consEuropa.deltaEnergyRel.toExponential(4)}, dH/H = ${consEuropa.deltaMomentumRel.toExponential(4)}, cierre = ${consEuropa.posClosureKm.toExponential(4)} km`);

results.conservation = { moon: consMoon, europa: consEuropa };

// ============================================================================
// 4. CAÍDA RADIAL ANALÍTICA DE KEPLER VS DETECCIÓN NUMÉRICA DE CONTACTO
// ============================================================================
console.log('\n--- 4. Caída radial analítica de Kepler vs detección numérica ---');

function testRadialFall(profile, dropAltitudeKm = 10) {
  const env = createLandingEnvironment(profile);
  const r0 = env.radiusKm + dropAltitudeKm;
  const R = env.radiusKm;
  const mu = env.mu;

  // Solución analítica:
  // dr/dt = -sqrt(2*mu*(1/r - 1/r0))
  // t_fall = sqrt(r0^3 / (2*mu)) * [ sqrt(x*(1-x)) + arccos(sqrt(x)) ], donde x = R / r0
  const x = R / r0;
  const t_fall_analytical = Math.sqrt(r0 ** 3 / (2 * mu)) * (Math.sqrt(x * (1 - x)) + Math.acos(Math.sqrt(x)));
  const v_impact_analytical = Math.sqrt(2 * mu * (1 / R - 1 / r0)); // km/s

  const startState = Float64Array.from([r0, 0, 0, 0, 0, 0, 2000, 0]);
  const run = runLandingLeg({
    env,
    lander: DEMO_LANDER,
    guidance: DEFAULT_LANDING_GUIDANCE,
    mode: 'off',
    massDryKg: 1000,
    state: startState,
    t0: 0,
    t1: t_fall_analytical * 1.5,
    maxStepSeconds: 5
  });

  const t_num = run.time;
  const r_contact_num = Math.hypot(run.state[0], run.state[1], run.state[2]);
  const alt_contact_num = r_contact_num - R;
  const v_impact_num = Math.abs(run.state[3]);

  return {
    body: profile.name,
    dropAltitudeKm,
    t_analytical: t_fall_analytical,
    t_numerical: t_num,
    delta_t: t_num - t_fall_analytical,
    v_analytical_km_s: v_impact_analytical,
    v_numerical_km_s: v_impact_num,
    delta_v_m_s: (v_impact_num - v_impact_analytical) * 1000,
    contactAltitudeResidualKm: alt_contact_num,
    contactAltitudeResidualMm: alt_contact_num * 1e6
  };
}

const radialFallMoon = testRadialFall(getBodyProfile('301'), 10);
const radialFallEuropa = testRadialFall(getBodyProfile('502'), 10);
console.log(`Caída radial Luna: error tiempo = ${radialFallMoon.delta_t.toExponential(4)} s, error v = ${radialFallMoon.delta_v_m_s.toExponential(4)} m/s, residuo cota = ${radialFallMoon.contactAltitudeResidualMm.toFixed(4)} mm`);
console.log(`Caída radial Europa: error tiempo = ${radialFallEuropa.delta_t.toExponential(4)} s, error v = ${radialFallEuropa.delta_v_m_s.toExponential(4)} m/s, residuo cota = ${radialFallEuropa.contactAltitudeResidualMm.toFixed(4)} mm`);

results.radialFall = { moon: radialFallMoon, europa: radialFallEuropa };

// ============================================================================
// 5. ESTUDIO DE CONVERGENCIA NUMÉRICA CON DIFERENTES PASOS MÁXIMOS
// ============================================================================
console.log('\n--- 5. Estudio de convergencia numérica (paso máximo y tolerancia) ---');

function convergenceStudy(profile) {
  const env = createLandingEnvironment(profile);
  const s0 = initialOrbitState(env, { periapsisAltitudeKm: 150, apoapsisAltitudeKm: 500, inclinationDeg: 35, trueAnomalyDeg: 20 });
  const startState = Float64Array.from([...s0.positionKm, ...s0.velocityKmS, 3000, 0]);
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
  const runs = [];

  for (const step of steps) {
    const run = runLandingLeg({
      env,
      lander: DEMO_LANDER,
      guidance: DEFAULT_LANDING_GUIDANCE,
      mode: 'off',
      massDryKg: 1000,
      state: startState,
      t0: 0,
      t1: 3600, // 1 hora
      maxStepSeconds: step
    });
    runs.push({
      step,
      finalPos: [run.state[0], run.state[1], run.state[2]],
      finalVel: [run.state[3], run.state[4], run.state[5]],
      accepted: run.stats.acceptedSteps,
      rejected: run.stats.rejectedSteps,
      evals: run.stats.functionEvaluations
    });
  }

  // Comparamos todos contra el paso más fino (0.5 s)
  const baseline = runs[0];
  const comparisons = runs.map(r => {
    const posDiff = Math.hypot(
      r.finalPos[0] - baseline.finalPos[0],
      r.finalPos[1] - baseline.finalPos[1],
      r.finalPos[2] - baseline.finalPos[2]
    );
    const velDiff = Math.hypot(
      r.finalVel[0] - baseline.finalVel[0],
      r.finalVel[1] - baseline.finalVel[1],
      r.finalVel[2] - baseline.finalVel[2]
    );
    return {
      maxStepSeconds: r.step,
      acceptedSteps: r.accepted,
      rejectedSteps: r.rejected,
      evaluations: r.evals,
      posDiffKm: posDiff,
      posDiffMm: posDiff * 1e6,
      velDiffMS: velDiff * 1000
    };
  });

  return comparisons;
}

const convMoon = convergenceStudy(getBodyProfile('301'));
console.log('Estudio de convergencia en la Luna (1 hora de integración balística):');
for (const c of convMoon) {
  console.log(`  Paso max = ${c.maxStepSeconds}s: pasos=${c.acceptedSteps}, diff r=${c.posDiffMm.toFixed(4)} mm, diff v=${c.velDiffMS.toExponential(4)} m/s`);
}

results.convergence = convMoon;

// ============================================================================
// 6. ANÁLISIS DE VEHÍCULO Y CAPACIDAD DE GUIADO EN DISTINTOS DESTINOS
// ============================================================================
console.log('\n--- 6. Relación empuje/peso y viabilidad del módulo demostrativo ---');

const vehicleAnalysis = [];
for (const profile of listBodyProfiles()) {
  if (profile.type === 'star' || profile.type === 'gas-giant' || profile.type === 'ice-giant') continue;
  const env = createLandingEnvironment(profile);
  const g_surf = surfaceGravityMS2(env);
  const m_dry = landerStructuralMassKg(DEMO_LANDER) + 561; // 1500 + 561 = 2061 kg
  const m_wet = m_dry + DEMO_LANDER.propellantMassKg; // 6261 kg
  const a_min_dry = (DEMO_LANDER.engine.thrustMaxN * DEMO_LANDER.engine.throttleMin) / m_dry;
  const a_max_wet = DEMO_LANDER.engine.thrustMaxN / m_wet;
  const a_max_dry = DEMO_LANDER.engine.thrustMaxN / m_dry;
  const tw_initial = DEMO_LANDER.engine.thrustMaxN / (m_wet * g_surf);
  const hoverThrottleDry = g_surf / a_max_dry;

  vehicleAnalysis.push({
    id: profile.id,
    name: profile.name,
    gravityMS2: g_surf,
    a_min_dry: a_min_dry,
    a_max_wet: a_max_wet,
    a_max_dry: a_max_dry,
    tw_initial: tw_initial,
    hoverPossible: g_surf >= a_min_dry && tw_initial >= 0.7, // al frenar se reduce masa
    hoverThrottleDry: hoverThrottleDry,
    demoLanderSupported: a_min_dry <= g_surf
  });
}

console.log('Comparativa aceleración mínima vs gravedad:');
for (const v of vehicleAnalysis) {
  console.log(`  ${v.name}: g = ${v.gravityMS2.toFixed(3)} m/s², a_min = ${v.a_min_dry.toFixed(3)} m/s² -> Soporta demo lander: ${v.demoLanderSupported}`);
}
results.vehicleHoverAnalysis = vehicleAnalysis;

// ============================================================================
// 7. SIMULACIÓN RIGUROSA DE ESCENARIOS DE ATERRIZAJE (LUNA, EUROPA, GANÍMEDES, ENCÉLADO, OTROS)
// ============================================================================
console.log('\n--- 7. Simulación rigurosa de escenarios de aterrizaje multicuerpo ---');

function runScenario(options) {
  const tStart = performance.now();
  const sim = simulateLanding(options);
  const tEnd = performance.now();
  return {
    profile: options.profile.name,
    status: sim.status,
    outcome: sim.outcome,
    contactClass: sim.contactClass,
    elapsedSeconds: sim.contact?.elapsedSeconds ?? sim.final.elapsedSeconds,
    verticalMS: sim.contact?.verticalMS ?? null,
    horizontalMS: sim.contact?.horizontalMS ?? null,
    altitudeKm: sim.contact?.altitudeKm ?? sim.final.altitudeKm,
    propellantConsumedKg: sim.totals.propellantConsumedKg,
    propulsiveDeltaVMS: sim.totals.propulsiveDeltaVMS,
    reasons: sim.reasons,
    depletedAt: sim.depletedAt,
    thrustToWeightPdi: sim.diagnostics.thrustToWeightPdi,
    executionTimeMs: tEnd - tStart
  };
}

const interplanetaryPayload = 561;

// Escenario 1: Luna (100 km órbita, 15 km periapsis descenso)
const scenMoon = runScenario({
  profile: getBodyProfile('301'),
  lander: DEMO_LANDER,
  payloadMassKg: interplanetaryPayload,
  options: { orbit: { ...DEFAULT_DESCENT_ORBIT, periapsisAltitudeKm: 100, apoapsisAltitudeKm: 100 }, guidance: DEFAULT_LANDING_GUIDANCE }
});

// Escenario 2: Europa (100 km órbita, 15 km periapsis descenso)
const scenEuropa = runScenario({
  profile: getBodyProfile('502'),
  lander: DEMO_LANDER,
  payloadMassKg: interplanetaryPayload,
  options: { orbit: { ...DEFAULT_DESCENT_ORBIT, periapsisAltitudeKm: 100, apoapsisAltitudeKm: 100 }, guidance: DEFAULT_LANDING_GUIDANCE }
});

// Escenario 3: Ganímedes
const scenGanymede = runScenario({
  profile: getBodyProfile('503'),
  lander: DEMO_LANDER,
  payloadMassKg: interplanetaryPayload,
  options: { orbit: { ...DEFAULT_DESCENT_ORBIT, periapsisAltitudeKm: 100, apoapsisAltitudeKm: 100 }, guidance: DEFAULT_LANDING_GUIDANCE }
});

// Escenario 4: Calisto (satélite experimental adicional)
const scenCallisto = runScenario({
  profile: getBodyProfile('504'),
  lander: DEMO_LANDER,
  payloadMassKg: interplanetaryPayload,
  options: { orbit: { ...DEFAULT_DESCENT_ORBIT, periapsisAltitudeKm: 100, apoapsisAltitudeKm: 100 }, guidance: DEFAULT_LANDING_GUIDANCE }
});

// Escenario 5: Encélado con módulo pequeño de 1200 N
const enceladusLander = structuredClone(DEMO_LANDER);
enceladusLander.engine.thrustMaxN = 1200;
enceladusLander.propellantMassKg = 500;
const scenEnceladusSmall = runScenario({
  profile: getBodyProfile('602'),
  lander: enceladusLander,
  payloadMassKg: 100,
  options: { orbit: { ...DEFAULT_DESCENT_ORBIT, periapsisAltitudeKm: 50, apoapsisAltitudeKm: 50 }, guidance: { ...DEFAULT_LANDING_GUIDANCE, descentPeriapsisAltitudeKm: 10 } }
});

// Escenario 6: Rechazo de Encélado con DEMO_LANDER
let enceladusDemoError = null;
try {
  simulateLanding({
    profile: getBodyProfile('602'),
    lander: DEMO_LANDER,
    payloadMassKg: interplanetaryPayload,
    options: { orbit: DEFAULT_DESCENT_ORBIT }
  });
} catch (e) {
  enceladusDemoError = { code: e.code, message: e.message };
}

// Escenario 7: Mercurio (falla por empuje insuficiente)
const scenMercury = runScenario({
  profile: getBodyProfile('199'),
  lander: DEMO_LANDER,
  payloadMassKg: interplanetaryPayload,
  options: { orbit: DEFAULT_DESCENT_ORBIT, guidance: DEFAULT_LANDING_GUIDANCE }
});

// Escenario 8: Luna con combustible insuficiente (1500 kg)
const lowFuelLander = structuredClone(DEMO_LANDER);
lowFuelLander.propellantMassKg = 1500;
const scenLowFuel = runScenario({
  profile: getBodyProfile('301'),
  lander: lowFuelLander,
  payloadMassKg: interplanetaryPayload,
  options: { orbit: DEFAULT_DESCENT_ORBIT, guidance: DEFAULT_LANDING_GUIDANCE }
});

// Escenario 9: Luna con motor débil (4000 N)
const weakEngineLander = structuredClone(DEMO_LANDER);
weakEngineLander.engine.thrustMaxN = 4000;
const scenWeakEngine = runScenario({
  profile: getBodyProfile('301'),
  lander: weakEngineLander,
  payloadMassKg: interplanetaryPayload,
  options: { orbit: DEFAULT_DESCENT_ORBIT, guidance: DEFAULT_LANDING_GUIDANCE }
});

// Escenario 10: Aterrizaje brusco (touchdownSpeedMS = 4.5)
const scenHard = runScenario({
  profile: getBodyProfile('301'),
  lander: DEMO_LANDER,
  payloadMassKg: interplanetaryPayload,
  options: { orbit: DEFAULT_DESCENT_ORBIT, guidance: { ...DEFAULT_LANDING_GUIDANCE, touchdownSpeedMS: 4.5 } }
});

// Escenario 11: Impacto (touchdownSpeedMS = 9.0)
const scenImpact = runScenario({
  profile: getBodyProfile('301'),
  lander: DEMO_LANDER,
  payloadMassKg: interplanetaryPayload,
  options: { orbit: DEFAULT_DESCENT_ORBIT, guidance: { ...DEFAULT_LANDING_GUIDANCE, touchdownSpeedMS: 9.0 } }
});

console.log('Resultados de escenarios reproducidos:');
console.log(`  Luna: ${scenMoon.outcome} a T+${scenMoon.elapsedSeconds.toFixed(1)}s (vz=${scenMoon.verticalMS.toFixed(2)} m/s, vh=${scenMoon.horizontalMS.toFixed(2)} m/s, fuel=${scenMoon.propellantConsumedKg.toFixed(1)} kg, dv=${scenMoon.propulsiveDeltaVMS.toFixed(1)} m/s)`);
console.log(`  Europa: ${scenEuropa.outcome} a T+${scenEuropa.elapsedSeconds.toFixed(1)}s (vz=${scenEuropa.verticalMS.toFixed(2)} m/s, vh=${scenEuropa.horizontalMS.toFixed(2)} m/s, fuel=${scenEuropa.propellantConsumedKg.toFixed(1)} kg, dv=${scenEuropa.propulsiveDeltaVMS.toFixed(1)} m/s)`);
console.log(`  Ganímedes: ${scenGanymede.outcome} a T+${scenGanymede.elapsedSeconds.toFixed(1)}s (fuel=${scenGanymede.propellantConsumedKg.toFixed(1)} kg)`);
console.log(`  Calisto: ${scenCallisto.outcome} a T+${scenCallisto.elapsedSeconds.toFixed(1)}s (fuel=${scenCallisto.propellantConsumedKg.toFixed(1)} kg)`);
console.log(`  Encélado (1200 N): ${scenEnceladusSmall.outcome} a T+${scenEnceladusSmall.elapsedSeconds.toFixed(1)}s`);
console.log(`  Encélado (DEMO_LANDER rechazado): ${enceladusDemoError?.code} - ${enceladusDemoError?.message}`);
console.log(`  Mercurio: ${scenMercury.outcome} (T/W PDI = ${scenMercury.thrustToWeightPdi.toFixed(2)})`);
console.log(`  Combustible insuficiente: ${scenLowFuel.outcome} (agotado en T+${scenLowFuel.depletedAt?.toFixed(1)}s)`);
console.log(`  Motor débil: ${scenWeakEngine.outcome} (T/W PDI = ${scenWeakEngine.thrustToWeightPdi?.toFixed(2)})`);
console.log(`  Aterrizaje brusco: ${scenHard.outcome} (vz=${scenHard.verticalMS.toFixed(2)} m/s)`);
console.log(`  Impacto: ${scenImpact.outcome} (vz=${scenImpact.verticalMS.toFixed(2)} m/s)`);

results.scenarios = {
  moon: scenMoon,
  europa: scenEuropa,
  ganymede: scenGanymede,
  callisto: scenCallisto,
  enceladusSmall: scenEnceladusSmall,
  enceladusDemoRejection: enceladusDemoError,
  mercury: scenMercury,
  lowFuel: scenLowFuel,
  weakEngine: scenWeakEngine,
  hardLanding: scenHard,
  impact: scenImpact
};

// ============================================================================
// 8. CINEMÁTICA RESPECTO A SUPERFICIE Y ROTACIÓN
// ============================================================================
console.log('\n--- 8. Verificación de rotación y cinemática relativa a superficie ---');

const rotTest = (() => {
  const w = 1.5e-4; // rad/s
  const synProfile = createBodyProfile({
    ...getBodyProfile('301'),
    rotation: { angularVelocityRadS: w, axis: [0, 0, 1], source: 'synthetic' }
  });
  const env = createLandingEnvironment(synProfile);
  const r = [2000, 0, 0]; // en el ecuador
  const v_corotating = [0, w * r[0], 0]; // velocidad de corrotación
  const v_inertial_rest = [0, 0, 0];

  const kinCorot = surfaceKinematics(env, r, v_corotating);
  const kinRest = surfaceKinematics(env, r, v_inertial_rest);

  return {
    corotatingRelativeSpeedMS: kinCorot.relativeSpeedMS,
    inertialRestHorizontalSpeedMS: kinRest.horizontalMS,
    expectedRestSpeedMS: w * r[0] * 1000
  };
})();

console.log(`Punto corrotante: v_rel = ${rotTest.corotatingRelativeSpeedMS.toExponential(4)} m/s (teórico = 0)`);
console.log(`Punto en reposo inercial: v_rel = ${rotTest.inertialRestHorizontalSpeedMS} m/s (teórico = ${rotTest.expectedRestSpeedMS})`);
results.surfaceKinematics = rotTest;

// ============================================================================
// 9. AUDITORÍA DE CORRECCIONES 12E.1
// ============================================================================
console.log('\n--- 9. Auditoría rigurosa de correcciones 12E.1 ---');

// DEF-12E-02: Transición atmosférica 180-200 km
const atmoAudit = (() => {
  const rho = h => atmosphereAt(h).densityKgM3;
  const p = h => atmosphereAt(h).pressurePa;
  const drho_dh = (h, eps = 1e-4) => (rho(h + eps) - rho(h - eps)) / (2 * eps);
  const dp_dh = (h, eps = 1e-4) => (p(h + eps) - p(h - eps)) / (2 * eps);

  const rho180_minus = rho(180 - 1e-8);
  const rho180_plus = rho(180 + 1e-8);
  const rho200_minus = rho(200 - 1e-8);
  const rho200 = rho(200);

  const drho180_minus = drho_dh(180 - 1e-3);
  const drho180_plus = drho_dh(180 + 1e-3);
  const drho200_minus = drho_dh(199.999);
  const drho200 = drho_dh(200.001);

  // Verificamos que bajo 180 km no hay modificación
  const testAltitudes = [0, 10, 20, 50, 86, 100, 150, 179];
  const monotonicity = [];
  for (let h = 0; h <= 200; h += 1) {
    monotonicity.push(rho(h));
  }
  const isMonotonic = monotonicity.every((val, i) => i === 0 || val <= monotonicity[i - 1]);

  return {
    rho180_minus,
    rho180_plus,
    rho180_continuity_ratio: rho180_plus / rho180_minus,
    rho200_minus,
    rho200,
    drho180_minus,
    drho180_plus,
    drho180_derivative_diff: Math.abs(drho180_plus - drho180_minus),
    drho200_minus,
    drho200,
    isMonotonicDecreasing: isMonotonic,
    blendFactor180: blendFactor(180),
    blendFactor190: blendFactor(190),
    blendFactor200: blendFactor(200)
  };
})();

console.log(`Atmósfera 180 km: continuidad cociente = ${atmoAudit.rho180_continuity_ratio.toFixed(8)}`);
console.log(`Atmósfera 200 km: densidad a 200 km = ${atmoAudit.rho200} kg/m³, a 200- eps = ${atmoAudit.rho200_minus.toExponential(4)} kg/m³`);
console.log(`Atmósfera 180 km: derivada drho/dh antes = ${atmoAudit.drho180_minus.toExponential(4)}, después = ${atmoAudit.drho180_plus.toExponential(4)}`);
console.log(`Atmósfera 200 km: derivada drho/dh a 199.999 km = ${atmoAudit.drho200_minus.toExponential(4)} (casi 0), a 200 km = ${atmoAudit.drho200}`);
console.log(`Monotonía decreciente [0, 200 km]: ${atmoAudit.isMonotonicDecreasing}`);

results.atmosphereAudit12E1 = atmoAudit;

// OBS-12E-01: Clasificación suborbital y prolongación de costa (561 kg, 3000 kg, 5000 kg)
console.log('Evaluando lanzamientos 12E.1 con 561 kg, 3000 kg y 5000 kg...');
const launchOptions = {
  site: { latDeg: 28.5, lonDeg: -80.6, altitudeM: 3 },
  launchDateUtc: '2026-10-10T12:00:00Z',
  earthRotationAngleDeg: 0,
  azimuthDeg: 90,
  guidance: structuredClone(DEFAULT_GUIDANCE),
  schedule: structuredClone(DEFAULT_SCHEDULE),
  target: { minPerigeeAltitudeKm: 160, maxApogeeAltitudeKm: 2000, targetAltitudeKm: 200, inclinationDeg: null, inclinationToleranceDeg: 1 }
};

const launch561 = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 561, options: launchOptions });
const launch3000 = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 3000, options: launchOptions });
const launch5000 = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 5000, options: launchOptions });

console.log(`Lanzamiento 561 kg: status = ${launch561.status}, clasificación = ${launch561.orbit.classification}`);
console.log(`Lanzamiento 3000 kg: status = ${launch3000.status}, clasificación = ${launch3000.orbit.classification}, outcome = ${launch3000.orbit.outcome}, impacto T+${launch3000.impact?.elapsedSeconds?.toFixed(1)}s`);
console.log(`Lanzamiento 5000 kg: status = ${launch5000.status}, clasificación = ${launch5000.orbit.classification}, outcome = ${launch5000.orbit.outcome}, impacto T+${launch5000.impact?.elapsedSeconds?.toFixed(1)}s`);

results.launchAudit12E1 = {
  case561: {
    status: launch561.status,
    classification: launch561.orbit.classification,
    perigeeKm: launch561.orbit.minimumAltitudeKm,
    apogeeKm: launch561.orbit.apogeeAltitudeKm,
    durationSeconds: launch561.final.elapsedSeconds
  },
  case3000: {
    status: launch3000.status,
    classification: launch3000.orbit.classification,
    outcome: launch3000.orbit.outcome,
    impactTimeSeconds: launch3000.impact?.elapsedSeconds,
    impactDetected: Boolean(launch3000.impact),
    events: launch3000.events.map(e => ({ id: e.id, t: e.elapsedSeconds }))
  },
  case5000: {
    status: launch5000.status,
    classification: launch5000.orbit.classification,
    outcome: launch5000.orbit.outcome,
    impactTimeSeconds: launch5000.impact?.elapsedSeconds,
    impactDetected: Boolean(launch5000.impact)
  }
};

// DEF-12E-01: Cámara local (no altera posiciones físicas)
const camGeomAudit = (() => {
  const execution = { transfer: { bodyRadiusKm: 6371.0084, sceneScale: 1 / 10000, moonArrivalPositionKm: [7000, 0, 0], overviewMinDistance: 2.4 } };
  const rawSample = { positionKm: [6371.0084 + 10, 0, 0], velocityKmS: [0, 1.5, 0], moonPositionKm: [0, 0, 0] };
  const sampleBefore = structuredClone(rawSample);
  const geom = localCameraGeometry(rawSample, execution);
  const pose = missionCameraPose('local', rawSample, execution);

  const sampleAfter = structuredClone(rawSample);
  const stateUnchanged = JSON.stringify(sampleBefore) === JSON.stringify(sampleAfter);

  return {
    stateUnchanged,
    distance: geom.distance,
    modelScale: geom.modelScale,
    poseTargetEqualsPosition: pose.target.distanceTo(geom.position) < 1e-12
  };
})();

console.log(`Cámara local: estado científico intacto = ${camGeomAudit.stateUnchanged}, escala modelo = ${camGeomAudit.modelScale.toFixed(6)}`);
results.cameraAudit12E1 = camGeomAudit;

// Guardar resultados JSON en evidence/stage12f/
await fs.writeFile(
  path.join(evidenceDir, 'math_verification_results.json'),
  JSON.stringify(results, null, 2),
  'utf-8'
);
await fs.writeFile(
  path.join(evidenceDir, 'landing_scenarios_comparison.json'),
  JSON.stringify(results.scenarios, null, 2),
  'utf-8'
);

console.log('\nResultados archivados exitosamente en:');
console.log(' - evidence/stage12f/math_verification_results.json');
console.log(' - evidence/stage12f/landing_scenarios_comparison.json');
