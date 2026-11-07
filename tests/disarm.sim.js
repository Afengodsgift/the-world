// DISARM + BRAWL: a perilous strike knocks the weapon out of the hand; the wrench takes the boss's; kicks punt weapons; the floor game is fair and deterministic; the bare-handed boss obeys the fairness rules
const fs=require('fs'),vm=require('vm');const ctx={console,Math,performance:{now:()=>0}};vm.createContext(ctx);
for(const f of['Moves','Combos','SwordHit','CombatCore','Brawl','DuelistAI'])vm.runInContext(fs.readFileSync('src/combat/'+f+'.js','utf8')+';this.'+f+'='+f,ctx);
const{Moves,CombatCore,Brawl,DuelistAI}=ctx;let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
const mk=()=>{const C=CombatCore.create({arena:{x:0,z:0,R:20}});const P=C.add('P',{x:0,z:0,face:0,wd:1,hp:200});const D=C.add('D',{x:0,z:1.7,face:Math.PI,hp:900,wd:1,dcd:0});return{C,P,D}};
const run=(C,cmds,n)=>{const ev=[];for(let i=0;i<n;i++)for(const e of C.step(cmds(i+1)||{}))ev.push(e);return ev};
// ---- moves exist, installed, fair ----
ok(Brawl.IDS.every(k=>Moves[k]&&Moves[k].bw)&&Brawl.FIDS.every(k=>Moves[k]&&Moves[k].who==='D'),'brawl moves are installed in Moves');
for(const k of Brawl.FIDS){const m=Moves[k];const tl=Moves.tells(k,0);ok(tl.every(t=>t>=Moves.TELL_MIN),k+' keeps its tell ('+tl+')');const last=m.phases[m.phases.length-1];ok(last.k==='recovery'&&last.n>=Moves.REC_MIN&&!m.cancel,k+' ends in >=20 recovery, no cancel')}
for(const k of['bwjab','bwcross','bwhook','bwknee'])ok(Moves[k].phases[0].n<=5,k+' starts up in <=5 ticks (snappy)');
ok(Moves.PERILOUS.some(id=>Moves[id].dis)&&Moves.kzsweep.dis&&!Moves.kzstomp.dis,'perilous strikes disarm; the floor bursts do not');
// ---- a perilous hit disarms the player, bare-handed combos replace the sword ones ----
{const{C,P,D}=mk();D.dcd=0;P.dcd=0;const ev=run(C,i=>i===1?{D:{list:[{t:'atk',m:'kzsweep'}]}}:{},60);
 ok(ev.some(e=>e.t==='disarm'&&e.d==='P'),'kzsweep knocked the weapon away');ok(P.arm===0&&C.wp.P&&P.wx===C.wp.P.x,'the player is disarmed, the weapon lies on the floor and is mirrored for the AI');
 const w=C.wp.P;ok(Math.hypot(w.x-P.x,w.z-P.z)>1.5&&Math.hypot(w.x,w.z)<19,'it landed a few metres away, inside the ring ('+w.x.toFixed(1)+','+w.z.toFixed(1)+')');
 // grace: no second disarm until DIS_CD after the weapon is back
 ok(P.dcd>=Brawl.DIS_CD-70,'the disarm window is set');
 // swordless light starts the jab, a sword-only atk is ignored
 for(let i=0;i<80;i++)C.step({});P.face=0;P.x=0;P.z=0;C.step({P:{list:[{t:'atk',m:'severF'}]}});ok(!(P.mv&&P.mv.id==='severF'),'sword supers are ignored while disarmed');
 const e2=run(C,i=>i===1?{P:{list:[{t:'light'}]}}:{},4);ok(P.mv&&P.mv.id==='bwjab','Light is a jab when unarmed');
 run(C,()=>({}),40);
 // the string chains
 const seen=[];for(let k=0;k<5;k++){run(C,i=>i===1?{P:{list:[{t:'light'}]}}:{},1);seen.push(P.mv&&P.mv.id);run(C,()=>({}),Moves[P.mv.id].phases.reduce((a,p)=>a+p.n,0)-(Moves[P.mv.id].cancel&&Moves[P.mv.id].cancel.light||0)-1)}
 ok(seen.slice(0,3).join()==='bwjab,bwcross,bwhook','the unarmed string chains jab > cross > hook ('+seen+')')}
// ---- walking over your weapon takes it back; the weapon returns by itself after RETURN_T ----
{const{C,P,D}=mk();P.dcd=0;run(C,i=>i===1?{D:{list:[{t:'atk',m:'kzsweep'}]}}:{},60);ok(P.arm===0,'setup: disarmed');D.x=0;D.z=15;
 const w=C.wp.P;let ev=[];for(let i=0;i<200&&P.arm===0;i++){const dx=w.x-P.x,dz=w.z-P.z,L=Math.hypot(dx,dz)||1;for(const e of C.step({P:{mx:dx/L,mz:dz/L,face:Math.atan2(dx,dz)}}))ev.push(e)}
 ok(P.arm===1&&ev.some(e=>e.t==='regrab'&&e.a==='P'&&!e.ret)&&!C.wp.P,'walking over it takes it back');ok(P.dcd>=Brawl.DIS_CD-2,'and starts the no-disarm window');
 const x=mk();x.P.dcd=0;run(x.C,i=>i===1?{D:{list:[{t:'atk',m:'kzsweep'}]}}:{},60);x.D.x=0;x.D.z=15;let rg=null;for(let i=0;i<Brawl.RETURN_T+20&&!rg;i++)for(const e of x.C.step({}))if(e.t==='regrab')rg=e;
 ok(rg&&rg.ret===1&&x.P.arm===1,'an unclaimed weapon slides back after '+Brawl.RETURN_T+' ticks (no soft-lock)')}
// ---- the wrench disarms the boss, the foe weapon lands, hits do not ----
{const{C,P,D}=mk();D.dcd=0;const ev=run(C,i=>i===1?{P:{face:0,list:[{t:'wrench'}]}}:{},40);
 ok(ev.some(e=>e.t==='disarm'&&e.d==='D'&&e.move==='bwwrench')&&D.arm===0&&C.wp.D,'the wrench disarms the boss');
 const{C:C2,P:P2,D:D2}=mk();D2.wd=0;const h0=D2.hp;run(C2,i=>i===1?{P:{face:0,list:[{t:'wrench'}]}}:{},40);ok(D2.arm===1&&h0-D2.hp>10,'on a foe with no weapon it is a throw: it hurts ('+(h0-D2.hp).toFixed(1)+')');
 // a dodge beats it, guard does not
 const{C:C3,P:P3,D:D3}=mk();D3.dcd=0;D3.guard=true;D3.face=Math.PI;run(C3,i=>i===1?{P:{face:0,list:[{t:'wrench'}]}}:{},40);ok(D3.arm===0,'guard does not stop a wrench')}
// ---- both disarmed: kicks punt weapons, both can be kept away ----
{const{C,P,D}=mk();P.dcd=0;D.dcd=0;D.z=4;C.F.P.arm=0;C.wp.P={x:0,z:2.3,t:C.tick,by:'D'};P.wx=0;P.wz=2.3;
 const ev=run(C,i=>i===1?{P:{face:0,list:[{t:'light',guard:true}]}}:{},1);P.guard=true;P.act='free';P.guard=false;
 const e=run(C,i=>i===1?{P:{face:0,list:[{t:'light'}]}}:{},1);
 // use a direct kick move for determinism
 const{C:C4,P:P4}=mk();P4.arm=0;C4.wp.P={x:0,z:1.6,t:0,by:'D'};P4.wx=0;P4.wz=1.6;C4.F.D.z=12;C4.start('P','bwpush');const ev4=run(C4,()=>({}),20);
 const k=ev4.find(e=>e.t==='wkick');ok(k&&Math.hypot(k.x-k.x0,k.z-k.z0)>4.5&&Math.hypot(C4.wp.P.x,C4.wp.P.z)<19,'a kick punts the weapon several metres away ('+(k?Math.hypot(k.x-k.x0,k.z-k.z0).toFixed(1):'none')+' m)');
 ok(C4.F.P.wx===C4.wp.P.x,'the owner sees the new position')}
// ---- the bare-handed boss: goes for his blade, guards yours and punts it ----
{const{C,P,D}=mk();D.z=6;D.arm=0;C.wp.D={x:-5,z:8,t:0,by:'P'};D.wx=-5;D.wz=8;const A=DuelistAI.create(7,{foe:'samurai',kid:'samurai',intro:0});
 let moved=0;for(let i=1;i<=120;i++){const o=DuelistAI.think(A,P,D,[],i);C.step({D:o});}
 ok(Math.hypot(D.x+5,D.z-8)<2,'a disarmed boss runs for his weapon ('+D.x.toFixed(1)+','+D.z.toFixed(1)+')');
 const g=mk();g.P.arm=0;g.C.wp.P={x:6,z:2,t:0,by:'D'};g.P.wx=6;g.P.wz=2;g.D.x=0;g.D.z=6;g.P.x=1;g.P.z=1;const A2=DuelistAI.create(9,{foe:'samurai',kid:'samurai',intro:0});let punts=0,ev=[];
 for(let i=1;i<=900;i++){const o=DuelistAI.think(A2,g.P,g.D,ev,i);const c={D:o};ev=g.C.step(c);for(const e of ev)if(e.t==='wkick')punts++;
   // the player keeps running at the weapon
   const w=g.C.wp.P;if(w&&i>200){const dx=w.x-g.P.x,dz=w.z-g.P.z,L=Math.hypot(dx,dz)||1;g.C.F.P.ex=dx/L;g.C.F.P.ez=dz/L}}
 ok(punts>=1,'the boss guards the weapon and punts it away when the player closes in ('+punts+' punts)')}
console.log('ok '+n+' checks');
