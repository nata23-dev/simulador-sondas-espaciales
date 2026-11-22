// Etapa 25 · auditoría adversaria del lanzamiento 3D (con GPU real vía ANGLE/D3D11):
//   abrir y cerrar el lanzamiento 6 veces alternando misiones (lienzos sobrantes, memoria JS, modelo de NASA cargado),
//   saltos con NaN, ±1e9 s e Infinity, y avisos o errores de consola.
// Uso: node scripts/audit-stage25-cycles.mjs [raíz del proyecto] > evidence/stage25/auditoria/ciclos-y-saltos.json
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2] ?? '.');
const salida = path.join(root, 'evidence/stage25/auditoria');
fs.mkdirSync(salida, { recursive: true });
const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);
const { chromium } = await import(pathToFileURL(path.join(process.env.LOCALAPPDATA, 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs')).href);
const server = await createServer({ root, server: { port: 5191, strictPort: true }, configFile: path.join(root, 'vite.config.js'), logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const avisos = [];
page.on('console', m => { if (['warning', 'error'].includes(m.type()) && !m.text().includes('X4122')) avisos.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
page.on('pageerror', e => avisos.push(`pageerror: ${e.message}`));
await page.goto('http://localhost:5191/?mode=historical');
await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__ && !document.querySelector('#planet-select')?.disabled, null, { timeout: 90000 });
await page.waitForTimeout(1500);
if (await page.evaluate(() => document.querySelector('#welcome-close-btn')?.checkVisibility())) await page.click('#welcome-close-btn');
const resultado = { ciclos: [] };
for (let i = 0; i < 6; i++) {
  const m = i % 2 ? 'voyager-1' : 'voyager-2';
  await page.evaluate(id => window.__SIMULADOR_DIAGNOSTICO__.iniciarLanzamiento(id), m);
  await page.waitForFunction(() => document.querySelector('.launch3d-canvas.is-visible'), null, { timeout: 60000 });
  await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.irALanzamiento(3840));
  await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoLanzamiento()?.modeloNasa !== 'cargando', null, { timeout: 30000 });
  const estado = await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoLanzamiento().modeloNasa);
  await page.waitForTimeout(700);
  await page.click('#launch-skip-btn');
  await page.waitForFunction(() => document.querySelector('#launch-cinematic-overlay').hidden && !document.querySelector('.launch3d-canvas'), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  resultado.ciclos.push({ m, modeloNasa: estado, lienzos: await page.evaluate(() => document.querySelectorAll('canvas').length),
    heapMB: await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576)) });
}
// Saltos extremos.
await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.iniciarLanzamiento('voyager-2'));
await page.waitForFunction(() => document.querySelector('.launch3d-canvas.is-visible'), null, { timeout: 60000 });
resultado.saltos = {};
for (const t of ['NaN', '-1e9', '1e9', 'Infinity']) {
  await page.evaluate(v => window.__SIMULADOR_DIAGNOSTICO__.irALanzamiento(Number(v)), t);
  await page.waitForTimeout(500);
  resultado.saltos[t] = await page.evaluate(() => { const s = window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoLanzamiento(); return { tMision: s.tMision, progreso: s.progreso, reloj: s.reloj, alt: s.altitudKm }; });
}
await page.screenshot({ path: path.join(salida, 'ciclos-tras-saltos.png') });
await page.click('#launch-skip-btn');
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(salida, 'ciclos-escena-principal.png') });
resultado.avisos = avisos;
console.log(JSON.stringify(resultado, null, 1));
await browser.close(); await server.close();
