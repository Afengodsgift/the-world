// Fly poses: assets/flypose.json (extracted from the Mixamo flying clip) is well-formed, loops, matches FlightPose's body-space conventions, and the sampler is smooth.
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);globalThis.THREE=T;
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
const J=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/flypose.json'),'utf8'));
(0,eval)(fs.readFileSync(path.join(ROOT,'src/character/FlightPose.js'),'utf8').replace('const FlightPose=','globalThis.FlightPose='));FlightPose.setData(J);
ok(J.segs.length===13&&J.segs[0]==='Spine>Chest'&&J.segs[12]==='RightFoot>RightToes','13 segments in the order FlightPose expects');
for(const k of ['cruise','boost']){const c=J.clips[k];
 ok(c.frames>=40&&c.data.length===c.frames*39&&c.fps>=10,k+': '+c.frames+' frames @ '+c.fps+' fps, '+(c.frames/c.fps).toFixed(1)+' s loop');
 let unit=true,fin=true;for(let i=0;i<c.data.length;i+=3){const L=Math.hypot(c.data[i],c.data[i+1],c.data[i+2]);if(!Number.isFinite(L))fin=false;if(Math.abs(L-1)>.01)unit=false}ok(fin&&unit,k+': every direction is a finite unit vector');
 const v=(f,s)=>new T.Vector3(c.data[f*39+s*3],c.data[f*39+s*3+1],c.data[f*39+s*3+2]);
 let maxStep=0;for(let f=0;f<c.frames;f++){const g=(f+1)%c.frames;for(let s=0;s<13;s++)maxStep=Math.max(maxStep,v(f,s).angleTo(v(g,s)))}
 ok(maxStep<.35,k+': smooth and loops cleanly (largest frame-to-frame swing '+(maxStep*57.3).toFixed(1)+' deg incl. the wrap)');
 const avg=s=>{const a=new T.Vector3();for(let f=0;f<c.frames;f++)a.add(v(f,s));return a.normalize()};
 ok(avg(0).y>.95&&avg(1).y>.95&&avg(2).y>.9,k+': spine runs up the body (+Y)');
 ok(avg(3).y>.6&&avg(5).y>.6&&avg(4).y>.8&&avg(6).y>.8,k+': arms stretch forward along the body (the Superman pose)');
 ok(avg(7).y<-.6&&avg(10).y<-.6&&avg(8).y<-.5&&avg(11).y<-.5,k+': legs trail behind')}
// the sampler: continuous in time through the wrap, and the same at t and t+loop
{const c=J.clips.cruise,out=Array.from({length:13},()=>new T.Vector3()),prev=Array.from({length:13},()=>new T.Vector3());let mx=0;FlightPose.sampleClip(c,0,prev);
 for(let t=.005;t<c.frames/c.fps*2.2;t+=.005){FlightPose.sampleClip(c,t,out);for(let s=0;s<13;s++){mx=Math.max(mx,out[s].angleTo(prev[s]));prev[s].copy(out[s])}}
 ok(mx<.03,'sampler is continuous through repeated loops (max step '+(mx*57.3).toFixed(2)+' deg per 5 ms)');
 const a=Array.from({length:13},()=>new T.Vector3()),b=Array.from({length:13},()=>new T.Vector3());FlightPose.sampleClip(c,.37,a);FlightPose.sampleClip(c,.37+c.frames/c.fps*3,b);
 ok(a.every((x,i)=>x.angleTo(b[i])<1e-6),'time wraps exactly')}
ok(FlightPose.data()===J&&(FlightPose.setData(null),FlightPose.data()===null),'missing or invalid data falls back to the old procedural tables');
console.log(bad?bad+' failed':'flypose ok');process.exit(bad?1:0);
