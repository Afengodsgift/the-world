// BossBrain: phase-based boss state machines from OUTLAW_ISLE_DESIGN_DOC.md. Every attack is telegraph -> commit -> recover, and the recover is the player's window.
// Pure logic (no THREE / DOM; tests/boss.sim.js). The game calls BossBrain.step(b, i, dt) each host tick and acts on the result.
//   b  per-boss state object (any fields; BossBrain owns b.s, b.t, b.heat, b.ph, b.fx)
//   i  {d: distance to target, seen, hp: hp fraction, range, ready: reaction timer done}
//   -> {go:-1..1 (toward target), side:-1..1 (strafe), sp:speed multiplier, st:'run'|'aim'|'vent'|'cloak'|'crouch'|'idle', shoot:bool, dmg:damage multiplier, cd:seconds between shots,
//       vuln:bool (extra damage taken), inv:bool (cannot be hurt), ev:[event names]}
const BossBrain=(()=>{
  const phaseOf=h=>h>.66?1:h>.33?2:3;
  function base(b){if(!b.s){b.s='advance';b.t=0;b.heat=0;b.ph=1;b.side=1;b.sw=0}}
  function phase(b,i,out){const p=phaseOf(i.hp);if(p>b.ph){b.ph=p;out.ev.push(p===2?'phase2':'phase3')}return b.ph}
  // GATLING GRADY: walks up, drops anchor (telegraph), spins up, fires while heat builds, OVERHEATS and vents (vulnerable). Phase 3 = Last Stand: no more retreating, shorter vents, harder fire.
  function grady(b,i,dt){base(b);b.t-=dt;const o={go:0,side:0,sp:1,st:'run',shoot:false,dmg:1,cd:.1,vuln:false,inv:false,ev:[]},ph=phase(b,i,o);
    const last=ph===3;o.dmg=ph===1?1:ph===2?1.15:1.35;o.cd=ph===1?.11:ph===2?.09:.075;
    if(o.ev.length&&b.s!=='vent'){b.s='reposition';b.t=ph===2?1.2:.6}    // a phase change breaks off the attack
    switch(b.s){
      case 'advance':o.go=1;if(i.seen&&i.ready&&i.d<i.range*.75&&i.d>4&&b.t<=0){b.s='deploy';b.t=last?.7:1.1;o.ev.push('rev')}if(i.d<3){b.s='reposition';b.t=1}break;
      case 'deploy':o.sp=0;o.st='aim';if(b.t<=0){b.s='fire';b.t=3.4;b.heat=0}break;                                         // anchor drop telegraph
      case 'fire':o.sp=last?.3:0;o.go=last?1:0;o.st='aim';o.shoot=i.seen;b.heat+=dt*(last?.2:ph===2?.3:.27);if(b.heat>=1||b.t<=0){b.s='vent';b.t=last?1.7:2.7;b.heat=0;o.ev.push('vent')}break;
      case 'vent':o.sp=0;o.st='vent';o.vuln=true;if(b.t<=0){b.s='reposition';b.t=last?.4:1.5}break;                          // overheated: the damage window
      case 'reposition':o.sp=last?.9:1.25;o.go=last?.8:(i.d<12?-.4:.5);o.side=b.side;b.sw-=dt;if(b.sw<=0){b.side=-b.side;b.sw=1.1}if(b.t<=0){b.s='advance';b.t=last?0:.6}break}
    o.heat=b.heat;return o}
  // RATTLESNAKE JAKE: cloaked stalker. Circles unseen, RATTLES (tell) and POUNCES, then is stuck recovering in the open. Phase 2 sends decoys, phase 3 feigns death once and rises enraged.
  function jake(b,i,dt){base(b);b.t-=dt;const o={go:0,side:0,sp:1,st:'cloak',shoot:false,dmg:1,cd:.9,vuln:false,inv:false,ev:[]},ph=phase(b,i,o);
    if(ph===3&&!b.fed){b.fed=1;b.s='feign';b.t=3.6;o.ev.push('feign')}
    if(ph===2&&!b.dec&&b.s==='stalk'){b.dec=1;o.ev.push('decoy')}
    switch(b.s){
      case 'advance':b.s='stalk';b.t=ph===1?2.4:1.6;break;
      case 'stalk':o.st='cloak';o.sp=1.15;o.go=i.d>10?.7:i.d<5?-.2:.1;o.side=b.side;b.sw-=dt;if(b.sw<=0){b.side=Math.random()<.5?-1:1;b.sw=1.4}
        if(b.t<=0&&i.d<12&&i.seen){b.s='tell';b.t=b.rage?.4:.6;o.ev.push('rattle')}break;
      case 'tell':o.sp=0;o.st='aim';if(b.t<=0){b.s='pounce';b.t=.42;b.pn=0;o.ev.push('lunge')}break;                      // visible, rattling: the dodge window
      case 'pounce':o.sp=3.4;o.go=1;o.st='run';if(i.d<2.2&&!b.pn){b.pn=1;o.ev.push('strike')}if(b.t<=0){if(b.rage&&(b.combo=(b.combo||0)+1)<3){b.s='tell';b.t=.35;o.ev.push('rattle')}else{b.combo=0;b.s='recover';b.t=b.rage?1:1.5}}break;
      case 'recover':o.sp=0;o.st='vent';o.vuln=true;if(b.t<=0){b.s='stalk';b.t=ph===1?2.2:1.4}break;
      case 'feign':o.sp=0;o.st='crouch';o.inv=true;if(b.t<=0){b.s='stalk';b.t=.8;b.rage=1;o.ev.push('rise')}break}
    return o}
  const brains={grady,jake};
  function step(kind,b,i,dt){return brains[kind](b,i,dt)}
  return {step,phaseOf,kinds:Object.keys(brains)};
})();
