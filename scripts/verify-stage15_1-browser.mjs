// Etapa 15.1 — verificación en Chrome (sin interfaz, SwiftShader) de la flota fija con modelos 3D oficiales de NASA.
// Uso: node scripts/verify-stage15_1-browser.mjs [flow|responsive|all]  → capturas y registro JSON en evidence/stage15_1/
// (o en EVIDENCE_DIR). APP_URL reutiliza un servidor de desarrollo abierto. Una sola instancia de Chrome y de Vite a la vez.
// Solo lee la interfaz: no modifica datos, efemérides ni resultados.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve(process.env.EVIDENCE_DIR ?? 'evidence/stage15_1');
await fs.mkdir(out, { recursive: true });
const PART = process.argv[2] ?? 'all';
const PORT = 5189;
const server = process.env.APP_URL ? null : await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server?.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { part: PART, startedAt: new Date().toISOString(), shots: [], checks: {}, overflow: {}, errors: [], requests: [] };
const URL = process.env.APP_URL ?? `http://localhost:${PORT}/`;
const PROBES = ['voyager', 'cassini', 'dawn', 'juno'];

async function session(width, height, prefix, fn, extra = {}) {
  const page = await browser.newPage({ viewport: { width, height }, ...extra });
  page.on('pageerror', e => log.errors.push(`${prefix}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') log.errors.push(`${prefix}: ${m.text()}`); });
  page.on('response', r => { if (/\.(glb|wasm)$|draco_wasm_wrapper/.test(r.url())) log.requests.push(`${prefix}: ${r.status()} ${r.url().replace(URL, '/')}`); });
  const h = {
    page,
    wait: ms => page.waitForTimeout(ms),
    async shot(name, locator = null) {
      const file = `${prefix}_${name}.png`;
      await (locator ?? page).screenshot({ path: path.join(out, file) }); log.shots.push(file);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (o > 0) log.overflow[file] = o;
    },
    text: async selector => (await page.locator(selector).first().textContent())?.trim(),
    async home() { await page.goto(URL, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000); },
    async area(id) {
      await page.click('#app-nav-toggle'); await page.waitForTimeout(250);
      await page.locator('#app-nav-panel').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
      await page.click(`#app-nav-panel button[data-area="${id}"]`); await page.waitForTimeout(1300);
    },
    // Espera a que el Hangar indique el modelo oficial (o el respaldo procedimental si la descarga falla).
    async modelReady() {
      await page.waitForFunction(() => ['nasa', 'procedural'].includes(document.querySelector('#lab-assembly-status')?.dataset.state), null, { timeout: 90000 });
      await page.waitForTimeout(700);
      return page.evaluate(() => document.querySelector('#lab-assembly-status').dataset.state);
    },
    async computeIntegrated(id) {
      await page.selectOption('#im-scenario', id); await page.click('#im-compute');
      await page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 180000 });
      await page.waitForTimeout(400);
      return h.text('#im-verdict');
    },
    clipping: () => page.evaluate(() => {
      const outside = [];
      for (const [box, sel] of [['#lab-history-sheet', 'button, .lab-quality, a'], ['.lab-probe-card', '*'], ['.lab-context-probe', 'select, span']]) {
        for (const container of document.querySelectorAll(box)) {
          const c = container.getBoundingClientRect(); if (!c.width) continue;
          for (const el of container.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect();
            if (r.width && (r.right > c.right + 1 || r.left < c.left - 1)) outside.push(`${box} > ${el.id || el.className || el.tagName}: ${Math.round(r.right - c.right)} px`);
          }
        }
      }
      return outside;
    })
  };
  try { await fn(h); } catch (error) { log.errors.push(`${prefix}: FALLO DEL GUION: ${error.message.split('\n').slice(0, 6).join(' | ')}`); }
  await page.close();
}

try {
  if (['all', 'flow'].includes(PART)) await session(1920, 1080, 'f1920', async h => {
    const { page } = h;
    await h.home();
    await page.evaluate(() => { try { localStorage.removeItem('simulador:sonda-activa'); } catch {} });
    await h.home();
    await h.area('hangar');
    // 1. El Hangar ya no ofrece piezas, adaptadores, plantillas ni importación.
    log.checks.removedControls = await page.evaluate(() => ['#lab-catalog-list', '#lab-socket', '#lab-add', '#lab-replacement', '#lab-preset', '#lab-import', '#lab-export', '#lab-save', '#lab-new', '[data-hangar-mode]', '#lab-create-variant',
      // 15.1: módulo de propulsión y módulo de aterrizaje retirados (Planificador y sección «Descenso y aterrizaje»).
      '#im-module', '#im-module-prop', '#im-lander', '#im-landing', '[data-lab-section="landing"]', '#lab-landing', '#app-nav-panel button[data-area="landing"]', '#ld-payload']
      .filter(sel => document.querySelector(sel)));
    log.checks.defaultProbe = await page.locator('#lab-ctx-probe').inputValue();
    // 2. Las cuatro sondas con su modelo oficial de NASA.
    for (const id of PROBES) {
      await page.click(`.lab-probe-card[data-probe-id="${id}"]`);
      const state = await h.modelReady();
      log.checks[`model_${id}`] = { state, stage: await h.text('#lab-stage-count'), status: await h.text('#lab-assembly-status'),
        header: await page.locator('#lab-ctx-probe').inputValue(), context: await h.text('#lab-ctx-design'),
        verdict: await h.text('#lab-assessment strong'), credit: await h.text('.lab-model-credit'), message: await h.text('#lab-message') };
      await h.shot(`0${PROBES.indexOf(id) + 1}_hangar_${id}`);
    }
    await page.locator('#lab-history-sheet').scrollIntoViewIfNeeded(); await h.wait(300);
    await h.shot('05_sheet_juno', page.locator('#lab-history-sheet'));
    // 3. La sonda activa se conserva al recargar.
    await h.home(); await h.area('hangar');
    log.checks.persistedProbe = await page.locator('#lab-ctx-probe').inputValue();
    // 4. Elegir la sonda desde la cabecera en el Planificador y calcular C1 con Voyager (fracaso explicado) y Cassini (cadena completa).
    await h.area('integrated');
    log.checks.scenarios = await page.locator('#im-scenario option').allTextContents();
    // Marte A1 con Cassini: captura elíptica completa según el modelo.
    await page.selectOption('#lab-ctx-probe', 'cassini'); await h.wait(600);
    log.checks.A1_cassini = await h.computeIntegrated('A1');
    log.checks.A1_note = await h.text('#im-scenario-note');
    await h.shot('06a_integrated_A1_cassini');
    await page.selectOption('#lab-ctx-probe', 'voyager'); await h.wait(600);
    log.checks.integratedDesignVoyager = await h.text('#im-design');
    log.checks.C1_voyager = await h.computeIntegrated('C1');
    await h.shot('06_integrated_C1_voyager');
    await page.selectOption('#lab-ctx-probe', 'cassini'); await h.wait(600);
    log.checks.afterSwitchMessage = await h.text('#im-verdict');
    log.checks.C1_cassini = await h.computeIntegrated('C1');
    await h.shot('07_integrated_C1_cassini');
    // 5. Centro de Misión con el modelo de Cassini en seguimiento exterior.
    await page.click('#im-execute'); await h.wait(2000); await page.click('#mc-pause'); await h.wait(300);
    await page.locator('#mc-events button', { hasText: 'Máxima aproximación a Europa' }).first().click(); await h.wait(1500);
    await page.click('.mc-camera-bar button[data-camera="exterior"]'); await h.wait(2500);
    log.checks.centerHud = await h.text('#mc-hud');
    log.checks.centerResources = await page.locator('#mc-resource-metrics').evaluate(el => el.textContent);
    await h.shot('08_center_cassini_exterior');
    await page.click('.mc-camera-bar button[data-camera="cinematic"]').catch(() => {}); await h.wait(2500);
    await h.shot('09_center_cassini_cinematic');
  });

  if (['all', 'responsive'].includes(PART)) {
    for (const [w, hgt] of [[320, 568], [375, 667], [390, 844], [768, 1024], [1280, 720], [1366, 768], [1920, 1080]]) {
      await session(w, hgt, `r${w}x${hgt}`, async h => {
        const { page } = h;
        await h.home();
        await h.area('hangar');
        await page.click('.lab-probe-card[data-probe-id="juno"]');
        log.checks[`r${w}x${hgt}_state`] = await h.modelReady();
        await h.shot('01_hangar_juno');
        await page.locator('#lab-history-sheet').scrollIntoViewIfNeeded(); await h.wait(300);
        await h.shot('02_sheet');
        log.checks[`r${w}x${hgt}_clipping`] = await h.clipping();
        log.checks[`r${w}x${hgt}_doc`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      });
    }
  }
} finally {
  await browser.close(); await server?.close();
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, `stage15_1-browser-${PART}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ shots: log.shots.length, errors: log.errors, overflow: log.overflow }, null, 2));
}
