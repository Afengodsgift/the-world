// Bakes Mixamo FBX clips for a character that carries the Mixamo skeleton itself (assets/warden/<char>.glb from pack_mixamo_char.mjs): no retarget, tracks keep their "mixamorigX.quaternion" names.
//   node tools/bake_mixamo_native.mjs <config.json> <out.json>     config = {root,fps,dg,hipsScale?,clips:[{name,file,from?,to?,inPlace?}]}   (MX_DIR=<folder holding the packs>)
// Hips position stays in centimetres (the runtime wraps the model in a 0.01-scale group), horizontal drift is removed so the sim owns world motion, fingers/static bones are 2-key tracks.
import fs from 'fs';import path from 'path';
const NM=process.env.THREE_NM||'/home/claude/tools_nm/node_modules';
globalThis.window={URL:{createObjectURL:()=>'blob:x'}};globalThis.document={createElementNS:()=>({style:{},set src(v){},addEventListener(){}}),createElement:()=>({style:{}})};globalThis.self=globalThis;
const T=await import(NM+'/three/build/three.module.js');const {FBXLoader}=await import(NM+'/three/examples/jsm/loaders/FBXLoader.js');
const [,,cfgF,OUT]=process.argv;const cfg=JSON.parse(fs.readFileSync(cfgF,'utf8')),root=path.resolve(process.env.MX_DIR||path.dirname(cfgF),cfg.root||'.'),FPS=cfg.fps||20,dg=cfg.dg||3,hs=cfg.hipsScale||1;
const r=(v,d)=>+v.toFixed(d);const out=[];
function sample(t,time,quat){const ts=t.times,vs=t.values;let k=0;while(k<ts.length-2&&ts[k+1]<=time)k++;const k2=Math.min(k+1,ts.length-1),f=k2===k?0:Math.min(1,Math.max(0,(time-ts[k])/(ts[k2]-ts[k])));
  return quat?new T.Quaternion(...vs.slice(k*4,k*4+4)).slerp(new T.Quaternion(...vs.slice(k2*4,k2*4+4)),f):new T.Vector3(...vs.slice(k*3,k*3+3)).lerp(new T.Vector3(...vs.slice(k2*3,k2*3+3)),f)}
for(const c of cfg.clips){
  let a;try{const b=fs.readFileSync(path.join(root,c.file));a=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'').animations[0]}catch(e){console.log('skip',c.name,e.message);continue}
  const t0=c.from||0,t1=Math.min(c.to||a.duration,a.duration),dur=t1-t0,n=Math.max(2,Math.round(dur*FPS)+1),times=[];for(let f=0;f<n;f++)times.push(r(dur*f/(n-1),4));
  const tracks=[];
  for(const t of a.tracks){const [bn,prop]=[t.name.split('.')[0],t.name.split('.').pop()];if(!/^mixamorig/.test(bn))continue;
    if(prop==='quaternion'){const vals=times.map(tt=>sample(t,Math.min(t1-1e-4,t0+tt),true));for(let i=1;i<n;i++)if(vals[i-1].dot(vals[i])<0)vals[i].set(-vals[i].x,-vals[i].y,-vals[i].z,-vals[i].w);
      let flat=true;for(const v of vals)if(Math.abs(v.x-vals[0].x)+Math.abs(v.y-vals[0].y)+Math.abs(v.z-vals[0].z)>.004){flat=false;break}
      const q=x=>r(x,dg);if(/Hand(Index|Thumb|Middle|Ring|Pinky)/.test(bn)||flat)tracks.push({name:bn+'.quaternion',type:'quaternion',times:[0,r(dur,4)],values:[0,1].flatMap(()=>[q(vals[0].x),q(vals[0].y),q(vals[0].z),q(vals[0].w)])});
      else tracks.push({name:bn+'.quaternion',type:'quaternion',times,values:vals.flatMap(v=>[q(v.x),q(v.y),q(v.z),q(v.w)])})}
    else if(prop==='position'&&/Hips$/.test(bn)){const P=times.map(tt=>sample(t,Math.min(t1-1e-4,t0+tt),false).multiplyScalar(hs));const f=P[0].clone(),l=P[n-1].clone();
      if(c.inPlace!==false)P.forEach((p,i)=>{const u=i/(n-1);p.x-=f.x+(l.x-f.x)*u;p.z-=f.z+(l.z-f.z)*u;p.x+=f.x;p.z+=f.z});     // keep the clip's start offset, drop the travel
      tracks.push({name:bn+'.position',type:'vector',times,values:P.flatMap(p=>[r(p.x,2),r(p.y,2),r(p.z,2)])})}}
  const hp=a.tracks.find(t=>/Hips\.position$/.test(t.name));let tz=0;if(hp){const A=sample(hp,t0,false),B=sample(hp,Math.max(t0,t1-1e-4),false);tz=r((B.z-A.z)/100*hs,2)}
  out.push({name:c.name,duration:r(dur,4),tracks,uuid:c.name,trav:[0,tz]});console.log(c.name.padEnd(10),r(dur,2)+'s',tracks.length,'tracks travel z',tz)}
fs.writeFileSync(OUT,JSON.stringify(out));console.log('wrote',OUT,(fs.statSync(OUT).size/1024|0)+' KB',out.length,'clips');
