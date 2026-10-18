// WARDEN M1d: the foes' brain (The Duelist + The Hollow Warden). Pure + deterministic (seeded; no THREE/DOM/Math.random), one decision per sim tick, returns the foe's command for that tick.
// FAIR by construction: it only sees what a human sees (the player's visible state: acting/guarding/stunned/dodging, distance), it reacts after a human-sized delay, it can only start a move while free
// (so every move keeps its >=20-tick tell and >=20-tick uncancellable recovery from Moves.js - nothing here can shorten them) and it rests >=20 ticks between moves.
// PRESSURE (so running away is not a strategy): foes run faster than you walk (D.spd, set by the game), always close to the reach of the move they want, and open from range with a gap closer
// (Duelist: dash, Hollow Warden: leap) which has its own long tell + long recovery. They breathe: every 3-5 moves they back off for ~1.5 s (the Isshin "coast then spike" rhythm), and below 50% health
// they enter a second phase (faster, shorter rests, more gap closers). Moods (Duelist) vary the pacing; a turtling guard is punished; a visibly recovering player is punished.
// Adaptive difficulty (learning your habits) is a separate layer, off by default, and is NOT in this file.
const DuelistAI=(()=>{
  const REACH={cut:2.3,fall:2.6,thrust:3.2,twin:2.3,riposte:2.4,dash:2.4,leap:3.0,bash:2.3,orb:12,bolt:16,spin:2.9,hammer:2.7,lowsweep:3.1},REACT=14,INTRO=90;
  const HR={sweep:3.0,slam:3.0,triple:2.8,quake:4.2};
  function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  function create(seed,o){o=o||{};const r=mulberry(seed|0);return{foe:o.foe||'duelist',noAtk:false,gcool:0,r,t:0,cool:0,see:0,seenKey:'',strafe:1,strafeT:60,guardT:0,rip:0,gP:0,mood:'patient',moodT:90,last:[],intro:o.intro===undefined?INTRO:o.intro,on:true,log:null,
    moves:0,nextBreath:3+Math.floor(r()*3),breath:0,ph2:false,closeP:0}}
  const key=P=>P.act==='attack'&&P.ph&&P.ph[P.pi]?'a'+P.ph[P.pi].k:P.act==='stun'?'stun':P.act==='dodge'?'dodge':P.act==='charge'?'charge':P.guard?'guard':'free';
  const rest=(A,lo,span)=>Math.max(20,Math.floor((lo+Math.floor(A.r()*span))*(A.ph2?.75:1)));
  // A = ai state, P/D = sim fighters, evs = events of the previous tick. Returns {face,mx,mz,list}
  function think(A,P,D,evs,tick){
    const out={face:Math.atan2(P.x-D.x,P.z-D.z),mx:0,mz:0,list:[]};A.t++;
    if(!A.on||D.act==='dead'||P.act==='dead')return out;
    const dx=P.x-D.x,dz=P.z-D.z,rawD=Math.hypot(dx,dz),dist=rawD/(D.rm||1),ux=dx/(rawD||1),uz=dz/(rawD||1),st=A.foe,H=st==='hollow'||st==='beast',KN=st==='knight',DA=st==='dancer',SO=st==='soldier',AR=st==='archer';
    // what the player visibly does now, and how long we have been seeing it (a human reaction delay)
    const k=key(P);if(k!==A.seenKey){A.seenKey=k;A.see=0}else A.see++;
    A.gP=P.guard&&P.act==='free'?A.gP+1:0;if(A.cool>0)A.cool--;if(A.gcool>0)A.gcool--;if(A.rip>1)A.rip--;if(A.breath>0)A.breath--;
    if(!A.ph2&&D.hp<D.hpMax*.5)A.ph2=true;                                 // second phase: the game announces it by reading A.ph2
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
    const want=AR?(A.ph2?9:10.5):H?2.3:DA?4.2:SO?1.9:KN?(A.ph2?1.8:2.1):A.mood==='aggro'?1.6:A.mood==='evasive'?3.0:2.1;let mx=0,mz=0;
    if(A.breath>0&&A.t>A.intro){if(dist<4){mx=-ux*.8;mz=-uz*.8}else{mx=-uz*A.strafe*.4;mz=ux*A.strafe*.4}}
    else if(dist>want+.5){const f=dist>7?1:.85;mx=ux*f;mz=uz*f}else if(dist<want-.6){mx=-ux*.7;mz=-uz*.7}else{mx=-uz*A.strafe*.55;mz=ux*A.strafe*.55}
    out.mx=mx;out.mz=mz;
    if(A.t<=A.intro)return out;                       // the fight has not started yet: just square up
    if(A.breath>0)return out;                         // catching his breath: no attacks, the player may heal stamina / reposition
    // riposte after a block/deflect (Duelist)
    if(!H&&!KN&&!SO&&A.rip===1&&dist<REACH.riposte+.3){A.rip=0;return start(A,out,'riposte',0,tick)}
    // defence (Duelist): after reacting to a visible heavy charge / wind-up at close range, sometimes guard it
    // the Knight's shield wall (phase 1 only: at half health the shield is gone): raise it against a visible attack, or just sit behind it for a while
    if(KN&&!A.ph2&&A.gcool<=0&&dist<3.6&&((k==='astartup'||k==='charge')&&A.see>=REACT-4||k==='free'&&A.r()<.006)){A.guardT=45+Math.floor(A.r()*40);out.list.push({t:'guardDown',e:tick});out.mx=out.mz=0;return out}
    if(!H&&!KN&&!DA&&!SO&&A.cool<=6&&dist<2.8&&(k==='charge'||k==='astartup')&&A.see>=REACT&&A.r()<.012*A.see){A.guardT=40+Math.floor(A.r()*25);out.list.push({t:'guardDown',e:tick});out.mx=out.mz=0;return out}
    if(A.cool>0||k==='dodge')return out;              // resting, or the player is mid-dodge: wait for them to land
    if(A.noAtk)return out;                            // someone else holds the attack token: keep circling
    if(SO)return soldier(A,P,D,out,tick,dist,k);
    if(DA)return dancer(A,P,D,out,tick,dist,k);
    if(AR)return archer(A,P,D,out,tick,dist,k);
    // ---- gap closer: from range, sometimes lunge in instead of just running (never twice in a row) ----
    const gc=H?'leap':'dash',lo=H?3.6:3.4,hi=H?8:7;   // (soldiers and dancers returned above)
    if(dist>=lo&&dist<=hi&&A.last[A.last.length-1]!==gc){A.closeP+=A.ph2?.05:.03;if(A.r()<A.closeP){A.closeP=0;return start(A,out,gc,0,tick)}}
    if(dist<lo)A.closeP=0;
    if(H)return hollow(A,P,D,out,tick,dist,k);
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
    if(dist>HR.sweep+.2)return out;
    const w={sweep:3,triple:2.5,slam:2};
    if(A.ph2){w.triple+=1.5;w.slam+=1}
    if(A.gP>30){w.slam+=4;w.sweep*=.5}
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.sweep+=3;w.triple+=2;w.slam*=.4}
    if(dist<1.8)w.slam*=.5;
    if(A.foe==='beast'&&dist<4)w.quake=A.ph2?2.6:1.3;                                          // the roar-stomp ring (a real monster's area move)
    const L0=A.last[A.last.length-1];if(L0==='leap'){w.sweep*=1.8;w.triple*=1.5}
    return choose(A,out,w,dist,tick,HR)}
  // A foot soldier: two honest moves, no tricks. Many of them is the difficulty, not any one of them.
  function soldier(A,P,D,out,tick,dist,k){
    if(dist>REACH.thrust+.2)return out;
    const w={cut:3,thrust:1.6};if(dist>2.7){w.cut=0}else if(dist<1.7)w.thrust=.3;
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.cut+=3}
    return choose(A,out,w,dist,tick,REACH)}
  // The Oathbound Knight: patient behind the shield (see the guard code in think), then a heavy, honest mix. Gap closers from range; at half health the shield is gone and the quake-stomp joins.
  function knight(A,P,D,out,tick,dist,k){
    const gc=A.ph2&&A.last[A.last.length-1]!=='leap'&&dist>=3.6&&dist<=7&&A.r()<.05?'leap':null;if(gc)return start(A,out,gc,0,tick);
    if(dist>REACH.thrust+.2)return out;
    const w={cut:3,thrust:2,twin:2,fall:1.2,bash:.6};
    if(A.gP>20){w.bash+=4;w.fall+=2.5;w.cut*=.3;w.twin*=.4}                                    // you hide behind your own guard: he breaks it
    if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.cut+=4;w.twin+=2.5;w.fall*=.4}              // a visibly recovering player is punished
    if(A.ph2){w.twin+=1.5;w.fall+=1;if(dist<3.6)w.quake=1.4}
    if(dist>2.7){w.cut=0;w.twin=0;w.bash=0;w.fall*=.5}else if(dist<1.7){w.thrust=.2}
    return choose(A,out,w,dist,tick,Object.assign({},REACH,HR))}
  // The Cinder Dancer: keeps ~4 m away and casts, closes with a flip-kick gap closer, and trades combos only when you are inside her space.
  function dancer(A,P,D,out,tick,dist,k){
    const L0=A.last[A.last.length-1];
    if(dist>=3.4&&dist<=9&&L0!=='dash'){A.closeP+=A.ph2?.045:.025;if(A.r()<A.closeP){A.closeP=0;return start(A,out,'dash',0,tick)}}
    if(dist<3.4)A.closeP=0;
    const w={};
    if(dist>3.6){w.orb=dist>6?3:1.2;w.bolt=3;if(A.ph2){w.orb+=1.5;w.bolt+=1}}
    else{w.cut=3;w.twin=2.4;w.thrust=dist>2.5?2.5:.6;w.riposte=1;w.spin=1.6;w.hammer=dist<2.8?1.8:0;w.lowsweep=1.6;if(A.ph2){w.spin+=1;w.lowsweep+=1}if((k==='arecovery'||k==='stun')&&A.see>=REACT){w.twin+=3;w.fall=2}}
    for(const m of Object.keys(w)){const n=A.last.length;if(n>=2&&A.last[n-1]===m&&A.last[n-2]===m)w[m]=0;else if(n&&A.last[n-1]===m)w[m]*=.4}
    let tot=0;for(const m in w)tot+=w[m];if(tot<=0)return out;let r=A.r()*tot,pick=Object.keys(w)[0];for(const m in w){r-=w[m];if(r<=0){pick=m;break}}
    if(dist>REACH[pick]+.1)return out;
    return start(A,out,pick,0,tick)}
  // The Ashen Huntress (Erika): holds a long range and shoots slow, readable arrows (sidestep or block them); inside two metres she kicks you away; the player's answer is to close the gap in a dodge.
  function archer(A,P,D,out,tick,dist,k){
    if(dist<2.4){A.closeP=0;return start(A,out,'cut',0,tick)}
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
  return{create,think,REACH:Object.assign({},REACH,HR),REACT,INTRO}})();
if(typeof module!=='undefined')module.exports=DuelistAI;
