// Converts the "Lowpoly Pirates" kit (Imphenzia, CC BY 4.0) from OBJ to one small GLB per object in assets/pirates/ (palette texture embedded, nearest filtered).
// Each object is re-centred: x/z at the middle of its bounding box, y=0 at its lowest point (ships: keel). Prints sizes. Usage: node tools/convert_pirates.mjs <dir with obj/ and dae/palette.png>
import fs from 'fs';import path from 'path';
const SRC=process.argv[2],OUT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..','assets','pirates');fs.mkdirSync(OUT,{recursive:true});
const PAL=fs.readFileSync(path.join(SRC,'dae','palette.png'));
function parse(file){const L=fs.readFileSync(file,'utf8').split('\n'),V=[],T=[],N=[],objs=[];let cur=null;
  for(const l of L){const p=l.split(' ');
    if(p[0]==='v')V.push([+p[1],+p[2],+p[3]]);else if(p[0]==='vt')T.push([+p[1],+p[2]]);else if(p[0]==='vn')N.push([+p[1],+p[2],+p[3]]);
    else if(p[0]==='o'){cur={name:p[1].trim(),f:[]};objs.push(cur)}
    else if(p[0]==='f'&&cur){const f=p.slice(1).filter(Boolean).map(s=>s.split('/').map(x=>x===''?-1:+x-1));for(let i=1;i+1<f.length;i++)cur.f.push([f[0],f[i],f[i+1]])}}
  return {V,T,N,objs}}
function glb(o,V,T,N){
  const map=new Map(),pos=[],nor=[],uv=[],idx=[];let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const tri of o.f)for(const c of tri){const k=c.join('/');let i=map.get(k);if(i===undefined){i=pos.length/3;map.set(k,i);const v=V[c[0]],n=c[2]>=0?N[c[2]]:[0,1,0],t=c[1]>=0?T[c[1]]:[0,0];pos.push(...v);nor.push(...n);uv.push(t[0],1-t[1]);for(let a=0;a<3;a++){mn[a]=Math.min(mn[a],v[a]);mx[a]=Math.max(mx[a],v[a])}}idx.push(i)}
  const cx=(mn[0]+mx[0])/2,cz=(mn[2]+mx[2])/2,cy=mn[1];for(let i=0;i<pos.length;i+=3){pos[i]-=cx;pos[i+1]-=cy;pos[i+2]-=cz}
  const size=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]];
  const P=Buffer.from(new Float32Array(pos).buffer),Nn=Buffer.from(new Float32Array(nor).buffer),U=Buffer.from(new Float32Array(uv).buffer),I=Buffer.from(new Uint32Array(idx).buffer);
  const pad=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);const parts=[P,Nn,U,I,PAL].map(pad);let off=0;const bv=parts.map((b,i)=>{const r={buffer:0,byteOffset:off,byteLength:[P,Nn,U,I,PAL][i].length};off+=b.length;return r});
  const j={asset:{version:'2.0',generator:'the-world convert_pirates'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:o.name}],
    meshes:[{name:o.name,primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}]}],
    materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.9}}],textures:[{sampler:0,source:0}],samplers:[{magFilter:9728,minFilter:9728,wrapS:33071,wrapT:33071}],images:[{bufferView:4,mimeType:'image/png'}],
    buffers:[{byteLength:off}],bufferViews:[Object.assign(bv[0],{target:34962}),Object.assign(bv[1],{target:34962}),Object.assign(bv[2],{target:34962}),Object.assign(bv[3],{target:34963}),bv[4]],
    accessors:[{bufferView:0,componentType:5126,count:pos.length/3,type:'VEC3',min:[mn[0]-cx,0,mn[2]-cz],max:[mx[0]-cx,size[1],mx[2]-cz]},{bufferView:1,componentType:5126,count:nor.length/3,type:'VEC3'},{bufferView:2,componentType:5126,count:uv.length/2,type:'VEC2'},{bufferView:3,componentType:5125,count:idx.length,type:'SCALAR'}]};
  let js=Buffer.from(JSON.stringify(j));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,32)]);const bin=Buffer.concat(parts),h=Buffer.alloc(12);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+js.length+8+bin.length,8);
  const a=Buffer.alloc(8);a.writeUInt32LE(js.length);a.write('JSON',4);const b=Buffer.alloc(8);b.writeUInt32LE(bin.length);b.write('BIN\0',4);
  return {buf:Buffer.concat([h,a,js,b,bin]),size,center:[cx,cy,cz],tris:idx.length/3}}
// the wheels sit next to their ship in the kit's layout (same x): merge each wheel into the nearest ship so every ship is ONE object
function mergeWheels(V,objs){const cx=o=>{let s=0,n=0;for(const t of o.f)for(const c of t){s+=V[c[0]][0];n++}return s/n};
  const ships=objs.filter(o=>/^ship(_\d+|\.\d+)?$/.test(o.name)),wheels=objs.filter(o=>/wheel/.test(o.name));
  for(const w of wheels){let b=null,bd=1e9;for(const s of ships){const d=Math.abs(cx(s)-cx(w));if(d<bd){bd=d;b=s}}b.f.push(...w.f)}
  return objs.filter(o=>!/wheel/.test(o.name))}
for(const f of ['boats','weapons','generic','environment']){let {V,T,N,objs}=parse(path.join(SRC,'obj',f+'.obj'));if(f==='boats')objs=mergeWheels(V,objs);
  for(const o of objs){const r=glb(o,V,T,N),name=o.name.replace(/\./g,'_');fs.writeFileSync(path.join(OUT,name+'.glb'),r.buf);console.log(f.padEnd(11),name.padEnd(18),'size',r.size.map(v=>v.toFixed(1)).join(' x ').padEnd(22),'tris',r.tris,'at',r.center.map(v=>v.toFixed(0)).join(','),Math.round(r.buf.length/1024)+'KB')}}
