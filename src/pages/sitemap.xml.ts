import type { APIRoute } from 'astro';
import pages from '../generated/pages.json';
import { getPosts } from '../lib/content';

const site = 'https://axisiconstructure.com';

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const categories = [...new Set(posts.map((p) => p.categorySlug))];
  const urls = [
    ...Object.values(pages).map((p) => ({ loc: p.route === '/' ? `${site}/` : `${site}${p.route}` })),
    ...(posts.length ? [{ loc: `${site}/blog` }] : []),
    { loc: `${site}/privacy-policy` },
    ...categories.map((c) => ({ loc: `${site}/blog/category/${c}` })),
    ...posts.map((p) => ({ loc: `${site}/blog/${p.slug}`, lastmod: (p.updatedAt ?? p.publishedAt).slice(0, 10) })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((u) => `<url><loc>${u.loc}</loc>${'lastmod' in u && u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
    .join('')}</urlset>`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
