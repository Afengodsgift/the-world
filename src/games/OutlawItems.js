// OutlawItems: Outlaw Isle's manually used consumables in the running game (rules, numbers and validation live in src/combat/Consumables.js).
//   - inventory is per player (SAVE.items, like coins); bought at the Gunsmith, found in supply crates dropped by raiders (bosses always drop one)
//   - UI: a four-button strip (count badge + cooldown sweep), keys H / V / X / N, hidden while scoped; using an item blocks firing and reloading for its short use time
//   - NETWORK (all on the existing 'og' broadcast, nothing new to subscribe to):
//       'ci'  {t,d}            visual only: the partner is using item t (icon + the same arm dip as a reload). Validated: known id, sane duration, rate limited.
//       'gr'  {id,w,x0,z0,y0,x1,z1,ft}   a thrown frag. EVERY client simulates the same flight. At the landing each client damages ITSELF from the shared blast (like the Dynamiter's stick);
//                              only the HOST damages raiders and cover, from the damage table, so a message can never carry damage. Validated (range, flight time, on the island, cooldown,
//                              near the thrower) and de-duplicated by id, so a repeated message cannot explode twice.
//       'pkq' {id,w}  /  'pk' {id,to,t}   supply crates are arbitrated by the HOST: the first valid request wins, the host removes the crate and announces who got it, so two players
//                              touching the same crate at once cannot both receive it. (The old random HEALTH cube keeps its original behaviour.)
//   - armor and health are the victim's own (hurt() is already applied on the victim's client from the host's 'hurt' message): absorb() runs there, once per hit.
// Globals: THREE, S, me, myId, Consumables. Everything the game owns (hp, ammo, raiders, cover) comes in through init(X).
const OutlawItems=(()=>{
  const C=Consumables,st=C.newState();
  let X=null,root=null,btns={},arEl=null,lastToast=0,gl=[],seq=0,lastHpI=-1,lastArI=-1;
  const seen=new Set(),lastBy={},lastCi={};   // grenade ids already simulated, last accepted throw per sender, last 'ci' per sender
  const _gGeo=typeof THREE!=='undefined'?new THREE.SphereGeometry(.14,8,6):null,_gMat=typeof THREE!=='undefined'?new THREE.MeshStandardMaterial({color:'#3b4a2a',roughness:.6}):null;
  const _rGeo=typeof THREE!=='undefined'?new THREE.RingGeometry(C.ITEMS.gren.rad-.35,C.ITEMS.gren.rad,40).rotateX(-Math.PI/2):null,_rMat=typeof THREE!=='undefined'?new THREE.MeshBasicMaterial({color:'#ffb02e',transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false}):null;
  const _cGeo=typeof THREE!=='undefined'?new THREE.BoxGeometry(.7,.7,.7):null,_cMat={},_cTex={};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function init(ctx){X=ctx;load()}
  function load(){const raw=X.SAVE.items;if(!raw||typeof raw!=='object'){X.SAVE.items=C.starter()}else X.SAVE.items=C.sanitize(raw);for(const id of C.ORDER)st.n[id]=X.SAVE.items[id]}
  function persist(){for(const id of C.ORDER)X.SAVE.items[id]=st.n[id];X.save()}

  // ---------- UI ----------
  function ui(){
    if(root||typeof document==='undefined')return;
    root=document.createElement('div');root.id='owitems';
    for(const id of C.ORDER){const I=C.ITEMS[id],b=document.createElement('button'),ic=document.createElement('span'),n=document.createElement('b'),sw=document.createElement('i');
      b.className='owi';b.dataset.id=id;b.ariaLabel=I.n+' ('+I.key.replace('Key','')+')';b.title=I.n+' ['+I.key.replace('Key','')+']';ic.textContent=I.icon;n.textContent='0';
      b.appendChild(ic);b.appendChild(n);b.appendChild(sw);b.addEventListener('pointerdown',e=>{use(id);e.preventDefault()});root.appendChild(b);btns[id]={b,n,sw,cls:''}}
    document.body.appendChild(root);
    addEventListener('keydown',e=>{if(e.repeat||/INPUT|TEXTAREA/.test((e.target||{}).tagName||''))return;const id=C.ORDER.find(i=>C.ITEMS[i].key===e.code);if(id)use(id)});
    refresh()}
  function refresh(){
    for(const id of C.ORDER){const o=btns[id];if(!o)continue;o.n.textContent=st.n[id];
      const cd=Math.max(st.cd[id],st.lock>0&&st.cd[id]<=0?st.lock:0),tot=st.cd[id]>0?C.ITEMS[id].cd:C.LOCK;o.sw.style.setProperty('--cd',cd>0?(cd/tot).toFixed(2):0);
      const cls='owi'+(st.n[id]<=0?' off':'')+((st.use&&st.use.id===id)||(id==='stim'&&st.heal>0)||(id==='armor'&&st.armor>0)?' act':'');if(cls!==o.cls){o.cls=cls;o.b.className=cls}}
    if(arEl)arEl.style.width=armorPct()+'%'}
  function toast(msg){const t=performance.now();if(t-lastToast<600)return;lastToast=t;X.popText(S.x,S.y+2.3,S.z,msg,'#ffd24a',.8)}

  // ---------- using ----------
  const blocked=()=>!!(S.flying||S.dv||S.state==='swim'||X.H(S.x,S.z)<-.5);
  function use(id){
    if(!X)return false;const r=C.canUse(st,id,{down:X.down(),blocked:blocked(),hp:X.hp(),maxHp:X.maxHp(),ammoMissing:X.ammoMissing()});
    if(!r.ok){toast(r.r);return false}
    C.begin(st,id);X.cancelReload();X.setScope(false);X.sfx(id==='gren'?'click':'heal');X.send({k:'ci',t:id,d:C.ITEMS[id].use});refresh();return true}
  function finish(id){
    if(id==='stim'){C.apply(st,id);X.popText(S.x,S.y+2.3,S.z,'\u{1F489} healing','#5dff8a',.9);X.sfx('heal')}
    else if(id==='armor'){C.apply(st,id);X.popText(S.x,S.y+2.3,S.z,'\u{1F6E1}️ armor '+st.armor,'#9fd0ff',.9);X.sfx('armor')}
    else if(id==='ammo'){X.refillAmmo();X.popText(S.x,S.y+2.3,S.z,'\u{1F4E6} ammo full','#ffd24a',.9);X.sfx('reload')}
    else if(id==='gren')throwNow();
    persist();refresh();X.updateHud()}
  function throwNow(){
    const G=C.ITEMS.gren,P=X.aimPoint(G.range+6);let dx=P.x-S.x,dz=P.z-S.z;const d=Math.hypot(dx,dz)||1,k=Math.min(1,G.range/d);dx*=k;dz*=k;
    const x1=S.x+dx,z1=S.z+dz,dist=Math.min(d,G.range),ft=clamp(.35+dist/16,.5,1.5),id=String(myId).slice(0,6)+':'+(++seq);
    const m={k:'gr',id,w:myId,x0:+S.x.toFixed(2),y0:+(S.y+1.5).toFixed(2),z0:+S.z.toFixed(2),x1:+x1.toFixed(2),z1:+z1.toFixed(2),ft:+ft.toFixed(2)};
    seen.add(id);addGren(m);X.send(m)}
  function addGren(p){
    if(!_gGeo)return;const m=new THREE.Mesh(_gGeo,_gMat),r=new THREE.Mesh(_rGeo,_rMat),gy=X.H(p.x1,p.z1);r.position.set(p.x1,gy+.12,p.z1);X.scene.add(m,r);
    gl.push({p,m,r,t:0,gy,h:Math.min(4,.5+Math.hypot(p.x1-p.x0,p.z1-p.z0)*.2)})}
  function flight(dt){
    for(let i=gl.length-1;i>=0;i--){const g=gl[i],p=g.p,u=Math.min(1,(g.t+=dt)/p.ft);
      g.m.position.set(p.x0+(p.x1-p.x0)*u,p.y0+(g.gy+.2-p.y0)*u+4*g.h*u*(1-u),p.z0+(p.z1-p.z0)*u);g.m.rotation.x+=dt*14;
      if(g.t>=p.ft){gl.splice(i,1);X.scene.remove(g.m,g.r);detonate(g)}}}
  function detonate(g){
    const p=g.p,G=C.ITEMS.gren,gy=g.gy;X.boom(p.x1,p.z1,G.rad*.8);
    // every client hurts ITSELF from the shared blast (once: the grenade is removed from the list before this runs)
    if(!X.down()&&Math.abs(S.y-gy)<4){const dd=Math.hypot(S.x-p.x1,S.z-p.z1),d=C.grenadeDamage(dd,'player',X.coverBetween(p.x1,gy+.6,p.z1,S.x,S.y+1,S.z));if(d>0)X.hurt(d,p.x1,p.z1)}
    // only the host damages raiders and cover, from the table
    if(X.isHost()){
      for(const n of X.npcs()){if(n.dead)continue;const dd=Math.hypot(n.x-p.x1,n.z-p.z1),ny=X.H(n.x,n.z),d=C.grenadeDamage(dd,X.isBoss(n)?'boss':'npc',X.coverBetween(p.x1,gy+.6,p.z1,n.x,ny+1,n.z));if(d>0)X.damageNpc(n.id,d,'torso')}
      X.blast(p.x1,p.z1,G.rad,G.dmg*.6)}}

  // ---------- per frame ----------
  function tick(dt){
    if(!X)return;
    if(st.use&&X.down()){C.cancel(st);refresh()}
    const done=C.step(st,dt);if(done)finish(done);
    const g=C.tickEffects(st,dt,X.hp(),X.maxHp(),X.down());if(g>0){X.setHp(X.hp()+g);if(Math.floor(X.hp())!==lastHpI){lastHpI=Math.floor(X.hp());X.updateHud()}}
    if(Math.ceil(st.armor)!==lastArI){lastArI=Math.ceil(st.armor);X.updateHud()}
    flight(dt);if(root&&(st.lock>0||st.use||st.cd.stim>0||st.cd.armor>0||st.cd.gren>0||st.cd.ammo>0||st.heal>0))refresh()}
  const busy=()=>!!st.use;
  const useProgress=()=>C.progress(st);
  const moveMul=()=>st.use?(st.use.id==='gren'?.85:.6):1;
  function absorb(d){const r=C.absorb(st,d);if(r.soak>0&&root)refresh();return r.hp}
  const armorPct=()=>Math.max(0,Math.min(100,st.armor/C.ITEMS.armor.armor*100));
  function reset(full){C.resetEffects(st);for(const g of gl){X.scene.remove(g.m,g.r)}gl=[];if(full)seen.clear();refresh()}

  // ---------- inventory: shop + pickups ----------
  function buy(id){const r=C.canBuy(st,X.SAVE.coins,id);if(!r.ok){X.banner(r.r==='stack full'?'Carrying the maximum':'Not enough coins','GUNSMITH');return false}
    X.SAVE.coins-=C.ITEMS[id].price;C.add(st,id,1);persist();X.sfx('coin');refresh();return true}
  function award(id){
    if(!C.isItem(id))return false;const I=C.ITEMS[id];
    if(C.add(st,id,1)){persist();refresh();X.sfx('coin');X.popText(S.x,S.y+2.5,S.z,'+1 '+I.icon,'#ffd24a',1)}
    else{const c=Math.round(I.price/2);X.SAVE.coins+=c;X.save();X.sfx('coin');X.popText(S.x,S.y+2.5,S.z,'full → +'+c+' \u{1FA99}','#ffd24a',.9)}   // a full stack converts the crate into half its price
    X.updateHud();return true}
  const canTake=id=>C.isItem(id)&&st.n[id]<C.ITEMS[id].max;
  function crate(id){
    const g=new THREE.Group(),I=C.ITEMS[id];
    if(!_cMat[id])_cMat[id]=new THREE.MeshStandardMaterial({color:'#2d6cdf',emissive:'#1b4aa8',emissiveIntensity:.7});
    if(!_cTex[id]&&typeof document!=='undefined'){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.font='44px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(I.icon,32,36);_cTex[id]=new THREE.CanvasTexture(c)}
    const box=new THREE.Mesh(_cGeo,_cMat[id]);g.add(box);
    if(_cTex[id]){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:_cTex[id],transparent:true,depthTest:false}));sp.scale.set(.9,.9,1);sp.position.y=.85;sp.renderOrder=10;g.add(sp)}
    return g}

  // ---------- network ----------
  // returns true if the message was an item message (handled or rejected here)
  function onMsg(p,ctx){
    if(p.k==='ci'){if(!C.isItem(p.t)||!(p.d>0&&p.d<3))return true;const now=performance.now(),w=p.w||'p';if(now-(lastCi[w]||0)<350)return true;lastCi[w]=now;
      const pr=X.partner();if(pr){const u=pr[1].group.userData;u.rlD=u.rlT=Math.min(2,p.d);const q=pr[1].group.position;X.popText(q.x,q.y+2.6,q.z,C.ITEMS[p.t].icon,'#fff',.9)}return true}
    if(p.k==='gr'){
      const now=performance.now(),v=C.grenadeMsgOk(p,lastBy[p.w],now,{x:X.C.x,z:X.C.z,r:200});if(!v||seen.has(v.id))return true;
      const pr=X.partner();if(pr){const q=pr[1].group.position;if(Math.hypot(q.x-v.x0,q.z-v.z0)>14)return true}   // thrown from where the thrower actually is
      seen.add(v.id);if(seen.size>200)seen.delete(seen.values().next().value);lastBy[p.w]=now;addGren(v);return true}
    return false}

  return {init,ui,tick,use,buy,award,canTake,crate,onMsg,absorb,busy,useProgress,moveMul,reset,refresh,armorPct,armorBar:el=>{arEl=el},
    state:st,count:id=>st.n[id],_t:()=>({gl,seen,finish,detonate,addGren,lastBy})};
})();
