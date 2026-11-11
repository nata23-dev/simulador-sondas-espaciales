import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const playwrightPath = path.join(process.env.LOCALAPPDATA,
  'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const root = path.resolve('evidence/voyager-stage11b/browser');
await fs.mkdir(root, { recursive:true });
const browser = await chromium.launch({
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']
});
const results=[];
const sizes=[[320,568],[360,780],[390,844],[414,896],[768,1024],[1280,720],[1920,1080]]
  .filter(([width])=>!process.env.STAGE11B_WIDTH || width===Number(process.env.STAGE11B_WIDTH));
try {
  for (const [width,height] of sizes) {
    const errors=[];
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(process.env.VOYAGER_E2E_URL??'http://127.0.0.1:5174/',{waitUntil:'networkidle'});
    await page.locator('[data-mode-btn="historico"]').click();
    await page.locator('#historical-welcome-modal').waitFor({state:'visible'});
    await page.locator('#welcome-explore-free').click();
    if(await page.locator('#inspector-toggle').getAttribute('aria-expanded')==='false')
      await page.locator('#inspector-toggle').click();
    await page.locator('#tab-history').click();
    if(!await page.locator('#historical-events-panel').evaluate(el=>el.open))
      await page.locator('#historical-events-panel summary').click();
    await page.locator('[data-event-id="v1-io-plume-1979"]').click();
    // Se abre inmediatamente tras el salto para probar la carrera 1977/1979.
    const before=await page.evaluate(()=>window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico());
    await page.locator('#hist-ev-photo-btn').click();
    await page.locator('#photo-comparator-panel').waitFor({state:'visible'});
    await page.waitForFunction(()=>window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotComparador()
      && document.querySelector('#comp-session-date')?.textContent.includes('1979'),null,{timeout:30000});
    await page.waitForFunction(()=>!window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica()?.transicionActiva);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('#historical-timeline-panel')).visibility==='hidden');
    await page.waitForTimeout(500);
    const state=await page.evaluate(()=>{
      const r=id=>{const b=document.querySelector(id).getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right};};
      const d=window.__SIMULADOR_DIAGNOSTICO__;
      return {motor:d.obtenerEstadoMotorHistorico(),session:d.obtenerSnapshotHistorico()?.timeLabels.labelUtc,
        comparison:d.obtenerSnapshotComparador()?.timeLabels.labelUtc,
        camera:d.obtenerEstadoCamaraHistorica(),
        photoDate:document.querySelector('#comp-photo-date').textContent,
        sceneDate:document.querySelector('#comp-recreation-date').textContent,
        sceneDateB:document.querySelector('#comp-recreation-date-b').textContent,
        savedDate:document.querySelector('#comp-session-date').textContent,
        timelineVisibility:getComputedStyle(document.querySelector('#historical-timeline-panel')).visibility,
        photo:r('#comp-photo-img'),card:r('.comparator-card-a'),
        pageWidth:document.documentElement.scrollWidth,viewport:innerWidth};
    });
    assert.equal(state.sceneDate,state.comparison);
    assert.equal(state.savedDate,'1979-03-08 · 12:00:00 UTC');
    assert.match(state.photoDate,/hora de captura no publicada/);
    assert.match(state.sceneDateB,/consulta geométrica/);
    assert.equal(state.timelineVisibility,'hidden');
    assert.ok(state.pageWidth<=state.viewport+1);
    assert.ok(await page.locator('#comp-photo-img').evaluate(el=>el.naturalWidth>0));
    if(width<=600) {
      assert.ok(state.photo.bottom<=height+1,'Fotografía completa dentro de viewport');
      assert.ok(state.photo.bottom<=state.card.bottom+1,'Fotografía completa dentro de tarjeta');
    }
    const prefix=`voyager1-io-${width}x${height}`;
    await page.screenshot({path:path.join(root,`${prefix}-photo.png`)});
    if(width<=600) {
      await page.locator('.comparator-card-a').evaluate(el=>{el.scrollTop=el.scrollHeight;});
      assert.ok(await page.locator('#comp-photo-link').isVisible());
      await page.screenshot({path:path.join(root,`${prefix}-photo-details.png`)});
      await page.locator('.comparator-card-a').evaluate(el=>{el.scrollTop=0;});
    }
    if(width<=760) await page.locator('#comp-view-3d').click();
    await page.screenshot({path:path.join(root,`${prefix}-3d-scientific.png`)});
    assert.equal(await page.locator('#comp-io-inspection-btn').getAttribute('aria-pressed'),'false');
    if(width<=760) await page.locator('.comparator-details summary').click();
    await page.locator('#comp-fov-zoom-btn').click();
    assert.equal(await page.locator('#comp-fov-zoom-btn').getAttribute('aria-pressed'),'true');
    assert.equal((await page.evaluate(()=>window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica())).fovTipo,'zoom_visual_vertical');
    await page.screenshot({path:path.join(root,`${prefix}-3d-zoom.png`)});
    if(width<=760) await page.locator('.comparator-details summary').click();
    await page.locator('#comp-io-inspection-btn').click();
    assert.equal(await page.locator('#comp-io-inspection-btn').getAttribute('aria-pressed'),'true');
    assert.ok(await page.locator('#comp-assist-note').isVisible());
    if(width<=760) await page.locator('.comparator-details summary').click();
    await page.screenshot({path:path.join(root,`${prefix}-3d-assisted.png`)});
    if(width<=760) await page.locator('.comparator-details summary').click();
    await page.locator('#comp-io-inspection-btn').click();
    assert.equal(await page.locator('#comp-io-inspection-btn').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#comp-assist-note').isVisible(),false);
    await page.locator('#comp-minimize-btn').click();
    assert.equal(await page.locator('#photo-comparator-panel').getAttribute('data-view'),'minimizado');
    await page.locator('#historical-timeline-panel').waitFor({state:'visible'});
    assert.match(await page.locator('#comp-minimized-time').textContent(),/Escena 3D: 1979-03-08.*Recorrido guardado: 1979-03-08/);
    assert.equal(await page.locator('#historical-timeline-panel').isVisible(),true,
      JSON.stringify(await page.locator('#historical-timeline-panel').evaluate(el=>({hidden:el.hidden,
        display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,
        rect:el.getBoundingClientRect().toJSON()}))));
    await page.screenshot({path:path.join(root,`${prefix}-minimized.png`)});
    await page.locator('#comp-minimize-btn').click();
    if(width<=760) {
      assert.equal(await page.locator('.comparator-card-a').isVisible(),true);
      await page.locator('#comp-view-3d').click();
      await page.locator('#comp-view-photo').click();
    }
    await page.locator('#comp-photo-select').selectOption('v1-titan-haze-1980');
    await page.waitForFunction(()=>document.querySelector('#comp-recreation-date')?.textContent.includes('1980'));
    await page.locator('#comp-photo-select').selectOption('v1-io-plumes-1979');
    await page.waitForFunction(()=>document.querySelector('#comp-recreation-date')?.textContent.includes('1979'));
    await page.locator(width<=760?'#comp-mobile-close-btn':'#comp-close-btn').click();
    await page.waitForFunction(()=>{
      const d=window.__SIMULADOR_DIAGNOSTICO__;
      const snap=d.obtenerSnapshotHistorico(),motor=d.obtenerEstadoMotorHistorico();
      return document.querySelector('#photo-comparator-panel').hidden
        && snap && Math.abs(snap.jdTdb-motor.jdTdb)<1e-9;
    },null,{timeout:30000});
    const after=await page.evaluate(()=>({motor:window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoMotorHistorico(),
      snapshot:window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico()?.timeLabels.labelUtc,
      timeline:document.querySelector('#hist-clock-utc').textContent,
      timelineVisible:document.querySelector('#historical-timeline-panel').getBoundingClientRect().height>0}));
    assert.equal(after.motor.jdTdb,before.jdTdb);
    assert.equal(after.snapshot,'1979-03-08 · 12:00:00 UTC');
    assert.equal(after.timeline,after.snapshot);
    assert.ok(after.timelineVisible);
    assert.deepEqual(errors,[]);
    results.push({width,height,beforeJdTdb:before.jdTdb,state,after,errors});
    await page.close();
    console.log(`${width}x${height} OK`);
  }
} finally {await browser.close();}
await fs.writeFile(path.join(root,'results.json'),JSON.stringify(results,null,2)+'\n');
console.log(`Chrome: ${results.length} resoluciones verificadas`);
