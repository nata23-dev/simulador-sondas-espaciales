// Etapa 26 · Repaso general de fluidez: intervalos entre fotogramas y fotogramas largos (> 50 ms, con su causa según Long
// Animation Frames de Chrome) por fase —exploración, modo histórico, laboratorio y reproducción de A1 en el Sistema Solar—, sobre
// la compilación de producción (vite preview) con la GPU real (ANGLE/Direct3D 11).
// Uso: npm run build && node scripts/profile-general-performance.mjs [salida.json]   (DPR=2 para pantalla de alta densidad)
// Una sola instancia de Chrome y de Vite a la vez.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const salidaJson = path.resolve(process.argv[2] ?? 'evidence/stage26/general-profile.json');
await fs.mkdir(path.dirname(salidaJson), { recursive: true });
const { preview } = await import(pathToFileURL(path.resolve('node_modules/vite/dist/node/index.js')).href);
const { chromium } = await import(pathToFileURL(path.join(process.env.LOCALAPPDATA, 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs')).href);
const server = await preview({ preview: { port: 5200, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
const page = await ctx.newPage();
const errores = []; page.on('pageerror', e => errores.push(e.message)); page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
await page.addInitScript(() => {
  const r = window.__R = { fase: 'carga', frames: [], loaf: [] };
  let ultimo = null;
  const bucle = t => { if (ultimo !== null) r.frames.push([r.fase, t - ultimo]); ultimo = t; requestAnimationFrame(bucle); };
  requestAnimationFrame(bucle);
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 50) r.loaf.push({ fase: r.fase, ms: Math.round(e.duration), bloqueo: Math.round(e.blockingDuration),
    scripts: e.scripts.map(s => ({ ms: Math.round(s.duration), f: `${s.sourceFunctionName || ''}@${(s.sourceURL || '').split('/').pop()}:${s.sourceCharPosition}`, inv: s.invoker })).sort((a, b) => b.ms - a.ms).slice(0, 3) }); })
    .observe({ type: 'long-animation-frame', buffered: true });
});
const diag = 'window.__SIMULADOR_DIAGNOSTICO__';
let v = 0;
const wait = async ms => { const fin = Date.now() + ms; while (Date.now() < fin) { await page.mouse.move(800 + (v ^= 1), 450); await page.waitForTimeout(Math.min(200, Math.max(0, fin - Date.now()))); } };
const hasta = async (expr, ms) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await page.evaluate(expr).catch(() => false)) return true; await wait(200); } return false; };
const fase = f => page.evaluate(x => { window.__R.fase = x; }, f);
const click = async sel => { const el = page.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await el.click(); };

await page.goto('http://localhost:5200/');
await hasta(`Boolean(${diag}) && !document.querySelector('#planet-select')?.disabled`, 120000);
if (await page.evaluate(`Boolean(document.querySelector('#welcome-close-btn')?.offsetParent)`)) await page.click('#welcome-close-btn');
await fase('exploracion-reposo'); await wait(5000);
await fase('exploracion-reproducir'); await page.evaluate(() => document.querySelector('#play-button')?.click()); await wait(5000);
await fase('exploracion-arrastre');
for (let i = 0; i < 20; i++) { await page.mouse.move(800, 450); await page.mouse.down(); await page.mouse.move(900 + i * 5, 470, { steps: 8 }); await page.mouse.up(); }
await wait(1000);
await fase('entrar-historico'); await page.click('[data-mode-btn="historico"]'); await wait(4000);
if (await page.evaluate(`Boolean(document.querySelector('#welcome-close-btn')?.offsetParent)`)) await page.click('#welcome-close-btn');
await fase('historico-reposo'); await wait(4000);
await fase('historico-reproducir'); await page.evaluate(() => document.querySelector('#play-button')?.click()); await wait(6000);
await fase('volver-exploracion'); await page.click('[data-mode-btn="exploracion"]'); await wait(4000);
await fase('entrar-laboratorio'); await page.click('[data-mode-btn="experimental"]'); await wait(5000);
// A1 (Cassini → Marte) calculada y reproducida en el Sistema Solar principal.
let lab = 'sin flujo';
try {
  await click('#app-nav-toggle'); await wait(400); await click('#app-nav-panel button[data-area="integrated"]'); await wait(1500);
  await page.selectOption('#im-scenario', 'A1'); await wait(400);
  await fase('lab-calcular'); await click('#im-compute');
  await page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 200000 });
  await wait(800);
  await fase('lab-abrir-reproduccion'); await click('#im-execute');
  await page.waitForFunction(() => document.querySelector('#lab-mission-center')?.dataset.scene === 'main', null, { timeout: 90000 });
  await wait(3000);
  await fase('lab-reproduccion'); await wait(8000);
  lab = 'ok';
} catch (e) { lab = e.message.slice(0, 160); }
const r = await page.evaluate(() => window.__R);
const porFase = {};
for (const [f, ms] of r.frames) (porFase[f] ??= []).push(ms);
const resumen = Object.fromEntries(Object.entries(porFase).map(([f, xs]) => { const s = [...xs].sort((a, b) => a - b); return [f, { n: xs.length, fps: +(1000 * xs.length / xs.reduce((a, b) => a + b, 0)).toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1), largos50: xs.filter(x => x > 50).length }]; }));
const salida = { lab, errores, resumen, loaf: r.loaf };
await fs.writeFile(salidaJson, JSON.stringify({ fecha: new Date().toISOString(), dpr: Number(process.env.DPR ?? 1), ...salida }, null, 1));
for (const [f, x] of Object.entries(resumen)) console.log(f.padEnd(24), JSON.stringify(x));
console.log('lab:', lab, 'errores:', errores.length);
for (const l of r.loaf.filter(l => l.fase !== 'carga')) console.log('loaf', l.fase, l.ms, JSON.stringify(l.scripts));
await browser.close(); await server.close();
