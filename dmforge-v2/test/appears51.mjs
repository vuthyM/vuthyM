/* 2.51: where a plot thread appears: the "Appears in" property, the filter chips, grouping by location, and "Plot threads here" on a place. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const pg = await ctx.newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
const open = async () => { await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html')); await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar'); };
await open();
const P = '.pane:not([hidden]) ';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const A = (fn, ...args) => pg.evaluate(([fn, args]) => window.__dmforge.A[fn](...args), [fn, args]);
const pathOf = name => pg.evaluate(n => window.__dmforge.getIndex().resolve(n).path, name);
const text = p => pg.evaluate(p => window.__dmforge.S.working.get(p), p);
const listed = () => pg.$$eval('.pane:not([hidden]) .list-item .t', els => els.map(e => e.textContent.trim()));
const chips = () => pg.$$eval('.pane:not([hidden]) [data-appears-chip]', els => els.map(e => e.dataset.appearsChip));

await A('setSection', 'plot'); await pg.waitForSelector(P + '#lvAppearsChips');
check('the plot thread list has an "Appears in" row with the places', JSON.stringify((await chips()).sort()).includes('The Sunken Chapel') && (await chips()).includes('The Weir') && (await chips()).includes('The East Well'), JSON.stringify(await chips()));
check('the chips come from the Appears in property only (Greenhold is linked in some text, but set nowhere)', !(await chips()).includes('Greenhold') && !(await chips()).includes('Cinder & Crown'), JSON.stringify(await chips()));
const all = (await listed()).length;
await pg.click(P + '[data-appears-chip="The East Well"]'); await sleep(150);
check('choosing a place leaves the threads that appear there', (await listed()).includes('Who Poisoned the Well') && (await listed()).length < all, JSON.stringify(await listed()));
await pg.click(P + '[data-appears-chip="The Weir"]'); await sleep(150);
check('a second place shows threads at either', (await listed()).includes('The Ferry at Night') && (await listed()).includes('Who Poisoned the Well'));
await pg.click(P + '#lvAppearsClear'); await sleep(150);
check('Clear brings the whole list back', (await listed()).length === all && await pg.locator(P + '#lvAppearsClear').count() === 0);

/* ---- group by location */
check('there is a Group by choice, One list to begin with', (await pg.inputValue(P + '#lvGroup')) === 'none' && await pg.locator(P + '#plotGroups').count() === 0);
await pg.selectOption(P + '#lvGroup', 'place'); await pg.waitForSelector(P + '#plotGroups');
const heads = () => pg.$$eval('.pane:not([hidden]) [data-grouphead]', els => els.map(e => e.dataset.grouphead));
check('Location groups the threads under each place, A to Z, with "not tied to a place" last', JSON.stringify(await heads()) === JSON.stringify([...(await heads())].filter(h => h !== 'Not tied to a place').sort((a, b) => a.localeCompare(b)).concat((await heads()).includes('Not tied to a place') ? ['Not tied to a place'] : [])) && (await heads()).includes('The Weir'), JSON.stringify(await heads()));
const inGroup = g => pg.$$eval('.pane:not([hidden]) [data-group="' + g + '"] .list-item .t', els => els.map(e => e.textContent.trim()));
const bellsGroups = await pg.$$eval('.pane:not([hidden]) .grp-sec', els => els.filter(e => [...e.querySelectorAll('.list-item .t')].some(x => x.textContent.trim() === 'The Missing Bells')).map(e => e.dataset.group));
check('a thread at several places is listed under each (The Missing Bells)', bellsGroups.length >= 3 && bellsGroups.includes('The Sunken Chapel') && bellsGroups.includes('The Weir'), JSON.stringify(bellsGroups));
check('the counts match', (await pg.textContent(P + '[data-grouphead="The Weir"] [data-count]')) === String((await inGroup('The Weir')).length));
await pg.click(P + '[data-grouphead="The Weir"]'); await sleep(150);
check('a group folds up', (await inGroup('The Weir')).length === 0 && (await pg.getAttribute(P + '[data-grouphead="The Weir"]', 'aria-expanded')) === 'false');
await pg.click(P + '[data-grouphead="The Weir"]'); await sleep(150);
check('and opens again', (await inGroup('The Weir')).length >= 1);
await pg.click(P + '[data-grouphead="The Weir"] ~ *, [data-group="The Weir"] .list-item >> nth=0'); await pg.waitForSelector(P + '#noteTitle');
check('clicking a thread in a group opens it', (await pg.textContent(P + '#noteTitle')).length > 0);
await pg.click(P + '[data-appears-chip="The East Well"]'); await sleep(150);
check('the filter and the grouping work together', JSON.stringify(await heads()) === JSON.stringify(['The East Well']) || (await heads()).every(h => ['The East Well', 'The Sunken Chapel', 'The Weir', 'Greenhold', 'The Cinder & Crown', 'The Shrine Tower'].includes(h)) && (await heads()).includes('The East Well'), JSON.stringify(await heads()));
await pg.click(P + '#lvAppearsClear');
await pg.fill(P + 'input[type="search"]', 'Poisoned'); await sleep(200);
check('searching opens every group it finds something in', (await heads()).length >= 1 && (await inGroup((await heads())[0])).includes('Who Poisoned the Well'));
await pg.fill(P + 'input[type="search"]', '');
await pg.reload(); await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar');
await A('setSection', 'plot'); await pg.waitForSelector(P + '#lvGroup');
check('the grouping is remembered', (await pg.inputValue(P + '#lvGroup')) === 'place' && await pg.locator(P + '#plotGroups').count() === 1);
await pg.selectOption(P + '#lvGroup', 'none'); await sleep(150);
check('back to one list', await pg.locator(P + '#plotGroups').count() === 0);

/* ---- on a thread and on a place */
const bells = await pathOf('The Missing Bells');
await A('goto', bells); await pg.waitForSelector(P + '#appearsIn');
check('the thread shows where it appears, as links', JSON.stringify(await pg.$$eval(P + '#appearsIn .chip-link', els => els.map(e => e.textContent.trim()))) === JSON.stringify(['The Shrine Tower', 'The Sunken Chapel', 'The Weir']), JSON.stringify(await pg.$$eval(P + '#appearsIn .chip-link', els => els.map(e => e.textContent.trim()))));
await A('goto', await pathOf('The Sunken Chapel')); await pg.waitForSelector(P + '#threadsHere');
check('a place lists the plot threads that appear there', (await pg.textContent(P + '#threadsHere')).includes('The Missing Bells'));
await pg.click(P + '[data-thread-here="The Missing Bells"]'); await pg.waitForSelector(P + '#appearsIn');
check('and the chip opens the thread', (await pg.textContent(P + '#noteTitle')).includes('The Missing Bells'));

/* ---- a place only mentioned in the text is not an appearance; it is offered as a suggestion */
const letter = await pathOf("The Letter Kestra Won't Open");
await pg.evaluate(p => { const w = window.__dmforge.S.working; w.setText(p, w.get(p).replace(/\s*$/, '\n\nThe letter mentions [[Greenhold]] twice: [[Greenhold]].\n')); window.__dmforge.touch(); }, letter);
await A('setSection', 'plot'); await pg.waitForSelector(P + '#lvAppearsChips');
check('a thread whose text only mentions Greenhold is not filtered in by it', !(await chips()).includes('Greenhold'));
await pg.selectOption(P + '#lvGroup', 'place'); await sleep(150);
const letterGroups = await pg.$$eval('.pane:not([hidden]) .grp-sec', els => els.filter(e => [...e.querySelectorAll('.list-item .t')].some(x => x.textContent.trim() === "The Letter Kestra Won't Open")).map(e => e.dataset.group));
check('and sits under "Not tied to a place" when grouped', JSON.stringify(letterGroups) === JSON.stringify(['Not tied to a place']), JSON.stringify(letterGroups));
await pg.selectOption(P + '#lvGroup', 'none');
await A('goto', letter); await pg.waitForSelector(P + '#appearsSuggest');
check('its page offers the place its text mentions', (await pg.textContent(P + '#appearsSuggest')).includes('＋ Greenhold'));
await pg.click(P + '[data-add-appears="Greenhold"]'); await sleep(250);
check('one click adds it to Appears in', /appears:\n  - "\[\[Greenhold\]\]"/.test(await text(letter)) && await pg.locator(P + '#appearsSuggest').count() === 0);
check('and the thread now shows it', (await pg.textContent(P + '#appearsIn')).includes('Greenhold'));
await A('setSection', 'plot'); await pg.waitForSelector(P + '#lvAppearsChips');
check('Greenhold is now a chip, with that thread', (await chips()).includes('Greenhold'));
await A('discardAll'); await sleep(200);

/* ---- editing it */
await A('goto', bells); await pg.waitForSelector(P + '#appearsIn');
await pg.click(P + '.note-head button:text-is("Edit")'); await pg.waitForSelector(P + '[data-links="appears"]');
const opts = await pg.$$eval('.pane:not([hidden]) [data-links="appears"] datalist option', os => os.map(o => o.value));
check('the editor suggests places (not NPCs) that are not already chosen', opts.includes('Greenhold') && !opts.includes('The Weir') && !opts.includes('Old Tam'), JSON.stringify(opts.slice(0, 8)));
await pg.fill(P + '[data-links="appears"] input', 'greenhold'); await pg.keyboard.press('Enter');
await pg.click(P + 'button:has-text("Save to pending changes")'); await sleep(300);
const t = await text(bells);
check('Save writes the places as a list of links, leaving Seeded by alone', /appears:\n  - "\[\[The Shrine Tower\]\]"\n  - "\[\[The Sunken Chapel\]\]"\n  - "\[\[The Weir\]\]"\n  - "\[\[Greenhold\]\]"\n/.test(t) && /seeded:\n  - "\[\[Old Tam\]\]"/.test(t), t.slice(0, 260));
await A('goto', await pathOf('Greenhold')); await pg.waitForSelector(P + '#threadsHere');
check('Greenhold now lists the thread, straight away', (await pg.textContent(P + '#threadsHere')).includes('The Missing Bells'));
await A('discardAll'); await sleep(200);
check('discarding takes it back', (await pg.evaluate(() => window.__dmforge.S.working.list().length)) === 0);
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
