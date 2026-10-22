// Builds assets/warden/dungeon.glb (the Warden catacomb kit) from the uploaded CC0 modular dungeon packs.
//   node tools/dungeon_kit.mjs list <fbxdir|file>...            prints every mesh (bbox, tris)       |   node tools/dungeon_kit.mjs sheet <out.png> <fbx>...   renders a contact sheet
//   node tools/dungeon_kit.mjs build <spec.json> <out.glb>       spec: {tex?, pieces:[{name,src,node?,rotX?,sc?}]}  -> one scene, each piece a Group named `name`, origin at floor centre, Y up, metres
import {createRequire} from 'module';import fs from 'fs';import path from 'path';
const NP='/home/claude/tools_nm/node_modules',req=createRequire(NP+'/'),{chromium}=req('playwright-core');const J=p=>fs.readFileSync(NP+'/three/'+p,'utf8');
const [cmd,...args]=process.argv.slice(2);
const files=a=>a.flatMap(x=>fs.statSync(x).isDirectory()?fs.readdirSync(x).filter(f=>/\.fbx$/i.test(f)).map(f=>path.join(x,f)):[x]);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage({viewport:{width:1600,height:700}});pg.on('pageerror',e=>console.log('ERR',e));
await pg.setContent('<body style="margin:0"></body>');for(const f of['build/three.min.js','examples/js/libs/fflate.min.js','examples/js/loaders/FBXLoader.js','examples/js/exporters/GLTFExporter.js'])await pg.addScriptTag({content:J(f)});
await pg.evaluate(()=>{window.LOAD=async b64=>{const ab=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer;return new THREE.FBXLoader().parse(ab,'')};
  window.INFO=g=>{g.updateMatrixWorld(true);const out=[];g.traverse(o=>{if(o.isMesh){const bb=new THREE.Box3().setFromObject(o),s=bb.getSize(new THREE.Vector3()),c=bb.getCenter(new THREE.Vector3());out.push({n:o.name,tris:Math.round((o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3),size:s.toArray().map(v=>+v.toFixed(2)),min:bb.min.toArray().map(v=>+v.toFixed(2)),mats:[].concat(o.material).map(m=>m.name+':'+(m.map?'tex':m.color&&m.color.getHexString()))})}});return out}});
if(cmd==='list'){for(const f of files(args)){const r=await pg.evaluate(async b=>INFO(await LOAD(b)),fs.readFileSync(f).toString('base64'));console.log(path.basename(f),JSON.stringify(r.slice(0,40)))}}
if(cmd==='sheet'){const [out,...fs_]=args,fl=files(fs_);const data=fl.map(f=>fs.readFileSync(f).toString('base64'));
  await pg.evaluate(async({data,names})=>{const r=new THREE.WebGLRenderer({antialias:true});r.setSize(1600,700);document.body.appendChild(r.domElement);r.setClearColor(0x444a55);r.setScissorTest(true);
    const cols=Math.min(names.length,8),rows=Math.ceil(names.length/cols),w=1600/cols,h=700/rows;
    for(let i=0;i<names.length;i++){const g=await LOAD(data[i]);const sc=new THREE.Scene();sc.add(new THREE.HemisphereLight(0xffffff,0x555566,1.4));const d=new THREE.DirectionalLight(0xffffff,1);d.position.set(2,3,4);sc.add(d);sc.add(g);
      const bb=new THREE.Box3().setFromObject(g),c=bb.getCenter(new THREE.Vector3()),s=bb.getSize(new THREE.Vector3()).length();const cam=new THREE.PerspectiveCamera(35,w/h,.1,1e5);cam.position.copy(c).add(new THREE.Vector3(.8,.7,1.2).multiplyScalar(s*.9));cam.lookAt(c);
      const x=(i%cols)*w,y=700-(Math.floor(i/cols)+1)*h;r.setViewport(x,y,w,h);r.setScissor(x,y,w,h);r.render(sc,cam)}},{data,names:fl.map(f=>path.basename(f))});
  await pg.screenshot({path:out});console.log(fl.map((f,i)=>i+':'+path.basename(f)).join(' '))}
if(cmd==='sheetn'){const [out,f,...pick]=args;const b64=fs.readFileSync(f).toString('base64');
  const names=await pg.evaluate(async({b64,pick})=>{const r=new THREE.WebGLRenderer({antialias:true});r.setSize(1600,700);document.body.appendChild(r.domElement);r.setClearColor(0x444a55);r.setScissorTest(true);
    const g=await LOAD(b64);g.updateMatrixWorld(true);const ms=[];g.traverse(o=>{if(o.isMesh&&(!pick.length||pick.some(p=>o.name.startsWith(p))))ms.push(o)});
    const cols=Math.min(ms.length,8),rows=Math.ceil(ms.length/cols),w=1600/cols,h=700/rows;
    ms.forEach((m,i)=>{const sc=new THREE.Scene();sc.add(new THREE.HemisphereLight(0xffffff,0x555566,1.4));const d=new THREE.DirectionalLight(0xffffff,1);d.position.set(2,3,4);sc.add(d);
      const c=m.clone();c.matrixAutoUpdate=false;c.matrix.copy(m.matrixWorld);c.matrixWorld.copy(m.matrixWorld);sc.add(c);const bb=new THREE.Box3().setFromObject(c),ct=bb.getCenter(new THREE.Vector3()),s=bb.getSize(new THREE.Vector3()).length();
      const cam=new THREE.PerspectiveCamera(35,w/h,.1,1e5);cam.position.copy(ct).add(new THREE.Vector3(.8,.7,1.2).multiplyScalar(s*.9));cam.lookAt(ct);
      const x=(i%cols)*w,y=700-(Math.floor(i/cols)+1)*h;r.setViewport(x,y,w,h);r.setScissor(x,y,w,h);r.render(sc,cam)});return ms.map(m=>m.name)},{b64,pick});
  await pg.screenshot({path:out});console.log(names.map((n,i)=>i+':'+n).join(' '))}
if(cmd==='build'){const spec=JSON.parse(fs.readFileSync(args[0],'utf8')),out=args[1],cache={},srcs={};
  for(const p of spec.pieces){cache[p.src]=cache[p.src]||fs.readFileSync(p.src).toString('base64');(srcs[p.src]=srcs[p.src]||[]).push(p)}
  const glb=await pg.evaluate(async({srcs,data})=>{
    const root=new THREE.Group();const log=[];
    for(const f in srcs){const g=await LOAD(data[f]);g.updateMatrixWorld(true);const byName={};g.traverse(o=>{if(o.isMesh)byName[o.name]=o});
      for(const p of srcs[f]){const m=byName[p.node];if(!m){log.push('MISSING '+p.node);continue}
        const geo=m.geometry.clone();geo.applyMatrix4(m.matrixWorld);
        geo.computeBoundingBox();const bb=geo.boundingBox,c=bb.getCenter(new THREE.Vector3());const sc=(p.sc||1)*.01;
        geo.applyMatrix4(new THREE.Matrix4().makeScale(sc,sc,sc).multiply(new THREE.Matrix4().makeTranslation(-c.x,p.floor===false?-c.y:-bb.min.y,-c.z)));
        for(const k of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(k))geo.deleteAttribute(k);
        const mats=[].concat(m.material).map(o=>{const n=new THREE.MeshStandardMaterial({color:o.color?o.color.clone():new THREE.Color(.6,.6,.6),roughness:.9,metalness:0,flatShading:true});if(p.color)n.color.set(p.color);n.name=o.name;return n});
        const mesh=new THREE.Mesh(geo,mats.length>1?mats:mats[0]);mesh.name=p.name;root.add(mesh);
        const tris=(geo.index?geo.index.count:geo.attributes.position.count)/3,sz=new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());log.push(p.name+' tris '+tris+' size '+sz.toArray().map(v=>v.toFixed(2)).join('x'))}}
    const d2=await new Promise(ok=>new THREE.GLTFExporter().parse(root,ok,e=>{throw e},{binary:true}));const u8=new Uint8Array(d2);let bin='';for(let i=0;i<u8.length;i+=0x8000)bin+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));
    return{b64:btoa(bin),log}},{srcs,data:cache});
  fs.writeFileSync(out,Buffer.from(glb.b64,'base64'));console.log(glb.log.join('\n'));console.log('wrote',out,fs.statSync(out).size,'bytes')}
await b.close();
