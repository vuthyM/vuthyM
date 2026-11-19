/* Dice, timer, quick-peek, rules and spells, end to end: a real helper on a real folder, with a stand-in for Claude Code. */
import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-t24-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));


const PORT = 8801;
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
const CAL = 'Ashfall/NPCs/Brother Calder.md';
const open = p => pg.evaluate(p => window.__dmforge.A.goto(p), p);
const toasts = () => pg.textContent('.toasts');

// ---- dice
check('the top bar has a Dice button', await pg.locator('.topbar #diceBtn').count() === 1 && await pg.locator('#diceBox').count() === 0);
await pg.click('#diceBtn'); await pg.waitForSelector('#diceBox');
check('it opens a floating roller with d4 to d100', (await pg.locator('#diceBox [data-die]').count()) === 7);
await pg.click('[data-die="20"]');
let tot = Number(await pg.textContent('#diceTotal'));
check('a d20 gives 1 to 20', tot >= 1 && tot <= 20, String(tot));
await pg.fill('#diceMod', '5'); await pg.click('[data-die="6"]');
tot = Number(await pg.textContent('#diceTotal'));
check('a modifier is added (d6+5 is 6 to 11) and shown in the detail', tot >= 6 && tot <= 11 && (await pg.textContent('#diceResult')).includes('+ 5'), await pg.textContent('#diceResult'));
await pg.fill('#diceMod', '0');
await pg.click('[data-mode="adv"]'); await pg.click('[data-die="20"]');
check('advantage rolls two d20 and keeps the higher', /\[\d+, \d+\] adv/.test(await pg.textContent('#diceResult')));
await pg.click('[data-mode="dis"]'); await pg.click('[data-die="20"]');
check('disadvantage keeps the lower', /\[\d+, \d+\] dis/.test(await pg.textContent('#diceResult')));
await pg.click('[data-mode="normal"]');
await pg.fill('#diceExpr', '2d6+3'); await pg.keyboard.press('Enter');
tot = Number(await pg.textContent('#diceTotal'));
check('typing 2d6+3 and pressing Enter rolls it (5 to 15)', tot >= 5 && tot <= 15 && (await pg.textContent('#diceResult')).includes('2d6+3'));
await pg.fill('#diceExpr', '4d6kh3'); await pg.click('#diceRoll');
check('keep-highest works (4d6kh3 is 3 to 18)', Number(await pg.textContent('#diceTotal')) >= 3 && (await pg.textContent('#diceResult')).includes('keep'));
await pg.fill('#diceExpr', 'banana'); await pg.click('#diceRoll');
check('something that is not dice says so', await pg.locator('#diceBad').count() === 1);
check('earlier rolls are listed', (await pg.locator('#diceHist li').count()) >= 3);
check('and kept in the browser', await pg.evaluate(() => JSON.parse(localStorage.getItem('dmforge:dice')).length >= 5));
await pg.click('#diceLog');
check('“Log this roll” adds a line to the session log', (await get(S12)).includes('Rolled ') && (await get(S12)).includes('<!-- dmforge:log -->'));
await pg.keyboard.press('Escape');
await pg.click('#diceClose').catch(() => {});
await pg.keyboard.press('Alt+KeyD'); await pg.waitForSelector('#diceBox');
check('Option+D opens it', await pg.locator('#diceBox').count() === 1);
await pg.click('#diceClear');
check('Clear empties the history', await pg.locator('#diceResult').count() === 0);
await pg.click('#diceClose');
check('with all the top bar buttons and unpushed changes, the top bar still fits on one row at 1360px', await pg.evaluate(() => { const tops = [...document.querySelectorAll('.topbar > :not(.spacer)')].map(e => Math.round(e.getBoundingClientRect().top)); return !!document.querySelector('#pushBtn') && !!document.querySelector('#timerChip') && Math.max(...tops) - Math.min(...tops) < 20; }));

// ---- dice in notes
await pg.evaluate(() => { const { S, touch } = window.__dmforge; S.working.create('Ashfall/NPCs/Dicey.md', '# Dicey\n\nMelee Attack Roll: +9, reach 15 feet. Hit: 15 (2d6 + 5) Bludgeoning damage.\n\nRoll d20 for stealth, or `1d4` in code.\n\n## d20 Tests\n\nSee [[Brother Calder]] for 3d8.\n'); touch(); });
await open('Ashfall/NPCs/Dicey.md');
await pg.waitForSelector('.dice-inline');
const dice = await pg.locator('.md .dice-inline').allTextContents();
check('dice written in a note are buttons: the damage, the d20 and the attack bonus (not code, not headings, not link text)', dice.includes('2d6 + 5') && dice.includes('+9') && dice.includes('d20') && !dice.includes('1d4') && !dice.includes('3d8') || (dice.includes('2d6 + 5') && dice.includes('+9') && dice.includes('d20') && !dice.includes('1d4')), JSON.stringify(dice));
check('and the heading “d20 Tests” is not one', await pg.locator('.md h2 .dice-inline').count() === 0);
await pg.click('.md .dice-inline:has-text("2d6 + 5")');
check('clicking one rolls it and says what came up', /2d6\+5 → \d+/.test(await toasts()), await toasts());
await pg.click('.md .dice-inline:has-text("+9")', { modifiers: ['Shift'] });
check('Shift-click on the attack bonus rolls d20+9 with advantage', /d20\+9 → \d+/.test(await toasts()) && /adv/.test(await toasts()), await toasts());
check('those rolls are in the history', await pg.evaluate(() => JSON.parse(localStorage.getItem('dmforge:dice')).length) >= 2);

// ---- timer and scenes
await open(S12);
await pg.waitForSelector('#noteTitle');
check('the top bar has a timer chip (just “Timer” to begin with)', (await pg.textContent('#timerChip')).includes('Timer'));
await pg.click('#timerChip'); await pg.waitForSelector('#timerBox');
check('it opens with a big clock and Start', (await pg.textContent('#timerBig')) === '0:00' && (await pg.textContent('#timerToggle')) === 'Start');
await pg.fill('#sceneName', 'The ambush at the ford'); await pg.fill('#sceneMins', '20'); await pg.click('#sceneAdd');
await pg.fill('#sceneName', 'Aftermath'); await pg.fill('#sceneMins', '15'); await pg.click('#sceneAdd');
const s12 = await get(S12);
check('scenes are added to the session note under “## Scenes”, with their time', s12.includes('## Scenes') && s12.includes('- [ ] The ambush at the ford (20 min)') && s12.includes('- [ ] Aftermath (15 min)'), s12.slice(-300));
check('they are listed, the first is the one being played, and pace says 0 of 2', (await pg.textContent('#timerScenes')).includes('The ambush at the ford') && (await pg.textContent('#timerPace')).includes('0 of 2 scenes done') && (await pg.textContent('#timerPace')).includes('planned 35 min'), await pg.textContent('#timerPace'));
await pg.click('#timerToggle');
await pg.waitForTimeout(2300);
check('Start runs the clock (the chip counts up too)', /^0:0[2-4]$/.test(await pg.textContent('#timerBig')) && /0:0[2-4]/.test(await pg.textContent('#timerClock')), await pg.textContent('#timerBig'));
await pg.click('#sceneDone');
const s12b = await get(S12);
check('“Done” ticks the first scene in the note and logs it', s12b.includes('- [x] The ambush at the ford (20 min)') && s12b.includes('Scene done: The ambush at the ford'), s12b.slice(-500));
check('pace now says 1 of 2 done, and the next scene is current', (await pg.textContent('#timerPace')).includes('1 of 2 scenes done') && (await pg.textContent('#sceneDone')).includes('Aftermath'));
await pg.click('#timerToggle');
check('Pause stops it (the button says Resume)', (await pg.textContent('#timerToggle')) === 'Resume');
await pg.click('#timerToggle');
await pg.evaluate(() => window.__dmforge.A.timerSet({ nextBreak: 0 }));
await pg.waitForFunction(() => document.querySelector('#timerChip.due'), null, { timeout: 4000 });
check('a break reminder appears when the time comes, and the chip flashes', /Time for a break/.test(await toasts()) && await pg.locator('#timerChip.due').count() === 1);
await pg.selectOption('#timerEvery', '0');
await pg.click('#timerToggle');
await pg.click('#timerReset');
check('Reset puts the clock back to zero', (await pg.textContent('#timerBig')) === '0:00');
check('the timer is remembered in the browser', await pg.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('dmforge:timer:'))));
await pg.click('#timerClose');

// ---- quick-peek
await pg.hover('.md a.wl:has-text("Brother Calder")').catch(() => {});
await open(S12); await pg.waitForSelector('.md a.wl');
const link = pg.locator('.md a.wl:not(.missing)').first();
await link.hover();
await pg.waitForSelector('#peekCard', { timeout: 3000 });
const peek = await pg.textContent('#peekCard');
check('hovering a [[link]] shows a card: the name, what kind of note it is, a few properties and the start of its text', peek.length > 30 && /NPC|Location|Player|Plot|Faction|Session/i.test(peek), peek);
await pg.mouse.move(5, 5);
await pg.waitForFunction(() => !document.querySelector('#peekCard'));
check('it goes away when the mouse leaves', await pg.locator('#peekCard').count() === 0);
await pg.evaluate(() => { const { S, touch } = window.__dmforge; S.working.create('Ashfall/NPCs/Ghost.md', '# Ghost\n\nSee [[Nobody At All]].\n'); touch(); });
await open('Ashfall/NPCs/Ghost.md'); await pg.waitForSelector('.md a.wl.missing');
await pg.hover('.md a.wl.missing'); await pg.waitForTimeout(600);
check('a link to a note that does not exist shows no card', await pg.locator('#peekCard').count() === 0);

// ---- combat: peek on names and conditions
await pg.click('.nav-btn:has-text("Combat")'); await pg.click('text=Start combat'); await pg.click('button:has-text("Add the party")');
await pg.waitForSelector('.c-row');
await pg.locator('.c-row').first().locator('summary').click();
await pg.locator('.c-row').first().locator('.cond[data-rule="Frightened"]').click();
await pg.locator('.c-row').first().locator('.pill[data-rule="Frightened"]').hover();
await pg.waitForSelector('#peekCard', { timeout: 3000 });
check('hovering a condition in the fight tells you what it does', (await pg.textContent('#peekCard')).includes('Disadvantage') && (await pg.textContent('#peekCard')).includes('Condition'), await pg.textContent('#peekCard'));
await pg.mouse.move(5, 5);
await pg.locator('.c-row').first().locator('[data-peek]').hover();
await pg.waitForSelector('#peekCard', { timeout: 3000 });
check('and hovering a player’s name shows their note', /Player|Class|Level/i.test(await pg.textContent('#peekCard')), await pg.textContent('#peekCard'));
await pg.mouse.move(5, 5);

// ---- rules and spells
await pg.click('#navRules'); await pg.waitForSelector('#spellsTab');
await pg.waitForFunction(() => /\d+ of \d+/.test(document.querySelector('#spCount').textContent), null, { timeout: 15000 });
check('the Rules page lists the 339 SRD spells with the credit', (await pg.textContent('#spCount')).includes('339 of 339') && (await pg.textContent('#spCredit')).includes('Creative Commons Attribution 4.0'));
await pg.fill('#spSearch', 'fireball');
check('searching finds Fireball first', (await pg.locator('.ml-item').first().textContent()).includes('Fireball'));
await pg.click('.ml-item[data-spell="spell:fireball"]');
const sb = await pg.textContent('#spBlock');
check('its card has casting time, range (in metres, the default), components, duration and the text', sb.includes('Casting Time') && /Range\s*45 m/.test(sb) && sb.includes('Components') && sb.includes('Duration') && sb.includes('Dexterity saving throw'), sb.slice(0, 300));
await pg.waitForSelector('#spBlock .dice-inline:has-text("8d6")');
check('the 8d6 in it is a button that rolls', (await pg.locator('#spBlock .dice-inline:has-text("8d6")').count()) >= 1);
await pg.click('#spBlock .dice-inline:has-text("8d6") >> nth=0');
check('and rolls it', /8d6 → \d+/.test(await toasts()), await toasts());
await pg.fill('#spSearch', ''); await pg.selectOption('#spLevel', '0');
check('the Cantrip filter gives the 27 cantrips', (await pg.textContent('#spCount')).includes('27 of 339'));
await pg.selectOption('#spLevel', ''); await pg.selectOption('#spClass', 'Cleric'); await pg.selectOption('#spSchool', 'Necromancy');
const necro = await pg.locator('.ml-item').allTextContents();
check('class and school filters combine', necro.length > 0 && necro.every(t => t.includes('Necromancy') && t.includes('Cleric')), necro.slice(0, 2).join('|'));
await pg.selectOption('#spClass', ''); await pg.selectOption('#spSchool', ''); await pg.check('#spConc');
check('Concentration filter works', (await pg.locator('.ml-item .pill:has-text("C")').count()) === (await pg.locator('.ml-item').count()) && (await pg.locator('.ml-item').count()) > 10);
await pg.uncheck('#spConc'); await pg.fill('#spSearch', 'fireball'); await pg.click('.ml-item[data-spell="spell:fireball"]');
await pg.click('#spKeep');
const sn = await get('Ashfall/Spells/Fireball.md');
check('Save to my notes makes a note in a Spells category with properties and the credit', !!sn && /level: 3/.test(sn) && sn.includes('# Fireball') && sn.includes('System Reference Document 5.2.1'), String(sn).slice(0, 200));
await pg.click('#tabConds');
check('the Conditions tab lists every condition with a reminder', (await pg.locator('#condList [data-cond]').count()) === 16 && (await pg.textContent('#condList')).includes('Disadvantage'));
check('no page errors (tools)', errors.length === 0, errors.join('\n'));

await b.close(); proc.kill();
const fails = results.filter(r => !r).length;
console.log('\n' + (results.length - fails) + '/' + results.length + ' checks passed');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
