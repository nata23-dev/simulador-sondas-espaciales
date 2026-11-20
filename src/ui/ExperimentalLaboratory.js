import './experimental-laboratory.css';
import { getComponent } from '../lab/ComponentCatalog.js';
import { historicalDesign } from '../lab/ProbeDesign.js';
import { calculateEngineering, ENGINEERING_STATUS } from '../lab/ProbeEngineering.js';
import { HISTORICAL_PROBES, HERITAGE_PROGRAMS, HERITAGE_SOURCES, DATA_QUALITY } from '../lab/HeritageCatalog.js';
import { designSignature } from '../lab/MissionPlanStore.js';
import { createProbeAssemblyView } from '../lab/ProbeAssemblyView.js';
import { NASA_PROBE_MODELS, NASA_MODEL_USAGE } from '../graphics/NasaProbeModels.js';
import { createMissionPlanner } from './MissionPlanner.js';
import { createMissionControlCenter } from './MissionControlCenter.js';
import { createLaunchPlanner } from './LaunchPlanner.js';
import { createInterplanetaryPlanner } from './InterplanetaryPlanner.js';
import { createIntegratedMissionPlanner } from './IntegratedMissionPlanner.js';
import { createLabGuidedMission, revealInScrollAreas } from './LabGuidedMission.js';

const number = (value, digits = 1) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(value);
const valueOrNA = (value, unit, digits = 1) => value == null ? 'No disponible' : `${number(value, digits)} ${unit}`;

// 14: textos de ubicación de cada herramienta del laboratorio. Solo presentación.
// 16: el laboratorio se recorre en tres pasos (elegir sonda → planificar → reproducir); la ingeniería forma parte del Hangar.
const SECTION_META = Object.freeze({
  hangar: { step: 'Elegir sonda', title: 'Hangar', desc: 'Elige una de las cuatro sondas reales (Voyager, Cassini, Dawn o Juno): modelo 3D oficial de NASA, ficha técnica con fuentes e ingeniería.' },
  launch: { step: 'Planificar', title: 'Lanzamiento terrestre', desc: 'Despegue desde la superficie hasta una órbita baja con un lanzador ilustrativo de dos etapas y la sonda activa como carga útil.' },
  center: { step: 'Reproducir', title: 'Centro de Misión', desc: 'Reproduce en 3D la misión calculada: fases, eventos, cámaras y telemetría.' }
});
const PLANNER_META = Object.freeze({
  integrated: { title: 'Misión completa', desc: 'El planificador principal: une el viaje desde la Tierra, la llegada, la captura y un satélite en un solo cálculo con la sonda activa.' },
  interplanetary: { title: 'Ventanas interplanetarias', desc: 'Busca las mejores fechas de salida hacia un planeta con posiciones de NASA/JPL (mapa de oportunidades y Lambert).' },
  lunar: { title: 'Tierra–Luna', desc: 'Transferencia a la Luna desde una órbita terrestre, con impulso ideal o con empuje finito y masa variable.' }
});
// 15: rótulos de la calidad de cada cifra de herencia y de los campos del catálogo.
const QUALITY_LABELS = Object.freeze({ [DATA_QUALITY.documented]: 'Documentado', [DATA_QUALITY.secondary]: 'Fuente secundaria',
  [DATA_QUALITY.derived]: 'Derivado', [DATA_QUALITY.estimated]: 'Estimado', [DATA_QUALITY.unknown]: 'Desconocido' });
const FIELD_LABELS = Object.freeze({ dryMassKg: 'Masa seca', dimensionsM: 'Dimensiones', idlePowerW: 'Consumo', activePowerW: 'Consumo en encendido',
  generationW: 'Generación', thrustN: 'Empuje', ispS: 'Impulso específico', fuelCapacityKg: 'Capacidad de propelente', rcsCount: 'Número de propulsores de actitud',
  rcsThrustN: 'Empuje de actitud', rcsPropellantKg: 'Hidracina de actitud', maxAttachedMassKg: 'Carga máxima montada', solarExponent: 'Exponente solar',
  rtgDecayPerYear: 'Disminución del RTG', batteryWh: 'Batería', dataCapacityMbit: 'Memoria',
  'electric.maxInputPowerW': 'Potencia máxima de entrada', 'electric.minInputPowerW': 'Potencia mínima de encendido', 'electric.efficiency': 'Eficiencia eléctrica' });
const PROGRAM_LABELS = Object.freeze(Object.fromEntries(HERITAGE_PROGRAMS));
const PROPELLANT_LABELS = Object.freeze({ hydrazine: 'hidracina', 'nto-mmh': 'NTO/MMH', 'mon-hydrazine': 'MON/hidracina', xenon: 'xenón' });
const propellantLabel = id => PROPELLANT_LABELS[id] ?? id;
const COMPATIBILITY_TYPES = Object.freeze(['estructural', 'mecánica', 'masa y centro de masas', 'eléctrica', 'propelente', 'control de actitud', 'control', 'comunicaciones']);
function sourceLink(id) {
  const source = HERITAGE_SOURCES[id];
  if (!source) return null;
  const link = document.createElement('a');
  link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.textContent = source.publisher; link.title = source.title;
  return link;
}
function externalLink(url, text) {
  const link = document.createElement('a');
  link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = text;
  return link;
}
function qualityBadge(quality) {
  const badge = document.createElement('span'); badge.className = 'lab-quality'; badge.dataset.quality = quality;
  badge.textContent = QUALITY_LABELS[quality] ?? quality;
  return badge;
}
const MISSION_KIND_LABELS = Object.freeze({ integrated: 'Misión completa', interplanetary: 'Transferencia interplanetaria', landing: 'Descenso y aterrizaje',
  launch: 'Lanzamiento terrestre', 'finite-thrust': 'Maniobra de empuje finito' });

// 15.1: flota fija. Cada sonda tiene un único diseño (configuración histórica) con identificador estable, de modo que los planes
// calculados con una sonda siguen vigentes al cambiar a otra y volver. No se pueden añadir, quitar ni sustituir piezas.
const ACTIVE_PROBE_KEY = 'simulador:sonda-activa';
const DEFAULT_PROBE_ID = 'cassini';
const MODEL_STATE_TEXT = Object.freeze({ nasa: 'Modelo 3D oficial de NASA', cargando: 'Cargando el modelo 3D de NASA…',
  procedural: 'Reconstrucción procedimental de respaldo (no se pudo cargar el modelo de NASA)' });
function readActiveProbe() {
  try { const id = localStorage.getItem(ACTIVE_PROBE_KEY); return HISTORICAL_PROBES.some(p => p.id === id) ? id : DEFAULT_PROBE_ID; }
  catch { return DEFAULT_PROBE_ID; }
}
function storeActiveProbe(id) { try { localStorage.setItem(ACTIVE_PROBE_KEY, id); } catch { /* preferencia opcional */ } }

export function createExperimentalLaboratory() {
  const app = document.querySelector('#app');
  const scene = document.querySelector('.scene-panel');
  const lab = document.createElement('section');
  lab.id = 'experimental-lab';
  lab.setAttribute('aria-label', 'Laboratorio de misiones con sondas históricas');
  lab.hidden = true;
  lab.innerHTML = `
    <header class="lab-header">
      <div class="lab-title">
        <nav class="lab-breadcrumb" aria-label="Ubicación en el laboratorio"><span>Laboratorio</span><span id="lab-crumb-step">Elegir sonda</span><span id="lab-crumb-tool" aria-current="location">Hangar</span></nav>
        <h2 id="lab-tool-title">Hangar</h2><p id="lab-tool-desc">Elige la sonda de tus misiones.</p>
      </div>
      <dl class="lab-context" aria-live="polite">
        <div class="lab-context-probe"><dt><label for="lab-ctx-probe">Sonda activa</label></dt><dd><select id="lab-ctx-probe" aria-describedby="lab-ctx-design"></select><span id="lab-ctx-design">—</span></dd></div>
        <div><dt>Centro de Misión</dt><dd id="lab-ctx-mission" data-ready="false">Sin misión preparada</dd></div>
      </dl>
      <div class="lab-head-actions"><button type="button" id="lab-ctx-open-center" class="lab-open-center">Abrir Centro de Misión</button><button type="button" data-lab-action="orbital" title="Escena del Sistema Solar con la Sonda Experimental 01, una trayectoria ficticia que demuestra el integrador DOPRI54. No usa la sonda activa.">Demostración orbital</button><button type="button" data-lab-action="reset-camera">Restablecer cámara</button></div>
    </header>
    <nav class="lab-sections" aria-label="Áreas del laboratorio">
      <div class="lab-nav-group" role="group" aria-labelledby="lab-step-design"><span class="lab-nav-step" id="lab-step-design"><b>1</b>Elegir sonda</span><button type="button" data-lab-section="hangar" aria-current="page">Hangar</button></div>
      <div class="lab-nav-group" role="group" aria-labelledby="lab-step-plan"><span class="lab-nav-step" id="lab-step-plan"><b>2</b>Planificar</span><button type="button" data-lab-section="planner" data-planner-mode="integrated" title="El planificador principal: viaje, llegada, captura y satélite en un solo cálculo">Misión completa</button><button type="button" data-lab-section="planner" data-planner-mode="interplanetary" title="Mejores fechas de salida hacia un planeta">Ventanas interplanetarias</button><button type="button" data-lab-section="planner" data-planner-mode="lunar" title="Transferencia a la Luna y maniobras de empuje finito">Tierra–Luna</button><button type="button" data-lab-section="launch" title="Despegue hasta una órbita baja con un lanzador ilustrativo">Lanzamiento</button></div>
      <div class="lab-nav-group" role="group" aria-labelledby="lab-step-run"><span class="lab-nav-step" id="lab-step-run"><b>3</b>Reproducir</span><button type="button" data-lab-section="center">Centro de Misión</button></div>
      <button type="button" class="lab-guide-launch" data-lab-action="guide" title="Recorrido paso a paso: Cassini a Marte">Misión guiada</button>
    </nav>
    <div class="lab-workspace">
      <aside class="lab-panel lab-catalog lab-fleet" aria-label="Flota de sondas históricas">
        <div class="lab-panel-heading"><span class="eyebrow">01 / FLOTA</span><h3 id="lab-library-title">Sondas disponibles</h3></div>
        <div class="lab-panel-scroll">
          <div class="lab-welcome"><strong>¿Primera vez en el laboratorio?</strong><p>Elige una sonda, planifica su misión y reprodúcela en 3D. La misión guiada te lleva paso a paso con Cassini hasta Marte.</p><button type="button" data-lab-action="guide">Empezar la misión guiada</button></div>
          <p class="lab-helper">Cuatro sondas reales con su configuración histórica. La que elijas es la que usan todas las herramientas del laboratorio.</p>
          <div id="lab-history-list" class="lab-history-list" role="group" aria-label="Elegir la sonda activa"></div>
          <article id="lab-history-sheet" class="lab-history-sheet" aria-live="polite"></article>
        </div>
      </aside>
      <div class="lab-stage">
        <div class="lab-stage-top"><span class="eyebrow">02 / MODELO 3D</span><span id="lab-stage-count">—</span></div>
        <div id="lab-canvas" aria-label="Modelo 3D interactivo de la sonda activa"></div>
        <button type="button" id="lab-touch-toggle" class="lab-touch-toggle" aria-pressed="false" hidden>Activar control 3D</button>
        <div class="lab-stage-foot"><span id="lab-gesture-hint">Arrastra para girar · rueda para acercar</span><strong id="lab-assembly-status" aria-live="polite">—</strong></div>
      </div>
      <aside class="lab-panel lab-engineering" aria-label="Sistemas e ingeniería de la sonda activa">
        <div class="lab-panel-heading"><span class="eyebrow">03 / INGENIERÍA</span><h3>Sistemas de la sonda</h3></div>
        <div class="lab-panel-scroll">
          <p class="lab-message" id="lab-message" role="status"></p>
          <h4>Subsistemas</h4><p id="lab-assembly-note" class="lab-helper" hidden></p><div id="lab-assembly-list" class="lab-assembly-list"></div>
          <div id="lab-selected-info" class="lab-selected-info"></div>
          <div class="lab-divider"></div><h4>Balance de ingeniería</h4>
          <div class="lab-assessment" id="lab-assessment"></div>
          <div id="lab-metrics" class="lab-metrics"></div>
          <div id="lab-power" class="lab-power"></div>
          <div id="lab-compatibility" class="lab-compatibility"></div>
          <div id="lab-data-quality" class="lab-data-quality"></div>
          <p class="lab-disclaimer">Configuración histórica fija: las piezas no se pueden cambiar. Las cifras de la ficha llevan su calidad y su fuente; el reparto de masa por subsistema y los consumos sin fuente son estimaciones del simulador. El Δv es ideal (Tsiolkovski). El modelo 3D es solo presentación: no interviene en ningún cálculo. No modifica DOPRI54.</p>
        </div>
      </aside>
    </div><div id="lab-launch" hidden></div><div id="lab-mission-planner" hidden></div><div id="lab-interplanetary" hidden></div><div id="lab-integrated" hidden></div><div id="lab-mission-center" hidden></div>`;
  scene.append(lab);
  const returnButton = document.createElement('button');
  returnButton.id = 'lab-return'; returnButton.type = 'button'; returnButton.textContent = 'Volver al laboratorio';
  returnButton.hidden = true; scene.append(returnButton);
  const fleet = new Map(HISTORICAL_PROBES.map(probe => [probe.id, { ...historicalDesign(probe.id), id: `flota-${probe.id}` }]));
  let activeProbeId = readActiveProbe();
  let design = fleet.get(activeProbeId);
  let selectedPartId = null;
  let section = 'hangar';
  let engineering = null;
  let modelState = { source: 'procedural', entry: null };
  const $ = selector => lab.querySelector(selector);
  let view;
  try { view = createProbeAssemblyView($('#lab-canvas'), id => { selectedPartId = id; render(); }, { onModelState: state => { modelState = state; renderModelState(); } }); }
  catch (error) {
    view = { setDesign() {}, setVisible() {}, setTouchInteraction() {}, getLandingClearance: () => null, resetCamera() {}, dispose() {} };
    $('#lab-canvas').textContent = 'No se pudo iniciar WebGL para el modelo 3D.';
    console.error('Laboratorio 3D no disponible:', error);
  }
  let center, launchActive = false;
  const planner = createMissionPlanner($('#lab-mission-planner'), next => {
    // Un plan guardado solo puede restaurar una sonda de la flota (misma configuración que la histórica).
    const signature = designSignature(next);
    const match = [...fleet.entries()].find(([, item]) => designSignature(item) === signature);
    if (!match) { message('El plan guardado usa una sonda que ya no está en la flota (Voyager, Cassini, Dawn o Juno). Recalcula con la sonda activa.', true); return; }
    selectProbe(match[0]); message(`Sonda del plan restaurada: ${fleet.get(match[0]).name}.`);
  }, {
    // Mientras un lanzamiento está en reproducción, los cambios del Planificador no deben reemplazarlo.
    onPlanChange: candidate => { if (!launchActive) center?.setPlan(candidate); },
    onExecuteRequest: candidate => { launchActive = false; launch.deactivate(); interplanetary.deactivate(); integrated?.deactivate(); center.setPlan(candidate); section = 'center'; updateSection(); center.start(); }
  });
  const launch = createLaunchPlanner({
    host: $('#lab-launch'),
    onExecuteRequest: candidate => { interplanetary.deactivate(); integrated.deactivate(); launchActive = true; center.setPlan(candidate); section = 'center'; updateSection(); center.start(); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'El lanzamiento quedó obsoleto. Recalcula en Lanzamiento.' }); } }
  });
  // 12G: modalidad «Misiones interplanetarias» del Planificador. Comparte con el lanzamiento la marca que impide
  // que el plan lunar reemplace una ejecución activa en el Centro de Misión.
  const interplanetary = createInterplanetaryPlanner({
    host: $('#lab-interplanetary'),
    onExecuteRequest: candidate => { launch.deactivate(); integrated.deactivate(); launchActive = true; center.setPlan(candidate); section = 'center'; updateSection(); center.start(); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'La transferencia interplanetaria quedó obsoleta. Vuelve a buscar en el Planificador.' }); } }
  });
  // 13: modalidad «Misión completa» (cadena integrada de fases) con la misma marca de ejecución activa.
  const integrated = createIntegratedMissionPlanner({
    host: $('#lab-integrated'),
    onExecuteRequest: candidate => { launch.deactivate(); interplanetary.deactivate(); launchActive = true; center.setPlan(candidate); section = 'center'; updateSection(); center.start(); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'La misión completa quedó obsoleta. Recalcula en el Planificador.' }); } }
  });
  let plannerMode = 'integrated';
  center = createMissionControlCenter($('#lab-mission-center'), () => { section = 'planner'; updateSection(); });
  const centerSetPlan = center.setPlan;
  let centerPlan = null;
  center.setPlan = candidate => { centerPlan = candidate; centerSetPlan(candidate); updateMissionContext(candidate); };
  function updateMissionContext(candidate) {
    const node = $('#lab-ctx-mission');
    if (!candidate?.ready) { node.textContent = 'Sin misión preparada'; node.dataset.ready = 'false'; node.title = candidate?.reason ?? ''; return; }
    const kind = MISSION_KIND_LABELS[candidate.kind] ?? 'Transferencia Tierra–Luna';
    node.textContent = typeof candidate.name === 'string' && candidate.name ? `${kind} · ${candidate.name}` : kind;
    node.dataset.ready = 'true'; node.title = node.textContent;
  }
  function updateDesignContext() {
    const node = $('#lab-ctx-design');
    try {
      const e = engineering ?? calculateEngineering(design);
      node.textContent = `${number(e.wetMassKg, 0)} kg${e.deltaVMS != null ? ` · Δv ${number(e.deltaVMS / 1000, 2)} km/s` : ''}`;
      node.title = `${design.name}: ${number(e.wetMassKg, 0)} kg al lanzamiento${e.deltaVMS != null ? ` · Δv ideal (Tsiolkovski) ${number(e.deltaVMS, 0)} m/s` : ''}${e.propulsionType === 'electric' ? ' · propulsión eléctrica de bajo empuje' : ''}`;
    } catch { node.textContent = ''; node.title = design.name; }
    $('#lab-ctx-probe').value = activeProbeId;
  }
  {
    const select = $('#lab-ctx-probe');
    for (const probe of HISTORICAL_PROBES) select.add(new Option(probe.name, probe.id));
    select.value = activeProbeId;
    select.addEventListener('change', () => selectProbe(select.value));
  }
  $('#lab-ctx-open-center').addEventListener('click', () => { section = 'center'; updateSection(); });
  // 14: navegación directa desde el mapa de áreas de la cabecera (AppNavigator).
  document.addEventListener('lab:navigate', event => {
    const target = event.detail ?? {};
    // 16: «engineering» (enlaces antiguos) abre el Hangar con el panel de ingeniería a la vista.
    const engineeringLink = target.section === 'engineering';
    if (target.section) section = target.section in SECTION_META || target.section === 'planner' ? target.section : 'hangar';
    if (target.plannerMode && target.plannerMode in PLANNER_META) plannerMode = target.plannerMode;
    if (app.dataset.appMode === 'experimental' && lab.hidden) setBuilder(true); else updateSection();
    const focus = target.focus ?? (engineeringLink ? '.lab-engineering' : null);
    if (focus) requestAnimationFrame(() => revealInScrollAreas(lab.querySelector(focus), { block: 'start' }));
    if (target.guide) guide.start();
  });

  function message(text, error = false) {
    $('#lab-message').textContent = text;
    $('#lab-message').dataset.error = String(error);
  }
  function setBuilder(active) {
    const enabled = app.dataset.appMode === 'experimental';
    app.dataset.labView = enabled && active ? 'builder' : 'orbital';
    lab.hidden = !(enabled && active);
    returnButton.hidden = !enabled || active;
    setTouchMode(false);
    updateSection();
  }
  function updateSection() {
    const enabled = app.dataset.appMode === 'experimental' && !lab.hidden;
    const hangar = enabled && section === 'hangar';
    $('.lab-workspace').hidden = !hangar;
    $('#lab-launch').hidden = !(enabled && section === 'launch');
    $('#lab-mission-planner').hidden = !(enabled && section === 'planner' && plannerMode === 'lunar');
    $('#lab-interplanetary').hidden = !(enabled && section === 'planner' && plannerMode === 'interplanetary');
    $('#lab-integrated').hidden = !(enabled && section === 'planner' && plannerMode === 'integrated');
    $('#lab-mission-center').hidden = !(enabled && section === 'center');
    lab.dataset.section = section;
    lab.dataset.plannerMode = plannerMode;
    const meta = section === 'planner' ? { step: 'Planificar', ...PLANNER_META[plannerMode] } : SECTION_META[section];
    $('#lab-crumb-step').textContent = meta.step; $('#lab-crumb-tool').textContent = meta.title;
    $('#lab-tool-title').textContent = meta.title; $('#lab-tool-desc').textContent = meta.desc;
    $('#lab-ctx-open-center').hidden = section === 'center';
    updateDesignContext();
    for (const button of lab.querySelectorAll('[data-lab-section]')) {
      const current = button.dataset.labSection === section && (!button.dataset.plannerMode || button.dataset.plannerMode === plannerMode);
      if (current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    view.setVisible(hangar);
    planner.setVisible(enabled && section === 'planner' && plannerMode === 'lunar');
    interplanetary.setVisible(enabled && section === 'planner' && plannerMode === 'interplanetary');
    integrated.setVisible(enabled && section === 'planner' && plannerMode === 'integrated');
    center.setVisible(enabled && section === 'center');
  }
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  $('#lab-touch-toggle').hidden = !coarsePointer;
  function setTouchMode(active) {
    view.setTouchInteraction(active);
    const button = $('#lab-touch-toggle');
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? 'Desactivar control 3D' : 'Activar control 3D';
    $('#lab-gesture-hint').textContent = coarsePointer
      ? active ? 'Arrastra para girar · pellizca para acercar · desactiva el control para desplazarte'
        : 'Desliza para bajar a la ficha · activa el control 3D para girar y acercar'
      : 'Arrastra para girar · rueda para acercar';
  }
  $('#lab-touch-toggle').addEventListener('click', () => setTouchMode($('#lab-touch-toggle').getAttribute('aria-pressed') !== 'true'));
  // 15.1: cambiar de sonda sustituye el diseño en todo el laboratorio (los planificadores invalidan los cálculos de otra sonda).
  function selectProbe(probeId) {
    if (!fleet.has(probeId)) return;
    const changed = probeId !== activeProbeId;
    activeProbeId = probeId; storeActiveProbe(probeId);
    design = fleet.get(probeId); selectedPartId = null;
    render();
    if (changed) message(`${design.name} es ahora la sonda activa de todas las misiones.`);
  }
  // Flota: tarjetas de las cuatro sondas y ficha técnica con calidad y fuente de cada cifra.
  function renderFleet() {
    const list = $('#lab-history-list'); list.replaceChildren();
    for (const probe of HISTORICAL_PROBES) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'lab-probe-card';
      card.dataset.probeId = probe.id; card.setAttribute('aria-pressed', String(activeProbeId === probe.id));
      const name = document.createElement('strong'); name.textContent = probe.name;
      const meta = document.createElement('small'); meta.textContent = `${probe.launch} · ${probe.role}`;
      card.append(name, meta);
      if (activeProbeId === probe.id) { const tag = document.createElement('span'); tag.className = 'lab-probe-active'; tag.textContent = 'Sonda activa'; card.append(tag); }
      card.addEventListener('click', () => selectProbe(probe.id));
      list.append(card);
    }
    const probe = HISTORICAL_PROBES.find(item => item.id === activeProbeId) ?? HISTORICAL_PROBES[0];
    const sheet = $('#lab-history-sheet'); sheet.replaceChildren();
    const title = document.createElement('h4'); title.textContent = `${probe.name} · ficha técnica`;
    const role = document.createElement('p'); role.textContent = probe.role;
    const table = document.createElement('dl'); table.className = 'lab-facts';
    for (const fact of probe.facts) {
      const row = document.createElement('div');
      const term = document.createElement('dt'); term.textContent = fact.label;
      const value = document.createElement('dd'); value.textContent = fact.value;
      const provenance = document.createElement('dd'); provenance.className = 'lab-fact-source';
      provenance.append(qualityBadge(fact.quality));
      const link = fact.source ? sourceLink(fact.source) : null;
      if (link) provenance.append(' ', link);
      row.append(term, value, provenance); table.append(row);
    }
    const model = NASA_PROBE_MODELS[probe.id];
    const credit = document.createElement('p'); credit.className = 'lab-model-credit';
    if (model) {
      credit.append('Modelo 3D: ', externalLink(model.source, model.credit), `, archivo original sin modificar (${number(model.bytes / 1e6, 1)} MB${model.commit ? `, commit ${model.commit.slice(0, 7)}` : ''}). `);
      credit.append(externalLink(NASA_MODEL_USAGE.guidelines, 'Pautas de uso de NASA'), '. Su uso no implica respaldo de NASA.');
    }
    const parts = document.createElement('p'); parts.className = 'lab-helper';
    parts.textContent = `Arquitectura: ${getComponent(probe.coreId)?.name} con ${probe.parts.length} subsistemas. Las masas por subsistema y los consumos sin fuente son estimaciones del simulador; la masa del bus se obtiene por cierre con la masa seca documentada.`;
    const notes = document.createElement('p'); notes.className = 'lab-helper'; notes.textContent = probe.notes;
    const actions = document.createElement('div'); actions.className = 'lab-two-actions';
    const plan = document.createElement('button'); plan.type = 'button'; plan.className = 'button-primary'; plan.id = 'lab-plan-mission'; plan.textContent = `Planificar una misión con ${probe.name}`;
    plan.addEventListener('click', () => { section = 'planner'; updateSection(); });
    const systems = document.createElement('button'); systems.type = 'button'; systems.id = 'lab-open-engineering'; systems.textContent = 'Ver sistemas e ingeniería';
    systems.addEventListener('click', () => { revealInScrollAreas($('.lab-engineering')); $('.lab-engineering .lab-panel-scroll').scrollTo?.({ top: 0 }); });
    actions.append(plan, systems);
    sheet.append(title, role, table, credit, parts, notes, actions);
  }
  function renderModelState() {
    const entry = modelState.entry ?? NASA_PROBE_MODELS[activeProbeId];
    $('#lab-stage-count').textContent = `${design.name}${entry ? ` · ${modelState.source === 'nasa' ? 'NASA 3D Resources' : 'modelo de NASA'}` : ''}`;
    const status = $('#lab-assembly-status');
    status.textContent = MODEL_STATE_TEXT[modelState.source] ?? '—';
    status.dataset.state = modelState.source;
    status.title = modelState.error ? `Error de carga: ${modelState.error}` : '';
    // 16: el modelo de NASA es una malla única; la selección de un subsistema solo se resalta en la reconstrucción procedimental.
    const note = $('#lab-assembly-note');
    note.hidden = modelState.source !== 'nasa';
    note.textContent = 'Elige un subsistema para ver sus cifras y su fuente. El modelo 3D de NASA es una sola pieza, así que la selección no se resalta en él.';
  }
  function componentSpecs(component) {
    return `${component.dimensionsM.join(' × ')} m · ${number(component.dryMassKg)} kg secos`
      + (component.generationW ? ` · ${component.category === 'rtg' || component.powerSource === 'rtg' ? '' : 'a 1 AU '}+${number(component.generationW, 0)} W` : '')
      + (component.idlePowerW ? ` · ${number(component.idlePowerW)} W reposo` : '')
      + (component.activePowerW ? ` · ${number(component.activePowerW)} W activos` : '')
      + (component.batteryWh ? ` · ${number(component.batteryWh, 0)} Wh` : '')
      + (component.fuelCapacityKg ? ` · ${number(component.fuelCapacityKg)} kg de propelente` : '')
      + (component.thrustN ? ` · ${component.thrustN < 1 ? `${number(component.thrustN * 1000, 1)} mN` : `${number(component.thrustN, 2)} N`} · Isp ${number(component.ispS, 0)} s` : '')
      + (component.electric ? ` · eléctrico ${number(component.electric.minInputPowerW, 0)}–${number(component.electric.maxInputPowerW, 0)} W` : '')
      + (component.rcsPropellantKg ? ` · ${number(component.rcsPropellantKg)} kg de hidracina de actitud` : '')
      + (component.propellant ? ` · Propelente: ${propellantLabel(component.propellant)}` : '');
  }
  function appendDataQuality(container, component) {
    const entries = Object.entries(component.data ?? {});
    if (!entries.length) return;
    const list = document.createElement('ul'); list.className = 'lab-field-quality';
    for (const [key, entry] of entries) {
      const item = document.createElement('li');
      item.append(`${FIELD_LABELS[key] ?? key}: `, qualityBadge(entry.quality));
      const link = entry.source ? sourceLink(entry.source) : null;
      if (link) item.append(' ', link);
      if (entry.note) { const note = document.createElement('small'); note.textContent = ` ${entry.note}`; item.append(note); }
      list.append(item);
    }
    container.append(list);
  }
  // Subsistemas de la configuración histórica (solo lectura): al elegir uno se muestran sus cifras con calidad y fuente.
  function renderAssembly() {
    const list = $('#lab-assembly-list'); list.replaceChildren();
    const core = getComponent(design.coreId);
    const entries = core ? [{ id: 'core', componentId: core.id, socketId: 'estructura' }, ...design.parts] : [];
    for (const entry of entries) {
      const component = getComponent(entry.componentId);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'lab-assembly-item';
      button.setAttribute('aria-pressed', String(selectedPartId === entry.id));
      button.innerHTML = '<span></span><small></small>';
      button.querySelector('span').textContent = component.name;
      button.querySelector('small').textContent = entry.socketId === 'estructura' ? 'Estructura' : `${number(component.dryMassKg)} kg`;
      if (component.heritage) button.dataset.heritage = component.heritage;
      button.addEventListener('click', () => { selectedPartId = selectedPartId === entry.id ? null : entry.id; render(); });
      list.append(button);
    }
    view.setDesign(design, selectedPartId, { centerOfMassM: engineering?.centerOfMassM ?? null, showFreeSlots: false });
    const selected = selectedPartId === 'core' ? core : getComponent(design.parts.find(p => p.id === selectedPartId)?.componentId);
    const detail = $('#lab-selected-info'); detail.replaceChildren();
    if (selected) {
      const title = document.createElement('h4'); title.textContent = selected.name; detail.append(title);
      if (selected.description) { const text = document.createElement('p'); text.textContent = selected.description; detail.append(text); }
      const specs = document.createElement('p'); specs.className = 'lab-specs'; specs.textContent = componentSpecs(selected); detail.append(specs);
      appendDataQuality(detail, selected);
    }
    renderModelState();
  }
  function metricRows(container, rows) {
    for (const [label, value, title] of rows) {
      const row = document.createElement('div'); row.className = 'lab-metric';
      const term = document.createElement('span'); term.textContent = label;
      const data = document.createElement('strong'); data.textContent = value;
      if (title) row.title = title;
      row.append(term, data); container.append(row);
    }
  }
  const kN = value => value == null ? 'No disponible' : value < 1 ? `${number(value * 1000, 1)} mN` : `${number(value, value < 10 ? 2 : 0)} N`;
  function renderEngineering() {
    const result = engineering ?? calculateEngineering(design);
    const has = Boolean(design.coreId);
    const acceleration = result.thrustN && result.wetMassKg ? result.thrustN / result.wetMassKg : null;
    const massFlow = result.thrustN && result.effectiveIspS ? result.thrustN / (9.80665 * result.effectiveIspS) : null;
    const com = result.centerOfMassM, align = result.thrustAlignment;
    const metrics = [
      ['Masa seca estructural', has ? valueOrNA(result.structuralDryMassKg, 'kg') : 'No disponible', 'Bus + subsistemas sin propelente.'],
      ['Hidracina de actitud', has ? valueOrNA(result.rcsPropellantKg, 'kg') : 'No disponible', 'No la consume el motor principal: forma parte de la masa final.'],
      ['Masa seca', has ? valueOrNA(result.dryMassKg, 'kg') : 'No disponible', 'Masa final tras agotar el propelente del motor principal.'],
      ['Propelente principal', `${number(result.fuelKg)} / ${number(result.fuelCapacityKg)} kg${result.mainPropellant ? ` · ${propellantLabel(result.mainPropellant)}` : ''}`],
      ['Masa total', has ? valueOrNA(result.wetMassKg, 'kg') : 'No disponible'],
      ['Propulsión', result.propulsionType === 'electric' ? 'Eléctrica (iónica)' : result.propulsionType === 'chemical' ? 'Química' : 'Sin motor'],
      ['Empuje', kN(result.thrustN)], ['Impulso específico', valueOrNA(result.effectiveIspS, 's', 0)],
      ['Aceleración inicial', acceleration == null ? 'No disponible' : `${number(acceleration * 1000, acceleration < 0.01 ? 3 : 1)} mm/s²`],
      ['Consumo de propelente', massFlow == null ? 'No disponible' : massFlow < 0.01 ? `${number(massFlow * 1e6, 1)} mg/s` : `${number(massFlow * 1000, 1)} g/s`],
      ['Δv ideal', valueOrNA(result.deltaVMS, 'm/s', 0)],
      ['Centro de masas estimado (x, y, z)', com ? com.map(v => number(v, 2)).join(' · ') + ' m' : 'No disponible', 'Calculado con la disposición y las masas estimadas de los subsistemas; ejes del bus: +Y hacia la antena principal.'],
      ['Desalineación del empuje', align ? `${number(align.lateralOffsetM * 100, 1)} cm (límite ${number(align.limitM * 100, 0)} cm${align.gimbaled ? ', con cardán' : ''})` : 'No disponible'],
      ['Consumo de servicio', valueOrNA(result.idlePowerW, 'W')], ['Consumo en encendido', valueOrNA(result.activePowerW, 'W')],
      ['Batería', valueOrNA(result.batteryWh, 'Wh', 0)],
      ['Autonomía por batería', result.autonomyHours == null ? 'No disponible' : `${number(result.autonomyHours, 1)} h`]
    ];
    if (result.rcs) metrics.splice(6, 0, ['Control de actitud', `${result.rcs.count ?? '¿?'} × ${result.rcs.thrustN == null ? 'empuje desconocido' : kN(result.rcs.thrustN)}${result.rcs.sharesMainPropellant ? ' · comparte depósito' : ''}`]);
    const container = $('#lab-metrics'); container.replaceChildren();
    metricRows(container, metrics);

    // Energía frente a la distancia al Sol (al lanzamiento) y límites de la propulsión eléctrica.
    const power = $('#lab-power'); power.replaceChildren();
    if (has && result.power) {
      const heading = document.createElement('h4'); heading.textContent = 'Energía según la distancia al Sol'; power.append(heading);
      const table = document.createElement('table'); table.className = 'lab-power-table';
      table.innerHTML = '<caption>Generación al lanzamiento frente al consumo de servicio</caption><thead><tr><th scope="col">Lugar</th><th scope="col">AU</th><th scope="col">Generación</th><th scope="col">Margen</th></tr></thead><tbody></tbody>';
      for (const point of result.power.profile) {
        const row = document.createElement('tr'); row.dataset.tone = point.marginW >= 0 ? 'ok' : 'bad';
        for (const value of [point.label, number(point.distanceAu, 2), `${number(point.totalW, 0)} W`, `${point.marginW >= 0 ? '+' : ''}${number(point.marginW, 0)} W`]) {
          const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        }
        table.tBodies[0].append(row);
      }
      power.append(table);
      const rows = [];
      if (result.power.rtgAtLaunchW > 0) rows.push(['RTG al lanzamiento / a 10 años', `${number(result.power.rtgAtLaunchW, 0)} / ${number(result.power.rtgAfter10YearsW, 0)} W`]);
      rows.push(['Equilibrio generación–servicio', Number.isFinite(result.power.serviceBreakEvenAu) ? `${number(result.power.serviceBreakEvenAu, 2)} AU` : 'Sin límite por distancia (RTG)']);
      if (result.electric) {
        rows.push(['Potencia para el motor a 1 AU', `${number(result.electric.availableInputAt1AuW, 0)} W (mín. ${number(result.electric.minInputPowerW, 0)} · máx. ${number(result.electric.maxInputPowerW, 0)} W)`]);
        rows.push(['Empuje eléctrico a 1 AU', result.electric.operableAt1Au ? `${kN(result.electric.thrustAt1AuN)} (${number(result.electric.throttleAt1Au * 100, 0)} %)` : 'No puede encenderse']);
        rows.push(['Límite de encendido', Number.isFinite(result.electric.operatingLimitAu) ? `${number(result.electric.operatingLimitAu, 2)} AU` : 'Sin límite por distancia']);
      }
      metricRows(power, rows);
    }

    // Veredicto de ingeniería y restricciones agrupadas por tipo.
    const assessment = $('#lab-assessment'); assessment.replaceChildren();
    const status = result.assessment?.status ?? (result.structuralIssues.length ? ENGINEERING_STATUS.modify : ENGINEERING_STATUS.coherent);
    const heading = document.createElement('strong'); heading.textContent = status;
    assessment.dataset.valid = String(has && status !== ENGINEERING_STATUS.modify && status !== ENGINEERING_STATUS.incomplete);
    assessment.dataset.tone = !has ? 'idle' : status === ENGINEERING_STATUS.modify ? 'bad' : status === ENGINEERING_STATUS.warnings ? 'warn' : 'ok';
    assessment.append(heading);
    for (const text of [result.assessment?.explanation, result.assessment?.nature].filter(Boolean)) { const line = document.createElement('p'); line.textContent = text; assessment.append(line); }
    if (result.assessment?.programs?.length) {
      const programs = document.createElement('p'); programs.className = 'lab-programs';
      programs.textContent = `Programa: ${result.assessment.programs.map(id => PROGRAM_LABELS[id] ?? id).join(' · ')}`;
      assessment.append(programs);
    }
    const compatibility = $('#lab-compatibility'); compatibility.replaceChildren();
    const issues = result.compatibility ?? [];
    if (issues.length) {
      const title = document.createElement('h4'); title.textContent = `Comprobaciones (${result.assessment.errors} error${result.assessment.errors === 1 ? '' : 'es'} · ${result.assessment.warnings} advertencia${result.assessment.warnings === 1 ? '' : 's'})`;
      compatibility.append(title);
      const types = [...COMPATIBILITY_TYPES, ...new Set(issues.map(item => item.type).filter(type => !COMPATIBILITY_TYPES.includes(type)))];
      const list = document.createElement('ul');
      for (const type of types) for (const item of issues.filter(issue => issue.type === type)) {
        const line = document.createElement('li'); line.dataset.severity = item.severity;
        const tag = document.createElement('b'); tag.textContent = type;
        line.append(tag, ` ${item.message}`); list.append(line);
      }
      compatibility.append(list);
    }
    for (const note of result.notes) { const line = document.createElement('p'); line.className = 'lab-helper'; line.textContent = note; compatibility.append(line); }

    // Calidad de los datos y referencias de la sonda.
    const quality = $('#lab-data-quality'); quality.replaceChildren();
    const dq = result.dataQuality;
    if (has && dq) {
      const title = document.createElement('h4'); title.textContent = 'Calidad de los datos'; quality.append(title);
      const counts = document.createElement('p'); counts.className = 'lab-quality-counts';
      for (const [q, n] of Object.entries(dq.counts)) if (n) { counts.append(qualityBadge(q), ` ${n}  `); }
      quality.append(counts);
      if (dq.dependsOnEstimates) { const note = document.createElement('p'); note.className = 'lab-helper'; note.textContent = 'Los resultados dependen de cifras estimadas o desconocidas: úsalos como orden de magnitud, no como datos históricos.'; quality.append(note); }
      if (dq.sources.length) {
        const list = document.createElement('ul'); list.className = 'lab-sources';
        for (const source of dq.sources) { const item = document.createElement('li'); const link = sourceLink(source.id); if (link) { link.textContent = source.title; item.append(link, ` · ${source.publisher}`); list.append(item); } }
        quality.append(list);
      }
    }
  }
  function render() {
    try { engineering = calculateEngineering(design); } catch { engineering = null; }
    updateDesignContext();
    renderFleet();
    renderAssembly(); renderEngineering();
    planner.setDesign(design); launch.setDesign(design); interplanetary.setDesign(design); integrated.setDesign(design);
  }
  $('[data-lab-action="orbital"]').addEventListener('click', () => setBuilder(false));
  for (const button of lab.querySelectorAll('[data-lab-action="guide"]')) button.addEventListener('click', () => guide.start());
  $('[data-lab-action="reset-camera"]').addEventListener('click', () => section === 'planner' ? planner.resetCamera() : section === 'center' ? center.resetCamera() : view.resetCamera());
  for (const button of lab.querySelectorAll('[data-lab-section]:not(:disabled)')) button.addEventListener('click', () => {
    section = button.dataset.labSection;
    if (button.dataset.plannerMode) plannerMode = button.dataset.plannerMode;
    updateSection();
  });
  // 16: misión guiada. Solo usa los mismos controles y estados que el usuario.
  const guide = createLabGuidedMission({ host: lab, api: {
    activeProbeId: () => activeProbeId,
    selectProbe,
    section: () => section, plannerMode: () => plannerMode,
    go(nextSection, nextMode) { section = nextSection; if (nextMode) plannerMode = nextMode; updateSection(); },
    integratedState: () => integrated.getState(),
    applyScenario(id) { $('#im-scenario').value = id; $('#im-scenario').dispatchEvent(new Event('change')); },
    computeIntegrated: () => integrated.compute(),
    executeIntegrated() { $('#im-execute').click(); },
    centerKind: () => centerPlan?.ready ? centerPlan.kind ?? 'mission' : null
  } });
  returnButton.addEventListener('click', () => setBuilder(true));
  const modeObserver = new MutationObserver(() => {
    if (app.dataset.appMode === 'experimental') { setBuilder(true); render(); }
    else { setBuilder(false); delete app.dataset.labView; }
  });
  modeObserver.observe(app, { attributes: true, attributeFilter: ['data-app-mode'] });
  const header = document.querySelector('.app-header');
  const modeNavigation = document.querySelector('#app-mode-switcher');
  function measureHeader() {
    const bottom = Math.max(header.getBoundingClientRect().bottom,
      modeNavigation.getBoundingClientRect().bottom,
      header.querySelector('.brand').getBoundingClientRect().bottom,
      ...[...modeNavigation.querySelectorAll('button')].map(button => button.getBoundingClientRect().bottom));
    app.style.setProperty('--lab-top', `${Math.ceil(bottom + 8)}px`);
  }
  const headerObserver = new ResizeObserver(measureHeader);
  headerObserver.observe(header); headerObserver.observe(modeNavigation);
  for (const button of modeNavigation.querySelectorAll('button')) headerObserver.observe(button);
  window.addEventListener('resize', measureHeader);
  measureHeader();
  render();
  if (app.dataset.appMode === 'experimental') setBuilder(true);
  return { dispose: () => {
    modeObserver.disconnect(); headerObserver.disconnect(); window.removeEventListener('resize', measureHeader);
    guide.dispose(); center.dispose(); integrated.dispose(); interplanetary.dispose(); launch.dispose(); planner.dispose(); view.dispose(); lab.remove(); returnButton.remove(); app.style.removeProperty('--lab-top');
    delete app.dataset.labView;
  } };
}
