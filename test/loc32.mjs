/* 2.32: places inside places, who is here, and a starting page for each kind of place (the full demo campaign). */
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
const text = sel => pg.textContent(sel);
const open = name => pg.evaluate(n => { const x = window.__dmforge.getIndex().notes.find(y => y.name === n); window.__dmforge.A.goto(x.path); }, name);
const bodyOf = name => pg.evaluate(n => window.__dmforge.getIndex().notes.find(y => y.name === n).body, name);
const fmOf = name => pg.evaluate(n => window.__dmforge.getIndex().notes.find(y => y.name === n).fm, name);

// ---- the list is a tree
await pg.evaluate(() => document.querySelector('.nav-btn:has(.nav-label)') && [...document.querySelectorAll('.nav-btn')].find(e => /Locations/.test(e.textContent)).click());
await pg.waitForSelector('.list-item');
const rows = await pg.$$eval('.list-item', els => els.map(e => ({ t: e.querySelector('.t').textContent.trim(), d: e.getAttribute('data-depth'), s: e.querySelector('.s').textContent })));
const gh = rows.findIndex(r => r.t === 'Greenhold');
check('the Locations list shows places inside places, indented under their parent', rows[gh].d === '0' && rows[gh + 1].d === '1' && rows.find(r => r.t === 'The Hollow Reach').d === '2', JSON.stringify(rows.map(r => r.t + r.d)));
check('a place says how many are inside it', /\d+ inside/.test(rows[gh].s), rows[gh].s);
await pg.fill('input[aria-label="Filter list"]', 'weir');
check('filtering makes it a plain list again', (await pg.$$eval('.list-item', els => els.map(e => e.getAttribute('data-depth')))).every(d => d === null));
await pg.fill('input[aria-label="Filter list"]', '');

// ---- a place deep in the tree
await open('The Hollow Reach');
await pg.waitForSelector('#locCrumbs');
check('a place shows where it is: Greenhold › The Weir › The Hollow Reach', (await text('#locCrumbs')).replace(/\s+/g, ' ').trim() === 'Greenhold › The Weir › The Hollow Reach', await text('#locCrumbs'));
check('who is here: the two people whose Location is the Hollow Reach', await pg.locator('#locHere [data-person]').count() === 2 && await pg.locator('#locHere [data-person="Nym"]').count() === 1);
await pg.click('#locCrumbs [data-crumb="The Weir"]');
await pg.waitForSelector('#locPanel');
check('a crumb opens that place', (await text('#noteTitle')) === 'The Weir');
check('the Weir lists the Hollow Reach inside it', await pg.locator('#locInside [data-kid="The Hollow Reach"]').count() === 1);
check('and the people in places inside it count, saying where they are', (await text('#locHere')).includes('at The Hollow Reach') && await pg.locator('#locHere [data-person="Old Tam"]').count() === 1 && !/^at /.test(await text('#locHere [data-person="Old Tam"] .muted')));

// ---- the top of the tree
await open('Greenhold');
await pg.waitForSelector('#locPanel');
check('a top place has no crumbs', await pg.locator('#locCrumbs').count() === 0);
const kidCount = await pg.locator('#locInside .loc-kid').count();
check('Greenhold lists the places directly inside it', kidCount >= 6, String(kidCount));
check('and everyone in it or inside it (nested people carry "at …")', await pg.locator('#locHere [data-person]').count() >= 10);
check('with the last session that mentions it', await pg.locator('#locLastSession').count() === 1);

// ---- add a place inside, with a template for its kind
await pg.click('#locAddPlace');
await pg.waitForSelector('#newNoteName');
check('the dialog already has Within set to this place', (await pg.inputValue('input[list="nn-region"]')) === 'Greenhold');
await pg.fill('#newNoteName', 'The Rusty Anchor');
await pg.fill('input[list="nn-kinds"]', 'Tavern or inn');
check('and says what the kind gives it', /headings for a tavern or inn/.test(await text('#nnKindHint')));
check('the kinds are offered in the list', (await pg.locator('#nn-kinds option').count()) >= 9);
await pg.click('.modal button[type=submit]');
await pg.waitForSelector('#locCrumbs');
let body = await bodyOf('The Rusty Anchor'), fm = await fmOf('The Rusty Anchor');
check('the new place sits inside Greenhold, as a plain [[link]] property', /Greenhold/.test(String(fm.region)) && fm.kind === 'Tavern or inn', JSON.stringify(fm));
check('and starts with a tavern\'s headings', /## Food, drink and prices/.test(body) && /## Regulars and gossip/.test(body) && /## Hooks/.test(body), body);
check('it shows its crumb', (await text('#locCrumbs')).includes('Greenhold'));
await open('Greenhold'); await pg.waitForSelector('#locPanel');
check('Greenhold now lists it', await pg.locator('#locInside [data-kid="The Rusty Anchor"]').count() === 1);
// a sub-sub place from the tavern
await open('The Rusty Anchor'); await pg.waitForSelector('#locPanel');
await pg.click('#locAddPlace'); await pg.waitForSelector('#newNoteName');
await pg.fill('#newNoteName', 'The Cellar'); await pg.fill('input[list="nn-kinds"]', 'Dungeon or keyed area');
await pg.click('.modal button[type=submit]'); await pg.waitForSelector('#locCrumbs');
check('a place inside a place inside a place works', (await text('#locCrumbs')).replace(/\s+/g, ' ').trim() === 'Greenhold › The Rusty Anchor › The Cellar' && /## Rooms\n\n1\. \*\*Entrance\*\*/.test(await bodyOf('The Cellar')));

// ---- people
await open('The Rusty Anchor'); await pg.waitForSelector('#locPanel');
check('a new place has nobody yet, and says how people get here', /Nobody is placed here yet/.test(await text('#locHere')));
await pg.fill('#locPersonName', 'Marta Quill'); await pg.click('#locAddPerson');
await pg.waitForSelector('#locHere [data-person="Marta Quill"]');
fm = await fmOf('Marta Quill');
check('adding a person here makes an NPC whose Location is this place', /The Rusty Anchor/.test(String(fm.location)) && fm.type === 'npc', JSON.stringify(fm));
await pg.selectOption('#locPutHere', 'Edda Wick');
await pg.waitForSelector('#locHere [data-person="Edda Wick"]');
check('putting an existing NPC here changes just their Location', /The Rusty Anchor/.test(String((await fmOf('Edda Wick')).location)));
await open('Greenhold'); await pg.waitForSelector('#locPanel');
check('Greenhold counts the people in the new tavern too', (await text('#locHere [data-person="Marta Quill"] .muted')).includes('at The Rusty Anchor'));
check('those are pending changes', /Push \d+ changes/.test(await text('#pushBtn')));

// ---- moving places that already exist
await open('Orchard Road'); await pg.waitForSelector('#locMove');
check('a place says what it is inside, in a list you can change', (await pg.inputValue('#locMoveTo')) === 'Greenhold');
const mt = await pg.locator('#locMoveTo option').allTextContents();
check('the list has every place that is a sensible home, and "Nothing" for the top level', mt.some(x => /Nothing/.test(x)) && mt.some(x => x.trim() === 'The Cinder & Crown') && !mt.some(x => x.trim() === 'Orchard Road'));
await pg.selectOption('#locMoveTo', 'The Cinder & Crown');
await pg.waitForFunction(() => /Greenhold › The Cinder & Crown › Orchard Road/.test(document.querySelector('#locCrumbs').textContent.replace(/\s+/g, ' ')));
check('choosing one moves the place there (its trail changes)', /Cinder/.test(String((await fmOf('Orchard Road')).region)));
await pg.selectOption('#locMoveTo', '');
await pg.waitForFunction(() => !document.querySelector('#locCrumbs'));
check('"Nothing" takes it out to the top level, and removes the property', (await fmOf('Orchard Road')).region === undefined);
await open('The Weir'); await pg.waitForSelector('#locMove');
const wt = await pg.locator('#locMoveTo option').allTextContents();
check('a place cannot be moved into itself or into what is inside it', !wt.some(x => x.trim() === 'The Weir' || x.trim() === 'The Hollow Reach'));
check('and the move helper refuses it too', await pg.evaluate(() => { const A = window.__dmforge.A; const idx = window.__dmforge.getIndex(); return A.movePlace(idx.notes.find(n => n.name === 'Greenhold').path, 'The Hollow Reach') === false && A.movePlace(idx.notes.find(n => n.name === 'Greenhold').path, 'Greenhold') === false; }));
// bring an existing place in from the parent's page
await open('Greenhold'); await pg.waitForSelector('#locAddExisting');
check('the parent offers places that are not inside it yet', (await pg.locator('#locAddExisting option').allTextContents()).some(x => x === 'Orchard Road'));
await pg.selectOption('#locAddExisting', 'Orchard Road');
await pg.waitForSelector('#locInside [data-kid="Orchard Road"]');
check('moving an existing place in puts it among the places inside', /Greenhold/.test(String((await fmOf('Orchard Road')).region)));
// a place that names its parent another way keeps using that name
await pg.evaluate(() => window.__dmforge.A.createNote('location', 'Alias Place', { fm: { parent: '[[Greenhold]]' } }));
await pg.evaluate(() => { const A = window.__dmforge.A; const idx = window.__dmforge.getIndex(); A.movePlace(idx.notes.find(n => n.name === 'Alias Place').path, 'The Weir'); });
const af = await fmOf('Alias Place');
check('a place that says "parent" instead of "Within" keeps that property (no second copy)', /The Weir/.test(String(af.parent)) && af.region === undefined && af.within === undefined, JSON.stringify(af));
// drag and drop in the list
await pg.evaluate(() => [...document.querySelectorAll('.nav-btn')].find(e => /Locations/.test(e.textContent)).click());
await pg.waitForSelector('.pane:not([hidden]) .list-item');
const dnd = (from, to) => pg.evaluate(([f, t]) => {
  const items = [...document.querySelectorAll('.pane:not([hidden]) .list-item')];
  const src = items.find(e => e.querySelector('.t').textContent.trim() === f);
  const d = new DataTransfer();
  src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: d, bubbles: true }));
  return new Promise(res => setTimeout(() => {
    const dst = t === '' ? document.querySelector('#dropTop') : [...document.querySelectorAll('.pane:not([hidden]) .list-item')].find(e => e.querySelector('.t').textContent.trim() === t);
    dst.dispatchEvent(new DragEvent('dragover', { dataTransfer: d, bubbles: true, cancelable: true }));
    dst.dispatchEvent(new DragEvent('drop', { dataTransfer: d, bubbles: true, cancelable: true }));
    res();
  }, 150));
}, [from, to]);
await dnd('Millrace Mill', 'The East Well');
await pg.waitForTimeout(200);
check('dragging a place onto another in the list puts it inside', /The East Well/.test(String((await fmOf('Millrace Mill')).region)));
const depth = await pg.$$eval('.pane:not([hidden]) .list-item', els => Object.fromEntries(els.map(e => [e.querySelector('.t').textContent.trim(), e.getAttribute('data-depth')])));
check('and the list shows it one level further in', depth['Millrace Mill'] === '2' && depth['The East Well'] === '1', JSON.stringify(depth));
await dnd('Millrace Mill', '');
await pg.waitForTimeout(200);
check('dragging onto the "top level" strip takes it out', (await fmOf('Millrace Mill')).region === undefined);
await dnd('Greenhold', 'The Hollow Reach');
await pg.waitForTimeout(200);
check('dropping a place onto something inside it does nothing', /Greenhold/.test(String((await fmOf('Orchard Road')).region)) && (await fmOf('Greenhold')).region === undefined);

// ---- nothing breaks without a parent, or with a loop
await pg.evaluate(() => { const A = window.__dmforge.A; const a = A.createNote('location', 'Loop A', { fm: { region: '[[Loop B]]' } }); A.createNote('location', 'Loop B', { fm: { region: '[[Loop A]]' } }); });
await open('Loop A'); await pg.waitForSelector('#locPanel');
check('a loop (A inside B inside A) does not hang or crash', (await text('#noteTitle')) === 'Loop A');
check('no errors from the page', errors.length === 0, errors.join('\n'));
await b.close();
const ok = results.filter(Boolean).length;
console.log(`${ok}/${results.length} checks passed`);
process.exit(ok === results.length ? 0 : 1);
