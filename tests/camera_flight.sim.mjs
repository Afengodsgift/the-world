// Flight camera: close, stiff follow, character stays framed (low in frame, sky ahead above) when flying straight up/down at any altitude speed.
// Principles (from third-person camera practice): tight camera for fast action, damping that cannot let the target leave the frame,
// a framing offset ('vertical arm'), pull-in as you look up, moderate damped FOV. Run: NODE_PATH=<dir>/node_modules node tests/camera_flight.sim.mjs
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));
if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);globalThis.THREE=T;
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
globalThis.H=()=>0;globalThis.sstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
globalThis.solids=[];globalThis.camera=new T.PerspectiveCamera(65,16/9,.1,4200);globalThis.me=new T.Group();me.userData={};
globalThis.S={x:0,y:0,z:0,yaw:0,pitch:.4,flying:false,grounded:true,gboost:0,vy:0,rot:0};
(0,eval)(R('src/space/SpaceFlight.js').replace('const SpaceFlight=','globalThis.SpaceFlight='));
(0,eval)(R('src/camera/CameraRig.js').replace('const CameraRig=','globalThis.CameraRig='));
const chest=()=>new T.Vector3(S.x,S.y+1.4,S.z);
const run=(secs,fn)=>{const n=Math.round(secs*60);for(let i=0;i<n;i++){fn&&fn(1/60);CameraRig.update(1/60);camera.updateMatrixWorld(true)}};
const ndc=()=>chest().project(camera),dist=()=>camera.position.distanceTo(chest());
const reset=(y)=>{S.x=0;S.z=0;S.y=y;S.yaw=0;S.pitch=.4;S.flying=false;run(3)};
const finite=()=>[camera.position.x,camera.position.y,camera.position.z,camera.fov].every(Number.isFinite);

// ground: unchanged chase distance
reset(0);const g=dist();ok(g>8&&g<10,'walking: chase camera ~9 m ('+g.toFixed(2)+')');

// level cruise: closer than walking, still a normal chase view
reset(200);S.flying=true;run(3,dt=>{S.z-=34*dt});
{const d=dist(),n=ndc();ok(d>4&&d<6.2,'level flight: close chase camera ('+d.toFixed(2)+' m, was 9+)');ok(Math.abs(n.x)<.08&&n.y<0&&n.y>-.6,'level flight: character just below centre ('+n.y.toFixed(2)+')');
 ok(camera.fov>72&&camera.fov<82,'cruise FOV is moderate ('+camera.fov.toFixed(0)+'°)')}

// straight up at boost: THE case that was bad
reset(200);S.flying=true;S.pitch=-1.25;run(.2);
let worst=0,minD=1e9,maxD=0;run(4,dt=>{S.y+=70*dt},);
for(let i=0;i<120;i++){S.y+=70/60;CameraRig.update(1/60);camera.updateMatrixWorld(true);const n=ndc();worst=Math.max(worst,Math.abs(n.x),Math.abs(n.y+.3));minD=Math.min(minD,dist());maxD=Math.max(maxD,dist())}
{const n=ndc();ok(n.y<-.05&&n.y>-.8&&Math.abs(n.x)<.1,'straight up at boost: character stays low-centre in frame (x '+n.x.toFixed(2)+', y '+n.y.toFixed(2)+')');
 ok(maxD<5.6&&minD>3,'straight up at boost: camera is close ('+minD.toFixed(1)+'-'+maxD.toFixed(1)+' m)');
 ok(camera.position.y<S.y&&camera.fov>76&&camera.fov<92,'straight up: camera behind/below, FOV reads the speed ('+camera.fov.toFixed(0)+'°, vertical flight counts as fast)');ok(finite(),'no NaN')}

// same climb at orbital speed multipliers (the camera must keep the character in frame at 100x)
for(const y0 of [20000,60000,120000]){reset(y0);S.flying=true;S.pitch=-1.25;const mul=SpaceFlight.moveMul(y0);
 run(3,dt=>{S.y+=70*mul*dt});const n=ndc();
 ok(n.y<0&&n.y>-.85&&Math.abs(n.x)<.12&&dist()<5.6&&finite(),'climbing at '+(y0/1000)+' km ('+(70*mul/1000).toFixed(1)+' km/s): character framed (y '+n.y.toFixed(2)+', '+dist().toFixed(1)+' m)')}

// look-up pulls in, look-down pushes out; both keep the character in frame
const at=(pitch,vy)=>{reset(500);S.flying=true;S.pitch=pitch;run(3,dt=>{S.y+=vy*dt});return {d:dist(),n:ndc()}};
{const up=at(-1.2,0),lv=at(.4,0),dn=at(1.4,0),dv=at(1.4,-60);ok(up.d<lv.d&&lv.d<dn.d,'distance: looking up '+up.d.toFixed(1)+' < level '+lv.d.toFixed(1)+' < looking down '+dn.d.toFixed(1));
 ok(Math.abs(dv.n.x)<.1&&dv.n.y>-.8&&dv.n.y<.8&&dv.d<8,'diving at speed: character stays in frame (y '+dv.n.y.toFixed(2)+', '+dv.d.toFixed(1)+' m)')}

// stop flying: back to the walking camera
reset(3);S.flying=true;run(2);S.flying=false;S.y=0;S.pitch=.4;run(3);{const d=dist();ok(d>8&&d<10,'after landing the chase camera returns to ~9 m ('+d.toFixed(2)+')')}
console.log(bad?bad+' failed':'camera flight ok');process.exit(bad?1:0);
