// Responsive check: for each viewport x page, report horizontal overflow and the
// elements sticking out past the right edge; save a screenshot of the top of the page.
// Usage: node responsive_check.mjs BASE_URL OUT_DIR [/page1,/page2,...]
// Needs `npm i puppeteer-core` and a local Chrome. Elements reported mid slide-in
// animation are false positives when overflow=false.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const base = process.argv[2];
const out = process.argv[3];
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find((p) => fs.existsSync(p));

const VIEWPORTS = [
  { name: "phone-360", width: 360, height: 780, mobile: true },
  { name: "phone-414", width: 414, height: 896, mobile: true },
  { name: "tablet-768", width: 768, height: 1024, mobile: true },
  { name: "tablet-1024", width: 1024, height: 768, mobile: false },
  { name: "laptop-1280", width: 1280, height: 800, mobile: false },
  { name: "desktop-1920", width: 1920, height: 1080, mobile: false },
];
const PAGES = process.argv[4] ? process.argv[4].split(",") : ["/", "/about", "/contact"];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const results = [];
for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 1 });
  for (const path of PAGES) {
    await page.goto(base + path, { waitUntil: "networkidle2", timeout: 60000 });
    // reveal-on-scroll content: scroll through the page so everything is laid out
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
      window.scrollTo(0, 0);
    });
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const docW = document.documentElement.scrollWidth;
      const offenders = [];
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.right > vw + 1 || b.left < -1) {
          // skip if an ancestor clips overflow
          let p = el.parentElement, clipped = false;
          while (p && p !== document.body) {
            const ps = getComputedStyle(p);
            if (/(hidden|clip|auto|scroll)/.test(ps.overflowX)) { const pb = p.getBoundingClientRect(); if (pb.right <= vw + 1 && pb.left >= -1) { clipped = true; break; } }
            p = p.parentElement;
          }
          if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} [${Math.round(b.left)}..${Math.round(b.right)}] "${(el.innerText || "").trim().slice(0, 40)}"`);
        }
      }
      const smallText = [...document.querySelectorAll("p, li, a, span, button")].filter((e) => {
        const s = parseFloat(getComputedStyle(e).fontSize); return e.offsetParent && e.innerText?.trim() && s < 11;
      }).length;
      const smallTaps = [...document.querySelectorAll("a, button")].filter((e) => {
        const b = e.getBoundingClientRect(); return e.offsetParent && b.width > 0 && (b.width < 24 || b.height < 24);
      }).length;
      return { vw, docW, overflow: docW > vw + 1, offenders: offenders.slice(0, 6), smallText, smallTaps };
    });
    results.push({ vp: vp.name, path, ...r });
    if (path === "/" || path === "/contact" || path === "/services/performance-marketing") {
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 0); }); await new Promise((r) => setTimeout(r, 300)); await page.screenshot({ path: `${out}/${vp.name}${path.replace(/\//g, "_") || "_home"}.png` });
    }
  }
  await page.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
for (const r of results) {
  if (r.overflow || r.offenders.length || r.smallText)
    console.log(`${r.vp} ${r.path} overflow=${r.overflow} (${r.docW}/${r.vw}) smallText=${r.smallText} smallTaps=${r.smallTaps}\n   ${r.offenders.join("\n   ")}`);
}
console.log("checked", results.length, "page/viewport combos");
