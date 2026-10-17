// Packs a textured Mixamo character FBX (mixamorig* skeleton, T-pose, cm) into a phone-sized GLB + one JPG albedo per material:
//   node tools/pack_mixamo_char.mjs <in.fbx> <out.glb> [targetTris=9000] [texSize=512]   (textures are embedded in the GLB as JPG)
// - geometry is simplified with meshoptimizer (attribute-aware: uv + skin weights), then compacted
// - every mesh keeps its own skin; all skins share ONE bone tree (by name), so Mixamo clips bind by name ("mixamorigHips.quaternion") exactly like on a Mixamo download
// - units stay centimetres: the runtime wraps the model in a 0.01-scale group (same as the FBXLoader result)
// Needs three, meshoptimizer, sharp resolvable from THREE_NM (default /home/claude/tools_nm/node_modules).
import fs from 'fs';
const NM=process.env.THREE_NM||'/home/claude/tools_nm/node_modules';
const blobs=new Map();let bn=0;
globalThis.window={URL:{createObjectURL:b=>{const u='blob:'+(bn++);blobs.set(u,b);return u}}};
class Img{constructor(){this.style={};this.L={}}addEventListener(t,f){this.L[t]=f}removeEventListener(){}set src(v){this._s=v;setTimeout(()=>this.L.load&&this.L.load.call(this,{}),0)}get src(){return this._s}}
globalThis.document={createElementNS:()=>new Img(),createElement:()=>({style:{}})};globalThis.self=globalThis;
const THREE=await import(NM+'/three/build/three.module.js');
const {FBXLoader}=await import(NM+'/three/examples/jsm/loaders/FBXLoader.js');
const {MeshoptSimplifier}=await import(NM+'/meshoptimizer/meshopt_simplifier.js');
const sharp=(await import(NM+'/sharp/dist/index.mjs')).default;
await MeshoptSimplifier.ready;
const [,,inF,outBase,tris='9000',texS='512']=process.argv;
const buf=fs.readFileSync(inF);
const {parse61}=await import('./fbx61.mjs');   // FBX 6.1 (old Mixamo/Maya exports) is not readable by FBXLoader
const g=buf.readUInt32LE(23)===6100?parse61(buf,THREE):new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');
await new Promise(r=>setTimeout(r,50));
g.updateMatrixWorld(true);
// FBX meshes are unindexed (every triangle owns 3 vertices): merge identical vertices so simplification + file size work on real topology
function weld(geo){const A=geo.attributes,n=A.position.count,map=new Map(),rem=new Uint32Array(n),keep=[];const q=v=>Math.round(v*1000);
  for(let i=0;i<n;i++){const k=[q(A.position.getX(i)),q(A.position.getY(i)),q(A.position.getZ(i)),q(A.normal.getX(i)*100),q(A.normal.getY(i)*100),q(A.normal.getZ(i)*100),q(A.uv.getX(i)*1000),q(A.uv.getY(i)*1000),A.skinIndex.getX(i),A.skinIndex.getY(i),A.skinIndex.getZ(i),A.skinIndex.getW(i)].join(',');
    let j=map.get(k);if(j===undefined){j=keep.length;keep.push(i);map.set(k,j)}rem[i]=j}
  const nb=(a,sz,C)=>{const o=new C(keep.length*sz);keep.forEach((s,d)=>{for(let c=0;c<sz;c++)o[d*sz+c]=a.array[s*sz+c]});return new THREE.BufferAttribute(o,sz)};
  const idx=geo.index?Array.from(geo.index.array,v=>rem[v]):Array.from(rem);
  for(const k of ['position','normal','uv','skinIndex','skinWeight'])geo.setAttribute(k,nb(A[k],A[k].itemSize,Float32Array));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx),1))}
const skinned=[];g.traverse(o=>{if(o.isSkinnedMesh){const gg=o.geometry;if(!gg.index){const n=gg.attributes.position.count,a=new Uint32Array(n);for(let i=0;i<n;i++)a[i]=i;gg.setIndex(new THREE.BufferAttribute(a,1))}weld(gg);skinned.push(o)}});
// ---- unified bone tree, taken from the SCENE GRAPH (not skeleton.bones): Mixamo FBXs with several meshes carry cloned bones per skin (a Bone parented under the same-named Bone) whose local transforms are all zero.
// Real bones = Bones whose parent is not a same-named Bone. A root bone carries the whole ancestor chain (FBX armature groups) as its own world transform.
const nodes=[],byName=new Map(),rootBones=[];
const _p=new THREE.Vector3(),_q=new THREE.Quaternion(),_s=new THREE.Vector3();
function walk(o,parent){for(const c of o.children){
  if(c.isBone){if(c.name===o.name&&o.isBone)continue;                                    // clone, skip its subtree
    if(byName.has(c.name)){walk(c,parent);continue}
    const top=!parent;if(top)c.matrixWorld.decompose(_p,_q,_s);
    const n={name:c.name,t:top?_p.toArray():c.position.toArray(),r:top?_q.toArray():c.quaternion.toArray(),s:top?_s.toArray():c.scale.toArray(),children:[],i:nodes.length};
    nodes.push(n);byName.set(c.name,n);if(parent)parent.children.push(n.i);else rootBones.push(n.i);walk(c,n)}
  else walk(c,parent)}}
walk(g,null);
// ---- textures
const tex=new Map(),jpgs=[];
async function texOf(mat){const im=mat&&mat.map&&mat.map.image;if(!im||!im.src||!blobs.has(im.src))return -1;if(tex.has(im.src))return tex.get(im.src);
  const raw=Buffer.from(await blobs.get(im.src).arrayBuffer());
  const jpg=await sharp(raw).resize(+texS,+texS,{fit:'inside'}).flatten({background:'#888'}).jpeg({quality:78,mozjpeg:true}).toBuffer();
  jpgs.push(jpg);tex.set(im.src,jpgs.length-1);return jpgs.length-1}
// ---- binary packing helpers
const chunks=[];let blen=0;const views=[],accs=[];
function put(arr,target){const b=Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength);const pad=(4-blen%4)%4;if(pad){chunks.push(Buffer.alloc(pad));blen+=pad}views.push({buffer:0,byteOffset:blen,byteLength:b.length,...(target?{target}:{})});chunks.push(b);blen+=b.length;return views.length-1}
function acc(view,type,ct,count,extra){accs.push({bufferView:view,componentType:ct,count,type,...extra});return accs.length-1}
const mats=[],imgs=[],skins=[],meshes=[],meshNodes=[];let totalTris=0;
const budget=+tris;const allTris=skinned.reduce((s,m)=>s+m.geometry.index.count/3,0);
for(const m of skinned){
  const geo=m.geometry,pos=geo.attributes.position,nor=geo.attributes.normal,uv=geo.attributes.uv,si=geo.attributes.skinIndex,sw=geo.attributes.skinWeight;
  const share=(geo.index.count/3)/allTris,want=Math.max(600,Math.round(budget*share));
  const mlist=Array.isArray(m.material)?m.material:[m.material];
  const groups=geo.groups.length?geo.groups:[{start:0,count:geo.index.count,materialIndex:0}];
  const bm=m.bindMatrix.clone();                                                          // vertex space -> world at bind
  // joints of this skin, remapped onto the unified list by name
  const jointIdx=m.skeleton.bones.map(b=>byName.get(b.name).i);
  // IBM' = IBM * bindMatrix so the skinned mesh node can sit at identity
  const ibm=new Float32Array(16*jointIdx.length);m.skeleton.boneInverses.forEach((q,i)=>new THREE.Matrix4().multiplyMatrices(q,bm).toArray(ibm,i*16));
  const wp=new Float32Array(pos.count*3),wn=new Float32Array(pos.count*3),v=new THREE.Vector3(),nm3=new THREE.Matrix3().getNormalMatrix(bm);
  for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);wp.set([v.x,v.y,v.z],i*3);v.fromBufferAttribute(nor,i).applyMatrix3(nm3).normalize();wn.set([v.x,v.y,v.z],i*3)}
  // NB positions stay in mesh space; the bind matrix lives in ibm', so apply it to NOTHING else. (bm is only folded into ibm and normals.)
  const prims=[];
  const totG=groups.reduce((s,q)=>s+q.count/3,0);
  const byMat=new Map();for(const q of groups){const k=q.materialIndex||0;if(!byMat.has(k))byMat.set(k,[]);const a=byMat.get(k);for(let i=0;i<q.count;i++)a.push(geo.index.array[q.start+i])}
  for(const [mi,list] of byMat){const q={count:list.length,materialIndex:mi};
    let idx=Uint32Array.from(list);
    const attr=new Float32Array(pos.count*5);for(let i=0;i<pos.count;i++){attr[i*5]=uv.getX(i);attr[i*5+1]=uv.getY(i);for(let k=0;k<3;k++)attr[i*5+2+k]=sw.array[i*4+k]}
    const target=Math.max(300,Math.round(want*(q.count/3/totG)))*3;
    let out=idx;if(target<idx.length){[out]=MeshoptSimplifier.simplifyWithAttributes(idx,wp,3,attr,5,[1.4,1.4,.6,.6,.6],null,target,.05,['LockBorder'])}
    prims.push({idx:out,mat:q.materialIndex||0})}
  // compact: unique used vertices across prims
  const remap=new Int32Array(pos.count).fill(-1);let nv=0;const used=[];
  for(const p of prims)for(const i of p.idx)if(remap[i]<0){remap[i]=nv++;used.push(i)}
  const P=new Float32Array(nv*3),N=new Float32Array(nv*3),U=new Float32Array(nv*2),J=new Uint8Array(nv*4),W=new Float32Array(nv*4);
  used.forEach((s,d)=>{P.set(wp.subarray(s*3,s*3+3),d*3);N.set(wn.subarray(s*3,s*3+3),d*3);U[d*2]=uv.getX(s);U[d*2+1]=1-uv.getY(s);                // glTF uv origin is top-left
    let tot=0;for(let k=0;k<4;k++){J[d*4+k]=si.array[s*4+k];W[d*4+k]=sw.array[s*4+k];tot+=W[d*4+k]}if(tot>0)for(let k=0;k<4;k++)W[d*4+k]/=tot});
  // positions: apply bindMatrix^-1? No: we want  boneWorld*IBM'*v == boneWorld*IBM*bind*v, i.e. v stays the raw mesh-space vertex. (done)
  const pmin=[1e9,1e9,1e9],pmax=[-1e9,-1e9,-1e9];for(let i=0;i<nv;i++)for(let k=0;k<3;k++){pmin[k]=Math.min(pmin[k],P[i*3+k]);pmax[k]=Math.max(pmax[k],P[i*3+k])}
  const aP=acc(put(P,34962),'VEC3',5126,nv,{min:pmin,max:pmax}),aN=acc(put(N,34962),'VEC3',5126,nv),aU=acc(put(U,34962),'VEC2',5126,nv),aJ=acc(put(J,34962),'VEC4',5121,nv),aW=acc(put(W,34962),'VEC4',5126,nv);
  const primitives=[];
  for(const p of prims){const ind=new Uint32Array(p.idx.length);p.idx.forEach((s,i)=>ind[i]=remap[s]);totalTris+=ind.length/3;
    const ai=acc(put(ind,34963),'SCALAR',5125,ind.length);
    const mat=mlist[p.mat]||mlist[0];const ti=await texOf(mat);
    const mj={name:mat.name||'mat',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:ti>=0?[1,1,1,1]:[mat.color.r,mat.color.g,mat.color.b,1],metallicFactor:0,roughnessFactor:.85}};
    if(ti>=0)mj.pbrMetallicRoughness.baseColorTexture={index:ti};
    mats.push(mj);primitives.push({attributes:{POSITION:aP,NORMAL:aN,TEXCOORD_0:aU,JOINTS_0:aJ,WEIGHTS_0:aW},indices:ai,material:mats.length-1})}
  const ibmAcc=acc(put(ibm),'MAT4',5126,jointIdx.length);
  skins.push({name:m.name,joints:jointIdx,inverseBindMatrices:ibmAcc,skeleton:rootBones[0]});
  meshes.push({name:m.name,primitives});meshNodes.push({name:m.name,mesh:meshes.length-1,skin:skins.length-1})}
// texture images -> bufferViews
const textures=[],images=[];
for(const j of jpgs){const v=put(new Uint8Array(j));images.push({bufferView:v,mimeType:'image/jpeg'});textures.push({source:images.length-1,sampler:0})}
const gnodes=nodes.map(n=>({name:n.name,translation:n.t,rotation:n.r,scale:n.s,...(n.children.length?{children:n.children}:{})}));
const meshStart=gnodes.length;meshNodes.forEach(m=>gnodes.push(m));
const json={asset:{version:'2.0',generator:'the-world pack_mixamo_char'},scene:0,scenes:[{nodes:[...rootBones,...meshNodes.map((_,i)=>meshStart+i)]}],nodes:gnodes,meshes,skins,materials:mats,textures,images,samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],buffers:[{byteLength:0}],bufferViews:views,accessors:accs};
const bin=Buffer.concat(chunks);const pad4=(4-bin.length%4)%4;const binP=Buffer.concat([bin,Buffer.alloc(pad4)]);json.buffers[0].byteLength=binP.length;
let js=Buffer.from(JSON.stringify(json));const jp=(4-js.length%4)%4;js=Buffer.concat([js,Buffer.alloc(jp,32)]);
const head=Buffer.alloc(12);head.write('glTF',0);head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+js.length+8+binP.length,8);
const jh=Buffer.alloc(8);jh.writeUInt32LE(js.length,0);jh.write('JSON',4);const bh=Buffer.alloc(8);bh.writeUInt32LE(binP.length,0);bh.write('BIN\0',4);
fs.writeFileSync(outBase,Buffer.concat([head,jh,js,bh,binP]));
console.log(inF.split('/').pop(),'->',outBase,(12+8+js.length+8+binP.length)/1024|0,'KB','tris',allTris,'->',totalTris,'bones',nodes.length,'skins',skins.length,'mats',mats.length,'tex',jpgs.length);
