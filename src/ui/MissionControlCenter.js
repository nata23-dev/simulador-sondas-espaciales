import { createMissionExecution, createPlaybackClock, sampleMissionExecution } from '../lab/MissionPlayback.js';
import { deriveMissionTelemetry } from '../lab/MissionTelemetry.js';
import { createFiniteThrustExecution, deriveFiniteThrustTelemetry, sampleFiniteThrustExecution } from '../lab/FiniteThrustPlayback.js';
import { createLaunchExecution, deriveLaunchTelemetry, sampleLaunchExecution } from '../lab/LaunchPlayback.js';
import { createLandingExecution, deriveLandingTelemetry, sampleLandingExecution } from '../lab/BodyLandingPlayback.js';
import { createMissionExecutionView, MISSION_CAMERA_MODES } from '../lab/MissionExecutionView.js';
import { formatMissionTdb } from './MissionTimeDisplay.js';

const number = (value, digits = 1) => Number.isFinite(value)
  ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(value) : 'No disponible';
const vector = (values, digits) => `[${values.map(value => number(value, digits)).join(', ')}]`;
const CAMERA_LABELS = Object.freeze({ overview: 'Vista general', exterior: 'Seguimiento exterior',
  onboard: 'Desde la sonda', destination: 'Cámara de destino', cinematic: 'Cinematográfica', local: 'Cámara local' });
const PHASE_LABELS = Object.freeze({ parking: 'Órbita terrestre inicial', injection: 'Inyección impulsiva',
  cruise: 'Crucero Tierra–Luna', arrival: 'Aproximación nominal', flyby: 'Sobrevuelo calculado', result: 'Fin del cálculo',
  coast: 'Vuelo balístico (motor apagado)', burn: 'Encendido de empuje finito', depleted: 'Balístico · propelente agotado',
  pad: 'En plataforma', 'ascent-1': 'Ascenso · etapa 1', 'stage-1-coast': 'Balístico · antes de la separación', 'separation-coast': 'Balístico · tras la separación',
  'ascent-2': 'Ascenso · etapa 2', circularization: 'Circularización · etapa 2',
  orbit: 'Órbita inicial', deorbit: 'Salida de órbita', approach: 'Aproximación al periapsis', braking: 'Frenado principal', 'horizontal-reduction': 'Reducción de velocidad horizontal',
  terminal: 'Descenso terminal', contact: 'Contacto y evaluación', ballistic: 'Vuelo balístico sin propelente' });
const LANDING_SUMMARIES = Object.freeze({ '#mc-state-metrics': 'Estado inercial local', '#mc-derived-metrics': 'Vuelo respecto a la superficie',
  '#mc-resource-metrics': 'Propulsión y masa', '#mc-energy-metrics': 'Resultado del descenso y límites' });
const LAUNCH_SUMMARIES = Object.freeze({ '#mc-state-metrics': 'Estado inercial (ECI-L)', '#mc-derived-metrics': 'Vuelo y órbita osculante',
  '#mc-resource-metrics': 'Propulsión y masa', '#mc-energy-metrics': 'Resultado orbital y límites' });

export function createMissionControlCenter(host, onOpenPlanner) {
  host.classList.add('mission-control');
  host.innerHTML = `
    <aside class="mc-console lab-panel"><div class="lab-panel-heading"><span class="eyebrow">05 / CENTRO DE MISIÓN</span><h3>Control temporal</h3></div>
      <div class="lab-panel-scroll">
        <div id="mc-readiness" class="mc-readiness" role="status">Calcula una misión viable en el Planificador para habilitar la ejecución.</div>
        <button id="mc-open-planner" type="button">Abrir Planificador</button>
        <div class="lab-divider"></div>
        <div class="mc-actions"><button id="mc-play" type="button">Iniciar</button><button id="mc-pause" type="button">Pausar</button><button id="mc-reverse" type="button">Retroceder</button><button id="mc-reset" type="button">Reiniciar</button></div>
        <label class="lab-field">Velocidad temporal<select id="mc-rate"><option value="1">×1 · tiempo real</option><option value="10">×10</option><option value="60">×60 · 1 min/s</option><option value="600">×600 · 10 min/s</option><option value="3600" selected>×3 600 · 1 h/s</option><option value="21600">×21 600 · 6 h/s</option><option value="86400">×86 400 · 1 día/s</option></select></label>
        <label class="lab-field">Instante de misión<input id="mc-timeline" type="range" min="0" max="1" step="0.001" value="0"></label>
        <div class="mc-time-row"><span id="mc-elapsed">0 s</span><span id="mc-remaining">No disponible</span></div>
        <p id="mc-message" class="lab-message" role="status"></p>
        <div class="lab-divider"></div><h4>Fases y eventos</h4><div id="mc-events" class="mc-events"></div>
      </div></aside>
    <div class="mc-stage lab-stage"><div class="lab-stage-top"><span class="eyebrow">MISIÓN EN REPRODUCCIÓN / ESTADOS CALCULADOS</span><strong id="mc-stage-status">Sin plan vigente</strong></div>
      <div id="mc-canvas" aria-label="Visualización 3D de la sonda construida y su trayectoria calculada"></div>
      <button id="mc-touch-toggle" type="button" class="lab-touch-toggle" aria-pressed="false" hidden>Activar control 3D</button>
      <div class="mc-camera-bar" role="group" aria-label="Cámaras de misión"></div>
      <div class="mc-onboard-target"><label for="mc-look">Mirar hacia</label><select id="mc-look"><option value="moon">Luna</option><option value="earth">Tierra</option><option value="velocity">Dirección del movimiento</option></select></div>
      <div id="mc-stage-empty" class="lab-empty">Sin trayectoria ejecutable. Revisa el Planificador y la capacidad de la sonda.</div>
      <div class="lab-stage-foot"><span>Centros y trayectoria: 1 unidad = 10 000 km · marcadores ilustrativos · nave ampliada en vistas cercanas: 0,25 unidades por metro · orientación visual alineada con velocidad, sin control de actitud</span></div>
    </div>
    <aside class="mc-telemetry lab-panel"><div class="lab-panel-heading"><span class="eyebrow">06 / TELEMETRÍA</span><h3>Estado en el instante</h3></div>
      <div class="lab-panel-scroll"><div id="mc-outcome" class="mc-outcome">Sin datos de misión.</div>
        <details open><summary>Estado propagado y efeméride</summary><div id="mc-state-metrics" class="lab-metrics"></div></details>
        <details open><summary>Distancias derivadas</summary><div id="mc-derived-metrics" class="lab-metrics"></div></details>
        <details open><summary>Maniobra y recursos</summary><div id="mc-resource-metrics" class="lab-metrics"></div></details>
        <details><summary>Potencia estimada y límites</summary><div id="mc-energy-metrics" class="lab-metrics"></div><p id="mc-energy-note" class="mission-hint"></p></details>
        <p id="mc-model-note" class="mission-hint">La reproducción recorre una trayectoria integrada; el impulso es instantáneo. La masa se toma del presupuesto de misión, no de una combustión simulada.</p>
      </div></aside>`;
  const $ = selector => host.querySelector(selector);
  const controls = ['mc-play', 'mc-pause', 'mc-reverse', 'mc-reset', 'mc-rate', 'mc-timeline'];
  for (const mode of MISSION_CAMERA_MODES) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.camera = mode; button.textContent = CAMERA_LABELS[mode];
    $('.mc-camera-bar').append(button);
  }
  let execution = null, clock = null, sourceResult = null, sourceDesign = null, sourceName = null;
  let visible = false, frame = null, lastNow = null, interrupted = false, selectedEvent = 'parking';
  let view;
  try { view = createMissionExecutionView($('#mc-canvas')); }
  catch (error) {
    $('#mc-canvas').textContent = 'No se pudo iniciar WebGL. La telemetría y la reproducción temporal siguen disponibles.';
    view = { setExecution() {}, setSample() {}, setCameraMode() {}, setLookTarget() {}, setTouchInteraction() {}, setVisible() {}, dispose() {}, getCameraMode: () => 'overview' };
  }
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  $('#mc-touch-toggle').hidden = !coarse;
  function message(value, error = false) { $('#mc-message').textContent = value; $('#mc-message').dataset.error = String(error); }
  function metrics(selector, rows) {
    const panel = $(selector);
    if (panel.children.length !== rows.length) {
      panel.replaceChildren();
      for (const [label] of rows) {
        const row = document.createElement('div'); row.className = 'lab-metric';
        const term = document.createElement('span'); term.textContent = label;
        const strong = document.createElement('strong');
        row.append(term, strong); panel.append(row);
      }
    }
    rows.forEach(([label, value], index) => { panel.children[index].firstElementChild.textContent = label; panel.children[index].lastElementChild.textContent = value; });
  }
  function updateAvailability() {
    for (const id of controls) $(`#${id}`).disabled = !execution;
    for (const button of $('.mc-camera-bar').querySelectorAll('button')) {
      button.disabled = !execution;
      // La cámara local solo existe para ejecuciones con cuerpo central local (lanzamiento, descenso).
      if (button.dataset.camera === 'local') button.hidden = !(execution && ['launch', 'landing'].includes(execution.kind));
    }
    $('#mc-look').disabled = !execution;
    $('#mc-touch-toggle').disabled = !execution;
  }
  function renderEvents() {
    const list = $('#mc-events'); list.replaceChildren();
    if (!execution) { list.textContent = 'No hay eventos calculados.'; return; }
    for (const event of execution.events) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.event = event.id;
      const title = document.createElement('strong'); title.textContent = event.title;
      const kind = { initial: 'inicio', maneuver: 'impulso ideal', phase: 'fase', encounter: 'encuentro', result: 'resultado',
        ignition: 'encendido', liftoff: 'despegue', cutoff: 'apagado', separation: 'separación', 'max-q': 'presión máx.', altitude: 'altitud', apogee: 'apogeo', impact: 'impacto', end: 'fin', abort: 'aborto',
        'burn-start': 'motor encendido', periapsis: 'periapsis', contact: 'contacto', failure: 'fallo', 'burn-end': 'motor apagado', depletion: 'propelente agotado', skipped: 'omitido' }[event.kind] ?? event.kind;
      const time = document.createElement('small'); time.textContent = ['launch', 'landing'].includes(execution.kind) ? `T+${number(event.elapsedSeconds, 1)} s · ${kind}` : `${number(event.elapsedSeconds / 86400, 3)} d · ${kind}`;
      button.append(title, time);
      button.addEventListener('click', () => {
        clock.pause(); clock.seek(event.elapsedSeconds, { side: event.side }); selectedEvent = event.id;
        refresh(); message(`${event.title}: estado recuperado en su instante calculado.`);
      });
      list.append(button);
    }
  }
  function updateSelectedEvent(snapshot) {
    let active = execution.events[0];
    for (const event of execution.events) {
      if (event.elapsedSeconds > snapshot.elapsedSeconds + 1e-6) break;
      if (event.elapsedSeconds === 0 && snapshot.beforeManeuver && event.side === 'post') break;
      active = event;
    }
    selectedEvent = active.id;
    for (const button of $('#mc-events').querySelectorAll('button')) button.setAttribute('aria-current', button.dataset.event === selectedEvent ? 'step' : 'false');
  }
  const LAUNCH_NOTE = 'La reproducción muestrea estados integrados con masa variable: retroceder o repetir no consume propelente ni repite la separación. La trayectoria es integrada; la orientación del empuje es programada e idealizada; los modelos 3D son ilustrativos y sin llamas ni humo.';
  const ORIGINAL_SUMMARIES = {};
  function setSummaries(kind) {
    for (const [selector, text] of Object.entries(LAUNCH_SUMMARIES)) {
      const summary = $(selector).parentElement.firstElementChild;
      ORIGINAL_SUMMARIES[selector] ??= summary.textContent;
      summary.textContent = kind === 'launch' ? text : kind === 'landing' ? LANDING_SUMMARIES[selector] : ORIGINAL_SUMMARIES[selector];
    }
  }
  function renderLaunch(t) {
    const f = t.flight, pr = t.propulsion, o = t.orbit;
    metrics('#mc-state-metrics', [['Misión', t.missionName], ['Sonda (carga útil)', t.probeName], ['Lanzador', t.launcherName],
      ['Fase', PHASE_LABELS[t.phase] ?? t.phase], ['Tiempo T+', `${number(t.elapsedSeconds, 1)} s`],
      ['Posición inercial', `${vector(t.propagated.positionKm, 2)} km`], ['Velocidad inercial', `${vector(t.propagated.velocityKmS, 5)} km/s`]]);
    metrics('#mc-derived-metrics', [['Altitud WGS84', `${number(f.altitudeKm, 3)} km`], ['Velocidad inercial', `${number(f.inertialSpeedKmS, 4)} km/s`],
      ['Velocidad respecto a la atmósfera', `${number(f.relativeSpeedKmS, 4)} km/s`], ['Presión dinámica q', `${number(f.dynamicPressurePa / 1000, 3)} kPa`],
      ['Aceleración propia', `${number(f.properAccelerationMS2, 3)} m/s² · ${number(f.gLoad, 2)} g`],
      ['Apogeo osculante', o?.bound ? `${number(o.apogeeAltitudeKm, 1)} km` : o ? 'No ligada' : 'No disponible'],
      ['Perigeo osculante', o ? `${number(o.perigeeAltitudeKm, 1)} km` : 'No disponible'], ['Excentricidad', o ? number(o.eccentricity, 4) : 'No disponible']]);
    metrics('#mc-resource-metrics', [['Etapa activa', `Etapa ${pr.activeStage}`], ['Motores', pr.engineLabel], ['Empuje', `${number(pr.thrustN / 1000, 2)} kN`],
      ['Empuje / peso', number(pr.thrustToWeight, 2)], ['Masa total', `${number(pr.massKg, 1)} kg`], ['Propelente restante', `${number(pr.fuelKg, 1)} kg`],
      ['· etapa 1 / etapa 2', `${number(pr.stage1PropellantKg, 0)} / ${number(pr.stage2PropellantKg, 0)} kg`], ['Δv propulsivo acumulado', `${number(pr.propulsiveDeltaVMS, 1)} m/s`],
      ['Separación', pr.separated ? 'realizada' : 'pendiente']]);
    metrics('#mc-energy-metrics', [['Clasificación orbital', t.result ? t.result.classification : 'Se evalúa al final'], ['Motivo', t.result ? t.result.reasons[0] : 'No disponible aún']]);
    $('#mc-energy-note').textContent = `${t.provenance.spacecraft} ${t.provenance.atmosphere} ${t.provenance.limits}`;
  }
  const LANDING_NOTE = 'La reproducción muestrea estados integrados con masa variable: retroceder o repetir no consume propelente. Escena local del cuerpo central (no es el Sistema Solar); el guiado es idealizado y los modelos 3D son ilustrativos. La cámara local cambia solo el encuadre, no las posiciones científicas.';
  function renderLanding(t) {
    const f = t.flight, pr = t.propulsion, o = t.orbit;
    metrics('#mc-state-metrics', [['Misión', t.missionName], ['Destino', t.bodyName], ['Sonda (carga útil)', t.probeName], ['Módulo', t.landerName],
      ['Fase', PHASE_LABELS[t.phase] ?? t.phase], ['Tiempo T+', `${number(t.elapsedSeconds, 1)} s`], ['Marco', 'inercial local del cuerpo (ejes arbitrarios)'],
      ['Posición', `${vector(t.propagated.positionKm, 3)} km`], ['Velocidad inercial', `${vector(t.propagated.velocityKmS, 5)} km/s`]]);
    metrics('#mc-derived-metrics', [['Radio desde el centro', `${number(f.radiusKm, 3)} km`], ['Altitud', `${number(f.altitudeKm, 4)} km`], ['Gravedad local', `${number(f.gravityMS2, 4)} m/s²`],
      ['Velocidad orbital (inercial)', `${number(f.inertialSpeedKmS, 5)} km/s`], ['Velocidad respecto a la superficie', `${number(f.relativeSpeedMS, 2)} m/s`],
      ['Velocidad vertical', `${number(f.verticalMS, 2)} m/s`], ['Velocidad horizontal', `${number(f.horizontalMS, 2)} m/s`],
      ['Base de la velocidad relativa', f.groundVelocityBasis], ['Distancia al punto objetivo', 'No definido (sin punto objetivo)'],
      ['Periapsis osculante', o ? `${number(o.periapsisAltitudeKm, 2)} km` : 'No disponible'], ['Apoapsis osculante', o?.bound ? `${number(o.apoapsisAltitudeKm, 2)} km` : 'No ligada']]);
    metrics('#mc-resource-metrics', [['Motor', pr.engineLabel], ['Empuje', `${number(pr.thrustN / 1000, 3)} kN`], ['Acelerador', `${number(pr.throttle * 100, 0)} %`],
      ['Aceleración propulsiva', `${number(pr.accelerationMS2, 3)} m/s²`], ['Empuje / peso local', number(pr.thrustToWeight, 2)], ['Masa total', `${number(pr.massKg, 1)} kg`],
      ['Propelente restante', `${number(pr.fuelKg, 1)} kg`], ['Propelente consumido', `${number(pr.fuelConsumedKg, 1)} kg`], ['Δv propulsivo acumulado', `${number(pr.propulsiveDeltaVMS, 1)} m/s`]]);
    metrics('#mc-energy-metrics', [['Resultado', t.result ? t.result.classification : 'Se evalúa en el contacto'], ['Motivo', t.result ? t.result.reasons[0] : 'No disponible aún']]);
    $('#mc-energy-note').textContent = `${t.provenance.spacecraft} ${t.provenance.frame} ${t.provenance.limits}`;
  }
  function refresh() {
    if (!execution || !clock) return;
    try {
      const position = clock.snapshot();
      const finiteThrust = execution.kind === 'finite-thrust', launch = execution.kind === 'launch', landing = execution.kind === 'landing';
      const sample = landing ? sampleLandingExecution(execution, position.elapsedSeconds) : launch ? sampleLaunchExecution(execution, position.elapsedSeconds) : finiteThrust ? sampleFiniteThrustExecution(execution, position.elapsedSeconds)
        : sampleMissionExecution(execution, position.elapsedSeconds, { side: position.beforeManeuver ? 'pre' : 'post' });
      const telemetry = landing ? deriveLandingTelemetry(execution, sample) : launch ? deriveLaunchTelemetry(execution, sample) : finiteThrust ? deriveFiniteThrustTelemetry(execution, sample) : deriveMissionTelemetry(execution, sample);
      setSummaries(execution.kind);
      view.setSample(sample, { beforeManeuver: position.beforeManeuver });
      $('#mc-timeline').value = String(position.elapsedSeconds);
      $('#mc-elapsed').textContent = `${number(position.elapsedSeconds, 0)} s transcurridos`;
      $('#mc-remaining').textContent = `${number(sample.remainingSeconds, 0)} s restantes`;
      const playbackState = position.finished ? 'FINALIZADA LA REPRODUCCIÓN'
        : position.playing ? (position.direction < 0 ? 'REPRODUCCIÓN INVERSA' : 'EN REPRODUCCIÓN')
          : position.beforeManeuver ? 'PREPARADA' : 'PAUSADA';
      $('#mc-stage-status').textContent = playbackState;
      const outcome = telemetry.objectiveReached ? 'Objetivo geométrico alcanzado según el modelo'
        : 'Objetivo geométrico pendiente';
      $('#mc-outcome').textContent = landing
        ? `${PHASE_LABELS[telemetry.phase] ?? telemetry.phase} · ${telemetry.result ? telemetry.result.classification : 'resultado del descenso al final de la reproducción'}. Éxito de misión: No verificable.`
        : launch
        ? `${PHASE_LABELS[telemetry.phase] ?? telemetry.phase} · ${telemetry.result ? telemetry.result.classification : 'resultado orbital al final de la reproducción'}. Éxito de misión: No verificable.`
        : finiteThrust
        ? `${PHASE_LABELS[telemetry.phase]} · propagación de empuje finito calculada. Éxito de misión: No verificable.`
        : `${PHASE_LABELS[telemetry.phase]} · ${outcome}. Éxito completo: No verificable.`;
      if (launch || landing) {
        if (landing) renderLanding(telemetry); else renderLaunch(telemetry);
        updateSelectedEvent(position); $('#mc-model-note').textContent = landing ? LANDING_NOTE : LAUNCH_NOTE;
        $('#mc-play').textContent = position.playing ? 'En curso' : position.finished ? 'Reiniciar e iniciar' : position.beforeManeuver ? 'Iniciar' : 'Reanudar';
        return;
      }
      metrics('#mc-state-metrics', [
        ['Misión', telemetry.missionName], ['Sonda', telemetry.probeName],
        ['Época', formatMissionTdb(telemetry.propagated.jdTdb)],
        ['Fase', PHASE_LABELS[telemetry.phase]],
        ['Posición geocéntrica', `${vector(telemetry.propagated.positionKm, 2)} km`],
        ['Velocidad geocéntrica', `${vector(telemetry.propagated.velocityKmS, 5)} km/s`]
      ]);
      metrics('#mc-derived-metrics', [
        ['Distancia Tierra', `${number(telemetry.derived.earthDistanceKm, 2)} km`],
        ['Altitud Tierra', `${number(telemetry.derived.earthAltitudeKm, 2)} km`],
        ['Distancia Luna', `${number(telemetry.derived.lunarDistanceKm, 2)} km`],
        ['Altitud Luna', `${number(telemetry.derived.lunarAltitudeKm, 2)} km`],
        ['Velocidad relativa lunar', `${number(telemetry.derived.lunarRelativeSpeedKmS, 5)} km/s`]
      ]);
      if (finiteThrust) {
        const pr = telemetry.propulsion;
        metrics('#mc-resource-metrics', [
          ['Motor', `${pr.engineName} · ${pr.engineKind}`],
          ['Estado del motor', pr.engineOn ? `ENCENDIDO · ${pr.activeBurnId}` : 'APAGADO'],
          ['Empuje', `${number(pr.thrustN, 3)} N`],
          ['Acelerador', `${number(pr.throttle * 100, 0)} %`],
          ['Aceleración propulsiva', `${number(pr.accelerationMS2, 6)} m/s²`],
          ['Masa instantánea', `${number(pr.massKg, 3)} kg`],
          ['Combustible restante', `${number(pr.fuelKg, 3)} kg`],
          ['Combustible consumido', `${number(pr.fuelConsumedKg, 3)} kg`],
          ['Δv propulsivo acumulado', `${number(pr.propulsiveDeltaVMS, 3)} m/s`],
          ['Estado del vehículo', pr.state]
        ]);
        metrics('#mc-energy-metrics', [
          ['Generación solar nominal', `${number(telemetry.energyEstimate.nominalGenerationW)} W`],
          ['Consumo en este instante', `${number(telemetry.energyEstimate.consumptionW)} W`],
          ['Balance nominal', `${number(telemetry.energyEstimate.netNominalW)} W`],
          ['Capacidad batería', `${number(telemetry.energyEstimate.batteryCapacityWh)} Wh`],
          ['Carga de batería', 'No disponible · sin modelo temporal']
        ]);
      } else {
        metrics('#mc-resource-metrics', [
          ['Maniobra', telemetry.resources.maneuverState],
          ['Masa total', `${number(telemetry.resources.massKg, 2)} kg`],
          ['Combustible restante', `${number(telemetry.resources.fuelKg, 2)} kg`],
          ['Combustible consumido', `${number(telemetry.resources.fuelConsumedKg, 2)} kg`],
          ['Δv ejecutado', `${number(telemetry.resources.executedDeltaVMS, 2)} m/s`],
          ['Δv pendiente', `${number(telemetry.resources.pendingDeltaVMS, 2)} m/s`]
        ]);
        metrics('#mc-energy-metrics', [
          ['Generación solar nominal', `${number(telemetry.energyEstimate.nominalGenerationW)} W`],
          ['Consumo en reposo', `${number(telemetry.energyEstimate.idleConsumptionW)} W`],
          ['Balance nominal', `${number(telemetry.energyEstimate.netNominalW)} W`],
          ['Capacidad batería', `${number(telemetry.energyEstimate.batteryCapacityWh)} Wh`],
          ['Carga de batería', 'No disponible · sin modelo temporal']
        ]);
      }
      $('#mc-energy-note').textContent = telemetry.energyEstimate.warning;
      updateSelectedEvent(position);
      $('#mc-model-note').textContent = finiteThrust
        ? 'La reproducción muestrea estados integrados con empuje finito y masa variable. Reproducir, retroceder o repetir no consume combustible adicional: la masa es función del instante.'
        : 'La reproducción recorre una trayectoria integrada; el impulso es instantáneo. La masa se toma del presupuesto de misión, no de una combustión simulada.';
      $('#mc-play').textContent = position.playing ? 'En curso' : position.finished ? 'Reiniciar e iniciar' : position.beforeManeuver ? 'Iniciar' : 'Reanudar';
    } catch (error) {
      interrupted = true; clock.pause(); stopFrame();
      $('#mc-stage-status').textContent = 'INTERRUMPIDA · DATOS NO DISPONIBLES';
      message(error.message, true);
    }
  }
  function stopFrame() { if (frame != null) cancelAnimationFrame(frame); frame = null; lastNow = null; }
  function tick(now) {
    if (!visible || !clock?.snapshot().playing) { stopFrame(); return; }
    const realDelta = lastNow == null ? 0 : Math.min(0.2, (now - lastNow) / 1000);
    lastNow = now;
    clock.advance(realDelta); refresh();
    if (clock?.snapshot().playing && !interrupted) frame = requestAnimationFrame(tick);
    else stopFrame();
  }
  function startFrame() { if (frame == null && visible) { lastNow = null; frame = requestAnimationFrame(tick); } }
  function clear(reason) {
    stopFrame(); execution = null; clock = null; sourceResult = null; sourceDesign = null; sourceName = null; interrupted = false;
    view.setExecution(null); $('#mc-stage-empty').hidden = false;
    $('#mc-readiness').textContent = reason || 'Calcula una misión viable en el Planificador para habilitar la ejecución.';
    $('#mc-stage-status').textContent = 'Sin plan vigente'; $('#mc-outcome').textContent = 'Sin datos de misión.';
    for (const selector of ['#mc-state-metrics', '#mc-derived-metrics', '#mc-resource-metrics', '#mc-energy-metrics']) $(selector).replaceChildren();
    $('#mc-energy-note').textContent = '';
    renderEvents(); updateAvailability(); message('');
  }
  function setPlan(candidate) {
    if (!candidate?.ready) { clear(candidate?.reason); return; }
    if (candidate.result === sourceResult && candidate.design === sourceDesign && candidate.name === sourceName) return;
    try {
      const next = candidate.kind === 'landing' ? createLandingExecution(candidate) : candidate.kind === 'launch' ? createLaunchExecution(candidate) : candidate.kind === 'finite-thrust' ? createFiniteThrustExecution(candidate) : createMissionExecution(candidate);
      stopFrame(); execution = next; clock = createPlaybackClock(next.durationSeconds);
      sourceResult = candidate.result; sourceDesign = candidate.design; sourceName = candidate.name; interrupted = false;
      view.setExecution(next);
      view.setSample(next.kind === 'landing' ? sampleLandingExecution(next, 0) : next.kind === 'launch' ? sampleLaunchExecution(next, 0) : next.kind === 'finite-thrust' ? sampleFiniteThrustExecution(next, 0) : sampleMissionExecution(next, 0, { side: 'pre' }), { beforeManeuver: true });
      if (next.kind === 'launch') { clock.setRate(10); $('#mc-rate').value = '10'; }
      if (next.kind === 'landing') { clock.setRate(60); $('#mc-rate').value = '60'; }
      $('#mc-stage-empty').hidden = true;
      $('#mc-readiness').textContent = next.kind === 'landing'
        ? `Descenso local en ${next.simulation.bodyName} vigente. Reproducción de estados integrados en una escena local; el resultado es según el modelo y no certifica una misión operativa.`
        : next.kind === 'launch'
        ? 'Lanzamiento terrestre vigente. Reproducción de estados integrados (masa variable, separación y arrastre); el resultado orbital es según el modelo y no certifica una misión operativa.'
        : next.kind === 'finite-thrust'
        ? 'Maniobra de empuje finito vigente. Reproducción de estados integrados; el lanzamiento no está incluido y no se certifica el éxito de misión.'
        : 'Plan vigente y maniobra viable según el modelo. Reproducción de estados calculados; el lanzamiento no está incluido.';
      $('#mc-timeline').max = String(next.durationSeconds);
      renderEvents(); updateAvailability(); refresh(); message('Misión preparada en la órbita terrestre inicial.');
    } catch (error) { clear(error.message); }
  }
  $('#mc-open-planner').addEventListener('click', onOpenPlanner);
  function start() {
    if (!clock) return;
    if (clock.snapshot().finished) clock.reset();
    clock.setDirection(1); clock.play(); interrupted = false; refresh(); startFrame();
  }
  $('#mc-play').addEventListener('click', start);
  $('#mc-pause').addEventListener('click', () => { clock?.pause(); stopFrame(); refresh(); });
  $('#mc-reverse').addEventListener('click', () => {
    if (!clock) return;
    if (clock.snapshot().elapsedSeconds === 0) { message('Selecciona un instante posterior para retroceder.'); return; }
    clock.setDirection(-1); clock.play(); interrupted = false; refresh(); startFrame();
  });
  $('#mc-reset').addEventListener('click', () => { clock?.reset(); stopFrame(); refresh(); message('Reproducción reiniciada antes del impulso.'); });
  $('#mc-rate').addEventListener('change', () => { clock?.setRate(Number($('#mc-rate').value)); refresh(); });
  $('#mc-timeline').addEventListener('input', () => {
    if (!clock) return;
    clock.pause(); stopFrame(); clock.seek(Number($('#mc-timeline').value)); refresh();
  });
  for (const button of $('.mc-camera-bar').querySelectorAll('button')) button.addEventListener('click', () => {
    view.setCameraMode(button.dataset.camera);
    for (const item of $('.mc-camera-bar').querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
    $('.mc-onboard-target').hidden = button.dataset.camera !== 'onboard';
  });
  $('#mc-look').addEventListener('change', () => view.setLookTarget($('#mc-look').value));
  $('#mc-touch-toggle').addEventListener('click', () => {
    const active = $('#mc-touch-toggle').getAttribute('aria-pressed') !== 'true';
    view.setTouchInteraction(active); $('#mc-touch-toggle').setAttribute('aria-pressed', String(active));
    $('#mc-touch-toggle').textContent = active ? 'Desactivar control 3D' : 'Activar control 3D';
  });
  function onVisibilityChange() { if (document.hidden && clock?.snapshot().playing) { clock.pause(); stopFrame(); refresh(); } }
  document.addEventListener('visibilitychange', onVisibilityChange);
  clear(); $('.mc-onboard-target').hidden = true;
  return {
    setPlan,
    start,
    setVisible(value) {
      visible = Boolean(value); view.setVisible(visible);
      if (!visible) { clock?.pause(); stopFrame(); if (execution) refresh();
        if (coarse) { view.setTouchInteraction(false); $('#mc-touch-toggle').setAttribute('aria-pressed', 'false'); $('#mc-touch-toggle').textContent = 'Activar control 3D'; } }
      else if (execution) refresh();
    },
    resetCamera() { view.setCameraMode('overview');
      for (const button of $('.mc-camera-bar').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.camera === 'overview'));
      $('.mc-onboard-target').hidden = true; },
    dispose() { stopFrame(); document.removeEventListener('visibilitychange', onVisibilityChange); view.dispose(); host.replaceChildren(); }
  };
}
