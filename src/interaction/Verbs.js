// Verbs: reusable "stand here, do the thing" interactions.
//   data (src/data/interactables.js) -> props in the world -> Use -> verb animation -> progress
//   -> WorldState write -> both clients change the prop -> Journal entry.
// Generic here: detection, prompt, stand-still-then-work, progress bar, co-op speed-up,
//   completion, state sync, late-join restore, journal logging.
// Specific (data/visuals): what the verbs ARE and what sites look like.
// Sync model: "done" is a set in WorldState; props are placed from the room seed, so only the
//   id of a finished interactable ever travels. Rewards are seeded, so both clients agree.
// Depends on globals from index.html (S, me, others, scene, H, solids, ISL, TOWN, KT, RING, OUT,
//   BOARD, roomCode, banner, chime, playEmote, loadEmotes, emoStop, AM, place, Interaction, $, THREE)
//   plus Net, WS, Systems, hashSeed, mulberry, VERBS, CAMP, LOOT.
const Verbs=(()=>{
  const items=[],byId=new Map(),camps=[],applied=new Set(),pw=new Map(),fx=[];
  let W=null,cur=null,built=false,started=false,pre=false,bar,barTxt,barFill;
  const near=it=>Math.hypot(S.x-it.x,S.z-it.z);
  const MAT={},mat=(c,o)=>{const k=c+(o?JSON.stringify(o):'');return MAT[k]||(MAT[k]=new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:1,flatShading:true},o||{})))};
  const M=(g,m,x,y,z)=>{const o=new THREE.Mesh(g,m);o.position.set(x||0,y||0,z||0);o.castShadow=true;return o};
  const safe=f=>{try{return f()}catch(e){return false}};

  // ---- visuals: each returns {todo,done} groups; Verbs just toggles them -------------------
  const VIS={
    mound(){
      const todo=new THREE.Group(),done=new THREE.Group();
      const m=M(new THREE.SphereGeometry(1.1,10,7),mat('#7b5a3a'),0,.05,0);m.scale.set(1.2,.45,1.2);todo.add(m);
      const h=M(new THREE.CylinderGeometry(.05,.05,1.5,6),mat('#8a5a33'),.55,.8,.3);h.rotation.z=.28;todo.add(h);
      const b=M(new THREE.BoxGeometry(.32,.4,.05),mat('#9aa0a8'),.36,.12,.3);b.rotation.z=.28;todo.add(b);
      const hole=new THREE.Mesh(new THREE.CircleGeometry(.8,14),new THREE.MeshBasicMaterial({color:'#1a120b'}));hole.rotation.x=-Math.PI/2;hole.position.y=.05;done.add(hole);
      const rim=new THREE.Mesh(new THREE.RingGeometry(.8,1.4,14),mat('#6a4c30'));rim.rotation.x=-Math.PI/2;rim.position.y=.04;done.add(rim);
      for(let i=0;i<4;i++){const a=i*1.6+.4,c=M(new THREE.DodecahedronGeometry(.18,0),mat('#6a4c30'),Math.cos(a)*1.5,.1,Math.sin(a)*1.5);done.add(c)}
      return {todo,done}},
    rock(){
      const todo=new THREE.Group(),done=new THREE.Group();
      const r=M(new THREE.DodecahedronGeometry(1.15,0),mat('#8b909c'),0,1.1,0);r.scale.set(1,1.15,1);todo.add(r);
      for(let i=0;i<3;i++){const a=i*2.1+.5,c=M(new THREE.BoxGeometry(.08,.8,.08),mat('#ff9a3c',{emissive:'#ff7a10',emissiveIntensity:1.2}),Math.cos(a)*1.0,1.2,Math.sin(a)*1.0);c.rotation.set(.3,a,.5);todo.add(c)}
      for(let i=0;i<7;i++){const a=i*.9,d=.3+(i%3)*.45,s=.22+(i%4)*.09,c=M(new THREE.DodecahedronGeometry(s,0),mat('#7d828e'),Math.cos(a)*d,s*.6,Math.sin(a)*d);c.rotation.set(i,i*2,0);done.add(c)}
      return {todo,done}},
    fence(){
      const todo=new THREE.Group(),done=new THREE.Group(),wood=mat('#8a5a33');
      for(let i=0;i<4;i++){const x=(i-1.5)*1.05;
        const t=M(new THREE.BoxGeometry(.18,1.3,.18),wood,x,.62,0);t.rotation.z=(i%2?.55:-.35)*(i===1?1.4:1);t.rotation.x=(i-1.5)*.12;t.position.y=.5;todo.add(t);
        done.add(M(new THREE.BoxGeometry(.18,1.3,.18),wood,x,.65,0))}
      const fallen=M(new THREE.BoxGeometry(2.6,.12,.1),wood,.4,.1,.8);fallen.rotation.y=.35;todo.add(fallen);
      done.add(M(new THREE.BoxGeometry(3.4,.12,.1),wood,0,.4,0),M(new THREE.BoxGeometry(3.4,.12,.1),wood,0,.95,0));
      return {todo,done}}
  };

  // ---- placement: see src/world/Sites.js ----------------------------------------------------
  function makeCamp(name,key,site){
    const x=site.x,z=site.z,ry=site.ry;
    const c={id:'camp:'+key,name,x,z,y:H(x,z),ry,items:[],cleared:false},g=new THREE.Group();g.position.set(x,c.y,z);scene.add(g);c.group=g;
    // cold campfire in the middle
    for(let i=0;i<6;i++){const a=i*1.047;g.add(M(new THREE.DodecahedronGeometry(.22,0),mat('#6b6f78'),Math.cos(a)*.75,.12,Math.sin(a)*.75))}
    for(let i=0;i<3;i++){const l=M(new THREE.CylinderGeometry(.07,.07,.9,5),mat('#2b2119'),0,.14,0);l.rotation.set(Math.PI/2,0,i*1.05);g.add(l)}
    // faint beacon so camps can be spotted from a distance until they are restored
    c.beam=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,24,8,1,true),new THREE.MeshBasicMaterial({color:'#ffcf7a',transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide,fog:false}));
    c.beam.position.y=12;g.add(c.beam);
    const cs=Math.cos(ry),sn=Math.sin(ry);
    for(const P of CAMP.parts){
      const wx=P.dx*cs-P.dz*sn,wz=P.dx*sn+P.dz*cs,v=VIS[P.vis](),grp=new THREE.Group();
      grp.position.set(wx,0,wz);grp.rotation.y=ry+(P.vis==='fence'?0:1.7);grp.add(v.todo,v.done);v.done.visible=false;g.add(grp);
      const ix=x+wx,iz=z+wz,it={id:c.id+':'+P.verb,verb:P.verb,x:ix,z:iz,y:H(ix,iz),r:CAMP.radius,camp:c,vis:v,prog:0,done:false,sol:null};
      grp.position.y=it.y-c.y;
      if(P.vis==='rock'){it.sol={x:ix,z:iz,r:1.3};solids.push(it.sol)}
      c.items.push(it);items.push(it);byId.set(it.id,it);
    }
    camps.push(c);return c;
  }

  // ---- effects -----------------------------------------------------------------------------
  const FXG=()=>FXG.g||(FXG.g=new THREE.OctahedronGeometry(.12,0));
  const FXM={};const fxm=c=>FXM[c]||(FXM[c]=new THREE.MeshBasicMaterial({color:c}));
  function burst(x,y,z,color,n){
    for(let i=0;i<(n||14);i++){const m=new THREE.Mesh(FXG(),fxm(color||'#ffe08a')),a=Math.random()*6.283,s=2+Math.random()*3;
      m.position.set(x,y+.8,z);scene.add(m);fx.push({m,vx:Math.cos(a)*s,vy:3+Math.random()*4,vz:Math.sin(a)*s,life:.9})}
  }
  function lightCamp(c){
    c.beam.visible=false;
    const lx=c.x,lz=c.z;let L=safe(()=>typeof place==='function'&&AM&&AM.lantern&&place(scene,'lantern',lx,c.y,lz,0,2.2));
    if(!L){L=new THREE.Group();L.position.set(lx,c.y,lz);L.add(M(new THREE.CylinderGeometry(.06,.06,1.6,6),mat('#3a2f25'),0,.8,0),
      new THREE.Mesh(new THREE.SphereGeometry(.28,10,8),new THREE.MeshBasicMaterial({color:'#ffd27a'})));L.children[1].position.y=1.7;scene.add(L)}
    const halo=new THREE.Mesh(new THREE.SphereGeometry(1.1,12,8),new THREE.MeshBasicMaterial({color:'#ffb347',transparent:true,opacity:.28,depthWrite:false}));
    halo.position.set(lx,c.y+2.1,lz);scene.add(halo);c.halo=halo;
  }

  // ---- state / completion -----------------------------------------------------------------
  const partnerName=()=>{const o=others&&others.size?others.values().next().value:null;return(o&&o.group.userData.nm)||'Your partner'};
  function applyDone(it,o){
    if(applied.has(it.id))return;applied.add(it.id);
    it.done=true;it.prog=1;it.vis.todo.visible=false;it.vis.done.visible=true;if(it.sol)it.sol.r=.5;
    if(o.fx){burst(it.x,it.y,it.z,'#ffe08a',14);if(!o.mine)banner(partnerName()+' '+VERBS[it.verb].past+'!','TOGETHER')}
    const c=it.camp;
    if(!c.cleared&&c.items.every(x=>x.done)){
      c.cleared=true;lightCamp(c);
      if(o.fx){burst(c.x,c.y,c.z,'#ffd24a',26);banner('Camp restored on '+c.name,'🏕️ CAMP CLEARED');safe(()=>chime())}
      if(WS.ready()){WS.addToSet('camps',c.id);WS.log('camp',c.id,{text:'Restored the camp on '+c.name,icon:'🏕️',x:c.x,z:c.z})}
    }
  }
  function pickLoot(table,id){
    const r=mulberry(hashSeed(roomCode+':loot:'+id)),tot=table.reduce((s,e)=>s+e.w,0);let t=r()*tot;
    for(const e of table){t-=e.w;if(t<=0)return e}return table[0];
  }
  function grant(it){ // runs only for the client that actually finished it first
    const V=VERBS[it.verb],table=LOOT[it.verb],c=it.camp;let text,icon=V.icon,color='#ffe08a';
    if(table){const L=pickLoot(table,it.id);text=(it.verb==='dig'?'Dug up ':'Mined ')+L.n+' on '+c.name;icon=L.ic;color=L.c||color;
      WS.addToSet('loot',it.id+':'+L.id);if(L.rare)text+=' ✨ (rare!)'}
    else text='Repaired the old fence on '+c.name;
    WS.log('verb',it.id,{text,icon,x:it.x,z:it.z});
    burst(it.x,it.y+.4,it.z,color,18);banner(text,V.label.toUpperCase()+' COMPLETE');safe(()=>chime());
  }
  function sync(withFx){for(const id of WS.getSet('done')){const it=byId.get(id);if(it&&!applied.has(id)){applyDone(it,{fx:withFx,mine:false});if(W&&W.it===it)stopWork(false)}}}

  // ---- working -----------------------------------------------------------------------------
  function startEmote(id){if(typeof playEmote==='function')VerbAnims.load().then(()=>{if(W&&!W.pending)playEmote(id)}).catch(()=>{})}
  function beginWork(){W.pending=false;W.x0=S.x;W.z0=S.z;startEmote(VERBS[W.it.verb].emote);Net.emit('vw',{id:W.it.id,on:true})}
  function stopWork(){
    if(!W)return;const it=W.it;W=null;hideBar();
    Net.emit('vw',{id:it.id,on:false});
    safe(()=>emoStop(me.userData));
  }
  function activate(){
    Promise.resolve().then(()=>{if(me)me.userData.emote=null}); // doUse() plays a generic 'interact' overlay after us; verbs have their own animation
    if(W){stopWork();return}
    if(!cur)return;
    W={it:cur,pending:true,wait:0,x0:S.x,z0:S.z};
  }
  function complete(it){
    stopWork();
    applyDone(it,{fx:true,mine:true});
    const first=WS.ready()?WS.addToSet('done',it.id):true;
    if(first)grant(it);
    safe(()=>loadEmotes().then(()=>setTimeout(()=>playEmote('cheer'),80)));
  }
  function work(dt){
    const it=W.it,V=VERBS[it.verb];
    if(it.done){stopWork();return}
    if(W.pending){W.wait+=dt;
      if(S.state==='idle'&&S.grounded)beginWork();
      else if(W.wait>1.6||near(it)>it.r+1)stopWork();
      return}
    if(S.flying||!S.grounded||S.state==='swim'||S.hurt>0||Math.hypot(S.x-W.x0,S.z-W.z0)>.7||near(it)>it.r+.6){stopWork();return}
    const mult=pw.has(it.id)?2:1;
    it.prog+=dt*mult/(V.ms/1000);
    showBar(V.icon+' '+V.label+(mult>1?'  ×2 together!':''),it.prog);
    if(it.prog>=1)complete(it);
  }

  // ---- UI ----------------------------------------------------------------------------------
  function ui(){
    if(bar)return;
    bar=document.createElement('div');bar.style.cssText='position:fixed;z-index:6;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 250px);width:220px;padding:8px 12px;background:#000a;border-radius:12px;color:#fff;font:14px sans-serif;text-align:center;display:none;pointer-events:none';
    barTxt=document.createElement('div');const tr=document.createElement('div');tr.style.cssText='height:8px;border-radius:4px;background:#ffffff33;margin-top:6px;overflow:hidden';
    barFill=document.createElement('div');barFill.style.cssText='height:100%;width:0;background:#ffd24a';tr.appendChild(barFill);bar.appendChild(barTxt);bar.appendChild(tr);document.body.appendChild(bar);
  }
  function showBar(t,p){ui();bar.style.display='block';if(barTxt.textContent!==t)barTxt.textContent=t;barFill.style.width=Math.min(100,p*100)+'%'}
  function hideBar(){if(bar)bar.style.display='none'}
  const labelFor=it=>{const V=VERBS[it.verb];if(W&&W.it===it)return'✋ Stop';return(pw.has(it.id)?'Help ':'')+V.icon+' '+V.label};

  // ---- per-frame --------------------------------------------------------------------------
  function frame(dt,t){
    if(!built||!S||!me)return;
    for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.life-=dt;f.vy-=14*dt;f.m.position.x+=f.vx*dt;f.m.position.y+=f.vy*dt;f.m.position.z+=f.vz*dt;f.m.rotation.y+=dt*6;
      if(f.life<=0){scene.remove(f.m);fx.splice(i,1)}}
    for(const c of camps){const d=Math.hypot(S.x-c.x,S.z-c.z);
      if(!c.cleared)c.beam.visible=d<320;if(c.halo)c.halo.scale.setScalar(1+Math.sin(t/300+c.x)*.06);
      if(!c.seen&&d<140){c.seen=true;if(WS.ready()&&WS.addToSet('seen',c.id)){WS.log('spot',c.id,{text:'Spotted an abandoned camp on '+c.name,icon:'⛺',x:c.x,z:c.z});banner('An abandoned camp… something to dig, mine and mend','⛺ SPOTTED')}}}
    if(!pre)for(const c of camps)if(Math.hypot(S.x-c.x,S.z-c.z)<220){pre=true;safe(()=>VerbAnims.load().catch(()=>{}));break} // fetch the clips before you need them
    cur=null;
    if(W)cur=W.it;
    else{let best=1e9;for(const it of items){if(it.done)continue;const d=near(it);if(d<it.r&&d<best&&Math.abs(S.y-it.y)<3){best=d;cur=it}}}
    for(const it of items)if(!it.done&&it.prog>0&&!(W&&W.it===it))it.prog=Math.max(0,it.prog-dt*.25);
    if(!others.size)pw.clear();else for(const [k,v] of pw)if(t-v.t>9000)pw.delete(k);
    const id=Interaction.current();
    if(cur&&id&&id.indexOf('verb:')===0){const l=labelFor(cur);if($('use').textContent!==l)$('use').textContent=l}
    if(W)work(dt);else if(bar&&bar.style.display!=='none')hideBar();
  }

  // ---- lifecycle ---------------------------------------------------------------------------
  function build(){ // synchronous, right after buildWorld(): props appear in their "todo" state
    if(built)return;built=true;
    const mk=(name,key,cx,cz,rmin,rmax)=>{const st=Sites.find({tag:'camp',key,name,cx,cz,rmin,rmax,clear:5,sameSep:CAMP.minSep});if(st)makeCamp(name,key,st)};
    mk('the main island','main0',0,0,55,175);mk('the main island','main1',0,0,55,175);
    for(const I of ISL){if(CAMP.skip.includes(I.n))continue;
      for(let i=0;i<CAMP.perIsland;i++)mk(I.n,I.n.replace(/\W+/g,'').toLowerCase()+i,I.x,I.z,0,I.R*.75)}
    for(const k of Object.keys(VERBS))
      Interaction.register('verb:'+k,VERBS[k].label,()=>!!cur&&cur.verb===k&&S.grounded&&!S.flying,activate);
    Systems.add('verbs',frame);
  }
  function start(){ // after WorldState is ready: restore what was already done, then listen
    if(started)return;started=true;
    sync(false);restoreSeen();
    Net.on('vw',(d,from)=>{if(!d)return;
      if(d.on){pw.set(d.id,{from,t:performance.now()});
        safe(()=>VerbAnims.load().then(()=>{const o=others.get(from),it=byId.get(d.id); // their 'em' may have beaten the clip download: replay it now
          if(o&&it&&pw.has(d.id)&&!o.group.userData.hold)o.group.userData.emoteReq=VERBS[it.verb].emote}).catch(()=>{}))}
      else{pw.delete(d.id);const o=others.get(from);if(o)safe(()=>emoStop(o.group.userData))}});
    WS.onChange((k,v,remote)=>{if(k==='done'||k==='*')sync(!!remote);if(k==='seen'||k==='*')restoreSeen()});
  }
  function restoreSeen(){const s=WS.getSet('seen');for(const c of camps)if(s.includes(c.id))c.seen=true}
  const places=()=>camps.filter(c=>c.seen).map(c=>({n:'Camp · '+c.name,x:c.x,z:c.z,y:c.y,r:6,icon:c.cleared?'🏕️':'⛺'}));
  function tp(i){const c=camps[i||0];if(!c||!S)return false;S.x=c.x+5;S.z=c.z+5;S.y=H(S.x,S.z)+.5;S.vy=0;S.flying=false;return c.name} // dev helper: Verbs.tp(0)
  return {build,start,places,tp,camps:()=>camps,items:()=>items,_frame:frame};
})();
