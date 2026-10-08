// SpaceObjects: things you can find out in space. Each one is a small definition registered here (id, position, how to build it, how to animate it);
// this module does the shared parts: a distant blinking beacon, the real model only when you are close, approach assist (see SpaceFlight), and
// discovery (you have to get close AND look at it for a moment: noticing, not tripping over). Asteroids, debris fields and later landmarks
// are more register() calls. Procedural low-poly geometry, one shared texture, no per-frame allocation: cheap enough for phones.
//
// First object: an old communication satellite. High above the world and a little off to one side of the climb to space, it first shows as a tiny
// blinking light. Close up it is a gold-foil bus with one good solar wing, one torn wing, a dish, a mast, and a few pieces of itself drifting around it.
const SpaceObjects=(()=>{
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const defs=[],live=[];
  const ASSIST_NEAR=300,ASSIST_FAR=3000,FIND_R=90,FIND_T=1.4,MODEL_R=5000;
  const assistFor=d=>sm(ASSIST_NEAR,ASSIST_FAR,d);                      // 0 close (normal flight speed) .. 1 far (full altitude speed)
  const _d=new THREE.Vector3(),_c=new THREE.Vector3();
  function tex(w,h,draw){if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.anisotropy=2;return t}
  const glowTex=()=>tex(64,64,(g,w,h)=>{const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.22,'rgba(255,255,255,.95)');r.addColorStop(.42,'rgba(255,255,255,.4)');r.addColorStop(.7,'rgba(255,255,255,.09)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,w,h)});
  const panelTex=()=>tex(128,64,(g,w,h)=>{g.fillStyle='#10244a';g.fillRect(0,0,w,h);g.strokeStyle='#2c4f8c';g.lineWidth=2;for(let x=0;x<=w;x+=16){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke()}for(let y=0;y<=h;y+=16){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}
    let s=7;const r=()=>(s=s*16807%2147483647)/2147483647;for(let i=0;i<9;i++){g.fillStyle='rgba(2,6,16,.75)';g.fillRect(((r()*8)|0)*16+1,((r()*4)|0)*16+1,14,14)}   // dead cells
    g.fillStyle='rgba(120,170,255,.10)';g.fillRect(0,0,w,6)});

  // ---------------------------------------------------------------------------------------------------------------- the satellite
  function buildSatellite(o){
    const g=new THREE.Group(),M=(c,m,r)=>new THREE.MeshStandardMaterial({color:c,metalness:m,roughness:r,flatShading:true});
    const gold=M('#c9a24b',.5,.45),steel=M('#8c95a3',.45,.55),dark=M('#2c313b',.3,.7),pt=panelTex();
    const solar=new THREE.MeshStandardMaterial({color:'#ffffff',map:pt,metalness:.35,roughness:.4,flatShading:true});
    const add=(geo,mat,x,y,z,rx,ry,rz,par)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);if(rx||ry||rz)m.rotation.set(rx||0,ry||0,rz||0);(par||g).add(m);return m};
    add(new THREE.BoxGeometry(3.4,3,4.6),gold,0,0,0);                                          // bus
    add(new THREE.BoxGeometry(3.7,3.3,.4),steel,0,0,1.9);add(new THREE.BoxGeometry(3.7,3.3,.4),steel,0,0,-1.9);
    add(new THREE.BoxGeometry(1.7,.8,2.2),steel,0,1.9,.3);                                      // instrument bay
    add(new THREE.ConeGeometry(.8,1.6,10),dark,0,0,-3.3,-Math.PI/2);                            // thruster
    add(new THREE.CylinderGeometry(.14,.14,1.8,6),steel,-2.6,0,0,0,0,Math.PI/2);add(new THREE.CylinderGeometry(.14,.14,1.8,6),steel,2.6,0,0,0,0,Math.PI/2);   // wing arms
    add(new THREE.BoxGeometry(8.6,.1,3.4),solar,-7.8,0,0);                                      // good wing
    const torn=new THREE.Group();torn.position.set(3.5,0,0);torn.rotation.z=-.32;g.add(torn);    // torn wing: shorter, bent, loose edge
    add(new THREE.BoxGeometry(5.2,.1,3.4),solar,2.6,0,0,0,0,0,torn);add(new THREE.BoxGeometry(1.4,.09,3.4),solar,5.9,-.5,0,0,0,.5,torn);
    add(new THREE.CylinderGeometry(.03,.03,3.2,4),dark,5.3,-.9,.8,0,0,.9,torn);                 // hanging cable
    add(new THREE.CylinderGeometry(.12,.12,2.4,6),steel,0,2.6,-.4,.25);                        // dish mast
    const dish=add(new THREE.SphereGeometry(1.7,14,8,0,Math.PI*2,0,.95),steel,0,3.9,.5,-1.0);dish.material=steel.clone();dish.material.side=THREE.DoubleSide;
    add(new THREE.CylinderGeometry(.05,.05,5.4,5),steel,-1.2,3.2,-1.4);                         // long antenna
    const light=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),new THREE.MeshBasicMaterial({color:'#ff6a55',fog:false}));light.position.set(-1.2,5.95,-1.4);g.add(light);
    o.light=light;
    // pieces of it, drifting around it
    o.debris=[];let s=91;const r=()=>(s=s*16807%2147483647)/2147483647;
    for(let i=0;i<9;i++){const sz=.3+r()*1.1,m=new THREE.Mesh(i%3===0?new THREE.BoxGeometry(sz*2.2,.08,sz*1.4):new THREE.BoxGeometry(sz,sz*.6,sz*.9),[gold,steel,dark,solar][i%4]);
      m.userData={rad:9+r()*22,w:(r()<.5?-1:1)*(.012+r()*.03),ph:r()*6.28,yy:(r()-.5)*10,sx:(r()-.5)*.5,sy:(r()-.5)*.5,sz:(r()-.5)*.5};g.add(m);o.debris.push(m)}
    o.rot0=r()*6.28;return g}
  function updateSatellite(o,dt,t){
    const g=o.group;g.rotation.set(.25*Math.sin(t*.03),o.rot0+t*.045,.15*Math.cos(t*.021));
    for(const m of o.debris){const u=m.userData,a=u.ph+t*u.w;m.position.set(Math.cos(a)*u.rad,u.yy+Math.sin(a*1.7)*2,Math.sin(a)*u.rad);m.rotation.x+=u.sx*dt;m.rotation.y+=u.sy*dt;m.rotation.z+=u.sz*dt}}

  function register(def){defs.push(def)}
  register({id:'satellite',name:'Abandoned satellite',pos:[8000,112000,-11000],icon:'🛰️',build:buildSatellite,update:updateSatellite,
    found:{text:'Found an old satellite, drifting high above the world',banner:'An old satellite, drifting. Nobody has touched it in years.'}});

  // ---------------------------------------------------------------------------------------------------------------- shared logic
  let glow=null;
  function build(){
    if(live.length||typeof scene==='undefined')return;
    if(typeof SpaceEvents!=='undefined'){SpaceEvents.init();SpaceEvents.onPartnerFound(id=>{const o=live.find(x=>x.def.id===id);if(!o)return;o.found=true;banner('Your partner found something out here.','SIGNAL')})}
    glow=glowTex();
    for(const d of defs){
      const o={def:d,pos:new THREE.Vector3(d.pos[0],d.pos[1],d.pos[2]),found:typeof SpaceEvents!=='undefined'&&SpaceEvents.isFound(d.id),look:0,dist:1e12};
      o.group=d.build(o);o.group.position.copy(o.pos);o.group.visible=false;scene.add(o.group);
      o.beacon=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:'#ff6a55',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,opacity:0,toneMapped:false}));
      o.beacon.position.copy(o.pos);o.beacon.visible=false;o.beacon.renderOrder=15;scene.add(o.beacon);live.push(o)}}
  function ping(){try{const a=WAudio.get();if(!a)return;const t=a.currentTime;for(const [f,v] of [[196,.07],[294,.035]]){const o=a.createOscillator(),g=a.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(WAudio.out());g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.08);g.gain.exponentialRampToValueAtTime(.0005,t+3.4);o.start(t);o.stop(t+3.5)}}catch(e){}}
  function discover(o){
    o.found=true;
    if(typeof SpaceEvents!=='undefined'&&SpaceEvents.discover(o.def.id,{text:o.def.found.text,icon:o.def.icon,x:Math.round(o.pos.x),y:Math.round(o.pos.y),z:Math.round(o.pos.z)})){
      if(typeof banner==='function')banner(o.def.found.banner,'FOUND SOMETHING');ping()}}
  function update(dt,t){
    if(!live.length)return;
    let nearest=1e12;const stars=Space.f.stars,vis=sm(.12,.45,stars);       // the beacon is only visible against a dark sky
    for(const o of live){
      const dx=o.pos.x-S.x,dy=o.pos.y-S.y,dz=o.pos.z-S.z,dist=Math.hypot(dx,dy,dz);o.dist=dist;if(dist<nearest)nearest=dist;
      const near=dist<MODEL_R;o.group.visible=near;if(near)o.def.update(o,dt,t);
      // distant beacon: a tiny blinking light (constant on-screen size), handing over to the real nav light up close
      const b=o.beacon,show=vis>.01&&dist>60;b.visible=show;
      // ~20 px quad (bright core ~6 px, soft halo): noticeable against the stars, still just a light
      if(show){const ph=(t%2.4)/2.4,pulse=Math.exp(-ph*9),far=sm(60,160,dist);
        b.material.opacity=vis*far*(.2+.8*pulse);b.material.color.set(o.found?'#7fe8ff':'#ff6a55');const sc=clamp(dist*.05,1.5,2000);b.scale.set(sc,sc,1)}
      if(near){const ph=(t%2.4)/2.4,pulse=Math.exp(-ph*9),l=o.light;if(l){l.scale.setScalar(.7+2.2*pulse);l.material.color.set(o.found?'#7fe8ff':'#ff6a55')}}
      // discovery: close enough AND looking at it for a moment
      if(!o.found&&dist<FIND_R&&typeof camera!=='undefined'){
        camera.getWorldDirection(_d);_c.set(dx,dy,dz).normalize();
        if(_d.dot(_c)>.55)o.look+=dt;else o.look=Math.max(0,o.look-dt*.5);
        if(o.look>FIND_T)discover(o)}}
    SpaceFlight.setAssist(assistFor(nearest));}
  return {register,build,update,assistFor,live,defs,FIND_R,FIND_T,MODEL_R};
})();
if(typeof module!=='undefined')module.exports=SpaceObjects;
