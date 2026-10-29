// Warden dressing: deterministic, on land, clear of wall + gate road, every piece exists in props.glb, triangle budget for a low-end phone.
const fs=require('fs'),vm=require('vm'),G=require('./golden/golden_lib.js');
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const c=G.makeH(true),W=vm.runInContext('WARDEN',c),WRD=c.W,H=c.H,L=vm.runInContext('WardenProps()',c),L2=vm.runInContext('WardenProps()',c);
ok(L.length>150&&L.length<400,'placed '+L.length+' pieces');
ok(JSON.stringify(L)===JSON.stringify(L2),'placement is deterministic');
const loc=L.map(o=>({...o,wx:o.x-WRD.x,wz:o.z-WRD.z}));
ok(loc.every(o=>Math.hypot(o.wx,o.wz)>W.wallR+4),'nothing inside or touching the arena wall');
ok(loc.every(o=>Math.abs(o.y-H(o.x,o.z))<3.1),'every piece sits on the ground (within sink)');
ok(loc.filter(o=>!o.p.startsWith('Mountain')).every(o=>H(o.x,o.z)>.4),'no props in the water');
ok(loc.every(o=>!(o.wz>0&&Math.abs(o.wx)<9&&Math.hypot(o.wx,o.wz)<150&&!/Pillar/.test(o.p))),'road from the landing to the gate is clear of trees and rocks');
const b=fs.readFileSync('assets/warden/props.glb'),jl=b.readUInt32LE(12),j=JSON.parse(b.slice(20,20+jl));const tri={};j.meshes.forEach(m=>tri[m.name]=j.accessors[m.primitives[0].attributes.POSITION].count/3);
ok(L.every(o=>tri[o.p]),'every placed piece exists in props.glb');
const total=L.reduce((a,o)=>a+tri[o.p],0);ok(total<20000,'total prop triangles '+total+' (< 20k budget; was 18k before the Oath Chamber arena)');
ok(b.length<300*1024,'props.glb is '+(b.length/1024|0)+' KB (< 300 KB)');
process.exit(bad?1:0);
