import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const PORT = 5193;
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

  async function gotoArea(areaId) {
    await page.click('#app-nav-toggle');
    await page.waitForTimeout(250);
    await page.click(`#app-nav-panel button[data-area="${areaId}"]`);
    await page.waitForTimeout(1500);
  }

  // --- 01_Sistema_Solar: Saturn & Time controls ---
  console.log('--- Solar System: Saturn ---');
  // 14.1: el botón de búsqueda de la cabecera abre la paleta de búsqueda global.
  await page.getByRole('button', { name: 'Buscar destino' }).first().click();
  await page.waitForTimeout(400);
  await page.fill('#cp-input', 'Saturno');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/01_Sistema_Solar/solar_04_saturno_y_anillos_1920x1080.png') });
  console.log('Saved solar_04_saturno_y_anillos_1920x1080.png');

  // Time & Camera controls
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/01_Sistema_Solar/solar_05_controles_tiempo_y_camaras_1920x1080.png') });
  console.log('Saved solar_05_controles_tiempo_y_camaras_1920x1080.png');

  // --- 02_Voyager: A/B Comparator ---
  console.log('--- Voyager: Comparator ---');
  await page.click('#app-mode-switcher button[data-mode-btn="historico"]');
  await page.waitForTimeout(3000);
  try { await page.getByRole('button', { name: 'Explorar libremente' }).click({ timeout: 3000 }); } catch {}
  await page.waitForTimeout(1500);

  // Go to Fotos tab
  await page.locator('#context-inspector [role="tab"]', { hasText: 'Fotos' }).first().click();
  await page.waitForTimeout(1000);
  // Open comparator from first photo item
  const compareBtn = page.locator('[data-photo-act="compare"]').first();
  if (await compareBtn.isVisible()) {
    await compareBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.resolve('evidence/tercer_avance/02_Voyager/voyager_07_recorrido_comparador_foto_3d_1920x1080.png') });
    console.log('Saved voyager_07_recorrido_comparador_foto_3d_1920x1080.png');
    // Close comparator
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // --- 03_Laboratorio_General ---
  console.log('--- Lab: Header & Areas Map ---');
  await gotoArea('hangar');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/03_Laboratorio_General/lab_01_cabecera_y_navegacion_3pasos_1920x1080.png') });
  console.log('Saved lab_01_cabecera_y_navegacion_3pasos_1920x1080.png');

  // Open area map from inside lab
  await page.click('#app-nav-toggle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/03_Laboratorio_General/lab_03_mapa_areas_desde_laboratorio_1920x1080.png') });
  console.log('Saved lab_03_mapa_areas_desde_laboratorio_1920x1080.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // --- 04_Hangar: Components & catalogue ---
  console.log('--- Hangar: Parts catalogue ---');
  await page.locator('.hangar-palette, .lab-panel-scroll').first().evaluate(el => el.scrollTop = 250);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/04_Hangar/hangar_02_catalogo_y_configuracion_piezas_1920x1080.png') });
  console.log('Saved hangar_02_catalogo_y_configuracion_piezas_1920x1080.png');

  // --- 05_Ingenieria: Propulsion & TWR balance ---
  console.log('--- Engineering: Balance & TWR ---');
  await gotoArea('engineering');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/05_Ingenieria/ingenieria_02_balance_propulsion_y_twr_1920x1080.png') });
  console.log('Saved ingenieria_02_balance_propulsion_y_twr_1920x1080.png');

  // --- 06_Planificador_Tierra_Luna ---
  console.log('--- Lunar Planner: Options & Budget ---');
  await gotoArea('lunar');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/06_Planificador_Tierra_Luna/lunar_01_configuracion_maniobra_1920x1080.png') });
  console.log('Saved lunar_01_configuracion_maniobra_1920x1080.png');

  await page.click('#mission-calculate');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/06_Planificador_Tierra_Luna/lunar_03_evaluacion_viabilidad_presupuesto_1920x1080.png') });
  console.log('Saved lunar_03_evaluacion_viabilidad_presupuesto_1920x1080.png');

  // --- 07_Propulsion_Empuje_Finito ---
  console.log('--- Finite Thrust ---');
  await gotoArea('finite');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/07_Propulsion_Empuje_Finito/propulsion_01_controles_empuje_finito_1920x1080.png') });
  console.log('Saved propulsion_01_controles_empuje_finito_1920x1080.png');

  await page.click('#ft-calculate');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/07_Propulsion_Empuje_Finito/propulsion_02_perfiles_motor_quimico_vs_ionico_1920x1080.png') });
  console.log('Saved propulsion_02_perfiles_motor_quimico_vs_ionico_1920x1080.png');

  // --- 08_Lanzamiento_Terrestre: Classification ---
  console.log('--- Launch: Classification ---');
  await gotoArea('launch');
  await page.click('#ln-calculate');
  await page.waitForFunction(() => document.querySelector('#ln-results')?.children.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/08_Lanzamiento_Terrestre/lanzamiento_03_resultados_y_clasificacion_orbital_1920x1080.png') });
  console.log('Saved lanzamiento_03_resultados_y_clasificacion_orbital_1920x1080.png');

  // --- 09_Aterrizajes_Multicuerpo ---
  console.log('--- Landing: Moon & Europa & Failure ---');
  await gotoArea('landing');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/09_Aterrizajes_Multicuerpo/aterrizaje_01_configuracion_luna_1920x1080.png') });
  console.log('Saved aterrizaje_01_configuracion_luna_1920x1080.png');

  // Europa configuration
  await page.selectOption('#ld-body', '502'); // Europa
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/09_Aterrizajes_Multicuerpo/aterrizaje_03_configuracion_europa_1920x1080.png') });
  console.log('Saved aterrizaje_03_configuracion_europa_1920x1080.png');

  // Europa calculate
  await page.click('#ld-calculate');
  await page.waitForFunction(() => document.querySelector('#ld-results')?.children.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.resolve('evidence/tercer_avance/09_Aterrizajes_Multicuerpo/aterrizaje_04_contacto_suave_europa_1920x1080.png') });
  console.log('Saved aterrizaje_04_contacto_suave_europa_1920x1080.png');

  // Failure scenario: Moon with low propellant (e.g. 1500 kg instead of default 4200 kg)
  await page.selectOption('#ld-body', '301'); // Moon
  await page.waitForTimeout(300);
  const fuelInput = page.locator('input[data-lander="propellantKg"]');
  if (await fuelInput.isVisible()) {
    await fuelInput.fill('1200');
    await page.click('#ld-calculate');
    await page.waitForFunction(() => document.querySelector('#ld-results')?.children.length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.resolve('evidence/tercer_avance/09_Aterrizajes_Multicuerpo/aterrizaje_05_escenario_fallido_impacto_o_combustible_1920x1080.png') });
    console.log('Saved aterrizaje_05_escenario_fallido_impacto_o_combustible_1920x1080.png');
  }

  // --- 14_Defectos ---
  console.log('--- 14_Defectos ---');
  // Long verdict wrapping
  await gotoArea('integrated');
  await page.selectOption('#im-scenario', 'B2');
  await page.click('#im-compute');
  await page.waitForFunction(() => !document.querySelector('#im-compute').disabled, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const verdictEl = page.locator('#im-verdict');
  if (await verdictEl.isVisible()) {
    await verdictEl.screenshot({ path: path.resolve('evidence/tercer_avance/14_Defectos/defecto_02_ajuste_veredicto_largo.png') });
    console.log('Saved defecto_02_ajuste_veredicto_largo.png');
  }

  await page.close();

  // Mobile defect check (390x844)
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto(URL, { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.click('#app-nav-toggle');
  await mobilePage.waitForTimeout(250);
  await mobilePage.click('#app-nav-panel button[data-area="hangar"]');
  await mobilePage.waitForTimeout(1000);
  const headerContext = mobilePage.locator('.lab-header-context');
  if (await headerContext.isVisible()) {
    await headerContext.screenshot({ path: path.resolve('evidence/tercer_avance/14_Defectos/defecto_01_truncamiento_sonda_activa_movil.png') });
    console.log('Saved defecto_01_truncamiento_sonda_activa_movil.png');
  }
  await mobilePage.close();

  console.log('Batch 2 completed successfully!');
} catch (err) {
  console.error('Batch 2 failed:', err);
} finally {
  await browser.close();
  await server.close();
}
