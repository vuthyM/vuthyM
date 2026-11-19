/* 2.30.2: the app opens the campaign you were last in. Real helper, real folder. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-r30-'));
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

const PORT = 8817;
const proc = spawn('python3', [path.join(app, 'dmforge-server.py'), vault, '--port', String(PORT), '--no-open', '--no-update', '--downloads', dl, '--trash', trash], { env: { ...process.env, DMF_CONFIG_DIR: path.join(tmp, 'cfg') }, stdio: ['pipe', 'pipe', 'pipe'] });
process.on('exit', () => { try { proc.kill(); } catch (e) { /* gone */ } });
let out = '';
proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/\?t=/.test(out); i++) await new Promise(r => setTimeout(r, 100));
const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
if (!m) { console.log('helper did not start:\n' + out); process.exit(1); }
const link = 'http://127.0.0.1:' + m[1] + '/?t=' + m[2];

const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errors = [];
pg.on('pageerror', e => errors.push(e.message));
const settle = () => pg.waitForFunction(() => document.querySelector('.sidebar') || document.querySelector('.dir-list') || /What is in/.test(document.body.innerText), null, { timeout: 20000 });
const screenNow = () => pg.evaluate(() => window.__dmforge.S.screen);
await pg.goto(link);
await pg.waitForSelector('.dir-list');
check('the first time there is no last campaign, so the list shows', (await screenNow()) === 'browse');
await pg.click('.dir-row:has-text("Ashfall")');
await pg.click('text=Use “Ashfall” as the campaign');
await settle(); if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
await pg.waitForSelector('.sidebar');
check('it remembers the campaign opened', await pg.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('dmforge:last-campaign:') && localStorage.getItem(k) === 'Ashfall')));

await pg.goto(link);
await settle();
check('starting DM Forge again goes straight back into it, with no campaign list in between', (await screenNow()) === 'app' && (await pg.evaluate(() => window.__dmforge.S.campaign.name)) === 'Ashfall');
check('and says what it did and how to choose another', /Opened Ashfall/.test(await pg.textContent('.toasts')));

await pg.click('#campMenuBtn'); await pg.click('#campSwitch');
await pg.waitForSelector('.dir-list');
check('Switch campaign still shows the list (it does not jump back in)', (await screenNow()) === 'browse');
await pg.waitForTimeout(600);
check('and stays there', (await screenNow()) === 'browse');

// the setting
await pg.click('.dir-row:has-text("Ashfall")'); await pg.click('text=Use “Ashfall” as the campaign');
await settle(); await pg.waitForSelector('.sidebar');
await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="writing"]'); await pg.waitForSelector('#setAutoOpen');
check('Settings has "Open the campaign I was last in", on by default', await pg.isChecked('#setAutoOpen'));
await pg.uncheck('#setAutoOpen');
await pg.goto(link);
await pg.waitForSelector('.dir-list');
check('switched off, the list shows at start', (await screenNow()) === 'browse');
await pg.click('.dir-row:has-text("Ashfall")'); await pg.click('text=Use “Ashfall” as the campaign');
await settle(); await pg.waitForSelector('.sidebar');
await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="writing"]'); await pg.waitForSelector('#setAutoOpen');
await pg.check('#setAutoOpen');

// the folder is gone
fs.renameSync(path.join(vault, 'Ashfall'), path.join(vault, 'Ashfall Renamed'));
await pg.goto(link);
await pg.waitForSelector('.dir-list');
check('if the campaign folder is gone the list shows quietly, with no error', (await screenNow()) === 'browse' && !/Could not read/.test(await pg.textContent('.toasts').catch(() => '')));
check('and the memory of it is dropped', await pg.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('dmforge:last-campaign:'))));

// the practice vault never counts
await pg.goto(link);
check('no errors from the page', errors.length === 0, errors.join('\n'));
await b.close(); proc.kill();
const ok = results.filter(Boolean).length;
console.log(`${ok}/${results.length} checks passed`);
process.exit(ok === results.length ? 0 : 1);
