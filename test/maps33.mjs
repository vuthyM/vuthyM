/* 2.33: maps with pins: pins that open places, maps inside maps, a place's own map, secret pins, scale and distance. Full demo campaign. */
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
const navTo = label => pg.evaluate(l => [...document.querySelectorAll('.nav-btn')].find(e => new RegExp(l).test(e.textContent)).click(), label);
const open = name => pg.evaluate(n => { const x = window.__dmforge.getIndex().notes.find(y => y.name === n); window.__dmforge.A.goto(x.path); }, name);
const mapNote = img => pg.evaluate(i => { const n = window.__dmforge.getIndex().byType.map.find(x => x.fm && x.fm.image === i); return n ? { body: n.body, fm: n.fm, path: n.path } : null; }, img);
const pinBox = async name => (await pg.locator('.pane:not([hidden]) [data-pin="' + name + '"] i').boundingBox());
const stageBox = () => pg.locator('.pane:not([hidden]) #mapStage').boundingBox();

// ---- the Maps page
await navTo('Maps');
await pg.waitForSelector('.pane:not([hidden]) .thumb-wrap');
check('each picture says how many pins it has', (await text('.pane:not([hidden]) [data-pincount="Greenhold Map.svg"]')) === '6 pins' && (await text('.pane:not([hidden]) [data-pincount="Weir Crossing.svg"]')) === '3 pins');
await pg.click('.pane:not([hidden]) [data-openmap="Greenhold Map.svg"]');
await pg.waitForSelector('.pane:not([hidden]) #mapView .map-pin');
check('a map opens with its pins on it', await pg.locator('.pane:not([hidden]) .map-pin').count() === 6);
check('and says what place it shows, and its scale', (await pg.inputValue('.pane:not([hidden]) #mapPlace')) === 'Greenhold' && /about 2 km wide/.test(await text('.pane:not([hidden]) #mapScale')), await text('.pane:not([hidden]) #mapScale'));
await pg.waitForFunction(() => { const i = document.querySelector('.pane:not([hidden]) #mapStage img'); return i && i.complete && i.clientWidth > 100; });

// ---- a pin opens its place, and a place with its own map opens that map
await pg.click('.pane:not([hidden]) [data-pin="The Weir"]');
check('clicking a pin shows what it is', (await text('.pane:not([hidden]) #mapCard')).includes('The Weir') && await pg.locator('.pane:not([hidden]) #mapOpenPlace').count() === 1);
check('a place that has its own map offers it', await pg.locator('.pane:not([hidden]) #mapOpenMap').count() === 1);
await pg.click('.pane:not([hidden]) #mapOpenMap');
await pg.waitForFunction(() => /Weir Crossing/.test(document.querySelector('.pane:not([hidden]) .page-head h2').textContent));
await pg.waitForSelector('.pane:not([hidden]) #mapView .map-pin');
check('the Weir\'s map has its pins, and a way back up to the map of Greenhold', await pg.locator('.pane:not([hidden]) .map-pin').count() === 3 && await pg.locator('.pane:not([hidden]) #mapUp').count() === 1 && /Greenhold/.test(await text('.pane:not([hidden]) #mapUp')));
await pg.click('.pane:not([hidden]) #mapUp');
await pg.waitForFunction(() => /Greenhold Map/.test(document.querySelector('.pane:not([hidden]) .page-head h2').textContent));
await pg.waitForSelector('.pane:not([hidden]) #mapView .map-pin');

// ---- move a pin by dragging
await pg.waitForFunction(() => { const i = document.querySelector('.pane:not([hidden]) #mapStage img'); return i && i.complete && i.clientWidth > 100; });
const before = await mapNote('Greenhold Map.svg');
const pb = await pinBox('The East Well'); const sb = await stageBox();
await pg.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await pg.mouse.down();
await pg.mouse.move(pb.x + pb.width / 2 + 30, pb.y + pb.height / 2 + 20, { steps: 6 }); await pg.mouse.up();
await pg.waitForTimeout(200);
const after = await mapNote('Greenhold Map.svg');
check('dragging a pin moves it, and only that pin changes in the note', after.body !== before.body && /\[\[The East Well\]\]/.test(after.body) && before.body.split('\n').filter(l => /Cinder/.test(l)).join() === after.body.split('\n').filter(l => /Cinder/.test(l)).join());
check('the move is a pending change', /Push 1 change/.test(await text('#pushBtn')));

// ---- add pins: the quick list, and a free click
await pg.click('.pane:not([hidden]) #mapAdd');
check('Pin places lists the places inside this map\'s place that are not on it yet', await pg.locator('.pane:not([hidden]) #mapTodo [data-arm="Orchard Road"]').count() === 1 && await pg.locator('.pane:not([hidden]) #mapTodo [data-arm="The Hollow Reach"]').count() === 1 && await pg.locator('.pane:not([hidden]) #mapTodo [data-arm="The Weir"]').count() === 0);
await pg.click('.pane:not([hidden]) [data-arm="Orchard Road"]');
check('picking one tells you to click where it goes', /Click the map to put Orchard Road/.test(await text('.pane:not([hidden]) #mapHint')));
{ const q = await stageBox(); await pg.mouse.click(q.x + q.width * 0.2, q.y + q.height * 0.7); }
await pg.waitForTimeout(200);
let n = await mapNote('Greenhold Map.svg');
check('clicking the map pins it as a plain [[link]] at that spot', /- (19|2\d)(\.\d)?, (69|7\d)(\.\d)? — \[\[Orchard Road\]\]/.test(n.body), n.body);
{ const q = await stageBox(); await pg.mouse.click(q.x + q.width * 0.85, q.y + q.height * 0.85); }
await pg.waitForSelector('.pane:not([hidden]) #mapDraft');
await pg.fill('.pane:not([hidden]) #mapDraftName', 'Smugglers\' landing');
await pg.check('.pane:not([hidden]) #mapDraft input[type=checkbox]');
await pg.click('.pane:not([hidden]) #mapDraftAdd');
await pg.waitForTimeout(200);
n = await mapNote('Greenhold Map.svg');
check('a name that is not a place becomes a plain label, and can be secret', /— Smugglers' landing — secret/.test(n.body), n.body);
await pg.click('.pane:not([hidden]) #mapAdd');

// ---- secret pins and player view
await pg.click('.pane:not([hidden]) [data-pin="The Sunken Chapel"]');
await pg.click('.pane:not([hidden]) #mapSecret');
await pg.waitForTimeout(150);
n = await mapNote('Greenhold Map.svg');
check('marking a pin secret writes it in the note', /\[\[The Sunken Chapel\]\] — secret/.test(n.body));
const withAll = await pg.locator('.pane:not([hidden]) .map-pin').count();
await pg.click('.pane:not([hidden]) #mapPlayer');
check('Player view hides the secret pins', await pg.locator('.pane:not([hidden]) .map-pin').count() === withAll - 2 && await pg.locator('.pane:not([hidden]) [data-pin="The Sunken Chapel"]').count() === 0 && await pg.locator('.pane:not([hidden]) [data-pinrow="Smugglers\' landing"]').count() === 0);
await pg.click('.pane:not([hidden]) #mapPlayer');
check('and Player view off brings them back', await pg.locator('.pane:not([hidden]) .map-pin').count() === withAll);

// ---- measure
await pg.click('.pane:not([hidden]) #mapMeasure');
await pg.click('.pane:not([hidden]) [data-pin="The Cinder & Crown"]');
await pg.click('.pane:not([hidden]) [data-pin="The Sunken Chapel"]');
await pg.waitForSelector('.pane:not([hidden]) #mapDist');
const d1 = await text('.pane:not([hidden]) #mapDist');
check('measuring between two pins gives a distance in metric, and a walking time', /\d+(\.\d)? (m|km)/.test(d1) && /on foot/.test(d1), d1);
await pg.fill('.pane:not([hidden]) #mapReal', '1 km'); await pg.click('.pane:not([hidden]) #mapScaleSet');
await pg.waitForTimeout(200);
n = await mapNote('Greenhold Map.svg');
check('telling it how far the line really is saves a new scale', /^scale: [\d.]+ (m|km)$/m.test(n.fm.scale ? 'scale: ' + n.fm.scale : '') && n.fm.scale !== '2 km', JSON.stringify(n.fm));
const d2 = await text('.pane:not([hidden]) #mapDist');
check('and the line now measures 1 km', /1(\.0)? km|^1000 m|9\d\d m/.test(d2), d2);
await pg.click('.pane:not([hidden]) #mapMeasure');

// ---- a place's own page
await open('The Sunken Chapel'); await pg.waitForSelector('.pane:not([hidden]) #locMap');
check('going to a place from a map tab turns the tab into that page (it does not stay stuck on the picture)', (await text('.pane:not([hidden]) #noteTitle')) === 'The Sunken Chapel');
check('a place shows its own map, with pins', await pg.locator('.pane:not([hidden]) #locMap [data-mappreview="Sunken Chapel Floorplan.svg"]').count() === 1 && await pg.locator('.pane:not([hidden]) #locMap .map-dot').count() >= 3);
await open('The Weir'); await pg.waitForSelector('.pane:not([hidden]) #locMap');
check('and where it is pinned on other maps', await pg.locator('.pane:not([hidden]) #locPinned [data-pinnedon="Greenhold Map.svg"]').count() === 1);
await pg.click('.pane:not([hidden]) #locPinned [data-pinnedon="Greenhold Map.svg"]');
await pg.waitForSelector('.pane:not([hidden]) #mapCard');
check('which opens that map with the pin selected', (await text('.pane:not([hidden]) #mapCard')).includes('The Weir'));
// a place with no map
await open('Orchard Road'); await pg.waitForSelector('.pane:not([hidden]) #locMap');
check('a place with no map offers the pictures in the campaign', await pg.locator('.pane:not([hidden]) #locPickMap option').count() >= 3);

// ---- a picture with no pins note yet
await pg.evaluate(() => { const n = window.__dmforge.getIndex().byType.map.find(x => x.fm && x.fm.image === 'Sunken Chapel Floorplan.svg'); window.__dmforge.A.deleteNote(n.path); });
await navTo('Maps'); await pg.waitForSelector('.pane:not([hidden]) .thumb-wrap');
check('with the note gone the picture has no pins', (await text('.pane:not([hidden]) [data-pincount="Sunken Chapel Floorplan.svg"]')) === 'No pins');
await pg.click('.pane:not([hidden]) [data-openmap="Sunken Chapel Floorplan.svg"]');
await pg.waitForSelector('.pane:not([hidden]) #mapView');
await pg.waitForFunction(() => { const i = document.querySelector('.pane:not([hidden]) #mapStage img'); return i && i.complete && i.clientWidth > 100; });
await pg.click('.pane:not([hidden]) #mapAdd');
{ const q = await stageBox(); await pg.mouse.click(q.x + q.width * 0.5, q.y + q.height * 0.5); }
await pg.waitForSelector('.pane:not([hidden]) #mapDraft');
await pg.fill('.pane:not([hidden]) #mapDraftName', 'The Nave'); await pg.click('.pane:not([hidden]) #mapDraftAdd');
await pg.waitForTimeout(250);
const made = await mapNote('Sunken Chapel Floorplan.svg');
check('the first pin on a picture creates its map note beside it', !!made && made.fm.type === 'map' && /^## Pins/m.test(made.body) && /!\[\[Sunken Chapel Floorplan\.svg\]\]/.test(made.body) && /- (49|50)(\.\d)?, (49|50)(\.\d)? — The Nave/.test(made.body), JSON.stringify(made));
check('no errors from the page', errors.length === 0, errors.join('\n'));
await b.close();
const ok = results.filter(Boolean).length;
console.log(`${ok}/${results.length} checks passed`);
process.exit(ok === results.length ? 0 : 1);
