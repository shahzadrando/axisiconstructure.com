// Image pipeline.  node tools/optimize-images.mjs shrink            -> re-encode every public/images webp over 100 KB
//                  node tools/optimize-images.mjs add <manifest.json> -> import new photos: [{src, dest, w?}] -> public/images/<dest>.webp (+ -640/-960)
// Every output is webp and <= 100 KB; src/generated/images.json records {w,h,v:[variant widths]} for the new photos.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

sharp.cache(false); // sharp keeps input files open otherwise, which blocks rewriting them on Windows
const MAX = 100 * 1024;
const ROOT = "public/images";
const REG = "src/generated/images.json";
// Windows occasionally refuses a write (AV/indexer lock): retry a few times.
const put = (f, buf) => { for (let i = 0; ; i++) { try { return fs.writeFileSync(f, buf); } catch (e) { if (i > 8) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name).split(path.sep).join("/")]));

// Best quality that fits MAX at the given width; null if even q50 does not fit.
async function fit(input, w, alpha) {
  for (let q = 82; q >= 50; q -= 4) {
    const buf = await sharp(input).resize({ width: w, withoutEnlargement: true }).webp({ quality: q, effort: 6, smartSubsample: true, alphaQuality: alpha ? 80 : 100 }).toBuffer();
    if (buf.length <= MAX) return buf;
  }
  return null;
}
// Walks widths down (never below 1100 for hero-size photos unless the source is smaller) until one fits.
async function encode(input, startW) {
  const meta = await sharp(input).metadata();
  for (let w = Math.min(startW, meta.width); w >= 400; w = Math.round(w * 0.92)) {
    const buf = await fit(input, w, meta.hasAlpha);
    if (buf) return buf;
  }
  throw new Error("cannot fit " + input);
}

async function variants(input, outBase, fullW, reg) {
  const sizes = [];
  for (const v of [640, 960]) if (fullW > v + 80) { put(`${outBase}-${v}.webp`, await encode(input, v)); sizes.push(v); }
  return sizes;
}

const [mode, manifest] = process.argv.slice(2);
if (mode === "shrink") {
  const changed = [];
  for (const f of walk(ROOT).filter((f) => f.endsWith(".webp") && !/flags|logo-/.test(f))) {
    if (fs.statSync(f).size <= MAX) continue;
    const before = await sharp(fs.readFileSync(f)).metadata(), size0 = fs.statSync(f).size;
    const buf = await encode(fs.readFileSync(f), before.width);
    put(f, buf);
    const after = await sharp(buf).metadata();
    changed.push(`${f} ${before.width}x${before.height} ${Math.round(size0 / 1024)}KB -> ${after.width}x${after.height} ${Math.round(buf.length / 1024)}KB`);
  }
  console.log(changed.join("\n") || "nothing over 100 KB");
} else if (mode === "add") {
  const reg = fs.existsSync(REG) ? JSON.parse(fs.readFileSync(REG, "utf8")) : {};
  for (const { src, dest, w = 1600, crop } of JSON.parse(fs.readFileSync(manifest, "utf8"))) {
    let input = fs.readFileSync(src);
    if (crop) input = await sharp(input).extract(crop).toBuffer();
    const out = `${ROOT}/${dest}`;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const buf = await encode(input, w);
    put(`${out}.webp`, buf);
    const m = await sharp(buf).metadata();
    const v = await variants(input, out, m.width);
    reg[`/images/${dest}`] = { w: m.width, h: m.height, v };
    console.log(`${dest} ${m.width}x${m.height} ${Math.round(buf.length / 1024)}KB variants ${v}`);
  }
  fs.writeFileSync(REG, JSON.stringify(reg, null, 1));
} else if (mode === "index") {
  // Registry of every image (size + which -640/-960 variants exist) so pages can emit srcset/width/height without guessing.
  const reg = {};
  for (const f of walk(ROOT).filter((f) => f.endsWith(".webp") && !/-(640|960)\.webp$|flags|logo-/.test(f))) {
    const m = await sharp(fs.readFileSync(f)).metadata(), base = f.slice(0, -5);
    reg[f.slice("public".length, -5)] = { w: m.width, h: m.height, v: [640, 960].filter((v) => fs.existsSync(`${base}-${v}.webp`)) };
  }
  fs.writeFileSync(REG, JSON.stringify(reg));
  console.log(Object.keys(reg).length, "images indexed");
} else console.log("usage: shrink | add <manifest.json> | index");
