// Bakes the WALKABLE surface of each ship model into src/data/decks.js: a top-down height grid (cell = 0.2 model units) so the player can really stand on the
// deck, the raised stern deck, the stairs and the rails, and is blocked by the bulwarks and cabin walls. Run: node tools/bake_decks.mjs   (reads assets/ships/*.glb)
// Only upward-facing surfaces below YMAX count (masts, spars and sails are above it). Surfaces under 1.2 are the hull bottom, i.e. water. Holes inside the hull (hatches) are filled.
import fs from 'fs';import path from 'path';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
// per model: file, grid cell (model units), the band of heights that counts as floor (above ymax = masts / sails; below ymin = hull bottom = water), and the level that pits shallower than `pit` are raised to
const CFG={'ship-medium':{f:'assets/ships/ship-medium.glb',cs:.2,ymin:1.2,ymax:5.0,pit:2.0,fill:2.1},'ship-pirate-small':{f:'assets/ships/ship-pirate-small.glb',cs:.2,ymin:1.2,ymax:5.0,pit:2.0,fill:2.1},
  'ship-pirate-medium':{f:'assets/ships/ship-pirate-medium.glb',cs:.2,ymin:1.2,ymax:5.0,pit:2.0,fill:2.1},'ship-pirate-large':{f:'assets/ships/ship-pirate-large.glb',cs:.2,ymin:1.2,ymax:5.0,pit:2.0,fill:2.1},
  'pp-ship':{f:'assets/pirates/ship.glb',cs:.25,ymin:2.0,ymax:7.0,pit:2.9,fill:3.0},'pp-ship-001':{f:'assets/pirates/ship_001.glb',cs:.25,ymin:2.0,ymax:7.5,pit:3.4,fill:3.5}};
const MODELS=Object.keys(CFG);
function hullTris(f){
  const b=fs.readFileSync(f),n=b.readUInt32LE(12),j=JSON.parse(b.slice(20,20+n).toString()),bin=b.slice(20+n+8),m=j.meshes[0],T=[];
  for(const p of m.primitives){
    const a=j.accessors[p.attributes.POSITION],bv=j.bufferViews[a.bufferView],P=new Float32Array(bin.buffer.slice(bin.byteOffset+(bv.byteOffset||0)+(a.byteOffset||0),bin.byteOffset+(bv.byteOffset||0)+(a.byteOffset||0)+a.count*12));
    let idx;if(p.indices!==undefined){const ia=j.accessors[p.indices],ib=j.bufferViews[ia.bufferView],o=bin.byteOffset+(ib.byteOffset||0)+(ia.byteOffset||0);
      idx=ia.componentType===5123?new Uint16Array(bin.buffer.slice(o,o+ia.count*2)):new Uint32Array(bin.buffer.slice(o,o+ia.count*4))}else{idx=[...Array(a.count).keys()]}
    for(let i=0;i<idx.length;i+=3){const q=[idx[i],idx[i+1],idx[i+2]].map(k=>[P[k*3],P[k*3+1],P[k*3+2]]);T.push(q)}}
  return T}
// 93 printable symbols (no quote / backslash): symbol 0 = no floor, symbol k = floor height (k-1)/10
const SYM=[...Array(95).keys()].map(i=>String.fromCharCode(32+i)).filter(c=>c!=='"'&&c!=='\\');
function bake(name){
  const {cs:CS,ymin:YMIN,ymax:YMAX,pit,fill}=CFG[name],T=hullTris(path.join(ROOT,CFG[name].f));let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(const t of T)for(const v of t){x0=Math.min(x0,v[0]);x1=Math.max(x1,v[0]);z0=Math.min(z0,v[2]);z1=Math.max(z1,v[2])}
  x0=Math.floor((x0-.2)/CS)*CS;z0=Math.floor((z0-.2)/CS)*CS;const nx=Math.ceil((x1+.2-x0)/CS),nz=Math.ceil((z1+.2-z0)/CS),h=new Float32Array(nx*nz).fill(-1);
  for(const [A,B,C] of T){
    // face normal (y component) from the cross product of two edges; only upward faces are floors
    const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],vx=C[0]-A[0],vy=C[1]-A[1],vz=C[2]-A[2];
    const nxn=uy*vz-uz*vy,nyn=uz*vx-ux*vz,nzn=ux*vy-uy*vx,len=Math.hypot(nxn,nyn,nzn)||1;if(nyn/len<.35)continue;
    const bx0=Math.max(0,Math.floor((Math.min(A[0],B[0],C[0])-x0)/CS)),bx1=Math.min(nx-1,Math.floor((Math.max(A[0],B[0],C[0])-x0)/CS)),bz0=Math.max(0,Math.floor((Math.min(A[2],B[2],C[2])-z0)/CS)),bz1=Math.min(nz-1,Math.floor((Math.max(A[2],B[2],C[2])-z0)/CS));
    const d=(B[2]-C[2])*(A[0]-C[0])+(C[0]-B[0])*(A[2]-C[2]);if(Math.abs(d)<1e-9)continue;
    for(let iz=bz0;iz<=bz1;iz++)for(let ix=bx0;ix<=bx1;ix++){
      const px=x0+(ix+.5)*CS,pz=z0+(iz+.5)*CS,l1=((B[2]-C[2])*(px-C[0])+(C[0]-B[0])*(pz-C[2]))/d,l2=((C[2]-A[2])*(px-C[0])+(A[0]-C[0])*(pz-C[2]))/d,l3=1-l1-l2,e=-.02;
      if(l1<e||l2<e||l3<e)continue;const y=l1*A[1]+l2*B[1]+l3*C[1];if(y>YMAX||y<YMIN)continue;if(y>h[iz*nx+ix])h[iz*nx+ix]=y}}
  // holes inside the hull (a hatch) are not water: flood the empty cells from the outside, whatever is not reached is filled up to the lowest surrounding floor
  const out=new Uint8Array(nx*nz),st=[];const push=(ix,iz)=>{if(ix<0||iz<0||ix>=nx||iz>=nz)return;const i=iz*nx+ix;if(out[i]||h[i]>=0)return;out[i]=1;st.push(i)};
  for(let i=0;i<nx;i++){push(i,0);push(i,nz-1)}for(let k=0;k<nz;k++){push(0,k);push(nx-1,k)}
  while(st.length){const i=st.pop(),ix=i%nx,iz=(i/nx)|0;push(ix+1,iz);push(ix-1,iz);push(ix,iz+1);push(ix,iz-1)}
  let filled=0;for(let pass=0;pass<6;pass++)for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){const i=iz*nx+ix;if(h[i]>=0||out[i])continue;
    let m=1e9;for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=ix+a,z=iz+b;if(x<0||z<0||x>=nx||z>=nz)continue;const v=h[z*nx+x];if(v>=0)m=Math.min(m,v)}if(m<1e9){h[i]=m;filled++}}
  // pits (a hatch) are raised to deck level so nobody falls into the hold
  for(let i=0;i<h.length;i++)if(h[i]>=0&&h[i]<pit)h[i]=fill;
  const rows=[];for(let iz=0;iz<nz;iz++){let s='';for(let ix=0;ix<nx;ix++){const v=h[iz*nx+ix];s+=v<0?SYM[0]:SYM[1+Math.max(0,Math.min(SYM.length-2,Math.round(v*10)))]}rows.push(s)}
  return {cs:CS,x0:+x0.toFixed(2),z0:+z0.toFixed(2),nx,nz,rows,filled,cells:[...h].filter(v=>v>=0).length}}
const out={sym:SYM.join(''),models:{}};
for(const m of MODELS){const b=bake(m);out.models[m]={cs:b.cs,x0:b.x0,z0:b.z0,nx:b.nx,nz:b.nz,rows:b.rows};console.log(m,b.nx+'x'+b.nz,'cells',b.cells,'filled',b.filled)}
const js='// GENERATED by tools/bake_decks.mjs from assets/ships/*.glb: do not edit by hand. Walkable height grid of every ship model (model units, before scale).\n'
 +'// rows[iz][ix]: index in `sym` minus 1 = floor height x10 (0.1 model units), index 0 (a space) = no floor (water / outside the hull). Cell (ix,iz) covers x in [x0+ix*cs, +cs), z in [z0+iz*cs, +cs).\nconst DECKS='+JSON.stringify(out)+';\n';
fs.writeFileSync(path.join(ROOT,'src/data/decks.js'),js);console.log('wrote src/data/decks.js',js.length,'bytes');
if(process.argv[2]==='--ascii'){const A='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';for(const m of process.argv.slice(3).length?process.argv.slice(3):MODELS){console.log('\n'+m+'  (letter = floor height x10 - 10: b=2.1 for kenney, etc.)');for(const r of out.models[m].rows)console.log(r.split('').map(c=>c===SYM[0]?' ':A[Math.min(61,Math.max(0,SYM.indexOf(c)-1-10))]).join(''))}}
