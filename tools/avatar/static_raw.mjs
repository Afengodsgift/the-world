// Turns a STATIC, unrigged, T-posed character GLB (e.g. a Sketchfab download) into the `raw` structure that build_avatar.mjs expects from a Mixamo FBX:
//   per-corner pos / nor / uv / jnt / wgt, a Mixamo-keyed bone list with bind-pose positions, and one baked texture atlas.
//   node tools/avatar/build_avatar.mjs <static.glb> <out.glb> --static=tools/avatar/static_raw.mjs --name=samurai --height=2.0 --tris=60000 --tex=2048 --cfg=tools/avatar/cfg/samurai.json
// Steps: bake node transforms -> drop glass parts -> simplify each part to its triangle budget -> pack every base-colour texture into ONE atlas (one material, one draw call per mesh) ->
// fit the Crypto skeleton to the model (uniform scale + arm / leg swing measured from the mesh) -> automatic skin weights (distance to bone segments, per-part bone whitelists,
// Laplacian smoothing) -> rigid parts (hat, mask, eyes, flask, katana) bound 100% to one bone.
// The weights are an automatic fit, good for a stylised game character; they are not hand-painted.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';
import { readGlb } from './glb_io.mjs';

export async function staticRaw(file, { NM, T, rigGlb, cfg, log = console.log }) {
  const sharp = createRequire((process.env.SHARP_NM || '/opt/npm-tools/node_modules') + '/x.js')('sharp');
  const { MeshoptSimplifier } = await import(pathToFileURL(process.env.MESHOPT_JS || path.join(NM, 'meshoptimizer/meshopt_simplifier.js')).href); await MeshoptSimplifier.ready;
  const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
  const { json: j, bin } = readGlb(file);
  const acc = i => { const a = j.accessors[i], bv = j.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], o = (bv.byteOffset || 0) + (a.byteOffset || 0), CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
    const C = CT[a.componentType], src = new C(bin.buffer.slice(bin.byteOffset + o, bin.byteOffset + o + a.count * n * C.BYTES_PER_ELEMENT)); return { d: src, n, count: a.count }; };
  // ---- world matrices of mesh nodes
  const parent = new Map(); j.nodes.forEach((n, i) => (n.children || []).forEach(c => parent.set(c, i)));
  const nodeM = i => { const n = j.nodes[i]; const m = n.matrix ? new T.Matrix4().fromArray(n.matrix) : new T.Matrix4().compose(V(...(n.translation || [0, 0, 0])), new T.Quaternion(...(n.rotation || [0, 0, 0, 1])), V(...(n.scale || [1, 1, 1]))); return parent.has(i) ? nodeM(parent.get(i)).multiply(m) : m; };
  // ---- parts: material name -> {atlas cell, budget, bind rule}
  const PARTS = cfg.parts;           // { materialName: {cell, tris, bind: 'auto'|'Head'|'Hips', allow?: [game bones]} }
  const meshes = [];
  j.nodes.forEach((n, i) => { if (n.mesh === undefined) return; const M = nodeM(i), NMtx = new T.Matrix3().getNormalMatrix(M);
    for (const pr of j.meshes[n.mesh].primitives) { const mat = j.materials[pr.material], cf = PARTS[mat.name]; if (!cf) continue;
      const P = acc(pr.attributes.POSITION), No = acc(pr.attributes.NORMAL), UV = acc(pr.attributes.TEXCOORD_0), I = pr.indices !== undefined ? acc(pr.indices).d : Uint32Array.from({ length: P.count }, (_, k) => k);
      const pos = new Float32Array(P.count * 3), nor = new Float32Array(P.count * 3), v = V();
      for (let k = 0; k < P.count; k++) { v.set(P.d[k * 3], P.d[k * 3 + 1], P.d[k * 3 + 2]).applyMatrix4(M); pos.set([v.x, v.y, v.z], k * 3); v.set(No.d[k * 3], No.d[k * 3 + 1], No.d[k * 3 + 2]).applyMatrix3(NMtx).normalize(); nor.set([v.x, v.y, v.z], k * 3); }
      meshes.push({ name: mat.name, cf, mat, pos, nor, uv: Float32Array.from(UV.d), idx: Uint32Array.from(I) }); } });
  log(`static source: ${meshes.length} kept parts, ${meshes.reduce((s, m) => s + m.idx.length / 3, 0)} tris`);
  // ---- body measurements (before simplification, from the skin mesh)
  const body = meshes.find(m => m.cf.role === 'body');
  const bb = { min: V(1e9, 1e9, 1e9), max: V(-1e9, -1e9, -1e9) }; for (let k = 0; k < body.pos.length; k += 3) { bb.min.x = Math.min(bb.min.x, body.pos[k]); bb.min.y = Math.min(bb.min.y, body.pos[k + 1]); bb.min.z = Math.min(bb.min.z, body.pos[k + 2]); bb.max.x = Math.max(bb.max.x, body.pos[k]); bb.max.y = Math.max(bb.max.y, body.pos[k + 1]); bb.max.z = Math.max(bb.max.z, body.pos[k + 2]); }
  let soleY = 1e9, topY = -1e9; for (const m of meshes) for (let k = 1; k < m.pos.length; k += 3) { soleY = Math.min(soleY, m.pos[k]); if (m.cf.role === 'body' || m.cf.role === 'hat') topY = Math.max(topY, m.pos[k]); }
  const headTop = bb.max.y;                                              // skin top of the head (without the hat)
  // ---- the donor skeleton (Crypto): world positions of every game joint
  const RJ = readGlb(rigGlb).json, N = RJ.nodes, par = N.map(() => -1); N.forEach((n, i) => (n.children || []).forEach(c => par[c] = i));
  const by = new Map(N.map((n, i) => [n.name, i]));
  const lm = n => new T.Matrix4().compose(V(...(n.translation || [0, 0, 0])), new T.Quaternion(...(n.rotation || [0, 0, 0, 1])), V(...(n.scale || [1, 1, 1])));
  const wm = i => par[i] < 0 ? lm(N[i]) : wm(par[i]).multiply(lm(N[i]));
  const POSK = cfg.keys;             // game bone -> Mixamo key (same table as build_avatar POS)
  const Pc = {}; for (const g in POSK) Pc[g] = V().setFromMatrixPosition(wm(by.get(g)));
  const cHeadTop = Pc.Head_end.y + .02, cH = cHeadTop;                  // Crypto stands on y = 0
  const s = (headTop - soleY) / cH;                                      // uniform scale donor -> model
  const band = (y, tol, f) => { const a = []; for (let k = 0; k < body.pos.length; k += 3) if (Math.abs(body.pos[k + 1] - y) < tol) a.push(body.pos[k + f]); return a; };
  const mid = a => a.length ? (Math.min(...a) + Math.max(...a)) / 2 : 0;
  const Pn = {};
  for (const g in Pc) Pn[g] = V(Pc[g].x * s, soleY + Pc[g].y * s, 0);
  // spine / neck / head centre-line z from the mesh
  for (const g of ['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head']) { Pn[g].z = mid(band(Pn[g].y, .12 * s, 2)); }
  Pn.Head_end.z = Pn.Head.z + (Pc.Head_end.z - Pc.Head.z) * s; Pn.Head_end.y = headTop;
  // legs: x of the feet from the sandals/socks, z of ankle/knee/hip from the mesh bands
  const legs = meshes.find(m => m.cf.role === 'feet');
  for (const side of [1, -1]) { const S = side > 0 ? 'Left' : 'Right'; const xs = []; for (let k = 0; k < legs.pos.length; k += 3) if (legs.pos[k] * side > 0) xs.push(legs.pos[k]); const fx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const dx = fx - Pn[S + 'Foot'].x;
    for (const [g, t] of [['UpLeg', 0], ['Leg', .5], ['Foot', 1], ['Toes', 1], ['Toes_end', 1]]) Pn[S + g].x += dx * t;
    for (const g of ['UpLeg', 'Leg']) Pn[S + g].z = mid(band(Pn[S + g].y, .1 * s, 2));
    Pn[S + 'Foot'].z = Pn[S + 'Leg'].z + (Pc[S + 'Foot'].z - Pc[S + 'Leg'].z) * s; Pn[S + 'Toes'].z = Pn[S + 'Foot'].z + (Pc[S + 'Toes'].z - Pc[S + 'Foot'].z) * s; Pn[S + 'Toes_end'].z = Pn[S + 'Toes'].z + (Pc[S + 'Toes_end'].z - Pc[S + 'Toes'].z) * s; }
  // arms: swing the donor arm chain about the shoulder so the wrist points at the model's fingertips
  for (const side of [1, -1]) { const S = side > 0 ? 'Left' : 'Right'; let tip = null; for (let k = 0; k < body.pos.length; k += 3) if (body.pos[k] * side > 0 && (!tip || Math.abs(body.pos[k]) > Math.abs(tip.x))) tip = V(body.pos[k], body.pos[k + 1], body.pos[k + 2]);
    const sh = Pn[S + 'Arm'].clone(); sh.z = mid(band(sh.y, .25 * s, 2).filter(() => true)); const shC = Pc[S + 'Arm'];
    const dirC = Pc[S + 'Hand'].clone().sub(shC).normalize(), dirN = tip.clone().sub(sh).normalize(), sw = new T.Quaternion().setFromUnitVectors(dirC, dirN);
    for (const g of ['Arm', 'ForeArm', 'Hand', 'HandIndex1', 'HandIndex2', 'HandIndex3', 'HandThumb1', 'HandThumb2']) Pn[S + g] = sh.clone().add(Pc[S + g].clone().sub(shC).multiplyScalar(s).applyQuaternion(sw));
    Pn[S + 'Shoulder'].z = Pn.UpperChest.z; }
  log(`fit: scale ${s.toFixed(3)} sole ${soleY.toFixed(2)} head ${headTop.toFixed(2)}; arm swing ${(2 * Math.acos(1)).toFixed(0)} (see overlay)`);
  // ---- bones (Mixamo keys) + hierarchy
  const PAR = { Spine: 'Hips', Chest: 'Spine', UpperChest: 'Chest', Neck: 'UpperChest', Head: 'Neck', Head_end: 'Head', UpLeg: 'Hips', Leg: 'UpLeg', Foot: 'Leg', Toes: 'Foot', Toes_end: 'Toes', Shoulder: 'UpperChest', Arm: 'Shoulder', ForeArm: 'Arm', Hand: 'ForeArm', HandIndex1: 'Hand', HandIndex2: 'HandIndex1', HandIndex3: 'HandIndex2', HandThumb1: 'Hand', HandThumb2: 'HandThumb1' };
  const gnames = Object.keys(POSK), gi = new Map(gnames.map((g, i) => [g, i]));
  const pOf = g => { const m = g.match(/^(Left|Right)(.+)$/); if (m && PAR[m[2]]) return PAR[m[2]] === 'Hips' || ['Spine', 'Chest', 'UpperChest', 'Neck', 'Head'].includes(PAR[m[2]]) ? PAR[m[2]] : m[1] + PAR[m[2]]; return PAR[g] || null; };
  const bones = gnames.map(g => ({ name: g, key: POSK[g], parent: pOf(g) ? gi.get(pOf(g)) : -1, world: Pn[g].toArray() }));
  // ---- segments for the weighting
  const CH = { Hips: 'Spine', Spine: 'Chest', Chest: 'UpperChest', UpperChest: 'Neck', Neck: 'Head', Head: 'Head_end' };
  for (const S of ['Left', 'Right']) Object.assign(CH, { [S + 'Shoulder']: S + 'Arm', [S + 'Arm']: S + 'ForeArm', [S + 'ForeArm']: S + 'Hand', [S + 'Hand']: S + 'HandIndex1', [S + 'HandIndex1']: S + 'HandIndex2', [S + 'HandIndex2']: S + 'HandIndex3', [S + 'HandThumb1']: S + 'HandThumb2', [S + 'UpLeg']: S + 'Leg', [S + 'Leg']: S + 'Foot', [S + 'Foot']: S + 'Toes', [S + 'Toes']: S + 'Toes_end' });
  const segs = []; for (const g in CH) segs.push({ g, a: Pn[g], b: Pn[CH[g]] });
  for (const S of ['Left', 'Right']) { const d = Pn[S + 'HandIndex3'].clone().sub(Pn[S + 'HandIndex2']); segs.push({ g: S + 'HandIndex3', a: Pn[S + 'HandIndex3'], b: Pn[S + 'HandIndex3'].clone().add(d) }); const t = Pn[S + 'HandThumb2'].clone().sub(Pn[S + 'HandThumb1']); segs.push({ g: S + 'HandThumb2', a: Pn[S + 'HandThumb2'], b: Pn[S + 'HandThumb2'].clone().add(t) }); }
  const segs2 = segs.filter(x => !(CH[x.g] && x.g === 'Head' && false));
  const distSeg = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1))); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
  // ---- simplify each part, remap uv into the atlas, weigh
  const CELL = cfg.cell, COLS = cfg.cols, ROWS = cfg.rows, corners = { pos: [], nor: [], uv: [], jnt: [], wgt: [] };
  const sigma = (cfg.sigma || .045) * (headTop - soleY);
  const BONEI = g => gi.get(g);
  let totalTris = 0;
  const katana = meshes.find(m => m.cf.role === 'katana');
  for (const m of meshes) {
    const { cf } = m, nV = m.pos.length / 3;
    if (cf.role === 'katana') {   // the file holds the drawn sword and its sheath side by side: slide the sheath over the blade first
      { const thr = cfg.katanaSplitX ?? -2.08; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (let k = 0; k < nV; k++) { const x = m.pos[k * 3]; if (x < thr) { a0 = Math.min(a0, x); a1 = Math.max(a1, x); } else { b0 = Math.min(b0, x); b1 = Math.max(b1, x); } } const dx = (a0 + a1) / 2 - (b0 + b1) / 2; for (let k = 0; k < nV; k++) if (m.pos[k * 3] >= thr) m.pos[k * 3] += dx; }
      // sheathed on the model's LEFT hip: the long axis (hilt low, tip high in the file) -> pointing back and slightly down
      const c = V(), mn = V(1e9, 1e9, 1e9), mx = V(-1e9, -1e9, -1e9); for (let k = 0; k < nV; k++) { const p = V(m.pos[k * 3], m.pos[k * 3 + 1], m.pos[k * 3 + 2]); mn.min(p); mx.max(p); } c.copy(mn).add(mx).multiplyScalar(.5);
      const q = new T.Quaternion().setFromUnitVectors(V(0, 1, 0), V(...(cfg.katanaAxis || [.12, -.22, -1])).normalize()), M = new T.Matrix4().compose(V(0, 0, 0), q, V(1, 1, 1)), at = V(...(cfg.katanaAt || [.62, 0, 0.1])).multiplyScalar(s).add(V(0, Pn.Hips.y, Pn.Hips.z)); const sc = (cfg.katanaScale || 1);
      for (let k = 0; k < nV; k++) { const p = V(m.pos[k * 3] - c.x, m.pos[k * 3 + 1] - c.y, m.pos[k * 3 + 2] - c.z).multiplyScalar(sc).applyMatrix4(M).add(at); m.pos.set([p.x, p.y, p.z], k * 3); const n = V(m.nor[k * 3], m.nor[k * 3 + 1], m.nor[k * 3 + 2]).applyQuaternion(q); m.nor.set([n.x, n.y, n.z], k * 3); }
    }
    let idx = m.idx; const want = Math.min(idx.length, cf.tris * 3);
    if (want < idx.length) { const attr = new Float32Array(nV * 5); for (let i = 0; i < nV; i++) attr.set([m.uv[i * 2], m.uv[i * 2 + 1], m.nor[i * 3], m.nor[i * 3 + 1], m.nor[i * 3 + 2]], i * 5);
      [idx] = MeshoptSimplifier.simplifyWithAttributes(idx, m.pos, 3, attr, 5, [2.2, 2.2, .4, .4, .4], null, want, .08, ['LockBorder']); }
    const used = new Map(), keep = []; for (const v of idx) if (!used.has(v)) { used.set(v, keep.length); keep.push(v); }
    const n = keep.length, P = keep.map(v => V(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]));
    // weights
    const allowed = cf.bind === 'auto' ? (cf.allow ? new Set(cf.allow.flatMap(g => /^(Left|Right)/.test(g) || !cf.sides ? [g] : [g])) : null) : null;
    const W = new Float32Array(n * gnames.length);
    if (cf.bind !== 'auto') for (let k = 0; k < n; k++) W[k * gnames.length + BONEI(cf.bind)] = 1;
    else {
      const cand = segs2.filter(x => !cf.deny || !cf.deny.some(rx => new RegExp(rx).test(x.g)));
      for (let k = 0; k < n; k++) { const d = cand.map(x => distSeg(P[k], x.a, x.b)), dm = Math.min(...d); let sum = 0; const row = new Map();
        cand.forEach((x, i) => { const w = Math.exp(-(((d[i] - dm) / sigma) ** 2)); if (w > .02) row.set(x.g, (row.get(x.g) || 0) + w); });
        for (const [g, w] of row) { W[k * gnames.length + BONEI(g)] = w; sum += w; } for (const [g] of row) W[k * gnames.length + BONEI(g)] /= sum; }
      // Laplacian smoothing over the mesh edges
      const nb = Array.from({ length: n }, () => new Set()); for (let t = 0; t < idx.length; t += 3) { const a = used.get(idx[t]), b = used.get(idx[t + 1]), c = used.get(idx[t + 2]); nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
      // vertices that share a position (uv seams) must share weights
      const byPos = new Map(); P.forEach((p, k) => { const key = [Math.round(p.x * 500), Math.round(p.y * 500), Math.round(p.z * 500)].join(','); (byPos.get(key) || byPos.set(key, []).get(key)).push(k); });
      for (const g of byPos.values()) for (const a of g) for (const b of g) if (a !== b) nb[a].add(b);
      const G = gnames.length; let cur = W;
      for (let it = 0; it < (cf.smooth ?? 5); it++) { const nx = new Float32Array(cur.length); for (let k = 0; k < n; k++) { const ns = [...nb[k]]; for (let g = 0; g < G; g++) { let a = 0; for (const q of ns) a += cur[q * G + g]; nx[k * G + g] = .5 * cur[k * G + g] + .5 * (ns.length ? a / ns.length : cur[k * G + g]); } } cur = nx; }
      W.set(cur);
    }
    if (cf.role === 'body' && cfg.inset) {   // the skin under the clothes is pushed in so the simplified garments never show it through (head, neck, hands and feet stay)
      const IN = new Set(['Hips', 'Spine', 'Chest', 'UpperChest', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg']), G = gnames.length;
      for (let k = 0; k < n; k++) { let w = 0; for (let g = 0; g < G; g++) if (IN.has(gnames[g])) w += W[k * G + g]; const v = keep[k], d = cfg.inset * s * w; m.pos[v * 3] -= m.nor[v * 3] * d; m.pos[v * 3 + 1] -= m.nor[v * 3 + 1] * d; m.pos[v * 3 + 2] -= m.nor[v * 3 + 2] * d; } }
    // corners
    const cellU = (cf.cell % COLS) / COLS, cellV = Math.floor(cf.cell / COLS) / ROWS, pad = .004;
    const warn = []; for (let t = 0; t < idx.length; t++) { const v = idx[t], k = used.get(v); let u = m.uv[v * 2], vv = m.uv[v * 2 + 1]; if (u < -.01 || u > 1.01 || vv < -.01 || vv > 1.01) warn.push(1); u = Math.min(1, Math.max(0, u)); vv = Math.min(1, Math.max(0, vv));
      corners.pos.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]); corners.nor.push(m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]);
      const U = cellU + (pad + u * (1 - 2 * pad)) / COLS, Vg = cellV + (pad + vv * (1 - 2 * pad)) / ROWS; corners.uv.push(U, 1 - Vg);   // build_avatar flips v again (FBX v is up)
      const row = []; for (let g = 0; g < gnames.length; g++) { const w = W[k * gnames.length + g]; if (w > 0) row.push([g, w]); } row.sort((a, b) => b[1] - a[1]); const top = row.slice(0, 4), sm = top.reduce((a, b) => a + b[1], 0) || 1;
      for (let q = 0; q < 4; q++) { corners.jnt.push(top[q] ? top[q][0] : 0); corners.wgt.push(top[q] ? top[q][1] / sm : 0); } }
    totalTris += idx.length / 3; log(`  ${m.name.padEnd(22)} ${(m.idx.length / 3) | 0} -> ${idx.length / 3} tris${warn.length ? '  (uv outside 0..1: ' + warn.length + ' corners clamped)' : ''}`);
  }
  log(`static rig: ${totalTris} tris`);
  // ---- atlas
  const cells = []; for (const m of meshes) { const t = m.mat.pbrMetallicRoughness && m.mat.pbrMetallicRoughness.baseColorTexture; if (!t) continue; const im = j.images[j.textures[t.index].source], bv = j.bufferViews[im.bufferView]; cells[m.cf.cell] = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); }
  const comp = []; for (let c = 0; c < COLS * ROWS; c++) if (cells[c]) comp.push({ input: await sharp(cells[c]).resize(CELL, CELL, { fit: 'fill' }).flatten({ background: '#808080' }).png().toBuffer(), left: (c % COLS) * CELL, top: Math.floor(c / COLS) * CELL });
  const atlas = await sharp({ create: { width: COLS * CELL, height: ROWS * CELL, channels: 3, background: '#808080' } }).composite(comp).png().toBuffer();
  const o = { name: path.basename(file, '.glb'), pos: Float32Array.from(corners.pos), nor: Float32Array.from(corners.nor), uv: Float32Array.from(corners.uv), jnt: Uint16Array.from(corners.jnt), wgt: Float32Array.from(corners.wgt), bones, tex: { map: { bytes: atlas, mime: 'image/png' } }, matName: 'samurai', hasBindIdentity: true, units: 'm' };
  o.debug = { Pn: Object.fromEntries(Object.entries(Pn).map(([k, v]) => [k, v.toArray().map(x => +x.toFixed(3))])), soleY, headTop };
  return o;
}
