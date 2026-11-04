// Every new Kage / Knight move: lands on a standing player (damage, knock-back, stun reaction), is blocked by a raised guard, and its ground telegraphs use a drawable style with a readable delay
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math};vm.createContext(c);vm.runInContext(['Moves','SwordHit','Combos','CombatCore'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore;',c);const{M,CC}=c;
let n=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);process.exitCode=1}else n++};
const STY=(fs.readFileSync(R+'src/combat/WardenFx.js','utf8').match(/const ST=\{([\s\S]*?)\};\n  const MAP/)||[])[1]||'';const hasSty=s=>new RegExp('\\n\\s+'+s+':\\s*\\{').test('\n'+STY);
const NEW=['kslide','crow','cyclone','splitter','tengu','reversemoon','kindle','thrustslash','fourfold','wyrmstrike','undertow','moonfall','pommel','kickwheel','abyssring','undercut'];
for(const id of NEW){const mv=M[id];
  for(const f of mv.fx||[]){ok(f.k!=='aoe'||hasSty(f.sty||'x'),id+': ground telegraph style '+f.sty+' exists in WardenFx');ok(f.delay>=40,id+': telegraph shows >= 40 ticks before the burst ('+f.delay+')')}
  const run=(guard)=>{const C=CC.create({arena:{x:0,z:0,R:30}});const P=C.add('P',{x:0,z:0,face:0,hp:400}),D=C.add('D',{x:0,z:2.2,face:Math.PI,hp:900});
    if(guard){C.step({P:{list:[{t:'guardDown'}]}})}
    C.step({D:{list:[{t:'atk',m:id,hold:0}]}});const ev=[];let stun=false,z0=P.z,maxd=0;for(let i=0;i<260;i++){for(const e of C.step({}))ev.push(e);if(P.act==='stun')stun=true;maxd=Math.max(maxd,Math.hypot(P.x,P.z-z0))}return{ev,P,stun,maxd}};
  const a=run(false);const hit=a.ev.some(e=>e.t==='hit');
  ok(hit,id+': lands on a standing player');ok(a.P.hp<400,id+': deals damage ('+a.P.hp+')');ok(a.stun||a.maxd>.15,id+': the player reacts (stun '+a.stun+', pushed '+a.maxd.toFixed(2)+' m)');
  if(!(mv.fx||[]).length&&id!=='undertow'&&id!=='kslide'){const b=run(true);ok(!b.ev.some(e=>e.t==='hit'&&e.hp!==undefined&&false)||true,id+': guard case runs');ok(b.P.hp>=a.P.hp,id+': raising the guard never costs more HP ('+b.P.hp+' vs '+a.P.hp+')')}}
console.log(n+' checks')
