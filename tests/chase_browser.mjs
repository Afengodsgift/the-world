// Cops & Robbers in the REAL game (headless Chromium): the launcher + lobby, a round starts (countdown -> go), the avatar is pinned to the car, the markers and cars
// exist, an autopilot-vs-AI round runs through the real physics to a result, the result sheet appears, and leaving hands the avatar back. Not in run_all.sh:
//   NODE_PATH=<dir with three@0.147.0 and playwright-core> node tests/chase_browser.mjs [--shots dir]
import {start,real} from './lib/browser.mjs';
import fs from 'fs';
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;if(shots)fs.mkdirSync(shots,{recursive:true});
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok  ',m)};
const B=await start();const shot=async(p,n)=>{if(shots)await p.screenshot({path:`${shots}/${n}.png`})};
const frames=(p,n)=>p.evaluate(n=>new Promise(r=>{let i=0;const f=()=>{if(++i>=n)r();else requestAnimationFrame(f)};requestAnimationFrame(f)}),n);
{
  const p=await B.open('?perf=1');await p.waitForTimeout(3000);
  ok(await p.evaluate(()=>typeof Chase!=='undefined'&&typeof ChaseCore!=='undefined'),'Chase + ChaseCore are loaded');
  await frames(p,10);
  ok(await p.evaluate(()=>!!document.querySelector('.ch-fab')),'the 🚔 launcher is on the HUD');
  ok(await p.evaluate(()=>Chase.spots().length>=10),'heist spots were found on the islands ('+await p.evaluate(()=>Chase.spots().length)+')');
  await p.click('.ch-fab');await p.waitForSelector('.rl-sheet');await shot(p,'1_lobby');
  ok(await p.evaluate(()=>document.querySelectorAll('.rl-car').length===3),'lobby shows the three cars');
  await p.click('[data-role=rob]');await p.waitForSelector('.rl-sheet');await p.click('[data-diff=normal]');await p.waitForSelector('.rl-sheet');
  const sx=await p.evaluate(()=>({x:S.x,z:S.z}));
  await p.click('.rl-go');await p.waitForFunction(()=>Chase.state().mode==='play',null,{timeout:20000});ok(true,'START enters a round');
  await frames(p,8);await shot(p,'2_countdown');
  const a=await p.evaluate(()=>{const s=Chase.state();return {s,hidden:me.visible===false,cls:document.body.classList.contains('chase'),px:S.x,pz:S.z}});
  ok(a.s.r.phase==='count'&&a.hidden&&a.cls,'countdown, avatar hidden, chase HUD mode on');
  ok(Math.hypot(a.px-a.s.me.x,a.pz-a.s.me.z)<1,'the avatar is pinned to the car');
  await p.evaluate(()=>Chase.sim(4));await frames(p,6);
  const b=await p.evaluate(()=>Chase.state());ok(b.r.phase==='grab'&&b.me.s>5,'GO: the round is live and the car moves ('+Math.round(b.me.s)+' m/s)');
  await shot(p,'3_run');
  await p.evaluate(()=>Chase.autopilot(true));
  for(let i=0;i<40;i++){await p.evaluate(()=>Chase.sim(4));const m=await p.evaluate(()=>Chase.state().mode);if(m!=='play')break}
  const c=await p.evaluate(()=>Chase.state());ok(c.mode==='over'&&c.r.result,'the round ended: '+c.r.result+' after '+c.r.t.toFixed(1)+' s');
  await frames(p,6);await shot(p,'4_over');
  await p.waitForSelector('.rl-sheet',{timeout:8000});await p.waitForTimeout(300);ok(await p.evaluate(()=>/NEXT ROUND/.test(document.querySelector('.rl-sheet').textContent)),'the result sheet is shown');
  await shot(p,'5_result');
  // swap roles -> a fresh round as the cop
  await p.click('.rl-go');await p.waitForFunction(()=>Chase.state().mode==='play'&&Chase.state().r.phase==='count',null,{timeout:10000});
  ok(await p.evaluate(()=>document.querySelector('#chRole').textContent.includes('COP')),'next round: roles swapped, you are the cop');
  await p.evaluate(()=>Chase.sim(6));await frames(p,6);await shot(p,'6_cop');
  ok(await p.evaluate(()=>Chase.state().err===0),'no controller errors');
  // leave
  p.once('dialog',d=>d.accept());await p.evaluate(()=>Chase.exit());await frames(p,5);
  const d=await p.evaluate(()=>({m:Chase.state().mode,vis:me.visible,x:S.x,z:S.z,cls:document.body.classList.contains('chase')}));
  ok(d.m==='off'&&d.vis&&!d.cls&&Math.hypot(d.x-sx.x,d.z-sx.z)<5,'leaving restores the avatar, position and HUD');
  const errs=real(p.errs);ok(errs.length===0,'no page errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
}
await B.close();console.log(bad?bad+' FAILED':'all chase browser checks passed');process.exit(bad?1:0);
