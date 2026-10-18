import {createRequire} from 'module';import http from 'http';import fs from 'fs';import path from 'path';
const o='/tmp';
const NP='/home/claude/tools_nm/node_modules',{chromium}=createRequire(NP+'/')('playwright-core');
const ROOT='/home/claude/the-world';const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f))}).listen(0);
await new Promise(r=>srv.on('listening',r));const port=srv.address().port;
const STUB=`window.__h={};window.__pres={};window.__ph=null;
window.__recv=(e,p)=>{(window.__h[e]||[]).forEach(cb=>cb({payload:p}))};window.__setPres=o=>{window.__pres=o;if(window.__ph)window.__ph()};
window.supabase={createClient:()=>{const mk=(name,opt)=>{const key=opt&&opt.config&&opt.config.presence&&opt.config.presence.key;const ch={on(t,f,cb){if(t==='broadcast')(window.__h[f.event]=window.__h[f.event]||[]).push(cb);else if(t==='presence')window.__ph=cb;return ch},subscribe(cb){setTimeout(()=>cb('SUBSCRIBED'),10);return ch},presenceState:()=>window.__pres,track:async m=>{window.__relay('p',JSON.stringify({key,meta:m}))},send(m){window.__relay('b',JSON.stringify({event:m.event,payload:m.payload}))},unsubscribe(){}};return ch};
const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},then(r){r({data:[],error:null})},upsert:async()=>({error:null}),insert:async()=>({error:null})};return{channel:mk,removeChannel(){},from:()=>q,auth:{getSession:async()=>({data:{}})}}}}`;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const pres={};const pages=[];const errs=[[],[]];let relayed=0;
async function mkPage(i){
  const ctx=await b.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true});const page=await ctx.newPage();
  page.on('pageerror',e=>errs[i].push(String(e)));page.on('console',m=>{if(m.type()==='error')errs[i].push(m.text())});
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)/,r=>{const m=r.request().url().match(/three@0\.147\.0\/(.*)$/)[1];const f=path.join(NP,'three',m);fs.existsSync(f)?r.fulfill({body:fs.readFileSync(f),contentType:'text/javascript'}):r.abort()});
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase/,r=>r.fulfill({body:STUB,contentType:'text/javascript'}));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>{if(/jsdelivr/.test(r.request().url()))return r.fallback();r.abort()});
  await page.exposeFunction('__relay',(kind,json)=>{const j=JSON.parse(json);
    if(kind==='b'){relayed++;const other=pages[1-i];if(other)other.evaluate(([e,p])=>window.__recv(e,p),[j.event,j.payload]).catch(()=>{})}
    else{pres[j.key]=[j.meta];for(const pg of pages)pg.evaluate(o=>window.__setPres(o),pres).catch(()=>{})}});
  pages[i]=page;return page}
const A=await mkPage(0),B=await mkPage(1);
for(const [pg,n] of [[A,'A'],[B,'B']]){await pg.goto(`http://127.0.0.1:${port}/index.html?warden=1`);await pg.fill('#name',n);await pg.click('#create')}
for(const pg of [A,B])await pg.waitForFunction(()=>typeof S!=='undefined'&&me&&!document.getElementById('boot'),null,{timeout:150000});
const SITE=process.argv[2]||'court';
const tp=(pg,dx)=>pg.evaluate(([id,dx])=>{scene.add(new THREE.AmbientLight(0xffffff,1.2));const s=WARDEN.sites.find(q=>q.id===id);S.x=WRD.x+s.x+dx;S.z=WRD.z+s.z+s.R-3;S.y=H(S.x,S.z)+1;S.flying=false;S.yaw=0;S.rot=Math.PI},[SITE,dx]);
const st=pg=>pg.evaluate(()=>{const t=PlayerCombat._t();if(!t.on)return{on:false};return{mode:WardenNet.S.mode,Q:t.C.F.Q?[t.C.F.Q.act,+(t.C.F.Q.x-S.x).toFixed(1),+(t.C.F.Q.z-S.z).toFixed(1)]:null,foes:t.foes.map(F=>[F.id,+F.f.x.toFixed(1),+F.f.z.toFixed(1),F.f.hp|0,F.f.act,F.awake?1:0]),P:[t.P.act,t.P.hp|0],state:t.state,partner:WardenNet.S.partner&&WardenNet.S.partner.slice(0,4)}});
export {A,B,tp,st,errs,b,srv,o,pages};
if(process.argv[1].endsWith('coop.mjs')){
  await tp(A,0);await A.waitForFunction(()=>PlayerCombat.on(),null,{timeout:60000});console.log('A engaged',JSON.stringify(await st(A)));
  await A.waitForTimeout(2500);await tp(B,2);await B.waitForFunction(()=>PlayerCombat.on(),null,{timeout:60000});console.log('B engaged',JSON.stringify(await st(B)));
  for(let k=0;k<4;k++){await A.waitForTimeout(3000);console.log('A',JSON.stringify(await st(A)));console.log('B',JSON.stringify(await st(B)))}
  console.log('relayed',relayed,JSON.stringify(errs));
  await A.screenshot({path:o+'/co_A.png'});await B.screenshot({path:o+'/co_B.png'});
  await b.close();srv.close()}
