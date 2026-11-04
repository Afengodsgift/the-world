// WARDEN: TWIN BLADES, the second fighting stance you can swap into mid-fight (swap button / Z). Pure data + tiny helpers for the sim (no THREE/DOM), same plug-in shape as Fists.js:
// a fighter with `tw` set resolves Light / Heavy through Twin.Combos instead of Combos. The swap itself is the sim command {t:'stance',tw:0|1}: it costs no action (you can swap in the middle of a dodge or a recovery),
// and the first strikes after a swap carry a 25% "Swap Strike" bonus for 1.5 s, so changing weapons is an attack, not a pause.
//   LIGHT STRING  Fang I > II > III (a stab) > IV (reverse grip) > V (a flip kick). Fast (a hit every ~12 ticks), cheap in stamina, each hit can be cancelled into the next, into Heavy, or into a dodge.
//   BRANCHES      Heavy after I-III / step / dash / counter = CROSSING FANGS (a posture crusher); after IV / V = FANG WHIRL (a spin). A tap from neutral (or right after a dodge) = SHADOW PIERCE, a lunging stab (hold for more).
//   CONTEXT       Forward+Light = SHADE STEP slash. Light from far away = SHADE RUSH (a two-hit dash). Light right after a dodge = MIST COUNTER. Guard+Light = FLIP KICK (posture). Jump+Light = TWIN PLUNGE.
//   FLOW          Outside Flow the skill is SHADE STRIKE: you pass THROUGH the foe (brief invulnerability) and cut as you come out behind them. Inside Flow the finishers are MOONLIT SPIN and DANCE OF FANGS.
//   DODGES        cost 30% less stamina in this stance (see CombatCore).
// All numbers are final ticks at 60 Hz. Every move has a start-up, an active window and a recovery, like the sword moves.
const Twin=(()=>{
  const ph=(k,n,o)=>Object.assign({k,n},o||{});
  const M={
    twa:{id:'twa',who:'P',chain:1,stam:5,dmg:8,pdmg:7,hs:3,stun:12,kb:.25,reach:2.1,w:.12,phases:[ph('startup',6),ph('active',3,{seg:0,a0:.8,a1:-.8}),ph('recovery',9)],cancel:{light:3,heavy:4,dodge:3,guard:5}},
    twb:{id:'twb',who:'P',chain:2,stam:5,dmg:8,pdmg:7,hs:3,stun:12,kb:.25,reach:2.1,w:.12,phases:[ph('startup',6),ph('active',3,{seg:0,a0:-.8,a1:.8}),ph('recovery',9)],cancel:{light:3,heavy:4,dodge:3,guard:5}},
    twc:{id:'twc',who:'P',chain:3,stam:6,dmg:9,pdmg:8,hs:3,stun:14,kb:.35,reach:2.4,w:.1,phases:[ph('startup',7,{move:.5}),ph('active',3,{seg:0,a0:0,a1:0}),ph('recovery',10)],cancel:{light:3,heavy:4,dodge:4,guard:5}},
    twd:{id:'twd',who:'P',chain:4,stam:6,dmg:10,pdmg:9,hs:4,stun:16,kb:.4,reach:2.2,w:.13,phases:[ph('startup',7),ph('active',3,{seg:0,a0:1,a1:-1}),ph('recovery',11)],cancel:{light:4,heavy:5,dodge:4,guard:6}},
    twe:{id:'twe',who:'P',chain:5,stam:9,dmg:16,pdmg:20,hs:6,stun:22,kb:1,reach:2.5,w:.14,phases:[ph('startup',9,{move:.4}),ph('active',4,{seg:0,a0:1.3,a1:-1.3}),ph('recovery',18)],cancel:{dodge:8}},
    // context openers
    twstep:{id:'twstep',who:'P',chain:1,stam:6,dmg:10,pdmg:8,hs:3,stun:14,kb:.35,reach:2.4,w:.12,phases:[ph('startup',6,{move:1.8}),ph('active',3,{seg:0,a0:.7,a1:-.7}),ph('recovery',10)],cancel:{light:3,heavy:4,dodge:3,guard:5}},
    twdash:{id:'twdash',who:'P',chain:1,stam:9,dmg:11,pdmg:9,hs:4,stun:16,kb:.5,reach:2.5,w:.12,phases:[ph('startup',6,{move:4.8}),ph('active',4,{seg:0,a0:.8,a1:-.8}),ph('recovery',14)],cancel:{light:4,heavy:5,dodge:4}},   // Light with a foe more than 4.5 m away
    twcounter:{id:'twcounter',who:'P',chain:1,stam:7,dmg:14,pdmg:12,hs:4,stun:18,kb:.5,reach:2.5,w:.12,phases:[ph('startup',4,{move:1.4}),ph('active',3,{seg:0,a0:.9,a1:-.9}),ph('recovery',10)],cancel:{light:3,heavy:4,dodge:3}},   // Light right after a dodge
    twkick:{id:'twkick',who:'P',stam:8,dmg:5,pdmg:36,hs:5,stun:30,kb:1.6,reach:2.2,w:.15,phases:[ph('startup',8),ph('active',4,{seg:0,a0:.5,a1:-.5}),ph('recovery',16)],cancel:{dodge:8,guard:6}},   // Guard + Light
    twplunge:{id:'twplunge',who:'P',chain:0,stam:16,dmg:26,pdmg:34,hs:6,stun:28,kb:1.2,reach:2.7,w:.18,phases:[ph('startup',8),ph('active',6,{seg:0,a0:.9,a1:-.9}),ph('recovery',24)]},   // Jump + Light
    // heavy branches
    twx:{id:'twx',who:'P',chain:0,stam:12,dmg:22,pdmg:32,hs:6,stun:24,kb:.8,reach:2.5,w:.14,phases:[ph('startup',10),ph('active',4,{seg:0,a0:.9,a1:-.9}),ph('recovery',20)],cancel:{dodge:10}},
    twwhirl:{id:'twwhirl',who:'P',chain:0,stam:16,dmg:24,pdmg:30,hs:7,stun:26,kb:1.2,reach:2.8,w:.14,phases:[ph('startup',9),ph('active',7,{seg:0,a0:3.1,a1:-3.1}),ph('recovery',22)],cancel:{dodge:10}},
    twpierce:{id:'twpierce',who:'P',stam:18,dmg:30,pdmg:28,hs:7,stun:26,kb:1.3,reach:3.6,w:.1,phases:[ph('startup',8,{move:3.8}),ph('active',4,{seg:0,a0:0,a1:0}),ph('recovery',24)],cancel:{dodge:12}},   // tap Heavy: a lunging stab; hold for more
    // Flow skills
    twshade:{id:'twshade',who:'P',stam:16,dmg:20,pdmg:24,hs:5,stun:22,kb:.9,reach:3.2,w:.14,inv:12,phases:[ph('startup',4,{move:3.9}),ph('active',4,{seg:0,a0:1.1,a1:-1.1}),ph('recovery',20)],cancel:{dodge:8}},   // Shade Strike: through the foe, cutting as you come out behind them
    twmoon:{id:'twmoon',who:'P',stam:0,dmg:15,pdmg:20,hs:5,stun:22,kb:1,reach:3.1,w:.15,phases:[ph('startup',12),ph('active',4,{seg:0,a0:2.6,a1:-2.6}),ph('rechamber',6),ph('active',4,{seg:1,a0:-2.6,a1:2.6}),ph('recovery',24)],cancel:{dodge:12}},   // Moonlit Spin: two full turns
    twdance:{id:'twdance',who:'P',stam:0,dmg:11,pdmg:14,hs:4,stun:20,kb:.6,reach:2.8,w:.14,sdm:[1,1,1,2],phases:[ph('startup',12),ph('active',3,{seg:0,a0:.9,a1:-.9}),ph('rechamber',5,{move:.6}),ph('active',3,{seg:1,a0:-.9,a1:.9}),ph('rechamber',5,{move:.6}),ph('active',3,{seg:2,a0:.9,a1:-.9}),ph('rechamber',7),ph('active',5,{seg:3,a0:.2,a1:-.2}),ph('recovery',26)],cancel:{dodge:12}}};   // Dance of Fangs: three quick cuts and a heavy fourth
  const IDS=Object.keys(M);
  const CHAIN_GAP=26,EVADE_GAP=18,STRING=['twa','twb','twc','twd','twe'];
  const OPEN=['twa','twstep','twdash','twcounter'];
  function light(ctx){
    const f=ctx.from;
    if(ctx.air&&!f)return 'twplunge';
    if(ctx.guard&&!f)return 'twkick';
    if(f){const i=STRING.indexOf(f);if(OPEN.indexOf(f)>=0&&f!=='twa')return 'twb';if(i>=0&&i<4)return STRING[i+1];return 'twa'}
    if(ctx.far)return 'twdash';
    if(ctx.adv)return 'twstep';
    if(ctx.sinceDodge<=EVADE_GAP)return 'twcounter';
    if(ctx.chain>=1&&ctx.chain<=4)return STRING[ctx.chain];
    return 'twa'}
  function heavy(ctx){const f=ctx.from;return f==='twd'||f==='twe'?'twwhirl':f==='twa'||f==='twb'||f==='twc'||f==='twstep'||f==='twdash'||f==='twcounter'?'twx':null}
  function install(MV){if(!MV)return;for(const k of IDS)MV[k]=M[k]}
  if(typeof Moves!=='undefined')install(Moves);
  const Combos={light,heavy,CHAIN_GAP,EVADE_GAP,IDS:['twa','twb','twc','twd','twe','twstep','twdash','twcounter','twkick','twplunge','twx','twwhirl','twpierce']};
  const FIN=['twmoon','twdance','twmoon','twdance'],SKILL='twshade',SWAP_BONUS=1.25,SWAP_TICKS=90,DODGE_STAM=.7;
  return{M,IDS,STRING,Combos,light,heavy,install,CHAIN_GAP,EVADE_GAP,FIN,SKILL,SWAP_BONUS,SWAP_TICKS,DODGE_STAM}})();
if(typeof module!=='undefined')module.exports=Twin;
