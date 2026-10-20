// Deckhands: your AI crew mates. They live on YOUR galleon: a gunner beside every cannon (fires at pirate ships and sea monsters in the gun's arc, a bit slower than a human gunner)
// and a carpenter who patches the hull when the shooting has stopped. Press H (or Fleet "hold fire") to tell them to hold fire / fire at will.
//  - Positions are deterministic (ship-local stations) so every client draws the same crew with no networking; only the HOST (Fleet host) decides when a gun goes off (Fleet.playerFire
//    emits the shot to everybody). Repair runs on every client and is applied only by the ship's authority (Ship.repair).
// Globals: THREE, scene, S, Ship, Fleet, Decks, Vessel, SHIP, Systems, banner, makeAvatar/dress/animate (index.html), Outlaw (optional).
const Deckhands=(()=>{
  const C=SHIP,NAMES=['Barnacle Bill','Salty Sue','Old Pete','Mara Reef','Tom Tallow','Jinx','Cookie','Marlow'],COL=['#2f6f9f','#9f6f2f','#4f8f5f','#8f4f8f','#9f4f4f','#4f7f8f'];
  const R=Math.random,list=[];let built=false,hold=false,calm=0,hullPrev=null,visOn=true,t=0;
  const _o={x:0,z:0},_w={x:0,y:0,z:0};
  const haveVis=()=>typeof makeAvatar==='function'&&typeof THREE!=='undefined'&&typeof scene!=='undefined';
  const ready=()=>{const v=typeof Ship!=='undefined'&&Ship.vessel&&Ship.vessel();return v&&v.deck&&v.guns&&v.guns.length?v:null};
  // stations: one gunner per gun (a step inboard of the cannon) + a carpenter near the mast
  function setup(v){
    list.length=0;let n=0;const cnt={'-1':0,'1':0};   // at most 3 gunners a side (the rest of the guns are yours)
    for(const g of v.guns){const sd=g.x>0?1:-1;if(cnt[sd]>=3)continue;cnt[sd]++;Vessel.outward(v,g,_o);const lx=g.x-Math.sign(g.side||(g.x>0?1:-1))*1.15,lz=g.z;list.push({role:'gun',g,lx,lz,name:NAMES[n%NAMES.length],col:COL[n%COL.length],rot:0,face:0,g3:null,recoil:0});n++}
    list.push({role:'carp',g:null,lx:0,lz:v.hl*.25,name:'Chips the Carpenter',col:'#8f7a3f',rot:0,face:0,g3:null,recoil:0,wob:R()*6})}
  function visual(c){
    if(c.g3||!haveVis())return;const g=makeAvatar(c.name,c.col);g.userData.noTwist=true;g.scale.setScalar(1);scene.add(g);c.g3=g;
    for(const o of []){}   // (the name sprite stays: they are on your side)
    try{dress(g,c.role==='gun'?3:0)}catch(e){}
    if(c.role==='gun'&&typeof Outlaw!=='undefined'&&Outlaw.setGun)try{Outlaw.setGun(g,0)}catch(e){}}
  function place(v,c,dt){
    const d=v.deck;if(!d)return;const f=Decks.floor(d,c.lx,c.lz);if(!(f>=0))return;
    let lx=c.lx,lz=c.lz;if(c.role==='carp'&&calm>4&&hullNeed()){lz+=Math.sin(t*.6+c.wob)*2.2;lx+=Math.cos(t*.45+c.wob)*1.2}   // busy with a hammer: potters about
    const ff=Decks.floor(d,lx,lz);Decks.toWorld(d,lx,f>=0&&ff>=0?ff:f,lz,_w);
    if(c.g3){c.g3.position.set(_w.x,_w.y,_w.z);
      if(c.role==='gun'){Vessel.outward(v,c.g,_o);c.face=Math.atan2(_o.x,_o.z)}else c.face=v.pose.h+Math.sin(t*.4+c.wob)*1.2;
      let da=c.face-c.g3.rotation.y;da=Math.atan2(Math.sin(da),Math.cos(da));c.g3.rotation.y+=da*Math.min(1,dt*8);
      if(c.recoil>0){c.recoil-=dt;c.g3.userData.recoil=Math.max(0,c.recoil)}
      try{animate(c.g3,dt,'idle')}catch(e){}
      c.g3.visible=visOn}}
  const hullNeed=()=>{try{return Ship._ship.hull<C.hull-1}catch(e){return false}};
  function step(dt){
    if(!built)return;const v=ready();if(!v){return}
    t+=dt;if(!list.length||list[0].v!==v){setup(v);for(const c of list)c.v=v}
    const sunk=Ship._ship&&Ship._ship.sunk>0;visOn=!sunk&&v.loaded!==false;
    // hull tracking: 'calm' = seconds since your ship was last hit
    const h=Ship._ship?Ship._ship.hull:null;if(h!==null){if(hullPrev!==null&&h<hullPrev-.5)calm=0;hullPrev=h}calm+=dt;
    const host=Fleet.isHost(),seated=Ship.role&&Ship.role()==='gun';
    for(const c of list){
      if(c.role==='gun'&&!hold&&!sunk&&host&&!seated&&c.g.cd<=0){
        c.think=(c.think||0)-dt;if(c.think<=0){c.think=.25+R()*.35;
          if(Fleet.playerFire(c.g,true,false,true)){c.recoil=.35}}}
      if(haveVis()&&v.loaded!==false)visual(c);place(v,c,dt)}
    // the carpenter patches the hull once it has been quiet for a few seconds
    if(!sunk&&calm>4&&hullNeed())Ship.repair(dt*1.6)}
  // guests see the gunners kick when a ball leaves a gun of your ship ('f' messages go through Fleet.fire; this hook is called from there)
  function fired(gi){const c=list.find(q=>q.role==='gun'&&ready()&&ready().guns.indexOf(q.g)===gi);if(c)c.recoil=.35}
  function toggle(){hold=!hold;try{banner(hold?'Crew: hold fire':'Crew: fire at will','⚓ CREW')}catch(e){}return hold}
  function build(){
    if(built)return;built=true;Systems.add('deckhands',step);
    try{addEventListener('keydown',e=>{if(e.repeat)return;if(e.code==='KeyH')toggle()})}catch(e){}}
  return {build,step,list,fired,toggle,hold:()=>hold,_calm:()=>calm,_reset:()=>{list.length=0}};
})();
