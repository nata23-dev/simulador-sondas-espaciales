import './experimental-laboratory.css';
import { getComponent } from '../lab/ComponentCatalog.js';
import { historicalDesign } from '../lab/ProbeDesign.js';
import { calculateEngineering, ENGINEERING_STATUS } from '../lab/ProbeEngineering.js';
import { HISTORICAL_PROBES, HERITAGE_PROGRAMS, HERITAGE_SOURCES, DATA_QUALITY, getHistoricalProbe } from '../lab/HeritageCatalog.js';
import { designSignature } from '../lab/MissionPlanStore.js';
import { createProbeAssemblyView } from '../lab/ProbeAssemblyView.js';
import { NASA_PROBE_MODELS, NASA_MODEL_USAGE } from '../graphics/NasaProbeModels.js';
import { documentsFor, probeSources, DOCUMENT_KINDS, ARCHITECTURE_GROUPS, architectureGroupOf } from '../lab/FleetDocuments.js';
import { createExperimentalDesign, slotOptions, changeSlot, differencesFromBase, loadExperimental, saveExperimental } from '../lab/ExperimentalAssembly.js';
import { createMissionPlanner } from './MissionPlanner.js';
import { createMissionControlCenter } from './MissionControlCenter.js';
import { createLaunchPlanner } from './LaunchPlanner.js';
import { createInterplanetaryPlanner } from './InterplanetaryPlanner.js';
import { createIntegratedMissionPlanner } from './IntegratedMissionPlanner.js';
import { createLabGuidedMission, revealInScrollAreas } from './LabGuidedMission.js';
import { createLabGlossary, GLOSSARY } from './LabGlossary.js';
import { LAB_STAGES } from './LabStages.js';

const number = (value, digits = 1) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(value);
const valueOrNA = (value, unit, digits = 1) => value == null ? 'No disponible' : `${number(value, digits)} ${unit}`;

export { LAB_STAGES } from './LabStages.js';

const STAGE_BY_ID = new Map(LAB_STAGES.map(stage => [stage.id, stage]));
const tabMeta = (stageId, tabId) => STAGE_BY_ID.get(stageId)?.tabs.find(item => item.id === tabId) ?? null;
const PLANNER_TABS = new Set(['integrated', 'interplanetary', 'lunar']);
const EXECUTE_BY_TAB = Object.freeze({ integrated: '#im-execute', interplanetary: '#ip-execute', lunar: '#mission-execute', launch: '#ln-execute' });

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
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
const MISSION_KIND_LABELS = Object.freeze({ integrated: 'Misión completa', interplanetary: 'Transferencia interplanetaria', landing: 'Descenso y aterrizaje',
  launch: 'Lanzamiento terrestre', 'finite-thrust': 'Maniobra de empuje finito' });

// 15.1: flota fija. Cada sonda tiene un único diseño (configuración histórica) con identificador estable.
// 17: además, un ensamblaje experimental opcional (piezas de herencia combinadas), separado de la flota histórica.
const ACTIVE_PROBE_KEY = 'simulador:sonda-activa';
const VEHICLE_MODE_KEY = 'simulador:vehiculo-activo';
const RAIL_KEY = 'simulador:panel-etapas';
const DEFAULT_PROBE_ID = 'cassini';
const MODEL_STATE_TEXT = Object.freeze({ nasa: 'Modelo 3D oficial de NASA', cargando: 'Cargando el modelo 3D de NASA…',
  procedural: 'Reconstrucción procedimental de respaldo (no se pudo cargar el modelo de NASA)',
  esquema: 'Esquema técnico: reconstrucción del simulador, con la pieza elegida resaltada' });
const readStored = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage.setItem(key, value); } catch { /* preferencia opcional */ } };
function readActiveProbe() { const id = readStored(ACTIVE_PROBE_KEY, DEFAULT_PROBE_ID); return HISTORICAL_PROBES.some(p => p.id === id) ? id : DEFAULT_PROBE_ID; }

// 17.1: `missionScene` (SolarSystemMissionView) permite reproducir las misiones heliocéntricas en el Sistema Solar principal.
export function createExperimentalLaboratory({ missionScene = null } = {}) {
  const app = document.querySelector('#app');
  const scene = document.querySelector('.scene-panel');
  const lab = document.createElement('section');
  lab.id = 'experimental-lab';
  lab.setAttribute('aria-label', 'Laboratorio de misiones con sondas históricas');
  lab.hidden = true;
  const stepButton = stage => `<li data-step="${stage.id}"><button type="button" class="lab-step" data-lab-stage="${stage.id}" title="${stage.number} · ${stage.title}"><b>${stage.number}</b><span><strong>${stage.title}</strong><small id="lab-step-${stage.id}-state">—</small></span></button></li>`;
  const tabButtons = LAB_STAGES.flatMap(stage => stage.tabs.map(item => `<button type="button" data-lab-tab="${item.id}" data-tab-stage="${stage.id}">${item.title}</button>`)).join('');
  lab.innerHTML = `
    <aside class="lab-rail" id="lab-rail" aria-label="Etapas del laboratorio">
      <div class="lab-rail-head"><span class="eyebrow">Etapas</span>
        <button type="button" id="lab-rail-toggle" class="lab-rail-toggle" aria-expanded="true" aria-controls="lab-rail" title="Ocultar el panel de etapas"><svg class="icon" aria-hidden="true"><use href="#icon-chevrons-left"></use></svg><span class="sr-only">Ocultar o mostrar el panel de etapas</span></button></div>
      <nav class="lab-sections" aria-label="Etapas del laboratorio"><ol class="lab-steps">${LAB_STAGES.map(stepButton).join('')}</ol></nav>
      <div class="lab-rail-actions">
        <button type="button" class="lab-guide-launch" data-lab-action="guide" title="Recorrido paso a paso: Cassini a Marte"><svg class="icon" aria-hidden="true"><use href="#icon-target"></use></svg><span>Iniciar misión guiada</span></button>
        <button type="button" class="lab-rail-secondary" data-lab-action="glossary" title="Explicación breve de los términos científicos"><svg class="icon" aria-hidden="true"><use href="#icon-help"></use></svg><span>Glosario</span></button>
      </div>
      <p class="lab-rail-note">La sonda, los cálculos y la misión preparada se conservan al cambiar de etapa.</p>
    </aside>
    <div class="lab-main">
      <header class="lab-header">
        <div class="lab-title">
          <nav class="lab-breadcrumb" aria-label="Ubicación en el laboratorio"><span>Laboratorio</span><span id="lab-crumb-step">1 · Elegir sonda</span><span id="lab-crumb-tool" aria-current="location">Vista general</span></nav>
          <h2 id="lab-tool-title">Vista general</h2><p id="lab-tool-desc"></p><span id="lab-tool-chain" class="lab-chain" hidden></span>
        </div>
        <dl class="lab-context" aria-label="Resumen de la misión">
          <div class="lab-context-probe"><dt><label for="lab-ctx-probe">Sonda</label></dt><dd><select id="lab-ctx-probe" aria-describedby="lab-ctx-design"></select><span id="lab-ctx-design">—</span></dd></div>
          <div class="lab-context-dest"><dt>Destino</dt><dd id="lab-ctx-destination">—</dd></div>
          <div class="lab-context-state"><dt>Estado</dt><dd id="lab-ctx-state" data-tone="idle" aria-live="polite">—</dd></div>
          <div class="lab-context-mission" hidden><dt>Centro de Misión</dt><dd id="lab-ctx-mission" data-ready="false">Sin misión preparada</dd></div>
        </dl>
        <div class="lab-head-actions"><button type="button" id="lab-ctx-open-center" class="lab-open-center" hidden>Reproducir la misión preparada</button><button type="button" data-lab-action="reset-camera">Restablecer cámara</button></div>
      </header>
      <nav class="lab-tabs" id="lab-tabs" aria-label="Herramientas de la etapa">${tabButtons}</nav>
      <div class="lab-content">
        <div class="lab-workspace">
          <aside class="lab-panel lab-probe-panel" aria-labelledby="lab-tool-title">
            <div class="lab-panel-scroll">
              <p class="lab-message" id="lab-message" role="status"></p>
              <section class="lab-tabpane" data-tabpane="overview">
                <div class="lab-welcome"><strong>¿Primera vez en el laboratorio?</strong><p>Elige una sonda, planifica su misión y reprodúcela en 3D. La misión guiada te lleva en cinco pasos con Cassini hasta Marte.</p><button type="button" data-lab-action="guide">Iniciar misión guiada</button></div>
                <div class="lab-vehicle-mode" role="group" aria-label="Tipo de vehículo"><button type="button" data-vehicle-mode="historic" aria-pressed="true">Configuración histórica</button><button type="button" data-vehicle-mode="experimental" aria-pressed="false">Ensamblaje experimental</button></div>
                <div id="lab-historic" class="lab-historic">
                  <div id="lab-history-list" class="lab-history-list" role="group" aria-label="Elegir la sonda activa"></div>
                  <article id="lab-history-sheet" class="lab-history-sheet" aria-live="polite"></article>
                </div>
                <div id="lab-custom" class="lab-custom" hidden></div>
              </section>
              <section class="lab-tabpane" data-tabpane="architecture" hidden>
                <div class="lab-arch-view" role="group" aria-label="Representación del modelo 3D"><button type="button" data-arch-view="nasa" aria-pressed="true">Modelo de NASA</button><button type="button" data-arch-view="schematic" aria-pressed="false">Esquema técnico</button></div>
                <p id="lab-assembly-note" class="lab-helper"></p>
                <div id="lab-assembly-list" class="lab-assembly-list"></div>
                <div id="lab-selected-info" class="lab-selected-info"></div>
              </section>
              <section class="lab-tabpane" data-tabpane="docs" hidden><div id="lab-docs" class="lab-docs"></div></section>
              <section class="lab-tabpane lab-engineering" data-tabpane="engineering" hidden>
                <div id="lab-eng-summary" class="lab-eng-summary" aria-label="Resumen de capacidades"></div>
                <div class="lab-assessment" id="lab-assessment"></div>
                <details class="lab-eng-details" open><summary>Masas, propulsión y control de actitud</summary><div id="lab-metrics" class="lab-metrics"></div></details>
                <details class="lab-eng-details"><summary>Energía según la distancia al Sol</summary><div id="lab-power" class="lab-power"></div></details>
                <details class="lab-eng-details"><summary>Comprobaciones de compatibilidad</summary><div id="lab-compatibility" class="lab-compatibility"></div></details>
                <details class="lab-eng-details"><summary>Calidad de los datos y fuentes</summary><div id="lab-data-quality" class="lab-data-quality"></div></details>
                <p class="lab-disclaimer" id="lab-eng-disclaimer"></p>
              </section>
            </div>
          </aside>
          <div class="lab-stage">
            <div class="lab-stage-top"><span class="eyebrow">MODELO 3D</span><span id="lab-stage-count">—</span></div>
            <div id="lab-canvas" aria-label="Modelo 3D interactivo de la sonda activa"></div>
            <button type="button" id="lab-touch-toggle" class="lab-touch-toggle" aria-pressed="false" hidden>Activar control 3D</button>
            <div class="lab-stage-foot"><span id="lab-gesture-hint">Arrastra para girar · rueda para acercar</span><strong id="lab-assembly-status" aria-live="polite">—</strong></div>
          </div>
        </div>
        <div id="lab-launch" hidden></div><div id="lab-mission-planner" hidden></div><div id="lab-interplanetary" hidden></div><div id="lab-integrated" hidden></div><div id="lab-mission-center" hidden></div>
      </div>
    </div>
    <dialog id="lab-glossary" class="lab-dialog" aria-labelledby="lab-glossary-title"><div class="lab-dialog-head"><h3 id="lab-glossary-title">Glosario científico</h3><button type="button" data-close-dialog>Cerrar</button></div><dl class="lab-glossary-list"></dl></dialog>
    <dialog id="lab-lightbox" class="lab-dialog lab-lightbox" aria-labelledby="lab-lightbox-title"><div class="lab-dialog-head"><h3 id="lab-lightbox-title"></h3><button type="button" data-close-dialog>Cerrar</button></div><figure><img id="lab-lightbox-img" alt=""><figcaption id="lab-lightbox-caption"></figcaption></figure></dialog>`;
  scene.append(lab);
  const fleet = new Map(HISTORICAL_PROBES.map(probe => [probe.id, { ...historicalDesign(probe.id), id: `flota-${probe.id}` }]));
  let activeProbeId = readActiveProbe();
  let experimentalDesign = loadExperimental() ?? createExperimentalDesign(activeProbeId);
  let vehicleMode = readStored(VEHICLE_MODE_KEY, 'historic') === 'experimental' ? 'experimental' : 'historic';
  let design = vehicleMode === 'experimental' ? experimentalDesign : fleet.get(activeProbeId);
  let selectedPartId = null, archView = 'nasa', customNotes = [], customError = '';
  let stage = 'probe';
  const tabByStage = { probe: 'overview', plan: 'integrated', play: 'playback' };
  let lastPlannerMode = 'integrated';
  let engineering = null;
  let modelState = { source: 'procedural', entry: null };
  const $ = selector => lab.querySelector(selector);
  let view;
  try { view = createProbeAssemblyView($('#lab-canvas'), id => { selectedPartId = id; if (stage === 'probe' && tabByStage.probe !== 'architecture') go('probe', 'architecture'); render(); }, { onModelState: state => { modelState = state; renderModelState(); } }); }
  catch (error) {
    view = { setDesign() {}, setVisible() {}, setTouchInteraction() {}, getLandingClearance: () => null, resetCamera() {}, dispose() {} };
    $('#lab-canvas').textContent = 'No se pudo iniciar WebGL para el modelo 3D.';
    console.error('Laboratorio 3D no disponible:', error);
  }
  let center, launchActive = false;
  const toCenter = candidate => { center.setPlan(candidate); go('play', 'playback'); center.start(); };
  const planner = createMissionPlanner($('#lab-mission-planner'), next => {
    // Un plan guardado solo puede restaurar una sonda de la flota (misma configuración que la histórica).
    const signature = designSignature(next);
    const match = [...fleet.entries()].find(([, item]) => designSignature(item) === signature);
    if (!match) { message('El plan guardado usa una sonda que ya no está en la flota (Voyager, Cassini, Dawn o Juno). Recalcula con la sonda activa.', true); return; }
    selectProbe(match[0]); message(`Sonda del plan restaurada: ${fleet.get(match[0]).name}.`);
  }, {
    // Mientras un lanzamiento está en reproducción, los cambios del Planificador no deben reemplazarlo.
    onPlanChange: candidate => { if (!launchActive) center?.setPlan(candidate); },
    onExecuteRequest: candidate => { launchActive = false; launch.deactivate(); interplanetary.deactivate(); integrated?.deactivate(); toCenter(candidate); }
  });
  const launch = createLaunchPlanner({
    host: $('#lab-launch'),
    onExecuteRequest: candidate => { interplanetary.deactivate(); integrated.deactivate(); launchActive = true; toCenter(candidate); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'El lanzamiento quedó obsoleto. Recalcula en Lanzamiento.' }); } }
  });
  // 12G: la marca de ejecución activa impide que el plan lunar reemplace una ejecución en el Centro de Misión.
  const interplanetary = createInterplanetaryPlanner({
    host: $('#lab-interplanetary'),
    onExecuteRequest: candidate => { launch.deactivate(); integrated.deactivate(); launchActive = true; toCenter(candidate); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'La transferencia interplanetaria quedó obsoleta. Vuelve a buscar en Planificar.' }); } }
  });
  const integrated = createIntegratedMissionPlanner({
    host: $('#lab-integrated'),
    onExecuteRequest: candidate => { launch.deactivate(); interplanetary.deactivate(); launchActive = true; toCenter(candidate); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'La misión completa quedó obsoleta. Recalcula en Planificar.' }); } },
    onStateChange: () => updateStatus()
  });
  center = createMissionControlCenter($('#lab-mission-center'), () => go('plan', tabByStage.plan), {
    onImmersive: value => { lab.dataset.immersive = String(value); },
    // 17.1: con una misión heliocéntrica, «3 · Reproducir» deja ver el Sistema Solar principal en el área de la escena.
    sceneView: missionScene,
    onSceneMode: mode => { if (mode) app.dataset.labScene = mode; else delete app.dataset.labScene; },
    onOpenResults: () => go('plan', centerPlan?.kind === 'launch' ? 'launch' : centerPlan?.kind === 'interplanetary' ? 'interplanetary' : centerPlan?.kind === 'integrated' ? 'integrated' : 'lunar')
  });
  const centerSetPlan = center.setPlan;
  let centerPlan = null, invalidated = null;
  center.setPlan = candidate => {
    if (!candidate?.ready && centerPlan?.ready) invalidated = candidate?.reason ?? 'La misión preparada dejó de ser válida.';
    if (candidate?.ready) invalidated = null;
    centerPlan = candidate; centerSetPlan(!candidate?.ready && invalidated ? { ...candidate, reason: invalidated } : candidate); updateMissionContext(candidate); updateStatus();
  };
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
    $('#lab-ctx-probe').value = vehicleMode === 'experimental' ? 'experimental' : activeProbeId;
  }
  {
    const select = $('#lab-ctx-probe');
    for (const probe of HISTORICAL_PROBES) select.add(new Option(probe.name, probe.id));
    select.add(new Option('Experimental', 'experimental'));
    select.addEventListener('change', () => select.value === 'experimental' ? setVehicleMode('experimental') : selectProbe(select.value));
  }
  $('#lab-ctx-open-center').addEventListener('click', () => go('play', 'playback'));
  // 14: navegación directa desde el mapa de áreas de la cabecera (AppNavigator). Admite los nombres antiguos de sección.
  document.addEventListener('lab:navigate', event => {
    const target = event.detail ?? {};
    if (target.stage && STAGE_BY_ID.has(target.stage)) setLocation(target.stage, target.tab);
    else if (target.section === 'engineering') setLocation('probe', 'engineering');
    else if (target.section === 'hangar') setLocation('probe', target.tab ?? 'overview');
    else if (target.section === 'planner') setLocation('plan', PLANNER_TABS.has(target.plannerMode) ? target.plannerMode : 'integrated');
    else if (target.section === 'launch') setLocation('plan', 'launch');
    else if (target.section === 'center') setLocation('play', target.tab ?? 'playback');
    if (app.dataset.appMode === 'experimental' && lab.hidden) setBuilder(true); else updateSection();
    if (target.focus) requestAnimationFrame(() => revealInScrollAreas(lab.querySelector(target.focus), { block: 'start' }));
    if (target.guide) guide.start();
  });

  function message(text, error = false) {
    $('#lab-message').textContent = text;
    $('#lab-message').dataset.error = String(error);
  }
  function setBuilder(active) {
    const enabled = app.dataset.appMode === 'experimental';
    if (enabled && active) app.dataset.labView = 'builder'; else delete app.dataset.labView;
    lab.hidden = !(enabled && active);
    setTouchMode(false);
    updateSection();
  }
  // Ubicación: etapa + pestaña. `section`/`plannerMode` se derivan para la misión guiada y los enlaces antiguos.
  function setLocation(stageId, tabId) {
    if (!STAGE_BY_ID.has(stageId)) return;
    stage = stageId;
    if (tabId && tabMeta(stageId, tabId)) tabByStage[stageId] = tabId;
    if (stage === 'plan' && PLANNER_TABS.has(tabByStage.plan)) lastPlannerMode = tabByStage.plan;
  }
  function go(stageId, tabId) { setLocation(stageId, tabId); updateSection(); }
  const sectionOf = () => stage === 'probe' ? 'hangar' : stage === 'play' ? 'center' : tabByStage.plan === 'launch' ? 'launch' : 'planner';
  function updateSection() {
    const enabled = app.dataset.appMode === 'experimental' && !lab.hidden;
    const current = tabByStage[stage], meta = tabMeta(stage, current), stageMeta = STAGE_BY_ID.get(stage);
    const show = (selector, value) => { $(selector).hidden = !value; };
    show('.lab-workspace', enabled && stage === 'probe');
    show('#lab-launch', enabled && stage === 'plan' && current === 'launch');
    show('#lab-mission-planner', enabled && stage === 'plan' && current === 'lunar');
    show('#lab-interplanetary', enabled && stage === 'plan' && current === 'interplanetary');
    show('#lab-integrated', enabled && stage === 'plan' && current === 'integrated');
    show('#lab-mission-center', enabled && stage === 'play');
    for (const pane of lab.querySelectorAll('[data-tabpane]')) pane.hidden = pane.dataset.tabpane !== tabByStage.probe;
    lab.dataset.stage = stage; lab.dataset.tab = current; lab.dataset.section = sectionOf(); lab.dataset.plannerMode = lastPlannerMode;
    $('#lab-crumb-step').textContent = `${stageMeta.number} · ${stageMeta.title}`; $('#lab-crumb-tool').textContent = meta.title;
    $('#lab-tool-title').textContent = meta.title; $('#lab-tool-desc').textContent = meta.desc;
    $('#lab-tool-chain').hidden = !meta.chain; $('#lab-tool-chain').textContent = meta.chain ?? '';
    $('#lab-tool-chain').dataset.tone = meta.chain?.startsWith('Fases') ? 'ok' : 'warn';
    for (const button of lab.querySelectorAll('[data-lab-stage]')) {
      if (button.dataset.labStage === stage) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    }
    for (const button of lab.querySelectorAll('[data-lab-tab]')) {
      button.hidden = button.dataset.tabStage !== stage;
      if (button.dataset.tabStage === stage && button.dataset.labTab === current) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    $('[data-lab-action="reset-camera"]').hidden = !(stage === 'probe' || stage === 'play' || (stage === 'plan' && current === 'lunar'));
    updateDesignContext();
    view.setVisible(enabled && stage === 'probe');
    planner.setVisible(enabled && stage === 'plan' && current === 'lunar');
    interplanetary.setVisible(enabled && stage === 'plan' && current === 'interplanetary');
    integrated.setVisible(enabled && stage === 'plan' && current === 'integrated');
    if (stage === 'play') center.setPane(current);
    center.setVisible(enabled && stage === 'play');
    if (stage !== 'play') delete lab.dataset.immersive;
    updateStatus();
  }

  // ---------- Estado de la misión (barra de contexto y panel lateral) ----------
  const selectedText = selector => { const select = $(selector); return select?.selectedOptions?.[0]?.textContent?.replace(/\s*\(.*\)$/, '') ?? ''; };
  function destinationText() {
    const status = center.getStatus();
    if (stage === 'play' && status.ready) return status.name ?? '—';
    const current = tabByStage.plan;
    if (current === 'integrated') { const moon = $('#im-moon')?.value ? selectedText('#im-moon') : ''; return `${selectedText('#im-destination') || '—'}${moon ? ` → ${moon}` : ''}`; }
    if (current === 'interplanetary') return selectedText('#ip-destination') || '—';
    if (current === 'lunar') return 'Luna';
    return 'Órbita baja terrestre';
  }
  function planState() {
    const current = tabByStage.plan;
    if (current === 'integrated') {
      const s = integrated.getState();
      if (s.busy) return { text: 'Calculando trayectoria…', tone: 'busy', computed: false };
      if (s.mission) {
        const verdict = s.mission.verdict;
        const base = verdict.startsWith('NO VIABLE') ? { text: 'Misión no viable según el modelo', tone: 'bad', computed: true }
          : verdict.startsWith('CADENA CALCULADA COMPLETA') ? { text: 'Misión viable según el modelo', tone: 'ok', computed: true }
          : { text: 'Calculada: objetivos no alcanzados', tone: 'warn', computed: true };
        return s.executable ? base : { ...base, text: `${base.text} · sin reproducción 3D disponible`, tone: base.tone === 'ok' ? 'warn' : base.tone, playable: false };
      }
      if ($('#im-message')?.dataset.error === 'true' && $('#im-message').textContent) return { text: 'Error de carga o de cálculo', tone: 'bad', computed: false };
      return { text: 'Sin calcular', tone: 'idle', computed: false };
    }
    const execute = $(EXECUTE_BY_TAB[current]);
    return execute && !execute.disabled ? { text: 'Cálculo completado', tone: 'ok', computed: true } : { text: 'Sin calcular', tone: 'idle', computed: false };
  }
  function playState(status) {
    if (!status.ready) return invalidated ? { text: 'Resultado invalidado: recalcula', tone: 'warn' } : { text: 'Sin misión preparada', tone: 'idle' };
    if (status.interrupted) return { text: 'Reproducción interrumpida', tone: 'bad' };
    if (status.playing) return { text: 'Reproducción en curso', tone: 'play' };
    if (status.finished) return { text: 'Simulación finalizada', tone: 'ok' };
    return { text: status.elapsedSeconds > 0 ? 'Reproducción en pausa' : 'Lista para reproducir', tone: 'ok' };
  }
  function updateStatus() {
    if (!center) return;
    const status = center.getStatus(), plan = planState(), play = playState(status);
    let overall;
    if (!design) overall = { text: 'Sin sonda seleccionada', tone: 'idle' };
    else if (plan.tone === 'busy') overall = plan;
    else if (status.ready) overall = play;
    else if (plan.computed) overall = { text: `${plan.text}${plan.playable !== false && (plan.tone === 'ok' || plan.tone === 'warn') ? ' · lista para enviar a Reproducir' : ''}`, tone: plan.tone };
    else if (invalidated) overall = { text: 'Resultado invalidado: recalcula', tone: 'warn' };
    else overall = { text: stage === 'probe' ? 'Sonda seleccionada · lista para planificar' : 'Lista para planificar', tone: 'idle' };
    const state = $('#lab-ctx-state');
    if (state.textContent !== overall.text) state.textContent = overall.text;
    state.dataset.tone = overall.tone; state.title = invalidated && !status.ready ? invalidated : '';
    $('#lab-ctx-destination').textContent = destinationText();
    $('#lab-step-probe-state').textContent = design?.name ?? 'Sin sonda';
    $('#lab-step-plan-state').textContent = `${tabMeta('plan', tabByStage.plan).title} · ${plan.text.toLowerCase()}`;
    $('#lab-step-play-state').textContent = status.ready ? `${play.text}${status.vehicle ? ` · ${status.vehicle}` : ''}` : play.text;
    const progress = { probe: design ? 'done' : 'todo', plan: plan.computed || status.ready ? 'done' : plan.tone === 'busy' ? 'busy' : 'todo', play: status.finished ? 'done' : status.ready ? 'ready' : 'todo' };
    for (const item of lab.querySelectorAll('.lab-steps > li')) { item.dataset.progress = progress[item.dataset.step]; item.dataset.tone = item.dataset.step === 'plan' ? plan.tone : item.dataset.step === 'play' ? play.tone : 'ok'; }
    $('#lab-ctx-open-center').hidden = !status.ready || stage === 'play';
  }
  const statusTimer = setInterval(() => { if (!lab.hidden) updateStatus(); }, 500);

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
    const changed = probeId !== activeProbeId || vehicleMode !== 'historic';
    activeProbeId = probeId; store(ACTIVE_PROBE_KEY, probeId);
    vehicleMode = 'historic'; store(VEHICLE_MODE_KEY, 'historic');
    design = fleet.get(probeId); selectedPartId = null;
    render();
    if (changed) message(`${design.name} es ahora la sonda activa de todas las misiones.`);
  }
  // 17: el ensamblaje experimental es un vehículo aparte; al activarlo pasa a ser el de todas las herramientas.
  function setVehicleMode(mode) {
    if (mode === vehicleMode) { render(); return; }
    vehicleMode = mode === 'experimental' ? 'experimental' : 'historic'; store(VEHICLE_MODE_KEY, vehicleMode);
    design = vehicleMode === 'experimental' ? experimentalDesign : fleet.get(activeProbeId); selectedPartId = null; customNotes = []; customError = '';
    render();
    message(vehicleMode === 'experimental'
      ? 'Vehículo experimental activo: combina piezas reales de la flota, pero no es una reconstrucción histórica. Sus resultados son hipotéticos.'
      : `${design.name} (configuración histórica) es de nuevo la sonda activa.`);
  }
  for (const button of lab.querySelectorAll('[data-vehicle-mode]')) button.addEventListener('click', () => setVehicleMode(button.dataset.vehicleMode));

  // ---------- Vista general: flota y ficha técnica ----------
  function renderFleet() {
    for (const button of lab.querySelectorAll('[data-vehicle-mode]')) button.setAttribute('aria-pressed', String(button.dataset.vehicleMode === vehicleMode));
    $('#lab-historic').hidden = vehicleMode !== 'historic';
    $('#lab-custom').hidden = vehicleMode !== 'experimental';
    const list = $('#lab-history-list'); list.replaceChildren();
    for (const probe of HISTORICAL_PROBES) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'lab-probe-card';
      const active = vehicleMode === 'historic' && activeProbeId === probe.id;
      card.dataset.probeId = probe.id; card.setAttribute('aria-pressed', String(active));
      card.append(el('strong', null, probe.name), el('small', null, `${probe.launch} · ${probe.role}`));
      if (active) card.append(el('span', 'lab-probe-active', 'Sonda activa'));
      card.addEventListener('click', () => selectProbe(probe.id));
      list.append(card);
    }
    const probe = HISTORICAL_PROBES.find(item => item.id === activeProbeId) ?? HISTORICAL_PROBES[0];
    const sheet = $('#lab-history-sheet'); sheet.replaceChildren();
    const title = el('h4', null, probe.name);
    const role = el('p', 'lab-sheet-role', `${probe.role}. Lanzamiento: ${probe.launch}.`);
    const table = el('dl', 'lab-facts');
    for (const fact of probe.facts) {
      const row = document.createElement('div');
      const provenance = el('dd', 'lab-fact-source'); provenance.append(qualityBadge(fact.quality));
      const link = fact.source ? sourceLink(fact.source) : null;
      if (link) provenance.append(' ', link);
      row.append(el('dt', null, fact.label), el('dd', null, fact.value), provenance); table.append(row);
    }
    const actions = el('div', 'lab-two-actions');
    const plan = el('button', 'button-primary', `Planificar una misión con ${probe.name}`); plan.type = 'button'; plan.id = 'lab-plan-mission';
    plan.addEventListener('click', () => go('plan', 'integrated'));
    const systems = el('button', null, 'Ver la ingeniería'); systems.type = 'button'; systems.id = 'lab-open-engineering';
    systems.addEventListener('click', () => go('probe', 'engineering'));
    actions.append(plan, systems);
    const model = NASA_PROBE_MODELS[probe.id];
    const more = el('details', 'lab-sheet-more'); more.append(el('summary', null, 'Notas del modelo y del simulador'));
    if (model) {
      const credit = el('p', 'lab-model-credit');
      credit.append('Modelo 3D: ', externalLink(model.source, model.credit), `, archivo original sin modificar (${number(model.bytes / 1e6, 1)} MB${model.commit ? `, commit ${model.commit.slice(0, 7)}` : ''}). `);
      credit.append(externalLink(NASA_MODEL_USAGE.guidelines, 'Pautas de uso de NASA'), '. Su uso no implica respaldo de NASA.');
      more.append(credit);
    }
    more.append(el('p', 'lab-helper', `Arquitectura: ${getComponent(probe.coreId)?.name} con ${probe.parts.length} subsistemas. Las masas por subsistema y los consumos sin fuente son estimaciones del simulador; la masa del bus se obtiene por cierre con la masa seca documentada.`),
      el('p', 'lab-helper', probe.notes));
    sheet.append(title, role, actions, el('h5', null, 'Características principales'), table, more);
    if (vehicleMode === 'experimental') renderCustom();
  }

  // ---------- Ensamblaje experimental ----------
  function applyCustom(next, notes = []) {
    experimentalDesign = next; saveExperimental(next); customNotes = notes; customError = '';
    if (vehicleMode === 'experimental') design = experimentalDesign;
    render();
  }
  function renderCustom() {
    const box = $('#lab-custom'); box.replaceChildren();
    const banner = el('div', 'lab-experimental-banner');
    banner.append(el('strong', null, 'Vehículo experimental'), el('p', null, 'Combina piezas reales de Voyager, Cassini, Dawn y Juno sobre el bus de una de ellas. No es una reconstrucción histórica: la ingeniería lo verifica con las mismas reglas, pero sus resultados son hipotéticos. Las configuraciones históricas no cambian.'));
    const baseField = el('label', 'lab-field'); baseField.append('Bus de partida');
    const base = document.createElement('select'); base.id = 'lab-custom-base';
    for (const probe of HISTORICAL_PROBES) base.add(new Option(`${getComponent(probe.coreId)?.name ?? probe.name}`, probe.id));
    base.value = experimentalDesign.baseProbeId;
    base.addEventListener('change', () => applyCustom(createExperimentalDesign(base.value), [`Nuevo ensamblaje a partir de la configuración de ${getHistoricalProbe(base.value)?.name}.`]));
    baseField.append(base);
    const slots = el('div', 'lab-custom-slots');
    const core = getComponent(experimentalDesign.coreId);
    for (const slot of core?.slots ?? []) {
      const field = el('label', 'lab-field lab-custom-slot');
      field.append(slot.name);
      const select = document.createElement('select'); select.dataset.slot = slot.id;
      select.add(new Option('— Libre —', ''));
      for (const option of slotOptions(experimentalDesign, slot.id)) {
        const program = PROGRAM_LABELS[option.component.heritage] ?? option.component.heritage;
        select.add(new Option(`${option.component.name} · ${program}${option.adapter ? ` · adaptador +${number(option.adapterMassKg, 1)} kg` : ''}`, option.component.id));
      }
      select.value = experimentalDesign.parts.find(part => part.socketId === slot.id)?.componentId ?? '';
      select.addEventListener('change', () => {
        try { const result = changeSlot(experimentalDesign, slot.id, select.value); applyCustom(result.design, result.notes); }
        catch (error) { customError = error.message; customNotes = []; renderCustom(); }
      });
      field.append(select); slots.append(field);
    }
    const status = el('p', 'lab-message'); status.setAttribute('role', 'status');
    status.textContent = customError || customNotes.join(' '); status.dataset.error = String(Boolean(customError));
    const diff = differencesFromBase(experimentalDesign);
    const changes = el('div', 'lab-custom-diff');
    changes.append(el('h5', null, diff.length ? `Cambios respecto a la configuración histórica (${diff.length})` : 'Sin cambios: es la configuración histórica de ese bus'));
    if (diff.length) {
      const ul = document.createElement('ul');
      for (const item of diff) ul.append(el('li', null, `${item.slot.name}: ${item.before?.name ?? 'libre'} → ${item.now?.name ?? 'libre'}${item.adapter ? ' (con adaptador)' : ''}`));
      changes.append(ul);
    }
    const actions = el('div', 'lab-two-actions');
    const verify = el('button', 'button-primary', 'Ver la verificación de ingeniería'); verify.type = 'button';
    verify.addEventListener('click', () => go('probe', 'engineering'));
    const reset = el('button', null, 'Restablecer este bus'); reset.type = 'button';
    reset.addEventListener('click', () => applyCustom(createExperimentalDesign(experimentalDesign.baseProbeId), ['Ensamblaje restablecido a la configuración histórica del bus.']));
    actions.append(verify, reset);
    box.append(banner, baseField, el('h5', null, 'Puntos de montaje'), slots, status, changes, actions);
  }

  // ---------- Documentación ----------
  function renderDocs() {
    const box = $('#lab-docs'); box.replaceChildren();
    const probeId = vehicleMode === 'experimental' ? experimentalDesign.baseProbeId : activeProbeId;
    const probe = getHistoricalProbe(probeId);
    if (vehicleMode === 'experimental') box.append(el('p', 'lab-helper lab-docs-warning', `El ensamblaje experimental no tiene documentación propia: se muestra la de ${probe.name}, cuyo bus usa. Las piezas cambiadas no aparecen en estos documentos.`));
    box.append(el('p', 'lab-helper', 'Imágenes oficiales de NASA/JPL (copias reducidas a tamaño web, sin retoques). Los diagramas son ilustraciones rotuladas, no planos de fabricación. Pulsa una imagen para ampliarla.'));
    const grid = el('div', 'lab-docs-grid');
    for (const item of documentsFor(probeId)) {
      const card = el('button', 'lab-doc-card'); card.type = 'button'; card.dataset.kind = item.kind;
      const img = document.createElement('img'); img.loading = 'lazy'; img.alt = item.title; img.src = `${import.meta.env.BASE_URL}${item.thumb}`;
      img.addEventListener('error', () => { card.classList.add('is-broken'); img.replaceWith(el('span', 'lab-doc-missing', 'No se pudo cargar la imagen')); }, { once: true });
      card.append(img, el('span', 'lab-doc-kind', DOCUMENT_KINDS[item.kind]), el('strong', null, item.title), el('small', null, `${item.credit} · ${item.date}`));
      card.addEventListener('click', () => openLightbox(item));
      grid.append(card);
    }
    const recon = el('button', 'lab-doc-card lab-doc-recon'); recon.type = 'button'; recon.dataset.kind = 'reconstruction';
    recon.append(el('span', 'lab-doc-kind', DOCUMENT_KINDS.reconstruction), el('strong', null, 'Esquema técnico 3D'), el('small', null, 'Geometría procedimental del simulador: muestra dónde va cada subsistema. No es un documento de NASA.'));
    recon.addEventListener('click', () => { archView = 'schematic'; go('probe', 'architecture'); render(); });
    grid.append(recon);
    box.append(grid, el('h5', null, `Fuentes técnicas de la ficha de ${probe.name}`));
    const sources = el('ul', 'lab-sources');
    for (const source of probeSources(probeId)) { const li = document.createElement('li'); li.append(externalLink(source.url, source.title), ` · ${source.publisher}`); sources.append(li); }
    box.append(sources);
  }
  function openLightbox(item) {
    const dialog = $('#lab-lightbox');
    $('#lab-lightbox-title').textContent = item.title;
    const img = $('#lab-lightbox-img'); img.alt = item.title; img.src = `${import.meta.env.BASE_URL}${item.file}`;
    const caption = $('#lab-lightbox-caption'); caption.replaceChildren();
    caption.append(el('span', 'lab-doc-kind', DOCUMENT_KINDS[item.kind]), el('p', null, item.caption), el('p', 'lab-helper', `Crédito: ${item.credit} · ${item.date}`));
    const source = el('p', 'lab-helper'); source.append('Procedencia: ', externalLink(item.sourceUrl, item.sourceUrl.replace(/^https?:\/\//, '')));
    caption.append(source);
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  for (const dialog of lab.querySelectorAll('dialog')) {
    dialog.addEventListener('click', event => { if (event.target === dialog || event.target.closest('[data-close-dialog]')) dialog.close?.(); });
  }
  {
    const list = $('.lab-glossary-list');
    for (const entry of GLOSSARY) list.append(el('dt', null, entry.term), el('dd', null, entry.text));
  }

  // ---------- Arquitectura y componentes ----------
  function renderModelState() {
    const entry = modelState.entry ?? NASA_PROBE_MODELS[activeProbeId];
    const experimental = vehicleMode === 'experimental';
    $('#lab-stage-count').textContent = `${design.name}${experimental ? ' · reconstrucción técnica' : modelState.source === 'esquema' ? ' · esquema técnico' : entry ? ` · ${modelState.source === 'nasa' ? 'NASA 3D Resources' : 'modelo de NASA'}` : ''}`;
    const status = $('#lab-assembly-status');
    status.textContent = experimental ? 'Ensamblaje experimental: reconstrucción técnica del simulador (no hay modelo oficial de esta combinación)' : MODEL_STATE_TEXT[modelState.source] ?? '—';
    status.dataset.state = modelState.source;
    status.title = modelState.error ? `Error de carga: ${modelState.error}` : '';
    for (const button of lab.querySelectorAll('[data-arch-view]')) { button.setAttribute('aria-pressed', String(button.dataset.archView === archView)); button.disabled = experimental; }
    // 16/17: el modelo de NASA es una malla única; para localizar una pieza se usa el esquema técnico (reconstrucción).
    $('#lab-assembly-note').textContent = experimental
      ? 'Elige un subsistema para ver sus cifras: en la reconstrucción técnica se resalta su posición.'
      : archView === 'schematic' ? 'Esquema técnico del simulador: al elegir un subsistema se resalta su posición. No es un plano de NASA.'
      : 'Elige un subsistema para ver sus cifras y su fuente. El modelo de NASA es una sola pieza: para localizarlo, cambia a «Esquema técnico».';
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
    const list = el('ul', 'lab-field-quality');
    for (const [key, entry] of entries) {
      const item = document.createElement('li');
      item.append(`${FIELD_LABELS[key] ?? key}: `, qualityBadge(entry.quality));
      const link = entry.source ? sourceLink(entry.source) : null;
      if (link) item.append(' ', link);
      if (entry.note) item.append(el('small', null, ` ${entry.note}`));
      list.append(item);
    }
    container.append(list);
  }
  // Subsistemas agrupados por función (solo lectura en la configuración histórica).
  function renderAssembly() {
    const list = $('#lab-assembly-list'); list.replaceChildren();
    const core = getComponent(design.coreId);
    const entries = core ? [{ id: 'core', componentId: core.id, socketId: 'estructura' }, ...design.parts] : [];
    for (const group of ARCHITECTURE_GROUPS) {
      const members = entries.filter(entry => architectureGroupOf(getComponent(entry.componentId)?.category) === group.id);
      if (!members.length) continue;
      const box = el('div', 'lab-arch-group'); box.dataset.group = group.id;
      box.append(el('h5', null, `${group.label} (${members.length})`));
      for (const entry of members) {
        const component = getComponent(entry.componentId);
        const button = el('button', 'lab-assembly-item'); button.type = 'button';
        button.setAttribute('aria-pressed', String(selectedPartId === entry.id));
        button.append(el('span', null, component.name), el('small', null, entry.socketId === 'estructura' ? 'Estructura' : `${number(component.dryMassKg)} kg${entry.adapter ? ' · adaptador' : ''}`));
        if (component.heritage) button.dataset.heritage = component.heritage;
        button.addEventListener('click', () => { selectedPartId = selectedPartId === entry.id ? null : entry.id; render(); });
        box.append(button);
      }
      list.append(box);
    }
    view.setDesign(design, selectedPartId, { centerOfMassM: engineering?.centerOfMassM ?? null, showFreeSlots: vehicleMode === 'experimental',
      procedural: vehicleMode === 'experimental' || archView === 'schematic' });
    const selected = selectedPartId === 'core' ? core : getComponent(design.parts.find(p => p.id === selectedPartId)?.componentId);
    const detail = $('#lab-selected-info'); detail.replaceChildren();
    if (selected) {
      detail.append(el('h4', null, selected.name));
      if (selected.description) detail.append(el('p', null, selected.description));
      detail.append(el('p', 'lab-specs', componentSpecs(selected)));
      if (selected.heritage && PROGRAM_LABELS[selected.heritage]) detail.append(el('p', 'lab-helper', `Programa de origen: ${PROGRAM_LABELS[selected.heritage]}.`));
      appendDataQuality(detail, selected);
      if (archView !== 'schematic' && vehicleMode !== 'experimental') {
        const locate = el('button', null, 'Localizar en el esquema técnico'); locate.type = 'button';
        locate.addEventListener('click', () => { archView = 'schematic'; render(); });
        detail.append(locate);
      }
    } else detail.append(el('p', 'lab-helper', 'Ningún subsistema elegido.'));
    renderModelState();
  }
  for (const button of lab.querySelectorAll('[data-arch-view]')) button.addEventListener('click', () => { archView = button.dataset.archView; render(); });

  // ---------- Ingeniería ----------
  function metricRows(container, rows) {
    for (const [label, value, title] of rows) {
      const row = el('div', 'lab-metric');
      if (title) row.title = title;
      row.append(el('span', null, label), el('strong', null, value)); container.append(row);
    }
  }
  const kN = value => value == null ? 'No disponible' : value < 1 ? `${number(value * 1000, 1)} mN` : `${number(value, value < 10 ? 2 : 0)} N`;
  function renderEngineeringSummary(result, status) {
    const box = $('#lab-eng-summary'); box.replaceChildren();
    const has = Boolean(design.coreId);
    const atOneAu = result.power?.profile?.reduce((best, p) => !best || Math.abs(p.distanceAu - 1) < Math.abs(best.distanceAu - 1) ? p : best, null);
    const generation = !result.power ? 'No disponible' : result.power.rtgAtLaunchW > 0 && !(atOneAu?.totalW > result.power.rtgAtLaunchW * 1.05)
      ? `${number(result.power.rtgAtLaunchW, 0)} W (RTG, al lanzamiento)` : atOneAu ? `${number(atOneAu.totalW, 0)} W a ${number(atOneAu.distanceAu, 1)} AU` : 'No disponible';
    const limit = !result.power ? 'No disponible' : Number.isFinite(result.power.serviceBreakEvenAu) ? `Energía suficiente hasta ${number(result.power.serviceBreakEvenAu, 2)} AU del Sol` : 'Sin límite por distancia al Sol (RTG)';
    const cards = [
      ['Masa total', has ? valueOrNA(result.wetMassKg, 'kg', 0) : 'No disponible', 'Al lanzamiento, con propelente'],
      ['Propelente', `${number(result.fuelKg, 0)} kg`, result.mainPropellant ? propellantLabel(result.mainPropellant) : 'Sin motor principal'],
      ['Δv disponible', result.deltaVMS == null ? 'No disponible' : `${number(result.deltaVMS / 1000, 2)} km/s`, 'Ideal (Tsiolkovski), sin pérdidas'],
      ['Propulsión', result.propulsionType === 'electric' ? 'Eléctrica (iónica)' : result.propulsionType === 'chemical' ? 'Química' : 'Sin motor', result.thrustN ? `Empuje ${kN(result.thrustN)} · Isp ${number(result.effectiveIspS ?? 0, 0)} s` : ''],
      ['Generación eléctrica', generation, limit],
      ['Autonomía por batería', result.autonomyHours == null ? 'No disponible' : `${number(result.autonomyHours, 1)} h`, result.batteryWh ? `${number(result.batteryWh, 0)} Wh con el consumo de servicio` : 'Sin batería modelada'],
      ['Compatibilidad', status, `${result.assessment?.errors ?? 0} errores · ${result.assessment?.warnings ?? 0} advertencias`]
    ];
    for (const [label, value, note] of cards) {
      const card = el('div', 'lab-eng-card');
      if (label === 'Compatibilidad') card.dataset.tone = status === ENGINEERING_STATUS.modify ? 'bad' : status === ENGINEERING_STATUS.warnings ? 'warn' : 'ok';
      card.append(el('span', null, label), el('strong', null, value));
      if (note) card.append(el('small', null, note));
      box.append(card);
    }
  }
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
      const table = el('table', 'lab-power-table');
      table.innerHTML = '<caption>Generación al lanzamiento frente al consumo de servicio</caption><thead><tr><th scope="col">Lugar</th><th scope="col">AU</th><th scope="col">Generación</th><th scope="col">Margen</th></tr></thead><tbody></tbody>';
      for (const point of result.power.profile) {
        const row = document.createElement('tr'); row.dataset.tone = point.marginW >= 0 ? 'ok' : 'bad';
        for (const value of [point.label, number(point.distanceAu, 2), `${number(point.totalW, 0)} W`, `${point.marginW >= 0 ? '+' : ''}${number(point.marginW, 0)} W`]) row.append(el('td', null, value));
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
    assessment.dataset.valid = String(has && status !== ENGINEERING_STATUS.modify && status !== ENGINEERING_STATUS.incomplete);
    assessment.dataset.tone = !has ? 'idle' : status === ENGINEERING_STATUS.modify ? 'bad' : status === ENGINEERING_STATUS.warnings ? 'warn' : 'ok';
    assessment.append(el('strong', null, status));
    for (const text of [result.assessment?.explanation, result.assessment?.nature].filter(Boolean)) assessment.append(el('p', null, text));
    if (result.assessment?.programs?.length) assessment.append(el('p', 'lab-programs', `Programa: ${result.assessment.programs.map(id => PROGRAM_LABELS[id] ?? id).join(' · ')}`));
    renderEngineeringSummary(result, status);
    const compatibility = $('#lab-compatibility'); compatibility.replaceChildren();
    const issues = result.compatibility ?? [];
    if (issues.length) {
      compatibility.append(el('h4', null, `Comprobaciones (${result.assessment.errors} error${result.assessment.errors === 1 ? '' : 'es'} · ${result.assessment.warnings} advertencia${result.assessment.warnings === 1 ? '' : 's'})`));
      const types = [...COMPATIBILITY_TYPES, ...new Set(issues.map(item => item.type).filter(type => !COMPATIBILITY_TYPES.includes(type)))];
      const list = document.createElement('ul');
      for (const type of types) for (const item of issues.filter(issue => issue.type === type)) {
        const line = document.createElement('li'); line.dataset.severity = item.severity;
        line.append(el('b', null, type), ` ${item.message}`); list.append(line);
      }
      compatibility.append(list);
    } else compatibility.append(el('p', 'lab-helper', 'Sin errores ni advertencias de compatibilidad.'));
    for (const note of result.notes) compatibility.append(el('p', 'lab-helper', note));

    // Calidad de los datos y referencias de la sonda.
    const quality = $('#lab-data-quality'); quality.replaceChildren();
    const dq = result.dataQuality;
    if (has && dq) {
      const counts = el('p', 'lab-quality-counts');
      for (const [q, n] of Object.entries(dq.counts)) if (n) counts.append(qualityBadge(q), ` ${n}  `);
      quality.append(counts);
      if (dq.dependsOnEstimates) quality.append(el('p', 'lab-helper', 'Los resultados dependen de cifras estimadas o desconocidas: úsalos como orden de magnitud, no como datos históricos.'));
      if (dq.sources.length) {
        const list = el('ul', 'lab-sources');
        for (const source of dq.sources) { const link = sourceLink(source.id); if (link) { const item = document.createElement('li'); link.textContent = source.title; item.append(link, ` · ${source.publisher}`); list.append(item); } }
        quality.append(list);
      }
    }
    $('#lab-eng-disclaimer').textContent = vehicleMode === 'experimental'
      ? 'Ensamblaje experimental: las cifras de cada pieza conservan su calidad y su fuente, pero la combinación no existió. El reparto de masas, los adaptadores y los consumos sin fuente son estimaciones del simulador. El Δv es ideal (Tsiolkovski). No modifica DOPRI54.'
      : 'Configuración histórica fija: las piezas no se pueden cambiar. Las cifras de la ficha llevan su calidad y su fuente; el reparto de masa por subsistema y los consumos sin fuente son estimaciones del simulador. El Δv es ideal (Tsiolkovski). El modelo 3D es solo presentación: no interviene en ningún cálculo. No modifica DOPRI54.';
  }
  function render() {
    try { engineering = calculateEngineering(design); } catch { engineering = null; }
    updateDesignContext();
    renderFleet(); renderDocs();
    renderAssembly(); renderEngineering();
    // 17: nunca se reproduce en silencio una misión calculada con otro vehículo.
    if (centerPlan?.ready && centerPlan.design && designSignature(centerPlan.design) !== designSignature(design)) {
      launchActive = false;
      invalidated = `Cambiaste de vehículo después de preparar la misión (calculada con ${centerPlan.design.name}). Para no reproducir estados de otro vehículo, recalcula en «2 · Planificar».`;
      center.setPlan({ ready: false, reason: invalidated });
    }
    planner.setDesign(design); launch.setDesign(design); interplanetary.setDesign(design); integrated.setDesign(design);
    updateStatus();
  }
  for (const button of lab.querySelectorAll('[data-lab-action="guide"]')) button.addEventListener('click', () => guide.start());
  $('[data-lab-action="glossary"]').addEventListener('click', () => { const dialog = $('#lab-glossary'); if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); });
  $('[data-lab-action="reset-camera"]').addEventListener('click', () => stage === 'plan' ? planner.resetCamera() : stage === 'play' ? center.resetCamera() : view.resetCamera());
  for (const button of lab.querySelectorAll('[data-lab-stage]')) button.addEventListener('click', () => go(button.dataset.labStage));
  // En pantallas estrechas el contenido de la pestaña queda debajo de la escena: se lleva a la vista al elegirla.
  const narrow = window.matchMedia('(max-width: 820px)');
  const TAB_FOCUS = { probe: '.lab-probe-panel', play: '#mc-drawer' };
  for (const button of lab.querySelectorAll('[data-lab-tab]')) button.addEventListener('click', () => {
    go(button.dataset.tabStage, button.dataset.labTab);
    const focus = TAB_FOCUS[button.dataset.tabStage];
    if (narrow.matches && focus && button.dataset.labTab !== 'playback') requestAnimationFrame(() => revealInScrollAreas(lab.querySelector(focus), { block: 'start' }));
  });
  // Panel de etapas plegable (preferencia de este navegador).
  function setRail(open) {
    lab.dataset.rail = open ? 'open' : 'closed';
    const toggle = $('#lab-rail-toggle');
    toggle.setAttribute('aria-expanded', String(open)); toggle.title = open ? 'Ocultar el panel de etapas' : 'Mostrar el panel de etapas';
  }
  setRail(readStored(RAIL_KEY, window.innerWidth >= 1200 ? 'open' : 'closed') === 'open');
  $('#lab-rail-toggle').addEventListener('click', () => { const open = lab.dataset.rail !== 'open'; setRail(open); store(RAIL_KEY, open ? 'open' : 'closed'); });
  const onKey = event => { if (event.key === 'Escape' && lab.dataset.immersive === 'true') center.setImmersive(false); };
  document.addEventListener('keydown', onKey);

  // 16: misión guiada. Solo usa los mismos controles y estados que el usuario.
  const guide = createLabGuidedMission({ host: lab, api: {
    activeProbeId: () => vehicleMode === 'experimental' ? 'experimental' : activeProbeId,
    selectProbe,
    section: sectionOf, plannerMode: () => lastPlannerMode,
    stage: () => stage, tab: () => tabByStage[stage],
    go(nextSection, nextMode) {
      if (nextSection === 'hangar') go('probe', 'overview');
      else if (nextSection === 'planner') go('plan', nextMode ?? lastPlannerMode);
      else if (nextSection === 'launch') go('plan', 'launch');
      else if (nextSection === 'center') go('play', 'playback');
    },
    integratedState: () => integrated.getState(),
    applyScenario(id) { $('#im-scenario').value = id; $('#im-scenario').dispatchEvent(new Event('change')); },
    computeIntegrated: () => integrated.compute(),
    executeIntegrated() { $('#im-execute').click(); },
    centerKind: () => centerPlan?.ready ? centerPlan.kind ?? 'mission' : null
  } });
  const glossary = createLabGlossary(lab);
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
    modeObserver.disconnect(); headerObserver.disconnect(); window.removeEventListener('resize', measureHeader); clearInterval(statusTimer); document.removeEventListener('keydown', onKey);
    glossary.dispose(); guide.dispose(); center.dispose(); integrated.dispose(); interplanetary.dispose(); launch.dispose(); planner.dispose(); view.dispose(); lab.remove(); app.style.removeProperty('--lab-top');
    delete app.dataset.labView; delete app.dataset.labScene;
  } };
}
