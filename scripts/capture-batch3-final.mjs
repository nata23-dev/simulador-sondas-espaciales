import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const PORT = 5194;
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
  // --- 1. Voyager A/B Comparator ---
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('Opening Voyager mode...');
  await page.click('#app-mode-switcher button[data-mode-btn="historico"]');
  await page.waitForTimeout(3000);
  try { await page.getByRole('button', { name: 'Explorar libremente' }).click({ timeout: 3000 }); } catch {}
  await page.waitForTimeout(1500);

  console.log('Navigating to Fotos tab...');
  await page.locator('#context-inspector [role="tab"]', { hasText: 'Fotos' }).first().click();
  await page.waitForTimeout(1000);

  const photoActions = page.locator('.hist-photo-actions').first();
  await photoActions.locator('summary').click();
  await page.waitForTimeout(400);
  await photoActions.locator('[data-photo-act="compare"]').click();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.resolve('evidence/tercer_avance/02_Voyager/voyager_07_recorrido_comparador_foto_3d_1920x1080.png') });
  console.log('Saved voyager_07_recorrido_comparador_foto_3d_1920x1080.png');

  // --- 2. Landing failure scenario (low fuel) ---
  console.log('Navigating to landing failure scenario...');
  await page.click('#app-nav-toggle');
  await page.waitForTimeout(250);
  await page.click('#app-nav-panel button[data-area="landing"]');
  await page.waitForTimeout(1500);

  await page.selectOption('#ld-body', '301'); // Moon
  await page.waitForTimeout(300);

  const fuelInput = page.locator('input[data-lander="propellantMassKg"]');
  await fuelInput.fill('1200'); // Low fuel to exhaust before touchdown
  await page.waitForTimeout(300);
  await page.click('#ld-calculate');
  await page.waitForFunction(() => document.querySelector('#ld-results')?.children.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(800);

  await page.screenshot({ path: path.resolve('evidence/tercer_avance/09_Aterrizajes_Multicuerpo/aterrizaje_05_escenario_fallido_impacto_o_combustible_1920x1080.png') });
  console.log('Saved aterrizaje_05_escenario_fallido_impacto_o_combustible_1920x1080.png');
  await page.close();

  // --- 3. Mobile defect: truncated active probe text (390x844) ---
  console.log('Testing mobile layout defect in 390x844...');
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

  console.log('Batch 3 completed successfully!');
} catch (err) {
  console.error('Batch 3 failed:', err);
} finally {
  await browser.close();
  await server.close();
}
