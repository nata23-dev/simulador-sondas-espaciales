import './experimental-laboratory.css';
import { ALL_COMPONENTS, COMPONENT_CATEGORIES, getComponent, slotAccepts, needsAdapter, adapterMassKg, fitsEnvelope, maxDimensionM, interfaceOf, ILLUSTRATIVE_PROGRAM, ADAPTER_MASS_RULE } from '../lab/ComponentCatalog.js';
import { PRESETS, HISTORICAL_PRESETS, historicalDesign, newDesign, planPartChange, applyPartChange, parseDesign, validateDesign, loadSavedDesigns, saveDesign } from '../lab/ProbeDesign.js';
import { calculateEngineering, ENGINEERING_STATUS } from '../lab/ProbeEngineering.js';
import { HISTORICAL_PROBES, HERITAGE_PROGRAMS, HERITAGE_SOURCES, DATA_QUALITY } from '../lab/HeritageCatalog.js';
import { createProbeAssemblyView } from '../lab/ProbeAssemblyView.js';
import { createMissionPlanner } from './MissionPlanner.js';
import { createMissionControlCenter } from './MissionControlCenter.js';
import { createLaunchPlanner } from './LaunchPlanner.js';
import { createLandingPlanner } from './LandingPlanner.js';
import { createInterplanetaryPlanner } from './InterplanetaryPlanner.js';
import { createIntegratedMissionPlanner } from './IntegratedMissionPlanner.js';

const number = (value, digits = 1) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(value);
const valueOrNA = (value, unit, digits = 1) => value == null ? 'No disponible' : `${number(value, digits)} ${unit}`;

// 14: textos de ubicación de cada herramienta del laboratorio. Solo presentación.
const SECTION_META = Object.freeze({
  hangar: { step: 'Diseñar', title: 'Hangar', desc: 'Parte de una sonda histórica (Voyager, Cassini, Dawn, Juno) o combina piezas de varios programas y revisa el ensamblaje en 3D.' },
  engineering: { step: 'Diseñar', title: 'Ingeniería', desc: 'Masas, centro de masas, propulsión química o eléctrica, energía según la distancia al Sol, compatibilidad y calidad de los datos.' },
  launch: { step: 'Planificar', title: 'Lanzamiento terrestre', desc: 'Ascenso desde la superficie con un lanzador ilustrativo de dos etapas y la sonda como carga útil.' },
  landing: { step: 'Planificar', title: 'Descenso y aterrizaje', desc: 'Descenso propulsado desde órbita en cuerpos sin atmósfera significativa (motor 12F).' },
  center: { step: 'Ejecutar', title: 'Centro de Misión', desc: 'Reproduce la misión preparada: fases, eventos, cámaras y telemetría del estado calculado.' }
});
const PLANNER_META = Object.freeze({
  lunar: { title: 'Tierra–Luna y empuje finito', desc: 'Transferencia translunar desde órbita terrestre con impulso ideal o empuje finito y masa variable.' },
  interplanetary: { title: 'Misiones interplanetarias', desc: 'Ventanas de lanzamiento Tierra → planeta con efemérides NASA/JPL y Lambert heliocéntrico.' },
  integrated: { title: 'Misión completa', desc: 'Cadena por fases: crucero, encuentro, captura, satélite y descenso (etapa 13, pendiente de auditoría).' }
});
// 15: rótulos de la calidad de cada cifra de herencia y de los campos del catálogo.
const QUALITY_LABELS = Object.freeze({ [DATA_QUALITY.documented]: 'Documentado', [DATA_QUALITY.secondary]: 'Fuente secundaria',
  [DATA_QUALITY.derived]: 'Derivado', [DATA_QUALITY.estimated]: 'Estimado', [DATA_QUALITY.unknown]: 'Desconocido' });
const FIELD_LABELS = Object.freeze({ dryMassKg: 'Masa seca', dimensionsM: 'Dimensiones', idlePowerW: 'Consumo', activePowerW: 'Consumo en encendido',
  generationW: 'Generación', thrustN: 'Empuje', ispS: 'Impulso específico', fuelCapacityKg: 'Capacidad de propelente', rcsCount: 'Número de propulsores de actitud',
  rcsThrustN: 'Empuje de actitud', rcsPropellantKg: 'Hidracina de actitud', maxAttachedMassKg: 'Carga máxima montada', solarExponent: 'Exponente solar',
  rtgDecayPerYear: 'Disminución del RTG', batteryWh: 'Batería', dataCapacityMbit: 'Memoria',
  'electric.maxInputPowerW': 'Potencia máxima de entrada', 'electric.minInputPowerW': 'Potencia mínima de encendido', 'electric.efficiency': 'Eficiencia eléctrica' });
const PROGRAM_LABELS = Object.freeze(Object.fromEntries([[ILLUSTRATIVE_PROGRAM, 'Ilustrativa'], ...HERITAGE_PROGRAMS]));
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
function qualityBadge(quality) {
  const badge = document.createElement('span'); badge.className = 'lab-quality'; badge.dataset.quality = quality;
  badge.textContent = QUALITY_LABELS[quality] ?? quality;
  return badge;
}
const MISSION_KIND_LABELS = Object.freeze({ integrated: 'Misión completa', interplanetary: 'Transferencia interplanetaria', landing: 'Descenso y aterrizaje',
  launch: 'Lanzamiento terrestre', 'finite-thrust': 'Maniobra de empuje finito' });

export function createExperimentalLaboratory() {
  const app = document.querySelector('#app');
  const scene = document.querySelector('.scene-panel');
  const lab = document.createElement('section');
  lab.id = 'experimental-lab';
  lab.setAttribute('aria-label', 'Laboratorio experimental de construcción de sondas');
  lab.hidden = true;
  lab.innerHTML = `
    <header class="lab-header">
      <div class="lab-title">
        <nav class="lab-breadcrumb" aria-label="Ubicación en el laboratorio"><span>Laboratorio experimental</span><span id="lab-crumb-step">Diseñar</span><span id="lab-crumb-tool" aria-current="location">Hangar</span></nav>
        <h2 id="lab-tool-title">Hangar</h2><p id="lab-tool-desc">Construye la sonda con piezas ilustrativas del catálogo.</p>
      </div>
      <dl class="lab-context" aria-live="polite">
        <div><dt>Sonda activa</dt><dd id="lab-ctx-design">—</dd></div>
        <div><dt>Centro de Misión</dt><dd id="lab-ctx-mission" data-ready="false">Sin misión preparada</dd></div>
      </dl>
      <div class="lab-head-actions"><button type="button" id="lab-ctx-open-center" class="lab-open-center">Abrir Centro de Misión</button><button type="button" data-lab-action="orbital">Ver simulación orbital</button><button type="button" data-lab-action="reset-camera">Restablecer cámara</button></div>
    </header>
    <nav class="lab-sections" aria-label="Áreas del laboratorio">
      <div class="lab-nav-group" role="group" aria-labelledby="lab-step-design"><span class="lab-nav-step" id="lab-step-design"><b>1</b>Diseñar</span><button type="button" data-lab-section="hangar" aria-current="page">Hangar</button><button type="button" data-lab-section="engineering">Ingeniería</button></div>
      <div class="lab-nav-group" role="group" aria-labelledby="lab-step-plan"><span class="lab-nav-step" id="lab-step-plan"><b>2</b>Planificar</span><button type="button" data-lab-section="launch">Lanzamiento</button><button type="button" data-lab-section="planner">Planificador</button><button type="button" data-lab-section="landing">Descenso y aterrizaje</button></div>
      <div class="lab-nav-group" role="group" aria-labelledby="lab-step-run"><span class="lab-nav-step" id="lab-step-run"><b>3</b>Ejecutar</span><button type="button" data-lab-section="center">Centro de misión</button></div>
    </nav>
    <div class="lab-workspace">
      <aside class="lab-panel lab-catalog" aria-label="Biblioteca de sondas y catálogo de componentes">
        <div class="lab-panel-heading"><span class="eyebrow">01 / BIBLIOTECA</span><h3 id="lab-library-title">Componentes</h3>
          <div class="lab-hangar-modes" role="group" aria-label="Modo del Hangar"><button type="button" data-hangar-mode="historical" aria-pressed="false">Sondas históricas</button><button type="button" data-hangar-mode="custom" aria-pressed="true">Personalizado</button></div>
        </div>
        <div class="lab-panel-scroll">
          <div id="lab-history" class="lab-history" hidden>
            <div id="lab-history-list" class="lab-history-list" role="list"></div>
            <article id="lab-history-sheet" class="lab-history-sheet" aria-live="polite"></article>
          </div>
          <div id="lab-custom">
            <label class="lab-field" for="lab-heritage-filter">Origen de las piezas<select id="lab-heritage-filter"></select></label>
            <div id="lab-catalog-list"></div><div class="lab-part-info" id="lab-catalog-info"></div>
            <label class="lab-field" for="lab-socket">Punto de conexión<select id="lab-socket"></select></label>
            <button type="button" class="button-primary lab-add" id="lab-add">Agregar al diseño</button>
            <div class="lab-replacement" id="lab-replacement" role="group" aria-label="Resolver incompatibilidad de montaje o propelente" hidden></div>
            <p class="lab-helper">Selecciona una pieza y un punto compatible. Una conexión ocupada se reemplaza; si el herraje es distinto se ofrece un adaptador con su masa estimada.</p>
          </div>
        </div>
      </aside>
      <div class="lab-stage">
        <div class="lab-stage-top"><span class="eyebrow">02 / ENSAMBLAJE 3D</span><span id="lab-stage-count">Sin estructura</span></div>
        <div id="lab-canvas" aria-label="Modelo 3D interactivo de la sonda"></div>
        <button type="button" id="lab-touch-toggle" class="lab-touch-toggle" aria-pressed="false" hidden>Activar control 3D</button>
        <div id="lab-empty" class="lab-empty">Elige una estructura en el catálogo o carga un diseño para comenzar.</div>
        <div class="lab-stage-foot"><span id="lab-gesture-hint">Arrastra para girar · rueda para acercar · toca una pieza para inspeccionarla</span><strong id="lab-assembly-status">Sin estructura</strong></div>
      </div>
      <aside class="lab-panel lab-engineering" aria-label="Ingeniería y diseños">
        <div class="lab-panel-heading"><span class="eyebrow">03 / INGENIERÍA</span><h3>Diseño y sistemas</h3></div>
        <div class="lab-panel-scroll">
          <label class="lab-field" for="lab-design-name">Nombre del diseño<input id="lab-design-name" maxlength="80" autocomplete="off"></label>
          <div class="lab-two-actions"><button type="button" id="lab-new">Nuevo vacío</button><button type="button" id="lab-save" class="button-primary">Guardar localmente</button></div>
          <label class="lab-field" for="lab-preset">Configuraciones iniciales<select id="lab-preset"></select></label>
          <button type="button" id="lab-load-preset">Cargar configuración editable</button>
          <label class="lab-field" for="lab-saved">Mis diseños guardados<select id="lab-saved"></select></label>
          <div class="lab-two-actions"><button type="button" id="lab-load-saved">Recuperar</button><button type="button" id="lab-export">Exportar JSON</button></div>
          <button type="button" id="lab-import">Importar JSON</button><input id="lab-import-file" type="file" accept=".json,application/json" hidden>
          <p class="lab-message" id="lab-message" role="status"></p>
          <div class="lab-divider"></div><h4>Ensamblaje</h4><div id="lab-assembly-list" class="lab-assembly-list"></div>
          <div id="lab-selected-info" class="lab-selected-info"></div>
          <div class="lab-divider"></div><h4>Balance de ingeniería</h4>
          <div class="lab-assessment" id="lab-assessment"></div>
          <div id="lab-metrics" class="lab-metrics"></div>
          <div id="lab-power" class="lab-power"></div>
          <div id="lab-compatibility" class="lab-compatibility"></div>
          <div id="lab-data-quality" class="lab-data-quality"></div>
          <p class="lab-disclaimer">Modelo conceptual de diseño. El delta-v es ideal (Tsiolkovski); la potencia usa leyes ajustadas a puntos documentados; los adaptadores y el reparto de masas por pieza son estimaciones del simulador. No modifica DOPRI54.</p>
        </div>
      </aside>
    </div><div id="lab-launch" hidden></div><div id="lab-landing" hidden></div><div id="lab-planner-modes" class="lab-planner-modes" role="group" aria-label="Modalidad del Planificador" hidden><button type="button" data-planner-mode="lunar" aria-pressed="true">Tierra–Luna y empuje finito</button><button type="button" data-planner-mode="interplanetary" aria-pressed="false">Misiones interplanetarias</button><button type="button" data-planner-mode="integrated" aria-pressed="false">Misión completa</button></div><div id="lab-mission-planner" hidden></div><div id="lab-interplanetary" hidden></div><div id="lab-integrated" hidden></div><div id="lab-mission-center" hidden></div>`;
  scene.append(lab);
  const returnButton = document.createElement('button');
  returnButton.id = 'lab-return'; returnButton.type = 'button'; returnButton.textContent = 'Volver al laboratorio';
  returnButton.hidden = true; scene.append(returnButton);
  let design = PRESETS[1].create();
  let selectedComponentId = 'bus-interplanetary';
  let selectedPartId = null;
  let pendingChange = null;
  let section = 'hangar';
  let saved = loadSavedDesigns();
  // 15: modo de la biblioteca (sondas históricas o catálogo personalizado), filtro por programa y sonda de la ficha.
  let hangarMode = 'custom', heritageFilter = 'all', selectedProbeId = 'cassini';
  let engineering = null;
  const $ = selector => lab.querySelector(selector);
  let view;
  try { view = createProbeAssemblyView($('#lab-canvas'), id => { selectedPartId = id; render(); }); }
  catch (error) {
    view = { setDesign() {}, setVisible() {}, setTouchInteraction() {}, getLandingClearance: () => null, resetCamera() {}, dispose() {} };
    $('#lab-canvas').textContent = 'No se pudo iniciar WebGL para el ensamblaje 3D.';
    console.error('Laboratorio 3D no disponible:', error);
  }
  let center, launchActive = false;
  const planner = createMissionPlanner($('#lab-mission-planner'), next => {
    design = next; selectedPartId = null; render(); message('Sonda del plan restaurada en el Hangar.');
  }, {
    // Mientras un lanzamiento está en reproducción, los cambios del Planificador no deben reemplazarlo.
    onPlanChange: candidate => { if (!launchActive) center?.setPlan(candidate); },
    onExecuteRequest: candidate => { launchActive = false; launch.deactivate(); landing.deactivate(); interplanetary.deactivate(); integrated?.deactivate(); center.setPlan(candidate); section = 'center'; updateSection(); center.start(); }
  });
  const launch = createLaunchPlanner({
    host: $('#lab-launch'),
    onExecuteRequest: candidate => { landing.deactivate(); interplanetary.deactivate(); integrated.deactivate(); launchActive = true; center.setPlan(candidate); section = 'center'; updateSection(); center.start(); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'El lanzamiento quedó obsoleto. Recalcula en Lanzamiento.' }); } }
  });
  const landing = createLandingPlanner({
    host: $('#lab-landing'),
    onExecuteRequest: candidate => { launch.deactivate(); interplanetary.deactivate(); integrated.deactivate(); launchActive = true; center.setPlan(candidate); section = 'center'; updateSection(); center.start(); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'El descenso quedó obsoleto. Recalcula en Descenso y aterrizaje.' }); } }
  });
  // 12G: modalidad «Misiones interplanetarias» del Planificador. Comparte con lanzamiento y descenso la marca que impide
  // que el plan lunar reemplace una ejecución activa en el Centro de Misión.
  const interplanetary = createInterplanetaryPlanner({
    host: $('#lab-interplanetary'),
    onExecuteRequest: candidate => { launch.deactivate(); landing.deactivate(); integrated.deactivate(); launchActive = true; center.setPlan(candidate); section = 'center'; updateSection(); center.start(); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'La transferencia interplanetaria quedó obsoleta. Vuelve a buscar en el Planificador.' }); } }
  });
  // 13: modalidad «Misión completa» (cadena integrada de fases) con la misma marca de ejecución activa.
  const integrated = createIntegratedMissionPlanner({
    host: $('#lab-integrated'),
    onExecuteRequest: candidate => { launch.deactivate(); landing.deactivate(); interplanetary.deactivate(); launchActive = true; center.setPlan(candidate); section = 'center'; updateSection(); center.start(); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'La misión completa quedó obsoleta. Recalcula en el Planificador.' }); } }
  });
  let plannerMode = 'lunar';
  for (const button of lab.querySelectorAll('[data-planner-mode]')) button.addEventListener('click', () => {
    plannerMode = button.dataset.plannerMode; updateSection();
  });
  center = createMissionControlCenter($('#lab-mission-center'), () => { section = 'planner'; updateSection(); });
  const centerSetPlan = center.setPlan;
  center.setPlan = candidate => { centerSetPlan(candidate); updateMissionContext(candidate); };
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
      const e = calculateEngineering(design);
      node.textContent = `${design.name || 'Diseño sin nombre'} · ${number(e.wetMassKg, 0)} kg${e.deltaVMS != null ? ` · Δv ideal ${number(e.deltaVMS / 1000, 2)} km/s` : ''}`;
    } catch { node.textContent = design?.name || 'Diseño sin nombre'; }
    node.title = node.textContent;
  }
  $('#lab-ctx-open-center').addEventListener('click', () => { section = 'center'; updateSection(); });
  // 14: navegación directa desde el mapa de áreas de la cabecera (AppNavigator).
  document.addEventListener('lab:navigate', event => {
    const target = event.detail ?? {};
    if (target.section) section = target.section;
    if (target.plannerMode) plannerMode = target.plannerMode;
    if (app.dataset.appMode === 'experimental' && lab.hidden) setBuilder(true); else updateSection();
    if (target.focus) requestAnimationFrame(() => lab.querySelector(target.focus)?.scrollIntoView({ block: 'start' }));
  });

  function message(text, error = false) {
    $('#lab-message').textContent = text;
    $('#lab-message').dataset.error = String(error);
  }
  function clearPendingChange() {
    pendingChange = null;
    $('#lab-replacement').hidden = true;
    $('#lab-replacement').replaceChildren();
  }
  // 15: el herraje de la pieza no coincide con el del punto. Nada cambia hasta que se acepta el adaptador (masa estimada).
  function showAdapterConfirm(plan) {
    const box = $('#lab-replacement');
    box.replaceChildren(); box.hidden = false; box.dataset.kind = 'adapter';
    pendingChange = { design, componentId: plan.component.id, socketId: plan.socketId, adapter: false };
    const title = document.createElement('strong');
    title.textContent = `${plan.component.name} necesita un adaptador estructural.`;
    const detail = document.createElement('p');
    detail.textContent = `Herraje de la pieza «${plan.adapter.from}» frente a «${plan.adapter.to}» del punto. Se añadirían ${number(plan.adapter.massKg)} kg estimados (${ADAPTER_MASS_RULE}). El diseño actual se conserva hasta que elijas.`;
    box.append(title, detail);
    const accept = document.createElement('button'); accept.type = 'button'; accept.textContent = `Instalar con adaptador (+${number(plan.adapter.massKg)} kg)`;
    accept.addEventListener('click', () => {
      if (!pendingChange || design !== pendingChange.design) { clearPendingChange(); message('El diseño cambió. Selecciona de nuevo la pieza.', true); return; }
      if (plan.conflicts.length) { showReplacementOptions(plan, { adapter: true }); return; }
      try {
        design = applyPartChange(design, plan.component.id, plan.socketId, 'none', { adapter: true });
        selectedPartId = design.parts.find(p => p.socketId === plan.socketId)?.id ?? null;
        render(); message(`${plan.component.name} instalado con adaptador estructural estimado.`);
      } catch (error) { message(error.message, true); }
    });
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar · conservar diseño';
    cancel.addEventListener('click', () => { clearPendingChange(); message('Instalación cancelada. Diseño sin cambios.'); });
    box.append(accept, cancel);
    accept.focus({ preventScroll: true });
  }
  function showReplacementOptions(plan, { adapter = false } = {}) {
    const box = $('#lab-replacement');
    box.replaceChildren(); box.hidden = false; box.dataset.kind = 'propellant';
    pendingChange = { design, componentId: plan.component.id, socketId: plan.socketId, adapter };
    const names = plan.conflicts.map(item => `${item.name} (${propellantLabel(item.propellant)})`).join(', ');
    const title = document.createElement('strong');
    title.textContent = `${plan.component.name} requiere propelente ${propellantLabel(plan.component.propellant)}.`;
    const detail = document.createElement('p');
    detail.textContent = `En conflicto: ${names}. El diseño actual se conserva hasta que elijas una opción.${adapter ? ' La pieza se instalará con adaptador.' : ''}`;
    box.append(title, detail);
    function choice(label, resolution) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => {
        if (resolution === 'cancel') {
          clearPendingChange(); message('Sustitución cancelada. Diseño sin cambios.'); return;
        }
        if (!pendingChange || design !== pendingChange.design) {
          clearPendingChange(); message('El diseño cambió. Selecciona de nuevo la sustitución.', true); return;
        }
        try {
          const next = applyPartChange(design, pendingChange.componentId, pendingChange.socketId, resolution, { adapter: pendingChange.adapter });
          const socketId = pendingChange.socketId;
          design = next;
          selectedPartId = next.parts.find(p => p.socketId === socketId)?.id ?? next.parts.at(-1)?.id ?? 'core';
          render();
          message(resolution === 'replace' ? 'Componentes compatibles sustituidos juntos.' : 'Pieza elegida instalada y componente incompatible retirado.');
        } catch (error) { message(error.message, true); }
      });
      box.append(button);
      return button;
    }
    const replacements = plan.conflicts.map(item => item.replacement?.name);
    if (replacements.every(Boolean)) {
      const replacementText = plan.conflicts.map(item => `${item.replacement.name}${item.replacement.fuelCapacityKg ? ` (${item.replacement.fuelCapacityKg} kg llenos)` : ''}`).join(', ');
      choice(`Reemplazar por ${replacementText}`, 'replace');
    }
    choice(`Retirar ${plan.conflicts.map(item => item.name).join(', ')}`, 'remove');
    choice('Cancelar · conservar diseño', 'cancel');
    box.querySelector('button')?.focus({ preventScroll: true });
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
    const hangar = enabled && (section === 'hangar' || section === 'engineering');
    $('.lab-workspace').hidden = !hangar;
    $('#lab-launch').hidden = !(enabled && section === 'launch');
    $('#lab-landing').hidden = !(enabled && section === 'landing');
    $('#lab-mission-planner').hidden = !(enabled && section === 'planner' && plannerMode === 'lunar');
    $('#lab-interplanetary').hidden = !(enabled && section === 'planner' && plannerMode === 'interplanetary');
    $('#lab-integrated').hidden = !(enabled && section === 'planner' && plannerMode === 'integrated');
    $('#lab-planner-modes').hidden = !(enabled && section === 'planner');
    for (const button of lab.querySelectorAll('[data-planner-mode]')) button.setAttribute('aria-pressed', String(button.dataset.plannerMode === plannerMode));
    $('#lab-mission-center').hidden = !(enabled && section === 'center');
    lab.dataset.section = section;
    lab.dataset.plannerMode = plannerMode;
    const meta = section === 'planner' ? { step: 'Planificar', ...PLANNER_META[plannerMode] } : SECTION_META[section];
    $('#lab-crumb-step').textContent = meta.step; $('#lab-crumb-tool').textContent = meta.title;
    $('#lab-tool-title').textContent = meta.title; $('#lab-tool-desc').textContent = meta.desc;
    $('#lab-ctx-open-center').hidden = section === 'center';
    updateDesignContext();
    for (const button of lab.querySelectorAll('[data-lab-section]')) {
      if (button.dataset.labSection === section) button.setAttribute('aria-current', 'page');
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
        : 'Desliza para bajar al catálogo · activa el control 3D para girar y acercar'
      : 'Arrastra para girar · rueda para acercar · toca una pieza para inspeccionarla';
  }
  $('#lab-touch-toggle').addEventListener('click', () => setTouchMode($('#lab-touch-toggle').getAttribute('aria-pressed') !== 'true'));
  function setHangarMode(mode) {
    hangarMode = mode === 'historical' ? 'historical' : 'custom';
    for (const button of lab.querySelectorAll('[data-hangar-mode]')) button.setAttribute('aria-pressed', String(button.dataset.hangarMode === hangarMode));
    $('#lab-history').hidden = hangarMode !== 'historical';
    $('#lab-custom').hidden = hangarMode !== 'custom';
    $('#lab-library-title').textContent = hangarMode === 'historical' ? 'Sondas históricas' : 'Componentes';
    lab.dataset.hangarMode = hangarMode;
    if (hangarMode === 'historical') renderHistory(); else { renderCatalog(); renderComponentInfo(); }
  }
  for (const button of lab.querySelectorAll('[data-hangar-mode]')) button.addEventListener('click', () => { clearPendingChange(); setHangarMode(button.dataset.hangarMode); });
  // 15: biblioteca histórica. Cada ficha muestra cifras con su calidad y su fuente; cargarla monta la configuración de herencia.
  function renderHistory() {
    const list = $('#lab-history-list'); list.replaceChildren();
    for (const probe of HISTORICAL_PROBES) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'lab-probe-card'; card.setAttribute('role', 'listitem');
      card.dataset.probeId = probe.id; card.setAttribute('aria-pressed', String(selectedProbeId === probe.id));
      const name = document.createElement('strong'); name.textContent = probe.name;
      const meta = document.createElement('small'); meta.textContent = `${probe.launch} · ${probe.role}`;
      card.append(name, meta);
      card.addEventListener('click', () => { selectedProbeId = probe.id; renderHistory(); });
      list.append(card);
    }
    const probe = HISTORICAL_PROBES.find(item => item.id === selectedProbeId) ?? HISTORICAL_PROBES[0];
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
    const notes = document.createElement('p'); notes.className = 'lab-helper'; notes.textContent = probe.notes;
    const parts = document.createElement('p'); parts.className = 'lab-helper';
    parts.textContent = `Arquitectura: ${getComponent(probe.coreId)?.name} con ${probe.parts.length} piezas montadas. Las masas por pieza y los consumos sin fuente son estimaciones del simulador; la masa del bus se obtiene por cierre con la masa seca documentada.`;
    const actions = document.createElement('div'); actions.className = 'lab-two-actions';
    const loadButton = document.createElement('button'); loadButton.type = 'button'; loadButton.id = 'lab-load-historical'; loadButton.textContent = 'Ver configuración histórica';
    loadButton.addEventListener('click', () => { load(historicalDesign(probe.id)); message(`${probe.name}: configuración histórica cargada.`); });
    const variant = document.createElement('button'); variant.type = 'button'; variant.className = 'button-primary'; variant.id = 'lab-create-variant'; variant.textContent = 'Crear variante personalizada';
    variant.addEventListener('click', () => {
      const base = historicalDesign(probe.id);
      load({ ...base, name: `Variante de ${probe.name}` });
      heritageFilter = 'all'; setHangarMode('custom');
      message(`Variante de ${probe.name} creada: sustituye o retira piezas desde el catálogo. El original histórico no cambia.`);
    });
    actions.append(loadButton, variant);
    sheet.append(title, role, table, parts, notes, actions);
  }
  function renderHeritageFilter() {
    const select = $('#lab-heritage-filter');
    if (select.options.length) { select.value = heritageFilter; return; }
    select.add(new Option('Todos los programas', 'all'));
    for (const [id, label] of HERITAGE_PROGRAMS) select.add(new Option(`${label} (herencia)`, id));
    select.add(new Option('Ilustrativas del simulador', ILLUSTRATIVE_PROGRAM));
    select.value = heritageFilter;
    select.addEventListener('change', () => { heritageFilter = select.value; clearPendingChange(); renderCatalog(); });
  }
  function renderCatalog() {
    renderHeritageFilter();
    const list = $('#lab-catalog-list'); list.replaceChildren();
    const visible = ALL_COMPONENTS.filter(item => heritageFilter === 'all' || (item.heritage ?? ILLUSTRATIVE_PROGRAM) === heritageFilter);
    for (const [id, label] of COMPONENT_CATEGORIES) {
      const items = visible.filter(item => item.category === id);
      if (!items.length) continue;
      const group = document.createElement('div'); group.className = 'lab-category';
      const heading = document.createElement('h4'); heading.textContent = label; group.append(heading);
      for (const component of items) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'lab-component';
        button.dataset.componentId = component.id;
        button.dataset.heritage = component.heritage ?? ILLUSTRATIVE_PROGRAM;
        button.setAttribute('aria-pressed', String(selectedComponentId === component.id));
        button.innerHTML = `<span class="lab-part-glyph lab-part-glyph--${id}" aria-hidden="true"></span><span></span><small></small>`;
        button.querySelector('span:nth-child(2)').textContent = component.name;
        button.querySelector('small').textContent = `${PROGRAM_LABELS[component.heritage ?? ILLUSTRATIVE_PROGRAM]} · ${number(component.dryMassKg)} kg`;
        button.addEventListener('click', () => { clearPendingChange(); selectedComponentId = component.id; renderCatalog(); renderComponentInfo(); });
        group.append(button);
      }
      list.append(group);
    }
  }
  function componentSpecs(component) {
    return `${component.id} · ${component.dimensionsM.join(' × ')} m · ${number(component.dryMassKg)} kg secos`
      + (component.generationW ? ` · ${component.category === 'rtg' || component.powerSource === 'rtg' ? '' : 'a 1 AU '}+${number(component.generationW, 0)} W` : '')
      + (component.idlePowerW ? ` · ${number(component.idlePowerW)} W reposo` : '')
      + (component.activePowerW ? ` · ${number(component.activePowerW)} W activos` : '')
      + (component.batteryWh ? ` · ${number(component.batteryWh, 0)} Wh` : '')
      + (component.fuelCapacityKg ? ` · ${number(component.fuelCapacityKg)} kg de propelente` : '')
      + (component.thrustN ? ` · ${component.thrustN < 1 ? `${number(component.thrustN * 1000, 1)} mN` : `${number(component.thrustN, 2)} N`} · Isp ${number(component.ispS, 0)} s` : '')
      + (component.electric ? ` · eléctrico ${number(component.electric.minInputPowerW, 0)}–${number(component.electric.maxInputPowerW, 0)} W` : '')
      + (component.rcsPropellantKg ? ` · ${number(component.rcsPropellantKg)} kg de hidracina de actitud` : '')
      + (component.maxAttachedMassKg ? ` · Carga máxima montada ${number(component.maxAttachedMassKg, 0)} kg` : '')
      + (component.propellant ? ` · Propelente: ${propellantLabel(component.propellant)}` : '')
      + (component.category !== 'structure' ? ` · Herraje: ${interfaceOf(component)}` : '');
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
  function renderComponentInfo() {
    const component = getComponent(selectedComponentId);
    const info = $('#lab-catalog-info'); info.replaceChildren();
    if (!component) return;
    const title = document.createElement('h4'); title.textContent = component.name; info.append(title);
    const program = document.createElement('p'); program.className = 'lab-program';
    program.textContent = component.heritage && component.heritage !== ILLUSTRATIVE_PROGRAM
      ? `Herencia: ${PROGRAM_LABELS[component.heritage]} · ${component.provenance}` : 'Pieza ilustrativa del simulador (valores ficticios plausibles).';
    info.append(program);
    if (component.description) { const description = document.createElement('p'); description.textContent = component.description; info.append(description); }
    const details = document.createElement('p'); details.className = 'lab-specs'; details.textContent = componentSpecs(component);
    info.append(details);
    appendDataQuality(info, component);
    const socketSelect = $('#lab-socket'); socketSelect.replaceChildren();
    let usable = 0;
    if (component.category !== 'structure') {
      const core = getComponent(design.coreId);
      for (const socket of core?.slots.filter(item => slotAccepts(item, component)) ?? []) {
        const fits = fitsEnvelope(socket, component);
        const status = design.parts.some(p => p.socketId === socket.id) ? 'reemplazar' : 'libre';
        const adapter = needsAdapter(socket, component) ? ` · adaptador +${number(adapterMassKg(component))} kg` : '';
        const label = fits ? `${socket.name} · ${status}${adapter}` : `${socket.name} · no cabe (${number(maxDimensionM(component), 2)} m > ${number(socket.envelopeM, 2)} m)`;
        const option = new Option(label, socket.id); option.disabled = !fits;
        socketSelect.add(option);
        if (fits) usable++;
      }
      const firstUsable = [...socketSelect.options].find(option => !option.disabled);
      if (firstUsable) socketSelect.value = firstUsable.value;
    }
    socketSelect.disabled = component.category === 'structure' || !usable;
    $('#lab-add').disabled = component.category !== 'structure' && !usable;
    $('#lab-add').textContent = component.category === 'structure' ? (design.coreId ? 'Cambiar estructura' : 'Elegir estructura') : 'Agregar al diseño';
  }
  function renderSaved() {
    const select = $('#lab-saved'); select.replaceChildren();
    if (!saved.length) select.add(new Option('Sin diseños guardados', ''));
    for (const item of saved) select.add(new Option(item.name, item.id));
    $('#lab-load-saved').disabled = !saved.length;
  }
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
      button.querySelector('small').textContent = entry.socketId === 'estructura' ? 'Principal'
        : `${core.slots.find(s => s.id === entry.socketId)?.name ?? entry.socketId}${entry.adapter ? ' · adaptador' : ''}`;
      if (component.heritage && component.heritage !== ILLUSTRATIVE_PROGRAM) button.dataset.heritage = component.heritage;
      button.addEventListener('click', () => { selectedPartId = entry.id; render(); });
      list.append(button);
    }
    if (!entries.length) list.textContent = 'Sin piezas montadas.';
    const free = core ? core.slots.filter(slot => !design.parts.some(p => p.socketId === slot.id)).length : 0;
    $('#lab-stage-count').textContent = entries.length ? `${entries.length} pieza${entries.length === 1 ? '' : 's'} montada${entries.length === 1 ? '' : 's'}${free ? ` · ${free} punto${free === 1 ? '' : 's'} libre${free === 1 ? '' : 's'}` : ''}` : 'Sin estructura';
    $('#lab-empty').hidden = Boolean(core);
    view.setDesign(design, selectedPartId, { centerOfMassM: engineering?.centerOfMassM ?? null });
    const selected = selectedPartId === 'core' ? core : getComponent(design.parts.find(p => p.id === selectedPartId)?.componentId);
    const detail = $('#lab-selected-info'); detail.replaceChildren();
    if (selected) {
      const title = document.createElement('h4'); title.textContent = selected.name; detail.append(title);
      const text = document.createElement('p'); text.textContent = `${selected.description ? `${selected.description} ` : ''}Masa seca: ${number(selected.dryMassKg)} kg · ${PROGRAM_LABELS[selected.heritage ?? ILLUSTRATIVE_PROGRAM]}.`; detail.append(text);
      const entry = design.parts.find(p => p.id === selectedPartId);
      if (entry?.adapter) {
        const adapterText = document.createElement('p');
        adapterText.textContent = `Montada con adaptador estructural: +${number(adapterMassKg(selected))} kg estimados (${ADAPTER_MASS_RULE}).`;
        detail.append(adapterText);
      }
      if (entry?.fuelKg !== undefined) {
        const label = document.createElement('label'); label.className = 'lab-field'; label.textContent = `Combustible (0–${selected.fuelCapacityKg} kg)`;
        const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = String(selected.fuelCapacityKg); input.step = '0.1'; input.value = String(entry.fuelKg);
        input.addEventListener('change', () => {
          const next = structuredClone(design); next.parts.find(p => p.id === entry.id).fuelKg = Number(input.value);
          const issues = validateDesign(next);
          if (issues.length) { message(issues.join(' '), true); input.value = String(entry.fuelKg); return; }
          design = next; render();
        });
        label.append(input); detail.append(label);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = selectedPartId === 'core' ? 'Retirar estructura y piezas' : 'Retirar componente';
      remove.addEventListener('click', () => {
        design = selectedPartId === 'core' ? { ...design, coreId: null, parts: [] }
          : { ...design, parts: design.parts.filter(p => p.id !== selectedPartId) };
        selectedPartId = null; render();
      }); detail.append(remove);
    }
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
      ['Masa seca estructural', has ? valueOrNA(result.structuralDryMassKg, 'kg') : 'No disponible', 'Bus + piezas sin propelente.'],
      ['Adaptadores (estimado)', has ? valueOrNA(result.adapterMassKg, 'kg') : 'No disponible'],
      ['Hidracina de actitud', has ? valueOrNA(result.rcsPropellantKg, 'kg') : 'No disponible', 'No la consume el motor principal: forma parte de la masa final.'],
      ['Masa seca', has ? valueOrNA(result.dryMassKg, 'kg') : 'No disponible', 'Masa final tras agotar el propelente del motor principal.'],
      ['Propelente principal', `${number(result.fuelKg)} / ${number(result.fuelCapacityKg)} kg${result.mainPropellant ? ` · ${propellantLabel(result.mainPropellant)}` : ''}`],
      ['Masa total', has ? valueOrNA(result.wetMassKg, 'kg') : 'No disponible'],
      ['Propulsión', result.propulsionType === 'electric' ? 'Eléctrica (iónica)' : result.propulsionType === 'chemical' ? 'Química' : 'Sin motor'],
      ['Empuje', kN(result.thrustN)], ['Impulso específico', valueOrNA(result.effectiveIspS, 's', 0)],
      ['Aceleración inicial', acceleration == null ? 'No disponible' : `${number(acceleration * 1000, acceleration < 0.01 ? 3 : 1)} mm/s²`],
      ['Consumo de propelente', massFlow == null ? 'No disponible' : massFlow < 0.01 ? `${number(massFlow * 1e6, 1)} mg/s` : `${number(massFlow * 1000, 1)} g/s`],
      ['Δv ideal', valueOrNA(result.deltaVMS, 'm/s', 0)],
      ['Centro de masas (x, y, z)', com ? com.map(v => number(v, 2)).join(' · ') + ' m' : 'No disponible', 'Ejes del bus: +Y hacia la cubierta superior.'],
      ['Desalineación del empuje', align ? `${number(align.lateralOffsetM * 100, 1)} cm (límite ${number(align.limitM * 100, 0)} cm${align.gimbaled ? ', con cardán' : ''})` : 'No disponible'],
      ['Consumo de servicio', valueOrNA(result.idlePowerW, 'W')], ['Consumo en encendido', valueOrNA(result.activePowerW, 'W')],
      ['Batería', valueOrNA(result.batteryWh, 'Wh', 0)],
      ['Autonomía por batería', result.autonomyHours == null ? 'No disponible' : `${number(result.autonomyHours, 1)} h`]
    ];
    if (result.rcs) metrics.splice(7, 0, ['Control de actitud', result.rcs ? `${result.rcs.count ?? '¿?'} × ${result.rcs.thrustN == null ? 'empuje desconocido' : kN(result.rcs.thrustN)}${result.rcs.sharesMainPropellant ? ' · comparte depósito' : ''}` : 'Sin propulsores']);
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
      programs.textContent = `Programas: ${result.assessment.programs.map(id => PROGRAM_LABELS[id] ?? id).join(' · ')}`;
      assessment.append(programs);
    }
    const compatibility = $('#lab-compatibility'); compatibility.replaceChildren();
    const issues = result.compatibility ?? [];
    if (issues.length) {
      const title = document.createElement('h4'); title.textContent = `Compatibilidad (${result.assessment.errors} error${result.assessment.errors === 1 ? '' : 'es'} · ${result.assessment.warnings} advertencia${result.assessment.warnings === 1 ? '' : 's'})`;
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

    // Calidad de los datos y referencias de las piezas de herencia montadas.
    const quality = $('#lab-data-quality'); quality.replaceChildren();
    const dq = result.dataQuality;
    if (has && dq) {
      const title = document.createElement('h4'); title.textContent = 'Calidad de los datos'; quality.append(title);
      const counts = document.createElement('p'); counts.className = 'lab-quality-counts';
      for (const [q, n] of Object.entries(dq.counts)) if (n) { counts.append(qualityBadge(q), ` ${n}  `); }
      if (dq.illustrativeComponents) counts.append(`· ${dq.illustrativeComponents} pieza${dq.illustrativeComponents === 1 ? '' : 's'} ilustrativa${dq.illustrativeComponents === 1 ? '' : 's'}`);
      quality.append(counts);
      if (dq.dependsOnEstimates) { const note = document.createElement('p'); note.className = 'lab-helper'; note.textContent = 'Los resultados dependen de cifras estimadas o desconocidas: úsalos como orden de magnitud, no como datos históricos.'; quality.append(note); }
      if (dq.sources.length) {
        const list = document.createElement('ul'); list.className = 'lab-sources';
        for (const source of dq.sources) { const item = document.createElement('li'); const link = sourceLink(source.id); if (link) { link.textContent = source.title; item.append(link, ` · ${source.publisher}`); list.append(item); } }
        quality.append(list);
      }
    }
    const clearance = view.getLandingClearance();
    $('#lab-assembly-status').textContent = clearance
      ? `${clearance.clearanceM > 0 ? 'Holgura motor' : 'Interferencia motor'} · ${number(clearance.clearanceM * 100, 1)} cm`
      : has ? (status === ENGINEERING_STATUS.modify ? 'Requiere modificaciones' : result.structuralIssues.length ? 'Revisar conexiones' : 'Ensamblaje válido') : 'Sin estructura';
  }
  function render() {
    updateDesignContext();
    clearPendingChange();
    $('#lab-design-name').value = design.name;
    try { engineering = calculateEngineering(design); } catch { engineering = null; }
    if (hangarMode === 'historical') renderHistory(); else { renderCatalog(); renderComponentInfo(); }
    renderAssembly(); renderEngineering();
    planner.setDesign(design); launch.setDesign(design); landing.setDesign(design); interplanetary.setDesign(design); integrated.setDesign(design);
  }
  function load(next) { design = next; selectedPartId = null; selectedComponentId = next.coreId || 'bus-interplanetary'; render(); }
  {
    const select = $('#lab-preset');
    const illustrative = document.createElement('optgroup'); illustrative.label = 'Ilustrativas del simulador';
    for (const preset of PRESETS) illustrative.append(new Option(preset.name, preset.id));
    const historical = document.createElement('optgroup'); historical.label = 'Sondas históricas (herencia)';
    for (const preset of HISTORICAL_PRESETS) historical.append(new Option(preset.name, preset.id));
    select.append(illustrative, historical);
  }
  $('#lab-preset').value = 'interplanetary';
  $('#lab-socket').addEventListener('change', clearPendingChange);
  $('#lab-add').addEventListener('click', () => {
    try {
      const socketId = $('#lab-socket').value;
      const plan = planPartChange(design, selectedComponentId, socketId);
      if (plan.adapter?.required) { showAdapterConfirm(plan); return; }
      if (plan.conflicts.length) { showReplacementOptions(plan); return; }
      design = applyPartChange(design, selectedComponentId, socketId);
      selectedPartId = getComponent(selectedComponentId).category === 'structure' ? 'core' : design.parts.find(p => p.socketId === socketId)?.id ?? design.parts.at(-1)?.id;
      message(`${getComponent(selectedComponentId).name} integrado en el diseño.`); render();
    } catch (error) { message(error.message, true); }
  });
  $('#lab-design-name').addEventListener('change', event => {
    const candidate = event.target.value.trim();
    if (!candidate) { event.target.value = design.name; message('El nombre no puede estar vacío.', true); return; }
    design = { ...design, name: candidate }; render();
  });
  $('#lab-new').addEventListener('click', () => { load(newDesign()); message('Diseño vacío creado. Elige una estructura.'); });
  $('#lab-save').addEventListener('click', () => {
    try { saved = saveDesign(design); renderSaved(); $('#lab-saved').value = design.id; message('Diseño guardado en este navegador.'); }
    catch (error) { message(`No se pudo guardar: ${error.message}`, true); }
  });
  $('#lab-load-preset').addEventListener('click', () => {
    const preset = [...PRESETS, ...HISTORICAL_PRESETS].find(item => item.id === $('#lab-preset').value);
    if (preset) { load(preset.create()); message('Configuración editable cargada.'); }
  });
  $('#lab-load-saved').addEventListener('click', () => {
    const item = saved.find(savedItem => savedItem.id === $('#lab-saved').value);
    if (item) { load(structuredClone(item)); message('Diseño recuperado.'); }
  });
  $('#lab-export').addEventListener('click', () => {
    const issues = validateDesign(design);
    if (issues.length) { message(issues.join(' '), true); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${design.name.trim().replace(/[^\w-]+/g, '-').slice(0, 40) || 'sonda'}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); message('Diseño exportado en JSON.');
  });
  $('#lab-import').addEventListener('click', () => $('#lab-import-file').click());
  $('#lab-import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try { if (file.size > 100_000) throw Error('Archivo demasiado grande.'); load(parseDesign(await file.text())); message('Diseño importado. Guarda si deseas conservarlo en este navegador.'); }
    catch (error) { message(`Importación rechazada: ${error.message}`, true); }
    event.target.value = '';
  });
  $('[data-lab-action="orbital"]').addEventListener('click', () => setBuilder(false));
  $('[data-lab-action="reset-camera"]').addEventListener('click', () => section === 'planner' ? planner.resetCamera() : section === 'center' ? center.resetCamera() : view.resetCamera());
  for (const button of lab.querySelectorAll('[data-lab-section]:not(:disabled)')) button.addEventListener('click', () => {
    section = button.dataset.labSection;
    updateSection();
    if (section === 'engineering') $('.lab-engineering').scrollIntoView({ block: 'nearest' });
  });
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
  renderSaved(); setHangarMode(hangarMode); render();
  if (app.dataset.appMode === 'experimental') setBuilder(true);
  return { dispose: () => {
    modeObserver.disconnect(); headerObserver.disconnect(); window.removeEventListener('resize', measureHeader);
    center.dispose(); integrated.dispose(); interplanetary.dispose(); landing.dispose(); launch.dispose(); planner.dispose(); view.dispose(); lab.remove(); returnButton.remove(); app.style.removeProperty('--lab-top');
    delete app.dataset.labView;
  } };
}
