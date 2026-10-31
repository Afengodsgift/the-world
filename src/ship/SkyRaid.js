// SKY RAID controller (browser only): the lobby (a 🛩 button), seats (pilot / gunner), input, the pilot's chase camera and the gunner's turret camera, HUD,
// sound, the host-authoritative simulation (SkyRaidCore.js) and its Net sync (channel 'sky'). Visuals are in SkyRaidWorld.js.
//
// One co-op airship, two seats: the PILOT flies (analog stick: turn and climb/dive, BOOST, ROLL = barrel-roll dodge), the GUNNER swings the turret (pad or drag = aim,
// FIRE; the gun overheats; MISSILES = homing salvo). Buttons only, like the Rally. Drag = free-look (pilot orbit camera / gunner aim). SWAP SEAT trades seats;
// solo, the empty seat is an AI: the crew mate guns when you fly, the autopilot flies (and orbits the fortress) when you gun. The player who starts the raid is the HOST and simulates everything; the guest sends only its seat's input
// (15 Hz) and mirrors the host's snapshots (10 Hz). Like the Rally it follows the Ship precedent: `SkyRaid.locked()` takes over the stick in tick(),
// `SkyRaid.frame(dt)` runs once per frame right after CameraRig.update and owns the camera while a raid is on.
// Globals used: THREE, scene, camera, renderer, S, me, others, keys, banner, Net, myId, myName, entered, SKY, Fx, Outlaw, Perf, sun, SkyCore, SkyRaidWorld.
const SkyRaid=(()=>{
  const SC=typeof SkyCore!=='undefined'?SkyCore:null,DT=1/30;
  const ST={mode:'off',role:'pilot',host:true,partner:null,rid:null,acc:0,lastNet:0,lastSnap:0,lastStep:0,ret:null,shake:0,flash:0,paid:false,endT:0,warn:0,err:0};
  const IN={ix:0,iy:0},BTN={boost:false,fire:false,roll:false,missile:false,l:false,r:false,u:false,d:false},touch=typeof matchMedia!=='undefined'&&matchMedia('(pointer:coarse)').matches;
  let run=null,W=null,hud=null,fab=null,sheet=null,inv=null,drag=null,aim={yaw:0,pit:.12},view=null,pend=[],resPrev=null,lastHud=0,lastH=0;
  const look={yaw:0,pit:0,t:0},cmb={n:0,t:0};
  const remote={ix:0,iy:0,b:0,r:0,m:0,yw:0,pt:.1,f:0,t:0},camS={yaw:0,init:false,x:0,y:0,z:0,fov:65},baseFov=65;
  const clamp=(v,a,b)=>v<a?a:v>b?b:v,wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
  const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e};
  const locked=()=>ST.mode!=='off';

  // ---------------------------------------------------------------- sound (tiny WebAudio synth, created on the first tap)
  const SFX={ctx:null,eng:null};
  function sfxInit(){if(SFX.ctx)return;try{const c=SFX.ctx=new (window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();o.type='sawtooth';f.type='lowpass';f.frequency.value=420;g.gain.value=0;o.connect(f);f.connect(g);g.connect(c.destination);o.start();SFX.eng={o,f,g}}catch(e){SFX.ctx=null}}
  function tone(f,d,type,vol,slide){const c=SFX.ctx;if(!c)return;try{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f*slide),t+d);g.gain.setValueAtTime(vol||.1,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+d+.02)}catch(e){}}
  function sfxUpdate(dt){const c=SFX.ctx;if(!c||!run)return;const t=c.currentTime,s=run.ship;SFX.eng.o.frequency.setTargetAtTime(48+s.v*1.6+(s.boost>0?30:0),t,.08);SFX.eng.g.gain.setTargetAtTime(ST.mode==='race'?.035:0,t,.12)}

  // ---------------------------------------------------------------- race-time render savings (same idea as the Rally): <=1.25x pixels, no sun shadow pass
  function raceRes(on){
    try{
      if(on&&!resPrev){resPrev={sun:typeof sun!=='undefined'&&sun?sun.castShadow:null,dpr:null,far:camera.far,fog:scene.fog&&scene.fog.isFog?[scene.fog.near,scene.fog.far]:null};camera.far=2500;if(resPrev.fog){scene.fog.near=260;scene.fog.far=1500}if(typeof sun!=='undefined'&&sun&&sun.castShadow)sun.castShadow=false;
        const st=typeof Perf!=='undefined'&&Perf.state;if(st&&st.r&&!st.fixed){resPrev.dpr={dpr:st.dpr,min:st.min,locked:st.locked};st.min=1;if(st.dpr>1.25){st.dpr=1.25;st.r.setPixelRatio(1.25)}st.locked=true}}
      else if(!on&&resPrev){camera.far=resPrev.far;camera.updateProjectionMatrix();if(resPrev.fog&&scene.fog){scene.fog.near=resPrev.fog[0];scene.fog.far=resPrev.fog[1]}if(resPrev.sun&&typeof sun!=='undefined'&&sun)sun.castShadow=true;const st=typeof Perf!=='undefined'&&Perf.state,d=resPrev.dpr;if(st&&d){st.min=d.min;st.locked=d.locked;if(st.dpr!==d.dpr){st.dpr=d.dpr;st.r.setPixelRatio(d.dpr)}}resPrev=null}
    }catch(e){}
  }

  // ---------------------------------------------------------------- HUD
  function buildHud(){
    if(hud)return;
    try{const css=document.createElement('style');css.textContent=`
body.skyraid .dk,body.skyraid .dk-menu,body.skyraid #jump,body.skyraid #boost,body.skyraid #emobtn,body.skyraid #panbtn,body.skyraid #smack,body.skyraid #use,body.skyraid #hud,body.skyraid #info,body.skyraid #fshint,body.skyraid #emopanel{display:none!important}
.sk-hud{position:fixed;inset:0;pointer-events:none;z-index:10;display:none;font:700 13px system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000}.sk-hud.on{display:block}
.sk-top{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 10px);transform:translateX(-50%);text-align:center;width:min(92vw,520px)}
.sk-obj{background:rgba(8,12,26,.6);border-radius:12px;padding:6px 12px;font-size:13px}
.sk-bar{height:9px;border-radius:6px;background:rgba(0,0,0,.5);margin-top:6px;overflow:hidden}.sk-bar i{display:block;height:100%;width:100%;background:#ff8a3c;transition:width .15s}
.sk-hull{position:absolute;left:12px;top:calc(env(safe-area-inset-top,0px) + 64px);width:150px}.sk-hull .sk-bar i{background:#5fe38a}.sk-hull.low .sk-bar i{background:#ff4a4a}
.sk-heat{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 22px);transform:translateX(-50%);width:160px;display:none}.sk-heat .sk-bar i{background:linear-gradient(90deg,#ffd24a,#ff4a2a)}
.sk-arrow{position:absolute;right:14px;top:calc(env(safe-area-inset-top,0px) + 120px);text-align:center;font-size:11px}.sk-arrow b{display:block;font-size:30px;line-height:1;transition:transform .1s}
.sk-cross{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border:2px solid rgba(255,255,255,.85);border-radius:50%;display:none}.sk-cross::after{content:'';position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;background:#ff5a3c;border-radius:50%}
.sk-warn{position:absolute;left:50%;top:34%;transform:translateX(-50%);font-size:22px;color:#ff6a4a;opacity:0}.sk-warn.on{opacity:1}
.sk-msg{position:absolute;left:50%;top:26%;transform:translateX(-50%);font-size:26px;opacity:0;transition:opacity .3s;text-align:center}.sk-msg.on{opacity:1}
.sk-btn{position:absolute;pointer-events:auto;border:0;border-radius:50%;color:#fff;font:800 13px system-ui,sans-serif;background:rgba(20,30,60,.7);border:2px solid rgba(255,255,255,.4);touch-action:none}
.sk-boost{right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);width:78px;height:78px}.sk-fire{right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);width:96px;height:96px;background:rgba(200,50,40,.78);font-size:16px;display:none}
.sk-roll{right:104px;bottom:calc(env(safe-area-inset-bottom,0px) + 24px);width:64px;height:64px;background:rgba(40,120,200,.75);font-size:12px}.sk-msl{right:124px;bottom:calc(env(safe-area-inset-bottom,0px) + 24px);width:70px;height:70px;background:rgba(220,140,30,.8);font-size:11px;display:none}
.sk-btn.cd{opacity:.45}
.sk-swap{right:14px;top:calc(env(safe-area-inset-top,0px) + 108px);width:auto;height:34px;border-radius:17px;padding:0 12px;font-size:12px}
.sk-pad{position:absolute;left:calc(env(safe-area-inset-left,0px) + 14px);bottom:calc(env(safe-area-inset-bottom,0px) + 16px);width:206px;height:138px;pointer-events:none}
.sk-ar{width:66px;height:66px;font-size:24px;border-radius:18px}.sk-pad .sk-u{left:70px;top:0}.sk-pad .sk-l{left:0;bottom:0}.sk-pad .sk-d{left:70px;bottom:0}.sk-pad .sk-r{left:140px;bottom:0}
.sk-combo{position:absolute;left:12px;top:calc(env(safe-area-inset-top,0px) + 140px);font-size:22px;color:#ffd24a;opacity:0;transition:opacity .3s}.sk-combo.on{opacity:1}.sk-combo small{display:block;font-size:11px;color:#fff;opacity:.85}
.sk-cross.hit{border-color:#ffd24a;transform:scale(1.25);transition:transform .08s}.sk-hm{position:absolute;left:50%;top:50%;width:70px;height:70px;margin:-35px;border:3px solid #ffd24a;border-radius:50%;opacity:0;transform:scale(.6);pointer-events:none}.sk-hm.on{opacity:.9;transform:scale(1);transition:transform .12s,opacity .3s}
@media (max-height:420px){.sk-ar{width:58px;height:58px}.sk-pad{width:182px;height:122px}.sk-pad .sk-u,.sk-pad .sk-d{left:62px}.sk-pad .sk-r{left:124px}}
.sk-exit{right:14px;top:calc(env(safe-area-inset-top,0px) + 64px);width:38px;height:38px;border-radius:50%;font-size:16px}
.sk-role{position:absolute;left:12px;top:calc(env(safe-area-inset-top,0px) + 100px);font-size:11px;opacity:.85}
.sk-drag{position:fixed;inset:0;z-index:8;display:none;touch-action:none}.sk-drag.on{display:block}
.sk-flash{position:fixed;inset:0;pointer-events:none;z-index:9;background:radial-gradient(circle,rgba(255,40,30,0) 40%,rgba(255,40,30,.5));opacity:0;transition:opacity .25s}.sk-fab{position:fixed;right:var(--map-r,12px);top:calc(var(--map-t,58px) + 104px);width:var(--T,44px);height:var(--T,44px);padding:0;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:9}`;
      document.head.appendChild(css)}catch(e){}
    hud=el('div','sk-hud',`<div class="sk-top"><div class="sk-obj" id="skObj"></div><div class="sk-bar" id="skCoreBar"><i id="skCoreB"></i></div></div>
      <div class="sk-hull" id="skHull"><span id="skHullT"></span><div class="sk-bar"><i id="skHullB"></i></div></div><div class="sk-role" id="skRole"></div>
      <div class="sk-arrow"><b id="skArrow">▲</b><span id="skDist"></span></div><div class="sk-cross" id="skCross"></div><div class="sk-warn" id="skWarn">⚠ INCOMING</div><div class="sk-msg" id="skMsg"></div>
      <div class="sk-heat" id="skHeat"><div class="sk-bar"><i id="skHeatB"></i></div></div>
      <div class="sk-combo" id="skCombo"></div><div class="sk-hm" id="skHm"></div>
      <button class="sk-btn sk-boost" id="skBoost">BOOST</button><button class="sk-btn sk-roll" id="skRoll">ROLL</button><button class="sk-btn sk-fire" id="skFire">FIRE</button><button class="sk-btn sk-msl" id="skMsl">MISSILES</button><button class="sk-btn sk-swap" id="skSwap">⇄ SEAT</button><button class="sk-btn sk-exit" id="skExit">✕</button>`);
    document.body.appendChild(hud);
    const flash=el('div','sk-flash');flash.id='skFlash';document.body.appendChild(flash);
    drag=el('div','sk-drag');document.body.appendChild(drag);
    try{window.addEventListener('keydown',e=>{if(ST.mode!=='race')return;if(e.code==='KeyQ')BTN.roll=true;else if(e.code==='KeyE')BTN.missile=true;else if(e.code==='KeyR')swapSeat()})}catch(e){}
    const hold=(b,on,off)=>{b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();on()});for(const t of ['pointerup','pointercancel','pointerleave'])b.addEventListener(t,off)};
    hold(hud.querySelector('#skBoost'),()=>{BTN.boost=true},()=>{});hold(hud.querySelector('#skFire'),()=>{BTN.fire=true},()=>{BTN.fire=false});
    hold(hud.querySelector('#skRoll'),()=>{BTN.roll=true},()=>{});hold(hud.querySelector('#skMsl'),()=>{BTN.missile=true},()=>{});hold(hud.querySelector('#skSwap'),()=>{swapSeat()},()=>{});
    hud.querySelector('#skExit').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();leave(true)});
    // drag anywhere to aim the turret (gunner), and tap-hold to fire with a mouse
    let last=null;drag.addEventListener('pointerdown',e=>{last={x:e.clientX,y:e.clientY,id:e.pointerId};if(!touch&&ST.role==='gunner')BTN.fire=true});
    drag.addEventListener('pointermove',e=>{if(!last||e.pointerId!==last.id)return;const dx=e.clientX-last.x,dy=e.clientY-last.y;
      if(ST.role==='gunner'){aim.yaw=wrap(aim.yaw-dx*.0052);aim.pit=clamp(aim.pit-dy*.0042,-.9,1.45)}
      else{look.yaw=wrap(look.yaw-dx*.0065);look.pit=clamp(look.pit-dy*.0045,-1.05,.55);look.t=performance.now()}   // pilot: free-look orbit, eases back behind the ship when you let go
      last.x=e.clientX;last.y=e.clientY});
    for(const t of ['pointerup','pointercancel'])drag.addEventListener(t,()=>{last=null;look.t=performance.now();if(!touch&&ST.role==='gunner')BTN.fire=false});
  }
  const q=id=>hud.querySelector(id);
  function say(s,ms){if(!hud)return;const m=q('#skMsg');m.textContent=s;m.classList.add('on');clearTimeout(say.h);say.h=setTimeout(()=>m.classList.remove('on'),ms||1600)}
  function hudUpdate(){
    const s=run.ship,f=run.fort;q('#skObj').textContent=SC.objective(run);
    q('#skHullB').style.width=clamp(s.hull/s.hullMax,0,1)*100+'%';q('#skHullT').textContent='HULL '+Math.max(0,Math.round(s.hull));q('#skHull').classList.toggle('low',s.hull<s.hullMax*.3);
    const cb=q('#skCoreBar');if(f&&!f.done){cb.style.display='block';q('#skCoreB').style.width=clamp(f.core.hp/f.core.max,0,1)*100+'%';q('#skCoreB').style.background=SC.shield(f)?'#5fb8ff':'#ff8a3c'}else cb.style.display='none';
    const m=SC.marker(run),a=q('#skArrow');if(m){const dx=m.x-s.x,dz=m.z-s.z,rel=wrap(Math.atan2(dx,dz)-view.h);a.style.transform='rotate('+(-rel)+'rad)';q('#skDist').textContent=Math.round(Math.hypot(dx,dz))+' m'}else q('#skDist').textContent='';
    const g=ST.role==='gunner';q('#skCross').style.display=g?'block':'none';q('#skHeat').style.display=g?'block':'none';q('#skFire').style.display=g?'block':'none';q('#skMsl').style.display=g?'block':'none';q('#skBoost').style.display=g?'none':'block';q('#skRoll').style.display=g?'none':'block';
    if(g)q('#skHeatB').style.width=clamp(run.heat,0,1)*100+'%';
    q('#skBoost').textContent=s.boostCd>0&&s.boost<=0?Math.ceil(s.boostCd)+'s':'BOOST';q('#skBoost').classList.toggle('cd',s.boostCd>0&&s.boost<=0);
    q('#skRoll').textContent=s.rollCd>0?Math.ceil(s.rollCd)+'s':'ROLL';q('#skRoll').classList.toggle('cd',s.rollCd>0);
    q('#skMsl').textContent=run.mCd>0?Math.ceil(run.mCd)+'s':'MISSILES';q('#skMsl').classList.toggle('cd',run.mCd>0);
    const co=run.combo||{n:0};q('#skCombo').classList.toggle('on',co.n>=2);if(co.n>=2)q('#skCombo').innerHTML='x'+co.n+' COMBO<small>+'+Math.min(co.n,8)+' 🪙 per kill</small>';
    q('#skRole').textContent=(g?'🔫 GUNNER':'🛩 PILOT')+(ST.partner?'':g?' · autopilot flying':' · AI gunner');
    const sam=run.sams&&run.sams.some(p=>Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z)<300),near=sam||(run.flak&&run.flak.some(p=>Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z)<70))||run.shots.some(p=>Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z)<85);q('#skWarn').textContent=sam?'⚠ MISSILE! ROLL / TURN / SHOOT IT':'⚠ INCOMING';q('#skWarn').classList.toggle('on',near);if(near&&performance.now()-ST.warn>(sam?260:420)){ST.warn=performance.now();tone(sam?1400:1000,.06,'square',.06)}
    drag.classList.toggle('on',ST.mode==='race');
  }

  // ---------------------------------------------------------------- hangar: spend coins (the shared Outlaw coins) on permanent upgrades. Saved on this phone; the host's upgrades apply to the raid.
  const UPG=[{k:'hull',n:'🛡 Armor plating',d:'+10% hull per level',base:150},{k:'gun',n:'🔫 Gun & missile damage',d:'+12% damage per level',base:180},{k:'msl',n:'🚀 Missile reload',d:'-8% cooldown per level',base:140},
    {k:'roll',n:'🌀 Roll drive',d:'-10% roll cooldown per level',base:120},{k:'wing',n:'🛩 Wingmen firepower',d:'+25% per level',base:160}],MAXL=5;
  const UP={hull:0,gun:0,msl:0,roll:0,wing:0};try{Object.assign(UP,JSON.parse(localStorage.getItem('skyup')||'{}'))}catch(e){}
  const saveUp=()=>{try{localStorage.setItem('skyup',JSON.stringify(UP))}catch(e){}};
  const coinsNow=()=>typeof Outlaw!=='undefined'&&Outlaw.coins?Outlaw.coins():0;
  let hangar=null;
  function openHangar(back){
    hangar&&hangar.remove();hangar=el('div','sheet rl-sheet');
    const rows=UPG.map(u=>{const L=UP[u.k],cost=u.base*(L+1),pips='●'.repeat(L)+'○'.repeat(MAXL-L);
      return `<div class="rl-row" style="justify-content:space-between;gap:8px"><div style="text-align:left"><b>${u.n}</b><br><small>${u.d} · ${pips}</small></div>${L>=MAXL?'<b>MAX</b>':`<button class="btn gold${coinsNow()>=cost?'':' off'}" data-up="${u.k}">${cost} 🪙</button>`}</div>`}).join('');
    hangar.innerHTML=`<h2>🔧 Hangar</h2><p class="rl-sub">Your coins: <b>${coinsNow()} 🪙</b>. Upgrades are permanent.</p>${rows}<div class="rl-row"><button class="btn rl-hx">Back</button></div>`;
    document.body.appendChild(hangar);
    hangar.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.classList.contains('rl-hx')){hangar.remove();hangar=null;if(back)back();return}
      const k=b.dataset.up,u=UPG.find(x=>x.k===k);if(!u||UP[k]>=MAXL)return;const cost=u.base*(UP[k]+1);
      if(typeof Outlaw!=='undefined'&&Outlaw.spend&&Outlaw.spend(cost)){UP[k]++;saveUp();tone(700,.15,'triangle',.1);tone(1000,.2,'triangle',.1)}else{tone(150,.2,'square',.08);note('Not enough coins')}
      openHangar(back)});
  }
  // ---------------------------------------------------------------- lobby
  let fabMade=false;
  function ensureFab(){
    if(fabMade||!document.body)return;fabMade=true;buildHud();
    fab=el('button','dk sk-fab','🛩');fab.title='Sky Raid';fab.setAttribute('aria-label','Sky Raid');
    fab.addEventListener('click',()=>{sfxInit();if(ST.mode==='off')openLobby()});document.body.appendChild(fab);
  }
  const cfg={role:'pilot'};
  function partnerId(){try{return [...others.keys()][0]||null}catch(e){return null}}
  function openLobby(){
    if(ST.mode!=='off'||(typeof Ship!=='undefined'&&Ship.locked&&Ship.locked())||(typeof Rally!=='undefined'&&Rally.locked&&Rally.locked()))return;
    sheet&&sheet.remove();sheet=el('div','sheet rl-sheet');
    const pid=partnerId(),po=pid&&others.get(pid),pname=po&&(po.name||(po.group&&po.group.userData&&po.group.userData.nm))||'your friend';if(!pid)cfg.role='pilot';
    const chip=(k,l,dis)=>`<button class="chip ${cfg.role===k?'on':''}" data-role="${k}" ${dis?'disabled':''}>${l}</button>`;
    sheet.innerHTML=`<h2>🛩 Sky Raid</h2>
      <p class="rl-sub">Fly the sky galleon between the floating fortresses and bring them down: shoot the shield generators, then the core. Four fortresses, the last one a boss. Fly or gun: swap seats any time, and when you are alone the other seat is an AI.</p>
      <div class="rl-row">${chip('pilot','🛩 I fly')}${chip('gunner','🔫 I man the turret',!pid)}</div>
      <p class="rl-help">${pid?'Your friend gets the other seat. Start the raid and they will get an invite.':'Solo: you fly and an AI crew mate works the turret. With a friend online, one of you flies and the other shoots.'}</p>
      <div class="rl-row"><button class="btn rl-go">${pid?'INVITE '+pname.toUpperCase():'TAKE OFF'}</button><button class="btn rl-hg">🔧 Hangar</button><button class="btn rl-x">Close</button></div>
      <p class="rl-help">${touch?'The stick steers (pilot) or aims (gunner). Pilot: BOOST sprints, ROLL dodges everything for a moment. Gunner: hold FIRE (the gun overheats), MISSILES fires a homing salvo. Drag the screen to look around. ⇄ SEAT swaps seats, solo too.':'Arrows/WASD steer or aim. Pilot: Shift boost, Q roll. Gunner: Space fires, E missiles. Drag to look around. R swaps seats.'}</p>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.dataset.role&&!b.disabled){cfg.role=b.dataset.role;openLobby.again()}
      else if(b.classList.contains('rl-hg')){closeLobby();openHangar(openLobby)}
      else if(b.classList.contains('rl-x'))closeLobby();
      else if(b.classList.contains('rl-go')){sfxInit();closeLobby();if(pid)invite(pid);else begin({seed:Math.random()*1e6|0,role:'pilot',host:true,partner:null})}});
  }
  openLobby.again=()=>{if(!sheet)return;sheet.remove();sheet=null;openLobby()};
  function closeLobby(){if(sheet){sheet.remove();sheet=null}}
  function note(s){say(s,2400)}

  // ---------------------------------------------------------------- lifecycle
  function begin(c){
    if(ST.mode!=='off'||!SC||typeof SKY==='undefined')return;
    buildHud();closeLobby();if(!W)W=SkyRaidWorld.build(scene);
    ST.host=c.host;ST.role=c.role;ST.partner=c.partner;ST.rid=c.rid||null;ST.paid=false;ST.err=0;ST.acc=0;pend=[];aim={yaw:0,pit:.12};look.yaw=look.pit=0;look.t=0;ST.swapAt=0;ST.slow=0;remote.b=remote.r=remote.m=0;
    const hasGunner=!!c.partner||c.role==='gunner';
    run=SC.newRun({seed:c.seed,cx:SKY.x,cz:SKY.z,base:SKY.base,hasGunner,up:UP});
    if(ST.host)SC.step(run,.0001,{});   // starts stage 1 so the first frame already has a fortress
    view={x:run.ship.x,y:run.ship.y,z:run.ship.z,h:run.ship.h,p:0,roll:0,spin:0};lastH=run.ship.h;
    ST.ret={x:S.x,y:S.y,z:S.z,rot:S.rot};camS.init=false;ST.lastSnap=ST.lastStep=performance.now();
    raceRes(true);document.body.classList.add('skyraid');hud.classList.add('on');ST.mode='race';BTN.boost=BTN.fire=BTN.roll=BTN.missile=BTN.l=BTN.r=BTN.u=BTN.d=false;
    if(me)me.visible=false;pin();
    say(ST.role==='gunner'?'GUNNER: shoot the generators, then the core':'PILOT: fly to the marked fortress',2600);
    if(typeof banner==='function')banner('SKY RAID','⚔ TAKE OFF');
  }
  function leave(notify){
    if(ST.mode==='off')return;if(notify&&ST.partner&&ST.rid)Net.emit('sky',{k:'end',rid:ST.rid});
    ST.mode='off';ST.partner=null;ST.rid=null;raceRes(false);closeLobby();if(hangar){hangar.remove();hangar=null}if(hud)hud.classList.remove('on');if(drag)drag.classList.remove('on');document.body.classList.remove('skyraid');
    if(W)W.hide();run=null;
    if(ST.ret){S.x=ST.ret.x;S.z=ST.ret.z;S.y=Math.max(ST.ret.y,(typeof H==='function'?H(ST.ret.x,ST.ret.z):0)+.2);S.vy=0;S.rot=ST.ret.rot||S.rot;S.flying=false;S.grounded=true}
    camera.fov=baseFov;camera.updateProjectionMatrix();BTN.boost=BTN.fire=false;
    try{if(SFX.ctx&&SFX.eng)SFX.eng.g.gain.setTargetAtTime(0,SFX.ctx.currentTime,.05)}catch(e){}
  }
  function pin(){const s=run.ship;S.x=s.x;S.y=s.y;S.z=s.z;S.vy=0;S.grounded=true;S.flying=false;S.rot=s.h;if(me){me.position.set(s.x,s.y,s.z);me.visible=false}}

  // ---------------------------------------------------------------- feedback helpers
  function hitMark(kind){const h=q('#skHm');if(!h)return;h.classList.remove('on');void h.offsetWidth;h.classList.add('on');h.style.borderColor=kind==='core'?'#ff5a3c':kind==='sam'?'#ff8a5a':'#ffd24a';clearTimeout(hitMark.h);hitMark.h=setTimeout(()=>h.classList.remove('on'),160);tone(kind==='core'?900:1250,.05,'triangle',.06)}
  function comboFx(e){if(e.n===5||e.n===10||e.n===15||e.n===20){say(e.n>=15?'☠ LEGENDARY x'+e.n:e.n>=10?'🔥 ACE x'+e.n:'⚡ x'+e.n+' STREAK',1500);tone(660+e.n*18,.25,'triangle',.12);tone(990+e.n*18,.3,'triangle',.1)}else tone(500+Math.min(e.n,12)*40,.07,'triangle',.07)}
  // ---------------------------------------------------------------- events: one place turns simulation events into feedback
  function playEv(e){
    if(W)W.fx(e,run,performance.now()/1000);
    const s=run&&run.ship,near=s&&e.x!==undefined&&Math.hypot(e.x-s.x,e.y-s.y,e.z-s.z)<260;
    switch(e.k){
      case 'tracer':if(e.src==='a')tone(640,.04,'square',.018,.6);else tone(ST.role==='gunner'?420:300,.07,'square',ST.role==='gunner'?.07:.035,.5);break;
      case 'imps':say('⚠ IMPS INBOUND',1100);tone(1300,.12,'square',.06);break;
      case 'eshot':if(near)tone(180,.1,'sawtooth',.04,.6);break;
      case 'boom':if(near)tone(e.s>=1?70:110,.35,'sawtooth',e.s>=1?.16:.09,.4);if(near)ST.shake=Math.max(ST.shake,Math.min(.8,e.s*.25));break;
      case 'hurt':ST.shake=Math.max(ST.shake,.5);ST.flash=1;tone(90,.25,'square',.16,.5);break;
      case 'boost':tone(260,.5,'sawtooth',.1,2.4);break;
      case 'roll':tone(700,.35,'sawtooth',.08,.4);ST.shake=Math.max(ST.shake,.2);break;
      case 'msl':tone(300,.5,'sawtooth',.1,2.5);tone(220,.4,'square',.06,3);break;
      case 'sam':say('⚠ MISSILE LAUNCH',1000);tone(1100,.15,'square',.08);break;
      case 'dmg':if(ST.role==='gunner')hitMark(e.kind);break;
      case 'combo':comboFx(e);break;
      case 'laser':say('⚠ LASER SWEEP: GO ABOVE OR BELOW IT',1700);tone(220,.9,'sawtooth',.1,3);break;
      case 'flak':if(ST.role==='pilot')tone(900,.08,'square',.05);break;
      case 'drop':say('REPAIR KIT DROPPED: FLY THROUGH IT',1500);tone(880,.15,'triangle',.1);break;
      case 'pick':say('+HULL',900);tone(700,.12,'triangle',.12);tone(1050,.2,'triangle',.1);break;
      case 'overheat':say('OVERHEAT!',1100);tone(160,.4,'square',.1,.5);break;
      case 'gen':say(e.left?'GENERATOR DOWN · '+e.left+' left':'SHIELD DOWN! HIT THE CORE',1600);tone(520,.2,'triangle',.12);tone(780,.3,'triangle',.1);break;
      case 'phase':say('⚠ THE CORE FIGHTS BACK',1800);tone(150,.6,'sawtooth',.14,.5);break;
      case 'stage':if(typeof banner==='function')banner(e.name.toUpperCase(),e.boss?'☠ BOSS FORTRESS':'🏰 FORTRESS '+(e.stage+1));break;
      case 'cleared':ST.slow=1.3;say(e.boss?'':'FORTRESS DESTROYED',1800);tone(660,.2,'triangle',.14);tone(990,.4,'triangle',.12);break;
      case 'win':say('RAID COMPLETE!',2400);ST.endT=performance.now();break;
      case 'fail':say('SHIP LOST',2400);ST.endT=performance.now();break;
    }
  }

  // ---------------------------------------------------------------- per frame
  // the analog stick (or arrow keys / WASD): ix>0 = right, iy>0 = down. Pilot: steer + climb/dive. Gunner: swing the turret.
  function padAxes(){
    const L=keys.ArrowLeft||keys.KeyA,Rr=keys.ArrowRight||keys.KeyD,U=keys.ArrowUp||keys.KeyW,D=keys.ArrowDown||keys.KeyS,kx=(Rr?1:0)-(L?1:0),ky=(D?1:0)-(U?1:0);
    return {ix:kx||IN.ix,iy:ky||IN.iy};
  }
  function localInput(){
    const inp={},g=ST.role==='gunner',a=padAxes();
    if(!g){inp.ix=a.ix;inp.iy=a.iy;inp.boost=BTN.boost||keys.ShiftLeft===true;inp.roll=BTN.roll;BTN.boost=false;BTN.roll=false}
    else{inp.aim={yaw:aim.yaw,pit:aim.pit};inp.fire=BTN.fire||keys.Space===true;inp.missile=BTN.missile;BTN.missile=false}
    return inp;
  }
  function hostStep(dt){
    ST.acc+=dt;if(ST.acc<DT)return;let n=0;const mine=localInput(),rem=remote,fresh=performance.now()-rem.t<800,solo=!ST.partner;
    while(ST.acc>=DT&&n<4){
      let inp;
      if(ST.role==='pilot')inp={ix:mine.ix,iy:mine.iy,boost:mine.boost,roll:mine.roll,aim:fresh&&!solo?{yaw:rem.yw,pit:rem.pt}:null,fire:fresh&&!solo?!!rem.f:false,missile:fresh&&!solo&&!!rem.m};
      else inp={ix:fresh&&!solo?rem.ix:0,iy:fresh&&!solo?rem.iy:0,boost:fresh&&!solo&&!!rem.b,roll:fresh&&!solo&&!!rem.r,auto:solo,aim:mine.aim,fire:mine.fire,missile:mine.missile};
      mine.boost=mine.roll=mine.missile=false;rem.b=rem.r=rem.m=0;     // one-shot presses are used by the first step
      const evs=SC.step(run,DT,inp);for(const e of evs){playEv(e);if(ST.partner)pend.push(e)}ST.acc-=DT;n++;ST.lastStep=performance.now();
      if(run.state==='win'||run.state==='fail')break}
    if(n===4)ST.acc=0;
  }
  // ---- seats: SWAP SEAT trades pilot and gunner. Solo, the empty seat is an AI (crew-mate gunner / autopilot). Co-op: either player asks, the host flips both.
  function swapSeat(){
    if(ST.mode!=='race'||!run||performance.now()-(ST.swapAt||0)<2500)return;ST.swapAt=performance.now();
    if(!ST.partner)return doSwap();
    if(ST.host)doSwap();else Net.emit('sky',{k:'swap',rid:ST.rid});
  }
  function doSwap(){
    ST.role=ST.role==='pilot'?'gunner':'pilot';aim={yaw:0,pit:.12};look.yaw=look.pit=0;BTN.fire=BTN.boost=BTN.roll=BTN.missile=false;
    if(!ST.partner){run.hasGunner=ST.role==='gunner';run.heat=0;run.lock=0}
    else if(ST.host)Net.emit('sky',{k:'roles',rid:ST.rid,hostRole:ST.role});
    ST.swapAt=performance.now();tone(500,.12,'triangle',.1);say(ST.role==='gunner'?'🔫 GUNNER: you man the turret'+(ST.partner?'':' (autopilot flies)'):'🛩 PILOT: you have the stick',1800);
  }
  function netTick(now){
    if(!ST.partner||!ST.rid)return;
    if(ST.host){if(now-ST.lastNet>=100){ST.lastNet=now;Net.emit('sky',{k:'sn',rid:ST.rid,sn:SC.snapshot(run),ev:pend.splice(0)})}}
    else if(now-ST.lastNet>=66){ST.lastNet=now;const m=localInput();Net.emit('sky',{k:'inp',rid:ST.rid,ix:+(m.ix||0).toFixed(2),iy:+(m.iy||0).toFixed(2),b:m.boost?1:0,r:m.roll?1:0,m:m.missile?1:0,yw:m.aim?+m.aim.yaw.toFixed(3):0,pt:m.aim?+m.aim.pit.toFixed(3):0,f:m.fire?1:0})}
  }
  function updateView(dt){
    const s=run.ship,age=Math.min(.25,(performance.now()-(ST.host?ST.lastStep:ST.lastSnap))/1000),c=Math.cos(s.p),k=1-Math.exp(-dt*(ST.host?22:14));
    const tx=s.x+Math.sin(s.h)*c*s.v*age,ty=s.y+Math.sin(s.p)*s.v*age,tz=s.z+Math.cos(s.h)*c*s.v*age;
    view.x+=(tx-view.x)*k;view.y+=(ty-view.y)*k;view.z+=(tz-view.z)*k;view.h+=wrap(s.h-view.h)*k;view.p+=(s.p-view.p)*k;view.roll+=((s.roll||0)-view.roll)*k;
    if(Math.hypot(view.x-s.x,view.z-s.z)>120){view.x=s.x;view.y=s.y;view.z=s.z}
  }
  function cameraRig(dt){
    const v=view,boost=run.ship.boost>0;ST.shake=Math.max(0,ST.shake-dt*2);const sh=ST.shake*.8+(boost?.15:0);
    if(!camS.init){camS.yaw=v.h;camS.x=v.x;camS.y=v.y+12;camS.z=v.z;camS.init=true}
    let fov=baseFov+(boost?9:0)+Math.min(8,Math.max(0,run.ship.v-30)*.3);
    if(ST.role==='gunner'){
      const yw=v.h+aim.yaw,cp=Math.cos(aim.pit),px=v.x-Math.sin(v.h)*1.5,py=v.y+8.6,pz=v.z-Math.cos(v.h)*1.5;
      camera.position.set(px+(Math.random()-.5)*sh,py+(Math.random()-.5)*sh,pz+(Math.random()-.5)*sh);
      camera.lookAt(px+Math.sin(yw)*cp*60,py+Math.sin(aim.pit)*60,pz+Math.cos(yw)*cp*60);fov-=6;
    }else{
      // free-look: drag orbits the chase camera around the ship (look.yaw = which way you look, look.pit = look up/down); after ~2.5 s it eases back behind
      if(performance.now()-look.t>2500){const k=1-Math.exp(-dt*2.4);look.yaw+=wrap(0-look.yaw)*k;look.pit-=look.pit*k}
      camS.yaw+=wrap(v.h-camS.yaw)*(1-Math.exp(-dt*3));const dy=camS.yaw+look.yaw,fx=Math.sin(dy),fz=Math.cos(dy),dist=40+(boost?5:0),k=1-Math.exp(-dt*9),cp=Math.cos(look.pit);
      camS.x+=(v.x-fx*dist*cp-camS.x)*k;camS.y+=(v.y+13-v.p*14-look.pit*dist*.95-camS.y)*k;camS.z+=(v.z-fz*dist*cp-camS.z)*k;
      camera.position.set(camS.x+(Math.random()-.5)*sh,camS.y+(Math.random()-.5)*sh,camS.z+(Math.random()-.5)*sh);
      const w=clamp(Math.hypot(look.yaw,look.pit)*1.6,0,1);   // looking around: aim at the ship instead of far ahead of it
      camera.lookAt(v.x+(Math.sin(v.h)*28)*(1-w),v.y+(3+Math.sin(v.p)*18)*(1-w)+2*w,v.z+(Math.cos(v.h)*28)*(1-w));
    }
    camS.fov+=(fov-camS.fov)*(1-Math.exp(-dt*6));camera.fov=camS.fov;camera.updateProjectionMatrix();
    const fl=document.getElementById('skFlash');if(fl){fl.style.opacity=ST.flash>0?String(Math.min(.9,ST.flash)):'0'}ST.flash=Math.max(0,ST.flash-dt*2.2);
  }
  function finish(){
    if(ST.paid)return;ST.paid=true;const c=SC.payout(run);
    if(c>0&&typeof Outlaw!=='undefined'&&Outlaw.earn){try{Outlaw.earn(c)}catch(e){}}
    closeLobby();sheet=el('div','sheet rl-sheet rl-res');const win=run.state==='win',sc=run.score;
    sheet.innerHTML=`<h2>${win?'🏆 Raid complete!':'💥 Ship lost'}</h2><p class="rl-sub">${win?'All four fortresses are wreckage.':'You cleared '+Math.max(0,run.stage)+' of 4 fortresses.'}</p>
      <div class="rl-row"><b>+${c} 🪙</b></div><p class="rl-help">Turrets ${sc.turrets} · Drones ${sc.drones} · Hits ${sc.hits} · Damage taken ${Math.round(sc.taken)} · Time ${Math.round(run.t)} s</p>
      <div class="rl-row"><button class="btn rl-again">Fly again</button><button class="btn rl-hg">🔧 Hangar</button><button class="btn rl-x">Back to the island</button></div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.classList.contains('rl-hg')){sheet.remove();sheet=null;openHangar(()=>{leave(true);openLobby()})}
      else if(b.classList.contains('rl-x')){leave(true)}
      else if(b.classList.contains('rl-again')){const wasHost=ST.host,p=ST.partner;leave(true);if(wasHost){if(p)invite(p);else begin({seed:Math.random()*1e6|0,role:'pilot',host:true,partner:null})}else openLobby()}});
  }
  function frame(dt){
    try{
      if(typeof entered==='undefined'||!entered)return;ensureFab();
      if(ST.mode==='off'||!run)return;
      dt=Math.min(dt,.05);if(ST.slow>0){ST.slow-=dt;dt*=.35}   // the core going down plays in slow motion
      if(ST.host)hostStep(dt);
      if(ST.role==='gunner'){const a=padAxes();aim.yaw=wrap(aim.yaw-a.ix*dt*1.9);aim.pit=clamp(aim.pit-a.iy*dt*1.3,-.9,1.45)}
      pin();updateView(dt);
      if(ST.role==='gunner'){aim.yaw=wrap(aim.yaw-wrap(view.h-lastH))}lastH=view.h;     // the turret keeps pointing at the same spot in the sky while the ship turns
      const sr=run.ship;view.spin=sr.rollT>0?(sr.rollDir||1)*Math.PI*2*(1-sr.rollT/SC.SHIP.rollT):0;
      W.sync(run,view,ST.role==='gunner'?aim:(ST.host?{yaw:0,pit:.1}:null),performance.now()/1000,dt);
      cameraRig(dt);netTick(performance.now());
      if(performance.now()-lastHud>90){lastHud=performance.now();hudUpdate()}
      sfxUpdate(dt);
      if((run.state==='win'||run.state==='fail')&&ST.mode==='race'&&performance.now()-ST.endT>2600){ST.mode='finish';hud.classList.remove('on');drag.classList.remove('on');finish()}
    }catch(e){if(!ST.err++){console.error('SkyRaid error',e);try{say('Sky Raid error: '+e.message,3000)}catch(_){}}if(ST.err>30){try{leave(false)}catch(_){}}}
  }

  // ---------------------------------------------------------------- multiplayer
  function invite(pid){
    ST.rid=Math.random().toString(36).slice(2,8);ST.pendingCfg={role:cfg.role,pid};
    Net.emit('sky',{k:'inv',rid:ST.rid,role:cfg.role,name:typeof myName==='string'?myName:'Friend'});
    note('Invite sent. Waiting for your friend…');clearTimeout(ST.invT);ST.invT=setTimeout(()=>{if(ST.pendingCfg&&ST.mode==='off'){ST.pendingCfg=null;note('No answer. Try again or fly solo.')}},25000);
  }
  function showInvite(d,from){
    buildHud();inv&&inv.remove();const seat=d.role==='pilot'?'gunner':'pilot';
    inv=el('div','rl-inv',`<b>🛩 ${d.name||'A friend'} invites you to a Sky Raid as ${seat}</b><div><button class="btn rl-y">Join</button><button class="btn rl-n">No</button></div>`);document.body.appendChild(inv);
    const done=()=>{inv&&inv.remove();inv=null};inv.querySelector('.rl-n').onclick=done;
    inv.querySelector('.rl-y').onclick=()=>{done();sfxInit();ST.joinCfg={rid:d.rid,from,role:seat};Net.emit('sky',{k:'acc',rid:d.rid});note('Joined! Waiting for take-off…')};
    setTimeout(done,30000);
  }
  function netInit(){
    if(netInit.done||typeof Net==='undefined')return;netInit.done=true;
    Net.on('sky',(d,from)=>{
      if(!d)return;
      switch(d.k){
        case 'inv':if(ST.mode==='off')showInvite(d,from);break;
        case 'acc':if(d.rid===ST.rid&&ST.pendingCfg&&ST.mode==='off'){const c=ST.pendingCfg;ST.pendingCfg=null;clearTimeout(ST.invT);const seed=Math.random()*1e6|0;
          Net.emit('sky',{k:'go',rid:ST.rid,seed,hostRole:c.role});begin({seed,role:c.role,host:true,partner:from,rid:ST.rid})}break;
        case 'go':if(ST.joinCfg&&d.rid===ST.joinCfg.rid&&ST.mode==='off'){const j=ST.joinCfg;ST.joinCfg=null;begin({seed:d.seed,role:j.role,host:false,partner:from,rid:d.rid})}break;
        case 'inp':if(ST.mode!=='off'&&ST.host&&d.rid===ST.rid){remote.ix=+d.ix||0;remote.iy=+d.iy||0;remote.b=remote.b||d.b|0;remote.r=remote.r||d.r|0;remote.m=remote.m||d.m|0;remote.yw=+d.yw||0;remote.pt=+d.pt||0;remote.f=d.f|0;remote.t=performance.now()}break;
        case 'sn':if(ST.mode!=='off'&&!ST.host&&d.rid===ST.rid&&run){SC.apply(run,d.sn);ST.lastSnap=performance.now();for(const e of d.ev||[])playEv(e)}break;
        case 'swap':if(ST.mode==='race'&&ST.host&&d.rid===ST.rid&&performance.now()-(ST.swapAt||0)>1200)doSwap();break;
        case 'roles':if(ST.mode==='race'&&!ST.host&&d.rid===ST.rid){ST.role=d.hostRole==='pilot'?'gunner':'pilot';aim={yaw:0,pit:.12};look.yaw=look.pit=0;BTN.fire=BTN.boost=BTN.roll=BTN.missile=false;ST.swapAt=performance.now();tone(500,.12,'triangle',.1);say(ST.role==='gunner'?'🔫 GUNNER: you man the turret':'🛩 PILOT: you have the stick',1800)}break;
        case 'end':if(ST.mode!=='off'&&d.rid===ST.rid){note('Your friend left the raid.');leave(false)}break;
      }
    });
  }

  function build(){netInit();if(typeof Systems!=='undefined'&&Systems.add)Systems.add('skyraid-fab',()=>{if(typeof entered!=='undefined'&&entered)ensureFab()})}
  return {build,frame,locked,setInput:(ix,iy)=>{IN.ix=ix;IN.iy=iy},open:()=>{sfxInit();openLobby()},leave,
    state:()=>({mode:ST.mode,role:ST.role,host:ST.host,run}),_t:()=>({UP,openHangar,begin,hostStep,swapSeat,doSwap,ST,aim,look,BTN,remote,view:()=>view,world:()=>W})};
})();
