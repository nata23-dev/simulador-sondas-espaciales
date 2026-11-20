// Etapa 13 — Planificador «Misión completa»: una sola interfaz para cualquier destino planetario (y los satélites galileanos con
// efemérides de ventana). Flujo: destino → oportunidad (12G, refinada localmente) → sonda del Hangar (+ módulos ilustrativos) →
// perfil de encuentro y órbitas objetivo → cálculo de la cadena → fases viables / no viables → Centro de Misión.
// No hay pantallas por planeta: todo sale de `computeIntegratedMission` con los datos del destino elegido.
import { createInterplanetaryEphemeris, UNAVAILABLE_MESSAGE } from '../science/InterplanetaryEphemeris.js';
import { createPlanetocentricWindow, MOON_UNAVAILABLE_MESSAGE } from '../science/PlanetocentricWindow.js';
import { tdbToTimeScales, datetimeLocalUtcToJdTdb } from '../science/AstrodynamicsTime.js';
import { KM_PER_AU } from '../science/Units.js';
import { SOI_MODELS } from '../science/PlanetaryEncounter.js';
import { refineTransferCandidate } from '../lab/InterplanetaryPlan.js';
import { computeIntegratedMission, ENCOUNTER_TARGETS, MOON_WINDOW_KEYS, DEMO_PROPULSION_MODULE, PHASE_STATUS, MISSION_LIMITS, moduleDryMassKg, isIntegratedMissionCurrent } from '../lab/IntegratedMission.js';
import { createIntegratedExecution } from '../lab/IntegratedMissionPlayback.js';
import { DEMO_LANDER } from '../lab/BodyLandingVehicle.js';
import { getBodyProfile } from '../lab/CelestialBodyMissionRegistry.js';

const number = (n, digits = 1) => Number.isFinite(n) ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(n) : 'No disponible';
const utcLabel = jd => tdbToTimeScales(jd).labelUtc;
const dateOnly = jd => utcLabel(jd).slice(0, 10);
const RJ = 69911;
const MOON_WINDOW_FILE = 'data/interplanetary/galilean-moons-jsb-2031-2032.json';

// Escenarios de demostración. Las semillas de oportunidad son los mejores candidatos de la cuadrícula 12G (docs/STAGE12G…, tabla de
// casos A y C); el planificador los refina localmente antes de calcular. Masas y motores: Hangar + módulos ILUSTRATIVOS.
export const INTEGRATED_SCENARIOS = Object.freeze([
  { id: 'A1', label: 'A · Tierra → Marte · combustible suficiente', destinationId: '499', moonId: '', departureUtc: '2028-11-30', tofDays: 316, refine: true,
    module: false, lander: false, landing: true, planet: { mode: 'capture', periapsisAltitudeKm: 400, apoapsisAltitudeKm: 33000 } },
  { id: 'A2', label: 'A · Tierra → Marte · combustible insuficiente (órbita circular)', destinationId: '499', moonId: '', departureUtc: '2028-11-30', tofDays: 316, refine: true,
    module: false, lander: false, landing: false, planet: { mode: 'capture', periapsisAltitudeKm: 400, apoapsisAltitudeKm: 400 } },
  { id: 'A3', label: 'A · Tierra → Marte · sobrevuelo sin frenado', destinationId: '499', moonId: '', departureUtc: '2028-11-30', tofDays: 316, refine: true,
    module: false, lander: false, landing: false, planet: { mode: 'flyby', periapsisAltitudeKm: 400, apoapsisAltitudeKm: 33000 } },
  { id: 'B1', label: 'B · Tierra → Júpiter → Europa · cadena completa con módulo ilustrativo de 80 t', destinationId: '599', moonId: '502', departureUtc: '2028-12-26', tofDays: 1090, refine: true,
    module: true, modulePropellantKg: 80000, lander: true, landing: true, planet: { mode: 'capture', periapsisAltitudeKm: 3 * RJ, apoapsisAltitudeKm: 4000000 },
    moon: { periapsisAltitudeKm: 100, intermediateApoapsisKm: 5000, apoapsisAltitudeKm: 100 } },
  { id: 'B2', label: 'B · Tierra → Júpiter → Europa · propelente insuficiente', destinationId: '599', moonId: '502', departureUtc: '2028-12-26', tofDays: 1090, refine: true,
    module: true, modulePropellantKg: 50000, lander: true, landing: true, planet: { mode: 'capture', periapsisAltitudeKm: 3 * RJ, apoapsisAltitudeKm: 4000000 },
    moon: { periapsisAltitudeKm: 100, intermediateApoapsisKm: 5000, apoapsisAltitudeKm: 100 } },
  // 15: escenario de referencia de VISION_FINAL con la sonda activa del Hangar (p. ej., una variante de Cassini), sin módulo auxiliar.
  { id: 'C1', label: 'C · Sonda del Hangar → Júpiter (órbita tipo Juno) → sobrevuelo de Europa', destinationId: '599', moonId: '502', departureUtc: '2028-12-26', tofDays: 1090, refine: true,
    module: false, lander: false, landing: false, planet: { mode: 'capture', periapsisAltitudeKm: 4200, apoapsisAltitudeKm: 8000000 },
    moon: { mode: 'flyby', periapsisAltitudeKm: 100, intermediateApoapsisKm: 0, apoapsisAltitudeKm: 100 },
    note: 'Usa la sonda activa del Hangar sin módulo auxiliar. Una variante de Cassini o Juno suele completar la cadena; el resultado depende del diseño.' },
  { id: 'C2', label: 'C · Sonda del Hangar → Júpiter → captura en órbita de Europa', destinationId: '599', moonId: '502', departureUtc: '2028-12-26', tofDays: 1090, refine: true,
    module: false, lander: false, landing: false, planet: { mode: 'capture', periapsisAltitudeKm: 4200, apoapsisAltitudeKm: 8000000 },
    moon: { mode: 'capture', periapsisAltitudeKm: 100, intermediateApoapsisKm: 5000, apoapsisAltitudeKm: 100 },
    note: 'La captura directa en Europa exige varios km/s; con el propelente de una sonda histórica el modelo suele declararla no viable y explica por qué.' }
]);
const STATUS_TONE = new Map([[PHASE_STATUS.done, 'ok'], [PHASE_STATUS.partial, 'warn'], [PHASE_STATUS.failed, 'bad'], [PHASE_STATUS.noData, 'bad'],
  [PHASE_STATUS.skipped, 'idle'], [PHASE_STATUS.pending, 'idle'], [PHASE_STATUS.initial, 'idle']]);

export function createIntegratedMissionPlanner({ host, onExecuteRequest = () => {}, onInvalidated = () => {} }) {
  host.classList.add('mission-planner', 'integrated-planner');
  const planets = Object.values(ENCOUNTER_TARGETS);
  host.innerHTML = `
    <div class="mission-controls lab-panel"><div class="lab-panel-heading"><span class="eyebrow">03 / PLANIFICADOR · MISIÓN COMPLETA</span><h3>Cadena de fases</h3></div>
      <div class="lab-panel-scroll">
        <p class="mission-intro">Conecta crucero heliocéntrico, encuentro, captura con empuje finito, operaciones planetocéntricas, satélite y descenso. Cada fase empieza en el estado final de la anterior.</p>
        <label class="lab-field">Escenario<select id="im-scenario">${INTEGRATED_SCENARIOS.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}<option value="custom">Personalizado</option></select></label>
        <p id="im-scenario-note" class="mission-hint" hidden></p>
        <fieldset class="im-group"><legend>1 · Destino y oportunidad</legend>
          <label class="lab-field">Planeta<select id="im-destination">${planets.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
          <label class="lab-field">Satélite (fase planetocéntrica)<select id="im-moon"></select></label>
          <div class="lab-two-actions"><label class="lab-field">Salida (UTC)<input id="im-departure" type="date"></label><label class="lab-field">Vuelo (d)<input id="im-tof" type="number" min="20" step="0.5"></label></div>
          <label class="im-check"><input id="im-refine" type="checkbox"> Refinar localmente la oportunidad (C3, ± 1 % del vuelo)</label>
        </fieldset>
        <fieldset class="im-group"><legend>2 · Vehículo</legend>
          <p id="im-design" class="mission-hint">Sonda del Hangar: sin diseño.</p>
          <label class="im-check"><input id="im-module" type="checkbox"> Módulo de propulsión orbital (ilustrativo)</label>
          <div class="lab-two-actions"><label class="lab-field">Propelente (kg)<input id="im-module-prop" type="number" min="0" step="500"></label><label class="lab-field">Empuje (kN)<input id="im-module-thrust" type="number" min="0.1" step="1"></label></div>
          <label class="lab-field">Isp del módulo (s)<input id="im-module-isp" type="number" min="50" max="500" step="1"></label>
          <label class="im-check"><input id="im-lander" type="checkbox"> Módulo de aterrizaje demostrativo de 12F</label>
          <label class="im-check"><input id="im-landing" type="checkbox"> Intentar el descenso si el estado final es compatible</label>
        </fieldset>
        <fieldset class="im-group"><legend>3 · Encuentro y órbitas objetivo</legend>
          <div class="lab-two-actions"><label class="lab-field">Modo en el planeta<select id="im-mode"><option value="capture">Captura</option><option value="flyby">Sobrevuelo</option></select></label>
            <label class="lab-field">Esfera de influencia<select id="im-soi">${Object.entries(SOI_MODELS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label></div>
          <div class="lab-two-actions"><label class="lab-field">Periapsis (km alt.)<input id="im-rp" type="number" min="0" step="10"></label><label class="lab-field">Apoapsis objetivo (km alt.)<input id="im-ra" type="number" min="0" step="100"></label></div>
          <div class="lab-two-actions"><label class="lab-field">Plano B<select id="im-bmode"><option value="auto">Inclinación mínima</option><option value="fixed">Ángulo θ fijo</option></select></label><label class="lab-field">θ (°)<input id="im-btheta" type="number" step="1" value="0"></label></div>
          <div id="im-moon-profile"><label class="lab-field">Objetivo en el satélite<select id="im-moon-mode"><option value="capture">Captura en órbita (empuje finito)</option><option value="flyby">Sobrevuelo balístico</option></select></label><div class="lab-two-actions"><label class="lab-field">Periapsis en el satélite (km)<input id="im-mrp" type="number" min="1" step="5"></label><label class="lab-field">Apoapsis final (km)<input id="im-mra" type="number" min="1" step="5"></label></div>
            <label class="lab-field">Apoapsis intermedio (km; 0 = un solo encendido)<input id="im-mri" type="number" min="0" step="100"></label></div>
        </fieldset>
        <p class="mission-hint" id="im-coverage">Cargando catálogos de efemérides…</p>
        <button id="im-compute" type="button" class="button-primary">Calcular misión</button>
        <button id="im-execute" type="button">Reproducir en el Centro de Misión</button>
        <p id="im-message" class="lab-message" role="status"></p>
      </div></div>
    <div class="mission-stage lab-stage"><div class="lab-stage-top"><span class="eyebrow">CADENA DE FASES / TRAYECTORIA CALCULADA</span><span id="im-stage-status">Sin cálculo</span></div>
      <div class="im-stage-body"><ol id="im-chain" class="im-chain" aria-label="Fases de la misión"></ol>
        <div class="im-context" role="group" aria-label="Marco del gráfico"><button type="button" data-ctx="helio" aria-pressed="true">Heliocéntrico</button><button type="button" data-ctx="planet" aria-pressed="false">Planeta</button><button type="button" data-ctx="moon" aria-pressed="false">Satélite</button></div>
        <canvas id="im-plot" role="img" aria-label="Proyección eclíptica de la trayectoria calculada en el marco elegido"></canvas></div>
      <div class="lab-stage-foot"><span id="im-foot">Proyección sobre la eclíptica J2000 vista desde el norte · dorado: encendidos · azul: tramos balísticos · rojo: fase no viable</span></div>
    </div>
    <div class="mission-results lab-panel"><div class="lab-panel-heading"><span class="eyebrow">04 / RESULTADOS</span><h3>Evaluación por fases</h3></div>
      <div class="lab-panel-scroll"><div id="im-verdict" class="mission-status" data-tone="idle">Sin cálculo</div><div id="im-summary"></div>
        <h4>Fases</h4><div id="im-phases" class="im-phases"></div>
        <h4>Maniobras ejecutadas (integradas)</h4><div id="im-maneuvers" class="ip-table"></div>
        <h4>Masa y propelente</h4><div id="im-mass"></div>
        <h4>Energía eléctrica</h4><div id="im-power"></div>
        <h4>Encuentro</h4><div id="im-approach"></div>
        <h4>Continuidad entre tramos</h4><div id="im-continuity"></div>
        <div id="im-warnings"></div>
        <h4>Comparar misiones calculadas</h4><div id="im-compare" class="ip-table"></div>
        <details class="mission-details"><summary>Modelo, datos y límites</summary><div id="im-provenance"></div>${MISSION_LIMITS.map(item => `<p>${item}</p>`).join('')}</details>
      </div></div>`;
  const $ = selector => host.querySelector(selector);
  let helioEphemeris = null, loadError = null, moonsData = null, design = null, mission = null, data = null, execution = null, refinement = null, active = false, busy = false, plotContext = 'helio';
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
    $('#im-coverage').textContent = `Efemérides heliocéntricas: ${dateOnly(cov.startJdTdb)} → ${dateOnly(cov.endJdTdb)} · baricentros 5–8 (DE441) · satélites galileanos solo 2031-08-01 → 2032-06-01 (ventana de llegada adquirida).`;
  }).catch(error => { loadError = error.message; $('#im-coverage').textContent = `${UNAVAILABLE_MESSAGE}: ${error.message}`; });

  function fillMoons() {
    const select = $('#im-moon'), previous = select.value; select.replaceChildren(new Option('Ninguno (solo el planeta)', ''));
    for (const [id, key] of Object.entries(MOON_WINDOW_KEYS)) if (getBodyProfile(id).parentId === $('#im-destination').value) select.append(new Option(`${getBodyProfile(id).name} (efemérides de ventana)`, id));
    select.value = [...select.options].some(o => o.value === previous) ? previous : '';
    $('#im-moon-profile').hidden = !select.value;
  }
  function applyScenario(id) {
    const s = INTEGRATED_SCENARIOS.find(item => item.id === id); if (!s) return;
    $('#im-destination').value = s.destinationId; fillMoons(); $('#im-moon').value = s.moonId; $('#im-moon-profile').hidden = !s.moonId;
    $('#im-departure').value = s.departureUtc; $('#im-tof').value = s.tofDays; $('#im-refine').checked = s.refine;
    $('#im-module').checked = s.module; $('#im-module-prop').value = s.modulePropellantKg ?? DEMO_PROPULSION_MODULE.propellantKg;
    $('#im-module-thrust').value = DEMO_PROPULSION_MODULE.engine.thrustN / 1000; $('#im-module-isp').value = DEMO_PROPULSION_MODULE.engine.ispS;
    $('#im-lander').checked = s.lander; $('#im-landing').checked = s.landing;
    $('#im-mode').value = s.planet.mode; $('#im-rp').value = s.planet.periapsisAltitudeKm; $('#im-ra').value = s.planet.apoapsisAltitudeKm;
    $('#im-soi').value = 'laplace'; $('#im-bmode').value = 'auto'; $('#im-btheta').value = 0;
    if (s.moon) { $('#im-mrp').value = s.moon.periapsisAltitudeKm; $('#im-mra').value = s.moon.apoapsisAltitudeKm; $('#im-mri').value = s.moon.intermediateApoapsisKm; }
    else { $('#im-mrp').value = 100; $('#im-mra').value = 100; $('#im-mri').value = 0; }
    $('#im-moon-mode').value = s.moon?.mode ?? 'capture';
    $('#im-scenario-note').textContent = s.note ?? ''; $('#im-scenario-note').hidden = !s.note;
    syncEnabled();
  }
  function syncEnabled() {
    for (const id of ['#im-module-prop', '#im-module-thrust', '#im-module-isp']) $(id).disabled = !$('#im-module').checked;
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
    const moduleOn = $('#im-module').checked;
    if (moduleOn && (!(n('#im-module-prop') >= 0) || !(n('#im-module-thrust') > 0) || !(n('#im-module-isp') > 0))) issues.push('Módulo: propelente ≥ 0, empuje e Isp positivos.');
    const moonId = $('#im-moon').value || null, mrp = n('#im-mrp'), mra = n('#im-mra'), mri = n('#im-mri');
    const moonMode = $('#im-moon-mode').value === 'flyby' ? 'flyby' : 'capture';
    if (moonId && moonMode === 'flyby' && !(mrp > 0)) issues.push('Satélite: el periapsis del sobrevuelo debe ser > 0 km.');
    if (moonId && moonMode === 'capture' && (!(mrp > 0) || !(mra >= mrp) || !(mri >= 0) || (mri > 0 && mri < mra))) issues.push('Satélite: periapsis > 0, apoapsis final ≥ periapsis e intermedio 0 o ≥ apoapsis final.');
    if ($('#im-landing').checked && moonId && moonMode === 'flyby') issues.push('El descenso requiere capturarse antes en órbita del satélite.');
    if ($('#im-landing').checked && moonId && !$('#im-lander').checked) issues.push('El descenso requiere el módulo de aterrizaje.');
    return { issues, departure, tof, rp, ra, moduleOn, moonId, moonMode, mrp, mra, mri };
  }
  function invalidate(reason) {
    const had = Boolean(mission); mission = null; execution = null; data = null; refinement = null;
    $('#im-execute').disabled = true; renderAll();
    if (had) { message(reason); if (active) { active = false; onInvalidated(); } }
  }
  const changed = () => { syncEnabled(); invalidate('Las condiciones cambiaron: el cálculo anterior se invalidó. Vuelve a calcular.'); };
  for (const el of host.querySelectorAll('.mission-controls input, .mission-controls select')) if (el.id !== 'im-scenario') el.addEventListener('change', () => { $('#im-scenario').value = 'custom'; changed(); });
  $('#im-destination').addEventListener('change', fillMoons);
  $('#im-moon').addEventListener('change', () => { $('#im-moon-profile').hidden = !$('#im-moon').value; });
  $('#im-scenario').addEventListener('change', () => { applyScenario($('#im-scenario').value); changed(); });

  async function compute() {
    if (busy) return;
    if (!helioEphemeris) { message(loadError ? `${UNAVAILABLE_MESSAGE}: ${loadError}` : 'Espera la carga del catálogo de efemérides.', true); return; }
    if (!design) { message('Selecciona o construye una sonda en el Hangar.', true); return; }
    const v = readInputs();
    if (v.issues.length) { message(v.issues.join(' '), true); return; }
    const tgt = ENCOUNTER_TARGETS[$('#im-destination').value];
    busy = true; $('#im-compute').disabled = true; $('#im-compute').setAttribute('aria-busy', 'true'); $('#im-stage-status').textContent = 'Calculando…'; $('#im-verdict').textContent = 'Calculando la cadena…'; $('#im-verdict').dataset.tone = 'idle';
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
        refinement = refineTransferCandidate(helio, { destinationId: tgt.ephemerisId, departureJdTdb, tofDays, criterion: 'c3', halfSpanDepartureDays: Math.max(1, 0.01 * tofDays), halfSpanTofDays: Math.max(1, 0.01 * tofDays) });
        if (Number.isFinite(refinement.score)) { departureJdTdb = refinement.departureJdTdb; tofDays = refinement.tofDays; }
      }
      let moons = null;
      if (v.moonId) { moonsData ??= createPlanetocentricWindow(await fetchJson(MOON_WINDOW_FILE)); moons = moonsData; }
      const module = v.moduleOn ? { ...DEMO_PROPULSION_MODULE, propellantKg: Number($('#im-module-prop').value), engine: { ...DEMO_PROPULSION_MODULE.engine, thrustN: Number($('#im-module-thrust').value) * 1000, ispS: Number($('#im-module-isp').value) } } : null;
      const moonBurns = v.moonId ? [...(v.mri > 0 ? [{ apoapsisAltitudeKm: v.mri }] : []), { apoapsisAltitudeKm: v.mra }] : null;
      const input = { destinationId: tgt.id, moonId: v.moonId, opportunity: { departureJdTdb, arrivalJdTdb: departureJdTdb + tofDays }, design, propulsionModule: module, lander: $('#im-lander').checked ? DEMO_LANDER : null,
        profile: { soiModel: $('#im-soi').value, planet: { mode: $('#im-mode').value, periapsisAltitudeKm: v.rp, bPlane: $('#im-bmode').value === 'fixed' ? { mode: 'fixed', angleDeg: Number($('#im-btheta').value) } : { mode: 'auto' },
          captureBurns: [{ apoapsisAltitudeKm: v.ra }], orbitCoastDays: v.moonId ? 1 : 2 }, moon: v.moonId ? (v.moonMode === 'flyby' ? { mode: 'flyby', periapsisAltitudeKm: v.mrp } : { periapsisAltitudeKm: v.mrp, captureBurns: moonBurns }) : null, landing: { enabled: $('#im-landing').checked } } };
      data = { helio, moons };
      mission = computeIntegratedMission(input, data);
      execution = createIntegratedExecution({ result: mission, data, design });
      $('#im-execute').disabled = false;
      remember(mission);
      message(`${mission.verdict} Cálculo en ${number(mission.computeMs, 0)} ms.`, mission.verdict.startsWith('NO VIABLE'));
    } catch (error) { mission = null; execution = null; $('#im-execute').disabled = true; message(error.message, true); }
    finally { busy = false; $('#im-compute').disabled = false; $('#im-compute').removeAttribute('aria-busy'); renderAll(); }
  }
  $('#im-compute').addEventListener('click', compute);
  $('#im-execute').disabled = true;
  $('#im-execute').addEventListener('click', () => {
    if (!mission || !isIntegratedMissionCurrent(mission, design)) { message('Calcula una misión vigente para la sonda actual.', true); return; }
    active = true;
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
    if (!C) { ctx.fillText(mission ? 'Este marco no tiene tramos en la misión calculada.' : 'Sin trayectoria calculada.', 16, 24); return; }
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
    row(pv, 'Validación', '13 implementada y probada localmente; pendiente de auditoría independiente (Gemini).');
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
  function renderAll() { renderChain(); drawPlot(); renderResults(); if (!mission) renderCompare(); }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!host.hidden) drawPlot(); }) : null;
  observer?.observe($('#im-plot'));
  $('#im-module').addEventListener('change', syncEnabled); $('#im-bmode').addEventListener('change', syncEnabled); $('#im-mode').addEventListener('change', syncEnabled); $('#im-moon-mode').addEventListener('change', syncEnabled);
  fillMoons(); applyScenario('A1'); renderAll();
  return {
    setDesign(next) {
      design = next;
      $('#im-design').textContent = next ? `Sonda del Hangar: «${next.name}» (masa y motor reales del diseño; viaja como carga útil).` : 'Sonda del Hangar: sin diseño.';
      if (mission && !isIntegratedMissionCurrent(mission, design)) invalidate('La sonda cambió en el Hangar: el cálculo anterior se invalidó.');
    },
    setVisible(visible) { if (visible) drawPlot(); },
    isActive: () => active, deactivate() { active = false; },
    getState: () => ({ mission, refinement }),
    compute, applyScenario,
    dispose() { observer?.disconnect(); host.replaceChildren(); }
  };
}
export { moduleDryMassKg };
