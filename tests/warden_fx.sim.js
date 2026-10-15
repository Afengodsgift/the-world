// CombatCore teams + effects: same-team fighters never hurt each other; projectiles fly, hit, are dodged / blocked / deflected / stopped by walls / expire; area zones telegraph then burst; hit-stop freezes them; all deterministic.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math};vm.createContext(c);
vm.runInContext(['Moves','SwordHit','Combos','CombatCore'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore',c);
const {M,CC}=c;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
// A = caster at origin facing +z, P = player 6 m ahead (z=6) facing the caster
function mk(o){o=o||{};const C=CC.create({arena:{x:0,z:0,R:60},solids:o.solids||[]});const A=C.add('A',{x:0,z:0,face:0,hp:1e4}),P=C.add('P',{x:o.px||0,z:o.pz===undefined?6:o.pz,face:Math.PI,hp:1e4});A.team='foe';P.team=o.pteam||'hero';return{C,A,P}}
const run=(C,n,fn)=>{const ev=[];for(let i=0;i<n;i++)for(const e of C.step(fn?fn(C.tick+1):{}))ev.push(e);return ev};
const cast=id=>({A:{list:[{t:'atk',m:id}]}});
// ---- teams ----
{const{C,A,P}=mk({pteam:'foe'});const ev=run(C,200,t=>t===1?{A:{list:[{t:'atk',m:'cut'}]},P:{face:Math.PI}}:{});A.x=0;P.z=1.5;const e2=run(C,200,t=>t===1?{A:{list:[{t:'atk',m:'cut'}]}}:{});ok(!e2.some(e=>e.t==='hit'),'same-team fighters never hit each other (melee)')}
{const{C,A,P}=mk({pteam:'foe'});const ev=run(C,200,t=>t===1?cast('orb'):{});ok(!ev.some(e=>e.t==='hit')&&!ev.some(e=>e.t==='fxend'&&e.why==='hit'),'same-team fighters never hit each other (projectile)')}
{const{C,A,P}=mk({pz:1.5});P.team='hero';const ev=run(C,200,t=>t===1?{A:{list:[{t:'atk',m:'cut'}]}}:{});ok(ev.some(e=>e.t==='hit'&&e.d==='P'),'different teams still hit')}
// ---- projectile ----
{const{C,A,P}=mk();const ev=run(C,120,t=>t===1?cast('orb'):{});const sp=ev.find(e=>e.t==='fx'),h=ev.find(e=>e.t==='hit');
 ok(sp&&sp.k==='proj'&&Math.abs(sp.dz-1)<1e-9&&sp.dx===0,'orb spawns aimed at the target');ok(sp&&sp.tk===C.tick-C.tick+ev.find(e=>e.t==='fx').tk&&ev.find(e=>e.t==='fx').tk>=30,'the orb appears only after the cast (tick '+(sp&&sp.tk)+' >= 30)');
 ok(h&&h.fx&&h.d==='P'&&Math.abs(h.dmg-16)<1e-9,'orb hits for its move damage (16)');ok(ev.filter(e=>e.t==='fxend').length===1&&C.fx.length===0,'the orb is gone after it hits')}
{const{C,A,P}=mk({pz:30});const ev=run(C,200,t=>t===1?cast('orb'):{});const e=ev.find(x=>x.t==='fxend');ok(e&&e.why==='expire'&&!ev.some(x=>x.t==='hit'),'a missed orb expires after its lifetime')}
{const{C,A,P}=mk({pz:30,solids:[{x:0,z:5,r:1,wall:true}]});const ev=run(C,200,t=>t===1?cast('orb'):{});const e=ev.find(x=>x.t==='fxend');ok(e&&e.why==='wall','a wall stops the orb')}
{const{C,A,P}=mk();let g=false;const ev=run(C,120,t=>{if(t===1)return cast('orb');if(t===5&&!g){g=true;return{P:{list:[{t:'guardDown'}]}}}return{}});ok(ev.some(e=>e.t==='block'||e.t==='deflect')&&!ev.some(e=>e.t==='hit'),'a raised guard stops the orb (block/deflect)')}
{const{C,A,P}=mk();const ev=run(C,120,t=>{if(t===1)return cast('orb');if(t===38)return{P:{list:[{t:'dodge',dx:1,dz:0}]}}; return{}});ok(!ev.some(e=>e.t==='hit'),'the orb is dodged by a roll with i-frames at the right moment')}
{const{C,A,P}=mk();const ev=run(C,120,t=>t===1?cast('bolt'):{});const h=ev.find(e=>e.t==='hit'),sp=ev.find(e=>e.t==='fx');ok(h&&Math.abs(h.dmg-14)<1e-9&&sp&&sp.tk>=24,'bolt: long draw (>=24), then 14 damage');
 const t1=ev.find(e=>e.t==='fx').tk,t2=h.tk;ok(t2-t1<24,'bolt crosses 6 m in under 24 ticks (fast) - it is a real threat at range ('+(t2-t1)+')')}
// ---- area ----
{const{C,A,P}=mk({pz:2});const ev=run(C,120,t=>t===1?cast('quake'):{});const sp=ev.find(e=>e.t==='fx'),b=ev.find(e=>e.t==='fxburst'),h=ev.find(e=>e.t==='hit');
 ok(sp&&sp.k==='aoe'&&sp.tk===1&&sp.delay===40&&sp.r===4.2,'quake: the ring is shown the moment the stomp starts, 40 ticks before it bursts');ok(b&&b.tk-sp.tk>=40&&h&&h.tk===b.tk,'the burst lands exactly after the telegraph ('+(b&&b.tk)+')');ok(h&&h.fx&&Math.abs(h.dmg-30)<1e-9,'quake damage 30')}
{const{C,A,P}=mk({pz:8});const ev=run(C,120,t=>t===1?cast('quake'):{});ok(!ev.some(e=>e.t==='hit')&&ev.some(e=>e.t==='fxburst'),'standing outside the ring is safe (8 m > 4.2 m)')}
{const{C,A,P}=mk({pz:5});let g=false;const ev=run(C,120,t=>{if(t===1)return cast('rain');if(t===2)return{};return{}});const sp=ev.find(e=>e.t==='fx');ok(sp&&sp.k==='aoe'&&Math.abs(sp.z-5)<1e-9,'rain is aimed at where the target stood when the cast began');
 const{C:C2}=mk({pz:5});const ev2=run(C2,150,t=>t===1?cast('rain'):t===52-6?{P:{list:[{t:'dodge',dx:1,dz:0}]}}:{});ok(!ev2.some(e=>e.t==='hit'),'rolling out at the right moment avoids the rain')}
{const{C,A,P}=mk({pz:2});let g=false;const ev=run(C,120,t=>{if(t===1)return cast('quake');if(t===5&&!g){g=true;return{P:{list:[{t:'guardDown'}]}}}return{}});ok(ev.some(e=>e.t==='hit'&&e.d==='P'),'area bursts are not blocked by a guard (dodge or leave)')}
// ---- hit-stop + determinism ----
{const{C,A,P}=mk();run(C,40,t=>t===1?cast('orb'):{});const f=C.fx[0]&&C.fx[0].z;C.hs=5;run(C,5);ok(C.fx[0]&&Math.abs(C.fx[0].z-f)<1e-9,'a hit-stop freezes projectiles in flight')}
{const sig=()=>{const{C}=mk({pz:3});const ev=run(C,300,t=>t===1?cast('orb'):t===90?cast('rain'):{});return ev.map(e=>e.tk+e.t+(e.fid||'')).join('|')};ok(sig()===sig(),'effects are deterministic')}
// ---- data ----
for(const id of['orb','bolt','quake','rain']){const m=M[id];ok(m.who==='D'&&M.tells(id,0).every(t=>t>=M.TELL_MIN)&&M.endRecovery(id)>=M.REC_MIN,id+': fairness rules (tell >= '+M.TELL_MIN+', recovery >= '+M.REC_MIN+')')}
process.exit(bad?1:0);
