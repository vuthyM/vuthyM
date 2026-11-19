/* Secrets and clues, spotlight, clocks and standing, name checker, end to end: a real helper on a real folder, with a stand-in for Claude Code. */
import { chromium } from '../../jsd/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-s25-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));


const PORT = 8803;
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


const S12 = 'Ashfall/Sessions/2026-10-12 Session 12.md';
const CL = 'Ashfall/Clocks and Standing.md';
const open = p => pg.evaluate(p => window.__dmforge.A.goto(p), p);
const toasts = () => pg.textContent('.toasts');

// ---- secrets and clues
await pg.click('#navSecrets'); await pg.waitForSelector('#secAddForm');
check('the Secrets page starts empty and explains itself', await pg.locator('#secNone').count() === 1);
await pg.fill('#secText', 'The ferryman sold the bells'); await pg.fill('#secClues', 'Old Tam’s ledger; the missing rope');
await pg.selectOption('#secTarget', S12);
await pg.click('#secAdd');
let s12 = await get(S12);
check('adding one writes a task under “## Secrets and clues” in that session note, with its clues after a dash', s12.includes('## Secrets and clues') && s12.includes('- [ ] The ferryman sold the bells — Old Tam’s ledger; the missing rope'), s12.slice(-300));
check('it is listed with its clues, and warned about having only 2 of 3 ways to be found', (await pg.textContent('[data-secret="The ferryman sold the bells"]')).includes('Old Tam’s ledger') && (await pg.textContent('[data-secret="The ferryman sold the bells"] [data-thin]')).includes('2 of 3'));
await pg.fill('#secText', 'Brother Calder is hiding someone'); await pg.fill('#secClues', 'fresh candles; dry floor; Mireille’s suppers'); await pg.click('#secAdd');
check('a secret with three clues has no warning', await pg.locator('[data-secret="Brother Calder is hiding someone"] [data-thin]').count() === 0);
await pg.click('[aria-label="Revealed: The ferryman sold the bells"]');
s12 = await get(S12);
check('ticking it marks it revealed in the note, with the session it was revealed in', /- \[x\] The ferryman sold the bells — Old Tam’s ledger; the missing rope \(revealed in \[\[2026-10-12 Session 12\]\]\)/.test(s12), s12.slice(-400));
check('and adds a Reveal line to the session log', /#reveal Revealed: The ferryman sold the bells/.test(s12));
check('revealed ones are hidden by default', await pg.locator('[data-secret="The ferryman sold the bells"]').count() === 0);
await pg.uncheck('#secHide');
check('unless you ask to see them', await pg.locator('[data-secret="The ferryman sold the bells"].done').count() === 1 && (await pg.textContent('[data-secret="The ferryman sold the bells"]')).includes('revealed in'));
await pg.click('[aria-label="Revealed: The ferryman sold the bells"]');
check('unticking puts it back', !(await get(S12)).includes('(revealed in') && (await get(S12)).includes('- [ ] The ferryman sold the bells'));
await pg.click('[aria-label="Revealed: The ferryman sold the bells"]');

// ---- spotlight
await pg.click('#navParty'); await pg.waitForSelector('#spotlightCard');
check('the Party page has a Spotlight card with every player', (await pg.locator('#spotlightCard [data-spot]').count()) === 3);
await pg.fill('#spotWhat', 'picked the lock');
await pg.click('[data-spot-add="Kestra Dune"]');
s12 = await get(S12);
check('+ Moment logs a Spotlight line naming the player', /#spotlight \[\[Kestra Dune\]\] picked the lock/.test(s12), s12.slice(-400));
check('and her row counts it, while the others stay flagged as quiet', (await pg.textContent('[data-spot="Kestra Dune"]')).includes('1') && await pg.locator('[data-spot="Kestra Dune"].quiet').count() === 0 && await pg.locator('[data-spot="Bram Ironhollow"].quiet').count() === 1 && await pg.locator('[data-spot="Sorrel Vance"].quiet').count() === 1);
await pg.click('#logBtn'); await pg.waitForSelector('#sessionLine');
check('the log box has a Spotlight tag (Alt+7)', await pg.locator('[data-log-tag="spotlight"]').count() === 1);
await pg.fill('#sessionLine', 'Bram talked down the guard'); await pg.keyboard.press('Alt+Digit7');
check('Alt+7 picks it', (await pg.getAttribute('[data-log-tag="spotlight"]', 'aria-pressed')) === 'true');
await pg.keyboard.press('Enter'); await pg.click('#logClose');
await pg.click('#navParty');
check('plain mentions of a first name count too', (await pg.textContent('[data-spot="Bram Ironhollow"]')).includes('1'));
await pg.evaluate(() => window.__dmforge.A.setSection('overview'));
await pg.waitForSelector('#forgetCard');
check('the Overview card lists the secret still hidden', (await pg.textContent('[data-fg="secrets"]')).includes('Brother Calder is hiding someone') && (await pg.textContent('[data-fg="secrets"]')).includes('3 of 3 clues'));
check('and the player with no spotlight moment', (await pg.textContent('[data-fg="quiet"]')).includes('Sorrel Vance') && !(await pg.textContent('[data-fg="quiet"]')).includes('Kestra'));

// ---- clocks and standing
await pg.click('#navClocks'); await pg.waitForSelector('#clocksCard');
check('the Clocks page starts empty', await pg.locator('#clocksNone').count() === 1 && await pg.locator('#standingNone').count() === 1);
await pg.fill('#clockName', 'The bells ring again'); await pg.selectOption('#clockSize', '6'); await pg.click('#clockAddBtn');
let cl = await get(CL);
check('adding a clock makes a note called “Clocks and Standing” in the campaign with the clock as a list item', !!cl && cl.includes('## Clocks') && cl.includes('- **The bells ring again** — 0/6'), String(cl));
const clock = pg.locator('[data-clock="The bells ring again"]');
for (let i = 0; i < 3; i++) await clock.locator('[aria-label^="Fill a slice"]').click();
check('+ fills slices (3/6 shown, in the pie and in the note)', (await clock.locator('[data-filled]').textContent()) === '3/6' && (await clock.locator('.pie-on').count()) === 3 && (await get(CL)).includes('— 3/6'));
await clock.locator('[aria-label^="Take a slice"]').click();
check('− takes one off', (await clock.locator('[data-filled]').textContent()) === '2/6');
await clock.locator('.clock-note').fill('The ferrymen finish the ritual'); await clock.locator('.clock-note').blur();
check('what happens when it is full is saved too', (await get(CL)).includes('— 2/6 — The ferrymen finish the ritual'));
for (let i = 0; i < 4; i++) await clock.locator('[aria-label^="Fill a slice"]').click();
check('filling the last slice says so, marks the clock, and logs it', /is full/.test(await toasts()) && await pg.locator('[data-clock="The bells ring again"].full').count() === 1 && /Clock filled: The bells ring again/.test(await get(S12)));
await clock.locator('select').selectOption('4');
check('fewer slices cap the filled ones', (await clock.locator('[data-filled]').textContent()) === '4/4' && (await get(CL)).includes('— 4/4'));
await pg.selectOption('#factionPick', 'Ember Court'); await pg.click('#factionAddBtn');
await pg.selectOption('[aria-label="Standing with Ember Court"]', '1');
cl = await get(CL);
check('a faction can be tracked, with a standing from hostile to allied, saved as a linked list item', cl.includes('## Faction standing') && cl.includes('- [[Ember Court]] — Friendly (+1)'), cl);
check('and a change of standing is logged', /Standing with Ember Court: Friendly/.test(await get(S12)));
await pg.fill('[aria-label="Note on Ember Court"]', 'They owe us a favour'); await pg.locator('[aria-label="Note on Ember Court"]').blur();
check('with a note on why', (await get(CL)).includes('Friendly (+1) — They owe us a favour'));
check('the tracked faction is no longer offered', await pg.locator('#factionPick').count() === 0);
await pg.click('[aria-label="Remove the clock The bells ring again"]');
await pg.click('[aria-label="Stop tracking Ember Court"]');
cl = await get(CL);
check('removing both leaves the note tidy', !cl.includes('The bells ring again') && !cl.includes('Ember Court') && cl.includes('_None yet._'));

// ---- name checker
await pg.evaluate(() => { window.__dmforge.S.dialog = { kind: 'new', type: 'npc' }; window.__dmforge.emit(); });
await pg.waitForSelector('#newNoteName');
await pg.fill('#newNoteName', 'Mireille Vane');
check('typing a name that a note already has says so, with a link', (await pg.textContent('#nameCheck')).includes('Already used') && (await pg.textContent('#nameCheck')).includes('Mireille Vane'));
await pg.fill('#newNoteName', 'Mireille Dunmore');
check('the same first name is flagged', (await pg.textContent('[data-nc="first"]')).includes('Mireille Vane'));
await pg.fill('#newNoteName', 'Joran Vane');
check('and the same family name', (await pg.textContent('[data-nc="last"]')).includes('Mireille Vane'));
await pg.fill('#newNoteName', 'Mireile Vain');
check('and a close spelling', (await pg.textContent('[data-nc="close"]')).includes('Mireille Vane'));
await pg.fill('#newNoteName', 'Totally Unique Zork');
check('a fresh name shows nothing', await pg.locator('#nameCheck').count() === 0);
await pg.keyboard.press('Escape');
// in the generator
await pg.click('.nav-btn:has-text("Generate")'); await pg.waitForSelector('#genHome, #genFind');
if (await pg.locator('#genHome').count()) await pg.click('#genHome');
await pg.fill('#genFind', 'NPC'); await pg.keyboard.press('Enter'); await pg.waitForSelector('[data-gen="npc"]');
const generated = (await pg.textContent('[data-gen="npc"] .gs-title')).trim();
await pg.evaluate(n => { const { S, touch } = window.__dmforge; S.working.create('Ashfall/NPCs/' + n + '.md', '# ' + n + '\n'); touch(); }, generated);
await pg.waitForSelector('[data-gen="npc"] #nameCheck');
check('a generated NPC whose name is already a note gets a warning on its sheet', (await pg.textContent('[data-gen="npc"] #nameCheck')).includes('Already used'), generated);
check('no page errors (story)', errors.length === 0, errors.join('\n'));

await b.close(); proc.kill();
const fails = results.filter(r => !r).length;
console.log('\n' + (results.length - fails) + '/' + results.length + ' checks passed');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
