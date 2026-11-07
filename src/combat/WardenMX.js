// WARDEN MX: the Mixamo clip layer (assets/warden_mx_<role>.json, baked by tools/retarget_mixamo.js from tools/mixamo/<role>.json). Replaces the UAL pair-scrubbing of WardenAnim.Clips for any role that has a file:
//   player  = Mixamo "Pro Sword and Shield"   (one-hander + shield stance: idle/walk/run/back/strafe/guard + 7 attack clips)
//   duelist = Mixamo "Great Sword"            (two-hander: slashes, kick, spin, jump)
//   hollow  = Mixamo "Creature" (mutant)      (swipe, punch, jump attack, roar)
// Same controller interface as WardenAnim.Clips.make(): {ready(), update(f,fr,loco,dt,on), off(), pickAlt(), nextLight(), alt, variant}.
// Attack clips are SCRUBBED by the combat sim, exactly like before: every sim phase maps onto a slice of a clip, and the sim's `active` phase is pinned to the clip's real swing window (hit window = seconds on the
// clip's own timeline; measured by the baker from the hand speed). So the visible blade lands in the sim's active ticks, hit-stop freezes the picture, and a long tell is a long visible wind-up.
// Pure data (ROLES) + the planner (plan) are exported for tests; the controller only needs THREE + Blend.
const WardenMX=(()=>{
  const ease=u=>u<=0?0:u>=1?1:u*u*(3-2*u);
  // move spec: {c: clip, t0: clip time where the move starts, h: [[swingStart,swingEnd],...] one per sim `active` phase, e: clip time where the recovery ends, ch: [a,b] charge pose range (heavy)}
  //            or {seq:[{c,h:[a,b],t0,e},...]} when the active phases come from different clips (Hollow triple).
  const ROLES={
    player:{file:'assets/warden_mx_player.json',guard:'guard',parry:[{c:'slash',a:.2,b:.72},{c:'atk4',a:.04,b:.58}],
      loco:{idle:'idle',walk:'walk',run:'run',back:'back',sl:'sl',sr:'sr'},
      moves:{
        cinder:{c:'slash3',t0:.3,h:[[.66,.94]],e:1.5},armada:{c:'armada',t0:0,h:[[.6,1.05]],e:1.6},meia:{c:'meia',t0:0,h:[[.6,1.05]],e:1.7},
        shove:{c:'kick',t0:0,h:[[.05,.3]],e:.9},lunge:{c:'slash4',t0:.3,h:[[.45,.8]],e:1.25},whirl:{c:'slash5',t0:.62,h:[[.92,1.23]],e:1.35},martelo:{c:'martelo',t0:0,h:[[.28,.55]],e:1.3},rasteira:{c:'rast',t0:0,h:[[.25,.5]],e:1.8},
        light:{c:'slash',t0:.2,h:[[.46,.68]],e:1.15},
        light2:{c:'atk4',t0:0,h:[[.34,.52]],e:.9},
        light3:{c:'slash5',t0:.1,h:[[.36,.68]],e:1.2},
        advance:{c:'atk2',t0:.1,h:[[.3,.74]],e:1.2},rush:{c:'atk2',t0:.1,h:[[.3,.74]],e:1.2},
        evade:{c:'slash3',t0:.4,h:[[.66,.94]],e:1.5},
        rising:{c:'atk3',t0:.35,h:[[.52,.9]],e:1.6},
        heavy:{c:'atk',t0:.55,ch:[.5,.72],h:[[.9,1.3]],e:2.1},plunge:{c:'atk',t0:.5,h:[[.9,1.3]],e:2.0}}},
    duelist:{file:'assets/warden_mx_duelist.json',guard:'guard',dorm:'idle',wake:{c:'power',t0:.35,t1:2.6,rate:1},
      loco:{idle:'idle',walk:'walk',run:'run',back:'back',sl:'sl',sr:'sr'},
      moves:{
        cut:{c:'slash',t0:.05,h:[[.45,.8]],e:1.2},
        fall:{c:'slash3',t0:0,h:[[.6,1.18]],e:1.8},
        thrust:{c:'slash4',t0:.3,h:[[.6,.85]],e:1.6},
        twin:{c:'slash2',t0:.35,h:[[.62,.92],[1.5,1.95]],e:2.3},
        riposte:{c:'kick',t0:.5,h:[[.88,1.28]],e:1.5},
        dash:{c:'atk',t0:0,h:[[.3,.55]],e:1.15},
        sweep:{c:'spin',t0:0,h:[[.5,1.25]],e:1.85},
        slam:{c:'slash3',t0:0,h:[[.6,1.18]],e:1.8},
        triple:{c:'slash2',t0:.35,h:[[.62,.92],[1.5,1.95],[2.33,2.8]],e:3.4},
        leap:{c:'jump2',t0:0,h:[[.5,.8]],e:.9}}},
    hollow:{file:'assets/warden_mx_hollow.json',guard:null,
      loco:{idle:'idle',walk:'walk',run:'run',back:'walk',sl:'walk',sr:'walk'},rev:{back:1},
      moves:{
        sweep:{c:'swipe',t0:.7,h:[[1.12,1.42]],e:2.3},
        slam:{c:'jatk',t0:.8,h:[[1.25,1.7]],e:2.9},
        triple:{seq:[{c:'punch',t0:0,h:[.18,.4],e:.75},{c:'swipe',t0:.9,h:[1.12,1.42],e:1.7},{c:'punch',t0:0,h:[.18,.4],e:1.0}]},
        leap:{c:'jatk',t0:0,h:[[1.25,1.7]],e:2.8},
        cut:{c:'punch',t0:0,h:[[.18,.4]],e:.9},thrust:{c:'punch',t0:0,h:[[.18,.4]],e:.9}}},
    soldier:{file:'assets/warden_mx_player.json',guard:'guard',dorm:'crouch',wake:{c:'draw',t0:0,t1:.5,rate:.55},                        // a foot soldier fights with the player's sword-and-shield clips (retargeted onto the game rig)
      loco:{idle:'idle',walk:'walk',run:'run',back:'back',sl:'sl',sr:'sr'},
      moves:{cut:{c:'atk4',t0:0,h:[[.34,.52]],e:.9},thrust:{c:'atk2',t0:.1,h:[[.3,.74]],e:1.2}}},
    guard:{file:'assets/warden_mx_guard.json',native:true,guard:'guard',death:'death',hit:'hit1',dorm:'crouch',wake:{c:'draw',t0:0,t1:.5,rate:.55},        // Castle Guards (your character_1/3.fbx): the Ashen soldiers
      loco:{idle:'idle',walk:'walk',run:'run',back:'back',sl:'sl',sr:'sr'},
      moves:{cut:{c:'atk4',t0:0,h:[[.34,.52]],e:.9},thrust:{c:'atk2',t0:.1,h:[[.3,.74]],e:1.2}}},
    // ---- natively rigged Mixamo characters (assets/warden/<char>.glb + clips baked by tools/bake_mixamo_native.mjs). `native`: they own their mixer, so weights are plain shares (no base layer to blend over). ----
    paladin:{file:'assets/warden_mx_paladin.json',native:true,guard:'guard',dorm:'idle',wake:{c:'power',t0:.2,t1:2.2,rate:.95},death:'death',hit:'hit1',          // Oathbound Knight: Pro Sword and Shield
      loco:{idle:'idle',walk:'walk',run:'run',back:'back',sl:'sl',sr:'sr'},
      moves:{
        cut:{c:'atk4',t0:0,h:[[.34,.52]],e:.9},
        thrust:{c:'atk2',t0:.1,h:[[.3,.74]],e:1.2},
        fall:{c:'atk',t0:.55,h:[[.9,1.3]],e:2.1},
        twin:{c:'slash5',t0:.05,h:[[.38,.67],[.92,1.23]],e:1.36},
        bash:{c:'kick',t0:0,h:[[.36,.66]],e:1.1},
        dash:{c:'atk3',t0:0,h:[[.53,.9]],e:1.5},
        leap:{c:'slash4',t0:.4,h:[[1.15,1.5]],e:2.2},
        verdict:{c:'atk',t0:.1,ch:[.4,.6],h:[[.55,.9]],e:1.2},pursuit:{c:'atk3',t0:0,h:[[.53,.9]],e:1.5},
        quake:{c:'power',t0:.3,e:2.0}}},
    parasite:{file:'assets/warden_mx_parasite.json',native:true,guard:null,dorm:'breath',wake:{c:'roar',t0:0,t1:3.4,rate:1.1},death:'death',            // the Hollow Warden's real body: Mixamo "Creature" mutant
      loco:{idle:'idle',walk:'walk',run:'run',back:'walk',sl:'walk',sr:'walk'},rev:{back:1},
      moves:{
        sweep:{c:'swipe',t0:.7,h:[[1.12,1.42]],e:2.3},
        slam:{c:'jatk',t0:.8,h:[[1.25,1.7]],e:2.9},
        triple:{seq:[{c:'punch',t0:0,h:[.18,.4],e:.75},{c:'swipe',t0:.9,h:[1.12,1.42],e:1.7},{c:'punch',t0:0,h:[.18,.4],e:1.0}]},
        leap:{c:'jatk',t0:0,h:[[1.25,1.7]],e:2.8},
        cut:{c:'punch',t0:0,h:[[.18,.4]],e:.9},thrust:{c:'punch',t0:0,h:[[.18,.4]],e:.9},
        charge:{c:'jatk',t0:0,h:[[1.25,1.7]],e:2.8},tidal:{c:'roar',t0:.2,e:1.7},spores:{c:'roar',t0:.2,e:1.7},
        maul:{seq:[{c:'punch',t0:0,h:[.18,.4],e:.75},{c:'swipe',t0:.9,h:[1.12,1.42],e:1.7},{c:'punch',t0:0,h:[.18,.4],e:1.0}]},
        quake:{c:'roar',t0:.2,e:1.7}}},
    arissa:{file:'assets/warden_mx_arissa.json',native:true,guard:null,dorm:'idle',wake:{c:'power',t0:.2,t1:2.2,rate:1},death:'death',hit:'hit1',              // the Cinder Dancer: Locomotion + Capoeira + casting
      loco:{idle:'idle',walk:'walk',run:'run',back:'walk',sl:'sl',sr:'sr'},rev:{back:1},
      moves:{
        cut:{c:'meia',t0:0,h:[[.7,.95]],e:1.6},
        thrust:{c:'pontera',t0:.1,h:[[.7,.9]],e:1.3},
        twin:{c:'martelo',t0:0,h:[[.22,.45],[.65,.95]],e:1.25},
        fall:{c:'queshada',t0:.7,h:[[1.5,1.9]],e:2.4},
        riposte:{c:'rast',t0:.5,h:[[.7,1.15]],e:1.8},
        dash:{c:'armada',t0:0,h:[[.55,1.0]],e:1.6},
        leap:{c:'au',t0:.8,h:[[2.0,2.5]],e:2.9},
        spin:{c:'armada',t0:0,h:[[.6,1.05]],e:1.6},hammer:{c:'martelo',t0:0,h:[[.28,.55]],e:1.3},lowsweep:{c:'rast',t0:0,h:[[.25,.5]],e:1.8},orb:{c:'cast',t0:.85,e:2.5},bolt:{c:'cast2',t0:0,e:1.0},quake:{c:'power',t0:.2,e:1.9},requiem:{c:'power',t0:.2,e:1.9},consecrate:{c:'power',t0:.2,e:1.9}}}};
  const norm=s=>s.seq?s.seq:!s.h?[{c:s.c,t0:s.t0,e:s.e}]:s.h.map((h,i)=>({c:s.c,h,t0:i===0?s.t0:undefined,e:i===s.h.length-1?s.e:undefined}));
  // plan: phase list (CombatCore move.phases) + move spec -> per-phase {c,a,b} (clip, clip time at phase start, clip time at phase end). Pure; no THREE.
  function plan(phases,spec,dur){
    const seq=norm(spec),out=new Array(phases.length),D=c=>dur?dur(c):9;
    const t0=(s,i)=>s.t0!==undefined?s.t0:Math.max(0,s.h[0]-.4),en=(s,i)=>s.e!==undefined?s.e:Math.min(D(s.c),s.h[1]+.5);
    const act=[];phases.forEach((p,i)=>{if(p.k==='active')act.push(i)});
    if(!act.length){const s0=seq[0],a0=t0(s0),b0=en(s0);let tot=0;for(const p of phases)tot+=p.n||0;tot=tot||1;let acc=0;   // cast / stomp moves: the clip slice is spread over the sim phases in proportion
      phases.forEach((p,i)=>{const n=p.n||0;out[i]={c:s0.c,a:a0+(b0-a0)*acc/tot,b:a0+(b0-a0)*(acc+n)/tot};acc+=n});return out}
    const sg=k=>seq[Math.min(k,seq.length-1)];
    act.forEach((pi,k)=>{const s=sg(k);out[pi]={c:s.c,a:s.h[0],b:s.h[1]}});
    const ticks=(i,j)=>{let t=0;for(let q=i;q<j;q++)t+=phases[q].n||0;return t};
    // gaps: before the first active, between actives, after the last
    const gaps=[];let prev=-1;for(const pi of act){gaps.push([prev+1,pi,prev<0?-1:act.indexOf(prev),act.indexOf(pi)]);prev=pi}gaps.push([prev+1,phases.length,act.indexOf(prev),-1]);
    for(const [i,j,kp,kn] of gaps){if(i>=j)continue;const tot=ticks(i,j)||1;let acc=0;
      for(let q=i;q<j;q++){const n=phases[q].n||0,f0=acc/tot,f1=(acc+n)/tot;acc+=n;
        if(kp<0){const s=sg(kn),a0=t0(s);out[q]={c:s.c,a:a0+(s.h[0]-a0)*f0,b:a0+(s.h[0]-a0)*f1}}                                  // wind-up -> swing
        else if(kn<0){const s=sg(kp),e=en(s);out[q]={c:s.c,a:s.h[1]+(e-s.h[1])*f0,b:s.h[1]+(e-s.h[1])*f1}}                       // swing -> recovery
        else{const A=sg(kp),B=sg(kn);
          if(A.c===B.c&&B.h[0]>A.h[1])out[q]={c:A.c,a:A.h[1]+(B.h[0]-A.h[1])*f0,b:A.h[1]+(B.h[0]-A.h[1])*f1};                  // same clip: just carry on to the next swing
          else{const mid=(f0+f1)/2,cut=.4;                                                                                       // different clips: the first 40% recovers from A, the rest winds up B
            if(mid<cut){const e=en(A),g0=f0/cut,g1=f1/cut;out[q]={c:A.c,a:A.h[1]+(e-A.h[1])*Math.min(1,g0)*.6,b:A.h[1]+(e-A.h[1])*Math.min(1,g1)*.6}}
            else{const a0=t0(B),g0=(f0-cut)/(1-cut),g1=(f1-cut)/(1-cut);out[q]={c:B.c,a:a0+(B.h[0]-a0)*Math.max(0,g0),b:a0+(B.h[0]-a0)*Math.min(1,g1)}}}}}}
    return out}
  // ---- second wave of bosses: Ganfaul (Great Sword pack), Maw and Bear (Creature pack, same clip names as the parasite) ----
  ROLES.maw=Object.assign({},ROLES.parasite,{file:'assets/warden_mx_maw.json'});
  ROLES.bear=Object.assign({},ROLES.parasite,{file:'assets/warden_mx_bear.json',wake:{c:'flex',t0:0,t1:2.6,rate:1}});
  ROLES.ganfaul={file:'assets/warden_mx_ganfaul.json',native:true,guard:'guard',dorm:'crouch',wake:{c:'power',t0:.3,t1:2.6,rate:.95},death:'death',hit:'hit1',
    loco:{idle:'idle',walk:'walk',run:'run',back:'back',sl:'sl',sr:'sr'},
    moves:{
      cut:{c:'slash',t0:.1,h:[[.45,.75]],e:1.2},
      thrust:{c:'slash5',t0:.15,h:[[.5,.82]],e:1.3},
      twin:{c:'slash3',t0:.2,h:[[.55,.85],[1.1,1.4]],e:1.7},
      fall:{c:'atk',t0:.1,ch:[.4,.6],h:[[.55,.9]],e:1.2},
      sweep:{c:'spin',t0:.1,h:[[.5,1.3]],e:1.8},
      slam:{c:'slash3',t0:0,h:[[.55,1.0]],e:1.8},
      bash:{c:'kick',t0:.1,h:[[.5,.85]],e:1.4},
      leap:{c:'slash4',t0:.3,h:[[.9,1.3]],e:1.7},
      dash:{c:'slash5',t0:0,h:[[.5,.82]],e:1.3},
      riposte:{c:'kick',t0:.1,h:[[.5,.85]],e:1.4},
      quake:{c:'power',t0:.3,e:2.0}}};
  // Morvane, the Black Knight (uploaded dark knight rig): Ganfaul's Great Sword clips baked onto his own skeleton; a faster, shield-less moveset (spin / low sweep / hammer / riposte on top of the knight's)
  ROLES.darkknight=Object.assign({},ROLES.ganfaul,{file:'assets/warden_mx_darkknight.json',moves:Object.assign({},ROLES.ganfaul.moves,{
    spin:{c:'spin',t0:.1,h:[[.5,1.3]],e:1.8},lowsweep:{c:'slash4',t0:.1,h:[[.55,1.0]],e:1.5},hammer:{c:'atk',t0:.1,h:[[.55,.9]],e:1.2}})});
  ROLES.archer={file:'assets/warden_mx_archer.json',native:true,guard:null,dorm:'idle',wake:{c:'power',t0:.3,t1:2.4,rate:1},death:'death',hit:'hit1',     // Erika, the Ashen Huntress: Longbow locomotion + a quick cast clip for the shot + a kick when you get close
    loco:{idle:'idle',walk:'walk',run:'run',back:'back',sl:'sl',sr:'sr'},
    moves:{bolt:{c:'spell',t0:0,e:1.1},orb:{c:'spell',t0:0,e:1.1},cut:{c:'kick',t0:.1,h:[[.5,.85]],e:1.4},thrust:{c:'kick',t0:.1,h:[[.5,.85]],e:1.4},quake:{c:'power',t0:.3,e:2.0},consecrate:{c:'power',t0:.3,e:2.0}}};
  // Vael, the Crimson Duelist (uploaded vampire rig): Ganfaul's Great Sword clips retargeted onto his skeleton (tools/rebase_mx.mjs); a fast chain of cuts, a spin, a low sweep, and the blink (he crouches, then the sim hides him)
  ROLES.vampire=Object.assign({},ROLES.ganfaul,{file:'assets/warden_mx_vampire.json',moves:Object.assign({},ROLES.ganfaul.moves,{
    spin:{c:'spin',t0:.1,h:[[.5,1.3]],e:1.8},lowsweep:{c:'slash4',t0:.1,h:[[.55,1.0]],e:1.5},hammer:{c:'atk',t0:.1,h:[[.55,.9]],e:1.2},
    triple:{seq:[{c:'slash',t0:.1,h:[.45,.75],e:1.0},{c:'slash5',t0:.15,h:[.5,.82],e:1.0},{c:'slash',t0:.1,h:[.45,.75],e:1.25}]},
    blink:{c:'crouch',t0:0,e:.66}})});
  // The Iron Penitent (Three Oaths, uploaded Artorias rig via tools/pack_bip_char.mjs, his own sword is part of the body): Morvane's Great Sword clips retargeted; the Sentence is two cuts then the delayed overhead (verdict), the floor-breaker is the stomp, the march a slow lunge
  ROLES.penitent=Object.assign({},ROLES.darkknight,{file:'assets/warden_mx_penitent.json',moves:Object.assign({},ROLES.darkknight.moves,{
    march:{c:'slash4',t0:.3,h:[[.9,1.3]],e:1.7},groundbreaker:{c:'power',t0:.3,e:2.0},verdict:{c:'atk',t0:.1,ch:[.4,.6],h:[[.55,.9]],e:1.2},pursuit:{c:'slash5',t0:0,h:[[.5,.82]],e:1.3}})});
  // Artorias' second-phase Waterfowl dance (three quick cuts, then the long opening)
  ROLES.penitent.moves.flurry={c:'slash4',t0:.1,h:[[.3,.5],[.8,1.0],[1.3,1.5]],e:1.78};
  // Gwyn, Lord of Cinder (uploaded DS3-style rig via tools/pack_bip_char.mjs, his greatsword is part of the body): Artorias's retargeted set plus waves / Kingsfall / flurry
  ROLES.gwyn=Object.assign({},ROLES.penitent,{file:'assets/warden_mx_gwyn.json',moves:Object.assign({},ROLES.penitent.moves,{
    ashwave:{c:'slash',t0:.1,e:1.1},crossflame:{c:'slash3',t0:.1,e:1.4},kingsfall:{c:'power',t0:.3,e:2.0},flurry:{c:'slash4',t0:.1,h:[[.3,.5],[.8,1.0],[1.3,1.5]],e:1.78},
    consecrate:{c:'power',t0:.3,e:2.0},requiem:{c:'power',t0:.3,e:2.1},moon:{c:'slash4',t0:.3,h:[[.9,1.4]],e:1.78}})});
  // Kage, the Shadowflame Samurai (uploaded CC rig, packed by tools/pack_cc_char.mjs): the Oathbound set retargeted onto his skeleton (no spin / crouch clips there, so the sweep reuses a slash and the blink uses the power-up crouch)
  ROLES.samurai=Object.assign({},ROLES.vampire,{file:'assets/warden_mx_samurai.json',dorm:'idle',moves:Object.assign({},ROLES.vampire.moves,{
    sweep:{c:'slash3',t0:.2,h:[[.55,.85],[1.1,1.4]],e:1.6},twin:{c:'slash3',t0:.2,h:[[.55,.85],[1.1,1.4]],e:1.6},bash:{c:'kick',t0:.1,h:[[.5,.85]],e:1.15},riposte:{c:'kick',t0:.1,h:[[.5,.85]],e:1.15},spin:{c:'slash4',t0:.1,h:[[.55,1.0]],e:1.5},blink:{c:'power',t0:.3,e:.96},
    iai:{c:'slash5',t0:.05,h:[[.5,.82]],e:1.3},feint:{c:'slash5',t0:.05,e:.55},moon:{c:'slash4',t0:.3,h:[[.9,1.4]],e:1.9},counter:{c:'slash',t0:.1,h:[[.5,.8]],e:1.2},requiem:{c:'power',t0:.3,e:2.1},
    hundred:{seq:[{c:'slash3',t0:.2,h:[.55,.85],e:1.0},{c:'slash5',t0:.1,h:[.5,.82],e:.95},{c:'slash3',t0:.2,h:[.55,.85],e:1.0},{c:'slash4',t0:.4,h:[.9,1.4],e:1.6}]}})});
  // The Veil Dancer (uploaded hooded rig, Mixamo skeleton): Kage's clip set retargeted onto her
  ROLES.veil=Object.assign({},ROLES.samurai,{file:'assets/warden_mx_veil.json',moves:Object.assign({},ROLES.samurai.moves)});
  // Kage's real sword work (k_* clips baked from the Seede XR library onto his skeleton): a proper draw, an inward / outward cut pair, a spin, kicks, a slide, a leap, a backflip kick. The Veil Dancer keeps the older set above.
  Object.assign(ROLES.samurai.moves,{
    cut:{c:'k_in',t0:.75,h:[[1.15,1.38]],e:1.9},
    twin:{seq:[{c:'k_out',t0:.5,h:[.78,1.0],e:1.1},{c:'k_in',t0:.8,h:[1.15,1.38],e:1.9}]},
    triple:{seq:[{c:'k_out',t0:.5,h:[.78,1.0],e:1.1},{c:'k_in',t0:.8,h:[1.15,1.38],e:1.6},{c:'k_combo',t0:2.45,h:[2.85,3.15],e:3.6}]},
    iai:{c:'k_draw',t0:.25,h:[[.82,1.02]],e:1.5},silentsev:{c:'k_draw',t0:.25,h:[[.82,1.02]],e:1.5},feint:{c:'k_draw',t0:.25,e:.7},
    counter:{c:'k_down',t0:.15,h:[[.5,.68]],e:1.2},spin:{c:'k_spinrun',t0:0,h:[[.52,.75]],e:1.5},
    kslide:{c:'k_slide',t0:.45,h:[[1.3,1.6]],e:2.0},crow:{c:'k_jump',t0:.1,e:2.1},
    cyclone:{c:'k_spinrun',t0:0,h:[[.52,.75],[.95,1.2]],e:1.6},splitter:{c:'k_pslash',t0:.15,h:[[.7,.9]],e:1.7},
    tengu:{seq:[{c:'k_skick',t0:.15,h:[.4,.65],e:.9},{c:'k_spkick',t0:.1,h:[.45,.95],e:1.4}]},
    reversemoon:{c:'k_flipkick',t0:.1,h:[[1.3,1.5]],e:2.0},kindle:{c:'k_charge',t0:.2,e:2.4},thrustslash:{c:'k_thrust',t0:.3,h:[[.65,.85],[1.45,1.65]],e:2.2},
    // the demon arsenal: library kicks / flips / great-sword clips (kz_*), hand-speed windows from tools/clip_windows.mjs
    kzsweep:{c:'kz_sweep',t0:.1,h:[[.49,.67],[.79,.97]],e:1.9},kzhurr:{c:'kz_hurr',t0:.05,h:[[.35,.53],[.85,1.03],[1.42,1.6]],e:1.83},
    kzaerial:{c:'kz_aerial',t0:.6,h:[[1.19,1.37],[1.65,1.83]],e:2.2},kzbutter:{c:'kz_butter',t0:.2,h:[[.65,.83],[1.19,1.37],[1.49,1.67]],e:2.2},
    kzfflip:{c:'kz_fflip',t0:.2,h:[[.99,1.17],[1.32,1.5]],e:2.2},kzbflip:{c:'kz_bflip',t0:.1,h:[[.79,.97],[1.32,1.5]],e:2.0},
    kzdbl:{c:'kz_dbl',t0:.5,h:[[.79,.97],[1.12,1.3]],e:1.7},kzhjump:{c:'kz_hjump',t0:.05,h:[[.52,.7],[1.02,1.2]],e:2.1},
    kzhspin:{c:'kz_hspin',t0:0,h:[[.25,.43],[.55,.73],[.92,1.1]],e:1.8},kzpow:{c:'kz_pow',t0:.1,h:[[.42,.6],[1.35,1.53]],e:1.8},
    kzgcmb:{c:'kz_gcmb',t0:.2,h:[[.55,.73],[.95,1.13],[1.32,1.5],[2.12,2.3]],e:3.2},kzstomp:{c:'kz_stomp',t0:.05,e:1.3},
    kztflip:{c:'kz_tflip',t0:0,h:[[.52,.7],[.95,1.13],[1.32,1.5]],e:2.1},kzsfl:{c:'kz_sfl',t0:.8,h:[[1.39,1.57],[1.79,1.97]],e:2.4},
    kzgrab:{c:'kz_grab',t0:1.5,h:[[2.29,2.47],[2.79,2.97]],e:3.2},kzrh:{c:'kz_rh',t0:.2,h:[[.49,.67],[.82,1]],e:1.5},
    kzcart:{c:'kz_cart',t0:.2,h:[[.79,.97],[1.19,1.37]],e:1.7},kzback:{c:'kz_bk',t0:0,e:1.8},kzgslam:{c:'kz_gslam',t0:.05,h:[[.49,.67]],e:1.27}});
  // The Veiled Saint (uploaded Queen of Swords rig, packed by tools/pack_ue_char.mjs): the Huntress's cast / kick / power-up set retargeted onto her; every area attack is a cast
  ROLES.saint=Object.assign({},ROLES.archer,{file:'assets/warden_mx_saint.json',moves:Object.assign({},ROLES.archer.moves,{
    lance:{c:'spell',t0:0,e:1.1},returning:{c:'spell',t0:0,e:1.1},consecrate:{c:'power',t0:.3,e:2.0},procession:{c:'power',t0:.3,e:2.0},bladestorm:{c:'spell',t0:0,e:1.1},swordring:{c:'power',t0:.3,e:2.0}})});
  // The Capra Demon (uploaded DS rig, tools/pack_bip_char.mjs): Gwyn's clip set retargeted onto his skeleton (tools/rebase_mx.mjs)
  ROLES.capra=Object.assign({},ROLES.gwyn,{file:'assets/warden_mx_capra.json'});
  // Dark Sun Gwyndolin (uploaded DS rig, no legs - she floats; tools/pack_gdn_char.mjs): the Saint's cast / kick / power set retargeted onto her
  ROLES.gdn=Object.assign({},ROLES.saint,{file:'assets/warden_mx_gdn.json',moves:Object.assign({},ROLES.saint.moves,{sunvolley:{c:'spell',t0:0,e:1.1},snakelash:{c:'power',t0:.3,e:2.0},eclipse:{c:'power',t0:.3,e:2.0},blink:{c:'power',t0:.3,e:.96}})});
  // THE VEILED SAINT'S OWN CHOREOGRAPHY (library sword / great-sword / casting clips baked onto her rig: sa_*), set after Gwyndolin copied her table so the floating Dark Sun keeps her own: a great-sword chain for Hundred and Thousand, a leaping stab for Impaler, a thrust-and-slash for the Double Impaler, a low sweep for Kingsweep, a three-cut flurry for Severance, and a different casting pose for each of Bladestorm, the Blade Ring, Crownfall and the Marks
  Object.assign(ROLES.saint.moves,{hundred:{c:'sa_gcmb',t0:.2,h:[[.52,.7],[.9,1.08],[1.25,1.43],[2.12,2.3]],e:3.2},thousand:{c:'sa_ccmb',t0:.3,h:[[.65,.83],[1.59,1.77],[2.02,2.2],[2.59,2.77]],e:3.3},severance:{c:'sa_ocmb',t0:.3,h:[[.92,1.1],[1.4,1.58],[1.92,2.1]],e:2.9},
    impaler:{c:'sa_jump',t0:.35,h:[[.99,1.17]],e:2},doubleimp:{c:'sa_thr',t0:.25,h:[[.65,.83],[1.39,1.57]],e:2.2},kingsweep:{c:'sa_low',t0:.1,h:[[.69,.87]],e:1.5},
    bladestorm:{c:'sa_cbs',t0:.1,e:2.3},swordring:{c:'sa_cwide',t0:.1,e:2},crownfall:{c:'sa_cgr',t0:.2,e:1.6},marks:{c:'sa_cup',t0:.1,e:1.6}});
  // Skrag, the Snare-Trapper (uploaded goblin rig): the Longbow set (arrow cast, kick, power-up) retargeted onto his skeleton; the long power-up clip is his snare-laying
  ROLES.goblin=Object.assign({},ROLES.archer,{file:'assets/warden_mx_goblin.json',moves:Object.assign({},ROLES.archer.moves,{snare:{c:'power',t0:.3,e:1.6}})});
  // BARE HANDS: the player's gait clips only (no sword guard / parry / attack clips): Fists.Pose poses the arms, legs and torso for every strike, guard and throw
  // IRON FIST ISLE (src/games/Dojo.js): bare hands, animated by REAL clips only. The sword-and-shield pack's boxer-stance strikes (atk2/atk3/atk4), the capoeira kicks, the Phantom-Blade dash and the emote library's
  // jab / cross / kick / throw / block (loaded into the layer as e_<name>) are scrubbed by the sim exactly like sword moves. Keys are the Fists move ids (src/combat/Fists.js).
  ROLES.player_dojo=Object.assign({},ROLES.player,{emo:['jab','cross','kick','throw','block'],guard:'e_block',parry:null,moves:{
    jab:{c:'e_jab',t0:0,h:[[.2,.4]],e:.82},cross:{c:'e_cross',t0:0,h:[[.28,.52]],e:.97},hook:{c:'atk4',t0:.3,h:[[.4,.56]],e:.95},knee:{c:'e_kick',t0:.12,h:[[.34,.6]],e:.9},
    f_spin:{c:'armada',t0:0,h:[[.6,1.05]],e:1.6},upper:{c:'atk3',t0:.35,h:[[.52,.9]],e:1.6},round:{c:'martelo',t0:0,h:[[.28,.55]],e:1.3},
    power:{c:'atk2',t0:.1,ch:[.1,.3],h:[[.3,.74]],e:1.2},heavy:{c:'atk2',t0:.1,ch:[.1,.3],h:[[.3,.74]],e:1.2},step:{c:'atk2',t0:.15,h:[[.3,.74]],e:1.15},
    f_dash:{c:'p_dash',t0:.05,h:[[.27,.4]],e:1.1},f_counter:{c:'e_cross',t0:0,h:[[.28,.52]],e:.97},push:{c:'kick',t0:0,h:[[.05,.3]],e:.9},drop:{c:'kick',t0:0,h:[[.05,.3]],e:.9},
    throw:{c:'e_throw',t0:.15,h:[[.5,.8]],e:1.3},take:{c:'atk',t0:.55,h:[[.9,1.3]],e:2.1}}});
  ROLES.player_dojo.kk=1;ROLES.player_dojo.dojo=1;ROLES.player_dojo.pxAv=1;ROLES.player_dojo.px='assets/warden_px_player.json';ROLES.player_dojo.hit='hit1';ROLES.player_dojo.death='death';ROLES.player_dojo.emo=['jab','cross','kick','throw','block','roll'];ROLES.player_dojo.moves.f_dash={c:'e_cross',t0:0,h:[[.28,.52]],e:.97};
  // Timing is RETIMED so no phase plays faster than ~1.5x the clip's real speed (it was 2.6-4.7x: the punches looked snapped): t0 = where the motion starts, h = the narrow impact window (the sim's active frames), e = settled.
  // MIXAMO UNARMED LIBRARY (boxing / MMA / strike clips baked by tools/avatar/bake_fbxpack.mjs into <avatar>/dojo_fx.json): real boxing stance, jab / cross / hooks / uppercuts, knee, roundhouse, side kick, spinning back kick, shoulder throw, takedown, hit reactions. Times (seconds in the clip): t0 = motion starts, h = hit window, e = settled.
  ROLES.player_dojo.fxMoves={jab:{c:'fx_jab',t0:.16,h:[[.29,.36]],e:.53},cross:{c:'fx_cross',t0:.07,h:[[.19,.26]],e:.46},hook:{c:'fx_hook_r',t0:.28,h:[[.45,.52]],e:.77},knee:{c:'fx_knee',t0:.14,h:[[.31,.38]],e:.66},f_spin:{c:'fx_spinback',t0:.59,h:[[.84,.95]],e:1.3},upper:{c:'fx_upper_r',t0:.3,h:[[.52,.63]],e:1.08},round:{c:'fx_round',t0:.38,h:[[.65,.75]],e:1.2},power:{c:'fx_hook_l',t0:.12,ch:[.12,.32],h:[[.37,.52]],e:1},heavy:{c:'fx_hook_l',t0:.12,ch:[.12,.32],h:[[.37,.52]],e:1},step:{c:'fx_combo2',t0:.36,h:[[.51,.58]],e:.83},f_dash:{c:'fx_cross',t0:.02,h:[[.17,.27]],e:.5},f_counter:{c:'fx_upper_l',t0:.36,h:[[.46,.53]],e:.78},push:{c:'fx_side',t0:.23,h:[[.41,.48]],e:.83},drop:{c:'fx_stomp',t0:.38,h:[[.58,.71]],e:1.2},throw:{c:'fx_shoulder',t0:.31,h:[[.51,.58]],e:1.18},take:{c:'fx_takedown',t0:.27,h:[[.57,.64]],e:1.2}};

  // VARIANTS: a move may list alternative clips (v); each new attack picks the next one, so a repeated string never looks like the same animation twice. v[0] is the base clip. Missing clips are skipped.
  {const F=ROLES.player_dojo.fxMoves;for(const [id,vs] of Object.entries({"round": [{c:'fx2_kick_mid',t0:.23,h:[[.5,.6]],e:1.1}, {c:'fx2_kick_high',t0:.19,h:[[.46,.56]],e:1.06}, {c:'fx2_kick_low',t0:.16,h:[[.43,.53]],e:1.03}], "knee": [{c:'fx2_knee_mt',t0:.15,h:[[.32,.39]],e:.67}], "hook": [{c:'fx2_hook_back',t0:.28,h:[[.45,.52]],e:.77}], "upper": [{c:'fx2_upper_lead',t0:.23,h:[[.45,.55]],e:.8}], "throw": [{c:'fx2_slam',t0:1.25,h:[[1.45,1.52]],e:1.84}]})){const b=Object.assign({},F[id]);F[id]=Object.assign({},b,{v:[b].concat(vs)})}F.round.zv={m:1,h:2,l:3}}   // the sim picks the hit zone of a kick (head / body / leg); the clip follows it
  // KayKit combat-melee pack (CC0, baked by tools/avatar/bake_kaykit.mjs into <avatar>/dojo_kk.json): a real fighting-stance idle + guard, a punch, a kick, a counter, block reactions, directional dodges and the 2H staff swings
  Object.assign(ROLES.player_dojo.loco={...ROLES.player_dojo.loco},{idle:'kk_idle'});ROLES.player_dojo.guard='kk_guard';
  Object.assign(ROLES.player_dojo.moves,{step:{c:'kk_punch',t0:.12,h:[[.34,.52]],e:.95},dash:{c:'kk_punch',t0:.12,h:[[.34,.52]],e:.95},counter:{c:'kk_blockatk',t0:0,h:[[.3,.6]],e:.95},push:{c:'kk_kick',t0:.05,h:[[.28,.5]],e:.86},drop:{c:'kk_kick',t0:.05,h:[[.28,.5]],e:.86}});
  ROLES.dojo_staff=Object.assign({},ROLES.player_dojo,{loco:{...ROLES.player_dojo.loco,idle:'kk_2h_idle'},moves:Object.assign({},ROLES.player_dojo.moves,{
    jab:{c:'kk_2h_slice',t0:.1,h:[[.3,.46]],e:.85},cross:{c:'kk_2h_stab',t0:.05,h:[[.15,.4]],e:.95},hook:{c:'kk_2h_chop',t0:.45,h:[[.65,.9]],e:1.3},knee:{c:'kk_2h_stab',t0:.05,h:[[.15,.4]],e:.95},
    spin:{c:'kk_2h_spin',t0:.3,h:[[.6,1.27]],e:2.0},upper:{c:'kk_2h_chop',t0:.45,h:[[.65,.9]],e:1.3},round:{c:'kk_2h_spinning',t0:0,h:[[.15,.55]],e:.66},heavy:{c:'kk_2h_chop',t0:.45,h:[[.65,.9]],e:1.3},power:{c:'kk_2h_chop',t0:.45,ch:[.45,.62],h:[[.65,.9]],e:1.3},step:{c:'kk_2h_slice',t0:.1,h:[[.3,.46]],e:.85},dash:{c:'kk_2h_stab',t0:.05,h:[[.15,.4]],e:.95}})});
  ROLES.dojo_staff.fxMoves=null;
  // (the px pack clips are only baked for the stock rig, so on the human avatars the Iron Fist layer uses hit1 / death from the Mixamo set for flinches and falls, and the emote roll for dodges)
  // ---- the player's heavier weapons: the Great Sword pack (already baked onto the game rig for the Duelist) drives the Claymore and the Hand Axe ----
  ROLES.player_gs={file:'assets/warden_mx_duelist.json',guard:'guard',parry:[{c:'slash',a:.05,b:.6},{c:'slash5',a:.15,b:.62}],loco:{idle:'idle',walk:'walk',run:'run',back:'back',sl:'sl',sr:'sr'},
    moves:{
      light4:{c:'pz_gcmb',t0:.3,h:[[.55,.73],[.95,1.13]],e:1.5},light5:{c:'pz_gcmb',t0:1.1,h:[[1.32,1.5],[2.12,2.3]],e:2.5},wheel:{c:'pz_wheel',t0:0,h:[[.25,.43],[.55,.73],[.92,1.1]],e:1.8},dropblade:{c:'pz_fall',t0:.05,h:[[.49,.67]],e:1.27},pierce:{c:'t_stabR',t0:.6,h:[[.98,1.18]],e:1.4},moonslash:{c:'pz_pow',t0:.1,h:[[.42,.6],[1.35,1.53]],e:1.8},
      light:{c:'slash',t0:.05,h:[[.45,.8]],e:1.2},light2:{c:'slash5',t0:.15,h:[[.5,.82]],e:1.3},light3:{c:'slash3',t0:.3,h:[[.6,1.0]],e:1.6},
      advance:{c:'slash4',t0:.3,h:[[.6,.85]],e:1.6},rush:{c:'slash4',t0:.3,h:[[.6,.85]],e:1.6},evade:{c:'slash',t0:.1,h:[[.45,.8]],e:1.2},rising:{c:'slash2',t0:.35,h:[[.62,.92]],e:1.5},
      heavy:{c:'slash3',t0:0,ch:[.35,.55],h:[[.6,1.18]],e:1.8},plunge:{c:'slash3',t0:.1,h:[[.6,1.18]],e:1.8},
      cinder:{c:'slash4',t0:.3,h:[[.6,.85]],e:1.6},armada:{c:'spin',t0:0,h:[[.5,1.25]],e:1.85},meia:{c:'slash2',t0:1.2,h:[[1.5,1.95]],e:2.3},
      martelo:{c:'atk',t0:0,h:[[.37,.52]],e:1.1},rasteira:{c:'slash4',t0:.9,h:[[1.17,1.5]],e:1.8},
      shove:{c:'kick',t0:.5,h:[[.88,1.28]],e:1.5},lunge:{c:'slash4',t0:.3,h:[[.6,.85]],e:1.6},whirl:{c:'spin',t0:0,h:[[.5,1.25]],e:1.85}}};
  ROLES.player_axe=Object.assign({},ROLES.player_gs,{moves:Object.assign({},ROLES.player_gs.moves,{
    light:{c:'atk',t0:0,h:[[.37,.52]],e:1.0},light2:{c:'slash',t0:.05,h:[[.45,.8]],e:1.2},rising:{c:'slash3',t0:.2,h:[[.6,1.0]],e:1.6}})});
  // the Phantom-Blade pack (assets/warden_px_<role>.json, tools/bake_pack.mjs): reactions every role with .px shares - knock-back, hurt loop, two flinches, three deaths
  const HR=['hr_chest','hr_sw','hr_head','hr_kid','hr_side','hr_L','hr_big','hr_up'];
  const PXN=['p_knock','p_hurt','p_hitc','p_hith','p_deathA','p_deathB','p_deathC'],PXD=['p_deathA','p_deathB','p_deathC'];
  for(const r of['penitent','gwyn','capra','saint','veil','samurai','vampire','paladin','arissa','archer','gdn','ganfaul']){const R=ROLES[r];if(!R)continue;R.px='assets/warden_px_'+r+'.json';const M=R.moves=Object.assign({},R.moves);
    if(M.bash)M.bash={c:'p_kick',t0:.25,h:[[.46,.68]],e:1.2};
    if(M.flurry)M.flurry={c:'p_combo',t0:0,h:[[.2,.32],[.68,.8],[1.48,1.6]],e:2.3};if(M.dash)M.dash={c:'p_dash',t0:.05,h:[[.28,.42]],e:1.1}}
  // the player's own roles: the same reactions (knock-back, hurt loop, flinches, deaths) plus a kick for the shove and the dash cut for the lunge
  for(const r of['player','player_gs','player_axe','player_twin'])if(ROLES[r])ROLES[r].dsv=true;
  // NINJA LOCOMOTION (library female-ninja set) for the player in every stance: ready stance idle, one fast run for walk+run, curved runs for the sideways steps, a backward run. The old walk/sl/sr clips are no longer used by the player.
  for(const r of['player','player_gs','player_axe']){const R=ROLES[r];if(!R)continue;R.px='assets/warden_px_player.json';const M=R.moves=Object.assign({},R.moves);
    M.sever={c:'slash',t0:.15,h:[[.46,.68]],e:1.0};M.sever2={c:'slash5',t0:.1,h:[[.5,.82]],e:1.0};M.severF={c:'p_combo',t0:.9,h:[[1.5,1.6]],e:2.6};
    if(M.shove)M.shove={c:'p_kick',t0:.2,h:[[.5,.8]],e:1.3};if(M.lunge)M.lunge={c:'p_dash',t0:.05,h:[[.27,.4]],e:1.1}}
  // ---- Twin Blades (second stance, src/combat/Twin.js): the player's own clip set + ninja clips (t_* / d_* from the Seede XR library, baked by tools/avatar/bake_human.mjs --twin). Windows are clip seconds. ----
  ROLES.player_twin=Object.assign({},ROLES.player,{alias:'player',moves:Object.assign({},ROLES.player.moves,{
    twa:{c:'t_out',t0:.2,h:[[.42,.67]],e:1.1},twb:{c:'t_in',t0:.2,h:[[.47,.78]],e:1.1},twc:{c:'t_stabL',t0:0,h:[[.48,.72]],e:1.0},twd:{c:'t_rev',t0:.1,h:[[.32,.75]],e:1.2},twe:{c:'t_spinkick',t0:.3,h:[[.47,.75]],e:1.3},
    twstep:{c:'t_stabR',t0:0,h:[[.23,.45]],e:.8},twdash:{c:'t_thrust',t0:.1,h:[[.4,.68]],e:1.0},twcounter:{c:'t_stabL',t0:0,h:[[.13,.38]],e:.8},twkick:{c:'t_flipkick',t0:.1,h:[[.47,.83]],e:1.2},twplunge:{c:'t_frontkick',t0:0,h:[[.2,.6]],e:1.2},
    twx:{c:'t_dag',t0:.6,h:[[.93,1.12]],e:1.5},twwhirl:{c:'t_combo',t0:1.0,h:[[1.47,1.85]],e:2.1},twpierce:{c:'t_stabR',t0:.6,h:[[.98,1.18]],e:1.4},twshade:{c:'t_rev',t0:.9,h:[[1.37,1.7]],e:1.9},
    twmoon:{c:'t_combo',t0:.2,h:[[.47,.8],[1.47,1.85]],e:2.2},
    twsev:{c:'t_stabL',t0:0,h:[[.13,.38]],e:.6},twsev2:{c:'t_stabR',t0:.1,h:[[.23,.45]],e:.7},twsevF:{c:'t_combo',t0:.2,h:[[.47,.8],[1.47,1.85]],e:2.2},
    twdance:{seq:[{c:'t_stabL',t0:0,h:[.13,.38],e:.45},{c:'t_stabL',t0:.4,h:[.48,.72],e:.8},{c:'t_dag',t0:.8,h:[.93,1.1],e:1.2},{c:'t_combo',t0:2.2,h:[2.43,2.7],e:2.9}]}})});
  // dodge clips (a window of each clip is scrubbed over the sim's dodge ticks): [clip, from, to] by direction relative to where you face. Missing clips fall back to the game's roll emote.
  const DG={roll:['d_roll',0,.75],back:['d_back',0,.62],fwd:['d_fwd',0,.55],l:['d_l',0,.6],r:['d_r',0,.6]};
  ROLES.player.dg=DG;ROLES.player_gs.dg=DG;ROLES.player_axe.dg=DG;ROLES.player_twin.dg=Object.assign({},DG,{back:['d_flip',0,1.0]});
  // The Unbroken Oath (Three Oaths stage 4): the Penitent's body and clips with Gwyn's waves + the Saint's blades + the Dancer's chain
  ROLES.oath4=Object.assign({},ROLES.penitent,{px:'assets/warden_px_penitent.json',moves:Object.assign({},ROLES.gwyn.moves,{bladestorm:{c:'power',t0:.3,e:2.0},swordring:{c:'power',t0:.3,e:2.0},
    hundred:{seq:[{c:'slash3',t0:.2,h:[.55,.85],e:1.0},{c:'slash5',t0:.1,h:[.5,.82],e:.95},{c:'slash3',t0:.2,h:[.55,.85],e:1.0},{c:'slash4',t0:.4,h:[.9,1.4],e:1.6}]}})});
  // The Dark Knight (the crowned one, a static model rigged by tools/pack_static_char.mjs): the Unbroken Oath's moves + the blink
  ROLES.dknight=Object.assign({},ROLES.oath4,{file:'assets/warden_mx_dknight.json',px:'assets/warden_px_dknight.json',moves:Object.assign({},ROLES.oath4.moves,{blink:{c:'crouch',t0:0,e:.66},dsgrab:{c:'gr_choke',t0:.35,e:2.6}})});
  // Artorias + the Dark Knight: real two-handed clips (g_* from the Seede XR library, retargeted by tools/bake_mixamo_native.mjs) for a fourfold combo, a leap, a slide, a travelling overhead, a pommel jab, a kick pair and a ring
  const GS={spin:{c:'g_spinrun',t0:0,h:[[.52,.75]],e:1.5},fourfold:{c:'g_gcombo',t0:.15,h:[[.6,.78],[1.33,1.5],[2.1,2.45]],e:3.0},wyrmstrike:{c:'g_jump',t0:.1,h:[[.95,1.2]],e:2.0},undertow:{c:'g_slide',t0:.45,h:[[1.3,1.6]],e:2.0},
    moonfall:{c:'g_pslash',t0:.15,h:[[.7,.92]],e:1.7},pommel:{c:'g_hilt',t0:.1,h:[[.42,.58]],e:1.1},kickwheel:{seq:[{c:'g_skick',t0:.15,h:[.35,.62],e:.9},{c:'g_spkick',t0:.1,h:[.42,.95],e:1.4}]},abyssring:{c:'g_charge',t0:.2,e:2.6},undercut:{c:'g_low',t0:.2,h:[[1.0,1.3]],e:1.8}};
  Object.assign(ROLES.penitent.moves,GS);Object.assign(ROLES.dknight.moves,GS);
  for(const r of['dknight','penitent','gwyn','capra','samurai','vampire','saint','veil','oath4','paladin','arissa','archer','ganfaul','gdn'])if(ROLES[r])ROLES[r].hr=true;for(const q of['gwyn','samurai','saint'])if(ROLES[q])ROLES[q].kn=true;
  for(const r of['dknight','penitent','gwyn','capra','samurai','vampire','saint','veil','oath4']){const R=ROLES[r];if(!R)continue;R.pack=true;R.g=r==='dknight'||r==='penitent'||r==='gwyn'||r==='capra'||r==='oath4'}
  const BUILD='mx3';const SH={};      // role -> {st,clips,p}
  // a dropped request is retried (3 times, growing gaps) before the role is declared failed: a role that failed once never recovers within a session
  const tryFetch=(u,n)=>fetch(u,n<6?{cache:'reload'}:undefined).then(r=>{if(!r.ok)throw new Error('http '+r.status);return r}).catch(e=>n>0?new Promise(r=>setTimeout(r,1500*(7-n))).then(()=>tryFetch(u,n-1)):Promise.reject(e));
  // av = a human avatar id (AvatarKit): the same role file baked for that avatar's proportions lives in assets/avatars/<name>/ (tools/avatar/retarget_clips.mjs); native (own-rig) roles never use it
  function fetchRole(role,av){role=ROLES[role]&&ROLES[role].alias||role;const key=av?role+'@'+av:role,s=SH[key]||(SH[key]={st:'none',clips:null,meta:null,p:null}),file=av&&typeof AvatarKit!=='undefined'&&AvatarKit.CAT[av]&&!ROLES[role].native?AURL+AvatarKit.CAT[av].dir+ROLES[role].file.replace(/^.*\//,'')+AvatarKit.ASSET_V:ROLES[role].file,tag=(av?av+'/':'')+role;
    if(!s.p)s.p=Promise.all([tryFetch(file,6).then(r=>r.json()),ROLES[role].px&&(!av||ROLES[role].pxAv)?tryFetch(av?AURL+AvatarKit.CAT[av].dir+'warden_px_player.json'+AvatarKit.ASSET_V:ROLES[role].px,6).then(r=>r.json()).catch(()=>[]):[],ROLES[role].kk&&av?tryFetch(AURL+AvatarKit.CAT[av].dir+'dojo_kk.json'+AvatarKit.ASSET_V,6).then(r=>r.json()).catch(()=>[]):[],ROLES[role].kk&&av?tryFetch(AURL+AvatarKit.CAT[av].dir+'dojo_fx.json'+AvatarKit.ASSET_V,6).then(r=>r.json()).catch(()=>[]):[],ROLES[role].kk&&av?tryFetch(AURL+AvatarKit.CAT[av].dir+'dojo_fx2.json'+AvatarKit.ASSET_V,6).then(r=>r.json()).catch(()=>[]):[]]).then(([a,x,k,f,f2])=>a.concat(x,k,f,f2)).then(j=>{s.clips={};s.meta={};for(const c of j){const ac=THREE.AnimationClip.parse(c);ac.name=tag+':'+c.name;ac.uuid=tag+':'+c.name;s.clips[c.name]=ac;   // unique uuid per role: three.js caches actions by clip uuid, and the game's own clips are also called idle/walk/jump (sharing one action stole the game's base layer -> T-pose on hit)
      s.meta[c.name]={dur:c.duration,v:(av&&AvatarKit.set(av)?AvatarKit.set(av).mxK||1:1)*Math.hypot(c.trav?c.trav[0]:0,c.trav?c.trav[1]:0)/Math.max(.1,c.duration)}}s.st='ready';return s}).catch(e=>{s.st='failed';s.err=String(e&&e.message||e);s.p=null;throw e});return s.p}
  // a signature variant (Moves[id].as) animates with the first base move this role has
  function specOf(R,id,vi,have){let s=R.moves[id];if(s&&s.v&&vi!==undefined){const L=have?s.v.filter(x=>have[x.c]):s.v;if(L.length)s=L[vi%L.length]}if(s)return s;const as=(typeof Moves!=='undefined'&&Moves[id]&&Moves[id].as)||[];for(const b of as)if(R.moves[b])return R.moves[b];return R.pack?auto(R,id):null}
  // ---- NIGHTMARE PACK: library clips (sword-and-shield, axe, club, magic, great sword) baked on every humanoid boss rig (tools/mixamo/pack.json, tools/clip_windows.mjs). A move with no hand-made spec gets a real clip chosen by what it IS (kick / spin / overhead / cast / N-hit chain), with windows taken from the clip's hand-speed peaks - so no boss move is ever left without an animation. ----
  const PK={sx_cross:[1.67,[.35,.53],[.75,.93]],sx_combo:[3.53,[.55,.73],[1.15,1.33],[1.75,1.93],[2.35,2.53]],sx_high:[1.3,[.49,.67]],sx_low:[1.73,[.62,.8]],sx_pow:[2.43,[.65,.83],[1.25,1.43]],sx_jump:[2.33,[1.12,1.3]],sx_kick:[1.2,[.39,.57]],sx_down:[1.5,[.52,.7],[.99,1.17]],sx_hilt:[1,[.19,.37]],
    ax_spin:[2.5,[.49,.67],[.82,1]],ax_three:[4.2,[.85,1.03],[1.52,1.7],[2.42,2.6]],ax_down:[2.27,[.79,.97]],ax_back:[3.17,[.65,.83],[1.29,1.47]],ax_jump:[3.67,[1.62,1.8]],bl_two:[5.43,[1.32,1.5],[2.69,2.87],[3.79,3.97]],bl_over:[4,[1.35,1.53]],bl_knee:[6,[1.32,1.5]],
    g_gcombo:[3.27,[.69,.87],[1.19,1.37],[1.69,1.87],[2.09,2.27]],g_spinrun:[1.87,[.55,.73],[.95,1.13]],g_pslash:[1.8,[.39,.57],[.67,.82]],g_low:[1.83,[.69,.87],[1.19,1.37]],g_down:[1.27,[.49,.67]],g_skick:[1.73,[.25,.43],[.55,.73],[.95,1.13]],g_spkick:[1.5,[.49,.67],[.85,1.03]]};
  const CASTS=[['mg_one',1.5],['mg_two',1.6],['mg_wide',1.6],['mg_res',1.5],['mg_gs',2.4],['mg_throw',1.5]];
  const hashId=id=>{let h=7;for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))>>>0;return h};
  function auto(R,id){
    const cache=R.auto||(R.auto={});if(id in cache)return cache[id];
    const m=typeof Moves!=='undefined'&&Moves[id];if(!m||!m.phases)return cache[id]=null;
    if(/^blink/.test(id))return cache[id]=R.moves.blink||{c:'power',t0:0,e:.7};
    const act=m.phases.filter(p=>p.k==='active').length,hs=hashId(id),ok=n=>PK[n]&&(n.charAt(0)!=='g'||R.g);
    const pick=pool=>{const a=pool.filter(ok);return a.length?a[hs%a.length]:null};
    if(!act){const c=CASTS[hs%CASTS.length],hasC=!!R.pack&&true;return cache[id]={c:c[0],t0:0,e:c[1]}}
    let pool;
    if(/kick|bash|shove|pommel|hilt|stomp/.test(id))pool=['sx_kick','g_skick','sx_hilt','g_spkick'];
    else if(/spin|cyclone|tempest|whirl|sweep|ring|wheel|tengu|blade/.test(id))pool=['ax_spin','g_spinrun','ax_back'];
    else if(/leap|jump|fall|crow|wyrm|heaven|plunge|crown|splitter|hang|ruin|world|sunder|break|maul|slam|rend|kings|verdict|execut|moon/.test(id))pool=['bl_over','ax_down','g_down','ax_jump','sx_jump','bl_knee'];
    else pool=act===1?['sx_high','sx_low','ax_down','g_down','sx_hilt']:act===2?['sx_cross','sx_pow','sx_down','ax_back','g_pslash','g_low']:act===3?['ax_three','bl_two','g_gcombo']:['sx_combo','g_gcombo'];
    let c=pick(pool.filter(n=>PK[n]&&PK[n].length-1>=act));if(!c)c=pick(pool)||'sx_combo';
    const P=PK[c],W=P.slice(1),d=P[0];let hh=[];for(let k=0;k<act;k++)hh.push(W[k%W.length]);
    if(act>W.length){const q=ok('bl_two')?'bl_two':'sx_combo',Q=PK[q];return cache[id]={seq:hh.map((h,k)=>k<W.length?{c,h,t0:k?undefined:Math.max(0,W[0][0]-.5),e:undefined}:{c:q,h:Q[1+(k-W.length)%(Q.length-1)],t0:Math.max(0,Q[1][0]-.5),e:k===act-1?Math.min(Q[0],Q[Q.length-1][1]+.55):undefined})}}
    return cache[id]={c,t0:Math.max(0,W[0][0]-.5),h:hh,e:Math.min(d,hh[hh.length-1][1]+.55)}}
  function make(q,role){
    const R=ROLES[role],I={st:'none',role,A:{},ws:{},gT:0,sT:0,dT:0,sw:0,lastLight:-1e9,ready:()=>I.st==='ready',variant:'light_b',alt:{},plans:{},tmem:{}};
    I.bh=0;I.ph=0;I.blockHit=()=>{I.bh=.45};I.parryHit=()=>{I.ph=.4;I.pv=((I.pv||0)+1)%3};I.dodgeClips=()=>!!(R.dg&&I.A&&I.A.d_roll);I.dgCls=null;I.mode=null;I.mt=0;I.wakeP=0;I.wakeDone=false;I.setMode=m=>{I.mode=m;I.mt=0;I.wakeP=m==='wake'?0:1;I.wakeDone=false};
    I.pickAlt=()=>{};I.nextLight=()=>'light_b';
    let names=[];
    const init=s=>{if(R.emo&&typeof EMO!=='undefined'){const T=(q.av&&typeof AvatarKit!=='undefined'&&AvatarKit.emoTable&&AvatarKit.emoTable(q))||EMO.clips;for(const n of R.emo){const c=T[n]||EMO.clips[n];if(c&&!s.clips['e_'+n]){const ac=c.clone();ac.name=(q.av?q.av+'/':'')+role+':e_'+n;ac.uuid=ac.name;s.clips['e_'+n]=ac;s.meta['e_'+n]={dur:c.duration,v:0}}}}   // the emote library's clips join this role's set (e_jab, e_cross ...)
      if(R.fxMoves&&s.clips.fx_jab){if(!R.moves0)R.moves0=R.moves;R.moves=Object.assign({},R.moves0,R.fxMoves);R.loco={...R.loco,idle:'fx_idle'};R.guard='fx_guard';if(s.clips.fx2_idle)R.loco={...R.loco,idle:'fx2_idle',walk:'fx2_fwd',run:'fx2_fwd',back:'fx2_bwd',sl:'fx2_stepl',sr:'fx2_stepr'}}   // boxing-stance bounce and steps for idle / walk / back / strafe
      const used=new Set(Object.values(R.loco));if(R.dg)used.add('nj_run');if(R.guard)used.add(R.guard);if(R.parry)for(const q of R.parry)used.add(q.c);if(R.dorm)used.add(R.dorm);if(R.wake)used.add(R.wake.c);if(R.death)used.add(R.death);if(R.hit)used.add(R.hit);if(R.dg)for(const k in R.dg)used.add(R.dg[k][0]);if(R.px)for(const n of PXN)used.add(n);
      for(const m of Object.values(R.moves)){for(const g of norm(m))used.add(g.c);if(m.v)for(const x of m.v)used.add(x.c)}
      if(R.hr)for(const n of HR)used.add(n);if(R.kn)for(const n of['gw_kneel','gw_pray','power'])used.add(n);if(R.dsv)for(const n of['ds_victim','ds_side','ds_up'])used.add(n);
      if(R.pack){for(const n in PK)used.add(n);for(const c of CASTS)used.add(c[0])}   // the auto-assigned clips (nightmare pack) are not in R.moves, but they need mixer actions too
      if(R.dojo)for(const n of ['fx_hit_hl','fx_hit_hr','fx_hit_hs','fx_hit_b','fx_hit_st','fx_hit_big','fx_ko','fx_blockreact','kk_blockhit','kk_dodge_b','kk_dodge_f','kk_dodge_l','kk_dodge_r','e_roll','fx2_dodge_f','fx2_dodge_b','fx2_hit_f','fx2_hit_bk','fx2_hit_l','fx2_hit_r','fx2_rocked','fx2_flip','fx2_thrown','fx2_down','fx2_getup','fx2_block_l','fx2_block_r','fx2_block_in'])used.add(n);
      names=[...used].filter(n=>s.clips[n]);I.names=names;I.S=s;
      for(const n of names){const a=q.mixer.clipAction(s.clips[n]);a.enabled=false;a.setEffectiveWeight(.0001);I.A[n]=a;I.ws[n]=0}I.st='ready'};
    const load=()=>fetchRole(role,q.av).then(s=>R.emo&&typeof loadEmotes==='function'?loadEmotes().catch(()=>0).then(()=>s):s).then(init).catch(e=>{I.st='failed';I.err=String(e&&e.message||e);setTimeout(()=>{if(I.st!=='ready')load()},6000)});load();
    const planOf=mv=>{const k=mv.id+'#'+(I.vn||0)%12,sp=specOf(R,mv.id,I.vn||0,I.S.clips);return I.plans[k]||(I.plans[k]=sp?plan(mv.phases,sp,c=>I.S.clips[c]?I.S.clips[c].duration:9):null)};
    I.update=(f,fr,loco,dt,on)=>{
      if(I.st!=='ready')return false;const A=I.A,tgt={},tm={},tsc={};for(const n of names)tgt[n]=0;
      if(R.dojo){const at=f.act==='attack'&&f.mv;if(at&&(!I.wasAtk||I.lastId!==f.mv.id)){const sp=R.moves[f.mv.id];I.vn=sp&&sp.zv&&f.zn&&sp.zv[f.zn]!==undefined?sp.zv[f.zn]:(I.vn||0)+1+(Math.random()*2|0)}I.wasAtk=!!at;I.lastId=at?f.mv.id:null;if(I.ph>0&&f.act!=='free')I.ph=0}   // a new attack starts: rotate the clip variant
      const fight=on&&f.act!=='dead'&&f.act!=='dodge'&&f.act!=='stun';
      const put=(c,t)=>{if(!A[c])return;tgt[c]=1;tm[c]=Math.max(0,Math.min(t,A[c].getClip().duration-.001))};
      if(I.mode&&f.act!=='dead'){   // dormant: loop the sitting/standing pose; wake: play the draw / roar / power-up clip once, then hand over to combat
        if(I.mode==='sleep'&&R.dorm&&A[R.dorm]){I.mt+=dt;put(R.dorm,I.mt%Math.max(.1,A[R.dorm].getClip().duration-.02))}
        else if(I.mode==='wake'&&R.wake&&A[R.wake.c]){I.mt+=dt*R.wake.rate;const W=R.wake;I.wakeP=Math.min(1,(I.mt)/(W.t1-W.t0));put(W.c,W.t0+I.mt);if(W.t0+I.mt>=W.t1){I.mode=null;I.wakeDone=true}}
        else I.mode=null}
      else if(f.act==='stun')I.sT+=dt;else I.sT=0;if(!(f.kn>0))I.kt=0;if(f.act==='dead')I.dT+=dt;else{I.dT=0;I.dv=-1}if(f.act!=='dodge')I.dgT=0;
      if(I.mode&&f.act!=='dead'){}
      else if(f.kn>0&&A.gw_kneel&&A.gw_pray&&A.power&&f.act!=='dead'){   // GWYN'S KNEELING (phase 2 cinematic, library): he kneels (standing-to-kneeling-down), holds the prayer, then the power-up clip bursts - f.kn is set while the cinematic plays
        I.kt=(I.kt||0)+dt;const e=I.kt;if(e<1.6)put('gw_kneel',e*1.73);else if(e<3)put('gw_pray',((e-1.6)*1.38)%(A.gw_pray.getClip().duration-.02));else put('power',.35+(e-3)*2.2)}
      else if(R.dojo&&!A.p_deathA&&f.act==='dead'&&A[R.death])put(R.death,I.dT);
      else if(R.dojo&&A.fx_hit_hl&&f.act==='stun'&&f.sk!=='rise'){const HL=['fx_hit_hl','fx_hit_hr','fx_hit_hs','fx_hit_b','fx_hit_st','fx_hit_big'];if(I.sT<=dt*1.5)I.hi=((I.hi||0)+1+(Math.random()*2|0))%HL.length;   // real boxing hit reactions, varied; a stagger is the knocked-back-and-reeling clip
        if(A.fx2_thrown&&f.lm==='throw'&&f.sk!=='stagger'){const L=A.fx2_thrown.getClip().duration;if(A.fx2_getup&&f.stun<=34){const G=A.fx2_getup.getClip().duration;put('fx2_getup',Math.min((34-f.stun)/60*3.4,G-.05))}else put('fx2_thrown',Math.min(.12+I.sT*Math.min(1.8,(L-.3)/Math.max(.6,I.sT+f.stun/60)),L-.05))}   // thrown: sent flying and left lying until the stun ends
        else if(f.sk==='stagger'&&A.fx_ko){if(I.sT<=dt*1.5)I.sg=A.fx2_rocked&&Math.random()<.5?'fx2_rocked':'fx_ko';const c=I.sg||'fx_ko';put(c,Math.min(I.sT*(c==='fx_ko'?.85:1.1),A[c].getClip().duration-.05))}else if(A.fx2_hit_f&&(f.stun+I.sT*60>=22||I.back)){   // a solid hit: the large reaction from the side it came from (the knock-back direction tells which)
          if(I.sT<=dt*1.5){const fw=(f.kx||0)*Math.sin(f.face)+(f.kz||0)*Math.cos(f.face),sd=(f.kx||0)*Math.cos(f.face)-(f.kz||0)*Math.sin(f.face);I.hcl=fw>.35?'fx2_hit_bk':Math.abs(sd)>.55?(sd>0?'fx2_hit_r':'fx2_hit_l'):'fx2_hit_f'}
          const c=I.hcl||'fx2_hit_f',L=A[c].getClip().duration;put(c,Math.min(.1+I.sT*1.5,L-.05))}
        else{if(I.sT<=dt*1.5&&f.hz){const Z=f.hz==='h'?['fx_hit_hl','fx_hit_hr','fx_hit_hs']:f.hz==='m'?['fx_hit_b','fx_hit_st']:['fx_hit_st','fx_hit_b'];I.hz=Z[(I.hi||0)%Z.length]}else if(I.sT<=dt*1.5)I.hz=null;const c=I.hz&&A[I.hz]?I.hz:HL[I.hi||0];put(c,Math.min(I.sT*1.1,A[c].getClip().duration-.05))}}
      else if(R.dojo&&!A.p_hitc&&f.act==='stun'&&A[R.hit]){const d=A[R.hit].getClip().duration,sg=f.sk==='stagger';if(I.sT<=dt*1.5)I.hv=(I.hv||0)^1;put(R.hit,sg?Math.min(I.sT*.6,d-.05):Math.min(I.sT*(I.hv?1:1.15),d-.05))}   // a flinch plays at once (alternating pace), a stagger is a slower, held wobble
      else if((I.ds>0||I.dsA>0)&&A.ds_victim&&A.ds_side&&A.ds_up){   // DEATH'S SENTENCE, victim half (library): doubled over and hauled (hell-slammer victim), thrown (being-thrown-to-the-side) onto the floor, then the getting-up clip
        if(I.ds>0)put('ds_victim',2+Math.min(1,I.ds/1.3)*1.4);else if(I.dsA<.5)put('ds_side',1.35+I.dsA/.5*.95);else put('ds_up',.7+Math.min(1,(I.dsA-.5)/.45)*1.1)}
      else if(R.dg&&f.act==='dodge'&&f.side===2&&A.nj_run){I.dgCls='flash';put('nj_run',.15+Math.min(1,(f.pt+1)/14)*.5)}   // Flash Step: the ninja sprint clip scrubbed over the 14-tick dash
      else if(R.dg&&f.act==='dodge'&&f.dir&&A.d_roll){const dx=f.dir[0],dz=f.dir[1],fw=dx*Math.sin(f.face)+dz*Math.cos(f.face),sd=dx*Math.cos(f.face)-dz*Math.sin(f.face),cls=fw<-.5?'back':Math.abs(sd)>.6&&!(fw>.75)?(sd>0?'l':'r'):'roll',D=R.dg[cls],u=Math.max(0,Math.min(1,(f.pt+1)/(f.side?16:22)));I.dgCls=cls;const cn=A[D[0]]?D[0]:'d_roll',e=D[0]===cn?D:R.dg.roll;put(cn,e[1]+(e[2]-e[1])*u*u*(3-2*u)*.35+(e[2]-e[1])*u*.65)}
      else if(R.dojo&&f.act==='dodge'&&(A.kk_dodge_b||A.e_roll)){if(!I.dgT){const vf=loco?loco.vf:0,vs=loco?loco.vs:0;I.dgK=Math.hypot(vf,vs)<.4?'kk_dodge_b':Math.abs(vs)>Math.abs(vf)?(vs>0?'kk_dodge_l':'kk_dodge_r'):(vf>0?'kk_dodge_f':'kk_dodge_b');if(A.fx2_dodge_b&&(I.dgK==='kk_dodge_b'||I.dgK==='kk_dodge_f'))I.dgK=I.dgK==='kk_dodge_f'?'fx2_dodge_f':'fx2_dodge_b'}I.dgT=(I.dgT||0)+dt;if(A[I.dgK])put(I.dgK,I.dgT*(I.dgK.startsWith('fx2')?2.2:1.15));else put('e_roll',.12+I.dgT*2.7)}
      else if(R.native&&f.act==='dead'&&R.px&&A.p_deathA){   // a random one of the three pack deaths (or his own) each time he falls
        if(I.dv===undefined||I.dv<0){const L=PXD.filter(n=>A[n]).concat(R.death&&A[R.death]?[R.death]:[]);I.dvL=L;I.dv=Math.floor(Math.random()*L.length)}put(I.dvL[I.dv],I.dT)}
      else if(R.native&&f.act==='dead'&&R.death&&A[R.death])put(R.death,I.dT);            // natively rigged foes have no game hit/death overlay: play the clip themselves
      else if(R.native&&f.act==='stun'&&f.sk==='rise'&&R.death&&A[R.death]){   // the phase fall: he drops (death clip), lies there, then the clip plays BACKWARDS as he gets up
        const D=Math.min(2.2,A[R.death].getClip().duration-.05),T=336/60,t=I.sT;put(R.death,t<D?t:t<T-D?D:Math.max(0,D-(t-(T-D))))}
      else if(R.native&&f.act==='stun'&&R.px&&A.p_knock&&f.sk==='stagger'){const kd=A.p_knock.getClip().duration;if(I.sT<kd)put('p_knock',I.sT);else put('p_hurt',(I.sT-kd)%1.6)}   // a stagger: thrown back, then the hurt loop
      else if(R.native&&f.act==='stun'&&R.hr&&f.sk!=='rise'&&A.hr_chest){   // REAL hit reactions (library: punch / sword impact / head / kidney / side / left / big / uppercut), a different one most hits. The old p_hitc / p_hith flinch clips are almost a held T-pose on these rigs - that was the 'T-pose whenever I hit him'.
        if(I.sT<=dt*1.5)I.hn=((I.hn||0)+1+(Math.random()*(HR.length-1)|0))%HR.length;const hn=HR[I.hn||0],hc=A[hn]||A.hr_chest;put(A[hn]?hn:'hr_chest',Math.min(I.sT*1.7,hc.getClip().duration-.05))}
      else if(R.native&&f.act==='stun'&&R.px&&A.p_hitc&&f.sk!=='rise'){if(I.sT<=dt*1.5)I.hv=(I.hv||0)^1;put(I.hv?'p_hith':'p_hitc',I.sT)}   // flinches alternate chest / head
      else if(R.native&&f.act==='stun'&&R.hit&&A[R.hit])put(R.hit,I.sT);
      else if(!R.native&&R.px&&A.p_hitc&&f.act==='stun'&&f.sk!=='rise'){   // the player: thrown back on a stagger, flinches (chest / head) otherwise
        if(f.sk==='stagger'&&A.p_knock){const kd=A.p_knock.getClip().duration;if(I.sT<kd)put('p_knock',I.sT);else put('p_hurt',(I.sT-kd)%1.6)}
        else{if(I.sT<=dt*1.5)I.hv=(I.hv||0)^1;put(I.hv?'p_hith':'p_hitc',I.sT)}}
      else if(!R.native&&R.px&&A.p_deathA&&f.act==='dead'){if(I.dv===undefined||I.dv<0){I.dvL=PXD.filter(n=>A[n]);I.dv=Math.floor(Math.random()*I.dvL.length)}put(I.dvL[I.dv],I.dT)}
      else if(fight){
        const mv=f.mv,spec=mv&&specOf(R,mv.id,I.vn||0,I.S.clips);
        if(f.act==='charge'&&spec&&spec.ch){const s=norm(spec)[0];put(s.c,spec.ch[0]+(spec.ch[1]-spec.ch[0])*ease(f.c/16))}
        else if(f.act==='charge'){const m=R.moves.heavy;if(m&&m.ch)put(m.c,m.ch[0]+(m.ch[1]-m.ch[0])*ease(f.c/16))}
        else if(f.act==='attack'&&f.ph&&f.ph[f.pi]&&mv){const pl=planOf(mv),e=pl&&pl[f.pi];
          if(e){const n=f.ph[f.pi].n||1;let p=Math.min(1,(f.pk+fr)/n);if(R.dojo){const kd=f.ph[f.pi].k;p=kd==='startup'?p*(.45+.55*p):kd==='active'?p:1-(1-p)*(1-p*.4)}let a=e.a;   // anticipation: the wind-up eases in and the strike snaps; the recovery settles
          if(spec&&spec.ch&&f.pi===0)a=Math.max(a,spec.ch[1]);put(e.c,a+(e.b-a)*p)}}
        else if(f.pry>0&&f.act==='free'&&R.parry&&A[R.parry[0].c]){   // PARRY: a full sweep of the blade across the body (alternating sides), snapping in over the first 60% of the window, then held in guard
          if(f.pry>(I.lp||0))I.pa=(I.pa||0)^1;I.lp=f.pry;const q=R.parry[I.pa],u=(26-f.pry)/26,k=ease(Math.min(1,u/.55));put(q.c,q.a+(q.b-q.a)*k)}
        else if(I.flick&&f.act==='free'&&A[I.flick.c]&&(I.flick.t+=dt)<I.flick.d){const k=I.flick;put(k.c,k.a+(k.b-k.a)*ease(k.t/k.d))}   // a parry: a quick sword sweep out of the guard (the game sets I.flick on a deflect)
        else if(R.dojo&&I.ph>0&&f.act==='free'&&A.fx2_block_l){I.ph-=dt;const c=['fx2_block_l','fx2_block_r','fx2_block_in'][I.pv||0],u=.4-I.ph;put(c,Math.min(.06+u*(c==='fx2_block_in'?1.3:2.1),A[c].getClip().duration-.05))}   // a parry: a quick block sweep (alternating sides)
        else if(R.dojo&&I.bh>0&&f.guard&&(A.fx_blockreact||A.kk_blockhit)){I.bh-=dt;if(A.fx_blockreact)put('fx_blockreact',Math.min(1.2,.45-I.bh+.02));else put('kk_blockhit',Math.min(.9,.45-I.bh+.05))}   // a blocked hit: the guard takes the shock
        else if(f.guard&&f.act==='free'&&R.guard&&A[R.guard]){I.gT+=dt;put(R.guard,Math.min(I.gT,A[R.guard].getClip().duration-.05))}
        else{I.gT=0;
          const L=R.loco,sp=loco&&loco.moving?Math.max(.01,Math.hypot(loco.vf,loco.vs)):0;
          if(sp>0){const fw=Math.max(0,loco.vf),bk=Math.max(0,-loco.vf),l=Math.max(0,loco.vs),r=Math.max(0,-loco.vs),k=fw+bk+l+r||1;
            const run=ease((sp-2.2)/1.6),shares=[[L.walk,fw*(1-run)/k],[L.run,fw*run/k],[L.back,bk/k],[L.sl,l/k],[L.sr,r/k]];
            for(const [c,s] of shares){if(!A[c]||s<=0)continue;tgt[c]=Math.min(1,(tgt[c]||0)+s);const ref=I.S.meta[c].v||1.4;tsc[c]=Math.max(.55,Math.min(1.6,sp/(ref*(c===L.run?1:1.15))))*(R.rev&&R.rev.back&&c===L.back&&bk>.5?-1:1)}
            // never stand still while the share bookkeeping rounds to < 1: top up with the closest gait
            let t=0;for(const c in tgt)t+=tgt[c];if(t<.05)tgt[L.walk]=1}
          else if(A[L.idle])tgt[L.idle]=1}}
      if(R.native&&!names.some(n=>tgt[n]>0)&&A[R.loco.idle])tgt[R.loco.idle]=1;   // stunned / dodging / no clip for this state: never fall back to the bind (T) pose
      // smooth the shares, then convert to three.js weights relative to the game's own base layer (see Blend.js); loops free-run, attacks are scrubbed
      const k=1-Math.exp(-dt*(f.act==='attack'?(R.dojo?24:30):(R.dojo?20:16)));let sum=0;
      for(const n of names){I.ws[n]+=(tgt[n]-I.ws[n])*k;if(I.ws[n]<.01&&tgt[n]===0)I.ws[n]=0;sum+=I.ws[n]}
      const tot=Math.min(1,sum),W=Blend.w(tot);let any=false;
      for(const n of names){const a=A[n],rr=I.ws[n];
        if(rr<=0){if(a.enabled){a.enabled=false;a.setEffectiveWeight(.0001)}continue}
        any=true;if(!a.enabled){a.enabled=true;a.play();a.paused=tm[n]!==undefined}
        a.setEffectiveWeight(R.native?Math.max(.0001,rr):sum>0?W*rr/sum:.0001);
        if(tm[n]!==undefined){a.paused=true;a.time=tm[n]}else{a.paused=false;a.setEffectiveTimeScale(tsc[n]||1)}}
      if(any)q.mixer.update(0);
      return any};
    I.off=()=>{for(const n of names){const a=I.A[n];if(a&&a.enabled){a.enabled=false;a.setEffectiveWeight(.0001)}I.ws[n]=0}I.gT=0};
    return I}
  return{BUILD,ROLES,plan,norm,specOf,make,fetch:fetchRole,shared:SH}})();
if(typeof module!=='undefined')module.exports=WardenMX;
