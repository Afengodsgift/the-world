// WARDEN: the player's combat controller + every fight on the isle (flag-gated: nothing here runs unless the Warden Isles are on and you stand in a fight site).
// Wiring: CombatCore (fixed 60 Hz sim) <- stepper <- inputs (keys / touch buttons / lock-on) + one DuelistAI per foe. The sim owns only FORCED motion for the player (dodge, lunge, knockback); free walking stays with
// the game's own player controller (tickFrame) and is scaled by speedMul(). Foes are fully sim-driven (their AI walks them through the sim).
// SITES (WARDEN.sites, data/warden.js): walk into a site's ring and its foes spawn (Foes.js roster). fog:true = a boss gate (the ring seals until the foe is felled), fog:false = a camp (foes wake when you come near, run away to reset).
// Foe bodies: 'avatar' = the game's own rig + dress (Duelist, soldiers), 'glb' = a natively rigged Mixamo model (Paladin, Parasite, Arissa) with its own mixer. Both are animated by WardenMX (real clips scrubbed by the sim phase).
// Sim ids: 'P' = the player, 'D','E','F',... = the foes of the current site. Teams: player 'p', foes 'e' (no friendly fire).
// Globals used: THREE, S, me, H, WRD, WARDEN, WardenSolids, scene, WAudio, makeAvatar/dress/animate/emoStop/lerpAngle, loadEmotes (index.html), CombatCore, Moves, WardenAnim, WardenMX, DuelistAI, Foes, WardenFx.
const PlayerCombat=(()=>{
  const PC={_pose:null,ai:true,loop:false};   // _pose=[nameA,nameB,u]: test hook that pins the procedural pose layer; ai=false: foes stand still (tests / practice); loop=true: a felled site restarts after 5 s (old single-arena behaviour)
  const SPD=5,GSPD=2.5,CSPD=2;                       // m/s: free walk, guarding, charging a heavy
  let mxSaid='',on=false,C=null,ST=null,P=null,D=null,t0=0,lx=0,lz=0,lock=false,lockI=0,pendFace=null,pendT=0;
  const down={guard:false,heavy:false};              // logical button state (what the sim was told)
  const ptr={};                                       // touch: button -> pointerId
  let el=null,sword=null,sword2=null,swordTried=false,pAnim=null,site=null,foes=[],fightN=0,state='fight',stateT=0,lastEv=[],byId={},dFlashT=0,felled=0;
  const RT={};                                        // site id -> {foes:[], cleared:bool}
  const pv={x:0,z:0,vf:0,vs:0,sp:0,init:false};
  const cur=WardenAnim.copy(WardenAnim.POSES.ready),tg=WardenAnim.copy(WardenAnim.POSES.ready);let stW=0,gT=0,msgT=0,lastTone=0;
  const GRIP={rx:0,ry:0,rz:0,len:.95,ox:0,oy:0,oz:0};
  const rt=s=>RT[s.id]||(RT[s.id]={foes:[],cleared:!!(s.dg&&typeof WardenDungeon!=='undefined'&&WardenDungeon.isCleared(s.id))});   // catacomb rooms stay cleared for the whole cycle (WardenDungeon)
  const SITES=()=>WARDEN.sites;
  // ---------- audio (tiny WebAudio tones; silent if audio is unavailable) ----------
  function tone(f0,f1,dur,type,vol){try{const now=performance.now();if(now-lastTone<25)return;lastTone=now;const a=WAudio.get();if(!a)return;const o=a.createOscillator(),g=a.createGain();o.type=type||'triangle';
    o.frequency.setValueAtTime(f0,a.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),a.currentTime+dur);o.connect(g);g.connect(WAudio.out());
    g.gain.setValueAtTime(vol||.12,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+dur);o.start();o.stop(a.currentTime+dur+.02)}catch(e){}}
  // ---------- targets ----------
  const alive=()=>foes.filter(F=>F.f.act!=='dead'&&!F.ghost);
  function nearest(){let b=null,bd=1e9;const anyAw=foes.some(F=>F.f.act!=='dead'&&F.awake);for(const F of foes){if(F.f.act==='dead'||F.ghost||(anyAw&&!F.awake))continue;const d=Math.hypot(F.f.x-S.x,F.f.z-S.z);if(d<bd){bd=d;b=F}}return b}
  function target(){const L=lock&&foes[lockI];if(L&&L.f.act!=='dead')return L;return nearest()||foes[0]}
  let vt=0,vl=0,tsc=1,ult=null;const now=()=>vt,stamp=ts=>Barrage.stamp(ts,vl,vt,tsc);   // sim clock in ms: runs at tsc x real time (bullet time in the Phantom Barrage)
  function heading(){const dx=D.x-S.x,dz=D.z-S.z;return Math.atan2(dx,dz)}
  function stickDir(){   // world-space direction of the current stick/keys input, or null
    let ix=typeof stickV!=='undefined'?stickV.x:0,iy=typeof stickV!=='undefined'?stickV.y:0;
    if(keys.KeyA||keys.ArrowLeft)ix-=1;if(keys.KeyD||keys.ArrowRight)ix+=1;if(keys.KeyW||keys.ArrowUp)iy-=1;if(keys.KeyS||keys.ArrowDown)iy+=1;
    const l=Math.hypot(ix,iy);if(l<.2)return null;ix/=l;iy/=l;const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw);return[cy*ix+sy*iy,-sy*ix+cy*iy]}
  function assist(){   // snap the facing toward the nearest foe when he is close and roughly ahead
    if(ult&&ult.kind==='echo')return;   // (it would point you at the real one)
    const F=nearest();if(!F)return;const dx=F.f.x-S.x,dz=F.f.z-S.z,d=Math.hypot(dx,dz);if(d>4.5)return;const a=Math.atan2(dx,dz);
    if(lock||Math.abs(Math.atan2(Math.sin(a-S.rot),Math.cos(a-S.rot)))<1.0){pendFace=a;pendT=8;S.rot=a}}
  function reject(){if(P.st>2||!el)return;const b=el.querySelector('.p .st');b.classList.add('bad');setTimeout(()=>b.classList.remove('bad'),260);tone(110,80,.08,'square',.05)}   // out of stamina: say so instead of silently dropping the tap
  // ---------- difficulty: foes are tougher than the base roster, and tougher again when two fight them together (the host rescales as the partner joins / leaves) ----------
  const DIFF={hp:1.4,dm:1.3},COOP={hp:1.8,dm:1.2};
  let mastery=!1;   // a rematch of a boss you have already felled (sites with mast:true): more health and damage, and he reads and presses harder
  const foeMul=()=>{const c=WardenProg.cycleMul();return{hp:DIFF.hp*(Q?COOP.hp:1)*c.hp*(mastery?1.5:1),dm:DIFF.dm*(Q?COOP.dm:1)*c.dm*(mastery?1.25:1)}};
  function rescaleFoes(){const m=foeMul();for(const F of foes){const f=F.f,base=F.T.hp*m.hp,r=f.hpMax>0?f.hp/f.hpMax:1;if(f.act!=='dead'){f.hpMax=Math.round(base);f.hp=Math.max(1,r*f.hpMax)}f.dm=(F.T.dm||1)*m.dm;F.sc=m.hp}}
  // ---------- flasks: Health (50 HP over 2.5 s), Stamina Tonic (full stamina), Might Tonic (+30% damage for 30 s). Counts persist in the browser; felled foes drop them ----------
  const FL={hp:{n:'Health Flask',max:5,ic:'\u2764',use:'heal'},st:{n:'Stamina Tonic',max:4,ic:'\u26A1',use:'stam'},mt:{n:'Might Tonic',max:3,ic:'\u2694',use:'might'}};
  let flasks={hp:3,st:2,mt:1},healLeft=0,mightT=0,itemLock=0;
  try{const j=JSON.parse(localStorage.getItem('wflask')||'null');if(j)for(const k in FL)if(Number.isFinite(j[k]))flasks[k]=Math.max(0,Math.min(9,j[k]|0))}catch(e){}
  const saveFl=()=>{try{localStorage.setItem('wflask',JSON.stringify(flasks))}catch(e){}};
  function useFlask(k){
    if(!on||!P||P.act==='dead'||itemLock>0||flasks[k]<=0)return;if(site&&site.duel){msg('No flasks in the arena',.8);return}const t=FL[k].use;
    if(t==='heal'&&(P.hp>=P.hpMax||healLeft>0)){msg('Health is full',.8);return}
    if(t==='stam'&&P.st>=P.stMax*.8){msg('Stamina is fine',.8);return}
    if(t==='might'&&mightT>0){msg('Already empowered',.8);return}
    flasks[k]--;saveFl();itemLock=.9;
    if(t==='heal'){healLeft=50;flaskHunt();sfx('clash',.3,.7,()=>tone(520,900,.25,'sine',.1))}
    else if(t==='stam'){P.st=P.stMax;sfx('clash',.3,1.2,()=>tone(700,1100,.2,'sine',.1))}
    else{mightT=30;P.dm=baseDm*1.3;msg('MIGHT',1);sfx('heavy',.4,1.4,()=>tone(200,500,.3,'sawtooth',.1))}
    flaskUi()}
  function flaskTick(dt){
    if(itemLock>0)itemLock-=dt;
    if(healLeft>0){if(P.act==='dead')healLeft=0;else{const g=Math.min(healLeft,20*dt);healLeft-=g;P.hp=Math.min(P.hpMax,P.hp+g);if(P.hp>=P.hpMax)healLeft=0}}
    if(mightT>0){mightT-=dt;if(mightT<=0||P.act==='dead'){mightT=0;P.dm=baseDm}}}
  function flaskUi(){if(!el)return;for(const k in FL){const b=el.querySelector('#wI'+k);if(!b)continue;b.querySelector('i').textContent=flasks[k];b.classList.toggle('none',flasks[k]<=0);b.classList.toggle('use',k==='mt'?mightT>0:k==='hp'?healLeft>0:false)}}
  function flaskDrop(T){const rnd=Math.random;let got=null;
    if(T.boss){got=[rnd()<.6?'hp':'st',rnd()<.5?'st':'mt'];}else if(rnd()<.22)got=['hp'];
    if(!got)return;const names=[];for(const k of got)if(flasks[k]<flaskCap(k)){flasks[k]++;names.push(FL[k].n)}if(names.length){saveFl();flaskUi();setTimeout(()=>msg('Found: '+names.join(' + '),2),900)}}
  // ---------- progression (WardenProg.js): Embers from every kill, permanent upgrades at the Ember Shrine, Ashen Cycles (New Game+) ----------
  const PG=WardenProg;PG.setBosses(WARDEN.sites.filter(s=>s.fog&&s.boss!==false).map(s=>s.id));
  let baseDm=1,shrineEl=null,chipEl=null,chipKey='',mark=null,markT=0,toastEl=null,toastT=0;
  const flaskCap=k=>Math.min(9,FL[k].max+PG.stats().belt);
  let wst=WardenGear.stats();
  let myStyle=(()=>{try{const v=localStorage.getItem('wstyle');return WardenStyle.valid(v)?v:WardenStyle.DEFAULT}catch(e){return WardenStyle.DEFAULT}})(),pStyle=WardenStyle.DEFAULT,sty=WardenStyle.get(myStyle);
  const styId=()=>site&&site.duel?WardenStyle.DEFAULT:myStyle;   // duels ignore styles
  function setStyle(id){if(!WardenStyle.valid(id))return false;myStyle=id;if(id!=='twin'&&sword2){sword2.dead=true;try{sword2.grip&&sword2.grip.parent&&sword2.grip.parent.remove(sword2.grip)}catch(e){}sword2=null}sty=WardenStyle.get(id);try{localStorage.setItem('wstyle',id)}catch(e){}if(on&&P)applyStats();try{if(NET.mode!=='solo')WardenNet.send({k:'sty',s:NET.site,y:id})}catch(e){}return true}
  function applyStats(){const duel=site&&site.duel,st=duel?{hp:100,st:100,dm:1,belt:0}:PG.stats();wst=WardenGear.stats();sty=WardenStyle.get(styId());const m=WardenStyle.mix(wst,styId());wst=Object.assign({},wst,{flow:m.flow});const hp=Math.round(st.hp*m.hp);P.hpMax=hp;P.hp=hp;P.stMax=Math.round(st.st*(sty.st||1));P.st=P.stMax;baseDm=st.dm*m.dm;P.dm=baseDm;P.rm=wst.rm;P.sm=m.sm;P.pm=m.pm;P.dfl=m.dfl+(duel&&DU.pair?3:0);P.bk=sty.back||0}
  // ---- TWIN BLADES stance (src/combat/Twin.js): swap mid-fight between your equipped weapon and two short blades. The swap is a free action in the sim ({t:'stance'}), never blocks a dodge or a roll. ----
  let stance='main',swapCd=0,twinR=null,twinL=null;const TWB={f:'warden/w_katana.glb',want:.62,l0:1};
  const baseRole=()=>WardenGear.TYPES[WardenGear.equipped().ty].role||'player';
  const pRole=()=>stance==='twin'?'player_twin':baseRole();
  function dropTwin(){for(const w of [twinR,twinL])if(w){w.dead=true;try{if(w.grip&&w.grip.parent)w.grip.parent.remove(w.grip)}catch(e){}}twinR=null;twinL=null}
  function syncWeapons(){const tw=stance==='twin';if(sword&&sword.grip)sword.grip.visible=on&&!tw;if(sword2&&sword2.grip)sword2.grip.visible=on&&!tw;
    if(tw&&me&&me.userData.bones){if(!twinR)twinR=attachSword(me,TWB.f,TWB.want,{len:TWB.l0});if(!twinL&&me.userData.bones.LeftHand)twinL=attachSword(me,TWB.f,TWB.want,{len:TWB.l0},null,'LeftHand')}
    for(const w of [twinR,twinL])if(w&&w.grip)w.grip.visible=on&&tw}
  function swapStance(force){
    if(!on||!P||P.act==='dead'||ult||sv||site&&site.duel&&!force)return false;if(swapCd>0)return false;
    stance=stance==='twin'?'main':'twin';swapCd=.32;
    ST.input('P',{t:'stance',tw:stance==='twin'?1:0,e:C.tick},now());
    if(pAnim){try{pAnim.off()}catch(e){}pAnim=null}                   // the clip layer is rebuilt for the new stance on the next frame (twin and player share one clip file, so no download)
    syncWeapons();try{WardenFx.build();WardenVfx.burst(P.x,H(P.x,P.z)+1.1,P.z,stance==='twin'?1:3)}catch(e){}sfx('clash',.5,1.6);
    msg(stance==='twin'?'TWIN BLADES':'WEAPON',.9);const b=el&&el.querySelector('#wSwap');if(b){b.classList.toggle('on',stance==='twin');b.textContent=stance==='twin'?'Blade':'Twin'}
    if(!swapTip){swapTip=1;toast('Swap Strike: your first hits after a swap deal +25%',3)}
    try{if(NET.mode!=='solo')WardenNet.send({k:'sty',s:NET.site,y:stance==='twin'?'twin':myStyle})}catch(e){}
    return true}
  let swapTip=0;
  function swapModel(){dropTwin();if(pAnim){try{pAnim.off()}catch(e){}pAnim=null}for(const w of [sword,sword2])if(w){w.dead=true;try{if(w.grip&&w.grip.parent)w.grip.parent.remove(w.grip)}catch(e){}}sword=null;sword2=null;swordTried=false}
  if(typeof AvatarKit!=='undefined')AvatarKit.onSwap(g=>{if(typeof me!=='undefined'&&g===me)swapModel()});   // the player's avatar body changed: drop the sword + clip layer built on the old rig (rebuilt on the next frame)
  function toast(t,sec){if(!toastEl){toastEl=document.createElement('div');toastEl.id='wtoast';document.body.appendChild(toastEl)}toastEl.textContent=t;toastEl.classList.add('on');toastT=sec||2.4}
  function say(t,sec){if(on&&el)msg(t,sec);else toast(t,sec)}
  function payFoes(){for(const F of foes){if(F.f.act!=='dead'||F.paid)continue;F.paid=true;if(F.human||site&&site.duel)continue;const n=Math.round(PG.reward(F.T,site&&site.id)*wst.gild);PG.add(n);say('+'+n+' Embers',1.6);gearDrop(F.T)}}
  function gearDrop(T){const it=WardenGear.drop(Math.random,!!T.boss,PG.S.cycle);if(!it)return;if(WardenGear.full()){const v=WardenGear.sellValue(it);PG.earn(v);setTimeout(()=>say('Pack full: sold '+WardenGear.name(it)+' for '+v,2.2),1200);return}
    WardenGear.add(it);setTimeout(()=>say('Found: '+WardenGear.name(it)+' ('+WardenGear.RAR[it.rar]+')',2.6),1200)}
  function lostMark(t,dt){   // the pile of embers you left where you fell
    const L=PG.S.lost;if(!L){if(mark)mark.visible=false;return}
    if(!mark){const g=new THREE.Group(),m=new THREE.MeshBasicMaterial({color:0xff9a3a,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
      g.add(new THREE.Mesh(new THREE.SphereGeometry(.28,10,8),m));const r=new THREE.Mesh(new THREE.RingGeometry(.5,.62,24),m.clone());r.rotation.x=-Math.PI/2;r.position.y=-.55;g.add(r);
      const l=new THREE.PointLight(0xff7a2a,1.2,9);g.add(l);scene.add(g);mark=g}
    const near=Math.hypot(L.x-S.x,L.z-S.z)<120;mark.visible=near;if(!near)return;
    mark.position.set(L.x,H(L.x,L.z)+1.2+Math.sin(t*2.2)*.12,L.z);mark.rotation.y+=dt*1.5;
    if(on&&P&&P.act!=='dead'&&site&&site.id===L.sid&&state==='fight'&&Math.hypot(L.x-S.x,L.z-S.z)<1.9){const n=PG.claim();say('Embers recovered: +'+n,2);sfx('clash',.5,1.5,()=>tone(600,1200,.2,'sine',.1))}}
  const ups=[['vig','+10 max health'],['end','+6 max stamina'],['mig','+4% damage'],['belt','+1 flask capacity']];
  const GR=WardenGear,FLP={hp:['Health Flask',40],st:['Stamina Tonic',35],mt:['Might Tonic',70]};
  let shTab='up';
  const stockSeed=()=>PG.S.cycle*1000+PG.progress().n;
  const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function itemHtml(it,btns){const T=GR.TYPES[it.ty],c=GR.RCOL[it.rar];let h='<div class="su"><div><b style="color:'+c+'">'+esc(GR.name(it))+'</b> <i>'+GR.RAR[it.rar]+'</i><small>'+esc(T.d)+'</small>';
    for(const [k,t] of it.af)h+='<small class="af">'+esc(GR.AFFIX[k].lbl(GR.AFFIX[k].v[t]))+'</small>';return h+'</div><div class="bt">'+btns+'</div></div>'}
  function shrineHtml(){const S0=PG.S,p=PG.progress(),tw=PG.twist(S0.cycle);let h='<div class="sh"><b>Ember Shrine</b><button id="wshx">&times;</button></div>'+
      '<div class="sc">Cycle '+S0.cycle+(tw?' · '+tw:'')+' <span>'+p.n+'/'+p.of+' bosses felled</span></div>'+
      '<div class="se">🔥 <b>'+S0.embers+'</b> Embers'+(S0.lost?' <span>('+S0.lost.n+' lie where you fell)</span>':'')+'</div>'+
      '<div class="stb">'+[['up','Upgrades'],['arm','Armory'],['sty','Style'],['shop','Merchant']].map(([k,n])=>'<button data-a="tab" data-k="'+k+'"'+(shTab===k?' class="on"':'')+'>'+n+'</button>').join('')+'</div>';
    if(shTab==='up'){for(const [k,d] of ups){const lv=S0.ups[k],c=PG.cost(k),mx=lv>=PG.MAXL[k];h+='<div class="su"><div><b>'+PG.NAMES[k]+'</b> <i>Lv '+lv+'/'+PG.MAXL[k]+'</i><small>'+d+'</small></div><button data-a="up" data-k="'+k+'"'+(mx||S0.embers<c?' disabled':'')+'>'+(mx?'MAX':c)+'</button></div>'}
      h+='<div class="sf">Resting here refills your flasks. Felling every boss ends the cycle: the isles grow stronger (foes ×'+(PG.cycleMul(S0.cycle+1).hp).toFixed(2)+' health) and every kill pays more Embers.</div>'}
    else if(shTab==='sty'){h+='<div class="sf" style="margin:0 0 4px">How you fight. Duels ignore styles. In co-op each of you picks your own, and your partner sees yours.</div>';
      for(const id of WardenStyle.IDS){const q=WardenStyle.get(id);h+='<div class="su"><div><b>'+q.icon+' '+q.n+'</b> <i>'+q.tag+'</i><small>'+esc(q.d)+'</small></div><button data-a="sty" data-k="'+id+'"'+(myStyle===id?' disabled':'')+'>'+(myStyle===id?'Chosen':'Choose')+'</button></div>'}}
    else if(shTab==='arm'){h+='<div class="sf" style="margin:0 0 4px">Pack '+GR.S.inv.length+'/'+GR.CAP+'. Bosses always drop a weapon; foes sometimes do.</div>';
      for(const it of GR.all()){const eq=GR.S.eq===it.id;h+=itemHtml(it,'<button data-a="eq" data-k="'+it.id+'"'+(eq?' disabled':'')+'>'+(eq?'Equipped':'Equip')+'</button>'+(it.id==='start'?'':'<button data-a="sell" data-k="'+it.id+'">Sell '+GR.sellValue(it)+'</button>'))}}
    else{h+='<div class="sf" style="margin:0 0 4px">The Wandering Merchant. Stock changes whenever a boss falls.</div>';
      for(const k in FLP){const cap=flaskCap(k),full=flasks[k]>=cap;h+='<div class="su"><div><b>'+FLP[k][0]+'</b> <i>'+flasks[k]+'/'+cap+'</i></div><button data-a="buyf" data-k="'+k+'"'+(full||S0.embers<FLP[k][1]?' disabled':'')+'>'+FLP[k][1]+'</button></div>'}
      const st=GR.stock(stockSeed());if(!st.length)h+='<div class="sf">Sold out. Fell a boss and he will have more.</div>';
      for(const it of st)h+=itemHtml(it,'<button data-a="buyw" data-k="'+it.id+'"'+(S0.embers<GR.price(it)||GR.full()?' disabled':'')+'>'+GR.price(it)+'</button>')}
    return h}
  function shrineAct(a,k){
    if(a==='tab'){shTab=k;return true}
    if(a==='up')return PG.buy(k);
    if(a==='sty')return setStyle(k);
    if(a==='eq'){if(GR.equip(k)){swapModel();return true}return false}
    if(a==='sell'){const v=GR.sell(k);if(v){PG.earn(v);swapModel();return true}return false}
    if(a==='buyf'){const c=FLP[k]&&FLP[k][1];if(!c||flasks[k]>=flaskCap(k)||!PG.spend(c))return false;flasks[k]++;saveFl();flaskUi();return true}
    if(a==='buyw'){const it=GR.stock(stockSeed()).find(x=>x.id===k);if(!it||PG.S.embers<GR.price(it))return false;const p=GR.buy(it,PG.S.embers);if(!p)return false;PG.spend(p);return true}
    return false}
  function shrineShow(){
    if(!shrineEl){shrineEl=document.createElement('div');shrineEl.id='wshrine';document.body.appendChild(shrineEl);
      shrineEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='wshx'){shrineEl.classList.remove('on');return}
        if(b.dataset.a&&shrineAct(b.dataset.a,b.dataset.k)){if(b.dataset.a!=='tab')sfx('clash',.5,1.3,()=>tone(500,1000,.2,'sine',.1));const y=shrineEl.scrollTop;shrineEl.innerHTML=shrineHtml();shrineEl.scrollTop=y;chipKey=''}});
      shrineEl.addEventListener('pointerdown',e=>e.stopPropagation())}
    for(const k in FL)flasks[k]=Math.max(flasks[k],[3,2,1][['hp','st','mt'].indexOf(k)]+PG.stats().belt);saveFl();flaskUi();
    shrineEl.innerHTML=shrineHtml();shrineEl.classList.add('on')}
  let siteEl=null,siteKey='';
  function siteLabel(wx,wz,near){   // "you are near ..." pill while walking the isle: so you always know which place is which
    let b=null,bd=1e9;if(near)for(const q of WARDEN.sites){if(q.dg)continue;const d=Math.hypot(wx-q.x,wz-q.z)-q.R;if(d<bd){bd=d;b=q}}
    const k=b&&bd<22&&typeof WardenKind==='function'?b.id+(rt(b)&&rt(b).cleared?'c':''):'';if(k===siteKey)return;siteKey=k;
    if(!siteEl){if(!k)return;siteEl=document.createElement('div');siteEl.id='wsite';document.body.appendChild(siteEl)}
    if(!k){siteEl.style.display='none';return}const kd=WardenKind(b);siteEl.style.display='block';siteEl.innerHTML=kd.icon+' <b>'+b.n+'</b> <span>'+kd.tag+(rt(b)&&rt(b).cleared?' · cleared':'')+'</span>'}
  function chipTick(wx,wz){   // the Embers chip: only while you are out on the Warden Isles and not fighting
    const near=!on&&Math.hypot(wx,wz)<(WARDEN.wallR||37)+230&&!S.flying&&S.state!=='swim';try{siteLabel(wx,wz,near)}catch(e){}
    if(!chipEl){if(!near)return;chipEl=document.createElement('button');chipEl.id='wemb';document.body.appendChild(chipEl);chipEl.addEventListener('pointerdown',e=>{e.stopPropagation()});chipEl.addEventListener('click',()=>{if(shrineEl&&shrineEl.classList.contains('on'))shrineEl.classList.remove('on');else shrineShow()})}
    const k=near+'|'+PG.S.embers+'|'+PG.S.cycle+'|'+(PG.S.lost?1:0);if(k===chipKey)return;chipKey=k;chipEl.style.display=near?'block':'none';
    chipEl.textContent='🔥 '+PG.S.embers+' · Cycle '+PG.S.cycle;if(!near&&shrineEl)shrineEl.classList.remove('on')}
  function cycleTurn(r){
    try{WardenDungeon.reset(r.cycle);WardenCatacombs.refresh()}catch(e){}
    toast('THE ISLES STIR · CYCLE '+r.cycle+(r.twist?' · '+r.twist.toUpperCase():'')+' · +'+r.bonus+' Embers',5);
    for(const k in RT){const q=RT[k];if(q&&q.cleared&&!(on&&site&&site.id===k)){q.cleared=false;for(const F of q.foes||[])freeBody(F.body);q.foes=[];try{WardenIsles.fog(k,'idle')}catch(e){}}}}
  // ---------- co-op (see WardenNet.js): host runs the foes, each player is authoritative for themselves, the partner is a puppet fighter 'Q' in the local sim ----------
  const NET=WardenNet.S;let Q=null,spectate=false,netSendT=0,helloAt=0,netStarts=[];
  const netOn=()=>NET.mode!=='solo'&&!!Q;
  function netAddQ(){if(!C||Q&&C.F.Q===Q)return;Q=C.add('Q',{x:S.x+1,z:S.z,face:S.rot,hp:100,team:'p'});if(NET.mode==='host')rescaleFoes()}
  function netDropQ(){if(C&&C.F.Q){delete C.F.Q;C.order=C.order.filter(i=>i!=='Q')}Q=null;if(NET.mode==='host')rescaleFoes()}
  function netHost(){helloAt=0;NET.mode='host';NET.site=site.id;NET.t0=Date.now();NET.left=false}
  function netJoin(){NET.mode='guest';NET.site=site.id;NET.left=false;netAddQ();WardenNet.send({k:'j',s:site.id});NET.gotSnap=performance.now()}
  function netLeave(){if(NET.mode!=='solo')WardenNet.send({k:'l',s:NET.site});WardenNet.reset();netDropQ();spectate=false}
  function netMsg(p){
    if(p&&(p.k==='dh'||p.k==='dr'||p.k==='dl')){duelMsg(p);return}
    if(!on||!site)return;
    if(p.k==='dc'){remoteDecoy(p);return}
    if(p.k==='sp'){spMsg(p);return}
    if(p.k==='sty'){partnerStyle(p.y);return}
    if(p.k==='j'&&NET.mode==='host'&&p.s===site.id){netAddQ();msg('Your partner joins the fight',1.6)}
    else if(p.k==='l'&&p.s===NET.site){if(NET.mode==='host'){netDropQ();NET.joined=false;msg('Your partner left the fight',1.6)}else if(NET.mode==='guest'){netDropQ();netHost();msg('The host left: you lead the fight',1.8)}}
    else if(p.k==='h'&&NET.mode==='host'&&p.s===site.id&&(p.t0<NET.t0||p.t0===NET.t0&&p.from<(typeof myId!=='undefined'?myId:''))){netJoin()}}   // two hosts at once: the earlier fight wins, the other becomes its guest
  const aiTarget=q=>{const bs=!!(q.T&&q.T.boss||byId[q.id]&&byId[q.id].T.boss);if(decoy&&decoy.t>0&&C.F.Z&&!(bs&&decoy.seen>=2))return C.F.Z;if(rdecoy&&rdecoy.t>0&&C.F.Y&&!(bs&&rdecoy.seen>=2))return C.F.Y;if(!Q||Q.act==='dead')return P;if(P.act==='dead')return Q;const dp=Math.hypot(P.x-q.x,P.z-q.z)-WardenStyle.taunt(styId()),dq=Math.hypot(Q.x-q.x,Q.z-q.z)-WardenStyle.taunt(pStyle),cur=q._tg==='Q'?Q:P;const o=cur===P?Q:P,dc=cur===P?dp:dq,dO=cur===P?dq:dp;const pick=dO<dc-2?o:cur;q._tg=pick.id;return pick};
  function partnerStyle(y){if(!WardenStyle.valid(y)||y===pStyle)return;pStyle=y;try{msg('Partner: '+WardenStyle.get(y).icon+' '+WardenStyle.get(y).n,1.8)}catch(e){}}
  function netApply(){   // consume the newest partner message (once)
    if(NET.mode==='host'&&NET.rep&&Q){const r=NET.rep;NET.rep=null;partnerStyle(r.y);WardenNet.apply(Q,r.p,Moves,1)}
    else if(NET.mode==='guest'&&NET.snap){const sn=NET.snap;NET.snap=null;partnerStyle(sn.y);NET.gotSnap=performance.now();
      for(const st of sn.st||[]){const F=byId[st.id];if(F&&F.f.act!=='dead')C.start(st.id,st.m,st.h)}
      for(const o of sn.f||[]){const F=byId[o.id];if(!F)continue;const f=F.f;
        if(o.act==='dead'){if(f.act!=='dead'){f.hp=0;f.act='dead';f.ph=null;f.mv=null;events([{t:'dead',a:'P',d:o.id}])}continue}
        if(ult&&ult.all.includes(F)){if(!F.ghost)F.f.hp=o.hp;continue}   // barrage actors run the same scripted timeline here; only the boss's health follows the host
        const keep=F.lh&&performance.now()-F.lh<500&&o.hp>f.hp?f.hp:o.hp;WardenNet.apply(f,o,Moves,.5);f.hp=keep;F.nin={mx:o.mx||0,mz:o.mz||0};
        if(o.aw&&!F.awake)rouse(F,F.dorm!=='wake');F.ai.ph2=!!o.p2;F.ai.ph3=!!o.p3}
      if(Q&&sn.p)WardenNet.apply(Q,sn.p,Moves,1)}}
  function netSend(dt){
    if(NET.mode==='solo'||!on)return;const nw=performance.now();
    if(NET.mode==='host'&&nw-helloAt>=1000){helloAt=nw;WardenNet.send({k:'h',s:site.id,t0:NET.t0})}
    if(nw-netSendT<66)return;netSendT=nw;
    if(NET.mode==='host'&&Q){const f=foes.map(F=>Object.assign(WardenNet.pack(F.f),{id:F.id,mx:F.nin?F.nin.mx:0,mz:F.nin?F.nin.mz:0,aw:F.awake?1:0,p2:F.ai.ph2?1:0,p3:F.ai.ph3?1:0}));WardenNet.send({k:'s',f,p:WardenNet.pack(P),st:netStarts,y:styId()});netStarts=[]}
    else if(NET.mode==='guest')WardenNet.send({k:'g',p:WardenNet.pack(P),y:styId()});
    if(NET.mode==='guest'&&performance.now()-NET.gotSnap>3500){netDropQ();netHost();msg('Lost the host: you lead the fight',1.8)}}
  // the partner's avatar (the world's normal remote avatar) plays a roll / block / swing while the puppet does
  let qAct='';
  function netVis(){if(!Q||!NET.partner||typeof others==='undefined')return;const o=others.get(NET.partner);if(!o)return;const k=Q.act==='attack'?'atk':Q.act;if(k===qAct)return;qAct=k;
    const e=k==='dodge'?'roll':k==='atk'?(Q.mv&&Q.mv.id==='heavy'?'cross':'jab'):Q.guard?'block':null;if(e&&typeof loadEmotes==='function')loadEmotes().then(()=>{o.group.userData.emoteReq=e}).catch(()=>{})}
  // ---------- duels: The Ashen Arena. Alone you fight the Shade (a bot); when another player walks in, the Shade is replaced by THEM. Same puppet model as co-op: each player is authoritative for their own
  // dodges / blocks / hits taken (so defence never waits on the network), and the opponent is a puppet fighter overwritten from their 15 Hz reports. Duels ignore upgrades and flasks (weapons and affixes still count).
  // Messages: 'dh' hello (1 Hz, name / rating / weapon), 'dr' state report (15 Hz), 'dl' leaving.
  const DU={pair:null,rep:null,gotAt:0,helloAt:0,sendT:0,cd:0,over:false,overT:0,t0:Date.now()};
  const nick=()=>(typeof myName!=='undefined'&&myName)||'Player';
  const meId=()=>typeof myId!=='undefined'?myId:'me';
  const duelSide=()=>DU.pair&&meId()<DU.pair.id?1:-1;
  // The Ashen Arena is for duels only: you cannot walk in without another player close by, there is no bot, and a Leave button always works (also while the connection is flaky).
  let exitLock=null,duelHint=0,waitMsg=0;
  // a hidden chamber opens once enough Warden bosses have fallen
  function hiddenOpen(q){let n=0;for(const s of SITES())if(s.fog&&!s.dg&&!s.hidden&&(rt(s).cleared||PG.S.done&&PG.S.done[s.id]))n++;   // counted from the SAVED record (WardenProg), not only from this visit
    if(n>=q.req)return true;
    const wx=S.x-WRD.x,wz=S.z-WRD.z;if(Math.hypot(wx-q.x,wz-q.z)<q.R-1&&performance.now()-hidHint>7000){hidHint=performance.now();toast('The chamber is sealed \u00b7 fell '+q.req+' Warden bosses ('+n+'/'+q.req+')',3.6)}return false}
  let hidHint=0,oathFirst=null;
  function duelPartnerNear(q){if(typeof others==='undefined')return false;const cx=WRD.x+q.x,cz=WRD.z+q.z;for(const o of others.values()){const g=o&&o.group;if(g&&g.position&&Math.hypot(g.position.x-cx,g.position.z-cz)<q.R+35)return true}return false}
  function quitArena(){if(!on||!site||!site.duel)return;const sid=site.id,cx=WRD.x+site.x,cz=WRD.z+site.z;let dx=S.x-cx,dz=S.z-cz;const d=Math.hypot(dx,dz)||1;if(d<1){dx=0;dz=1}else{dx/=d;dz/=d}
    leave(false);exitLock=sid;S.x=cx+dx*(site.R+3);S.z=cz+dz*(site.R+3);try{S.y=H(S.x,S.z)+.5}catch(e){}toast('You left the arena',1.8)}
  function duelT(){const p=DU.pair,WT=WardenGear.TYPES[p.ty]||WardenGear.TYPES.falchion;
    return Object.assign({},Foes.TYPES.shade,{id:'rival:'+(WardenGear.TYPES[p.ty]?p.ty:'falchion'),name:String(p.n).slice(0,16),hp:100,role:WT.role,sword:{f:WT.file,len:WT.want,l0:WT.l0},human:true,tint:1})}
  function duelBegin(){DU.over=false;DU.cd=3.2;DU.cdEnd=performance.now()+3200;DU.rep=null;DU.gotAt=performance.now();startFight();WardenMX.fetch(foes[0].T.role).catch(()=>{});msg('DUEL · '+DU.pair.n+' · '+PG.rank(DU.pair.r),1.6)}
  function duelUnpair(t){DU.pair=null;DU.cd=0;DU.rep=null;DU.over=false;if(on&&site&&site.duel){startFight();msg(t,2.4)}}
  function duelLeave(){if(DU.pair)WardenNet.send({k:'dl'});DU.pair=null;DU.cd=0;DU.rep=null;DU.over=false}
  function duelMsg(p){
    if(!on||!site||!site.duel)return;
    if(p.k==='dh'){if(!DU.pair&&typeof p.from==='string'){DU.pair={id:p.from,n:p.n||'Rival',r:p.r|0,ty:p.ty};duelBegin()}else if(DU.pair&&DU.pair.id===p.from){DU.gotAt=performance.now();DU.pair.r=p.r|0}}
    else if(p.k==='dr'){if(DU.pair&&p.from===DU.pair.id){DU.rep=p;DU.gotAt=performance.now()}}
    else if(p.k==='dl'){if(DU.pair&&p.from===DU.pair.id)duelUnpair('Your opponent left')}}
  function duelApply(rep){const F=foes[0];if(!F||!F.human||F.repDead)return;const o=rep.p,f=F.f;
    if(o.act==='dead'||o.hp<=0){F.repDead=true;WardenNet.apply(f,o,Moves,1);f.hp=0;f.act='dead';f.ph=null;f.mv=null;events([{t:'dead',a:'P',d:F.id,_rep:1}]);return}
    WardenNet.apply(f,o,Moves,.7)}
  function duelNet(dt){
    if(!on||!site||!site.duel)return;const nw=performance.now();
    if(DU.cd>0){const n=Math.ceil(DU.cd);DU.cd=Math.max(0,(DU.cdEnd-nw)/1000);const m=Math.ceil(DU.cd);if(DU.cd<=0){DU.cd=0;msg('FIGHT',1)}else if(m!==n&&m<=3)msg(String(m),.9)}
    if(nw-DU.helloAt>=1000){DU.helloAt=nw;WardenNet.send({k:'dh',n:nick(),r:PG.S.duel.rating,ty:WardenGear.equipped().ty})}
    if(!DU.pair){if(nw-waitMsg>3000){waitMsg=nw;msg('Waiting for an opponent \u00b7 another player must enter the arena',3.2)}return}
    if(nw-DU.sendT>=66){DU.sendT=nw;WardenNet.send({k:'dr',p:WardenNet.pack(P)})}
    if(DU.rep){const r=DU.rep;DU.rep=null;duelApply(r)}
    if(nw-DU.gotAt>4500)duelUnpair('Connection lost \u00b7 waiting for your opponent (Leave arena to go)')}
  function duelOver(win){if(DU.over)return;DU.over=true;DU.overT=performance.now();const human=!!(DU.pair&&foes[0]&&foes[0].human),r=PG.duelResult(win,human);
    msg((win?'VICTORY':'DEFEATED')+(r.embers?' · +'+r.embers+' Embers':'')+(human?' · '+r.rank+' '+r.rating:''),3);emK=''}
  // ---------- Flow: the meter fills from dodges / deflects / hits / posture breaks. Not full: the Flow button is a stamina skill (Cinder Arc; with the stick held it is the Ginga Step: a sidestep with i-frames into an evasive slash).
  // Full: it starts Flow (the meter drains for ~9 s) and the button becomes a finisher (Armada, then Meia Lua), each paid for out of the meter.
  let flow=0,flowOn=false,flowN=0,fq=null,skillCD=0;
  const FLOW_COST=32,FIN=['armada','martelo','meia','rasteira'],FINALL=FIN.concat(typeof Twin!=='undefined'?Twin.FIN:[]);
  function flowAdd(n){if(!on)return;const was=flow;flow=Math.min(100,flow+n*wst.flow*(stance==='twin'?1.4:1));if(flow>=100&&was<100&&!flowOn){msg('FLOW READY',1.2);tone(660,990,.18,'sine',.1)}}
  function flowPress(t){
    if(flowOn){const L=stance==='twin'&&typeof Twin!=='undefined'?Twin.FIN:FIN;fq={m:L[flowN%L.length],t:now()};return}
    if(flow>=100){flowOn=true;flowN=0;msg('FLOW',1.2);sfx('heavy',.5,1.5,()=>tone(300,800,.3,'sine',.12));return}
    if(skillCD>0||P.st<24){reject();return}
    const d=stickDir();
    if(d){skillCD=3;const c={t:'dodge',e:C.tick,dx:d[0],dz:d[1]};ST.input('P',c,t);ST.input('P',{t:'light',e:C.tick,adv:false},t+330);msg('GINGA',.7)}      // Ginga Step: dodge in the stick direction, then the evasive slash
    else{skillCD=3;fq={m:stance==='twin'&&typeof Twin!=='undefined'?Twin.SKILL:'cinder',t:now()}}}
  function flowEv(e,T){
    if(e.t==='hit'&&e.a==='P')flowAdd(e.dmg>=20?9:5);
    else if(e.t==='dodged'&&e.d==='P'){flowAdd(22);msg('ESQUIVA',.6)}
    else if(e.t==='deflect'&&!T)flowAdd(28);
    else if(e.t==='posturebreak'&&T)flowAdd(30);
    else if(e.t==='start'&&e.a==='P'&&e.move==='plunge'){S.vy=-17;S.coy=0;setTimeout(()=>{if(on)WardenVfx.burst(P.x+Math.sin(P.face)*1.6,H(P.x,P.z)+.3,P.z+Math.cos(P.face)*1.6,2)},110);sfx('heavy',.6,.7)}
    else if(e.t==='start'&&e.a==='P'&&e.move==='twshade'){WardenVfx.burst(P.x,H(P.x,P.z)+1,P.z,1);setTimeout(()=>{if(on){WardenVfx.slash(P.x,H(P.x,P.z)+1.2,P.z,P.face,true,1);WardenVfx.burst(P.x,H(P.x,P.z)+1,P.z,1)}},110);sfx('clash',.5,1.4)}
    else if(e.t==='start'&&e.a==='P'&&e.move==='cinder'){WardenVfx.slash(P.x,H(P.x,P.z)+1.2,P.z,P.face,true,3);setTimeout(()=>{if(on)WardenVfx.slash(P.x,H(P.x,P.z)+1.2,P.z,P.face,true,3)},180)}
    else if(e.t==='start'&&e.a==='P'&&FINALL.indexOf(e.move)>=0){setTimeout(()=>{if(on)WardenVfx.burst(P.x,H(P.x,P.z)+1.1,P.z,3)},330);flow=Math.max(0,flow-FLOW_COST);flowN++;if(flow<=0)flowOff()}}
  function flowOff(){if(flowOn){flowOn=false;msg('FLOW ENDS',.8)}}
  function flowTick(dt){
    if(skillCD>0)skillCD-=dt;if(swapCd>0)swapCd-=dt;
    if(flowOn){flow-=dt*11;if(flow<=0){flow=0;flowOff()}}
    if(fq){if(now()-fq.t>320)fq=null;else if(P.act==='free'&&(fq.m==='cinder'||fq.m==='twshade'?P.st>=(fq.m==='cinder'?22:16):flow>=8)){ST.input('P',{t:'atk',m:fq.m},now());assist();fq=null}}
    const f=Math.round(flow/100*60),full=flow>=100&&!flowOn;if(bars.fl!==f||bars.fon!==flowOn||bars.ffull!==full||bars.fn!==flowN){bars.fl=f;bars.fon=flowOn;bars.ffull=full;bars.fn=flowN;
      const b=el.querySelector('#wFlow');b.style.setProperty('--fl',(flow/100*360)+'deg');b.classList.toggle('full',full);b.classList.toggle('on',flowOn);b.textContent=flowOn?(stance==='twin'?(flowN%2?'Dance':'Moon'):(flowN%2?'Meia':'Armada')):'Flow';
      setBar('.p .fl',flow/100);const fb=el.querySelector('.p .fl');fb.classList.toggle('full',full);fb.classList.toggle('on',flowOn)}}
  function press(name,tms){
    if(pin&&on&&name!=='pause'){pin.n++;return true}
    if(!on||P.act==='dead'||DU.cd>0||CineCam.busy()&&CineCam.isActive()&&!ult)return false;const t=tms===undefined?now():tms;
    switch(name){
      case'light':{assist();reject();const c={t:'light',e:C.tick},d=stickDir(),fa=pendFace!==null?pendFace:S.rot;if(d&&d[0]*Math.sin(fa)+d[1]*Math.cos(fa)>.6)c.adv=true;if(D&&D.act!=='dead'&&Math.hypot(D.x-P.x,D.z-P.z)>4.5)c.far=true;ST.input('P',c,t);break}
      case'heavy':if(down.heavy)return true;assist();reject();down.heavy=true;ST.input('P',{t:'heavyDown',e:C.tick},t);break;
      case'guard':if(down.guard)return true;down.guard=true;ST.input('P',{t:'parry',e:C.tick},t);if(!parryTip){parryTip=1;toast('Parry: tap just before a hit lands to DEFLECT it',2.8)}break;
      case'dodge':{const d=stickDir();const c={t:'dodge',e:C.tick};if(d){c.dx=d[0];c.dz=d[1];if(lock&&D&&D.act!=='dead'&&!ult){const fx=D.x-P.x,fz=D.z-P.z,L=Math.hypot(fx,fz)||1;if(Math.abs((d[0]*fx+d[1]*fz)/L)<.55){c.side=1;if(!sideTip){sideTip=1;toast('Locked on + stick sideways = quick Sidestep',2.6)}}}}ST.input('P',c,t);break}
      case'flow':flowPress(t);break;
      case'sup':startSever();break;
      case'ihp':useFlask('hp');break;case'ist':useFlask('st');break;case'imt':useFlask('mt');break;
      case'lock':toggleLock();break;
      case'jump':fightJump();break;
      case'shadow':shadowStep();break;
      case'swap':swapStance();break;
      default:return false}
    return true}
  function release(name,tms){
    if(!on)return;const t=tms===undefined?now():tms;
    if(name==='heavy'&&down.heavy){down.heavy=false;ST.input('P',{t:'heavyUp'},t)}
    else if(name==='guard'&&down.guard){down.guard=false;ST.input('P',{t:'guardUp'},t)}}
  function releaseAll(){release('heavy');release('guard');for(const k in ptr)delete ptr[k];if(el)for(const b of el.querySelectorAll('button.dn'))b.classList.remove('dn')}
  // lock: tap = lock the nearest foe; tap again = cycle to the next one (clockwise by distance); with only one foe left it unlocks
  let lockOff=false;
  // ---- COMBAT CAMERA (see docs/COMBAT_CAMERA.md): lock-on orients, it never plays the fight for you ----
  // Lock-on yaw: the camera only turns once the target leaves a comfortable cone, never faster than 3.2 rad/s (so a boss passing behind you swings round smoothly instead of flipping 180 degrees),
  // and any drag on the camera by the player hands it back to them for 1.2 s. Settings (localStorage 'wcam'): assist 0 = no automatic turning, move 0 = no per-move camera responses.
  const CAMS=(()=>{let o={assist:1,move:1};try{const j=JSON.parse(localStorage.getItem('wcam')||'null');if(j)o=Object.assign(o,j)}catch(e){}return o})();
  let yawSet=null,yawMan=0;
  function lockCam(a,dt){const want=a+Math.PI;if(yawSet!==null&&Math.abs(wrapA(S.yaw-yawSet))>.004)yawMan=1.2;
    if(yawMan>0){yawMan-=dt;yawSet=S.yaw;return}
    if(!CAMS.assist){yawSet=S.yaw;return}
    const err=wrapA(want-S.yaw),ae=Math.abs(err),dead=.2;if(ae>dead)S.yaw+=Math.sign(err)*Math.min(ae-dead*.5,Math.min(3.2,1.2+ae*2.4)*dt);yawSet=S.yaw}
  // Per-move camera response: the boss's current attack decides how far back / wider the camera sits, so a charge's path, a flurry's whole sequence or a projectile field stays readable (never a zoom that hides an attack)
  const CAMM={charge:[2.4,6,['ruin','ruincollapse','charge','heavenfall','hangfall','leap','pursuit','dash','march','rend','impaler','doubleimp']],flurry:[1.6,3,['flurry','tempest','severance','hundred','thousand','twineclipse','eclipsecollapse','triple','executioner','brokenadv','maul','twin','risingcrown']],
    barrage:[1.9,3.5,['bladestorm','stormgrid','sunvolley','crownfall','marks','finalsentence','storm','spear','arrows','swordring','crossflame','returning','ashwave','lance','orb','bolt','consecrate','procession']],area:[2.2,4,['worldbreaker','aftershock','sunder','quake','eclipse','requiem','kingsfall','groundbreaker','tidal','spores']]};
  function camMoves(){let d=0,f=0;if(CAMS.move&&state==='fight'&&!ult&&!sv)for(const F of foes){if(F.f.act!=='attack'||!F.f.mv||!F.awake)continue;const id=F.f.mv.id;for(const k in CAMM){const c=CAMM[k];if(c[2].indexOf(id)>=0){const near=Math.hypot(F.f.x-S.x,F.f.z-S.z)<14;if(near){d=Math.max(d,c[0]);f=Math.max(f,c[1])}}}}
    try{CameraRig.combat(d,f)}catch(e){}}
  // AUTO LOCK: the first boss that is awake and alive is locked as soon as you fight it (and the next one when it falls); turning lock off yourself stays off
  function autoLock(){if(lock||lockOff||state!=='fight'||ult||sv||site&&site.duel)return;let b=null,bd=1e9;for(const F of foes){if(F.f.act==='dead'||F.ghost||!F.awake||!F.T.boss)continue;const d=(F.woke||1e6)*1000+Math.hypot(F.f.x-S.x,F.f.z-S.z);if(d<bd){bd=d;b=F}}if(b){lock=true;lockI=b.i;if(el)el.querySelector('#wLock').classList.add('on')}}
  function toggleLock(){
    if(ult&&ult.kind==='echo'){msg('You cannot lock onto illusions',1);return}
    const al=alive();if(!al.length){lock=false}
    else if(!lock){lock=true;lockI=nearest().i}
    else if(al.length>1){const cur=foes[lockI],ord=al.slice().sort((a,b)=>Math.hypot(a.f.x-S.x,a.f.z-S.z)-Math.hypot(b.f.x-S.x,b.f.z-S.z)),k=ord.indexOf(cur);lockI=ord[(k+1)%ord.length].i}
    else lock=false;
    lockOff=!lock;   // the player turned it off on purpose: do not auto-lock again until they turn it on
    if(el)el.querySelector('#wLock').classList.toggle('on',lock)}
  const KEY={Digit1:'ihp',Digit2:'ist',Digit3:'imt',KeyE:'flow',KeyF:'light',KeyG:'heavy',KeyQ:'guard',KeyR:'sup',Space:'dodge',Tab:'lock',KeyZ:'swap'};
  function onKey(e){
    if(!on||e.target&&e.target.tagName==='INPUT')return;const n=KEY[e.code];
    if(e.type==='keydown'){if(n){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)press(n,stamp(e.timeStamp))}else if(e.code==='KeyB'){e.stopImmediatePropagation()}}
    else if(n){if(n==='heavy'||n==='guard')release(n,stamp(e.timeStamp));e.stopImmediatePropagation()}}
  function bind(b,name){
    const holdy=name==='heavy'||name==='guard';
    b.addEventListener('pointerdown',e=>{if(ptr[name]!==undefined)return;e.preventDefault();e.stopPropagation();ptr[name]=e.pointerId;try{b.setPointerCapture(e.pointerId)}catch(_){}b.classList.add('dn');press(name,stamp(e.timeStamp))});
    const up=e=>{if(ptr[name]!==e.pointerId)return;delete ptr[name];b.classList.remove('dn');if(holdy)release(name,stamp(e.timeStamp));e.stopPropagation()};
    b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',up);
    b.addEventListener('contextmenu',e=>e.preventDefault())}
  // ---------- DOM (built once) ----------
  function build(){WardenNet.setHandler(netMsg);
    el=document.createElement('div');el.id='wroot';
    el.innerHTML='<div id="wh"><div class="wb p"><i class="hp"><b></b></i><i class="st"><b></b></i><i class="fl"><b></b></i></div><div class="wb d"><span>The Duelist</span><i class="hp"><b></b></i><i class="po"><b></b></i></div></div><div id="wmsg"></div><div id="wem"></div><button id="wQuit">Leave arena</button><div id="whd" style="position:fixed;left:50%;top:46%;width:0;height:0;pointer-events:none;z-index:50;opacity:0;transition:opacity .5s"><div style="position:absolute;left:-26px;top:-150px;width:0;height:0;border-left:26px solid transparent;border-right:26px solid transparent;border-bottom:54px solid #ff2a1a;filter:drop-shadow(0 0 8px #ff6a2a)"></div></div><div id="whn" style="position:fixed;left:0;right:0;top:34%;text-align:center;pointer-events:none;z-index:50;color:#ffb27a;font:700 15px sans-serif;letter-spacing:.14em;text-shadow:0 0 6px #000,0 0 3px #000;opacity:0;transition:opacity .5s"></div>'+
      '<div id="wc"><button id="wLight">Light</button><button id="wHeavy">Heavy</button><button id="wGuard">Parry</button><button id="wDodge">Dodge</button><button id="wFlow">Flow</button><button id="wIhp" class="wi"><b>\u2764</b><i>3</i></button><button id="wIst" class="wi"><b>\u26A1</b><i>2</i></button><button id="wImt" class="wi"><b>\u2694</b><i>1</i></button><button id="wLock">Lock</button><button id="wJump">Jump</button><button id="wShadow">Shadow</button><button id="wSwap">Twin</button><button id="wSup">Sever</button></div>'+
      '<div id="whint">F light (x3, then G = Tempest) · Guard+Light = Shove · dodge then G = Lunge · G heavy (hold) · Q guard · Space dodge · E flow · R Spirit Sever · 1/2/3 flasks · Tab lock · Z swap to Twin Blades</div>';
    document.body.appendChild(el);
    {const q=el.querySelector('#wQuit'),go=e=>{e.preventDefault();e.stopPropagation();quitArena()};q.addEventListener('pointerdown',e=>e.stopPropagation());q.addEventListener('click',go)}
    bind(el.querySelector('#wLight'),'light');bind(el.querySelector('#wHeavy'),'heavy');bind(el.querySelector('#wGuard'),'guard');bind(el.querySelector('#wDodge'),'dodge');bind(el.querySelector('#wFlow'),'flow');bind(el.querySelector('#wIhp'),'ihp');bind(el.querySelector('#wIst'),'ist');bind(el.querySelector('#wImt'),'imt');flaskUi();bind(el.querySelector('#wLock'),'lock');bind(el.querySelector('#wJump'),'jump');bind(el.querySelector('#wShadow'),'shadow');bind(el.querySelector('#wSwap'),'swap');bind(el.querySelector('#wSup'),'sup');
    addEventListener('keydown',onKey,true);addEventListener('keyup',onKey,true);
    addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',releaseAll);addEventListener('orientationchange',releaseAll)}
  const bars={};
  function setBar(sel,v){const k=Math.round(Math.max(0,Math.min(1,v))*100);if(bars[sel]===k)return;bars[sel]=k;el.querySelector(sel+' b').style.transform='scaleX('+k/100+')'}
  let nameKey='';
  let emK='';
  function hud(){const du=site&&site.duel,dd=PG.S.duel,ek=du?'d'+dd.rating+'|'+dd.w+'|'+dd.l+'|'+dd.streak+(DU.pair?DU.pair.n:''):PG.S.embers+'|'+PG.S.cycle;if(ek!==emK){emK=ek;el.querySelector('#wem').textContent=du?'\u2694 '+PG.rank()+' '+dd.rating+'  \u00b7  W'+dd.w+' L'+dd.l+(dd.streak>1?'  \u00b7  streak '+dd.streak:''):'\ud83d\udd25 '+PG.S.embers+(PG.S.cycle>1?'  \u00b7  Cycle '+PG.S.cycle:'')}setBar('.p .hp',P.hp/P.hpMax);setBar('.p .st',P.st/P.stMax);
    const F=target(),wt=!!(F&&F.wait);if(bars.wt!==wt){bars.wt=wt;el.querySelector('.wb.d').style.display=wt?'none':''}const n=alive().filter(o=>o.awake).length,nk=F?F.T.name+(n>1?' ×'+n:''):'';if(nk!==nameKey){nameKey=nk;el.querySelector('.wb.d span').textContent=nk}
    if(F){setBar('.d .hp',F.f.hp/F.f.hpMax);setBar('.d .po',F.f.po/F.f.poMax);const brk=F.f.act==='stun'&&F.f.sk==='stagger';if(bars.brk!==brk){bars.brk=brk;el.querySelector('.wb.d').classList.toggle('brk',brk)}}
    const c=P.act==='charge'?Math.min(1,P.c/Moves.heavy.chargeMax)*360:0,r=Math.round(c/6);if(bars.chg!==r){bars.chg=r;el.querySelector('#wHeavy').style.setProperty('--chg',r*6+'deg')}}
  let hdT=0;
  const MV={shove:'shield shove',lunge:'lunge',whirl:'tempest',martelo:'axe kick',rasteira:'sweep kick',light:'slash',heavy:'heavy blow',thrust:'thrust',bash:'shield bash',quake:'ground slam',orb:'fire orb',bolt:'lightning bolt',leap:'leaping strike',fall:'falling blow',dash:'charge',riposte:'riposte',twin:'twin slash',sweep:'sweep',slam:'slam',triple:'triple strike',spin:'storm spin',hammer:'axe kick',lowsweep:'low sweep'};
  function hitFrom(A,mv){   // which enemy / move hurt you and from where (screen arrow)
    const d=el.querySelector('#whd'),n=el.querySelector('#whn');if(!A||!d)return;
    const dx=A.f.x-S.x,dz=A.f.z-S.z,y=S.yaw,fw=-Math.sin(y)*dx-Math.cos(y)*dz,rt=Math.cos(y)*dx-Math.sin(y)*dz;
    d.style.transition='none';d.style.transform='rotate('+(Math.atan2(rt,fw)*57.3)+'deg)';d.style.opacity=1;void d.offsetWidth;d.style.transition='opacity .7s';d.style.opacity=0;
    n.textContent=(A.T.name+' · '+(A.T.ai==='archer'&&(mv==='bolt'||mv==='orb')?(mv==='orb'?'heavy arrow':'arrow'):(MV[mv]||mv||''))).toUpperCase();n.style.transition='none';n.style.opacity=1;void n.offsetWidth;n.style.transition='opacity 1.2s .5s';n.style.opacity=0}
  function msg(t,sec){const m=el.querySelector('#wmsg');m.textContent=t;m.classList.add('on');msgT=sec||1.4}
  // ---------- bodies (avatars + models) and weapons ----------
  const pool={};     // foe type id -> [body]  (reused between fights; hidden when free)
  let netT=0;function netWarn(why){const t=performance.now();if(t-netT>20000&&el){netT=t;try{msg('Models failed to load ('+(why||'network')+') - retrying',3)}catch(e){}}}
  function attachSword(av,file,len,slot,fixed,hn){
    hn=hn||'RightHand';const u=av&&av.userData;if(!u||!u.bones||!u.bones[hn]||!THREE.GLTFLoader)return null;const st={ready:false,grip:null,hand:u.bones[hn],len:slot.len,want:len,av,fixed};
    const go=n=>new THREE.GLTFLoader().load('assets/'+(file.indexOf('/')>=0?file:'warden/'+file),g=>{if(st.dead)return;const grip=new THREE.Group(),m=g.scene;m.traverse(o=>{if(o.isMesh){o.castShadow=false;o.frustumCulled=false}});grip.add(m);st.hand.add(grip);st.grip=grip;st.ready=true;setGrip(st);grip.visible=on},()=>{},()=>{netWarn();if(!st.dead)setTimeout(()=>go(n+1),Math.min(8000,1500*(n+1)))});go(0);
    return st}
  function setGrip(st,g){
    if(!st||!st.grip)return;g=g||GRIP;const hand=st.hand,ws=new THREE.Vector3();st.av.updateMatrixWorld(true);hand.getWorldScale(ws);st.grip.scale.setScalar(st.want/(st.len*ws.x));
    if(st.fixed){const f=st.fixed;st.grip.quaternion.setFromEuler(new THREE.Euler(f[0],f[1],f[2]));st.grip.position.set(f[3]||0,f[4]||0,f[5]||0).divideScalar(ws.x);return}
    const kid=hand.children.find(c=>c!==st.grip&&c.position.lengthSq()>0);const v=kid?kid.position.clone().normalize():new THREE.Vector3(0,1,0);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v);q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(g.rx,g.ry,g.rz)));st.grip.quaternion.copy(q);
    st.grip.position.set(g.ox,g.oy,g.oz).divideScalar(ws.x)}
  function makeShield(){   // a plain kite shield (extruded outline, ~0.55 x 0.8 m) - the Knight drops it at half health
    const sh=new THREE.Shape();sh.moveTo(0,.4);sh.lineTo(.28,.32);sh.lineTo(.28,-.05);sh.quadraticCurveTo(.2,-.32,0,-.44);sh.quadraticCurveTo(-.2,-.32,-.28,-.05);sh.lineTo(-.28,.32);sh.closePath();
    const g=new THREE.Group(),m=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:.05,bevelEnabled:true,bevelSize:.015,bevelThickness:.015,bevelSegments:1}),new THREE.MeshStandardMaterial({color:'#6a6f7d',metalness:.4,roughness:.55}));
    const bs=new THREE.Mesh(new THREE.SphereGeometry(.07,10,8),new THREE.MeshStandardMaterial({color:'#b8964a',metalness:.6,roughness:.4}));bs.position.set(0,.05,.09);g.add(m);g.add(bs);return g}
  function attachShield(b){const hand=b.u.bones&&b.u.bones.LeftForeArm;if(!hand)return;const sh=makeShield(),ws=new THREE.Vector3();b.g.updateMatrixWorld(true);hand.getWorldScale(ws);
    const w=new THREE.Group();w.add(sh);w.scale.setScalar(1/ws.x);w.position.set(0,12,-9);hand.add(w);b.shield=w}
  function styleBody(b){   // once the model exists: colour it for its type; weapons
    if(b.styled||!b.u.model)return;b.styled=true;const T=b.T;
    if(T.body==='avatar'&&T.tint!==undefined&&T.tint!==1)b.u.model.traverse(c=>{if(c.isSkinnedMesh&&c.material&&c.material.color){c.material.userData.c0=c.material.color.clone();c.material.color.copy(c.material.userData.c0).multiply(new THREE.Color(T.tint,T.tint*(T.tint<1?.7:1),T.tint*(T.tint<1?.75:1)))}});
    if(T.sword&&!b.sword)b.sword=attachSword(b.g,T.sword.f,T.sword.len,{len:T.sword.l0,set tried(v){}},T.grip);
    if(T.sword2&&T.sword&&!b.sword2)b.sword2=attachSword(b.g,T.sword.f,T.sword.len,{len:T.sword.l0,set tried(v){}},T.grip2,'LeftHand');
    if(T.shield&&!b.shield)attachShield(b)}
  function glbLoad(b,T,n){n=n||0;if(n===0)setTimeout(()=>{if(!b.ready)placeholder(b,T)},2500);   // a failed download is retried until it works (gaps grow to 8 s; retries bypass the HTTP cache so a bad cached copy cannot stick): a flaky connection must never leave a boss or guard invisible for the rest of the session
    fetch('assets/warden/'+(b.file||T.file)+'.glb',n>0?{cache:'reload'}:undefined).then(r=>{if(!r.ok)throw new Error('http '+r.status);return r.arrayBuffer()}).then(buf=>{if(buf.byteLength<64||new Uint32Array(buf,0,1)[0]!==0x46546C67)throw new Error('not a glb ('+buf.byteLength+' B)');return new Promise((res,rej)=>new THREE.GLTFLoader().parse(buf,'assets/warden/',res,rej))}).then(gl=>{
      const m=new THREE.Group();m.scale.setScalar(.01);m.add(gl.scene);b.g.add(m);const bones={},seen=new Set();
      gl.scene.traverse(o=>{if(o.isBone)bones[o.name.replace('mixamorig','')]=o;if(o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=true;for(const mt of [].concat(o.material))if(!seen.has(mt)){seen.add(mt);if(T.bright)mt.color.multiplyScalar(T.bright)}}});
      b.u.mixer=new THREE.AnimationMixer(gl.scene);b.u.bones=bones;b.u.model=gl.scene;b.ready=true;if(b.fb)b.fb.visible=false}).catch(e=>{b.err=String(e&&e.message||e);netWarn(b.err);placeholder(b,T);setTimeout(()=>{if(!b.ready){b.err=null;glbLoad(b,T,n+1)}},Math.min(8000,1500*(n+1)))})}
  // while a model is still downloading (or keeps failing) the foe is a plain capsule figure, so you can always see what you are fighting
  function placeholder(b,T){if(b.fb||b.ready||typeof makeAvatar!=='function')return;try{const a=makeAvatar(T.name,T.boss?'#5a1c1c':'#6a3a2a');for(const c of a.children.slice())if(c.isSprite)a.remove(c);a.scale.setScalar(T.scale||1);b.fb=a;b.g.add(a)}catch(e){}}
  // a copy of an already-loaded model (Phantom Barrage clones): shares the geometry/textures, has its own skeleton + mixer, and needs no second download (that download was what left a capsule placeholder on them)
  function cloneBody(b,from){
    const cm=THREE.SkeletonUtils.clone(from.u.model),m=new THREE.Group(),bones={};m.scale.setScalar(.01);m.add(cm);b.g.add(m);
    cm.traverse(o=>{if(o.isBone){bones[o.name.replace('mixamorig','')]=o;for(const c of o.children.slice())if(!c.isBone)o.remove(c)}if(o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=true}});   // weapon/shield groups on the source's bones are dropped: styleBody attaches this body's own
    b.u.mixer=new THREE.AnimationMixer(cm);b.u.bones=bones;b.u.model=cm;b.ready=true}
  function body(T,v,from){
    const key=T.id+(T.files?':'+(v%T.files.length):''),L=pool[key]||(pool[key]=[]),f=L.find(b=>!b.used);if(f){f.used=true;f.g.visible=true;if(!f.ready&&f.T.body!=='avatar'&&!f.err)glbLoad(f,f.T,0);return f}
    const b={T,used:true,anims:{},sword:null,sword2:null,shield:null,styled:false,ready:false,flashOn:false,file:T.files?T.files[v%T.files.length]:T.file};
    if(T.body==='avatar'){const g=makeAvatar(T.name,'#3a2a2a');for(const c of g.children.slice())if(c.isSprite)g.remove(c);scene.add(g);dress(g,T.dress||0);b.g=g;b.u=g.userData;b.ready=true}
    else{const g=new THREE.Group();g.name=T.name;scene.add(g);b.g=g;b.u=g.userData;b.u.mixer=null;b.u.bones={};let ok=false;if(from&&from.ready&&from.u.model&&THREE.SkeletonUtils)try{cloneBody(b,from);ok=true}catch(e){}if(!ok)glbLoad(b,T)}
    L.push(b);return b}
  function freeBody(b){b.used=false;b.g.visible=false;if(b.anims)for(const k in b.anims)b.anims[k].off();for(const k of['sword','sword2','shield'])if(b[k]){const o=b[k].grip||b[k];if(o)o.visible=false}}
  // ---------- fight lifecycle ----------
  function spawnFoes(){wokeN=0;
    for(const F of foes)freeBody(F.body);foes=[];byId={};
    const ids=Foes.ids(site.foes.length);
    site.foes.forEach((def,i)=>{
      const T=site.duel&&DU.pair?duelT():Foes.TYPES[def.t],id=ids[i],hum=!!T.human,Ld=hum?duelSide():0,f=C.F[id]=CombatCore.mkFighter(id,{x:WRD.x+site.x+(hum?0:def.dx),z:WRD.z+site.z+(hum?-9*Ld:def.dz),face:hum&&Ld<0?0:Math.PI,hp:hum?100:Math.round(T.hp*foeMul().hp),team:'e',sa:!hum&&(T.sa||WardenProg.cycleMul().sa)?1:0,dm:hum?1:(T.dm||1)*foeMul().dm,rm:T.rm||1,pg:!hum&&T.boss?.5:0,rise:!hum&&T.boss&&T.rise?1:0,tm:hum?1:(T.tm||1)});
      if(!C.order.includes(id))C.order.push(id);f.r=T.r;f.spd=(T.spd||1.3)*WardenProg.cycleMul().spd;
      const b=body(T,i);b.g.scale.setScalar(T.scale);b.g.position.set(f.x,H(f.x,f.z),f.z);b.g.rotation.y=f.face;
      if(b.u.mixer&&typeof emoStop==='function'&&T.body==='avatar')emoStop(b.u);
      const F={i,id,T,f,body:b,human:hum,ai:DuelistAI.create(fightN*7919+i*131+1,{foe:T.ai,kid:T.id,mast:mastery&&!hum,intro:T.pack?25:75}),loco:{x:0,z:0,vf:0,vs:0,sp:0,init:false},flash:0,awake:!T.aggro&&!def.late,woke:(!T.aggro&&!def.late)?(wokeN=wokeN+1):0,late:!!def.late,dorm:T.aggro||def.late?'sleep':null,dormSync:null,wakeT:0,ph2:false,home:{x:f.x,z:f.z}};
      if(site.duel&&!DU.pair){F.wait=true;f.act='dead';f.hp=0;b.g.visible=false}   // no bot in the duel arena: until an opponent walks in there is only an empty ring
      foes.push(F);byId[id]=F});
    rt(site).foes=foes}
  function startFight(){
    killDecoy(true);jumpCd=shCd=0;oathFirst=null;fightN++;hurt=false;fightVo=false;try{WardenSfx.load()}catch(e){}const R=site.wall?site.R-.5:site.dg?site.R-.3:site.R+10,sol=WardenSolids().filter(s=>Math.hypot(s.x-WRD.x-site.x,s.z-WRD.z-site.z)<site.R+14);
    C=CombatCore.create({arena:{x:WRD.x+site.x,z:WRD.z+site.z,R},solids:sol});try{CameraRig.setArena({x:WRD.x+site.x,z:WRD.z+site.z,R:site.wall||site.dg?R:site.R,sol:sol.filter(q=>!q.wall)})}catch(e){}ST=CombatCore.stepper(C,6);t0=performance.now();vt=0;vl=0;tsc=1;ult=null;
    if(site.duel&&DU.pair){const L=duelSide();S.x=WRD.x+site.x;S.z=WRD.z+site.z+9*L;S.rot=L>0?Math.PI:0;lx=S.x;lz=S.z}
    P=C.add('P',{x:S.x,z:S.z,face:S.rot,hp:100,team:'p'});applyStats();spawnFoes();sup=Math.max(sup,20);WardenFx.clear();WardenVfx.clear();for(const F of foes)if(F.T.ai==='saint')try{WardenFx.orbit(F,6)}catch(e){};trapsClear();blinkRing(0,0,false);Q=null;spectate=false;ls=null;ds=null;pin=null;try{zonesClear();mirrorsClear()}catch(e){}netStarts=[];if(NET.mode==='guest'||NET.mode==='host'&&NET.joined)netAddQ();
    flow=0;flowOn=false;flowN=0;fq=null;skillCD=0;bars.fl=-1;healLeft=0;mightT=0;itemLock=0;state='fight';stateT=0;lockOff=false;lock=(site.fog||site.duel||foes.some(F=>F.T.boss))&&!(site.duel&&!DU.pair);lockI=0;{const b=foes.find(F=>F.T.boss&&F.awake)||foes.find(F=>F.awake);if(b)lockI=b.i}lastEv=[];pv.init=false;down.guard=down.heavy=false;stW=0;gT=0;
    if(el)el.querySelector('#wLock').classList.toggle('on',lock);D=target().f}
  // Inside a walled arena the screen is the cost on a low-end phone: render at 1.25x (not 2x) while you fight, restore on leaving. Skipped when ?dpr= was given.
  let resPrev=null;
  function arenaRes(inn){if(typeof Perf==='undefined'||!Perf.state||!Perf.state.r||Perf.state.fixed)return;const st=Perf.state;
    if(inn&&resPrev===null){resPrev={dpr:st.dpr,min:st.min,locked:st.locked};st.min=1;if(st.dpr>1.25){st.dpr=1.25;st.r.setPixelRatio(1.25)}st.locked=true}
    else if(!inn&&resPrev){st.min=resPrev.min;st.locked=resPrev.locked;if(st.dpr!==resPrev.dpr){st.dpr=resPrev.dpr;st.r.setPixelRatio(resPrev.dpr)}resPrev=null}}
  function ensureAvatars(){
    if(!pAnim&&me.userData.mixer)pAnim=WardenMX.make(me.userData,pRole());
    if(!sword&&!swordTried&&me.userData.bones){swordTried=true;{const WT=WardenGear.TYPES[WardenGear.equipped().ty];sword=attachSword(me,WT.file,WT.want,{len:WT.l0,set tried(v){swordTried=v}})}}
    if(sword&&!sword2&&sty&&sty.dual&&me.userData.bones&&me.userData.bones.LeftHand){const WT=WardenGear.TYPES[WardenGear.equipped().ty];sword2=attachSword(me,WT.file,WT.want,{len:WT.l0},null,'LeftHand')}
    syncWeapons();
    if(sword2&&!(sty&&sty.dual)){sword2.dead=true;try{if(sword2.grip&&sword2.grip.parent)sword2.grip.parent.remove(sword2.grip)}catch(e){}sword2=null}
    for(const F of foes){const b=F.body;if(!b.u.mixer)continue;styleBody(b);if(!b.anims[F.T.role])b.anims[F.T.role]=WardenMX.make(b.u,F.T.role);F.anim=b.anims[F.T.role]}}
  function engage(s){stance='main';swapCd=0;
    try{if(typeof loadEmotes==='function')loadEmotes().catch(()=>{})}catch(e){}   // the 'playdead' fall clip lives in the emote library: without it corpses (and you) just stand there
    if(on)return;if(!el)build();if(typeof loadEmotes==='function')loadEmotes().catch(()=>{});WardenFx.build();WardenVfx.build();WardenMX.fetch(pRole(),me.userData.av).catch(()=>{});WardenMX.fetch('player_twin',me.userData.av).catch(()=>{});
    site=s;fightN=0;mastery=!!(s.mast&&PG.S.mast&&PG.S.mast[s.id]);const hh=WardenNet.hostFor(s.id);NET.joined=false;startFight();if(s.duel){}else if(hh)netJoin();else netHost();for(const F of foes)WardenMX.fetch(F.T.role).catch(()=>{});
    lx=S.x;lz=S.z;on=true;if(mastery)setTimeout(()=>{if(on)msg('MASTERY REMATCH',2.4)},500);document.body.classList.add('warden-fight');document.body.classList.toggle('warden-duel',!!s.duel);ensureAvatars();if(sword&&sword.grip)sword.grip.visible=true;if(sword2&&sword2.grip)sword2.grip.visible=true;
    for(const F of foes)for(const k of['sword','sword2','shield'])if(F.body[k]){const o=F.body[k].grip||F.body[k];if(o)o.visible=true}
    arenaRes(true);msg(s.n+(typeof WardenKind==='function'?' · '+WardenKind(s).tag:''),2.2);try{if(s.fog)WardenIsles.fog(s.id,'sealed')}catch(e){}}
  // Who am I fighting? With 2+ foes alive a ring + chevron marks the one your swings go to (red while it winds up an attack), and any OTHER foe that is mid-attack gets a small red ring at its feet.
  let tmk=null;const thr=[];
  function mkMat(c){return new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.85,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide})}
  function markers(TF,t){
    const multi=on&&state==='fight'&&alive().filter(o=>o.awake).length>1;
    if(!tmk&&multi){const g=new THREE.Group(),m=mkMat(0xffd25a);const r=new THREE.Mesh(new THREE.RingGeometry(.62,.8,28),m);r.rotation.x=-Math.PI/2;r.renderOrder=998;g.add(r);
      const c=new THREE.Mesh(new THREE.ConeGeometry(.26,.5,4),m);c.rotation.x=Math.PI;c.renderOrder=998;g.add(c);g.userData={r,c,m};scene.add(g);tmk=g}
    if(tmk){tmk.visible=!!multi;if(multi){const f=TF.f,sc=TF.T.scale||1,u=tmk.userData;tmk.position.set(f.x,H(f.x,f.z)+.08,f.z);const pu=1+.06*Math.sin(t*6);u.r.scale.setScalar(sc*pu);u.c.position.y=2.35*sc+.18*Math.sin(t*6);
      u.m.color.setHex(f.act==='attack'?0xff4a3a:0xffd25a)}}
    let n=0;
    if(multi)for(const F of foes){if(F===TF||F.f.act!=='attack')continue;let g=thr[n];if(!g){g=new THREE.Mesh(new THREE.RingGeometry(.5,.66,24),mkMat(0xff3a2a));g.rotation.x=-Math.PI/2;g.renderOrder=997;scene.add(g);thr[n]=g}
      g.visible=true;g.position.set(F.f.x,H(F.f.x,F.f.z)+.07,F.f.z);g.scale.setScalar((F.T.scale||1)*(1+.1*Math.sin(t*14)));n++}
    for(let i=n;i<thr.length;i++)thr[i].visible=false}
  // Off-screen warning (from how other action games keep crowds fair): a red arrow on the screen edge for any foe that is winding up an attack but is outside your view.
  const thA=[];let thCss=false;
  const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
  function threatArrows(){
    if(!thCss){thCss=true;try{const c=document.createElement('style');c.textContent='.wthr{position:fixed;left:50%;top:50%;width:0;height:0;z-index:6;pointer-events:none;display:none}.wthr i{position:absolute;left:-14px;top:-40vh;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:26px solid #ff3a2a;filter:drop-shadow(0 0 6px #f00);animation:wthp .35s infinite alternate}@keyframes wthp{to{opacity:.45}}';document.head.appendChild(c)}catch(e){}}
    let n=0;
    if(on&&state==='fight')for(const F of foes){if(F.f.act!=='attack')continue;const dx=F.f.x-S.x,dz=F.f.z-S.z,rel=wrapA(Math.atan2(-dx,-dz)-S.yaw);if(Math.abs(rel)<.75)continue;   // inside the view cone: the red ring already shows it
      let a=thA[n];if(!a){a=document.createElement('div');a.className='wthr';a.innerHTML='<i></i>';document.body.appendChild(a);thA[n]=a}
      a.style.display='block';a.style.transform='rotate('+(rel*57.3)+'deg)';n++}
    for(let i=n;i<thA.length;i++)thA[i].style.display='none'}
  // Camera framing: with 2+ awake foes and no lock, ease the camera yaw so both stay in view (unless you are dragging the camera yourself).
  function frameFoes(dt){
    if(ult&&ult.kind==='echo'){try{CameraRig.setFocus(null)}catch(e){}return}   // the camera must not lean toward the real one
    try{const D0=target().f,fd=Math.hypot(D0.x-S.x,D0.z-S.z);CameraRig.setFocus(P.act!=='dead'&&alive().some(F=>F.awake)&&fd>2?{x:D0.x,z:D0.z,k:lock?Math.min(.3,.12+fd*.018):.34,y:Math.min(1.6,Math.max(0,(((target().T||{}).scale)||1)-1.2)*1.8)}:null)}catch(e){}   // look a third of the way toward the foe: you stay low in the frame, the opponent sits in the middle
    if(ult)return;if(lock||P.act==='dead')return;const al=alive().filter(F=>F.awake);if(!al.length||performance.now()-(S._lk||0)<1500)return;
    let worst=0,sum=0;for(const F of al){const r=wrapA(Math.atan2(-(F.f.x-S.x),-(F.f.z-S.z))-S.yaw);worst=Math.max(worst,Math.abs(r));sum+=r}
    if(worst<(al.length>1?.9:.45))return;S.yaw+=sum/al.length*Math.min(1,dt*2.2)}
  // ---- telegraphs (rules from the telegraph research: an animation cue + a flash on the weapon + a sound at the start, a second glint right before the blow lands; heavy / committed attacks are bigger and red) ----
  function telegraph(A,mv){
    const m=Moves[mv];if(!m||!A||!A.f)return;const q=A.f,heavy=(m.dmg||0)>=22||!!m.gb||/fall|slam|leap|quake|bash|rain/.test(mv),tell=(Moves.tells(mv,0)[0]||20),sc=A.T.scale||1;
    const fl=()=>{if(!on||q.act==='dead')return;WardenVfx.spawn(q.x+Math.sin(q.face)*.8,H(q.x,q.z)+1.5*sc,q.z+Math.cos(q.face)*.8,heavy?3:0,3,(heavy?2.6:1.5)*Math.min(1.6,sc),Math.random()*6.28,34)};
    fl();setTimeout(fl,Math.max(90,tell/60*1000-120));
    try{if(heavy)tone(120,360,.24,'sawtooth',.08);else tone(1100,1600,.05,'square',.035)}catch(e){}}
  // ================= PHANTOM BARRAGE (boss set piece; see Barrage.js) =================
  // The boss pulls you to the arena centre, two phantom copies appear, all three lunge at once in bullet time and a ring counts down to the dodge. Perfect = all three whiff and the boss reels; miss = all three land (~half your health).
  // Everything runs on the REAL sim (the phantoms are fighters that die when it ends), so the dodge i-frames, hit events, animations and telegraphs are the normal ones. Solo only (the phantoms are not networked).
  let barEl=null;
  function barUI(){
    if(barEl)return barEl;
    try{const c=document.createElement('style');c.textContent='#wbarr{position:fixed;inset:0;z-index:44;pointer-events:none;display:none}#wbarr .vg{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(20,0,40,0) 30%,rgba(34,0,70,.8) 100%);opacity:0;transition:opacity .5s}#wbarr.on .vg{opacity:1}#wbarr .tx{position:absolute;left:0;right:0;top:19%;text-align:center;font:900 8.5vmin/1 system-ui;color:#fff;letter-spacing:.08em;text-shadow:0 0 22px #a050ff,0 0 5px #000;opacity:0;transition:opacity .2s}#wbarr .tx.on{opacity:1}#wbarr .rg{position:absolute;left:50%;top:60%;border-radius:50%;transform:translate(-50%,-50%);box-sizing:border-box;opacity:0}#wbarr .rt{border:.9vmin solid rgba(255,255,255,.85);width:14vmin;height:14vmin}#wbarr .rs{border:1.2vmin solid #ffd25a;box-shadow:0 0 3vmin #ffd25a}#wbarr .rs.go{border-color:#5aff9a;box-shadow:0 0 4vmin #5aff9a}#wbarr .rr{position:absolute;left:0;right:0;top:34%;text-align:center;font:900 11vmin/1 system-ui;text-shadow:0 0 26px currentColor,0 0 5px #000;opacity:0;transition:opacity .15s}#wbarr .rr.on{opacity:1}#wbarr .ec{position:absolute;left:0;right:0;top:13%;text-align:center;font:800 5vmin/1 system-ui;color:#fff;letter-spacing:.06em;text-shadow:0 0 14px #7a3cff,0 0 4px #000;opacity:0;transition:opacity .2s}#wbarr .ec.on{opacity:1}#wDodge.pulse{animation:wdp .22s infinite alternate;box-shadow:0 0 0 1vmin #ffd25a,0 0 6vmin #ffd25a !important}@keyframes wdp{to{transform:scale(1.14)}}';document.head.appendChild(c);
      barEl=document.createElement('div');barEl.id='wbarr';barEl.innerHTML='<div class="vg"></div><div class="tx">TAP DODGE ➜</div><div class="rg rt"></div><div class="rg rs"></div><div class="rr"></div><div class="ec"></div>';document.body.appendChild(barEl)}catch(e){}
    return barEl}
  const bq=s=>barEl&&barEl.querySelector(s);
  function addGhost(B,k,x,z,tag){
    const T=Object.assign({},B.T,{id:B.T.id+'~'+(tag||'ph'),boss:false,ghost:true,name:tag==='ec'?B.T.name:'Phantom',ph2:'',sa:false,aggro:undefined,barrage:false,echo:false}),id=['x','y','w','v','u'][k];   // own pool key: the tinted bodies never come back as a real foe
    const f=C.F[id]=CombatCore.mkFighter(id,{x,z,face:0,hp:99999,team:'e',dm:1,rm:T.rm||1,pg:0});if(!C.order.includes(id))C.order.push(id);f.r=T.r;f.spd=T.spd||1.3;
    const b=body(T,k+1,B.body);b.g.scale.setScalar(T.scale);b.g.position.set(x,H(x,z),z);
    const F={i:foes.length,id,T,f,body:b,human:false,ai:DuelistAI.create(77+k,{foe:T.ai,intro:0}),loco:{x:0,z:0,vf:0,vs:0,sp:0,init:false},flash:0,awake:true,late:false,dorm:null,dormSync:null,wakeT:0,ph2:false,home:{x,z},ghost:true,script:true,gt:0};
    foes.push(F);byId[id]=F;return F}
  function rmGhost(F){delete C.F[F.id];const k=C.order.indexOf(F.id);if(k>=0)C.order.splice(k,1);freeBody(F.body);const j=foes.indexOf(F);if(j>=0)foes.splice(j,1);delete byId[F.id];foes.forEach((q,n)=>{q.i=n})}
  function ghostLook(F){   // violet, see-through: cloned materials so the real boss is untouched
    if(F.gt>2||!F.body.g)return;F.gt+=.01;let n=0;F.body.g.traverse(o=>{if(o.isMesh&&o.material&&!o.userData.gh){o.userData.gh=1;n++;const m=[].concat(o.material).map(q=>{const c=q.clone();c.transparent=true;c.opacity=.58;c.depthWrite=false;if(c.color)c.color.lerp(new THREE.Color(0x7a3cff),.55);if(c.emissive)c.emissive.setHex(0x3a1088);return c});o.material=Array.isArray(o.material)?m:m[0]}});if(n)F.gt=3}
  // ---- Barrage camera: driven by the fight's phase, not a fixed timeline, so it always shows you + the boss + both clones, then hands back to the normal rig ----
  // Behind-and-above you, looking along the lunge so the three attack lines converge on you; it eases in (from wherever the gameplay camera was), pushes in as the dodge window nears, shakes on impact,
  // and pulls back at the end (CineCam then blends the last 0.5 s into the normal camera).
  let bc=null,lanes=null;
  const cl=(v,a,b)=>Math.max(a,Math.min(b,v)),mixn=(a,b,u)=>a+(b-a)*u;
  function barLanes(on){   // three ground strips from each attacker to you: the attack directions, red-hot when the dodge window opens
    if(!on){if(lanes){for(const l of lanes)scene.remove(l);lanes.forEach(l=>{l.material.dispose()});lanes=null}return}
    if(lanes)return;if(!THREE.PlaneGeometry)return;const geo=barLanes.g||(barLanes.g=new THREE.PlaneGeometry(1,1));lanes=[];
    for(let k=0;k<4;k++){const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xc08aff,transparent:true,opacity:0,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,fog:false,side:THREE.DoubleSide}));m.rotation.order='YXZ';m.renderOrder=7;m.frustumCulled=false;m.visible=false;scene.add(m);lanes.push(m)}}
  function lanesTick(tk,ph){
    if(!lanes||!ult)return;const n=ult.all.length;
    for(let k=0;k<4;k++){const l=lanes[k],F=ult.all[k];if(!F||k>=n||ph==='out'){l.visible=false;continue}
      const T=ult.sl[ult.roles[k]],dx=T.x-F.f.x,dz=T.z-F.f.z,L=Math.hypot(dx,dz);if(L<.3){l.visible=false;continue}
      l.visible=true;l.position.set(F.f.x+dx/2,H(T.x,T.z)+.14,F.f.z+dz/2);l.rotation.set(-Math.PI/2,0,0);l.rotation.y=Math.atan2(dx,dz);l.scale.set(.75,L,1);
      const hot=cl((tk-4)/18,0,1),go=Barrage.inWindow(tk);l.material.color.setHex(go?0xffe27a:hot>.6?0xff3a3a:0xc08aff);l.material.opacity=ph==='pop'?.5:(.35+.3*hot)*(go?1:.85+.15*Math.sin(performance.now()/60))}}
  // RISE CINEMATIC: the felled boss lies still, the camera sinks to the ground beside it, circles in, then cranes up as it stands (5 s, matches CombatCore RISE)
  function riseCine(T){
    try{
      if(ult||CineCam.busy()||P.act==='dead')return;
      if(foes.some(o=>o!==T&&o.f.act!=='dead'&&o.T.boss))return;
      const t0=performance.now(),h0=1.75*T.T.scale,a0=Math.atan2(S.x-T.f.x,S.z-T.f.z);
      const ease=u=>u*u*(3-2*u),seg=(t,a,b)=>ease(cl((t-a)/(b-a),0,1));
      CineCam.PRESETS.rise={dur:4.9,freeze:false,noskip:true,shots:[]};
      const drive=()=>{
        const t=(performance.now()-t0)/1000,bx=T.f.x,bz=T.f.z,gy=H(bx,bz);
        const u1=seg(t,0,2.2),u2=seg(t,2.2,3.9),u3=seg(t,3.9,4.9);
        // 0-2.2 s low circling push-in on the fallen boss; 2.2-3.9 s drop to the dirt and tilt up as it stirs; 3.9-4.9 s crane back to reveal the full height
        const ang=a0+mixn(.9,-.2,u1)+mixn(0,-.35,u2)+mixn(0,.5,u3);
        const d=(mixn(9.5,6.2,u1)-mixn(0,2.4,u2)+mixn(0,9.5,u3))*Math.max(1,T.T.scale*.8);
        const cy=gy+h0*(mixn(.55,.18,u1)-mixn(0,.1,u2)+mixn(0,.8,u3));
        const ly=gy+h0*(mixn(.12,.15,u1)+mixn(0,.5,u2)+mixn(0,.25,u3));
        const sh=t>2.6&&t<4.2?Math.sin(t*38)*.035*(1-Math.abs(t-3.4)/.9):0;
        return{px:bx+Math.sin(ang)*d+sh,py:Math.max(cy,H(bx+Math.sin(ang)*d,bz+Math.cos(ang)*d)+.5),pz:bz+Math.cos(ang)*d,lx:bx,ly:ly,lz:bz,fov:mixn(54,46,u1)+mixn(0,16,u2)-mixn(0,6,u3)}};
      CineCam.play('rise',{x:()=>T.f.x,z:()=>T.f.z,h:h0,drive},{force:true});
    }catch(x){}}
  function barCam(){
    const U=ult,rn=performance.now();
    if(!bc){bc={t:rn,p:camera.position.clone(),l:camera.position.clone().add(new THREE.Vector3(0,0,-8).applyQuaternion(camera.quaternion)),fov:camera.fov,sh:0,hits:0,res:null,lastP:{x:S.x,z:S.z}}}
    const dt=cl((rn-bc.t)/1000,0,.1);bc.t=rn;
    let px=S.x,pz=S.z,cx=px,cz=pz,fov=bc.fov,d=6.2,h=2.8,side=.45,look=.45,ly=1.25,kp=5,kl=7;
    if(U){
      let ax=0,az=0;for(const F of U.all){ax+=F.f.x;az+=F.f.z}ax/=U.all.length;az/=U.all.length;bc.ax=ax;bc.az=az;
      const tk=U.ph==='wind'?C.tick-U.T0:0;bc.hits=U.hits;
      if(U.ph==='pop'){const u=cl(U.t/Barrage.POP,0,1);d=mixn(7.6,6.8,u);h=3.2;side=.7;look=.5;fov=mixn(64,60,u);kp=3.2;kl=5}
      else if(U.ph==='wind'){const u=cl(tk/22,0,1),e=u*u*(3-2*u);d=mixn(6.8,5.6,e);h=mixn(3.2,2.5,e);side=mixn(.7,.5,e);look=mixn(.5,.3,e);ly=mixn(1.25,1.4,e);fov=mixn(60,54,e);kp=6;kl=9}
      else{const u=cl(U.t2/.9,0,1);d=mixn(5.6,7.4,u);h=mixn(2.5,3.0,u);side=mixn(.5,.4,u);look=.45;fov=mixn(54,62,u);kp=4}
      if(U.res&&bc.res!==U.res){bc.res=U.res;bc.sh=U.res==='perfect'?.55:1}
      const tk2=tk;try{lanesTick(tk2,U.ph)}catch(e){}
      const mx=U.co&&Q?(S.x+Q.x)/2:px,mz=U.co&&Q?(S.z+Q.z)/2:pz;cx=mixn(mx,ax,look);cz=mixn(mz,az,look);
      // behind you, along the line from the attackers through you, swung a little to one side
      const aw=Math.atan2(px-ax,pz-az)+side;px=S.x+Math.sin(aw)*d;pz=S.z+Math.cos(aw)*d}
    else{px=bc.p.x;pz=bc.p.z;kp=0;kl=0}   // barrage over, shot held while CineCam blends back to the rig
    const A=C&&C.arena;if(A){const ex=px-A.x,ez=pz-A.z,r=Math.hypot(ex,ez),lim=A.R-.5;if(r>lim){px=A.x+ex/r*lim;pz=A.z+ez/r*lim}}   // never outside the ring / behind the walls
    const gy=H(px,pz),py=Math.max(gy+h,gy+.7);
    const kP=1-Math.exp(-dt*kp),kL=1-Math.exp(-dt*kl);
    bc.p.x+=(px-bc.p.x)*kP;bc.p.y+=(py-bc.p.y)*kP;bc.p.z+=(pz-bc.p.z)*kP;
    bc.l.x+=(cx-bc.l.x)*kL;bc.l.y+=(H(cx,cz)+ly-bc.l.y)*kL;bc.l.z+=(cz-bc.l.z)*kL;bc.fov+=(fov-bc.fov)*(1-Math.exp(-dt*5));
    bc.sh*=Math.exp(-dt*5);const q=bc.sh*.22,tt=rn/1000;
    return{px:bc.p.x+Math.sin(tt*61)*q,py:bc.p.y+Math.sin(tt*47+1)*q,pz:bc.p.z+Math.cos(tt*53)*q,lx:bc.l.x,ly:bc.l.y,lz:bc.l.z,fov:bc.fov}}
  function startBarrage(B,opt){
    const A=C.arena,co=opt?!!opt.co:!!(Q&&NET.mode==='host'),ring=Math.min(2.9,A.R*.3),a0=opt&&opt.a0!==undefined?opt.a0:Math.atan2(B.f.x-S.x,B.f.z-S.z);
    killDecoy(true);   // an afterimage would pull the phantoms' aim and clutter the shot
    const pl=Barrage.plan(co),role=NET.mode==='guest'?'g':'h',sl=r=>{const o=Barrage.slot(r,a0,co);return{x:A.x+o.dx,z:A.z+o.dz}},SL={h:sl('h'),g:sl('g')};
    ult={B,dk:B.T.id==='dknight',t:0,ph:'pop',hits:0,dodged:0,T0:0,all:[B],t2:0,res:null,co,role,roles:pl.roles,sl:SL,mine:new Set()};
    const me0=SL[role];S.x=P.x=me0.x;S.z=P.z=me0.z;lx=S.x;lz=S.z;S.rot=P.face=a0;pendFace=null;lock=false;try{el.querySelector('#wLock').classList.remove('on')}catch(e){}
    if(co&&Q){const o=SL[role==='h'?'g':'h'];Q.x=o.x;Q.z=o.z}
    const put=(F,a,r)=>{F.f.x=A.x+Math.sin(a)*ring;F.f.z=A.z+Math.cos(a)*ring;F.f.face=Math.atan2(SL[r].x-F.f.x,SL[r].z-F.f.z);F.f.vx=F.f.vz=0};
    put(B,a0+pl.off[0],pl.roles[0]);for(let k=1;k<pl.off.length;k++){const G=addGhost(B,k-1,0,0);ult.all.push(G);put(G,a0+pl.off[k],pl.roles[k])}
    ult.all.forEach((F,k)=>{if(pl.roles[k]===role)ult.mine.add(F.id)});
    for(const F of ult.all){F.rm0=F.f.rm;F.f.rm=1}   // the barrage strike is timed for a normal-reach attacker: a big boss (Artorias, rm 1.4) otherwise reaches past the dodge's hop and the perfect dodge never works
    if(co&&NET.mode==='host')try{WardenNet.send({k:'sp',t:'bs',s:site.id,b:B.id,a:+a0.toFixed(4)})}catch(e){}
    for(const F of ult.all){F.script=true;F.body.g.position.set(F.f.x,H(F.f.x,F.f.z),F.f.z)}
    tsc=.5;barUI().style.display='block';barEl.classList.add('on');bq('.tx').classList.remove('on');
    try{CineCam.PRESETS.barrage={dur:14,freeze:false,noskip:true,shots:[]};bc=null;barLanes(true);
      CineCam.play('barrage',{x:()=>S.x,z:()=>S.z,h:2.4,sc:1,drive:barCam},{force:true})}catch(e){}
    try{tone(70,38,1.0,'sawtooth',.14);WardenSfx.play('vo_sudden_death',.7,.8,{nojit:1})}catch(e){}
    msg('PHANTOM BARRAGE',1.4)}
  function endBarrage(){
    if(!ult)return;const U=ult;ult=null;tsc=1;
    for(const F of U.all){if(F.ghost){try{WardenVfx.burst(F.f.x,H(F.f.x,F.f.z)+1.2,F.f.z,1);if(U.dk&&NET.mode!=='guest')zoneAdd(F.f.x,F.f.z,true,'rune',2.4+Math.random()*.6,null,null,true)}catch(e){}rmGhost(F)}else{F.script=false;if(F.rm0)F.f.rm=F.rm0;F.ai.cool=Math.max(F.ai.cool||0,70)}}
    try{CineCam.skip()}catch(e){}
    barLanes(false);
    if(barEl){barEl.classList.remove('on');barEl.style.display='none';bq('.tx').classList.remove('on');bq('.rr').classList.remove('on');for(const q of barEl.querySelectorAll('.rg'))q.style.opacity=0}
    try{el.querySelector('#wDodge').classList.remove('pulse')}catch(e){}}

  // ================= SPIRIT SEVER (your own super) =================
  // A meter (0-100) fills as you fight well: hits, parries (perfect ones most), dodges, a dodged perilous attack. At 100, R / the Sever button: the world slows, you gather, then you blink round the
  // target cutting from seven sides in a row (spirit slashes, 28 each) and land one finishing cut (90). You are untouchable throughout. All real sim moves (sever/sever2/severF), so damage, parry and
  // co-op sync are the normal rules; the camera orbits the target. Real-time timeline (the sim runs slowed by tsc).
  let sup=0,sv=null;const SV_N=7,SV_GAP=.3;
  // SHARED LAST STAND (co-op): when one of you falls, the other has LS_WIN seconds to stand beside the body for LS_HOLD seconds and bring them back at 40% health.
  // Each client is authoritative for its own defence, so the FALLEN player's client decides the revive (it sees the partner puppet beside it); the partner only sees a progress read-out. If the window closes or the partner falls too, the death is recorded as before.
  const LS_WIN=25,LS_HOLD=3,LS_R=2.6;let ls=null,revT=0;
  function lsStart(){ls={t:LS_WIN,hold:0,x:P.x,z:P.z}}
  function lsFail(){if(!ls)return;ls=null;try{PG.die(site.id,P.x,P.z)}catch(e){}}
  function lsTick(dt){
    if(ls&&spectate&&P.act==='dead'){
      if(!Q||Q.act==='dead'){lsFail();return}
      ls.t-=dt;const near=Math.hypot(Q.x-ls.x,Q.z-ls.z)<LS_R;ls.hold=near?ls.hold+dt:Math.max(0,ls.hold-dt*2);
      if(ls.hold>=LS_HOLD){lsRevive();return}
      if(ls.t<=0){lsFail();spectate=false;state='lost';stateT=performance.now();return}
      msg(near?'BROUGHT BACK IN '+Math.max(0,LS_HOLD-ls.hold).toFixed(1)+'s':'WAIT FOR YOUR PARTNER \u00b7 '+Math.ceil(ls.t)+'s',.3)}
    else if(Q&&Q.act==='dead'&&P.act!=='dead'&&state==='fight'&&!site.duel){   // you are the one standing: show the read-out (the fallen client decides)
      const near=Math.hypot(Q.x-P.x,Q.z-P.z)<LS_R;revT=near?revT+dt:0;if(near)msg('REVIVING \u00b7 stay beside them '+Math.max(0,LS_HOLD-revT).toFixed(1)+'s',.3)}
    else revT=0}
  function lsRevive(){
    ls=null;spectate=false;P.act='free';P.hp=Math.max(1,P.hpMax*.4);P.mv=null;P.ph=null;P.sk=null;P.stun=0;P.guard=false;P.c=0;P.inv=Math.max(P.inv||0,150);
    try{CameraRig.pulse(-5);CameraRig.shake(.5);flash(.7,'rgba(255,240,200,.85)');msg('BACK ON YOUR FEET',1.8);sfx('clash',.7,1.2,()=>tone(500,1400,.5,'triangle',.14))}catch(e){}}
  // ZONES (the Dark Knight's Void Runes / Anchors). Each client is authoritative for its OWN defence, so every client damages only itself; the host decides when runes appear / detonate and tells the guest (sp: zr = rune at x,z, zd = detonate after a delay, za = anchors converge).
  // Runes are laid where he vanishes in a blink. Pursuit / Executioner's Advance arms them (0.9 s fuse, ring turns white): stand clear. Three anchors + a blink = the Convergence: lines run to you, you are dragged toward the centre, then Final Sentence.
  const RUNE_R=2.8;let zones=[],zoneG=null;
  // ZONE LOOK: every ring is built in world space with the TERRAIN's height at each vertex (a flat disc gets chopped by slopes), additive so it glows, with a soft fill and a light pillar so it reads from across the arena.
  // Beams are thin additive cylinders (a 1 px GL line is invisible on a phone).
  const BEAM_G=new THREE.CylinderGeometry(1,1,1,6,1,true),_by=new THREE.Vector3(0,1,0),_bd=new THREE.Vector3();
  function beamSet(m,x0,y0,z0,x1,y1,z1,w){_bd.set(x1-x0,y1-y0,z1-z0);const L=_bd.length()||.001;m.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);m.quaternion.setFromUnitVectors(_by,_bd.multiplyScalar(1/L));m.scale.set(w||.09,L,w||.09);m.visible=true}
  function ringGeo(x,z,r0,r1,seg,dy){const pos=[],idx=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2,c=Math.cos(a),sn=Math.sin(a),ax=x+c*r0,az=z+sn*r0,bx=x+c*r1,bz=z+sn*r1;pos.push(ax,H(ax,az)+dy,az,bx,H(bx,bz)+dy,bz)}
    for(let i=0;i<seg;i++){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);return g}
  function discGeo(x,z,r,seg,dy){const pos=[x,H(x,z)+dy,z],idx=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2,ax=x+Math.cos(a)*r,az=z+Math.sin(a)*r;pos.push(ax,H(ax,az)+dy,az)}for(let i=1;i<=seg;i++)idx.push(0,i,i+1);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);return g}
  const addMat=(c,vc)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.7,depthWrite:false,fog:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,vertexColors:!!vc});
  // one mesh per zone (a phone cannot afford three): ring + soft fill + pillar merged, intensity per part carried in the vertex colour (additive blending: dimmer = fainter)
  function mergeG(parts){const pos=[],col=[],idx=[];let off=0;for(const pr of parts){const g=pr[0],k=pr[1],p=g.attributes.position,n=p.count;for(let i=0;i<n;i++){pos.push(p.getX(i),p.getY(i),p.getZ(i));col.push(k,k,k)}const ix=g.index;for(let i=0;i<ix.count;i++)idx.push(ix.getX(i)+off);off+=n;g.dispose()}
    const r=new THREE.BufferGeometry();r.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));r.setAttribute('color',new THREE.Float32BufferAttribute(col,3));r.setIndex(idx);return r}
  const VOLT_R=1.9,ZK={rune:{r:2.8,bang:2.8,life:16,col:0x8a3cff,dmg:.2,st:30,tx:'VOID RUNE',cap:5},volt:{r:1.9,bang:3.2,life:6,col:0x66ccff,dmg:.12,st:20,tx:'SHOCKED',cap:6},echo:{r:2.2,bang:2.2,life:4,col:0xffd060,dmg:.1,st:20,tx:'ECHO BLADE',cap:6},mshot:{r:1.7,bang:1.7,life:3,col:0xbfe6ff,dmg:.1,st:16,tx:'REFLECTED',cap:6},hound:{r:1.5,bang:1.5,life:3,col:0xff8a3c,dmg:.07,st:20,tx:'MAULED',cap:4},decoy:{r:1.5,bang:0,life:1.2,col:0xff2a3a,dmg:0,st:0,tx:'',cap:3}};
  function zoneAdd(x,z,mine,kind,fuse,F,src){kind=kind||'rune';const volt=kind==='volt',K=ZK[kind]||ZK.rune;
    if(!zoneG){zoneG=new THREE.Group();scene.add(zoneG)}
    {const same=zones.filter(q=>q.kind===kind);while(same.length>=K.cap){zoneDel(same.shift())}}
    const wet=volt&&wetT>0,R=K.r*(wet?2:1),m=addMat(wet?0x8fe3ff:K.col,true),parts=[[ringGeo(x,z,R*.86,R,40,.12),1],[discGeo(x,z,R*.86,24,.1),.2]];
    if(kind!=='mshot'&&kind!=='decoy'){const pg=new THREE.CylinderGeometry(R*.07,R*.16,2.8,10,1,true);pg.translate(x,H(x,z)+1.4,z);parts.push([pg,.28])}
    const g=new THREE.Mesh(mergeG(parts),m);g.frustumCulled=false;
    zoneG.add(g);
    const lm=addMat(0xc08cff);lm.depthTest=false;const ln=new THREE.Mesh(BEAM_G,lm);ln.visible=false;ln.frustumCulled=false;ln.renderOrder=995;zoneG.add(ln);
    zones.push({wet:wet?1:0,R:R,x:x,z:z,age:0,g,m,ln,lm,fuse:fuse===undefined?-1:fuse,lit:0,kind,tk:0,ch:0,nx:null,F:F||null,hit:0,col:K.col});
    if(src)beamSet(ln,src.x,src.y===undefined?1.8:src.y,src.z,x,H(x,z)+.4,z,.07);
    try{WardenVfx.spawn(x,H(x,z)+.5,z,3,3,2.2,Math.random()*6.28,24)}catch(e){}
    if(mine&&NET.mode==='host'&&Q){try{WardenNet.send({k:'sp',t:'zr',s:site.id,x:+x.toFixed(2),z:+z.toFixed(2),q:kind,f:fuse})}catch(e){}}}
  function zoneDel(q){const i=zones.indexOf(q);if(i>=0)zones.splice(i,1);if(q.g.parent)q.g.parent.remove(q.g);if(q.ln.parent)q.ln.parent.remove(q.ln);q.g.geometry.dispose();q.m.dispose();q.lm.dispose()}
  function zonesClear(){for(const q of zones.slice())zoneDel(q)}
  function zoneArm(delay,mine){for(const q of zones)if(q.fuse<0&&q.kind==='rune')q.fuse=delay;
    if(mine&&NET.mode==='host'&&Q){try{WardenNet.send({k:'sp',t:'zd',s:site.id,d:delay})}catch(e){}}}
  function zoneConverge(mine){const rs=zones.filter(q=>q.kind==='rune');if(rs.length<3)return false;for(const q of rs){q.lit=1.5;q.fuse=1.5}
    try{msg('THE ANCHORS CONVERGE',1.4);flash(.35,'rgba(150,80,255,.6)');CameraRig.pulse(2.5);tone(120,400,.6,'sawtooth',.12)}catch(e){}
    if(mine&&NET.mode==='host'&&Q){try{WardenNet.send({k:'sp',t:'za',s:site.id})}catch(e){}}return true}
  // GWYN'S CONDUCTIVE GROUND: his lightning (Storm Grid, Spear, Crownfall) leaves volt patches for 6 s that sting while you stand in them; a heavy melee blow that lands while they are down makes the current jump patch to patch and blow them all.
  function zoneChain(mine){const vs=zones.filter(q=>q.kind==='volt'&&q.fuse<0);if(vs.length<2)return false;
    vs.forEach((q,i)=>{q.nx=vs[(i+1)%vs.length];q.ch=.7;q.fuse=.7});
    try{msg('THE GROUND CONDUCTS',1.2);flash(.4,'rgba(150,210,255,.7)');CameraRig.shake(.35);tone(900,200,.4,'sawtooth',.1)}catch(e){}
    if(mine&&NET.mode==='host'&&Q){try{WardenNet.send({k:'sp',t:'zc',s:site.id})}catch(e){}}return true}
  function voltSpawn(tx,tz,mine,n,delayMs){setTimeout(()=>{if(!on||state!=='fight')return;const a0=Math.random()*6.28;for(let i=0;i<n;i++){const a=a0+i*6.28/n,r=2.6+Math.random()*1.6;let x=tx+Math.cos(a)*r,z=tz+Math.sin(a)*r;const A=C&&C.arena;if(A){const ax=x-A.x,az=z-A.z,ad=Math.hypot(ax,az),lim=A.R-1;if(ad>lim){x=A.x+ax/ad*lim;z=A.z+az/ad*lim}}zoneAdd(x,z,mine,'volt')}},delayMs)}
  function zoneTick(dt){
    if(wetT>0)wetT-=dt;
    if(!zones.length)return;
    let cx=0,cz=0,pull=false;
    for(const q of zones.slice()){q.age+=dt;
      const volt=q.kind==='volt',K=ZK[q.kind]||ZK.rune,life=K.life;
      q.m.opacity=q.fuse>=0?.9:.45+.25*Math.sin(q.age*(volt?9:4));{const cc=q.fuse>=0&&(q.kind==='rune'||q.kind==='volt'||q.fuse<.35)&&q.kind!=='decoy'?0xffffff:K.col;q.m.color.setHex(cc);q.lm.opacity=.85;q.m.opacity=Math.min(1,q.m.opacity*1.25)}if(q.age>life-2.5)q.g.visible=Math.floor(q.age*8)%2===0;
      if(q.kind==='decoy'){if(!q.hit&&on&&state==='fight'&&P&&P.act!=='dead'&&Math.hypot(P.x-q.x,P.z-q.z)<K.r&&!(P.inv>0)&&!(P.act==='dodge'&&P.pt>=Moves.dodge.iStart&&P.pt<=Moves.dodge.iEnd)){q.hit=1;const dr=Math.max(1,Math.round(P.hp*.15));P.hp=Math.max(1,P.hp-dr);hurt=true;if(q.F&&NET.mode!=='guest'&&q.F.f.act!=='dead'){q.F.f.hp=Math.min(q.F.f.hpMax,q.F.f.hp+dr);q.F.f.po=Math.max(0,q.F.f.po-30)}try{msg('LIFE DRAINED',1);flash(.35,'rgba(255,40,60,.55)');tone(300,120,.25,'sawtooth',.1)}catch(e){}}
        q.g.visible=Math.floor(q.age*14)%2===0}
      if(q.kind==='mshot'&&q.fuse<.25)q.ln.visible=false;
      if(volt){if(q.ch>0&&q.nx){q.ch-=dt;beamSet(q.ln,q.x,H(q.x,q.z)+.5,q.z,q.nx.x,H(q.nx.x,q.nx.z)+.5,q.nx.z,.11)}
        q.tk-=dt;if(q.tk<=0&&q.fuse<0&&on&&state==='fight'&&P&&P.act!=='dead'&&Math.hypot(P.x-q.x,P.z-q.z)<(q.R||VOLT_R)&&!(P.inv>0)&&!(P.act==='dodge'&&P.pt>=Moves.dodge.iStart&&P.pt<=Moves.dodge.iEnd)){q.tk=.7;P.hp=Math.max(1,P.hp-Math.max(1,Math.round(P.hpMax*.015)));hurt=true;try{flash(.15,'rgba(150,210,255,.5)');tone(700,300,.08,'square',.05)}catch(e){}}}
      if(volt){}else if(q.lit>0){q.lit-=dt;pull=true;cx+=q.x;cz+=q.z;beamSet(q.ln,q.x,H(q.x,q.z)+.5,q.z,S.x,H(S.x,S.z)+1,S.z,.1)}else if(!volt)q.ln.visible=false;
      if(q.fuse>=0){q.fuse-=dt;if(q.fuse<=0){zoneBang(q);continue}}
      if(q.age>life)zoneDel(q)}
    if(pull&&on&&state==='fight'&&P&&P.act!=='dead'&&!(P.act==='dodge'&&P.pt>=Moves.dodge.iStart&&P.pt<=Moves.dodge.iEnd)){const n=zones.filter(q=>q.lit>0).length;if(n){cx/=n;cz/=n;const dx=cx-S.x,dz=cz-S.z,d=Math.hypot(dx,dz)||1,st=Math.min(d,2.6*dt);let nx=S.x+dx/d*st,nz=S.z+dz/d*st;const A=C&&C.arena;if(A){const ax=nx-A.x,az=nz-A.z,ad=Math.hypot(ax,az),lim=A.R-1;if(ad>lim){nx=A.x+ax/ad*lim;nz=A.z+az/ad*lim}}S.x=nx;S.z=nz;P.x=nx;P.z=nz}}}
  function zoneBang(q){const volt=q.kind==='volt',K=ZK[q.kind]||ZK.rune,R=K.bang*(q.wet?1.7:1),dmg=K.dmg;
    try{WardenVfx.burst(q.x,H(q.x,q.z)+1,q.z,volt?2:3);WardenVfx.spawn(q.x,H(q.x,q.z)+.8,q.z,volt?2:0,3,volt?2.8:3.4,Math.random()*6.28,26)}catch(e){}
    if(on&&state==='fight'&&P&&P.act!=='dead'&&Math.hypot(P.x-q.x,P.z-q.z)<R&&!(P.act==='dodge'&&P.pt>=Moves.dodge.iStart&&P.pt<=Moves.dodge.iEnd)&&!(P.inv>0)){
      P.hp=Math.max(1,P.hp-Math.round(P.hpMax*dmg));P.act='stun';P.sk='hit';P.stun=K.st;P.guard=false;P.ph=null;P.mv=null;P.c=0;hurt=true;
      try{flash(.55,'rgba(150,60,255,.6)');msg(K.tx,.9);CameraRig.shake(.5);sfx('heavy',.8,.7,()=>tone(140,50,.3,'sawtooth',.14))}catch(e){}}
    q.ln.visible=false;zoneDel(q)}
  function zoneNet(p){if(!on||!site||p.s!==site.id)return;if(p.t==='zc')zoneChain(false);else if(p.t==='zr')zoneAdd(p.x,p.z,false,p.q,p.f);else if(p.t==='zd')zoneArm(p.d||.9,false);else if(p.t==='za')zoneConverge(false)}
  // SHADOW PIERCER: an afterimage made while the Dark Knight is winding up a heavy strike gets read: he cancels into a Void Thrust that impales the clone (and anything in the line) and takes some posture back.
  const HEAVYW=['fall','verdict','kingsfall','hammer','moon','groundbreaker','crownfissure','rend','sunder','worldbreaker','maul'];
  function shadowPiercer(){
    if(NET.mode==='guest'||!on||state!=='fight'||ult)return;
    for(const F of foes){if(!F.awake||F.ghost||F.T.id!=='dknight'||F.f.act!=='attack'||!F.f.mv||HEAVYW.indexOf(F.f.mv.id)<0||F.pierce>0)continue;
      const k=F.f.ph&&F.f.ph[F.f.pi]&&F.f.ph[F.f.pi].k;if(k!=='windup'&&k!=='raise'&&k!=='hold')continue;
      const f=F.f;f.act='free';f.ph=null;f.mv=null;f.pt=0;f.pk=0;f.guard=false;F.ai.follow='voidthrust';F.ai.cool=0;F.ai.busy=false;F.pierce=1.1;
      try{msg('THE DARK KNIGHT SEES THROUGH YOUR SHADOW',1.8);flash(.3,'rgba(140,60,255,.5)');tone(200,900,.25,'sawtooth',.1);CameraRig.pulse(2)}catch(e){}break}}
  function pierceTick(dt){for(const F of foes){if(!(F.pierce>0))continue;F.pierce-=dt;
      if(F.pierce<=0){F.pierce=-1;if((decoy&&decoy.t>0)||(rdecoy&&rdecoy.t>0)){F.f.po=Math.max(0,F.f.po-35);try{const Z=C.F.Z||C.F.Y;if(Z)WardenVfx.burst(Z.x,H(Z.x,Z.z)+1.1,Z.z,3);msg('THE SHADOW IS PIERCED',1.1)}catch(e){}killDecoy(false);}}}}
  // DEATH'S SENTENCE: your posture breaks with the Dark Knight at your throat: a grab, a lift, a slam (the cinematic is effects + camera on the stock rig: no grab clip yet). Never lethal; once per 20 s.
  let ds=null,dsCd=0;
  function deathSentence(F){
    if(ds||dsCd>0||ult||sv||!P||P.act==='dead')return;ds={t:0,F,phase:0,x0:S.x,z0:S.z};dsCd=20;if(NET.mode!=='guest'&&F.ai){F.ai.follow='dsgrab';F.ai.cool=0}   // his body does the choke-lift clip while the game drags / lifts / slams you
    
    try{msg('DEATH\u2019S SENTENCE',1.8);CameraRig.pulse(-6);flash(.5,'rgba(255,40,40,.6)');hsT=Math.max(hsT,.5);tone(90,40,.7,'sawtooth',.16)}catch(e){}}
  function dsTick(dt){
    if(dsCd>0)dsCd-=dt;if(!ds)return;
    if(!on||state!=='fight'||P.act==='dead'){ds=null;return}
    const q=ds;q.t+=dt;P.act='stun';P.sk='hit';P.stun=Math.max(P.stun,30);P.guard=false;P.ph=null;P.mv=null;
    const f=q.F.f,dx=f.x-S.x,dz=f.z-S.z,d=Math.hypot(dx,dz)||1;if(d>1.5){const st=Math.min(d-1.5,7*dt);S.x+=dx/d*st;S.z+=dz/d*st;P.x=S.x;P.z=S.z}   // dragged to his hand
    if(q.phase===0&&q.t>.75){q.phase=1;try{CameraRig.pulse(-3);tone(300,150,.4,'triangle',.1);msg('LIFTED',.6)}catch(e){}}
    if(q.phase===1&&q.t>1.3){q.phase=2;P.hp=Math.max(1,P.hp-Math.round(P.hpMax*.3));P.stun=50;hurt=true;
      try{CameraRig.shake(1);flash(.9,'rgba(255,255,255,.9)');WardenVfx.burst(S.x,H(S.x,S.z)+.6,S.z,3);sfx('heavy',.9,.5,()=>tone(70,30,.6,'sawtooth',.18))}catch(e){}ds=null}}
  // ARTORIAS: IMPALER'S OATH pins you (1.5 s) - mash any button to tear free; if you do not, his Executioner's Advance follows. ABYSSAL ROLL: dodge or guard EARLY into his Executioner's / Broken Advance and he cancels the wind-up into a roll to your flank and cuts.
  let pin=null;
  function pinStart(A){if(pin||ult||sv||P.act==='dead')return;pin={t:1.5,n:0,F:A};P.act='stun';P.sk='hit';P.stun=Math.max(P.stun,90);P.guard=false;P.ph=null;P.mv=null;
    try{msg('PINNED \u00b7 MASH TO BREAK FREE',1.5);flash(.35,'rgba(120,40,200,.5)');CameraRig.shake(.35);tone(160,60,.4,'sawtooth',.12)}catch(e){}}
  function pinTick(dt){if(!pin)return;if(!on||state!=='fight'||P.act==='dead'){pin=null;return}
    pin.t-=dt;P.act='stun';P.sk='hit';P.stun=Math.max(P.stun,8);
    if(pin.n>=6||pin.t<=0){const free=pin.n>=6,A=pin.F;pin=null;P.stun=free?0:4;if(free){P.act='free';P.sk=null;P.inv=Math.max(P.inv||0,30);try{msg('TORN FREE',.8);flash(.3,'rgba(255,255,255,.6)');tone(500,1200,.2,'triangle',.1)}catch(e){}}
      else if(A&&A.f.act!=='dead'&&NET.mode!=='guest'){A.ai.follow='executioner';A.ai.cool=0}}}
  let rollT=0;
  function abyssTick(dt){if(rollT>0)rollT-=dt;if(NET.mode==='guest'||!on||state!=='fight'||ult||sv||rollT>0||!P||P.act==='dead')return;
    const early=P.act==='dodge'||(P.guard&&P.act==='free');if(!early)return;
    for(const F of foes){const f=F.f;if((F.T.id!=='darkknight'&&F.T.id!=='capra')||!F.awake||F.ghost||f.act!=='attack'||!f.mv||(f.mv.id!=='executioner'&&f.mv.id!=='brokenadv'))continue;
      const k=f.ph&&f.ph[f.pi]&&f.ph[f.pi].k;if(k!=='startup'||f.pt>16||Math.random()>.55)continue;
      const dx=P.x-f.x,dz=P.z-f.z,d=Math.hypot(dx,dz)||1,sg=Math.random()<.5?1:-1;f.act='free';f.ph=null;f.mv=null;f.pt=0;f.pk=0;
      try{WardenVfx.burst(f.x,H(f.x,f.z)+1.1,f.z,3);CombatCore.moveBy(C,f,-dz/d*2.8*sg+dx/d*.8,dx/d*2.8*sg+dz/d*.8);f.face=Math.atan2(P.x-f.x,P.z-f.z);WardenVfx.slash(f.x,H(f.x,f.z)+1.2,f.z,f.face,true,1);msg('ABYSSAL ROLL',.9);tone(240,90,.25,'sawtooth',.1)}catch(e){}
      F.ai.follow=Math.random()<.5?'cut':'twin';F.ai.cool=0;F.ai.busy=false;rollT=7;break}}
  // GWYNDOLIN'S MIRRORS (phase 2): three lunar mirrors stand round the arena. When she fires a Sun Volley each mirror throws its own shot at where you will BE (your velocity x 0.7 s): a ring marks it for 0.9 s, then it lands. Run in a straight line and you run into it.
  let wetT=0,mirrors=[],pvx=0,pvz=0,pvl=null;
  let mirTex=null;
  function mirTexture(){if(mirTex)return mirTex;const c=document.createElement('canvas');c.width=64;c.height=128;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,128);gr.addColorStop(0,'rgba(210,240,255,.55)');gr.addColorStop(.5,'rgba(120,190,255,.22)');gr.addColorStop(1,'rgba(210,240,255,.55)');g.fillStyle=gr;g.fillRect(0,0,64,128);
    g.strokeStyle='rgba(235,250,255,.95)';g.lineWidth=5;g.strokeRect(3,3,58,122);g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=7;g.beginPath();g.moveTo(8,118);g.lineTo(56,10);g.stroke();mirTex=new THREE.CanvasTexture(c);return mirTex}
  function mirrorsAdd(){if(mirrors.length||!C||!C.arena)return;const A=C.arena;
    for(let i=0;i<3;i++){const a=Math.PI/2+i*Math.PI*2/3,x=A.x+Math.cos(a)*A.R*.78,z=A.z+Math.sin(a)*A.R*.78;
      const m=new THREE.MeshBasicMaterial({map:mirTexture(),transparent:true,opacity:.95,depthWrite:false,side:THREE.DoubleSide,fog:false,blending:THREE.AdditiveBlending}),g=new THREE.Mesh(new THREE.PlaneGeometry(1.9,3.4),m);
      g.position.set(x,H(x,z)+2.3,z);g.rotation.y=Math.atan2(A.x-x,A.z-z);scene.add(g);
      const rm=addMat(0xbfe6ff),rg=new THREE.Mesh(ringGeo(x,z,1.0,1.3,28,.1),rm);scene.add(rg);
      mirrors.push({x,z,g,m,rg,rm,y0:H(x,z)+2.3,ph:i*2.1})}
    try{msg('LUNAR MIRRORS RISE',1.6);flash(.3,'rgba(190,230,255,.5)')}catch(e){}}
  function mirrorTick(dt){if(!mirrors.length)return;const t=performance.now()/1000;for(const q of mirrors){q.g.position.y=q.y0+Math.sin(t*1.3+q.ph)*.14;q.m.opacity=.8+.15*Math.sin(t*2.2+q.ph);q.rm.opacity=.45+.2*Math.sin(t*2.2+q.ph)}}
  function mirrorsClear(){for(const q of mirrors){if(q.g.parent)q.g.parent.remove(q.g);if(q.rg.parent)q.rg.parent.remove(q.rg);q.m.dispose();q.rm.dispose();q.g.geometry.dispose();q.rg.geometry.dispose()}mirrors=[];if(mirTex){mirTex.dispose();mirTex=null}}
  function mirrorVolley(){if(!mirrors.length||NET.mode==='guest')return;const px=S.x+pvx*.7,pz=S.z+pvz*.7;
    setTimeout(()=>{if(!on||state!=='fight'||!mirrors.length)return;mirrors.forEach((q,i)=>{const j=i-1,x=px+j*1.3,z=pz+(i===1?1.2:-.6);zoneAdd(x,z,true,'mshot',.9,null,{x:q.x,y:2.1,z:q.z})})},500)}
  // GANFAUL, TIME ANCHOR: stagger him in the middle of a heavy move and (60%) he rewinds to where he stood a second ago, posture half-restored, and answers with a thrust.
  // ARISSA, RHYTHM + MIRROR SWAY: each hit she lands quickens her rests 5% (max 25%, her tells never change); landing a hit on her while she is still winding up a step (first 14 ticks) makes her slip to your flank and sweep (6 s cooldown). Parrying or hitting her breaks the rhythm.
  let swayT=0;
  function histTick(dt){if(swayT>0)swayT-=dt;const n=performance.now();for(const F of foes){if(F.T.id!=='ganfaul'||F.ghost)continue;(F.hist=F.hist||[]).push({t:n,x:F.f.x,z:F.f.z});while(F.hist.length&&n-F.hist[0].t>1100)F.hist.shift()}}
  function setEv2(e){
    if(e.t==='posturebreak'&&e.d!=='P'&&NET.mode!=='guest'){const F=byId[e.d];if(F&&F.T.id==='ganfaul'&&F.hist&&F.hist.length&&HEAVYW.indexOf(F.lm)>=0&&Math.random()<.6){const h=F.hist[0],f=F.f;
      f.x=h.x;f.z=h.z;f.act='free';f.ph=null;f.mv=null;f.stun=0;f.po=f.poMax*.5;F.ai.follow='thrust';F.ai.cool=0;F.ai.busy=false;
      try{WardenVfx.burst(f.x,H(f.x,f.z)+1.2,f.z,1);msg('TIME ANCHOR \u00b7 HE REWINDS',1.5);flash(.3,'rgba(255,220,120,.5)');tone(900,200,.4,'triangle',.1)}catch(x){}}return}
    if(e.t==='hit'&&e.d==='P'){const F=byId[e.a];if(F&&F.T.id==='arissa'&&F.ai){F.ai.rh=Math.min(5,(F.ai.rh||0)+1);if(F.ai.rh===3||F.ai.rh===5)try{msg('ARISSA QUICKENS',.9)}catch(x){}}}
    else if(e.t==='deflect'&&e.d==='P'){const F=byId[e.a];if(F&&F.T.id==='arissa'&&F.ai)F.ai.rh=0}
    else if(e.t==='hit'&&e.a==='P'&&!e.fx){const F=byId[e.d];if(F&&F.sm>0){F.sm=.05;F.shot=true;for(const q of zones.slice())if(q.kind==='mshot'&&q.F===F)zoneDel(q);try{msg('THE SMOKE CLONE DISPERSES',1)}catch(x){}}if(F&&F.T.id==='arissa'&&F.ai){F.ai.rh=0;const f=F.f;
      if(NET.mode!=='guest'&&swayT<=0&&f.act==='attack'&&f.ph&&f.ph[f.pi]&&(f.ph[f.pi].k==='startup'||f.ph[f.pi].k==='windup')&&f.pt<=14&&Math.random()<.5){
        const dx=P.x-f.x,dz=P.z-f.z,d=Math.hypot(dx,dz)||1,sg=Math.random()<.5?1:-1;f.act='free';f.ph=null;f.mv=null;f.pt=0;f.pk=0;
        try{CombatCore.moveBy(C,f,-dz/d*2.2*sg,dx/d*2.2*sg);f.face=Math.atan2(P.x-f.x,P.z-f.z);WardenVfx.burst(f.x,H(f.x,f.z)+1,f.z,2);msg('MIRROR SWAY',.9)}catch(x){}
        F.ai.follow='lowsweep';F.ai.cool=0;F.ai.busy=false;swayT=6}}}}
  // ERIKA, SMOKE STEP: she dissolves (the blink), a violet smoke clone of her stays where she stood for 3.4 s, takes aim and looses a shot at where you will be (marked 0.9 s), then bursts. Cut the clone and it pops harmlessly: no damage, no reward, but the shot never comes.
  function smokeClone(F){if(NET.mode==='guest'||C.F.v||!on||state!=='fight')return;
    try{const g=addGhost(F,3,F.f.x,F.f.z,'sm');g.f.face=F.f.face;g.sm=3.4;g.shot=false;g.owner=F;try{WardenVfx.burst(F.f.x,H(F.f.x,F.f.z)+1,F.f.z,1);WardenVfx.spawn(F.f.x,H(F.f.x,F.f.z)+1,F.f.z,3,3,3,Math.random()*6.28,30)}catch(e){}}catch(e){}}
  // THE CAPRA DEMON'S HOUNDS: two hounds (built from boxes, no dog model) pace round you at the edge of the fight. Every ~5 s one picks the spot you will be on and a ring marks it 0.9 s, then it leaps and mauls whatever stands there (7% HP, short stun). A clean cut on a pacing hound drives it off for 14 s. Host/solo only; the leap ring reaches a guest like any zone, the hound body does not (unverified).
  let hounds=[],houndDone=false;
  function houndBody(){const g=new THREE.Group(),mt=new THREE.MeshBasicMaterial({color:0x2a1a14}),em=new THREE.MeshBasicMaterial({color:0xff5a2a});
    const bx=(w,h,d,x,y,z,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m||mt);o.position.set(x,y,z);g.add(o);return o};
    bx(.5,.45,1.1,0,.62,0);bx(.36,.34,.42,0,.78,.72);bx(.2,.14,.3,0,.7,1.02);bx(.07,.07,.07,-.1,.86,.88,em);bx(.07,.07,.07,.1,.86,.88,em);bx(.12,.12,.5,0,.7,-.78);
    for(const[x,z]of[[-.18,.4],[.18,.4],[-.18,-.4],[.18,-.4]])bx(.1,.5,.1,x,.25,z);
    g.frustumCulled=false;return g}
  function houndsAdd(){if(hounds.length||!C||!C.arena||!scene)return;for(let i=0;i<2;i++){const g=houndBody();scene.add(g);hounds.push({g,a:i*3.14+Math.random(),x:0,z:0,st:'lurk',t:2.5+i*2.6+Math.random()*2,dead:0,fx:0,fz:0,sx:0,sz:0})}houndDone=true}
  function houndsClear(){for(const h of hounds){if(h.g.parent)h.g.parent.remove(h.g);h.g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()})}hounds=[];houndDone=false}
  function houndTick(dt){
    if(!houndDone&&on&&state==='fight'&&NET.mode!=='guest'&&foes.some(F=>F.T.id==='capra'&&F.awake&&F.f.act!=='dead'))houndsAdd();
    if(!hounds.length)return;const live=foes.some(F=>F.T.id==='capra'&&F.f.act!=='dead');
    for(const h of hounds){
      if(!live||!on||state!=='fight'){h.g.visible=false;continue}
      if(h.dead>0){h.dead-=dt;h.g.visible=false;if(h.dead<=0){h.st='lurk';h.t=2+Math.random()*2}continue}
      h.g.visible=true;
      if(h.st==='lurk'){h.a+=dt*.7;const A=C.arena,R=Math.min(6.5,A.R-1.5);h.x=S.x+Math.cos(h.a)*R;h.z=S.z+Math.sin(h.a)*R;const dx=h.x-A.x,dz=h.z-A.z,d=Math.hypot(dx,dz),lim=A.R-1;if(d>lim){h.x=A.x+dx/d*lim;h.z=A.z+dz/d*lim}
        h.g.position.set(h.x,H(h.x,h.z)+Math.abs(Math.sin(h.a*9))*.08,h.z);h.g.rotation.y=Math.atan2(S.x-h.x,S.z-h.z);
        if(P&&P.act==='attack'&&P.ph&&P.ph[P.pi]&&P.ph[P.pi].k==='active'&&Math.hypot(h.x-S.x,h.z-S.z)<3.1&&Math.abs(((Math.atan2(h.x-S.x,h.z-S.z)-P.face+9.42)%6.283)-3.14)<1.1){h.dead=14;try{WardenVfx.burst(h.x,H(h.x,h.z)+.7,h.z,1);msg('A HOUND YELPS AND FLEES',1)}catch(e){}continue}
        h.t-=dt;if(h.t<=0&&P.act!=='dead'&&!hounds.some(q=>q!==h&&q.st==='leap')){h.st='leap';h.t=.9;h.sx=h.x;h.sz=h.z;h.fx=S.x+pvx*.6;h.fz=S.z+pvz*.6;const A=C.arena,dx=h.fx-A.x,dz=h.fz-A.z,d=Math.hypot(dx,dz),lim=A.R-1;if(d>lim){h.fx=A.x+dx/d*lim;h.fz=A.z+dz/d*lim}
          zoneAdd(h.fx,h.fz,true,'hound',.9,null,{x:h.x,y:.9,z:h.z});try{tone(160,320,.2,'sawtooth',.08)}catch(e){}}}
      else if(h.st==='leap'){h.t-=dt;const u=Math.max(0,Math.min(1,1-h.t/.9)),e=u*u*(3-2*u);h.x=h.sx+(h.fx-h.sx)*e;h.z=h.sz+(h.fz-h.sz)*e;h.g.position.set(h.x,H(h.x,h.z)+Math.sin(u*Math.PI)*1.3,h.z);h.g.rotation.y=Math.atan2(h.fx-h.sx,h.fz-h.sz);
        if(h.t<=0){h.st='lurk';h.t=4.5+Math.random()*3;h.a=Math.atan2(h.z-S.z,h.x-S.x)}}}}
  // GWYNDOLIN'S ILLUSIONS (phase 2): each Sun Volley she splits two moonlit copies either side of you. They hang 3.4 s, each looses its own marked shot at where you will be (1.9 s before they fade), and one clean cut disperses a copy (and its shot). Host/solo only (same body rules as the smoke clone).
  function illusions(F){if(NET.mode==='guest'||!on||state!=='fight'||!F.ai||!F.ai.ph2||C.F.v||C.F.u||ult)return;
    const a0=Math.atan2(F.f.x-S.x,F.f.z-S.z);let n=0;
    for(const[k,da]of[[3,1.15],[4,-1.15]]){let x=S.x+Math.sin(a0+da)*4.6,z=S.z+Math.cos(a0+da)*4.6;const A=C.arena;if(A){const dx=x-A.x,dz=z-A.z,d=Math.hypot(dx,dz),lim=A.R-1.5;if(d>lim){x=A.x+dx/d*lim;z=A.z+dz/d*lim}}
      try{const g=addGhost(F,k,x,z,'sm');g.f.face=Math.atan2(S.x-x,S.z-z);g.sm=3.4;g.shot=false;g.owner=F;g.illu=1;WardenVfx.burst(x,H(x,z)+1,z,1);WardenVfx.spawn(x,H(x,z)+1,z,3,3,3,Math.random()*6.28,30);n++}catch(e){}}
    if(n)try{msg('MOONLIT ILLUSIONS',1.2)}catch(e){}}
  function smokeTick(dt){for(const F of foes.slice()){if(!(F.sm>0))continue;F.sm-=dt;const f=F.f;f.face=Math.atan2(S.x-f.x,S.z-f.z);
      if(!F.shot&&F.sm<1.9){F.shot=true;const px=S.x+pvx*.7,pz=S.z+pvz*.7;zoneAdd(px,pz,true,'mshot',.9,F,{x:f.x,y:1.5,z:f.z})}
      if(F.sm<=0||!on||state!=='fight'){try{WardenVfx.burst(f.x,H(f.x,f.z)+1,f.z,1);WardenVfx.spawn(f.x,H(f.x,f.z)+1,f.z,3,3,3.2,Math.random()*6.28,30)}catch(e){}rmGhost(F)}}}
  // SET PIECES: the fight reacts to how you fight it (Kage, the Dark Knight; the parry rules apply to any duelist with a MUT table).
  // - move tracking + parry adaptation (DuelistAI.onParry), - three PERFECT parries in a row within 7 s on a boss = the Deathblow opening: his guard breaks, time stalls, you get a free cut,
  // - a mood vignette that darkens the arena in phase 2 and 3 (a plain overlay: no extra lights, cheap on a phone).
  let pcs={n:0,t:0,id:null},moodEl=null,moodT=0,moodK=0;
  function spEv(e,A){
    if(e.t==='posturebreak'&&e.d==='P'&&!ult&&!sv&&state==='fight'){let b=null,bd=4.6;for(const F of foes)if(F.T.id==='dknight'&&F.awake&&F.f.act!=='dead'){const d=Math.hypot(F.f.x-S.x,F.f.z-S.z);if(d<bd){bd=d;b=F}}if(b)deathSentence(b);return}
    if(!A||!A.ai||ult||sv||state!=='fight')return;
    if(e.t==='start'&&e.a!==undefined&&e.a!=='P')A.lm=e.move;
    else if(e.t==='deflect'&&e.d==='P'){DuelistAI.onParry(A.ai,A.lm,e.pf);
      if(e.pf&&A.T.boss){const n=performance.now();if(pcs.id===A.id&&n-pcs.t<7000)pcs.n++;else pcs.n=1;pcs.id=A.id;pcs.t=n;if(pcs.n>=3){pcs.n=0;deathblow(A)}}else if(!e.pf)pcs.n=Math.max(0,pcs.n-1)}
    else if(e.t==='hit'&&e.d==='P'&&!e.fx){pcs.n=0;if(A.T.id==='gwyn'&&A.f.mv&&HEAVYW.indexOf(A.f.mv.id)>=0)zoneChain(true);if(A.T.id==='darkknight'&&A.f.mv&&A.f.mv.id==='impaler')pinStart(A)}}
  function deathblow(A){
    if(NET.mode!=='guest'){CombatCore.stun(A.f,120,'stagger');A.f.hp=Math.max(1,A.f.hp-A.f.hpMax*.04)}
    else{try{WardenNet.send({k:'sp',t:'pf',b:A.id,q:1})}catch(x){}}
    hsT=Math.max(hsT,1.1);sup=Math.min(100,sup+35);
    try{CameraRig.pulse(-7);CameraRig.shake(.9);flash(.8,'rgba(255,255,255,.85)');msg('DEATHBLOW \u00b7 HIS GUARD IS BROKEN',1.8);sfx('clash',.8,.6,()=>tone(160,2000,.5,'triangle',.16))}catch(x){}}
  function mood(k,col){
    if(!el)return;if(!moodEl){moodEl=document.createElement('div');moodEl.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;transition:opacity 2.4s ease;background:radial-gradient(ellipse at center,transparent 42%,var(--mc,rgba(120,20,0,.55)) 100%)';el.appendChild(moodEl)}
    if(col)moodEl.style.setProperty('--mc',col);moodEl.style.opacity=String(k)}
  const MOODS={hollow:[['rgba(20,40,30,.55)',.65]],samurai:[['rgba(110,30,10,.5)',.7],['rgba(150,10,0,.7)',1]],dknight:[['rgba(40,10,70,.55)',.7],['rgba(10,0,30,.8)',1]]};
  function phaseBeat(F,n){if(F.T.id==='gdn'&&n===2)try{mirrorsAdd()}catch(x){}
    const m=MOODS[F.T.id==='dknight'?'dknight':F.T.ai==='samurai'?'samurai':F.T.id==='hollow'?'hollow':''];if(!m||!m[n-2]||ult)return;
    mood(m[n-2][1],m[n-2][0]);try{CameraRig.pulse(-3);CameraRig.shake(.5);flash(.5,n===3?'rgba(255,60,20,.55)':'rgba(255,180,90,.4)')}catch(x){}}
  function supEv(e){if(sv||ult||state!=='fight')return;let g=0;
    if(e.t==='hit'){if(e.a==='P'&&!e.fx)g=e.dmg>=20?5:3;else if(e.d==='P')g=2}
    else if(e.t==='deflect'&&e.d==='P')g=e.pf?12:7;else if(e.t==='dodged'&&e.d==='P')g=5;else if(e.t==='perdodge'&&e.d==='P')g=9;
    if(g){const was=sup;sup=Math.min(100,sup+g);if(was<100&&sup>=100){msg(stance==='twin'?'HUNDRED SHADOWS READY':'SPIRIT SEVER READY',1.4);try{tone(600,1500,.3,'triangle',.12)}catch(x){}}}}
  function supHud(){const b=el&&el.querySelector('#wSup');if(!b)return;const f=Math.round(sup/100*60),full=sup>=100&&!sv;if(bars.sp!==f||bars.spf!==full||bars.spv!==!!sv){bars.sp=f;bars.spf=full;bars.spv=!!sv;b.style.setProperty('--sp',(sup/100*360)+'deg');b.classList.toggle('full',full);b.classList.toggle('on',!!sv)}}
  function startSever(){
    if(!on||state!=='fight'||sv||ult||pun||P.act!=='free'||CineCam.busy()||P.act==='dead')return false;
    if(sup<100){toast('Spirit Sever '+Math.floor(sup)+'% · land hits, parry and dodge to charge it',2.2);return false}
    const T=target();if(!T||T.f.act==='dead'||T.f.inv>0||T.f.act==='stun'&&T.f.sk==='rise'){toast('The Sever cannot reach it right now \u00b7 wait for it to be vulnerable',1.8);return false}
    sup=0;const t0=performance.now(),a0=Math.atan2(S.x-T.f.x,S.z-T.f.z);
    sv={T,t:0,n:0,next:.6,lastB:-9,a0,ph:'gather',fin:0,hit:false,hold:0,t0,tw:stance==='twin'};
    P.inv=Math.max(P.inv||0,400);tsc=.3;
    msg(sv.tw?'HUNDRED SHADOWS':'SPIRIT SEVER',1.6);flash(.5,sv.tw?'rgba(190,120,255,.75)':'rgba(190,235,255,.75)');try{tone(300,1100,.6,'triangle',.14);sfx('heavy',.6,1.4)}catch(x){}
    try{WardenVfx.burst(P.x,H(P.x,P.z)+1.1,P.z,2);svRing(90001,P.x,P.z,2.6,'sever')}catch(x){}
    try{
      CineCam.PRESETS.sever={dur:4.9,freeze:false,noskip:true,shots:[]};
      const ease=u=>u*u*(3-2*u),seg=(t,a,b)=>ease(cl((t-a)/(b-a),0,1));
      let lastD=null;const drive=()=>{const V=sv;if(!V)return lastD;const T=V.T,t=(performance.now()-V.t0)/1000,bx=T.f.x,bz=T.f.z,gy=H(bx,bz),sc=Math.max(1,T.T.scale*.8);
        const u1=seg(t,0,.7),u2=seg(t,.7,3.0),fz=V.fin?seg((performance.now()-V.fin)/1000,0,.6):0,ou=V.out?seg((performance.now()-V.out)/1000,0,.9):0;
        const kick=Math.max(0,1-(performance.now()-V.lastB*1000-V.t0)/220);   // each cut nudges the lens
        const ang=V.a0+mixn(.2,.9,u1)+u2*3.4+fz*.5-ou*.4,d=(mixn(8.5,7.2,u1)-u2*1.6-fz*2.2+ou*4.5-kick*.35)*sc,hy=gy+(1.5+u2*.5-fz*.7+ou*.9)*sc;
        const px=bx+Math.sin(ang)*d,pz=bz+Math.cos(ang)*d;
        return lastD={px,py:Math.max(hy,H(px,pz)+.6),pz,lx:bx,ly:gy+1.25*T.T.scale,lz:bz,fov:mixn(56,50,u1)-u2*3-fz*9+ou*8-kick*2}};
      CineCam.play('sever',{x:()=>T.f.x,z:()=>T.f.z,h:1.5*T.T.scale,drive},{force:true})}catch(x){}
    return true}
  function svRing(id,x,z,r,mv){WardenFx.event({t:'fx',k:'aoe',fid:id,a:'P',move:mv,x:x,z:z,r:r,delay:1,dur:3});WardenFx.event({t:'fxburst',fid:id,x:x,z:z,r:r});setTimeout(()=>{try{WardenFx.event({t:'fxend',fid:id,why:'done',x:x,z:z})}catch(e){}},160)}
  function svBeat(V,fin){
    const T=V.T,tx=T.f.x,tz=T.f.z,a=fin?V.a0+V.n*2.4+Math.PI:V.a0+V.n*2.4,R=fin?2.7:2.3;
    try{WardenVfx.spawn(P.x,H(P.x,P.z)+1.2,P.z,2,3,2.2,0,26)}catch(x){}   // the afterimage where you were
    const nx=tx+Math.sin(a)*R,nz=tz+Math.cos(a)*R;CombatCore.moveBy(C,P,nx-P.x,nz-P.z);S.x=P.x;S.z=P.z;lx=S.x;lz=S.z;
    const fa=Math.atan2(tx-P.x,tz-P.z);S.rot=P.face=fa;pendFace=null;
    ST.input('P',{t:'atk',m:V.tw?(fin?'twsevF':V.n%2?'twsev2':'twsev'):(fin?'severF':V.n%2?'sever2':'sever')},now());
    try{WardenVfx.slash(tx,H(tx,tz)+1.2,tz,fa,fin,2);WardenVfx.hit(tx,H(tx,tz)+1.2,tz,false,fin);if(!fin)svRing(90010+V.n,tx,tz,1.5,'sever')}catch(x){}
    try{tone(fin?180:700+V.n*90,fin?60:300,fin?.5:.12,'triangle',.1);CameraRig.shake(fin?.5:.12)}catch(x){}
    V.lastB=(performance.now()-V.t0)/1000}
  function svTick(dt){
    const V=sv;if(!V)return;const rdt=dt/Math.max(.05,tsc);V.t+=rdt;const T=V.T;
    if(!on||state!=='fight'||P.act==='dead'||V.t>7){svEnd();return}
    P.inv=Math.max(P.inv||0,60);
    if(T.f.act==='dead'&&V.ph!=='out'){V.ph='out';V.out=performance.now();V.hold=0}
    if(V.ph==='gather'){tsc=cl(.3+V.t*.5,.3,1);if(V.t>=V.next){V.ph='cut';tsc=1}return}
    if(V.ph==='cut'){tsc=1;
      if(P.act==='free'&&performance.now()>=(V.nextAt||0)){V.nextAt=performance.now()+(V.tw?.19:SV_GAP)*1000;
        if(V.n<(V.tw?11:SV_N)){svBeat(V,false);V.n++}
        else{V.ph='fin';V.fin=performance.now();tsc=.35;svBeat(V,true);try{flash(.3,'rgba(255,255,255,.6)')}catch(x){}}}
      return}
    if(V.ph==='fin'){
      if(!V.hit&&V.cut)V.hit=true;
      if(V.hit){V.hold+=rdt;tsc=V.hold<.55?.12:cl(.12+(V.hold-.55)*1.4,.12,1);if(V.hold>.95){V.ph='out';V.out=performance.now();V.hold=0}}
      else{tsc=.45;if(V.t-((V.fin-V.t0)/1000)>1.6){V.ph='out';V.out=performance.now();V.hold=0}}
      return}
    if(V.ph==='out'){V.hold+=rdt;tsc=1;if(V.hold>.8)svEnd()}}
  function svEnd(){
    if(!sv)return;sv=null;tsc=1;hsT=0;P.inv=Math.max(0,Math.min(P.inv||0,45));
    try{CineCam.skip()}catch(x){}}
  function svHit(e){   // the finishing cut lands: white-out, stillness, a pillar of light
    if(!sv||e.t!=='hit'||e.a!=='P'||e.move!=='severF'&&e.move!=='twsevF')return;sv.cut=true;const T=sv.T;
    flash(.6,'rgba(255,255,255,.9)');msg(sv.tw?'A HUNDRED SHADOWS':'SEVERED',1.4);try{CameraRig.shake(.8);sfx('heavy',.8,.7,()=>tone(90,30,.6,'sawtooth',.16));WardenVfx.burst(T.f.x,H(T.f.x,T.f.z)+1.2,T.f.z,2);WardenVfx.burst(T.f.x,H(T.f.x,T.f.z)+1.2,T.f.z,0);
      svRing(90090,T.f.x,T.f.z,3.4,'severF')}catch(x){}}
  // ================= HOLLOW ECHO (Ganfaul's set piece; see Echo.js) =================
  // Ganfaul vanishes; the room fills with copies of him and ONE is real. The real one grounds a dark pool under his feet, the echoes float without one. Find him in time and strike: he reels. Strike an echo
  // and it shatters and bites you (6% of your health). Out of time: every copy lunges - the echoes at empty air, the real one at you. Same seed on both co-op clients => the same room; each player judges
  // only their own hits and the host applies the boss reward (messages 'es' start / 'ef' found / 'ee' end, all inside the 'sp' channel).
  let ecPool=null;
  function echoPool(on){
    if(!on){if(ecPool){scene.remove(ecPool);ecPool.material.dispose();ecPool.geometry.dispose();ecPool=null}return}
    if(ecPool)return;ecPool=new THREE.Mesh(new THREE.CircleGeometry(1,28),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.62,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,fog:false}));
    ecPool.rotation.x=-Math.PI/2;ecPool.renderOrder=6;ecPool.frustumCulled=false;scene.add(ecPool)}
  function plainClone(root){   // own material copies (a hit flash on one body must not light up the others - and must not give the real one away)
    root.traverse(o=>{if(o.isMesh){o.castShadow=false;if(o.material&&!o.userData.gh){o.userData.gh=1;const m=[].concat(o.material).map(q=>q.clone());o.material=Array.isArray(o.material)?m:m[0]}}})}   // castShadow off: only the real one casts a shadow, whatever the shadow setting
  function startEcho(B,opt){
    const A=C.arena,co=!!opt.co,n=Echo.count(opt.st,co),ring=Math.min(6.5,A.R*.42),lay=Echo.layout(opt.seed,n,ring,A.x,A.z,co),role=NET.mode==='guest'?'g':'h';
    killDecoy(true);
    const sl=r=>{const o=Barrage.slot(r,0,co);return{x:A.x+o.dx,z:A.z+o.dz}},SL={h:sl('h'),g:sl('g')};
    ult={kind:'echo',B,t:0,ph:'reveal',hits:0,dodged:0,all:[],mine:new Set(),co,role,sl:SL,lay,seed:opt.seed,st:opt.st,T:Echo.searchTime(opt.st,co),found:false,t2:0,fin:false};
    const me0=SL[role];S.x=P.x=me0.x;S.z=P.z=me0.z;lx=S.x;lz=S.z;S.rot=P.face=lay.a0;pendFace=null;lock=false;try{el.querySelector('#wLock').classList.remove('on')}catch(e){}
    if(co&&Q){const o=SL[role==='h'?'g':'h'];Q.x=o.x;Q.z=o.z}
    let gi=0;
    for(let k=0;k<n;k++){
      const ps=lay.pos[k],F=k===lay.real?B:addGhost(B,gi++,ps.x,ps.z,'ec');
      F.f.x=ps.x;F.f.z=ps.z;F.f.vx=F.f.vz=0;F.f.face=Math.atan2(A.x-ps.x,A.z-ps.z);F.script=true;F.body.g.position.set(F.f.x,H(F.f.x,F.f.z),F.f.z);
      if(F.ghost)plainClone(F.body.g);F.ek=k;ult.all.push(F)}
    echoPool(true);barUI().style.display='block';try{bq('.ec').classList.remove('on')}catch(e){}
    try{for(const F of ult.all){WardenVfx.burst(F.f.x,H(F.f.x,F.f.z)+1.4,F.f.z,1)}flash(.45,'rgba(150,110,255,.7)');tone(110,60,.8,'sawtooth',.12)}catch(e){}
    if(co&&NET.mode==='host')try{WardenNet.send({k:'sp',t:'es',s:site.id,b:B.id,seed:opt.seed,st:opt.st})}catch(e){}
    msg('HOLLOW ECHO',1.3)}
  function echoShatter(G,mine){
    if(!ult||ult.kind!=='echo'||!G||!G.ghost||G.dead)return;G.dead=true;
    try{WardenVfx.burst(G.f.x,H(G.f.x,G.f.z)+1.3,G.f.z,2);tone(700,200,.25,'triangle',.12)}catch(e){}
    ult.all=ult.all.filter(F=>F!==G);rmGhost(G);
    if(mine&&P.act!=='dead'){P.hp=Math.max(1,P.hp-P.hpMax*Echo.BACKLASH);flash(.5,'rgba(255,60,60,.6)');msg('FALSE ECHO',.9);try{CameraRig.shake(.35)}catch(e){}}}
  function echoFound(remote){
    const U=ult;if(!U||U.kind!=='echo'||U.found||U.ph==='strike'||U.ph==='wait')return;U.found=true;U.ph='out';U.t2=0;
    for(const F of U.all.slice())if(F.ghost)echoShatter(F,false);
    try{bq('.ec').classList.remove('on');const rr=bq('.rr');rr.textContent='FOUND HIM';rr.style.color='#ffe27a';rr.classList.add('on');flash(.7,'rgba(255,236,150,.8)');CameraRig.shake(.5);tone(900,1800,.3,'triangle',.14);flowAdd(40);WardenVfx.clash(U.B.f.x,H(U.B.f.x,U.B.f.z)+1.5,U.B.f.z,true)}catch(e){}
    if(NET.mode==='guest'){if(!remote)try{WardenNet.send({k:'sp',t:'ef',s:site.id})}catch(e){}}
    else{echoReel(U.B);if(U.co)try{WardenNet.send({k:'sp',t:'ee',s:site.id})}catch(e){}}}
  function echoReel(B){if(!B||B.f.act==='dead')return;B.f.hp=Math.max(1,B.f.hp-B.f.hpMax*.05);B.f.po=Math.min(B.f.poMax*.97,B.f.po+B.f.poMax*.7)}   // host / solo only: the boss is the host's
  function endEcho(){
    if(!ult||ult.kind!=='echo')return;const U=ult;ult=null;
    for(const F of U.all){if(F.ghost)rmGhost(F);else{F.script=false;F.ai.cool=Math.max(F.ai.cool||0,70)}}
    echoPool(false);
    if(barEl){barEl.style.display='none';bq('.ec').classList.remove('on');bq('.rr').classList.remove('on')}}
  const endSet=()=>{if(!ult)return;if(ult.kind==='echo')endEcho();else endBarrage()};
  function echoTick(dt){
    const U=ult,B=U.B;U.t+=dt;
    if(ecPool){const f=B.f;ecPool.position.set(f.x,H(f.x,f.z)+.1,f.z);ecPool.scale.setScalar(1.05*(B.T.scale||1))}
    for(const F of U.all)if(F.ghost){F.body.g.position.y=H(F.f.x,F.f.z)+.1}   // the echoes float a hand above the ground (and cast no pool)
    if(U.ph==='reveal'){if(U.t>=Echo.REVEAL){U.ph='search';U.t=0;msg('Which one is real? Only the real one casts a shadow.',3)}return}
    if(U.ph==='search'){
      const left=Math.max(0,U.T-U.t);try{const ec=bq('.ec');ec.textContent='HOLLOW ECHO · '+Math.ceil(left);ec.classList.add('on')}catch(e){}
      if(U.t>=U.T){   // out of time: everyone lunges
        U.ph='strike';U.t=0;try{bq('.ec').classList.remove('on')}catch(e){}
        const A=C.arena,realRole=U.lay.roles[U.lay.real],dm=Barrage.dmFor(P.hpMax,P.hp,Moves[Barrage.MOVE].dmg,2);
        for(const F of U.all){
          if(F===B){const mine=realRole===U.role;if(!mine&&!(U.co&&Q))continue;const T=U.sl[realRole];F.f.face=Math.atan2(T.x-F.f.x,T.z-F.f.z);F.f.dm=mine?dm:.001;U.mine.add(F.id)}
          else{F.f.face=Math.atan2(F.f.x-A.x,F.f.z-A.z);F.f.dm=.001}   // echoes lunge outward, at nothing
          ST.input(F.id,{t:'atk',m:Barrage.MOVE},now())}
        U.T0=C.tick+1;P.st=P.stMax;try{tone(220,60,.5,'sawtooth',.12)}catch(e){}}
      return}
    if(U.ph==='strike'){U.ph='wait';return}
    if(U.ph==='wait'){if(U.t>=Echo.STRIKE_WAIT){try{const rr=bq('.rr');rr.textContent=U.hits?'HOLLOW STRIKE':'AVOIDED';rr.style.color=U.hits?'#ff5a4a':'#9ad0ff';rr.classList.add('on')}catch(e){}U.ph='out';U.t2=0}return}
    U.t2+=dt;if(U.t2>1.3)endEcho()}
  function echoEvents(evs){
    const U=ult;if(!U||U.kind!=='echo'||U.found||U.ph!=='search'&&U.ph!=='reveal')return;
    for(const e of evs){if(e.t!=='hit'||e.a!=='P'&&e.a!=='Q')continue;
      if(e.d===U.B.id){echoFound(false);return}
      const G=U.all.find(F=>F.ghost&&F.id===e.d);if(G)echoShatter(G,e.a==='P')}}
  function bossReel(B,rw){if(!B||B.f.act==='dead')return;B.f.hp=Math.max(1,B.f.hp-B.f.hpMax*.1*rw);B.f.po=Math.min(B.f.poMax*.97,B.f.po+B.f.poMax*.6*rw)}   // host / solo only: the boss is the host's
  function spMsg(p){
    if(!on||!site||p.s!==site.id)return;
    if(p.t==='zr'||p.t==='zd'||p.t==='za'||p.t==='zc'){zoneNet(p);return}
    if(p.t==='tp'||p.t==='tx'||p.t==='vh'||p.t==='br'||p.t==='fk'||p.t==='bg'||p.t==='pf'){trickSp(p);return}
    if(p.t==='bs'&&NET.mode==='guest'&&!ult&&state==='fight'&&P.act!=='dead'&&!CineCam.busy()){const B=byId[p.b];if(B&&B.f.act!=='dead')startBarrage(B,{a0:p.a,co:true})}
    else if(p.t==='es'&&NET.mode==='guest'&&!ult&&state==='fight'&&P.act!=='dead'&&!CineCam.busy()){const B=byId[p.b];if(B&&B.f.act!=='dead')startEcho(B,{co:true,seed:p.seed,st:p.st})}
    else if(p.t==='ef'&&NET.mode==='host'&&ult&&ult.kind==='echo')echoFound(true)
    else if(p.t==='ee'&&NET.mode==='guest'&&ult&&ult.kind==='echo')echoFound(true)
    else if(p.t==='r'&&NET.mode==='host'&&p.ok){const B=ult?ult.B:foes.find(F=>F.T.barrage);bossReel(B,Barrage.reward(true))}}
  // ---------- boss tricks (Tricks.js): Vael's blink + lifesteal, Skrag's snares. Host decides (seed / spot) and tells the guest; every client judges only its own player's feet and tells the partner what it sprang ----------
  let traps=[],trapG=null,trapN=0,trapSh=null;
  function trapShared(){if(trapSh)return trapSh;trapG=new THREE.Group();trapG.name='WardenTraps';scene.add(trapG);
    trapSh={disc:new THREE.CircleGeometry(1,24),ring:new THREE.RingGeometry(.8,1,28),cone:new THREE.ConeGeometry(.09,.5,5),tooth:new THREE.MeshBasicMaterial({color:0xe2d8c4,fog:false}),
      mk:(c,o)=>new THREE.MeshBasicMaterial(Object.assign({color:c,transparent:true,depthWrite:false,fog:false},o||{}))};return trapSh}
  function trapAdd(id,x,z){const sh=trapShared();if(traps.some(t=>t.id===id))return;
    while(traps.length>=Tricks.SNARE.MAX)trapDel(traps[0]);
    const g=new THREE.Group(),dm=sh.mk(0x7a1010,{opacity:.3}),rm=sh.mk(0xffb030,{opacity:.6}),disc=new THREE.Mesh(sh.disc,dm),ring=new THREE.Mesh(sh.ring,rm);
    disc.rotation.x=ring.rotation.x=-Math.PI/2;g.add(disc);g.add(ring);const teeth=[];
    for(let i=0;i<8;i++){const c=new THREE.Mesh(sh.cone,sh.tooth),a=i/8*Math.PI*2;c.position.set(Math.sin(a)*.62,.15,Math.cos(a)*.62);c.scale.y=.05;g.add(c);teeth.push(c)}
    g.position.set(x,H(x,z)+.08,z);g.scale.setScalar(Tricks.SNARE.R);trapG.add(g);traps.push({id,x,z,age:0,g,dm,rm,teeth,armed:false});
    try{WardenVfx.spawn(x,H(x,z)+.4,z,3,3,1.5,Math.random()*6.28,22)}catch(e){}}
  function trapDel(t){const i=traps.indexOf(t);if(i>=0)traps.splice(i,1);if(t.g.parent)t.g.parent.remove(t.g);t.dm.dispose();t.rm.dispose()}
  function trapsClear(){for(const t of traps.slice())trapDel(t);traps=[]}
  function trapsPlace(seed,n,px,pz,castN){const lay=Tricks.snareLayout(seed,n,px,pz,C&&C.arena);lay.forEach((q,i)=>trapAdd(castN*10+i,q.x,q.z))}
  function trapsTick(dt){
    for(const t of traps.slice()){t.age+=dt;const arm=Tricks.armed(t.age);
      if(arm&&!t.armed){t.armed=true;t.rm.color.setHex(0xff3a22);t.dm.opacity=.42}
      if(!arm){const k=t.age/Tricks.SNARE.ARM;t.rm.opacity=.35+.3*Math.abs(Math.sin(t.age*9));for(const c of t.teeth)c.scale.y=.05+.95*k*k}
      else{t.rm.opacity=.75+.2*Math.sin(t.age*5);for(const c of t.teeth)c.scale.y=1}
      const left=Tricks.SNARE.LIFE-t.age;if(left<2){t.g.visible=Math.floor(t.age*8)%2===0}
      if(left<=0){trapDel(t);continue}
      if(!on||state!=='fight'||!P||P.act==='dead')continue;
      const inv=P.act==='dodge'&&P.pt>=Moves.dodge.iStart&&P.pt<=Moves.dodge.iEnd,r=Tricks.touch(t,P.x,P.z,inv,t.age);if(!r)continue;
      trapDel(t);try{if(NET.mode!=='solo')WardenNet.send({k:'sp',t:'tx',s:site.id,i:t.id})}catch(e){}
      try{WardenVfx.spawn(t.x,H(t.x,t.z)+.6,t.z,r==='bite'?3:2,3,2.2,Math.random()*6.28,24)}catch(e){}
      if(r==='bite'){P.hp=Math.max(1,P.hp-Tricks.bite(P.hpMax));P.act='stun';P.sk='hit';P.stun=Tricks.SNARE.STUN;P.guard=false;P.ph=null;P.mv=null;P.c=0;hurt=true;flash(.55,'rgba(255,70,40,.6)');msg('SNARED',1);try{CameraRig.shake(.4)}catch(e){}sfx('heavy',.8,.8,()=>tone(150,60,.25,'sawtooth',.14))}
      else{flowAdd(12);msg('SNARE SPRUNG',.8);sfx('clash',.4,1.5,()=>tone(900,500,.12,'sine',.08))}}}
  // Vael: the host runs the blink (see trickStep); a guest only shows the mist and the ring that the host announces
  function blinkRing(x,z,on_){if(!blinkRing.m){const mb=new THREE.MeshBasicMaterial({color:0xff2a3a,transparent:true,opacity:.8,depthWrite:false,fog:false});blinkRing.m=new THREE.Mesh(new THREE.RingGeometry(.7,1,32),mb);blinkRing.m.rotation.x=-Math.PI/2;blinkRing.m.scale.setScalar(1.5);scene.add(blinkRing.m)}
    const m=blinkRing.m;m.visible=!!on_;if(on_){m.position.set(x,H(x,z)+.1,z)}}
  function blinkFx(F){try{WardenVfx.burst(F.f.x,H(F.f.x,F.f.z)+1.2,F.f.z,1);flash(.18,'rgba(255,40,60,.5)');tone(300,120,.35,'sawtooth',.08)}catch(e){}}
  function blinkEnd(F){if(!F)return;if(F.bl){F.bl=null;F.body.g.visible=true}blinkRing(0,0,false)}
  function trickStep(evs){
    if(!on||!C||state!=='fight')return;
    for(const e of evs){
      if(e.t==='start'&&byId[e.a]&&byId[e.a].T.boss&&!byId[e.a].ghost&&!byId[e.a].script)for(const d of[decoy,rdecoy])if(d&&d.t>0&&!(d.seen>=2)){d.seen=(d.seen||0)+1;if(d.seen===2)try{toast('A boss sees through your shadow',1.8)}catch(x){}}   // a boss is fooled by a decoy twice, then it knows
      if(e.t==='start'&&NET.mode!=='guest'){const F=byId[e.a];if(!F||F.ghost)continue;if(F.pre&&e.move!==undefined&&!Tricks.isBlink(e.move)){const f=F.f;F.pre=0;if(f.ph&&f.ph[0]&&f.ph[0].n-8>=18){f.pt=8;f.pk=8}}   // dynamic blink: the strike was already under way while he was gone (never cuts the windup under 18 ticks)

        if(F.T.id==='gwyn'&&(e.move==='storm'||e.move==='stormgrid')){wetT=9;try{msg('THE TILES RUN WET',1.4)}catch(x){}}
        if(F.T.id==='gwyn'&&(e.move==='storm'||e.move==='stormgrid'||e.move==='spear'||e.move==='crownfall')){const tg=aiTarget(F.f);voltSpawn(tg.x,tg.z,true,e.move==='crownfall'?3:e.move==='spear'?2:3,e.move==='crownfall'?1000:900)}
        if(F.T.id==='gdn'&&e.move==='sunvolley'){mirrorVolley();illusions(F)}
        if(F.T.ai==='archer'&&Tricks.isBlink(e.move))smokeClone(F);
        if(F.T.id==='vampire'&&Tricks.isBlink(e.move))zoneAdd(F.f.x,F.f.z,true,'decoy',undefined,F);
        if(F.T.id==='ganfaul'){const mm=Moves[e.move];if(mm&&mm.dmg>0&&!mm.fx&&mm.reach<=4.6&&F.f.ph&&F.f.ph[0]){const wf=F.f,wn=Math.round(wf.ph[0].n/60*1000),ax=wf.x+Math.sin(wf.face)*mm.reach*.55,az=wf.z+Math.cos(wf.face)*mm.reach*.55;setTimeout(()=>{if(on&&state==='fight')zoneAdd(ax,az,true,'echo',1.5)},wn)}}
        if(F.T.id==='dknight'){if(Tricks.isBlink(e.move))zoneAdd(F.f.x,F.f.z,true);else if(e.move==='pursuit'||e.move==='march'){if(zones.length)zoneArm(.9,true)}}
        if(Tricks.isBlink(e.move)&&F.T.blink&&!F.bl){const tg=aiTarget(F.f);F.bl={n:0,t:0,tg:tg.id,hide:false,lock:false,vec:F.T.ai==='archer'?'far':Tricks.blinkVec(Math.random,F.ai.ph2),sg:Math.random()<.5?1:-1,long:e.move==='blinkl',sw:0};try{blinkFx(F)}catch(x){}}
        else if(e.move==='snare'&&F.T.traps){F.sn={n:0,tg:aiTarget(F.f).id}}}
      else if(e.t==='hit'&&e.d==='P'&&byId[e.a]&&byId[e.a].T.vamp&&e.dmg>0){const A=byId[e.a],h=Tricks.heal(e.dmg,A.drunk||0,A.f.hpMax);if(h>0){A.drunk=(A.drunk||0)+h;
        if(NET.mode==='guest'){try{WardenNet.send({k:'sp',t:'vh',s:site.id,b:A.id,h:+h.toFixed(2)})}catch(x){}}else A.f.hp=Math.min(A.f.hpMax,A.f.hp+h);
        A.flash=.9;try{WardenVfx.spawn(A.f.x,H(A.f.x,A.f.z)+1.4,A.f.z,3,3,2.6,Math.random()*6.28,24);toast('Vael drinks your blood',1.1)}catch(x){}}}}
    if(NET.mode==='guest')return;
    for(const F of foes){const f=F.f;
      if(F.bl&&F.bl.n!==undefined){const B=F.bl;B.n++;
        if(f.act==='dead'||f.act==='stun'){blinkEnd(F);continue}
        const tg=C.F[B.tg]||P;
        if(!B.lock&&f.act==='attack'&&f.ph&&f.ph[0]&&f.pt>=f.ph[0].n-Tricks.BLINK.REVEAL){B.lock=true;B.spot=Tricks.blinkSpotV(B.vec||'behind',tg.x,tg.z,tg.face,C.arena,B.sg);blinkRing(B.spot.x,B.spot.z,true);try{if(NET.mode==='host'&&Q)WardenNet.send({k:'sp',t:'br',s:site.id,b:F.id,x:+B.spot.x.toFixed(2),z:+B.spot.z.toFixed(2)})}catch(x){}}
        if(B.n>=Tricks.BLINK.HIDE||f.mv&&f.mv.id==='blinkz')f.inv=Math.max(f.inv,3)
        if(f.act==='attack'&&f.ph&&f.ph[f.pi]&&f.ph[f.pi].k==='release'&&f.pk===0){   // the reappearance
          const sp=B.spot||Tricks.blinkSpot(tg.x,tg.z,tg.face,C.arena);try{WardenVfx.burst(sp.x,H(sp.x,sp.z)+1.2,sp.z,1);WardenVfx.slash(sp.x,H(sp.x,sp.z)+1.2,sp.z,tg.face,true,1);WardenVfx.slash(sp.x,H(sp.x,sp.z)+1.5,sp.z,tg.face+1.1,true,1);sfx('whoosh',.6,.7,()=>tone(200,80,.2,'sawtooth',.1))}catch(x){}
          f.x=sp.x;f.z=sp.z;f.face=Math.atan2(tg.x-sp.x,tg.z-sp.z);f.act='free';f.ph=null;f.mv=null;f.inv=0;f.pt=0;f.pk=0;F.ai.cool=0;F.ai.busy=false;
          F.ai.follow=F.T.ai==='gdn'?(Math.random()<.55?'snakelash':'sunvolley'):F.T.ai==='samurai'||F.T.ai==='veil'?(F.ai.ph2&&!F.ai.chain&&Math.random()<(F.ai.cov?.95:.55)?(F.ai.chain=1,'blink'):(F.ai.chain=0,F.T.ai==='samurai'&&F.ai.ph3&&Math.random()<.4?'hundred':Math.random()<.7?'iai':'cut')):Math.random()<.45?'twin':'cut';if(F.T.ai==='archer'){F.ai.follow='bolt'}else if(F.T.ai==='stalker'&&F.ai.ph2&&(F.ai.mc||0)<3&&Math.random()<.6){F.ai.mc=(F.ai.mc||0)+1;F.ai.follow='blink'}else if(F.T.ai==='stalker')F.ai.mc=0;
          if(F.T.id==='dknight'&&zones.length>=3&&zoneConverge(true)){F.ai.follow='finalsentence';F.pre=0}else if(F.T.ai!=='gdn'&&F.T.ai!=='archer'&&F.ai.follow!=='blink'){if(B.vec==='above')F.ai.follow='fall';else if(B.vec!=='behind'&&F.ai.follow==='iai')F.ai.follow=Math.random()<.5?'iai':'cut';F.pre=8}blinkEnd(F)}}
      if(F.sn){const S_=F.sn;S_.n++;if(f.act!=='attack'||!f.mv||f.mv.id!=='snare'){F.sn=null;continue}
        if(f.ph&&f.ph[f.pi]&&f.ph[f.pi].k==='release'&&f.pk===0){F.sn=null;const tg=C.F[S_.tg]||P,n=Tricks.count(F.ai.ph2,!!(Q&&NET.mode==='host')),seed=(Math.random()*2147483647)|0,cn=++trapN;
          trapsPlace(seed,n,tg.x,tg.z,cn);try{if(NET.mode==='host'&&Q)WardenNet.send({k:'sp',t:'tp',s:site.id,seed,n,x:+tg.x.toFixed(2),z:+tg.z.toFixed(2),c:cn})}catch(x){}}}}}
  function trickTick(dt){
    trapsTick(dt);try{if(pvl){pvx+=((S.x-pvl.x)/Math.max(dt,.001)-pvx)*.25;pvz+=((S.z-pvl.z)/Math.max(dt,.001)-pvz)*.25}pvl={x:S.x,z:S.z};zoneTick(dt);houndTick(dt);mirrorTick(dt);smokeTick(dt);pierceTick(dt);dsTick(dt);pinTick(dt);abyssTick(dt);histTick(dt)}catch(e){}
    for(const F of foes){if(!F.T.blink)continue;   // what is shown follows the synced sim state (act / move / phase tick), so host and guest agree even when a phone lags
      const bl=F.f.act==='attack'&&F.f.mv&&Tricks.isBlink(F.f.mv.id);
      if(bl&&!F.bl&&NET.mode==='guest'){F.bl={t:0};blinkFx(F)}
      if(F.bl){F.bl.t+=dt;if(F.bl.long&&bl&&F.f.pt>=Tricks.BLINK.HIDE){F.bl.sw-=dt;if(F.bl.sw<=0){F.bl.sw=.28;try{const a=Math.random()*6.28,r=1.6+Math.random()*1.4;WardenVfx.spawn(P.x+Math.cos(a)*r,H(P.x,P.z)+.6+Math.random()*1.2,P.z+Math.sin(a)*r,3,3,1.8,a,26)}catch(x){}}}
        if(!bl&&NET.mode==='guest'||F.bl.t>(F.bl.long?6.5:4.2)||F.f.act==='dead')blinkEnd(F);else{const hide=bl&&F.f.pt>=(F.f.mv&&F.f.mv.id==='blinkz'?1:Tricks.BLINK.HIDE);if(F.body.g.visible===hide)F.body.g.visible=!hide}}}}
  // The Three Oaths: one signature attack at a time (Tricks.sigBusy); F.sg counts the quiet gap after a signature move ends
  function Foes_sig(q,F){const inSig=q.act==='attack'&&q.mv&&Tricks.SIG[q.mv.id];if(inSig)F.sg=Tricks.GAP;else if(F.sg>0)F.sg--;
    return Tricks.sigBusy(foes.filter(o=>o.T.oath&&!o.ghost).map(o=>({id:o.id,alive:o.f.act!=='dead',act:o.f.act,mv:o.f.mv&&o.f.mv.id,gap:o.sg||0})),F.id)}
  function flaskHunt(){if(!on||state!=='fight')return;if(NET.mode==='guest'){try{WardenNet.send({k:'sp',t:'fk',s:site.id})}catch(e){}return}for(const F of foes)if(F.awake&&F.f.act==='free'&&!F.ghost&&!F.script)DuelistAI.hunt(F.ai)}
  function trickSp(p){
    if(p.t==='tp'&&NET.mode==='guest'){trapsPlace(p.seed,p.n,p.x,p.z,p.c)}
    else if(p.t==='fk'&&NET.mode==='host'){for(const F of foes)if(F.awake&&F.f.act==='free'&&!F.ghost&&!F.script)DuelistAI.hunt(F.ai)}
    else if(p.t==='tx'){const t=traps.find(q=>q.id===p.i);if(t){trapDel(t);try{WardenVfx.spawn(t.x,H(t.x,t.z)+.6,t.z,2,3,2,Math.random()*6.28,24)}catch(e){}}}
    else if(p.t==='vh'&&NET.mode==='host'){const A=byId[p.b];if(A&&A.f.act!=='dead'&&A.T.vamp){const h=Math.min(+p.h||0,A.f.hpMax*.1);A.f.hp=Math.min(A.f.hpMax,A.f.hp+h);A.drunk=(A.drunk||0)+h}}
    else if(p.t==='pf'&&NET.mode==='host'){const F=byId[p.b];if(F&&F.f.act!=='dead'&&!F.f.sa)CombatCore.stun(F.f,p.q?96:30,p.q?'stagger':'recoil')}
    else if(p.t==='bg'&&NET.mode==='host'){const F=byId[p.b];if(F&&F.f.act==='attack'&&F.f.mv&&F.f.mv.bg)CombatCore.stun(F.f,84,'stagger')}
    else if(p.t==='br'&&NET.mode==='guest'){const F=byId[p.b];if(F&&F.f.act==='attack'&&F.f.mv&&F.f.mv.id==='blink')blinkRing(p.x,p.z,true)}}
  let pun=null;
  function punTick(dt){   // after a perfect barrage: you vault onto the boss and the Plunge Strike lands on his broken guard
    const q=pun,B=q.B;q.t+=dt;if(!on||P.act==='dead'||!B||B.f.act==='dead'||state!=='fight'){pun=null;return}
    if(q.s===0){const dx=B.f.x-P.x,dz=B.f.z-P.z,d=Math.hypot(dx,dz),a=Math.atan2(dx,dz);
      if(d>2.6){CombatCore.moveBy(C,P,dx/d*(d-2.3),dz/d*(d-2.3));S.x=P.x;S.z=P.z;lx=S.x;lz=S.z}
      S.rot=P.face=a;pendFace=null;
      if(P.act==='free'&&S.grounded){jumpQ=true;q.s=1;q.t=0;msg('PUNISH',.9);try{tone(500,1300,.2,'triangle',.13)}catch(e){}}else if(q.t>.7)pun=null;return}
    if(q.s===1&&q.t>.24){ST.input('P',{t:'light',e:C.tick,adv:false},now());q.s=2;q.t=0;return}
    if(q.s===2&&q.t>1.3)pun=null}
  function barrageTick(dt){
    if(ult&&ult.kind==='echo'){echoTick(dt);return}
    if(!ult){
      if(pun){punTick(dt);return}
      if(!on||state!=='fight'||P.act!=='free'||P.hp<25||NET.mode==='guest'||Q&&Q.act==='dead'||CineCam.busy())return;
      for(const F of foes){if(!F.T.barrage||F.ghost||!F.awake||F.f.act!=='free'||F.f.inv>0)continue;const s=Barrage.stage(F.f.hp/F.f.hpMax);if(s>(F.bar||0)){F.bar=s;startBarrage(F);return}}
      for(const F of foes){if(!F.T.echo||F.ghost||!F.awake||F.f.act!=='free'||F.f.inv>0)continue;const s=Echo.stage(F.f.hp/F.f.hpMax);if(s>(F.ech||0)){F.ech=s;startEcho(F,{co:!!(Q&&NET.mode==='host'),seed:(Math.random()*2147483647)|0,st:s});return}}
      return}
    const U=ult,rdt=dt/Math.max(.05,tsc);U.t+=rdt;
    for(const F of U.all)if(F.ghost)ghostLook(F);
    if(U.ph==='pop'){
      if(U.t>.45&&!U.fx){U.fx=1;for(const F of U.all)if(F.ghost){try{WardenVfx.burst(F.f.x,H(F.f.x,F.f.z)+1.3,F.f.z,1);WardenVfx.spawn(F.f.x,H(F.f.x,F.f.z)+1.2,F.f.z,1,3,3.4,0,24)}catch(e){}}flash(.5,'rgba(170,110,255,.8)')}
      if(U.t>Barrage.POP-.35)bq('.tx').classList.add('on');
      if(U.t>=Barrage.POP){   // strike
        P.st=P.stMax;const dm=Barrage.dmFor(P.hpMax,P.hp,Moves[Barrage.MOVE].dmg,Barrage.count(U.roles,U.role));
        U.all.forEach((F,k)=>{const mine=U.roles[k]===U.role;if(!mine&&!(U.co&&Q))return;F.f.dm=mine?dm:.001;ST.input(F.id,{t:'atk',m:Barrage.MOVE},now())})   // the partner's attackers lunge at the partner's puppet: shown, never damaging you
        U.T0=C.tick+1;U.ph='wind';tsc=1;try{tone(220,60,.5,'sawtooth',.12)}catch(e){}
        try{el.querySelector('#wDodge').classList.add('pulse')}catch(e){}}
      return}
    if(U.ph==='wind'){
      const tk=C.tick-U.T0;tsc=Barrage.speed(tk,0);
      const r=Barrage.ring(tk),rs=bq('.rs');rs.style.opacity=tk>4?1:0;const sz=14+30*Math.max(0,1-r);rs.style.width=rs.style.height=sz+'vmin';rs.classList.toggle('go',Barrage.inWindow(tk));bq('.rt').style.opacity=tk>4?1:0;
      const fin=tk>40||(tk>14&&U.all.every(F=>F.f.act==='free'));
      if(fin){U.ph='out';U.t2=0;U.res=U.hits===0?'perfect':'hit';if(U.res==='perfect'){U.ph='def';U.def={k:0,t:0,n:0,list:U.all.filter(F=>U.mine.has(F.id)),wait:0}}
        for(const q of barEl.querySelectorAll('.rg'))q.style.opacity=0;bq('.tx').classList.remove('on');try{el.querySelector('#wDodge').classList.remove('pulse')}catch(e){}
        const rr=bq('.rr');rr.classList.add('on');
        if(U.res==='perfect'){rr.textContent='DEFLECTED';rr.style.color='#ffe27a';flash(.8,'rgba(255,236,150,.9)');try{CameraRig.shake(.7);tone(900,1800,.35,'triangle',.14);tone(1300,2200,.3,'sine',.1)}catch(e){}
          const B=U.B,rw=Barrage.reward(U.co);if(NET.mode==='guest'){try{WardenNet.send({k:'sp',t:'r',s:site.id,ok:1})}catch(e){}}else bossReel(B,rw);flowAdd(60);P.st=P.stMax;
          for(const F of U.all){try{WardenVfx.clash(F.f.x,H(F.f.x,F.f.z)+1.3,F.f.z,true)}catch(e){}}}
        else{rr.textContent='OVERWHELMED';rr.style.color='#ff5a4a';flash(.9,'rgba(255,60,40,.85)');try{CameraRig.shake(.9)}catch(e){}}}
      return}
    if(U.ph==='def'){   // the three blades are turned aside ONE BY ONE in slow motion (you swing at each: sparks, ring tone, shake, he recoils), then you leap onto the boss
      tsc=.42;const q=U.def;q.t+=rdt;q.wait+=rdt;
      if(q.k===0&&P.act!=='free'&&q.wait<.5){q.t=0;return}
      if(q.k<q.list.length&&q.t>=q.k*.66){const A=q.list[q.k];
        try{const a=Math.atan2(A.f.x-P.x,A.f.z-P.z);S.rot=P.face=a;pendFace=null;parryAlt^=1;if(pAnim)pAnim.flick=parryAlt?{t:0,c:'slash',a:.28,b:.7,d:.42}:{t:0,c:'atk4',a:.12,b:.56,d:.42};
          const mx=(P.x+A.f.x)/2,mz=(P.z+A.f.z)/2,y=H(mx,mz)+1.35;WardenVfx.clash(mx,y,mz,true);WardenVfx.clash(mx,y+.1,mz,true);WardenVfx.burst(mx,y,mz,3);
          tone(900+q.k*330,1700+q.k*400,.2,'triangle',.14);tone(300,150,.1,'square',.1);CombatCore.stun(A.f,56,'recoil');if(bc)bc.sh=.5}catch(e){}
        flash(.45,'rgba(190,225,255,.9)');try{CameraRig.shake(.5)}catch(e){}msg('DEFLECT '+(q.k+1)+' / '+q.list.length,.55);q.k++}
      if(q.k>=q.list.length&&q.t>=q.k*.66+.45){const B=U.B;endBarrage();if(B&&B.f.act!=='dead')pun={t:0,s:0,B};return}
      return}
    // 'out': ease back to normal speed, then clean up
    tsc=Barrage.speed(0,Math.max(.001,Math.min(1,U.t2/.9)));U.t2+=rdt;
    if(U.t2>1.0){endBarrage()}}
  // ================= FIGHT JUMP + AFTERIMAGE (Shadow) =================
  // Jump: the normal jump (index.html), now a button in the fight HUD. While you are high enough, ground attacks whiff (SwordHit's height band) - it costs stamina and has a short cooldown so it is a dodge, not a god mode.
  // Shadow: you blink away (+ a dodge's invulnerability) and leave an afterimage for a few seconds. Every foe aims at it, hits it, and it bursts after two hits or when time runs out.
  let parryTip=0,sideTip=0,jumpTip=0,jumpCd=0,shCd=0,decoy=null,rdecoy=null,gBase=0;
  function fightJump(){
    if(!on||ult||P.act==='dead'||jumpCd>0||!S.grounded||S.flying||P.st<10)return false;
    if(P.act==='attack'||P.act==='stun'||P.act==='dodge')return false;P.st-=10;jumpCd=.9;jumpQ=true;if(!jumpTip){jumpTip=1;toast('Jump + Light = Plunge Strike',2.6)}return true}
  // an afterimage: a team-'p' fighter (foes aim at it) + a translucent cyan avatar. id 'Z' = yours, 'Y' = your partner's (sent over the net so both of you see it and the foes hitting it)
  // The afterimage is a copy of YOUR model (same skin and skeleton), frozen in an idle pose and tinted cyan. It used to be the generic capsule avatar (dress() never ran on it): that was the "placeholder" look.
  // SkeletonUtils.clone shares the geometry, so it costs next to nothing; if the player model is not available the capsule is the fallback.
  function tintGhost(root,hex,em,op){root.traverse(o=>{if(o.isMesh&&o.material&&!o.userData.gh){o.userData.gh=1;const m=[].concat(o.material).map(q=>{const c=q.clone();c.transparent=true;c.opacity=op;c.depthWrite=false;if(c.color)c.color.lerp(new THREE.Color(hex),.8);if(c.emissive)c.emissive.setHex(em);if('emissiveIntensity' in c)c.emissiveIntensity=1.4;return c});o.material=Array.isArray(o.material)?m:m[0]}})}
  function decoyBody(){
    const u=me&&me.userData;
    if(u&&u.model&&THREE.SkeletonUtils)try{
      const g=new THREE.Group(),cm=THREE.SkeletonUtils.clone(u.model);cm.traverse(o=>{if(o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=false}});
      cm.traverse(o=>{if(o.isBone)for(const c of o.children.slice())if(!c.isBone)o.remove(c)});   // sword/pan/rod groups hang off bones: not part of the afterimage
      g.add(cm);tintGhost(g,0x6fd6ff,0x2aa0ff,.72);
      const mx=new THREE.AnimationMixer(cm),src=((u.nact||u.act||{}).idle),clip=src&&src.getClip&&src.getClip();
      if(clip){const a=mx.clipAction(clip);a.play();mx.update(.05)}
      g.userData.mx=mx;return g}catch(e){}
    const g=makeAvatar('','#6fd6ff');for(const c of g.children.slice())if(c.isSprite)g.remove(c);tintGhost(g,0x6fd6ff,0x2aa0ff,.72);return g}
  function mkDecoy(id,x0,z0,fc,life){
    const Z=C.F[id]=CombatCore.mkFighter(id,{x:x0,z:z0,face:fc,hp:99999,team:'p'});if(!C.order.includes(id))C.order.push(id);Z.r=.45;
    const g=decoyBody();scene.add(g);
    {const rm=new THREE.MeshBasicMaterial({color:0x6fd6ff,transparent:true,opacity:.9,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}),rg=new THREE.Mesh(new THREE.RingGeometry(.7,.9,28),rm);rg.rotation.x=-Math.PI/2;rg.position.y=.06;rg.renderOrder=996;g.add(rg)}
    g.position.set(x0,H(x0,z0),z0);g.rotation.y=fc;return{id,t:life,g,hits:0}}
  function shadowStep(){
    if(!on||ult||P.act==='dead'||shCd>0||P.st<20||P.act==='stun'||state!=='fight')return false;
    const d=stickDir()||[-Math.sin(S.rot),-Math.cos(S.rot)],x0=P.x,z0=P.z,fc=S.rot;
    killDecoy(true);decoy=mkDecoy('Z',x0,z0,fc,sty.shLife);try{shadowPiercer()}catch(e){}
    CombatCore.moveBy(C,P,d[0]*2.6,d[1]*2.6);S.x=P.x;S.z=P.z;lx=S.x;lz=S.z;
    ST.input('P',{t:'dodge',e:C.tick,dx:d[0],dz:d[1]},now());P.st-=20;shCd=9*sty.shCd;
    try{WardenVfx.spawn(x0,H(x0,z0)+1,z0,2,4,3,-fc+Math.PI/2,30);WardenVfx.spawn(P.x,H(P.x,P.z)+1,P.z,2,4,3,-fc+Math.PI/2,30);flash(.25,'rgba(120,210,255,.8)');tone(500,1400,.18,'triangle',.1)}catch(e){}
    try{if(NET.mode!=='solo')WardenNet.send({k:'dc',s:site.id,x:+x0.toFixed(2),z:+z0.toFixed(2),f:+fc.toFixed(2),t:sty.shLife,sx:+P.x.toFixed(2),sz:+P.z.toFixed(2)})}catch(e){}   // partner: afterimage here (+ where I blinked to, for the streak)
    msg('AFTERIMAGE',.7);return true}
  function remoteDecoy(p){
    if(!on||!C||!site||p.s!==site.id)return;killDecoy(true,'Y');rdecoy=mkDecoy('Y',p.x,p.z,p.f||0,p.t||4.5);
    try{WardenVfx.spawn(p.x,H(p.x,p.z)+1,p.z,2,4,3,-(p.f||0)+Math.PI/2,30);if(p.sx!==undefined)WardenVfx.spawn(p.sx,H(p.sx,p.sz)+1,p.sz,2,4,3,-(p.f||0)+Math.PI/2,30)}catch(e){}}
  function killDecoy(quiet,which){
    for(const w of which?[which]:['Z','Y']){const d=w==='Z'?decoy:rdecoy;if(!d)continue;
      if(d.g&&d.g.parent)d.g.parent.remove(d.g);if(d.g)d.g.traverse(o=>{if(o.userData&&o.userData.gh&&o.material)for(const m of [].concat(o.material))m.dispose()});
      if(C&&C.F[w]){if(!quiet)try{WardenVfx.burst(C.F[w].x,H(C.F[w].x,C.F[w].z)+1.1,C.F[w].z,2)}catch(e){}delete C.F[w];const k=C.order.indexOf(w);if(k>=0)C.order.splice(k,1)}
      if(w==='Z')decoy=null;else rdecoy=null}}
  function decoyTick(d,w,dt){
    if(!d)return;d.t-=dt;const Z=C.F[w];if(!Z||d.t<=0||d.hits>=2){killDecoy(false,w);return}
    if(d.g.userData.mx)d.g.userData.mx.update(dt);d.g.position.set(Z.x,H(Z.x,Z.z),Z.z);d.g.rotation.y=Z.face;d.g.visible=d.t>1.2||Math.floor(d.t*10)%2===0}
  function fightMoveTick(dt){
    if(jumpCd>0)jumpCd-=dt;if(shCd>0)shCd-=dt;
    // height above the floor you stand on (the baseline follows the ground; jumping raises P.y, which the hit test uses)
    if(S.grounded||S.state==='swim')gBase=S.y;P.y=Math.max(0,S.y-gBase);
    decoyTick(decoy,'Z',dt);decoyTick(rdecoy,'Y',dt);
    const b=el&&el.querySelector('#wShadow');if(b){const t=shCd>0?Math.ceil(shCd):0;if(b._c!==t){b._c=t;b.textContent=t?'Shadow '+t:'Shadow';b.classList.toggle('cd',t>0)}}}
  function leave(hold){wetT=0;try{houndsClear()}catch(e){}pun=null;pcs.n=0;ls=null;ds=null;pin=null;try{mirrorsClear()}catch(e){}try{zonesClear()}catch(e){}try{if(moodEl)moodEl.style.opacity='0'}catch(e){}svEnd();try{WardenFx.clear()}catch(e){}   // hold: keep the corpses of a cleared site in the world
    if(!on)return;endSet();trapsClear();try{blinkRing(0,0,false)}catch(e){}killDecoy(true);netLeave();if(site&&site.duel)duelLeave();releaseAll();on=false;lock=false;document.body.classList.remove('warden-fight');document.body.classList.remove('warden-duel');if(sword&&sword.grip)sword.grip.visible=false;if(sword2&&sword2.grip)sword2.grip.visible=false;pendFace=null;for(const w of [twinR,twinL])if(w&&w.grip)w.grip.visible=false;if(stance==='twin'){stance='main';if(pAnim){try{pAnim.off()}catch(e){}pAnim=null}try{const b=el&&el.querySelector('#wSwap');if(b){b.classList.remove('on');b.textContent='Twin'}}catch(e){}}
    if(pAnim)pAnim.off();for(const F of foes)if(F.anim)F.anim.off();arenaRes(false);try{CameraRig.setBias(0);CameraRig.combat(0,0);CameraRig.setArena(null);CameraRig.setFocus(null)}catch(e){}if(tmk)tmk.visible=false;for(const g of thr)g.visible=false;for(const a of thA)a.style.display='none';WardenFx.clear();WardenVfx.clear();
    if(!hold){for(const F of foes)freeBody(F.body);foes=[];if(site)rt(site).foes=[]}
    try{if(site&&site.fog)WardenIsles.fog(site.id,rt(site).cleared?'gone':'idle')}catch(e){}}
  // ---------- per frame ----------
  function speedMul(sprint){
    if(!on||!P)return 1;const base=sprint?12:6;if(P.act==='dead')return 0;
    if(state==='fight'&&!foes.some(F=>F.awake&&F.f.act!=='dead'))return 1;      // nobody is after you: explore at normal speed
    if(P.act==='free')return(P.guard?GSPD:SPD)/base;if(P.act==='charge')return CSPD/base;return 0}
  const sfx=(n,v,r,fb)=>{if(!WardenSfx.play(n,v,r)&&fb)fb()};let hurt=false,fightVo=false;
  // ---- impact juice (Sekiro-style): a white-orange flash, extra sparks and a camera punch when YOUR sword lands; a streak when you dodge ----
  let flEl=null,flT=0;
  function flash(k,col){
    if(!flEl){try{const c=document.createElement('style');c.textContent='#wflash{position:fixed;inset:0;z-index:5;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 58%,rgba(255,244,214,.85) 0%,rgba(255,150,60,.45) 28%,rgba(255,90,20,0) 62%);mix-blend-mode:screen}';document.head.appendChild(c);flEl=document.createElement('div');flEl.id='wflash';document.body.appendChild(flEl)}catch(e){return}}
    flEl.style.background='radial-gradient(circle at 50% 58%,'+(col||'rgba(255,244,214,.85)')+' 0%,rgba(255,150,60,.45) 28%,rgba(255,90,20,0) 62%)';flEl.style.transition='none';flEl.style.opacity=String(Math.min(.8,k));void flEl.offsetWidth;flEl.style.transition='opacity .22s ease-out';flEl.style.opacity='0'}
  function punch(e,f){
    if(e.t==='hit'&&e.a==='P'){const big=e.dmg>=20||e.crit;const y=H(f.x,f.z)+1.3;
      WardenVfx.spawn(f.x,y,f.z,3,3,big?3.2:2.2,Math.random()*6.28,30);if(big)WardenVfx.spawn(f.x,y,f.z,0,3,3.8,Math.random()*6.28,26);
      flash(big?.55:.26);try{CameraRig.shake(big?.5:.22)}catch(x){}}
    else if(e.t==='brokenguard'&&e.d==='P'){flash(.6,'rgba(255,220,140,.9)');try{CameraRig.shake(.5)}catch(x){}if(NET.mode==='guest'){try{WardenNet.send({k:'sp',t:'bg',b:e.a})}catch(x){}}}
    else if(e.t==='deflect'&&e.d==='P'){flash(.4,'rgba(190,225,255,.85)');try{CameraRig.shake(.42)}catch(x){}parryFx(e);
      if(e.pf&&!ult){try{CameraRig.pulse(-3.2);CameraRig.shake(.1)}catch(x){}hsT=Math.max(hsT,e.sq?.6:.22);flash(.45,'rgba(255,215,120,.8)');msg(e.sq?'PERFECT SEQUENCE':'PERFECT',e.sq?1.6:.7);try{sfx('clash',.6,1.7,()=>tone(1900,1100,.22,'sine',.1));if(e.sq)CameraRig.shake(.7)}catch(x){}
        if(NET.mode==='guest'){try{WardenNet.send({k:'sp',t:'pf',b:e.a,q:e.sq?1:0})}catch(x){}}}}
    else if(e.t==='dodge'&&e.a==='P'){try{if(CAMS.move&&!ult&&!sv)CameraRig.pulse(1.6)}catch(x){}WardenVfx.spawn(P.x,H(P.x,P.z)+1,P.z,2,4,2.8,-P.face+Math.PI/2,30)}}
  // PARRY: a real sweep of the sword (pAnim.flick, alternating sides), a short hit-stop so you SEE the clash, a double burst of sparks between you and him, a bright ring and a rising ring tone
  let parryAlt=0,hsT=0;
  function parryFx(e){
    if(ult)return;parryAlt^=1;hsT=.13;
    if(pAnim)pAnim.flick=parryAlt?{t:0,c:'slash',a:.28,b:.7,d:.3}:{t:0,c:'atk4',a:.12,b:.56,d:.3};
    try{const A=byId[e.a],ax=A?A.f.x:P.x+Math.sin(P.face),az=A?A.f.z:P.z+Math.cos(P.face),mx=(P.x*2+ax)/3,mz=(P.z*2+az)/3,y=H(mx,mz)+1.35;WardenVfx.clash(mx,y,mz,true);WardenVfx.clash(mx,y+.12,mz,true);WardenVfx.burst(mx,y,mz,3);tone(1900,2600,.12,'triangle',.1)}catch(x){}
    msg('PARRY',.45)}
  function vfxAt(e,f){const y=H(f.x,f.z)+1.3;if(e.t==='hit')WardenVfx.hit(f.x,y,f.z,e.crit,e.dmg>=20);else if(e.t==='block')WardenVfx.clash(f.x,y,f.z);else if(e.t==='deflect')WardenVfx.clash(f.x,y,f.z,true);else WardenVfx.burst(f.x,y,f.z,e.t==='posturebreak'?0:3)}
  function events(evs){
    echoEvents(evs);
    if(ult)for(const e of evs){if(e.t==='hit'&&e.d==='P'&&ult.mine.has(e.a))ult.hits++;else if(e.t==='dodged'&&e.d==='P'&&ult.mine.has(e.a))ult.dodged++}
    if(decoy||rdecoy)for(const e of evs){if(e.t==='hit'&&(e.d==='Z'||e.d==='Y')){const d=e.d==='Z'?decoy:rdecoy,Z=C.F[e.d];if(d)d.hits++;if(Z)try{WardenVfx.hit(Z.x,H(Z.x,Z.z)+1.2,Z.z,false,false)}catch(x){}}}
    if(PC._log)for(const e of evs)if(e.t!=='hitstop')PC._log.push(e);
    for(const e of evs){
      const A=byId[e.a],T=byId[e.d];
      if(e.t==='dead'&&T&&T.human&&!e._rep){T.f.act='free';T.f.hp=Math.max(1,T.f.hp);T.f.mv=null;T.f.ph=null;continue}
      flowEv(e,T);supEv(e);svHit(e);try{spEv(e,A)}catch(x){}try{setEv2(e)}catch(x){}
      if(e.t==='fx'||e.t==='fxburst'||e.t==='fxend'){if(e.t==='fx'&&A&&A.T)e.fk=A.T.id;WardenFx.event(e);
        if(e.t==='fxburst'&&!ult){const st=WardenFx.styleOf(e.fid);if(st==='lightning'||st==='sun'||st==='eclipse'){const dd=Math.hypot(P.x-e.x,P.z-e.z);if(dd<(e.r||3)+9){flash(st==='lightning'?.22:.16,st==='lightning'?'rgba(200,228,255,.5)':'rgba(255,220,150,.35)');try{CameraRig.shake(dd<(e.r||3)+1?.28:.12)}catch(x){}}}}}
      {const fp=e.t==='hit'||e.t==='block'||e.t==='deflect'||e.t==='posturebreak'||e.t==='guardbreak'?(T?T.f:(e.d==='P'?P:null)):null;if(fp){vfxAt(e,fp);punch(e,fp)}else if(e.t==='dodge')punch(e,P)}
      if(e.t==='start'&&e.per&&e.a!=='P'&&!ult){try{CameraRig.pulse(-2.2)}catch(x){}hsT=Math.max(hsT,.3);flash(.5,'rgba(255,40,40,.55)');msg('危  PERILOUS',.9);try{sfx('heavy',.7,.7,()=>tone(520,260,.35,'square',.1));CameraRig.shake(.25)}catch(x){}}
      else if(e.t==='perdodge'&&!ult){try{CameraRig.pulse(-4);CameraRig.shake(.25)}catch(x){}hsT=Math.max(hsT,.2);msg('OPENING!',.9);flash(.35,'rgba(255,230,160,.6)')}
      if(e.t==='start'){if(e.a==='P'||A&&e.move&&A.f){const q=e.a==='P'?P:A.f;if(q&&(e.a==='P'||/atk|cut|slam|sweep|swipe|heavy|light/.test(e.move)))WardenVfx.slash(q.x,H(q.x,q.z)+1.2,q.z,q.face,/heavy|slam/.test(e.move),e.a==='P'?0:1)}if(e.a==='P'){if(e.move==='rush'){WardenVfx.spawn(P.x,H(P.x,P.z)+1,P.z,2,4,3.4,-P.face+Math.PI/2,32);flash(.22,'rgba(200,225,255,.7)')}if(e.move==='light'&&pAnim)pAnim.nextLight(performance.now()/1000);sfx('whoosh',.4,e.move==='heavy'?.75:1.1,()=>tone(e.move==='heavy'?220:380,e.move==='heavy'?90:150,e.move==='heavy'?.18:.1,'triangle',.1))}else{try{telegraph(A,e.move)}catch(x){}if(A&&A.anim&&A.anim.pickAlt)A.anim.pickAlt(e.move,Math.random());sfx('whoosh',.35,.8,()=>tone(160,70,.16,'sawtooth',.07))}}
      else if(e.t==='dodge'&&e.a==='P')tone(200,80,.14,'sine',.08);
      else if(e.t==='hit'){if(T&&e.a==='P'){if(wst.bleed&&T.f.act!=='dead')T.bleed={t:4,dps:wst.bleed};if(wst.vamp&&P.hp>0)P.hp=Math.min(P.hpMax,P.hp+e.dmg*wst.vamp)}if(T){T.flash=1;T.lh=performance.now();wake(T,true);sfx(e.dmg>=20||e.crit?'heavy':'strike',.8,e.crit?.85:1,()=>tone(140,50,.14,'square',.14));if(e.crit)msg('CRITICAL');if(T.body.T.body==='avatar')T.body.u.hitReq=1}else{sfx(e.dmg>=20?'heavy':'strike',.9,.9,()=>tone(110,40,.18,'square',.16));if(e.d==='P'&&P.hp>0){hurt=true;msg('',0);hitFrom(A,e.move)}}}
      else if(e.t==='block')sfx('clash',.36,.9,()=>tone(420,260,.1,'square',.06));
      else if(e.t==='brokenguard'){sfx('heavy',.8,1.3);msg('GUARD BROKEN',1.1)}
      else if(e.t==='deflect'){sfx('clash',.52,1.4,()=>tone(1500,900,.18,'sine',.09));msg(T?'':'DEFLECTED',.5)}
      else if(e.t==='posturebreak'&&T){if(T.T.boss)msg('POSTURE BROKEN');sfx('heavy',.8,1.1,()=>tone(500,120,.3,'sawtooth',.12))}
      else if(e.t==='posturebreak'&&e.d==='P'){msg('POSTURE BROKEN',.8);sfx('heavy',.9,.8,()=>tone(300,90,.3,'sawtooth',.12))}
      else if(e.t==='phase'&&T){T.flash=1.2;sfx('heavy',.8,.5,()=>tone(90,50,.5,'sawtooth',.16));if(e.rise){riseCine(T);try{CameraRig.shake(.7)}catch(x){}flash(.5,'rgba(255,255,255,.5)');setTimeout(()=>{if(on&&T.f.act!=='dead'){sfx('heavy',.9,.4,()=>tone(70,35,.8,'sawtooth',.18));try{CameraRig.shake(.8)}catch(x){}flash(.45,'rgba(255,200,120,.6)')}},4100)}}
      else if(e.t==='guardbreak'){sfx('heavy',.9,.85,()=>tone(250,70,.3,'sawtooth',.14));if(e.d==='P')msg('GUARD BROKEN',.8)}
      else if(e.t==='dead'&&T){if(T.T.oath&&!oathFirst){const rest=foes.filter(o=>o!==T&&o.T.oath&&o.f.act!=='dead');if(rest.length){oathFirst=T.T.ai;for(const o of rest){o.ai.cov=T.T.ai;o.ai.ph2=true}setTimeout(()=>{if(on)msg('THE COVENANT BREAKS',2.4)},900)}}if(!T.human&&!site.duel)flaskDrop(T.T);if(T.T.id==='oath4'){try{WardenProg.earn(600);toast('THE OATH IS BROKEN \u00b7 +600 embers',4)}catch(x){}}sfx('heavy',.7,.7,()=>tone(200,40,.5,'sawtooth',.14));if(T.body.T.body==='avatar')T.body.u.emoteReq='playdead';if(T.T.boss){if(!ult&&!foes.some(o=>o!==T&&o.T.boss&&o.f.act!=='dead')){hsT=Math.max(hsT,1.25);flash(.7,'rgba(255,255,255,.75)');try{CameraRig.shake(.6)}catch(x){}}CineCam.play('death',{x:T.f.x,z:T.f.z,h:1.2*T.T.scale,sc:Math.max(1,T.T.scale*.9)},{id:T.T.id});msg(T.T.name.toUpperCase()+' IS FELLED',3);setTimeout(()=>WardenSfx.play(hurt?'vo_winner':'vo_flawless_victory',.8,1,{nojit:1}),700)}
        if(lock&&lockI===T.i){const n=nearest();if(n&&n!==T)lockI=n.i;else{lock=false;el.querySelector('#wLock').classList.remove('on')}}
        if(!alive().length){state='won';stateT=performance.now();lock=false;el.querySelector('#wLock').classList.remove('on');if(site.duel)duelOver(true)}}
      else if(e.t==='dead'&&e.d==='P'&&(NET.mode==='host'||NET.mode==='guest')&&Q&&Q.act!=='dead'&&!site.duel){lsStart();msg('YOU FELL \u00b7 your partner can bring you back',3);sfx('heavy',.8,.6,()=>tone(180,35,.6,'sawtooth',.16));spectate=true}
      else if(e.t==='dead'&&e.d==='P'){if(site.duel)setTimeout(()=>duelOver(false),0);else PG.die(site.id,P.x,P.z);msg('YOU DIED',3);sfx('heavy',.8,.6,()=>tone(180,35,.6,'sawtooth',.16));setTimeout(()=>WardenSfx.play('vo_game_over',.8,1,{nojit:1}),600);state='lost';stateT=performance.now()}}}
  // dormant foes sit / stand sheathed until you come near: rouse() starts the draw / roar / power-up clip, rise() hands them to the AI once it ends; a hit skips the show
  function rouse(F,skip){if(F.awake||F.dorm==='wake'&&!skip)return;if(skip||!F.anim){rise(F);return}F.dorm='wake';F.wakeT=0;if(F.T.boss){CineCam.play('intro',{x:()=>F.f.x,z:()=>F.f.z,h:1.75*F.T.scale,sc:Math.max(1,F.T.scale*.9)},{id:F.T.id});msg(F.T.name,2.4);sfx('heavy',.6,.55,()=>tone(90,45,.6,'sawtooth',.14));WardenSfx.play('vo_prepare_yourself',.8,1,{nojit:1})}else if(!fightVo){fightVo=true;WardenSfx.play('vo_fight',.8,1,{nojit:1})}}
  let wokeN=0;
  function rise(F){if(!F.woke)F.woke=++wokeN;F.dorm=null;F.awake=true;F.dormSync=null;if(F.anim&&F.anim.setMode)F.anim.setMode(null)}
  function wake(F,skip){rouse(F,skip);if(F.T.pack)for(const o of foes)if(o.T.pack&&!o.awake&&Math.hypot(o.f.x-F.f.x,o.f.z-F.f.z)<14)rouse(o,skip)}
  function locoOf(v,x,z,face,dt){   // smoothed world velocity -> speed + components along / to the left of the facing
    if(!v.init||dt<=0){v.x=x;v.z=z;v.init=true;v.vf=v.vs=v.sp=0;return}
    const k=Math.min(1,dt*10),vx=(x-v.x)/dt,vz=(z-v.z)/dt;v.x=x;v.z=z;const fx=Math.sin(face),fz=Math.cos(face),f=vx*fx+vz*fz,l=vx*fz-vz*fx;   // left = (cos, -sin)
    v.vf+=(f-v.vf)*k;v.vs+=(l-v.vs)*k;v.sp=Math.hypot(v.vf,v.vs)}
  // a cleared site keeps its corpses until you are well away, then it re-arms (fight it again whenever you like)
  function rearm(wx,wz){for(const s of SITES()){const r=RT[s.id];if(!r||!r.cleared)continue;if(s.dg&&WardenDungeon.isCleared(s.id))continue;if(Math.hypot(wx-s.x,wz-s.z)>s.R+45){r.cleared=false;for(const F of r.foes)freeBody(F.body);r.foes=[];try{if(s.fog)WardenIsles.fog(s.id,'idle')}catch(e){}}}}
  function tick(dt,t){
    if(msgT>0&&el){msgT-=dt;if(msgT<=0)el.querySelector('#wmsg').classList.remove('on')}   // the banner times out even after the fight is over (it used to stay up until you left the isle)
    const wx=S.x-WRD.x,wz=S.z-WRD.z;chipTick(wx,wz);lostMark(t,dt);if(toastT>0){toastT-=dt;if(toastT<=0&&toastEl)toastEl.classList.remove('on')}
    if(!on){rearm(wx,wz);
      for(const k in RT)for(const F of RT[k].foes||[])if(F.f.act==='dead'&&Math.hypot(F.f.x-S.x,F.f.z-S.z)<70)foeTick(F,dt,0);   // corpses of cleared sites keep animating until they have finished falling
      if(S.flying||S.state==='swim'||!S.grounded||!me||!me.userData.nact)return;
      if(exitLock){const q=SITES().find(z=>z.id===exitLock);if(!q||Math.hypot(wx-q.x,wz-q.z)>q.R+1.5)exitLock=null}
      const s=SITES().find(q=>!q.safe&&!rt(q).cleared&&q.id!==exitLock&&Math.hypot(wx-q.x,wz-q.z)<q.R-(q.wall?1.5:1)&&(!q.duel||duelPartnerNear(q))&&(!q.req||hiddenOpen(q)));
      if(!s){const dq=SITES().find(q=>q.duel&&q.id!==exitLock&&Math.hypot(wx-q.x,wz-q.z)<q.R-1);if(dq&&performance.now()-duelHint>6000){duelHint=performance.now();toast('The Ashen Arena is for duels \u00b7 another player has to be nearby',3.2)}}
      if(s)engage(s);if(!on)return}
    const d=Math.hypot(wx-site.x,wz-site.z);
    if(S.flying||S.state==='swim'){leave(false);return}
    if(site.fog||site.duel&&DU.pair){if((state!=='won'||site.duel)&&d>site.R-.8){const k=(site.R-.8)/d;S.x=WRD.x+site.x+(wx-site.x)*k;S.z=WRD.z+site.z+(wz-site.z)*k}}      // the fog gate holds you in until the foe is felled
    else if(d>site.R+(site.wall?1.5:4)){leave(false);return}
    {const rn=performance.now();if(!vl)vl=rn;const rd=Math.min(100,rn-vl);if(!ult&&!sv){if(hsT>0){hsT-=rd/1000;tsc=.16}else if(tsc===.16)tsc=1}vt+=rd*tsc;vl=rn;dt*=tsc}
    ensureAvatars();duelNet(dt);
    // end-of-fight handling
    try{lsTick(dt)}catch(e){}
    if(spectate&&(!Q||Q.act==='dead')){lsFail();spectate=false;state='lost';stateT=performance.now()}
    if(site.duel){if(DU.over&&performance.now()-DU.overT>4200){DU.over=false;if(DU.pair)duelBegin();else{startFight();msg('Again.',1.2)}}}
    else if(state==='lost'&&performance.now()-stateT>3200){startFight();msg('Again.',1.4)}
    else if(state==='won'&&performance.now()-stateT>(PC.loop?5000:4500)){
      if(PC.loop){startFight();msg('Again.',1.4)}else{rt(site).cleared=true;felled++;if(site.dg){try{WardenDungeon.clear(site.id);WardenCatacombs.onClear(site.id)}catch(e){}}if(site.mast){try{const w=PG.S.mast||(PG.S.mast={});if(mastery){if(w[site.id]!==2){w[site.id]=2;PG.earn(1200);toast('MASTERY CLEARED \u00b7 +1200 embers',4.5)}else PG.earn(250)}else if(!w[site.id]){w[site.id]=1;toast('MASTERY REMATCH UNLOCKED \u00b7 fight him again, he has learned too',5)}PG.save()}catch(x){}}const cr=site.fog?PG.felled(site.id):null;msg(site.n+' · cleared ('+felled+' felled)',2.4);leave(true);if(cr)cycleTurn(cr);return}}
    // one-time status toast so a missing animation set is visible instead of silent
    {const F0=foes[0],ka=(pAnim?pAnim.st:'none')+'/'+(F0&&F0.anim?F0.anim.st:'none');if(ka!==mxSaid&&pAnim&&F0&&F0.anim&&pAnim.st!=='none'&&F0.anim.st!=='none'){mxSaid=ka;msg(pAnim.st==='ready'&&F0.anim.st==='ready'?'Animations '+WardenMX.BUILD+' loaded':'Animation load FAILED ('+(pAnim.err||F0.anim.err||ka)+')',2.2)}}
    try{autoLock();camMoves()}catch(e){}const TF=target();D=TF.f;try{markers(TF,performance.now()/1000);threatArrows();frameFoes(dt);barrageTick(dt);svTick(dt);trickTick(dt);fightMoveTick(dt)}catch(e){}
    // camera: pull back for a big foe, when he is far, and when there are several
    try{let sc=1;for(const F of foes)if(F.f.act!=='dead'&&F.awake)sc=Math.max(sc,F.T.scale);const fd=Math.hypot(S.x-D.x,S.z-D.z);CameraRig.setBias(-2.8+(sc-1)*3.4+Math.min(3.5,Math.max(0,fd-5))*.45+(alive().length>1?1:0))}catch(e){}
    for(const F of foes)if(F.ai.ph2&&!F.ph2&&state==='fight'){F.ph2=true;try{phaseBeat(F,2)}catch(x){}if(F.T.boss){msg(F.T.ph2,2);sfx('heavy',.7,.6,()=>tone(120,60,.4,'sawtooth',.12));WardenSfx.play('vo_sudden_death',.8,1,{nojit:1})}if(F.body.shield)F.body.shield.visible=false}
    for(const F of foes)if(F.ai.ph3&&!F.ph3&&state==='fight'){F.ph3=true;try{phaseBeat(F,3)}catch(x){}if(F.T.ph3){msg(F.T.ph3,2.4);sfx('heavy',.8,.5,()=>tone(90,45,.5,'sawtooth',.14))}}
    // 1) hand the sim the player's current position, run the due ticks, apply the forced motion back to S
    P.x=S.x;P.z=S.z;
    // bodies are solid: free walking used to pass through foes (only sim-driven moves collided). A foe that is attacking / stunned / asleep holds its ground, otherwise you share the push.
    if(P.act!=='dead')for(const F of foes){const f=F.f;if(f.act==='dead')continue;const ex=P.x-f.x,ez=P.z-f.z,d=Math.hypot(ex,ez),m=P.r+f.r;if(d>=m)continue;
      const nx=d<1e-4?Math.sin(S.rot):ex/d,nz=d<1e-4?Math.cos(S.rot):ez/d,pen=m-d,kf=(f.act==='attack'||f.act==='stun'||!F.awake)?0:.3;
      P.x+=nx*pen*(1-kf);P.z+=nz*pen*(1-kf);f.x-=nx*pen*kf;f.z-=nz*pen*kf}
    {const A=C.arena,ax=P.x-A.x,az=P.z-A.z,ad=Math.hypot(ax,az),lim=A.R-P.r;if(ad>lim){P.x=A.x+ax/ad*lim;P.z=A.z+az/ad*lim}}
    S.x=P.x;S.z=P.z;lx=S.x;lz=S.z;netApply();
    const held=nt=>{const f=lock&&D.act!=='dead'?heading():pendT>0&&pendFace!==null?pendFace:S.rot;if(pendT>0)pendT--;
      const h={P:{face:f,mx:0,mz:0}};if(Q)h.Q={face:Q.face,mx:0,mz:0};let atk=0;for(const F of foes)if(F.f.act==='attack')atk++;
      // a LATE foe (second of a pair) holds back until the first is at half health or felled, then joins with its own entrance
      for(const F of foes)if(F.late&&!F.awake&&F.dorm==='sleep'&&F.f.act!=='dead'&&foes.filter(o=>!o.late).every(o=>o.f.act==='dead'||!F.T.last&&o.f.hp<=o.f.hpMax*.5))rouse(F);   // the Unbroken Oath (T.last) wakes only when all three oaths are dead
      for(const F of foes){const q=F.f;
        if(F.script){h[F.id]={face:Math.atan2(S.x-q.x,S.z-q.z),mx:0,mz:0,list:[]};continue}
        if(F.f.act==='dead'){h[F.id]={face:q.face,mx:0,mz:0};continue}
        if(!F.awake&&F.dorm!=='wake'&&Math.hypot(S.x-q.x,S.z-q.z)<F.T.aggro)wake(F);
        if(F.human){h[F.id]={face:q.face,mx:0,mz:0,list:[]};continue}
        if(NET.mode==='guest'){const n=F.nin||{mx:0,mz:0};h[F.id]={face:q.face,mx:n.mx,mz:n.mz,list:[]};continue}
        if(F.awake&&PC.ai&&state==='fight'){if(F.T.oath){const sg=Foes_sig(q,F);F.ai.sigLock=sg;const tg=aiTarget(q);F.ai.onDecoy=tg===C.F.Z||tg===C.F.Y}F.ai.noAtk=!!F.T.pack&&atk>=Foes.PACK_ATK&&q.act!=='attack';const a=DuelistAI.think(F.ai,aiTarget(q),q,lastEv,nt);F.nin={mx:a.mx,mz:a.mz};h[F.id]={face:a.face,mx:a.mx,mz:a.mz,list:a.list};if(F.ai.banner){const bn=F.ai.banner;F.ai.banner=null;if(!ult){msg(bn,2.2);flash(.4,'rgba(255,60,40,.5)');try{CameraRig.shake(.4);sfx('heavy',.8,.6,()=>tone(80,40,.6,'sawtooth',.16))}catch(x){}}}
        {const f=F.f,em=F.ai.sov>0;if(f.dm0===undefined){f.dm0=f.dm||1;f.tm0=f.tm||1}const dm=f.dm0*(em?1.2:1),tm=f.tm0*(em?1.2:1);if(f.dm!==dm)f.dm=dm;if(f.tm!==tm)f.tm=tm}
        if(F.ai.spMsg){const sm=F.ai.spMsg;F.ai.spMsg=null;if(!ult){msg(sm,1.9);try{tone(180,90,.4,'sawtooth',.1);CameraRig.pulse(2);flash(.25,'rgba(255,120,40,.35)')}catch(x){}}}
        if(F.ai.readMsg){const hn=DuelistAI.HN[F.ai.readMsg];F.ai.readMsg=null;if(hn&&!ult){msg(F.T.name.split(',')[0].replace(/^The /,'').toUpperCase()+' READS YOUR '+hn.toUpperCase(),1.5);try{tone(260,200,.2,'square',.08)}catch(x){}}}}
        else h[F.id]={face:F.awake||F.dorm==='wake'?Math.atan2(S.x-q.x,S.z-q.z):q.face,mx:0,mz:0}}
      return h};
    const evs=CineCam.frozen()||DU.cd>0?[]:ST.advance(now(),held,()=>{S.x+=P.x-lx;S.z+=P.z-lz;lx=P.x;lz=P.z;lastEv=C.ev;trickStep(C.ev)});
    for(const e of evs)if(e.t==='start'&&NET.mode==='host'&&byId[e.a]){const F=byId[e.a];netStarts.push({id:e.a,m:e.move,h:F.f.hold|0})}
    events(evs);flowTick(dt);supHud();flaskTick(dt);netSend(dt);netVis();
    // 2) facing: the sim owns it while attacking / dodging / stunned; lock-on owns it otherwise
    if(P.act==='attack'||P.act==='dodge'||P.act==='stun')S.rot=P.face;
    else if(lock&&D.act!=='dead'){const a=heading();S.rot=a;lockCam(a,dt)}
    me.position.x=S.x;me.position.z=S.z;me.rotation.y=S.rot;
    // dodge visual = the existing roll clip, played once per dodge; getting hit = the game's own hit reaction
    if(P.act==='dodge'&&!P._rolled){P._rolled=true;const dd=P.dir||[Math.sin(P.face),Math.cos(P.face)],fw=dd[0]*Math.sin(P.face)+dd[1]*Math.cos(P.face),sd=dd[0]*Math.cos(P.face)-dd[1]*Math.sin(P.face),clip=!!(pAnim&&pAnim.dodgeClips&&pAnim.dodgeClips());P._back=clip?(fw<-.5||Math.abs(sd)>.6&&!(fw>.75)):fw<-.5;P._dirA=Math.atan2(dd[0],dd[1]);if(!clip)me.userData.emote=P._back?'flipb':'roll'}else if(P.act!=='dodge')P._rolled=false;
    if(P.act==='dodge'&&!P._back&&P._dirA!==undefined)me.rotation.y=P._dirA;      // roll / sidestep TOWARD the stick; a backward dodge flips away while still facing the foe
    if(P.act==='stun'&&!P._hit){P._hit=true;me.userData.hitReq=1}else if(P.act!=='stun')P._hit=false;
    if(P.act==='dead'&&!P._dead){P._dead=true;me.userData.emoteReq='playdead'}else if(P.act!=='dead'&&P._dead){P._dead=false;if(typeof emoStop==='function')emoStop(me.userData)}
    // 3) animation: real sword clips scrubbed by the sim (player + every foe); procedural arm pose only while the clips are still downloading
    const fr=C.hs>0?0:Math.max(0,Math.min(1,now()/16.6667-ST.skew-C.tick));
    locoOf(pv,S.x,S.z,S.rot,dt);const ploco={moving:pv.sp>.8&&P.act==='free',vf:pv.vf,vs:pv.vs};
    gT=P.guard?gT+1:0;const o=PC._pose?{a:WardenAnim.POSES[PC._pose[0]],b:WardenAnim.POSES[PC._pose[1]],u:PC._pose[2],w:1}:WardenAnim.target(P,gT);WardenAnim.mix(o.a,o.b,o.u,tg);stW+=((o.w)-stW)*Math.min(1,dt*10);
    {const k=Math.min(1,dt*40);for(const kk of['ru','rf','lu','lf'])cur[kk].lerp(tg[kk],k).normalize();cur.tw+=(tg.tw-cur.tw)*k;cur.ln+=(tg.ln-cur.ln)*k}
    const used=pAnim?pAnim.update(P,fr,ploco,dt,true):false;if(!used&&!PC._skip)WardenAnim.apply(me.userData,cur,stW);
    for(const F of foes){if(F.bleed&&F.bleed.t>0&&F.f.act!=='dead'&&NET.mode!=='guest'){F.bleed.t-=dt;F.f.hp=Math.max(1,F.f.hp-F.bleed.dps*dt);F.flash=Math.max(F.flash,.25)}foeTick(F,dt,fr)}payFoes();
    WardenFx.update(dt);WardenVfx.update(dt);
    hud()}
  function foeTick(F,dt,fr){
    const b=F.body,f=F.f,g=b.g;if(F.wait){g.visible=false;return}g.position.set(f.x,H(f.x,f.z),f.z);
    if(f.act==='attack'||f.act==='stun'||f.act==='dead'){g.rotation.y=f.face}else g.rotation.y=lerpAngle(g.rotation.y,f.face,1-Math.exp(-12*dt));
    if(F.dorm){if(F.anim&&F.dormSync!==F.dorm){F.anim.setMode(F.dorm);F.dormSync=F.dorm}
      if(F.dorm==='wake'){F.wakeT+=dt;if((F.anim&&F.anim.wakeDone)||F.wakeT>4)rise(F)}}
    for(const sk of['sword','sword2'])if(b[sk]){const sv=!(F.dorm==='sleep'||(F.dorm==='wake'&&F.anim&&F.anim.wakeP<.4)),o=b[sk].grip||b[sk];if(o.visible!==sv&&state!=='won')o.visible=sv}
    locoOf(F.loco,f.x,f.z,g.rotation.y,dt);const moving=F.loco.sp>.6&&f.act==='free',loco={moving,vf:F.loco.vf,vs:F.loco.vs};
    if(b.T.body==='avatar'){if(f.act==='dead'){b.u.pp=null;b.u.v=0;if(!b.u.hold&&!b.u.emoteReq)b.u.emoteReq='playdead'}   // a corpse keeps its fall: no motion-based emote cancel, and re-ask until the emote library has loaded
      if(typeof animate==='function')animate(g,dt,moving?'walk':'idle')}
    if(F.anim)F.anim.update(f,fr,loco,dt,true);
    if(b.T.body==='glb'&&b.u.mixer)b.u.mixer.update(dt);
    F.flash=Math.max(0,F.flash-dt*5);if((F.flash>0||b.flashOn)&&b.u.model){b.flashOn=F.flash>0;b.u.model.traverse(c=>{if(c.isSkinnedMesh&&c.material&&c.material.emissive)c.material.emissive.setRGB(F.flash*.7,F.flash*.25,F.flash*.1)})}}
  return Object.assign(PC,{dgReward:(loot,label)=>{   // catacomb chest: embers + a weapon (a full pack sells it)
      const n=Math.round(loot.embers*wst.gild);PG.earn(n);let line='+'+n+' Embers';const r=WardenGear.rng(Date.now()&0x7fffffff),it=WardenGear.make(r,loot.rar,null,'c');
      if(WardenGear.full()){const v=WardenGear.sellValue(it);PG.earn(v);line+=' · pack full, sold a '+WardenGear.name(it)+' for '+v}else{WardenGear.add(it);line+=' · '+WardenGear.RAR[it.rar]+' '+WardenGear.name(it)}
      toast((label||'Chest')+': '+line,4.2);return it},toast:(t,s)=>toast(t,s),setSeq:v=>{if(pAnim)pAnim.variant=v},tick,speedMul,press,release,enter:()=>{},engage:id=>{const s=SITES().find(q=>q.id===id);if(s&&!on)engage(s)},leave:()=>leave(false),on:()=>on,site:()=>site,GRIP,setGrip:()=>{setGrip(sword);for(const F of foes)setGrip(F.body.sword)},newFight:()=>{if(on)startFight()},
    _flow:v=>{if(v!==undefined)flow=v;return[flow,flowOn,flowN]},
    _lanes:()=>lanes&&lanes.map(l=>({v:l.visible,o:+l.material.opacity.toFixed(2),x:+l.position.x.toFixed(1),y:+l.position.y.toFixed(1),z:+l.position.z.toFixed(1),sy:+l.scale.y.toFixed(1),ry:+l.rotation.y.toFixed(2),inScene:!!l.parent})),_style:()=>({my:myStyle,partner:pStyle,hpMax:P&&P.hpMax,dfl:P&&P.dfl,bk:P&&P.bk}),setStyle,_foes:()=>foes,_trick:()=>({ring:!!(blinkRing.m&&blinkRing.m.visible),rx:blinkRing.m?+blinkRing.m.position.x.toFixed(1):0,rz:blinkRing.m?+blinkRing.m.position.z.toFixed(1):0,traps:traps.map(t=>({id:t.id,x:+t.x.toFixed(1),z:+t.z.toFixed(1),age:+t.age.toFixed(1),armed:t.armed}))}),_rdecoy:()=>rdecoy?{t:rdecoy.t,hits:rdecoy.hits}:null,_netMsg:p=>netMsg(p),_decoy:()=>decoy?{t:+decoy.t.toFixed(1),hits:decoy.hits,vis:decoy.g.visible,par:!!decoy.g.parent,x:decoy.g.position.x,z:decoy.g.position.z,zf:C.F.Z?1:0,sc:decoy.g.scale.x,kids:decoy.g.children.length,meshes:(()=>{let n=0;decoy.g.traverse(o=>{if(o.isMesh)n++});return n})(),y:decoy.g.position.y}:null,_ult:()=>ult?{tk:C.tick-ult.T0,ph:ult.ph,t:+ult.t.toFixed(2),hits:ult.hits,dodged:ult.dodged,res:ult.res,tsc}:null,_t:()=>({DU,on,C,P,D,lock,sword,foes,site,AI:foes[0]&&foes[0].ai,state,cur,stW,down,pAnim,dAnim:foes[0]&&foes[0].anim,duel:foes[0]&&foes[0].body.g,dSword:foes[0]&&foes[0].body.sword,RT})})})();
