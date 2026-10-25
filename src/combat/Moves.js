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
  light3:{id:'light3',who:'P',chain:3,stam:16,dmg:20,pdmg:18,hs:6,stun:24,kb:.9,reach:2.5,w:.13,phases:[ph('startup',12),ph('active',4,{seg:0,a0:.9,a1:-.9}),ph('recovery',24)],cancel:{dodge:12,heavy:8}},
  advance:{id:'advance',who:'P',chain:1,stam:14,dmg:16,pdmg:14,hs:4,stun:20,kb:.7,reach:2.5,w:.12,phases:[ph('startup',9,{move:1.3}),ph('active',4,{seg:0,a0:.6,a1:-.6}),ph('recovery',18)],cancel:{light:8,dodge:8,heavy:10}},
  rush:{id:'rush',who:'P',chain:1,stam:14,dmg:16,pdmg:14,hs:4,stun:20,kb:.7,reach:2.6,w:.12,phases:[ph('startup',7,{move:4.6}),ph('active',4,{seg:0,a0:.7,a1:-.7}),ph('recovery',20)],cancel:{light:8,dodge:8,heavy:10}},   // gap-closer: Light with a foe more than 4.5 m away dashes in and cuts
  evade:{id:'evade',who:'P',chain:1,stam:12,dmg:16,pdmg:14,hs:4,stun:18,kb:.5,reach:2.4,w:.12,phases:[ph('startup',6),ph('active',4,{seg:0,a0:.8,a1:-.8}),ph('recovery',18)],cancel:{light:8,dodge:8}},
  rising:{id:'rising',who:'P',chain:0,stam:22,dmg:28,pdmg:38,hs:6,stun:26,kb:1.0,reach:2.6,w:.13,phases:[ph('startup',14,{move:.6}),ph('active',5,{seg:0,a0:.5,a1:-.5}),ph('recovery',28)],cancel:{dodge:14}},
  heavy:{id:'heavy',who:'P',stam:25,dmg:34,pdmg:30,hs:7,stun:28,kb:1.2,reach:2.6,w:.12,chargeMin:18,chargeMax:45,phases:[ph('startup',14,{move:.8}),ph('active',5,{seg:0,a0:.6,a1:-.6}),ph('recovery',30)]},
  // ---- Flow skills (Flow button): outside Flow a stamina skill (Cinder Arc), inside Flow a finisher paid for with the Flow meter (Armada, Meia Lua) ----
  cinder:{id:'cinder',who:'P',stam:22,dmg:22,pdmg:36,hs:6,stun:24,kb:.9,reach:3.1,w:.14,phases:[ph('startup',14),ph('active',6,{seg:0,a0:1.5,a1:-1.5}),ph('recovery',24)],cancel:{dodge:12}},
  armada:{id:'armada',who:'P',stam:0,dmg:26,pdmg:34,hs:7,stun:26,kb:1.3,reach:3.3,w:.16,phases:[ph('startup',18),ph('active',9,{seg:0,a0:3,a1:-3}),ph('recovery',26)],cancel:{dodge:14}},
  meia:{id:'meia',who:'P',stam:0,dmg:32,pdmg:46,hs:8,stun:28,kb:1.4,reach:3.6,w:.16,phases:[ph('startup',20),ph('active',6,{seg:0,a0:1.9,a1:-1.9}),ph('recovery',30)],cancel:{dodge:14}},
  // ---- new sets: Shield Shove (Guard + Light), Lunge (Heavy right after a dodge), Tempest (Light x3 > Heavy), Axe Kick + Sweep (Flow finishers) ----
  shove:{id:'shove',who:'P',stam:10,dmg:6,pdmg:42,hs:5,stun:30,kb:1.4,reach:2.0,w:.16,phases:[ph('startup',9),ph('active',4,{seg:0,a0:.6,a1:-.6}),ph('recovery',20)],cancel:{dodge:10,guard:8}},
  lunge:{id:'lunge',who:'P',stam:20,dmg:30,pdmg:26,hs:7,stun:26,kb:1.5,reach:3.5,w:.1,phases:[ph('startup',12,{move:1.8}),ph('active',4,{seg:0,a0:.2,a1:-.2}),ph('recovery',28)],cancel:{dodge:14}},
  whirl:{id:'whirl',who:'P',stam:26,dmg:30,pdmg:40,hs:8,stun:28,kb:1.3,reach:2.8,w:.14,phases:[ph('startup',15),ph('active',7,{seg:0,a0:3.1,a1:-3.1}),ph('recovery',32)],cancel:{dodge:14}},
  martelo:{id:'martelo',who:'P',stam:0,dmg:42,pdmg:50,hs:9,stun:30,kb:1.0,reach:2.8,w:.14,phases:[ph('startup',20),ph('active',5,{seg:0,a0:.3,a1:-.3}),ph('recovery',32)],cancel:{dodge:14}},
  rasteira:{id:'rasteira',who:'P',stam:0,dmg:22,pdmg:38,hs:6,stun:44,kb:1.6,reach:3.2,w:.15,phases:[ph('startup',18),ph('active',6,{seg:0,a0:1.3,a1:-1.3}),ph('recovery',30)],cancel:{dodge:14}},
  dodge:{id:'dodge',who:'*',stam:18,total:22,iStart:3,iEnd:11,dist:3.2,rootT0:1,rootT1:14},   // invulnerable pt 3..11 inclusive (9 ticks); vulnerable 12..21; can act at 22
  // ---- Duelist ----
  cut:{id:'cut',who:'D',dmg:14,pdmg:12,hs:4,stun:18,kb:.5,reach:2.3,w:.12,phases:[ph('startup',20),ph('active',4,{seg:0,a0:.7,a1:-.7}),ph('recovery',20)]},
  fall:{id:'fall',who:'D',dmg:30,pdmg:28,hs:7,stun:26,kb:1.1,reach:2.6,w:.14,hold:true,phases:[ph('raise',14),ph('hold',0),ph('down',22),ph('active',5,{seg:0,a0:.2,a1:-.2}),ph('recovery',34)]},
  thrust:{id:'thrust',who:'D',dmg:22,pdmg:20,hs:5,stun:22,kb:.9,reach:3.2,w:.1,phases:[ph('windup',14),ph('lunge',10,{move:1.4}),ph('active',6,{seg:0,a0:0,a1:0}),ph('recovery',38)]},
  twin:{id:'twin',who:'D',dmg:12,pdmg:11,hs:4,stun:16,kb:.4,reach:2.3,w:.12,phases:[ph('startup',20),ph('active',4,{seg:0,a0:.7,a1:-.7}),ph('rechamber',22),ph('active',4,{seg:1,a0:-.7,a1:.7}),ph('recovery',20)]},
  // ---- the Hollow Warden (second foe): slower, wider, harder - every rule above still applies ----
  sweep:{id:'sweep',who:'D',dmg:22,pdmg:20,hs:6,stun:24,kb:1.0,reach:3.0,w:.14,phases:[ph('startup',26),ph('active',5,{seg:0,a0:1.3,a1:-1.3}),ph('recovery',40)]},
  slam:{id:'slam',who:'D',dmg:38,pdmg:34,hs:8,stun:30,kb:1.4,reach:3.0,w:.16,hold:true,phases:[ph('raise',20),ph('hold',0),ph('down',24),ph('active',6,{seg:0,a0:.2,a1:-.2}),ph('recovery',48)]},
  triple:{id:'triple',who:'D',dmg:14,pdmg:12,hs:4,stun:16,kb:.5,reach:2.8,w:.13,phases:[ph('startup',22),ph('active',4,{seg:0,a0:.8,a1:-.8}),ph('rechamber',22),ph('active',4,{seg:1,a0:-.8,a1:.8}),ph('rechamber',22),ph('active',4,{seg:2,a0:.8,a1:-.8}),ph('recovery',30)]},
  // ---- gap closers (used from range, so a kiting player is not safe): long tell, long recovery ----
  dash:{id:'dash',who:'D',dmg:20,pdmg:18,hs:5,stun:22,kb:.8,reach:2.4,w:.12,phases:[ph('windup',16),ph('lunge',12,{move:3.4}),ph('active',5,{seg:0,a0:.8,a1:-.8}),ph('recovery',32)]},
  leap:{id:'leap',who:'D',dmg:34,pdmg:30,hs:7,stun:28,kb:1.2,reach:3.0,w:.15,phases:[ph('raise',22),ph('lunge',14,{move:4.6}),ph('active',6,{seg:0,a0:.3,a1:-.3}),ph('recovery',50)]},
  // ---- ranged / magic (effects, see CombatCore): a long visible cast, then the effect; nothing here is a sword arc ----
  orb:{id:'orb',who:'D',dmg:16,pdmg:14,hs:4,stun:20,kb:.6,reach:12,w:0,fx:[{on:'release',k:'proj',spd:.2,life:90,r:.5,off:.9}],phases:[ph('cast',30),ph('release',2),ph('recovery',34)]},          // slow magic orb: sidestep it or block it
  bolt:{id:'bolt',who:'D',dmg:14,pdmg:12,hs:4,stun:18,kb:.5,reach:16,w:0,fx:[{on:'release',k:'proj',spd:.36,life:70,r:.4,off:.9}],phases:[ph('cast',24),ph('release',2),ph('recovery',30)]},            // arrow: fast, long range, long draw
  quake:{id:'quake',who:'D',dmg:30,pdmg:26,hs:7,stun:26,kb:1.4,reach:4.2,w:0,fx:[{on:'start',k:'aoe',at:'self',r:4.2,delay:40,dur:3}],phases:[ph('windup',38),ph('release',2),ph('recovery',52)]},   // giant's stomp: the ring shows on the ground first; leave it or dodge through it
  rain:{id:'rain',who:'D',dmg:22,pdmg:20,hs:5,stun:22,kb:.8,reach:14,w:0,fx:[{on:'start',k:'aoe',at:'target',r:3,delay:52,dur:3}],phases:[ph('windup',50),ph('release',2),ph('recovery',30)]},       // a strike called down on where you stood when the cast began
  // ---- the Oathbound Knight: a shield-bash that cracks a raised guard (gb: a blocked hit empties the stamina bar at once) ----
  bash:{id:'bash',who:'D',dmg:10,pdmg:24,hs:5,stun:24,kb:2.0,reach:2.3,w:.15,gb:true,phases:[ph('startup',22),ph('active',5,{seg:0,a0:.5,a1:-.5}),ph('recovery',34)]},
  // ---- Arissa's capoeira: spinning storm (armada), heavy axe-kick (martelo), low sweep (rasteira) ----
  spin:{id:'spin',who:'D',dmg:18,pdmg:16,hs:5,stun:20,kb:.8,reach:2.8,w:.14,phases:[ph('startup',24),ph('active',8,{seg:0,a0:3,a1:-3}),ph('recovery',36)]},
  hammer:{id:'hammer',who:'D',dmg:28,pdmg:26,hs:7,stun:26,kb:1.2,reach:2.6,w:.14,phases:[ph('startup',28),ph('active',5,{seg:0,a0:.3,a1:-.3}),ph('recovery',46)]},
  lowsweep:{id:'lowsweep',who:'D',dmg:16,pdmg:14,hs:4,stun:22,kb:.6,reach:3.0,w:.14,phases:[ph('startup',24),ph('active',6,{seg:0,a0:1.2,a1:-1.2}),ph('recovery',38)]},
  riposte:{id:'riposte',who:'D',dmg:16,pdmg:14,hs:5,stun:20,kb:.6,reach:2.4,w:.12,phases:[ph('startup',20),ph('active',4,{seg:0,a0:.5,a1:-.5}),ph('recovery',24)]},
};
// TEMPO: player strikes are ~30% quicker than the base table (Sekiro-like cadence): shorter start-ups, shorter recoveries, and a small step-in on the light chain so a swing closes the gap.
// Foe tables are untouched, so every fairness rule above (tells, recoveries) still holds for them.
const TEMPO={start:.62,rec:.6,minStart:4,minRec:6,step:{light:.55,light2:.55,light3:.65,evade:.5}};
for(const k of Object.keys(Moves)){const m=Moves[k];if(!m||m.who!=='P'||!m.phases)continue;
  m.phases=m.phases.map(p=>{if(p.k==='startup'){const q=Object.assign({},p,{n:Math.max(TEMPO.minStart,Math.round(p.n*TEMPO.start))});if(TEMPO.step[k]&&!q.move)q.move=TEMPO.step[k];return q}
    if(p.k==='recovery')return Object.assign({},p,{n:Math.max(TEMPO.minRec,Math.round(p.n*TEMPO.rec))});return p})}
Moves.TEMPO=TEMPO;
// expand a move into concrete phases (hold ticks decided at start, clamped to HOLD_MAX)
Moves.expand=(id,hold)=>{const m=Moves[id];return m.phases.map(p=>p.k==='hold'?Object.assign({},p,{n:Math.max(0,Math.min(HOLD_MAX,hold|0))}):p)};
Moves.total=(id,hold)=>Moves.expand(id,hold).reduce((a,p)=>a+p.n,0);
// tell for each hit segment = ticks of visible wind-up since the last still pose (action start, a hold, or the previous active/recovery)
Moves.tells=(id,hold)=>{const o=[];let t=0;for(const p of Moves.expand(id,hold)){if(p.k==='active'){o.push(t);t=0}else if(p.k==='hold')t=0;else if(p.k==='recovery')t=0;else t+=p.n}return o};
// sum of the recovery phase that ends the move
Moves.endRecovery=id=>{const L=Moves[id].phases;return L[L.length-1].k==='recovery'?L[L.length-1].n:0};
// dodge root motion: ease-out over ticks rootT0..rootT1, per-tick metres, sums to dist
Moves.dodgeRoot=(()=>{const d=Moves.dodge,n=d.rootT1-d.rootT0+1,w=[];let s=0;for(let i=0;i<n;i++){const v=1-i/n;w.push(v);s+=v}return w.map(v=>v/s*d.dist)})();
