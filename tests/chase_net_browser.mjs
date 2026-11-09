// Cops & Robbers head-to-head in the REAL game: two pages linked by the harness hub. Invite -> accept -> shared start (host robber, guest cop) -> both phones
// drive (autopilot) -> the guest sees the host's car, the host runs the rules and the guest receives snapshots + events -> both get the same result -> the host
// starts the next round with the roles swapped -> leaving. Not in run_all.sh:
//   NODE_PATH=<dir with three@0.147.0 and playwright-core> CHROME=... node tests/chase_net_browser.mjs
import {start,real} from './lib/browser.mjs';
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok  ',m)};
const B=await start();
const frames=(p,n)=>p.evaluate(n=>new Promise(r=>{let i=0;const f=()=>{if(++i>=n)r();else requestAnimationFrame(f)};requestAnimationFrame(f)}),n);
const host=await B.open('?perf=1',{name:'Tester'}),guest=await B.open('?perf=1',{name:'Star'});
for(const p of [host,guest])await p.setViewportSize({width:320,height:180});
await host.waitForTimeout(3000);
const click=async(p,sel)=>{await p.waitForSelector(sel,{timeout:90000});await p.evaluate(s=>document.querySelector(s).click(),sel)};
await host.evaluate(()=>document.querySelector('.ch-fab').click());await host.waitForSelector('.rl-sheet',{timeout:90000});
ok(await host.evaluate(()=>[...document.querySelectorAll('.rl-sheet button')].some(b=>/vs (Partner|Star)/.test(b.textContent)&&!b.disabled)),'"vs friend" is enabled when the friend is in the world');
await click(host,'[data-role=rob]');await click(host,'[data-mode=star]');await click(host,'.rl-go');
await guest.waitForSelector('.rl-inv',{timeout:90000});ok(await guest.evaluate(()=>/COP/.test(document.querySelector('.rl-inv').textContent)),'the guest is invited as the COP');
await guest.evaluate(()=>document.querySelector('.rl-y').click());
await host.waitForFunction(()=>Chase.state().mode==='play',null,{timeout:90000});await guest.waitForFunction(()=>Chase.state().mode==='play',null,{timeout:90000});
ok(true,'both clients start the round');
const L=async p=>p.evaluate(()=>Chase.state().r.L);
ok(JSON.stringify(await L(host))===JSON.stringify(await L(guest)),'both phones built the same heist from the seed');
ok(await host.evaluate(()=>document.querySelector('#chRole').textContent.includes('ROBBER'))&&await guest.evaluate(()=>document.querySelector('#chRole').textContent.includes('COP')),'roles: host robber, guest cop');
// run both: the guest's count must finish on its own; the host is authoritative afterwards
await host.evaluate(()=>{Chase.sim(3.6);Chase.autopilot(true)});await guest.evaluate(()=>{Chase.sim(3.6);Chase.autopilot(true)});
await frames(host,3);await frames(guest,3);await host.waitForTimeout(500);
ok(await guest.evaluate(()=>{const s=Chase.state();return s.r.phase!=='count'}),'the guest left the countdown');
let seen=false,over=false;
for(let i=0;i<60&&!over;i++){
  await host.evaluate(()=>Chase.sim(1.5));await guest.evaluate(()=>Chase.sim(1.5));await frames(host,2);await frames(guest,2);await host.waitForTimeout(250);
  const h=await host.evaluate(()=>Chase.state()),g=await guest.evaluate(()=>Chase.state());
  if(!seen&&Math.hypot(g.ai.x-h.me.x,g.ai.z-h.me.z)<60&&h.me.s>5){seen=true}
  over=h.mode==='over'&&g.mode==='over';
}
ok(seen,'the guest sees the host car at the host position (10 Hz packets)');
const h=await host.evaluate(()=>Chase.state()),g=await guest.evaluate(()=>Chase.state());
ok(h.mode==='over'&&g.mode==='over','both phones finish the round');
ok(h.r.result&&h.r.result===g.r.result,'same result on both phones: '+h.r.result+' / '+g.r.result);
ok(h.match.me+h.match.ai>0&&h.match.me===g.match.ai&&h.match.ai===g.match.me,'match scores mirror ('+h.match.me+'-'+h.match.ai+' vs '+g.match.me+'-'+g.match.ai+')');
await host.waitForSelector('.rl-sheet',{timeout:20000});await guest.waitForSelector('.rl-sheet',{timeout:20000});
ok(await guest.evaluate(()=>/Waiting for the host/.test(document.querySelector('.rl-sheet').textContent)),'the guest waits for the host to start the next round');
await click(host,'.rl-go');
await host.waitForFunction(()=>Chase.state().mode==='play'&&Chase.state().r.phase==='count',null,{timeout:60000});await guest.waitForFunction(()=>Chase.state().mode==='play'&&Chase.state().r.phase==='count',null,{timeout:60000});
ok(await host.evaluate(()=>document.querySelector('#chRole').textContent.includes('COP'))&&await guest.evaluate(()=>document.querySelector('#chRole').textContent.includes('ROBBER')),'next round: roles swapped on both phones');
ok(await guest.evaluate(()=>Chase.state().match.n)>=1,'the guest kept the match score');
await host.evaluate(()=>Chase.exit());await frames(host,3);await guest.waitForFunction(()=>Chase.state().mode==='off',null,{timeout:20000}).catch(()=>{});await guest.waitForTimeout(2500);
ok(await guest.evaluate(()=>Chase.state().mode==='off'),'when the host leaves, the guest is returned to the world');
ok(await host.evaluate(()=>Chase.state().err===0)&&await guest.evaluate(()=>Chase.state().err===0),'no controller errors');
for(const [n,p] of [['host',host],['guest',guest]]){const e=real(p.errs);ok(e.length===0,n+': no page errors'+(e.length?' '+e.slice(0,3).join(' | '):''))}
await B.close();console.log(bad?bad+' FAILED':'all chase net checks passed');process.exit(bad?1:0);
