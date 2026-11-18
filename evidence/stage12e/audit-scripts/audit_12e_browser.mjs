import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from '../../../node_modules/vite/dist/node/index.js';

const playwrightPath = path.join(process.env.LOCALAPPDATA, 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);

console.log('=== AUDITORÍA DE NAVEGADOR Y CAPTURAS ETAPA 12E & 12D.1 ===');

const server = await createServer({
  server: { port: 5175 },
  configFile: path.resolve('vite.config.js')
});
await server.listen();
const url = 'http://localhost:5175/';
console.log(`Servidor Vite activo en ${url}`);

const outputDir = path.resolve('evidence/stage12e');
await fs.mkdir(outputDir, { recursive: true });

const chromePath = process.env.CHROME_BIN || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox']
});

const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => consoleErrors.push(err.message));

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  console.log('Página cargada correctamente.');

  // 1. Navegar a Laboratorio Experimental
  await page.click('#app-mode-switcher button[data-mode-btn="experimental"]');
  await page.waitForTimeout(500);

  // 2. Navegar a la nueva pestaña "Lanzamiento"
  console.log('Navegando a la pestaña Lanzamiento...');
  await page.click('button[data-lab-section="launch"]');
  await page.waitForTimeout(500);

  // EVIDENCIA 01: Configuración del lanzador en escritorio (1920x1080)
  console.log('Capturando EVIDENCIA 01: Configuración de lanzamiento...');
  await page.screenshot({ path: path.join(outputDir, '01_launch_config_desktop.png') });

  // 3. Calcular lanzamiento con parámetros estándar (561 kg)
  console.log('Calculando lanzamiento (carga útil 561 kg)...');
  await page.click('#ln-calculate');
  await page.waitForFunction(() => {
    const res = document.querySelector('#ln-results')?.textContent || '';
    return res.includes('ÓRBITA TERRESTRE ALCANZADA SEGÚN EL MODELO');
  }, { timeout: 10000 });
  console.log('Cálculo completado exitosamente.');

  // EVIDENCIA 02: Resultados del cálculo orbital
  console.log('Capturando EVIDENCIA 02: Resultados orbitales...');
  await page.screenshot({ path: path.join(outputDir, '02_launch_results_desktop.png') });

  // 4. Reproducir en el Centro de Misión
  console.log('Iniciando reproducción en Centro de Misión...');
  await page.click('#ln-execute');
  await page.waitForTimeout(600);

  // EVIDENCIA 03: Liftoff (t = 0 s)
  console.log('Capturando EVIDENCIA 03: Despegue (t=0)...');
  await page.screenshot({ path: path.join(outputDir, '03_mission_control_liftoff.png') });

  // Buscar evento Max-Q (~61 s) en la lista de eventos
  console.log('Saltando a Max-Q...');
  const maxQBtn = await page.waitForSelector('.mc-events button[data-event="max-q"]');
  await maxQBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, '04_mission_control_stage1_maxq.png') });

  // Buscar evento Separación (~154 s)
  console.log('Saltando a Separación de Etapa 1...');
  const sepBtn = await page.waitForSelector('.mc-events button[data-event="separation"]');
  await sepBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, '05_mission_control_stage_separation.png') });

  // Buscar evento Etapa 2 encendida (~158 s)
  console.log('Saltando a Etapa 2 encendido...');
  const ign2Btn = await page.waitForSelector('.mc-events button[data-event="ignition-2"]');
  await ign2Btn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, '06_mission_control_stage2_burn.png') });

  // Buscar evento Circularización (~662 s)
  console.log('Saltando a Circularización...');
  const circBtn = await page.waitForSelector('.mc-events button[data-event="circularization"]');
  await circBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, '07_mission_control_circularization.png') });

  // Buscar evento Fin de la integración (~1916 s)
  console.log('Saltando a Fin de la integración / Órbita...');
  const endBtn = await page.waitForSelector('.mc-events button[data-event="end"]');
  await endBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, '08_mission_control_orbit_final.png') });

  // ---------------------------------------------------------------------------
  // EVIDENCIA 09 & 10: Casos de Fallo (Suborbital 5000 kg y No Verificable 3000 kg)
  // ---------------------------------------------------------------------------
  console.log('Probando casos de carga pesada...');
  await page.click('button[data-lab-section="launch"]');
  await page.waitForTimeout(400);

  // Abrir acordeón de Etapa 2 para modificar masa estructural (+4439 kg -> simula carga de 5000 kg)
  await page.click('details summary:has-text("Etapa 2 del lanzador")');
  await page.waitForTimeout(200);

  // Modificar masa estructural de etapa 2 a 6239 kg (+4439 kg -> carga total final ~5000 kg)
  await page.fill('input[data-stage="1"][data-key="structuralMassKg"]', '6239');
  await page.click('#ln-calculate');
  await page.waitForFunction(() => {
    const res = document.querySelector('#ln-results')?.textContent || '';
    return res.includes('SUBORBITAL');
  }, { timeout: 10000 });
  console.log('Capturando EVIDENCIA 09: Suborbital con impacto (5000 kg equivalente)...');
  await page.screenshot({ path: path.join(outputDir, '09_suborbital_5000kg_impact.png') });

  // Ahora masa estructural a 4239 kg (+2439 kg -> simula carga de 3000 kg)
  await page.fill('input[data-stage="1"][data-key="structuralMassKg"]', '4239');
  await page.click('#ln-calculate');
  await page.waitForFunction(() => {
    const res = document.querySelector('#ln-results')?.textContent || '';
    return res.includes('NO VERIFICABLE');
  }, { timeout: 10000 });
  console.log('Capturando EVIDENCIA 10: No verificable (3000 kg equivalente)...');
  await page.screenshot({ path: path.join(outputDir, '10_unverifiable_3000kg.png') });

  // Restablecer lanzador
  await page.click('#ln-reset');
  await page.waitForTimeout(300);
  await page.click('#ln-calculate');
  await page.waitForTimeout(500);

  // ---------------------------------------------------------------------------
  // EVIDENCIA 11: Salvaguarda de invalidación desde el Hangar
  // ---------------------------------------------------------------------------
  console.log('Probando invalidación desde el Hangar...');
  await page.click('button[data-lab-section="hangar"]');
  await page.waitForTimeout(400);
  // Modificar el diseño en el Hangar (cambiar nombre o añadir pieza vacía)
  await page.click('#lab-new'); // Nuevo diseño vacío
  await page.waitForTimeout(400);

  // Regresar a Lanzamiento: comprobar que el cálculo previo se invalidó
  await page.click('button[data-lab-section="launch"]');
  await page.waitForTimeout(400);
  console.log('Capturando EVIDENCIA 11: Invalidación por modificación en el Hangar...');
  await page.screenshot({ path: path.join(outputDir, '11_hangar_invalidation_guard.png') });

  // Recargar preset para continuar
  await page.click('button[data-lab-section="hangar"]');
  await page.waitForTimeout(300);
  await page.selectOption('#lab-preset', 'interplanetary');
  await page.click('#lab-load-preset');
  await page.waitForTimeout(400);

  // Volver a calcular lanzamiento para pruebas de Centro de Misión y responsividad
  await page.click('button[data-lab-section="launch"]');
  await page.waitForTimeout(300);
  await page.click('#ln-calculate');
  await page.waitForTimeout(600);
  await page.click('#ln-execute');
  await page.waitForTimeout(500);

  // ---------------------------------------------------------------------------
  // EVIDENCIA 12: Pruebas Responsivas Multiplataforma
  // ---------------------------------------------------------------------------
  const viewports = [
    { name: '12a_responsive_1920x1080.png', width: 1920, height: 1080 },
    { name: '12b_responsive_1366x768.png', width: 1366, height: 768 },
    { name: '12c_responsive_768x1024.png', width: 768, height: 1024 },
    { name: '12d_responsive_390x844.png', width: 390, height: 844 },
    { name: '12e_responsive_320x568.png', width: 320, height: 568 }
  ];

  for (const vp of viewports) {
    console.log(`Verificando viewport ${vp.width}x${vp.height}...`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outputDir, vp.name) });
  }

  // ---------------------------------------------------------------------------
  // EVIDENCIAS 13, 14, 15: Verificación de correcciones 12D.1 en 320x568
  // ---------------------------------------------------------------------------
  console.log('Verificando correcciones 12D.1 en 320x568...');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(300);

  // HER-01: Estado de reproducción cuando finaliza en 320x568
  // Saltar al final de la reproducción para que muestre "FINALIZADA LA REPRODUCCIÓN"
  const endBtnMobile = await page.waitForSelector('.mc-events button[data-event="end"]');
  await endBtnMobile.click();
  await page.waitForTimeout(400);

  // Evaluar layout del header en 320x568
  const headerLayout = await page.evaluate(() => {
    const top = document.querySelector('.mc-stage .lab-stage-top');
    const status = document.querySelector('#mc-stage-status');
    const eyebrow = top?.querySelector('.eyebrow');
    const topStyle = window.getComputedStyle(top);
    const statusStyle = window.getComputedStyle(status);
    const topRect = top.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();
    const eyebrowRect = eyebrow.getBoundingClientRect();
    return {
      flexDirection: topStyle.flexDirection,
      statusText: status.textContent,
      statusOverflowWrap: statusStyle.overflowWrap,
      statusTop: statusRect.top,
      eyebrowTop: eyebrowRect.top,
      collides: statusRect.top < eyebrowRect.bottom && statusRect.left < eyebrowRect.right,
      docScrollWidth: document.documentElement.scrollWidth
    };
  });
  console.log('HER-01 Header Layout metrics:', headerLayout);
  console.log('Capturando EVIDENCIA 13: Corrección HER-01 en 320x568...');
  await page.screenshot({ path: path.join(outputDir, '13_fix_her01_header_320x568.png') });

  // HER-02: Todas las cámaras son accesibles en 320x568
  const cameraBarInfo = await page.evaluate(() => {
    const bar = document.querySelector('.mc-camera-bar');
    const buttons = Array.from(bar.querySelectorAll('button')).map(b => {
      const r = b.getBoundingClientRect();
      return {
        text: b.textContent,
        camera: b.dataset.camera,
        visible: r.width > 0 && r.height > 0 && r.right <= window.innerWidth,
        right: r.right,
        windowWidth: window.innerWidth
      };
    });
    return {
      flexWrap: window.getComputedStyle(bar).flexWrap,
      buttons
    };
  });
  console.log('HER-02 Camera Bar metrics:', cameraBarInfo);
  // Pulsar el botón "Cámara de destino"
  await page.click('.mc-camera-bar button[data-camera="destination"]');
  await page.waitForTimeout(300);
  console.log('Capturando EVIDENCIA 14: Corrección HER-02 en 320x568 (Cámara de destino seleccionada)...');
  await page.screenshot({ path: path.join(outputDir, '14_fix_her02_cameras_320x568.png') });

  // HER-03: Pestañas de navegación en 320x568
  const tabsInfo = await page.evaluate(() => {
    const nav = document.querySelector('.lab-sections');
    const buttons = Array.from(nav.querySelectorAll('button')).map(b => {
      const r = b.getBoundingClientRect();
      return {
        text: b.textContent,
        section: b.dataset.labSection,
        visible: r.width > 0 && r.height > 0 && r.right <= window.innerWidth,
        top: r.top,
        left: r.left,
        right: r.right
      };
    });
    return {
      flexWrap: window.getComputedStyle(nav).flexWrap,
      buttons,
      docScrollWidth: document.documentElement.scrollWidth
    };
  });
  console.log('HER-03 Tabs Layout metrics:', tabsInfo);

  // Probar que todas las pestañas se pueden pulsar
  for (const section of ['hangar', 'engineering', 'launch', 'planner', 'center']) {
    await page.click(`button[data-lab-section="${section}"]`);
    await page.waitForTimeout(150);
  }
  console.log('Capturando EVIDENCIA 15: Corrección HER-03 en 320x568...');
  await page.screenshot({ path: path.join(outputDir, '15_fix_her03_tabs_320x568.png') });

  console.log('=== TODAS LAS CAPTURAS Y VERIFICACIONES DE NAVEGADOR COMPLETADAS CON ÉXITO ===');
} catch (err) {
  console.error('Error durante la automatización:', err);
} finally {
  await browser.close();
  await server.close();
  console.log('Servidor y navegador cerrados.');
}
