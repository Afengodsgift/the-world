// Crew: the pirates standing on the enemy decks: cutlass fighters, pistol and musket shooters and the named captain. They are real bodies on real decks: they walk with the SAME controller as you (Decks.step: stairs, rails, carried by the ship),
// chase you across the rails when you board, swing cutlasses, shoot, and fall when you beat them. Beat the captain and the ship surrenders (it sinks, the loot is yours); sink the ship and the crew goes down with it.
//  - HOST simulates them (spawned by Fleet when a ship appears) and streams 8 Hz snapshots (Fleet.snapshot carries them); guests mirror and animate.
//  - Hits on YOU are decided by the host but applied by you ('cm' melee / 'cs' shot messages): every client hurts only itself.
//  - Your attacks: the Slash button (cutlass combo) and any gun you carry (Outlaw's fire(): the pirates are extra targets with full body zones and headshots, see Crew.targets()).
// Globals used at runtime: THREE, S, me, scene, camera, others, Decks, Vessel, Fleet, Net, Systems, SHIP, myId, banner, makeAvatar/dress/animate (index.html), Outlaw (optional).
const Crew=(()=>{
  const C=SHIP,SEA=C.sea,list=new Map();
  let bbtn=null,bshow=false,swordT=0,snT=0,nextN=1,built=false,btn=null,combo=0,comboT=0,slashCd=0,sayT=0,vis=true;
  const R=Math.random,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const KIND={cut:{hp:60,spd:3.3,dmg:11,cd:1.05,rng:1.9,gun:-1},pis:{hp:45,spd:2.2,dmg:9,cd:2.1,rng:42,gun:0,acc:.5},mus:{hp:55,spd:1.8,dmg:17,cd:3.3,rng:62,gun:5,acc:.6},cap:{hp:150,spd:3.3,dmg:15,cd:.95,rng:1.9,gun:-1}};
  const CODE=['cut','pis','mus','cap'],ST=['idle','run','atk','aim','dead'];
  const _w={};
  const isHost=()=>typeof Fleet!=='undefined'&&Fleet.isHost();
  const players=()=>{const a=[{id:myId,x:S.x,y:S.y,z:S.z,me:1}];if(typeof others!=='undefined')for(const [id,o] of others)if(o.group)a.push({id,x:o.group.position.x,y:o.group.position.y,z:o.group.position.z});return a};

  // ---------- spawning (host) ----------
  function freeCells(e){const v=e.v,d=v.deck,M=e.K.deckM,out=[];for(let z=-v.hl*.8;z<=v.hl*.8;z+=1)for(let x=-v.hb+1;x<=v.hb-1;x+=1){const f=Decks.floor(d,x,z);if(Math.abs(f-M)<.06&&!Decks.wallAt(d,x,z,M,.3)&&!Decks.wallAt(d,x+.7,z,M,.3)&&!Decks.wallAt(d,x-.7,z,M,.3))out.push([x,z])}return out}
  function make(e,kind,x,z,id){
    const T=KIND[kind],cap=kind==='cap',boss=e.K.boss,hp=cap?e.K.cap.hp:Math.round(T.hp*(boss?1.4:1));
    const c={id:id||'c'+(nextN++),sid:e.id,kind,cap,hp,max:hp,B:{x:0,y:0,z:0,vy:0,rot:Math.random()*6.28,grounded:true,_dk:null,flying:false,_climb:0},st:0,cdT:1+R()*2,atkT:0,wanT:R()*3,wx:null,wz:null,home:{x,z},stuck:0,lx:0,lz:0,dead:false,deadT:0,flash:0,stg:0,g:null,group:null,type:0,lastSay:0,swim:0,tx:0,tz:0,ty:0,snap:null,aggro:false};
    if(x!==undefined){const d=e.v.deck,w=Decks.toWorld(d,x,e.K.deckM,z,{});c.B.x=w.x;c.B.y=w.y;c.B.z=w.z;c.B._dk={id:d.id,x,y:e.K.deckM,z,h:d.pose.h}}
    list.set(c.id,c);return c}
  function spawn(e){
    const cells=freeCells(e);if(!cells.length)return;const K=e.K,roster=[];
    for(const k of ['cut','pis','mus'])for(let i=0;i<(K.crew[k]||0);i++)roster.push(k);
    for(let i=roster.length-1;i>0;i--){const j=(R()*(i+1))|0;[roster[i],roster[j]]=[roster[j],roster[i]]}
    const used=[],pickCell=()=>{let best=null;for(let t=0;t<14;t++){const c=cells[(R()*cells.length)|0];if(used.every(u=>Math.hypot(u[0]-c[0],u[1]-c[1])>2)){best=c;break}}return best||cells[(R()*cells.length)|0]};
    for(const k of roster){const p=pickCell();used.push(p);make(e,k,p[0],p[1])}
    // the captain stands aft, near the wheel
    let cp=cells[0],bd=1e9;for(const c of cells){const d=Math.hypot(c[0],c[1]+e.v.hl*.5);if(d<bd){bd=d;cp=c}}
    const c=make(e,'cap',cp[0],cp[1]);c.wp=K.cap.wp}
  function clearShip(sid){for(const [id,c] of [...list])if(c.sid===sid){drop(c);list.delete(id)}}
  function drop(c){if(c.g&&c.g.parent)c.g.parent.remove(c.g);c.g=null;c.group=null}
  const ofShip=sid=>[...list.values()].filter(c=>c.sid===sid);
  const alive=sid=>ofShip(sid).filter(c=>!c.dead).length;

  // ---------- body: the player controller (Decks.step) driven by an AI ----------
  function walk(c,dt,tx,tz,spd,climb){
    const B=c.B,dx=tx-B.x,dz=tz-B.z,L=Math.hypot(dx,dz),mv=L>.25&&c.stg<=0;const px=B.x,pz=B.z;
    if(mv){B.x+=dx/L*spd*dt;B.z+=dz/L*spd*dt;const a=Math.atan2(dx,dz);B.rot+=wrapA(a-B.rot)*Math.min(1,dt*9)}
    let gY=SEA-1.5;const g=Decks.step(B,px,pz,{dt,grounded:B.grounded,moving:mv,flying:false,noClimb:!climb});if(g>gY)gY=g;
    B.vy-=(B.vy<0?33:25)*dt;B.y+=B.vy*dt;if(B.y<=gY||(B.grounded&&B.vy<=0&&B.y-gY<.35)){B.y=gY;B.vy=0;B.grounded=true}else B.grounded=false;
    return mv}

  // ---------- host AI ----------
  function think(c,e,dt){
    const T=KIND[c.kind],B=c.B,P=players().filter(p=>!(p.me&&Fleet._me.down>0));let tg=null,td=1e9;
    for(const p of P){const d=Math.hypot(p.x-B.x,p.z-B.z);if(d<td&&Math.abs(p.y-B.y)<7){td=d;tg=p}}
    c.cdT-=dt;c.stg-=dt;c.flash=Math.max(0,c.flash-dt);
    const melee=T.gun<0,inWater=tg&&tg.y<SEA+.35;
    if(c.atkT>0){                                                        // winding up a swing / a shot
      c.atkT-=dt;walk(c,dt,B.x,B.z,0,false);
      if(c.atkT<=0&&tg){c.st=0;if(melee){if(td<T.rng+.7)strike(c,tg)}else shoot(c,tg,td);c.cdT=T.cd*(.85+R()*.4)}return}
    if(!tg||td>(melee?24:T.rng+10)||(melee&&inWater&&td>3.5)){                 // nobody to fight: stand around, drift back to the post
      c.aggro=false;c.wanT-=dt;if(c.wanT<=0){c.wanT=2+R()*4;c.wx=c.home.x+(R()-.5)*4;c.wz=c.home.z+(R()-.5)*3}
      if(c.wx!==null){const d=e.v.deck,w=Decks.toWorld(d,c.wx,e.K.deckM,c.wz,{});const m=walk(c,dt,w.x,w.z,1.3,false);c.st=m?1:0;if(!m)c.wx=null}else{walk(c,dt,B.x,B.z,0,false);c.st=0}
      return}
    if(!c.aggro){c.aggro=true;if(c.cap&&now()-sayT>20){sayT=now();banner(e.K.cap.n+': "'+e.K.cap.say[(R()*e.K.cap.say.length)|0]+'"','☠ '+e.K.cap.n.toUpperCase())}}
    B.rot+=wrapA(Math.atan2(tg.x-B.x,tg.z-B.z)-B.rot)*Math.min(1,dt*8);
    if(melee){
      if(td<T.rng&&c.cdT<=0&&attackers(c)<3){c.st=2;c.atkT=.42;c.wu=1;Net.emit('flt',{k:'wu',id:c.id});return}                  // wind up (everybody sees the swing start)
      const hold=attackers(c)>=3&&td<5;const m=hold?false:walk(c,dt,tg.x,tg.z,T.spd*(c.cap?1.05:1),!inWater);c.st=m?1:0;
      // stuck against a wall / cabin? sidestep
      const mvd=Math.hypot(B.x-c.lx,B.z-c.lz);c.lx=B.x;c.lz=B.z;c.stuck=m&&mvd<dt*T.spd*.25?c.stuck+dt:0;if(c.stuck>.7){c.stuck=0;const a=B.rot+(R()<.5?1.6:-1.6);walk(c,.25,B.x+Math.sin(a)*3,B.z+Math.cos(a)*3,T.spd,true)}
    }else{
      if(td<T.rng&&c.cdT<=0){c.st=3;c.atkT=.6;if(c.g)c.g.userData.aimP=0;Net.emit('flt',{k:'wu',id:c.id,a:1});return}
      c.st=0;walk(c,dt,B.x,B.z,0,false);if(td>T.rng*.8){const m=walk(c,dt,tg.x,tg.z,T.spd,false);c.st=m?1:0}}}
  const attackers=c=>{let n=0;for(const o of list.values())if(o!==c&&!o.dead&&o.sid===c.sid&&o.st===2)n++;return n};
  const now=()=>(typeof performance!=='undefined'?performance.now():Date.now())/1000;
  // victim-applies: the host decides, the target's own client takes the damage
  function strike(c,p){
    const T=KIND[c.kind],boss=Fleet.ships.get(c.sid)&&Fleet.ships.get(c.sid).K.boss,dmg=Math.round(T.dmg*(boss?1.5:1)*(.85+R()*.3));
    Net.emit('flt',{k:'cm',id:c.id,tg:p.id,d:dmg,x:c.B.x,z:c.B.z});swingFx(c);if(String(p.id)===String(myId))Fleet.hurtMe(dmg,c.B.x,c.B.z)}
  function shoot(c,p,D){
    const T=KIND[c.kind],hit=R()<clamp(T.acc-D/140,.08,.6),dmg=Math.round(T.dmg*(.85+R()*.3));
    Net.emit('flt',{k:'cs',id:c.id,tg:p.id,h:hit?1:0,d:dmg,tx:p.x,ty:p.y+1.2,tz:p.z});shotFx(c,p.x,p.y+1.2,p.z,hit);if(hit&&String(p.id)===String(myId))Fleet.hurtMe(dmg,c.B.x,c.B.z)}

  // ---------- hits on pirates ----------
  function hit(id,d,zone){
    if(!isHost()){Net.emit('flt',{k:'ch',id,d,z:zone});const c=list.get(id);if(c){c.flash=.12}return}
    const c=list.get(id);if(!c||c.dead)return;c.hp-=d;c.flash=.12;c.hitFx=1;c.stg=zone==='head'||d>=c.max*.4?.5:.18;
    if(c.hp<=0){c.dead=true;c.st=4;c.hp=0;c.deadT=0;const e=Fleet.ships.get(c.sid);Net.emit('flt',{k:'cd',id:c.id});
      if(e){if(c.cap)Fleet.captainDown(e);else if(alive(e.id)===0&&!e.sinking)banner('The deck is yours! Only the captain is left…','☠ PIRATES')}}}
  function splash(sid,x,y,z,r,dmg){if(!isHost())return;for(const c of ofShip(sid)){if(c.dead)continue;const d=Math.hypot(c.B.x-x,(c.B.y-y)*.6,c.B.z-z);if(d<r)hit(c.id,Math.round(dmg*(1-d/r*.6)),'torso')}}

  // ---------- visuals ----------
  const haveVis=()=>typeof makeAvatar==='function'&&typeof THREE!=='undefined'&&typeof scene!=='undefined';
  function visual(c,e){
    if(c.g||!haveVis())return;const K=e.K,sc=c.cap?(K.boss?1.4:1.22):1,col=c.cap?K.cap.col:({cut:'#7a2f22',pis:'#2f4f7a',mus:'#4a5a3a'})[c.kind];
    const g=makeAvatar(c.cap?K.cap.n:'Pirate',col);g.scale.setScalar(sc);g.userData.noTwist=true;g.traverse(o=>{if(o.isSprite){if(c.cap)o.scale.multiplyScalar(.55);else o.visible=false}});scene.add(g);c.g=g;c.group=g;c.sc=sc;
    try{dress(g,c.cap?2:(c.kind==='cut'?0:c.kind==='pis'?1:3))}catch(x){}
    if(KIND[c.kind].gun>=0&&typeof Outlaw!=='undefined'&&Outlaw.setGun)Outlaw.setGun(g,KIND[c.kind].gun);
    // hp bar
    const bar=new THREE.Group(),bg=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.13),new THREE.MeshBasicMaterial({color:'#000',depthTest:false,transparent:true,opacity:.6})),fg=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.13),new THREE.MeshBasicMaterial({color:c.cap?'#c64bff':'#ff4a4a',depthTest:false}));
    bg.renderOrder=10;fg.renderOrder=11;bar.add(bg,fg);bar.position.y=2.35;g.add(bar);c.bar=bar;c.fg=fg}
  // a cutlass in an avatar's right hand. The skeleton is in centimetres (its bones are ~50x the world), so the model is scaled by the bone's WORLD scale to come out as a ~0.9 m blade
  const _ws=typeof THREE!=='undefined'?new THREE.Vector3():null;
  function sword(g,on){
    const u=g.userData,b=u.bones&&u.bones.RightHand;if(!b||typeof Vessel==='undefined')return;
    if(u.sword){u.sword.visible=!!on;return}
    if(!on||u.swordLoading)return;u.swordLoading=true;
    Vessel.put('assets/pirates/sword_001.glb',0,0,0,1,0,b).then(o=>{u.swordLoading=false;if(!o)return;g.updateWorldMatrix(true,true);b.getWorldScale(_ws);
      o.scale.setScalar(.9/1.94/Math.max(1e-3,_ws.x));o.position.set(0,0,0);o.rotation.set(SWR[0],SWR[1],SWR[2]);u.sword=o;o.visible=true},()=>{u.swordLoading=false})}
  const SWR=[Math.PI/2,0,0];
  function cutlass(c){if(c.sw||!c.g||KIND[c.kind].gun>=0)return;if(c.g.userData.bones){c.sw=1;sword(c.g,true)}}
  function boom(x,y,z,col){try{Fx.burst(x,y,z,col||'#ffb347',6)}catch(e){}}
  function swingFx(c){const s=c.B;c.swing=.3;boom(s.x+Math.sin(s.rot)*1.3,s.y+1,s.z+Math.cos(s.rot)*1.3,'#e8f0ff')}
  function shotFx(c,tx,ty,tz,hit){
    const B=c.B;boom(B.x+Math.sin(B.rot)*.7,B.y+1.4,B.z+Math.cos(B.rot)*.7,'#ffd27a');if(c.g)c.g.userData.recoil=1;
    if(!haveVis())return;const a=new THREE.Vector3(B.x,B.y+1.4,B.z),b=new THREE.Vector3(tx,ty,tz),L=a.distanceTo(b);
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,1,4),new THREE.MeshBasicMaterial({color:hit?'#ff9a6a':'#fff3b0',transparent:true,opacity:.9}));m.position.copy(a).lerp(b,.5);m.scale.y=L;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());scene.add(m);
    setTimeout(()=>{scene.remove(m);m.geometry.dispose();m.material.dispose()},110)}
  function frame(c,dt,e){
    if(!c.g)return;const g=c.g,B=c.B;g.position.set(B.x,B.y,B.z);
    let da=B.rot-g.rotation.y;da=wrapA(da);g.rotation.y+=da*Math.min(1,dt*12);
    cutlass(c);
    if(c.dead){c.deadT+=dt;const q=g.userData;if(c.bar)c.bar.visible=false;
      if(!c.dying){c.dying=1;let a=null;try{if(q.mixer&&typeof GunLoco!=='undefined'&&GunLoco.ready()){const att=GunLoco.wrap(Math.atan2(S.x-B.x,S.z-B.z)-g.rotation.y);a=GunLoco.act(q,GunLoco.deathClip(att,false,false))}
          if(!a&&q.mixer&&typeof CombatAnims!=='undefined')a=CombatAnims.act(q,'death')}catch(x){}
        if(q.gun)q.gun.visible=false;if(q.sword)q.sword.visible=false;
        if(a){q.mixer.stopAllAction();q.model.rotation.set(0,0,0);q.model.position.set(0,0,0);a.reset();a.setEffectiveTimeScale(1);a.setEffectiveWeight(1);a.play();c.deathAnim=true}}
      if(c.deathAnim)q.mixer.update(dt);else{const k=Math.min(1,c.deadT/.45);g.rotation.x=-1.45*k;g.position.y=B.y+.12*k}
      if(c.deadT>8)g.visible=false;return}
    if(c.fg){c.fg.scale.x=Math.max(.001,c.hp/c.max);c.fg.position.x=-(1-c.fg.scale.x)*.55;c.bar.lookAt(camera.position);c.bar.visible=Math.hypot(B.x-S.x,B.z-S.z)<40}
    const q=g.userData;
    if(c.hitFx){c.hitFx=0;q.hitReq=1}
    if(c.wu){c.wu=0;q.swing=1}                                                    // the real baked swing overlay (the same one the pan / smack uses)
    try{animate(g,dt,c.st===1?'run':'idle')}catch(x){}}

  // ---------- per frame ----------
  function step(dt){
    if(!built)return;const host=isHost();
    for(const c of list.values()){
      const e=Fleet.ships.get(c.sid);if(!e){continue}
      if(host&&!c.dead){
        if(e.sunk>.25||c.B.y<SEA-1.2){c.swim+=dt;if(e.sunk>.25||c.swim>2){c.dead=true;c.st=4;Net.emit('flt',{k:'cd',id:c.id});if(c.cap&&e.sunk<=.25)Fleet.captainDown(e)}}else{c.swim=0;think(c,e,dt)}}
      else if(!host&&c.snap){const k=1-Math.exp(-12*dt),B=c.B,s=c.snap;B.x+=(s[0]-B.x)*k;B.y+=(s[1]-B.y)*k;B.z+=(s[2]-B.z)*k;B.rot+=wrapA(s[3]-B.rot)*k}
      if(e.v.loaded||!haveVis())visual(c,e);frame(c,dt,e)}
    // your buttons: visible while pirates are close
    if(swordT>0){swordT-=dt;if(swordT<=0){try{sword(me,false)}catch(e){}}}
    comboT-=dt;slashCd-=dt;if(comboT<=0)combo=0;
    let near=false;for(const c of list.values())if(!c.dead&&Math.hypot(c.B.x-S.x,c.B.z-S.z)<45){near=true;break}
    if(host){snT-=dt;if(snT<=0){snT=.125;if(list.size)Net.emit('flt',{k:'cr',a:snapshot()})}}
    if(bbtn){const bs=!!Fleet.boardable();if(bs!==bshow){bshow=bs;bbtn.style.display=bs?'flex':'none'}}
    if(btn&&near!==vis){vis=near;btn.style.display=near?'flex':'none'}}

  // ---------- network ----------
  function snapshot(){const a=[];for(const c of list.values())a.push([c.id,c.sid,CODE.indexOf(c.kind),+c.B.x.toFixed(2),+c.B.y.toFixed(2),+c.B.z.toFixed(2),+c.B.rot.toFixed(2),Math.round(c.hp),c.dead?4:c.st]);return a}
  function apply(a){
    const seen=new Set();
    for(const r of a){const [id,sid,k,x,y,z,rot,hp,st]=r;seen.add(id);let c=list.get(id);const e=Fleet.ships.get(sid);if(!e)continue;
      if(!c){c=make(e,CODE[k],undefined,undefined,id);c.B.x=x;c.B.y=y;c.B.z=z;c.B.rot=rot;if(c.cap)c.wp=e.K.cap.wp}
      c.snap=[x,y,z,rot];if(hp<c.hp){c.flash=.12;c.hitFx=1}c.hp=hp;if(st===4&&!c.dead){c.dead=true;c.deadT=0}c.st=st===4?c.st:st;c.dead=st===4}
    for(const [id,c] of [...list])if(!seen.has(id)){drop(c);list.delete(id)}}
  function onNet(d,from){
    if(!d)return;
    switch(d.k){
      case 'cm':{const c=list.get(d.id);if(c){swingFx(c)}if(!isHost()&&String(d.tg)===String(myId)&&c)Fleet.hurtMe(d.d,d.x,d.z);break}
      case 'cs':{const c=list.get(d.id);if(c)shotFx(c,d.tx,d.ty,d.tz,d.h);if(!isHost()&&d.h&&String(d.tg)===String(myId)&&c)Fleet.hurtMe(d.d,c.B.x,c.B.z);break}
      case 'wu':{const c=list.get(d.id);if(c&&!isHost()){c.st=d.a?3:2;if(!d.a)c.wu=1}break}
      case 'cr':{if(!isHost())apply(d.a);break}
      case 'ch':{if(isHost())hit(d.id,d.d,d.z);break}
      case 'cd':{const c=list.get(d.id);if(c&&!isHost()){c.dead=true;c.hp=0}break}
    }}

  // ---------- your cutlass ----------
  function pop(x,y,z,txt,col){
    if(!haveVis())return;try{const cv=document.createElement('canvas');cv.width=160;cv.height=64;const g=cv.getContext('2d');g.font='bold 40px sans-serif';g.textAlign='center';g.lineWidth=6;g.strokeStyle='#000';g.strokeText(txt,80,44);g.fillStyle=col||'#fff';g.fillText(txt,80,44);
      const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),depthTest:false,transparent:true}));sp.scale.set(1.8,.72,1);sp.position.set(x,y,z);sp.renderOrder=12;scene.add(sp);
      let t=0;const id=setInterval(()=>{t+=.04;sp.position.y+=.03;sp.material.opacity=Math.max(0,1-t);if(t>=1){clearInterval(id);scene.remove(sp);sp.material.map.dispose();sp.material.dispose()}},40)}catch(e){}}
  function slash(){
    if(slashCd>0||(typeof Fleet!=='undefined'&&Fleet._me.down>0))return false;
    const fwd=typeof camera!=='undefined'?(()=>{const v=new THREE.Vector3();camera.getWorldDirection(v);return Math.atan2(v.x,v.z)})():(S.rot||0);
    let tg=null,bd=3.6;const lt=typeof LockOn!=='undefined'&&LockOn.target();
    if(lt&&lt.crew){const c=list.get(lt.id);if(c&&!c.dead&&Math.hypot(c.B.x-S.x,c.B.z-S.z)<4.6&&Math.abs(c.B.y-S.y)<2.6)tg=c}
    if(!tg)for(const c of list.values()){if(c.dead)continue;const dx=c.B.x-S.x,dz=c.B.z-S.z,d=Math.hypot(dx,dz);if(d>bd||Math.abs(c.B.y-S.y)>2.6)continue;
      if(d>2.4&&Math.abs(wrapA(Math.atan2(dx,dz)-fwd))>1.9)continue;bd=d;tg=c}
    slashCd=.4;combo=comboT>0?(combo%3)+1:1;comboT=1.3;try{me.userData.swing=1;swordT=4;sword(me,true)}catch(e){}
    let mt=null;if(!tg&&typeof Monster!=='undefined'){const l2=typeof LockOn!=='undefined'&&LockOn.target();
      if(l2&&l2.melee&&Math.hypot(l2.x-S.x,l2.z-S.z)<5.2)mt={x:l2.x,y:l2.y,z:l2.z,hit:l2.melee};else{const q=Monster.meleeTarget(S.x,S.y,S.z,3.8);if(q)mt={x:q.x,y:q.y,z:q.z,hit:d=>Monster.damage(q.part,d)}}}
    const ang=tg?Math.atan2(tg.B.x-S.x,tg.B.z-S.z):mt?Math.atan2(mt.x-S.x,mt.z-S.z):fwd;S.rot=ang;try{me.rotation.y=ang}catch(e){}
    // the arc
    if(haveVis()){const arc=new THREE.Mesh(new THREE.RingGeometry(.9,1.7,16,1,-1.1,2.2),new THREE.MeshBasicMaterial({color:combo===3?'#ffd24a':'#ffffff',transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false}));
      arc.rotation.x=-Math.PI/2;arc.rotation.z=ang-Math.PI/2;arc.position.set(S.x+Math.sin(ang)*.6,S.y+1.1,S.z+Math.cos(ang)*.6);scene.add(arc);let t=0;const id=setInterval(()=>{t+=.05;arc.material.opacity=.75*(1-t);arc.scale.setScalar(1+t*.4);if(t>=1){clearInterval(id);scene.remove(arc);arc.geometry.dispose();arc.material.dispose()}},30)}
    try{const a=WAudio.get();if(a){const o=a.createOscillator(),gn=a.createGain(),t=a.currentTime;o.type='sawtooth';o.frequency.setValueAtTime(700,t);o.frequency.exponentialRampToValueAtTime(180,t+.12);gn.gain.setValueAtTime(.12,t);gn.gain.exponentialRampToValueAtTime(.001,t+.14);o.connect(gn);gn.connect(WAudio.out());o.start(t);o.stop(t+.15)}}catch(e){}
    if(tg){const dmg=combo===3?46:28;pop(tg.B.x,tg.B.y+2,tg.B.z,dmg,combo===3?'#ffd24a':'#fff');boom(tg.B.x,tg.B.y+1,tg.B.z,'#ff7a5a');hit(tg.id,dmg,combo===3?'head':'torso');if(combo===3){tg.stg=.5}return true}
    if(mt){const dmg=combo===3?46:28;pop(mt.x,mt.y+1.5,mt.z,dmg,combo===3?'#ffd24a':'#fff');boom(mt.x,mt.y+.6,mt.z,'#b07aff');mt.hit(dmg);return true}
    return false}

  function build(){
    if(built)return;built=true;Net.on('flt',onNet);
    if(typeof LockOn!=='undefined')LockOn.source('crew',()=>{const a=[];for(const c of list.values())if(!c.dead&&c.group&&c.group.visible)a.push({id:c.id,crew:1,x:c.B.x,y:c.B.y,z:c.B.z,lift:1.5,hp:c.hp,max:c.max,cap:c.cap});return a});Systems.add('crew',step);
    try{const css=document.createElement('style');css.textContent='#seaboard{position:fixed;z-index:7;right:calc(env(safe-area-inset-right,0px) + 96px);bottom:calc(env(safe-area-inset-bottom,0px) + 112px);min-width:58px;height:48px;padding:0 14px;border-radius:24px;background:#1f4f7acc;color:#fff;font:700 14px sans-serif;border:2px solid #fff8;display:none;align-items:center;justify-content:center;touch-action:none;user-select:none}#seaslash{position:fixed;z-index:7;right:calc(env(safe-area-inset-right,0px) + 22px);bottom:calc(env(safe-area-inset-bottom,0px) + 104px);width:58px;height:58px;border-radius:50%;background:#7a1f1fcc;color:#fff;font:700 28px sans-serif;border:2px solid #fff8;display:none;align-items:center;justify-content:center;touch-action:none;user-select:none}';(document.head||document.body).appendChild(css);
      bbtn=document.createElement('div');bbtn.id='seaboard';bbtn.textContent='⚓ Board!';document.body.appendChild(bbtn);bbtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();Fleet.boardEnemy()});
      btn=document.createElement('div');btn.id='seaslash';btn.textContent='⚔';document.body.appendChild(btn);vis=false;
      const go=e=>{e.preventDefault();slash()};btn.addEventListener('pointerdown',go);addEventListener('keydown',e=>{if(e.code==='KeyF'&&!e.repeat)slash()})}catch(e){}}

  // pirates as extra targets for the player's guns (Outlaw.fire reads these like its own raiders)
  const targets=()=>{const a=[];for(const c of list.values())if(!c.dead&&c.group&&c.group.userData.bones&&c.group.visible)a.push(c);return a};
  return {build,spawn,clearShip,make,list,ofShip,alive,hit,splash,snapshot,apply,slash,targets,owns:id=>list.has(id),think,step,_net:onNet,KIND};
})();
