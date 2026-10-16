// WARDEN: combat move tables (pure data + tiny helpers; no THREE/DOM). Fixed 60 Hz ticks.
// A move is a list of phases {k:'startup'|'windup'|'lunge'|'hold'|'raise'|'down'|'rechamber'|'active'|'recovery', n:ticks, move?:metres of root motion over the phase, seg?:hit segment index (active only)}
// pt (phase time) counts ticks since the command was consumed (pt=0 on that tick): startup = pt 0..S-1, active = S..S+A-1, recovery next, fighter can act at pt = total.
// FAIRNESS RULES (enforced by tests/warden_core.sim.js, no exceptions list): every Duelist hit has a visible tell >= TELL_MIN ticks (a 'hold' never counts), every Duelist move ends in >= REC_MIN ticks of uncancellable recovery, hold <= HOLD_MAX, and no Duelist move defines `cancel`.
const TICK=60,TELL_MIN=20,REC_MIN=20,HOLD_MAX=12;
const ph=(k,n,o)=>Object.assign({k,n},o||{});
const Moves={
  TICK,TELL_MIN,REC_MIN,HOLD_MAX,
  // ---- player (cancel thresholds are RECOVERY ticks; the one deliberate asymmetry: Duelist moves have none) ----
  light:{id:'light',who:'P',chain:1,stam:12,dmg:14,pdmg:12,hs:4,stun:18,kb:.5,reach:2.4,w:.12,phases:[ph('startup',10),ph('active',4,{seg:0,a0:.8,a1:-.8}),ph('recovery',16)],cancel:{light:6,dodge:8,guard:8,heavy:8}},
  light2:{id:'light2',who:'P',chain:2,stam:12,dmg:14,pdmg:12,hs:4,stun:18,kb:.5,reach:2.4,w:.12,phases:[ph('startup',10),ph('active',4,{seg:0,a0:-.8,a1:.8}),ph('recovery',16)],cancel:{light:6,dodge:8,guard:8,heavy:8}},
  light3:{id:'light3',who:'P',chain:3,stam:16,dmg:20,pdmg:18,hs:6,stun:24,kb:.9,reach:2.5,w:.13,phases:[ph('startup',12),ph('active',4,{seg:0,a0:.9,a1:-.9}),ph('recovery',24)],cancel:{dodge:12}},
  advance:{id:'advance',who:'P',chain:1,stam:14,dmg:16,pdmg:14,hs:4,stun:20,kb:.7,reach:2.5,w:.12,phases:[ph('startup',9,{move:1.3}),ph('active',4,{seg:0,a0:.6,a1:-.6}),ph('recovery',18)],cancel:{light:8,dodge:8,heavy:10}},
  evade:{id:'evade',who:'P',chain:1,stam:12,dmg:16,pdmg:14,hs:4,stun:18,kb:.5,reach:2.4,w:.12,phases:[ph('startup',6),ph('active',4,{seg:0,a0:.8,a1:-.8}),ph('recovery',18)],cancel:{light:8,dodge:8}},
  rising:{id:'rising',who:'P',chain:0,stam:22,dmg:28,pdmg:38,hs:6,stun:26,kb:1.0,reach:2.6,w:.13,phases:[ph('startup',14,{move:.6}),ph('active',5,{seg:0,a0:.5,a1:-.5}),ph('recovery',28)],cancel:{dodge:14}},
  heavy:{id:'heavy',who:'P',stam:25,dmg:34,pdmg:30,hs:7,stun:28,kb:1.2,reach:2.6,w:.12,chargeMin:18,chargeMax:45,phases:[ph('startup',14,{move:.8}),ph('active',5,{seg:0,a0:.6,a1:-.6}),ph('recovery',30)]},
  dodge:{id:'dodge',who:'*',stam:18,total:22,iStart:3,iEnd:11,dist:3.2,rootT0:1,rootT1:14},
  // ---- Duelist ----
  cut:{id:'cut',who:'D',dmg:14,pdmg:12,hs:4,stun:18,kb:.5,reach:2.3,w:.12,phases:[ph('startup',20),ph('active',4,{seg:0,a0:.7,a1:-.7}),ph('recovery',20)]},
  fall:{id:'fall',who:'D',dmg:30,pdmg:28,hs:7,stun:26,kb:1.1,reach:2.6,w:.14,hold:true,phases:[ph('raise',14),ph('hold',0),ph('down',22),ph('active',5,{seg:0,a0:.2,a1:-.2}),ph('recovery',34)]},
  thrust:{id:'thrust',who:'D',dmg:22,pdmg:20,hs:5,stun:22,kb:.9,reach:3.2,w:.1,phases:[ph('windup',14),ph('lunge',10,{move:1.4}),ph('active',6,{seg:0,a0:0,a1:0}),ph('recovery',38)]},
  twin:{id:'twin',who:'D',dmg:12,pdmg:11,hs:4,stun:16,kb:.4,reach:2.3,w:.12,phases:[ph('startup',20),ph('active',4,{seg:0,a0:.7,a1:-.7}),ph('rechamber',22),ph('active',4,{seg:1,a0:-.7,a1:.7}),ph('recovery',20)]},
  // ---- the Hollow Warden ----
  sweep:{id:'sweep',who:'D',dmg:22,pdmg:20,hs:6,stun:24,kb:1.0,reach:3.0,w:.14,phases:[ph('startup',26),ph('active',5,{seg:0,a0:1.3,a1:-1.3}),ph('recovery',40)]},
  slam:{id:'slam',who:'D',dmg:38,pdmg:34,hs:8,stun:30,kb:1.4,reach:3.0,w:.16,hold:true,phases:[ph('raise',20),ph('hold',0),ph('down',24),ph('active',6,{seg:0,a0:.2,a1:-.2}),ph('recovery',48)]},
  triple:{id:'triple',who:'D',dmg:14,pdmg:12,hs:4,stun:16,kb:.5,reach:2.8,w:.13,phases:[ph('startup',22),ph('active',4,{seg:0,a0:.8,a1:-.8}),ph('rechamber',22),ph('active',4,{seg:1,a0:-.8,a1:.8}),ph('rechamber',22),ph('active',4,{seg:2,a0:.8,a1:-.8}),ph('recovery',30)]},
  // ---- gap closers ----
  dash:{id:'dash',who:'D',dmg:20,pdmg:18,hs:5,stun:22,kb:.8,reach:2.4,w:.12,phases:[ph('windup',16),ph('lunge',12,{move:3.4}),ph('active',5,{seg:0,a0:.8,a1:-.8}),ph('recovery',32)]},
  leap:{id:'leap',who:'D',dmg:34,pdmg:30,hs:7,stun:28,kb:1.2,reach:3.0,w:.15,phases:[ph('raise',22),ph('lunge',14,{move:4.6}),ph('active',6,{seg:0,a0:.3,a1:-.3}),ph('recovery',50)]},
  // ---- ranged / magic ----
  orb:{id:'orb',who:'D',dmg:16,pdmg:14,hs:4,stun:20,kb:.6,reach:12,w:0,fx:[{on:'release',k:'proj',spd:.2,life:90,r:.5,off:.9}],phases:[ph('cast',30),ph('release',2),ph('recovery',34)]},
  bolt:{id:'bolt',who:'D',dmg:14,pdmg:12,hs:4,stun:18,kb:.5,reach:16,w:0,fx:[{on:'release',k:'proj',spd:.36,life:70,r:.4,off:.9}],phases:[ph('cast',24),ph('release',2),ph('recovery',30)]},
  quake:{id:'quake',who:'D',dmg:30,pdmg:26,hs:7,stun:26,kb:1.4,reach:4.2,w:0,fx:[{on:'start',k:'aoe',at:'self',r:4.2,delay:40,dur:3}],phases:[ph('windup',38),ph('release',2),ph('recovery',52)]},
  rain:{id:'rain',who:'D',dmg:22,pdmg:20,hs:5,stun:22,kb:.8,reach:14,w:0,fx:[{on:'start',k:'aoe',at:'target',r:3,delay:52,dur:3}],phases:[ph('windup',50),ph('release',2),ph('recovery',30)]},
  // ---- the Oathbound Knight ----
  bash:{id:'bash',who:'D',dmg:10,pdmg:24,hs:5,stun:24,kb:2.0,reach:2.3,w:.15,gb:true,phases:[ph('startup',22),ph('active',5,{seg:0,a0:.5,a1:-.5}),ph('recovery',34)]},
  riposte:{id:'riposte',who:'D',dmg:16,pdmg:14,hs:5,stun:20,kb:.6,reach:2.4,w:.12,phases:[ph('startup',20),ph('active',4,{seg:0,a0:.5,a1:-.5}),ph('recovery',24)]},
  // ---- peak signatures ----
  // Arissa phase-2: delayed fire circle under where you stood when the cast began (read the ring, step out)
  cinder:{id:'cinder',who:'D',dmg:24,pdmg:20,hs:5,stun:22,kb:.9,reach:14,w:0,fx:[{on:'start',k:'aoe',at:'target',r:3.2,delay:48,dur:4}],phases:[ph('cast',36),ph('release',2),ph('recovery',28)]},
  // Paladin phase-2 greatsword: wide horizontal cleave (reads like a Sekiro perilous sweep)
  cleave:{id:'cleave',who:'D',dmg:28,pdmg:26,hs:7,stun:28,kb:1.3,reach:3.4,w:.18,phases:[ph('startup',28),ph('active',6,{seg:0,a0:1.4,a1:-1.4}),ph('recovery',42)]},
};
Moves.expand=(id,hold)=>{const m=Moves[id];return m.phases.map(p=>p.k==='hold'?Object.assign({},p,{n:Math.max(0,Math.min(HOLD_MAX,hold|0))}):p)};
Moves.total=(id,hold)=>Moves.expand(id,hold).reduce((a,p)=>a+p.n,0);
Moves.tells=(id,hold)=>{const o=[];let t=0;for(const p of Moves.expand(id,hold)){if(p.k==='active'){o.push(t);t=0}else if(p.k==='hold')t=0;else if(p.k==='recovery')t=0;else t+=p.n}return o};
Moves.endRecovery=id=>{const L=Moves[id].phases;return L[L.length-1].k==='recovery'?L[L.length-1].n:0};
Moves.dodgeRoot=(()=>{const d=Moves.dodge,n=d.rootT1-d.rootT0+1,w=[];let s=0;for(let i=0;i<n;i++){const v=1-i/n;w.push(v);s+=v}return w.map(v=>v/s*d.dist)})();
