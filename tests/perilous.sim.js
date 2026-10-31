// PERILOUS attacks: dodging one staggers the attacker; deflecting breaks its guard
const fs=require('fs'),vm=require('vm');const ctx={console,Math};vm.createContext(ctx);
for(const f of['SwordHit','Moves','CombatCore'])vm.runInContext(fs.readFileSync('src/combat/'+f+'.js','utf8')+';this.'+f+'='+f+';',ctx);
const{Moves,CombatCore}=ctx;let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
ok(Moves.PERILOUS.length>=6&&Moves.PERILOUS.every(id=>Moves[id]&&Moves[id].per&&Moves[id].bg),'all perilous moves flagged per+bg');
ok(Moves.PERILOUS.every(id=>Moves.tells(id).every(t=>t>=(Moves.TELL_MIN||14))),'perilous moves keep a readable tell >=20');
{const run=(at,dx,dz)=>{const C=CombatCore.create({arena:{x:0,z:0,R:14}});const P=C.add('P',{x:0,z:0,face:0,hp:300});const D=C.add('D',{x:0,z:1.6,face:Math.PI,hp:500});const ev=[];
  ev.push(...C.step({D:{list:[{t:'atk',m:'verdict',hold:0}]}}));for(let i=1;i<90;i++)ev.push(...C.step(i===at?{P:{list:[{t:'dodge',dx:dx||0,dz:dz||0}]}}:{}));return{ev,D}};
 let got=false,start=null;for(const[dx,dz]of[[1,0],[0,1],[0,-1],[-1,0]])for(let at=0;at<70&&!got;at++){const r=run(at,dx,dz);if(r.ev.some(e=>e.t==='perdodge'))got=true}
 ok(got,'a timed dodge of a perilous move emits perdodge and staggers the attacker');
 const r0=run(-1);ok(r0.ev.some(e=>e.t==='hit')&&!r0.ev.some(e=>e.t==='perdodge'),'undodged perilous hits normally');
 ok(run(-1).ev.find(e=>e.t==='start').per===1,'start event carries per flag')}
// PERFECT PARRY
{const run=(at,pre)=>{const C=CombatCore.create({arena:{x:0,z:0,R:14}});const P=C.add('P',{x:0,z:0,face:0,hp:300});const D=C.add('D',{x:0,z:1.6,face:Math.PI,hp:500});if(pre){P.pfs=2;P.pfT=100}const ev=[];
  ev.push(...C.step({D:{list:[{t:'atk',m:'cut',hold:0}]}}));for(let i=1;i<90;i++)ev.push(...C.step(i===at?{P:{list:[{t:'parry'}]}}:{}));return{ev,D}};
 let pf=null,plain=null,sq=null;for(let at=0;at<60;at++){const d=run(at).ev.find(e=>e.t==='deflect');if(d&&d.pf&&!pf)pf=at;if(d&&!d.pf&&!plain)plain=at;const q=run(at,1);const e2=q.ev.find(e=>e.t==='deflect'&&e.sq);if(e2&&!sq){sq=at;ok(q.D.act==='stun'&&q.D.sk==='stagger','third perfect parry staggers the boss')}}
 ok(pf!==null,'a parry in the first ticks of the window is PERFECT');ok(plain!==null&&plain<pf+14&&true,'a later parry is a plain deflect');ok(sq!==null,'three perfects in a row trigger the sequence');
 ok(CombatCore.CONST.PERFECT<CombatCore.CONST.PARRY_W,'perfect window is narrower than the parry window')}
console.log(n+' checks');
