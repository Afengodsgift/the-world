// PARKOUR ISLE: the island, the course meshes, the race (you + 3 AI runners), the HUD and the player's own parkour controls. Pure rules live in ParkourCore / ParkourCourse / ParkourAI.
//   Parkour.build()            scene objects + pads + HUD (once, from the world build; no-op if PKI.on is false)
//   Parkour.on()               true while a run is active: index.html then routes the stick + Jump here (Parkour.setInput) and calls Parkour.frame() after the normal physics, exactly like Surf
//   Parkour.idle(dt,t)         every frame, always: pad animation, checkpoint rings
//   Parkour.pack()             the clip the local player is playing ("name|timescale") for the 's' state broadcast, so a partner sees the moves
// Controls: stick = run (momentum: wide turns at speed), JUMP = jump / vault / wall-up / wall-kick / wall-jump / ledge climb (context), SLIDE = slide + drop from a ledge + wall-run release, FLIP = trick in the air (clean landing = speed), RESPAWN, EXIT.
// Keys: Space jump, C / Shift slide, V flip, R respawn.
// Globals used: THREE, scene, S, me, H, PKI, banner, chime, Interaction, CameraRig, keys, makeAvatar, dress, animate, others, $.
const Parkour=(()=>{
  const P=ParkourCore,DT=1/60,GY=ParkourCourse.GY;
  const NAMES=['Nova','Kite','Rune'],COLS=['#ff5a7a','#ffd24a','#5ad6ff'],SKILL=[.9,.8,.68];
  let shown=0,built=false,K=null,W=null,G=null,pads=[],rings=[],mode=null,phase='',B=null,acc=0,cpi=0,t0=0,tcount=0,score=0,callT=0,runners=[],results=[],finT=0,pit=0,lastWI=0,fin=null;
  const inp={mx:0,mz:0,jump:false,jumpHeld:false,slide:false,trick:false},edge={jump:false,slide:false,trick:false};let held=false;
  let hud=null,btns=null,call=null,fb=null,pos=null,res=null,counter=null;
  const ox=()=>PKI.x,oz=()=>PKI.z,fmt=ms=>{const s=ms/1000,m=Math.floor(s/60);return m+':'+(s%60<10?'0':'')+(s%60).toFixed(1)};
  function rngf(s){return()=>{s=(s*16807)%2147483647;return s/2147483647}}
  // ---------- course in world coordinates ----------
  function world(){
    const c=ParkourCourse.build(),X=ox(),Z=oz(),mv=o=>Object.assign({},o,{x:o.x+X,z:o.z+Z});
    const r={boxes:c.boxes.map(b=>Object.assign({},b,{x0:b.x0+X,x1:b.x1+X,z0:b.z0+Z,z1:b.z1+Z})),wps:c.wps.map(mv),cps:c.cps.map(mv),start:mv(c.start),finish:mv(c.finish),GY:c.GY,length:c.length,PLAT:c.PLAT,
      pits:c.pits.map(p=>({x0:p.x0+X,x1:p.x1+X,z0:p.z0+Z,z1:p.z1+Z}))};
    r.inPit=(x,z)=>r.pits.some(q=>x>=q.x0&&x<=q.x1&&z>=q.z0&&z<=q.z1);
    r.base=(x,z)=>Math.hypot(x-X,z-Z)<r.PLAT?GY:-Infinity;
    // arc length along the waypoints (for race positions)
    let d=0;r.wd=r.wps.map((w,i)=>{if(i)d+=Math.hypot(w.x-r.wps[i-1].x,w.z-r.wps[i-1].z);return d});r.total=d;
    return r}
  // one merged mesh for a list of boxes: per-face vertex colours (top lighter) so platforms read at a glance
  function boxMesh(list,colFn){
    const pos=[],nor=[],col=[],idx=[];const faces=[[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
    for(const b of list){const c0=new THREE.Color(colFn(b)),top=c0.clone().offsetHSL(0,0,.16),bot=c0.clone().multiplyScalar(.55);
      const X=[b.x0,b.x1],Y=[b.y0,b.y1],Z=[b.z0,b.z1];
      for(const f of faces){const v=[];
        if(f[1]){const y=f[1]>0?Y[1]:Y[0];v.push([X[0],y,Z[0]],[X[1],y,Z[0]],[X[1],y,Z[1]],[X[0],y,Z[1]])}
        else if(f[0]){const x=f[0]>0?X[1]:X[0];v.push([x,Y[0],Z[0]],[x,Y[1],Z[0]],[x,Y[1],Z[1]],[x,Y[0],Z[1]])}
        else{const z=f[2]>0?Z[1]:Z[0];v.push([X[0],Y[0],z],[X[1],Y[0],z],[X[1],Y[1],z],[X[0],Y[1],z])}
        const n=pos.length/3,cc=f[1]>0?top:f[1]<0?bot:c0;
        for(const p of v){pos.push(p[0],p[1],p[2]);nor.push(f[0],f[1],f[2]);col.push(cc.r,cc.g,cc.b)}
        idx.push(n,n+1,n+2,n,n+2,n+3)}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:0}));m.frustumCulled=false;return m}
  const KCOL={plat:'#6f86c9',wall:'#e0546e',vault:'#ffcf3f',arch:'#3fd0e8',side:'#3a4875',solid:'#6f86c9'};
  function gate(x,z,yaw,col,w){
    const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.8});
    for(const s of[-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.45,6,.45),m);p.position.set(s*w,3,0);g.add(p)}
    const bar=new THREE.Mesh(new THREE.BoxGeometry(w*2+.45,.5,.45),m);bar.position.y=6.1;g.add(bar);g.position.set(x,GY,z);g.rotation.y=yaw;return g}
  function build(){
    if(built||typeof PKI==='undefined'||!PKI.on||typeof THREE==='undefined'||typeof scene==='undefined')return;built=true;
    try{if(typeof LOCS!=='undefined'&&!LOCS.some(l=>l.n==='Parkour Isle'))LOCS.push({n:'Parkour Isle',x:PKI.x-100,z:PKI.z-100,r:PKI.R*.7})}catch(e){}   // Travel lands on the start line (ParkourCourse start = island-local -100,-100)
    K=world();W=P.makeWorld(K.boxes,K.base);W.killY=GY-14;
    G=new THREE.Group();G.name='ParkourIsle';scene.add(G);
    // the island's own ground (like the Warden Isles: islands outside ISL need their own terrain mesh)
    {const size=(PKI.reach+8)*2,seg=120,geo=new THREE.PlaneGeometry(size,size,seg,seg);geo.rotateX(-Math.PI/2);const pp=geo.attributes.position,cols=new Float32Array(pp.count*3),c=new THREE.Color();
      for(let i=0;i<pp.count;i++){const x=pp.getX(i)+PKI.x,z=pp.getZ(i)+PKI.z,h=H(x,z);pp.setY(i,h);terrainColor(h,x,z,c);const d=Math.hypot(x-PKI.x,z-PKI.z);if(h>1.5&&d<PKI.flat)c.lerp(new THREE.Color('#5d7fb5'),.35);cols.set([c.r,c.g,c.b],i*3)}
      geo.setAttribute('color',new THREE.BufferAttribute(cols,3));geo.computeVertexNormals();
      const tm=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});if(typeof TERRAIN_MATS!=='undefined')TERRAIN_MATS.push(tm);
      const m=new THREE.Mesh(geo,tm);m.position.set(PKI.x,0,PKI.z);m.receiveShadow=true;G.add(m)}
    const keep=['plat','wall','vault','arch','side'];
    for(const k of keep){const list=K.boxes.filter(b=>b.k===k);if(list.length)G.add(boxMesh(list,()=>KCOL[k]))}
    // start line + finish line gates, checkpoint rings
    const sx=K.start.x,sz=K.start.z;G.add(gate(sx,sz,Math.PI/2,'#43e8a0',5));
    G.add(gate(K.finish.x,K.finish.z,Math.PI/2*((K.cps[K.cps.length-1].d)&1?0:1),'#ffd24a',5.2));
    for(const c of K.cps){const r=new THREE.Mesh(new THREE.TorusGeometry(4.6,.14,6,28),new THREE.MeshBasicMaterial({color:'#7fb2ff',transparent:true,opacity:.55,fog:false}));
      r.position.set(c.x,c.y+2.4,c.z);r.rotation.y=(c.d&1)?0:Math.PI/2;r.userData.cp=c;G.add(r);rings.push(r)}
    // two pads beside the start line: race / free run
    const mk=(z,col,label)=>{const g=new THREE.Group(),pad=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,.3,24),new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.7}));pad.position.y=.18;g.add(pad);
      const sb=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,40,10,1,true),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.26,depthWrite:false,fog:false,side:THREE.DoubleSide}));sb.position.y=20;g.add(sb);
      g.position.set(sx-8,GY,z);G.add(g);pads.push({x:sx-8,z,g,label});return g};
    mk(sz-5,'#ff4fa3','race');mk(sz+5,'#4adfff','free');
    // the island is flat grass-less rock: give it a cool tint at the start so you can find it from the sea
    setupHud();
    const near=p=>Math.hypot(S.x-p.x,S.z-p.z)<3.4&&Math.abs(S.y-GY)<3;
    Interaction.register('pk-race','🏁 Parkour Race (3 runners)',()=>!mode&&near(pads[0]),()=>begin('race'));
    Interaction.register('pk-free','🧗 Free Run (no racers)',()=>!mode&&near(pads[1]),()=>begin('free'));
    // keys + buttons
    addEventListener('keydown',e=>{if(!mode||e.repeat)return;if(e.code==='KeyC'||e.code==='ShiftLeft'||e.code==='ShiftRight')edge.slide=true;else if(e.code==='KeyV')edge.trick=true;else if(e.code==='KeyR')respawn(true)});
    const jb=$('jump');if(jb){jb.addEventListener('pointerdown',()=>{held=true});for(const ev of['pointerup','pointercancel','pointerleave'])jb.addEventListener(ev,()=>{held=false})}}
  // ---------- HUD ----------
  function setupHud(){
    const css=document.createElement('style');css.textContent=`
#pkhud{position:fixed;z-index:6;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 56px);text-align:center;pointer-events:none;display:none;font:700 15px/1.25 system-ui;color:#fff;text-shadow:0 2px 8px #000}
#pkhud .r{font-size:22px;letter-spacing:.5px}#pkhud .s{opacity:.85;font-size:13px}
#pkflow{width:min(46vw,220px);height:8px;margin:6px auto 0;border-radius:6px;background:#0008;overflow:hidden}#pkflow i{display:block;height:100%;width:0;background:linear-gradient(90deg,#43e8a0,#ffd24a,#ff5a7a);transition:width .12s}
#pkcall{position:fixed;z-index:6;left:0;right:0;top:34%;text-align:center;pointer-events:none;font:900 34px/1 system-ui;letter-spacing:2px;color:#fff;text-shadow:0 3px 12px #000,0 0 22px #5af;opacity:0;transform:scale(.8)}
#pkcount{position:fixed;z-index:7;left:0;right:0;top:26%;text-align:center;pointer-events:none;font:900 96px/1 system-ui;color:#fff;text-shadow:0 4px 18px #000;display:none}
#pkres{position:fixed;z-index:8;left:50%;top:22%;transform:translateX(-50%);background:#0d1226ee;color:#fff;border:2px solid #7fb2ff;border-radius:16px;padding:16px 22px;font:600 16px/1.6 system-ui;display:none;min-width:240px;text-align:left;pointer-events:auto}
#pkres b{font-size:20px}
#pkbtns{position:fixed;z-index:6;display:none}
#pkbtns button{position:fixed;width:68px;height:68px;border-radius:50%;border:2px solid #fff8;color:#fff;font:800 13px system-ui;padding:0;touch-action:none}
#pkslide{right:calc(var(--R0,24px) + var(--J,88px) + 14px);bottom:calc(env(safe-area-inset-bottom,0px) + var(--B0,52px) + 8px);background:#1f9ec8cc}
#pkflip{right:calc(var(--R0,24px) + 10px);bottom:calc(env(safe-area-inset-bottom,0px) + var(--B0,52px) + var(--J,88px) + 16px);background:#c8399acc}
#pkresp{right:calc(var(--R0,24px) + var(--J,88px) + 14px);bottom:calc(env(safe-area-inset-bottom,0px) + var(--B0,52px) + 90px);background:#555d;width:52px!important;height:52px!important;font-size:11px!important}
#pkexit{right:14px;top:calc(env(safe-area-inset-top,0px) + 100px);background:#7a2a3acc;width:48px!important;height:48px!important;font-size:11px!important}`;
    document.head.appendChild(css);
    hud=document.createElement('div');hud.id='pkhud';hud.innerHTML='<div class="r"></div><div class="s"></div><div id="pkflow"><i></i></div>';document.body.appendChild(hud);pos=hud.querySelector('.r');fb=hud.querySelector('.s');
    call=document.createElement('div');call.id='pkcall';document.body.appendChild(call);
    counter=document.createElement('div');counter.id='pkcount';document.body.appendChild(counter);
    res=document.createElement('div');res.id='pkres';document.body.appendChild(res);
    btns=document.createElement('div');btns.id='pkbtns';btns.innerHTML='<button id="pkslide">SLIDE</button><button id="pkflip">FLIP</button><button id="pkresp">RE<br>SPAWN</button><button id="pkexit">EXIT</button>';document.body.appendChild(btns);
    const on=(id,fn)=>{const b=btns.querySelector('#'+id);b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();fn()})};
    on('pkslide',()=>{edge.slide=true});on('pkflip',()=>{edge.trick=true});on('pkresp',()=>respawn(true));on('pkexit',()=>stop(true))}
  function callout(txt,pts){if(!call)return;call.textContent=txt+(pts?'  +'+pts:'');call.style.transition='none';call.style.opacity=1;call.style.transform='scale(1.15)';
    void call.offsetWidth;call.style.transition='opacity .7s ease .25s,transform .35s ease';call.style.opacity=0;call.style.transform='scale(.9)'}
  // ---------- run lifecycle ----------
  function sfx(a,b,d,ty,v){try{const c=WAudio.get();if(!c)return;const o=c.createOscillator(),g=c.createGain();o.type=ty||'triangle';o.frequency.setValueAtTime(a,c.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,b),c.currentTime+d);g.gain.setValueAtTime(v||.1,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+d);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+d+.02)}catch(e){}}
  function begin(kind){
    if(mode||!built)return;
    if(typeof PlayerCombat!=='undefined'&&PlayerCombat.on&&PlayerCombat.on()){banner('Finish your fight first','PARKOUR');return}
    if(S.state==='swim'){banner('Climb out of the water first','PARKOUR');return}
    mode=kind;phase='count';S.flying=false;score=0;cpi=0;pit=0;results=[];fin=null;res.style.display='none';
    B=P.newBody(K.start.x,GY,K.start.z,K.start.yaw);B.vx=B.vz=0;B.spd=0;lastWI=0;acc=0;edge.jump=edge.slide=edge.trick=false;
    tcount=performance.now()+3300;tp(B.x,B.z,B.yaw);
    if(kind==='race')spawnRunners();
    hud.style.display='block';btns.style.display='block';counter.style.display='block';
    for(const r of rings)r.material.color.set('#7fb2ff');
    banner(kind==='race'?'Race to the golden gate · wall-run, vault, slide, flip':'Free run · checkpoints save your place','PARKOUR ISLE');chime()}
  function stop(toPad){
    if(!mode)return;mode=null;phase='';for(const r of runners){scene.remove(r.g);if(r.g.userData.mixer)r.g.userData.mixer.stopAllAction()}runners=[];
    if(hud){hud.style.display='none';btns.style.display='none';counter.style.display='none';res.style.display='none'}
    if(me&&me.userData){me.userData.pk=null}S.grounded=true;S.vy=0;
    if(toPad&&pads[0])tp(pads[0].x-3,pads[0].z,Math.PI/2)}
  const tp=(x,z,yaw)=>{S.x=x;S.z=z;S.y=Math.max(GY,H(x,z))+.05;S.vy=0;S.kx=0;S.kz=0;S.rot=yaw;S.yaw=Math.atan2(-Math.sin(yaw),-Math.cos(yaw))};
  function spawnRunners(){
    for(let i=0;i<3;i++){
      const g=makeAvatar(NAMES[i],COLS[i]);g.userData.nm=NAMES[i];scene.add(g);try{dress(g,i,null)}catch(e){}
      const b=P.newBody(K.start.x-1.2*(i+1),GY,K.start.z+(i%2?1:-1)*(1.6+Math.floor(i/2)*1.6),K.start.yaw);b.vx=b.vz=0;
      runners.push({g,B:b,ai:ParkourAI.create(SKILL[i],rngf(11+i*7)),name:NAMES[i],cpi:0,done:0,t:0,falls:0,wi:0});g.position.set(b.x,b.y,b.z)}}
  // respawn at the last checkpoint (manual = costs nothing but flow)
  function respawn(manual){
    if(!B||phase!=='run'&&!manual)return;const q=K.cps[cpi],fx=[1,0,-1,0][q.d],fz=[0,1,0,-1][q.d];
    B.x=q.x;B.z=q.z;B.y=q.y;B.vx=B.vz=B.vy=0;B.spd=0;B.mode='ground';B.grounded=true;B.flow=0;B.yaw=Math.atan2(fx,fz);B.flip=false;B.stumble=0;
    tp(q.x,q.z,B.yaw);S.y=q.y+.05;if(!manual)callout('RESPAWN');sfx(300,120,.25,'sawtooth',.06)}
  function runnerRespawn(r){const q=K.cps[r.cpi],fx=[1,0,-1,0][q.d],fz=[0,1,0,-1][q.d],b=r.B;b.x=q.x;b.z=q.z;b.y=q.y;b.vx=b.vz=b.vy=0;b.spd=0;b.mode='ground';b.flow=0;b.yaw=Math.atan2(fx,fz);b.flip=false;b.stumble=0;r.ai.wi=q.wi;r.ai.done={};r.ai.held=0;r.ai.miss=0;r.falls++}
  // ---------- input ----------
  function setInput(ix,iy,jumpQ){
    const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw);let dx=cy*ix+sy*iy,dz=-sy*ix+cy*iy;const len=Math.hypot(ix,iy);
    if(len>.12){const m=Math.min(1,len);dx=dx/len*m;dz=dz/len*m;inp.mx=dx;inp.mz=dz}else{inp.mx=0;inp.mz=0}
    if(jumpQ)edge.jump=true;inp.jumpHeld=held||!!keys.Space}
  // ---------- per-frame ----------
  const EVT={vault:['VAULT',40],slide:['SLIDE',30],wallrun:['WALL RUN',120],walljump:['WALL JUMP',80],wallkick:['WALL KICK',90],wallup:['WALL CLIMB',100],ledge:['LEDGE GRAB',50],mantle:['MANTLE',30],roll:['ROLL',60],flip:['FLIP',0],flipland:['CLEAN FLIP',200],stumble:['SLOPPY',0],hardland:['HARD LANDING',0],bhop:['BUNNY HOP',25]};
  function onEvents(ev){
    for(const e of ev){const d=EVT[e];if(!d)continue;let pts=0;if(d[1]){pts=Math.round(d[1]*(1+B.flow*2));score+=pts}
      if(e!=='slide'&&e!=='flip'&&e!=='bhop'&&e!=='mantle'&&e!=='ledge'||e==='ledge')callout(d[0],pts);
      if(e==='vault'||e==='wallup'||e==='wallkick'||e==='walljump'||e==='flipland')try{CameraRig.pulse(.7)}catch(x){}
      if(e==='roll'||e==='hardland'||e==='flipland')try{CameraRig.land(e==='hardland'?24:14)}catch(x){}
      if(e==='flipland'||e==='wallrun'||e==='wallkick'||e==='wallup')sfx(520,1100,.18,'triangle',.09);else if(e==='stumble'||e==='hardland')sfx(160,70,.2,'sawtooth',.08);else if(e==='vault'||e==='roll')sfx(380,620,.1,'triangle',.06)}}
  function stepPlayer(){
    const i=Object.assign({},inp,{jump:edge.jump,slide:edge.slide,trick:edge.trick});edge.jump=edge.slide=edge.trick=false;
    const ev=P.step(W,B,i,DT);ParkourAnim.note(B,ev);if(ev.length)onEvents(ev);
    // checkpoints
    for(let k=cpi+1;k<K.cps.length;k++){const q=K.cps[k];if(Math.hypot(B.x-q.x,B.z-q.z)<6&&Math.abs(B.y-q.y)<3){cpi=k;rings[k].material.color.set('#43e8a0');callout('CHECKPOINT '+k+'/'+(K.cps.length-1));sfx(660,990,.15,'sine',.1)}}
    // falls: the ground under a high section is lethal; so is the sea
    if(B.mode==='ground'&&B.y<GY+.6&&K.inPit(B.x,B.z)||ev.includes('fall')){respawn(false)}
    // finish
    if(!fin&&Math.hypot(B.x-K.finish.x,B.z-K.finish.z)<K.finish.r&&Math.abs(B.y-GY)<4){fin=performance.now()-t0;finish()}}
  function progressOf(b,r){ // arc length along the course: nearest waypoint ahead of the last known one
    let wi=r?r.wi:lastWI,best=1e9,bi=wi;for(let k=Math.max(0,wi-2);k<Math.min(K.wps.length,wi+8);k++){const d=Math.hypot(K.wps[k].x-b.x,K.wps[k].z-b.z);if(d<best){best=d;bi=k}}
    if(r)r.wi=bi;else lastWI=bi;return K.wd[bi]-Math.min(best,3)*0}
  function stepRunner(r,dt){
    const b=r.B;if(r.done){return}
    // rubber band: stay in the race without cheating (a few % either way)
    const mine=progressOf(B),her=progressOf(b,r);r.ai.speedK=Math.max(.8,Math.min(1,(.9+SKILL[runners.indexOf(r)]*.1)+(her>mine+25?-.06:her<mine-25?.04:0)));
    const world={wps:K.wps},input=ParkourAI.think(W,world,b,r.ai,dt);const ev=P.step(W,b,input,dt);ParkourAnim.note(b,ev);r.t+=dt;
    for(let k=r.cpi+1;k<K.cps.length;k++){const q=K.cps[k];if(Math.hypot(b.x-q.x,b.z-q.z)<6&&Math.abs(b.y-q.y)<3)r.cpi=k}
    if(b.mode==='ground'&&b.y<GY+.6&&K.inPit(b.x,b.z)||ev.includes('fall')||b.y<GY-14)runnerRespawn(r);
    if(Math.hypot(b.x-K.finish.x,b.z-K.finish.z)<K.finish.r&&Math.abs(b.y-GY)<4){r.done=performance.now()-t0;results.push({name:r.name,ms:r.done})}}
  function finish(){
    results.push({name:'You',ms:fin,me:1});phase='done';finT=performance.now();
    sfx(520,1040,.4,'triangle',.12);setTimeout(()=>sfx(780,1560,.5,'triangle',.12),160);
    showResults()}
  function showResults(){
    const all=results.slice();for(const r of runners)if(!r.done)all.push({name:r.name,ms:1e12,dnf:1});all.sort((a,b)=>a.ms-b.ms);
    const place=all.findIndex(x=>x.me)+1,ord=['1st','2nd','3rd','4th'][place-1]||place+'th',best=(()=>{let b=+localStorage.getItem('w4pk')||1e12;if(fin<b){b=fin;try{localStorage.setItem('w4pk',b)}catch(e){}}return b})();
    res.innerHTML='<b>'+(mode==='race'?(place===1?'🏆 YOU WIN!':'🏁 '+ord+' place'):'🏁 Finished')+'</b><br>'+all.map((x,i)=>(x.me?'<b>':'')+(i+1)+'. '+x.name+'  '+(x.dnf?'racing…':fmt(x.ms))+(x.me?'</b>':'')).join('<br>')
      +'<br><span style="opacity:.8">Style '+score+' · best '+fmt(best)+'</span><br><button id="pkagain" style="margin-top:8px;padding:8px 14px;border-radius:10px;border:0;background:#43e8a0;font-weight:800">Run again</button> <button id="pkdone" style="margin-top:8px;padding:8px 14px;border-radius:10px;border:0;background:#cfd6ee;font-weight:800">Done</button>';
    res.style.display='block';shown=results.length;
    res.querySelector('#pkagain').onclick=()=>{const k=mode;stop(false);begin(k)};res.querySelector('#pkdone').onclick=()=>stop(true)}
  function stepOnce(){
    if(phase==='count')return;
    if(phase==='run'){for(const r of runners)stepRunner(r,DT);stepPlayer()}
    else if(phase==='done'){for(const r of runners)stepRunner(r,DT);P.step(W,B,{mx:0,mz:0},DT)}}   // the player coasts to a stop while the others finish
  function frame(dt,t){
    if(!mode||!B)return;S.flying=false;
    if(phase==='count'){const left=tcount-performance.now(),n=Math.ceil(left/1000);
      if(left<=0){phase='run';t0=performance.now();counter.textContent='GO!';counter.style.display='block';sfx(660,1320,.3,'square',.1);setTimeout(()=>{if(counter.textContent==='GO!')counter.style.display='none'},700)}
      else if(counter.textContent!==String(n)&&n<=3){counter.textContent=n;sfx(330,330,.12,'square',.08)}}
    acc=Math.min(acc+dt,.1);let n=0;while(acc>=DT&&n<5){acc-=DT;n++;stepOnce()}
    // body -> player
    S.x=B.x;S.y=B.y;S.z=B.z;S.vy=B.vy;S.grounded=B.mode!=='air';S.fvx=S.fvz=0;S.gvx=B.vx;S.gvz=B.vz;
    const want=(B.mode==='ledge'||B.mode==='mantle')?B.yaw:(B.spd>.6?B.yaw:S.rot);S.rot=lerpAngle(S.rot,want,1-Math.exp(-18*dt));
    S.state=B.mode==='air'?(B.vy>0?'jump':'fall'):(B.spd>.5||B.mode!=='ground'?'run':'idle');
    P.animOf(B);if(me&&me.userData)ParkourAnim.drive(me.userData,B,dt);
    // runners -> avatars
    for(const r of runners){const b=r.B,g=r.g;g.position.set(b.x,b.y,b.z);g.rotation.y=lerpAngle(g.rotation.y,b.spd>.6||b.mode==='ledge'||b.mode==='mantle'?b.yaw:g.rotation.y,1-Math.exp(-18*dt));
      P.animOf(b);ParkourAnim.drive(g.userData,b,dt);const st=b.mode==='air'?(b.vy>0?'jump':'fall'):(b.spd>.5||b.mode!=='ground'?'run':'idle');try{animate(g,dt,st)}catch(e){}}
    hudUpdate()}
  function hudUpdate(){
    if(!hud)return;const now=performance.now(),el=phase==='run'?now-t0:phase==='done'?fin:0;
    let rank='';if(mode==='race'&&phase!=='count'){const me_=phase==='done'?1e9:progressOf(B);let p=1;for(const r of runners){if(r.done&&phase!=='done'||(!r.done&&progressOf(r.B,r)>me_))p++}if(phase==='done')p=results.findIndex(x=>x.me)+1;rank='P'+p+'/4  ·  '}
    pos.textContent=rank+fmt(el);fb.textContent='CP '+cpi+'/'+(K.cps.length-1)+'  ·  STYLE '+score+(B.flow>.05?'  ·  FLOW '+Math.round(B.flow*100)+'%':'');
    hud.querySelector('#pkflow i').style.width=Math.round(B.flow*100)+'%';
    if(phase==='done'&&res.style.display==='block'&&results.length!==shown){shown=results.length;showResults()}   // keep the table live while the others finish
    if(phase==='run'&&now-t0>240000){banner('Time is up','PARKOUR');stop(true)}
    counter.style.display=phase==='count'||counter.textContent==='GO!'&&now-t0<700?'block':'none'}
  let tPad=0;
  function idle(dt,t){
    if(!built)return;tPad+=dt;
    for(const p of pads){p.g.rotation.y+=dt*1.2;p.g.children[0].position.y=.18+Math.sin(t/400+p.z)*.04}
    for(const r of rings){r.rotation.z+=dt*.6}
    // practice free run: leaving the island by sea ends the run
    if(mode&&Math.hypot(S.x-PKI.x,S.z-PKI.z)>PKI.R+30)stop(true)}
  const pack=()=>mode&&me&&me.userData&&me.userData.pk?me.userData.pk+'|'+(+(me.userData.pkts||1)).toFixed(2):'';
  return{build,on:()=>!!mode&&!!B,setInput,frame,idle,pack,begin,stop,world,boxMesh}})();
