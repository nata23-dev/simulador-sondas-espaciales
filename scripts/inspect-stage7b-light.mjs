import path from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = path.join(process.env.LOCALAPPDATA,
  'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const chromePath = process.env.CHROME_BIN || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: chromePath,
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('console', message => { if (message.type() === 'error') console.log('CONSOLE', message.text()); });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.locator('[data-mode-btn="historico"]').click();
  await page.locator('#welcome-explore-free').click();
  for (const id of ['v1-io-encounter-1979', 'v1-titan-1980', 'v2-triton-1989']) {
    if (await page.locator('#inspector-toggle').getAttribute('aria-expanded') === 'false')
      await page.locator('#inspector-toggle').click();
    await page.locator('#tab-history').click();
    if (!await page.locator('#historical-events-panel').evaluate(element => element.open))
      await page.locator('#historical-events-panel summary').click();
    await page.locator(`[data-event-id="${id}"]`).click();
    await page.waitForFunction(expected => window.__SIMULADOR_DIAGNOSTICO__
      .obtenerEstadoCamaraHistorica().datasetContextoLocal === expected, id);
    await page.locator('#inspector-close').click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `evidence/voyager-stage7b/after/steady-${id}.png` });
    console.log(id, JSON.stringify(await page.evaluate(() => ({
      illumination: window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoIluminacion(),
      camera: window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica()
    }))));
  }
} finally { await browser.close(); }
