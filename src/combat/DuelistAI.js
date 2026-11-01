// WARDEN M1d: the foes' brain (The Duelist + The Hollow Warden). Pure + deterministic (seeded; no THREE/DOM/Math.random), one decision per sim tick, returns the foe's command for that tick.
// FAIR by construction: it only sees what a human sees (the player's visible state: acting/guarding/stunned/dodging, distance), it reacts after a human-sized delay, it can only start a move while free
// (so every move keeps its >=20-tick tell and >=20-tick uncancellable recovery from Moves.js - nothing here can shorten them) and it rests >=20 ticks between moves.
// PRESSURE (so running away is not a strategy): foes run faster than you walk (D.spd, set by the game), always close to the reach of the move they want, and open from range with a gap closer
// (Duelist: dash, Hollow Warden: leap) which has its own long tell + long recovery. They breathe: every 3-5 moves they back off for ~1.5 s (the Isshin "coast then spike" rhythm), and below 50% health
// they enter a second phase (faster, shorter rests, more gap closers). Moods (Duelist) vary the pacing; a turtling guard is punished; a visibly recovering player is punished.
// Adaptive difficulty (learning your habits) is a separate layer, off by default, and is NOT in this file.
const DuelistAI=(()=>{
  const REACH={bladestorm:16,swordring:3.4,sunvolley:18,snakelash:3.8,eclipse:7.6,charge:10,maul:3.2,tidal:6.4,spores:12,hundred:3.2,ashwave:16,crossflame:16,kingsfall:7,flurry:3,cut:2.3,fall:2.6,thrust:3.2,twin:2.3,riposte:2.4,dash:2.4,leap:3.0,bash:2.3,orb:12,bolt:16,spin:2.9,hammer:2.7,lowsweep:3.1,blink:30,snare:30,lance:20,returning:18,consecrate:12,procession:11,march:2.7,groundbreaker:3.9,verdict:2.8,pursuit:3.1,iai:3.4,feint:3.4,moon:3.7,counter:2.9,requiem:5.2},REACT=14,INTRO=90;
  const HR={sweep:3.0,slam:3.0,triple:2.8,quake:4.2};
  function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  function create(seed,o){o=o||{};const r=mulberry(seed|0);return{foe:o.foe||'duelist',kid:o.kid||'',noAtk:false,gcool:0,r,t:0,cool:0,see:0,seenKey:'',strafe:1,strafeT:60,guardT:0,rip:0,gP:0,mood:'patient',moodT:90,last:[],intro:o.intro===undefined?INTRO:o.intro,on:true,log:null,
    bcd:240,scd:100,hcd:0,hcd2:0,hunt:false,follow:null,adaptCd:0,adapt:null,ph3:false,att:0,ccd:300,rcd:0,chain:0,moves:0,nextBreath:3+Math.floor(r()*3),breath:0,ph2:false,closeP:0}}
  const key=P=>P.act==='attack'&&P.ph&&P.ph[P.pi]?'a'+P.ph[P.pi].k:P.act==='stun'?'stun':P.act==='dodge'?'dodge':P.act==='charge'?'charge':P.guard?'guard':'free';
  const rest=(A,lo,span)=>Math.max(20,Math.floor((lo+Math.floor(A.r()*span))*(A.ph3?.58:A.ph2?.75:1)));
  // A = ai state, P/D = sim fighters, evs = events of the previous tick. Returns {face,mx,mz,list}
  function think(A,P,D,evs,tick){
    const out={face:Math.atan2(P.x-D.x,P.z-D.z),mx:0,mz:0,list:[]};A.t++;
    if(!A.on||D.act==='dead'||P.act==='dead')return out;
    const dx=P.x-D.x,dz=P.z-D.z,rawD=Math.hypot(dx,dz),dist=rawD/(D.rm||1),ux=dx/(rawD||1),uz=dz/(rawD||1),st=A.foe,H=st==='hollow'||st==='beast',BK=st==='blackknight',KN=st==='knight'||BK,DA=st==='dancer',SO=st==='soldier',AR=st==='archer',SK=st==='stalker',TR=st==='trapper',SM=st==='samurai'||st==='veil'||st==='gwyn',GW=st==='gwyn',GD=st==='gdn',VL=st==='veil',PN=st==='penitent',SN=st==='saint';
    // what the player visibly does now, and how long we have been seeing it (a human reaction delay)
    const k=key(P);if(k!==A.seenKey){A.seenKey=k;A.see=0}else A.see++;
    A.gP=P.guard&&P.act==='free'?A.gP+1:0;if(A.cool>0)A.cool--;if(A.gcool>0)A.gcool--;if(A.rip>1)A.rip--;if(A.breath>0)A.breath--;if(A.bcd>0)A.bcd--;if(A.scd>0)A.scd--;if(A.hcd>0)A.hcd--;
    if(!A.ph2&&D.hp<D.hpMax*.5)A.ph2=true;if((SM||GD)&&!A.ph3&&D.hp<D.hpMax*(GD?.25:.22)){A.ph3=true;A.ph2=true;A.rcd=0;A.req=true}   // Kage has a third phase
    if(VL)veilTally(A,P,k,tick);if(A.hcd2>0)A.hcd2--;if(GD){if(A.rcd>0)A.rcd--}if(GW){if(A.wcd>0)A.wcd--;if(A.kcd>0)A.kcd--}if(SM){if(A.adaptCd>0)A.adaptCd--;if(A.ccd>0)A.ccd--;if(A.rcd>0)A.rcd--;if((k==='astartup'||k==='aactive'||k==='acharge')&&dist<3.4)A.att++;else A.att=Math.max(0,A.att-.5)}                                 // second phase: the game announces it by reading A.ph2
    for(const e of evs||[])if((e.t==='block'||e.t==='deflect')&&e.d===D.id&&A.rip===0)A.rip=REACT;   // we just blocked something: counter-attack soon
    if(D.act!=='free'){A.busy=true;return out}
    if(A.busy){A.busy=false;A.moves++;
      A.cool=H?rest(A,30,45):A.mood==='aggro'?rest(A,20,20):A.mood==='evasive'?rest(A,40,60):rest(A,30,60);   // rest after every move or stagger: >= 20 ticks
      if(A.moves>=A.nextBreath){A.moves=0;A.nextBreath=3+Math.floor(A.r()*3);A.breath=70+Math.floor(A.r()*50);A.cool=Math.max(A.cool,A.breath)}}
    if(--A.moodT<=0){const q=A.r();A.mood=q<.34?'aggro':q<.68?'patient':'evasive';A.moodT=140+Math.floor(A.r()*220)}   // he changes his temper every few seconds so the pacing is never the same
    // guard handling
    if(D.guard){
      if(KN&&A.rip===1&&dist<REACH.bash+.3){A.rip=0;return start(A,out,'bash',0,tick)}                      // a blocked blow is answered with the shield: the bash also cracks YOUR guard
      if(--A.guardT<=0){out.list.push({t:'guardUp',e:tick});A.gcool=70+Math.floor(A.r()*60)}
      else{if(KN){out.mx=dist>1.9?ux*.9:-uz*A.strafe*.4;out.mz=dist>1.9?uz*.9:ux*A.strafe*.4}else{out.mx=0;out.mz=0}return out}}
    if(--A.strafeT<=0){A.strafe=A.r()<.5?-1:1;A.strafeT=70+Math.floor(A.r()*90)}
    // ---- movement: breathing = back off; otherwise close to the fighting distance (full speed when far), then circle ----
    const want=SN?(A.ph2?5.6:6.6):PN?(A.ph2?1.5:1.8):SM?(A.ph2?1.9:2.3):AR?(A.ph2?9:10.5):TR?(A.ph2?6:7.2):SK?(A.ph2?1.5:1.8):H?2.3:DA?4.2:SO?1.9:KN?(A.ph2?1.8:2.1):A.mood==='aggro'?1.6:A.mood==='evasive'?3.0:2.1;let mx=0,mz=0;
    if(A.breath>0&&A.t>A.intro){if(dist<4){mx=-ux*.8;mz=-uz*.8}else{mx=-uz*A.strafe*.4;mz=ux*A.strafe*.4}}
    else if(dist>want+.5){const f=dist>7?1:.85;mx=ux*f;mz=uz*f}else if(dist<want-.6){mx=-ux*.7;mz=-uz*.7}else{mx=-uz*A.strafe*.55;mz=ux*A.strafe*.55}
    out.mx=mx;out.mz=mz;
    if(A.t<=A.intro)return out;                       // the fight has not started yet: just square up
    if(A.breath>0)return out;                         // catching his breath: no attacks, the player may heal stamina / reposition
    // riposte after a block/deflect (Duelist)
    if(!H&&!KN&&!SO&&A.rip===1&&dist<REACH.riposte+.3){A.rip=0;return start(A,out,'riposte',0,tick)}
    // defence (Duelist): after reacting to a visible heavy charge / wind-up at close range, sometimes guard it
    // the Knight's shield wall (phase 1 only: at half health the shield is gone): raise it against a visible attack, or just sit behind it for a while
    if(KN&&!BK&&!A.ph2&&A.gcool<=0&&dist<3.6&&((k==='astartup'||k==='charge')&&A.see>=REACT-4||k==='free'&&A.r()<.006)){A.guardT=45+Math.floor(A.r()*40);out.list.push({t:'guardDown',e:tick});out.mx=out.mz=0;return out}
    if(!H&&!KN&&!DA&&!SO&&!SK&&!TR&&!SM&&!PN&&!SN&&!GD&&A.cool<=6&&dist<2.8&&(k==='charge'||k==='astartup')&&A.see>=REACT&&A.r()<.012*A.see){A.guardT=40+Math.floor(A.r()*25);out.list.push({t:'guardDown',e:tick});out.mx=out.mz=0;return out}
    if(A.cool>0||k==='dodge')return out;              // resting, or the player is mid-dodge: wait for them to land
    if(A.noAtk)return out;                            // someone else holds the attack token: keep circling
    if(SO)return soldier(A,P,D,out,tick,dist,k);
    if(DA)return dancer(A,P,D,out,tick,dist,k);
    if(AR)return archer(A,P,D,out,tick,dist,k);
    if(SN)return saint(A,P,D,out,tick,dist,k);
    if(PN)return penitent(A,P,D,out,tick,dist,k);
    if(VL){const r=veil(A,P,D,out,tick,dist,k);if(r)return r}
    if(GW)return gwyn(A,P,D,out,tick,dist,k);
    if(GD)return gdn(A,P,D,out,tick,dist,k);
    if(SM)return samurai(A,P,D,out,tick,dist,k);
    if(SK)return stalker(A,P,D,out,tick,dist,k);
    if(TR)return trapper(A,P,D,out,tick,dist,k);
    // ---- gap closer: from range, sometimes lunge in instead of just running (never twice in a row) ----
    const gc=H?'leap':'dash',lo=H?3.6:3.4,hi=H?8:7;   // (soldiers and dancers returned above)
    if(dist>=lo&&dist<=hi&&A.last[A.last.length-1]!==gc){A.closeP+=A.ph2?.05:.03;if(A.r()<A.closeP){A.closeP=0;return start(A,out,gc,0,tick)}}
    if(dist<lo)A.closeP=0;
    if(H)return hollow(A,P,D,out,tick,dist,k);
    if(BK)return blackknight(A,P,D,out,tick,dist,k);
    if(KN)return knight(A,P,D,out,tick,dist,k);
    if(A.mood==='evasive'&&dist<2.4&&k!=='arecovery'&&k!=='stun'&&A.gP<=30){out.mx=-ux*.8;out.mz=-uz*.8;return out}   // baiting: back off to thrust range instead of trading
    if(dist>REACH.thrust+.2)return out;              // too far to do anything but close in
    // pick a move
    const w=A.mood==='aggro'?{cut:3,twin:3,thrust:1.2,fall:2}:A.mood==='evasive'?{cut:1,twin:.6,thrust:5,fall:1}:{cut:3,twin:2,thrust:2,fall:1.5};
    const L0=A.last[A.last.length-1];if(A.mood==='aggro'&&L0==='cut'){w.twin*=2;w.thrust*=1.5}else if(L0==='thrust'){w.cut*=1.6;w.fall*=1.4}else if(L0==='twin'){w.fall*=1.8}else if(L0==='dash'){w.cut*=1.8;w.twin*=1.5}
    if(dist>2.7){w.cut=0;w.twin=0;w.fall=0;w.thrust=4}else if(dist<1.7){w.thrust=.2}
    if(A.gP>30){w.fall+=4;w.thrust+=2;w.cut*=.4;w.twin*=.4}                                   // you are turtling: make the guard pay
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.cut+=4;w.twin+=2;w.fall*=.3;w.thrust*=.5} // visibly recovering: punish
    return choose(A,out,w,dist,tick,REACH)}
  // The Hollow Warden: a heavy brute. Three moves (sweep / slam with a variable hold / triple chain) + the leap. Closes to reach, never idles at range.
  function hollow(A,P,D,out,tick,dist,k){
    if(dist>HR.sweep+.2&&!(A.foe==='beast'&&dist<=11&&(A.kid==='bear'||A.kid==='parasite'||A.kid==='maw')))return out;
    const w={sweep:3,triple:2.5,slam:2};
    if(A.ph2){w.triple+=1.5;w.slam+=1}
    if(A.gP>30){w.slam+=4;w.sweep*=.5}
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.sweep+=3;w.triple+=2;w.slam*=.4}
    if(dist<1.8)w.slam*=.5;
    if(A.foe==='beast'&&A.kid==='bear'){if(A.ph2)w.maul=2.4;if(dist>=5&&dist<=11&&A.bcd<=0&&A.last[A.last.length-1]!=='charge'){A.bcd=A.ph2?210:330;return start(A,out,'charge',0,tick)}}   // Frenzy Charge from range; the berserk maul in phase 2
    if(A.foe==='beast'&&A.kid==='maw'&&dist<7&&A.scd<=0){A.scd=A.ph2?300:460;return start(A,out,'tidal',0,tick)}                                                              // Tidal Roar on a timer
    if(A.foe==='beast'&&A.kid==='parasite'&&dist>=3&&dist<=11&&A.scd<=0){A.scd=A.ph2?280:430;return start(A,out,'spores',0,tick)}                                           // Infestation on a timer
    if(A.foe==='beast'&&dist<4)w.quake=A.ph2?2.6:1.3;                                          // the roar-stomp ring (a real monster's area move)
    const L0=A.last[A.last.length-1];if(L0==='leap'){w.sweep*=1.8;w.triple*=1.5}
    return choose(A,out,w,dist,tick,Object.assign({},REACH,HR))}
  // A foot soldier: two honest moves, no tricks. Many of them is the difficulty, not any one of them.
  function soldier(A,P,D,out,tick,dist,k){
    if(dist>REACH.thrust+.2)return out;
    const w={cut:3,thrust:1.6};if(dist>2.7){w.cut=0}else if(dist<1.7)w.thrust=.3;
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.cut+=3}
    return choose(A,out,w,dist,tick,REACH)}
  // The Oathbound Knight: patient behind the shield (see the guard code in think), then a heavy, honest mix. Gap closers from range; at half health the shield is gone and the quake-stomp joins.
  function knight(A,P,D,out,tick,dist,k){
    if(A.foe==='knight'&&A.kid==='paladin'){   // Judgment Verdict (a guard-breaking overhead that lands on a different beat each time) and the Shield Rush gap closer
      if(A.follow){const m=A.follow;A.follow=null;if(dist<REACH[m]+.8)return start(A,out,m,m==='verdict'?Math.floor(A.r()*13):0,tick)}
      if(A.bcd<=0&&dist>=4&&dist<=8&&A.last[A.last.length-1]!=='pursuit'){A.bcd=A.ph2?220:340;A.follow=A.r()<.5?'verdict':null;return start(A,out,'pursuit',0,tick)}
      if(A.gP>20&&dist<3.1&&A.last[A.last.length-1]!=='verdict')return start(A,out,'verdict',Math.floor(A.r()*13),tick)}   // turtling behind your guard: the Wall Breaker
    const gc=A.ph2&&A.last[A.last.length-1]!=='leap'&&dist>=3.6&&dist<=7&&A.r()<.05?'leap':null;if(gc)return start(A,out,gc,0,tick);
    if(dist>REACH.thrust+.2)return out;
    if(A.foe==='blackknight'&&A.ph2&&A.scd<=0&&dist<=3.4&&A.last[A.last.length-1]!=='flurry'&&A.r()<.07){A.scd=330;return start(A,out,'flurry',0,tick)}   // Artorias' Waterfowl dance (phase 2)
    const w={cut:3,thrust:2,twin:2,fall:1.2,bash:.6};
    if(A.gP>20){w.bash+=4;w.fall+=2.5;w.cut*=.3;w.twin*=.4}                                    // you hide behind your own guard: he breaks it
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.cut+=4;w.twin+=2.5;w.fall*=.4}              // a visibly recovering player is punished
    if(A.ph2){w.twin+=1.5;w.fall+=1;if(dist<3.6)w.quake=1.4}
    if(dist>2.7){w.cut=0;w.twin=0;w.bash=0;w.fall*=.5}else if(dist<1.7){w.thrust=.2}
    const pick=choose(A,out,w,dist,tick,Object.assign({},REACH,HR)),m=pick.list[pick.list.length-1];if(A.kid==='paladin'&&m&&m.m==='twin')A.follow=A.r()<(A.ph2?.5:.3)?'verdict':null;return pick}
  // The Black Knight: no shield, a relentless blade. Combos that end in a low sweep or a spin, a hammer blow on turtles, a riposte on anything he blocks, dash openers; in phase 2 the leap and the quake join and he rests less.
  function blackknight(A,P,D,out,tick,dist,k){
    const L0=A.last[A.last.length-1];
    if(A.ph2&&L0!=='leap'&&dist>=3.6&&dist<=7&&A.r()<.06)return start(A,out,'leap',0,tick);
    if(dist>REACH.thrust+.2)return out;
    const w={cut:3,twin:2.4,thrust:1.4,spin:1.1,lowsweep:1.5,riposte:.5,fall:.8};
    if(A.gP>20){w.hammer=4.5;w.bash=2.5;w.lowsweep+=2;w.cut*=.3;w.twin*=.4;w.spin*=.5}                       // you turtle: the hammer blow cracks guards, the low sweep ignores them
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.cut+=4;w.twin+=3;w.spin*=.3;w.lowsweep*=.4}             // a recovering player is punished with the fast combos
    if(A.ph2){w.spin+=1.6;w.twin+=1.4;w.fall+=1;w.hammer=(w.hammer||0)+1;if(dist<3.6)w.quake=1.2}
    if(dist>2.7){w.cut=0;w.twin=0;w.bash=0;w.riposte=0;w.spin=0;w.hammer=0;w.fall*=.5}else if(dist<1.7){w.thrust=.2;w.lowsweep*=.6}
    return choose(A,out,w,dist,tick,Object.assign({},REACH,HR))}
  // The Cinder Dancer: keeps ~4 m away and casts, closes with a flip-kick gap closer, and trades combos only when you are inside her space.
  function dancer(A,P,D,out,tick,dist,k){
    const L0=A.last[A.last.length-1];
    if(A.ph2&&A.scd<=0&&dist<=9){if(dist<4.4&&L0!=='requiem'){A.scd=400;return start(A,out,'requiem',0,tick)}if(dist>=3&&L0!=='consecrate'){A.scd=480;return start(A,out,'consecrate',0,tick)}}   // phase 2: the Ring of Fire around her, and the Cinder Waltz (rings of fire where you stand)
    if(dist>=3.4&&dist<=9&&L0!=='dash'){A.closeP+=A.ph2?.045:.025;if(A.r()<A.closeP){A.closeP=0;return start(A,out,'dash',0,tick)}}
    if(dist<3.4)A.closeP=0;
    const w={};
    if(dist>3.6){w.orb=dist>6?3:1.2;w.bolt=3;if(A.ph2){w.orb+=1.5;w.bolt+=1}}
    else{w.cut=3;w.twin=2.4;w.thrust=dist>2.5?2.5:.6;w.riposte=1;w.spin=1.6;w.hammer=dist<2.8?1.8:0;w.lowsweep=1.6;if(A.ph2){w.spin+=1;w.lowsweep+=1}if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.twin+=3;w.fall=2}}
    for(const m of Object.keys(w)){const n=A.last.length;if(n>=2&&A.last[n-1]===m&&A.last[n-2]===m)w[m]=0;else if(n&&A.last[n-1]===m)w[m]*=.4}
    let tot=0;for(const m in w)tot+=w[m];if(tot<=0)return out;let r=A.r()*tot,pick=Object.keys(w)[0];for(const m in w){r-=w[m];if(r<=0){pick=m;break}}
    if(dist>REACH[pick]+.1)return out;
    return start(A,out,pick,0,tick)}
  // Vael, the Crimson Duelist: a hunter that never lets go. Fast chains (cut / twin / triple / thrust), spin and low sweep up close; from range, or when you turtle behind your guard, he BLINKS behind you
  // (a long dissolve + a ring on the ground, see Tricks.js) and cuts the moment he lands: `A.follow` is set by the game when he reappears. Phase 2: shorter blink cooldown, longer chains, he rests less.
  function stalker(A,P,D,out,tick,dist,k){
    if(A.follow){const m=A.follow;A.follow=null;if(dist<REACH[m]+.8)return start(A,out,m,0,tick)}
    const L0=A.last[A.last.length-1];
    if(A.hunt){A.hunt=false;A.hcd=300;if(dist>2.6&&L0!=='blink'){A.bcd=A.ph2?220:330;return start(A,out,'blink',0,tick)}if(dist<=REACH.thrust)return start(A,out,'thrust',0,tick)}   // you drank a flask: he is on you
    if(A.bcd<=0&&L0!=='blink'&&(dist>=3.6&&dist<=10||A.gP>25&&dist<3.2)){A.closeP+=A.ph2?.09:.05;if(A.r()<A.closeP||A.gP>40){A.closeP=0;A.bcd=A.ph2?220:330;return start(A,out,'blink',0,tick)}}
    if(dist>=3.6&&dist<=10&&L0!=='dash'){return out}
    if(dist>REACH.thrust+.2)return out;
    const w={cut:3,twin:2.6,triple:1.8,thrust:1.4,spin:1.1,lowsweep:1.2,fall:.9};
    if(L0==='cut')w.twin*=1.8;else if(L0==='twin'){w.triple*=1.8;w.fall*=1.4}else if(L0==='blink'){w.cut*=1.5}
    if(A.gP>20){w.fall+=3;w.lowsweep+=2.5;w.cut*=.3;w.twin*=.4}
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.cut+=4;w.twin+=3;w.triple+=2;w.spin*=.3}
    if(A.ph2){w.triple+=1.6;w.spin+=1.2;w.twin+=1}
    if(dist>2.7){w.cut=0;w.twin=0;w.triple=0;w.spin=0;w.fall*=.5}else if(dist<1.7){w.thrust=.2}
    return choose(A,out,w,dist,tick,REACH)}
  // The Veil Dancer (Three Oaths): Kage's duelling toolkit plus ADAPTATION. She tallies what you keep doing (dodging, guarding, charging heavies, spamming lights) and, once one habit clearly dominates, sometimes answers it
  // with a readable counter-tool (delayed strike / guard punisher / counter draw / wide crescent). Borrowed Motion: she answers your last attack with its own kind. A decoy is investigated before she commits. Fair: every answer is an existing move with its normal tell.
  function veilTally(A,P,k,tick){
    if(!A.hab){A.hab={d:0,g:0,h:0,l:0};A.habT=0;A.invest=0;A.lastP=null;A.lastPT=-999}
    if(A.see===0){if(k==='dodge')A.hab.d++;else if(k==='guard')A.hab.g++;else if(k==='acharge')A.hab.h++;else if(k==='astartup'){A.hab.l++;if(P.mv&&P.mv.id){A.lastP=P.mv.id;A.lastPT=tick}}}
    if(++A.habT>=420){A.habT=0;for(const h in A.hab)A.hab[h]*=.6}}
  function veil(A,P,D,out,tick,dist,k){
    if(A.cov&&!A.ph2)A.ph2=true;
    if(A.onDecoy){if(A.invest<50){A.invest++;out.mx=out.mz=0;return out}}else A.invest=0;          // she studies the shadow before committing to it
    if(A.cool>0||A.follow||A.req||A.hunt||dist>3.4||dist<.1)return null;
    const hs=Object.entries(A.hab).sort((a,b)=>b[1]-a[1]),top=hs[0],second=hs[1];
    if(top[1]>=4&&top[1]>=second[1]*1.6&&A.r()<.5&&A.adaptCd<=0){A.adaptCd=360;A.adapt=top[0];const m={d:'feint',g:'fall',h:'counter',l:'moon'}[top[0]];if(top[0]==='d')A.follow='iai';return start(A,out,m,m==='fall'?12:0,tick)}
    if(A.lastP&&tick-A.lastPT<150&&A.ph2&&A.r()<.4){const heavy=/heavy|rising|whirl/.test(A.lastP),m=heavy?'fall':/lunge|plunge|rush|advance/.test(A.lastP)?'iai':'twin';A.lastP=null;return start(A,out,m,m==='fall'?10:0,tick)}   // borrowed motion
    return null}
  // Kage, the Shadowflame Samurai: a duelist in three phases. I: deliberate (cut chains, the draw, a wide crescent, a delayed overhead on your guard). II (below half): the feint, the blink chain, the counter draw. III (below 22%): shorter rests, the final technique, everything chained.
  // Fair by the same rules as every foe: each strike keeps its tell; the counter draw only answers someone who has been swinging at him for over a second; the feint costs you stamina, not health.
  function samurai(A,P,D,out,tick,dist,k){
    if(A.follow){const m=A.follow;A.follow=null;if(dist<REACH[m]+.8)return start(A,out,m,m==='fall'?12:0,tick)}
    const L0=A.last[A.last.length-1];
    if(A.req&&dist<5){A.req=false;A.rcd=A.ph3?900:0;A.follow='moon';return start(A,out,'requiem',0,tick)}   // the last phase opens with the final technique (ring on the ground, then a crescent)
    if(A.hunt){A.hunt=false;A.hcd=300;if(dist>2.8&&L0!=='blink'){A.bcd=A.ph2?150:260;return start(A,out,'blink',0,tick)}if(dist<=REACH.iai)return start(A,out,'iai',0,tick)}
    if(A.bcd<=0&&L0!=='blink'&&(dist>=3.6&&dist<=10||A.gP>25&&dist<3.2)){A.closeP+=A.ph3?.16:A.ph2?.12:.06;if(A.r()<A.closeP||A.gP>40){A.closeP=0;A.bcd=A.cov?140:A.ph3?100:A.ph2?150:260;return start(A,out,'blink',0,tick)}}
    if(dist>=3.6&&dist<=10&&L0!=='iai'){if(A.ph2&&A.r()<.012)return start(A,out,'iai',0,tick);return out}
    if(dist>REACH.moon+.2)return out;
    if(A.ph3&&A.rcd<=0&&dist<5&&A.r()<.02){A.rcd=900;A.follow='moon';return start(A,out,'requiem',0,tick)}
    if(A.ph2&&A.ccd<=0&&A.att>=70&&dist<REACH.counter+.4){A.ccd=A.ph3?420:600;A.att=0;return start(A,out,'counter',0,tick)}   // you keep swinging at him: he waits for it
    const w={cut:3,twin:2.4,triple:1.2,iai:1.6,moon:.8,fall:.9,hundred:0};
    if(A.foe==='samurai'&&A.ph2&&A.hcd2<=0&&L0!=='hundred'&&dist<=3.2){w.hundred=A.ph3?2.6:1.5}
    if(L0==='cut')w.twin*=1.8;else if(L0==='twin'){w.triple*=2;w.fall*=1.5}else if(L0==='blink'){w.iai*=2}else if(L0==='moon')w.cut*=1.6;
    if(A.gP>20){w.fall+=3.5;w.moon+=2;w.cut*=.3;w.twin*=.4}                                      // the guard punisher: a heavy overhead for turtling
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.cut+=3;w.twin+=3;w.triple+=2}                  // you are recovering: punish it
    if(A.ph2){w.feint=L0==='feint'?0:1.5;w.moon+=1.2;w.triple+=1.3;w.iai+=.8}
    if(A.ph3){w.iai+=1.6;w.triple+=1.2;w.moon+=.6;w.feint=L0==='feint'?0:1.1}
    if(dist>2.7){w.cut=0;w.twin=0;w.triple=0;w.fall*=.4;if(dist>3.5){w.iai=0}}else if(dist<1.6){w.iai*=.3}
    const pick=choose(A,out,w,dist,tick,REACH);
    const m=pick.list[pick.list.length-1];if(m&&m.m==='hundred')A.hcd2=A.ph3?500:760;if(m&&m.m==='feint'){A.follow=A.r()<.62?'iai':'twin'}     // the empty sheath: sometimes the real draw follows, sometimes a quick pair
    if(m&&m.m==='fall')m.hold=A.ph2?8+Math.floor(A.r()*5):Math.floor(A.r()*13);                      // his overhead lands on a different beat each time
    return pick}
  // Gwyn, Lord of Cinder (a major boss): long waves from range, a leaping Kingsfall onto your mark, cuts that end in a guard-breaking Verdict, a Waterfowl-style flurry (phase 2), and the Last Fire at 22%: the Requiem ring then a rain of cinders.
  function gwyn(A,P,D,out,tick,dist,k){
    if(A.follow){const m=A.follow;A.follow=null;if(dist<REACH[m]+.8)return start(A,out,m,m==='verdict'?(A.ph2?6+Math.floor(A.r()*7):Math.floor(A.r()*13)):0,tick)}
    const L0=A.last[A.last.length-1];
    if(A.kid==='dknight'){   // the Dark Knight: blinks behind you into a chain (his own opening), spirit blades from range, perilous Hundred Shadows from phase 2, a Waterfowl flurry
      if(A.bcd<=0&&L0!=='blink'&&dist>=3.6&&dist<=10&&A.r()<(A.ph3?.045:A.ph2?.028:.012)){A.bcd=A.ph3?140:A.ph2?200:340;A.follow=A.ph2?(A.r()<.55?'hundred':'flurry'):'verdict';return start(A,out,'blink',0,tick)}
      if(A.scd<=0&&dist>=4&&dist<=11&&L0!=='bladestorm'&&L0!=='swordring'&&A.ph2){A.scd=A.ph3?240:340;return start(A,out,A.r()<.5&&dist<7?'swordring':'bladestorm',0,tick)}
      if(A.hcd<=0&&dist<=3.4&&L0!=='hundred'&&L0!=='flurry'&&A.ph2&&A.r()<.1){A.hcd=A.ph3?260:400;return start(A,out,A.r()<.5?'hundred':'flurry',0,tick)}}
    if(A.kid==='oath4'){   // the Unbroken Oath: all three oaths' arts on top of Gwyn's kit (Saint's blades from range, the Dancer's chain up close)
      if(A.scd<=0&&dist>=3.4&&dist<=11&&L0!=='bladestorm'&&L0!=='swordring'){A.scd=A.ph3?260:A.ph2?340:480;return start(A,out,A.ph2&&dist<6.5&&A.r()<.5?'swordring':'bladestorm',0,tick)}
      if(A.ph2&&A.hcd<=0&&dist<=3.6&&L0!=='hundred'){A.hcd=A.ph3?280:420;return start(A,out,'hundred',0,tick)}}
    if(A.req&&dist<6){A.req=false;A.rcd=900;A.follow='consecrate';return start(A,out,'requiem',0,tick)}
    if(A.hunt){A.hunt=false;A.hcd=300;if(dist>3.4)return start(A,out,'ashwave',0,tick);return start(A,out,'march',0,tick)}
    if(A.ph3&&A.rcd<=0&&dist<12&&A.r()<.015){A.rcd=A.ph3?700:900;return start(A,out,'consecrate',0,tick)}
    if(dist>7.5){
      if(A.wcd<=0&&L0!=='ashwave'&&L0!=='crossflame'){A.wcd=A.ph3?150:A.ph2?210:320;return start(A,out,A.ph2&&A.r()<.5?'crossflame':'ashwave',0,tick)}
      return out}
    if(dist>3.4){
      if(A.kcd<=0&&A.ph2&&dist<=7&&L0!=='kingsfall'){A.kcd=A.ph3?260:420;return start(A,out,'kingsfall',0,tick)}
      if(A.bcd<=0&&L0!=='pursuit'){A.bcd=A.ph3?160:A.ph2?230:320;return start(A,out,'pursuit',0,tick)}
      if(A.wcd<=0&&L0!=='ashwave'){A.wcd=A.ph3?150:210;return start(A,out,'ashwave',0,tick)}
      return out}
    const w={cut:2.6,twin:2.2,moon:.9,march:1.2,hammer:1.2,verdict:0};
    if(L0==='cut')w.twin*=1.8;else if(L0==='moon')w.cut*=1.5;
    if(A.onDecoy){w.cut=0;w.twin=0;w.moon=0;w.hammer=3.5;w.march=2}
    if(A.gP>20){w.hammer+=3.5;w.march+=2;w.cut*=.3}
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.cut+=3;w.twin+=3}
    if(A.ph2){w.flurry=L0==='flurry'?0:2.2;w.moon+=1;w.hammer+=.6}
    if(A.ph3){w.flurry=L0==='flurry'?0:3;w.moon+=.8}
    if(dist>2.6){w.cut=0;w.twin=0}
    const pick=choose(A,out,w,dist,tick,REACH),m=pick.list[pick.list.length-1];
    if(m&&m.m==='twin')A.follow=A.r()<(A.ph2?.75:.5)?'verdict':null;
    return pick}
  // Dark Sun Gwyndolin: a floating archer-sorceress. Arrow volleys and the slow Dark Sun orb from range, sun rings (consecrate / procession) in phase 2, and the Total Eclipse at 25% (a huge ring, then a rain of rings).
  // Get close and the tentacles lash (a ring round her) or she blinks away and answers from behind you. She never melees otherwise.
  function gdn(A,P,D,out,tick,dist,k){
    if(A.follow){const m=A.follow;A.follow=null;if(dist<REACH[m]+.8||REACH[m]>=12)return start(A,out,m,0,tick)}
    const L0=A.last[A.last.length-1];
    if(A.req&&dist<30){A.req=false;A.rcd=900;A.follow='consecrate';return start(A,out,'eclipse',0,tick)}
    if(A.hunt){A.hunt=false;A.hcd=300;return start(A,out,dist<4?'snakelash':'sunvolley',0,tick)}
    if(A.ph3&&A.rcd<=0&&A.r()<.012){A.rcd=A.ph3?700:900;return start(A,out,'eclipse',0,tick)}
    if(dist<3.8){
      if(A.scd<=0&&L0!=='snakelash'){A.scd=A.ph2?200:300;return start(A,out,'snakelash',0,tick)}
      if(A.bcd<=0&&L0!=='blink'){A.bcd=A.ph3?150:A.ph2?220:340;return start(A,out,'blink',0,tick)}
      if(dist<2.4)return start(A,out,'cut',0,tick);return out}
    if(A.bcd<=0&&L0!=='blink'&&dist<7&&(A.gP>20||A.r()<.01)){A.bcd=A.ph3?150:A.ph2?220:340;return start(A,out,'blink',0,tick)}
    const w={sunvolley:dist>6?3.2:1.8,orb:dist>5?1.6:.6,lance:1.2};
    if(A.ph2){w.consecrate=1.6;w.procession=1.2;w.sunvolley+=1;w.orb+=1}
    if(A.ph3){w.consecrate+=1;w.sunvolley+=1}
    if(A.onDecoy){w.consecrate=0;w.procession=0}
    if(A.gP>20||k==='stun'&&A.see>=REACT)w.consecrate=(w.consecrate||0)+3;
    return choose(A,out,w,dist,tick,REACH)}
  // The Veiled Saint (Three Oaths): area denial. She holds a distance, fires the Judgment Lance and the Returning blades, and lays CONSECRATION (five rings around you that erupt after a delay) and the Silent Procession (a line of rings walking out at you).
  // Signature moves wait for the token (A.sigLock); inside 2.6 m she pushes you off with a kick. Phase 2 (or the covenant breaking) shortens her rests and adds the procession.
  function saint(A,P,D,out,tick,dist,k){
    if(dist<2.6){A.closeP=0;if(A.scd<=0&&A.last[A.last.length-1]!=='swordring'){A.scd=A.ph2?220:320;return start(A,out,'swordring',0,tick)}return start(A,out,'cut',0,tick)}   // too close: her blades spin out round her, or she kicks
    if(A.hunt){A.hunt=false;A.hcd=300;if(!A.sigLock&&A.last[A.last.length-1]!=='consecrate')return start(A,out,'consecrate',0,tick);return start(A,out,'lance',0,tick)}   // you drank a flask: the ground answers
    if(A.cov&&!A.ph2)A.ph2=true;
    if(dist<3.4)return out;
    const w={lance:dist>6?3.2:1.6,returning:dist>5?1.8:.8,bladestorm:dist>4?(A.ph2?2.8:1.6):0,consecrate:A.sigLock?0:1.3,procession:A.ph2&&!A.sigLock?1.2:0};
    if(A.cov)w.consecrate+=A.sigLock?0:1.4;
    if(A.gP>20||k==='stun'&&A.see>=REACT)w.consecrate+=A.sigLock?0:3;                       // a turtling or staggered player is on the ground she controls
    if(A.onDecoy){w.consecrate=0;w.procession=0}                                          // a shadow is a target for her bolts only; the areas stay for you
    return choose(A,out,w,dist,tick,REACH)}
  // The Iron Penitent (Three Oaths): close-range pressure, never backs off. The Threefold Sentence = two quick cuts then the VERDICT, an overhead that lands on a different beat each time: deflect it and his guard breaks.
  // A.sigLock (set by the game while another oath foe is inside / just after a signature move) keeps him from starting verdict / groundbreaker at the same moment as his allies.
  function penitent(A,P,D,out,tick,dist,k){
    if(A.follow){const m=A.follow;A.follow=null;if(dist<REACH[m]+.8&&!(A.sigLock&&m==='verdict'))return start(A,out,m,m==='verdict'?(A.ph2?6+Math.floor(A.r()*7):Math.floor(A.r()*13)):0,tick)}
    const L0=A.last[A.last.length-1];
    if(A.hunt){A.hunt=false;A.hcd=300;if(dist>3.2)return start(A,out,'pursuit',0,tick);if(dist<=REACH.march)return start(A,out,'march',0,tick)}
    if(dist>4&&dist<=9&&L0!=='pursuit'&&A.bcd<=0){A.bcd=A.cov?130:A.ph2?200:300;return start(A,out,'pursuit',0,tick)}      // the gap closer
    if(dist>REACH.groundbreaker+.2)return out;
    const w={cut:2.6,twin:2.4,march:1.8,thrust:1.2,groundbreaker:1};
    if(A.onDecoy){w.cut=0;w.twin=0;w.thrust=0;w.march=3;w.groundbreaker=A.sigLock?0:3}                        // a shadow in front of him: he commits a heavy blow to it (and is open afterwards)
    if(A.cov==='veil'){w.groundbreaker+=A.sigLock?0:2.2;w.march+=1.5}                                      // the Dancer fell: he carries the oath alone, heavier
    if(A.sigLock){w.groundbreaker=0}
    if(L0==='cut')w.twin*=1.8;else if(L0==='pursuit'){w.cut*=2;w.march*=1.4}
    if(A.gP>20){w.groundbreaker+=A.sigLock?0:3.5;w.march+=2.5;w.cut*=.3}                                // the guard does not save you from him: the floor breaks, or he walks through
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.cut+=3;w.twin+=3.5}
    if(A.ph2){w.twin+=1.5;w.march+=1;w.groundbreaker+=A.sigLock?0:.8}
    if(dist>2.8){w.cut=0;w.twin=0;w.thrust=0}
    const pick=choose(A,out,w,dist,tick,REACH),m=pick.list[pick.list.length-1];
    if(m&&m.m==='twin')A.follow=A.r()<(A.ph2?.8:.6)?'verdict':null;                                     // the Threefold Sentence
    return pick}
  // Skrag, the Snare-Trapper: keeps his distance (7 m, 6 in phase 2), lays snares around you on a cooldown (they arm, then wait), shoots arrows, and when you are ROOTED in a snare he answers with the heavy bolt.
  // Get inside two and a half metres and he kicks you off; otherwise he backs away (movement above). Phase 2: more traps, faster cooldown, the heavy bolt joins the normal volley.
  function trapper(A,P,D,out,tick,dist,k){
    if(dist<2.5){A.closeP=0;return start(A,out,'cut',0,tick)}
    if(A.hunt){A.hunt=false;A.hcd=300;if(dist>=3.6&&A.last[A.last.length-1]!=='orb')return start(A,out,'orb',0,tick)}   // you drank a flask: the heavy bolt
    if(dist<3.6)return out;
    const w={};
    if(A.scd<=0&&A.last[A.last.length-1]!=='snare'){A.scd=A.ph2?330:480;return start(A,out,'snare',0,tick)}
    w.bolt=dist>5?4:1.8;if(A.ph2&&dist>5)w.orb=2;
    if(k==='stun'&&A.see>=4)w.orb=(w.orb||0)+16;                                         // the player is rooted or staggered: the heavy shot
    return choose(A,out,w,dist,tick,REACH)}
  // The Ashen Huntress (Erika): holds a long range and shoots slow, readable arrows (sidestep or block them); inside two metres she kicks you away; the player's answer is to close the gap in a dodge.
  function archer(A,P,D,out,tick,dist,k){
    if(dist<2.4){A.closeP=0;return start(A,out,'cut',0,tick)}
    if(A.ph2&&A.scd<=0&&dist>=5&&A.last[A.last.length-1]!=='consecrate'){A.scd=520;return start(A,out,'consecrate',0,tick)}   // Rain of Arrows (phase 2): marked circles around where you stand
    if(dist<4.5)return out;                            // too close to shoot, too far to kick: she is backing off (movement above)
    const w={bolt:dist>6?4:1.5};if(A.ph2&&dist>6)w.orb=2;   // phase 2: a slower, heavier shot joins
    return choose(A,out,w,dist,tick,REACH)}
  function choose(A,out,w,dist,tick,R){
    for(const m of Object.keys(w)){const L=A.last,n=L.length;if(n>=2&&L[n-1]===m&&L[n-2]===m)w[m]=0;else if(n&&L[n-1]===m)w[m]*=.4}
    let tot=0;for(const m in w)tot+=w[m];if(tot<=0)return out;
    let r=A.r()*tot,pick=Object.keys(w)[0];for(const m in w){r-=w[m];if(r<=0){pick=m;break}}
    if(dist>R[pick]+(pick==='thrust'?.2:.1))return out;                                      // not in reach of the chosen move yet: keep closing
    return start(A,out,pick,pick==='fall'||pick==='slam'?Math.floor(A.r()*13):0,tick)}
  function start(A,out,m,hold,tick){A.last.push(m);if(A.last.length>3)A.last.shift();out.list.push({t:'atk',m,hold,e:tick});out.mx=out.mz=0;return out}
  // the game calls this when the hunted player drinks a health flask: every foe ends its rest and stops breathing (at most once per 5 s each); Vael blinks onto you, Skrag fires the heavy bolt
  const hunt=(A)=>{if(A.hcd>0)return false;A.hcd=300;A.cool=Math.min(A.cool,6);A.breath=0;if(A.foe==='saint'||A.foe==='stalker'||A.foe==='trapper'||A.foe==='samurai'||A.foe==='veil'||A.foe==='penitent'||A.foe==='gwyn'||A.foe==='gdn')A.hunt=true;return true};   // everyone cuts their rest short; the hunters have a special answer
  return{create,think,hunt,REACH:Object.assign({},REACH,HR),REACT,INTRO}})();
if(typeof module!=='undefined')module.exports=DuelistAI;
