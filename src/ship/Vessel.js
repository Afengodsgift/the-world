// Vessel: the BODY of a ship, yours or a pirate's: model, sails, flags, cannons on the rails, a real walkable deck (Decks), bobbing on the sea, sinking, and "did a shell hit me".
// No AI, no network, no physics of its own: whoever owns the ship (src/ship/Ship.js for yours, src/ship/Fleet.js for the pirates) feeds it x / z / heading / roll every frame.
// Ship space: metres, origin at the keel centre, +Z = bow, +X = port. Globals: THREE, scene, SHIP, Decks, Sailing, Env (optional).
const Vessel=(()=>{
  const C=SHIP,cache={},pending=[];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const loader=()=>(typeof THREE!=='undefined'&&THREE.GLTFLoader)?new THREE.GLTFLoader():null;
  // one load per file, shared by everybody (null when it cannot load: the ship is then an invisible but still walkable / shootable hull)
  function model(path){
    return cache[path]||(cache[path]=new Promise(res=>{const L=loader();if(!L){res(null);return}try{L.load(path,g=>res(g.scene),undefined,()=>res(null))}catch(e){res(null)}}))}
  function track(p){pending.push(p);return p}
  async function put(path,x,y,z,sc,ry,parent){
    const m=await model(path);if(!m)return null;const o=m.clone(true);o.position.set(x,y,z);o.scale.setScalar(sc||1);o.rotation.y=ry||0;
    o.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true}});if(parent||scene)(parent||scene).add(o);return o}
  const storm=()=>{try{return typeof Env!=='undefined'&&Env.state&&Env.state.wx?Env.state.wx.storm||0:0}catch(e){return 0}};
  // ---------- hull facts from the baked grid ----------
  function measure(d){
    let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,hi=0;
    for(let iz=0;iz<d.nz;iz++)for(let ix=0;ix<d.nx;ix++){const v=d.h[iz*d.nx+ix];if(v<0)continue;const x=(d.x0+(ix+.5)*d.cs)*d.sc,z=(d.z0+(iz+.5)*d.cs)*d.sc;x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);hi=Math.max(hi,v*d.sc)}
    return {x0,x1,z0,z1,hl:Math.max(-z0,z1),hb:Math.max(-x0,x1),top:hi}}
  // cannons along the rails: for each side find the main deck's inner rail edge at every z, then spread n guns over the stretch where the deck is widest
  function placeGuns(v){
    const d=v.deck,K=v.K,M=K.deckM,out=[];
    const edge=(side,z)=>{for(let x=v.hb+.5;x>.4;x-=.2){const f=Decks.floor(d,side*x,z);if(f>=0&&Math.abs(f-M)<.2)return x}return 0};   // the outermost main-deck cell = just inside the rail
    for(const side of [1,-1]){
      const zs=[];for(let z=-v.hl*.6;z<=v.hl*.7;z+=.5)zs.push([z,edge(side,z)]);
      const wide=Math.max(...zs.map(a=>a[1])),ok=zs.filter(a=>a[1]>=wide*.68);if(!ok.length||wide<1.5)continue;
      const za=ok[0][0],zb=ok[ok.length-1][0],n=K.guns;
      for(let i=0;i<n;i++){const z=n===1?(za+zb)/2:za+(zb-za)*i/(n-1),e=edge(side,z)||wide;out.push({side,i,x:side*(e-.8),z,ry:side*Math.PI/2,ly:M,cd:0,obj:null,recoil:0})}}
    return out}
  // ---------- create ----------
  // o: {x,z,h, tint (flag colour), noGuns}
  function create(id,clsId,o){
    o=o||{};const K=C.cls[clsId];if(!K)return null;
    const v={id,clsId,K,hp:K.hp,maxHp:K.hp,sunk:0,t:Math.random()*20,ph:Math.random()*6.28,sails:[],flags:[],guns:[],pose:{x:o.x||0,y:C.sea-K.draft,z:o.z||0,h:o.h||0,pitch:0,roll:0,px:o.x||0,pz:o.z||0,ph:o.h||0,py:C.sea-K.draft},
      grp:null,deck:null,hl:0,hb:0,top:0,loaded:false,tint:o.tint||null};
    v.deck=Decks.add(id,{grid:K.grid,sc:K.scale,name:K.name});
    if(v.deck){const m=measure(v.deck);v.hl=m.hl;v.hb=m.hb;v.top=m.top}else{v.hl=11;v.hb=5}
    if(typeof THREE!=='undefined'&&typeof scene!=='undefined'){
      v.grp=new THREE.Group();v.grp.rotation.order='YXZ';scene.add(v.grp);
      track(model(K.file).then(m=>{if(!m||v.disposed)return;const ob=m.clone(true);ob.scale.setScalar(K.scale);
        ob.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true}if(K.sails&&K.sails.test(c.name))v.sails.push({n:c,r:c.rotation.y});if(K.flags&&K.flags.test(c.name)){v.flags.push({n:c,r:c.rotation.y});
          if(v.tint&&c.material){c.material=c.material.clone();c.material.color&&c.material.color.set(v.tint)}}});v.grp.add(ob);v.loaded=true}));
    }
    if(v.deck)v.deck.camH=K.deckM+3.4;
    if(v.deck)Decks.seal(v.deck,K.deckM-.25,K.deckM+2.0,2.6,2,K.gangway);
    if(v.deck&&K.dais){Decks.stamp(v.deck,K.dais.x,K.dais.z,K.dais.r+.6,K.dais.h-.5);Decks.stamp(v.deck,K.dais.x,K.dais.z,K.dais.r,K.dais.h)}   // the wheel's dais: two walkable steps up (the model's steps are decoration)
    if(v.deck&&!o.noGuns){v.guns=placeGuns(v);for(const g of v.guns){Decks.stampBox(v.deck,g.x,g.z,.55,1.0,0,1.7);
      if(v.grp)track(put('assets/pirates/cannon_001.glb',g.x,g.ly,g.z,1.25,g.ry,v.grp).then(c=>{g.obj=c}))}}
    if(v.deck)Decks.setPose(v.deck,v.pose);
    return v}
  // ---------- per frame ----------
  // st: {x,z,h,roll,v}; drives the pose, the model and the walkable deck. dt seconds.
  const _op={y:0,pitch:0,roll:0};
  function update(v,dt,st){
    v.t+=dt;const q=v.pose,sw=1+.5*storm(),k=v.K.scale/2.2;
    q.px=q.x;q.pz=q.z;q.ph=q.h;q.py=q.y;
    q.x=st.x;q.z=st.z;q.h=st.h;
    const sk=v.sunk;
    // the hull rides the shared ocean (Ocean.pose: centre/bow/stern/port/starboard samples of the same wave function the water shader draws).
    // Low-passed so short chop never jitters the deck; bounded inside Ocean.pose; the old gentle bob remains as a fallback when there is no Ocean.
    let wy=Math.sin(v.t*1.3+v.ph)*.07*sw*k,wp=Math.sin(v.t*1.05+1+v.ph)*.012*sw/Math.max(.7,k),wr=Math.sin(v.t*.9+v.ph)*.012*sw/Math.max(.7,k);
    if(typeof Ocean!=='undefined'){
      const o=Ocean.pose(q.x,q.z,q.h,v.hl||11,v.hb||5,Date.now()/1000,undefined,_op,1),f=Math.min(1,dt*3.5);
      if(v.wv===undefined){v.wv=o.y;v.wpi=o.pitch;v.wro=o.roll}else{v.wv+=(o.y-v.wv)*f;v.wpi+=(o.pitch-v.wpi)*f;v.wro+=(o.roll-v.wro)*f}
      wy=v.wv;wp=v.wpi;wr=v.wro}
    q.y=C.sea-v.K.draft+wy-sk*(v.K.deckM+4);
    q.pitch=wp+(st.v||0)*.0015+sk*.35;
    q.roll=(st.roll||0)+wr+sk*.25*(v.ph>3?1:-1);
    if(v.grp){v.grp.position.set(q.x,q.y,q.z);v.grp.rotation.set(q.pitch,q.h,q.roll)}
    if(v.deck)Decks.setPose(v.deck,q);
    if(typeof WaterFX!=='undefined'&&WaterFX.vessel)WaterFX.vessel(v,dt,st.v);
    for(const g of v.guns){if(g.cd>0)g.cd-=dt;g.recoil=Math.max(0,g.recoil-dt*3);if(g.obj){g.obj.position.set(g.x-g.side*g.recoil*.45,g.ly,g.z)}}
    // sails: swing toward the wind side; flags flutter
    if(v.sails.length&&st.rel!==undefined)for(const s of v.sails)s.n.rotation.y=s.r+clamp(st.rel,-1,1)*.35*(st.sail===undefined?1:st.sail);
    v.flags.forEach((f,i)=>{f.n.rotation.y=f.r+Math.sin(v.t*3+i*1.3)*.22})}
  // ---------- guns + hits ----------
  const _w={};
  const muzzle=(v,g,o)=>Decks.toWorld(v.deck,g.x+g.side*1.05,g.ly+.8,g.z,o||{});
  // firing direction of a gun at ship-space angle: the barrel points straight out of its side; returns the world direction (unit) of "out" for this side
  function outward(v,g,o){const a=Decks.toWorld(v.deck,g.x+g.side,g.ly,g.z,{}),b=Decks.toWorld(v.deck,g.x,g.ly,g.z,{});o=o||{};const dx=a.x-b.x,dz=a.z-b.z,l=Math.hypot(dx,dz)||1;o.x=dx/l;o.z=dz/l;return o}
  // does the point (world) lie inside this hull's solid parts? -> null | {kind:'hull'|'deck', l:{x,y,z}} (ship space)
  function hit(v,x,y,z){
    if(!v.deck||v.sunk>=.6)return null;const l=Decks.toLocal(v.deck,x,y,z,_w);if(l.y<-.5)return null;
    const f=Decks.floor(v.deck,l.x,l.z);if(f<0||l.y>f)return null;
    return {kind:l.y>v.K.deckM-.6?'deck':'hull',l:{x:l.x,y:l.y,z:l.z}}}
  function dispose(v){v.disposed=true;Decks.remove(v.id);if(v.grp&&typeof scene!=='undefined'){scene.remove(v.grp);v.grp.traverse(o=>{if(o.geometry&&!o.userData.shared){}})}}
  return {create,update,muzzle,outward,hit,dispose,model,put,track,whenReady:()=>Promise.all(pending),measure};
})();
