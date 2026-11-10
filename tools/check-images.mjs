// Every image is webp and <= 100 KB, and every <img src/srcset> in the built pages points at a file that exists.
import fs from "node:fs";
import path from "node:path";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name).split(path.sep).join("/")]));
const bad = [];
for (const f of walk("public/images")) {
  if (!f.endsWith(".webp")) bad.push(`not webp: ${f}`);
  else if (fs.statSync(f).size > 100 * 1024) bad.push(`over 100 KB: ${f} (${Math.round(fs.statSync(f).size / 1024)} KB)`);
}
const pages = fs.existsSync("dist/client") ? walk("dist/client").filter((f) => f.endsWith(".html")) : [];
for (const f of pages) {
  for (const [, tag] of fs.readFileSync(f, "utf8").matchAll(/<img\b([^>]*)>/g)) {
    const urls = [...tag.matchAll(/\ssrc="(\/images\/[^"]+)"/g), ...tag.matchAll(/\ssrcset="([^"]+)"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+/)[0])).filter((u) => u.startsWith("/images/"));
    for (const u of urls) if (!fs.existsSync("public" + u)) bad.push(`${f}: missing ${u}`);
  }
}
console.log(bad.length ? "IMAGE PROBLEMS\n" + bad.join("\n") : `images OK (${pages.length} pages checked)`);
process.exit(bad.length ? 1 : 0);
