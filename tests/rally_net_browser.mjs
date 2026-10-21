// Skybreak Rally head-to-head in the REAL game, two browser pages linked by the harness hub (a broadcast from one page reaches the other, like Supabase
// realtime with self:false): invite -> accept -> a shared start -> both drive (autopilot through the real physics) -> each sees the other's car and gate
// progress through the 10 Hz packets -> both finish -> results list both players -> leaving works. Not part of run_all.sh:
//   NODE_PATH=<dir with three@0.147.0 and playwright-core> node tests/rally_net_browser.mjs [--shots dir]
import {start,real} from './lib/browser.mjs';
import fs from 'fs';
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;if(shots)fs.mkdirSync(shots,{recursive:true});
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok  ',m)};
const B=await start();
const frames=(p,n)=>p.evaluate(n=>new Promise(r=>{let i=0;const f=()=>{if(++i>=n)r();else requestAnimationFrame(f)};requestAnimationFrame(f)}),n);
const host=await B.open('?perf=1',{name:'Tester'}),guest=await B.open('?perf=1',{name:'Star'});
for(const p of [host,guest])await p.setViewportSize({width:320,height:180});   // software WebGL: two full-size pages run at well under 1 fps
await host.waitForTimeout(2500);
// the harness links the two pages with real presence: each page's `others` already holds the other player
// ---- host: pick "vs friend" and start; guest: accept the invite ----
await host.waitForFunction(()=>others.size>0,null,{timeout:60000});
await host.click('.rl-fab');await host.waitForSelector('.rl-sheet');
ok(await host.evaluate(()=>[...document.querySelectorAll('.rl-sheet button')].some(b=>/vs (Partner|Star)/.test(b.textContent)&&!b.disabled)),'"vs friend" is enabled when the friend is in the world');
await host.click('[data-mode=star]');await host.click('[data-diff=none]');await host.click('.rl-go');
await guest.waitForSelector('.rl-inv',{timeout:90000});ok(true,'the guest receives the invite');
await guest.evaluate(()=>document.querySelector('.rl-y').click());   // DOM click: Playwright's actionability waits on rendered frames, which are ~1 fps in software GL
await host.waitForFunction(()=>Rally.state().mode==='countdown',null,{timeout:90000});ok(true,'the host enters the countdown when the guest accepts');
await guest.waitForFunction(()=>Rally.state().mode==='countdown',null,{timeout:90000});ok(true,'the guest enters the countdown from the same start message');
const n0=await host.evaluate(()=>Rally.state().racers.map(r=>r.kind).join(','));ok(n0==='me,net','host grid: me on pole, the friend beside (no AI chosen)');
const n1=await guest.evaluate(()=>Rally.state().racers.map(r=>r.kind).join(','));ok(n1==='net,me','guest grid: the host on pole, me beside');
await host.evaluate(()=>Rally.autopilot(true));await guest.evaluate(()=>Rally.autopilot(true));
await host.waitForFunction(()=>Rally.state().mode==='race',null,{timeout:120000});await guest.waitForFunction(()=>Rally.state().mode==='race',null,{timeout:120000});
ok(true,'both clients reach GO');
// ---- race both in slices; every slice renders a frame on each page so the 10 Hz packets flow ----
let sawPartner=false,pos=false;
for(let i=0;i<120;i++){
  const done=await host.evaluate(()=>Rally.state().me.finished)&&await guest.evaluate(()=>Rally.state().me.finished);if(done)break;
  await host.evaluate(()=>Rally.sim(2));await guest.evaluate(()=>Rally.sim(2));
  await host.evaluate(()=>Rally.snapCam());await frames(host,2);await frames(guest,2);
  const a=await host.evaluate(()=>Rally.state()),b=await guest.evaluate(()=>Rally.state());
  const na=a.racers.find(r=>r.kind==='net'),nb=b.racers.find(r=>r.kind==='net');
  if(na&&nb&&na.seen&&nb.seen)sawPartner=true;
  if(i===20&&shots)await host.screenshot({path:shots+'/net_host.png'});
  if(i===20&&shots)await guest.screenshot({path:shots+'/net_guest.png'});
}
const a=await host.evaluate(()=>Rally.state()),b=await guest.evaluate(()=>Rally.state());
ok(sawPartner,'each client sees the other car (packets received, dead-reckoned)');
ok(a.me.finished&&b.me.finished,'both players finish the three-island race');
console.log('     host',a.me.finishT.toFixed(1),'s   guest',b.me.finishT.toFixed(1),'s');
await host.waitForTimeout(2500);await frames(host,3);await frames(guest,3);
const ra=await host.evaluate(()=>Rally.state().racers.find(r=>r.kind==='net')),rb=await guest.evaluate(()=>Rally.state().racers.find(r=>r.kind==='net'));
ok(ra.passed>=a.gates-1&&rb.passed>=b.gates-1,`each side tracks the other's gate progress (host sees ${ra.passed}/${a.gates}, guest sees ${rb.passed}/${b.gates})`);
ok(ra.finished&&rb.finished,'each side learns that the other has finished (finish time travels in the packets)');
ok(!ra.cheat&&!rb.cheat,'the plausibility referee accepts both honest players');
await host.waitForFunction(()=>document.querySelector('.rl-res'),null,{timeout:90000});
ok(await host.evaluate(()=>[...document.querySelectorAll('.rl-res .rl-r')].length===2),'the host results list both players');
// ---- leaving ----
await guest.evaluate(()=>Rally.exit());
await host.waitForTimeout(800);
ok(await host.evaluate(()=>Rally.state().racers.find(r=>r.kind==='net').seen===0),'when the friend leaves, their car disappears from the race');
await host.evaluate(()=>Rally.exit());
ok(await host.evaluate(()=>Rally.state().mode==='off')&&await guest.evaluate(()=>Rally.state().mode==='off'),'both clients are back in the normal game');
const e=real(host.errs).concat(real(guest.errs));ok(e.length===0,'no page errors on either client'+(e.length?': '+e.slice(0,3).join(' | '):''));
await B.close();
console.log(bad?`\n${bad} FAILED`:'\nall ok');process.exit(bad?1:0);
