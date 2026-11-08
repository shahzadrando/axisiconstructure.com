// Local stand-in for Brevo's send API. Saves each request to .data/mail and sends nothing.
// MOCK_STATUS=401 makes it reject requests, to test failure handling.
import fs from 'node:fs/promises';
import http from 'node:http';

const status = Number(process.env.MOCK_STATUS ?? 201);
await fs.mkdir('.data/mail', { recursive: true });

http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const valid = req.method === 'POST' && req.url === '/v3/smtp/email' && req.headers['api-key']
      && body.sender?.email && body.to?.[0]?.email && body.subject && body.htmlContent;
    if (!valid || status >= 400) {
      res.writeHead(valid ? status : 400, { 'content-type': 'application/json' });
      return res.end('{"code":"unauthorized","message":"mock rejection"}');
    }
    const record = {
      to: body.to[0].email, from: body.sender.email, replyTo: body.replyTo?.email, subject: body.subject, html: body.htmlContent, text: body.textContent,
      attachments: (body.attachment ?? []).map((a) => ({ filename: a.name, size: Buffer.from(a.content, 'base64').length })),
    };
    await fs.writeFile(`.data/mail/${Date.now()}.json`, JSON.stringify(record, null, 1), 'utf8');
    res.writeHead(201, { 'content-type': 'application/json' });
    res.end('{"messageId":"<mock@local>"}');
  });
}).listen(4555, '127.0.0.1', () => console.log('brevo mock on 127.0.0.1:4555'));
