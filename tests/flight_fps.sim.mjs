// Regression test for flight posing, the camera rig and the first-person viewmodel (real char.glb + real gun models).
// Run:  NODE_PATH=<dir containing three@0.147.0>/node_modules  node tests/flight_fps.sim.mjs   (also part of tests/run_all.sh)
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));
if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH to its node_modules');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);
const {GLTFLoader}=await import(pathToFileURL(path.join(nm,'three/examples/jsm/loaders/GLTFLoader.js')).href);
let bad=0;const ok=(c,m)=>{if(c)console.log('ok  '+m);else{console.log('FAIL '+m);bad++}};
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
// ---- minimal browser/world stubs ----
class DiskGLTFLoader extends GLTFLoader{load(u,ok,_p,err){try{const b=fs.readFileSync(path.join(ROOT,u));this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',ok,err)}catch(e){err&&err(e)}}} // the game fetches by URL; here we read from disk
globalThis.THREE={...T,GLTFLoader:DiskGLTFLoader};
const el=()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){},fillText(){},strokeText(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}}),style:{},appendChild(){},addEventListener(){}});
globalThis.document={createElement:el,head:el(),body:el(),getElementById:()=>el()};globalThis.$=()=>el();globalThis.window={innerWidth:390,innerHeight:844};globalThis.addEventListener=()=>{};
globalThis.localStorage={getItem(){return null},setItem(){}};
(0,eval)(R('src/data/islands.js').replace(/^const /gm,'var ')+';var K=2.5;');(0,eval)(R('src/utils/math.js').replace(/^const /gm,'var '));
const html=R('index.html'),grab=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);return html.slice(i,j)};
for(const n of ['_qa','_qb','_qm'])globalThis[n]=new T.Quaternion();for(const n of ['_v1','_v2'])globalThis[n]=new T.Vector3();
(0,eval)(grab('function aim(b,c,dir)','function pose(q,st,dt)').replace('function aim','globalThis.aim=function aim'));
globalThis.lerpAngle=(a,b,t)=>{let d=b-a;d=Math.atan2(Math.sin(d),Math.cos(d));return a+d*t};
globalThis.mulberry=globalThis.mulberry||(s=>{let a=s;return()=>{a=(a*16807)%2147483647;return a/2147483647}});globalThis.H=()=>2;globalThis.solids=[];globalThis.scene=new T.Scene();globalThis.camera=new T.PerspectiveCamera(65,390/844,.1,3000);
globalThis.S={x:0,y:2,z:0,yaw:0,pitch:.4,rot:0,flying:false,grounded:true,gboost:0,kx:0,kz:0,hurt:0,vy:0};globalThis.myId='A';globalThis.others=new Map();globalThis.chan={send(){}};
globalThis.banner=()=>{};globalThis.chime=()=>{};globalThis.WAudio={get:()=>null,resume:()=>null,out:()=>null};globalThis.panOn=false;globalThis.togglePan=()=>{};globalThis.Interaction={register(){}};globalThis.makeAvatar=()=>new T.Group();globalThis.dress=()=>{};globalThis.animate=()=>{};
globalThis.OUT={x:5000,z:5000,y:2,clear:1};
const load=async f=>{const b=fs.readFileSync(path.join(ROOT,f));return new Promise(r=>new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r))};
const gl=await load('assets/char.glb');const mdl=gl.scene;mdl.scale.setScalar(.5);globalThis.me=new T.Group();me.add(mdl);scene.add(me);
const bones={};mdl.traverse(o=>{if(o.isBone)bones[o.name]=o});me.userData={model:mdl,bones,oy:0};
for(const [n,f] of [['FlightPose','src/character/FlightPose.js'],['FlightFX','src/fx/FlightFX.js'],['CameraRig','src/camera/CameraRig.js'],['Viewmodel','src/combat/Viewmodel.js'],['OutlawArena','src/games/OutlawArena.js']])(0,eval)(R(f).replace('const '+n+'=','globalThis.'+n+'='));
(0,eval)(R('src/games/Outlaw.js').replace('const Outlaw=','globalThis.Outlaw='));Outlaw.build();

// ================= 1. FLIGHT POSE on the real skeleton =================
const P=n=>(bones[n]||mdl.getObjectByName(n)).getWorldPosition(new T.Vector3()),dirv=(a,b)=>P(b).sub(P(a)).normalize();
const ang=(u,v)=>Math.acos(Math.max(-1,Math.min(1,u.dot(v)))),deg=r=>r*180/Math.PI,UP=new T.Vector3(0,1,0),FWD=new T.Vector3(0,0,1);
const fq={model:mdl,bones,oy:0},fg=me;fg.userData=Object.assign(me.userData,fq);const q=me.userData;
let speed=0,t=0;const sim=(target,secs,acc=45,dec=32)=>{for(let i=0;i<60*secs;i++){const dt=1/60;speed+=Math.sign(target-speed)*Math.min(Math.abs(target-speed),(target>speed?acc:dec)*dt);t+=dt;me.position.set(0,10,t*0+me.position.z+speed*dt);me.updateMatrixWorld(true);q.fs=speed;FlightPose.apply(me,q,dt,'fly',{speed,yawRate:0});lastPitch.push(q.fl.th.x)}};
let lastPitch=[];
sim(0,1.5);me.updateMatrixWorld(true);
let lean=deg(ang(dirv('Hips','Neck'),UP)),elbowL=deg(ang(dirv('LeftArm','LeftForeArm'),dirv('LeftForeArm','LeftHand')));
ok(q.fl.name==='hover','hover state while stationary');ok(lean<15,`hover is upright (lean ${lean.toFixed(0)}° < 15°)`);ok(elbowL>15&&elbowL<70,`hover arms softly bent (elbow ${elbowL.toFixed(0)}°)`);
ok(P('LeftFoot').distanceTo(P('RightFoot'))<.4,'hover legs together');
lastPitch=[];sim(34,3);sim(34,1);me.updateMatrixWorld(true);
lean=deg(ang(dirv('Hips','Neck'),UP));
ok(q.fl.name==='cruise','cruise state at 34 m/s');ok(lean>65&&lean<88,`cruise body near-horizontal (lean ${lean.toFixed(0)}°)`);
ok(dirv('LeftArm','LeftHand').dot(FWD)>.9,'cruise: lead arm points along the flight line');
ok(deg(ang(dirv('RightArm','RightForeArm'),dirv('RightForeArm','RightHand')))>80,'cruise: rear arm folded (elbow > 80°)');
const hd=deg(ang(dirv('Head','Head_end'),UP));ok(hd>8&&hd<40,`cruise head lifted to look ahead (head axis ${hd.toFixed(0)}° from vertical)`);
const takeoffPeak=Math.max(...lastPitch.slice(0,200));ok(takeoffPeak>q.fl.th.x+.02,'takeoff pitch overshoots slightly (anticipation)');
const cruiseLean=lean;sim(75,2.5);me.updateMatrixWorld(true);lean=deg(ang(dirv('Hips','Neck'),UP));
ok(q.fl.name==='boost','boost state at 75 m/s');ok(lean>cruiseLean+2,`boost leans further than cruise (${lean.toFixed(0)}° > ${cruiseLean.toFixed(0)}°)`);
ok(dirv('LeftArm','LeftHand').dot(FWD)>.9&&dirv('RightArm','RightHand').dot(FWD)>.9,'boost: both arms driven forward');
lastPitch=[];sim(34,.8);ok(Math.min(...lastPitch)<q.fl.th.x+.5&&lastPitch.some(p=>p<1.2),'braking from boost relaxes the lean (flare back)');
sim(34,2);sim(0,3);ok(q.fl.name==='hover','back to hover after stopping');
let finite=true;for(const b of Object.values(bones))if(!b.quaternion.toArray().every(Number.isFinite))finite=false;ok(finite,'all bone rotations finite');
// leaving flight resets the body
FlightPose.apply(me,q,1/60,'idle',{speed:0});for(let i=0;i<90;i++)FlightPose.apply(me,q,1/60,'idle',{speed:0});ok(Math.abs(mdl.rotation.y)<1e-6&&!q.fl.on,'flight pose released ~1 s after landing');

// ================= 2. CAMERA RIG =================
const step=(n,fn)=>{for(let i=0;i<n;i++){const dt=1/60;fn&&fn(i);Outlaw.tick(dt,i*16);CameraRig.update(dt);camera.updateMatrixWorld(true)}};
const fwdY=()=>camera.getWorldDirection(new T.Vector3()).y;
S.flying=false;mdl.rotation.set(0,0,0);mdl.position.set(0,0,0);me.position.set(0,2,0);
step(60);ok(me.visible&&!CameraRig.isFPS(),'unarmed: third-person orbit, avatar visible');
Outlaw.equip(0);step(90);
ok(CameraRig.isFPS()&&!me.visible,'weapon out: first-person, own avatar hidden');
ok(Math.abs(camera.position.y-(S.y+1.64))<.05&&Math.hypot(camera.position.x,camera.position.z)<.05,'camera sits at eye height (1.64 m)');
S.pitch=-1.4;step(30);ok(fwdY()>.95,'can look straight up in first person');S.pitch=1.4;step(30);ok(fwdY()<-.95,'can look straight down');S.pitch=0;step(30);
const y0=fwdY();Outlaw.fire();let pk=0;for(let i=0;i<40;i++){step(1);pk=Math.max(pk,fwdY()-y0)}
ok(pk>.008&&pk<.06,`recoil kicks the view (${(pk*57.3).toFixed(1)}°)`);ok(Math.abs(fwdY()-y0)<.002,'view recovers after recoil');
// flight with the gun out: FOV rises with speed; eye follows the head
S.flying=true;S.y=30;
const fv=(sp,secs)=>{for(let i=0;i<60*secs;i++){const dt=1/60;S.z-=sp*dt;me.position.set(S.x,S.y,S.z);me.rotation.y=Math.PI;q.fs=sp;FlightPose.apply(me,q,dt,'fly',{speed:sp,yawRate:0});Outlaw.tick(dt,i*16);CameraRig.update(dt);camera.updateMatrixWorld(true)}};
fv(0,2);const f0=camera.fov;fv(34,3);const f1=camera.fov;const eye=camera.position.clone();me.updateMatrixWorld(true);const hb=P('Head');fv(70,3);const f2=camera.fov;
ok(f1>f0+8&&f2>f1+8,`FOV widens hover ${f0.toFixed(0)} → cruise ${f1.toFixed(0)} → boost ${f2.toFixed(0)}`);
ok(eye.distanceTo(hb)<.5,`eye follows the head in flight (${eye.distanceTo(hb).toFixed(2)} m from the head bone, no smoothing lag)`);
globalThis.__sea=false;S.flying=false;S.y=2;Outlaw.equip(0);step(90);ok(me.visible&&!CameraRig.isFPS(),'holster: back to orbit camera');
Outlaw.equip(0);step(5);CameraRig.toggleView();step(90);ok(CameraRig.view()==='tps'&&me.visible,'toggle to third-person shoulder view');CameraRig.toggleView();Outlaw.equip(0);step(60);

// ================= 3. VIEWMODEL COMPOSITION (all 16 guns, phone portrait + desktop landscape) =================
const GUNS=[['Revolver-A',.45],['MS-C96',.5],['R2014-2806',.7],['AHKN-LV',1.0],['PMPSG',1.0],['TMS-1909',1.2],['UPistol',.4],['UMagnum',.5],['USMG',.65],['USawedOff',.6],['UCombatSG',1.0],['UAssault',1.0],['UBullpup',.85],['USniper',1.2],['Minigun',.9],['Bazooka',1.2]];
let worst={area:0},allBelow=true,allRight=true,handsLow=true;
for(const asp of [390/844,1.78]){window.innerWidth=asp*844;window.innerHeight=844;
  for(let i=0;i<GUNS.length;i++){Viewmodel.update(.016,{vis:true,wi:i,len:GUNS[i][1]});await new Promise(r=>setTimeout(r,25));for(let k=0;k<40;k++)Viewmodel.update(.016,{vis:true,wi:i,len:GUNS[i][1]});
    Viewmodel.camera.updateProjectionMatrix();Viewmodel.scene.updateMatrixWorld(true);
    const v=new T.Vector3();let x0=9,x1=-9,y0=9,y1=-9;Viewmodel.anchor.model.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let j=0;j<p.count;j+=3){v.fromBufferAttribute(p,j).applyMatrix4(o.matrixWorld).project(Viewmodel.camera);x0=Math.min(x0,v.x);x1=Math.max(x1,v.x);y0=Math.min(y0,v.y);y1=Math.max(y1,v.y)}});
    const area=Math.max(0,Math.min(1,x1)-Math.max(-1,x0))*Math.max(0,Math.min(1,y1)-Math.max(-1,y0))/4;if(area>worst.area)worst={area,gun:GUNS[i][0],asp};
    if(y1>-.03)allBelow=false;if(x0<-.15)allRight=false;
    Viewmodel.scene.traverse(o=>{if(o.isMesh&&o.geometry.type==='SphereGeometry'){const h=o.getWorldPosition(new T.Vector3()).project(Viewmodel.camera);if(h.y>0)handsLow=false}});}}
ok(allBelow,'every gun sits below the crosshair at both aspect ratios');ok(allRight,'every gun sits on the right of the screen (the chunky Minigun may overlap centre slightly, well below the crosshair)');ok(handsLow,'hands stay in the lower half of the screen');
ok(worst.area<.14,`largest gun covers ${(worst.area*100).toFixed(1)}% of the screen (${worst.gun}, aspect ${worst.asp.toFixed(2)}) < 14%`);
// muzzle origin for tracers is in front of the camera
const mp=Viewmodel.muzzleWorld(camera,new T.Vector3()),fw=camera.getWorldDirection(new T.Vector3());ok(mp.clone().sub(camera.position).dot(fw)>.3,'tracer origin is ahead of the camera');
process.exit(bad?1:0);
