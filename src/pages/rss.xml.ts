import type { APIRoute } from 'astro';
import { getPosts } from '../lib/content';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const site = 'https://axisiconstructure.com';

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const items = posts.map((p) => `<item><title>${esc(p.title)}</title><link>${site}/blog/${p.slug}</link><guid>${site}/blog/${p.slug}</guid><pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`).join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>AXIS ICON STRUCTURE Blog</title><link>${site}/blog</link><description>Engineering and construction articles</description>${items}</channel></rss>`;
  return new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
};
