import { createMissionExecution, createPlaybackClock, sampleMissionExecution } from '../lab/MissionPlayback.js';
import { deriveMissionTelemetry } from '../lab/MissionTelemetry.js';
import { createFiniteThrustExecution, deriveFiniteThrustTelemetry, sampleFiniteThrustExecution } from '../lab/FiniteThrustPlayback.js';
import { createLaunchExecution, deriveLaunchTelemetry, sampleLaunchExecution } from '../lab/LaunchPlayback.js';
import { createLandingExecution, deriveLandingTelemetry, sampleLandingExecution } from '../lab/BodyLandingPlayback.js';
import { createInterplanetaryExecution, deriveInterplanetaryTelemetry, sampleInterplanetaryExecution, INTERPLANETARY_MAX_RATE } from '../lab/InterplanetaryPlayback.js';
import { createIntegratedExecution, sampleIntegratedExecution, deriveIntegratedTelemetry, segmentAtTime, INTEGRATED_MAX_RATE, AUTO_RATE, CONTEXT_LABELS } from '../lab/IntegratedMissionPlayback.js';
import { tdbToTimeScales } from '../science/AstrodynamicsTime.js';
import { createMissionExecutionView, MISSION_CAMERA_MODES } from '../lab/MissionExecutionView.js';
import { formatMissionTdb } from './MissionTimeDisplay.js';
import { agruparMarcas, ventanaZoom, accionTeclaCentroMision, esquemaOrbita, instanteLineaTiempo, textoValorLineaTiempo, anuncioCambioFase } from './MissionPlaybackAids.js';
import { compararConMisionReal, REAL_MISSION_SOURCES } from '../lab/RealMissionHistory.js';
import { KM_PER_AU } from '../science/Units.js';
import { mostrarVista3DNoDisponible } from './WebGLUnavailableNotice.js';
import { getQualityState } from '../graphics/QualityProfile.js';

// 26: un formateador por número de decimales; crear uno nuevo en cada llamada costaba CPU en cada fotograma de la reproducción.
const formatosNumero = new Map();
const number = (value, digits = 1) => {
  if (!Number.isFinite(value)) return 'No disponible';
  let formato = formatosNumero.get(digits);
  if (!formato) formatosNumero.set(digits, formato = new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits, signDisplay: 'negative' })); // sin «-0» al redondear
  return formato.format(value);
};
// 26: escribir en el DOM solo lo que cambia. La reproducción actualiza estos paneles en cada fotograma; reescribir el mismo texto o
// el mismo atributo invalida estilos y despierta al glosario (que vuelve a anotar los términos) sin cambiar nada visible.
const setText = (element, text) => { const value = text == null ? '' : String(text); if (element.textContent !== value) element.textContent = value; };
const setAttr = (element, name, value) => { if (element.getAttribute(name) !== value) element.setAttribute(name, value); };
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
  departure: 'Salida heliocéntrica', 'cruise-helio': 'Crucero heliocéntrico (cónica)', 'arrival-helio': 'Llegada al destino (sin captura)' });
const INTERPLANETARY_SUMMARIES = Object.freeze({ '#mc-state-metrics': 'Estado heliocéntrico (ICRF eclíptico J2000, TDB)', '#mc-derived-metrics': 'Distancias y velocidades relativas',
  '#mc-resource-metrics': 'Requisitos de la transferencia (sin maniobras propagadas)', '#mc-energy-metrics': 'Procedencia, modelo y validación' });
const FOOT_DEFAULT = 'Centros y trayectoria: 1 unidad = 10 000 km · marcadores ilustrativos · nave ampliada en vistas cercanas: 0,25 unidades por metro · orientación visual alineada con velocidad, sin control de actitud';
const FOOT_LANDING_LOCAL = 'Cámara local: escena del cuerpo central (radio → 0,6371 u) · nave ampliada y apoyada por su base sobre el punto calculado, orientada con la vertical local · parche de suelo a radio R exacto · sin control de actitud';
const INTEGRATED_SUMMARIES = Object.freeze({ '#mc-state-metrics': 'Fase, época y estado en el marco del cuerpo central', '#mc-derived-metrics': 'Órbita osculante y distancias',
  '#mc-resource-metrics': 'Motor, masa y propelente por depósito', '#mc-energy-metrics': 'Energía eléctrica, maniobras y límites' });
// 13: pie de la vista según el contexto dibujado de la misión integrada.
const FOOT_INTEGRATED = Object.freeze({ helio: 'Contexto heliocéntrico: 32 unidades = 1 AU (centros) · Sol, planetas y nave con tamaños ampliados ilustrativos · estados de los tramos calculados convertidos al marco del Sol con las efemérides en la misma época TDB',
  earth: 'Contexto geocéntrico (salida desde la plataforma): 1 unidad = 10 000 km (centros) · Tierra a tamaño real, sin textura ni rotación dibujada; marcador de la nave ampliado (ilustrativo) · ejes ICRF eclíptico J2000',
  planet: 'Contexto planetocéntrico: 1 unidad = 10 000 km (centros) · planeta a tamaño real; marcadores de nave y satélite ampliados (ilustrativos) · ejes ICRF eclíptico J2000',
  moon: 'Contexto centrado en el satélite: 1 unidad = 10 000 km · satélite a tamaño real; marcador de la nave ampliado (ilustrativo) · ejes ICRF eclíptico J2000',
  landing: 'Escena local del descenso (12F): radio del cuerpo → 0,6371 u · el estado inicial del descenso es el estado final de la captura (mismo marco centrado en el satélite)' });
const FOOT_HELIO = 'Escena heliocéntrica: 32 unidades = 1 AU (centros) · Sol, planetas y nave con tamaños ampliados ilustrativos · la sonda sigue la cónica propagada desde la solución de Lambert';
// 17.1: las misiones heliocéntricas se reproducen en el Sistema Solar principal (mismos ejes y escala que la exploración).
export const FOOT_MAIN_SCENE = 'Sistema Solar principal: 32 unidades = 1 AU · radios 1:1 · planetas en la época TDB de cada instante, sin extrapolar · nave ampliada (menor cerca del destino), orientada a la Tierra · sin satélites';
// 23: con un satélite galileano en la misión, sus cuatro satélites se dibujan con la ventana de Horizons del cálculo.
const jdDate = jd => new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10);
export function mainSceneFoot(state) {
  if (!state?.moon || !state.moonCoverage) return FOOT_MAIN_SCENE;
  return `Sistema Solar principal: 32 unidades = 1 AU · radios 1:1 · época TDB de cada instante, sin extrapolar · satélites galileanos de Horizons solo en su ventana (${jdDate(state.moonCoverage.startJdTdb)} → ${jdDate(state.moonCoverage.endJdTdb)} TDB) · nave ampliada, orientada a la Tierra`;
}
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

const CAMERA_DESCRIPTIONS = Object.freeze({ overview: 'Encuadra toda la trayectoria calculada y los cuerpos del tramo.',
  exterior: 'Sigue a la nave desde fuera, a corta distancia.', onboard: 'Desde la posición de la nave hacia lo que elijas en «Mirar hacia».',
  destination: 'Desde las cercanías del destino, mirando hacia la nave.', cinematic: 'Por detrás de la nave, en la dirección de su movimiento.',
  local: 'Escena local del cuerpo central (lanzamiento y descenso).' });
// 17.1: en el Sistema Solar principal las cámaras usan la cámara de la escena; la de destino compone el planeta y la nave al llegar.
export const MAIN_SCENE_CAMERA_DESCRIPTIONS = Object.freeze({ overview: 'Encuadra la trayectoria calculada, la Tierra, el destino y la nave en el Sistema Solar.',
  exterior: 'Sigue a la nave desde fuera, a corta distancia.', destination: 'Desde las cercanías del planeta de destino (o del satélite durante su fase), mirando hacia la nave. Si arrastras, la cámara pasa a tu control.' });
export const MC_PANES = Object.freeze({ playback: 'Reproducción', cameras: 'Cámaras', telemetry: 'Telemetría', trajectory: 'Trayectoria y maniobras', events: 'Eventos', results: 'Resultados' });

/**
 * 17.1: zona libre y recorte del Sistema Solar principal dentro de la ventana de la escena (rectángulos de getBoundingClientRect;
 * el resultado, en coordenadas del lienzo). La zona queda entre la barra de cámaras y la de reproducción, a la derecha de la ficha de
 * fase si hay sitio. 17.1.1 (D-01): si entre las barras no quedan MAIN_SCENE_MIN_FREE_HEIGHT px (teléfonos bajos), se encuadra en
 * toda la ventana: mejor bajo las barras que fuera de ella. El recorte es siempre la ventana completa. Solo presentación.
 */
export const MAIN_SCENE_MIN_FREE_HEIGHT = 96;
export function mainSceneFrameZone({ stage: r, bar = null, transport = null, hud = null, canvas, radius = 0, obstacles = [] }) {
  const left = hud?.width && r.right - hud.right >= 380 ? hud.right + 36 : r.left + 16; // 36 px: sitio para el rótulo del planeta
  let top = (bar?.height ? bar.bottom : r.top + 56) + 8, bottom = (transport?.height ? transport.top : r.bottom - 48) - 8;
  if (bottom - top < MAIN_SCENE_MIN_FREE_HEIGHT) { top = r.top + 8; bottom = r.bottom - 8; }
  // 24: controles sobre la escena (estado, cámaras, HUD, reproducción…) que los rótulos de los planetas deben esquivar.
  const obstaculos = [bar, transport, hud, ...obstacles].filter(o => o?.width > 0 && o?.height > 0)
    .map(o => ({ left: o.left - canvas.left - 4, right: o.right - canvas.left + 4, top: o.top - canvas.top - 4, bottom: o.bottom - canvas.top + 4 }));
  return { left: left - canvas.left, right: r.right - canvas.left - 16, top: top - canvas.top, bottom: bottom - canvas.top, obstaculos,
    // El Sistema Solar solo se dibuja dentro de la ventana de la escena (borde redondeado incluido).
    recorte: { top: r.top - canvas.top, right: canvas.right - r.right, bottom: canvas.bottom - r.bottom, left: r.left - canvas.left, radius } };
}

export function createMissionControlCenter(host, onOpenPlanner, { onImmersive = () => {}, onOpenResults = onOpenPlanner, sceneView = null, onSceneMode = () => {}, onPane = () => {} } = {}) {
  host.classList.add('mission-control');
  // 17: la escena ocupa el centro y un único panel lateral reúne, por pestañas, reproducción, cámaras, telemetría,
  // trayectoria, eventos y resultados. Mismos identificadores que antes: la lógica de reproducción no cambia.
  host.innerHTML = `
    <div class="mc-stage lab-stage"><div class="lab-stage-top"><span class="eyebrow">MISIÓN EN REPRODUCCIÓN / ESTADOS CALCULADOS</span><strong id="mc-stage-status">Sin plan vigente</strong>
        <div class="mc-layout-toggles" role="group" aria-label="Paneles del Centro de Misión"><button type="button" data-mc-panel="drawer" aria-pressed="true" aria-controls="mc-drawer" title="Mostrar u ocultar el panel lateral (la reproducción sigue)">Panel</button><button type="button" data-mc-panel="immersive" aria-pressed="false" title="Vista inmersiva: solo la escena y los controles mínimos (Esc para salir)"><svg class="icon" aria-hidden="true"><use href="#icon-expand"></use></svg><span>Vista inmersiva</span></button></div></div>
      <div id="mc-canvas" aria-label="Visualización 3D de la sonda y de la trayectoria calculada"></div>
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
        <button type="button" class="mc-zoom-exit" id="mc-zoom-exit" hidden title="La barra muestra un intervalo ampliado; volver a ver toda la misión">Toda la misión</button>
        <button type="button" class="mc-sheet-toggle" data-mc-panel="sheet" aria-expanded="false" aria-controls="mc-drawer" title="Abrir el panel del Centro de Misión">Panel</button>
        <button type="button" class="mc-exit-immersive" data-mc-panel="exit-immersive" title="Salir de la vista inmersiva (Esc)">Salir</button>
      </div>
      <div id="mc-stage-empty" class="lab-empty"><strong>Sin trayectoria ejecutable</strong><span id="mc-empty-reason">Calcula una misión en «2 · Planificar» y pulsa «Reproducir en el Centro de Misión». La escena usará la sonda y los estados de ese cálculo.</span>
        <span class="mc-empty-actions"><button type="button" id="mc-empty-plan" class="button-primary">Ir a Planificar</button></span></div>
      <div class="lab-stage-foot"><span id="mc-foot">Centros y trayectoria: 1 unidad = 10 000 km · marcadores ilustrativos · nave ampliada en vistas cercanas: 0,25 unidades por metro · orientación visual alineada con velocidad, sin control de actitud</span></div>
    </div>
    <aside class="mc-drawer lab-panel" id="mc-drawer" aria-labelledby="mc-pane-title">
      <div class="lab-panel-heading"><span class="eyebrow">3 / REPRODUCIR</span><p id="mc-pane-title" class="lab-panel-title">Reproducción</p>
        <div class="mc-sheet-head"><div class="mc-sheet-tabs" role="group" aria-label="Secciones del panel">${Object.entries(MC_PANES).map(([id, label]) => `<button type="button" data-sheet-pane="${id}" aria-pressed="false">${label}</button>`).join('')}</div>
          <button type="button" class="mc-sheet-close" data-mc-panel="sheet-close" aria-label="Cerrar el panel" title="Cerrar el panel (Esc)">×</button></div></div>
      <div class="lab-panel-scroll">
        <section class="mc-pane" data-pane="playback">
          <div id="mc-vehicle" class="mc-vehicle" data-state="none"><span>Vehículo en la escena</span><strong id="mc-vehicle-name">Ninguno</strong><small id="mc-vehicle-model">Sin misión en reproducción</small></div>
          <div id="mc-readiness" class="mc-readiness" role="status">Calcula una misión viable en el Planificador para habilitar la ejecución.</div>
          <button id="mc-open-planner" type="button">Volver a «2 · Planificar»</button>
          <div class="lab-divider"></div>
          <div class="mc-actions"><button id="mc-play" type="button">Iniciar</button><button id="mc-pause" type="button">Pausar</button><button id="mc-reverse" type="button">Retroceder</button><button id="mc-reset" type="button">Reiniciar</button></div>
          <label class="lab-field">Velocidad temporal<select id="mc-rate"><option value="1">×1 · tiempo real</option><option value="10">×10</option><option value="60">×60 · 1 min/s</option><option value="600">×600 · 10 min/s</option><option value="3600" selected>×3 600 · 1 h/s</option><option value="21600">×21 600 · 6 h/s</option><option value="86400">×86 400 · 1 día/s</option><option value="864000" data-interplanetary>10 días/s</option><option value="2592000" data-interplanetary>30 días/s</option><option value="8640000" data-interplanetary>100 días/s</option><option value="auto" data-integrated>Automático por fase</option></select></label>
          <div id="mc-context" class="mc-context" role="group" aria-label="Marco de la vista" hidden><button type="button" data-context="auto" aria-pressed="true">Automático</button><button type="button" data-context="earth" aria-pressed="false">Tierra</button><button type="button" data-context="helio" aria-pressed="false">Sol</button><button type="button" data-context="planet" aria-pressed="false">Planeta</button><button type="button" data-context="moon" aria-pressed="false">Satélite</button><button type="button" data-context="landing" aria-pressed="false">Descenso</button></div>
          <label class="lab-field">Instante de misión<input id="mc-timeline" type="range" min="0" max="1" step="0.001" value="0"></label>
          <div class="mc-time-row"><span id="mc-elapsed">0 s</span><span id="mc-remaining">No disponible</span></div>
          <p id="mc-message" class="lab-message" role="status"></p><p id="mc-announcer" class="sr-only" role="status" aria-live="polite"></p>
        </section>
        <section class="mc-pane" data-pane="cameras" hidden>
          <p class="mission-hint">Las cámaras solo cambian el encuadre: los estados calculados son los mismos. También puedes cambiarlas desde la barra sobre la escena.</p>
          <div id="mc-camera-list" class="mc-camera-list" role="group" aria-label="Elegir cámara"></div>
        </section>
        <section class="mc-pane" data-pane="telemetry" hidden>
          <div class="mc-units" role="group" aria-label="Unidades de las distancias"><span>Distancias</span><button type="button" data-unit="auto" aria-pressed="true" title="Kilómetros; distancia al Sol también en AU">Auto</button><button type="button" data-unit="km" aria-pressed="false">km</button><button type="button" data-unit="au" aria-pressed="false" title="Unidad astronómica: 1 AU = 149 597 870,7 km (IAU 2012)">AU</button></div>
          <p class="mission-hint mc-units-note">Solo cambia cómo se muestran las distancias derivadas; la posición del estado y las altitudes siguen en km.</p>
          <details open><summary>Estado propagado y efeméride</summary><div id="mc-state-metrics" class="lab-metrics"></div></details>
          <details open><summary>Distancias derivadas</summary><div id="mc-derived-metrics" class="lab-metrics"></div></details>
          <details><summary>Potencia estimada y límites</summary><div id="mc-energy-metrics" class="lab-metrics"></div><p id="mc-energy-note" class="mission-hint"></p></details>
        </section>
        <section class="mc-pane" data-pane="trajectory" hidden>
          <div id="mc-trajectory" class="mc-trajectory"><p class="mission-hint">Sin trayectoria en reproducción.</p></div>
          <details open><summary>Maniobra y recursos</summary><div id="mc-resource-metrics" class="lab-metrics"></div></details>
        </section>
        <section class="mc-pane" data-pane="events" hidden>
          <p class="mission-hint">Pulsa un evento para saltar a su instante calculado; también puedes usar las marcas de la barra inferior.</p>
          <div id="mc-events" class="mc-events"></div>
        </section>
        <section class="mc-pane" data-pane="results" hidden>
          <div id="mc-outcome" class="mc-outcome">Sin datos de misión.</div>
          <div id="mc-results" class="mc-results"></div>
          <p id="mc-model-note" class="mission-hint">La reproducción recorre una trayectoria integrada; el impulso es instantáneo. La masa se toma del presupuesto de misión, no de una combustión simulada.</p>
          <button type="button" id="mc-open-results">Ver los cálculos completos en Planificar</button>
        </section>
      </div>
    </aside>`;
  const $ = selector => host.querySelector(selector);
  const controls = ['mc-play', 'mc-pause', 'mc-reverse', 'mc-reset', 'mc-rate', 'mc-timeline'];
  for (const mode of MISSION_CAMERA_MODES) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.camera = mode; button.textContent = CAMERA_LABELS[mode];
    $('.mc-camera-bar').append(button);
    // 17: la pestaña «Cámaras» repite las mismas cámaras con una explicación; ambas listas llaman al mismo control.
    const item = document.createElement('button'); item.type = 'button'; item.dataset.camera = mode; item.className = 'mc-camera-item';
    const name = document.createElement('strong'); name.textContent = CAMERA_LABELS[mode];
    const desc = document.createElement('small'); desc.textContent = CAMERA_DESCRIPTIONS[mode] ?? '';
    item.append(name, desc); $('#mc-camera-list').append(item);
  }
  let execution = null, clock = null, sourceResult = null, sourceDesign = null, sourceName = null;
  let visible = false, frame = null, lastNow = null, interrupted = false, selectedEvent = 'parking';
  let contextMode = 'auto', viewContext = null, autoRate = false, pane = 'playback', modelInfo = null;
  // 17.1: `sceneActive` = la ejecución vigente se dibuja en el Sistema Solar principal (sceneView) y no en la escena local.
  let sceneActive = false, sceneNote = '';
  let view;
  // 17: identidad del vehículo en la escena: el nombre y el modelo 3D salen del diseño con el que se calculó la misión.
  function renderVehicle() {
    const card = $('#mc-vehicle');
    if (!execution) { card.dataset.state = 'none'; $('#mc-vehicle-name').textContent = 'Ninguno'; $('#mc-vehicle-model').textContent = 'Sin misión en reproducción'; delete host.dataset.vehicle; delete host.dataset.vehicleModel; return; }
    const design = execution.design ?? sourceDesign ?? null;
    $('#mc-vehicle-name').textContent = design?.name ?? 'Sin sonda asociada';
    const status = modelInfo?.status ?? (design ? 'cargando' : 'sin-sonda');
    $('#mc-vehicle-model').textContent = !design ? 'La transferencia se calculó sin vehículo: solo requisitos.'
      : design.experimental ? 'Ensamblaje experimental: reconstrucción técnica del simulador (no hay modelo oficial de esta combinación).'
      : status === 'nasa' ? 'Modelo 3D oficial de NASA de esta sonda' : status === 'cargando' ? 'Cargando el modelo 3D de NASA…'
      : 'Reconstrucción procedimental (no se pudo cargar el modelo de NASA)';
    card.dataset.state = design?.experimental ? 'experimental' : status;
    host.dataset.vehicle = design?.basedOn ?? (design ? 'experimental' : 'ninguno');
    host.dataset.vehicleModel = status;
  }
  try { view = createMissionExecutionView($('#mc-canvas'), { onModel: info => { modelInfo = info; renderVehicle(); } }); }
  catch (error) {
    mostrarVista3DNoDisponible($('#mc-canvas'), error, { vista: 'La vista 3D del Centro de Misión', sigue: 'La telemetría y la reproducción temporal siguen disponibles.' }); // STAB-01
    console.error('Centro de Misión 3D no disponible:', error);
    view = { setExecution() {}, setSample() {}, setCameraMode() {}, setLookTarget() {}, setTouchInteraction() {}, setVisible() {}, dispose() {}, getCameraMode: () => 'overview' };
  }
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  $('#mc-touch-toggle').hidden = !coarse;
  // En pantallas táctiles el arrastre desplaza la página hasta activar el control 3D (también en la escena principal).
  host.dataset.touch3d = coarse ? 'off' : 'on';
  host.dataset.scene = 'local';
  const activeView = () => (sceneActive ? sceneView : view);
  function publishSceneMode() { onSceneMode(visible && sceneActive ? 'main' : null); }
  // El Sistema Solar principal encuadra en el área de la escena del Centro de Misión, entre la barra de cámaras y la de reproducción.
  sceneView?.setFrameZoneProvider(canvas => {
    const stage = host.querySelector('.mc-stage');
    if (!visible || !stage?.getClientRects().length) return null;
    return mainSceneFrameZone({ stage: stage.getBoundingClientRect(), bar: host.querySelector('.mc-camera-bar')?.getBoundingClientRect(),
      transport: host.querySelector('#mc-transport:not([hidden])')?.getBoundingClientRect(), hud: host.querySelector('#mc-hud:not([hidden])')?.getBoundingClientRect(),
      canvas, radius: parseFloat(getComputedStyle(stage).borderTopLeftRadius) || 0,
      obstacles: [...host.querySelectorAll('.mc-stage .lab-stage-top > :is(.eyebrow, strong, .mc-layout-toggles), .mc-stage > .lab-stage-foot, .mc-onboard-target:not([hidden]), #mc-touch-toggle:not([hidden])')].map(el => el.getBoundingClientRect()) });
  });
  // La vista general se recalcula cuando la ventana de la escena cambia de tamaño de forma apreciable (vista inmersiva,
  // panel lateral oculto, panel de etapas plegado, giro o cambio de tamaño de la ventana). Espera a que acabe la transición CSS.
  let stageSize = null, reframeTimer = null;
  const stageObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    const changed = !stageSize || Math.abs(width - stageSize.width) > stageSize.width * 0.12 || Math.abs(height - stageSize.height) > stageSize.height * 0.12;
    if (!changed) return;
    stageSize = { width, height };
    clearTimeout(reframeTimer);
    reframeTimer = setTimeout(() => { if (visible && sceneActive) sceneView?.reframe?.(); }, 360);
  }) : null;
  if (sceneView) stageObserver?.observe(host.querySelector('.mc-stage'));
  function applyCameraButtons() {
    for (const button of host.querySelectorAll('[data-camera]')) {
      const mode = button.dataset.camera;
      // La cámara local solo existe para ejecuciones con cuerpo central local (lanzamiento, descenso).
      const local = mode === 'local' && !(execution && (['launch', 'landing'].includes(execution.kind) || (execution.kind === 'integrated' && viewContext === 'landing')));
      button.hidden = local || (sceneActive && !sceneView.cameraModes.includes(mode));
      const desc = button.querySelector('small');
      if (desc) desc.textContent = (sceneActive ? MAIN_SCENE_CAMERA_DESCRIPTIONS[mode] : null) ?? CAMERA_DESCRIPTIONS[mode] ?? '';
    }
  }
  function setSceneActive(value) {
    sceneActive = Boolean(value && sceneView);
    host.dataset.scene = sceneActive ? 'main' : 'local';
    view.setVisible(visible && !sceneActive);
    sceneView?.setVisible(visible && sceneActive);
    $('#mc-context').hidden = sceneActive || execution?.kind !== 'integrated';
    if (sceneActive) $('.mc-onboard-target').hidden = true;
    applyCameraButtons(); publishSceneMode();
  }
  // Prepara el Sistema Solar principal para la ejecución; mientras tanto (o si no procede) se usa la escena local.
  function prepareScene(next) {
    setSceneActive(false); sceneNote = '';
    if (!sceneView) return;
    const support = sceneView.supports(next);
    if (!support.ok) { sceneView.clear(); sceneNote = support.reason; return; }
    $('#mc-foot').textContent = 'Preparando el Sistema Solar principal: efemérides de los ocho planetas en la época de la misión…';
    sceneView.prepare(next, { name: next.design?.name }).then(result => {
      if (execution !== next) return;
      if (!result.ok) { if (result.reason !== 'superseded') { sceneNote = result.reason; message(result.reason); } $('#mc-foot').textContent = execution.kind === 'integrated' ? FOOT_INTEGRATED[viewContext] : FOOT_HELIO; return; }
      setSceneActive(true);
      $('#mc-foot').textContent = mainSceneFoot(sceneView.getState());
      sceneView.setCameraMode('overview');
      for (const item of host.querySelectorAll('button[data-camera]')) item.setAttribute('aria-pressed', String(item.dataset.camera === 'overview'));
      refresh();
    });
  }
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
    rows.forEach(([label, value], index) => { setText(panel.children[index].firstElementChild, label); setText(panel.children[index].lastElementChild, value); });
  }
  function updateAvailability() {
    for (const id of controls) $(`#${id}`).disabled = !execution;
    for (const button of host.querySelectorAll('[data-camera]')) button.disabled = !execution;
    applyCameraButtons();
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
        departure: 'salida', perihelion: 'perihelio', aphelion: 'afelio', arrival: 'llegada', soi: 'esfera de influencia', orbit: 'órbita' }[event.kind] ?? event.kind;
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
    for (const button of $('#mc-events').querySelectorAll('button')) setAttr(button, 'aria-current', button.dataset.event === selectedEvent ? 'step' : 'false');
  }
  const LAUNCH_NOTE = 'La reproducción muestrea estados integrados con masa variable: retroceder o repetir no consume propelente ni repite la separación. La trayectoria es integrada; la orientación del empuje es programada e idealizada; los modelos 3D son ilustrativos y sin llamas ni humo.';
  const ORIGINAL_SUMMARIES = {};
  function setSummaries(kind) {
    for (const [selector, text] of Object.entries(LAUNCH_SUMMARIES)) {
      const summary = $(selector).parentElement.firstElementChild;
      ORIGINAL_SUMMARIES[selector] ??= summary.textContent;
      setText(summary, kind === 'launch' ? text : kind === 'landing' ? LANDING_SUMMARIES[selector] : kind === 'interplanetary' ? INTERPLANETARY_SUMMARIES[selector] : kind === 'integrated' ? INTEGRATED_SUMMARIES[selector] : ORIGINAL_SUMMARIES[selector]);
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
    setText($('#mc-energy-note'), `${t.provenance.spacecraft} ${t.provenance.atmosphere} ${t.provenance.limits}`);
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
    setText($('#mc-energy-note'), `${t.provenance.spacecraft} ${t.provenance.frame} ${t.provenance.limits}`);
  }
  const INTERPLANETARY_NOTE = 'La sonda sigue la cónica heliocéntrica propagada (Kepler, μ solar) desde la velocidad de Lambert; los planetas siguen las efemérides de Horizons interpoladas por Hermite. Reproducir o retroceder no recalcula ni consume propelente: no hay maniobras propagadas durante el crucero.';
  // 24: unidad de las distancias derivadas (solo presentación). «auto» conserva lo de antes: km, y la distancia al Sol también
  // (o solo, en la misión completa) en AU.
  let distanceUnit = 'auto', lastTime = null;
  function distance(kmValue, { digits = 0, sun = false, auOnly = false } = {}) {
    if (!Number.isFinite(kmValue)) return 'No disponible';
    const au = `${number(kmValue / KM_PER_AU, distanceUnit === 'au' ? 6 : auOnly ? 5 : 4)} AU`, kmText = `${number(kmValue, digits)} km`;
    if (distanceUnit === 'au') return au;
    if (distanceUnit === 'km') return kmText;
    return sun ? (auOnly ? au : `${kmText} · ${au}`) : kmText;
  }
  const tdbMinusUtcText = jdTdb => { const d = tdbToTimeScales(jdTdb).tdbMinusUtcSeconds; return Number.isFinite(d) ? `${number(d, 3)} s en este instante` : 'No disponible'; };
  function renderInterplanetary(t, position) {
    const q = t.requirements;
    metrics('#mc-state-metrics', [['Tipo de misión', 'Transferencia interplanetaria preliminar'], ['Misión', t.missionName], ['Origen → destino', `${t.originName} → ${t.destinationName}`],
      ['Sonda', t.probeName], ['Fase', PHASE_LABELS[t.phase] ?? t.phase], ['Fecha UTC', `${t.time.utc}${t.time.utcPredicted ? ' (predicción: sin segundos intercalares futuros)' : ''}`],
      ['Época TDB', `${t.time.tdb} · JD ${number(t.time.jdTdb, 5)}`], ['TDB − UTC', tdbMinusUtcText(t.time.jdTdb)], ['Desde la salida', `${number(t.time.elapsedDays, 2)} d`], ['Tiempo restante', `${number(t.time.remainingDays, 2)} d`],
      ['Marco', 'Heliocéntrico ICRF eclíptico J2000 (centro del Sol 500@10)'], ['Posición', `${vector(t.state.positionKm, 0)} km`], ['Velocidad', `${vector(t.state.velocityKmS, 4)} km/s`]]);
    lastTime = t.time;
    metrics('#mc-derived-metrics', [['Distancia al Sol', distance(t.derived.sunDistanceKm, { sun: true })], ['Rapidez heliocéntrica', `${number(t.derived.speedKmS, 4)} km/s`],
      [`Distancia a ${t.originName}`, distance(t.derived.originDistanceKm)], [`Distancia a ${t.destinationName}`, distance(t.derived.destinationDistanceKm)],
      [`Velocidad relativa a ${t.destinationName}`, `${number(t.derived.destinationRelativeSpeedKmS, 4)} km/s`]]);
    metrics('#mc-resource-metrics', [['C3 de salida', `${number(q.c3Km2S2, 3)} km²/s²`], ['v∞ de salida', `${number(q.vInfDepartureKmS, 4)} km/s`],
      ['v∞ de llegada', `${number(q.vInfArrivalKmS, 4)} km/s`], ['Duración total', `${number(q.durationDays, 2)} d`],
      [`Δv ideal de inyección (órbita de ${number(q.parkingAltitudeKm, 0)} km)`, `${number(q.injectionDeltaVKmS, 4)} km/s · no propagado`],
      ['Combustible durante el crucero', 'No aplica: sin maniobras programadas ni integradas']]);
    metrics('#mc-energy-metrics', [['Efemérides', `${t.provenance.source} · ${t.provenance.datasets.join(', ')}`], ['Soluciones JPL', t.provenance.solutions.join(', ') || 'No disponible'],
      ['Planetas', t.provenance.interpolation], ['Modelo de transferencia', t.model], ['Estado de validación', t.validation]]);
    setText($('#mc-energy-note'), t.limits.join(' '));
    $('#mc-elapsed').textContent = `${number(position.elapsedSeconds / 86400, 2)} d transcurridos`;
    $('#mc-remaining').textContent = `${number(t.time.remainingDays, 2)} d restantes`;
  }
  const INTEGRATED_NOTE = 'Cada estado sale del tramo calculado que contiene el instante: Kepler exacto en tramos balísticos y nudos DOPRI54 (Hermite) en encendidos y descenso. Los cambios de contexto solo cambian el marco del dibujo (efemérides en la misma época TDB). Reproducir o retroceder no recalcula ni consume propelente.';
  function setViewContext(ctx) {
    if (ctx === viewContext) return;
    viewContext = ctx; view.setExecution(execution.contexts[ctx], { keepCamera: true });
    $('#mc-foot').textContent = sceneActive ? mainSceneFoot(sceneView?.getState()) : FOOT_INTEGRATED[ctx];
    const look = $('#mc-look');
    look.options[0].textContent = ctx === 'helio' ? `Destino (${execution.mission.destinationName})` : ctx === 'planet' && execution.mission.moonName ? `Satélite (${execution.mission.moonName})` : 'Cuerpo central';
    look.options[1].textContent = ctx === 'helio' ? 'Origen (Tierra)' : 'Cuerpo central';
    updateAvailability();
  }
  function renderIntegrated(t, position) {
    const pr = t.propulsion, o = t.derived.orbit, m = execution.mission;
    metrics('#mc-state-metrics', [['Tipo de misión', 'Misión interplanetaria integrada'], ['Misión', t.missionName], ['Fase', t.phaseLabel], ['Estado de la fase', t.phaseStatus ?? 'No disponible'],
      ['Tramo', t.segmentLabel], ['Fecha UTC', `${t.time.utc}${t.time.utcPredicted ? ' (predicción)' : ''}`], ['Época TDB', `${t.time.tdb} · JD ${number(t.time.jdTdb, 6)}`], ['TDB − UTC', tdbMinusUtcText(t.time.jdTdb)],
      ['Desde la salida', `${number(t.time.elapsedDays, 4)} d`], ['Cuerpo central', t.frame.centralName], ['Marco del estado', t.frame.label], ['Contexto de la vista', CONTEXT_LABELS[t.context]],
      ['Posición', `${vector(t.state.positionKm, 1)} km`], ['Velocidad', `${vector(t.state.velocityKmS, 5)} km/s`]]);
    lastTime = t.time;
    metrics('#mc-derived-metrics', [[`Distancia al centro de ${t.frame.centralName}`, distance(t.derived.distanceKm, { digits: 1 })], [t.frame.centralId === '399' ? 'Altitud WGS84' : 'Altitud', `${number(t.derived.altitudeKm, 2)} km`],
      ['Rapidez respecto al cuerpo central', `${number(t.derived.speedKmS, 5)} km/s`],
      ['Órbita osculante', o.bound ? `elíptica · e = ${number(o.eccentricity, 5)}` : `hiperbólica · e = ${number(o.eccentricity, 5)} · v∞ ${number(o.vInfKmS, 4)} km/s`],
      ['Periapsis osculante', `${number(o.periapsisAltitudeKm, 2)} km alt.`], ['Apoapsis osculante', o.bound ? `${number(o.apoapsisAltitudeKm, 1)} km alt.` : 'No ligada'],
      ['Periodo', o.periodSeconds ? `${number(o.periodSeconds / 3600, 3)} h` : 'No aplica'],
      ['Distancia al Sol', t.derived.sunDistanceAu != null ? distance(t.derived.sunDistanceAu * KM_PER_AU, { sun: true, auOnly: true }) : 'No disponible'],
      [`Distancia a ${m.destinationName}`, t.derived.destinationDistanceKm != null ? distance(t.derived.destinationDistanceKm) : 'No disponible']]);
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
    setText($('#mc-energy-note'), t.limits.join(' '));
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
    setText($('#mc-hud-kind'), HUD_KIND[execution.kind] ?? 'Misión');
    if (phase !== hudPhase) {
      // 17.1: el lector de pantalla oye cada cambio de fase (no la preparación inicial, que ya anuncia #mc-message).
      const anuncio = anuncioCambioFase(hudPhase, phase);
      if (anuncio) $('#mc-announcer').textContent = anuncio;
      hudPhase = phase; $('#mc-hud-phase').textContent = phase;
      const box = $('#mc-hud-phase-box'); box.classList.remove('is-changing'); void box.offsetWidth; box.classList.add('is-changing');
    }
    const civil = ['integrated', 'interplanetary'].includes(execution.kind) && lastTime ? lastTime.utc : null;
    setText($('#mc-hud-time'), `${$('#mc-stage-status').textContent} · ${civil ? `${civil} · ` : ''}${$('#mc-elapsed').textContent}`);
    // 24: al pasar por la fecha se explica la escala: UTC es la hora civil; los cálculos usan TDB.
    const tituloHora = civil ? `Fecha civil en UTC. Las efemérides y la integración usan TDB (${lastTime.tdb}); TDB − UTC = ${tdbMinusUtcText(lastTime.jdTdb)}.` : '';
    if ($('#mc-hud-time').title !== tituloHora) $('#mc-hud-time').title = tituloHora;
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
    picked.forEach(([label, value], i) => { setText(list.children[2 * i], label); setText(list.children[2 * i + 1], value); });
    // 24: con la barra ampliada, si la reproducción sale del intervalo se vuelve a la misión completa.
    if (zoom && snap.playing && (snap.elapsedSeconds < zoom.inicio - 1e-6 || snap.elapsedSeconds > zoom.fin + 1e-6)) { zoom = null; renderTicks(); announce('La reproducción salió del intervalo ampliado: la barra vuelve a mostrar toda la misión.'); }
    const win = trackWindow();
    $('#mc-track-fill').style.transform = `scaleX(${Math.min(1, Math.max(0, (snap.elapsedSeconds - win.inicio) / (win.fin - win.inicio)))})`;
    setText($('#mc-tr-time'), $('#mc-remaining').textContent);
    setAttr($('#mc-timeline'), 'aria-valuetext', textoValorLineaTiempo($('#mc-elapsed').textContent, $('#mc-remaining').textContent, phase));
    const play = transport.querySelector('[data-tr="play"]'), icono = snap.playing ? 'icon-pause' : 'icon-play';
    if (play.dataset.icono !== icono) { play.dataset.icono = icono; play.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${icono}"></use></svg>`; }
    setAttr(play, 'aria-label', snap.playing ? 'Pausar' : 'Reproducir');
    for (const tick of $('#mc-track-ticks').children) setAttr(tick, 'aria-current', tick.dataset.events.split(' ').includes(selectedEvent) ? 'step' : 'false');
  }
  // 24: las marcas que caerían a menos de 12 px se agrupan en una sola; pulsar un grupo amplía la barra alrededor de él
  // (zoom temporal). El deslizador «Instante de misión» sigue cubriendo toda la misión.
  let zoom = null;
  const trackWindow = () => zoom ?? { inicio: 0, fin: execution?.durationSeconds || 1 };
  const shortDuration = seconds => seconds < 60 ? `${number(seconds, 1)} s` : duration(seconds);
  function announce(text) { $('#mc-announcer').textContent = text; }
  function goToEvent(event) { host.querySelector(`#mc-events button[data-event="${CSS.escape(event.id)}"]`)?.click(); }
  function renderTicks() {
    const box = $('#mc-track-ticks'); box.replaceChildren();
    $('#mc-zoom-exit').hidden = !zoom; $('#mc-track').dataset.zoom = zoom ? 'on' : 'off';
    if (!execution) return;
    const { inicio, fin } = trackWindow();
    for (const group of agruparMarcas(execution.events, { inicio, fin, anchoPx: $('#mc-track').clientWidth || 600 })) {
      const events = group.eventos, tick = document.createElement('button'); tick.type = 'button'; tick.className = 'mc-tick';
      tick.dataset.event = events[0].id; tick.dataset.events = events.map(e => e.id).join(' ');
      tick.style.left = `${group.fraccion * 100}%`;
      if (events.length > 1) {
        tick.classList.add('is-group'); tick.dataset.count = String(events.length);
        tick.title = `${events.length} eventos: ${events.map(e => e.title).join(' · ')}`;
        tick.setAttribute('aria-label', `${events.length} eventos juntos: ${events.map(e => e.title).join('; ')}. Ampliar la barra alrededor de ellos`);
      } else { tick.title = events[0].title; tick.setAttribute('aria-label', `Ir a: ${events[0].title}`); }
      tick.addEventListener('click', clickEvent => { clickEvent.stopPropagation(); if (events.length > 1) zoomTo(events); else goToEvent(events[0]); });
      box.append(tick);
    }
  }
  function zoomTo(events) {
    const first = events[0].elapsedSeconds, last = events.at(-1).elapsedSeconds, span = last - first;
    const current = trackWindow(), width = Math.max(span * 2.2, 10);
    goToEvent(events[0]);
    // Eventos en el mismo instante (o ya separados al máximo): no se amplía; se salta al primero y se nombran todos.
    if (!(span > 1e-3) || width >= (current.fin - current.inicio) * 0.95) { message(`${events.length} eventos en ${span > 1e-3 ? shortDuration(span) : 'el mismo instante'}: ${events.map(e => e.title).join(' · ')}.`); return; }
    zoom = ventanaZoom({ total: execution.durationSeconds, centro: (first + last) / 2, fraccion: width / execution.durationSeconds, minimoS: 10 });
    renderTicks(); updateHud();
    announce(`Barra ampliada a ${shortDuration(zoom.fin - zoom.inicio)} alrededor de ${events.length} eventos. «Toda la misión» la restablece.`);
  }
  $('#mc-zoom-exit').addEventListener('click', () => { zoom = null; renderTicks(); updateHud(); announce('La barra vuelve a mostrar toda la misión.'); });
  // Las marcas se recalculan cuando cambia el ancho de la barra (ventana, panel, vista inmersiva).
  let trackWidth = 0;
  const trackObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (Math.abs(width - trackWidth) >= 2) { trackWidth = width; renderTicks(); if (execution) updateHud(); }
  }) : null;
  trackObserver?.observe($('#mc-track'));
  // El pie de escala no se recorta: su altura real (cambia con el texto y el ancho) coloca la barra de reproducción encima (CSS --mc-foot-h).
  const footObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(([entry]) => {
    $('.mc-stage').style.setProperty('--mc-foot-h', `${Math.ceil(entry.target.offsetHeight)}px`);
  }) : null;
  footObserver?.observe($('.mc-stage .lab-stage-foot'));
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
        if (sceneActive) sceneView.setTime(position.elapsedSeconds); else view.setSample(sample.landingSample ?? sample, { beforeManeuver: sample.beforeContext });
        $('#mc-timeline').value = String(position.elapsedSeconds);
        setText($('#mc-stage-status'), position.finished ? 'FINALIZADA LA REPRODUCCIÓN' : position.playing ? (position.direction < 0 ? 'REPRODUCCIÓN INVERSA' : 'EN REPRODUCCIÓN') : position.elapsedSeconds === 0 ? 'PREPARADA' : 'PAUSADA');
        setText($('#mc-outcome'), `${telemetry.phaseLabel} · ${telemetry.phaseStatus ?? 'fase calculada'}. ${execution.mission.verdict}`);
        renderIntegrated(telemetry, position); updateSelectedEvent(position); setText($('#mc-model-note'), INTEGRATED_NOTE);
        // 16: el marco «Descenso» solo aparece si la misión incluye un descenso (la interfaz ya no ofrece módulos de aterrizaje); 21: «Tierra», si empieza en la plataforma.
        for (const b of $('#mc-context').querySelectorAll('button')) {
          const desactivado = b.dataset.context !== 'auto' && !execution.contexts[b.dataset.context], oculto = ['landing', 'earth'].includes(b.dataset.context) && !execution.contexts[b.dataset.context];
          if (b.disabled !== desactivado) b.disabled = desactivado;
          if (b.hidden !== oculto) b.hidden = oculto;
          setAttr(b, 'aria-pressed', String(b.dataset.context === contextMode));
        }
        setText($('#mc-play'), position.playing ? 'En curso' : position.finished ? 'Reiniciar e iniciar' : position.elapsedSeconds === 0 ? 'Iniciar' : 'Reanudar');
        return;
      }
      if (execution.kind === 'interplanetary') {
        const sample = sampleInterplanetaryExecution(execution, position.elapsedSeconds), telemetry = deriveInterplanetaryTelemetry(execution, sample);
        setSummaries('interplanetary'); if (sceneActive) sceneView.setTime(position.elapsedSeconds); else view.setSample(sample, { beforeManeuver: false });
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
        ['Distancia Tierra', distance(telemetry.derived.earthDistanceKm, { digits: 2 })],
        ['Altitud Tierra', `${number(telemetry.derived.earthAltitudeKm, 2)} km`],
        ['Distancia Luna', distance(telemetry.derived.lunarDistanceKm, { digits: 2 })],
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
      setText($('#mc-energy-note'), telemetry.energyEstimate.warning);
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
  // PERF-02: en reproducción continua, el estado 3D se actualiza en cada fotograma, pero el formateo y mutación DOM
  // de telemetría se modera según el perfil de calidad (55 ms en detalle bajo/mínimo, 28 ms en medio); al pausar,
  // saltar, cruzar una frontera o terminar se vuelca al instante.
  let ultimoRefrescoDom = -Infinity, ultimaFaseDom = '';
  function sincronizarEscenaSolo() {
    if (!execution || !clock) return false;
    const position = clock.snapshot();
    if (!position.playing || position.finished) return false;
    if (execution.kind === 'integrated') {
      if (sceneActive) {
        const idx = segmentAtTime(execution.mission.segments, position.elapsedSeconds);
        const seg = execution.mission.segments[idx];
        if ((seg?.label ?? '') !== ultimaFaseDom) return false;
        sceneView.setTime(position.elapsedSeconds);
        return true;
      }
      const sample = sampleIntegratedExecution(execution, position.elapsedSeconds, contextMode === 'auto' ? null : contextMode);
      if (sample.context !== viewContext || sample.segment?.label !== ultimaFaseDom) return false;
      view.setSample(sample.landingSample ?? sample, { beforeManeuver: sample.beforeContext });
      return true;
    }
    if (execution.kind === 'interplanetary') {
      if (sceneActive) sceneView.setTime(position.elapsedSeconds);
      else view.setSample(sampleInterplanetaryExecution(execution, position.elapsedSeconds), { beforeManeuver: false });
      return true;
    }
    return false;
  }
  function tick(now) {
    if (!visible || !clock?.snapshot().playing) { stopFrame(); return; }
    const realDelta = lastNow == null ? 0 : Math.min(0.2, (now - lastNow) / 1000);
    lastNow = now;
    if (execution?.kind === 'integrated') advanceIntegrated(realDelta); else clock.advance(realDelta);
    const detalle = getQualityState().detalle;
    const intervaloDomMs = (detalle === 'bajo' || detalle === 'minimo') ? 95 : detalle === 'medio' ? 40 : 0;
    if (intervaloDomMs > 0 && now - ultimoRefrescoDom < intervaloDomMs && sincronizarEscenaSolo()) {
      // Escena 3D actualizada; el DOM se refrescará en el siguiente pulso o al pausar/cruzar de fase.
    } else {
      ultimoRefrescoDom = now;
      refresh();
      if (execution?.kind === 'integrated') {
        const idx = segmentAtTime(execution.mission.segments, clock.snapshot().elapsedSeconds);
        ultimaFaseDom = execution.mission.segments[idx]?.label ?? '';
      }
    }
    if (clock?.snapshot().playing && !interrupted) frame = requestAnimationFrame(tick);
    else { refresh(); stopFrame(); }
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
  // 17: resúmenes estáticos de la misión en reproducción (salen del mismo objeto de ejecución que dibuja la escena).
  const duration = seconds => !Number.isFinite(seconds) ? 'No disponible' : seconds < 3600 ? `${number(seconds / 60, 1)} min`
    : seconds < 2 * 86400 ? `${number(seconds / 3600, 2)} h` : `${number(seconds / 86400, 1)} d`;
  function staticRows(container, rows) {
    for (const [label, value] of rows) {
      const row = document.createElement('div'); row.className = 'lab-metric';
      const term = document.createElement('span'); term.textContent = label;
      const data = document.createElement('strong'); data.textContent = value;
      row.append(term, data); container.append(row);
    }
  }
  const verdictOf = ex => ex?.mission?.verdict ?? ex?.evaluation?.status ?? ex?.result?.evaluation?.status ?? ex?.result?.status ?? 'No disponible';
  const RESTRICTIONS = Object.freeze({
    integrated: ['La inyección desde la órbita terrestre no se modela: la misión parte del C3 de salida.', 'El lanzamiento terrestre es una herramienta independiente: no se encadena con esta misión.'],
    interplanetary: ['Cónica heliocéntrica preliminar (Lambert): sin lanzamiento, correcciones de trayectoria ni captura.'],
    launch: ['Termina en una órbita baja terrestre; no se encadena con la misión completa.', 'Lanzador ilustrativo: no es un cohete real.'],
    landing: ['Descenso local aislado: no incluye el viaje ni la llegada.'],
    'finite-thrust': ['Maniobra local desde una órbita terrestre: sin lanzamiento ni continuación interplanetaria.'],
    mission: ['Impulso ideal e instantáneo desde una órbita terrestre: sin lanzamiento.']
  });
  function renderTrajectory() {
    const box = $('#mc-trajectory'); box.replaceChildren();
    if (!execution) { const p = document.createElement('p'); p.className = 'mission-hint'; p.textContent = 'Sin trayectoria en reproducción.'; box.append(p); return; }
    const list = document.createElement('div'); list.className = 'lab-metrics';
    const rows = [['Tipo', HUD_KIND[execution.kind] ?? 'Misión'], ['Misión', execution.name], ['Vehículo', execution.design?.name ?? 'Sin sonda asociada'],
      ['Duración calculada', duration(execution.durationSeconds)], ['Eventos calculados', String(execution.events.length)]];
    const m = execution.mission;
    if (m) {
      rows.push(['Tramos conectados', `${m.segments.length} · salto máximo de posición ${m.continuity.maxPositionErrorKm.toExponential(1)} km`]);
      if (m.departure) rows.push(['C3 de salida', `${number(m.departure.c3Km2S2, 2)} km²/s²`]);
    }
    staticRows(list, rows); box.append(list);
    if (m) {
      const title = document.createElement('h4'); title.textContent = 'Encendidos integrados';
      const table = document.createElement('table'); table.className = 'mc-maneuvers';
      table.innerHTML = '<thead><tr><th scope="col">Maniobra</th><th scope="col">Δv</th><th scope="col">Propelente</th><th scope="col">Duración</th></tr></thead><tbody></tbody>';
      for (const mv of m.maneuvers) {
        const tr = document.createElement('tr');
        for (const text of [mv.label, `${number(mv.propulsiveDeltaVKmS * 1000, 1)} m/s`, `${number(mv.propellantKg, 0)} kg`, duration(mv.durationSeconds)]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
        table.tBodies[0].append(tr);
      }
      if (!m.maneuvers.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 4; td.textContent = 'Sin encendidos (sobrevuelo balístico).'; tr.append(td); table.tBodies[0].append(tr); }
      const segTitle = document.createElement('h4'); segTitle.textContent = 'Tramos';
      const segments = document.createElement('ol'); segments.className = 'mc-segments';
      for (const seg of m.segments) { const li = document.createElement('li'); li.textContent = `${seg.label ?? PHASE_LABELS[seg.phase] ?? seg.phase} · ${duration(seg.endSeconds - seg.startSeconds)}`; segments.append(li); }
      box.append(title, table, segTitle, segments);
    }
  }
  function renderResultsSummary() {
    const box = $('#mc-results'); box.replaceChildren();
    if (!execution) return;
    const verdict = verdictOf(execution);
    const head = document.createElement('p'); head.className = 'mission-status';
    head.dataset.tone = /^(NO VIABLE|NO DESPEGA)|FALLO|IMPACTO/.test(verdict) ? 'bad' : /^(CADENA CALCULADA COMPLETA|VIABLE|LANZAMIENTO COMPLETADO)/.test(verdict) ? 'ok' : 'warn';
    head.textContent = verdict; box.append(head);
    const list = document.createElement('div'); list.className = 'lab-metrics';
    const rows = [['Vehículo', execution.design?.name ?? 'Sin sonda asociada'], ['Duración', duration(execution.durationSeconds)]];
    const m = execution.mission;
    if (m) {
      rows.push(['Propelente consumido', `${number(m.maneuvers.filter(mv => mv.engineKey !== 'upper').reduce((n, mv) => n + mv.propellantKg, 0), 0)} kg`], ['Masa final', `${number(m.finalMassKg, 0)} kg`]);
      if (m.launch?.ok) rows.push([`Propelente de la ${m.launch.upperStage.name.split(' (')[0]} (inyección)`, `${number(m.launch.injection.propellantKg, 0)} kg (quedan ${number(m.launch.injection.propellantLeftKg, 0)} kg)`]);
      if (m.power) rows.push(['Energía eléctrica', m.power.sustainable ? 'Suficiente según el modelo' : 'Insuficiente según el modelo']);
    }
    staticRows(list, rows); box.append(list);
    const limits = [...(RESTRICTIONS[execution.kind] ?? []), ...(m?.warnings ?? [])];
    if (limits.length) {
      const title = document.createElement('h4'); title.textContent = 'Restricciones y simplificaciones';
      const ul = document.createElement('ul'); ul.className = 'mc-limits';
      for (const text of limits) { const li = document.createElement('li'); li.textContent = text; ul.append(li); }
      box.append(title, ul);
    }
    // 24: órbita final de cada captura (objetivo frente a alcanzado) y lo que hizo la sonda real, para no confundir simulación e historia.
    if (execution.kind === 'integrated') for (const p of m.phases.filter(p => ['capture', 'moon-capture'].includes(p.id) && p.insertion?.finalOrbit)) box.append(captureCard(p));
    const real = compararConMisionReal(execution.design?.basedOn, simulatedDestinations(execution));
    if (real) box.append(realMissionCard(real));
    const note = document.createElement('p'); note.className = 'mission-hint'; note.textContent = '«Viable según el modelo» no equivale a éxito operativo.'; box.append(note);
  }
  const simulatedDestinations = ex => ex.kind === 'integrated' ? [ex.mission.destinationName, ex.mission.moonName]
    : ex.kind === 'interplanetary' ? [ex.result.destinationName] : ex.kind === 'landing' ? [ex.simulation?.bodyName] : ex.kind === 'finite-thrust' || !ex.kind || ex.kind === 'mission' ? ['Luna'] : [];
  // Nombre del token --body-* (sin tildes; algunos satélites con su nombre inglés).
  const BODY_TOKEN = { Ganimedes: 'Ganymede', Calisto: 'Callisto', Encelado: 'Enceladus' };
  const bodyToken = name => { const plain = String(name ?? '').normalize('NFD').replace(/\p{M}/gu, ''); return BODY_TOKEN[plain] ?? plain; };
  const SVG = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); return el; };
  function captureCard(p) {
    const o = p.insertion.finalOrbit, objective = p.objective ?? null, card = document.createElement('section'); card.className = 'mc-capture';
    card.style.setProperty('--body', `var(--body-${bodyToken(p.bodyName)}, #cfd3da)`);
    const title = document.createElement('h4'); title.textContent = `Órbita final en ${p.bodyName ?? 'el destino'}`; card.append(title);
    const altKm = value => Number.isFinite(value) ? `${number(value, 0)} km` : 'No aplica';
    const geometry = o.bound ? esquemaOrbita({ radioCuerpoKm: p.bodyRadiusKm, alcanzada: o, objetivo: objective, lado: 220, margen: 22 }) : null;
    if (geometry) {
      const svg = svgEl('svg', { viewBox: `0 0 ${geometry.lado} ${geometry.lado}`, class: 'mc-capture-plot', role: 'img',
        'aria-label': `Esquema a escala: órbita alcanzada de ${altKm(o.periapsisAltitudeKm)} × ${altKm(o.apoapsisAltitudeKm)} de altitud${geometry.objetivo ? ` frente a la objetivo de ${altKm(objective.periapsisAltitudeKm)} × ${altKm(objective.apoapsisAltitudeKm)}` : ''}.` });
      if (geometry.objetivo) svg.append(svgEl('ellipse', { cx: geometry.objetivo.cx, cy: geometry.objetivo.cy, rx: geometry.objetivo.rx, ry: geometry.objetivo.ry, class: 'is-target' }));
      const a = geometry.alcanzada;
      svg.append(svgEl('ellipse', { cx: a.cx, cy: a.cy, rx: a.rx, ry: a.ry, class: 'is-achieved' }));
      svg.append(svgEl('circle', { cx: geometry.foco.x, cy: geometry.foco.y, r: geometry.radioCuerpoPx, class: 'is-body' }));
      svg.append(svgEl('circle', { cx: a.periapsisX, cy: a.cy, r: 3, class: 'is-apsis' }), svgEl('circle', { cx: a.apoapsisX, cy: a.cy, r: 3, class: 'is-apsis' }));
      // P y A por fuera de la órbita, para no tapar el cuerpo ni las elipses.
      const outer = Math.max(a.periapsisX, geometry.objetivo?.periapsisX ?? -Infinity), inner = Math.min(a.apoapsisX, geometry.objetivo?.apoapsisX ?? Infinity);
      const label = (x, text, anchor) => { const t = svgEl('text', { x, y: a.cy + 3.5, 'text-anchor': anchor }); t.textContent = text; return t; };
      svg.append(label(outer + 5, 'P', 'start'), label(inner - 5, 'A', 'end'));
      const legend = document.createElement('p'); legend.className = 'mc-capture-legend';
      legend.innerHTML = '<span class="is-achieved">Alcanzada</span><span class="is-target">Objetivo</span><span class="is-body">Cuerpo a escala</span>';
      if (!geometry.objetivo) legend.querySelector('.is-target').remove();
      card.append(svg, legend);
    } else {
      const none = document.createElement('p'); none.className = 'mission-hint'; none.textContent = 'La captura no dejó una órbita cerrada alrededor del cuerpo: no hay órbita final que dibujar.'; card.append(none);
    }
    const table = document.createElement('table'); table.className = 'mc-maneuvers mc-capture-table';
    table.innerHTML = '<thead><tr><th scope="col">Altitud</th><th scope="col">Objetivo</th><th scope="col">Alcanzada</th></tr></thead>';
    const body = document.createElement('tbody');
    for (const [label, target, achieved] of [['Periapsis', objective?.periapsisAltitudeKm, o.periapsisAltitudeKm], ['Apoapsis', objective?.apoapsisAltitudeKm, o.bound ? o.apoapsisAltitudeKm : null]]) {
      const tr = document.createElement('tr');
      for (const [i, text] of [label, altKm(target), o.bound || label === 'Periapsis' ? altKm(achieved) : 'Sin órbita cerrada'].entries()) {
        const cell = document.createElement(i === 0 ? 'th' : 'td'); if (i === 0) cell.scope = 'row'; cell.textContent = text; tr.append(cell);
      }
      body.append(tr);
    }
    table.append(body); card.append(table);
    const extra = document.createElement('p'); extra.className = 'mission-hint';
    extra.textContent = `${o.bound ? `Excentricidad ${number(o.eccentricity, 4)}${Number.isFinite(o.periodHours) ? ` · periodo ${number(o.periodHours, 2)} h` : ''}. ` : ''}Esquema a escala en el plano de la órbita (periapsis P a la derecha); no muestra la orientación en el espacio.`;
    card.append(extra);
    // 20: cómo se llegó a ese periapsis (llegada apuntada más alta) o por qué no se compensó.
    const pc = p.periapsisCompensation;
    if (pc && pc.status !== 'innecesaria') {
      const aimed = document.createElement('p'); aimed.className = 'mission-hint mc-capture-aim';
      aimed.textContent = pc.applied
        ? `Captura apuntada: la llegada se apuntó a ${number(pc.aimedPeriapsisAltitudeKm, 0)} km de altitud porque el encendido baja el periapsis; sin compensar habría quedado en ${number(pc.uncompensatedPeriapsisAltitudeKm, 0)} km.`
        : `Captura apuntada no aplicada. ${pc.reason}`;
      card.append(aimed);
    }
    return card;
  }
  function realMissionCard(real) {
    const card = document.createElement('section'); card.className = 'mc-real';
    const title = document.createElement('h4'); title.textContent = 'Lo que hizo la sonda real'; card.append(title);
    const summary = document.createElement('p'); summary.className = 'mc-real-summary'; summary.textContent = real.resumen; card.append(summary);
    for (const mission of real.misiones) {
      const name = document.createElement('p'); name.className = 'mc-real-name';
      const strong = document.createElement('strong'); strong.textContent = mission.nombre;
      name.append(strong, document.createTextNode(` · ${mission.lanzador}`));
      const list = document.createElement('ol'); list.className = 'mc-real-list';
      for (const item of mission.hitos) {
        const li = document.createElement('li'); const time = document.createElement('time'); time.dateTime = item.fecha; time.textContent = item.fecha;
        li.append(time, document.createTextNode(` ${item.texto}`));
        if (real.coincidencias.some(c => c.mision === mission.nombre && c.fecha === item.fecha && c.texto === item.texto)) li.dataset.match = 'true';
        list.append(li);
      }
      const source = REAL_MISSION_SOURCES[mission.fuente], cite = document.createElement('p'); cite.className = 'mc-real-source';
      const link = document.createElement('a'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `${source.publisher}: ${source.title}`;
      cite.append(document.createTextNode('Fuente: '), link, document.createTextNode(' (fechas en UTC)'));
      card.append(name, list, cite);
    }
    return card;
  }
  function clear(reason) {
    stopFrame(); execution = null; clock = null; zoom = null; lastTime = null; sourceResult = null; sourceDesign = null; sourceName = null; interrupted = false; viewContext = null; $('#mc-context').hidden = true;
    view.setExecution(null); sceneView?.clear(); sceneNote = ''; setSceneActive(false); $('#mc-stage-empty').hidden = false;
    $('#mc-readiness').textContent = reason || 'Calcula una misión viable en el Planificador para habilitar la ejecución.';
    $('#mc-stage-status').textContent = 'Sin plan vigente'; $('#mc-outcome').textContent = 'Sin datos de misión.';
    for (const selector of ['#mc-state-metrics', '#mc-derived-metrics', '#mc-resource-metrics', '#mc-energy-metrics']) $(selector).replaceChildren();
    setText($('#mc-energy-note'), '');
    $('#mc-empty-reason').textContent = reason ? `${reason} La escena usará la sonda y los estados del nuevo cálculo.` : 'Calcula una misión en «2 · Planificar» y pulsa «Reproducir en el Centro de Misión». La escena usará la sonda y los estados de ese cálculo.';
    modelInfo = null; renderVehicle(); renderTrajectory(); renderResultsSummary();
    renderEvents(); updateAvailability(); message(''); updateHud();
  }
  function setPlan(candidate) {
    if (!candidate?.ready) { clear(candidate?.reason); return; }
    if (candidate.result === sourceResult && candidate.design === sourceDesign && candidate.name === sourceName) return;
    try {
      const next = candidate.kind === 'integrated' ? createIntegratedExecution(candidate) : candidate.kind === 'interplanetary' ? createInterplanetaryExecution(candidate) : candidate.kind === 'landing' ? createLandingExecution(candidate) : candidate.kind === 'launch' ? createLaunchExecution(candidate) : candidate.kind === 'finite-thrust' ? createFiniteThrustExecution(candidate) : createMissionExecution(candidate);
      stopFrame(); modelInfo = null; execution = next; zoom = null; lastTime = null; clock = createPlaybackClock(next.durationSeconds, { maxRate: next.kind === 'interplanetary' ? INTERPLANETARY_MAX_RATE : next.kind === 'integrated' ? INTEGRATED_MAX_RATE : 86400 });
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
      prepareScene(next);
      renderEvents(); updateAvailability(); refresh(); message(sceneNote ? `${preparedMessage(next)} ${sceneNote}` : preparedMessage(next));
      renderVehicle(); renderTrajectory(); renderResultsSummary(); autoImmersive();
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
    const input = $('#mc-timeline'), value = Number(input.value), max = Number(input.max);
    clock.pause(); stopFrame(); clock.seek(instanteLineaTiempo(value, max)); refresh();
  });
  for (const button of host.querySelectorAll('button[data-camera]')) button.addEventListener('click', () => {
    activeView().setCameraMode(button.dataset.camera);
    if (execution) $('#mc-foot').textContent = sceneActive ? mainSceneFoot(sceneView?.getState()) : execution.kind === 'integrated' ? FOOT_INTEGRATED[viewContext] : execution.kind === 'interplanetary' ? FOOT_HELIO : button.dataset.camera === 'local' && execution.kind === 'landing' ? FOOT_LANDING_LOCAL : FOOT_DEFAULT;
    for (const item of host.querySelectorAll('button[data-camera]')) item.setAttribute('aria-pressed', String(item.dataset.camera === button.dataset.camera));
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
    const box = $('#mc-track').getBoundingClientRect(), win = trackWindow();
    const input = $('#mc-timeline');
    input.value = String(Math.min(Number(input.max), win.inicio + Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * (win.fin - win.inicio)));
    input.dispatchEvent(new Event('input'));
  });
  // 17: un panel lateral con pestañas (sustituye a los paneles «Control» y «Telemetría»). Ocultarlo no detiene la reproducción.
  function setDrawer(open) {
    host.dataset.drawer = open ? 'shown' : 'hidden';
    host.querySelector('[data-mc-panel="drawer"]').setAttribute('aria-pressed', String(open));
  }
  function setPane(next) {
    if (!Object.hasOwn(MC_PANES, next)) return;
    pane = next; host.dataset.pane = pane;
    for (const section of host.querySelectorAll('.mc-pane')) section.hidden = section.dataset.pane !== pane;
    $('#mc-pane-title').textContent = MC_PANES[pane];
    for (const button of host.querySelectorAll('[data-sheet-pane]')) button.setAttribute('aria-pressed', String(button.dataset.sheetPane === pane));
    setDrawer(true);
  }
  let immersive = false, sheetOpen = false, autoImmersiveFor = null;
  // 24: en pantallas estrechas el panel se abre como hoja inferior sobre la escena, sin salir de la vista inmersiva.
  const narrowScreen = window.matchMedia('(max-width: 820px)');
  function setSheet(open, { focus = true } = {}) {
    const next = Boolean(open) && immersive;
    if (next === sheetOpen) return;
    sheetOpen = next; host.dataset.sheet = sheetOpen ? 'open' : 'closed';
    const toggle = host.querySelector('[data-mc-panel="sheet"]'); toggle.setAttribute('aria-expanded', String(sheetOpen));
    if (!focus) return;
    if (sheetOpen) host.querySelector(`[data-sheet-pane="${pane}"]`)?.focus({ preventScroll: true });
    else if (toggle.checkVisibility?.({ visibilityProperty: true })) toggle.focus({ preventScroll: true });
  }
  function setImmersive(value) {
    if (immersive === Boolean(value)) return;
    immersive = Boolean(value); host.dataset.immersive = String(immersive);
    host.querySelector('[data-mc-panel="immersive"]').setAttribute('aria-pressed', String(immersive));
    if (!immersive) setSheet(false, { focus: false });
    onImmersive(immersive);
  }
  // 24: vista inmersiva por defecto en pantallas estrechas, una vez por misión: si se sale, no se vuelve a imponer.
  function autoImmersive() {
    if (!visible || !execution || !narrowScreen.matches || autoImmersiveFor === execution) return;
    autoImmersiveFor = execution; setImmersive(true);
  }
  for (const button of host.querySelectorAll('[data-mc-panel]')) button.addEventListener('click', () => {
    const kind = button.dataset.mcPanel;
    if (kind === 'drawer') setDrawer(host.dataset.drawer === 'hidden');
    else if (kind === 'immersive') setImmersive(!immersive);
    else if (kind === 'sheet') setSheet(!sheetOpen);
    else if (kind === 'sheet-close') setSheet(false);
    else setImmersive(false);
  });
  for (const button of host.querySelectorAll('[data-sheet-pane]')) button.addEventListener('click', () => { setPane(button.dataset.sheetPane); onPane(button.dataset.sheetPane); });
  for (const button of host.querySelectorAll('[data-unit]')) button.addEventListener('click', () => {
    distanceUnit = button.dataset.unit;
    for (const item of host.querySelectorAll('[data-unit]')) item.setAttribute('aria-pressed', String(item === button));
    if (execution) refresh();
  });
  // 24: atajos del Centro de Misión (espacio, ← / →, Inicio / Fin). No actúan sobre campos, botones ni controles con teclado propio.
  function seekEdge(end) {
    if (!clock || !execution) return;
    clock.pause(); stopFrame();
    if (end) clock.seek(execution.durationSeconds); else clock.reset();
    refresh(); message(end ? 'Final de la misión calculada.' : resetMessage(execution));
  }
  const onKey = event => {
    if (!visible || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      if (sheetOpen) { event.preventDefault(); setSheet(false); }
      else if (immersive) { event.preventDefault(); setImmersive(false); }
      return;
    }
    if (!execution || !clock) return;
    const target = event.target instanceof Element ? event.target : document.body;
    if (target !== document.body && !host.contains(target)) return;
    if (target.closest('dialog[open]')) return;
    const action = accionTeclaCentroMision({ key: event.key, ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey, shiftKey: event.shiftKey,
      tagName: target.tagName, editable: target.isContentEditable, role: target.getAttribute('role') ?? '' });
    if (!action) return;
    event.preventDefault();
    if (action === 'play-pausa') { if (clock.snapshot().playing) $('#mc-pause').click(); else $('#mc-play').click(); }
    else if (action === 'anterior' || action === 'siguiente') jumpEvent(action === 'siguiente' ? 1 : -1);
    else seekEdge(action === 'fin');
  };
  document.addEventListener('keydown', onKey);
  setDrawer(true); setPane('playback');
  $('#mc-empty-plan').addEventListener('click', onOpenPlanner);
  $('#mc-open-results').addEventListener('click', onOpenResults);
  $('#mc-touch-toggle').addEventListener('click', () => {
    const active = $('#mc-touch-toggle').getAttribute('aria-pressed') !== 'true';
    view.setTouchInteraction(active); host.dataset.touch3d = active ? 'on' : 'off'; $('#mc-touch-toggle').setAttribute('aria-pressed', String(active));
    $('#mc-touch-toggle').textContent = active ? 'Desactivar control 3D' : 'Activar control 3D';
  });
  function onVisibilityChange() { if (document.hidden && clock?.snapshot().playing) { clock.pause(); stopFrame(); refresh(); } }
  document.addEventListener('visibilitychange', onVisibilityChange);
  clear(); $('.mc-onboard-target').hidden = true;
  return {
    setPlan,
    start,
    setPane, getPane: () => pane, setImmersive,
    // 17: estado resumido para la barra de contexto del laboratorio (solo lectura).
    getStatus() {
      const snap = clock?.snapshot();
      return { ready: Boolean(execution), kind: execution?.kind ?? null, name: execution?.name ?? null,
        vehicle: execution?.design?.name ?? null, vehicleId: execution?.design?.basedOn ?? (execution?.design ? 'experimental' : null), model: modelInfo?.status ?? null,
        playing: Boolean(snap?.playing), finished: Boolean(snap?.finished), elapsedSeconds: snap?.elapsedSeconds ?? 0, interrupted, scene: sceneActive ? 'main' : 'local', sceneNote };
    },
    setVisible(value) {
      visible = Boolean(value); view.setVisible(visible && !sceneActive); sceneView?.setVisible(visible && sceneActive); publishSceneMode();
      if (!visible) {
      clock?.pause(); stopFrame(); if (execution) refresh(); setImmersive(false);
      if (coarse) { view.setTouchInteraction(false); host.dataset.touch3d = 'off'; $('#mc-touch-toggle').setAttribute('aria-pressed', 'false'); $('#mc-touch-toggle').textContent = 'Activar control 3D'; }
    } else if (execution) { refresh(); autoImmersive(); }
    },
    resetCamera() { activeView().setCameraMode('overview');
      for (const button of host.querySelectorAll('[data-camera]')) button.setAttribute('aria-pressed', String(button.dataset.camera === 'overview'));
      $('.mc-onboard-target').hidden = true; },
    dispose() { stopFrame(); sceneView?.clear(); onSceneMode(null); stageObserver?.disconnect(); trackObserver?.disconnect(); footObserver?.disconnect(); clearTimeout(reframeTimer); document.removeEventListener('visibilitychange', onVisibilityChange); document.removeEventListener('keydown', onKey); view.dispose(); host.replaceChildren(); }
  };
}
