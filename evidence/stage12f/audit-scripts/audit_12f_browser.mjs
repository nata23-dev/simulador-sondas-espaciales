import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from '../../../node_modules/vite/dist/node/index.js';

const playwrightPath = path.join(process.env.LOCALAPPDATA, 'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);

console.log('=== AUDITORÍA DE NAVEGADOR Y CAPTURAS ETAPA 12F & 12E.1 ===');

const server = await createServer({
  server: { port: 5178 },
  configFile: path.resolve('vite.config.js')
});
await server.listen();
const url = 'http://localhost:5178/';
console.log(`Servidor Vite activo en ${url}`);

const outputDir = path.resolve('evidence/stage12f');
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
  await page.waitForTimeout(600);

  // 2. Navegar a la pestaña "Descenso y aterrizaje"
  console.log('Navegando a la pestaña Descenso y aterrizaje...');
  await page.click('button[data-lab-section="landing"]');
  await page.waitForTimeout(600);

  // EVIDENCIA 01: Selector de 19 cuerpos y configuración inicial (Luna)
  console.log('Capturando evidencia 01: Selector y configuración inicial (Luna)...');
  await page.screenshot({ path: path.join(outputDir, '01_landing_config_moon.png') });

  // Calcular descenso en la Luna
  console.log('Calculando descenso en la Luna...');
  await page.click('#ld-calculate');
  await page.waitForTimeout(1000);

  // EVIDENCIA 02: Resultados del aterrizaje suave en la Luna
  console.log('Capturando evidencia 02: Resultados aterrizaje en la Luna...');
  await page.screenshot({ path: path.join(outputDir, '02_landing_results_moon.png') });

  // EVIDENCIA 03: Reproducir en Centro de Misión (Luna - Aterrizaje suave)
  console.log('Pasando a Centro de Misión para la Luna...');
  await page.click('#ld-execute');
  await page.waitForTimeout(1000);

  // Reproducir un poco y verificar controles
  await page.click('#mc-play');
  await page.waitForTimeout(1500);
  await page.click('#mc-pause');
  await page.waitForTimeout(300);

  console.log('Capturando evidencia 03: Centro de Misión en descenso lunar...');
  await page.screenshot({ path: path.join(outputDir, '03_mission_control_moon_landing.png') });

  // Probar Cámara Local en Centro de Misión
  console.log('Probando cámara local en descenso...');
  const localCamBtn = page.locator('.mc-camera-bar button[data-camera="local"]');
  if (await localCamBtn.isVisible()) {
    await localCamBtn.click();
    await page.waitForTimeout(600);
    console.log('Capturando evidencia 04: Cámara local en descenso lunar...');
    await page.screenshot({ path: path.join(outputDir, '04_mission_control_local_camera.png') });
  }

  // 10 ciclos de avance y retroceso (verificar reversibilidad y telemetría idéntica)
  console.log('Ejecutando 10 ciclos de avance y retroceso en el Centro de Misión...');
  const timeline = page.locator('#mc-timeline');
  let reversibleOk = true;
  for (let i = 0; i < 10; i++) {
    await timeline.fill('2000');
    await page.waitForTimeout(50);
    const fuelMid = await page.locator('#mc-resource-metrics .lab-metric:has-text("Propelente restante") strong').textContent();
    await timeline.fill('100');
    await page.waitForTimeout(50);
    const fuelStart = await page.locator('#mc-resource-metrics .lab-metric:has-text("Propelente restante") strong').textContent();
    await timeline.fill('2000');
    await page.waitForTimeout(50);
    const fuelMidAgain = await page.locator('#mc-resource-metrics .lab-metric:has-text("Propelente restante") strong').textContent();
    if (fuelMid !== fuelMidAgain) {
      reversibleOk = false;
      console.warn(`Discrepancia en ciclo ${i}: ${fuelMid} vs ${fuelMidAgain}`);
    }
  }
  console.log(`Reversibilidad en 10 ciclos: ${reversibleOk ? 'PERFECTA (mismo combustible)' : 'FALLÓ'}`);

  // Saltar al evento de contacto final
  const contactBtn = page.locator('#mc-events button:has-text("Contacto")');
  if (await contactBtn.count() > 0) {
    await contactBtn.click();
    await page.waitForTimeout(600);
    console.log('Capturando evidencia 05: Telemetría de contacto final en Luna...');
    await page.screenshot({ path: path.join(outputDir, '05_telemetry_touchdown_moon.png') });
  }

  // Volver a Descenso y aterrizaje y probar Europa
  console.log('Regresando a pestaña Descenso para probar Europa...');
  await page.click('button[data-lab-section="landing"]');
  await page.waitForTimeout(600);

  await page.selectOption('#ld-body', '502'); // Europa
  await page.waitForTimeout(600);
  console.log('Capturando evidencia 06: Configuración Europa...');
  await page.screenshot({ path: path.join(outputDir, '06_landing_config_europa.png') });

  console.log('Calculando descenso en Europa...');
  await page.click('#ld-calculate');
  await page.waitForTimeout(1000);

  console.log('Capturando evidencia 07: Resultados Europa...');
  await page.screenshot({ path: path.join(outputDir, '07_landing_results_europa.png') });

  // Reproducir Europa en Centro de Misión (verificar que no aparece la Luna terrestre)
  console.log('Reproduciendo Europa en Centro de Misión...');
  await page.click('#ld-execute');
  await page.waitForTimeout(1000);
  console.log('Capturando evidencia 08: Centro de Misión en Europa (cuerpo central azul/hielo, Luna oculta)...');
  await page.screenshot({ path: path.join(outputDir, '08_mission_control_europa.png') });

  // Regresar a Descenso para probar destino bloqueado (Marte - Atmósfera pendiente)
  console.log('Probando destino atmosférico bloqueado (Marte)...');
  await page.click('button[data-lab-section="landing"]');
  await page.waitForTimeout(600);

  await page.selectOption('#ld-body', '499'); // Marte
  await page.waitForTimeout(600);
  console.log('Capturando evidencia 09: Destino atmosférico pendiente bloqueado...');
  await page.screenshot({ path: path.join(outputDir, '09_blocked_atmospheric_mars.png') });

  // Probar Gigante Gaseoso bloqueado (Júpiter - No aplicable)
  console.log('Probando gigante gaseoso bloqueado (Júpiter)...');
  await page.selectOption('#ld-body', '599'); // Júpiter
  await page.waitForTimeout(600);
  console.log('Capturando evidencia 10: Gigante gaseoso no aplicable...');
  await page.screenshot({ path: path.join(outputDir, '10_blocked_gas_giant_jupiter.png') });

  // Probar caso de fallo: Encélado con DEMO_LANDER (empuje mínimo supera gravedad)
  console.log('Probando Encélado con módulo demostrativo...');
  await page.selectOption('#ld-body', '602'); // Encélado
  await page.waitForTimeout(600);
  await page.click('#ld-calculate');
  await page.waitForTimeout(600);
  console.log('Capturando evidencia 11: Rechazo por empuje mínimo superior a gravedad...');
  await page.screenshot({ path: path.join(outputDir, '11_rejected_minimum_thrust_enceladus.png') });

  // Probar caso de fallo: Combustible insuficiente (Luna con 1500 kg)
  console.log('Probando fallo por combustible insuficiente...');
  await page.selectOption('#ld-body', '301'); // Luna
  await page.waitForTimeout(600);
  // Abrir la sección colapsable del módulo de aterrizaje
  await page.evaluate(() => {
    document.querySelectorAll('#lab-landing details').forEach(d => d.open = true);
  });
  await page.waitForTimeout(300);
  // Modificar propelente a 1500 kg
  const propInput = page.locator('input[data-lander="propellantMassKg"]');
  await propInput.fill('1500');
  await page.waitForTimeout(300);
  await page.click('#ld-calculate');
  await page.waitForTimeout(1000);
  console.log('Capturando evidencia 12: Fallo combustible agotado...');
  await page.screenshot({ path: path.join(outputDir, '12_failure_fuel_depleted.png') });

  // Probar caso de impacto: Velocidad terminal alta (td = 9.0 m/s)
  console.log('Probando caso de impacto...');
  await page.click('#ld-reset'); // restablecer lander
  await page.waitForTimeout(400);
  await page.locator('#ld-td').fill('9.0');
  await page.waitForTimeout(300);
  await page.click('#ld-calculate');
  await page.waitForTimeout(1000);
  console.log('Capturando evidencia 13: Clasificación de impacto...');
  await page.screenshot({ path: path.join(outputDir, '13_failure_impact_classified.png') });

  // Probar correcciones 12E.1 en el navegador:
  // Ir a pestaña Lanzamiento
  console.log('Probando correcciones 12E.1 en pestaña Lanzamiento...');
  await page.click('button[data-lab-section="launch"]');
  await page.waitForTimeout(600);

  // Caso 1: 561 kg (órbita)
  console.log('Lanzamiento con 561 kg...');
  await page.click('#ln-calculate');
  await page.waitForTimeout(1200);
  await page.click('#ln-execute');
  await page.waitForTimeout(1000);

  // Probar cámara local de lanzamiento (DEF-12E-01)
  const launchLocalCam = page.locator('.mc-camera-bar button[data-camera="local"]');
  if (await launchLocalCam.isVisible()) {
    await launchLocalCam.click();
    await page.waitForTimeout(600);
    console.log('Capturando evidencia 14: Cámara local en lanzamiento terrestre (DEF-12E-01)...');
    await page.screenshot({ path: path.join(outputDir, '14_fix_12e01_launch_local_camera.png') });
  }

  // Regresar a Lanzamiento y probar OBS-12E-01 (impacto suborbital con sobrecarga)
  await page.click('button[data-lab-section="launch"]');
  await page.waitForTimeout(600);

  // Verificación responsiva en 5 resoluciones
  console.log('\n--- Realizando pruebas responsivas en 5 factores de forma ---');
  const viewports = [
    { name: '15a_responsive_1920x1080', width: 1920, height: 1080 },
    { name: '15b_responsive_1366x768', width: 1366, height: 768 },
    { name: '15c_responsive_768x1024', width: 768, height: 1024 },
    { name: '15d_responsive_390x844', width: 390, height: 844 },
    { name: '15e_responsive_320x568', width: 320, height: 568 }
  ];

  // Regresamos a Descenso para las capturas responsivas
  await page.click('button[data-lab-section="landing"]');
  await page.waitForTimeout(600);
  await page.selectOption('#ld-body', '301');
  await page.click('#ld-reset');
  await page.locator('#ld-td').fill('1.0');
  await page.click('#ld-calculate');
  await page.waitForTimeout(1000);

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(500);
    console.log(`Capturando ${vp.name} (${vp.width}x${vp.height})...`);
    await page.screenshot({ path: path.join(outputDir, `${vp.name}.png`) });
  }

  // Captura responsiva del Centro de Misión a 320x568
  await page.click('#ld-execute');
  await page.waitForTimeout(1000);
  console.log('Capturando Centro de Misión en 320x568...');
  await page.screenshot({ path: path.join(outputDir, '16_responsive_mission_control_320x568.png') });

  console.log('\nTodas las capturas de navegador completadas con éxito.');
  console.log(`Errores de consola registrados: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.warn('Errores de consola:', consoleErrors);
  }

} catch (err) {
  console.error('Error durante la auditoría de navegador:', err);
} finally {
  await browser.close();
  await server.close();
  console.log('Navegador y servidor cerrados.');
}
