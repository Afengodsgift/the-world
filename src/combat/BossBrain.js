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
  // OVERLAY brains for the older bosses: they keep their gunman AI and only take over while an attack is running (o.act). The rest of the time o.act is false.
  // SHERIFF: reads your last 3 dodge directions (b.dodges, fed by the game) and, on a quick-draw, fires a volley at where you are going to be. The tell is a 0.7 s stop + laser; the recover is a window.
  function sheriff(b,i,dt){base(b);b.t-=dt;b.cool=(b.cool===undefined?4:b.cool)-dt;const o={act:false,go:0,side:0,sp:1,st:'aim',shoot:false,dmg:1,cd:.22,vuln:false,inv:false,aim:0,ev:[]},ph=phase(b,i,o);
    if(ph===3&&!b.dep){b.dep=1;o.ev.push('deputies')}
    const dd=b.dodges||[],sum=dd.reduce((a,c)=>a+c,0);o.aim=dd.length>=2?(sum>0?1:sum<0?-1:0):0;
    switch(b.s){
      case 'advance':if(b.cool<=0&&i.seen&&i.ready&&i.d>8&&i.d<i.range){b.s='tell';b.t=ph===1?.8:.6;o.ev.push('draw')}break;
      case 'tell':o.act=true;o.sp=0;if(b.t<=0){b.s='volley';b.t=ph===1?.7:ph===2?.9:1.1;b.sw=0}break;
      case 'volley':o.act=true;o.sp=.2;o.shoot=i.seen;o.dmg=1.2;if(b.t<=0){b.s='recover';b.t=.9}break;
      case 'recover':o.act=true;o.sp=0;o.st='vent';o.vuln=true;if(b.t<=0){b.s='advance';b.cool=ph===1?7:ph===2?5:3.5}break}
    return o}
  // WARLORD: past 66% he adds a CHARGE (tell -> bull rush -> exposed recover); under 33% it is his LAST STAND: charges come faster and he stays on you.
  function warlord(b,i,dt){base(b);b.t-=dt;b.cool=(b.cool===undefined?6:b.cool)-dt;const o={act:false,go:0,side:0,sp:1,st:'aim',shoot:false,dmg:1,cd:.12,vuln:false,inv:false,ev:[]},ph=phase(b,i,o);
    switch(b.s){
      case 'advance':if(ph>=2&&b.cool<=0&&i.seen&&i.ready&&i.d>7&&i.d<28){b.s='tell';b.t=.85;o.ev.push('rev')}break;
      case 'tell':o.act=true;o.sp=0;if(b.t<=0){b.s='charge';b.t=.75;b.pn=0}break;
      case 'charge':o.act=true;o.sp=3.1;o.go=1;o.st='run';if(i.d<2.8&&!b.pn){b.pn=1;o.ev.push('strike')}if(b.t<=0){b.s='recover';b.t=ph===3?1:1.5}break;
      case 'recover':o.act=true;o.sp=0;o.st='vent';o.vuln=true;if(b.t<=0){b.s='advance';b.cool=ph===3?5:9}break}
    return o}
  // CYCLE bosses (Undertaker, Madame Vulture, Railroad Baron, The Stranger): the gunman AI runs between attacks; every cool[phase] seconds, when d is in [dmin,dmax], one attack runs
  // advance -> TELL (rooted, st aim) -> ACT (slam / dash / charge / snap shot) -> RECOVER (vulnerable). Phase 2 and 3 each call reinforcements once (summon) and shorten the cooldown.
  const CY={
    undertaker:{tell:.95,act:.2,rec:1.7,cool:[6,4.5,3],dmin:0,dmax:8,tellEv:'rev',actEv:'slam',actSp:0,go:0,sum:{2:'summon',3:'summon'}},
    vulture:{tell:.5,act:.6,rec:1.0,cool:[5,3.5,2.5],dmin:6,dmax:26,tellEv:'rattle',actSp:3.2,go:1,contact:1,sum:{2:'summon'}},
    baron:{tell:1.05,act:1.0,rec:1.9,cool:[8,6,4.5],dmin:8,dmax:32,tellEv:'rev',actSp:2.6,go:1,contact:1,sum:{2:'summon'},tellEv3:'barrage'},
    duelist:{tell:.6,act:.12,rec:.7,cool:[3.6,3.6,3.6],dmin:7,dmax:30,tellEv:'draw',actSp:0,go:0,shoot:1,dmgK:[2.2,2.2,2.2],blink:[0,0,0],sum:{}},
    bruiser:{tell:.55,act:.7,rec:1.3,cool:[4,4,4],dmin:4,dmax:18,tellEv:'rev',actSp:2.4,go:1,contact:1,sum:{}},
    stranger:{tell:.9,act:.14,rec:.75,cool:[4.2,3,2.1],dmin:8,dmax:38,tellEv:'draw',actSp:0,go:0,shoot:1,dmgK:[2.6,3,3.4],blink:[0,1,1],sum:{3:'summon'}}};
  function cycle(kind,b,i,dt){const c=CY[kind];base(b);b.t-=dt;b.cool=(b.cool===undefined?c.cool[0]*.7:b.cool)-dt;
    const o={act:false,go:0,side:0,sp:1,st:'aim',shoot:false,dmg:1,cd:.1,vuln:false,inv:false,ev:[]},ph=phase(b,i,o);if(o.ev.length&&c.sum[ph])o.ev.push(c.sum[ph]);
    switch(b.s){
      case 'advance':if(b.cool<=0&&i.seen&&i.ready&&i.d>=c.dmin&&i.d<=c.dmax){b.s='tell';b.t=c.tell*(ph===3?.8:1);o.ev.push(ph===3&&c.tellEv3?c.tellEv3:c.tellEv)}break;
      case 'tell':o.act=true;o.sp=0;if(b.t<=0){b.s='act';b.t=c.act*(c.shoot&&ph===3?2:1);b.pn=0;if(c.actEv)o.ev.push(c.actEv)}break;
      case 'act':o.act=true;o.sp=c.actSp;o.go=c.go;o.st=c.go?'run':'aim';if(c.shoot){o.shoot=i.seen;o.dmg=c.dmgK[ph-1]}
        if(c.contact&&i.d<2.8&&!b.pn){b.pn=1;o.ev.push('strike')}if(b.t<=0){b.s='recover';b.t=c.rec;if(c.blink&&c.blink[ph-1])o.ev.push('blink')}break;
      case 'recover':o.act=true;o.sp=0;o.st='vent';o.vuln=true;if(b.t<=0){b.s='advance';b.cool=c.cool[ph-1]}break}
    return o}
  const brains={grady,jake,sheriff,warlord,undertaker:(b,i,d)=>cycle('undertaker',b,i,d),vulture:(b,i,d)=>cycle('vulture',b,i,d),baron:(b,i,d)=>cycle('baron',b,i,d),stranger:(b,i,d)=>cycle('stranger',b,i,d),duelist:(b,i,d)=>cycle('duelist',b,i,d),bruiser:(b,i,d)=>cycle('bruiser',b,i,d)};
  function step(kind,b,i,dt){return brains[kind](b,i,dt)}
  return {step,phaseOf,kinds:Object.keys(brains)};
})();
