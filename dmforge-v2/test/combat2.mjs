/* Combat polish and the monster library, end to end: a real helper on a real folder, with a stand-in for Claude Code. */
import { chromium } from '../../jsd/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-cmb-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));


const PORT = 8797;
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

await pg.click('.nav-btn:has-text("Combat")');
await pg.click('text=Start combat');
await pg.click('button:has-text("Add the party")');
await pg.waitForSelector('.c-row');
const names = (await comb()).combatants.map(c => c.name);
check('the party is in the fight', names.length === 3, names.join());
const bram = 'Bram Ironhollow';

// temporary hit points
await amt(bram, 8); await row(bram).locator('[data-temp-btn]').click();
check('Temp adds temporary hit points, shown beside the name', (await row(bram).textContent()).includes('+8 temp'));
await amt(bram, 5); await row(bram).locator('button:has-text("Damage")').click();
let c0 = (await comb()).combatants.find(c => c.name === bram);
check('damage uses them up first (3 left) and the real hit points are untouched', c0.temp === 3 && c0.hp === c0.maxHp, JSON.stringify(c0));

// death saves
await amt(bram, 99); await row(bram).locator('button:has-text("Damage")').click();
check('at 0 hit points a player shows death saves, “Dying”', await row(bram).locator('[data-death]').count() === 1 && (await row(bram).locator('[data-death]').textContent()).includes('Dying'));
await row(bram).locator('[data-ds="success"]').click(); await row(bram).locator('[data-ds="success"]').click(); await row(bram).locator('[data-ds="fail"]').click();
c0 = (await comb()).combatants.find(c => c.name === bram);
check('successes and failures are counted (2 and 1)', c0.ds.s === 2 && c0.ds.f === 1 && (await row(bram).locator('.dot.on.good').count()) === 2 && (await row(bram).locator('.dot.on.bad').count()) === 1);
await row(bram).locator('[data-ds="nat20"]').click();
c0 = (await comb()).combatants.find(c => c.name === bram);
check('a natural 20 puts them back up with 1 hit point, and the death saves go away', c0.hp === 1 && await row(bram).locator('[data-death]').count() === 0);
await amt(bram, 5); await row(bram).locator('button:has-text("Damage")').click();
await row(bram).locator('[data-ds="crit"]').click(); await row(bram).locator('[data-ds="fail"]').click();
check('three failures: Dead, and the row is greyed out as down', (await row(bram).textContent()).includes('Dead') && await row(bram).evaluate(e => e.classList.contains('down')));
await amt(bram, 5); await row(bram).locator('button:has-text("Heal")').click();
check('healing brings them back (a revival), and the death saves go away', await row(bram).locator('[data-death]').count() === 0 && ((await comb()).combatants.find(c => c.name === bram)).hp === 5 && !(await row(bram).evaluate(e => e.classList.contains('down'))));

// reaction, note, undo
const kes = 'Kestra Dune';
await row(kes).locator('[data-reaction]').click();
check('Reaction used can be ticked', (await row(kes).locator('[data-reaction]').getAttribute('aria-pressed')) === 'true');
await row(kes).locator('.c-note').fill('Concentrating on Bless');
check('a note on the creature is kept', ((await comb()).combatants.find(c => c.name === kes)).note === 'Concentrating on Bless');
const hpBefore = ((await comb()).combatants.find(c => c.name === kes)).hp;
await pg.waitForTimeout(800);
await amt(kes, 4); await row(kes).locator('button:has-text("Damage")').click();
check('damage took 4 off', ((await comb()).combatants.find(c => c.name === kes)).hp === hpBefore - 4);
await pg.click('#undoCombat');
check('Undo takes back the last change', ((await comb()).combatants.find(c => c.name === kes)).hp === hpBefore);
// turn start refreshes the reaction
const order = (await comb()).combatants;
for (let i = 0; i < order.length + 1; i++) { await pg.click('#nextTurn'); }
check('the reaction is back once their turn has come round', ((await comb()).combatants.find(c => c.name === kes)).reaction === false);

// the library
await pg.click('#addTabMonsters'); await pg.click('#openLibrary');
await pg.waitForSelector('#mlSearch');
await pg.waitForFunction(() => /\d+ of \d+/.test(document.querySelector('#mlCount').textContent), null, { timeout: 15000 });
check('the monster library lists the 331 built-in monsters', (await pg.textContent('#mlCount')).includes('331 of 331'), await pg.textContent('#mlCount'));
check('with the SRD credit', (await pg.textContent('#mlCredit')).includes('Creative Commons Attribution 4.0'));
await pg.fill('#mlSearch', 'goblin');
check('searching narrows the list', await pg.locator('.ml-item').count() >= 1 && (await pg.locator('.ml-item').first().textContent()).toLowerCase().includes('goblin'));
await pg.click('.ml-item[data-mon="srd:goblin-warrior"]');
const block = await pg.textContent('#mlBlock');
check('picking one shows its stat block (AC, HP, initiative, actions)', block.includes('AC') && block.includes('HP') && block.includes('Initiative') && block.includes('Actions'), block.slice(0, 200));
check('in metres when Settings says metric (the default)', /\b\d+(\.\d)? m\b/.test(block) && !/\bft\./.test(block.split('Traits')[0]), block.slice(0, 300));
await pg.fill('#mlHowMany', '3');
await pg.click('#mlAdd');
const gobs = (await comb()).combatants.filter(c => /^Goblin Warrior/.test(c.name));
check('Add puts that many in the fight, named 1 to 3, with AC, HP and rolled initiative', gobs.length === 3 && gobs[0].hp === 10 && gobs[0].ac > 0 && gobs.every(g => g.mon === 'srd:goblin-warrior' && typeof g.init === 'number'), JSON.stringify(gobs[0]));
// filters
await pg.fill('#mlSearch', '');
await pg.selectOption('#mlCrMin', '10');
await pg.selectOption('#mlType', 'dragon');
const dragons = await pg.locator('.ml-item').allTextContents();
check('CR and type filters work together', dragons.length > 3 && dragons.every(t => /dragon/i.test(t)) && dragons.every(t => { const m = /CR (\S+)/.exec(t); return m && Number(m[1]) >= 10; }), dragons.slice(0, 3).join(' | '));
await pg.selectOption('#mlCrMin', ''); await pg.selectOption('#mlType', '');
await pg.fill('#mlSearch', 'adult red dragon');
await pg.click('.ml-item[data-mon="srd:adult-red-dragon"]');
await pg.fill('#mlHowMany', '1');
await pg.click('#mlAdd');
const drow = row('Adult Red Dragon');
await drow.waitFor();
check('a dragon comes with legendary actions and its recharge ability', await drow.locator('[data-leg]').count() === 1 && (await drow.locator('[data-leg]').textContent()).includes('3/3') && await drow.locator('[data-use]').count() >= 1);
// roll HP
await pg.fill('#mlSearch', 'wolf'); await pg.click('.ml-item[data-mon="srd:wolf"]');
await pg.check('#mlRoll'); await pg.fill('#mlHowMany', '4'); await pg.click('#mlAdd');
const wolves = (await comb()).combatants.filter(c => /^Wolf/.test(c.name));
check('Roll HP gives each its own roll, within the dice', wolves.length === 4 && wolves.every(w => w.hp >= 4 && w.hp <= 18 && w.hp === w.maxHp), wolves.map(w => w.hp).join());
await pg.uncheck('#mlRoll');
// save to the bestiary
await pg.fill('#mlSearch', 'aboleth'); await pg.click('.ml-item[data-mon="srd:aboleth"]');
await pg.click('#mlKeep');
const note = await get('Ashfall/Bestiary/Aboleth.md');
check('Save to Bestiary makes an editable note in a Bestiary category, with properties and the credit', !!note && /cr: "?10"?/.test(note) && /ac: 17/.test(note) && note.includes('# Aboleth') && note.includes('System Reference Document 5.2.1'), String(note).slice(0, 300));
await pg.waitForFunction(() => document.querySelector('.ml-item[data-mon^="note:"]'));
check('it then shows up in the library as yours', (await pg.locator('.ml-item[data-mon^="note:"]').first().textContent()).includes('Mine'));
await pg.click('.ml-item[data-mon^="note:"]');
await pg.fill('#mlHowMany', '1');
await pg.click('#mlAdd');
const ab = (await comb()).combatants.find(c => c.name === 'Aboleth');
check('adding from your own note uses its properties (HP 150, AC 17)', !!ab && ab.hp === 150 && ab.ac === 17 && ab.mon.startsWith('note:'), JSON.stringify(ab));
await pg.click('.modal .modal-actions button:has-text("Done")');
// the stat block from the tracker
await row('Adult Red Dragon').locator('[data-statblock]').click();
await pg.waitForSelector('#sbBlock');
check('the Stat block button in the fight shows the creature’s stat block and the credit', (await pg.textContent('#sbBlock')).includes('Legendary Actions') && (await pg.textContent('.modal')).includes('System Reference Document 5.2.1'));
await pg.click('.modal .modal-actions button:has-text("Close")');
// recharge and legendary
await drow.locator('[data-leg] button[aria-label^="Use a legendary"]').click();
check('using a legendary action counts down', (await drow.locator('[data-leg]').textContent()).includes('2/3'));
await drow.locator('[data-use] .cond').first().click();
check('a spent recharge ability offers a d6 roll', await drow.locator('[data-recharge]').count() === 1);
await drow.locator('[data-recharge]').click();
check('rolling says what came up', /rolled \d/.test(await pg.textContent('.toasts')));
// settings: the SRD off
await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="library"]'); await pg.waitForSelector('#setSrd');
await pg.uncheck('#setSrd'); await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage'));
await pg.click('#addTabMonsters'); await pg.click('#openLibrary'); await pg.waitForSelector('#mlSearch');
check('with the built-in monsters switched off, only yours are listed (and no SRD credit)', (await pg.textContent('#mlCount')).startsWith('1 of 1') && await pg.locator('#mlCredit').count() === 0, await pg.textContent('#mlCount'));
await pg.setViewportSize({ width: 390, height: 800 });
check('on a phone-sized window the library fits', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await pg.setViewportSize({ width: 1360, height: 900 });
await pg.click('.modal .modal-actions button:has-text("Done")');
// pinned controls
const paneTop = () => pg.evaluate(() => document.querySelector('.pane:not([hidden])').getBoundingClientRect().top);
await pg.evaluate(() => { const p = document.querySelector('.pane:not([hidden])'); p.scrollTop = 0; });
const longEnough = await pg.evaluate(() => { const p = document.querySelector('.pane:not([hidden])'); return p.scrollHeight - p.clientHeight; });
check('the fight is long enough to scroll (so the pinned bar can be tested)', longEnough > 300, String(longEnough));
await pg.evaluate(() => { const p = document.querySelector('.pane:not([hidden])'); p.scrollTop = 600; });
await pg.waitForTimeout(200);
const barPos = await pg.evaluate(() => { const p = document.querySelector('.pane:not([hidden])').getBoundingClientRect(); const b = document.querySelector('#combatBar').getBoundingClientRect(); const n = document.querySelector('#nextTurn').getBoundingClientRect(); return { dBar: Math.round(b.top - p.top), nTop: Math.round(n.top - p.top), nVisible: n.bottom > p.top && n.top < p.bottom }; });
check('scrolled well down, the bar with Next turn, Undo, Roll for enemies and End combat is still at the top of the pane', Math.abs(barPos.dBar) <= 2 && barPos.nVisible && barPos.nTop >= 0, JSON.stringify(barPos));
const sidePos = await pg.evaluate(() => { const p = document.querySelector('.pane:not([hidden])').getBoundingClientRect(); const e = document.querySelector('#combatSide').getBoundingClientRect(); return { d: Math.round(e.top - p.top), h: Math.round(e.height), ph: Math.round(p.height) }; });
check('and the Add / Log panel on the right stays in view too', sidePos.d >= 0 && sidePos.d < 160 && sidePos.h <= sidePos.ph, JSON.stringify(sidePos));
check('Delete combat is no longer in the bar', await pg.locator('#combatBar #deleteCombat').count() === 0);
// Next turn brings the active creature into view
await pg.evaluate(() => { const p = document.querySelector('.pane:not([hidden])'); p.scrollTop = 0; });
const total = (await comb()).combatants.length;
for (let i = 0; i < total - 3; i++) await pg.click('#nextTurn');
await pg.waitForTimeout(900);
const act = await pg.evaluate(() => { const st = window.__dmforge.S.combat; const c = st.combatants[st.turn]; const el = document.querySelector('[data-cid="' + c.id + '"]'); const p = document.querySelector('.pane:not([hidden])').getBoundingClientRect(); const b = document.querySelector('#combatBar').getBoundingClientRect(); const r = el.getBoundingClientRect(); return { top: Math.round(r.top - b.bottom), bottom: Math.round(p.bottom - r.bottom), name: c.name }; });
check('Next turn scrolls so the creature whose turn it is can be seen (not hidden under the bar)', act.top >= -2 && act.bottom >= -2, JSON.stringify(act));

// the log
await pg.click('#tabLog');
await pg.waitForSelector('#combatLog');
const logText = await pg.textContent('#clList');
check('the Log tab lists the fight so far by round, with the initiative order and what happened', logText.includes('Round 1') && logText.includes('Initiative:') && /took \d+ \(/.test(logText) && logText.includes('▶'), logText.slice(0, 300));
check('damage lines say which turn they happened in (a heading per turn)', await pg.locator('#clList .cl-th').count() >= 2);
check('turns where nothing happened are joined on one line', (await pg.textContent('#clList')).includes('Nothing logged:'));
await pg.fill('#clNote', 'The dragon used Frightful Presence'); await pg.keyboard.press('Enter');
check('you can add your own note to the log', (await pg.textContent('#clList')).includes('Note: The dragon used Frightful Presence'));
const evCount = async () => (await comb()).log.filter(e => e.kind === 'event' || e.kind === 'note').length;
const before = await evCount();
await pg.waitForTimeout(900);
await pg.click('#tabAdd');
await row(kes).locator('input[aria-label^="Amount"]').fill('1'); await row(kes).locator('button:has-text("Damage")').click();
check('a change adds a line', (await evCount()) === before + 1);
await pg.click('#undoCombat');
check('Undo takes that line out of the log too', (await evCount()) === before);
await pg.click('#tabLog');
await pg.selectOption('#clSession', 'Ashfall/Sessions/2026-10-12 Session 12.md');
await pg.click('#clSave');
let sess = await get('Ashfall/Sessions/2026-10-12 Session 12.md');
check('Save to session now writes the summary and the folded log into the session note', sess.includes('### Combat') && sess.includes('> [!note]- Combat log:') && sess.includes('> **Round 1**') && sess.includes('Frightful Presence'), sess.slice(-600));
await pg.click('#clSave');
sess = await get('Ashfall/Sessions/2026-10-12 Session 12.md');
check('saving again updates it (one log, not two)', (sess.match(/\[!note\]- Combat log:/g) || []).length === 1);

// a fight survives closing the tab
const nBefore = (await comb()).combatants.length;
await pg.reload();
await pg.waitForSelector('.dir-list, .sidebar');
if (!(await pg.locator('.sidebar').count())) {
  await pg.click('.dir-row:has-text("Ashfall")');
  await pg.click('text=Use “Ashfall” as the campaign');
  await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
  if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
  await pg.waitForSelector('.sidebar');
}
await pg.waitForFunction(() => /Restored the fight/.test((document.querySelector('.toasts') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
check('after closing and reopening the page the fight is back, and it says so', (await comb()).combatants.length === nBefore && /Restored the fight in progress/.test(await pg.textContent('.toasts')), await pg.textContent('.toasts'));
await pg.click('.nav-btn:has-text("Combat")');
check('and Undo starts afresh (nothing to undo yet)', await pg.isDisabled('#undoCombat'));
// End combat saves the log; Delete is in that dialog
await pg.click('#endCombat');
check('End combat has the Delete instead option', await pg.locator('#deleteCombat').count() === 1);
await pg.selectOption('.modal select', 'Ashfall/Sessions/2026-10-12 Session 12.md');
await pg.click('#endCombatGo');
await pg.waitForFunction(() => window.__dmforge.S.combat === null);
sess = await get('Ashfall/Sessions/2026-10-12 Session 12.md');
check('End combat puts the final summary and the whole log in the session note', sess.includes('**Still standing:**') && sess.includes('> [!note]- Combat log:') && (sess.match(/\[!note\]- Combat log:/g) || []).length === 1);
check('no page errors (combat)', errors.length === 0, errors.join('\n'));

await b.close(); proc.kill();
const fails = results.filter(r => !r).length;
console.log('\n' + (results.length - fails) + '/' + results.length + ' checks passed');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
