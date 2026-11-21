// Etapa 17 — reorganización del laboratorio en tres etapas (Elegir sonda → Planificar → Reproducir), documentación visual de
// la flota, ensamblaje experimental separado de las configuraciones históricas y reproducción solo de trayectorias ejecutables.
// Sin cambios de física, datos ni integrador: se comprueba la estructura de la interfaz y que la reproducción use siempre la
// sonda y los estados del cálculo vigente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { historicalDesign } from '../src/lab/ProbeDesign.js';
import { getComponent } from '../src/lab/ComponentCatalog.js';
import { HISTORICAL_PROBES } from '../src/lab/HeritageCatalog.js';
import { calculateEngineering } from '../src/lab/ProbeEngineering.js';
import { designSignature } from '../src/lab/MissionPlanStore.js';
import { FLEET_DOCUMENTS, DOCUMENT_KINDS, documentsFor, probeSources, ARCHITECTURE_GROUPS, architectureGroupOf } from '../src/lab/FleetDocuments.js';
import { EXPERIMENTAL_PARTS, createExperimentalDesign, slotOptions, changeSlot, validateExperimental, differencesFromBase, loadExperimental, saveExperimental, EXPERIMENTAL_STORAGE_KEY } from '../src/lab/ExperimentalAssembly.js';
import { GLOSSARY, termFor } from '../src/ui/LabGlossary.js';
import { MC_PANES } from '../src/ui/MissionControlCenter.js';
import { LAB_STAGES, labTab } from '../src/ui/LabStages.js';
import { GUIDE_STEPS } from '../src/ui/LabGuidedMission.js';
import { AREAS } from '../src/ui/AppNavigator.js';
import { INTEGRATED_SCENARIOS, integratedMissionInput, scenarioFormValues, refinementHalfSpanDays } from '../src/ui/IntegratedMissionPlanner.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS } from '../src/lab/IntegratedMission.js';
import { createIntegratedExecution } from '../src/lab/IntegratedMissionPlayback.js';
import { refineTransferCandidate } from '../src/lab/InterplanetaryPlan.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const source = file => readFileSync(file, 'utf8');
const fleet = id => ({ ...historicalDesign(id), id: `flota-${id}` }); // mismo diseño que «1 · Elegir sonda» (ExperimentalLaboratory.js)
const memoryStorage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) }; };

// ---- Estructura: tres etapas, pestañas propias y herramientas que no se convierten en etapas ----
test('el laboratorio tiene tres etapas numeradas y cada pestaña pertenece a una sola etapa', () => {
  assert.deepEqual(LAB_STAGES.map(s => [s.number, s.id, s.title]), [[1, 'probe', 'Elegir sonda'], [2, 'plan', 'Planificar'], [3, 'play', 'Reproducir']]);
  assert.deepEqual(LAB_STAGES[0].tabs.map(t => t.id), ['overview', 'architecture', 'docs', 'engineering']);
  assert.deepEqual(LAB_STAGES[1].tabs.map(t => t.id), ['integrated', 'interplanetary', 'lunar', 'launch']);
  assert.deepEqual(LAB_STAGES[2].tabs.map(t => t.id), Object.keys(MC_PANES), 'las pestañas de «Reproducir» son los paneles del Centro de Misión');
  for (const t of LAB_STAGES[2].tabs) assert.equal(t.title, MC_PANES[t.id]);
  const ids = LAB_STAGES.flatMap(s => s.tabs.map(t => t.id));
  assert.equal(new Set(ids).size, ids.length, 'sin pestañas repetidas entre etapas');
  for (const t of LAB_STAGES.flatMap(s => s.tabs)) assert.ok(t.title && t.desc, `${t.id}: título y descripción`);
  // Sin aterrizaje, superficie ni vehículos tripulados como herramientas nuevas.
  assert.ok(!ids.some(id => /landing|surface|crew|aterriz/.test(id)));
});

test('«Misión completa» es el flujo principal y el resto de Planificar se marca como herramienta independiente', () => {
  assert.match(labTab('plan', 'integrated').chain, /Fases conectadas en un solo cálculo/);
  for (const id of ['interplanetary', 'lunar', 'launch']) assert.match(labTab('plan', id).chain, /^Herramienta independiente/, id);
  assert.match(labTab('plan', 'launch').chain, /no se encadena con «Misión completa»/);
  assert.equal(labTab('plan', 'nope'), null);
  assert.equal(labTab('probe', 'integrated'), null, 'una pestaña solo existe dentro de su etapa');
});

test('el menú de áreas lleva a la etapa y la pestaña correctas; la demostración científica ya no existe (17.1)', () => {
  const lab = AREAS.flatMap(group => group.items ?? [group]).filter(item => item.mode === 'experimental');
  assert.ok(lab.length >= 8);
  for (const item of lab) assert.ok(labTab(item.stage, item.tab), `${item.id}: ${item.stage}/${item.tab}`);
  const byId = Object.fromEntries(lab.map(i => [i.id, i]));
  assert.deepEqual([byId.hangar.stage, byId.hangar.tab, byId.hangar.title], ['probe', 'overview', 'Elegir sonda']);
  assert.deepEqual([byId.docs.stage, byId.docs.tab], ['probe', 'docs']);
  assert.deepEqual([byId.center.stage, byId.center.tab], ['play', 'playback']);
  assert.equal(byId.orbital, undefined, '17.1: sin área de la Sonda Experimental 01');
  // El módulo científico y sus pruebas DOPRI54 se conservan aunque la interfaz ya no lo muestre.
  assert.ok(existsSync('src/science/ExperimentalProbe01.js'));
  assert.match(source('tests/ProbePropagationAndVisual.test.mjs'), /propagateExperimentalProbe01/);
});

test('la misión guiada conserva cinco pasos y apunta al panel de etapas o a la pestaña según dónde esté el usuario', () => {
  assert.deepEqual(GUIDE_STEPS.filter(s => /^\d · /.test(s.title)).map(s => s.title[0]), ['1', '2', '3', '4', '5'], 'cinco pasos numerados (más introducción y cierre)');
  const planner = GUIDE_STEPS.find(s => s.id === 'planner');
  assert.equal(typeof planner.target, 'function');
  assert.equal(planner.target({ stage: () => 'probe' }), '[data-lab-stage="plan"]');
  assert.equal(planner.target({ stage: () => 'plan' }), '[data-lab-tab="integrated"]');
  const guide = source('src/ui/LabGuidedMission.js');
  for (const text of ['«1 · Elegir sonda»', 'Hazlo por mí']) assert.ok(guide.includes(text), text);
});

// ---- 1 · Elegir sonda: documentación auténtica distinguida de la reconstrucción ----
test('cada sonda tiene un diagrama y una fotografía oficiales de NASA/JPL con procedencia y archivos servidos', () => {
  assert.deepEqual(Object.keys(DOCUMENT_KINDS), ['diagram', 'photo', 'reconstruction']);
  assert.equal(FLEET_DOCUMENTS.length, 8);
  const readme = source('public/images/fleet/README.md');
  for (const probe of HISTORICAL_PROBES) {
    const docs = documentsFor(probe.id);
    assert.deepEqual(docs.map(d => d.kind).sort(), ['diagram', 'photo'], probe.id);
    for (const d of docs) {
      assert.match(d.sourceUrl, /^https:\/\/(www\.jpl\.nasa\.gov|science\.nasa\.gov|photojournal\.jpl\.nasa\.gov)\//, d.title);
      assert.match(d.credit, /NASA/);
      assert.ok(d.date && d.caption, d.title);
      assert.ok(!d.file.startsWith('/'), 'ruta relativa: se antepone import.meta.env.BASE_URL');
      for (const file of [d.file, d.thumb]) assert.ok(existsSync(`public/${file}`), file);
      assert.ok(readme.includes(d.file.replace('images/fleet/', '')), `README documenta ${d.file}`);
    }
    assert.ok(probeSources(probe.id).length >= 1, `${probe.id}: fuentes técnicas de la ficha`);
  }
  // La única copia sin recomprimir conserva el SHA-256 del original anotado en el README.
  const hash = createHash('sha256').update(readFileSync('public/images/fleet/cassini-assembly.jpg')).digest('hex');
  assert.ok(readme.includes(hash));
  assert.match(readme, /no planos de fabricación/);
});

test('la pestaña de arquitectura agrupa todas las piezas históricas en un grupo que declara su categoría', () => {
  const declared = new Set(ARCHITECTURE_GROUPS.flatMap(g => g.categories));
  for (const probe of HISTORICAL_PROBES) {
    const design = historicalDesign(probe.id);
    for (const part of [{ componentId: design.coreId }, ...design.parts]) {
      const category = getComponent(part.componentId).category;
      assert.ok(declared.has(category), `${probe.id}: categoría ${category} sin grupo`);
      assert.ok(ARCHITECTURE_GROUPS.find(g => g.id === architectureGroupOf(category)).categories.includes(category));
    }
  }
});

test('el glosario explica los términos de las etiquetas existentes sin capturar texto ajeno', () => {
  assert.equal(new Set(GLOSSARY.map(e => e.id)).size, GLOSSARY.length);
  assert.equal(termFor('Δv disponible')?.id, 'dv');
  assert.equal(termFor('Salida (UTC)')?.id, 'utc');
  assert.equal(termFor('Impulso específico')?.id, 'isp');
  assert.equal(termFor('Época TDB')?.id, 'tdb');
  assert.equal(termFor('Masa total'), null);
  assert.equal(termFor(null), null);
  assert.match(GLOSSARY.find(e => e.id === 'tdb').text, /69 s/);
  assert.match(GLOSSARY.find(e => e.id === 'ephemeris').text, /no se extrapolan/);
});

// ---- Ensamblaje experimental: separado de la flota histórica y verificado por ingeniería ----
test('el ensamblaje experimental parte de una sonda real sin modificar su configuración histórica', () => {
  const before = structuredClone(historicalDesign('cassini'));
  const design = createExperimentalDesign('cassini');
  assert.equal(design.experimental, true);
  assert.equal(design.baseProbeId, 'cassini');
  assert.equal(design.id, 'experimental-cassini');
  assert.equal('basedOn' in design, false, 'no se presenta como la configuración histórica');
  assert.deepEqual(validateExperimental(design), []);
  assert.deepEqual(differencesFromBase(design), []);
  assert.notEqual(designSignature(design), designSignature(fleet('cassini')));
  for (const part of EXPERIMENTAL_PARTS) assert.ok(!['landing', 'tool', 'structure'].includes(part.category), part.id);

  // Cambiar una antena por la de otra sonda: diferencia declarada, adaptador si hace falta y otra masa en ingeniería.
  const slot = getComponent(design.coreId).slots.find(s => slotOptions(design, s.id).some(o => o.component.heritage && o.component.heritage !== 'cassini' && o.component.category === 'antenna'));
  assert.ok(slot, 'hay un punto que admite una antena de otra sonda');
  const option = slotOptions(design, slot.id).find(o => o.component.heritage !== 'cassini' && o.component.category === 'antenna');
  const { design: changed, notes } = changeSlot(design, slot.id, option.component.id);
  assert.match(notes[0], /montada en «/);
  if (option.adapter) assert.ok(notes.some(n => /adaptador estructural de .* kg \(estimado\)/.test(n)));
  assert.deepEqual(validateExperimental(changed), []);
  const diff = differencesFromBase(changed);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].now.id, option.component.id);
  assert.notEqual(calculateEngineering(changed).wetMassKg, calculateEngineering(design).wetMassKg);
  if (option.adapter) assert.ok(calculateEngineering(changed).adapterMassKg > 0, 'la masa del adaptador entra en el balance');
  assert.notEqual(designSignature(changed), designSignature(design), 'otro vehículo: cualquier cálculo anterior queda invalidado');
  const { id: _a, ...after } = historicalDesign('cassini'), { id: _b, ...original } = before; // historicalDesign genera un id nuevo en cada llamada
  assert.deepEqual(after, original, 'la configuración histórica no cambia');

  // Dejar el punto libre y piezas no permitidas.
  assert.equal(changeSlot(changed, slot.id, '').design.parts.some(p => p.socketId === slot.id), false);
  assert.throws(() => changeSlot(design, slot.id, 'no-existe'), /piezas de herencia/);
  assert.ok(validateExperimental({ ...design, experimental: false }).length > 0);
  assert.ok(validateExperimental({ ...historicalDesign('cassini') }).length > 0, 'una configuración histórica no pasa por experimental');
});

test('el ensamblaje experimental se guarda y se recupera solo si sigue siendo válido', () => {
  const storage = memoryStorage();
  assert.equal(loadExperimental(storage), null);
  const design = createExperimentalDesign('juno');
  saveExperimental(design, storage);
  assert.deepEqual(loadExperimental(storage), design);
  storage.setItem(EXPERIMENTAL_STORAGE_KEY, JSON.stringify({ ...design, parts: [{ componentId: 'no-existe', socketId: 'top' }] }));
  assert.equal(loadExperimental(storage), null);
  storage.setItem(EXPERIMENTAL_STORAGE_KEY, '{roto');
  assert.equal(loadExperimental(storage), null);
});

// ---- Reproducir: solo trayectorias ejecutables, con la sonda del cálculo ----
const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const ephemeris = createInterplanetaryEphemeris({ catalog, loadJson: async file => json(`public/${file}`) });
// Réplica de IntegratedMissionPlanner.compute() (misma ventana de efemérides, mismo refinamiento y misma entrada).
async function runScenario(id, design) {
  const v = scenarioFormValues(INTEGRATED_SCENARIOS.find(s => s.id === id)), target = ENCOUNTER_TARGETS[v.destinationId];
  let departureJdTdb = datetimeLocalUtcToJdTdb(v.departureUtc), tofDays = v.tofDays;
  const covE = ephemeris.coverage('399'), covT = ephemeris.coverage(target.ephemerisId), margin = Math.max(30, 0.02 * tofDays) + 140;
  const helio = await ephemeris.loadWindow(['399', target.ephemerisId], Math.max(covE.startJdTdb, covT.startJdTdb, departureJdTdb - margin), Math.min(covE.endJdTdb, covT.endJdTdb, departureJdTdb + tofDays + margin + 200));
  if (v.refine) {
    const r = refineTransferCandidate(helio, { destinationId: target.ephemerisId, departureJdTdb, tofDays, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tofDays), halfSpanTofDays: refinementHalfSpanDays(tofDays) });
    if (Number.isFinite(r.score)) { departureJdTdb = r.departureJdTdb; tofDays = r.tofDays; }
  }
  const mission = computeIntegratedMission(integratedMissionInput({ ...v, destinationId: target.id, departureJdTdb, tofDays }, design), { helio, moons: null });
  return { mission, data: { helio, moons: null } };
}

test('la reproducción usa la sonda del cálculo y rechaza estados calculados con otro vehículo', async () => {
  const cassini = fleet('cassini');
  const { mission, data } = await runScenario('A1', cassini);
  assert.match(mission.verdict, /^CADENA CALCULADA COMPLETA/);
  const execution = createIntegratedExecution({ result: mission, data, design: cassini });
  assert.equal(designSignature(execution.design), designSignature(cassini), 'el vehículo reproducido es el calculado');
  assert.equal(execution.durationSeconds, mission.durationSeconds);
  assert.throws(() => createIntegratedExecution({ result: mission, data, design: fleet('juno') }), /obsoleto tras cambiar la sonda/);
  assert.throws(() => createIntegratedExecution({ result: mission, data, design: createExperimentalDesign('cassini') }), /obsoleto tras cambiar la sonda/);
});

test('Dawn en Marte A1: el resultado se conserva pero no hay reproducción fuera de la ventana de efemérides', async () => {
  const dawn = fleet('dawn');
  const { mission, data } = await runScenario('A1', dawn);
  assert.match(mission.verdict, /^NO VIABLE/);
  assert.ok(mission.durationSeconds / 86400 > 700, 'la captura iónica alarga la cadena más allá de la ventana cargada');
  assert.throws(() => createIntegratedExecution({ result: mission, data, design: dawn }), /Efemérides no disponibles/, 'no se extrapola');
  // El sobrevuelo (A3) sí es reproducible con Dawn.
  const flyby = await runScenario('A3', dawn);
  assert.equal(createIntegratedExecution({ result: flyby.mission, data: flyby.data, design: dawn }).design.basedOn, 'dawn');
});

test('la interfaz no anuncia reproducción sin trayectoria ejecutable y nunca reproduce otro vehículo en silencio', () => {
  const planner = source('src/ui/IntegratedMissionPlanner.js');
  assert.ok(planner.includes("$('#im-execute').disabled = !execution;"));
  assert.match(planner, /Reproducción 3D no disponible: \$\{executionError\}/);
  assert.match(planner, /executable: Boolean\(mission && execution\)/);
  for (const id of ['im-flow', 'im-brief', 'im-advanced', 'im-scenario', 'im-destination', 'im-departure', 'im-tof', 'im-mode', 'im-compute', 'im-execute', 'im-coverage', 'im-phases', 'im-maneuvers', 'im-mass', 'im-power'])
    assert.ok(planner.includes(`id="${id}"`), `#${id}`);
  const lab = source('src/ui/ExperimentalLaboratory.js');
  assert.match(lab, /designSignature\(centerPlan\.design\) !== designSignature\(design\)/);
  assert.match(lab, /Para no reproducir estados de otro vehículo, recalcula/);
  assert.match(lab, /sin reproducción 3D disponible/);
  assert.match(lab, /export \{ LAB_STAGES \} from '\.\/LabStages\.js'/);
  // El esquema técnico nunca se presenta como la malla de NASA troceada.
  assert.match(source('src/lab/ProbeAssemblyView.js'), /procedural \? null : nasaModelForCore/);
});

test('la cabecera muestra el nombre completo en todas las anchuras y el icono de marca es decorativo', () => {
  const theme = source('src/ui/theme.css');
  // Entre 761 y 1100 px la caja del título mide 175 px: en una línea quedaba oculto bajo la navegación.
  assert.match(theme, /@media \(min-width:761px\) and \(max-width:1100px\) \{[^}]*\.brand h1 \{ white-space:normal;/);
  // En móvil, dos líneas en lugar de puntos suspensivos (y la segunda solo se recorta si aun así no cabe).
  assert.match(theme, /\.brand h1 \{ display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2;[^}]*white-space:normal;/);
  assert.match(source('index.html'), /<span class="brand-mark" aria-hidden="true">/);
  // Texto secundario sobre el fondo dorado de la tarjeta activa con contraste AA.
  assert.match(source('src/ui/lab-shell.css'), /\.lab-probe-card\[aria-pressed="true"\] small, #experimental-lab \.mc-vehicle:not\(\[data-state="none"\]\) > :is\(span, small\) \{ color:var\(--text-2\); \}/);
});
