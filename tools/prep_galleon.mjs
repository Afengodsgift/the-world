// Prepares the Sketchfab "low-poly pirate ship" (galleon) for the game: bakes the node transforms (Unreal cm / Z-up / 24 deg yaw) into the vertices, aligns the hull with +Z = bow,
// centres it (keel on y = 0, hull centred on x/z), scales it, drops the decorations we draw ourselves (cannons, bottles, cups ...), repaints the near-black materials with a readable
// palette and writes ONE mesh with one primitive per material (so tools/bake_decks.mjs can read it) to assets/ships/galleon.glb.
// Usage: node tools/prep_galleon.mjs <in.glb> [scale=0.62] [--info]
import fs from 'fs';import path from 'path';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const inF=process.argv[2],SC=+(process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3]:.62),INFO=process.argv.includes('--info');
const b=fs.readFileSync(inF),jl=b.readUInt32LE(12),J=JSON.parse(b.slice(20,20+jl).toString()),bin=b.slice(20+jl+8);
// ---- matrices ----
const I4=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const mul=(a,c)=>{const o=new Array(16).fill(0);for(let i=0;i<4;i++)for(let k=0;k<4;k++)for(let j=0;j<4;j++)o[k*4+i]+=a[j*4+i]*c[k*4+j];return o};   // column-major a*c
const local=n=>{if(n.matrix)return n.matrix;let m=I4();const t=n.translation||[0,0,0],q=n.rotation||[0,0,0,1],s=n.scale||[1,1,1];
  const [x,y,z,w]=q,r=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0,2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0,2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0,0,0,0,1];
  m=[r[0]*s[0],r[1]*s[0],r[2]*s[0],0,r[4]*s[1],r[5]*s[1],r[6]*s[1],0,r[8]*s[2],r[9]*s[2],r[10]*s[2],0,t[0],t[1],t[2],1];return m};
const world={};const walk=(i,pm)=>{const m=mul(pm,local(J.nodes[i]));world[i]=m;for(const c of J.nodes[i].children||[])walk(c,m)};for(const r of J.scenes[0].nodes)walk(r,I4());
const rd=(acc,N)=>{const a=J.accessors[acc],bv=J.bufferViews[a.bufferView],o=bin.byteOffset+(bv.byteOffset||0)+(a.byteOffset||0);
  if(a.componentType===5126)return new Float32Array(bin.buffer.slice(o,o+a.count*N*4));if(a.componentType===5125)return new Uint32Array(bin.buffer.slice(o,o+a.count*4));if(a.componentType===5123)return Uint16Array.from(new Uint16Array(bin.buffer.slice(o,o+a.count*2)));throw new Error('type '+a.componentType)};
// ---- palette: by material name (the file's own colours are linear and almost black) ----
const PAL={Metal_Dark:'#4a4f57',Metal_Light:'#8b929c',Gold_Dark:'#c9962a',Gold_Light:'#e8c04a',Rope:'#b79a62',Wood_Light:'#9a6a3c',Wood_Dark:'#5a3820',Sail_02:'#efe6cd',Sail_01:'#e4d9bd',Wood_Maroon:'#7b2e22',Window:'#9ccfe0',lambert1:'#9a7b55',Shadows:'#1c1410',Flag_02:'#17171b',
  Base_Wood_Dark:'#6a4a2c',Barrel_Wood_2:'#8a5a2a',Barrel_Wood_1:'#74481f'};
const DROP=/Cannon|Cups|Bottle|lambert23|Black_Powder|Rum|Shadows/;
const hex=h=>{const c=parseInt(h.slice(1),16);const f=v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)};return [f(c>>16&255),f(c>>8&255),f(c&255),1]};
// ---- gather ----
const parts=[];
J.nodes.forEach((n,i)=>{if(n.mesh===undefined)return;const mesh=J.meshes[n.mesh],M=world[i],mat=J.materials[mesh.primitives[0].material],nm=(mat.name||mesh.name).replace(/^M_/,'').replace(/^MI_/,'');
  if(DROP.test(mesh.name))return;
  const p=mesh.primitives[0],P=rd(p.attributes.POSITION,3),Nn=rd(p.attributes.NORMAL,3),idx=p.indices!==undefined?rd(p.indices,1):[...Array(P.length/3).keys()];
  const pos=new Float32Array(P.length),nor=new Float32Array(P.length);
  for(let k=0;k<P.length;k+=3){const x=P[k],y=P[k+1],z=P[k+2];pos[k]=M[0]*x+M[4]*y+M[8]*z+M[12];pos[k+1]=M[1]*x+M[5]*y+M[9]*z+M[13];pos[k+2]=M[2]*x+M[6]*y+M[10]*z+M[14];
    const a=Nn[k],c=Nn[k+1],d=Nn[k+2];let nx=M[0]*a+M[4]*c+M[8]*d,ny=M[1]*a+M[5]*c+M[9]*d,nz=M[2]*a+M[6]*c+M[10]*d;const l=Math.hypot(nx,ny,nz)||1;nor[k]=nx/l;nor[k+1]=ny/l;nor[k+2]=nz/l}
  parts.push({name:nm,pos,nor,idx:Uint32Array.from(idx),mat})});
// ---- orientation: principal axis of the hull wood in the ground plane -> Z ----
const hull=parts.filter(p=>/^Wood_Dark$/.test(p.name))[0];
const HY=14;                                              // native metres: below this it is hull planking, above are yards and masts
let mx=0,mz=0,N=0;for(let k=0;k<hull.pos.length;k+=3)if(hull.pos[k+1]<HY){mx+=hull.pos[k];mz+=hull.pos[k+2];N++}mx/=N;mz/=N;
let sxx=0,szz=0,sxz=0;for(let k=0;k<hull.pos.length;k+=3){if(hull.pos[k+1]>=HY)continue;const dx=hull.pos[k]-mx,dz=hull.pos[k+2]-mz;sxx+=dx*dx;szz+=dz*dz;sxz+=dx*dz}
const ang=.5*Math.atan2(2*sxz,sxx-szz);                  // direction of the long axis (from +x toward +z)
// rotate by theta about Y so that the long axis -> +Z:  axis=(cos a,sin a) in (x,z); we want it at (0,1) => rotate by (PI/2 - a)
const th=ang-Math.PI/2,ct=Math.cos(th),st=Math.sin(th);   // (x,z)->(x*ct - z*st... ) see rot()
const rot=(x,z)=>[x*ct+z*st,-x*st+z*ct];                  // rotation about Y by th
for(const p of parts)for(let k=0;k<p.pos.length;k+=3){[p.pos[k],p.pos[k+2]]=rot(p.pos[k],p.pos[k+2]);[p.nor[k],p.nor[k+2]]=rot(p.nor[k],p.nor[k+2])}
// bow = the narrower end of the hull; the stern end carries the tall castle
const ends=(s)=>{let z0=1e9,z1=-1e9;for(let k=2;k<hull.pos.length;k+=3){if(hull.pos[k-1]>=HY)continue;z0=Math.min(z0,hull.pos[k]);z1=Math.max(z1,hull.pos[k])}
  const L=z1-z0,w=(lo,hi)=>{let a=1e9,c=-1e9,top=0;for(let k=0;k<hull.pos.length;k+=3){const z=hull.pos[k+2];if(hull.pos[k+1]<HY&&z>=lo&&z<=hi){a=Math.min(a,hull.pos[k]);c=Math.max(c,hull.pos[k]);top=Math.max(top,hull.pos[k+1])}}return {w:c-a,top}};
  return {z0,z1,L,lo:w(z0,z0+L*.12),hi:w(z1-L*.12,z1)}};
const E=ends();let flip=E.lo.w<E.hi.w;                    // lo end narrower => the bow is at -Z => turn around
if(INFO)console.log('ang(deg)',(ang*57.3).toFixed(1),'hull length',E.L.toFixed(1),'ends',JSON.stringify(E.lo),JSON.stringify(E.hi),'bow at',flip?'-Z (will flip)':'+Z');
if(flip)for(const p of parts)for(let k=0;k<p.pos.length;k+=3){p.pos[k]*=-1;p.pos[k+2]*=-1;p.nor[k]*=-1;p.nor[k+2]*=-1}
// centre on the hull, keel on y=0, scale
let x0=1e9,x1=-1e9,y0=1e9,z0=1e9,z1=-1e9;for(const p of parts)if(p.name!=='Rope'&&p.name!=='Sail_01'&&p.name!=='Sail_02'){for(let k=0;k<p.pos.length;k+=3){y0=Math.min(y0,p.pos[k+1])}}
for(let k=0;k<hull.pos.length;k+=3){if(hull.pos[k+1]>=HY)continue;x0=Math.min(x0,hull.pos[k]);x1=Math.max(x1,hull.pos[k]);z0=Math.min(z0,hull.pos[k+2]);z1=Math.max(z1,hull.pos[k+2])}
const cx=(x0+x1)/2,cz=(z0+z1)/2;
for(const p of parts)for(let k=0;k<p.pos.length;k+=3){p.pos[k]=(p.pos[k]-cx)*SC;p.pos[k+1]=(p.pos[k+1]-y0)*SC;p.pos[k+2]=(p.pos[k+2]-cz)*SC}
if(INFO){let ymax=0;for(const p of parts)for(let k=1;k<p.pos.length;k+=3)ymax=Math.max(ymax,p.pos[k]);console.log('final: length',((z1-z0)*SC).toFixed(1),'beam',((x1-x0)*SC).toFixed(1),'height',ymax.toFixed(1),'parts',parts.map(p=>p.name).join(','))}
// ---- write one mesh, one primitive per part ----
const chunks=[],views=[],accs=[];let off=0;
const add=(arr,target)=>{const buf=Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength),pad=(4-buf.length%4)%4;views.push({buffer:0,byteOffset:off,byteLength:buf.length,target});chunks.push(buf,Buffer.alloc(pad));off+=buf.length+pad;return views.length-1};
const prims=[],mats=[];
for(const p of parts){
  let lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];for(let k=0;k<p.pos.length;k+=3)for(let c=0;c<3;c++){lo[c]=Math.min(lo[c],p.pos[k+c]);hi[c]=Math.max(hi[c],p.pos[k+c])}
  const ap=accs.push({bufferView:add(p.pos,34962),componentType:5126,count:p.pos.length/3,type:'VEC3',min:lo,max:hi})-1,an=accs.push({bufferView:add(p.nor,34962),componentType:5126,count:p.nor.length/3,type:'VEC3'})-1,ai=accs.push({bufferView:add(p.idx,34963),componentType:5125,count:p.idx.length,type:'SCALAR'})-1;
  const col=hex(PAL[p.name]||'#8a7a66'),win=p.name==='Window';mats.push({name:p.name,pbrMetallicRoughness:{baseColorFactor:win?[col[0],col[1],col[2],.7]:col,metallicFactor:/Metal|Gold/.test(p.name)?.5:0,roughnessFactor:.75},doubleSided:true,alphaMode:win?'BLEND':'OPAQUE'});
  prims.push({attributes:{POSITION:ap,NORMAL:an},indices:ai,material:mats.length-1})}
const out={asset:{version:'2.0',generator:'tools/prep_galleon.mjs'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'galleon',mesh:0}],meshes:[{name:'galleon',primitives:prims}],materials:mats,accessors:accs,bufferViews:views,buffers:[{byteLength:off}]};
const js=Buffer.from(JSON.stringify(out)),jp=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,32)]),bn=Buffer.concat(chunks),hd=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
hd.writeUInt32LE(0x46546C67,0);hd.writeUInt32LE(2,4);hd.writeUInt32LE(12+8+jp.length+8+bn.length,8);jh.writeUInt32LE(jp.length,0);jh.writeUInt32LE(0x4E4F534A,4);bh.writeUInt32LE(bn.length,0);bh.writeUInt32LE(0x004E4942,4);
fs.mkdirSync(path.join(ROOT,'assets/ships'),{recursive:true});const o=path.join(ROOT,'assets/ships/galleon.glb');fs.writeFileSync(o,Buffer.concat([hd,jh,jp,bh,bn]));
console.log('wrote',o,(fs.statSync(o).size/1e6).toFixed(2)+' MB');
