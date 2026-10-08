// SpaceObjects/SpaceEvents: the satellite is findable but not trippable, approachable at orbital altitude, shared by both players, and cheap.
// Run: NODE_PATH=<dir>/node_modules node tests/space_objects.sim.mjs
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));
if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);globalThis.THREE=T;
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8'),load=(f,n)=>(0,eval)(R(f).replace('const '+n+'=','globalThis.'+n+'='));
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};

// ---- stubs for the game's globals ----
globalThis.S={x:0,y:0,z:0};globalThis.scene=new T.Scene();globalThis.camera=new T.PerspectiveCamera(70,16/9,.1,4200);
const banners=[];globalThis.banner=(t,l)=>banners.push(l+': '+t);globalThis.WAudio={get:()=>null,out:()=>null};
// WorldState stub with the real semantics we rely on: set union, idempotent log, onChange(k,v,fromRemote)
const ws={sets:{},log:[],fns:[]};globalThis.WS={hasInSet:(k,x)=>(ws.sets[k]||[]).includes(x),addToSet(k,x){ws.sets[k]=ws.sets[k]||[];if(ws.sets[k].includes(x))return false;ws.sets[k].push(x);return true},
 log(kind,key,d){const id=kind+':'+key;if(ws.log.find(e=>e.id===id))return false;ws.log.push({id,kind,key,data:d});return true},onChange:f=>ws.fns.push(f)};
const sent=[];globalThis.Net={on(){},emit:(t,d)=>{sent.push([t,d]);return true}};
load('src/space/SpaceFlight.js','SpaceFlight');load('src/space/SpaceManager.js','Space');load('src/space/SpaceEvents.js','SpaceEvents');load('src/space/SpaceObjects.js','SpaceObjects');
SpaceObjects.build();const sat=SpaceObjects.live[0];
const look=(from,to)=>{camera.position.set(from.x,from.y,from.z);camera.lookAt(to.x,to.y,to.z);camera.updateMatrixWorld(true)};
const place=(x,y,z)=>{S.x=x;S.y=y;S.z=z;Space.profile(y)};
const P=sat.pos,tick=(secs,dt=1/30)=>{for(let i=0;i<Math.round(secs/dt);i++)SpaceObjects.update(dt,i*dt)};

// 1) where it is
ok(sat&&sat.def.id==='satellite'&&P.y>100000&&P.y<SpaceFlight.CEIL,'satellite sits in space ('+(P.y/1000).toFixed(0)+' km), under the ceiling');
ok(Math.hypot(P.x,P.z)<SpaceFlight.bound(P.y),'and inside the world edge for that altitude');
{const dh=Math.hypot(P.x,P.z),dy=P.y-100000,el=Math.atan2(dy,dh)*57.3;ok(dh<20000&&el>20&&el<70,'from the edge of space (100 km, above the island) it is '+(dh/1000).toFixed(0)+' km away at '+el.toFixed(0)+'° up: seen while climbing')}

// 2) approach assist: smooth, 0 close, 1 far, monotonic
{let mono=true,pv=-1;for(let d=0;d<=6000;d+=10){const a=SpaceObjects.assistFor(d);if(a<pv-1e-12||a<0||a>1)mono=false;pv=a}
 ok(mono&&SpaceObjects.assistFor(250)===0&&SpaceObjects.assistFor(3000)===1,'assist: 0 within 300 m, full speed beyond 3 km, monotonic (no zone edge)')}
place(P.x,P.y-20000,P.z);tick(.1);{const far=SpaceFlight.moveMul(S.y);ok(far>150,'far away at orbital altitude flight is fast (x'+far.toFixed(0)+')')}
place(P.x,P.y-120,P.z);look(S,P);tick(.1);ok(SpaceFlight.moveMul(S.y)<1.5&&SpaceFlight.moveMulH(S.y)<1.3,'120 m from it: back to normal flight speed (x'+SpaceFlight.moveMul(S.y).toFixed(2)+')');
ok(SpaceFlight.moveMulRaw(S.y)>150,'the raw multiplier (used for the partner) ignores the assist');
{place(P.x,P.y-1500,P.z);tick(.1);const m=SpaceFlight.moveMul(S.y);ok(m>2&&m<SpaceFlight.moveMulRaw(S.y),'1.5 km out the speed is easing down ('+m.toFixed(0)+')')}

// 3) beacon: only visible against a dark sky, blinks, constant on-screen size, hands over to the real light
place(0,100000,0);tick(.2);const b=sat.beacon;
{let on=0,off=0,maxO=0;for(let i=0;i<120;i++){SpaceObjects.update(1/30,i/30);if(b.material.opacity>.5)on++;if(b.material.opacity<.25)off++;maxO=Math.max(maxO,b.material.opacity)}
 ok(b.visible&&maxO>.9&&on>0&&off>on*3,'from 100 km: a tiny light that blinks (bright '+on+' of 120 frames, dim the rest)')}
{const d=sat.dist,px=b.scale.x/d/(2*Math.tan(35*Math.PI/180)/560);ok(px>14&&px<30,'beacon quad is ~'+px.toFixed(0)+' px on a phone screen at '+(d/1000).toFixed(0)+' km (bright core a third of that: noticeable, not a blob)')}
place(0,2000,0);tick(.2);ok(!b.visible,'from the ground / low sky the beacon is hidden (daylight sky)');
place(P.x,P.y-30,P.z);tick(.2);ok(!b.visible&&sat.group.visible,'30 m away the sprite is replaced by the real model + its own light');
place(0,100000,0);tick(.2);ok(!sat.group.visible,'far away the model is not rendered at all (only a sprite)');
{let tri=0;sat.group.traverse(o=>{if(o.isMesh)tri+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3});ok(tri<2500,'whole satellite is '+tri.toFixed(0)+' triangles (phone-cheap)')}

// 4) discovery: close AND looking, for a moment; once; shared
place(P.x,P.y-60,P.z);look(S,{x:P.x+500,y:P.y-60,z:P.z});tick(5);
ok(!sat.found&&!SpaceEvents.isFound('satellite'),'60 m away but looking elsewhere: NOT discovered (no tripping over it)');
place(P.x,P.y-150,P.z);look(S,P);tick(5);ok(!sat.found,'150 m away, looking at it: too far to count');
place(P.x,P.y-60,P.z);look(S,P);tick(.5);ok(!sat.found,'looking at it for half a second is not enough');
tick(1.5);ok(sat.found&&SpaceEvents.isFound('satellite'),'close and looking for ~1.4 s: discovered');
ok(banners.length===1&&/FOUND SOMETHING/.test(banners[0]),'one quiet banner ("'+(banners[0]||'').slice(0,70)+'")');
ok(ws.log.length===1&&ws.log[0].kind==='space'&&/satellite/.test(ws.log[0].data.text)&&ws.log[0].data.icon&&Number.isFinite(ws.log[0].data.y),'one shared Journal entry with text, icon and coordinates');
ok(ws.sets.space.includes('satellite')&&sent.some(e=>e[0]==='sp:found'),'recorded in the persistent set and announced to the partner');
tick(10);ok(banners.length===1&&ws.log.length===1,'staying there does not repeat anything');
{place(P.x,P.y-500,P.z);tick(.2);const m=sat.beacon.material.color.getHexString();ok(m!=='ff6a55','after discovery the beacon changes colour (registered), seen from 500 m')}

// 5) the partner finds it first (other phone): we are told once, the object updates, no duplicate journal entry
{const T2=Object.assign({},ws);ws.sets.space=[];ws.log.length=0;sat.found=false;sat.look=0;banners.length=0;
 // simulate WorldState merging the partner's discovery into our set and notifying listeners with fromRemote=true
 SpaceEvents.init&&0;ws.sets.space=['satellite'];for(const f of ws.fns)f('space',ws.sets.space,true);
 ok(banners.length===0,'(already known locally from this session: no repeat)');
 // a fresh client that never knew about it:
 load('src/space/SpaceEvents.js','SpaceEvents');load('src/space/SpaceObjects.js','SpaceObjects');ws.sets.space=[];ws.fns.length=0;scene.clear();
 SpaceObjects.build();const s2=SpaceObjects.live[0];ok(!s2.found,'fresh client starts undiscovered');
 ws.sets.space=['satellite'];for(const f of ws.fns)f('space',ws.sets.space,true);
 ok(s2.found&&banners.length===1&&/partner/i.test(banners[0]),'partner discovers it: we get a quiet note and the object registers it');
 place(P.x,P.y-60,P.z);look(S,P);tick(4);ok(ws.log.length===0,'and we do not write a second Journal entry for the same thing')}
// 6) reload: a discovery survives (WorldState persists the set)
{load('src/space/SpaceEvents.js','SpaceEvents');load('src/space/SpaceObjects.js','SpaceObjects');scene.clear();SpaceObjects.build();ok(SpaceObjects.live[0].found,'after a reload an already-found satellite starts as found')}

console.log(bad?bad+' failed':'space objects ok');process.exit(bad?1:0);
