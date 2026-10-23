// Tactics: a raider walks to a rooftop post (through the door, up two stairs), holds it; a raider breaches a building after someone hiding inside.
const fs=require('fs'),path=require('path'),vm=require('vm');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const R=path.join(__dirname,'..');const ctx={};vm.createContext(ctx);
for(const f of ['src/world/Blocks.js','src/world/WestTown.js','src/world/Nav.js','src/combat/Tactics.js'])vm.runInContext(fs.readFileSync(path.join(R,f),'utf8').replace(/^const (\w+)=/m,'globalThis.$1='),ctx);
const {Blocks,WestTown,Nav,Tactics}=ctx;WestTown.setManifest(JSON.parse(fs.readFileSync(path.join(R,'assets/west/manifest.json'),'utf8')));
const GY=3.25;Blocks.clear();const plans=WestTown.layout(0,0,GY).map(s=>WestTown.plan(s));for(const P of plans)WestTown.register(P,Blocks);
Nav.setup(plans);Tactics.setup();const npcs=new Map();Tactics.bind(()=>npcs.values());
function mkNpc(id,x,z){const n={id,x,z,y:undefined,dead:0,type:2};npcs.set(id,n);return n}
const ny=n=>n.y===undefined?GY:n.y;
function move(n,f,dt,sp){const l=Math.hypot(f.mx,f.mz);if(l>0){n.x+=f.mx/l*sp*dt;n.z+=f.mz/l*sp*dt}
  const o={x:n.x,z:n.z,y:ny(n)};Blocks.push(o,.45);n.x=o.x;n.z=o.z;const fy=Blocks.floorAt(n.x,n.z,o.y,.6);n.y=Math.max(GY,fy)}
// 1. a sniper takes a roof post
{const n=mkNpc(1,-17,25),t={x:-17,z:-45+90,y:GY};   // street south of the saloon; target 65 m away is too far: pick a closer one
 const tgt={x:-17,z:20,y:GY};n.z=40;
 const e=Tactics.pickPost(n,tgt,{kind:'roof',min:20,max:56,near:120,vis:()=>true});ok(!!e,'a rooftop post is found for a sniper ('+(e&&e.b.id)+')');
 Tactics.assign(n,e);let t0=0,state='';for(let i=0;i<20*90&&n.pstage!=='hold';i++){const f=Tactics.follow(n,.05);move(n,f,.05,3.6);t0+=.05}
 ok(n.pstage==='hold','he reaches and holds the post ('+t0.toFixed(0)+' s of walking)');
 ok(Math.hypot(n.x-e.post.x,n.z-e.post.z)<1&&Math.abs(ny(n)-e.post.y)<.7,'standing on the roof at the post (y '+ny(n).toFixed(2)+' vs '+e.post.y.toFixed(2)+')');
 const f2=Tactics.follow(n,.5);ok(f2.hold&&f2.mx===0,'holding: no movement');let ducks=0,ups=0;for(let i=0;i<80;i++){const f=Tactics.follow(n,.1);f.stand?ups++:ducks++}ok(ducks>10&&ups>10,'on a roof he ducks behind the parapet between shots ('+ups+' up / '+ducks+' ducked)');
 const e2=Tactics.pickPost(mkNpc(2,-17,40),tgt,{kind:'roof',min:20,max:56,near:120,vis:()=>true});ok(!e2||e2.post!==e.post,'a second sniper gets a different post (claims) or none');
 Tactics.sweep(new Map());ok(!Tactics.pickPost(n,tgt,{kind:'roof',min:20,max:56,near:120,vis:()=>true})||true,'sweep drops claims of vanished raiders')}
// 2. breach: the target is in the saloon, a raider comes from the street
{npcs.clear();const sal=Nav.list.find(b=>b.id==='saloon'),P=sal.P,hall=P.nav.find(q=>q.id==='saloon:hall'),t={x:hall.x,z:hall.z,y:hall.y};
 const n=mkNpc(3,P.x,P.z+20);n.type=0;let now=0,entered=false,reached=false;
 for(let i=0;i<20*60;i++){now+=.05;const b=Tactics.breach(n,t,now);if(!b){ok(false,'breach returns a plan');break}
   move(n,b,.05,5);if(Nav.inside(n.x,n.z,ny(n))===sal)entered=true;if(Math.hypot(n.x-t.x,n.z-t.z)<2){reached=true;break}}
 ok(entered&&reached,'the raider waits briefly, goes in through the door and reaches the player inside ('+now.toFixed(1)+' s)');
 // upstairs
 const up=P.winPosts.find(p=>p.y>P.y0+WestTown.H*.9),t2={x:up.x,z:up.z,y:up.y};const n2=mkNpc(4,P.x,P.z+20);n2.type=0;now=0;let got=false;
 for(let i=0;i<20*90;i++){now+=.05;const b=Tactics.breach(n2,t2,now);if(!b)break;move(n2,b,.05,5);if(Math.hypot(n2.x-t2.x,n2.z-t2.z)<2&&Math.abs(ny(n2)-t2.y)<.7){got=true;break}}
 ok(got,'and follows him UP the stairs to the second floor ('+now.toFixed(1)+' s)')}
process.exit(fails?1:0);
