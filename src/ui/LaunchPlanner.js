// Etapa 12E — sección «Lanzamiento»: configura el lanzador, el sitio y el ascenso, calcula con la física de
// src/lab/Launch*.js y muestra resultados. La reproducción ocurre en el Centro de Misión.
import { DEMO_LAUNCHER, payloadFromDesign } from '../lab/LaunchVehicle.js';
import { DEFAULT_GUIDANCE, DEFAULT_SCHEDULE } from '../lab/LaunchSimulation.js';
import { calculateLaunch, isLaunchResultCurrent, validateLaunchInputs } from '../lab/LaunchPlan.js';
import { createLaunchExecution } from '../lab/LaunchPlayback.js';

const number = (n, digits = 1) => Number.isFinite(n) ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(n) : 'No disponible';
const STAGE_FIELDS = [['structuralMassKg', 'Masa estructural (kg)', 1], ['propellantMassKg', 'Propelente (kg)', 1], ['thrustSeaLevelN', 'Empuje nivel del mar (N)', 1000],
  ['thrustVacuumN', 'Empuje en vacío (N)', 1000], ['ispVacuumS', 'Isp en vacío (s)', 1], ['referenceAreaM2', 'Área de referencia (m²)', 0.1], ['dragCoefficient', 'Coeficiente de arrastre Cd', 0.01]];

export function createLaunchPlanner({ host, onExecuteRequest, onInvalidated }) {
  host.classList.add('mission-planner');
  const stageBlock = index => `<details class="ft-section"><summary>Etapa ${index + 1} del lanzador</summary>${STAGE_FIELDS.map(([key, label, step]) =>
    `<label class="lab-field">${label}<input data-stage="${index}" data-key="${key}" type="number" step="${step}" min="0"></label>`).join('')}</details>`;
  host.innerHTML = `
    <div class="mission-controls lab-panel"><div class="lab-panel-heading"><span class="eyebrow">LANZAMIENTO</span><h3>Ascenso desde la Tierra</h3></div>
      <div class="lab-panel-scroll">
        <p class="mission-intro">Lanzador de dos etapas independiente del Hangar. La carga útil es la sonda actual con su masa húmeda real. Parámetros ilustrativos, no un cohete real.</p>
        <label class="lab-field">Carga útil (Hangar)<input id="ln-payload" readonly></label>
        <details class="ft-section" open><summary>Sitio y fecha</summary>
          <label class="lab-field">Latitud geodésica (°)<input id="ln-lat" type="number" min="-90" max="90" step="0.1" value="28.5"></label>
          <label class="lab-field">Longitud (°)<input id="ln-lon" type="number" min="-180" max="180" step="0.1" value="-80.6"></label>
          <label class="lab-field">Altitud de la plataforma (m)<input id="ln-alt" type="number" min="-100" max="5000" step="1" value="3"></label>
          <label class="lab-field">Fecha de lanzamiento (etiqueta UTC)<input id="ln-date" type="datetime-local" value="2026-10-10T12:00"></label>
          <label class="lab-field">Ángulo de rotación terrestre inicial (°)<input id="ln-era" type="number" min="-360" max="360" step="1" value="0"></label>
          <p class="mission-hint">El marco inercial es autoconsistente: la fecha es solo una etiqueta (sin UT1, precesión ni conexión con la Luna).</p></details>
        <details class="ft-section" open><summary>Programa de ascenso</summary>
          <label class="lab-field">Acimut de lanzamiento (° desde el norte)<input id="ln-az" type="number" min="0" max="359.9" step="1" value="90"></label>
          <label class="lab-field">Ascenso vertical (s)<input id="ln-rise" type="number" min="0" max="120" step="1" value="${DEFAULT_GUIDANCE.verticalRiseSeconds}"></label>
          <label class="lab-field">Inclinación inicial (°)<input id="ln-kick" type="number" min="0" max="45" step="0.1" value="${DEFAULT_GUIDANCE.kickDeg}"></label>
          <label class="lab-field">Duración de la inclinación (s)<input id="ln-kick-s" type="number" min="0" max="60" step="1" value="${DEFAULT_GUIDANCE.kickSeconds}"></label>
          <label class="lab-field">Cabeceo etapa 2: rampa (s)<input id="ln-ramp" type="number" min="0" max="3000" step="5" value="${DEFAULT_GUIDANCE.stage2.rampSeconds}"></label>
          <label class="lab-field">Cabeceo etapa 2: elevación final (°)<input id="ln-end-el" type="number" min="-30" max="90" step="0.5" value="${DEFAULT_GUIDANCE.stage2.endElevationDeg}"></label>
          <label class="lab-field">Primer encendido de la etapa 2 (s)<input id="ln-burn" type="number" min="1" step="1" value="${DEFAULT_SCHEDULE.ascentBurnSeconds}"></label>
          <label class="lab-field"><span><input id="ln-circ" type="checkbox" checked> Circularizar en el apogeo (consume propelente real)</span></label>
          <label class="lab-field">Elevación del empuje al circularizar (°)<input id="ln-circ-el" type="number" min="-30" max="30" step="0.5" value="${DEFAULT_SCHEDULE.circularization.elevationDeg}"></label>
          <label class="lab-field">Tramo balístico final (s)<input id="ln-coast" type="number" min="0" max="20000" step="60" value="${DEFAULT_SCHEDULE.postCoastSeconds}"></label></details>
        <details class="ft-section"><summary>Órbita objetivo</summary>
          <label class="lab-field">Perigeo mínimo sostenible (km)<input id="ln-min-perigee" type="number" min="0" step="10" value="160"></label>
          <label class="lab-field">Apogeo máximo (km)<input id="ln-max-apogee" type="number" min="100" step="50" value="2000"></label>
          <label class="lab-field">Altitud objetivo del evento (km)<input id="ln-target-alt" type="number" min="1" step="10" value="200"></label></details>
        ${stageBlock(0)}${stageBlock(1)}
        <div class="lab-two-actions"><button id="ln-calculate" type="button" class="button-primary">Calcular lanzamiento</button><button id="ln-reset" type="button">Restablecer lanzador</button></div>
        <button id="ln-execute" type="button">Reproducir en el Centro de Misión</button>
        <p id="ln-message" class="lab-message" role="status"></p>
      </div></div>
    <div class="mission-results lab-panel"><div class="lab-panel-heading"><span class="eyebrow">RESULTADOS</span><h3>Evaluación del lanzamiento</h3></div>
      <div class="lab-panel-scroll"><div id="ln-results" class="ft-results"></div></div></div>`;
  const $ = selector => host.querySelector(selector);
  const results = $('#ln-results');
  let design = null, launcher = structuredClone(DEMO_LAUNCHER), result = null, active = false;

  const message = (text, error = false) => { $('#ln-message').textContent = text; $('#ln-message').dataset.error = String(error); };
  function writeLauncher() {
    for (const input of host.querySelectorAll('[data-stage]')) input.value = launcher.stages[Number(input.dataset.stage)][input.dataset.key];
  }
  function readLauncher() {
    const next = structuredClone(launcher);
    for (const input of host.querySelectorAll('[data-stage]')) next.stages[Number(input.dataset.stage)][input.dataset.key] = Number(input.value);
    return next;
  }
  const num = id => Number($(id).value);
  function options() {
    const burn = num('#ln-burn');
    return { site: { latDeg: num('#ln-lat'), lonDeg: num('#ln-lon'), altitudeM: num('#ln-alt') }, launchDateUtc: `${$('#ln-date').value}:00Z`,
      earthRotationAngleDeg: num('#ln-era'), azimuthDeg: num('#ln-az'),
      guidance: { verticalRiseSeconds: num('#ln-rise'), kickDeg: num('#ln-kick'), kickSeconds: num('#ln-kick-s'),
        stage2: { startElevationDeg: 'auto', endElevationDeg: num('#ln-end-el'), rampSeconds: num('#ln-ramp') } },
      schedule: { ascentBurnSeconds: Number.isFinite(burn) && burn > 0 ? burn : null, postCoastSeconds: num('#ln-coast'),
        circularization: { enabled: $('#ln-circ').checked, elevationDeg: num('#ln-circ-el'), maxCoastToApogeeSeconds: 7200, maxBurnSeconds: null } },
      target: { minPerigeeAltitudeKm: num('#ln-min-perigee'), maxApogeeAltitudeKm: num('#ln-max-apogee'), targetAltitudeKm: num('#ln-target-alt'), inclinationDeg: null, inclinationToleranceDeg: 1 } };
  }
  function metric(label, value) {
    const row = document.createElement('div'); row.className = 'lab-metric';
    const term = document.createElement('span'); term.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value;
    row.append(term, strong); results.append(row);
  }
  function paragraph(text, className = 'mission-hint') { const p = document.createElement('p'); p.className = className; p.textContent = text; results.append(p); }
  function updateButtons() {
    $('#ln-calculate').disabled = !design;
    $('#ln-execute').disabled = !(result && design && isLaunchResultCurrent(result, design, readLauncher(), options()) && result.simulation.knots.length > 2);
  }
  function invalidate(text) {
    result = null; results.replaceChildren();
    if (text) message(text);
    if (active) { active = false; onInvalidated?.(); }
    updateButtons();
  }
  function render() {
    results.replaceChildren();
    if (!result) return;
    const sim = result.simulation, orbit = sim.orbit, el = orbit.elements;
    const heading = document.createElement('h4'); heading.textContent = 'Resultado del lanzamiento'; results.append(heading);
    const status = document.createElement('div'); status.className = 'mission-status'; status.textContent = orbit.outcome ?? orbit.classification; results.append(status);
    for (const reason of orbit.reasons) paragraph(reason);
    metric('Estado de la integración', sim.status);
    metric('Carga útil', `${result.payload.name} · ${number(sim.payloadMassKg, 1)} kg`);
    metric('Masa al despegue', `${number(sim.stack.liftoffMassKg, 0)} kg`);
    metric('Empuje / peso al despegue', number(sim.stack.liftoffThrustToWeight, 2));
    metric('Δv ideal de Tsiolkovsky (referencia)', `${number(sim.stack.idealDeltaVMS, 0)} m/s`);
    metric('Δv propulsivo integrado', `${number(sim.totals.propulsiveDeltaVMS, 0)} m/s`);
    metric('Propelente consumido', `${number(sim.totals.propellantConsumedKg, 0)} kg`);
    metric('Propelente restante (etapa 2)', `${number(sim.final.fuelKg, 0)} kg`);
    if (sim.maxQ) metric('Max-Q', `${number(sim.maxQ.dynamicPressurePa / 1000, 1)} kPa · t = ${number(sim.maxQ.elapsedSeconds, 1)} s · ${number(sim.maxQ.altitudeKm, 1)} km`);
    if (sim.burnout) metric('Tras el apagado de la etapa 2', sim.burnout.classification);
    if (el) {
      metric('Semieje mayor', el.bound ? `${number(el.semiMajorAxisKm, 0)} km` : 'No ligada');
      metric('Excentricidad', number(el.eccentricity, 4));
      metric('Inclinación', `${number(el.inclinationDeg, 2)}°`);
      metric('Perigeo (altitud)', Number.isFinite(orbit.minimumAltitudeKm) ? `${number(orbit.minimumAltitudeKm, 1)} km` : `${number(el.periapsisRadiusKm - 6378.137, 1)} km (esférico)`);
      metric('Apogeo (altitud)', Number.isFinite(orbit.apogeeAltitudeKm) ? `${number(orbit.apogeeAltitudeKm, 1)} km` : 'No disponible');
      metric('Energía específica', `${number(el.specificEnergyKm2S2, 3)} km²/s²`);
    }
    for (const stage of sim.stages) metric(stage.name, `${number(stage.burnSeconds, 1)} s encendida · ${number(stage.propellantConsumedKg, 0)} kg · ${stage.cutoffReason}`);
    paragraph('Una órbita alcanzada según el modelo no certifica una misión operativa: la guía, el arrastre y la masa del lanzador son idealizados.');
    const details = document.createElement('details'); details.className = 'mission-details';
    const summaryEl = document.createElement('summary'); summaryEl.textContent = 'Diagnósticos numéricos y límites'; details.append(summaryEl);
    const p = document.createElement('p'); p.className = 'mission-hint';
    p.textContent = `DOPRI54 con estado de 8 componentes. Pasos aceptados ${sim.diagnostics.acceptedSteps}, rechazados ${sim.diagnostics.rejectedSteps}, evaluaciones ${sim.diagnostics.functionEvaluations}. Paso mínimo ${number(sim.diagnostics.minStepSeconds, 4)} s, máximo ${number(sim.diagnostics.maxStepSeconds, 2)} s. Tolerancias: abs [1e-6 km, 1e-9 km/s, 1e-6 kg], rel 1e-10.`;
    details.append(p);
    for (const note of ['Masa puntual con guía idealizada: no hay dinámica de actitud, flexión, oscilación de propelente ni cargas estructurales.',
      'Atmósfera US-1976 corrotante sin viento; Cd constante; sin Mach ni arrastre lateral.', 'Marco inercial propio: no se conecta con la Luna ni con efemérides.']) {
      const q = document.createElement('p'); q.className = 'mission-hint'; q.textContent = note; details.append(q);
    }
    results.append(details);
  }
  function payloadSummary() {
    if (!design) return;
    const payload = payloadFromDesign(design);
    $('#ln-payload').value = `${payload.name} · ${number(payload.massKg, 1)} kg (seca ${number(payload.dryMassKg, 1)} + propelente ${number(payload.fuelKg, 1)})`;
  }
  function calculate() {
    try {
      const current = options(), currentLauncher = readLauncher();
      const issues = validateLaunchInputs({ design, launcher: currentLauncher, options: current });
      if (issues.length) throw Error(issues.join(' '));
      result = calculateLaunch({ design, launcher: currentLauncher, options: current });
      active = false; render();
      message(result.simulation.knots.length > 2 ? 'Lanzamiento calculado. Revisa la clasificación antes de reproducirlo.' : 'El vehículo no despega: no hay trayectoria que reproducir.');
    } catch (error) { result = null; results.replaceChildren(); message(`Cálculo no disponible: ${error.message}`, true); }
    updateButtons();
  }
  host.addEventListener('input', event => { if (event.target.matches('input')) invalidate('Parámetros modificados. Recalcula el lanzamiento.'); });
  $('#ln-calculate').addEventListener('click', calculate);
  $('#ln-reset').addEventListener('click', () => { launcher = structuredClone(DEMO_LAUNCHER); writeLauncher(); invalidate('Lanzador restablecido. Recalcula.'); });
  $('#ln-execute').addEventListener('click', () => {
    try {
      if (!result || !design || !isLaunchResultCurrent(result, design, readLauncher(), options())) throw Error('El cálculo quedó obsoleto. Recalcula.');
      const execution = createLaunchExecution({ result, design }); // valida antes de entregar
      active = true; onExecuteRequest({ kind: 'launch', ready: true, result, design, name: execution.name });
    } catch (error) { message(error.message, true); }
  });
  writeLauncher(); updateButtons();
  return {
    setDesign(next) {
      const changed = result && !isLaunchResultCurrent(result, next, readLauncher(), options());
      design = next; payloadSummary();
      if (changed) invalidate('La sonda cambió. El resultado del lanzamiento se invalidó; recalcula.'); else updateButtons();
    },
    isActive: () => active,
    deactivate() { active = false; },
    dispose() { host.replaceChildren(); }
  };
}
