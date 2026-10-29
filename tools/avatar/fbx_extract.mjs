// Reads a Mixamo-style skinned character FBX (7.x via three's FBXLoader, 6.1 via tools/fbx61.mjs) into plain typed arrays - no DOM, no GLB library.
//   const raw = await extractFbx(path, {nm: '<dir holding node_modules/three>'})
//   raw = { name, units:'cm', pos:Float32Array(3n), nor, uv:Float32Array(2n), jnt:Uint16Array(4n), wgt:Float32Array(4n) (all NON-indexed: n verts = 3 per tri),
//           bones:[{name, parent, world:[x,y,z] (bind pose, FBX units), key (name with the mixamorig<digits>[:] prefix removed)}], tex:{map,normal,specular,emissive: {bytes:Buffer, mime}} , matName }
import fs from 'fs';import path from 'path';import {pathToFileURL} from 'url';
export async function extractFbx(file,{nm}){
  const blobs=new Map();let bn=0;
  globalThis.window=globalThis.window||{};globalThis.window.URL={createObjectURL:b=>{const u='blob:'+(bn++);blobs.set(u,b);return u}};
  class Img{constructor(){this.style={};this.L={}}addEventListener(t,f){this.L[t]=f}removeEventListener(){}set src(v){this._s=v;setTimeout(()=>this.L.load&&this.L.load.call(this,{}),0)}get src(){return this._s}}
  globalThis.document={createElementNS:()=>new Img(),createElement:()=>({style:{}})};globalThis.self=globalThis;
  const THREE=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);
  const {FBXLoader}=await import(pathToFileURL(path.join(nm,'three/examples/jsm/loaders/FBXLoader.js')).href);
  const {parse61}=await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname),'..','fbx61.mjs')).href);
  const buf=fs.readFileSync(file),v=buf.readUInt32LE(23);
  const origWarn=console.warn;console.warn=()=>{};
  const g=v===6100?parse61(buf,THREE):new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');
  await new Promise(r=>setTimeout(r,80));console.warn=origWarn;
  g.updateMatrixWorld(true);
  const meshes=[];g.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)});
  if(meshes.length!==1)throw new Error('expected exactly 1 skinned mesh, got '+meshes.length);
  const m=meshes[0],geo=m.geometry,A=geo.attributes,sk=m.skeleton;
  const strip=n=>n.replace(/^mixamorig\d*:?/,'');
  // bind pose: world position of each bone at bind = inverse(boneInverse) taken through the mesh's bind matrix
  const bones=sk.bones.map((b,i)=>{const w=new THREE.Matrix4().copy(sk.boneInverses[i]).invert().premultiply(m.bindMatrix);return {name:b.name,key:strip(b.name),parent:b.parent&&b.parent.isBone?sk.bones.indexOf(b.parent):-1,world:new THREE.Vector3().setFromMatrixPosition(w).toArray()}});
  const bindM=m.bindMatrix.clone();const n=A.position.count;
  const pos=new Float32Array(n*3),nor=new Float32Array(n*3);const p=new THREE.Vector3(),nn=new THREE.Vector3(),nm3=new THREE.Matrix3().getNormalMatrix(bindM);
  for(let i=0;i<n;i++){p.fromBufferAttribute(A.position,i).applyMatrix4(bindM);pos.set([p.x,p.y,p.z],i*3);nn.fromBufferAttribute(A.normal,i).applyMatrix3(nm3).normalize();nor.set([nn.x,nn.y,nn.z],i*3)}
  const mat=[].concat(m.material)[0],tex={};
  const grab=(slot,key)=>{const t=mat[slot];if(!t||!t.image)return;const b=blobs.get(t.image._s||t.image.src);if(!b)return;tex[key]=b};
  grab('map','map');grab('normalMap','normal');grab('specularMap','specular');grab('emissiveMap','emissive');
  for(const k of Object.keys(tex)){const ab=Buffer.from(await tex[k].arrayBuffer());tex[k]={bytes:ab,mime:ab.slice(0,2).toString('hex')==='ffd8'?'image/jpeg':'image/png'}}
  return {name:path.basename(file).replace(/\..*/,''),units:'cm',pos,nor,uv:Float32Array.from(A.uv.array),jnt:Uint16Array.from(A.skinIndex.array),wgt:Float32Array.from(A.skinWeight.array),bones,tex,matName:mat.name,hasBindIdentity:bindM.equals(new THREE.Matrix4())};
}
