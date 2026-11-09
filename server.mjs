// Production server. Astro middleware does not run for pre-rendered files, so
// headers, redirects and the 404 status are handled here.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import compression from 'compression';
import express from 'express';
import { handler as astro } from './dist/server/entry.mjs';

const client = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist/client');
const production = process.env.NODE_ENV === 'production';
const apex = 'axisiconstructure.com';
const port = Number(process.env.PORT ?? 4321);
const MAX_BODY = 11 * 1024 * 1024;

const inlineFlag = "document.documentElement.classList.add('js')";
const flagHash = crypto.createHash('sha256').update(inlineFlag).digest('base64');
const csp = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${flagHash}' https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  'frame-src https://challenges.cloudflare.com',
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
].join('; ');

const app = express();
app.disable('x-powered-by');
// One proxy hop, so visitors cannot fake their address with X-Forwarded-For.
// Confirm the hop count on Hostinger when deploying.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use((req, res, next) => {
  const host = req.hostname;
  if (production && (host === `www.${apex}` || (host === apex && req.protocol !== 'https'))) {
    return res.redirect(301, `https://${apex}${req.originalUrl}`);
  }
  const url = new URL(req.originalUrl, 'http://local');
  let clean = url.pathname;
  if (clean === '/index' || clean === '/index.html') clean = '/';
  clean = clean.replace(/\.html$/, '');
  if (clean.length > 1) clean = clean.replace(/\/+$/, '');
  if (clean !== url.pathname && !clean.startsWith('/api')) return res.redirect(301, clean + url.search);
  next();
});

// Pages merged into broader ones; keep the old URLs working.
const moved = {
  '/piping-pipeline': '/mechanical-works#piping-pipeline',
  '/steel-fabrication': '/mechanical-works#steel-fabrication',
  '/industrial-insulation': '/mechanical-works#industrial-insulation',
  '/industrial-painting': '/mechanical-works#industrial-painting',
  '/ndt-inspection': '/mechanical-works#ndt-inspection',
  '/geotechnical-piling': '/civil-engineering#geotechnical-piling',
  '/water-treatment': '/civil-engineering#water-treatment',
  '/automation-control': '/electrical-instrumentation#automation-control',
  '/scaffolding-rigging': '/transport-rental#scaffolding-rigging',
  '/pre-commissioning': '/plant-shutdowns#pre-commissioning',
  '/decommissioning': '/plant-shutdowns#decommissioning',
  '/renewable-energy': '/solar-installation#renewable-energy',
  '/project-management': '/about#project-management',
  '/oil-refinery': '/oil-gas-petrochemical',
  '/petrochemical': '/oil-gas-petrochemical',
  '/fertilizer': '/fertilizer-industrial',
};
app.use((req, res, next) => (moved[req.path] ? res.redirect(301, moved[req.path]) : next()));

app.use(compression());

app.use('/api', (req, res, next) => {
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return res.status(413).json({ ok: false, message: 'Attachments can be up to 10 MB.' });
  // Client address from the proxy, for rate limiting. Never trust a value the visitor sent.
  req.headers['x-client-ip'] = req.ip;
  next();
});

// /blog has both a page and a folder, which static file serving will not resolve.
app.get('/blog', (req, res) => res.sendFile(path.join(client, 'blog.html'), { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } }));
app.use('/.well-known', express.static(path.join(client, '.well-known')));

app.use(express.static(client, {
  extensions: ['html'],
  redirect: false,
  setHeaders(res, file) {
    const name = file.replaceAll('\\', '/');
    if (name.includes('/_astro/')) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    else if (name.includes('/images/') || name.includes('/fonts/')) res.set('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
    else res.set('Cache-Control', 'public, max-age=0, must-revalidate');
  },
}));

app.use((req, res, next) => astro(req, res, next));

app.use((req, res) => {
  res.status(404).sendFile(path.join(client, '404.html'), { headers: { 'Cache-Control': 'no-cache' } });
});

app.listen(port, (error) => {
  if (error) throw error;
  console.log(`Server on http://localhost:${port}`);
});
