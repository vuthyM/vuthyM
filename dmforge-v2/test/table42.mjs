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
const lum = c => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
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
const bgForRatio = idle.bg === 'rgba(0, 0, 0, 0)' ? idle.page : idle.bg;
check('and with readable contrast', ratio(idle.color, bgForRatio) >= 4.5, idle.color + ' on ' + bgForRatio + ' = ' + ratio(idle.color, bgForRatio).toFixed(2));
await pg.evaluate(() => window.__dmforge.A.saveNoteEdit(window.__dmforge.getIndex().byType.npc[0].path, { body: window.__dmforge.getIndex().byType.npc[0].body + '\nx\n' }));
await sleep(200);
check('with changes waiting the chip says how many and carries a dot', /Push 1 change/.test(await pg.textContent('#pushBtn')) && await pg.evaluate(() => getComputedStyle(document.querySelector('#pushBtn'), '::before').content !== 'none'));

// ---- the session page
await pg.evaluate(() => window.__dmforge.A.goto(window.__dmforge.getIndex().byType.session[0].path));
await pg.waitForSelector(P + '#liveBtn');
const rowTops = await pg.evaluate(() => ['#editBtn', '#liveBtn', '#closeoutBtn', '#importLastBtn', '#noteMore'].map(s => { const r = document.querySelector('.pane:not([hidden]) ' + s).getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
check('at a normal width every action sits on one row, the ... included', Math.max(...rowTops) - Math.min(...rowTops) <= 3, rowTops.join(','));
const groups = await pg.evaluate(() => { const g = el => el.closest('.act-group').className; return { live: g(document.querySelector('.pane:not([hidden]) #liveBtn')), run: g([...document.querySelectorAll('.pane:not([hidden]) .note-actions .btn')].find(x => /Run combat/.test(x.textContent))), close: g(document.querySelector('.pane:not([hidden]) #closeoutBtn')), imp: g(document.querySelector('.pane:not([hidden]) #importLastBtn')) }; });
check('Live and Run combat are together, apart from Import and Close out', /act-main/.test(groups.live) && /act-main/.test(groups.run) && /act-after/.test(groups.close) && /act-after/.test(groups.imp), JSON.stringify(groups));
check('the prep and after buttons are quieter than the play ones', await pg.evaluate(() => getComputedStyle(document.querySelector('.pane:not([hidden]) #closeoutBtn')).color !== getComputedStyle(document.querySelector('.pane:not([hidden]) #liveBtn')).color));
await pg.click(P + '#liveBtn');
await pg.waitForSelector(P + '#livePanel');
const order = await pg.evaluate(() => ['#livePanel', '#castStrip', '.props-box', '#prepCheck'].map(s => { const e = document.querySelector('.pane:not([hidden]) ' + s); return e ? Math.round(e.getBoundingClientRect().top) : null; }));
check('Live is first, then the cast, then the properties and the prep check', order.every(x => x !== null) && order[0] < order[1] && order[1] < order[2] && order[2] < order[3], order.join(','));
check('Live starts high on the page (under 460px from the top)', order[0] < 460, String(order[0]));
const clocks = await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) .live-clock-name')].map(e => ({ t: e.textContent, cut: e.scrollWidth > e.clientWidth + 1 })));
check('no clock name is cut off', clocks.length >= 3 && clocks.every(c => !c.cut), JSON.stringify(clocks));
const tasks = await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) .live-task')].map(l => { const i = l.querySelector('input').getBoundingClientRect(), t = l.querySelector('span').getBoundingClientRect(); return Math.abs((i.top + i.height / 2) - (t.top + 11)) < 7; }));
check('each tick box lines up with the first line of its text', tasks.length >= 1 && tasks.every(Boolean), JSON.stringify(tasks));
check('the clock buttons are big enough to hit', await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) .live .mini')].every(b => b.getBoundingClientRect().width >= 28 && b.getBoundingClientRect().height >= 28)));
check('each Reveal button says which secret it reveals', await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) [data-reveal]')].every(b => /^Reveal: /.test(b.getAttribute('aria-label')))));
// a narrower page: the groups wrap as groups, and still nothing spills
await pg.setViewportSize({ width: 1000, height: 900 }); await sleep(300);
check('at 1000px the page still does not scroll sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
const wrapTops = await pg.evaluate(() => ['#editBtn', '#liveBtn', '#closeoutBtn'].map(s => Math.round(document.querySelector('.pane:not([hidden]) ' + s).getBoundingClientRect().top)));
check('and Live stays beside Edit while the prep buttons drop together', wrapTops[0] === wrapTops[1], wrapTops.join(','));
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
