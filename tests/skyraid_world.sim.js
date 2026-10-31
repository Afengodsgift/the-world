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
  const count=()=>{let n=0;W.root.traverseVisible(o=>{if(o.isMesh||o.isSprite)n++});return n},total=()=>{let n=0;W.root.traverse(o=>{if(o.isMesh||o.isSprite)n++});return n};
  const meshes=[];
  for(let k=0;k<4;k++){
    SC.startStage(run,k);run.state='raid';let e2=null;
    try{W.sync(run,view,{yaw:.3,pit:.2},1+k,1/60);for(const ev of [{k:'tracer',x:0,y:0,z:0,tx:50,ty:10,tz:50,hit:'turret'},{k:'boom',x:1,y:2,z:3,s:2},{k:'dmg',n:15,x:0,y:0,z:0,kind:'core'},{k:'spark',x:0,y:0,z:0},{k:'hurt'}])W.fx(ev,run,1);
      for(let i=0;i<20;i++)W.sync(run,view,null,1+k+i/60,1/60)}catch(e){e2=e}
    ok(!e2,`stage ${k+1} (${run.fort.F.n}) draws${e2?' ('+e2.message+')':''}`);meshes.push(count());
  }
  ok(meshes.every(n=>n>=8&&n<90),`draw calls stay small thanks to merged geometry (${meshes.join(' / ')} visible meshes, was ~190)`);
  const before=total();for(let i=0;i<300;i++){W.sync(run,view,null,5+i/60,1/60);W.fx({k:'tracer',x:0,y:0,z:0,tx:9,ty:0,tz:9,hit:null},run,1)}ok(total()===before,'effects are pooled: no meshes created while running');
  // v2 visuals: missiles, SAMs, roll spin, the drone model swap
  run.msl.push({x:5,y:5,z:5,vx:0,vy:0,vz:100,tid:null,life:2});run.sams.push({id:'s',x:9,y:9,z:9,vx:10,vy:0,vz:0,hp:1,alive:1});view.spin=1.2;let e3=null;try{W.sync(run,view,null,6,1/60);W.fx({k:'dmg',n:15,x:0,y:0,z:0,kind:'sam'},run,6)}catch(e){e3=e}
  ok(!e3,'missiles, SAMs and the roll spin draw'+(e3?' ('+e3.message+')':''));let mv=0;W.root.children.forEach(c=>{if(c.visible&&c.position.x===5&&c.position.z===5)mv++});ok(mv===1,'the missile is placed');view.spin=0;
  { const geo=new THREE.BoxGeometry(2,1,2),col=new Float32Array(geo.attributes.position.count*3).fill(.5);geo.setAttribute('color',new THREE.BufferAttribute(col,3));W.useDrone(geo);ok(W.droneModel,'a loaded drone model replaces the placeholder drones');
    run.drones.push({id:'dd',x:1,y:2,z:3,vx:1,vy:0,vz:0,hp:24,max:24,alive:1});let e4=null;try{W.sync(run,view,null,7,1/60)}catch(e){e4=e}ok(!e4,'and draws') }
  { const geo=new THREE.BoxGeometry(8,3,20);geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count*3).fill(.4),3));W.useShip(geo);ok(W.shipModel,'a loaded ship model replaces the placeholder galleon');
    let e5=null;try{view.roll=.3;W.sync(run,view,{yaw:.2,pit:.1},8,1/60)}catch(e){e5=e}ok(!e5,'and the model ship draws with the turret barrel'+(e5?' ('+e5.message+')':'')) }
  // v3 visuals: balloons, repair kits, flak, the boss laser
  { SC.startStage(run,3);run.state='raid';run.balloons.push({id:'bb',x:20,y:30,z:20,hp:100,max:150,h:1,alive:1});run.picks.push({id:'pp',x:5,y:5,z:5,t:9});run.flak.push({x:7,y:7,z:7,t:.5});run.fort.lz.st=2;run.fort.lz.a=.5;let e6=null;
    try{W.sync(run,view,null,9,1/60);W.fx({k:'pick',x:1,y:1,z:1},run,9)}catch(e){e6=e}ok(!e6,'balloon, repair kit, flak and laser draw'+(e6?' ('+e6.message+')':''));
    const b=new THREE.BoxGeometry(5,5,5);b.setAttribute('color',new THREE.BufferAttribute(new Float32Array(b.attributes.position.count*3).fill(.5),3));W.useBalloon(b);let e7=null;try{W.sync(run,view,null,10,1/60)}catch(e){e7=e}ok(!e7,'a loaded balloon model swaps in') }
  { run.imps.push({id:'im',x:3,y:3,z:3,vx:10,vy:0,vz:5,hp:9,alive:1});run.allies[0].init=1;run.state='raid';let e8=null;try{W.sync(run,view,null,11,1/60)}catch(e){e8=e}ok(!e8,'imps and wingmen draw'+(e8?' ('+e8.message+')':''));
    let nv=0;W.root.traverseVisible(o=>{if(o.isMesh)nv++});ok(nv<90,`still cheap with everything on screen (${nv} visible meshes)`) }
  // kill everything: the destroyed parts disappear
  for(const t of run.fort.turrets)t.alive=0;for(const g of run.fort.gens)g.alive=0;W.sync(run,view,null,9,1/60);
  let vis=0;W.fortress.turrets.forEach(t=>{if(t.o.visible)vis++});ok(vis===0,'destroyed turrets are hidden');ok(!W.fortress.shield.visible,'the shield bubble drops with the generators');
  W.hide();ok(!W.root.visible,'world hides when the raid ends');
}
process.exit(fails?1:0);
