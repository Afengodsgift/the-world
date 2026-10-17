// Bakes Mixamo FBX clips for a character that carries the Mixamo skeleton itself (assets/warden/<char>.glb from pack_mixamo_char.mjs): no retarget, tracks keep their "mixamorigX.quaternion" names.
//   node tools/bake_mixamo_native.mjs <config.json> <out.json>     config = {root,fps,dg,hipsScale?,clips:[{name,file,from?,to?,inPlace?}]}   (MX_DIR=<folder holding the packs>)
// Hips position stays in centimetres (the runtime wraps the model in a 0.01-scale group), horizontal drift is removed so the sim owns world motion, fingers/static bones are 2-key tracks.
import fs from 'fs';import path from 'path';
const NM=process.env.THREE_NM||'/home/claude/tools_nm/node_modules';
globalThis.window={URL:{createObjectURL:()=>'blob:x'}};globalThis.document={createElementNS:()=>({style:{},set src(v){},addEventListener(){}}),createElement:()=>({style:{}})};globalThis.self=globalThis;
const T=await import(NM+'/three/build/three.module.js');const {FBXLoader}=await import(NM+'/three/examples/jsm/loaders/FBXLoader.js');
const [,,cfgF,OUT]=process.argv;const cfg=JSON.parse(fs.readFileSync(cfgF,'utf8')),root=path.resolve(process.env.MX_DIR||path.dirname(cfgF),cfg.root||'.'),FPS=cfg.fps||20,dg=cfg.dg||3,hs=cfg.hipsScale||1;
const r=(v,d)=>+v.toFixed(d);const out=[];
// optional cfg.glb: only keep tracks for bones the packed character really has (Mixamo 'no fingers' / trimmed rigs), so three.js does not warn about every missing node
// cfg.restFbx: a skinned T-pose download of the Mixamo character (e.g. Pro_Sword_and_Shield_Pack/Ch03_nonPBR.fbx): its node rotations are the true source rest pose (animation-only files carry frame-0 values)
const REST={q:{},p:{}};if(cfg.restFbx){const bb=fs.readFileSync(path.join(root,cfg.restFbx)),Gr=new FBXLoader().parse(bb.buffer.slice(bb.byteOffset,bb.byteOffset+bb.byteLength),'');Gr.traverse(o=>{if(o.isBone&&/^mixamorig/.test(o.name)){REST.q[o.name]=o.quaternion.clone();REST.p[o.name]=o.parent&&o.parent.isBone?o.parent.name:null}})}
let TG=null;   // cfg.retarget: the packed glb's bone tree (rest rotations) -> world-space retarget, for characters whose bone frames differ from the Mixamo download the clips were made on
function loadTarget(glbPath){const bb=fs.readFileSync(glbPath),jl=bb.readUInt32LE(12),J=JSON.parse(bb.slice(20,20+jl).toString());const par={};J.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>par[c]=i));
  const order=[],seen=new Set();const visit=i=>{if(seen.has(i))return;seen.add(i);if(par[i]!==undefined)visit(par[i]);order.push(i)};J.nodes.forEach((n,i)=>{if(/^mixamorig/.test(n.name))visit(i)});
  const bones=order.filter(i=>/^mixamorig/.test(J.nodes[i].name)).map(i=>{const n=J.nodes[i],pi=par[i],pn=pi!==undefined&&/^mixamorig/.test(J.nodes[pi].name)?J.nodes[pi].name:null;return{name:n.name,parent:pn,rest:new T.Quaternion(...(n.rotation||[0,0,0,1]))}});
  const W={};for(const b of bones){W[b.name]=(b.parent?W[b.parent].clone():new T.Quaternion()).multiply(b.rest)}return{bones,Wr:W}}
let allowed=null;if(cfg.glb){const bb=fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname),'..',cfg.glb)),jl=bb.readUInt32LE(12),J=JSON.parse(bb.slice(20,20+jl).toString());allowed=new Set(J.nodes.map(n=>n.name));if(cfg.retarget)TG=loadTarget(path.resolve(path.dirname(new URL(import.meta.url).pathname),'..',cfg.glb))}
function sample(t,time,quat){const ts=t.times,vs=t.values;let k=0;while(k<ts.length-2&&ts[k+1]<=time)k++;const k2=Math.min(k+1,ts.length-1),f=k2===k?0:Math.min(1,Math.max(0,(time-ts[k])/(ts[k2]-ts[k])));
  return quat?new T.Quaternion(...vs.slice(k*4,k*4+4)).slerp(new T.Quaternion(...vs.slice(k2*4,k2*4+4)),f):new T.Vector3(...vs.slice(k*3,k*3+3)).lerp(new T.Vector3(...vs.slice(k2*3,k2*3+3)),f)}
for(const c of cfg.clips){
  let a,G;try{const b=fs.readFileSync(path.join(root,c.file));G=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');a=G.animations[0]}catch(e){console.log('skip',c.name,e.message);continue}
  const t0=c.from||0,t1=Math.min(c.to||a.duration,a.duration),dur=t1-t0,n=Math.max(2,Math.round(dur*FPS)+1),times=[];for(let f=0;f<n;f++)times.push(r(dur*f/(n-1),4));
  const tracks=[];
  if(TG){   // world-space retarget of every bone's rotation
    const srcRest=cfg.restFbx?REST.q:{},srcPar=cfg.restFbx?REST.p:{};if(!cfg.restFbx)G.traverse(o=>{if(o.isBone&&/^mixamorig/.test(o.name)){srcRest[o.name]=o.quaternion.clone();srcPar[o.name]=o.parent&&o.parent.isBone?o.parent.name:null}});
    const Wsr={};const wsr=nm=>Wsr[nm]||(Wsr[nm]=(srcPar[nm]?wsr(srcPar[nm]).clone():new T.Quaternion()).multiply(srcRest[nm]));
    const trq={};for(const t of a.tracks){const [bn,prop]=[t.name.split('.')[0],t.name.split('.').pop()];if(prop==='quaternion')trq[bn]=t}
    const per={};for(const b of TG.bones)per[b.name]=[];
    for(const tt of times){const Ws={},Wt={};
      for(const b of TG.bones){const nm=b.name;if(!srcRest[nm]){Wt[nm]=(b.parent?Wt[b.parent].clone():new T.Quaternion()).multiply(b.rest);per[nm].push(b.rest.clone());continue}
        const ql=trq[nm]?sample(trq[nm],Math.min(t1-1e-4,t0+tt),true):srcRest[nm];Ws[nm]=(srcPar[nm]&&Ws[srcPar[nm]]?Ws[srcPar[nm]].clone():new T.Quaternion()).multiply(ql);
        const D=Ws[nm].clone().multiply(wsr(nm).clone().invert());Wt[nm]=D.multiply(TG.Wr[nm]);
        const loc=(b.parent?Wt[b.parent].clone().invert():new T.Quaternion()).multiply(Wt[nm]);per[nm].push(loc)}}
    for(const b of TG.bones){const vals=per[b.name];for(let i=1;i<n;i++)if(vals[i-1].dot(vals[i])<0)vals[i].set(-vals[i].x,-vals[i].y,-vals[i].z,-vals[i].w);
      let flat=true;for(const v of vals)if(Math.abs(v.x-vals[0].x)+Math.abs(v.y-vals[0].y)+Math.abs(v.z-vals[0].z)>.004){flat=false;break}
      const q=x=>r(x,dg);if(/Hand(Index|Thumb|Middle|Ring|Pinky)/.test(b.name)||flat)tracks.push({name:b.name+'.quaternion',type:'quaternion',times:[0,r(dur,4)],values:[0,1].flatMap(()=>[q(vals[0].x),q(vals[0].y),q(vals[0].z),q(vals[0].w)])});
      else tracks.push({name:b.name+'.quaternion',type:'quaternion',times,values:vals.flatMap(v=>[q(v.x),q(v.y),q(v.z),q(v.w)])})}}
  for(const t of a.tracks){if(TG&&!/position/.test(t.name))continue;const [bn,prop]=[t.name.split('.')[0],t.name.split('.').pop()];if(!/^mixamorig/.test(bn)||(allowed&&!allowed.has(bn)))continue;
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
