// Renders every route of the old site and saves its final DOM for migration.
// React hover handlers are not in the DOM, so they are read from React props and
// stored as data-hover ids that the generator turns into plain CSS.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { routes } from './routes.mjs';

const out = path.resolve('tools/extracted');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const hoverRules = {};

for (const route of routes) {
  await page.goto(`http://localhost:4173${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 500));
  const data = await page.evaluate(() => {
    const hovers = {};
    const other = new Set();
    for (const el of document.querySelectorAll('#root *')) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
      const p = key && el[key];
      const fn = p && (p.onMouseOver || p.onMouseEnter);
      if (!fn) continue;
      const src = String(fn);
      const decl = [...src.matchAll(/currentTarget\.style\.(\w+)\s*=\s*("[^"]*"|'[^']*'|`[^`]*`)/g)].map((m) => [m[1], m[2].slice(1, -1)]);
      if (!decl.length || /querySelector|children|firstChild/.test(src)) other.add(src.slice(0, 200));
      const id = JSON.stringify(decl);
      el.setAttribute('data-hover', id);
      hovers[id] = decl;
    }
    return {
      title: document.title,
      root: document.getElementById('root').innerHTML,
      hovers,
      other: [...other],
    };
  });
  Object.assign(hoverRules, data.hovers);
  const name = route === '/' ? 'home' : route.slice(1);
  await fs.writeFile(path.join(out, `${name}.json`), JSON.stringify({ route, title: data.title, root: data.root }), 'utf8');
  if (data.other.length) console.log('UNPARSED HOVER', name, data.other);
}
await fs.writeFile(path.join(out, '_hovers.json'), JSON.stringify(hoverRules, null, 1), 'utf8');
console.log('routes', routes.length, 'hover rules', Object.keys(hoverRules).length);
await browser.close();
