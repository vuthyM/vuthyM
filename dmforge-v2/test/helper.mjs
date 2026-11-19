import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url'; import http from 'node:http';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

/* ---- a real vault on disk ---- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-'));
const vault = path.join(tmp, 'My Test Vault');
const outside = path.join(tmp, 'outside'); fs.mkdirSync(outside);
fs.writeFileSync(path.join(outside, 'secret.md'), 'top secret');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
fs.symlinkSync(outside, path.join(vault, 'escape'));

/* ---- start the helper ---- */
const PORT = 8791;
const proc = spawn('python3', [path.join(root, 'helper', 'dmforge-server.py'), vault, '--port', String(PORT), '--no-open', '--no-update', '--app', path.join(root, 'dist', 'DM-Forge.html')], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DMF_CONFIG_DIR: path.join(tmp, 'cfg') } });
let out = '';
proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/\?t=/.test(out); i++) await new Promise(r => setTimeout(r, 100));
const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
if (!m) { console.log('helper did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + m[1], token = m[2];
const api = (op, p, init = {}) => fetch(base + '/api/' + op + '?path=' + encodeURIComponent(p), { ...init, headers: { 'X-DMF-Token': token, ...(init.headers || {}) } });
const rawReq = (opts) => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: +m[1], ...opts }, resp => { let b = ''; resp.on('data', d => b += d); resp.on('end', () => res({ status: resp.statusCode, body: b })); }); r.on('error', e => res({ status: 0, body: String(e) })); r.end(); });

/* ================= security and behaviour of the helper ================= */
check('no token -> 403', (await fetch(base + '/api/list?path=')).status === 403);
check('wrong token -> 403', (await fetch(base + '/api/list?path=', { headers: { 'X-DMF-Token': 'nope' } })).status === 403);
check('page without token -> 403', (await fetch(base + '/')).status === 403);
const page = await fetch(base + '/?t=' + token); const html = await page.text();
check('page with token injects the connection info', page.status === 200 && html.includes('window.__DMF_SERVER__') && /"name":\s*"My Test Vault"/.test(html));
check('wrong Host header -> 403', (await rawReq({ path: '/api/ping', headers: { Host: 'evil.example', 'X-DMF-Token': token } })).status === 403);
check('foreign Origin -> 403', (await rawReq({ path: '/api/ping', headers: { Host: '127.0.0.1:' + m[1], Origin: 'https://evil.example', 'X-DMF-Token': token } })).status === 403);
const ls = await (await api('list', '')).json();
check('lists the vault root', ls.some(e => e.name === 'Ashfall' && e.kind === 'dir'));
check('".." is refused', (await api('read', '../outside/secret.md')).status === 400 && (await api('read', 'Ashfall/../../outside/secret.md')).status === 400);
check('absolute-looking path stays inside the vault', (await api('read', '/etc/passwd')).status === 404);
check('symlink leaving the vault is refused (read)', (await api('read', 'escape/secret.md')).status === 403);
check('symlink leaving the vault is refused (write)', (await api('write', 'escape/new.md', { method: 'POST', body: 'x' })).status === 403 && !fs.existsSync(path.join(outside, 'new.md')));
check('only .md can be written', (await api('write', 'Ashfall/evil.txt', { method: 'POST', body: 'x' })).status === 400 && !fs.existsSync(path.join(vault, 'Ashfall', 'evil.txt')));
check('hidden folders are not writable', (await api('write', '.obsidian/hack.md', { method: 'POST', body: 'x' })).status === 400);
check('a refused write does not break the next request on the same connection', (await api('write', 'Ashfall/ok-after-refusal.md', { method: 'POST', body: 'fine' })).status === 200);
check('GET cannot write', (await api('write', 'Ashfall/get.md')).status === 404 && !fs.existsSync(path.join(vault, 'Ashfall', 'get.md')));
const odd = '---\r\nrole: Smith\r\n---\r\nCafé ☕ 日本語\r\n';
check('write is accepted', (await api('write', 'Ashfall/NPCs/Ünïcode — Test.md', { method: 'POST', body: odd })).status === 200);
check('bytes round-trip exactly (unicode + CRLF)', fs.readFileSync(path.join(vault, 'Ashfall/NPCs/Ünïcode — Test.md'), 'utf8') === odd && (await (await api('read', 'Ashfall/NPCs/Ünïcode — Test.md')).text()) === odd);
check('no temp files left behind', !fs.readdirSync(path.join(vault, 'Ashfall', 'NPCs')).some(f => f.includes('.dmforge-')));
check('writing creates missing folders', (await api('write', 'Brand New/Deep/Note.md', { method: 'POST', body: 'hi' })).status === 200 && fs.readFileSync(path.join(vault, 'Brand New/Deep/Note.md'), 'utf8') === 'hi');
const before = fs.readFileSync(path.join(vault, 'Ashfall/NPCs/Old Tam.md'), 'utf8');
check('trash moves the note into .trash and removes it', (await api('trash', 'Ashfall/NPCs/Old Tam.md', { method: 'POST' })).status === 200 && !fs.existsSync(path.join(vault, 'Ashfall/NPCs/Old Tam.md')) && fs.readFileSync(path.join(vault, '.trash/Ashfall/NPCs/Old Tam.md'), 'utf8') === before);
fs.writeFileSync(path.join(vault, 'Ashfall/NPCs/Old Tam.md'), 'again');
await api('trash', 'Ashfall/NPCs/Old Tam.md', { method: 'POST' });
check('trashing the same name twice keeps both copies', fs.readdirSync(path.join(vault, '.trash/Ashfall/NPCs')).filter(f => f.startsWith('Old Tam')).length === 2);
check('only .md can be trashed', (await api('trash', 'Ashfall/Maps/Greenhold Map.svg', { method: 'POST' })).status === 400 && fs.existsSync(path.join(vault, 'Ashfall/Maps/Greenhold Map.svg')));
check('svg served with the right type', (await api('read', 'Ashfall/Maps/Greenhold Map.svg')).headers.get('content-type').startsWith('image/svg+xml'));
// restore Old Tam for the UI run
fs.writeFileSync(path.join(vault, 'Ashfall/NPCs/Old Tam.md'), before);

/* ================= the whole app, running against the helper ================= */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'], env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
let pg = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
pg.on('console', mm => { if (mm.type() === 'error' && !/Failed to load resource|ERR_/.test(mm.text())) errs.push(mm.text()); });
await pg.goto(base + '/?t=' + token);
await pg.waitForSelector('.dir-list');
check('helper mode skips the welcome screen and shows the vault', (await pg.textContent('.crumbs')).includes('My Test Vault') && (await pg.locator('text=Open vault folder').count()) === 0);
await pg.click('.dir-row:has-text("Ashfall")');
await pg.click('text=Use “Ashfall” as the campaign');
await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');
check('campaign loads through the helper (5 NPCs: 4 demo + the one the API test added)', (await pg.textContent('.nav-btn:has-text("NPCs")')).includes('5'));
await pg.click('.nav-btn:has-text("Maps")'); await pg.waitForSelector('.thumb img[src^="blob:"]');
check('map image loads through the helper', true);
await pg.click('.nav-btn:has-text("NPCs")'); await pg.click('.list-item:has-text("Old Tam")');
await pg.click('.note-head button:text-is("Edit")'); await pg.fill('.card input >> nth=0', 'Human'); await pg.click('text=Save to pending changes');
check('vault on disk untouched before push', !fs.readFileSync(path.join(vault, 'Ashfall/NPCs/Old Tam.md'), 'utf8').includes('race: Human'));
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
check('push wrote the file on disk, minimally', fs.readFileSync(path.join(vault, 'Ashfall/NPCs/Old Tam.md'), 'utf8') === before.replace('role: Ferryman', 'role: Ferryman\nrace: Human'), JSON.stringify(fs.readFileSync(path.join(vault, 'Ashfall/NPCs/Old Tam.md'), 'utf8')));
// conflict: edit the same note on disk while the app has a pending change
await pg.click('.nav-btn:has-text("Players")'); await pg.click('.list-item:has-text("Kestra Dune")');
await pg.click('.note-head button:text-is("Edit")'); await pg.fill('.card input >> nth=1', 'Assassin'); await pg.click('text=Save to pending changes');
const kp = path.join(vault, 'Ashfall/Players/Kestra Dune.md');
fs.writeFileSync(kp, fs.readFileSync(kp, 'utf8') + '\nEdited in Obsidian.\n');
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-conflict');
check('edit made on disk meanwhile is flagged', (await pg.textContent('.rev-conflict')).includes('Changed in your vault'));
await pg.click('.rev-conflict label:has-text("Keep the vault")'); await pg.waitForFunction(() => !document.querySelector('#confirmPush').disabled);
await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
check('the Obsidian edit survived', fs.readFileSync(kp, 'utf8').includes('Edited in Obsidian') && !fs.readFileSync(kp, 'utf8').includes('Assassin'));
// delete -> .trash
await pg.click('.nav-btn:has-text("Plot threads")'); await pg.click('.list-item:has-text("Who Poisoned")');
await pg.click('#deleteBtn'); await pg.click('.modal button:has-text("Delete note")');
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
check('deleted note moved to .trash on disk', !fs.existsSync(path.join(vault, 'Ashfall/Plot Threads/Who Poisoned the Well.md')) && fs.existsSync(path.join(vault, '.trash/Ashfall/Plot Threads/Who Poisoned the Well.md')));
// new campaign through the helper
await pg.click('#campMenuBtn'); await pg.click('#campSwitch'); await pg.waitForSelector('.dir-row:has-text("Ashfall")');
check('helper mode has no Back-to-welcome button', (await pg.locator('button:text-is("Back")').count()) === 0);
await pg.fill('input[aria-label="New campaign name"]', 'Brightwater'); await pg.click('button:has-text("Create campaign folder")');
await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');
check('new campaign created on disk with standard folders', fs.existsSync(path.join(vault, 'Brightwater/Brightwater.md')) && ['NPCs', 'Players', 'Locations', 'Factions', 'Plot Threads', 'Sessions', 'Maps'].every(f => fs.statSync(path.join(vault, 'Brightwater', f)).isDirectory()));
check('no page errors in helper mode', errs.length === 0, errs.join('\n'));
await pg.context().close();

/* ================= Brave: folder picker removed / blocked ================= */
async function bravePage(init) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(init);
  const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.goto('file://' + path.join(root, 'dist', 'DM-Forge.html'));
  return p;
}
pg = await bravePage(() => { delete window.showDirectoryPicker; navigator.brave = { isBrave: async () => true }; });
await pg.waitForSelector('#pickerHelp');
const help = await pg.textContent('#pickerHelp');
check('Brave without the picker: shows the one-time flag steps', help.includes('Brave blocks folder access') && help.includes('brave://flags/#file-system-access-api') && help.includes('Relaunch'));
check('open-folder button is disabled, not broken', await pg.isDisabled('button:has-text("Open vault folder")'));
await pg.evaluate(() => window.__dmforge.A.openPlainDemo()); await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');
check('demo + generators still work in Brave without the picker', (await pg.textContent('#overviewTitle')).length > 0);
check('no page errors (Brave, picker removed)', pg.errors.length === 0, pg.errors.join('\n'));
await pg.context().close();
pg = await bravePage(() => { window.showDirectoryPicker = () => Promise.reject(new DOMException('blocked', 'SecurityError')); navigator.brave = { isBrave: async () => true }; });
await pg.waitForSelector('button:has-text("Open vault folder")');
check('no help shown before trying', (await pg.locator('#pickerHelp').count()) === 0);
await pg.click('button:has-text("Open vault folder")');
await pg.waitForSelector('#pickerHelp');
check('Brave with a blocked picker: help appears after the attempt', (await pg.textContent('#pickerHelp')).includes('brave://flags/#file-system-access-api'));
await pg.context().close();
pg = await bravePage(() => { delete window.showDirectoryPicker; });
await pg.waitForSelector('#pickerHelp');
check('other browsers without the picker get a plain notice', (await pg.textContent('#pickerHelp')).includes('cannot open folders') && !(await pg.textContent('#pickerHelp')).includes('Relaunch'));
await pg.context().close();
pg = await bravePage(() => { window.showDirectoryPicker = () => Promise.reject(new DOMException('cancelled', 'AbortError')); });
await pg.click('button:has-text("Open vault folder")');
await new Promise(r => setTimeout(r, 300));
check('cancelling the picker does not show an error', (await pg.locator('#pickerHelp').count()) === 0);
await pg.context().close();

await b.close(); proc.kill();
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
