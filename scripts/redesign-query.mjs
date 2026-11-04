const ts=await fetch('http://127.0.0.1:9338/json').then(r=>r.json());const ws=new WebSocket(ts.find(t=>t.type==='page'&&t.url.startsWith('http://127.0.0.1')).webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);ws.onmessage=e=>{console.log(e.data);ws.close()};ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'document.querySelector("#mission-elapsed").textContent',returnByValue:true}}));


