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
const PAN_REST_Z=Math.PI/2-.45; // resting roll of the pan about its own width axis; the swing animates around this
let smacks=0;try{smacks=+localStorage.getItem('w4sm')||0}catch(e){}
let lastSmack=-9;
function bonk(){try{const a=new(window.AudioContext||webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.type='square';o.frequency.setValueAtTime(180,a.currentTime);o.frequency.exponentialRampToValueAtTime(60,a.currentTime+.15);o.connect(g);g.connect(a.destination);g.gain.setValueAtTime(.35,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.2);o.start();o.stop(a.currentTime+.2)}catch(e){}}
function smack(){
  if(!others.size||S.flying)return;
  const t=performance.now()/1000;if(t-lastSmack<.55)return;lastSmack=t;
  me.userData.swing=1;
  const o=others.values().next().value,p=o.group.position,dxo=p.x-S.x,dzo=p.z-S.z,d=Math.hypot(dxo,dzo);
  if(d>3.4)return;
  const fx=Math.sin(S.rot),fz=Math.cos(S.rot),nx=dxo/d,nz=dzo/d,dot=fx*nx+fz*nz;
  if(dot<.35)return;
  bonk();if(navigator.vibrate)navigator.vibrate(40);
  smacks++;try{localStorage.setItem('w4sm',smacks)}catch(e){}updateHud();
  banner('You bonked '+(o.group.userData.nm||'them')+'!','🍳');
  if(chan)chan.send({type:'broadcast',event:'sm',payload:{from:myId,dx:nx,dz:nz}});
}
function smackTick(dt){}
function onSmacked(p){
  const a=p.from&&others.get(p.from);if(a)a.group.userData.swing=1;
  if(S.iframe>0)return;S.iframe=.6;S.hurt=.5;
  S.kx+=p.dx*13;S.kz+=p.dz*13;S.vy=Math.max(S.vy,4);
  bonk();if(navigator.vibrate)navigator.vibrate([30,40,30]);
  const o=others.size?others.values().next().value:null;
  banner((o&&o.group.userData.nm||'Your partner')+' bonked you!','🍳');
}

