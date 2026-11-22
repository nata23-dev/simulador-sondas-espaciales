// Etapa 18 · Medición de la carga inicial sobre la compilación de producción (vite preview) en Chrome sin interfaz.
// Uso: npm run build && node scripts/measure-startup.mjs <salida.json>   (GPU=1 usa la GPU real con Direct3D 11)
// Mide, en escritorio (1366×768) y en móvil (390×844, DPR 3, táctil): peticiones y bytes transferidos hasta la red en reposo,
// por tipo y por archivo; primera pintura, tareas largas y errores de consola. Después abre el modo histórico, el laboratorio y
// la cinemática de lanzamiento para registrar lo que se descarga BAJO DEMANDA en cada uno. No modifica nada del proyecto.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const out = process.argv[2] ?? 'evidence/stage18/startup.json';
const { preview } = await import(pathToFileURL(path.resolve('node_modules/vite/dist/node/index.js')).href);
const { chromium } = await import(pathToFileURL(path.join(process.env.LOCALAPPDATA, 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs')).href);
const PORT = 5194;
const server = await preview({ preview: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
const URL = `http://localhost:${PORT}/`;
const gpu = process.env.GPU === '1';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: [...(gpu ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--no-sandbox'] });

function recorder(cdp) {
  const urls = new Map(), files = [];
  cdp.on('Network.responseReceived', e => urls.set(e.requestId, e.response.url));
  cdp.on('Network.loadingFinished', e => { const u = urls.get(e.requestId); if (u) files.push([u.replace(URL, ''), e.encodedDataLength]); });
  return {
    mark: () => files.length,
    summary(from = 0) {
      const list = files.slice(from), byType = {};
      for (const [u, b] of list) { const ext = (u.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? 'otro').toLowerCase(); byType[ext] = (byType[ext] ?? 0) + b; }
      const mb = b => +(b / 1048576).toFixed(2);
      return { requests: list.length, mb: mb(list.reduce((a, [, b]) => a + b, 0)),
        mbPorTipo: Object.fromEntries(Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, mb(v)])),
        mayores: list.sort((a, b) => b[1] - a[1]).slice(0, 25).map(([u, b]) => [u, mb(b)]) };
    }
  };
}

async function open(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}) });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { window.__LONG__ = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__LONG__.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch {} });
  const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable');
  const rec = recorder(cdp);
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__?.obtenerDiagnosticoEscena, null, { timeout: 90000 });
  const readyMs = Date.now() - t0;
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(2500);
  const nav = await page.evaluate(() => { const p = performance.getEntriesByName('first-contentful-paint')[0];
    return { fcp: p ? Math.round(p.startTime) : null, longTasks: window.__LONG__.length, longTaskMs: Math.round(window.__LONG__.reduce((a, b) => a + b, 0)), maxLongTask: Math.round(Math.max(0, ...window.__LONG__)) }; });
  return { ctx, page, rec, errors, inicio: { readyMs, ...nav, ...rec.summary() } };
}

const result = { url: URL, gpu, fecha: new Date().toISOString() };
try {
  const d = await open({ width: 1366, height: 768 }, false);
  result.escritorio = d.inicio;
  const page = d.page;
  // Bajo demanda: modo histórico Voyager.
  let m = d.rec.mark();
  await page.click('#app-nav-toggle'); await page.waitForTimeout(400);
  await page.click('#app-nav-panel button[data-area="voyager"]'); await page.waitForTimeout(3000);
  if (await page.locator('#welcome-explore-free').isVisible().catch(() => false)) await page.click('#welcome-explore-free');
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(2500);
  result.alAbrirHistorico = d.rec.summary(m);
  // Bajo demanda: cinemática de lanzamiento.
  m = d.rec.mark();
  const launch = page.locator('#hist-launch-cinematic-btn');
  if (await launch.isVisible().catch(() => false)) { await launch.click(); await page.waitForTimeout(4000); await page.waitForLoadState('networkidle'); }
  result.alAbrirLanzamiento = d.rec.summary(m);
  await page.keyboard.press('Escape').catch(() => {});
  // Bajo demanda: laboratorio.
  m = d.rec.mark();
  await page.goto(URL + '#', { waitUntil: 'load' }).catch(() => {});
  await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__?.obtenerDiagnosticoEscena, null, { timeout: 90000 });
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500);
  m = d.rec.mark();
  await page.click('#app-nav-toggle'); await page.waitForTimeout(400);
  await page.click('#app-nav-panel button[data-area="hangar"]'); await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500);
  result.alAbrirLaboratorio = d.rec.summary(m);
  result.erroresEscritorio = d.errors;
  await d.ctx.close();
  const mo = await open({ width: 390, height: 844 }, true);
  result.movil = { ...mo.inicio, calidad: await mo.page.evaluate(() => document.documentElement.dataset.quality ?? null) };
  result.erroresMovil = mo.errors;
  await mo.ctx.close();
} finally { await browser.close(); await new Promise(r => server.httpServer.close(r)); }
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(result, null, 2));
const s = x => `${x.requests} peticiones, ${x.mb} MB`;
console.log(`escritorio: ${s(result.escritorio)} · móvil: ${s(result.movil)} · histórico +${s(result.alAbrirHistorico)} · lanzamiento +${s(result.alAbrirLanzamiento)} · laboratorio +${s(result.alAbrirLaboratorio)} · errores ${result.erroresEscritorio.length + result.erroresMovil.length}`);
