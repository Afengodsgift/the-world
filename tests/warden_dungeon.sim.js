// The Ashen Catacombs: layout invariants (rooms, corridors, walls, doors, chests, lever, props, foes) + WardenDungeon progress / loot / persistence rules.
const fs=require('fs'),vm=require('vm'),G=require('./golden/golden_lib.js');
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const c=G.makeH(true),W=vm.runInContext('WARDEN',c),WRD=c.W,H=c.H,DG=vm.runInContext('typeof DUNGEON!=="undefined"?DUNGEON:null',c);
ok(!!DG&&!!W.dungeon,'dungeon data is part of WARDEN');
const g=W.dungeon,D=DG.D,rooms=g.rooms,hyp=Math.hypot;
const real=W.sites.filter(s=>!s.dg);
ok(rooms.length===6&&g.sites.length===6,'six rooms / six sites');
ok(g.sites.every(s=>s.dg&&typeof s.R==='number'&&s.R>=8&&s.R<=20),'every dungeon site is flagged dg with a sane radius');
ok(g.sites.filter(s=>s.fog).length===4&&g.sites.filter(s=>s.boss).length===1&&g.sites.filter(s=>s.safe).length===1,'4 sealed fights, exactly 1 cycle boss room, 1 safe room');
// inside the island, clear of every other site and of the old arena
ok(rooms.every(r=>hyp(r.cx,r.cz)+r.Rc<WRD.R-12),'every room is inside the isle ('+Math.max(...rooms.map(r=>hyp(r.cx,r.cz)+r.Rc)).toFixed(0)+' m of '+WRD.R+')');
ok(rooms.every(r=>real.every(s=>hyp(r.cx-s.x,r.cz-s.z)>r.Rc+s.R+6)),'no room overlaps an existing site');
ok(rooms.every(r=>hyp(r.cx,r.cz)-r.Rc>W.arenaR+10),'rooms stay out of the central arena');
ok(rooms.every((r,i)=>rooms.every((q,j)=>i===j||hyp(r.cx-q.cx,r.cz-q.cz)>r.Rc+q.Rc+3)),'rooms do not overlap each other');
// route: gate -> guard -> ossuary -> gaol -> court -> treasury, vault is a branch off the ossuary corridor
const byId=Object.fromEntries(rooms.map(r=>[r.id,r]));
ok(g.corridors.length===6&&g.corridors.every(cr=>cr.L>8&&cr.L<30),'six corridors, 8-30 m long');
const near=(p,r)=>Math.abs(hyp(p.x-r.cx,p.z-r.cz)-r.Rc)<4;
ok(g.corridors.filter(cr=>byId[cr.a]).every(cr=>near(cr.p0,byId[cr.a]))&&g.corridors.filter(cr=>byId[cr.b]).every(cr=>near(cr.p1,byId[cr.b])),'each corridor ends on the rim of the rooms it joins');
const reach=new Set(['gate']),ed=g.corridors.map(cr=>[cr.a,cr.b]);ed.push(['dg_ossuary','junction']);for(let k=0;k<8;k++)for(const [a,b] of ed){if(reach.has(a))reach.add(b);if(reach.has(b))reach.add(a)}
ok(['dg_guard','dg_ossuary','dg_vault','dg_gaol','dg_court','dg_treasury'].every(id=>reach.has(id)),'every room is reachable from the gate');
// walls never intrude into an arena (combat circle = R-.3)
const arenaOf=s=>s.R-.3;let worst=1e9;for(const w of g.walls){for(const s of g.sites){if(s.safe)continue;const d=hyp(w.x-s.x,w.z-s.z);worst=Math.min(worst,d-w.len/2*0-arenaOf(s))}}
ok(g.solids.every(s=>g.sites.every(q=>q.safe||hyp(s.x-q.x,s.z-q.z)-s.r>=arenaOf(q)-1e-6)),'no wall solid inside any fight arena');
ok(g.walls.length>150&&g.walls.length<320,'wall count in budget ('+g.walls.length+')');
ok(g.solids.length<900,'solid circles in budget ('+g.solids.length+')');
ok(g.torches.length>20&&g.torches.length<90,'torch count in budget ('+g.torches.length+')');
ok(g.walls.every(w=>['wall_b','wall_c'].includes(w.p)&&w.len>0&&Number.isFinite(w.x+w.z+w.ang)),'walls are well-formed');
ok(g.props.every(p=>['column','barrel','bookcase','arch'].includes(p.p)&&Number.isFinite(p.x+p.z)),'props are well-formed');
// doors / chests / lever
ok(new Set(g.doors.map(d=>d.id)).size===g.doors.length&&g.doors.length===5,'5 doors, unique ids');
ok(g.doors.every(d=>byId[d.need]&&!byId[d.need].safe&&d.solids.length>=3),'every door needs a real room and has solids');
ok(g.chests.length===2&&g.chests.every(ch=>byId[ch.need]),'2 chests, each gated by a room');
ok(g.chests.every(ch=>{const wx=D.ox,wz=D.oz;return rooms.some(r=>hyp(ch.x-r.cx,ch.z-r.cz)<r.Rc-1)}),'chests stand inside a room');
ok(g.levers.length===1&&g.levers[0].act==='exit'&&byId[g.levers[0].need],'one exit lever, gated by a room');
// foes exist and the boss room is the only cycle boss
const Foes=vm.runInContext('(()=>{const s=require?0:0})',c)||null;
const src=fs.readFileSync('src/combat/Foes.js','utf8');
ok(g.sites.every(s=>(s.foes||[]).every(f=>new RegExp("(clone\\([^)]*'"+f.t+"'|\\b"+f.t+"\\s*:)").test(src)||src.indexOf("'"+f.t+"'")>=0)),'every foe type used by the dungeon is defined in Foes.js');
// terrain: pads flatten corridor + rooms to the terrace height
let flat=0;for(const r of rooms)for(let a=0;a<360;a+=30)for(let d=0;d<r.Rc;d+=3){flat=Math.max(flat,Math.abs(H(WRD.x+r.cx+Math.sin(a*Math.PI/180)*d,WRD.z+r.cz+Math.cos(a*Math.PI/180)*d)-D.y))}
ok(flat<.05,'room floors are flat at '+D.y+' m (max dev '+flat.toFixed(3)+')');
let cflat=0;for(const cr of g.corridors)for(let t=0;t<=cr.L;t+=2)cflat=Math.max(cflat,Math.abs(H(WRD.x+cr.p0.x+cr.ux*t,WRD.z+cr.p0.z+cr.uz*t)-D.y));
ok(cflat<.05,'corridor floors are flat (max dev '+cflat.toFixed(3)+')');
// ---- WardenDungeon state ----
function mk(store){const ls={getItem:k=>store[k]===undefined?null:store[k],setItem:(k,v)=>{store[k]=String(v)}};const cx=vm.createContext({localStorage:ls,DUNGEON:vm.runInContext('DUNGEON',c)});vm.runInContext(fs.readFileSync('src/combat/WardenDungeon.js','utf8')+';this.X=WardenDungeon',cx);return cx.X}
const st={};let X=mk(st);
ok(X.progress().of===5&&X.progress().n===0,'fresh save: 0/5 rooms');
ok(!X.doorOpen(g.doors[0])&&!X.chestReady(g.chests[1]),'doors shut and chests locked at the start');
ok(X.clear('dg_guard')&&!X.clear('dg_guard'),'clearing a room counts once');
ok(!X.clear('nonsense')&&!X.clear('dg_treasury'),'unknown rooms and the safe room cannot be "cleared"');
ok(X.doorOpen(g.doors[0])&&!X.doorOpen(g.doors[1]),'a door opens only once its room is cleared');
for(const id of['dg_ossuary','dg_vault','dg_gaol','dg_court'])X.clear(id);
ok(X.progress().n===5&&X.chestReady(g.chests[1])&&X.chestReady(g.chests[0]),'all rooms cleared -> both chests ready');
ok(X.take(g.chests[1])&&!X.take(g.chests[1])&&X.chestTaken(g.chests[1]),'a chest opens once');
const X2=mk(st);ok(X2.progress().n===5&&X2.chestTaken(g.chests[1])&&!X2.chestTaken(g.chests[0]),'progress survives a reload');
const bad1=mk({wdg:'{"cleared":{"dg_guard":1,"evil":1,"__proto__":1},"chests":{"x":1},"runs":-5,"cycle":9999}'});
ok(bad1.progress().n===1&&bad1.S.runs===0&&bad1.S.cycle===99&&!bad1.S.chests.x,'a tampered / junk save is sanitised');
ok(mk({wdg:'not json'}).progress().n===0,'a corrupt save falls back to empty');
const r0=()=>.5;ok(X.loot('main',1,r0).embers===500&&X.loot('main',3,r0).embers===800&&X.loot('main',1,r0).rar===3,'main chest: 500 embers +150 per cycle, always relic');
ok(X.loot('vault',1,()=>0).rar===3&&X.loot('vault',1,()=>.99).rar===2&&X.loot('vault',2,r0).embers===280,'vault chest: rare or better, embers scale');
X.reset(2);ok(X.progress().n===0&&X.S.runs===1&&X.S.cycle===2&&!X.chestTaken(g.chests[1]),'a finished catacombs counts as a run and re-arms with the cycle');
X.reset(3);ok(X.S.runs===1,'an unfinished catacombs does not count as a run');
console.log(bad?bad+' FAILED':'all ok');process.exit(bad?1:0);
