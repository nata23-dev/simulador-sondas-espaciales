import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {MOONS} from '../src/science/PlanetaryMoons.js';
import {VOYAGER_HISTORICAL_EVENTS} from '../src/science/VoyagerHistoricalEvents.js';

const playwrightPath=path.join(process.env.LOCALAPPDATA,'CodexScientificTools/voyager-e2e/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(playwrightPath).href);
const output=path.resolve(process.env.VOYAGER_E2E_OUTPUT??'evidence/voyager-stage7');
await fs.mkdir(output,{recursive:true});
const definitions=[
  ['v1-io-encounter-1979','Io'],['v1-europa-1979','Europa'],
  ['v1-ganymede-1979','Ganymede'],['v1-callisto-1979','Callisto'],
  ['v1-titan-1980','Titan'],['v2-europa-1979','Europa'],
  ['v2-titania-1986','Titania'],['v2-miranda-1986','Miranda'],
  ['v2-triton-1989','Triton']
];
const captureSet=new Set(['v1-io-encounter-1979:1920x1080','v1-titan-1980:1920x1080',
  'v2-titania-1986:1366x768','v2-miranda-1986:1366x768','v2-triton-1989:390x844',
  'v1-titan-1980:390x844']);
const sizes=[[1920,1080],[1366,768],[390,844]];
const numericAudit=JSON.parse(await fs.readFile('evidence/voyager-encounter-context/relative-audit.json','utf8'));
const references=new Map(numericAudit.moonRows.filter(row=>row.offsetSeconds===0).map(row=>[row.eventId,row]));
const report={browser:'Google Chrome (installed executable), Playwright 1.56.1',url:process.env.VOYAGER_E2E_URL??'http://127.0.0.1:5173/',
  captures:[],results:[],comparators:[],transitions:[],errors:[]};
const chromePath = process.env.CHROME_BIN || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await chromium.launch({executablePath: chromePath,
  headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
try{
  for(const [width,height] of sizes){
    const viewport=`${width}x${height}`;
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    page.on('pageerror',error=>report.errors.push({viewport,kind:'pageerror',message:error.message}));
    page.on('console',message=>{if(message.type()==='error')report.errors.push({viewport,kind:'console',message:message.text()});});
    page.on('requestfailed',request=>report.errors.push({viewport,kind:'requestfailed',url:request.url(),message:request.failure()?.errorText}));
    await page.goto(report.url,{waitUntil:'networkidle'});
    await page.locator('[data-mode-btn="historico"]').click();
    await page.locator('#historical-welcome-modal').waitFor({state:'visible'});
    await page.locator('#welcome-explore-free').click();
    for(const [eventId,target] of definitions){
      const event=VOYAGER_HISTORICAL_EVENTS.find(x=>x.id===eventId);
      if(!event)throw Error(`Missing event ${eventId}`);
      if(await page.locator('#inspector-toggle').getAttribute('aria-expanded')==='false')await page.locator('#inspector-toggle').click();
      await page.locator('#tab-history').click();
      if(!await page.locator('#historical-events-panel').evaluate(e=>e.open))await page.locator('#historical-events-panel summary').click();
      await page.locator(`[data-event-id="${eventId}"]`).click();
      await page.waitForFunction(id=>{
        const d=window.__SIMULADOR_DIAGNOSTICO__;
        const c=d?.obtenerEstadoCamaraHistorica(),s=d?.obtenerSnapshotHistorico();
        return c?.datasetContextoLocal===id&&c?.modo==='first_person'&&!c?.transicionActiva
          &&s?.localFrames?.[`${c.idSondaObservador}:${c.objetivoMirada}`]?.datasetId===id;
      },eventId,{timeout:20000});
      await page.waitForTimeout(450);
      const data=await page.evaluate(()=>{
        const d=window.__SIMULADOR_DIAGNOSTICO__,snapshot=d.obtenerSnapshotHistorico();
        const camera=d.obtenerEstadoCamaraHistorica();
        const key=`${camera.idSondaObservador}:${camera.objetivoMirada}`;
        const local=snapshot.localFrames[key];
        const target=snapshot.moons[camera.objetivoMirada];
        const hud=document.querySelector('#fp-fidelity-badge');
        return {camera,local,moon:target?.visual?.posicionEscena,jdTdb:snapshot.jdTdb,
          hudText:hud?.textContent,description:document.querySelector('#hist-ev-desc')?.textContent,
          canvasRect:document.querySelector('canvas')?.getBoundingClientRect().toJSON(),
          scrollWidth:document.documentElement.scrollWidth};
      });
      const angularDeg=2*Math.asin(MOONS[target].radiusKm/data.local.distanceKm)*180/Math.PI;
      const observedAngular=data.camera.encuadreObjetivo?.diametroEsferaGrados;
      const cameraOffsetKm=Math.hypot(...data.camera.posicionEscena.map((value,i)=>
        value-[data.local.observerPositionScene.x,data.local.observerPositionScene.y,data.local.observerPositionScene.z][i]));
      const relativeScene=Math.hypot(data.moon.x-data.camera.posicionEscena[0],
        data.moon.y-data.camera.posicionEscena[1],data.moon.z-data.camera.posicionEscena[2]);
      const row={viewport,eventId,target,dateUtc:event.dateUtc,jdTdb:data.jdTdb,
        jdDifferenceSeconds:(data.jdTdb-event.jdTdb)*86400,
        cameraMode:data.camera.modo,cameraTarget:data.camera.objetivoMirada,
        cameraContext:data.camera.contextoGeometria,datasetId:data.camera.datasetContextoLocal,
        distanceKm:data.local.distanceKm,angularExpectedDeg:angularDeg,angularCameraDeg:observedAngular,
        angularResidualDeg:observedAngular-angularDeg,fovDeg:data.camera.fovGrados,
        fitsFreeArea:data.camera.encuadreObjetivo?.cabeEnAreaLibre,
        cameraObserverOffsetScene:cameraOffsetKm,relativeSceneDistance:relativeScene,
        canvasRect:data.canvasRect,scrollWidth:data.scrollWidth,hudText:data.hudText,
        eventDescription:data.description};
      await page.locator('#inspector-close').click();
      await page.waitForTimeout(650);
      const closed=await page.evaluate(()=>window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica());
      row.closedPanelFovDeg=closed.fovGrados;
      row.closedPanelFitsFreeArea=closed.encuadreObjetivo?.cabeEnAreaLibre;
      row.closedPanelAngularDeg=closed.encuadreObjetivo?.diametroEsferaGrados;
      row.closedPanelCameraMode=closed.modo;
      row.closedPanelTarget=closed.objetivoMirada;
      assert.ok(Math.abs(row.distanceKm-references.get(eventId).horizonsDistanceKm)<0.003,eventId);
      assert.ok(Math.abs(row.angularResidualDeg)<0.00001,eventId);
      assert.ok(row.cameraObserverOffsetScene<1e-9,eventId);
      assert.ok(Math.abs(row.jdDifferenceSeconds)<0.001,eventId);
      assert.equal(row.closedPanelCameraMode,'first_person',eventId);
      assert.equal(row.closedPanelTarget,target,eventId);
      assert.equal(row.closedPanelFitsFreeArea,true,`${eventId} ${viewport} closed panel`);
      report.results.push(row);
      if(captureSet.has(`${eventId}:${viewport}`)){
        const file=`${eventId}-${viewport}.png`;
        await page.screenshot({path:path.join(output,file),fullPage:false});
        report.captures.push({eventId,viewport,file:`${path.relative(process.cwd(),output).replaceAll('\\','/')}/${file}`,
          cameraMode:data.camera.modo,context:data.camera.contextoGeometria});
      }
      console.log(viewport,eventId,data.local.distanceKm.toFixed(3),
        `ang=${observedAngular.toFixed(4)}`,`fov-open=${data.camera.fovGrados.toFixed(4)}`,
        `fov-closed=${closed.fovGrados.toFixed(4)}`,`fit=${row.closedPanelFitsFreeArea}`);
      if(event.photoIds?.length){
        if(await page.locator('#inspector-toggle').getAttribute('aria-expanded')==='false')await page.locator('#inspector-toggle').click();
        await page.locator('#tab-history').click();
        await page.locator('#hist-ev-photo-btn').click();
        await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__
          ?.obtenerEstadoCamaraHistorica()?.modo === 'photo_recreation', null, { timeout: 20000 });
        await page.locator('#comp-photo-img').evaluate(img=>new Promise((resolve,reject)=>{
          if(img.complete)return img.naturalWidth?resolve():reject(Error('Photo failed'));
          img.addEventListener('load',resolve,{once:true});img.addEventListener('error',()=>reject(Error('Photo failed')),{once:true});
        }));
        const comp=await page.evaluate(()=>({
          camera:window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica(),
          title:document.querySelector('#comp-photo-title').textContent,
          source:document.querySelector('#comp-photo-link').href,
          loaded:document.querySelector('#comp-photo-img').naturalWidth>0,
          fidelity:document.querySelector('#comp-fidelity-note').textContent,
          telemetry:document.querySelector('#comp-geometry-telemetry').textContent
        }));
        await page.locator('#comp-close-btn').click();
        await page.waitForFunction(() => window.__SIMULADOR_DIAGNOSTICO__
          ?.obtenerEstadoCamaraHistorica()?.modo === 'first_person', null, { timeout: 20000 });
        const restored=await page.evaluate(()=>window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica());
        assert.equal(comp.camera.modo,'photo_recreation',eventId);
        assert.equal(comp.camera.objetivoMirada,target,eventId);
        assert.ok(comp.source.startsWith('https://'),eventId);
        assert.ok(comp.fidelity.includes('CK')||comp.fidelity.includes('orientación'),eventId);
        assert.equal(restored.modo,'first_person',eventId);
        assert.equal(restored.objetivoMirada,target,eventId);
        report.comparators.push({viewport,eventId,...comp,restoredMode:restored.modo,
          restoredTarget:restored.objetivoMirada});
      }
    }
    if(viewport==='390x844'){
      const start=await page.evaluate(()=>window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico().jdTdb);
      await page.locator('#hist-speed-select').selectOption('1h_s');
      await page.locator('#hist-play-btn').click();
      await page.waitForTimeout(1250);
      await page.locator('#hist-play-btn').click();
      const played=await page.evaluate(()=>({
        jdTdb:window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico().jdTdb,
        camera:window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica()
      }));
      assert.ok(played.jdTdb>start,'playback advances TDB');
      assert.equal(played.camera.objetivoMirada,'Triton');
      await page.locator('#historical-date-options > summary').click();
      await page.locator('#hist-day-select').selectOption('27');
      await page.waitForFunction(()=>window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica().modo==='exterior');
      const after=await page.evaluate(()=>({
        jdTdb:window.__SIMULADOR_DIAGNOSTICO__.obtenerSnapshotHistorico().jdTdb,
        camera:window.__SIMULADOR_DIAGNOSTICO__.obtenerEstadoCamaraHistorica()
      }));
      assert.equal(after.camera.contextoGeometria,'trayectoria_global');
      report.transitions.push({viewport,eventId:'v2-triton-1989',startJdTdb:start,
        playedJdTdb:played.jdTdb,playedContext:played.camera.contextoGeometria,
        afterCoverageJdTdb:after.jdTdb,afterMode:after.camera.modo});
    }
    await page.close();
  }
}finally{await browser.close();}
await fs.writeFile(path.join(output,'e2e-results.json'),JSON.stringify(report,null,2)+'\n');
console.log('RESULTS',report.results.length,'CAPTURES',report.captures.length,
  'COMPARATORS',report.comparators.length,'TRANSITIONS',report.transitions.length,'ERRORS',report.errors.length);
