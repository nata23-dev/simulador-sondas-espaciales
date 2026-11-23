// Auditoría Final de Aceptación — Verificación científica independiente (Sección 5).
// Recalcula soluciones analíticas e integraciones independientes sin usar las funciones bajo prueba como oráculo.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { utcTimestampToTdb, jdTdbToHistoricalLabels, parseUtcTimestamp, tdbMinusTtSeconds } from '../../../../src/science/HistoricalTime.js';
import { tdbToTimeScales, utcToTimeScales, datetimeLocalUtcToJdTdb } from '../../../../src/science/AstrodynamicsTime.js';
import { integrateDopri54 } from '../../../../src/science/NumericalIntegrator.js';
import { solveLambert } from '../../../../src/science/LambertSolver.js';
import { SOLAR_SYSTEM_GM_CATALOG } from '../../../../src/science/GravitationalParameters.js';
import { createInterplanetaryEphemeris } from '../../../../src/science/InterplanetaryEphemeris.js';
import { propagateFiniteThrust, G0_M_S2 } from '../../../../src/lab/FiniteThrustDynamics.js';
import { historicalDesign } from '../../../../src/lab/ProbeDesign.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS } from '../../../../src/lab/IntegratedMission.js';
import { compareMissionCruise, NBODY_EPHEMERIS_IDS } from '../../../../src/lab/NBodyCruise.js';
import { createPlanetocentricWindow } from '../../../../src/science/PlanetocentricWindow.js';
import { INTEGRATED_SCENARIOS, scenarioFormValues, integratedMissionInput, refinementHalfSpanDays } from '../../../../src/ui/IntegratedMissionPlanner.js';
import { refineTransferCandidate } from '../../../../src/lab/InterplanetaryPlan.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(DIR, '../../../..');
const leerJson = async rel => JSON.parse(await readFile(path.join(RAIZ, 'public', rel), 'utf8'));

const muSun = SOLAR_SYSTEM_GM_CATALOG.getMu('10');
const muEarth = SOLAR_SYSTEM_GM_CATALOG.getMu('399');
const KM_PER_AU = 149597870.7;

const resultados = { fecha: new Date().toISOString(), comprobaciones: [], resumen: null };
const registrar = (id, titulo, ok, metricas) => {
  resultados.comprobaciones.push({ id, titulo, ok: Boolean(ok), metricas });
};

// Integrador RK4 independiente (escrito aquí para no depender del integrador del simulador)
function rk4Independiente(f, t0, y0, dt, pasos) {
  let t = t0;
  let y = y0.slice();
  const n = y.length;
  for (let s = 0; s < pasos; s++) {
    const k1 = f(t, y);
    const y2 = new Array(n); for (let i = 0; i < n; i++) y2[i] = y[i] + 0.5 * dt * k1[i];
    const k2 = f(t + 0.5 * dt, y2);
    const y3 = new Array(n); for (let i = 0; i < n; i++) y3[i] = y[i] + 0.5 * dt * k2[i];
    const k3 = f(t + 0.5 * dt, y3);
    const y4 = new Array(n); for (let i = 0; i < n; i++) y4[i] = y[i] + dt * k3[i];
    const k4 = f(t + dt, y4);
    for (let i = 0; i < n; i++) y[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    t += dt;
  }
  return y;
}

// 1. Escalas temporales UTC / TAI / TT / TDB y segundos intercalares (SCI-01)
{
  const s59 = utcTimestampToTdb('2016-12-31 23:59:59');
  const s60 = utcTimestampToTdb('2016-12-31 23:59:60');
  const s00 = utcTimestampToTdb('2017-01-01 00:00:00');
  const dt1 = (s60.jdTdb - s59.jdTdb) * 86400;
  const dt2 = (s00.jdTdb - s60.jdTdb) * 86400;
  const inv60 = jdTdbToHistoricalLabels(s60.jdTdb);
  const invAstro = tdbToTimeScales(s60.jdTdb);
  const ts2026 = utcToTimeScales('2026-10-10 00:00:00');
  const tdbTtMs = tdbMinusTtSeconds(ts2026.jdTt) * 1000;
  let rechazaInvalido = false;
  try { parseUtcTimestamp('2020-03-03 12:34:60'); } catch { rechazaInvalido = true; }
  const ok = Math.abs(dt1 - 1) < 1e-4 && Math.abs(dt2 - 1) < 1e-4
    && s60.taiMinusUtcSeconds === 36 && s00.taiMinusUtcSeconds === 37
    && inv60.labelUtc.includes('23:59:60') && invAstro.labelUtc.includes('23:59:60')
    && Math.abs(tdbTtMs) < 1.75 && rechazaInvalido;
  registrar('SCI-TIME', 'UTC/TAI/TT/TDB y segundos intercalares (SCI-01)', ok, {
    dt59a60_s: +dt1.toFixed(6), dt60a00_s: +dt2.toFixed(6),
    taiMinusUtc_60: s60.taiMinusUtcSeconds, taiMinusUtc_00: s00.taiMinusUtcSeconds,
    inv60: inv60.labelUtc, invAstro: invAstro.labelUtc, tdbMinusTt_ms: +tdbTtMs.toFixed(4), rechazaInvalido
  });
}

// 2. DOPRI54 frente a solución analítica de Kepler (e = 0.6, 5 órbitas) + conservación de energía y momento angular + convergencia
{
  const a = 20000; // km
  const e = 0.6;
  const rPeri = a * (1 - e);
  const vPeri = Math.sqrt(muEarth * (1 + e) / rPeri);
  const T = 2 * Math.PI * Math.sqrt(a ** 3 / muEarth);
  const tFinal = 5 * T; // 5 revoluciones exactas -> vuelve al periapsis exacto (rPeri, 0, 0), (0, vPeri, 0)
  const deriv = (_t, y, out) => {
    const r2 = y[0] ** 2 + y[1] ** 2 + y[2] ** 2;
    const inv = -muEarth / (r2 * Math.sqrt(r2));
    out[0] = y[3]; out[1] = y[4]; out[2] = y[5];
    out[3] = y[0] * inv; out[4] = y[1] * inv; out[5] = y[2] * inv;
  };
  const E0 = 0.5 * vPeri ** 2 - muEarth / rPeri;
  const h0 = rPeri * vPeri;
  const runTol = relTol => {
    const res = integrateDopri54({
      derivative: deriv, startSeconds: 0, targetSeconds: tFinal,
      initialState: Float64Array.from([rPeri, 0, 0, 0, vPeri, 0]),
      relTol, absTol: relTol * 1e-3, initialStepSeconds: 10, maxIterations: 200000
    });
    const y = res.finalState;
    const posErrKm = Math.hypot(y[0] - rPeri, y[1], y[2]);
    const r = Math.hypot(y[0], y[1], y[2]);
    const v = Math.hypot(y[3], y[4], y[5]);
    const E = 0.5 * v ** 2 - muEarth / r;
    const hx = y[1] * y[5] - y[2] * y[4], hy = y[2] * y[3] - y[0] * y[5], hz = y[0] * y[4] - y[1] * y[3];
    const h = Math.hypot(hx, hy, hz);
    return { relTol, acceptedSteps: res.acceptedSteps, posErrKm, relEnergyErr: Math.abs((E - E0) / E0), relAngMomErr: Math.abs((h - h0) / h0) };
  };
  const r7 = runTol(1e-7);
  const r10 = runTol(1e-10);
  const r12 = runTol(1e-12);
  const ok = r12.posErrKm < 1e-4 && r12.relEnergyErr < 1e-11 && r12.relAngMomErr < 1e-11 && r12.posErrKm < r10.posErrKm && r10.posErrKm < r7.posErrKm;
  registrar('SCI-DOPRI54-KEPLER', 'DOPRI54: Kepler analítico (e=0,6, 5 órbitas), conservación y convergencia', ok, { r7, r10, r12 });
}

// 3. Caída radial libre analítica (t_ff parcial desde r0 hasta r1)
{
  const r0 = 50000; // km
  const r1 = 10000; // km
  const u = r1 / r0;
  const tAnalitico = Math.sqrt(r0 ** 3 / (2 * muEarth)) * (Math.acos(Math.sqrt(u)) + Math.sqrt(u * (1 - u)));
  const vAnalitico = -Math.sqrt(2 * muEarth * (1 / r1 - 1 / r0));
  const res = integrateDopri54({
    derivative: (_t, y, out) => {
      const r = Math.abs(y[0]);
      out[0] = y[3]; out[1] = y[4]; out[2] = y[5];
      out[3] = -muEarth * y[0] / (r ** 3); out[4] = 0; out[5] = 0;
    },
    startSeconds: 0, targetSeconds: tAnalitico,
    initialState: Float64Array.from([r0, 0, 0, 0, 0, 0]),
    relTol: 1e-12, absTol: 1e-12, initialStepSeconds: 1, maxIterations: 100000
  });
  const errPosKm = Math.abs(res.finalState[0] - r1);
  const errVelKmS = Math.abs(res.finalState[3] - vAnalitico);
  const ok = errPosKm < 1e-5 && errVelKmS < 1e-8;
  registrar('SCI-RADIAL', 'Caída radial libre frente a solución analítica cerrada', ok, {
    tAnalitico_s: +tAnalitico.toFixed(4), rFinal_km: +res.finalState[0].toFixed(6), errPosKm, errVelKmS
  });
}

// 4. Ecuación de Tsiolkovsky y empuje finito con masa variable (12D)
{
  const m0 = 2500; // kg
  const thrustN = 450; // N
  const ispS = 315; // s
  const durS = 600; // s
  const mDot = thrustN / (ispS * G0_M_S2);
  const mfAnalitico = m0 - mDot * durS;
  const dvAnaliticoMS = ispS * G0_M_S2 * Math.log(m0 / mfAnalitico);
  const prop = propagateFiniteThrust({
    gravityDerivative: (_t, y, out) => { out[0] = y[3]; out[1] = y[4]; out[2] = y[5]; out[3] = 0; out[4] = 0; out[5] = 0; },
    initialPositionKm: [1e6, 0, 0],
    initialVelocityKmS: [0, 1, 0],
    initialMassKg: m0,
    dryMassKg: 1000,
    engine: { thrustN, ispS },
    burns: [{ startSeconds: 0, durationSeconds: durS, throttle: 1, direction: { type: 'prograde' } }],
    endSeconds: durS
  });
  const final = prop.final;
  const dvNumMS = (Math.hypot(...final.velocityKmS) - 1) * 1000;
  const errMassKg = Math.abs(final.massKg - mfAnalitico);
  const errDvMS = Math.abs(dvNumMS - dvAnaliticoMS);
  const ok = errMassKg < 1e-6 && errDvMS < 1e-4;
  registrar('SCI-TSIOLKOVSKY', 'Empuje finito con masa variable frente a ecuación de Tsiolkovsky', ok, {
    mfAnalitico_kg: +mfAnalitico.toFixed(6), mfNum_kg: +final.massKg.toFixed(6), errMassKg,
    dvAnalitico_m_s: +dvAnaliticoMS.toFixed(6), dvNum_m_s: +dvNumMS.toFixed(6), errDvMS
  });
}

// 5. Solucionador de Lambert frente a transferencia de Hohmann analítica + RK4 independiente
{
  const r1 = 1.0 * KM_PER_AU;
  const r2 = 1.523679 * KM_PER_AU;
  const aH = 0.5 * (r1 + r2);
  const tofH = Math.PI * Math.sqrt(aH ** 3 / muSun);
  const v1Analitico = Math.sqrt(muSun * (2 / r1 - 1 / aH));
  const v2Analitico = Math.sqrt(muSun * (2 / r2 - 1 / aH));
  const ang = 150 * Math.PI / 180;
  const r1Vec = [r1, 0, 0];
  const r2Vec = [r2 * Math.cos(ang), r2 * Math.sin(ang), 0];
  const tof150 = tofH * 0.85;
  const sol = solveLambert(r1Vec, r2Vec, tof150, muSun);
  const yFin = rk4Independiente((_t, y) => {
    const r = Math.hypot(y[0], y[1], y[2]);
    const inv = -muSun / (r ** 3);
    return [y[3], y[4], y[5], y[0] * inv, y[1] * inv, y[2] * inv];
  }, 0, [...r1Vec, ...sol.departureVelocityKmS], tof150 / 4000, 4000);
  const errLlegadaKm = Math.hypot(yFin[0] - r2Vec[0], yFin[1] - r2Vec[1], yFin[2] - r2Vec[2]);
  const errVelLlegadaKmS = Math.hypot(yFin[3] - sol.arrivalVelocityKmS[0], yFin[4] - sol.arrivalVelocityKmS[1], yFin[5] - sol.arrivalVelocityKmS[2]);
  const angH = 178 * Math.PI / 180;
  const solH = solveLambert([r1, 0, 0], [r2 * Math.cos(angH), r2 * Math.sin(angH), 0], tofH, muSun);
  const ok = sol.converged && errLlegadaKm < 5 && errVelLlegadaKmS < 1e-6 && solH.converged && Math.abs(Math.hypot(...solH.departureVelocityKmS) - v1Analitico) < 0.25;
  registrar('SCI-LAMBERT', 'Solucionador de Lambert verificado con RK4 independiente y referencia Hohmann', ok, {
    status: sol.status, errLlegadaRK4_km: +errLlegadaKm.toFixed(4), errVelRK4_km_s: +errVelLlegadaKmS.toExponential(3),
    v1HohmannRef_km_s: +v1Analitico.toFixed(4), v2HohmannRef_km_s: +v2Analitico.toFixed(4),
    v1Lambert178_km_s: +Math.hypot(...solH.departureVelocityKmS).toFixed(4)
  });
}

// 6. Efemérides interplanetarias (sin extrapolación) + Misiones integradas (A1, A1 LC-41 Etapa 28, C1 Juno) + N-cuerpos
{
  const catalog = {
    catalogVersion: 1,
    datasets: [
      ...(await leerJson('data/interplanetary-ephemerides-catalog-v1.json')).datasets,
      ...(await leerJson('data/encounter-ephemerides-catalog-v1.json')).datasets
    ]
  };
  const helio = createInterplanetaryEphemeris({ catalog, loadJson: leerJson });
  const estadoFuera = await helio.getBodyState('399', 2450000.5);
  const rechazaFueraCobertura = estadoFuera.status !== 'available';

  const cassini = historicalDesign('cassini');
  const juno = historicalDesign('juno');
  const moonData = await leerJson('data/interplanetary/galilean-moons-jsb-2031-2032.json');
  const moonWindow = createPlanetocentricWindow(moonData);

  const vA1 = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === 'A1'));
  const tgtA1 = ENCOUNTER_TARGETS[vA1.destinationId];
  const depA1 = datetimeLocalUtcToJdTdb(vA1.departureUtc);
  const marginA1 = Math.max(30, 0.02 * vA1.tofDays) + 140;
  const helioA1 = await helio.loadWindow(['399', tgtA1.ephemerisId], depA1 - marginA1, depA1 + vA1.tofDays + marginA1 + 200);
  const refA1 = refineTransferCandidate(helioA1, {
    destinationId: tgtA1.ephemerisId, departureJdTdb: depA1, tofDays: vA1.tofDays, criterion: 'c3',
    halfSpanDepartureDays: refinementHalfSpanDays(vA1.tofDays), halfSpanTofDays: refinementHalfSpanDays(vA1.tofDays)
  });
  const mA1 = computeIntegratedMission(
    integratedMissionInput({ ...vA1, destinationId: tgtA1.id, departureJdTdb: refA1.departureJdTdb, tofDays: refA1.tofDays, compensate: true, launch: false }, cassini),
    { helio: helioA1, moons: null }
  );
  const mA1Pad = computeIntegratedMission(
    integratedMissionInput({ ...vA1, destinationId: tgtA1.id, departureJdTdb: refA1.departureJdTdb, tofDays: refA1.tofDays, compensate: true, launch: true }, cassini),
    { helio: helioA1, moons: null }
  );

  const cruise = mA1.segments.find(s => s.id === 'cruise');
  const winNb = await helio.loadWindow(NBODY_EPHEMERIS_IDS, mA1.departureJdTdb + cruise.startSeconds / 86400 - 1, mA1.departureJdTdb + cruise.endSeconds / 86400 + 1);
  const stNb = (id, jd) => { const s = winNb.stateAt(id, jd); return s?.status === 'available' ? s : null; };
  const nbodyA1 = compareMissionCruise(mA1, stNb);
  const nbodyA1Pad = compareMissionCruise(mA1Pad, stNb);

  // C1 con Juno
  const vC1 = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === 'C1'));
  const tgtC1 = ENCOUNTER_TARGETS[vC1.destinationId];
  const depC1 = datetimeLocalUtcToJdTdb(vC1.departureUtc);
  const marginC1 = Math.max(30, 0.02 * vC1.tofDays) + 140;
  const helioC1 = await helio.loadWindow(['399', tgtC1.ephemerisId], depC1 - marginC1, depC1 + vC1.tofDays + marginC1 + 200);
  const refC1 = refineTransferCandidate(helioC1, {
    destinationId: tgtC1.ephemerisId, departureJdTdb: depC1, tofDays: vC1.tofDays, criterion: 'c3',
    halfSpanDepartureDays: refinementHalfSpanDays(vC1.tofDays), halfSpanTofDays: refinementHalfSpanDays(vC1.tofDays)
  });
  const mC1Juno = computeIntegratedMission(
    integratedMissionInput({ ...vC1, destinationId: tgtC1.id, departureJdTdb: refC1.departureJdTdb, tofDays: refC1.tofDays, compensate: true, launch: false }, juno),
    { helio: helioC1, moons: moonWindow }
  );

  const c3A1 = mA1.departure?.c3Km2S2;
  const c3A1Pad = mA1Pad.departure?.c3Km2S2;
  const ok = rechazaFueraCobertura
    && mA1.continuity.maxPositionErrorKm < 1e-3
    && mA1Pad.continuity.maxPositionErrorKm < 1e-3
    && Math.abs(c3A1Pad - c3A1) < 0.05
    && nbodyA1.status === 'calculada' && nbodyA1.tcm.residualKm < 10
    && nbodyA1Pad.status === 'calculada' && nbodyA1Pad.uncorrected.arrivalPositionErrorKm < 100000
    && Boolean(mC1Juno.verdict);
  registrar('SCI-MISSIONS', 'Efemérides sin extrapolación, cónicas parcheadas, captura apuntada, salida LC-41 (Etapa 28) y crucero N-cuerpos', ok, {
    rechazaFueraCobertura,
    estadoFuera: estadoFuera.status,
    A1_verdict: mA1.verdict,
    A1_c3: +c3A1.toFixed(4),
    A1_maxContPosKm: +mA1.continuity.maxPositionErrorKm.toExponential(3),
    A1_finalMassKg: +mA1.finalMassKg.toFixed(2),
    A1_pad_verdict: mA1Pad.verdict,
    A1_pad_c3: +c3A1Pad.toFixed(4),
    A1_nbody_uncorrErrKm: +nbodyA1.uncorrected.arrivalPositionErrorKm.toFixed(1),
    A1_nbody_tcmDvMS: +nbodyA1.tcm.deltaVMS.toFixed(2),
    A1_nbody_tcmResKm: +nbodyA1.tcm.residualKm.toFixed(3),
    A1_pad_nbody_uncorrErrKm: +nbodyA1Pad.uncorrected.arrivalPositionErrorKm.toFixed(1),
    C1_juno_verdict: mC1Juno.verdict,
    C1_juno_finalMassKg: +mC1Juno.finalMassKg.toFixed(2)
  });
}

resultados.resumen = {
  total: resultados.comprobaciones.length,
  aprobadas: resultados.comprobaciones.filter(c => c.ok).length,
  fallidas: resultados.comprobaciones.filter(c => !c.ok).length
};
await writeFile(path.join(DIR, 'ciencia-aceptacion.json'), JSON.stringify(resultados, null, 2) + '\n');
console.log(JSON.stringify(resultados.resumen, null, 2));
if (resultados.resumen.fallidas > 0) console.log(JSON.stringify(resultados.comprobaciones.filter(c => !c.ok), null, 2));
