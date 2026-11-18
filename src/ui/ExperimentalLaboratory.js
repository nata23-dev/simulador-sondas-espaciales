import './experimental-laboratory.css';
import { COMPONENTS, COMPONENT_CATEGORIES, getComponent } from '../lab/ComponentCatalog.js';
import { PRESETS, newDesign, planPartChange, applyPartChange, parseDesign, validateDesign, loadSavedDesigns, saveDesign } from '../lab/ProbeDesign.js';
import { calculateEngineering } from '../lab/ProbeEngineering.js';
import { createProbeAssemblyView } from '../lab/ProbeAssemblyView.js';
import { createMissionPlanner } from './MissionPlanner.js';
import { createMissionControlCenter } from './MissionControlCenter.js';
import { createLaunchPlanner } from './LaunchPlanner.js';
import { createLandingPlanner } from './LandingPlanner.js';

const number = (value, digits = 1) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(value);
const valueOrNA = (value, unit, digits = 1) => value == null ? 'No disponible' : `${number(value, digits)} ${unit}`;

export function createExperimentalLaboratory() {
  const app = document.querySelector('#app');
  const scene = document.querySelector('.scene-panel');
  const lab = document.createElement('section');
  lab.id = 'experimental-lab';
  lab.setAttribute('aria-label', 'Laboratorio experimental de construcción de sondas');
  lab.hidden = true;
  lab.innerHTML = `
    <header class="lab-header">
      <div class="lab-title"><span class="eyebrow">LABORATORIO EXPERIMENTAL / ETAPA 12F</span><h2>Hangar y control de misiones</h2><p>Componentes ilustrativos · transferencia lunar calculada con efemérides locales</p></div>
      <div class="lab-head-actions"><button type="button" data-lab-action="orbital">Ver simulación orbital</button><button type="button" data-lab-action="reset-camera">Restablecer cámara</button></div>
    </header>
    <nav class="lab-sections" aria-label="Áreas del laboratorio"><button type="button" data-lab-section="hangar" aria-current="page">Hangar</button><button type="button" data-lab-section="engineering">Ingeniería</button><button type="button" data-lab-section="launch">Lanzamiento</button><button type="button" data-lab-section="landing">Descenso y aterrizaje</button><button type="button" data-lab-section="planner">Planificador</button><button type="button" data-lab-section="center">Centro de misión</button></nav>
    <div class="lab-workspace">
      <aside class="lab-panel lab-catalog" aria-label="Catálogo de componentes">
        <div class="lab-panel-heading"><span class="eyebrow">01 / CATÁLOGO</span><h3>Componentes</h3></div>
        <div class="lab-panel-scroll"><div id="lab-catalog-list"></div><div class="lab-part-info" id="lab-catalog-info"></div>
          <label class="lab-field" for="lab-socket">Punto de conexión<select id="lab-socket"></select></label>
          <button type="button" class="button-primary lab-add" id="lab-add">Agregar al diseño</button>
          <div class="lab-replacement" id="lab-replacement" role="group" aria-label="Resolver incompatibilidad de propelente" hidden></div>
          <p class="lab-helper">Selecciona una pieza y un punto compatible. Una conexión ocupada se reemplaza.</p>
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
          <div class="lab-divider"></div><h4>Balance de ingeniería</h4><div id="lab-metrics" class="lab-metrics"></div>
          <div class="lab-assessment" id="lab-assessment"></div>
          <p class="lab-disclaimer">Modelo conceptual de diseño. El delta-v es ideal; no modifica DOPRI54 ni representa maniobras, iluminación real o capacidad de aterrizaje.</p>
        </div>
      </aside>
    </div><div id="lab-launch" hidden></div><div id="lab-landing" hidden></div><div id="lab-mission-planner" hidden></div><div id="lab-mission-center" hidden></div>`;
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
    onExecuteRequest: candidate => { launchActive = false; launch.deactivate(); landing.deactivate(); center.setPlan(candidate); section = 'center'; updateSection(); center.start(); }
  });
  const launch = createLaunchPlanner({
    host: $('#lab-launch'),
    onExecuteRequest: candidate => { landing.deactivate(); launchActive = true; center.setPlan(candidate); section = 'center'; updateSection(); center.start(); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'El lanzamiento quedó obsoleto. Recalcula en Lanzamiento.' }); } }
  });
  const landing = createLandingPlanner({
    host: $('#lab-landing'),
    onExecuteRequest: candidate => { launch.deactivate(); launchActive = true; center.setPlan(candidate); section = 'center'; updateSection(); center.start(); },
    onInvalidated: () => { if (launchActive) { launchActive = false; center.setPlan({ ready: false, reason: 'El descenso quedó obsoleto. Recalcula en Descenso y aterrizaje.' }); } }
  });
  center = createMissionControlCenter($('#lab-mission-center'), () => { section = 'planner'; updateSection(); });

  function message(text, error = false) {
    $('#lab-message').textContent = text;
    $('#lab-message').dataset.error = String(error);
  }
  function clearPendingChange() {
    pendingChange = null;
    $('#lab-replacement').hidden = true;
    $('#lab-replacement').replaceChildren();
  }
  function showReplacementOptions(plan) {
    const box = $('#lab-replacement');
    box.replaceChildren(); box.hidden = false;
    pendingChange = { design, componentId: plan.component.id, socketId: plan.socketId };
    const names = plan.conflicts.map(item => `${item.name} (${item.propellant})`).join(', ');
    const title = document.createElement('strong');
    title.textContent = `${plan.component.name} requiere propelente ${plan.component.propellant}.`;
    const detail = document.createElement('p');
    detail.textContent = `En conflicto: ${names}. El diseño actual se conserva hasta que elijas una opción.`;
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
          const next = applyPartChange(design, pendingChange.componentId, pendingChange.socketId, resolution);
          design = next;
          selectedPartId = next.parts.at(-1)?.id ?? 'core';
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
    $('#lab-mission-planner').hidden = !(enabled && section === 'planner');
    $('#lab-mission-center').hidden = !(enabled && section === 'center');
    lab.dataset.section = section;
    for (const button of lab.querySelectorAll('[data-lab-section]')) {
      if (button.dataset.labSection === section) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    view.setVisible(hangar);
    planner.setVisible(enabled && section === 'planner');
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
  function renderCatalog() {
    const list = $('#lab-catalog-list'); list.replaceChildren();
    for (const [id, label] of COMPONENT_CATEGORIES) {
      const group = document.createElement('div'); group.className = 'lab-category';
      const heading = document.createElement('h4'); heading.textContent = label; group.append(heading);
      for (const component of COMPONENTS.filter(item => item.category === id)) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'lab-component';
        button.dataset.componentId = component.id;
        button.setAttribute('aria-pressed', String(selectedComponentId === component.id));
        button.innerHTML = `<span class="lab-part-glyph lab-part-glyph--${id}" aria-hidden="true"></span><span></span><small>${number(component.dryMassKg)} kg</small>`;
        button.querySelector('span:nth-child(2)').textContent = component.name;
        button.addEventListener('click', () => { clearPendingChange(); selectedComponentId = component.id; renderCatalog(); renderComponentInfo(); });
        group.append(button);
      }
      list.append(group);
    }
  }
  function renderComponentInfo() {
    const component = getComponent(selectedComponentId);
    const info = $('#lab-catalog-info'); info.replaceChildren();
    if (!component) return;
    const title = document.createElement('h4'); title.textContent = component.name; info.append(title);
    const description = document.createElement('p'); description.textContent = component.description; info.append(description);
    const details = document.createElement('p'); details.className = 'lab-specs';
    details.textContent = `${component.id} · ${component.dimensionsM.join(' × ')} m · ${component.dryMassKg} kg secos`
      + (component.generationW ? ` · +${component.generationW} W` : '')
      + (component.idlePowerW ? ` · ${component.idlePowerW} W reposo` : '')
      + (component.activePowerW ? ` · ${component.activePowerW} W activos` : '')
      + (component.batteryWh ? ` · ${component.batteryWh} Wh` : '')
      + (component.fuelCapacityKg ? ` · ${component.fuelCapacityKg} kg combustible` : '')
      + (component.thrustN ? ` · ${component.thrustN} N · Isp ${component.ispS} s` : '')
      + (component.maxAttachedMassKg ? ` · Carga máxima montada ${component.maxAttachedMassKg} kg` : '')
      + (component.propellant ? ` · Propelente: ${component.propellant}` : '')
      + (component.category !== 'structure' ? ` · Conexión: ${COMPONENT_CATEGORIES.find(item => item[0] === component.category)?.[1]}` : '');
    info.append(details);
    const socketSelect = $('#lab-socket'); socketSelect.replaceChildren();
    if (component.category !== 'structure') {
      const core = getComponent(design.coreId);
      for (const socket of core?.slots.filter(item => item.category === component.category) ?? []) {
        const option = new Option(`${socket.name}${design.parts.some(p => p.socketId === socket.id) ? ' · reemplazar' : ' · libre'}`, socket.id);
        socketSelect.add(option);
      }
    }
    socketSelect.disabled = component.category === 'structure' || !socketSelect.options.length;
    $('#lab-add').disabled = component.category !== 'structure' && !socketSelect.options.length;
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
      button.querySelector('small').textContent = entry.socketId === 'estructura' ? 'Principal' : core.slots.find(s => s.id === entry.socketId)?.name;
      button.addEventListener('click', () => { selectedPartId = entry.id; render(); });
      list.append(button);
    }
    if (!entries.length) list.textContent = 'Sin piezas montadas.';
    $('#lab-stage-count').textContent = entries.length ? `${entries.length} pieza${entries.length === 1 ? '' : 's'} montada${entries.length === 1 ? '' : 's'}` : 'Sin estructura';
    $('#lab-empty').hidden = Boolean(core);
    view.setDesign(design, selectedPartId);
    const selected = selectedPartId === 'core' ? core : getComponent(design.parts.find(p => p.id === selectedPartId)?.componentId);
    const detail = $('#lab-selected-info'); detail.replaceChildren();
    if (selected) {
      const title = document.createElement('h4'); title.textContent = selected.name; detail.append(title);
      const text = document.createElement('p'); text.textContent = `${selected.description} Masa seca: ${selected.dryMassKg} kg.`; detail.append(text);
      const entry = design.parts.find(p => p.id === selectedPartId);
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
  function renderEngineering() {
    const result = calculateEngineering(design);
    const metrics = [
      ['Masa seca', design.coreId ? valueOrNA(result.dryMassKg, 'kg') : 'No disponible'],
      ['Masa con combustible', design.coreId ? valueOrNA(result.wetMassKg, 'kg') : 'No disponible'],
      ['Combustible', `${number(result.fuelKg)} / ${number(result.fuelCapacityKg)} kg`],
      ['Empuje compatible', valueOrNA(result.thrustN, 'N', 2)], ['Delta-v ideal', valueOrNA(result.deltaVMS, 'm/s', 1)],
      ['Generación solar nominal', valueOrNA(result.generationW, 'W')], ['Consumo en reposo', valueOrNA(result.idlePowerW, 'W')],
      ['Consumo activo adicional', valueOrNA(result.activePowerW, 'W')], ['Balance en reposo', valueOrNA(result.netIdleW, 'W')],
      ['Capacidad de batería', valueOrNA(result.batteryWh, 'Wh')],
      ['Autonomía por batería', result.autonomyHours == null ? 'No disponible' : `${number(result.autonomyHours, 1)} h`]
    ];
    const container = $('#lab-metrics'); container.replaceChildren();
    for (const [label, value] of metrics) {
      const row = document.createElement('div'); row.className = 'lab-metric';
      const term = document.createElement('span'); term.textContent = label;
      const data = document.createElement('strong'); data.textContent = value;
      row.append(term, data); container.append(row);
    }
    const assessment = $('#lab-assessment'); assessment.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = result.structuralIssues.length ? 'Configuración incompatible' : 'Conexiones estructurales válidas';
    assessment.dataset.valid = String(!result.structuralIssues.length && !!design.coreId); assessment.append(heading);
    for (const note of result.notes) { const line = document.createElement('p'); line.textContent = note; assessment.append(line); }
    const clearance = view.getLandingClearance();
    $('#lab-assembly-status').textContent = clearance
      ? `${clearance.clearanceM > 0 ? 'Holgura motor' : 'Interferencia motor'} · ${number(clearance.clearanceM * 100, 1)} cm`
      : design.coreId ? (result.structuralIssues.length ? 'Revisar conexiones' : 'Ensamblaje válido') : 'Sin estructura';
  }
  function render() {
    clearPendingChange();
    $('#lab-design-name').value = design.name;
    renderCatalog(); renderComponentInfo(); renderAssembly(); renderEngineering();
    planner.setDesign(design); launch.setDesign(design); landing.setDesign(design);
  }
  function load(next) { design = next; selectedPartId = null; selectedComponentId = next.coreId || 'bus-interplanetary'; render(); }
  for (const preset of PRESETS) $('#lab-preset').add(new Option(preset.name, preset.id));
  $('#lab-preset').value = 'interplanetary';
  $('#lab-socket').addEventListener('change', clearPendingChange);
  $('#lab-add').addEventListener('click', () => {
    try {
      const socketId = $('#lab-socket').value;
      const plan = planPartChange(design, selectedComponentId, socketId);
      if (plan.conflicts.length) { showReplacementOptions(plan); return; }
      design = applyPartChange(design, selectedComponentId, socketId);
      selectedPartId = getComponent(selectedComponentId).category === 'structure' ? 'core' : design.parts.at(-1)?.id;
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
    const preset = PRESETS.find(item => item.id === $('#lab-preset').value);
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
  renderSaved(); render();
  if (app.dataset.appMode === 'experimental') setBuilder(true);
  return { dispose: () => {
    modeObserver.disconnect(); headerObserver.disconnect(); window.removeEventListener('resize', measureHeader);
    center.dispose(); landing.dispose(); launch.dispose(); planner.dispose(); view.dispose(); lab.remove(); returnButton.remove(); app.style.removeProperty('--lab-top');
    delete app.dataset.labView;
  } };
}
