// THE DEEP controller (browser only): the 🤿 lobby + sub shop, the dive itself (stick = steer, buttons = up / down / harpoon / boost / sonar / lamp), the chase camera,
// HUD, sound and the result sheet. Rules are in DeepCore.js (pure, tested), drawing is in DeepWorld.js. Same shape as the Sky Raid: `Deep.locked()` takes over the stick in
// tick(), `Deep.frame(dt)` runs once per frame right after CameraRig.update and owns the camera while a dive is on, `Deep.fog()` lets the Environment tint the water by depth.
// Co-op needs no handshake: the trench is DETERMINISTIC from today's date, so friends who dive on the same day see the same trench; their subs show up through normal
// presence (you are pinned to the sub's world position, hidden), each diver keeps their own hull / loot / kills.
// Globals used: THREE, scene, camera, renderer, S, me, others, keys, banner, entered, Outlaw (coins), Perf, sun, DeepCore, DeepWorld.
const Deep=(()=>{
  const C=typeof DeepCore!=='undefined'?DeepCore:null,AT={x:0,z:430,y:-300};   // where the trench hangs in the world: 300 m under the sea south of Shell Beach
  const ST={mode:'off',run:null,ret:null,paid:false,shake:0,fade:null,t0:0,seed:1,endT:0,warnT:0,msgT:0,lastHud:0,hid:[]};
  const IN={ix:0,iy:0},BTN={up:false,down:false,boost:false,fire:false,ping:false},touch=typeof matchMedia!=='undefined'&&matchMedia('(pointer:coarse)').matches;
  let W=null,hud=null,fab=null,sheet=null,fadeEl=null,lamp=true,resPrev=null,pend=[],camS={yaw:0,init:false,x:0,y:0,z:0},baseFov=60,fogC={r:.04,g:.45,b:.55,near:1,far:100};
  const clamp=(v,a,b)=>v<a?a:v>b?b:v,wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
  const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e};
  const q=s=>hud.querySelector(s);
  const todaySeed=()=>1+Math.floor(Date.now()/86400000)%9973;
  const coinsNow=()=>typeof Outlaw!=='undefined'&&Outlaw.coins?Outlaw.coins():0;
  // ---------------------------------------------------------------- saved progress (this phone)
  const UP={o2:0,hull:0,bat:0,rating:0,harp:0},BEST={coins:0,depth:0,dives:0,krakens:0,pearls:0};
  try{Object.assign(UP,JSON.parse(localStorage.getItem('deepup')||'{}'));Object.assign(BEST,JSON.parse(localStorage.getItem('deepbest')||'{}'))}catch(e){}
  const saveUp=()=>{try{localStorage.setItem('deepup',JSON.stringify(UP))}catch(e){}},saveBest=()=>{try{localStorage.setItem('deepbest',JSON.stringify(BEST))}catch(e){}};
  // ---------------------------------------------------------------- sound (tiny WebAudio synth, created on the first tap)
  const SFX={ctx:null,drone:null};
  function sfxInit(){if(SFX.ctx)return;try{const c=SFX.ctx=new (window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();o.type='sawtooth';o.frequency.value=46;f.type='lowpass';f.frequency.value=170;g.gain.value=0;o.connect(f);f.connect(g);g.connect(c.destination);o.start();SFX.drone={o,g}}catch(e){}}
  function tone(f,d,type,vol,slide){const c=SFX.ctx;if(!c)return;try{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,slide),t+d);g.gain.setValueAtTime(vol||.1,t);g.gain.exponentialRampToValueAtTime(.0008,t+d);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+d+.02)}catch(e){}}
  const SND={fire:()=>tone(520,.12,'square',.05,180),ping:()=>{tone(880,.9,'sine',.12,860);setTimeout(()=>tone(880,.7,'sine',.05,860),260)},loot:()=>{tone(660,.1,'triangle',.1);setTimeout(()=>tone(990,.18,'triangle',.1),90)},hurt:()=>tone(110,.28,'sawtooth',.14,50),
    kill:()=>{tone(300,.2,'triangle',.1,600)},tele:()=>tone(90,.9,'sawtooth',.1,60),roar:()=>tone(70,1.4,'sawtooth',.16,40),alarm:()=>{tone(740,.12,'square',.06);setTimeout(()=>tone(740,.12,'square',.06),200)},wake:()=>tone(120,1.2,'sawtooth',.12,55)};
  function sfxUpdate(){const c=SFX.ctx;if(!c||!SFX.drone)return;SFX.drone.g.gain.setTargetAtTime(ST.mode==='dive'?.045+(ST.run?Math.min(.05,Math.abs(ST.run.v)*.004):0):0,c.currentTime,.2);SFX.drone.o.frequency.setTargetAtTime(44+(ST.run?Math.abs(ST.run.v)*2.2:0),c.currentTime,.2)}
  // ---------------------------------------------------------------- HUD
  function buildHud(){
    if(hud)return;
    try{const css=document.createElement('style');css.textContent=`
body.deepdive .dk,body.deepdive .dk-menu,body.deepdive #jump,body.deepdive #boost,body.deepdive #emobtn,body.deepdive #panbtn,body.deepdive #smack,body.deepdive #use,body.deepdive #info{display:none!important}
body.deepdive .dp-fab{display:none!important}
.dp-hud{position:fixed;inset:0;pointer-events:none;z-index:10;display:none;font:700 13px system-ui,sans-serif;color:#dff8ff;text-shadow:0 1px 3px #000}.dp-hud.on{display:block}
.dp-top{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 8px);transform:translateX(-50%);text-align:center;width:min(92vw,520px)}
.dp-depth{font-size:26px;letter-spacing:1px}.dp-depth small{font-size:12px;opacity:.8}.dp-obj{background:rgba(2,16,24,.62);border-radius:12px;padding:5px 12px;font-size:12.5px;margin-top:4px}
.dp-bars{position:absolute;left:calc(env(safe-area-inset-left,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 12px);width:150px}
.dp-bar{margin-bottom:6px;font-size:11px}.dp-bar div{height:9px;border-radius:6px;background:rgba(0,0,0,.55);overflow:hidden;margin-top:2px}.dp-bar i{display:block;height:100%;width:100%;transition:width .12s}
.dp-hull i{background:#5fe38a}.dp-air i{background:#6ad4ff}.dp-bat i{background:#ffd24a}.dp-bar.low i{background:#ff4a4a}
.dp-boss{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 74px);transform:translateX(-50%);width:min(70vw,360px);text-align:center;display:none}.dp-boss.on{display:block}
.dp-boss div{height:11px;border-radius:7px;background:rgba(0,0,0,.6);overflow:hidden;margin-top:3px;border:1px solid rgba(255,120,120,.5)}.dp-boss i{display:block;height:100%;background:linear-gradient(90deg,#ff3a5a,#ff9a4a);width:100%;transition:width .15s}
.dp-ping{position:absolute;right:calc(env(safe-area-inset-right,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 64px);font-size:11.5px;text-align:right;line-height:1.5;background:rgba(2,16,24,.5);border-radius:10px;padding:5px 9px;display:none}.dp-ping.on{display:block}
.dp-warn{position:absolute;left:50%;top:30%;transform:translateX(-50%);font-size:22px;color:#ff6a4a;opacity:0;text-align:center}.dp-warn.on{opacity:1}
.dp-msg{position:absolute;left:50%;top:22%;transform:translateX(-50%);font-size:24px;opacity:0;transition:opacity .3s;text-align:center;width:90vw}.dp-msg.on{opacity:1}
.dp-cross{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border:2px solid rgba(190,240,255,.75);border-radius:50%;opacity:.8}.dp-cross::after{content:'';position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;background:#bff;border-radius:50%}
.dp-btn{position:absolute;pointer-events:auto;border:0;border-radius:50%;color:#fff;font:800 12px system-ui,sans-serif;background:rgba(10,40,60,.72);border:2px solid rgba(160,230,255,.45);touch-action:none;display:flex;align-items:center;justify-content:center;flex-direction:column;line-height:1.1}
.dp-btn.on{background:rgba(40,160,200,.85)}.dp-btn.cd{opacity:.5}
.dp-fire{right:calc(env(safe-area-inset-right,0px) + 16px);bottom:calc(env(safe-area-inset-bottom,0px) + 16px);width:92px;height:92px;font-size:26px;background:rgba(190,60,60,.78)}
.dp-boost{right:calc(env(safe-area-inset-right,0px) + 116px);bottom:calc(env(safe-area-inset-bottom,0px) + 14px);width:62px;height:62px;font-size:20px}
.dp-up{right:calc(env(safe-area-inset-right,0px) + 22px);bottom:calc(env(safe-area-inset-bottom,0px) + 122px);width:58px;height:58px;font-size:22px}
.dp-down{right:calc(env(safe-area-inset-right,0px) + 22px);bottom:calc(env(safe-area-inset-bottom,0px) + 186px);width:58px;height:58px;font-size:22px}
.dp-ping-b{right:calc(env(safe-area-inset-right,0px) + 92px);bottom:calc(env(safe-area-inset-bottom,0px) + 90px);width:50px;height:50px;font-size:18px}
.dp-lamp{right:calc(env(safe-area-inset-right,0px) + 92px);bottom:calc(env(safe-area-inset-bottom,0px) + 148px);width:50px;height:50px;font-size:18px}
.dp-exit{right:calc(env(safe-area-inset-right,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 12px);width:36px;height:36px;font-size:15px}
.dp-flash{position:fixed;inset:0;pointer-events:none;z-index:9;background:radial-gradient(circle,rgba(255,40,30,0) 40%,rgba(255,40,30,.55));opacity:0;transition:opacity .25s}
.dp-fade{position:fixed;inset:0;pointer-events:none;z-index:30;background:#00080e;opacity:0;transition:opacity .45s}
.dp-ink{position:fixed;inset:0;pointer-events:none;z-index:8;background:#02030a;opacity:0;transition:opacity .35s}
.dp-fab{position:fixed;right:var(--map-r,12px);top:calc(var(--map-t,58px) + 156px);width:var(--T,44px);height:var(--T,44px);padding:0;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:9}
@media (max-height:420px){.dp-fire{width:78px;height:78px}.dp-up,.dp-down{width:50px;height:50px}.dp-up{bottom:calc(env(safe-area-inset-bottom,0px) + 104px)}.dp-down{bottom:calc(env(safe-area-inset-bottom,0px) + 160px)}.dp-lamp{bottom:calc(env(safe-area-inset-bottom,0px) + 128px)}}`;
      document.head.appendChild(css)}catch(e){}
    hud=el('div','dp-hud',`<div class="dp-top"><div class="dp-depth" id="dpDepth"></div><div class="dp-obj" id="dpObj"></div></div>
      <div class="dp-bars"><div class="dp-bar dp-hull" id="dpHull">HULL<div><i></i></div></div><div class="dp-bar dp-air" id="dpAir">AIR<div><i></i></div></div><div class="dp-bar dp-bat" id="dpBat">BATTERY<div><i></i></div></div></div>
      <div class="dp-boss" id="dpBoss">🐙 THE KRAKEN<div><i></i></div></div><div class="dp-ping" id="dpPing"></div><div class="dp-warn" id="dpWarn"></div><div class="dp-msg" id="dpMsg"></div><div class="dp-cross"></div>
      <button class="dp-btn dp-fire" id="dpFire">🔱<small>HARPOON</small></button><button class="dp-btn dp-boost" id="dpBoost">⚡<small>BOOST</small></button>
      <button class="dp-btn dp-up" id="dpUp">▲</button><button class="dp-btn dp-down" id="dpDown">▼</button><button class="dp-btn dp-ping-b" id="dpPingB">📡</button><button class="dp-btn dp-lamp on" id="dpLamp">💡</button><button class="dp-btn dp-exit" id="dpExit">✕</button>`);
    document.body.appendChild(hud);
    const fl=el('div','dp-flash');fl.id='dpFlash';document.body.appendChild(fl);const ink=el('div','dp-ink');ink.id='dpInk';document.body.appendChild(ink);fadeEl=el('div','dp-fade');document.body.appendChild(fadeEl);
    const hold=(id,k)=>{const b=q('#'+id);b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();sfxInit();BTN[k]=true;b.classList.add('on')});for(const t of ['pointerup','pointercancel','pointerleave'])b.addEventListener(t,()=>{BTN[k]=false;if(k!=='ping')b.classList.remove('on')})};
    hold('dpFire','fire');hold('dpBoost','boost');hold('dpUp','up');hold('dpDown','down');
    q('#dpPingB').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();BTN.ping=true});
    q('#dpLamp').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();toggleLamp()});
    q('#dpExit').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(ST.mode==='dive'&&ST.run&&ST.run.y>-30)C.surface(ST.run);else abort()});
    try{window.addEventListener('keydown',e=>{if(ST.mode!=='dive')return;const c=e.code;if(c==='Space'||c==='KeyR'){BTN.up=true;e.preventDefault()}else if(c==='KeyC'||c==='ControlLeft')BTN.down=true;else if(c==='KeyF')BTN.fire=true;else if(c==='ShiftLeft'||c==='KeyV')BTN.boost=true;else if(c==='KeyG')BTN.ping=true;else if(c==='KeyL')toggleLamp()});
      window.addEventListener('keyup',e=>{const c=e.code;if(c==='Space'||c==='KeyR')BTN.up=false;else if(c==='KeyC'||c==='ControlLeft')BTN.down=false;else if(c==='KeyF')BTN.fire=false;else if(c==='ShiftLeft'||c==='KeyV')BTN.boost=false})}catch(e){}
  }
  function toggleLamp(){lamp=!lamp;if(hud)q('#dpLamp').classList.toggle('on',lamp)}
  const say=(s,ms)=>{if(!hud)return;const m=q('#dpMsg');m.textContent=s;m.classList.add('on');clearTimeout(say.h);say.h=setTimeout(()=>m.classList.remove('on'),ms||1800)};
  function setBar(id,v,low){const b=q('#'+id);b.firstChild.nextSibling.firstChild.style.width=clamp(v,0,1)*100+'%';b.classList.toggle('low',v<low)}
  function drawHud(run){
    const now=performance.now();if(now-ST.lastHud<80)return;ST.lastHud=now;
    q('#dpDepth').innerHTML=Math.max(0,Math.round(C.depthOf(run.y)))+'<small> m</small>';q('#dpObj').textContent=C.objective(run)+'  ·  ◆ '+Math.round(run.value);
    setBar('dpHull',run.hull/run.hullMax,.3);setBar('dpAir',run.o2/run.o2max,.25);setBar('dpBat',run.bat/run.batMax,.2);
    const k=run.kraken,boss=q('#dpBoss');boss.classList.toggle('on',!!k.seen&&!k.dead);if(k.seen&&!k.dead)boss.lastChild.firstChild.style.width=clamp(k.hp/C.KR.hp,0,1)*100+'%';
    const pg=q('#dpPing');if(run.pingT>0&&run.pings.length){pg.classList.add('on');pg.innerHTML=run.pings.map(p=>{const a=wrapDeg(p.b);return `${arrow(a)} ${p.k==='chest'?'📦':p.k==='relic'?'🏺':p.k==='pearl'?'⚪':p.k==='crystal'?'💎':'🪙'} ${Math.round(p.d)} m ${p.dy>8?'▲':p.dy<-8?'▼':''}`}).join('<br>')}else pg.classList.remove('on');
    const w=q('#dpWarn');let msg='';if(run.press>0)msg='⚠ CRUSH DEPTH — go UP';else if(run.heat)msg='🔥 VENT HEAT — move away';else if(run.o2<run.o2max*.2)msg='⚠ LOW AIR — surface or find an air pocket';else if(run.hull<run.hullMax*.25)msg='⚠ HULL CRITICAL';
    w.textContent=msg;w.classList.toggle('on',!!msg);
    document.getElementById('dpInk').style.opacity=run.ink>0?Math.min(.88,run.ink*.7):0;
  }
  const arrow=a=>['⬆','↗','➡','↘','⬇','↙','⬅','↖'][((Math.round(a/45)%8)+8)%8],wrapDeg=r=>r*180/Math.PI;
  // ---------------------------------------------------------------- lobby + shop
  let fabMade=false;
  function ensureFab(){
    if(fabMade||!document.body)return;fabMade=true;buildHud();
    fab=el('button','dk dp-fab','🤿');fab.title='The Deep';fab.setAttribute('aria-label','The Deep');
    fab.addEventListener('click',()=>{sfxInit();if(ST.mode==='off')openLobby()});document.body.appendChild(fab);
  }
  const busyElsewhere=()=>(typeof Ship!=='undefined'&&Ship.locked&&Ship.locked())||(typeof Rally!=='undefined'&&Rally.locked&&Rally.locked())||(typeof SkyRaid!=='undefined'&&SkyRaid.locked&&SkyRaid.locked());
  function closeSheet(){if(sheet){sheet.remove();sheet=null}}
  const partnerDiving=()=>{try{for(const o of others.values())if(o.group&&o.group.position.y<AT.y+20&&o.group.position.y>AT.y-520)return true}catch(e){}return false};
  function openLobby(){
    if(ST.mode!=='off'||busyElsewhere())return;closeSheet();sheet=el('div','sheet rl-sheet');
    const seed=todaySeed(),lay=C.layout(seed);
    sheet.innerHTML=`<h2>🤿 The Deep</h2>
      <p class="rl-sub">Take the sub down into today's trench. Loot the wrecks and the sunken temple, watch your air, and if you dare, kill the Kraken for the Abyssal Pearl. Surface alive and you keep it all; black out and you keep 40%.</p>
      <div class="rl-row"><b>${coinsNow()} 🪙</b><span class="rl-help" style="margin:0 8px">Trench #${seed} · crush depth ${Math.round(C.depthOf(-(C.SUB.rating+UP.rating*C.SUB.ratingStep)))} m</span></div>
      <p class="rl-help">Best: ${BEST.coins} 🪙 · ${Math.round(BEST.depth)} m deep · ${BEST.dives} dives · ${BEST.krakens} Krakens${partnerDiving()?' · <b>your friend is already down there</b>':' · A friend who dives today sees the same trench.'}</p>
      <div class="rl-row"><button class="btn rl-go">DIVE</button><button class="btn rl-hg">🔧 Sub shop</button><button class="btn rl-x">Close</button></div>
      <p class="rl-help">${touch?'Stick: steer and thrust. ▲▼ rise and sink, 🔱 harpoon, ⚡ boost, 📡 sonar finds loot, 💡 lamp (anglerfish see it).':'WASD steer · Space up · C down · F harpoon · Shift boost · G sonar · L lamp.'} Anglerfish below 110 m, jellyfish sting and stun, vents burn, and the Kraken hunts you in the pit.</p>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;sfxInit();
      if(b.classList.contains('rl-x'))closeSheet();else if(b.classList.contains('rl-hg'))openShop(()=>openLobby());else if(b.classList.contains('rl-go')){closeSheet();begin()}})}
  function openShop(back){
    closeSheet();sheet=el('div','sheet rl-sheet');
    const rows=C.UPG.map(u=>{const L=UP[u.k]|0,cost=C.upCost(u.k,L),pips='●'.repeat(L)+'○'.repeat(C.MAXL-L);
      return `<div class="rl-row" style="justify-content:space-between;gap:8px"><div style="text-align:left"><b>${u.n}</b><br><small>${u.d} · ${pips}</small></div>${L>=C.MAXL?'<b>MAX</b>':`<button class="btn gold${coinsNow()>=cost?'':' off'}" data-u="${u.k}">${cost} 🪙</button>`}</div>`}).join('');
    sheet.innerHTML=`<h2>🔧 Sub shop</h2><p class="rl-sub">Your coins: <b>${coinsNow()} 🪙</b>. Upgrades are permanent. The Kraken lives below 330 m: you need depth rating 2+ to fight it for long.</p>${rows}<div class="rl-row"><button class="btn rl-hx">Back</button></div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.classList.contains('rl-hx')){closeSheet();back&&back();return}
      const k=b.dataset.u;if(!k)return;const L=UP[k]|0,cost=C.upCost(k,L);if(L>=C.MAXL)return;
      if(typeof Outlaw!=='undefined'&&Outlaw.spend&&Outlaw.spend(cost)){UP[k]=L+1;saveUp();tone(700,.15,'triangle',.1);tone(1000,.2,'triangle',.1);openShop(back)}else{tone(150,.2,'square',.08);say('Not enough coins',1500)}})}
  // ---------------------------------------------------------------- lifecycle
  function raceRes(on){
    try{if(on&&!resPrev){resPrev={sun:typeof sun!=='undefined'&&sun?sun.castShadow:null,far:camera.far,fov:camera.fov};if(resPrev.sun)sun.castShadow=false;camera.far=700;camera.updateProjectionMatrix()}
      else if(!on&&resPrev){camera.far=resPrev.far;camera.fov=resPrev.fov;camera.updateProjectionMatrix();if(resPrev.sun&&typeof sun!=='undefined')sun.castShadow=true;resPrev=null}}catch(e){}}
  function fadeTo(a,cb,ms){if(!fadeEl){cb&&cb();return}fadeEl.style.opacity=a;clearTimeout(fadeTo.h);fadeTo.h=setTimeout(()=>cb&&cb(),ms||480)}
  function begin(){
    if(ST.mode!=='off'||!C||typeof DeepWorld==='undefined'||busyElsewhere())return;buildHud();closeSheet();
    ST.mode='descend';ST.paid=false;ST.seed=todaySeed();pend=[];lamp=true;q('#dpLamp').classList.add('on');
    ST.ret={x:S.x,y:S.y,z:S.z,rot:S.rot};
    if(typeof banner==='function')banner('The sub is sinking…','🤿 DIVE');
    fadeTo(1,()=>{
      if(!W){W=DeepWorld.build(scene)}
      W.place(AT.x,AT.y,AT.z);ST.run=C.newRun({seed:ST.seed,up:UP});W.setup(ST.run);W.show();
      raceRes(true);document.body.classList.add('deepdive');hud.classList.add('on');ST.mode='dive';ST.t0=performance.now();camS.init=false;ST.shake=0;
      BTN.up=BTN.down=BTN.fire=BTN.boost=BTN.ping=false;baseFov=60;if(me)me.visible=false;pin();
      say('Dive! Gold glints are loot. 📡 finds the nearest.',3200);setTimeout(()=>fadeTo(0),200)});
  }
  function pin(){const r=ST.run;S.x=AT.x+r.x;S.y=AT.y+r.y;S.z=AT.z+r.z;S.vy=0;S.grounded=true;S.flying=false;S.rot=r.h;S.pocket=true;S.dv=true;if(me){me.position.set(S.x,S.y,S.z);me.visible=false}}
  function leave(){
    if(ST.mode==='off')return;ST.mode='off';ST.run=null;closeSheet();if(W)W.hide();if(hud)hud.classList.remove('on');document.body.classList.remove('deepdive');raceRes(false);
    S.pocket=false;S.dv=false;const e=document.getElementById('dpInk');if(e)e.style.opacity=0;
    if(ST.ret){S.x=ST.ret.x;S.z=ST.ret.z;S.y=Math.max(ST.ret.y,(typeof H==='function'?H(ST.ret.x,ST.ret.z):0)+.2);S.vy=0;S.rot=ST.ret.rot||S.rot;S.flying=false;S.grounded=true}
    if(me)me.visible=true;for(const g of ST.hid)g.visible=true;ST.hid=[];camera.fov=resPrev?resPrev.fov:60;camera.updateProjectionMatrix();BTN.up=BTN.down=BTN.fire=BTN.boost=BTN.ping=false;
    try{if(SFX.ctx&&SFX.drone)SFX.drone.g.gain.setTargetAtTime(0,SFX.ctx.currentTime,.05)}catch(e){}
  }
  function abort(){if(ST.mode==='dive'&&ST.run&&ST.run.state==='dive'){C.lose(ST.run,'abort')}}
  function finish(){
    if(ST.paid)return;ST.paid=true;const run=ST.run,p=C.payout(run),won=run.state==='surfaced',why={o2:'You ran out of air.',hull:'The hull gave way.',crush:'The hull was crushed.',heat:'The vents cooked the sub.',abort:'You aborted the dive.'}[run.why]||'';
    if(p.coins>0&&typeof Outlaw!=='undefined'&&Outlaw.earn){try{Outlaw.earn(p.coins)}catch(e){}}
    BEST.dives++;BEST.coins=Math.max(BEST.coins,p.coins);BEST.depth=Math.max(BEST.depth,run.maxDepth);if(run.kills.kraken)BEST.krakens++;if(run.got.pearl)BEST.pearls++;saveBest();
    fadeTo(1,()=>{leave();fadeTo(0);closeSheet();sheet=el('div','sheet rl-sheet rl-res');
      sheet.innerHTML=`<h2>${won?'🤿 Back on the surface':'💥 Dive lost'}</h2><p class="rl-sub">${won?(run.got.pearl?'You brought up the Abyssal Pearl!':'You kept everything you found.'):why+' You kept 40% of your finds.'}</p>
        <div class="rl-row"><b>+${p.coins} 🪙</b></div><p class="rl-help">Depth ${p.depth} m · ${p.loot} finds · ${run.kills.jelly} jellyfish · ${run.kills.angler} anglerfish${run.kills.kraken?' · KRAKEN SLAIN':''} · ${Math.round(run.t)} s</p>
        <div class="rl-row"><button class="btn rl-again">Dive again</button><button class="btn rl-hg">🔧 Sub shop</button><button class="btn rl-x">Back to the island</button></div>`;
      document.body.appendChild(sheet);
      sheet.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;sfxInit();
        if(b.classList.contains('rl-hg')){closeSheet();openShop(()=>openLobby())}else if(b.classList.contains('rl-again')){closeSheet();begin()}else closeSheet()})},520);
  }
  // ---------------------------------------------------------------- events -> sound, HUD, visuals
  function onEvent(e){
    W&&W.fx(e);
    switch(e.k){
      case 'fire':SND.fire();break;case 'ping':SND.ping();break;
      case 'loot':SND.loot();say((e.kind==='chest'?'📦 Treasure chest':e.kind==='relic'?'🏺 Temple relic':e.kind==='pearl'?'⚪ THE ABYSSAL PEARL':e.kind==='crystal'?'💎 Vent crystal':'🪙 Gold')+'  +'+e.v,1400);break;
      case 'hurt':SND.hurt();ST.shake=Math.max(ST.shake,.5+Math.min(.6,e.d/30));{const f=document.getElementById('dpFlash');if(f){f.style.opacity=1;setTimeout(()=>f.style.opacity=0,160)}}break;
      case 'bite':SND.hurt();break;case 'kill':SND.kill();if(e.kind==='kraken'){say('🐙 THE KRAKEN IS DEAD — take the Pearl!',3600);SND.roar()}break;
      case 'angler':say('An anglerfish saw you!',1300);SND.alarm();break;
      case 'krakenWake':say('🐙 The Kraken wakes…',2600);SND.wake();break;
      case 'krakenTele':SND.tele();ST.shake=Math.max(ST.shake,.15);break;case 'krakenSwipe':SND.roar();ST.shake=Math.max(ST.shake,.6);break;
      case 'krakenInk':say('Ink! You are blind — keep moving.',2200);break;
      case 'surfaced':case 'lost':break;
    }
  }
  // ---------------------------------------------------------------- camera
  function updateCamera(run,dt){
    const wy=AT.y;if(!camS.init){camS.yaw=run.h;camS.x=run.x;camS.y=run.y;camS.z=run.z;camS.init=true}
    camS.yaw+=wrap(run.h-camS.yaw)*Math.min(1,dt*3.2);
    const back=9.5+Math.min(3,Math.abs(run.v)*.12),sx=Math.sin(camS.yaw),cz=Math.cos(camS.yaw),want={x:run.x-sx*back,y:run.y+3.4-run.p*5,z:run.z-cz*back};
    const k=Math.min(1,dt*7);camS.x+=(want.x-camS.x)*k;camS.y+=(want.y-camS.y)*k;camS.z+=(want.z-camS.z)*k;
    let cy=Math.max(camS.y,C.floorY(camS.x,camS.z)+1.6);cy=Math.min(cy,-1);
    const sh=ST.shake>0?ST.shake*.35:0;ST.shake=Math.max(0,ST.shake-dt*1.6);
    camera.position.set(AT.x+camS.x+(Math.random()-.5)*sh,wy+cy+(Math.random()-.5)*sh,AT.z+camS.z+(Math.random()-.5)*sh);
    camera.lookAt(AT.x+run.x+Math.sin(run.h)*9,wy+run.y+1.2+run.p*6,AT.z+run.z+Math.cos(run.h)*9);
    const fov=60+(run.v>12?(run.v-12)*1.1:0);if(Math.abs(camera.fov-fov)>.05){camera.fov+=(fov-camera.fov)*Math.min(1,dt*5);camera.updateProjectionMatrix()}
  }
  // other divers: anyone whose presence sits inside the trench is drawn as a sub
  function buddies(){
    const list=[];try{for(const o of others.values()){const g=o.group;if(!g)continue;const py=g.position.y;if(py<AT.y+20&&py>AT.y-520){g.visible=false;if(!ST.hid.includes(g))ST.hid.push(g);list.push({x:g.position.x-AT.x,y:py-AT.y,z:g.position.z-AT.z,h:g.rotation.y})}}}catch(e){}
    W.others(list)}
  function frame(dt){
    try{
      if(typeof entered==='undefined'||!entered)return;ensureFab();
      if(ST.mode==='off'||!ST.run)return;sfxUpdate();
      if(ST.mode!=='dive')return;const run=ST.run;dt=Math.min(dt,.05);
      if(run.state==='dive'){C.step(run,dt,{ix:IN.ix,iy:IN.iy,up:BTN.up,down:BTN.down,boost:BTN.boost,fire:BTN.fire,ping:BTN.ping,lamp});BTN.ping=false}
      for(const e of run.ev)onEvent(e);run.ev.length=0;
      if(run.state!=='dive'&&!ST.paid&&!ST.fin){ST.fin=true;setTimeout(()=>{ST.fin=false;if(ST.run===run)finish()},run.state==='surfaced'?250:1400);if(run.state==='lost')say('💥 '+({o2:'OUT OF AIR',hull:'HULL BREACH',crush:'CRUSHED',heat:'OVERHEATED',abort:'ABORTING'}[run.why]||'LOST'),1600)}
      pin();updateCamera(run,dt);W.sync(run,dt,{x:camera.position.x-AT.x,y:camera.position.y-AT.y,z:camera.position.z-AT.z});buddies();drawHud(run);
    }catch(e){console.error('Deep.frame',e);if(ST.mode!=='off')try{leave()}catch(e2){}}
  }
  // ---------------------------------------------------------------- hooks used by index.html / Environment
  const locked=()=>ST.mode!=='off';
  function setInput(ix,iy){IN.ix=ix;IN.iy=-iy}   // the joystick's "up" is negative y: forward thrust is positive here
  function fog(){
    if(ST.mode==='off'||!ST.run)return null;const run=ST.run,f=DeepWorld.fogAt(run.y,run.lamp&&run.bat>0),d=clamp(-run.y/360,0,1);
    return{r:f.r,g:f.g,b:f.b,near:f.near,far:f.far*(run.ink>0?.5:1),sun:.02,hemi:.5-.34*d,amb:.16-.1*d}}
  function build(){if(typeof Systems!=='undefined'&&Systems.add)Systems.add('deep-fab',()=>{if(typeof entered!=='undefined'&&entered)ensureFab()})}
  return{build,frame,locked,setInput,fog,on:()=>ST.mode==='dive',openLobby,_t:()=>({ST,UP,BEST,W,AT}),_begin:begin};
})();
