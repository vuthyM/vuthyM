/* 2.49: who seeded a plot thread: the "Seeded by" property, its editor, the reverse list on NPCs, factions and players, and the filter. */
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
const P = '.pane:not([hidden]) ';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const A = (fn, ...args) => pg.evaluate(([fn, args]) => window.__dmforge.A[fn](...args), [fn, args]);
const pathOf = name => pg.evaluate(n => window.__dmforge.getIndex().resolve(n).path, name);
const text = p => pg.evaluate(p => window.__dmforge.S.working.get(p), p);
const bells = await pathOf('The Missing Bells');

/* ---- the list: filter by who seeded it */
await A('setSection', 'plot'); await pg.waitForSelector(P + '#lvSeedChips');
const chips = () => pg.$$eval('.pane:not([hidden]) [data-seed-chip]', els => els.map(e => e.dataset.seedChip));
check('the plot thread list has a "Seeded by" row with each seeder', JSON.stringify((await chips()).sort()) === JSON.stringify(['Brother Calder', 'Edda Wick', 'Ember Court', 'Kestra Dune', 'Old Tam', 'Sorrel Vance', 'The Quiet Flame', 'Weir Ferrymen']), JSON.stringify(await chips()));
const listed = () => pg.$$eval('.pane:not([hidden]) .list-item .t', els => els.map(e => e.textContent.trim()));
check('all seven threads show to begin with', (await listed()).length === 7, JSON.stringify(await listed()));
await pg.click(P + '[data-seed-chip="Old Tam"]'); await sleep(150);
check('choosing Old Tam leaves just the thread he seeded', JSON.stringify(await listed()) === JSON.stringify(['The Missing Bells']), JSON.stringify(await listed()));
await pg.click(P + '[data-seed-chip="Sorrel Vance"]'); await sleep(150);
check('choosing a second seeder shows threads by either', (await listed()).length === 2);
await pg.click(P + '#lvSeedClear'); await sleep(150);
check('Clear brings them all back', (await listed()).length === 7 && await pg.locator(P + '#lvSeedClear').count() === 0);

/* ---- the thread shows its seeders, as links */
await A('goto', bells); await pg.waitForSelector(P + '#noteTitle');
check('the thread lists who seeded it', JSON.stringify(await pg.$$eval(P + '#seededBy .chip-link', els => els.map(e => e.textContent.trim()))) === JSON.stringify(['Old Tam', 'Ember Court']));
await pg.click(P + '#seededBy a:has-text("Old Tam")'); await pg.waitForSelector(P + '#seededThreads');
check('a seeder chip opens that NPC', (await pg.textContent(P + '#noteTitle')).includes('Old Tam'));
check('and the NPC lists the threads they seeded', (await pg.textContent(P + '#seededThreads')).includes('The Missing Bells') && (await pg.textContent(P + '#seededThreads')).includes('Active'));
await pg.click(P + '[data-seeded-thread="The Missing Bells"]'); await pg.waitForSelector(P + '#seededBy');
check('the thread chip goes back to the thread', (await pg.textContent(P + '#noteTitle')).includes('The Missing Bells'));
const ember = await pathOf('Ember Court'), sorrel = await pathOf('Sorrel Vance'), bram = await pathOf('Bram Ironhollow');
await A('goto', ember); await pg.waitForSelector(P + '#seededThreads');
check('a faction lists its seeded threads', (await pg.textContent(P + '#seededThreads')).includes('The Missing Bells'));
await A('goto', sorrel); await pg.waitForSelector(P + '#seededThreads');
check('a player does too (Who Poisoned the Well)', (await pg.textContent(P + '#seededThreads')).includes('Who Poisoned the Well'));
await A('goto', bram); await sleep(200);
check('someone who seeded nothing has no such row', await pg.locator(P + '#seededThreads').count() === 0);

/* ---- editing the seeders */
await A('goto', bells); await pg.waitForSelector(P + '#noteTitle');
await pg.click(P + '.note-head button:text-is("Edit")'); await pg.waitForSelector(P + '[data-links="seeded"]');
const edChips = () => pg.$$eval('.pane:not([hidden]) [data-links="seeded"] [data-link-chip]', els => els.map(e => e.dataset.linkChip));
check('the editor shows the seeders as chips you can remove', JSON.stringify(await edChips()) === JSON.stringify(['Old Tam', 'Ember Court']));
const opts = await pg.$$eval('.pane:not([hidden]) [data-links="seeded"] datalist option', os => os.map(o => o.value));
check('and suggests NPCs, factions and players that are not already chosen', opts.includes('Edda Wick') && opts.includes('Sorrel Vance') && opts.includes('Kestra Dune') && !opts.includes('Old Tam') && !opts.includes('Ember Court') && !opts.includes('The Sunken Chapel'), JSON.stringify(opts.slice(0, 8)));
const inp = P + '[data-links="seeded"] input';
await pg.fill(inp, 'edda wick'); await pg.keyboard.press('Enter');
check('typing a name and pressing Enter adds it (matched to the real note, capitals fixed)', JSON.stringify(await edChips()) === JSON.stringify(['Old Tam', 'Ember Court', 'Edda Wick']), JSON.stringify(await edChips()));
await pg.fill(inp, 'Edda Wick'); await pg.keyboard.press('Enter');
check('the same name twice is not added twice', (await edChips()).length === 3);
await pg.fill(inp, 'Kestra Dune,');
check('a comma adds it too', (await edChips()).includes('Kestra Dune'));
await pg.fill(inp, 'Someone From Obsidian'); await pg.click(P + '.note-head, h2:has-text("Editing")');
check('leaving the box adds a name that is not a note yet', (await edChips()).includes('Someone From Obsidian'));
await pg.click(P + '[data-links="seeded"] [data-link-chip="Ember Court"] .links-x');
await pg.click(P + '[data-links="seeded"] [data-link-chip="Someone From Obsidian"] .links-x');
check('the × takes one out', JSON.stringify(await edChips()) === JSON.stringify(['Old Tam', 'Edda Wick', 'Kestra Dune']), JSON.stringify(await edChips()));
await pg.click(P + 'button:has-text("Save to pending changes")'); await sleep(300);
const t1 = await text(bells);
check('Save writes them as a list of [[links]] in the note\'s properties', /seeded:\n  - "\[\[Old Tam\]\]"\n  - "\[\[Edda Wick\]\]"\n  - "\[\[Kestra Dune\]\]"\n/.test(t1), t1.slice(0, 250));
check('the status line and the text are untouched', /status: Active\n/.test(t1) && t1.includes('# The Missing Bells') && t1.includes('Three bells vanished'));
check('the page shows the three seeders', JSON.stringify(await pg.$$eval(P + '#seededBy .chip-link', els => els.map(e => e.textContent.trim()))) === JSON.stringify(['Old Tam', 'Edda Wick', 'Kestra Dune']));
await A('goto', await pathOf('Edda Wick')); await pg.waitForSelector(P + '#seededThreads');
check('Edda Wick now lists the thread, straight away', (await pg.textContent(P + '#seededThreads')).includes('The Missing Bells'));
await A('goto', ember); await sleep(200);
check('and Ember Court no longer does', await pg.locator(P + '#seededThreads').count() === 0);

/* ---- a new thread, with seeders */
await A('setSection', 'plot'); await pg.waitForSelector(P + '#lvSeedChips');
await pg.click(P + 'button:has-text("+ New")'); await pg.waitForSelector('#newNoteName');
await pg.fill('#newNoteName', 'The Silent Choir');
await pg.fill('.modal [data-links="seeded"] input', 'Old Tam'); await pg.keyboard.press('Enter');
await pg.fill('.modal [data-links="seeded"] input', 'Greenhold Watch'); await pg.keyboard.press('Enter');
check('the New plot thread form has "Seeded by" with chips', (await pg.$$eval('.modal [data-link-chip]', els => els.length)) >= 1, await pg.$$eval('.modal [data-link-chip]', els => els.length));
await pg.click('.modal button[type="submit"]'); await pg.waitForSelector(P + '#noteTitle'); await sleep(300);
const choir = await pathOf('The Silent Choir');
const t2 = await text(choir);
check('the new thread is created with its seeders', /seeded:\n  - "\[\[Old Tam\]\]"/.test(t2), t2.slice(0, 200));
await A('goto', await pathOf('Old Tam')); await pg.waitForSelector(P + '#seededThreads');
check('Old Tam now lists two threads', (await pg.locator(P + '[data-seeded-thread]').count()) === 2);

/* ---- undo and pending */
await A('discardAll'); await sleep(250);
check('discarding takes it all back', (await pg.evaluate(() => window.__dmforge.S.working.list().length)) === 0);
const t3 = await text(bells);
check('the thread has its original seeders again', /seeded:\n  - "\[\[Old Tam\]\]"\n  - "\[\[Ember Court\]\]"/.test(t3));
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
