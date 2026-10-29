// Re-use a baked Mixamo clip set (assets/warden_mx_<src>.json, made for assets/warden/<src>.glb) on another Mixamo-named character whose rest pose differs:
//   node tools/rebase_mx.mjs <src.json> <src.glb> <dst.glb> <out.json> [keepClipA,keepClipB]
// Every bone's rotation is retargeted in world space (same maths as the `retarget` mode of bake_mixamo_native.mjs, but from the baked tracks, so no FBX pack is needed),
// hips position (cm) and the clip's travel are scaled by newHipsHeight / oldHipsHeight so the feet keep their ground contact. Bones the source never animated keep the target's rest rotation.
import fs from 'fs';
const NM=process.env.THREE_NM||'/home/claude/tools_nm/node_modules';
const T=await import(NM+'/three/build/three.module.js');
const [,,SRC,SG,DG,OUT,KEEP]=process.argv;
const glb=f=>{const b=fs.readFileSync(f),l=b.readUInt32LE(12);return JSON.parse(b.slice(20,20+l).toString())};
function tree(j){const par={};j.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>par[c]=i));const seen=new Set(),order=[];const visit=i=>{if(seen.has(i))return;seen.add(i);if(par[i]!==undefined)visit(par[i]);order.push(i)};j.nodes.forEach((n,i)=>{if(/^mixamorig/.test(n.name))visit(i)});
  const bones=order.filter(i=>/^mixamorig/.test(j.nodes[i].name)).map(i=>{const n=j.nodes[i],pi=par[i],pn=pi!==undefined&&/^mixamorig/.test(j.nodes[pi].name)?j.nodes[pi].name:null;return{name:n.name,parent:pn,rest:new T.Quaternion(...(n.rotation||[0,0,0,1])),y:(n.translation||[0,0,0])[1]}});
  const W={},by={};for(const b of bones){by[b.name]=b;W[b.name]=(b.parent?W[b.parent].clone():new T.Quaternion()).multiply(b.rest)}return{bones,W,by}}
const S=tree(glb(SG)),D=tree(glb(DG)),ratio=D.by.mixamorigHips.y/S.by.mixamorigHips.y;console.log('hips ratio',ratio.toFixed(4),'bones src',S.bones.length,'dst',D.bones.length);
const sample=(t,time)=>{const ts=t.times,vs=t.values,k4=t.type==='quaternion'?4:3;let k=0;while(k<ts.length-2&&ts[k+1]<=time)k++;const k2=Math.min(k+1,ts.length-1),f=k2===k?0:Math.min(1,Math.max(0,(time-ts[k])/(ts[k2]-ts[k])));
  if(k4===4)return new T.Quaternion(...vs.slice(k*4,k*4+4)).slerp(new T.Quaternion(...vs.slice(k2*4,k2*4+4)),f);return new T.Vector3(...vs.slice(k*3,k*3+3)).lerp(new T.Vector3(...vs.slice(k2*3,k2*3+3)),f)};
const keep=KEEP?new Set(KEEP.split(',')):null,out=[],r=(v,d)=>+v.toFixed(d);
for(const c of JSON.parse(fs.readFileSync(SRC,'utf8'))){if(keep&&!keep.has(c.name))continue;
  const hq=c.tracks.find(t=>t.name==='mixamorigHips.quaternion'),times=hq.times,n=times.length,trq={};for(const t of c.tracks)if(t.name.endsWith('.quaternion'))trq[t.name.split('.')[0]]=t;
  const per={};for(const b of D.bones)per[b.name]=[];
  for(const tt of times){const Ws={},Wt={};
    for(const b of D.bones){const nm=b.name,sb=S.by[nm];
      if(!sb){Wt[nm]=(b.parent?Wt[b.parent].clone():new T.Quaternion()).multiply(b.rest);per[nm].push(b.rest.clone());continue}
      const ql=trq[nm]?sample(trq[nm],tt):sb.rest;Ws[nm]=(sb.parent&&Ws[sb.parent]?Ws[sb.parent].clone():new T.Quaternion()).multiply(ql);
      const d=Ws[nm].clone().multiply(S.W[nm].clone().invert());Wt[nm]=d.multiply(D.W[nm]);per[nm].push((b.parent?Wt[b.parent].clone().invert():new T.Quaternion()).multiply(Wt[nm]))}}
  const tracks=[];
  for(const b of D.bones){const v=per[b.name];for(let i=1;i<n;i++)if(v[i-1].dot(v[i])<0)v[i].set(-v[i].x,-v[i].y,-v[i].z,-v[i].w);
    let flat=true;for(const q of v)if(Math.abs(q.x-v[0].x)+Math.abs(q.y-v[0].y)+Math.abs(q.z-v[0].z)>.004){flat=false;break}
    const q3=x=>r(x,3);if(flat||/Hand(Index|Thumb|Middle|Ring|Pinky)/.test(b.name))tracks.push({name:b.name+'.quaternion',type:'quaternion',times:[0,times[n-1]],values:[0,1].flatMap(()=>[q3(v[0].x),q3(v[0].y),q3(v[0].z),q3(v[0].w)])});
    else tracks.push({name:b.name+'.quaternion',type:'quaternion',times,values:v.flatMap(q=>[q3(q.x),q3(q.y),q3(q.z),q3(q.w)])})}
  const hp=c.tracks.find(t=>t.name==='mixamorigHips.position');if(hp)tracks.push(Object.assign({},hp,{values:hp.values.map(v=>r(v*ratio,2))}));
  out.push(Object.assign({},c,{tracks,trav:c.trav?c.trav.map(v=>r(v*ratio,3)):c.trav}));console.log(c.name.padEnd(8),tracks.length,'tracks')}
fs.writeFileSync(OUT,JSON.stringify(out));console.log('wrote',OUT,out.length,'clips',(fs.statSync(OUT).size/1024|0)+'KB');
