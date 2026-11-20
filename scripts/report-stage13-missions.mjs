// Etapa 13 — informe numérico reproducible (sin red): misiones A y B, errores de efemérides de baricentros y satélites,
// refinamiento local y bordes de las ventanas 12G (OBS-12G-01/02/03).
// Uso: node scripts/report-stage13-missions.mjs  → evidence/stage13/numerical-results.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { createPlanetocentricWindow } from '../src/science/PlanetocentricWindow.js';
import { tdbToTimeScales, datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';
import { searchLaunchWindows, validateInterplanetaryOptions, refineTransferCandidate, candidateEdgeDiagnostics } from '../src/lab/InterplanetaryPlan.js';
import { computeIntegratedMission, DEMO_PROPULSION_MODULE } from '../src/lab/IntegratedMission.js';
import { DEMO_LANDER } from '../src/lab/BodyLandingVehicle.js';
import { PRESETS } from '../src/lab/ProbeDesign.js';

const json = f => JSON.parse(readFileSync(f, 'utf8'));
const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const eph = createInterplanetaryEphemeris({ catalog, loadJson: async f => json(`public/${f}`) });
const moons = createPlanetocentricWindow(json('public/data/interplanetary/galilean-moons-jsb-2031-2032.json'));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const utc = jd => tdbToTimeScales(jd).labelUtc;
const r = (x, d = 3) => Number.isFinite(x) ? +x.toFixed(d) : null;
const report = { generatedFrom: 'datos locales (sin red)', windows: [], jupiterBarycenterComparison: null, ephemerisErrors: {}, missions: {} };

// ---- OBS-12G-01 / OBS-12G-03: refinamiento local y bordes en los casos de 12G ----
const CASES = [
  { label: 'A · Tierra → Marte', destinationId: '499', departureStartUtc: '2028-06-01', departureEndUtc: '2029-06-01', departureStepDays: 2, tofMinDays: 100, tofMaxDays: 450, tofStepDays: 2 },
  { label: 'B · Tierra → Venus', destinationId: '299', departureStartUtc: '2027-01-01', departureEndUtc: '2028-12-31', departureStepDays: 2, tofMinDays: 60, tofMaxDays: 250, tofStepDays: 2 },
  { label: 'C · Tierra → Júpiter (centro 599)', destinationId: '599', departureStartUtc: '2028-01-01', departureEndUtc: '2029-12-31', departureStepDays: 4, tofMinDays: 400, tofMaxDays: 1400, tofStepDays: 10 },
  { label: 'Tierra → Saturno', destinationId: '699', departureStartUtc: '2030-01-01', departureEndUtc: '2031-06-30', departureStepDays: 6, tofMinDays: 1200, tofMaxDays: 2800, tofStepDays: 20 },
  { label: 'Tierra → Neptuno', destinationId: '899', departureStartUtc: '2030-01-01', departureEndUtc: '2031-06-30', departureStepDays: 10, tofMinDays: 3500, tofMaxDays: 5600, tofStepDays: 50 }
];
for (const c of CASES) {
  const { options } = validateInterplanetaryOptions(c);
  const w = await eph.loadWindow(['399', c.destinationId], options.departureStartJdTdb, Math.min(options.departureEndJdTdb + options.tofMaxDays, 2468346.5));
  const s = searchLaunchWindows(w, c), b = s.best;
  const ref = refineTransferCandidate(w, { destinationId: c.destinationId, departureJdTdb: b.departureJdTdb, tofDays: b.tofDays, criterion: 'c3', halfSpanDepartureDays: c.departureStepDays / 2, halfSpanTofDays: c.tofStepDays / 2 });
  const edges = candidateEdgeDiagnostics(s, b, eph.coverage(c.destinationId));
  report.windows.push({ label: c.label, grid: { departureUtc: utc(b.departureJdTdb), tofDays: b.tofDays, c3: r(b.c3Km2S2, 4) },
    refined: { departureUtc: utc(ref.departureJdTdb), tofDays: r(ref.tofDays, 3), c3: r(ref.score, 4), evaluations: ref.evaluations, atRefinementBoundary: ref.atRefinementBoundary }, edgeWarnings: edges.warnings });
  console.log(c.label, `grid C3 ${b.c3Km2S2.toFixed(4)} → refined ${ref.score.toFixed(4)}`, edges.warnings.length ? `· ${edges.warnings.length} aviso(s) de borde` : '');
}
// ---- OBS-12G-02: Júpiter con baricentro (4 d, error ≤ 3 m) frente al centro 599 (4 d, error ≤ 95 km) ----
{
  const c = { ...CASES[2], destinationId: '5', label: 'C · Tierra → Júpiter (baricentro 5)' };
  const { options } = validateInterplanetaryOptions({ ...c, destinationId: '599' });
  const w = await eph.loadWindow(['399', '5'], options.departureStartJdTdb, options.departureEndJdTdb + options.tofMaxDays);
  const ref = refineTransferCandidate(w, { destinationId: '5', departureJdTdb: datetimeLocalUtcToJdTdb('2028-12-26'), tofDays: 1090, criterion: 'c3', halfSpanDepartureDays: 2, halfSpanTofDays: 5 });
  report.jupiterBarycenterComparison = { refinedWithBarycenter: { departureUtc: utc(ref.departureJdTdb), tofDays: r(ref.tofDays, 3), c3: r(ref.score, 4) },
    note: 'El encuentro de 13 usa el baricentro 5 y el GM del sistema; el centro 599 solo se usa en 12G como destino de la búsqueda heliocéntrica.' };
}
// ---- Errores de efemérides frente a Horizons fuera de los nodos ----
{
  const hb = json('tests/fixtures/stage13-encounter-holdout-v1.json'), errors = {};
  for (const [id, block] of Object.entries(hb.states)) {
    const w = await eph.loadWindow([id], block.rows[0][0] - 8, block.rows.at(-1)[0] + 8);
    errors[id] = { maxPositionKm: r(Math.max(...block.rows.map(row => dist(w.stateAt(id, row[0]).positionKm, row.slice(1, 4)))), 6),
      maxVelocityKmS: Math.max(...block.rows.map(row => dist(w.stateAt(id, row[0]).velocityKmS, row.slice(4, 7)))) };
  }
  report.ephemerisErrors.barycenters = errors;
  report.ephemerisErrors.jupiterCenterOffsetFromBarycenterKm = hb.jupiterCenterFromBarycenter.rows.map(row => r(Math.hypot(row[1], row[2], row[3]), 1));
  const hm = json('tests/fixtures/stage13-galilean-holdout-v1.json'), me = {};
  for (const [key, block] of Object.entries(hm.states)) me[key] = { maxPositionKm: r(Math.max(...block.rows.map(row => dist(moons.stateAt(key, row[0]).positionKm, row.slice(1, 4)))), 4),
    maxVelocityKmS: Math.max(...block.rows.map(row => dist(moons.stateAt(key, row[0]).velocityKmS, row.slice(4, 7)))) };
  report.ephemerisErrors.galilean = me;
}
// ---- Misiones A y B ----
const design = () => PRESETS.find(p => p.id === 'interplanetary').create();
const summarize = m => ({ verdict: m.verdict, departureUtc: utc(m.departureJdTdb), periapsisUtc: utc(m.arrivalJdTdb), durationDays: r(m.durationSeconds / 86400, 3), c3: r(m.departure?.c3Km2S2, 4),
  launchMassKg: r(m.vehicle.totalKg, 1), finalMassKg: r(m.finalMassKg, 1), tanks: Object.fromEntries(Object.entries(m.tanks).map(([k, v]) => [k, r(v, 2)])),
  approach: m.approach?.vInfKmS ? { soiKm: r(m.approach.soiRadiusKm, 0), vInfKmS: r(m.approach.vInfKmS, 5), BdotT: r(m.approach.BdotT, 1), BdotR: r(m.approach.BdotR, 1), bAngleDeg: r(m.approach.bAngleDeg, 3),
    periapsisAltitudeKm: r(m.approach.periapsisAltitudeKm, 6), turnAngleDeg: r(m.approach.turnAngleDeg, 3), soiToPeriapsisDays: r(m.approach.secondsSoiToPeriapsis / 86400, 4),
    moon: m.approach.moon ? { vInfKmS: r(m.approach.moon.vInfKmS, 5), periapsisAltitudeKm: r(m.approach.moon.periapsisAltitudeKm, 4), soiKm: r(m.approach.moon.soiRadiusKm, 0) } : null,
    closeApproaches: (m.approach.closeApproaches ?? []).map(c => ({ name: c.name, minimumDistanceKm: r(c.minimumDistanceKm, 0), insideSoi: c.insideSoi })) } : null,
  phases: m.phases.map(p => ({ id: p.id, status: p.status, level: p.level })),
  maneuvers: m.maneuvers.map(x => ({ label: x.label, durationSeconds: r(x.durationSeconds, 2), propulsiveDeltaVMS: r(x.propulsiveDeltaVKmS * 1000, 2), impulsiveDeltaVMS: r((x.impulsiveDeltaVKmS ?? NaN) * 1000, 2),
    gravityLossMS: r((x.gravityLossKmS ?? NaN) * 1000, 2), propellantKg: r(x.propellantKg, 2), massAfterKg: r(x.massAfterKg, 2), endEvent: x.endEvent, missKm: x.missKm != null ? r(x.missKm, 5) : undefined })),
  continuity: { boundaries: m.continuity.boundaries.length, frameChanges: m.continuity.boundaries.filter(b => b.frameChange).length, maxPositionErrorKm: m.continuity.maxPositionErrorKm,
    maxVelocityErrorKmS: m.continuity.maxVelocityErrorKmS, maxTimeGapSeconds: m.continuity.maxTimeGapSeconds, undeclaredMassJumps: m.continuity.undeclaredMassJumps },
  separations: m.separations, warnings: m.warnings, computeMs: r(m.computeMs, 1) });
{
  const helio = await eph.loadWindow(['399', '499'], 2462050.5, 2462700.5);
  const ref = refineTransferCandidate(helio, { destinationId: '499', departureJdTdb: datetimeLocalUtcToJdTdb('2028-11-30'), tofDays: 316, criterion: 'c3', halfSpanDepartureDays: 3.16, halfSpanTofDays: 3.16 });
  const opp = { departureJdTdb: ref.departureJdTdb, arrivalJdTdb: ref.arrivalJdTdb };
  const run = planet => computeIntegratedMission({ destinationId: '499', opportunity: opp, design: design(), profile: { planet: { mode: 'capture', periapsisAltitudeKm: 400, ...planet }, landing: { enabled: true } } }, { helio });
  report.missions.opportunityA = { seed: '12G: 2028-11-30, 316 d (C3 8,996)', refined: { departureUtc: utc(ref.departureJdTdb), tofDays: r(ref.tofDays, 3), c3ToCenter: r(ref.score, 4) } };
  report.missions.A1_sufficient = summarize(run({ captureBurns: [{ apoapsisAltitudeKm: 33000 }] }));
  report.missions.A2_insufficient = summarize(run({ captureBurns: [{ apoapsisAltitudeKm: 400 }] }));
  report.missions.A3_flyby = summarize(run({ mode: 'flyby' }));
}
{
  const helio = await eph.loadWindow(['399', '5'], 2462100.5, 2463400.5);
  const ref = refineTransferCandidate(helio, { destinationId: '5', departureJdTdb: datetimeLocalUtcToJdTdb('2028-12-26'), tofDays: 1090, criterion: 'c3', halfSpanDepartureDays: 10.9, halfSpanTofDays: 10.9 });
  const run = propellantKg => computeIntegratedMission({ destinationId: '599', moonId: '502', opportunity: { departureJdTdb: ref.departureJdTdb, arrivalJdTdb: ref.arrivalJdTdb }, design: design(),
    propulsionModule: { ...DEMO_PROPULSION_MODULE, propellantKg }, lander: DEMO_LANDER,
    profile: { planet: { mode: 'capture', periapsisAltitudeKm: 3 * 69911, captureBurns: [{ apoapsisAltitudeKm: 4e6 }], orbitCoastDays: 1 },
      moon: { periapsisAltitudeKm: 100, captureBurns: [{ apoapsisAltitudeKm: 5000 }, { apoapsisAltitudeKm: 100 }] }, landing: { enabled: true } } }, { helio, moons });
  report.missions.opportunityB = { seed: '12G: 2028-12-26, 1090 d (C3 75,73 al centro 599)', refined: { departureUtc: utc(ref.departureJdTdb), tofDays: r(ref.tofDays, 3), c3ToBarycenter: r(ref.score, 4) } };
  const b1 = run(80000);
  report.missions.B1_complete = summarize(b1);
  report.missions.B1_complete.landing = b1.phases.find(p => p.id === 'landing')?.landing ?? null;
  report.missions.B2_insufficient = summarize(run(50000));
}
mkdirSync('evidence/stage13', { recursive: true });
writeFileSync('evidence/stage13/numerical-results.json', `${JSON.stringify(report, null, 2)}\n`);
for (const [k, m] of Object.entries(report.missions)) if (m.verdict) console.log(k, '·', m.verdict, '·', m.maneuvers.map(x => `${x.label}: ${x.propulsiveDeltaVMS} m/s ${x.propellantKg} kg`).join(' | '));
console.log(JSON.stringify(report.ephemerisErrors), JSON.stringify(report.jupiterBarycenterComparison));
