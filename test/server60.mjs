import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

/* 2.60: the Server page, holding updates, downloading a copy, saved-for-offline status, the update-ready bar, pushing for me when I stop, and a fast cold open */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf60-'));
const vault = path.join(tmp, 'vault'); const data = path.join(tmp, 'data'); const appdir = path.join(tmp, 'app');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
spawnSync('python3', ['-I', path.join(root, 'server', 'dmforge_io.py'), 'import', '--data', data, vault], { encoding: 'utf8' });
// the server runs a newer version than the page we open (as if it was updated while the tab stayed open): the version file beside the app says so
fs.mkdirSync(appdir); fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(appdir, 'DM-Forge.html'));
const PORT = 8797, TOKEN = 'server60-token-0123456789abcdef';
const thisVersion = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
fs.writeFileSync(path.join(appdir, 'VERSION'), thisVersion + '\n');
const proc = spawn('python3', ['-I', path.join(root, 'server', 'dmforge_hosted.py'), '--data', data, '--bind', '127.0.0.1', '--port', String(PORT), '--name', 'Hosted', '--app', path.join(appdir, 'DM-Forge.html')],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DMFORGE_TOKEN: TOKEN } });
let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 60 && !/listening/.test(out); i++) await sleep(100);
const base = 'http://127.0.0.1:' + PORT;
const api = (op, p, init = {}) => fetch(base + '/api/' + op + '?path=' + encodeURIComponent(p) + (init.more || ''), { ...init, headers: { 'X-DMF-Token': TOKEN, ...(init.headers || {}) } });
const read = async p => (await api('read', p)).text();

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
const reads = []; pg.on('request', r => { if (r.url().includes('/api/read')) reads.push(decodeURIComponent(r.url().split('path=')[1].split('&')[0])); });
await pg.goto(base + '/'); await pg.fill('input[name=token]', TOKEN); await pg.click('button[type=submit]');
await pg.waitForSelector('.dir-list');
await pg.click('.dir-row:has-text("Ashfall")'); await pg.click('text=Use “Ashfall” as the campaign');
await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');
const firstLoadReads = reads.filter(p => p.endsWith('.md')).length;
check('the first open downloads the notes (' + firstLoadReads + ')', firstLoadReads > 10, firstLoadReads);

/* ---------- opening again downloads only what changed ---------- */
await sleep(800);
reads.length = 0;
await pg.reload(); await pg.waitForSelector('.sidebar'); await sleep(800);
check('opening again downloads no notes it already holds', reads.filter(p => p.endsWith('.md')).length === 0, reads.filter(p => p.endsWith('.md')).join(', '));
{ const t = await pg.textContent('.nav-btn:has-text("NPCs")'); check('and the notes are all there', t.includes('4') && (await pg.evaluate(() => window.__dmforge.S.working.base.size)) === 16, JSON.stringify(t) + ' files=' + await pg.evaluate(() => window.__dmforge.S.files.length) + ' base=' + await pg.evaluate(() => window.__dmforge.S.working.base.size)); }
const tamPath = 'Ashfall/NPCs/Old Tam.md';
const tam0 = await read(tamPath);
await api('write', tamPath, { method: 'POST', body: tam0 + '\nChanged elsewhere.\n' });
await sleep(300);
reads.length = 0;
await pg.reload(); await pg.waitForSelector('.sidebar'); await sleep(800);
check('a note changed on the server is the only one downloaded', reads.filter(p => p.endsWith('.md')).join('|') === tamPath, reads.join('|'));
check('and it is the new text', (await pg.evaluate(p => window.__dmforge.S.working.get(p), tamPath)).includes('Changed elsewhere'));

/* ---------- the Server page ---------- */
await pg.evaluate(() => window.__dmforge.A.openSettings('server'));
await pg.waitForSelector('#srvPanel');
check('the Server category is there and shows the report', (await pg.textContent('#srvPanel')).includes('Version') && (await pg.textContent('#srvPanel')).includes('Disk'));
check('it says no backup yet, honestly', (await pg.textContent('#srvPanel')).includes('none yet'));
check('the campaign counts are shown', /\d+ notes/.test(await pg.textContent('#srvPanel')));
fs.writeFileSync(path.join(data, 'status.json'), JSON.stringify({ backup: { at: Date.now() - 3600000, ok: false, error: 'No space left on device' } }));
await pg.click('#srvRefresh'); await sleep(500);
check('a failed backup is shown plainly', (await pg.textContent('#srvPanel')).includes('FAILED') && (await pg.textContent('#srvPanel')).includes('No space left'));
check('and the top bar says the server needs a look', await pg.locator('#serverWarnChip').count() === 1);
fs.writeFileSync(path.join(data, 'status.json'), JSON.stringify({ backup: { at: Date.now() - 600000, ok: true, file: 'x.db.gz', bytes: 123456, verified: true } }));
await pg.click('#srvRefresh'); await sleep(500);
check('a good backup shows when, how big, and that it was checked', /10 min ago/.test(await pg.textContent('#srvPanel')) && (await pg.textContent('#srvPanel')).includes('checked'));
check('the warning chip goes away', await pg.locator('#serverWarnChip').count() === 0);
fs.writeFileSync(path.join(data, 'update-status.json'), JSON.stringify({ state: 'failed', version: '9.9.9', at: Date.now() - 60000, message: 'it did not build' }));
await pg.click('#srvRefresh'); await sleep(500);
check('a failed update is shown and flagged', (await pg.textContent('#srvPanel')).includes('did not install') && await pg.locator('#serverWarnChip').count() === 1);
fs.unlinkSync(path.join(data, 'update-status.json'));
await pg.click('#srvRefresh'); await sleep(400);

/* ---------- hold updates ---------- */
await pg.click('#srvHold'); await pg.waitForSelector('#srvResume');
check('holding updates writes the hold the updater reads', fs.existsSync(path.join(data, '.hold-updates')) && +fs.readFileSync(path.join(data, '.hold-updates'), 'utf8') > Date.now() / 1000 + 7 * 3600);
check('the page says how long it has left', (await pg.textContent('#srvPanel')).includes('On hold'));
await pg.click('#srvResume'); await pg.waitForSelector('#srvHold');
check('resuming removes it', !fs.existsSync(path.join(data, '.hold-updates')));

/* ---------- download a copy ---------- */
const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#srvZip')]);
const zp = path.join(tmp, 'got.zip'); await dl.saveAs(zp);
const zbytes = fs.readFileSync(zp);
check('the zip downloads from the page and is a real zip with the notes in it', zbytes.slice(0, 2).toString() === 'PK' && zbytes.includes(Buffer.from('Ashfall/NPCs/Old Tam.md')), dl.suggestedFilename());
check('its name says what it is', /^DM-Forge-notes-.*\.zip$/.test(dl.suggestedFilename()));

/* ---------- saved on this device ---------- */
await pg.waitForSelector('#srvOfflineState');
const st1 = await pg.textContent('#srvOfflineState');
check('it says how much is saved on this device', /\d+ of \d+ notes/.test(st1), st1);
await pg.click('#srvOffline'); await sleep(1500);
const st2 = await pg.textContent('#srvOfflineState');
const m = st2.match(/(\d+) of (\d+) notes/);
check('after "Save everything for offline" every note is saved here', m && m[1] === m[2], st2);

/* ---------- the server was updated while this page stayed open ---------- */
fs.writeFileSync(path.join(appdir, 'VERSION'), '99.0.0\n');
const vf = path.join(root, 'server', '..', 'VERSION');
await pg.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await pg.waitForSelector('#updateBar', { timeout: 8000 });
check('an open page is offered a Reload when the server runs a newer version', (await pg.textContent('#updateBar')).includes('99.0.0'));
check('and it is not reloaded for you', await pg.evaluate(() => !!window.__dmforge.S.working));
fs.writeFileSync(path.join(appdir, 'VERSION'), thisVersion + '\n');

/* ---------- push for me when I stop ---------- */
await pg.evaluate(() => window.__dmforge.A.openSettings('writing'));
await pg.waitForSelector('#setAutoPush');
check('the setting is off to begin with', !(await pg.isChecked('#setAutoPush')));
await pg.click('.nav-btn:has-text("NPCs")'); await pg.click('.list-item:has-text("Old Tam")');
await pg.click('.note-head button:text-is("Edit")'); await pg.fill('.card input >> nth=0', 'Orc'); await pg.click('text=Save to pending changes');
check('one change is waiting', (await pg.evaluate(() => window.__dmforge.S.working.count)) === 1);
await pg.evaluate(() => { window.__dmforge.S.lastTouch = Date.now() - 3600000; });
check('with the setting off nothing is pushed by itself', !(await pg.evaluate(() => window.__dmforge.A.autoPushTick())) && (await pg.evaluate(() => window.__dmforge.S.working.count)) === 1);
await pg.evaluate(() => window.__dmforge.A.openSettings('writing'));
await pg.click('#setAutoPush'); await pg.waitForSelector('#setAutoPushMins');
check('turning it on offers how long to wait', (await pg.inputValue('#setAutoPushMins')) === '10');
await pg.evaluate(() => { window.__dmforge.S.lastTouch = Date.now() - 2 * 60000; });
check('it waits while you are still editing (2 of 10 minutes)', !(await pg.evaluate(() => window.__dmforge.A.autoPushTick())));
await pg.evaluate(() => { window.__dmforge.S.lastTouch = Date.now() - 11 * 60000; });
check('after a quiet spell it pushes', await pg.evaluate(() => window.__dmforge.A.autoPushTick()));
check('the change is on the server', (await read(tamPath)).includes('race: Orc'));
check('and nothing is left waiting', (await pg.evaluate(() => window.__dmforge.S.working.count)) === 0);
const undo = await (await api('undo-info', '')).json();
check('it was one push that Undo last push can take back', undo.available && undo.available.files === 1, JSON.stringify(undo));

// a note that changed on the server in the meantime: it waits for you
await pg.evaluate(() => window.__dmforge.A.openSettings('writing')); // leave the editor
await pg.click('.nav-btn:has-text("NPCs")'); await pg.click('.list-item:has-text("Old Tam")');
await pg.click('.note-head button:text-is("Edit")'); await pg.fill('.card input >> nth=0', 'Gnome'); await pg.click('text=Save to pending changes');
const tam1 = await read(tamPath);
await api('write', tamPath, { method: 'POST', body: tam1.replace('race: Orc', 'race: Orc\nnickname: Tam-Tam') });
await pg.evaluate(() => { window.__dmforge.S.lastTouch = Date.now() - 11 * 60000; });
check('a note changed elsewhere meanwhile is NOT pushed for me', !(await pg.evaluate(() => window.__dmforge.A.autoPushTick())));
check('the change stays waiting', (await pg.evaluate(() => window.__dmforge.S.working.count)) === 1);
check('and I am told, and told what to do', (await pg.locator('.toast, [role=status]').allTextContents()).join(' ').includes('Auto-push is waiting'));
check('the other edit on the server is untouched', (await read(tamPath)).includes('nickname: Tam-Tam') && !(await read(tamPath)).includes('Gnome'));

check('no page errors', errs.length === 0, errs.join('\n'));
await b.close(); proc.kill('SIGKILL');
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
