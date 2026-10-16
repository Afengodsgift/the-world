// WARDEN: combat move tables (pure data + tiny helpers; no THREE/DOM). Fixed 60 Hz ticks.
// A move is a list of phases {k:'startup'|'windup'|'lunge'|'hold'|'raise'|'down'|'rechamber'|'active'|'recovery', n:ticks, move?:metres of root motion over the phase, seg?:hit segment index (active only)}
// pt (phase time) counts ticks since the command was consumed (pt=0 on that tick): startup = pt 0..S-1, active = S..S+A-1, recovery next, fighter can act at pt = total.
// FAIRNESS RULES (enforced by tests/warden_core.sim.js, no exceptions list): every Duelist hit has a visible tell >= TELL_MIN ticks (a 'hold' never counts), every Duelist move ends in >= REC_MIN ticks of uncancellable recovery, hold <= HOLD_MAX, and no Duelist move defines `cancel`.
const TICK=60,TELL_MIN=20,REC_MIN=20,HOLD_MAX=12;
const ph=(k,n,o)=>Object.assign({k,n},o||{});
const Moves={
  TICK,TELL_MIN,REC_MIN,HOLD_MAX,
  // ---- player (cancel thresholds are RECOVERY ticks; the one deliberate asymmetry: Duelist moves have none) ----
  light:{id:'light',who:'P',stam:12,dmg:14,pdmg:12,hs:4,stun:18,kb:.5,reach:2.4,w:.12,phases:[ph('startup',10),ph('active',4,{seg:0,a0:.8,a1:-.8}),ph('recovery',16)],cancel:{light:6,dodge:8,guard:8}},
  heavy:{id:'heavy',who:'P',stam:25,dmg:34,pdmg:30,hs:7,stun:28,kb:1.2,reach:2.6,w:.12,chargeMin:18,chargeMax:45,phases:[ph('startup',14,{move:.8}),ph('active',5,{seg:0,a0:.6,a1:-.6}),ph('recovery',30)]},
  dodge:{id:'dodge',who:'*',stam:18,total:22,iStart:3,iEnd:11,dist:3.2,rootT0:1,rootT1:14},   // invulnerable pt 3..11 inclusive (9 ticks); vulnerable 12..21; can act at 22
  // ---- Duelist ----
  cut:{id:'cut',who:'D',dmg:14,pdmg:12,hs:4,stun:18,kb:.5,reach:2.3,w:.12,phases:[ph('startup',20),ph('active',4,{seg:0,a0:.7,a1:-.7}),ph('recovery',20)]},
  fall:{id:'fall',who:'D',dmg:30,pdmg:28,hs:7,stun:26,kb:1.1,reach:2.6,w:.14,hold:true,phases:[ph('raise',14),ph('hold',0),ph('down',22),ph('active',5,{seg:0,a0:.2,a1:-.2}),ph('recovery',34)]},
  thrust:{id:'thrust',who:'D',dmg:22,pdmg:20,hs:5,stun:22,kb:.9,reach:3.2,w:.1,phases:[ph('windup',14),ph('lunge',10,{move:1.4}),ph('active',6,{seg:0,a0:0,a1:0}),ph('recovery',38)]},
  twin:{id:'twin',who:'D',dmg:12,pdmg:11,hs:4,stun:16,kb:.4,reach:2.3,w:.12,phases:[ph('startup',20),ph('active',4,{seg:0,a0:.7,a1:-.7}),ph('rechamber',22),ph('active',4,{seg:1,a0:-.7,a1:.7}),ph('recovery',20)]},
  riposte:{id:'riposte',who:'D',dmg:16,pdmg:14,hs:5,stun:20,kb:.6,reach:2.4,w:.12,phases:[ph('startup',20),ph('active',4,{seg:0,a0:.5,a1:-.5}),ph('recovery',24)]},
};
// expand a move into concrete phases (hold ticks decided at start, clamped to HOLD_MAX)
Moves.expand=(id,hold)=>{const m=Moves[id];return m.phases.map(p=>p.k==='hold'?Object.assign({},p,{n:Math.max(0,Math.min(HOLD_MAX,hold|0))}):p)};
Moves.total=(id,hold)=>Moves.expand(id,hold).reduce((a,p)=>a+p.n,0);
// tell for each hit segment = ticks of visible wind-up since the last still pose (action start, a hold, or the previous active/recovery)
Moves.tells=(id,hold)=>{const o=[];let t=0;for(const p of Moves.expand(id,hold)){if(p.k==='active'){o.push(t);t=0}else if(p.k==='hold')t=0;else if(p.k==='recovery')t=0;else t+=p.n}return o};
// sum of the recovery phase that ends the move
Moves.endRecovery=id=>{const L=Moves[id].phases;return L[L.length-1].k==='recovery'?L[L.length-1].n:0};
// dodge root motion: ease-out over ticks rootT0..rootT1, per-tick metres, sums to dist
Moves.dodgeRoot=(()=>{const d=Moves.dodge,n=d.rootT1-d.rootT0+1,w=[];let s=0;for(let i=0;i<n;i++){const v=1-i/n;w.push(v);s+=v}return w.map(v=>v/s*d.dist)})();
