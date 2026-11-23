// Auditoría Final de Aceptación — Funcional, UX/UI (7 resoluciones + táctil), Estabilidad, Lanzamiento 3D y Chrome+Edge.
// Se ejecuta sobre la compilación de producción (`dist/` con GITHUB_PAGES=true en `/simulador-sondas-espaciales/`).
import http from 'node:http';
import fs from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(DIR, '../../../..');
const DIST = path.join(RAIZ, 'dist');
const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE ?? path.join(process.env.LOCALAPPDATA, 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm', '.bin': 'application/octet-stream'
};

function iniciarServidorProd() {
  const srv = http.createServer((req, res) => {
    const limpio = decodeURIComponent((req.url || '/').split('?')[0]);
    if (!limpio.startsWith('/simulador-sondas-espaciales')) { res.writeHead(404); res.end('Not found'); return; }
    const rel = limpio.replace(/^\/simulador-sondas-espaciales\/?/, '');
    const archivo = path.join(DIST, rel || 'index.html');
    if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(archivo).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(archivo).pipe(res);
  });
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/simulador-sondas-espaciales/` })));
}

const out = {
  fecha: new Date().toISOString(),
  navegadores: {},
  modulos: {},
  lanzamiento3D: {},
  estabilidad: {},
  responsive: [],
  edge: {},
  fallos: []
};
const comprobar = (nombre, ok, detalle) => { if (!ok) out.fallos.push({ nombre, detalle }); return Boolean(ok); };
const hasta = async (page, fn, ms = 30000, arg) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch { return false; } };

const { srv, url } = await iniciarServidorProd();
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const browser = await chromium.launch({
  executablePath: chromePath, headless: true,
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--expose-gc']
});
out.navegadores.chrome = browser.version();

try {
  // =========================================================================
  // 1. AUDITORÍA FUNCIONAL COMPLETA DE LOS 3 MÓDULOS + LANZAMIENTO 3D (CHROME)
  // =========================================================================
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(() => {
    const contextos = [];
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) {
      const c = orig.call(this, tipo, ...resto);
      if (c && (tipo === 'webgl2' || tipo === 'webgl')) contextos.push(new WeakRef(c));
      return c;
    };
    window.__AUD_ACC__ = { contextos, renderersLanz: [] };
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errs = { page: [], console: [], http: [] };
  page.on('pageerror', e => errs.page.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.console.push(m.text().slice(0, 220)); });
  page.on('response', r => { if (r.status() >= 400) errs.http.push(`${r.status()} ${new URL(r.url()).pathname}`); });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const cargado = await hasta(page, () => window.__SIMULADOR_DIAGNOSTICO__ && !document.querySelector('#planet-select')?.disabled, 60000);
  await page.waitForTimeout(700);
  comprobar('Arranque normal en compilación de producción', cargado, errs);

  // --- MÓDULO A: SISTEMA SOLAR ---
  {
    const base = await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerDiagnosticoEscena());
    await page.selectOption('#planet-select', 'Saturno', { force: true });
    await page.waitForTimeout(500);
    const saturno = await page.evaluate(() => ({
      titulo: document.querySelector('#info-title')?.textContent?.trim(),
      dist: document.querySelector('#info-distance-au')?.textContent?.trim(),
      sel: window.__SIMULADOR_DIAGNOSTICO__.obtenerDiagnosticoEscena().camara.seleccionado
    }));
    await page.click('#scale-mode-button');
    await page.waitForTimeout(250);
    const escalaAlt = await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerDiagnosticoEscena().modoEscala);
    await page.click('#scale-mode-button');
    await page.selectOption('#playback-speed', '4', { force: true });
    await page.click('#play-button');
    await page.waitForTimeout(500);
    await page.click('#play-button');
    const fechaDespues = await page.evaluate(() => document.querySelector('#scene-date')?.textContent?.trim());
    await page.click('#reset-button');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(DIR, 'acc-solar-1600.png') });
    out.modulos.sistemaSolar = {
      planetas: Object.keys(base.planetas).length,
      lunasVisibles: base.lunasVisibles,
      renderPausado: base.renderPausado,
      saturno, escalaAlt, fechaDespues
    };
    comprobar('Módulo Sistema Solar: 8 planetas, selección Saturno, escala y reloj activos',
      Object.keys(base.planetas).length >= 8 && saturno.sel === 'Saturno' && !base.renderPausado && escalaAlt !== base.modoEscala,
      out.modulos.sistemaSolar);
  }

  // --- MÓDULO B: MISIONES HISTÓRICAS VOYAGER 1/2 ---
  {
    await page.click('[data-mode-btn="historico"]');
    const bienvenida = await hasta(page, () => document.querySelector('#historical-welcome-modal') && !document.querySelector('#historical-welcome-modal').hidden, 60000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('[data-event-id="v1-europa-1979"]')?.click());
    await page.waitForTimeout(700);
    const europa = await page.evaluate(() => ({
      evento: document.querySelector('#hist-ev-title')?.textContent?.trim(),
      utc: document.querySelector('#hist-clock-utc')?.textContent?.trim(),
      fotoBtnVisible: !document.querySelector('#hist-ev-photo-btn')?.hidden,
      modelos: window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoModelosHistoricos()
    }));
    // Abrir pestaña Historia y comparador NASA A/B, verificando transparencia ("NO ES FOTOGRAFÍA")
    await page.click('[data-inspector-tab="history"]');
    await page.waitForTimeout(300);
    await page.click('#hist-ev-photo-btn');
    const compAbierto = await hasta(page, () => !document.querySelector('#photo-comparator-panel')?.hidden, 10000);
    await page.waitForTimeout(400);
    const compInfo = await page.evaluate(() => ({
      etiquetaWebGL: document.querySelector('.comparator-tag--webgl')?.textContent?.trim(),
      tituloFoto: document.querySelector('#comp-photo-title')?.textContent?.trim(),
      imgCargada: document.querySelector('#comp-photo-img')?.complete && document.querySelector('#comp-photo-img')?.naturalWidth > 0
    }));
    await page.screenshot({ path: path.join(DIR, 'acc-historico-comparador.png') });
    await page.click('#comp-close-btn');
    await page.waitForTimeout(300);
    out.modulos.historico = { bienvenida, europa, compAbierto, compInfo };
    comprobar('Módulo Histórico: bienvenida, evento Europa, comparador NASA con distinción explícita',
      bienvenida && compAbierto && /NO ES FOTOGRAFÍA/i.test(compInfo.etiquetaWebGL || '') && compInfo.imgCargada,
      out.modulos.historico);
  }

  // --- MÓDULO D: LANZAMIENTO 3D (5 CICLOS EN PRODUCCIÓN + CIERRE TEMPRANO) ---
  {
    const ciclos = [];
    for (let i = 1; i <= 5; i++) {
      const mId = i % 2 === 1 ? 'voyager-2' : 'voyager-1';
      await page.evaluate(id => window.__SIMULADOR_DIAGNOSTICO__.iniciarLanzamiento(id), mId);
      const listo = await hasta(page, () => {
        const e = window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoLanzamiento();
        const l = document.querySelector('#launch-loading');
        return e.activo && e.cargado && (!l || l.hidden);
      }, 60000);
      await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.irALanzamiento(275));
      await page.waitForTimeout(250);
      const cofiaAbierta = await page.evaluate(() => {
        const sc = window.__SIMULADOR_DIAGNOSTICO__.interiorLanzamiento()?.escena;
        const nave = sc?.getObjectByName('VoyagerPlegada')?.parent;
        return Boolean(nave?.visible);
      });
      await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.irALanzamiento(4450));
      const nasaOk = await hasta(page, () => window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoLanzamiento().modeloNasa === 'cargado', 30000);
      await page.waitForTimeout(200);
      if (i === 1) await page.screenshot({ path: path.join(DIR, 'acc-lanzamiento-voyager.png') });
      await page.evaluate(() => {
        const r = window.__SIMULADOR_DIAGNOSTICO__.interiorLanzamiento()?.renderer;
        if (r) window.__AUD_ACC__.renderersLanz.push(new WeakRef(r));
      });
      await page.click('#launch-skip-btn');
      await hasta(page, () => !window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoLanzamiento().activo, 15000);
      await page.waitForTimeout(250);
      for (let g = 0; g < 3; g++) { await cdp.send('HeapProfiler.collectGarbage'); await page.evaluate(() => window.gc?.()); await page.waitForTimeout(80); }
      const mem = await page.evaluate(() => ({
        renderersVivos: window.__AUD_ACC__.renderersLanz.filter(r => r.deref()).length,
        contextosVivos: window.__AUD_ACC__.contextos.filter(c => c.deref()).length,
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null
      }));
      ciclos.push({ ciclo: i, mId, listo, cofiaAbierta, nasaOk, ...mem });
    }
    // Cierre temprano durante la carga
    await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.iniciarLanzamiento('voyager-2'));
    await hasta(page, () => window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoLanzamiento().activo, 10000);
    await page.waitForTimeout(160);
    await page.click('#launch-skip-btn');
    await hasta(page, () => !window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoLanzamiento().activo, 10000);
    await page.waitForTimeout(1200);
    for (let g = 0; g < 3; g++) { await cdp.send('HeapProfiler.collectGarbage'); await page.evaluate(() => window.gc?.()); await page.waitForTimeout(80); }
    const postTemprano = await page.evaluate(() => ({
      renderersVivos: window.__AUD_ACC__.renderersLanz.filter(r => r.deref()).length,
      contextosVivos: window.__AUD_ACC__.contextos.filter(c => c.deref()).length,
      canvasesDom: document.querySelectorAll('canvas').length
    }));
    out.lanzamiento3D = { ciclos, postTemprano };
    comprobar('Lanzamiento 3D: 5 ciclos + cierre temprano sin retención de renderizadores ni contextos',
      ciclos.every(c => c.listo && c.nasaOk && c.renderersVivos === 0 && c.contextosVivos === 1) && postTemprano.renderersVivos === 0 && postTemprano.contextosVivos === 1,
      out.lanzamiento3D);
  }

  // --- MÓDULO C: LABORATORIO (2 RECORRIDOS COMPLETOS + GEN-02 + PERF-01 + PERF-03) ---
  {
    await page.click('[data-mode-btn="experimental"]');
    await hasta(page, () => Boolean(document.querySelector('#lab-ctx-probe')), 20000);
    await page.waitForTimeout(600);
    const perf01EnHangar = await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerDiagnosticoEscena());

    // Recorrido 1: Cassini -> Marte (A1 desde plataforma LC-41 + Web Worker Long Tasks)
    await page.selectOption('#lab-ctx-probe', 'cassini', { force: true });
    await page.waitForTimeout(300);
    await page.click('[data-lab-tab="engineering"]');
    await page.waitForTimeout(250);
    const ingCassini = await page.evaluate(() => document.querySelector('#lab-tool-title')?.textContent?.trim());
    await page.click('[data-lab-stage="plan"]');
    await page.click('[data-lab-tab="integrated"]');
    await page.selectOption('#im-scenario', 'A1', { force: true });
    const checkPad = await page.locator('#im-launch-pad').isVisible().catch(() => false);
    if (checkPad) await page.check('#im-launch-pad');

    // Medir Long Tasks durante el cálculo en Worker (PERF-03)
    const workerA1 = await page.evaluate(() => new Promise(resolve => {
      const longTasks = [];
      const obs = new PerformanceObserver(l => { for (const e of l.getEntries()) longTasks.push(Math.round(e.duration)); });
      obs.observe({ type: 'longtask' });
      const t0 = performance.now();
      document.querySelector('#im-compute').click();
      const poll = () => {
        const btn = document.querySelector('#im-compute');
        const exec = document.querySelector('#im-execute');
        if (!btn.disabled && (!exec.disabled || performance.now() - t0 > 15000)) {
          obs.disconnect();
          resolve({ wallMs: Math.round(performance.now() - t0), longTasks, executeDisabled: exec.disabled, verdict: document.querySelector('#im-verdict')?.textContent?.trim()?.slice(0, 100) });
        } else requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    }));
    await page.click('#im-execute');
    const enMainCassini = await hasta(page, () => document.querySelector('#lab-mission-center')?.dataset.scene === 'main', 30000);
    await page.waitForTimeout(600);
    const centroCassini = await page.evaluate(() => ({
      escena: window.__SIMULADOR_DIAGNOSTICO__.obtenerDiagnosticoEscena(),
      mision: window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMisionEscenaPrincipal()
    }));
    await page.screenshot({ path: path.join(DIR, 'acc-lab-centro-cassini.png') });

    // Recorrido 2: Juno -> Júpiter / Europa (C1) + prueba de carrera GEN-02
    await page.click('[data-lab-stage="plan"]');
    await page.click('[data-lab-tab="integrated"]');
    await page.selectOption('#lab-ctx-probe', 'juno', { force: true });
    await page.waitForTimeout(300);

    // GEN-02: lanzar A1 y cambiar inmediatamente a C1
    await page.selectOption('#im-scenario', 'A1', { force: true });
    await page.evaluate(() => {
      document.querySelector('#im-compute').click();
      setTimeout(() => {
        const sel = document.querySelector('#im-scenario');
        sel.value = 'C1';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }, 10);
    });
    await page.waitForTimeout(900);
    const gen02Estado = await page.evaluate(() => ({
      escenario: document.querySelector('#im-scenario')?.value,
      executeDisabled: document.querySelector('#im-execute')?.disabled,
      mensaje: document.querySelector('#im-message')?.textContent?.trim()
    }));

    // Calcular C1 con Juno y verificar que Juno es la sonda usada
    await page.click('#im-compute');
    await hasta(page, () => !document.querySelector('#im-compute')?.disabled, 30000);
    const junoC1 = await page.evaluate(() => ({
      sonda: document.querySelector('#lab-ctx-probe')?.value,
      veredicto: document.querySelector('#im-verdict')?.textContent?.trim()?.slice(0, 120),
      executeDisabled: document.querySelector('#im-execute')?.disabled,
      escenario: document.querySelector('#im-scenario')?.value
    }));
    if (!junoC1.executeDisabled) {
      await page.click('#im-execute');
      await hasta(page, () => document.querySelector('#lab-mission-center')?.dataset.scene === 'main', 30000);
      await page.waitForTimeout(400);
      junoC1.centro = await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMisionEscenaPrincipal());
    }

    out.modulos.laboratorio = { perf01EnHangar: { renderPausado: perf01EnHangar.renderPausado, rafActivo: perf01EnHangar.rafActivo, motivos: perf01EnHangar.motivosPausa }, ingCassini, workerA1, enMainCassini, centroCassini: { renderPausado: centroCassini.escena.renderPausado, probe: centroCassini.mision?.probeName, destino: centroCassini.mision?.title }, gen02Estado, junoC1 };
    comprobar('PERF-01: escena principal pausada en Hangar y reanudada en Centro de Misión',
      perf01EnHangar.renderPausado === true && perf01EnHangar.rafActivo === false && enMainCassini && centroCassini.escena.renderPausado === false,
      out.modulos.laboratorio);
    comprobar('PERF-03: cálculo integrado en Worker sin Long Tasks (>50ms)',
      workerA1.longTasks.length === 0 && !workerA1.executeDisabled, workerA1);
    comprobar('GEN-02: cambio A1->C1 durante cálculo descarta el resultado obsoleto',
      gen02Estado.escenario === 'C1' && gen02Estado.executeDisabled === true, gen02Estado);
    comprobar('Laboratorio recorrido 2 (Juno C1): sonda Juno aplicada en planificación y ejecución',
      junoC1.sonda === 'juno' && (!junoC1.centro || /Juno/i.test(junoC1.centro.probeName || '')), junoC1);
  }

  // Cambios rápidos de módulo (estabilidad de sesión)
  {
    for (const m of ['exploracion', 'historico', 'experimental', 'exploracion', 'historico', 'exploracion', 'experimental', 'exploracion']) {
      await page.click(`[data-mode-btn="${m}"]`);
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(500);
    const finalMode = await page.evaluate(() => ({
      modo: document.querySelector('#app').dataset.appMode,
      diag: window.__SIMULADOR_DIAGNOSTICO__.obtenerDiagnosticoEscena()
    }));
    out.estabilidad.cambiosRapidos = { modo: finalMode.modo, renderPausado: finalMode.diag.renderPausado, rafActivo: finalMode.diag.rafActivo, errs };
    comprobar('Estabilidad: cambios rápidos sin errores de página, consola ni HTTP',
      errs.page.length === 0 && errs.console.length === 0 && errs.http.length === 0 && finalMode.modo === 'exploracion' && !finalMode.diag.renderPausado,
      out.estabilidad.cambiosRapidos);
  }
  await ctx.close();

  // =========================================================================
  // 2. ESTABILIDAD ANTE FALLOS: SIN WEBGL2 (STAB-01) Y FALLO HTTP DE DATOS
  // =========================================================================
  {
    // 2a) Sin WebGL2 en escena principal
    const ctxNoGl = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctxNoGl.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...r) {
        if (t === 'webgl2' || t === 'webgl' || t === 'experimental-webgl') return null;
        return orig.call(this, t, ...r);
      };
    });
    const pNoGl = await ctxNoGl.newPage();
    const glErrs = [];
    pNoGl.on('pageerror', e => glErrs.push(e.message));
    await pNoGl.goto(url, { waitUntil: 'domcontentloaded' });
    await pNoGl.waitForTimeout(1200);
    const noGlState = await pNoGl.evaluate(() => ({
      pageErrors: 0,
      alertDialogVisible: Boolean(document.querySelector('#webgl-unavailable[role="alertdialog"]')),
      status: document.querySelector('#data-status')?.textContent?.trim(),
      appInert: Boolean(document.querySelector('#app')?.inert)
    }));
    noGlState.pageErrors = glErrs.length;
    await pNoGl.screenshot({ path: path.join(DIR, 'acc-sin-webgl2.png') });
    await ctxNoGl.close();

    // 2b) Fallo HTTP 500 al cargar efemérides iniciales (recuperación)
    const ctxHttp = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pHttp = await ctxHttp.newPage();
    const httpPageErrs = [];
    pHttp.on('pageerror', e => httpPageErrs.push(e.message));
    let bloquear = true;
    await pHttp.route('**/data/**', route => bloquear ? route.fulfill({ status: 500, body: 'Error simulado' }) : route.continue());
    await pHttp.goto(url, { waitUntil: 'domcontentloaded' });
    await pHttp.waitForTimeout(1500);
    const falloDatos = await pHttp.evaluate(() => ({
      status: document.querySelector('#data-status')?.textContent?.trim(),
      retryVisible: !document.querySelector('#retry-button')?.hidden
    }));
    bloquear = false;
    await pHttp.evaluate(() => document.querySelector('#retry-button')?.click());
    const recuperado = await hasta(pHttp, () => !document.querySelector('#planet-select')?.disabled, 20000);
    await ctxHttp.close();

    out.estabilidad.sinWebGL2 = noGlState;
    out.estabilidad.falloYRecuperacionDatos = { pageErrors: httpPageErrs.length, falloDatos, recuperado };
    comprobar('STAB-01: sin WebGL2 muestra alertdialog accesible con 0 pageerror',
      noGlState.pageErrors === 0 && noGlState.alertDialogVisible && noGlState.appInert, noGlState);
    comprobar('Estabilidad: fallo HTTP 500 muestra reintento y se recupera al reintentar',
      httpPageErrs.length === 0 && falloDatos.retryVisible && recuperado, out.estabilidad.falloYRecuperacionDatos);
  }

  // =========================================================================
  // 3. MATRIZ RESPONSIVE Y UX/UI (7 RESOLUCIONES + TÁCTIL + TECLADO)
  // =========================================================================
  const resoluciones = [
    { w: 1920, h: 1080, touch: false, cap: true },
    { w: 1600, h: 900, touch: false, cap: false },
    { w: 1366, h: 768, touch: false, cap: true },
    { w: 1280, h: 720, touch: false, cap: false },
    { w: 768, h: 1024, touch: true, cap: true },
    { w: 390, h: 844, touch: true, cap: true },
    { w: 320, h: 568, touch: true, cap: true }
  ];
  for (const r of resoluciones) {
    const cRes = await browser.newContext({ viewport: { width: r.w, height: r.h }, hasTouch: r.touch, isMobile: r.w <= 480 });
    const pRes = await cRes.newPage();
    const resErrs = [];
    pRes.on('pageerror', e => resErrs.push(e.message));
    await pRes.goto(url, { waitUntil: 'domcontentloaded' });
    await hasta(pRes, () => !document.querySelector('#planet-select')?.disabled, 60000);
    await pRes.waitForTimeout(500);

    const checkLayout = () => pRes.evaluate(() => {
      const overflowX = document.documentElement.scrollWidth > window.innerWidth + 1;
      const cab = document.querySelector('.app-header')?.getBoundingClientRect();
      const botonesCab = [...document.querySelectorAll('.app-header button')].filter(b => b.getClientRects().length).map(b => {
        const br = b.getBoundingClientRect();
        const hit = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2);
        return { id: b.id || b.dataset.modeBtn, ok: b.contains(hit), dentroX: br.left >= -1 && br.right <= window.innerWidth + 1 };
      });
      return { overflowX, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, cabH: cab ? Math.round(cab.height) : 0, botonesCab };
    });

    const solar = await checkLayout();
    // Buscar (UX-01)
    if (r.touch) await pRes.tap('#header-search'); else await pRes.click('#header-search');
    await hasta(pRes, () => document.activeElement?.id === 'cp-input', 5000);
    await pRes.keyboard.press('Tab');
    const tabDentro = await pRes.evaluate(() => document.querySelector('#command-palette').contains(document.activeElement));
    await pRes.keyboard.press('Escape');
    const buscarCerrado = await pRes.evaluate(() => document.querySelector('#command-palette').hidden);

    // Histórico (UX-02)
    if (r.touch) await pRes.tap('[data-mode-btn="historico"]'); else await pRes.click('[data-mode-btn="historico"]');
    await hasta(pRes, () => document.querySelector('#historical-welcome-modal') && !document.querySelector('#historical-welcome-modal').hidden, 60000);
    await pRes.waitForTimeout(350);
    const hist = await checkLayout();
    const tarjetaOk = await pRes.evaluate(() => {
      const c = document.querySelector('.app-header').getBoundingClientRect();
      const t = document.querySelector('#historical-welcome-modal .welcome-card').getBoundingClientRect();
      return { arriba: Math.round(t.top), abajo: Math.round(t.bottom), cabAbajo: Math.round(c.bottom), alto: window.innerHeight, cabe: t.top >= c.bottom - 1 && t.bottom <= window.innerHeight + 1 };
    });
    if (r.cap) await pRes.screenshot({ path: path.join(DIR, `acc-ux-${r.w}x${r.h}-bienvenida.png`) });
    await pRes.keyboard.press('Escape');

    // Laboratorio
    if (r.touch) await pRes.tap('[data-mode-btn="experimental"]'); else await pRes.click('[data-mode-btn="experimental"]');
    await hasta(pRes, () => document.querySelector('#app').dataset.appMode === 'experimental', 20000);
    await pRes.waitForTimeout(500);
    const lab = await checkLayout();
    if (r.cap) await pRes.screenshot({ path: path.join(DIR, `acc-ux-${r.w}x${r.h}-lab.png`) });

    const fila = {
      resolucion: `${r.w}x${r.h}`, tactil: r.touch, erroresPagina: resErrs.length,
      solarOverflowX: solar.overflowX, histOverflowX: hist.overflowX, labOverflowX: lab.overflowX,
      cabeceraAccesibleEnBienvenida: hist.botonesCab.every(b => b.ok && b.dentroX),
      cabeceraEnLab: lab.botonesCab.every(b => b.ok && b.dentroX),
      ux01TabYEsc: tabDentro && buscarCerrado,
      ux02TarjetaCabe: tarjetaOk.cabe, tarjetaOk
    };
    out.responsive.push(fila);
    comprobar(`Responsive ${fila.resolucion}: sin desbordamiento X, cabecera accesible, UX-01 y UX-02 ok`,
      resErrs.length === 0 && !fila.solarOverflowX && !fila.histOverflowX && !fila.labOverflowX
      && fila.cabeceraAccesibleEnBienvenida && fila.ux01TabYEsc && fila.ux02TarjetaCabe, fila);
    await cRes.close();
  }

  // =========================================================================
  // 4. PRUEBA CRUZADA EN MICROSOFT EDGE
  // =========================================================================
  if (fs.existsSync(edgePath)) {
    const edge = await chromium.launch({
      executablePath: edgePath, headless: true,
      args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    });
    out.navegadores.edge = edge.version();
    const cEdge = await edge.newContext({ viewport: { width: 1366, height: 768 } });
    const pEdge = await cEdge.newPage();
    const eErrs = [];
    pEdge.on('pageerror', e => eErrs.push(e.message));
    pEdge.on('console', m => { if (m.type() === 'error') eErrs.push(m.text().slice(0, 200)); });
    await pEdge.goto(url, { waitUntil: 'domcontentloaded' });
    const eSolar = await hasta(pEdge, () => !document.querySelector('#planet-select')?.disabled, 60000);
    // UX-01 con '/' en Edge
    await pEdge.keyboard.press('/');
    const eSlash = await hasta(pEdge, () => document.activeElement?.id === 'cp-input', 5000);
    await pEdge.keyboard.press('Escape');
    // UX-02 + cambio de modo + reapertura #hist-welcome-open-btn en Edge
    await pEdge.click('[data-mode-btn="historico"]');
    const eWelcome = await hasta(pEdge, () => !document.querySelector('#historical-welcome-modal')?.hidden, 60000);
    await pEdge.click('[data-mode-btn="experimental"]');
    await hasta(pEdge, () => document.querySelector('#app').dataset.appMode === 'experimental', 20000);
    await pEdge.waitForTimeout(500);
    await pEdge.click('[data-mode-btn="historico"]');
    await hasta(pEdge, () => !document.querySelector('#historical-welcome-modal')?.hidden, 30000);
    await pEdge.keyboard.press('Escape');
    await pEdge.waitForTimeout(400);
    if (await pEdge.evaluate(() => document.querySelector('#context-inspector')?.dataset.state === 'closed')) { await pEdge.click('#inspector-toggle'); await pEdge.waitForTimeout(450); }
    if (!(await pEdge.evaluate(() => document.querySelector('.historical-experiences')?.open))) { await pEdge.click('.historical-experiences > summary'); await pEdge.waitForTimeout(300); }
    await pEdge.click('#hist-welcome-open-btn');
    const eReabre = await hasta(pEdge, () => !document.querySelector('#historical-welcome-modal')?.hidden, 5000);
    await pEdge.keyboard.press('Escape');
    // Lanzamiento 3D en Edge
    await pEdge.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.iniciarLanzamiento('voyager-2'));
    const eLanz = await hasta(pEdge, () => {
      const e = window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoLanzamiento();
      const l = document.querySelector('#launch-loading');
      return e.activo && e.cargado && (!l || l.hidden);
    }, 60000);
    await pEdge.click('#launch-skip-btn');
    await hasta(pEdge, () => !window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoLanzamiento().activo, 15000);
    // Laboratorio Worker en Edge
    await pEdge.click('[data-mode-btn="experimental"]');
    await hasta(pEdge, () => Boolean(document.querySelector('#lab-ctx-probe')), 20000);
    await pEdge.click('[data-lab-stage="plan"]');
    await pEdge.click('[data-lab-tab="integrated"]');
    await pEdge.click('#im-compute');
    const eWorker = await hasta(pEdge, () => !document.querySelector('#im-compute')?.disabled && !document.querySelector('#im-execute')?.disabled, 30000);
    out.edge = { eSolar, eSlash, eWelcome, eReabre, eLanz, eWorker, errores: eErrs };
    comprobar('Microsoft Edge: arranque, UX-01, UX-02, reapertura bienvenida, Lanzamiento 3D y Worker sin errores',
      eSolar && eSlash && eWelcome && eReabre && eLanz && eWorker && eErrs.length === 0, out.edge);
    await cEdge.close();
    await edge.close();
  }
} finally {
  await browser.close();
  srv.close();
  out.resumen = { comprobacionesFallidas: out.fallos.length };
  await writeFile(path.join(DIR, 'funcional-ux-estabilidad.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ resumen: out.resumen, fallos: out.fallos }, null, 2));
}
