import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

/* V3: working with no connection, picking up another device's changes, and never overwriting a note that moved on. */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf3o-'));
const vault = path.join(tmp, 'vault'); const data = path.join(tmp, 'data');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
spawnSync('python3', ['-I', path.join(root, 'server', 'dmforge_io.py'), 'import', '--data', data, vault], { encoding: 'utf8' });

const PORT = 8794, TOKEN = 'offline-test-token-0123456789';
let proc = null;
async function startServer() {
  proc = spawn('python3', ['-I', path.join(root, 'server', 'dmforge_hosted.py'), '--data', data, '--bind', '127.0.0.1', '--port', String(PORT), '--name', 'Hosted', '--app', path.join(root, 'dist', 'DM-Forge.html')],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DMFORGE_TOKEN: TOKEN } });
  let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
  for (let i = 0; i < 60 && !/listening/.test(out); i++) await sleep(100);
  if (!/listening/.test(out)) { console.log('server did not start:\n' + out); process.exit(1); }
}
async function stopServer() { proc.kill('SIGKILL'); await new Promise(r => proc.once('exit', r)); }
await startServer();
const base = 'http://127.0.0.1:' + PORT;
const api = (op, p, init = {}) => fetch(base + '/api/' + op + '?path=' + encodeURIComponent(p), { ...init, headers: { 'X-DMF-Token': TOKEN, ...(init.headers || {}) } });
const read = async p => (await api('read', p)).text();

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
pg.on('console', mm => { if (mm.type() === 'error' && !/Failed to load resource|ERR_|net::|Cannot reach/.test(mm.text())) errs.push(mm.text()); });
await pg.goto(base + '/'); await pg.fill('input[name=token]', TOKEN); await pg.click('button[type=submit]');
await pg.waitForSelector('.dir-list');
await pg.click('.dir-row:has-text("Ashfall")'); await pg.click('text=Use “Ashfall” as the campaign');
await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');
await pg.evaluate(() => navigator.serviceWorker.ready);
check('the service worker is active', await pg.evaluate(() => !!navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(r => !!r.active)));
await pg.reload(); await pg.waitForSelector('.sidebar');            // a reload while online lets the worker keep the app page
await sleep(500);

/* ---------- another device changes things while this one is open ---------- */
const tamPath = 'Ashfall/NPCs/Old Tam.md';
const tam0 = await read(tamPath);
await api('write', tamPath, { method: 'POST', body: tam0 + '\nTam also fixes boats.\n' });
await api('write', 'Ashfall/NPCs/Brand New Person.md', { method: 'POST', body: '---\nrole: Baker\n---\nBakes bread.\n' });
await pg.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await pg.waitForFunction(() => window.__dmforge.S.working.get('Ashfall/NPCs/Brand New Person.md') !== undefined, null, { timeout: 8000 });
check('a note added on another device appears', true);
check('a note edited on another device is updated here', (await pg.evaluate(p => window.__dmforge.S.working.get(p), tamPath)).includes('Tam also fixes boats'));
check('and it is not shown as an unpushed change', (await pg.evaluate(() => window.__dmforge.S.working.count)) === 0);

/* ---------- lose the connection: keep working, nothing is lost ---------- */
await stopServer();
await pg.click('.nav-btn:has-text("NPCs")'); await pg.click('.list-item:has-text("Old Tam")');
await pg.click('.note-head button:text-is("Edit")'); await pg.fill('.card input >> nth=0', 'Human'); await pg.click('text=Save to pending changes');
await pg.click('#pushBtn');
await pg.waitForSelector('#offlineChip', { timeout: 8000 });
check('pushing with no server explains it and keeps the change', (await pg.evaluate(() => window.__dmforge.S.working.count)) === 1 && (await pg.locator('.toast, [role=status]').allTextContents()).join(' ').includes('saved on this device'));
check('the top bar says Offline', (await pg.textContent('#offlineChip')).includes('Offline'));
check('no review screen opened', (await pg.locator('#confirmPush').count()) === 0);
await sleep(700);                                                                // let the pending change reach this browser's storage

/* ---------- open the app cold with no server ---------- */
await pg.reload();
await pg.waitForSelector('.sidebar', { timeout: 15000 });
check('the app and the campaign open with the server down', (await pg.textContent('.nav-btn:has-text("NPCs")')).includes('5'));
check('the unpushed change came back', (await pg.evaluate(() => window.__dmforge.S.working.count)) === 1);
check('the note shows what was typed', (await pg.evaluate(p => window.__dmforge.S.working.get(p), tamPath)).includes('race: Human'));
await pg.waitForSelector('#offlineChip', { timeout: 15000 });
await pg.click('.nav-btn:has-text("Maps")'); await sleep(300);
check('opening offline raised no page errors', errs.length === 0, errs.join('\n'));

/* ---------- the server comes back ---------- */
await startServer();
await pg.waitForSelector('#offlineChip', { state: 'detached', timeout: 20000 });
check('the Offline chip goes away on its own once the server is back', true);
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
check('the change made offline was pushed', (await read(tamPath)).includes('race: Human') && (await read(tamPath)).includes('Tam also fixes boats'));

/* ---------- a note changes in the instant between the review and the write: nothing is overwritten ---------- */
const kp = 'Ashfall/Players/Kestra Dune.md';
await pg.click('.nav-btn:has-text("Players")'); await pg.click('.list-item:has-text("Kestra Dune")');
await pg.click('.note-head button:text-is("Edit")'); await pg.fill('.card input >> nth=1', 'Assassin'); await pg.click('text=Save to pending changes');
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row');
const k0 = await read(kp);
let raced = false;
await pg.route('**/api/write**', async route => {
  if (!raced && route.request().url().includes(encodeURIComponent(kp))) {
    raced = true;
    await api('write', kp, { method: 'POST', body: k0 + '\nWritten by someone else, right now.\n' });
  }
  await route.continue();
});
await pg.click('#confirmPush'); await sleep(1500);
const k1 = await read(kp);
check('the write that raced was refused and the other edit survived', k1.includes('Written by someone else') && !k1.includes('Assassin'), k1);
check('my change is still waiting, not lost', (await pg.evaluate(() => window.__dmforge.S.working.count)) >= 1);
check('the screen says so', (await pg.locator('.modal, .review').allTextContents()).join(' ').includes('changed on the server'));
const hist = await (await api('history', kp)).json();
check('every version is still in the history', hist.length >= 2);

check('no page errors', errs.length === 0, errs.join('\n'));
await b.close(); proc.kill();
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
