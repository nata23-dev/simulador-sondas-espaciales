// SUSTITUIDO en 15.1 para el Hangar: los pasos de piezas, adaptadores y variantes personalizadas ya no existen en la interfaz.
// Se conserva como evidencia del cierre de la etapa 15; la verificación vigente del Hangar es scripts/verify-stage15_1-browser.mjs.
// Etapa 15 — verificación en Chrome (sin interfaz, SwiftShader) del Hangar de herencia y del escenario de referencia hacia Europa.
// Uso: node scripts/verify-stage15-browser.mjs [flow|responsive|all]  → capturas y registro JSON en evidence/stage15/
// (o en EVIDENCE_DIR). Una sola instancia de Chrome y de Vite a la vez (memoria del equipo de revisión).
// Solo lee la interfaz: no modifica datos, efemérides ni resultados.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve(process.env.EVIDENCE_DIR ?? 'evidence/stage15');
await fs.mkdir(out, { recursive: true });
const PART = process.argv[2] ?? 'all';
// APP_URL reutiliza un servidor de desarrollo ya abierto (p. ej. http://localhost:5173/) en lugar de iniciar otro Vite.
const PORT = 5189;
const server = process.env.APP_URL ? null : await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server?.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { part: PART, startedAt: new Date().toISOString(), shots: [], checks: {}, overflow: {}, errors: [] };
const URL = process.env.APP_URL ?? `http://localhost:${PORT}/`;

async function session(width, height, prefix, fn, extra = {}) {
  const page = await browser.newPage({ viewport: { width, height }, ...extra });
  page.on('pageerror', e => log.errors.push(`${prefix}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') log.errors.push(`${prefix}: ${m.text()}`); });
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
    async pick(componentId) { await page.click(`#lab-catalog-list [data-component-id="${componentId}"]`); await page.waitForTimeout(250); },
    async addTo(socketId) { await page.selectOption('#lab-socket', socketId); await page.click('#lab-add'); await page.waitForTimeout(500); },
    async computeIntegrated(id) {
      await page.selectOption('#im-scenario', id); await page.click('#im-compute');
      await page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 180000 });
      await page.waitForTimeout(400);
    },
    async engineering() {
      return page.evaluate(() => ({
        status: document.querySelector('#lab-assessment strong')?.textContent,
        tone: document.querySelector('#lab-assessment')?.dataset.tone,
        errors: [...document.querySelectorAll('#lab-compatibility li[data-severity="error"]')].map(li => li.textContent.trim()),
        warnings: [...document.querySelectorAll('#lab-compatibility li[data-severity="warning"]')].map(li => li.textContent.trim()),
        metrics: Object.fromEntries([...document.querySelectorAll('#lab-metrics .lab-metric')].map(r => [r.querySelector('span').textContent, r.querySelector('strong').textContent]))
      }));
    }
  };
  try { await fn(h); } catch (error) { log.errors.push(`${prefix}: FALLO DEL GUION: ${error.message.split('\n').slice(0, 6).join(' | ')}`); }
  await page.close();
}

try {
  if (['all', 'flow'].includes(PART)) await session(1920, 1080, 'f1920', async h => {
    const { page } = h;
    await h.home();
    await h.area('hangar');
    // 1. Biblioteca histórica: fichas y modelos 3D de las cuatro sondas.
    await page.click('[data-hangar-mode="historical"]'); await h.wait(400);
    for (const id of ['voyager', 'cassini', 'dawn', 'juno']) {
      await page.click(`.lab-probe-card[data-probe-id="${id}"]`); await h.wait(300);
      await page.click('#lab-load-historical'); await h.wait(1500);
      log.checks[`historical_${id}`] = { stage: await h.text('#lab-stage-count'), ...(await h.engineering()) };
      await h.shot(`0${['voyager', 'cassini', 'dawn', 'juno'].indexOf(id) + 1}_historical_${id}`);
    }
    // 2. Cassini → variante personalizada.
    await page.click('.lab-probe-card[data-probe-id="cassini"]'); await h.wait(300);
    await page.click('#lab-create-variant'); await h.wait(1200);
    log.checks.variantName = await page.inputValue('#lab-design-name');
    log.checks.modeAfterVariant = await page.evaluate(() => document.querySelector('#experimental-lab').dataset.hangarMode);
    await h.shot('05_variant_created');
    // 3. Antena de Voyager (mismo herraje: sin adaptador).
    await page.selectOption('#lab-heritage-filter', 'voyager'); await h.wait(300);
    await h.pick('voy-hga'); await h.addTo('hga');
    log.checks.afterVoyagerHga = await h.engineering();
    await h.shot('06_variant_voyager_hga');
    // 4. Motor iónico de Dawn en el bus de Cassini: adaptador y conflicto de propelente → incompatibilidad eléctrica.
    await page.selectOption('#lab-heritage-filter', 'dawn'); await h.wait(300);
    await h.pick('dawn-ion');
    log.checks.ionSocketOptions = await page.locator('#lab-socket option').allTextContents();
    await h.addTo('main-engine');
    log.checks.adapterPrompt = await h.text('#lab-replacement');
    await h.shot('07_adapter_prompt');
    await page.locator('#lab-replacement button').first().click(); await h.wait(500);
    log.checks.propellantPrompt = await h.text('#lab-replacement');
    await h.shot('08_propellant_conflict');
    await page.locator('#lab-replacement button', { hasText: 'Reemplazar' }).first().click(); await h.wait(1200);
    log.checks.afterIon = await h.engineering();
    await h.shot('09_incompatible_ion_rtg');
    await h.area('engineering'); await h.wait(600);
    await h.shot('10_engineering_incompatible');
    await page.locator('#lab-assessment').scrollIntoViewIfNeeded(); await h.wait(300);
    await h.shot('10b_engineering_incompatible_details');
    await h.area('hangar'); await h.wait(600);
    // 5. Corrección: se vuelve al motor químico de Cassini (y a sus depósitos).
    await page.selectOption('#lab-heritage-filter', 'cassini'); await h.wait(300);
    await h.pick('cas-main-engine'); await h.addTo('main-engine');
    log.checks.correctionPrompt = await h.text('#lab-replacement');
    const replace = page.locator('#lab-replacement button', { hasText: 'Reemplazar' });
    if (await replace.count()) { await replace.first().click(); await h.wait(1200); }
    log.checks.afterCorrection = await h.engineering();
    await h.shot('11_corrected_variant');
    await h.area('engineering'); await h.wait(600);
    await h.shot('12_engineering_corrected');
    // 6. Planificador «Misión completa»: sobrevuelo (C1) y captura (C2) de Europa con la variante.
    await h.area('integrated');
    await h.computeIntegrated('C1');
    log.checks.C1 = { verdict: await h.text('#im-verdict'), phases: await page.locator('#im-phases .im-phase strong').allTextContents(), power: await h.text('#im-power') };
    await h.shot('13_integrated_C1_flyby');
    await h.computeIntegrated('C2');
    log.checks.C2 = { verdict: await h.text('#im-verdict'), moonCapture: await page.locator('#im-phases .im-phase', { hasText: 'Europa' }).allTextContents() };
    await h.shot('14_integrated_C2_capture_not_viable');
    log.checks.compareRows = await page.locator('#im-compare tbody tr').allTextContents();
    await page.locator('#im-compare').scrollIntoViewIfNeeded(); await h.wait(300);
    await h.shot('15_integrated_comparison');
    // 7. Centro de Misión con el sobrevuelo.
    await h.computeIntegrated('C1');
    await page.click('#im-execute'); await h.wait(1800); await page.click('#mc-pause'); await h.wait(300);
    log.checks.centerContext = await h.text('#lab-ctx-mission');
    log.checks.centerEvents = await page.locator('#mc-events button').allTextContents();
    await h.shot('16_center_C1');
    await page.locator('#mc-events button', { hasText: 'Máxima aproximación a Europa' }).first().click(); await h.wait(1200);
    log.checks.centerFlybyHud = await h.text('#mc-hud');
    await h.shot('17_center_C1_europa_closest');
    log.checks.centerFlybyEnergy = await h.text('#mc-energy-metrics');
    await page.evaluate(() => { document.querySelector('#mc-energy-metrics').closest('details').open = true; }); await h.wait(300);
    log.checks.centerEnergySummary = await page.evaluate(() => document.querySelector('#mc-energy-metrics').closest('details').querySelector('summary').textContent.trim());
    await page.locator('#mc-energy-metrics').scrollIntoViewIfNeeded(); await h.wait(300);
    await h.shot('17b_center_C1_energy', page.locator('#mc-energy-metrics'));
    await page.locator('#mc-events button', { hasText: 'Inserción en órbita de Júpiter' }).first().click(); await h.wait(1200);
    log.checks.centerJoiHud = await h.text('#mc-hud');
    log.checks.centerJoiEnergy = await h.text('#mc-energy-metrics');
    await h.shot('18_center_C1_joi');
    // 8. Perfiles de calidad gráfica.
    await h.area('solar'); await h.wait(800);
    await page.click('#view-menu > summary'); await h.wait(300);
    await page.click('[data-quality="bajo"]'); await h.wait(300);
    log.checks.qualityLow = { status: await h.text('[data-quality-status]'), canvas: await page.evaluate(() => { const c = document.querySelector('.scene-panel canvas'); return c ? [c.width, c.clientWidth] : null; }) };
    await page.click('[data-quality="alto"]'); await h.wait(300);
    log.checks.qualityHigh = { status: await h.text('[data-quality-status]'), canvas: await page.evaluate(() => { const c = document.querySelector('.scene-panel canvas'); return c ? [c.width, c.clientWidth] : null; }) };
    await h.shot('19_quality_menu', page.locator('#view-menu'));
    await page.click('[data-quality="auto"]'); await h.wait(200);
  });

  // Perfiles de calidad con una pantalla de densidad 2 (en densidad 1 todos los perfiles coinciden).
  if (['all', 'quality'].includes(PART)) await session(900, 700, 'q900dpr2', async h => {
    const { page } = h;
    await h.home();
    await page.click('#view-menu > summary'); await h.wait(300);
    const canvas = () => page.evaluate(() => { const c = [...document.querySelectorAll('.scene-panel canvas')].find(x => x.clientWidth > 0); return c ? { width: c.width, clientWidth: c.clientWidth, ratio: c.width / c.clientWidth } : null; });
    for (const q of ['bajo', 'medio', 'alto', 'auto']) {
      await page.click(`[data-quality="${q}"]`); await h.wait(400);
      log.checks[`quality_${q}`] = { status: await h.text('[data-quality-status]'), canvas: await canvas(), stored: await page.evaluate(() => localStorage.getItem('simulador:calidad-grafica')) };
    }
    await h.shot('01_quality_menu', page.locator('#view-menu'));
  }, { deviceScaleFactor: 2 });

  if (['all', 'responsive'].includes(PART)) {
    for (const [w, hgt] of [[320, 568], [375, 667], [390, 844], [768, 1024], [1280, 720], [1366, 768], [1920, 1080]]) {
      await session(w, hgt, `r${w}x${hgt}`, async h => {
        const { page } = h;
        await h.home();
        await h.area('hangar');
        await page.click('[data-hangar-mode="historical"]'); await h.wait(300);
        await page.click('.lab-probe-card[data-probe-id="juno"]'); await h.wait(300);
        await page.click('#lab-load-historical'); await h.wait(1500);
        await h.shot('01_hangar_juno');
        await page.locator('#lab-history-sheet').scrollIntoViewIfNeeded(); await h.wait(300);
        await h.shot('02_history_sheet');
        // Elementos que sobresalen de su contenedor (los paneles recortan, así que el documento no lo detecta).
        log.checks[`r${w}x${hgt}_hangarClipping`] = await page.evaluate(() => {
          const out = [];
          for (const [box, sel] of [['#lab-history-sheet', 'button, .lab-quality, a'], ['.lab-probe-card', '*'], ['.lab-catalog', 'button']]) {
            for (const container of document.querySelectorAll(box)) {
              const c = container.getBoundingClientRect(); if (!c.width) continue;
              for (const el of container.querySelectorAll(sel)) {
                const r = el.getBoundingClientRect();
                if (r.width && (r.right > c.right + 1 || r.left < c.left - 1)) out.push(`${box} > ${el.id || el.className || el.tagName}: ${Math.round(r.right - c.right)} px`);
              }
            }
          }
          return out;
        });
        await h.area('engineering'); await h.wait(700);
        await page.locator('#lab-power').scrollIntoViewIfNeeded(); await h.wait(300);
        await h.shot('03_engineering_power');
        log.checks[`r${w}x${hgt}`] = await page.evaluate(() => {
          const over = el => el && el.scrollWidth - el.clientWidth;
          return { docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            powerTableOverflow: over(document.querySelector('.lab-power-table')?.parentElement),
            sheetVisible: Boolean(document.querySelector('#lab-history-sheet')?.offsetParent) };
        });
      });
    }
  }
} finally {
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, `stage15-browser-${PART}.json`), JSON.stringify(log, null, 2));
  await browser.close(); await server?.close();
  console.log(JSON.stringify({ shots: log.shots.length, errors: log.errors, overflow: log.overflow }, null, 2));
}
