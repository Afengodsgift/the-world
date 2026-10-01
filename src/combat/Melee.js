// Pan melee system. Equip/unequip + aggressive swing. Depends on globals
// (S, others, me, chan, myId, banner, updateHud) set up before gameplay.
const PAN_ENABLED = true;
let panEquipped = false;
let smacks = 0;
try { smacks = +localStorage.getItem('w4sm') || 0; } catch (e) {}
let lastSmack = -9;
let lastEquip = -9;

function bonk() {
  try {
    const a = new (window.AudioContext || webkitAudioContext)();
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(220, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, a.currentTime + 0.18);
    o.connect(g); g.connect(a.destination);
    g.gain.setValueAtTime(0.45, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.22);
    o.start(); o.stop(a.currentTime + 0.22);
  } catch (e) {}
}

function togglePan() {
  const t = performance.now() / 1000;
  if (t - lastEquip < 0.35) return;
  lastEquip = t;
  panEquipped = !panEquipped;
  if (me && me.userData) {
    me.userData.panEquipped = panEquipped;
    if (me.userData.pan) me.userData.pan.visible = panEquipped;
  }
  banner(panEquipped ? 'Pan equipped 🍳' : 'Pan put away', '🍳');
  if (navigator.vibrate) navigator.vibrate(panEquipped ? 25 : 15);
  updateHud && updateHud();
}

function smack() {
  if (!PAN_ENABLED || !panEquipped || !others.size || S.flying) return;
  const t = performance.now() / 1000;
  if (t - lastSmack < 0.48) return;
  lastSmack = t;
  // aggressive swing
  me.userData.swing = 1.35;
  const o = others.values().next().value;
  const p = o.group.position;
  const dxo = p.x - S.x, dzo = p.z - S.z;
  const d = Math.hypot(dxo, dzo);
  if (d > 3.6) return;
  const fx = Math.sin(S.rot), fz = Math.cos(S.rot);
  const nx = dxo / d, nz = dzo / d;
  const dot = fx * nx + fz * nz;
  if (dot < 0.28) return;
  bonk();
  if (navigator.vibrate) navigator.vibrate(55);
  smacks++;
  try { localStorage.setItem('w4sm', smacks); } catch (e) {}
  updateHud && updateHud();
  banner('You bonked ' + (o.group.userData.nm || 'them') + '!', '🍳');
  if (chan) chan.send({ type: 'broadcast', event: 'sm', payload: { from: myId, dx: nx, dz: nz } });
}

function smackTick(dt) {
  // keep pan visibility in sync in case dress() finished late
  if (me && me.userData && me.userData.pan) {
    me.userData.pan.visible = !!panEquipped;
  }
}

function onSmacked(p) {
  if (S.iframe > 0) return;
  S.iframe = 0.55;
  S.hurt = 0.55;
  // stronger knockback for aggressive feel
  S.kx += p.dx * 16;
  S.kz += p.dz * 16;
  S.vy = Math.max(S.vy, 5.2);
  bonk();
  if (navigator.vibrate) navigator.vibrate([35, 40, 35]);
  const o = others.size ? others.values().next().value : null;
  banner((o && o.group.userData.nm || 'Your partner') + ' bonked you!', '🍳');
}
