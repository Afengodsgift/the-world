// Fires: DAMAGE CONTROL on your galleon. Hits from pirate guns can set the deck ablaze. A fire burns the hull, burns anybody standing in it, grows into a blaze if you ignore it and spreads to the planks beside it.
// Somebody has to leave their post and put it out (tap the 🧯 button next to it, 3 taps) while the shooting goes on: that is the co-op juggling act (helm / guns / fires). Chips the carpenter helps when the crew is on.
//  - The SHIP HOST (whoever simulates the ship; the one who applies hull damage) owns the fires and streams them at 4 Hz on Net 'fir'; the partner mirrors them. Taps are sent to the host ('ex').
//  - Fire positions are SHIP-LOCAL deck coordinates (x across, z along), so they ride the ship; each client draws them from the deck pose (Decks.toWorld). Hurting yourself in a fire is done by each client on itself.
//  - Pure helpers for the tests: igniteChance, burnRate, spreadOk.
// Globals at runtime: THREE, scene, S, Ship, Decks, Fleet, Net, Systems, Interaction, SHIP, Deckhands (optional), Fx (optional), banner, myId.
const Fires=(()=>{
  const C=SHIP,K=C.cls[C.player],F={max:4,burn:1.2,rage:2.4,rageAt:12,hp:100,tap:34,reach:2.7,hurt:6,spreadEvery:14,help:9};
  const R=Math.random,list=[];let built=false,nextId=1,sendT=0,helpT=F.help,hurtT=0,hudEl=null,hudKey='',tex=null,warnT=0;
  const isHost=()=>typeof Ship!=='undefined'&&Ship._s&&Ship._s.host===myId;
  const send=p=>{try{Net.emit('fir',p)}catch(e){}};
  const _w={x:0,y:0,z:0};
  // ---------- pure ----------
  const igniteChance=n=>Math.max(0,Math.min(.5,n/70));              // a 24-damage ball: ~44%
  const burnRate=f=>f.age>F.rageAt?F.rage:F.burn;                   // hull damage per second per fire
  const spreadOk=(count)=>count<F.max;
  // ---------- host ----------
  function spot(){
    const v=Ship.vessel();if(!v||!v.deck)return null;const d=v.deck,M=K.deckM;
    for(let i=0;i<60;i++){const x=(R()*2-1)*v.hb*.8,z=(R()*2-1)*v.hl*.8;if(Math.abs(Decks.floor(d,x,z)-M)>.12||Decks.wallAt(d,x,z,M,.3))continue;
      if(list.some(f=>Math.hypot(f.x-x,f.z-z)<2.2))continue;return {x:+x.toFixed(2),z:+z.toFixed(2)}}
    return null}
  function ignite(n,force){
    if(!isHost()||!built||list.length>=F.max)return false;if(!force&&R()>igniteChance(n))return false;
    const p=spot();if(!p)return false;list.push({id:nextId++,x:p.x,z:p.z,hp:F.hp,age:0,sp:R()*F.spreadEvery});announce();sendNow();return true}
  function announce(){try{banner('FIRE ON DECK! Put it out! (tap 🧯)','🔥 FIRE')}catch(e){}send({k:'b'})}
  function burnHull(dt){let rate=0;for(const f of list)rate+=burnRate(f);if(rate>0)Ship.damage(rate*dt,true)}
  function stepHost(dt){
    for(let i=list.length-1;i>=0;i--){const f=list[i];f.age+=dt;f.sp-=dt;
      if(f.sp<=0){f.sp=F.spreadEvery;if(f.age>F.rageAt&&spreadOk(list.length)){const p=spot();if(p){list.push({id:nextId++,x:p.x,z:p.z,hp:F.hp*.6,age:0,sp:F.spreadEvery});sendNow()}}}
      if(f.hp<=0){list.splice(i,1);sendNow();try{banner(list.length?'One fire is out!':'All fires out!','🔥 FIRE')}catch(e){}send({k:'out',n:list.length})}}
    burnHull(dt);
    // the carpenter fights fires too when the crew is on
    if(list.length&&typeof Deckhands!=='undefined'){helpT-=dt;if(helpT<=0){helpT=(Deckhands.order&&Deckhands.order()==='repair'&&Deckhands.on&&Deckhands.on())?F.help/3:F.help;const f=list.reduce((a,b)=>a.hp<b.hp?a:b);f.hp-=F.tap;if(f.hp<=0)f.hp=0;sendNow()}}else helpT=F.help;
    sendT-=dt;if(sendT<=0){sendT=.25;sendNow()}}
  const pack=()=>({k:'f',a:list.map(f=>[f.id,f.x,f.z,Math.round(f.hp),+f.age.toFixed(1)])});
  function sendNow(){if(isHost())send(pack())}
  function extinguish(id,by){const f=list.find(q=>q.id===id);if(!f)return false;f.hp-=F.tap;if(f.hp<=0)f.hp=0;sendNow();return true}
  // ---------- network ----------
  function onNet(d,from){
    if(!d)return;
    if(d.k==='f'&&!isHost()){const seen=new Set();for(const r of d.a){seen.add(r[0]);let f=list.find(q=>q.id===r[0]);if(!f){f={id:r[0],x:r[1],z:r[2],hp:r[3],age:r[4],vis:null};list.push(f);if(list.length===1&&!warnT)warnT=1}else{f.hp=r[3];f.age=r[4]}}
      for(let i=list.length-1;i>=0;i--)if(!seen.has(list[i].id)){disposeVis(list[i]);list.splice(i,1)}}
    else if(d.k==='ex'&&isHost())extinguish(d.id,from);
    else if(d.k==='b'&&!isHost()){try{banner('FIRE ON DECK! Put it out! (tap 🧯)','🔥 FIRE')}catch(e){}}
    else if(d.k==='out'&&!isHost()){try{banner(d.n?'One fire is out!':'All fires out!','🔥 FIRE')}catch(e){}}}
  // ---------- visuals (per client) ----------
  function flameTex(){
    if(tex)return tex;try{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,40,2,32,36,30);r.addColorStop(0,'rgba(255,240,170,1)');r.addColorStop(.35,'rgba(255,150,40,.85)');r.addColorStop(1,'rgba(255,60,0,0)');g.fillStyle=r;g.fillRect(0,0,64,64);tex=new THREE.CanvasTexture(c)}catch(e){tex=null}return tex}
  function makeVis(f){
    if(f.vis||typeof THREE==='undefined'||typeof scene==='undefined')return;const t=flameTex();if(!t)return;f.vis=[];
    for(let i=0;i<3;i++){const m=new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.9}),s=new THREE.Sprite(m);s.renderOrder=5;scene.add(s);f.vis.push({s,m,o:i*2.1})}}
  function disposeVis(f){if(!f.vis)return;for(const q of f.vis){scene.remove(q.s);q.m.dispose()}f.vis=null}
  function draw(dt){
    const v=Ship.vessel();if(!v||!v.deck)return;const tm=Date.now()/1000;
    for(const f of list){makeVis(f);if(!f.vis)continue;const y=Decks.floor(v.deck,f.x,f.z),sz=1.7+Math.min(1.6,f.age/10)*1.4,k=Math.max(.25,f.hp/F.hp);
      Decks.toWorld(v.deck,f.x,Math.max(y,K.deckM),f.z,_w);
      f.vis.forEach((q,i)=>{const fl=.8+.25*Math.sin(tm*11+q.o*3),u=(i-1)*.35;q.s.position.set(_w.x+u,_w.y+.5+i*.45*sz*fl,_w.z+Math.cos(q.o+tm*3)*.2);q.s.scale.set(sz*(1.2-i*.18)*fl*(.6+k*.4)+.5,sz*(1.9-i*.2)*fl*(.6+k*.4)+.6,1);q.m.opacity=.95-i*.15})
      if(R()<dt*3){try{Fx.burst(_w.x,_w.y+1.6,_w.z,'#3a3a3a',1)}catch(e){}}}
  }
  function hud(){
    const aboard=Ship.onDeck(),txt=list.length&&(aboard||Ship.seated())?'🔥 '+list.length+' FIRE'+(list.length>1?'S':'')+' — find the flames, tap 🧯':'';
    if(txt!==hudKey){hudKey=txt;if(hudEl){hudEl.textContent=txt;hudEl.style.display=txt?'block':'none'}}}
  // ---------- per frame ----------
  function step(dt){
    if(!built)return;const sh=Ship._ship;
    if(sh&&sh.sunk>0&&list.length){for(const f of list)disposeVis(f);list.length=0;if(isHost())sendNow()}
    if(isHost())stepHost(dt);
    // a fire burns the people in it (each client hurts only itself)
    hurtT-=dt;if(hurtT<=0&&list.length&&Ship.onDeck()&&typeof Fleet!=='undefined'){hurtT=.5;const v=Ship.vessel();
      for(const f of list){Decks.toWorld(v.deck,f.x,K.deckM,f.z,_w);if(Math.hypot(S.x-_w.x,S.z-_w.z)<1.5&&Math.abs(S.y-_w.y)<2){Fleet.hurtMe(F.hurt*.5,_w.x,_w.z);try{S.hurt=Math.max(S.hurt||0,.2)}catch(e){}break}}}
    draw(dt);hud()}
  // ---------- interaction ----------
  function nearest(){
    if(!built||!Ship.onDeck()||!list.length)return null;const v=Ship.vessel();let best=null,bd=F.reach;
    for(const f of list){Decks.toWorld(v.deck,f.x,K.deckM,f.z,_w);const d=Math.hypot(S.x-_w.x,S.z-_w.z);if(d<bd){bd=d;best=f}}return best}
  function douse(){const f=nearest();if(!f)return;
    if(isHost())extinguish(f.id,myId);else{send({k:'ex',id:f.id});f.hp=Math.max(0,f.hp-F.tap)}
    try{Fx.burst(S.x,S.y+1,S.z,'#cfe9ff',6)}catch(e){}}
  function build(){
    if(built)return;built=true;
    try{const css=document.createElement('style');css.textContent='#firehud{position:fixed;z-index:6;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 62px);padding:5px 12px;border-radius:12px;background:#b3260ecc;color:#fff;font:800 12px sans-serif;display:none;pointer-events:none;text-shadow:0 1px 2px #000}';
      (document.head||document.body).appendChild(css);hudEl=document.createElement('div');hudEl.id='firehud';document.body.appendChild(hudEl)}catch(e){}
    Net.on('fir',onNet);Systems.add('fires',step)}
  Interaction.register('fire-out','🧯 Put out the fire',()=>!!nearest(),douse,true);
  return {build,ignite,extinguish,onNet,list:()=>list,count:()=>list.length,igniteChance,burnRate,spreadOk,F,_step:step,_douse:douse,_nearest:nearest,_pack:pack,_clear:()=>{for(const f of list)disposeVis(f);list.length=0}};
})();
if(typeof module!=='undefined')module.exports=Fires;
