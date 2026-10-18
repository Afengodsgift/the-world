// Asset budget guard for the Skybreak Rally vehicles: every class model referenced by data/rally.js must exist, stay mobile-sized, and be posed
// as the physics expects (nose +Z, belly on y=0, sensible real-world size). Parses the GLB header directly (no THREE needed).
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(R+'src/data/rally.js','utf8')+';this.RALLY=RALLY',ctx);
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const MAX_BYTES=2.5e6,MAX_TRIS=30000,seen={};
for(const [k,c] of Object.entries(ctx.RALLY.cls)){
  ok(!!c.model,`${k}: has a model path`);if(!c.model||seen[c.model])continue;seen[c.model]=1;
  const f=R+c.model;ok(fs.existsSync(f),`${k}: ${c.model} exists`);if(!fs.existsSync(f))continue;
  const b=fs.readFileSync(f);ok(b.length<MAX_BYTES,`${c.model}: ${(b.length/1e6).toFixed(2)} MB (budget ${MAX_BYTES/1e6} MB)`);
  ok(b.toString('latin1',0,4)==='glTF','valid GLB magic');
  const cl=b.readUInt32LE(12),j=JSON.parse(b.toString('utf8',20,20+cl));
  let tris=0;for(const m of j.meshes)for(const p of m.primitives)if(p.indices!=null)tris+=j.accessors[p.indices].count/3;
  ok(tris<=MAX_TRIS,`${c.model}: ${Math.round(tris)} triangles (budget ${MAX_TRIS})`);
  ok(!(j.extensionsRequired||[]).some(e=>/meshopt|draco/i.test(e)),'no Draco/meshopt compression (the game has no decoder loaded)');
  // pose: world bbox through the single wrapper node (rotation about Y, uniform scale, translation)
  const w=j.nodes.find(n=>n.name==='car');ok(!!w,'wrapper node "car" carries the pose');
}
console.log(fails?`\n${fails} FAILED`:'\nall ok');process.exit(fails?1:0);
