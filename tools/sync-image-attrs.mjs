// Re-syncs srcset / width / height on every <img> in the generated pages (and the card + page JSON) with the real files,
// using src/generated/images.json (run `node tools/optimize-images.mjs index` first). Safe to re-run.
import fs from "node:fs";

const reg = JSON.parse(fs.readFileSync("src/generated/images.json", "utf8"));
const srcset = (base, r) => (r.v.length ? [...r.v.map((v) => `${base}-${v}.webp ${v}w`), `${base}.webp ${r.w}w`].join(", ") : "");
let fixed = 0;

const setAttr = (tag, name, value) => {
  const re = new RegExp(`\\s${name}="[^"]*"`);
  if (value === "") return tag.replace(re, "");
  return re.test(tag) ? tag.replace(re, ` ${name}="${value}"`) : tag.replace(/\s*\/?>$/, (end) => ` ${name}="${value}"${end}`);
};

for (const f of fs.readdirSync("src/generated/pages").filter((f) => f.endsWith(".html")).map((f) => `src/generated/pages/${f}`).concat(["src/generated/header.html", "src/generated/footer.html"])) {
  const html = fs.readFileSync(f, "utf8");
  const out = html.replace(/<img\b[^>]*>/g, (tag) => {
    const m = tag.match(/\ssrc="(\/images\/[^"]+)\.webp"/);
    const r = m && reg[m[1]];
    if (!r) return tag;
    let t = setAttr(tag, "srcset", srcset(m[1], r));
    if (/\swidth="/.test(t)) { t = setAttr(t, "width", r.w); t = setAttr(t, "height", r.h); }
    if (t !== tag) fixed++;
    return t;
  });
  if (out !== html) fs.writeFileSync(f, out);
}

// JSON: any object with src/srcset/width/height (cards.json) and pages.json lcpImage/lcpSrcset.
const walk = (o) => {
  if (Array.isArray(o)) return o.forEach(walk);
  if (!o || typeof o !== "object") return;
  const base = typeof o.src === "string" && o.src.replace(/\.webp$/, "");
  if (base && reg[base] && "srcset" in o) { const r = reg[base]; o.srcset = srcset(base, r); o.width = String(r.w); o.height = String(r.h); fixed++; }
  const lb = typeof o.lcpImage === "string" && o.lcpImage.replace(/\.webp$/, "");
  if (lb && reg[lb]) { o.lcpSrcset = srcset(lb, reg[lb]); fixed++; }
  Object.values(o).forEach(walk);
};
for (const f of ["src/generated/cards.json", "src/generated/pages.json"]) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  walk(j);
  fs.writeFileSync(f, JSON.stringify(j, null, 1) + "\n");
}
console.log("synced", fixed, "image references");
