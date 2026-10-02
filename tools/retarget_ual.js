// Bakes Quaternius "Universal Animation Library [Standard]" (CC0) clips onto THE WORLD's character skeleton (assets/char.glb)
// and writes assets/anims.json: an array of THREE.AnimationClip JSON (load with THREE.AnimationClip.parse).
// Usage: npm i three  &&  node tools/retarget_ual.js <path/to/UAL1_Standard.glb> [out.json]
// Method: both rigs are T-posed and face +Z, so each bone gets  Q_world_target(t) = (Q_src(t) * Q_src_rest^-1) * (align * Q_target_rest),
// where align swings the target bone's rest direction onto the source's (fixes the small rest-pose differences). Hip bob is scaled by leg length.
const fs=require('fs'),path=require('path');
let T;try{T=require('three')}catch(e){T=require(process.env.THREE_PATH||'/tmp/an/node_modules/three/build/three.cjs')}
const SRC=process.argv[2],OUT=process.argv[3]||path.join(__dirname,'..','assets','anims.json'),CHAR=path.join(__dirname,'..','assets','char.glb');
function glb(f){const b=fs.readFileSync(f),jl=b.readUInt32LE(12);return {j:JSON.parse(b.slice(20,20+jl).toString()),bin:b.slice(20+jl+8)}}
function acc(G,i){const a=G.j.accessors[i],bv=G.j.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3,VEC4:4}[a.type],st=bv.byteStride||n*4,o=(bv.byteOffset||0)+(a.byteOffset||0),d=new Float32Array(a.count*n);for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)d[k*n+c]=G.bin.readFloatLE(o+k*st+c*4);return {d,n}}
function rig(G){const N=G.j.nodes.map((n,i)=>({i,name:n.name,t:new T.Vector3(...(n.translation||[0,0,0])),q:new T.Quaternion(...(n.rotation||[0,0,0,1])),s:new T.Vector3(...(n.scale||[1,1,1])),ch:n.children||[],par:-1}));N.forEach(n=>n.ch.forEach(c=>N[c].par=n.i));const by={};N.forEach(n=>by[n.name]=n);
  const world=pose=>{const W=new Array(N.length);const go=(i,pm)=>{const n=N[i],p=pose&&pose[n.name]||{};const m=pm.clone().multiply(new T.Matrix4().compose(p.t||n.t,p.q||n.q,n.s));W[i]=m;n.ch.forEach(c=>go(c,m))};G.j.scenes[0].nodes.forEach(r=>go(r,new T.Matrix4()));return W};return {N,by,world}}
const wq=m=>{const q=new T.Quaternion();m.decompose(new T.Vector3(),q,new T.Vector3());return q}, wp=m=>new T.Vector3().setFromMatrixPosition(m);
// target bone <- source bone (parents first). dir = [targetChild, sourceChild] used to align rest directions.
const MAP=[['Hips','pelvis',['Spine','spine_01']],['Spine','spine_01',['Chest','spine_02']],['Chest','spine_02',['UpperChest','spine_03']],['UpperChest','spine_03',['Neck','neck_01']],['Neck','neck_01',['Head','Head']],['Head','Head',null]];
for(const [S,s] of [['Left','l'],['Right','r']]){
  MAP.push([S+'Shoulder','clavicle_'+s,[S+'Arm','upperarm_'+s]],[S+'Arm','upperarm_'+s,[S+'ForeArm','lowerarm_'+s]],[S+'ForeArm','lowerarm_'+s,[S+'Hand','hand_'+s]],[S+'Hand','hand_'+s,[S+'HandIndex1','index_01_'+s]],
    [S+'HandIndex1','index_01_'+s,[S+'HandIndex2','index_02_'+s]],[S+'HandIndex2','index_02_'+s,[S+'HandIndex3','index_03_'+s]],[S+'HandIndex3','index_03_'+s,[S+'HandIndex3_end','index_04_leaf_'+s]],
    [S+'HandThumb1','thumb_01_'+s,[S+'HandThumb2','thumb_02_'+s]],[S+'HandThumb2','thumb_02_'+s,[S+'HandThumb2_end','thumb_03_'+s]],
    [S+'UpLeg','thigh_'+s,[S+'Leg','calf_'+s]],[S+'Leg','calf_'+s,[S+'Foot','foot_'+s]],[S+'Foot','foot_'+s,[S+'Toes','ball_'+s]],[S+'Toes','ball_'+s,[S+'Toes_end','ball_leaf_'+s]])}
const UPPER=new Set(MAP.map(m=>m[0]).filter(n=>!/Hips|UpLeg|Leg$|Foot|Toes/.test(n)));
// clips to bake: name -> {src, from, to, rate (output playback is 1:1, game sets timeScale), upper:true = upper body only, loop}
const CLIPS={idle:{src:'Idle_Loop'},walk:{src:'Walk_Loop'},jog:{src:'Jog_Fwd_Loop'},sprint:{src:'Sprint_Loop'},swim:{src:'Swim_Fwd_Loop'},tread:{src:'Swim_Idle_Loop'},
  jump:{src:'Jump_Start',from:.06,to:.7},fall:{src:'Jump_Loop'},land:{src:'Jump_Land',from:0,to:.6},smack:{src:'Sword_Attack',from:.2,to:.9,upper:true},hit:{src:'Hit_Chest'},interact:{src:'Interact',upper:true},dance:{src:'Dance_Loop'}};
const S=glb(SRC),SR=rig(S),C=glb(CHAR),CR=rig(C),FPS=24;
const Wsr=SR.world(null),Wtr=CR.world(null);
const restS={},restT={},align={};
for(const [t,s,dir] of MAP){restS[t]=wq(Wsr[SR.by[s].i]);restT[t]=wq(Wtr[CR.by[t].i]);align[t]=new T.Quaternion();
  if(dir){const dt=wp(Wtr[CR.by[dir[0]].i]).sub(wp(Wtr[CR.by[t].i])).normalize(),ds=wp(Wsr[SR.by[dir[1]].i]).sub(wp(Wsr[SR.by[s].i])).normalize();align[t].setFromUnitVectors(dt,ds).invert().invert()}}
// NOTE: setFromUnitVectors(dt,ds) is the world rotation taking the target's rest direction onto the source's
const legT=wp(Wtr[CR.by.Hips.i]).y-wp(Wtr[CR.by.LeftFoot.i]).y,legS=wp(Wsr[SR.by.pelvis.i]).y-wp(Wsr[SR.by.foot_l.i]).y,RATIO=legT/legS;
const rootQ=wq(Wtr[CR.by.Root.i]),rootS=CR.by.Root.s.x,hipsCtrlRest=CR.by.HipsCtrl.t.clone(),pelvisRest=wp(Wsr[SR.by.pelvis.i]);
const parentOf=t=>{const p=CR.N[CR.by[t].par];return p.name};
function sample(a,bn,path,time){const ch=a.channels.find(c=>S.j.nodes[c.target.node].name===bn&&c.target.path===path);if(!ch)return null;const sm=a.samplers[ch.sampler],ts=acc(S,sm.input).d,vs=acc(S,sm.output),n=vs.n;let k=0;while(k<ts.length-2&&ts[k+1]<=time)k++;const k2=Math.min(k+1,ts.length-1),f=k2===k?0:Math.min(1,Math.max(0,(time-ts[k])/(ts[k2]-ts[k])));
  return path==='rotation'?new T.Quaternion(...vs.d.slice(k*4,k*4+4)).slerp(new T.Quaternion(...vs.d.slice(k2*4,k2*4+4)),f):new T.Vector3(...vs.d.slice(k*3,k*3+3)).lerp(new T.Vector3(...vs.d.slice(k2*3,k2*3+3)),f)}
const out=[],report={};
for(const [name,cfg] of Object.entries(CLIPS)){
  const a=S.j.animations.find(x=>x.name===cfg.src),full=Math.max(...a.samplers.map(s=>S.j.accessors[s.input].max[0])),t0=cfg.from||0,t1=Math.min(cfg.to||full,full),dur=t1-t0,n=Math.max(2,Math.round(dur*FPS)+1);
  const times=[],Q={},P=[];const prev={};let errMax=0,errSum=0,errN=0,footMin=1e9;
  for(let f=0;f<n;f++){const t=Math.min(t1,t0+dur*f/(n-1));times.push(+(t-t0).toFixed(4));
    const pose={};for(const ch of a.channels){const bn=S.j.nodes[ch.target.node].name;pose[bn]=pose[bn]||{};const v=sample(a,bn,ch.target.path,Math.min(t,full-1e-4));if(ch.target.path==='rotation')pose[bn].q=v;else if(ch.target.path==='translation')pose[bn].t=v}
    const W=SR.world(pose),wt={}; // target world quats this frame
    for(const [tn,sn] of MAP.map(m=>[m[0],m[1]])){
      const Qs=wq(W[SR.by[sn].i]),delta=Qs.clone().multiply(restS[tn].clone().invert()),Qt=delta.multiply(align[tn].clone().multiply(restT[tn]));wt[tn]=Qt;
      const pn=parentOf(tn),Qp=wt[pn]||wq(Wtr[CR.by[pn].i]);let lq=Qp.clone().invert().multiply(Qt).normalize();
      if(prev[tn]&&prev[tn].dot(lq)<0)lq.set(-lq.x,-lq.y,-lq.z,-lq.w);prev[tn]=lq;(Q[tn]=Q[tn]||[]).push(lq)}
    const pel=wp(W[SR.by.pelvis.i]).sub(pelvisRest).multiplyScalar(RATIO).applyQuaternion(rootQ.clone().invert()).multiplyScalar(1/rootS);P.push(hipsCtrlRest.clone().add(pel));
    // verification: compare limb directions target(after FK with our local quats) vs source
    const pose2={};for(const tn in Q)pose2[tn]={q:Q[tn][Q[tn].length-1]};pose2.HipsCtrl={t:P[P.length-1]};const W2=CR.world(pose2);
    for(const [tn,sn,dir] of MAP){if(!dir)continue;const dT=wp(W2[CR.by[dir[0]].i]).sub(wp(W2[CR.by[tn].i])).normalize(),dS=wp(W[SR.by[dir[1]].i]).sub(wp(W[SR.by[sn].i])).normalize();const e=Math.acos(Math.max(-1,Math.min(1,dT.dot(dS))))*180/Math.PI;errMax=Math.max(errMax,e);errSum+=e;errN++}
    footMin=Math.min(footMin,wp(W2[CR.by.LeftFoot.i]).y,wp(W2[CR.by.RightFoot.i]).y)}
  const r=(v,d)=>+v.toFixed(d),tracks=[];
  for(const tn in Q){if(cfg.upper&&!UPPER.has(tn))continue;tracks.push({name:tn+'.quaternion',type:'quaternion',times,values:Q[tn].flatMap(q=>[r(q.x,4),r(q.y,4),r(q.z,4),r(q.w,4)])})}
  if(!cfg.upper)tracks.push({name:'HipsCtrl.position',type:'vector',times,values:P.flatMap(p=>[r(p.x,5),r(p.y,5),r(p.z,5)])});
  out.push({name,duration:+dur.toFixed(4),tracks,uuid:name});report[name]={dur:+dur.toFixed(2),frames:n,meanErr:+(errSum/errN).toFixed(2),maxErr:+errMax.toFixed(1),lowestFootY:+footMin.toFixed(3)}}
fs.writeFileSync(OUT,JSON.stringify(out));
console.log('leg ratio',RATIO.toFixed(3),'| wrote',OUT,(fs.statSync(OUT).size/1024).toFixed(0)+' KB');console.table(report);
