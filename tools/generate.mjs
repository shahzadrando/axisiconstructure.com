// Converts the extracted old pages into static page fragments, optimized images,
// pruned CSS and a subset icon font. Safe to re-run: output is fully regenerated.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { PurgeCSS } from 'purgecss';
import subsetFont from 'subset-font';
import { routes } from './routes.mjs';
import { meta, pageKinds } from './page-meta.mjs';

const GEN = 'src/generated';
const PUB_IMG = 'public/images';
await fs.rm(GEN, { recursive: true, force: true });
await fs.mkdir(path.join(GEN, 'pages'), { recursive: true });
await fs.mkdir(PUB_IMG, { recursive: true });
const warn = (...a) => console.log('WARN', ...a);

// ---------- images ----------
const CAPS = { 'axis-logo': 400, 'axis-stamp-clean': 500, 'axis-stamp': 500, axis_logo: 400 };
const slug = (s) => s.toLowerCase().replace(/&/g, '-and-').replace(/[^a-z0-9./_-]+/g, '-').replace(/-+/g, '-').replace(/-\./g, '.');
const imageCache = new Map();
const usedLegacy = new Set();
let imgIn = 0, imgOut = 0;

async function writeVariants(input, rel, cap) {
  const outPath = path.join(PUB_IMG, rel);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const base = sharp(input).rotate();
  const m = await base.metadata();
  const width = Math.min(m.width, cap);
  const height = Math.round(m.height * (width / m.width));
  const main = await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 74, effort: 5 }).toBuffer();
  await fs.writeFile(outPath, main);
  imgOut += main.length;
  const info = { src: `/images/${rel}`, width, height };
  if (width > 700) {
    const smallRel = rel.replace(/\.webp$/, '-640.webp');
    const small = await sharp(input).rotate().resize({ width: 640 }).webp({ quality: 56, effort: 6 }).toBuffer();
    await fs.writeFile(path.join(PUB_IMG, smallRel), small);
    imgOut += small.length;
    info.srcset = `/images/${smallRel} 640w, /images/${rel} ${width}w`;
    if (width > 1100) {
      const midRel = rel.replace(/\.webp$/, '-960.webp');
      const mid = await sharp(input).rotate().resize({ width: 960 }).webp({ quality: 56, effort: 6 }).toBuffer();
      await fs.writeFile(path.join(PUB_IMG, midRel), mid);
      imgOut += mid.length;
      info.srcset = `/images/${smallRel} 640w, /images/${midRel} 960w, /images/${rel} ${width}w`;
    }
  }
  return info;
}

async function image(raw) {
  const url = raw.trim().replace(/&amp;/g, '&');
  if (imageCache.has(url)) return imageCache.get(url);
  const job = (async () => {
    if (/^https:\/\/images\.unsplash\.com\//.test(url)) {
      const id = url.match(/photo-[\w-]+/)[0];
      const rel = `stock/${id}.webp`;
      const res = await fetch(`https://images.unsplash.com/${id}?q=80&w=1600&auto=format&fit=crop&fm=webp`);
      if (!res.ok) { warn('stock image failed', url, res.status); return { src: url }; }
      const buf = Buffer.from(await res.arrayBuffer());
      imgIn += buf.length;
      return writeVariants(buf, rel, 1600);
    }
    const clean = decodeURIComponent(url.split('?')[0]).replace(/^\.?\//, '');
    if (!clean.startsWith('images/')) { warn('unhandled image', url); return { src: url }; }
    const file = path.join('legacy', clean);
    if (!fss.existsSync(file)) { warn('missing image', url); return { src: `/${clean}` }; }
    usedLegacy.add(clean);
    imgIn += fss.statSync(file).size;
    const inner = clean.slice('images/'.length);
    if (inner.endsWith('.svg')) {
      const rel = slug(inner);
      await fs.mkdir(path.dirname(path.join(PUB_IMG, rel)), { recursive: true });
      await fs.copyFile(file, path.join(PUB_IMG, rel));
      return { src: `/images/${rel}` };
    }
    const rel = slug(inner).replace(/\.(png|jpe?g|webp)$/, '.webp');
    return writeVariants(file, rel, CAPS[path.basename(rel, '.webp')] ?? 1600);
  })();
  imageCache.set(url, job);
  return job;
}

const URL_RE = /url\(\s*(?:&quot;|["'])?([^"')&]+?(?:&(?!quot;)[^"')&]*)*)(?:&quot;|["'])?\s*\)/g;
async function rewriteCssUrls(css) {
  let out = css;
  for (const m of [...css.matchAll(URL_RE)]) {
    if (/^data:|^#|woff2?|\.ttf/.test(m[1])) continue;
    if (!/images\//.test(m[1])) continue;
    const info = await image(m[1]);
    out = out.split(m[0]).join(`url("${info.src}")`);
  }
  return out;
}

// ---------- pages ----------
const fragment = (html) => cheerio.load(html, null, false);
const load = async (name) => JSON.parse(await fs.readFile(`tools/extracted/${name}.json`, 'utf8'));
const hovers = Object.keys(JSON.parse(await fs.readFile('tools/extracted/_hovers.json', 'utf8')));
const hoverId = (raw) => `h${hovers.indexOf(raw) + 1}`;

function normalizeLink(href) {
  if (!href || /^(https?:|mailto:|tel:|#|javascript:)/.test(href)) return href;
  let h = href.replace(/^\.\//, '').replace(/\.html(?=$|[?#])/, '');
  if (h === 'index' || h === '/index') return '/';
  return h.startsWith('/') ? h : `/${h}`;
}

const pageCssAll = [];
const pagesOut = {};
const faqSelectors = [['.home-faq-item', '.home-faq-question', '.home-faq-answer'], ['.faq-item', '.faq-question', '.faq-answer']];

async function processImages($, root) {
  let firstBanner = true;
  for (const el of root.find('[style*="background-image"]').addBack('[style*="background-image"]').toArray()) {
    const node = $(el);
    const style = node.attr('style');
    const m = style.match(/background-image:\s*url\(["']?(.+?)["']?\)/);
    if (!m) continue;
    const info = await image(m[1]);
    if (node.hasClass('page-banner') && firstBanner) {
      firstBanner = false;
      const pos = style.match(/background-position:\s*([^;]+)/);
      const rest = style.replace(/background-(image|position|size|repeat):[^;]*;?/g, '').trim();
      if (rest) node.attr('style', rest); else node.removeAttr('style');
      const img = $('<img class="banner-img" alt="" fetchpriority="high" decoding="async">');
      img.attr('src', info.src);
      if (info.srcset) img.attr('srcset', info.srcset).attr('sizes', '100vw');
      if (info.width) img.attr('width', info.width).attr('height', info.height);
      if (pos) img.attr('style', `object-position:${pos[1].trim()}`);
      node.prepend(img);
    } else {
      node.attr('style', style.replace(m[0], `background-image:url("${info.src}")`));
    }
  }
  for (const el of root.find('img').toArray()) {
    const node = $(el);
    const src = node.attr('src');
    if (!src || node.hasClass('banner-img')) continue;
    if (src.startsWith('data:')) continue;
    const info = await image(src);
    node.attr('src', info.src);
    node.removeAttr('srcset');
    if (info.srcset) node.attr('srcset', info.srcset).attr('sizes', node.attr('sizes') ?? '(max-width: 700px) 100vw, 50vw');
    if (info.width && !node.attr('width')) node.attr('width', info.width).attr('height', info.height);
    const eager = node.attr('loading') === 'eager' || node.attr('fetchpriority') === 'high';
    if (!eager) node.attr('loading', 'lazy');
    node.attr('decoding', 'async');
    if (node.attr('alt') === undefined) node.attr('alt', '');
  }
}

// The old /sectors "Learn more" links pointed at "#". Each now goes to its closest page.
const SECTOR_LINKS = {
  'Industrial Facilities': '/oil-refinery', 'Commercial Buildings': '/civil-engineering', 'Residential Construction': '/civil-engineering',
  'Roads & Infrastructure': '/civil-engineering', 'Healthcare Facilities': '/hvac-maintenance', 'Educational Institutions': '/civil-engineering',
  'Energy & Power': '/renewable-energy', 'Utilities & Pipelines': '/piping-pipeline', 'General Contracting': '/services',
};

function fixCommon($, root) {
  root.find('a[href="#"]').each((_, el) => {
    const n = $(el);
    const heading = n.closest('div,article,section').find('h2,h3,h4').first().text().replace(/\s+/g, ' ').trim();
    const key = Object.keys(SECTOR_LINKS).find((k) => k.toLowerCase().slice(0, 12) === heading.toLowerCase().slice(0, 12));
    if (key) n.attr('href', SECTOR_LINKS[key]); else warn('dead link', heading);
  });
  root.find('[data-hover]').each((_, el) => { const n = $(el); n.attr('data-hover', hoverId(n.attr('data-hover'))); });
  root.find('a[href]').each((_, el) => { const n = $(el); n.attr('href', normalizeLink(n.attr('href'))); });
  root.find('a[target="_blank"]').each((_, el) => { const n = $(el); n.attr('rel', 'noopener noreferrer'); });
  root.find('.counter-num').each((_, el) => { const n = $(el); const t = Number(n.attr('data-target')); n.text(t.toLocaleString('en-US') + (n.attr('data-suffix') ?? '')); });
  root.find('a').each((_, el) => {
    const n = $(el);
    const text = n.text().replace(/\s+/g, ' ').trim();
    if (!/^(learn more|read more|view details|explore|view more|details)\b/i.test(text)) return;
    const heading = n.closest('div,article,section').find('h2,h3,h4').first().text().replace(/\s+/g, ' ').trim();
    if (heading) n.append(`<span class="sr-only"> about ${heading.replace(/[<>]/g, '')}</span>`);
  });
  for (const [item, q] of faqSelectors) {
    root.find(item).each((i, el) => {
      const n = $(el);
      n.find(q).attr('role', 'button').attr('tabindex', '0').attr('aria-expanded', n.hasClass('active') ? 'true' : 'false');
    });
  }
}

const faqJson = ($, root) => {
  for (const [item, q, a] of faqSelectors) {
    const list = root.find(item).toArray().map((el) => ({
      '@type': 'Question',
      name: $(el).find(q).text().trim(),
      acceptedAnswer: { '@type': 'Answer', text: $(el).find(a).text().trim() },
    }));
    if (list.length) return list;
  }
  return [];
};

function wireForm($, root, kind) {
  const form = root.find('#contactForm');
  if (!form.length) return;
  form.attr('action', '/api/contact').attr('method', 'post').attr('enctype', 'multipart/form-data').attr('data-form', kind);
  form.find('select[name="service"] option[value=""]').attr('selected', 'selected');
  form.prepend(`<input type="hidden" name="formType" value="${kind}">`);
  form.prepend('<div class="hp-field" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>');
  const btn = form.find('button[type="submit"]');
  btn.attr('disabled', 'disabled');
  btn.before('<div class="cf-turnstile-slot" data-sitekey="__TURNSTILE_SITE_KEY__"></div>');
  btn.after('<p class="form-status" role="status" aria-live="polite" hidden></p><noscript><p class="form-status">This form needs JavaScript. Please email info@axisiconstructure.com or message us on WhatsApp.</p></noscript>');
  form.find('#file-name-display').attr('aria-live', 'polite');
  form.find('.upload-meta').text('PDF, Word, Excel, or ZIP (Max 10MB)');
}

// Defects already on the old site: Unsplash photos that now 404 and icon names
// that do not exist in Phosphor, so they rendered blank.
const ICON_SWAPS = { 'ph-trowel': 'ph-hammer', 'ph-transformer': 'ph-lightning', 'ph-arrows-down': 'ph-arrow-down', 'ph-git-network': 'ph-tree-structure', 'ph-concrete-mixer': 'ph-wrench', 'ph-check-circle-fill': 'ph-check-circle' };
const PHOTO_SWAPS = {
  'geotechnical-piling': [['1517089535811-5842c9ab1562', 'images/service_geotechnical.webp']],
  'scaffolding-rigging': [['1517089535811-5842c9ab1562', 'images/scaffolding.webp']],
  'industrial-insulation': [['1508150148186-aaee953f5b43', 'images/service_industrial_insulation.webp']],
  'ndt-inspection': [['1581091215367-5fe23d6a7c6e', 'images/service_ndt_inspection.webp']],
  'steel-fabrication': [['1534224039826-c7a0dea0e66a', 'images/service_steel_fabrication.webp']],
};
function repairContent(name, html) {
  let out = html;
  for (const [from, to] of Object.entries(ICON_SWAPS)) out = out.replaceAll(from, to);
  for (const [id, local] of PHOTO_SWAPS[name] ?? []) {
    out = out.replace(new RegExp(`https://images\\.unsplash\\.com/photo-${id}[^"'&]*(?:&amp;[^"'&]*|&(?!quot;)[^"'&;]*)*`, 'g'), local);
  }
  if (name === 'careers') {
    out = out.replace(/<p class="hero-desc"><strong>(.*?)<\/strong><\/p>/, '<h1 class="hero-desc" style="font:inherit;font-weight:700;text-shadow:none;letter-spacing:normal;margin:0 0 1rem">$1</h1>');
  }
  return out;
}

// Keeps visual tags (and their CSS) but gives assistive tech a valid heading order.
function fixHeadingOrder($, nodes, startLevel) {
  let prev = startLevel;
  nodes.each((_, el) => {
    const n = $(el);
    const level = Number(el.tagName.slice(1));
    if (level > prev + 1) { n.attr('role', 'heading').attr('aria-level', prev + 1); prev += 1; } else prev = level;
  });
}

let chromeDone = false;
const chromeCss = [];

for (const route of routes) {
  const name = route === '/' ? 'home' : route.slice(1);
  const data = await load(name);
  data.root = repairContent(name, data.root);
  const $ = fragment(data.root);

  if (!chromeDone) {
    chromeDone = true;
    const header = $('#header').clone();
    header.find('style').each((_, s) => { chromeCss.push($(s).html()); $(s).remove(); });
    const h$ = fragment($.html(header));
    const hr = h$('#header');
    hr.attr('class', '');
    hr.find('a').each((_, a) => {
      const n = h$(a);
      n.removeClass('active active-sub');
      if (n.attr('class') === '') n.removeAttr('class');
      const href = n.attr('href');
      n.attr('href', normalizeLink(href));
      if (n.closest('.dropdown-menu').length) return;
      const label = n.text().trim().toLowerCase().split(' ')[0];
      if (['home', 'about', 'services', 'sectors', 'projects', 'safety', 'careers', 'contact'].includes(label)) n.attr('data-group', label);
    });
    hr.find('a[target="_blank"]').attr('rel', 'noopener noreferrer');
    hr.find('.brand-logo').removeAttr('fetchpriority');
    const logo = await image(hr.find('.brand-logo').attr('src'));
    hr.find('.brand-logo').attr('src', logo.src).attr('width', logo.width).attr('height', logo.height);
    hr.find('.mobile-menu-btn').attr('aria-expanded', 'false').attr('aria-controls', 'mobile-nav');
    hr.find('.mobile-nav').attr('id', 'mobile-nav').attr('class', 'mobile-nav').attr('aria-label', 'Mobile');
    hr.find('.desktop-nav').attr('aria-label', 'Main');
    hr.find('.mobile-nav > ul > li.dropdown').attr('class', 'dropdown');
    hr.find('.mobile-nav > ul > li.dropdown > a').attr('aria-expanded', 'false').attr('role', 'button');
    // New blog link, placed after Projects in both menus.
    hr.find('.desktop-nav a[data-group="projects"]').parent().after('<li><a href="/blog" class="nav-link" data-group="blog">Blog</a></li>');
    hr.find('.mobile-nav a[data-group="projects"]').parent().after('<li><a href="/blog" data-group="blog">Blog</a></li>');
    await fs.writeFile(path.join(GEN, 'header.html'), h$.html(), 'utf8');

    const foot = $('#footer').clone();
    const f$ = fragment($.html(foot) + $.html($('.floating-actions')));
    f$('style').each((_, s) => { chromeCss.push(f$(s).html()); f$(s).remove(); });
    fixCommon(f$, f$.root());
    await processImages(f$, f$.root());
    const safetyLink = f$('a[href="/safety"]').first().parent();
    if (safetyLink.length) {
      const blog = safetyLink.clone(); blog.find('a').attr('href', '/blog').contents().last().replaceWith('Blog');
      const careers = safetyLink.clone(); careers.find('a').attr('href', '/careers').contents().last().replaceWith('Careers');
      const priv = safetyLink.clone(); priv.find('a').attr('href', '/privacy-policy').contents().last().replaceWith('Privacy Policy');
      safetyLink.after(priv).after(careers).after(blog);
    } else warn('footer safety link not found');
    fixHeadingOrder(f$, f$('h1,h2,h3,h4,h5,h6'), 2);
    await fs.writeFile(path.join(GEN, 'footer.html'), f$.html(), 'utf8');
  }

  const between = [];
  for (let n = $('#header').next(); n.length && n.attr('id') !== 'footer'; n = n.next()) between.push(n);
  const main$ = fragment(`<main id="main">${between.map((n) => $.html(n)).join('')}</main>`);
  const root = main$('#main');
  root.find('[style]').each((_, el) => {
    const n = main$(el);
    if (/^opacity: 1; transform: none;?$/.test(n.attr('style').trim())) n.removeAttr('style');
  });
  root.find('#mobile-snake-svg').remove();

  const css = [];
  root.find('style').each((_, s) => { css.push(main$(s).html()); main$(s).remove(); });

  // First screen must not wait for scroll animations.
  const firstSection = root.find('.page-banner, section').first();
  firstSection.find('.fade-in-up,.fade-in-left,.fade-in-right,.scale-in').addBack('.fade-in-up,.fade-in-left,.fade-in-right,.scale-in')
    .removeClass('fade-in-up fade-in-left fade-in-right scale-in');

  root.find('.fade-in-up,.fade-in-left,.fade-in-right,.scale-in').removeClass('visible');
  root.find('.visible').removeClass('visible');
  fixHeadingOrder(main$, root.find('h1,h2,h3,h4,h5,h6'), 1);
  fixCommon(main$, root);
  await processImages(main$, root);
  if (name === 'home' || name === 'contact') wireForm(main$, root, name);

  const h1 = root.find('h1');
  if (h1.length !== 1) warn(name, 'h1 count', h1.length);
  const pageCss = (await rewriteCssUrls(css.join('\n')))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};:,>])\s*/g, '$1').trim();
  pageCssAll.push(pageCss);

  const hero = root.find('.banner-img').first().attr('src') ?? root.find('img').first().attr('src') ?? null;
  pagesOut[name] = {
    route,
    title: meta[name].title,
    description: meta[name].description,
    h1: h1.first().text().replace(/\s+/g, ' ').trim(),
    image: hero,
    lcpImage: root.find('.banner-img, img[fetchpriority="high"]').first().attr('src') ?? null,
    lcpSrcset: root.find('.banner-img, img[fetchpriority="high"]').first().attr('srcset') ?? null,
    lcpSizes: root.find('.banner-img, img[fetchpriority="high"]').first().attr('sizes') ?? null,
    kind: name === 'home' ? 'home' : pageKinds.company.includes(name) ? 'company' : 'service',
    faq: faqJson(main$, root),
  };
  await fs.writeFile(path.join(GEN, 'pages', `${name}.html`), main$.html(), 'utf8');
  await fs.writeFile(path.join(GEN, 'pages', `${name}.css`), pageCss, 'utf8');
  console.log('page', name);
}
await fs.writeFile(path.join(GEN, 'pages.json'), JSON.stringify(pagesOut, null, 1), 'utf8');

// ---------- css ----------
let css = await fs.readFile(fss.readdirSync('legacy/assets').filter((f) => f.endsWith('.css')).map((f) => `legacy/assets/${f}`)[0], 'utf8');
css = await rewriteCssUrls(css);
const chrome = await rewriteCssUrls(chromeCss.join('\n'));
const hoverCss = Object.entries(JSON.parse(await fs.readFile('tools/extracted/_hovers.json', 'utf8'))).map(([raw, decl]) => {
  const body = decl.map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}!important`).join(';');
  return `[data-hover="${hoverId(raw)}"]{transition:transform .3s ease,box-shadow .3s ease,border-color .3s ease}\n[data-hover="${hoverId(raw)}"]:hover{${body}}`;
}).join('\n');
const extra = await fs.readFile('tools/site-overrides.css', 'utf8');

const htmlFiles = [...routes.map((r) => path.join(GEN, 'pages', `${r === '/' ? 'home' : r.slice(1)}.html`)), path.join(GEN, 'header.html'), path.join(GEN, 'footer.html')];
const [purged] = await new PurgeCSS().purge({
  content: [...htmlFiles, 'src/scripts/**/*.ts', 'src/pages/**/*.astro', 'src/layouts/**/*.astro'],
  css: [{ raw: css + '\n' + chrome }],
  safelist: { standard: ['js', 'scrolled', 'active', 'open', 'visible', 'active-gold-global', 'active-gold-badge-global'], greedy: [/^ph$/, /^nav-/] },
  keyframes: true,
});
const final = purged.css + '\n' + hoverCss + '\n' + extra;
await fs.writeFile(path.join(GEN, 'site.css'), final, 'utf8');
console.log('css KB', Math.round(css.length / 1024), '->', Math.round(final.length / 1024));

// ---------- icons ----------
const phDir = 'node_modules/@phosphor-icons/web/src/regular';
const phCss = await fs.readFile(path.join(phDir, 'style.css'), 'utf8');
const allHtml = (await Promise.all(htmlFiles.map((f) => fs.readFile(f, 'utf8')))).join('\n');
const used = new Set([...allHtml.matchAll(/\bph-[a-z0-9-]+/g)].map((m) => m[0]).concat(['ph-list', 'ph-x', 'ph-file-text', 'ph-check-circle', 'ph-warning-circle', 'ph-arrow-right', 'ph-calendar-blank']));
const icons = [];
for (const m of phCss.matchAll(/\.ph\.(ph-[a-z0-9-]+):before\s*\{\s*content:\s*"\\([0-9a-f]+)"/g)) if (used.has(m[1])) icons.push([m[1], m[2]]);
const missing = [...used].filter((u) => u !== 'ph-spin' && !icons.some(([n]) => n === u));
if (missing.length) warn('icons not found', missing);
const ttf = await fs.readFile(path.join(phDir, 'Phosphor.ttf'));
const woff2 = await subsetFont(ttf, icons.map(([, c]) => String.fromCodePoint(parseInt(c, 16))).join(''), { targetFormat: 'woff2' });
await fs.mkdir('public/fonts', { recursive: true });
await fs.writeFile('public/fonts/phosphor-subset.woff2', woff2);
const iconCss = `@font-face{font-family:Phosphor;src:url(/fonts/phosphor-subset.woff2) format("woff2");font-display:block}
.ph{font-family:Phosphor!important;font-style:normal;font-weight:400;line-height:1;text-transform:none;-webkit-font-smoothing:antialiased}
${icons.map(([n, c]) => `.ph.${n}:before{content:"\\${c}"}`).join('')}`;
await fs.writeFile(path.join(GEN, 'icons.css'), iconCss, 'utf8');
console.log('icons', icons.length, 'font KB', Math.round(woff2.length / 1024));

// ---------- static files ----------
for (const f of ['favicon.svg']) await fs.copyFile(path.join('legacy', f), path.join('public', f));
await fs.cp('legacy/email-assets', 'public/email-assets', { recursive: true });
const walk = (d) => fss.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const allLegacy = walk('legacy/images').map((f) => f.replaceAll('\\', '/').replace(/^legacy\//, ''));
const unused = allLegacy.filter((f) => !usedLegacy.has(f));
await fs.writeFile('tools/reports-unused-images.txt', unused.join('\n'), 'utf8');
const legacyJs = fss.readFileSync('legacy/assets/index-Bfaho1ET.js', 'utf8');
console.log('legacy images used', usedLegacy.size, 'of', allLegacy.length, 'unused', unused.length);
console.log('image KB in', Math.round(imgIn / 1024), 'out', Math.round(imgOut / 1024));
console.log('org_chart linked:', legacyJs.includes('org_chart') || allHtml.includes('org_chart'), 'icons.svg linked:', legacyJs.includes('icons.svg') || allHtml.includes('icons.svg'));
