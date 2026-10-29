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
async function handshake(first){
  await host.evaluate(()=>document.querySelector('.rl-fab').click());await host.waitForSelector('.rl-sheet',{timeout:90000});
  if(first)ok(await host.evaluate(()=>[...document.querySelectorAll('.rl-sheet button')].some(b=>/vs (Partner|Star)/.test(b.textContent)&&!b.disabled)),'"vs friend" is enabled when the friend is in the world');
  for(const sel of ['[data-mode=star]','[data-diff=none]','.rl-go']){await host.waitForSelector(sel,{timeout:90000});await host.evaluate(s=>document.querySelector(s).click(),sel)}   // DOM clicks: no dependence on rendered frames
  await guest.waitForSelector('.rl-inv',{timeout:90000});if(first)ok(true,'the guest receives the invite');
  await guest.evaluate(()=>document.querySelector('.rl-y').click());   // DOM click: Playwright's actionability waits on rendered frames, which are ~1 fps in software GL
  await host.waitForFunction(()=>Rally.state().mode==='countdown',null,{timeout:90000});await guest.waitForFunction(()=>Rally.state().mode==='countdown',null,{timeout:90000});
  if(first){ok(true,'both clients enter the countdown from the same start message');
    ok(await host.evaluate(()=>Rally.state().racers.map(r=>r.kind).join(','))==='me,net'&&await guest.evaluate(()=>Rally.state().racers.map(r=>r.kind).join(','))==='net,me','grids: host on pole and guest beside, from each side')}
  await host.waitForFunction(()=>Rally.state().mode==='race',null,{timeout:120000});await guest.waitForFunction(()=>Rally.state().mode==='race',null,{timeout:120000});
  if(first)ok(true,'both clients reach GO');
}
// ============ session 1: combat between two real players ============
await handshake(true);
const both=async()=>{await frames(host,2);await frames(guest,2);await host.waitForTimeout(400)};
await host.evaluate(()=>Rally.sim(.4));await guest.evaluate(()=>Rally.sim(.4));await both();
// pickups are synchronised: when one phone takes a box the other's copy disappears
const box=await host.evaluate(()=>{const b=Rally.track().itemBoxes.find(x=>!x.air);return {x:b.x,z:b.z}});
const g0=await guest.evaluate(()=>Rally.items().boxesOn);
await host.evaluate(([b])=>Rally.placeMe(b.x,b.z,0,0),[box]);await host.evaluate(()=>Rally.sim(.15));await host.waitForTimeout(600);
ok(await host.evaluate(()=>!!Rally.items().me),'the host drives into a box and gets an item');
ok(await guest.evaluate(([n])=>Rally.items().boxesOn<n,[g0]),'the guest sees that box taken (pickup synchronised)');
// a shield on the guest absorbs a real shot from the host
await guest.evaluate(()=>{Rally.give('shield');Rally.use();Rally.sim(.1)});
await both();
await host.evaluate(()=>{Rally.sim(.7);Rally.lineUpBehind(null,22);Rally.give('blaster');Rally.use();Rally.sim(.1)});await host.waitForTimeout(500);
ok(await guest.evaluate(()=>Rally.items().proj>=1),'the shot reaches the guest\'s phone as one announcement and is simulated there');
await guest.evaluate(()=>Rally.sim(.6));await guest.waitForTimeout(500);
const sh=await guest.evaluate(()=>Rally.items());
ok(sh.meShield===0&&!(sh.meHitT>0),'SHIELD: the guest\'s shield pops and the hit does nothing');
ok(await host.evaluate(()=>Rally.items().proj===0),'and the host\'s copy of the shot is removed when the victim reports it spent');
// after the shield's protection window, a real hit changes the other player's race
await guest.evaluate(()=>Rally.sim(1.2));await both();
await host.evaluate(()=>{Rally.sim(.7);Rally.lineUpBehind(null,22);Rally.give('blaster');Rally.use();Rally.sim(.1)});await host.waitForTimeout(500);
await guest.evaluate(()=>Rally.sim(.6));await guest.waitForTimeout(600);
const hit=await guest.evaluate(()=>{const s=Rally.state();return {hitT:s.me.hitT,taken:s.hits.taken,prot:Rally.items().meProt}});
ok(hit.taken>=1&&(hit.hitT>0||hit.prot>0),`BLASTER: a real hit on the other PLAYER's car (disrupted ${hit.hitT.toFixed(2)} s, protected ${hit.prot.toFixed(1)} s)`);
ok(await host.evaluate(()=>Rally.state().hits.dealt)>=1,'the shooter\'s phone is told it was a direct hit');
ok(await host.evaluate(()=>Rally.items().proj===0),'the projectile is gone on both phones');
// a burst fired by the guest at close range disrupts the host (first let the host's new position reach the guest, so the guest lines up on where the host really is)
await both();
await guest.evaluate(()=>{Rally.sim(.7);Rally.lineUpBehind(null,5);Rally.give('burst');Rally.use();Rally.sim(.1)});await guest.waitForTimeout(500);
await host.evaluate(()=>Rally.sim(.1));
const bu=await host.evaluate(()=>({hitT:Rally.state().me.hitT,prot:Rally.items().meProt}));
ok(bu.hitT>0||bu.prot>0,'BURST: fired by one player, felt by the other');
// leaving cleans up on both sides
await guest.evaluate(()=>Rally.exit());await host.waitForTimeout(600);await host.evaluate(()=>Rally.exit());
ok(await host.evaluate(()=>Rally.state().mode==='off'&&!Rally.items())&&await guest.evaluate(()=>Rally.state().mode==='off'&&!Rally.items()),'session 1 ends cleanly on both phones: no item state left');
await host.waitForTimeout(800);
// ============ session 2: the full race (also proves a restart over the network works) ============
await handshake(false);
ok(await host.evaluate(()=>{const i=Rally.items();return i.boxesOn===i.boxes&&i.proj===0&&i.mines===0&&!i.me}),'the second race starts clean: boxes back, no projectiles, no leftovers');
await host.evaluate(()=>Rally.autopilot(true));await guest.evaluate(()=>Rally.autopilot(true));
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
