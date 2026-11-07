// WARDEN: BRAWL, hand-to-hand for when the blade is gone (a boss knocks it out of your grip, or you wrench his away). Built fresh for the Warden Isles: it shares nothing with the Iron Fist Isle trials (Fists.js / DojoAI.js).
// Pure data + tiny helpers for the sim (no THREE/DOM). A fighter with `arm===0` resolves Light / Heavy through Brawl.Combos, and the sword-only commands are ignored until the weapon is back in his hand.
//   STRING     jab > cross > hook > knee > roundhouse. Fast (4-5 tick start-ups, a hit every ~10 ticks), cheap, every link cancels into the next, into a Heavy branch, into a WRENCH or into a dodge.
//   BRANCHES   Heavy after jab / cross / step / lunge / slip = ELBOW BREAK (posture); after hook = UPPERCUT; after knee = SPINNING BACK KICK; after the roundhouse = LEG SWEEP (the foe limps). A tap from neutral = POWER STRIKE.
//   CONTEXT    Forward+Light = STEP jab. Light from far away = FLYING KNEE-KICK dash. Light right after a dodge = SLIP COUNTER (avoid, then punish). Guard+Light = PUSH KICK (posture crusher). Jump+Light = DROP KICK.
//   WRENCH     {t:'wrench'}: a grab that ignores guard and parry (a dodge beats it). On a foe who holds a weapon it is a DISARM: the weapon is twisted out and lands on the floor beside you. On anyone else it is a hip throw.
//   THE FLOOR  A knocked-away weapon lies where it landed (C.wp[ownerId] = {x,z}). Walk over your own to take it back. ANY kick (moves with `wk`) that connects with a weapon on the floor punts it ~6 m away, so both fighters
//              can keep each other from theirs. After RETURN_T ticks an unclaimed weapon slides back to its owner (no soft-lock). A disarm can't happen again for DIS_CD ticks after the weapon is back in hand.
// All numbers are final ticks at 60 Hz. Every move has a start-up, an active window and a recovery, like the sword moves.
const Brawl=(()=>{
  const ph=(k,n,o)=>Object.assign({k,n},o||{});
  const P=(id,o)=>Object.assign({id,who:'P',bw:1},o);
  const M={
    bwjab:P('bwjab',{zn:'hm',chain:1,stam:3,dmg:6,pdmg:8,hs:2,stun:12,kb:.2,reach:1.9,w:.12,phases:[ph('startup',4),ph('active',2,{seg:0,a0:.35,a1:-.35}),ph('recovery',6)],cancel:{light:2,heavy:3,dodge:3,guard:4,wrench:3}}),
    bwcross:P('bwcross',{zn:'hm',chain:2,stam:4,dmg:8,pdmg:10,hs:3,stun:14,kb:.35,reach:2.0,w:.12,phases:[ph('startup',4),ph('active',2,{seg:0,a0:.35,a1:-.35}),ph('recovery',7)],cancel:{light:2,heavy:3,dodge:3,guard:4,wrench:3}}),
    bwhook:P('bwhook',{zn:'hm',chain:3,stam:5,dmg:10,pdmg:13,hs:4,stun:16,kb:.5,reach:2.0,w:.13,phases:[ph('startup',5),ph('active',3,{seg:0,a0:1.0,a1:-1.0}),ph('recovery',8)],cancel:{light:3,heavy:3,dodge:4,wrench:4}}),
    bwknee:P('bwknee',{zn:'m',chain:4,stam:6,dmg:12,pdmg:16,hs:4,stun:18,kb:.65,reach:1.9,w:.13,phases:[ph('startup',5,{move:.5}),ph('active',3,{seg:0,a0:.4,a1:-.4}),ph('recovery',9)],cancel:{light:3,heavy:3,dodge:5,wrench:4}}),
    bwroundk:P('bwroundk',{zn:'hml',chain:5,wk:1,stam:9,dmg:18,pdmg:24,hs:6,stun:24,kb:1.3,reach:2.5,w:.14,phases:[ph('startup',7),ph('active',4,{seg:0,a0:1.4,a1:-1.4}),ph('recovery',16)],cancel:{heavy:5,dodge:7}}),
    // heavy branches
    bwelbow:P('bwelbow',{zn:'h',stam:8,dmg:15,pdmg:26,hs:5,stun:22,kb:.7,reach:1.8,w:.13,phases:[ph('startup',6,{move:.4}),ph('active',3,{seg:0,a0:.5,a1:-.5}),ph('recovery',11)],cancel:{dodge:6,wrench:5}}),
    bwupper:P('bwupper',{zn:'h',stam:9,dmg:17,pdmg:22,hs:6,stun:26,kb:.9,reach:1.9,w:.13,phases:[ph('startup',7,{move:.5}),ph('active',3,{seg:0,a0:.5,a1:-.5}),ph('recovery',13)],cancel:{dodge:7}}),
    bwspin:P('bwspin',{zn:'h',wk:1,stam:11,dmg:22,pdmg:28,hs:7,stun:26,kb:1.6,reach:2.6,w:.14,phases:[ph('startup',10),ph('active',4,{seg:0,a0:2.0,a1:-2.0}),ph('recovery',18)],cancel:{dodge:8}}),
    bwsweep:P('bwsweep',{zn:'l',wk:1,stam:9,dmg:10,pdmg:20,hs:5,stun:36,kb:.9,reach:2.6,w:.15,phases:[ph('startup',9),ph('active',4,{seg:0,a0:1.5,a1:-1.5}),ph('recovery',16)],cancel:{dodge:8}}),
    bwpower:P('bwpower',{zn:'h',stam:12,dmg:24,pdmg:32,hs:8,stun:28,kb:1.5,reach:2.3,w:.14,chargeMin:18,chargeMax:45,phases:[ph('startup',10,{move:.9}),ph('active',4,{seg:0,a0:.5,a1:-.5}),ph('recovery',20)]}),
    // context openers
    bwstep:P('bwstep',{zn:'hm',chain:1,stam:4,dmg:8,pdmg:10,hs:3,stun:14,kb:.4,reach:2.4,w:.12,phases:[ph('startup',5,{move:1.4}),ph('active',3,{seg:0,a0:.4,a1:-.4}),ph('recovery',8)],cancel:{light:2,heavy:3,dodge:3,guard:4,wrench:3}}),
    bwlunge:P('bwlunge',{zn:'m',chain:1,wk:1,stam:7,dmg:11,pdmg:14,hs:4,stun:18,kb:.8,reach:2.5,w:.13,phases:[ph('startup',6,{move:4.2}),ph('active',4,{seg:0,a0:.5,a1:-.5}),ph('recovery',14)],cancel:{light:4,heavy:5,dodge:5}}),
    bwslip:P('bwslip',{zn:'h',chain:1,stam:5,dmg:13,pdmg:16,hs:4,stun:18,kb:.5,reach:2.2,w:.13,phases:[ph('startup',3,{move:1.0}),ph('active',3,{seg:0,a0:.5,a1:-.5}),ph('recovery',8)],cancel:{light:2,heavy:3,dodge:3,wrench:3}}),
    bwpush:P('bwpush',{zn:'m',wk:1,stam:7,dmg:3,pdmg:38,hs:5,stun:30,kb:2.0,reach:2.1,w:.15,phases:[ph('startup',7),ph('active',3,{seg:0,a0:.4,a1:-.4}),ph('recovery',13)],cancel:{dodge:7,guard:5}}),
    bwdrop:P('bwdrop',{zn:'l',wk:1,stam:11,dmg:26,pdmg:38,hs:7,stun:30,kb:1.3,reach:2.7,w:.2,phases:[ph('startup',8),ph('active',5,{seg:0,a0:.7,a1:-.7}),ph('recovery',22)]}),
    // THE WRENCH: a grab (gr = ignores guard and parry; a dodge beats it). dis = the weapon comes out of his hand
    bwwrench:P('bwwrench',{gr:1,dis:1,stam:8,dmg:5,pdmg:30,hs:7,stun:50,kb:1.2,reach:1.7,w:.2,phases:[ph('startup',8,{move:.4}),ph('active',3,{seg:0,a0:.45,a1:-.45}),ph('recovery',20)],cancel:{dodge:12}})
  };
  // the bare-handed boss (a boss whose weapon was wrenched away). Fair like every foe move: a tell >= 20 ticks before every hit, >= 20 ticks of recovery, nothing cancels.
  const D=(id,as,o)=>Object.assign({id,who:'D',as:[].concat(as),bwf:1},o);
  const F={
    bwfjab:D('bwfjab',['cut','twin'],{dmg:8,pdmg:7,hs:3,stun:16,kb:.4,reach:2.3,w:.13,phases:[ph('startup',22),ph('active',3,{seg:0,a0:.5,a1:-.5}),ph('rechamber',20,{move:.6}),ph('active',3,{seg:1,a0:-.5,a1:.5}),ph('recovery',30)]}),
    bwfkick:D('bwfkick',['kick','cut'],{wk:1,dmg:13,pdmg:12,hs:4,stun:20,kb:.8,reach:2.7,w:.14,phases:[ph('startup',24,{move:.5}),ph('active',4,{seg:0,a0:1.2,a1:-1.2}),ph('recovery',30)]}),
    bwfspin:D('bwfspin',['spin','cyclone'],{wk:1,dmg:16,pdmg:16,hs:5,stun:24,kb:1.5,reach:2.9,w:.14,phases:[ph('startup',26),ph('active',5,{seg:0,a0:2.3,a1:-2.3}),ph('recovery',34)]}),
    bwfdash:D('bwfdash',['dash','cut'],{dmg:10,pdmg:9,hs:4,stun:18,kb:.7,reach:2.5,w:.13,phases:[ph('startup',20,{move:3.4}),ph('active',4,{seg:0,a0:.5,a1:-.5}),ph('recovery',28)]}),
    bwfpunt:D('bwfpunt',['kick','cut'],{wk:1,dmg:2,pdmg:0,hs:1,stun:8,kb:.2,reach:2.5,w:.3,phases:[ph('startup',20,{move:.3}),ph('active',3,{seg:0,a0:.6,a1:-.6}),ph('recovery',28)]})};
  const IDS=Object.keys(M),FIDS=Object.keys(F);
  const CHAIN_GAP=24,EVADE_GAP=18,STRING=['bwjab','bwcross','bwhook','bwknee','bwroundk'],OPEN=['bwstep','bwlunge','bwslip'];
  const RANGE=1.7,RETURN_T=1500,DIS_CD=2400,DIS_GRACE=900,KICK_DIST=6,KICK_REACH=2.1,PICK_R=1.0,DROP_DIST=2.6;
  function light(ctx){
    const f=ctx.from;
    if(ctx.air&&!f)return 'bwdrop';
    if(ctx.guard&&!f)return 'bwpush';
    if(f){const i=STRING.indexOf(f);if(OPEN.indexOf(f)>=0)return f==='bwslip'?'bwhook':'bwcross';if(i>=0&&i<4)return STRING[i+1];return 'bwjab'}
    if(ctx.far)return 'bwlunge';
    if(ctx.adv)return 'bwstep';
    if(ctx.sinceDodge<=EVADE_GAP)return 'bwslip';
    if(ctx.chain>=1&&ctx.chain<=4)return STRING[ctx.chain];
    return 'bwjab'}
  function heavy(ctx){const f=ctx.from;
    if(f==='bwjab'||f==='bwcross'||OPEN.indexOf(f)>=0)return 'bwelbow';
    if(f==='bwhook')return 'bwupper';
    if(f==='bwknee')return 'bwspin';
    if(f==='bwroundk')return 'bwsweep';
    return null}
  // where a knocked weapon lands: DROP_DIST beside the victim, sideways to the line from the attacker (the side alternates with the tick so it is deterministic), clamped inside the ring
  function dropPoint(t,a,tick,arena){
    const dx=t.x-a.x,dz=t.z-a.z,L=Math.hypot(dx,dz)||1,ux=dx/L,uz=dz/L,s=(tick&1)?1:-1;
    return clamp(t.x+(-uz*s*.8+ux*.6)*DROP_DIST,t.z+(ux*s*.8+uz*.6)*DROP_DIST,arena)}
  function clamp(x,z,A){if(!A)return{x,z};const ax=x-A.x,az=z-A.z,d=Math.hypot(ax,az),lim=A.R-1.1;return d>lim?{x:A.x+ax/d*lim,z:A.z+az/d*lim}:{x,z}}
  function punt(w,a,arena){const p=clamp(w.x+Math.sin(a.face)*KICK_DIST,w.z+Math.cos(a.face)*KICK_DIST,arena);return p}
  function install(MV){if(!MV)return;for(const k of IDS)MV[k]=M[k];for(const k of FIDS)MV[k]=F[k];
    // every PERILOUS strike that hurts (not the floor bursts) can knock a weapon out of the hand, see CombatCore (the victim's DIS_CD gate keeps it a set piece, not a nuisance)
    if(MV.PERILOUS)for(const id of MV.PERILOUS){const m=MV[id];if(m&&m.dmg>0&&!m.fx)m.dis=1}}
  if(typeof Moves!=='undefined')install(Moves);
  const Combos={light,heavy,CHAIN_GAP,EVADE_GAP,IDS:IDS.filter(k=>k!=='bwwrench')};
  return{M,F,IDS,FIDS,STRING,Combos,light,heavy,install,dropPoint,punt,clamp,CHAIN_GAP,EVADE_GAP,RANGE,RETURN_T,DIS_CD,DIS_GRACE,KICK_DIST,KICK_REACH,PICK_R,DROP_DIST}})();
if(typeof module!=='undefined')module.exports=Brawl;
