import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

/* Settings made in one place (a server called "Old") arrive in another (a server called "New") through the settings file. */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf3s-'));
const vault = path.join(tmp, 'vault'); const data = path.join(tmp, 'data');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
spawnSync('python3', ['-I', path.join(root, 'server', 'dmforge_io.py'), 'import', '--data', data, vault], { encoding: 'utf8' });
const TOKEN = 'move-test-token-0123456789';
async function server(port, name) {
  const proc = spawn('python3', ['-I', path.join(root, 'server', 'dmforge_hosted.py'), '--data', data, '--bind', '127.0.0.1', '--port', String(port), '--name', name, '--app', path.join(root, 'dist', 'DM-Forge.html')],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DMFORGE_TOKEN: TOKEN } });
  let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
  for (let i = 0; i < 60 && !/listening/.test(out); i++) await sleep(100);
  if (!/listening/.test(out)) { console.log('server did not start:\n' + out); process.exit(1); }
  return proc;
}
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
async function open(port) {
  const pg = await (await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true })).newPage();
  pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
  await pg.goto('http://127.0.0.1:' + port + '/'); await pg.fill('input[name=token]', TOKEN); await pg.click('button[type=submit]');
  await pg.waitForSelector('.dir-list');
  await pg.click('.dir-row:has-text("Ashfall")'); await pg.click('text=Use “Ashfall” as the campaign');
  await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');
  return pg;
}

/* the old place: set things the way you like them */
const oldSrv = await server(8795, 'Old');
const a = await open(8795);
await a.evaluate(() => { const A = window.__dmforge.A; A.setTheme('dark'); A.updateSetting('groupAfter', 50); A.updateSetting('sidebarAuto', true); A.setLayout('cols'); });
await a.evaluate(() => { window.__dmforge.A.openSettings('data'); });
await a.waitForSelector('#setExport');
const [dl] = await Promise.all([a.waitForEvent('download'), a.click('#setExport')]);
const file = path.join(tmp, 'settings.json'); await dl.saveAs(file);
const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
check('the file is a DM Forge settings file for the old vault', bundle.app === 'dmforge-settings' && bundle.vaultKey === 'http:Old');
check('it holds the settings that were set', JSON.parse(bundle.local['dmforge:settings']).groupAfter === 50 && bundle.local['dmforge:theme'] === 'dark');
check('it holds nothing from a moment (timer, fight, unpushed changes, device)', !Object.keys({ ...bundle.local, ...bundle.idb }).some(k => /combat|timer|pending|device|seq/.test(k)));
await a.context().close(); oldSrv.kill();

/* the new place: a different name, so a different browser store, starting empty */
const newSrv = await server(8796, 'New');
const n = await open(8796);
check('the new place starts with the default look', (await n.evaluate(() => localStorage.getItem('dmforge:theme'))) !== 'dark');
await n.evaluate(() => { window.__dmforge.A.openSettings('data'); });
await n.waitForSelector('#setImportFile', { state: 'attached' });
await n.setInputFiles('#setImportFile', file);
await n.waitForSelector('.modal');
check('it asks before replacing anything', (await n.textContent('.modal')).includes('Bring in'));
await Promise.all([n.waitForEvent('load'), n.click('.modal button:has-text("Bring them in")')]);
await n.waitForSelector('.sidebar', { timeout: 20000 });
const got = await n.evaluate(() => ({ theme: localStorage.getItem('dmforge:theme'), set: JSON.parse(localStorage.getItem('dmforge:settings') || '{}'), last: localStorage.getItem('dmforge:last-campaign:http:New'), old: Object.keys(localStorage).filter(k => k.includes('http:Old')) }));
check('the theme came across', got.theme === 'dark');
check('the other settings came across', got.set.groupAfter === 50 && got.set.sidebarAuto === true);
check('the campaign settings followed to the new vault name (and none are left under the old one)', got.last === 'Ashfall' && got.old.length === 0, JSON.stringify(got));
check('the app opened on the new settings', (await n.evaluate(() => document.documentElement.dataset.theme)) === 'dark' || (await n.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== 'rgb(255, 255, 255)');
check('no page errors', n.errs.length === 0, n.errs.join('\n'));

/* a file that is not a settings file is refused */
fs.writeFileSync(path.join(tmp, 'bad.json'), '{"hello":1}');
await n.evaluate(() => { window.__dmforge.A.openSettings('data'); });
await n.waitForSelector('#setImportFile', { state: 'attached' });
await n.setInputFiles('#setImportFile', path.join(tmp, 'bad.json'));
await sleep(400);
check('a file that is not settings is refused with a message', (await n.locator('.modal').count()) === 0 && (await n.locator('.toast, [role=status]').allTextContents()).join(' ').includes('not a DM Forge settings file'));
await b.close(); newSrv.kill();
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
