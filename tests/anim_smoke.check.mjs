// Smoke test: runs the REAL animateClips/emoStart/emoStop code from index.html on a synthetic rig through a long scenario.
// Catches exceptions, NaN weights, stuck overlays/emotes (the things I can't see without a browser).
// Run: NODE_PATH=<dir>/node_modules node tests/anim_smoke.check.mjs  (part of tests/run_all.sh)
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));
if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);globalThis.THREE=T;
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
(0,eval)(fs.readFileSync(path.join(ROOT,'src/character/Blend.js'),'utf8').replace('const Blend=','globalThis.Blend='));
const a=html.indexOf('function emoStop(q){'),b=html.indexOf('function animate(g,dt,st){');
globalThis.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));globalThis.LOCO={walk:1,jog:1,sprint:1};
globalThis.EMO={def:{wave:{kind:'loop'},sit:{kind:'clamp',intro:true},cheer:{kind:'once'},sit_in:{kind:'once'}}};
globalThis.FlightPose={apply:()=>false};globalThis.FlightFX={avatar:()=>{}};
// the code under test defines emoStart/emoStop/unrel/animateClips; emoAct is provided here (as in the game: cached clipAction per clip name)
(0,eval)(html.slice(a,b).replace(/^function (\w+)/gm,'globalThis.$1=function $1'));
const names=['idle','walk','jog','sprint','jump','fall','swim','tread','land','hit','hit2','smack','wave','sit','sit_in','cheer'];
const root=new T.Group(),mixer=new T.AnimationMixer(root),nact={};
for(const n of names){const d=n==='sit'?3:n==='wave'?2:1;nact[n]=mixer.clipAction(new T.AnimationClip(n,d,[new T.VectorKeyframeTrack('.position',[0,d],[0,0,0,0,0,0])]))}
nact.idle.play();
globalThis.emoAct=(q,id)=>q.nact[id];
const g=new T.Group(),model=new T.Group();g.add(model);
const q=g.userData={nact,mixer,model,cur:null,pan:null,gunI:-1,land:0,swing:0};
let t=0;const dt=1/60,badW=()=>names.some(n=>{const w=nact[n].getEffectiveWeight();return !isFinite(w)||w<0});
let err=null,maxLean=0;
const run=(secs,st,speed,turn,fn)=>{for(let i=0;i<Math.round(secs*60);i++){
  g.position.x+=Math.sin(g.rotation.y)*speed*dt;g.position.z+=Math.cos(g.rotation.y)*speed*dt;g.rotation.y+=turn*dt;
  if(fn)fn(i);try{animateClips(g,dt,st)}catch(e){err=err||e}
  maxLean=Math.max(maxLean,Math.abs(model.rotation.x),Math.abs(model.rotation.z));t+=dt}};
run(1,'idle',0,0);run(1.5,'walk',3.5,0);run(2,'run',9.5,0);run(2,'run',9.5,1.8);run(1,'run',9.5,-1.8);run(.8,'idle',0,0);
run(.4,'jump',6,0);run(.5,'fall',6,0);q.land=.15;run(1,'run',6,0);
q.hitReq=1;run(1,'run',6,0);q.hitReq=1;run(.1,'run',6,0);q.hitReq=1;run(1,'idle',0,0);
run(.3,'idle',0,0,i=>{if(i===1)q.emoteReq='wave'});ok(!!q.hold,'emote "wave" started and is held');run(1.5,'idle',0,0);
q.emoteReq='sit';run(.1,'idle',0,0);run(3,'idle',0,0);                               // intro -> hold crossfade
q.emoteReq='wave';run(1,'idle',0,0);q.emoteReq='cheer';run(.2,'idle',0,0);run(3,'idle',0,0);   // replace emote mid-hold, then a one-shot that finishes by itself
q.emoteReq='wave';run(.6,'idle',0,0);run(.3,'run',6,0);run(1,'idle',0,0);                      // moving cancels an emote
q.swing=1;run(.5,'idle',0,0);run(1,'idle',0,0);
ok(!err,'no exceptions through the whole scenario'+(err?' -> '+err.stack.split('\n').slice(0,3).join(' | '):''));
ok(!badW(),'all action weights finite and non-negative');
ok(!q.hold&&(!q.rel||q.rel.length===0),'no emote left held or still releasing at the end');
ok(!q.ov||Object.keys(q.ov).length===0,'no overlay left stuck');
const stuck=['hit','hit2','smack','land','wave','sit','sit_in','cheer'].filter(n=>nact[n].isRunning()&&nact[n].getEffectiveWeight()>.01);
ok(stuck.length===0,'no overlay/emote action still running with weight at the end'+(stuck.length?' -> '+stuck:''));
ok(maxLean>.01&&maxLean<.25,'body lean is present but subtle (max '+maxLean.toFixed(3)+' rad)');
console.log(bad?bad+' FAIL':'anim smoke passed');process.exit(bad?1:0);
