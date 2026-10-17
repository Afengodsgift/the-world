// Re-skinned player characters (assets/chars/*.glb, made by tools/transplant_char.mjs): each GLB carries its leg-length ratio (node extras -> userData.hipK) and the animator scales hip travel by it.
import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(path.join('file://',nm,'three/build/three.module.js'));
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8'),HTML=R('index.html'),grab=(a,b)=>HTML.slice(HTML.indexOf(a),HTML.indexOf(b));
const rigBones=new Set((()=>{const b=fs.readFileSync(path.join(ROOT,'assets/char.glb'));return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString()).nodes.map(n=>n.name)})());
for(const n of ['crypto','medea','eve','coolguy']){const b=fs.readFileSync(path.join(ROOT,'assets/chars/'+n+'.glb')),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString()),k=j.nodes.find(x=>x.extras&&x.extras.hipK);
 ok(k&&k.extras.hipK>1.2&&k.extras.hipK<2,n+': GLB carries its leg-length ratio (hipK '+(k&&k.extras.hipK)+')');
 const joints=new Set(j.skins[0].joints.map(i=>j.nodes[i].name));ok([...rigBones].filter(x=>joints.has(x)).length>=33&&j.skins[0].joints.length===45,n+': same 45-joint skeleton as the game rig');
 ok(b.length<900*1024,n+': phone-sized ('+(b.length/1024|0)+' KB)')}
(0,eval)(grab('function hipFix(q)','function animateClips(').replace('function hipFix','globalThis.hipFix=function hipFix'));
{const h=new T.Object3D(),q={bones:{HipsCtrl:h},hipR:new T.Vector3(0,10,0),hipK:1.5};h.position.set(1,8,-2);hipFix(q);
 ok(Math.abs(h.position.x-1.5)<1e-9&&Math.abs(h.position.y-7)<1e-9&&Math.abs(h.position.z+3)<1e-9,"hipFix scales the hips' travel from rest by the leg ratio");
 h.position.set(0,10,0);hipFix(q);ok(h.position.y===10,'hipFix leaves the rest position alone')}
ok(/SKINLABELS=\['Man','Woman','Warrior','Robot','Crypto','Medea','Eve','Cool Guy'\]/.test(HTML),'picker lists the 4 stock + 4 new characters');
console.log(bad?bad+' failed':'chars ok');process.exit(bad?1:0);
