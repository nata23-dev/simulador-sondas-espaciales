// Etapa 28 · Cifras de la salida desde la plataforma (para la documentación y la revisión independiente).
// Uso: node scripts/stage28-departure-figures.mjs [carpeta]   (por defecto evidence/stage28)
// Escribe:
//   comparacion-salidas.json     A1, A2 y C1 desde el centro de la Tierra, con el empalme de la etapa 21 ('velocity') y con el de la 28:
//                                C3, salto en la frontera, corrección por la Tierra fuera de la SOI y comparación de n cuerpos (etapa 22).
//   auditoria-frontera-soi.jsonl Cálculo propio en la frontera de la SOI: energía de la hipérbola frente a C3, continuidad de la posición
//                                y descomposición del salto de velocidad (|v(R) − v∞| frente a μ/(R·v∞) y la corrección).
//   auditoria-inyeccion.txt      Órbita de aparcamiento e inyección de la Centaur con cada empalme.
// Solo lee las efemérides locales de public/data; no descarga nada ni modifica datos.
import path from 'node:path';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS } from '../src/lab/IntegratedMission.js';
import { compareMissionCruise, NBODY_EPHEMERIS_IDS } from '../src/lab/NBodyCruise.js';
import { EARTH_GM_KM3_S2 } from '../src/lab/LaunchEarth.js';
import { refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';

const out = path.resolve(process.argv[2] ?? 'evidence/stage28');
await fs.mkdir(out, { recursive: true });
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const ephemeris = createInterplanetaryEphemeris({ catalog, loadJson: async file => json(`public/${file}`) });
const MU = EARTH_GM_KM3_S2;
const norm = a => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const redondeo = (k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);

/** Misma preparación que tests/Stage22NBodyCruise.test.mjs y tests/Stage28DeparturePatch.test.mjs. */
async function run(id, probeId, { launch = false, patch = null } = {}) {
  const v = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === id)), target = ENCOUNTER_TARGETS[v.destinationId];
  let departureJdTdb = datetimeLocalUtcToJdTdb(v.departureUtc), tofDays = v.tofDays;
  const covE = ephemeris.coverage('399'), covT = ephemeris.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tofDays) + 140;
  const helio = await ephemeris.loadWindow(['399', target.ephemerisId], Math.max(covE.startJdTdb, covT.startJdTdb, departureJdTdb - margin), Math.min(covE.endJdTdb, covT.endJdTdb, departureJdTdb + tofDays + margin + 200));
  if (v.refine) {
    const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb, tofDays, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tofDays), halfSpanTofDays: refinementHalfSpanDays(tofDays) });
    if (Number.isFinite(r.score)) { departureJdTdb = r.departureJdTdb; tofDays = r.tofDays; }
  }
  const input = integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb, tofDays, launch }, { ...historicalDesign(probeId), id: `flota-${probeId}` });
  if (patch) input.profile.launch.patch = patch;
  const t0 = performance.now();
  const mission = computeIntegratedMission(input, { helio, moons: null });
  return { mission, helio, ms: performance.now() - t0 };
}

// 1 · Comparación de salidas.
const filas = [];
for (const [id, probe] of [['A1', 'cassini'], ['A2', 'juno'], ['C1', 'voyager']]) {
  for (const [salida, opt] of [['centro', {}], ['plataforma, empalme de la etapa 21', { launch: true, patch: 'velocity' }], ['plataforma, etapa 28', { launch: true }]]) {
    const { mission, ms } = await run(id, probe, opt);
    const cruise = mission.segments?.find(x => x.id === 'cruise');
    if (!cruise) { filas.push({ id, sonda: probe, salida, sinCrucero: mission.status ?? null }); continue; }
    const start = mission.departureJdTdb + cruise.startSeconds / 86400, end = mission.departureJdTdb + cruise.endSeconds / 86400;
    const win = await ephemeris.loadWindow(NBODY_EPHEMERIS_IDS, start - 1, end + 1);
    const stateAt = (eid, jd) => { const st = win.stateAt(eid, jd); return st?.status === 'available' ? st : null; };
    const r = compareMissionCruise(mission, stateAt), L = mission.launch;
    filas.push({ id, sonda: probe, salida, calculoMs: Math.round(ms), c3Km2S2: L?.injection?.c3Km2S2 ?? mission.departure?.c3Km2S2 ?? null,
      saltoFronteraKmS: L?.soiVelocityJumpKmS ?? null, tierraFueraSoi: L?.earthBeyondSoi ?? null,
      nCuerpos: { estado: r.status, desvioLlegadaKm: r.uncorrected?.arrivalPositionErrorKm, desvioVelocidadKmS: r.uncorrected?.arrivalVelocityErrorKmS,
        otrosCuerposKm: r.thirdBodies?.arrivalPositionErrorKm, tcm1MS: r.tcm?.deltaVMS, aislados: r.isolated?.map(i => i.id) } });
  }
}
await fs.writeFile(path.join(out, 'comparacion-salidas.json'), JSON.stringify(filas, redondeo, 1));

// 2 · Frontera de la SOI (cálculo propio) y 3 · inyección.
const frontera = [], inyeccion = [];
for (const [id, probe] of [['A1', 'cassini'], ['C1', 'voyager']]) {
  const { mission, helio } = await run(id, probe, { launch: true });
  const L = mission.launch, st = L.soiExitHelioState, E = helio.stateAt('399', L.soiExitJdTdb);
  const rRel = sub(st.positionKm, E.positionKm), vRel = sub(st.velocityKmS, E.velocityKmS), vInf = L.vInfVectorKmS;
  const R = norm(rRel), v = norm(vRel), vi = norm(vInf), cruise = mission.segments.find(s => s.id === 'cruise');
  frontera.push(JSON.stringify({ id, radioKm: R, radioSoiKm: L.soiRadiusKm, c3EnFrontera: dot(vRel, vRel) - 2 * MU / R, vInf2: vi * vi, vEnR: v, vInf: vi,
    difModulosKmS: v - vi, difVectorKmS: norm(sub(vRel, vInf)), aproxMuRvKmS: MU / (R * vi), saltoInformadoKmS: L.soiVelocityJumpKmS,
    cruceroMenosRealPosKm: norm(sub(cruise.initial.positionKm, st.positionKm)), cruceroMenosRealVelKmS: norm(sub(cruise.initial.velocityKmS, st.velocityKmS)),
    anguloVrelVinfGrados: Math.acos(Math.min(1, dot(vRel, vInf) / (v * vi))) * 180 / Math.PI, correccionTierraMS: L.earthBeyondSoi?.correctionMS ?? null }));
  for (const patch of ['velocity', 'asymptote']) {
    const { mission: m } = await run(id, probe, { launch: true, patch });
    inyeccion.push(`${id} ${patch} aparcamiento ${JSON.stringify(m.launch.parking, redondeo)}`);
    inyeccion.push(`${id} ${patch} inyección ${JSON.stringify(m.launch.injection, redondeo)}`);
  }
}
await fs.writeFile(path.join(out, 'auditoria-frontera-soi.jsonl'), frontera.join('\n') + '\n');
await fs.writeFile(path.join(out, 'auditoria-inyeccion.txt'), inyeccion.join('\n') + '\n');
console.log(`Escrito en ${out}: ${filas.length} filas de comparación, ${frontera.length} fronteras, ${inyeccion.length / 2} inyecciones.`);
