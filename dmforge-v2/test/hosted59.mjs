import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

/* 2.59: a slow server must not leave a blank page, the app arrives compressed, and the browser is asked to keep its saved data */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf59-'));
const vault = path.join(tmp, 'vault'); const data = path.join(tmp, 'data');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
spawnSync('python3', ['-I', path.join(root, 'server', 'dmforge_io.py'), 'import', '--data', data, vault], { encoding: 'utf8' });
const PORT = 8796, TOKEN = 'slow-test-token-0123456789abc';
const proc = spawn('python3', ['-I', path.join(root, 'server', 'dmforge_hosted.py'), '--data', data, '--bind', '127.0.0.1', '--port', String(PORT), '--name', 'Hosted', '--app', path.join(root, 'dist', 'DM-Forge.html')],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DMFORGE_TOKEN: TOKEN } });
let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 60 && !/listening/.test(out); i++) await sleep(100);
const base = 'http://127.0.0.1:' + PORT;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(base + '/'); await pg.fill('input[name=token]', TOKEN); await pg.click('button[type=submit]');
await pg.waitForSelector('.dir-list');
await pg.click('.dir-row:has-text("Ashfall")'); await pg.click('text=Use “Ashfall” as the campaign');
await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');
await pg.evaluate(() => navigator.serviceWorker.ready);
await pg.reload(); await pg.waitForSelector('.sidebar'); await sleep(600);

const enc = await pg.evaluate(async () => { const r = await fetch('/', { credentials: 'same-origin' }); return { enc: r.headers.get('content-encoding'), tag: r.headers.get('etag') }; });
check('the app page is gzip-compressed on the wire', enc.enc === 'gzip', JSON.stringify(enc));
check('the app page carries a tag so an unchanged copy is not sent again', /^"[0-9a-f]+-gz"$/.test(enc.tag || ''), enc.tag);
const persisted = await pg.evaluate(() => window.__dmforge.S.storagePersisted);
check('the browser was asked to keep the saved data (and it was recorded)', persisted === true || persisted === false, String(persisted));

/* a server that accepts the connection but never answers: the page must still open from the saved copy */
process.kill(proc.pid, 'SIGSTOP');
const t0 = Date.now();
await pg.goto(base + '/', { waitUntil: 'commit', timeout: 20000 });
await pg.waitForSelector('.sidebar', { timeout: 20000 });
const took = Date.now() - t0;
check('a stalled server does not leave a blank page: the saved app opens', true);
check('and it takes seconds, not minutes (' + took + ' ms)', took < 12000, took);
await pg.waitForSelector('#offlineChip', { timeout: 30000 });
check('the top bar says Offline while the server is stalled', true);
process.kill(proc.pid, 'SIGCONT');
await pg.waitForSelector('#offlineChip', { state: 'detached', timeout: 30000 });
check('and it recovers by itself when the server answers again', true);
check('no page errors', errs.length === 0, errs.join('\n'));
await b.close(); proc.kill('SIGKILL');
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
