import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightPath = path.join(process.env.LOCALAPPDATA,
  'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw Error('Usage: node capture-stage7b.mjs before|after');
const output = path.resolve('evidence/voyager-stage7b', phase);
await fs.mkdir(output, { recursive: true });
const chromePath = process.env.CHROME_BIN || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
});
const errors = [], shots = [];
const url = process.env.VOYAGER_E2E_URL ?? 'http://127.0.0.1:5173/';
async function capture(page, name) {
  if (phase === 'after' && name.startsWith('planet-')) {
    await page.waitForFunction(() => !window.__SIMULADOR_DIAGNOSTICO__
      ?.obtenerEstadoCamaraHistorica()?.transicionActiva, null, { timeout: 30000 });
  }
  await page.waitForTimeout(1200);
  const result = await page.evaluate(async () => {
    const timings = [];
    await new Promise(resolve => {
      let previous, count = 0;
      const step = now => {
        if (previous !== undefined) timings.push(now - previous);
        previous = now;
        if (++count < 45) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    const diagnostic = window.__SIMULADOR_DIAGNOSTICO__;
    return {
      mode: diagnostic?.obtenerModoOperacion(),
      camera: diagnostic?.obtenerEstadoCamaraHistorica(),
      historicalJdTdb: diagnostic?.obtenerSnapshotHistorico()?.jdTdb ?? null,
      illumination: diagnostic?.obtenerEstadoIluminacion(),
      medianFrameMs: timings.sort((a, b) => a - b)[Math.floor(timings.length / 2)],
      p95FrameMs: timings[Math.floor(timings.length * 0.95)]
    };
  });
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file), fullPage: false });
  shots.push({ name, file: `evidence/voyager-stage7b/${phase}/${file}`, ...result });
  console.log(phase, name, result.medianFrameMs?.toFixed(1));
}
try {
  for (const [width, height] of [[1366, 768], [390, 844]]) {
    const mobile = width < 500;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const suffix = `${width}x${height}`;
    page.on('pageerror', error => errors.push({ suffix, kind: 'pageerror', message: error.message }));
    page.on('console', message => {
      if (message.type() === 'error') errors.push({ suffix, kind: 'console', message: message.text() });
    });
    page.on('requestfailed', request => errors.push({ suffix, kind: 'request', url: request.url(), message: request.failure()?.errorText }));
    await page.goto(url, { waitUntil: 'networkidle' });
    await capture(page, `overview-${suffix}`);
    if (!mobile) {
      for (const name of ['Mercurio', 'Venus', 'Tierra', 'Marte', 'Jupiter', 'Saturno', 'Urano', 'Neptuno']) {
        await page.locator('#planet-select').evaluate((element, value) => {
          element.value = value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }, name);
        await page.locator('#explore-button').evaluate(element => element.click());
        await capture(page, `planet-${name.toLowerCase()}-${suffix}`);
      }
      await page.locator('#perspective-button').click();
      await capture(page, `cinematic-${suffix}`);
    } else {
      await page.locator('#planet-select').evaluate(element => {
        element.value = 'Tierra';
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.locator('#explore-button').evaluate(element => element.click());
      await capture(page, `planet-tierra-${suffix}`);
    }
    await page.locator('[data-mode-btn="historico"]').click();
    await page.locator('#historical-welcome-modal').waitFor({ state: 'visible' });
    await page.locator('#welcome-explore-free').click();
    for (const [eventId, target] of [
      ['v1-io-encounter-1979', 'io'], ['v1-titan-1980', 'titan'],
      ['v2-titania-1986', 'titania'], ['v2-miranda-1986', 'miranda'],
      ['v2-triton-1989', 'triton']
    ]) {
      if (await page.locator('#inspector-toggle').getAttribute('aria-expanded') === 'false')
        await page.locator('#inspector-toggle').click();
      await page.locator('#tab-history').click();
      if (!await page.locator('#historical-events-panel').evaluate(element => element.open))
        await page.locator('#historical-events-panel summary').click();
      await page.locator(`[data-event-id="${eventId}"]`).click();
      await page.waitForFunction(id => window.__SIMULADOR_DIAGNOSTICO__
        ?.obtenerEstadoCamaraHistorica()?.datasetContextoLocal === id, eventId, { timeout: 20000 });
      await page.locator('#inspector-close').click();
      await capture(page, `moon-${target}-${suffix}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(path.resolve('evidence/voyager-stage7b', `${phase}-results.json`),
  JSON.stringify({ phase, url, shots, errors }, null, 2) + '\n');
console.log('CAPTURES', shots.length, 'ERRORS', errors.length);
if (errors.length) process.exitCode = 1;
