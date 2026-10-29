// Builds the recolour-protect mask for an avatar: white = skin / eyes (never tinted), black = free to recolour.
// usage: node tools/avatar/make_mask.mjs <color-map.png> <out.png> [--size=1024] [--detect=x0,y0,x1,y1 ...] [--rect=x0,y0,x1,y1 ...]
//   --detect: inside this UV box (0..1, v down) skin-coloured texels are protected;  --rect: this whole box is protected.  Outside both, everything may be recoloured.
import { createRequire } from 'module';
const sharp = createRequire(process.env.SHARP_FROM || '/opt/npm-tools/node_modules/x.js')('sharp');
const [src, out, ...rest] = process.argv.slice(2);
const SIZE = +(rest.find(a => a.startsWith('--size='))?.slice(7) || 1024);
const detects = rest.filter(a => a.startsWith('--detect=')).map(a => a.slice(9).split(',').map(Number));
const rects = rest.filter(a => a.startsWith('--rect=')).map(a => a.slice(7).split(',').map(Number));
const { data, info } = await sharp(src).removeAlpha().resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
const n = SIZE * SIZE, m = new Uint8Array(n);
for (let i = 0; i < n; i++) {
  const r = data[i * 3] / 255, g = data[i * 3 + 1] / 255, b = data[i * 3 + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), lum = .299 * r + .587 * g + .114 * b, sat = mx ? (mx - mn) / mx : 0;
  const h = (g - b) / (r - b + 1e-4);
  const u = (i % SIZE) / SIZE, v = Math.floor(i / SIZE) / SIZE;
  const inBox = detects.some(([x0, y0, x1, y1]) => u >= x0 && u < x1 && v >= y0 && v < y1);
  let skin = inBox && r >= g && g >= b * .9 && r - b > .05 && h > .25 && h < 1 && sat > .08 && sat < .75 && lum > .3;
  if (inBox && !skin && lum > .7 && sat < .3) skin = true;               // eye whites / teeth
  m[i] = skin ? 255 : 0;
}
for (const [x0, y0, x1, y1] of rects) for (let y = Math.floor(y0 * SIZE); y < y1 * SIZE; y++) for (let x = Math.floor(x0 * SIZE); x < x1 * SIZE; x++) m[y * SIZE + x] = 255;
// grow by 3 px (so the soft edge of skin never gets a coloured fringe) then soften
const grow = (src) => { const d = new Uint8Array(n); for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { let v = 0; for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < SIZE && yy < SIZE && src[yy * SIZE + xx]) { v = 255; break; } } d[y * SIZE + x] = v; } return d; };
let g3 = m; for (let k = 0; k < 3; k++) g3 = grow(g3);
await sharp(Buffer.from(g3), { raw: { width: SIZE, height: SIZE, channels: 1 } }).blur(1.2).png({ compressionLevel: 9 }).toFile(out);
let c = 0; for (const v of g3) if (v) c++;
// mean LINEAR luminance of the recolourable texels: the runtime recolour shader divides by it (catalog `ref`)
let ls = 0, ln = 0; for (let i = 0; i < n; i++) if (!g3[i]) { const lin = x => Math.pow(x / 255, 2.2); ls += .2126 * lin(data[i * 3]) + .7152 * lin(data[i * 3 + 1]) + .0722 * lin(data[i * 3 + 2]); ln++; }
console.log('ref (mean linear luminance of recolourable texels)', (ls / ln).toFixed(4));
console.log(out, 'protected', (100 * c / n).toFixed(1) + '%');
