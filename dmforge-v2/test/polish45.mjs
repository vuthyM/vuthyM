/* 2.45: combat starts on the top initiative, metric only, Combat and Party pinned, and the polish from the design review. Full demo campaign. */
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
const lum = c => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, c) => { const x = lum(a), y = lum(c); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const go = label => pg.evaluate(l => [...document.querySelectorAll('.nav-btn')].find(e => new RegExp('^\\s*' + l).test(e.textContent)).click(), label);

// ---- combat: the top of the list goes first, and the turn reads as one phrase
await pg.evaluate(() => { const A = window.__dmforge.A; A.addMonstersToCombat([{ m: { n: 'Slow', key: 'x:slow', hp: 5, ac: 10, ini: -5 }, qty: 1 }, { m: { n: 'Quick', key: 'x:quick', hp: 5, ac: 10, ini: 5 }, qty: 1 }]); A.setSection('combat'); });
await pg.waitForSelector('#combatTurn');
const order = await pg.evaluate(() => [...document.querySelectorAll('.c-init')].map(i => +i.value));
check('the list is highest initiative first', order.every((v, i) => i === 0 || v <= order[i - 1]), order.join(','));
const first = await pg.evaluate(() => document.querySelector('.combat-who').textContent);
const top = await pg.evaluate(() => document.querySelector('.cmb-row .c-name, .combatant .c-name, [data-combatant] .c-name') ? 1 : 0);
check('whose turn it is is the one at the top of the list', await pg.evaluate(() => { const S = window.__dmforge.S; return S.combat.turn === 0; }));
check('the turn reads as one phrase in one style', await pg.evaluate(() => { const w = document.querySelector('.combat-who'); return /’s turn$/.test(w.textContent) && w.children.length === 0; }), first);

// ---- metric only
await pg.evaluate(() => window.__dmforge.A.openSettings('appearance'));
await pg.waitForSelector('#accentGroup');
check('Settings has no units choice', await pg.locator('#setMetric, #setImperial').count() === 0 && !(await pg.textContent('#settingsPage')).match(/Imperial|feet, miles and pounds/));
await pg.evaluate(() => window.__dmforge.A.setSection('overview'));
await pg.evaluate(() => window.__dmforge.A.toggleCheat && window.__dmforge.A.toggleCheat(true)); await sleep(300);
check('the cheat sheet has no unit switch', await pg.locator('.cs-units').count() === 0);
await pg.keyboard.press('Escape'); await sleep(200);
await pg.evaluate(() => localStorage.setItem('dmforge:settings', JSON.stringify({ units: 'imperial' })));
await pg.reload(); await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar');
check('an old saved "imperial" setting is ignored', await pg.evaluate(() => window.__dmforge.S.settings.units === undefined));

// ---- Combat and Party are pinned
check('Party and Combat sit under Overview, always visible', await pg.locator('#navPinned #navParty').isVisible() && await pg.locator('#navPinned #navCombat').isVisible());
check('and are not in the Table group any more', await pg.locator('.nav-section #navCombat, .nav-section #navParty').count() === 0);

// ---- polish: names, headings, targets
await pg.evaluate(() => window.__dmforge.A.goto(window.__dmforge.getIndex().byType.session[0].path));
await pg.waitForSelector(P + '#noteTitle'); await sleep(500);
const boxes = await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) input[type=checkbox][data-task]')].map(i => i.getAttribute('aria-label')));
check('every task checkbox is named by its task', boxes.length >= 3 && boxes.every(x => x && x.length > 2), JSON.stringify(boxes.slice(0, 4)));
check('and big enough to hit', await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) input[type=checkbox][data-task]')].every(i => i.getBoundingClientRect().width >= 17)));
const level1 = async label => { await go(label); await sleep(450); return pg.evaluate(() => { const hs = [...document.querySelectorAll('.pane:not([hidden]) h1,.pane:not([hidden]) h2,.pane:not([hidden]) h3,.pane:not([hidden]) [role=heading]')].filter(h => h.getBoundingClientRect().height > 0); const f = hs[0]; return f ? (f.tagName === 'H1' || f.getAttribute('aria-level') === '1') : false; }); };
for (const l of ['NPCs', 'Party', 'Combat']) check(l + ' opens on a level-1 heading', await level1(l));
await go('Overview'); await sleep(300);
await pg.keyboard.press('Control+KeyK'); await pg.waitForSelector('#palInput');
check('the quick switcher input has a name', (await pg.getAttribute('#palInput', 'aria-label')).length > 5);
await pg.waitForTimeout(400);
check('and shows where the focus is', await pg.evaluate(() => getComputedStyle(document.querySelector('.pal-input')).boxShadow !== 'none'));
check('its placeholder is readable', await pg.evaluate(() => { const i = document.querySelector('#palInput'); const c = getComputedStyle(i, '::placeholder').color, bg = getComputedStyle(document.querySelector('.modal')).backgroundColor; return [c, bg]; }).then(([c, bg]) => ratio(c, bg) >= 4.5));
await pg.keyboard.press('Escape');

// the star is reachable from the keyboard
await pg.evaluate(() => document.querySelector('#navPinned #navCombat').focus());
await pg.keyboard.press('Tab');
check('Tab from a page in the sidebar reaches its star', await pg.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-star')));
await pg.keyboard.press('Enter'); await sleep(200);
check('and Enter pins it to Favourites', await pg.locator('.nav-fav').count() === 1);
check('the star is a decent target', await pg.evaluate(() => { const s = document.querySelector('.nav-fav .nav-star'); const r = s.getBoundingClientRect(); return r.width >= 26 && r.height >= 26; }));

// ---- polish: buttons, copy, motion, contrast
await go('Party'); await sleep(500);
{ const bt = await pg.evaluate(() => (document.querySelector('.pane:not([hidden])') || document.body).textContent); const m = bt.match(/.{40}last last.{40}/); check('the Spotlight no longer says "last last session"', !m, m && m[0]); }
await pg.evaluate(() => window.__dmforge.A.setSection('combat')); await sleep(300);
check('ghost buttons have an outline, so they read as buttons', await pg.evaluate(() => { const g = document.querySelector('.btn-ghost'); return !g || getComputedStyle(g).borderTopColor !== 'rgba(0, 0, 0, 0)'; }));
check('the theme fade is short (0.5 seconds at most)', await pg.evaluate(() => { const v = getComputedStyle(document.documentElement).getPropertyValue('--theme-ms').trim(); return parseFloat(v) * (/ms$/.test(v) ? 0.001 : 1) <= 0.5; }));
await sleep(600);
const pairs = await pg.evaluate(() => { const get = (sel, bgSel) => { const e = document.querySelector(sel); return e ? [getComputedStyle(e).color, getComputedStyle(bgSel ? document.querySelector(bgSel) : e).backgroundColor] : null; }; return { primary: get('.btn-primary'), badge: get('.nav-btn[aria-current="page"] .badge', '.nav-btn[aria-current="page"]'), nav: get('.nav-btn[aria-current="page"]') }; });
check('primary buttons: text on gold passes 4.5:1', !pairs.primary || ratio(...pairs.primary) >= 4.5, JSON.stringify(pairs.primary));
check('and so does the active page and its badge', ratio(...pairs.nav) >= 4.5 && (!pairs.badge || ratio(...pairs.badge) >= 4.5), JSON.stringify(pairs));
check('the "things to look at" pill passes too', await (async () => { await pg.evaluate(() => window.__dmforge.A.goto(window.__dmforge.getIndex().byType.session[0].path)); await pg.waitForSelector('.pane:not([hidden]) #prepCount'); await sleep(600); const c = await pg.evaluate(() => { const e = document.querySelector('.pane:not([hidden]) #prepCount'); return [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]; }); return ratio(...c) >= 4.5; })());
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
