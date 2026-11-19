/* 2.38: undo the last push, the trash viewer with restore, and rolling back and forward from the Menu. Runs a real helper from a temp copy of the app. */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-safe-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
// a private copy of the app, with a "previous version" kept the way an update keeps it
const app = path.join(tmp, 'app'); const prev = path.join(app, '.previous'); fs.mkdirSync(prev, { recursive: true });
const html = path.join(root, 'dist', 'DM-Forge.html');
for (const d of [app, prev]) { fs.copyFileSync(path.join(root, 'helper', 'dmforge-server.py'), path.join(d, 'dmforge-server.py')); fs.copyFileSync(html, path.join(d, 'DM-Forge.html')); }
fs.writeFileSync(path.join(app, 'VERSION'), '2.38.0\n'); fs.writeFileSync(path.join(prev, 'VERSION'), '2.37.0\n');
const PORT = 8793;
const proc = spawn('python3', [path.join(app, 'dmforge-server.py'), vault, '--port', String(PORT), '--no-open', '--no-update', '--app', path.join(app, 'DM-Forge.html')], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DMF_CONFIG_DIR: path.join(tmp, 'cfg') } });
let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/\?t=/.test(out); i++) await sleep(100);
const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
if (!m) { console.log('helper did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + m[1], token = m[2];
const api = (op, p, init = {}, q = '') => fetch(base + '/api/' + op + '?path=' + encodeURIComponent(p) + q, { ...init, headers: { 'X-DMF-Token': token, ...(init.headers || {}) } });
const post = (op, body) => api(op, '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
const disk = rel => path.join(vault, rel);
const A = 'Ashfall/NPCs/Old Tam.md', B = 'Ashfall/NPCs/Brand New Person.md';
const files = fs.readdirSync(disk('Ashfall/Plot Threads'));
const plot = 'Ashfall/Plot Threads/' + files[0];
const origA = fs.readFileSync(disk(A), 'utf8'), origPlot = fs.readFileSync(disk(plot), 'utf8');

// ---- the helper keeps the old text of a push
check('nothing to undo at first', (await (await api('undo-info', '')).json()).available === null);
await api('write', A, { method: 'POST', body: 'edited by push one' }, '&push=p1');
await api('write', B, { method: 'POST', body: 'a new note' }, '&push=p1');
await api('trash', plot, { method: 'POST' }, '&push=p1');
let info = (await (await api('undo-info', '')).json()).available;
check('the last push is listed with its notes', info && info.id === 'p1' && info.files === 3 && info.written === 2 && info.trashed === 1, JSON.stringify(info));
check('the old text is kept outside the vault', fs.existsSync(path.join(tmp, 'cfg', 'undo')) && !fs.readdirSync(vault).some(n => /undo/i.test(n)));
let r = await post('undo-push');
check('undo puts a changed note back as it was', r.restored === 2 && fs.readFileSync(disk(A), 'utf8') === origA, JSON.stringify(r));
check('and a note the push created goes to the trash', r.removed === 1 && !fs.existsSync(disk(B)) && fs.existsSync(disk('.trash/' + B)));
check('and a note the push deleted comes back', fs.readFileSync(disk(plot), 'utf8') === origPlot);
check('and the push is used up', (await (await api('undo-info', '')).json()).available === null);

// ---- a note changed after the push is not overwritten unless you say so
await api('write', A, { method: 'POST', body: 'pushed' }, '&push=p2');
fs.writeFileSync(disk(A), 'edited again in Obsidian');
r = await post('undo-push');
check('a note changed since is reported, and nothing is touched', r.conflicts && r.conflicts.length === 1 && r.conflicts[0] === A && fs.readFileSync(disk(A), 'utf8') === 'edited again in Obsidian', JSON.stringify(r));
r = await post('undo-push', { force: true });
check('"undo anyway" puts the old text back', r.restored === 1 && fs.readFileSync(disk(A), 'utf8') === origA);
for (let i = 3; i < 16; i++) await api('write', 'Ashfall/NPCs/Keep ' + i + '.md', { method: 'POST', body: 'x' }, '&push=q' + i);
const kept = fs.readdirSync(path.join(tmp, 'cfg', 'undo', fs.readdirSync(path.join(tmp, 'cfg', 'undo'))[0]));
check('only the last ten pushes are kept', kept.length === 10, String(kept.length));
for (let i = 0; i < 12; i++) { const rr = await post('undo-push'); if (rr.restored === undefined && rr.removed === undefined) break; }

// ---- the trash
const tl = await (await api('trash-list', '')).json();
check('the trash lists what was moved there', tl.some(x => x.path === '.trash/' + B));
fs.writeFileSync(disk(B), 'someone made this again');
const back = await (await api('trash-restore', '.trash/' + B, { method: 'POST' })).json();
check('restoring beside an existing note makes "(restored)"', /\(restored\)\.md$/.test(back.path) && fs.existsSync(disk(back.path)) && !fs.existsSync(disk('.trash/' + B)), back.path);
check('restore refuses anything not in the trash', (await api('trash-restore', 'Ashfall/NPCs/Old Tam.md', { method: 'POST' })).status === 400);

// ---- the app
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(base + '/?t=' + token);
await pg.waitForSelector('.dir-list');
await pg.click('.dir-row:has-text("Ashfall")');
await pg.click('text=Use “Ashfall” as the campaign');
await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');
const P = '.pane:not([hidden]) ';
const dom = sel => pg.evaluate(s => document.querySelector(s).click(), sel);
const push = async () => { await dom('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); };
const nav = label => pg.evaluate(l => [...document.querySelectorAll('.nav-btn')].find(e => new RegExp(l).test(e.textContent)).click(), label);

await nav('NPCs'); await pg.click(P + '.list-item:has-text("Old Tam")');
await pg.click(P + '#editBtn');
await pg.fill(P + '.card input >> nth=0', 'Gnome'); await pg.click(P + 'button:has-text("Save to pending changes")');
await push();
await pg.waitForSelector('#pushUndo', { timeout: 5000 }).catch(() => {});
check('after a push the result offers Undo this push', await pg.locator('#pushUndo').count() === 1);
const pushed = fs.readFileSync(disk(A), 'utf8');
check('the push wrote the note', /Gnome/.test(pushed));
await pg.click('#pushUndo');
await pg.waitForSelector('.modal:has-text("Undo the last push?")');
check('the question says what was pushed', /1 note written/.test(await pg.textContent('.modal')));
await pg.click('.modal button:has-text("Undo that push")');
await pg.waitForSelector('text=Undid the push', { timeout: 10000 });
await pg.waitForSelector('.nav-btn');
check('Undo this push puts the note on disk back', fs.readFileSync(disk(A), 'utf8') === origA);
await nav('NPCs'); await pg.click(P + '.list-item:has-text("Old Tam")');
check('and the app shows the old text again', !(await pg.textContent(P + '.card')).includes('Gnome'));

// trash: delete, push, restore from the Menu
await dom('.pane:not([hidden]) #deleteBtn'); await pg.click('.modal button:has-text("Delete note")');
await push(); await pg.click('text=Done');
check('the deleted note is in the vault trash', fs.existsSync(disk('.trash/' + A)));
await pg.evaluate(() => window.__dmforge.A.openSettings('data'));
await pg.waitForSelector('#setTrashBtn');
check('Settings (Data and updates) has Trash, Undo last push and Version', await pg.locator('#setUndoPush').count() === 1 && await pg.locator('#setVersion').count() === 1);
await dom('#setTrashBtn');
await pg.waitForSelector('#trashList');
check('the trash shows the deleted note', await pg.locator('[data-trash="Old Tam.md"]').count() === 1);
await dom('[data-restore="Old Tam.md"]');
await pg.waitForSelector('#trashRestored');
await dom('#trashDone');
await pg.waitForSelector('.sidebar');
await pg.waitForTimeout(400);
check('Restore puts the note back on disk', fs.existsSync(disk(A)) && !fs.existsSync(disk('.trash/' + A)));
await nav('NPCs');
check('and in the app', await pg.locator(P + '.list-item:has-text("Old Tam")').count() === 1);

// version: roll back (the helper restarts), then forward
await pg.evaluate(() => window.__dmforge.A.openSettings('data'));
await pg.waitForSelector('#setVersion'); await dom('#setVersion');
await pg.waitForSelector('#verBack');
check('Version says which one you are on and offers the one before', (await pg.textContent('#verNow')) === '2.38.0' && /2\.37\.0/.test(await pg.textContent('#verBack')));
check('and no forward yet', await pg.locator('#verForward').count() === 0);
await dom('#verBack');
await pg.waitForSelector('.modal:has-text("Go back to version 2.37.0?")');
await pg.click('.modal button:has-text("Roll back and restart")');
await pg.waitForEvent('load', { timeout: 20000 });
await pg.waitForSelector('.sidebar, .dir-list', { timeout: 15000 });
check('the helper switched its files to the earlier version', fs.readFileSync(path.join(app, 'VERSION'), 'utf8').trim() === '2.37.0' && fs.readFileSync(path.join(app, '.rolled-back', 'VERSION'), 'utf8').trim() === '2.38.0');
const ping = await (await api('ping', '')).json();
check('and restarted on the same link', ping.version === '2.37.0');
await pg.evaluate(() => { window.__dmforge.S.dialog = { kind: 'version' }; window.__dmforge.emit(); });
await pg.waitForSelector('#verForward');
check('now Version offers to go forward again', /2\.38\.0/.test(await pg.textContent('#verForward')));
await dom('#verForward');
await pg.click('.modal button:has-text("Go forward and restart")');
await pg.waitForEvent('load', { timeout: 20000 });
await sleep(500);
check('going forward puts the newer files back', fs.readFileSync(path.join(app, 'VERSION'), 'utf8').trim() === '2.38.0' && (await (await api('ping', '')).json()).version === '2.38.0');
check('no page errors', errs.length === 0, errs.join(' | '));

await b.close(); proc.kill();
fs.rmSync(tmp, { recursive: true, force: true });
const ok = results.filter(Boolean).length;
console.log('\n' + ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
