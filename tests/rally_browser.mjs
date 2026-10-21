// Skybreak Rally in the REAL game (headless Chromium, software WebGL, landscape phone viewport, touch): the integration is live, the lobby opens, a race
// starts (countdown -> go), the roads / arches / rings are drawn, the player car and AI rivals exist, the avatar is pinned to the car, vegetation keeps off the
// roads, the autopilot drives the whole three-island course through the real physics, both flights transform and land, the results sheet appears, and
// exiting hands the avatar back. Not part of run_all.sh (needs playwright-core + Chromium):
//   NODE_PATH=<dir with three@0.147.0 and playwright-core> node tests/rally_browser.mjs [--shots dir]
import {start,real} from './lib/browser.mjs';
import fs from 'fs';
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;if(shots)fs.mkdirSync(shots,{recursive:true});
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok  ',m)};
const B=await start();
const shot=async(p,n)=>{if(shots)await p.screenshot({path:`${shots}/${n}.png`})};
const frames=(p,n)=>p.evaluate(n=>new Promise(r=>{let i=0;const f=()=>{if(++i>=n)r();else requestAnimationFrame(f)};requestAnimationFrame(f)}),n);
{
  const p=await B.open('?perf=1');await p.waitForTimeout(3000);
  ok(await p.evaluate(()=>typeof Rally!=='undefined'&&typeof CarPhysics!=='undefined'&&typeof Track!=='undefined'&&typeof Pilot!=='undefined'),'Rally, CarPhysics, Track and Pilot are loaded in the real game');
  ok(await p.evaluate(()=>!!document.querySelector('.rl-fab')),'the 🏁 launcher button is on the HUD');
  // vegetation exclusion: the scatter add() asks Rally.clears; roads are inside the corridor, open sea-side ground is not
  ok(await p.evaluate(()=>{const T=Rally.track(),r=T.roads[0],i=r.m>>1;return Rally.clears(r.X[i],r.Z[i])&&Rally.clears(r.X[i]+3,r.Z[i]+3)&&!Rally.clears(0,0)&&!Rally.clears(r.X[i]+60,r.Z[i]+60)}),'vegetation keeps off the roads (corridor around every road, open ground untouched)');
  ok(await p.evaluate(()=>{const T=Rally.track(),r=T.roads[0],i=r.m>>1;return T.surf(r.X[i],r.Z[i]).rough===false}),'the Palm road is drivable at its midpoint');
  // ---- lobby ----
  await p.click('.rl-fab');await p.waitForSelector('.rl-sheet');await shot(p,'1_lobby');
  ok(await p.evaluate(()=>document.querySelectorAll('.rl-car').length===3),'lobby shows the three cars');
  ok(await p.evaluate(()=>[...document.querySelectorAll('.rl-sheet button')].some(b=>/vs\s/.test(b.textContent)&&b.disabled)),'"vs friend" is disabled when nobody else is in the world');
  await p.click('[data-cls=comet]');await p.click('[data-mode=ai]');await p.click('[data-diff=normal]');
  await p.click('.rl-go');await p.waitForFunction(()=>Rally.state().mode==='countdown',null,{timeout:20000});
  ok(true,'START RACE enters the countdown');
  await frames(p,6);await p.waitForTimeout(1500);await shot(p,'2_countdown');
  const st0=await p.evaluate(()=>{const s=Rally.state();return {s,hidden:me.visible===false,cls:document.body.classList.contains('rally'),sx:S.x,sz:S.z,px:s.me.x,pz:s.me.z,n:s.racers.length}});
  ok(st0.n===4,'the grid has the player and three AI rivals');
  ok(st0.hidden&&st0.cls,'the avatar is hidden and the race HUD mode is on');
  ok(Math.hypot(st0.sx-st0.px,st0.sz-st0.pz)<1,'the avatar is pinned to the car (world streaming follows it)');
  ok(await p.evaluate(()=>!!scene.getObjectByName('rally-world')),'the road, arches, rings, pads and hammers are in the scene');
  ok(await p.evaluate(()=>{let m=0;scene.getObjectByName('rally-world').traverse(o=>{if(o.isMesh)m++});return m>60&&m<400}),'the route is a sensible number of meshes (not thousands)');
  // car models stream in
  await p.waitForFunction(()=>{let n=0;scene.traverse(o=>{if(o.isMesh&&o.geometry&&o.geometry.attributes.position.count>3000)n++});return n>=2},null,{timeout:60000}).then(()=>ok(true,'the real car models loaded (not just the placeholder)'),()=>ok(false,'the real car models loaded'));
  // ---- GO ----
  await p.evaluate(()=>Rally.autopilot(true));
  await p.waitForFunction(()=>Rally.state().mode==='race',null,{timeout:20000});ok(true,'the countdown ends in GO');
  // ---- race through the real physics, in slices so we can look at key moments ----
  let sawFly=false,shotGround=false,flyShots=0;
  for(let i=0;i<120&&!(await p.evaluate(()=>Rally.state().me.finished));i++){
    await p.evaluate(()=>Rally.sim(2));await p.evaluate(()=>Rally.snapCam());await frames(p,2);
    const s=await p.evaluate(()=>Rally.state());
    if(!shotGround&&s.me.passed>=6){shotGround=true;await shot(p,'3_ground')}
    if(s.me.mode==='fly'){sawFly=true;if(flyShots<3&&s.me.passed>=10+flyShots*5){flyShots++;await shot(p,'4_fly'+flyShots)}}
  }
  const fin=await p.evaluate(()=>Rally.state());
  ok(fin.me.finished,'the player (autopilot) finishes the three-island race in the real game');
  ok(fin.me.passed===fin.gates,`all ${fin.gates} gates passed (${fin.me.passed})`);
  ok(sawFly,'the car transformed to flight during the race');
  ok(fin.me.rec===0,'no recoveries were needed on the way');
  console.log('     finish time',fin.me.finishT.toFixed(1),'s; rivals:',fin.racers.filter(r=>r.kind==='ai').map(r=>r.name+' '+(r.finished?r.finishT.toFixed(0)+'s':'gate '+r.passed)).join(', '));
  ok(fin.racers.filter(r=>r.kind==='ai').every(r=>r.passed>8),'the AI rivals are racing the same route');
  await p.waitForFunction(()=>document.querySelector('.rl-res'),null,{timeout:15000}).then(()=>ok(true,'the results sheet appears after the finish'),()=>ok(false,'the results sheet appears after the finish'));
  await frames(p,3);await shot(p,'5_results');
  // ---- exit ----
  const before=await p.evaluate(()=>({m:Rally.state().mode}));
  await p.click('.rl-res .rl-x');await p.waitForFunction(()=>Rally.state().mode==='off',null,{timeout:10000});
  ok(await p.evaluate(()=>me.visible===true&&!document.body.classList.contains('rally')),'exit gives the avatar and the normal HUD back');
  ok(await p.evaluate(()=>camera.children.every(k=>k.visible!==false||true)&&Math.abs(camera.fov-65)<6),'exit restores the normal field of view');
  const errs=real(p.errs);ok(errs.length===0,'no page errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
  await p.close2();
}
await B.close();
console.log(bad?`\n${bad} FAILED`:'\nall ok');process.exit(bad?1:0);
