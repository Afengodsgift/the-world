// Bakes THE WORLD's clip sets (assets/anims|emotes|verb_anims|gun_anims|combat_anims|warden_anims.json - all authored against the stock chibi rig, assets/char.glb) onto a
// full-human avatar skeleton built by tools/avatar/build_avatar.mjs.  One output folder per avatar:  <outDir>/<set>.json  +  <outDir>/meta.json
//
//   THREE_NM=<dir containing three/>  node tools/avatar/retarget_clips.mjs <avatar.glb> <outDir> [--rig=assets/char.glb] [--assets=assets] [--report]
//
// Method (world space, per frame; bone names are the game rig's, so no code that looks bones up by name changes):
//   D_b(t)  = Ws_b(t) * Ws_b,rest^-1                 how far the stock bone has swung from ITS rest pose
//   Wn_b(t) = Kw_b(t) * D_b(t) * Wn_b,rest           the same swing applied to the avatar's own rest pose, plus a posture correction Kw
//   local   = Wn_parent(t)^-1 * Wn_b(t)
//  * K_b maps the stock IDLE pose onto an upright, relaxed human stance (spine/neck/head vertical, feet under the hips, arms hanging with a soft elbow).
//    The stock idle is a chibi stance (hips leaning 9 deg, head 15 deg forward, feet wide, arms flared 26 deg); the correction is a constant world offset so every clip
//    keeps its own motion.  For the arm chain it fades out as the arm rises (hanging -> full, above ~70 deg from down -> none), so combat/emote/gun poses stay exact.
//  * HipsCtrl.position: the stock bob is scaled by the leg-length ratio (hipK); on frames where the stock feet are on the ground the hips height is solved so the
//    avatar's lowest sole point sits on the ground too (no floating / sinking with the longer legs).
//  * meta.json records the measured planted-foot speed of walk/jog/sprint so the runtime can time-scale the gait to the real speed (no foot sliding).
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { readGlb } from './glb_io.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..', '..');
const NM = process.env.THREE_NM || path.join(ROOT, 'node_modules');
const T = await import(pathToFileURL(path.join(NM, 'three/build/three.module.js')).href);
const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--')), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [avF, outDir] = pos;
if (!avF || !outDir) { console.error('usage: retarget_clips.mjs <avatar.glb> <outDir>'); process.exit(1); }
const RIG = path.resolve(ROOT, opt.rig || 'assets/char.glb'), ASSETS = path.resolve(ROOT, opt.assets || 'assets');
const SETS = ['anims', 'emotes', 'verb_anims', 'gun_anims', 'combat_anims', 'warden_anims', 'warden_mx_player', 'warden_mx_duelist', 'warden_px_player'];
const RUN = opt.only ? String(opt.only).split(',') : SETS;   // --only=a,b : bake just those sets and merge them into the avatar's existing meta.json
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z), Q = (...a) => new T.Quaternion(...a), I = () => new T.Quaternion();
const deg = x => x * Math.PI / 180;

// ---------- rig FK ----------
class Rig {
  constructor(json) {
    this.nodes = json.nodes; const N = this.nodes; this.par = N.map(() => -1); N.forEach((n, i) => (n.children || []).forEach(c => this.par[c] = i));
    this.by = new Map(N.map((n, i) => [n.name, i]));
    this.t = N.map(n => V(...(n.translation || [0, 0, 0]))); this.q = N.map(n => Q(...(n.rotation || [0, 0, 0, 1]))); this.s = N.map(n => V(...(n.scale || [1, 1, 1])));
    this.order = []; const seen = new Set(); const visit = i => { if (seen.has(i)) return; seen.add(i); if (this.par[i] >= 0) visit(this.par[i]); this.order.push(i); }; N.forEach((_, i) => visit(i));
    this.skinJoints = new Set((json.skins?.[0]?.joints || []).map(j => N[j].name));
  }
  // world matrices; rot: Map name->local quaternion override; hips: local position override for HipsCtrl
  fk(rot, hips) {
    const W = new Array(this.nodes.length), m = new T.Matrix4();
    for (const i of this.order) {
      const n = this.nodes[i]; const q = rot && rot.get(n.name) || this.q[i], t = hips && n.name === 'HipsCtrl' ? hips : this.t[i];
      m.compose(t, q, this.s[i]); W[i] = this.par[i] < 0 ? m.clone() : W[this.par[i]].clone().multiply(m);
    }
    return W;
  }
  rotOf(W, name) { return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().extractRotation(W[this.by.get(name)])); }
  posOf(W, name) { return V().setFromMatrixPosition(W[this.by.get(name)]); }
}
const stock = new Rig(readGlb(RIG).json), av = new Rig(readGlb(avF).json);
const hipK = av.nodes.find(n => n.extras && n.extras.hipK)?.extras.hipK || 1;
const BONES = ['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head'];
for (const s of ['Left', 'Right']) BONES.push(...['Shoulder', 'Arm', 'ForeArm', 'Hand', 'HandIndex1', 'HandIndex2', 'HandIndex3', 'HandThumb1', 'HandThumb2', 'UpLeg', 'Leg', 'Foot', 'Toes'].map(b => s + b));
const ARM = /(Shoulder|Arm|ForeArm|Hand)$/, FINGER = /HandIndex|HandThumb/;
const sRest = stock.fk(), nRest = av.fk();
const FINGER_CURL = 0.45;   // fraction of the stock finger curl removed while the arm hangs (the chibi hands are fists; a relaxed human hand is open)
const sRestQ = {}, nRestQ = {}; for (const b of BONES) { sRestQ[b] = stock.rotOf(sRest, b); nRestQ[b] = av.rotOf(nRest, b); }
const hipsRestStock = stock.t[stock.by.get('HipsCtrl')].clone();
const ground = Math.min(...['LeftToes', 'RightToes'].map(n => stock.posOf(sRest, n).y)) - .0132;   // sole of the stock toes at rest = the stock's ground

// ---------- clip IO ----------
function readSet(name) { const f = path.join(ASSETS, name + '.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(j) ? { wrap: null, clips: j } : { wrap: j, clips: j.clips }; }
function sampleTrack(tr, t) {   // quaternion or vector track at time t
  const n = tr.times.length, w = tr.type === 'quaternion' ? 4 : 3; if (n === 1) return tr.values.slice(0, w);
  let i = 0; while (i < n - 2 && tr.times[i + 1] <= t) i++;
  const a = tr.times[i], b = tr.times[i + 1], f = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
  if (w === 4) { const qa = Q(...tr.values.slice(i * 4, i * 4 + 4)), qb = Q(...tr.values.slice(i * 4 + 4, i * 4 + 8)); return qa.slerp(qb, f).toArray(); }
  return [0, 1, 2].map(k => tr.values[i * 3 + k] + (tr.values[i * 3 + 3 + k] - tr.values[i * 3 + k]) * f);
}

// ---------- the relaxed standing pose R_b (world rotations on the avatar's own rest) ----------
const nP = n => av.posOf(nRest, n);
const swing = (from, to, restQ) => new T.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize()).multiply(restQ);
const Rpose = {}; for (const b of BONES) Rpose[b] = nRestQ[b].clone();
for (const [S, s] of [['Left', 1], ['Right', -1]]) {
  const sh = nP(S + 'Arm'), el = nP(S + 'ForeArm'), ha = nP(S + 'Hand'), ix = nP(S + 'HandIndex1');
  Rpose[S + 'Arm'] = swing(el.clone().sub(sh), V(s * .13, -.985, .07), nRestQ[S + 'Arm']);            // upper arm hangs ~8 deg out, a touch forward
  Rpose[S + 'ForeArm'] = swing(ha.clone().sub(el), V(s * .06, -.955, .29), nRestQ[S + 'ForeArm']);     // soft elbow, ~17 deg
  Rpose[S + 'Hand'] = swing(ix.clone().sub(ha), V(s * .05, -.93, .36), nRestQ[S + 'Hand']);
}

// ---------- the stock idle pose -> K_b ----------
const idleSet = readSet('anims').clips, idleClip = idleSet.find(c => c.name === 'idle');
function stockFrame(clip, t, tracksByBone) {
  const rot = new Map(); let hips = null;
  for (const tr of clip.tracks) { const b = tr.name.split('.')[0]; if (tr.name.endsWith('.quaternion')) rot.set(b, Q(...sampleTrack(tr, t))); else if (b === 'HipsCtrl') hips = V(...sampleTrack(tr, t)); }
  return { rot, hips };
}
const idleF = stockFrame(idleClip, 0), idleW = stock.fk(idleF.rot, idleF.hips);
const K = {}, hipsIdle = idleF.hips.clone();
for (const b of BONES) {
  const D = stock.rotOf(idleW, b).multiply(sRestQ[b].clone().invert()), Widle = D.multiply(nRestQ[b]);
  K[b] = FINGER.test(b) ? I() : Rpose[b].clone().multiply(Widle.invert());
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const down = V(0, -1, 0);
// ---------- wrist limiter: the chibi hands sit bent at the wrist in most clips; a human wrist only flexes ~15-25 deg ----------
// dev = hand rotation relative to the forearm, measured against the avatar's rest; split into twist about the forearm axis (kept: pronation/grip roll) and swing (the bend: soft-limited)
const WRIST_LIMIT = deg(22);
const forearmAxisLocal = {};   // forearm bone axis expressed in the forearm's own frame (bone points at the hand)
for (const S of ['Left', 'Right']) forearmAxisLocal[S] = nP(S + 'Hand').sub(nP(S + 'ForeArm')).normalize().applyQuaternion(nRestQ[S + 'ForeArm'].clone().invert());
function limitWrist(S, Wfore, Whand) {
  const relRest = nRestQ[S + 'ForeArm'].clone().invert().multiply(nRestQ[S + 'Hand']);
  const rel = Wfore.clone().invert().multiply(Whand);            // hand in forearm frame
  const dev = rel.clone().multiply(relRest.clone().invert());    // deviation from rest, in forearm frame
  const ax = forearmAxisLocal[S];
  // twist = component of dev about ax
  const proj = ax.clone().multiplyScalar(dev.x * ax.x + dev.y * ax.y + dev.z * ax.z), tw = new T.Quaternion(proj.x, proj.y, proj.z, dev.w);
  if (tw.lengthSq() < 1e-12) tw.set(0, 0, 0, 1); else tw.normalize();
  const sw = dev.clone().multiply(tw.clone().invert());          // swing = the bend
  const ang = 2 * Math.acos(Math.min(1, Math.abs(sw.w)));
  const lim = ang > 1e-4 ? WRIST_LIMIT * Math.tanh(ang / WRIST_LIMIT) : ang;
  const sw2 = ang > 1e-4 ? I().slerp(sw, lim / ang) : sw;
  return Wfore.clone().multiply(sw2.multiply(tw).multiply(relRest));
}
// ---------- sole points (heel + toe of each foot) in the foot/toe local frames ----------
const solePts = (rig, W) => {   // heel (under the ankle) and ball (under the toe joint) of each foot, stored in that bone's local frame
  const pts = [];
  for (const S of ['Left', 'Right']) for (const n of ['Foot', 'Toes']) {
    const i = rig.by.get(S + n), p = V().setFromMatrixPosition(W[i]);
    pts.push({ node: i, local: V(p.x, ground, p.z).applyMatrix4(W[i].clone().invert()) });
  }
  return pts;
};
const sStockSole = solePts(stock, sRest), nSole = solePts(av, nRest);
const lowest = (W, pts) => Math.min(...pts.map(p => V().copy(p.local).applyMatrix4(W[p.node]).y));
const gapStock = (W) => lowest(W, sStockSole) - ground;

// ---------- retarget one clip ----------
const stats = { frames: 0, minSoleRel: 1e9, maxSoleRel: -1e9 };
function retargetClip(clip, { solve = true } = {}) {
  const qTracks = clip.tracks.filter(t => t.name.endsWith('.quaternion')), hTrack = clip.tracks.find(t => t.name === 'HipsCtrl.position');
  const base = qTracks.reduce((a, t) => t.times.length > a.times.length ? t : a, qTracks[0] || hTrack);
  const times = base.times.slice(), tracked = new Set(qTracks.map(t => t.name.split('.')[0]));
  const outQ = {}; for (const b of tracked) outQ[b] = []; const outH = [];
  const prev = {};
  for (let k = 0; k < times.length; k++) {
    const fr = stockFrame(clip, times[k]), hipsS = fr.hips || hipsIdle;
    const sW = stock.fk(fr.rot, hipsS);
    const Wn = {};
    // arm weight from the stock upper-arm elevation
    const wArm = {}, wFore = {};
    for (const S of ['Left', 'Right']) {
      const u = stock.posOf(sW, S + 'ForeArm').sub(stock.posOf(sW, S + 'Arm')).normalize(), f = stock.posOf(sW, S + 'Hand').sub(stock.posOf(sW, S + 'ForeArm')).normalize();
      const elev = Math.acos(Math.max(-1, Math.min(1, u.dot(down)))) * 180 / Math.PI, bend = Math.acos(Math.max(-1, Math.min(1, u.dot(f)))) * 180 / Math.PI;
      wArm[S] = 1 - smooth(30, 70, elev); wFore[S] = wArm[S] * (1 - smooth(40, 85, bend));
    }
    for (const b of BONES) {
      const D = stock.rotOf(sW, b).multiply(sRestQ[b].clone().invert());
      let w = 1; const side = b.startsWith('Left') ? 'Left' : b.startsWith('Right') ? 'Right' : null;
      if (FINGER.test(b)) w = 0; else if (side && ARM.test(b)) w = /ForeArm|Hand$/.test(b) ? wFore[side] : wArm[side];
      Wn[b] = I().slerp(K[b], w).multiply(D).multiply(nRestQ[b]);
    }
    for (const S of ['Left', 'Right']) Wn[S + 'Hand'] = limitWrist(S, Wn[S + 'ForeArm'], Wn[S + 'Hand']);
    // local rotations
    const loc = new Map();
    for (const b of BONES) {
      const pn = av.nodes[av.par[av.by.get(b)]].name; const pq = Wn[pn] || av.rotOf(nRest, pn);
      let lq = pq.clone().invert().multiply(Wn[b]).normalize(); if (prev[b] && lq.dot(prev[b]) < 0) lq.set(-lq.x, -lq.y, -lq.z, -lq.w); prev[b] = lq; loc.set(b, lq);
      if (tracked.has(b) && !FINGER.test(b)) outQ[b].push(...lq.toArray());
    }
    for (const b of BONES.filter(x => FINGER.test(x))) {      // fingers: damp the stock curl in LOCAL space (frame conventions match the rig's)
      const side = b.startsWith('Left') ? 'Left' : 'Right', si = stock.by.get(b), ai = av.by.get(b);
      const rel = stock.q[si].clone().invert().multiply(fr.rot.get(b) || stock.q[si]);
      const lq = av.q[ai].clone().multiply(I().slerp(rel, 1 - FINGER_CURL * wFore[side])).normalize(); if (prev[b] && lq.dot(prev[b]) < 0) lq.set(-lq.x, -lq.y, -lq.z, -lq.w); prev[b] = lq; loc.set(b, lq);
      if (tracked.has(b)) outQ[b].push(...lq.toArray());
    }
    // hips: scaled bob + ground solve
    const hr = av.t[av.by.get('HipsCtrl')].clone();
    const hn = V(hr.x + (hipsS.x - hipsIdle.x) * hipK, hr.y + (hipsS.y - hipsIdle.y) * hipK, hr.z + (hipsS.z - hipsIdle.z) * hipK);
    if (solve) {
      const gs = gapStock(sW), wg = 1 - smooth(.02, .16, gs);
      const nW = av.fk(loc, hn), low = lowest(nW, nSole) - ground;     // avatar's lowest sole point above its ground (world units)
      hn.z += -low * wg / 100;                                          // grounded frames: lowest sole -> ground (Root-local z is world y / 100); airborne frames keep the scaled stock bob
      const nW2 = av.fk(loc, hn); const rel = lowest(nW2, nSole) - ground; stats.frames++; if (wg > .99) { stats.minSoleRel = Math.min(stats.minSoleRel, rel); stats.maxSoleRel = Math.max(stats.maxSoleRel, rel); }
    }
    outH.push(...hn.toArray());
  }
  const mk = (name, type, vals, n) => ({ name, times: Array.from(times), values: vals, type });
  const tracks = [];
  for (const t of clip.tracks) {
    const b = t.name.split('.')[0];
    if (t.name.endsWith('.quaternion')) tracks.push(mk(t.name, 'quaternion', outQ[b]));
    else if (b === 'HipsCtrl') tracks.push(mk(t.name, 'vector', outH)); else tracks.push(t);
  }
  return { ...clip, tracks };
}
// round + collapse constant tracks to keep the files small
function pack(clip) {
  const tracks = clip.tracks.map(t => {
    const w = t.type === 'quaternion' ? 4 : 3, n = t.times.length, v = t.values;
    let same = n > 1; for (let i = w; same && i < v.length; i++) if (Math.abs(v[i] - v[i % w]) > 2e-5) same = false;
    const r = x => Math.round(x * (w === 4 ? 1e5 : 1e6)) / (w === 4 ? 1e5 : 1e6);
    return same ? { ...t, times: [t.times[0], t.times[n - 1]], values: [...Array.from(v.slice(0, w), r), ...Array.from(v.slice(0, w), r)] } : { ...t, times: t.times.map(x => Math.round(x * 1e4) / 1e4), values: Array.from(v, r) };
  });
  return { ...clip, tracks };
}

// ---------- gait: planted-foot speed ----------
function plantedSpeed(rig, restW, clipFrames) {   // clipFrames: [{t, W}]
  const pts = rig === av ? nSole : sStockSole, speeds = [];
  for (let k = 1; k < clipFrames.length; k++) {
    const a = clipFrames[k - 1], b = clipFrames[k], dt = b.t - a.t; if (dt <= 0) continue;
    pts.forEach((p, i) => { const pa = V().copy(p.local).applyMatrix4(a.W[p.node]), pb = V().copy(p.local).applyMatrix4(b.W[p.node]); if (pa.y - ground < .06 && pb.y - ground < .06) speeds.push(-(pb.z - pa.z) / dt); });
  }
  speeds.sort((x, y) => x - y); return speeds.length > 4 ? speeds[speeds.length >> 1] : null;
}
function framesOf(clip, rigKind) {
  const out = [];
  const times = clip.tracks.reduce((a, t) => t.times.length > a.length ? t.times : a, []);
  for (const t of times) {
    const rot = new Map(); let hips = null;
    for (const tr of clip.tracks) { const b = tr.name.split('.')[0]; if (tr.name.endsWith('.quaternion')) rot.set(b, Q(...sampleTrack(tr, t))); else if (b === 'HipsCtrl') hips = V(...sampleTrack(tr, t)); }
    out.push({ t, W: (rigKind === 'stock' ? stock : av).fk(rot, hips) });
  }
  return out;
}

// ---------- run ----------
fs.mkdirSync(outDir, { recursive: true });
const meta = { avatar: path.basename(avF, '.glb'), hipK, gait: {}, sets: {} };
let total = 0;
const anims = readSet('anims').clips;
for (const nm of ['walk', 'jog', 'sprint']) {
  const c = anims.find(x => x.name === nm), rc = retargetClip(c);
  const sS = plantedSpeed(stock, sRest, framesOf(c, 'stock')), sN = plantedSpeed(av, nRest, framesOf(rc, 'avatar'));
  meta.gait[nm] = { stock: sS && +sS.toFixed(3), avatar: sN && +sN.toFixed(3), ratio: sS && sN ? +(sN / sS).toFixed(3) : null };
}
for (const set of RUN) {
  const { wrap, clips } = readSet(set), out = [];
  for (const c of clips) {
    const rc = pack(retargetClip(c));
    // `trav` (WardenMX: ground travelled by the clip, used to match locomotion speed) grows with the avatar's planted-foot speed
    if (rc.trav) { const g = meta.gait[c.name === 'run' ? 'jog' : 'walk'], k = g && g.ratio || 1; rc.trav = rc.trav.map(x => +(x * k).toFixed(4)); }
    out.push(rc);
  }
  const doc = wrap ? { ...wrap, clips: out } : out;
  const f = path.join(outDir, set + '.json'); fs.writeFileSync(f, JSON.stringify(doc)); const sz = fs.statSync(f).size; total += sz; meta.sets[set] = sz;
  console.log(set.padEnd(13), clips.length, 'clips ->', (sz / 1024) | 0, 'KB');
}
console.log('planted-foot speed (rig units/s):', JSON.stringify(meta.gait));
console.log(`ground solve over ${stats.frames} frames: grounded-frame sole height vs ground  min ${stats.minSoleRel.toFixed(4)} max ${stats.maxSoleRel.toFixed(4)}`);
if (opt.only) { try { const old = JSON.parse(fs.readFileSync(path.join(outDir, 'meta.json'), 'utf8')); meta.sets = { ...old.sets, ...meta.sets }; } catch (e) {} }
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta));
console.log(`total ${(total / 1024) | 0} KB (uncompressed)`);
