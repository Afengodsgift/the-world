// Boss backlog mechanics: Vael micro-blink, Gwyn wet tiles, Phantom Barrage runes, Gwyndolin illusions, Capra hounds (hooks present + the sim pieces)
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math};vm.createContext(c);vm.runInContext(['Moves','Tricks'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.T=Tricks',c);const{M,T}=c;
let n=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);process.exitCode=1}else n++};
const z=M.blinkz;ok(z&&z.who==='D'&&z.dmg===0,'blinkz exists, harmless (the cut after it carries the tell)');ok(z.phases[0].n<=6,'the micro-blink is near-instant ('+z.phases[0].n+' ticks)');ok(T.isBlink('blinkz'),'Tricks recognises blinkz');
ok(z.phases[z.phases.length-1].n>=20,'recovery >= 20');
const P=fs.readFileSync(R+'src/combat/PlayerCombat.js','utf8'),A=fs.readFileSync(R+'src/combat/DuelistAI.js','utf8');
ok(/om='blinkz'/.test(A)&&/A\.kid==='stalker'&&A\.ph2/.test(A),"Vael's AI throws micro-blinks in phase 2 only");
ok(/blinkz/.test(P),'micro-blink hides the body at once');
ok(/wetT=9/.test(P)&&/q\.wet\?1\.7:1/.test(P)&&/R=K\.r\*\(wet\?2:1\)/.test(P),'storm moves wet the tiles; wet volt patches have double radius and a larger blast');
ok(/U\.dk&&NET\.mode!=='guest'\)zoneAdd\(F\.f\.x,F\.f\.z,true,'rune'/.test(P)&&/dk:B\.T\.id==='dknight'/.test(P),'Dark Knight Phantom Barrage leaves a void rune where each phantom stood');
ok(/function illusions\(F\)/.test(P)&&/illusions\(F\)\}/.test(P)&&/\[4,-1\.15\]/.test(P),'Gwyndolin splits two illusions on Sun Volley');
ok(/function houndsAdd/.test(P)&&/houndTick\(dt\)/.test(P)&&/houndsClear\(\)/.test(P)&&/hound:\{r:1\.5/.test(P),'Capra hounds spawn, tick, leap with a marked ring and are cleaned up on leave');
// shattering pillars
ok(/function pillarsBuild/.test(P)&&/function pillarShatter/.test(P)&&/pillarSmash\(A,e\.move\)/.test(P)&&/rubble:\{r:1\.7/.test(P)&&/pillarsClear\(\)\}catch/.test(P),'boss rings get shattering pillars; PERILOUS swings shatter them; rubble crushes; cleaned up on leave');
{const CC=(()=>{const c2={console,Math};vm.createContext(c2);vm.runInContext(['Moves','SwordHit','CombatCore'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.CC=CombatCore',c2);return c2.CC})();
 const C=CC.create({arena:{x:0,z:0,R:30},solids:[{x:0,z:3,r:1.15,dp:1}]});const p=C.add('P',{x:0,z:0,face:0,hp:100});
 for(let i=0;i<90;i++)C.step({P:{mx:0,mz:1}});const stopped=p.z<3;
 C.solids.splice(0,1);for(let i=0;i<120;i++)C.step({P:{mx:0,mz:1}});ok(stopped&&p.z>4,'a standing pillar blocks the body, and once shattered (removed from the solids) you walk through ('+p.z.toFixed(1)+')')}
ok(/function threatMid\(D0\)/.test(P)&&/L\.length<2\)return\{x:D0\.x,z:D0\.z\}/.test(P)&&/KeyV:'camd'/.test(P)&&/CAMS\.dist-1\)\*5/.test(P),'camera: multi-foe weighted framing (single foe unchanged) and a distance switch');
console.log(n+' checks')
