// Converts the "Low Poly Wild West" modular kit (FBX, centimetres, flat material colours) to one small GLB per piece in assets/west/ (metres, original pivots kept).
//   node tools/convert_west.mjs "<dir of the FBX pack>"      (needs three@0.147 resolvable from THREE_NM, default /home/claude/tools_nm/node_modules)
// Each piece becomes ONE mesh (vertices welded by colour group), with a MeshStandardMaterial per colour. Names: "Wall Door A" -> west/wall-door-a.glb. Prints a manifest (bbox in metres).
import fs from 'fs';import path from 'path';
const NM=process.env.THREE_NM||'/home/claude/tools_nm/node_modules';
globalThis.window={URL:{createObjectURL:()=>'blob:x'}};
class Img{constructor(){this.style={};this.L={}}addEventListener(t,f){this.L[t]=f}removeEventListener(){}set src(v){setTimeout(()=>this.L.load&&this.L.load.call(this,{}),0)}get src(){return''}}
globalThis.document={createElementNS:()=>new Img(),createElement:()=>({style:{}})};globalThis.self=globalThis;
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend&&this.onloadend()})}readAsDataURL(b){b.arrayBuffer().then(r=>{this.result='data:application/octet-stream;base64,'+Buffer.from(r).toString('base64');this.onloadend&&this.onloadend()})}};
const THREE=await import(NM+'/three/build/three.module.js');
const {FBXLoader}=await import(NM+'/three/examples/jsm/loaders/FBXLoader.js');
const {GLTFExporter}=await import(NM+'/three/examples/jsm/exporters/GLTFExporter.js');
const SRC=process.argv[2],OUT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..','assets','west');fs.mkdirSync(OUT,{recursive:true});
const files=[];(function rec(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);if(fs.statSync(p).isDirectory())rec(p);else if(f.endsWith('.fbx'))files.push(p)}})(SRC);
// Collision profile of a thin wall piece (thin in X, wide along Z): rasterise its triangles onto the (z,y) plane at 5 cm, drop features thinner than ~10 cm (window bars), merge into rectangles.
// -> {t:[xmin,xmax], r:[[z0,z1,y0,y1],...]} (metres, piece space). Window / door openings come out as gaps, so colliders and bullets match what you SEE.
function profile(root){
  const tris=[];let zmin=1e9,zmax=-1e9,ymin=1e9,ymax=-1e9,xmin=1e9,xmax=-1e9;
  root.updateMatrixWorld(true);const v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  root.traverse(o=>{if(!o.isMesh)return;if(['cbcbcb','8b898a'].includes(o.material.color.getHexString()))return;   // window glass / frames: shoot-through openings
    const P=o.geometry.attributes.position,I=o.geometry.index;const n=I?I.count:P.count;
    for(let i=0;i<n;i+=3){const t=[];for(let k=0;k<3;k++){const j=I?I.getX(i+k):i+k;t.push([P.getZ(j),P.getY(j)]);xmin=Math.min(xmin,P.getX(j));xmax=Math.max(xmax,P.getX(j));zmin=Math.min(zmin,P.getZ(j));zmax=Math.max(zmax,P.getZ(j));ymin=Math.min(ymin,P.getY(j));ymax=Math.max(ymax,P.getY(j))}tris.push(t)}});
  const C=.05,nz=Math.max(1,Math.ceil((zmax-zmin)/C)),ny=Math.max(1,Math.ceil((ymax-ymin)/C)),g=new Uint8Array(nz*ny);
  for(const [a,b,c] of tris){const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(d)<1e-9)continue;
    const z0=Math.max(0,Math.floor((Math.min(a[0],b[0],c[0])-zmin)/C)),z1=Math.min(nz-1,Math.floor((Math.max(a[0],b[0],c[0])-zmin)/C)),y0=Math.max(0,Math.floor((Math.min(a[1],b[1],c[1])-ymin)/C)),y1=Math.min(ny-1,Math.floor((Math.max(a[1],b[1],c[1])-ymin)/C));
    for(let iz=z0;iz<=z1;iz++)for(let iy=y0;iy<=y1;iy++){const pz=zmin+(iz+.5)*C,py=ymin+(iy+.5)*C,l1=((b[1]-c[1])*(pz-c[0])+(c[0]-b[0])*(py-c[1]))/d,l2=((c[1]-a[1])*(pz-c[0])+(a[0]-c[0])*(py-c[1]))/d,l3=1-l1-l2;if(l1>=-.15&&l2>=-.15&&l3>=-.15)g[iz*ny+iy]=1}}
  const op=(m,r)=>{const o=new Uint8Array(m.length);for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){let ok=1;for(let dz=-r;dz<=r&&ok;dz++)for(let dy=-r;dy<=r;dy++){const zz=z+dz,yy=y+dy;if(zz<0||yy<0||zz>=nz||yy>=ny)continue;if(!m[zz*ny+yy]){ok=0;break}}o[z*ny+y]=ok}return o};
  const dil=(m,r)=>{const o=new Uint8Array(m.length);for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){if(!m[z*ny+y])continue;for(let dz=-r;dz<=r;dz++)for(let dy=-r;dy<=r;dy++){const zz=z+dz,yy=y+dy;if(zz>=0&&yy>=0&&zz<nz&&yy<ny)o[zz*ny+yy]=1}}return o};
  const m=dil(op(g,1),1),used=new Uint8Array(m.length),rects=[];
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){if(!m[z*ny+y]||used[z*ny+y])continue;let z2=z;while(z2+1<nz&&m[(z2+1)*ny+y]&&!used[(z2+1)*ny+y])z2++;let y2=y;
    ext:while(y2+1<ny){for(let k=z;k<=z2;k++)if(!m[k*ny+y2+1]||used[k*ny+y2+1])break ext;y2++}
    for(let k=z;k<=z2;k++)for(let l=y;l<=y2;l++)used[k*ny+l]=1;rects.push([zmin+z*C,zmin+(z2+1)*C,ymin+y*C,ymin+(y2+1)*C].map(v=>+v.toFixed(2)))}
  return {t:[+xmin.toFixed(3),+xmax.toFixed(3)],r:rects}}
const warn=console.warn;console.warn=()=>{};
const man={};
for(const p of files){
  const buf=fs.readFileSync(p);const g=new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');g.updateMatrixWorld(true);
  const by=new Map();   // colour -> {pos,nrm}
  g.traverse(o=>{if(!o.isMesh)return;const geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld);geo.scale(.01,.01,.01);const mats=[].concat(o.material);
    const pa=geo.attributes.position,na=geo.attributes.normal,idx=geo.index;const groups=geo.groups.length?geo.groups:[{start:0,count:idx?idx.count:pa.count,materialIndex:0}];
    for(const gr of groups){const m=mats[gr.materialIndex]||mats[0],col=m.color?m.color.getHexString():'808080';let e=by.get(col);if(!e){e={pos:[],nrm:[]};by.set(col,e)}
      for(let i=gr.start;i<gr.start+gr.count;i++){const v=idx?idx.getX(i):i;e.pos.push(pa.getX(v),pa.getY(v),pa.getZ(v));if(na)e.nrm.push(na.getX(v),na.getY(v),na.getZ(v));else e.nrm.push(0,1,0)}}});
  const root=new THREE.Group();
  for(const [col,e] of by){const geo=new THREE.BufferGeometry();
    {const n=e.pos.length/3,map=new Map(),P=[],N=[],I=[],q=(v,k)=>Math.round(v*k);   // weld identical vertices (FBX meshes are un-indexed): ~3x smaller files
      for(let i=0;i<n;i++){const k=q(e.pos[i*3],4000)+','+q(e.pos[i*3+1],4000)+','+q(e.pos[i*3+2],4000)+','+q(e.nrm[i*3],60)+','+q(e.nrm[i*3+1],60)+','+q(e.nrm[i*3+2],60);let j=map.get(k);if(j===undefined){j=P.length/3;map.set(k,j);P.push(e.pos[i*3],e.pos[i*3+1],e.pos[i*3+2]);N.push(e.nrm[i*3],e.nrm[i*3+1],e.nrm[i*3+2])}I.push(j)}
      geo.setAttribute('position',new THREE.Float32BufferAttribute(P,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));geo.setIndex(I)}
    const mat=new THREE.MeshStandardMaterial({color:new THREE.Color('#'+col),roughness:.92,metalness:.02});mat.name='c'+col;const m=new THREE.Mesh(geo,mat);m.name=path.basename(p,'.fbx');root.add(m)}
  const bb=new THREE.Box3().setFromObject(root);const cat0=path.relative(SRC,path.dirname(p)).replace(/\\/g,'/');
  const name=path.basename(p,'.fbx').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const ab=await new Promise((res,rej)=>new GLTFExporter().parse(root,res,rej,{binary:true}));
  fs.writeFileSync(path.join(OUT,name+'.glb'),Buffer.from(ab));
  man[name]={min:[bb.min.x,bb.min.y,bb.min.z].map(v=>+v.toFixed(3)),max:[bb.max.x,bb.max.y,bb.max.z].map(v=>+v.toFixed(3)),cat:cat0};if(/^Modular\/(Walls|Doors)/.test(cat0)&&!/corner|wall-[bd]$|triangle|cell/.test(name))man[name].prof=profile(root);
}
fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(man));
console.log(Object.keys(man).length+' pieces, '+(fs.readdirSync(OUT).reduce((a,f)=>a+fs.statSync(path.join(OUT,f)).size,0)/1e6).toFixed(2)+' MB');
