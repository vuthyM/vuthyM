/* Renaming notes, end to end: a real helper on a real folder, with a stand-in for Claude Code. */
import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-ren-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));


const PORT = 8800;
const app2 = app;
const proc = spawn('python3', [path.join(app2, 'dmforge-server.py'), vault, '--port', String(PORT), '--no-open', '--no-update'], { env: { ...process.env, DMF_CONFIG_DIR: path.join(tmp, 'cfg') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { proc.kill(); } catch (e) { /* gone */ } });
let out = '';
proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/\?t=/.test(out); i++) await new Promise(r => setTimeout(r, 100));
const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
if (!m) { console.log('helper did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + m[1], token = m[2];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', e => errors.push(e.message));
pg.on('console', msg => { if (msg.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_/.test(msg.text())) errors.push(msg.text()); });
await pg.goto(base + '/?t=' + token);
await pg.waitForSelector('.dir-list, .sidebar');
if (!(await pg.locator('.sidebar').count())) {
  await pg.click('.dir-row:has-text("Ashfall")');
  await pg.click('text=Use “Ashfall” as the campaign');
  await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
  if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
  await pg.waitForSelector('.sidebar');
}
const get = p => pg.evaluate(p => window.__dmforge.S.working.get(p), p);
const comb = () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__dmforge.S.combat)));
const row = name => pg.locator('.c-row', { hasText: name });
const amt = async (name, n) => { await row(name).locator('input[aria-label^="Amount"]').fill(String(n)); };


const CAL = 'Ashfall/NPCs/Brother Calder.md', TAM = 'Ashfall/NPCs/Old Tam.md', MIR = 'Ashfall/NPCs/Mireille Vane.md';
const S12 = 'Ashfall/Sessions/2026-10-12 Session 12.md';
const paths = () => pg.evaluate(() => window.__dmforge.S.working.paths());
const open = p => pg.evaluate(p => window.__dmforge.A.goto(p), p);

await open(CAL);
await pg.waitForSelector('#renameBtn', { state: 'attached' });
check('a note has a Rename… button', await pg.locator('#renameBtn').count() === 1);
await pg.click('#renameBtn');
await pg.waitForSelector('#renameName');
check('the dialog starts with the current file name and the title heading, which follow each other', (await pg.inputValue('#renameName')) === 'Brother Calder' && (await pg.inputValue('#renameTitle')) === 'Brother Calder');
const before = await get(S12);
await pg.fill('#renameName', 'Brother Calder the Bold');
check('it says how many links in other notes would change', /\d+ links? in \d+ other notes?/.test(await pg.textContent('.modal')) && before.includes('[[Brother Calder]]'), await pg.textContent('.modal'));
check('typing a new name changes the heading with it, and shows the new file name', (await pg.inputValue('#renameTitle')) === 'Brother Calder the Bold' && (await pg.textContent('#renamePath')).includes('Brother Calder the Bold.md'));
await pg.click('#renameGo');
await pg.waitForFunction(() => !document.querySelector('.modal'));
const NEW = 'Ashfall/NPCs/Brother Calder the Bold.md';
let ps = await paths();
check('the note has the new file name and the old one is staged for removal', ps.includes(NEW) && (await pg.evaluate(p => window.__dmforge.S.working.pending.get(p), CAL)).kind === 'delete');
const nt = await get(NEW);
check('its heading changed and the rest of it did not', nt.includes('# Brother Calder the Bold') && nt.includes('**Race:** Human') && !nt.includes('# Brother Calder\n'));
check('links in other notes follow (the session note)', (await get(S12)).includes('[[Brother Calder the Bold]]') && !(await get(S12)).includes('[[Brother Calder]]'));
check('the page you were on moved with it, and shows the new name', (await pg.textContent('#noteTitle')) === 'Brother Calder the Bold');
check('the Push button counts the renamed note', /Push \d+ change/.test(await pg.textContent('#pushBtn')));

// refusals
await pg.click('#renameBtn'); await pg.waitForSelector('#renameName');
await pg.fill('#renameName', 'old tam');
check('a name another note already has is refused, with the reason', (await pg.textContent('#renameError')).includes('already a note called') && await pg.isDisabled('#renameGo'));
await pg.fill('#renameName', 'BROTHER CALDER THE BOLD');
check('a change of capital letters only is refused (it would not save safely on a Mac)', (await pg.textContent('#renameError')).includes('capital letters'));
await pg.fill('#renameName', '   ');
check('an empty name is refused', await pg.isDisabled('#renameGo'));
await pg.fill('#renameName', 'a/b:c?');
check('characters a file name cannot have are removed (abc)', (await pg.textContent('#renamePath')).includes('abc.md'));
await pg.keyboard.press('Escape');

// F2, double-click, and keeping the old name as the words shown
await pg.keyboard.press('F2');
await pg.waitForSelector('#renameName');
check('F2 opens it for the note you are looking at', (await pg.inputValue('#renameName')) === 'Brother Calder the Bold');
await pg.keyboard.press('Escape');
await pg.waitForFunction(() => !document.querySelector('.modal'));          // the first dialog must be gone, or the next wait finds it again
await open(TAM);
await pg.waitForFunction(() => (document.querySelector('#noteTitle') || {}).textContent === 'Old Tam');
await pg.waitForTimeout(400);
await pg.evaluate(() => document.querySelector('#noteTitle').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
await pg.waitForSelector('#renameName');
check('double-clicking the title opens it too', (await pg.inputValue('#renameName')) === 'Old Tam', await pg.inputValue('#renameName') + ' / title ' + await pg.textContent('.modal h3'));
await pg.fill('#renameName', 'Tam the Ferryman');
await pg.check('#renameAlias');
await pg.click('#renameGo'); await pg.waitForFunction(() => !document.querySelector('.modal'));
const linksTam = Object.values(await pg.evaluate(() => Object.fromEntries(window.__dmforge.S.working.paths().map(p => [p, window.__dmforge.S.working.get(p)])))).join('\n');
check('with “keep the old name” the links become [[New|Old]], so other notes still read the same', linksTam.includes('[[Tam the Ferryman|Old Tam]]') && !linksTam.includes('[[Old Tam]]'));

// only the heading
await open(MIR);
await pg.waitForSelector('#renameBtn', { state: 'attached' }); await pg.click('#renameBtn'); await pg.waitForSelector('#renameTitle');
await pg.fill('#renameTitle', 'Mireille “Mire” Vane');
check('changing only the heading leaves the file name and links alone', (await pg.textContent('.modal')).includes('Rename') && await pg.locator('#renameLinks').count() === 0);
await pg.click('#renameGo'); await pg.waitForFunction(() => !document.querySelector('.modal'));
check('the heading is changed and the file stays', (await get(MIR)).includes('# Mireille “Mire” Vane') && (await paths()).includes(MIR));

// the vault
await pg.click('#pushBtn');
await pg.waitForSelector('#confirmPush');
await pg.click('#confirmPush');
await pg.waitForFunction(() => !document.querySelector('#confirmPush') || /Done|written|Close/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
await pg.waitForTimeout(800);
const onDisk = p => fs.existsSync(path.join(vault, p));
check('after a push the file really is renamed on disk and the old one is gone', onDisk(NEW) && !onDisk(CAL) && onDisk('Ashfall/NPCs/Tam the Ferryman.md') && !onDisk(TAM), JSON.stringify([onDisk(NEW), onDisk(CAL), onDisk('Ashfall/NPCs/Tam the Ferryman.md'), onDisk(TAM)]));
check('and the note that linked to it was rewritten on disk', fs.readFileSync(path.join(vault, S12), 'utf8').includes('[[Brother Calder the Bold]]'));
check('no page errors (rename)', errors.length === 0, errors.join('\n'));

await b.close(); proc.kill();
const fails = results.filter(r => !r).length;
console.log('\n' + (results.length - fails) + '/' + results.length + ' checks passed');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
