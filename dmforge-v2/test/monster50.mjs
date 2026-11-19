/* 2.50: custom monsters: the Monster library button in the sidebar, a form, copy-and-edit, pasting a stat block, edit and delete. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pathFor = name => pg.evaluate(n => { const x = window.__dmforge.getIndex().notes.find(m => m.name === n); return x ? x.path : null; }, name);
const text = p => pg.evaluate(p => window.__dmforge.S.working.get(p), p);
const pending = () => pg.evaluate(() => window.__dmforge.S.working.list().length);

/* ---- the button */
check('the sidebar has a Monsters button, in the Reference group', await pg.locator('#navMonsters').count() === 1 && (await pg.textContent('#navMonsters')).includes('Monsters') && await pg.locator('.nav-group-btn:has-text("Reference") + * #navMonsters, .nav-group-btn:has-text("Reference") ~ * #navMonsters, .nav-group:has(.nav-group-btn:has-text("Reference")) #navMonsters').count() >= 1);
await pg.click('.nav-group-btn:has-text("Reference")');
await pg.click('#navMonsters'); await pg.waitForSelector('#mlSearch'); await pg.waitForSelector('#mlList li');
check('it opens the Monster library from anywhere (here, the Overview)', await pg.locator('#mlNew').count() === 1);
await pg.click('.modal .modal-actions .btn-primary'); await pg.waitForFunction(() => !document.querySelector('.modal'));
await pg.keyboard.press('Control+KeyK'); await pg.fill('#palInput', 'monster library'); await sleep(150); await pg.keyboard.press('Enter');
await pg.waitForSelector('#mlSearch');
check('Command-K "Monster library" opens it too', true);

/* ---- a monster from scratch */
await pg.click('#mlNew'); await pg.waitForSelector('#monsterEditor');
check('New monster opens a form, with the paste box open', await pg.evaluate(() => document.querySelector('#mePasteBox').open) && await pg.locator('#me-name').count() === 1);
await pg.click('#meSave');
check('saving an empty form says what is missing and saves nothing', (await pg.textContent('#meErrors')).includes('name') && await pending() === 0, await pending());
await pg.fill('#me-name', 'Ashen Hound'); await pg.selectOption('#me-size', 'Large');
await pg.fill('#me-type', 'monstrosity'); await pg.fill('#me-align', 'unaligned');
await pg.fill('#me-ac', '14'); await pg.fill('#me-acd', 'ash-hardened hide'); await pg.fill('#me-hp', '45'); await pg.fill('#me-hd', '6d10+12');
await pg.selectOption('#me-cr', '3'); await pg.fill('#me-speed', '15 m');
for (const [i, v] of ['16', '14', '15', '3', '12', '7'].entries()) await pg.fill('#me-ab' + i, v);
check('each ability shows its modifier', (await pg.textContent('.me-ab:nth-child(1)')).includes('+3') && (await pg.textContent('.me-ab:nth-child(4)')).includes('−4'));
await pg.fill('#me-tr', '**Smoke Step.** The hound can move through other creatures.');
await pg.fill('#me-act', '**Bite.** Melee: +5 to hit, reach 1.5 m. Hit: 11 (2d8 + 3) piercing damage.');
await pg.click('#meSave'); await pg.waitForSelector('#mlTitle'); await sleep(250);
const hound = await pathFor('Ashen Hound');
check('Save makes a note in the Bestiary', !!hound && /Bestiary\/Ashen Hound\.md$/.test(hound), hound);
const t = await text(hound);
check('with properties the library and Obsidian read', /cr: 3\n/.test(t) && /size: Large\n/.test(t) && /creature: monstrosity\n/.test(t) && /ac: 14\n/.test(t) && /hp: 45\n/.test(t) && /init: 2\n/.test(t) && /hd: 6d10\+12\n/.test(t), t.slice(0, 300));
check('and a stat block, with the ability table and the entries', /\| Str \| Dex/.test(t) && t.includes('16 (+3)') && t.includes('**Smoke Step.**') && t.includes('**Bite.**') && t.includes('CR') && t.includes('(XP 700)'), t.slice(300, 900));
check('the library shows it, marked as mine, with its stat block', (await pg.textContent('#mlTitle')) === 'Ashen Hound' && await pg.locator('#mlList .pill:has-text("Mine")').count() >= 1 && (await pg.textContent('#mlBlock')).includes('Smoke Step'));
check('it is a pending change, not yet in the vault', await pending() === 1);
await pg.fill('#mlSearch', 'hound'); await sleep(200);
check('and it is found by search', await pg.locator('#mlList [data-mon="note:' + hound + '"]').count() === 1);

/* ---- edit it with the form */
await pg.click('#mlEdit'); await pg.waitForSelector('#monsterEditor');
check('Edit opens the form as it was made', (await pg.inputValue('#me-name')) === 'Ashen Hound' && (await pg.inputValue('#me-hp')) === '45' && (await pg.inputValue('#me-ab0')) === '16' && (await pg.inputValue('#me-act')).includes('Bite'));
await pg.fill('#me-hp', '52'); await pg.fill('#me-name', 'Cinder Hound');
await pg.click('#meSave'); await pg.waitForSelector('#mlTitle'); await sleep(250);
const cinder = await pathFor('Cinder Hound');
check('saving renames the note and changes it in place', !!cinder && await pathFor('Ashen Hound') === null && /hp: 52\n/.test(await text(cinder)) && (await text(cinder)).includes('# Cinder Hound') && (await text(cinder)).includes('Smoke Step'), cinder);
check('still one pending monster, not two', await pending() === 1, await pending());
check('the library follows to the new name', (await pg.textContent('#mlTitle')) === 'Cinder Hound');

/* ---- a note changed outside the form is not overwritten */
await pg.evaluate(p => { const w = window.__dmforge.S.working; w.setText(p, w.get(p).replace('Melee: +5', 'Melee: +9')); window.__dmforge.touch(); }, cinder);
await pg.click('#mlList [data-mon^="note:"]'); await sleep(150);
check('a note changed by hand cannot be edited with the form (it would be overwritten)', await pg.locator('#mlEdit').count() === 0 && await pg.locator('#mlEditedNote').count() === 1);
check('but it can still be opened, copied and deleted', await pg.locator('#mlOpen').count() === 1 && await pg.locator('#mlCopy').count() === 1 && await pg.locator('#mlDelete').count() === 1);

/* ---- copy a built-in monster and change it */
await pg.fill('#mlSearch', 'wolf'); await sleep(150);
await pg.click('#mlList [data-mon^="srd:"]'); await sleep(150);
await pg.click('#mlCopy'); await pg.waitForSelector('#monsterEditor');
check('Copy and edit starts from the built-in stat block', (await pg.inputValue('#me-name')).includes('Wolf') && (await pg.inputValue('#me-ac')) === '12' && (await pg.inputValue('#me-tr')).includes('Pack Tactics') && (await pg.inputValue('#me-speed')).includes('m'), await pg.inputValue('#me-speed'));
await pg.fill('#me-name', 'Dire Ashwolf'); await pg.fill('#me-hp', '40'); await pg.selectOption('#me-cr', '1');
await pg.click('#meSave'); await pg.waitForSelector('#mlTitle'); await sleep(250);
const wolf = await pathFor('Dire Ashwolf');
check('it is saved as a new monster of its own', !!wolf && /hp: 40\n/.test(await text(wolf)) && /cr: 1\n/.test(await text(wolf)) && (await text(wolf)).includes('Pack Tactics'));
await pg.fill('#mlSearch', 'wolf'); await sleep(150);
check('the built-in Wolf is untouched', await pg.locator('#mlList [data-mon^="srd:"]:has-text("Wolf")').count() >= 1);

/* ---- paste a stat block */
await pg.click('#mlNew'); await pg.waitForSelector('#monsterEditor');
await pg.fill('#mePaste', 'MARSH CRAWLER\nMedium Beast, Unaligned\nAC 13 Initiative +1 (11)\nHP 22 (4d8 + 4)\nSpeed 30 ft., Swim 40 ft.\nSTR 14 (+2) DEX 12 (+1) CON 13 (+1) INT 2 (-4) WIS 10 (+0) CHA 4 (-3)\nSenses Darkvision 60 ft.; Passive Perception 10\nCR 1/2 (XP 100; PB +2)\nTraits\nAmphibious. The crawler can breathe air and water.\nActions\nClaw. Melee Attack Roll: +4, reach 5 ft. Hit: 6 (1d8 + 2) Slashing damage.');
await pg.click('#mePasteFill'); await sleep(150);
check('Fill in the form reads the pasted stat block', (await pg.inputValue('#me-name')) === 'Marsh Crawler' && (await pg.inputValue('#me-ac')) === '13' && (await pg.inputValue('#me-hp')) === '22' && (await pg.inputValue('#me-hd')) === '4d8+4' && (await pg.inputValue('#me-cr')) === '1/2' && (await pg.inputValue('#me-ab4')) === '10' && (await pg.inputValue('#me-act')).includes('Claw'), await pg.inputValue('#me-name'));
check('the speed is in metres and it says how many fields it filled', (await pg.inputValue('#me-speed')).includes('9 m') && /Filled in \d+ fields/.test(await pg.textContent('#mePasteNote')), await pg.inputValue('#me-speed'));
await pg.click('#meSave'); await pg.waitForSelector('#mlTitle'); await sleep(250);
check('and saves like any other', !!(await pathFor('Marsh Crawler')));
await pg.click('#mlNew'); await pg.waitForSelector('#monsterEditor');
await pg.fill('#mePaste', 'hello there'); await pg.click('#mePasteFill'); await sleep(100);
check('text that is not a stat block fills in nothing and says so', /Could not find|Filled in 1/.test(await pg.textContent('#mePasteNote')) && (await pg.inputValue('#me-hp')) === '');
await pg.click('#meCancel'); await sleep(100);
check('Cancel closes the form and saves nothing new', await pg.locator('#monsterEditor').count() === 0);

/* ---- delete */
const before = await pending();
await pg.fill('#mlSearch', 'crawler'); await sleep(150);
await pg.click('#mlList [data-mon^="note:"]'); await pg.click('#mlDelete');
check('Delete asks first', await pg.locator('#mlDeleteYes').count() === 1 && await pathFor('Marsh Crawler') !== null);
await pg.click('#mlDeleteNo');
check('No keeps it', await pg.locator('#mlDeleteYes').count() === 0 && await pathFor('Marsh Crawler') !== null);
await pg.click('#mlDelete'); await pg.click('#mlDeleteYes'); await sleep(250);
check('Yes removes the note', await pathFor('Marsh Crawler') === null && await pg.locator('#mlList [data-mon^="note:"]').count() === 0);
check('built-in monsters have no Delete', (await (async () => { await pg.fill('#mlSearch', 'goblin'); await sleep(150); await pg.click('#mlList [data-mon^="srd:"]'); return pg.locator('#mlDelete').count(); })()) === 0);

/* ---- narrow */
await pg.setViewportSize({ width: 390, height: 800 });
await pg.click('#mlNew'); await pg.waitForSelector('#monsterEditor'); await sleep(200);
check('the form fits a phone-sized window', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('.modal *')].every(e => { const r = e.getBoundingClientRect(); return r.width === 0 || r.right <= window.innerWidth + 1; })));
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
