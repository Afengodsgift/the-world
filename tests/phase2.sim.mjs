// Regression test for Phase 2 (animation feel): overlay blend envelope (no pops), remote-player prediction, lean direction.
// Run: NODE_PATH=<dir>/node_modules node tests/phase2.sim.mjs  (part of tests/run_all.sh)
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));
if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');let bad=0;
const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
(0,eval)(R('src/character/Blend.js').replace('const Blend=','globalThis.Blend='));
(0,eval)(R('src/core/RemoteSmooth.js').replace('const RemoteSmooth=','globalThis.RemoteSmooth='));

// ---------- 1. blend pops, measured on a real AnimationMixer ----------
// base clip = loco layer (output y=0), overlay clip = reaction (output y=10). Output y/10 is the overlay's visible share.
const mkClips=()=>[new T.AnimationClip('base',1,[new T.VectorKeyframeTrack('.position',[0,1],[0,0,0,0,0,0])]),new T.AnimationClip('over',1,[new T.VectorKeyframeTrack('.position',[0,1],[0,10,0,0,10,0])])];
function runOld(fi,fo,W,hold){const o=new T.Object3D(),m=new T.AnimationMixer(o),[bc,oc]=mkClips(),b=m.clipAction(bc),a=m.clipAction(oc);b.play();a.setLoop(T.LoopRepeat);
  a.reset();a.setEffectiveWeight(W);a.fadeIn(fi).play();const ys=[];let t=0,out=false;
  for(let i=0;i<Math.round((hold+.5)*60);i++){if(!out&&t>=hold){a.fadeOut(fo);out=true}m.update(1/60);t+=1/60;ys.push(o.position.y/10)}return ys}
function runNew(fi,W,hold,fo){const o=new T.Object3D(),m=new T.AnimationMixer(o),[bc,oc]=mkClips(),b=m.clipAction(bc),a=m.clipAction(oc);b.play();
  a.reset();a.setEffectiveWeight(.0001);a.play();const smax=W/(W+1),ys=[];let left=hold+fo,age=0;
  for(let i=0;i<Math.round((hold+fo+.3)*60);i++){left-=1/60;age+=1/60;if(left>0)a.setEffectiveWeight(Blend.w(smax*Math.min(Blend.ease(age/fi),Blend.ease(left/fo)))||.0001);else a.enabled=false;m.update(1/60);ys.push(o.position.y/10)}return ys}
const maxStep=(ys,from,to)=>{let mx=0;for(let i=Math.max(1,from);i<Math.min(ys.length,to);i++)mx=Math.max(mx,Math.abs(ys[i]-ys[i-1]));return mx};
{const old=runOld(.15,.2,300,.8),neu=runNew(.2,300,.5,.25);  // emote-hold style: weight 300, 0.2 s in / 0.25 s out (same as the game)
 const oS=maxStep(old,0,old.length),nS=maxStep(neu,0,neu.length);
 ok(oS>.5,'OLD emote blend pops: biggest single-frame jump in visible pose = '+(oS*100|0)+'% (measured)');
 ok(nS<.14,'NEW emote blend is smooth: biggest single-frame jump = '+(nS*100|0)+'%');}
{const old=runOld(.02,.12,24,.5),neu=runNew(.05,24,.35,.2);  // hit-reaction style
 const oEnd=maxStep(old,Math.round(.5*60),old.length),nEnd=maxStep(neu,Math.round(.3*60),neu.length);
 ok(oEnd>.4,'OLD hit reaction ends with a pop: '+(oEnd*100|0)+'% jump in one frame');
 ok(nEnd<.12,'NEW hit reaction eases out: biggest jump '+(nEnd*100|0)+'%');
 const peak=Math.max(...neu);ok(peak>.9&&peak<=.97,'NEW hit reaction still dominates the pose at its peak ('+(peak*100|0)+'%)');
 ok(Math.abs(neu[neu.length-1])<1e-3,'NEW hit reaction returns fully to the base layer');}
ok(Blend.w(.5)===1&&Blend.w(0)===0&&Blend.w(1)>300,'Blend.w maps share->weight (0.5 -> 1, 0 -> 0, ~1 capped)');

// ---------- 2. remote players ----------
function simRemote(mode,{speed=8,jitter=.02,stopAt=null,secs=4}={}){
  let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const o={group:{position:new T.Vector3(0,0,0)},st:'run'},H=()=>0;
  const truth=t=>({x:stopAt!==null&&t>stopAt?speed*stopAt:speed*t,y:0,z:0});
  let nextSnap=0,t=0,pos=0,posPrev=0,err=[],steps=[],over=0;
  const pkts=[];for(let s=0;s<secs*10;s++){const send=s*.1,arr=send+.03+rnd()*jitter*2;pkts.push({send,arr})}
  let pi=0;o.tx=0;o.ty=0;o.tz=0;
  for(let f=0;f<secs*60;f++){t=f/60;
    while(pi<pkts.length&&pkts[pi].arr<=t){const tr=truth(pkts[pi].send);if(mode==='new')RemoteSmooth.snap(o,{x:tr.x,y:0,z:0,r:0},pkts[pi].arr*1000);else{o.tx=tr.x;o.ty=0;o.tz=0}pi++}
    if(mode==='new')RemoteSmooth.target(o,t*1000,H);
    const k=1-Math.exp(-(mode==='new'?20:12)/60);pos+=(o.tx-pos)*k;
    if(t>.6){err.push(Math.abs(pos-truth(t).x));steps.push(pos-posPrev)}
    if(stopAt!==null&&t>stopAt)over=Math.max(over,pos-truth(t).x);posPrev=pos}
  const mean=a=>a.reduce((x,y)=>x+y,0)/a.length,m=mean(steps),sd=Math.sqrt(mean(steps.map(s=>(s-m)**2)));
  return {lag:mean(err),jerk:sd/Math.max(m,1e-6),over};}
{const a=simRemote('old'),b=simRemote('new');
 ok(b.lag<a.lag*.5,'remote player position error vs truth: old '+a.lag.toFixed(2)+' m -> new '+b.lag.toFixed(2)+' m');
 ok(b.jerk<a.jerk,'remote movement smoothness (step variation): old '+a.jerk.toFixed(2)+' -> new '+b.jerk.toFixed(2));
 const s=simRemote('new',{stopAt:2});ok(s.over<1.2,'remote player stopping: overshoot stays under 1.2 m ('+s.over.toFixed(2)+')');}
{const o={group:{position:new T.Vector3()},st:'run'};RemoteSmooth.snap(o,{x:0,y:0,z:0,r:0},0);RemoteSmooth.snap(o,{x:500,y:0,z:0,r:0},100);
 ok(o.group.position.x===500&&!o.vx,'remote teleport/travel snaps (no long glide)');
 const f={group:{position:new T.Vector3()},st:'fall'};RemoteSmooth.snap(f,{x:0,y:3,z:0,r:0},0);RemoteSmooth.snap(f,{x:0,y:1,z:0,r:0},100);RemoteSmooth.target(f,200,()=>0);
 ok(f.ty>=0,'airborne remote never extrapolates below ground');
 const e={group:{position:new T.Vector3()},st:'idle'};RemoteSmooth.snap(e,{x:0,y:0,z:0,r:0},0);RemoteSmooth.target(e,100,()=>0);ok(e.tx===0,'first snapshot has no velocity (no phantom drift)');}

// ---------- 3. lean direction ----------
{const g=new T.Group(),mdl=new T.Group();g.add(mdl);g.rotation.y=0;g.updateMatrixWorld(true);
 const fw0=new T.Vector3(0,0,1).applyEuler(g.rotation);g.rotation.y=.05;g.updateMatrixWorld(true);const fw1=new T.Vector3(0,0,1).applyEuler(g.rotation);
 const left0=new T.Vector3(0,1,0).cross(fw0);  // left = up x forward
 ok(fw1.clone().sub(fw0).dot(left0)>0,'yaw rate > 0 means turning toward the character\'s LEFT');
 const yr=3,lz=-Math.max(-.14,Math.min(.14,yr*.035));mdl.rotation.set(0,0,lz);mdl.updateMatrixWorld(true);
 const head=new T.Vector3(0,1,0).applyMatrix4(mdl.matrixWorld).sub(new T.Vector3(0,0,0));
 ok(head.dot(left0)>0,'turning left banks the head toward the LEFT (into the turn)');
 mdl.rotation.set(.1,0,0);mdl.updateMatrixWorld(true);const hd=new T.Vector3(0,1,0).applyMatrix4(mdl.matrixWorld);ok(hd.z>0,'positive x-rotation leans the character FORWARD (+z facing)');}
console.log(bad?bad+' FAIL':'all phase 2 checks passed');process.exit(bad?1:0);
