// Real-browser checks of the production build: every page at every width, then widgets.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { routes } from './routes.mjs';

const base = 'http://localhost:4321';
const widths = [360, 414, 768, 1024, 1280, 1920];
const problems = [];
const fail = (...a) => { problems.push(a.join(' ')); };
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new' });
const page = await browser.newPage();
let current = '';
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) fail(current, 'console:', m.text().slice(0, 200)); });
page.on('pageerror', (e) => fail(current, 'js error:', e.message.slice(0, 200)));
page.on('requestfailed', (r) => { if (!r.url().includes('turnstile')) fail(current, 'request failed:', r.url()); });
page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(base)) fail(current, r.status(), r.url()); });

const all = [...routes, '/blog', '/privacy-policy'];
for (const width of widths) {
  await page.setViewport({ width, height: 800, isMobile: width < 700, hasTouch: width < 700 });
  for (const route of all) {
    current = `${route}@${width}`;
    await page.goto(base + route, { waitUntil: 'load' });
    const r = await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((f) => setTimeout(f, 15)); }
      window.scrollTo(0, 0);
      await Promise.all([...document.images].map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); }));
      const smallTaps = [...document.querySelectorAll('a,button')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.height < 24 || b.width < 24) && e.closest('main,header,footer'); }).length;
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        broken: [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.currentSrc || i.src),
        smallTaps,
      };
    });
    if (r.overflow > 0) fail(current, 'horizontal overflow', r.overflow);
    if (r.broken.length) fail(current, 'broken images', r.broken.join(' '));
    if (width === 360 && r.smallTaps) console.log('note small tap targets', route, r.smallTaps);
  }
  console.log('width done', width);
}

// mobile menu
current = 'mobile menu';
await page.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
await page.goto(`${base}/`, { waitUntil: 'load' });
await page.click('.mobile-menu-btn');
if (!await page.$eval('.mobile-nav', (n) => n.classList.contains('active') && getComputedStyle(n).display !== 'none')) fail('mobile menu did not open');
await page.click('.mobile-nav .dropdown > a');
if (!await page.$eval('.mobile-nav .dropdown', (n) => n.classList.contains('open'))) fail('mobile submenu did not open');
await page.click('.mobile-menu-btn');
if (await page.$eval('.mobile-nav', (n) => n.classList.contains('active'))) fail('mobile menu did not close');

// timeline road on narrow screens
await page.waitForSelector('#mobile-snake-svg path[d]', { timeout: 3000 }).catch(() => fail('timeline road missing'));

// header state and reveal
current = 'desktop';
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${base}/`, { waitUntil: 'load' });
await page.evaluate(() => window.scrollTo(0, 500));
await new Promise((r) => setTimeout(r, 300));
if (!await page.$eval('#header', (h) => h.classList.contains('scrolled'))) fail('header scrolled state');
if ((await page.$$('.fade-in-up.visible, .fade-in-left.visible, .fade-in-right.visible, .scale-in.visible')).length === 0) fail('scroll reveal did not run');

// faq
await page.$eval('.home-faq-question', (q) => q.scrollIntoView({ block: 'center' }));
// The list fades in on scroll, so wait until that finishes before clicking.
await new Promise((r) => setTimeout(r, 1500));
await page.click('.home-faq-question');
if (!await page.$eval('.home-faq-item', (i) => i.classList.contains('active'))) fail('faq did not open');
await page.focus('.home-faq-question');
await page.keyboard.press('Enter');
if (await page.$eval('.home-faq-item', (i) => i.classList.contains('active'))) fail('faq keyboard close');

// active menu state
for (const [route, label] of [['/', 'Home'], ['/team', 'About'], ['/civil-engineering', 'Services'], ['/fertilizer', 'Sectors'], ['/projects', 'Projects']]) {
  await page.goto(base + route, { waitUntil: 'domcontentloaded' });
  const active = await page.$eval('.desktop-nav .nav-link.active', (a) => a.textContent.trim()).catch(() => 'none');
  if (active !== label) fail('active nav', route, active);
}

// org chart
current = 'org chart';
await page.goto(`${base}/team`, { waitUntil: 'load' });
if ((await page.$$('.oc-zoom-btn')).length === 3) {
  const before = await page.$eval('.oc-stage-scaler', (s) => s.style.transform);
  await page.evaluate(() => document.querySelectorAll('.oc-zoom-btn')[0].click());
  const after = await page.$eval('.oc-stage-scaler', (s) => s.style.transform);
  if (before === after) fail('org chart zoom');
} else fail('org chart buttons missing');

// no-JS visitors must still see content
current = 'no js';
await page.setJavaScriptEnabled(false);
await page.goto(`${base}/about`, { waitUntil: 'load' });
const hidden = await page.evaluate(() => [...document.querySelectorAll('.fade-in-up,.fade-in-left,.fade-in-right,.scale-in')].filter((e) => getComputedStyle(e).opacity === '0').length);
if (hidden) fail('hidden without JS', hidden);
await page.setJavaScriptEnabled(true);

await browser.close();
console.log(problems.length ? `FAILED ${problems.length}\n${[...new Set(problems)].slice(0, 60).join('\n')}` : 'ALL PASSED');
fs.mkdirSync('tools/reports', { recursive: true });
fs.writeFileSync('tools/reports/browser.txt', problems.join('\n'), 'utf8');
