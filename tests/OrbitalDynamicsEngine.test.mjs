import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPhysicalGravitationalCatalog,
  createSyntheticGravitationalCatalog,
  GM_UNIT,
  SOLAR_SYSTEM_GM_CATALOG,
  SUN_BODY_ID
} from '../src/science/GravitationalParameters.js';
import {
  advanceSimulationInstant,
  createSimulationInstant,
  decomposeJdTdbCalendar,
  formatMissionElapsedTime,
  jdTdbToElapsedSeconds
} from '../src/science/SimulationTime.js';
import {
  computeSpecificAngularMomentum,
  computeSpecificMechanicalEnergy,
  computeTwoBodyAcceleration,
  createTwoBodyDerivative,
  DynamicsError,
  evaluateHeliocentricProbeAcceleration,
  evaluateInertialMutualAccelerations
} from '../src/science/GravitationalDynamics.js';
import {
  DORMAND_PRINCE_54_TABLEAU,
  integrateDopri54,
  integrateRk4,
  IntegrationError,
  interpolateQuinticMechanicalState6
} from '../src/science/NumericalIntegrator.js';
import { gregorianLabelToJulianMidnight } from '../src/science/Time.js';
import { KM_PER_AU } from '../src/science/Units.js';

test('catálogo físico DE440 es inmutable, positivo y separado de catálogos sintéticos', () => {
  assert.equal(SOLAR_SYSTEM_GM_CATALOG.isSynthetic, false);
  assert.equal(SOLAR_SYSTEM_GM_CATALOG.unit, GM_UNIT);

  for (const id of ['10', '199', '299', '399', '301', '499', '599', '699', '799', '899']) {
    const param = SOLAR_SYSTEM_GM_CATALOG.getParameter(id);
    assert.ok(Number.isFinite(param.muKm3PerS2) && param.muKm3PerS2 > 0);
    assert.ok(Number.isFinite(param.referenceRadiusKm) && param.referenceRadiusKm > 0);
    assert.equal(param.isSynthetic, false);
    assert.throws(() => { param.muKm3PerS2 = 1; }, TypeError);
  }

  assert.throws(() => createPhysicalGravitationalCatalog({
    id: 'bad-synth',
    description: 'Intento de infiltrar sintético como físico',
    entries: [{
      bodyId: '10',
      name: 'Sol falso',
      muKm3PerS2: 100,
      massScope: 'synthetic',
      source: 'test'
    }]
  }), /no se permiten parámetros sintéticos/);

  const synthetic = createSyntheticGravitationalCatalog({
    entries: [{ bodyId: '10', name: 'Central sintético', muKm3PerS2: 1000, minSafeDistanceKm: 1 }]
  });
  assert.equal(synthetic.isSynthetic, true);
  assert.equal(synthetic.getParameter('10').massScope, 'synthetic');
});

test('tiempo interno en segundos preserva precisión sub-microsegundo frente a JD TDB', () => {
  const epochJd = gregorianLabelToJulianMidnight('2026-10-10');
  let instant = createSimulationInstant(epochJd, 0);
  // 1000 pasos de 10 microsegundos = 0.01 s; sumados directamente a JD ~2.46e6 se perderían (1 ULP ~ 40.2 us)
  for (let i = 0; i < 1000; i++) {
    instant = advanceSimulationInstant(instant, 1e-5);
  }
  assert.ok(Math.abs(instant.elapsedSeconds - 0.01) < 1e-14);
  assert.equal(jdTdbToElapsedSeconds(epochJd, epochJd + 1), 86400);

  const cal = decomposeJdTdbCalendar(epochJd, 14 * 3600 + 25 * 60 + 9);
  assert.equal(cal.dateIso, '2026-10-10');
  assert.equal(cal.timeHms, '14:25:09');
  assert.equal(formatMissionElapsedTime(90061), 'T+01d 01h 01m 01s');
});

test('Prueba 1: movimiento circular de dos cuerpos conserva radio, rapidez, periodo y cierre tras 1 revolución', () => {
  const mu = SOLAR_SYSTEM_GM_CATALOG.getMu(SUN_BODY_ID);
  const r0 = KM_PER_AU;
  const v0 = Math.sqrt(mu / r0);
  const period = 2 * Math.PI * Math.sqrt((r0 ** 3) / mu);
  const derivative = createTwoBodyDerivative({
    muKm3PerS2: mu,
    minDistanceKm: SOLAR_SYSTEM_GM_CATALOG.getParameter(SUN_BODY_ID).minSafeDistanceKm
  });

  const result = integrateDopri54({
    derivative,
    initialState: [r0, 0, 0, 0, v0, 0],
    startSeconds: 0,
    targetSeconds: period,
    absTol: [1e-6, 1e-6, 1e-6, 1e-11, 1e-11, 1e-11],
    relTol: 1e-12,
    recordSteps: true
  });

  let maxRadiusDeviationKm = 0;
  let maxSpeedDeviationKmPerS = 0;
  for (const state of result.knots.states) {
    const r = Math.hypot(state[0], state[1], state[2]);
    const v = Math.hypot(state[3], state[4], state[5]);
    maxRadiusDeviationKm = Math.max(maxRadiusDeviationKm, Math.abs(r - r0));
    maxSpeedDeviationKmPerS = Math.max(maxSpeedDeviationKmPerS, Math.abs(v - v0));
  }

  const closurePosErrorKm = Math.hypot(
    result.finalState[0] - r0,
    result.finalState[1] - 0,
    result.finalState[2] - 0
  );
  const closureVelErrorKmPerS = Math.hypot(
    result.finalState[3] - 0,
    result.finalState[4] - v0,
    result.finalState[5] - 0
  );

  console.log(
    `CIRCULAR_1AU period=${period.toFixed(3)}s steps=${result.acceptedSteps} `
    + `maxRadDev=${maxRadiusDeviationKm.toExponential(4)}km `
    + `closurePosErr=${closurePosErrorKm.toExponential(4)}km `
    + `closureVelErr=${closureVelErrorKmPerS.toExponential(4)}km/s`
  );

  assert.ok(maxRadiusDeviationKm < 0.01, `Desviación radial excesiva: ${maxRadiusDeviationKm} km`);
  assert.ok(maxSpeedDeviationKmPerS < 1e-8, `Desviación de rapidez excesiva: ${maxSpeedDeviationKmPerS} km/s`);
  assert.ok(closurePosErrorKm < 0.01, `Error de cierre tras 1 órbita excesivo: ${closurePosErrorKm} km`);
  assert.ok(closureVelErrorKmPerS < 1e-8);

  // Propagación reversible hacia atrás desde T hasta 0
  const backward = integrateDopri54({
    derivative,
    initialState: result.finalState,
    startSeconds: period,
    targetSeconds: 0,
    absTol: [1e-6, 1e-6, 1e-6, 1e-11, 1e-11, 1e-11],
    relTol: 1e-12
  });
  const roundTripErrKm = Math.hypot(backward.finalState[0] - r0, backward.finalState[1], backward.finalState[2]);
  assert.ok(roundTripErrKm < 0.02);
});

test('Pruebas 2 y 3: conservación de energía mecánica específica y momento angular en órbita elíptica 3D inclinada', () => {
  const mu = SOLAR_SYSTEM_GM_CATALOG.getMu('399'); // Tierra
  const a = 20000; // km
  const e = 0.5;
  const rPeri = a * (1 - e); // 10 000 km > 6371 km
  const vPeri = Math.sqrt(mu * (1 + e) / rPeri);
  const inc = (28.5 * Math.PI) / 180;
  const period = 2 * Math.PI * Math.sqrt((a ** 3) / mu);

  const initialPos = { x: rPeri, y: 0, z: 0 };
  const initialVel = { x: 0, y: vPeri * Math.cos(inc), z: vPeri * Math.sin(inc) };
  const e0 = computeSpecificMechanicalEnergy({ positionKm: initialPos, velocityKmPerS: initialVel, muKm3PerS2: mu });
  const h0 = computeSpecificAngularMomentum({ positionKm: initialPos, velocityKmPerS: initialVel });

  const derivative = createTwoBodyDerivative({ muKm3PerS2: mu, minDistanceKm: 6371.0084 });
  const result = integrateDopri54({
    derivative,
    initialState: [initialPos.x, initialPos.y, initialPos.z, initialVel.x, initialVel.y, initialVel.z],
    startSeconds: 0,
    targetSeconds: 3 * period, // 3 revoluciones excéntricas completas
    absTol: [1e-8, 1e-8, 1e-8, 1e-11, 1e-11, 1e-11],
    relTol: 1e-12,
    recordSteps: true
  });

  let maxRelEnergyError = 0;
  let maxRelAngularMomentumError = 0;
  for (const s of result.knots.states) {
    const pos = { x: s[0], y: s[1], z: s[2] };
    const vel = { x: s[3], y: s[4], z: s[5] };
    const energy = computeSpecificMechanicalEnergy({ positionKm: pos, velocityKmPerS: vel, muKm3PerS2: mu });
    const h = computeSpecificAngularMomentum({ positionKm: pos, velocityKmPerS: vel });
    const relE = Math.abs((energy - e0) / e0);
    const dh = Math.hypot(h.x - h0.x, h.y - h0.y, h.z - h0.z) / h0.magnitude;
    maxRelEnergyError = Math.max(maxRelEnergyError, relE);
    maxRelAngularMomentumError = Math.max(maxRelAngularMomentumError, dh);
  }

  console.log(
    `INVARIANTS_3REV_ECC0.5 steps=${result.acceptedSteps} rejected=${result.rejectedSteps} `
    + `maxRelEnergyErr=${maxRelEnergyError.toExponential(4)} `
    + `maxRelAngMomErr=${maxRelAngularMomentumError.toExponential(4)}`
  );

  assert.ok(maxRelEnergyError < 1e-10, `Deriva energética excesiva: ${maxRelEnergyError}`);
  assert.ok(maxRelAngularMomentumError < 1e-11, `Deriva de momento angular excesiva: ${maxRelAngularMomentumError}`);
});

test('Prueba 4: convergencia de orden 4 en RK4 y convergencia con tolerancias en DOPRI54', () => {
  // Consistencia algebraica del tableau de Dormand-Prince
  const T = DORMAND_PRINCE_54_TABLEAU;
  assert.ok(Math.abs((T.b1 + T.b2 + T.b3 + T.b4 + T.b5 + T.b6 + T.b7) - 1) < 1e-15);
  assert.ok(Math.abs(T.e1 + T.e2 + T.e3 + T.e4 + T.e5 + T.e6 + T.e7) < 1e-15);

  // Problema de Kepler normalizado (mu = 1, r_p = 1, e = 0.3) hasta t = 2.0 rad
  const mu = 1;
  const e = 0.3;
  const r0 = 1 - e;
  const v0 = Math.sqrt((1 + e) / (1 - e));
  const targetT = 2.0;
  const deriv = createTwoBodyDerivative({ muKm3PerS2: mu, minDistanceKm: 0.05 });

  // Referencia de ultra-alta precisión con DOPRI54 (tol = 1e-14)
  const ref = integrateDopri54({
    derivative: deriv,
    initialState: [r0, 0, 0, 0, v0, 0],
    startSeconds: 0,
    targetSeconds: targetT,
    absTol: 1e-14,
    relTol: 1e-14,
    minStepSeconds: 1e-9
  }).finalState;

  const steps = [0.05, 0.025, 0.0125];
  const rk4Errors = steps.map(h => {
    const out = integrateRk4({
      derivative: deriv,
      initialState: [r0, 0, 0, 0, v0, 0],
      startSeconds: 0,
      targetSeconds: targetT,
      stepSeconds: h
    }).finalState;
    return Math.hypot(out[0] - ref[0], out[1] - ref[1], out[2] - ref[2]);
  });

  const order1 = Math.log2(rk4Errors[0] / rk4Errors[1]);
  const order2 = Math.log2(rk4Errors[1] / rk4Errors[2]);

  const dopriLoose = integrateDopri54({
    derivative: deriv,
    initialState: [r0, 0, 0, 0, v0, 0],
    startSeconds: 0,
    targetSeconds: targetT,
    absTol: 1e-6,
    relTol: 1e-6
  }).finalState;
  const dopriTight = integrateDopri54({
    derivative: deriv,
    initialState: [r0, 0, 0, 0, v0, 0],
    startSeconds: 0,
    targetSeconds: targetT,
    absTol: 1e-10,
    relTol: 1e-10
  }).finalState;
  const errLoose = Math.hypot(dopriLoose[0] - ref[0], dopriLoose[1] - ref[1], dopriLoose[2] - ref[2]);
  const errTight = Math.hypot(dopriTight[0] - ref[0], dopriTight[1] - ref[1], dopriTight[2] - ref[2]);

  console.log(
    `CONVERGENCE RK4_errors=[${rk4Errors.map(x => x.toExponential(3)).join(', ')}] `
    + `orders=[${order1.toFixed(3)}, ${order2.toFixed(3)}] `
    + `DOPRI_err(1e-6->1e-10)=${errLoose.toExponential(3)}->${errTight.toExponential(3)}`
  );

  assert.ok(order1 > 3.9 && order1 < 4.2, `Orden RK4 inesperado: ${order1}`);
  assert.ok(order2 > 3.95 && order2 < 4.15, `Orden RK4 inesperado: ${order2}`);
  assert.ok(errTight < errLoose * 1e-3, 'DOPRI54 debe converger al refinar tolerancias');

  // Hermite quíntica reproduce exactamente un movimiento polinómico de grado 5
  // p(t) = 2 + 3t - 4t^2 + 0.5t^3 - 0.2t^4 + 0.05t^5
  const polyP = t => 2 + 3 * t - 4 * t ** 2 + 0.5 * t ** 3 - 0.2 * t ** 4 + 0.05 * t ** 5;
  const polyV = t => 3 - 8 * t + 1.5 * t ** 2 - 0.8 * t ** 3 + 0.25 * t ** 4;
  const polyA = t => -8 + 3 * t - 2.4 * t ** 2 + t ** 3;
  const s0 = new Float64Array([polyP(0), 0, 0, polyV(0), 0, 0]);
  const d0 = new Float64Array([polyV(0), 0, 0, polyA(0), 0, 0]);
  const s1 = new Float64Array([polyP(2), 0, 0, polyV(2), 0, 0]);
  const d1 = new Float64Array([polyV(2), 0, 0, polyA(2), 0, 0]);
  const mid = interpolateQuinticMechanicalState6(0, s0, d0, 2, s1, d1, 1.37);
  assert.ok(Math.abs(mid[0] - polyP(1.37)) < 1e-13);
  assert.ok(Math.abs(mid[3] - polyV(1.37)) < 1e-13);
});

test('Prueba 5: trayectoria hiperbólica de escape conserva energía positiva y tiende a v_infinito', () => {
  const mu = SOLAR_SYSTEM_GM_CATALOG.getMu('399');
  const r0 = 10000; // km
  const vEscape = Math.sqrt((2 * mu) / r0);
  const v0 = 1.25 * vEscape; // Exceso hiperbólico claro (epsilon > 0)
  const expectedEnergy = 0.5 * v0 * v0 - mu / r0;
  const vInfinity = Math.sqrt(2 * expectedEnergy);
  assert.ok(expectedEnergy > 0);

  const deriv = createTwoBodyDerivative({ muKm3PerS2: mu, minDistanceKm: 6371.0084 });
  const res = integrateDopri54({
    derivative: deriv,
    initialState: [r0, 0, 0, 0, v0, 0],
    startSeconds: 0,
    targetSeconds: 5 * 86400, // 5 días alejándose
    absTol: [1e-7, 1e-7, 1e-7, 1e-11, 1e-11, 1e-11],
    relTol: 1e-12,
    recordSteps: true
  });

  let prevR = 0;
  for (const state of res.knots.states) {
    const r = Math.hypot(state[0], state[1], state[2]);
    assert.ok(r > prevR, 'La distancia radial debe crecer monótonamente tras el periapsis hiperbólico');
    prevR = r;
  }

  const finalPos = { x: res.finalState[0], y: res.finalState[1], z: res.finalState[2] };
  const finalVel = { x: res.finalState[3], y: res.finalState[4], z: res.finalState[5] };
  const finalEnergy = computeSpecificMechanicalEnergy({ positionKm: finalPos, velocityKmPerS: finalVel, muKm3PerS2: mu });
  const finalSpeed = Math.hypot(finalVel.x, finalVel.y, finalVel.z);

  assert.ok(finalEnergy > 0);
  assert.ok(Math.abs((finalEnergy - expectedEnergy) / expectedEnergy) < 1e-11);
  // A ~3e6 km de la Tierra, la rapidez debe aproximarse estrechamente a v_infinito (> v_infinito por potencial residual)
  assert.ok(finalSpeed > vInfinity && finalSpeed - vInfinity < 0.05);
});

test('Prueba 6: múltiples cuerpos sintéticos, término indirecto heliocéntrico y equivalencia con marco baricéntrico', () => {
  const synthCatalog = createSyntheticGravitationalCatalog({
    entries: [
      { bodyId: '10', name: 'Sol sintético', muKm3PerS2: 1.0e8, minSafeDistanceKm: 10 },
      { bodyId: '599', name: 'Gigante A', muKm3PerS2: 1.0e6, minSafeDistanceKm: 5 },
      { bodyId: '699', name: 'Gigante B', muKm3PerS2: 5.0e5, minSafeDistanceKm: 5 }
    ]
  });

  const bodies = {
    '599': { x: 50000, y: 0, z: 0 },
    '699': { x: 0, y: 80000, z: 0 }
  };
  const probePos = { x: 10000, y: 10000, z: 0 };

  const breakdown = evaluateHeliocentricProbeAcceleration({
    positionKm: probePos,
    perturbingBodyIds: ['599', '699'],
    catalog: synthCatalog,
    getBodyPositionKm: id => bodies[id],
    includeIndirectTerms: true,
    includeBreakdown: true
  });

  // Verificación analítica manual
  const rProbe = Math.hypot(10000, 10000, 0);
  const expectedCentralX = -1.0e8 * 10000 / (rProbe ** 3);
  assert.ok(Math.abs(breakdown.central.x - expectedCentralX) < 1e-14);

  // Término indirecto de 599 en (50000, 0, 0): -mu_599 * (50000, 0, 0) / 50000^3 = (-1e6 / 2.5e9, 0, 0) = (-4e-4, 0, 0)
  assert.ok(Math.abs(breakdown.perBody['599'].indirect.x - (-4e-4)) < 1e-18);
  assert.ok(Math.abs(breakdown.perBody['599'].indirect.y) === 0);
  // Término indirecto de 699 en (0, 80000, 0): -5e5 / 80000^2 = -7.8125e-5 en Y
  assert.ok(Math.abs(breakdown.perBody['699'].indirect.y - (-5.0e5 / (80000 ** 2))) < 1e-18);

  // Suma total coincide con central + directo + indirecto
  assert.ok(Math.abs(
    breakdown.total.x - (breakdown.central.x + breakdown.directPerturbation.x + breakdown.indirectPerturbation.x)
  ) < 1e-15);
  assert.ok(Math.abs(
    breakdown.total.y - (breakdown.central.y + breakdown.directPerturbation.y + breakdown.indirectPerturbation.y)
  ) < 1e-15);

  // Equivalencia física dinámica: Sol + Planeta masivo en órbita circular mutua alrededor del baricentro.
  // Integramos la sonda en el marco baricéntrico inercial exacto y comparamos con la integración
  // en el marco heliocéntrico acelerado (con y sin término indirecto).
  const muSun = 1.0e6;
  const muJup = 5.0e4; // cociente 1:20 para hacer el movimiento solar muy pronunciado
  const muTot = muSun + muJup;
  const sep = 1000; // distancia constante Sol-Planeta
  const omega = Math.sqrt(muTot / (sep ** 3));
  const rSunBary = (muJup / muTot) * sep;
  const rJupBary = (muSun / muTot) * sep;

  const eqCatalog = createSyntheticGravitationalCatalog({
    entries: [
      { bodyId: '10', name: 'Sol', muKm3PerS2: muSun, minSafeDistanceKm: 1 },
      { bodyId: '599', name: 'Planeta', muKm3PerS2: muJup, minSafeDistanceKm: 1 }
    ]
  });

  // Posiciones baricéntricas exactas del Sol y del Planeta en función de t
  const sunBary = t => ({
    x: -rSunBary * Math.cos(omega * t),
    y: -rSunBary * Math.sin(omega * t),
    vx: rSunBary * omega * Math.sin(omega * t),
    vy: -rSunBary * omega * Math.cos(omega * t)
  });
  const jupBary = t => ({
    x: rJupBary * Math.cos(omega * t),
    y: rJupBary * Math.sin(omega * t)
  });

  // Estado inicial heliocéntrico de la sonda
  const rHelio0 = [250, 0, 0, 0, Math.sqrt(muSun / 250), 0];
  const s0Bary = sunBary(0);
  const rInertial0 = [
    rHelio0[0] + s0Bary.x,
    rHelio0[1] + s0Bary.y,
    0,
    rHelio0[3] + s0Bary.vx,
    rHelio0[4] + s0Bary.vy,
    0
  ];

  const tEnd = 250; // ~10 revoluciones completas de la sonda interior
  // 1) Verdad física en marco baricéntrico inercial
  const inertialRes = integrateDopri54({
    derivative(t, y, out) {
      const s = sunBary(t);
      const j = jupBary(t);
      const dxs = y[0] - s.x; const dys = y[1] - s.y; const ds = Math.hypot(dxs, dys, y[2]);
      const dxj = y[0] - j.x; const dyj = y[1] - j.y; const dj = Math.hypot(dxj, dyj, y[2]);
      out[0] = y[3]; out[1] = y[4]; out[2] = y[5];
      out[3] = -muSun * dxs / (ds ** 3) - muJup * dxj / (dj ** 3);
      out[4] = -muSun * dys / (ds ** 3) - muJup * dyj / (dj ** 3);
      out[5] = -muSun * y[2] / (ds ** 3) - muJup * y[2] / (dj ** 3);
    },
    initialState: rInertial0,
    startSeconds: 0,
    targetSeconds: tEnd,
    absTol: 1e-12,
    relTol: 1e-12
  });
  const sEnd = sunBary(tEnd);
  const trueHelioEnd = [
    inertialRes.finalState[0] - sEnd.x,
    inertialRes.finalState[1] - sEnd.y,
    inertialRes.finalState[2]
  ];

  // 2) Propagación heliocéntrica CON término indirecto
  const helioWithIndirect = integrateDopri54({
    derivative(t, y, out) {
      const acc = evaluateHeliocentricProbeAcceleration({
        positionKm: { x: y[0], y: y[1], z: y[2] },
        elapsedSeconds: t,
        perturbingBodyIds: ['599'],
        catalog: eqCatalog,
        getBodyPositionKm: (_, tau) => ({
          x: sep * Math.cos(omega * tau),
          y: sep * Math.sin(omega * tau),
          z: 0
        }),
        includeIndirectTerms: true
      });
      out[0] = y[3]; out[1] = y[4]; out[2] = y[5];
      out[3] = acc.x; out[4] = acc.y; out[5] = acc.z;
    },
    initialState: rHelio0,
    startSeconds: 0,
    targetSeconds: tEnd,
    absTol: 1e-12,
    relTol: 1e-12
  });

  // 3) Propagación heliocéntrica SIN término indirecto (incorrecta físicamente)
  const helioWithoutIndirect = integrateDopri54({
    derivative(t, y, out) {
      const acc = evaluateHeliocentricProbeAcceleration({
        positionKm: { x: y[0], y: y[1], z: y[2] },
        elapsedSeconds: t,
        perturbingBodyIds: ['599'],
        catalog: eqCatalog,
        getBodyPositionKm: (_, tau) => ({
          x: sep * Math.cos(omega * tau),
          y: sep * Math.sin(omega * tau),
          z: 0
        }),
        includeIndirectTerms: false
      });
      out[0] = y[3]; out[1] = y[4]; out[2] = y[5];
      out[3] = acc.x; out[4] = acc.y; out[5] = acc.z;
    },
    initialState: rHelio0,
    startSeconds: 0,
    targetSeconds: tEnd,
    absTol: 1e-12,
    relTol: 1e-12
  });

  const errWithIndirect = Math.hypot(
    helioWithIndirect.finalState[0] - trueHelioEnd[0],
    helioWithIndirect.finalState[1] - trueHelioEnd[1]
  );
  const errWithoutIndirect = Math.hypot(
    helioWithoutIndirect.finalState[0] - trueHelioEnd[0],
    helioWithoutIndirect.finalState[1] - trueHelioEnd[1]
  );

  console.log(
    `HELIOCENTRIC_EQUIVALENCE errWithIndirect=${errWithIndirect.toExponential(3)}km `
    + `errWithoutIndirect=${errWithoutIndirect.toFixed(3)}km`
  );

  assert.ok(errWithIndirect < 1e-7, `La formulación heliocéntrica con término indirecto debe coincidir con el marco baricéntrico (${errWithIndirect})`);
  assert.ok(errWithoutIndirect > 50, 'Omitir el término indirecto produce un error físico macroscópico');

  // El Modelo B mutuo rechaza coordenadas heliocéntricas SUN_CENTER
  assert.throws(() => evaluateInertialMutualAccelerations({
    origin: 'SUN_CENTER',
    bodies: [
      { bodyId: '10', positionKm: { x: 0, y: 0, z: 0 } },
      { bodyId: '599', positionKm: { x: 1000, y: 0, z: 0 } }
    ],
    catalog: eqCatalog
  }), error => error instanceof DynamicsError && error.code === 'INCOMPATIBLE_STATE');
});

test('Prueba 7: rechazo estricto de parámetros inválidos, no finitos, singularidades, pasos inválidos y límites', () => {
  // GM negativos o nulos
  assert.throws(() => createSyntheticGravitationalCatalog({
    entries: [{ bodyId: '10', name: 'Inválido', muKm3PerS2: -5 }]
  }), RangeError);
  assert.throws(() => computeTwoBodyAcceleration({
    positionKm: { x: 1000, y: 0, z: 0 },
    muKm3PerS2: 0
  }), error => error instanceof DynamicsError && error.code === 'INVALID_PARAMETER');

  // Estados no finitos
  assert.throws(() => computeTwoBodyAcceleration({
    positionKm: { x: Number.NaN, y: 0, z: 0 },
    muKm3PerS2: 1000
  }), error => error instanceof DynamicsError && error.code === 'NON_FINITE_VECTOR');

  // Singularidad exacta (r = 0) y aproximación excesiva (r <= r_min)
  assert.throws(() => computeTwoBodyAcceleration({
    positionKm: { x: 0, y: 0, z: 0 },
    muKm3PerS2: 398600.435507,
    minDistanceKm: 6371
  }), error => error instanceof DynamicsError && error.code === 'SINGULARITY');

  assert.throws(() => computeTwoBodyAcceleration({
    positionKm: { x: 5000, y: 0, z: 0 },
    muKm3PerS2: 398600.435507,
    minDistanceKm: 6371
  }), error => error instanceof DynamicsError && error.code === 'CLOSE_APPROACH_LIMIT');

  const deriv = createTwoBodyDerivative({ muKm3PerS2: 1000, minDistanceKm: 1 });

  // Pasos temporales y tolerancias inválidas
  assert.throws(() => integrateRk4({
    derivative: deriv,
    initialState: [10, 0, 0, 0, 10, 0],
    startSeconds: 0,
    targetSeconds: 10,
    stepSeconds: -1
  }), error => error instanceof IntegrationError && error.code === 'INVALID_CONFIGURATION');

  assert.throws(() => integrateDopri54({
    derivative: deriv,
    initialState: [10, 0, 0, 0, 10, 0],
    startSeconds: 0,
    targetSeconds: 10,
    absTol: -1e-6,
    relTol: 1e-8
  }), error => error instanceof IntegrationError && error.code === 'INVALID_CONFIGURATION');

  // Exceso de iteraciones máximas
  assert.throws(() => integrateRk4({
    derivative: deriv,
    initialState: [10, 0, 0, 0, 10, 0],
    startSeconds: 0,
    targetSeconds: 100,
    stepSeconds: 1,
    maxSteps: 10
  }), error => error instanceof IntegrationError && error.code === 'MAX_ITERATIONS_EXCEEDED');

  assert.throws(() => integrateDopri54({
    derivative: deriv,
    initialState: [10, 0, 0, 0, 10, 0],
    startSeconds: 0,
    targetSeconds: 1000,
    maxStepSeconds: 1,
    maxIterations: 5
  }), error => error instanceof IntegrationError && error.code === 'MAX_ITERATIONS_EXCEEDED');

  // Interrupción segura sin corrupción de estado
  const interrupted = integrateDopri54({
    derivative: deriv,
    initialState: [10, 0, 0, 0, 10, 0],
    startSeconds: 0,
    targetSeconds: 100,
    maxStepSeconds: 1,
    shouldAbort: ({ acceptedSteps }) => (acceptedSteps >= 3 ? 'stop_requested' : false)
  });
  assert.equal(interrupted.aborted, true);
  assert.equal(interrupted.abortReason, 'stop_requested');
  assert.equal(interrupted.acceptedSteps, 3);
  assert.ok(interrupted.elapsedSeconds > 0 && interrupted.elapsedSeconds < 100);

  // Ausencia de efemérides requeridas
  assert.throws(() => evaluateHeliocentricProbeAcceleration({
    positionKm: { x: 1e8, y: 0, z: 0 },
    perturbingBodyIds: ['399'],
    catalog: SOLAR_SYSTEM_GM_CATALOG,
    getBodyPositionKm: () => null
  }), error => error instanceof DynamicsError && error.code === 'MISSING_EPHEMERIS');
});
