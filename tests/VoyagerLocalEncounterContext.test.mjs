import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createHistoricalEncounterContextResolver} from '../src/science/HistoricalEncounterContext.js';
import {createHistoricalVisualPipeline,physicalKmToScenePosition} from '../src/integration/HistoricalVisualPipeline.js';
import {createHistoricalEphemerisResolver} from '../src/science/HistoricalEphemerisResolver.js';
import {crearControladorCamara} from '../src/graphics/CameraController.js';

const publicRoot=new URL('../public/',import.meta.url);
const loadJson=async file=>JSON.parse(await readFile(new URL(file,publicRoot),'utf8'));
const reference=JSON.parse(await readFile(new URL('../evidence/voyager-reference-reconciliation/encounters.json',import.meta.url),'utf8'));
const catalog=await loadJson('data/historical-encounter-contexts-v1.json');
const resolver=createHistoricalEncounterContextResolver({loadJson});
const norm=v=>Math.hypot(...v);
const vector=s=>[s.positionKm.x,s.positionKm.y,s.positionKm.z,s.velocityKmS.x,s.velocityKmS.y,s.velocityKmS.z];
const fakeFetch=async url=>({ok:true,status:200,json:()=>loadJson(url.slice(1))});

test('nine moon-target encounter vectors match independent direct Horizons within interpolation tolerance',async()=>{
  for(const event of reference.events){
    const mission=event.probeId==='-31'?'voyager-1':'voyager-2';
    const moon=catalog.moonContexts.find(c=>c.id===event.id)?.moon;
    assert.ok(moon,event.id);
    for(const sample of event.samples){
      const result=await resolver.resolveMoon(mission,moon,sample.jdTdb);
      assert.ok(result.state,`${event.id} ${sample.offsetSeconds}`);
      assert.equal(result.state.origin,'probe-center');
      assert.equal(result.state.correction,'NONE');
      const delta=vector(result.state).map((x,i)=>x-sample.references.direct[i]);
      assert.ok(norm(delta.slice(0,3))<0.003,`${event.id}: position ${norm(delta.slice(0,3))} km`);
      assert.ok(norm(delta.slice(3))<0.000025,`${event.id}: velocity ${norm(delta.slice(3))} km/s`);
    }
  }
});

test('local coverage boundaries are exact and never extrapolated',async()=>{
  for(const entry of catalog.moonContexts){
    for(const edge of [entry.startJdTdb,entry.endJdTdb]){
      const result=await resolver.resolveMoon(entry.missionId,entry.moon,edge);
      assert.equal(result.status,'exact',entry.id);
    }
    for(const jdTdb of [entry.startJdTdb-1/86400,entry.endJdTdb+1/86400]){
      const result=await resolver.resolveMoon(entry.missionId,entry.moon,jdTdb);
      assert.equal(result.status,'out_of_coverage',entry.id);
      assert.equal(result.state,null);
    }
  }
  assert.equal((await resolver.resolveMoon('voyager-1','Triton',reference.events[0].time.jdTdb)).status,'unavailable');
});

test('local camera target geometry is direct while global probe state stays identical',async()=>{
  const pipeline=createHistoricalVisualPipeline({baseUrl:'/',fetchImpl:fakeFetch});
  const global=createHistoricalEphemerisResolver({loadJson});
  for(const event of reference.events){
    const mission=event.probeId==='-31'?'voyager-1':'voyager-2';
    const moon=catalog.moonContexts.find(c=>c.id===event.id).moon;
    const sample=event.samples.find(s=>s.offsetSeconds===0);
    const [snapshot,raw]=await Promise.all([
      pipeline.queryVisualHistoricalSnapshot(sample.jdTdb),
      global.queryHistoricalSnapshot(sample.jdTdb)
    ]);
    const local=snapshot.localFrames[`${mission}:${moon}`];
    assert.ok(local,event.id);
    const moonScene=snapshot.moons[moon].visual.posicionEscena;
    const difference={x:moonScene.x-local.observerPositionScene.x,
      y:moonScene.y-local.observerPositionScene.y,z:moonScene.z-local.observerPositionScene.z};
    const expected=physicalKmToScenePosition(local.targetMinusObserverKm);
    assert.ok(Math.hypot(difference.x-expected.x,difference.y-expected.y,difference.z-expected.z)<1e-10,event.id);
    assert.ok(Math.abs(local.distanceKm-sample.directDistanceKm)<0.003,event.id);
    const localVelocity=local.targetMinusObserverVelocityKmS;
    const velocityResidual=norm([localVelocity.x,localVelocity.y,localVelocity.z]
      .map((value,i)=>value-sample.references.direct[i+3]));
    assert.ok(velocityResidual<0.000025,event.id);
    assert.deepEqual(snapshot.probes[mission].state.position,raw.probes[mission].state.position,event.id);
    assert.deepEqual(snapshot.probes[mission].state.velocity,raw.probes[mission].state.velocity,event.id);
    const camera=new THREE.PerspectiveCamera(48,16/9,0.00001,36000);
    const targetGroup=new THREE.Group();targetGroup.position.set(moonScene.x,moonScene.y,moonScene.z);
    const probeGroup=new THREE.Group();probeGroup.position.set(1000,0,0);
    const controller=crearControladorCamara({camera,
      controls:{target:new THREE.Vector3(),update(){},enabled:true},objetos:new Map(),
      satelites:new Map([[moon,{posicion:targetGroup,malla:new THREE.Mesh(),radioFisicoEscena:0.001}]]),
      sondasHistoricas:new Map([[mission,{posicion:probeGroup,establecerOcultaPorPrimeraPersona(){},obtenerRadioObservacionActual:()=>0.025}]]),
      orbitas:[],canvas:{addEventListener(){}},
      obtenerZonaEncuadre:()=>({width:1280,height:720,left:0,right:1280,top:0,bottom:720})});
    controller.establecerContextosLocales({[`${mission}:${moon}`]:local});
    assert.equal(controller.activarPrimeraPersona(mission,{objetivo:moon,fovGrados:6}),true,event.id);
    const toTarget=targetGroup.position.clone().sub(camera.position).normalize();
    assert.ok(camera.getWorldDirection(new THREE.Vector3()).dot(toTarget)>0.999999999,event.id);
  }
  const snapshot2026=await pipeline.queryVisualHistoricalSnapshot(2461300.5);
  assert.deepEqual(snapshot2026.localFrames,{});
  assert.ok(snapshot2026.probes['voyager-1'].state);
  assert.ok(snapshot2026.probes['voyager-2'].state);
});

test('camera uses local observer for moon aiming/FOV and exits locally when coverage ends',()=>{
  const camera=new THREE.PerspectiveCamera(48,16/9,0.00001,36000);
  const controls={target:new THREE.Vector3(),update(){},enabled:true};
  const moon=new THREE.Group();moon.position.set(40,2,3);
  const probe=new THREE.Group();probe.position.set(500,2,3);
  let freeLeft=0,freeRight=1280;
  const controller=crearControladorCamara({camera,controls,objetos:new Map(),
    satelites:new Map([['Io',{posicion:moon,malla:new THREE.Mesh(),radioFisicoEscena:0.01}]]),
    sondasHistoricas:new Map([['voyager-1',{posicion:probe,establecerOcultaPorPrimeraPersona(){},obtenerRadioObservacionActual:()=>0.025}]]),
    orbitas:[],canvas:{addEventListener(){}},obtenerZonaEncuadre:()=>({width:1280,height:720,left:freeLeft,right:freeRight,top:0,bottom:720})});
  const local={observerPositionScene:{x:39.8,y:2,z:3},source:'NASA/JPL Horizons',datasetId:'v1-io-encounter-1979'};
  controller.establecerContextosLocales({'voyager-1:Io':local});
  assert.equal(controller.activarPrimeraPersona('voyager-1',{objetivo:'Io',fovGrados:6}),true);
  assert.deepEqual(camera.position.toArray(),[39.8,2,3]);
  assert.equal(controller.obtenerEstadoCamaraHistorica().contextoGeometria,'encuentro_local');
  assert.ok(controller.obtenerFovContextualParaObjetivo('voyager-1','Io')<48);
  controller.establecerFovPrimeraPersona(controller.obtenerFovContextualParaObjetivo('voyager-1','Io'),{automatico:true});
  const wideFov=camera.fov;
  freeLeft=600;freeRight=680;
  controller.actualizarFovContextualAutomatico();
  assert.ok(camera.fov>wideFov,'narrow free area must enlarge contextual FOV');
  freeLeft=0;freeRight=1280;
  controller.actualizarFovContextualAutomatico();
  assert.ok(Math.abs(camera.fov-wideFov)<0.05,'contextual FOV must recover when panel closes');
  controller.establecerFovPrimeraPersona(10);
  freeLeft=600;freeRight=680;
  controller.actualizarFovContextualAutomatico();
  assert.equal(camera.fov,10,'manual FOV must remain under user control');
  controller.establecerContextosLocales({});
  assert.equal(controller.obtenerEstadoCamaraHistorica().modo,'exterior');
  assert.deepEqual(probe.position.toArray(),[500,2,3]);
});
