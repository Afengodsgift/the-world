// Dev preview: CPU-skin the game's character in a baked pose (frame of a clip in assets/anims.json or assets/emotes.json) and write triangles for raster.c,
// optionally with the fishing rod in the right hand and a bed-sized slab, so poses/props can be checked without a browser.
// usage: node tools/preview/pose.js <clip> <0..1 frame fraction> <out.bin> [rod] [bed]
const fs=require('fs'),path=require('path'),T=require((process.env.THREE_DIR||'/tmp/an/node_modules/three')+'/build/three.cjs');
const ROOT=path.join(__dirname,'..','..');
function glb(f){const b=fs.readFileSync(f),jl=b.readUInt32LE(12);return {j:JSON.parse(b.slice(20,20+jl).toString()),bin:b.slice(20+jl+8)}}
function acc(G,i){const a=G.j.accessors[i],bv=G.j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],sz={5126:4,5125:4,5123:2,5121:1,5122:2,5120:1}[a.componentType],st=bv.byteStride||n*sz,o=(bv.byteOffset||0)+(a.byteOffset||0),d=new Float32Array(a.count*n);
  const rd=p=>a.componentType===5126?G.bin.readFloatLE(p):a.componentType===5125?G.bin.readUInt32LE(p):a.componentType===5123?G.bin.readUInt16LE(p)/(a.normalized?65535:1):a.componentType===5122?Math.max(G.bin.readInt16LE(p)/32767,-1):a.componentType===5121?G.bin.readUInt8(p)/(a.normalized?255:1):Math.max(G.bin.readInt8(p)/127,-1);
  for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)d[k*n+c]=rd(o+k*st+c*sz);return {d,n,count:a.count}}
const C=glb(path.join(ROOT,'assets/char.glb')),j=C.j;
const N=j.nodes.map((n,i)=>({i,name:n.name,t:new T.Vector3(...(n.translation||[0,0,0])),q:new T.Quaternion(...(n.rotation||[0,0,0,1])),s:new T.Vector3(...(n.scale||[1,1,1])),ch:n.children||[],par:-1}));N.forEach(n=>n.ch.forEach(c=>N[c].par=n.i));const by={};N.forEach(n=>by[n.name]=n);
const [,, clipName,frac,out,...flags]=process.argv;
const AT=(flags.find(f=>f.startsWith('at:'))||'at:0,0,0').slice(3).split(',').map(Number),YAW=parseFloat((flags.find(f=>f.startsWith('yaw:'))||'yaw:0').slice(4))*Math.PI/180;
const place=v=>v.applyAxisAngle(new T.Vector3(0,1,0),YAW).add(new T.Vector3(...AT));
const clips=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/anims.json'))).concat(JSON.parse(fs.readFileSync(path.join(ROOT,'assets/emotes.json'))).clips);
const clip=clips.find(c=>c.name===clipName);if(!clip)throw new Error('no clip '+clipName);
const pose={};const nt=clip.tracks[0].times.length,k=Math.round((nt-1)*parseFloat(frac));
for(const tr of clip.tracks){const nm=tr.name.split('.')[0];pose[nm]=pose[nm]||{};if(tr.type==='quaternion')pose[nm].q=new T.Quaternion(...tr.values.slice(k*4,k*4+4));else pose[nm].t=new T.Vector3(...tr.values.slice(k*3,k*3+3))}
const W=new Array(N.length);const go=(i,pm)=>{const n=N[i],p=pose[n.name]||{};const m=pm.clone().multiply(new T.Matrix4().compose(p.t||n.t,p.q||n.q,n.s));W[i]=m;n.ch.forEach(c=>go(c,m))};j.scenes[0].nodes.forEach(r=>go(r,new T.Matrix4()));
const node=j.nodes.findIndex(n=>n.mesh!==undefined&&n.skin!==undefined),sk=j.skins[j.nodes[node].skin],ibm=acc(C,sk.inverseBindMatrices).d,IB=sk.joints.map((_,i)=>new T.Matrix4().fromArray(ibm,i*16));
const M=sk.joints.map((jn,i)=>W[jn].clone().multiply(IB[i]));
if(process.env.DBG){const bad=M.map((m,i)=>m.elements.some(x=>!Number.isFinite(x))?j.nodes[sk.joints[i]].name:null).filter(Boolean);console.log('joints with non-finite matrices:',bad.join(',')||'none')}
const out14=[],S=.5,tri=(a,b,c,col,fl)=>out14.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,col[0],col[1],col[2],1,fl||0);
for(const prim of j.meshes[j.nodes[node].mesh].primitives){
  const P=acc(C,prim.attributes.POSITION).d,J=acc(C,prim.attributes.JOINTS_0).d,Wt=acc(C,prim.attributes.WEIGHTS_0).d,I=acc(C,prim.indices).d,cnt=P.length/3,vs=[];
  for(let i=0;i<cnt;i++){const a=new T.Vector3(),b=new T.Vector3(P[i*3],P[i*3+1],P[i*3+2]),v=new T.Vector3();let ws=0;for(let q=0;q<4;q++){const w=Wt[i*4+q];if(!w)continue;v.copy(b).applyMatrix4(M[J[i*4+q]]);a.addScaledVector(v,w);ws+=w}vs.push(ws>.5&&Number.isFinite(a.x)?place(a.multiplyScalar(S)):null)}
  if(process.env.DBG)console.log('vertices',cnt,'skinned ok',vs.filter(Boolean).length);
  for(let t=0;t<I.length;t+=3){const a=vs[I[t]],b=vs[I[t+1]],c=vs[I[t+2]];if(a&&b&&c)tri(a,b,c,[.78,.62,.5],0)}}
const hand=new T.Matrix4().copy(W[by.RightHand.i]);const hp=place(new T.Vector3().setFromMatrixPosition(hand).multiplyScalar(S));
function cyl(p0,p1,r0,r1,col,seg=8){const d=p1.clone().sub(p0),L=d.length(),u=d.clone().normalize(),h=Math.abs(u.y)>.9?new T.Vector3(1,0,0):new T.Vector3(0,1,0),a=new T.Vector3().crossVectors(u,h).normalize(),b=new T.Vector3().crossVectors(u,a);
  for(let s=0;s<seg;s++){const t0=s/seg*Math.PI*2,t1=(s+1)/seg*Math.PI*2,q=(t,r,p)=>p.clone().addScaledVector(a,Math.cos(t)*r).addScaledVector(b,Math.sin(t)*r);tri(q(t0,r0,p0),q(t0,r1,p1),q(t1,r1,p1),col,1);tri(q(t0,r0,p0),q(t1,r1,p1),q(t1,r0,p0),col,1)}}
if(flags.includes('rod')){const q0=new T.Quaternion(-0.18679,0,-0.76778,0.61288),hq=new T.Quaternion();hand.decompose(new T.Vector3(),hq,new T.Vector3());const axis=new T.Vector3(0,1,0).applyQuaternion(q0).applyQuaternion(hq).applyAxisAngle(new T.Vector3(0,1,0),YAW).normalize();
  cyl(hp.clone().addScaledVector(axis,-.38),hp.clone().addScaledVector(axis,.04),.05,.05,[.78,.64,.4]);cyl(hp.clone().addScaledVector(axis,-.05),hp.clone().addScaledVector(axis,2.45),.034,.012,[.48,.32,.19]);
  console.log('rod axis (world): fwd',axis.z.toFixed(2),'up',axis.y.toFixed(2),'side',axis.x.toFixed(2),'| tip at',hp.clone().addScaledVector(axis,2.45).toArray().map(x=>x.toFixed(2)).join(','))}
// ground slab (and optional bed) for reference
const box=(x0,y0,z0,x1,y1,z1,col)=>{const c=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]].map(a=>new T.Vector3(...a)),f=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]];for(const q of f){tri(c[q[0]],c[q[1]],c[q[2]],col,1);tri(c[q[0]],c[q[2]],c[q[3]],col,1)}};
box(-30,-.3,-30,30,0,30,[.45,.7,.35]);
if(flags.includes('bed')){box(-1.05,0,-5.275,1.05,.445,-2.525,[.54,.35,.18]);box(-.95,.445,-5.15,.95,.75,-2.65,[.95,.9,.8]);box(-.95,.75,-3.725,.95,.88,-2.675,[.25,.56,.64]);for(const sx of [-.5,.5])box(sx-.4,.75,-5.125,sx+.4,.95,-4.575,[1,1,1])}
fs.writeFileSync(out,Buffer.from(new Float32Array(out14).buffer));
const bb=new T.Box3();for(let i=0;i<out14.length;i+=14){bb.expandByPoint(new T.Vector3(out14[i],out14[i+1],out14[i+2]))}
console.log(clipName,'frame',k+'/'+(nt-1),'triangles',out14.length/14);
