// Packs selected OBJ pieces of the Modular Terrain Collection into ONE compact GLB for the Warden Isles (one mesh node per piece, flat-shaded, materials baked to a dark-fantasy vertex-colour grade).
// Usage: node tools/pack_terrain.js <modular_terrain_collection dir> <out.glb>
const fs=require('fs'),path=require('path');
const dir=process.argv[2],out=process.argv[3];
const PIECES=[...[1,2,3].map(i=>'Hilly_Prop_Ruins_Pillar_'+i),...[1,2,3,4,5,6].map(i=>'Shared_Prop_Boulder_'+i),...[1,2,3,4].map(i=>'Hilly_Prop_Rock_'+i),...[1,2].map(i=>'Cliff_Prop_Rock_'+i),
  ...[1,2].map(i=>'Hilly_Prop_Tree_Cedar_'+i),...[1,2,3].map(i=>'Hilly_Prop_Tree_Pine_'+i),...[1].map(i=>'Hilly_Prop_Tree_Oak_'+i),...[1,2,3,4].map(i=>'Mountain_'+i),'Hilly_Prop_Stump_1','Hilly_Prop_Hollow_Trunk_1'].filter(n=>fs.existsSync(path.join(dir,n+'.obj')));
const mtl={};{let cur=null;for(const l of fs.readFileSync(path.join(dir,'Materials_Modular_Terrain.mtl'),'utf8').split('\n')){const t=l.trim().split(/\s+/);if(t[0]==='newmtl')cur=t[1];else if(t[0]==='Kd'&&cur)mtl[cur]=[+t[1],+t[2],+t[3]]}}
const grade=c=>{const L=.3*c[0]+.59*c[1]+.11*c[2],k=.17;return[(c[0]+(L-c[0])*.55)*k*.95,(c[1]+(L-c[1])*.55)*k*1.0,(c[2]+(L-c[2])*.55)*k*1.08]};
const meshes=[];
for(const n of PIECES){
  const V=[],pos=[],col=[],nor=[];let cur=[.5,.5,.5];
  for(const l of fs.readFileSync(path.join(dir,n+'.obj'),'utf8').split('\n')){const t=l.trim().split(/\s+/);
    if(t[0]==='v')V.push([+t[1],+t[2],+t[3]]);
    else if(t[0]==='usemtl')cur=grade(mtl[t[1]]||[.5,.5,.5]);
    else if(t[0]==='f'){const ix=t.slice(1).map(s=>{const i=parseInt(s.split('/')[0]);return i<0?V.length+i:i-1});
      for(let k=1;k<ix.length-1;k++){const a=V[ix[0]],b=V[ix[k]],c=V[ix[k+1]];
        const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];let nx=u[1]*v[2]-u[2]*v[1],ny=u[2]*v[0]-u[0]*v[2],nz=u[0]*v[1]-u[1]*v[0];const m=Math.hypot(nx,ny,nz)||1;nx/=m;ny/=m;nz/=m;
        for(const p of[a,b,c]){pos.push(...p);nor.push(nx,ny,nz);col.push(...cur)}}}}
  meshes.push({n,pos,col,nor})}
// ---- write GLB ----
const bin=[],views=[],acc=[],nodes=[],gm=[];let off=0;
const push=(arr,type)=>{const b=Buffer.from(new Float32Array(arr).buffer);const pad=(4-b.length%4)%4;views.push({buffer:0,byteOffset:off,byteLength:b.length});bin.push(b,Buffer.alloc(pad));off+=b.length+pad;return views.length-1};
meshes.forEach((m,i)=>{const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let k=0;k<m.pos.length;k+=3)for(let j=0;j<3;j++){mn[j]=Math.min(mn[j],m.pos[k+j]);mx[j]=Math.max(mx[j],m.pos[k+j])}
  const a0=acc.length;acc.push({bufferView:push(m.pos),componentType:5126,count:m.pos.length/3,type:'VEC3',min:mn,max:mx},{bufferView:push(m.nor),componentType:5126,count:m.nor.length/3,type:'VEC3'},{bufferView:push(m.col),componentType:5126,count:m.col.length/3,type:'VEC3'});
  gm.push({name:m.n,primitives:[{attributes:{POSITION:a0,NORMAL:a0+1,COLOR_0:a0+2},mode:4}]});nodes.push({name:m.n,mesh:i})});
const json={asset:{version:'2.0',generator:'pack_terrain.js'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes:gm,accessors:acc,bufferViews:views,buffers:[{byteLength:off}]};
let js=Buffer.from(JSON.stringify(json));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,32)]);const bb=Buffer.concat(bin);
const h=Buffer.alloc(12);h.writeUInt32LE(0x46546C67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+js.length+8+bb.length,8);
const c1=Buffer.alloc(8);c1.writeUInt32LE(js.length,0);c1.writeUInt32LE(0x4E4F534A,4);const c2=Buffer.alloc(8);c2.writeUInt32LE(bb.length,0);c2.writeUInt32LE(0x004E4942,4);
fs.writeFileSync(out,Buffer.concat([h,c1,js,c2,bb]));console.log(PIECES.length+' pieces ->',out,(fs.statSync(out).size/1024).toFixed(0)+' KB, '+meshes.reduce((a,m)=>a+m.pos.length/9,0)+' tris');
