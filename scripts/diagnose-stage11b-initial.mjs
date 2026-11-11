import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightPath = path.join(process.env.LOCALAPPDATA,
  'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
});
const results = [];
try {
  for (const [width, height] of [[320, 568], [768, 1024]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle' });
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
    await page.waitForTimeout(900);
    const before = await page.evaluate(() => ({
      engine: window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoMotorHistorico(),
      snapshot: window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()?.timeLabels?.labelUtc,
      timeline: document.querySelector('#hist-clock-utc')?.textContent
    }));
    await page.locator('#hist-ev-photo-btn').click();
    await page.locator('#photo-comparator-panel').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotComparador());
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => {
      const d = window.__SIMULADOR_DIAGNOSTICO__;
      const snap = d.obtenerSnapshotComparador();
      const moon = snap.moons.Io?.state?.position;
      const probe = snap.probes['voyager-1']?.positionKm;
      const norm = v => Math.hypot(v.x, v.y, v.z);
      const toSun = { x: -moon.x, y: -moon.y, z: -moon.z };
      const toProbe = { x: probe.x - moon.x, y: probe.y - moon.y, z: probe.z - moon.z };
      const cosPhase = (toSun.x * toProbe.x + toSun.y * toProbe.y + toSun.z * toProbe.z) / norm(toSun) / norm(toProbe);
      const rect = selector => {
        const r = document.querySelector(selector)?.getBoundingClientRect();
        return r && { top:r.top, bottom:r.bottom, left:r.left, right:r.right, height:r.height };
      };
      return {
        engine: d.obtenerEstadoMotorHistorico(),
        sessionSnapshot: d.obtenerSnapshotHistorico()?.timeLabels?.labelUtc,
        comparisonSnapshot: snap.timeLabels?.labelUtc,
        comparisonJdTdb: snap.jdTdb,
        timeline: document.querySelector('#hist-clock-utc')?.textContent,
        sessionLabel: document.querySelector('#comp-session-date')?.textContent,
        photoLabel: document.querySelector('#comp-photo-date')?.textContent,
        camera: d.obtenerEstadoCamaraHistorica(),
        illumination: d.obtenerEstadoIluminacion(),
        geometry: { moon, probe, sunDistanceAu: norm(moon)/149597870.7,
          cosPhase, apparentLitFraction: (1+cosPhase)/2 },
        rects: { comparator: rect('#photo-comparator-panel'), card:rect('.comparator-card-a'),
          image:rect('#comp-photo-img'), caption:rect('#comp-photo-caption'),
          timeline:rect('#historical-timeline-panel') },
        errors: document.querySelector('#comp-geometry-telemetry')?.textContent
      };
    });
    results.push({ width, height, before, after });
    await page.close();
  }
} finally { await browser.close(); }
await fs.mkdir('evidence/voyager-stage11b', { recursive:true });
await fs.writeFile('evidence/voyager-stage11b/initial-diagnosis.json', JSON.stringify(results, null, 2)+'\n');
console.log(JSON.stringify(results.map(({width,height,before,after}) => ({width,height,before,
  after:{sessionSnapshot:after.sessionSnapshot,comparisonSnapshot:after.comparisonSnapshot,
    timeline:after.timeline,sessionLabel:after.sessionLabel,photoLabel:after.photoLabel,
    geometry:after.geometry,rects:after.rects,exposure:after.illumination.exposure}})),null,2));
