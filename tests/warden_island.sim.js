// Warden Isles M1b geometry checks: arena flatness, one usable gate, pillar placement, walking in through the gate with the game's own solid push-out, sword files.
const fs=require('fs'),vm=require('vm'),G=require('./golden/golden_lib.js');
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const on=G.makeH(true),c=on;const W=vm.runInContext('WARDEN',c),WRD=c.W,sol=vm.runInContext('WardenSolids()',c),H=c.H;
// arena
let flat=0;for(let a=0;a<360;a+=10)for(let d=0;d<=W.arenaR;d+=5){const x=WRD.x+Math.sin(a*Math.PI/180)*d,z=WRD.z+Math.cos(a*Math.PI/180)*d;flat=Math.max(flat,Math.abs(H(x,z)-W.plateauY))}
ok(flat<1e-9,'arena floor is perfectly flat at '+W.plateauY+' m (max dev '+flat.toExponential(1)+')');
const wall=sol.filter(s=>s.wall),pil=sol.filter(s=>s.pillar);
ok(wall.every(s=>Math.abs(Math.hypot(s.x-WRD.x,s.z-WRD.z)-s.r-W.arenaR)<1e-9),'wall inner face sits exactly on the arena rim (R='+W.arenaR+')');
ok(pil.length===4&&pil.every(p=>Math.hypot(p.x-WRD.x,p.z-WRD.z)+p.r<W.arenaR-8),'4 pillars, all well inside the rim');
ok(pil.every((p,i)=>pil.every((q,j)=>i===j||Math.hypot(p.x-q.x,p.z-q.z)-p.r-q.r>8)),'pillars are >= 8 m apart (room to dodge between)');
ok(pil.every(p=>Math.hypot(p.x-WRD.x,p.z-WRD.z)-p.r>10),'no pillar blocks the centre spawn area');
// gate: widest free gap along the ring, found by probing a 0.45 m disc (fighter radius) around the ring
function blocked(x,z,r){return sol.some(s=>Math.hypot(x-s.x,z-s.z)<s.r+r)}
let free=0,run=0,best=0;for(let a=-.5;a<=.5;a+=.002){const x=WRD.x+Math.sin(a)*W.wallR,z=WRD.z+Math.cos(a)*W.wallR;if(!blocked(x,z,.45)){run+=.002*W.wallR;best=Math.max(best,run)}else run=0}
ok(best>=8&&best<=14,'gate opening is '+best.toFixed(1)+' m wide (8-14 m)');
let sealed=0;for(let a=0;a<360;a+=1){const t=a*Math.PI/180;if(Math.min(Math.abs(t),Math.abs(t-2*Math.PI))<.3)continue;const x=WRD.x+Math.sin(t)*W.wallR,z=WRD.z+Math.cos(t)*W.wallR;if(!blocked(x,z,.45))sealed++}
ok(sealed===0,'the rest of the wall is sealed (no gaps outside the gate)');
// walk from the landing to the centre using the game's push-out rule (index.html explore loop): radius c.r+.4
function walk(sx,sz,tx,tz){let x=sx,z=sz;for(let i=0;i<4000;i++){const dx=tx-x,dz=tz-z,d=Math.hypot(dx,dz);if(d<1)return{x,z,ok:true,i};x+=dx/d*.1;z+=dz/d*.1;for(const s of sol){const ax=x-s.x,az=z-s.z,dd=Math.hypot(ax,az),R=s.r+.4;if(dd<R&&dd>1e-4){x=s.x+ax/dd*R;z=s.z+az/dd*R}}}return{x,z,ok:false}}
const L=W.landing,r1=walk(WRD.x+L.x,WRD.z+L.z,WRD.x,WRD.z+W.wallR),r2=walk(r1.x,r1.z,WRD.x,WRD.z+22);
ok(r1.ok&&r2.ok,'a player can walk from the landing straight through the gate to the arena');
const out=walk(WRD.x+20,WRD.z-W.wallR-8,WRD.x,WRD.z);ok(!out.ok&&Math.hypot(out.x-WRD.x,out.z-WRD.z)>W.wallR,'from outside the north wall you cannot walk in');
let dry=true;for(let d=0;d<=L.z;d+=5)if(H(WRD.x,WRD.z+d)<.8)dry=false;ok(dry&&H(WRD.x+L.x,WRD.z+L.z)>.8,'the landing and the road to the gate are dry land (> 0.8 m)');
// reach / world bounds
ok(WRD.z-WRD.reach>-3300&&WRD.x+WRD.reach<3300,'whole island is inside the +-3300 m world limit');
// sword files are valid GLB with one mesh and sane size
for(const f of['sword_falchion','sword_claymore']){const b=fs.readFileSync(__dirname+'/../assets/warden/'+f+'.glb'),jl=b.readUInt32LE(12),j=JSON.parse(b.slice(20,20+jl).toString());
  ok(b.toString('ascii',0,4)==='glTF'&&j.meshes.length===1&&b.length<120000,f+'.glb valid ('+(b.length/1024).toFixed(0)+' KB, '+j.materials.length+' materials)')}
process.exit(bad?1:0);
