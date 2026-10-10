// Regression test for StaticBatch (src/core/StaticBatch.js): merging must preserve geometry exactly (world-space positions/normals/uvs/indices),
// group by material and cell, keep shadow flags, remove the originals, and freezing must not change world matrices.
// Run: NODE_PATH=<dir>/node_modules node tests/static_batch.sim.mjs (part of tests/run_all.sh)
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));
if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);globalThis.THREE=T;
(0,eval)(fs.readFileSync(path.join(ROOT,'src/core/StaticBatch.js'),'utf8').replace('const StaticBatch=','globalThis.StaticBatch='));
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
const scene=new T.Scene();
const mA=new T.MeshLambertMaterial({color:'#f00'}),mB=new T.MeshLambertMaterial({color:'#0f0'});
// a "house": group with pieces (non-uniform scale, rotation), 2 materials, one indexed + one non-indexed geometry
const g=new T.Group();
const box=new T.BoxGeometry(1,2,3),tri=new T.IcosahedronGeometry(1,0).toNonIndexed();
const parts=[];
for(let i=0;i<6;i++){const m=new T.Mesh(i%2?box:tri,i%3===0?mB:mA);m.position.set(i*2,i*.3,-i);m.rotation.set(.1*i,.7*i,.2);m.scale.set(1+i*.1,1,2-i*.15);m.castShadow=true;m.receiveShadow=i<5;g.add(m);parts.push(m)}
g.position.set(100,5,-40);g.rotation.y=.9;scene.add(g);scene.updateMatrixWorld(true);
// reference: world-space vertices/normals of every part
const refPos=[],refNor=[];let refTris=0;
for(const m of parts){const a=m.geometry.attributes,nmx=new T.Matrix3().getNormalMatrix(m.matrixWorld);for(let i=0;i<a.position.count;i++){refPos.push(new T.Vector3().fromBufferAttribute(a.position,i).applyMatrix4(m.matrixWorld));refNor.push(new T.Vector3().fromBufferAttribute(a.normal,i).applyMatrix3(nmx).normalize())}refTris+=(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3}
const before=scene.children.length;
const out=StaticBatch.merge([g],{parent:scene});
ok(!scene.children.includes(g),'originals are removed from the scene');
ok(out.length===3,'6 meshes -> 3 (2 materials; the shadow-receiving flag splits one of them): got '+out.length);
ok(new Set(out.map(o=>o.material.uuid)).size===2,'both materials kept');
let tris=0,vc=0;for(const o of out){tris+=o.geometry.index.count/3;vc+=o.geometry.attributes.position.count}
ok(tris===refTris,'triangle count preserved ('+tris+')');ok(vc===refPos.length,'vertex count preserved ('+vc+')');
// every reference vertex exists in the merged output (matching normal too)
const all=[];for(const o of out){const a=o.geometry.attributes;for(let i=0;i<a.position.count;i++)all.push([new T.Vector3().fromBufferAttribute(a.position,i),new T.Vector3().fromBufferAttribute(a.normal,i)])}
let miss=0;for(let i=0;i<refPos.length;i++){let f=false;for(const [p,n] of all){if(p.distanceTo(refPos[i])<1e-4&&n.distanceTo(refNor[i])<1e-4){f=true;break}}if(!f)miss++}
ok(miss===0,'every world-space vertex + normal is preserved ('+miss+' missing)');
ok(out.every(o=>o.geometry.index.array.length>0&&Math.max(...o.geometry.index.array)<o.geometry.attributes.position.count),'indices valid');
ok(out.some(o=>o.castShadow&&o.receiveShadow)&&out.some(o=>o.castShadow&&!o.receiveShadow),'shadow flags kept (grouped separately)');
ok(out.every(o=>!o.matrixAutoUpdate&&o.matrixWorld.equals(new T.Matrix4())||o.matrix.equals(new T.Matrix4())),'merged meshes sit at the origin and are frozen');
scene.updateMatrixWorld(true);const bb=new T.Box3();for(const o of out){o.geometry.computeBoundingBox();bb.union(o.geometry.boundingBox)}
const bref=new T.Box3().setFromPoints(refPos);ok(bb.min.distanceTo(bref.min)<1e-4&&bb.max.distanceTo(bref.max)<1e-4,'combined bounding box identical to the original pieces');
// spatial cells: two clusters 500 m apart with cell=64 stay separate meshes (frustum culling keeps working)
{const s2=new T.Scene(),grp=new T.Group();for(const x of [0,500]){const m=new T.Mesh(box,mA);m.position.x=x;grp.add(m)}s2.add(grp);s2.updateMatrixWorld(true);
 const o2=StaticBatch.merge([grp],{parent:s2,cell:64});ok(o2.length===2,'far-apart pieces stay in separate cells ('+o2.length+')');
 const o3=StaticBatch.merge([(()=>{const q=new T.Group();for(const x of [0,500]){const m=new T.Mesh(box,mA);m.position.x=x;q.add(m)}s2.add(q);s2.updateMatrixWorld(true);return q})()],{parent:s2});ok(o3.length===1,'one cell when no cell size is given')}
// freeze: world matrices unchanged and no longer recomputed
{const s3=new T.Scene(),h=new T.Group(),m=new T.Mesh(box,mA);h.add(m);h.position.set(3,4,5);h.rotation.y=.4;s3.add(h);s3.updateMatrixWorld(true);const w0=m.matrixWorld.clone();
 StaticBatch.freeze(h);s3.updateMatrixWorld(true);ok(m.matrixWorld.equals(w0)&&!h.matrixAutoUpdate&&!m.matrixAutoUpdate,'freeze keeps world matrices and stops auto-update');
 s3.matrixAutoUpdate=false;h.position.x=999;s3.updateMatrixWorld();ok(Math.abs(m.matrixWorld.elements[12]-999)<1e-9,'freeze() has the tripwire too: moving a frozen object afterwards thaws it instead of leaving it stuck')}

// ---- guarded freeze: any transform write thaws the object; idle objects stay frozen ----
{const mk=()=>{const s=new T.Scene(),par=new T.Group(),a=new T.Mesh(box,mA);par.add(a);par.position.set(2,0,0);s.add(par);s.updateMatrixWorld(true);return {s,par,a}};
 const writes={
  'position.x=':o=>{o.position.x=7},'position.set':o=>o.position.set(1,2,3),'position.copy':o=>o.position.copy(new T.Vector3(4,5,6)),
  'rotation.y=':o=>{o.rotation.y=1.2},'rotation.set':o=>o.rotation.set(.3,.4,.5),'quaternion.set':o=>o.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),1),
  'scale.setScalar':o=>o.scale.setScalar(2),'lookAt':o=>o.lookAt(10,3,4),'applyMatrix4':o=>o.applyMatrix4(new T.Matrix4().makeTranslation(3,0,1))};
 for(const [name,fn] of Object.entries(writes)){const {s,par,a}=mk();const n=StaticBatch.autoFreeze(s);s.updateMatrixWorld();
  const frozen=!a.matrixAutoUpdate;const before=a.matrixWorld.clone();fn(a);s.updateMatrixWorld();
  ok(frozen&&a.matrixAutoUpdate&&!a.matrixWorld.equals(before),'write via '+name+' thaws the object and its world matrix updates')}
 // idle: setting the SAME value must not thaw (the mixer re-writes unchanged values every frame)
 {const {s,a}=mk();StaticBatch.autoFreeze(s);a.position.x=a.position.x;a.position.set(a.position.x,a.position.y,a.position.z);ok(!a.matrixAutoUpdate,'writing an unchanged position does not thaw')}
 // untouched frozen objects are not recomputed even if their matrix is corrupted behind the scenes (proves the saving is real)
 {const {s,a}=mk();StaticBatch.autoFreeze(s);a.matrixWorld.elements[12]=555;s.updateMatrixWorld();ok(a.matrixWorld.elements[12]===555,'a frozen, untouched object is skipped by updateMatrixWorld')}
 // moving a (thawed) parent carries frozen children; moving a child under a frozen parent works
 {const {s,par,a}=mk();StaticBatch.autoFreeze(s);par.position.x=50;s.updateMatrixWorld();ok(Math.abs(a.matrixWorld.elements[12]-50)<1e-9,'a thawed parent carries its still-frozen child');
  const {s:s2,par:p2,a:a2}=mk();StaticBatch.autoFreeze(s2);a2.position.x=3;s2.updateMatrixWorld();ok(Math.abs(a2.matrixWorld.elements[12]-5)<1e-9,'a child moved under a frozen parent lands in the right world position')}
 // AnimationMixer-driven objects thaw by themselves
 {const {s,a}=mk();const clip=new T.AnimationClip('m',1,[new T.VectorKeyframeTrack('.position',[0,1],[0,0,0,0,10,0])]);const mix=new T.AnimationMixer(a);mix.clipAction(clip).play();
  StaticBatch.autoFreeze(s);mix.update(.5);s.updateMatrixWorld();ok(a.matrixAutoUpdate&&Math.abs(a.matrixWorld.elements[13]-5)<1e-6,'animation-mixer driven objects thaw and animate correctly')}
 // lights and cameras are never frozen
 {const s=new T.Scene(),l=new T.DirectionalLight();const c=new T.PerspectiveCamera();s.add(l);s.add(c);StaticBatch.autoFreeze(s);ok(l.matrixAutoUpdate&&c.matrixAutoUpdate,'lights and cameras are left alone')}
 // objects flagged noFreeze are left alone
 {const {s,a}=mk();a.userData.noFreeze=true;StaticBatch.autoFreeze(s);ok(a.matrixAutoUpdate,'userData.noFreeze is respected')}
}

// ---- subtree skipping: frozen subtrees are not walked at all, and re-open when something inside them changes ----
{const mk=()=>{const s=new T.Scene(),a=new T.Group(),b=new T.Group(),c=new T.Mesh(box,mA);a.add(b);b.add(c);a.position.set(1,0,0);b.position.set(0,2,0);c.position.set(0,0,3);s.add(a);s.updateMatrixWorld(true);return {s,a,b,c}};
 {const {s,a,b,c}=mk();StaticBatch.autoFreeze(s);ok(a.matrixWorldAutoUpdate===false&&c.matrixWorldAutoUpdate===false&&s.matrixWorldAutoUpdate===true,'frozen objects opt out of the matrix walk (the scene root does not)');
  c.matrixWorld.elements[12]=777;s.updateMatrixWorld();ok(c.matrixWorld.elements[12]===777,'a frozen subtree is not visited at all by updateMatrixWorld')}
 {const {s,a,b,c}=mk();StaticBatch.autoFreeze(s);c.position.x=4;s.updateMatrixWorld();ok(Math.abs(c.matrixWorld.elements[12]-5)<1e-9,'a deep descendant that moves re-opens the path and lands in the right world position')
  ok(a.matrixWorldAutoUpdate&&b.matrixWorldAutoUpdate&&!a.matrixAutoUpdate,'ancestors are re-opened for the walk but stay frozen (no recompute of their own matrices)')}
 {const {s,a,b,c}=mk();StaticBatch.autoFreeze(s);const n=new T.Mesh(box,mB);n.position.set(0,0,9);b.add(n);s.updateMatrixWorld();ok(Math.abs(n.matrixWorld.elements[14]-9)<1e-9&&Math.abs(n.matrixWorld.elements[13]-2)<1e-9&&Math.abs(n.matrixWorld.elements[12]-1)<1e-9,'a child added under a frozen group later is positioned correctly')}
 {const {s,a,b,c}=mk();StaticBatch.autoFreeze(s);a.position.x=30;s.updateMatrixWorld();ok(Math.abs(c.matrixWorld.elements[12]-30)<1e-9,'moving a frozen group carries its frozen descendants')}
 {const {s,a,b,c}=mk();const clip=new T.AnimationClip('m',1,[new T.VectorKeyframeTrack('.position',[0,1],[0,0,3,0,10,3])]);const mix=new T.AnimationMixer(c);mix.clipAction(clip).play();StaticBatch.autoFreeze(s);mix.update(.5);s.updateMatrixWorld();ok(Math.abs(c.matrixWorld.elements[13]-7)<1e-6,'animation-mixer driven descendants animate through a frozen subtree')}
 {const {s,a,b,c}=mk();StaticBatch.autoFreeze(s);const x=new T.Group();s.add(x);x.position.set(8,8,8);s.updateMatrixWorld();ok(Math.abs(x.matrixWorld.elements[12]-8)<1e-9,'objects added to the scene root after the freeze are updated normally')}
}

// ---- unguard: once an object has thawed it has plain properties again (no accessor overhead), and it can be frozen again later ----
{const s=new T.Scene(),a=new T.Mesh(box,mA);s.add(a);s.updateMatrixWorld(true);StaticBatch.autoFreeze(s);
 ok(Object.getOwnPropertyDescriptor(a.position,'x').get!==undefined&&a.add!==T.Object3D.prototype.add,'a frozen object has the tripwire installed');
 a.position.x=4;s.updateMatrixWorld();
 const d=Object.getOwnPropertyDescriptor(a.position,'x'),ds=Object.getOwnPropertyDescriptor(a.scale,'y');
 ok(d.get===undefined&&d.value===4&&ds.get===undefined&&a.add===T.Object3D.prototype.add,'after thawing, position/scale are plain data properties again and add() is the original');
 a.position.y=2;a.rotation.y=.5;s.updateMatrixWorld();ok(Math.abs(a.matrixWorld.elements[13]-2)<1e-9&&a.matrixAutoUpdate,'a thawed object keeps working normally (position + rotation writes)');
 a.rotation.x=.2;ok(Math.abs(a.quaternion.x)>0,'rotation->quaternion sync still works after unguard (original callbacks restored)');
 StaticBatch.freezeGuarded(s);a.updateMatrix();ok(!a.matrixAutoUpdate,'a thawed object can be frozen again');a.position.x=9;s.updateMatrixWorld();ok(Math.abs(a.matrixWorld.elements[12]-9)<1e-9,'...and thaws again when moved')}
console.log(bad?bad+' FAIL':'all static batch checks passed');process.exit(bad?1:0);
