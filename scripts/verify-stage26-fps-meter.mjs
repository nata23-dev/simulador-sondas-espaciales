// Etapa 26 · Comprobación en Chrome del contador de FPS (compilación de producción con vite preview).
// Uso: npm run build && GPU=1 node scripts/verify-stage26-fps-meter.mjs [carpeta]   (por defecto evidence/stage26)
// Recorre: casilla del menú Capas → contador en el Sistema Solar, modo histórico y lanzamiento 3D (1600×900), móvil (390×844),
// persistencia tras recargar, desactivación, ?fps=1 y laboratorio en móvil. Anota si el contador tapa algún control y los errores de consola.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const out = path.resolve(process.argv[2] ?? 'evidence/stage26');
await fs.mkdir(out, { recursive: true });
const { preview } = await import(pathToFileURL(path.resolve('node_modules/vite/dist/node/index.js')).href);
const { chromium } = await import(pathToFileURL(path.join(process.env.LOCALAPPDATA, 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs')).href);
const PORT = 5200;
const server = await preview({ preview: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
const URL = `http://localhost:${PORT}/`;
const gpu = process.env.GPU === '1';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: [...(gpu ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--no-sandbox'] });
const log = { gpu, startedAt: new Date().toISOString(), checks: {}, shots: [], errors: [] };
const diag = 'window.__SIMULADOR_DIAGNOSTICO__';

try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); });
  let vaiven = 0;
  const wait = async ms => { const fin = Date.now() + ms; while (Date.now() < fin) { await page.mouse.move(4 + (vaiven ^= 1), 4); await page.waitForTimeout(Math.max(0, Math.min(200, fin - Date.now()))); } };
  const hasta = async (expr, ms) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await page.evaluate(expr).catch(() => false)) return true; await wait(200); } return false; };
  const shot = async nombre => { await wait(600); const file = `${nombre}.png`; await page.screenshot({ path: path.join(out, file) }); log.shots.push(file); };
  // Estado del contador y elementos interactivos que tiene debajo (no debería tapar nada: pointer-events:none, pero se anota).
  const medidor = () => page.evaluate(() => {
    const m = document.querySelector('.fps-meter');
    if (!m) return { existe: false };
    const r = m.getBoundingClientRect();
    const debajo = [...document.querySelectorAll('button, a, input, select, summary, [role="slider"]')].filter(el => {
      const b = el.getBoundingClientRect(); if (!b.width || !b.height || el.closest('[hidden]')) return false;
      const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') return false;
      return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top;
    }).map(el => el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30));
    const arriba = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { existe: true, visible: !m.hidden && r.width > 0, texto: m.textContent, estado: m.dataset.state ?? null,
      caja: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], controlesDebajo: debajo,
      eventosPasan: getComputedStyle(m).pointerEvents === 'none', encima: arriba === m || m.contains(arriba) };
  });
  const casilla = async marcar => {
    await page.evaluate(() => { const d = document.querySelector('#view-menu'); if (d) d.open = true; });
    await wait(300);
    const actual = await page.evaluate(() => document.querySelector('#show-fps').checked);
    if (actual !== marcar) { await page.locator('#show-fps').scrollIntoViewIfNeeded(); await page.locator('#show-fps').click({ force: true }); }
    await wait(300);
    await page.evaluate(() => { const d = document.querySelector('#view-menu'); if (d) d.open = false; });
  };

  await page.goto(URL);
  await hasta(`Boolean(${diag}) && !document.querySelector('#planet-select')?.disabled`, 120000);
  if (await page.evaluate(`Boolean(document.querySelector('#welcome-close-btn')?.offsetParent)`)) await page.click('#welcome-close-btn');
  await wait(1500);
  log.checks.inicial = await medidor();

  // 1 · Menú Capas → «Mostrar FPS».
  await page.evaluate(() => { document.querySelector('#view-menu').open = true; });
  await page.locator('#show-fps').scrollIntoViewIfNeeded(); await wait(400);
  await shot('fps-01-menu-capas');
  await casilla(true); await wait(1500);
  log.checks.exploracion = await medidor();
  await shot('fps-02-exploracion');

  // 2 · Modo histórico.
  await page.click('[data-mode-btn="historico"]'); await wait(2500);
  if (await page.evaluate(`Boolean(document.querySelector('#welcome-close-btn')?.offsetParent)`)) await page.click('#welcome-close-btn');
  await wait(1500);
  log.checks.historico = await medidor();
  await shot('fps-03-historico');
  await page.setViewportSize({ width: 390, height: 844 }); await wait(2000);
  log.checks.movilHistorico = { ...(await medidor()), desbordePx: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) };
  await shot('fps-03b-movil-historico');
  await page.setViewportSize({ width: 1600, height: 900 }); await wait(1000);

  // 3 · Lanzamiento 3D (Voyager 2): el contador queda por encima del lienzo del lanzamiento.
  await page.evaluate(`${diag}.iniciarLanzamiento('voyager-2')`);
  log.checks.lanzamientoListo = await hasta(`${diag}.obtenerEstadoLanzamiento().cargado && document.querySelector('.launch3d-canvas.is-visible') !== null`, 120000);
  await wait(6000);
  log.checks.lanzamiento = await medidor();
  await shot('fps-04-lanzamiento');

  // 4 · Móvil 390×844 durante el lanzamiento.
  await page.setViewportSize({ width: 390, height: 844 }); await wait(2500);
  log.checks.movilLanzamiento = { ...(await medidor()), desbordePx: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) };
  await shot('fps-05-movil-lanzamiento');
  await page.setViewportSize({ width: 1600, height: 900 }); await wait(1000);
  await page.evaluate(`${diag}.cerrarLanzamiento?.()`).catch(() => {});

  // 5 · La preferencia persiste al recargar; luego se desactiva y no queda nada visible.
  await page.reload();
  await hasta(`Boolean(${diag}) && !document.querySelector('#planet-select')?.disabled`, 120000);
  await wait(1500);
  log.checks.trasRecargar = { ...(await medidor()), casilla: await page.evaluate(() => document.querySelector('#show-fps').checked) };
  await page.setViewportSize({ width: 390, height: 844 }); await wait(2000);
  log.checks.movilExploracion = { ...(await medidor()), desbordePx: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) };
  await shot('fps-06-movil-exploracion');
  await page.setViewportSize({ width: 1600, height: 900 }); await wait(800);
  await casilla(false); await wait(800);
  log.checks.desactivado = { ...(await medidor()), guardado: await page.evaluate(() => localStorage.getItem('simulador:mostrar-fps')) };

  // 6 · ?fps=1 lo muestra sin tocar la preferencia guardada.
  await page.goto(`${URL}?fps=1`);
  await hasta(`Boolean(${diag}) && !document.querySelector('#planet-select')?.disabled`, 120000);
  await wait(1500);
  log.checks.parametroUrl = { ...(await medidor()), casilla: await page.evaluate(() => document.querySelector('#show-fps').checked),
    guardado: await page.evaluate(() => localStorage.getItem('simulador:mostrar-fps')) };

  // 7 · Laboratorio en móvil.
  await page.setViewportSize({ width: 390, height: 844 }); await wait(1000);
  await page.evaluate(() => document.querySelector('[data-mode-btn="experimental"]')?.click()); await wait(3000);
  log.checks.movilLaboratorio = { ...(await medidor()), desbordePx: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) };
  await shot('fps-07-movil-laboratorio');
} catch (e) {
  log.errors.push(`script: ${e.message}`);
} finally {
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, `verify-stage26-fps${gpu ? '-gpu' : ''}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 1));
  await browser.close(); await server.close();
}
