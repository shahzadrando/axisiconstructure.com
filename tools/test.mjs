// npm test: starts its own server and mail sink, so it always tests the current build.
import { spawn } from 'node:child_process';

const PORT = 4390;
const base = `http://localhost:${PORT}`;
const env = {
  ...process.env, PORT: String(PORT), NODE_ENV: 'test', BASE: base,
  BREVO_API_URL: 'http://127.0.0.1:4555/v3/smtp/email', BREVO_API_KEY: 'test', MAIL_FROM: 'website@example.com', MAIL_TO: 'inbox@example.com',
  PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (args) => new Promise((resolve) => spawn(process.execPath, args, { env, stdio: 'inherit' }).on('exit', (code) => resolve(code === 0)));
const startServer = async () => {
  const child = spawn(process.execPath, ['server.mjs'], { env, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { if (await fetch(base).then((r) => r.ok, () => false)) return child; await sleep(250); }
  child.kill(); throw new Error('server did not start');
};

const mock = spawn(process.execPath, ['tools/brevo-mock.mjs'], { env, stdio: 'ignore' });
const failed = [];
try {
  // The rate limit is per server run, so each group gets a fresh server.
  for (const group of [[['tools/check-images.mjs'], ['tools/verify.mjs', base], ['tools/form-test.mjs', 'abuse-a']], [['tools/form-test.mjs', 'abuse-b']], [['tools/form-test.mjs', 'browser']], [['tools/form-test.mjs', 'bigbody']]]) {
    const server = await startServer();
    for (const args of group) if (!(await run(args))) failed.push(args.join(' '));
    server.kill();
    await sleep(500);
  }
} finally { mock.kill(); }
console.log(failed.length ? `TESTS FAILED: ${failed.join(', ')}` : 'ALL TESTS PASSED');
process.exit(failed.length ? 1 : 0);
