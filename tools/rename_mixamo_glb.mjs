// Cleans a Sketchfab-style Mixamo GLB for the game: bones 'mixamorig:Hips_01' -> 'mixamorigHips', drops the baked animation, keeps everything else byte-for-byte.
//   node tools/rename_mixamo_glb.mjs in.glb out.glb
import fs from 'fs';
const [,,inF,outF]=process.argv,d=fs.readFileSync(inF),jl=d.readUInt32LE(12),J=JSON.parse(d.slice(20,20+jl).toString()),bo=20+jl+(4-jl%4)%4;
let bl=d.readUInt32LE(bo),bin=d.slice(bo+8,bo+8+bl);let n=0;
for(const x of J.nodes){const m=/^mixamorig:?(\w+?)(?:_\d+)?$/.exec(x.name||'');if(m){x.name='mixamorig'+m[1];n++}}
const seen=new Set();for(const x of J.nodes)if(/^mixamorig/.test(x.name)){if(seen.has(x.name))throw new Error('dup bone '+x.name);seen.add(x.name)}
delete J.animations;
for(const x of J.nodes)if(x.matrix&&(x.name==='Sketchfab_model'||/\.fbx$/.test(x.name||''))){delete x.matrix;n++}   // Sketchfab FBX export: a Z-up->Y-up turn and a 0.01 (cm->m) scale above the rig cancel to a plain 0.01; the game wraps rigs in its own 0.01 group, so drop both
let js=Buffer.from(JSON.stringify(J));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);const bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const h=Buffer.alloc(12);h.write('glTF',0);h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+js.length+8+bp.length,8);const c1=Buffer.alloc(8);c1.writeUInt32LE(js.length,0);c1.write('JSON',4);const c2=Buffer.alloc(8);c2.writeUInt32LE(bp.length,0);c2.write('BIN\0',4);
fs.writeFileSync(outF,Buffer.concat([h,c1,js,c2,bp]));console.log('renamed',n,'bones ->',outF,fs.statSync(outF).size);
