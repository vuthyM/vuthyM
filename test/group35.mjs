/* 2.35: long lists folded up by town: NPCs (and factions and items), with ways to put them in places. Full demo campaign. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
const P = '.pane:not([hidden]) ';
const text = sel => pg.textContent(P + sel);
const nav = label => pg.evaluate(l => [...document.querySelectorAll('.nav-btn')].find(e => new RegExp(l).test(e.textContent)).click(), label);
const heads = () => pg.$$eval(P + '.grp-head', els => els.map(e => ({ l: e.getAttribute('data-grouphead'), n: Number(e.querySelector('[data-count]').textContent), open: e.getAttribute('aria-expanded') === 'true' })));
const noteFm = n => pg.evaluate(x => { const y = window.__dmforge.getIndex().notes.find(z => z.name === x); return { location: (y.fm && y.fm.location) || (y.inline && y.inline.location) || '', body: y.body }; }, n);
const placeVal = async n => String((await noteFm(n)).location);
const setGroupAfter = v => pg.evaluate(x => window.__dmforge.A.updateSetting('groupAfter', x), v);
const total = await pg.evaluate(() => window.__dmforge.getIndex().byType.npc.length);

// ---- a small cast stays one list
await nav('NPCs'); await pg.waitForSelector(P + '#grpWrap');
check('with fewer than 20 NPCs the list stays as it was: one list', await pg.locator(P + '.grp-head').count() === 0 && await pg.locator(P + '.list-item').count() === total, String(total));
check('and says it is on automatic', (await pg.inputValue(P + '#grpMode')) === 'auto');
await setGroupAfter(10);
await pg.waitForSelector(P + '.grp-head');
let h = await heads();
check('past the threshold the NPCs group themselves by town, each group counted', h.length >= 2 && h.reduce((t, x) => t + x.n, 0) === total && h.some(x => x.l === 'Greenhold' && x.n >= 10), JSON.stringify(h));
check('with the "nowhere" group last', h[h.length - 1].l === 'Not placed anywhere', JSON.stringify(h));
check('and every group is folded up (nothing is selected)', h.every(x => !x.open) && await pg.locator(P + '.grp-body').count() === 0);

// ---- open one, open a person: their group stays open
await pg.click(P + '[data-grouphead="Greenhold"]');
check('opening a group shows its people', await pg.locator(P + '[data-group="Greenhold"] .list-item').count() >= 10);
await pg.click(P + '[data-group="Greenhold"] [data-note="Finch"]');
await pg.waitForSelector(P + '#placeField');
check('an NPC\'s page says where they live, as a list of places', (await pg.inputValue(P + '#placeFieldSel')) === 'The Cinder & Crown');
check('and the people in places inside a town say where, in the list', /at The Cinder & Crown/.test(await text('[data-group="Greenhold"] [data-note="Finch"]')));
await pg.click(P + '#grpCollapse');
check('Collapse all folds every group', (await heads()).every(x => !x.open));
await pg.click(P + '#grpExpand');
check('Expand all opens them all', (await heads()).every(x => x.open));
await pg.click(P + '#grpCollapse');
// ---- the choice is remembered
check('what you opened and closed is remembered for this campaign', await pg.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('dmforge:group:') && x.endsWith('|npc')); const o = k && JSON.parse(localStorage.getItem(k)); return !!o && o.over && o.over['@none:place'] === false; }));
// ---- searching opens the matches
await pg.fill(P + 'input[aria-label="Filter list"]', 'tam');
await pg.waitForSelector(P + '.grp-body');
const hs = await heads();
check('searching opens the groups that have a match, and hides the rest', hs.length === 1 && hs[0].open && await pg.locator(P + '[data-note="Old Tam"]').count() === 1, JSON.stringify(hs));
await pg.fill(P + 'input[aria-label="Filter list"]', '');

// ---- group by faction
await pg.selectOption(P + '#grpMode', 'faction');
await pg.waitForSelector(P + '.grp-head');
h = await heads();
check('NPCs can be grouped by faction instead, with the ones in none last', h.some(x => x.l === 'The Quiet Flame') && h[h.length - 1].l === 'No faction', JSON.stringify(h));
await pg.selectOption(P + '#grpMode', 'place');
await pg.click(P + '#grpCollapse');

// ---- unplaced: suggestions
const un = (await heads()).find(x => x.l === 'Not placed anywhere');
check('NPCs with no place are in their own group', !!un && un.n >= 1);
await pg.click(P + '[data-grouphead="Not placed anywhere"]');
const sugCount = await pg.locator(P + '[data-suggest]').count();
check('an NPC whose text mentions a place is offered that place', sugCount >= 1, String(sugCount));
const who = await pg.getAttribute(P + '[data-suggest]', 'data-suggest');
const whereWas = await placeVal(who);
await pg.click(P + '[data-suggest="' + who + '"]');
await pg.waitForTimeout(200);
check('one click places them (their Location is written)', (await placeVal(who)) !== whereWas && (await placeVal(who)).length > 0, who);
check('and they leave the unplaced group', await pg.locator(P + '[data-group="Not placed anywhere"] [data-note="' + who + '"]').count() === 0);
if (await pg.locator(P + '[data-acceptall]').count()) { await pg.click(P + '[data-acceptall]'); await pg.waitForTimeout(200); check('"Accept all suggestions" places the rest that mention a place', await pg.locator(P + '[data-suggest]').count() === 0); }
else check('"Accept all suggestions" places the rest that mention a place', await pg.locator(P + '[data-suggest]').count() === 0);

// ---- drag onto a group
await pg.click(P + '#grpExpand');
const dnd = (from, toGroup) => pg.evaluate(([f, t]) => {
  const src = [...document.querySelectorAll('.pane:not([hidden]) .list-item')].find(e => e.getAttribute('data-note') === f);
  const d = new DataTransfer();
  src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: d, bubbles: true }));
  return new Promise(res => setTimeout(() => {
    const dst = [...document.querySelectorAll('.pane:not([hidden]) .grp-head-row')].find(e => e.querySelector('.grp-head').getAttribute('data-grouphead') === t);
    dst.dispatchEvent(new DragEvent('dragover', { dataTransfer: d, bubbles: true, cancelable: true }));
    dst.dispatchEvent(new DragEvent('drop', { dataTransfer: d, bubbles: true, cancelable: true }));
    res();
  }, 150));
}, [fromTo(from), toGroup]);
function fromTo(x) { return x; }
const groupsNow = (await heads()).map(x => x.l).filter(x => x !== 'Not placed anywhere');
const other = groupsNow.find(x => x !== 'Greenhold');
if (other) {
  await dnd('Finch', other);
  await pg.waitForTimeout(250);
  check('dragging an NPC onto another town\'s header moves them there', (await placeVal('Finch')).includes(other), await placeVal('Finch'));
} else check('dragging an NPC onto another town\'s header moves them there (only one town in the demo: skipped)', true);
await dnd('Finch', 'Not placed anywhere');
await pg.waitForTimeout(250);
check('dragging onto "Not placed anywhere" clears their place', (await placeVal('Finch')) === '');
await dnd('Finch', 'Greenhold');
await pg.waitForTimeout(250);
check('and dragging back puts them in the town', (await placeVal('Finch')).includes('Greenhold'));

// ---- several at once
await pg.click(P + '#grpPick');
await pg.click(P + '[data-note="Edda Wick"]'); await pg.click(P + '[data-note="Harl Dunmere"]');
check('Select several counts what is picked', /2 selected/.test(await text('#grpBulk')));
await pg.selectOption(P + '#grpMoveTo', 'The Weir');
await pg.waitForTimeout(250);
check('and moves them all to one place', (await placeVal('Edda Wick')).includes('The Weir') && (await placeVal('Harl Dunmere')).includes('The Weir'));
await pg.click(P + '#grpPick');

// ---- exact place, and changing it from the NPC's page
await pg.selectOption(P + '#grpMode', 'exact');
await pg.waitForSelector(P + '.grp-head');
h = await heads();
check('"Exact place" groups by the place itself', h.some(x => x.l === 'The Weir') && h.some(x => x.l === 'The Cinder & Crown'), JSON.stringify(h.map(x => x.l)));
await pg.selectOption(P + '#grpMode', 'place');
await pg.evaluate(() => { const n = window.__dmforge.getIndex().notes.find(y => y.name === 'Finch'); window.__dmforge.A.goto(n.path); });
await pg.waitForSelector(P + '#placeFieldSel');
await pg.selectOption(P + '#placeFieldSel', 'The East Well');
await pg.waitForTimeout(200);
check('an NPC\'s own page moves them too', (await placeVal('Finch')).includes('The East Well'));

// ---- the Overview nudge
await pg.evaluate(() => { const n = window.__dmforge.getIndex().notes.find(y => y.name === 'Finch'); window.__dmforge.A.createNote('npc', 'Newcomer Nell', { fm: {} }); });
await nav('Overview');
await pg.waitForSelector(P + '#unplacedNudge');
check('the Overview says how many NPCs are not in a place yet', /not in a place yet/.test(await text('#unplacedNudge')) && /\d+ NPC/.test(await text('#unplacedNudge')));
await pg.click(P + '#unplacedGo');
await pg.waitForSelector(P + '[data-grouphead="Not placed anywhere"]');
check('and takes you to them, with that group open', (await heads()).find(x => x.l === 'Not placed anywhere').open);

// ---- factions and items
await setGroupAfter(0);
await nav('Factions'); await pg.waitForSelector(P + '#grpWrap');
h = await heads();
check('factions group by where they are based', h.length >= 1 && h.some(x => x.l === 'Greenhold' && x.n >= 3), JSON.stringify(h));
await nav('Items'); await pg.waitForSelector(P + '#grpWrap');
h = await heads();
check('items group by where they are kept, the rest under "Not kept anywhere"', h.some(x => x.l === 'Not kept anywhere') && h.some(x => x.l === 'Greenhold'), JSON.stringify(h));
await setGroupAfter(20);

// ---- a town with a crowd
await pg.evaluate(() => { const n = window.__dmforge.getIndex().notes.find(y => y.name === 'Greenhold'); window.__dmforge.A.goto(n.path); });
await pg.waitForSelector(P + '#locPanel');
check('a place with many people folds them up by where they are', await pg.locator(P + '#locPeopleGroups [data-pgroup]').count() >= 2 && await pg.locator(P + '[data-pgroup="here"]').count() === 1);
check('with the inner places collapsed', await pg.locator(P + '#locPeopleGroups details[open]').count() === 1);
check('and items kept here are listed', /Items kept here/.test(await text('#locElsewhere')));

// ---- the setting
await pg.evaluate(() => document.querySelector('#navSettings').click());
await pg.evaluate(() => document.querySelector('#menuSettings').click());
await pg.click('[data-setcat="library"]');
await pg.waitForSelector('#setGroupAfter');
check('Settings has "when to group long lists", 20 by default', (await pg.inputValue('#setGroupAfter')) === '20');
check('no errors from the page', errors.length === 0, errors.join('\n'));
await b.close();
const ok = results.filter(Boolean).length;
console.log(`${ok}/${results.length} checks passed`);
process.exit(ok === results.length ? 0 : 1);
