import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const playwrightPath = path.join(process.env.LOCALAPPDATA,
  'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const root = path.resolve('evidence/voyager-stage11/comparator');
await fs.mkdir(root, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
});
const results = [];
try {
  const sizes = [[1920, 1080], [1366, 768], [1280, 720], [768, 1024], [390, 844], [320, 568]];
  for (const [width, height] of (process.env.STAGE11_MOBILE_ONLY ? sizes.slice(-2) : sizes)) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(process.env.VOYAGER_E2E_URL ?? 'http://127.0.0.1:5174/', { waitUntil: 'networkidle' });
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
    await page.waitForFunction(() => !window.__SIMULADOR_DIAGNOSTICO__
      ?.obtenerEstadoCamaraHistorica()?.transicionActiva, null, { timeout: 20000 });
    await page.waitForTimeout(700);
    const before = await page.evaluate(() => ({
      engine: window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoMotorHistorico(),
      camera: window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoCamaraHistorica()
    }));
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
      viewport: innerWidth,
      camera: window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoCamaraHistorica(),
      canvas: { width: document.querySelector('canvas')?.clientWidth, height: document.querySelector('canvas')?.clientHeight },
      timeline: document.querySelector('#historical-timeline-panel')?.textContent?.slice(0,100)
    }));
    assert.ok(state.photoLoaded && state.comparatorVisible);
    assert.ok(state.sourceUrl.startsWith('https://'));
    assert.ok(state.width <= state.viewport + 1);
    assert.ok(Number.isFinite(state.fov));
    const aspect = state.canvas.width / state.canvas.height;
    const expectedVertical = aspect >= 1 ? 0.424
      : 2 * Math.atan(Math.tan(0.424 * Math.PI / 360) / aspect) * 180 / Math.PI;
    assert.ok(Math.abs(state.fov - expectedVertical) < 1e-8);
    const expectedHorizontal = 2 * Math.atan(Math.tan(state.fov * Math.PI / 360) * aspect) * 180 / Math.PI;
    assert.ok(Math.abs(state.camera.fovHorizontalGrados - expectedHorizontal) < 1e-8);
    const file = `voyager1-io-photo-${width}x${height}.png`;
    await page.screenshot({ path: path.join(root, file), fullPage: false });
    results.push({ file, ...state });
    if (width <= 760) {
      await page.locator('#comp-view-3d').click();
      assert.equal(await page.locator('.comparator-card-a').isVisible(), false);
      assert.equal(await page.locator('.comparator-banner-b').isVisible(), true);
      const sceneVisible = await page.locator('canvas').first().isVisible();
      assert.equal(sceneVisible, true);
      const bFile = `voyager1-io-3d-${width}x${height}.png`;
      await page.screenshot({ path: path.join(root, bFile), fullPage: false });
      results.push({ file: bFile, view: '3d', sceneVisible });
      await page.locator('.comparator-details summary').click();
      await page.locator('#comp-fov-zoom-btn').click();
      const zoom = await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__
        ?.obtenerEstadoCamaraHistorica());
      assert.equal(zoom.fovTipo, 'zoom_visual_vertical');
      assert.ok(Math.abs(zoom.fovGrados - 0.35) < 1e-12);
      const zoomFile = `voyager1-io-3d-zoom-${width}x${height}.png`;
      await page.screenshot({ path: path.join(root, zoomFile), fullPage: false });
      results.push({ file: zoomFile, view: '3d-zoom', camera: zoom });
      await page.locator('#comp-minimize-btn').click();
      assert.equal(await page.locator('#photo-comparator-panel').getAttribute('data-view'), 'minimizado');
      await page.locator('#comp-minimize-btn').click();
      await page.locator('#comp-view-3d').click();
    }
    await page.locator('#comp-photo-select').selectOption('v1-titan-haze-1980');
    assert.match(await page.locator('#comp-photo-title').textContent(), /Titán/);
    await page.locator(width <= 760 ? '#comp-mobile-close-btn' : '#comp-close-btn').click();
    assert.equal(await page.locator('#photo-comparator-panel').isHidden(), true);
    const after = await page.evaluate(() => ({
      engine: window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoMotorHistorico(),
      camera: window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoCamaraHistorica()
    }));
    assert.equal(after.engine.jdTdb, before.engine.jdTdb);
    assert.equal(after.engine.selectedProbeId, before.engine.selectedProbeId);
    assert.equal(after.camera.modo, before.camera.modo);
    results.push({ width, height, restoration: { before, after } });
    await page.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(`Comparators verified: ${results.length}`);
