// Checks the production build over HTTP, the way a crawler sees it (no JavaScript).
import fs from 'node:fs';
import * as cheerio from 'cheerio';
import { routes } from './routes.mjs';

const base = process.argv[2] ?? 'http://localhost:4321';
const problems = [];
const fail = (...a) => problems.push(a.join(' '));
const get = (p, opts) => fetch(base + p, { redirect: 'manual', ...opts });
const expect2 = async (p, status) => { const r = await get(p); if (r.status !== status) fail(p, 'want', status, 'got', r.status); };

// sitemap
const smRes = await get('/sitemap.xml');
const sm = await smRes.text();
if (!/xml/.test(smRes.headers.get('content-type') ?? '') || !sm.includes('<urlset')) fail('sitemap is not XML');
const smUrls = [...sm.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].replace('https://axisiconstructure.com', '') || '/');
for (const r of routes) if (!smUrls.includes(r)) fail('sitemap missing', r);

// every page without JavaScript
const pages = [...new Set([...routes, ...smUrls])];
const titles = new Map(), descs = new Map();
const assets = new Set(), links = new Set();
let minWords = Infinity;
for (const p of pages) {
  const res = await get(p);
  if (res.status !== 200) { fail(p, 'status', res.status); continue; }
  const html = await res.text();
  const $ = cheerio.load(html);
  const title = $('title').text(), desc = $('meta[name=description]').attr('content') ?? '';
  const canon = $('link[rel=canonical]').attr('href');
  const want = `https://axisiconstructure.com${p === '/' ? '/' : p}`;
  if (title.length < 30 || title.length > 65) fail(p, 'title length', title.length, title);
  if (desc.length < 110 || desc.length > 165) fail(p, 'description length', desc.length);
  if (canon !== want) fail(p, 'canonical', canon);
  if ($('h1').length !== 1) fail(p, 'h1 count', $('h1').length);
  if ($('main').length !== 1) fail(p, 'main count', $('main').length);
  if (titles.has(title)) fail(p, 'duplicate title with', titles.get(title)); titles.set(title, p);
  if (descs.has(desc)) fail(p, 'duplicate description with', descs.get(desc)); descs.set(desc, p);
  for (const s of $('script[type="application/ld+json"]').toArray()) { try { JSON.parse($(s).html()); } catch { fail(p, 'bad JSON-LD'); } }
  $('img').each((_, e) => { const a = $(e).attr('alt'); if (a === undefined) fail(p, 'img no alt', $(e).attr('src')); });
  const clone = cheerio.load($('main').html() ?? ''); clone('script,style').remove();
  const words = clone.root().text().split(/\s+/).filter(Boolean).length;
  if (!p.startsWith('/blog') && p !== '/privacy-policy') minWords = Math.min(minWords, words);
  $('a[href]').each((_, e) => { const h = $(e).attr('href'); if (h === '#') { if (!$(e).closest('.mobile-nav').length) fail(p, 'dead # link', $(e).text().trim().slice(0, 40)); } else if (h.startsWith('/')) links.add(h.split('#')[0]); });
  $('img[src],link[rel=stylesheet],link[rel=preload],script[src]').each((_, e) => { const u = $(e).attr('src') ?? $(e).attr('href'); if (u?.startsWith('/')) assets.add(u); });
  $('img[srcset]').each((_, e) => $(e).attr('srcset').split(',').forEach((s) => assets.add(s.trim().split(/\s+/)[0])));
  for (const m of html.matchAll(/url\((?:&quot;|["'])?(\/[^"')&]+)/g)) assets.add(m[1]);
  if (/images\.unsplash\.com|fonts\.googleapis|unpkg\.com/.test(html)) fail(p, 'external asset still referenced');
}

for (const l of links) { const r = await get(l); if (r.status !== 200) fail('broken link', l, r.status); }
for (const a of assets) {
  const r = await get(a);
  if (r.status !== 200) fail('broken asset', a, r.status);
  if (a.endsWith('.css')) for (const m of (await r.text()).matchAll(/url\(["']?(\/[^"')]+)/g)) { const u = await get(m[1]); if (u.status !== 200) fail('broken css asset', m[1], u.status); }
}

// no unpublished blog content in a production build
const blog = await (await get('/blog')).text();
if (!/noindex/.test(blog)) fail('/blog should be noindex while empty');
if ((await (await get('/about')).text()).includes('href="/blog"')) fail('blog link shown with no posts');
if (sm.includes('/blog')) fail('blog in sitemap with no posts');
await expect2('/blog/example-post', 404);

// status and redirects
const expect = async (p, status, loc) => {
  const r = await get(p);
  if (r.status !== status) fail(p, 'want', status, 'got', r.status);
  if (loc && r.headers.get('location') !== loc) fail(p, 'location', r.headers.get('location'));
};
await expect('/nonexistent-page-xyz', 404);
await expect('/about.html', 301, '/about');
await expect('/about/', 301, '/about');
await expect('/index.html', 301, '/');
await expect('/civil-engineering.html?x=1', 301, '/civil-engineering?x=1');
await expect('/robots.txt', 200);
await expect('/llms.txt', 200);
await expect('/rss.xml', 200);
await expect('/.well-known/security.txt', 200);
await expect('/api/contact', 404);
await expect('/nginx.conf', 404);
await expect('/web.config', 404);
await expect('/.env', 404);

// headers
const home = await get('/');
for (const h of ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy']) if (!home.headers.get(h)) fail('missing header', h);
if (home.headers.get('x-powered-by')) fail('x-powered-by exposed');
if (!/must-revalidate/.test(home.headers.get('cache-control') ?? '')) fail('html cache', home.headers.get('cache-control'));
const js = [...assets].find((a) => a.startsWith('/_astro/') && a.endsWith('.js'));
const jsRes = await get(js, { headers: { 'accept-encoding': 'gzip' } });
if (!/immutable/.test(jsRes.headers.get('cache-control') ?? '')) fail('asset cache', jsRes.headers.get('cache-control'));
const htmlRes = await get('/', { headers: { 'accept-encoding': 'gzip' } });
if (!htmlRes.headers.get('content-encoding')) fail('html not compressed');

console.log(`pages ${pages.length}, internal links ${links.size}, assets ${assets.size}, fewest words on a page ${minWords}`);
console.log(problems.length ? `FAILED ${problems.length}\n${problems.join('\n')}` : 'ALL PASSED');
fs.mkdirSync('tools/reports', { recursive: true });
fs.writeFileSync('tools/reports/verify.txt', problems.join('\n'), 'utf8');
process.exit(problems.length ? 1 : 0);
