// Realistic characters (assets/chars) borrow the stock chibi's clips. Posture.ground() eases idle/walk/jog/sprint toward a natural stance (head over the chest, pelvis upright, arms hanging
// straight) without touching the stock characters, other clips, or where the legs/feet are; hipFix scales the hips once (never compounding when a clip has no hips track).
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
class Img{constructor(){this.style={};this.L={}}addEventListener(t,f){this.L[t]=f}removeEventListener(){}set src(v){this._s=v;setTimeout(()=>this.L.load&&this.L.load.call(this,{}),0)}get src(){return this._s}}
globalThis.self=globalThis;globalThis.document={createElementNS:()=>new Img(),createElement:()=>({style:{}})};
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);globalThis.THREE=T;
const {GLTFLoader}=await import(pathToFileURL(path.join(nm,'three/examples/jsm/loaders/GLTFLoader.js')).href);
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
(0,eval)(R('src/utils/math.js').replace(/^(const|let) /gm,'var '));
for(const n of ['_v1','_v2'])globalThis[n]=new T.Vector3();for(const n of ['_qa','_qb','_qm','_qw'])globalThis[n]=new T.Quaternion();
const HTML=R('index.html'),grab=(a,b)=>HTML.slice(HTML.indexOf(a),HTML.indexOf(b));
(0,eval)(grab('function aim(b,c,dir)','function pose(q,st,dt)').replace('function aim','globalThis.aim=function aim'));
(0,eval)(grab('function hipFix(q)','function animateClips(').replace(/function (hipFix|hipRestore)/g,'globalThis.$1=function $1'));
(0,eval)(R('src/character/Posture.js').replace('const Posture=','globalThis.Posture='));
const anims=JSON.parse(R('assets/anims.json')),clip=n=>T.AnimationClip.parse(anims.find(c=>c.name===n));
async function avatar(file){const b=fs.readFileSync(path.join(ROOT,file));const gltf=await new Promise((r,j)=>new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j));
 const g=new T.Group(),m=gltf.scene;m.scale.setScalar(.5);g.add(m);const bones={};let hipK=0;m.traverse(o=>{if(o.userData&&o.userData.hipK)hipK=o.userData.hipK;if(o.isSkinnedMesh)o.skeleton.bones.forEach(x=>bones[x.name]=x)});
 const mx=new T.AnimationMixer(m),q=g.userData;Object.assign(q,{model:m,bones,mixer:mx,hipK,hipR:hipK?bones.HipsCtrl.position.clone():null,real:!!hipK});return {g,q,mx,bones}}
const P=new T.Vector3(),C=new T.Vector3(),gq=new T.Quaternion();
const lean=(A,a,b)=>{A.g.updateWorldMatrix(true,false);A.g.getWorldQuaternion(gq);A.bones[a].getWorldPosition(P);A.bones[b].getWorldPosition(C);const v=C.sub(P).applyQuaternion(gq.invert());return Math.atan2(v.z,v.y)*180/Math.PI};
const wdir=(A,a,b)=>{A.bones[a].getWorldPosition(P);A.bones[b].getWorldPosition(C);return C.clone().sub(P).normalize()};
const play=(A,cn,t)=>{A.mx.stopAllAction();A.mx.clipAction(clip(cn)).play();A.mx.setTime(t);A.q.cur=cn;A.g.updateMatrixWorld(true);if(A.q.hipK)hipFix(A.q)};
for(const ch of ['crypto','medea','eve','coolguy']){
  const A=await avatar('assets/chars/'+ch+'.glb');ok(A.q.real,ch+': flagged realistic (carries a leg ratio)');
  play(A,'idle',.4);
  const b={hs:lean(A,'Hips','Spine'),un:lean(A,'UpperChest','Neck'),nh:lean(A,'Neck','Head')},legs=['LeftUpLeg>LeftLeg','LeftLeg>LeftFoot','RightLeg>RightFoot'].map(s=>wdir(A,...s.split('>'))),sp=wdir(A,'Spine','UpperChest'),af=wdir(A,'LeftForeArm','LeftHand'),ab=wdir(A,'LeftArm','LeftForeArm');
  Posture.ground(A.g,A.q);A.g.updateMatrixWorld(true);
  const a={hs:lean(A,'Hips','Spine'),un:lean(A,'UpperChest','Neck'),nh:lean(A,'Neck','Head')};
  ok(a.nh<b.nh-5&&a.un<b.un-3,ch+': head and neck sit back over the chest (neck '+b.un.toFixed(0)+'->'+a.un.toFixed(0)+' deg, head '+b.nh.toFixed(0)+'->'+a.nh.toFixed(0)+')');
  ok(a.hs<b.hs-2,ch+': pelvis tilt eased (lower back '+b.hs.toFixed(1)+'->'+a.hs.toFixed(1)+' deg)');
  const legs2=['LeftUpLeg>LeftLeg','LeftLeg>LeftFoot','RightLeg>RightFoot'].map(s=>wdir(A,...s.split('>')));
  ok(legs.every((d,i)=>d.angleTo(legs2[i])<.01),ch+': legs keep their exact world direction (feet do not move)');
  ok(wdir(A,'Spine','UpperChest').angleTo(sp)<.01,ch+': chest keeps its world direction');
  ok(wdir(A,'LeftArm','LeftForeArm').y<ab.y+.1&&Math.abs(wdir(A,'LeftArm','LeftForeArm').x)<Math.abs(ab.x)-.05,ch+': hanging arm splays less ('+ab.x.toFixed(2)+'->'+wdir(A,'LeftArm','LeftForeArm').x.toFixed(2)+')');
  const lenOK=(()=>{const x=wdir(A,'LeftForeArm','LeftHand');return Math.abs(x.z)<Math.abs(af.z)})();ok(lenOK,ch+': forearm folds forward less');
  // not for other states / stock / flags
  play(A,'idle',.4);A.q.cur='a_idle';const keep=lean(A,'Neck','Head');Posture.ground(A.g,A.q);ok(Math.abs(lean(A,'Neck','Head')-keep)<1e-6,ch+': gun clips (a_idle) are left alone');
  play(A,'idle',.4);A.q.hold={};const k2=lean(A,'Neck','Head');Posture.ground(A.g,A.q);ok(Math.abs(lean(A,'Neck','Head')-k2)<1e-6,ch+': held emotes are left alone');
  play(A,'sprint',.1);A.q.hold=null;const s0=lean(A,'Spine','UpperChest'),h0=lean(A,'Neck','Head');Posture.ground(A.g,A.q);A.g.updateMatrixWorld(true);
  ok(Math.abs(lean(A,'Spine','UpperChest')-s0)<1&&lean(A,'Neck','Head')<h0-3&&lean(A,'Neck','Head')>s0,ch+': sprint keeps its forward lean, the head just follows the chest ('+h0.toFixed(0)+'->'+lean(A,'Neck','Head').toFixed(0)+' vs chest '+s0.toFixed(0)+')');
}
{const A=await avatar('assets/char.glb');ok(!A.q.real&&!A.q.hipK,'stock character: not flagged realistic');play(A,'idle',.4);const b=lean(A,'Neck','Head');Posture.ground(A.g,A.q);ok(Math.abs(lean(A,'Neck','Head')-b)<1e-9,'stock character is never altered by Posture')}
// hipFix applies ONCE even when a clip writes no hips track
{const A=await avatar('assets/chars/crypto.glb'),h=A.bones.HipsCtrl,r=A.q.hipR.clone();
 h.position.set(r.x,r.y-.1,r.z);hipFix(A.q);const once=h.position.y;
 for(let i=0;i<30;i++){hipRestore(A.q);hipFix(A.q)}ok(Math.abs(h.position.y-once)<1e-9,'hipFix with restore: stays at the once-scaled value over 30 frames with no clip writing the hips ('+(once-r.y).toFixed(3)+')');
 const h2=h.position.y;for(let i=0;i<5;i++)hipFix(A.q);ok(h.position.y<h2-.01,'(control) without restore it WOULD compound every frame')}
console.log(bad?bad+' failed':'posture ok');process.exit(bad?1:0);
