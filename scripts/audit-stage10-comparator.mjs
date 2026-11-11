import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const playwrightPath = path.join(process.env.LOCALAPPDATA,
  'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const root = path.resolve('evidence/voyager-stage10/comparator');
await fs.mkdir(root, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
});
const results = [];
try {
  for (const [width, height] of [[1920, 1080], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.locator('[data-mode-btn="historico"]').click();
    await page.locator('#historical-welcome-modal').waitFor({ state: 'visible' });
    await page.locator('#welcome-explore-free').click();
    if (await page.locator('#inspector-toggle').getAttribute('aria-expanded') === 'false') {
      await page.locator('#inspector-toggle').click();
    }
    await page.locator('#tab-history').click();
    if (!await page.locator('#historical-events-panel').evaluate(element => element.open)) {
      await page.locator('#historical-events-panel summary').click();
    }
    await page.locator('[data-event-id="v1-io-plume-1979"]').click();
    await page.locator('#hist-ev-photo-btn').click();
    await page.locator('#photo-comparator-panel').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#comp-photo-img')?.naturalWidth > 0,
      null, { timeout: 20000 });
    await page.waitForFunction(() => !window.__SIMULADOR_DIAGNOSTICO__
      ?.obtenerEstadoCamaraHistorica()?.transicionActiva, null, { timeout: 20000 });
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({
      title: document.querySelector('#comp-photo-title')?.textContent,
      photoLoaded: document.querySelector('#comp-photo-img')?.naturalWidth > 0,
      sourceUrl: document.querySelector('#comp-photo-link')?.href,
      fov: window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoCamaraHistorica()?.fovGrados,
      comparatorVisible: !document.querySelector('#photo-comparator-panel')?.hidden,
      width: document.documentElement.scrollWidth,
      viewport: innerWidth
    }));
    assert.ok(state.photoLoaded && state.comparatorVisible);
    assert.ok(state.sourceUrl.startsWith('https://'));
    assert.ok(state.width <= state.viewport + 1);
    assert.ok(Number.isFinite(state.fov));
    const file = `voyager1-io-comparator-${width}x${height}.png`;
    await page.screenshot({ path: path.join(root, file), fullPage: false });
    results.push({ file, ...state });
    await page.locator('#comp-close-btn').click();
    assert.equal(await page.locator('#photo-comparator-panel').isHidden(), true);
    await page.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(`Comparators verified: ${results.length}`);
