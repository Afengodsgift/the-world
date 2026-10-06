// Dormant melee/combat code (currently pan-only). Gated off entirely by PAN_ENABLED
// below — flip it to re-enable. This is a relocation only: still pan-specific, not
// yet the generic melee/hit-detection/knockback foundation described in the brief
// (Rule 8) — that generalization is future work once a second weapon/action exists
// to prove the abstraction against. Depends on globals defined elsewhere (S, others,
// me, chan, myId, banner, updateHud) via the same forward-reference pattern as every
// other extracted module — fine, since these functions only run during gameplay,
// long after those are set up.
//
// NOT moved here: the few lines inside dress() (index.html) that actually attach the
// pan model to the character's hand bone. That's tightly coupled to dress()'s own
// internals (skeleton/bones) and will move naturally when the player/character
// system is extracted in a later phase — pulling just that fragment out now would
// leave dress() awkwardly split for no real benefit.
const PAN_ENABLED=true;
const PAN_GRIP=[-0.67022,0.74026,-0.03626,-0.03873]; // pan orientation in the RightHand bone for the baked clips (handle held, head ~40deg up/forward in idle, face up); solved from the idle hand pose
const PAN_REST_Z=Math.PI/2-.45; // resting roll of the pan about its own width axis; the swing animates around this
let smacks=0;try{smacks=+localStorage.getItem('w4sm')||0}catch(e){}
let lastSmack=-9;
// Swing arc offset (radians, about the pan's width axis) for swing s: 1 (just started) -> 0 (done). Quick wind-up back, hard slam forward-down, then recover.
function panSwingDelta(s){const p=1-Math.min(1,s);if(p<=0||p>=1)return 0;
  if(p<.22)return -.6*Math.sin(p/.22*Math.PI/2);
  if(p<.5)return -.6+2.5*Math.sin((p-.22)/.28*Math.PI/2);
  return 1.9*Math.cos((p-.5)/.5*Math.PI/2)}
let panOn=false; // pan starts holstered; togglePan() equips/unequips (synced to partner in the 's' state broadcast)
function togglePan(){panOn=!panOn;$('panbtn').style.opacity=panOn?1:.6}
function bonk(){try{const a=WAudio.get();if(!a)return;const o=a.createOscillator(),g=a.createGain();o.type='square';o.frequency.setValueAtTime(180,a.currentTime);o.frequency.exponentialRampToValueAtTime(60,a.currentTime+.15);o.connect(g);g.connect(WAudio.out());g.gain.setValueAtTime(.35,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.2);o.start();o.stop(a.currentTime+.2)}catch(e){}}
function smack(){
  if(!panOn||S.flying)return;
  const t=performance.now()/1000;if(t-lastSmack<.55)return;lastSmack=t;
  me.userData.swing=1;
  if(!others.size)return;
  const o=others.values().next().value,p=o.group.position,dxo=p.x-S.x,dzo=p.z-S.z,d=Math.hypot(dxo,dzo);
  if(d>3.4)return;
  const fx=Math.sin(S.rot),fz=Math.cos(S.rot),nx=dxo/d,nz=dzo/d,dot=fx*nx+fz*nz;
  if(dot<.35)return;
  bonk();if(navigator.vibrate)navigator.vibrate(40);
  smacks++;try{localStorage.setItem('w4sm',smacks)}catch(e){}updateHud();
  o.group.userData.hitReq=1; // the victim's flinch is only triggered on their own phone by onSmacked(); play it on this screen too
  banner('You bonked '+(o.group.userData.nm||'them')+'!','🍳');
  if(chan)chan.send({type:'broadcast',event:'sm',payload:{from:myId,dx:nx,dz:nz}});
}
function smackTick(dt){if(me&&me.userData.pan)me.userData.pan.visible=panOn}
function onSmacked(p){
  const a=p.from&&others.get(p.from);if(a)a.group.userData.swing=1;
  if(me&&!(S.iframe>0))me.userData.hitReq=1; // play the hit-reaction clip
  if(S.iframe>0)return;S.iframe=.6;S.hurt=.5;
  const pan=!!p.from; // pan bonks launch harder than shark bites (which have no sender)
  S.kx+=p.dx*(pan?30:13);S.kz+=p.dz*(pan?30:13);S.vy=Math.max(S.vy,pan?8:4);
  bonk();if(navigator.vibrate)navigator.vibrate([30,40,30]);
  const o=others.size?others.values().next().value:null;
  banner((o&&o.group.userData.nm||'Your partner')+' bonked you!','🍳');
}

