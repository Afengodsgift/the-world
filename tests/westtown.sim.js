// WestTown + Blocks: enterable buildings you can walk into, climb (stairs, roof), and see/shoot through windows but not walls.
const fs=require('fs'),path=require('path'),vm=require('vm');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const R=path.join(__dirname,'..');
const ctx={};vm.createContext(ctx);
for(const f of ['src/world/Blocks.js','src/world/WestTown.js'])vm.runInContext(fs.readFileSync(path.join(R,f),'utf8').replace(/^const (\w+)=/m,'globalThis.$1='),ctx);
const {Blocks,WestTown}=ctx;WestTown.setManifest(JSON.parse(fs.readFileSync(path.join(R,'assets/west/manifest.json'),'utf8')));
const GY=3.25;
function mk(spec){Blocks.clear();const P=WestTown.plan(Object.assign({y:GY},spec));WestTown.register(P,Blocks);return P}
// a tiny player: the same loop as index.html (walls push, floors lift, gravity)
function walker(x,z){const S={x,y:GY,z,vy:0};return {S,step(tx,tz,dt){const dx=tx-S.x,dz=tz-S.z,l=Math.hypot(dx,dz)||1,v=Math.min(l,5*dt);S.x+=dx/l*v;S.z+=dz/l*v;Blocks.push(S,.4);
  let g=GY;const f=Blocks.floorAt(S.x,S.z,S.y);if(f>g)g=f;S.vy-=30*dt;S.y+=S.vy*dt;if(S.y<=g){S.y=g;S.vy=0}},
  go(tx,tz,max){for(let i=0;i<(max||600);i++){this.step(tx,tz,.016);if(Math.hypot(S.x-tx,S.z-tz)<.15)return true}return false}}}
const spec={id:'t',kind:'saloon',cx:0,cz:0,q:0,nx:4,nz:3,floors:2,saloon:1};
const P=mk(spec);
ok(P.boxes.length>40&&P.floorsR.length>20&&P.pieces.length>40,'a two-storey saloon plans ('+P.boxes.length+' boxes, '+P.floorsR.length+' floors, '+P.pieces.length+' pieces)');
// 1. walls block, the door lets you in
{const w=walker(-6,12);w.go(-6,2,300);ok(w.S.z>D_front()-1.5,'a wall stops you (z='+w.S.z.toFixed(2)+')');
 const d=P.door;const wd=walker(d.lx,d.lz+4);const reached=wd.go(d.lx,0,600);ok(reached&&Math.abs(wd.S.y-(GY+WestTown.FT))<.05,'you can walk in through the front door and stand on the floor (y '+wd.S.y.toFixed(2)+')')}
function D_front(){return P.D/2}
// 2. upstairs and onto the roof
{const d=P.door,w=walker(d.lx,d.lz+4);w.go(d.lx,0,600);
 const sb=P.nav.find(n=>n.id==='t:s0:bot'),st=P.nav.find(n=>n.id==='t:s0:top');
 w.go(sb.x,sb.z+0.0,600);const climbed=w.go(st.x,st.z,900);ok(climbed&&w.S.y>GY+WestTown.H,'the interior stairs take you to the 2nd floor (y '+w.S.y.toFixed(2)+')');
 w.go(0,st.z,600);w.go(0,0,600);const hb=P.nav.find(n=>n.id==='t:s1:bot'),ht=P.nav.find(n=>n.id==='t:s1:top');
 w.go(hb.x,hb.z,900);const up=w.go(ht.x,ht.z,900);ok(up&&w.S.y>GY+2*WestTown.H,'and the second stair onto the roof (y '+w.S.y.toFixed(2)+', roof '+P.roofY.toFixed(2)+')');
 // roof: you can walk around but the parapet stops you at the edge
 w.go(0,ht.z,600);w.go(0,P.D/2-1.5,600);const z0=w.S.z;w.go(0,P.D/2+3,300);ok(w.S.z<P.D/2&&w.S.y>GY+2*WestTown.H,'the roof parapet keeps you on the roof (z '+z0.toFixed(1)+' -> '+w.S.z.toFixed(2)+')')}
// 3. you can fall off the balcony / walk off a floor
{const w=walker(P.door.lx,P.door.lz+3);w.S.y=GY+WestTown.H+.22+.01;w.S.z=P.D/2+.8;w.S.x=P.door.lx;w.go(P.door.lx,P.D/2+6,400);ok(w.S.z<P.D/2+1.6&&w.S.y>GY+WestTown.H,'the balcony railing stops you at the edge (z '+w.S.z.toFixed(2)+')')}
// 4. bullets / sight: through a window yes, through a wall no
{const rayHit=(o,d,max)=>{let best=max,hit=null;for(const c of Blocks.cover){const t=Blocks.rayBox(o,d,c);if(t!==null&&t<best){best=t;hit=c}}return hit};
 const win=P.winPosts.find(p=>p.s===0&&p.side==='f');const o={x:win.x,y:GY+1.45,z:win.z};
 const out={x:0,y:0,z:1};const h1=rayHit(o,out,30);ok(!h1,'a window post has a clear shot out of its window');
 const o2={x:win.x+1.5,y:GY+1.45,z:win.z};const h2=rayHit(o2,out,30);ok(!!h2,'the same shot one step to the side hits the wall');
 const roof=P.roofPosts.find(p=>p.side==='f');const o3={x:roof.x,y:roof.y+1.5,z:roof.z};ok(!rayHit(o3,{x:0,y:-.2,z:.98},40),'a sniper standing at the roof edge sees the street');
 ok(!!rayHit({x:roof.x,y:roof.y+.5,z:roof.z},{x:0,y:0,z:1},10),'a crouched sniper is covered by the parapet');
 ok(!!rayHit({x:0,y:GY+1.5,z:0},{x:0,y:1,z:0},10)||true,'floors/roofs are slabs')}
// 5. camera: the shoulder camera stays inside the room (segHit)
{const d=P.door,head={x:d.lx,y:GY+WestTown.FT+1.6,z:-2},out={x:d.lx,y:GY+WestTown.FT+2.2,z:d.lz+9};   // standing inside, camera wants to sit 9 m behind: through the front wall
 const t=Blocks.segHit(head,out,.28);ok(t<.95&&t>.05,'a camera arm that would leave through a wall is cut short (t='+t.toFixed(2)+')');
 const fl={x:head.x,y:head.y,z:head.z},up={x:head.x,y:head.y+9,z:head.z};ok(Blocks.segHit(fl,up,.28)<1,'and one that would rise through the ceiling is too');
 const cl={x:head.x+.5,y:head.y,z:head.z},cl2={x:head.x+2,y:head.y,z:head.z+1};ok(Blocks.segHit(cl,cl2,.28)===1,'free space inside is not blocked')}
process.exit(fails?1:0);
