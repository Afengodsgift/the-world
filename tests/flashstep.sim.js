// Flash Step (stick toward + Dodge) and Sidestep; the ninja run is gone
const fs=require('fs'),vm=require('vm');const ctx={console,Math,performance:{now:()=>0}};vm.createContext(ctx);
for(const f of['Moves','Combos','CombatCore'])vm.runInContext(fs.readFileSync('src/combat/'+f+'.js','utf8')+(f==='Moves'?';this.Moves=Moves':f==='CombatCore'?';this.CombatCore=CombatCore':''),ctx);
const{Moves,CombatCore}=ctx;let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
const F=Moves.flashstep;ok(F&&F.total===14&&F.dist>Moves.dodge.dist&&F.stam<Moves.dodge.stam&&F.iEnd>=8,'flash step: shorter, longer reach, cheaper, with i-frames');
ok(Math.abs(Moves.flashRoot.reduce((a,b)=>a+b,0)-F.dist)<1e-6,'flash root motion sums to its distance');
const run=(side)=>{const C=CombatCore.create({arena:{x:0,z:0,R:30}});const P=C.add('P',{x:0,z:0,face:0});C.add('D',{x:0,z:28,face:Math.PI,hp:140});const ev=[];for(let i=1;i<=24;i++){const cm=i===1?{P:{list:[{t:'dodge',dx:0,dz:1,side}]}}:{};for(const e of C.step(cm))ev.push(e)}return{z:P.z,act:P.act,st:P.st}};
{const fl=run(2),ro=run(0);ok(fl.z>4.5&&fl.z<5.6,'flash step travels about 5.2 m ('+fl.z.toFixed(2)+')');ok(ro.z>2.8&&ro.z<3.6,'the roll still travels about 3.2 m ('+ro.z.toFixed(2)+')');ok(fl.act==='free','flash step is over (free) by tick 24');}
const src=fs.readFileSync('src/combat/CombatCore.js','utf8');
ok(/side===2\?Moves\.flashstep/.test(src)&&/Moves\.flashRoot/.test(src)&&/DG\(f\)\.total/.test(src),'the core runs the flash dash (root + length)');
const pc=fs.readFileSync('src/combat/PlayerCombat.js','utf8'),mx=fs.readFileSync('src/combat/WardenMX.js','utf8');
ok(/c\.side=2/.test(pc)&&/function flashFx/.test(pc)&&/P\.side===2\)flashFx/.test(pc),'forward + Dodge sends a flash step with VFX');
ok(!/ROLES\[r\]\.loco=\{idle:'nj_idle'/.test(mx)&&/f\.side===2&&A\.nj_run/.test(mx),'ninja locomotion removed; flash step plays the sprint clip');
ok(/off:\.5/.test(pc)&&/g\.off&&kid/.test(pc),'twin hilts seated in the palm');
console.log(n+' checks')
