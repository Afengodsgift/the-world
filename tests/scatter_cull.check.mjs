// Regression test for chunked vegetation (scatter): counts preserved, culling spheres correct, frustum + distance culling work.
// Run: NODE_PATH=<dir>/node_modules node tests/scatter_cull.check.mjs (part of tests/run_all.sh)
import fs from 'fs';import path from 'path';import {pathToFileURL} from 'url';
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));
if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);
globalThis.THREE=T;
(0,eval)(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname),'..','src/core/StaticBatch.js'),'utf8').replace('const StaticBatch=','globalThis.StaticBatch='));   // scatter() freezes its chunks via the real StaticBatch
const html=fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname),'..','index.html'),'utf8');
const a=html.indexOf('const VEG=[];'),b=html.indexOf('function place(par,n,x,y,z,ry,sx,sy,sz){');
globalThis.scene=new T.Scene();globalThis.camera=new T.PerspectiveCamera(65,2,.1,4200);
// fake tree asset: 2 sub-meshes, ~9m tall unscaled 2
const mk=()=>{const g=new T.Group();for(let i=0;i<2;i++){g.add(new T.Mesh(new T.ConeGeometry(1,2+i,6),new T.MeshBasicMaterial()))}return g};
globalThis.AM={tree:mk()};
(0,eval)(html.slice(a,b).replace('const VEG=[];','globalThis.VEG=[];').replace('function vegCull','globalThis.vegCull=function vegCull').replace('function scatter','globalThis.scatter=function scatter'));
let seed=7;const r=()=>(seed=(seed*16807)%2147483647)/2147483647;
const pl=[];for(let i=0;i<2000;i++){const ang=r()*6.28,rad=r()*900;pl.push({x:Math.cos(ang)*rad+500,y:r()*10,z:Math.sin(ang)*rad-300,ry:r()*6.28,s:.8+r()*.6})}
const res=scatter('tree',9,pl);
const ims=[];scene.traverse(o=>{if(o.isInstancedMesh)ims.push(o)});
let total=0,bad=0;
// instances per sub-mesh must sum to pl.length; every instance origin inside its mesh's sphere
const bySub={};
for(const im of ims){const key=im.geometry.attributes.position.count;bySub[key]=(bySub[key]||0)+im.count;
  const sph=im.geometry.boundingSphere,p=new T.Vector3(),m=new T.Matrix4();
  for(let i=0;i<im.count;i++){im.getMatrixAt(i,m);p.setFromMatrixPosition(m);if(p.distanceTo(sph.center)>sph.radius)bad++}}
console.log('cells/meshes:',ims.length,'| per-submesh instance totals:',Object.values(bySub).join(','),'(expect 4000 = 2 submeshes x 2000)','| instances outside sphere:',bad);
// shares GPU buffers with the source geometry
const src=AM.tree.children[0].geometry;console.log('shares position buffer:',ims.some(im=>im.geometry.attributes.position===src.attributes.position));
// frustum culling: camera at origin looking +x; count how many cells pass
camera.position.set(500,20,-300);camera.lookAt(5000,20,-300);camera.updateMatrixWorld();camera.updateProjectionMatrix();
const fr=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
let vis=0;for(const im of ims)if(fr.intersectsObject(im))vis++;
console.log('frustum-visible cells looking east:',vis,'of',ims.length);
// distance cull
scene.fog=new T.Fog('#fff',150,1700);vegCull();console.log('visible after distance cull (lim',Math.round(1700*.72),'):',ims.filter(i=>i.visible).length,'of',ims.length);
process.exit(bad||Object.values(bySub).some(v=>v!==4000)||vis>=ims.length?1:0);
