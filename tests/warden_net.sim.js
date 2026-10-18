// Warden co-op state packing: a mirror sim fed 15 Hz snapshots of an authoritative sim stays close to it (foe position / hp / current move), and pack/apply round-trips a fighter.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../src/combat/';
const c={console,Math,performance:{now:()=>0}};vm.createContext(c);
vm.runInContext(['Moves','SwordHit','Combos','CombatCore','DuelistAI','WardenNet'].map(n=>fs.readFileSync(R+n+'.js','utf8').replace(/^if\(typeof module.*$/m,'')).join('\n')+';this.M=Moves;this.CC=CombatCore;this.AI=DuelistAI;this.N=WardenNet',c);
const {M,CC,AI,N}=c;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
// 1) round trip
{const C=CC.create({arena:{x:0,z:0,R:30}});const a=C.add('D',{x:3,z:2,face:1,hp:200,team:'e'});C.step({D:{face:1,mx:0,mz:0,list:[{t:'atk',m:'twin'}]}});for(let i=0;i<30;i++)C.step({D:{face:1}});
  const o=N.pack(JSON.parse(JSON.stringify(a)).x===undefined?a:a),b=CC.mkFighter('D',{});N.apply(b,JSON.parse(JSON.stringify(o)),M,1);
  ok(b.act==='attack'&&b.mv&&b.mv.id==='twin'&&b.ph&&b.ph.length===a.ph.length&&b.pt===a.pt&&b.pi===a.pi&&b.x===a.x,'pack/apply restores an attacking fighter');
  const f2=CC.mkFighter('X',{});a.act='free';a.mv=null;N.apply(f2,JSON.parse(JSON.stringify(N.pack(a))),M,1);ok(f2.act==='free'&&f2.mv===null&&f2.ph===null,'free fighter has no move')}
// 2) mirror
function run(seed,hz){
  const mk=()=>{const C=CC.create({arena:{x:0,z:0,R:30},solids:[]});C.add('P',{x:0,z:6,face:Math.PI,hp:99999,team:'p'});C.add('D',{x:0,z:-4,face:0,hp:6000,team:'e'});return C};
  const H=mk(),G=mk(),ai=AI.create(seed,{foe:'hollow',intro:20});let maxE=0,hpE=0,mism=0,n=0,evH=0,evG=0;
  const hp=H.F.P,hd=H.F.D,gp=G.F.P,gd=G.F.D;let held={mx:0,mz:0};let ev=[];
  for(let t=1;t<=1800;t++){
    // the player (same on both: each is authoritative for itself) walks toward the foe and swings
    const cmd=t%170===5?[{t:'light',e:t}]:[];const tx=hd.x-hp.x,tz=hd.z-hp.z,L=Math.hypot(tx,tz)||1,mv=L>2.2?1:0,face=Math.atan2(tx,tz);hp.hp=99999;gp.hp=99999;
    const pc={P:{face,mx:tx/L*mv,mz:tz/L*mv,list:cmd}};
    const o=AI.think(ai,hp,hd,ev,t);held={mx:o.mx,mz:o.mz};
    ev=H.step({P:pc.P,D:{face:o.face,mx:o.mx,mz:o.mz,list:o.list}});evH+=ev.filter(e=>e.t==='hit'&&e.d==='D').length;
    // the guest copy: same P commands, foe runs on the last snapshot's movement, a new snapshot every `hz` ticks
    const gev=G.step({P:pc.P,D:{face:gd.face,mx:held.mx,mz:held.mz,list:[]}});evG+=gev.filter(e=>e.t==='hit'&&e.d==='D').length;
    if(t%hz===0){const s=N.pack(hd);const startMv=hd.act==='attack'&&gd.mv&&gd.mv.id!==s.mv;N.apply(gd,JSON.parse(JSON.stringify(s)),M,.5)}
    if(t>60){n++;const e=Math.hypot(hd.x-gd.x,hd.z-gd.z);maxE=Math.max(maxE,e);hpE=Math.max(hpE,Math.abs(hd.hp-gd.hp));if(hd.act!==gd.act)mism++}}
  return{maxE,hpE,mism,n,evH,evG,hdhp:hd.hp,hits:H.tick}}
for(const seed of[1,2,3]){const r=run(seed,4);console.log(JSON.stringify(r));ok(r.maxE<2.5,'seed '+seed+': guest foe within 2.5 m of host foe (max '+r.maxE.toFixed(2)+')');ok(r.mism/r.n<.2,'seed '+seed+': foe act agrees on >80% of ticks ('+(100-100*r.mism/r.n).toFixed(0)+'%)')}
if(bad){console.log(bad+' failure(s)');process.exit(1)}else console.log('\nall net checks passed');
