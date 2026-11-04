// Finds the strike moments of baked clips: world speed of the hands / feet through FK on the target glb's rest skeleton.

import fs from 'fs';
const T=await import((process.env.THREE_NM||'/home/claude/tools_nm/node_modules')+'/three/build/three.module.js');
const [,,GF,CF,ONLY]=process.argv;const b=fs.readFileSync(GF),jl=b.readUInt32LE(12),J=JSON.parse(b.slice(20,20+jl).toString());
const par={};J.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>par[c]=i));const bones=[];const seen=new Set();
const visit=i=>{if(seen.has(i))return;seen.add(i);if(par[i]!==undefined)visit(par[i]);if(/^mixamorig/.test(J.nodes[i].name))bones.push(i)};J.nodes.forEach((_,i)=>visit(i));
const idx={};bones.forEach(i=>idx[J.nodes[i].name]=i);
const sample=(t,time)=>{const ts=t.times,vs=t.values,k4=t.type==='quaternion'?4:3;let k=0;while(k<ts.length-2&&ts[k+1]<=time)k++;const k2=Math.min(k+1,ts.length-1),f=k2===k?0:Math.min(1,Math.max(0,(time-ts[k])/(ts[k2]-ts[k]||1)));
  if(k4===4)return new T.Quaternion(...vs.slice(k*4,k*4+4)).slerp(new T.Quaternion(...vs.slice(k2*4,k2*4+4)),f);return new T.Vector3(...vs.slice(k*3,k*3+3)).lerp(new T.Vector3(...vs.slice(k2*3,k2*3+3)),f)};
// CLIPINFO: strike windows per clip, from hand/foot world speed. node tools/clip_windows.mjs <rig.glb> <clips.json> > info.json
const out={};
for(const c of JSON.parse(fs.readFileSync(CF,'utf8'))){
  const tr={};for(const t of c.tracks)tr[t.name]=t;const N=Math.round(c.duration*30)+1,P={RightHand:[],LeftHand:[],RightFoot:[],LeftFoot:[]};
  for(let s=0;s<N;s++){const time=Math.min(c.duration,s/30),W={};
    for(const i of bones){const n=J.nodes[i],nm=n.name,pi=par[i],pw=pi!==undefined&&W[J.nodes[pi].name];
      const q=tr[nm+'.quaternion']?sample(tr[nm+'.quaternion'],time):new T.Quaternion(...(n.rotation||[0,0,0,1]));
      let p=new T.Vector3(...(n.translation||[0,0,0]));if(nm==='mixamorigHips'&&tr[nm+'.position'])p=sample(tr[nm+'.position'],time);
      const m=new T.Matrix4().compose(p,q,new T.Vector3(1,1,1));W[nm]=pw?pw.clone().multiply(m):m}
    for(const k in P){const m=W['mixamorig'+k];P[k].push(new T.Vector3().setFromMatrixPosition(m))}}
  const sp=(k)=>P[k].map((p,i)=>i?p.distanceTo(P[k][i-1])*30:0);
  const hs=sp('RightHand').map((v,i)=>Math.max(v,sp('LeftHand')[i]));const fs_=sp('RightFoot').map((v,i)=>Math.max(v,sp('LeftFoot')[i]));
  const v=hs.map((x,i)=>Math.max(x,fs_[i]*.9));const mx=Math.max(...v);;
  const sm=v.map((x,i)=>(v[Math.max(0,i-1)]+x*2+v[Math.min(v.length-1,i+1)])/4),thr=Math.max(330,mx*.5);
  const pk=[];for(let i=1;i<sm.length-1;i++)if(sm[i]>=thr&&sm[i]>=sm[i-1]&&sm[i]>sm[i+1]){const L=pk[pk.length-1];if(L&&i/30-L.t<.3){if(sm[i]>L.v){L.t=i/30;L.v=sm[i]}}else pk.push({t:i/30,v:sm[i]})}
  const H=pk.map(q=>[+Math.max(0,q.t-.08).toFixed(2),+Math.min(c.duration,q.t+.1).toFixed(2)]);
  out[c.name]={d:+c.duration.toFixed(2),h:H,mx:Math.round(mx)}}
console.log(JSON.stringify(out));
