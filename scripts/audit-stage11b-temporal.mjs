import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const playwrightPath=path.join(process.env.LOCALAPPDATA,
  'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(playwrightPath).href);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
const root='evidence/voyager-stage11b/browser';
try {
  const page=await browser.newPage({viewport:{width:768,height:1024},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5174/',{waitUntil:'networkidle'});
  await page.locator('[data-mode-btn="historico"]').click();
  await page.locator('#historical-welcome-modal').waitFor({state:'visible'});
  await page.locator('#welcome-explore-free').click();
  await page.waitForFunction(()=>window.__SIMULADOR_DIAGNOSTICO__?.obtenerSnapshotHistorico());
  const initial=await page.evaluate(()=>window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico());
  assert.match(initial.timeLabels.labelUtc,/1977/);
  if(await page.locator('#inspector-toggle').getAttribute('aria-expanded')==='false')
    await page.locator('#inspector-toggle').click();
  await page.locator('#tab-history').click();
  if(!await page.locator('#historical-events-panel').evaluate(el=>el.open))
    await page.locator('#historical-events-panel summary').click();
  await page.locator('[data-event-id="v1-io-plume-1979"]').click();
  await page.waitForFunction(()=>window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico()?.timeLabels.labelUtc.includes('1979'));
  // Vuelta temporal manual con la foto de Ío aún seleccionada en la ficha.
  await page.evaluate(async target=>{
    const {HISTORICAL_MISSIONS_CATALOG}=await import('/src/science/VoyagerHistoricalMissions.js');
    const min=HISTORICAL_MISSIONS_CATALOG['voyager-2'].launchJdTdb;
    const max=2461346.5;
    const range=document.querySelector('#hist-timeline-range');
    range.max='1000000000000';
    range.value=String(Math.round((target-min)/(max-min)*Number(range.max)));
    range.dispatchEvent(new Event('input',{bubbles:true}));
  },initial.jdTdb);
  await page.waitForFunction(target=>Math.abs(window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico()?.jdTdb-target)<1e-8,
    initial.jdTdb,{timeout:30000});
  await page.locator('#hist-ev-photo-btn').click();
  await page.waitForFunction(()=>window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotComparador()
    && document.querySelector('#comp-recreation-date')?.textContent.includes('1979'));
  const open=await page.evaluate(()=>({
    motorJd:window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().jdTdb,
    sceneJd:window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotComparador().jdTdb,
    saved:document.querySelector('#comp-session-date').textContent,
    scene:document.querySelector('#comp-recreation-date').textContent,
    photo:document.querySelector('#comp-photo-date').textContent
  }));
  assert.match(open.saved,/1977/);
  assert.match(open.scene,/1979/);
  assert.match(open.photo,/hora de captura no publicada/);
  await page.screenshot({path:path.join(root,'voyager1-io-768x1024-two-dates-photo.png')});
  await page.locator('#comp-minimize-btn').click();
  assert.match(await page.locator('#comp-minimized-time').textContent(),/1979.*1977/);
  await page.screenshot({path:path.join(root,'voyager1-io-768x1024-two-dates-minimized.png')});
  await page.locator('#comp-minimize-btn').click();
  await page.locator('#comp-close-btn').click();
  await page.waitForFunction(target=>{
    const d=window.__SIMULADOR_DIAGNOSTICO__;
    return document.querySelector('#photo-comparator-panel').hidden
      && Math.abs(d.obtenerSnapshotHistorico()?.jdTdb-target)<1e-8;
  },initial.jdTdb,{timeout:30000});
  const closed=await page.evaluate(()=>({
    motorJd:window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().jdTdb,
    snapshotJd:window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico().jdTdb,
    clock:document.querySelector('#hist-clock-utc').textContent
  }));
  assert.ok(Math.abs(closed.motorJd-initial.jdTdb)<1e-8);
  assert.ok(Math.abs(closed.snapshotJd-closed.motorJd)<1e-9);
  assert.match(closed.clock,/1977/);
  await page.screenshot({path:path.join(root,'voyager1-io-768x1024-two-dates-restored.png')});
  if(!await page.locator('#historical-events-panel').evaluate(el=>el.open))
    await page.locator('#historical-events-panel summary').click();
  await page.locator('#hist-ev-photo-btn').click();
  await page.waitForFunction(()=>window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotComparador());
  await page.locator('#comp-minimize-btn').click();
  const target=initial.jdTdb+2;
  await page.evaluate(async jd=>{
    const {HISTORICAL_MISSIONS_CATALOG}=await import('/src/science/VoyagerHistoricalMissions.js');
    const min=HISTORICAL_MISSIONS_CATALOG['voyager-2'].launchJdTdb;
    const max=2461346.5;
    const range=document.querySelector('#hist-timeline-range');
    range.max='1000000000000';
    range.value=String(Math.round((jd-min)/(max-min)*Number(range.max)));
    range.dispatchEvent(new Event('input',{bubbles:true}));
  },target);
  await page.waitForFunction(jd=>{
    const d=window.__SIMULADOR_DIAGNOSTICO__;
    return document.querySelector('#photo-comparator-panel').hidden
      && Math.abs(d.obtenerSnapshotHistorico()?.jdTdb-jd)<1e-6;
  },target,{timeout:30000}).catch(async error => {
    console.log('Navegación minimizada:',await page.evaluate(()=>({
      comparatorHidden:document.querySelector('#photo-comparator-panel').hidden,
      comparatorView:document.querySelector('#photo-comparator-panel').dataset.view,
      motor:window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().jdTdb,
      snapshot:window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico()?.jdTdb,
      timelineVisible:getComputedStyle(document.querySelector('#historical-timeline-panel')).visibility
    })));
    throw error;
  });
  const navigation=await page.evaluate(()=>({
    motorJd:window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico().jdTdb,
    snapshotJd:window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico().jdTdb,
    clock:document.querySelector('#hist-clock-utc').textContent
  }));
  assert.ok(Math.abs(navigation.motorJd-target)<1e-6);
  assert.ok(Math.abs(navigation.snapshotJd-navigation.motorJd)<1e-9);
  await page.screenshot({path:path.join(root,'voyager1-io-768x1024-minimized-time-navigation.png')});
  await fs.writeFile(path.join(root,'two-dates-results.json'),JSON.stringify({initial:{jdTdb:initial.jdTdb,label:initial.timeLabels.labelUtc},open,closed,navigation},null,2)+'\n');
  console.log('Fechas 1977/1979 y restauración verificadas');
} finally {await browser.close();}
