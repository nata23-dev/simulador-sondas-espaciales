// Etapa 12D — controles mínimos de «Maniobra de empuje finito» dentro del Planificador.
// Solo configura, calcula y muestra resultados; la física vive en src/lab/FiniteThrust*.js.
import { calculateFiniteThrustManeuver, getPropulsionSystem, isFiniteThrustResultCurrent, validateFiniteThrustOptions } from '../lab/FiniteThrustPlan.js';
import { createFiniteThrustExecution } from '../lab/FiniteThrustPlayback.js';
import { THRUST_DIRECTIONS, THRUST_DIRECTION_LABELS, MAX_BURNS } from '../lab/FiniteThrustDynamics.js';

const number = (n, digits = 1) => Number.isFinite(n) ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(n) : 'No disponible';
const STATUS_LABELS = { completed: 'completado', depleted: 'propelente agotado', skipped: 'omitido · sin propelente' };

function burnRowTemplate(index) {
  return `<div class="ft-burn" data-burn><strong class="ft-burn-title">Encendido ${index + 1}</strong>
    <label class="lab-field">Inicio (h tras la salida)<input data-f="start" type="number" min="0" step="0.01" value="1"></label>
    <label class="lab-field">Duración (min)<input data-f="duration" type="number" min="0.0167" step="0.1" value="5"></label>
    <label class="lab-field">Acelerador (%)<input data-f="throttle" type="number" min="1" max="100" step="1" value="100"></label>
    <label class="lab-field">Dirección<select data-f="direction">${THRUST_DIRECTIONS.map(id => `<option value="${id}">${THRUST_DIRECTION_LABELS[id]}</option>`).join('')}</select></label>
    <div class="ft-vector" data-f="vector-box" hidden>
      <label class="lab-field">X<input data-f="vx" type="number" step="any" value="1"></label>
      <label class="lab-field">Y<input data-f="vy" type="number" step="any" value="0"></label>
      <label class="lab-field">Z<input data-f="vz" type="number" step="any" value="0"></label>
    </div>
    <button type="button" data-f="remove">Quitar</button></div>`;
}

export function createFiniteThrustPlanner({ controlsHost, resultsHost, getDataset, getDataError, onExecuteRequest, onInvalidated, onViewChange }) {
  controlsHost.innerHTML = `
    <details class="ft-section" open><summary>Maniobra de empuje finito</summary>
      <p class="mission-hint">Modalidad B, independiente de la planificación impulsiva. Parte de una órbita terrestre circular directa en el plano lunar, ya adquirida; integra empuje, masa variable y gravedad Tierra–Luna. No sustituye ni valida la transferencia impulsiva.</p>
      <label class="lab-field">Altitud de órbita terrestre inicial (km)<input id="ft-altitude" type="number" min="200" max="150000" step="10" value="100000"></label>
      <label class="lab-field">Salida, calendario TDB<input id="ft-departure" type="datetime-local" min="2026-10-01T00:00" max="2026-10-31T23:59" value="2026-10-15T12:00"></label>
      <label class="lab-field">Fase orbital inicial (° desde la dirección lunar)<input id="ft-phase" type="number" min="0" max="359.99" step="1" value="0"></label>
      <label class="lab-field">Horizonte de propagación (días)<input id="ft-horizon" type="number" min="0.05" max="30" step="0.05" value="4"></label>
      <div id="ft-burns"></div>
      <div class="lab-two-actions"><button id="ft-add" type="button">Añadir encendido</button><button id="ft-calculate" type="button" class="button-primary">Calcular propagación</button></div>
      <button id="ft-execute" type="button">Reproducir en el Centro de Misión</button>
      <p id="ft-message" class="lab-message" role="status"></p>
    </details>`;
  resultsHost.innerHTML = '<div id="ft-results" class="ft-results"></div>';
  const $ = selector => controlsHost.querySelector(selector);
  const results = resultsHost.querySelector('#ft-results');
  let design = null, result = null, viewTransfer = null, active = false;

  function message(text, error = false) { $('#ft-message').textContent = text; $('#ft-message').dataset.error = String(error); }
  function rows() { return [...controlsHost.querySelectorAll('[data-burn]')]; }
  function renumber() { rows().forEach((row, index) => { row.querySelector('.ft-burn-title').textContent = `Encendido ${index + 1}`; row.querySelector('[data-f="remove"]').disabled = rows().length === 1; }); $('#ft-add').disabled = rows().length >= MAX_BURNS; }
  function addBurn(values) {
    const holder = document.createElement('div'); holder.innerHTML = burnRowTemplate(rows().length);
    const row = holder.firstElementChild; $('#ft-burns').append(row);
    if (values) { row.querySelector('[data-f="start"]').value = values.start; row.querySelector('[data-f="duration"]').value = values.duration; }
    row.querySelector('[data-f="direction"]').addEventListener('change', event => { row.querySelector('[data-f="vector-box"]').hidden = event.target.value !== 'inertial'; invalidate('Parámetros modificados. Recalcula la propagación.'); });
    row.querySelector('[data-f="remove"]').addEventListener('click', () => { row.remove(); renumber(); invalidate('Programa modificado. Recalcula la propagación.'); });
    renumber();
  }
  function options() {
    const burns = rows().map(row => {
      const field = name => row.querySelector(`[data-f="${name}"]`);
      const type = field('direction').value;
      return { startSeconds: Number(field('start').value) * 3600, durationSeconds: Number(field('duration').value) * 60,
        throttle: Number(field('throttle').value) / 100,
        direction: type === 'inertial' ? { type, vector: [Number(field('vx').value), Number(field('vy').value), Number(field('vz').value)] } : { type } };
    });
    return { altitudeKm: Number($('#ft-altitude').value), departureTdb: $('#ft-departure').value, phaseDeg: Number($('#ft-phase').value),
      horizonSeconds: Number($('#ft-horizon').value) * 86400, burns };
  }
  function metric(parent, label, value) {
    const row = document.createElement('div'); row.className = 'lab-metric';
    const term = document.createElement('span'); term.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value;
    row.append(term, strong); parent.append(row);
  }
  function paragraph(parent, text, className = 'mission-hint') { const p = document.createElement('p'); p.className = className; p.textContent = text; parent.append(p); }
  function invalidate(text) {
    const had = Boolean(result);
    result = null; viewTransfer = null; results.replaceChildren();
    if (text) message(text);
    if (had) onViewChange?.(null);
    if (active) { active = false; onInvalidated?.(); }
    updateButtons();
  }
  function updateButtons() {
    $('#ft-calculate').disabled = !design;
    $('#ft-execute').disabled = !(result && design && isFiniteThrustResultCurrent(result, design, options()));
  }
  function render() {
    results.replaceChildren();
    if (!result) return;
    const { comparison: c, propagation: p, system, initial } = result;
    const heading = document.createElement('h4'); heading.textContent = 'Maniobra de empuje finito · resultados'; results.append(heading);
    const status = document.createElement('div'); status.className = 'mission-status'; status.dataset.status = 'VIABLE SEGÚN EL MODELO'; status.textContent = result.status; results.append(status);
    paragraph(results, 'Propagación numérica de las maniobras programadas. No declara que se alcance la Luna ni equivale a la planificación impulsiva; el encuentro debe comprobarse con la distancia lunar de la tabla.');
    metric(results, 'Motor', `${system.engine.name} · ${system.engine.kind}`);
    metric(results, 'Empuje / Isp', `${number(system.engine.thrustN, 3)} N · ${number(system.engine.ispS, 0)} s`);
    metric(results, 'Potencia requerida / nominal', `${number(system.requiredPowerW)} / ${number(system.generationW)} W`);
    metric(results, 'Masa inicial / seca', `${number(system.wetMassKg)} / ${number(system.dryMassKg)} kg`);
    metric(results, 'Δv impulsivo presupuestado', c.plannedDeltaVMS == null ? 'No disponible' : `${number(c.plannedDeltaVMS, 2)} m/s`);
    metric(results, 'Δv propulsivo acumulado (integrado)', `${number(c.integratedDeltaVMS, 2)} m/s`);
    metric(results, 'Cambio de velocidad observado', c.observedVelocityChangeMS == null ? 'No disponible' : `${number(c.observedVelocityChangeMS, 2)} m/s`);
    metric(results, 'Duración total de encendido', `${number(c.burnSeconds / 60, 2)} min`);
    metric(results, 'Combustible consumido', `${number(c.fuelConsumedKg, 3)} kg`);
    metric(results, 'Combustible restante', `${number(p.final.fuelKg, 3)} kg`);
    metric(results, 'Masa final', `${number(c.finalMassKg, 3)} kg`);
    metric(results, 'Distancia final al centro lunar', result.finalLunarDistanceKm == null ? 'No disponible' : `${number(result.finalLunarDistanceKm, 0)} km`);
    metric(results, 'Diferencia de posición vs. sin empuje', `${number(c.positionDifferenceFromBallisticKm, 1)} km`);
    metric(results, 'Diferencia vs. referencia impulsiva', `${number(c.positionDifferenceFromImpulsiveKm, 1)} km · ${number(c.velocityDifferenceFromImpulsiveMS, 2)} m/s`);
    paragraph(results, c.note);
    const burns = document.createElement('div'); burns.className = 'mission-notes';
    p.burns.forEach((burn, index) => paragraph(burns, `Encendido ${index + 1}: ${STATUS_LABELS[burn.status]} · ${THRUST_DIRECTION_LABELS[burn.direction.type]} · ${number(burn.effectiveDurationSeconds / 60, 2)} min · ${number(burn.fuelConsumedKg, 3)} kg · Δv ${number(burn.propulsiveDeltaVMS, 2)} m/s · masa ${number(burn.massBeforeKg, 2)} → ${number(burn.massAfterKg, 2)} kg`, ''));
    results.append(burns);
    const details = document.createElement('details'); details.className = 'mission-details';
    const summary = document.createElement('summary'); summary.textContent = 'Diagnósticos numéricos y límites'; details.append(summary);
    paragraph(details, `DOPRI54, estado de 8 componentes (r, v, m, Δv). Pasos aceptados ${p.diagnostics.acceptedSteps}, rechazados ${p.diagnostics.rejectedSteps}, evaluaciones ${p.diagnostics.functionEvaluations}. Paso mínimo ${number(p.diagnostics.minStepSeconds, 2)} s, máximo ${number(p.diagnostics.maxStepSeconds, 0)} s. Residuo de masa ${p.diagnostics.maxMassResidualKg.toExponential(2)} kg; residuo de Δv ${p.diagnostics.maxDeltaVResidualMS.toExponential(2)} m/s. Estado inicial: radio ${number(initial.radiusKm, 1)} km, velocidad circular ${number(initial.circularSpeedKmS, 4)} km/s.`);
    for (const note of result.limitations) paragraph(details, note);
    results.append(details);
  }
  function calculate() {
    try {
      if (!design) throw Error('No hay una sonda seleccionada.');
      const dataset = getDataset();
      if (!dataset) throw Error(getDataError() ? `Efemérides lunares no disponibles: ${getDataError()}` : 'Las efemérides aún se están cargando.');
      const current = options();
      const issues = validateFiniteThrustOptions(current);
      if (issues.length) throw Error(issues.join(' '));
      const next = calculateFiniteThrustManeuver({ dataset, design, options: current });
      result = next;
      viewTransfer = createFiniteThrustExecution({ result: next, design, dataset }).transfer;
      active = false; render(); onViewChange?.(viewTransfer);
      message('Propagación calculada. Compara el Δv presupuestado, el acumulado y la distancia lunar antes de reproducirla.');
    } catch (error) { result = null; viewTransfer = null; results.replaceChildren(); onViewChange?.(null); message(`Cálculo no disponible: ${error.message}`, true); }
    updateButtons();
  }
  $('#ft-calculate').addEventListener('click', calculate);
  $('#ft-add').addEventListener('click', () => { addBurn(); invalidate('Programa modificado. Recalcula la propagación.'); });
  $('#ft-execute').addEventListener('click', () => {
    try {
      const dataset = getDataset();
      if (!result || !design || !dataset || !isFiniteThrustResultCurrent(result, design, options())) throw Error('El cálculo quedó obsoleto. Recalcula la propagación.');
      active = true; onExecuteRequest({ kind: 'finite-thrust', ready: true, result, design, dataset, name: 'Maniobra de empuje finito' });
    } catch (error) { message(error.message, true); }
  });
  for (const id of ['ft-altitude', 'ft-departure', 'ft-phase', 'ft-horizon']) $(`#${id}`).addEventListener('input', () => invalidate('Parámetros modificados. Recalcula la propagación.'));
  controlsHost.addEventListener('input', event => { if (event.target.closest?.('[data-burn]') && event.target.dataset.f !== 'direction') invalidate('Parámetros modificados. Recalcula la propagación.'); });
  addBurn(); updateButtons();
  return {
    setDesign(next) {
      const changed = result && !isFiniteThrustResultCurrent(result, next, options());
      design = next;
      const system = getPropulsionSystem(next);
      $('#ft-calculate').title = system.ready ? '' : system.issues.join(' ');
      if (changed) invalidate('La sonda cambió. El resultado de empuje finito se invalidó; recalcula.');
      else updateButtons();
      if (!system.ready && !result) message(`Propulsión no disponible: ${system.issues[0]}`, true);
    },
    isActive: () => active,
    deactivate() { active = false; },
    getViewTransfer: () => viewTransfer,
    dispose() { controlsHost.replaceChildren(); resultsHost.replaceChildren(); }
  };
}
