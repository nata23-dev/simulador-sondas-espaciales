// Etapa 17 — verificación en Chrome (sin interfaz, SwiftShader) del laboratorio en tres etapas: panel de etapas, pestañas,
// barra de resumen, misión guiada, sonda reproducida = sonda calculada, invalidación, demostración separada, ensamblaje
// experimental, documentación, adaptación a 7 resoluciones y revisión automática de accesibilidad.
// Uso: node scripts/verify-stage17-browser.mjs [smoke|flow|auto|fleet|tools|responsive|modes|a11y|all] → capturas y registro JSON en
// evidence/stage17/ (o EVIDENCE_DIR). APP_URL reutiliza un servidor de desarrollo abierto. Una sola instancia de Chrome y de
// Vite a la vez, y sin editar src/ mientras se ejecuta contra un servidor compartido. Solo lee y pulsa la interfaz.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve(process.env.EVIDENCE_DIR ?? 'evidence/stage17');
await fs.mkdir(out, { recursive: true });
const PART = process.argv[2] ?? 'all';
const ONLY = process.env.ONLY_SIZES ? process.env.ONLY_SIZES.split(',') : null;
const PORT = 5191;
const server = process.env.APP_URL ? null : await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server?.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  // GPU=1: GPU real por Direct3D 11 (revisión con hardware); por defecto, SwiftShader (reproducible en cualquier equipo).
  args: process.env.GPU === '1' ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { part: PART, gpu: process.env.GPU === '1', startedAt: new Date().toISOString(), shots: [], checks: {}, overflow: {}, errors: [] };
const URL = process.env.APP_URL ?? `http://localhost:${PORT}/`;
const PROBES = ['voyager', 'cassini', 'dawn', 'juno'];

async function session(width, height, prefix, fn) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', e => log.errors.push(`${prefix}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') log.errors.push(`${prefix}: ${m.text()}`); });
  // Mismo criterio que en la etapa 16: clic real del ratón en el centro del control tras comprobar que es visible, está
  // activo y nada lo tapa; el puntero se mueve en cada espera porque SwiftShader sin interfaz deja de producir fotogramas.
  let nudge = 0;
  page.click = async (selector, { timeout = 30000 } = {}) => {
    const until = Date.now() + timeout; let last = 'no encontrado';
    while (Date.now() < until) {
      await page.mouse.move(4 + (nudge ^= 1), 4);
      const hit = await page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (!el) return { ok: false, why: 'no encontrado' };
        if (el.disabled || el.closest('fieldset:disabled')) return { ok: false, why: 'desactivado' };
        const locked = [];
        for (let n = el.parentElement; n; n = n.parentElement) { const cs = getComputedStyle(n); if (/hidden|clip/.test(cs.overflowX + cs.overflowY)) locked.push([n, n.scrollTop, n.scrollLeft]); }
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        for (const [n, top, left] of locked) { n.scrollTop = top; n.scrollLeft = left; }
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return { ok: false, why: 'no visible' };
        const x = r.x + r.width / 2, y = r.y + r.height / 2, top = document.elementFromPoint(x, y);
        return top === el || el.contains(top) ? { ok: true, x, y } : { ok: false, why: `tapado por ${top?.id || top?.className || top?.tagName}` };
      }, selector);
      if (hit.ok) { await page.mouse.click(hit.x, hit.y); return; }
      last = hit.why; await page.waitForTimeout(250);
    }
    throw new Error(`clic en ${selector}: ${last}`);
  };
  const h = {
    page,
    async wait(ms) { const end = Date.now() + ms; while (Date.now() < end) { await page.mouse.move(4 + (nudge ^= 1), 4); await page.waitForTimeout(Math.max(0, Math.min(200, end - Date.now()))); } },
    async shot(name, locator = null) {
      await h.wait(400); const file = `${prefix}_${name}.png`;
      for (let attempt = 1; ; attempt++) {
        try { await (locator ?? page).screenshot({ path: path.join(out, file), timeout: 10000 }); break; }
        catch (error) { if (attempt >= 4) throw error; await page.mouse.move(6 + attempt, 6); await page.waitForTimeout(300); }
      }
      log.shots.push(file);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (o > 0) log.overflow[file] = o;
    },
    text: async selector => (await page.locator(selector).first().textContent())?.trim(),
    async home({ clear = true, preset = null } = {}) {
      // Usuario nuevo: sin sonda activa, ensamblaje ni preferencias guardadas antes de la primera carga.
      await page.addInitScript(([doClear, presetValues]) => { try { if (!sessionStorage.getItem('stage17-clean')) {
        if (doClear) for (const k of ['simulador:sonda-activa', 'simulador:vehiculo-activo', 'simulador:ensamblaje-experimental', 'simulador:panel-etapas', 'simulador:featured-collapsed']) localStorage.removeItem(k);
        for (const [k, v] of Object.entries(presetValues ?? {})) localStorage.setItem(k, v);
        sessionStorage.setItem('stage17-clean', '1'); } } catch {} }, [clear, preset]);
      await page.goto(URL, { waitUntil: 'networkidle' });
      await h.wait(2000);
    },
    async area(id) {
      await page.click('#app-nav-toggle'); await page.waitForTimeout(250);
      await page.locator('#app-nav-panel').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
      await page.click(`#app-nav-panel button[data-area="${id}"]`); await page.waitForTimeout(1300);
    },
    async lab() { await h.area('hangar'); await page.waitForFunction(() => !document.querySelector('#experimental-lab').hidden, null, { timeout: 30000 }); },
    async stage(id) { await page.click(`[data-lab-stage="${id}"]`); await h.wait(700); },
    async tab(id) {
      // 24: en pantallas estrechas el Centro de Misión entra en vista inmersiva y sus pestañas están en la hoja inferior.
      const sheet = await page.evaluate(pane => document.querySelector('#experimental-lab')?.dataset.immersive === 'true' && Boolean(document.querySelector(`[data-sheet-pane="${pane}"]`)), id);
      if (sheet) {
        if (await page.evaluate(() => document.querySelector('#lab-mission-center').dataset.sheet !== 'open')) await page.click('[data-mc-panel="sheet"]');
        await page.click(`[data-sheet-pane="${id}"]`); await h.wait(700); return;
      }
      await page.click(`#lab-tabs [data-lab-tab="${id}"]`); await h.wait(700);
    },
    async probe(id) { await page.selectOption('#lab-ctx-probe', id); await h.wait(600); },
    async model(state = ['nasa', 'procedural', 'esquema'], timeout = 90000) {
      await page.waitForFunction(states => states.includes(document.querySelector('#lab-assembly-status')?.dataset.state), state, { timeout }); await h.wait(500);
    },
    labState: () => page.evaluate(() => {
      const lab = document.querySelector('#experimental-lab'), visible = sel => { const el = document.querySelector(sel); return Boolean(el && !el.hidden && el.offsetParent !== null); };
      return { stage: lab.dataset.stage, tab: lab.dataset.tab, rail: lab.dataset.rail, immersive: lab.dataset.immersive ?? null,
        visible: Object.fromEntries(['.lab-workspace', '#lab-integrated', '#lab-interplanetary', '#lab-mission-planner', '#lab-launch', '#lab-mission-center'].map(s => [s, visible(s)])),
        tabs: [...document.querySelectorAll('#lab-tabs button')].filter(b => !b.hidden).map(b => `${b.textContent.trim()}${b.getAttribute('aria-current') ? ' [actual]' : ''}`),
        summary: { probe: document.querySelector('#lab-ctx-probe').selectedOptions[0]?.textContent, design: document.querySelector('#lab-ctx-design').textContent,
          destination: document.querySelector('#lab-ctx-destination').textContent, state: document.querySelector('#lab-ctx-state').textContent, tone: document.querySelector('#lab-ctx-state').dataset.tone },
        steps: [...document.querySelectorAll('.lab-steps > li')].map(li => `${li.querySelector('strong').textContent}: ${li.querySelector('small').textContent} (${li.dataset.progress})`) };
    }),
    center: () => page.evaluate(() => { const c = document.querySelector('#lab-mission-center');
      return { vehicle: c.dataset.vehicle ?? null, model: c.dataset.vehicleModel ?? null, pane: c.dataset.pane, drawer: c.dataset.drawer, immersive: c.dataset.immersive ?? null,
        name: document.querySelector('#mc-vehicle-name').textContent, modelText: document.querySelector('#mc-vehicle-model').textContent,
        empty: !document.querySelector('#mc-stage-empty').hidden, emptyReason: document.querySelector('#mc-empty-reason').textContent,
        elapsed: document.querySelector('#mc-elapsed').textContent, stageStatus: document.querySelector('#mc-stage-status').textContent }; }),
    async waitModelInCenter(timeout = 90000) { await page.waitForFunction(() => { const m = document.querySelector('#lab-mission-center').dataset.vehicleModel; return m && m !== 'cargando'; }, null, { timeout }); },
    guideStatus: () => page.evaluate(() => ({ step: document.querySelector('#lab-guide')?.dataset.step, title: document.querySelector('#lab-guide-title')?.textContent,
      status: document.querySelector('#lab-guide-status')?.textContent, target: (() => { const t = document.querySelector('.lab-guide-target'); return t ? (t.id || t.dataset.labStage || t.dataset.labTab || t.dataset.probeId || t.className) : null; })() })),
    async waitStep(id, timeout = 200000) { await page.waitForFunction(step => document.querySelector('#lab-guide')?.dataset.step === step, id, { timeout }); await page.waitForTimeout(500); },
    async computeIntegrated() {
      await page.click('#im-compute');
      await page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 200000 });
      await h.wait(400); return h.text('#im-verdict');
    },
    offscreen: () => page.evaluate(() => [...document.querySelectorAll('#experimental-lab :is(.lab-rail button, #lab-tabs button, .lab-head-actions button, .lab-context select, .mc-camera-bar button, .mc-transport button, .mc-layout-toggles button)')]
      .filter(b => { if (b.hidden || !b.offsetParent) return false; const r = b.getBoundingClientRect(); return r.width && (r.right > innerWidth + 0.5 || r.left < -0.5); }).map(b => b.textContent.trim() || b.getAttribute('aria-label') || b.className)),
    clipped: () => page.evaluate(() => [...document.querySelectorAll('#experimental-lab :is(.lab-step strong, #lab-tabs button, #lab-ctx-state, #lab-tool-title, .lab-rail-actions button, .mc-camera-bar button)')]
      .filter(el => el.offsetParent && el.scrollWidth > el.clientWidth + 1).map(el => `${el.id || el.dataset.labTab || el.className || el.tagName}: ${el.scrollWidth - el.clientWidth} px`)),
    docOverflow: () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  };
  try { await fn(h); } catch (error) { log.errors.push(`${prefix}: FALLO DEL GUION: ${error.message.split('\n').slice(0, 6).join(' | ')}`); }
  await page.close();
}

// Calcula A1 (Cassini → Marte) o el escenario dado con la sonda activa y lo envía al Centro de Misión.
async function prepare(h, scenario = 'A1') {
  const { page } = h;
  await h.stage('plan'); await h.tab('integrated');
  if (await page.locator('#im-scenario').inputValue() !== scenario) { await page.selectOption('#im-scenario', scenario); await h.wait(300); }
  const verdict = await h.computeIntegrated();
  if (await page.locator('#im-execute').isDisabled()) throw new Error(`sin trayectoria ejecutable: ${await h.text('#im-message')}`);
  await page.click('#im-execute'); await h.wait(1200);
  await h.waitModelInCenter();
  return verdict;
}

try {
  if (['all', 'smoke'].includes(PART)) await session(1366, 768, 's1366', async h => {
    const { page } = h;
    await h.home();
    await h.lab(); await h.model();
    log.checks.smoke = await h.labState();
    await h.shot('00_entrada_etapa1');
  });

  // 1–6, 8–10 y 12: misión guiada hecha a mano por el usuario, reproducción, telemetría, paneles, inmersiva e invalidación.
  if (['all', 'flow'].includes(PART)) await session(1366, 768, 'f1366', async h => {
    const { page } = h;
    await h.home();
    await page.click('.fm-card[data-card="guide"]'); await h.waitStep('intro', 30000); await h.model();
    log.checks.initial = await h.labState();
    log.checks.guideIntro = await h.guideStatus();
    await h.shot('01_inicio_etapa1_guia');
    await page.click('#lab-guide-next'); await h.waitStep('probe');
    await page.click('.lab-probe-card[data-probe-id="cassini"]'); await h.wait(800);
    log.checks.guideProbe = await h.guideStatus();
    await page.click('#lab-guide-next'); await h.waitStep('planner'); await h.wait(500);
    log.checks.guidePlannerBefore = await h.guideStatus();
    await h.shot('02_guia_paso2_resalta_panel_lateral');
    await page.click('[data-lab-stage="plan"]'); await h.wait(900);
    log.checks.guidePlannerAfter = await h.guideStatus();
    log.checks.planStage = await h.labState();
    await page.click('#lab-guide-next'); await h.waitStep('scenario');
    log.checks.guideScenario = await h.guideStatus();
    await page.click('#lab-guide-next'); await h.waitStep('compute');
    // Estado «calculando» de la barra de resumen, leído mientras calcula.
    // Se registran todos los textos que toma el estado durante el cálculo (el cálculo bloquea la página unos instantes).
    await page.evaluate(() => { window.__states = []; new MutationObserver(() => window.__states.push(document.querySelector('#lab-ctx-state').textContent)).observe(document.querySelector('#lab-ctx-state'), { childList: true, characterData: true, subtree: true }); });
    await page.click('#im-compute');
    await page.waitForFunction(() => document.querySelector('#lab-guide-status')?.dataset.state === 'done', null, { timeout: 200000 });
    log.checks.guideCompute = await h.guideStatus();
    log.checks.statesDuringCompute = await page.evaluate(() => [...new Set(window.__states)]);
    log.checks.afterCompute = await h.labState();
    log.checks.flow = await page.locator('#im-flow li').evaluateAll(items => items.map(li => `${li.textContent}: ${li.dataset.state}`));
    log.checks.brief = await page.locator('#im-brief dl > div').evaluateAll(rows => rows.map(r => `${r.querySelector('dt').textContent}: ${r.querySelector('dd').textContent}`));
    await h.shot('03_mision_completa_calculada');
    await page.click('#lab-guide-next'); await h.waitStep('play');
    await page.click('#im-execute');
    await page.waitForFunction(() => document.querySelector('#lab-guide-status')?.dataset.state === 'done', null, { timeout: 30000 });
    log.checks.guidePlay = await h.guideStatus();
    await h.waitModelInCenter();
    await page.click('#lab-guide-next'); await h.waitStep('done');
    log.checks.guideDone = await h.guideStatus();
    await page.click('#lab-guide-next'); await h.wait(300);
    log.checks.guideClosed = await page.locator('#lab-guide').evaluate(el => el.hidden);
    log.checks.playing = { lab: await h.labState(), center: await h.center() };
    await h.shot('04_reproduccion_cassini');
    // Cámaras, telemetría, trayectoria, eventos y resultados como pestañas del Centro de Misión.
    const panes = {};
    for (const id of ['cameras', 'telemetry', 'trajectory', 'events', 'results']) {
      await h.tab(id); panes[id] = { pane: (await h.center()).pane, title: await h.text('#mc-pane-title') };
      await h.shot(`05_pestana_${id}`);
    }
    log.checks.panes = panes;
    await h.tab('cameras');
    const cameras = {};
    for (const mode of await page.locator('#mc-camera-list [data-camera]').evaluateAll(list => list.map(b => b.dataset.camera))) {
      const item = page.locator(`#mc-camera-list [data-camera="${mode}"]`);
      if (await item.evaluate(el => el.hidden)) { cameras[mode] = 'oculta (no aplica a este tipo de misión)'; continue; }
      if (await item.isDisabled()) { cameras[mode] = 'desactivada'; continue; }
      await page.click(`#mc-camera-list [data-camera="${mode}"]`); await h.wait(500);
      cameras[mode] = await page.locator(`.mc-camera-bar [data-camera="${mode}"]`).getAttribute('aria-pressed');
    }
    log.checks.cameras = cameras;
    await page.click('#mc-camera-list [data-camera="overview"]');
    // 10: la cabecera sobre la escena (HUD) y la telemetría leen el mismo estado; en pausa deben coincidir.
    await h.tab('playback'); await page.click('#mc-pause').catch(() => {}); await h.tab('events');
    await page.locator('#mc-events button', { hasText: /captura/i }).first().click().catch(() => {}); await h.wait(1200);
    await h.tab('telemetry');
    log.checks.sameState = await page.evaluate(() => {
      const rows = Object.fromEntries([...document.querySelectorAll('#mc-state-metrics .lab-metric, #mc-derived-metrics .lab-metric, #mc-resource-metrics .lab-metric')].map(r => [r.firstElementChild.textContent, r.lastElementChild.textContent]));
      const hud = Object.fromEntries([...document.querySelectorAll('#mc-hud-metrics dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]));
      return { hud, telemetry: { altitud: rows['Altitud'], masa: rows['Masa total'], sol: rows['Distancia al Sol'], fase: rows['Fase'], desde: rows['Desde la salida'] },
        hudPhase: document.querySelector('#mc-hud-phase').textContent, elapsed: document.querySelector('#mc-elapsed').textContent, timeline: document.querySelector('#mc-timeline').value,
        match: { altitud: hud['Altitud'] === rows['Altitud'], masa: hud['Masa'] === rows['Masa total'], sol: hud['Distancia al Sol'] === rows['Distancia al Sol'] } };
    });
    await h.shot('06_telemetria_en_captura');
    // Panel oculto e inmersiva: la reproducción sigue.
    await h.tab('playback'); await page.click('#mc-play'); await h.wait(800);
    const t0 = (await h.center()).elapsed;
    await page.click('[data-mc-panel="drawer"]'); await h.wait(1500);
    log.checks.drawerHidden = { center: await h.center(), before: t0 };
    await h.shot('07_panel_oculto');
    await page.click('[data-mc-panel="drawer"]'); await h.wait(300);
    await page.click('[data-mc-panel="immersive"]'); await h.wait(1500);
    log.checks.immersive = { lab: await h.labState(), center: await h.center(), railVisible: await page.locator('.lab-rail').isVisible() };
    await h.shot('08_vista_inmersiva');
    await page.keyboard.press('Escape'); await h.wait(500);
    log.checks.afterEscape = { lab: (await h.labState()).immersive, center: (await h.center()).immersive };
    // Estado «finalizada»: el instante se lleva casi al final y se reproduce.
    await page.click('#mc-pause').catch(() => {});
    await page.evaluate(() => { const t = document.querySelector('#mc-timeline'); t.value = String(Number(t.max) * 0.9999); t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.click('#mc-play'); await h.wait(3000);
    log.checks.finished = await h.text('#lab-ctx-state');
    // 11 (17.1): la demostración de la Sonda Experimental 01 ya no existe; la misión se reproduce en el Sistema Solar principal.
    log.checks.demo = await page.evaluate(() => ({ orbitalAction: Boolean(document.querySelector('[data-lab-action="orbital"]')), returnButton: Boolean(document.querySelector('#lab-return')),
      missionPanel: Boolean(document.querySelector('#mission-panel')), labScene: document.querySelector('#app').dataset.labScene ?? null,
      scene: window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoMisionEscenaPrincipal?.() ?? null }));
    log.checks.afterDemo = { lab: await h.labState(), center: await h.center() };
    // 12: cambiar de sonda invalida la misión preparada y lo explica; no queda nada reproducible de la sonda anterior.
    await h.probe('juno'); await h.wait(800);
    log.checks.invalidated = { lab: await h.labState(), center: await h.center(), playDisabled: await page.locator('#mc-play').isDisabled(), transportHidden: await page.locator('#mc-transport').evaluate(el => el.hidden) };
    await h.shot('10_invalidada_por_cambio_de_sonda');
    await h.probe('cassini'); await h.wait(600);
    log.checks.backToCassini = { lab: await h.labState(), center: await h.center() };
    await h.stage('probe');
    log.checks.probePersisted = await page.locator('.lab-probe-card[aria-pressed="true"]').getAttribute('data-probe-id');
  });

  // 5–6: la misión guiada completa solo con «Hazlo por mí», partiendo de otra sonda y otro escenario.
  if (['all', 'auto'].includes(PART)) await session(1280, 720, 'a1280', async h => {
    const { page } = h;
    await h.home({ preset: { 'simulador:sonda-activa': 'juno' } });
    await h.lab(); await h.model();
    await h.stage('plan'); await page.selectOption('#im-scenario', 'C1'); await h.wait(300); await h.stage('probe');
    log.checks.autoStart = await h.labState();
    await page.click('.lab-rail [data-lab-action="guide"]'); await h.waitStep('intro', 30000);
    await page.click('#lab-guide-next'); await h.waitStep('probe');
    const steps = [];
    for (const id of ['probe', 'planner', 'scenario', 'compute', 'play']) {
      await h.waitStep(id);
      const before = await h.guideStatus();
      await page.click('#lab-guide-do');
      const next = { probe: 'planner', planner: 'scenario', scenario: 'compute', compute: 'play', play: 'done' }[id];
      await h.waitStep(next);
      steps.push({ id, before, after: await h.guideStatus(), stage: (await h.labState()).stage });
      if (id === 'planner') await h.shot('01_hazlo_por_mi_paso2');
    }
    log.checks.autoSteps = steps;
    await h.waitModelInCenter();
    log.checks.autoEnd = { lab: await h.labState(), center: await h.center() };
    await h.shot('02_hazlo_por_mi_final');
  });

  // 7–9: cada sonda con su propio modelo en la etapa 1 y en la reproducción de su misión calculada.
  if (['all', 'fleet'].includes(PART)) await session(1600, 900, 'v1600', async h => {
    const { page } = h;
    await h.home();
    await h.lab();
    const fleet = {};
    for (const id of PROBES) {
      await h.stage('probe'); await h.tab('overview');
      await page.click(`.lab-probe-card[data-probe-id="${id}"]`); await h.model(['nasa', 'procedural']);
      fleet[id] = { hangar: { status: await page.locator('#lab-assembly-status').getAttribute('data-state'), label: await h.text('#lab-stage-count') } };
      await h.shot(`01_${id}_vista_general`);
      if (id === 'dawn') {
        // Con Dawn, A1 dura 771 d (captura iónica) y termina fuera de la ventana de efemérides: debe verse el resultado sin reproducción.
        await h.stage('plan'); await h.tab('integrated'); await page.selectOption('#im-scenario', 'A1'); await h.wait(300);
        fleet[id].a1 = { verdict: await h.computeIntegrated(), message: await h.text('#im-message'), execute: await page.locator('#im-execute').isEnabled(), state: await h.text('#lab-ctx-state'),
          flowPlay: await page.locator('#im-flow li[data-flow="play"]').getAttribute('data-state') };
        await h.shot('02a_dawn_A1_sin_reproduccion');
      }
      fleet[id].scenario = id === 'dawn' ? 'A3' : 'A1';
      fleet[id].verdict = await prepare(h, fleet[id].scenario);
      fleet[id].center = await h.center();
      await h.shot(`02_${id}_reproduccion`);
    }
    log.checks.fleet = fleet;
  });

  // Etapa 1 completa (pestañas, documentos, esquema, ensamblaje experimental), glosario, herramientas de Planificar y áreas.
  if (['all', 'tools'].includes(PART)) await session(1600, 900, 't1600', async h => {
    const { page } = h;
    await h.home();
    await h.lab(); await h.model();
    const tabs = {};
    for (const id of ['overview', 'architecture', 'docs', 'engineering']) { await h.tab(id); tabs[id] = await h.labState(); await h.shot(`01_etapa1_${id}`); }
    log.checks.stage1Tabs = Object.fromEntries(Object.entries(tabs).map(([k, v]) => [k, { tab: v.tab, tabs: v.tabs }]));
    // Arquitectura: localizar una pieza en el esquema técnico.
    await h.tab('architecture');
    await page.click('#lab-assembly-list .lab-assembly-item:nth-of-type(1)'); await h.wait(400);
    await page.click('[data-arch-view="schematic"]'); await h.model(['esquema']);
    log.checks.schematic = { status: await h.text('#lab-assembly-status'), note: await h.text('#lab-assembly-note'), selected: await h.text('#lab-selected-info h4') };
    await h.shot('02_esquema_tecnico_pieza_resaltada');
    await page.click('[data-arch-view="nasa"]'); await h.model(['nasa', 'procedural']);
    // Documentación: miniaturas reales, procedencia y ampliación.
    const docs = {};
    for (const id of PROBES) {
      await h.probe(id); await h.tab('docs'); await h.wait(1200);
      docs[id] = await page.locator('#lab-docs .lab-doc-card').evaluateAll(cards => cards.map(c => ({ kind: c.dataset.kind, title: c.querySelector('strong')?.textContent, loaded: c.querySelector('img') ? c.querySelector('img').naturalWidth > 0 : null })));
    }
    log.checks.docs = docs;
    await h.probe('cassini'); await h.tab('docs'); await h.wait(800);
    await page.click('#lab-docs .lab-doc-card[data-kind="diagram"]'); await h.wait(1500);
    log.checks.lightbox = await page.evaluate(() => ({ open: document.querySelector('#lab-lightbox').open, img: document.querySelector('#lab-lightbox-img').naturalWidth, caption: document.querySelector('#lab-lightbox-caption').textContent.slice(0, 220) }));
    await h.shot('03_plano_ampliado');
    await page.keyboard.press('Escape'); await h.wait(300);
    // Ingeniería: resumen primero y detalle plegable.
    await h.tab('engineering');
    log.checks.engineeringSummary = await page.locator('#lab-eng-summary .lab-eng-card').evaluateAll(cards => cards.map(c => `${c.querySelector('span').textContent}: ${c.querySelector('strong').textContent}`));
    // Glosario: ayuda al pasar el puntero y ventana completa.
    const term = page.locator('#lab-eng-summary .lab-term').first();
    if (await term.count()) { await term.hover(); await h.wait(400); log.checks.tooltip = await page.evaluate(() => ({ visible: !document.querySelector('#lab-tooltip').hidden, text: document.querySelector('#lab-tooltip').textContent.slice(0, 140) })); await h.shot('04_ayuda_termino'); }
    await page.click('.lab-rail [data-lab-action="glossary"]'); await h.wait(500);
    log.checks.glossary = await page.evaluate(() => ({ open: document.querySelector('#lab-glossary').open, terms: document.querySelectorAll('.lab-glossary-list dt').length }));
    await h.shot('05_glosario');
    await page.keyboard.press('Escape'); await h.wait(300);
    // Ensamblaje experimental: separado de la configuración histórica y verificado por la ingeniería.
    // Con una misión de la Cassini histórica preparada, pasar al ensamblaje experimental (aún sin cambios) también la invalida.
    log.checks.unmodifiedSwitch = { verdict: await prepare(h, 'A1'), before: (await h.center()).vehicle };
    await h.stage('probe');
    await h.tab('overview'); await page.click('[data-vehicle-mode="experimental"]'); await h.wait(900);
    Object.assign(log.checks.unmodifiedSwitch, { state: (await h.labState()).summary.state, center: await h.center() });
    await page.selectOption('#lab-custom-base', 'cassini'); await h.wait(500);
    const before = await page.locator('#lab-eng-summary .lab-eng-card').evaluateAll(cards => cards.map(c => c.querySelector('strong').textContent));
    await page.selectOption('#lab-custom [data-slot="hga"]', 'juno-hga').catch(e => log.errors.push(`t1600: hga ${e.message.split('\n')[0]}`)); await h.wait(700);
    log.checks.custom = { notes: await h.text('#lab-custom .lab-message'), diff: await h.text('#lab-custom .lab-custom-diff'), ctx: await page.locator('#lab-ctx-probe').inputValue(),
      design: await h.text('#lab-ctx-design'), model: await h.text('#lab-assembly-status'), engBefore: before };
    await h.shot('06_ensamblaje_experimental');
    await h.tab('engineering');
    log.checks.custom.engAfter = await page.locator('#lab-eng-summary .lab-eng-card').evaluateAll(cards => cards.map(c => c.querySelector('strong').textContent));
    log.checks.custom.disclaimer = await h.text('#lab-eng-disclaimer');
    log.checks.custom.verdict = await prepare(h, 'A1');
    log.checks.custom.center = await h.center();
    await h.shot('07_experimental_en_reproduccion');
    await h.stage('probe'); await h.tab('overview'); await page.click('[data-vehicle-mode="historic"]'); await h.wait(900);
    log.checks.custom.afterHistoric = { lab: await h.labState(), center: await h.center() };
    // Planificar: cada herramienta sigue presente dentro de la etapa.
    const tools = {};
    await h.stage('plan');
    for (const id of ['integrated', 'interplanetary', 'lunar', 'launch']) {
      await h.tab(id); await h.wait(600);
      tools[id] = { chain: await h.text('#lab-tool-chain').catch(() => null), visible: (await h.labState()).visible };
      await h.shot(`08_planificar_${id}`);
    }
    tools.finiteThrust = await page.locator('#ft-controls-host').count();
    await h.tab('launch'); await page.click('#ln-calculate'); await h.wait(2000);
    tools.launch = { status: await h.text('#ln-results .mission-status').catch(() => null), execute: await page.locator('#ln-execute').isEnabled() };
    if (tools.launch.execute) { await page.click('#ln-execute'); await h.wait(1500); await h.waitModelInCenter().catch(() => {}); tools.launch.center = await h.center(); await h.shot('09_lanzamiento_en_reproduccion'); }
    log.checks.tools = tools;
    // Mapa de áreas y demostración desde el estado vacío del Centro de Misión.
    log.checks.areas = await page.evaluate(() => [...document.querySelectorAll('#app-nav-panel .app-nav-group')].map(g => `${g.querySelector('h3').textContent}: ${[...g.querySelectorAll('strong')].map(s => s.textContent).join(', ')}`));
    await h.area('docs'); log.checks.areaDocs = (await h.labState()).tab;
    await h.area('center'); log.checks.areaCenter = (await h.labState()).stage;
  });

  // 14: siete resoluciones, con la misión guiada («Hazlo por mí») hasta la reproducción.
  if (['all', 'responsive'].includes(PART)) {
    for (const [w, hgt] of [[320, 568], [375, 667], [390, 844], [768, 1024], [1280, 720], [1366, 768], [1920, 1080]]) {
      if (ONLY && !ONLY.includes(`${w}x${hgt}`)) continue;
      const key = `r${w}x${hgt}`;
      await session(w, hgt, key, async h => {
        const { page } = h;
        await h.home();
        await h.area('guide'); await h.waitStep('intro', 30000); await h.model();
        const res = { start: await h.labState(), offscreen: {}, clipped: {}, doc: {} };
        await h.shot('01_etapa1');
        res.offscreen.probe = await h.offscreen(); res.clipped.probe = await h.clipped(); res.doc.probe = await h.docOverflow();
        await page.click('#lab-guide-min'); await h.wait(300);
        for (const id of ['architecture', 'docs', 'engineering']) await h.tab(id);
        await h.shot('02_etapa1_ingenieria');
        await page.click('#lab-guide-min'); await h.wait(200);
        // Paso 1 ya hecho (Cassini es la sonda por defecto): «Hazlo por mí» no se muestra y se pulsa «Siguiente».
        await page.click('#lab-guide-next'); await h.waitStep('probe');
        res.step1DoHidden = await page.locator('#lab-guide-do').evaluate(el => el.hidden);
        await page.click('#lab-guide-next'); await h.waitStep('planner');
        await page.click('#lab-guide-do'); await h.waitStep('scenario', 15000);
        await page.click('#lab-guide-next'); await h.waitStep('compute');
        await page.click('#lab-guide-do'); await h.waitStep('play');
        await page.click('#lab-guide-min'); await h.wait(300);
        await h.shot('03_etapa2_calculada');
        res.offscreen.plan = await h.offscreen(); res.clipped.plan = await h.clipped(); res.doc.plan = await h.docOverflow();
        await page.click('#lab-guide-min'); await h.wait(200);
        await page.click('#lab-guide-do'); await h.waitStep('done'); await page.click('#lab-guide-next'); await h.wait(300);
        await h.waitModelInCenter();
        await page.evaluate(() => document.querySelector('#experimental-lab').scrollTo?.(0, 0));
        await h.shot('04_etapa3_reproduccion');
        res.offscreen.play = await h.offscreen(); res.clipped.play = await h.clipped(); res.doc.play = await h.docOverflow();
        res.center = await h.center(); res.end = await h.labState();
        await h.tab('telemetry'); await h.shot('05_etapa3_telemetria');
        // 24: en pantallas estrechas la reproducción ya empieza en vista inmersiva (con la hoja inferior abierta tras elegir la pestaña).
        res.autoImmersive = (await h.labState()).immersive === 'true';
        if (res.autoImmersive) {
          await page.keyboard.press('Escape'); await h.wait(500); await h.shot('06_inmersiva');
          res.immersive = { lab: (await h.labState()).immersive, offscreen: await h.offscreen() };
          await page.click('[data-mc-panel="exit-immersive"]'); await h.wait(500);
          res.afterExit = (await h.labState()).immersive;
        } else if (await page.locator('[data-mc-panel="immersive"]').isVisible()) {
          await page.click('[data-mc-panel="immersive"]'); await h.wait(1200); await h.shot('06_inmersiva');
          res.immersive = { lab: (await h.labState()).immersive, offscreen: await h.offscreen() };
          await page.click('[data-mc-panel="exit-immersive"]').catch(() => page.keyboard.press('Escape')); await h.wait(500);
        } else res.immersive = 'botón no visible';
        log.checks[key] = res;
      });
    }
  }

  // Revisión automática de accesibilidad. No sustituye a una prueba con lector de pantalla. Comprueba:
  //   - el nombre accesible que calcula Chrome (árbol de accesibilidad por CDP);
  //   - las referencias ARIA y los identificadores duplicados;
  //   - las imágenes sin texto alternativo y los controles enfocables dentro de zonas ocultas a la accesibilidad;
  //   - un recorrido con el tabulador en cada etapa.
  if (['all', 'a11y'].includes(PART)) await session(1366, 768, 'x1366', async h => {
    const { page } = h;
    const cdp = await page.context().newCDPSession(page);
    const ROLES = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'tab', 'menuitem', 'option', 'image', 'img', 'dialog']);
    const SCOPE = '#experimental-lab, .app-header, #lab-guide, #lab-glossary, #lab-lightbox, #lab-tooltip';
    const audit = async () => {
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      const unnamed = [];
      for (const n of nodes) {
        if (n.ignored || !ROLES.has(n.role?.value) || (n.name?.value ?? '').trim() || n.backendDOMNodeId == null) continue;
        const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId }).catch(() => ({}));
        if (!object?.objectId) continue;
        const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true, arguments: [{ value: SCOPE }],
          functionDeclaration: 'function (scope) { const r = this.getBoundingClientRect(); return { inScope: Boolean(this.closest(scope)), visible: r.width > 0 && r.height > 0, html: this.outerHTML.slice(0, 160) }; }' });
        if (result.value?.inScope && result.value.visible) unnamed.push(`${n.role.value}: ${result.value.html}`);
      }
      const dom = await page.evaluate(scopeSel => {
        const ids = new Map(); for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
        const scope = [...document.querySelectorAll(scopeSel)];
        const inScope = sel => [...new Set(scope.flatMap(s => [...(s.matches(sel) ? [s] : []), ...s.querySelectorAll(sel)]))];
        const brokenRefs = [];
        for (const attr of ['aria-controls', 'aria-labelledby', 'aria-describedby', 'for'])
          for (const el of inScope(`[${attr}]`)) for (const id of el.getAttribute(attr).split(/\s+/).filter(Boolean)) if (!document.getElementById(id)) brokenRefs.push(`${attr}=${id} en ${el.id || el.className || el.tagName}`);
        const focusable = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
        return { duplicateIds: [...ids].filter(([, n]) => n > 1).map(([id]) => id), brokenRefs,
          hiddenFocusable: inScope('[aria-hidden="true"]').flatMap(el => [...el.querySelectorAll(focusable)].filter(f => !f.disabled && f.offsetParent)).map(f => f.id || f.className || f.tagName),
          imgNoAlt: inScope('img:not([alt])').map(i => i.src.split('/').pop()),
          live: inScope('[aria-live], [role="status"], [role="alert"]').filter(el => el.offsetParent).map(el => el.id || el.className),
          lowContrast: (() => {
            // Contraste WCAG 2.1 del texto visible contra el primer fondo opaco de sus antecesores (fondo base negro). Si antes
            // aparece una imagen, un degradado o el lienzo 3D, el contraste no se puede calcular y se omite.
            const rgba = c => { const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return [m[0], m[1], m[2], m[3] ?? 1]; };
            const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
            const over = (top, under) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)).concat(1); };
            const found = new Map();
            for (const el of inScope('*')) {
              if (!el.offsetParent || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
              const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
              const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
              const layers = []; let unknown = false;
              for (let n = el; n; n = n.parentElement) {
                const ns = getComputedStyle(n);
                if (ns.backgroundImage !== 'none' || n.tagName === 'CANVAS') { unknown = true; break; }
                const bg = rgba(ns.backgroundColor); if (bg[3] > 0) layers.push(bg); if (bg[3] >= 1) break;
              }
              if (unknown) continue;
              let base = [0, 0, 0, 1]; for (const layer of layers.reverse()) base = over(layer, base);
              let opacity = 1; for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
              if (opacity < 0.1) continue; // menú o panel oculto por transparencia
              const fg = over([...rgba(cs.color).slice(0, 3), rgba(cs.color)[3] * opacity], base);
              const [a, b] = [lum(fg), lum(base)].sort((x, y) => y - x); const ratio = (a + 0.05) / (b + 0.05);
              const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
              if (ratio < (large ? 3 : 4.5)) {
                const key = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')}`;
                if (!found.has(key)) found.set(key, `${key} «${el.textContent.trim().slice(0, 30)}» ${ratio.toFixed(2)}:1 ${size}px${el.closest('button:disabled, fieldset:disabled, [aria-disabled="true"]') ? ' (desactivado)' : ''}`);
              }
            }
            return [...found.values()];
          })() };
      }, SCOPE);
      return { unnamed, ...dom };
    };
    // Tabulador desde el botón del panel de etapas: cada control enfocado debe verse y mostrar el anillo de foco.
    const keyboard = async (count = 45) => {
      await page.focus('#lab-rail-toggle');
      const seen = [];
      for (let i = 0; i < count; i++) {
        await page.keyboard.press('Tab'); await page.waitForTimeout(40);
        seen.push(await page.evaluate(() => {
          const el = document.activeElement; if (!el || el === document.body) return { name: 'body' };
          const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
          return { name: (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 48),
            visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
            // Anillo de foco: contorno o sombra exterior del tema (los campos del laboratorio usan sombra en lugar de contorno).
            // En la parada del botón del calendario de un campo de fecha, Chrome solo marca :focus-within en el campo (etapa 24).
            ring: (el.matches(':focus-visible') || el.matches('input:is([type="date"],[type="datetime-local"]):focus-within')) && ((cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'),
            style: `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''} fv=${el.matches(':focus-visible')} outline=${cs.outlineStyle} ${cs.outlineWidth} shadow=${cs.boxShadow.slice(0, 40)}` };
        }));
      }
      const named = seen.filter(s => s.name !== 'body');
      return { steps: named.length, unique: new Set(named.map(s => s.name)).size, invisible: named.filter(s => !s.visible).map(s => s.name), noRing: named.filter(s => !s.ring).map(s => `${s.name} (${s.style})`) };
    };
    const results = {};
    await h.home();
    await h.lab(); await h.model();
    if (await page.locator('#lab-guide').isVisible()) { await page.click('#lab-guide-close').catch(() => {}); }
    results.html = await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.title }));
    for (const id of ['overview', 'architecture', 'docs', 'engineering']) { await h.tab(id); results[`probe.${id}`] = await audit(); }
    await h.tab('overview'); results['probe.keyboard'] = await keyboard();
    await page.click('[data-vehicle-mode="experimental"]'); await h.wait(700); results['probe.experimental'] = await audit();
    await page.click('[data-vehicle-mode="historic"]'); await h.wait(700);
    await page.click('.lab-rail [data-lab-action="glossary"]'); await h.wait(400); results.glossary = await audit(); await page.keyboard.press('Escape'); await h.wait(300);
    await h.tab('docs'); await page.click('#lab-docs .lab-doc-card[data-kind="photo"]'); await h.wait(1200); results.lightbox = await audit(); await page.keyboard.press('Escape'); await h.wait(300);
    for (const id of ['integrated', 'interplanetary', 'lunar', 'launch']) { await h.stage('plan'); await h.tab(id); results[`plan.${id}`] = await audit(); }
    await h.tab('integrated'); results['plan.keyboard'] = await keyboard();
    await prepare(h, 'A1');
    for (const id of ['playback', 'cameras', 'telemetry', 'trajectory', 'events', 'results']) { await h.tab(id); results[`play.${id}`] = await audit(); }
    await h.tab('playback'); results['play.keyboard'] = await keyboard();
    log.checks.a11y = results;
    const summary = {};
    for (const [k, v] of Object.entries(results)) if (v && typeof v === 'object' && !('lang' in v)) {
      summary[k] = 'steps' in v ? `${v.steps} pasos, ${v.unique} controles, ${v.invisible.length} invisibles, ${v.noRing.length} sin anillo`
        : `${v.unnamed.length} sin nombre, ${v.duplicateIds.length} id duplicados, ${v.brokenRefs.length} referencias rotas, ${v.hiddenFocusable.length} ocultos enfocables, ${v.imgNoAlt.length} img sin alt, ${v.lowContrast.filter(t => !t.includes('(desactivado)')).length} textos con contraste bajo`;
    }
    log.checks.a11ySummary = summary;
  });

  // 17.1: «3 · Reproducir» en el Sistema Solar principal. Cassini → Marte (A1) con la escena principal, sus cámaras, la
  // llegada, la salida y el regreso a la etapa, la restauración de la exploración y Tierra–Luna en la escena local.
  // Lee la escena con el diagnóstico de solo lectura; las posiciones se comparan en unidades de escena (32 = 1 AU).
  const sceneSizes = [[1366, 768], [390, 844], [1920, 1080], [768, 1024]];
  if (['all', 'scene'].includes(PART)) for (const [w, hgt] of sceneSizes) {
    if (ONLY && !ONLY.includes(`${w}x${hgt}`)) continue;
    const full = w === 1366;
    await session(w, hgt, `e${w}`, async h => {
      const { page } = h, key = `scene${w}x${hgt}`, checks = log.checks[key] = {};
      const diag = () => page.evaluate(() => { const d = window.__SIMULADOR_DIAGNOSTICO__;
        return { mission: d.obtenerEstadoMisionEscenaPrincipal(), scene: d.obtenerDiagnosticoEscena(), mode: d.obtenerModoOperacion(), labScene: document.querySelector('#app').dataset.labScene ?? null,
          labView: document.querySelector('#app').dataset.labView ?? null,
          mainCanvasVisible: getComputedStyle(document.querySelector('#solar-system')).visibility, localCanvasVisible: document.querySelector('#mc-canvas') ? getComputedStyle(document.querySelector('#mc-canvas')).visibility : null, // 18: el laboratorio se crea al entrar en él
          footer: document.querySelector('#mc-foot')?.textContent?.trim() ?? null,
          hitAtStage: (() => { const s = document.querySelector('#lab-mission-center .mc-stage')?.getBoundingClientRect(); if (!s || !s.width) return null;
            const el = document.elementFromPoint(s.left + s.width / 2, s.top + s.height * 0.45); return el ? (el.closest('#solar-system') ? 'escena principal' : el.id || el.className || el.tagName) : null; })() }; });
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      // En pantallas estrechas el Centro de Misión se desplaza: la escena se lleva a la vista antes de medir o capturar.
      const toStage = async () => { await page.locator('#lab-mission-center .mc-stage').evaluate(el => el.scrollIntoView({ block: 'start' })); await h.wait(900); };
      await h.home();
      await h.area('solar'); await h.wait(1500);
      const before = await diag(); checks.exploracion = { planets: before.scene.planetas, probe: before.scene.sonda.visible, moons: before.scene.lunasVisibles, escala: before.scene.modoEscala };
      await h.lab(); await h.model();
      await page.click('.lab-probe-card[data-probe-id="cassini"]'); await h.model(['nasa', 'procedural']);
      checks.verdict = await prepare(h, 'A1');
      await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMisionEscenaPrincipal()?.controlling === true, null, { timeout: 60000 });
      await h.wait(1500); await toStage();
      const start = await diag();
      const m = start.mission, s = start.scene;
      checks.inicio = { mission: m, labScene: start.labScene, mainCanvas: start.mainCanvasVisible, localCanvas: start.localCanvasVisible, hitAtStage: start.hitAtStage, footer: start.footer,
        escala: s.modoEscala, moons: s.lunasVisibles, probe: s.sonda, camara: s.camara, center: await h.center(),
        // Época de salida: la Tierra y la sonda en el mismo punto (la sonda sale de una órbita de aparcamiento).
        sondaTierraAU: dist(s.sonda.posicion, s.planetas.Tierra) / 32,
        // Los planetas ya no están en la fecha de exploración, sino en la de la misión.
        tierraMovidaAU: dist(s.planetas.Tierra, before.scene.planetas.Tierra) / 32 };
      // Puntero: cada control visible del laboratorio recibe el clic; el centro de la escena llega al lienzo principal.
      checks.puntero = await page.evaluate(() => {
        // Las marcas de eventos de la barra se excluyen: con toda la misión en la barra, eventos cercanos comparten píxel.
        const sels = ['.lab-rail button', '#lab-tabs button', '.lab-header button', '.lab-header select', '.mc-camera-bar button', '.mc-layout-toggles button', '.mc-transport button:not(.mc-tick)', '#mc-drawer button', '#mc-drawer select', '#lab-guide button'];
        const blocked = [], total = { checked: 0 }, siteHeader = document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0;
        for (const el of document.querySelectorAll(sels.join(','))) {
          const r = el.getBoundingClientRect(); if (!r.width || !r.height || el.closest('[hidden]') || r.top < siteHeader || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
          const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1), top = document.elementFromPoint(x, y);
          total.checked++; if (!(top === el || el.contains(top))) blocked.push(`${el.textContent.trim().slice(0, 24) || el.getAttribute('aria-label') || el.className}: ${top?.id || top?.className || top?.tagName}`);
        }
        return { ...total, blocked };
      });
      await h.shot('01_cassini_marte_escena_principal_general');
      // Reloj del Centro de Misión → escena: el tiempo avanza y los planetas y la sonda se mueven.
      await page.click('#mc-play').catch(() => {}); await h.wait(4000);
      const playing = await diag();
      checks.reproduciendo = { elapsed: (await h.center()).elapsed, t: playing.mission.elapsedSeconds, jd: playing.mission.jdTdb,
        sondaMovidaAU: dist(playing.scene.sonda.posicion, s.sonda.posicion) / 32, marteMovidaAU: dist(playing.scene.planetas.Marte, s.planetas.Marte) / 32 };
      await page.click('#mc-pause').catch(() => {});
      if (full) {
        await h.tab('cameras');
        const cams = {};
        for (const mode of ['exterior', 'destination', 'overview']) {
          const item = page.locator(`#mc-camera-list [data-camera="${mode}"]`);
          if (await item.count() === 0 || await item.evaluate(el => el.hidden) || await item.isDisabled()) { cams[mode] = 'no disponible'; continue; }
          await page.click(`#mc-camera-list [data-camera="${mode}"]`); await h.wait(2500);
          const d = await diag();
          cams[mode] = { pressed: await page.locator(`.mc-camera-bar [data-camera="${mode}"]`).getAttribute('aria-pressed'), viewMode: d.mission.cameraMode, camara: d.scene.camara, probeScale: d.scene.sonda.escalaVisual };
          await h.shot(`02_camara_${mode}`);
        }
        cams.onboard = await page.locator('#mc-camera-list [data-camera="onboard"]').evaluate(el => ({ hidden: el.hidden, disabled: el.disabled })).catch(() => 'sin botón');
        checks.camaras = cams;
        await h.tab('playback');
      }
      // Llegada: el instante se lleva al final del cálculo; la sonda queda en órbita de Marte, reducida, sin salir de la cobertura.
      await page.evaluate(() => { const t = document.querySelector('#mc-timeline'); t.value = String(Number(t.max)); t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); });
      await h.wait(1500);
      if (full) { await page.click('.mc-camera-bar [data-camera="destination"]').catch(() => {}); await h.wait(2500); }
      await toStage();
      const end = await diag();
      checks.llegada = { mission: end.mission, center: await h.center(), state: await h.text('#lab-ctx-state'), sondaMarteKm: dist(end.scene.sonda.posicion, end.scene.planetas.Marte) / 32 * 149597870.7,
        probeScale: end.scene.sonda.escalaVisual, events: await page.locator('#mc-events li, #mc-events button').evaluateAll(list => list.slice(0, 12).map(e => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []) };
      await h.shot('03_llegada_marte');
      if (full) {
        // Cámara de destino calculada: el disco de Marte ocupa buena parte del cuadro (se mide su radio proyectado en píxeles).
        checks.destinoDisco = await page.evaluate(() => {
          const d = window.__SIMULADOR_DIAGNOSTICO__.obtenerDiagnosticoEscena();
          const cam = d.camara.posicion, mars = d.planetas.Marte, dist = Math.hypot(cam[0] - mars[0], cam[1] - mars[1], cam[2] - mars[2]);
          const radio = 3389.5 / 149597870.7 * 32, canvas = document.querySelector('#solar-system canvas');
          const fov = 48 * Math.PI / 180; // campo vertical de la cámara principal (PerspectiveCamera de 48°)
          return { distanciaRadios: dist / radio, radioPx: Math.asin(Math.min(1, radio / dist)) / (fov / 2) * canvas.clientHeight / 2 };
        });
        // Vista general y vista inmersiva: la ventana crece y la vista general se recalcula sola.
        await page.click('.mc-camera-bar [data-camera="overview"]'); await h.wait(2500);
        const before = (await diag()).scene.camara.posicion;
        await page.click('[data-mc-panel="immersive"]'); await h.wait(3500);
        const after = (await diag()).scene.camara.posicion;
        checks.inmersivaReencuadre = { antes: before, despues: after, cambio: dist(before, after) };
        await h.shot('03b_inmersiva_reencuadrada');
        await page.keyboard.press('Escape'); await h.wait(2500);
        await page.click('.mc-camera-bar [data-camera="destination"]'); await h.wait(2500);
      }
      if (!full) return;
      // Salir de «3 · Reproducir» devuelve la escena (sin misión ni sonda) y volver la recupera.
      await h.stage('plan'); await h.wait(1200);
      const away = await diag();
      checks.fueraDeReproducir = { mission: away.mission.controlling, labScene: away.labScene, probe: away.scene.sonda.visible, escala: away.scene.modoEscala };
      await h.stage('play'); await h.wait(1500);
      const back = await diag();
      checks.regresoAReproducir = { controlling: back.mission.controlling, labScene: back.labScene, t: back.mission.elapsedSeconds };
      // Salir del laboratorio: el Sistema Solar vuelve a la fecha de exploración, con lunas y sin la sonda.
      await h.area('solar'); await h.wait(2500);
      const after = await diag();
      checks.trasSalir = { mode: after.mode, controlling: after.mission.controlling, labScene: after.labScene, probe: after.scene.sonda.visible, moons: after.scene.lunasVisibles, escala: after.scene.modoEscala,
        maxDiferenciaPlanetasUnidades: Math.max(...Object.keys(before.scene.planetas).map(n => dist(after.scene.planetas[n], before.scene.planetas[n]))) };
      await h.shot('04_exploracion_restaurada');
      // Tierra–Luna (geocéntrica) sigue en la escena local del Centro de Misión, con la explicación.
      await h.lab(); await h.stage('plan'); await h.tab('lunar');
      await page.click('#mission-calculate'); await h.wait(3000);
      if (await page.locator('#mission-execute').isEnabled()) {
        await page.click('#mission-execute'); await h.wait(1500); await h.waitModelInCenter().catch(() => {});
        const lunar = await diag();
        checks.tierraLuna = { mission: lunar.mission, labScene: lunar.labScene, localCanvas: lunar.localCanvasVisible, footer: lunar.footer, status: await h.text('#mc-stage-status'), center: await h.center(),
          message: await h.text('#mc-message').catch(() => null) };
        await h.shot('05_tierra_luna_escena_local');
      } else checks.tierraLuna = { execute: false, message: await h.text('#mission-status').catch(() => null) };
      // Ventanas interplanetarias (Lambert heliocéntrico): también se reproducen en el Sistema Solar principal.
      await h.stage('plan'); await h.tab('interplanetary'); await h.wait(800);
      await page.click('#ip-search');
      await page.waitForFunction(() => !document.querySelector('#ip-search').disabled, null, { timeout: 240000 }); await h.wait(800);
      if (await page.locator('#ip-execute').isEnabled()) {
        await page.click('#ip-execute'); await h.wait(1500);
        await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMisionEscenaPrincipal()?.controlling === true, null, { timeout: 60000 }).catch(() => {});
        await h.wait(1500); await toStage();
        const lambert = await diag();
        checks.lambert = { mission: lambert.mission, labScene: lambert.labScene, hitAtStage: lambert.hitAtStage, footer: lambert.footer, destination: await h.text('#lab-ctx-destination'),
          sondaTierraAU: dist(lambert.scene.sonda.posicion, lambert.scene.planetas.Tierra) / 32, center: await h.center() };
        await h.shot('06_ventana_interplanetaria_escena_principal');
      } else checks.lambert = { execute: false, message: await h.text('#ip-message').catch(() => null) };
    });
  }

  // Coherencia visual con los otros dos modos (solo capturas para comparar).
  // 17.1 · Lector de pantalla (revisión automática, NO sustituye a NVDA/Narrador): árbol de accesibilidad de cada pantalla
  // (lo que el lector recorre) y registro de lo que anunciarían las regiones vivas durante la misión Cassini → Marte.
  if (['sr'].includes(PART)) await session(1366, 768, 'r1366', async h => {
    const { page } = h, checks = log.checks.sr = {};
    const snapshot = async name => { const yaml = await page.locator('body').ariaSnapshot(); await fs.writeFile(path.join(out, `sr_${name}.yaml`), yaml); return yaml; };
    const structure = () => page.evaluate(() => {
      const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],[aria-hidden="true"],[inert]'); };
      const name = el => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') ? el.getAttribute('aria-labelledby').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ') : '') || el.textContent || el.title || el.alt || '').trim().replace(/\s+/g, ' ');
      const headings = [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')].filter(visible).map(el => `${el.tagName === 'DIV' ? 'h' + el.getAttribute('aria-level') : el.tagName.toLowerCase()} ${name(el).slice(0, 60)}`);
      const landmarks = [...document.querySelectorAll('header,nav,main,aside,footer,[role="banner"],[role="navigation"],[role="main"],[role="complementary"],[role="region"][aria-label],section[aria-label],section[aria-labelledby]')]
        .filter(visible).map(el => `${el.getAttribute('role') || el.tagName.toLowerCase()}: ${(el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') ? name(el).slice(0, 30) : '')).slice(0, 50)}`);
      // Lienzos 3D: deben tener una alternativa de texto (role="img" con nombre) o estar ocultos al lector con el contenido equivalente en texto.
      const canvases = [...document.querySelectorAll('canvas')].filter(visible).map(c => ({ id: c.id || c.parentElement?.id || '', role: c.getAttribute('role'), label: c.getAttribute('aria-label') || c.closest('[aria-label]')?.getAttribute('aria-label') || null, hidden: c.getAttribute('aria-hidden') }));
      const unnamed = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="slider"]')].filter(visible)
        .filter(el => !name(el) && !(el.labels?.length && [...el.labels].some(l => l.textContent.trim())) && !el.getAttribute('placeholder')).map(el => el.id || el.className || el.tagName);
      const live = [...document.querySelectorAll('[aria-live]:not([aria-live="off"]),[role="status"],[role="alert"],[role="log"],output')].map(el => el.id || el.className);
      return { h1: headings.filter(x => x.startsWith('h1')).length, headings, landmarks, canvases, unnamed, live };
    });
    // Registro de anuncios: cambios de texto en regiones vivas visibles (lo que leería un lector de pantalla).
    await page.addInitScript(() => {
      window.__ANUNCIOS__ = [];
      const record = el => { if (!el) return; const region = el.closest?.('[aria-live]:not([aria-live="off"]),[role="status"],[role="alert"],[role="log"],output'); if (!region || region.closest('[hidden]')) return;
        const text = region.textContent.trim().replace(/\s+/g, ' '); const id = region.id || region.className; const last = window.__ANUNCIOS__.findLast(a => a.id === id);
        if (text && (!last || last.text !== text)) window.__ANUNCIOS__.push({ t: performance.now(), id, text: text.slice(0, 160) }); };
      new MutationObserver(list => { for (const m of list) record(m.target.nodeType === 1 ? m.target : m.target.parentElement); })
        .observe(document, { subtree: true, childList: true, characterData: true });
    });
    await h.home();
    const s1 = await structure(); await snapshot('01_exploracion'); checks.exploracion = s1;
    await h.lab(); await h.model();
    checks.laboratorio = await structure(); await snapshot('02_laboratorio_elegir_sonda');
    await page.click('.lab-probe-card[data-probe-id="cassini"]'); await h.model(['nasa', 'procedural']);
    const mark = () => page.evaluate(() => window.__ANUNCIOS__.length);
    const since = async (from, label) => { const list = await page.evaluate(n => window.__ANUNCIOS__.slice(n), from);
      const span = list.length > 1 ? (list.at(-1).t - list[0].t) / 1000 : 0; return { label, count: list.length, perSecond: span > 0 ? +(list.length / span).toFixed(2) : null, sample: list.slice(0, 14).map(a => `${a.id}: ${a.text}`) }; };
    const announcements = [];
    let m0 = await mark(); checks.verdict = await prepare(h, 'A1'); announcements.push(await since(m0, 'calcular y enviar al Centro de Misión (la reproducción empieza sola)'));
    checks.reproducir = await structure(); await snapshot('03_reproducir_centro_de_mision');
    m0 = await mark(); await page.click('#mc-play'); checks.estadoDuranteReproduccion = [];
    for (let i = 0; i < 6; i++) { await h.wait(1000); checks.estadoDuranteReproduccion.push(await page.evaluate(() => [document.querySelector('#lab-ctx-state').textContent, document.querySelector('#mc-stage-status').textContent, document.querySelector('#mc-announcer')?.textContent ?? null])); }
    announcements.push(await since(m0, 'reproducir 6 s'));
    m0 = await mark(); await page.click('#mc-pause'); await h.wait(800); announcements.push(await since(m0, 'pausar'));
    m0 = await mark(); await page.click('.mc-camera-bar [data-camera="destination"]'); await h.wait(1500); announcements.push(await since(m0, 'cámara de destino'));
    m0 = await mark();
    await page.evaluate(() => { const t = document.querySelector('#mc-timeline'); t.value = String(Number(t.max)); t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); });
    await h.wait(1500); announcements.push(await since(m0, 'ir al final (llegada a Marte)'));
    checks.anuncios = announcements;
    checks.llegada = await structure(); await snapshot('04_llegada');
    // Teclado: la línea de tiempo se maneja con flechas y anuncia su valor.
    checks.lineaDeTiempo = await page.evaluate(() => { const t = document.querySelector('#mc-timeline');
      return { role: t.getAttribute('role') || t.type, label: t.getAttribute('aria-label') || t.labels?.[0]?.textContent?.trim() || null, valuetext: t.getAttribute('aria-valuetext') }; });
  });

  if (['all', 'modes'].includes(PART)) await session(1366, 768, 'm1366', async h => {
    const { page } = h;
    await h.home();
    await h.area('solar'); await h.wait(2500); await h.shot('01_sistema_solar');
    await h.area('voyager'); await h.wait(3500);
    // El modo histórico abre su bienvenida al entrar: se cierra como lo haría el usuario («Explorar libremente»).
    log.checks.historicWelcome = await page.locator('#historical-welcome-modal').evaluate(el => !el.hidden).catch(() => false);
    if (log.checks.historicWelcome) { await h.shot('02a_historico_bienvenida'); await page.click('#welcome-explore-free'); await h.wait(1200); }
    await h.shot('02_historico_voyager');
    await h.lab(); await h.model(); await h.shot('03_laboratorio_etapa1');
    await page.click('#lab-rail-toggle'); await h.wait(600);
    log.checks.railClosed = (await h.labState()).rail;
    await h.shot('04_laboratorio_panel_plegado');
  });
} finally {
  await browser.close(); await server?.close();
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, `stage17-browser-${PART}${ONLY ? `-${ONLY.join('_')}` : ''}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ shots: log.shots.length, errors: log.errors, overflow: log.overflow }, null, 2));
}
