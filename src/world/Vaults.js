// Vaults: ancient sealed chests that need BOTH of you. One per island (data/puzzles.js).
//   plates: two pressure plates ~22 m apart; both must be held at once (Link.both).
//   shrine: a shrine you both call at the same moment (Link.sync) - you have to say "now!".
// Placement/state/reward machinery mirrors Verbs: seeded sites (Sites), done-set in WorldState
// ('solved'), seeded rewards (Seeded), journal entries, silent restore for late joiners.
// Globals: S, me, others, scene, H, ISL, roomCode, banner, chime, playEmote, Interaction, THREE,
//   Net, WS, Systems, Fx, Sites, Seeded, Link, VerbAnims, VAULT, VLOOT, hashSeed, mulberry.
const Vaults=(()=>{
  const list=[],byId=new Map();let curShrine=null,pre=false,hintAt=0,built=false,started=false;
  const mat=Fx.mat,M=Fx.M,safe=f=>{try{return f()}catch(e){return false}};
  const CYAN='#7fd8ff';
  const glowMat=(c,i)=>new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:i,roughness:.4});

  // local (a,b) in the vault's frame -> world x,z  (three.js rotation.y convention)
  const toWorld=(v,a,b)=>({x:v.x+a*Math.cos(v.ry)+b*Math.sin(v.ry),z:v.z-a*Math.sin(v.ry)+b*Math.cos(v.ry)});
  const landOK=(v,p)=>{const h=H(p.x,p.z);return h>.5&&Math.abs(h-v.y)<2.5};

  function make(name,key,site){
    let kind=mulberry(hashSeed(roomCode+':vk:'+key))()<.5?'plates':'shrine';
    const v={id:'vault:'+key,key,name,kind,x:site.x,z:site.z,y:site.y,ry:site.ry,solved:false,open:0,p:0,lonely:0,seen:false,glow:0};
    // plates need two flat, dry spots on opposite sides; try shrinking/rotating, else fall back to a shrine
    if(kind==='plates'){
      let found=false;
      for(let rot=0;rot<4&&!found;rot++)for(const gap of [VAULT.plates.gap,9,7]){
        const ry=site.ry+rot*Math.PI/2;const t={x:v.x,z:v.z,y:v.y,ry};
        const A=toWorld(t,-gap,0),B=toWorld(t,gap,0);
        if(landOK(v,A)&&landOK(v,B)){v.ry=ry;v.gap=gap;found=true;break}
      }
      if(!found)kind=v.kind='shrine';
    }
    const g=new THREE.Group();g.position.set(v.x,v.y,v.z);g.rotation.y=v.ry;scene.add(g);v.group=g;
    // chest with a hinged lid
    g.add(M(new THREE.BoxGeometry(1.5,.8,1),mat('#6b4a2a'),0,.4,0));
    const band=M(new THREE.BoxGeometry(1.56,.12,1.06),mat('#d9b95a'),0,.55,0);g.add(band);
    const lid=new THREE.Group();lid.position.set(0,.8,-.5);g.add(lid);v.lid=lid;
    lid.add(M(new THREE.BoxGeometry(1.5,.3,1),mat('#7b5535'),0,.15,.5),M(new THREE.BoxGeometry(1.56,.1,1.06),mat('#d9b95a'),0,.2,.5));
    // sealing field + two glowing pillars
    v.field=new THREE.Mesh(new THREE.CylinderGeometry(1.9,1.9,2.8,16,1,true),new THREE.MeshBasicMaterial({color:CYAN,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide}));
    v.field.position.y=1.4;g.add(v.field);
    v.caps=[];
    for(const sx of [-1,1]){g.add(M(new THREE.CylinderGeometry(.35,.45,3.4,8),mat('#8d949e'),sx*2.7,1.7,0));
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.4,10,8),glowMat(CYAN,.4));cap.position.set(sx*2.7,3.7,0);g.add(cap);v.caps.push(cap)}
    // faint beacon until opened
    v.beam=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,26,8,1,true),new THREE.MeshBasicMaterial({color:CYAN,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide,fog:false}));
    v.beam.position.y=13;g.add(v.beam);

    if(kind==='plates'){
      v.rings=[];v.zones=[];
      for(const sx of [-1,1]){
        const w=toWorld(v,sx*v.gap,0),py=H(w.x,w.z),pg=new THREE.Group();pg.position.set(sx*v.gap,py-v.y+.09,0);g.add(pg);
        pg.add(M(new THREE.CylinderGeometry(1.7,1.8,.18,18),mat('#59616b'),0,0,0));
        const ring=new THREE.Mesh(new THREE.RingGeometry(1.0,1.45,28),new THREE.MeshBasicMaterial({color:CYAN,transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false}));
        ring.rotation.x=-Math.PI/2;ring.position.y=.11;pg.add(ring);v.rings.push(ring);
        v.zones.push({x:w.x,z:w.z,y:py,r:VAULT.plates.r});
      }
      Link.both({zones:v.zones,holdMs:VAULT.plates.holdMs,
        when:()=>!v.solved&&Math.hypot(S.x-v.x,S.z-v.z)<(v.gap||11)+60,
        onProgress:(p,occ,dt)=>{v.p=p;v.rings.forEach((r,i)=>{r.material.opacity=occ[i]?1:.3});const n=occ.filter(Boolean).length;v.lonely=n===1?v.lonely+dt:0},
        onDone:g=>solve(v,g)});
    }else{
      const w=toWorld(v,0,-6.5);let sy=H(w.x,w.z);if(!(sy>.5)){const w2=toWorld(v,0,6.5);if(H(w2.x,w2.z)>.5){w.x=w2.x;w.z=w2.z;sy=H(w2.x,w2.z)}else{w.x=v.x+5;w.z=v.z;sy=v.y}}
      const sg=new THREE.Group();sg.position.set(0,0,0);scene.add(sg);sg.position.set(w.x,sy,w.z);v.shrine={x:w.x,z:w.z,y:sy,r:VAULT.shrine.r};
      sg.add(M(new THREE.BoxGeometry(1.4,.4,1.4),mat('#59616b'),0,.2,0),M(new THREE.BoxGeometry(.7,2.6,.7),mat('#8d949e'),0,1.7,0));
      v.orb=new THREE.Mesh(new THREE.SphereGeometry(.5,12,10),glowMat(CYAN,.6));v.orb.position.y=3.4;sg.add(v.orb);v.shrineGroup=sg;
      Link.sync({id:v.id,windowMs:VAULT.shrine.windowMs,onPress:()=>{v.glow=1},onDone:()=>solve(v)});
    }
    list.push(v);byId.set(v.id,v);return v;
  }

  // ---- state -------------------------------------------------------------------------------
  const partnerName=()=>{const o=others&&others.size?others.values().next().value:null;return(o&&o.group.userData.nm)||'Your partner'};
  function applyDone(v,o){
    if(v.solved)return;v.solved=true;
    v.field.visible=false;v.beam.visible=false;v.caps.forEach(c=>c.material.emissiveIntensity=2.2);
    if(v.rings)v.rings.forEach(r=>r.material.opacity=1);
    if(o.fx){Fx.burst(v.x,v.y,v.z,'#bff0ff',28);if(!o.mine)banner(partnerName()+' opened the vault!','🗝️ TOGETHER')}
  }
  function grant(v){
    const L=Seeded.pick(VLOOT,v.id),text='Opened the ancient vault on '+v.name+' and found '+L.n+(L.rare?' ✨ (rare!)':'');
    WS.addToSet('loot',v.id+':'+L.id);WS.log('vault',v.id,{text,icon:L.ic,x:v.x,z:v.z});
    Fx.burst(v.x,v.y+1,v.z,'#ffe08a',26);banner(text,'🗝️ VAULT OPENED');safe(()=>chime());
  }
  function solve(v,g){
    if(v.solved)return;
    // Safety net: a vault needs BOTH of you. Link already refuses to complete without a connected partner, but if anything
    // ever gets through (a rare self-solve was seen once in headless testing, cause unknown) it must not reward a solo
    // player. Refuse, say why in the console once (so the cause can be found), and re-arm the puzzle.
    if(!(others&&others.size)){
      if(!v.warned){v.warned=true;console.warn('[Vaults] refused to open '+v.id+' ('+v.kind+') with no partner connected',g?{t:g.t,occ:g.occ,zones:g.zones&&g.zones.length}:'(shrine)')}
      if(g){g.done=false;g.t=0}else Link.rearm(v.id);
      return;
    }
    applyDone(v,{fx:true,mine:true});
    const first=WS.ready()?WS.addToSet('solved',v.id):true;
    if(first)grant(v);
  }
  function sync(withFx){for(const id of WS.getSet('solved')){const v=byId.get(id);if(v&&!v.solved)applyDone(v,{fx:withFx,mine:false})}}
  function restoreSeen(){const s=WS.getSet('seen');for(const v of list)if(s.includes(v.id))v.seen=true}

  // ---- shrine press ------------------------------------------------------------------------
  function callShrine(){
    Promise.resolve().then(()=>{if(me)me.userData.emote=null});    // doUse() adds a generic overlay; the shrine plays its own
    const v=curShrine;if(!v)return;
    if(typeof playEmote==='function')VerbAnims.load().then(()=>playEmote('cast')).catch(()=>{});
    const r=Link.press(v.id),t=performance.now();
    if(!r.done&&t>hintAt){hintAt=t+8000;banner('The shrine hums… your partner has to call at the very same moment','🤝 SAY "NOW!"')}
  }

  // ---- per-frame ---------------------------------------------------------------------------
  function frame(dt,t){
    if(!built||!S||!me)return;
    curShrine=null;let best=1e9;
    for(const v of list){
      const d=Math.hypot(S.x-v.x,S.z-v.z);
      if(!pre&&d<220){pre=true;safe(()=>VerbAnims.load().catch(()=>{}))}
      if(!v.solved)v.beam.visible=d<320;
      if(!v.seen&&d<140){v.seen=true;if(WS.ready()&&WS.addToSet('seen',v.id)){WS.log('spot',v.id,{text:'Spotted an ancient vault on '+v.name,icon:'🗝️',x:v.x,z:v.z});
        banner(v.kind==='plates'?'A sealed vault… two glowing plates, far apart':'A sealed vault… and a humming shrine nearby','🗝️ SPOTTED')}}
      if(v.solved&&v.open<1){v.open=Math.min(1,v.open+dt*1.3);v.lid.rotation.x=-v.open*1.9}
      if(!v.solved&&d<90){
        const pulse=.4+Math.sin(t/260+v.x)*.15;
        v.caps.forEach(c=>c.material.emissiveIntensity=pulse+v.p*2);
        v.field.material.opacity=.28-v.p*.12;
        if(v.orb){v.glow=Math.max(0,v.glow-dt*1.4);v.orb.material.emissiveIntensity=.6+v.glow*3.2+Math.sin(t/200)*.15;v.orb.scale.setScalar(1+v.glow*.35)}
        if(v.kind==='plates'&&v.lonely>1.5&&t>hintAt){hintAt=t+30000;v.lonely=0;banner('The vault hums… it needs a second plate held at the same time','🤝 TOGETHER')}
      }
      if(v.shrine&&!v.solved&&S.grounded&&!S.flying){const dd=Math.hypot(S.x-v.shrine.x,S.z-v.shrine.z);if(dd<v.shrine.r&&dd<best){best=dd;curShrine=v}}
    }
  }

  // ---- lifecycle ---------------------------------------------------------------------------
  function build(){
    if(built)return;built=true;
    const mk=(name,key,cx,cz,rmin,rmax)=>{const st=Sites.find({tag:'vault',key,name,cx,cz,rmin,rmax,clear:VAULT.clear,sep:VAULT.sep});if(st)make(name,key,st)};
    for(let i=0;i<VAULT.main;i++)mk('the main island','main'+i,0,0,60,175);
    for(const I of ISL){if(VAULT.skip.includes(I.n))continue;
      for(let i=0;i<VAULT.perIsland;i++)mk(I.n,I.n.replace(/\W+/g,'').toLowerCase()+i,I.x,I.z,0,I.R*.7)}
    Interaction.register('vault:shrine','🔮 Call',()=>!!curShrine,callShrine);
    Systems.add('vaults',frame);
  }
  function start(){
    if(started)return;started=true;sync(false);restoreSeen();
    WS.onChange((k,v,remote)=>{if(k==='solved'||k==='*')sync(!!remote);if(k==='seen'||k==='*')restoreSeen()});
  }
  const unseen=()=>list.filter(v=>!v.seen).map(v=>({id:v.id,name:v.name,x:v.x,z:v.z,y:v.y,what:'a sealed vault'}));
  function reveal(id,how){const v=byId.get(id);if(!v||v.seen)return false;v.seen=true;
    if(WS.ready()&&WS.addToSet('seen',v.id))WS.log('spot',v.id,{text:how||('Heard about a sealed vault on '+v.name),icon:'🗝️',x:v.x,z:v.z});return true}
  const places=()=>list.filter(v=>v.seen).map(v=>({n:'Vault · '+v.name,x:v.x,z:v.z,y:v.y,r:6,icon:v.solved?'✅':'🗝️'}));
  const tp=i=>{const v=list[i||0];if(!v||!S)return false;S.x=v.x+4;S.z=v.z+4;S.y=H(S.x,S.z)+.5;S.vy=0;S.flying=false;return v.name+' ('+v.kind+')'}; // dev helper: Vaults.tp(0)
  return {build,start,places,tp,unseen,reveal,vaults:()=>list,_frame:frame};
})();
