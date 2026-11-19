/* The party and the encounter budget, end to end: a real helper on a real folder, with a stand-in for Claude Code. */
import { chromium } from '../../jsd/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-party-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));


const PORT = 8798;
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
const players = ['Kestra Dune', 'Bram Ironhollow', 'Sorrel Vance'];
const prow = n => pg.locator('tr[data-player="' + n + '"]');

await pg.click('#navParty');
await pg.waitForSelector('#ptColumns'); if (await pg.locator('#ptColumns').getAttribute('aria-pressed') !== 'true') await pg.click('#ptColumns');
await pg.waitForSelector('#partyCard');
check('the sidebar has a Party page, listing the three players', (await pg.locator('tr[data-player]').count()) === 3);
check('it starts with the newest session, and everyone here', (await pg.inputValue('#ptSession')) === S12 && (await pg.locator('input[data-here]:checked').count()) === 3);
// players with no level: asked for right there
await pg.evaluate(() => { const { S, touch } = window.__dmforge; S.working.create('Ashfall/Players/Levelless Lou.md', '---\nclass: Fighter\n---\n# Levelless Lou\n'); touch(); });
await pg.waitForSelector('tr[data-player="Levelless Lou"]');
check('a player with no level is asked for in the budget card (not just left out)', await pg.locator('#ebNoLevel input[data-nolevel]').count() === 1 && (await pg.textContent('#ebNoLevel')).includes('Levelless Lou'));
await pg.fill('[data-nolevel="Levelless Lou"]', '7'); await pg.locator('[data-nolevel="Levelless Lou"]').blur();
check('setting it there saves the level on the note and shows it in the table; the prompt goes away', /level: 7/.test(await get('Ashfall/Players/Levelless Lou.md')) && (await prow('Levelless Lou').locator('[data-pt="level"]').inputValue()) === '7' && await pg.locator('#ebNoLevel').count() === 0);
await pg.evaluate(() => window.__dmforge.A.deleteNote('Ashfall/Players/Levelless Lou.md'));
await pg.waitForFunction(() => !document.querySelector('tr[data-player="Levelless Lou"]'));
// edit numbers
await prow('Kestra Dune').locator('[data-pt="level"]').fill('5'); await prow('Kestra Dune').locator('[data-pt="level"]').blur();
await prow('Bram Ironhollow').locator('[data-pt="level"]').fill('5'); await prow('Bram Ironhollow').locator('[data-pt="level"]').blur();
await prow('Sorrel Vance').locator('[data-pt="level"]').fill('4'); await prow('Sorrel Vance').locator('[data-pt="level"]').blur();
check('Sorrel keeps her stats in the text (Level:: 5): editing her level changes that line, with no property added', (await get('Ashfall/Players/Sorrel Vance.md')).includes('Level:: 4') && !/^level:/m.test(await get('Ashfall/Players/Sorrel Vance.md')));
await prow('Kestra Dune').locator('[data-pt="gold"]').fill('1250'); await prow('Kestra Dune').locator('[data-pt="gold"]').blur();
await prow('Kestra Dune').locator('[data-pt="perception"]').fill('14'); await prow('Kestra Dune').locator('[data-pt="perception"]').blur();
const kes = await get('Ashfall/Players/Kestra Dune.md');
check('typing a number saves it as a property on the player’s note', /level: 5/.test(kes) && /gold: 1250/.test(kes) && /perception: 14/.test(kes), kes.slice(0, 300));
check('the footer sums the gold and averages the level of those here', (await pg.textContent('#ptGold')).includes('1,250') && (await pg.textContent('#ptAvg')).includes('avg 4.7'), await pg.textContent('#ptAvg'));
await prow('Kestra Dune').locator('[data-pt="gold"]').fill(''); await prow('Kestra Dune').locator('[data-pt="gold"]').blur();
check('emptying a box removes the property', !/gold:/.test(await get('Ashfall/Players/Kestra Dune.md')));

// the budget
check('three level-5/5/4 characters make a budget from the 2024 table (500+500+250 low, 750+750+375 moderate, 1100+1100+500 high)', (await pg.textContent('#ebTiers')).includes('1,250') && (await pg.textContent('#ebTiers')).includes('1,875') && (await pg.textContent('#ebTiers')).includes('2,700'), await pg.textContent('#ebTiers'));
check('it says how many characters and which levels', (await pg.textContent('#ebParty')).includes('3') && (await pg.textContent('#ebParty')).includes('level 4, 5'));
await pg.waitForFunction(() => !/Unpacking/.test(document.querySelector('#ebSearch').placeholder), null, { timeout: 15000 });
await pg.fill('#ebSearch', 'goblin warrior');
const hit = pg.locator('[data-add="srd:goblin-warrior"]');
check('searching offers monsters with their CR and XP and how many fit each tier', (await hit.textContent()).includes('CR 1/4') && (await hit.textContent()).includes('50 XP') && (await hit.textContent()).includes('fits: 25 low · 37 moderate · 54 high'), await hit.textContent());
for (let i = 0; i < 6; i++) await hit.click();
check('adding it six times totals 300 XP: Low', (await pg.textContent('#ebTotal')).includes('300') && (await pg.textContent('#ebDiff')) === 'Low' && (await pg.textContent('[data-eb="srd:goblin-warrior"] [data-qty]')) === '6');
await pg.fill('#ebSearch', 'ogre'); 
const ogre = pg.locator('[data-add^="srd:ogre"]').first(); const ogreKey = await ogre.getAttribute('data-add');
await ogre.click(); await ogre.click();
const ogreXp = await pg.evaluate(k => { const n = document.querySelector('[data-eb="' + k + '"] td:nth-child(3)'); return n ? Number(n.textContent.replace(/,/g, '')) : null; }, ogreKey);
const expectTotal = 300 + 2 * ogreXp;
const diffNow = await pg.textContent('#ebDiff');
const expectDiff = expectTotal <= 1250 ? 'Low' : expectTotal <= 1875 ? 'Moderate' : expectTotal <= 2700 ? 'High' : 'Beyond High';
check('two ogres on top: the total and the difficulty follow the budget', (await pg.textContent('#ebTotal')).replace(/,/g, '').includes(String(expectTotal)) && diffNow === expectDiff, (await pg.textContent('#ebTotal')) + ' ' + diffNow + ' want ' + expectTotal + ' ' + expectDiff);
await pg.click('[data-eb="' + ogreKey + '"] button[aria-label^="One more"]');
check('+ and − change the number; Remove takes it out', (await pg.textContent('[data-eb="' + ogreKey + '"] [data-qty]')) === '3');
await pg.click('[data-eb="' + ogreKey + '"] button[aria-label^="Remove"]');
check('after removing the ogres only the goblins are left', (await pg.locator('#ebList tbody tr').count()) === 1);

// someone away
await prow('Sorrel Vance').locator('[data-here]').uncheck();
const sess = await get(S12);
check('unticking someone saves an absent list on the session note', /absent:\n\s+- Sorrel Vance/.test(sess), sess.slice(0, 200));
check('and the budget drops their share (now 1000 low, 1500 moderate, 2200 high)', (await pg.textContent('#ebTiers')).includes('1,000') && (await pg.textContent('#ebTiers')).includes('1,500') && (await pg.textContent('#ebTiers')).includes('2,200'), await pg.textContent('#ebTiers'));
check('the row is greyed out and the footer counts those here', await prow('Sorrel Vance').evaluate(e => e.classList.contains('away')) && (await pg.textContent('#partyCard')).includes('2 of 3 here'));
// extras
await pg.fill('#ebExtraN', '1'); await pg.fill('#ebExtraL', '5');
check('an extra character of level 5 adds a share (now 1500 low)', (await pg.textContent('#ebTiers')).includes('1,500'), await pg.textContent('#ebTiers'));
await pg.fill('#ebExtraN', '0');

// refresh keeps the encounter; the monster library and combat
await pg.click('.nav-btn:has-text("Combat")');
await pg.click('.nav-btn:has-text("Party")');
check('the encounter you built is still there after visiting another page', (await pg.locator('#ebList tbody tr').count()) === 1);
await pg.click('#ebSend');
await pg.waitForSelector('#combatList');
const cmb = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__dmforge.S.combat)));
check('Send to combat starts a fight with six goblins, initiative rolled', cmb.combatants.filter(c => /^Goblin Warrior/.test(c.name)).length === 6 && cmb.combatants.every(c => typeof c.init === 'number'));
// the party button in combat skips the one who is away
await pg.click('button:has-text("Add the party")');
const names = (await pg.evaluate(() => window.__dmforge.S.combat.combatants.filter(c => c.pc).map(c => c.name)));
check('Add the party in Combat leaves out the one who is away', names.length === 2 && !names.includes('Sorrel Vance'), names.join());
// the saved encounter is remembered across a reload
await pg.reload();
await pg.waitForSelector('.dir-list, .sidebar');
if (!(await pg.locator('.sidebar').count())) {
  await pg.click('.dir-row:has-text("Ashfall")'); await pg.click('text=Use “Ashfall” as the campaign');
  await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
  if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
  await pg.waitForSelector('.sidebar');
}
await pg.click('#navParty');
await pg.waitForSelector('#ptColumns'); if (await pg.locator('#ptColumns').getAttribute('aria-pressed') !== 'true') await pg.click('#ptColumns');
await pg.waitForSelector('#ebList');
check('the encounter is remembered after closing the page', (await pg.textContent('[data-eb="srd:goblin-warrior"] [data-qty]')) === '6');
await pg.click('#ebClear');
check('Clear empties it', await pg.locator('#ebEmpty').count() === 1 && (await pg.textContent('#ebDiff')) === 'No monsters yet');
// the empty state does not borrow the empty-state box style
const lbl = await pg.evaluate(() => { const d = document.querySelector('#ebDiff'); const f = document.querySelector('.eb-fill'); const cs = getComputedStyle(d); return { border: cs.borderTopStyle, pad: cs.paddingTop, fill: Math.round(f.getBoundingClientRect().width) }; });
check('“No monsters yet” is plain text (no dashed box) and the bar is empty', lbl.border === 'none' && lbl.pad === '0px' && lbl.fill === 0, JSON.stringify(lbl));
// writing back to a sheet that keeps its numbers in the text
await pg.evaluate(() => { const { S, touch } = window.__dmforge; S.working.create('Ashfall/Players/Inline Ina.md', '# Inline Ina\n\n- **Class:** Bard\n- **HP:** 21\n**Level:** 3\nAC:: 15\n'); touch(); });
await pg.waitForSelector('tr[data-player="Inline Ina"]');
check('a player whose numbers are written in the text is read correctly', (await prow('Inline Ina').locator('[data-pt="level"]').inputValue()) === '3' && (await prow('Inline Ina').locator('[data-pt="hp"]').inputValue()) === '21' && (await prow('Inline Ina').locator('[data-pt="ac"]').inputValue()) === '15');
await prow('Inline Ina').locator('[data-pt="level"]').fill('4'); await prow('Inline Ina').locator('[data-pt="level"]').blur();
await prow('Inline Ina').locator('[data-pt="hp"]').fill('25'); await prow('Inline Ina').locator('[data-pt="hp"]').blur();
await prow('Inline Ina').locator('[data-pt="ac"]').fill('16'); await prow('Inline Ina').locator('[data-pt="ac"]').blur();
await prow('Inline Ina').locator('[data-pt="gold"]').fill('300'); await prow('Inline Ina').locator('[data-pt="gold"]').blur();
const ina = await get('Ashfall/Players/Inline Ina.md');
check('editing changes the line on the sheet itself, and adds no duplicate property', ina.includes('**Level:** 4') && ina.includes('- **HP:** 25') && ina.includes('AC:: 16') && !/^level:/m.test(ina) && !/^hp:/m.test(ina), ina);
check('a value the sheet does not have yet (gold) is added as a property', /^---\ngold: 300\n---/.test(ina), ina.slice(0, 60));
await pg.setViewportSize({ width: 390, height: 800 });
check('on a phone-sized window nothing spills sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await pg.evaluate(() => document.documentElement.scrollWidth + ' vs ' + window.innerWidth));
await pg.setViewportSize({ width: 1360, height: 900 });
check('no page errors (party)', errors.length === 0, errors.join('\n'));

await b.close(); proc.kill();
const fails = results.filter(r => !r).length;
console.log('\n' + (results.length - fails) + '/' + results.length + ' checks passed');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
