import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

/* V3: the whole app running against the hosted server (SQLite), signed in the way a browser would. */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf3-'));
const vault = path.join(tmp, 'vault'); const data = path.join(tmp, 'data');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const imp = spawnSync('python3', ['-I', path.join(root, 'server', 'dmforge_io.py'), 'import', '--data', data, vault], { encoding: 'utf8' });
check('import into the database', imp.status === 0 && /New: \d+/.test(imp.stdout), imp.stdout + imp.stderr);

const PORT = 8793, TOKEN = 'hosted-test-token-0123456789';
const proc = spawn('python3', ['-I', path.join(root, 'server', 'dmforge_hosted.py'), '--data', data, '--bind', '127.0.0.1', '--port', String(PORT), '--name', 'My Hosted Vault', '--app', path.join(root, 'dist', 'DM-Forge.html')],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DMFORGE_TOKEN: TOKEN } });
let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/listening/.test(out); i++) await new Promise(r => setTimeout(r, 100));
if (!/listening/.test(out)) { console.log('server did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + PORT;
const api = (op, p, init = {}) => fetch(base + '/api/' + op + '?path=' + encodeURIComponent(p), { ...init, headers: { 'X-DMF-Token': TOKEN, ...(init.headers || {}) } });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
pg.on('console', mm => { if (mm.type() === 'error' && !/Failed to load resource|ERR_/.test(mm.text())) errs.push(mm.text()); });
await pg.goto(base + '/');
check('signed out: the page asks for the token and has no app in it', (await pg.locator('input[name=token]').count()) === 1 && (await pg.locator('.sidebar').count()) === 0);
await pg.fill('input[name=token]', 'wrong'); await pg.click('button[type=submit]'); await pg.waitForSelector('.err');
check('a wrong token is refused', (await pg.textContent('body')).includes('not right'));
await pg.goto(base + '/'); await pg.fill('input[name=token]', TOKEN); await pg.click('button[type=submit]');
await pg.waitForSelector('.dir-list');
const html = await pg.content();
check('signed in: the app loads connected to the server, and the token is not in the page', (await pg.textContent('.crumbs')).includes('My Hosted Vault') && !html.includes(TOKEN));
const cookies = await pg.context().cookies();
check('the session cookie is HttpOnly and SameSite=Strict', cookies.some(c => c.name === 'dmf_session' && c.httpOnly && c.sameSite === 'Strict'));

await pg.click('.dir-row:has-text("Ashfall")');
await pg.click('text=Use “Ashfall” as the campaign');
await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');
check('the campaign loads from the database', (await pg.textContent('.nav-btn:has-text("NPCs")')).includes('4'));
await pg.click('.nav-btn:has-text("Maps")'); await pg.waitForSelector('.thumb img[src^="blob:"]');
check('map images load from the database', true);

// edit + push
const before = await (await api('read', 'Ashfall/NPCs/Old Tam.md')).text();
await pg.click('.nav-btn:has-text("NPCs")'); await pg.click('.list-item:has-text("Old Tam")');
await pg.click('.note-head button:text-is("Edit")'); await pg.fill('.card input >> nth=0', 'Human'); await pg.click('text=Save to pending changes');
check('the database is untouched before push', !(await (await api('read', 'Ashfall/NPCs/Old Tam.md')).text()).includes('race: Human'));
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
const after = await (await api('read', 'Ashfall/NPCs/Old Tam.md')).text();
check('push wrote the note into the database, minimally', after === before.replace('role: Ferryman', 'role: Ferryman\nrace: Human'), JSON.stringify(after));
const hist = await (await api('history', 'Ashfall/NPCs/Old Tam.md')).json();
check('the old text is kept in the note history', hist.length === 2 && (await (await api('version', 'Ashfall/NPCs/Old Tam.md', {})).status) !== 500);

// undo the push
await pg.reload(); await pg.waitForSelector('.sidebar');
const ui = await (await api('undo-info', '')).json();
check('the server remembers the push for undo', ui.available && ui.available.written === 1);
await pg.evaluate(() => window.__dmforge.A.askUndoPush && window.__dmforge.A.askUndoPush());
await pg.waitForSelector('.modal');
await pg.click('.modal button:has-text("Undo")'); await pg.waitForFunction(async () => true);
await new Promise(r => setTimeout(r, 600));
check('undo put the note back as it was', (await (await api('read', 'Ashfall/NPCs/Old Tam.md')).text()) === before);

// conflict: the same note changes on the server while the app has a pending change
await pg.click('.nav-btn:has-text("Players")'); await pg.click('.list-item:has-text("Kestra Dune")');
await pg.click('.note-head button:text-is("Edit")'); await pg.fill('.card input >> nth=1', 'Assassin'); await pg.click('text=Save to pending changes');
const kp = 'Ashfall/Players/Kestra Dune.md';
const kText = await (await api('read', kp)).text();
await api('write', kp, { method: 'POST', body: kText + '\nEdited on another device.\n' });
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-conflict');
check('an edit made elsewhere meanwhile is flagged', (await pg.textContent('.rev-conflict')).includes('Changed in your vault'));
await pg.click('.rev-conflict label:has-text("Keep the vault")'); await pg.waitForFunction(() => !document.querySelector('#confirmPush').disabled);
await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
const kNow = await (await api('read', kp)).text();
check('the other device\'s edit survived', kNow.includes('Edited on another device') && !kNow.includes('Assassin'));

// delete -> trash table, restorable
await pg.click('.nav-btn:has-text("Plot threads")'); await pg.click('.list-item:has-text("Who Poisoned")');
await pg.click('#deleteBtn'); await pg.click('.modal button:has-text("Delete note")');
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
check('deleted note is gone from the vault but kept in the trash', (await api('read', 'Ashfall/Plot Threads/Who Poisoned the Well.md')).status === 404
  && (await (await api('trash-list', '')).json()).some(t => t.path === '.trash/Ashfall/Plot Threads/Who Poisoned the Well.md'));
check('no page errors against the hosted server', errs.length === 0, errs.join('\n'));
await pg.context().close();

// signing out and API without a cookie
check('the API refuses a request with no token', (await fetch(base + '/api/list?path=')).status === 401);
await b.close(); proc.kill();
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
