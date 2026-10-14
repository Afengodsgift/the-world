// Bakes Mixamo FBX animation packs (any Mixamo character, "mixamorig*" bones, cm units, T-pose bind) onto THE WORLD's skeleton (assets/char.glb)
// and writes a THREE.AnimationClip JSON array (+ per-clip `imp` = seconds of peak right-hand speed = the "hit moment", `trav` = net horizontal hip travel in metres).
// Usage:  node tools/retarget_mixamo.js scan  <dir> [dir...]          -> table: every clip's duration, travel, strike timing (use it to choose clips)
//         node tools/retarget_mixamo.js bake  <config.json> <out.json> -> config = {fps,dg,clips:[{name,file,from?,to?,inPlace?,loop?,arms?}]}  (file relative to config's "root"; set MX_DIR=<folder holding the unzipped packs> and root=<pack folder name>)
// Needs: three (+ fflate for FBXLoader) resolvable from NODE_PATH or THREE_NM=<node_modules>.  Same retarget maths as tools/retarget_ual.js:
//   Q_world_target(t) = (Q_src(t) * Q_src_rest^-1) * (align * Q_target_rest), hips position scaled by leg-length ratio, in-place by removing the linear horizontal drift.
const fs=require('fs'),path=require('path');
const NM=process.env.THREE_NM||'/home/claude/tools_nm/node_modules';
const CHAR=path.join(__dirname,'..','assets','char.glb');
function glb(f){const b=fs.readFileSync(f),jl=b.readUInt32LE(12);return {j:JSON.parse(b.slice(20,20+jl).toString()),bin:b.slice(20+jl+8)}}
(async()=>{
globalThis.document={createElementNS:()=>({style:{},set src(v){},addEventListener(){}}),createElement:()=>({style:{}})};globalThis.self=globalThis;
const T=await import(NM+'/three/build/three.module.js');const {FBXLoader}=await import(NM+'/three/examples/jsm/loaders/FBXLoader.js');
const r=(v,d)=>+v.toFixed(d),wq=m=>{const q=new T.Quaternion();m.decompose(new T.Vector3(),q,new T.Vector3());return q},wp=m=>new T.Vector3().setFromMatrixPosition(m);
// ---- target rig (glTF nodes)
const Cg=glb(CHAR);
function gRig(G){const N=G.j.nodes.map((n,i)=>({i,name:n.name,t:new T.Vector3(...(n.translation||[0,0,0])),q:new T.Quaternion(...(n.rotation||[0,0,0,1])),s:new T.Vector3(...(n.scale||[1,1,1])),ch:n.children||[],par:-1}));N.forEach(n=>n.ch.forEach(c=>N[c].par=n.i));const by={};N.forEach(n=>by[n.name]=n);
  const world=pose=>{const W=new Array(N.length);const go=(i,pm)=>{const n=N[i],p=pose&&pose[n.name]||{};const m=pm.clone().multiply(new T.Matrix4().compose(p.t||n.t,p.q||n.q,n.s));W[i]=m;n.ch.forEach(c=>go(c,m))};G.j.scenes[0].nodes.forEach(x=>go(x,new T.Matrix4()));return W};return {N,by,world}}
const CR=gRig(Cg),Wtr=CR.world(null);
// ---- source rig (Mixamo FBX): same interface, bones only, names without the "mixamorig" prefix
const fbxCache={};
function loadFbx(f){if(fbxCache[f])return fbxCache[f];const b=fs.readFileSync(f);const g=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');g.updateMatrixWorld(true);
  const bones=[];g.traverse(o=>{if(o.isBone)bones.push(o)});const idx=new Map(bones.map((o,i)=>[o,i]));
  const nm=o=>o.name.replace(/^mixamorig:?/,'');
  const N=bones.map((o,i)=>({i,name:nm(o),t:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone(),ch:[],par:idx.has(o.parent)?idx.get(o.parent):-1,node:o}));N.forEach(n=>{if(n.par>=0)N[n.par].ch.push(n.i)});
  const by={};N.forEach(n=>by[n.name]=n);
  const world=pose=>{const W=new Array(N.length);const go=(i,pm)=>{const n=N[i],p=pose&&pose[n.name]||{};const m=pm.clone().multiply(new T.Matrix4().compose(p.t||n.t,p.q||n.q,n.s));W[i]=m;n.ch.forEach(c=>go(c,m))};
    N.filter(n=>n.par<0).forEach(n=>{const ap=n.node.parent;go(n.i,ap?ap.matrixWorld.clone():new T.Matrix4())});return W};
  const a=g.animations[0],tr={};for(const t of a.tracks){const [b,p]=[t.name.split('.')[0].replace(/^mixamorig:?/,''),t.name.split('.').pop()];tr[b+'.'+p]=t}
  return fbxCache[f]={N,by,world,tr,dur:a.duration}}
const sampleTrack=(t,time,quat)=>{const ts=t.times,vs=t.values,n=quat?4:3;let k=0;while(k<ts.length-2&&ts[k+1]<=time)k++;const k2=Math.min(k+1,ts.length-1),f=k2===k?0:Math.min(1,Math.max(0,(time-ts[k])/(ts[k2]-ts[k])));
  return quat?new T.Quaternion(...vs.slice(k*4,k*4+4)).slerp(new T.Quaternion(...vs.slice(k2*4,k2*4+4)),f):new T.Vector3(...vs.slice(k*3,k*3+3)).lerp(new T.Vector3(...vs.slice(k2*3,k2*3+3)),f)};
function poseAt(S,time){const pose={};for(const k in S.tr){const [b,p]=k.split('.');const t=S.tr[k];pose[b]=pose[b]||{};if(p==='quaternion')pose[b].q=sampleTrack(t,time,true);else if(p==='position')pose[b].t=sampleTrack(t,time,false)}return pose}
// ---- bone map: [target bone, source bone, [target child, source child]|null]
const sd=f=>['Left','Right'].flatMap(S=>f(S));
const MAP=[['Hips','Hips',['Spine','Spine']],['Spine','Spine',['Chest','Spine1']],['Chest','Spine1',['UpperChest','Spine2']],['UpperChest','Spine2',['Neck','Neck']],['Neck','Neck',['Head','Head']],['Head','Head',null],
  ...sd(S=>[[S+'Shoulder',S+'Shoulder',[S+'Arm',S+'Arm']],[S+'Arm',S+'Arm',[S+'ForeArm',S+'ForeArm']],[S+'ForeArm',S+'ForeArm',[S+'Hand',S+'Hand']],[S+'Hand',S+'Hand',[S+'HandIndex1',S+'HandIndex1']],
    [S+'HandIndex1',S+'HandIndex1',[S+'HandIndex2',S+'HandIndex2']],[S+'HandIndex2',S+'HandIndex2',[S+'HandIndex3',S+'HandIndex3']],[S+'HandIndex3',S+'HandIndex3',[S+'HandIndex3_end',S+'HandIndex4']],
    [S+'HandThumb1',S+'HandThumb1',[S+'HandThumb2',S+'HandThumb2']],[S+'HandThumb2',S+'HandThumb2',[S+'HandThumb2_end',S+'HandThumb3']],
    [S+'UpLeg',S+'UpLeg',[S+'Leg',S+'Leg']],[S+'Leg',S+'Leg',[S+'Foot',S+'Foot']],[S+'Foot',S+'Foot',[S+'Toes',S+'ToeBase']],[S+'Toes',S+'ToeBase',[S+'Toes_end',S+'Toe_End']]])];
const FINGER=/HandIndex|HandThumb/;
// ---- strike timing: peak speed of the right hand (world, cm/s) and the window where it is above 40% of the peak
function strike(S,t0,t1){const h=S.by.RightHand.i,lh=S.by.LeftHand.i;const dt=1/60,pts=[];for(let t=t0;t<=t1;t+=dt){const W=S.world(poseAt(S,Math.min(t,S.dur-1e-4)));pts.push([t,wp(W[h]),wp(W[lh])])}
  // two-handed grips swing both hands: use whichever hand moves faster at each instant; light low-pass (3 samples) so single-frame spikes do not count
  const raw=pts.map((p,i)=>i?Math.max(p[1].distanceTo(pts[i-1][1]),p[2].distanceTo(pts[i-1][2]))/dt:0),sp=raw.map((v,i)=>(raw[Math.max(0,i-1)]+v+raw[Math.min(raw.length-1,i+1)])/3);
  let pk=0;sp.forEach((v,i)=>{if(v>sp[pk])pk=i});const hits=[];
  for(let i=1;i<sp.length-1;i++)if(sp[i]>=sp[i-1]&&sp[i]>=sp[i+1]&&sp[i]>sp[pk]*.45){const last=hits[hits.length-1];if(last&&pts[i][0]-last.t<.3){if(sp[i]>last.v){last.i=i;last.t=pts[i][0];last.v=sp[i]}}else hits.push({i,t:pts[i][0],v:sp[i]})}
  const win=H=>{const thr=H.v*.4;let a=H.i,b=H.i;while(a>0&&sp[a-1]>thr)a--;while(b<sp.length-1&&sp[b+1]>thr)b++;return {imp:r(H.t-t0,2),s0:r(pts[a][0]-t0,2),s1:r(pts[b][0]-t0,2)}};
  const W=hits.map(win);const m=win({i:pk,t:pts[pk][0],v:sp[pk]});return {imp:m.imp,s0:m.s0,s1:m.s1,peak:Math.round(sp[pk]),hits:W}}
function travel(S,t0,t1){const h=S.by.Hips.name;const a=sampleTrack(S.tr[h+'.position'],t0,false),b=sampleTrack(S.tr[h+'.position'],Math.min(t1,S.dur-1e-4),false);return {x:r((b.x-a.x)/100,2),z:r((b.z-a.z)/100,2)}}
const mode=process.argv[2];
if(mode==='scan'){const rows=[];for(const d of process.argv.slice(3))for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.fbx')&&!/^Ch\d/.test(x)).sort()){try{const S=loadFbx(path.join(d,f)),k=strike(S,0,S.dur),tv=travel(S,0,S.dur);
  rows.push({pack:path.basename(d).replace(/_Pack$/,''),clip:f.replace(/\.fbx$/,''),dur:r(S.dur,2),tx:tv.x,tz:tv.z,imp:k.imp,s0:k.s0,s1:k.s1,spd:k.peak,hits:k.hits.map(h=>h.s0+'/'+h.imp+'/'+h.s1).join(' ')})}catch(e){rows.push({pack:d,clip:f,dur:'ERR '+e.message})}}
  console.table(rows);return}
if(mode!=='bake'){console.log('usage: scan <dir...> | bake <config.json> <out.json>');return}
const cfg=JSON.parse(fs.readFileSync(process.argv[3],'utf8')),OUT=process.argv[4],root=path.resolve(process.env.MX_DIR||path.dirname(process.argv[3]),cfg.root||'.'),FPS=cfg.fps||24,dg=cfg.dg||3,out=[],report=[];
const restT={},tgtDir={};for(const [t,s,dir] of MAP){restT[t]=wq(Wtr[CR.by[t].i])}
const rootQ=wq(Wtr[CR.by.Root.i]),rootS=CR.by.Root.s.x,hipsRest=CR.by.HipsCtrl.t.clone();
const legT=wp(Wtr[CR.by.LeftUpLeg.i]).y-wp(Wtr[CR.by.LeftFoot.i]).y;
for(const c of cfg.clips){
  let S;try{S=loadFbx(path.join(root,c.file))}catch(e){console.log('skip',c.name,'-',e.message);continue}const Wsr=S.world(null);
  const restS={},align={};for(const [t,s,dir] of MAP){restS[t]=wq(Wsr[S.by[s].i]);align[t]=new T.Quaternion();
    if(dir){const dt=wp(Wtr[CR.by[dir[0]].i]).sub(wp(Wtr[CR.by[t].i])).normalize(),ds=wp(Wsr[S.by[dir[1]].i]).sub(wp(Wsr[S.by[s].i])).normalize();align[t].setFromUnitVectors(dt,ds)}}
  const legS=wp(Wsr[S.by.LeftUpLeg.i]).y-wp(Wsr[S.by.LeftFoot.i]).y,RATIO=legT/legS,pelvisRest=wp(Wsr[S.by.Hips.i]);
  const t0=c.from||0,t1=Math.min(c.to||S.dur,S.dur),dur=t1-t0,n=Math.max(2,Math.round(dur*FPS)+1);
  const times=[],Q={},prev={},H=[];let errMax=0,errSum=0,errN=0;
  const tw={};const twf=(W,name,memo)=>{if(memo[name])return memo[name];const m=MAP.find(x=>x[0]===name);let Qt;
    if(m){const Qs=wq(W[S.by[m[1]].i]);Qt=Qs.clone().multiply(restS[name].clone().invert()).multiply(align[name].clone().multiply(restT[name]))}
    else{const p=CR.N[CR.by[name].par];Qt=p?twf(W,p.name,memo).clone().multiply(CR.by[name].q):wq(Wtr[CR.by[name].i])}return memo[name]=Qt};
  for(let f=0;f<n;f++){const t=Math.min(t1-1e-4,t0+dur*f/(n-1));times.push(r(t-t0,4));const W=S.world(poseAt(S,t)),memo={};
    for(const [tn] of MAP){const Qt=twf(W,tn,memo),pn=CR.N[CR.by[tn].par].name;let lq=twf(W,pn,memo).clone().invert().multiply(Qt).normalize();if(prev[tn]&&prev[tn].dot(lq)<0)lq.set(-lq.x,-lq.y,-lq.z,-lq.w);prev[tn]=lq;(Q[tn]=Q[tn]||[]).push(lq)}
    H.push(wp(W[S.by.Hips.i]).sub(pelvisRest).multiplyScalar(RATIO));
    if(f%3===0)for(const [tn,sn,dir] of MAP){if(!dir)continue;const pose2={};for(const k in Q)pose2[k]={q:Q[k][Q[k].length-1]};const W2=CR.world(pose2);
      const dT=wp(W2[CR.by[dir[0]].i]).sub(wp(W2[CR.by[tn].i])).normalize(),dS=wp(W[S.by[dir[1]].i]).sub(wp(W[S.by[sn].i])).normalize();const e=Math.acos(Math.max(-1,Math.min(1,dT.dot(dS))))*180/Math.PI;errMax=Math.max(errMax,e);errSum+=e;errN++}}
  // hips: remove the net horizontal drift (linear x/z trend) so the sim owns world motion and the feet do not slide; keep vertical bob + sway
  const first=H[0].clone(),last=H[n-1].clone();
  if(c.inPlace!==false)H.forEach((h,i)=>{const u=i/(n-1);h.x-=first.x+(last.x-first.x)*u;h.z-=first.z+(last.z-first.z)*u});
  const P=H.map(h=>hipsRest.clone().add(h.clone().applyQuaternion(rootQ.clone().invert()).multiplyScalar(1/rootS)));
  const tracks=[],q=x=>r(x,dg);
  for(const tn in Q){if(c.arms&&!/Shoulder|Arm|Hand/.test(tn))continue;const vals=Q[tn],isF=FINGER.test(tn);
    let flat=true;for(const v of vals){if(Math.abs(v.x-vals[0].x)+Math.abs(v.y-vals[0].y)+Math.abs(v.z-vals[0].z)>.004){flat=false;break}}
    if(isF||flat)tracks.push({name:tn+'.quaternion',type:'quaternion',times:[0,r(dur,4)],values:[0,1].flatMap(()=>[q(vals[0].x),q(vals[0].y),q(vals[0].z),q(vals[0].w)])});   // fingers/static bones: one pose, 2 keys
    else tracks.push({name:tn+'.quaternion',type:'quaternion',times,values:vals.flatMap(v=>[q(v.x),q(v.y),q(v.z),q(v.w)])})}
  if(!c.arms)tracks.push({name:'HipsCtrl.position',type:'vector',times,values:P.flatMap(p=>[r(p.x,dg+1),r(p.y,dg+1),r(p.z,dg+1)])});
  const k=strike(S,t0,t1),tv=travel(S,t0,t1);
  out.push({name:c.name,duration:r(dur,4),tracks,uuid:c.name,imp:k.imp,s0:k.s0,s1:k.s1,hits:k.hits,trav:[tv.x,tv.z]});
  report.push({clip:c.name,src:c.file.split('/').pop(),dur:r(dur,2),frames:n,legRatio:r(RATIO,2),err:r(errSum/errN,1)+'/'+r(errMax,1),imp:k.imp,swing:k.s0+'-'+k.s1,trav:tv.x+','+tv.z})}
fs.writeFileSync(OUT,JSON.stringify(out));console.log('wrote',OUT,(fs.statSync(OUT).size/1024).toFixed(0)+' KB,',out.length,'clips');console.table(report);
})();
