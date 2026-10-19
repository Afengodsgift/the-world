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
    player:{file:'assets/warden_mx_player.json',guard:'guard',
      loco:{idle:'idle',walk:'walk',run:'run',back:'back',sl:'sl',sr:'sr'},
      moves:{
        cinder:{c:'slash3',t0:.3,h:[[.66,.94]],e:1.5},armada:{c:'armada',t0:0,h:[[.6,1.05]],e:1.6},meia:{c:'meia',t0:0,h:[[.6,1.05]],e:1.7},
        shove:{c:'kick',t0:0,h:[[.05,.3]],e:.9},lunge:{c:'slash4',t0:.3,h:[[.45,.8]],e:1.25},whirl:{c:'slash5',t0:.62,h:[[.92,1.23]],e:1.35},martelo:{c:'martelo',t0:0,h:[[.28,.55]],e:1.3},rasteira:{c:'rast',t0:0,h:[[.25,.5]],e:1.8},
        light:{c:'slash',t0:.2,h:[[.46,.68]],e:1.15},
        light2:{c:'atk4',t0:0,h:[[.34,.52]],e:.9},
        light3:{c:'slash5',t0:.1,h:[[.36,.68]],e:1.2},
        advance:{c:'atk2',t0:.1,h:[[.3,.74]],e:1.2},
        evade:{c:'slash3',t0:.4,h:[[.66,.94]],e:1.5},
        rising:{c:'atk3',t0:.35,h:[[.52,.9]],e:1.6},
        heavy:{c:'atk',t0:.55,ch:[.5,.72],h:[[.9,1.3]],e:2.1}}},
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
        quake:{c:'power',t0:.3,e:2.0}}},
    parasite:{file:'assets/warden_mx_parasite.json',native:true,guard:null,dorm:'breath',wake:{c:'roar',t0:0,t1:3.4,rate:1.1},death:'death',            // the Hollow Warden's real body: Mixamo "Creature" mutant
      loco:{idle:'idle',walk:'walk',run:'run',back:'walk',sl:'walk',sr:'walk'},rev:{back:1},
      moves:{
        sweep:{c:'swipe',t0:.7,h:[[1.12,1.42]],e:2.3},
        slam:{c:'jatk',t0:.8,h:[[1.25,1.7]],e:2.9},
        triple:{seq:[{c:'punch',t0:0,h:[.18,.4],e:.75},{c:'swipe',t0:.9,h:[1.12,1.42],e:1.7},{c:'punch',t0:0,h:[.18,.4],e:1.0}]},
        leap:{c:'jatk',t0:0,h:[[1.25,1.7]],e:2.8},
        cut:{c:'punch',t0:0,h:[[.18,.4]],e:.9},thrust:{c:'punch',t0:0,h:[[.18,.4]],e:.9},
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
        spin:{c:'armada',t0:0,h:[[.6,1.05]],e:1.6},hammer:{c:'martelo',t0:0,h:[[.28,.55]],e:1.3},lowsweep:{c:'rast',t0:0,h:[[.25,.5]],e:1.8},orb:{c:'cast',t0:.85,e:2.5},bolt:{c:'cast2',t0:0,e:1.0},quake:{c:'power',t0:.2,e:1.9}}}};
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
  ROLES.archer={file:'assets/warden_mx_archer.json',native:true,guard:null,dorm:'idle',wake:{c:'power',t0:.3,t1:2.4,rate:1},death:'death',hit:'hit1',     // Erika, the Ashen Huntress: Longbow locomotion + a quick cast clip for the shot + a kick when you get close
    loco:{idle:'idle',walk:'walk',run:'run',back:'back',sl:'sl',sr:'sr'},
    moves:{bolt:{c:'spell',t0:0,e:1.1},orb:{c:'spell',t0:0,e:1.1},cut:{c:'kick',t0:.1,h:[[.5,.85]],e:1.4},thrust:{c:'kick',t0:.1,h:[[.5,.85]],e:1.4},quake:{c:'power',t0:.3,e:2.0}}};
  const BUILD='mx3';const SH={};      // role -> {st,clips,p}
  function fetchRole(role){const s=SH[role]||(SH[role]={st:'none',clips:null,meta:null,p:null});
    if(!s.p)s.p=fetch(ROLES[role].file).then(r=>r.json()).then(j=>{s.clips={};s.meta={};for(const c of j){const ac=THREE.AnimationClip.parse(c);ac.name=role+':'+c.name;ac.uuid=role+':'+c.name;s.clips[c.name]=ac;   // unique uuid per role: three.js caches actions by clip uuid, and the game's own clips are also called idle/walk/jump (sharing one action stole the game's base layer -> T-pose on hit)
      s.meta[c.name]={dur:c.duration,v:Math.hypot(c.trav?c.trav[0]:0,c.trav?c.trav[1]:0)/Math.max(.1,c.duration)}}s.st='ready';return s}).catch(e=>{s.st='failed';s.err=String(e&&e.message||e);s.p=null;throw e});return s.p}
  function make(q,role){
    const R=ROLES[role],I={st:'none',role,A:{},ws:{},gT:0,sT:0,dT:0,sw:0,lastLight:-1e9,ready:()=>I.st==='ready',variant:'light_b',alt:{},plans:{},tmem:{}};
    I.mode=null;I.mt=0;I.wakeP=0;I.wakeDone=false;I.setMode=m=>{I.mode=m;I.mt=0;I.wakeP=m==='wake'?0:1;I.wakeDone=false};
    I.pickAlt=()=>{};I.nextLight=()=>'light_b';
    let names=[];
    fetchRole(role).then(s=>{const used=new Set(Object.values(R.loco));if(R.guard)used.add(R.guard);if(R.dorm)used.add(R.dorm);if(R.wake)used.add(R.wake.c);if(R.death)used.add(R.death);if(R.hit)used.add(R.hit);
      for(const m of Object.values(R.moves))for(const g of norm(m))used.add(g.c);
      names=[...used].filter(n=>s.clips[n]);I.names=names;I.S=s;
      for(const n of names){const a=q.mixer.clipAction(s.clips[n]);a.enabled=false;a.setEffectiveWeight(.0001);I.A[n]=a;I.ws[n]=0}I.st='ready'}).catch(e=>{I.st='failed';I.err=String(e&&e.message||e)});
    const planOf=mv=>I.plans[mv.id]||(I.plans[mv.id]=R.moves[mv.id]?plan(mv.phases,R.moves[mv.id],c=>I.S.clips[c]?I.S.clips[c].duration:9):null);
    I.update=(f,fr,loco,dt,on)=>{
      if(I.st!=='ready')return false;const A=I.A,tgt={},tm={},tsc={};for(const n of names)tgt[n]=0;
      const fight=on&&f.act!=='dead'&&f.act!=='dodge'&&f.act!=='stun';
      const put=(c,t)=>{if(!A[c])return;tgt[c]=1;tm[c]=Math.max(0,Math.min(t,A[c].getClip().duration-.001))};
      if(I.mode&&f.act!=='dead'){   // dormant: loop the sitting/standing pose; wake: play the draw / roar / power-up clip once, then hand over to combat
        if(I.mode==='sleep'&&R.dorm&&A[R.dorm]){I.mt+=dt;put(R.dorm,I.mt%Math.max(.1,A[R.dorm].getClip().duration-.02))}
        else if(I.mode==='wake'&&R.wake&&A[R.wake.c]){I.mt+=dt*R.wake.rate;const W=R.wake;I.wakeP=Math.min(1,(I.mt)/(W.t1-W.t0));put(W.c,W.t0+I.mt);if(W.t0+I.mt>=W.t1){I.mode=null;I.wakeDone=true}}
        else I.mode=null}
      else if(f.act==='stun')I.sT+=dt;else I.sT=0;if(f.act==='dead')I.dT+=dt;else I.dT=0;
      if(I.mode&&f.act!=='dead'){}
      else if(R.native&&f.act==='dead'&&R.death&&A[R.death])put(R.death,I.dT);            // natively rigged foes have no game hit/death overlay: play the clip themselves
      else if(R.native&&f.act==='stun'&&R.hit&&A[R.hit])put(R.hit,I.sT);
      else if(fight){
        const mv=f.mv,spec=mv&&R.moves[mv.id];
        if(f.act==='charge'&&spec&&spec.ch){const s=norm(spec)[0];put(s.c,spec.ch[0]+(spec.ch[1]-spec.ch[0])*ease(f.c/16))}
        else if(f.act==='charge'){const m=R.moves.heavy;if(m&&m.ch)put(m.c,m.ch[0]+(m.ch[1]-m.ch[0])*ease(f.c/16))}
        else if(f.act==='attack'&&f.ph&&f.ph[f.pi]&&mv){const pl=planOf(mv),e=pl&&pl[f.pi];
          if(e){const n=f.ph[f.pi].n||1,p=Math.min(1,(f.pk+fr)/n);let a=e.a;if(spec&&spec.ch&&f.pi===0)a=Math.max(a,spec.ch[1]);put(e.c,a+(e.b-a)*p)}}
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
      const k=1-Math.exp(-dt*(f.act==='attack'?30:16));let sum=0;
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
  return{BUILD,ROLES,plan,norm,make,fetch:fetchRole,shared:SH}})();
if(typeof module!=='undefined')module.exports=WardenMX;
