import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const PORT = 5195;
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.click('#app-nav-toggle');
  await page.waitForTimeout(250);
  await page.click('#app-nav-panel button[data-area="hangar"]');
  await page.waitForTimeout(1500);

  const el = page.locator('.lab-header');
  await el.screenshot({ path: path.resolve('evidence/tercer_avance/14_Defectos/defecto_01_truncamiento_sonda_activa_movil.png') });
  console.log('Saved defecto_01_truncamiento_sonda_activa_movil.png');
} finally {
  await browser.close();
  await server.close();
}
