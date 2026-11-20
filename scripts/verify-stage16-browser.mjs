// Etapa 16 — verificación en Chrome (sin interfaz, SwiftShader) de la coherencia del laboratorio con la flota y de la misión guiada.
// Uso: node scripts/verify-stage16-browser.mjs [flow|tools|responsive|all]  → capturas y registro JSON en evidence/stage16/
// (o en EVIDENCE_DIR). APP_URL reutiliza un servidor de desarrollo abierto. Una sola instancia de Chrome y de Vite a la vez,
// y sin editar src/ mientras se ejecuta contra un servidor compartido. Solo lee y pulsa la interfaz: no modifica datos.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve(process.env.EVIDENCE_DIR ?? 'evidence/stage16');
await fs.mkdir(out, { recursive: true });
const PART = process.argv[2] ?? 'all';
const PORT = 5190;
const server = process.env.APP_URL ? null : await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server?.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { part: PART, startedAt: new Date().toISOString(), shots: [], checks: {}, overflow: {}, errors: [] };
const URL = process.env.APP_URL ?? `http://localhost:${PORT}/`;

async function session(width, height, prefix, fn) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', e => log.errors.push(`${prefix}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') log.errors.push(`${prefix}: ${m.text()}`); });
  // Chrome sin interfaz con SwiftShader deja a veces de producir fotogramas tras cambiar de herramienta (reproducido también
  // con la versión 15.1, sin pérdida de contexto WebGL; un movimiento del ratón los reanuda) y entonces la comprobación de
  // «estabilidad» de Playwright no termina. Cada pulsación es un clic real del ratón en el centro del control, después de
  // comprobar lo que importa al usuario: visible, activo y sin nada encima (el punto recibe el clic). Si no, reintenta.
  let nudge = 0;
  page.click = async (selector, { timeout = 30000 } = {}) => {
    const until = Date.now() + timeout; let last = 'no encontrado';
    while (Date.now() < until) {
      await page.mouse.move(4 + (nudge ^= 1), 4);
      const hit = await page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (!el) return { ok: false, why: 'no encontrado' };
        if (el.disabled || el.closest('fieldset:disabled')) return { ok: false, why: 'desactivado' };
        // Como un usuario: solo se desplazan las zonas con barra; los contenedores con overflow oculto vuelven a su sitio.
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
    // Las esperas mueven el puntero (como un usuario) para que Chrome sin interfaz siga produciendo fotogramas y las
    // animaciones de entrada terminen antes de cada captura.
    async wait(ms) { const end = Date.now() + ms; while (Date.now() < end) { await page.mouse.move(4 + (nudge ^= 1), 4); await page.waitForTimeout(Math.max(0, Math.min(200, end - Date.now()))); } },
    reveal: selector => page.evaluate(sel => {
      const el = document.querySelector(sel); if (!el) return; const locked = [];
      for (let n = el.parentElement; n; n = n.parentElement) { const cs = getComputedStyle(n); if (/hidden|clip/.test(cs.overflowX + cs.overflowY)) locked.push([n, n.scrollTop, n.scrollLeft]); }
      el.scrollIntoView({ block: 'center' }); for (const [n, top, left] of locked) { n.scrollTop = top; n.scrollLeft = left; }
    }, selector),
    async shot(name, locator = null) {
      await h.wait(400); const file = `${prefix}_${name}.png`;
      // Si Chrome deja de producir fotogramas, la captura espera uno: se reintenta moviendo el puntero.
      for (let attempt = 1; ; attempt++) {
        try { await (locator ?? page).screenshot({ path: path.join(out, file), timeout: 10000 }); break; }
        catch (error) { if (attempt >= 4) throw error; await page.mouse.move(6 + attempt, 6); await page.waitForTimeout(300); }
      }
      log.shots.push(file);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (o > 0) log.overflow[file] = o;
    },
    text: async selector => (await page.locator(selector).first().textContent())?.trim(),
    async home(clear = false) {
      // Usuario nuevo: se borra la sonda activa guardada antes de la primera carga (una sola navegación, sin descargas cortadas).
      if (clear) await page.addInitScript(() => { try { if (!sessionStorage.getItem('stage16-clean')) { localStorage.removeItem('simulador:sonda-activa'); localStorage.removeItem('simulador:featured-collapsed'); sessionStorage.setItem('stage16-clean', '1'); } } catch {} });
      await page.goto(URL, { waitUntil: 'networkidle' });
      await h.wait(2000);
    },
    async area(id) {
      await page.click('#app-nav-toggle'); await page.waitForTimeout(250);
      await page.locator('#app-nav-panel').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
      await page.click(`#app-nav-panel button[data-area="${id}"]`); await page.waitForTimeout(1300);
    },
    async probe(id) { await page.selectOption('#lab-ctx-probe', id); await page.waitForTimeout(500); },
    guideStatus: () => page.evaluate(() => ({ step: document.querySelector('#lab-guide')?.dataset.step, title: document.querySelector('#lab-guide-title')?.textContent,
      status: document.querySelector('#lab-guide-status')?.textContent, eyebrow: document.querySelector('#lab-guide-step')?.textContent,
      target: document.querySelector('.lab-guide-target')?.id || document.querySelector('.lab-guide-target')?.className || null })),
    async waitStep(id, timeout = 200000) { await page.waitForFunction(step => document.querySelector('#lab-guide')?.dataset.step === step, id, { timeout }); await page.waitForTimeout(500); },
    async computeIntegrated() {
      await page.click('#im-compute');
      await page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 200000 });
      await page.waitForTimeout(400); return h.text('#im-verdict');
    },
    clipped: () => page.evaluate(() => [...document.querySelectorAll('#lab-ctx-design, #lab-ctx-mission, .lab-sections button, .lab-guide button, .im-outcome, #lab-tool-title')]
      .filter(el => el.offsetParent && el.scrollWidth > el.clientWidth + 1).map(el => `${el.id || el.className || el.tagName}: ${el.scrollWidth - el.clientWidth} px`))
  };
  try { await fn(h); } catch (error) { log.errors.push(`${prefix}: FALLO DEL GUION: ${error.message.split('\n').slice(0, 6).join(' | ')}`); }
  await page.close();
}

try {
  // 1. Misión guiada de principio a fin, entrando desde la portada como un usuario nuevo.
  if (['all', 'flow'].includes(PART)) await session(1366, 768, 'g1366', async h => {
    const { page } = h;
    await h.home(true);
    log.checks.featuredCards = await page.locator('.fm-card strong').allTextContents();
    await h.shot('00_portada');
    await page.click('.fm-card[data-card="guide"]'); await h.waitStep('intro', 30000);
    log.checks.guideIntro = await h.guideStatus();
    log.checks.nav = await page.locator('.lab-sections button').allTextContents();
    log.checks.defaultProbe = await page.locator('#lab-ctx-probe').inputValue();
    await page.waitForFunction(() => ['nasa', 'procedural'].includes(document.querySelector('#lab-assembly-status')?.dataset.state), null, { timeout: 90000 });
    await h.wait(700);
    await h.shot('01_guia_intro_hangar');
    await page.click('#lab-guide-next'); await h.waitStep('probe');
    await page.click('.lab-probe-card[data-probe-id="cassini"]'); await h.wait(900);
    log.checks.guideProbe = await h.guideStatus();
    log.checks.assemblyNote = await page.locator('#lab-assembly-note').evaluate(el => el.hidden ? null : el.textContent);
    await h.shot('02_guia_paso1_sonda');
    await page.click('#lab-guide-next'); await h.waitStep('planner');
    log.checks.guidePlannerBefore = await h.guideStatus();
    await h.shot('03_guia_paso2_resaltado');
    await page.click('.lab-sections button[data-planner-mode="integrated"]'); await h.wait(900);
    log.checks.guidePlannerAfter = await h.guideStatus();
    await page.click('#lab-guide-next'); await h.waitStep('scenario');
    // El escenario A1 ya viene elegido: el paso se marca hecho sin «Hazlo por mí».
    log.checks.guideScenario = await h.guideStatus();
    log.checks.scenarioValue = await page.locator('#im-scenario').inputValue();
    log.checks.outcomeA1 = await h.text('#im-outcome');
    await h.shot('04_guia_paso3_escenario');
    await page.click('#lab-guide-next'); await h.waitStep('compute');
    await page.click('#lab-guide-do'); await h.waitStep('play'); // «Hazlo por mí» calcula y avanza solo al terminar
    log.checks.guideVerdict = await h.text('#im-verdict');
    log.checks.chain = await page.locator('#im-chain li').evaluateAll(items => items.map(li => `${li.querySelector('strong')?.textContent} · ${li.dataset.tone}`));
    await h.shot('05_guia_paso5_calculada');
    await page.click('#im-execute');
    await page.waitForFunction(() => document.querySelector('#lab-guide-status')?.dataset.state === 'done', null, { timeout: 30000 });
    log.checks.guidePlayDone = await h.guideStatus();
    await page.click('#lab-guide-next'); await h.waitStep('done');
    log.checks.guideDone = await h.guideStatus();
    log.checks.centerContext = await h.text('#lab-ctx-mission');
    log.checks.landingContextHidden = await page.locator('#mc-context button[data-context="landing"]').evaluate(el => el.hidden);
    await h.wait(2500);
    await h.shot('06_guia_fin_centro');
    await page.click('#lab-guide-next'); await h.wait(300);
    log.checks.guideClosed = await page.locator('#lab-guide').evaluate(el => el.hidden);
    await page.click('#mc-pause').catch(() => {});
    await page.mouse.move(5, 4); await page.locator('#mc-events button', { hasText: /captura/i }).first().click().catch(() => {}); await h.wait(1800);
    await h.shot('07_centro_captura_marte');
    log.checks.centerHud = await h.text('#mc-hud');
  });

  // 2. Herramientas con las sondas en las que antes fallaban o confundían.
  if (['all', 'tools'].includes(PART)) await session(1600, 900, 't1600', async h => {
    const { page } = h;
    await h.home(true);
    await h.area('hangar');
    log.checks.mapGroups = await page.evaluate(() => [...document.querySelectorAll('#app-nav-panel .app-nav-group')].map(g => `${g.querySelector('h3').textContent}: ${[...g.querySelectorAll('strong')].map(s => s.textContent).join(', ')}`));
    await page.click('#app-nav-toggle'); await h.wait(400); await h.shot('10_mapa_areas'); await page.keyboard.press('Escape');
    // Lanzamiento: lanzador recomendado y explicación de capacidad.
    await page.click('.lab-sections button[data-lab-section="launch"]'); await h.wait(700);
    const launch = {};
    for (const id of ['cassini', 'juno', 'voyager', 'dawn']) {
      await h.probe(id);
      launch[id] = { preset: await page.locator('#ln-launcher').inputValue(), hint: await h.text('#ln-launcher-hint') };
      await page.click('#ln-calculate'); await h.wait(1200);
      launch[id].status = await h.text('#ln-results .mission-status'); launch[id].message = await h.text('#ln-message');
      launch[id].executeEnabled = await page.locator('#ln-execute').isEnabled();
      if (id === 'cassini') await h.shot('11_lanzamiento_cassini_pesado');
    }
    await h.probe('cassini'); await page.selectOption('#ln-launcher', 'demo-two-stage-v1'); await h.wait(300);
    await page.click('#ln-calculate'); await h.wait(1500);
    launch.cassiniLight = { status: await h.text('#ln-results .mission-status'), warning: await page.locator('#ln-results .lab-message').first().textContent().catch(() => null), hint: await h.text('#ln-launcher-hint') };
    await h.shot('12_lanzamiento_cassini_ligero_explicado');
    log.checks.launch = launch;
    // Tierra–Luna: solo la Luna, 100 000 km y consejo por sonda.
    await page.click('.lab-sections button[data-planner-mode="lunar"]'); await h.wait(1500);
    const lunar = { destinations: await page.locator('#mission-destination option').allTextContents(), altitude: await page.locator('#mission-altitude').inputValue() };
    for (const id of ['cassini', 'juno', 'voyager', 'dawn']) {
      await h.probe(id);
      lunar[id] = { advice: await h.text('#mission-probe-advice') };
      if (await page.locator('#mission-use-altitude').count()) { await page.click('#mission-use-altitude'); await h.wait(200); lunar[id].usedAltitude = await page.locator('#mission-altitude').inputValue(); }
      await page.click('#mission-calculate'); await h.wait(2500);
      lunar[id].status = await h.text('#mission-summary .mission-status'); lunar[id].executeEnabled = await page.locator('#mission-execute').isEnabled();
      lunar[id].executeTitle = await page.locator('#mission-execute').getAttribute('title');
      if (id === 'voyager') await h.shot('13_tierra_luna_voyager_150000');
      if (id === 'dawn') await h.shot('14_tierra_luna_dawn_no_verificable');
    }
    log.checks.lunar = lunar;
    // Interplanetario: Dawn ya no aparece como «suficiente»; satélites sin descensos operativos.
    await page.click('.lab-sections button[data-planner-mode="interplanetary"]'); await h.wait(1500);
    await h.probe('dawn');
    await page.click('#ip-search');
    await page.waitForFunction(() => !document.querySelector('#ip-search').disabled && document.querySelector('#ip-hangar')?.textContent, null, { timeout: 200000 }); await h.wait(500);
    log.checks.interplanetaryDawn = await h.text('#ip-hangar'); await h.reveal('#ip-hangar');
    await h.shot('15_interplanetario_dawn');
    await page.selectOption('#ip-destination', 'sat:502'); await h.wait(400);
    log.checks.europaInfo = await h.text('#ip-satellite'); await h.reveal('#ip-satellite');
    await h.shot('16_interplanetario_europa_info');
    // Misión completa: resultado esperado por sonda y C1 con Juno.
    await page.click('.lab-sections button[data-planner-mode="integrated"]'); await h.wait(900);
    const outcomes = {};
    for (const id of ['voyager', 'cassini', 'dawn', 'juno']) { await h.probe(id); for (const sc of ['A1', 'C1']) { await page.selectOption('#im-scenario', sc); await h.wait(250); outcomes[`${sc}_${id}`] = await h.text('#im-outcome'); } }
    log.checks.outcomes = outcomes;
    await h.probe('juno'); await page.selectOption('#im-scenario', 'C1'); await h.wait(300);
    log.checks.C1_juno = await h.computeIntegrated();
    await h.shot('17_mision_completa_C1_juno');
    await page.click('#im-advanced summary'); await h.wait(1200);
    await h.shot('18_mision_completa_ajustes_avanzados');
    // Demostración orbital: rótulo y regreso.
    log.checks.orbitalTitle = await page.locator('[data-lab-action="orbital"]').getAttribute('title');
    await page.click('[data-lab-action="orbital"]'); await h.wait(1500);
    log.checks.orbitalCrumb = await h.text('.app-crumb-leaf');
    await h.shot('19_demostracion_orbital');
    await page.click('#lab-return'); await h.wait(800);
    log.checks.returnedSection = await page.locator('#experimental-lab').getAttribute('data-section');
  });

  if (['all', 'responsive'].includes(PART)) {
    for (const [w, hgt] of [[320, 568], [375, 667], [390, 844], [768, 1024], [1280, 720], [1366, 768], [1920, 1080]]) {
      await session(w, hgt, `r${w}x${hgt}`, async h => {
        const { page } = h;
        await h.home(true);
        await h.area('guide'); await h.waitStep('intro', 30000);
        await page.waitForFunction(() => ['nasa', 'procedural'].includes(document.querySelector('#lab-assembly-status')?.dataset.state), null, { timeout: 90000 }); await h.wait(600);
        await h.shot('01_hangar_guia');
        log.checks[`r${w}x${hgt}_clipped_hangar`] = await h.clipped();
        // Ningún botón de la barra de secciones (incluida «Misión guiada») puede quedar fuera de la ventana.
        log.checks[`r${w}x${hgt}_nav_offscreen`] = await page.evaluate(() => [...document.querySelectorAll('#experimental-lab .lab-sections button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.right > innerWidth + 0.5 || r.left < -0.5); }).map(b => b.textContent.trim()));
        await page.click('#lab-guide-next'); await h.waitStep('probe'); await page.click('#lab-guide-next'); await h.waitStep('planner');
        await page.click('#lab-guide-do'); await h.waitStep('scenario', 15000);
        await h.shot('02_mision_completa_guia');
        await page.click('#lab-guide-min'); await h.wait(300);
        await h.shot('03_mision_completa_minimizada');
        log.checks[`r${w}x${hgt}_clipped_planner`] = await h.clipped();
        log.checks[`r${w}x${hgt}_doc`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      });
    }
  }
} finally {
  await browser.close(); await server?.close();
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, `stage16-browser-${PART}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ shots: log.shots.length, errors: log.errors, overflow: log.overflow }, null, 2));
}
