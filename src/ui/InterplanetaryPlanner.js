// Etapa 12G — Planificador «Misiones interplanetarias»: búsqueda de ventanas Tierra → planeta con efemérides
// NASA/JPL Horizons locales, Lambert heliocéntrico de cero revoluciones y mapa de oportunidades (canvas 2D, sin
// dependencias). La reproducción 3D se delega al Centro de Misión. Los satélites se muestran como destinos futuros.
import { createInterplanetaryEphemeris, UNAVAILABLE_MESSAGE, PLANET_NAMES } from '../science/InterplanetaryEphemeris.js';
import { tdbToTimeScales } from '../science/AstrodynamicsTime.js';
import { KM_PER_AU } from '../science/Units.js';
import { propagateKepler } from '../science/KeplerPropagator.js';
import { calculateEngineering } from '../lab/ProbeEngineering.js';
import { MOON_WINDOW_KEYS } from '../lab/IntegratedMission.js';
import { CELL, CRITERIA, DEFAULT_INTERPLANETARY_OPTIONS, MU_SUN, SUGGESTED_RANGES, compareRequirementsWithDesign, evaluateTransfer, interplanetarySignature,
  isInterplanetaryResultCurrent, listMissionDestinations, searchLaunchWindows, validateInterplanetaryOptions, MODEL_LIMITS, CANDIDATE_STATUS,
  refineTransferCandidate, candidateEdgeDiagnostics } from '../lab/InterplanetaryPlan.js';

const number = (n, digits = 1) => Number.isFinite(n) ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(n) : 'No disponible';
// Etiquetas redondeadas al segundo (tdbToTimeScales evita 23:59:59,999 por la resolución binaria del JD).
const utcLabel = jd => tdbToTimeScales(jd).labelUtc;
const tdbLabel = jd => tdbToTimeScales(jd).labelTdb;
const dateOnly = jd => utcLabel(jd).slice(0, 10);

export function createInterplanetaryPlanner({ host, onExecuteRequest = () => {}, onInvalidated = () => {} }) {
  host.classList.add('mission-planner', 'interplanetary-planner');
  const destinations = listMissionDestinations();
  host.innerHTML = `
    <div class="mission-controls lab-panel"><div class="lab-panel-heading"><span class="eyebrow">2 / PLANIFICAR · VENTANAS INTERPLANETARIAS</span><h3>Ventanas de lanzamiento</h3></div>
      <div class="lab-panel-scroll">
        <p class="mission-intro">Busca las mejores fechas para salir de la Tierra hacia un planeta: prueba miles de combinaciones de salida y duración con posiciones reales de NASA/JPL Horizons (problema de Lambert, cero revoluciones). Para calcular la llegada y la captura, usa «Misión completa».</p>
        <label class="lab-field">Origen<select id="ip-origin"><option value="399">Tierra</option><option disabled>Otros planetas · pendiente de validación</option></select></label>
        <label class="lab-field">Destino<select id="ip-destination"></select></label>
        <div id="ip-satellite" class="ft-results" aria-live="polite"></div>
        <div class="lab-two-actions"><label class="lab-field">Salida desde (UTC)<input id="ip-dep-start" type="date"></label><label class="lab-field">Salida hasta (UTC)<input id="ip-dep-end" type="date"></label></div>
        <div class="lab-two-actions"><label class="lab-field">Tiempo de vuelo mín. (d)<input id="ip-tof-min" type="number" min="10" step="1"></label><label class="lab-field">Tiempo de vuelo máx. (d)<input id="ip-tof-max" type="number" min="10" step="1"></label></div>
        <div class="lab-two-actions"><label class="lab-field">Paso de salida (d)<input id="ip-dep-step" type="number" min="0.25" step="0.25"></label><label class="lab-field">Paso de vuelo (d)<input id="ip-tof-step" type="number" min="0.25" step="0.25"></label></div>
        <label class="lab-field">Criterio de comparación<select id="ip-criterion">${Object.entries(CRITERIA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label class="lab-field">Órbita de estacionamiento terrestre (km)<input id="ip-parking" type="number" min="150" max="100000" step="10"></label>
        <p class="mission-hint" id="ip-coverage">Cargando cobertura de efemérides…</p>
        <div class="lab-two-actions"><button id="ip-search" type="button" class="button-primary">Buscar ventanas</button><button id="ip-suggest" type="button">Rango sugerido</button></div>
        <button id="ip-execute" type="button">Reproducir en el Centro de Misión</button>
        <p id="ip-message" class="lab-message" role="status"></p>
        <p class="mission-hint">Fechas de entrada en UTC (segundos intercalares IERS); los cálculos usan TDB, que se muestra junto a cada resultado.</p>
      </div></div>
    <div class="mission-stage lab-stage"><div class="lab-stage-top"><span class="eyebrow">MAPA DE OPORTUNIDADES / SALIDA × TIEMPO DE VUELO</span><span id="ip-stage-status">Sin búsqueda</span></div>
      <div class="ip-plots"><canvas id="ip-porkchop" role="img" aria-label="Mapa de oportunidades: fecha de salida contra tiempo de vuelo, coloreado por C3"></canvas>
        <canvas id="ip-orbit" role="img" aria-label="Vista polar de la eclíptica: transferencia seleccionada, órbitas recorridas y posiciones planetarias"></canvas></div>
      <div id="ip-legend" class="ip-legend"></div>
      <div class="lab-stage-foot"><span>Haz clic en el mapa para seleccionar una combinación · color: métrica del criterio (escala logarítmica) · gris: sin cobertura · rojo: no convergente · negro: geometría mal condicionada</span></div>
    </div>
    <div class="mission-results lab-panel"><div class="lab-panel-heading"><span class="eyebrow">2 / PLANIFICAR · RESULTADOS</span><h3>Oportunidades calculadas</h3></div>
      <div class="lab-panel-scroll"><div id="ip-selected"></div><div id="ip-refine" class="ft-results" aria-live="polite"></div><div id="ip-hangar"></div>
        <h4>Candidatos (mínimos locales de la cuadrícula)</h4>
        <label class="lab-field">Ordenar por<select id="ip-sort"><option value="score">Criterio elegido</option><option value="c3">C3 de salida</option><option value="arr">v∞ de llegada</option><option value="dep">Fecha de salida</option><option value="tof">Duración</option></select></label>
        <div id="ip-table" class="ip-table"></div><div id="ip-counts" class="mission-hint"></div>
        <details class="mission-details"><summary>Modelo, marcos y límites</summary>
          <p>Marco heliocéntrico inercial: centro del Sol (500@10), ejes ICRF con plano fundamental en la eclíptica J2000 de Horizons, km y km/s, época TDB, vectores geométricos sin corrección de luz. Lambert por variables universales con μ☉ = ${MU_SUN} km³/s² (DE440). v∞ = v_transferencia − v_planeta; C3 = |v∞|². Δv de inyección = √(v∞² + 2μ/r) − √(μ/r) desde una órbita circular.</p>
          ${MODEL_LIMITS.map(item => `<p>${item}</p>`).join('')}</details>
      </div></div>`;
  const $ = selector => host.querySelector(selector);
  const destSelect = $('#ip-destination');
  const planetGroup = document.createElement('optgroup'); planetGroup.label = 'Planetas · transferencia directa';
  for (const p of destinations.planets) planetGroup.append(new Option(p.name, p.id));
  const satGroup = document.createElement('optgroup'); satGroup.label = 'Satélites · información';
  for (const s of destinations.satellites) satGroup.append(new Option(`${s.name} (sistema de ${s.hostName})`, `sat:${s.id}`));
  destSelect.append(planetGroup, satGroup);
  const fields = { originId: '#ip-origin', departureStartUtc: '#ip-dep-start', departureEndUtc: '#ip-dep-end', tofMinDays: '#ip-tof-min', tofMaxDays: '#ip-tof-max',
    departureStepDays: '#ip-dep-step', tofStepDays: '#ip-tof-step', criterion: '#ip-criterion', parkingAltitudeKm: '#ip-parking' };
  const numeric = new Set(['tofMinDays', 'tofMaxDays', 'departureStepDays', 'tofStepDays', 'parkingAltitudeKm']);
  for (const [key, selector] of Object.entries(fields)) if (key !== 'originId') $(selector).value = DEFAULT_INTERPLANETARY_OPTIONS[key];
  destSelect.value = DEFAULT_INTERPLANETARY_OPTIONS.destinationId;

  let refined = null, edges = null;
  let ephemeris = null, loadError = null, search = null, ephWindow = null, selected = null, design = null, active = false, busy = false, sortKey = 'score';
  function message(text, error = false) { $('#ip-message').textContent = text; $('#ip-message').dataset.error = String(error); }
  function options() {
    const o = { destinationId: destSelect.value };
    for (const [key, selector] of Object.entries(fields)) o[key] = numeric.has(key) ? Number($(selector).value) : $(selector).value;
    return o;
  }
  const base = import.meta.env?.BASE_URL ?? '/';
  fetch(`${base}data/interplanetary-ephemerides-catalog-v1.json`).then(r => { if (!r.ok) throw Error(`HTTP ${r.status}`); return r.json(); }).then(catalog => {
    ephemeris = createInterplanetaryEphemeris({ catalog, loadJson: async file => { const r = await fetch(`${base}${file}`); if (!r.ok) throw Error(`${file}: HTTP ${r.status}`); return r.json(); } });
    const cov = ephemeris.coverage('399');
    $('#ip-coverage').textContent = `Cobertura real de efemérides: ${tdbLabel(cov.startJdTdb).slice(0, 10)} → ${tdbLabel(cov.endJdTdb).slice(0, 10)} (TDB). Fuera de ella: «${UNAVAILABLE_MESSAGE}».`;
  }).catch(error => { loadError = error.message; $('#ip-coverage').textContent = `${UNAVAILABLE_MESSAGE}: ${error.message}`; });

  function renderSatellite() {
    const box = $('#ip-satellite'); box.replaceChildren();
    if (!destSelect.value.startsWith('sat:')) return;
    const s = destinations.satellites.find(item => `sat:${item.id}` === destSelect.value);
    const add = (tag, text) => { const el = document.createElement(tag); el.textContent = text; box.append(el); return el; };
    // 16: qué ofrece hoy el laboratorio para cada satélite (sin descensos: la interfaz ya no los ofrece).
    const inIntegrated = Object.hasOwn(MOON_WINDOW_KEYS, s.id);
    add('strong', `${s.name}: aquí solo se buscan ventanas hacia planetas`);
    add('p', s.id === '301' ? s.heliocentricLeg
      : inIntegrated ? `En «Misión completa» puedes llegar a ${s.hostName} y sobrevolar ${s.name} o intentar capturarte en su órbita (efemérides de satélites de agosto de 2031 a junio de 2032).`
        : `Aquí puedes buscar la ventana hasta ${s.hostName}. Las operaciones en ${s.name} no están disponibles en el laboratorio.`);
    if (s.id !== '301') { const b = add('button', `Buscar ventanas hacia ${s.hostName}`); b.type = 'button'; b.addEventListener('click', () => { destSelect.value = s.hostId; changed(); }); }
    if (inIntegrated) { const b = add('button', 'Abrir «Misión completa»'); b.type = 'button'; b.addEventListener('click', () => document.dispatchEvent(new CustomEvent('lab:navigate', { detail: { section: 'planner', plannerMode: 'integrated' } }))); }
  }
  function invalidate(reason) {
    const had = Boolean(search || selected);
    search = null; selected = null; ephWindow = null; refined = null; edges = null;
    renderAll();
    if (had) { message(reason); if (active) { active = false; onInvalidated(); } }
    $('#ip-execute').disabled = true;
  }
  function changed() { renderSatellite(); invalidate('Las condiciones cambiaron: los resultados anteriores se invalidaron. Vuelve a buscar.'); }
  for (const selector of [...Object.values(fields), '#ip-destination']) $(selector).addEventListener('change', changed);

  $('#ip-suggest').addEventListener('click', () => {
    const id = destSelect.value.startsWith('sat:') ? null : destSelect.value; if (!id) return;
    const s = SUGGESTED_RANGES[id];
    $('#ip-tof-min').value = s.tofMinDays; $('#ip-tof-max').value = s.tofMaxDays; $('#ip-tof-step').value = s.tofStepDays; $('#ip-dep-step').value = s.departureStepDays;
    const start = $('#ip-dep-start').value; const [y, m, d] = start.split('-').map(Number);
    const end = new Date(Date.UTC(y, m - 1, d) + s.spanDays * 86400000).toISOString().slice(0, 10); // aritmética de calendario, sin zona horaria
    $('#ip-dep-end').value = end; changed();
    message(`Rango sugerido para ${PLANET_NAMES[id]} (escala de tiempos de vuelo física; no son fechas óptimas). Pulsa «Buscar ventanas».`);
  });

  async function runSearch() {
    if (busy) return;
    if (!ephemeris) { message(loadError ? `${UNAVAILABLE_MESSAGE}: ${loadError}` : 'Espera la carga del catálogo de efemérides.', true); return; }
    if (destSelect.value.startsWith('sat:')) { message('Aquí solo se buscan ventanas hacia planetas: elige el planeta anfitrión o, para los satélites de Júpiter, usa «Misión completa».', true); return; }
    const input = options();
    const { issues, options: o } = validateInterplanetaryOptions(input);
    if (issues.length) { message(issues.join(' '), true); return; }
    busy = true; $('#ip-search').disabled = true; $('#ip-search').setAttribute('aria-busy', 'true'); $('#ip-stage-status').textContent = 'Calculando…'; message(`Explorando ${o.departureCount * o.tofCount} combinaciones…`);
    try {
      const cov = ephemeris.coverage(o.destinationId), covO = ephemeris.coverage(o.originId);
      const startJd = o.departureStartJdTdb, endJd = o.departureEndJdTdb + o.tofMaxDays;
      if (startJd < covO.startJdTdb || endJd > cov.endJdTdb) message(`Parte del intervalo queda fuera de la cobertura (${tdbLabel(cov.startJdTdb).slice(0, 10)} → ${tdbLabel(cov.endJdTdb).slice(0, 10)} TDB); esas celdas se marcan «${CANDIDATE_STATUS.noCoverage}».`);
      const w = await ephemeris.loadWindow([o.originId, o.destinationId], Math.max(startJd, covO.startJdTdb), Math.min(endJd, cov.endJdTdb));
      await new Promise(resolve => setTimeout(resolve, 20));
      if (interplanetarySignature(options()) !== interplanetarySignature(input)) { message('Las condiciones cambiaron durante la carga; vuelve a buscar.'); return; }
      search = searchLaunchWindows(w, input); ephWindow = w; selected = null; refined = null; edges = null;
      // 13 (OBS-12G-01 y OBS-12G-03): refinamiento local del mejor candidato y diagnóstico de bordes de cuadrícula y cobertura.
      if (search.best) {
        refined = refineTransferCandidate(w, { originId: search.options.originId, destinationId: search.options.destinationId, departureJdTdb: search.best.departureJdTdb, tofDays: search.best.tofDays,
          criterion: search.options.criterion, halfSpanDepartureDays: search.options.departureStepDays / 2, halfSpanTofDays: search.options.tofStepDays / 2 });
        edges = candidateEdgeDiagnostics(search, search.best, ephemeris.coverage(search.options.destinationId));
      }
      if (search.best) select(search.best.departureJdTdb, search.best.arrivalJdTdb, true);
      message(search.best ? `${CANDIDATE_STATUS.best}: salida ${dateOnly(search.best.departureJdTdb)}, ${number(search.best.tofDays, 2)} d. ${search.note}`
        : 'Ninguna combinación produjo una solución verificable en el intervalo (revisa cobertura y rango de vuelo).', !search.best);
    } catch (error) { message(error.message, true); }
    finally { busy = false; $('#ip-search').disabled = false; $('#ip-search').removeAttribute('aria-busy'); renderAll(); }
  }
  $('#ip-search').addEventListener('click', runSearch);

  function select(departureJdTdb, arrivalJdTdb, isBest = false) {
    if (!search || !ephWindow) return;
    selected = evaluateTransfer(ephWindow, { originId: search.options.originId, destinationId: search.options.destinationId, departureJdTdb, arrivalJdTdb,
      parkingAltitudeKm: search.options.parkingAltitudeKm, isBest: isBest || (search.best && search.best.departureJdTdb === departureJdTdb && search.best.arrivalJdTdb === arrivalJdTdb) });
    $('#ip-execute').disabled = ![CANDIDATE_STATUS.best, CANDIDATE_STATUS.computed].includes(selected.status);
    renderAll();
  }
  $('#ip-execute').disabled = true;
  $('#ip-execute').addEventListener('click', () => {
    if (!selected || !search || !isInterplanetaryResultCurrent(search, options())) { message('Selecciona una oportunidad vigente.', true); return; }
    active = true;
    onExecuteRequest({ ready: true, kind: 'interplanetary', result: selected, window: ephWindow, design, name: `${selected.originName} → ${selected.destinationName} (${dateOnly(selected.departureJdTdb)})` });
  });
  $('#ip-sort').addEventListener('change', () => { sortKey = $('#ip-sort').value; renderTable(); });

  // ---------- Mapa de oportunidades ----------
  const porkchop = $('#ip-porkchop'), orbit = $('#ip-orbit');
  const PAD = { l: 46, r: 10, t: 10, b: 30 };
  function metricGrid() {
    const g = search.grid, c = search.options.criterion;
    return Float64Array.from(g.c3, (v, k) => c === 'c3' ? v : c === 'arrival' ? g.vInfArrival[k] : Math.sqrt(v) + g.vInfArrival[k]);
  }
  function color(u) { // u ∈ [0,1]: oro (bajo) → azul (alto), legible en tema oscuro
    const stops = [[246, 214, 140], [214, 150, 84], [150, 92, 120], [72, 88, 150], [34, 52, 92]];
    const x = Math.min(0.9999, Math.max(0, u)) * (stops.length - 1), i = Math.floor(x), f = x - i;
    return stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  }
  function sizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect(), ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * ratio)); canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); return { ctx, w: rect.width, h: rect.height };
  }
  function drawPorkchop() {
    if (!porkchop.getContext) return;
    const { ctx, w, h } = sizeCanvas(porkchop);
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#9fb0c4'; ctx.font = '11px system-ui, sans-serif';
    if (!search) { ctx.fillText('Configura la búsqueda y pulsa «Buscar ventanas».', 16, 24); $('#ip-legend').textContent = ''; return; }
    const g = search.grid, values = metricGrid();
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < values.length; k++) if (g.code[k] === CELL.ok) { lo = Math.min(lo, values[k]); hi = Math.max(hi, values[k]); }
    const cap = Math.min(hi, lo * 8 + 1e-9); // satura en 8× el mínimo para que la región útil tenga contraste
    const pw = w - PAD.l - PAD.r, ph = h - PAD.t - PAD.b, cw = pw / g.nDep, chh = ph / g.nTof;
    for (let i = 0; i < g.nDep; i++) for (let j = 0; j < g.nTof; j++) {
      const k = i * g.nTof + j, code = g.code[k];
      if (code === CELL.ok) { const u = Math.log(values[k] / lo) / Math.log(cap / lo || 2); const [r, gg, b] = color(u); ctx.fillStyle = `rgb(${r},${gg},${b})`; }
      else ctx.fillStyle = code === CELL.noCoverage ? '#4a5260' : code === CELL.noConvergence ? '#8c2f2f' : '#05070b';
      ctx.fillRect(PAD.l + i * cw, PAD.t + ph - (j + 1) * chh, Math.ceil(cw), Math.ceil(chh));
    }
    ctx.strokeStyle = '#b4c5d150'; ctx.strokeRect(PAD.l, PAD.t, pw, ph);
    ctx.fillStyle = '#c6d2de';
    for (let n = 0; n <= 4; n++) { const i = Math.round(n * (g.nDep - 1) / 4); ctx.fillText(dateOnly(g.departures[i]), PAD.l + (i + 0.5) * cw - 28, h - 12); }
    for (let n = 0; n <= 4; n++) { const j = Math.round(n * (g.nTof - 1) / 4); ctx.fillText(`${number(g.tofs[j], 0)} d`, 4, PAD.t + ph - (j + 0.5) * chh + 4); }
    const mark = (dep, tof, style, r) => { const i = (dep - g.departures[0]) / search.options.departureStepDays, j = (tof - g.tofs[0]) / search.options.tofStepDays;
      ctx.strokeStyle = style; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(PAD.l + (i + 0.5) * cw, PAD.t + ph - (j + 0.5) * chh, r, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; };
    if (search.best) mark(search.best.departureJdTdb, search.best.tofDays, '#ffffff', 6);
    if (selected) mark(selected.departureJdTdb, selected.tofDays, '#7fd6ef', 9);
    $('#ip-legend').textContent = `${CRITERIA[search.options.criterion]} · mínimo ${number(lo, 3)} ${search.options.criterion === 'c3' ? 'km²/s²' : 'km/s'} (dorado) · saturación en ${number(cap, 2)} · ○ blanco: mejor candidato del intervalo · ○ celeste: selección`;
  }
  porkchop.addEventListener('click', event => {
    if (!search) return;
    const rect = porkchop.getBoundingClientRect(), g = search.grid;
    const pw = rect.width - PAD.l - PAD.r, ph = rect.height - PAD.t - PAD.b;
    const i = Math.floor((event.clientX - rect.left - PAD.l) / pw * g.nDep), j = Math.floor((rect.height - PAD.b - (event.clientY - rect.top)) / ph * g.nTof);
    if (i < 0 || j < 0 || i >= g.nDep || j >= g.nTof) return;
    select(g.departures[i], g.departures[i] + g.tofs[j]);
    message(selected.status === CANDIDATE_STATUS.computed || selected.status === CANDIDATE_STATUS.best ? `Seleccionada: salida ${dateOnly(selected.departureJdTdb)}, ${number(selected.tofDays, 2)} d.` : `${selected.status}: ${selected.reason ?? ''}`, !selected.lambert?.converged);
  });
  function drawOrbit() {
    if (!orbit.getContext) return;
    const { ctx, w, h } = sizeCanvas(orbit);
    ctx.clearRect(0, 0, w, h);
    if (!selected?.lambert?.converged || !ephWindow) { ctx.fillStyle = '#9fb0c4'; ctx.font = '11px system-ui, sans-serif'; ctx.fillText('Selecciona una oportunidad calculada.', 16, 24); return; }
    // Proyección sobre la eclíptica (x, y heliocéntricos), vista desde el norte eclíptico. Estados físicos en km.
    const n = 240, T = selected.tofDays * 86400, ship = [], earthPath = [], destPath = [];
    for (let k = 0; k <= n; k++) {
      const t = T * k / n, jd = selected.departureJdTdb + t / 86400;
      ship.push(propagateKepler(selected.initialState.positionKm, selected.initialState.velocityKmS, t, MU_SUN).positionKm);
      earthPath.push(ephWindow.stateAt(selected.originId, jd).positionKm); destPath.push(ephWindow.stateAt(selected.destinationId, jd).positionKm);
    }
    const rmax = Math.max(...[...ship, ...earthPath, ...destPath].map(p => Math.hypot(p[0], p[1])));
    const s = 0.45 * Math.min(w, h) / rmax, cx = w / 2, cy = h / 2, P = p => [cx + p[0] * s, cy - p[1] * s];
    const line = (pts, style, dash = []) => { ctx.strokeStyle = style; ctx.setLineDash(dash); ctx.beginPath(); pts.forEach((p, k) => { const [x, y] = P(p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]); };
    line(earthPath, '#6f95c4', [4, 4]); line(destPath, '#c9a17a', [4, 4]); line(ship, '#e7c27f');
    const dot = (p, style, r) => { const [x, y] = P(p); ctx.fillStyle = style; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    dot([0, 0], '#f2c766', 5); dot(earthPath[0], '#3f7cc0', 4); dot(destPath.at(-1), '#d79a6a', 4);
    ctx.fillStyle = '#c6d2de'; ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`Escala: ${number(rmax / KM_PER_AU, 2)} AU al borde · eclíptica J2000 vista desde el norte`, 8, h - 8);
    ctx.fillText(`${selected.originName} en la salida · ${selected.destinationName} en la llegada`, 8, 16);
  }
  // ---------- Resultados ----------
  function row(parent, label, value) { const r = document.createElement('div'); r.className = 'lab-metric'; const a = document.createElement('span'); a.textContent = label; const b = document.createElement('strong'); b.textContent = value; r.append(a, b); parent.append(r); }
  const vec = (v, d) => `[${v.map(x => number(x, d)).join(', ')}]`;
  function renderSelected() {
    const box = $('#ip-selected'); box.replaceChildren();
    if (!selected) return;
    const status = document.createElement('div'); status.className = 'mission-status'; status.textContent = selected.status;
    status.dataset.status = selected.lambert?.converged ? 'VIABLE SEGÚN EL MODELO' : 'NO VERIFICABLE'; box.append(status);
    const note = document.createElement('p'); note.className = 'mission-hint';
    note.textContent = selected.lambert?.converged ? `${selected.completeness}: transferencia geométrica calculada; no incluye lanzamiento, correcciones, captura ni verificación de la sonda.` : (selected.reason ?? '');
    box.append(note);
    row(box, 'Salida', `${utcLabel(selected.departureJdTdb)} · ${tdbLabel(selected.departureJdTdb)}`);
    row(box, 'Llegada', `${utcLabel(selected.arrivalJdTdb)} · ${tdbLabel(selected.arrivalJdTdb)}`);
    row(box, 'Tiempo de vuelo', `${number(selected.tofDays, 2)} d`);
    if (!selected.lambert?.converged) return;
    const d = selected.lambert.diagnostics, q = selected.requirements;
    row(box, 'C3 de salida', `${number(q.c3Km2S2, 3)} km²/s²`);
    row(box, 'v∞ de salida', `${number(q.vInfDepartureKmS, 4)} km/s`);
    row(box, 'v∞ de llegada', `${number(q.vInfArrivalKmS, 4)} km/s`);
    row(box, 'Asíntota de salida (DLA / RLA, ICRF ecuatorial)', `${number(q.departureAsymptote.declinationDeg, 2)}° / ${number(q.departureAsymptote.rightAscensionDeg, 2)}°`);
    row(box, `Δv ideal de inyección desde ${number(q.parkingAltitudeKm, 0)} km`, `${number(q.injectionDeltaVKmS, 4)} km/s`);
    row(box, 'Tipo · cónica', `${d.transferType} · ${d.conic} · Δθ ${number(d.transferAngleDeg, 2)}°`);
    row(box, 'Convergencia', `${d.iterations} iteraciones · error de tiempo ${d.timeOfFlightRelativeError.toExponential(1)}`);
    row(box, 'Cierre (propagación independiente)', `${d.closurePositionKm.toExponential(2)} km`);
    row(box, `${selected.originName} en la salida (km)`, vec(selected.originState.positionKm, 0));
    row(box, `${selected.destinationName} en la llegada (km)`, vec(selected.destinationState.positionKm, 0));
    row(box, 'Efemérides', `${selected.originState.dataset.id} (${selected.originState.dataset.solutionId}) · ${selected.destinationState.dataset.id} (${selected.destinationState.dataset.solutionId}) · ${selected.destinationState.interpolation.method}`);
    if (['599', '699', '799', '899'].includes(selected.destinationId)) {
      const p = document.createElement('p'); p.className = 'mission-hint';
      p.textContent = 'Transferencia directa idealizada. Las misiones reales a los planetas exteriores suelen requerir asistencias gravitacionales (no implementadas) para reducir el C3.'; box.append(p);
    }
  }
  function renderHangar() {
    const box = $('#ip-hangar'); box.replaceChildren();
    if (!selected?.requirements) return;
    const engineering = design ? calculateEngineering(design) : null;
    const cmp = compareRequirementsWithDesign(selected.requirements, engineering);
    const title = document.createElement('h4'); title.textContent = `Requisitos frente a la sonda activa${design ? ` · ${design.name}` : ''}`; box.append(title);
    row(box, 'Comprobación', cmp.status);
    if (Number.isFinite(cmp.availableMS)) row(box, 'Δv ideal de la sonda / requerido', `${number(cmp.availableMS, 0)} / ${number(cmp.requiredMS, 0)} m/s`);
    const p = document.createElement('p'); p.className = 'mission-hint'; p.textContent = cmp.message; box.append(p);
  }
  function renderRefine() {
    const box = $('#ip-refine'); box.replaceChildren();
    if (!search?.best || !refined) return;
    const h = document.createElement('h4'); h.textContent = 'Refinamiento local y bordes (13)'; box.append(h);
    row(box, 'Mejor de la cuadrícula', `${dateOnly(search.best.departureJdTdb)} · ${number(search.best.tofDays, 2)} d · ${number(refined.gridScore, 4)}`);
    row(box, 'Refinado (Nelder–Mead, ± media celda)', `${utcLabel(refined.departureJdTdb)} · ${number(refined.tofDays, 3)} d · ${number(refined.score, 4)}`);
    row(box, 'Mejora del criterio', `${number(refined.gridScore - refined.score, 4)} (${refined.evaluations} evaluaciones)`);
    const p = document.createElement('p'); p.className = 'mission-hint'; p.textContent = refined.note + (refined.atRefinementBoundary ? ' El óptimo refinado toca el borde de la caja: el valle continúa hacia otra celda.' : ''); box.append(p);
    for (const w of edges?.warnings ?? []) { const el = document.createElement('p'); el.className = 'lab-message'; el.dataset.error = 'true'; el.textContent = w; box.append(el); }
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Seleccionar el candidato refinado';
    b.addEventListener('click', () => { select(refined.departureJdTdb, refined.arrivalJdTdb); message(`Seleccionado el candidato refinado: ${utcLabel(refined.departureJdTdb)}, ${number(refined.tofDays, 3)} d (mejor del intervalo examinado tras refinamiento local).`); });
    box.append(b);
  }
  function renderTable() {
    const box = $('#ip-table'); box.replaceChildren();
    $('#ip-counts').textContent = search ? `Combinaciones: ${search.counts.total} · calculadas ${search.counts.ok} · sin cobertura ${search.counts.noCoverage} · no convergentes ${search.counts.noConvergence} · mal condicionadas ${search.counts.illConditioned}.` : '';
    if (!search) return;
    const list = [...search.localMinima];
    const key = { score: c => c.score, c3: c => c.c3Km2S2, arr: c => c.vInfArrivalKmS, dep: c => c.departureJdTdb, tof: c => c.tofDays }[sortKey];
    list.sort((a, b) => key(a) - key(b));
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Salida (UTC)</th><th>Llegada (UTC)</th><th>Días</th><th>C3</th><th>v∞ lleg.</th><th>Estado</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const c of list.slice(0, 15)) {
      const tr = document.createElement('tr'); tr.tabIndex = 0;
      const status = c === search.best ? 'Mejor del intervalo' : 'Calculado · convergió';
      for (const text of [dateOnly(c.departureJdTdb), dateOnly(c.arrivalJdTdb), number(c.tofDays, 1), number(c.c3Km2S2, 2), number(c.vInfArrivalKmS, 2), status]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
      if (selected && selected.departureJdTdb === c.departureJdTdb && selected.arrivalJdTdb === c.arrivalJdTdb) tr.setAttribute('aria-current', 'true');
      const choose = () => select(c.departureJdTdb, c.arrivalJdTdb);
      tr.addEventListener('click', choose); tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
      tbody.append(tr);
    }
    table.append(tbody); box.append(table);
  }
  function renderAll() {
    $('#ip-stage-status').textContent = search ? `${search.counts.ok} soluciones · ${PLANET_NAMES[search.options.destinationId]}` : 'Sin búsqueda';
    drawPorkchop(); drawOrbit(); renderSelected(); renderRefine(); renderHangar(); renderTable();
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!host.hidden) { drawPorkchop(); drawOrbit(); } }) : null;
  observer?.observe(porkchop);
  renderSatellite(); renderAll();
  return {
    setDesign(next) { design = next; renderHangar(); },
    setVisible(visible) { if (visible) { drawPorkchop(); drawOrbit(); } },
    isActive: () => active, deactivate() { active = false; },
    getState: () => ({ search, selected, options: options() }),
    dispose() { observer?.disconnect(); host.replaceChildren(); }
  };
}
