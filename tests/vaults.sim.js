// Simulation of Vaults + Link: twin plates and shrine sync, with two clients and the real terrain.
// Run: NODE_PATH=<dir with three@0.147.0>/node_modules node tests/vaults.sim.js
const {client}=require('./harness');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;
const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const at=(c,x,y,z)=>{c.S.x=x;c.S.z=z;c.S.y=y===undefined?c.H(x,z)+.1:y;c.S.state='idle';c.S.grounded=true;c.S.flying=false};
const onZone=(c,z)=>at(c,z.x,z.y,z.z);
const frame=(c,dt)=>{c.Verbs._frame(dt,Date.now());c.Vaults._frame(dt,Date.now());c.Link._tick(dt);c.Interaction.update()};
const run=(cs,sec,dt)=>{dt=dt||.05;for(let i=0;i<Math.round(sec/dt);i++)for(const c of cs)frame(c,dt)};
(async()=>{
  const ROOM='VAULT-TEST1';
  const A=client('a','Alex',ROOM),B=client('b','Bee',ROOM);
  A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S; // each sees the other's real position
  A.Verbs.build();B.Verbs.build();A.Vaults.build();B.Vaults.build();
  const va=A.Vaults.vaults(),vb=B.Vaults.vaults();
  console.log('vaults:',va.map(v=>v.name+' ['+v.kind+']').join(' | '));
  ok(va.length>=8,'vaults placed on islands ('+va.length+')');
  ok(JSON.stringify(va.map(v=>[v.id,v.kind,+v.x.toFixed(2),+v.z.toFixed(2)]))===JSON.stringify(vb.map(v=>[v.id,v.kind,+v.x.toFixed(2),+v.z.toFixed(2)])),'both clients derive identical vaults and puzzle kinds');
  ok(va.some(v=>v.kind==='plates')&&va.some(v=>v.kind==='shrine'),'both puzzle kinds occur');
  const sepOK=va.every(v=>A.Verbs.camps().every(c=>Math.hypot(v.x-c.x,v.z-c.z)>40));ok(sepOK,'no vault overlaps a camp');
  ok(va.filter(v=>v.kind==='plates').every(v=>v.zones.every(z=>A.H(z.x,z.z)>.5&&Math.abs(z.y-v.y)<2.6)),'all plates sit on dry, level ground');
  ok(va.filter(v=>v.kind==='plates').every(v=>Math.hypot(v.zones[0].x-v.zones[1].x,v.zones[0].z-v.zones[1].z)>12),'plates are far enough apart that one player cannot cover both');
  await A.WS.init(ROOM,'Alex');await B.WS.init(ROOM,'Bee');A.Verbs.start();B.Verbs.start();A.Vaults.start();B.Vaults.start();

  // ---------- plates
  const P=va.find(v=>v.kind==='plates'),PB=vb.find(v=>v.id===P.id);
  onZone(A,P.zones[0]);onZone(B,P.zones[1]);
  run([A,B],1.0);ok(!P.solved&&P.p>.5&&P.p<1,'holding both plates makes progress ('+P.p.toFixed(2)+') but is not instant');
  ok(P.rings.every(r=>r.material.opacity===1),'plate rings light up while held');
  run([A,B],.8);
  ok(P.solved&&PB.solved,'vault opens for BOTH players after the hold');
  ok(A.WS.getSet('solved').includes(P.id),'recorded in WorldState');
  ok(A.WS.entries().some(e=>e.kind==='vault'&&e.key===P.id&&e.data.text),'journal: '+(A.WS.entries().find(e=>e.kind==='vault')||{data:{}}).data.text);
  await sleep(40);
  ok(A.WS.getSet('loot').filter(x=>x.startsWith(P.id)).length===1,'exactly one reward even though both clients detected it');
  ok(!P.field.visible&&!P.beam.visible,'sealing field and beacon removed');
  run([A],1.2);ok(P.lid.rotation.x<-1.5,'chest lid swings open');

  // solo / same plate / decay (use a second plates vault if there is one, else a fresh room)
  const R2='VAULT-TEST2',C=client('a','Alex',R2),D=client('b','Bee',R2);
  C.others.get('b').group.position=D.S;D.others.get('a').group.position=C.S;
  C.Verbs.build();D.Verbs.build();C.Vaults.build();D.Vaults.build();await C.WS.init(R2,'Alex');await D.WS.init(R2,'Bee');C.Verbs.start();D.Verbs.start();C.Vaults.start();D.Vaults.start();
  const Q=C.Vaults.vaults().find(v=>v.kind==='plates');
  onZone(C,Q.zones[0]);at(D,Q.x+40,undefined,Q.z);
  run([C,D],4);ok(!Q.solved&&Q.p===0,'one player alone can never open a plates vault');
  ok(C.log.banners.some(b=>b.includes('second plate')),'a lone player gets a hint to bring their partner');
  onZone(D,Q.zones[0]); // both on the SAME plate
  run([C,D],3);ok(!Q.solved,'both standing on the same plate does not count');
  onZone(D,Q.zones[1]);run([C,D],1.0);const p1=Q.p;
  at(D,Q.x+40,undefined,Q.z);run([C,D],.5);ok(Q.p<p1&&!Q.solved,'stepping off loses progress ('+p1.toFixed(2)+' -> '+Q.p.toFixed(2)+')');
  onZone(D,Q.zones[1]);run([C,D],2.5);ok(Q.solved,'coming back and holding again still works');

  // ---------- shrine
  const R3='VAULT-TEST3',E=client('a','Alex',R3),F=client('b','Bee',R3);
  E.others.get('b').group.position=F.S;F.others.get('a').group.position=E.S;
  E.Verbs.build();F.Verbs.build();E.Vaults.build();F.Vaults.build();await E.WS.init(R3,'Alex');await F.WS.init(R3,'Bee');E.Verbs.start();F.Verbs.start();E.Vaults.start();F.Vaults.start();
  let SV=E.Vaults.vaults().find(v=>v.kind==='shrine');
  if(!SV){console.log('(room3 had no shrine, retrying rooms)');}
  const SF=F.Vaults.vaults().find(v=>v.id===SV.id);
  at(E,SV.shrine.x+1,undefined,SV.shrine.z+1);at(F,SV.shrine.x-1,undefined,SV.shrine.z-1);run([E,F],.2);
  ok(E.Interaction.current()==='vault:shrine'&&E.els.use.textContent.length>0,'shrine offers a Call prompt when you stand near it');
  E.Interaction.use();await sleep(5);
  ok(E.log.emotes.includes('cast'),'calling plays the cast animation');
  ok(!SV.solved,'one call alone does nothing');
  ok(E.log.banners.some(b=>b.includes('NOW')),'caller is told their partner must call at the same moment');
  await sleep(40);ok(SF.glow>0,"partner's shrine flares when you call (they can see it happen)");
  await sleep(1700);   // outside the 1.5s window
  F.Interaction.use();await sleep(30);
  ok(!SV.solved&&!SF.solved,'calls 1.7 s apart do NOT count');
  E.Interaction.use();await sleep(40);   // E presses again right after F
  ok(SV.solved&&SF.solved,'two calls within the window open the vault for both');
  ok(E.WS.getSet('loot').filter(x=>x.startsWith(SV.id)).length===1,'one reward');

  // ---------- the two-player rule holds even if something unexpected completes a puzzle
  {
    const R4='VAULT-GUARD',G=client('a','Alex',R4);G.others.clear();                 // nobody else is connected
    G.Verbs.build();G.Vaults.build();await G.WS.init(R4,'Alex');G.Verbs.start();G.Vaults.start();
    const pv=G.Vaults.vaults().find(v=>v.kind==='plates'),sv=G.Vaults.vaults().find(v=>v.kind==='shrine');
    const warns=[],ow=console.warn;console.warn=(...a)=>warns.push(a.join(' '));
    if(pv){const grp=G.Link._groups.find(g=>g.zones===pv.zones);grp.done=true;grp.t=1.6;grp.onDone(grp);   // simulate the rare unexplained self-solve
      ok(!pv.solved&&G.WS.getSet('solved').length===0&&G.WS.getSet('loot').length===0&&!G.WS.entries().some(e=>e.kind==='vault'),'plates: a completion with no partner opens nothing and rewards nothing');
      ok(grp.done===false&&grp.t===0,'plates: the puzzle is re-armed, not stuck');}
    if(sv){const d=G.Link._syncs.get(sv.id);d.done=true;d.onDone();
      ok(!sv.solved&&G.WS.getSet('solved').length===0,'shrine: a completion with no partner opens nothing');
      ok(d.done===false,'shrine: re-armed, not stuck');}
    console.warn=ow;
    ok(warns.length>=1&&warns.every(w=>w.includes('refused to open')),'a diagnostic is logged so the cause can be found ('+warns.length+' warning'+(warns.length===1?'':'s')+')');
    // a partner who leaves mid-hold stops the progress, and coming back lets it finish
    const R5='VAULT-LEAVE',C=client('a','Alex',R5),D=client('b','Bee',R5);
    C.others.get('b').group.position=D.S;D.others.get('a').group.position=C.S;
    C.Verbs.build();D.Verbs.build();C.Vaults.build();D.Vaults.build();await C.WS.init(R5,'Alex');await D.WS.init(R5,'Bee');C.Verbs.start();D.Verbs.start();C.Vaults.start();D.Vaults.start();
    const Q2=C.Vaults.vaults().find(v=>v.kind==='plates');
    onZone(C,Q2.zones[0]);onZone(D,Q2.zones[1]);run([C,D],.8);
    ok(Q2.p>.3&&!Q2.solved,'(both holding, progress building: '+Q2.p.toFixed(2)+')');
    const partner=C.others.get('b');C.others.clear();                                  // partner disconnects
    run([C],3);ok(!Q2.solved&&Q2.p===0,'partner disconnects mid-hold: progress drops to zero and nothing opens');
    C.others.set('b',partner);run([C,D],2.4);ok(Q2.solved,'partner reconnects and holds again: it opens');
  }

  // ---------- spotted, map, late join
  const far=va.find(v=>v!==P&&v.name!=='the main island');at(A,far.x+80,undefined,far.z);run([A],.1);
  ok(far.seen&&A.WS.getSet('seen').includes(far.id),'approaching a vault spots it');
  ok(A.log.banners.some(b=>b.includes('SPOTTED')),'spot banner');
  ok(A.Vaults.places().some(p=>p.n.includes(far.name)&&typeof p.y==='number'),'spotted vault is on the map');
  await sleep(40);ok(B.Vaults.places().some(p=>p.n.includes(far.name)),"partner's map gets it too");
  await A.WS.flush();
  const G=client('c','Cy',ROOM);G.Verbs.build();G.Vaults.build();await G.WS.init(ROOM,'Cy');G.Verbs.start();G.Vaults.start();
  const GP=G.Vaults.vaults().find(v=>v.id===P.id);
  ok(GP.solved&&!GP.field.visible,'late joiner sees the opened vault from the database');
  ok(G.log.banners.length===0,'restore is silent');
  console.log(fails?'\n'+fails+' FAILED':'\nALL PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2)});
