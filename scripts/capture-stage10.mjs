import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightPath = path.join(process.env.LOCALAPPDATA,
  'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) {
  throw Error('Usage: node scripts/capture-stage10.mjs before|after');
}
const root = path.resolve('evidence/voyager-stage10');
const output = path.join(root, phase);
await fs.mkdir(output, { recursive: true });
const chromePath = process.env.CHROME_BIN || process.env.CHROME_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
});
const url = process.env.VOYAGER_E2E_URL ?? 'http://127.0.0.1:5173/';
const errors = [];
const shots = [];

async function capture(page, name) {
  await page.waitForFunction(() => !window.__SIMULADOR_DIAGNOSTICO__
    ?.obtenerEstadoCamaraHistorica()?.transicionActiva, null, { timeout: 30000 });
  await page.waitForTimeout(1300);
  await page.waitForFunction(() => !window.__SIMULADOR_DIAGNOSTICO__
    ?.obtenerEstadoCamaraHistorica()?.transicionActiva, null, { timeout: 30000 });
  const state = await page.evaluate(() => {
    const diag = window.__SIMULADOR_DIAGNOSTICO__;
    return {
      mode: diag?.obtenerModoOperacion(),
      camera: diag?.obtenerEstadoCamaraHistorica(),
      historicalJdTdb: diag?.obtenerSnapshotHistorico()?.jdTdb ?? null,
      illumination: diag?.obtenerEstadoIluminacion(),
      moonVisuals: diag?.obtenerEstadoLunasHistoricas?.() ?? null
    };
  });
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file), fullPage: false });
  shots.push({ name, file: `evidence/voyager-stage10/${phase}/${file}`, ...state });
  console.log(`${phase} ${name}`);
}

async function choosePlanet(page, name) {
  await page.locator('#planet-select').evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, name);
  await page.locator('#explore-button').evaluate(element => element.click());
}

async function chooseEvent(page, id) {
  if (await page.locator('#inspector-toggle').getAttribute('aria-expanded') === 'false') {
    await page.locator('#inspector-toggle').click();
  }
  await page.locator('#tab-history').click();
  if (!await page.locator('#historical-events-panel').evaluate(element => element.open)) {
    await page.locator('#historical-events-panel summary').click();
  }
  await page.locator(`[data-event-id="${id}"]`).click();
  await page.locator('#inspector-close').click();
}

try {
  for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844]]) {
    const suffix = `${width}x${height}`;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push({ suffix, type: 'pageerror', message: error.message }));
    page.on('console', message => {
      if (message.type() === 'error') errors.push({ suffix, type: 'console', message: message.text() });
    });
    page.on('requestfailed', request => errors.push({
      suffix, type: 'request', url: request.url(), message: request.failure()?.errorText
    }));
    await page.goto(url, { waitUntil: 'networkidle' });
    await capture(page, `solar-overview-${suffix}`);
    await choosePlanet(page, 'Mercurio');
    await capture(page, `inner-mercury-phase-${suffix}`);
    await choosePlanet(page, 'Tierra');
    await capture(page, `inner-earth-${suffix}`);
    await choosePlanet(page, 'Saturno');
    await capture(page, `outer-saturn-${suffix}`);
    await choosePlanet(page, 'Neptuno');
    await capture(page, `outer-neptune-${suffix}`);

    await page.locator('[data-mode-btn="historico"]').click();
    await page.locator('#historical-welcome-modal').waitFor({ state: 'visible' });
    await page.locator('#welcome-explore-free').click();
    for (const [eventId, name] of [
      ['v1-io-encounter-1979', 'voyager1-io'],
      ['v1-titan-1980', 'voyager1-titan'],
      ['v2-neptune-1989', 'voyager2-neptune']
    ]) {
      await chooseEvent(page, eventId);
      if (name !== 'voyager2-neptune') {
        await page.waitForFunction(id => window.__SIMULADOR_DIAGNOSTICO__
          ?.obtenerEstadoCamaraHistorica()?.datasetContextoLocal === id,
        eventId, { timeout: 20000 });
      } else {
        // Historical exterior views can follow an exploratory close-up. Let the
        // rendered planet radius converge to the scientific 1:1 scale first.
        await page.waitForTimeout(7000);
      }
      await capture(page, `${name}-${suffix}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(path.join(root, `${phase}-results.json`),
  JSON.stringify({ phase, url, chromePath, shots, errors }, null, 2) + '\n');
console.log(`CAPTURES ${shots.length} ERRORS ${errors.length}`);
if (errors.length) process.exitCode = 1;
