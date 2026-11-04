// Headless-Chromium smoke test for Iron Fist Isle: boots the REAL game, starts a fight, checks no page errors, that the fight camera follows the player
// (the yaw smoothing regressed once: it never moved) and stays a sane distance away, and samples frame cost. Not in run_all.sh (needs playwright-core + Chromium).
// Run:  NODE_PATH=<dir with three + playwright-core> CHROME=<chrome> node tests/dojo_browser.mjs [--shots dir]
import fs from 'fs';import path from 'path';
import {start,real} from './lib/browser.mjs';
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;if(shots)fs.mkdirSync(shots,{recursive:true});
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const T=await start();const page=await T.open('');
const r=await page.evaluate(async()=>{
  const out={};out.has=typeof Dojo!=='undefined'&&typeof DOJO!=='undefined'&&DOJO.on;if(!out.has)return out;
  S.x=DOJO.x;S.z=DOJO.z+12;Dojo.start();
  const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(2500);
  const t=Dojo._t();out.fighting=Dojo.fighting();out.foes=t.foes.length;
  const p0=camera.position.clone(),y0=t.cs.yaw;
  // walk the player around the foe so the camera must follow
  const P=t.P;out.cam0={d:Math.hypot(camera.position.x-S.x,camera.position.z-S.z),y:camera.position.y-S.y};
  S.rot=1.2;S.yaw=S.rot;S.x+=2;await wait(1500);
  out.yawMoved=Math.abs(t.cs.yaw-y0);out.cam1={d:Math.hypot(camera.position.x-S.x,camera.position.z-S.z),y:camera.position.y-S.y};
  out.finite=[camera.position.x,camera.position.y,camera.position.z].every(Number.isFinite);
  return out});
console.log(JSON.stringify(r));
ok(r.has,'Dojo exists and island is on');if(r.has){ok(r.fighting&&r.foes>0,'a fight started with foes ('+r.foes+')');ok(r.finite,'camera position is finite');
  ok(r.cam0.d>2.5&&r.cam0.d<10,'camera distance behind the player is close but sane ('+r.cam0.d.toFixed(1)+' m)');ok(r.cam1.d<10,'camera stays within 10 m after moving ('+r.cam1.d.toFixed(1)+' m)')}
if(shots&&r.has)await page.screenshot({path:path.join(shots,'dojo_fight.png')});
const errs=real(page.errs);ok(errs.length===0,'no page errors '+JSON.stringify(errs.slice(0,3)));
await page.close2();await T.close();console.log(bad?bad+' FAILED':'ALL OK');process.exit(bad?1:0);
