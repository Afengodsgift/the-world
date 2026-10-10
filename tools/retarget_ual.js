// Bakes CC0 animation packs onto THE WORLD's character skeleton (assets/char.glb) and writes assets/anims.json:
// an array of THREE.AnimationClip JSON (load with THREE.AnimationClip.parse). Packs:
//   * Quaternius "Universal Animation Library [Standard]"  (locomotion, swim, jump, attack, hit, interact)
//   * KayKit "Character Animations 1.1" Rig_Medium          (dig, second hit reaction)
// Usage: npm i three  &&  node tools/retarget_ual.js <UAL1_Standard.glb> <KayKit .../Animations/gltf/Rig_Medium dir> [out.json]  -> also writes emotes.json next to it
// Method: all rigs are T-posed and face +Z, so each bone gets  Q_world_target(t) = (Q_src(t) * Q_src_rest^-1) * (align * Q_target_rest),
// where `align` swings the target bone's rest direction onto the source's (fixes small rest-pose differences). Bones with no source
// counterpart follow their parent at rest. Hip bob is scaled by leg length so the feet stay planted.
const fs=require('fs'),path=require('path');
let T;try{T=require('three')}catch(e){T=require(process.env.THREE_PATH||'/tmp/an/node_modules/three/build/three.cjs')}
const UAL=process.argv[2],KAY=process.argv[3],OUT=process.argv[4]||path.join(__dirname,'..','assets','anims.json'),EOUT=path.join(path.dirname(OUT),'emotes.json'),CHAR=path.join(__dirname,'..','assets','char.glb');
function glb(f){const b=fs.readFileSync(f),jl=b.readUInt32LE(12);return {j:JSON.parse(b.slice(20,20+jl).toString()),bin:b.slice(20+jl+8)}}
function acc(G,i){const a=G.j.accessors[i],bv=G.j.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3,VEC4:4}[a.type],st=bv.byteStride||n*4,o=(bv.byteOffset||0)+(a.byteOffset||0),d=new Float32Array(a.count*n);for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)d[k*n+c]=G.bin.readFloatLE(o+k*st+c*4);return {d,n}}
function rig(G){const N=G.j.nodes.map((n,i)=>({i,name:n.name,t:new T.Vector3(...(n.translation||[0,0,0])),q:new T.Quaternion(...(n.rotation||[0,0,0,1])),s:new T.Vector3(...(n.scale||[1,1,1])),ch:n.children||[],par:-1}));N.forEach(n=>n.ch.forEach(c=>N[c].par=n.i));const by={};N.forEach(n=>by[n.name]=n);
  const world=pose=>{const W=new Array(N.length);const go=(i,pm)=>{const n=N[i],p=pose&&pose[n.name]||{};const m=pm.clone().multiply(new T.Matrix4().compose(p.t||n.t,p.q||n.q,n.s));W[i]=m;n.ch.forEach(c=>go(c,m))};G.j.scenes[0].nodes.forEach(r=>go(r,new T.Matrix4()));return W};return {N,by,world}}
const wq=m=>{const q=new T.Quaternion();m.decompose(new T.Vector3(),q,new T.Vector3());return q}, wp=m=>new T.Vector3().setFromMatrixPosition(m);
const C=glb(CHAR),CR=rig(C),Wtr=CR.world(null),r=(v,d)=>+v.toFixed(d);
// ---- bone maps: [target bone, source bone, [target child, source child] used to align rest directions | null]
const sides=f=>[['Left','l'],['Right','r']].flatMap(([S,s])=>f(S,s));
const UAL_MAP=[['Hips','pelvis',['Spine','spine_01']],['Spine','spine_01',['Chest','spine_02']],['Chest','spine_02',['UpperChest','spine_03']],['UpperChest','spine_03',['Neck','neck_01']],['Neck','neck_01',['Head','Head']],['Head','Head',null],
  ...sides((S,s)=>[[S+'Shoulder','clavicle_'+s,[S+'Arm','upperarm_'+s]],[S+'Arm','upperarm_'+s,[S+'ForeArm','lowerarm_'+s]],[S+'ForeArm','lowerarm_'+s,[S+'Hand','hand_'+s]],[S+'Hand','hand_'+s,[S+'HandIndex1','index_01_'+s]],
    [S+'HandIndex1','index_01_'+s,[S+'HandIndex2','index_02_'+s]],[S+'HandIndex2','index_02_'+s,[S+'HandIndex3','index_03_'+s]],[S+'HandIndex3','index_03_'+s,[S+'HandIndex3_end','index_04_leaf_'+s]],
    [S+'HandThumb1','thumb_01_'+s,[S+'HandThumb2','thumb_02_'+s]],[S+'HandThumb2','thumb_02_'+s,[S+'HandThumb2_end','thumb_03_'+s]],
    [S+'UpLeg','thigh_'+s,[S+'Leg','calf_'+s]],[S+'Leg','calf_'+s,[S+'Foot','foot_'+s]],[S+'Foot','foot_'+s,[S+'Toes','ball_'+s]],[S+'Toes','ball_'+s,[S+'Toes_end','ball_leaf_'+s]]])];
const KAY_MAP=[['Hips','hips',['Spine','spine']],['Spine','spine',['Chest','chest']],['Chest','chest',['Head','head']],['Head','head',null],
  ...sides((S,s)=>[[S+'Arm','upperarm.'+s,[S+'ForeArm','lowerarm.'+s]],[S+'ForeArm','lowerarm.'+s,[S+'Hand','hand.'+s]],[S+'Hand','hand.'+s,null],
    [S+'UpLeg','upperleg.'+s,[S+'Leg','lowerleg.'+s]],[S+'Leg','lowerleg.'+s,[S+'Foot','foot.'+s]],[S+'Foot','foot.'+s,[S+'Toes','toes.'+s]],[S+'Toes','toes.'+s,null]])];
const DRIVEN=UAL_MAP.map(m=>m[0]);
const isUpper=n=>!/Hips|UpLeg|Leg$|Foot|Toes/.test(n);
// ---- clips: name -> {src animation name, from/to seconds, upper:true = upper body only, file (KayKit pack file)}
const UAL_CLIPS={idle:{src:'Idle_Loop'},walk:{src:'Walk_Loop'},jog:{src:'Jog_Fwd_Loop'},sprint:{src:'Sprint_Loop'},swim:{src:'Swim_Fwd_Loop'},tread:{src:'Swim_Idle_Loop'},
  jump:{src:'Jump_Start',from:.06,to:.7},fall:{src:'Jump_Loop'},land:{src:'Jump_Land',from:0,to:.6},smack:{src:'Sword_Attack',from:.2,to:.9,upper:true},hit:{src:'Hit_Chest'},interact:{src:'Interact',upper:true}}; // also available in the pack: Dance_Loop, Roll, Death01, Crouch_*, Sitting_*, Punch_*
const KAY_CLIPS={dig:{src:'Dig',file:'Rig_Medium_Tools.glb',from:0,to:2.4},hit2:{src:'Hit_B',file:'Rig_Medium_General.glb'}}; // also available: Waving, Cheering (Simulation), Fishing_*, Throw, PickUp, Death_*, Dodge_*
function bake(files,MAP,CLIPS,tag,legPair,FPS=24,dg=4){
  const out=[],report={};
  for(const [name,cfg] of Object.entries(CLIPS)){
    const S=files[cfg.file||''],SR=rig(S),Wsr=SR.world(null);
    const restS={},restT={},align={};
    for(const [t,s,dir] of MAP){restS[t]=wq(Wsr[SR.by[s].i]);restT[t]=wq(Wtr[CR.by[t].i]);align[t]=new T.Quaternion();
      if(dir){const dt=wp(Wtr[CR.by[dir[0]].i]).sub(wp(Wtr[CR.by[t].i])).normalize(),ds=wp(Wsr[SR.by[dir[1]].i]).sub(wp(Wsr[SR.by[s].i])).normalize();align[t].setFromUnitVectors(dt,ds)}}
    const legT=wp(Wtr[CR.by[legPair[0]].i]).y-wp(Wtr[CR.by.LeftFoot.i]).y,legS=wp(Wsr[SR.by[legPair[1]].i]).y-wp(Wsr[SR.by[legPair[2]].i]).y,RATIO=legT/legS;
    const rootQ=wq(Wtr[CR.by.Root.i]),rootS=CR.by.Root.s.x,hipsRest=CR.by.HipsCtrl.t.clone(),pelvisRest=wp(Wsr[SR.by[MAP[0][1]].i]);
    const mapped=new Set(MAP.map(m=>m[0])),restLocalQ=n=>CR.by[n].q;
    const a=S.j.animations.find(x=>x.name===cfg.src);if(!a)throw new Error('missing '+cfg.src);
    const full=Math.max(...a.samplers.map(s=>S.j.accessors[s.input].max[0])),t0=cfg.from||0,t1=Math.min(cfg.to||full,full),dur=t1-t0,n=Math.max(2,Math.round(dur*FPS)+1);
    const smp=(bn,pth,time)=>{const ch=a.channels.find(c=>S.j.nodes[c.target.node].name===bn&&c.target.path===pth);if(!ch)return null;const sm=a.samplers[ch.sampler],ts=acc(S,sm.input).d,vs=acc(S,sm.output);let k=0;while(k<ts.length-2&&ts[k+1]<=time)k++;const k2=Math.min(k+1,ts.length-1),f=k2===k?0:Math.min(1,Math.max(0,(time-ts[k])/(ts[k2]-ts[k])));
      return pth==='rotation'?new T.Quaternion(...vs.d.slice(k*4,k*4+4)).slerp(new T.Quaternion(...vs.d.slice(k2*4,k2*4+4)),f):new T.Vector3(...vs.d.slice(k*3,k*3+3)).lerp(new T.Vector3(...vs.d.slice(k2*3,k2*3+3)),f)};
    const times=[],Q={},P=[],prev={};let errMax=0,errSum=0,errN=0;
    for(let f=0;f<n;f++){const t=Math.min(t1,t0+dur*f/(n-1));times.push(r(t-t0,4));
      const pose={};for(const ch of a.channels){const bn=S.j.nodes[ch.target.node].name;pose[bn]=pose[bn]||{};const v=smp(bn,ch.target.path,Math.min(t,full-1e-4));if(ch.target.path==='rotation')pose[bn].q=v;else if(ch.target.path==='translation')pose[bn].t=v}
      const W=SR.world(pose),wt={};
      const tw=name=>{if(wt[name])return wt[name];const m=MAP.find(x=>x[0]===name);let Qt;
        if(m){const Qs=wq(W[SR.by[m[1]].i]);Qt=Qs.clone().multiply(restS[name].clone().invert()).multiply(align[name].clone().multiply(restT[name]))}
        else{const p=CR.N[CR.by[name].par];Qt=p?tw(p.name).clone().multiply(restLocalQ(name)):wq(Wtr[CR.by[name].i])} // unmapped: rides on its parent
        return wt[name]=Qt};
      for(const [tn] of MAP){const Qt=tw(tn),pn=CR.N[CR.by[tn].par].name;let lq=tw(pn).clone().invert().multiply(Qt).normalize();if(prev[tn]&&prev[tn].dot(lq)<0)lq.set(-lq.x,-lq.y,-lq.z,-lq.w);prev[tn]=lq;(Q[tn]=Q[tn]||[]).push(lq)}
      const pel=wp(W[SR.by[MAP[0][1]].i]).sub(pelvisRest).multiplyScalar(RATIO).applyQuaternion(rootQ.clone().invert()).multiplyScalar(1/rootS),Pf=hipsRest.clone().add(pel);
      const pose2={};for(const tn in Q)pose2[tn]={q:Q[tn][Q[tn].length-1]};pose2.HipsCtrl={t:Pf};let W2=CR.world(pose2);
      if(cfg.floor&&SKIN){ // lying/sitting/plank poses: skin the real character mesh for this frame and put its lowest vertex on the floor (y=0 is where the avatar's feet stand)
        const minY=SKIN.lowest(W2);if(minY<1e8){Pf.add(new T.Vector3(0,-(minY-.01),0).applyQuaternion(rootQ.clone().invert()).multiplyScalar(1/rootS));pose2.HipsCtrl={t:Pf};W2=CR.world(pose2)}}
      P.push(Pf); // check: FK the result and compare limb directions with the source
      for(const [tn,sn,dir] of MAP){if(!dir)continue;const dT=wp(W2[CR.by[dir[0]].i]).sub(wp(W2[CR.by[tn].i])).normalize(),dS=wp(W[SR.by[dir[1]].i]).sub(wp(W[SR.by[sn].i])).normalize();const e=Math.acos(Math.max(-1,Math.min(1,dT.dot(dS))))*180/Math.PI;errMax=Math.max(errMax,e);errSum+=e;errN++}}
    const tracks=[];
    for(const tn in Q){if(cfg.upper&&!isUpper(tn))continue;tracks.push({name:tn+'.quaternion',type:'quaternion',times,values:Q[tn].flatMap(q=>[r(q.x,dg),r(q.y,dg),r(q.z,dg),r(q.w,dg)])})}
    if(!cfg.upper)for(const tn of DRIVEN)if(!Q[tn]) // bones the locomotion clips drive but this pack doesn't (KayKit has no fingers/shoulders/neck): pin them at rest so the idle clip can't leak into lying/plank poses
      tracks.push({name:tn+'.quaternion',type:'quaternion',times:[0,r(dur,4)],values:[0,1].flatMap(()=>CR.by[tn].q.toArray().map(x=>r(x,dg)))});
    if(!cfg.upper)tracks.push({name:'HipsCtrl.position',type:'vector',times,values:P.flatMap(p=>[r(p.x,dg+1),r(p.y,dg+1),r(p.z,dg+1)])});
    out.push({name,duration:r(dur,4),tracks,uuid:name});report[name]={pack:tag,dur:r(dur,2),frames:n,legRatio:r(RATIO,2),meanErr:r(errSum/errN,2),maxErr:r(errMax,1)}}
  return {out,report}}
// Real-mesh floor snapping: CPU-skin assets/char.glb with the glTF rule  world = sum(weight * jointWorld * inverseBind) * vertex
function accAny(G,i){const a=G.j.accessors[i],bv=G.j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],sz={5126:4,5125:4,5123:2,5121:1}[a.componentType],st=bv.byteStride||n*sz,o=(bv.byteOffset||0)+(a.byteOffset||0),d=new Float32Array(a.count*n);
  const rd=(p)=>a.componentType===5126?G.bin.readFloatLE(p):a.componentType===5125?G.bin.readUInt32LE(p):a.componentType===5123?G.bin.readUInt16LE(p)/(a.normalized?65535:1):G.bin.readUInt8(p)/(a.normalized?255:1);
  for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)d[k*n+c]=rd(o+k*st+c*sz);return {d,n,count:a.count}}
let SKIN=null;
(function initSkin(){
  const j=C.j,node=j.nodes.find(n=>n.mesh!==undefined&&n.skin!==undefined);if(!node){console.warn('no skinned mesh: floor snapping skipped');return}
  const sk=j.skins[node.skin],ibm=accAny(C,sk.inverseBindMatrices).d,V=[];
  for(const p of j.meshes[node.mesh].primitives){const P=accAny(C,p.attributes.POSITION).d,J=accAny(C,p.attributes.JOINTS_0).d,Wt=accAny(C,p.attributes.WEIGHTS_0).d;for(let i=0;i<P.length/3;i++)V.push([P[i*3],P[i*3+1],P[i*3+2],J.slice(i*4,i*4+4),Wt.slice(i*4,i*4+4)])}
  const IB=sk.joints.map((_,k)=>new T.Matrix4().fromArray(ibm,k*16));
  SKIN={lowest(W){const M=sk.joints.map((jn,k)=>W[jn].clone().multiply(IB[k]).elements);let mn=1e9;
    for(const [x,y,z,J,Wt] of V){let ws=0,yy=0;for(let k=0;k<4;k++){const w=Wt[k];if(!w)continue;const e=M[J[k]];yy+=w*(e[1]*x+e[5]*y+e[9]*z+e[13]);ws+=w}if(ws>.5&&Number.isFinite(yy)&&yy<mn)mn=yy}return mn}}})();
(async()=>{
const ual=bake({'':glb(UAL)},UAL_MAP,UAL_CLIPS,'UAL',['Hips','pelvis','foot_l']);
let all=ual.out,rep=ual.report;
if(KAY){const files={};for(const c of Object.values(KAY_CLIPS))if(!files[c.file])files[c.file]=glb(path.join(KAY,c.file));
  const k=bake(files,KAY_MAP,KAY_CLIPS,'KayKit',['LeftUpLeg','upperleg.l','foot.l']);all=all.concat(k.out);Object.assign(rep,k.report)}
fs.writeFileSync(OUT,JSON.stringify(all));console.log('wrote',OUT,(fs.statSync(OUT).size/1024).toFixed(0)+' KB');console.table(rep);
// ---- emotes (assets/emotes.json, loaded lazily by the game): kind once = plays once; loop = holds until you move; clamp = holds the last frame until you move.
// `in` = intro clip played once before a looping/clamped one. u:/k: = UAL / KayKit source clip (k: needs the pack file).
const SIM='Rig_Medium_Simulation.glb',GEN='Rig_Medium_General.glb',TOOLS='Rig_Medium_Tools.glb',MEL='Rig_Medium_CombatMelee.glb',RNG='Rig_Medium_CombatRanged.glb',ADV='Rig_Medium_MovementAdvanced.glb',SPE='Rig_Medium_Special.glb';
const E=(cat,id,emoji,label,kind,src,extra={})=>({cat,id,emoji,label,kind,src,...extra}); // extra.hidden: baked but not shown in the emote menu (used by activities, e.g. fishing)
const EMOTES=[
  E('Social','wave','👋','Wave','once',['k','Waving',SIM]),E('Social','cheer','🎉','Cheer','once',['k','Cheering',SIM]),E('Social','dance','💃','Dance','loop',['u','Dance_Loop']),
  E('Social','talk','💬','Talk','loop',['u','Idle_Talking_Loop']),E('Social','taunt','😈','Taunt','once',['k','Skeletons_Taunt',SPE]),E('Social','taunt2','🤪','Big taunt','once',['k','Skeletons_Taunt_Longer',SPE]),
  E('Social','popup','🌟','Pop up','once',['k','Spawn_Ground',GEN]),
  E('Chill','sit','🧘','Sit','loop',['k','Sit_Floor_Idle',SIM],{in:['k','Sit_Floor_Down',SIM]}),E('Chill','lie','🛌','Lie down','loop',['k','Lie_Idle',SIM],{in:['k','Lie_Down',SIM]}),
  E('Chill','crouch','🥷','Crouch','loop',['u','Crouch_Idle_Loop']),E('Chill','playdead','💀','Play dead','clamp',['u','Death01']),E('Chill','faint','😵','Faint','clamp',['k','Death_B',GEN]),
  E('Fishing','fish_cast','🎣','Cast','once',['k','Fishing_Cast',TOOLS],{hidden:true}),E('Fishing','fish_idle','🎣','Wait','loop',['k','Fishing_Idle',TOOLS],{hidden:true}),E('Fishing','fish_bite','🎣','Bite','loop',['k','Fishing_Bite',TOOLS],{hidden:true}),E('Fishing','fish_reel','🎣','Reel','loop',['k','Fishing_Reeling',TOOLS],{hidden:true}),E('Fishing','fish_catch','🎣','Catch','once',['k','Fishing_Catch',TOOLS],{hidden:true}),
  E('Fitness','pushups','💪','Push-ups','loop',['k','Push_Ups',SIM]),E('Fitness','situps','🏋️','Sit-ups','loop',['k','Sit_Ups',SIM]),E('Fitness','roll','🌀','Roll','once',['u','Roll']),
  E('Fitness','flipf','🤸','Dodge forward','once',['k','Dodge_Forward',ADV]),E('Fitness','flipb','🔙','Dodge back','once',['k','Dodge_Backward',ADV]),
  E('Fight','jab','👊','Jab','once',['u','Punch_Jab']),E('Fight','cross','🥊','Cross punch','once',['u','Punch_Cross']),E('Fight','kick','🦵','Kick','once',['k','Melee_Unarmed_Attack_Kick',MEL]),
  E('Fight','block','🛡️','Block','once',['k','Melee_Block',MEL]),E('Fight','throw','🎯','Throw','once',['k','Throw',GEN])];
const FLOOR=new Set(['sit','lie','playdead','faint','pushups','situps']),ualE={},kayE={}; // FLOOR: body rests on the ground, so snap to it (intros included)
for(const e of EMOTES)for(const [key,srcDef] of [[e.id,e.src],[e.id+'_in',e.in]]){if(!srcDef)continue;const fl=FLOOR.has(e.id);(srcDef[0]==='u'?ualE:kayE)[key]=srcDef[0]==='u'?{src:srcDef[1],floor:fl}:{src:srcDef[1],file:srcDef[2],floor:fl}}
const eu=bake({'':glb(UAL)},UAL_MAP,ualE,'UAL',['Hips','pelvis','foot_l'],20,3);
const kf={};for(const c of Object.values(kayE))if(!kf[c.file])kf[c.file]=glb(path.join(KAY,c.file));
const ek=bake(kf,KAY_MAP,kayE,'KayKit',['LeftUpLeg','upperleg.l','foot.l'],20,3);
const byId={};for(const c of eu.out.concat(ek.out))byId[c.name]=c;
fs.writeFileSync(EOUT,JSON.stringify({menu:EMOTES.map(e=>({cat:e.cat,id:e.id,emoji:e.emoji,label:e.label,kind:e.kind,intro:!!e.in,hidden:!!e.hidden})),clips:Object.values(byId)}));
console.log('wrote',EOUT,(fs.statSync(EOUT).size/1024).toFixed(0)+' KB,',EMOTES.length,'emotes,',Object.keys(byId).length,'clips; worst limb error',Math.max(...Object.values({...eu.report,...ek.report}).map(x=>x.maxErr)),'deg');
})();
