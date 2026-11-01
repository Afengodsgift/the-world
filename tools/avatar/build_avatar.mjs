// Builds a game-ready avatar GLB from a Mixamo-rigged character FBX (7.x or 6.1), re-skinned onto THE WORLD's own game rig (assets/char.glb).
//
//   THREE_NM=<dir containing three/>  MESHOPT_JS=<meshopt_simplifier.js>  [SHARP_NM=<dir containing sharp/>]
//   node tools/avatar/build_avatar.mjs <in.fbx> <out.glb> --name=crypto --height=1.88 [--tris=9000] [--tex=1024] [--ntex=512] [--cfg=tools/avatar/cfg/crypto.json]
//
// The character keeps its OWN modelled rest pose (T-pose) and proportions - nothing is re-posed into the stock chibi pose. The output uses the game rig's node tree and
// bone NAMES and the rig's local-axis convention (each bone frame is swung onto this character's own bone direction), so the procedural systems (FlightPose, CombatPose,
// GunLoco/Outlaw.poseGun, helm steering, fishing rod, hand grips) keep working. The game's clip sets are NOT reused as-is (they are authored against the chibi rig's pose):
// tools/avatar/retarget_clips.mjs bakes a per-avatar copy. Optional per-part meshes (--cfg) and a recolour mask/palette sidecar (<out>.json) support the wardrobe.
// See docs/AVATARS.md.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';
import { readGlb, GlbBuilder } from './glb_io.mjs';
import { extractFbx } from './fbx_extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..', '..');
const NM = process.env.THREE_NM || path.join(ROOT, 'node_modules');
const T = await import(pathToFileURL(path.join(NM, 'three/build/three.module.js')).href);
const sharp = createRequire((process.env.SHARP_NM || '/opt/npm-tools/node_modules') + '/x.js')('sharp');
const { MeshoptSimplifier } = await import(pathToFileURL(process.env.MESHOPT_JS || path.join(NM, 'meshoptimizer/meshopt_simplifier.js')).href);
await MeshoptSimplifier.ready;

const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--')), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [srcF, outF] = pos;
if (!srcF || !outF) { console.error('usage: build_avatar.mjs <in.fbx> <out.glb> --name=<id> --height=<m>'); process.exit(1); }
const RIG = path.resolve(ROOT, opt.rig || 'assets/char.glb'), NAME = opt.name || 'avatar', HEIGHT = +(opt.height || 1.8), REF = +(opt.ref || 1.8), TRIS = +(opt.tris || 9000), TEX = +(opt.tex || 1024), NTEX = +(opt.ntex || 512);
const CFG = opt.cfg ? JSON.parse(fs.readFileSync(path.resolve(opt.cfg), 'utf8')) : {};
const log = (...a) => console.log(...a);

// ---------- joint tables (identical to tools/transplant_char.mjs, plus the two end-site nodes) ----------
const MAP = { Hips: 'Hips', Spine: 'Spine', Spine1: 'Chest', Spine2: 'UpperChest', Neck: 'Neck', Head: 'Head' };
const POS = { Hips: 'Hips', Spine: 'Spine', Chest: 'Spine1', UpperChest: 'Spine2', Neck: 'Neck', Head: 'Head', Head_end: 'HeadTop_End' };
const CHILD = { Hips: 'Spine', Spine: 'Chest', Chest: 'UpperChest', UpperChest: 'Neck', Neck: 'Head' };
const INHERIT = { Head: 'Neck', Head_end: 'Head' };
for (const S of ['Left', 'Right']) {
  for (const b of ['Shoulder', 'Arm', 'ForeArm', 'Hand']) { MAP[S + b] = S + b; POS[S + b] = S + b; }
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3, 4]) MAP[`${S}Hand${f}${k}`] = `${S}HandIndex${Math.min(k, 3)}`;
  MAP[`${S}HandThumb1`] = `${S}HandThumb1`; for (const k of [2, 3, 4]) MAP[`${S}HandThumb${k}`] = `${S}HandThumb2`;
  for (const b of ['UpLeg', 'Leg', 'Foot']) { MAP[S + b] = S + b; POS[S + b] = S + b; }
  MAP[S + 'ToeBase'] = S + 'Toes'; MAP[S + 'Toe_End'] = S + 'Toes'; POS[S + 'Toes'] = S + 'ToeBase'; POS[S + 'Toes_end'] = S + 'Toe_End';
  for (const k of [1, 2, 3]) POS[`${S}HandIndex${k}`] = `${S}HandIndex${k}`;
  for (const k of [1, 2]) POS[`${S}HandThumb${k}`] = `${S}HandThumb${k}`;
  Object.assign(CHILD, { [S + 'Shoulder']: S + 'Arm', [S + 'Arm']: S + 'ForeArm', [S + 'ForeArm']: S + 'Hand', [S + 'UpLeg']: S + 'Leg', [S + 'Leg']: S + 'Foot', [S + 'Foot']: S + 'Toes' });
  INHERIT[S + 'Toes'] = S + 'Foot'; INHERIT[S + 'Toes_end'] = S + 'Toes'; INHERIT[S + 'Hand'] = S + 'ForeArm';
  for (const k of [1, 2, 3]) INHERIT[`${S}HandIndex${k}`] = k === 1 ? S + 'Hand' : `${S}HandIndex${k - 1}`;
  for (const k of [1, 2]) INHERIT[`${S}HandThumb${k}`] = k === 1 ? S + 'Hand' : `${S}HandThumb${k - 1}`;
}
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

// ---------- game rig ----------
const rig = readGlb(RIG), RJ = rig.json, N = RJ.nodes, par = new Array(N.length).fill(-1);
N.forEach((n, i) => (n.children || []).forEach(c => par[c] = i));
const byName = new Map(N.map((n, i) => [n.name, i]));
const local = n => new T.Matrix4().compose(V(...(n.translation || [0, 0, 0])), new T.Quaternion(...(n.rotation || [0, 0, 0, 1])), V(...(n.scale || [1, 1, 1])));
const world = i => par[i] < 0 ? local(N[i]) : world(par[i]).multiply(local(N[i]));
const wpos = n => V().setFromMatrixPosition(world(byName.get(n)));
const skin = RJ.skins[0], gJointNames = skin.joints.map(j => N[j].name), gIdx = new Map(gJointNames.map((n, i) => [n, i]));
const meshNodeIdx = N.findIndex(n => n.mesh !== undefined), meshNode = N[meshNodeIdx];
// stock character height (world units): bbox of the old mesh through the mesh node's matrix
let tY0 = 1e9, tY1 = -1e9;
{ const a = RJ.accessors[RJ.meshes[meshNode.mesh].primitives[0].attributes.POSITION], M = world(meshNodeIdx);
  for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) for (const z of [a.min[2], a.max[2]]) { const p = V(x, y, z).applyMatrix4(M); tY0 = Math.min(tY0, p.y); tY1 = Math.max(tY1, p.y); } }
const gH = tY1 - tY0;

// ---------- source character ----------
const raw = opt.static ? await (await import(pathToFileURL(path.resolve(opt.static)).href)).staticRaw(path.resolve(srcF), { NM, T, rigGlb: path.join(ROOT, 'assets/avatars/crypto.glb'), cfg: { ...CFG.static, keys: POS }, log })
  : await extractFbx(path.resolve(srcF), { nm: NM });   // --static: an unrigged T-pose GLB is rigged on the fly (tools/avatar/static_raw.mjs)
const sIdx = new Map(raw.bones.map((b, i) => [b.key, i]));
const gameNameOf = i => { for (let b = raw.bones[i]; b; b = b.parent >= 0 ? raw.bones[b.parent] : null) { const m = MAP[b.key]; if (m) return m; } return 'Hips'; };
// weld the FBX's per-triangle vertices
const nC = raw.pos.length / 3, q = (v, s) => Math.round(v * s);
const weldMap = new Map(), corner2v = new Uint32Array(nC), vsrc = [];
for (let i = 0; i < nC; i++) {
  const k = [q(raw.pos[i * 3], 1000), q(raw.pos[i * 3 + 1], 1000), q(raw.pos[i * 3 + 2], 1000), q(raw.nor[i * 3], 100), q(raw.nor[i * 3 + 1], 100), q(raw.nor[i * 3 + 2], 100), q(raw.uv[i * 2], 2000), q(raw.uv[i * 2 + 1], 2000)].join(',');
  let id = weldMap.get(k); if (id === undefined) { id = vsrc.length; weldMap.set(k, id); vsrc.push(i); } corner2v[i] = id;
}
const nV = vsrc.length, nTri = nC / 3;
log(`${NAME}: ${nC / 3 | 0} source tris, ${nV} welded verts`);
let sY0 = 1e9, sY1 = -1e9; for (let i = 0; i < nC; i++) { sY0 = Math.min(sY0, raw.pos[i * 3 + 1]); sY1 = Math.max(sY1, raw.pos[i * 3 + 1]); }
const sH = sY1 - sY0;
// per-welded-vertex game weights (top 4, merged onto game joints)
const vJ = new Array(nV), vW = new Array(nV);
for (let v = 0; v < nV; v++) {
  const c = vsrc[v], m = new Map();
  for (let k = 0; k < 4; k++) { const w = raw.wgt[c * 4 + k]; if (w > 0) { const g = gameNameOf(raw.jnt[c * 4 + k]); m.set(g, (m.get(g) || 0) + w); } }
  const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((s, a) => s + a[1], 0) || 1;
  vJ[v] = top.map(a => a[0]); vW[v] = top.map(a => a[1] / sum);
}

// ---------- the character keeps its OWN rest pose (no re-posing into the chibi pose) ----------
// Bone frames keep the game rig's local-axis convention (so Outlaw.poseGun / FlightPose / Ship steering / hand grips that assume it keep working), but each bone is
// swung (shortest arc) so it points along THIS character's own bone direction in its T-pose.  The mesh stays exactly as modelled; only the skeleton is rebuilt.
const decomp = M => { const p = V(), qq = new T.Quaternion(), sc = V(); M.decompose(p, qq, sc); return { p, q: qq, s: sc }; };
const uPos = {}, uRot = {}, uScale = {};
for (const g in POS) { const d = decomp(world(byName.get(g))); uPos[g] = d.p; uRot[g] = d.q; uScale[g] = d.s; }
const depthOf = n => { let d = 0; for (let i = byName.get(n); par[i] >= 0; i = par[i]) d++; return d; };
const names = Object.keys(POS).sort((a, b) => depthOf(a) - depthOf(b));
const HGT = gH * HEIGHT / REF;
let S = HGT / sH; let yMinS = 1e9; for (let i = 0; i < nC; i++) yMinS = Math.min(yMinS, raw.pos[i * 3 + 1] * S);
const YOFF = tY0 - yMinS;
const Pn = {};                                                            // this character's joint world positions (rig units, feet on the rig's ground)
for (const g in POS) { const b = raw.bones[sIdx.get(POS[g])].world; Pn[g] = V(b[0] * S, b[1] * S + YOFF, b[2] * S); }
const align = {};
for (const g of names) {
  if (CHILD[g]) align[g] = new T.Quaternion().setFromUnitVectors(uPos[CHILD[g]].clone().sub(uPos[g]).normalize(), Pn[CHILD[g]].clone().sub(Pn[g]).normalize());
  else align[g] = (align[INHERIT[g]] || new T.Quaternion()).clone();
}
const angs = names.filter(g => CHILD[g]).map(g => align[g].angleTo(new T.Quaternion()) * 180 / Math.PI);
log(`  height ${HEIGHT} m -> rig ${HGT.toFixed(3)} (stock ${gH.toFixed(3)}), scale ${S.toFixed(4)}; bone swing vs the rig: max ${Math.max(...angs).toFixed(1)} deg, mean ${(angs.reduce((a, b) => a + b, 0) / angs.length).toFixed(1)}`);
if (Math.sign(uPos.LeftArm.x) !== Math.sign(raw.bones[sIdx.get('LeftArm')].world[0])) throw new Error('left/right flipped between source and rig');
const NJ = JSON.parse(JSON.stringify(RJ));
const worldNJ = i => par[i] < 0 ? local(NJ.nodes[i]) : worldNJ(par[i]).multiply(local(NJ.nodes[i]));
for (const g of names) {
  const i = byName.get(g), target = new T.Matrix4().compose(Pn[g], align[g].clone().multiply(uRot[g]), uScale[g]);
  const parentW = par[i] >= 0 ? worldNJ(par[i]) : new T.Matrix4();
  const l = decomp(parentW.invert().multiply(target)); NJ.nodes[i].translation = l.p.toArray(); NJ.nodes[i].rotation = l.q.toArray(); NJ.nodes[i].scale = l.s.toArray();
}
const ibm = new Float32Array(skin.joints.length * 16); skin.joints.forEach((j, i) => ibm.set(worldNJ(j).invert().elements, i * 16));
const hipK = +(((Pn.LeftUpLeg.y - Pn.LeftFoot.y) / (uPos.LeftUpLeg.y - uPos.LeftFoot.y)).toFixed(3));
log('  hipK (leg length vs rig) ' + hipK);
const R = { P: new Float32Array(nV * 3), Nn: new Float32Array(nV * 3), yMin: 0, yMax: 0, P1: Pn };
{ let lo = 1e9, hi = -1e9; for (let v = 0; v < nV; v++) { const c = vsrc[v]; R.P.set([raw.pos[c * 3] * S, raw.pos[c * 3 + 1] * S, raw.pos[c * 3 + 2] * S], v * 3); R.Nn.set(raw.nor.subarray(c * 3, c * 3 + 3), v * 3); lo = Math.min(lo, R.P[v * 3 + 1]); hi = Math.max(hi, R.P[v * 3 + 1]); } R.yMin = lo; R.yMax = hi; }

// ---------- triangles -> parts ----------
// cfg.parts = [{ name, ...rule }] resolved by ./segment.mjs; default: one part holding everything
const triCorner = i => [corner2v[i * 3], corner2v[i * 3 + 1], corner2v[i * 3 + 2]];
let partOf = new Uint8Array(nTri), parts = [{ name: 'body' }];
let regionInfo = null;
if (CFG.segment) {
  const seg = await import(pathToFileURL(path.join(HERE, 'segment.mjs')).href);
  const r = await seg.segment({ raw, corner2v, nV, nTri, vsrc, R, vJ, vW, cfg: CFG, T, sharp, log });
  partOf = r.partOf; parts = r.parts; regionInfo = r.regionInfo;
}
log('  parts: ' + parts.map((p, i) => `${p.name}(${partOf.reduce((s, x) => s + (x === i), 0)} tris)`).join(' '));

// ---------- geometry per part: simplify, compact ----------
const uv = new Float32Array(nV * 2); for (let v = 0; v < nV; v++) { const c = vsrc[v]; uv[v * 2] = raw.uv[c * 2]; uv[v * 2 + 1] = 1 - raw.uv[c * 2 + 1]; }   // FBX v is up, glTF v is down
const jo = new Uint8Array(nV * 4), we = new Float32Array(nV * 4);
for (let v = 0; v < nV; v++) for (let k = 0; k < vJ[v].length; k++) { jo[v * 4 + k] = gIdx.get(vJ[v][k]); we[v * 4 + k] = vW[v][k]; }
for (let v = 0; v < nV; v++) R.P[v * 3 + 1] += YOFF;
// recolour zones (per vertex, read by the runtime recolour shader): 1 = head / hair, 2 = upper body + arms, 3 = hips + legs
const zone = new Uint8Array(nV);
{ const LOW = /^(Hips|Left|Right)?(UpLeg|Leg|Foot|Toes)|^Hips$/; for (let v = 0; v < nV; v++) { let h = 0, l = 0; vJ[v].forEach((g, k) => { if (g === 'Head' || g === 'Neck' || g === 'Head_end') h += vW[v][k]; else if (LOW.test(g)) l += vW[v][k]; }); zone[v] = h > .5 ? 1 : l > .5 ? 3 : 2; } }
const prims = [];
const totalTris = nTri;
parts.forEach((part, pi) => {
  const ids = []; for (let t = 0; t < nTri; t++) if (partOf[t] === pi) ids.push(...triCorner(t));
  if (!ids.length) { prims.push(null); return; }
  let idx = Uint32Array.from(ids);
  const want = Math.max(part.minTris || 300, Math.round(TRIS * (part.budget ?? (idx.length / 3) / totalTris))) * 3;
  if (want < idx.length) {
    const attr = new Float32Array(nV * 5); for (let i = 0; i < nV; i++) attr.set([uv[i * 2], uv[i * 2 + 1], we[i * 4], we[i * 4 + 1], we[i * 4 + 2]], i * 5);
    [idx] = MeshoptSimplifier.simplifyWithAttributes(idx, R.P, 3, attr, 5, [1.6, 1.6, .6, .6, .6], null, want, .05, ['LockBorder']);
  }
  const used = new Map(), keep = []; for (const v of idx) if (!used.has(v)) { used.set(v, keep.length); keep.push(v); }
  const m = keep.length, o = { n: m, pos: new Float32Array(m * 3), nor: new Float32Array(m * 3), uv: new Float32Array(m * 2), jo: new Uint8Array(m * 4), we: new Float32Array(m * 4), zone: new Uint8Array(m), keep };
  keep.forEach((s, d) => { o.pos.set(R.P.subarray(s * 3, s * 3 + 3), d * 3); o.nor.set(R.Nn.subarray(s * 3, s * 3 + 3), d * 3); o.uv.set(uv.subarray(s * 2, s * 2 + 2), d * 2); o.jo.set(jo.subarray(s * 4, s * 4 + 4), d * 4); o.we.set(we.subarray(s * 4, s * 4 + 4), d * 4); o.zone[d] = zone[s]; });
  o.idx = (m < 65535 ? Uint16Array : Uint32Array).from(idx, v => used.get(v));
  prims.push(o); log(`  part ${part.name}: ${ids.length / 3} -> ${o.idx.length / 3} tris, ${m} verts`);
});
const finalTris = prims.reduce((s, p) => s + (p ? p.idx.length / 3 : 0), 0), finalVerts = prims.reduce((s, p) => s + (p ? p.n : 0), 0);

// ---------- textures ----------
async function jpeg(buf, size, q) { return sharp(buf).resize(size, size, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#808080' }).jpeg({ quality: q, mozjpeg: true }).toBuffer(); }
const B = new GlbBuilder(NJ);
NJ.meshes = []; NJ.materials = []; NJ.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
const mat = { name: NAME, doubleSided: !!CFG.doubleSided, alphaMode: 'OPAQUE', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: CFG.roughness ?? .85 } };
const tex = {};
if (raw.tex.map) { const buf = await jpeg(raw.tex.map.bytes, TEX, 86); mat.pbrMetallicRoughness.baseColorTexture = { index: B.texture(B.image(buf, 'image/jpeg')) }; tex.map = buf.length; }
if (raw.tex.normal && !CFG.noNormal) { const buf = await jpeg(raw.tex.normal.bytes, NTEX, 88); mat.normalTexture = { index: B.texture(B.image(buf, 'image/jpeg')) }; tex.normal = buf.length; }
if (raw.tex.emissive && !CFG.noEmissive) { const buf = await jpeg(raw.tex.emissive.bytes, 512, 88); mat.emissiveTexture = { index: B.texture(B.image(buf, 'image/jpeg')) }; mat.emissiveFactor = [1, 1, 1]; tex.emissive = buf.length; }
NJ.materials.push(mat);

// ---------- write glTF: re-use the rig's node for the first part, add sibling nodes for the others ----------
const parentIdx = par[meshNodeIdx], newNodes = [];
prims.forEach((p, pi) => {
  if (!p) return;
  const prim = { attributes: { POSITION: B.accessor(p.pos, 'VEC3', { target: 34962, minmax: true }), NORMAL: B.accessor(p.nor, 'VEC3', { target: 34962 }), TEXCOORD_0: B.accessor(p.uv, 'VEC2', { target: 34962 }), JOINTS_0: B.accessor(p.jo, 'VEC4', { target: 34962 }), WEIGHTS_0: B.accessor(p.we, 'VEC4', { target: 34962 }), _ZONE: B.accessor(p.zone, 'SCALAR', { target: 34962 }) }, indices: B.accessor(p.idx, 'SCALAR', { target: 34963 }), material: 0 };
  NJ.meshes.push({ name: `${NAME}_${parts[pi].name}`, primitives: [prim] });
  const nodeDef = { name: `${NAME}_${parts[pi].name}`, mesh: NJ.meshes.length - 1, skin: 0, extras: { avatar: NAME, part: parts[pi].name, hipK } };
  if (!newNodes.length) { const mn = NJ.nodes[meshNodeIdx]; Object.assign(mn, nodeDef); delete mn.rotation; delete mn.scale; delete mn.translation; newNodes.push(meshNodeIdx); }
  else { NJ.nodes.push(nodeDef); const id = NJ.nodes.length - 1; NJ.nodes[parentIdx].children.push(id); newNodes.push(id); }
});
NJ.skins[0].inverseBindMatrices = B.accessor(ibm, 'MAT4');
NJ.asset = { version: '2.0', generator: 'tools/avatar/build_avatar.mjs (' + NAME + ')' };
const bytes = B.write(outF);
log(`wrote ${outF} ${(bytes / 1024) | 0} KB, ${finalTris} tris, ${finalVerts} verts, textures ${JSON.stringify(tex)}`);

// ---------- sidecar: everything the runtime needs to dress/fit this character ----------
const L = n => Pn[n].toArray().map(x => +x.toFixed(4));
// head extents from vertices weighted mostly to Head/Neck above the neck joint
let hMin = [1e9, 1e9, 1e9], hMax = [-1e9, -1e9, -1e9];
for (let v = 0; v < nV; v++) { const hw = vJ[v].reduce((s, g, k) => s + (g === 'Head' ? vW[v][k] : 0), 0); if (hw > .6) for (let a = 0; a < 3; a++) { const x = R.P[v * 3 + a]; hMin[a] = Math.min(hMin[a], x); hMax[a] = Math.max(hMax[a], x); } }
const info = { name: NAME, version: 1, heightM: HEIGHT, rigHeight: +(R.yMax + YOFF - tY0).toFixed(4), scale: +S.toFixed(5), hipK, tris: finalTris, verts: finalVerts, parts: parts.map(p => ({ name: p.name, label: p.label || p.name, default: p.default !== false })),
  landmarks: Object.fromEntries(['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head', 'Head_end', 'LeftHand', 'RightHand', 'LeftFoot', 'LeftShoulder', 'LeftToes_end'].map(n => [n, L(n)])),
  head: { min: hMin.map(x => +x.toFixed(4)), max: hMax.map(x => +x.toFixed(4)) }, ...(regionInfo || {}) };
fs.writeFileSync(outF.replace(/\.glb$/, '.json'), JSON.stringify(info));
log('wrote ' + outF.replace(/\.glb$/, '.json'));
