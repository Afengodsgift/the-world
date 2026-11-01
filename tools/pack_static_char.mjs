// Rigs a STATIC (un-skinned) knight model with the Mixamo skeleton so every baked Mixamo clip set (tools/rebase_mx.mjs) can drive it.
//   node tools/pack_static_char.mjs <in.glb> <out.glb> <rig.json> [targetTris=9000] [texSize=768] [dbg.json]
// rig.json = {joints:{Name:[x,y,z]}, ends:{HandEnd..}, sword:{mat, grip, ...}}: joint positions are measured in the model's own (posed) space, in cm.
// - the skeleton is built twice: BIND pose (the joints where the model really stands: arms hanging, left leg forward) and REST pose (a T-pose with identity bone rotations, the convention the clips are retargeted against)
//   inverse-bind matrices come from the bind pose, node transforms from the rest pose, so the mesh is un-posed into the T-pose by ordinary skinning and the clips then move it from there
// - skin weights: distance to each bone's capsule (radius per bone), restricted per armour part (gloves never follow the dress, the boots only the leg ...), top 4 kept
// - the sword is rigid on the right hand and re-oriented so the blade points the way the clips expect (forward, square to the arm, like the Artorias / Gwyn rigs)
// - meshes are merged per material, simplified with meshoptimizer, albedo-only textures are resized (phone budget)
import fs from 'fs';
const NM=process.env.THREE_NM||'/home/claude/tools_nm/node_modules';
const T=await import(NM+'/three/build/three.module.js');
const {MeshoptSimplifier}=await import(NM+'/meshoptimizer/meshopt_simplifier.js');await MeshoptSimplifier.ready;
const sharp=(await import(NM+'/sharp/dist/index.mjs')).default;
const [,,IN,OUT,RIG,tris='9000',texS='768',DBG]=process.argv;
const rig=JSON.parse(fs.readFileSync(RIG,'utf8'));
const buf=fs.readFileSync(IN),jl=buf.readUInt32LE(12),J=JSON.parse(buf.slice(20,20+jl).toString()),BIN=buf.slice(20+jl+8);
const CT={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read(i){const a=J.accessors[i],v=J.bufferViews[a.bufferView],C=CT[a.componentType],n=NC[a.type],es=C.BYTES_PER_ELEMENT*n,st=v.byteStride||es,out=new Float32Array(a.count*n);
  const dv=new DataView(BIN.buffer,BIN.byteOffset+(v.byteOffset||0)+(a.byteOffset||0)),cs=C.BYTES_PER_ELEMENT,norm=a.normalized?(a.componentType===5121?255:a.componentType===5123?65535:a.componentType===5120?127:32767):1;
  const get=a.componentType===5126?o=>dv.getFloat32(o,true):a.componentType===5125?o=>dv.getUint32(o,true):a.componentType===5123?o=>dv.getUint16(o,true):a.componentType===5121?o=>dv.getUint8(o):a.componentType===5122?o=>dv.getInt16(o,true):o=>dv.getInt8(o);
  for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)out[k*n+c]=get(k*st+c*cs)/norm;return out}
const parentOf={};J.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parentOf[c]=i));
const WM=new Map();function world(i){if(WM.has(i))return WM.get(i);const n=J.nodes[i],m=new T.Matrix4();if(n.matrix)m.fromArray(n.matrix);else m.compose(new T.Vector3(...(n.translation||[0,0,0])),new T.Quaternion(...(n.rotation||[0,0,0,1])),new T.Vector3(...(n.scale||[1,1,1])));
  const w=parentOf[i]!==undefined?world(parentOf[i]).clone().multiply(m):m;WM.set(i,w);return w}
// ---------------------------------------------------------------- skeleton
const V=a=>new T.Vector3(...a);
const BONES=[   // [name, parent, endKey (joint / end point whose direction defines the bone), rest direction (T-pose), capsule radius (cm)]
  ['Hips',null,'Spine',[0,1,0],15],['Spine','Hips','Spine1',[0,1,0],15],['Spine1','Spine','Spine2',[0,1,0],17],['Spine2','Spine1','Neck',[0,1,0],19],['Neck','Spine2','Head',[0,1,0],7],['Head','Neck','HeadTop',[0,1,0],12],
  ['LeftShoulder','Spine2','LeftArm',[1,0,0],8],['LeftArm','LeftShoulder','LeftForeArm',[1,0,0],8],['LeftForeArm','LeftArm','LeftHand',[1,0,0],7],['LeftHand','LeftForeArm','LeftHandEnd',[1,0,0],6],
  ['RightShoulder','Spine2','RightArm',[-1,0,0],8],['RightArm','RightShoulder','RightForeArm',[-1,0,0],8],['RightForeArm','RightArm','RightHand',[-1,0,0],7],['RightHand','RightForeArm','RightHandEnd',[-1,0,0],6],
  ['LeftUpLeg','Hips','LeftLeg',[0,-1,0],11],['LeftLeg','LeftUpLeg','LeftFoot',[0,-1,0],8],['LeftFoot','LeftLeg','LeftToeBase',[0,-.45,.9],7],['LeftToeBase','LeftFoot','LeftToeEnd',[0,0,1],5],
  ['RightUpLeg','Hips','RightLeg',[0,-1,0],11],['RightLeg','RightUpLeg','RightFoot',[0,-1,0],8],['RightFoot','RightLeg','RightToeBase',[0,-.45,.9],7],['RightToeBase','RightFoot','RightToeEnd',[0,0,1],5]];
const P={};for(const k in rig.joints)P[k]=V(rig.joints[k]);for(const k in rig.ends)P[k]=V(rig.ends[k]);   // bind positions (model space)
const idx={};BONES.forEach((b,i)=>idx[b[0]]=i);
// bind world matrix = translate(joint) * rotation taking the bone's rest direction onto its bind direction
const bindRot=[],bindM=[],restPos=[],segLen=[];
BONES.forEach(([name,par,endK,dir],i)=>{const a=P[name],b=P[endK];if(!a||!b)throw new Error('rig is missing '+name+' or '+endK);const d=b.clone().sub(a);segLen[i]=d.length();
  const q=new T.Quaternion().setFromUnitVectors(V(dir).normalize(),d.clone().normalize());bindRot[i]=q;bindM[i]=new T.Matrix4().compose(a,q,new T.Vector3(1,1,1))});
// rest (T-pose) world positions: walk the tree, every bone leaves its parent along the parent-to-this offset's rest direction with the bind length
BONES.forEach(([name,par,endK,dir],i)=>{if(!par){restPos[i]=P[name].clone();restPos[i].z=0;return}   // hips: same height and x as the model, z zeroed (the model leans)
  const pi=idx[par],off=P[name].clone().sub(P[par]),L=off.length();
  // the child's offset in T-pose: along the PARENT bone's rest direction (bind lengths are kept), except the clavicle / hips legs which fan out
  let rd=V(BONES[pi][3]).normalize();
  if(par==='Hips'&&/UpLeg/.test(name)){restPos[i]=restPos[pi].clone().add(new T.Vector3(P[name].x-P.Hips.x,P[name].y-P.Hips.y,0));return}
  if(/Shoulder$/.test(name)){restPos[i]=restPos[pi].clone().add(new T.Vector3(P[name].x-P.Spine2.x,P[name].y-P.Spine2.y,0));return}
  if(/^(Left|Right)Arm$/.test(name)){restPos[i]=restPos[pi].clone().add(new T.Vector3(P[name].x-P[par].x,0,0).setLength(L));return}
  if(/Foot$/.test(name)){restPos[i]=restPos[pi].clone().add(new T.Vector3(0,-1,0).multiplyScalar(L));return}
  if(/ToeBase$/.test(name)){const fd=V(BONES[pi][3]).normalize();restPos[i]=restPos[pi].clone().add(fd.multiplyScalar(L));return}
  restPos[i]=restPos[pi].clone().add(rd.multiplyScalar(L))});
// ---------------------------------------------------------------- skin weights
const SIDE=n=>/^Left/.test(n)?1:/^Right/.test(n)?-1:0;
const ALL=BONES.map(b=>b[0]);
const only=(names)=>new Set(names);
const UP=['Hips','Spine','Spine1','Spine2','Neck','Head'];
const armSet=s=>[s+'Shoulder',s+'Arm',s+'ForeArm',s+'Hand'],legSet=s=>[s+'UpLeg',s+'Leg',s+'Foot',s+'ToeBase'];
function allowed(part,x){const s=x>=0?'Left':'Right';
  if(/^(Crown|Head_Mask)/.test(part))return only(['Head','Neck']);
  if(/^Hood/.test(part))return only(['Head','Neck','Spine2']);
  if(/^(Gloves|Glove_|Bracer|Shoulder_Elbow|ArmStrap)/.test(part))return only([...armSet(s),'Spine2']);
  if(/^(Shoulder_Right)/.test(part))return only([...armSet('Right'),'Spine2']);if(/^(Shoulder_Left)/.test(part))return only([...armSet('Left'),'Spine2']);
  if(/^(Shoulder_Plate|UnderShoulder)/.test(part))return only([...armSet(s),'Spine2','Spine1']);
  if(/^(Chest_|Padded_NeckStrap|Padded_Cover)/.test(part))return only([...UP.slice(0,5),'LeftShoulder','RightShoulder']);
  if(/^Padded_Shirt/.test(part))return only([...UP.slice(0,5),...armSet('Left'),...armSet('Right')]);
  if(/^Belt/.test(part))return only(['Hips','Spine','Spine1',...legSet('Left').slice(0,1),...legSet('Right').slice(0,1)]);
  if(/^(Dress|Padded_Pants)/.test(part))return only(['Hips','Spine',...legSet('Left'),...legSet('Right')]);
  if(/^Boot/.test(part))return only([...legSet(s)]);
  return new Set(ALL)}
const seg=(p,a,b)=>{const ab=b.clone().sub(a),t=Math.max(0,Math.min(1,p.clone().sub(a).dot(ab)/Math.max(1e-6,ab.lengthSq())));return p.distanceTo(a.clone().add(ab.multiplyScalar(t)))};
function weigh(p,part){const al=allowed(part,p.x),c=[];BONES.forEach(([name,,endK,,r],i)=>{if(!al.has(name))return;const d=Math.max(0,seg(p,P[name],P[endK])-r);c.push([i,1/Math.pow(d+1.5,3)])});
  c.sort((a,b)=>b[1]-a[1]);const top=c.slice(0,4);let s=0;for(const [,w] of top)s+=w;return top.map(([i,w])=>[i,w/s])}
// ---------------------------------------------------------------- the mesh: merge by material
const meshNodes=J.nodes.map((n,i)=>({n,i})).filter(x=>x.n.mesh!==undefined);
const groups=new Map();   // material -> {pos,nor,uv,idx,part:[]}
for(const {n,i} of meshNodes){const M=world(i),NMx=new T.Matrix3().setFromMatrix4(M);
  for(const p of J.meshes[n.mesh].primitives){const g=groups.get(p.material)||groups.set(p.material,{pos:[],nor:[],uv:[],idx:[],part:[]}).get(p.material);
    const pos=read(p.attributes.POSITION),nor=read(p.attributes.NORMAL),uv=p.attributes.TEXCOORD_0!==undefined?read(p.attributes.TEXCOORD_0):new Float32Array(pos.length/3*2),ix=p.indices!==undefined?read(p.indices):Uint32Array.from({length:pos.length/3},(_,k)=>k),base=g.pos.length/3,v=new T.Vector3(),nn=new T.Vector3();
    const part=n.name.split(':')[0].replace(/_low\d+$/,'');
    for(let k=0;k<pos.length/3;k++){v.set(pos[k*3],pos[k*3+1],pos[k*3+2]).applyMatrix4(M);g.pos.push(v.x,v.y,v.z);nn.set(nor[k*3],nor[k*3+1],nor[k*3+2]).applyMatrix3(NMx).normalize();g.nor.push(nn.x,nn.y,nn.z);g.uv.push(uv[k*2],uv[k*2+1]);g.part.push(part)}
    for(const t of ix)g.idx.push(base+t)}}
// ---------------------------------------------------------------- sword: blade axis by PCA over the sword material's vertices
const SW=rig.sword;let swR=null,swGrip=null,swHand=null;
if(SW){const g=groups.get(SW.mat),pts=[];for(let k=0;k<g.pos.length/3;k++)pts.push(new T.Vector3(g.pos[k*3],g.pos[k*3+1],g.pos[k*3+2]));
  const c=new T.Vector3();pts.forEach(p=>c.add(p));c.divideScalar(pts.length);let d=new T.Vector3(1,.3,.2);
  for(let it=0;it<40;it++){const nv=new T.Vector3();for(const p of pts){const q=p.clone().sub(c);nv.add(q.multiplyScalar(q.dot(d)))}d=nv.normalize()}
  let mn=1e9,mx=-1e9;for(const p of pts){const t=p.clone().sub(c).dot(d);mn=Math.min(mn,t);mx=Math.max(mx,t)}
  const hand=P.RightHand;const tHand=c.clone().add(d.clone().multiplyScalar(mn)).distanceTo(hand),tHand2=c.clone().add(d.clone().multiplyScalar(mx)).distanceTo(hand);
  if(tHand2<tHand)d.negate();   // the tip is the end farther from the hand
  const e0=c.clone().add(d.clone().multiplyScalar(d.dot(d)*(tHand2<tHand?-mx:mn))),pommel=pts.reduce((a,p)=>p.clone().sub(c).dot(d)<a.clone().sub(c).dot(d)?p:a);
  // grip = the point of the blade axis nearest the right hand
  const tg=hand.clone().sub(c).dot(d);swGrip=c.clone().add(d.clone().multiplyScalar(Math.max(-1e9,tg)));
  swR=new T.Quaternion().setFromUnitVectors(d,V(SW.restDir||[0,0,1]));swHand=hand;
  console.log('sword axis',d.toArray().map(v=>+v.toFixed(2)),'len',(mx-mn).toFixed(0),'grip',swGrip.toArray().map(v=>+v.toFixed(0)))}
// ---------------------------------------------------------------- write
const chunks=[];let blen=0;const views=[],accs=[];
function put(arr,target){const b=Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength),pad=(4-blen%4)%4;if(pad){chunks.push(Buffer.alloc(pad));blen+=pad}views.push({buffer:0,byteOffset:blen,byteLength:b.length,...(target?{target}:{})});chunks.push(b);blen+=b.length;return views.length-1}
const acc=(view,type,ct,count,extra)=>{accs.push({bufferView:view,componentType:ct,count,type,...extra});return accs.length-1};
async function imgBuf(ti){const im=J.images[J.textures[ti].source],v=J.bufferViews[im.bufferView];return Buffer.from(BIN.buffer,BIN.byteOffset+(v.byteOffset||0),v.byteLength)}
const jpgs=[],mats=[],meshes=[],gnodesMesh=[];let total=0,allTris=0;for(const g of groups.values())allTris+=g.idx.length/3;
const dbg={};
for(const [mi,g] of groups){const nv=g.pos.length/3,mat=J.materials[mi],isSword=SW&&mi===SW.mat;
  const Pb=new Float32Array(nv*3),N=new Float32Array(nv*3),JJ=new Uint8Array(nv*4),WW=new Float32Array(nv*4),v=new T.Vector3();
  const handI=idx.RightHand,Rh=bindRot[handI];
  for(let k=0;k<nv;k++){v.set(g.pos[k*3],g.pos[k*3+1],g.pos[k*3+2]);let nx=g.nor[k*3],ny=g.nor[k*3+1],nz=g.nor[k*3+2];
    if(isSword){   // rigid on the hand: first move the sword to where the T-pose hand holds it, then store the bind-space position that skinning maps there
      const rel=v.clone().sub(swGrip).applyQuaternion(swR);const armDir=V(BONES[handI][3]).multiplyScalar(SW.gripOut||9);const tw=restPos[handI].clone().add(armDir).add(rel);
      const bp=P.RightHand.clone().add(tw.sub(restPos[handI]).applyQuaternion(Rh));v.copy(bp);const nn=new T.Vector3(nx,ny,nz).applyQuaternion(swR).applyQuaternion(Rh);nx=nn.x;ny=nn.y;nz=nn.z;
      JJ[k*4]=handI;WW[k*4]=1}
    else{const w=weigh(v,g.part[k]);w.forEach(([b,wt],c)=>{JJ[k*4+c]=b;WW[k*4+c]=wt})}
    Pb[k*3]=v.x;Pb[k*3+1]=v.y;Pb[k*3+2]=v.z;N[k*3]=nx;N[k*3+1]=ny;N[k*3+2]=nz}
  const uv=Float32Array.from(g.uv),idxA=Uint32Array.from(g.idx);
  const attr=new Float32Array(nv*5);for(let k=0;k<nv;k++){attr[k*5]=uv[k*2];attr[k*5+1]=uv[k*2+1];for(let c=0;c<3;c++)attr[k*5+2+c]=WW[k*4+c]}
  const want=Math.max(600,Math.round(+tris*(idxA.length/3)/allTris))*3;let out=idxA;
  if(want<idxA.length)[out]=MeshoptSimplifier.simplifyWithAttributes(idxA,Pb,3,attr,5,[1.4,1.4,.6,.6,.6],null,want,+(process.env.ERR||.05),process.env.NOLOCK?[]:['LockBorder']);
  console.log(mat.name,'tris',idxA.length/3,'->',out.length/3);
  const remap=new Int32Array(nv).fill(-1);let cnt=0;const used=[];for(const k of out)if(remap[k]<0){remap[k]=cnt++;used.push(k)}
  const P2=new Float32Array(cnt*3),N2=new Float32Array(cnt*3),U2=new Float32Array(cnt*2),J2=new Uint8Array(cnt*4),W2=new Float32Array(cnt*4);
  used.forEach((s,d)=>{P2.set(Pb.subarray(s*3,s*3+3),d*3);N2.set(N.subarray(s*3,s*3+3),d*3);U2[d*2]=uv[s*2];U2[d*2+1]=uv[s*2+1];J2.set(JJ.subarray(s*4,s*4+4),d*4);W2.set(WW.subarray(s*4,s*4+4),d*4)});
  const ind=new Uint32Array(out.length);out.forEach((s,k)=>ind[k]=remap[s]);total+=ind.length/3;
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let k=0;k<cnt;k++)for(let c=0;c<3;c++){mn[c]=Math.min(mn[c],P2[k*3+c]);mx[c]=Math.max(mx[c],P2[k*3+c])}
  const aP=acc(put(P2,34962),'VEC3',5126,cnt,{min:mn,max:mx}),aN=acc(put(N2,34962),'VEC3',5126,cnt),aU=acc(put(U2,34962),'VEC2',5126,cnt),aJ=acc(put(J2,34962),'VEC4',5121,cnt),aW=acc(put(W2,34962),'VEC4',5126,cnt),aI=acc(put(ind,34963),'SCALAR',5125,ind.length);
  // albedo only
  const mj={name:mat.name,doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.85}};
  const bc=mat.pbrMetallicRoughness&&mat.pbrMetallicRoughness.baseColorTexture;
  if(bc){const raw=await imgBuf(bc.index),meta=await sharp(raw).metadata();const img=sharp(raw).resize(+texS,+texS,{fit:'inside'}).ensureAlpha();const base=await img.clone().raw().toBuffer({resolveWithObject:true});
    let hasAlpha=false;if(meta.hasAlpha)for(let i=3;i<base.data.length;i+=4)if(base.data[i]<250){hasAlpha=true;break}
    const o=sharp(base.data,{raw:{width:base.info.width,height:base.info.height,channels:4}});
    const b=hasAlpha?await o.png({compressionLevel:9,palette:true,quality:70}).toBuffer():await o.flatten({background:'#888'}).jpeg({quality:78,mozjpeg:true}).toBuffer();
    jpgs.push({b,png:hasAlpha});mj.pbrMetallicRoughness.baseColorTexture={index:jpgs.length-1};if(hasAlpha){mj.alphaMode='MASK';mj.alphaCutoff=.5}}
  mats.push(mj);meshes.push({name:'knight_'+mat.name,primitives:[{attributes:{POSITION:aP,NORMAL:aN,TEXCOORD_0:aU,JOINTS_0:aJ,WEIGHTS_0:aW},indices:aI,material:mats.length-1}]});gnodesMesh.push({name:'knight_'+mat.name,mesh:meshes.length-1,skin:0})}
const nodes=BONES.map(([name,par],i)=>{const t=par?restPos[i].clone().sub(restPos[idx[par]]):restPos[i];return{name:'mixamorig'+name,translation:t.toArray().map(v=>+v.toFixed(4)),rotation:[0,0,0,1],children:[]}});
BONES.forEach(([name,par],i)=>{if(par)nodes[idx[par]].children.push(i)});
const ibmO=new Float32Array(BONES.length*16);bindM.forEach((m,i)=>m.clone().invert().toArray(ibmO,i*16));
const ibmA=acc(put(ibmO),'MAT4',5126,BONES.length);
const images=[],textures=[];for(const j of jpgs){const v=put(new Uint8Array(j.b));images.push({bufferView:v,mimeType:j.png?'image/png':'image/jpeg'});textures.push({source:images.length-1,sampler:0})}
const gnodes=nodes.slice();const ms=gnodes.length;gnodesMesh.forEach(m=>gnodes.push(m));
const json={asset:{version:'2.0',generator:'the-world pack_static_char'},scene:0,scenes:[{nodes:[0,...gnodesMesh.map((_,i)=>ms+i)]}],nodes:gnodes.map(n=>n.children&&!n.children.length?(delete n.children,n):n),meshes,skins:[{name:'skin',joints:BONES.map((_,i)=>i),inverseBindMatrices:ibmA,skeleton:0}],materials:mats,textures,images,samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],buffers:[{byteLength:0}],bufferViews:views,accessors:accs};
const bin=Buffer.concat(chunks),binP=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);json.buffers[0].byteLength=binP.length;
let js=Buffer.from(JSON.stringify(json));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,32)]);
const head=Buffer.alloc(12);head.write('glTF',0);head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+js.length+8+binP.length,8);const jh=Buffer.alloc(8);jh.writeUInt32LE(js.length,0);jh.write('JSON',4);const bh=Buffer.alloc(8);bh.writeUInt32LE(binP.length,0);bh.write('BIN\0',4);
fs.writeFileSync(OUT,Buffer.concat([head,jh,js,bh,binP]));
if(DBG)fs.writeFileSync(DBG,JSON.stringify({bind:BONES.map(([n,p,e])=>[P[n].toArray(),P[e].toArray()]),rest:BONES.map(([n,p],i)=>p?[restPos[idx[p]].toArray(),restPos[i].toArray()]:null).filter(Boolean)}));
console.log(IN.split('/').pop(),'->',OUT,((12+8+js.length+8+binP.length)/1024|0)+' KB','tris',allTris,'->',total,'bones',BONES.length,'meshes',meshes.length,'tex',jpgs.length);
