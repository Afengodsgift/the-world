// Tidal Ruins: tide clock maths, site + boss wiring.
const fs=require('fs'),vm=require('vm');let bad=0;const ok=(c,m)=>{if(!c){bad++;console.log('✗ '+m)}};
const ld=f=>fs.readFileSync(__dirname+'/../src/'+f,'utf8');
const ctx={console,Math,Date};vm.createContext(ctx);vm.runInContext(ld('games/TidalRuins.js')+';this.T=TidalRuins',ctx);const T=ctx.T;
ok(T.level(0)===0&&T.level(10000)===0,'ebb is dry');
ok(T.level(25000)===1&&T.level(30000)===1,'high is full');
ok(T.level(17000)>0&&T.level(17000)<1,'rising is between');
ok(T.level(37000)>0&&T.level(37000)<1,'falling is between');
ok(Math.abs(T.level(5000)-T.level(45000))<1e-9,'cycle repeats (40 s)');
let mono=true,p=0;for(let t=14000;t<=20000;t+=100){const l=T.level(t);if(l<p-1e-9)mono=false;p=l}ok(mono,'rise is monotonic');
ok(T.bossMul(25000)>1&&T.bossMul(5000)<1&&T.bossMul(17000)===1||T.bossMul(17000)>=1,'boss empowered at high, sluggish at ebb');
ok(T.wade(25000)<T.wade(5000)&&T.wade(5000)===1,'wading slows only at high tide');
ok(T.event(10000,12000)==='warnRise'&&T.event(15000,16000)==='rise'&&T.event(30000,32000)==='warnFall'&&T.event(35000,36000)==='fall','tide callouts fire in order');
ok(T.event(0,1000)===null,'no callout in a quiet second');
ok(T.event(39000,81000)!==null,'a callout is found across a cycle wrap');
// data wiring
const W=ld('data/warden.js'),F=ld('combat/Foes.js');
ok(/id:'tidal'/.test(W)&&/t:'drownedking'/.test(W),'site tidal has the Drowned King');
ok(/drownedking:\{/.test(F)&&/kid:'darkknight'/.test(F),'boss borrows the Artorias move tables through kid');
// the site must not overlap any other site
const sites=[...W.matchAll(/id:'(\w+)',n:[^,]*,x:(-?\d+),z:(-?\d+),R:(\d+)/g)].map(m=>({id:m[1],x:+m[2],z:+m[3],R:+m[4]}));
const t=sites.find(s=>s.id==='tidal');ok(!!t,'tidal parsed');
for(const s of sites)if(s.id!=='tidal'&&Math.hypot(s.x-t.x,s.z-t.z)<s.R+t.R+6)ok(false,'tidal overlaps '+s.id);
ok(Math.hypot(t.x,t.z)+t.R<290,'tidal sits on the island');
process.exit(bad?1:0);
