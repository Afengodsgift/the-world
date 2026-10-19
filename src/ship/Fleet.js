// Fleet: the pirate ships on the big ocean, the cannons (yours and theirs), cannon balls, sinking, loot. Hulls are Vessels (src/ship/Vessel.js) with real walkable decks (Decks), so you can sail alongside, jump across and fight on their planks.
//
//  - ONE host simulates the enemy ships (the lowest player id: whoever is alone is the host); the others mirror 8 Hz snapshots. Spawning, AI, damage to the enemy hulls and sinking happen on the host only.
//  - Cannon balls: whoever fires simulates and broadcasts ('f'); every client replays the same ballistic path for the picture. The SHOOTER's client decides what it hit and broadcasts it ('h'):
//      a shell that hits a hull damages it (the ship's host applies it: Ship.damage for yours, the fleet host for a pirate), a shell that lands on a deck hurts the people standing there (every client hurts only itself).
//  - Yours: stand at a cannon on your deck -> "Fire cannon" (auto-aims at the nearest pirate in the gun's arc, with lead), or "Broadside!" from the helm.
//  - AI styles (data/ship.js): ram / board (comes alongside and lashes on so you can swordfight on the decks), broadside (circles and fires), gunnery (long range).
// Globals used at runtime: THREE, S, scene, H, Net, Systems, Interaction, Fx, DOCK, SHIP, Sailing, Decks, Vessel, Ship, WAudio, myId, others, banner, Outlaw (optional, for coins).
const Fleet=(()=>{
  const C=SHIP,E=C.enemy,CN=C.cannon,SEA=C.sea,GR=-CN.g;
  const ships=new Map(),shells=[],puffs=[];
  let built=false,nextId=1,spawnT=14,sendT=0,wasFar=false,hudEl=null,hpEl=null,shellN=1,dtAcc=0;
  const me={hp:100,max:100,down:0,calm:0,flash:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Sailing.wrap(a),R=Math.random;
  const now=()=>(typeof performance!=='undefined'?performance.now():Date.now())/1000;
  const isHost=()=>{let m=String(myId);for(const k of others.keys())if(String(k)<m)m=String(k);return m===String(myId)};
  const pl=()=>Ship._ship,plv=()=>Ship.vessel();
  const _a={},_b={},_c={};

  // ---------- ballistics ----------
  // elevation (low arc) that carries a ball of speed v over horizontal distance D to a target dy higher; null when out of reach
  function elev(D,dy,v){v=v||CN.v;const a=GR/2*D*D/(v*v),disc=D*D-4*a*(dy+a);if(disc<0||D<1)return null;return Math.atan((D-Math.sqrt(disc))/(2*a))}
  // launch velocity from muzzle m toward a (moving) target point, with lead; spread in radians
  function aim(m,tx,ty,tz,tvx,tvz,sp,out){
    out=out||{};let T=0,px=tx,pz=tz,th=.2,D=0;
    for(let i=0;i<4;i++){px=tx+tvx*T;pz=tz+tvz*T;D=Math.hypot(px-m.x,pz-m.z);th=elev(D,ty-m.y)??.6;T=D/(CN.v*Math.cos(th))}
    const yaw=Math.atan2(px-m.x,pz-m.z)+(R()-.5)*2*sp,pt=th+(R()-.5)*sp;
    out.vx=Math.sin(yaw)*CN.v*Math.cos(pt);out.vz=Math.cos(yaw)*CN.v*Math.cos(pt);out.vy=CN.v*Math.sin(pt);out.D=D;return out}

  // ---------- effects ----------
  function boomSfx(x,z,g){
    try{const a=WAudio.get();if(!a)return;const d=Math.hypot(x-S.x,z-S.z),vol=clamp(1.2-d/150,.04,1)*(g||1),t=a.currentTime,len=a.sampleRate*.5|0,n=a.createBuffer(1,len,a.sampleRate),b=n.getChannelData(0);
      for(let k=0;k<len;k++)b[k]=(R()*2-1)*Math.pow(1-k/len,2.5);
      const s=a.createBufferSource();s.buffer=n;const f=a.createBiquadFilter();f.type='lowpass';f.frequency.value=700;const gn=a.createGain();gn.gain.value=.7*vol;s.connect(f);f.connect(gn);gn.connect(WAudio.out());s.start(t);
      const o=a.createOscillator(),og=a.createGain();o.frequency.setValueAtTime(120,t);o.frequency.exponentialRampToValueAtTime(35,t+.35);og.gain.setValueAtTime(.6*vol,t);og.gain.exponentialRampToValueAtTime(.001,t+.4);o.connect(og);og.connect(WAudio.out());o.start(t);o.stop(t+.45)}catch(e){}}
  function puff(x,y,z,col,r,life,rise){
    if(typeof THREE==='undefined'||typeof scene==='undefined')return;
    const m=new THREE.Mesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.7,depthWrite:false}));m.position.set(x,y,z);m.scale.setScalar(r*.4);scene.add(m);puffs.push({m,t:0,life,r,rise:rise||1.2})}
  function sparks(x,y,z,col,n){try{Fx.burst(x,y,z,col,n)}catch(e){}}
  function splashFx(x,z){try{WaterFX.splash(x,z,1.1)}catch(e){}puff(x,SEA+.3,z,'#e8f8ff',2.4,.9,3);sparks(x,SEA,z,'#dff6ff',10)}
  function muzzleFx(m,o){puff(m.x+o.x*.8,m.y,m.z+o.z*.8,'#ffcf6b',1.1,.18,.2);puff(m.x+o.x*1.4,m.y+.2,m.z+o.z*1.4,'#777',1.8,1.4,1.5);sparks(m.x+o.x,m.y-.6,m.z+o.z,'#ffb347',6)}

  // ---------- name tag over a ship ----------
  function drawTag(e){
    const t=e.tag;if(!t||!t.c.getContext)return;const g=t.c.getContext('2d');if(!g)return;g.clearRect(0,0,256,80);g.fillStyle='rgba(0,0,0,.62)';g.fillRect(8,6,240,68);
    g.fillStyle=e.K.cap.col;g.font='bold 22px sans-serif';g.textAlign='center';g.fillText((e.K.boss?'☠ ':'')+e.K.cap.n,128,31);g.fillStyle='#fff';g.font='15px sans-serif';g.fillText(e.K.name,128,50);
    g.fillStyle='#3a0a0a';g.fillRect(20,58,216,9);g.fillStyle=e.K.boss?'#c64bff':'#ff4a4a';g.fillRect(20,58,216*clamp(e.hp/e.K.hp,0,1),9);t.t.needsUpdate=true}
  function makeTag(e){
    try{const c=document.createElement('canvas');c.width=256;c.height=80;const t=new THREE.CanvasTexture(c),sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true}));sp.scale.set(15,4.7,1);sp.renderOrder=9;scene.add(sp);e.tag={c,t,sp};drawTag(e)}catch(x){e.tag=null}}

  // ---------- ships ----------
  function make(id,clsId,x,z,h,hp){
    const K=C.cls[clsId];if(!K||!K.cap)return null;
    const v=Vessel.create('f'+id,clsId,{x,z,h,tint:K.cap.col});if(!v)return null;
    const sh=Sailing.newShip(x,z,h,{vmax:K.v,turn:K.turn,hl:v.hl*.97,hb:v.hb*.97},hp===undefined?K.hp:hp);sh.sail=.9;sh.v=K.v*.5;
    const e={id,clsId,K,v,sh,hp:hp===undefined?K.hp:hp,side:R()<.5?-1:1,sunk:0,sinking:false,lash:null,lashT:0,seen:false,snap:null,hitT:0,tg:null};
    makeTag(e);ships.set(id,e);if(isHost()&&typeof Crew!=='undefined')Crew.spawn(e);return e}
  function remove(e){
    if(typeof Crew!=='undefined')Crew.clearShip(e.id);
    if(e.tag&&e.tag.sp){scene.remove(e.tag.sp)}
    Vessel.dispose(e.v);ships.delete(e.id)}
  const live=()=>[...ships.values()].filter(e=>!e.sinking);

  // choose a class: mostly the small ones, the boss rarely and never two at once
  function pick(){
    const boss=[...ships.values()].some(e=>e.K.boss);const w={skiff:3,barnacle:3,maiden:2,whisper:2,kraken:boss?0:.8},tot=Object.values(w).reduce((a,b)=>a+b,0);let r=R()*tot;
    for(const k in w){r-=w[k];if(r<=0)return k}return 'skiff'}
  function trySpawn(){
    const p=pl(),id=pick(),K=C.cls[id],pr=Sailing.probes(K.scale*8,K.scale*3.5);
    for(let i=0;i<30;i++){const a=R()*6.283,x=p.x+Math.sin(a)*E.spawnDist,z=p.z+Math.cos(a)*E.spawnDist;
      if(Math.hypot(x-DOCK.ship.x,z-DOCK.ship.z)<E.minDock||H(x,z)>-5)continue;const h=Math.atan2(p.x-x,p.z-z)+(R()-.5)*.8;
      if(!Sailing.clear(x,z,h,H,pr))continue;const e=make(nextId++,id,x,z,h);if(e){banner('Sails on the horizon…','☠ PIRATES');return e}}
    return null}

  // ---------- host AI ----------
  function shoreAvoid(sh,want){            // look ahead: if the water gets shallow turn toward the open side
    const ax=sh.x+Math.sin(sh.h)*45,az=sh.z+Math.cos(sh.h)*45;if(H(ax,az)<-2.5)return want;
    for(const d of [.6,-.6,1.2,-1.2]){const hh=sh.h+d,x=sh.x+Math.sin(hh)*45,z=sh.z+Math.cos(hh)*45;if(H(x,z)<-2.5)return hh}return sh.h+1.5}
  function ai(e,dt){
    const sh=sh_(e),p=pl(),K=e.K,dx=p.x-sh.x,dz=p.z-sh.z,D=Math.hypot(dx,dz),brg=Math.atan2(dx,dz);let want=brg,spd=1;
    if(e.sinking){sh.v*=.985;return}
    if(e.lash){                                                     // lashed alongside: ride with the player's ship until the crew is beaten, the player sails off, or the lines burn through
      e.lashT-=dt;const L=e.lash;L.z-=L.z*Math.min(1,dt*.7);Sailing.toWorld(p,L.x,L.z,_a);sh.x=_a.x;sh.z=_a.z;sh.h=wrap(p.h+L.dh);sh.v=p.v;
      if(e.lashT<=0||p.v>7.5){e.lash=null;banner('The lines are cut — the pirates break away','☠ PIRATES')}return}
    const st=K.style;
    if(st==='ram'){want=Math.atan2(dx+Math.sin(p.h)*p.v*3,dz+Math.cos(p.h)*p.v*3)}
    else if(st==='board'){                                          // come up the lane beside your ship from behind, match speed, lash on
      const lp=Sailing.toShip(p,sh.x,sh.z,_b),v=plv();if(!e.sd)e.sd=lp.x>=0?1:-1;const sd=e.sd,gap=(v?v.hb:5)+e.v.hb-.8,lane=sd*gap;
      const inLane=lp.z<5&&Math.abs(lp.x-lane)<9&&D<90;
      if(inLane)Sailing.toWorld(p,lane,lp.z+30,_c);else Sailing.toWorld(p,sd*(gap+14),-50,_c);
      want=Math.atan2(_c.x-sh.x,_c.z-sh.z);
      if(inLane)spd=clamp(p.v/K.v+(-lp.z)/60+.1,.25,1);
      if(inLane&&Math.abs(lp.x-lane)<2.4&&Math.abs(lp.z)<7&&Math.abs(wrap(sh.h-p.h))<.35){e.lash={x:lane,z:lp.z,dh:wrap(sh.h-p.h)};e.lashT=60;banner(K.cap.n+': "'+K.cap.say[(R()*K.cap.say.length)|0]+'"','☠ BOARDERS');return}}
    else{                                                           // broadside / gunnery: circle the target at the keep distance with the guns facing it
      if(D>E.engage)want=brg;else{const k=clamp((E.keep-D)/E.keep,-.6,.6);want=brg+e.side*(Math.PI/2+k*.8);spd=.7}}
    want=shoreAvoid(sh,wrap(want));
    const inp={rud:clamp(wrap(want-sh.h)*2.2,-1,1),trim:clamp((spd-sh.sail)*4,-1,1)};
    Sailing.step(sh,inp,dt,{wind:{dir:sh.h+1.5708,s:1},H});
    // cannons
    if(e.lash)return;
    for(const g of e.v.guns){
      if(g.cd>0||D>E.fireRange||D<6)continue;Vessel.muzzle(e.v,g,_a);Vessel.outward(e.v,g,_b);
      const tx=p.x-_a.x,tz=p.z-_a.z,dd=Math.hypot(tx,tz)||1;if((_b.x*tx+_b.z*tz)/dd<.82)continue;
      if(R()>dt*1.8)continue;
      const v=aim(_a,p.x,SEA+.7,p.z,Math.sin(p.h)*p.v,Math.cos(p.h)*p.v,CN.spread*(K.style==='gunnery'?.7:1.6),{});
      fire(e.v,g,_a,v,{owner:'f'+e.id,res:true,f:1,src:e.v.id,dmg:CN.dmg*K.dmg,reload:K.reload*(.9+R()*.3),emit:true})}}
  const sh_=e=>e.sh;
  // ships push each other apart (enemy hulls only; the player's ship is simulated by its own host)
  function separate(){
    const arr=[...ships.values()].filter(e=>!e.lash&&!e.sinking),p=pl(),pv=plv();
    const circ=(sh,hl,hb)=>[-.55,0,.55].map(f=>({x:sh.x+Math.sin(sh.h)*hl*f,z:sh.z+Math.cos(sh.h)*hl*f,r:hb*.9}));
    for(const e of arr){
      const A=circ(e.sh,e.v.hl,e.v.hb);
      const others_=[];if(pv&&!e.lash)others_.push({c:circ(p,pv.hl,pv.hb),w:0});for(const o of arr)if(o!==e&&o.id>e.id)others_.push({c:circ(o.sh,o.v.hl,o.v.hb),w:.5,o});
      for(const t of others_)for(const a of A)for(const b of t.c){const dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz),m=a.r+b.r;
        if(d<m&&d>1e-3){const push=(m-d)*(t.w?.5:1),nx=dx/d,nz=dz/d;e.sh.x+=nx*push;e.sh.z+=nz*push;e.sh.v*=.995;if(t.o){t.o.sh.x-=nx*push;t.o.sh.z-=nz*push}}}}}

  // ---------- shells ----------
  function spawnShell(o){
    let mesh=null;if(typeof THREE!=='undefined'&&typeof scene!=='undefined'){mesh=new THREE.Mesh(new THREE.SphereGeometry(.28,8,6),Fx.basic('#1d1d22'));mesh.position.set(o.x,o.y,o.z);scene.add(mesh)}
    o.mesh=mesh;o.t=0;shells.push(o);return o}
  // fire a gun: sets its cooldown, spawns the ball, tells the others
  function fire(v,g,m,vel,o){
    const ow=Vessel.outward(v,g,{});g.cd=o.reload;g.recoil=1;
    const id=o.owner+'#'+(shellN++);
    spawnShell({n:id,x:m.x,y:m.y,z:m.z,vx:vel.vx+(o.vx||0),vy:vel.vy,vz:vel.vz+(o.vz||0),res:o.res,f:o.f,src:o.src,dmg:o.dmg});
    muzzleFx(m,ow);boomSfx(m.x,m.z,1);
    if(o.emit)Net.emit('flt',{k:'f',n:id,s:o.src,g:v.guns.indexOf(g),x:+m.x.toFixed(2),y:+m.y.toFixed(2),z:+m.z.toFixed(2),vx:+(vel.vx+(o.vx||0)).toFixed(2),vy:+vel.vy.toFixed(2),vz:+vel.vz.toFixed(2),f:o.f,dmg:o.dmg})}
  // which hull does this ball touch? shooter-side test. Pirates shoot at your ship, you shoot at pirates (never your own).
  function target(s){
    if(!s.f&&typeof Monster!=='undefined'){const mh=Monster.shellHit(s);if(mh)return mh}
    if(!s.f&&typeof Leviathan!=='undefined'){const lh=Leviathan.shellHit(s);if(lh)return lh}
    if(s.f){const v=plv();if(v&&s.src!=='ship'){const r=Vessel.hit(v,s.x,s.y,s.z);if(r)return {id:'p',r}}return null}
    for(const e of ships.values()){if(e.sinking||e.v.id===s.src)continue;const r=Vessel.hit(e.v,s.x,s.y,s.z);if(r)return {id:e.id,r}}return null}
  function stepShells(dt){
    for(let i=shells.length-1;i>=0;i--){
      const s=shells[i];s.t+=dt;let dead=false;const n=Math.max(1,Math.ceil(Math.hypot(s.vx,s.vy,s.vz)*dt/1.5)),h=dt/n;
      for(let k=0;k<n&&!dead;k++){
        s.vy-=GR*h;s.x+=s.vx*h;s.y+=s.vy*h;s.z+=s.vz*h;
        if(s.res){const t=target(s);if(t){const d={n:s.n,t:t.id,k:t.r.kind,x:s.x,y:s.y,z:s.z,d:s.dmg*(t.r.kind==='deck'?1.15:1),f:s.f};applyHit(d);Net.emit('flt',{k:'h',w:d.k,n:d.n,t:d.t,d:d.d,f:d.f,x:+d.x.toFixed(2),y:+d.y.toFixed(2),z:+d.z.toFixed(2)});dead=true;break}}
        if(s.y<SEA){splashFx(s.x,s.z);boomSfx(s.x,s.z,.35);dead=true}}
      if(s.t>9)dead=true;
      if(s.mesh)s.mesh.position.set(s.x,s.y,s.z);
      if(dead){if(s.mesh)scene.remove(s.mesh);shells.splice(i,1)}}}
  // a ball hit something (everybody runs this once per hit: the shooter directly, the rest from the 'h' message)
  function applyHit(d){
    const j=shells.findIndex(s=>s.n===d.n);if(j>=0){const s=shells[j];if(s.mesh)scene.remove(s.mesh);shells.splice(j,1)}
    if(d.y<SEA+3.5)try{WaterFX.hullHit(d.x,d.y,d.z,12)}catch(e){}
    sparks(d.x,d.y,d.z,'#ffb347',12);sparks(d.x,d.y,d.z,'#8b5a2b',8);puff(d.x,d.y,d.z,'#ff9a2e',2.2,.35,.5);puff(d.x,d.y+.5,d.z,'#555',2.6,1.6,2);boomSfx(d.x,d.z,.8);
    if(d.t==='p'){Ship.damage(d.d)}else{const e=ships.get(d.t);if(e&&isHost())damageEnemy(e,d.d,d.k)}
    // people on the planks: only the enemy's balls hurt, and every client hurts only itself
    if(!d.f&&d.k==='deck'&&typeof Crew!=='undefined'&&isHost())Crew.splash(d.t,d.x,d.y,d.z,CN.splash*.8,CN.pdmg*2.2);
    if(d.f&&d.k==='deck'){const dd=Math.hypot(S.x-d.x,(S.y-d.y)*.6,S.z-d.z);if(dd<CN.splash)hurtMe(CN.pdmg*(1-dd/CN.splash*.6),d.x,d.z)}}
  function captainDown(e){if(e.sinking)return;banner(e.K.cap.n+' falls! The ship is yours!','☠ PIRATES');damageEnemy(e,e.hp+1,'crew')}
  function damageEnemy(e,n,kind){
    if(e.sinking)return;e.hp=Math.max(0,e.hp-n);e.hitT=.3;drawTag(e);
    if(e.hp<=0){e.sinking=true;e.lash=null;const c=Math.round(e.K.coin[0]+R()*(e.K.coin[1]-e.K.coin[0]));loot(c,e.K.name,e.K.boss);Net.emit('flt',{k:'l',c,n:e.K.name,b:e.K.boss?1:0})}}
  function loot(c,name,boss){
    try{if(typeof Outlaw!=='undefined'&&Outlaw.earn)Outlaw.earn(c)}catch(e){}
    banner((boss?'BOSS SUNK! ':'')+name+' goes down! +'+c+' 🪙','☠ PIRATES')}

  // ---------- you ----------
  function hurtMe(n,fx,fz){
    if(me.down>0)return;me.hp=Math.max(0,me.hp-n);me.calm=5;S.hurt=Math.max(S.hurt||0,.35);
    if(fx!==undefined){const l=Math.hypot(S.x-fx,S.z-fz)||1;S.kx=(S.kx||0)+(S.x-fx)/l*5;S.kz=(S.kz||0)+(S.z-fz)/l*5}
    try{navigator.vibrate&&navigator.vibrate(40)}catch(e){}
    if(me.hp<=0){me.down=6;try{if(Ship.locked())Ship.leave()}catch(e){}banner('You are down! Back on your feet in a moment…','☠ PIRATES')}}
  function respawn(){
    me.hp=me.max;me.down=0;const v=plv();
    if(v&&pl().sunk===0){try{Ship._board()}catch(e){}}else{S.x=DOCK.x;S.z=DOCK.z0+3;S.y=DOCK.top;S.vy=0;S._dk=null}}

  // jump across to a pirate ship that is close: you land on the nearest free spot of its main deck (the rails and the gap are too awkward to cross on a rolling sea)
  function boardable(){
    if(me.down>0||(typeof Ship!=='undefined'&&Ship.locked()))return null;let best=null,bd=1e9;
    for(const e of ships.values()){if(e.sinking||e.sunk>0||!e.v.deck)continue;if(S._dk&&S._dk.id===e.v.deck.id)continue;
      const l=Decks.toLocal(e.v.deck,S.x,S.y,S.z,{}),d=Math.hypot(Math.max(0,Math.abs(l.x)-e.v.hb),Math.max(0,Math.abs(l.z)-e.v.hl));
      if(d<13&&Math.abs(l.y-e.K.deckM)<9&&d<bd){bd=d;best=e}}
    return best}
  function boardEnemy(){
    const e=boardable();if(!e)return false;const d=e.v.deck,l=Decks.toLocal(d,S.x,S.y,S.z,{}),M=e.K.deckM;let best=null,bd=1e9;
    for(let z=-e.v.hl*.8;z<=e.v.hl*.8;z+=.6)for(let x=-e.v.hb+.8;x<=e.v.hb-.8;x+=.6){const f=Decks.floor(d,x,z);if(Math.abs(f-M)>.1||Decks.wallAt(d,x,z,M,.3))continue;const dd=Math.hypot(x-l.x,z-l.z);if(dd<bd){bd=dd;best=[x,z]}}
    if(!best)return false;Decks.pin(S,d,best[0],best[1]);S.vy=0;S.grounded=true;S.kx=S.kz=0;S.flying=false;banner('Aboard '+e.K.cap.n+'\'s ship! Draw steel!','⚔ BOARDING');return true}
  // gun nearest to you (on your own ship, you standing on the deck)
  function nearGun(){
    const v=plv();if(!v||!Ship._onDeck()||Ship.seated())return null;let best=null,bd=3.2;
    for(const g of v.guns){Decks.toWorld(v.deck,g.x,g.ly,g.z,_a);const d=Math.hypot(_a.x-S.x,_a.z-S.z);if(d<bd&&Math.abs(_a.y-S.y)<2.6){bd=d;best=g}}return best}
  const _d={};
  function playerFire(g,quiet,manual){
    const v=plv();if(!v||pl().sunk>0)return false;
    if(g.cd>0){if(!quiet)banner('Reloading…','💣 CANNON');return false}
    const m=Vessel.muzzle(v,g,{}),o=Vessel.outward(v,g,{});let tg=null,bd=1e9;
    for(const e of ships.values()){if(e.sinking)continue;const dx=e.sh.x-m.x,dz=e.sh.z-m.z,D=Math.hypot(dx,dz);if(D>CN.range||D<3||(o.x*dx+o.z*dz)/D<.5)continue;if(D<bd){bd=D;tg=e}}
    if(!tg&&quiet&&!manual)return false;
    let dir=null;
    if(manual){const dv=Ship.aimDir(new THREE.Vector3()),ao=Math.atan2(o.x,o.z),da=Math.max(-C.cannon.aimYaw,Math.min(C.cannon.aimYaw,wrap(Math.atan2(dv.x,dv.z)-ao))),el=Math.max(-C.cannon.aimDown,Math.min(C.cannon.aimUp,Math.asin(Math.max(-1,Math.min(1,dv.y))))),ce=Math.cos(el);dir={vx:Math.sin(ao+da)*ce*CN.v,vz:Math.cos(ao+da)*ce*CN.v,vy:Math.sin(el)*CN.v}}   // a gunner's shot goes exactly where his camera looks, inside the gun's limits
    const sp=pl(),vel=dir?dir:tg?aim(m,tg.sh.x,SEA+.7,tg.sh.z,Math.sin(tg.sh.h)*tg.sh.v,Math.cos(tg.sh.h)*tg.sh.v,CN.spread,{})
      :{vx:o.x*CN.v*Math.cos(.14),vz:o.z*CN.v*Math.cos(.14),vy:CN.v*Math.sin(.14)};
    fire(v,g,m,vel,{owner:String(myId),res:true,f:0,src:'ship',dmg:CN.dmg,reload:(CN.pReload||CN.reload)*(.95+R()*.1),emit:true,vx:Math.sin(sp.h)*sp.v,vz:Math.cos(sp.h)*sp.v});return true}
  // every gun on one side at once, all along your camera: a gunner's broadside (each gun clamps the aim to its own arc)
  function sideSalvo(side){
    const v=plv();if(!v)return 0;let n=0;
    v.guns.filter(g=>g.side===side).forEach((g,i)=>setTimeout(()=>{if(playerFire(g,true,true))n++},i*80+R()*60));return 1}
  function broadside(){
    const v=plv();if(!v)return;let n=0;
    v.guns.forEach((g,i)=>setTimeout(()=>{if(playerFire(g,true))n++},i*70+R()*120));
    setTimeout(()=>{if(!n)banner('No pirate ship in range of your cannons','💣 CANNON')},700)}

  // ---------- network ----------
  function onNet(d,from){
    if(!d)return;
    switch(d.k){
      case 'f':{const e=d.s==='ship'?null:ships.get(+String(d.s).slice(1)),v=d.s==='ship'?plv():(e&&e.v),g=v&&v.guns[d.g];
        if(g){g.cd=Math.max(g.cd,1);g.recoil=1}
        spawnShell({n:d.n,x:d.x,y:d.y,z:d.z,vx:d.vx,vy:d.vy,vz:d.vz,res:false,f:d.f,src:d.s,dmg:d.dmg});
        if(v&&g){Vessel.outward(v,g,_b);muzzleFx({x:d.x,y:d.y,z:d.z},_b)}boomSfx(d.x,d.z,1);break}
      case 'h':applyHit({n:d.n,t:d.t,k:d.w,d:d.d,f:d.f,x:d.x,y:d.y,z:d.z});break;
      case 'l':loot(d.c,d.n,d.b);break;
      case 's':{if(isHost())break;const seen=new Set();
        for(const a of d.e){const [id,cls,x,z,h,v,hp,sk,lc]=a;seen.add(id);let e=ships.get(id);
          if(!e){e=make(id,cls,x,z,h,hp);if(!e)continue}
          e.snap={x,z,h,v,at:now()};e.hp=hp;e.sinking=sk>0;e.sunk=sk;if(e.tag&&e.tag.last!==hp){e.tag.last=hp;drawTag(e)}e.lash=lc?{}:null}
        for(const e of [...ships.values()])if(!seen.has(e.id))remove(e);break}}}
  const snapshot=()=>({k:'s',e:[...ships.values()].map(e=>[e.id,e.clsId,+e.sh.x.toFixed(2),+e.sh.z.toFixed(2),+e.sh.h.toFixed(3),+e.sh.v.toFixed(2),Math.round(e.hp),+e.sunk.toFixed(3),e.lash?1:0])});

  // ---------- per frame ----------
  function step(dt){
    if(!built)return;
    const host=isHost(),p=pl();
    if(host){
      const far=Math.hypot(p.x-DOCK.ship.x,p.z-DOCK.ship.z)>E.minDock;if(far&&!wasFar)spawnT=Math.min(spawnT,14);wasFar=far;
      if(far){spawnT-=dt;if(spawnT<=0){spawnT=E.spawnEvery;if(live().length<E.cap)trySpawn()}}
      for(const e of [...ships.values()]){
        ai(e,dt);
        if(e.sinking){e.sunk=Math.min(1,e.sunk+dt/8);if(e.sunk>=1){remove(e);continue}}
        else if(Math.hypot(e.sh.x-p.x,e.sh.z-p.z)>480){remove(e);continue}}
      separate();
      sendT-=dt;if(sendT<=0){sendT=1/C.net.enemies;Net.emit('flt',snapshot())}
    }
    for(const e of ships.values()){
      const sh=e.sh;
      if(!host&&e.snap){const age=Math.min(.4,now()-e.snap.at),tx=e.snap.x+Math.sin(e.snap.h)*e.snap.v*age,tz=e.snap.z+Math.cos(e.snap.h)*e.snap.v*age,k=1-Math.exp(-10*dt);
        sh.x+=(tx-sh.x)*k;sh.z+=(tz-sh.z)*k;sh.h=wrap(sh.h+wrap(e.snap.h-sh.h)*k);sh.v=e.snap.v}
      e.v.sunk=e.sunk;e.v.hp=e.hp;Decks.disable(e.v.deck,e.sunk>.3);e.hitT=Math.max(0,e.hitT-dt);
      Vessel.update(e.v,dt,{x:sh.x,z:sh.z,h:sh.h,roll:sh.roll,v:sh.v,rel:.4,sail:sh.sail});
      if(e.tag){const q=e.v.pose,d=Math.hypot(q.x-S.x,q.z-S.z);e.tag.sp.visible=d<300&&e.sunk<.3;e.tag.sp.position.set(q.x,q.y+e.v.top+7+Math.min(d,200)*.035,q.z)}
      if(!e.seen&&e.v.loaded&&Math.hypot(sh.x-S.x,sh.z-S.z)<230){e.seen=true;banner((e.K.boss?'BOSS: ':'')+e.K.cap.n+' — '+e.K.cap.t+' ('+e.K.name+')','☠ PIRATES')}}
    stepShells(dt);
    for(let i=puffs.length-1;i>=0;i--){const q=puffs[i];q.t+=dt;const k=q.t/q.life;q.m.position.y+=q.rise*dt;q.m.scale.setScalar(q.r*(.4+k*.9));q.m.material.opacity=.7*(1-k);if(k>=1){scene.remove(q.m);q.m.geometry.dispose();q.m.material.dispose();puffs.splice(i,1)}}
    // you: regen, respawn, hud
    if(me.down>0){me.down-=dt;if(me.down<=0)respawn()}else if(me.hp<me.max){me.calm-=dt;if(me.calm<=0)me.hp=Math.min(me.max,me.hp+dt*4)}
    const near=live().some(e=>Math.hypot(e.sh.x-S.x,e.sh.z-S.z)<260);
    if(hpEl){const txt=(near||me.hp<me.max||me.down>0)?(me.down>0?'💀 down '+Math.ceil(me.down)+'s':'❤ '+Math.ceil(me.hp)):'';if(txt!==hpEl._t){hpEl._t=txt;hpEl.textContent=txt;hpEl.style.display=txt?'block':'none'}}
    if(hpEl&&me.hp<me.max*.35&&me.down<=0)hpEl.style.color='#ff6b6b';else if(hpEl)hpEl.style.color='#fff'}

  function build(){
    if(built)return;built=true;
    try{const css=document.createElement('style');css.textContent='#seahp{position:fixed;z-index:6;left:8px;top:calc(env(safe-area-inset-top,0px) + 92px);padding:2px 9px;border-radius:10px;background:#0008;color:#fff;font:700 12px sans-serif;display:none;pointer-events:none}@media (orientation:landscape) and (pointer:coarse){#seahp{top:calc(var(--st,0px) + 88px)}}';(document.head||document.body).appendChild(css);
      hpEl=document.createElement('div');hpEl.id='seahp';document.body.appendChild(hpEl)}catch(e){}
    Net.on('flt',onNet);Systems.add('fleet',step)}

  Interaction.register('cannon-shoot','🔥 Fire!',()=>built&&me.down<=0&&Ship.gunning(),()=>{const g=Ship.gun();if(g)playerFire(g,false,true)});
  Interaction.register('cannon-fire','Man the cannon',()=>built&&me.down<=0&&!Ship.locked()&&!!nearGun(),()=>{const g=nearGun();if(g)Ship.aimGun(g)});
  Interaction.register('ship-broadside','Broadside!',()=>built&&me.down<=0&&Ship.seated()&&!Ship.gunning(),broadside);

  // leave a deck over the side (a wall now keeps you from falling off by accident): pops you 2 m out and up
  function overboardDir(){
    if(!S._dk||S.flying||me.down>0)return null;const d=Decks.get(S._dk.id);if(!d||d.off)return null;const l=Decks.toLocal(d,S.x,S.y,S.z,{});
    const n=Decks.wallNormal(d,l.x,l.z,l.y,Decks.STEP);if(!n)return null;
    const wx=-n.x,wz=-n.z,L=Math.hypot(wx,wz)||1,ux=wx/L,uz=wz/L;
    if(Decks.floor(d,l.x+ux*3.4,l.z+uz*3.4)>=l.y-2.5)return null;           // only the ship's side (nothing solid to stand on beyond it), not a cabin wall or a cannon
    return {d,x:ux,z:uz,l}}
  function overboard(){
    const o=overboardDir();if(!o)return;const w=Decks.toWorld(o.d,o.l.x+o.x*2.6,o.l.y,o.l.z+o.z*2.6,{});
    S._dk=null;S.x=w.x;S.z=w.z;S.y=w.y+.6;S.vy=5;S.grounded=false}
  Interaction.register('ship-overboard','Jump overboard 🌊',()=>built&&!Ship.locked()&&!!overboardDir(),overboard);
  return {overboard,build,ships,shells,make,remove,trySpawn,elev,aim,fire,playerFire,broadside,nearGun,hurtMe,respawn,applyHit,damageEnemy,captainDown,boardable,boardEnemy,sideSalvo,isHost,
    marks:()=>[...ships.values()].filter(e=>!e.sinking).map(e=>({n:e.K.cap.n,x:e.sh.x,z:e.sh.z,r:6,icon:e.K.boss?'☠':'🏴‍☠️',dyn:true})),
    _me:me,_step:step,_ai:ai,_net:onNet,_snapshot:snapshot};
})();
