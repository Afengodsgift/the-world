// FLY POSES: extracts looping body-space limb directions from a Mixamo flying animation (Mixamo "Superhero Flying", user-supplied FBX, not committed)
// and writes assets/flypose.json for src/character/FlightPose.js.
// Usage: node tools/extract_flypose.js <SuperHeroFlying_mixamo.fbx> [out.json]      (needs three@0.147.0: set THREE_DIR to its package dir)
// Method: FlightPose poses the avatar by aiming each limb segment along a direction in BODY space (+Y toward the head, +Z chest side, +X avatar's left),
// then pitching/banking the whole body procedurally. So for every frame we take each segment's world direction and express it in the hips' frame
// (undoing the clip's own forward lean), which makes the data independent of how the Mixamo clip is oriented. Loops are closed by cross-fading
// the last frames into the first. Windows were chosen by looking at the clip: cruise = arms-forward with gentle motion, boost = the calmest streamlined stretch.
const fs=require('fs'),path=require('path');
const NM=process.env.THREE_DIR||'/tmp/nm/node_modules/three';
global.THREE=require(NM+'/build/three.cjs');global.document={createElement:()=>({getContext:()=>({}),style:{}})};global.self=global;
(0,eval)(fs.readFileSync(NM+'/examples/js/libs/fflate.min.js','utf8'));(0,eval)(fs.readFileSync(NM+'/examples/js/loaders/FBXLoader.js','utf8'));
const SRC=process.argv[2],OUT=process.argv[3]||path.join(__dirname,'..','assets','flypose.json');
const buf=fs.readFileSync(SRC),obj=new THREE.FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');
const clip=obj.animations[0],mixer=new THREE.AnimationMixer(obj);mixer.clipAction(clip).play();
const MX={Spine:'Spine',Chest:'Spine1',UpperChest:'Spine2',Neck:'Neck',Head:'Head',LeftArm:'LeftArm',LeftForeArm:'LeftForeArm',LeftHand:'LeftHand',RightArm:'RightArm',RightForeArm:'RightForeArm',RightHand:'RightHand',
  LeftUpLeg:'LeftUpLeg',LeftLeg:'LeftLeg',LeftFoot:'LeftFoot',LeftToes:'LeftToeBase',RightUpLeg:'RightUpLeg',RightLeg:'RightLeg',RightFoot:'RightFoot',RightToes:'RightToeBase'};
const B={};for(const k in MX)B[k]=obj.getObjectByName('mixamorig'+MX[k]);const hips=obj.getObjectByName('mixamorigHips'),headTop=obj.getObjectByName('mixamorigHeadTop_End');
// the segments FlightPose aims (a -> b), in this order
const SEGS=[['Spine','Chest'],['Chest','UpperChest'],['UpperChest','Neck'],['LeftArm','LeftForeArm'],['LeftForeArm','LeftHand'],['RightArm','RightForeArm'],['RightForeArm','RightHand'],
  ['LeftUpLeg','LeftLeg'],['LeftLeg','LeftFoot'],['LeftFoot','LeftToes'],['RightUpLeg','RightLeg'],['RightLeg','RightFoot'],['RightFoot','RightToes']];
mixer.setTime(0);obj.updateMatrixWorld(true);
// rest orientation of the hips: take it from the bind pose = the node's own default transform
const rest=new THREE.Quaternion();{const m=new THREE.Quaternion();hips.getWorldQuaternion(m)}
// the clip's frame 0 is a T-pose-ish start (body upright, see inspection): use the true rest of the FBX nodes instead
const restQ=(()=>{const o2=new THREE.FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');o2.updateMatrixWorld(true);const q=new THREE.Quaternion();o2.getObjectByName('mixamorigHips').getWorldQuaternion(q);return q})();
const P=o=>{const v=new THREE.Vector3();o.getWorldPosition(v);return v};
function frame(t){mixer.setTime(t);obj.updateMatrixWorld(true);
  const qh=new THREE.Quaternion();hips.getWorldQuaternion(qh);const qd=qh.clone().multiply(restQ.clone().invert()),inv=qd.clone().invert();   // hips rotation relative to rest
  const out=[];for(const [a,b] of SEGS){const d=P(B[b]).sub(P(B[a])).normalize().applyQuaternion(inv);out.push(d.x,d.y,d.z)}
  const hd=P(headTop).sub(P(B.Head)).normalize().applyQuaternion(inv);return {v:out,head:Math.atan2(hd.z,hd.y)}}
function bake(t0,t1,FPS,loopBlend){const n=Math.round((t1-t0)*FPS),fr=[];for(let i=0;i<n;i++)fr.push(frame(t0+i/FPS));
  // close the loop: cross-fade the last K frames toward the source frames that came just BEFORE the loop's start, so the wrap (last -> frame 0) is as smooth as any other step
  const K=Math.min(loopBlend,Math.floor(n/3),Math.floor(t0*FPS));for(let k=0;k<K;k++){const w=(k+1)/(K+1),a=fr[n-K+k],b=frame(t0-(K-k)/FPS);for(let j=0;j<a.v.length;j+=3){const v=new THREE.Vector3(a.v[j],a.v[j+1],a.v[j+2]).lerp(new THREE.Vector3(b.v[j],b.v[j+1],b.v[j+2]),w).normalize();a.v[j]=v.x;a.v[j+1]=v.y;a.v[j+2]=v.z}a.head=a.head*(1-w)+b.head*w}
  const head=fr.reduce((s,f)=>s+f.head,0)/n;return {fps:FPS,frames:n,head:+head.toFixed(3),data:fr.flatMap(f=>f.v.map(x=>+x.toFixed(3)))}}
const WIN=JSON.parse(process.env.WIN||'{"cruise":[19.0,23.4],"boost":[12.0,15.4]}');
const res={segs:SEGS.map(s=>s.join('>')),clips:{}};for(const k in WIN)res.clips[k]=bake(WIN[k][0],WIN[k][1],20,8);
fs.writeFileSync(OUT,JSON.stringify(res));console.log('wrote',OUT,(fs.statSync(OUT).size/1024).toFixed(1)+' KB');
// report: average direction of the main segments per clip, to sanity-check axes against FlightPose's hand-written tables
for(const k in res.clips){const c=res.clips[k],avg=SEGS.map((s,i)=>{const v=new THREE.Vector3();for(let f=0;f<c.frames;f++)v.add(new THREE.Vector3(c.data[f*39+i*3],c.data[f*39+i*3+1],c.data[f*39+i*3+2]));return v.divideScalar(c.frames).normalize()});
  console.log('--',k,'frames',c.frames,'head pitch',c.head);SEGS.forEach((s,i)=>console.log('  ',s.join('>').padEnd(24),avg[i].toArray().map(x=>x.toFixed(2)).join(', ')))}
