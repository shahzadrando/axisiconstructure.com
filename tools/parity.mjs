// Old vs new full-page comparison. Animations are frozen so only real differences count.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { routes } from './routes.mjs';

const out = 'tools/reports/parity';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new' });
const page = await browser.newPage();

async function shot(url, width) {
  await page.setViewport({ width, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.evaluate(async () => {
    document.querySelectorAll('section').forEach((s) => { s.style.contentVisibility = 'visible'; });
    document.querySelectorAll('.fade-in-up,.fade-in-left,.fade-in-right,.scale-in').forEach((e) => e.classList.add('visible'));
    document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    await document.fonts.ready;
  });
  await new Promise((r) => setTimeout(r, 250));
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  return { buf: Buffer.from(await page.screenshot({ type: 'png', fullPage: true })), height };
}

const rows = [];
for (const route of routes) {
  const name = route === '/' ? 'home' : route.slice(1);
  for (const width of [1280, 390]) {
    const a = await shot(`http://localhost:4173${route}`, width);
    const b = await shot(`http://localhost:4321${route}`, width);
    const [ma, mb] = [await sharp(a.buf).metadata(), await sharp(b.buf).metadata()];
    const h = Math.min(ma.height, mb.height, 12000);
    const w = Math.min(ma.width, mb.width);
    const raw = async (s) => sharp(s.buf).extract({ left: 0, top: 0, width: w, height: h }).resize({ width: 160, height: Math.round(h / 8), fit: 'fill' }).blur(1).removeAlpha().raw().toBuffer();
    const [ra, rb] = await Promise.all([raw(a), raw(b)]);
    let diff = 0;
    for (let i = 0; i < ra.length; i++) diff += Math.abs(ra[i] - rb[i]);
    const pct = (diff / ra.length / 255) * 100;
    rows.push({ name, width, oldH: a.height, newH: b.height, heightDiff: b.height - a.height, pct: +pct.toFixed(1) });
    if ((['home', 'about', 'contact', 'team', 'civil-engineering', 'careers'].includes(name))) {
      const left = await sharp(a.buf).resize({ width: 500 }).png().toBuffer();
      const right = await sharp(b.buf).resize({ width: 500 }).png().toBuffer();
      const lh = (await sharp(left).metadata()).height, rh = (await sharp(right).metadata()).height;
      await sharp({ create: { width: 1020, height: Math.max(lh, rh), channels: 3, background: '#ff00ff' } })
        .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 520, top: 0 }]).png().toFile(`${out}/${name}-${width}.png`);
    }
  }
  console.log('done', name);
}
await browser.close();
rows.sort((x, y) => y.pct - x.pct);
fs.writeFileSync(`${out}/results.json`, JSON.stringify(rows, null, 1), 'utf8');
console.log('avg diff %', (rows.reduce((s, r) => s + r.pct, 0) / rows.length).toFixed(1));
console.log(rows.slice(0, 12).map((r) => `${r.name}@${r.width} diff ${r.pct}% height ${r.oldH}->${r.newH}`).join('\n'));
