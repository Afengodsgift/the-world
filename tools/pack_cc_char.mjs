// Packs a Character-Creator-rigged glTF (CC_Base_* skeleton, 100k+ tris, 4K textures) into a phone-sized Mixamo-skeleton GLB:
//   node tools/pack_cc_char.mjs <in.glb> <out.glb> [targetTris=9000] [texSize=512] [hipsCm=100] [skipNodes=katana]
// - every CC joint is collapsed onto the Mixamo bone it belongs to (twist / share / facial / toe bones merge into their parent role), skin weights are merged, so Mixamo clips bind by name ("mixamorigHips.quaternion")
//   and tools/rebase_mx.mjs can retarget any baked clip set onto it. The bone tree is rebuilt in the Mixamo hierarchy (Hips > Spine.. / UpLeg..) from the CC world rest pose.
// - geometry is simplified with meshoptimizer (uv + weights aware), albedo (+ emissive added into it) is resized to JPG/PNG, normal / metal / rough maps are dropped, units become centimetres (hips at hipsCm)
// - non-skinned meshes (a loose katana, props) are dropped: the game attaches weapons to the hand bone itself
// Needs three, meshoptimizer, sharp resolvable from THREE_NM (default /home/claude/tools_nm/node_modules).
import fs from 'fs';
const NM=process.env.THREE_NM||'/home/claude/tools_nm/node_modules';
const T=await import(NM+'/three/build/three.module.js');
const {MeshoptSimplifier}=await import(NM+'/meshoptimizer/meshopt_simplifier.js');await MeshoptSimplifier.ready;
const sharp=(await import(NM+'/sharp/dist/index.mjs')).default;
const [,,IN,OUT,tris='9000',texS='512',hipsCm='100']=process.argv;
const buf=fs.readFileSync(IN),jl=buf.readUInt32LE(12),J=JSON.parse(buf.slice(20,20+jl).toString()),binOff=20+jl+8,BIN=buf.slice(binOff);
const CT={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function read(i){const a=J.accessors[i],v=J.bufferViews[a.bufferView],C=CT[a.componentType],n=NC[a.type],es=C.BYTES_PER_ELEMENT*n,st=v.byteStride||es,out=new Float32Array(a.count*n);
  const dv=new DataView(BIN.buffer,BIN.byteOffset+(v.byteOffset||0)+(a.byteOffset||0)),get=a.componentType===5126?(o)=>dv.getFloat32(o,true):a.componentType===5125?(o)=>dv.getUint32(o,true):a.componentType===5123?(o)=>dv.getUint16(o,true):a.componentType===5121?(o)=>dv.getUint8(o):a.componentType===5122?(o)=>dv.getInt16(o,true):(o)=>dv.getInt8(o);
  const cs=C.BYTES_PER_ELEMENT,norm=a.normalized?(a.componentType===5121?255:a.componentType===5123?65535:a.componentType===5120?127:32767):1;
  for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)out[k*n+c]=get(k*st+c*cs)/norm;return out}
const skin=J.skins[0],jn=skin.joints.map(i=>J.nodes[i].name),clean=n=>n.replace(/_\d+$/,'');
// ---- world rest of every CC joint = inverse of its inverse-bind matrix (both in the skinned meshes' space)
// (CC exports leave the inverse-bind matrix of some un-weighted joints singular, so the world pose comes from the node tree; it is checked against the IBMs that are valid)
const ibm=read(skin.inverseBindMatrices),parentOf={};J.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parentOf[c]=i));
const nodeW=new Map();function nodeWorld(i){if(nodeW.has(i))return nodeW.get(i);const n=J.nodes[i],m=new T.Matrix4();
  if(n.matrix)m.fromArray(n.matrix);else m.compose(new T.Vector3(...(n.translation||[0,0,0])),new T.Quaternion(...(n.rotation||[0,0,0,1])),new T.Vector3(...(n.scale||[1,1,1])));
  const w=parentOf[i]!==undefined?nodeWorld(parentOf[i]).clone().multiply(m):m;nodeW.set(i,w);return w}
// World pose of every joint in the skinned meshes' space = inverse of its inverse-bind matrix. A few joints that carry no weights (CC's Upperarm / Forearm: the arms are skinned to the twist bones) have a zeroed matrix:
// those are rebuilt from their parent's pose and their own local node transform.
const isZero=i=>{let s=0;for(let k=0;k<16;k++)s+=Math.abs(ibm[i*16+k]);return s<1e-6||!(Math.abs(new T.Matrix4().fromArray(ibm,i*16).determinant())>.5)||(Math.abs(ibm[i*16+12])+Math.abs(ibm[i*16+13])+Math.abs(ibm[i*16+14])<1e-4)};
const jIdx=new Map(skin.joints.map((n,i)=>[n,i])),Wsrc=new Array(jn.length);
function worldOf(i){if(Wsrc[i])return Wsrc[i];
  if(!isZero(i)||jIdx.get(parentOf[skin.joints[i]])===undefined)return Wsrc[i]=new T.Matrix4().fromArray(ibm,i*16).invert();
  const n=J.nodes[skin.joints[i]],loc=new T.Matrix4();if(n.matrix)loc.fromArray(n.matrix);else loc.compose(new T.Vector3(...(n.translation||[0,0,0])),new T.Quaternion(...(n.rotation||[0,0,0,1])),new T.Vector3(...(n.scale||[1,1,1])));
  const pj=jIdx.get(parentOf[skin.joints[i]]);if(pj===undefined)throw new Error('zero inverse-bind matrix on a root joint: '+jn[i]);
  // the node-tree translation is in the armature's units (metres for a cm skin): bring it to the mesh space by the ratio seen on the parent -> child pair of valid joints
  return Wsrc[i]=worldOf(pj).clone().multiply(loc.setPosition(loc.elements[12]*UNIT,loc.elements[13]*UNIT,loc.elements[14]*UNIT))}
let UNIT=1;{const h=jIdx.get(skin.joints.find(j=>/CC_Base_Hip/.test(J.nodes[j].name))),sp=jn.findIndex(n=>/CC_Base_Spine02/.test(n));   // hip -> spine02 distance: skin space vs node-local sum
  const a=new T.Vector3().setFromMatrixPosition(new T.Matrix4().fromArray(ibm,h*16).invert()),b=new T.Vector3().setFromMatrixPosition(new T.Matrix4().fromArray(ibm,sp*16).invert());
  let chain=0;for(let j=skin.joints[sp];j!==skin.joints[h]&&j!==undefined;j=parentOf[j]){const t=J.nodes[j].translation||[0,0,0];chain+=Math.hypot(t[0],t[1],t[2])}
  UNIT=a.distanceTo(b)/chain;console.log('armature unit ratio (mesh space per node-local unit):',UNIT.toFixed(3))}
for(let i=0;i<jn.length;i++)worldOf(i);
// ---- CC joint -> Mixamo bone name
function mapName(n){const c=clean(n);let m;
  if(/^(RL_BoneRoot|_rootJoint)/.test(c)||/^CC_Base_(Hip|Pelvis)/.test(c))return'Hips';
  if(/^CC_Base_Waist/.test(c))return'Spine';if(/^CC_Base_Spine01/.test(c))return'Spine1';if(/^CC_Base_(Spine02|RibsTwist|.*Breast)/.test(c)||/_(L|R)_(RibsTwist|Breast)/.test(c))return'Spine2';
  if(/^CC_Base_NeckTwist/.test(c))return'Neck';if(/^CC_Base_(Head|FacialBone|JawRoot|Tongue|Teeth|UpperJaw)/.test(c)||/_(L|R)_Eye/.test(c))return'Head';
  const sd=/_L_/.test(c)?'Left':/_R_/.test(c)?'Right':null;if(!sd)return null;
  if(/_Clavicle/.test(c))return sd+'Shoulder';if(/_Upperarm/.test(c))return sd+'Arm';if(/_(Forearm|ElbowShare)/.test(c))return sd+'ForeArm';if(/_Hand$/.test(c))return sd+'Hand';
  if(m=c.match(/_(Index|Mid|Ring|Pinky|Thumb)(\d)/)&&!/Toe/.test(c)){const f=c.match(/_(Index|Mid|Ring|Pinky|Thumb)(\d)/);return sd+'Hand'+(f[1]==='Mid'?'Middle':f[1])+f[2]}
  if(/_(Thigh)/.test(c))return sd+'UpLeg';if(/_(Calf|KneeShare)/.test(c))return sd+'Leg';if(/_Foot$/.test(c))return sd+'Foot';if(/Toe/.test(c))return sd+'ToeBase';return null}
const jmap=jn.map(n=>mapName(n));
const pidx=jn.map((_,i)=>{let p=parentOf[skin.joints[i]];while(p!==undefined&&!skin.joints.includes(p))p=parentOf[p];return p===undefined?-1:skin.joints.indexOf(p)});
for(let i=0;i<jn.length;i++){let k=i;while(jmap[k]===null&&pidx[k]>=0)k=pidx[k];if(jmap[i]===null)jmap[i]=jmap[k]||'Hips'}
// ---- the Mixamo tree and which CC joint supplies each bone's rest pose
const TREE=[['Hips',null,'Hip'],['Spine','Hips','Waist'],['Spine1','Spine','Spine01'],['Spine2','Spine1','Spine02'],['Neck','Spine2','NeckTwist01'],['Head','Neck','Head']];
for(const [S,c] of [['Left','L'],['Right','R']]){
  TREE.push([S+'Shoulder','Spine2',c+'_Clavicle'],[S+'Arm',S+'Shoulder',c+'_Upperarm'],[S+'ForeArm',S+'Arm',c+'_Forearm'],[S+'Hand',S+'ForeArm',c+'_Hand']);
  for(const [f,cf] of [['Index','Index'],['Middle','Mid'],['Ring','Ring'],['Pinky','Pinky'],['Thumb','Thumb']])for(let k=1;k<=3;k++)TREE.push([S+'Hand'+f+k,k===1?S+'Hand':S+'Hand'+f+(k-1),c+'_'+cf+k]);
  TREE.push([S+'UpLeg','Hips',c+'_Thigh'],[S+'Leg',S+'UpLeg',c+'_Calf'],[S+'Foot',S+'Leg',c+'_Foot'],[S+'ToeBase',S+'Foot',c+'_ToeBase'])}
const srcOf=n=>{const want='CC_Base_'+n;return jn.findIndex(x=>clean(x)===want)};
const bones=[];for(const [name,par,cc] of TREE){const si=srcOf(cc);if(si<0){console.log('missing source joint for',name,cc);continue}bones.push({name:'mixamorig'+name,m:name,par,si,i:bones.length})}
const byM=new Map(bones.map(b=>[b.m,b]));
// ---- facing + scale: face +Z (Mixamo), hips at hipsCm
const hipsW=Wsrc[byM.get('Hips').si],hp=new T.Vector3().setFromMatrixPosition(hipsW),toe=new T.Vector3().setFromMatrixPosition(Wsrc[byM.get('LeftToeBase').si]),foot=new T.Vector3().setFromMatrixPosition(Wsrc[byM.get('LeftFoot').si]);
const flip=toe.z-foot.z<0,R=new T.Matrix4().makeRotationY(flip?Math.PI:0),sc=+hipsCm/hp.y;
console.log('hips y',hp.y.toFixed(3),'scale to cm',sc.toFixed(3),flip?'(model faced -Z: turned around)':'(faces +Z)');
const Wout=bones.map(b=>{const m=Wsrc[b.si].clone();m.premultiply(R);m.elements[12]*=sc;m.elements[13]*=sc;m.elements[14]*=sc;
  const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();m.decompose(p,q,s);return new T.Matrix4().compose(p,q,new T.Vector3(1,1,1))});   // unit scale: bone frames stay rigid
const nodes=bones.map((b,i)=>{const par=b.par?byM.get(b.par):null,loc=par?Wout[par.i].clone().invert().multiply(Wout[i]):Wout[i],p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();loc.decompose(p,q,s);
  return{name:b.name,translation:p.toArray().map(v=>+v.toFixed(5)),rotation:q.toArray().map(v=>+v.toFixed(6)),children:[]}});
bones.forEach((b,i)=>{if(b.par)nodes[byM.get(b.par).i].children.push(i)});
const toOut=jmap.map(m=>byM.has(m)?byM.get(m).i:0);   // CC joint index -> output bone index
// ---- meshes
const chunks=[];let blen=0;const views=[],accs=[];
function put(arr,target){const b=Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength),pad=(4-blen%4)%4;if(pad){chunks.push(Buffer.alloc(pad));blen+=pad}views.push({buffer:0,byteOffset:blen,byteLength:b.length,...(target?{target}:{})});chunks.push(b);blen+=b.length;return views.length-1}
const acc=(view,type,ct,count,extra)=>{accs.push({bufferView:view,componentType:ct,count,type,...extra});return accs.length-1};
const meshNodes=J.nodes.map((n,i)=>({n,i})).filter(x=>x.n.mesh!==undefined&&x.n.skin!==undefined);
const allTris=meshNodes.reduce((s,x)=>s+J.meshes[x.n.mesh].primitives.reduce((t,p)=>t+J.accessors[p.indices].count/3,0),0);
const jpgs=[],mats=[],meshes=[],gnodesMesh=[];let total=0;const texCache=new Map();
async function imgBuf(ti){const im=J.images[J.textures[ti].source],v=J.bufferViews[im.bufferView];return Buffer.from(BIN.buffer,BIN.byteOffset+(v.byteOffset||0),v.byteLength)}
async function albedo(mat){const key=J.materials.indexOf(mat);if(texCache.has(key))return texCache.get(key);
  const bc=mat.pbrMetallicRoughness.baseColorTexture;if(!bc){texCache.set(key,null);return null}
  let img=sharp(await imgBuf(bc.index)).resize(+texS,+texS,{fit:'inside'});const meta=await sharp(await imgBuf(bc.index)).metadata();
  let base=await img.clone().ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let hasAlpha=false;if(meta.hasAlpha){for(let i=3;i<base.data.length;i+=4)if(base.data[i]<250){hasAlpha=true;break}}
  if(mat.emissiveTexture){const e=await sharp(await imgBuf(mat.emissiveTexture.index)).resize(base.info.width,base.info.height,{fit:'fill'}).removeAlpha().raw().toBuffer();   // the glow is painted INTO the albedo (the game flashes materials through their emissive colour, which would blank an emissive map)
    for(let i=0,k=0;i<base.data.length;i+=4,k+=3)for(let c=0;c<3;c++)base.data[i+c]=Math.min(255,base.data[i+c]+e[k+c]*.9)}
  const out=sharp(base.data,{raw:{width:base.info.width,height:base.info.height,channels:4}});
  const b=hasAlpha?await out.png({compressionLevel:9,palette:true,quality:70}).toBuffer():await out.flatten({background:'#888'}).jpeg({quality:78,mozjpeg:true}).toBuffer();
  jpgs.push({b,png:hasAlpha});const r={i:jpgs.length-1,alpha:hasAlpha};texCache.set(key,r);return r}
for(const {n,i} of meshNodes){const M=J.meshes[n.mesh];
  for(const p of M.primitives){
    const pos=read(p.attributes.POSITION),nor=read(p.attributes.NORMAL),uv=read(p.attributes.TEXCOORD_0),jt=read(p.attributes.JOINTS_0),wt=read(p.attributes.WEIGHTS_0),idx=Uint32Array.from(read(p.indices)),nv=pos.length/3;
    const P=new Float32Array(nv*3),N=new Float32Array(nv*3),JJ=new Uint8Array(nv*4),WW=new Float32Array(nv*4),v=new T.Vector3(),nm=new T.Matrix3().setFromMatrix4(R);
    for(let k=0;k<nv;k++){v.set(pos[k*3],pos[k*3+1],pos[k*3+2]).applyMatrix4(R).multiplyScalar(sc);P.set([v.x,v.y,v.z],k*3);v.set(nor[k*3],nor[k*3+1],nor[k*3+2]).applyMatrix3(nm).normalize();N.set([v.x,v.y,v.z],k*3);
      const acc4=new Map();for(let c=0;c<4;c++){const w=wt[k*4+c];if(w<=0)continue;const o=toOut[jt[k*4+c]];acc4.set(o,(acc4.get(o)||0)+w)}
      const top=[...acc4.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);let tot=0;for(const [,w] of top)tot+=w;if(!top.length)top.push([0,1]),tot=1;top.forEach(([o,w],c)=>{JJ[k*4+c]=o;WW[k*4+c]=w/tot})}
    const attr=new Float32Array(nv*5);for(let k=0;k<nv;k++){attr[k*5]=uv[k*2];attr[k*5+1]=uv[k*2+1];for(let c=0;c<3;c++)attr[k*5+2+c]=WW[k*4+c]}
    const want=Math.max(400,Math.round(+tris*(idx.length/3)/allTris))*3;let out=idx;
    if(want<idx.length)[out]=MeshoptSimplifier.simplifyWithAttributes(idx,P,3,attr,5,[1.4,1.4,.6,.6,.6],null,want,.05,['LockBorder']);
    const remap=new Int32Array(nv).fill(-1);let cnt=0;const used=[];for(const k of out)if(remap[k]<0){remap[k]=cnt++;used.push(k)}
    const P2=new Float32Array(cnt*3),N2=new Float32Array(cnt*3),U2=new Float32Array(cnt*2),J2=new Uint8Array(cnt*4),W2=new Float32Array(cnt*4);
    used.forEach((s,d)=>{P2.set(P.subarray(s*3,s*3+3),d*3);N2.set(N.subarray(s*3,s*3+3),d*3);U2[d*2]=uv[s*2];U2[d*2+1]=uv[s*2+1];J2.set(JJ.subarray(s*4,s*4+4),d*4);W2.set(WW.subarray(s*4,s*4+4),d*4)});
    const ind=new Uint32Array(out.length);out.forEach((s,k)=>ind[k]=remap[s]);total+=ind.length/3;
    const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let k=0;k<cnt;k++)for(let c=0;c<3;c++){mn[c]=Math.min(mn[c],P2[k*3+c]);mx[c]=Math.max(mx[c],P2[k*3+c])}
    const aP=acc(put(P2,34962),'VEC3',5126,cnt,{min:mn,max:mx}),aN=acc(put(N2,34962),'VEC3',5126,cnt),aU=acc(put(U2,34962),'VEC2',5126,cnt),aJ=acc(put(J2,34962),'VEC4',5121,cnt),aW=acc(put(W2,34962),'VEC4',5126,cnt),aI=acc(put(ind,34963),'SCALAR',5125,ind.length);
    const mat=J.materials[p.material],t=await albedo(mat),mj={name:mat.name,doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.85}};
    if(t){mj.pbrMetallicRoughness.baseColorTexture={index:t.i};if(t.alpha){mj.alphaMode='MASK';mj.alphaCutoff=.5}}
    mats.push(mj);meshes.push({name:n.name,primitives:[{attributes:{POSITION:aP,NORMAL:aN,TEXCOORD_0:aU,JOINTS_0:aJ,WEIGHTS_0:aW},indices:aI,material:mats.length-1}]});gnodesMesh.push({name:n.name,mesh:meshes.length-1,skin:0})}}
const ibmO=new Float32Array(bones.length*16);Wout.forEach((m,i)=>m.clone().invert().toArray(ibmO,i*16));
const ibmA=acc(put(ibmO),'MAT4',5126,bones.length);
const images=[],textures=[];for(const j of jpgs){const v=put(new Uint8Array(j.b));images.push({bufferView:v,mimeType:j.png?'image/png':'image/jpeg'});textures.push({source:images.length-1,sampler:0})}
const gnodes=nodes.slice();const ms=gnodes.length;gnodesMesh.forEach(m=>gnodes.push(m));
const json={asset:{version:'2.0',generator:'the-world pack_cc_char'},scene:0,scenes:[{nodes:[0,...gnodesMesh.map((_,i)=>ms+i)]}],nodes:gnodes.map(n=>n.children&&!n.children.length?(delete n.children,n):n),meshes,skins:[{name:'skin',joints:bones.map((_,i)=>i),inverseBindMatrices:ibmA,skeleton:0}],materials:mats,textures,images,samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],buffers:[{byteLength:0}],bufferViews:views,accessors:accs};
const bin=Buffer.concat(chunks),binP=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);json.buffers[0].byteLength=binP.length;
let js=Buffer.from(JSON.stringify(json));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,32)]);
const head=Buffer.alloc(12);head.write('glTF',0);head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+js.length+8+binP.length,8);const jh=Buffer.alloc(8);jh.writeUInt32LE(js.length,0);jh.write('JSON',4);const bh=Buffer.alloc(8);bh.writeUInt32LE(binP.length,0);bh.write('BIN\0',4);
fs.writeFileSync(OUT,Buffer.concat([head,jh,js,bh,binP]));
console.log(IN.split('/').pop(),'->',OUT,((12+8+js.length+8+binP.length)/1024|0)+' KB','tris',allTris,'->',total,'bones',bones.length,'of',jn.length,'meshes',meshes.length,'tex',jpgs.length);
