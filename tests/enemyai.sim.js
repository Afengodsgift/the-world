// EnemyAI: wave sizing for two players, roles, melee reach (no hitting a flying player), height-aware vision (symmetric with the player's shots over cover).
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';const c={Math};vm.createContext(c);
vm.runInContext(fs.readFileSync(R+'src/combat/HitZones.js','utf8')+fs.readFileSync(R+'src/combat/EnemyAI.js','utf8')+';this.AI=EnemyAI',c);const AI=c.AI;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
// ---- waves
ok(AI.waveSize(1,1,1)===6&&AI.waveSize(2,1,1)===8,'solo: wave 1 has 6 raiders, wave 2 has 8 (was 4 and 6)');
ok(AI.waveSize(1,2,1)>=10&&AI.waveSize(2,2,1)>=14,'two players: wave 1 = '+AI.waveSize(1,2,1)+', wave 2 = '+AI.waveSize(2,2,1));
let mono=true,prev=0;for(let w=1;w<=12;w++){const n=AI.waveSize(w,2,1);if(n<prev)mono=false;prev=n}ok(mono,'waves never shrink as you progress');
ok(AI.waveSize(30,2,1.7)<=Math.round(22*1.7*1.75),'late waves are capped');
ok(AI.liveCap(1,2)>AI.liveCap(1,1),'two players allow more raiders on the field at once');
ok(AI.frontsFor(1,2)>AI.frontsFor(1,1)&&AI.frontsFor(1,2)>=3,'two players: wave 1 already comes from 2 fronts (frontsFor -> pickFronts k=2)');
ok(AI.wavePool(1,2).includes(5)&&!AI.wavePool(1,1).includes(5),'two players get a shotgunner in the opening wave');
ok(AI.wavePool(5,1).includes(6)&&AI.wavePool(4,1).includes(2),'later pools still unlock medics/snipers');
// ---- roles
let cnt={flanker:0,rifle:0,grunt:0};for(let i=0;i<1000;i++)cnt[AI.role(0,i/1000)]++;ok(cnt.flanker===350&&cnt.rifle===300&&cnt.grunt===350,'bandits: 35% flankers, 30% riflemen, 35% grunts');
ok(AI.role(5,.5)==='rusher'&&AI.role(2,.5)==='sniper'&&AI.role(1,.5)==='grunt','shotgunners rush, snipers snipe');
// ---- melee reach
ok(AI.meleeReach(1.5,0,2.2),'a brute hits a player on the ground in front of it');
ok(!AI.meleeReach(1.5,3.2,2.2)&&!AI.meleeReach(1.5,-3.2,2.2),'it cannot hit a player flying 3 m above (or far below)');
ok(!AI.meleeReach(3,0,2.2),'or one that is out of reach horizontally');
ok(AI.meleeReach(1.5,2.0,2.2),'a low jump (2 m) is still within reach');
// ---- vision (cover has height)
const crate=[{x:0,z:6,r:.95,y:0,h:1.3}],wall=[{x:0,z:6,r:1.3}];
ok(AI.sees(crate,0,0,0,'stand',0,0,12)===1.55,'a standing raider sees the head of a player standing behind a 1.3 m crate');
ok(AI.sees(crate,0,0,0,'crouch',0,0,12)===0,'a CROUCHED raider cannot see over the same crate (cover works for them too)');
ok(AI.sees(wall,0,0,0,'stand',0,0,12)===0,'a tall wall blocks everything');
ok(AI.sees(crate,0,0,0,'crouch',0,6,12)>0,'but it sees a player flying 6 m above the crate');
ok(AI.sees(crate,0,8,0,'crouch',0,0,12)>0,'a raider on high ground (8 m up) sees over the crate');
ok(AI.sees([],0,0,0,'stand',0,0,30)===1.55,'open ground: sees the head');
console.log(bad?bad+' problem(s)':'enemy ai OK');process.exit(bad?1:0);
