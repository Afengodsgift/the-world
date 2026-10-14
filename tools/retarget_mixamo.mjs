// MIXAMO gun clips: bakes Mixamo FBX animations ("Pro Rifle Pack") onto THE WORLD's character skeleton (assets/char.glb) and writes assets/gun_anims.json.
// Same method as tools/retarget_combat.js (Quaternius), different source: all rigs are T-posed and face +Z, so each bone gets
//   Q_world_target(t) = (Q_src(t) * Q_src_rest^-1) * (align * Q_target_rest)
// where `align` swings the target bone's rest direction onto the source's. Bones with no source counterpart follow their parent at rest. Hip height changes are
// scaled by leg length. Differences for locomotion:
//   * Mixamo locomotion clips carry ROOT MOTION in the hips (the character travels ~1-6 m per clip). The game moves the avatar itself, so the linear horizontal
//     travel is removed (the hip sway around it is kept) and the travel SPEED is recorded in meta[name].spd (game m/s at which the feet stay planted), plus
//     meta[name].dir = the direction of travel in avatar space (+Z forward, +X left). src/character/GunLoco.js uses spd to time-scale a clip to the avatar's real speed.
//   * Death clips keep their fall (hips XZ) and are snapped onto the floor with the real skinned mesh, like the Quaternius death clip.
// Output: { v:1, meta:{name:{dur,loop,spd,dir:[x,z]}}, clips:[THREE.AnimationClip JSON] }  (load with THREE.AnimationClip.parse, see GunLoco.js)
// Usage:  THREE_DIR=<dir with three@0.147.0>  node tools/retarget_mixamo.mjs <Pro_Rifle_Pack dir> [out.json]
// (the pack folder holds the FBX files: "walk forward.fbx", "run left.fbx", "death from the front.fbx" ...; Ch03_nonPBR.fbx, the mesh, is not needed)
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
globalThis.self=globalThis;
const HERE=path.dirname(fileURLToPath(import.meta.url)),TD=process.env.THREE_DIR||path.join(process.cwd(),'node_modules','three');
const T=await import(pathToFileURL(path.join(TD,'build/three.module.js')).href);
const {FBXLoader}=await import(pathToFileURL(path.join(TD,'examples/jsm/loaders/FBXLoader.js')).href);
const PACK=process.argv[2],OUT=process.argv[3]||path.join(HERE,'..','assets','gun_anims.json'),CHAR=path.join(HERE,'..','assets','char.glb');
if(!PACK){console.error('usage: retarget_mixamo.mjs <pack dir> [out.json]');process.exit(1)}
const MODEL_SCALE=.5;   // index.html dress(): m.scale.setScalar(.5)
const FPS={loop:30,idle:12,once:15},DG=3;   // sample rates: short gait loops need 30; slow idles and the death falls are smooth at lower rates (interpolated)
// ---- char.glb (target) ----
function glb(f){const b=fs.readFileSync(f),jl=b.readUInt32LE(12);return {j:JSON.parse(b.slice(20,20+jl).toString()),bin:b.slice(20+jl+8)}}
function rig(G){const N=G.j.nodes.map((n,i)=>({i,name:n.name,t:new T.Vector3(...(n.translation||[0,0,0])),q:new T.Quaternion(...(n.rotation||[0,0,0,1])),s:new T.Vector3(...(n.scale||[1,1,1])),ch:n.children||[],par:-1}));N.forEach(n=>n.ch.forEach(c=>N[c].par=n.i));const by={};N.forEach(n=>by[n.name]=n);
  const world=pose=>{const W=new Array(N.length);const go=(i,pm)=>{const n=N[i],p=pose&&pose[n.name]||{};const m=pm.clone().multiply(new T.Matrix4().compose(p.t||n.t,p.q||n.q,n.s));W[i]=m;n.ch.forEach(c=>go(c,m))};G.j.scenes[0].nodes.forEach(r=>go(r,new T.Matrix4()));return W};return {N,by,world}}
const wq=m=>{const q=new T.Quaternion();m.decompose(new T.Vector3(),q,new T.Vector3());return q},wp=m=>new T.Vector3().setFromMatrixPosition(m);
const C=glb(CHAR),CR=rig(C),Wtr=CR.world(null),r=(v,d)=>+v.toFixed(d);
// ---- Mixamo (source): FBX bones -> same {N,by,world} shape ----
function loadFbx(f){const b=fs.readFileSync(f),g=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');return g}
function srcRig(g){
  const N=[],by={};
  const add=(o,par)=>{const name=o.name.replace(/^mixamorig:?/,'').replace(/:Bone$/,''),n={i:N.length,name,t:o.position.clone(),q:o.quaternion.clone(),s:new T.Vector3(1,1,1),ch:[],par};N.push(n);by[name]=n;if(par>=0)N[par].ch.push(n.i);o.children.filter(c=>c.isBone).forEach(c=>add(c,n.i))};
  g.children.filter(c=>c.isBone||c.name.startsWith('mixamorig')).forEach(c=>add(c,-1));
  const world=pose=>{const W=new Array(N.length);const go=(i,pm)=>{const n=N[i],p=pose&&pose[n.name]||{};const m=pm.clone().multiply(new T.Matrix4().compose(p.t||n.t,p.q||n.q,n.s));W[i]=m;n.ch.forEach(c=>go(c,m))};N.forEach(n=>{if(n.par<0)go(n.i,new T.Matrix4())});return W};
  return {N,by,world}}
// ---- bone map: [target, source, [target child, source child] to align rest directions | null] ----
const sides=f=>[['Left','Left'],['Right','Right']].flatMap(([S,s])=>f(S,s));
const MAP=[['Hips','Hips',['Spine','Spine']],['Spine','Spine',['Chest','Spine1']],['Chest','Spine1',['UpperChest','Spine2']],['UpperChest','Spine2',['Neck','Neck']],['Neck','Neck',['Head','Head']],['Head','Head',null],
  ...sides((S,s)=>[[S+'Shoulder',s+'Shoulder',[S+'Arm',s+'Arm']],[S+'Arm',s+'Arm',[S+'ForeArm',s+'ForeArm']],[S+'ForeArm',s+'ForeArm',[S+'Hand',s+'Hand']],[S+'Hand',s+'Hand',[S+'HandIndex1',s+'HandIndex1']],
    [S+'HandIndex1',s+'HandIndex1',[S+'HandIndex2',s+'HandIndex2']],[S+'HandIndex2',s+'HandIndex2',[S+'HandIndex3',s+'HandIndex3']],[S+'HandIndex3',s+'HandIndex3',[S+'HandIndex3_end',s+'HandIndex4']],
    [S+'HandThumb1',s+'HandThumb1',[S+'HandThumb2',s+'HandThumb2']],[S+'HandThumb2',s+'HandThumb2',[S+'HandThumb2_end',s+'HandThumb3']],
    [S+'UpLeg',s+'UpLeg',[S+'Leg',s+'Leg']],[S+'Leg',s+'Leg',[S+'Foot',s+'Foot']],[S+'Foot',s+'Foot',[S+'Toes',s+'ToeBase']],[S+'Toes',s+'ToeBase',[S+'Toes_end',s+'Toe_End']]])];
// ---- clips: name -> {file, kind: 'loop' (in place, travel speed recorded) | 'once' (keeps its fall) | 'idle', floor} ----
const GAITS={w:'walk',r:'run',s:'sprint'},DIRS={f:'forward',fl:'forward left',fr:'forward right',l:'left',r:'right',b:'backward',bl:'backward left',br:'backward right'};
const CLIPS={a_idle:{file:'idle aiming',kind:'idle'}};
for(const g in GAITS)for(const d in DIRS)CLIPS[g+'_'+d]={file:GAITS[g]+' '+DIRS[d],kind:'loop'};
Object.assign(CLIPS,{d_front:{file:'death from the front',kind:'once',floor:true},d_front_hs:{file:'death from front headshot',kind:'once',floor:true},d_back:{file:'death from the back',kind:'once',floor:true},
  d_back_hs:{file:'death from back headshot',kind:'once',floor:true},d_right:{file:'death from right',kind:'once',floor:true},d_crouch_hs:{file:'death crouching headshot front',kind:'once',floor:true}});
// ---- real-mesh floor snapping (CPU-skin char.glb: world = sum(weight * jointWorld * inverseBind) * vertex) ----
function accAny(G,i){const a=G.j.accessors[i],bv=G.j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],sz={5126:4,5125:4,5123:2,5121:1}[a.componentType],st=bv.byteStride||n*sz,o=(bv.byteOffset||0)+(a.byteOffset||0),d=new Float32Array(a.count*n);
  const rd=p=>a.componentType===5126?G.bin.readFloatLE(p):a.componentType===5125?G.bin.readUInt32LE(p):a.componentType===5123?G.bin.readUInt16LE(p)/(a.normalized?65535:1):G.bin.readUInt8(p)/(a.normalized?255:1);
  for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)d[k*n+c]=rd(o+k*st+c*sz);return {d,n,count:a.count}}
let SKIN=null;
(function initSkin(){
  const j=C.j,node=j.nodes.find(n=>n.mesh!==undefined&&n.skin!==undefined);if(!node)return;
  const sk=j.skins[node.skin],ibm=accAny(C,sk.inverseBindMatrices).d,V=[];
  for(const p of j.meshes[node.mesh].primitives){const P=accAny(C,p.attributes.POSITION).d,J=accAny(C,p.attributes.JOINTS_0).d,Wt=accAny(C,p.attributes.WEIGHTS_0).d;for(let i=0;i<P.length/3;i++)V.push([P[i*3],P[i*3+1],P[i*3+2],J.slice(i*4,i*4+4),Wt.slice(i*4,i*4+4)])}
  const IB=sk.joints.map((_,k)=>new T.Matrix4().fromArray(ibm,k*16));
  SKIN={lowest(W){const M=sk.joints.map((jn,k)=>W[jn].clone().multiply(IB[k]).elements);let mn=1e9;
    for(const [x,y,z,J,Wt] of V){let ws=0,yy=0;for(let k=0;k<4;k++){const w=Wt[k];if(!w)continue;const e=M[J[k]];yy+=w*(e[1]*x+e[5]*y+e[9]*z+e[13]);ws+=w}if(ws>.5&&Number.isFinite(yy)&&yy<mn)mn=yy}return mn}}})();

// ---- measured once: leg length ratio (target hip->ankle over source hip->ankle), and the rest pelvis of the source ----
const rest0=loadFbx(path.join(PACK,'idle.fbx')),SR0=srcRig(rest0),Wsr0=SR0.world(null);
const legT=wp(Wtr[CR.by.Hips.i]).y-wp(Wtr[CR.by.LeftFoot.i]).y,legS=wp(Wsr0[SR0.by.Hips.i]).y-wp(Wsr0[SR0.by.LeftFoot.i]).y,RATIO=legT/legS;
const rootQ=wq(Wtr[CR.by.Root.i]),rootS=CR.by.Root.s.x,hipsRest=CR.by.HipsCtrl.t.clone();
// target meters per source-cm of horizontal travel: hips world units -> avatar meters (model scale). Checked against the avatar height below.
const headY=wp(Wtr[CR.by.Head.i]).y,footY=wp(Wtr[CR.by.LeftFoot.i]).y;
console.log('char: leg',legT.toFixed(3),'head-foot',(headY-footY).toFixed(3),'world units; mixamo leg',legS.toFixed(1),'cm; ratio',RATIO.toFixed(4),'; avatar height in game m =',((headY-footY)*MODEL_SCALE).toFixed(2));
const M_PER_CM=RATIO*MODEL_SCALE;   // 1 source cm of travel = this many game meters (feet stay planted at that scale)

function bake(name,cfg){
  const g=loadFbx(path.join(PACK,cfg.file+'.fbx')),S=srcRig(g),Wsr=S.world(null),clip=g.animations[0];
  const restS={},restT={},align={};
  for(const [t,s,dir] of MAP){if(!S.by[s])throw new Error('source bone missing '+s);restS[t]=wq(Wsr[S.by[s].i]);restT[t]=wq(Wtr[CR.by[t].i]);align[t]=new T.Quaternion();
    if(dir){const dt=wp(Wtr[CR.by[dir[0]].i]).sub(wp(Wtr[CR.by[t].i])).normalize(),ds=wp(Wsr[S.by[dir[1]].i]).sub(wp(Wsr[S.by[s].i])).normalize();align[t].setFromUnitVectors(dt,ds)}}
  const pelvisRest=wp(Wsr[S.by.Hips.i]);
  const itp={};for(const tr of clip.tracks){const m=tr.name.match(/^mixamorig:?(.+)\.(quaternion|position)$/);if(m)itp[m[1]+'.'+m[2]]=tr.createInterpolant()}
  const dur=clip.duration,n=Math.max(2,Math.round(dur*FPS[cfg.kind])+1),times=[],Q={},P=[],prev={},mapped=new Set(MAP.map(m=>m[0]));let errMax=0,errSum=0,errN=0;
  const pelS=[]; // source pelvis world position per frame (cm)
  const frames=[];
  for(let f=0;f<n;f++){const t=Math.min(dur,dur*f/(n-1));times.push(r(t,4));
    const pose={};for(const nd of S.N){const iq=itp[nd.name+'.quaternion'],ip=itp[nd.name+'.position'];if(iq||ip){pose[nd.name]={};if(iq)pose[nd.name].q=new T.Quaternion().fromArray(iq.evaluate(t));if(ip)pose[nd.name].t=new T.Vector3().fromArray(ip.evaluate(t))}}
    const W=S.world(pose);frames.push({pose,W});pelS.push(wp(W[S.by.Hips.i]).clone())}
  // ---- root motion: remove the straight-line horizontal travel of the pelvis (loops), report speed + direction in avatar space (source +Z forward, +X left) ----
  let spd=0,dirx=0,dirz=0;const trend=pelS.map(()=>new T.Vector3());
  if(cfg.kind==='loop'){const d=pelS[n-1].clone().sub(pelS[0]);d.y=0;const L=d.length();
    // cm/s * (game m per source cm) = m/s
    spd=L/dur*M_PER_CM;
    if(L>1e-3){dirx=d.x/L;dirz=d.z/L}for(let f=0;f<n;f++)trend[f].copy(d).multiplyScalar(f/(n-1))}
  const wt={};
  for(let f=0;f<n;f++){const {W}=frames[f];
    for(const k in wt)delete wt[k];
    const tw=nm=>{if(wt[nm])return wt[nm];const m=MAP.find(x=>x[0]===nm);let Qt;
      if(m){const Qs=wq(W[S.by[m[1]].i]);Qt=Qs.clone().multiply(restS[nm].clone().invert()).multiply(align[nm].clone().multiply(restT[nm]))}
      else{const p=CR.N[CR.by[nm].par];Qt=p?tw(p.name).clone().multiply(CR.by[nm].q):wq(Wtr[CR.by[nm].i])}
      return wt[nm]=Qt};
    for(const [tn] of MAP){const Qt=tw(tn),pn=CR.N[CR.by[tn].par].name;let lq=tw(pn).clone().invert().multiply(Qt).normalize();if(prev[tn]&&prev[tn].dot(lq)<0)lq.set(-lq.x,-lq.y,-lq.z,-lq.w);prev[tn]=lq;(Q[tn]=Q[tn]||[]).push(lq)}
    const pel=pelS[f].clone().sub(pelvisRest).sub(trend[f]);   // cm, root motion removed (loops)
    pel.multiplyScalar(RATIO).applyQuaternion(rootQ.clone().invert()).multiplyScalar(1/rootS);
    const Pf=hipsRest.clone().add(pel),pose2={};for(const tn in Q)pose2[tn]={q:Q[tn][Q[tn].length-1]};pose2.HipsCtrl={t:Pf};let W2=CR.world(pose2);
    if(cfg.floor&&SKIN){const minY=SKIN.lowest(W2);if(minY<1e8){Pf.add(new T.Vector3(0,-(minY-.01),0).applyQuaternion(rootQ.clone().invert()).multiplyScalar(1/rootS));pose2.HipsCtrl={t:Pf};W2=CR.world(pose2)}}
    P.push(Pf);
    for(const [tn,sn,dir] of MAP){if(!dir)continue;const dT=wp(W2[CR.by[dir[0]].i]).sub(wp(W2[CR.by[tn].i])).normalize(),dS=wp(W[S.by[dir[1]].i]).sub(wp(W[S.by[sn].i])).normalize();const e=Math.acos(Math.max(-1,Math.min(1,dT.dot(dS))))*180/Math.PI;errMax=Math.max(errMax,e);errSum+=e;errN++}
    frames[f].W2=W2}
  // ---- foot slide check (locomotion): stance foot's avatar-space velocity + travel velocity should be ~0. Reported as % of travel speed ----
  let slide=null,fit=spd;
  if(cfg.kind==='loop'&&spd>.2){const ankle=['LeftFoot','RightFoot'].map(nm=>frames.map(fr=>wp(fr.W2[CR.by[nm].i]).clone()));const V=[];
    // stance frames = the lowest quarter of each ankle's height range. v = ankle velocity in avatar space (glb world units -> game m via MODEL_SCALE; +Z forward, +X left)
    for(let k=0;k<2;k++){const ys=ankle[k].map(p=>p.y),lo=Math.min(...ys),hi=Math.max(...ys);
      for(let f=1;f<n;f++){if(ys[f]>lo+.25*(hi-lo)||ys[f-1]>lo+.25*(hi-lo))continue;const dt=times[f]-times[f-1];const v=ankle[k][f].clone().sub(ankle[k][f-1]).multiplyScalar(MODEL_SCALE/dt);V.push([v.x,v.z])}}
    // the speed at which the stance feet stay planted = least-squares fit of  v + s*dir = 0   (s = -mean(v . dir)); the leg-length estimate `spd` is kept as a cross-check
    if(V.length>2){fit=-V.reduce((a,v)=>a+v[0]*dirx+v[1]*dirz,0)/V.length;let e=0;for(const v of V)e+=(v[0]+fit*dirx)**2+(v[1]+fit*dirz)**2;slide=Math.sqrt(e/V.length)/Math.max(.05,fit)}}
  // the same measure on the untouched Mixamo skeleton (its own root motion) as a yardstick: ankle roll alone makes a 'planted' ankle drift at ~20% of the travel speed
  let srcSlide=null;
  if(cfg.kind==='loop'){const d0=pelS[n-1].clone().sub(pelS[0]);d0.y=0;const L0=d0.length()/dur;let sum=0,cnt=0;
    for(const nm of ['LeftFoot','RightFoot']){const A=frames.map(fr=>wp(fr.W[S.by[nm].i]).clone()),ys=A.map(p=>p.y),lo=Math.min(...ys),hi=Math.max(...ys);
      for(let f=1;f<n;f++){if(ys[f]>lo+.25*(hi-lo)||ys[f-1]>lo+.25*(hi-lo))continue;const dt=times[f]-times[f-1],v=A[f].clone().sub(A[f-1]).divideScalar(dt);v.y=0;sum+=v.length();cnt++}}
    srcSlide=cnt&&L0>1?sum/cnt/L0:null}
  // ---- tracks ----
  const stat=a=>a.every(q=>Math.abs(q.dot(a[0]))>.99995);
  const tracks=[];
  for(const tn in Q){const a=Q[tn];if(stat(a))tracks.push({name:tn+'.quaternion',type:'quaternion',times:[0,r(dur,4)],values:[0,1].flatMap(()=>a[0].toArray().map(x=>r(x,DG)))});
    else tracks.push({name:tn+'.quaternion',type:'quaternion',times,values:a.flatMap(q=>[r(q.x,DG),r(q.y,DG),r(q.z,DG),r(q.w,DG)])})}
  tracks.push({name:'HipsCtrl.position',type:'vector',times,values:P.flatMap(p=>[r(p.x,DG+1),r(p.y,DG+1),r(p.z,DG+1)])});
  return {clip:{name,duration:r(dur,4),tracks,uuid:name},meta:{dur:r(dur,3),loop:cfg.kind!=='once',spd:r(fit,3),dir:[r(dirx,3),r(dirz,3)]},report:{src:cfg.file,dur:r(dur,2),frames:n,spd:r(spd,2)+' fit '+r(fit,2),meanErr:r(errSum/errN,2),maxErr:r(errMax,1),slide:slide===null?'-':r(slide*100,0)+'%',srcSlide:srcSlide===null?'-':r(srcSlide*100,0)+'%'}}}
const out={v:1,meta:{},clips:[]},rep={};
for(const [name,cfg] of Object.entries(CLIPS)){const b=bake(name,cfg);out.clips.push(b.clip);out.meta[name]=b.meta;rep[name]=b.report}
fs.writeFileSync(OUT,JSON.stringify(out));console.log('wrote',OUT,(fs.statSync(OUT).size/1024).toFixed(0)+' KB');console.table(rep);
