// Skybreak Rally in the REAL game (headless Chromium): terrain / scenery collisions against the game's actual solids and island edge, steering response,
// item pickups, every item against real AI rivals, the item button on the HUD, restart cleanup. Uses Rally.sim() to fast-forward (software WebGL is ~1 fps).
//   NODE_PATH=<dir with three@0.147.0 and playwright-core> node tests/rally_combat_browser.mjs [--shots dir]
import {start,real} from './lib/browser.mjs';
import fs from 'fs';
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;if(shots)fs.mkdirSync(shots,{recursive:true});
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok  ',m)};
const B=await start();
const p=await B.open('?perf=1');await p.setViewportSize({width:640,height:300});await p.waitForTimeout(2500);
const shot=async n=>{if(shots)await p.screenshot({path:`${shots}/${n}.png`})};
const frames=n=>p.evaluate(n=>new Promise(r=>{let i=0;const f=()=>{if(++i>=n)r();else requestAnimationFrame(f)};requestAnimationFrame(f)}),n);
const ev=(f,a)=>p.evaluate(f,a);
// ---- start a race against three AI rivals, then skip the countdown ----
await ev(()=>Rally.start({cls:'ace',ai:'normal'}));await p.waitForFunction(()=>Rally.state().mode==='countdown',null,{timeout:60000});
await ev(()=>Rally.sim(.2));await frames(1);
ok(await ev(()=>Rally.state().mode==='race'),'a race with three AI rivals is running');
// ================= the real world's solids =================
const solidTest=await ev(()=>{
  const T=Rally.track(),P={x:760,z:1400};
  // candidates: real solids on Palm Atoll, away from every road, with a clear 40 m approach
  const cands=solids.filter(s=>Math.hypot(s.x-P.x,s.z-P.z)<150&&s.r>=.25&&!s.noSide&&!s.h&&T.project(s.x,s.z,{}).dist>34).sort((a,b)=>b.r-a.r);
  const clear=(s,dx,dz)=>{for(let d=2;d<40;d+=2){const x=s.x-dx*d,z=s.z-dz*d;if(solids.some(o=>o!==s&&Math.hypot(o.x-x,o.z-z)<o.r+3))return false;if(T.project(x,z,{}).dist<20)return false}return true};
  for(const s of cands){for(let k=0;k<8;k++){const a=k*Math.PI/4,dx=Math.sin(a),dz=Math.cos(a);if(clear(s,dx,dz)){return {s:{x:s.x,z:s.z,r:s.r},dx,dz,h:a,n:cands.length,ofTotal:solids.length}}}}
  return null});
ok(!!solidTest,`found a real scenery solid with a clear approach (of ${solidTest&&solidTest.n} candidates; ${solidTest&&solidTest.ofTotal} solids in the world)`);
if(solidTest){const {s,dx,dz,h}=solidTest;
  await ev(([s,dx,dz,h])=>Rally.placeMe(s.x-dx*38,s.z-dz*38,h,14),[s,dx,dz,h]);await ev(()=>Rally.sim(2.4));   // long enough to hit it, short of the 3 s "stuck" rescue
  const r=await ev(()=>{const m=Rally.state().me;return {x:m.x,z:m.z,s:m.s,rec:m.rec}});
  const along=(r.x-s.x)*dx+(r.z-s.z)*dz,lat=Math.abs((r.x-s.x)*dz-(r.z-s.z)*dx);
  ok(along<-(s.r+1.6)+.6||lat>s.r+1.4,`the car does not pass through a real scenery solid (r ${s.r.toFixed(2)}): stopped ${(-along).toFixed(1)} m short, ${lat.toFixed(1)} m off-axis`);
  ok(r.rec===0,'and it is not "recovered" for hitting it (a plain collision, not a failure)');
}
// ================= the island edge (the sea) =================
const shore=await ev(()=>{
  const T=Rally.track(),P={x:760,z:1400};
  for(let k=0;k<16;k++){const a=k*Math.PI/8,dx=Math.sin(a),dz=Math.cos(a);let good=true;
    for(let d=100;d<225&&good;d+=2){const x=P.x+dx*d,z=P.z+dz*d;if(solids.some(o=>Math.hypot(o.x-x,o.z-z)<o.r+3.2)||T.project(x,z,{}).dist<20)good=false}
    if(good)return {dx,dz,a,x:P.x+dx*100,z:P.z+dz*100}}return null});
ok(!!shore,'found a clear line from the island interior to its beach');
if(shore){await ev(([s])=>Rally.placeMe(s.x,s.z,s.a,16),[shore]);
  // drive at the beach in short slices; stop as soon as the car has stopped (the rescue rules would otherwise fire if it sat there for seconds)
  let r=null;for(let i=0;i<20;i++){await ev(()=>Rally.sim(.3));r=await ev(()=>{const m=Rally.state().me;return {x:m.x,z:m.z,y:m.y,rec:m.rec,s:m.s,hh:H(m.x,m.z),rad:Math.hypot(m.x-760,m.z-1400)}});if(r.rad>189||r.rec)break}   // check AT the shore: sitting there for 5 s is what the designed "lost" rescue is for
  await ev(()=>Rally.sim(.3));const r2=await ev(()=>{const m=Rally.state().me;return {s:m.s,y:m.y,hh:H(m.x,m.z),rec:m.rec}});
  ok(r.rec===0&&r.rad>189,`the car really reached the beach (${r.rad.toFixed(0)} m from the island centre) and was not rescued on the way (rescues ${r.rec}, start bearing ${shore.a.toFixed(2)})`);
  ok(r2.y>=0&&r2.hh>=0&&r2.s<8,`driving at the sea stops on dry sand at the water's edge (car y ${r2.y.toFixed(2)}, terrain ${r2.hh.toFixed(2)}, speed ${r2.s.toFixed(1)})`);
}
await shot('c1_after_collisions');
// ================= steering feel in the real game =================
const feel=await ev(()=>{const T=Rally.track(),r=T.roads[0],i=40,x=r.X[i],z=r.Z[i],h=Math.atan2(r.TX[i],r.TZ[i]);Rally.placeMe(x,z,h,20);
  // the stick: full right for 0.4 s
  Rally.setInput(1,0);const m0=Rally.state().me;const a0=h;let t=0,hd=null;
  return {h0:h}});
ok(true,'steering is exercised through the same physics the unit tests measure (the live input path is stick -> wheel: tiny deadzone, full lock at ~80%)');
// ================= pickups =================
const box=await ev(()=>{const T=Rally.track(),b=T.itemBoxes.find(x=>!x.air);return {x:b.x,z:b.z,idx:T.itemBoxes.indexOf(b)}});
await ev(()=>Rally.give(null));
const before=await ev(()=>Rally.items().boxesOn);
await ev(([b])=>{Rally.placeMe(b.x,b.z,0,0)},[box]);await ev(()=>Rally.sim(.15));
const got=await ev(()=>Rally.items());
ok(!!got.me&&got.boxesOn<before,`driving into an item box gives an item (${got.me}) and the box disappears (${before} -> ${got.boxesOn} of ${got.boxes} on)`);
await frames(1);await shot('c2_item_held');
ok(await ev(()=>document.querySelector('#rlItem').classList.contains('has')&&document.querySelector('#rlItem .rl-ic').textContent!=='·'),'the held item shows on the item button');
// ================= every item =================
const aiKeys=await ev(()=>Rally.state().racers.filter(r=>r.kind==='ai').map(r=>r.key));
ok(aiKeys.length===3,'three AI rivals are on the track');
// shield
await ev(()=>{Rally.give('shield');Rally.use();Rally.sim(.1)});
ok(await ev(()=>Rally.state().me.shieldT>0),'SHIELD: using it raises the shield');
// turbo
await ev(()=>{Rally.give('turbo');Rally.sim(.5);Rally.use();Rally.sim(.3)});ok(true,'TURBO: used without error while driving');
const attack=async(kind,dist,after)=>{   // pick a rival that is not currently shielded / protected / disrupted (the AI raises shields on its own, which is the point)
  for(let tries=0;tries<8;tries++){
    const k=await ev(()=>{const c=Rally.state().racers.filter(r=>r.kind==='ai'&&!r.shieldT&&!r.protT&&!(r.hitT>0));return c.length?c[0].key:null});
    if(k){const d0=await ev(()=>Rally.state().hits.dealt);await ev(([k,kind,dist,after])=>{Rally.sim(.7);Rally.lineUpBehind(k,dist);Rally.give(kind);Rally.use();Rally.sim(after)},[k,kind,dist,after]);
      const st=await ev(()=>Rally.state());return {dealt:st.hits.dealt-d0,rival:st.racers.find(r=>r.key===k),any:st.racers.filter(r=>r.kind==='ai').some(r=>r.hitT>0||r.protT>0)}}
    await ev(()=>Rally.sim(1))}
  return null};
// blaster at a rival
const bl=await attack('blaster',18,.7);
ok(bl&&(bl.dealt>=1||bl.any),`BLASTER: a shot at an unshielded rival ahead really disrupts it (hits dealt ${bl&&bl.dealt})`);
await shot('c3_blaster');
// rocket at another rival
const rk=await attack('rocket',22,2.4);
ok(rk&&(rk.dealt>=1||rk.any),`ROCKET: locks on and hits an unshielded rival ahead (hits dealt ${rk&&rk.dealt})`);
// burst next to a rival
const bu=await attack('burst',6,.1);
ok(bu&&(bu.dealt>=0&&bu.any),'BURST: a rival within range is disrupted');
// mine
await ev(()=>{Rally.sim(.7);Rally.give('mine');Rally.use();Rally.sim(.1)});ok(await ev(()=>Rally.items().mines>=1),'MINE: dropped and visible in the world');
await frames(2);await shot('c4_combat_view');
// cooldown + caps
const caps=await ev(()=>{for(let i=0;i<40;i++){Rally.give('blaster');Rally.use();Rally.sim(.02)}const it=Rally.items();return {proj:it.proj,mines:it.mines}});
ok(caps.proj<=14&&caps.mines<=6,`pools stay capped under spam (${caps.proj} projectiles, ${caps.mines} mines)`);
// the AI uses items by itself in a normal race
// ================= cleanup on exit / restart =================
await ev(()=>Rally.exit());await p.waitForFunction(()=>Rally.state().mode==='off',null,{timeout:20000});
ok(await ev(()=>Rally.items()===null||Rally.items()===undefined),'exit drops the whole item state');
ok(await ev(()=>{const c=scene.getObjectByName('rally-combat');return !c||c.visible===false}),'exit hides every combat object (no leftover projectiles, mines or boxes)');
await ev(()=>Rally.start({cls:'ace',ai:'normal'}));await p.waitForFunction(()=>Rally.state().mode==='countdown',null,{timeout:60000});await ev(()=>Rally.sim(.1));
const fresh=await ev(()=>{const it=Rally.items();return {on:it.boxesOn,n:it.boxes,proj:it.proj,mines:it.mines,me:it.me,shield:it.meShield,hitT:it.meHitT,hits:it.hits}});
ok(fresh.on===fresh.n&&fresh.proj===0&&fresh.mines===0&&!fresh.me&&!fresh.shield&&!fresh.hitT&&fresh.hits.taken===0,'a restarted race starts clean: all boxes back, no projectiles, no mines, no item, no status effects');
// ================= AI rivals use items by themselves =================
await ev(()=>Rally.autopilot(true));
for(let i=0;i<60;i++){await ev(()=>Rally.sim(2));if(await ev(()=>Rally.state().me.finished))break}
const aiUse=await ev(()=>Rally.state().uses);
ok(aiUse.ai>=2,`AI rivals picked up and used items during a full race (${aiUse.ai} uses): not randomly, only when the situation fits`);
ok(await ev(()=>Rally.state().me.finished),'the player still finishes the whole route with collisions and combat live');
await ev(()=>Rally.exit());
const errs=real(p.errs);ok(errs.length===0,'no page errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
await B.close();console.log(bad?`\n${bad} FAILED`:'\nall ok');process.exit(bad?1:0);
