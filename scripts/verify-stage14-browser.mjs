// Etapa 14 — verificación visual e interactiva en Chrome (sin interfaz, SwiftShader) de la renovación de la interfaz:
// Sistema Solar, Voyager, mapa de áreas, todas las herramientas del laboratorio y el Centro de Misión, en seis resoluciones.
// Uso: node scripts/verify-stage14-browser.mjs [desktop|laptop|mobile|all]   → capturas y registro en evidence/stage14/
// (o en EVIDENCE_DIR si se define).
// (la parte «all», por defecto, tarda más de 10 minutos con SwiftShader; cada parte escribe su propio registro).
// Solo lee la interfaz: no modifica datos, efemérides ni resultados.
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath = path.join(process.env.LOCALAPPDATA ?? '', 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
// EVIDENCE_DIR permite guardar una nueva ronda (p. ej. evidence/stage14_1) sin sobrescribir la de la etapa 14.
const out = path.resolve(process.env.EVIDENCE_DIR ?? 'evidence/stage14');
await fs.mkdir(out, { recursive: true });
const PART = process.argv[2] ?? 'all';
const PORT = { desktop: 5186, laptop: 5187, mobile: 5188, all: 5186 }[PART] ?? 5186;
const server = await createServer({ server: { port: PORT, strictPort: true }, configFile: path.resolve('vite.config.js'), logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
const log = { shots: [], checks: {}, overflow: {}, errors: [] };
const URL = `http://localhost:${PORT}/`;

async function session(width, height, prefix, fn) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', e => log.errors.push(`${prefix}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') log.errors.push(`${prefix}: ${m.text()}`); });
  const h = {
    page,
    wait: ms => page.waitForTimeout(ms),
    async shot(name, locator = null) {
      const file = `${prefix}_${name}.png`;
      await (locator ?? page).screenshot({ path: path.join(out, file) }); log.shots.push(file);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (o > 0) log.overflow[file] = o;
    },
    text: async selector => (await page.locator(selector).first().textContent())?.trim(),
    async home() { await page.goto(URL, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000); },
    // Espera a que termine la animación de entrada del panel: con SwiftShader cargado puede durar varios segundos y Playwright exige un botón estable.
    async area(id) { await page.click('#app-nav-toggle'); await page.waitForTimeout(250); await page.locator('#app-nav-panel').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {})))); await page.click(`#app-nav-panel button[data-area="${id}"]`); await page.waitForTimeout(1300); },
    async labState() { return page.evaluate(() => { const lab = document.querySelector('#experimental-lab'); return { mode: document.querySelector('#app').dataset.appMode, labHidden: lab?.hidden ?? null, section: lab?.dataset.section ?? null, plannerMode: lab?.dataset.plannerMode ?? null, crumb: document.querySelector('#lab-crumb-tool')?.textContent ?? null }; }); },
    async computeIntegrated(id) {
      await page.selectOption('#im-scenario', id); await page.click('#im-compute');
      await page.waitForFunction(() => !document.querySelector('#im-compute').disabled && !/Calculando/.test(document.querySelector('#im-verdict').textContent), null, { timeout: 120000 });
      await page.waitForTimeout(400);
    },
    async event(label) { await page.locator('#mc-events button', { hasText: label }).first().click(); await page.waitForTimeout(900); },
    async dismissWelcome() { try { await page.getByRole('button', { name: 'Explorar libremente' }).click({ timeout: 4000 }); } catch {} await page.waitForTimeout(1500); }
  };
  try { await fn(h); } catch (error) { log.errors.push(`${prefix}: FALLO DEL GUION: ${error.message.split('\n').slice(0, 6).join(' | ')}`); }
  await page.close();
}

try {
  // ---------------- Escritorio 1920×1080: recorrido completo ----------------
  if (['all', 'desktop'].includes(PART)) await session(1920, 1080, 'd1920', async h => {
    const { page } = h;
    await h.home(); await h.shot('01_solar_overview');
    await page.click('#app-nav-toggle'); await h.wait(400); await h.shot('02_area_map');
    log.checks.areaMapEntries = await page.locator('#app-nav-panel button[data-area]').count();
    await page.keyboard.press('Escape'); await h.wait(200);
    log.checks.areaMapClosedByEscape = await page.locator('#app-nav-panel').isHidden();
    // 14.1: portada de misiones destacadas y búsqueda global (paleta) desde la cabecera.
    log.checks.featuredCards = await page.locator('#featured-panel .fm-card').count();
    await page.getByRole('button', { name: 'Buscar destino' }).first().click(); await h.wait(400);
    await page.fill('#cp-input', 'Júpiter'); await h.wait(300); await h.shot('02b_command_palette');
    log.checks.paletteFirstOption = (await h.text('#cp-results .cp-option[aria-selected="true"]')).replace(/\s+/g, ' ').trim();
    await page.keyboard.press('Enter'); await h.wait(3500);
    await h.shot('03_solar_jupiter_selected');
    log.checks.jupiterCard = (await h.text('#planet-info')).replace(/\s+/g, ' ').slice(0, 240);
    // Voyager.
    await page.click('#app-mode-switcher button[data-mode-btn="historico"]'); await h.wait(3500);
    await h.shot('04_voyager_welcome');
    await h.dismissWelcome(); await h.shot('05_voyager_explore');
    for (const [tab, name] of [['Datos', '06_voyager_data'], ['Historia', '07_voyager_history'], ['Fotos', '08_voyager_photos'], ['Cámaras', '09_voyager_cameras']]) {
      try { await page.locator('#context-inspector [role="tab"]', { hasText: tab }).first().click({ timeout: 3000 }); await h.wait(900); await h.shot(name); }
      catch (error) { log.errors.push(`d1920: pestaña ${tab}: ${error.message.split('\n')[0]}`); }
    }
    // Laboratorio: rutas del mapa de áreas (12 entradas).
    const expected = {
      solar: { mode: 'exploracion' }, voyager: { mode: 'historico' }, hangar: { section: 'hangar' }, engineering: { section: 'engineering' },
      orbital: { mode: 'experimental', labHidden: true }, launch: { section: 'launch' }, lunar: { section: 'planner', plannerMode: 'lunar' },
      finite: { section: 'planner', plannerMode: 'lunar' }, landing: { section: 'landing' }, interplanetary: { section: 'planner', plannerMode: 'interplanetary' },
      integrated: { section: 'planner', plannerMode: 'integrated' }, center: { section: 'center' }
    };
    log.checks.areaRoutes = {};
    for (const [id, want] of Object.entries(expected)) {
      await h.area(id); if (id === 'voyager') await h.dismissWelcome();
      const got = await h.labState();
      const ok = Object.entries(want).every(([k, v]) => got[k] === v) && (want.section ? got.mode === 'experimental' && got.labHidden === false : true);
      log.checks.areaRoutes[id] = { ok, ...got };
      if (id === 'orbital') await h.shot('10_lab_orbital_simulation');
    }
    await h.area('hangar'); await h.shot('11_lab_hangar');
    await h.area('engineering'); await h.shot('12_lab_engineering');
    // Lanzamiento.
    await h.area('launch'); await h.shot('13_launch_empty');
    await page.click('#ln-calculate'); await page.waitForFunction(() => document.querySelector('#ln-results')?.children.length > 0, null, { timeout: 120000 }); await h.wait(500);
    await h.shot('14_launch_results');
    await page.click('#ln-execute'); await h.wait(1500); await page.click('#mc-pause'); await h.wait(300);
    await page.locator('#mc-events button').nth(2).click(); await h.wait(900);
    log.checks.launchHud = await h.text('#mc-hud');
    await h.shot('15_center_launch');
    // Descenso.
    await h.area('landing'); await page.click('#ld-calculate'); await page.waitForFunction(() => document.querySelector('#ld-results')?.children.length > 0, null, { timeout: 120000 }); await h.wait(500);
    await h.shot('16_landing_results');
    await page.click('#ld-execute'); await h.wait(1500); await page.click('#mc-pause');
    await h.event('Contacto'); await page.click('.mc-camera-bar button[data-camera="local"]'); await h.wait(1200);
    log.checks.landingHud = await h.text('#mc-hud');
    await h.shot('17_center_landing_contact_local');
    // Tierra–Luna (impulso ideal) y propulsión finita.
    await h.area('lunar'); await page.click('#mission-calculate');
    await page.waitForFunction(() => { const b = document.querySelector('#mission-execute'); return b && !b.disabled; }, null, { timeout: 120000 }); await h.wait(600);
    await h.shot('18_lunar_planner_result');
    // Con el diseño por defecto el veredicto es INSUFICIENTE; la reproducción se intenta sin bloquear el resto del recorrido.
    try {
      await page.click('#mission-execute'); await h.wait(1500); await page.click('#mc-pause', { timeout: 5000 }); await h.wait(300);
      await page.locator('#mc-events button').last().click({ timeout: 5000 }); await h.wait(900);
      await h.shot('19_center_lunar');
    } catch (error) { log.checks.lunarPlayback = `no reproducida: ${error.message.slice(0, 160)}`; }
    await h.area('finite'); await h.wait(600); await h.shot('20_finite_thrust_controls');
    // Interplanetaria (12G).
    await h.area('interplanetary');
    await page.click('#ip-search'); await page.waitForFunction(() => !document.querySelector('#ip-search').disabled && !document.querySelector('#ip-execute').disabled, null, { timeout: 120000 }); await h.wait(500);
    await h.shot('21_interplanetary_windows');
    // Misión completa (13): A1, B1, B2 y Centro.
    await h.area('integrated');
    await h.computeIntegrated('A1'); await h.shot('22_integrated_A1_mars');
    await h.computeIntegrated('B2'); await h.shot('23_integrated_B2_not_viable');
    await h.computeIntegrated('B1'); await h.shot('24_integrated_B1_europa');
    log.checks.B1verdict = await h.text('#im-verdict');
    await page.click('#im-execute'); await h.wait(1500); await page.click('#mc-pause'); await h.wait(300);
    log.checks.contextStrip = await h.text('#lab-ctx-mission');
    log.checks.ticks = { ticks: await page.locator('#mc-track-ticks .mc-tick').count(), events: await page.locator('#mc-events button').count() };
    await h.event('Entrada en la esfera de influencia de Júpiter'); await h.shot('25_center_B1_jupiter_soi');
    await h.event('Inserción en órbita de Júpiter · inicio'); log.checks.B1hudJoi = await h.text('#mc-hud'); await h.shot('26_center_B1_joi');
    await page.click('[data-mc-panel="wide"]'); await h.wait(1000);
    log.checks.wideGrid = await page.evaluate(() => getComputedStyle(document.querySelector('#lab-mission-center')).gridTemplateColumns);
    await h.shot('27_center_wide_view');
    await page.click('[data-tr="next"]'); await h.wait(900); await page.click('[data-tr="next"]'); await h.wait(900);
    log.checks.transportNext = await h.text('#mc-hud-phase');
    await page.click('[data-tr="play"]'); await h.wait(1200); log.checks.transportPlaying = await h.text('#mc-stage-status');
    await page.click('[data-tr="play"]'); await h.wait(300); log.checks.transportPaused = await h.text('#mc-stage-status');
    await h.shot('28_center_wide_transport');
    await page.click('[data-mc-panel="wide"]'); await h.wait(600);
    await h.event('Entrada en la esfera de influencia de Europa'); await h.shot('29_center_B1_europa_soi');
    await h.event('Contacto'); await page.click('.mc-camera-bar button[data-camera="local"]'); await h.wait(1200);
    log.checks.B1contactHud = await h.text('#mc-hud');
    await h.shot('30_center_B1_touchdown_local');
    // Movimiento reducido: las animaciones de interfaz quedan anuladas.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await h.area('hangar');
    log.checks.reducedMotionAnimation = await page.evaluate(() => getComputedStyle(document.querySelector('.lab-workspace')).animationDuration);
  });

  // ---------------- Escritorio 1600×900 y portátil 1366×768 ----------------
  for (const [w, hgt, prefix] of (['all', 'laptop'].includes(PART) ? [[1600, 900, 'd1600'], [1366, 768, 'l1366']] : [])) {
    await session(w, hgt, prefix, async h => {
      const { page } = h;
      await h.home(); await h.shot('01_solar');
      await h.area('hangar'); await h.shot('02_hangar');
      await h.area('integrated'); await h.computeIntegrated('B1'); await h.shot('03_integrated_B1');
      await page.click('#im-execute'); await h.wait(1500); await page.click('#mc-pause');
      await h.event('Encendido de transferencia hacia Europa · inicio'); await h.shot('04_center_transfer');
    });
  }

  // ---------------- Tableta y móviles ----------------
  for (const [w, hgt, prefix] of (['all', 'mobile'].includes(PART) ? [[768, 1024, 't768'], [390, 844, 'm390'], [320, 568, 'm320']] : [])) {
    await session(w, hgt, prefix, async h => {
      const { page } = h;
      await h.home(); await h.shot('01_solar');
      await page.click('#app-nav-toggle'); await h.wait(400); await h.shot('02_area_map'); await page.keyboard.press('Escape');
      await page.click('#app-mode-switcher button[data-mode-btn="historico"]'); await h.wait(3000); await h.dismissWelcome(); await h.shot('03_voyager');
      await h.area('hangar'); await h.shot('04_hangar');
      await h.area('launch'); await h.shot('05_launch');
      await h.area('landing'); await h.shot('06_landing');
      await h.area('lunar'); await h.shot('07_lunar');
      await h.area('interplanetary'); await h.shot('08_interplanetary');
      await h.area('integrated'); await h.computeIntegrated('B1'); await h.shot('09_integrated_B1');
      await page.locator('#lab-integrated .mission-results').scrollIntoViewIfNeeded(); await h.wait(300); await h.shot('10_integrated_results');
      await page.click('#im-execute'); await h.wait(1500); await page.click('#mc-pause');
      await h.event('Inserción en órbita de Júpiter · inicio');
      await page.locator('.mc-stage').scrollIntoViewIfNeeded(); await h.wait(500); await h.shot('11_center_stage');
      await page.click('[data-tr="next"]'); await h.wait(800);
      log.checks[`${prefix}_transport`] = await h.text('#mc-stage-status');
      await page.locator('.mc-telemetry').scrollIntoViewIfNeeded(); await h.wait(300); await h.shot('12_center_telemetry');
    });
  }
} catch (error) { log.errors.push(`FALLO GENERAL: ${error.message}`); }
finally {
  await fs.writeFile(path.join(out, PART === 'all' ? 'browser-verification.json' : `browser-verification-${PART}.json`), `${JSON.stringify(log, null, 2)}\n`);
  console.log(JSON.stringify({ shots: log.shots.length, overflow: log.overflow, errors: log.errors, checks: log.checks }, null, 2));
  await browser.close(); await server.close();
}
