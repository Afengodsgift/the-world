// Rally garage: upgrade tuning is bounded, applies to a car, makes it measurably faster, and the payout is sane. Run: node tests/rally_garage.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const ctx={Math,Object,Number,JSON,Array,isFinite};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(R+'src/data/rally.js','utf8')+fs.readFileSync(R+'src/race/CarPhysics.js','utf8')+';this.RALLY=RALLY;this.CP=CarPhysics;',ctx);
const {RALLY:RL,CP}=ctx,G=RL.garage;
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const flat={ground:()=>0},DT=1/60;
const maxed={eng:5,acc:5,grp:5,bst:5,arm:5};
for(const k of Object.keys(RL.cls)){const b=RL.cls[k],t=G.tune(b,maxed);
  ok(t.vmax>b.vmax&&t.vmax<=b.vmax*1.11,k+': max engine is faster but within +11%');
  ok(t.charges===b.charges+1&&t.boostT>b.boostT,k+': max nitro adds a charge and boost time');
  ok(G.tune(b,{})!==b&&G.tune(b,{}).vmax===b.vmax,k+': no upgrades = identical stats (copy)');
  ok(G.tune(b,{eng:99}).vmax===b.vmax*1.1,k+': levels clamp to max');}
// a maxed Ace beats a stock Ace over 12 s from a standing start
const run=(up)=>{const c=CP.newCar(0,0,0,'ace',flat,up);for(let i=0;i<720;i++)CP.step(c,{thr:1,steer:0,brake:false,boost:false,hand:false,pitch:0},DT,flat,{});return c.z};
const a=run(null),b=run(maxed);ok(b>a*1.04&&b<a*1.3,'maxed car covers 4-30% more distance in 12 s ('+a.toFixed(0)+' vs '+b.toFixed(0)+' m)');
// armor shrinks hit slowdown
{const c=CP.newCar(0,0,0,'ace',flat,maxed),d=CP.newCar(0,0,0,'ace',flat);CP.disrupt(c,1,.6,0,0,1);CP.disrupt(d,1,.6,0,0,1);ok(c.hitSlow>d.hitSlow&&d.hitSlow===.6,'armor eases the hit slowdown')}
// cost + payout
ok(G.cost(160,0)===160&&G.cost(160,4)===800,'cost scales per level');
ok(G.payout(1,4,true)>G.payout(4,4,true)&&G.payout(1,4,false)===0&&G.payout(1,1,true)>0,'payout: win > last, DNF = 0, time trial pays');
const total=G.list.reduce((s,u)=>s+[0,1,2,3,4].reduce((a,L)=>a+G.cost(u.base,L),0),0);ok(total/G.payout(1,4,true)<80,'full garage ~'+Math.round(total/G.payout(1,4,true))+' winning races');
process.exit(fails?1:0);
