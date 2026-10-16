// Bakes the flight clips of a Mixamo-rigged GLB (Flying_Forward, Flying_Forward_Super, Levitate_Entrance, Levitate_Idle) onto THE WORLD's character skeleton (assets/char.glb)
// and writes assets/flight_anims.json. Same method as tools/retarget_mixamo.mjs (all rigs T-posed, +Z forward):
//   Q_world_target(t) = (Q_src(t) * Q_src_rest^-1) * (align * Q_target_rest)      hip travel is scaled by leg length
// Differences: the source is a GLB (clip names come from the file), and no root motion is removed (the flight clips are in place).
// Besides the clips it records per clip, measured on the retargeted pose: `lean` (angle of the pelvis->head axis from vertical, rad: ~1.57 for the prone Superman clips,
// ~0.1 for the upright levitation) and `hipsY` (pelvis height in game metres), which FlightPose uses to pivot the body about the hips and to compute the extra tilt it must add.
// Output: { v:1, meta:{name:{dur,loop,lean,hipsY}}, clips:[THREE.AnimationClip JSON] }   (loaded with THREE.AnimationClip.parse, see src/character/FlightAnim.js)
// Usage:  THREE_DIR=<dir with three@0.147.0>  node tools/retarget_flight.mjs <flight-model.glb> [out.json]
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
class Img { constructor() { this.style = {}; this.L = {} } addEventListener(t, f) { this.L[t] = f } removeEventListener() {} set src(v) { this._s = v; setTimeout(() => this.L.load && this.L.load.call(this, {}), 0) } get src() { return this._s } }
globalThis.self = globalThis; globalThis.document = { createElementNS: () => new Img(), createElement: () => ({ style: {} }) };
const HERE = path.dirname(fileURLToPath(import.meta.url)), TD = process.env.THREE_DIR || path.join(process.cwd(), 'node_modules', 'three');
const T = await import(pathToFileURL(path.join(TD, 'build/three.module.js')).href);
const { GLTFLoader } = await import(pathToFileURL(path.join(TD, 'examples/jsm/loaders/GLTFLoader.js')).href);
const SRC = process.argv[2], OUT = process.argv[3] || path.join(HERE, '..', 'assets', 'flight_anims.json'), CHAR = path.join(HERE, '..', 'assets', 'char.glb');
if (!SRC) { console.error('usage: retarget_flight.mjs <flight-model.glb> [out.json]'); process.exit(1) }
const MODEL_SCALE = .5;   // index.html dress(): m.scale.setScalar(.5)
const FPS = { loop: 30, once: 20 }, DG = 3, r = (v, d) => +v.toFixed(d);
const CLIPS = { fly_fwd: { src: 'Flying_Forward', kind: 'loop' }, fly_super: { src: 'Flying_Forward_Super', kind: 'loop' }, lev_in: { src: 'Levitate_Entrance', kind: 'once' }, lev_idle: { src: 'Levitate_Idle', kind: 'loop' } };
// ---- char.glb (target): node tree straight from the glTF JSON ----
function glb(f) { const b = fs.readFileSync(f), jl = b.readUInt32LE(12); return { j: JSON.parse(b.slice(20, 20 + jl).toString()) } }
function rig(G) {
  const N = G.j.nodes.map((n, i) => ({ i, name: n.name, t: new T.Vector3(...(n.translation || [0, 0, 0])), q: new T.Quaternion(...(n.rotation || [0, 0, 0, 1])), s: new T.Vector3(...(n.scale || [1, 1, 1])), ch: n.children || [], par: -1 }));
  N.forEach(n => n.ch.forEach(c => N[c].par = n.i)); const by = {}; N.forEach(n => by[n.name] = n);
  const world = pose => { const W = new Array(N.length); const go = (i, pm) => { const n = N[i], p = pose && pose[n.name] || {}; const m = pm.clone().multiply(new T.Matrix4().compose(p.t || n.t, p.q || n.q, n.s)); W[i] = m; n.ch.forEach(c => go(c, m)) }; G.j.scenes[0].nodes.forEach(r => go(r, new T.Matrix4())); return W };
  return { N, by, world }
}
const wq = m => { const q = new T.Quaternion(); m.decompose(new T.Vector3(), q, new T.Vector3()); return q }, wp = m => new T.Vector3().setFromMatrixPosition(m);
const C = glb(CHAR), CR = rig(C), Wtr = CR.world(null);
// ---- source: parse the GLB with the game's own three.js, take its skeleton (rest pose) + animation tracks ----
const buf = fs.readFileSync(SRC);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
const rootBone = gltf.scene.getObjectByName('root') || (() => { let b = null; gltf.scene.traverse(o => { if (!b && o.isBone) b = o }); return b })();
const strip = s => s.replace(/^mixamorig:?/, '');
const S = (() => {
  const N = [], by = {};
  const add = (o, par) => { const n = { i: N.length, name: strip(o.name), t: o.position.clone(), q: o.quaternion.clone(), s: new T.Vector3(1, 1, 1), ch: [], par }; N.push(n); by[n.name] = n; if (par >= 0) N[par].ch.push(n.i); o.children.filter(c => c.isBone).forEach(c => add(c, n.i)) };
  add(rootBone, -1);
  const world = pose => { const W = new Array(N.length); const go = (i, pm) => { const n = N[i], p = pose && pose[n.name] || {}; const m = pm.clone().multiply(new T.Matrix4().compose(p.t || n.t, p.q || n.q, n.s)); W[i] = m; n.ch.forEach(c => go(c, m)) }; go(0, new T.Matrix4()); return W };
  return { N, by, world }
})();
const Wsr = S.world(null);
// ---- bone map: [target, source, [target child, source child] to align rest directions | null] ----
const sides = f => [['Left', 'Left'], ['Right', 'Right']].flatMap(([A, a]) => f(A, a));
const MAP = [['Hips', 'Hips', ['Spine', 'Spine']], ['Spine', 'Spine', ['Chest', 'Spine1']], ['Chest', 'Spine1', ['UpperChest', 'Spine2']], ['UpperChest', 'Spine2', ['Neck', 'Neck']], ['Neck', 'Neck', ['Head', 'Head']], ['Head', 'Head', null],
  ...sides((A, a) => [[A + 'Shoulder', a + 'Shoulder', [A + 'Arm', a + 'Arm']], [A + 'Arm', a + 'Arm', [A + 'ForeArm', a + 'ForeArm']], [A + 'ForeArm', a + 'ForeArm', [A + 'Hand', a + 'Hand']], [A + 'Hand', a + 'Hand', [A + 'HandIndex1', a + 'HandIndex1']],
    [A + 'HandIndex1', a + 'HandIndex1', [A + 'HandIndex2', a + 'HandIndex2']], [A + 'HandIndex2', a + 'HandIndex2', [A + 'HandIndex3', a + 'HandIndex3']], [A + 'HandIndex3', a + 'HandIndex3', [A + 'HandIndex3_end', a + 'HandIndex4']],
    [A + 'HandThumb1', a + 'HandThumb1', [A + 'HandThumb2', a + 'HandThumb2']], [A + 'HandThumb2', a + 'HandThumb2', [A + 'HandThumb2_end', a + 'HandThumb3']],
    [A + 'UpLeg', a + 'UpLeg', [A + 'Leg', a + 'Leg']], [A + 'Leg', a + 'Leg', [A + 'Foot', a + 'Foot']], [A + 'Foot', a + 'Foot', [A + 'Toes', a + 'ToeBase']], [A + 'Toes', a + 'ToeBase', [A + 'Toes_end', a + 'Toe_End']]])];
for (const [t, s] of MAP) { if (!S.by[s]) throw new Error('source bone missing ' + s); if (!CR.by[t]) throw new Error('target bone missing ' + t) }
// ---- measured once ----
const legT = wp(Wtr[CR.by.Hips.i]).y - wp(Wtr[CR.by.LeftFoot.i]).y, legS = wp(Wsr[S.by.Hips.i]).y - wp(Wsr[S.by.LeftFoot.i]).y, RATIO = legT / legS;
const rootQ = wq(Wtr[CR.by.Root.i]), rootS = CR.by.Root.s.x, hipsRest = CR.by.HipsCtrl.t.clone(), pelvisRest = wp(Wsr[S.by.Hips.i]);
const restS = {}, restT = {}, align = {};
for (const [t, s, dir] of MAP) {
  restS[t] = wq(Wsr[S.by[s].i]); restT[t] = wq(Wtr[CR.by[t].i]); align[t] = new T.Quaternion();
  if (dir) { const dt = wp(Wtr[CR.by[dir[0]].i]).sub(wp(Wtr[CR.by[t].i])).normalize(), ds = wp(Wsr[S.by[dir[1]].i]).sub(wp(Wsr[S.by[s].i])).normalize(); align[t].setFromUnitVectors(dt, ds) }
}
console.log(`source ${(wp(Wsr[S.by.Head.i]).y - wp(Wsr[S.by.LeftFoot.i]).y).toFixed(2)} m, leg ratio ${RATIO.toFixed(3)}, ${gltf.animations.length} clips: ${gltf.animations.map(a => a.name).join(', ')}`);

function bake(name, cfg) {
  const clip = gltf.animations.find(a => a.name === cfg.src); if (!clip) throw new Error('clip not found: ' + cfg.src);
  const itp = {}; for (const tr of clip.tracks) { const m = tr.name.match(/^(?:mixamorig:?)?(.+)\.(quaternion|position)$/); if (m) itp[m[1] + '.' + m[2]] = tr.createInterpolant() }
  const dur = clip.duration, n = Math.max(2, Math.round(dur * FPS[cfg.kind]) + 1), times = [], Q = {}, P = [], prev = {}; let errMax = 0, errSum = 0, errN = 0, leanSum = 0, hipsSum = 0;
  for (let f = 0; f < n; f++) {
    const t = Math.min(dur, dur * f / (n - 1)); times.push(r(t, 4));
    const pose = {}; for (const nd of S.N) { const iq = itp[nd.name + '.quaternion'], ip = itp[nd.name + '.position']; if (iq || ip) { pose[nd.name] = {}; if (iq) pose[nd.name].q = new T.Quaternion().fromArray(iq.evaluate(t)); if (ip) pose[nd.name].t = new T.Vector3().fromArray(ip.evaluate(t)) } }
    const W = S.world(pose), wt = {};
    const tw = nm => { if (wt[nm]) return wt[nm]; const m = MAP.find(x => x[0] === nm); let Qt;
      if (m) { const Qs = wq(W[S.by[m[1]].i]); Qt = Qs.clone().multiply(restS[nm].clone().invert()).multiply(align[nm].clone().multiply(restT[nm])) }
      else { const p = CR.N[CR.by[nm].par]; Qt = p ? tw(p.name).clone().multiply(CR.by[nm].q) : wq(Wtr[CR.by[nm].i]) }
      return wt[nm] = Qt };
    for (const [tn] of MAP) { const Qt = tw(tn), pn = CR.N[CR.by[tn].par].name; const lq = tw(pn).clone().invert().multiply(Qt).normalize(); if (prev[tn] && prev[tn].dot(lq) < 0) lq.set(-lq.x, -lq.y, -lq.z, -lq.w); prev[tn] = lq; (Q[tn] = Q[tn] || []).push(lq) }
    const pel = wp(W[S.by.Hips.i]).clone().sub(pelvisRest).multiplyScalar(RATIO).applyQuaternion(rootQ.clone().invert()).multiplyScalar(1 / rootS);
    const Pf = hipsRest.clone().add(pel), pose2 = {}; for (const tn in Q) pose2[tn] = { q: Q[tn][Q[tn].length - 1] }; pose2.HipsCtrl = { t: Pf };
    const W2 = CR.world(pose2); P.push(Pf);
    for (const [tn, sn, dir] of MAP) { if (!dir) continue; const dT = wp(W2[CR.by[dir[0]].i]).sub(wp(W2[CR.by[tn].i])).normalize(), dS = wp(W[S.by[dir[1]].i]).sub(wp(W[S.by[sn].i])).normalize(); const e = Math.acos(Math.max(-1, Math.min(1, dT.dot(dS)))) * 180 / Math.PI; errMax = Math.max(errMax, e); errSum += e; errN++ }
    const hp = wp(W2[CR.by.Hips.i]), hd = wp(W2[CR.by.Head.i]), ax = hd.clone().sub(hp).normalize();
    leanSum += Math.acos(Math.max(-1, Math.min(1, ax.y))); hipsSum += hp.y * MODEL_SCALE;
  }
  const stat = a => a.every(q => Math.abs(q.dot(a[0])) > .99995), tracks = [];
  for (const tn in Q) { const a = Q[tn]; if (stat(a)) tracks.push({ name: tn + '.quaternion', type: 'quaternion', times: [0, r(dur, 4)], values: [0, 1].flatMap(() => a[0].toArray().map(x => r(x, DG))) }); else tracks.push({ name: tn + '.quaternion', type: 'quaternion', times, values: a.flatMap(q => [r(q.x, DG), r(q.y, DG), r(q.z, DG), r(q.w, DG)]) }) }
  tracks.push({ name: 'HipsCtrl.position', type: 'vector', times, values: P.flatMap(p => [r(p.x, DG + 1), r(p.y, DG + 1), r(p.z, DG + 1)]) });
  return { clip: { name, duration: r(dur, 4), tracks, uuid: name }, meta: { dur: r(dur, 3), loop: cfg.kind !== 'once', lean: r(leanSum / n, 3), hipsY: r(hipsSum / n, 3) }, report: { src: cfg.src, dur: r(dur, 2), frames: n, meanErr: r(errSum / errN, 2) + '°', maxErr: r(errMax, 1) + '°', lean: r(leanSum / n * 180 / Math.PI, 0) + '° from vertical', hipsY: r(hipsSum / n, 2) + ' m' } }
}
const out = { v: 1, meta: {}, clips: [] }, rep = {};
for (const [name, cfg] of Object.entries(CLIPS)) { const b = bake(name, cfg); out.clips.push(b.clip); out.meta[name] = b.meta; rep[name] = b.report }
fs.writeFileSync(OUT, JSON.stringify(out)); console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB'); console.table(rep);
