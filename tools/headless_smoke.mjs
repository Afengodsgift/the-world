// Headless smoke test of the REAL game in Chromium (software WebGL): loads index.html, stubs only the network (Supabase + CDN three.js -> local copy),
// clicks Create (optionally twice: `node tools/headless_smoke.mjs '?perf=1' double`), and prints frame/draw-call stats, any page errors, and writes /tmp/pp/shot.png.
// Setup (once):  mkdir -p /tmp/pp && cd /tmp/pp && npm i puppeteer-core@23 @sparticuz/chromium@131 ; npm i three@0.147.0 (set THREE_DIR to its folder)
// Run: serve the repo (python3 -m http.server 8123 in the repo root), then `node tools/headless_smoke.mjs` from a folder where puppeteer-core is installed.
import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';import fs from 'fs';
const T3=process.env.THREE_DIR||'/tmp/t3/node_modules/three';   // three@0.147.0 package dir
const map=u=>{
  if(u.includes('three@0.147.0/build/three.min.js'))return T3+'/build/three.min.js';
  if(u.includes('loaders/GLTFLoader.js'))return T3+'/examples/js/loaders/GLTFLoader.js';
  if(u.includes('utils/SkeletonUtils.js'))return T3+'/examples/js/utils/SkeletonUtils.js';
  if(u.includes('fflate.min.js'))return T3+'/examples/js/libs/fflate.min.js';
  if(u.includes('loaders/FBXLoader.js'))return T3+'/examples/js/loaders/FBXLoader.js';return null};
const STUB=`window.supabase={createClient:()=>{const mk=()=>{const ch={on:()=>ch,subscribe:cb=>{setTimeout(()=>cb&&cb('SUBSCRIBED'),50);return ch},presenceState:()=>({}),track:async()=>({}),send:()=>{},unsubscribe:()=>{}};return ch};
 const q=()=>{const p=new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:(k==='data'?null:k==='error'?null:p),apply:()=>p});return p};
 return {channel:mk,removeChannel:()=>{},from:q,rpc:q,auth:q()}}};`;
const b=await puppeteer.launch({args:[...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required','--no-sandbox'],executablePath:await chromium.executablePath(),headless:'shell',defaultViewport:{width:900,height:400,isMobile:true,hasTouch:true,deviceScaleFactor:1}});
const pg=await b.newPage();await pg.setRequestInterception(true);
pg.on('request',r=>{const u=r.url();
  if(u.includes('supabase-js'))return r.respond({status:200,contentType:'application/javascript',body:STUB});
  const f=map(u);if(f)return r.respond({status:200,contentType:'application/javascript',body:fs.readFileSync(f)});
  if(u.startsWith('http://localhost:'+(process.env.PORT||8123)+'')||u.startsWith('data:'))return r.continue();
  return r.abort()});          // block every other external call (fonts, supabase REST, etc.)
const errs=[];pg.on('pageerror',e=>errs.push('PAGEERROR '+(e.stack||e.message).split('\n').slice(0,4).join(' | ')));
pg.on('console',m=>{if(['error','warning'].includes(m.type())&&!/Failed to load resource|net::ERR|WebGL|GPU stall|swiftshader/i.test(m.text()))errs.push('console.'+m.type()+' '+m.text().slice(0,300))});
await pg.goto('http://localhost:'+(process.env.PORT||8123)+'/index.html'+(process.argv[2]||'?perf=1'),{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2500));
await pg.evaluate(()=>{document.getElementById('create').click()});if(process.argv[3]==='double'){await new Promise(r=>setTimeout(r,300));await pg.evaluate(()=>{document.getElementById('create').click()})}
await new Promise(r=>setTimeout(r,12000));
const audio=async()=>pg.evaluate(async()=>{const z=typeof Ambience!=='undefined'?{...Ambience._zones}:null;return {ctx:WAudio.get()&&WAudio.get().state,zones:z&&Object.fromEntries(Object.entries(z).map(([k,v])=>[k,+v.toFixed(2)]))}});
if(process.argv[3]==='audio'){console.log('AUDIO town :',JSON.stringify(await audio()));
  await pg.evaluate(()=>{S.x=0;S.z=190;S.y=3;S.vy=0});await new Promise(r=>setTimeout(r,4000));console.log('AUDIO beach:',JSON.stringify(await audio()));
  await pg.evaluate(()=>{S.x=18;S.z=-86;S.y=8;S.vy=0});await new Promise(r=>setTimeout(r,14000));console.log('AUDIO cave :',JSON.stringify(await audio()));}
const info=await pg.evaluate(()=>({entered:typeof entered!=='undefined'?entered:'?',frames:typeof Perf!=='undefined'?Perf.state.n:'?',calls:typeof renderer!=='undefined'?renderer.info.render.calls:'?',tris:typeof renderer!=='undefined'?renderer.info.render.triangles:'?',err:(document.getElementById('err')||{}).textContent||null,lasterr:localStorage.getItem('w4lasterr'),boot:!!document.getElementById('boot')}));
console.log(JSON.stringify(info,null,1));console.log('ERRORS:',errs.length?'\n'+errs.slice(0,8).join('\n'):'none');
await pg.screenshot({path:'/tmp/pp/shot.png'});await b.close();
