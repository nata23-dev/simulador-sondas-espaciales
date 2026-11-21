// Auditoría 17.1 (Claude) · módulo auxiliar: construye la misión A1 (Cassini → Marte) como el planificador del navegador.
// Solo aporta la ENTRADA de las comprobaciones (los valores calculados por el proyecto); no es un oráculo. Copiado de las líneas
// 6–30 de scripts/audit-stage17_1-independent-science.mjs. Chrome converge 0,07 s después en la salida (observación O-02).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const imp = p => import(pathToFileURL(`${root}/${p}`).href);
const { createIntegratedExecution, sampleIntegratedExecution } = await imp('src/lab/IntegratedMissionPlayback.js');
const { createInterplanetaryEphemeris } = await imp('src/science/InterplanetaryEphemeris.js');
const { tdbToTimeScales } = await imp('src/science/AstrodynamicsTime.js');
const json = f => JSON.parse(readFileSync(f, 'utf8'));
const { historicalDesign } = await imp('src/lab/ProbeDesign.js');
const { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } = await imp('src/ui/IntegratedMissionPlanner.js');
const { computeIntegratedMission, ENCOUNTER_TARGETS } = await imp('src/lab/IntegratedMission.js');
const { refineTransferCandidate } = await imp('src/lab/InterplanetaryPlan.js');
const { datetimeLocalUtcToJdTdb } = await imp('src/science/AstrodynamicsTime.js');
// Misión A1 construida como IntegratedMissionPlanner.compute() en el navegador (la misma réplica que la prueba 17.1).
const ic = json('public/data/interplanetary-ephemerides-catalog-v1.json');
const catalog = { catalogVersion: 1, datasets: [...ic.datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const eph = createInterplanetaryEphemeris({ catalog, loadJson: async f => json(`public/${f}`) });
const design = { ...historicalDesign('cassini'), id: 'flota-cassini' };
const v = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === 'A1')), target = ENCOUNTER_TARGETS[v.destinationId];
let dep = datetimeLocalUtcToJdTdb(v.departureUtc), tof = v.tofDays;
const cE = eph.coverage('399'), cT = eph.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tof) + 140;
const helio = await eph.loadWindow(['399', target.ephemerisId], Math.max(cE.startJdTdb, cT.startJdTdb, dep - margin), Math.min(cE.endJdTdb, cT.endJdTdb, dep + tof + margin + 200));
if (v.refine) { const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb: dep, tofDays: tof, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tof), halfSpanTofDays: refinementHalfSpanDays(tof) }); if (Number.isFinite(r.score)) { dep = r.departureJdTdb; tof = r.tofDays; } }
const m = computeIntegratedMission(integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb: dep, tofDays: tof }, design), { helio, moons: null });
const mission = m;
export { mission, helio, design, eph, catalog };
