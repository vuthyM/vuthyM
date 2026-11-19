/* 2.30: level up, the item library and builder, and copying library characters and items into a campaign. Real helper, real folder. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';
import { fixtures } from './lib30.fixtures.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-shot-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const libDir = path.join(vault, 'Character Library', 'Characters'); fs.mkdirSync(libDir, { recursive: true });
for (const f of await fixtures()) fs.writeFileSync(path.join(libDir, f.name + '.md'), f.text);
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));


const PORT = 8815;
const app2 = app;
const proc = spawn('python3', [path.join(app2, 'dmforge-server.py'), vault, '--port', String(PORT), '--no-open', '--no-update'], { env: { ...process.env, DMF_CONFIG_DIR: path.join(tmp, 'cfg') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { proc.kill(); } catch (e) { /* gone */ } });
let out = '';
proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/\?t=/.test(out); i++) await new Promise(r => setTimeout(r, 100));
const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
if (!m) { console.log('helper did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + m[1], token = m[2];


const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', e => errors.push(e.message));
pg.on('console', msg => { if (msg.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_/.test(msg.text())) errors.push(msg.text()); });
await pg.goto(base + '/?t=' + token);
await pg.waitForSelector('.dir-list, .sidebar');
const onDisk = p => fs.existsSync(path.join(vault, p));
const read = p => fs.readFileSync(path.join(vault, p), 'utf8');
const next = async () => { await pg.click('#ccNext'); await pg.waitForTimeout(80); };
const text = sel => pg.textContent(sel);



const S = '/tmp/claude-0/-home-user-vuthyM/1d654b07-7e86-58fc-b4c9-13f1eaeef043/scratchpad/shots30/';
fs.mkdirSync(S, { recursive: true });
await pg.click('#openLibrary'); await pg.waitForSelector('[data-char="Bram Test"]');
await pg.screenshot({ path: S + '1-library.png' });
await pg.click('[data-levelup="Vex Test"]'); await pg.waitForSelector('#levelUp');
await pg.click('[data-expert="Perception"]');
await pg.screenshot({ path: S + '2-levelup-rogue.png', fullPage: true });
await pg.click('#luCancel');
await pg.click('[data-levelup="Bram Test"]'); await pg.waitForSelector('#levelUp');
await pg.click('[data-asimode="asi"]'); await pg.click('[data-asiplus="4Str"]');
await pg.screenshot({ path: S + '3-levelup-fighter.png', fullPage: true });
await pg.click('#luCancel');
await pg.click('#libTabItems'); await pg.waitForSelector('#itemNew');
await pg.screenshot({ path: S + '4-items-empty.png' });
await pg.click('#itemSrd'); await pg.waitForSelector('[data-srd]'); await pg.fill('#srdSearch', 'cloak'); await pg.click('[data-srd="Cloak of Protection"]');
await pg.screenshot({ path: S + '5-srd.png' });
await pg.click('#srdUse'); await pg.waitForSelector('#itemBuilder');
await pg.screenshot({ path: S + '6-builder.png', fullPage: true });
await b.close(); proc.kill();
