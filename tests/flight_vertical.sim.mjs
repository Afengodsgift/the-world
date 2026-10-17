// Flying straight UP used to read as "hover" (the pose weights used HORIZONTAL speed only, and a vertical climb has ~0 of it), so the avatar stood normally.
// FlightPose now weights by 3D speed: a fast climb is cruise/boost with the body near vertical, a dive tips over, level flight and hover are unchanged.
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);globalThis.THREE=T;
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
(0,eval)(R('src/utils/math.js').replace(/^(const|let) /gm,'var '));
globalThis._v1=new T.Vector3();globalThis._v2=new T.Vector3();globalThis._qa=new T.Quaternion();globalThis._qb=new T.Quaternion();globalThis._qm=new T.Quaternion();globalThis._qw=new T.Quaternion();
const HTML=R('index.html'),grab=(a,b)=>HTML.slice(HTML.indexOf(a),HTML.indexOf(b));
(0,eval)(grab('function aim(b,c,dir)','function pose(q,st,dt)').replace('function aim','globalThis.aim=function aim'));   // aim() lives in index.html
(0,eval)(R('src/character/FlightPose.js').replace('const FlightPose=','globalThis.FlightPose='));
const gj=(()=>{const b=fs.readFileSync(path.join(ROOT,'assets/char.glb'));return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString())})();
function avatar(){const g=new T.Object3D(),mdl=new T.Object3D();g.add(mdl);const bones={};for(const n of gj.nodes.map(x=>x.name)){const b=new T.Bone();b.name=n;mdl.add(b);bones[n]=b}
 g.position.set(0,10,0);const q={model:mdl,bones,oy:0};g.userData=q;return {g,q,mdl}}
const fly=(a,vh,vy,secs,st='fly')=>{const dt=1/60;for(let i=0;i<60*secs;i++){a.g.position.z+=vh*dt;a.g.position.y+=vy*dt;a.g.updateMatrixWorld(true);a.q.fs=vh;FlightPose.apply(a.g,a.q,dt,st,{speed:vh,yawRate:0})}};
{const a=avatar();fly(a,0,0,2);const f=a.q.fl;ok(f.name==='hover'&&f.wH>.95,'hover in place stays hover');}
{const a=avatar();fly(a,30,0,3);const f=a.q.fl;ok(f.wC>.7&&f.pitch>1.2,'level cruise at 30 m/s: cruise pose, body leaning forward ('+f.pitch.toFixed(2)+' rad)');
 fly(a,80,0,3);ok(f.wB>.8,'fast (80 m/s): boost pose');}
{const a=avatar();fly(a,0,60,3);const f=a.q.fl;
 ok(f.wH<.1&&f.name!=='hover','straight UP at 60 m/s: flight pose, no longer "hover" (wH='+f.wH.toFixed(2)+', '+f.name+')');
 ok(f.wB>.5,'straight up at 60 m/s: boost pose (wB='+f.wB.toFixed(2)+')');
 ok(f.pitch<.6,'straight up: body near vertical, not leaning flat (lean '+f.pitch.toFixed(2)+' rad)')}
{const a=avatar();fly(a,0,25,3);ok(a.q.fl.wH<.3,'slow steady climb (25 m/s) is flight, not hover (wH='+a.q.fl.wH.toFixed(2)+')')}
{const a=avatar();fly(a,30,0,2);fly(a,0,0,1.5,'idle');ok(!a.q.fl.on&&Math.abs(a.mdl.rotation.y)<1e-6,'landing releases the flight pose')}
console.log(bad?bad+' failed':'flight_vertical ok');process.exit(bad?1:0);
