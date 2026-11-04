// IRON FIST ISLE: the hand-to-hand island. Own terrain (a mesa, see DOJO in data/islands.js + the H() term in index.html), own dojo, own fight camera, own touch controls and HUD.
// Combat is the deterministic CombatCore with the Bare Hands moveset (src/combat/Fists.js), animated by REAL clips (WardenMX role 'player_dojo'); opponents are DojoAI brains (archetypes in data/dojo.js).
// Walk into the ring and tap FIGHT: a trial of rounds, belts for progress, coins for clearing rounds.
// Globals used: THREE, scene, camera, S, me, H, solids, LOCS, WardenMX, CombatCore, Fists, DojoAI, DojoData, DOJO, makeAvatar, dress, animate, emoStop, loadEmotes, WAudio, Outlaw, Expedition, HudMode, keys, stickV.
const Dojo=(()=>{
  const RING=15.5,YARD=()=>DOJO.arenaR,CX=()=>DOJO.x,CZ=()=>DOJO.z;
  const SPD=3.7,GSPD=2.1,CSPD=1.7;
  let built=false,G=null,el=null,fighting=false,C=null,ST=null,P=null,foes=[],byId={},pool=[],pAnim=null,vt=0,tsc=1,tscT=0,state='idle',stateT=0,round=0,roundCleared=0,sessKills=0;
  let dirr=DojoAI.director(),combo=0,comboT=0,best=0,lastEv=[],hurtT=0,flashT=0,sparks=[],mats={},down={heavy:false,guard:false},ptr={},pv={x:0,z:0,vf:0,vs:0,sp:0,init:false},seed=1,near=false,msgT=0,hintT=0,tsFix=0;
  const cs={yaw:0,off:0,dragT:0,last:0,init:false,shk:0,fk:0,fov:54,D:5.2,H:1.9,lx:0,lz:0,tm:0};
  const SAVE=(()=>{let j={};try{j=JSON.parse(localStorage.getItem('dojo')||'{}')}catch(e){}return Object.assign({cleared:0,best:0,wins:0,rounds:0,style:'striker'},j)})();
  const save=()=>{try{localStorage.setItem('dojo',JSON.stringify(SAVE))}catch(e){}};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),now=()=>vt;
  const belt=()=>DojoData.belt(SAVE.cleared),PS=()=>DojoData.player(belt());
  // ---------- audio ----------
  let lastTone=0;
  function tone(f0,f1,dur,type,vol){try{const n=performance.now();if(n-lastTone<22)return;lastTone=n;const a=WAudio.get();if(!a)return;const o=a.createOscillator(),g=a.createGain();o.type=type||'triangle';
    o.frequency.setValueAtTime(f0,a.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),a.currentTime+dur);o.connect(g);g.connect(WAudio.out());
    g.gain.setValueAtTime(vol||.12,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+dur);o.start();o.stop(a.currentTime+dur+.02)}catch(e){}}
  const sfx=(n,v,r,fb)=>{try{if(typeof WardenSfx!=='undefined'&&WardenSfx.play(n,v,r))return}catch(e){}if(fb)fb()};
  // ---------- the island (meshes only: the ground itself is H()) ----------
  const mat=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.9,flatShading:true},o||{}));
  function colour(h,x,z,sl,c){const dx=x-CX(),dz=z-CZ(),d=Math.hypot(dx,dz),n=(Math.sin(x*.21)*Math.cos(z*.17)+Math.sin(x*.07+z*.05))*.25+.5;
    if(d<YARD()+2){const cell=(Math.floor(Math.atan2(dx,dz)*d/2.6)+Math.floor(d/3.1)*5)&3;c.setRGB(.5+cell*.015+n*.04,.46+cell*.015+n*.04,.4+cell*.012+n*.04);return}
    c.setRGB(.2+n*.08,.42+n*.12,.15+n*.05);if(sl>.4)c.setRGB(.42,.36,.3);
    if(h<1.3)c.lerp(new THREE.Color(.78,.7,.5),clamp((1.3-h)/1.3,0,1));if(h<-.4)c.lerp(new THREE.Color('#14587a'),clamp((-.4-h)/2.4,0,1))}
  function terrain(){const size=(DOJO.reach+8)*2,seg=120,geo=new THREE.PlaneGeometry(size,size,seg,seg);geo.rotateX(-Math.PI/2);
    const pos=geo.attributes.position,cols=new Float32Array(pos.count*3),c=new THREE.Color();
    for(let i=0;i<pos.count;i++){const x=pos.getX(i)+CX(),z=pos.getZ(i)+CZ(),h=H(x,z);pos.setY(i,h);const sl=Math.hypot(H(x+2,z)-H(x-2,z),H(x,z+2)-H(x,z-2))/4;colour(h,x,z,sl,c);cols.set([c.r,c.g,c.b],i*3)}
    geo.setAttribute('color',new THREE.BufferAttribute(cols,3));geo.computeVertexNormals();
    const tm=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});if(typeof TERRAIN_MATS!=='undefined')TERRAIN_MATS.push(tm);
    const m=new THREE.Mesh(geo,tm);m.position.set(CX(),0,CZ());m.receiveShadow=true;G.add(m)}
  const lamps=[];
  function lantern(x,z,y,s){const g=new THREE.Group(),post=new THREE.Mesh(new THREE.CylinderGeometry(.09*s,.11*s,2.2*s,6),mat('#3a2a20'));post.position.y=1.1*s;g.add(post);
    const b=new THREE.Mesh(new THREE.BoxGeometry(.5*s,.55*s,.5*s),new THREE.MeshBasicMaterial({color:'#ffb35a'}));b.position.y=2.4*s;g.add(b);lamps.push(b);
    const cap=new THREE.Mesh(new THREE.ConeGeometry(.42*s,.3*s,4),mat('#3a1d18'));cap.position.y=2.8*s;cap.rotation.y=Math.PI/4;g.add(cap);g.position.set(x,y,z);G.add(g)}
  function dojoBuild(){
    const y=DOJO.y,cx=CX(),cz=CZ();
    // the floor: a stone yard, a pale wooden ring with a red inlay
    const yard=new THREE.Mesh(new THREE.CircleGeometry(YARD(),48),mat('#8e8576',{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));yard.rotation.x=-Math.PI/2;yard.position.set(cx,y+.02,cz);yard.receiveShadow=true;G.add(yard);
    const ring=new THREE.Mesh(new THREE.CircleGeometry(RING,48),mat('#c7a066',{polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));ring.rotation.x=-Math.PI/2;ring.position.set(cx,y+.04,cz);ring.receiveShadow=true;G.add(ring);
    const red=new THREE.Mesh(new THREE.RingGeometry(RING-.9,RING-.35,64),new THREE.MeshBasicMaterial({color:'#a8201c',polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));red.rotation.x=-Math.PI/2;red.position.set(cx,y+.05,cz);G.add(red);
    const cen=new THREE.Mesh(new THREE.RingGeometry(2.2,2.6,48),new THREE.MeshBasicMaterial({color:'#a8201c',polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));cen.rotation.x=-Math.PI/2;cen.position.set(cx,y+.05,cz);G.add(cen);
    // eight lanterns round the ring
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2+.39;lantern(cx+Math.sin(a)*(RING+1.4),cz+Math.cos(a)*(RING+1.4),y,1.05)}
    // the torii gate at the south path
    const tg=new THREE.Group(),rm=mat('#b02a20'),dk=mat('#2a1a16');
    for(const sx of[-1,1]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.34,.4,6,8),rm);p.position.set(sx*3.2,3,0);tg.add(p)}
    const b1=new THREE.Mesh(new THREE.BoxGeometry(9.4,.5,.7),rm);b1.position.y=5.6;tg.add(b1);const b2=new THREE.Mesh(new THREE.BoxGeometry(10.6,.35,.9),dk);b2.position.y=6.2;tg.add(b2);const b3=new THREE.Mesh(new THREE.BoxGeometry(7.2,.3,.45),rm);b3.position.y=4.7;tg.add(b3);
    tg.position.set(cx,y,cz+YARD()+5);G.add(tg);
    // the dojo hall behind the ring: timber walls, a dark hipped roof, a lit doorway
    const hall=new THREE.Group(),w=new THREE.Mesh(new THREE.BoxGeometry(24,5.2,12),mat('#7a5634'));w.position.y=2.6;hall.add(w);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(15.5,5.2,4),mat('#2f2a33'));roof.rotation.y=Math.PI/4;roof.scale.set(1,1,.62);roof.position.y=7.7;hall.add(roof);
    const door=new THREE.Mesh(new THREE.BoxGeometry(5,3.6,.3),new THREE.MeshBasicMaterial({color:'#ffcf8a'}));door.position.set(0,1.9,6.1);hall.add(door);
    for(const sx of[-8,8]){const wn=new THREE.Mesh(new THREE.BoxGeometry(2.6,1.6,.3),new THREE.MeshBasicMaterial({color:'#e9b25f'}));wn.position.set(sx,3,6.1);hall.add(wn)}
    for(const sx of[-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.5,5.2,.5),dk);p.position.set(sx*12,2.6,6.1);hall.add(p)}
    hall.position.set(cx,y,cz-YARD()-9);hall.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});G.add(hall);
    for(const sx of[-8,0,8])solids.push({x:cx+sx,z:cz-YARD()-9,r:6.4,h:8});
    // training dummies by the hall
    for(const sx of[-17,-12,12,17]){const dm=new THREE.Group(),po=new THREE.Mesh(new THREE.CylinderGeometry(.22,.26,1.7,8),mat('#6a4a2c'));po.position.y=.85;dm.add(po);const ar=new THREE.Mesh(new THREE.BoxGeometry(1.5,.18,.18),mat('#6a4a2c'));ar.position.y=1.35;dm.add(ar);
      const hd=new THREE.Mesh(new THREE.SphereGeometry(.24,8,6),mat('#c9b48a'));hd.position.y=1.95;dm.add(hd);dm.position.set(cx+sx,y,cz-YARD()+2);G.add(dm);solids.push({x:cx+sx,z:cz-YARD()+2,r:.5,h:2})}
    // pines round the rim (cheap cones)
    const tmat=mat('#2a5a34'),tr=mat('#4a3322'),N=26,tm=new THREE.InstancedMesh(new THREE.ConeGeometry(1.7,5.2,6),tmat,N),tt=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.24,1.6,5),tr,N),D=new THREE.Object3D();
    for(let i=0;i<N;i++){const a=i/N*Math.PI*2+Math.sin(i*7.3)*.12,r=YARD()+13+Math.abs(Math.sin(i*3.1))*20,x=cx+Math.sin(a)*r,z=cz+Math.cos(a)*r;if(Math.abs(Math.sin(a))<.16&&Math.cos(a)>0){D.position.set(0,-50,0);D.scale.setScalar(.001);D.updateMatrix();tm.setMatrixAt(i,D.matrix);tt.setMatrixAt(i,D.matrix);continue}
      const hh=H(x,z),s=.8+Math.abs(Math.sin(i*5.7))*.7;D.scale.setScalar(s);D.position.set(x,hh+.8*s,z);D.updateMatrix();tt.setMatrixAt(i,D.matrix);D.position.set(x,hh+3.4*s,z);D.updateMatrix();tm.setMatrixAt(i,D.matrix);if(hh>.8)solids.push({x,z,r:.5,h:5})}
    tm.castShadow=tt.castShadow=true;G.add(tm);G.add(tt)}
  function build(){
    if(built||typeof DOJO==='undefined'||!DOJO.on)return;built=true;G=new THREE.Group();G.name='IronFistIsle';scene.add(G);
    terrain();dojoBuild();LOCS.push({n:'Iron Fist Isle',x:CX(),z:CZ()+YARD()+16,r:DOJO.R*.6});
    try{HudMode.extra.push(()=>fighting)}catch(e){}
    css()}
  // ---------- sparks ----------
  function sparkBuild(){const g=new THREE.BoxGeometry(.07,.07,.28);for(const k of['hit','big','block','par']){const c=k==='hit'?'#ffe9b0':k==='big'?'#ff9a3a':k==='par'?'#bfe4ff':'#ffffff';mats[k]=new THREE.MeshBasicMaterial({color:c,transparent:true,depthWrite:false})}
    for(let i=0;i<46;i++){const m=new THREE.Mesh(g,mats.hit);m.visible=false;m.frustumCulled=false;scene.add(m);sparks.push({m,vx:0,vy:0,vz:0,t:0,l:0,k:'hit'})}}
  function burst(x,y,z,k,n){if(!sparks.length)return;let c=0;for(const s of sparks){if(s.t<s.l)continue;const a=Math.random()*6.283,u=Math.random()*.9+.1,sp=(k==='big'?7:4.4)*(.5+u);s.vx=Math.cos(a)*sp;s.vz=Math.sin(a)*sp;s.vy=(Math.random()*.9+.2)*sp*.8;s.t=0;s.l=.18+Math.random()*.16;s.m.material=mats[k];s.m.position.set(x,y,z);s.m.visible=true;s.m.lookAt(x+s.vx,y+s.vy,z+s.vz);if(++c>=n)break}}
  function sparkTick(dt){for(const s of sparks){if(s.t>=s.l){if(s.m.visible)s.m.visible=false;continue}s.t+=dt;s.vy-=14*dt;s.m.position.x+=s.vx*dt;s.m.position.y+=s.vy*dt;s.m.position.z+=s.vz*dt;s.m.material.opacity=clamp(1-s.t/s.l,0,1);s.m.lookAt(s.m.position.x+s.vx,s.m.position.y+s.vy,s.m.position.z+s.vz)}}
  // ---------- DOM ----------
  function css(){if(document.getElementById('dojoCss'))return;const s=document.createElement('style');s.id='dojoCss';s.textContent=`
#dj{position:fixed;inset:0;z-index:48;pointer-events:none;font-family:system-ui,sans-serif;color:#fff;display:none;user-select:none;-webkit-user-select:none;touch-action:none}
#dj.on{display:block}#dj button{pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent;font-family:inherit}
#dj .bars{position:absolute;left:12px;top:max(10px,env(safe-area-inset-top));width:min(46vw,250px)}
#dj .bar{height:11px;border-radius:6px;background:rgba(0,0,0,.55);overflow:hidden;margin-bottom:4px;border:1px solid rgba(255,255,255,.25)}#dj .bar b{display:block;height:100%;transform-origin:left;transition:transform .08s linear}
#dj .hp b{background:linear-gradient(#ff6a5a,#c4281c)}#dj .st b{background:linear-gradient(#7fe08a,#2f9a44);height:7px}#dj .st{height:7px}#dj .po b{background:linear-gradient(#ffd070,#e08a1c)}
#dj .belt{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;margin-top:2px;text-shadow:0 1px 3px #000}#dj .belt i{display:inline-block;width:26px;height:6px;border-radius:2px;margin-right:6px;vertical-align:middle;border:1px solid #0006}
#dj .foes{position:absolute;right:112px;top:max(10px,env(safe-area-inset-top));width:min(40vw,210px)}
#dj .fo{margin-bottom:6px;text-align:right;text-shadow:0 1px 3px #000;font-size:12px;transition:opacity .4s}#dj .fo.t .bar{border-color:#ffd070}#dj .fo.d{opacity:.25}
#dj .top{position:absolute;left:0;right:0;top:max(46px,env(safe-area-inset-top));text-align:center;font-size:12px;letter-spacing:.2em;text-shadow:0 1px 4px #000}
#dj .combo{position:absolute;left:0;right:0;top:calc(max(46px,env(safe-area-inset-top)) + 24px);text-align:center;font:800 28px system-ui;font-style:italic;color:#ffd070;text-shadow:0 2px 8px #000;opacity:0;transition:opacity .2s}#dj .combo small{font-size:12px;display:block;letter-spacing:.2em;color:#fff}
#dj .msg{position:absolute;left:0;right:0;top:34%;text-align:center;font:900 30px system-ui;letter-spacing:.1em;text-shadow:0 2px 10px #000,0 0 2px #000;opacity:0;transition:opacity .25s;white-space:pre-line}
#dj .hint{position:absolute;left:0;right:0;bottom:26%;text-align:center;font:700 13px system-ui;letter-spacing:.12em;color:#ffd070;text-shadow:0 1px 4px #000;opacity:0;transition:opacity .2s}
#dj .fl{position:absolute;inset:0;background:radial-gradient(transparent 40%,rgba(255,30,20,.55));opacity:0;transition:opacity .25s}
#dj .btn{position:absolute;border-radius:50%;border:2px solid rgba(255,255,255,.55);background:rgba(20,16,24,.55);color:#fff;font-weight:800;font-size:12px;letter-spacing:.06em;text-transform:uppercase;backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;flex-direction:column;line-height:1.1}
#dj .btn b{font-size:24px;line-height:1}#dj .btn.dn{background:rgba(255,200,90,.5);transform:scale(.94)}#dj .btn.on{border-color:#ffd070;color:#ffd070}
#dj .L{right:18px;bottom:max(30px,env(safe-area-inset-bottom));width:96px;height:96px;background:rgba(180,40,30,.5)}
#dj .Hv{right:128px;bottom:max(62px,env(safe-area-inset-bottom));width:80px;height:80px;background:rgba(200,110,20,.5)}
#dj .Gd{right:24px;bottom:max(146px,env(safe-area-inset-bottom));width:70px;height:70px;background:rgba(40,100,190,.5)}
#dj .Dg{right:112px;bottom:max(152px,env(safe-area-inset-bottom));width:66px;height:66px;background:rgba(40,150,100,.5)}
#dj .Gr{right:206px;bottom:max(96px,env(safe-area-inset-bottom));width:62px;height:62px;background:rgba(120,50,170,.5)}
#dj .Lk{right:16px;top:150px;width:48px;height:48px;font-size:10px}#dj .Qt{left:12px;top:92px;border-radius:14px;width:auto;height:30px;padding:0 10px;font-size:11px}
#dj .res{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);pointer-events:auto}#dj .res.on{display:flex}
#dj .card{background:rgba(24,18,26,.94);border:2px solid #ffd070;border-radius:16px;padding:18px 22px;text-align:center;max-width:300px}#dj .card h2{margin:0 0 6px;font-size:22px;letter-spacing:.08em}#dj .card p{margin:4px 0 12px;font-size:13px;opacity:.9;white-space:pre-line}
#dj .card button{margin:4px;padding:10px 18px;border-radius:10px;border:0;background:#ffd070;color:#201;font-weight:800;font-size:14px}#dj .card button.s{background:#555;color:#fff}
body.dojo-fight #jump,body.dojo-fight .dk-menu,body.dojo-fight .dk-fab,body.dojo-fight #banner{display:none!important}
#djst{position:fixed;left:50%;bottom:calc(22% + 78px);transform:translateX(-50%);z-index:47;display:none;flex-wrap:wrap;justify-content:center;gap:6px;max-width:92vw;pointer-events:auto}#djst button{width:auto;min-width:0;margin:0;padding:6px 10px;border-radius:10px;border:1.5px solid rgba(255,208,112,.5);background:rgba(30,20,20,.78);color:#fff;font:700 12px system-ui;display:flex;gap:4px;align-items:center}#djst button.on{background:#ffd070;color:#201;border-color:#ffd070}#djst i{flex-basis:100%;text-align:center;font:600 11px system-ui;color:#fff;font-style:normal;text-shadow:0 1px 3px #000}
#djgo{position:fixed;left:50%;bottom:22%;transform:translateX(-50%);z-index:47;display:none;padding:14px 30px;border-radius:14px;border:2px solid #ffd070;background:rgba(40,16,16,.82);color:#ffd070;font:900 20px system-ui;letter-spacing:.14em;pointer-events:auto;text-align:center}#djgo small{display:block;font-size:11px;letter-spacing:.1em;color:#fff;font-weight:600;margin-top:2px}
`;document.head.appendChild(s)}
  function domBuild(){
    if(el)return;el=document.createElement('div');el.id='dj';
    el.innerHTML='<div class="fl"></div><div class="bars"><div class="bar hp"><b></b></div><div class="bar st"><b></b></div><div class="belt"><i></i><span></span></div></div><div class="foes"></div><div class="top"></div><div class="combo"></div><div class="msg"></div><div class="hint"></div>'+
      '<button class="btn Hv" data-k="heavy"><b>\u{1F4A5}</b>Heavy</button><button class="btn L" data-k="light"><b>\u{1F44A}</b>Strike</button><button class="btn Gd" data-k="guard"><b>\u{1F6E1}</b>Guard</button><button class="btn Dg" data-k="dodge"><b>\u{1F4A8}</b>Dodge</button><button class="btn Gr" data-k="grab"><b>\u{1F91C}</b>Grab</button><button class="btn Lk on" data-k="lock">Lock</button><button class="btn Qt" data-k="quit">Leave</button>'+
      '<div class="res"><div class="card"><h2></h2><p></p><div></div></div></div>';
    document.body.appendChild(el);
    for(const b of el.querySelectorAll('button.btn')){const k=b.dataset.k;
      b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(ptr[k]!==undefined)return;ptr[k]=e.pointerId;try{b.setPointerCapture(e.pointerId)}catch(_){}b.classList.add('dn');press(k)});
      const up=e=>{if(ptr[k]!==e.pointerId)return;delete ptr[k];b.classList.remove('dn');if(k==='heavy'||k==='guard')release(k);e.stopPropagation()};
      b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',up);b.addEventListener('contextmenu',e=>e.preventDefault())}
    goBtn=document.createElement('button');goBtn.id='djgo';document.body.appendChild(goBtn);
    goBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();start()});
    stBar=document.createElement('div');stBar.id='djst';document.body.appendChild(stBar);
    for(const k of DojoData.styleOrder){const S0=DojoData.styles[k],b=document.createElement('button');b.dataset.k=k;b.innerHTML=S0.ic+'<span>'+S0.n+'</span>';b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();SAVE.style=k;save();paintStyle()});stBar.appendChild(b)}
    paintStyle();
    addEventListener('keydown',onKey,true);addEventListener('keyup',onKey,true);addEventListener('blur',releaseAll)}
  let goBtn=null,stBar=null;
  function paintStyle(){if(!stBar)return;for(const b of stBar.children)b.classList.toggle('on',b.dataset.k===SAVE.style);const t=stBar.querySelector('i')||stBar.appendChild(document.createElement('i'));t.textContent=DojoData.styles[SAVE.style].tip}
  const q=s=>el.querySelector(s);
  function say(t,sec,col){const m=q('.msg');m.textContent=t;m.style.color=col||'#fff';m.style.opacity=1;msgT=sec||1.1}
  function hint(t,sec){const h=q('.hint');h.textContent=t;h.style.opacity=t?1:0;hintT=sec||1.2}
  function flash(col,a){const f=q('.fl');f.style.background='radial-gradient(transparent 38%,'+col+')';f.style.opacity=a;flashT=.22}
  // ---------- input ----------
  const KEY={KeyF:'light',KeyJ:'light',KeyG:'heavy',KeyK:'heavy',KeyQ:'guard',KeyL:'guard',Space:'dodge',KeyE:'grab',Tab:'lock'};
  function onKey(e){if(!fighting||e.target&&e.target.tagName==='INPUT')return;const n=KEY[e.code];
    if(e.type==='keydown'){if(n){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)press(n)}}else if(n){if(n==='heavy'||n==='guard')release(n);e.stopImmediatePropagation()}}
  function stickDir(){let ix=typeof stickV!=='undefined'?stickV.x:0,iy=typeof stickV!=='undefined'?stickV.y:0;
    if(keys.KeyA||keys.ArrowLeft)ix-=1;if(keys.KeyD||keys.ArrowRight)ix+=1;if(keys.KeyW||keys.ArrowUp)iy-=1;if(keys.KeyS||keys.ArrowDown)iy+=1;
    const l=Math.hypot(ix,iy);if(l<.2)return null;ix/=l;iy/=l;const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw);return[cy*ix+sy*iy,-sy*ix+cy*iy]}
  const alive=()=>foes.filter(F=>F.f.act!=='dead');
  let lockI=-1;
  function target(){const L=foes[lockI];if(L&&L.f.act!=='dead')return L;let b=null,bd=1e9;for(const F of foes){if(F.f.act==='dead')continue;const d=Math.hypot(F.f.x-S.x,F.f.z-S.z);if(d<bd){bd=d;b=F}}if(b)lockI=foes.indexOf(b);return b}
  function press(k){
    if(!fighting)return;if(k==='quit'){leave(true);return}if(k==='lock'){cycleLock();return}
    if(!P||P.act==='dead'||state!=='fight')return;const t=now(),T=target(),D=T&&T.f;
    switch(k){
      case'light':{faceAssist();const c={t:'light',e:C.tick},d=stickDir(),fa=S.rot;if(d&&d[0]*Math.sin(fa)+d[1]*Math.cos(fa)>.6)c.adv=true;if(D&&Math.hypot(D.x-P.x,D.z-P.z)>4.2)c.far=true;ST.input('P',c,t);break}
      case'heavy':if(down.heavy)return;faceAssist();down.heavy=true;ST.input('P',{t:'heavyDown',e:C.tick},t);break;
      case'guard':if(down.guard)return;down.guard=true;ST.input('P',{t:'parry',e:C.tick},t);break;
      case'dodge':{const d=stickDir(),c={t:'dodge',e:C.tick};if(d){c.dx=d[0];c.dz=d[1];if(D){const fx=D.x-P.x,fz=D.z-P.z,L=Math.hypot(fx,fz)||1;if(Math.abs((d[0]*fx+d[1]*fz)/L)<.55)c.side=1}}ST.input('P',c,t);break}
      case'grab':{faceAssist();
        if(D&&D.act==='stun'&&D.sk==='stagger'&&Math.hypot(D.x-P.x,D.z-P.z)<Fists.TAKE_RANGE+D.r+.3){ST.input('P',{t:'heavyDown',e:C.tick},t);ST.input('P',{t:'heavyUp'},t+120);break}
        if(D&&Math.hypot(D.x-P.x,D.z-P.z)<Fists.THROW_RANGE+D.r+.3){ST.input('P',{t:'guardDown',e:C.tick},t);ST.input('P',{t:'heavyDown',e:C.tick},t+34);ST.input('P',{t:'heavyUp'},t+100);ST.input('P',{t:'guardUp'},t+170);break}
        say('TOO FAR',.5,'#ccc');break}}}
  function release(k){if(!fighting||!ST)return;const t=now();if(k==='heavy'&&down.heavy){down.heavy=false;ST.input('P',{t:'heavyUp'},t)}else if(k==='guard'&&down.guard){down.guard=false;ST.input('P',{t:'guardUp'},t)}}
  function releaseAll(){release('heavy');release('guard');for(const k in ptr)delete ptr[k];if(el)for(const b of el.querySelectorAll('button.dn'))b.classList.remove('dn')}
  function cycleLock(){const al=alive();if(al.length<2)return;const ord=al.slice().sort((a,b)=>Math.hypot(a.f.x-S.x,a.f.z-S.z)-Math.hypot(b.f.x-S.x,b.f.z-S.z)),k=ord.indexOf(foes[lockI]);lockI=foes.indexOf(ord[(k+1)%ord.length]);tone(500,700,.06,'square',.05)}
  function faceAssist(){const T=target();if(!T)return;const a=Math.atan2(T.f.x-S.x,T.f.z-S.z);S.rot=a}
  // ---------- bodies ----------
  const TINT=new THREE.Color();
  function body(i){let b=pool[i];if(b){b.g.visible=true;return b}
    const g=makeAvatar('Fighter','#3a2a2a');for(const c of g.children.slice())if(c.isSprite)g.remove(c);scene.add(g);b={g,u:g.userData,anim:null,styled:null,flash:0,flashOn:false,loco:{x:0,z:0,vf:0,vs:0,sp:0,init:false}};pool[i]=b;return b}
  // dress a body in a real character; never falls back to the chibi (that is what the capsule stand-in was). A superseded request (the look changed again) is simply dropped, a failed load retries.
  function wear(b,look,n){AvatarKit.apply(b.g,{b:look}).then(ok=>{if(!ok&&b.look===look&&b.u.av!==look&&(n||0)<4)setTimeout(()=>{if(b.look===look&&b.u.av!==look)wear(b,look,(n||0)+1)},2500)}).catch(()=>{})}
  function style(b,T){if(b.styled===T.id||!b.u.model||b.u.av!==b.look)return;b.styled=T.id;const t=T.tint;b.u.model.traverse(c=>{if(c.isSkinnedMesh&&c.material&&c.material.color){if(!c.material.userData.c0)c.material.userData.c0=c.material.color.clone();c.material.color.copy(c.material.userData.c0).multiply(TINT.setRGB(t[0],t[1],t[2]))}})}
  function mkFoes(){
    for(const F of foes){if(F.prop&&F.prop.parent)F.prop.parent.remove(F.prop);F.body.g.visible=false;if(F.body.anim)F.body.anim.off()}foes=[];byId={};
    const names=DojoData.lineup(round,rnd),sc=DojoData.scale(round),ids='DEFGH';
    names.forEach((n,i)=>{const T=Object.assign({id:n},DojoData.foes[n]),id=ids[i],a=(i-(names.length-1)/2)*.9,ang=Math.PI+a,x=CX()+Math.sin(ang)*5.5,z=CZ()+Math.cos(ang)*5.5;
      const f=C.F[id]=CombatCore.mkFighter(id,{x,z,face:Math.atan2(CX()-x,CZ()-z),hp:Math.round(T.hp*sc.hp),team:'e',fs:1,dm:T.dm*sc.dm,rm:T.scale>1.1?1.15:1,tm:1});
      f.r=.42*T.scale;f.spd=T.spd;if(T.weapon)f.rm=1.4;f.rise=0;if(T.boss){f.pg=0}if(!C.order.includes(id))C.order.push(id);
      const b=body(i);if(b.look!==T.look){b.look=T.look;if(b.anim){b.anim.off();b.anim=null}if(b.u.mixer&&typeof emoStop==='function')emoStop(b.u);wear(b,T.look)}   // the REAL character (never the stand-in capsule: the body stays hidden until the model has loaded)
      b.g.scale.setScalar(T.scale);b.g.position.set(f.x,H(f.x,f.z),f.z);b.g.rotation.y=f.face;if(b.u.mixer&&typeof emoStop==='function')emoStop(b.u);b.styled=null;
      const F={i,id,T,f,body:b,armed:!!T.weapon,prop:null,ai:DojoAI.create(seed*131+i*977+round*31,T.ai,{intro:50+i*22}),flash:0};foes.push(F);byId[id]=F});
    lockI=0;if(foes[0])lockI=0}
  function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  // ---------- fight lifecycle ----------
  function start(){
    if(fighting||!built)return;domBuild();warm();
    if(!sparks.length)sparkBuild();
    fighting=true;seed=(Date.now()&0x7fffffff)|1;round=0;sessKills=0;combo=0;best=0;state='intro';stateT=0;
    C=CombatCore.create({arena:{x:CX(),z:CZ(),R:RING-.8},solids:[]});ST=CombatCore.stepper(C,6);vt=0;tsc=1;
    S.x=CX();S.z=CZ()+4.5;S.rot=Math.PI;S.grounded=true;S.vy=0;
    dirr=DojoAI.director();newPlayer();mkFoes();cs.init=false;cs.off=0;
    q('.res').classList.remove('on');el.classList.add('on');document.body.classList.add('dojo-fight');goBtn.style.display='none';stBar.style.display='none';try{Expedition.hold('dojo')}catch(e){}
    paintBelt();say('ROUND 1',1.4,'#ffd070');tone(300,600,.25,'sawtooth',.1);sfx('vo_fight',.8,1)}
  const pLay={};let warmed=false;
  function warm(){if(warmed)return;warmed=true;try{WardenMX.fetch('player_dojo',me.userData.av).catch(()=>{});for(const l of ['j','g']){AvatarKit.preload(l).catch(()=>{});WardenMX.fetch('player_dojo',l).catch(()=>{});if(l==='g')WardenMX.fetch('dojo_staff',l).catch(()=>{})}if(typeof loadEmotes==='function')loadEmotes().catch(()=>{});if(typeof WardenSfx!=='undefined')WardenSfx.load()}catch(e){}}
  const foeReady=F=>!!F.body.u.model&&(F.body.u.av===F.body.look||F.fb);
  function newPlayer(){const st=PS();P=C.add('P',{x:S.x,z:S.z,face:S.rot,hp:st.hp,team:'p',fs:1,dm:st.dm});P.fs=1;P.dm=st.dm;P.hpMax=st.hp;P.hp=st.hp;P.sm=.9;const sy=DojoData.styles[SAVE.style]||DojoData.styles.striker;P.mm=sy.mm;P.pm=1.05*sy.pm;P.dfl=sy.dfl;P.dm0=st.dm;if(sy.hp){P.hpMax+=sy.hp;P.hp=P.hpMax}dropStaff(true);
    if(!pAnim&&me.userData.mixer)pAnim=WardenMX.make(me.userData,'player_dojo')}
  function leave(manual){
    if(!fighting)return;releaseAll();dropStaff();fighting=false;state='idle';el.classList.remove('on');document.body.classList.remove('dojo-fight');if(pAnim)pAnim.off();for(const F of foes){if(F.prop&&F.prop.parent)F.prop.parent.remove(F.prop);F.body.g.visible=false;if(F.body.anim)F.body.anim.off()}foes=[];byId={};
    try{Expedition.release('dojo')}catch(e){}if(typeof emoStop==='function')try{emoStop(me.userData)}catch(e){}me.userData.emoteReq=null;
    if(manual)say('',.1)}
  function paintBelt(){const b=belt(),B=DojoData.belts[b];const i=q('.belt i');i.style.background=B.c;q('.belt span').textContent=B.n+' belt'}
  function roundClear(){
    state='clear';stateT=0;roundCleared++;SAVE.cleared++;SAVE.rounds++;const boss=foes.some(F=>F.T.boss),c=DojoData.coins(round,boss);
    try{if(typeof Outlaw!=='undefined'&&Outlaw.earn)Outlaw.earn(c)}catch(e){}
    if(round+1===DojoData.rounds.length){SAVE.wins++;say('TRIAL CLEARED\n+'+c+' \u{1FA99}',2.4,'#ffd070')}else say('ROUND CLEARED\n+'+c+' \u{1FA99}',1.8,'#ffd070');
    SAVE.best=Math.max(SAVE.best,round+1);save();tsc=.35;tscT=.9;paintBelt();sfx('vo_winner',.7,1)}
  function nextRound(){round++;P.hp=Math.min(P.hpMax,P.hp+P.hpMax*.28);P.st=P.stMax;P.po=0;mkFoes();state='intro';stateT=0;say('ROUND '+(round+1)+(DojoData.lineup(round,()=>.5).includes('enforcer')?'\nBOSS':''),1.5,'#ffd070');tone(300,600,.2,'sawtooth',.09)}
  function lose(){state='lost';stateT=0;combo=0;SAVE.best=Math.max(SAVE.best,round);save();tone(200,60,.8,'sawtooth',.14);
    setTimeout(()=>{if(!fighting||state!=='lost')return;const r=q('.res');r.querySelector('h2').textContent='DEFEATED';r.querySelector('p').textContent='Reached round '+(round+1)+'  ·  best '+Math.max(SAVE.best,round+1)+'\nBelt: '+DojoData.belts[belt()].n;
      const d=r.querySelector('.card div');d.innerHTML='<button data-a="again">Fight again</button><button class="s" data-a="leave">Leave</button>';d.onclick=ev=>{const a=ev.target.dataset.a;if(a==='again'){r.classList.remove('on');restart()}else if(a==='leave'){r.classList.remove('on');leave(true)}};r.classList.add('on')},2200)}
  function restart(){fighting=false;el.classList.remove('on');document.body.classList.remove('dojo-fight');try{Expedition.release('dojo')}catch(e){}if(pAnim)pAnim.off();for(const k in C.F)delete C.F[k];start()}
  // ---------- events ----------
  function hitFx(e,T){const t=byId[e.d],pos=e.d==='P'?P:t&&t.f,big=['f_spin','upper','round','power','take','throw','f_dash','drop'].includes(e.move);if(!pos)return;
    burst(pos.x,H(pos.x,pos.z)+1.25,pos.z,big?'big':'hit',big?14:8)}
  // ---------- weapons: the Staff Fighter's bo staff. GRAB it or PERFECT-PARRY it and it is yours for a while (+45% damage) ----------
  let pStaff=null,wT=0;
  function staffMesh(len){const g=new THREE.Group(),m=new THREE.Mesh(new THREE.CylinderGeometry(.028,.028,len,8),new THREE.MeshStandardMaterial({color:'#8a5a30',roughness:.7})),a=new THREE.Mesh(new THREE.CylinderGeometry(.036,.036,.16,8),new THREE.MeshStandardMaterial({color:'#2a2020',roughness:.6}));a.position.y=len/2-.08;const b=a.clone();b.position.y=-len/2+.08;g.add(m,a,b);g.traverse(c=>{if(c.isMesh)c.castShadow=true});return g}
  function holdStaff(u,sc,len){const hand=u.bones&&u.bones.RightHand;if(!hand)return null;const w=staffMesh(len),h=new THREE.Group();h.add(w);w.position.y=len*.28;h.rotation.set(Math.PI/2,0,0);hand.add(h);let o=hand;while(o.parent)o=o.parent;o.updateMatrixWorld(true);const ws=hand.getWorldScale(new THREE.Vector3()).x||1;h.scale.setScalar(1/ws);return h}
  function disarm(F){if(!F||!F.armed)return;F.armed=false;F.f.dm*=.6;F.f.rm=1;F.ai.A=Object.assign({},F.ai.A,{range:1.7,reach:2.1});if(F.prop){F.prop.parent&&F.prop.parent.remove(F.prop);F.prop=null}if(F.body.anim){F.body.anim.off();F.body.anim=null}
    say('DISARMED!',1.1,'#7fe8ff');hint('STAFF: +45% damage for 15s',2);tone(700,1400,.2,'triangle',.12);cs.shk=Math.max(cs.shk,.4);
    dropStaff(true);pStaff=holdStaff(me.userData,1,1.7);if(pStaff){wT=15;P.dm=P.dm0*1.45}}
  function dropStaff(quiet){if(pStaff&&pStaff.parent)pStaff.parent.remove(pStaff);pStaff=null;if(wT>0&&P&&P.dm0)P.dm=P.dm0;wT=0}
  function events(evs){
    for(const e of evs){
      if(e.t==='collide'){say('SMASH!',.8,'#ffb060');cs.shk=Math.max(cs.shk,.5);tone(110,45,.2,'square',.14);sfx('heavy',.8,.8);const U=byId[e.d];if(U){U.flash=1;burst(U.f.x,H(U.f.x,U.f.z)+1,U.f.z,'big',12)}}
      else if(e.t==='slam'){say('RING-OUT SLAM',1,'#ff9a3a');cs.shk=Math.max(cs.shk,.7);tsc=.4;tscT=.4;tone(90,40,.3,'sawtooth',.16);burst(e.x,H(e.x,e.z)+.6,e.z,'big',16)}
      else if(e.t==='deflect'&&e.d==='P'&&e.pf&&byId[e.a]&&byId[e.a].armed){disarm(byId[e.a])}
      if(e.t==='hit'){const mine=e.a==='P';hitFx(e);if(mine&&(e.move==='take'||e.move==='throw')&&byId[e.d]&&byId[e.d].armed)disarm(byId[e.d]);const big=['f_spin','upper','round','power','take','throw','f_dash','drop'].includes(e.move);
        if(mine){combo++;comboT=2.4;best=Math.max(best,combo);cs.shk=Math.max(cs.shk,big?.55:.2);cs.fk=big?-4:-1.6;tone(big?120:200,big?60:100,big?.16:.08,'square',.12);sfx(big?'heavy':'strike',big?.8:.6,.9+Math.random()*.2);
          if(e.move==='take'){P.hp=Math.min(P.hpMax,P.hp+P.hpMax*.1);say('TAKEDOWN',1,'#ffd070');tsc=.3;tscT=.5}
          else if(e.move==='throw'){say('THROW',.8,'#d6a8ff');throwSplash(e)}
          else if(e.crit)say('STAGGER HIT',.5,'#ffb060')}
        else if(e.d==='P'){combo=0;cs.shk=Math.max(cs.shk,.5);flash('rgba(255,30,20,.6)',1);tone(90,50,.18,'sawtooth',.14);sfx('heavy',.7,.7)}
        const T=byId[e.d];if(T)T.flash=1}
      else if(e.t==='deflect'){if(e.d==='P'){flash('rgba(190,225,255,.7)',1);cs.shk=Math.max(cs.shk,.3);say(e.pf?'PERFECT PARRY':'PARRY',.7,'#bfe4ff');tone(900,1700,.25,'triangle',.12);sfx('clash',.7,1.2);burst(P.x,H(P.x,P.z)+1.3,P.z,'par',12)}
        else{const T=byId[e.d];if(T)burst(T.f.x,H(T.f.x,T.f.z)+1.3,T.f.z,'par',8);tone(700,1200,.15,'triangle',.08)}}
      else if(e.t==='block'){if(e.d==='P'&&pAnim&&pAnim.blockHit)pAnim.blockHit();else if(byId[e.d]&&byId[e.d].body.anim&&byId[e.d].body.anim.blockHit)byId[e.d].body.anim.blockHit();const pos=e.d==='P'?P:byId[e.d]&&byId[e.d].f;if(pos)burst(pos.x,H(pos.x,pos.z)+1.2,pos.z,'block',6);tone(180,140,.1,'square',.08);if(e.d==='P'){cs.shk=Math.max(cs.shk,.15);sfx('clash',.5,1.5)}}
      else if(e.t==='dodged'&&e.d==='P'){say('EVADE',.5,'#9fe8b8');tone(500,900,.1,'triangle',.06)}
      else if(e.t==='posturebreak'){if(e.d==='P'){flash('rgba(255,160,40,.6)',1);say('POSTURE BROKEN',1,'#ff9a3a')}else{const T=byId[e.d];say('POSTURE BROKEN',.9,'#ffd070');hint('HEAVY or GRAB: TAKEDOWN',1.4);if(T)burst(T.f.x,H(T.f.x,T.f.z)+1.5,T.f.z,'big',16);tone(400,120,.25,'sawtooth',.1)}}
      else if(e.t==='guardbreak'){if(e.d==='P')say('GUARD BROKEN',.9,'#ff9a3a');else hint('GUARD BROKEN: STRIKE',1.2)}
      else if(e.t==='start'&&e.a!=='P'){if(e.move==='throw'){hint('GRAB! DODGE IT',.7)}else if(e.move==='power')hint('POWER STRIKE: DODGE OR PARRY',.9)}
      else if(e.t==='start'&&e.a==='P'){for(const F of foes)DojoAI.noticeStart(F.ai,e,C,F.f);if(e.move!=='light'){tone(260+Math.random()*60,160,.07,'sine',.05);sfx('whoosh',.35,1.1+Math.random()*.3)}}
      else if(e.t==='dead'){const T=byId[e.d];if(e.d==='P'){lose();say('DEFEATED',2,'#ff5a4a')}else if(T){sessKills++;tone(220,40,.5,'sawtooth',.12);burst(T.f.x,H(T.f.x,T.f.z)+1,T.f.z,'big',20);if(!alive().length){roundClear()}else{lockI=foes.indexOf(alive()[0])}}}}}
  // a thrown fighter knocks the ones beside him
  function throwSplash(e){const v=byId[e.d];if(!v)return;for(const F of foes){if(F===v||F.f.act==='dead')continue;if(Math.hypot(F.f.x-v.f.x,F.f.z-v.f.z)<2.6){F.f.hp=Math.max(1,F.f.hp-14*PS().dm);CombatCore.stun(F.f,30,'hit');F.flash=1;burst(F.f.x,H(F.f.x,F.f.z)+1.2,F.f.z,'big',12);say('CRASH',.7,'#ffb060')}}}
  // ---------- per-frame ----------
  const speedMul=sprint=>{if(!fighting||!P)return 1;const base=sprint?12:6;if(P.act==='dead')return 0;if(P.act==='free')return(P.guard?GSPD:SPD)/base;if(P.act==='charge')return CSPD/base;return 0};
  function locoOf(v,x,z,face,dt){if(!v.init){v.x=x;v.z=z;v.init=true;v.vf=v.vs=v.sp=0;return}const ix=(x-v.x)/Math.max(dt,1e-3),iz=(z-v.z)/Math.max(dt,1e-3);v.x=x;v.z=z;const k=1-Math.exp(-dt*12);
    const f=ix*Math.sin(face)+iz*Math.cos(face),s=ix*Math.cos(face)-iz*Math.sin(face);v.vf+=(f-v.vf)*k;v.vs+=(s-v.vs)*k;v.sp=Math.hypot(v.vf,v.vs)}
  function tick(dt,t){
    if(!built)return;
    const d=Math.hypot(S.x-CX(),S.z-CZ());
    if(d>DOJO.reach+160){if(fighting)leave(false);if(goBtn)goBtn.style.display='none';if(stBar)stBar.style.display='none';return}
    if(!el)domBuild();
    if(d<RING+140)warm();
    near=!fighting&&d<RING+3&&!S.flying&&S.grounded!==false;
    if(stBar)stBar.style.display=near?'flex':'none';
    if(goBtn){goBtn.style.display=near?'block':'none';if(near&&!goBtn._t){goBtn._t=1;goBtn.innerHTML='\u{1F94B} FIGHT<small>Iron Fist trial · '+DojoData.belts[belt()].n+' belt · best round '+SAVE.best+'</small>'}}
    for(let i=0;i<lamps.length;i++)lamps[i].scale.setScalar(.92+.1*Math.sin(t/140+i*1.7));
    sparkTick(dt);
    if(!fighting)return;
    if(msgT>0){msgT-=dt;if(msgT<=0)q('.msg').style.opacity=0}if(hintT>0){hintT-=dt;if(hintT<=0)q('.hint').style.opacity=0}if(flashT>0){flashT-=dt;if(flashT<=0)q('.fl').style.opacity=0}
    if(comboT>0){comboT-=dt;if(comboT<=0){combo=0}}
    if(wT>0){wT-=dt;if(wT<=0){dropStaff();hint('Staff lost',1)}}
    // the sim clock (slow-motion on big moments)
    if(tscT>0){tscT-=dt;if(tscT<=0)tsc=1}
    vt+=dt*1000*tsc;stateT+=dt;
    // hold-to-block: a tap is a parry (the first PARRY_W ticks deflect); keep the button down and the guard re-raises as a plain block when the parry window ends
    if(down.guard&&P&&P.act==='free'&&!P.guard&&!(P.pry>0)&&now()-(down.hg||0)>140){down.hg=now();ST.input('P',{t:'guardDown',e:C.tick},now())}
    if(state==='intro'&&stateT>1.6&&!foes.every(foeReady)){if(stateT>22){for(const F of foes)if(!foeReady(F)){F.fb=true;dress(F.body.g,0,null)}}else{hint('LOADING FIGHTERS...',.5)}}
    else if(state==='intro'&&stateT>1.6){state='fight';for(const F of foes)F.ai.rdy=Math.max(F.ai.rdy,20)}
    if(state==='clear'&&stateT>2.6&&P.act!=='dead')nextRound();
    // 1) the sim: the player's body is where the world put it; foes think
    P.x=S.x;P.z=S.z;
    if(P.act!=='dead')for(const F of foes){const f=F.f;if(f.act==='dead')continue;const ex=P.x-f.x,ez=P.z-f.z,dd=Math.hypot(ex,ez),m=P.r+f.r;if(dd>=m)continue;const nx=dd<1e-4?Math.sin(S.rot):ex/dd,nz=dd<1e-4?Math.cos(S.rot):ez/dd,pen=m-dd,kf=(f.act==='attack'||f.act==='stun')?0:.3;P.x+=nx*pen*(1-kf);P.z+=nz*pen*(1-kf);f.x-=nx*pen*kf;f.z-=nz*pen*kf}
    {const ax=P.x-CX(),az=P.z-CZ(),ad=Math.hypot(ax,az),lim=RING-.8-P.r;if(ad>lim){P.x=CX()+ax/ad*lim;P.z=CZ()+az/ad*lim}}
    S.x=P.x;S.z=P.z;let lx=S.x,lz=S.z;
    const TF=target(),Df=TF?TF.f:null;
    const held=nt=>{if(state==='fight')DojoAI.plan(dirr,foes,C,nt);const h={P:{face:Df&&Df.act!=='dead'?Math.atan2(Df.x-S.x,Df.z-S.z):S.rot,mx:0,mz:0}};
      const fs=foes.map(F=>F.f);for(const F of foes){const f=F.f;if(f.act==='dead'){h[F.id]={face:f.face,mx:0,mz:0};continue}
        if(state!=='fight'){h[F.id]={face:Math.atan2(P.x-f.x,P.z-f.z),mx:0,mz:0};continue}
        h[F.id]=DojoAI.think(F.ai,f,C,nt,fs)}return h};
    const evs=ST.advance(vt,held,()=>{S.x+=P.x-lx;S.z+=P.z-lz;lx=P.x;lz=P.z;lastEv=C.ev});
    events(evs);
    // 2) facing: the sim owns it while attacking / dodging / stunned; otherwise you face the locked foe
    if(P.act==='attack'||P.act==='dodge'||P.act==='stun')S.rot=P.face;else if(Df&&Df.act!=='dead'&&P.act!=='dead'){S.rot=Math.atan2(Df.x-S.x,Df.z-S.z)}
    me.position.x=S.x;me.position.z=S.z;me.rotation.y=S.rot;
    if(P.act==='dodge'&&!P._rolled){P._rolled=true;const dd=P.dir||[Math.sin(P.face),Math.cos(P.face)];P._back=dd[0]*Math.sin(P.face)+dd[1]*Math.cos(P.face)<-.5;P._dirA=Math.atan2(dd[0],dd[1]);me.userData.emote=P._back?'flipb':'roll'}else if(P.act!=='dodge')P._rolled=false;
    if(P.act==='dodge'&&!P._back&&P._dirA!==undefined)me.rotation.y=P._dirA;
    if(P.act==='stun'&&!P._hit){P._hit=true;me.userData.hitReq=1}else if(P.act!=='stun')P._hit=false;
    if(P.act==='dead'&&!P._dead){P._dead=true;if(!pAnim)me.userData.emoteReq='playdead'}else if(P.act!=='dead'&&P._dead){P._dead=false;if(typeof emoStop==='function')emoStop(me.userData)}
    // 3) animation: real clips scrubbed by the sim
    const fr=C.hs>0?0:clamp(vt/16.6667-ST.skew-C.tick,0,1);
    if(!pAnim&&me.userData.mixer)pAnim=WardenMX.make(me.userData,'player_dojo');
    locoOf(pv,S.x,S.z,S.rot,dt);if(pAnim)pAnim.update(P,fr,{moving:pv.sp>.8&&P.act==='free',vf:pv.vf,vs:pv.vs},dt,true);
    for(const F of foes)foeTick(F,dt,fr);
    hud(dt);
  }
  // ---------- procedural body layer: on top of the clips, the spine twists and leans INTO each strike (hips drive, shoulders follow), kicks into a lean-back, flinches recoil. Applied after the mixer each frame (the mixer rewrites the pose every frame, so nothing accumulates). ----------
  const QA=new THREE.Quaternion(),QB=new THREE.Quaternion(),AXY=new THREE.Vector3(0,1,0),AXX=new THREE.Vector3(1,0,0),AXZ=new THREE.Vector3(0,0,1);
  function bodyLayer(v,u,f,dt){if(!u||!u.bones||!f)return;const bn=u.bones;let tw=0,ln=0,rc=0;
    if(f.act==='attack'&&f.ph&&f.ph[f.pi]){const ph=f.ph[f.pi],n=ph.n||1,p=Math.min(1,(f.pk+1)/n),id=f.mv&&f.mv.id||'',kick=/round|spin|knee|push|drop/.test(id),side=(/jab|upper|knee|push/.test(id)?1:-1)*(v.sd||1);
      const w=ph.k==='startup'?-.35*p:ph.k==='active'?-.35+1.35*p:1-p*.9;   // wind back, then drive through, then settle
      if(kick){ln=-.22*(ph.k==='startup'?p:1-p*.5)}else{tw=side*.34*w;ln=.14*Math.max(0,w)}}
    else if(f.act==='stun'){rc=f.sk==='stagger'?.3:.16;ln=-rc}
    else if(f.act==='free'&&!f.guard&&v.fl)ln=0;
    const k=1-Math.exp(-dt*(f.act==='attack'?22:10));v.tw=(v.tw||0)+(tw-(v.tw||0))*k;v.ln=(v.ln||0)+(ln-(v.ln||0))*k;if(f.act==='attack'&&f.pi===0&&f.pk===0)v.sd=-(v.sd||1);
    const put=(name,wt)=>{const b=bn[name];if(!b)return;QA.setFromAxisAngle(AXY,v.tw*wt);QB.setFromAxisAngle(AXX,v.ln*wt);b.quaternion.multiply(QA).multiply(QB)};
    put('Spine',.35);put('Chest',.4);put('UpperChest',.25)}
  function foeTick(F,dt,fr){const b=F.body,f=F.f,g=b.g;g.position.set(f.x,H(f.x,f.z),f.z);
    if(f.act==='attack'||f.act==='stun'||f.act==='dead')g.rotation.y=f.face;else g.rotation.y+=wrap(f.face-g.rotation.y)*(1-Math.exp(-12*dt));
    const ready=foeReady(F);g.visible=ready;if(!ready)return;
    if(!b.anim&&b.u.mixer)b.anim=WardenMX.make(b.u,F.armed?'dojo_staff':'player_dojo');style(b,F.T);
    if(F.armed&&!F.prop)F.prop=holdStaff(b.u,F.T.scale,2.0);
    locoOf(b.loco,f.x,f.z,g.rotation.y,dt);const moving=b.loco.sp>.6&&f.act==='free';
    if(f.act==='dead'){b.u.pp=null;b.u.v=0}
    if(typeof animate==='function')animate(g,dt,moving?'walk':'idle');
    if(b.anim)b.anim.update(f,fr,{moving,vf:b.loco.vf,vs:b.loco.vs},dt,true);
    F.flash=Math.max(0,F.flash-dt*5);if((F.flash>0||b.flashOn)&&b.u.model){b.flashOn=F.flash>0;b.u.model.traverse(c=>{if(c.isSkinnedMesh&&c.material&&c.material.emissive)c.material.emissive.setRGB(F.flash*.7,F.flash*.3,F.flash*.1)})}}
  const bars={};
  function setBar(sel,v){const k=Math.round(clamp(v,0,1)*100);if(bars[sel]===k)return;bars[sel]=k;q(sel+' b').style.transform='scaleX('+k/100+')'}
  let foeEls=[];
  function hud(dt){
    setBar('.hp',P.hp/P.hpMax);setBar('.st',P.st/P.stMax);
    const fl=q('.foes');if(foeEls.length!==foes.length||foeEls[0]&&foeEls[0].dataset.r!==round+':'+seed){fl.innerHTML='';foeEls=foes.map(F=>{const d=document.createElement('div');d.className='fo';d.dataset.r=round+':'+seed;d.innerHTML=F.T.name+'<div class="bar hp"><b></b></div><div class="bar po"><b></b></div>';fl.appendChild(d);return d})}
    const T=target();foes.forEach((F,i)=>{const d=foeEls[i];d.classList.toggle('t',F===T);d.classList.toggle('d',F.f.act==='dead');const h=d.querySelectorAll('b');const a=clamp(F.f.hp/F.f.hpMax,0,1),p=clamp(F.f.po/F.f.poMax,0,1);h[0].style.transform='scaleX('+a+')';h[1].style.transform='scaleX('+p+')'});
    q('.top').textContent='ROUND '+(round+1)+(foes.some(F=>F.T.boss)?' · BOSS':'')+'  ·  '+alive().length+' left';
    const cb=q('.combo');if(combo>=2){cb.style.opacity=1;cb.innerHTML=combo+' HITS<small>BEST '+best+'</small>'}else cb.style.opacity=0;
    const lk=q('.Lk');lk.textContent='Lock'}
  // ---------- the fight camera ----------
  function cam(dt){
    if(fighting&&P){bodyLayer(pLay,me.userData,P,dt);for(const F of foes)if(F.body.g.visible)bodyLayer(F.body.lay||(F.body.lay={}),F.body.u,F.f,dt)}   // after the frame's animate() calls, just before render
    if(!fighting||!P)return;
    const T=target(),tx=T?T.f.x:S.x+Math.sin(S.rot)*4,tz=T?T.f.z:S.z+Math.cos(S.rot)*4,d=Math.hypot(tx-S.x,tz-S.z);
    // Sifu-style: tight over-the-shoulder, the camera sits behind you on the line from the foe, swings to a three-quarter view when close so both fighters read,
    // and widens (not pulls out far) when more than one foe is near. Dragging swings it round and it drifts back. No allocations here.
    if(!cs.init){cs.yaw=Math.atan2(S.x-tx,S.z-tz)+.5;cs.last=S.yaw=cs.yaw;cs.D=5.2;cs.H=1.9;cs.lx=S.x;cs.lz=S.z;cs.init=true}
    const dr=wrap(S.yaw-cs.last);if(Math.abs(dr)>1e-4){cs.off=clamp(cs.off+dr,-1.5,1.5);cs.dragT=1.8}
    if(cs.dragT>0)cs.dragT-=dt;else cs.off*=Math.exp(-dt*1.6);
    // weight the framing toward the other foes that are close (up to 3), so a flank is never out of shot
    let wx=0,wz=0,wn=0,near=0;for(let i=0;i<foes.length;i++){const F=foes[i];if(F.f.act==='dead'||F===T)continue;const fx=F.f.x-S.x,fz=F.f.z-S.z,fd=Math.hypot(fx,fz);if(fd<7){wx+=fx;wz+=fz;wn++;near++}}
    const yaw0=Math.atan2(S.x-tx,S.z-tz)+clamp(.92-d*.1,.46,.72)+cs.off,atk=P.act==='attack'||P.act==='stun';
    cs.yaw+=wrap(yaw0-cs.yaw)*(1-Math.exp(-dt*(atk?2.4:4.5)));cs.last=S.yaw=cs.yaw;
    const Dt=clamp(3.9+d*.42+near*.9,4.4,8.2),Ht=1.55+Dt*.15;   // closer than before (was 5.6–9.8 m)
    const sm=1-Math.exp(-dt*3.2);cs.D+=(Dt-cs.D)*sm;cs.H+=(Ht-cs.H)*sm;
    const D=cs.D,y=S.y+cs.H;
    let px=S.x+Math.sin(cs.yaw)*D,pz=S.z+Math.cos(cs.yaw)*D;
    const ad=Math.hypot(px-CX(),pz-CZ()),lim=YARD()+6;if(ad>lim){px=CX()+(px-CX())/ad*lim;pz=CZ()+(pz-CZ())/ad*lim}
    // look point: between you and the target, nudged toward other close foes; eased so it never snaps when the lock changes
    const k=.5,tlx=S.x+(tx-S.x)*k+(wn?wx/wn*.12:0),tlz=S.z+(tz-S.z)*k+(wn?wz/wn*.12:0),lsm=1-Math.exp(-dt*9);
    cs.lx+=(tlx-cs.lx)*lsm;cs.lz+=(tlz-cs.lz)*lsm;
    // smooth shake (summed sines, decays quickly) instead of per-frame random jitter, which looked like noise on a phone
    cs.shk*=Math.exp(-dt*8);cs.fk*=Math.exp(-dt*9);cs.tm=(cs.tm||0)+dt;const sh=cs.shk*.2,tt=cs.tm*47;
    camera.position.set(px+Math.sin(tt)*sh,y+Math.sin(tt*1.31+1.7)*sh,pz+Math.cos(tt*.93+.6)*sh);camera.lookAt(cs.lx,S.y+1.3,cs.lz);
    const fT=57+cs.fk+(P.act==='dead'?-6:0);if(Math.abs(camera.fov-fT)>.05){camera.fov+=(fT-camera.fov)*(1-Math.exp(-dt*10));camera.updateProjectionMatrix()}}
  return{build,tick,cam,speedMul,fighting:()=>fighting,start,leave:()=>leave(true),belt,save:()=>SAVE,
    _t:()=>({C,P,foes,state,round,cs,ST,SAVE}),_go:r=>{round=r;mkFoes()},_dis:()=>disarm(foes[0])}})();
