// Re-skins a Mixamo-rigged character (T-pose, metres, Y-up, +Z forward) onto THE WORLD's own game rig (assets/char.glb), so the new character
// plays EVERY existing clip (assets/anims|emotes|verb_anims|gun_anims|combat_anims.json), FlightPose, fishing rod, gun poses, WardenAnim...
// with no retargeting: the output has the game rig's node tree, bone names and bind-pose bone ROTATIONS; only the joint POSITIONS (and the mesh) are the new character's.
//   node tools/transplant_char.mjs <src.glb> <out.glb> [--rig=assets/char.glb] [--ref=1.8] [--tris=9000] [--tex=1024] [--ntex=512] [--name=Crypto]
//   --ref = height (m) that maps to the rig's own character height (so a 1.65 m character comes out ~8% shorter than a 1.8 m one)
// How it works
//  1. map Mixamo joints -> game joints (Spine1->Chest, Spine2->UpperChest, ToeBase->Toes; Middle/Ring/Pinky merge into the Index chain because the game rig only has index+thumb; eyes/end sites -> parent)
//  2. keep the game rig's local rotations; set each deform joint's translation so its WORLD position is the Mixamo joint's (scaled). HipsCtrl (the bone every clip translates) keeps the rig's position,
//     Hips sits where the character's own hips are, so standing feet are planted and clip hip bob transfers 1:1.
//  3. IBM = inverse(bind world) of the new tree; mesh stays in the character's own bind pose (identity mesh node, world units)
//  4. weights remapped onto the game joints (merged, top 4, renormalised), geometry simplified with meshoptimizer (uv + weights aware), textures re-encoded to JPEG/PNG for phones
// Needs @gltf-transform/core+extensions, gl-matrix, sharp, meshoptimizer (THREE_NM, default /home/claude/tools/node_modules).
import fs from 'fs';
import { createRequire } from 'module';
const NM = process.env.THREE_NM || '/home/claude/tools/node_modules';
const req = createRequire(NM + '/x.js');
const { NodeIO } = await import(req.resolve('@gltf-transform/core'));
const { ALL_EXTENSIONS } = await import(req.resolve('@gltf-transform/extensions'));
const { mat4, vec3 } = await import(req.resolve('gl-matrix'));
const sharp = (await import(req.resolve('sharp'))).default;
const { MeshoptSimplifier } = await import(req.resolve('meshoptimizer'));
await MeshoptSimplifier.ready;

const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--')), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [srcF, outF] = pos;
const RIG = opt.rig || 'assets/char.glb', REF = +(opt.ref || 1.8), TRIS = +(opt.tris || 9000), TEX = +(opt.tex || 1024), NTEX = +(opt.ntex || 512), NAME = opt.name || 'char';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const src = await io.read(srcF), rig = await io.read(RIG);

// ---------- joint mapping ----------
const MAP = { Hips: 'Hips', Spine: 'Spine', Spine1: 'Chest', Spine2: 'UpperChest', Neck: 'Neck', Head: 'Head' };
for (const S of ['Left', 'Right']) {
  for (const b of ['Shoulder', 'Arm', 'ForeArm', 'Hand']) MAP[S + b] = S + b;
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3, 4]) MAP[`${S}Hand${f}${k}`] = `${S}HandIndex${Math.min(k, 3)}`;
  MAP[`${S}HandThumb1`] = `${S}HandThumb1`; for (const k of [2, 3, 4]) MAP[`${S}HandThumb${k}`] = `${S}HandThumb2`;
  for (const b of ['UpLeg', 'Leg', 'Foot']) MAP[S + b] = S + b;
  MAP[S + 'ToeBase'] = S + 'Toes'; MAP[S + 'Toe_End'] = S + 'Toes';
}
// joints whose WORLD POSITION is taken from the Mixamo joint (the 33 animated deform bones)
const POS = { Hips: 'Hips', Spine: 'Spine', Chest: 'Spine1', UpperChest: 'Spine2', Neck: 'Neck', Head: 'Head' };
for (const S of ['Left', 'Right']) {
  for (const b of ['Shoulder', 'Arm', 'ForeArm', 'Hand']) POS[S + b] = S + b;
  for (const k of [1, 2, 3]) POS[`${S}HandIndex${k}`] = `${S}HandIndex${k}`;
  for (const k of [1, 2]) POS[`${S}HandThumb${k}`] = `${S}HandThumb${k}`;
  for (const b of ['UpLeg', 'Leg', 'Foot']) POS[S + b] = S + b; POS[S + 'Toes'] = S + 'ToeBase';
}
const strip = n => n.replace(/^mixamorig\d*:/, '');

// ---------- source skeleton (bind pose from the IBMs) ----------
const sRoot = src.getRoot(), sMesh = sRoot.listMeshes()[0], sSkin = sRoot.listSkins()[0], sJoints = sSkin.listJoints();
const sIBM = sSkin.getInverseBindMatrices().getArray();
const sBind = sJoints.map((_, i) => { const m = mat4.invert(mat4.create(), sIBM.subarray(i * 16, i * 16 + 16)); return vec3.fromValues(m[12], m[13], m[14]); });
const sIdx = new Map(sJoints.map((j, i) => [strip(j.getName()), i]));
const sNode = new Map(sJoints.map(j => [j, true]));
// source joint -> game joint name (walk up parents until something maps)
function gameNameOf(j) { for (let n = j; n; n = n.getParentNode()) { const m = MAP[strip(n.getName())]; if (m) return m; } return 'Hips'; }

// ---------- game rig ----------
const gRoot = rig.getRoot(), gSkin = gRoot.listSkins()[0], gJoints = gSkin.listJoints(), gIdx = new Map(gJoints.map((j, i) => [j.getName(), i]));
const gOldMesh = gRoot.listMeshes()[0];
const meshNodeOld = gRoot.listNodes().find(n => n.getMesh());
const tm = meshNodeOld.getWorldMatrix(), pa = gOldMesh.listPrimitives()[0].getAttribute('POSITION'), mn = pa.getMin([]), mx = pa.getMax([]);
let tY0 = 1e9, tY1 = -1e9; for (const x of [mn[0], mx[0]]) for (const y of [mn[1], mx[1]]) for (const z of [mn[2], mx[2]]) { const p = vec3.transformMat4(vec3.create(), [x, y, z], tm); tY0 = Math.min(tY0, p[1]); tY1 = Math.max(tY1, p[1]) }
const gH = tY1 - tY0;

// ---------- source geometry: gather + measure ----------
const prims = sMesh.listPrimitives();
let sY0 = 1e9, sY1 = -1e9; for (const p of prims) { const a = p.getAttribute('POSITION'), lo = a.getMin([]), hi = a.getMax([]); sY0 = Math.min(sY0, lo[1]); sY1 = Math.max(sY1, hi[1]) }
const sH = sY1 - sY0, S = (gH * (sH / REF)) / sH, YOFF = tY0 - sY0 * S;   // uniform scale, feet on the rig's ground
console.log(`${NAME}: source ${sH.toFixed(3)} m -> rig height ${gH.toFixed(3)} x ${(sH / REF).toFixed(3)}  scale ${S.toFixed(3)}`);
const W = p => vec3.fromValues(p[0] * S, p[1] * S + YOFF, p[2] * S);

// ---------- new bind pose: keep the rig's rotations, move deform joints ----------
const order = []; (function walk(n, d) { order.push([n, d]); n.listChildren().forEach(c => walk(c, d + 1)) })(gRoot.listScenes()[0].listChildren()[0], 0);
order.sort((a, b) => a[1] - b[1]);
let moved = 0;
for (const [n] of order) {
  const gn = n.getName(), sn = POS[gn]; if (!sn) continue;
  const si = sIdx.get(sn) ?? sIdx.get(sn); if (si === undefined) throw new Error('source joint missing: ' + sn);
  const wp = W(sBind[si]), inv = mat4.invert(mat4.create(), n.getParentNode().getWorldMatrix());
  const lp = vec3.transformMat4(vec3.create(), wp, inv); n.setTranslation([lp[0], lp[1], lp[2]]); moved++;
}
{ const a = gRoot.listNodes().find(n => n.getName() === 'LeftArm').getWorldTranslation(), s = sBind[sIdx.get('LeftArm')]; if (Math.sign(a[0]) !== Math.sign(s[0])) throw new Error('left/right flipped between source and rig') }
const ibm = new Float32Array(gJoints.length * 16);
gJoints.forEach((j, i) => ibm.set(mat4.invert(mat4.create(), j.getWorldMatrix()), i * 16));
gSkin.getInverseBindMatrices().setArray(ibm);

// ---------- geometry: remap weights, simplify, compact ----------
const total = prims.reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
const srcToGame = sJoints.map(j => gIdx.get(gameNameOf(j)));
const outPrims = [], matCache = new Map();
async function texOf(tex, size, kind) {
  if (!tex) return null; const key = tex.getName() + size + kind; if (matCache.has(key)) return matCache.get(key);
  const img = sharp(Buffer.from(tex.getImage())), meta = await img.metadata();
  let alpha = false; if (meta.hasAlpha) { const st = await sharp(Buffer.from(tex.getImage())).stats(); alpha = st.channels[3].min < 250 }
  const r = img.resize(alpha ? Math.min(size, 512) : size, alpha ? Math.min(size, 512) : size, { fit: 'inside', withoutEnlargement: true });
  const buf = alpha ? await r.png({ palette: true, quality: 90, compressionLevel: 9, effort: 9 }).toBuffer() : await r.flatten({ background: '#808080' }).jpeg({ quality: kind === 'color' ? 84 : 88, mozjpeg: true }).toBuffer();
  const t = rig.createTexture(tex.getName() || kind).setImage(new Uint8Array(buf)).setMimeType(alpha ? 'image/png' : 'image/jpeg'); const o = { t, alpha }; matCache.set(key, o); return o;
}
for (const p of prims) {
  const P = p.getAttribute('POSITION'), N = p.getAttribute('NORMAL'), UV = p.getAttribute('TEXCOORD_0'), J = p.getAttribute('JOINTS_0'), Wt = p.getAttribute('WEIGHTS_0'), I = p.getIndices();
  const n = P.getCount(), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), jo = new Uint8Array(n * 4), we = new Float32Array(n * 4), t = [0, 0, 0, 0], w = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const q = P.getElement(i, [0, 0, 0]); pos.set(W(q), i * 3); nor.set(N.getElement(i, [0, 0, 0]), i * 3); uv.set(UV.getElement(i, [0, 0]), i * 2);
    J.getElement(i, t); Wt.getElement(i, w); const m = new Map();
    for (let k = 0; k < 4; k++) if (w[k] > 0) { const g = srcToGame[t[k]]; m.set(g, (m.get(g) || 0) + w[k]) }
    const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((s, a) => s + a[1], 0) || 1;
    top.forEach(([g, ww], k) => { jo[i * 4 + k] = g; we[i * 4 + k] = ww / sum });
  }
  let idx = Uint32Array.from(I.getArray());
  const want = Math.max(900, Math.round(TRIS * (idx.length / 3) / total)) * 3;
  if (want < idx.length) {
    const attr = new Float32Array(n * 5); for (let i = 0; i < n; i++) attr.set([uv[i * 2], uv[i * 2 + 1], we[i * 4], we[i * 4 + 1], we[i * 4 + 2]], i * 5);
    [idx] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attr, 5, [1.4, 1.4, .6, .6, .6], null, want, .05, ['LockBorder']);
  }
  const used = new Map(), keep = []; for (const v of idx) if (!used.has(v)) { used.set(v, keep.length); keep.push(v) }
  const m = keep.length, cp = new Float32Array(m * 3), cn = new Float32Array(m * 3), cu = new Float32Array(m * 2), cj = new Uint8Array(m * 4), cw = new Float32Array(m * 4);
  keep.forEach((o, d) => { cp.set(pos.subarray(o * 3, o * 3 + 3), d * 3); cn.set(nor.subarray(o * 3, o * 3 + 3), d * 3); cu.set(uv.subarray(o * 2, o * 2 + 2), d * 2); cj.set(jo.subarray(o * 4, o * 4 + 4), d * 4); cw.set(we.subarray(o * 4, o * 4 + 4), d * 4) });
  const ci = (m < 65535 ? Uint16Array : Uint32Array).from(idx, v => used.get(v));
  const mat = p.getMaterial(), bc = await texOf(mat.getBaseColorTexture(), TEX, 'color'), nt = await texOf(mat.getNormalTexture(), NTEX, 'normal'), et = await texOf(mat.getEmissiveTexture(), NTEX, 'emis');
  const M = rig.createMaterial(mat.getName() || NAME).setRoughnessFactor(.85).setMetallicFactor(0).setBaseColorFactor([1, 1, 1, 1]).setDoubleSided(mat.getDoubleSided());
  if (bc) M.setBaseColorTexture(bc.t); if (bc && bc.alpha) M.setAlphaMode('MASK').setAlphaCutoff(.5);
  if (nt) M.setNormalTexture(nt.t); if (et) M.setEmissiveTexture(et.t).setEmissiveFactor([1, 1, 1]);
  const acc = (name, type, arr) => rig.createAccessor(name).setType(type).setArray(arr);
  const prim = rig.createPrimitive().setAttribute('POSITION', acc('pos', 'VEC3', cp)).setAttribute('NORMAL', acc('nor', 'VEC3', cn)).setAttribute('TEXCOORD_0', acc('uv', 'VEC2', cu))
    .setAttribute('JOINTS_0', acc('j', 'VEC4', cj)).setAttribute('WEIGHTS_0', acc('w', 'VEC4', cw)).setIndices(acc('i', 'SCALAR', ci)).setMaterial(M);
  outPrims.push(prim); console.log(`  prim ${mat.getName()}: ${n} verts / ${I.getCount() / 3} tris -> ${m} verts / ${ci.length / 3} tris`);
}
const parent = meshNodeOld.getParentNode();
const mesh = rig.createMesh(NAME); outPrims.forEach(p => mesh.addPrimitive(p));
const node = rig.createNode(NAME + 'Mesh').setMesh(mesh).setSkin(gSkin); parent.addChild(node);
const oldMats = gRoot.listMaterials().filter(m => !outPrims.some(p => p.getMaterial() === m));
meshNodeOld.dispose(); gOldMesh.dispose(); oldMats.forEach(m => m.dispose());
for (const t of gRoot.listTextures()) if (!gRoot.listMaterials().some(m => [m.getBaseColorTexture(), m.getNormalTexture(), m.getEmissiveTexture()].includes(t))) t.dispose();
await io.write(outF, rig);
console.log(`wrote ${outF} ${(fs.statSync(outF).size / 1024) | 0} KB, ${moved} joints repositioned`);
