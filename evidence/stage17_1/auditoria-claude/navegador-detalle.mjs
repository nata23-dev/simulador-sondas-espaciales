// Auditoría de la etapa 17.1 (Claude, 20-11-2026) · parte de navegador. Pruebas ADVERSARIAS que ni las pruebas unitarias ni la
// regresión `verify-stage17-browser.mjs` ejercitaban: restauración de la escala exploratoria, escena frente a Horizons en instantes
// exactos, carrera al salir mientras cargan las efemérides, paso directo al modo histórico, fugas en ciclos repetidos, teclado,
// 320 px e invalidación al cambiar de sonda. El arnés de sesión (clic real, esperas) se copia del guion de verificación.
// Uso (desde la raíz): GPU=1 node evidence/stage17_1/auditoria-claude/navegador.mjs → navegador-detalle.json
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve('evidence/stage17_1/auditoria-claude');
await fs.mkdir(out, { recursive: true });
const PART = process.argv[2] ?? 'all';
const ONLY = process.env.ONLY_SIZES ? process.env.ONLY_SIZES.split(',') : null;
const PORT = 5193;
const server = process.env.APP_URL ? null : await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server?.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  // GPU=1: GPU real por Direct3D 11 (revisión con hardware); por defecto, SwiftShader (reproducible en cualquier equipo).
  args: process.env.GPU === '1' ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { auditoria: '17.1 · Claude · detalle', part: PART, gpu: process.env.GPU === '1', startedAt: new Date().toISOString(), shots: [], checks: {}, overflow: {}, errors: [] };
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
    async tab(id) { await page.click(`#lab-tabs [data-lab-tab="${id}"]`); await h.wait(700); },
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

// ------------------------------------------------------------------ pruebas de la auditoría
const diag = page => page.evaluate(() => { const d = window.__SIMULADOR_DIAGNOSTICO__;
  return { mission: d.obtenerEstadoMisionEscenaPrincipal(), scene: d.obtenerDiagnosticoEscena(), mode: d.obtenerModoOperacion(),
    labScene: document.querySelector('#app').dataset.labScene ?? null, clip: document.querySelector('#solar-system').style.clipPath || '',
    badge: document.querySelector('#scale-mode-badge')?.textContent.trim(), scalePressed: document.querySelector('#scale-mode-button')?.getAttribute('aria-pressed'),
    valuetext: document.querySelector('#mc-timeline')?.getAttribute('aria-valuetext') ?? null, ctxState: document.querySelector('#lab-ctx-state')?.textContent.trim() ?? null,
    hudPhase: document.querySelector('#mc-hud-phase')?.textContent.trim() ?? null }; });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const maxPlanetDiff = (a, b) => Math.max(...Object.keys(a).map(n => dist(a[n], b[n])));
const seek = (page, t) => page.evaluate(t => { const i = document.querySelector('#mc-timeline'); i.value = String(t); i.dispatchEvent(new Event('input', { bubbles: true })); }, t);
async function toPlay(h) {
  await h.lab(); await h.model();
  await h.page.click('.lab-probe-card[data-probe-id="cassini"]'); await h.model(['nasa', 'procedural']);
  const verdict = await prepare(h, 'A1');
  await h.page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMisionEscenaPrincipal()?.controlling === true, null, { timeout: 60000 });
  await h.wait(1200); return verdict;
}
async function metrics(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.enable');
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
  const { metrics: m } = await cdp.send('Performance.getMetrics'); await cdp.detach();
  const pick = k => m.find(x => x.name === k)?.value;
  return { heapMB: +(pick('JSHeapUsedSize') / 1048576).toFixed(2), listeners: pick('JSEventListeners'), nodes: pick('Nodes') };
}
const A = log.checks;
try {
  // 1 · Ventana de la escena en pantallas estrechas: zona libre, recorte y si el lienzo principal asoma fuera de la ventana.
  for (const [w, hgt] of [[320, 568], [375, 667], [390, 844]]) {
    await session(w, hgt, `det${w}`, async h => {
      const { page } = h;
      await h.home(); await toPlay(h);
      await page.locator('#lab-mission-center .mc-stage').evaluate(el => el.scrollIntoView({ block: 'start' })); await h.wait(1200);
      const geo = await page.evaluate(() => {
        const rect = el => { const r = el?.getBoundingClientRect(); return r && r.width ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) } : null; };
        const host = document.querySelector('#lab-mission-center'), stage = host.querySelector('.mc-stage');
        const bar = host.querySelector('.mc-camera-bar'), transport = host.querySelector('#mc-transport:not([hidden])'), hud = host.querySelector('#mc-hud:not([hidden])');
        const s = rect(stage), b = rect(bar), t = rect(transport);
        const top = (b ? b.bottom : s.top + 56) + 8, bottom = (t ? t.top : s.bottom - 48) - 8;
        return { stage: s, cameraBar: b, transport: t, hud: rect(hud), zonaLibreAltoPx: bottom - top, zonaLibreAnchoPx: s.right - 16 - (s.left + 16),
          clip: document.querySelector('#solar-system').style.clipPath || '' };
      });
      // ¿Asoma el lienzo principal fuera de la ventana? Se compara la franja justo encima de la ventana con el lienzo visible y oculto
      // (estilo inyectado solo en esta prueba; no modifica el código).
      const s = geo.stage, band = { x: 0, y: Math.max(0, s.top - 14), width: w, height: 12 };
      await page.mouse.move(2, 2); await page.waitForTimeout(300);
      const withCanvas = await page.screenshot({ clip: band });
      const style = await page.addStyleTag({ content: '#solar-system { visibility: hidden !important; }' }); await page.waitForTimeout(300);
      const without = await page.screenshot({ clip: band });
      await style.evaluate(el => el.remove()); await page.waitForTimeout(300);
      const belowBand = { x: 0, y: Math.min(hgt - 13, s.bottom + 2), width: w, height: 12 };
      const withBelow = await page.screenshot({ clip: belowBand });
      const style2 = await page.addStyleTag({ content: '#solar-system { visibility: hidden !important; }' }); await page.waitForTimeout(300);
      const withoutBelow = await page.screenshot({ clip: belowBand });
      await style2.evaluate(el => el.remove());
      log.checks[`ventana${w}`] = { ...geo, lienzoAsomaEncima: !withCanvas.equals(without), lienzoAsomaDebajo: !withBelow.equals(withoutBelow) };
      await h.shot('ventana');
    });
  }

  // 2 · Nodos del DOM que crecen con cada cálculo: qué contenedor los acumula. 3 · Anillo de foco con Tab real.
  await session(1366, 768, 'det1366', async h => {
    const { page } = h;
    await h.home(); await toPlay(h);
    const count = () => page.evaluate(() => {
      const c = sel => document.querySelector(sel)?.getElementsByTagName('*').length ?? null;
      return { total: document.getElementsByTagName('*').length, labIntegrated: c('#lab-integrated'), center: c('#lab-mission-center'), mcEvents: c('#mc-events'),
        lab: c('#experimental-lab'), labelsLayer: c('.labels-layer') ?? c('#planet-labels') ?? null, body: document.body.children.length,
        solarSystem: c('#solar-system') };
    });
    const series = [await count()];
    for (let i = 0; i < 6; i++) { await prepare(h, 'A1'); await h.stage('play'); await h.wait(1200); series.push(await count()); }
    log.checks.nodosPorCalculo = series;
    // Foco con teclado real: desde el control anterior a «Iniciar», Tab lleva el foco a «Iniciar».
    await page.mouse.click(5, 300); await page.waitForTimeout(200);
    const prev = await page.evaluate(() => { const all = [...document.querySelectorAll('#lab-mission-center button, #lab-mission-center input, #lab-mission-center select')].filter(e => !e.disabled && e.offsetParent);
      const i = all.indexOf(document.querySelector('#mc-play')); return i > 0 ? (all[i - 1].id || all[i - 1].dataset.camera || all[i - 1].dataset.mcPanel || null) : null; });
    const rings = [];
    await page.evaluate(() => document.querySelector('#mc-timeline').focus());
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    for (let i = 0; i < 12; i++) {
      rings.push(await page.evaluate(() => { const el = document.activeElement, cs = getComputedStyle(el);
        return { id: el.id || el.dataset.camera || el.dataset.mcPanel || el.className, focusVisible: el.matches(':focus-visible'),
          ring: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none') }; }));
      await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(60);
    }
    log.checks.anilloFoco = { previo: prev, recorrido: rings };
  });
} finally {
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'navegador-detalle.json'), JSON.stringify(log, null, 1));
  await browser.close(); await server?.close();
  console.log(`errores: ${log.errors.length}`); for (const e of log.errors) console.log(' ', e);
}
