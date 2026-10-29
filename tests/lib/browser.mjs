// Shared scaffold for the headless-Chromium tests of the REAL game (Outlaw Isle etc.): static server for the repo, CDN three.js served from the local npm copy, Supabase stubbed
// (a stub channel that can optionally echo/deliver broadcasts for two-player tests), software WebGL, landscape phone viewport with touch.
// Needs: NODE_PATH=<dir containing three@0.147.0 + playwright-core>, and a Chromium (CHROME=... or the default /opt/pw-browsers path).
import {createRequire} from 'module';import http from 'http';import fs from 'fs';import path from 'path';
const NP=(process.env.NODE_PATH||'').split(path.delimiter)[0];
const {chromium}=createRequire(NP+'/')('playwright-core');
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..','..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.css':'text/css','.png':'image/png'};
export async function start(){
  const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return}
    r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)}).listen(0,'127.0.0.1');
  await new Promise(r=>srv.on('listening',r));const port=srv.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
  // `hub` links the channels of several pages (two-player tests): a broadcast sent by one page is delivered to every other page, like Supabase realtime (self:false)
  const hub={pages:new Set()};
  const stub=`(()=>{const hs=window.__hub;const ch={_h:{},on(t,f,cb){(ch._h[f.event]=ch._h[f.event]||[]).push(cb||f);return ch},subscribe(cb){setTimeout(()=>cb('SUBSCRIBED'),10);return ch},presenceState:()=>({}),track:async()=>{},unsubscribe(){},
      send(m){if(m&&m.type==='broadcast')window.__out&&window.__out(m.event,JSON.stringify(m.payload))},__recv(ev,pl){(ch._h[ev]||[]).forEach(f=>f({payload:pl}))}};window.__ch=ch;
    const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},then(r){r({data:[],error:null})},upsert:async()=>({error:null}),insert:async()=>({error:null})};
    window.supabase={createClient:()=>({channel:()=>ch,removeChannel(){},from:()=>q,auth:{getSession:async()=>({data:{}})}})}})();`;
  async function open(query,{w=844,h=390,name='Tester',pre}={}){
    const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1,hasTouch:true});const page=await ctx.newPage();const errs=[];
    page.on('pageerror',e=>errs.push(String(e)));page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)/,r=>{const m=r.request().url().match(/three@0\.147\.0\/(.*)$/)[1];const f=path.join(NP,'three',m);fs.existsSync(f)?r.fulfill({body:fs.readFileSync(f),contentType:'text/javascript'}):r.fulfill({status:404})});
    await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase/,r=>r.fulfill({body:stub,contentType:'text/javascript'}));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>{if(/jsdelivr/.test(r.request().url()))return r.fallback();r.abort()});
    await page.exposeFunction('__out',(ev,pl)=>{for(const o of hub.pages)if(o!==page)o.evaluate(([e,p])=>window.__ch.__recv(e,JSON.parse(p)),[ev,pl]).catch(()=>{})});
    hub.pages.add(page);
    if(pre)await pre(page);   // optional: a test can intercept requests before the game starts loading
    await page.goto(`http://127.0.0.1:${port}/index.html${query}`);
    await page.fill('#name',name);await page.click('#create');
    await page.waitForFunction(()=>typeof S!=='undefined'&&typeof me!=='undefined'&&me&&!document.getElementById('boot'),null,{timeout:120000});
    page.errs=errs;page.close2=async()=>{hub.pages.delete(page);await ctx.close()};return page}
  return {open,browser,port,close:async()=>{await browser.close();srv.close()},hub,ROOT};
}
export const real=errs=>errs.filter(e=>!/favicon|Failed to load resource|WebGL|GPU stall|swiftshader/i.test(e));
