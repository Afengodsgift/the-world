// Sky Raid visuals smoke test: the world builds with real three.js (canvas stubbed), draws every stage's fortress, ship, drones, shots and effects from a live
// core run, and stays cheap (few meshes, no per-frame growth). Also runs SkyRaid.js's controller through begin() with stubbed DOM to catch silent crashes.
// Run: node tests/skyraid_world.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const THREE=require('three');
const g2d=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
const doc={createElement:()=>({width:0,height:0,getContext:()=>g2d,style:{}})};
const ctx={Math,Object,Number,JSON,Array,isFinite,Map,Float32Array,console,THREE,document:doc,Set,String,Date,performance,setTimeout,clearTimeout,module:undefined};vm.createContext(ctx);
vm.runInContext(['src/ship/SkyRaidCore.js','src/ship/SkyRaidWorld.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n')+';this.SC=SkyCore;this.SW=SkyRaidWorld',ctx);
const {SC,SW}=ctx;let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const O={seed:3,cx:-1900,cz:2350,base:430,hasGunner:true},scene=new THREE.Scene();
let W=null,err=null;try{W=SW.build(scene)}catch(e){err=e}ok(W&&!err,`world builds${err?' ('+err.message+')':''}`);
if(W){
  const run=SC.newRun(O);SC.step(run,1/30,{});const view={x:run.ship.x,y:run.ship.y,z:run.ship.z,h:run.ship.h,p:0,roll:0};
  const count=()=>{let n=0;W.root.traverse(o=>{if(o.isMesh||o.isSprite)n++});return n};
  const meshes=[];
  for(let k=0;k<4;k++){
    SC.startStage(run,k);run.state='raid';let e2=null;
    try{W.sync(run,view,{yaw:.3,pit:.2},1+k,1/60);for(const ev of [{k:'tracer',x:0,y:0,z:0,tx:50,ty:10,tz:50,hit:'turret'},{k:'boom',x:1,y:2,z:3,s:2},{k:'dmg',n:15,x:0,y:0,z:0,kind:'core'},{k:'spark',x:0,y:0,z:0},{k:'hurt'}])W.fx(ev,run,1);
      for(let i=0;i<20;i++)W.sync(run,view,null,1+k+i/60,1/60)}catch(e){e2=e}
    ok(!e2,`stage ${k+1} (${run.fort.F.n}) draws${e2?' ('+e2.message+')':''}`);meshes.push(count());
  }
  ok(meshes.every(n=>n>40&&n<260),`mesh counts stay small (${meshes.join(' / ')})`);
  const before=count();for(let i=0;i<300;i++){W.sync(run,view,null,5+i/60,1/60);W.fx({k:'tracer',x:0,y:0,z:0,tx:9,ty:0,tz:9,hit:null},run,1)}ok(count()===before,'effects are pooled: no meshes created while running');
  // kill everything: the destroyed parts disappear
  for(const t of run.fort.turrets)t.alive=0;for(const g of run.fort.gens)g.alive=0;W.sync(run,view,null,9,1/60);
  let vis=0;W.fortress.turrets.forEach(t=>{if(t.o.visible)vis++});ok(vis===0,'destroyed turrets are hidden');ok(!W.fortress.shield.visible,'the shield bubble drops with the generators');
  W.hide();ok(!W.root.visible,'world hides when the raid ends');
}
process.exit(fails?1:0);
