import { validateMoonDataset } from '../science/PlanetaryMoons.js';
import { gregorianTimestampToJdTdb } from '../science/Time.js';
import { formatMissionTdb, formatMissionFlightDays, formatMissionFlightSeconds } from './MissionTimeDisplay.js';
import { calculateLunarTransfer } from '../lab/MissionPhysics.js';
import { evaluateMission } from '../lab/MissionEngineering.js';
import { calculateEngineering } from '../lab/ProbeEngineering.js';
import { createMissionTrajectoryView } from '../lab/MissionTrajectoryView.js';
import { createMissionPlan, designSignature, DESTINATIONS, isMissionResultCurrent, loadSavedPlans, parseMissionPlan, saveMissionPlan, validatePlanOptions } from '../lab/MissionPlanStore.js';
import { TRANSFER_MODEL_VERSION } from '../lab/MissionPhysics.js';
import { createFiniteThrustPlanner } from './FiniteThrustPlanner.js';
import { LUNAR_DEFAULTS, LUNAR_GUIDE } from '../lab/FleetGuide.js';

const number = (n, digits = 1) => Number.isFinite(n) ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(n) : 'No disponible';
const valueOrNA = (n, unit, digits = 1) => Number.isFinite(n) ? `${number(n, digits)} ${unit}` : 'No disponible';

export function createMissionPlanner(host, onRestoreDesign, { onPlanChange = () => {}, onExecuteRequest = () => {} } = {}) {
  host.classList.add('mission-planner');
  host.innerHTML = `
    <div class="mission-controls lab-panel"><div class="lab-panel-heading"><span class="eyebrow">03 / PLANIFICADOR</span><h3>Condiciones de misión</h3></div>
      <div class="lab-panel-scroll">
        <p class="mission-intro">Viaje a la Luna desde una órbita terrestre circular que la sonda ya ocupa. La fase y el plano se eligen para apuntar al encuentro; el lanzamiento y su Δv no se incluyen.</p>
        <label class="lab-field">Sonda activa<input id="mission-probe" readonly></label>
        <div id="mission-probe-advice" class="im-outcome" aria-live="polite"></div>
        <label class="lab-field">Destino<select id="mission-destination"></select></label>
        <p class="mission-hint">Para Marte, Júpiter o Europa usa «Misión completa».</p>
        <label class="lab-field">Objetivo<select id="mission-objective"><option value="approach">Aproximación lunar nominal</option><option value="flyby">Sobrevuelo lunar propuesto</option></select></label>
        <label class="lab-field">Altitud de órbita terrestre inicial (km)<input id="mission-altitude" type="number" min="200" max="150000" step="10" value="${LUNAR_DEFAULTS.defaultAltitudeKm}"></label>
        <label class="lab-field">Distancia lunar nominal de llegada (km)<input id="mission-distance" type="number" min="30000" max="100000" step="100" value="50000"></label>
        <p id="mission-distance-hint" class="mission-hint">Aproximación: 30 000–100 000 km del centro lunar.</p>
        <label class="lab-field">Salida, calendario TDB (sin conversión UTC)<input id="mission-departure" type="datetime-local" min="2026-10-01T00:00" max="2026-10-31T23:59" value="${LUNAR_DEFAULTS.departureTdb}"></label>
        <p class="mission-hint">Cobertura lunar: 1 oct–1 nov 2026, TDB. El tiempo de vuelo se calcula por la transferencia elíptica; la llegada también debe quedar cubierta.</p>
        <button id="mission-calculate" type="button" class="button-primary">Calcular transferencia</button>
        <button id="mission-execute" type="button">Ejecutar misión planificada</button>
        <p id="mission-message" class="lab-message" role="status"></p>
        <div class="lab-divider"></div><div id="ft-controls-host"></div>
        <div class="lab-divider"></div><h4>Planes locales</h4>
        <label class="lab-field">Nombre del plan<input id="mission-name" maxlength="80" value="Plan lunar"></label>
        <div class="lab-two-actions"><button id="mission-save" type="button">Guardar</button><button id="mission-export" type="button">Exportar JSON</button></div>
        <label class="lab-field">Planes guardados<select id="mission-saved"></select></label>
        <div class="lab-two-actions"><button id="mission-load" type="button">Recuperar</button><button id="mission-import" type="button">Importar JSON</button></div>
        <input id="mission-import-file" type="file" accept=".json,application/json" hidden>
        <button id="mission-restore-design" type="button" hidden>Restaurar sonda asociada al plan</button>
        <p class="mission-hint">Cada plan conserva una copia del diseño. Al recuperarlo se recalcula con el modelo y la sonda vigentes.</p>
      </div></div>
    <div class="mission-stage lab-stage"><div class="lab-stage-top"><span class="eyebrow">TRAYECTORIA CALCULADA / TIERRA + LUNA</span><span id="mission-stage-status">Sin cálculo</span></div>
      <div id="mission-canvas" aria-label="Trayectoria terrestre calculada hacia la posición lunar"></div>
      <button id="mission-touch-toggle" class="lab-touch-toggle" type="button" aria-pressed="false" hidden>Activar control 3D</button>
      <div class="mission-stage-actions"><button id="mission-focus-earth" type="button">Tierra</button><button id="mission-focus-moon" type="button">Luna</button></div>
      <div id="mission-stage-empty" class="lab-empty">Define una salida cubierta por las efemérides y calcula la transferencia.</div>
      <div class="lab-stage-foot"><span>Tierra + gravedad lunar · efeméride local · selecciona los puntos para inspeccionar</span></div>
    </div>
    <div class="mission-results lab-panel"><div class="lab-panel-heading"><span class="eyebrow">04 / RESULTADOS</span><h3>Evaluación de misión</h3></div>
      <div class="lab-panel-scroll"><div id="mission-summary"></div><div id="mission-phases"></div><div id="ft-results-host"></div>
        <details class="mission-details"><summary>Modelo, marcos y límites</summary><p>Posiciones en km y velocidades en km/s, Tierra como centro, ejes ICRF eclípticos J2000, fechas TDB. La sonda se integra con gravedad terrestre y lunar más el término indirecto del marco geocéntrico mediante DOPRI54. La Luna procede de Horizons, interpolada con Hermite dentro de octubre de 2026.</p><p>La fase y el plano de la órbita terrestre se seleccionan para la transferencia. La elipse de Hohmann proporciona la semilla de apuntado; la trayectoria visual es el resultado numérico. No se incluyen gravedad solar, empuje finito, eclipses, correcciones ni lanzamiento. La captura lunar y el éxito de una misión completa quedan sin verificar.</p></details>
      </div></div>`;
  const $ = selector => host.querySelector(selector);
  // 16: solo destinos calculables (la Luna). Los planes antiguos con otros destinos se siguen validando en MissionPlanStore.
  for (const destination of DESTINATIONS.filter(destination => destination.available)) $('#mission-destination').add(new Option(destination.name, destination.id));
  let design = null, loadedPlan = null, result = null, dataset = null, dataError = null, finite = null;
  let saved = loadSavedPlans();
  let disposed = false;
  const dataAbort = new AbortController();
  let trajectoryView;
  try { trajectoryView = createMissionTrajectoryView($('#mission-canvas'), phase => showSelectedPhase(phase)); }
  catch (error) { $('#mission-canvas').textContent = 'Visualización 3D no disponible.'; trajectoryView = { setTransfer() {}, setVisible() {}, setTouchInteraction() {}, focus() {}, resetCamera() {}, dispose() {} }; }
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  $('#mission-touch-toggle').hidden = !coarse;
  function message(value, error = false) { $('#mission-message').textContent = value; $('#mission-message').dataset.error = String(error); }
  function options() { return { destination: $('#mission-destination').value, objective: $('#mission-objective').value,
    altitudeKm: Number($('#mission-altitude').value), targetDistanceKm: Number($('#mission-distance').value), departureTdb: $('#mission-departure').value }; }
  function executionCandidate() {
    if (!dataset) return { ready: false, reason: dataError ? `Efemérides lunares no disponibles: ${dataError}` : 'Espera la carga de efemérides lunares locales.' };
    if (!result) return { ready: false, reason: 'Calcula una transferencia lunar en el Planificador.' };
    if (!isMissionResultCurrent(result, design, options())) return { ready: false, reason: 'La sonda o las condiciones cambiaron. Recalcula la misión.' };
    if (result.evaluation.status !== 'VIABLE SEGÚN EL MODELO') return {
      ready: false, reason: `Plan ${result.evaluation.status.toLowerCase()}: ${result.evaluation.reasons.join(' ') || 'revisa el presupuesto de maniobra.'}`
    };
    return { ready: true, result, design, dataset, name: $('#mission-name').value.trim() || 'Misión lunar' };
  }
  function notifyPlan() { updateExecute(); if (finite?.isActive()) return; onPlanChange(executionCandidate()); }
  // 16: «Ejecutar» solo se activa con un plan viable y vigente; el motivo se muestra en el botón.
  function updateExecute() {
    const candidate = executionCandidate(), button = $('#mission-execute');
    button.disabled = !candidate.ready; button.title = candidate.ready ? '' : candidate.reason;
  }
  // 16: consejo según la sonda activa (FleetGuide, comprobado con el mismo modelo en tests/Stage16Coherence.test.mjs).
  function renderAdvice() {
    const box = $('#mission-probe-advice'); box.replaceChildren();
    const guide = LUNAR_GUIDE[design?.basedOn];
    if (!guide) { box.hidden = true; return; }
    box.hidden = false; box.dataset.tone = guide.status === 'VIABLE SEGÚN EL MODELO' ? 'ok' : 'warn';
    const text = document.createElement('span'); text.textContent = guide.text; box.append(text);
    if (Number($('#mission-altitude').value) !== guide.altitudeKm) {
      const use = document.createElement('button'); use.type = 'button'; use.id = 'mission-use-altitude';
      use.textContent = `Usar ${number(guide.altitudeKm, 0)} km (recomendado para ${design.name})`;
      use.addEventListener('click', () => { $('#mission-altitude').value = String(guide.altitudeKm); stale('Altitud recomendada aplicada. Pulsa «Calcular transferencia».'); renderAdvice(); });
      box.append(use);
    }
  }
  function updateDistanceRange(reset = false) {
    const flyby = $('#mission-objective').value === 'flyby';
    const input = $('#mission-distance');
    input.min = flyby ? '5000' : '30000'; input.max = flyby ? '25000' : '100000';
    if (reset) input.value = flyby ? '20000' : '50000';
    $('#mission-distance-hint').textContent = flyby
      ? 'Sobrevuelo: 5 000–25 000 km del centro lunar; se calcula la distancia mínima posterior.'
      : 'Aproximación: 30 000–100 000 km del centro lunar.';
  }
  function refreshSaved() {
    const select = $('#mission-saved'); select.replaceChildren();
    if (!saved.length) select.add(new Option('Sin planes guardados', ''));
    for (const plan of saved) select.add(new Option(plan.name, plan.id));
    $('#mission-load').disabled = !saved.length;
  }
  function stale(reason) {
    result = null; trajectoryView.setTransfer(finite?.getViewTransfer() ?? null);
    $('#mission-stage-status').textContent = 'Recalcular'; $('#mission-stage-empty').hidden = Boolean(finite?.getViewTransfer());
    $('#mission-summary').replaceChildren(); $('#mission-phases').replaceChildren();
    if (reason) message(reason);
    notifyPlan();
  }
  function renderMetric(parent, label, value) {
    const row = document.createElement('div'); row.className = 'lab-metric';
    const term = document.createElement('span'); term.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value;
    row.append(term, strong); parent.append(row);
  }
  function showSelectedPhase(id) {
    const phase = $('#mission-phases').querySelector(`[data-phase="${id}"]`);
    phase?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    phase?.focus({ preventScroll: true });
  }
  function renderResults() {
    const summary = $('#mission-summary'), phases = $('#mission-phases');
    summary.replaceChildren(); phases.replaceChildren();
    if (!result) return;
    const { transfer, evaluation } = result;
    const status = document.createElement('div'); status.className = 'mission-status'; status.dataset.status = evaluation.status;
    status.textContent = evaluation.status; summary.append(status);
    const interpretation = document.createElement('p'); interpretation.className = 'mission-hint'; interpretation.textContent = evaluation.interpretation; summary.append(interpretation);
    renderMetric(summary, 'Sonda', design.name);
    renderMetric(summary, 'Tiempo de vuelo', formatMissionFlightDays(transfer.flightSeconds));
    renderMetric(summary, 'Duración', formatMissionFlightSeconds(transfer.flightSeconds));
    renderMetric(summary, 'Salida', formatMissionTdb(transfer.departureJd));
    renderMetric(summary, 'Llegada nominal', formatMissionTdb(transfer.arrivalJd));
    renderMetric(summary, 'Δv de órbita inicial / lanzamiento', 'Excluido');
    renderMetric(summary, 'Δv inyección terrestre', `${number(transfer.departureDeltaVMS, 1)} m/s`);
    renderMetric(summary, 'Δv posterior', 'No incluido · sin captura');
    renderMetric(summary, 'Δv total presupuestado', `${number(transfer.departureDeltaVMS, 1)} m/s`);
    renderMetric(summary, 'Δv ideal disponible', valueOrNA(evaluation.availableDeltaVMS, 'm/s'));
    renderMetric(summary, 'Δv ideal restante tras inyección', valueOrNA(evaluation.remainingDeltaVMS, 'm/s'));
    renderMetric(summary, 'Combustible disponible', `${number(evaluation.engineering.fuelKg, 1)} kg`);
    renderMetric(summary, 'Combustible requerido, ideal', valueOrNA(evaluation.budget?.maneuvers[0]?.fuelRequiredKg, 'kg'));
    renderMetric(summary, 'Masa inicial / seca', `${number(evaluation.engineering.wetMassKg)} / ${number(evaluation.engineering.dryMassKg)} kg`);
    renderMetric(summary, 'Masa posterior', evaluation.budget?.maneuvers[0]?.executable ? `${number(evaluation.budget.finalMassKg)} kg` : 'No disponible');
    renderMetric(summary, 'Combustible restante', evaluation.budget?.maneuvers[0]?.executable ? `${number(evaluation.budget.fuelRemainingKg, 1)} kg` : 'No disponible');
    renderMetric(summary, 'Duración encendido ideal', evaluation.budget?.maneuvers[0]?.burnSeconds != null ? `${number(evaluation.budget.maneuvers[0].burnSeconds / 60, 1)} min` : 'No disponible');
    renderMetric(summary, 'Potencia activa requerida', `${number(evaluation.requiredPowerW)} W`);
    renderMetric(summary, 'Generación solar nominal', `${number(evaluation.engineering.generationW)} W`);
    renderMetric(summary, 'Batería nominal', `${number(evaluation.engineering.batteryWh)} Wh`);
    renderMetric(summary, 'Déficit energético del encendido', `${number(evaluation.energyShortfallWh, 1)} Wh`);
    renderMetric(summary, 'Distancia lunar nominal', `${number(transfer.arrivalSeparationKm, 1)} km`);
    if (transfer.target === 'flyby') renderMetric(summary, 'Distancia mínima muestreada', `${number(transfer.closestApproach.distanceKm, 1)} km · ${transfer.flybyResolved ? 'sobrevuelo calculado' : 'sin confirmar'}`);
    renderMetric(summary, 'Velocidad relativa de llegada', `${number(transfer.relativeArrivalSpeedKmS, 3)} km/s`);
    const notes = document.createElement('div'); notes.className = 'mission-notes';
    for (const note of [...evaluation.reasons, ...transfer.limitations]) { const p = document.createElement('p'); p.textContent = note; notes.append(p); }
    summary.append(notes);
    const heading = document.createElement('h4'); heading.textContent = 'Fases de misión'; phases.append(heading);
    const midpointJd = (transfer.departureJd + transfer.arrivalJd) / 2;
    const midpoint = transfer.trajectory.find(point => point.jdTdb >= midpointJd) ?? transfer.trajectory[0];
    const maneuver = evaluation.budget?.maneuvers[0];
    const earlyClosest = transfer.target === 'flyby' && transfer.closestApproach.jdTdb < transfer.arrivalJd;
    const closestRow = index => ['closest', `${index} · Paso lunar mínimo muestreado`, transfer.closestApproach.jdTdb,
      transfer.closestApproach.positionKm, transfer.closestApproach.velocityKmS, 0, 0,
      maneuver?.executable ? maneuver.massAfterKg : null,
      `${number(transfer.closestApproach.distanceKm, 1)} km del centro lunar · ${transfer.flybyResolved ? 'sobrevuelo calculado' : 'sin confirmar'}`];
    const rows = [
      ['parking', '1 · Órbita terrestre inicial', transfer.departureJd, transfer.initialPositionKm,
        transfer.circularVelocityKmS, null, 0, evaluation.engineering.wetMassKg, 'Condición inicial seleccionada'],
      ['departure', '2 · Inyección de transferencia', transfer.departureJd, transfer.initialPositionKm, transfer.initialVelocityKmS,
        transfer.departureDeltaVMS, maneuver?.executable ? maneuver.fuelConsumedKg : null,
        maneuver?.executable ? maneuver.massAfterKg : null, maneuver?.executable ? 'Impulso ideal presupuestado' : 'Maniobra no ejecutable'],
      ['cruise', '3 · Crucero Tierra–Luna', midpoint.jdTdb, midpoint.positionKm, midpoint.velocityKmS, 0, 0,
        maneuver?.executable ? maneuver.massAfterKg : null, 'Propagación gravitacional restringida'],
      ...(earlyClosest ? [closestRow(4)] : []),
      ['arrival', `${earlyClosest ? 5 : 4} · Aproximación nominal`, transfer.arrivalJd, transfer.arrivalPositionKm, transfer.arrivalVelocityKmS, 0, 0,
        maneuver?.executable ? maneuver.massAfterKg : null, 'Encuentro calculado según el modelo; operación real sin certificar'],
      ...(transfer.target === 'flyby' && !earlyClosest ? [closestRow(5)] : []),
      ['result', transfer.target === 'flyby' ? '6 · Resultado de planificación' : '5 · Resultado de planificación',
        transfer.target === 'flyby' ? Math.max(transfer.closestApproach.jdTdb, transfer.arrivalJd) : transfer.arrivalJd,
        null, null, null, null, null, evaluation.status]
    ];
    for (const [id, name, jd, position, velocity, deltaV, fuel, mass, state] of rows) {
      const item = document.createElement('div'); item.className = 'mission-phase'; item.dataset.phase = id; item.tabIndex = -1;
      const title = document.createElement('strong'); title.textContent = name; item.append(title);
      const line = document.createElement('p'); line.textContent = `${formatMissionTdb(jd)} · ${state}`; item.append(line);
      if (position && velocity) {
        const vector = document.createElement('p'); vector.textContent = `r = [${position.map(x => number(x, 1)).join(', ')}] km · v = [${velocity.map(x => number(x, 4)).join(', ')}] km/s`;
        item.append(vector);
      }
      const resources = document.createElement('p'); resources.textContent = `Δv: ${deltaV == null ? 'No disponible' : `${number(deltaV)} m/s`} · Propelente usado: ${fuel == null ? 'No disponible' : `${number(fuel)} kg`} · Masa: ${mass == null ? 'No disponible' : `${number(mass)} kg`} · Propelente restante: ${mass == null ? 'No disponible' : `${number(Math.max(0, mass - evaluation.engineering.dryMassKg), 1)} kg`}`; item.append(resources);
      phases.append(item);
    }
    $('#mission-stage-status').textContent = `Luna a ${number(transfer.arrivalSeparationKm, 0)} km · modelo restringido`;
    $('#mission-stage-empty').hidden = true;
    trajectoryView.setTransfer(transfer);
  }
  async function loadDataset() {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/moons-2026-10.json`, { signal: dataAbort.signal });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const checked = validateMoonDataset(await response.json(), { isolate: true });
      if (!checked.data.moons.Luna) throw Error(checked.invalid.Luna || 'Luna no disponible');
      if (disposed) return;
      dataset = checked.data;
      message('Efemérides lunares locales listas para planificar.');
      notifyPlan();
    } catch (error) { if (disposed) return; dataError = error.message; message(`Efemérides no disponibles: ${dataError}`, true); notifyPlan(); }
  }
  loadDataset();
  $('#mission-calculate').addEventListener('click', () => {
    try {
      const current = options();
      const issues = validatePlanOptions(current);
      if (issues.length) throw Error(issues.join(' '));
      if (!dataset) throw Error(dataError || 'Las efemérides aún se están cargando.');
      const transfer = calculateLunarTransfer({ dataset, departureJd: gregorianTimestampToJdTdb(current.departureTdb),
        altitudeKm: current.altitudeKm, target: current.objective, targetDistanceKm: current.targetDistanceKm });
      const evaluation = evaluateMission(design, transfer);
      result = { transfer, evaluation, designId: design.id, designSignature: designSignature(design), options: JSON.stringify(current), modelVersion: transfer.model };
      finite?.deactivate(); renderResults(); message('Transferencia recalculada. Revisa el alcance del modelo y la viabilidad de la maniobra.'); notifyPlan();
    } catch (error) { stale(); message(`Cálculo no disponible: ${error.message}`, true); }
  });
  $('#mission-destination').addEventListener('change', () => stale('Destino modificado. Recalcula la transferencia.'));
  for (const id of ['mission-altitude', 'mission-distance', 'mission-departure']) {
    $(`#${id}`).addEventListener('input', () => { stale('Parámetros modificados. Recalcula la transferencia.'); if (id === 'mission-altitude') renderAdvice(); });
  }
  $('#mission-objective').addEventListener('change', () => { updateDistanceRange(true); stale('Objetivo modificado. Recalcula la transferencia.'); });
  $('#mission-name').addEventListener('change', notifyPlan);
  $('#mission-execute').addEventListener('click', () => {
    const candidate = executionCandidate();
    if (!candidate.ready) { message(candidate.reason, true); return; }
    finite?.deactivate(); onExecuteRequest(candidate);
  });
  function currentPlan() {
    if (!design) throw Error('No hay una sonda seleccionada.');
    const plan = createMissionPlan(design, options(), $('#mission-name').value);
    if (loadedPlan?.designId === plan.designId && loadedPlan.designSignature === plan.designSignature) plan.id = loadedPlan.id;
    return plan;
  }
  $('#mission-save').addEventListener('click', () => {
    try { loadedPlan = currentPlan(); saved = saveMissionPlan(loadedPlan); refreshSaved(); $('#mission-saved').value = loadedPlan.id; message('Plan guardado localmente. El resultado se recalcula al recuperarlo.'); }
    catch (error) { message(error.message, true); }
  });
  $('#mission-export').addEventListener('click', () => {
    try {
      const plan = currentPlan();
      const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `${plan.name.replace(/[^\w-]+/g, '-').slice(0, 40)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); message('Plan exportado. Incluye la sonda y condiciones, no un resultado científico congelado.');
    } catch (error) { message(error.message, true); }
  });
  function applyPlan(plan) {
    loadedPlan = plan; $('#mission-name').value = plan.name;
    $('#mission-destination').value = plan.options.destination;
    $('#mission-objective').value = plan.options.objective;
    updateDistanceRange();
    $('#mission-altitude').value = String(plan.options.altitudeKm);
    $('#mission-distance').value = String(plan.options.targetDistanceKm);
    $('#mission-departure').value = plan.options.departureTdb;
    stale(plan.modelVersion === TRANSFER_MODEL_VERSION
      ? 'Plan recuperado. Restaura la sonda asociada si corresponde y vuelve a calcular.'
      : 'El modelo científico cambió. Los resultados anteriores no se conservan: revisa el plan y vuelve a calcular.');
    $('#mission-restore-design').hidden = design?.id === plan.designId && designSignature(design) === plan.designSignature;
  }
  $('#mission-load').addEventListener('click', () => { const plan = saved.find(p => p.id === $('#mission-saved').value); if (plan) applyPlan(plan); });
  $('#mission-import').addEventListener('click', () => $('#mission-import-file').click());
  $('#mission-import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try { if (file.size > 150000) throw Error('Archivo demasiado grande.'); applyPlan(parseMissionPlan(await file.text())); message('Plan importado y validado. Recalcula antes de usar los resultados.'); }
    catch (error) { message(`Importación rechazada: ${error.message}`, true); }
    event.target.value = '';
  });
  $('#mission-restore-design').addEventListener('click', () => {
    if (!loadedPlan) return;
    onRestoreDesign(structuredClone(loadedPlan.designSnapshot));
    $('#mission-restore-design').hidden = true; message('Sonda asociada restaurada en el Hangar. Recalcula la transferencia.');
  });
  $('#mission-focus-earth').addEventListener('click', () => trajectoryView.focus('earth'));
  $('#mission-focus-moon').addEventListener('click', () => trajectoryView.focus('moon'));
  $('#mission-touch-toggle').addEventListener('click', () => {
    const active = $('#mission-touch-toggle').getAttribute('aria-pressed') !== 'true';
    trajectoryView.setTouchInteraction(active); $('#mission-touch-toggle').setAttribute('aria-pressed', String(active));
    $('#mission-touch-toggle').textContent = active ? 'Desactivar control 3D' : 'Activar control 3D';
  });
  finite = createFiniteThrustPlanner({
    controlsHost: $('#ft-controls-host'), resultsHost: $('#ft-results-host'),
    getDataset: () => dataset, getDataError: () => dataError,
    onExecuteRequest: candidate => onExecuteRequest(candidate),
    onInvalidated: () => notifyPlan(),
    onViewChange: transfer => {
      if (transfer) { trajectoryView.setTransfer(transfer); $('#mission-stage-empty').hidden = true; $('#mission-stage-status').textContent = 'Empuje finito · propagación calculada'; }
      else if (!result) { trajectoryView.setTransfer(null); $('#mission-stage-empty').hidden = false; $('#mission-stage-status').textContent = 'Sin cálculo'; }
    }
  });
  refreshSaved(); updateExecute();
  return {
    getExecutionCandidate: executionCandidate,
    focusEarth() { trajectoryView.focus('earth'); },
    resetCamera() { trajectoryView.resetCamera(); },
    setDesign(next) {
      const changed = result && !isMissionResultCurrent(result, next, options());
      design = next; finite?.setDesign(next); $('#mission-probe').value = `${next.name} · ${number(calculateEngineering(next).dryMassKg)} kg secos`;
      renderAdvice();
      if (changed) stale('La sonda cambió. El resultado anterior se invalidó; recalcula la misión.');
      else notifyPlan();
      $('#mission-restore-design').hidden = !loadedPlan || (next.id === loadedPlan.designId && designSignature(next) === loadedPlan.designSignature);
    },
    setVisible(value) {
      trajectoryView.setVisible(value);
      if (!value && coarse) {
        trajectoryView.setTouchInteraction(false);
        $('#mission-touch-toggle').setAttribute('aria-pressed', 'false');
        $('#mission-touch-toggle').textContent = 'Activar control 3D';
      }
    },
    dispose() { disposed = true; dataAbort.abort(); trajectoryView.dispose(); host.replaceChildren(); }
  };
}
