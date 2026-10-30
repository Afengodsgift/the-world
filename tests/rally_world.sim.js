// RallyWorld smoke test: both courses must actually BUILD their meshes (roads, arches, rings, forks, bonus rings, pads) with real three.js, and update() must run.
// (A silent exception in build() means no roads or rings in the game.) Canvas is stubbed. Run: node tests/rally_world.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const THREE=require('three');
const g2d=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
const doc={createElement:()=>({width:0,height:0,getContext:()=>g2d,style:{}})};
const ctx={Math,Object,Number,JSON,Array,isFinite,Map,Float32Array,Uint16Array,Uint32Array,console,THREE,document:doc,Set,String,Date};vm.createContext(ctx);
vm.runInContext(['src/data/rally.js','src/race/CarPhysics.js','src/data/tracks.js','src/race/Track.js','src/race/RallyWorld.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n')+';this.TR=TRACKS;this.Tk=Track;this.RW=RallyWorld',ctx);
const {TR,Tk,RW}=ctx;
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const ISL=[{x:760,z:1400,R:230,pk:0},{x:0,z:1750,R:180,pk:10},{x:-980,z:1450,R:300,pk:60}];
const H=(x,z)=>{let h=-12;for(const I of ISL){const dx=x-I.x,dz=z-I.z,dd=Math.hypot(dx,dz),v=Math.max(-12,(1-(dd/I.R)**2)*4-.6)+Math.sin(x*.09)*Math.cos(z*.11)*.7+I.pk*Math.exp(-dd*dd/(2*(I.R*.35)**2));if(v>h)h=v}return h};
for(const id of Object.keys(TR)){
  const T=Tk.build(TR[id],{H}),scene=new THREE.Scene();let w=null,err=null;
  try{w=RW.build(T,scene,H);w.update(1,0,1,[]);w.update(2,5,2,[0])}catch(e){err=e}
  ok(!err&&w,`${id}: world builds and updates${err?' ('+err.message+')':''}`);
  if(!w)continue;
  let meshes=0,tris=0;w.root.traverse(o=>{if(o.isMesh){meshes++;const g=o.geometry;tris+=(g.index?g.index.count:g.attributes.position.count)/3}});
  ok(meshes>T.gates.length&&tris>5000,`${id}: ${meshes} meshes, ${tris|0} triangles drawn`);
  ok(scene.children.includes(w.root),`${id}: world is in the scene`);
}
process.exit(fails?1:0);
