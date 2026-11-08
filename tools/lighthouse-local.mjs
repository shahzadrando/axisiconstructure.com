// Lighthouse on the production build. Same 7 pages as the baseline, home 3 times.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:4321';
const out = path.resolve(process.argv[3] ?? 'tools/reports/lh');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const port = 9344;
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.resolve('.data/chrome-lh')}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3000));
const run = (p, name, form) => {
  const flag = form === 'desktop' ? '--preset=desktop' : '--form-factor=mobile';
  const r = spawnSync('npx.cmd', ['-y', 'lighthouse@12', `${base}${p}`, `--port=${port}`, flag, '--quiet', '--output=json', `--output-path="${path.join(out, `${name}.json`)}"`], { shell: true, stdio: 'ignore' });
  console.log(name, r.status);
};
for (const p of ['/', '/about', '/services', '/contact', '/civil-engineering', '/team', '/projects']) {
  const n = p === '/' ? 'home' : p.slice(1);
  run(p, `${n}_mobile`, 'mobile');
  run(p, `${n}_desktop`, 'desktop');
}
run('/', 'home_mobile_run2', 'mobile');
run('/', 'home_mobile_run3', 'mobile');
chrome.kill();
process.exit(0);
