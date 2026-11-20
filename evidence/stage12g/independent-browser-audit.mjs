// evidence/stage12g/independent-browser-audit.mjs
// Auditoría funcional independiente en navegador (Chrome + Playwright)
// Viewports: 1920x1080, 1366x768, 768x1024, 390x844, 320x568
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve('evidence/stage12g');
await fs.mkdir(out, { recursive: true });

const server = await createServer({
  server: { port: 5184 },
  configFile: path.resolve('vite.config.js'),
  logLevel: 'error'
});
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox']
});

const report = {
  testedViewports: [],
  consoleErrors: [],
  pageErrors: [],
  temporalReversibilityTest: null,
  satellitesTested: [],
  corrections12F1Verified: {},
  overflowChecks: []
};

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', err => report.pageErrors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text());
  });

  console.log('--- 1. Navegando al simulador en http://localhost:5184/ ---');
  await page.goto('http://localhost:5184/', { waitUntil: 'networkidle' });

  // Ir al Laboratorio Experimental -> Planificador -> Interplanetario
  await page.click('#app-mode-switcher button[data-mode-btn="experimental"]');
  await page.waitForTimeout(500);
  await page.click('button[data-lab-section="planner"]');
  await page.waitForTimeout(400);
  await page.click('button[data-planner-mode="interplanetary"]');
  await page.waitForTimeout(600);

  // 1. Viewport 1920x1080 - Búsqueda Tierra-Marte por defecto
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.click('#ip-search');
  await page.waitForFunction(() => !document.querySelector('#ip-search').disabled && document.querySelector('#ip-selected')?.textContent.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'audit_01_desktop_1920_mars.png') });
  report.testedViewports.push({ width: 1920, height: 1080, status: 'OK' });

  // Comprobar desbordamiento horizontal a 1920
  const overflow1920 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  report.overflowChecks.push({ viewport: '1920x1080', overflow: overflow1920 });

  // 2. Viewport 1366x768 (Laptop estándar)
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'audit_02_laptop_1366_mars.png') });
  const overflow1366 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  report.overflowChecks.push({ viewport: '1366x768', overflow: overflow1366 });
  report.testedViewports.push({ width: 1366, height: 768, status: 'OK' });

  // 3. Viewport 768x1024 (Tablet vertical)
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'audit_03_tablet_768_mars.png') });
  const overflow768 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  report.overflowChecks.push({ viewport: '768x1024', overflow: overflow768 });
  report.testedViewports.push({ width: 768, height: 1024, status: 'OK' });

  // 4. Viewport 390x844 (Móvil moderno)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'audit_04_mobile_390_mars.png') });
  const overflow390 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  report.overflowChecks.push({ viewport: '390x844', overflow: overflow390 });
  report.testedViewports.push({ width: 390, height: 844, status: 'OK' });

  // 5. Viewport 320x568 (Móvil ultra-estrecho)
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'audit_05_mobile_320_mars.png') });
  const overflow320 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  report.overflowChecks.push({ viewport: '320x568', overflow: overflow320 });
  report.testedViewports.push({ width: 320, height: 568, status: 'OK' });

  // Volver a escritorio para pruebas de satélites y Centro de Misión
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(200);

  // Probar los 10 satélites como destinos futuros
  const satIds = ['301', '501', '502', '503', '504', '606', '602', '703', '705', '801'];
  for (const satId of satIds) {
    await page.selectOption('#ip-destination', `sat:${satId}`);
    await page.waitForTimeout(100);
    const satBoxText = (await page.locator('#ip-satellite').textContent())?.trim();
    const isInvalidated = (await page.locator('#ip-message').textContent())?.includes('invalidaron');
    report.satellitesTested.push({
      satId,
      displayedText: satBoxText,
      invalidatedPrevious: isInvalidated
    });
  }

  // Reproducir en Centro de Misión: Tierra -> Marte
  await page.selectOption('#ip-destination', '499');
  await page.fill('#ip-dep-start', '2028-08-01');
  await page.dispatchEvent('#ip-dep-start', 'change');
  await page.click('#ip-search');
  await page.waitForFunction(() => !document.querySelector('#ip-search').disabled && !document.querySelector('#ip-execute').disabled, null, { timeout: 30000 });
  await page.click('#ip-execute');
  await page.waitForTimeout(1000);

  // Pausar y verificar ciclo de reversibilidad temporal (10 ciclos de búsqueda hacia adelante y atrás)
  await page.click('#mc-pause');
  await page.waitForTimeout(200);

  const reversibilityStates = [];
  const targetSeek = 150 * 86400; // Día 150 de crucero

  for (let cycle = 1; cycle <= 10; cycle++) {
    // Buscar a t = 0
    await page.fill('#mc-timeline', '0');
    await page.dispatchEvent('#mc-timeline', 'input');
    await page.waitForTimeout(50);
    // Buscar a t = targetSeek
    await page.fill('#mc-timeline', String(targetSeek));
    await page.dispatchEvent('#mc-timeline', 'input');
    await page.waitForTimeout(50);

    const metricsText = (await page.locator('#mc-state-metrics').textContent())?.trim();
    reversibilityStates.push(metricsText);
  }

  const allIdentical = reversibilityStates.every(s => s === reversibilityStates[0]);
  report.temporalReversibilityTest = {
    cycles: 10,
    targetSeekDays: 150,
    deterministic: allIdentical,
    sampleState: reversibilityStates[0]
  };

  // Comprobar cámaras en el Centro de Misión
  const cameras = ['overview', 'exterior', 'onboard', 'destination', 'cinematic'];
  for (const cam of cameras) {
    await page.click(`.mc-camera-bar button[data-camera="${cam}"]`);
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: path.join(out, 'audit_06_mission_center_cinematic.png') });

  // 12F.1: Verificar corrección de cámara lunar y mensajes
  await page.click('button[data-lab-section="landing"]');
  await page.waitForTimeout(400);
  await page.click('#ld-calculate');
  await page.waitForTimeout(1500);

  const landerDetailsOpen = await page.locator('#lab-landing details.ft-section:has(summary:has-text("Módulo de aterrizaje"))').evaluate(node => node.open);
  report.corrections12F1Verified.landerDetailsOpen = landerDetailsOpen;

  await page.click('#ld-execute');
  await page.waitForTimeout(800);
  await page.click('#mc-pause');

  const landingPreparedMsg = (await page.locator('#mc-message').textContent())?.trim();
  report.corrections12F1Verified.landingPreparedMsg = landingPreparedMsg;

  // Saltar al contacto con cámara local
  await page.click('.mc-camera-bar button[data-camera="local"]');
  await page.waitForTimeout(400);
  await page.locator('#mc-events button:has-text("Contacto")').click();
  await page.waitForTimeout(900);

  const touchdownOutcome = (await page.locator('#mc-outcome').textContent())?.trim();
  report.corrections12F1Verified.touchdownOutcome = touchdownOutcome;

  await page.screenshot({ path: path.join(out, 'audit_07_touchdown_camera_verified.png') });

} catch (err) {
  report.fatalError = err.message;
} finally {
  await fs.writeFile(path.join(out, 'independent-browser-audit.json'), JSON.stringify(report, null, 2), 'utf8');
  await browser.close();
  await server.close();
  console.log('=== AUDITORÍA EN NAVEGADOR COMPLETADA ===');
}
