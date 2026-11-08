// Compares two screenshot folders from tools/shots.mjs and lists pages whose pixels changed.
// Usage: node tools/shotdiff.mjs <beforeDir> <afterDir>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [a, b] = process.argv.slice(2);
const rows = [];
for (const f of fs.readdirSync(a).filter((x) => x.endsWith('.png'))) {
  if (!fs.existsSync(path.join(b, f))) { rows.push([f, 'missing', 100]); continue; }
  const [x, y] = await Promise.all([sharp(path.join(a, f)).raw().toBuffer({ resolveWithObject: true }), sharp(path.join(b, f)).raw().toBuffer({ resolveWithObject: true })]);
  if (x.info.width !== y.info.width || x.info.height !== y.info.height) { rows.push([f, `size ${x.info.width}x${x.info.height} -> ${y.info.width}x${y.info.height}`, 100]); continue; }
  let diff = 0;
  const ch = x.info.channels;
  for (let i = 0; i < x.data.length; i += ch) {
    if (Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2]) > 24) diff++;
  }
  rows.push([f, 'same size', +(100 * diff / (x.info.width * x.info.height)).toFixed(2)]);
}
rows.sort((p, q) => q[2] - p[2]);
for (const r of rows.filter((r) => r[2] > 0.05)) console.log(String(r[2]).padStart(6) + '%', r[0], r[1]);
console.log('compared', rows.length, 'changed', rows.filter((r) => r[2] > 0.05).length);
