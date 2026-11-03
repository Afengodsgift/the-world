// CineCam: a shot whose driver disappears (Spirit Sever ends while its camera is blending out) must hand the camera back, never throw.
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));if(!nm)throw new Error('three not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);globalThis.THREE=T;
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
globalThis.H=()=>0;globalThis.camera=new T.PerspectiveCamera(65,16/9,.1,500);globalThis.keys={};globalThis.stickV={x:0,y:0};
globalThis.document={createElement:()=>({style:{},children:[{style:{}},{style:{}}],classList:{add(){},remove(){}},appendChild(){},querySelector(){return{style:{}}},set innerHTML(v){},addEventListener(){}}),body:{appendChild(){}},addEventListener(){}};globalThis.window={addEventListener(){}};globalThis.addEventListener=()=>{};globalThis.innerHeight=700;
globalThis.localStorage={getItem(){return null},setItem(){}};
(0,eval)(fs.readFileSync(path.join(ROOT,'src/combat/CineCam.js'),'utf8').replace('const CineCam=','globalThis.CineCam='));
CineCam.PRESETS.sever={dur:4.9,freeze:false,noskip:true,shots:[]};
let alive=true;const D={px:3,py:2,pz:3,lx:0,ly:1,lz:0,fov:50};
const drive=()=>alive?D:null;
CineCam.play('sever',{x:()=>0,z:()=>0,h:2,drive},{force:true});
let threw=false;try{for(let i=0;i<30;i++)CineCam.apply(1/60);alive=false;CineCam.skip();for(let i=0;i<60;i++)CineCam.apply(1/60)}catch(e){threw=e.message}
ok(!threw,'driver vanishing during the blend-out does not throw ('+threw+')');ok(!CineCam.busy(),'the camera is handed back (idle)');
// and a driver that is already gone the moment the shot starts
CineCam.play('sever',{x:()=>0,z:()=>0,h:2,drive:()=>null},{force:true});threw=false;try{for(let i=0;i<10;i++)CineCam.apply(1/60)}catch(e){threw=e.message}
ok(!threw&&!CineCam.busy(),'a dead driver from the start is also safe ('+threw+')');
process.exit(bad?1:0);
