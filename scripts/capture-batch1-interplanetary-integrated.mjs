import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const PORT = 5192;
const URL = `http://localhost:${PORT}/`;
const server = await createServer({
  server: { port: PORT, strictPort: true },
  configFile: path.resolve('vite.config.js'),
  logLevel: 'error'
});
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox']
});

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', msg => { if (msg.type() === 'error') console.error('BROWSER ERROR:', msg.text()); });
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

  console.log('Navigating to', URL);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Helper for navigating via area map
  async function gotoArea(areaId) {
    await page.click('#app-nav-toggle');
    await page.waitForTimeout(250);
    await page.click(`#app-nav-panel button[data-area="${areaId}"]`);
    await page.waitForTimeout(1500);
  }

  // --- 10_Misiones_Interplanetarias ---
  console.log('--- Interplanetary (12G) ---');
  await gotoArea('interplanetary');

  // Earth -> Mars (default)
  console.log('Searching Earth-Mars windows...');
  await page.click('#ip-search');
  await page.waitForFunction(() => !document.querySelector('#ip-search').disabled && !document.querySelector('#ip-execute').disabled, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/10_Misiones_Interplanetarias/interplanetaria_01_porkchop_tierra_marte_1920x1080.png') });
  console.log('Saved interplanetaria_01_porkchop_tierra_marte_1920x1080.png');

  // Earth -> Venus
  console.log('Searching Earth-Venus windows...');
  await page.selectOption('#ip-destination', '299'); // Venus
  await page.click('#ip-suggest');
  await page.waitForTimeout(500);
  await page.click('#ip-search');
  await page.waitForFunction(() => !document.querySelector('#ip-search').disabled && !document.querySelector('#ip-execute').disabled, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/10_Misiones_Interplanetarias/interplanetaria_02_transferencia_tierra_venus_1920x1080.png') });
  console.log('Saved interplanetaria_02_transferencia_tierra_venus_1920x1080.png');

  // Earth -> Jupiter
  console.log('Searching Earth-Jupiter windows...');
  await page.selectOption('#ip-destination', '599'); // Jupiter
  await page.click('#ip-suggest');
  await page.waitForTimeout(500);
  await page.click('#ip-search');
  await page.waitForFunction(() => !document.querySelector('#ip-search').disabled && !document.querySelector('#ip-execute').disabled, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/10_Misiones_Interplanetarias/interplanetaria_03_transferencia_tierra_jupiter_1920x1080.png') });
  console.log('Saved interplanetaria_03_transferencia_tierra_jupiter_1920x1080.png');

  // --- 11_Misiones_Integradas_Etapa13 ---
  console.log('--- Integrated Missions (Stage 13) ---');
  await gotoArea('integrated');

  async function computeIntegrated(id) {
    await page.selectOption('#im-scenario', id);
    await page.click('#im-compute');
    await page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 120000 });
    await page.waitForTimeout(600);
  }

  // A1: Mars capture
  console.log('Computing scenario A1 (Mars capture)...');
  await computeIntegrated('A1');
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/11_Misiones_Integradas_Etapa13/integrada_01_escenario_A1_marte_captura_1920x1080.png') });
  console.log('Saved integrada_01_escenario_A1_marte_captura_1920x1080.png');
  const a1Plot = page.locator('#im-plot');
  if (await a1Plot.isVisible()) {
    await a1Plot.screenshot({ path: path.resolve('evidence/tercer_avance/11_Misiones_Integradas_Etapa13/integrada_02_escenario_A1_grafico_planetocentrico_1920x1080.png') });
    console.log('Saved integrada_02_escenario_A1_grafico_planetocentrico_1920x1080.png');
  }

  // B2: Hyperbolic flyby (insufficient propellant)
  console.log('Computing scenario B2 (Hyperbolic flyby)...');
  await computeIntegrated('B2');
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/11_Misiones_Integradas_Etapa13/integrada_03_escenario_B2_sobrevuelo_hiperbolico_1920x1080.png') });
  console.log('Saved integrada_03_escenario_B2_sobrevuelo_hiperbolico_1920x1080.png');

  // B1: Jupiter-Europa-Touchdown (13 stages)
  console.log('Computing scenario B1 (Jupiter -> Europa -> Landing)...');
  await computeIntegrated('B1');
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/11_Misiones_Integradas_Etapa13/integrada_04_escenario_B1_jupiter_europa_descenso_1920x1080.png') });
  console.log('Saved integrada_04_escenario_B1_jupiter_europa_descenso_1920x1080.png');
  const b1Plot = page.locator('#im-plot');
  if (await b1Plot.isVisible()) {
    await b1Plot.screenshot({ path: path.resolve('evidence/tercer_avance/11_Misiones_Integradas_Etapa13/integrada_05_escenario_B1_grafico_planetocentrico_1920x1080.png') });
    console.log('Saved integrada_05_escenario_B1_grafico_planetocentrico_1920x1080.png');
  }

  // --- 12_Centro_de_Mision for B1 ---
  console.log('--- Mission Center Playback for B1 ---');
  await page.click('#im-execute');
  await page.waitForTimeout(2000);
  await page.click('#mc-pause');
  await page.waitForTimeout(500);

  // Heliocentric trajectory
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/12_Centro_de_Mision/centro_03_interplanetaria_trayectoria_helio_1920x1080.png') });
  console.log('Saved centro_03_interplanetaria_trayectoria_helio_1920x1080.png');

  // Jump to Jupiter SOI
  await page.locator('#mc-events button', { hasText: 'Entrada en la esfera de influencia de Júpiter' }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/12_Centro_de_Mision/centro_04_B1_entrada_soi_jupiter_1920x1080.png') });
  console.log('Saved centro_04_B1_entrada_soi_jupiter_1920x1080.png');

  // Jump to JOI burn
  await page.locator('#mc-events button', { hasText: 'Inserción en órbita de Júpiter · inicio' }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/12_Centro_de_Mision/centro_05_B1_insercion_orbital_joi_1920x1080.png') });
  console.log('Saved centro_05_B1_insercion_orbital_joi_1920x1080.png');

  // Wide view toggle
  await page.click('[data-mc-panel="wide"]');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/12_Centro_de_Mision/centro_06_B1_vista_amplia_inmersiva_1920x1080.png') });
  console.log('Saved centro_06_B1_vista_amplia_inmersiva_1920x1080.png');

  // Step next in transport
  await page.click('[data-tr="next"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/12_Centro_de_Mision/centro_07_B1_barra_transporte_eventos_1920x1080.png') });
  console.log('Saved centro_07_B1_barra_transporte_eventos_1920x1080.png');

  // Restore panels
  await page.click('[data-mc-panel="wide"]');
  await page.waitForTimeout(500);

  // Jump to Europa SOI
  await page.locator('#mc-events button', { hasText: 'Entrada en la esfera de influencia de Europa' }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/12_Centro_de_Mision/centro_08_B1_soi_europa_contexto_1920x1080.png') });
  console.log('Saved centro_08_B1_soi_europa_contexto_1920x1080.png');

  // Jump to Contact and local camera
  await page.locator('#mc-events button', { hasText: 'Contacto' }).first().click();
  await page.waitForTimeout(800);
  await page.click('.mc-camera-bar button[data-camera="local"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/12_Centro_de_Mision/centro_09_B1_contacto_europa_camara_local_1920x1080.png') });
  console.log('Saved centro_09_B1_contacto_europa_camara_local_1920x1080.png');

  await page.close();
  console.log('Batch 1 completed successfully!');
} catch (err) {
  console.error('Batch 1 failed:', err);
} finally {
  await browser.close();
  await server.close();
}
