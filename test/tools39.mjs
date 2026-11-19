/* 2.39: table mode, the ? shortcut list, player-safe copies, pinning a place on a map, travel times. Full demo campaign. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true })).newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
await pg.evaluate(() => localStorage.setItem('dmforge:sp-cast', '1'));
const P = '.pane:not([hidden]) ';
const open = name => pg.evaluate(n => { const x = window.__dmforge.getIndex().notes.find(y => y.name === n); window.__dmforge.A.goto(x.path); }, name);
const domClick = sel => pg.evaluate(s => document.querySelector(s).click(), sel);
const paneTab = p => pg.evaluate(i => { const S = window.__dmforge.S; const t = S.tabs.find(x => x.id === S.paneActive[i]); const n = t && t.selected ? window.__dmforge.getIndex().byPath.get(t.selected) : null; return { section: t && t.section, name: n ? n.name : '', type: n ? n.type : '' }; }, p);

// ---- the ? shortcut list
await pg.keyboard.press('Shift+?');
await pg.waitForSelector('#shortcutList');
const sc = await pg.textContent('#shortcutList');
check('? opens the shortcut list', sc.includes('Quick switcher') && sc.includes('quick log') && sc.includes('Rename'));
check('with the keys written for this computer', /Ctrl\+K|⌘K/.test(sc) && !/mod\+/.test(sc));
await pg.keyboard.press('Shift+?');
check('and ? again closes it', await pg.locator('#shortcutList').count() === 0);
await pg.evaluate(() => { const i = document.querySelector('#searchBox, .search-wrap input'); if (i) i.focus(); });
await pg.keyboard.type('?');
check('typing a ? in a text box does not open it', await pg.locator('#shortcutList').count() === 0);
await pg.evaluate(() => document.activeElement && document.activeElement.blur());
await pg.evaluate(() => { window.__dmforge.S.dialog = { kind: 'menu' }; window.__dmforge.emit(); });
check('and the Menu lists it too', await pg.locator('#menuShortcuts').count() === 1);
await pg.evaluate(() => { window.__dmforge.S.dialog = null; window.__dmforge.emit(); });

// ---- table mode
const sess = await pg.evaluate(() => window.__dmforge.getIndex().byType.session[0].name);
await open(sess);
await pg.waitForSelector(P + '#castStrip');
await pg.evaluate(() => window.__dmforge.A.tableMode());
await pg.waitForTimeout(300);
check('Table mode turns on three panes', await pg.evaluate(() => window.__dmforge.S.layout) === 'prep');
const p0 = await paneTab(0), p1 = await paneTab(1), p2 = await paneTab(2);
check('the session in the big pane', p0.name === sess && p0.type === 'session', JSON.stringify(p0));
check('the Party page top right', p1.section === 'party', JSON.stringify(p1));
check('and the NPC list bottom right', p2.section === 'npc', JSON.stringify(p2));
check('with the session still in focus', await pg.evaluate(() => window.__dmforge.S.activePane) === 0);
const player = await pg.getAttribute(P + '#castPlayers .cast-chip', 'data-cast');
await pg.click(P + '#castPlayers .cast-chip');
await pg.waitForTimeout(200);
check('a player chip shows that player in the party pane', (await paneTab(1)).name === player && (await paneTab(2)).section === 'npc');
const npcChip = await pg.getAttribute(P + '#castNpcs .cast-chip', 'data-cast');
await pg.click(P + '#castNpcs .cast-chip');
await pg.waitForTimeout(200);
check('an NPC chip shows that NPC in the NPC pane', (await paneTab(2)).name === npcChip && (await paneTab(1)).name === player, JSON.stringify(await paneTab(2)));
check('and the session never left the big pane', (await paneTab(0)).name === sess);
await pg.evaluate(() => window.__dmforge.A.setLayout('single'));

// ---- player-safe copy
await pg.evaluate(() => window.__dmforge.A.createNote('npc', 'Ser Hollis', { body: '# Ser Hollis\n\nA knight of [[Greenhold]].\n\n- **Role:** knight\n- **Secret:** is the poisoner\n\n## Secrets and clues\n\n- [ ] the poison is hidden in the chapel\n\n## Notes\n\n> [!secret] DM only\n> he knows the king\n\nHe greets everyone warmly.\n' }));
await open('Ser Hollis');
await pg.waitForSelector(P + '#noteMore');
await domClick('.pane:not([hidden]) #noteMore');
await pg.waitForSelector(P + '#psBtn');
await domClick('.pane:not([hidden]) #psBtn');
await pg.waitForSelector('#psText');
const safe = await pg.inputValue('#psText');
check('the player-safe copy has no secrets', !/poisoner|chapel|king/i.test(safe) && !/Secret/.test(safe), safe);
check('but keeps what players may know', safe.includes('A knight of Greenhold.') && safe.includes('**Role:** knight') && safe.includes('greets everyone warmly'), safe);
const sum = await pg.textContent('#psSummary');
check('and says what it took out', /1 section/.test(sum) && /1 DM callout/.test(sum) && /1 secret line/.test(sum), sum);
await pg.uncheck('#psPlain');
check('links can stay as [[links]]', (await pg.inputValue('#psText')).includes('[[Greenhold]]'));
const dl = pg.waitForEvent('download');
await pg.click('#psDownload');
const d = await dl;
check('Download gives a .md file named for the note', d.suggestedFilename() === 'Ser Hollis (players).md', d.suggestedFilename());
check('and the note itself is untouched', await pg.evaluate(() => window.__dmforge.S.working.get(window.__dmforge.getIndex().notes.find(n => n.name === 'Ser Hollis').path).includes('is the poisoner')));
await pg.keyboard.press('Escape');

// ---- travel times on a place's page
const pinnedPlaces = await pg.evaluate(() => { const i = window.__dmforge.getIndex(); const n = i.byType.map.find(x => x.fm && x.fm.image === 'Greenhold Map.svg'); return [...n.body.matchAll(/^\s*[-*]\s+[\d.]+\s*,\s*[\d.]+\s*[—–-]+\s*\[\[([^\]|#]+)/gm)].map(m => i.resolve(m[1])).filter(x => x && x.type === 'location').map(x => x.name); });
const hub = pinnedPlaces[0];
await open(hub);
await pg.waitForSelector(P + '#locTravel table', { timeout: 8000 });
const rows = await pg.locator(P + '#locTravel tbody tr').count();
check('a pinned place lists the others on its map with distances', rows >= 2, String(rows));
const row = await pg.textContent(P + '#locTravel tbody tr');
check('each with a distance and times on foot and by horse', /\d/.test(row) && await pg.locator(P + '#locTravel tbody tr:first-child [data-pace="foot"]').count() === 1 && await pg.locator(P + '#locTravel tbody tr:first-child [data-pace="horse"]').count() === 1, row);
const f = await pg.textContent(P + '#locTravel tbody tr:first-child [data-pace="foot"]');
const h = await pg.textContent(P + '#locTravel tbody tr:first-child [data-pace="horse"]');
check('the horse is quicker than walking', f !== h || /few minutes|under an hour/.test(f), f + ' / ' + h);
check('nearest first', await pg.evaluate(() => { const v = [...document.querySelectorAll('.pane:not([hidden]) #locTravel tbody tr td:nth-child(2)')].map(td => { const m = /([\d.]+)\s*(km|m)\b/.exec(td.textContent); return m ? parseFloat(m[1]) * (m[2] === 'km' ? 1000 : 1) : 0; }); return v.every((x, i) => i === 0 || x >= v[i - 1]); }));
check('and a note on how it was worked out', /Straight-line/.test(await pg.textContent(P + '#locTravel')));

// ---- pin on a map from a place's page
const unpinned = await pg.evaluate(() => { const i = window.__dmforge.getIndex(); const maps = i.byType.map.filter(n => n.fm && n.fm.image); const pinned = new Set(maps.flatMap(n => [...n.body.matchAll(/\[\[([^\]|#]+)/g)].map(m => m[1].toLowerCase()))); return (i.byType.location || []).find(l => !pinned.has(l.name.toLowerCase())).name; });
await open(unpinned);
await pg.waitForSelector(P + '#locPinOnMap');
check('a place with no pin offers "Pin on a map…"', (await pg.textContent(P + '#locPinOnMap')).includes('Greenhold Map.svg'));
await pg.selectOption(P + '#locPinOnMap', { label: 'Greenhold Map.svg' });
await pg.waitForSelector(P + '#mapHint', { timeout: 8000 });
check('it opens the map ready to drop the pin', (await pg.textContent(P + '#mapHint')).includes('Click the map to put ' + unpinned + ' there'), await pg.textContent(P + '#mapHint'));
await pg.waitForFunction(() => { const i = document.querySelector('.pane:not([hidden]) #mapStage img'); return i && i.complete && i.clientWidth > 100; });
const sb = await pg.locator(P + '#mapStage').boundingBox();
await pg.mouse.click(sb.x + sb.width * 0.5, sb.y + sb.height * 0.5);
await pg.waitForTimeout(250);
check('and a click pins it', await pg.evaluate(n => window.__dmforge.getIndex().byType.map.find(x => x.fm && x.fm.image === 'Greenhold Map.svg').body.includes('[[' + n + ']]'), unpinned));
await open(unpinned);
await pg.waitForSelector(P + '#locTravel table', { timeout: 8000 });
check('and its page then shows travel times', await pg.locator(P + '#locTravel tbody tr').count() >= 2);

check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
