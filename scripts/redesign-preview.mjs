import fs from 'node:fs/promises';
const tabs=await fetch('http://127.0.0.1:9338/json').then(r=>r.json());
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const p=new Map();ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){p.get(d.id)?.(d.result);p.delete(d.id)}};const call=(method,params={})=>new Promise(r=>{p.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
await fs.mkdir('evidencias/rediseno-profesional',{recursive:true});await call('Page.enable');
for(const [w,h,n]of [[1600,900,'preview-desktop'],[390,844,'preview-mobile']]){await call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});await new Promise(r=>setTimeout(r,2000));const s=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('evidencias/rediseno-profesional/'+n+'.png',Buffer.from(s.data,'base64'));}ws.close();
