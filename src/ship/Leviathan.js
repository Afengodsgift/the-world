// Leviathan: the second sea monster, a huge animated sea beast (assets/monsters/leviathan.glb). It circles your ship, then winds up and LUNGES at the hull (bite: damages the ship and everyone close to the impact),
// swims off and comes back. Fight it with the cannons: the head is the weak point, the chest takes normal damage, the tail little. Lock on (🎯) to follow it. It sinks with a big pile of coins.
//  - HOST simulates it, 8 Hz snapshots on Net 'flt' (k:'lo'); guests mirror and animate. Hits on YOU are decided by the host and applied by you (every client hurts only itself).
//  - The model faces -Z in its own space; the beast is placed so its HEAD is at (x,z) and the body trails behind along the heading.
// Globals at runtime: THREE (+GLTFLoader), S, scene, H, Net, Systems, Fleet, Ship, SHIP, Ocean, WaterFX, Fx, myId, others, banner, Outlaw (coins), LockOn.
const Leviathan=(()=>{
  const C=SHIP,SEA=C.sea,SC=.85,HEAD_OFF=14.3*SC,HP=650,SWIM=0,WIND=1,LUNGE=2,BACK=3;
  const R=Math.random,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
  // hit spheres along the body, measured back from the head (m) with radius and damage multiplier
  const PARTS=[{id:'h',off:0,r:3.9,k:2.2},{id:'c',off:6.5,r:4.3,k:1},{id:'t',off:15,r:3.1,k:.6}];
  let m=null,built=false,spawnT=1e9,snapT=0,grp=null,mdl=null,mixer=null,loading=false,mat0=null,flash=0;
  const isHost=()=>typeof Fleet!=='undefined'&&Fleet.isHost();
  const players=()=>{const a=[{id:myId,x:S.x,y:S.y,z:S.z}];if(typeof others!=='undefined')for(const [id,o] of others)if(o.group)a.push({id,x:o.group.position.x,y:o.group.position.y,z:o.group.position.z});return a};
  const seaY=(x,z)=>SEA+(typeof Ocean!=='undefined'?Ocean.height(x,z,Date.now()/1000):0);

  function make(x,z,hd,id){return {id:id||'lv'+((Math.random()*1e6)|0),x,z,hd,y:0,rise:0,hp:HP,max:HP,st:SWIM,T:0,cd:5,dead:false,deadT:0,ang:Math.random()*6.28,dir:Math.random()<.5?1:-1,tx:0,tz:0,hitT:0,snap:null,t:0,sp:0}}
  function spawn(x,z){
    if(m)return m;const v=Ship.vessel(),p=v.pose;
    if(x===undefined){for(let i=0;i<30;i++){const a=p.h+(Math.random()<.5?1:-1)*(.9+Math.random()*.7),d=60+Math.random()*20;x=p.x+Math.sin(a)*d;z=p.z+Math.cos(a)*d;if(H(x,z)<-9)break;x=undefined}
      if(x===undefined)return null}
    m=make(x,z,Math.atan2(p.x-x,p.z-z));Net.emit('flt',{k:'lb',id:m.id,x:+x.toFixed(1),z:+z.toFixed(1),h:+m.hd.toFixed(2)});banner('A colossal shape circles beneath the waves…','🐉 LEVIATHAN');return m}
  function drop(){m=null;if(grp)grp.visible=false}
  const backVec=o=>({x:-Math.sin(o.hd),z:-Math.cos(o.hd)});
  function partPos(o,pt,out){const b=backVec(o);out=out||{x:0,y:0,z:0};out.x=o.x+b.x*pt.off*SC;out.z=o.z+b.z*pt.off*SC;out.y=seaY(out.x,out.z)+.2+o.rise*.0+(o.st===LUNGE?1.2:0);return out}

  // ---------- host simulation ----------
  function think(o,dt){
    o.t+=dt;o.T+=dt;o.hitT=Math.max(0,o.hitT-dt);const sh=Ship.vessel().pose;
    if(o.dead){o.deadT+=dt;o.rise=Math.max(-1,o.rise-dt*.3);return o.deadT<7}
    o.rise=Math.min(1,o.rise+dt*.4);
    const dx=sh.x-o.x,dz=sh.z-o.z,D=Math.hypot(dx,dz);
    if(D>150){banner('The leviathan loses interest…','🐉 LEVIATHAN');Net.emit('flt',{k:'lx'});return false}
    let want=o.hd,spd=7;
    if(o.st===SWIM){
      o.ang+=o.dir*dt*.11;const tx=sh.x+Math.cos(o.ang)*30,tz=sh.z+Math.sin(o.ang)*30;want=Math.atan2(tx-o.x,tz-o.z);spd=Math.min(8,Math.hypot(tx-o.x,tz-o.z)*.5+3);
      o.cd-=dt;if(o.cd<=0&&D<60){o.st=WIND;o.T=0;o.tx=sh.x;o.tz=sh.z;Net.emit('flt',{k:'lw'})}}
    else if(o.st===WIND){want=Math.atan2(sh.x-o.x,sh.z-o.z);spd=2.5;o.tx=sh.x;o.tz=sh.z;if(o.T>1.5){o.st=LUNGE;o.T=0}}
    else if(o.st===LUNGE){want=Math.atan2(o.tx-o.x,o.tz-o.z);spd=19;
      const bd=Math.hypot(sh.x-o.x,sh.z-o.z);if(bd<(Ship.vessel().hb||6)+3.2||o.T>3.2){bite(o);o.st=BACK;o.T=0}}
    else if(o.st===BACK){want=Math.atan2(o.x-sh.x,o.z-sh.z)+.5*o.dir;spd=11;if(o.T>3.2){o.st=SWIM;o.T=0;o.cd=5+Math.random()*4}}
    const turn=o.st===LUNGE?.9:1.5;o.hd=wrapA(o.hd+clamp(wrapA(want-o.hd),-turn*dt,turn*dt));
    o.sp+=(spd-o.sp)*Math.min(1,dt*2);const nx=o.x+Math.sin(o.hd)*o.sp*dt,nz=o.z+Math.cos(o.hd)*o.sp*dt;
    if(H(nx,nz)<-5&&H(nx+Math.sin(o.hd)*8,nz+Math.cos(o.hd)*8)<-4){o.x=nx;o.z=nz}else{o.hd=wrapA(o.hd+dt*1.2);o.sp*=.9}
    return true}
  // the bite: the hull takes a beating, people near the head are thrown and hurt (each client hurts only itself)
  function bite(o){
    const h=partPos(o,PARTS[0],{});Net.emit('flt',{k:'ls',x:+h.x.toFixed(1),y:+h.y.toFixed(1),z:+h.z.toFixed(1)});biteFx(h.x,h.y,h.z);
    for(const p of players())if(p.id===myId&&Math.hypot(p.x-h.x,p.z-h.z)<9&&p.y>SEA-1)Fleet.hurtMe(14,h.x,h.z);
    Ship.damage(26)}
  function biteFx(x,y,z){try{WaterFX.splash(x,z,1.5);WaterFX.hullHit(x,y,z,22)}catch(e){}try{Fx.burst(x,y+.5,z,'#cfe9ff',14)}catch(e){}}

  // ---------- being hurt ----------
  function damage(part,d){
    if(!m||m.dead)return;if(!isHost()){Net.emit('flt',{k:'ld',p:part,d});m.hitT=.2;return}
    m.hp-=d;m.hitT=.2;if(m.hp<=0)die()}
  function die(){m.dead=true;m.deadT=0;const c=600+Math.round(R_()*250);Net.emit('flt',{k:'lk',c});reward(c)}
  const R_=Math.random;
  function reward(c){try{if(typeof Outlaw!=='undefined'&&Outlaw.earn)Outlaw.earn(c)}catch(e){}banner('THE LEVIATHAN SINKS! +'+c+' 🪙','🐉 LEVIATHAN')}
  const _p={x:0,y:0,z:0};
  function shellHit(s){
    if(!m||m.dead||s.y<SEA-1.2)return null;
    for(const pt of PARTS){partPos(m,pt,_p);if(Math.hypot(s.x-_p.x,s.y-(_p.y+1),s.z-_p.z)<pt.r*SC/.85+.3){damage(pt.id,Math.round((s.dmg||24)*pt.k));return {id:'m',r:{kind:'monster'}}}}
    return null}

  // ---------- visuals ----------
  function load(){
    if(loading||mdl||typeof THREE==='undefined'||!THREE.GLTFLoader)return;loading=true;
    new THREE.GLTFLoader().load('assets/monsters/leviathan.glb',g=>{mdl=g.scene;mdl.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=false}});
      grp=new THREE.Group();grp.add(mdl);mdl.scale.setScalar(SC);scene.add(grp);
      mixer=new THREE.AnimationMixer(mdl);if(g.animations[0]){const a=mixer.clipAction(g.animations[0]);a.play()}},undefined,()=>{loading=false})}
  function render(dt){
    if(!m){if(grp)grp.visible=false;return}
    load();if(!grp)return;grp.visible=true;
    // origin sits behind the head so the head lands on (x,z); -Z is the model's front
    const b=backVec(m);
    const y=seaY(m.x,m.z)-.7+(m.st===LUNGE?1.6:0)+(m.dead?-Math.min(8,m.deadT*1.3):0);
    grp.position.set(m.x+b.x*HEAD_OFF,y,m.z+b.z*HEAD_OFF);
    grp.rotation.set(0,m.hd+Math.PI,m.dead?Math.min(1.4,m.deadT*.4):0);
    if(mixer)mixer.update(dt*(m.st===LUNGE?1.9:m.st===WIND?.6:m.dead?.2:1));
    flash=m.hitT>0?1:0;mdl.traverse(o=>{if(o.isMesh&&o.material&&o.material.emissive){o.material.emissive.setRGB(flash*.6,flash*.05,flash*.05)}})}

  // ---------- per frame ----------
  function step(dt){
    if(!built)return;
    if(isHost()){
      if(m){if(!think(m,dt)){drop();spawnT=260+Math.random()*200}
        snapT-=dt;if(m&&snapT<=0){snapT=.125;Net.emit('flt',{k:'lo',a:[+m.x.toFixed(1),+m.z.toFixed(1),+m.hd.toFixed(3),Math.round(m.hp),m.st,m.dead?1:0,+m.sp.toFixed(1)]})}}}
    else if(m&&m.snap){const k=1-Math.exp(-9*dt),s=m.snap;m.x+=(s[0]-m.x)*k;m.z+=(s[1]-m.z)*k;m.hd=wrapA(m.hd+wrapA(s[2]-m.hd)*k);m.hp=s[3];m.st=s[4];m.sp=s[6];m.t+=dt;m.hitT=Math.max(0,m.hitT-dt);if(s[5]){if(!m.dead){m.dead=true;m.deadT=0}m.deadT+=dt;if(m.deadT>7)drop()}}
    render(dt)}
  function onNet(d){
    if(!d)return;
    switch(d.k){
      case 'lb':{if(isHost())break;m=make(d.x,d.z,d.h,d.id);banner('A colossal shape circles beneath the waves…','🐉 LEVIATHAN');break}
      case 'lx':{if(!isHost())drop();break}
      case 'lo':{if(isHost())break;if(!m)m=make(d.a[0],d.a[1],d.a[2]);m.snap=d.a;break}
      case 'lw':{break}
      case 'ls':{biteFx(d.x,d.y,d.z);if(!isHost()){for(const p of players())if(p.id===myId&&Math.hypot(p.x-d.x,p.z-d.z)<9&&p.y>SEA-1)Fleet.hurtMe(14,d.x,d.z)}Ship.damage(26);break}
      case 'ld':{if(isHost())damage(d.p,d.d);break}
      case 'lk':{if(!isHost()){if(m){m.dead=true;m.deadT=0}reward(d.c)}break}
    }}
  function build(){
    if(built)return;built=true;Net.on('flt',onNet);Systems.add('leviathan',step);
    if(typeof LockOn!=='undefined')LockOn.source('leviathan',()=>{if(!m||m.dead)return null;const h=partPos(m,PARTS[0],{});return [{id:'lh',x:h.x,y:h.y,z:h.z,lift:1.5,hp:m.hp,max:m.max,cap:1}]});
    try{const q=new URLSearchParams(location.search);if(q.get('leviathan'))setTimeout(()=>{if(isHost())spawn()},(+q.get('leviathan')||5)*1000)}catch(e){}}
  return {build,spawn,damage,shellHit,step,think,make,onNet,get:()=>m,drop,partPos,PARTS,ST:{SWIM,WIND,LUNGE,BACK},_set:o=>{m=o}};
})();
