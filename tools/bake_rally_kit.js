// Bakes the handful of Modular Race Kart props the Rally uses from the kit's OBJ/MTL files into one small JSON (flat triangles + vertex colours),
// so the game needs no OBJ/MTL loader. Usage: node tools/bake_rally_kit.js <kit-dir> [out.json]   (default out: assets/rally/kit.json)
const fs=require('fs'),path=require('path');
const dir=process.argv[2],out=process.argv[3]||path.join(__dirname,'..','assets','rally','kit.json');
if(!dir){console.error('usage: node tools/bake_rally_kit.js <kit-dir> [out.json]');process.exit(1)}
const PROPS={ramp:'Prop_Track_Ramp',ramp_boost:'Prop_Track_Ramp_Speed_Boost',ramp_rail:'Prop_Track_Ramp_Railing',arch:'Prop_Track_Arch_1x4',finish:'Prop_Track_Banner_Finish_Line_Double_Checkered',
  sign90:'Prop_Track_Sign_Upcoming_Curve_90',sign180:'Prop_Track_Sign_Upcoming_Curve_180',signS:'Prop_Track_Sign_Upcoming_Esse',hay:'Prop_Decorative_Hay_Pile',bale:'Prop_Decorative_Hay_Bale_Box',
  rail:'Prop_Decorative_Fence_Railing',post:'Prop_Decorative_Fence_Post',bump:'Prop_Track_Bump_Small_Row',rock:'Prop_Decorative_Rock_3',rock2:'Prop_Decorative_Rock_5'};
function mtl(f){const m={};let cur=null;if(!fs.existsSync(f))return m;for(const l of fs.readFileSync(f,'utf8').split('\n')){const t=l.trim().split(/\s+/);if(t[0]==='newmtl')cur=t[1];else if(t[0]==='Kd'&&cur)m[cur]=[+t[1],+t[2],+t[3]]}return m}
const r=x=>Math.round(x*1000)/1000,res={};
for(const [k,name] of Object.entries(PROPS)){
  const f=path.join(dir,name+'.obj');if(!fs.existsSync(f)){console.error('missing',f);continue}
  const M=mtl(path.join(dir,name+'.mtl')),V=[],N=[],pos=[],nor=[],col=[];let cur=[.7,.7,.7];
  for(const l of fs.readFileSync(f,'utf8').split('\n')){const t=l.trim().split(/\s+/);
    if(t[0]==='v')V.push([+t[1],+t[2],+t[3]]);else if(t[0]==='vn')N.push([+t[1],+t[2],+t[3]]);else if(t[0]==='usemtl')cur=M[t[1]]||[.7,.7,.7];
    else if(t[0]==='f'){const ix=t.slice(1).map(s=>{const a=s.split('/');return [+a[0]-1,a[2]?+a[2]-1:-1]});
      for(let i=1;i<ix.length-1;i++)for(const q of [ix[0],ix[i],ix[i+1]]){pos.push(...V[q[0]].map(r));nor.push(...(q[1]>=0?N[q[1]]:[0,1,0]).map(r));col.push(...cur.map(r))}}}
  res[k]={p:pos,n:nor,c:col};
}
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(res));
console.log('wrote',out,(fs.statSync(out).size/1024).toFixed(0)+' KB',Object.entries(res).map(([k,v])=>k+':'+v.p.length/9+'t').join(' '));
