import type { APIRoute } from 'astro';
import { z } from 'zod';
import cards from '../../generated/cards.json';

export const prerender = false;

const env = (name: string): string | undefined => process.env[name] ?? import.meta.env[name];
const MAX_FILE = 10 * 1024 * 1024;
const MAX_BODY = 11 * 1024 * 1024;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

const SERVICES: Record<string, string> = Object.fromEntries(cards.inquiry);

const text = (max: number) => z.string().trim().max(max);
const schema = z.object({
  formType: z.enum(['home', 'contact']),
  fullName: text(120).min(2),
  companyName: text(160).min(1),
  email: z.email().max(200),
  phone: text(40).regex(/^[+\d][\d\s()-]{5,}$/),
  service: z.enum(Object.keys(SERVICES) as [string, ...string[]]),
  location: text(160),
  message: text(5000).min(5),
});

// Extension plus file signature, so a renamed executable is rejected.
const SIGNATURES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  zip: [0x50, 0x4b, 0x03, 0x04],
  docx: [0x50, 0x4b, 0x03, 0x04],
  xlsx: [0x50, 0x4b, 0x03, 0x04],
  doc: [0xd0, 0xcf, 0x11, 0xe0],
  xls: [0xd0, 0xcf, 0x11, 0xe0],
};

// Reads the body with a hard cap, because a chunked upload has no Content-Length for the server to check.
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return new Blob();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return new Blob(chunks as BlobPart[]);
}

const json = (status: number, message: string, ok = false) =>
  new Response(JSON.stringify({ ok, message }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Drop addresses whose attempts have all expired, so the map cannot grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(ip);
}, WINDOW_MS).unref();

function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

async function verifyTurnstile(token: string, ip: string) {
  const secret = env('TURNSTILE_SECRET_KEY');
  if (!secret) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(10000),
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

async function readAttachment(file: File | null) {
  if (!file || file.size === 0) return { ok: true as const };
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const signature = SIGNATURES[ext];
  if (!signature) return { ok: false as const, message: 'Please attach a PDF, Word, Excel or ZIP file.' };
  if (file.size > MAX_FILE) return { ok: false as const, message: 'Attachments can be up to 10 MB.' };
  const content = Buffer.from(await file.arrayBuffer());
  // Word and Excel files are ZIPs that always hold [Content_Types].xml; a plain ZIP renamed to .docx does not.
  const officeOk = !['docx', 'xlsx'].includes(ext) || content.includes('[Content_Types].xml');
  if (!signature.every((byte, i) => content[i] === byte) || !officeOk) return { ok: false as const, message: 'That file does not look like a valid document.' };
  return { ok: true as const, name: file.name.replace(/[^\w.() -]+/g, '_').slice(-120), content: content.toString('base64') };
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = request.headers.get('x-client-ip') ?? clientAddress;
  if (limited(ip)) return json(429, 'Too many requests. Please try again later or contact us on WhatsApp.');

  const apiKey = env('BREVO_API_KEY');
  const from = env('MAIL_FROM');
  const to = env('MAIL_TO');
  if (!apiKey || !from || !to) {
    console.error('Inquiry form is missing BREVO_API_KEY, MAIL_FROM or MAIL_TO');
    return json(503, 'Our form is temporarily unavailable. Please contact us on WhatsApp or by email.');
  }

  let form: FormData;
  try {
    const body = await readBody(request);
    if (!body) return json(413, 'Attachments can be up to 10 MB.');
    form = await new Response(body, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData();
  } catch {
    return json(400, 'We could not read your form. Please try again.');
  }

  // Bots fill the hidden field. They get a normal reply and nothing is sent.
  if (String(form.get('website') ?? '') !== '') return json(200, 'Thank you. Your inquiry has been sent.', true);

  const parsed = schema.safeParse(Object.fromEntries(['formType', 'fullName', 'companyName', 'email', 'phone', 'service', 'location', 'message'].map((k) => [k, String(form.get(k) ?? '')])));
  if (!parsed.success) return json(422, 'Please check the highlighted details and try again.');

  const token = String(form.get('cf-turnstile-response') ?? '');
  if (!token || !(await verifyTurnstile(token, ip))) return json(403, 'Please complete the security check and try again.');

  const upload = form.get('boq');
  const attachment = await readAttachment(upload instanceof File ? upload : null);
  if (!attachment.ok) return json(422, attachment.message);

  const data = parsed.data;
  const service = SERVICES[data.service];
  const rows: Array<[string, string]> = [
    ['Name', data.fullName],
    ['Company', data.companyName],
    ['Email', data.email],
    ['Phone', data.phone],
    ['Service', service],
    ['Location', data.location || 'Not given'],
    ['Form', data.formType],
  ];

  try {
    const response = await fetch(env('BREVO_API_URL') ?? 'https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        sender: { name: 'AXIS ICON STRUCTURE Website', email: from },
        to: [{ email: to }],
        replyTo: { email: data.email, name: data.fullName },
        subject: `Website inquiry: ${service} from ${data.companyName}`.replace(/[\r\n]+/g, ' '),
        htmlContent: `${rows.map(([k, v]) => `<p><strong>${k}:</strong> ${escapeHtml(v)}</p>`).join('')}<hr><p style="white-space:pre-wrap">${escapeHtml(data.message)}</p>`,
        textContent: `${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${data.message}`,
        ...(attachment.content ? { attachment: [{ name: attachment.name, content: attachment.content }] } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Brevo responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
  } catch (error) {
    console.error('Inquiry email failed', error);
    return json(502, 'We could not send your inquiry. Please try again, or contact us on WhatsApp or by email.');
  }

  return json(200, 'Thank you! Your inquiry has been sent. Our team will contact you shortly.', true);
};
