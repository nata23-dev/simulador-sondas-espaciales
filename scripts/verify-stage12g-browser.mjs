// Etapa 12G — verificación en navegador (Chrome sin interfaz + Playwright local) del flujo interplanetario y de 12F.1.
// Uso: node scripts/verify-stage12g-browser.mjs   → capturas y registro en evidence/stage12g/
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve('evidence/stage12g');
await fs.mkdir(out, { recursive: true });
const server = await createServer({ server: { port: 5183 }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { shots: [], checks: {}, errors: [] };
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => log.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); });
const shot = async (name, locator = null) => { const file = path.join(out, name); await (locator ?? page).screenshot({ path: file }); log.shots.push(name); };
const text = async selector => (await page.locator(selector).first().textContent())?.trim();
try {
  await page.goto('http://localhost:5183/', { waitUntil: 'networkidle' });
  await page.click('#app-mode-switcher button[data-mode-btn="experimental"]'); await page.waitForTimeout(500);
  await page.click('button[data-lab-section="planner"]'); await page.waitForTimeout(400);
  await page.click('button[data-planner-mode="interplanetary"]'); await page.waitForTimeout(800);
  log.checks.coverage = await text('#ip-coverage');
  await page.click('#ip-search'); await page.waitForFunction(() => !document.querySelector('#ip-search').disabled && document.querySelector('#ip-selected')?.textContent.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  log.checks.marsMessage = await text('#ip-message');
  log.checks.marsSelected = await text('#ip-selected');
  await shot('01_mars_porkchop_and_best.png');
  // Satélite: Europa como destino futuro.
  await page.selectOption('#ip-destination', 'sat:502'); await page.waitForTimeout(300);
  log.checks.europa = await text('#ip-satellite');
  log.checks.invalidated = await text('#ip-message');
  await shot('02_europa_future_destination.png', page.locator('#lab-interplanetary .mission-controls'));
  // Júpiter con rango sugerido.
  await page.click('#ip-satellite button'); await page.waitForTimeout(200);
  await page.fill('#ip-dep-start', '2028-01-01'); await page.dispatchEvent('#ip-dep-start', 'change');
  await page.click('#ip-suggest'); await page.waitForTimeout(200);
  await page.click('#ip-search'); await page.waitForFunction(() => !document.querySelector('#ip-search').disabled && /JUPITER|Júpiter/i.test(document.querySelector('#ip-stage-status').textContent), null, { timeout: 60000 });
  await page.waitForTimeout(400);
  log.checks.jupiterSelected = await text('#ip-selected');
  await shot('03_jupiter_direct_transfer.png');
  // Volver a Marte y reproducir en el Centro de Misión.
  await page.selectOption('#ip-destination', '499'); await page.fill('#ip-dep-start', '2028-08-01'); await page.dispatchEvent('#ip-dep-start', 'change');
  await page.fill('#ip-dep-end', '2029-04-01'); await page.dispatchEvent('#ip-dep-end', 'change');
  await page.fill('#ip-tof-min', '120'); await page.fill('#ip-tof-max', '400'); await page.fill('#ip-tof-step', '4'); await page.fill('#ip-dep-step', '4'); await page.dispatchEvent('#ip-tof-step', 'change');
  await page.click('#ip-search'); await page.waitForFunction(() => !document.querySelector('#ip-search').disabled && !document.querySelector('#ip-execute').disabled, null, { timeout: 60000 });
  await page.click('#ip-execute'); await page.waitForTimeout(1200);
  log.checks.mcReadiness = await text('#mc-readiness');
  await page.click('#mc-pause'); await page.waitForTimeout(200);
  log.checks.mcMessage = await text('#mc-message');
  await page.locator('#mc-events button').nth(1).click(); await page.waitForTimeout(800);
  await shot('04_mission_center_overview.png');
  log.checks.mcTelemetryMid = await text('#mc-state-metrics');
  await page.click('.mc-camera-bar button[data-camera="exterior"]'); await page.waitForTimeout(900);
  await shot('05_mission_center_exterior.png', page.locator('.mc-stage'));
  await page.locator('#mc-events button:has-text("Llegada")').click(); await page.waitForTimeout(500);
  await page.click('.mc-camera-bar button[data-camera="destination"]'); await page.waitForTimeout(900);
  log.checks.arrivalDerived = await text('#mc-derived-metrics');
  log.checks.arrivalResources = await text('#mc-resource-metrics');
  await shot('06_mission_center_arrival_telemetry.png');
  // 12F.1: cámara local en el contacto lunar.
  await page.click('button[data-lab-section="landing"]'); await page.waitForTimeout(400);
  await page.click('#ld-calculate'); await page.waitForTimeout(1500);
  log.checks.landerPanelOpen = await page.locator('#lab-landing details.ft-section:has(summary:has-text("Módulo de aterrizaje"))').evaluate(node => node.open);
  await page.click('#ld-execute'); await page.waitForTimeout(800);
  log.checks.landingPreparedMessage = await text('#mc-message');
  await page.click('#mc-pause');
  await page.click('.mc-camera-bar button[data-camera="local"]'); await page.waitForTimeout(500);
  await page.locator('#mc-events button:has-text("Contacto")').click(); await page.waitForTimeout(900);
  log.checks.landingOutcome = await text('#mc-outcome');
  await shot('07_fix_12f1_touchdown_local_camera.png');
  // Ancho móvil del planificador interplanetario.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('button[data-lab-section="planner"]'); await page.waitForTimeout(600);
  await shot('08_responsive_390_interplanetary.png');
} catch (error) { log.errors.push(`FALLO DEL GUION: ${error.message}`); }
finally {
  await fs.writeFile(path.join(out, 'browser-verification.json'), `${JSON.stringify(log, null, 2)}\n`);
  console.log(JSON.stringify(log, null, 2));
  await browser.close(); await server.close();
}
