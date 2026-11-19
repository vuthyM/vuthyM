/* 2.42: the session page made for the table (Live first, play buttons apart from prep buttons) and a clearer top bar. Full demo campaign. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
const P = '.pane:not([hidden]) ';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const top = sel => pg.evaluate(s => Math.round(document.querySelector(s).getBoundingClientRect().top), sel);
const lum = c => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => c.startsWith('color(') ? x * 255 : x).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, c) => { const x = lum(a), y = lum(c); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// ---- the top bar
check('the duplicate switcher magnifier is gone', await pg.locator('#paletteBtn').count() === 0);
const ph = await pg.getAttribute('.search-wrap input', 'placeholder');
check('the search box says Ctrl+K opens the switcher', /Ctrl\+K|⌘K/.test(ph) && /\//.test(ph), ph);
await pg.keyboard.press('Control+KeyK');
check('and Ctrl+K does open it', await pg.locator('#palInput').count() === 1);
await pg.keyboard.press('Control+KeyK');
await sleep(100);
await pg.waitForTimeout(3300);                                     // the colours fade for 3 seconds, so let them settle before reading them
const idle = await pg.evaluate(() => { const b = document.querySelector('#pushBtn'); const cs = getComputedStyle(b); return { text: b.textContent, color: cs.color, bg: cs.backgroundColor, op: cs.opacity, page: getComputedStyle(document.querySelector('.topbar')).backgroundColor }; });
check('nothing to push reads at full strength', idle.op === '1', JSON.stringify(idle));
const bgForRatio = idle.bg === 'rgba(0, 0, 0, 0)' ? (idle.page === 'rgba(0, 0, 0, 0)' ? await pg.evaluate(() => getComputedStyle(document.body).backgroundColor) : idle.page) : idle.bg;
check('and with readable contrast', ratio(idle.color, bgForRatio) >= 4.5, idle.color + ' on ' + bgForRatio + ' = ' + ratio(idle.color, bgForRatio).toFixed(2));
await pg.evaluate(() => window.__dmforge.A.saveNoteEdit(window.__dmforge.getIndex().byType.npc[0].path, { body: window.__dmforge.getIndex().byType.npc[0].body + '\nx\n' }));
await sleep(200);
check('with changes waiting the chip says how many and carries a dot', /Push 1 change/.test(await pg.textContent('#pushBtn')) && await pg.evaluate(() => getComputedStyle(document.querySelector('#pushBtn'), '::before').content !== 'none'));

// ---- the session page: notes first, and only the buttons for what you are doing
await pg.evaluate(() => window.__dmforge.A.goto(window.__dmforge.getIndex().byType.session[0].path));
await pg.waitForSelector(P + '#spBar');
const noteTop = () => pg.evaluate(() => { const e = document.querySelector('.pane:not([hidden]) .md, .pane:not([hidden]) .editable-body'); return e ? Math.round(e.getBoundingClientRect().top) : 9999; });
check('a session that has not been played opens in Prep', (await pg.getAttribute(P + '.session-page', 'data-mode')) === 'prep' && (await pg.getAttribute(P + '#mode-prep', 'aria-selected')) === 'true');
check('in Prep the notes start in the top two thirds of the window (they used to start below the fold)', (await noteTop()) < 620, String(await noteTop()));
const rowTops = await pg.evaluate(() => ['#backToList', '#editBtn', '#pinNote', '#noteMore'].map(s => { const r = document.querySelector('.pane:not([hidden]) ' + s).getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
check('at a normal width the back link, Edit, the star and the ... share one row', Math.max(...rowTops) - Math.min(...rowTops) <= 3, rowTops.join(','));
const has = sel => pg.locator(P + sel).count();
check('Prep shows Import last session and not the play or wrap-up buttons', await has('#importLastBtn') === 1 && await has('#liveBtn') === 0 && await has('#tidyBtn') === 0 && await has('#closeoutBtn') === 0);
await pg.click(P + '#mode-run');
check('Run shows Go live and Run combat, and no wrap-up buttons', await has('#liveBtn') === 1 && await has('#runCombatBtn') === 1 && await has('#closeoutBtn') === 0 && await has('#importLastBtn') === 0);
await pg.click(P + '#mode-wrap');
check('Wrap up shows Tidy notes and Close out, with Close out the main one', await has('#tidyBtn') === 1 && await has('#closeoutBtn') === 1 && await pg.evaluate(() => document.querySelector('.pane:not([hidden]) #closeoutBtn').classList.contains('btn-primary')) && await has('#liveBtn') === 0);
check('Edit is the main button only in Prep', await pg.evaluate(() => !document.querySelector('.pane:not([hidden]) #editBtn').classList.contains('btn-primary')));
await pg.click(P + '#mode-prep');
check('Edit is the main button in Prep', await pg.evaluate(() => document.querySelector('.pane:not([hidden]) #editBtn').classList.contains('btn-primary')));
check('the cast, properties, outline and links are folded away under Details and Cast', await pg.evaluate(() => { const d = document.querySelector('.pane:not([hidden]) #spDetails'); const c = document.querySelector('.pane:not([hidden]) #spCast'); return !!d && !d.open && !!c; }));
await pg.click(P + '#mode-run');
await pg.click(P + '#liveBtn');
await pg.waitForSelector(P + '#livePanel');
check('going Live keeps you in Run, with the panel on the page', (await pg.getAttribute(P + '.session-page', 'data-mode')) === 'run' && await has('#livePanel') === 1);
const order = await pg.evaluate(() => ['#livePanel', '.sp-details'].map(s => { const e = document.querySelector('.pane:not([hidden]) ' + s); return e ? Math.round(e.getBoundingClientRect().top) : null; }));
check('the Live panel comes first, then Details, then the note', order.every(x => x !== null) && order[0] < order[1], order.join(','));
check('Live starts high on the page (under 460px from the top)', order[0] < 460, String(order[0]));
const clocks = await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) .live-clock-name')].map(e => ({ t: e.textContent, cut: e.scrollWidth > e.clientWidth + 1 })));
check('no clock name is cut off', clocks.length >= 3 && clocks.every(c => !c.cut), JSON.stringify(clocks));
const tasks = await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) .live-task')].map(l => { const i = l.querySelector('input').getBoundingClientRect(), t = l.querySelector('span').getBoundingClientRect(); return Math.abs((i.top + i.height / 2) - (t.top + 11)) < 7; }));
check('each tick box lines up with the first line of its text', tasks.length >= 1 && tasks.every(Boolean), JSON.stringify(tasks));
check('the clock buttons are big enough to hit', await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) .live .mini')].every(b => b.getBoundingClientRect().width >= 28 && b.getBoundingClientRect().height >= 28)));
check('each Reveal button says which secret it reveals', await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) [data-reveal]')].every(b => /^Reveal: /.test(b.getAttribute('aria-label')))));
// a narrower page: and still nothing spills
await pg.setViewportSize({ width: 1000, height: 900 }); await sleep(300);
check('at 1000px the page still does not scroll sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
