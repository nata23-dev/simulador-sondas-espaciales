// Etapa 29 · Comprobación en Chrome de la cabecera sin menús redundantes (compilación de producción con vite preview).
// Uso: npm run build && GPU=1 node scripts/verify-stage29-menus.mjs [carpeta]   (por defecto evidence/stage29)
// Recorre: cabecera con «Buscar» y un solo «Menú» (áreas + herramientas + ayuda) en 1600/1366/1024/760/390/320 px; apertura,
// cierre con Escape y con un clic fuera; herramienta de distancias dentro del menú; navegación a un área; «Buscar» sin texto
// (solo cuerpos y sondas) y con texto (áreas y acciones); la acción «distancias» abre el menú; «Capas» sin la escala repetida,
// con «Mínima» y el procesador gráfico. Anota desbordes, controles cortados y errores de consola.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const out = path.resolve(process.argv[2] ?? 'evidence/stage29');
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
  const wait = async ms => { const fin = Date.now() + ms; while (Date.now() < fin) { await page.mouse.move(4 + (vaiven ^= 1), 300); await page.waitForTimeout(Math.max(0, Math.min(200, fin - Date.now()))); } };
  const hasta = async (expr, ms) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await page.evaluate(expr).catch(() => false)) return true; await wait(200); } return false; };
  const shot = async nombre => { await wait(500); const file = `${nombre}.png`; await page.screenshot({ path: path.join(out, file) }); log.shots.push(file); };
  const cerrarBienvenida = async () => { if (await page.evaluate(`Boolean(document.querySelector('#welcome-close-btn')?.offsetParent)`)) await page.click('#welcome-close-btn'); };

  // Cabecera: qué botones hay, si caben y si alguno queda fuera de la pantalla o encima de otro.
  const cabecera = () => page.evaluate(() => {
    const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const caja = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    const acciones = [...document.querySelectorAll('.app-header button, .app-header summary')].filter(visible)
      .map(el => ({ id: el.id || null, texto: (el.getAttribute('aria-label') || el.textContent).trim().replace(/\s+/g, ' ').slice(0, 50), caja: caja(el) }));
    const fuera = acciones.filter(a => a.caja[0] < 0 || a.caja[0] + a.caja[2] > innerWidth + 1).map(a => a.texto);
    const solapes = [];
    for (let i = 0; i < acciones.length; i++) for (let j = i + 1; j < acciones.length; j++) {
      const [a, b] = [acciones[i].caja, acciones[j].caja];
      if (a[0] < b[0] + b[2] - 1 && b[0] < a[0] + a[2] - 1 && a[1] < b[1] + b[3] - 1 && b[1] < a[1] + a[3] - 1) solapes.push([acciones[i].texto, acciones[j].texto]);
    }
    return { ancho: innerWidth, desbordePx: document.documentElement.scrollWidth - innerWidth, menusAntiguos: document.querySelectorAll('#tools-menu, .main-menu').length,
      menu: document.querySelector('#app-nav-toggle')?.textContent.trim(), buscar: visible(document.querySelector('#header-search')), acciones, fuera, solapes };
  });
  const panel = () => page.evaluate(() => {
    const p = document.querySelector('#app-nav-panel'); if (!p) return { existe: false };
    const r = p.getBoundingClientRect();
    const t = document.querySelector('#main-tools');
    return { abierto: !p.hidden, caja: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], cabe: r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      desplazable: p.scrollHeight > p.clientHeight + 1, eyebrow: p.querySelector('.app-nav-head .eyebrow')?.textContent,
      areas: [...p.querySelectorAll('button[data-area]')].map(b => b.dataset.area),
      herramientasDentro: Boolean(t && p.contains(t) && !t.hidden), grupos: [...(t?.querySelectorAll('.menu-heading') ?? [])].map(h => h.textContent),
      distancias: Boolean(p.querySelector('#distance-menu')), ayuda: Boolean(p.querySelector('#camera-help')), fuentes: Boolean(p.querySelector('#source-menu')),
      expandido: document.querySelector('#app-nav-toggle')?.getAttribute('aria-expanded') };
  });
  const abrirMenu = async () => { if (!(await panel()).abierto) await page.click('#app-nav-toggle'); await wait(300); };

  await page.goto(URL);
  await hasta(`Boolean(${diag}) && !document.querySelector('#planet-select')?.disabled`, 120000);
  await cerrarBienvenida(); await wait(1200);

  // 1 · Cabecera y menú en varios anchos.
  for (const [w, h] of [[1600, 900], [1366, 768], [1024, 768], [760, 900], [390, 844], [320, 640]]) {
    await page.setViewportSize({ width: w, height: h }); await wait(900);
    const c = await cabecera();
    await abrirMenu();
    log.checks[`ancho_${w}`] = { cabecera: c, panel: await panel() };
    await shot(`menu-${w}`);
    await page.keyboard.press('Escape'); await wait(300);
    log.checks[`ancho_${w}`].cerradoConEscape = !(await panel()).abierto;
  }
  await page.setViewportSize({ width: 1600, height: 900 }); await wait(800);

  // 2 · Herramienta de distancias dentro del menú; un clic dentro no lo cierra, uno fuera sí.
  await abrirMenu();
  await page.click('#distance-menu > summary'); await wait(400);
  log.checks.distancias = { abierta: await page.evaluate(() => document.querySelector('#distance-menu').open), menuSigueAbierto: (await panel()).abierto };
  await shot('menu-distancias');
  await page.mouse.click(800, 600); await wait(400);
  log.checks.clicFuera = { menuCerrado: !(await panel()).abierto };

  // 3 · Abrir el menú cierra «Capas»; abrir «Capas» cierra el menú.
  await page.evaluate(() => { document.querySelector('#view-menu').open = true; }); await wait(200);
  await abrirMenu();
  log.checks.exclusion = { capasCerradaAlAbrirMenu: await page.evaluate(() => !document.querySelector('#view-menu').open) };
  // Con el menú abierto, el botón «Capas» queda bajo el panel (como antes con «Áreas»): se abre por código, como lo haría el teclado.
  await page.evaluate(() => { document.querySelector('#view-menu').open = true; }); await wait(400);
  log.checks.exclusion.menuCerradoAlAbrirCapas = !(await panel()).abierto;

  // 4 · «Capas»: sin la escala repetida; «Mínima» y procesador gráfico.
  await page.evaluate(() => { document.querySelector('#view-menu').open = true; }); await wait(300);
  log.checks.capas = await page.evaluate(() => ({
    escalaRepetida: Boolean(document.querySelector('#scale-scientific-option, #scale-exploratory-option')),
    escalaEnDock: document.querySelector('#scale-mode-button')?.textContent.trim().replace(/\s+/g, ' '),
    encabezados: [...document.querySelectorAll('#view-menu .menu-heading')].map(h => h.textContent.trim()),
    perfiles: [...document.querySelectorAll('[data-quality]')].map(b => `${b.dataset.quality}:${b.getAttribute('aria-pressed')}`),
    gpu: [...document.querySelectorAll('[data-gpu]')].map(b => `${b.dataset.gpu}:${b.getAttribute('aria-pressed')}`),
    estadoGpu: document.querySelector('[data-gpu-status]')?.textContent, avisoRecarga: !document.querySelector('[data-gpu-note]')?.hidden,
    encuadre: [...document.querySelectorAll('#region-inner-button, #options-overview-button')].map(b => b.textContent.trim())
  }));
  await page.locator('#quality-controls').scrollIntoViewIfNeeded(); await shot('capas-calidad');
  await page.click('[data-quality="minimo"]'); await wait(500);
  log.checks.capas.minima = { estado: await page.evaluate(() => document.querySelector('[data-quality-status]').textContent),
    pulsado: await page.evaluate(() => document.querySelector('[data-quality="minimo"]').getAttribute('aria-pressed')) };
  await page.click('[data-gpu="ahorro"]'); await wait(300);
  log.checks.capas.ahorro = { avisoRecarga: await page.evaluate(() => !document.querySelector('[data-gpu-note]').hidden) };
  await shot('capas-minima-ahorro');
  await page.click('[data-gpu="rendimiento"]'); await page.click('[data-quality="auto"]'); await wait(300);
  log.checks.capas.restaurado = await page.evaluate(() => ({ calidad: localStorage.getItem('simulador:calidad-grafica'), gpu: localStorage.getItem('simulador:gpu-preferida'), avisoRecarga: !document.querySelector('[data-gpu-note]').hidden }));
  await page.evaluate(() => { document.querySelector('#view-menu').open = false; });

  // 5 · «Buscar»: sin texto solo cuerpos y sondas; con texto, áreas y herramientas.
  const paleta = () => page.evaluate(() => ({ abierta: Boolean(document.querySelector('#command-palette') && !document.querySelector('#command-palette').hidden),
    grupos: [...document.querySelectorAll('#command-palette .cp-group')].map(g => g.textContent.trim()),
    resultados: [...document.querySelectorAll('#command-palette [role="option"]')].map(o => o.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)),
    vacio: document.querySelector('#command-palette .cp-empty')?.textContent ?? null }));
  await page.click('#header-search'); await wait(400);
  log.checks.buscarVacio = await paleta();
  await shot('buscar-vacio');
  await page.keyboard.type('lanz'); await wait(300);
  log.checks.buscarLanz = await paleta();
  await page.fill('#command-palette input', 'distancia'); await wait(300);
  log.checks.buscarDistancia = await paleta();
  await shot('buscar-distancia');
  await page.keyboard.press('Enter'); await wait(600);
  log.checks.accionDistancias = { paletaCerrada: !(await paleta()).abierta, menuAbierto: (await panel()).abierto,
    distanciasAbierta: await page.evaluate(() => document.querySelector('#distance-menu').open) };
  await shot('accion-distancias');
  await page.keyboard.press('Escape'); await wait(300);
  await page.evaluate(() => { document.querySelector('#distance-menu').open = false; });

  // 6 · Explorar: el filtro de la lista ya no se presenta como un segundo «Buscar».
  log.checks.filtroLista = await page.evaluate(() => document.querySelector('label[for="context-search-input"]')?.textContent);

  // 7 · Navegar desde el menú: modo histórico y Hangar del laboratorio; el menú sigue funcionando en cada modo.
  await abrirMenu();
  await page.click('#app-nav-panel button[data-area="voyager"]'); await wait(3000); await cerrarBienvenida(); await wait(800);
  log.checks.historico = { modo: await page.evaluate(() => document.querySelector('#app')?.dataset.appMode), cabecera: await cabecera() };
  await abrirMenu(); log.checks.historico.panel = await panel(); await shot('menu-historico');
  await page.keyboard.press('Escape'); await wait(300);
  await abrirMenu();
  const hangar = await page.evaluate(() => [...document.querySelectorAll('#app-nav-panel button[data-area]')].map(b => b.dataset.area).find(a => /hangar/.test(a)));
  if (hangar) { await page.click(`#app-nav-panel button[data-area="${hangar}"]`); await wait(3000); }
  log.checks.laboratorio = { area: hangar, modo: await page.evaluate(() => document.querySelector('#app')?.dataset.appMode), cabecera: await cabecera() };
  await abrirMenu(); log.checks.laboratorio.panel = await panel(); await shot('menu-laboratorio');
  await page.keyboard.press('Escape'); await wait(300);
} catch (e) {
  log.errors.push(`guion: ${e.message}`);
} finally {
  log.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'verify-stage29-menus.json'), JSON.stringify(log, null, 2));
  await browser.close(); await server.close();
}
console.log(JSON.stringify({ errores: log.errors, capturas: log.shots.length }, null, 1));
