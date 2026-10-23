// Nav: raiders can path through doors, up the stairs, onto the roof and to every window / rooftop post of every building, and the paths are REALLY walkable (walls push, floors lift).
const fs=require('fs'),path=require('path'),vm=require('vm');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const R=path.join(__dirname,'..');const ctx={};vm.createContext(ctx);
for(const f of ['src/world/Blocks.js','src/world/WestTown.js','src/world/Nav.js'])vm.runInContext(fs.readFileSync(path.join(R,f),'utf8').replace(/^const (\w+)=/m,'globalThis.$1='),ctx);
const {Blocks,WestTown,Nav}=ctx;WestTown.setManifest(JSON.parse(fs.readFileSync(path.join(R,'assets/west/manifest.json'),'utf8')));
const GY=3.25;
const specs=[...WestTown.layout(0,0,GY),...WestTown.outposts(0,0).map(s=>Object.assign(s,{y:GY}))];
Blocks.clear();const plans=specs.map(s=>WestTown.plan(s));for(const P of plans)WestTown.register(P,Blocks);
Nav.setup(plans);
// walk a path with the same physics as the game (index.html / Outlaw.js): straight lines, wall push, floors lift
function walk(start,wps){const S={x:start.x,z:start.z,y:start.y},g0=start.y;
  for(const w of wps){for(let i=0;i<900;i++){const dx=w.x-S.x,dz=w.z-S.z,l=Math.hypot(dx,dz);if(l<.25)break;const v=Math.min(l,5*.05);S.x+=dx/l*v;S.z+=dz/l*v;Blocks.push(S,.45);const f=Blocks.floorAt(S.x,S.z,S.y,.6);S.y=Math.max(g0,f===-Infinity?g0:f)}
    const f=Blocks.floorAt(S.x,S.z,S.y,.6);S.y=Math.max(g0,f===-Infinity?g0:f)}   // (same floor update the raiders do every frame, also on arrival)
  return S}
let posts=0,reached=0,miss=[];const t0=Date.now();
for(const P of plans){const b=Nav.list.find(q=>q.id===P.id),e=Nav.entry(b);
  const all=[...P.roofPosts,...P.winPosts];
  for(const post of all){posts++;const p=Nav.postPath(b,post);if(!p){miss.push(P.id+' no path to '+post.kind+' '+post.x.toFixed(1)+','+post.z.toFixed(1)+' y'+post.y.toFixed(2));continue}
    const S=walk(e,p);const d=Math.hypot(S.x-post.x,S.z-post.z);if(d<.9&&Math.abs(S.y-post.y)<.6)reached++;else miss.push(P.id+' walked off the path to '+post.kind+' ('+d.toFixed(1)+' m, y '+S.y.toFixed(2)+' vs '+post.y.toFixed(2)+')')}}
ok(posts>100,'plans have posts ('+posts+')');
ok(reached/posts>=.97,reached+' / '+posts+' posts are reachable from the street and the path is walkable ('+(Date.now()-t0)+' ms)');
if(miss.length)console.log(miss.slice(0,400).join('\n'));
// the player inside a room: path from the door to a spot upstairs, and back down
{const P=plans[0],b=Nav.list[0],e=Nav.entry(b);const up=P.winPosts.find(p=>p.y>P.y0+WestTown.H*.9);
 const p1=Nav.path(b,e,{x:up.x,z:up.z,y:up.y});ok(!!p1&&p1.length>3,'door -> upstairs window has a multi-step path');
 const p2=Nav.path(b,{x:up.x,z:up.z,y:up.y},e);ok(!!p2,'and the way back down exists');
 const dd=Nav.at(P.x,P.z,P.y0+1),ins=Nav.inside(P.x,P.z,P.y0+1);ok(dd===b&&ins===b,'Nav.at / inside find the building from a point in the room');
 ok(Nav.inside(P.x+40,P.z,P.y0+1)===null,'and nothing far away')}
process.exit(fails?1:0);
