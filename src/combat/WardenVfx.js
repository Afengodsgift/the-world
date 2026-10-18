// WARDEN: pooled sprite effects (slash arcs, hit sparks, streaks) from one 64px atlas (assets/warden/vfx.webp: 4 colour sets x 5 rows x 6 frames).
// Rows: 0 crescent, 1 crescent (reverse), 2 faint smear, 3 spark burst, 4 streak. Sets: 0 amber, 1 violet, 2 blue, 3 orange.
// Bounded: POOL sprites, each with its own cloned texture view (shared image), no per-effect allocation. Additive, depth-test off so it reads on a phone.
// Globals used: THREE, scene, H.
const WardenVfx=(()=>{
  const POOL=14,FPS=22;
  let G=null,tex=null,pool=[],loading=false;
  function build(){
    if(G||typeof THREE==='undefined')return;G=new THREE.Group();G.name='WardenVfx';scene.add(G);
    new THREE.TextureLoader().load('assets/warden/vfx.webp',t=>{tex=t;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;
      for(let i=0;i<POOL;i++){const tt=t.clone();tt.needsUpdate=true;tt.repeat.set(1/6,1/20);
        const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tt,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,fog:false}));
        sp.visible=false;sp.renderOrder=10;sp.frustumCulled=false;G.add(sp);pool.push({sp,tt,t:0,row:0,n:6,fps:FPS,size:1})}})}
  // spawn: x,y,z world; set 0-3; row 0-4; size m; rot radians (screen-plane); fps
  function spawn(x,y,z,set,row,size,rot,fps){
    if(!G||!pool.length)return;let p=pool.find(o=>!o.sp.visible);if(!p){p=pool.reduce((a,b)=>b.t>a.t?b:a)}
    p.t=0;p.row=set*5+row;p.size=size;p.fps=fps||FPS;p.sp.material.rotation=rot||0;p.sp.position.set(x,y,z);p.sp.scale.setScalar(size);p.sp.material.opacity=1;p.sp.visible=true;frame(p,0)}
  function frame(p,f){p.tt.offset.set(f/6,1-(p.row+1)/20)}
  function update(dt){
    for(const p of pool){if(!p.sp.visible)continue;p.t+=dt;const f=Math.floor(p.t*p.fps);if(f>=p.n){p.sp.visible=false;continue}frame(p,f)}}
  function clear(){for(const p of pool)p.sp.visible=false}
  // named effects used by PlayerCombat.events()
  const R=Math.random;
  function hit(x,y,z,crit,heavy){spawn(x,y,z,crit?0:3,3,heavy?2.2:1.5,R()*6.28,26);if(heavy||crit)spawn(x,y,z,crit?0:3,R()<.5?0:1,heavy?2.6:2,R()*6.28,24)}
  function slash(x,y,z,face,heavy,set){const a=R()<.5;spawn(x+Math.sin(face)*.9,y,z+Math.cos(face)*.9,set==null?(heavy?3:0):set,a?0:1,heavy?3.4:2.6,(R()-.5)*.8,24)}
  function clash(x,y,z,big){spawn(x,y,z,2,3,big?2.4:1.7,R()*6.28,28);spawn(x,y,z,2,4,big?3:2,R()*3.14,28)}
  function burst(x,y,z,set){spawn(x,y,z,set==null?1:set,0,4.5,0,18);spawn(x,y,z,set==null?1:set,3,3.5,R()*6.28,18)}
  return{build,spawn,update,clear,hit,slash,clash,burst,_t:()=>({pool,G})}})();
if(typeof module!=='undefined')module.exports=WardenVfx;
