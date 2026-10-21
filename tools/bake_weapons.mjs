// Bake weapon models out of big multi-sword GLBs into one small, oriented GLB each: blade along +Y, grip at the origin, flat PBR colours (textures averaged to a colour, UVs dropped).
// usage: node tools/bake_weapons.mjs <spec.json> <outdir> [preview.png]     spec: [{src, node, out, metal?, rough?}]
import {createRequire} from 'module';import fs from 'fs';import path from 'path';
const NP='/home/claude/tools_nm/node_modules',req=createRequire(NP+'/'),{chromium}=req('playwright-core');
const [specF,outD,prev]=process.argv.slice(2),spec=JSON.parse(fs.readFileSync(specF,'utf8'));fs.mkdirSync(outD,{recursive:true});
const J=p=>fs.readFileSync(NP+'/three/'+p,'utf8');
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage();pg.on('pageerror',e=>console.log('ERR',e));pg.on('console',m=>{if(m.type()==='error')console.log('C',m.text())});
await pg.setContent('<body></body>');for(const f of['build/three.min.js','examples/js/loaders/GLTFLoader.js','examples/js/exporters/GLTFExporter.js','examples/js/loaders/OBJLoader.js'])await pg.addScriptTag({content:J(f)});
const res=[];
for(const s of spec){const buf=fs.readFileSync(s.src).toString('base64'),tex=s.tex?fs.readFileSync(s.tex).toString('base64'):null;
  const r=await pg.evaluate(async({buf,s,tex})=>{
    if(s.src.endsWith('.obj')){const txt=atob(buf),obj=new THREE.OBJLoader().parse(txt);obj.name=s.node;obj.updateMatrixWorld(true);const im=new Image();await new Promise(ok=>{im.onload=ok;im.src='data:image/jpeg;base64,'+tex});obj.traverse(m=>{if(m.isMesh){m.material=new THREE.MeshStandardMaterial();m.material.map={image:im}}});window.__gl={scene:obj}}
    const ab=Uint8Array.from(atob(buf),c=>c.charCodeAt(0)).buffer;const gl=window.__gl||await new Promise((ok,no)=>new THREE.GLTFLoader().parse(ab,'',ok,no));window.__gl=null;gl.scene.updateMatrixWorld(true);
    if(s.list){const o=[];gl.scene.traverse(n=>{if(n.name&&!n.isMesh){let c=0;n.traverse(m=>{if(m.isMesh)c++});if(c)o.push(n.name)}});return{names:o}}
    let root=null;gl.scene.traverse(n=>{if(n.name===s.node&&!root)root=n});if(!root)return{err:'no node '+s.node};
    const avg=new Map(),colOf=m=>{let c=m.color?m.color.clone():new THREE.Color(.6,.6,.6);const im=m.map&&m.map.image;
      if(im&&im.width){try{const cv=document.createElement('canvas');cv.width=cv.height=8;const x=cv.getContext('2d');x.drawImage(im,0,0,8,8);const d=x.getImageData(0,0,8,8).data;let R=0,G=0,B=0;for(let i=0;i<256;i+=4){R+=d[i];G+=d[i+1];B+=d[i+2]}c.setRGB(R/64/255,G/64/255,B/64/255);c.convertSRGBToLinear()}catch(e){}}return c};
    const parts=[];root.traverse(m=>{if(!m.isMesh)return;const g=m.geometry.clone();g.applyMatrix4(m.matrixWorld);const ms=[].concat(m.material);const mm=ms[0],im=mm.map&&mm.map.image;let cv=null,px=null;if(im&&im.width){cv=document.createElement('canvas');cv.width=im.width;cv.height=im.height;const x=cv.getContext('2d');x.drawImage(im,0,0);px=x.getImageData(0,0,im.width,im.height)}parts.push({g,col:mm.color?mm.color.clone():new THREE.Color(.6,.6,.6),px,name:m.name})});
    // bounds + principal axis (longest bbox axis)
    const box=new THREE.Box3();for(const p of parts){p.g.computeBoundingBox();box.union(p.g.boundingBox)}const sz=box.getSize(new THREE.Vector3());let ax=0;if(sz.y>sz[['x','y','z'][ax]])ax=1;if(sz.z>sz[['x','y','z'][ax]])ax=2;
    const A=['x','y','z'][ax],lo=box.min[A],hi=box.max[A],L=hi-lo;
    // which end is the hilt: the tip is the end whose outer 6% is thinner (smaller cross-section)
    const thick=(from,to)=>{let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9],n=0;for(const p of parts){const a=p.g.attributes.position;for(let i=0;i<a.count;i++){const v=[a.getX(i),a.getY(i),a.getZ(i)];if(v[ax]>=from&&v[ax]<=to){n++;for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],v[k]);mx[k]=Math.max(mx[k],v[k])}}}}let w=0;for(let k=0;k<3;k++)if(k!==ax)w=Math.max(w,mx[k]-mn[k]);return n?w:0};
    const wLo=thick(lo,lo+.08*L),wHi=thick(hi-.08*L,hi);let flip=wHi>wLo;if(s.flip)flip=!flip;   // tip = thinner end; hilt end must end up at -Y
    // build matrix: axis ax -> +Y, tip up; others permuted
    const M=new THREE.Matrix4(),pick=[0,1,2].filter(k=>k!==ax),e=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
    e[ax].set(0,flip?-1:1,0);  // old axis -> new Y (sign)
    e[pick[0]].set(1,0,0);e[pick[1]].set(0,0,1);
    // make it a proper rotation (det +1)
    M.makeBasis(e[0],e[1],e[2]);if(M.determinant()<0)e[pick[1]].set(0,0,-1),M.makeBasis(e[0],e[1],e[2]);
    const sc=1/L, hilt=flip?hi:lo;const grip=(s.grip===undefined?.12:s.grip);
    const out=new THREE.Group(),mats=new Map();
    for(const p of parts){p.g.applyMatrix4(new THREE.Matrix4().makeTranslation(-(p.g.boundingBox?0:0),0,0));
      const pos=p.g.attributes.position,nor=p.g.attributes.normal;const q=new THREE.BufferGeometry();const P=new Float32Array(pos.count*3),N=new Float32Array(pos.count*3);const v=new THREE.Vector3();
      const cen=box.getCenter(new THREE.Vector3());
      for(let i=0;i<pos.count;i++){v.set(pos.getX(i),pos.getY(i),pos.getZ(i));const t=v.getComponent(ax);v.setComponent(ax,t-hilt);
        // centre across the other two axes
        v.setComponent(pick[0],v.getComponent(pick[0])-cen.getComponent(pick[0]));v.setComponent(pick[1],v.getComponent(pick[1])-cen.getComponent(pick[1]));v.applyMatrix4(M).multiplyScalar(sc);v.y+=-0+ (0);P[i*3]=v.x;P[i*3+1]=v.y;P[i*3+2]=v.z;
        if(nor){v.set(nor.getX(i),nor.getY(i),nor.getZ(i)).applyMatrix4(new THREE.Matrix4().extractRotation(M));N[i*3]=v.x;N[i*3+1]=v.y;N[i*3+2]=v.z}}
      q.setAttribute('position',new THREE.BufferAttribute(P,3));q.setAttribute('normal',new THREE.BufferAttribute(N,3));{const C=new Float32Array(pos.count*3),uv=p.g.attributes.uv,tc=new THREE.Color();for(let i=0;i<pos.count;i++){if(p.px&&uv){const w=p.px.width,h=p.px.height;let u=uv.getX(i)%1,vv=uv.getY(i)%1;if(u<0)u+=1;if(vv<0)vv+=1;const X=Math.min(w-1,Math.floor(u*w)),Y=Math.min(h-1,Math.floor(vv*h)),o=(Y*w+X)*4;tc.setRGB(p.px.data[o]/255,p.px.data[o+1]/255,p.px.data[o+2]/255).convertSRGBToLinear();tc.multiply(p.col)}else tc.copy(p.col);if(s.gain)tc.multiplyScalar(s.gain);C[i*3]=tc.r;C[i*3+1]=tc.g;C[i*3+2]=tc.b}q.setAttribute('color',new THREE.BufferAttribute(C,3))}if(p.g.index)q.setIndex(new THREE.BufferAttribute(p.g.index.array.slice(),1));
      const key='vc';let m=mats.get(key);if(!m){m=new THREE.MeshStandardMaterial({vertexColors:true,metalness:s.metal===undefined?.65:s.metal,roughness:s.rough===undefined?.45:s.rough});mats.set(key,m)}
      const mesh=new THREE.Mesh(q,m);mesh.position.y=-grip;out.add(mesh)}
    // after the hilt-end shift the hilt is at y=0 and the tip at y=1(L normalised); lowering by grip puts the grip ~12% up the length at the origin
    let tris=0;out.traverse(m=>{if(m.isMesh)tris+=(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3});
    const data=await new Promise(ok=>new THREE.GLTFExporter().parse(out,ok,e=>{throw e},{binary:true}));const u8=new Uint8Array(data);let bin='';for(let i=0;i<u8.length;i+=0x8000)bin+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));
    return{b64:btoa(bin),L,sz:sz.toArray(),tris,cols:[...mats.keys()],flip,ax}},{buf,s,tex});
  if(r.names){console.log(s.src,r.names.join(','));continue}
  if(r.err){console.log('ERR',r.err);continue}
  fs.writeFileSync(path.join(outD,s.out),Buffer.from(r.b64,'base64'));console.log(s.out,'bytes',Buffer.from(r.b64,'base64').length,'tris',r.tris,'L0',+r.L.toFixed(3),'cols',r.cols.join(','),'flip',r.flip,'ax',r.ax);res.push({out:s.out,L:r.L})}
fs.writeFileSync(path.join(outD,'_res.json'),JSON.stringify(res));await b.close();
