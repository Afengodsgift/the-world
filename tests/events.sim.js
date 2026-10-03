// Simulation of the Event Director + meteor / visitor / rings with two clients and a controllable clock.
// Run: NODE_PATH=<dir with three@0.147.0>/node_modules node tests/events.sim.js
const {client}=require('./harness');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;
const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const T={v:Date.now()};
async function pair(room){
  const A=client('a','Alex',room),B=client('b','Bee',room);
  A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
  for(const c of [A,B]){c.Events._setClock(()=>T.v);c.Verbs.build();c.Vaults.build()}
  await A.WS.init(room,'Alex');await B.WS.init(room,'Bee');
  for(const c of [A,B]){c.Verbs.start();c.Vaults.start();c.Events.start()}
  return [A,B];
}
const frame=(c,dt)=>{c.Events._frame(dt||.05,T.v);c.Interaction.update()};
const adv=(cs,ms)=>{T.v+=ms;for(const c of cs)frame(c)};
const at=(c,x,y,z)=>{c.S.x=x;c.S.z=z;c.S.y=y===undefined?c.H(x,z)+.1:y;c.S.state='idle';c.S.grounded=true;c.S.flying=false};
function findSlot(c,type,from){const s0=Math.floor(from/c.EVENTS.slotMs);for(let s=s0;s<s0+500;s++){const e=c.Events.schedule(s);if(e&&e.type===type)return e}return null}
(async()=>{
  // ---------- schedule (pure function)
  const ROOM='EVENT-TEST1';
  const [A,B]=await pair(ROOM);
  const CFG=A.EVENTS,s0=Math.floor(T.v/CFG.slotMs);let n=0,mix={},overlap=0,minGap=1e12,prev=null,diff=0;
  for(let s=s0;s<s0+600;s++){const e=A.Events.schedule(s),f=B.Events.schedule(s);
    if(JSON.stringify(e)!==JSON.stringify(f))diff++;
    if(e){n++;mix[e.type]=(mix[e.type]||0)+1;if(e.end>=(s+1)*CFG.slotMs)overlap++;if(prev){minGap=Math.min(minGap,e.start-prev.end)}prev=e}}
  ok(diff===0,'two clients compute the identical schedule from the room seed');
  ok(Math.abs(n/600-CFG.chance)<.07,'event frequency matches config ('+(n/600).toFixed(2)+' vs '+CFG.chance+')');
  ok(Object.keys(mix).length===3,'all three event types occur: '+JSON.stringify(mix));
  ok(overlap===0&&minGap>=60000,'events never overlap and always leave a gap (min gap '+(minGap/60000).toFixed(1)+' min)');
  const [C2]=[client('x','Zed','OTHER-ROOM')];C2.Events._setClock(()=>T.v);
  let d2=0;for(let s=s0;s<s0+60;s++)if(JSON.stringify(C2.Events.schedule(s))!==JSON.stringify(A.Events.schedule(s)))d2++;
  ok(d2>20,'different rooms get different schedules');

  // ---------- quiet between events
  const mEv=findSlot(A,'meteor',T.v);
  T.v=mEv.end+5000;adv([A,B],100);
  ok(A.Events.instances().size===0&&A.Events.places().length===0,'nothing is live between events (quiet world)');

  // ---------- METEOR
  T.v=mEv.start+500;at(A,0,undefined,0);at(B,5,undefined,5);adv([A,B],100);
  const IA=A.Events.instances().get(mEv.id),IB=B.Events.instances().get(mEv.id);
  ok(IA&&IB&&!IA.dead,'meteor shower spawns on both clients when its window opens');
  ok(JSON.stringify(IA.st.imp.map(m=>[+m.x.toFixed(2),+m.z.toFixed(2),m.t]))===JSON.stringify(IB.st.imp.map(m=>[+m.x.toFixed(2),+m.z.toFixed(2),m.t])),'both clients agree on every impact point and time (nothing networked)');
  ok(IA.st.imp.every(m=>A.H(m.x,m.z)>.2),'all impacts are on land');
  ok(IA.st.imp.every(m=>!m.frag),'no fragments before the first streak lands');
  const m0=IA.st.imp[0];
  T.v=m0.t-1000;adv([A],50);ok(!!m0.streak,'a streak is falling just before impact');
  T.v=m0.t+100;adv([A,B],50);
  ok(!m0.streak&&m0.frag&&A.Events.permanent().children.length>=1,'impact: streak gone, crater + fragment appear');
  ok(!A.log.banners.some(b=>b.includes('COLLECTED')),'(not collected yet)');
  // notice via proximity -> banner once + shared pin
  at(A,m0.x+300,undefined,m0.z);adv([A],50);adv([A],50);adv([A],50);
  ok(A.log.banners.filter(b=>b.includes('FALLING STARS')).length===1,'getting near shows ONE notice banner (no spam): '+A.log.banners.find(b=>b.includes('FALLING')));
  await sleep(30);
  ok(A.Events.places().length===1&&B.Events.places().length===1,"partner's map gets the event pin too (shared notice)");
  // collect
  at(A,m0.x,undefined,m0.z);adv([A],50);
  ok(A.WS.hasInSet('frag',m0.id)&&A.log.banners.some(b=>b.includes('COLLECTED')),'walking over a fragment collects it');
  await sleep(30);adv([B],50);
  const mB=IB.st.imp[0];ok(mB.frag&&!mB.frag.visible,'it disappears for your partner too');
  ok(A.WS.entries().filter(e=>e.kind==='event'&&e.key===mEv.id).length===1,'journal: '+(A.WS.entries().find(e=>e.kind==='event')||{data:{}}).data.text);
  for(const m of IA.st.imp.slice(1)){T.v=Math.max(T.v,m.t+100);adv([A,B],50)}
  ok(IA.st.imp.every(m=>m.frag),'all six fragments appear over the shower');
  at(A,IA.st.imp[1].x,undefined,IA.st.imp[1].z);adv([A],50);
  ok(A.WS.entries().filter(e=>e.kind==='event'&&e.key===mEv.id).length===1,'second fragment does not spam the journal');
  ok(A.WS.getSet('loot').filter(x=>x.includes(':fragment')).length===2,'each fragment is recorded once');
  const craters=A.Events.permanent().children.length;
  T.v=mEv.end+1000;adv([A,B],50);
  ok(A.Events.instances().size===0&&!A.scene.children.includes(IA.st.group),'event ends and its fragments are removed');
  ok(A.Events.permanent().children.length===craters&&craters>=6,'craters stay behind as evidence ('+craters+')');
  await A.WS.flush();
  // evidence for a late joiner / next session
  const G=client('g','Gus',ROOM);G.Events._setClock(()=>T.v+120000);G.Verbs.build();G.Vaults.build();await G.WS.init(ROOM,'Gus');G.Events.start();
  ok(G.Events.permanent().children.length>=6,'a new session rebuilds craters from past events ('+G.Events.permanent().children.length+')');

  // ---------- VISITOR
  const vEv=findSlot(A,'visitor',T.v);
  const unseen0=A.Verbs.unseen().length+A.Vaults.unseen().length;
  T.v=vEv.start+500;at(A,0,undefined,0);adv([A,B],100);
  const VA=A.Events.instances().get(vEv.id);ok(VA&&!VA.dead,'visitor appears');
  const vc=VA.st.c;at(A,vc.x+2,undefined,vc.z+2);adv([A],50);
  ok(A.Interaction.current()==='ev:talk','prompt "Talk" appears next to the visitor');
  at(B,vc.x-2,undefined,vc.z-2);adv([B],50);
  ok(B.Interaction.current()==='ev:talk','...and for your partner');
  A.Interaction.use();await sleep(5);
  ok(A.log.banners.some(b=>b.includes('THE VISITOR')),'they greet you first');
  await sleep(2800);
  ok(A.WS.hasInSet('evdone',vEv.id),'conversation recorded');
  const unseen1=A.Verbs.unseen().length+A.Vaults.unseen().length;
  ok(unseen1===unseen0-1,'exactly one undiscovered camp/vault was revealed ('+unseen0+' -> '+unseen1+')');
  ok(A.log.banners.some(b=>b.includes('SECRET SHARED')),'secret banner: '+(A.log.banners.find(b=>b.includes('SECRET'))||''));
  ok(A.WS.entries().some(e=>e.kind==='event'&&e.key===vEv.id)&&A.WS.entries().some(e=>e.kind==='spot'),'journal has the conversation and the revealed place');
  await sleep(40);adv([A,B],50);
  ok(B.Interaction.current()!=='ev:talk','after it is done nobody can talk again');
  ok(B.Verbs.places().length+B.Vaults.places().length>=1,"revealed place is on the partner's map too");
  T.v=vEv.end+1000;adv([A,B],50);ok(A.Events.instances().size===0,'visitor leaves when the event ends');

  // ---------- RINGS
  const rEv=findSlot(A,'rings',T.v);
  T.v=rEv.start+500;at(A,0,undefined,0);at(B,5,undefined,5);adv([A,B],100);
  const RA=A.Events.instances().get(rEv.id),RB=B.Events.instances().get(rEv.id);
  ok(RA&&RB&&!RA.dead&&RA.st.rings.length===5,'five golden rings appear');
  ok(JSON.stringify(RA.st.rings.map(r=>[+r.x.toFixed(2),+r.y.toFixed(2),+r.z.toFixed(2)]))===JSON.stringify(RB.st.rings.map(r=>[+r.x.toFixed(2),+r.y.toFixed(2),+r.z.toFixed(2)])),'both clients see identical rings');
  const rg=RA.st.rings,fly=(c,o)=>{c.S.x=o.x;c.S.y=o.y;c.S.z=o.z;c.S.flying=true;c.S.grounded=false};
  fly(A,rg[3]);adv([A],50);ok(RA.st.idx===0,'passing a later ring first does nothing (order matters)');
  fly(A,rg[0]);adv([A],50);ok(RA.st.idx===1,'first ring starts the run');
  T.v+=10000;fly(A,rg[1]);adv([A],50);fly(A,rg[2]);adv([A],50);ok(RA.st.idx===3,'rings advance in order');
  T.v+=70000;adv([A],50);ok(RA.st.idx===0&&A.log.banners.some(b=>b.includes('Too slow')),'running out of time (75 s) resets the run');
  for(let i=0;i<5;i++){T.v+=4000;fly(A,rg[i]);adv([A],50)}
  ok(RA.st.done&&A.WS.hasInSet('evdone',rEv.id),'flying all five in order completes the event');
  ok(A.log.banners.some(b=>b.includes('COMPLETE')),'completion banner: '+(A.log.banners.find(b=>b.includes('COMPLETE'))||''));
  ok(A.WS.getSet('loot').filter(x=>x.startsWith(rEv.id)).length===1&&A.WS.entries().some(e=>e.kind==='event'&&e.key===rEv.id),'reward + journal recorded once');
  await sleep(40);adv([B],50);
  ok(RB.st.done&&B.log.banners.some(b=>b.includes('TOGETHER')),'partner is told it was completed (no need to repeat)');
  T.v=rEv.end+1000;adv([A,B],50);ok(A.Events.instances().size===0&&!A.scene.children.includes(RA.st.g),'rings removed when the event ends');

  // ---------- dev force
  at(A,0,undefined,0);A.S.rot=0;
  for(const type of ['meteor','visitor','rings']){const id=A.Events.force(type);adv([A],100);
    const I=A.Events.instances().get(id);ok(I&&!I.dead&&Math.hypot(I.st.c.x-A.S.x,I.st.c.z-A.S.z)<60,'force("'+type+'") spawns one next to you'); T.v+=6*60000;adv([A],50)}
  console.log(fails?'\n'+fails+' FAILED':'\nALL PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2)});
