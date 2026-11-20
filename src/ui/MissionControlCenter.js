import { createMissionExecution, createPlaybackClock, sampleMissionExecution } from '../lab/MissionPlayback.js';
import { deriveMissionTelemetry } from '../lab/MissionTelemetry.js';
import { createFiniteThrustExecution, deriveFiniteThrustTelemetry, sampleFiniteThrustExecution } from '../lab/FiniteThrustPlayback.js';
import { createLaunchExecution, deriveLaunchTelemetry, sampleLaunchExecution } from '../lab/LaunchPlayback.js';
import { createLandingExecution, deriveLandingTelemetry, sampleLandingExecution } from '../lab/BodyLandingPlayback.js';
import { createInterplanetaryExecution, deriveInterplanetaryTelemetry, sampleInterplanetaryExecution, INTERPLANETARY_MAX_RATE } from '../lab/InterplanetaryPlayback.js';
import { createIntegratedExecution, sampleIntegratedExecution, deriveIntegratedTelemetry, INTEGRATED_MAX_RATE, AUTO_RATE, CONTEXT_LABELS } from '../lab/IntegratedMissionPlayback.js';
import { tdbToTimeScales } from '../science/AstrodynamicsTime.js';
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
  terminal: 'Descenso terminal', contact: 'Contacto y evaluación', ballistic: 'Vuelo balístico sin propelente',
  departure: 'Salida heliocéntrica', 'cruise-helio': 'Crucero heliocéntrico (cónica)', arrival: 'Llegada al destino (sin captura)' });
const INTERPLANETARY_SUMMARIES = Object.freeze({ '#mc-state-metrics': 'Estado heliocéntrico (ICRF eclíptico J2000, TDB)', '#mc-derived-metrics': 'Distancias y velocidades relativas',
  '#mc-resource-metrics': 'Requisitos de la transferencia (sin maniobras propagadas)', '#mc-energy-metrics': 'Procedencia, modelo y validación' });
const FOOT_DEFAULT = 'Centros y trayectoria: 1 unidad = 10 000 km · marcadores ilustrativos · nave ampliada en vistas cercanas: 0,25 unidades por metro · orientación visual alineada con velocidad, sin control de actitud';
const FOOT_LANDING_LOCAL = 'Cámara local: escena del cuerpo central (radio → 0,6371 u) · nave ampliada y apoyada por su base sobre el punto calculado, orientada con la vertical local · parche de suelo a radio R exacto · sin control de actitud';
const INTEGRATED_SUMMARIES = Object.freeze({ '#mc-state-metrics': 'Fase, época y estado en el marco del cuerpo central', '#mc-derived-metrics': 'Órbita osculante y distancias',
  '#mc-resource-metrics': 'Motor, masa y propelente por depósito', '#mc-energy-metrics': 'Energía eléctrica, maniobras y límites' });
// 13: pie de la vista según el contexto dibujado de la misión integrada.
const FOOT_INTEGRATED = Object.freeze({ helio: 'Contexto heliocéntrico: 32 unidades = 1 AU (centros) · Sol, planetas y nave con tamaños ampliados ilustrativos · estados de los tramos calculados convertidos al marco del Sol con las efemérides en la misma época TDB',
  planet: 'Contexto planetocéntrico: 1 unidad = 10 000 km (centros) · planeta a tamaño real; marcadores de nave y satélite ampliados (ilustrativos) · ejes ICRF eclíptico J2000',
  moon: 'Contexto centrado en el satélite: 1 unidad = 10 000 km · satélite a tamaño real; marcador de la nave ampliado (ilustrativo) · ejes ICRF eclíptico J2000',
  landing: 'Escena local del descenso (12F): radio del cuerpo → 0,6371 u · el estado inicial del descenso es el estado final de la captura (mismo marco centrado en el satélite)' });
const FOOT_HELIO = 'Escena heliocéntrica: 32 unidades = 1 AU (centros) · Sol, planetas y nave con tamaños ampliados ilustrativos · la sonda sigue la cónica propagada desde la solución de Lambert';
// 12F.1: mensajes según el cuerpo central y la fase real de cada tipo de misión.
export function preparedMessage(execution) {
  if (!execution) return '';
  if (execution.kind === 'landing') return `Descenso preparado en la órbita inicial alrededor de ${execution.simulation.bodyName} (marco inercial local).`;
  if (execution.kind === 'launch') return 'Lanzamiento preparado en la plataforma (antes del despegue).';
  if (execution.kind === 'integrated') return `Misión integrada preparada en la salida heliocéntrica desde la Tierra hacia ${execution.mission.moonName ?? execution.mission.destinationName}.`;
  if (execution.kind === 'interplanetary') return `Transferencia preparada en la salida heliocéntrica desde ${execution.result.originName} hacia ${execution.result.destinationName}.`;
  return 'Misión preparada en la órbita terrestre inicial.';
}
export function resetMessage(execution) {
  if (execution?.kind === 'landing') return 'Reproducción reiniciada en la órbita inicial, antes de la salida de órbita.';
  if (execution?.kind === 'launch') return 'Reproducción reiniciada en la plataforma, antes del despegue.';
  if (execution?.kind === 'interplanetary' || execution?.kind === 'integrated') return 'Reproducción reiniciada en la salida heliocéntrica.';
  return 'Reproducción reiniciada antes del impulso.';
}
// 12F.1: el resultado de un descenso es local y según el modelo; no equivale al éxito de una misión completa.
export function landingOutcomeText(phaseLabel, result) {
  const verdict = result ? `${result.classification} (descenso local aislado)` : 'resultado del descenso al final de la reproducción';
  return `${phaseLabel} · ${verdict}. Misión completa (viaje, llegada y descenso conectados): no evaluada. Viabilidad operativa: no verificada.`;
}
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
        <label class="lab-field">Velocidad temporal<select id="mc-rate"><option value="1">×1 · tiempo real</option><option value="10">×10</option><option value="60">×60 · 1 min/s</option><option value="600">×600 · 10 min/s</option><option value="3600" selected>×3 600 · 1 h/s</option><option value="21600">×21 600 · 6 h/s</option><option value="86400">×86 400 · 1 día/s</option><option value="864000" data-interplanetary>10 días/s</option><option value="2592000" data-interplanetary>30 días/s</option><option value="8640000" data-interplanetary>100 días/s</option><option value="auto" data-integrated>Automático por fase</option></select></label>
        <div id="mc-context" class="mc-context" role="group" aria-label="Marco de la vista" hidden><button type="button" data-context="auto" aria-pressed="true">Automático</button><button type="button" data-context="helio" aria-pressed="false">Sol</button><button type="button" data-context="planet" aria-pressed="false">Planeta</button><button type="button" data-context="moon" aria-pressed="false">Satélite</button><button type="button" data-context="landing" aria-pressed="false">Descenso</button></div>
        <label class="lab-field">Instante de misión<input id="mc-timeline" type="range" min="0" max="1" step="0.001" value="0"></label>
        <div class="mc-time-row"><span id="mc-elapsed">0 s</span><span id="mc-remaining">No disponible</span></div>
        <p id="mc-message" class="lab-message" role="status"></p>
        <div class="lab-divider"></div><h4>Fases y eventos</h4><div id="mc-events" class="mc-events"></div>
      </div></aside>
    <div class="mc-stage lab-stage"><div class="lab-stage-top"><span class="eyebrow">MISIÓN EN REPRODUCCIÓN / ESTADOS CALCULADOS</span><strong id="mc-stage-status">Sin plan vigente</strong>
        <div class="mc-layout-toggles" role="group" aria-label="Paneles del Centro de Misión"><button type="button" data-mc-panel="console" aria-pressed="true" title="Mostrar u ocultar el control temporal">Control</button><button type="button" data-mc-panel="telemetry" aria-pressed="true" title="Mostrar u ocultar la telemetría">Telemetría</button><button type="button" data-mc-panel="wide" aria-pressed="false" title="Ocultar ambos paneles y ampliar la escena"><svg class="icon" aria-hidden="true"><use href="#icon-expand"></use></svg><span>Vista amplia</span></button></div></div>
      <div id="mc-canvas" aria-label="Visualización 3D de la sonda activa y su trayectoria calculada"></div>
      <button id="mc-touch-toggle" type="button" class="lab-touch-toggle" aria-pressed="false" hidden>Activar control 3D</button>
      <div class="mc-camera-bar" role="group" aria-label="Cámaras de misión"></div>
      <div class="mc-onboard-target"><label for="mc-look">Mirar hacia</label><select id="mc-look"><option value="moon">Luna</option><option value="earth">Tierra</option><option value="velocity">Dirección del movimiento</option></select></div>
      <div class="mc-hud" id="mc-hud" hidden><div class="mc-hud-phase" id="mc-hud-phase-box"><span id="mc-hud-kind">Misión</span><strong id="mc-hud-phase">—</strong><small id="mc-hud-time"></small></div><dl class="mc-hud-metrics" id="mc-hud-metrics"></dl></div>
      <div class="mc-transport" id="mc-transport" role="group" aria-label="Reproducción en la escena" hidden>
        <button type="button" data-tr="prev" aria-label="Evento anterior" title="Evento anterior"><svg class="icon" aria-hidden="true"><use href="#icon-skip-back"></use></svg></button>
        <button type="button" data-tr="reverse" aria-label="Reproducir hacia atrás" title="Reproducir hacia atrás"><svg class="icon" aria-hidden="true"><use href="#icon-reverse"></use></svg></button>
        <button type="button" data-tr="play" class="mc-tr-play" aria-label="Reproducir" title="Reproducir o pausar"><svg class="icon" aria-hidden="true"><use href="#icon-play"></use></svg></button>
        <button type="button" data-tr="next" aria-label="Evento siguiente" title="Evento siguiente"><svg class="icon" aria-hidden="true"><use href="#icon-skip-forward"></use></svg></button>
        <div class="mc-track" id="mc-track" role="presentation"><div class="mc-track-fill" id="mc-track-fill"></div><div class="mc-track-ticks" id="mc-track-ticks"></div></div>
        <span class="mc-tr-time" id="mc-tr-time"></span>
      </div>
      <div id="mc-stage-empty" class="lab-empty">Sin trayectoria ejecutable. Revisa el Planificador y la capacidad de la sonda.</div>
      <div class="lab-stage-foot"><span id="mc-foot">Centros y trayectoria: 1 unidad = 10 000 km · marcadores ilustrativos · nave ampliada en vistas cercanas: 0,25 unidades por metro · orientación visual alineada con velocidad, sin control de actitud</span></div>
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
  let contextMode = 'auto', viewContext = null, autoRate = false;
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
      if (button.dataset.camera === 'local') button.hidden = !(execution && (['launch', 'landing'].includes(execution.kind) || (execution.kind === 'integrated' && viewContext === 'landing')));
    }
    $('#mc-look').disabled = !execution;
    $('#mc-touch-toggle').disabled = !execution;
  }
  function renderEvents() {
    const list = $('#mc-events'); list.replaceChildren();
    if (!execution) { list.textContent = 'No hay eventos calculados.'; renderTicks(); return; }
    for (const event of execution.events) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.event = event.id;
      const title = document.createElement('strong'); title.textContent = event.title;
      const kind = { initial: 'inicio', maneuver: 'impulso ideal', phase: 'fase', encounter: 'encuentro', result: 'resultado',
        ignition: 'encendido', liftoff: 'despegue', cutoff: 'apagado', separation: 'separación', 'max-q': 'presión máx.', altitude: 'altitud', apogee: 'apogeo', impact: 'impacto', end: 'fin', abort: 'aborto',
        'burn-start': 'motor encendido', periapsis: 'periapsis', contact: 'contacto', failure: 'fallo', 'burn-end': 'motor apagado', depletion: 'propelente agotado', skipped: 'omitido',
        departure: 'salida', perihelion: 'perihelio', aphelion: 'afelio', arrival: 'llegada', soi: 'esfera de influencia' }[event.kind] ?? event.kind;
      const time = document.createElement('small'); time.textContent = execution.kind === 'integrated' ? `${tdbToTimeScales(execution.mission.departureJdTdb + event.elapsedSeconds / 86400).labelUtc} · ${kind}` : ['launch', 'landing'].includes(execution.kind) ? `T+${number(event.elapsedSeconds, 1)} s · ${kind}` : `${number(event.elapsedSeconds / 86400, 3)} d · ${kind}`;
      button.append(title, time);
      button.addEventListener('click', () => {
        clock.pause(); clock.seek(event.elapsedSeconds, { side: event.side }); selectedEvent = event.id;
        refresh(); message(`${event.title}: estado recuperado en su instante calculado.`);
      });
      list.append(button);
    }
    renderTicks();
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
      summary.textContent = kind === 'launch' ? text : kind === 'landing' ? LANDING_SUMMARIES[selector] : kind === 'interplanetary' ? INTERPLANETARY_SUMMARIES[selector] : kind === 'integrated' ? INTEGRATED_SUMMARIES[selector] : ORIGINAL_SUMMARIES[selector];
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
  const INTERPLANETARY_NOTE = 'La sonda sigue la cónica heliocéntrica propagada (Kepler, μ solar) desde la velocidad de Lambert; los planetas siguen las efemérides de Horizons interpoladas por Hermite. Reproducir o retroceder no recalcula ni consume propelente: no hay maniobras propagadas durante el crucero.';
  const km = value => `${number(value, 0)} km`;
  function renderInterplanetary(t, position) {
    const q = t.requirements;
    metrics('#mc-state-metrics', [['Tipo de misión', 'Transferencia interplanetaria preliminar'], ['Misión', t.missionName], ['Origen → destino', `${t.originName} → ${t.destinationName}`],
      ['Sonda', t.probeName], ['Fase', PHASE_LABELS[t.phase] ?? t.phase], ['Fecha UTC', `${t.time.utc}${t.time.utcPredicted ? ' (predicción: sin segundos intercalares futuros)' : ''}`],
      ['Época TDB', `${t.time.tdb} · JD ${number(t.time.jdTdb, 5)}`], ['Desde la salida', `${number(t.time.elapsedDays, 2)} d`], ['Tiempo restante', `${number(t.time.remainingDays, 2)} d`],
      ['Marco', 'Heliocéntrico ICRF eclíptico J2000 (centro del Sol 500@10)'], ['Posición', `${vector(t.state.positionKm, 0)} km`], ['Velocidad', `${vector(t.state.velocityKmS, 4)} km/s`]]);
    metrics('#mc-derived-metrics', [['Distancia al Sol', `${km(t.derived.sunDistanceKm)} · ${number(t.derived.sunDistanceAu, 4)} AU`], ['Rapidez heliocéntrica', `${number(t.derived.speedKmS, 4)} km/s`],
      [`Distancia a ${t.originName}`, km(t.derived.originDistanceKm)], [`Distancia a ${t.destinationName}`, km(t.derived.destinationDistanceKm)],
      [`Velocidad relativa a ${t.destinationName}`, `${number(t.derived.destinationRelativeSpeedKmS, 4)} km/s`]]);
    metrics('#mc-resource-metrics', [['C3 de salida', `${number(q.c3Km2S2, 3)} km²/s²`], ['v∞ de salida', `${number(q.vInfDepartureKmS, 4)} km/s`],
      ['v∞ de llegada', `${number(q.vInfArrivalKmS, 4)} km/s`], ['Duración total', `${number(q.durationDays, 2)} d`],
      [`Δv ideal de inyección (órbita de ${number(q.parkingAltitudeKm, 0)} km)`, `${number(q.injectionDeltaVKmS, 4)} km/s · no propagado`],
      ['Combustible durante el crucero', 'No aplica: sin maniobras programadas ni integradas']]);
    metrics('#mc-energy-metrics', [['Efemérides', `${t.provenance.source} · ${t.provenance.datasets.join(', ')}`], ['Soluciones JPL', t.provenance.solutions.join(', ') || 'No disponible'],
      ['Planetas', t.provenance.interpolation], ['Modelo de transferencia', t.model], ['Estado de validación', t.validation]]);
    $('#mc-energy-note').textContent = t.limits.join(' ');
    $('#mc-elapsed').textContent = `${number(position.elapsedSeconds / 86400, 2)} d transcurridos`;
    $('#mc-remaining').textContent = `${number(t.time.remainingDays, 2)} d restantes`;
  }
  const INTEGRATED_NOTE = 'Cada estado sale del tramo calculado que contiene el instante: Kepler exacto en tramos balísticos y nudos DOPRI54 (Hermite) en encendidos y descenso. Los cambios de contexto solo cambian el marco del dibujo (efemérides en la misma época TDB). Reproducir o retroceder no recalcula ni consume propelente.';
  function setViewContext(ctx) {
    if (ctx === viewContext) return;
    viewContext = ctx; view.setExecution(execution.contexts[ctx], { keepCamera: true });
    $('#mc-foot').textContent = FOOT_INTEGRATED[ctx];
    const look = $('#mc-look');
    look.options[0].textContent = ctx === 'helio' ? `Destino (${execution.mission.destinationName})` : ctx === 'planet' && execution.mission.moonName ? `Satélite (${execution.mission.moonName})` : 'Cuerpo central';
    look.options[1].textContent = ctx === 'helio' ? 'Origen (Tierra)' : 'Cuerpo central';
    updateAvailability();
  }
  function renderIntegrated(t, position) {
    const pr = t.propulsion, o = t.derived.orbit, m = execution.mission;
    metrics('#mc-state-metrics', [['Tipo de misión', 'Misión interplanetaria integrada'], ['Misión', t.missionName], ['Fase', t.phaseLabel], ['Estado de la fase', t.phaseStatus ?? 'No disponible'],
      ['Tramo', t.segmentLabel], ['Fecha UTC', `${t.time.utc}${t.time.utcPredicted ? ' (predicción)' : ''}`], ['Época TDB', `${t.time.tdb} · JD ${number(t.time.jdTdb, 6)}`],
      ['Desde la salida', `${number(t.time.elapsedDays, 4)} d`], ['Cuerpo central', t.frame.centralName], ['Marco del estado', t.frame.label], ['Contexto de la vista', CONTEXT_LABELS[t.context]],
      ['Posición', `${vector(t.state.positionKm, 1)} km`], ['Velocidad', `${vector(t.state.velocityKmS, 5)} km/s`]]);
    metrics('#mc-derived-metrics', [[`Distancia al centro de ${t.frame.centralName}`, `${number(t.derived.distanceKm, 1)} km`], ['Altitud', `${number(t.derived.altitudeKm, 2)} km`],
      ['Rapidez respecto al cuerpo central', `${number(t.derived.speedKmS, 5)} km/s`],
      ['Órbita osculante', o.bound ? `elíptica · e = ${number(o.eccentricity, 5)}` : `hiperbólica · e = ${number(o.eccentricity, 5)} · v∞ ${number(o.vInfKmS, 4)} km/s`],
      ['Periapsis osculante', `${number(o.periapsisAltitudeKm, 2)} km alt.`], ['Apoapsis osculante', o.bound ? `${number(o.apoapsisAltitudeKm, 1)} km alt.` : 'No ligada'],
      ['Periodo', o.periodSeconds ? `${number(o.periodSeconds / 3600, 3)} h` : 'No aplica'],
      ['Distancia al Sol', t.derived.sunDistanceAu != null ? `${number(t.derived.sunDistanceAu, 5)} AU` : 'No disponible'],
      [`Distancia a ${m.destinationName}`, t.derived.destinationDistanceKm != null ? `${number(t.derived.destinationDistanceKm, 0)} km` : 'No disponible']]);
    const tanks = pr.tanks, v = m.vehicle;
    metrics('#mc-resource-metrics', [['Motor', pr.engineOn ? `ENCENDIDO · ${pr.activeManeuver ?? (pr.landing ? 'descenso guiado 12F' : '')}` : 'APAGADO (tramo balístico)'],
      ['Masa total', `${number(pr.massKg, 1)} kg`], [`Propelente sonda «${v.probe.name}»`, `${number(tanks.probe, 1)} kg`],
      // 15.1: la interfaz ya no ofrece módulos auxiliares; sus filas solo aparecen si el resultado los incluye.
      ...(v.module ? [['Propelente del módulo', `${number(tanks.module, 0)} kg${pr.separated ? ' · módulo separado' : ''}`]] : []),
      ...(v.lander ? [['Propelente del módulo de aterrizaje', `${number(tanks.lander, 1)} kg`],
        ['Acelerador del descenso', pr.landing ? `${number(pr.landing.throttle * 100, 0)} % · ${number(pr.landing.thrustN / 1000, 2)} kN` : 'No aplica'],
        ['Velocidad vertical / horizontal', pr.landing ? `${number(pr.landing.verticalMS, 2)} / ${number(pr.landing.horizontalMS, 2)} m/s` : 'No aplica']] : [])]);
    const done = t.maneuversDone.map(x => `${x.label}: ${number(x.propulsiveDeltaVKmS * 1000, 1)} m/s, ${number(x.propellantKg, 0)} kg (${x.endEvent})`);
    const pw = t.power;
    metrics('#mc-energy-metrics', [
      ['Generación eléctrica', pw ? `${number(pw.generationW, 0)} W${pw.solarW > 0 && pw.rtgW > 0 ? ` (solar ${number(pw.solarW, 0)} · RTG ${number(pw.rtgW, 0)})` : pw.rtgW > 0 ? ' (RTG)' : ' (solar)'}` : 'No disponible'],
      ['Consumo modelado', pw ? `${number(pw.loadW, 0)} W${pr.engineOn && pw.loadW > (v.power?.serviceW ?? 0) ? ' · con encendido' : ''}` : 'No disponible'],
      ['Margen eléctrico', pw ? `${pw.marginW >= 0 ? '+' : ''}${number(pw.marginW, 0)} W${pw.marginW < 0 ? ` · usa batería (${number(pw.batteryWh, 0)} Wh)` : ''}` : 'No disponible'],
      ['Energía de la misión', pw?.missionSustainable == null ? 'No evaluada' : pw.missionSustainable ? 'Suficiente según el modelo' : 'Insuficiente según el modelo'],
      ['Maniobras completadas', done.length ? done.join(' · ') : 'Ninguna todavía'], ['Veredicto de la cadena', t.verdict], ['Estado de validación', t.validation]]);
    $('#mc-energy-note').textContent = t.limits.join(' ');
    $('#mc-elapsed').textContent = `${number(position.elapsedSeconds / 86400, 3)} d transcurridos`;
    $('#mc-remaining').textContent = `${number(t.time.remainingDays, 3)} d restantes`;
  }
  function refresh() { refreshCore(); updateHud(); }
  const HUD_KIND = { integrated: 'Misión completa', interplanetary: 'Transferencia interplanetaria', landing: 'Descenso y aterrizaje', launch: 'Lanzamiento terrestre', 'finite-thrust': 'Empuje finito', mission: 'Tierra–Luna' };
  const HUD_FIELDS = [
    [/^Altitud( WGS84| Tierra)?$/, 'Altitud'], [/^(Rapidez respecto al cuerpo central|Rapidez heliocéntrica|Velocidad inercial|Velocidad orbital \(inercial\)|Velocidad relativa lunar|Velocidad respecto a la superficie|Velocidad respecto a la atmósfera)$/, 'Velocidad'],
    [/^Distancia al Sol$/, 'Distancia al Sol'], [/^Masa (total|instantánea)$/, 'Masa'],
    [/^(Propelente restante|Combustible restante|Propelente del módulo)$/, 'Propelente'], [/^Motor$/, 'Motor']];
  let hudPhase = '';
  function updateHud() {
    const hud = $('#mc-hud'), transport = $('#mc-transport');
    hud.hidden = transport.hidden = !execution;
    if (!execution || !clock) return;
    const snap = clock.snapshot();
    const phase = $('#mc-outcome').textContent.split(' · ')[0];
    $('#mc-hud-kind').textContent = HUD_KIND[execution.kind] ?? 'Misión';
    if (phase !== hudPhase) {
      hudPhase = phase; $('#mc-hud-phase').textContent = phase;
      const box = $('#mc-hud-phase-box'); box.classList.remove('is-changing'); void box.offsetWidth; box.classList.add('is-changing');
    }
    $('#mc-hud-time').textContent = `${$('#mc-stage-status').textContent} · ${$('#mc-elapsed').textContent}`;
    const rows = [...host.querySelectorAll('#mc-state-metrics .lab-metric, #mc-derived-metrics .lab-metric, #mc-resource-metrics .lab-metric')]
      .map(row => [row.firstElementChild.textContent, row.lastElementChild.textContent]);
    const picked = [];
    for (const [pattern, label] of HUD_FIELDS) {
      // El HUD solo muestra magnitudes escalares; los vectores siguen completos en la telemetría.
      const row = rows.find(([name, value]) => pattern.test(name) && !value.trim().startsWith('['));
      if (row && picked.length < 4 && !picked.some(x => x[0] === label)) picked.push([label, row[1].length > 34 ? `${row[1].slice(0, 33)}…` : row[1]]);
    }
    const list = $('#mc-hud-metrics');
    if (list.children.length !== picked.length * 2) list.replaceChildren(...picked.flatMap(() => [document.createElement('dt'), document.createElement('dd')]));
    picked.forEach(([label, value], i) => { list.children[2 * i].textContent = label; list.children[2 * i + 1].textContent = value; });
    const max = Number($('#mc-timeline').max) || 1;
    $('#mc-track-fill').style.transform = `scaleX(${Math.min(1, Math.max(0, snap.elapsedSeconds / max))})`;
    $('#mc-tr-time').textContent = $('#mc-remaining').textContent;
    const play = transport.querySelector('[data-tr="play"]');
    play.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${snap.playing ? 'icon-pause' : 'icon-play'}"></use></svg>`;
    play.setAttribute('aria-label', snap.playing ? 'Pausar' : 'Reproducir');
    for (const tick of $('#mc-track-ticks').children) tick.setAttribute('aria-current', tick.dataset.event === selectedEvent ? 'step' : 'false');
  }
  function renderTicks() {
    const box = $('#mc-track-ticks'); box.replaceChildren();
    if (!execution) return;
    const total = execution.durationSeconds || 1;
    for (const event of execution.events.slice(0, 80)) {
      const tick = document.createElement('button'); tick.type = 'button'; tick.className = 'mc-tick'; tick.dataset.event = event.id;
      tick.style.left = `${Math.min(100, Math.max(0, event.elapsedSeconds / total * 100))}%`;
      tick.title = event.title; tick.setAttribute('aria-label', `Ir a: ${event.title}`);
      tick.addEventListener('click', clickEvent => { clickEvent.stopPropagation(); host.querySelector(`#mc-events button[data-event="${CSS.escape(event.id)}"]`)?.click(); });
      box.append(tick);
    }
  }
  function jumpEvent(step) {
    if (!execution || !clock) return;
    const t = clock.snapshot().elapsedSeconds, events = execution.events;
    const target = step > 0 ? events.find(e => e.elapsedSeconds > t + 1e-6) : [...events].reverse().find(e => e.elapsedSeconds < t - 1e-6);
    if (target) host.querySelector(`#mc-events button[data-event="${CSS.escape(target.id)}"]`)?.click();
  }
  function refreshCore() {
    if (!execution || !clock) return;
    try {
      const position = clock.snapshot();
      if (execution.kind === 'integrated') {
        const sample = sampleIntegratedExecution(execution, position.elapsedSeconds, contextMode === 'auto' ? null : contextMode);
        setViewContext(sample.context);
        const telemetry = deriveIntegratedTelemetry(execution, sample);
        setSummaries('integrated');
        view.setSample(sample.landingSample ?? sample, { beforeManeuver: sample.beforeContext });
        $('#mc-timeline').value = String(position.elapsedSeconds);
        $('#mc-stage-status').textContent = position.finished ? 'FINALIZADA LA REPRODUCCIÓN' : position.playing ? (position.direction < 0 ? 'REPRODUCCIÓN INVERSA' : 'EN REPRODUCCIÓN') : position.elapsedSeconds === 0 ? 'PREPARADA' : 'PAUSADA';
        $('#mc-outcome').textContent = `${telemetry.phaseLabel} · ${telemetry.phaseStatus ?? 'fase calculada'}. ${execution.mission.verdict}`;
        renderIntegrated(telemetry, position); updateSelectedEvent(position); $('#mc-model-note').textContent = INTEGRATED_NOTE;
        // 16: el marco «Descenso» solo aparece si la misión incluye un descenso (la interfaz ya no ofrece módulos de aterrizaje).
        for (const b of $('#mc-context').querySelectorAll('button')) { b.disabled = b.dataset.context !== 'auto' && !execution.contexts[b.dataset.context]; b.hidden = b.dataset.context === 'landing' && !execution.contexts.landing; b.setAttribute('aria-pressed', String(b.dataset.context === contextMode)); }
        $('#mc-play').textContent = position.playing ? 'En curso' : position.finished ? 'Reiniciar e iniciar' : position.elapsedSeconds === 0 ? 'Iniciar' : 'Reanudar';
        return;
      }
      if (execution.kind === 'interplanetary') {
        const sample = sampleInterplanetaryExecution(execution, position.elapsedSeconds), telemetry = deriveInterplanetaryTelemetry(execution, sample);
        setSummaries('interplanetary'); view.setSample(sample, { beforeManeuver: false });
        $('#mc-timeline').value = String(position.elapsedSeconds);
        $('#mc-stage-status').textContent = position.finished ? 'FINALIZADA LA REPRODUCCIÓN' : position.playing ? (position.direction < 0 ? 'REPRODUCCIÓN INVERSA' : 'EN REPRODUCCIÓN') : position.elapsedSeconds === 0 ? 'PREPARADA' : 'PAUSADA';
        $('#mc-outcome').textContent = `${PHASE_LABELS[telemetry.phase]} · transferencia heliocéntrica calculada (${execution.result.status.toLowerCase()}). Éxito de una misión interplanetaria completa: no evaluado. Viabilidad operativa: no verificada.`;
        renderInterplanetary(telemetry, position); updateSelectedEvent(position); $('#mc-model-note').textContent = INTERPLANETARY_NOTE;
        $('#mc-play').textContent = position.playing ? 'En curso' : position.finished ? 'Reiniciar e iniciar' : position.elapsedSeconds === 0 ? 'Iniciar' : 'Reanudar';
        return;
      }
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
        ? landingOutcomeText(PHASE_LABELS[telemetry.phase] ?? telemetry.phase, telemetry.result)
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
    if (execution?.kind === 'integrated') advanceIntegrated(realDelta); else clock.advance(realDelta);
    refresh();
    if (clock?.snapshot().playing && !interrupted) frame = requestAnimationFrame(tick);
    else stopFrame();
  }
  // 13: en modo automático el reloj adopta el ritmo sugerido para el tipo de tramo y se detiene un instante en cada frontera
  // de tramo (no salta encendidos de minutos a ritmos de días por segundo). En un ritmo manual avanza sin esas paradas.
  function advanceIntegrated(realDelta) {
    const snap = clock.snapshot(), t = snap.elapsedSeconds, segments = execution.mission.segments;
    if (!autoRate) { clock.advance(realDelta); return; }
    let index = 0;
    for (let i = 0; i < segments.length; i++) if (snap.direction > 0 ? segments[i].startSeconds <= t : segments[i].startSeconds < t) index = i;
    const rate = Math.min(INTEGRATED_MAX_RATE, AUTO_RATE[segments[index].phase] ?? 3600);
    if (rate !== snap.rate) clock.setRate(rate);
    const target = t + realDelta * rate * snap.direction;
    const crossing = snap.direction > 0 ? execution.boundaries.find(b => b > t + 1e-6 && b < target) : [...execution.boundaries].reverse().find(b => b < t - 1e-6 && b > target);
    if (crossing != null) clock.seek(crossing); else clock.advance(realDelta);
  }
  function startFrame() { if (frame == null && visible) { lastNow = null; frame = requestAnimationFrame(tick); } }
  function clear(reason) {
    stopFrame(); execution = null; clock = null; sourceResult = null; sourceDesign = null; sourceName = null; interrupted = false; viewContext = null; $('#mc-context').hidden = true;
    view.setExecution(null); $('#mc-stage-empty').hidden = false;
    $('#mc-readiness').textContent = reason || 'Calcula una misión viable en el Planificador para habilitar la ejecución.';
    $('#mc-stage-status').textContent = 'Sin plan vigente'; $('#mc-outcome').textContent = 'Sin datos de misión.';
    for (const selector of ['#mc-state-metrics', '#mc-derived-metrics', '#mc-resource-metrics', '#mc-energy-metrics']) $(selector).replaceChildren();
    $('#mc-energy-note').textContent = '';
    renderEvents(); updateAvailability(); message(''); updateHud();
  }
  function setPlan(candidate) {
    if (!candidate?.ready) { clear(candidate?.reason); return; }
    if (candidate.result === sourceResult && candidate.design === sourceDesign && candidate.name === sourceName) return;
    try {
      const next = candidate.kind === 'integrated' ? createIntegratedExecution(candidate) : candidate.kind === 'interplanetary' ? createInterplanetaryExecution(candidate) : candidate.kind === 'landing' ? createLandingExecution(candidate) : candidate.kind === 'launch' ? createLaunchExecution(candidate) : candidate.kind === 'finite-thrust' ? createFiniteThrustExecution(candidate) : createMissionExecution(candidate);
      stopFrame(); execution = next; clock = createPlaybackClock(next.durationSeconds, { maxRate: next.kind === 'interplanetary' ? INTERPLANETARY_MAX_RATE : next.kind === 'integrated' ? INTEGRATED_MAX_RATE : 86400 });
      viewContext = null; contextMode = 'auto'; autoRate = false;
      sourceResult = candidate.result; sourceDesign = candidate.design; sourceName = candidate.name; interrupted = false;
      if (next.kind === 'integrated') { setViewContext(sampleIntegratedExecution(next, 0).context); view.setCameraMode('overview', { instant: true }); }
      else view.setExecution(next);
      if (next.kind !== 'integrated') view.setSample(next.kind === 'interplanetary' ? sampleInterplanetaryExecution(next, 0) : next.kind === 'landing' ? sampleLandingExecution(next, 0) : next.kind === 'launch' ? sampleLaunchExecution(next, 0) : next.kind === 'finite-thrust' ? sampleFiniteThrustExecution(next, 0) : sampleMissionExecution(next, 0, { side: 'pre' }), { beforeManeuver: true });
      if (next.kind === 'launch') { clock.setRate(10); $('#mc-rate').value = '10'; }
      if (next.kind === 'landing') { clock.setRate(60); $('#mc-rate').value = '60'; }
      for (const option of $('#mc-rate').querySelectorAll('option[data-interplanetary]')) option.hidden = option.disabled = !['interplanetary', 'integrated'].includes(next.kind);
      for (const option of $('#mc-rate').querySelectorAll('option[data-integrated]')) option.hidden = option.disabled = next.kind !== 'integrated';
      $('#mc-context').hidden = next.kind !== 'integrated';
      if (next.kind === 'integrated') { autoRate = true; clock.setRate(AUTO_RATE.cruise); $('#mc-rate').value = 'auto'; }
      else if (next.kind === 'interplanetary') { clock.setRate(864000); $('#mc-rate').value = '864000'; }
      else if (Number($('#mc-rate').value) > 86400) { clock.setRate(3600); $('#mc-rate').value = '3600'; }
      const look = $('#mc-look');
      if (next.kind !== 'integrated') look.options[0].textContent = next.kind === 'interplanetary' ? `Destino (${next.result.destinationName})` : 'Luna';
      if (next.kind !== 'integrated') look.options[1].textContent = next.kind === 'interplanetary' ? `Origen (${next.result.originName})` : 'Tierra';
      $('#mc-foot').textContent = next.kind === 'integrated' ? FOOT_INTEGRATED[viewContext] : next.kind === 'interplanetary' ? FOOT_HELIO : FOOT_DEFAULT;
      $('#mc-stage-empty').hidden = true;
      $('#mc-readiness').textContent = next.kind === 'integrated'
        ? `Misión integrada Tierra → ${next.mission.moonName ?? next.mission.destinationName} vigente (${next.mission.segments.length} tramos conectados). ${next.mission.verdict}`
        : next.kind === 'interplanetary'
        ? `Transferencia ${next.result.originName} → ${next.result.destinationName} vigente. Reproducción de la cónica heliocéntrica calculada (Lambert); no incluye lanzamiento, correcciones ni captura, y no certifica una misión operativa.`
        : next.kind === 'landing'
        ? `Descenso local en ${next.simulation.bodyName} vigente. Reproducción de estados integrados en una escena local; el resultado es según el modelo y no certifica una misión operativa.`
        : next.kind === 'launch'
        ? 'Lanzamiento terrestre vigente. Reproducción de estados integrados (masa variable, separación y arrastre); el resultado orbital es según el modelo y no certifica una misión operativa.'
        : next.kind === 'finite-thrust'
        ? 'Maniobra de empuje finito vigente. Reproducción de estados integrados; el lanzamiento no está incluido y no se certifica el éxito de misión.'
        : 'Plan vigente y maniobra viable según el modelo. Reproducción de estados calculados; el lanzamiento no está incluido.';
      $('#mc-timeline').max = String(next.durationSeconds);
      renderEvents(); updateAvailability(); refresh(); message(preparedMessage(next));
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
  $('#mc-reset').addEventListener('click', () => { clock?.reset(); stopFrame(); refresh(); message(resetMessage(execution)); });
  $('#mc-rate').addEventListener('change', () => {
    autoRate = $('#mc-rate').value === 'auto';
    if (!autoRate) clock?.setRate(Number($('#mc-rate').value));
    refresh();
  });
  for (const button of $('#mc-context').querySelectorAll('button')) button.addEventListener('click', () => {
    contextMode = button.dataset.context; refresh();
    message(contextMode === 'auto' ? 'Marco de la vista automático: sigue al cuerpo central del tramo en curso.' : `Marco de la vista fijado: ${CONTEXT_LABELS[contextMode]}. Solo cambia el dibujo; el estado es el mismo.`);
  });
  $('#mc-timeline').addEventListener('input', () => {
    if (!clock) return;
    clock.pause(); stopFrame(); clock.seek(Number($('#mc-timeline').value)); refresh();
  });
  for (const button of $('.mc-camera-bar').querySelectorAll('button')) button.addEventListener('click', () => {
    view.setCameraMode(button.dataset.camera);
    if (execution) $('#mc-foot').textContent = execution.kind === 'integrated' ? FOOT_INTEGRATED[viewContext] : execution.kind === 'interplanetary' ? FOOT_HELIO : button.dataset.camera === 'local' && execution.kind === 'landing' ? FOOT_LANDING_LOCAL : FOOT_DEFAULT;
    for (const item of $('.mc-camera-bar').querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
    $('.mc-onboard-target').hidden = button.dataset.camera !== 'onboard';
  });
  $('#mc-look').addEventListener('change', () => view.setLookTarget($('#mc-look').value));
  $('#mc-transport').addEventListener('click', event => {
    const action = event.target.closest('[data-tr]')?.dataset.tr;
    if (!action || !clock) return;
    if (action === 'play') { if (clock.snapshot().playing) $('#mc-pause').click(); else $('#mc-play').click(); }
    else if (action === 'reverse') $('#mc-reverse').click();
    else jumpEvent(action === 'next' ? 1 : -1);
  });
  $('#mc-track').addEventListener('click', event => {
    if (!clock || event.target.closest('.mc-tick')) return;
    const box = $('#mc-track').getBoundingClientRect();
    const input = $('#mc-timeline');
    input.value = String(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * Number(input.max));
    input.dispatchEvent(new Event('input'));
  });
  function setPanels(consoleVisible, telemetryVisible) {
    host.dataset.console = consoleVisible ? 'shown' : 'hidden';
    host.dataset.telemetry = telemetryVisible ? 'shown' : 'hidden';
    const pressed = { console: consoleVisible, telemetry: telemetryVisible, wide: !consoleVisible && !telemetryVisible };
    for (const button of host.querySelectorAll('[data-mc-panel]')) button.setAttribute('aria-pressed', String(pressed[button.dataset.mcPanel]));
  }
  for (const button of host.querySelectorAll('[data-mc-panel]')) button.addEventListener('click', () => {
    const consoleVisible = host.dataset.console !== 'hidden', telemetryVisible = host.dataset.telemetry !== 'hidden';
    if (button.dataset.mcPanel === 'console') setPanels(!consoleVisible, telemetryVisible);
    else if (button.dataset.mcPanel === 'telemetry') setPanels(consoleVisible, !telemetryVisible);
    else { const wide = consoleVisible || telemetryVisible; setPanels(!wide, !wide); }
  });
  setPanels(true, true);
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
