// Etapa 12G — informe numérico reproducible (sin red): ventanas por destino, verificación de Lambert y de tiempo.
// Uso: node scripts/report-stage12g-windows.mjs  → evidence/stage12g/numerical-results.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { evaluateTransfer, searchLaunchWindows, validateInterplanetaryOptions, MU_SUN } from '../src/lab/InterplanetaryPlan.js';
import { solveLambert } from '../src/science/LambertSolver.js';
import { integrateDopri54 } from '../src/science/NumericalIntegrator.js';
import { tdbToTimeScales, utcToTimeScales } from '../src/science/AstrodynamicsTime.js';

const catalog = JSON.parse(readFileSync('public/data/interplanetary-ephemerides-catalog-v1.json', 'utf8'));
const holdout = JSON.parse(readFileSync('tests/fixtures/interplanetary-horizons-holdout-v1.json', 'utf8'));
const eph = createInterplanetaryEphemeris({ catalog, loadJson: async f => JSON.parse(readFileSync(`public/${f}`, 'utf8')) });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const CASES = [
  { label: 'A · Tierra → Marte', destinationId: '499', departureStartUtc: '2028-06-01', departureEndUtc: '2029-06-01', departureStepDays: 2, tofMinDays: 100, tofMaxDays: 450, tofStepDays: 2 },
  { label: 'A2 · Tierra → Marte (2030–2031)', destinationId: '499', departureStartUtc: '2030-06-01', departureEndUtc: '2031-08-01', departureStepDays: 2, tofMinDays: 100, tofMaxDays: 450, tofStepDays: 2 },
  { label: 'B · Tierra → Venus', destinationId: '299', departureStartUtc: '2027-01-01', departureEndUtc: '2028-12-31', departureStepDays: 2, tofMinDays: 60, tofMaxDays: 250, tofStepDays: 2 },
  { label: 'C · Tierra → Júpiter', destinationId: '599', departureStartUtc: '2028-01-01', departureEndUtc: '2029-12-31', departureStepDays: 4, tofMinDays: 400, tofMaxDays: 1400, tofStepDays: 10 },
  { label: 'Tierra → Mercurio', destinationId: '199', departureStartUtc: '2030-01-01', departureEndUtc: '2030-12-31', departureStepDays: 2, tofMinDays: 60, tofMaxDays: 200, tofStepDays: 2 },
  { label: 'Tierra → Saturno', destinationId: '699', departureStartUtc: '2030-01-01', departureEndUtc: '2031-06-30', departureStepDays: 6, tofMinDays: 1200, tofMaxDays: 2800, tofStepDays: 20 },
  { label: 'Tierra → Urano', destinationId: '799', departureStartUtc: '2030-01-01', departureEndUtc: '2031-06-30', departureStepDays: 8, tofMinDays: 2500, tofMaxDays: 6000, tofStepDays: 40 },
  { label: 'Tierra → Neptuno', destinationId: '899', departureStartUtc: '2030-01-01', departureEndUtc: '2031-06-30', departureStepDays: 10, tofMinDays: 3500, tofMaxDays: 5600, tofStepDays: 50 }
];
const report = { generatedFrom: 'datos locales (sin red)', muSun: MU_SUN, cases: [], lambertDopri: [], timeCheck: [] };
for (const c of CASES) {
  const { options } = validateInterplanetaryOptions(c);
  const t0 = performance.now();
  const w = await eph.loadWindow([options.originId, options.destinationId], options.departureStartJdTdb, Math.min(options.departureEndJdTdb + options.tofMaxDays, 2468346.5));
  const r = searchLaunchWindows(w, c);
  const ms = performance.now() - t0;
  const top = r.localMinima.slice(0, 3).map(b => {
    const e = evaluateTransfer(w, { destinationId: c.destinationId, departureJdTdb: b.departureJdTdb, arrivalJdTdb: b.arrivalJdTdb });
    return { departureUtc: tdbToTimeScales(b.departureJdTdb).labelUtc, departureTdb: tdbToTimeScales(b.departureJdTdb).labelTdb, arrivalUtc: tdbToTimeScales(b.arrivalJdTdb).labelUtc,
      tofDays: b.tofDays, atGridEdge: b.atGridEdge, c3: +b.c3Km2S2.toFixed(3), vInfDeparture: +b.vInfDepartureKmS.toFixed(4), vInfArrival: +b.vInfArrivalKmS.toFixed(4), injectionDv200km: +e.injection.deltaVKmS.toFixed(4),
      dlaDeg: +e.departureExcess.declinationDeg.toFixed(2), type: b.transferType, closureKm: b.closureKm,
      earthAtDepartureKm: e.originState.positionKm.map(x => Math.round(x)), destinationAtArrivalKm: e.destinationState.positionKm.map(x => Math.round(x)) };
  });
  report.cases.push({ label: c.label, input: c, cells: r.counts, searchMs: Math.round(ms), best: top[0] ?? null, otherLocalMinima: top.slice(1) });
  console.log(c.label, JSON.stringify(r.counts), top[0] && `${top[0].departureUtc} ${top[0].tofDays} d C3 ${top[0].c3} v∞arr ${top[0].vInfArrival}`);
}
// Cierre de Lambert por propagación independiente DOPRI54 (Tierra 2029-03-01 → Marte).
const w = await eph.loadWindow(['399', '499'], 2462100.5, 2462900.5);
for (const tofDays of [60, 150, 260, 330, 500]) {
  const r1 = w.stateAt('399', 2462150.5).positionKm, r2 = w.stateAt('499', 2462150.5 + tofDays).positionKm;
  const sol = solveLambert(r1, r2, tofDays * 86400, MU_SUN);
  const out = integrateDopri54({ derivative: (t, y, d) => { const r = Math.hypot(y[0], y[1], y[2]), k = -MU_SUN / r ** 3; const o = d ?? new Float64Array(6);
    o[0] = y[3]; o[1] = y[4]; o[2] = y[5]; o[3] = k * y[0]; o[4] = k * y[1]; o[5] = k * y[2]; return o; }, initialState: Float64Array.from([...r1, ...sol.departureVelocityKmS]),
    startSeconds: 0, targetSeconds: tofDays * 86400, initialStepSeconds: 3600, minStepSeconds: 1e-3, maxStepSeconds: 5 * 86400, absTol: 1e-6, relTol: 1e-13 });
  report.lambertDopri.push({ tofDays, iterations: sol.diagnostics.iterations, type: sol.diagnostics.transferType, keplerClosureKm: sol.diagnostics.closurePositionKm,
    dopriClosureKm: dist(Array.from(out.finalState.slice(0, 3)), r2), dopriSteps: out.acceptedSteps });
}
holdout.deltaT.requestedUtc.forEach((utc, i) => report.timeCheck.push({ utc, oursTdbMinusUtc: utcToTimeScales(utc).tdbMinusUtcSeconds, horizonsTdbMinusUt: Number(holdout.deltaT.rows[i][3]) }));
mkdirSync('evidence/stage12g', { recursive: true });
writeFileSync('evidence/stage12g/numerical-results.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ lambertDopri: report.lambertDopri, timeCheck: report.timeCheck }, null, 1));
