import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const modulePath = path.join(process.env.LOCALAPPDATA,
  'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const output = path.resolve('evidence/voyager-stage7b');
const chromePath = process.env.CHROME_BIN || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: chromePath,
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
const results = [], errors = [];
try {
  for (const [width, height] of [[1366, 768], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.locator('[data-mode-btn="experimental"]').click();
    await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion() === 'experimental');
    const experimental = await page.evaluate(() => ({
      mode: window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion(),
      illumination: window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoIluminacion()
    }));
    assert.equal(experimental.mode, 'experimental');
    assert.equal(experimental.illumination.outputColorSpace, 'srgb');
    await page.screenshot({ path: path.join(output, 'after', `experimental-${width}x${height}.png`) });
    await page.locator('[data-mode-btn="exploracion"]').click();
    await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion() === 'exploracion');
    await page.locator('#planet-select').evaluate(element => {
      element.value = 'Titan';
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#explore-button').evaluate(element => element.click());
    await page.waitForFunction(() => {
      const camera = window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica();
      return camera.objetoExteriorSeleccionado === 'Titan' && !camera.transicionActiva;
    }, null, { timeout: 30000 });
    if (await page.locator('#inspector-toggle').getAttribute('aria-expanded') === 'true')
      await page.locator('#inspector-close').click();
    await page.waitForTimeout(800);
    const titan = await page.evaluate(() => ({
      moon: window.__SIMULADOR_DIAGNOSTICO__.obtenerLunas().seleccionada,
      mode: window.__SIMULADOR_DIAGNOSTICO__.obtenerModoOperacion(),
      camera: window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica()
    }));
    results.push({ width, height, experimental, titan });
    if (titan.moon === 'Titan') await page.screenshot({
      path: path.join(output, 'after', `titan-exploration-${width}x${height}.png`)
    });
    await page.close();
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(output, 'mode-smoke.json'), JSON.stringify({ results, errors }, null, 2) + '\n');
console.log('MODE_SMOKE', results.length, 'ERRORS', errors.length,
  'TITAN_SELECTION', results.map(result => result.titan.moon).join(','));
if (errors.length) process.exitCode = 1;
