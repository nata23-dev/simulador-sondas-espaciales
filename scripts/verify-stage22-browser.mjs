// Etapa 22 — verificación en Chrome del «Crucero de n cuerpos» con la misión guiada A1 (Cassini → Marte), con los controles del
// usuario: botón desactivado antes de calcular, cálculo de la misión, comparación bajo demanda, filas del resultado, que la misión
// no cambia (veredicto y fases iguales), que un cambio de condiciones invalida la comparación, y la misma comparación con
// «Empezar en la plataforma» (efecto de la Tierra fuera de su SOI). Uso: GPU=1 node scripts/verify-stage22-browser.mjs →
// capturas y registro en evidence/stage22/ (o EVIDENCE_DIR). Una sola instancia de Chrome y de Vite a la vez.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const out = path.resolve(process.env.EVIDENCE_DIR ?? 'evidence/stage22');
await fs.mkdir(out, { recursive: true });
const PORT = 5198;
const server = await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server.listen();
const gpu = process.env.GPU === '1';
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: gpu ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { gpu, startedAt: new Date().toISOString(), shots: [], checks: {}, errors: [], warnings: [] };

try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', e => log.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); else if (m.type() === 'warning') log.warnings.push(m.text().slice(0, 160)); });
  let nudge = 0;
  const wait = async ms => { const end = Date.now() + ms; while (Date.now() < end) { await page.mouse.move(4 + (nudge ^= 1), 4); await page.waitForTimeout(Math.max(0, Math.min(200, end - Date.now()))); } };
  const click = async (selector, timeout = 30000) => {
    const until = Date.now() + timeout; let last = 'no encontrado';
    while (Date.now() < until) {
      const hit = await page.evaluate(sel => {
        const el = document.querySelector(sel); if (!el) return { ok: false, why: 'no encontrado' };
        if (el.disabled) return { ok: false, why: 'desactivado' };
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return { ok: false, why: 'no visible' };
        const x = r.x + r.width / 2, y = r.y + r.height / 2, top = document.elementFromPoint(x, y);
        return top === el || el.contains(top) ? { ok: true, x, y } : { ok: false, why: `tapado por ${top?.id || top?.className || top?.tagName}` };
      }, selector);
      if (hit.ok) { await page.mouse.click(hit.x, hit.y); return; }
      last = hit.why; await wait(250);
    }
    throw new Error(`clic en ${selector}: ${last}`);
  };
  const shot = async name => { await wait(500); const file = `${name}.png`; await page.screenshot({ path: path.join(out, file) }); log.shots.push(file); };
  const compute = async () => {
    await click('#im-compute');
    await page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 200000 });
    await wait(500);
  };
  const openBox = () => page.evaluate(() => { const d = document.querySelector('#im-nbody-box'); d.open = true; d.scrollIntoView({ block: 'start' }); });
  const readBox = () => page.evaluate(() => ({ disabled: document.querySelector('#im-nbody').disabled, status: document.querySelector('#im-nbody-status').textContent,
    rows: [...document.querySelectorAll('#im-nbody-rows .lab-metric')].map(r => `${r.firstElementChild.textContent}: ${r.lastElementChild.textContent}`),
    terms: [...document.querySelectorAll('#im-nbody-box [data-term]')].map(e => e.dataset.term),
    verdict: document.querySelector('#im-verdict').textContent.trim(), phases: [...document.querySelectorAll('#im-phases .im-phase strong')].map(p => p.textContent) }));
  const compare = async () => {
    await click('#im-nbody');
    await page.waitForFunction(() => !document.querySelector('#im-nbody').disabled && !/Calculando/.test(document.querySelector('#im-nbody-status').textContent), null, { timeout: 120000 });
    await wait(400);
  };

  await page.addInitScript(() => { try { if (!sessionStorage.getItem('s22')) { localStorage.clear(); sessionStorage.setItem('s22', '1'); } } catch {} });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await wait(2000);
  await click('#app-nav-toggle'); await wait(400); await click('#app-nav-panel button[data-area="integrated"]'); await wait(1500);
  await page.waitForFunction(() => !document.querySelector('#experimental-lab').hidden, null, { timeout: 30000 });
  if (await page.locator('#im-scenario').inputValue() !== 'A1') { await page.selectOption('#im-scenario', 'A1'); await wait(300); }

  // 1 · Antes de calcular: botón desactivado.
  await openBox(); log.checks.antes = await readBox();
  // 2 · Calcular A1 y comparar.
  await compute(); await openBox(); log.checks.calculada = await readBox();
  const t = Date.now(); await compare(); log.checks.comparacionMs = Date.now() - t;
  await openBox(); log.checks.centro = await readBox();
  await shot('01_crucero_n_cuerpos_A1');
  // 3 · Cambiar una condición invalida la comparación.
  await click('#im-launch'); await wait(500); await openBox(); log.checks.trasCambio = await readBox();
  // 4 · Con la plataforma: calcular y comparar.
  await compute(); await compare(); await openBox(); log.checks.plataforma = await readBox();
  await shot('02_crucero_n_cuerpos_A1_plataforma');
  // 5 · Móvil (390 px).
  await page.setViewportSize({ width: 390, height: 844 }); await wait(1200); await openBox(); await shot('03_movil_crucero_n_cuerpos');
  log.checks.movil = await page.evaluate(() => ({ pageOverflowPx: document.documentElement.scrollWidth - window.innerWidth }));
  await page.close();
} catch (error) {
  log.errors.push(`FALLO DEL GUION: ${error.message.split('\n').slice(0, 4).join(' | ')}`);
} finally {
  await browser.close(); await server.close();
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, `verify-stage22${gpu ? '-gpu' : ''}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ errores: log.errors, capturas: log.shots.length }, null, 2));
}
