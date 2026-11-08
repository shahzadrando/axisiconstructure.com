// End-to-end form tests. Email goes to the local sink, nothing leaves this machine.
// The rate limit allows 5 requests per 10 minutes, so run with MODE=abuse and
// MODE=browser against separate server restarts.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = 'http://localhost:4321';
const mode = process.argv[2] ?? 'browser';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, detail); };
const valid = { formType: 'contact', fullName: 'Test Person', companyName: 'Test Co', email: 'test@example.com', phone: '+966 50 123 4567', service: 'civil', location: 'Khobar', message: 'Automated local test message.' };
const post = async (fields, file) => {
  const body = new FormData();
  Object.entries(fields).forEach(([k, v]) => body.set(k, v));
  if (file) body.set('boq', new File([file.bytes], file.name));
  const r = await fetch(`${base}/api/contact`, { method: 'POST', body, headers: { origin: base } });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const token = { 'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX' };
const mails = () => (fs.existsSync('.data/mail') ? fs.readdirSync('.data/mail').length : 0);

if (mode === 'abuse-a') {
  const before = mails();
  let r = await post({ ...valid, ...token, website: 'http://spam.example' });
  check('honeypot pretends success', r.status === 200 && r.json.ok);
  check('honeypot sends no email', mails() === before);
  r = await post({ ...valid, email: 'not-an-email', ...token });
  check('bad email rejected', r.status === 422, r.status);
  r = await post({ ...valid, message: '', ...token });
  check('empty message rejected', r.status === 422, r.status);
  r = await post(valid);
  check('missing security token rejected', r.status === 403, r.status);
  r = await post({ ...valid, ...token }, { name: 'virus.exe', bytes: new Uint8Array([77, 90, 0, 0]) });
  check('exe rejected', r.status === 422, r.json.message);
}
if (mode === 'abuse-b') {
  let r = await post({ ...valid, ...token }, { name: 'fake.pdf', bytes: new Uint8Array([77, 90, 0, 0]) });
  check('renamed exe rejected', r.status === 422, r.json.message);
  r = await post({ ...valid, ...token }, { name: 'big.pdf', bytes: new Uint8Array(10.5 * 1024 * 1024).fill(0x25) });
  check('oversized file rejected', r.status === 422 || r.status === 413, r.status);
  const cross = await fetch(`${base}/api/contact`, { method: 'POST', body: new URLSearchParams(valid), headers: { origin: 'https://evil.example' } });
  check('cross-site post rejected', cross.status === 403, cross.status);
  for (let i = 0; i < 4; i++) r = await post({ ...valid, email: 'bad' });
  check('rate limit applies', r.status === 429, r.status);
  const spoof = await fetch(`${base}/api/contact`, { method: 'POST', body: new FormData(), headers: { origin: base, 'x-client-ip': '1.2.3.4' } });
  check('spoofed client ip ignored', spoof.status === 429, spoof.status);
}
if (mode === 'mailfail') {
  const r = await post({ ...valid, ...token });
  check('mail failure shows error, not success', r.status === 502 && !r.json.ok, r.json.message);
}
if (mode === 'browser') {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new' });
  fs.writeFileSync('.data/test-boq.pdf', '%PDF-1.4 local test file');
  for (const [route, withFile] of [['/', true], ['/contact', false]]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + route, { waitUntil: 'load' });
    const disabled = await page.$eval('#contactForm button[type=submit]', (b) => b.disabled);
    check(`${route} submit starts disabled`, disabled);
    await page.type('#fullName', 'Browser Test');
    await page.type('#companyName', 'Local QA');
    await page.type('#email', 'qa@example.com');
    await page.type('#phone', '+966501234567');
    await page.select('#service', 'mechanical');
    await page.type('#location', 'Dammam');
    await page.type('#message', `Local form test from ${route}`);
    if (withFile) await (await page.$('#boq')).uploadFile('.data/test-boq.pdf');
    const enabled = await page.waitForFunction(() => !document.querySelector('#contactForm button[type=submit]').disabled, { timeout: 20000 }).then(() => true).catch(() => false);
    check(`${route} security check enables submit`, enabled);
    const before = mails();
    await page.evaluate(() => document.querySelector('#contactForm button[type=submit]').click());
    await page.waitForFunction(() => { const s = document.querySelector('.form-status'); return s && !s.hidden; }, { timeout: 15000 });
    const status = await page.$eval('.form-status', (s) => s.textContent);
    check(`${route} shows success`, /has been sent/.test(status), status);
    await new Promise((r) => setTimeout(r, 500));
    check(`${route} email delivered`, mails() === before + 1);
    check(`${route} no console errors`, errors.length === 0, errors.join(' | ').slice(0, 300));
    await page.close();
  }
  await browser.close();
  const files = fs.readdirSync('.data/mail').sort();
  const last = JSON.parse(fs.readFileSync(`.data/mail/${files.at(-2)}`, 'utf8'));
  console.log('home mail:', last.subject, '| replyTo', last.replyTo, '| attachments', JSON.stringify(last.attachments));
  check('attachment arrived', last.attachments.length === 1);
  check('reply-to is the visitor', last.replyTo === 'qa@example.com');
  check('nothing kept on the server', !fs.existsSync('.data/inquiries.jsonl'));
  const before = mails();
  const html = await post({ ...valid, ...token, fullName: '<img src=x onerror=alert(1)>', formType: 'home' });
  const sent = JSON.parse(fs.readFileSync(`.data/mail/${fs.readdirSync('.data/mail').sort().at(-1)}`, 'utf8'));
  check('html in a message is escaped', html.status === 200 && mails() === before + 1 && !sent.html.includes('<img'));
}
console.log(results.every(Boolean) ? `${mode}: ALL PASSED (${results.length})` : `${mode}: FAILURES`);
