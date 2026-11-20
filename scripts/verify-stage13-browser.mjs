// Etapa 13 — verificación en navegador (Chrome sin interfaz + Playwright local) de la «Misión completa»: misión A (Marte) y
// misión B (Júpiter → Europa → descenso 12F) en el Planificador y en el Centro de Misión, en escritorio y en móvil.
// Uso: node scripts/verify-stage13-browser.mjs   → capturas y registro en evidence/stage13/
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve('evidence/stage13');
await fs.mkdir(out, { recursive: true });
const server = await createServer({ server: { port: 5184 }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { shots: [], checks: {}, errors: [] };
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => log.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); });
const shot = async (name, locator = null) => { await (locator ?? page).screenshot({ path: path.join(out, name) }); log.shots.push(name); };
const text = async selector => (await page.locator(selector).first().textContent())?.trim();
const computed = () => page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 120000 });
async function scenario(id) { await page.selectOption('#im-scenario', id); await page.click('#im-compute'); await computed(); await page.waitForTimeout(300); }
async function event(label) { await page.locator('#mc-events button', { hasText: label }).first().click(); await page.waitForTimeout(700); }
try {
  await page.goto('http://localhost:5184/', { waitUntil: 'networkidle' });
  await page.click('#app-mode-switcher button[data-mode-btn="experimental"]'); await page.waitForTimeout(500);
  await page.click('button[data-lab-section="planner"]'); await page.waitForTimeout(300);
  await page.click('button[data-planner-mode="integrated"]'); await page.waitForTimeout(900);
  log.checks.coverage = await text('#im-coverage');
  // ---- Misión A ----
  await scenario('A1');
  log.checks.A1 = { verdict: await text('#im-verdict'), message: await text('#im-message'), maneuvers: await text('#im-maneuvers'), continuity: await text('#im-continuity'), mass: await text('#im-mass') };
  await shot('01_planner_A1_mars_sufficient.png');
  await page.click('[data-ctx="planet"]'); await page.waitForTimeout(300);
  await shot('02_planner_A1_mars_planetocentric_plot.png', page.locator('#lab-integrated .mission-stage'));
  await scenario('A2');
  log.checks.A2 = { verdict: await text('#im-verdict'), phases: await text('#im-phases') };
  await shot('03_planner_A2_mars_insufficient.png');
  await scenario('A3');
  log.checks.A3 = { verdict: await text('#im-verdict'), phases: await text('#im-phases') };
  // Centro de Misión con A1.
  await scenario('A1');
  await page.click('#im-execute'); await page.waitForTimeout(1200);
  await page.click('#mc-pause'); await page.waitForTimeout(200);
  log.checks.A1center = { readiness: await text('#mc-readiness'), rate: await page.locator('#mc-rate').inputValue() };
  await shot('04_center_A1_departure_helio.png');
  await event('Entrada en la esfera'); log.checks.A1soi = await text('#mc-state-metrics');
  await shot('05_center_A1_soi_planet_context.png');
  await event('Inserción en órbita de Marte · inicio'); await page.click('.mc-camera-bar button[data-camera="exterior"]'); await page.waitForTimeout(900);
  log.checks.A1burn = await text('#mc-resource-metrics');
  await shot('06_center_A1_capture_burn_exterior.png');
  await page.click('.mc-camera-bar button[data-camera="overview"]'); await page.waitForTimeout(600);
  await event('apoapsis objetivo'); log.checks.A1cutoff = { derived: await text('#mc-derived-metrics'), outcome: await text('#mc-outcome') };
  await shot('07_center_A1_capture_cutoff.png');
  // Reproducción: avanzar y retroceder (determinismo).
  await page.click('#mc-play'); await page.waitForTimeout(1500); await page.click('#mc-pause');
  const tA = await page.locator('#mc-timeline').inputValue();
  await page.click('#mc-reverse'); await page.waitForTimeout(800); await page.click('#mc-pause');
  log.checks.reverse = { afterPlay: tA, afterReverse: await page.locator('#mc-timeline').inputValue(), status: await text('#mc-stage-status') };
  // ---- Misión B ----
  await page.click('button[data-lab-section="planner"]'); await page.waitForTimeout(300);
  await scenario('B1');
  log.checks.B1 = { verdict: await text('#im-verdict'), message: await text('#im-message'), maneuvers: await text('#im-maneuvers'), approach: await text('#im-approach'), continuity: await text('#im-continuity'), mass: await text('#im-mass'), warnings: await text('#im-warnings') };
  await shot('08_planner_B1_europa_complete.png');
  await page.click('[data-ctx="moon"]'); await page.waitForTimeout(300);
  await shot('09_planner_B1_europa_plot.png', page.locator('#lab-integrated .mission-stage'));
  await scenario('B2');
  log.checks.B2 = { verdict: await text('#im-verdict'), phases: await text('#im-phases') };
  await shot('10_planner_B2_insufficient.png');
  await scenario('B1');
  await page.click('#im-execute'); await page.waitForTimeout(1500); await page.click('#mc-pause');
  await event('Entrada en la esfera de influencia de Júpiter');
  await shot('11_center_B1_jupiter_soi.png');
  await event('Encendido de transferencia hacia Europa · inicio');
  log.checks.B1transfer = { state: await text('#mc-state-metrics'), resources: await text('#mc-resource-metrics') };
  await shot('12_center_B1_transfer_burn_planet.png');
  await event('Entrada en la esfera de influencia de Europa');
  await shot('13_center_B1_europa_soi_moon_context.png');
  await page.click('#mc-context button[data-context="planet"]'); await page.waitForTimeout(600);
  log.checks.contextFixed = await text('#mc-message');
  await shot('14_center_B1_same_instant_planet_context.png');
  await page.click('#mc-context button[data-context="auto"]'); await page.waitForTimeout(300);
  await event('Separación'); log.checks.separation = await text('#mc-resource-metrics');
  await event('Contacto'); await page.click('.mc-camera-bar button[data-camera="local"]'); await page.waitForTimeout(900);
  log.checks.B1contact = { outcome: await text('#mc-outcome'), resources: await text('#mc-resource-metrics'), foot: await text('#mc-foot') };
  await shot('15_center_B1_touchdown_local.png');
  // Ritmo automático por fase: reproducir desde el periapsis joviano y comprobar que se detiene en fronteras.
  await page.click('.mc-camera-bar button[data-camera="overview"]');
  await event('Inserción en órbita de Júpiter · inicio');
  await page.selectOption('#mc-rate', 'auto'); await page.click('#mc-play'); await page.waitForTimeout(1200); await page.click('#mc-pause');
  log.checks.autoRate = { status: await text('#mc-stage-status'), state: (await text('#mc-state-metrics')).slice(0, 220) };
  // ---- Móvil ----
  for (const [w, h, name] of [[390, 844, '16_mobile_390_planner_B1.png'], [320, 568, '17_mobile_320_planner_B1.png']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.click('button[data-lab-section="planner"]'); await page.waitForTimeout(700);
    await shot(name);
    log.checks[`overflow${w}`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  }
  await page.locator('#lab-integrated .mission-results').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await shot('18_mobile_320_results.png');
  await page.click('button[data-lab-section="center"]'); await page.waitForTimeout(900);
  await shot('19_mobile_320_center.png');
  await page.setViewportSize({ width: 1366, height: 768 }); await page.waitForTimeout(600);
  await shot('20_laptop_1366_center.png');
} catch (error) { log.errors.push(`FALLO DEL GUION: ${error.message}`); }
finally {
  await fs.writeFile(path.join(out, 'browser-verification.json'), `${JSON.stringify(log, null, 2)}\n`);
  console.log(JSON.stringify(log, null, 2));
  await browser.close(); await server.close();
}
