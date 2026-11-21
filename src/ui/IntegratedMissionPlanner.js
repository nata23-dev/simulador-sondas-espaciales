// Etapa 13 — Planificador «Misión completa»: una sola interfaz para cualquier destino planetario (y los satélites galileanos con
// efemérides de ventana). Flujo: destino → oportunidad (12G, refinada localmente) → sonda activa de la flota →
// perfil de encuentro y órbitas objetivo → cálculo de la cadena → fases viables / no viables → Centro de Misión.
// No hay pantallas por planeta: todo sale de `computeIntegratedMission` con los datos del destino elegido.
import { createInterplanetaryEphemeris, UNAVAILABLE_MESSAGE } from '../science/InterplanetaryEphemeris.js';
import { createPlanetocentricWindow, MOON_UNAVAILABLE_MESSAGE } from '../science/PlanetocentricWindow.js';
import { tdbToTimeScales, datetimeLocalUtcToJdTdb } from '../science/AstrodynamicsTime.js';
import { KM_PER_AU } from '../science/Units.js';
import { SOI_MODELS } from '../science/PlanetaryEncounter.js';
import { refineTransferCandidate } from '../lab/InterplanetaryPlan.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS, MOON_WINDOW_KEYS, PHASE_STATUS, MISSION_LIMITS, moduleDryMassKg, isIntegratedMissionCurrent } from '../lab/IntegratedMission.js';
import { createIntegratedExecution } from '../lab/IntegratedMissionPlayback.js';
import { getBodyProfile } from '../lab/CelestialBodyMissionRegistry.js';
import { scenarioOutcome, probesCompleting } from '../lab/FleetGuide.js';
import { HISTORICAL_PROBES } from '../lab/HeritageCatalog.js';

const number = (n, digits = 1) => Number.isFinite(n) ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(n) : 'No disponible';
const utcLabel = jd => tdbToTimeScales(jd).labelUtc;
const dateOnly = jd => utcLabel(jd).slice(0, 10);
const MOON_WINDOW_FILE = 'data/interplanetary/galilean-moons-jsb-2031-2032.json';

// Escenarios de demostración. Las semillas de oportunidad son los mejores candidatos de la cuadrícula 12G (docs/STAGE12G…, tabla de
// casos A y C); el planificador los refina localmente antes de calcular. Masas, motores y energía: sonda activa de la flota.
// 15.1: sin módulo de propulsión ni módulo de aterrizaje (retirados por decisión del usuario); el motor los admite pero la interfaz no los ofrece.
export const INTEGRATED_SCENARIOS = Object.freeze([
  { id: 'A1', group: 'Marte', label: 'Marte · captura elíptica, apoapsis de 100 000 km', destinationId: '499', moonId: '', departureUtc: '2028-11-30', tofDays: 316, refine: true,
    planet: { mode: 'capture', periapsisAltitudeKm: 3000, apoapsisAltitudeKm: 100000 },
    note: 'Según el modelo, Cassini y Juno se capturan con su motor principal; Voyager agota la hidracina y Dawn no puede frenar en un solo paso con su motor iónico.' },
  { id: 'A2', group: 'Marte', label: 'Marte · órbita circular baja de 400 km (exigente)', destinationId: '499', moonId: '', departureUtc: '2028-11-30', tofDays: 316, refine: true,
    planet: { mode: 'capture', periapsisAltitudeKm: 400, apoapsisAltitudeKm: 400 },
    note: 'Ninguna de las cuatro sondas la alcanza: Voyager agota la hidracina, Cassini y Juno chocan con Marte durante el largo encendido y Dawn no puede frenar con su motor iónico.' },
  { id: 'A3', group: 'Marte', label: 'Marte · sobrevuelo sin frenar', destinationId: '499', moonId: '', departureUtc: '2028-11-30', tofDays: 316, refine: true,
    planet: { mode: 'flyby', periapsisAltitudeKm: 400, apoapsisAltitudeKm: 33000 }, note: 'Sobrevuelo balístico: las cuatro sondas lo completan según el modelo.' },
  // 15 / 15.1: escenario de referencia de VISION_FINAL con la sonda activa de la flota, sin módulo auxiliar.
  { id: 'C1', group: 'Júpiter y Europa', label: 'Júpiter (órbita tipo Juno) y sobrevuelo de Europa', destinationId: '599', moonId: '502', departureUtc: '2028-12-26', tofDays: 1090, refine: true,
    planet: { mode: 'capture', periapsisAltitudeKm: 4200, apoapsisAltitudeKm: 8000000 },
    moon: { mode: 'flyby', periapsisAltitudeKm: 100, intermediateApoapsisKm: 0, apoapsisAltitudeKm: 100 },
    note: 'Usa la sonda activa sin módulo auxiliar. Según el modelo, Cassini y Juno completan la cadena; Voyager no tiene propelente para capturarse en Júpiter (sigue un sobrevuelo) y Dawn no tiene potencia para su motor iónico a 5,2 AU.' },
  { id: 'C2', group: 'Júpiter y Europa', label: 'Júpiter y captura en órbita de Europa (exigente)', destinationId: '599', moonId: '502', departureUtc: '2028-12-26', tofDays: 1090, refine: true,
    planet: { mode: 'capture', periapsisAltitudeKm: 4200, apoapsisAltitudeKm: 8000000 },
    moon: { mode: 'capture', periapsisAltitudeKm: 100, intermediateApoapsisKm: 5000, apoapsisAltitudeKm: 100 },
    note: 'La captura en Europa exige ≈ 4,4 km/s más tras la transferencia; ninguna de las cuatro sondas lleva propelente para ello y el modelo explica en qué fase falla.' }
]);
const STATUS_TONE = new Map([[PHASE_STATUS.done, 'ok'], [PHASE_STATUS.partial, 'warn'], [PHASE_STATUS.failed, 'bad'], [PHASE_STATUS.noData, 'bad'],
  [PHASE_STATUS.skipped, 'idle'], [PHASE_STATUS.pending, 'idle'], [PHASE_STATUS.initial, 'idle']]);

// Etapa 16: entrada de computeIntegratedMission a partir de los valores del formulario. La usan la interfaz y las pruebas
// (tests/Stage16Coherence.test.mjs), así que lo que se comprueba es exactamente lo que calcula el Planificador.
export function integratedMissionInput({ destinationId, moonId = null, departureJdTdb, tofDays, soiModel = 'laplace', planetMode, rp, ra, bPlane = { mode: 'auto' }, moonMode = 'capture', mrp, mra, mri = 0 }, design) {
  const moonBurns = moonId ? [...(mri > 0 ? [{ apoapsisAltitudeKm: mri }] : []), { apoapsisAltitudeKm: mra }] : null;
  return { destinationId, moonId: moonId || null, opportunity: { departureJdTdb, arrivalJdTdb: departureJdTdb + tofDays }, design, propulsionModule: null, lander: null,
    profile: { soiModel, planet: { mode: planetMode, periapsisAltitudeKm: rp, bPlane, captureBurns: [{ apoapsisAltitudeKm: ra }], orbitCoastDays: moonId ? 1 : 2 },
      moon: moonId ? (moonMode === 'flyby' ? { mode: 'flyby', periapsisAltitudeKm: mrp } : { periapsisAltitudeKm: mrp, captureBurns: moonBurns }) : null, landing: { enabled: false } } };
}
/** Valores del formulario de un escenario de demostración. */
export function scenarioFormValues(s) {
  return { destinationId: s.destinationId, moonId: s.moonId || null, departureUtc: s.departureUtc, tofDays: s.tofDays, refine: s.refine, planetMode: s.planet.mode,
    rp: s.planet.periapsisAltitudeKm, ra: s.planet.apoapsisAltitudeKm, moonMode: s.moon?.mode ?? 'capture', mrp: s.moon?.periapsisAltitudeKm ?? 100, mra: s.moon?.apoapsisAltitudeKm ?? 100, mri: s.moon?.intermediateApoapsisKm ?? 0 };
}
/** Semiamplitud (días) de la caja de refinamiento local de la oportunidad: ± 1 % del vuelo, al menos 1 día. */
export const refinementHalfSpanDays = tofDays => Math.max(1, 0.01 * tofDays);
const probeName = id => HISTORICAL_PROBES.find(p => p.id === id)?.name ?? id;

export function createIntegratedMissionPlanner({ host, onExecuteRequest = () => {}, onInvalidated = () => {}, onStateChange = () => {} }) {
  host.classList.add('mission-planner', 'integrated-planner');
  const planets = Object.values(ENCOUNTER_TARGETS);
  host.innerHTML = `
    <div class="mission-controls lab-panel"><div class="lab-panel-heading"><span class="eyebrow">2 / PLANIFICAR · MISIÓN COMPLETA</span><h3>Configurar la misión</h3></div>
      <div class="lab-panel-scroll">
        <p class="mission-intro">Un solo cálculo une el viaje desde la Tierra, la llegada al planeta, el encendido de captura y, si eliges un satélite, el paso por él. Cada fase empieza donde terminó la anterior.</p>
        <ol id="im-flow" class="im-flow" aria-label="Progreso de la planificación"><li data-flow="destination">Destino</li><li data-flow="dates">Fechas</li><li data-flow="type">Tipo de misión</li><li data-flow="compute">Calcular trayectoria</li><li data-flow="maneuvers">Maniobras</li><li data-flow="resources">Recursos y viabilidad</li><li data-flow="play">Preparar la reproducción</li></ol>
        <fieldset class="im-group im-basic"><legend>Configuración básica</legend>
          <label class="lab-field">Escenario de partida<select id="im-scenario">${[...new Set(INTEGRATED_SCENARIOS.map(s => s.group))].map(group => `<optgroup label="${group}">${INTEGRATED_SCENARIOS.filter(s => s.group === group).map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</optgroup>`).join('')}<option value="custom">Personalizado (tus propios valores)</option></select></label>
          <div id="im-outcome" class="im-outcome" aria-live="polite" hidden></div>
          <p id="im-scenario-note" class="mission-hint" hidden></p>
          <div class="lab-two-actions"><label class="lab-field">Planeta destino<select id="im-destination">${planets.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
            <label class="lab-field">Satélite (opcional)<select id="im-moon"></select></label></div>
          <div class="lab-two-actions"><label class="lab-field">Salida (UTC)<input id="im-departure" type="date"></label><label class="lab-field">Vuelo (días)<input id="im-tof" type="number" min="20" step="0.5"></label></div>
          <label class="lab-field">Tipo de misión en el planeta<select id="im-mode"><option value="capture">Captura en órbita</option><option value="flyby">Sobrevuelo</option></select></label>
        </fieldset>
        <p id="im-design" class="mission-hint">Sonda activa: sin elegir.</p>
        <button id="im-compute" type="button" class="button-primary">Calcular misión</button>
        <button id="im-execute" type="button">Reproducir en el Centro de Misión</button>
        <p id="im-message" class="lab-message" role="status"></p>
        <details class="im-advanced" id="im-advanced"><summary>Configuración avanzada: oportunidad, encuentro y satélite</summary>
          <label class="im-check"><input id="im-refine" type="checkbox"> Refinar localmente la oportunidad (C3, ± 1 % del vuelo)</label>
          <fieldset class="im-group"><legend>Encuentro y órbita objetivo en el planeta</legend>
            <label class="lab-field">Esfera de influencia<select id="im-soi">${Object.entries(SOI_MODELS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
            <div class="lab-two-actions"><label class="lab-field">Periapsis (km alt.)<input id="im-rp" type="number" min="0" step="10"></label><label class="lab-field">Apoapsis objetivo (km alt.)<input id="im-ra" type="number" min="0" step="100"></label></div>
            <div class="lab-two-actions"><label class="lab-field">Plano B<select id="im-bmode"><option value="auto">Inclinación mínima</option><option value="fixed">Ángulo θ fijo</option></select></label><label class="lab-field">θ (°)<input id="im-btheta" type="number" step="1" value="0"></label></div>
          </fieldset>
          <fieldset class="im-group" id="im-moon-profile"><legend>Satélite</legend><label class="lab-field">Objetivo en el satélite<select id="im-moon-mode"><option value="capture">Captura en órbita (empuje finito)</option><option value="flyby">Sobrevuelo balístico</option></select></label><div class="lab-two-actions"><label class="lab-field">Periapsis en el satélite (km)<input id="im-mrp" type="number" min="1" step="5"></label><label class="lab-field">Apoapsis final (km)<input id="im-mra" type="number" min="1" step="5"></label></div>
            <label class="lab-field">Apoapsis intermedio (km; 0 = un solo encendido)<input id="im-mri" type="number" min="0" step="100"></label></fieldset>
          <p class="mission-hint">Al cambiar cualquier valor, el escenario pasa a «Personalizado».</p></details>
        <p class="mission-hint im-integration-note"><strong>Fases conectadas en este cálculo:</strong> salida heliocéntrica → llegada → captura o sobrevuelo → satélite. <strong>No conectadas:</strong> el despegue desde la superficie (herramienta «Lanzamiento terrestre», independiente) y la inyección que da el C3 de salida, que no se modela.</p>
        <p class="mission-hint" id="im-coverage">Cargando catálogos de efemérides…</p>
      </div></div>
    <div class="mission-stage lab-stage"><div class="lab-stage-top"><span class="eyebrow">CADENA DE FASES / TRAYECTORIA CALCULADA</span><span id="im-stage-status">Sin cálculo</span></div>
      <div class="im-stage-body"><ol id="im-chain" class="im-chain" aria-label="Fases de la misión"></ol>
        <div class="im-context" role="group" aria-label="Marco del gráfico"><button type="button" data-ctx="helio" aria-pressed="true">Heliocéntrico</button><button type="button" data-ctx="planet" aria-pressed="false">Planeta</button><button type="button" data-ctx="moon" aria-pressed="false">Satélite</button></div>
        <canvas id="im-plot" role="img" aria-label="Proyección eclíptica de la trayectoria calculada en el marco elegido"></canvas></div>
      <div class="lab-stage-foot"><span id="im-foot">Proyección sobre la eclíptica J2000 vista desde el norte · dorado: encendidos · azul: tramos balísticos · rojo: fase no viable</span></div>
    </div>
    <div class="mission-results lab-panel"><div class="lab-panel-heading"><span class="eyebrow">2 / PLANIFICAR · RESULTADOS</span><h3>Resultado de la misión</h3></div>
      <div class="lab-panel-scroll"><div id="im-verdict" class="mission-status" data-tone="idle">Sin cálculo</div>
        <div id="im-brief" class="im-brief"><p class="mission-hint">Configura la misión y pulsa «Calcular misión». Aquí aparecerá el resumen: vehículo, trayectoria, duración, maniobras, recursos, viabilidad y restricciones.</p></div>
        <div id="im-warnings"></div>
        <h4 class="im-tech-title">Resultados técnicos</h4>
        <details class="im-tech"><summary>Datos de la cadena</summary><div id="im-summary"></div></details>
        <details class="im-tech"><summary>Fases</summary><div id="im-phases" class="im-phases"></div></details>
        <details class="im-tech"><summary>Maniobras ejecutadas (integradas)</summary><div id="im-maneuvers" class="ip-table"></div></details>
        <details class="im-tech"><summary>Masa y propelente</summary><div id="im-mass"></div></details>
        <details class="im-tech"><summary>Energía eléctrica</summary><div id="im-power"></div></details>
        <details class="im-tech"><summary>Encuentro</summary><div id="im-approach"></div></details>
        <details class="im-tech"><summary>Continuidad entre tramos</summary><div id="im-continuity"></div></details>
        <details class="im-tech"><summary>Comparar misiones calculadas</summary><div id="im-compare" class="ip-table"></div></details>
        <details class="mission-details"><summary>Modelo, datos y límites</summary><div id="im-provenance"></div>${MISSION_LIMITS.map(item => `<p>${item}</p>`).join('')}</details>
      </div></div>`;
  const $ = selector => host.querySelector(selector);
  let helioEphemeris = null, loadError = null, moonsData = null, design = null, mission = null, data = null, execution = null, executionError = null, refinement = null, active = false, busy = false, plotContext = 'helio';
  function message(text, error = false) { $('#im-message').textContent = text; $('#im-message').dataset.error = String(error); }
  // 15: comparación de las últimas misiones calculadas en esta sesión (solo resúmenes; no se guardan en el navegador).
  const history = [];
  function remember(result) {
    const probeBurns = result.maneuvers.filter(m => m.engineKey === 'probe');
    history.unshift({ id: `${Date.now()}-${history.length}`, name: result.vehicle.probe.name, target: `${result.destinationName}${result.moonName ? ` → ${result.moonName}` : ''}`,
      moonMode: result.profile?.moon?.mode ?? (result.moonId ? 'capture' : null), verdict: result.verdict, tone: result.verdict.startsWith('NO VIABLE') ? 'bad' : result.verdict.startsWith('CADENA CALCULADA COMPLETA') ? 'ok' : 'warn',
      deltaVKmS: result.maneuvers.reduce((n, m) => n + m.propulsiveDeltaVKmS, 0), probeDeltaVKmS: probeBurns.reduce((n, m) => n + m.propulsiveDeltaVKmS, 0),
      propellantKg: result.maneuvers.reduce((n, m) => n + m.propellantKg, 0), finalMassKg: result.finalMassKg, launchMassKg: result.vehicle.totalKg,
      powerMarginW: result.power?.worst?.marginW ?? null, days: result.durationSeconds / 86400, firstFailure: result.phases.find(ph => ph.status === PHASE_STATUS.failed || ph.status === PHASE_STATUS.noData)?.label ?? null });
    history.splice(6);
  }
  const base = import.meta.env?.BASE_URL ?? '/';
  const fetchJson = async file => { const r = await fetch(`${base}${file}`); if (!r.ok) throw Error(`${file}: HTTP ${r.status}`); return r.json(); };
  Promise.all([fetchJson('data/interplanetary-ephemerides-catalog-v1.json'), fetchJson('data/encounter-ephemerides-catalog-v1.json')]).then(([a, b]) => {
    // Catálogo combinado: planetas (12G) + baricentros de los sistemas exteriores (13). Cuerpos distintos: no hay solapes que mezclar.
    helioEphemeris = createInterplanetaryEphemeris({ catalog: { catalogVersion: 1, datasets: [...a.datasets, ...b.datasets] }, loadJson: fetchJson });
    const cov = helioEphemeris.coverage('399');
    $('#im-coverage').textContent = `Cobertura de las efemérides heliocéntricas: ${dateOnly(cov.startJdTdb)} → ${dateOnly(cov.endJdTdb)} UTC (el cálculo usa TDB, ≈ 69 s por delante de UTC) · baricentros 5–8 (DE441) · satélites galileanos solo 2031-08-01 → 2032-06-01 (ventana de llegada adquirida). Fuera de la cobertura no se calcula: no se extrapola.`;
    // 17: el calendario de salida respeta la cobertura real de la Tierra (la del destino se comprueba al calcular).
    $('#im-departure').min = dateOnly(cov.startJdTdb); $('#im-departure').max = dateOnly(cov.endJdTdb - 20);
    renderFlow();
  }).catch(error => { loadError = error.message; $('#im-coverage').textContent = `${UNAVAILABLE_MESSAGE}: ${error.message}`; });

  function fillMoons() {
    const select = $('#im-moon'), previous = select.value; select.replaceChildren(new Option('Ninguno (solo el planeta)', ''));
    for (const id of Object.keys(MOON_WINDOW_KEYS)) if (getBodyProfile(id).parentId === $('#im-destination').value) select.append(new Option(`${getBodyProfile(id).name} (efemérides de ventana)`, id));
    select.value = [...select.options].some(o => o.value === previous) ? previous : '';
    $('#im-moon-profile').hidden = !select.value;
  }
  function applyScenario(id) {
    const s = INTEGRATED_SCENARIOS.find(item => item.id === id); if (!s) return;
    $('#im-destination').value = s.destinationId; fillMoons(); $('#im-moon').value = s.moonId; $('#im-moon-profile').hidden = !s.moonId;
    $('#im-departure').value = s.departureUtc; $('#im-tof').value = s.tofDays; $('#im-refine').checked = s.refine;
    $('#im-mode').value = s.planet.mode; $('#im-rp').value = s.planet.periapsisAltitudeKm; $('#im-ra').value = s.planet.apoapsisAltitudeKm;
    $('#im-soi').value = 'laplace'; $('#im-bmode').value = 'auto'; $('#im-btheta').value = 0;
    if (s.moon) { $('#im-mrp').value = s.moon.periapsisAltitudeKm; $('#im-mra').value = s.moon.apoapsisAltitudeKm; $('#im-mri').value = s.moon.intermediateApoapsisKm; }
    else { $('#im-mrp').value = 100; $('#im-mra').value = 100; $('#im-mri').value = 0; }
    $('#im-moon-mode').value = s.moon?.mode ?? 'capture';
    $('#im-scenario-note').textContent = s.note ?? ''; $('#im-scenario-note').hidden = !s.note;
    syncEnabled(); renderOutcome();
  }
  // 16: resultado esperado del escenario con la sonda activa (FleetGuide, comprobado por pruebas con el mismo motor).
  function renderOutcome() {
    const box = $('#im-outcome'), id = $('#im-scenario').value, probeId = design?.basedOn;
    box.replaceChildren(); box.hidden = true; delete box.dataset.tone;
    const outcome = probeId ? scenarioOutcome(id, probeId) : null;
    if (!outcome && design?.experimental && id !== 'custom') { box.hidden = false; box.dataset.tone = 'idle'; box.textContent = 'Vehículo experimental: el resultado esperado solo está comprobado para las cuatro sondas históricas. Pulsa «Calcular misión» para ver qué ocurre.'; return; }
    if (!outcome) {
      if (id === 'custom') { box.hidden = false; box.dataset.tone = 'idle'; box.textContent = 'Valores propios: el resultado depende de lo que ajustes. Pulsa «Calcular misión» para comprobarlo.'; }
      return;
    }
    const head = document.createElement('strong'); head.textContent = outcome.ok ? `Con ${design.name}: se completa según el modelo` : `Con ${design.name}: no se completa`;
    const why = document.createElement('span'); why.textContent = ` (${outcome.text}).`;
    const others = probesCompleting(id);
    const tip = document.createElement('small');
    tip.textContent = others.length ? `Lo completan: ${others.map(probeName).join(' y ')}.` : 'Ninguna de las cuatro sondas lo completa: sirve para ver en qué fase y por qué falla.';
    box.append(head, why, tip); box.dataset.tone = outcome.ok ? 'ok' : 'warn'; box.hidden = false;
  }
  function syncEnabled() {
    $('#im-btheta').disabled = $('#im-bmode').value !== 'fixed';
    $('#im-ra').disabled = $('#im-mode').value === 'flyby';
    const moonFlyby = $('#im-moon-mode').value === 'flyby';
    $('#im-mra').disabled = moonFlyby; $('#im-mri').disabled = moonFlyby;
  }
  function readInputs() {
    const n = sel => Number($(sel).value), issues = [];
    const departure = $('#im-departure').value, tof = n('#im-tof');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(departure)) issues.push('Fecha de salida inválida.');
    if (!(tof >= 20)) issues.push('El tiempo de vuelo debe ser de al menos 20 días.');
    const rp = n('#im-rp'), ra = n('#im-ra');
    if (!(rp >= 0)) issues.push('El periapsis planetario debe ser una altitud no negativa.');
    if ($('#im-mode').value === 'capture' && !(ra >= rp)) issues.push('La apoapsis objetivo debe ser ≥ periapsis.');
    const moonId = $('#im-moon').value || null, mrp = n('#im-mrp'), mra = n('#im-mra'), mri = n('#im-mri');
    const moonMode = $('#im-moon-mode').value === 'flyby' ? 'flyby' : 'capture';
    if (moonId && moonMode === 'flyby' && !(mrp > 0)) issues.push('Satélite: el periapsis del sobrevuelo debe ser > 0 km.');
    if (moonId && moonMode === 'capture' && (!(mrp > 0) || !(mra >= mrp) || !(mri >= 0) || (mri > 0 && mri < mra))) issues.push('Satélite: periapsis > 0, apoapsis final ≥ periapsis e intermedio 0 o ≥ apoapsis final.');
    return { issues, departure, tof, rp, ra, moonId, moonMode, mrp, mra, mri };
  }
  function invalidate(reason) {
    const had = Boolean(mission); mission = null; execution = null; executionError = null; data = null; refinement = null;
    $('#im-execute').disabled = true; renderAll();
    if (had) { message(reason); if (active) { active = false; onInvalidated(); } }
  }
  const changed = () => { syncEnabled(); invalidate('Las condiciones cambiaron: el cálculo anterior se invalidó. Vuelve a calcular.'); };
  for (const el of host.querySelectorAll('.mission-controls input, .mission-controls select')) if (el.id !== 'im-scenario') el.addEventListener('change', () => { $('#im-scenario').value = 'custom'; renderOutcome(); changed(); });
  $('#im-destination').addEventListener('change', fillMoons);
  $('#im-moon').addEventListener('change', () => { $('#im-moon-profile').hidden = !$('#im-moon').value; });
  $('#im-scenario').addEventListener('change', () => { applyScenario($('#im-scenario').value); renderOutcome(); changed(); });

  async function compute() {
    if (busy) return;
    if (!helioEphemeris) { message(loadError ? `${UNAVAILABLE_MESSAGE}: ${loadError}` : 'Espera la carga del catálogo de efemérides.', true); return; }
    if (!design) { message('Elige una sonda de la flota en «1 · Elegir sonda».', true); return; }
    const v = readInputs();
    if (v.issues.length) { message(v.issues.join(' '), true); return; }
    const tgt = ENCOUNTER_TARGETS[$('#im-destination').value];
    busy = true; $('#im-compute').disabled = true; $('#im-compute').setAttribute('aria-busy', 'true'); $('#im-stage-status').textContent = 'Calculando…'; $('#im-verdict').textContent = 'Calculando la cadena…'; $('#im-verdict').dataset.tone = 'idle'; renderFlow();
    message('Cargando efemérides y calculando: apuntado, encendidos integrados y fases…');
    await new Promise(resolve => setTimeout(resolve, 30));
    try {
      let departureJdTdb = datetimeLocalUtcToJdTdb(v.departure), tofDays = v.tof;
      const covE = helioEphemeris.coverage('399'), covT = helioEphemeris.coverage(tgt.ephemerisId);
      if (!covT) throw Error(`${UNAVAILABLE_MESSAGE} (${tgt.name}).`);
      const margin = Math.max(30, 0.02 * tofDays) + 140;
      const start = Math.max(covE.startJdTdb, covT.startJdTdb, departureJdTdb - margin), end = Math.min(covE.endJdTdb, covT.endJdTdb, departureJdTdb + tofDays + margin + 200);
      if (departureJdTdb < start || departureJdTdb + tofDays > end) throw Error(`${UNAVAILABLE_MESSAGE}: la oportunidad sale de la cobertura (${dateOnly(Math.max(covE.startJdTdb, covT.startJdTdb))} → ${dateOnly(Math.min(covE.endJdTdb, covT.endJdTdb))}).`);
      const helio = await helioEphemeris.loadWindow(['399', tgt.ephemerisId], start, end);
      refinement = null;
      if ($('#im-refine').checked) {
        refinement = refineTransferCandidate(helio, { destinationId: tgt.ephemerisId, departureJdTdb, tofDays, criterion: 'c3', halfSpanDepartureDays: refinementHalfSpanDays(tofDays), halfSpanTofDays: refinementHalfSpanDays(tofDays) });
        if (Number.isFinite(refinement.score)) { departureJdTdb = refinement.departureJdTdb; tofDays = refinement.tofDays; }
      }
      let moons = null;
      if (v.moonId) { moonsData ??= createPlanetocentricWindow(await fetchJson(MOON_WINDOW_FILE)); moons = moonsData; }
      const input = integratedMissionInput({ destinationId: tgt.id, moonId: v.moonId, departureJdTdb, tofDays, soiModel: $('#im-soi').value, planetMode: $('#im-mode').value, rp: v.rp, ra: v.ra,
        bPlane: $('#im-bmode').value === 'fixed' ? { mode: 'fixed', angleDeg: Number($('#im-btheta').value) } : { mode: 'auto' }, moonMode: v.moonMode, mrp: v.mrp, mra: v.mra, mri: v.mri }, design);
      data = { helio, moons };
      mission = computeIntegratedMission(input, data);
      // 17: si la cadena se calcula pero su reproducción necesitaría efemérides fuera de la ventana cargada, se conserva el
      // resultado y se indica que no hay trayectoria reproducible (no se extrapola ni se recorta en silencio).
      try { execution = createIntegratedExecution({ result: mission, data, design }); executionError = null; }
      catch (error) { execution = null; executionError = error.message; }
      $('#im-execute').disabled = !execution;
      remember(mission);
      message(execution ? `${mission.verdict} Cálculo en ${number(mission.computeMs, 0)} ms.`
        : `${mission.verdict} Reproducción 3D no disponible: ${executionError}. La cadena dura ${number(mission.durationSeconds / 86400, 1)} d y termina después de la ventana de efemérides cargada; no se extrapola.`, mission.verdict.startsWith('NO VIABLE') || !execution);
    } catch (error) { mission = null; execution = null; executionError = null; $('#im-execute').disabled = true; message(error.message, true); }
    finally { busy = false; $('#im-compute').disabled = false; $('#im-compute').removeAttribute('aria-busy'); renderAll(); }
  }
  $('#im-compute').addEventListener('click', compute);
  $('#im-execute').disabled = true;
  $('#im-execute').addEventListener('click', () => {
    if (!mission || !isIntegratedMissionCurrent(mission, design)) { message('Calcula una misión vigente para la sonda actual.', true); return; }
    if (!execution) { message(`Esta misión no tiene trayectoria reproducible: ${executionError ?? 'no disponible'}.`, true); return; }
    active = true; renderFlow();
    onExecuteRequest({ ready: true, kind: 'integrated', result: mission, data, design, name: `Tierra → ${mission.moonName ?? mission.destinationName} (${dateOnly(mission.departureJdTdb)})` });
  });
  for (const b of host.querySelectorAll('[data-ctx]')) b.addEventListener('click', () => { plotContext = b.dataset.ctx; for (const x of host.querySelectorAll('[data-ctx]')) x.setAttribute('aria-pressed', String(x === b)); drawPlot(); });

  // ---------- Presentación ----------
  function row(parent, label, value) { const r = document.createElement('div'); r.className = 'lab-metric'; const a = document.createElement('span'); a.textContent = label; const b = document.createElement('strong'); b.textContent = value; r.append(a, b); parent.append(r); }
  function renderChain() {
    const list = $('#im-chain'); list.replaceChildren();
    if (!mission) { const li = document.createElement('li'); li.className = 'im-chain-empty'; li.textContent = 'Elige un escenario y pulsa «Calcular misión».'; list.append(li); return; }
    for (const p of mission.phases) {
      const li = document.createElement('li'); li.dataset.tone = STATUS_TONE.get(p.status) ?? 'idle';
      const t = document.createElement('strong'); t.textContent = p.label; const s = document.createElement('small'); s.textContent = p.status;
      li.append(t, s); li.title = p.detail ?? ''; list.append(li);
    }
  }
  function sizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect(), ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * ratio)); canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); return { ctx, w: rect.width, h: rect.height };
  }
  function drawPlot() {
    const canvas = $('#im-plot'); if (!canvas.getContext) return;
    const { ctx, w, h } = sizeCanvas(canvas); ctx.clearRect(0, 0, w, h); ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#9fb0c4';
    for (const b of host.querySelectorAll('[data-ctx]')) b.disabled = !execution?.contexts?.[b.dataset.ctx];
    const C = execution?.contexts?.[plotContext];
    if (!C) { ctx.fillText(mission && !execution ? 'Gráfico no disponible: la cadena termina fuera de la ventana de efemérides cargada (no se extrapola).' : mission ? 'Este marco no tiene tramos en la misión calculada.' : 'Sin trayectoria calculada.', 16, 24); return; }
    const traj = C.transfer.trajectory, segs = C.segments;
    const pts = traj.map(p => p.positionKm), marks = traj.map(p => p.moonPositionKm), origin = traj.map(p => p.originPositionKm).filter(Boolean);
    // Encuadre: radio de la parte cercana (el mismo criterio que la vista 3D), con la trayectoria completa recortada al borde.
    const rFrame = C.transfer.overviewRadiusScene / C.transfer.sceneScale;
    const s = 0.46 * Math.min(w, h) / rFrame, cx = w / 2, cy = h / 2 + 6, P = p => [cx + p[0] * s, cy - p[1] * s];
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    const line = (arr, style, dash = []) => { ctx.strokeStyle = style; ctx.setLineDash(dash); ctx.beginPath(); arr.forEach((p, k) => { const [x, y] = P(p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]); };
    if (origin.length) line(origin, '#6f95c4', [4, 4]);
    if (!C.transfer.hideMoon) line(marks, '#c9a17a', [4, 4]);
    let k = 0;
    for (const seg of segs) {
      const part = [];
      while (k < traj.length && traj[k].elapsedSeconds <= seg.endSeconds + 1e-6) { if (traj[k].elapsedSeconds >= seg.startSeconds - 1e-6) part.push(traj[k].positionKm); k++; }
      if (k < traj.length && part.length) part.push(traj[k].positionKm);
      if (part.length > 1) { ctx.lineWidth = seg.kind === 'burn' ? 3 : 1.5; line(part, seg.kind === 'burn' ? '#f0c56a' : seg.kind === 'landing' ? '#a9e2c5' : '#7fb6dd'); ctx.lineWidth = 1; }
    }
    const radiusPx = Math.max(2.5, C.transfer.bodyRadiusKm * s);
    ctx.fillStyle = C.transfer.centralBody.color; ctx.beginPath(); ctx.arc(cx, cy, Math.min(radiusPx, 0.4 * Math.min(w, h)), 0, Math.PI * 2); ctx.fill();
    const [ex, ey] = P(pts.at(-1)); ctx.fillStyle = '#e4ba78'; ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#c6d2de';
    const scaleText = plotContext === 'helio' ? `${number(rFrame / KM_PER_AU, 2)} AU` : `${number(rFrame, 0)} km`;
    ctx.fillText(`${C.transfer.centralBody.name} al centro · radio encuadrado ${scaleText} · ${plotContext === 'planet' ? 'la aproximación desde el borde de la esfera de influencia sale del encuadre' : 'eclíptica J2000, vista desde el norte'}`, 8, h - 8);
  }
  function renderResults() {
    const verdict = $('#im-verdict'), summary = $('#im-summary'); summary.replaceChildren();
    for (const id of ['#im-phases', '#im-maneuvers', '#im-mass', '#im-approach', '#im-continuity', '#im-warnings', '#im-provenance']) $(id).replaceChildren();
    $('#im-stage-status').textContent = mission ? `${mission.segments.length} tramos · ${number(mission.durationSeconds / 86400, 1)} d` : 'Sin cálculo';
    renderBrief();
    if (!mission) { verdict.textContent = 'Sin cálculo'; verdict.dataset.tone = 'idle'; return; }
    verdict.textContent = mission.verdict;
    verdict.dataset.tone = mission.verdict.startsWith('NO VIABLE') ? 'bad' : mission.verdict.startsWith('CADENA CALCULADA COMPLETA') ? 'ok' : 'warn';
    row(summary, 'Destino', `${mission.destinationName}${mission.moonName ? ` → ${mission.moonName}` : ''} · ${mission.target.centerLabel}`);
    row(summary, 'Salida (TDB → UTC)', utcLabel(mission.departureJdTdb));
    row(summary, 'Periapsis de llegada', utcLabel(mission.arrivalJdTdb));
    row(summary, 'Duración de la cadena', `${number(mission.durationSeconds / 86400, 2)} d`);
    if (mission.departure) row(summary, 'C3 de salida (apuntado al periapsis)', `${number(mission.departure.c3Km2S2, 3)} km²/s² · inyección externa no modelada`);
    row(summary, 'Masa en la inyección', `${number(mission.vehicle.totalKg, 0)} kg · capacidad del lanzador: no evaluada`);
    if (refinement) row(summary, 'Oportunidad', Number.isFinite(refinement.score) ? `refinada (C3 ${number(refinement.gridScore, 3)} → ${number(refinement.score, 3)} hacia el centro del destino; ${refinement.evaluations} evaluaciones)${refinement.atRefinementBoundary ? ' · en el borde de la caja' : ''}` : 'refinamiento sin solución: se usa la semilla');
    for (const p of mission.phases) {
      const el = document.createElement('div'); el.className = 'im-phase'; el.dataset.tone = STATUS_TONE.get(p.status) ?? 'idle';
      const t = document.createElement('strong'); t.textContent = p.label; const st = document.createElement('span'); st.textContent = `${p.status} · ${p.level}`;
      const d = document.createElement('p'); d.textContent = p.detail ?? ''; el.append(t, st, d); $('#im-phases').append(el);
    }
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Maniobra</th><th>Dur.</th><th>Δv finito</th><th>Δv impulsivo</th><th>Prop.</th><th>Fin</th></tr></thead>';
    const tb = document.createElement('tbody');
    for (const mv of mission.maneuvers) {
      const tr = document.createElement('tr');
      const fin = { cutoff: 'apoapsis objetivo', depleted: 'agotado', targeted: 'apuntado', horizon: 'sin objetivo', contact: 'contacto' }[mv.endEvent] ?? mv.endEvent;
      for (const text of [mv.label, `${number(mv.durationSeconds, 0)} s`, `${number(mv.propulsiveDeltaVKmS * 1000, 1)} m/s`, Number.isFinite(mv.impulsiveDeltaVKmS) ? `${number(mv.impulsiveDeltaVKmS * 1000, 1)} m/s` : '—', `${number(mv.propellantKg, 0)} kg`, fin]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
      tb.append(tr);
    }
    if (!mission.maneuvers.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 6; td.textContent = 'Sin encendidos (sobrevuelo balístico).'; tr.append(td); tb.append(tr); }
    table.append(tb); $('#im-maneuvers').append(table);
    const v = mission.vehicle, m = $('#im-mass');
    row(m, `Sonda «${v.probe.name}»`, `${number(v.probe.wetKg, 1)} kg (propelente ${number(v.probe.propellantKg, 1)} → ${number(mission.tanks.probe, 1)} kg)`);
    if (v.module) row(m, 'Módulo de propulsión (ilustrativo)', `${number(v.module.wetKg, 0)} kg (seco ${number(v.module.dryKg, 0)}; propelente ${number(v.module.propellantKg, 0)} → ${number(mission.tanks.module, 0)} kg)`);
    if (v.lander) row(m, 'Módulo de aterrizaje (12F, ilustrativo)', `${number(v.lander.wetKg, 0)} kg (propelente ${number(v.lander.propellantKg, 0)} → ${number(mission.tanks.lander, 0)} kg)`);
    row(m, 'Motor de captura', v.captureEngine === 'module' ? `${v.module.engine.name} · ${number(v.module.engine.thrustN / 1000, 1)} kN · Isp ${number(v.module.engine.ispS, 0)} s` : v.probe.engine ? `${v.probe.engine.name} · ${number(v.probe.engine.thrustN, 0)} N · Isp ${number(v.probe.engine.ispS, 0)} s` : 'Sin motor');
    for (const s of mission.separations) row(m, 'Separación', `${s.released}; masa ${number(s.massBeforeKg, 0)} → ${number(s.massAfterKg, 0)} kg`);
    row(m, 'Masa final', `${number(mission.finalMassKg, 1)} kg`);
    const pw = mission.power, pe = $('#im-power');
    if (pw) {
      row(pe, 'Balance de la misión', pw.sustainable ? 'Suficiente según el modelo' : 'Insuficiente: la sonda no puede operar todo el recorrido');
      row(pe, 'Margen mínimo', `${number(pw.worst.marginW, 0)} W a ${number(pw.worst.distanceAu, 2)} AU (${number(pw.worst.generationW, 0)} W generados · ${number(pw.serviceW, 0)} W de servicio)`);
      row(pe, 'Déficit acumulado / batería', `${number(pw.deficitWh, 0)} Wh / ${number(pw.batteryWh, 0)} Wh`);
      for (const b of pw.burns) row(pe, `Encendido · ${b.label}`, `${number(b.loadW, 0)} W de carga frente a ${number(b.generationW, 0)} W a ${number(b.distanceAu, 2)} AU`);
      if (mission.vehicle.probe.engine?.electric) row(pe, 'Propulsión eléctrica', mission.phases.find(ph => ph.id === 'capture')?.detail?.includes('no puede encenderse') ? 'Bloqueada por falta de potencia en el destino' : 'Empuje reducido según la potencia disponible en el destino');
      const note = document.createElement('p'); note.className = 'mission-hint'; note.textContent = pw.model; pe.append(note);
    } else row(pe, 'Balance de la misión', 'No disponible');
    renderCompare();
    const a = mission.approach, ap = $('#im-approach');
    if (a?.vInfKmS) {
      row(ap, 'Esfera de influencia', `${number(a.soiRadiusKm, 0)} km (${SOI_MODELS[a.soiModel].label})`);
      row(ap, 'v∞ de llegada', `${number(a.vInfKmS, 4)} km/s`);
      row(ap, 'Plano B: B·T / B·R', `${number(a.BdotT, 0)} / ${number(a.BdotR, 0)} km · θ ${number(a.bAngleDeg, 2)}°`);
      row(ap, 'Periapsis apuntado / logrado', `${number(a.periapsisTargetKm - mission.target.radiusKm, 2)} / ${number(a.periapsisAltitudeKm, 4)} km alt.`);
      row(ap, 'Excentricidad · giro', `${number(a.eccentricity, 5)} · ${number(a.turnAngleDeg, 2)}°`);
      row(ap, 'SOI → periapsis', `${number(a.secondsSoiToPeriapsis / 86400, 3)} d`);
      const note = document.createElement('p'); note.className = 'mission-hint'; note.textContent = a.bPlaneNote; ap.append(note);
      if (a.moon) row(ap, `${mission.moonName}: v∞ · periapsis`, `${number(a.moon.vInfKmS, 4)} km/s · ${number(a.moon.periapsisAltitudeKm, 3)} km (objetivo ${number(a.moon.periapsisTargetAltitudeKm, 0)})`);
      for (const c of a.closeApproaches ?? []) row(ap, `Distancia mínima a ${c.name}`, `${number(c.minimumDistanceKm, 0)} km${c.insideSoi ? ' · DENTRO de su SOI' : ''}`);
    }
    const c = mission.continuity, ct = $('#im-continuity');
    row(ct, 'Fronteras comprobadas', `${c.boundaries.length} (${c.boundaries.filter(b => b.frameChange).length} con cambio de marco)`);
    row(ct, 'Máx. salto de posición', `${c.maxPositionErrorKm.toExponential(2)} km`);
    row(ct, 'Máx. salto de velocidad', `${c.maxVelocityErrorKmS.toExponential(2)} km/s`);
    row(ct, 'Huecos de tiempo · masa no declarada', `${c.maxTimeGapSeconds} s · ${c.undeclaredMassJumps}`);
    for (const wtext of mission.warnings) { const el = document.createElement('p'); el.className = 'lab-message'; el.dataset.error = 'true'; el.textContent = wtext; $('#im-warnings').append(el); }
    const pv = $('#im-provenance');
    row(pv, 'Planeta / baricentro', `${mission.target.centerLabel} · GM ${number(mission.target.mu, 1)} km³/s² (${mission.target.massScope})`);
    row(pv, 'Efemérides', 'NASA/JPL Horizons (12G + baricentros 13), Hermite sin extrapolación');
    if (mission.moonId) row(pv, 'Satélites', `${MOON_WINDOW_FILE} · centro 500@5 · ${MOON_UNAVAILABLE_MESSAGE.toLowerCase()} fuera de la ventana`);
    row(pv, 'Validación', '13 implementada y probada localmente; pendiente de auditoría.');
  }
  function renderCompare() {
    const box = $('#im-compare'); box.replaceChildren();
    if (!history.length) { const p = document.createElement('p'); p.className = 'mission-hint'; p.textContent = 'Las misiones que calcules aparecerán aquí para compararlas.'; box.append(p); return; }
    const table = document.createElement('table');
    table.innerHTML = '<caption class="sr-only">Comparación de las últimas misiones calculadas</caption><thead><tr><th scope="col">Sonda · destino</th><th scope="col">Resultado</th><th scope="col">Δv sonda</th><th scope="col">Propelente</th><th scope="col">Masa final</th><th scope="col">Margen eléctrico</th></tr></thead>';
    const tb = document.createElement('tbody');
    for (const h of history) {
      const tr = document.createElement('tr'); tr.dataset.tone = h.tone;
      const cells = [`${h.name} · ${h.target}${h.moonMode === 'flyby' ? ' (sobrevuelo)' : h.moonMode === 'capture' ? ' (captura)' : ''}`,
        h.tone === 'ok' ? 'Completa según el modelo' : h.firstFailure ? `No viable: ${h.firstFailure}` : 'Objetivos no alcanzados',
        `${number(h.probeDeltaVKmS * 1000, 0)} m/s`, `${number(h.propellantKg, 0)} kg`, `${number(h.finalMassKg, 0)} kg`, h.powerMarginW == null ? '—' : `${number(h.powerMarginW, 0)} W`];
      for (const text of cells) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
      tb.append(tr);
    }
    table.append(tb); box.append(table);
    const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Vaciar comparación';
    clear.addEventListener('click', () => { history.length = 0; renderCompare(); });
    box.append(clear);
  }
  // 17: resumen en lenguaje claro (primer nivel de información). El detalle técnico sigue debajo, plegado.
  function renderBrief() {
    const box = $('#im-brief'); box.replaceChildren();
    if (!mission) {
      const p = document.createElement('p'); p.className = 'mission-hint';
      p.textContent = busy ? 'Calculando la trayectoria…' : 'Configura la misión y pulsa «Calcular misión». Aquí aparecerá el resumen: vehículo, trayectoria, duración, maniobras, recursos, viabilidad y restricciones.';
      box.append(p); return;
    }
    const burns = mission.maneuvers, probeBurns = burns.filter(m => m.engineKey === 'probe');
    const usedKg = burns.reduce((n, m) => n + m.propellantKg, 0);
    const failure = mission.phases.find(ph => ph.status === PHASE_STATUS.failed || ph.status === PHASE_STATUS.noData);
    const tone = mission.verdict.startsWith('NO VIABLE') ? 'bad' : mission.verdict.startsWith('CADENA CALCULADA COMPLETA') ? 'ok' : 'warn';
    const planetMode = mission.profile?.planet?.mode ?? $('#im-mode').value;
    const moonMode = mission.profile?.moon?.mode ?? (mission.moonId ? 'capture' : null);
    const rows = [
      ['Misión', `Tierra → ${mission.destinationName}${mission.moonName ? ` → ${mission.moonName}` : ''} · ${planetMode === 'flyby' ? 'sobrevuelo del planeta' : 'captura en órbita'}${moonMode ? ` · ${moonMode === 'flyby' ? 'sobrevuelo' : 'captura'} en el satélite` : ''}`],
      ['Vehículo', `${mission.vehicle.probe.name}${design?.experimental ? ' (ensamblaje experimental, hipotético)' : ' (configuración histórica)'} · ${number(mission.vehicle.totalKg, 0)} kg`],
      ['Trayectoria', `${mission.segments.length} tramos integrados · salida ${dateOnly(mission.departureJdTdb)} → llegada ${dateOnly(mission.arrivalJdTdb)} (UTC)`],
      ['Duración', `${number(mission.durationSeconds / 86400, 1)} días`],
      ['Maniobras', burns.length ? `${burns.length} encendido${burns.length === 1 ? '' : 's'} · Δv de la sonda ${number(probeBurns.reduce((n, m) => n + m.propulsiveDeltaVKmS, 0) * 1000, 0)} m/s` : 'Sin encendidos (sobrevuelo balístico)'],
      ['Recursos', `Propelente usado ${number(usedKg, 0)} kg · masa final ${number(mission.finalMassKg, 0)} kg${mission.power ? ` · margen eléctrico mínimo ${number(mission.power.worst.marginW, 0)} W` : ''}`],
      ['Viabilidad', tone === 'ok' ? 'Completa según el modelo (no equivale a éxito operativo)' : failure ? `No viable: falla en «${failure.label}»` : 'Calculada, pero no alcanza todos los objetivos'],
      ['Restricciones', 'Inyección desde la Tierra no modelada (C3) · capacidad del lanzador no evaluada · lanzamiento no encadenado'],
      ['Reproducción 3D', execution ? 'Disponible: pulsa «Reproducir en el Centro de Misión»' : `No disponible: ${executionError ?? 'sin trayectoria reproducible'} (no se extrapola)`]
    ];
    const list = document.createElement('dl'); list.className = 'im-brief-list'; list.dataset.tone = tone;
    for (const [label, value] of rows) { const item = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = value; item.append(dt, dd); list.append(item); }
    box.append(list);
  }
  // 17: progreso del flujo destino → fechas → tipo → cálculo → maniobras → recursos → reproducción.
  function renderFlow() {
    const v = readInputs();
    const done = { destination: Boolean($('#im-destination').value), dates: /^\d{4}-\d{2}-\d{2}$/.test(v.departure) && v.tof >= 20, type: Boolean($('#im-mode').value),
      compute: Boolean(mission), maneuvers: Boolean(mission), resources: Boolean(mission), play: Boolean(mission) && active };
    let current = null;
    for (const item of host.querySelectorAll('#im-flow > li')) {
      const key = item.dataset.flow;
      item.dataset.state = done[key] ? 'done' : current ? 'todo' : 'current';
      if (!done[key] && !current) current = key;
      if (key === 'compute' && busy) item.dataset.state = 'busy';
      if (key === 'resources' && mission?.verdict.startsWith('NO VIABLE')) item.dataset.state = 'bad';
      if (key === 'play' && mission && !execution) item.dataset.state = 'bad';
      if (item.dataset.state === 'current') item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    }
    onStateChange(); // 17: la barra de resumen del laboratorio refleja «calculando», «calculada» o «invalidada» al instante.
  }
  function renderAll() { renderChain(); drawPlot(); renderResults(); if (!mission) renderCompare(); renderFlow(); }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!host.hidden) drawPlot(); }) : null;
  observer?.observe($('#im-plot'));
  $('#im-bmode').addEventListener('change', syncEnabled); $('#im-mode').addEventListener('change', syncEnabled); $('#im-moon-mode').addEventListener('change', syncEnabled);
  fillMoons(); applyScenario('A1'); renderAll();
  return {
    setDesign(next) {
      design = next;
      $('#im-design').textContent = next ? `Sonda activa: ${next.name}. Todas las maniobras usan su propio motor y propelente (${next.experimental ? 'ensamblaje experimental: resultados hipotéticos' : 'configuración histórica'}). Puedes cambiarla en la barra superior.` : 'Sonda activa: sin elegir.';
      renderOutcome();
      if (mission && !isIntegratedMissionCurrent(mission, design)) invalidate('La sonda activa cambió: el cálculo anterior se invalidó.');
    },
    setVisible(visible) { if (visible) drawPlot(); },
    isActive: () => active, deactivate() { active = false; renderFlow(); },
    getState: () => ({ mission, refinement, scenarioId: $('#im-scenario').value, busy, executable: Boolean(mission && execution) && !$('#im-execute').disabled, executionError }),
    compute, applyScenario,
    dispose() { observer?.disconnect(); host.replaceChildren(); }
  };
}
export { moduleDryMassKg };
