// Monster: the KRAKEN. A sea monster that rises near your galleon: a big head in the water and six tentacles that wave about, then rear up and SLAM the deck (a red ring shows where, you can dodge),
// and hold on for a few seconds. Fight it with cannons (the head is the weak point, balls that hit a tentacle hurt that tentacle), and with the cutlass: lock on (🎯) a tentacle while it is stuck on your deck and slash it
// off. Sever them all, shoot the head down and it sinks with a big pile of coins. Severed tentacles regrow while the head lives.
//  - HOST simulates it (like the fleet); 8 Hz snapshots on Net 'flt' (k:'mo'); guests mirror and animate. Hits on YOU are decided by the host and applied by you (every client hurts only itself).
//  - Pure helpers for tests: tentacle(), segments(), the state machine runs in step() with no THREE needed (rendering is skipped when there is no scene).
// Globals at runtime: THREE, S, scene, H, Net, Systems, Fleet, Ship, Decks, SHIP, Ocean, WaterFX, WAudio, myId, others, banner, Outlaw (coins), LockOn.
const Monster=(()=>{
  const C=SHIP,SEA=C.sea,NT=6,SEG=9,HEAD_R=3.4,LEN=30,HP_HEAD=420,HP_TEN=90,IDLE=0,WIND=1,SLAM=2,STUCK=3,BACK=4,SEV=5;
  const R=Math.random,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
  let m=null,built=false,spawnT=70,snapT=0,inst=null,head=null,eyes=[],rings=[],mat=null,flash=0,seq=1,sayT=0;
  const isHost=()=>typeof Fleet!=='undefined'&&Fleet.isHost();
  const players=()=>{const a=[{id:myId,x:S.x,y:S.y,z:S.z}];if(typeof others!=='undefined')for(const [id,o] of others)if(o.group)a.push({id,x:o.group.position.x,y:o.group.position.y,z:o.group.position.z});return a};
  const seaY=(x,z)=>SEA+(typeof Ocean!=='undefined'?Ocean.height(x,z,Date.now()/1000):0);

  // ---------- creation ----------
  function tentacle(i){return {a:i/NT*Math.PI*2+.3,st:IDLE,T:0,hp:HP_TEN,max:HP_TEN,tx:0,ty:0,tz:0,px:0,py:0,pz:0,tg:null,cd:2+i*.9,regrow:0,hitT:0,sway:R()*6.28}}
  function make(x,z,id){
    const o={id:id||('k'+(seq++)),x,z,rise:0,hp:HP_HEAD,max:HP_HEAD,dead:false,deadT:0,t:0,ang:R()*6.28,ten:[],hitT:0,snap:null,vx:0,vz:0};
    for(let i=0;i<NT;i++){const t=tentacle(i);const b=base(o,t);t.px=b.x+Math.cos(t.a)*6;t.py=SEA+4;t.pz=b.z+Math.sin(t.a)*6;o.ten.push(t)}
    return o}
  const base=(o,t,out)=>{out=out||{x:0,y:0,z:0};out.x=o.x+Math.cos(t.a)*2.7;out.z=o.z+Math.sin(t.a)*2.7;out.y=seaY(out.x,out.z)+.2;return out};
  const headPos=o=>({x:o.x,y:seaY(o.x,o.z)+HEAD_R*.55*o.rise-1.2,z:o.z});
  function spawn(x,z){if(m)return m;
    if(x===undefined){const v=Ship.vessel(),p=v.pose;for(let i=0;i<30;i++){const a=p.h+(R()<.5?1:-1)*(.9+R()*.6),d=48+R()*18;x=p.x+Math.sin(a)*d;z=p.z+Math.cos(a)*d;if(H(x,z)<-8)break;x=undefined}
      if(x===undefined)return null}
    m=make(x,z);Net.emit('flt',{k:'mb',id:m.id,x:+x.toFixed(1),z:+z.toFixed(1)});banner('Something huge stirs beneath the waves…','🐙 KRAKEN');return m}
  function drop(){if(m){m=null}if(inst)inst.visible=false;if(head)head.visible=false;for(const r of rings)r.visible=false}

  // ---------- host simulation ----------
  const _b={x:0,y:0,z:0};
  function think(o,dt){
    o.t+=dt;o.hitT=Math.max(0,o.hitT-dt);const sh=Ship.vessel().pose;
    if(o.dead){o.deadT+=dt;o.rise=Math.max(0,o.rise-dt*.35);if(o.deadT>7)return false;return true}
    o.rise=Math.min(1,o.rise+dt*.3);
    // stay beside the ship: orbit it at ~20 m, slowly; give up if you outrun it
    const dx=o.x-sh.x,dz=o.z-sh.z,D=Math.hypot(dx,dz);
    if(D>130){banner('The kraken sinks back into the deep…','🐙 KRAKEN');Net.emit('flt',{k:'mx'});return false}
    o.ang+=dt*.07;const tx=sh.x+Math.cos(o.ang)*21,tz=sh.z+Math.sin(o.ang)*21,ex=tx-o.x,ez=tz-o.z,L=Math.hypot(ex,ez)||1,sp=Math.min(9,L*.6);
    const nx=o.x+ex/L*sp*dt,nz=o.z+ez/L*sp*dt;if(H(nx,nz)<-4){o.x=nx;o.z=nz}
    // tentacles
    const P=players().filter(p=>!(p.id===myId&&typeof Fleet!=='undefined'&&Fleet._me.down>0)),busy=o.ten.filter(t=>t.st===WIND||t.st===SLAM||t.st===STUCK).length,maxBusy=o.ten.filter(t=>t.st!==SEV).length<=3?2:3;let nb=busy;
    for(let i=0;i<NT;i++){const t=o.ten[i];t.hitT=Math.max(0,t.hitT-dt);t.T+=dt;base(o,t,_b);
      if(t.st===SEV){t.regrow-=dt;if(t.regrow<=0){t.st=IDLE;t.hp=t.max;t.cd=3;t.T=0;t.px=_b.x;t.py=_b.y;t.pz=_b.z}continue}
      if(t.st===IDLE||t.st===BACK){
        const wx=_b.x+Math.cos(t.a)*(9+3*Math.sin(o.t*.7+t.sway)),wz=_b.z+Math.sin(t.a)*(9+3*Math.sin(o.t*.7+t.sway)),wy=seaY(wx,wz)+5.5+2*Math.sin(o.t*1.1+t.sway*2);
        ease(t,wx,wy,wz,t.st===BACK?12:5,dt);if(t.st===BACK&&Math.hypot(t.px-wx,t.pz-wz)<2){t.st=IDLE;t.T=0}
        t.cd-=dt;
        if(t.st===IDLE&&t.cd<=0&&nb<maxBusy){
          let tg=null,td=1e9;for(const p of P){const d=Math.hypot(p.x-_b.x,p.z-_b.z);if(d<td&&d<LEN-3&&p.y>SEA-2.5){td=d;tg=p}}
          if(tg){t.st=WIND;t.T=0;t.tg=tg.id;t.tx=tg.x;t.ty=tg.y;t.tz=tg.z;nb++;Net.emit('flt',{k:'mw',i,x:+tg.x.toFixed(1),y:+tg.y.toFixed(1),z:+tg.z.toFixed(1)})}else t.cd=1}
      }else if(t.st===WIND){
        if(t.T<.75){const p=P.find(q=>q.id===t.tg);if(p){t.tx=p.x;t.ty=p.y;t.tz=p.z}}               // tracks you, then commits: the last third of a second is dodgeable
        ease(t,t.tx,t.ty+7,t.tz,15,dt);
        if(t.T>=1.15){t.st=SLAM;t.T=0}
      }else if(t.st===SLAM){
        ease(t,t.tx,t.ty+.15,t.tz,60,dt);
        if(Math.hypot(t.px-t.tx,t.pz-t.tz)<.6&&Math.abs(t.py-(t.ty+.15))<.8||t.T>.45){impact(o,t,i);t.st=STUCK;t.T=0}
      }else if(t.st===STUCK){
        t.px=t.tx;t.py=t.ty+.15;t.pz=t.tz;
        if(t.T>3.4){t.st=BACK;t.T=0;t.cd=1.8+R()*2.4}}
    }
    return true}
  // move the tip toward a point at speed v (m/s)
  function ease(t,x,y,z,v,dt){const dx=x-t.px,dy=y-t.py,dz=z-t.pz,d=Math.hypot(dx,dy,dz)||1,s=Math.min(d,v*dt);t.px+=dx/d*s;t.py+=dy/d*s;t.pz+=dz/d*s}
  // a tentacle lands: ring of spray, everybody near is hit (each client hurts only itself), a deck takes hull damage
  function impact(o,t,i){
    const x=t.px,y=t.py,z=t.pz;Net.emit('flt',{k:'ms',i,x:+x.toFixed(1),y:+y.toFixed(1),z:+z.toFixed(1)});slamFx(x,y,z);
    const dmg=Math.round(16+R()*6);
    for(const p of players()){if(Math.hypot(p.x-x,p.z-z)<2.6&&Math.abs(p.y-y)<3&&p.id===myId)hit(dmg,x,z)}
    shipHit(x,y,z)}
  // a tentacle landed ON the deck (not in the water): the hull takes damage (every client runs this; only the ship's authority applies it)
  function shipHit(x,y,z){const dk=Decks.get('ship');if(dk){const l=Decks.toLocal(dk,x,y,z,{}),f=Decks.floor(dk,l.x,l.z);if(f>=0&&Math.abs(l.y-f)<2.5)Ship.damage(9)}}
  function hit(d,x,z){try{Fleet.hurtMe(d,x,z)}catch(e){}}
  function slamFx(x,y,z){try{WaterFX.splash(x,z,1.2)}catch(e){}try{Fx.burst(x,y+.4,z,'#cfe9ff',10);Fx.burst(x,y+.3,z,'#7a4a96',6)}catch(e){}try{if(typeof boomSfx==='function')boomSfx(x,z,.9)}catch(e){}}

  // ---------- being hurt ----------
  // part: 'h' head | 0..5 tentacle. Anyone may call it; the host applies, guests ask the host.
  function damage(part,d){
    if(!m||m.dead)return;if(!isHost()){Net.emit('flt',{k:'md',p:part,d});flashHit(part);return}
    if(part==='h'){m.hp-=d;m.hitT=.2;if(m.hp<=0)die()}
    else{const t=m.ten[part];if(!t||t.st===SEV)return;t.hp-=d*(t.st===STUCK?1.5:1);t.hitT=.2;
      if(t.hp<=0){t.st=SEV;t.regrow=22;t.hp=0;Net.emit('flt',{k:'mv',i:part});sever(t)}}}
  function flashHit(part){if(!m)return;if(part==='h')m.hitT=.2;else if(m.ten[part])m.ten[part].hitT=.2}
  function sever(t){try{Fx.burst(t.px,t.py+.5,t.pz,'#7a4a96',14);WaterFX.splash(t.px,t.pz,1.1)}catch(e){}}
  function die(){
    m.dead=true;m.deadT=0;for(const t of m.ten)if(t.st!==SEV){t.st=SEV;t.regrow=1e9}
    const c=450+Math.round(R()*250);Net.emit('flt',{k:'mk',c});reward(c)}
  function reward(c){try{if(typeof Outlaw!=='undefined'&&Outlaw.earn)Outlaw.earn(c)}catch(e){}banner('THE KRAKEN SINKS! +'+c+' 🪙','🐙 KRAKEN')}
  // a cannon ball (shooter side): is it inside the head or touching a tentacle? -> {id:'m',r:{kind:'monster'}} (damage already sent)
  function shellHit(s){
    if(!m||m.dead)return null;const hp=headPos(m),dh=Math.hypot(s.x-hp.x,s.y-hp.y,s.z-hp.z);
    if(dh<HEAD_R+.4&&s.y>SEA-1.2){damage('h',Math.round((s.dmg||24)*2.4));return {id:'m',r:{kind:'monster'}}}
    for(let i=0;i<NT;i++){const t=m.ten[i];if(t.st===SEV)continue;base(m,t,_b);const pts=curve(m,t);for(let k=1;k<pts.length;k++){const q=pts[k];if(Math.hypot(s.x-q.x,s.y-q.y,s.z-q.z)<1.25){damage(i,Math.round((s.dmg||24)*1.4));return {id:'m',r:{kind:'monster'}}}}}
    return null}
  // nearest hittable thing in sword reach of (x,z): {part,x,y,z} (tentacle tips that are down on the deck)
  function meleeTarget(x,y,z,range){
    if(!m||m.dead)return null;let best=null,bd=range;
    for(let i=0;i<NT;i++){const t=m.ten[i];if(t.st!==STUCK&&t.st!==SLAM)continue;const d=Math.hypot(t.px-x,t.pz-z);if(d<bd&&Math.abs(t.py-y)<3){bd=d;best={part:i,x:t.px,y:t.py,z:t.pz}}}
    return best}

  // ---------- shape (shared by every client: tentacles are a curve from the base to the tip) ----------
  const _c=[];for(let i=0;i<=SEG;i++)_c.push({x:0,y:0,z:0});
  function curve(o,t){
    base(o,t,_b);const bx=_b.x,by=_b.y,bz=_b.z,tx=t.px,ty=t.py,tz=t.pz,mx=(bx+tx)/2,mz=(bz+tz)/2,reach=Math.hypot(tx-bx,tz-bz),
      lift=t.st===STUCK?2.5:(t.st===SLAM?3:5+reach*.18),my=Math.max(by,ty)+lift;
    for(let i=0;i<=SEG;i++){const u=i/SEG,a=(1-u)*(1-u),b=2*u*(1-u),c=u*u,p=_c[i];
      p.x=a*bx+b*mx+c*tx;p.z=a*bz+b*mz+c*tz;p.y=a*by+b*my+c*ty;
      if(t.st!==STUCK){const w=Math.sin(u*Math.PI)*.9;p.x+=Math.cos(t.sway+o.t*1.3+u*4)*w;p.z+=Math.sin(t.sway*1.3+o.t*1.1+u*4)*w}}
    return _c}

  // ---------- visuals ----------
  const _M=typeof THREE!=='undefined'?{m:new THREE.Matrix4(),q:new THREE.Quaternion(),p:new THREE.Vector3(),s:new THREE.Vector3(),u:new THREE.Vector3(0,1,0),d:new THREE.Vector3(),c:new THREE.Color()}:null;
  function buildVis(){
    if(inst||typeof THREE==='undefined'||typeof scene==='undefined')return;
    mat=new THREE.MeshStandardMaterial({color:'#5b3278',roughness:.55,metalness:.05,emissive:'#000000'});
    const cg=new THREE.CylinderGeometry(1,1.25,1,8,1);inst=new THREE.InstancedMesh(cg,mat,NT*SEG);inst.frustumCulled=false;inst.castShadow=false;scene.add(inst);
    head=new THREE.Group();const hs=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),mat);hs.scale.set(HEAD_R,HEAD_R*.9,HEAD_R*1.15);head.add(hs);
    const em=new THREE.MeshBasicMaterial({color:'#ffd23a'});for(const sd of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(.5,10,8),em);e.position.set(sd*1.5,.9,HEAD_R*1.05);e.scale.set(1,1.2,.6);head.add(e);eyes.push(e)}
    const brow=new THREE.Mesh(new THREE.ConeGeometry(.9,1.6,8),new THREE.MeshStandardMaterial({color:'#2a1538',roughness:.7}));brow.position.set(0,-.5,HEAD_R*1.2);brow.rotation.x=Math.PI/2;head.add(brow);
    scene.add(head);
    for(let i=0;i<NT;i++){const r=new THREE.Mesh(new THREE.RingGeometry(.9,1.45,28),new THREE.MeshBasicMaterial({color:'#ff3030',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));r.rotation.x=-Math.PI/2;r.visible=false;r.renderOrder=5;scene.add(r);rings.push(r)}}
  function render(dt){
    if(!m){if(inst)inst.visible=false;if(head)head.visible=false;for(const r of rings)r.visible=false;return}
    buildVis();if(!inst)return;inst.visible=true;head.visible=true;
    const hp=headPos(m);head.position.set(hp.x,hp.y,hp.z);const sh=Ship.vessel().pose;head.rotation.y=Math.atan2(sh.x-m.x,sh.z-m.z);head.rotation.x=m.dead?.4*Math.min(1,m.deadT/2):0;
    for(const e of eyes)e.visible=!m.dead;
    mat.emissive.setRGB(m.hitT>0?.7:0,m.hitT>0?.1:0,m.hitT>0?.1:0);
    let n=0;
    for(let i=0;i<NT;i++){const t=m.ten[i],ring=rings[i];
      const sev=t.st===SEV;ring.visible=!sev&&(t.st===WIND);if(ring.visible){const k=clamp(t.T/1.15,0,1);ring.position.set(t.tx,t.ty+.12,t.tz);ring.scale.setScalar(1.5-.5*k);ring.material.opacity=.35+.6*k}
      const pts=curve(m,t);
      for(let k=0;k<SEG;k++){const a=pts[k],b=pts[k+1];_M.d.set(b.x-a.x,b.y-a.y,b.z-a.z);const L=_M.d.length()||.01;_M.d.multiplyScalar(1/L);
        _M.q.setFromUnitVectors(_M.u,_M.d);const u=k/SEG,rad=sev?.001:(.95*(1-u*.88)+.1)*(t.hitT>0?1.12:1);
        _M.p.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);_M.s.set(rad,L*1.02,rad);_M.m.compose(_M.p,_M.q,_M.s);inst.setMatrixAt(n++,_M.m)}}
    inst.instanceMatrix.needsUpdate=true}

  // ---------- per frame ----------
  function step(dt){
    if(!built)return;
    if(isHost()){
      if(!m){spawnT-=dt*(1+2*(typeof Env!=='undefined'&&Env.state&&Env.state.wx?Env.state.wx.storm||0:0));
        if(spawnT<=0){const ok=Ship.vessel()&&Ship.vessel().pose&&Math.hypot(Ship.vessel().pose.x-DOCK.ship.x,Ship.vessel().pose.z-DOCK.ship.z)>140&&(typeof Fleet.ships==='undefined'||Fleet.ships.size<2);
          spawnT=ok&&spawn()?(240+R()*200):12}}
      else{if(!think(m,dt)){drop();spawnT=200+R()*200}
        snapT-=dt;if(m&&snapT<=0){snapT=.125;Net.emit('flt',{k:'mo',a:snapshot()})}}}
    else if(m&&m.snap){const k=1-Math.exp(-10*dt),s=m.snap;m.x+=(s[0]-m.x)*k;m.z+=(s[1]-m.z)*k;m.rise+=(s[2]-m.rise)*k;m.t+=dt;m.hitT=Math.max(0,m.hitT-dt);
      const kt=Math.min(1,k*1.3);for(let i=0;i<NT;i++){const t=m.ten[i],r=s[5+i];t.hitT=Math.max(0,t.hitT-dt);if(!r)continue;t.st=r[0];t.px+=(r[1]-t.px)*kt;t.py+=(r[2]-t.py)*kt;t.pz+=(r[3]-t.pz)*kt;t.tx=r[4];t.ty=r[5];t.tz=r[6];t.hp=r[7];t.T+=dt}
      if(m.dead)m.deadT+=dt;if(m.dead&&m.deadT>7)drop()}
    render(dt)}
  function snapshot(){const o=m,a=[+o.x.toFixed(1),+o.z.toFixed(1),+o.rise.toFixed(2),Math.round(o.hp),o.dead?1:0];for(const t of o.ten)a.push([t.st,+t.px.toFixed(1),+t.py.toFixed(1),+t.pz.toFixed(1),+t.tx.toFixed(1),+t.ty.toFixed(1),+t.tz.toFixed(1),Math.round(t.hp)]);return a}
  function onNet(d){
    if(!d)return;
    switch(d.k){
      case 'mb':{if(isHost())break;m=make(d.x,d.z,d.id);m.rise=.3;banner('Something huge stirs beneath the waves…','🐙 KRAKEN');break}
      case 'mx':{if(!isHost())drop();break}
      case 'mo':{if(isHost())break;const a=d.a;if(!m){m=make(a[0],a[1]);m.rise=a[2]}m.snap=a;m.hp=a[3];if(a[4]&&!m.dead){m.dead=true;m.deadT=0}break}
      case 'ms':{slamFx(d.x,d.y,d.z);shipHit(d.x,d.y,d.z);break}
      case 'mv':{if(!isHost()&&m){const t=m.ten[d.i];if(t){t.st=SEV;sever(t)}}break}
      case 'md':{if(isHost())damage(d.p,d.d);break}
      case 'mk':{if(!isHost()){if(m){m.dead=true;m.deadT=0}reward(d.c)}break}
    }}
  function build(){
    if(built)return;built=true;Net.on('flt',onNet);Systems.add('monster',step);
    if(typeof LockOn!=='undefined')LockOn.source('monster',()=>{if(!m||m.dead)return null;const a=[],hp=headPos(m);
      a.push({id:'mh',x:hp.x,y:hp.y,z:hp.z,lift:1.5,hp:m.hp,max:m.max,cap:1});
      for(let i=0;i<NT;i++){const t=m.ten[i];if(t.st===SEV||t.st===IDLE||t.st===BACK)continue;a.push({id:'mt'+i,mon:i,x:t.px,y:t.py,z:t.pz,lift:.6,hp:t.hp,max:t.max,melee:(d)=>damage(i,d)})}return a});
    try{const q=new URLSearchParams(location.search);if(q.get('kraken'))spawnT=+q.get('kraken')||5}catch(e){}}
  return {build,spawn,damage,shellHit,meleeTarget,step,think,make,onNet,snapshot,curve,get:()=>m,drop,NT,SEG,HEAD_R,LEN,ST:{IDLE,WIND,SLAM,STUCK,BACK,SEV},_set:o=>{m=o},_ease:ease};
})();
