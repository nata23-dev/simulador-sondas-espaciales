// Etapa 24 · Instantánea de estilos calculados para consolidar `!important` sin cambiar la presentación.
// Recorre exploración, modo histórico y laboratorio (1366 × 768 y 390 × 844), fuerza los estados que dependen de un atributo
// o de :hover (CDP) y guarda los valores calculados de los elementos afectados. Ejecutar antes y después del cambio y comparar:
//   node scripts/css-computed-snapshot.mjs antes.json   → (cambiar el CSS) →   node scripts/css-computed-snapshot.mjs despues.json
//   node scripts/css-computed-snapshot.mjs --diff antes.json despues.json
// Una sola instancia de Chrome y de Vite. Solo lee la interfaz (los atributos forzados se retiran tras cada lectura).
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

if (process.argv[2] === '--diff') {
  const [a, b] = await Promise.all(process.argv.slice(3, 5).map(async f => JSON.parse(await fs.readFile(f, 'utf8'))));
  const diffs = [];
  for (const state of new Set([...Object.keys(a.states), ...Object.keys(b.states)])) {
    const sa = a.states[state] ?? {}, sb = b.states[state] ?? {};
    for (const sel of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
      const ea = sa[sel] ?? [], eb = sb[sel] ?? [];
      if (ea.length !== eb.length) { diffs.push({ state, sel, why: `elementos ${ea.length} → ${eb.length}` }); continue; }
      ea.forEach((props, i) => { for (const p of Object.keys(props)) if (props[p] !== eb[i][p]) diffs.push({ state, sel, i, p, antes: props[p], despues: eb[i][p] }); });
    }
  }
  const counted = Object.values(a.states).reduce((n, s) => n + Object.values(s).reduce((m, list) => m + list.length, 0), 0);
  console.log(JSON.stringify({ elementosComparados: counted, diferencias: diffs.length, detalle: diffs }, null, 2));
  process.exit(diffs.length ? 1 : 0);
}

const { createServer } = await import('vite');
const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const outFile = path.resolve(process.argv[2] ?? 'css-snapshot.json');
const PORT = 5193;
const server = await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const PROPS = ['display', 'width', 'min-width', 'height', 'min-height', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-top-style', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'border-left-width', 'border-top-left-radius', 'border-bottom-right-radius',
  'background-color', 'background-image', 'color', 'font-size', 'font-weight', 'outline-style', 'outline-width', 'outline-color', 'outline-offset', 'opacity', 'cursor', 'grid-template-columns', 'flex-direction', 'row-gap', 'column-gap', 'box-shadow'];
const result = { createdAt: new Date().toISOString(), props: PROPS, states: {}, errors: [] };

async function run(width, height, name, fn) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', e => result.errors.push(`${name}: ${e.message}`));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const snap = async (state, selectors) => {
    result.states[`${name}/${state}`] = await page.evaluate(([sels, props]) => Object.fromEntries(sels.map(sel => [sel,
      [...document.querySelectorAll(sel)].slice(0, 6).map(el => { const cs = getComputedStyle(el); return Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p)])); })])), [selectors, PROPS]);
  };
  // Estado forzado por atributo o clase: se aplica, se lee y se retira.
  const forced = async (state, setup, selectors) => {
    await page.evaluate(setup.on); await page.waitForTimeout(80); await snap(state, selectors); await page.evaluate(setup.off);
  };
  // :hover forzado con CDP sobre el primer elemento de cada selector.
  const hover = async (state, selectors) => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const nodes = [];
    for (const sel of selectors) { const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel }); if (nodeId) { nodes.push(nodeId); await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] }); } }
    await page.waitForTimeout(250); // transiciones de 140 ms
    result.states[`${name}/${state}`] = await page.evaluate(([sels, props]) => Object.fromEntries(sels.map(sel => { const el = document.querySelector(sel);
      return [sel, el ? [Object.fromEntries(props.map(p => [p, getComputedStyle(el).getPropertyValue(p)]))] : []]; })), [selectors, PROPS]);
    for (const nodeId of nodes) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  };
  const area = async id => {
    await page.evaluate(() => document.querySelector('#app-nav-toggle').click()); await page.waitForTimeout(400);
    await page.evaluate(a => document.querySelector(`#app-nav-panel button[data-area="${a}"]`).click(), id); await page.waitForTimeout(2500);
  };
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('css-snap')) { localStorage.clear(); sessionStorage.setItem('css-snap', '1'); } } catch {} });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  // Sin transiciones ni animaciones: se comparan valores finales, no fotogramas intermedios (no afecta a la cascada medida).
  await page.addStyleTag({ content: '*, *::before, *::after { transition:none !important; animation:none !important; }' });
  try { await fn({ page, snap, forced, hover, area }); } catch (error) { result.errors.push(`${name}: ${error.message.split('\n')[0]}`); }
  await page.close();
}

const EXPLORE = ['.fm-card', '.fm-collapse', '.fm-all', '#app .temporal-layout', '#app input[type="checkbox"]:not(.keep-native)', '#app input[type="checkbox"]:not(.keep-native):checked',
  '#app #context-search-results', '#app .button-primary', '#launch-card-honesty', '.launch-card-honesty'];
const LAB = ['#experimental-lab .button-primary', '#experimental-lab button.button-primary', '#experimental-lab input[type="checkbox"]', '.mc-camera-bar button', '.lab-doc-kind', '#experimental-lab .lab-rail button'];
try {
  for (const [w, h] of [[1366, 768], [390, 844], [1100, 800]]) await run(w, h, `${w}x${h}`, async ({ page, snap, forced, hover, area }) => {
    await snap('exploracion', EXPLORE);
    await forced('destacadas-plegadas', { on: () => { const p = document.querySelector('.featured-panel'); if (p) p.dataset.collapsed = 'true'; }, off: () => { const p = document.querySelector('.featured-panel'); if (p) delete p.dataset.collapsed; } }, ['.fm-collapse', '.featured-panel .fm-head']);
    await hover('hover-exploracion', ['.fm-card', '#app .button-primary']);
    await area('voyager');
    await snap('historico', [...EXPLORE, '#app #pane-history .historical-event-list button']);
    await hover('hover-historico', ['#app .button-primary', '#app #pane-history .historical-event-list button']);
    await area('hangar');
    await page.waitForFunction(() => !document.querySelector('#experimental-lab').hidden, null, { timeout: 30000 }); await page.waitForTimeout(2000);
    await snap('laboratorio', LAB);
    await forced('ocupado', { on: () => document.querySelector('#experimental-lab .button-primary')?.setAttribute('aria-busy', 'true'), off: () => document.querySelector('#experimental-lab .button-primary')?.removeAttribute('aria-busy') }, ['#experimental-lab button[aria-busy="true"]']);
    await forced('objetivo-guia', { on: () => document.querySelector('#experimental-lab .lab-rail button')?.classList.add('lab-guide-target'), off: () => document.querySelector('#experimental-lab .lab-rail button')?.classList.remove('lab-guide-target') }, ['#experimental-lab .lab-guide-target']);
    await forced('camara-pulsada', { on: () => document.querySelector('.mc-camera-bar button')?.setAttribute('aria-pressed', 'true'), off: () => document.querySelector('.mc-camera-bar button')?.removeAttribute('aria-pressed') }, ['.mc-camera-bar button[aria-pressed="true"]']);
    await forced('documento-sin-imagen', { on: () => { const c = document.querySelector('#experimental-lab .lab-doc-card') ?? document.querySelector('#experimental-lab'); const s = document.createElement('span'); s.className = 'lab-doc-missing'; s.id = 'css-snap-probe'; c.append(s); }, off: () => document.querySelector('#css-snap-probe')?.remove() }, ['#css-snap-probe']);
    await hover('hover-laboratorio', ['#experimental-lab .button-primary', '.mc-camera-bar button']);
  });
} finally {
  await browser.close(); await server.close();
  await fs.writeFile(outFile, JSON.stringify(result, null, 1));
  const counted = Object.values(result.states).reduce((n, s) => n + Object.values(s).reduce((m, list) => m + list.length, 0), 0);
  console.log(`${outFile}: ${Object.keys(result.states).length} estados, ${counted} elementos, ${result.errors.length} errores${result.errors.length ? `: ${result.errors.join(' | ')}` : ''}`);
}
