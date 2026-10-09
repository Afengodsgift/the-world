// OutlawArena checks: relief, breakable cover (host + client flow, regrow), explosive chain, the train (path on land, phases, sync), spawn fronts. Real H() + islands data, stubbed Outlaw context.
const fs=require('fs'),vm=require('vm'),THREE=require('three'),R=__dirname+'/../';
const idx=fs.readFileSync(R+'index.html','utf8'),a=idx.indexOf('function H(x,z){'),Hsrc=idx.slice(a,idx.indexOf('\n}\n',a)+3);
const sent=[],log={boom:[],hurt:[],aoe:[],drop:[],sfx:[]};let host=true;
const cover=[],solids=[],scene=new THREE.Scene();
const c={Math,THREE,console,Date,setTimeout,isFinite,S:{x:1e6,y:0,z:1e6,flying:false},LOCS:[],banner:()=>{}};vm.createContext(c);
vm.runInContext([fs.readFileSync(R+'src/utils/math.js','utf8'),fs.readFileSync(R+'src/utils/random.js','utf8'),fs.readFileSync(R+'src/data/islands.js','utf8'),'const K=2.5;',Hsrc,fs.readFileSync(R+'src/games/OutlawArena.js','utf8'),'this.H=H;this.OUT=OUT;this.A=OutlawArena;this.LX=LOCS;'].join('\n'),c);
const {H,OUT,A}=c;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const C={x:OUT.x,z:OUT.z,y:OUT.y};
ok(H(C.x-125,C.z+35)>10,'Lookout Ridge is a real hill ('+H(C.x-125,C.z+35).toFixed(1)+' m)');
ok(H(C.x+125,C.z+15)>8,'Mine mesa is raised ('+H(C.x+125,C.z+15).toFixed(1)+' m)');
ok(Math.abs(H(C.x,C.z)-OUT.y)<.01,'town plateau unchanged');
const X={C,cover,solids,scene,send:o=>sent.push(o),isHost:()=>host,boom:(x,z,r)=>log.boom.push([x,z,r]),sfx:n=>log.sfx.push(n),spark:()=>{},hurtMe:(d,x,z)=>log.hurt.push(d),dropAt:(x,z)=>log.drop.push([x,z]),aoeNpc:(x,z,r,d)=>log.aoe.push([x,z,r,d])};
const before0=c.LX.length;A.build(X);const T=A._t();
ok(T.brk.length>=30,'breakables built ('+T.brk.length+')');
ok(c.LX.length-before0===3,'3 new named places (mine, ridge, ranch)');
ok(T.brk.every(b=>cover.includes(b.c)&&solids.includes(b.c)&&b.c.brk===b.id),'every breakable is a cover+solid entry with its id');
ok(T.brk.every(b=>H(b.x,b.z)>.7&&Math.hypot(b.x-C.x,b.z-C.z)>80&&Math.hypot(b.x-C.x,b.z-C.z)<190),'breakables sit on land, outside the town, inside the island');
// ---- host break flow ----
const crate=T.brk.find(b=>b.kind==='crate');sent.length=0;A.hitCover(crate.c,20);ok(!crate.dead&&crate.hp===25,'host: 20 damage dents a 45 hp crate');
A.hitCover(crate.c,40);ok(crate.dead&&!cover.includes(crate.c)&&!solids.includes(crate.c),'host: crate breaks and leaves cover + solids');
ok(sent.filter(o=>o.k==='cb'&&o.i===crate.id).length===1,'host broadcasts exactly one break');A.hitCover(crate.c,40);ok(sent.filter(o=>o.k==='cb').length===1,'no double break');
A.reset();ok(!crate.dead&&cover.includes(crate.c)&&solids.includes(crate.c)&&crate.hp===crate.max,'reset regrows cover');
// ---- client flow ----
host=false;sent.length=0;const hay=T.brk.find(b=>b.kind==='hay');A.hitCover(hay.c,30);ok(sent.length===1&&sent[0].k==='cv'&&sent[0].i===hay.id&&!hay.dead,'client: damage is sent to the host, nothing breaks locally');
A.onMsg({k:'cb',i:hay.id});ok(hay.dead&&!cover.includes(hay.c),'client: break message removes it');A.onMsg({k:'rs'});ok(!hay.dead&&cover.includes(hay.c),'client: regrow message restores it');
A.hitCover({x:0,z:0,r:1},50);ok(sent.length===1,'non-breakable cover is ignored');
host=true;
// ---- explosive chain ----
const xs=T.brk.filter(b=>b.kind==='xbarrel'),first=xs.find(b=>xs.some(o=>o!==b&&Math.hypot(o.x-b.x,o.z-b.z)<6.5));
ok(!!first,'there are explosive barrels close enough to chain');
c.S.x=first.x+3;c.S.z=first.z;log.hurt.length=0;log.aoe.length=0;A.hitCover(first.c,999);
ok(first.dead&&log.boom.length===1,'barrel explodes');ok(log.hurt.length===1&&log.hurt[0]>5,'player 3 m away is hurt ('+log.hurt[0]+')');ok(log.aoe.length===1&&log.aoe[0][3]===75,'host damages raiders in the blast');
const nb=xs.filter(o=>o!==first&&Math.hypot(o.x-first.x,o.z-first.z)<6.5);A.tick(.5);A.tick(.5);ok(nb.every(o=>o.dead),'neighbouring barrels chain-explode ('+nb.length+')');
c.S.x=1e6;c.S.z=1e6;A.reset();
// ---- train ----
let minR=1e9,off=0;for(let s=0;s<=T.T.len;s+=2){const p=T.pathAt(s);if(H(p.x,p.z)<.5)off++;minR=Math.min(minR,Math.hypot(p.x-C.x,p.z-C.z))}
ok(off===0,'track stays on land');ok(minR>85,'track keeps clear of the town ('+minR.toFixed(0)+' m)');
const L=T.T.len,r=T.T.range,pw=T.T.V*T.T.pause,total=2*(r+pw),now=Date.now()/1000*T.T.V;
const at=q=>{T.T.off=q-(now%total);return T.trainState()};
const s1=at(r*.5),s2=at(r+pw*.5),s3=at(r+pw+r*.5),s4=at(2*r+pw+pw*.5);
ok(s1.moving&&s1.dir===1&&Math.abs(s1.a-r*.5)<1.5,'train runs east');ok(!s2.moving&&Math.abs(s2.a-r)<1.5,'train waits at the east end');ok(s3.moving&&s3.dir===-1,'train runs back west');ok(!s4.moving&&s4.a<1.5,'train waits at the west end');
at(r*.5);const c1x=T.T.units[0].c1.x;A.tick(.1);const c1x2=T.T.units[0].c1.x;ok(T.T.units.length===5&&T.T.units.every(u=>cover.includes(u.c1)&&cover.includes(u.c2)),'5 train units, each with 2 moving cover circles');
ok(Math.hypot(T.T.units[0].x-T.T.units[1].x,T.T.units[0].z-T.T.units[1].z)>7&&Math.hypot(T.T.units[0].x-T.T.units[1].x,T.T.units[0].z-T.T.units[1].z)<9,'cars are coupled ~8.5 m apart');
T.T.off=0;const hq=((now+500)%total);for(let i=0;i<40;i++)A.trainSync(hq);const dq=((A.trainQ()-hq)%total+total)%total;ok(Math.min(dq,total-dq)<1.5,'client train converges on the host phase');
// hazard
at(r*.5);A.tick(.01);const u0=T.T.units[2];c.S.x=u0.x;c.S.z=u0.z;c.S.y=H(u0.x,u0.z)+.2;log.hurt.length=0;T.T.hitCd=0;A.tick(.01);ok(log.hurt.length===1&&log.hurt[0]===18,'standing on the tracks as the train passes hurts');
A.tick(.01);ok(log.hurt.length===1,'train hit has a cooldown');c.S.x=1e6;c.S.z=1e6;
// ---- fronts ----
const P=w=>A.pickFronts(w);ok(P(1).length===1&&P(4).length===2&&P(8).length===3,'1 front early, 2 mid, 3 late');ok(new Set(P(8)).size===3,'fronts are distinct');
let allLand=true;for(const f of T.fronts){for(let i=0;i<30;i++){A.setFronts([f.id],false);const [x,z]=A.front(0);if(H(x,z)<.8||Math.hypot(x-f.x,z-f.z)>12)allLand=false}}ok(allLand,'every spawn lands on solid ground near its front');
A.setFronts(['mine','ridge'],false);let sn=0;for(let i=0;i<20;i++){const [x,z]=A.front(2);const rf=T.fronts.find(f=>f.id==='ridge');if(Math.hypot(x-rf.x,z-rf.z)<12)sn++}ok(sn===20,'snipers use the ridge when it is a front');
let both=new Set();for(let i=0;i<20;i++){const [x,z]=A.front(0);both.add(Math.hypot(x-T.fronts[0].x,z-T.fronts[0].z)<14?'m':'r')}ok(both.size===2,'normal raiders alternate between the active fronts');
console.log(bad?bad+' problem(s)':'outlaw arena OK');process.exit(bad?1:0);
