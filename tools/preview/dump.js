// Dev preview (no browser needed): builds the floating island with real three.js + the real GLB kit pieces in node, flattens the scene to triangles
// for tools/preview/raster.c.  usage: THREE_DIR=/path/to/three node tools/preview/dump.js out.bin [night]
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.join(__dirname,'..','..'),TD=process.env.THREE_DIR||'/tmp/an/node_modules/three';
global.THREE=require(TD+'/build/three.cjs');global.self=global;global.window=global;global.document={createElementNS:()=>({}),createElement:()=>({getContext:()=>({fillRect(){},clearRect(){},fillStyle:''}),width:0,height:0})};global.navigator={userAgent:'node'};
vm.runInThisContext(fs.readFileSync(TD+'/examples/js/loaders/GLTFLoader.js','utf8'));
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const avg=Object.assign({},...['avg_nature.glb.json','avg_village.glb.json'].map(f=>{try{return JSON.parse(read('tools/preview/'+f))}catch(e){return {}}}));
const SINGLE_COL={lantern:[.85,.62,.3],'fountain-round':[.7,.68,.64],'stall-red':[.7,.15,.1],'stall-green':[.2,.5,.2],cart:[.45,.3,.15],tree_oak:[.25,.5,.15],tree_fat:[.3,.5,.18],tree_pineRoundA:[.12,.38,.18],plant_bushLarge:[.2,.5,.15],stone_largeA:[.55,.55,.55],rock_tallB:[.5,.5,.5]};
const load=f=>new Promise((res,rej)=>{const b=fs.readFileSync(path.join(ROOT,'assets',f));new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',res,rej)});
(async()=>{
  const origWarn=console.error;console.error=()=>{};
  const AM={};for(const n of ['lantern','fountain-round','stall-red','stall-green','cart','tree_oak','tree_fat','tree_pineRoundA','plant_bushLarge','stone_largeA','rock_tallB'])AM[n]=(await load(n+'.glb')).scene;
  for(const n of ['nature','village']){const g=await load(n+'.glb');g.scene.children.forEach(c=>AM[c.name]=c)}
  console.error=origWarn;
  for(const [n,o] of Object.entries(AM))o.traverse(m=>{if(!m.isMesh)return;m.material=m.material.clone();const a=avg[m.material.name]||SINGLE_COL[n];if(a)m.material.color.setRGB(a[0],a[1],a[2]);m.material.map=null;m.material.userData={pv:1}});
  const scene=new THREE.Scene(),solids=[],orbs=[];
  function scatter(name,th,pl){const m=AM[name];if(!m||!pl.length)return null;m.updateMatrixWorld(true);
    const bx=new THREE.Box3().setFromObject(m),k=th/(bx.max.y-bx.min.y),V=new THREE.Vector3(),Q=new THREE.Quaternion(),Sc=new THREE.Vector3(),P=new THREE.Matrix4(),M=new THREE.Matrix4(),Y=new THREE.Vector3(0,1,0);
    m.traverse(o=>{if(!o.isMesh)return;const im=new THREE.InstancedMesh(o.geometry,o.material,pl.length);
      pl.forEach((p,i)=>{V.set(p.x,p.y-bx.min.y*k*p.s,p.z);Q.setFromAxisAngle(Y,p.ry);Sc.setScalar(k*p.s);P.compose(V,Q,Sc);M.multiplyMatrices(P,o.matrixWorld);im.setMatrixAt(i,M)});scene.add(im)});
    return {w:Math.max(bx.max.x-bx.min.x,bx.max.z-bx.min.z)*k}}
  function place(par,n,x,y,z,ry,sx,sy,sz){const m=AM[n];if(!m)return null;const o=m.clone();o.position.set(x,y,z);o.rotation.y=ry;o.scale.set(sx,sy===undefined?sx:sy,sz===undefined?sx:sz);par.add(o);return o}
  const code=read('src/utils/math.js')+'\n'+read('src/utils/random.js')+'\n'+read('src/data/islands.js')+'\n'+read('src/world/SkyIsland.js')+'\nreturn {SKY,SKYI,buildSkyIsland,skyTick}';
  const A=new Function('THREE','scene','solids','orbs','scatter','place','AM',code)(THREE,scene,solids,orbs,scatter,place,AM);
  A.buildSkyIsland();A.skyTick(3000);scene.updateMatrixWorld(true);
  // flatten
  const out=[],push=(a,b,c,col,alpha,fl)=>out.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,col.r,col.g,col.b,alpha,fl);
  const va=new THREE.Vector3(),vb=new THREE.Vector3(),vc=new THREE.Vector3(),M=new THREE.Matrix4(),col=new THREE.Color(),tc=new THREE.Color();let ntri=0;
  const emit=(o,mw,ic)=>{const g=o.geometry,P=g.attributes.position,C=g.attributes.color,mat=Array.isArray(o.material)?o.material[0]:o.material,idx=g.index,n=idx?idx.count:P.count;
    const fl=(mat.side===THREE.DoubleSide?1:0),alpha=mat.transparent?mat.opacity:1;
    for(let t=0;t<n;t+=3){const i0=idx?idx.getX(t):t,i1=idx?idx.getX(t+1):t+1,i2=idx?idx.getX(t+2):t+2;
      va.fromBufferAttribute(P,i0).applyMatrix4(mw);vb.fromBufferAttribute(P,i1).applyMatrix4(mw);vc.fromBufferAttribute(P,i2).applyMatrix4(mw);
      if(mat.vertexColors&&C){col.setRGB((C.getX(i0)+C.getX(i1)+C.getX(i2))/3,(C.getY(i0)+C.getY(i1)+C.getY(i2))/3,(C.getZ(i0)+C.getZ(i1)+C.getZ(i2))/3);if(mat.userData&&mat.userData.pv)col.multiply(mat.color)}else col.copy(mat.color);
      if(ic)col.multiply(ic);if(mat.emissive&&mat.emissiveIntensity>0){col.r+=mat.emissive.r*mat.emissiveIntensity;col.g+=mat.emissive.g*mat.emissiveIntensity;col.b+=mat.emissive.b*mat.emissiveIntensity}
      if(mat.isMeshBasicMaterial&&false){}
      push(va,vb,vc,col,alpha,fl);ntri++}};
  scene.traverse(o=>{if(!o.visible)return;if(o.isInstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,M);const mw=new THREE.Matrix4().multiplyMatrices(o.matrixWorld,M);let ic=null;if(o.instanceColor){ic=tc.fromArray(o.instanceColor.array,i*3)}emit(o,mw,ic)}}else if(o.isMesh)emit(o,o.matrixWorld,null)});
  const f32=new Float32Array(out);fs.writeFileSync(process.argv[2]||'/tmp/tris.bin',Buffer.from(f32.buffer));
  console.log('triangles',ntri,'| scene objects',scene.children.length,'| solids',solids.length,'| island',JSON.stringify(A.SKY));
})();
