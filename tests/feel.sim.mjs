// Regression test for movement + camera FEEL (Phase 1): acceleration curves, frame-rate independence, teleport reset, flight carry,
// camera obstruction (spring arm), landing dip, eased look, sprint FOV.
// Run: NODE_PATH=<dir>/node_modules node tests/feel.sim.mjs  (part of tests/run_all.sh)
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));
if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);
globalThis.THREE=T;
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');let bad=0;
const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
(0,eval)(R('src/input/Locomotion.js').replace('const Locomotion=','globalThis.Locomotion='));
const speed=S=>Math.hypot(S.gvx||0,S.gvz||0);
const run=(mode,target,secs,hz,S0)=>{const S=S0||{x:0,z:0},dt=1/hz;for(let i=0;i<Math.round(secs*hz);i++)Locomotion.move(S,target,0,dt,mode);return S};

// ---- locomotion ----
{const a=run('ground',6,.1,60);ok(speed(a)>6*.25&&speed(a)<6*.8,'ground: 0.1 s in, speed is building ('+speed(a).toFixed(2)+' of 6), not instant');
 const b=run('ground',6,.4,60);ok(speed(b)>6*.9,'ground: reaches >90% by 0.4 s ('+speed(b).toFixed(2)+')');
 const S={x:0,z:0,gvx:6,gvz:0,_lx:0,_lz:0};let rev=false;for(let i=0;i<30;i++){Locomotion.move(S,0,0,1/60,'ground');if(S.gvx<0)rev=true}
 ok(speed(S)<.6&&!rev,'ground: stops within 0.5 s with no reverse overshoot ('+speed(S).toFixed(2)+')');
 const slide=(()=>{const P={x:0,z:0,gvx:6,gvz:0,_lx:0,_lz:0};const x0=P.x;for(let i=0;i<60;i++)Locomotion.move(P,0,0,1/60,'ground');return P.x-x0})();
 ok(slide>.2&&slide<1.2,'ground: stopping slide is small but present ('+slide.toFixed(2)+' m)');
 const d60=run('ground',9,1,60).x,d20=run('ground',9,1,20).x;ok(Math.abs(d60-d20)/d60<.06,'frame-rate independent: 1 s distance at 60 Hz vs 20 Hz within 6% ('+d60.toFixed(2)+' vs '+d20.toFixed(2)+')');
 const sw=run('swim',9,.3,60),gr=run('ground',9,.3,60);ok(speed(sw)<speed(gr)*.75,'swim builds up slower than ground');
 const air=run('air',0,.5,60,{x:0,z:0,gvx:8,gvz:0,_lx:0,_lz:0});ok(speed(air)>8*.25,'air: a running jump keeps momentum ('+speed(air).toFixed(2)+' after 0.5 s)');
 const tp={x:0,z:0,gvx:10,gvz:0,_lx:0,_lz:0};tp.x=500;Locomotion.move(tp,0,0,1/60,'ground');ok(Math.abs(tp.x-500)<.01,'teleport resets velocity (no slide after travel)');
 const col={x:0,z:0,gvx:10,gvz:0,_lx:0,_lz:0};col.x=1.2;Locomotion.move(col,10,0,1/60,'ground');ok(speed(col)>9,'small collision push is NOT treated as a teleport');
 const fc={x:0,z:0,fvx:70,fvz:0};Locomotion.carry(fc);ok(Math.abs(speed(fc)-24)<.01&&fc._lx===0,'flight->ground carry is capped at 24 m/s');
 const fc2={x:0,z:0,fvx:12,fvz:5};Locomotion.carry(fc2);ok(Math.abs(fc2.gvx-12)<1e-9,'flight->ground carry keeps slow velocities exactly');}

// ---- camera ----
globalThis.H=()=>0;globalThis.sstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
globalThis.solids=[];globalThis.camera=new T.PerspectiveCamera(65,2,.1,4200);globalThis.me=new T.Group();me.userData={};
globalThis.S={x:0,y:0,z:0,yaw:0,pitch:.4,flying:false,grounded:true,gboost:0,vy:0,rot:0};
(0,eval)(R('src/camera/CameraRig.js').replace('const CameraRig=','globalThis.CameraRig='));
const step=(secs,fn)=>{const n=Math.round(secs*60);for(let i=0;i<n;i++){fn&&fn(i);CameraRig.update(1/60);camera.updateMatrixWorld(true)}};
step(2);const dFree=camera.position.distanceTo(new T.Vector3(S.x,S.y+1.4,S.z));ok(dFree>8&&dFree<10,'free orbit: ~9 m behind the character ('+dFree.toFixed(2)+')');
// wall (house-sized solid) right behind the camera: yaw 0 puts the camera on +z
solids.push({x:0,z:7,r:3});step(1.5);
{const c=camera.position,dx=c.x-7*0,dz=c.z-7,dist=Math.hypot(dx,dz);ok(dist>=3+.2||c.z<4,'obstructed: camera is not inside the solid (dist to centre '+dist.toFixed(2)+', z '+c.z.toFixed(2)+')');
 ok(c.distanceTo(new T.Vector3(S.x,S.y+1.4,S.z))<dFree-2,'obstructed: arm shortened ('+c.distanceTo(new T.Vector3(S.x,S.y+1.4,S.z)).toFixed(2)+' m)');}
solids.length=0;step(.05);const near=camera.position.distanceTo(new T.Vector3(0,1.4,0));step(2.5);const back=camera.position.distanceTo(new T.Vector3(0,1.4,0));
ok(back>near&&back>dFree-.6,'obstruction cleared: arm eases back out ('+near.toFixed(2)+' -> '+back.toFixed(2)+')');
solids.push({x:0,z:7,r:.4});step(2);ok(camera.position.distanceTo(new T.Vector3(0,1.4,0))>dFree-.4,'thin trunk (r<1) is ignored: no camera jitter through forests');solids.length=0;step(2);
// floor: camera never goes below ground+0.55 even with extreme low pitch
S.pitch=.05;step(2);ok(camera.position.y>=.7,'camera stays above the ground ('+camera.position.y.toFixed(2)+')');S.pitch=.4;step(2);
// landing dip
const y0=camera.position.y;CameraRig.land(16);let minY=1e9;step(.6,()=>{minY=Math.min(minY,camera.position.y)});step(1.5);
ok(y0-minY>.05&&y0-minY<.6,'landing dip: view drops then recovers (dip '+(y0-minY).toFixed(2)+' m)');ok(Math.abs(camera.position.y-y0)<.03,'landing dip fully recovers');
CameraRig.land(3);let m2=1e9;step(.4,()=>{m2=Math.min(m2,camera.position.y)});ok(y0-m2<.02,'tiny hops cause no dip');
// eased look
S.yaw=1;step(1/60);const q=new T.Vector3();camera.getWorldDirection(q);const ang1=Math.atan2(-q.x,-q.z);ok(ang1>.05&&ang1<.6,'eased look: one frame after a 1 rad drag the camera is partway ('+ang1.toFixed(2)+')');
step(.6);camera.getWorldDirection(q);ok(Math.abs(Math.atan2(-q.x,-q.z)-1)<.03,'eased look: settles on the aim within 0.6 s');
// sprint FOV
S.yaw=0;S.x=0;step(1);const f0=camera.fov;for(let i=0;i<120;i++){S.z-=12/60;CameraRig.update(1/60)}ok(camera.fov>f0+2&&camera.fov<f0+5.5,'sprint widens FOV a little ('+f0.toFixed(1)+' -> '+camera.fov.toFixed(1)+')');
console.log(bad?bad+' FAIL':'all feel checks passed');process.exit(bad?1:0);
