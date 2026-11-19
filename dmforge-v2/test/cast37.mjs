/* 2.37: the session cast strip, adding an NPC under the cast heading, populating a place, duplicating a note. Full demo campaign. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
const P = '.pane:not([hidden]) ';
const open = name => pg.evaluate(n => { const x = window.__dmforge.getIndex().notes.find(y => y.name === n); window.__dmforge.A.goto(x.path); }, name);
const note = name => pg.evaluate(n => { const x = window.__dmforge.getIndex().notes.find(y => y.name === n); return x ? { path: x.path, body: x.body, text: window.__dmforge.S.working.get(x.path), fm: x.fm, type: x.type } : null; }, name);
const domClick = sel => pg.evaluate(s => document.querySelector(s).click(), sel);

// ---- the cast strip on a session
const sess = await pg.evaluate(() => { const x = window.__dmforge.getIndex().byType.session[0]; return { name: x.name, links: x.links.length }; });
await open(sess.name);
await pg.waitForSelector(P + '#castStrip');
const players = await pg.evaluate(() => window.__dmforge.getIndex().byType.player.length);
check('a session shows the party as chips', await pg.locator(P + '#castPlayers .cast-chip').count() === players && players > 0, String(players));
check('and the NPCs it links to', await pg.locator(P + '#castNpcs .cast-chip').count() >= 1);
// click: it opens in the other pane, the session stays
const chipName = await pg.getAttribute(P + '#castPlayers .cast-chip', 'data-cast');
await pg.click(P + '#castPlayers .cast-chip');
await pg.waitForTimeout(250);
check('clicking a chip turns on two columns', await pg.evaluate(() => window.__dmforge.S.layout) === 'two');
check('and shows that player in the other pane', await pg.evaluate(n => { const S = window.__dmforge.S; const t = S.tabs.find(x => x.id === S.paneActive[1]); const x = window.__dmforge.getIndex().byPath.get(t.selected); return !!x && x.name === n; }, chipName));
check('while the session keeps the focus', await pg.evaluate(s => { const S = window.__dmforge.S; return S.activePane === 0 && window.__dmforge.getIndex().byPath.get(S.selected).name === s; }, sess.name));
check('the other pane really shows the player', (await pg.locator('.pane:not([hidden]) #noteTitle').allTextContents()).includes(chipName));

// ---- add an NPC under the cast heading
const before = await note(sess.name);
await pg.click(P + '#castAddBtn');
await pg.waitForSelector(P + '#castPanel');
check('Add an NPC says where it goes', /Goes under|Cast/.test(await pg.textContent(P + '#castPanel')));
const free = await pg.evaluate(() => { const i = window.__dmforge.getIndex(); const s = i.byType.session[0]; const used = new Set(s.links.map(l => l.toLowerCase())); return (i.byType.npc || []).find(n => !used.has(n.name.toLowerCase())).name; });
await pg.fill(P + '#castName', free.slice(0, 4));
await pg.waitForSelector(P + '[data-castpick]');
check('typing lists matching NPCs', await pg.locator(P + '[data-castpick]').count() >= 1);
await pg.click(P + '[data-castpick="' + free + '"]');
await pg.waitForTimeout(150);
let after = await note(sess.name);
check('picking one adds a bullet link to the session', after.body.includes('- [[' + free + ']]') && after.body !== before.body);
check('and the chip appears', await pg.locator(P + '#castNpcs [data-cast="' + free + '"]').count() === 1);
// a brand new NPC, at a chosen place
const placeName = await pg.evaluate(() => window.__dmforge.getIndex().byType.location[0].name);
await pg.selectOption(P + '#castAt', placeName);
await pg.fill(P + '#castName', 'Odalys Brightwater');
await pg.waitForSelector(P + '#castCreate');
check('a new name offers to create it at the chosen place', /at /.test(await pg.textContent(P + '#castCreate')));
await pg.click(P + '#castCreate');
await pg.waitForTimeout(200);
const made = await note('Odalys Brightwater');
check('the NPC is created in the NPCs folder', !!made && made.type === 'npc' && /NPCs\//.test(made.path), made && made.path);
check('with their place set', !!made && new RegExp('\\[\\[' + placeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]\\]').test(made.text), made && made.text);
after = await note(sess.name);
check('and they are linked in the session too', after.body.includes('[[Odalys Brightwater]]'));
await pg.fill(P + '#castName', 'Odalys');
await pg.keyboard.press('Enter');
await pg.waitForTimeout(150);
after = await note(sess.name);
check('adding the same person again does not double them', (after.body.match(/\[\[Odalys Brightwater\]\]/g) || []).length === 1);

// ---- populate a place
await open(placeName);
await pg.waitForSelector(P + '#popBtn');
const npcBefore = await pg.evaluate(() => window.__dmforge.getIndex().byType.npc.length);
await pg.click(P + '#popBtn');
await pg.waitForSelector(P + '#popBox .pop-row');
const rows = await pg.locator(P + '#popBox .pop-row').count();
check('Populate this place rolls a few people for you to look at', rows >= 2, String(rows));
check('each with a race and role', /\S/.test(await pg.textContent(P + '#popBox .pop-row .muted')));
await pg.click(P + '#popBox [data-popreroll="0"]');
check('one can be re-rolled on its own', await pg.locator(P + '#popBox .pop-row').count() === rows);
await pg.locator(P + '#popBox .pop-row input').first().uncheck();
check('and any can be left out', (await pg.textContent(P + '#popAdd')).includes('Add ' + (rows - 1) + ' '), await pg.textContent(P + '#popAdd'));
await pg.click(P + '#popAdd');
await pg.waitForTimeout(250);
const npcAfter = await pg.evaluate(() => window.__dmforge.getIndex().byType.npc.length);
check('adding makes NPC notes for the ones you kept', npcAfter === npcBefore + rows - 1, npcBefore + ' -> ' + npcAfter);
const placed = await pg.evaluate(p => window.__dmforge.getIndex().byType.npc.filter(n => n.pending === 'create' && String((n.fm && n.fm.location) || '').includes(p)).length, placeName);
check('each placed at this place', placed >= rows - 1, String(placed));
check('who is here lists them', await pg.locator(P + '#locHere .loc-person').count() + await pg.locator(P + '#locHere .loc-pgroup').count() >= 1);

// ---- duplicate a note
await open('Odalys Brightwater');
await pg.waitForSelector(P + '#noteMore');
await domClick('.pane:not([hidden]) #noteMore');
await pg.waitForSelector(P + '#dupBtn');
await domClick('.pane:not([hidden]) #dupBtn');
await pg.waitForTimeout(250);
const copy = await note('Odalys Brightwater (copy)');
check('Duplicate makes "Name (copy)" beside the original', !!copy && copy.path.replace(/ \(copy\)\.md$/, '.md') === made.path, copy && copy.path);
check('its title heading is renamed too', !!copy && copy.body.includes('# Odalys Brightwater (copy)'));
check('and its properties came along', !!copy && copy.type === 'npc');
check('and it opens the copy', await pg.evaluate(() => window.__dmforge.getIndex().byPath.get(window.__dmforge.S.selected).name) === 'Odalys Brightwater (copy)');
await open('Odalys Brightwater');
await domClick('.pane:not([hidden]) #noteMore');
await pg.waitForSelector(P + '#dupBtn');
await domClick('.pane:not([hidden]) #dupBtn');
await pg.waitForTimeout(250);
check('a second copy is numbered', !!(await note('Odalys Brightwater (copy 2)')));

check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
