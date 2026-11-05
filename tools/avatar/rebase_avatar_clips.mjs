// Re-uses a baked clip set of one avatar (assets/avatars/<src>/<set>.json, made for <src>.glb) on ANOTHER avatar built by build_avatar.mjs (same game-rig bone names, different rest pose / proportions).
//   THREE_NM=<dir containing three/>  node tools/avatar/rebase_avatar_clips.mjs <src.glb> <dst.glb> <out dir> <set.json> [more.json ...]   (sets are read from the SRC avatar's folder: assets/avatars/<src>/)
// Per frame, in world space (same maths as tools/rebase_mx.mjs, which does it for the Mixamo-named boss rigs):
//     D_b(t)  = Ws_b(t) * Ws_b,rest^-1          how far the source bone has swung from ITS rest pose
//     Wd_b(t) = D_b(t) * Wd_b,rest              the same swing applied to the destination's rest pose
//     local   = Wd_parent(t)^-1 * Wd_b(t)
// HipsCtrl.position is scaled about the rest translation by the hips-height ratio (dst / src) so the feet keep their ground contact. Bones the clip never animates keep the destination's rest rotation.
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { readGlb } from './glb_io.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T = await import(pathToFileURL(path.join(process.env.THREE_NM || path.join(ROOT, 'node_modules'), 'three/build/three.module.js')).href);
const [, , SG, DG, OUT, ...SETS] = process.argv;
if (!SG || !DG || !OUT || !SETS.length) { console.error('usage: rebase_avatar_clips.mjs <src.glb> <dst.glb> <outDir> <set.json> ...'); process.exit(1); }
const srcDir = path.join(path.dirname(SG), path.basename(SG, '.glb'));
function tree(file) {
  const j = readGlb(file).json, par = j.nodes.map(() => -1); j.nodes.forEach((n, i) => (n.children || []).forEach(c => par[c] = i));
  const order = [], seen = new Set(), visit = i => { if (seen.has(i)) return; seen.add(i); if (par[i] >= 0) visit(par[i]); order.push(i); }; j.nodes.forEach((_, i) => visit(i));
  const nodes = j.nodes.map(n => ({ name: n.name, rest: new T.Quaternion(...(n.rotation || [0, 0, 0, 1])), t: n.translation || [0, 0, 0] })), W = [];
  for (const i of order) W[i] = (par[i] >= 0 ? W[par[i]].clone() : new T.Quaternion()).multiply(nodes[i].rest);
  const hips = (() => { let p = new T.Vector3(), q = new T.Quaternion(); const chain = []; for (let i = j.nodes.findIndex(n => n.name === 'Hips'); i >= 0; i = par[i]) chain.unshift(i); const m = new T.Matrix4(); for (const i of chain) { const n = j.nodes[i]; m.multiply(new T.Matrix4().compose(new T.Vector3(...(n.translation || [0, 0, 0])), new T.Quaternion(...(n.rotation || [0, 0, 0, 1])), new T.Vector3(...(n.scale || [1, 1, 1])))); } return new T.Vector3().setFromMatrixPosition(m).y; })();
  return { nodes, par, order, W, by: new Map(nodes.map((n, i) => [n.name, i])), hips };
}
const S = tree(SG), D = tree(DG), ratio = D.hips / S.hips;
console.log('hips height', S.hips.toFixed(3), '->', D.hips.toFixed(3), 'ratio', ratio.toFixed(4));
const sample = (t, time) => {
  const ts = t.times, vs = t.values, w = t.type === 'quaternion' ? 4 : 3; let k = 0; while (k < ts.length - 2 && ts[k + 1] <= time) k++;
  const k2 = Math.min(k + 1, ts.length - 1), f = k2 === k ? 0 : Math.min(1, Math.max(0, (time - ts[k]) / (ts[k2] - ts[k])));
  return w === 4 ? new T.Quaternion(...vs.slice(k * 4, k * 4 + 4)).slerp(new T.Quaternion(...vs.slice(k2 * 4, k2 * 4 + 4)), f) : null;
};
const r = (v, d) => +v.toFixed(d);
fs.mkdirSync(OUT, { recursive: true });
for (const set of SETS) {
  const raw = JSON.parse(fs.readFileSync(path.join(srcDir, set), 'utf8')), wrap = Array.isArray(raw) ? null : raw, clips = wrap ? wrap.clips : raw, out = [];   // a set is a clip array, or {clips, meta} (gun / verb sets)
  for (const c of clips) {
    const trq = new Map(c.tracks.filter(t => t.name.endsWith('.quaternion')).map(t => [t.name.split('.')[0], t]));
    const times = [...new Set(c.tracks.filter(t => t.type === 'quaternion' && t.times.length > 2).flatMap(t => Array.from(t.times)))].sort((a, b) => a - b);
    if (times.length < 2) times.push(0, c.duration || 0.01);
    const per = new Map(); for (const [nm] of trq) per.set(nm, []);
    for (const tt of times) {
      const Ws = [], Wd = [];
      for (const i of D.order) {
        const nm = D.nodes[i].name, si = S.by.get(nm), p = D.par[i], sp = si !== undefined ? S.par[si] : -1, t = trq.get(nm);
        if (si === undefined || !t) { Wd[i] = (p >= 0 ? Wd[p].clone() : new T.Quaternion()).multiply(D.nodes[i].rest); if (si !== undefined) Ws[si] = (sp >= 0 ? Ws[sp].clone() : new T.Quaternion()).multiply(S.nodes[si].rest); if (per.has(nm)) per.get(nm).push(D.nodes[i].rest.clone()); continue; }
        Ws[si] = (sp >= 0 ? Ws[sp].clone() : new T.Quaternion()).multiply(sample(t, tt));
        Wd[i] = Ws[si].clone().multiply(S.W[si].clone().invert()).multiply(D.W[i]);
        per.get(nm).push((p >= 0 ? Wd[p].clone().invert() : new T.Quaternion()).multiply(Wd[i]));
      }
    }
    const tracks = [];
    for (const [nm, v] of per) {
      for (let i = 1; i < v.length; i++) if (v[i - 1].dot(v[i]) < 0) v[i].set(-v[i].x, -v[i].y, -v[i].z, -v[i].w);
      const flat = v.every(q => Math.abs(q.x - v[0].x) + Math.abs(q.y - v[0].y) + Math.abs(q.z - v[0].z) + Math.abs(q.w - v[0].w) < .004), q4 = x => r(x, 4);
      tracks.push(flat ? { name: nm + '.quaternion', type: 'quaternion', times: [0, r(times[times.length - 1], 4)], values: [0, 1].flatMap(() => [v[0].x, v[0].y, v[0].z, v[0].w].map(q4)) }
        : { name: nm + '.quaternion', type: 'quaternion', times: times.map(x => r(x, 4)), values: v.flatMap(q => [q.x, q.y, q.z, q.w].map(q4)) });
    }
    for (const t of c.tracks) if (t.type !== 'quaternion') {   // position tracks: HipsCtrl.position scaled about the rest translation
      const rest = D.nodes[D.by.get(t.name.split('.')[0])]?.t || [0, 0, 0];
      tracks.push({ ...t, values: t.values.map((x, k) => r(rest[k % 3] + (x - rest[k % 3]) * ratio, 6)) });
    }
    out.push({ ...c, tracks, trav: c.trav ? c.trav.map(x => r(x * ratio, 3)) : c.trav });
  }
  fs.writeFileSync(path.join(OUT, set), JSON.stringify(wrap ? { ...wrap, clips: out } : out));
  const win = path.join(srcDir, set.replace(/\.json$/, '.win.json')); if (fs.existsSync(win)) fs.copyFileSync(win, path.join(OUT, set.replace(/\.json$/, '.win.json')));
  console.log(set.padEnd(24), out.length, 'clips', (fs.statSync(path.join(OUT, set)).size / 1024 | 0) + ' KB');
}
