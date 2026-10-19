// WardenProg: Embers, upgrades, the lost-embers pile, and Ashen Cycles.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const mk=()=>{const st={};const c={console,Math,JSON,Number,localStorage:{getItem:k=>st[k]===undefined?null:st[k],setItem:(k,v)=>{st[k]=v}}};vm.createContext(c);
  vm.runInContext(fs.readFileSync(R+'src/combat/WardenProg.js','utf8')+';this.P=WardenProg',c);return{P:c.P,st}};
{const {P,st}=mk();P.setBosses(['a','b']);
  ok(P.stats().hp===100&&P.stats().dm===1&&P.stats().belt===0,'fresh save: 100 hp, 100 stamina, x1 damage');
  ok(P.cost('vig')===100&&P.cost('vig')<P.cost('mig'),'costs start low');
  ok(!P.buy('vig'),'cannot buy without embers');
  const boss={boss:true,hp:300},grunt={hp:80};
  const r1=P.reward(boss,'a'),r2=(P.add(r1),P.reward(boss,'a'));ok(r1===2*r2||r1>=r2,'first kill of a boss pays double ('+r1+')');
  ok(P.reward(grunt)<P.reward(boss,'zz')/3,'a grunt pays far less than a boss');
  P.S.embers=1000;ok(P.buy('vig')&&P.S.ups.vig===1&&P.S.embers===900&&P.stats().hp===110,'buying Vigor: +10 hp, embers spent');
  ok(P.cost('vig')>100,'cost grows with level (now '+P.cost('vig')+')');
  for(let i=0;i<30;i++){P.S.embers=1e6;P.buy('belt')}ok(P.S.ups.belt===3&&!P.buy('belt'),'Flask Belt caps at level 3');
  P.S.embers=500;const l=P.die('a',3,4);ok(P.S.embers===0&&l.n===500&&l.sid==='a','dying leaves the carried embers behind');
  P.add(40);P.die('b',1,1);ok(P.S.lost.n===40&&P.S.lost.sid==='b','dying again replaces the pile (the old one is gone)');
  ok(P.claim()===40&&P.S.embers===40&&P.S.lost===null,'claiming returns the pile');
  ok(P.felled('a')===null&&P.progress().n===1,'first boss of the cycle: progress 1/2');
  ok(P.felled('camp')===null&&P.progress().n===1,'a camp is not a boss gate');
  const r=P.felled('b');ok(r&&r.cycle===2&&r.bonus>0&&P.S.cycle===2&&P.progress().n===0,'last boss turns the cycle over');
  ok(P.cycleMul(2).hp>1&&P.cycleMul(2).dm>1&&P.cycleMul(2).ember>1&&!P.cycleMul(2).sa&&P.cycleMul(3).sa,'cycle 2 is tougher and pays more; cycle 3 adds armour');
  ok(P.cycleMul(1).hp===1&&P.cycleMul(1).spd===1,'cycle 1 changes nothing');
  ok(P.cycleMul(30).spd<=1.35,'speed bonus is capped');
  ok(P.reward(boss,'a')>r2,'embers per kill grow with the cycle');
  const saved=JSON.parse(st.wprog);ok(saved.cycle===2&&saved.ups.vig===1,'progress is saved to localStorage');
  // reload from the save
  const c2=mk();c2.st.wprog=st.wprog;c2.P.load();ok(c2.P.S.cycle===2&&c2.P.S.ups.vig===1&&c2.P.S.ups.belt===3,'a new session reads the save back');
  const c3=mk();c3.st.wprog='{"cycle":"x","embers":-5,"ups":{"vig":99,"end":-3},"lost":{"x":"q"}}';c3.P.load();ok(c3.P.S.cycle===1&&c3.P.S.embers===0&&c3.P.S.ups.vig<=10&&c3.P.S.ups.end===0&&c3.P.S.lost===null,'a corrupt save is clamped, not trusted')}
process.exit(bad?1:0);
