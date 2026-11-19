/* 2.30.2: updating from inside the app. Real helper on a copy of the app folder, a fake newer zip in a Downloads folder. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-u30-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const app = path.join(tmp, 'DM Forge'), dl = path.join(tmp, 'Downloads'), trash = path.join(tmp, 'Trash');
for (const d of [app, dl, trash]) fs.mkdirSync(d, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));
fs.copyFileSync(path.join(root, 'README.md'), path.join(app, 'README.md'));
const current = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const NEWV = '99.0.0';
const makeZip = () => {
  const stage = path.join(tmp, 'stage'); fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage);
  for (const f of ['DM-Forge.html', 'dmforge-server.py', 'Start DM Forge.command', 'README.md']) fs.copyFileSync(path.join(app, f), path.join(stage, f));
  fs.writeFileSync(path.join(stage, 'VERSION'), NEWV + '\n');
  const r = spawnSync('python3', ['-c', 'import zipfile,os,sys; z=zipfile.ZipFile(sys.argv[2],"w"); [z.write(os.path.join(sys.argv[1],f), f) for f in os.listdir(sys.argv[1])]; z.close()', stage, path.join(dl, 'DM-Forge-V2.zip')]);
  return r.status === 0;
};

const PORT = 8816;
const proc = spawn('python3', [path.join(app, 'dmforge-server.py'), vault, '--port', String(PORT), '--no-open', '--no-update', '--downloads', dl, '--trash', trash], { env: { ...process.env, DMF_CONFIG_DIR: path.join(tmp, 'cfg') }, stdio: ['pipe', 'pipe', 'pipe'] });
process.on('exit', () => { try { proc.kill(); } catch (e) { /* gone */ } });
let out = '';
proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/\?t=/.test(out); i++) await new Promise(r => setTimeout(r, 100));
const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
if (!m) { console.log('helper did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + m[1], token = m[2];
const api = (op, init) => fetch(base + '/api/' + op + '?path=', Object.assign({ headers: { 'X-DMF-Token': token } }, init || {}));

// ---- the helper's side
let info = await (await api('update-info')).json();
check('with nothing in Downloads there is nothing to install', info.available === null && info.current === current, JSON.stringify(info));
check('installing with nothing there is refused plainly', (await api('update-install', { method: 'POST' })).status === 404);
check('the update calls need the token', (await fetch(base + '/api/update-info?path=')).status === 403);
fs.writeFileSync(path.join(dl, 'DM-Forge-V2-broken.zip'), 'not a zip');
info = await (await api('update-info')).json();
check('a file that is not a good zip is ignored', info.available === null);

// ---- the app
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errors = [];
pg.on('pageerror', e => errors.push(e.message));
await pg.goto(base + '/?t=' + token);
await pg.waitForSelector('.dir-list');
await pg.click('.dir-row:has-text("Ashfall")');
await pg.click('text=Use “Ashfall” as the campaign');
await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
await pg.waitForSelector('.sidebar');
check('no update bar when there is nothing newer', await pg.locator('#updateReady').count() === 0);
await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="data"]');
check('Settings has a Check for an update button', await pg.locator('#setUpdate').count() === 1);
await pg.click('#setUpdate');
await pg.waitForSelector('.toasts');
check('checking says there is nothing newer, and where it looked', /No newer DM Forge zip/.test(await pg.textContent('.toasts')));
// a pending change that must survive
await pg.evaluate(() => { const A = window.__dmforge.A; A.createNote('npc', 'Update Survivor', { fm: {}, body: '# Update Survivor\n' }); });
check('there is an unpushed change before updating', /Push 1 change/.test(await pg.textContent('#pushBtn')));
// the new zip arrives
check('the fake newer zip was made', makeZip());
await pg.evaluate(() => window.dispatchEvent(new Event('focus')));
await pg.waitForSelector('#updateReady', { timeout: 8000 });
check('coming back to the page notices it and offers to install', (await pg.textContent('#updateReady')).includes(NEWV) && await pg.locator('#updateInstall').count() === 1);
await pg.click('#updateLater');
check('Not now hides the bar', await pg.locator('#updateReady').count() === 0);
await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="data"]'); await pg.click('#setUpdate');
await pg.waitForSelector('.modal .btn-primary');
check('the Menu item asks first, naming the version and that changes are kept', /99\.0\.0/.test(await pg.textContent('.modal')) && /unpushed change/.test(await pg.textContent('.modal')));
const reloaded = pg.waitForEvent('load', { timeout: 60000 });          // the page reloads itself once the helper is back
await pg.click('.modal .btn-primary');
await reloaded;
for (let i = 0; i < 40; i++) { try { if ((await api('ping')).ok) break; } catch (e) { /* still restarting */ } await new Promise(r => setTimeout(r, 250)); }
check('the helper installed it and the page came back on the same link', fs.readFileSync(path.join(app, 'VERSION'), 'utf8').trim() === NEWV && (await (await api('update-info')).json()).current === NEWV);
check('the old version is kept for rolling back', fs.readFileSync(path.join(app, '.previous', 'VERSION'), 'utf8').trim() === current);
check('the zip was moved to the Trash', !fs.existsSync(path.join(dl, 'DM-Forge-V2.zip')) && fs.existsSync(path.join(trash, 'DM-Forge-V2.zip')));
check('the helper restarted on the same port', (await api('ping')).ok);
await pg.waitForSelector('.sidebar, .dir-list');
if (await pg.locator('.dir-list').count()) { await pg.click('.dir-row:has-text("Ashfall")'); await pg.click('text=Use “Ashfall” as the campaign'); await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText)); if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar'); }
check('and the unpushed change is still there', /Push 1 change/.test(await pg.textContent('#pushBtn')), await pg.textContent('#pushBtn'));
check('no errors from the page', errors.length === 0, errors.join('\n'));
await b.close(); proc.kill();
const ok = results.filter(Boolean).length;
console.log(`${ok}/${results.length} checks passed`);
process.exit(ok === results.length ? 0 : 1);
