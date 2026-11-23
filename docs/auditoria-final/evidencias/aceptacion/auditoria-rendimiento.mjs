// Auditoría Final de Aceptación — Rendimiento final en compilación de producción (GPU dedicada y Software SwiftShader).
// Uso: node auditoria-rendimiento.mjs gpu|software
import http from 'node:http';
import fs from 'node:fs';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(DIR, '../../../..');
const DIST = path.join(RAIZ, 'dist');
const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE ?? path.join(process.env.LOCALAPPDATA, 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href);
const modo = process.argv[2] === 'software' ? 'software' : 'gpu';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm', '.bin': 'application/octet-stream'
};

function iniciarServidorProd() {
  const srv = http.createServer((req, res) => {
    const limpio = decodeURIComponent((req.url || '/').split('?')[0]);
    if (!limpio.startsWith('/simulador-sondas-espaciales')) { res.writeHead(404); res.end(); return; }
    const rel = limpio.replace(/^\/simulador-sondas-espaciales\/?/, '');
    const archivo = path.join(DIST, rel || 'index.html');
    if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(archivo).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(archivo).pipe(res);
  });
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/simulador-sondas-espaciales/` })));
}

const { srv, url } = await iniciarServidorProd();
const flags = modo === 'software'
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: flags
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const out = {
  fecha: new Date().toISOString(),
  modo, chrome: browser.version(), cpu: os.cpus()[0].model,
  errores: [], global: [], calculoWorker: null, lanzamiento: []
};
page.on('pageerror', e => out.errores.push(e.message));
page.on('console', m => { if (m.type() === 'error') out.errores.push(m.text().slice(0, 220)); });
page.on('response', r => { if (r.status() >= 400) out.errores.push(`${r.status()} ${new URL(r.url()).pathname}`); });

await page.addInitScript(() => {
  const observed = [], renders = [], frames = [], tasks = [];
  const raf = requestAnimationFrame.bind(window);
  let active = false, cpu = 0, last = null;
  window.requestAnimationFrame = f => raf(t => { const s = performance.now(); try { f(t); } finally { cpu += performance.now() - s; } });
  function tick(t) { if (active && last !== null) frames.push([t - last, cpu]); cpu = 0; last = t; raf(tick); }
  raf(tick);
  new PerformanceObserver(l => tasks.push(...l.getEntries().map(e => [e.startTime, e.duration]))).observe({ type: 'longtask' });
  window.__THREE_DEVTOOLS__ = new EventTarget();
  window.__THREE_DEVTOOLS__.addEventListener('observe', ({ detail: r }) => {
    if (!r.isWebGLRenderer) return;
    const id = observed.length; observed.push(r);
    const orig = r.render, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    let pending = null, counter = 0;
    r.render = function (s, c) {
      if (!active) return orig.apply(this, arguments);
      let gpu = null, q = null;
      if (pending && gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu = gl.getQueryParameter(pending, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(pending); pending = null;
      }
      if (ext && !pending && counter++ % 10 === 0) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
      const t = performance.now(); orig.apply(this, arguments); const dur = performance.now() - t;
      if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending = q; }
      const info = r.info;
      renders.push([id, r.domElement.parentElement?.id || r.domElement.className, dur, info.render.calls, info.render.triangles, gpu, r.getPixelRatio()]);
    };
  });
  window.__medirVentana__ = async ms => {
    frames.length = renders.length = 0; const start = performance.now(); last = null; active = true;
    await new Promise(r => setTimeout(r, ms));
    active = false; const end = performance.now();
    const dts = frames.map(f => f[0]).sort((a, b) => a - b);
    const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
    const q = p => dts[Math.max(0, Math.ceil(p * dts.length) - 1)] ?? null;
    const porCanvas = {};
    for (const [, cid, dur, calls, tris, gpu, ratio] of renders) {
      const k = cid || 'canvas';
      const g = porCanvas[k] ?? (porCanvas[k] = { n: 0, cpu: [], calls: [], tris: [], gpu: [], ratio });
      g.n++; g.cpu.push(dur); g.calls.push(calls); g.tris.push(tris); if (gpu !== null) g.gpu.push(gpu); g.ratio = ratio;
    }
    const resumenCanvas = Object.fromEntries(Object.entries(porCanvas).map(([k, v]) => [k, {
      renders: v.n, cpuRenderMs: +(mean(v.cpu) ?? 0).toFixed(2),
      gpuMs: v.gpu.length ? +(mean(v.gpu)).toFixed(2) : null,
      calls: +(mean(v.calls) ?? 0).toFixed(1), triangles: Math.round(mean(v.tris) ?? 0), ratio: v.ratio
    }]));
    const hardware = observed[0] ? (() => {
      const gl = observed[0].getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null;
    })() : null;
    return {
      hardware,
      frames: dts.length,
      fps: dts.length ? +(1000 / mean(dts)).toFixed(2) : 0,
      avgMs: dts.length ? +mean(dts).toFixed(2) : null,
      p95Ms: q(0.95) !== null ? +q(0.95).toFixed(2) : null,
      p99Ms: q(0.99) !== null ? +q(0.99).toFixed(2) : null,
      rafCpuMs: +(mean(frames.map(f => f[1])) ?? 0).toFixed(2),
      longTasks: tasks.filter(([t, v]) => t < end && t + v >= start).length,
      heapMiB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null,
      canvases: resumenCanvas
    };
  };
});

const click = sel => page.locator(sel).first().evaluate(e => e.click());
async function medir(nombre, accion, ms = 3200) {
  if (accion) await accion();
  await page.waitForTimeout(900);
  const res = await page.evaluate(m => window.__medirVentana__(m), ms);
  out.global.push({ nombre, ...res });
  console.log(`[${modo}] ${nombre}: ${res.fps} FPS (P95=${res.p95Ms}ms, P99=${res.p99Ms}ms, LT=${res.longTasks})`);
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__ && !document.querySelector('#planet-select')?.disabled, null, { timeout: 60000 });
  await page.waitForTimeout(900);

  await medir('Solar general');
  await medir('Tierra cercana', () => page.selectOption('#planet-select', 'Tierra', { force: true }));
  await medir('Solar tiempo ×4', async () => { await page.selectOption('#playback-speed', '4', { force: true }); await click('#play-button'); });
  await click('#play-button');

  await click('[data-mode-btn="historico"]');
  await page.waitForTimeout(1600);
  if (await page.locator('#welcome-close-btn').isVisible().catch(() => false)) await click('#welcome-close-btn');
  await medir('Voyager ambas', () => click('#hist-compare-btn'));
  await medir('Reloj histórico', () => click('#hist-play-btn'));
  await click('#hist-play-btn');

  // Lanzamiento 3D completo (6 planos + ascenso + Voyager NASA)
  await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.iniciarLanzamiento('voyager-2'));
  await page.locator('.launch3d-canvas.is-visible').waitFor({ timeout: 90000 });
  await page.evaluate(() => window.__SIMULADOR_DIAGNOSTICO__.pausarLanzamiento());
  for (const [t, nombre] of [[-8, 'Lanz. plataforma (T-8s)'], [-2, 'Lanz. base (T-2s)'], [5, 'Lanz. despegue (T+5s)'], [30, 'Lanz. seguimiento (T+30s)'], [130, 'Lanz. separación (T+130s)'], [1500, 'Lanz. órbita (T+1500s)'], [4450, 'Lanz. Voyager NASA (T+4450s)']]) {
    await page.evaluate(v => window.__SIMULADOR_DIAGNOSTICO__.irALanzamiento(v), t);
    await page.waitForTimeout(700);
    const res = await page.evaluate(() => window.__medirVentana__(2600));
    out.lanzamiento.push({ nombre, t, ...res });
    console.log(`[${modo}] ${nombre}: ${res.fps} FPS (P95=${res.p95Ms}ms, LT=${res.longTasks})`);
  }
  await page.evaluate(() => { window.__SIMULADOR_DIAGNOSTICO__.irALanzamiento(0); window.__SIMULADOR_DIAGNOSTICO__.reanudarLanzamiento(); });
  await page.waitForTimeout(300);
  const asc = await page.evaluate(() => window.__medirVentana__(3500));
  out.lanzamiento.push({ nombre: 'Lanz. ascenso en movimiento (T+0..3,5s)', t: 0, ...asc });
  console.log(`[${modo}] Lanz. ascenso en movimiento: ${asc.fps} FPS (P95=${asc.p95Ms}ms, LT=${asc.longTasks})`);
  await click('#launch-skip-btn');
  await page.waitForTimeout(700);

  // Laboratorio: Hangar 3D + Planificación (PERF-01) + Worker (PERF-03) + Centro en reproducción (PERF-02)
  await click('[data-mode-btn="experimental"]');
  await page.waitForSelector('#lab-ctx-probe', { state: 'attached', timeout: 20000 });
  await medir('Hangar Cassini (PERF-01)', () => page.selectOption('#lab-ctx-probe', 'cassini', { force: true }));
  await medir('Planificación (PERF-01)', async () => {
    await click('[data-lab-stage="plan"]');
    await click('[data-lab-tab="integrated"]');
    await page.selectOption('#im-scenario', 'A1', { force: true });
  });

  // Medición de cálculo A1 con plataforma + N-cuerpos en Worker (PERF-03)
  if (await page.locator('#im-launch-pad').isVisible().catch(() => false)) await page.check('#im-launch-pad');
  out.calculoWorker = await page.evaluate(() => new Promise(resolve => {
    const lts = [];
    const obs = new PerformanceObserver(l => { for (const e of l.getEntries()) lts.push(Math.round(e.duration)); });
    obs.observe({ type: 'longtask' });
    const t0 = performance.now();
    document.querySelector('#im-compute').click();
    const poll = () => {
      if (!document.querySelector('#im-compute').disabled && !document.querySelector('#im-execute').disabled) {
        const wallA1 = Math.round(performance.now() - t0);
        const nb = document.querySelector('#im-nbody-run');
        if (nb && !nb.disabled) {
          const t1 = performance.now();
          nb.click();
          const pollNb = () => {
            if (!nb.disabled || performance.now() - t1 > 10000) {
              obs.disconnect();
              resolve({ wallA1Ms: wallA1, wallNBodyMs: Math.round(performance.now() - t1), longTasks: lts });
            } else requestAnimationFrame(pollNb);
          };
          requestAnimationFrame(pollNb);
        } else { obs.disconnect(); resolve({ wallA1Ms: wallA1, wallNBodyMs: null, longTasks: lts }); }
      } else requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }));
  console.log(`[${modo}] Worker PERF-03:`, JSON.stringify(out.calculoWorker));

  await click('#im-execute');
  await page.waitForFunction(() => document.querySelector('#lab-mission-center')?.dataset.scene === 'main', null, { timeout: 30000 });
  await medir('Centro en reproducción (PERF-02)');
  await medir('Centro seguimiento y telemetría', async () => {
    await click('[data-camera="exterior"]');
    await page.selectOption('#mc-rate', '86400', { force: true });
    await click('[data-sheet-pane="telemetry"]');
  });
  await medir('Sistema Solar tras regresar del Lab', () => click('[data-mode-btn="exploracion"]'));
} finally {
  await browser.close();
  srv.close();
  await writeFile(path.join(DIR, `rendimiento-${modo}.json`), JSON.stringify(out, null, 2) + '\n');
}
