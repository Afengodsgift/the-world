// The space world beyond the satellite: drift (momentum in open space), the asteroid belt, the gate that only two people can wake, and a second planet.
// Real SpaceObjects + real Link + the real modules, stubs only for the game's globals.   Run: NODE_PATH=<dir>/node_modules node tests/space_world.sim.mjs
import fs from 'fs';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=(process.env.NODE_PATH||'').split(path.delimiter).find(d=>d&&fs.existsSync(path.join(d,'three')));
if(!nm)throw new Error('three@0.147.0 not found: set NODE_PATH');
const T=await import(pathToFileURL(path.join(nm,'three/build/three.module.js')).href);globalThis.THREE=T;
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8'),load=(f,n)=>(0,eval)(R(f).replace('const '+n+'=','globalThis.'+n+'='));
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
globalThis.S={x:0,y:0,z:0};globalThis.scene=new T.Scene();globalThis.camera=new T.PerspectiveCamera(70,16/9,.1,4200);
const banners=[];globalThis.banner=(t,l)=>banners.push(l+': '+t);globalThis.WAudio={get:()=>null,out:()=>null};
let ws;const freshWS=(pre)=>{ws={sets:{space:pre||[]},log:[],fns:[]};globalThis.WS={hasInSet:(k,x)=>(ws.sets[k]||[]).includes(x),addToSet(k,x){ws.sets[k]=ws.sets[k]||[];if(ws.sets[k].includes(x))return false;ws.sets[k].push(x);return true},
 log(kind,key,d){const id=kind+':'+key;if(ws.log.find(e=>e.id===id))return false;ws.log.push({id,kind,key,data:d});return true},onChange:f=>ws.fns.push(f)}};
const sent=[];globalThis.Net={on(){},emit:(t,d)=>{sent.push([t,d]);return true}};
const sys={};globalThis.Systems={add:(n,f)=>{sys[n]=f}};globalThis.others=new Map();
const world=(pre)=>{freshWS(pre);for(const k in sys)delete sys[k];others.clear();banners.length=0;
 load('src/space/SpaceFlight.js','SpaceFlight');load('src/space/SpaceManager.js','Space');load('src/space/SpaceEvents.js','SpaceEvents');load('src/space/SpaceObjects.js','SpaceObjects');
 load('src/interaction/Link.js','Link');load('src/space/SpaceMap.js','SpaceMap');load('src/space/SpaceBelt.js','SpaceBelt');load('src/space/SpaceGate.js','SpaceGate');load('src/space/SpacePlanet.js','SpacePlanet');
 SpaceObjects.build()};
world();
const by=id=>SpaceObjects.live.find(o=>o.def.id===id);
const look=(from,to)=>{camera.position.set(from.x,from.y,from.z);camera.lookAt(to.x,to.y,to.z);camera.updateMatrixWorld(true)};
const place=(x,y,z)=>{S.x=x;S.y=y;S.z=z;Space.profile(y)};
const tick=(secs,dt=1/30,t0=0)=>{for(let i=0;i<Math.round(secs/dt);i++)SpaceObjects.update(dt,t0+i*dt)};
const M=SpaceMap,gate=by('gate'),belt=by('belt'),planet=by('planet'),sat=by('satellite');

// 1) the map
ok(SpaceObjects.live[0].def.id==='satellite'&&['belt','gate','planet'].every(id=>by(id)),'registered: satellite first (unchanged), then belt, gate, planet');
for(const [n,p] of [['belt',M.belt.pos],['planet',M.planet.pos]])ok(p[1]>SpaceFlight.OPEN_Y&&p[1]<SpaceFlight.CEIL&&Math.hypot(p[0],p[2])+(n==='planet'?M.planet.r:0)<SpaceFlight.bound(p[1]),n+' is in open space and inside the world limits ('+(Math.hypot(...p)/1000).toFixed(0)+' km from home)');
ok(Math.abs(Math.hypot(...M.axis)-1)<1e-9,'the gate axis is a unit vector');
{const d=Math.hypot(M.belt.pos[0]-M.sat[0],M.belt.pos[1]-M.sat[1],M.belt.pos[2]-M.sat[2]);ok(d>200000&&d<450000,'the belt is a long flight from the satellite ('+(d/1000).toFixed(0)+' km), not on top of it')}
{const d=Math.hypot(M.planet.pos[0]-M.belt.pos[0],M.planet.pos[1]-M.belt.pos[1],M.planet.pos[2]-M.belt.pos[2]);ok(d>M.planet.r*3&&d<700000,'the planet is beyond the belt ('+(d/1000).toFixed(0)+' km), on the same side')}

// 2) drift
ok(SpaceFlight.drift(0)===1&&Math.abs(SpaceFlight.drift(1)-.12)<1e-9,'drift: no change below 40 km (x1), glide-out rate x0.12 in deep space');
{let mono=true,pv=2;for(let s=0;s<=1.0001;s+=.02){const d=SpaceFlight.drift(s);if(d>pv+1e-12||d<.12-1e-9||d>1)mono=false;pv=d}ok(mono,'drift is smooth and monotonic between')}
{const html=R('index.html');ok((html.match(/SpaceFlight\.drift\(Space\.f\.space\)/g)||[]).length===2,'wired into both the horizontal and the vertical flight smoothing');
 const glide=(drift)=>{let v=1,t=0;const rate=3.2*drift;while(v>.05&&t<60){v+=(0-v)*(1-Math.exp(-rate/60));t+=1/60}return t};
 ok(glide(SpaceFlight.drift(1))/glide(1)>6,'in deep space the glide-out takes '+(glide(SpaceFlight.drift(1))/glide(1)).toFixed(1)+'x longer ('+glide(1).toFixed(1)+' s -> '+glide(SpaceFlight.drift(1)).toFixed(1)+' s)')}

// 3) the framework extensions
ok(!planet.beacon&&belt.beacon&&gate.beacon,'noBeacon: the planet has none (it is visible), the belt and the gate blink');
place(M.belt.pos[0]+9000,M.belt.pos[1],M.belt.pos[2]);tick(.05);const farAssist=SpaceFlight.moveMul(S.y);
place(M.belt.pos[0]+M.belt.r+3500,M.belt.pos[1],M.belt.pos[2]);tick(.05);const edge=SpaceFlight.moveMul(S.y);
place(M.belt.pos[0]+M.belt.r*.5,M.belt.pos[1]+200,M.belt.pos[2]);tick(.05);const inside=SpaceFlight.moveMul(S.y);
ok(inside<1.5&&edge>farAssist*0+edge*.5&&farAssist>100,'object radius: inside the field flight is back to normal (x'+inside.toFixed(2)+'), fast far away (x'+farAssist.toFixed(0)+')');
place(M.planet.pos[0]+M.planet.r+2500,M.planet.pos[1],M.planet.pos[2]);tick(.05);const nearP=SpaceFlight.moveMul(S.y);
place(M.planet.pos[0]+M.planet.r+300000,M.planet.pos[1],M.planet.pos[2]);tick(.05);const farP=SpaceFlight.moveMul(S.y);
ok(nearP<1.5&&farP>100,'per-object assist: 2.5 km above the planet is normal speed (x'+nearP.toFixed(2)+'), far from it fast');
{let mono=true,pv=-1;for(let d=0;d<=200000;d+=500){const a=SpaceObjects.assistFor(d,4000,120000);if(a<pv-1e-12||a<0||a>1)mono=false;pv=a}ok(mono&&SpaceObjects.assistFor(3000,4000,120000)===0&&SpaceObjects.assistFor(130000,4000,120000)===1,'planet-scale assist is smooth: 0 within 4 km, 1 beyond 120 km')}

// 4) the belt
{const a=SpaceBelt.layout(),b=SpaceBelt.layout();ok(a.length===SpaceBelt.N&&a.every((r,i)=>r.x===b[i].x&&r.y===b[i].y&&r.z===b[i].z&&r.sx===b[i].sx),'the belt has '+a.length+' rocks and is identical every time (both phones see the same field)');
 ok(a.every(r=>Math.hypot(r.x,r.z)<=M.belt.r+1),'every rock is inside the field');
 ok(a.every(r=>!(Math.hypot(r.x,r.z)<M.belt.clear&&Math.abs(r.y)<M.belt.clear)),'the clearing at the middle (where the gate stands) is empty');
 ok(a.every(r=>{const t=r.x*M.axis[0]+r.y*M.axis[1]+r.z*M.axis[2];if(t<=0)return true;const px=r.x-M.axis[0]*t,py=r.y-M.axis[1]*t,pz=r.z-M.axis[2]*t;return Math.hypot(px,py,pz)>r.r*1.05+80}),'a lane along the gate\'s axis is clear: you can see the planet through the ring');
 let overlap=0;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(Math.hypot(a[i].x-a[j].x,a[i].y-a[j].y,a[i].z-a[j].z)<(a[i].r+a[j].r)*1.0)overlap++;ok(overlap===0,'no two rocks overlap');
 const sizes=a.map(r=>r.r).sort((x,y)=>y-x);ok(sizes[0]>150&&sizes[sizes.length-1]<30,'sizes run from chips ('+sizes[sizes.length-1].toFixed(0)+' m) to giants ('+sizes[0].toFixed(0)+' m)')}
{const ms=SpaceBelt.meshes;let tris=0,inst=0;for(const m of ms){tris+=m.geometry.attributes.position.count/3*m.count;inst+=m.count}
 ok(ms.length===4&&ms.every(m=>m.isInstancedMesh)&&inst===SpaceBelt.N,'4 InstancedMeshes (4 draw calls) carry all '+inst+' rocks');
 ok(tris<16000,'~'+tris+' triangles in total: cheap enough for a phone')}
{const r=SpaceBelt.rocks[10],P={x:M.belt.pos[0]+r.x+r.r*.4,y:M.belt.pos[1]+r.y,z:M.belt.pos[2]+r.z};
 const n=SpaceBelt.collide(P);const d=Math.hypot(P.x-M.belt.pos[0]-r.x,P.y-M.belt.pos[1]-r.y,P.z-M.belt.pos[2]-r.z);ok(n>=1&&d>=r.r+3.4,'flying into a rock pushes you out to its surface ('+d.toFixed(1)+' m from its centre, rock radius '+r.r.toFixed(1)+')');
 const Q={x:M.belt.pos[0]+M.belt.r+900,y:M.belt.pos[1],z:M.belt.pos[2]},q0={...Q};ok(SpaceBelt.collide(Q)===0&&Q.x===q0.x,'far from the field nothing is touched')}
{// ramming straight through the whole field never gets inside a rock, and keeps moving (slides, does not stick)
 const P={x:M.belt.pos[0]+M.belt.r,y:M.belt.pos[1],z:M.belt.pos[2]+1},vx=-60;let inside=0,steps=0;
 for(let i=0;i<2*M.belt.r/60*30;i++){P.x+=vx/30;SpaceBelt.collide(P);steps++;for(const r of SpaceBelt.rocks)if(Math.hypot(P.x-M.belt.pos[0]-r.x,P.y-M.belt.pos[1]-r.y,P.z-M.belt.pos[2]-r.z)<r.r+2.9)inside++}
 ok(inside===0&&P.x<M.belt.pos[0]-M.belt.r*.3,'flying through the field at 60 m/s: never inside a rock, and you get across ('+(M.belt.r-(P.x-M.belt.pos[0])).toFixed(0)+' m travelled)')}
place(M.belt.pos[0]-M.belt.r*.2,M.belt.pos[1],M.belt.pos[2]);{const r=SpaceBelt.rocks[3];S.x=M.belt.pos[0]+r.x;S.y=M.belt.pos[1]+r.y;S.z=M.belt.pos[2]+r.z;tick(.1);ok(Math.hypot(S.x-M.belt.pos[0]-r.x,S.y-M.belt.pos[1]-r.y,S.z-M.belt.pos[2]-r.z)>=r.r,'SpaceObjects.update runs the collision while you are in the field')}
{place(M.belt.pos[0]+5e4,M.belt.pos[1],M.belt.pos[2]);const t0=performance.now();for(let i=0;i<4000;i++)SpaceObjects.update(1/60,i/60);const per=(performance.now()-t0)/4000;ok(per<.4,'far away the whole system costs '+per.toFixed(3)+' ms per frame')}
{place(M.belt.pos[0]+M.belt.r*.5,M.belt.pos[1],M.belt.pos[2]);const t0=performance.now();for(let i=0;i<600;i++)SpaceObjects.update(1/60,i/60);const per=(performance.now()-t0)/600;ok(per<2.5,'inside the field (118 rocks tumbling + collision) it costs '+per.toFixed(2)+' ms per frame')}

// 5) the gate
{const g=gate.group,zs=SpaceGate.zones;ok(zs.length===2,'two posts');
 const d=Math.hypot(zs[0].x-zs[1].x,zs[0].y-zs[1].y,zs[0].z-zs[1].z);ok(d>80&&d<100,'the posts are '+d.toFixed(0)+' m apart');
 const c=M.belt.pos;ok(zs.every(z=>Math.hypot(z.x-c[0],z.y-c[1],z.z-c[2])<60),'both posts stand inside the ring, in the clearing');
 const fwd=new T.Vector3(0,0,1).transformDirection(g.matrixWorld);ok(fwd.x*M.axis[0]+fwd.y*M.axis[1]+fwd.z*M.axis[2]>.9999,'the ring faces the planet: looking through it, you see the other world');
 ok(gate.def.r===SpaceGate.RING&&!SpaceGate.awake&&!SpaceGate.parts.beam.visible,'asleep at first: no column of light')}
{// alone: a hint after a while, never wakes
 const z=SpaceGate.zones;S.x=z[0].x;S.y=z[0].y;S.z=z[0].z;place(S.x,S.y,S.z);others.clear();for(let i=0;i<60*8;i++)sys.link(1/60);
 ok(!SpaceGate.awake&&banners.filter(b=>b.startsWith('THE RING: It hums')).length===1,'alone at a post: it hums once, "it wants someone at the other post", and stays asleep')}
{// both at the SAME post: not enough
 const z=SpaceGate.zones;S.x=z[0].x;S.y=z[0].y;S.z=z[0].z;others.set('p',{group:{position:new T.Vector3(z[0].x,z[0].y,z[0].z)}});for(let i=0;i<60*6;i++)sys.link(1/60);ok(!SpaceGate.awake,'two people at the same post: nothing (each post needs its own person)');others.clear()}
{// the real thing: one at each post for the hold time
 const z=SpaceGate.zones;S.x=z[0].x;S.y=z[0].y;S.z=z[0].z;others.set('p',{group:{position:new T.Vector3(z[1].x,z[1].y+10,z[1].z)}});
 let t=0;for(;t<60*2.5;t++)sys.link(1/60);ok(!SpaceGate.awake&&SpaceGate.parts.inlay.material.opacity>.5,'2.5 s of both holding: it is lighting up ('+SpaceGate.parts.inlay.material.opacity.toFixed(2)+') but not awake yet');
 for(;t<60*3.4;t++)sys.link(1/60);ok(SpaceGate.awake&&SpaceGate.parts.beam.visible,'after the hold time it wakes and the column of light toward the planet appears');
 ok(SpaceEvents.isFound('gate_awake')&&ws.log.some(e=>e.key==='gate_awake')&&banners.some(b=>b.startsWith('THE RING: The ring wakes')),'it is recorded in the shared journal and announced');
 const n=banners.length;SpaceGate.wake();ok(banners.length===n,'waking again is idempotent: no second announcement')}
{// a hold that is broken loses progress; a partner who walks off cannot finish it
 world();const z=SpaceGate.zones;S.x=z[0].x;S.y=z[0].y;S.z=z[0].z;const p={group:{position:new T.Vector3(z[1].x,z[1].y,z[1].z)}};others.set('p',p);
 for(let i=0;i<60*2.9;i++)sys.link(1/60);p.group.position.set(z[1].x+500,z[1].y,z[1].z);for(let i=0;i<60*3;i++)sys.link(1/60);ok(!SpaceGate.awake,'the partner leaves just before the end: it does not complete')}
{// it stays awake: a new session with the journal entry starts awake and arms no Link
 world(['gate_awake']);ok(SpaceGate.awake&&SpaceGate.parts.beam.visible,'next session: still awake (kept in the journal)');ok(!sys.link,'and it does not arm a Link group again')}

// 6) the planet
world();const pl=()=>by('planet');
{const W=SpacePlanet.W,H=SpacePlanet.H,a=SpacePlanet.surface(W,H),b=SpacePlanet.surface(W,H);let same=true;for(let i=0;i<a.length;i+=97)if(a[i]!==b[i]){same=false;break}ok(same,'the surface is deterministic');
 const inc=new Uint8Array(W*H*4);for(let j=0;j<H;j+=4)SpacePlanet.surfaceRows(inc,W,H,j,Math.min(H,j+4));let eq=true;for(let i=0;i<a.length;i++)if(a[i]!==inc[i]){eq=false;break}ok(eq,'generating it a band of rows at a time gives exactly the same pixels');
 let sea=0,n=0;for(let j=H*.3;j<H*.7;j+=3)for(let i=0;i<W;i+=3){const k=(Math.floor(j)*W+i)*4;n++;if(a[k+2]>a[k]*1.1)sea++}ok(sea/n>.25&&sea/n<.75,'between the poles about '+Math.round(sea/n*100)+'% of it is sea: oceans and continents both');
 let ice=0;for(let i=0;i<W;i+=2){const k=(1*W+i)*4;if(a[k]>200&&a[k+1]>200&&a[k+2]>200)ice++}ok(ice>W/2*.6,'ice at the poles');
 ok(a.every((v,i)=>i%4!==3||v===255),'fully opaque')}
{const c=SpacePlanet.clouds(256,128);let cov=0;for(let i=3;i<c.length;i+=4)if(c[i]>128)cov++;const f=cov/(c.length/4);ok(f>.15&&f<.6,'clouds cover '+Math.round(f*100)+'% of the sky of the planet')}
{const P=SpacePlanet.parts;ok(P&&!P.job.done&&!P.g.visible,'built without generating the textures up front (no stall at world load)');
 place(0,100,0);pl().def.update(pl(),1/60,0);ok(!P.job.done,'no work done while you are on the ground');
 place(0,7000,0);let frames=0;while(!P.job.done&&frames<400){SpaceObjects.update(1/60,frames/60);frames++}ok(P.job.done&&P.body.material.map&&P.cloud.material.map,'climbing past 6 km generates it over '+frames+' frames ('+(frames/60).toFixed(1)+' s of the climb), 4+2 rows per frame')}
{place(0,30000,0);pl().def.update(pl(),1/60,0);ok(!SpacePlanet.parts.g.visible,'not visible from 30 km (the sky is still blue)');
 place(0,60000,0);camera.position.set(0,60000,0);camera.updateMatrixWorld(true);pl().def.update(pl(),1/60,0);{const o=SpacePlanet.parts.body.material.opacity;ok(SpacePlanet.parts.g.visible&&o>.2&&o<.9,'at 60 km it is fading in with the stars (opacity '+o.toFixed(2)+')')}
 place(0,130000,0);camera.position.set(0,130000,0);camera.updateMatrixWorld(true);pl().def.update(pl(),1/60,0);const P=SpacePlanet.parts;ok(P.g.visible&&P.body.material.opacity>.99,'from the edge of space it is there, fully');
 const dist=Math.hypot(P.body.position.x-camera.position.x,P.body.position.y-camera.position.y,P.body.position.z-camera.position.z);const D=Math.hypot(M.planet.pos[0]-0,M.planet.pos[1]-130000,M.planet.pos[2]);
 ok(dist<=SpacePlanet.IMP_D+1&&D>SpacePlanet.IMP_D,'beyond the depth range it is drawn as an impostor at '+(dist/1000).toFixed(0)+' km instead of its true '+(D/1000).toFixed(0)+' km');
 ok(Math.abs(Math.asin(P.body.scale.x/dist)-Math.asin(M.planet.r/D))<1e-6,'with exactly the same apparent size: '+(Math.asin(M.planet.r/D)*57.3).toFixed(1)+'° half-angle');
 const dir0=new T.Vector3(M.planet.pos[0],M.planet.pos[1]-130000,M.planet.pos[2]).normalize(),dir1=new T.Vector3().subVectors(P.body.position,camera.position).normalize();ok(dir0.dot(dir1)>.999999,'in exactly the right direction')}
{const o={x:0,y:0,z:0,s:1,D:1};camera.position.set(M.planet.pos[0]+M.planet.r+50000,M.planet.pos[1],M.planet.pos[2]);SpacePlanet.place(camera.position,o);ok(Math.abs(o.s-M.planet.r)<1e-6&&Math.abs(o.x-M.planet.pos[0])<1e-6,'close up (inside 600 km) it is drawn exactly where and how big it is')}
{const C=M.planet.pos,R=M.planet.r;const P={x:C[0]+R*.5,y:C[1],z:C[2]};ok(SpacePlanet.hold(P)&&Math.abs(Math.hypot(P.x-C[0],P.y-C[1],P.z-C[2])-(R+SpacePlanet.HOVER))<1e-3,'you cannot go inside the planet: held 600 m above the surface');
 const Q={x:C[0]+R+5000,y:C[1],z:C[2]};ok(!SpacePlanet.hold(Q)&&Q.x===C[0]+R+5000,'above that, untouched');const Z={x:C[0],y:C[1],z:C[2]};ok(SpacePlanet.hold(Z)&&Z.y>C[1]+R,'even from dead centre you are put outside')}
{place(M.planet.pos[0]+M.planet.r+100000,M.planet.pos[1],M.planet.pos[2]);look(S,{x:M.planet.pos[0],y:M.planet.pos[1],z:M.planet.pos[2]});tick(2.5,1/30);
 ok(pl().found&&ws.log.some(e=>e.key==='planet')&&banners.some(b=>b.startsWith('Another world')||b.includes('Nobody has been here')),'found from 100 km, looking at it: "Another world. Nobody has been here."')}
{place(M.planet.pos[0]+M.planet.r+100000,M.planet.pos[1],M.planet.pos[2]);look(S,{x:M.planet.pos[0]*-1,y:M.planet.pos[1],z:M.planet.pos[2]*-1});world();const pl=by('planet');place(M.planet.pos[0]+M.planet.r+100000,M.planet.pos[1],M.planet.pos[2]);look(S,{x:M.planet.pos[0]*-1,y:M.planet.pos[1],z:M.planet.pos[2]*-1});tick(4);ok(!pl.found,'looking the other way: not found')}
{world();place(M.planet.pos[0]+M.planet.r+400000,M.planet.pos[1],M.planet.pos[2]);look(S,{x:M.planet.pos[0],y:M.planet.pos[1],z:M.planet.pos[2]});tick(4);ok(!by('planet').found,'too far (400 km): not found')}

// 6b) the ?space= test hook: fly straight to each place, facing it
{globalThis.me=null;for(const [id,min,max] of [['belt',M.belt.r+3000,M.belt.r+5000],['planet',M.planet.r+140000,M.planet.r+160000],['sat',2500,3500]]){world();const o=by(id==='sat'?'satellite':id);S.flying=false;ok(SpaceObjects.warp(id)&&S.flying,'warp('+id+') puts you in flight');
  const d=Math.hypot(o.pos.x-S.x,o.pos.y-S.y,o.pos.z-S.z),f=Math.atan2(o.pos.x-S.x,o.pos.z-S.z);ok(d>min&&d<max&&Math.abs(Math.sin(S.yaw-f))<1e-9&&S.fvx===0&&S.vy===0,'  '+(d/1000).toFixed(1)+' km away, facing it, at rest')}
 world();SpaceObjects.warp('gate');{const c=M.belt.pos,d=Math.hypot(S.x-c[0],S.y-c[1],S.z-c[2]);ok(Math.abs(d-300)<1e-6&&!SpaceBelt.collide({...S}),'warp(gate): 300 m behind the ring, clear of every rock');
  const v=new T.Vector3(c[0]-S.x,c[1]-S.y,c[2]-S.z).normalize();ok(v.x*M.axis[0]+v.y*M.axis[1]+v.z*M.axis[2]>.999999,'  looking through the ring down its axis toward the planet')}
 ok(!SpaceObjects.warp('nope'),'an unknown name does nothing')}

// 7) nothing on the ground is touched
{world();place(2000,50,1500);const x0=S.x,y0=S.y,z0=S.z;const t0=performance.now();for(let i=0;i<3000;i++)SpaceObjects.update(1/60,i/60);ok(S.x===x0&&S.y===y0&&S.z===z0&&!SpacePlanet.parts.g.visible,'on the island everything is inert (position untouched, planet hidden), '+((performance.now()-t0)/3000).toFixed(3)+' ms per frame');
 ok(SpaceFlight.moveMul(50)===1&&SpaceFlight.drift(Space.f.space)===1,'and flight is exactly as before')}
console.log(bad?bad+' failed':'space world ok');process.exit(bad?1:0);
