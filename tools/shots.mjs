// Full-page screenshots of every page at phone and desktop width, animations frozen,
// so two runs (before and after a change) can be compared with tools/shotdiff.mjs.
// Usage: node tools/shots.mjs <outDir> [baseUrl]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { routes } from './routes.mjs';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:4321';
fs.mkdirSync(out, { recursive: true });
const freeze = `*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
.fade-in-up,.fade-in-left,.fade-in-right,.reveal{opacity:1!important;transform:none!important}
.capabilities-marquee-track{transform:none!important}`;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
for (const [w, tag] of [[1280, 'd'], [375, 'm']]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 900, isMobile: w < 500, hasTouch: w < 500 });
  for (const route of [...routes, '/privacy-policy']) {
    await page.goto(base + route, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.addStyleTag({ content: freeze });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 25)); }
      scrollTo(0, 0);
      await Promise.all([...document.images].map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); }));
    });
    await page.evaluate(() => { const h = document.querySelector('header,.site-header,#header'); if (h) h.style.position = 'absolute'; document.querySelectorAll('.float-btn,.floating-buttons,[class*=float-]').forEach((e) => { e.style.display = 'none'; }); });
    const name = (route === '/' ? 'home' : route.slice(1)) + '.' + tag + '.png';
    await page.screenshot({ path: path.join(out, name), fullPage: true });
  }
  await page.close();
}
await browser.close();
console.log('done', out);
