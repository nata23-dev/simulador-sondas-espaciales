// Etapa 12F — sección «Descenso y aterrizaje»: elige un destino del registro multicuerpo, configura módulo, órbita y perfil de descenso,
// calcula con src/lab/BodyLanding*.js y muestra resultados. La reproducción ocurre en el Centro de Misión.
import { CAPABILITY, getBodyProfile, landingCapability, listBodyProfiles } from '../lab/CelestialBodyMissionRegistry.js';
import { DEMO_LANDER, payloadFromDesign } from '../lab/BodyLandingVehicle.js';
import { DEFAULT_DESCENT_ORBIT, DEFAULT_LANDING_SCHEDULE } from '../lab/BodyLandingSimulation.js';
import { DEFAULT_LANDING_GUIDANCE, circularSpeedKmS, createLandingEnvironment, surfaceGravityMS2 } from '../lab/BodyLandingDynamics.js';
import { calculateLanding, isLandingResultCurrent, validateLandingInputs } from '../lab/BodyLandingPlan.js';
import { createLandingExecution } from '../lab/BodyLandingPlayback.js';

const number = (n, digits = 1) => Number.isFinite(n) ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(n) : 'No disponible';
const PARENT_NAME = id => { try { return getBodyProfile(id).name; } catch { return id; } };

export function createLandingPlanner({ host, onExecuteRequest, onInvalidated }) {
  host.classList.add('mission-planner');
  host.innerHTML = `
    <div class="mission-controls lab-panel"><div class="lab-panel-heading"><span class="eyebrow">DESCENSO Y ATERRIZAJE</span><h3>Destino multicuerpo</h3></div>
      <div class="lab-panel-scroll">
        <p class="mission-intro">Motor general de descenso propulsado: usa el GM y el radio del destino elegido. Solo se calcula donde el modelo de vacío es justificable.</p>
        <label class="lab-field">Destino<select id="ld-body"></select></label>
        <div id="ld-body-info" class="ft-results" aria-live="polite"></div>
        <label class="lab-field">Carga útil (sonda activa)<input id="ld-payload" readonly></label>
        <details class="ft-section" open><summary>Órbita inicial local</summary>
          <label class="lab-field">Altitud del periapsis (km)<input id="ld-peri" type="number" min="1" step="1" value="${DEFAULT_DESCENT_ORBIT.periapsisAltitudeKm}"></label>
          <label class="lab-field">Altitud del apoapsis (km)<input id="ld-apo" type="number" min="1" step="1" value="${DEFAULT_DESCENT_ORBIT.apoapsisAltitudeKm}"></label>
          <label class="lab-field">Inclinación (°)<input id="ld-inc" type="number" min="0" max="180" step="1" value="${DEFAULT_DESCENT_ORBIT.inclinationDeg}"></label>
          <label class="lab-field">Ascensión del nodo (°)<input id="ld-raan" type="number" min="-360" max="360" step="1" value="${DEFAULT_DESCENT_ORBIT.raanDeg}"></label>
          <label class="lab-field">Anomalía verdadera inicial (°)<input id="ld-nu" type="number" min="-360" max="360" step="1" value="${DEFAULT_DESCENT_ORBIT.trueAnomalyDeg}"></label>
          <label class="lab-field">Época (etiqueta UTC)<input id="ld-epoch" type="datetime-local" value="2026-10-10T12:00"></label>
          <p class="mission-hint">La orientación es arbitraria en un marco local: no está conectada con el marco astronómico real del cuerpo ni con ICRF.</p>
          <div id="ld-orbit-info" class="ft-results"></div></details>
        <details class="ft-section" open><summary>Maniobras y perfil de descenso</summary>
          <label class="lab-field">Periapsis de descenso (km)<input id="ld-descent-peri" type="number" min="1" step="1" value="${DEFAULT_LANDING_GUIDANCE.descentPeriapsisAltitudeKm}"></label>
          <label class="lab-field">Espera antes de salir de órbita (s)<input id="ld-delay" type="number" min="0" step="60" value="${DEFAULT_LANDING_GUIDANCE.deorbitDelaySeconds}"></label>
          <label class="lab-field">Velocidad vertical objetivo de contacto (m/s)<input id="ld-td" type="number" min="0.1" step="0.1" value="${DEFAULT_LANDING_GUIDANCE.touchdownSpeedMS}"></label>
          <label class="lab-field">Fracción de deceleración vertical<input id="ld-frac" type="number" min="0.05" max="1" step="0.05" value="${DEFAULT_LANDING_GUIDANCE.descentDecelFraction}"></label></details>
        <details class="ft-section" open><summary>Módulo de aterrizaje (ilustrativo · editable)</summary>
          <p class="mission-hint">Parámetros editables del módulo demostrativo. Los valores iniciales son ilustrativos; «Restablecer módulo» recupera el preset.</p>
          ${[['busKg', 'Masa del cuerpo (kg)'], ['tankageKg', 'Masa de depósitos (kg)'], ['landingGearKg', 'Masa de patas (kg)']].map(([k, l]) => `<label class="lab-field">${l}<input data-lander="structure.${k}" type="number" min="0" step="10"></label>`).join('')}
          <label class="lab-field">Propelente del módulo (kg)<input data-lander="propellantMassKg" type="number" min="0" step="50"></label>
          <label class="lab-field">Empuje máximo (N)<input data-lander="engine.thrustMaxN" type="number" min="1" step="100"></label>
          <label class="lab-field">Isp (s)<input data-lander="engine.ispS" type="number" min="1" step="1"></label>
          <label class="lab-field">Acelerador mínimo (fracción)<input data-lander="engine.throttleMin" type="number" min="0.01" max="1" step="0.01"></label>
          <label class="lab-field"><span><input data-lander-bool="engine.throttleable" type="checkbox"> Motor estrangulable</span></label></details>
        <div class="lab-two-actions"><button id="ld-calculate" type="button" class="button-primary">Calcular descenso</button><button id="ld-reset" type="button">Restablecer módulo</button></div>
        <button id="ld-execute" type="button">Reproducir en el Centro de Misión</button>
        <p id="ld-message" class="lab-message" role="status"></p>
      </div></div>
    <div class="mission-results lab-panel"><div class="lab-panel-heading"><span class="eyebrow">RESULTADOS</span><h3>Evaluación del descenso</h3></div>
      <div class="lab-panel-scroll"><div id="ld-results" class="ft-results"></div></div></div>`;
  const $ = selector => host.querySelector(selector);
  const results = $('#ld-results'), select = $('#ld-body');
  let design = null, lander = structuredClone(DEMO_LANDER), result = null, active = false, bodyId = '301';

  // El selector se deriva del registro (catálogos reales): ninguna lista manual.
  for (const profile of listBodyProfiles()) {
    const option = document.createElement('option'); option.value = profile.id;
    option.textContent = `${profile.name} (${profile.parentId ? PARENT_NAME(profile.parentId) : 'estrella'}) · ${landingCapability(profile).state}`;
    select.append(option);
  }
  select.value = bodyId;

  const message = (text, error = false) => { $('#ld-message').textContent = text; $('#ld-message').dataset.error = String(error); };
  const deep = (object, path) => path.split('.').reduce((o, k) => o[k], object);
  function setDeep(object, path, value) { const keys = path.split('.'); const last = keys.pop(); keys.reduce((o, k) => o[k], object)[last] = value; }
  const writeLander = () => {
    for (const input of host.querySelectorAll('[data-lander]')) input.value = deep(lander, input.dataset.lander);
    for (const input of host.querySelectorAll('[data-lander-bool]')) input.checked = Boolean(deep(lander, input.dataset.landerBool));
  };
  function readLander() {
    const next = structuredClone(lander);
    for (const input of host.querySelectorAll('[data-lander]')) setDeep(next, input.dataset.lander, Number(input.value));
    for (const input of host.querySelectorAll('[data-lander-bool]')) setDeep(next, input.dataset.landerBool, input.checked);
    return next;
  }
  const num = id => Number($(id).value);
  const options = () => ({ orbit: { periapsisAltitudeKm: num('#ld-peri'), apoapsisAltitudeKm: num('#ld-apo'), inclinationDeg: num('#ld-inc'), raanDeg: num('#ld-raan'), argumentOfPeriapsisDeg: 0, trueAnomalyDeg: num('#ld-nu') },
    epochUtc: `${$('#ld-epoch').value}:00Z`, guidance: { descentPeriapsisAltitudeKm: num('#ld-descent-peri'), deorbitDelaySeconds: num('#ld-delay'), touchdownSpeedMS: num('#ld-td'), descentDecelFraction: num('#ld-frac') },
    schedule: { ...DEFAULT_LANDING_SCHEDULE } });
  function row(container, label, value) {
    const el = document.createElement('div'); el.className = 'lab-metric'; const term = document.createElement('span'); term.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value; el.append(term, strong); container.append(el);
  }
  function paragraph(container, text, className = 'mission-hint') { const p = document.createElement('p'); p.className = className; p.textContent = text; container.append(p); }
  function renderBodyInfo() {
    const info = $('#ld-body-info'), orbitInfo = $('#ld-orbit-info'); info.replaceChildren(); orbitInfo.replaceChildren();
    const profile = getBodyProfile(bodyId), cap = landingCapability(profile);
    const status = document.createElement('div'); status.className = 'mission-status'; status.textContent = `${cap.state} · ${cap.group}`; info.append(status);
    paragraph(info, cap.reason);
    row(info, 'Identificador', `${profile.id}${profile.catalogKey ? ` (${profile.catalogKey})` : ''}`);
    row(info, 'Cuerpo principal', profile.parentId ? PARENT_NAME(profile.parentId) : 'ninguno');
    row(info, 'GM', profile.gm ? `${number(profile.gm.value, 5)} km³/s²${profile.gm.sigma ? ` (±${profile.gm.sigma})` : ''}` : 'No disponible');
    row(info, 'Radio medio', profile.radiusKm ? `${number(profile.radiusKm.value, 2)} km` : 'No disponible');
    if (profile.gm && profile.radiusKm) {
      const env = createLandingEnvironment(profile);
      row(info, 'Gravedad superficial', `${number(surfaceGravityMS2(env), 3)} m/s²`);
      const alt = num('#ld-peri');
      if (Number.isFinite(alt) && alt > 0) {
        const v = circularSpeedKmS(env, alt), period = 2 * Math.PI * Math.sqrt((env.radiusKm + alt) ** 3 / env.mu);
        row(orbitInfo, 'Velocidad circular', `${number(v, 4)} km/s`); row(orbitInfo, 'Período circular', `${number(period, 0)} s`);
        row(orbitInfo, 'Energía específica', `${number(-env.mu / (2 * (env.radiusKm + alt)), 4)} km²/s²`);
      }
    }
    row(info, 'Atmósfera (cualitativa)', `${profile.atmosphere.atmosphere} · ${profile.atmosphere.note}`);
    row(info, 'Rotación', profile.rotation ? 'declarada' : 'no definida en el proyecto');
    row(info, 'Efemérides', `${profile.ephemeris.kind}${profile.ephemeris.coverageTdb ? `, TDB ${profile.ephemeris.coverageTdb.join(' → ')}` : ''}`);
    if (cap.missing.length) paragraph(info, `Datos que faltan: ${cap.missing.join('; ')}.`);
  }
  function updateButtons() {
    const cap = landingCapability(bodyId), available = [CAPABILITY.operational, CAPABILITY.experimental].includes(cap.state);
    $('#ld-calculate').disabled = !design || !available;
    $('#ld-execute').disabled = !(result && design && isLandingResultCurrent(result, design, bodyId, readLander(), options()) && result.simulation.knots.length > 2);
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
    const sim = result.simulation, c = sim.contact;
    const heading = document.createElement('h4'); heading.textContent = `Resultado del descenso en ${sim.bodyName}`; results.append(heading);
    const status = document.createElement('div'); status.className = 'mission-status'; status.textContent = sim.outcome; results.append(status);
    for (const reason of sim.reasons) paragraph(results, reason);
    row(results, 'Estado de la integración', sim.status);
    row(results, 'Carga útil', `${result.payload.name} · ${number(sim.payloadMassKg, 1)} kg`);
    row(results, 'Masa inicial / seca', `${number(sim.masses.wetKg, 0)} / ${number(sim.masses.dryKg, 0)} kg`);
    row(results, 'Empuje / peso al iniciar el frenado', number(sim.diagnostics.thrustToWeightPdi, 2));
    row(results, 'Δv propulsivo integrado', `${number(sim.totals.propulsiveDeltaVMS, 0)} m/s`);
    row(results, 'Propelente consumido', `${number(sim.totals.propellantConsumedKg, 0)} kg de ${number(sim.masses.propellantKg, 0)} kg`);
    row(results, 'Propelente restante', `${number(sim.final.fuelKg, 0)} kg`);
    row(results, 'Duración', `${number(sim.endSeconds, 0)} s`);
    if (c) {
      row(results, 'Contacto: velocidad vertical', `${number(c.verticalMS, 2)} m/s`); row(results, 'Contacto: velocidad horizontal', `${number(c.horizontalMS, 2)} m/s`);
      row(results, 'Contacto: coordenadas (marco local)', `${number(c.surfaceCoordinates.latitudeDeg, 2)}° / ${number(c.surfaceCoordinates.longitudeDeg, 2)}°`);
      row(results, 'Contacto: coordenadas del cuerpo', c.surfaceCoordinates.bodyFixed);
    }
    for (const seg of sim.segments) row(results, seg.label, `T+${number(seg.startSeconds, 0)} → ${number(seg.endSeconds, 0)} s`);
    paragraph(results, 'Un aterrizaje suave según el modelo no certifica una misión operativa: no hay modelo de patas, materiales ni impacto, y los umbrales son del simulador.');
    const details = document.createElement('details'); details.className = 'mission-details';
    const summaryEl = document.createElement('summary'); summaryEl.textContent = 'Diagnósticos numéricos y límites'; details.append(summaryEl);
    paragraph(details, `DOPRI54 de 8 componentes. Pasos aceptados ${sim.diagnostics.acceptedSteps}, rechazados ${sim.diagnostics.rejectedSteps}, evaluaciones ${sim.diagnostics.functionEvaluations}.`);
    const ct = sim.diagnostics.contactTolerances;
    if (ct) paragraph(details, `Tolerancias del contacto (magnitudes distintas): predicado geométrico |r| < R − ${ct.predicateToleranceKm} km; intervalo temporal de localización ${ct.bracketSeconds?.toExponential(2)} s (límite ${ct.bracketLimitSeconds} s); cota espacial |v_r|·Δt = ${(ct.spatialBoundKm * 1e6).toFixed(3)} mm; residuo radial observado ${(ct.observedResidualKm * 1e6).toFixed(3)} mm; error de integración gobernado por DOPRI54 (abs. ${ct.integrationTolerance.absPositionKm} km, rel. ${ct.integrationTolerance.rel}).`);
    for (const note of [sim.frame.warning, 'Sin atmósfera, J2, terceros cuerpos, actitud ni rotación del cuerpo (no definida en el proyecto).', 'Guiado idealizado en lazo cerrado con motor estrangulable y reencendido ilimitado.']) paragraph(details, note);
    results.append(details);
  }
  function payloadSummary() {
    if (!design) return;
    const payload = payloadFromDesign(design);
    $('#ld-payload').value = `${payload.name} · ${number(payload.massKg, 1)} kg (seca ${number(payload.dryMassKg, 1)} + propelente ${number(payload.fuelKg, 1)})`;
  }
  function calculate() {
    try {
      const current = options(), currentLander = readLander();
      const issues = validateLandingInputs({ bodyId, design, lander: currentLander, options: current });
      if (issues.length) throw Error(issues.join(' '));
      result = calculateLanding({ bodyId, design, lander: currentLander, options: current });
      active = false; render(); message('Descenso calculado. Revisa el resultado antes de reproducirlo.');
    } catch (error) { result = null; results.replaceChildren(); message(`Cálculo no disponible: ${error.message}`, true); }
    updateButtons();
  }
  host.addEventListener('input', event => { if (event.target.matches('input')) { renderBodyInfo(); invalidate('Parámetros modificados. Recalcula el descenso.'); } });
  select.addEventListener('change', () => {
    bodyId = select.value; renderBodyInfo();
    const cap = landingCapability(bodyId);
    invalidate([CAPABILITY.operational, CAPABILITY.experimental].includes(cap.state) ? 'Destino cambiado. Recalcula el descenso.' : `${cap.state}: ${cap.reason}`);
  });
  $('#ld-calculate').addEventListener('click', calculate);
  $('#ld-reset').addEventListener('click', () => { lander = structuredClone(DEMO_LANDER); writeLander(); invalidate('Módulo restablecido. Recalcula.'); });
  $('#ld-execute').addEventListener('click', () => {
    try {
      if (!result || !design || !isLandingResultCurrent(result, design, bodyId, readLander(), options())) throw Error('El cálculo quedó obsoleto. Recalcula.');
      const execution = createLandingExecution({ result, design });
      active = true; onExecuteRequest({ kind: 'landing', ready: true, result, design, name: execution.name });
    } catch (error) { message(error.message, true); }
  });
  writeLander(); renderBodyInfo(); updateButtons();
  const initial = landingCapability(bodyId); message(`${initial.state}: ${initial.reason}`);
  return {
    setDesign(next) {
      const changed = result && !isLandingResultCurrent(result, next, bodyId, readLander(), options());
      design = next; payloadSummary();
      if (changed) invalidate('La sonda cambió. El resultado del descenso se invalidó; recalcula.'); else updateButtons();
    },
    isActive: () => active, deactivate() { active = false; }, getBodyId: () => bodyId, dispose() { host.replaceChildren(); }
  };
}
