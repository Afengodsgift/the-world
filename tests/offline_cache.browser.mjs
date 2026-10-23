// Offline cache (sw.js) in a real browser: needs playwright-core + chromium (not part of run_all.sh).
import {createRequire} from 'module';import http from 'http';import fs from 'fs';
const NP=process.env.NODE_PATH||'/home/claude/tools_nm/node_modules',{chromium}=createRequire(NP+'/')('playwright-core');let bad=0;const ok=(v,m)=>{console.log(v?'ok':'FAIL',m);if(!v)bad++};
let hits=0,down=false;
const srv=http.createServer((q,r)=>{const p=q.url.split('?')[0];
 if(p==='/sw.js'){r.writeHead(200,{'content-type':'text/javascript','cache-control':'no-cache'});return r.end(fs.readFileSync(new URL('../sw.js',import.meta.url)))}
 if(p==='/t.html'){r.writeHead(200,{'content-type':'text/html'});return r.end('<script>navigator.serviceWorker.register("/sw.js")</script>ok')}
 if(down){r.destroy();return}
 if(p.startsWith('/assets/')){hits++;r.writeHead(200,{'content-type':'text/plain','cache-control':'no-cache'});return r.end('asset-v'+hits)}
 if(p==='/src/x.js'){r.writeHead(200,{'content-type':'text/javascript'});return r.end('//js v'+(++hits))}
 r.writeHead(404);r.end()}).listen(0);await new Promise(r=>srv.on('listening',r));const port=srv.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const ctx=await b.newContext();const page=await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/t.html`);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForTimeout(800);
const f=u=>page.evaluate(async u=>{try{const r=await fetch(u);return r.status+':'+await r.text()}catch(e){return 'ERR '+e.message}},u);
ok(await page.evaluate(()=>!!navigator.serviceWorker.controller),'the worker controls the page');
ok((await f('/assets/a.bin')).startsWith('200:'),'online: asset loads');ok((await f('/src/x.js')).startsWith('200:'),'online: script loads');
await page.waitForTimeout(500);down=true;
ok((await f('/assets/a.bin')).startsWith('200:asset'),'server down: a cached asset is still served');
ok((await f('/src/x.js')).startsWith('200:'),'server down: a cached script is still served');
ok((await f('/assets/never.bin')).startsWith('ERR'),'server down: an uncached asset fails (nothing invented)');
down=false;await f('/assets/a.bin');await page.waitForTimeout(600);ok((await f('/assets/a.bin')).startsWith('200:asset-v'),'back online: still served (refreshed quietly)');
await b.close();srv.close();console.log(bad?bad+' FAILED':'all ok');process.exit(bad?1:0);
