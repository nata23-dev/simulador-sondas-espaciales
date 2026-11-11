import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const playwrightPath = process.env.VOYAGER_PLAYWRIGHT_PATH
  ?? path.join(process.env.TEMP, 'voyager-stage8-playwright/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const output = path.resolve(process.env.VOYAGER_E2E_OUTPUT ?? 'evidence/voyager-stage8/browser');
await fs.mkdir(output, { recursive: true });
const chromePath = process.env.CHROME_BIN ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: chromePath, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
const missions = [
  { id: 'voyager-1', key: 'v1', before: 2444605.5, after: 2444605.500694444 },
  { id: 'voyager-2', key: 'v2', before: 2447767.833333333, after: 2447767.834027778 }
];
const report = { browser: 'Google Chrome', chromePath, results: [], interactions: [], errors: [] };

async function seek(page, jd) {
  await page.evaluate(async target => {
    const { HISTORICAL_MISSIONS_CATALOG } = await import('/src/science/VoyagerHistoricalMissions.js');
    const min = HISTORICAL_MISSIONS_CATALOG['voyager-2'].launchJdTdb;
    const max = 2461346.5;
    const range = document.querySelector('#hist-timeline-range');
    range.max = '1000000000000';
    range.value = String(Math.round((target - min) / (max - min) * Number(range.max)));
    range.dispatchEvent(new Event('input', { bubbles: true }));
  }, jd);
  await page.waitForFunction(target => {
    const actual = window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()?.jdTdb;
    return actual != null && Math.abs(actual - target) * 86400 < 0.25;
  }, jd, { timeout: 30000 });
  await page.waitForTimeout(150);
}

async function state(page, id) {
  return page.evaluate(missionId => {
    const d = window.__SIMULADOR_DIAGNOSTICO__;
    const s = d.obtenerSnapshotHistorico();
    const p = s.probes[missionId];
    const cam = d.obtenerEstadoCamaraHistorica();
    const models = d.obtenerEstadoModelosHistoricos();
    return {
      jdTdb: s.jdTdb, utc: s.timeLabels.labelUtc, tdb: s.timeLabels.labelTdb,
      status: p.status, state: p.state ? { position: p.state.position, velocity: p.state.velocity } : null,
      visualPosition: p.visual?.posicionEscena ?? null, reason: p.reason,
      camera: { mode: cam.modo, observer: cam.idSondaObservador, position: cam.posicionEscena,
        target: cam.objetivoEscena, transition: cam.transicionActiva, fov: cam.fovGrados,
        viewMode: cam.modoVista,
        exteriorPressed: document.querySelector('#hist-cam-exterior-btn')?.getAttribute('aria-pressed'),
        firstPersonPressed: document.querySelector('#hist-cam-fp-btn')?.getAttribute('aria-pressed') },
      modelLoaded: models[missionId]?.voyagerCargado,
      dataStatus: document.querySelector('#data-status')?.textContent,
      sourceStatus: document.querySelector('#source-status')?.textContent,
      badge: document.querySelector('#voyager-data-status-badge')?.textContent,
      sampleInfo: document.querySelector('#v-card-sample-info')?.textContent,
      distanceSunKm: document.querySelector('#v-card-dist-sun-km')?.textContent,
      speedKmS: document.querySelector('#v-card-speed-helio')?.textContent,
      clockUtc: document.querySelector('#hist-clock-utc')?.textContent,
      clockTdb: document.querySelector('#hist-clock-tdb')?.textContent,
      speed: document.querySelector('#hist-speed-select')?.value,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON()
    };
  }, id);
}

try {
  for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844]]) {
    const viewport = `${width}x${height}`;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on('pageerror', error => report.errors.push({ viewport, type: 'pageerror', message: error.message }));
    page.on('console', message => { if (message.type() === 'error') report.errors.push({ viewport, type: 'console', message: message.text() }); });
    await page.goto(process.env.VOYAGER_E2E_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.locator('[data-mode-btn="historico"]').click();
    await page.locator('#historical-welcome-modal').waitFor({ state: 'visible' });
    await page.locator('#welcome-explore-free').click();
    await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico());
    for (const mission of missions) {
      if (await page.locator('#inspector-toggle').getAttribute('aria-expanded') === 'false')
        await page.locator('#inspector-toggle').click();
      await page.locator('[data-inspector-tab="explore"]').click();
      await seek(page, mission.before - 30 / 86400);
      await page.locator(`[data-mission-choice="${mission.id}"]`).click();
      await page.waitForFunction(() => !window.__SIMULADOR_DIAGNOSTICO__?.obtenerEstadoCamaraHistorica()?.transicionActiva, null, { timeout: 20000 });
      await page.locator('[data-inspector-tab="telemetry"]').click();
      for (const [label, jd] of [
        ['antes', mission.before - 30 / 86400],
        ['sin-datos', (mission.before + mission.after) / 2],
        ['despues', mission.after + 30 / 86400]
      ]) {
        await seek(page, jd);
        const observed = await state(page, mission.id);
        assert.equal(observed.status === 'spk_segment_transition', label === 'sin-datos');
        assert.equal(Boolean(observed.visualPosition), label !== 'sin-datos');
        assert.ok(observed.camera.position.every(Number.isFinite));
        if (label !== 'sin-datos') {
          assert.ok(Math.hypot(...observed.camera.target.map((v, i) =>
            v - Object.values(observed.visualPosition)[i])) < 1e-5,
            `${mission.id} ${label}: exterior camera does not follow probe`);
        }
        assert.ok(observed.scrollWidth <= width + 1);
        assert.ok(!await page.evaluate(() => /\bNaN\b/.test(document.body.innerText)));
        if (label === 'sin-datos') {
          assert.match(observed.badge, /SIN POSICIÓN VERIFICADA/);
          assert.equal(observed.distanceSunKm, 'Sin posición verificada');
        }
        report.results.push({ viewport, mission: mission.id, label, ...observed });
        const file = `${mission.key}-${label}-${viewport}.png`;
        await page.screenshot({ path: path.join(output, file), fullPage: false });
        console.log(viewport, mission.key, label, observed.status, observed.camera.mode,
          observed.clockUtc, observed.scrollWidth);
      }
      if (viewport === '1920x1080') {
        await seek(page, mission.before - 30 / 86400);
        await page.locator('[data-inspector-tab="navigation"]').click();
        await page.locator('#hist-cam-fp-btn').click();
        const fpBefore = await state(page, mission.id);
        assert.equal(fpBefore.camera.observer, mission.id);
        await page.screenshot({ path: path.join(output, `${mission.key}-primera-persona-antes-1920x1080.png`) });
        await seek(page, (mission.before + mission.after) / 2);
        const fpGap = await state(page, mission.id);
        assert.equal(fpGap.camera.mode, 'exterior');
        assert.equal(fpGap.camera.exteriorPressed, 'true');
        assert.equal(fpGap.camera.firstPersonPressed, 'false');
        await page.screenshot({ path: path.join(output, `${mission.key}-primera-persona-corte-1920x1080.png`) });
        await seek(page, mission.after + 30 / 86400);
        const fpAfter = await state(page, mission.id);
        report.interactions.push({ viewport, mission: mission.id, kind: 'first-person-gap',
          before: fpBefore.camera, gap: fpGap.camera, after: fpAfter.camera });
        console.log('FP', mission.key, fpBefore.camera.mode, fpGap.camera.mode, fpAfter.camera.mode);
        await page.locator('#hist-cam-exterior-btn').click();
        await seek(page, mission.before - 120 / 86400);
        await page.locator('#hist-speed-select').selectOption('1h_s');
        await page.locator('#hist-play-btn').click();
        await page.waitForFunction(id => {
          const d = window.__SIMULADOR_DIAGNOSTICO__;
          return d.obtenerSnapshotHistorico()?.probes[id]?.status === 'spk_segment_transition'
            && !d.obtenerEstadoMotorHistorico().playing;
        }, mission.id, { timeout: 20000 });
        const forwardPause = await state(page, mission.id);
        await page.screenshot({ path: path.join(output, `${mission.key}-reproduccion-pausa-1920x1080.png`) });
        await page.locator('#hist-play-btn').click();
        await page.waitForFunction(jd => window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()?.jdTdb > jd,
          mission.after, { timeout: 20000 });
        await page.locator('#hist-play-btn').click();
        const forwardResume = await state(page, mission.id);
        await seek(page, mission.after + 120 / 86400);
        await page.locator('#historical-time-options > summary').click();
        await page.locator('#hist-reverse-btn').click();
        await page.locator('#hist-speed-select').selectOption('6h_s');
        await page.locator('#hist-play-btn').click();
        await page.waitForFunction(id => {
          const d = window.__SIMULADOR_DIAGNOSTICO__;
          return d.obtenerSnapshotHistorico()?.probes[id]?.status === 'spk_segment_transition'
            && !d.obtenerEstadoMotorHistorico().playing;
        }, mission.id, { timeout: 20000 });
        const reversePause = await state(page, mission.id);
        await page.locator('#historical-time-options > summary').click();
        await page.locator('#hist-reverse-btn').click();
        await page.locator('#perspective-button').click();
        const cinematic = await state(page, mission.id);
        assert.ok(cinematic.camera.position.every(Number.isFinite));
        await page.locator('#historical-date-options > summary').click();
        const beforeDate = mission.key === 'v1'
          ? { year: '1980', month: '12', day: '31', hour: '23' }
          : { year: '1989', month: '08', day: '29', hour: '07' };
        await page.evaluate(date => {
          for (const [part, value] of Object.entries(date))
            document.querySelector(`#hist-${part}-select`).value = value;
          document.querySelector('#hist-hour-select').dispatchEvent(new Event('change', { bubbles: true }));
        }, beforeDate);
        await page.waitForFunction(jd => window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()?.jdTdb < jd,
          mission.before, { timeout: 20000 });
        const dateBefore = await state(page, mission.id);
        const afterDate = mission.key === 'v1'
          ? { year: '1981', month: '01', day: '01', hour: '01' }
          : { year: '1989', month: '08', day: '29', hour: '09' };
        await page.evaluate(date => {
          for (const [part, value] of Object.entries(date))
            document.querySelector(`#hist-${part}-select`).value = value;
          document.querySelector('#hist-hour-select').dispatchEvent(new Event('change', { bubbles: true }));
        }, afterDate);
        await page.waitForFunction(jd => window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()?.jdTdb > jd,
          mission.after, { timeout: 20000 });
        const dateAfter = await state(page, mission.id);
        await page.locator('#hist-timeline-range').click({ position: { x: 300, y: 5 } });
        await page.waitForFunction(jd => Math.abs(window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico()?.jdTdb - jd) > 1,
          dateAfter.jdTdb, { timeout: 20000 });
        const manualTimeline = await state(page, mission.id);
        report.interactions.push({ viewport, mission: mission.id, kind: 'playback',
          forwardPause: { jdTdb: forwardPause.jdTdb, status: forwardPause.status },
          forwardResume: { jdTdb: forwardResume.jdTdb, status: forwardResume.status },
          reversePause: { jdTdb: reversePause.jdTdb, status: reversePause.status },
          cinematic: cinematic.camera, dateBefore: dateBefore.jdTdb,
          dateAfter: dateAfter.jdTdb, manualTimeline: manualTimeline.jdTdb });
        console.log('PLAYBACK', mission.key, forwardPause.status, forwardResume.status, reversePause.status);
      }
    }
    if (viewport === '1920x1080') {
      const modes = [];
      for (const mode of ['exploracion', 'experimental', 'historico']) {
        await page.locator(`[data-mode-btn="${mode}"]`).click();
        await page.waitForFunction(expected =>
          window.__SIMULADOR_DIAGNOSTICO__?.obtenerModoOperacion() === expected,
        mode, { timeout: 20000 });
        modes.push(mode);
      }
      report.interactions.push({ viewport, kind: 'main-modes', modes });
      console.log('MODES', modes.join(' -> '));
    }
    await page.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log('RESULTS', report.results.length, 'INTERACTIONS', report.interactions.length, 'ERRORS', report.errors.length);
