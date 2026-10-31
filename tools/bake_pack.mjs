// Bakes clips from the Phantom-Blade animation pack (assets-src GLB: Mixamo skeleton under a Blender 'root' node, metres, Z-up) into the game's baked clip format,
// and writes a patched copy of the GLB whose hips carry the root's rotation (so tools/rebase_mx.mjs can retarget it like any other Mixamo-named GLB).
//   node tools/bake_pack.mjs <pack.glb> <out_clips.json> <out_src.glb> [clipA=newA,clipB=newB,...]
import fs from 'fs';
const NM=process.env.THREE_NM||'/home/claude/tools_nm/node_modules';
const T=await import(NM+'/three/build/three.module.js');
const [,,SRC,OUT,OUTG,LIST]=process.argv;
const b=fs.readFileSync(SRC),jl=b.readUInt32LE(12),J=JSON.parse(b.slice(20,20+jl).toString()),bo=20+jl+(4-jl%4)%4+8,BIN=b.slice(bo);
const CT={5126:[Float32Array,4],5123:[Uint16Array,2],5121:[Uint8Array,1]},NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function acc(i){const a=J.accessors[i],v=J.bufferViews[a.bufferView],[C,sz]=CT[a.componentType],n=NC[a.type];const off=(v.byteOffset||0)+(a.byteOffset||0);const ab=new ArrayBuffer(a.count*n*sz);new Uint8Array(ab).set(BIN.subarray(off,off+a.count*n*sz));return{n,d:new C(ab),count:a.count}}
const node=Object.fromEntries(J.nodes.map((n,i)=>[n.name,i])),root=J.nodes[node.root],Rr=new T.Quaternion(...root.rotation);
const want=new Map((LIST||'').split(',').filter(Boolean).map(s=>s.split('=')));
const FPS=+(process.env.PX_FPS||24),r=(v,d)=>+v.toFixed(d),out=[];
for(const an of J.animations){if(want.size&&!want.has(an.name))continue;const nm=want.size?(want.get(an.name)||an.name):an.name;
  const ch={};let dur=0;for(const c of an.channels){const nn=J.nodes[c.target.node].name;if(!/^mixamorig/.test(nn)&&nn!=='root')continue;const s=an.samplers[c.sampler],ti=acc(s.input),vi=acc(s.output);dur=Math.max(dur,ti.d[ti.count-1]);(ch[nn]=ch[nn]||{})[c.target.path]={t:ti.d,v:vi.d,n:vi.n}}
  const N=Math.max(2,Math.round(dur*FPS)+1),times=Array.from({length:N},(_,i)=>Math.min(dur,i/FPS));
  const samp=(tr,t,q)=>{const ts=tr.t;let k=0;while(k<ts.length-2&&ts[k+1]<=t)k++;const k2=Math.min(k+1,ts.length-1),f=k2===k?0:Math.min(1,Math.max(0,(t-ts[k])/(ts[k2]-ts[k])));const n=tr.n;
    if(q)return new T.Quaternion(...tr.v.slice(k*4,k*4+4)).slerp(new T.Quaternion(...tr.v.slice(k2*4,k2*4+4)),f);return new T.Vector3(...tr.v.slice(k*3,k*3+3)).lerp(new T.Vector3(...tr.v.slice(k2*3,k2*3+3)),f)};
  const tracks=[];
  for(const bn in ch){if(!/^mixamorig/.test(bn))continue;const c=ch[bn];
    if(c.rotation){const vals=times.map(t=>{let q=samp(c.rotation,t,true);if(bn==='mixamorigHips')q=Rr.clone().multiply(q);return q});for(let i=1;i<N;i++)if(vals[i-1].dot(vals[i])<0)vals[i].set(-vals[i].x,-vals[i].y,-vals[i].z,-vals[i].w);
      let flat=true;for(const v of vals)if(Math.abs(v.x-vals[0].x)+Math.abs(v.y-vals[0].y)+Math.abs(v.z-vals[0].z)>.004){flat=false;break}const q3=x=>r(x,3);
      if(flat||/Hand(Index|Thumb|Middle|Ring|Pinky)/.test(bn))tracks.push({name:bn+'.quaternion',type:'quaternion',times:[0,r(dur,4)],values:[0,1].flatMap(()=>[q3(vals[0].x),q3(vals[0].y),q3(vals[0].z),q3(vals[0].w)])});
      else tracks.push({name:bn+'.quaternion',type:'quaternion',times:times.map(t=>r(t,4)),values:vals.flatMap(v=>[q3(v.x),q3(v.y),q3(v.z),q3(v.w)])})}}
  // hips position (cm, Y-up): hips translation lives in the root's space; an RM clip also moves the root itself (that is the clip's travel)
  const hp=ch.mixamorigHips&&ch.mixamorigHips.translation,rp=ch.root&&ch.root.translation;let P=[];
  if(hp){P=times.map(t=>{const v=samp(hp,t,false).applyQuaternion(Rr).multiplyScalar(100);return v});
    let tz=0;if(rp){const a=samp(rp,0,false),z=samp(rp,dur,false);const d=z.sub(a).applyQuaternion(Rr);tz=r(d.z,2)}   // root motion distance (m) along the facing
    const f=P[0].clone(),l=P[N-1].clone();P.forEach((p,i)=>{const u=i/(N-1);p.x-=f.x+(l.x-f.x)*u;p.z-=f.z+(l.z-f.z)*u;p.x+=f.x;p.z+=f.z});
    tracks.push({name:'mixamorigHips.position',type:'vector',times:times.map(t=>r(t,4)),values:P.flatMap(p=>[r(p.x,2),r(p.y,2),r(p.z,2)])});
    out.push({name:nm,duration:r(dur,4),tracks,uuid:nm,trav:[0,tz]});console.log(nm.padEnd(22),r(dur,2)+'s',tracks.length,'trav',tz)}}
fs.writeFileSync(OUT,JSON.stringify(out));
// patched glb for rebase_mx: hips rest carries the root rotation; translations in cm
const H=J.nodes[node.mixamorigHips];const hr=new T.Quaternion(...H.rotation);H.rotation=Rr.clone().multiply(hr).toArray();H.translation=new T.Vector3(...H.translation).applyQuaternion(Rr).multiplyScalar(100).toArray();
const js=Buffer.from(JSON.stringify(J));const pad=(4-js.length%4)%4,jb=Buffer.concat([js,Buffer.alloc(pad,32)]);
const hdr=Buffer.alloc(12);hdr.write('glTF',0);hdr.writeUInt32LE(2,4);const jh=Buffer.alloc(8);jh.writeUInt32LE(jb.length,0);jh.write('JSON',4);
const rest=b.slice(20+jl+(4-jl%4)%4);const tot=12+8+jb.length+rest.length;hdr.writeUInt32LE(tot,8);fs.writeFileSync(OUTG,Buffer.concat([hdr,jh,jb,rest]));
console.log('clips',out.length,'bytes',fs.statSync(OUT).size);
