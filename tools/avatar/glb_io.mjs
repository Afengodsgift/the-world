// Minimal GLB reader/writer for the avatar build tools (no @gltf-transform dependency).
//   readGlb(file)            -> { json, bin }
//   new GlbBuilder(json)     -> assembles accessors / bufferViews / images into one BIN chunk, then .write(file)
import fs from 'fs';

export function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.toString('latin1', 0, 4) !== 'glTF') throw new Error(file + ': not a GLB');
  const jl = b.readUInt32LE(12), json = JSON.parse(b.toString('utf8', 20, 20 + jl));
  const bo = 20 + jl + (4 - jl % 4) % 4, bl = b.readUInt32LE(bo);
  return { json, bin: b.subarray(bo + 8, bo + 8 + bl) };
}

const CT = { Float32Array: 5126, Uint32Array: 5125, Uint16Array: 5123, Uint8Array: 5121, Int8Array: 5120, Int16Array: 5122 };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export class GlbBuilder {
  constructor(json) { this.json = json; this.chunks = []; this.len = 0; json.accessors = []; json.bufferViews = []; json.images = json.images || []; json.textures = json.textures || []; }
  _view(buf, target) {
    const pad = (4 - this.len % 4) % 4; if (pad) { this.chunks.push(Buffer.alloc(pad)); this.len += pad; }
    const v = { buffer: 0, byteOffset: this.len, byteLength: buf.length }; if (target) v.target = target;
    this.chunks.push(buf); this.len += buf.length; this.json.bufferViews.push(v); return this.json.bufferViews.length - 1;
  }
  accessor(arr, type, { target, normalized, minmax } = {}) {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), n = NC[type];
    const a = { bufferView: this._view(buf, target), componentType: CT[arr.constructor.name], count: arr.length / n, type };
    if (normalized) a.normalized = true;
    if (minmax) { const mn = new Array(n).fill(Infinity), mx = new Array(n).fill(-Infinity); for (let i = 0; i < arr.length; i++) { const k = i % n; if (arr[i] < mn[k]) mn[k] = arr[i]; if (arr[i] > mx[k]) mx[k] = arr[i]; } a.min = mn; a.max = mx; }
    this.json.accessors.push(a); return this.json.accessors.length - 1;
  }
  image(buf, mimeType) { const i = this.json.images.length; this.json.images.push({ bufferView: this._view(buf), mimeType }); return i; }
  texture(imageIdx, sampler = 0) { this.json.textures.push({ source: imageIdx, sampler }); return this.json.textures.length - 1; }
  write(file) {
    const j = this.json; j.buffers = [{ byteLength: this.len + (4 - this.len % 4) % 4 }];
    let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
    const bin = Buffer.concat([...this.chunks, Buffer.alloc((4 - this.len % 4) % 4)]);
    const h = Buffer.alloc(12); h.write('glTF', 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
    const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.write('JSON', 4);
    const c2 = Buffer.alloc(8); c2.writeUInt32LE(bin.length, 0); c2.write('BIN\0', 4);
    fs.writeFileSync(file, Buffer.concat([h, c1, js, c2, bin])); return fs.statSync(file).size;
  }
}
