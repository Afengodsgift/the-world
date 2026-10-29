// Deckhands: your AI crew mates. They live on YOUR galleon: a gunner beside every cannon (up to 3 a side), a carpenter who patches the hull once the shooting stops.
// ONE small ⚓ button (shown only while you are on your ship) opens a tiny order menu: 🔥 Fire at will · ✋ Hold fire · ⚔ Board (half the gunners grab cutlasses, jump onto the nearest pirate deck and fight; the others keep the guns going) · 👥 Crew on/off.
// Orders are SHARED: whoever taps (you or your partner) changes them for everybody ('dho' message; the host repeats it every few seconds so late joiners catch up).
//  - Stations are deterministic (ship-local), so every client draws the same crew with no networking. Only the HOST (Fleet host) decides when a gun goes off and simulates boarders
//    (real bodies: Crew.walk = the same Decks.step controller as everyone); 'dhs' snapshots (5 Hz) carry boarders to the guests, 'dhw' tells everybody a swing happened.
//  - Pirates fight back: Crew.think counts Deckhands.foes(shipId) as targets, Deckhands.hurt() applies it. A crew mate who goes down is carried back to his gun and is up again after 10 s.
// Globals: THREE, scene, S, Ship, Fleet, Crew, Decks, Vessel, SHIP, Net, Systems, banner, makeAvatar/dress/animate (index.html), Outlaw (optional).
const Deckhands=(()=>{
  const C=SHIP,SEA=C.sea,NAMES=['Barnacle Bill','Salty Sue','Old Pete','Mara Reef','Tom Tallow','Jinx','Cookie','Marlow'],COL=['#2f6f9f','#9f6f2f','#4f8f5f','#8f4f8f','#9f4f4f','#4f7f8f'];
  const R=Math.random,list=[],HP=70;let built=false,order='fire',on=true,calm=0,hullPrev=null,visOn=true,t=0,snT=0,reT=0,wasAway=false,menu=null,btn=null,menuT=0,btnShow=false;
  const _o={x:0,z:0},_w={x:0,y:0,z:0};
  const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const haveVis=()=>typeof makeAvatar==='function'&&typeof THREE!=='undefined'&&typeof scene!=='undefined';
  const ready=()=>{const v=typeof Ship!=='undefined'&&Ship.vessel&&Ship.vessel();return v&&v.deck&&v.guns&&v.guns.length?v:null};
  const hullNeed=()=>{try{return Ship._ship.hull<C.hull-1}catch(e){return false}};
  function body(){return {x:0,y:0,z:0,vy:0,rot:0,grounded:true,_dk:null,flying:false,_climb:0}}
  function setup(v){
    list.length=0;let n=0,gi=0;const cnt={'-1':0,'1':0};   // at most 3 gunners a side (the rest of the guns are yours)
    for(const g of v.guns){const sd=g.x>0?1:-1;if(cnt[sd]>=3)continue;cnt[sd]++;
      list.push({i:list.length,role:'gun',g,lx:g.x-sd*1.15,lz:g.z,name:NAMES[n%NAMES.length],col:COL[n%COL.length],fighter:(gi++%2)===0,mode:0,hp:HP,max:HP,B:body(),sid:null,stg:0,cd:0,jumpT:0,downT:0,face:0,g3:null,recoil:0,st:0,snap:null,swing:0,v});n++}
    list.push({i:list.length,role:'carp',g:null,lx:0,lz:v.hl*.25,name:'Chips the Carpenter',col:'#8f7a3f',fighter:false,mode:0,hp:HP,max:HP,B:body(),sid:null,stg:0,cd:0,jumpT:0,downT:0,face:0,wob:R()*6,g3:null,recoil:0,st:0,snap:null,swing:0,v})}
  function visual(c){
    if(c.g3||!haveVis())return;const g=makeAvatar(c.name,c.col);g.userData.noTwist=true;scene.add(g);c.g3=g;
    try{dress(g,c.role==='gun'?3:0)}catch(e){}
    if(c.role==='gun'&&typeof Outlaw!=='undefined'&&Outlaw.setGun)try{Outlaw.setGun(g,0)}catch(e){}}
  // ---------- host: boarding ----------
  // the boarders only jump once the hulls are close (the hooks haul a far ship in first)
  const boardReady=(e,v)=>Math.hypot(e.sh.x-v.pose.x,e.sh.z-v.pose.z)-e.v.hl*.5-v.hl*.5<22;
  function boardTarget(v){
    if(typeof Fleet==='undefined')return null;let best=null,bd=1e9;const p=v.pose;
    for(const e of Fleet.ships.values()){if(e.sinking||e.sunk>0||!e.v.deck||Crew.alive(e.id)<1)continue;const d=Math.hypot(e.sh.x-p.x,e.sh.z-p.z)-e.v.hl*.5-v.hl*.5;if(d<24&&d<bd){bd=d;best=e}}
    if(!best&&Fleet.grappleTarget){const g=Fleet.grappleTarget();if(g&&g.lash===null&&Crew.alive(g.id)>0)best=g}
    if(best&&best.lash===null&&Fleet.isHost())try{Fleet.grapple(best)}catch(x){}   // the BOARD order throws the hooks itself: the target is hauled alongside, then the boarders jump
    return best}
  function jump(c,e,v){
    const cells=Crew.freeCells(e);if(!cells.length)return false;const p=v.pose;let best=null,bd=1e9;
    for(const q of cells){Decks.toWorld(e.v.deck,q[0],e.K.deckM,q[1],_w);const d=Math.hypot(_w.x-p.x,_w.z-p.z)+R()*3;if(d<bd){bd=d;best=q}}
    if(!best)return false;Decks.pin(c.B,e.v.deck,best[0],best[1]);c.B.grounded=true;c.B.vy=0;c.mode=1;c.sid=e.id;c.cd=.6;c.stg=0;c.st=0;
    try{Fx.burst(c.B.x,c.B.y+1,c.B.z,'#e8f0ff',8)}catch(x){}return true}
  function recall(c,v){
    if(c.mode===1&&v&&v.deck&&Decks.floor(v.deck,c.lx,c.lz)>=0){Decks.pin(c.B,v.deck,c.lx,c.lz)}
    c.mode=0;c.sid=null;c.st=0}
  function fight(c,e,v,dt){
    const B=c.B;c.cd-=dt;
    if(order!=='board'||!e||e.sinking||B.y<SEA-1.2){recall(c,v);return}
    let tg=null,td=1e9;for(const q of Crew.ofShip(e.id)){if(q.dead)continue;const d=Math.hypot(q.B.x-B.x,q.B.z-B.z);if(d<td&&Math.abs(q.B.y-B.y)<4){td=d;tg=q}}
    if(!tg){recall(c,v);if(!c._said){c._said=1}return}
    B.rot+=wrapA(Math.atan2(tg.B.x-B.x,tg.B.z-B.z)-B.rot)*Math.min(1,dt*9);
    if(td<1.9&&c.cd<=0){c.cd=.8+R()*.25;c.swing=.3;c.st=2;const dmg=Math.round(20+R()*10);Crew.hit(tg.id,dmg,'torso');Net.emit('flt',{k:'dhw',i:c.i});try{Fx.burst(tg.B.x,tg.B.y+1,tg.B.z,'#ff7a5a',4)}catch(x){}Crew.walk(c,dt,B.x,B.z,0,false)}
    else if(td>=1.9){const m=Crew.walk(c,dt,tg.B.x,tg.B.z,3.4,true);c.st=m?1:0}else{Crew.walk(c,dt,B.x,B.z,0,false);if(c.swing<=0)c.st=0}}
  function hurt(i,d){
    const c=list[i];if(!c||c.mode!==1)return;c.hp-=d;c.stg=.25;
    if(c.hp<=0){const v=ready();c.hp=0;recall(c,v);c.mode=2;c.downT=10;try{banner(c.name+' is down!','⚓ CREW')}catch(e){}}}
  const foes=sid=>{const a=[];for(const c of list)if(c.mode===1&&c.sid===sid&&!c.snapOnly)a.push({id:'d'+c.i,i:c.i,ally:1,x:c.B.x,y:c.B.y,z:c.B.z});return a};
  // ---------- per frame ----------
  function place(v,c,dt){
    const d=v.deck;if(!d)return;
    if(c.g3)c.g3.visible=visOn&&on&&c.mode!==2;
    if(c.mode===1){
      if(!c.g3)return;const B=c.B;c.g3.position.set(B.x,B.y,B.z);c.g3.rotation.y+=wrapA(B.rot-c.g3.rotation.y)*Math.min(1,dt*12);
      if(c.swing>0){c.swing-=dt;c.g3.userData.swing=1}
      arm(c,true);try{animate(c.g3,dt,c.st===1?'run':'idle')}catch(e){}return}
    arm(c,false);
    const f=Decks.floor(d,c.lx,c.lz);if(!(f>=0))return;let lx=c.lx,lz=c.lz;
    if(c.role==='carp'&&calm>4&&hullNeed()){lz+=Math.sin(t*.6+c.wob)*2.2;lx+=Math.cos(t*.45+c.wob)*1.2}   // busy with a hammer: potters about
    const ff=Decks.floor(d,lx,lz);Decks.toWorld(d,lx,ff>=0?ff:f,lz,_w);
    if(c.g3){c.g3.position.set(_w.x,_w.y,_w.z);
      if(c.role==='gun'){Vessel.outward(v,c.g,_o);c.face=Math.atan2(_o.x,_o.z)}else c.face=v.pose.h+Math.sin(t*.4+c.wob)*1.2;
      c.g3.rotation.y+=wrapA(c.face-c.g3.rotation.y)*Math.min(1,dt*8);
      if(c.recoil>0){c.recoil-=dt;c.g3.userData.recoil=Math.max(0,c.recoil)}
      try{animate(c.g3,dt,'idle')}catch(e){}}}
  // cutlass in hand while boarding, musket while at the gun
  function arm(c,sw){
    if(!c.g3||c.armed===sw)return;const u=c.g3.userData;
    if(sw){if(typeof Crew!=='undefined'&&u.bones){c.armed=true;try{Crew.sword(c.g3,true)}catch(e){}if(u.gun)u.gun.visible=false}}
    else{c.armed=false;if(u.sword)u.sword.visible=false;if(u.gun)u.gun.visible=true}}
  function step(dt){
    if(!built)return;const v=ready();if(!v)return;
    t+=dt;if(!list.length||list[0].v!==v)setup(v);
    const sunk=Ship._ship&&Ship._ship.sunk>0;visOn=!sunk&&v.loaded!==false;
    const h=Ship._ship?Ship._ship.hull:null;if(h!==null){if(hullPrev!==null&&h<hullPrev-.5)calm=0;hullPrev=h}calm+=dt;   // calm = seconds since the ship was last hit
    const host=Fleet.isHost(),seated=Ship.role&&Ship.role()==='gun';let away=false;
    if(host){reT-=dt;if(reT<=0){reT=4;Net.emit('flt',{k:'dho',on:on?1:0,o:order})}}
    const e=on&&host&&order==='board'?boardTarget(v):null;
    for(const c of list){
      if(!on){if(c.mode===1)recall(c,v);if(c.g3)c.g3.visible=false;continue}
      if(host){
        if(c.mode===2){c.downT-=dt;if(c.downT<=0){c.mode=0;c.hp=c.max}}
        else if(c.mode===1){away=true;const es=Fleet.ships.get(c.sid);if(sunk)recall(c,v);else fight(c,es,v,dt)}
        else{
          if(c.fighter&&order==='board'&&e&&!sunk&&boardReady(e,v)){c.jumpT-=dt;if(c.jumpT<=0){c.jumpT=c.i*.45+.2;jump(c,e,v)}}else if(order!=='board')c.jumpT=c.i*.45+.2;
          if(c.role==='gun'&&!sunk&&!seated&&c.g.cd<=0&&(order==='fire'||(order==='board'&&!c.fighter))){
            c.think=(c.think||0)-dt;if(c.think<=0){c.think=.25+R()*.35;if(Fleet.playerFire(c.g,true,false,true))c.recoil=.35}}}}
      else if(c.mode===1&&c.snap){const k=1-Math.exp(-12*dt),B=c.B,s=c.snap;B.x+=(s[0]-B.x)*k;B.y+=(s[1]-B.y)*k;B.z+=(s[2]-B.z)*k;B.rot+=wrapA(s[3]-B.rot)*k}
      if(haveVis()&&v.loaded!==false)visual(c);place(v,c,dt)}
    if(host){snT-=dt;if(snT<=0&&(away||wasAway)){snT=.2;Net.emit('flt',{k:'dhs',a:list.map(c=>[c.i,c.mode,+c.B.x.toFixed(2),+c.B.y.toFixed(2),+c.B.z.toFixed(2),+c.B.rot.toFixed(2),c.st,Math.round(c.hp),c.sid])})}wasAway=away}
    if(on&&!sunk&&order==='repair'&&hullNeed())Ship.repair(dt*18);   // REPAIR order: the whole crew drops everything and patches the hull (guns hold fire meanwhile)
    else if(on&&!sunk&&calm>4&&hullNeed())Ship.repair(dt*1.6);   // the carpenter patches the hull once it has been quiet for a few seconds
    uiStep(dt)}
  function fired(gi){if(!on)return;const c=list.find(q=>q.role==='gun'&&q.g&&ready()&&ready().guns.indexOf(q.g)===gi);if(c)c.recoil=.35}
  // ---------- orders ----------
  const LBL={fire:'Fire at will',hold:'Hold fire',board:'Board! Cutlasses out',repair:'Repair the ship!'};
  function setOrder(o,isOn,quiet){
    const chg=o!==order||isOn!==on;order=o;on=isOn;
    if(chg&&!quiet)try{banner(on?('Crew: '+LBL[order]):'Crew: dismissed','⚓ CREW')}catch(e){}
    if(chg)for(const c of list)c.jumpT=c.i*.45+.2}
  function command(o,isOn){setOrder(o===undefined?order:o,isOn===undefined?on:isOn);Net.emit('flt',{k:'dho',on:on?1:0,o:order})}
  function toggle(){command(order==='hold'?'fire':'hold');return order==='hold'}
  function onNet(d){
    if(!d)return;
    if(d.k==='dho'){if(!LBL[d.o])return;if(d.o!==order||(!!d.on)!==on)setOrder(d.o,!!d.on)}
    else if(d.k==='dhs'&&!Fleet.isHost()){for(const r of d.a){const c=list[r[0]];if(!c)continue;if(r[1]===1&&c.mode!==1){c.B.x=r[2];c.B.y=r[3];c.B.z=r[4];c.B.rot=r[5]}c.mode=r[1];c.snap=[r[2],r[3],r[4],r[5]];c.st=r[6];if(r[7]<c.hp)c.stg=.2;c.hp=r[7];c.sid=r[8]}}
    else if(d.k==='dhw'){const c=list[d.i];if(c){c.swing=.3;if(c.mode===1)try{Crew.swingFx({B:c.B})}catch(e){}}}}
  // a tap on a menu item: tapping the ACTIVE order again cancels it (back to fire at will; fire at will itself toggles to hold); 'recall' brings the boarders home
  function tap(k){if(k==='crew')command(undefined,!on);else if(k==='recall')command('fire',true);else if(on&&order===k)command(k==='fire'?'hold':'fire',true);else command(k,true)}
  // ---------- the one button ----------
  function buildUI(){
    try{const css=document.createElement('style');css.textContent='#crewcmd{position:fixed;z-index:7;right:calc(env(safe-area-inset-right,0px) + 28px);bottom:calc(env(safe-area-inset-bottom,0px) + 244px);width:44px;height:44px;border-radius:50%;background:#1b3d5acc;color:#fff;font:700 21px sans-serif;border:2px solid #fff8;display:none;align-items:center;justify-content:center;touch-action:none;user-select:none}#crewmenu{position:fixed;z-index:8;right:calc(env(safe-area-inset-right,0px) + 82px);bottom:calc(env(safe-area-inset-bottom,0px) + 232px);display:none;flex-direction:column;gap:6px}#crewmenu div{padding:9px 14px;border-radius:18px;background:#10263acc;color:#fff;font:600 15px sans-serif;border:1.5px solid #fff6;white-space:nowrap;touch-action:none;user-select:none}#crewmenu div.cur{background:#2c7aa8e6;border-color:#fff}';
      (document.head||document.body).appendChild(css);
      btn=document.createElement('div');btn.id='crewcmd';btn.textContent='⚓';document.body.appendChild(btn);
      menu=document.createElement('div');menu.id='crewmenu';document.body.appendChild(menu);
      const items=[['fire','🔥 Fire at will'],['hold','✋ Hold fire'],['repair','🔧 Repair the ship'],['board','⚔ Board them!'],['recall','↩ Back to the ship'],['crew','👥 Crew on / off']];
      for(const [k,l] of items){const d=document.createElement('div');d.dataset.k=k;d.textContent=l;menu.appendChild(d);
        d.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();tap(k);menuT=on?2.2:0;paint();if(!on||k==='crew'||k==='recall')menu.style.display='none'})}
      btn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();const open=menu.style.display==='flex';menu.style.display=open?'none':'flex';menuT=open?0:6;paint()});
      addEventListener('keydown',e=>{if(e.repeat)return;if(e.code==='KeyH')toggle()})}catch(e){}}
  // tapping the ACTIVE order again cancels it (back to fire at will; fire at will itself toggles to hold); 'Back to the ship' recalls boarders
  const ITEM={fire:'🔥 Fire at will',hold:'✋ Hold fire',repair:'🔧 Repair the ship',board:'⚔ Board them!',recall:'↩ Back to the ship'};
  function paint(){if(!menu)return;for(const d of menu.children){const k=d.dataset.k,cur=k!=='recall'&&k!=='crew'&&k===order&&on;d.className=cur||(k==='crew'&&!on)?'cur':'';if(k==='crew')d.textContent=on?'👥 Dismiss crew':'👥 Call the crew';else d.textContent=ITEM[k]+(cur?'  ✓ tap to cancel':'')}}
  function uiStep(dt){
    if(!btn)return;const show=!!(typeof Ship!=='undefined'&&(Ship.onDeck()||Ship.seated()));
    if(show!==btnShow){btnShow=show;btn.style.display=show?'flex':'none';if(!show)menu.style.display='none'}
    btn.style.opacity=on?'1':'.55';
    if(menu.style.display==='flex'){menuT-=dt;paint();if(menuT<=0)menu.style.display='none'}}
  function build(){
    if(built)return;built=true;Systems.add('deckhands',step);Net.on('flt',onNet);buildUI()}
  return {build,step,list,fired,toggle,command,tap,hurt,foes,hold:()=>order==='hold',order:()=>order,on:()=>on,_calm:()=>calm,_reset:()=>{list.length=0},_net:onNet};
})();
