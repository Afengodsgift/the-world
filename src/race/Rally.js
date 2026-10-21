// Rally: the Skybreak Rally controller (browser only). Wires the pure modules (CarPhysics, Track, Pilot) into THE WORLD:
//   lobby -> teleport to the grid -> countdown -> race (player + AI + a partner) -> results -> exit back to where you were.
// It follows the Ship precedent: `Rally.locked()` takes over the stick in tick(); `Rally.frame(dt)` runs once per frame right after CameraRig.update
// (sim, avatar pin, chase camera, HUD); `Rally.clears(x,z)` keeps vegetation off the roads. Nothing else in the game is modified.
// Multiplayer uses the existing Net adapter only: invite / accept / go (start time is relative, so clients start together), a 10 Hz car packet
// (~60 bytes, dead-reckoned by the receiver), gate progress inside that packet (so a lost message repairs itself), results computed locally.
// AI racers are simulated on each phone from the same seed (zero extra traffic); they can differ by a few metres between phones.
// Globals used: THREE, scene, camera, renderer, S, me, others, H, keys, banner, Net, myId, myName, entered, Fx, $, CarPhysics, Track, Pilot, RallyWorld, RALLY, TRACKS.
const Rally=(()=>{
  const CP=CarPhysics,Tk=Track,DT=1/60,TRACK_ID='skybreak-1';
  const clamp=(v,a,b)=>v<a?a:v>b?b:v,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const ST={mode:'off',acc:0,startAt:0,t:0,go:false,cfg:null,ret:null,rid:null,partner:null,lastNet:0,finAt:0,shake:0,punch:0,flash:0,auto:false,err:0};
  const IN={ix:0,iy:0},BTN={boost:false,hand:false,rec:false},touch=matchMedia&&matchMedia('(pointer:coarse)').matches;
  let T=null,world=null,R=[],ME=null,env=null,hud=null,fab=null,sheet=null,inv=null,lastHud=0,camS={yaw:0,x:0,y:0,z:0,fov:65,init:false},baseFov=65,lastClock=0;
  const models={};
  const best=()=>{try{return +localStorage.getItem('wrally_best')||0}catch(e){return 0}};
  const setBest=t=>{try{localStorage.setItem('wrally_best',String(t))}catch(e){}};
  const fmt=t=>{if(!(t>=0))return '--:--.-';const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(1)};

  // ---------------------------------------------------------------- track
  function ensureTrack(){
    if(T||typeof TRACKS==='undefined'||typeof H!=='function')return T;
    T=Tk.build(TRACKS[TRACK_ID],{H});env={ground:T.ground,surf:T.surf,landOK:T.landOK};
    return T;
  }
  // vegetation / props keep clear of the roads (index.html's scatter add() asks). A corridor of half-width + margin around every road sample.
  let clearGrid=null;
  function clears(x,z){
    if(!ensureTrack())return false;
    if(!clearGrid){clearGrid=new Map();for(const r of T.roads)for(let i=0;i<r.m;i++){const k=Math.floor(r.X[i]/24)+','+Math.floor(r.Z[i]/24);let a=clearGrid.get(k);if(!a){a=[];clearGrid.set(k,a)}a.push(r.X[i],r.Z[i],r.W[i]/2+9)}}
    const cx=Math.floor(x/24),cz=Math.floor(z/24);
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const g=clearGrid.get((cx+a)+','+(cz+b));if(g)for(let i=0;i<g.length;i+=3){const dx=x-g[i],dz=z-g[i+1];if(dx*dx+dz*dz<g[i+2]*g[i+2])return true}}
    return false;
  }

  // ---------------------------------------------------------------- sound (tiny WebAudio synth; created on the first tap)
  const SFX={ctx:null,eng:null,wind:null};
  function sfxInit(){
    if(SFX.ctx)return;try{
      const c=SFX.ctx=new (window.AudioContext||window.webkitAudioContext)(),mk=(type,g)=>{const o=c.createOscillator(),f=c.createBiquadFilter(),v=c.createGain();o.type=type;f.type='lowpass';f.frequency.value=900;v.gain.value=0;o.connect(f);f.connect(v);v.connect(c.destination);o.start();return {o,f,v}};
      SFX.eng=mk('sawtooth');SFX.eng2=mk('square');
      const nb=c.createBuffer(1,c.sampleRate,c.sampleRate),d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
      const ns=c.createBufferSource();ns.buffer=nb;ns.loop=true;const nf=c.createBiquadFilter();nf.type='bandpass';nf.frequency.value=900;const ng=c.createGain();ng.gain.value=0;ns.connect(nf);nf.connect(ng);ng.connect(c.destination);ns.start();SFX.wind={f:nf,v:ng};
    }catch(e){SFX.ctx=null}
  }
  function tone(f,d,type,vol,slide){
    const c=SFX.ctx;if(!c)return;try{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f*slide),t+d);
      g.gain.setValueAtTime(vol||.12,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+d+.02)}catch(e){}
  }
  function sfxUpdate(dt){
    const c=SFX.ctx;if(!c||!ME)return;const t=c.currentTime,v=ME.c.s,on=ST.mode==='race'||ST.mode==='countdown'||ST.mode==='finish',fly=ME.c.mode==='fly',boost=ME.c.boostT>0||ME.c.padT>0;
    const f=(fly?95:52)+v*(fly?1.5:2.6)+(boost?35:0);
    SFX.eng.o.frequency.setTargetAtTime(f,t,.06);SFX.eng2.o.frequency.setTargetAtTime(f*.5,t,.06);
    SFX.eng.f.frequency.setTargetAtTime(500+v*22,t,.1);
    const g=on?(ST.mode==='countdown'?.025:fly?.035:.05):0;SFX.eng.v.gain.setTargetAtTime(g,t,.1);SFX.eng2.v.gain.setTargetAtTime(g*.7,t,.1);
    SFX.wind.v.gain.setTargetAtTime(on?clamp((v-30)/60,0,1)*(fly?.09:.035):0,t,.15);SFX.wind.f.frequency.setTargetAtTime(500+v*14,t,.2);
  }

  // ---------------------------------------------------------------- cars (visuals)
  function loadModel(url){
    if(!models[url])models[url]=fetch(url).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.arrayBuffer()})
      .then(buf=>new Promise((ok,no)=>new THREE.GLTFLoader().parse(buf,url.replace(/[^/]+$/,''),g=>ok(g.scene),no)));
    return models[url];
  }
  const wingGeo=(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,0,.9, 3.1,.15,-.7, 0,0,-.9]),3));g.setIndex([0,1,2]);g.computeVertexNormals();return g})();
  function makeCar(cls,tint){
    const spec=RALLY.cls[cls]||RALLY.cls.ace;tint=tint||spec.tint||null;const grp=new THREE.Group(),o={cls,tint,group:grp,model:null,wings:[],flames:[],fly:false,wingT:0,blob:null};
    // placeholder body until the real model streams in (or if it fails to load): a low box so the car is still visible and drivable
    const ph=new THREE.Mesh(new THREE.BoxGeometry(2.6,.9,4.2),new THREE.MeshLambertMaterial({color:tint?new THREE.Color(tint):0xcfd6e6}));ph.position.y=.7;grp.add(ph);o.ph=ph;
    loadModel(spec.model).then(src=>{
      const m=src.clone(true);
      m.traverse(n=>{if(n.isMesh){n.material=n.material.clone();if(tint&&n.material.color)n.material.color.multiply(new THREE.Color(tint));n.castShadow=false;n.receiveShadow=false;n.frustumCulled=true}});
      grp.remove(ph);grp.add(m);o.model=m;
    }).catch(e=>{console.warn('Rally: car model failed, using the placeholder',e&&e.message)});
    // transformation: glowing energy wings that unfold + thruster flames (procedural: neither car ships an authored transform clip)
    const wm=new THREE.MeshBasicMaterial({color:0x7fe9ff,transparent:true,opacity:.8,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
    for(const s of [-1,1]){const w=new THREE.Mesh(wingGeo,wm);w.scale.set(s,1,1);w.position.set(s*1.15,.75,-.2);w.visible=false;grp.add(w);o.wings.push(w)}
    const fm=new THREE.MeshBasicMaterial({color:0xffa44a,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false});
    for(const s of [-1,1]){const f=new THREE.Mesh(new THREE.ConeGeometry(.34,2.4,8),fm);f.rotation.x=-Math.PI/2;f.position.set(s*.85,.6,-3.2);f.visible=false;grp.add(f);o.flames.push(f)}
    o.blob=new THREE.Mesh(new THREE.CircleGeometry(1,20),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.35,depthWrite:false}));o.blob.rotation.x=-Math.PI/2;o.blob.scale.set(2.2,2.8,1);
    scene.add(grp);scene.add(o.blob);return o;
  }
  function destroyCar(o){if(!o)return;scene.remove(o.group);scene.remove(o.blob);o.blob.geometry.dispose();o.blob.material.dispose()}
  function placeCar(o,c,dt,t){
    const hover=c.mode==='fly'?0:.12+Math.sin(t*6+o.group.id)*.03;
    o.group.position.set(c.x,c.y+hover,c.z);o.group.rotation.set(-c.pitch,c.h,c.roll,'YXZ');
    const fly=c.mode==='fly';
    if(fly!==o.fly){o.fly=fly;o.wingT=0}
    o.wingT=Math.min(1,o.wingT+dt*2.2);const wv=fly?o.wingT:1-o.wingT;
    for(const w of o.wings){w.visible=wv>.02;w.scale.x=Math.sign(w.scale.x||1)*Math.max(.01,wv);w.scale.z=.5+wv*.5}
    const fl=fly||c.boostT>0||c.padT>0,fs=(c.boostT>0||c.padT>0?1.5:1)*(.8+.3*Math.sin(t*45+o.group.id));
    for(const f of o.flames){f.visible=fl;f.scale.set(1,fs*(fly?1.3:1),1)}
    // shadow blob on whatever is below (road deck or terrain)
    const gy=T?T.ground(c.x,c.z,c.y+1.5):0,hh=Math.max(0,c.y-gy);
    o.blob.position.set(c.x,gy+.07,c.z);o.blob.rotation.z=-c.h;const sc=1+hh*.04;o.blob.scale.set(2.2*sc,2.8*sc,1);o.blob.material.opacity=clamp(.4-hh*.012,.05,.4);
  }

  // ---------------------------------------------------------------- racers
  function newRacer(kind,name,cls,tint,slot,skill){
    const s=T.gridSlots(12)[slot],c=CP.newCar(s.x,s.z,s.h,cls,env),R0={kind,name,cls,c,r:Tk.racer(),o:makeCar(cls,tint),slot,pilot:null,inp:{},hitCd:0,rec:0,place:1,finT:0,smooth:null,seen:0,hum:[],splits:[]};
    if(kind==='ai')R0.pilot=Pilot.make(T,skill||'steady',(ST.seed||1)*31+slot*7);
    return R0;
  }
  function score(R0){return Tk.score(T,R0.r,R0.c.x,R0.c.y,R0.c.z)}
  function rank(){const a=R.filter(x=>x.kind!=='net'||x.seen>0).sort((p,q)=>score(q)-score(p));a.forEach((x,i)=>x.place=i+1);return a}

  function onGate(R0,ev){
    const g=T.gates[ev.gate],c=R0.c,mine=R0===ME;
    if(ev.skipped&&mine)toast('CHECKPOINT MISSED, SKIPPED');
    if(g.mode==='fly'&&c.mode==='car'){CP.toFly(c);if(mine){ST.punch=1;ST.flash=1;transformFx(c);tone(220,.7,'sawtooth',.14,3.2);toast('SKYBREAK! FLY!',1400)}else transformFx(c)}
    if(ev.perfect&&g.type==='air'&&g.boost){CP.pad(c,1.2);if(mine){tone(880,.18,'triangle',.12);tone(1320,.22,'triangle',.1)}}
    else if(mine){tone(g.k==='finish'?660:520,.12,'triangle',.1)}
    if(mine&&g.k!=='lip'&&g.k!=='touchdown'&&!ev.finish)ST.msg={t:ST.t,s:(g.type==='air'?'RING ':'GATE ')+ME.r.passed+'/'+T.gates.length+(ev.perfect&&g.type==='air'?'  +BOOST':'')};
    if(mine&&ev.finish)finishMe();
    if(R0.kind==='net')return;
  }
  function transformFx(c){try{Fx.burst(c.x,c.y+1,c.z,'#7fe9ff',14)}catch(e){}}
  function onLand(R0){
    if(R0===ME){tone(120,.35,'sine',.2,.4);ST.shake=Math.max(ST.shake,.5);toast('TOUCHDOWN',900)}
    try{Fx.burst(R0.c.x,R0.c.y+.3,R0.c.z,'#e8d9b0',10)}catch(e){}
  }
  function recoverRacer(R0,why){
    const rc=T.respawn(R0.r,{}),c=R0.c;
    c.x=rc.x;c.y=rc.y;c.z=rc.z;c.h=rc.h;c.vx=Math.sin(rc.h)*rc.speed;c.vz=Math.cos(rc.h)*rc.speed;c.vy=0;c.vyS=0;c.steer=0;c.pitch=0;c.roll=0;c.boostT=0;c.padT=0;c.mode='car';c.grounded=rc.mode==='car';c.air=0;
    if(rc.mode==='fly')CP.toFly(c);
    R0.r.px=NaN;R0.r.gT=0;R0.r.rec++;R0.rec++;R0.hitCd=1;
    if(R0===ME){ST.flash=1;camS.init=false;toast(why==='manual'?'RECOVERED':why==='water'?'SPLASH! BACK ON TRACK':'BACK ON TRACK',1200);tone(330,.25,'triangle',.12,1.5)}
  }
  function stepRacer(R0,inp){
    const c=R0.c,wasFly=c.mode==='fly',ev=CP.step(c,inp,DT,env);
    if(wasFly&&c.mode==='car'&&ev.land)onLand(R0);
    if(ev.bump>7&&R0===ME){ST.shake=Math.max(ST.shake,clamp(ev.bump/40,.15,.7));tone(90,.2,'square',.16,.5)}
    if(ev.boost&&R0===ME){tone(300,.5,'sawtooth',.1,2.2);ST.punch=.6}
    if(c.mode==='car'&&c.grounded){
      if(T.padAt(c.x,c.y,c.z)>=0){if(c.padT<.8&&R0===ME){tone(500,.4,'sawtooth',.1,2.6);ST.punch=Math.max(ST.punch,.5)}CP.pad(c,1.4)}
      R0.hitCd-=DT;
      if(R0.hitCd<=0&&T.hitHazard(c.x,c.y,c.z,ST.t,1.65)>=0){R0.hitCd=1.2;c.vx*=.35;c.vz*=.35;if(R0===ME){ST.shake=.8;toast('SMASHED!',900);tone(70,.35,'square',.2,.5)}}
    }
    const g=Tk.advance(T,R0.r,c.x,c.y,c.z,ST.t);if(g.gate>=0)onGate(R0,g);
    const why=Tk.needsRecovery(T,R0.r,c,DT);if(why)recoverRacer(R0,why);
  }

  // ---------------------------------------------------------------- UI
  function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
  function note(s){try{if(typeof banner==='function')banner(s,'SKYBREAK RALLY')}catch(e){}}
  function toast(s,ms){if(!hud)return;const t=hud.querySelector('.rl-msg');t.textContent=s;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),ms||1100)}
  function buildHud(){
    if(hud)return;
    hud=el('div','rl-hud');hud.innerHTML=`
      <div class="rl-top"><div class="rl-pos"><b id="rlPos">1</b><span id="rlOf">/1</span></div>
        <div class="rl-mid"><div class="rl-time" id="rlTime">0:00.0</div><div class="rl-bar" id="rlBar"></div><div class="rl-gate" id="rlGate"></div></div>
        <div class="rl-spd"><b id="rlSpd">0</b><small>km/h</small><div class="rl-mode" id="rlMode">CAR</div><div class="rl-pips" id="rlPips"></div></div></div>
      <div class="rl-arrow" id="rlArrow"><i></i></div>
      <div class="rl-msg"></div><div class="rl-count" id="rlCount"></div>
      <div class="rl-btns"><button id="rlBoost" class="rl-b rl-boost">BOOST</button><button id="rlHand" class="rl-b rl-hand">DRIFT</button><button id="rlRec" class="rl-b rl-rec">RECOVER</button><button id="rlExit" class="rl-b rl-exit">EXIT</button></div>`;
    document.body.appendChild(hud);
    const hold=(id,on,off)=>{const b=hud.querySelector(id);const dn=e=>{e.preventDefault();on();b.classList.add('dn')},up=e=>{e.preventDefault();off&&off();b.classList.remove('dn')};
      b.addEventListener('pointerdown',dn);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('pointerleave',up)};
    hold('#rlBoost',()=>{BTN.boost=true});hold('#rlHand',()=>{BTN.hand=true},()=>{BTN.hand=false});hold('#rlRec',()=>{BTN.rec=true});
    hud.querySelector('#rlExit').addEventListener('click',()=>{if(ST.mode==='finish'||confirm('Leave the race?'))exit()});
  }
  function hudUpdate(now){
    if(!hud||!ME)return;if(now-lastHud<90)return;lastHud=now;
    const c=ME.c,q=id=>hud.querySelector(id),rk=rank(),n=rk.length;
    q('#rlPos').textContent=ME.place;q('#rlOf').textContent='/'+n;
    q('#rlTime').textContent=ST.mode==='countdown'?'GET READY':fmt(ME.r.finished?ME.r.finishT:Math.max(0,ST.t));
    q('#rlSpd').textContent=Math.round(c.s*3.6);q('#rlMode').textContent=c.mode==='fly'?'✈ FLIGHT':'🚗 CAR';q('#rlMode').className='rl-mode '+(c.mode==='fly'?'fly':'');
    q('#rlPips').innerHTML=Array.from({length:c.p.charges},(_,i)=>'<i class="'+(i<c.charges?'f':'')+'"></i>').join('');
    q('#rlGate').textContent=ME.r.finished?'FINISHED':'Gate '+Math.min(ME.r.passed+1,T.gates.length)+'/'+T.gates.length;
    // route bar: where everybody is along the whole course
    const bar=q('#rlBar');if(!bar.firstChild){for(let i=0;i<R.length;i++)bar.appendChild(el('i','rl-dot'))}
    const N=T.gates.length;
    R.forEach((x,i)=>{const d=bar.children[i];if(!d)return;const g=T.gates[x.r.next],pg=T.gates[Math.max(0,x.r.next-1)];let f=x.r.passed;
      if(g&&!x.r.finished){const seg=Math.max(1,Math.hypot(g.x-pg.x,g.z-pg.z)),dd=Math.hypot(g.x-x.c.x,g.z-x.c.z);f+=clamp(1-dd/seg,0,.99)}else f=N;
      d.style.left=clamp(f/N,0,1)*100+'%';d.className='rl-dot '+(x===ME?'me':x.kind==='net'?'net':'ai')+(x.kind==='net'&&!x.seen?' hide':'')});
    // arrow to the next gate
    const g=T.gates[ME.r.next];if(g){const err=wrap(Math.atan2(g.x-c.x,g.z-c.z)-c.h);q('#rlArrow').style.transform='rotate('+(-err)+'rad)';q('#rlArrow').style.opacity=ST.mode==='race'?.85:0}
  }
  function countdownUI(){
    const c=hud.querySelector('#rlCount');
    if(ST.mode!=='countdown'){if(c.dataset.s!=='x'){c.dataset.s='x';c.innerHTML=''}return}
    const left=(ST.startAt-performance.now())/1000,n=Math.ceil(left);
    let s=n>3?'':String(n);if(s!==c.dataset.s){c.dataset.s=s;
      if(n>3)c.innerHTML='<div class="rl-lights"><i></i><i></i><i></i></div>';
      else{c.innerHTML='<div class="rl-lights">'+[3,2,1].map(k=>'<i class="'+(k>=n?'r':'')+'"></i>').join('')+'</div><div class="rl-big">'+s+'</div>';tone(n===1?700:520,.18,'square',.1)}}
  }

  function openLobby(){
    if(ST.mode!=='off')return;ensureTrack();buildHud();
    sheet&&sheet.remove();sheet=el('div','sheet rl-sheet');
    const partner=[...others.keys()][0],po=partner&&others.get(partner),pname=po&&(po.name||(po.group&&po.group.userData&&po.group.userData.nm))||'friend',cfg=openLobby.cfg||(openLobby.cfg={cls:'ace',mode:'ai',diff:'normal'});
    const stat=(k,v)=>`<div class="rl-st"><span>${k}</span><div><i style="width:${Math.round(v*100)}%"></i></div></div>`;
    const cars=Object.entries(RALLY.cls).map(([k,v])=>`<button class="chip rl-car ${cfg.cls===k?'on':''}" data-cls="${k}"><b>${v.n}</b>${stat('Speed',(v.vmax-38)/16)}${stat('Handling',(v.turn*v.grip/10-.9)/1.0)}${stat('Boost',(v.charges*v.boostT*v.boostMul-7)/6)}</button>`).join('');
    const mode=(k,l,dis)=>`<button class="chip ${cfg.mode===k?'on':''}" data-mode="${k}" ${dis?'disabled':''}>${l}</button>`;
    const diff=(k,l)=>`<button class="chip ${cfg.diff===k?'on':''}" data-diff="${k}">${l}</button>`;
    sheet.innerHTML=`<h2>🏁 Skybreak Rally</h2>
      <p class="rl-sub">Palm Atoll ➜ Storm Cay ➜ Frost Isle · ${(T.roads.reduce((a,r)=>a+r.len,0)/1000).toFixed(1)} km of road · 2 ramp launches · 10 sky rings · fly between the islands</p>
      <div class="rl-row">${cars}</div>
      <div class="rl-row">${mode('solo','⏱ Time trial')}${mode('ai','🤖 vs AI')}${mode('star','👥 vs '+pname,!partner)}</div>
      <div class="rl-row" id="rlDiff" style="display:${cfg.mode==='ai'||cfg.mode==='star'?'flex':'none'}"><small>AI rivals:</small>${diff('none','None')}${diff('easy','Easy')}${diff('normal','Normal')}${diff('hard','Hard')}</div>
      <div class="rl-row"><button class="btn rl-go">START RACE</button><button class="btn rl-x">Close</button></div>
      <p class="rl-help">${touch?'Left stick: steer · up/down in the air to climb/dive · auto-gas on (pull down to brake). BOOST, DRIFT (airbrake in the sky) and RECOVER are on the right.':'Arrows/WASD steer · Space drift or airbrake · Shift boost · R recover. In the air up/down climbs or dives.'}</p>
      <p class="rl-best">Best time: ${best()?fmt(best()):'none yet'}</p>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.dataset.cls){cfg.cls=b.dataset.cls;openLobby.refresh()}
      else if(b.dataset.mode&&!b.disabled){cfg.mode=b.dataset.mode;if(cfg.mode==='solo')cfg.diff='none';else if(cfg.diff==='none')cfg.diff='normal';openLobby.refresh()}
      else if(b.dataset.diff){cfg.diff=b.dataset.diff;openLobby.refresh()}
      else if(b.classList.contains('rl-x'))closeLobby();
      else if(b.classList.contains('rl-go')){sfxInit();closeLobby();if(cfg.mode==='star'&&partner)inviteStar(cfg,partner);else start({cls:cfg.cls,ai:cfg.mode==='solo'?'none':cfg.diff,solo:cfg.mode==='solo'})}});
  }
  openLobby.refresh=()=>{if(!sheet)return;sheet.remove();sheet=null;const s=ST.mode;ST.mode='off';openLobby();ST.mode=s};
  function closeLobby(){if(sheet){sheet.remove();sheet=null}}

  function resultRows(){
    const rk=rank(),done=rk.filter(x=>x.r.finished).sort((a,b)=>a.r.finishT-b.r.finishT),rest=rk.filter(x=>!x.r.finished),list=done.concat(rest);
    return list.map((x,i)=>`<div class="rl-r ${x===ME?'me':''}"><b>${i+1}</b><span>${x.name}${x.kind==='net'&&x.cheat?' ⚠':''}</span><em>${x.r.finished?fmt(x.r.finishT):'racing… gate '+x.r.passed+'/'+T.gates.length}</em></div>`).join('');
  }
  function showResults(){
    if(sheet&&sheet.classList.contains('rl-res')){const l=sheet.querySelector('.rl-list');if(l)l.innerHTML=resultRows();return}   // already open: refresh the rows only (never rebuild under a thumb)
    if(sheet)sheet.remove();sheet=el('div','sheet rl-sheet rl-res');
    const rk=rank(),isBest=ME.r.finished&&(!best()||ME.r.finishT<=best());
    sheet.innerHTML=`<h2>${ME.r.finished?(ME.place===1&&rk.length>1?'🏆 You won!':'🏁 Finished'):'Race over'}</h2><div class="rl-list">${resultRows()}</div>
      <p class="rl-best">${ME.r.finished?'Your time '+fmt(ME.r.finishT)+(isBest?'  ·  NEW BEST!':'  ·  best '+fmt(best())):''}</p>
      <div class="rl-row"><button class="btn rl-again">Race again</button><button class="btn rl-x">Exit</button></div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.classList.contains('rl-x'))exit();
      else if(b.classList.contains('rl-again')){const cfg=ST.cfg;exit(true);if(cfg.net)note('Open the 🏁 menu to invite your friend again');else start(Object.assign({},cfg,{seed:0}))}});
  }
  function finishMe(){
    ST.mode='finish';ST.finAt=performance.now();tone(660,.3,'triangle',.14);tone(990,.5,'triangle',.12);toast('FINISH!',1800);
    if(ME.r.finished&&(!best()||ME.r.finishT<best()))setBest(ME.r.finishT);
    send('rl:c');setTimeout(()=>{if(ST.mode==='finish')showResults()},1600);
    ST.resT=setInterval(()=>{if(ST.mode!=='finish'){clearInterval(ST.resT);return}if(sheet&&sheet.classList.contains('rl-res')&&R.every(x=>x.r.finished||x.kind==='net'&&!x.seen)){clearInterval(ST.resT);return}if(sheet&&sheet.classList.contains('rl-res'))showResults()},1500);
  }

  // ---------------------------------------------------------------- lifecycle
  function start(cfg,net){
    ensureTrack();if(!T||ST.mode!=='off')return;buildHud();closeLobby();ensureWorld();
    ST.cfg=cfg;ST.seed=cfg.seed||(Math.random()*1e6|0);ST.rid=cfg.rid||null;
    ST.ret={x:S.x,y:S.y,z:S.z,rot:S.rot};
    const rivals={none:[],easy:['rookie','rookie','rookie'],normal:['steady','rookie','steady'],hard:['expert','steady','expert']}[cfg.ai||'none'];
    const names=['Nova','Rex','Kai'],cls=['comet','bruiser','ace'],tints=['#ff6a3d','#3d8bff','#8c6dff'];
    R=[];const humans=net?[net.hostFirst?'me':'net',net.hostFirst?'net':'me']:['me'];let slot=0;
    for(const h of humans){
      if(h==='me'){ME=newRacer('me',typeof myName==='string'&&myName||'You',cfg.cls,null,slot++);R.push(ME)}
      else{const nr=newRacer('net',net.name||'Friend',net.cls||'ace','#9fe0ff',slot++);nr.view={x:nr.c.x,y:nr.c.y,z:nr.c.z,h:nr.c.h,pitch:0,roll:0,vx:0,vy:0,vz:0,mode:'car',grounded:true,boosting:false};R.push(nr)}
    }
    rivals.forEach((sk,i)=>{R.push(newRacer('ai',names[i],cls[i],tints[i],slot++,sk))});
    ST.partner=net?net.id:null;
    // teleport the avatar onto the grid slot, hide it, take over the stick
    ST.mode='countdown';ST.t=0;ST.acc=0;ST.msg=null;document.body.classList.add('rally');
    ST.startAt=performance.now()+(net?net.in:4800);camS.init=false;baseFov=camera.fov;
    ST.camKids=camera.children.map(k=>[k,k.visible]);for(const [k] of ST.camKids)k.visible=false;   // held-item view models etc. stay out of the chase view
    if(me)me.visible=false;pin();hud.classList.add('on');
    hud.querySelector('#rlBar').innerHTML='';lastHud=0;
    toast(cfg.solo?'TIME TRIAL':'GET READY',1500);
  }
  function exit(again){
    if(ST.mode==='off')return;
    if(ST.partner)send('rl:l');
    for(const x of R)destroyCar(x.o);R=[];ME=null;ST.mode='off';ST.partner=null;ST.auto=false;
    closeLobby();if(hud)hud.classList.remove('on');document.body.classList.remove('rally');
    if(ST.camKids){for(const [k,v] of ST.camKids)k.visible=v;ST.camKids=null}
    if(me)me.visible=true;camera.fov=baseFov;camera.updateProjectionMatrix();clearInterval(ST.resT);
    if(ST.ret){S.x=ST.ret.x;S.z=ST.ret.z;S.y=Math.max(ST.ret.y,H(ST.ret.x,ST.ret.z)+.2);S.vy=0;S.rot=ST.ret.rot||S.rot;S.flying=false;S.grounded=true}
    BTN.boost=BTN.hand=BTN.rec=false;
    try{const a=SFX.eng;if(a&&SFX.ctx){const t=SFX.ctx.currentTime;a.v.gain.setTargetAtTime(0,t,.05);SFX.eng2.v.gain.setTargetAtTime(0,t,.05);SFX.wind.v.gain.setTargetAtTime(0,t,.05)}}catch(e){}
  }
  function ensureWorld(){if(!world&&T&&typeof scene!=='undefined'&&scene&&typeof RallyWorld!=='undefined'){try{world=RallyWorld.build(T,scene,H)}catch(e){console.error('RallyWorld',e)}}}
  function pin(){ // the avatar rides along (so world streaming, culling and presence follow the car), invisible to us
    const c=ME.c;S.x=c.x;S.y=c.y;S.z=c.z;S.vy=0;S.grounded=true;S.flying=false;S.rot=c.h;
    if(me){me.position.set(c.x,c.y,c.z);me.visible=false}
  }

  // ---------------------------------------------------------------- per-frame
  function playerInput(c,inp){
    const fly=c.mode==='fly',hand=BTN.hand||keys.Space;
    inp.steer=-IN.ix;inp.boost=BTN.boost||keys.ShiftLeft===true&&!playerInput.sh;playerInput.sh=keys.ShiftLeft===true;BTN.boost=false;inp.hand=false;inp.brake=false;inp.pitch=0;
    if(fly){inp.pitch=-IN.iy;inp.thr=hand?-1:.15}
    else{inp.thr=IN.iy>.25?-IN.iy:(touch||ST.autoGas)?1:(IN.iy<-.2?-IN.iy:0);inp.hand=hand&&c.s>6}
    if(BTN.rec||keys.KeyR){BTN.rec=false;if(ST.mode==='race'&&performance.now()-(playerInput.lastRec||0)>1500){playerInput.lastRec=performance.now();recoverRacer(ME,'manual')}}
  }
  function simStep(){
    for(const x of R){
      if(x.kind==='net')continue;
      const c=x.c;
      if(ST.mode==='countdown'){c.vx=c.vz=c.vy=0;c.s=0;x.inp.thr=0;x.inp.steer=0;x.inp.boost=false;x.inp.hand=false;x.inp.brake=true;CP.step(c,x.inp,DT,env);c.vx=c.vz=0;continue}
      if(x===ME&&!ST.auto){if(x.r.finished){x.inp.thr=0;x.inp.steer=0;x.inp.brake=true;x.inp.boost=false;x.inp.hand=false;x.inp.pitch=0}else playerInput(c,x.inp)}
      else Pilot.drive(x.pilot||(x.pilot=Pilot.make(T,'expert',7)),c,x.r,ST.t,DT,x.inp);
      if(x.kind==='ai'&&x.r.finished){x.inp.thr=0;x.inp.brake=true;x.inp.steer=0;x.inp.boost=false}
      stepRacer(x,x.inp);
      if(x.r.finished&&!x.finT){x.finT=1}
    }
    if(ST.mode==='race'||ST.mode==='finish')ST.t+=DT;
  }
  function netVisual(x,dt){
    const v=x.view,p=x.pk;if(!p)return;
    const age=Math.min(.4,(performance.now()-p.at)/1000);
    const px=p.x+p.vx*age,py=p.y+p.vy*age-(p.grounded?0:0),pz=p.z+p.vz*age,k=1-Math.exp(-dt*12);
    v.x+=(px-v.x)*k;v.y+=(py-v.y)*k;v.z+=(pz-v.z)*k;v.h+=wrap(p.h-v.h)*k;v.pitch+=(p.pitch-v.pitch)*k;v.roll+=(p.roll-v.roll)*k;
    v.mode=p.mode;v.boostT=p.boosting?1:0;v.padT=0;
    x.c.x=v.x;x.c.y=v.y;x.c.z=v.z;x.c.h=v.h;x.c.pitch=v.pitch;x.c.roll=v.roll;x.c.mode=v.mode;x.c.boostT=v.boostT;x.c.padT=0;x.c.vx=p.vx;x.c.vz=p.vz;x.c.vy=p.vy;x.c.s=Math.hypot(p.vx,p.vy,p.vz);
    if(performance.now()-p.at>6000)x.seen=0;
  }
  function chaseCamera(dt){
    const c=ME.c,fly=c.mode==='fly',v=c.s,t=performance.now()/1000;
    if(!camS.init){camS.yaw=c.h;camS.init=true;camS.x=c.x-Math.sin(c.h)*9;camS.y=c.y+4;camS.z=c.z-Math.cos(c.h)*9}
    let tgtYaw=c.h;
    if(ST.mode==='finish'){camS.orbit=(camS.orbit||0)+dt*.5;tgtYaw=c.h+Math.PI*.8+camS.orbit}
    camS.yaw+=wrap(tgtYaw-camS.yaw)*(1-Math.exp(-dt*(fly?3.2:4.6)));
    const boost=c.boostT>0||c.padT>0,dist=(fly?12.5:9)+Math.min(4,v*.045)+(boost?1.6:0)+ST.punch*2.5,hgt=(fly?3.6:3.5)+(fly?clamp(-c.pitch,-.6,.6)*3:0)+ST.punch*.6;
    const fx=Math.sin(camS.yaw),fz=Math.cos(camS.yaw);
    let tx=c.x-fx*dist,ty=c.y+hgt,tz=c.z-fz*dist;
    const k=1-Math.exp(-dt*(fly?9:13));camS.x+=(tx-camS.x)*k;camS.y+=(ty-camS.y)*k;camS.z+=(tz-camS.z)*k;
    const gy=T.ground(camS.x,camS.z,camS.y+4)+1.2;if(camS.y<gy)camS.y=gy;
    ST.shake=Math.max(0,ST.shake-dt*2);const sh=ST.shake*.35+(boost?.04:0);
    camera.position.set(camS.x+(Math.random()-.5)*sh,camS.y+(Math.random()-.5)*sh,camS.z+(Math.random()-.5)*sh);
    camera.lookAt(c.x+fx*5,c.y+1.3+(fly?c.pitch*-2:0),c.z+fz*5);
    ST.punch=Math.max(0,ST.punch-dt*1.6);ST.flash=Math.max(0,ST.flash-dt*2.5);
    const fov=baseFov+Math.min(14,v*.16)+(boost?5:0)+ST.punch*9;if(Math.abs(fov-camS.fov)>.05||!camS.fovInit){camS.fov+=(fov-camS.fov)*(1-Math.exp(-dt*8));camS.fovInit=1;camera.fov=camS.fov;camera.updateProjectionMatrix()}
  }
  function frame(dt){
    ST.fc=(ST.fc||0)+1;
    try{
      if(typeof entered==='undefined'||!entered)return;
      if(!T)ensureTrack();if(!T)return;
      if(!world)ensureWorld();
      const now=performance.now(),wall=now/1000;
      ensureFab();
      if(ST.mode==='off'){if(world)world.update(wall,-1,wall);return}
      dt=Math.min(dt,.05);
      if(ST.mode==='countdown'&&now>=ST.startAt){ST.mode='race';ST.t=0;toast('GO!',900);tone(880,.5,'square',.14);ST.punch=.8}
      ST.acc+=dt;let n=0;while(ST.acc>=DT&&n<4){simStep();ST.acc-=DT;n++}if(n===4)ST.acc=0;
      for(const x of R){if(x.kind==='net')netVisual(x,dt)}
      pin();
      for(const x of R){const vis=x.kind==='net'&&!x.seen?false:true;x.o.group.visible=vis;x.o.blob.visible=vis;
        // distant rivals cost draw time for nothing: hide beyond 500 m
        if(x!==ME&&vis){const far=Math.hypot(x.c.x-ME.c.x,x.c.z-ME.c.z)>500;x.o.group.visible=!far;x.o.blob.visible=!far}
        placeCar(x.o,x.c,dt,wall)}
      // partner's avatar is represented by the car: hide it
      if(ST.partner){const o=others.get(ST.partner);if(o&&o.group)o.group.visible=false}
      chaseCamera(dt);
      if(world)world.update(ST.mode==='race'||ST.mode==='finish'?ST.t:0,ME.r.next,wall);
      countdownUI();hudUpdate(now);sfxUpdate(dt);netTick(now);
      if(ST.msg&&ST.t-ST.msg.t<.9){toast(ST.msg.s,800);ST.msg=null}
      document.body.classList.toggle('rl-flash',ST.flash>.5);
    }catch(e){
      if(!ST.err++){console.error('Rally error',e);try{toast('Rally error: '+e.message,3000)}catch(_){}}
      if(ST.err>30){try{exit()}catch(_){}}
    }
  }
  let fabMade=false;
  function ensureFab(){
    if(fabMade||!document.body)return;fabMade=true;
    fab=el('button','dk rl-fab','🏁');fab.title='Skybreak Rally';fab.setAttribute('aria-label','Skybreak Rally');
    fab.addEventListener('click',()=>{sfxInit();if(ST.mode==='off')openLobby()});document.body.appendChild(fab);
  }

  // ---------------------------------------------------------------- multiplayer (Net adapter: invite / accept / go / packets / leave)
  function send(t){
    if(!ST.partner||!ME||typeof Net==='undefined')return;
    if(t==='rl:l')return Net.emit('rl:l',{rid:ST.rid});
    const c=ME.c,pk=CP.pack(c);Net.emit('rl:c',{rid:ST.rid,p:pk,g:ME.r.passed,f:ME.r.finished?+ME.r.finishT.toFixed(2):0,c:ME.cls,n:ME.name});
  }
  function netTick(now){if(!ST.partner)return;if(now-ST.lastNet>=100){ST.lastNet=now;send('rl:c')}}
  function inviteStar(cfg,partner){
    ST.rid=Math.random().toString(36).slice(2,8);ST.pendingCfg=cfg;
    Net.emit('rl:inv',{rid:ST.rid,cls:cfg.cls,name:typeof myName==='string'?myName:'Friend',ai:cfg.diff==='none'?'none':cfg.diff});
    note('Invite sent. Waiting for your friend…');clearTimeout(ST.invT);ST.invT=setTimeout(()=>{if(ST.pendingCfg&&ST.mode==='off'){ST.pendingCfg=null;note('No answer. Try again or race the AI.')}},25000);
  }
  function showInvite(d,fromId){
    buildHud();inv&&inv.remove();inv=el('div','rl-inv',`<b>🏁 ${d.name||'A friend'} invites you to a Skybreak Rally</b><div><button class="btn rl-y">Join</button><button class="btn rl-n">No</button></div>`);document.body.appendChild(inv);
    const done=()=>{inv&&inv.remove();inv=null};
    inv.querySelector('.rl-n').onclick=done;
    inv.querySelector('.rl-y').onclick=()=>{done();sfxInit();ST.joinCfg={rid:d.rid,from:fromId,cls:d.cls,name:d.name,ai:d.ai};ST.rid=d.rid;
      Net.emit('rl:acc',{rid:d.rid,cls:openLobby.cfg?openLobby.cfg.cls:'comet',name:typeof myName==='string'?myName:'Friend'});note('Joined! Waiting for the start…')};
    setTimeout(done,30000);
  }
  function netInit(){
    if(netInit.done||typeof Net==='undefined')return;netInit.done=true;
    Net.on('rl:inv',(d,from)=>{if(ST.mode!=='off'||!d)return;showInvite(d,from)});
    Net.on('rl:acc',(d,from)=>{
      if(!d||d.rid!==ST.rid||!ST.pendingCfg||ST.mode!=='off')return;const cfg=ST.pendingCfg;ST.pendingCfg=null;clearTimeout(ST.invT);
      const seed=Math.random()*1e6|0,inMs=6000;
      Net.emit('rl:go',{rid:ST.rid,in:inMs,seed,ai:cfg.diff==='none'?'none':cfg.diff,hostCls:cfg.cls,guestCls:d.cls,hostName:typeof myName==='string'?myName:'Host'});
      start({cls:cfg.cls,ai:cfg.diff==='none'?'none':cfg.diff,seed,rid:ST.rid,net:true},{id:from,hostFirst:true,cls:d.cls,name:d.name,in:inMs});
    });
    Net.on('rl:go',(d,from)=>{
      if(!d||!ST.joinCfg||d.rid!==ST.joinCfg.rid||ST.mode!=='off')return;
      start({cls:d.guestCls,ai:d.ai,seed:d.seed,rid:d.rid,net:true},{id:from,hostFirst:false,cls:d.hostCls,name:d.hostName,in:d.in});ST.joinCfg=null;
    });
    Net.on('rl:c',(d,from)=>{
      if(!d||ST.mode==='off'||d.rid!==ST.rid)return;const x=R.find(r=>r.kind==='net');if(!x)return;
      const p=CP.unpack(d.p,{});p.at=performance.now();x.pk=p;x.seen=1;
      if(x.cls!==d.c&&RALLY.cls[d.c]&&!x.clsSet){x.clsSet=1}
      if(d.g>x.r.passed){x.r.passed=d.g;x.r.next=d.g;x.r.gT=0;x.splits.push(ST.t);
        // referee: the partner's gate times must be physically possible (not tamper-proof, no server authority; see docs)
        if(x.splits.length>1){const i=x.splits.length-1;if(i<T.gates.length&&x.splits[i]-x.splits[i-1]<Tk.minTime(T,i)-.6)x.cheat=true}}
      if(d.f&&!x.r.finished){x.r.finished=true;x.r.finishT=d.f}
      x.name=d.n||x.name;
    });
    Net.on('rl:l',(d)=>{if(ST.mode==='off'||!d||d.rid!==ST.rid)return;const x=R.find(r=>r.kind==='net');if(x){x.seen=0;x.o.group.visible=false;toast('Your friend left the race',2200)}});
  }

  // ---------------------------------------------------------------- public API
  setTimeout(function wait(){if(typeof Net==='undefined'||typeof others==='undefined'){setTimeout(wait,500);return}netInit()},1000);
  return {
    clears,
    open:openLobby,start,exit,
    locked:()=>ST.mode!=='off',
    setInput:(ix,iy)=>{IN.ix=ix;IN.iy=iy},
    frame,
    // handy for tests / debugging
    state:()=>({mode:ST.mode,t:ST.t,fc:ST.fc,startIn:Math.round(ST.startAt-performance.now()),err:ST.err,me:ME&&{passed:ME.r.passed,next:ME.r.next,finished:ME.r.finished,finishT:ME.r.finishT,place:ME.place,mode:ME.c.mode,x:ME.c.x,y:ME.c.y,z:ME.c.z,s:ME.c.s,rec:ME.rec,grounded:ME.c.grounded},
      racers:R.map(x=>({name:x.name,kind:x.kind,passed:x.r.passed,finished:x.r.finished,finishT:x.r.finishT,rec:x.rec,mode:x.c.mode,seen:x.seen,cheat:!!x.cheat})),gates:T&&T.gates.length}),
    // test hook: fast-forward the simulation by `sec` seconds without waiting for frames (software WebGL in CI is far slower than a phone)
    sim:(sec)=>{if(ST.mode==='off')return;if(ST.mode==='countdown'){ST.mode='race';ST.t=0;ST.startAt=performance.now()-1}for(let i=0,n=Math.round(sec/DT);i<n;i++)simStep()},
    snapCam:()=>{camS.init=false},
    autopilot:(on)=>{ST.auto=!!on;if(ME&&on)ME.pilot=Pilot.make(T,'expert',3)},
    track:()=>ensureTrack(),
  };
})();
