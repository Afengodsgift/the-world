// Re-bakes the avatars' clip sets from REAL human animation data instead of the chibi clips:
//   THREE_NM=<dir containing three/>  node tools/avatar/bake_human.mjs <avatar.glb> <source.glb> <avatarClipDir> [--only=anims,emotes,...] [--report]
// Source = a Mixamo-skeleton GLB with many named clips (units: metres, T-pose rest taken from the skin's inverse bind matrices), e.g. the user's exported-model_3.glb (178 clips).
// Target = the avatar's own rig (game bone names). Method (same maths as tools/retarget_mixamo.mjs, world space, per frame):
//     Q_target_world(t) = Q_src(t) * Q_src_rest^-1 * align * Q_target_rest          align = swing of the target bone's rest direction onto the source's
//   * hips: the source pelvis offset from its rest, scaled by the leg-length ratio (target / source); loops lose their linear horizontal travel (the game moves the avatar);
//     grounded frames (source soles near the floor) get the hips height solved so the avatar's lowest sole point sits on the floor (no float / sink).
//   * every clip is keyed at the stock clip's DURATION (time-warped within 0.45x..1.8x) unless marked natural (gait / idle loops), so gameplay timings that were tuned to the stock clips hold.
//   * clips that have no good source keep the chibi-derived version already in the folder (gun set, the capoeira / great-sword Warden sets).
//   * meta.json gait ratios are re-measured (planted-foot speed of the new walk / jog / sprint vs the stock chibi clips).
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { readGlb } from './glb_io.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..', '..');
const NM = process.env.THREE_NM || path.join(ROOT, 'node_modules');
const T = await import(pathToFileURL(path.join(NM, 'three/build/three.module.js')).href);
const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--')), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [avF, srcF, dir] = pos;
if (!avF || !srcF || !dir) { console.error('usage: bake_human.mjs <avatar.glb> <source.glb> <avatarClipDir>'); process.exit(1); }
const ONLY = opt.only ? new Set(opt.only.split(',')) : null;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z), Q = (...a) => new T.Quaternion(...a);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- generic rig with FK (nodes: {name, parent, t, q, s})
class Rig {
  constructor(nodes) {
    this.nodes = nodes; this.by = new Map(nodes.map((n, i) => [n.name, i]));
    this.order = []; const seen = new Set(); const visit = i => { if (seen.has(i)) return; seen.add(i); if (nodes[i].parent >= 0) visit(nodes[i].parent); this.order.push(i); }; nodes.forEach((_, i) => visit(i));
  }
  fk(rot, trans) {
    const W = new Array(this.nodes.length), m = new T.Matrix4();
    for (const i of this.order) { const n = this.nodes[i]; m.compose(trans && trans.get(n.name) || n.t, rot && rot.get(n.name) || n.q, n.s); W[i] = n.parent < 0 ? m.clone() : W[n.parent].clone().multiply(m); }
    return W;
  }
  rotOf(W, name) { return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().extractRotation(W[this.by.get(name)])); }
  posOf(W, name) { return V().setFromMatrixPosition(W[this.by.get(name)]); }
}
function glbRig(json) {
  const N = json.nodes, par = N.map(() => -1); N.forEach((n, i) => (n.children || []).forEach(c => par[c] = i));
  return new Rig(N.map((n, i) => ({ name: n.name, parent: par[i], t: V(...(n.translation || [0, 0, 0])), q: Q(...(n.rotation || [0, 0, 0, 1])), s: V(...(n.scale || [1, 1, 1])) })));
}
// ---------------------------------------------------------------- source GLB: rest pose from the skin's inverse bind matrices + named clips
const SG = readGlb(srcF), sj = SG.json;
const accOf = i => { const a = sj.accessors[i], bv = sj.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type], o = (bv.byteOffset || 0) + (a.byteOffset || 0); return new Float32Array(SG.bin.buffer.slice(SG.bin.byteOffset + o, SG.bin.byteOffset + o + a.count * n * 4)); };
// KayKit Rig_Medium (CC0) bone names -> the Mixamo names the retargeter works with. KayKit has no shoulders / neck / fingers: those targets follow the nearest source bone (see MAP below).
const KKB={hips:'Hips',spine:'Spine',chest:'Spine1',head:'Head'};const KKN=n=>{if(KKB[n])return KKB[n];const m=n.match(/^(upperarm|lowerarm|hand|wrist|upperleg|lowerleg|foot|toes|handslot)\.(l|r)$/);if(!m)return n;const S=m[2]==='l'?'Left':'Right';return S+({upperarm:'Arm',lowerarm:'ForeArm',hand:'Hand',wrist:'Wrist',upperleg:'UpLeg',lowerleg:'Leg',foot:'Foot',toes:'ToeBase',handslot:'HandSlot'})[m[1]]};
const skin = sj.skins[0], ibm = accOf(skin.inverseBindMatrices), jointNode = skin.joints;
const sPar = new Map(); sj.nodes.forEach((n, i) => (n.children || []).forEach(c => sPar.set(c, i)));
const restW = new Map(jointNode.map((nd, k) => [nd, new T.Matrix4().fromArray(ibm, k * 16).invert()]));
const sNodes = jointNode.map(nd => {
  const w = restW.get(nd), p = sPar.get(nd), pw = p !== undefined && restW.get(p), loc = pw ? pw.clone().invert().multiply(w) : w.clone(), t = V(), q = Q(), s = V(); loc.decompose(t, q, s);
  return { name: KKN(sj.nodes[nd].name), parent: pw ? jointNode.indexOf(p) : -1, t, q, s: V(1, 1, 1), nd };
});
let src = new Rig(sNodes), sRest = src.fk(); const sByNode = new Map(sNodes.map(n => [n.nd, n.name]));
let sClips = new Map();
for (const a of sj.animations) {
  const ch = { rot: new Map(), pos: new Map() }; let dur = 0;
  for (const c of a.channels) {
    const nm = sByNode.get(c.target.node); if (!nm) continue; const sm = a.samplers[c.sampler], times = accOf(sm.input), vals = accOf(sm.output); dur = Math.max(dur, times[times.length - 1]);
    if (c.target.path === 'rotation') ch.rot.set(nm, { times, vals }); else if (c.target.path === 'translation') ch.pos.set(nm, { times, vals });
  }
  sClips.set(a.name, { ch, dur });
}
function sample(tr, t, w) {
  const { times, vals } = tr, n = times.length; if (n === 1 || t <= times[0]) return vals.slice(0, w); if (t >= times[n - 1]) return vals.slice((n - 1) * w, n * w);
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; }
  const f = (t - times[lo]) / (times[hi] - times[lo]);
  if (w === 4) return Q(...vals.slice(lo * 4, lo * 4 + 4)).slerp(Q(...vals.slice(hi * 4, hi * 4 + 4)), f).toArray();
  return [0, 1, 2].map(k => vals[lo * 3 + k] + (vals[hi * 3 + k] - vals[lo * 3 + k]) * f);
}
function sourcePose(clip, t) {
  const rot = new Map(), trans = new Map();
  for (const [nm, tr] of clip.ch.rot) rot.set(nm, Q(...sample(tr, t, 4)));
  for (const [nm, tr] of clip.ch.pos) trans.set(nm, V(...sample(tr, t, 3)));
  return src.fk(rot, trans);
}
// ---------------------------------------------------------------- avatar (target)
const av = glbRig(readGlb(avF).json), nRest = av.fk();
const hipsRest = av.nodes[av.by.get('HipsCtrl')].t.clone(), rootQ = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().extractRotation(nRest[av.by.get('Root')])), rootS = av.nodes[av.by.get('Root')].s.x;
const sides = f => [['Left', 'Left'], ['Right', 'Right']].flatMap(([S, s]) => f(S, s));
const MAP = [['Hips', 'Hips', ['Spine', 'Spine']], ['Spine', 'Spine', ['Chest', 'Spine1']], ['Chest', 'Spine1', ['UpperChest', 'Spine2']], ['UpperChest', 'Spine2', ['Neck', 'Neck']], ['Neck', 'Neck', ['Head', 'Head']], ['Head', 'Head', null],
  ...sides((S, s) => [[S + 'Shoulder', s + 'Shoulder', [S + 'Arm', s + 'Arm']], [S + 'Arm', s + 'Arm', [S + 'ForeArm', s + 'ForeArm']], [S + 'ForeArm', s + 'ForeArm', [S + 'Hand', s + 'Hand']], [S + 'Hand', s + 'Hand', [S + 'HandIndex1', s + 'HandIndex1']],
    [S + 'HandIndex1', s + 'HandIndex1', [S + 'HandIndex2', s + 'HandIndex2']], [S + 'HandIndex2', s + 'HandIndex2', [S + 'HandIndex3', s + 'HandIndex3']], [S + 'HandIndex3', s + 'HandIndex3', [S + 'HandIndex3_end', s + 'HandIndex4']],
    [S + 'HandThumb1', s + 'HandThumb1', [S + 'HandThumb2', s + 'HandThumb2']], [S + 'HandThumb2', s + 'HandThumb2', [S + 'HandThumb2_end', s + 'HandThumb3']],
    [S + 'UpLeg', s + 'UpLeg', [S + 'Leg', s + 'Leg']], [S + 'Leg', s + 'Leg', [S + 'Foot', s + 'Foot']], [S + 'Foot', s + 'Foot', [S + 'Toes', s + 'ToeBase']], [S + 'Toes', s + 'ToeBase', [S + 'Toes_end', s + 'Toe_End']]])];
// the KayKit skeleton is simpler than the game's: aliases for the bones it lacks, no finger tracks, and an alignment direction only where both skeletons have the child bone
const KKMAP=(()=>{const m=[['Hips','Hips',['Spine','Spine']],['Spine','Spine',['Chest','Spine1']],['Chest','Spine1',null],['UpperChest','Spine1',null],['Neck','Spine1',null],['Head','Head',null]];
  for(const S of ['Left','Right'])m.push([S+'Shoulder','Spine1',null],[S+'Arm',S+'Arm',[S+'ForeArm',S+'ForeArm']],[S+'ForeArm',S+'ForeArm',[S+'Hand',S+'Hand']],[S+'Hand',S+'Hand',null],[S+'UpLeg',S+'UpLeg',[S+'Leg',S+'Leg']],[S+'Leg',S+'Leg',[S+'Foot',S+'Foot']],[S+'Foot',S+'Foot',[S+'Toes',S+'ToeBase']],[S+'Toes',S+'ToeBase',null]);return m})();
MAP.length=0;MAP.push(...KKMAP);
let restS, restT, align, legS, legT, RATIO, srcPelRest, sFootRest;
const soleY = (rig, W, n) => rig.posOf(W, n).y;
function prepare() {
for (const [t, s] of MAP) if (!src.by.has(s) || !av.by.has(t)) throw new Error('bone missing ' + t + ' / ' + s);
restS = {}; restT = {}; align = {};
for (const [t, s, dir] of MAP) {
  restS[t] = src.rotOf(sRest, s); restT[t] = av.rotOf(nRest, t); align[t] = new T.Quaternion();
  if (dir) { const dt = av.posOf(nRest, dir[0]).sub(av.posOf(nRest, t)).normalize(), ds = src.posOf(sRest, dir[1]).sub(src.posOf(sRest, s)).normalize(); align[t].setFromUnitVectors(dt, ds); }
}
// leg-length ratio (hips -> ankle) and ground references
legS = src.posOf(sRest, 'Hips').y - src.posOf(sRest, 'LeftFoot').y; legT = av.posOf(nRest, 'Hips').y - av.posOf(nRest, 'LeftFoot').y; RATIO = legT / legS;
srcPelRest = src.posOf(sRest, 'Hips');
sFootRest = { f: soleY(src, sRest, 'LeftFoot'), t: soleY(src, sRest, 'LeftToeBase') };
}
prepare();
// avatar sole points: the mesh stands on y = 0; heel under the ankle, ball under the toe joint (stored in each bone's local frame)
const GROUND = 0;
const solePts = ['Left', 'Right'].flatMap(S => ['Foot', 'Toes'].map(n => { const i = av.by.get(S + n), p = V().setFromMatrixPosition(nRest[i]); return { node: i, local: V(p.x, GROUND, p.z).applyMatrix4(nRest[i].clone().invert()) }; }));
const lowest = W => Math.min(...solePts.map(p => V().copy(p.local).applyMatrix4(W[p.node]).y));
const FINGER = /HandIndex|HandThumb/;
console.log(`leg ${legS.toFixed(3)} m -> ${legT.toFixed(3)} rig units (ratio ${RATIO.toFixed(3)}); avatar rest lowest sole ${lowest(nRest).toFixed(4)}; Root scale ${rootS}`);

// ---------------------------------------------------------------- bake one clip
// o: {src, nat, win:[a,b], rm:'trend'|'none', floor:false|true, fps}
function bake(srcName, o, stockDur) {
  const clip = sClips.get(srcName); if (!clip) throw new Error('no source clip ' + srcName);
  const a0 = o.win ? o.win[0] : 0, a1 = o.win ? Math.min(o.win[1], clip.dur) : clip.dur, L = a1 - a0;
  const outDur = o.nat ? L : stockDur, speed = o.nat ? 1 : Math.min(1.8, Math.max(.45, L / outDur)), fps = o.fps || (o.nat ? 30 : 24);
  const n = Math.max(2, Math.round(outDur * fps) + 1), times = [], loc = {}, hips = [], prev = {}; const frames = [];
  for (let f = 0; f < n; f++) { const t = outDur * f / (n - 1); times.push(+t.toFixed(4)); const ts = a0 + Math.min(L, t * speed); frames.push(sourcePose(clip, ts)); }
  const pel = frames.map(W => src.posOf(W, 'Hips'));
  const trend = pel.map(() => V());
  if (o.rm !== 'none') { const d = pel[n - 1].clone().sub(pel[0]); d.y = 0; if (o.nat || o.rm === 'trend') for (let f = 0; f < n; f++) trend[f].copy(d).multiplyScalar(f / (n - 1)); }
  const planted = [];
  for (let f = 0; f < n; f++) {
    const Ws = frames[f], Wn = {}, rotMap = new Map(), floorOn = o.floor !== false;
    for (const [t, s] of MAP) Wn[t] = src.rotOf(Ws, s).multiply(restS[t].clone().invert()).multiply(align[t].clone().multiply(restT[t]));
    for (const [t] of MAP) {
      const pn = av.nodes[av.nodes[av.by.get(t)].parent].name, pq = Wn[pn] || av.rotOf(nRest, pn);
      let lq = pq.clone().invert().multiply(Wn[t]).normalize(); if (prev[t] && lq.dot(prev[t]) < 0) lq.set(-lq.x, -lq.y, -lq.z, -lq.w); prev[t] = lq; rotMap.set(t, lq); (loc[t] = loc[t] || []).push(lq);
    }
    const d = pel[f].clone().sub(srcPelRest).sub(trend[f]);
    const hn = hipsRest.clone().add(d.multiplyScalar(RATIO).applyQuaternion(rootQ.clone().invert()).multiplyScalar(1 / rootS));
    if (floorOn) {
      const gapS = Math.min(src.posOf(Ws, 'LeftFoot').y - sFootRest.f, src.posOf(Ws, 'RightFoot').y - sFootRest.f, src.posOf(Ws, 'LeftToeBase').y - sFootRest.t, src.posOf(Ws, 'RightToeBase').y - sFootRest.t);
      const wg = 1 - smooth(.02 * legS, .18 * legS, gapS);
      const W1 = av.fk(rotMap, new Map([['HipsCtrl', hn]])), low = lowest(W1) - GROUND;
      hn.z += -low * wg / rootS;
    }
    hips.push(hn.clone());
    if (o.gait) { const W2 = av.fk(rotMap, new Map([['HipsCtrl', hn]])); planted.push(W2); }
  }
  // planted-foot speed (rig units/s along the avatar's forward axis) for gait ratios
  let speedMed = null;
  if (o.gait) {
    const sp = [];
    for (let f = 1; f < n; f++) { const dt = times[f] - times[f - 1]; for (const p of solePts) { const pa = V().copy(p.local).applyMatrix4(planted[f - 1][p.node]), pb = V().copy(p.local).applyMatrix4(planted[f][p.node]); if (pa.y - GROUND < .06 && pb.y - GROUND < .06) sp.push(-(pb.z - pa.z) / dt); } }
    sp.sort((x, y) => x - y); speedMed = sp.length > 4 ? sp[sp.length >> 1] : null;
  }
  const r = (v, d) => +v.toFixed(d), tracks = [], stat = arr => arr.every(q => Math.abs(q.dot(arr[0])) > .99995);
  for (const [t] of MAP) { const arr = loc[t]; if (stat(arr)) tracks.push({ name: t + '.quaternion', type: 'quaternion', times: [0, r(outDur, 4)], values: [0, 1].flatMap(() => arr[0].toArray().map(x => r(x, 5))) }); else tracks.push({ name: t + '.quaternion', type: 'quaternion', times, values: arr.flatMap(q => [r(q.x, 5), r(q.y, 5), r(q.z, 5), r(q.w, 5)]) }); }
  tracks.push({ name: 'HipsCtrl.position', type: 'vector', times, values: hips.flatMap(p => [r(p.x, 6), r(p.y, 6), r(p.z, 6)]) });
  return { clip: { name: '', duration: r(outDur, 4), tracks, uuid: '' }, speed: speedMed, info: `${srcName} ${L.toFixed(2)}s -> ${outDur.toFixed(2)}s x${speed.toFixed(2)} ${n}f` };
}

// ---------------------------------------------------------------- driver: KayKit clips -> <avatarClipDir>/dojo_kk.json (merged by clip name) + a swing-window report (when the hands / feet move fastest = the hit window)
//   THREE_NM=... node tools/avatar/bake_kaykit.mjs <avatar.glb> <Rig_Medium_*.glb> <avatarClipDir>
const TABLE = [
  ['kk_idle', 'Melee_Unarmed_Idle', { nat: true }], ['kk_punch', 'Melee_Unarmed_Attack_Punch_A', { nat: true, rm: 'trend' }], ['kk_kick', 'Melee_Unarmed_Attack_Kick', { nat: true, rm: 'trend' }],
  ['kk_guard', 'Melee_Blocking', { nat: true }], ['kk_blockhit', 'Melee_Block_Hit', { nat: true, rm: 'trend' }], ['kk_blockatk', 'Melee_Block_Attack', { nat: true, rm: 'trend' }],
  ['kk_2h_idle', 'Melee_2H_Idle', { nat: true }], ['kk_2h_chop', 'Melee_2H_Attack_Chop', { nat: true, rm: 'trend' }], ['kk_2h_slice', 'Melee_2H_Attack_Slice', { nat: true, rm: 'trend' }],
  ['kk_2h_spin', 'Melee_2H_Attack_Spin', { nat: true, rm: 'trend' }], ['kk_2h_spinning', 'Melee_2H_Attack_Spinning', { nat: true, rm: 'trend' }], ['kk_2h_stab', 'Melee_2H_Attack_Stab', { nat: true, rm: 'trend' }],
  ['kk_dodge_f', 'Dodge_Forward', { nat: true, rm: 'trend' }], ['kk_dodge_b', 'Dodge_Backward', { nat: true, rm: 'trend' }], ['kk_dodge_l', 'Dodge_Left', { nat: true, rm: 'trend' }], ['kk_dodge_r', 'Dodge_Right', { nat: true, rm: 'trend' }]];
const outF = path.join(dir, 'dojo_kk.json'), winF = path.join(dir, 'dojo_kk.win.json');
const have = fs.existsSync(outF) ? JSON.parse(fs.readFileSync(outF, 'utf8')) : [], win = fs.existsSync(winF) ? JSON.parse(fs.readFileSync(winF, 'utf8')) : {};
function swing(srcName) {   // fastest hand / foot motion in the SOURCE clip
  const clip = sClips.get(srcName), N = Math.max(8, Math.round(clip.dur * 60)), tips = ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'], P = [];
  for (let f = 0; f <= N; f++) { const W = sourcePose(clip, clip.dur * f / N); P.push(tips.map(t => src.posOf(W, t))); }
  const sp = []; for (let f = 1; f <= N; f++) { let m = 0; for (let k = 0; k < tips.length; k++) m = Math.max(m, P[f][k].distanceTo(P[f - 1][k]) * 60); sp.push(m); }
  const mx = Math.max(...sp), a = sp.findIndex(v => v > .5 * mx), b = sp.length - 1 - [...sp].reverse().findIndex(v => v > .5 * mx);
  return [+(a / 60).toFixed(2), +((b + 1) / 60).toFixed(2)];
}
for (const [name, srcName, o] of TABLE) {
  if (!sClips.has(srcName)) continue;
  const b = bake(srcName, o, 0); b.clip.name = name; b.clip.uuid = name; const i = have.findIndex(c => c.name === name); if (i >= 0) have[i] = b.clip; else have.push(b.clip);
  win[name] = { dur: b.clip.duration, hit: /^kk_(punch|kick|blockatk|2h_)/.test(name) ? swing(srcName) : null };
  console.log(name.padEnd(14), b.info, win[name].hit ? 'swing ' + win[name].hit.join('-') : '');
}
fs.writeFileSync(outF, JSON.stringify(have)); fs.writeFileSync(winF, JSON.stringify(win));
console.log(`wrote ${outF} (${(fs.statSync(outF).size / 1024) | 0} KB, ${have.length} clips)`);
