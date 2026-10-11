// Headless-Chromium test for Warden M1c (touch controls, key filter, scripted fight, layouts). Not part of run_all.sh. Run: NODE_PATH=<dir with three + playwright-core> node tests/warden_m1c.mjs
import {createRequire} from 'module';import http from 'http';import fs from 'fs';import path from 'path';
const NP=(process.env.NODE_PATH||'/home/claude/tools_nm/node_modules').split(path.delimiter)[0],{chromium}=createRequire(NP+'/')('playwright-core');
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f))}).listen(0);
await new Promise(r=>srv.on('listening',r));const port=srv.address().port;
const STUB=`window.supabase={createClient:()=>{const ch={on(){return ch},subscribe(cb){setTimeout(()=>cb('SUBSCRIBED'),10);return ch},presenceState:()=>({}),track:async()=>{},send(){},unsubscribe(){}};const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},then(r){r({data:[],error:null})},upsert:async()=>({error:null}),insert:async()=>({error:null})};return{channel:()=>ch,removeChannel(){},from:()=>q,auth:{getSession:async()=>({data:{}})}}}}`;
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
async function session(vp,fn,mobile){const ctx=await b.newContext({viewport:vp,hasTouch:true,isMobile:mobile!==false});const page=await ctx.newPage();const errs=[];
page.on('pageerror',e=>errs.push(String(e)));page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)/,r=>{const m=r.request().url().match(/three@0\.147\.0\/(.*)$/)[1];const f=path.join(NP,'three',m);fs.existsSync(f)?r.fulfill({body:fs.readFileSync(f),contentType:'text/javascript'}):r.abort()});
await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase/,r=>r.fulfill({body:STUB,contentType:'text/javascript'}));
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>{if(/jsdelivr/.test(r.request().url()))return r.fallback();r.abort()});
await page.goto(`http://127.0.0.1:${port}/index.html?warden=1`);await page.fill('#name','T');await page.click('#create');
await page.waitForFunction(()=>typeof S!=='undefined'&&me&&!document.getElementById('boot'),null,{timeout:120000});
await page.evaluate(()=>{S.x=150;S.z=-2450+10;S.y=H(S.x,S.z)+1;S.flying=false;S.yaw=0;S.rot=Math.PI});
await page.waitForFunction(()=>PlayerCombat.on(),null,{timeout:60000});await page.waitForTimeout(500);
const r=await fn(page);await ctx.close();return{r,errs}}

const clean=e=>e.filter(x=>!/favicon|Failed to load resource/.test(x));
// ---- A) input state machine + key filter + scripted fight (844x390 phone) ----
const A=await session({width:844,height:390},async p=>{
  const o={};const until=async(f,ms)=>{try{await p.waitForFunction(f,null,{timeout:ms||4000,polling:50});return true}catch(e){return false}};const near=()=>p.evaluate(()=>{const t=PlayerCombat._t();S.x=t.D.x;S.z=t.D.z+1.9;S.rot=Math.PI});const st=()=>p.evaluate(()=>{const t=PlayerCombat._t();return{act:t.P.act,guard:t.P.guard,hp:t.D.hp,po:t.D.po,dact:t.D.act,down:{...t.down},lock:t.lock}});
  const ptr=(sel,type,id)=>p.evaluate(([sel,type,id])=>{const b=document.querySelector(sel);b.dispatchEvent(new PointerEvent(type,{pointerId:id,bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true}))},[sel,type,id]);
  // guard: down holds, up releases; cancel releases; blur releases
  await ptr('#wGuard','pointerdown',11);o.g1=await until(()=>PlayerCombat._t().P.guard===true);await ptr('#wGuard','pointerup',11);o.g2=await until(()=>PlayerCombat._t().P.guard===false);o.g2=o.g2?false:true;
  await ptr('#wGuard','pointerdown',12);await until(()=>PlayerCombat._t().P.guard===true);await ptr('#wGuard','pointercancel',12);o.g3=!(await until(()=>PlayerCombat._t().P.guard===false));
  await ptr('#wGuard','pointerdown',13);await until(()=>PlayerCombat._t().P.guard===true);await p.evaluate(()=>dispatchEvent(new Event('blur')));o.g4=!(await until(()=>PlayerCombat._t().P.guard===false));o.g4d=(await st()).down.guard;
  // a second finger on the same button while the first is down is ignored, and a stray up from another pointer does not release
  await ptr('#wGuard','pointerdown',14);await until(()=>PlayerCombat._t().P.guard===true);await ptr('#wGuard','pointerdown',15);await ptr('#wGuard','pointerup',15);await p.waitForTimeout(400);o.g5=(await st()).guard;await ptr('#wGuard','pointerup',14);await until(()=>PlayerCombat._t().P.guard===false);
  // key filter in the arena: F must not smack, Space must not jump, Tab is prevented
  await p.evaluate(()=>{window.__sm=0;window.smack=()=>{window.__sm++};window.__tab=null});
  await p.keyboard.press('KeyF');await p.waitForTimeout(100);o.smackIn=await p.evaluate(()=>window.__sm);
  o.tabPrevented=await p.evaluate(()=>{const e=new KeyboardEvent('keydown',{code:'Tab',key:'Tab',bubbles:true,cancelable:true});dispatchEvent(e);return e.defaultPrevented});
  o.lockOn=(await st()).lock;await p.keyboard.press('Tab');
  // scripted fight: walk to the dummy, light x3, check damage + posture, then heavy
  await p.evaluate(()=>{S.x=150;S.z=-2454+2.0;S.rot=Math.PI;const t=PlayerCombat._t();});
  await p.waitForTimeout(300);const hp0=(await st()).hp;
  for(let i=0;i<4;i++){await ptr('#wLight','pointerdown',20+i);await ptr('#wLight','pointerup',20+i);await until(()=>PlayerCombat._t().P.act==='attack',1500);await until(()=>PlayerCombat._t().P.act==='free',3000)}
  const s1=await st();o.lightDmg=hp0-s1.hp;o.po=s1.po;
  await until(()=>PlayerCombat._t().P.act==='free');await near();await p.waitForTimeout(150);o.dbg=await p.evaluate(()=>{const t=PlayerCombat._t();return[t.P.x,t.P.z,t.D.x,t.D.z,t.D.act,t.D.hp]});const hpH=(await st()).hp;await p.evaluate(()=>{PlayerCombat._log=[]});await ptr('#wHeavy','pointerdown',30);await until(()=>PlayerCombat._t().P.act==='charge');o.charging=(await st()).act;await p.waitForTimeout(500);await ptr('#wHeavy','pointerup',30);await until(()=>PlayerCombat._t().P.act==='attack',3000);await until(()=>PlayerCombat._t().P.act==='free',4000);const s2=await st();o.log=await p.evaluate(()=>PlayerCombat._log.map(e=>e.t+':'+(e.dmg||'')+(e.move||'')+(e.crit?'C':'')));o.heavyDmg=hpH-s2.hp;
  // dodge button rolls (consumes stamina)
  await p.waitForTimeout(800);await ptr('#wDodge','pointerdown',40);await ptr('#wDodge','pointerup',40);await until(()=>PlayerCombat._t().P.act==='dodge',2000);o.dodgeAct=(await st()).act;await until(()=>PlayerCombat._t().P.act==='free',3000);
  // kill the dummy and see it respawn
  await p.evaluate(()=>{PlayerCombat._t().D.hp=1});await p.waitForTimeout(500);
  for(let i=0;i<4&&(await st()).dact!=='dead';i++){await near();await p.waitForTimeout(100);await ptr('#wLight','pointerdown',50+i);await ptr('#wLight','pointerup',50+i);await until(()=>PlayerCombat._t().P.act==='free'&&PlayerCombat._t().D.act==='dead'||PlayerCombat._t().P.act==='free',3000);await p.waitForTimeout(300)}
  o.dead=(await st()).dact;await p.waitForTimeout(4200);o.respawn=await st();
  // leaving the arena releases everything and restores the normal controls
  await p.evaluate(()=>{S.x=150;S.z=-2450+60});await p.waitForTimeout(600);
  o.left=await p.evaluate(()=>({on:PlayerCombat.on(),cls:document.body.classList.contains('warden-fight'),wc:getComputedStyle(document.getElementById('wc')).display}));
  await p.keyboard.press('KeyF');await p.waitForTimeout(100);o.smackOut=await p.evaluate(()=>window.__sm);
  return o});
const a=A.r;
ok(a.g1===true&&a.g2===false,'guard button: hold raises guard, release drops it');ok(a.g3===false,'guard button: pointercancel releases');ok(a.g4===false&&a.g4d===false,'guard button: window blur releases');
ok(a.g5===true,'guard button: a second pointer cannot steal or release the hold');
ok(a.smackIn===0,'in the arena F is swallowed (no smack)');ok(a.tabPrevented===true,'in the arena Tab is captured (no focus jump)');
ok(a.lightDmg>=28,'4 light taps hit the dummy ('+a.lightDmg.toFixed(0)+' dmg)');ok(a.po>0,'posture builds on the dummy ('+a.po.toFixed(0)+')');
ok(a.charging==='charge','holding Heavy charges');ok(a.heavyDmg>=30,'released Heavy hits hard ('+a.heavyDmg.toFixed(0)+' dmg)');
ok(a.dodgeAct==='dodge','Dodge button dodges');console.log(a.dbg,a.log);ok(a.dead==='dead','dummy can be killed');ok(a.respawn.dact==='free'&&a.respawn.hp>=299,'dummy respawns at full health');
ok(a.left.on===false&&a.left.cls===false&&a.left.wc==='none','leaving the arena turns combat off and restores the normal controls');ok(a.smackOut===1,'outside the arena F smacks again (normal controls)');
ok(clean(A.errs).length===0,'no page errors '+JSON.stringify(clean(A.errs).slice(0,3)));
// ---- B) layout: every touch button + HUD bar on 6 phone sizes, with 0 and 44px safe-area insets ----
const SIZES=[[667,375],[740,360],[812,375],[844,390],[932,430],[640,360]];
for(const ins of [0,44]){for(const [w,h] of SIZES){
  const B=await session({width:w,height:h},async p=>{
    await p.addStyleTag({content:`:root{--sl:${ins}px!important;--sr:${ins}px!important}`});await p.waitForTimeout(300);
    return p.evaluate(()=>{const R=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return{s,l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}};
      const btn=['#wLight','#wHeavy','#wGuard','#wDodge','#wLock'].map(R),bars=['#wh .wb.p','#wh .wb.d'].map(R),top=['#hud #share','#info'].map(R).filter(Boolean),stick=R('#stick');return{btn,bars,top,stick,vw:innerWidth,vh:innerHeight}})},true);
  const{btn,bars,stick,vw,vh}=B.r;const ov=(a,b)=>a&&b&&a.l<b.r-1&&b.l<a.r-1&&a.t<b.b-1&&b.t<a.b-1,tag=`${w}x${h} inset ${ins}`;
  let bads=[];for(let i=0;i<btn.length;i++){const a=btn[i];if(a.w<44||a.h<44)bads.push(a.s+' too small');if(a.l<0||a.t<0||a.r>vw||a.b>vh)bads.push(a.s+' off-screen');for(let j=i+1;j<btn.length;j++)if(ov(a,btn[j]))bads.push(a.s+' overlaps '+btn[j].s);if(ov(a,stick))bads.push(a.s+' overlaps stick')}
  for(const t of B.r.top)for(const bb of bars)if(ov(t,bb))bads.push(bb.s+' overlaps '+t.s);for(const bb of bars)for(const a of btn)if(ov(bb,a))bads.push(bb.s+' overlaps '+a.s);
  if(ov(bars[0],bars[1]))bads.push('player bar overlaps dummy bar');
  ok(bads.length===0,'layout '+tag+(bads.length?': '+bads.join('; '):''))}}
await b.close();srv.close();process.exit(bad?1:0);
