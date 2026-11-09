// COPS & ROBBERS controller. One of you is the ROBBER (grab the loot, reach the getaway), the other the COP (bust him). Hover-cars skim land AND sea so the whole
// world is the arena; a round is ~30-90 s. Rules + AI live in ChaseCore.js (pure, tested); this file owns the cars, the markers, the camera, the HUD and the lobby.
// It follows the Rally / Deep module pattern: locked() takes over the stick, frame(dt) runs after CameraRig.update and owns camera / avatar pin / HUD.
// Reuses Rally's HUD look (rally.css: rl-*) and the CarPhysics hover-car, so handling is exactly what players already know.
const Chase=(()=>{
  const C=ChaseCore,CP=CarPhysics,CH=C.CH,DT=1/60;
  const clamp=(v,a,b)=>v<a?a:v>b?b:v,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const touch=matchMedia&&matchMedia('(pointer:coarse)').matches;
  const ST={mode:'off',r:null,me:null,ai:null,role:'rob',cfg:null,acc:0,shake:0,punch:0,fc:0,err:0,match:{me:0,ai:0,n:0},lastHud:0,ret:null};
  const BTN={boost:false,oil:false,hand:false,l:false,r:false,u:false,d:false,brake:false};
  const IN={ix:0,iy:0};
  let hud=null,sheet=null,fab=null,world=null,camS={yaw:0,x:0,y:0,z:0,fov:65,init:false},baseFov=65,spots=null,SFX={ctx:null};
  const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e};
  const stat=()=>{try{return Object.assign({esc:0,bust:0,rounds:0,wins:0},JSON.parse(localStorage.getItem('chasestat')||'{}'))}catch(e){return{esc:0,bust:0,rounds:0,wins:0}}};
  const saveStat=s=>{try{localStorage.setItem('chasestat',JSON.stringify(s))}catch(e){}};
  const coinsNow=()=>typeof Outlaw!=='undefined'&&Outlaw.coins?Outlaw.coins():0;
  const busy=()=>(typeof Ship!=='undefined'&&Ship.locked&&Ship.locked())||(typeof Rally!=='undefined'&&Rally.locked())||(typeof SkyRaid!=='undefined'&&SkyRaid.locked())||(typeof Deep!=='undefined'&&Deep.locked());

  // ---------------------------------------------------------------- sound (tiny synth, created on the first tap)
  function sfxInit(){if(SFX.ctx)return;try{SFX.ctx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){SFX.ctx=null}}
  function tone(f,d,type,vol,slide){const c=SFX.ctx;if(!c)return;try{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f*slide),t+d);
    g.gain.setValueAtTime(vol||.12,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+d+.02)}catch(e){}}

  // ---------------------------------------------------------------- the open-world car environment
  // Ground = terrain, floored at the sea (the hover-cars skim water). Solids (trunks, boulders, buildings: the same circles the avatar collides with) block.
  const SEA=-.1;
  const grid=new Map();let gridN=-1;
  function syncSolids(){
    if(typeof solids==='undefined'||!solids||gridN===solids.length)return;gridN=solids.length;grid.clear();
    for(const s of solids){const k=Math.floor(s.x/32)+','+Math.floor(s.z/32);let a=grid.get(k);if(!a){a=[];grid.set(k,a)}a.push(s)}
  }
  function block(x,z,y,r,vx,vz,out){
    const cx=Math.floor(x/32),cz=Math.floor(z/32);
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const g=grid.get((cx+a)+','+(cz+b));if(!g)continue;
      for(const s of g){const dx=x-s.x,dz=z-s.z,rr=s.r+r;if(dx*dx+dz*dz>=rr*rr)continue;if(s.h&&y>=s.h-.3)continue;
        const d=Math.sqrt(dx*dx+dz*dz)||1e-3;out.nx=dx/d;out.nz=dz/d;out.pen=rr-d;return true}}
    return false;
  }
  const env={ground:(x,z)=>{const h=H(x,z);return h>SEA?h:SEA},block};

  // candidate heist spots: dry, gently-sloped land on every island (and the home island). Scanned once from the terrain; deterministic.
  function buildSpots(){
    if(spots)return spots;spots=[];
    const cs=[{x:0,z:0,R:190}].concat(typeof ISL!=='undefined'?ISL.map(i=>({x:i.x,z:i.z,R:i.R})):[]);
    for(const c of cs){let n=0;for(let k=0;k<40&&n<5;k++){
      const a=k*2.399+c.x*.01,r=c.R*(.1+.5*((k*37)%11)/11),x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r,h=H(x,z);
      if(h<1.2||h>14||Math.abs(H(x+9,z)-h)>2.2||Math.abs(H(x,z+9)-h)>2.2)continue;
      spots.push({x,z});n++}}
    return spots;
  }

  // ---------------------------------------------------------------- visuals: cars + markers
  const models={};
  function loadModel(url){
    if(!models[url])models[url]=fetch(url).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.arrayBuffer()})
      .then(buf=>new Promise((ok,no)=>new THREE.GLTFLoader().parse(buf,url.replace(/[^/]+$/,''),g=>ok(g.scene),no)));
    return models[url];
  }
  const flameGeo=new THREE.ConeGeometry(.34,2.4,8),flameMat=new THREE.MeshBasicMaterial({color:0xffa44a,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false});
  function makeCar(cls,tint,cop){
    const spec=RALLY.cls[cls]||RALLY.cls.ace,grp=new THREE.Group(),o={group:grp,flames:[],cop,lights:null,blob:null,model:null};
    const ph=new THREE.Mesh(new THREE.BoxGeometry(2.6,.9,4.2),new THREE.MeshLambertMaterial({color:new THREE.Color(tint)}));ph.position.y=.7;grp.add(ph);
    loadModel(spec.model).then(src=>{const m=src.clone(true),tc=new THREE.Color(tint);
      m.traverse(n=>{if(n.isMesh){n.material=n.material.clone();if(n.material.color)n.material.color.lerp(tc,.7);n.castShadow=false;n.receiveShadow=false}});
      grp.remove(ph);grp.add(m);o.model=m}).catch(e=>console.warn('Chase: car model failed',e&&e.message));
    for(const s of [-1,1]){const f=new THREE.Mesh(flameGeo,flameMat);f.rotation.x=-Math.PI/2;f.position.set(s*.85,.6,-3.2);f.visible=false;grp.add(f);o.flames.push(f)}
    if(cop){   // light bar: two emissive blocks that alternate red / blue (MeshBasic: no light cost)
      const mk=c=>new THREE.Mesh(new THREE.BoxGeometry(.9,.3,.5),new THREE.MeshBasicMaterial({color:c}));
      const a=mk(0xff2030),b=mk(0x2060ff);a.position.set(-.5,1.75,.2);b.position.set(.5,1.75,.2);grp.add(a);grp.add(b);o.lights=[a,b];
    }
    o.blob=new THREE.Mesh(new THREE.CircleGeometry(1,16),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.35,depthWrite:false}));o.blob.rotation.x=-Math.PI/2;o.blob.scale.set(2.2,2.8,1);
    scene.add(grp);scene.add(o.blob);return o;
  }
  function destroyCar(o){if(!o)return;scene.remove(o.group);scene.remove(o.blob);o.blob.geometry.dispose();o.blob.material.dispose()}
  function placeCar(o,c,dt,t){
    o.group.position.set(c.x,c.y+.12+Math.sin(t*6+o.group.id)*.03,c.z);o.group.rotation.set(-c.pitch,c.h,c.roll,'YXZ');
    if(o.model)o.model.rotation.y=c.steer*.14*Math.min(1,c.s/12)+(c.hitT>0?Math.sin(t*38)*.2:0);
    const fl=c.boostT>0||c.padT>0,fs=(fl?1.5:1)*(.8+.3*Math.sin(t*45+o.group.id));for(const f of o.flames){f.visible=fl;f.scale.set(1,fs,1)}
    if(o.lights){const k=Math.floor(t*7)%2===0;o.lights[0].visible=k;o.lights[1].visible=!k}
    const gy=env.ground(c.x,c.z);o.blob.position.set(c.x,Math.max(gy,SEA)+.07,c.z);o.blob.rotation.z=-c.h;
  }
  function buildWorld(){
    if(world)return world;const root=new THREE.Group(),W={root};
    const beam=(col,r,h)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12,1,true),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.32,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));m.position.y=h/2;m.frustumCulled=false;return m};
    const ring=(col,r)=>{const m=new THREE.Mesh(new THREE.RingGeometry(r-1.2,r,40),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;return m};
    W.loot=new THREE.Group();W.loot.add(beam(0xffd24a,1.6,320),ring(0xffd24a,CH.LOOT_R));
    W.bag=new THREE.Mesh(new THREE.OctahedronGeometry(2.2),new THREE.MeshBasicMaterial({color:0xffe27a}));W.bag.position.y=5;W.loot.add(W.bag);
    W.get=new THREE.Group();W.get.add(beam(0x4dff9a,1.6,320),ring(0x4dff9a,CH.GET_R));
    W.flag=new THREE.Mesh(new THREE.BoxGeometry(5,3,.3),new THREE.MeshBasicMaterial({color:0x4dff9a}));W.flag.position.y=7;W.get.add(W.flag);
    W.slicks=[];for(let i=0;i<4;i++){const m=new THREE.Mesh(new THREE.CircleGeometry(CH.SLICK.r,20),new THREE.MeshBasicMaterial({color:0x07080c,transparent:true,opacity:.8,depthWrite:false}));m.rotation.x=-Math.PI/2;m.visible=false;root.add(m);W.slicks.push(m)}
    root.add(W.loot,W.get);root.visible=false;scene.add(root);world=W;return W;
  }
  function worldUpdate(wall){
    const r=ST.r,W=world;if(!W||!r)return;
    const L=r.L,gb=env.ground(L.B.x,L.B.z),gg=env.ground(L.G.x,L.G.z);
    W.loot.visible=r.phase==='count'||r.phase==='grab';W.loot.position.set(L.B.x,Math.max(gb,SEA)+.3,L.B.z);W.bag.rotation.y=wall*2;W.bag.position.y=5+Math.sin(wall*3)*.6;
    W.get.position.set(L.G.x,Math.max(gg,SEA)+.3,L.G.z);W.flag.rotation.y=wall;
    W.get.children[0].material.opacity=r.carry?.5:.2;
    for(let i=0;i<W.slicks.length;i++){const m=W.slicks[i],s=r.slicks[i];if(!s){m.visible=false;continue}m.visible=true;m.position.set(s.x,Math.max(env.ground(s.x,s.z),SEA)+.15,s.z);m.material.opacity=Math.min(.8,s.life*.4)}
  }

  // ---------------------------------------------------------------- HUD
  function buildHud(){
    if(hud)return;
    if(!document.getElementById('chStyle')){const s=el('style');s.id='chStyle';s.textContent=`
      .ch-fab{position:fixed;right:var(--map-r,12px);top:calc(var(--map-t,58px) + 208px);width:var(--T,44px);height:var(--T,44px);padding:0;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:9}
      body.chase .ch-fab{display:none!important}
      .ch-role{background:rgba(10,14,28,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:6px 14px;text-align:center;line-height:1.1;min-width:96px}
      .ch-role b{display:block;font-size:20px;font-weight:900;letter-spacing:1px}.ch-role small{font-size:11px;opacity:.85}
      .ch-role.rob b{color:#ffb02e}.ch-role.cop b{color:#6fa8ff}
      .ch-meter{position:relative;width:100%;height:14px;border-radius:8px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.25);overflow:hidden}
      .ch-meter i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#ffd24a,#ff3b30);border-radius:8px}
      .ch-meter.hot{animation:chhot .25s linear infinite}@keyframes chhot{50%{box-shadow:0 0 14px #ff3b30}}
      .ch-obj{font-size:13px;font-weight:700;opacity:.95;max-width:46vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ch-sheet-score{display:flex;gap:10px;justify-content:center;margin:8px 0}
      .ch-sheet-score div{flex:1;text-align:center;padding:8px;border-radius:12px;background:rgba(255,255,255,.08)}.ch-sheet-score b{display:block;font-size:26px}
      .rl-arrow.cop i{border-bottom-color:#6fa8ff;filter:drop-shadow(0 0 6px rgba(111,168,255,.8))}.rl-arrow.stale i{opacity:.55}
      body.chase .rl-item .rl-ic{font-size:30px}`;document.head.appendChild(s)}
    hud=el('div','rl-hud ch-hud');hud.innerHTML=`
      <div class="rl-top"><div class="ch-role" id="chRole"><b>ROBBER</b><small id="chScore">&nbsp;</small></div>
        <div class="rl-mid"><div class="rl-time" id="chTime">0:00</div><div class="ch-meter" id="chMeter"><i></i></div><div class="ch-obj" id="chObj"></div></div>
        <div class="rl-spd"><b id="chSpd">0</b><small>km/h</small><div class="rl-pips" id="chPips"></div></div></div>
      <div class="rl-lines" id="chLines"></div><div class="rl-arrow" id="chArrow"><i></i></div><div class="rl-status" id="chStatus"></div>
      <div class="rl-msg"></div><div class="rl-count" id="chCount"></div>
      <div class="rl-btns"><button id="chOil" class="rl-b rl-item"><span class="rl-ic">🛢</span><small>OIL</small></button><button id="chBoost" class="rl-b rl-boost">BOOST</button><button id="chBrake" class="rl-b rl-brake" style="display:none">BRAKE</button><button id="chHand" class="rl-b rl-hand">DRIFT</button><button id="chExit" class="rl-b rl-exit">✕</button></div>
      <div class="rl-pad"><button id="chU" class="rl-b rl-ar rl-u">▲</button><button id="chL" class="rl-b rl-ar rl-l">◀</button><button id="chD" class="rl-b rl-ar rl-d">▼</button><button id="chR" class="rl-b rl-ar rl-r">▶</button></div>`;
    document.body.appendChild(hud);
    const hold=(id,on,off)=>{const b=hud.querySelector(id);const dn=e=>{e.preventDefault();on();b.classList.add('dn')},up=e=>{e.preventDefault();off&&off();b.classList.remove('dn')};
      b.addEventListener('pointerdown',dn);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('pointerleave',up)};
    hold('#chBoost',()=>{BTN.boost=true});hold('#chOil',()=>{BTN.oil=true});hold('#chHand',()=>{BTN.hand=true},()=>{BTN.hand=false});
    hold('#chL',()=>{BTN.l=true},()=>{BTN.l=false});hold('#chR',()=>{BTN.r=true},()=>{BTN.r=false});hold('#chU',()=>{BTN.u=true},()=>{BTN.u=false});hold('#chD',()=>{BTN.d=true},()=>{BTN.d=false});
    hud.querySelector('#chExit').addEventListener('click',()=>{if(ST.mode==='over'||confirm('Leave the chase?'))exit()});
  }
  function toast(s,ms){if(!hud)return;const t=hud.querySelector('.rl-msg');t.textContent=s;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),ms||1200)}
  const fmtT=t=>{t=Math.max(0,Math.ceil(t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
  const fdist=m=>m>=1000?(m/1000).toFixed(1)+' km':Math.round(m)+' m';
  function hudUpdate(now){
    if(!hud||!ST.r)return;if(now-ST.lastHud<80)return;ST.lastHud=now;
    const r=ST.r,me=ST.me.c,rob=ST.role==='rob',q=id=>hud.querySelector(id),other=ST.ai.c;
    const rc=q('#chRole');rc.className='ch-role '+(rob?'rob':'cop');rc.firstChild.textContent=rob?'🕵️ ROBBER':'🚔 COP';q('#chScore').textContent='You '+ST.match.me+' · Them '+ST.match.ai;
    q('#chTime').textContent=r.phase==='count'?'GET READY':fmtT(r.left);
    q('#chSpd').textContent=Math.round(me.s*3.6);
    q('#chPips').innerHTML=Array.from({length:me.p.charges},(_,i)=>'<i class="'+(i<me.charges?'f':'')+'"></i>').join('');
    const m=q('#chMeter');m.firstChild.style.width=Math.round(r.bust*100)+'%';m.classList.toggle('hot',r.bust>.6);
    // objective + arrow
    let tx,tz,txt,cls='rl-arrow'+(rob?'':' cop');
    if(rob){const g=C.goal(r);tx=g.x;tz=g.z;txt=(r.carry?'🏁 Reach the getaway · ':'💰 Grab the loot · ')+fdist(Math.hypot(tx-me.x,tz-me.z))+' · cop '+fdist(Math.hypot(other.x-me.x,other.z-me.z))}
    else{const live=r.carry||!r.hint,t=live?other:r.hint;tx=t.x;tz=t.z;txt=(live?'🎯 BUST HIM · ':'📡 old signal · ')+fdist(Math.hypot(tx-me.x,tz-me.z))+(r.carry?' · he has the loot!':'');if(!live)cls+=' stale'}
    const a=q('#chArrow');a.className=cls;a.style.transform='rotate('+(-wrap(Math.atan2(tx-me.x,tz-me.z)-me.h))+'rad)';a.style.opacity=r.phase==='grab'||r.phase==='run'?.9:0;
    q('#chObj').textContent=txt;
    q('#chOil').style.display=rob?'flex':'none';q('#chOil').lastChild.textContent='OIL '+r.slicksLeft;q('#chOil').style.opacity=r.slicksLeft>0?1:.35;
    const st=[];if(me.hitT>0)st.push(rob&&ST.r.robT>0?'💥 rammed':'🛢 slowed');q('#chStatus').textContent=st.join('  ');
    const b=me.boostT>0||me.padT>0,ln=q('#chLines');ln.style.opacity=(r.phase!=='count'?clamp((me.s-34)/30,0,1)*.55+(b?.3:0):0).toFixed(2);ln.style.animationDuration=(b?.18:.32)+'s';
    // countdown lights
    const c=q('#chCount');if(r.phase==='count'){const n=Math.ceil(r.cd);if(c.dataset.s!==String(n)){c.dataset.s=String(n);c.innerHTML='<div class="rl-lights">'+[3,2,1].map(k=>'<i class="'+(k>=n?'r':'')+'"></i>').join('')+'</div><div class="rl-big">'+n+'</div>'}}
    else if(c.dataset.s!=='x'){c.dataset.s='x';c.innerHTML=''}
  }

  // ---------------------------------------------------------------- the round
  function newCarAt(p,h,cls){const c=CP.newCar(p.x,p.z,h,cls,env,null);c.y=Math.max(env.ground(p.x,p.z),SEA);c.pace=1;return c}
  function begin(cfg,net){
    if(ST.mode!=='off'||busy())return;if(typeof entered==='undefined'||!entered)return;
    sfxInit();buildHud();buildWorld();syncSolids();
    const sp=buildSpots();if(sp.length<3){banner('Not enough land to stage a heist here','COPS & ROBBERS');return}
    const seed=cfg.seed||((Math.random()*1e6)|0)+1,r=C.newRound({seed,spots:sp,role:cfg.role}),L=r.L,rob=cfg.role==='rob';
    ST.cfg=cfg;ST.role=cfg.role;ST.auto=false;ST.r=r;
    const aiCls=net?(RALLY.cls[net.cls]?net.cls:'ace'):['ace','comet','bruiser'][seed%3];
    const meC=newCarAt(rob?L.A:L.C,rob?L.hRob:L.hCop,cfg.cls),aiC=newCarAt(rob?L.C:L.A,rob?L.hCop:L.hRob,aiCls);
    ST.me={c:meC,o:makeCar(cfg.cls,rob?'#ffb02e':'#4f86ff',!rob),rt:{rt:0}};
    ST.ai={c:aiC,o:makeCar(aiCls,rob?'#4f86ff':'#ffb02e',rob),rt:{rt:0},bot:net?null:C.newBot(cfg.diff==='easy'?'rookie':cfg.diff==='hard'?'expert':'steady',seed)};
    ST.net=net?{pcls:net.cls,id:net.id,host:!!net.host,rid:cfg.rid,name:net.name||'Friend',pk:null,v:{x:aiC.x,y:aiC.y,z:aiC.z,h:aiC.h,pitch:0,roll:0},seen:0,lastC:0,lastS:0,act:{slick:false},snapT:0}:null;
    ST.ret={x:S.x,y:S.y,z:S.z,rot:S.rot};ST.mode='play';ST.acc=0;ST.err=0;camS.init=false;baseFov=camera.fov;
    ST.camKids=camera.children.map(k=>[k,k.visible]);for(const [k] of ST.camKids)k.visible=false;
    document.body.classList.add('rally','chase');if(me)me.visible=false;world.root.visible=true;hud.classList.add('on');hud.querySelector('#chCount').dataset.s='';
    toast((net?(rob?'YOU ARE THE ROBBER. ':'YOU ARE THE COP. '):'')+(rob?'GRAB THE LOOT. DON\'T GET BUSTED.':'THE ROBBER IS AFTER THE LOOT. BUST HIM.'),2200);
    BTN.boost=BTN.oil=false;pin();
  }
  function pin(){const c=ST.me.c;S.x=c.x;S.y=c.y;S.z=c.z;S.vy=0;S.grounded=true;S.flying=false;S.rot=c.h;if(me){me.position.set(c.x,c.y,c.z);me.visible=false}}
  function playerInput(c,inp,rob){
    const L=BTN.l||keys.ArrowLeft||keys.KeyA,Rr=BTN.r||keys.ArrowRight||keys.KeyD,U=BTN.u||keys.ArrowUp||keys.KeyW,D=BTN.d||keys.ArrowDown||keys.KeyS,hand=BTN.hand||keys.Space;
    inp.steer=(L?1:0)-(Rr?1:0);
    if(Math.abs(IN.ix)>.15)inp.steer=clamp(-IN.ix*1.3,-1,1);    // an analog stick, if one is shown, also steers
    inp.boost=BTN.boost||(keys.ShiftLeft===true&&!playerInput.sh);playerInput.sh=keys.ShiftLeft===true;BTN.boost=false;
    inp.hand=hand&&c.s>6;inp.brake=false;inp.thr=D?-1:(U||touch)?1:0;if(keys.KeyB){inp.brake=true;inp.thr=0}
    inp.pitch=0;
  }
  const RANK={count:0,grab:1,run:2,over:3};
  function simStep(){
    const r=ST.r,m=ST.me,a=ST.ai,rob=ST.role==='rob',N=ST.net,guest=!!N&&!N.host,robC=rob?m.c:a.c,copC=rob?a.c:m.c,inp={};
    if(ST.auto){Object.assign(inp,C.drive(ST.pbot||(ST.pbot=C.newBot('expert',7)),m.c,rob?'rob':'cop',r,a.c,env,DT))}else playerInput(m.c,inp,rob);
    let ai=null;if(N)netVisual(DT);else ai=C.drive(a.bot,a.c,rob?'cop':'rob',r,m.c,env,DT);
    let myOil=false;if(rob){myOil=ST.auto?C.dropOil(ST.pbot,m.c,r,a.c):(BTN.oil||keys.KeyE===true&&!simStep.ke);simStep.ke=keys.KeyE===true;BTN.oil=false}
    let slick=false;
    if(rob)slick=myOil;else if(!N)slick=C.dropOil(a.bot,a.c,r,m.c);else if(N.act.slick){slick=true;N.act.slick=false}
    if(rob&&N&&!N.host&&myOil){send('ch:a',{k:'slick'});slick=false}      // a guest robber asks the host to drop oil (the host owns the rules)
    if(!rob&&N&&N.host&&N.act.slick){slick=true;N.act.slick=false}
    robC.hitT=r.robT;robC.hitSlow=r.robMul;robC.pace=r.robPace;copC.hitT=r.copT;copC.hitSlow=r.copMul;copC.pace=r.copPace;
    if(r.phase!=='count'){
      const pi=rob?inp:ai,ci=rob?ai:inp;
      CP.step(m.c,inp,DT,env);if(!N)CP.step(a.c,rob?ci:pi,DT,env);
      const imp=N?CP.collide(robC,copC,{moveA:rob,moveB:!rob}):CP.collide(robC,copC);if(imp>6){ST.shake=Math.min(1,imp/25);ST.punch=Math.min(1,imp/30);tone(120,.18,'sawtooth',.16,.5)}
      for(const c of [m.c]){if(c.ev.boost){tone(440,.25,'sawtooth',.1,2.2)}if(c.ev.bump>8){ST.shake=Math.max(ST.shake,.5);tone(90,.12,'square',.1)}}
    }
    C.regen(m.c,m.rt,DT);if(!N)C.regen(a.c,a.rt,DT);
    if(guest&&r.phase!=='count'){   // the host owns the rules: the guest only ticks the clock between snapshots
      r.t+=DT;r.left=Math.max(0,CH.T-r.t);for(const s of r.slicks)s.life-=DT;r.slicks=r.slicks.filter(s=>s.life>0);r.ev.length=0;
    }else{
      C.step(r,DT,robC,copC,{slick,dash:copC.boostT>0});
      for(const e of r.ev){if(N&&N.host&&e.k!=='tick'&&e.k!=='go')send('ch:e',{k:e.k,x:e.x,z:e.z,res:r.result,pts:r.pts,left:r.left,t:r.t});onEvent(e,rob)}
    }
  }
  function onEvent(e,rob){
    if(ST.mode!=='play'&&e.k!=='tick')return;
    switch(e.k){
      case 'tick':tone(e.n===1?700:520,.18,'square',.1);break;
      case 'go':toast('GO!',900);tone(880,.5,'square',.14);ST.punch=.8;break;
      case 'loot':toast(rob?'💰 GOT THE LOOT! RUN!':'💰 HE HAS THE LOOT!',1500);tone(660,.1,'triangle',.14);setTimeout(()=>tone(990,.2,'triangle',.14),90);break;
      case 'slick':if(rob)toast('🛢 oil dropped',700);tone(160,.2,'sawtooth',.1,.6);break;
      case 'spin':toast(rob?'🛢 THE COP HIT YOUR OIL!':'🛢 SLIPPED ON OIL!',1100);tone(300,.4,'sawtooth',.14,.4);ST.shake=.6;break;
      case 'ram':toast(rob?'💥 RAMMED!':'💥 RAM!',900);tone(80,.3,'square',.2);ST.shake=1;ST.punch=1;break;
      case 'escape':case 'bust':case 'time':finish(e.k);break;
    }
  }
  function finish(kind){
    const r=ST.r,rob=ST.role==='rob',st=stat();
    const winMe=kind==='escape'?rob:kind==='bust'?!rob:false;
    ST.match.me+=rob?r.pts.rob:r.pts.cop;ST.match.ai+=rob?r.pts.cop:r.pts.rob;ST.match.n++;
    st.rounds++;if(winMe)st.wins++;if(kind==='escape')st.esc++;if(kind==='bust')st.bust++;saveStat(st);
    const coins=winMe?45+Math.round(r.left*.3):kind==='time'?12:15;
    try{if(typeof Outlaw!=='undefined'&&Outlaw.earn)Outlaw.earn(coins)}catch(e){}
    ST.res={kind,winMe,coins,pts:{me:rob?r.pts.rob:r.pts.cop,ai:rob?r.pts.cop:r.pts.rob},t:r.t};
    toast(kind==='escape'?'🏁 ESCAPED!':kind==='bust'?'🚔 BUSTED!':'⏱ TIME',1600);tone(kind==='bust'?200:880,.5,'square',.16,kind==='bust'?.5:1.5);
    ST.mode='over';clearTimeout(ST.resT);ST.resT=setTimeout(showResult,1900);
  }
  function showResult(){
    if(ST.mode!=='over'||!ST.res)return;closeSheet();const R=ST.res,rob=ST.role==='rob';
    const title=R.kind==='escape'?(rob?'🏁 YOU GOT AWAY':'🏁 HE GOT AWAY'):R.kind==='bust'?(rob?'🚔 BUSTED':'🚔 BUSTED HIM'):'⏱ TIME';
    sheet=el('div','sheet rl-sheet');
    sheet.innerHTML=`<h2>${title}</h2><p class="rl-sub">${R.winMe?'You win this round':R.kind==='time'?'Nobody won — draw':'You lose this round'} · ${R.t.toFixed(1)} s · +${R.coins} 🪙</p>
      <div class="ch-sheet-score"><div><b>${ST.match.me}</b>You (match)</div><div><b>${ST.match.ai}</b>Them (match)</div></div>
      <div class="rl-row">${!ST.net?'<button class="btn rl-go">⇄ NEXT ROUND (swap roles)</button><button class="btn rl-again">Same role</button>':ST.net.host?'<button class="btn rl-go">⇄ NEXT ROUND (swap roles)</button>':'<small>Waiting for the host to start the next round…</small>'}<button class="btn rl-x">Leave</button></div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;sfxInit();const cfg=Object.assign({},ST.cfg);
      if(b.classList.contains('rl-x')){exit();return}
      if(b.classList.contains('rl-go'))cfg.role=cfg.role==='rob'?'cop':'rob';
      cfg.seed=0;const mt=ST.match,ret=ST.ret,N=ST.net;
      if(N&&N.host){const seed=((Math.random()*1e6)|0)+1;send('ch:go',{rid:N.rid,seed,hostRole:cfg.role,hostCls:cfg.cls,hostName:typeof myName==='string'?myName:'Host'});cfg.seed=seed;cfg.rid=N.rid;cleanup();ST.match=mt;begin(cfg,{id:N.id,host:true,cls:N.pcls,name:N.name});ST.ret=ret;return}
      cleanup();ST.match=mt;begin(cfg);ST.ret=ret});
  }
  function closeSheet(){if(sheet){sheet.remove();sheet=null}}
  function cleanup(){
    clearTimeout(ST.resT);closeSheet();if(ST.me)destroyCar(ST.me.o);if(ST.ai)destroyCar(ST.ai.o);if(ST.net){const o=typeof others!=='undefined'&&others.get(ST.net.id);if(o&&o.group)o.group.visible=true}ST.me=ST.ai=ST.r=ST.res=null;ST.net=null;
    if(world)world.root.visible=false;if(hud)hud.classList.remove('on');document.body.classList.remove('rally','chase');
    if(ST.camKids){for(const [k,v] of ST.camKids)k.visible=v;ST.camKids=null}
    if(me)me.visible=true;camera.fov=baseFov;camera.updateProjectionMatrix();
    BTN.boost=BTN.oil=BTN.hand=BTN.l=BTN.r=BTN.u=BTN.d=BTN.brake=false;ST.mode='off';
  }
  function exit(){
    if(ST.mode==='off')return;if(ST.net)send('ch:l',{});const ret=ST.ret;cleanup();ST.match={me:0,ai:0,n:0};
    if(ret){S.x=ret.x;S.z=ret.z;S.y=Math.max(ret.y,H(ret.x,ret.z)+.2);S.vy=0;S.rot=ret.rot||S.rot;S.flying=false;S.grounded=true}
  }

  // ---------------------------------------------------------------- camera
  function chaseCamera(dt){
    const c=ST.me.c,v=c.s;
    if(!camS.init){camS.yaw=c.h;camS.init=true;camS.x=c.x-Math.sin(c.h)*9;camS.y=c.y+4;camS.z=c.z-Math.cos(c.h)*9}
    let tgt=c.h;if(ST.mode==='over'){camS.orbit=(camS.orbit||0)+dt*.5;tgt=c.h+Math.PI*.8+camS.orbit}
    camS.yaw+=wrap(tgt-camS.yaw)*(1-Math.exp(-dt*4.6));
    const boost=c.boostT>0||c.padT>0,dist=9+Math.min(4,v*.045)+(boost?1.6:0)+ST.punch*2.5,hgt=3.6+ST.punch*.6,fx=Math.sin(camS.yaw),fz=Math.cos(camS.yaw);
    const k=1-Math.exp(-dt*13);camS.x+=(c.x-fx*dist-camS.x)*k;camS.y+=(c.y+hgt-camS.y)*k;camS.z+=(c.z-fz*dist-camS.z)*k;
    const gy=env.ground(camS.x,camS.z)+1.2;if(camS.y<gy)camS.y=gy;
    ST.shake=Math.max(0,ST.shake-dt*2);const sh=ST.shake*.35+(boost?.04:0);
    camera.position.set(camS.x+(Math.random()-.5)*sh,camS.y+(Math.random()-.5)*sh,camS.z+(Math.random()-.5)*sh);
    camera.lookAt(c.x+fx*5,c.y+1.3,c.z+fz*5);ST.punch=Math.max(0,ST.punch-dt*1.6);
    const fov=baseFov+Math.min(22,Math.max(0,v-18)*.28)+(boost?8:0)+ST.punch*10;if(Math.abs(fov-camS.fov)>.05||!camS.fovInit){camS.fov+=(fov-camS.fov)*(1-Math.exp(-dt*8));camS.fovInit=1;camera.fov=camS.fov;camera.updateProjectionMatrix()}
  }

  // ---------------------------------------------------------------- frame
  function frame(dt){
    ST.fc++;
    try{
      if(typeof entered==='undefined'||!entered)return;
      ensureFab();if(ST.mode==='off')return;
      dt=Math.min(dt,.05);const now=performance.now(),wall=now/1000;
      if((ST.sf=(ST.sf||0)+1)%180===0)syncSolids();
      if(ST.mode==='play'||ST.mode==='over'){ST.acc+=dt;let n=0;while(ST.acc>=DT&&n<4){if(ST.mode==='play')simStep();else idleStep();ST.acc-=DT;n++}if(n===4)ST.acc=0}
      if(!ST.me)return;
      pin();placeCar(ST.me.o,ST.me.c,dt,wall);placeCar(ST.ai.o,ST.ai.c,dt,wall);
      const far=Math.hypot(ST.ai.c.x-ST.me.c.x,ST.ai.c.z-ST.me.c.z)>700;ST.ai.o.group.visible=!far;ST.ai.o.blob.visible=!far&&(!ST.net||ST.net.seen>0);
      if(ST.net){netTick(now);const o=others.get(ST.net.id);if(o&&o.group)o.group.visible=false;ST.ai.o.group.visible=ST.net.seen>0&&!far}
      chaseCamera(dt);worldUpdate(wall);hudUpdate(now);
      // the cop's siren is audible when he is on the robber's tail
      const r=ST.r;if(r&&ST.mode==='play'&&r.phase!=='count'&&Math.hypot(ST.ai.c.x-ST.me.c.x,ST.ai.c.z-ST.me.c.z)<110&&wall-(ST.sirT||0)>.42){ST.sirT=wall;ST.sirK=!ST.sirK;tone(ST.sirK?760:980,.2,'square',.035)}
    }catch(e){
      if(!ST.err++){console.error('Chase error',e);try{toast('Chase error: '+e.message,3000)}catch(_){}}
      if(ST.err>30){try{exit()}catch(_){}}
    }
  }
  function idleStep(){   // after the round: the cars coast to a stop
    for(const x of [ST.me,ST.ai]){CP.step(x.c,{thr:0,steer:0,brake:true},DT,env)}
  }

  // ---------------------------------------------------------------- lobby + launcher
  const cfgDef=()=>{try{return Object.assign({role:'rob',cls:'comet',diff:'normal',mode:'ai'},JSON.parse(localStorage.getItem('chasecfg')||'{}'))}catch(e){return{role:'rob',cls:'comet',diff:'normal'}}};
  function openLobby(){
    if(ST.mode!=='off'||busy())return;closeSheet();sfxInit();
    const cfg=openLobby.cfg||(openLobby.cfg=cfgDef()),s=stat(),partner=partnerId(),po=partner&&others.get(partner),pname=(po&&(po.name||(po.group&&po.group.userData&&po.group.userData.nm)))||'friend';if(cfg.mode==='star'&&!partner)cfg.mode='ai';
    const bar=(k,v)=>`<div class="rl-st"><span>${k}</span><div><i style="width:${Math.round(clamp(v,0,1)*100)}%"></i></div></div>`;
    const cars=Object.entries(RALLY.cls).map(([k,v])=>`<button class="chip rl-car ${cfg.cls===k?'on':''}" data-cls="${k}"><b>${v.n}</b>${bar('Speed',(v.vmax-38)/26)}${bar('Handling',(v.turn*v.grip/11-.6)/.7)}${bar('Boost',(v.charges*v.boostT*v.boostMul-7)/6)}</button>`).join('');
    const chip=(a,k,l)=>`<button class="chip ${cfg[a]===k?'on':''}" data-${a}="${k}">${l}</button>`;
    sheet=el('div','sheet rl-sheet');
    sheet.innerHTML=`<h2>🚔 Cops & Robbers</h2>
      <p class="rl-sub">One of you steals the loot and runs for the getaway across the whole world, the other hunts him down. Hover-cars skim land and sea. Rounds last about a minute; swap roles each round.</p>
      <div class="rl-row">${chip('role','rob','🕵️ Robber')}${chip('role','cop','🚔 Cop')}</div>
      <div class="rl-row">${cars}</div>
      <div class="rl-row">${chip('mode','ai','🤖 vs AI')}<button class="chip ${cfg.mode==='star'?'on':''}" data-mode="star" ${partner?'':'disabled'}>👥 vs ${partner?pname:'a friend'}</button></div>
      <div class="rl-row" style="display:${cfg.mode==='star'?'none':'flex'}"><small>AI opponent:</small>${chip('diff','easy','Easy')}${chip('diff','normal','Normal')}${chip('diff','hard','Hard')}</div>
      <div class="rl-row"><button class="btn rl-go">START</button><button class="btn rl-x">Close</button></div>
      <p class="rl-help">${touch?'◀ ▶ steer, ▲ gas, BOOST, DRIFT. Robber: OIL drops a slick behind you. Cop: boost into the robber to RAM him. Stay within about 25 m of him to fill the BUST meter.':'Arrows/WASD steer · Space drift · Shift boost · E oil (robber) · boost into him to ram (cop). Stay within about 25 m to fill the BUST meter.'}</p>
      <p class="rl-best">${s.rounds} rounds · ${s.wins} won · ${s.esc} escapes · ${s.bust} busts · ${coinsNow()} 🪙</p>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;sfxInit();
      const set=a=>{cfg[a]=b.dataset[a];try{localStorage.setItem('chasecfg',JSON.stringify(cfg))}catch(_){}closeSheet();openLobby()};
      if(b.dataset.mode&&b.disabled)return;
      if(b.dataset.role)set('role');else if(b.dataset.mode)set('mode');else if(b.dataset.cls)set('cls');else if(b.dataset.diff)set('diff');
      else if(b.classList.contains('rl-x'))closeSheet();
      else if(b.classList.contains('rl-go')){closeSheet();ST.match={me:0,ai:0,n:0};if(cfg.mode==='star'&&partner)invite(Object.assign({},cfg));else begin(Object.assign({},cfg))}});
  }
  let fabMade=false;
  function ensureFab(){
    if(fabMade||!document.body)return;fabMade=true;
    fab=el('button','dk ch-fab','🚔');fab.title='Cops & Robbers';fab.setAttribute('aria-label','Cops & Robbers');
    fab.addEventListener('click',()=>{sfxInit();if(ST.mode==='off')openLobby()});document.body.appendChild(fab);buildHud();
  }

  // ---------------------------------------------------------------- multiplayer
  // The HOST owns the rules (loot, getaway, bust, oil, ram) and broadcasts snapshots + events; each phone drives its own car and sends it at 10 Hz;
  // the partner's car is dead-reckoned. The layout is a pure function of the seed, so both phones build the same heist with no extra data.
  const partnerId=()=>{try{return typeof others!=='undefined'&&others.size?[...others.keys()][0]:null}catch(e){return null}};
  function send(t,d){try{if(typeof Net!=='undefined'&&ST.net)Net.emit(t,Object.assign({rid:ST.net.rid},d))}catch(e){}}
  function netVisual(dt){
    const N=ST.net,p=N.pk,c=ST.ai.c;if(!p)return;
    const age=Math.min(.4,(performance.now()-p.at)/1000),v=N.v,k=1-Math.exp(-dt*12);
    const px=p.x+p.vx*age,py=p.y+p.vy*age,pz=p.z+p.vz*age;
    v.x+=(px-v.x)*k;v.y+=(py-v.y)*k;v.z+=(pz-v.z)*k;v.h+=wrap(p.h-v.h)*k;v.pitch+=(p.pitch-v.pitch)*k;v.roll+=(p.roll-v.roll)*k;
    c.x=v.x;c.y=v.y;c.z=v.z;c.h=v.h;c.pitch=v.pitch;c.roll=v.roll;c.vx=p.vx;c.vz=p.vz;c.vy=p.vy;c.s=Math.hypot(p.vx,p.vy,p.vz);c.boostT=p.boosting?1:0;c.padT=0;c.hitT=p.hit?.5:0;c.mode='car';c.steer=0;
    if(performance.now()-p.at>6000)N.seen=0;
  }
  function netTick(now){
    const N=ST.net;if(!N||!ST.r)return;
    if(now-N.lastC>=100){N.lastC=now;send('ch:c',{p:CP.pack(ST.me.c)})}
    if(N.host&&ST.mode==='play'&&now-N.lastS>=120){N.lastS=now;const r=ST.r;
      send('ch:s',{ph:r.phase,t:+r.t.toFixed(2),cy:r.carry?1:0,b:+r.bust.toFixed(3),sl:r.slicks.map(s=>[s.id,Math.round(s.x),Math.round(s.z),+s.life.toFixed(1)]),sn:r.slicksLeft,rt:+r.robT.toFixed(2),rm:r.robMul,ct:+r.copT.toFixed(2),cm:r.copMul,rp:+r.robPace.toFixed(3),cp:+r.copPace.toFixed(3),h:r.hint?[Math.round(r.hint.x),Math.round(r.hint.z)]:0})}
  }
  function applySnap(d){
    const r=ST.r;if(!r||ST.net.host||d.rid!==ST.net.rid)return;
    if(RANK[d.ph]>RANK[r.phase]&&d.ph!=='over'){r.phase=d.ph;r.cd=0}
    if(r.phase==='count')return;
    r.t=d.t;r.left=Math.max(0,CH.T-d.t);r.carry=!!d.cy;r.bust=d.b;r.slicks=d.sl.map(a=>({id:a[0],x:a[1],z:a[2],life:a[3]}));r.slicksLeft=d.sn;
    r.robT=d.rt;r.robMul=d.rm;r.copT=d.ct;r.copMul=d.cm;r.robPace=d.rp;r.copPace=d.cp;r.hint=d.h?{x:d.h[0],z:d.h[1]}:null;
  }
  let inv=null,pending=null;
  function invite(cfg){
    const rid=Math.random().toString(36).slice(2,8);pending={rid,cfg};
    Net.emit('ch:inv',{rid,role:cfg.role,cls:cfg.cls,name:typeof myName==='string'?myName:'Friend'});
    try{banner('Invite sent. Waiting for your friend…','COPS & ROBBERS')}catch(e){}
    clearTimeout(pending.t);pending.t=setTimeout(()=>{if(pending&&ST.mode==='off'){pending=null;try{banner('No answer. Try again or play the AI.','COPS & ROBBERS')}catch(e){}}},25000);
  }
  function showInvite(d,from){
    buildHud();inv&&inv.remove();const role=d.role==='rob'?'COP':'ROBBER';
    inv=el('div','rl-inv',`<b>🚔 ${d.name||'A friend'} invites you to Cops & Robbers — you would be the ${role}</b><div><button class="btn rl-y">Join</button><button class="btn rl-n">No</button></div>`);document.body.appendChild(inv);
    const done=()=>{inv&&inv.remove();inv=null};
    inv.querySelector('.rl-n').onclick=done;
    inv.querySelector('.rl-y').onclick=()=>{done();sfxInit();const cfg=openLobby.cfg||(openLobby.cfg=cfgDef());ST.join={rid:d.rid,from};
      Net.emit('ch:acc',{rid:d.rid,cls:cfg.cls,name:typeof myName==='string'?myName:'Friend'});try{banner('Joined! Waiting for the start…','COPS & ROBBERS')}catch(e){}};
    setTimeout(done,30000);
  }
  function netInit(){
    if(netInit.done||typeof Net==='undefined')return;netInit.done=true;
    Net.on('ch:inv',(d,from)=>{if(ST.mode!=='off'||busy()||!d)return;showInvite(d,from)});
    Net.on('ch:acc',(d,from)=>{
      if(!d||!pending||d.rid!==pending.rid||ST.mode!=='off')return;const cfg=pending.cfg,rid=pending.rid;clearTimeout(pending.t);pending=null;
      const seed=((Math.random()*1e6)|0)+1;
      Net.emit('ch:go',{rid,seed,hostRole:cfg.role,hostCls:cfg.cls,hostName:typeof myName==='string'?myName:'Host'});
      ST.match={me:0,ai:0,n:0};begin(Object.assign({},cfg,{seed,rid}),{id:from,host:true,cls:d.cls,name:d.name});
    });
    Net.on('ch:go',(d,from)=>{
      if(!d)return;const rejoin=ST.net&&ST.net.rid===d.rid&&ST.mode==='over';
      if(!rejoin&&(!ST.join||d.rid!==ST.join.rid||ST.mode!=='off'))return;
      const cfg=openLobby.cfg||(openLobby.cfg=cfgDef()),mt=rejoin?ST.match:{me:0,ai:0,n:0},ret=rejoin?ST.ret:null,cls=rejoin?ST.cfg.cls:cfg.cls;
      if(rejoin)cleanup();else ST.join=null;ST.match=mt;
      begin({role:d.hostRole==='rob'?'cop':'rob',cls,seed:d.seed,rid:d.rid},{id:from,host:false,cls:d.hostCls,name:d.hostName});if(ret)ST.ret=ret;
    });
    Net.on('ch:c',(d)=>{const N=ST.net;if(!N||!d||d.rid!==N.rid)return;const p=CP.unpack(d.p,{});p.at=performance.now();N.pk=p;if(!N.seen){N.seen=1;N.v.x=p.x;N.v.y=p.y;N.v.z=p.z;N.v.h=p.h}});
    Net.on('ch:s',d=>{if(ST.net&&d)applySnap(d)});
    Net.on('ch:a',d=>{const N=ST.net;if(N&&N.host&&d&&d.rid===N.rid&&d.k==='slick')N.act.slick=true});
    Net.on('ch:e',d=>{const N=ST.net,r=ST.r;if(!N||N.host||!r||!d||d.rid!==N.rid)return;
      if(d.k==='escape'||d.k==='bust'||d.k==='time'){r.phase='over';r.result=d.k==='time'?'time':d.k;r.pts=d.pts;r.left=d.left;r.t=d.t}
      if(d.k==='loot'){r.carry=true;if(RANK[r.phase]<2)r.phase='run'}
      onEvent(d,ST.role==='rob')});
    Net.on('ch:l',d=>{const N=ST.net;if(!N||!d||d.rid!==N.rid)return;N.seen=0;toast('Your friend left',2200);if(ST.mode==='play')setTimeout(()=>{if(ST.net===N)exit()},1800)});
  }
  setTimeout(function wait(){if(typeof Net==='undefined'||typeof others==='undefined'){setTimeout(wait,500);return}netInit()},1200);

  return {
    open:openLobby,start:begin,exit,
    locked:()=>ST.mode!=='off',
    setInput:(ix,iy)=>{IN.ix=ix;IN.iy=iy},
    frame,
    // test hooks
    state:()=>({mode:ST.mode,r:ST.r&&{phase:ST.r.phase,t:ST.r.t,carry:ST.r.carry,bust:ST.r.bust,result:ST.r.result,L:ST.r.L,left:ST.r.left},me:ST.me&&{x:ST.me.c.x,y:ST.me.c.y,z:ST.me.c.z,s:ST.me.c.s},ai:ST.ai&&{x:ST.ai.c.x,y:ST.ai.c.y,z:ST.ai.c.z,s:ST.ai.c.s},err:ST.err,fc:ST.fc,res:ST.res,match:ST.match}),
    sim:(sec)=>{if(ST.mode!=='play')return;for(let i=0,n=Math.round(sec/DT);i<n&&ST.mode==='play';i++)simStep()},
    autopilot:(on)=>{ST.auto=!!on},
    spots:()=>buildSpots(),
  };
})();
