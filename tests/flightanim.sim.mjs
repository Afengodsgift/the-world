// Baked flight clips (assets/flight_anims.json + src/character/FlightAnim.js) and the vertical-flight fix in FlightPose:
// the json is well-formed and matches the game rig; flying straight UP no longer reads as "hover" (speed was horizontal-only) and stands the prone Superman pose up on its head;
// level flight stays level, a dive tips over, hover = Levitate (entrance, then idle), landing stops the actions; without the json the procedural pose still works.
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);globalThis.THREE=T;
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const J=JSON.parse(R('assets/flight_anims.json'));
// ---- the data ----
const rigBones=new Set(JSON.parse(Buffer.from(fs.readFileSync(path.join(ROOT,'assets/char.glb')).subarray(20,20+fs.readFileSync(path.join(ROOT,'assets/char.glb')).readUInt32LE(12))).toString()).nodes.map(n=>n.name));
ok(J.clips.length===4&&['lev_in','lev_idle','fly_fwd','fly_super'].every(n=>J.clips.some(c=>c.name===n&&J.meta[n])),'4 clips: lev_in, lev_idle, fly_fwd, fly_super (with meta)');
for(const c of J.clips){const bones=c.tracks.map(t=>t.name.split('.')[0]);
 ok(c.tracks.length===33&&bones.every(b=>rigBones.has(b)),c.name+': 33 tracks, every bone exists in assets/char.glb');
 let unit=true;for(const t of c.tracks)if(t.type==='quaternion')for(let i=0;i<t.values.length;i+=4)if(Math.abs(Math.hypot(...t.values.slice(i,i+4))-1)>.01)unit=false;
 ok(unit,c.name+': every quaternion is unit length');
 const hp=c.tracks.find(t=>t.name==='HipsCtrl.position');ok(hp&&hp.values.every(Number.isFinite),c.name+': hip track finite')}
ok(J.meta.fly_fwd.lean>1.4&&J.meta.fly_super.lean>1.4,'forward clips are prone (lean '+J.meta.fly_fwd.lean+' rad from vertical)');
ok(J.meta.lev_idle.lean<.4&&J.meta.lev_in.lean<.4,'levitation clips are upright (lean '+J.meta.lev_idle.lean+')');
ok(J.meta.lev_idle.dur>=1&&J.meta.lev_in.loop===false&&J.meta.fly_fwd.loop&&J.meta.lev_idle.loop,'entrance plays once, the others loop');
// ---- behaviour ----
(0,eval)(R('src/utils/math.js').replace(/^(const|let) /gm,'var '));
globalThis._v1=new T.Vector3();globalThis._v2=new T.Vector3();globalThis._qa=new T.Quaternion();globalThis._qb=new T.Quaternion();globalThis._qm=new T.Quaternion();globalThis._qw=new T.Quaternion();
const HTML=R('index.html'),grab=(a,b)=>HTML.slice(HTML.indexOf(a),HTML.indexOf(b));
(0,eval)(grab('function aim(b,c,dir)','function pose(q,st,dt)').replace('function aim','globalThis.aim=function aim'));   // aim() lives in index.html
(0,eval)(R('src/character/Blend.js').replace('const Blend=','globalThis.Blend='));
(0,eval)(R('src/character/FlightAnim.js').replace('const FlightAnim=','globalThis.FlightAnim='));
(0,eval)(R('src/character/FlightPose.js').replace('const FlightPose=','globalThis.FlightPose='));FlightPose.setData(null);
function avatar(){const g=new T.Object3D(),mdl=new T.Object3D();g.add(mdl);const hc=new T.Object3D();hc.name='HipsCtrl';mdl.add(hc);const bones={};for(const n of J.clips[0].tracks.map(t=>t.name.split('.')[0])){if(n==='HipsCtrl')continue;const b=new T.Bone();b.name=n;mdl.add(b);bones[n]=b}
 g.position.set(0,10,0);const q={model:mdl,bones,oy:0,mixer:new T.AnimationMixer(mdl)};g.userData=q;return {g,q,mdl}}
const fly=(a,vh,vy,secs,st='fly')=>{const dt=1/60;for(let i=0;i<60*secs;i++){a.g.position.z+=vh*dt;a.g.position.y+=vy*dt;a.g.updateMatrixWorld(true);a.q.fs=vh;FlightPose.apply(a.g,a.q,dt,st,{speed:vh,yawRate:0});a.q.mixer.update(dt)}};
// procedural fallback (json not loaded): straight up must not be hover
globalThis.fetch=async()=>{throw new Error('offline')};
{const a=avatar();ok(!FlightAnim.loaded,'json not loaded yet -> procedural pose');fly(a,0,60,2);const f=a.q.fl;
 ok(f.name!=='hover'&&f.wH<.2,'procedural: straight up at 60 m/s is no longer "hover" (wH='+f.wH.toFixed(2)+', '+f.name+')');
 ok(f.pitch<.6,'procedural: body is near vertical flying up (lean '+f.pitch.toFixed(2)+' rad)')}
// load the clips like the game does (fetch)
await new Promise(r=>setTimeout(r,5));   // let the failed first attempt settle
globalThis.fetch=async()=>({ok:true,json:async()=>J});FlightAnim.load(null,true);await new Promise(r=>setTimeout(r,20));
ok(FlightAnim.loaded,'FlightAnim loaded the clips');
{const a=avatar();fly(a,0,0,.5);const f=a.q.fl,fa=a.q.fa;
 ok(f.wH>.95&&fa&&fa.lev_in.getEffectiveWeight()>fa.lev_idle.getEffectiveWeight()*5,'hover just after takeoff: Levitate_Entrance leads (in '+fa.lev_in.getEffectiveWeight().toFixed(1)+', idle '+fa.lev_idle.getEffectiveWeight().toFixed(2)+')');
 fly(a,0,0,2.4);ok(fa.lev_idle.getEffectiveWeight()>fa.lev_in.getEffectiveWeight()*5,'after the entrance (2 s) Levitate_Idle takes over');
 ok(Math.abs(a.mdl.rotation.x)<.3,'hover: body stays upright (model tilt '+a.mdl.rotation.x.toFixed(2)+')')}
{const a=avatar();fly(a,30,0,3);const f=a.q.fl,fa=a.q.fa;
 ok(f.wC>.7&&fa.fly_fwd.getEffectiveWeight()>fa.fly_super.getEffectiveWeight(),'level cruise at 30 m/s: Flying_Forward (wC='+f.wC.toFixed(2)+')');
 ok(Math.abs(a.mdl.rotation.x)<.35&&f.pitch>1.3,'level cruise: body horizontal (axis '+f.pitch.toFixed(2)+' rad from vertical, model tilt '+a.mdl.rotation.x.toFixed(2)+')');
 fly(a,80,0,3);ok(f.wB>.8&&fa.fly_super.getEffectiveWeight()>fa.fly_fwd.getEffectiveWeight(),'fast (80 m/s): Flying_Forward_Super');
 ok(fa.fly_fwd.time!==undefined&&Math.abs(fa.fly_fwd.time-fa.fly_super.time)<.02,'forward and super clips stay in phase')}
{const a=avatar();fly(a,0,60,3);const f=a.q.fl;
 ok(f.wH<.1&&f.wB>.5,'straight UP at 60 m/s: flight pose, not hover (wH='+f.wH.toFixed(2)+', wB='+f.wB.toFixed(2)+')');
 ok(f.pitch<.35,'straight up: body axis vertical (lean '+f.pitch.toFixed(2)+' rad)');
 ok(a.mdl.rotation.x<-1.3&&a.mdl.rotation.x>-1.8,'straight up: the prone pose is stood up on its head (model tilt '+a.mdl.rotation.x.toFixed(2)+' rad)');
 ok(Math.abs(a.mdl.position.y-J.meta.fly_fwd.hipsY)<.25,'pivots about the pelvis (model lifted '+a.mdl.position.y.toFixed(2)+' m)')}
{const a=avatar();fly(a,0,-60,3);ok(a.q.fl.pitch>2.5,'straight DOWN: dive, body axis lean '+a.q.fl.pitch.toFixed(2)+' rad');
 fly(a,0,0,.5);fly(a,40,25,3);ok(a.q.fl.pitch>.5&&a.q.fl.pitch<1.4,'climbing at ~32 deg: body between vertical and level ('+a.q.fl.pitch.toFixed(2)+' rad)')}
{const a=avatar();fly(a,30,0,2);const fa=a.q.fa;fly(a,0,0,1.5,'idle');
 ok(!a.q.fl.on&&Math.abs(a.mdl.rotation.y)<1e-6&&Object.values(fa).every(x=>!x.isRunning()),'landed: flight released and all four flight actions stopped');
 fly(a,0,0,.2);ok(true,'(grounded avatar keeps running)')}
{const a=avatar();fly(a,30,0,1);fly(a,0,0,1.5,'idle');fly(a,0,0,.1);ok(a.q.fai!==undefined&&a.q.fai<.5,'new takeoff restarts the entrance')}
// ---- re-skinned characters: leg ratio travels with the GLB, the animator scales hip travel by it, the flight pivot follows the real pelvis ----
for(const n of ['crypto','medea','eve','coolguy']){const b=fs.readFileSync(path.join(ROOT,'assets/chars/'+n+'.glb')),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString()),k=j.nodes.find(x=>x.extras&&x.extras.hipK);
 ok(k&&k.extras.hipK>1.2&&k.extras.hipK<2,n+': GLB carries its leg-length ratio (hipK '+(k&&k.extras.hipK)+')')}
(0,eval)(grab('function hipFix(q)','function animateClips(').replace('function hipFix','globalThis.hipFix=function hipFix'));
{const h=new T.Object3D();h.position.set(0,10,0);const q={bones:{HipsCtrl:h},hipR:new T.Vector3(0,10,0),hipK:1.5};h.position.set(1,8,-2);hipFix(q);
 ok(Math.abs(h.position.x-1.5)<1e-9&&Math.abs(h.position.y-7)<1e-9&&Math.abs(h.position.z+3)<1e-9,'hipFix scales the hips\' travel from rest by the leg ratio');
 h.position.set(0,10,0);hipFix(q);ok(h.position.y===10,'hipFix leaves the rest position alone')}
{const sh={lev_in:0,lev_idle:0,fly_fwd:1,fly_super:0},plain=FlightAnim.hips(sh),tall=FlightAnim.hips(sh,{hipK:1.5,hipH:1.0});
 ok(Math.abs(plain-J.meta.fly_fwd.hipsY)<1e-9&&Math.abs(tall-(1.0+1.5*(J.meta.fly_fwd.hipsY-.621)))<1e-9&&tall>plain,'flight pivot: stock character unchanged, longer-legged one pivots higher (stock '+plain.toFixed(2)+' -> '+tall.toFixed(2)+')')}
console.log(bad?bad+' failed':'flightanim ok');process.exit(bad?1:0);
