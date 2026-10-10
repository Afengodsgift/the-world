// Headless-Chromium smoke test for the Warden Isles: boots the REAL game (CDN scripts served from local npm three@0.147.0, Supabase stubbed),
// with ?warden=1 and without, and checks no errors, the isle exists, you can stand in the arena, and samples frame cost.
// Not part of run_all.sh (needs playwright-core + a Chromium); run:  NODE_PATH=<dir with three + playwright-core> node tests/warden_browser.mjs [--shots dir]
import {createRequire} from 'module';import http from 'http';import fs from 'fs';import path from 'path';
const req=createRequire(import.meta.url),NP=(process.env.NODE_PATH||'').split(path.delimiter)[0];
const {chromium}=createRequire(NP+'/')('playwright-core');
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'),shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)}).listen(0);
await new Promise(r=>srv.on('listening',r));const port=srv.address().port;
const STUB=`window.supabase={createClient:()=>{const ch={on(){return ch},subscribe(cb){setTimeout(()=>cb('SUBSCRIBED'),10);return ch},presenceState:()=>({}),track:async()=>{},send(){},unsubscribe(){}};
 const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},then(r){r({data:[],error:null})},upsert:async()=>({error:null}),insert:async()=>({error:null})};
 return{channel:()=>ch,removeChannel(){},from:()=>q,auth:{getSession:async()=>({data:{}})}}}}`;
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const browser=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
async function session(query,fn){
  const ctx=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true});const page=await ctx.newPage();const errs=[];
  page.on('pageerror',e=>errs.push(String(e)));page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)/,r=>{const m=r.request().url().match(/three@0\.147\.0\/(.*)$/)[1];const f=path.join(NP,'three',m);fs.existsSync(f)?r.fulfill({body:fs.readFileSync(f),contentType:'text/javascript'}):r.fulfill({status:404})});
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase/,r=>r.fulfill({body:STUB,contentType:'text/javascript'}));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>{const u=r.request().url();if(/jsdelivr/.test(u))return r.fallback();r.abort()});
  await page.goto(`http://127.0.0.1:${port}/index.html${query}`);
  await page.fill('#name','Tester');await page.click('#create');
  await page.waitForFunction(()=>typeof S!=='undefined'&&typeof me!=='undefined'&&me&&!document.getElementById('boot'),null,{timeout:120000});
  const r=await fn(page);await ctx.close();return{r,errs}}
// A) flag off: the world must contain no Warden objects and no extra solids
const A=await session('',async p=>p.evaluate(()=>({g:!!scene.getObjectByName('WardenIsles'),loc:LOCS.some(l=>l.n==='The Warden Isles'),wrd:WRD.on,h:H(150,-2450)})));
ok(A.r.g===false&&A.r.loc===false&&A.r.wrd===false,'flag off: no Warden group, no map place, WRD.on=false');ok(A.r.h<-5,'flag off: H() at the isle centre is open sea ('+A.r.h.toFixed(1)+')');
ok(A.errs.filter(e=>!/favicon|Failed to load resource/.test(e)).length===0,'flag off: no page errors '+JSON.stringify(A.errs.slice(0,3)));
// B) flag on
const B=await session('?warden=1&perf=1',async p=>{
  const info=await p.evaluate(()=>({g:!!scene.getObjectByName('WardenIsles'),loc:LOCS.some(l=>l.n==='The Warden Isles'),h:H(150,-2450),ns:solids.length,tris:renderer.info.render.triangles}));
  await p.evaluate(()=>{S.x=150;S.z=-2450+110;S.y=H(S.x,S.z)+1;S.flying=false;S.yaw=Math.PI});await p.waitForTimeout(1500);
  if(shots)await p.screenshot({path:shots+'/warden_landing.png'});
  await p.evaluate(()=>{S.x=150;S.z=-2450+22;S.y=H(S.x,S.z)+1});await p.waitForTimeout(1500);
  const st=await p.evaluate(()=>({inArena:WardenIsles.inArena(),y:S.y,gy:H(S.x,S.z),disc:[...disc].includes('The Warden Isles')}));
  if(shots)await p.screenshot({path:shots+'/warden_arena.png'});
  const ft=await p.evaluate(()=>new Promise(res=>{const a=[];let l=performance.now();function f(t){a.push(t-l);l=t;if(a.length<120)requestAnimationFrame(f);else res(a)}requestAnimationFrame(f)}));
  ft.sort((a,b)=>a-b);const med=ft[60],p95=ft[Math.floor(ft.length*.95)];
  return{info,st,med,p95}});
ok(B.r.info.g&&B.r.info.loc,'flag on: Warden group built and "The Warden Isles" is on the map');ok(B.r.info.h>3&&B.r.info.h<3.5,'flag on: isle centre is dry plateau ('+B.r.info.h.toFixed(2)+' m)');
ok(B.r.info.ns>=66,'flag on: wall + pillar solids registered ('+B.r.info.ns+' total solids)');
ok(B.r.st.inArena&&Math.abs(B.r.st.y-B.r.st.gy)<3,'standing inside the arena is detected, on the ground');ok(B.r.st.disc,'arriving discovers "The Warden Isles"');
console.log('info: swiftshader frame median '+B.r.med.toFixed(1)+' ms, p95 '+B.r.p95.toFixed(1)+' ms (software GL - only useful relatively); triangles '+B.r.info.tris);
ok(B.errs.filter(e=>!/favicon|Failed to load resource/.test(e)).length===0,'flag on: no page errors '+JSON.stringify(B.errs.slice(0,3)));
await browser.close();srv.close();process.exit(bad?1:0);
