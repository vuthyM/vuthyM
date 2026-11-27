import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

/* 2.61 on the real server: ideas live on the server, a genuine clash is caught, and a server that goes away loses nothing. */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmfws-'));
const vault = path.join(tmp, 'vault'); const data = path.join(tmp, 'data');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
spawnSync('python3', ['-I', path.join(root, 'server', 'dmforge_io.py'), 'import', '--data', data, vault], { encoding: 'utf8' });
const PORT = 8798, TOKEN = 'workshop-token-0123456789abcdef';
let proc = null;
async function startServer() {
  proc = spawn('python3', ['-I', path.join(root, 'server', 'dmforge_hosted.py'), '--data', data, '--bind', '127.0.0.1', '--port', String(PORT), '--name', 'Hosted', '--app', path.join(root, 'dist', 'DM-Forge.html')],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DMFORGE_TOKEN: TOKEN } });
  let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
  for (let i = 0; i < 60 && !/listening/.test(out); i++) await sleep(100);
}
async function stopServer() { proc.kill('SIGKILL'); await new Promise(r => proc.once('exit', r)); }
await startServer();
const base = 'http://127.0.0.1:' + PORT;
const api = (op, p, init = {}) => fetch(base + '/api/' + op + '?path=' + encodeURIComponent(p), { ...init, headers: { 'X-DMF-Token': TOKEN, ...(init.headers || {}) } });
const read = async p => (await api('read', p)).text();

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 } });
await ctx.addInitScript(() => { try { localStorage.setItem('dmforge:settings', JSON.stringify({ palette: 'classic', ideasSaveSecs: 15 })); } catch (e) {} });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(base + '/'); await pg.fill('input[name=token]', TOKEN); await pg.click('button[type=submit]');
await pg.waitForSelector('.dir-list');
check('the folder picker has a Workshop button next to the Character Library', await pg.locator('#openWorkshop').count() === 1);
await pg.click('#openWorkshop'); await pg.waitForSelector('#ideas');
check('the Workshop opens before any campaign is chosen', await pg.locator('#ideasEmpty').count() === 1);
await pg.click('#ideaNewEmpty'); await pg.fill('#ideaNameInput', 'Hosted Idea'); await pg.press('#ideaNameInput', 'Enter'); await pg.waitForSelector('#ideaTitle');
check('a new idea is on the server at once', (await read('Ideas/Hosted Idea.md')).includes('# Hosted Idea'));
await pg.fill('#ta-hook', 'First thing I wrote.');
await pg.click('#ideaSaveNow'); await pg.waitForFunction(() => document.querySelector('#ideaSaveState')?.textContent.startsWith('Saved'));
check('Save now puts it on the server', (await read('Ideas/Hosted Idea.md')).includes('First thing I wrote.'));
const h1 = await (await api('history', 'Ideas/Hosted Idea.md')).json();
check('every save is a version in the history (nothing is overwritten for good)', h1.length >= 2, h1.length);

/* ---------- a real clash: someone else writes between my opening it and my save ---------- */
const t0 = await read('Ideas/Hosted Idea.md');
await api('write', 'Ideas/Hosted Idea.md', { method: 'POST', body: t0.replace('First thing I wrote.', 'Written on the Mac.') });
await pg.fill('#ta-hook', 'Written in the browser at the same time.');
await pg.click('#ideaSaveNow');
await pg.waitForSelector('#ideaConflict', { timeout: 10000 });
check('the server refuses the clash and the page offers the choice', await pg.locator('#ideaKeepBoth').count() === 1);
check('nothing was overwritten on the server', (await read('Ideas/Hosted Idea.md')).includes('Written on the Mac.') && !(await read('Ideas/Hosted Idea.md')).includes('browser at the same time'));
await pg.click('#ideaKeepMine');
await pg.waitForFunction(() => !document.querySelector('#ideaConflict') && document.querySelector('#ideaSaveState')?.textContent.startsWith('Saved'), null, { timeout: 10000 });
check('"Keep mine" saves mine over it', (await read('Ideas/Hosted Idea.md')).includes('browser at the same time'));
check('and the Mac\'s version is still in the history', (await (await api('history', 'Ideas/Hosted Idea.md')).json()).length > h1.length);
const histNow = await (await api('history', 'Ideas/Hosted Idea.md')).json();
let macKept = false;
for (const v of histNow) { const tx = await (await api('version', 'Ideas/Hosted Idea.md', {})).text().catch(() => ''); }
for (const v of histNow) { const r = await fetch(base + '/api/version?path=' + encodeURIComponent('Ideas/Hosted Idea.md') + '&v=' + v.version, { headers: { 'X-DMF-Token': TOKEN } }); if ((await r.text()).includes('Written on the Mac.')) macKept = true; }
check('(checked: that text can still be read back from its version)', macKept);

// the other way: take theirs
const t1 = await read('Ideas/Hosted Idea.md');
await api('write', 'Ideas/Hosted Idea.md', { method: 'POST', body: t1.replace('browser at the same time', 'Phone edit.') });
await pg.fill('#ta-hook', 'Another browser edit.');
await pg.click('#ideaSaveNow'); await pg.waitForSelector('#ideaConflict');
await pg.click('#ideaKeepTheirs');
await pg.waitForFunction(() => !document.querySelector('#ideaConflict'));
check('"Use the other version" shows theirs and drops mine', (await pg.inputValue('#ta-hook')) === 'Written in the Phone edit.'.replace('Written in the ', '') || (await pg.inputValue('#ta-hook')).includes('Phone edit.'), await pg.inputValue('#ta-hook'));
check('and the server is unchanged by that', (await read('Ideas/Hosted Idea.md')).includes('Phone edit.') && !(await read('Ideas/Hosted Idea.md')).includes('Another browser edit'));

/* ---------- the server goes away: nothing is lost, and it all arrives when it is back ---------- */
await stopServer();
await pg.fill('#ta-hook', 'Written while the server was down.');
await pg.fill('#ideaPitch', 'A pitch typed offline');
await pg.click('#ideaSaveNow');
await pg.waitForFunction(() => document.querySelector('#ideaSaveState')?.textContent.includes('Offline'), null, { timeout: 15000 });
check('with the server gone the page says so and keeps typing smooth', (await pg.textContent('#ideaSaveState')).includes('kept on this device'));
await pg.click('#ideaPitch'); await pg.keyboard.press('End'); await pg.keyboard.type(' more');
check('typing still works', (await pg.inputValue('#ideaPitch')).endsWith('more'));
await startServer();
await pg.waitForFunction(() => document.querySelector('#ideaSaveState')?.textContent.startsWith('Saved'), null, { timeout: 40000 });
const after = await read('Ideas/Hosted Idea.md');
check('when the server is back it saves by itself', after.includes('Written while the server was down.') && after.includes('A pitch typed offline more'), after.slice(0, 300));

/* ---------- it is a note like any other ---------- */
await pg.click('#ideaToShelf'); await pg.waitForSelector('#ideaGrid');
check('it is listed on the shelf', await pg.locator('.idea-card:has-text("Hosted Idea")').count() === 1);
const list = await (await api('list', 'Ideas')).json();
check('and it is an ordinary .md note on the server, so it is in the backups and the nightly export', list.some(e => e.name === 'Hosted Idea.md'));
const snap = await (await api('search', '', { more: '' })).json().catch(() => []);
const found = await (await fetch(base + '/api/search?q=' + encodeURIComponent('typed offline'), { headers: { 'X-DMF-Token': TOKEN } })).json();
check('and it is searchable on the server', found.some(r => r.path === 'Ideas/Hosted Idea.md'), JSON.stringify(found));
check('no page errors', errs.length === 0, errs.join('\n'));
await b.close(); proc.kill('SIGKILL');
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
