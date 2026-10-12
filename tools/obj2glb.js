#!/usr/bin/env node
// Minimal OBJ(+MTL) -> GLB converter for small CC0 props (Quaternius Medieval Weapons). One primitive per material, flat colours from Kd.
// usage: node tools/obj2glb.js in.obj out.glb [metal=0.6] [rough=0.45]
const fs=require('fs'),path=require('path');
const [inp,out,metal='0.6',rough='0.45']=process.argv.slice(2);if(!inp||!out){console.error('usage: obj2glb in.obj out.glb');process.exit(1)}
const txt=fs.readFileSync(inp,'utf8').split('\n'),mtlName=(txt.find(l=>l.startsWith('mtllib '))||'').slice(7).trim();
const mats={};if(mtlName&&fs.existsSync(path.join(path.dirname(inp),mtlName))){let cur=null;for(const l of fs.readFileSync(path.join(path.dirname(inp),mtlName),'utf8').split('\n')){const p=l.trim().split(/\s+/);if(p[0]==='newmtl')cur=mats[p[1]]={kd:[.5,.5,.5]};else if(p[0]==='Kd'&&cur)cur.kd=p.slice(1,4).map(Number)}}
const V=[],N=[],prims={};let cur='default';
for(const l of txt){const p=l.trim().split(/\s+/);
  if(p[0]==='v')V.push(p.slice(1,4).map(Number));else if(p[0]==='vn')N.push(p.slice(1,4).map(Number));else if(p[0]==='usemtl')cur=p[1];
  else if(p[0]==='f'){const c=p.slice(1).map(s=>{const a=s.split('/');return[+a[0]-1,a[2]?+a[2]-1:-1]});const P=prims[cur]=prims[cur]||{pos:[],nor:[]};
    for(let i=1;i<c.length-1;i++)for(const k of[c[0],c[i],c[i+1]]){P.pos.push(...V[k[0]]);P.nor.push(...(k[1]>=0?N[k[1]]:[0,1,0]))}}}
const bufs=[],views=[],acc=[],meshPrims=[],materials=[];let off=0;
const push=(arr,target)=>{const b=Buffer.from(new Float32Array(arr).buffer);views.push({buffer:0,byteOffset:off,byteLength:b.length,target});bufs.push(b);off+=b.length;return views.length-1};
let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
for(const name of Object.keys(prims)){const P=prims[name];const n=P.pos.length/3;let lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];for(let i=0;i<n;i++)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],P.pos[i*3+k]);hi[k]=Math.max(hi[k],P.pos[i*3+k])}
  for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],lo[k]);mx[k]=Math.max(mx[k],hi[k])}
  const vp=push(P.pos,34962),vn=push(P.nor,34962);acc.push({bufferView:vp,componentType:5126,count:n,type:'VEC3',min:lo,max:hi});acc.push({bufferView:vn,componentType:5126,count:n,type:'VEC3'});
  const kd=(mats[name]||{kd:[.5,.5,.5]}).kd;materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...kd,1],metallicFactor:+metal,roughnessFactor:+rough}});
  meshPrims.push({attributes:{POSITION:acc.length-2,NORMAL:acc.length-1},material:materials.length-1,mode:4})}
const bin=Buffer.concat(bufs);const gltf={asset:{version:'2.0',generator:'tools/obj2glb.js'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:path.basename(out,'.glb')}],meshes:[{primitives:meshPrims}],materials,accessors:acc,bufferViews:views,buffers:[{byteLength:bin.length}]};
let js=Buffer.from(JSON.stringify(gltf));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);const bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const h=Buffer.alloc(12);h.write('glTF',0);h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+js.length+8+bp.length,8);const c1=Buffer.alloc(8);c1.writeUInt32LE(js.length,0);c1.write('JSON',4);const c2=Buffer.alloc(8);c2.writeUInt32LE(bp.length,0);c2.write('BIN\0',4);
fs.writeFileSync(out,Buffer.concat([h,c1,js,c2,bp,]));console.log(path.basename(out),'prims',Object.keys(prims).join(','),'size',mx.map((v,i)=>(v-mn[i]).toFixed(3)).join(' x '),'min',mn.map(v=>v.toFixed(2)),'max',mx.map(v=>v.toFixed(2)),fs.statSync(out).size,'bytes');
