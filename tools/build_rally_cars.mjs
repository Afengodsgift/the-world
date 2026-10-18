// Bakes the Skybreak Rally vehicles: takes the heavy source GLBs (300-500k triangles, 13-31 MB) and writes mobile-sized GLBs into assets/rally/.
//   - welds + decimates with meshoptimizer to a triangle budget (per car, below), keeping every mesh/material split
//   - normalises the pose to the game's convention: forward = +Z, up = +Y, origin at the centre of the footprint, wheels/belly on y=0, real length in metres
//   - re-encodes textures as WebP (1024 max)
// Not shipped / not part of the page: it is run offline. Setup:  npm i @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer sharp
// Usage: node tools/build_rally_cars.mjs <srcDir> <outDir>        (srcDir holds the two uploaded GLBs)
import {NodeIO} from '@gltf-transform/core';
import {flatten,join,weld,simplify,dedup,prune,getBounds,textureCompress,compactPrimitive} from '@gltf-transform/functions';
import {EXTTextureWebP} from '@gltf-transform/extensions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import path from 'path';

const CARS=[
  // id: file name in srcDir, out name, rotY: radians to rotate the source so its nose points +Z, len: real length in metres, tris: budget, fwd: source axis the nose points along
  {id:'aero',  src:'flying_car__futuristic_vehicle.glb',out:'car_aero.glb',  rotY:0,           len:4.4,tris:+(process.env.TRIS||24000),err:.08,attr:[+(process.env.WUV||6),+(process.env.WN||2)]},
  {id:'retro', src:'flying-retro_car.glb',               out:'car_retro.glb', rotY:-Math.PI/2,  len:5.0,tris:14000,err:.03},
];
const [srcDir,outDir]=process.argv.slice(2);
if(!srcDir||!outDir){console.error('usage: node build_rally_cars.mjs <srcDir> <outDir>');process.exit(1)}
await MeshoptSimplifier.ready;
// Atlas-textured models (the aero car) are full of UV seams / hard normals: plain simplify stalls at ~20 % (seams are locked), and the
// 'Permissive' flag alone collapses across the seams and smears the texture. The attribute-aware simplifier does both: it may collapse across seams
// but pays an error for every bit of UV / normal distortion it causes. gltf-transform's simplify() does not expose it, so it is called directly.
function simplifyWithAttributes(doc,ratio,err,wUV,wN){
  for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
    const ia=prim.getIndices();if(!ia)continue;
    const idx=Uint32Array.from(ia.getArray()),pos=Float32Array.from(prim.getAttribute('POSITION').getArray()),n=pos.length/3;
    const uv=prim.getAttribute('TEXCOORD_0'),nm=prim.getAttribute('NORMAL'),A=new Float32Array(n*5);
    for(let i=0;i<n;i++){if(uv){A[i*5]=uv.getElement(i,[])[0];A[i*5+1]=uv.getElement(i,[])[1]}if(nm){const v=nm.getElement(i,[]);A[i*5+2]=v[0];A[i*5+3]=v[1];A[i*5+4]=v[2]}}
    const target=Math.max(30,Math.floor(idx.length*ratio/3)*3);
    const [out]=MeshoptSimplifier.simplifyWithAttributes(idx,pos,3,A,5,[wUV,wUV,wN,wN,wN],null,target,err,['Permissive','Prune']);
    ia.setArray(n<65536?Uint16Array.from(out):out);compactPrimitive(prim);
  }
}
const io=new NodeIO().registerExtensions([EXTTextureWebP]);

for(const car of CARS){
  const doc=await io.read(path.join(srcDir,car.src));
  const root=doc.getRoot(),scene=root.listScenes()[0];
  const tris=()=>root.listMeshes().reduce((a,m)=>a+m.listPrimitives().reduce((b,p)=>b+(p.getIndices()?p.getIndices().getCount()/3:0),0),0);
  const t0=tris();
  if(car.attr)await doc.transform(flatten(),join({keepMeshes:false,keepNamed:false}));   // one mesh: the simplifier must see the whole car, or inner layers poke through the outer shell
  await doc.transform(weld({tolerance:1e-4*Math.max(...[0,1,2].map(i=>{const b=getBounds(scene);return b.max[i]-b.min[i]}))}));
  if(car.attr)simplifyWithAttributes(doc,Math.min(1,car.tris/t0),car.err,car.attr[0],car.attr[1]);
  else await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:Math.min(1,car.tris/t0),error:car.err,lockBorder:false}));
  await doc.transform(dedup(),prune());
  // pose: wrap everything in one node (rotate nose -> +Z, scale to real length, put the belly on y=0 and centre the footprint)
  const b=getBounds(scene),c=Math.cos(car.rotY),s=Math.sin(car.rotY);
  const rot=(x,z)=>[x*c+z*s,-x*s+z*c];
  const xs=[],zs=[];for(const x of [b.min[0],b.max[0]])for(const z of [b.min[2],b.max[2]]){const [rx,rz]=rot(x,z);xs.push(rx);zs.push(rz)}
  const lenZ=Math.max(...zs)-Math.min(...zs),k=car.len/lenZ;
  const cx=(Math.max(...xs)+Math.min(...xs))/2,cz=(Math.max(...zs)+Math.min(...zs))/2;
  const wrap=doc.createNode('car').setRotation([0,Math.sin(car.rotY/2),0,Math.cos(car.rotY/2)]).setScale([k,k,k]);
  // translation applies after rotation+scale: the node maps p -> T + R*S*p, so T = (-cx*k, -minY*k, -cz*k) with cx/cz already rotated
  wrap.setTranslation([-cx*k,-b.min[1]*k,-cz*k]);
  for(const n of scene.listChildren()){scene.removeChild(n);wrap.addChild(n)}
  scene.addChild(wrap);
  await doc.transform(textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:78}));
  await io.write(path.join(outDir,car.out),doc);
  const o=getBounds(doc.getRoot().listScenes()[0]);
  console.log(`${car.id}: ${t0} -> ${Math.round(tris())} tris, size ${[0,1,2].map(i=>(o.max[i]-o.min[i]).toFixed(2)).join(' x ')} m (x,y,z), min y ${o.min[1].toFixed(3)}`);
}
