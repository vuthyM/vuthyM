/* 2.41: the sidebar that hides until you point at it. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const w = () => pg.evaluate(() => Math.round(document.querySelector('.sidebar').getBoundingClientRect().width));
const contentLeft = () => pg.evaluate(() => Math.round(document.querySelector('.pane:not([hidden]) .content, .main, .pane').getBoundingClientRect().left));
const away = () => pg.mouse.move(900, 500);

check('by default the sidebar is full width with a pin button', (await w()) === 252 && await pg.locator('#sbPin').count() === 1);
const full = await contentLeft();
await pg.click('#sbPin');
check('the pin button turns auto-hide on', await pg.evaluate(() => window.__dmforge.S.settings.sidebarAuto) === true && (await pg.getAttribute('#sbPin', 'aria-pressed')) === 'true');
await away(); await sleep(900);
check('and the sidebar closes to a column of icons when the mouse leaves', (await w()) === 60, String(await w()));
check('the page gets the room', (await contentLeft()) <= full - 150, (await contentLeft()) + ' vs ' + full);
check('icons are still there, labels are not', await pg.locator('.sidebar .nav-btn .ico').first().isVisible() && !(await pg.locator('.sidebar .nav-label').first().isVisible()));
check('there is a groove on its edge', await pg.evaluate(() => { const c = getComputedStyle(document.querySelector('.sidebar'), '::after'); return c.content !== 'none' && c.width === '4px'; }));
const rail = await contentLeft();

// a short visit does not open it
await pg.mouse.move(30, 300); await sleep(900); await away(); await sleep(900);
check('resting the mouse for under 2 seconds does not open it', (await w()) === 60);
// a long one does
await pg.mouse.move(30, 300);
await sleep(1200);
check('after one second it is still closed (and the groove is filling)', (await w()) === 60 && await pg.evaluate(() => document.querySelector('.sidebar').classList.contains('sb-waiting')));
await sleep(1300);
check('after two seconds it opens', (await w()) === 252, String(await w()));
check('over the page, without moving it', (await contentLeft()) === rail, (await contentLeft()) + ' vs ' + rail);
check('with the labels back', await pg.locator('.sidebar .nav-label').first().isVisible());
// it stays while the mouse is on it, closes half a second after it leaves
await pg.mouse.move(120, 600); await sleep(800);
check('it stays open while the mouse is on it', (await w()) === 252);
await away(); await sleep(250);
check('and has not closed yet a quarter second after leaving', (await w()) === 252);
await sleep(700);
check('it closes about half a second after the mouse leaves', (await w()) === 60, String(await w()));
// it stays while a menu is open
await pg.mouse.move(30, 300); await sleep(2400);
await pg.click('#campMenuBtn');
await away(); await sleep(1500);
check('it stays open while its campaign menu is showing', (await w()) === 252);
await pg.keyboard.press('Escape');
await pg.evaluate(() => document.querySelector('.camp-btn') && document.querySelector('.camp-btn').click());
await sleep(100);
await pg.mouse.click(900, 500); await sleep(1400);
check('and closes once it is shut', (await w()) === 60, String(await w()));
// keyboard
await pg.keyboard.press('Control+b'); await sleep(400);
check('Ctrl+B opens it at once', (await w()) === 252);
await pg.keyboard.press('Control+b'); await sleep(400);
check('and closes it', (await w()) === 60);
// the delay setting
await pg.evaluate(() => window.__dmforge.A.updateSetting('sidebarDelay', 1000));
await pg.mouse.move(30, 300); await sleep(1500);
check('a 1 second delay opens it sooner', (await w()) === 252);
await away(); await sleep(900);
await away(); await sleep(900);
await pg.evaluate(() => window.__dmforge.A.updateSetting('sidebarDelay', 500));
await pg.mouse.move(30, 300); await sleep(250);
check('half a second: still closed after a quarter of a second', (await w()) === 60);
await sleep(600);
check('and open by the time it is up', (await w()) === 252, String(await w()));
const typeDelay = async v => { await pg.fill('#setSidebarDelay', v); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); return pg.evaluate(() => window.__dmforge.S.settings.sidebarDelay); };
await pg.evaluate(() => window.__dmforge.A.openSettings('layout'));
await pg.waitForSelector('#setSidebarDelay');
check('Settings takes a time typed as a decimal', (await typeDelay('0.25')) === 250);
check('as a fraction', (await typeDelay('1/2')) === 500);
check('as a mixed number', (await typeDelay('1 1/2')) === 1500);
check('in milliseconds', (await typeDelay('750ms')) === 750);
check('with a unit', (await typeDelay('2 seconds')) === 2000);
check('and with a comma for the decimal point', (await typeDelay('0,5')) === 500);
check('0 means straight away', (await typeDelay('0')) === 0);
await typeDelay('0.5');
await pg.fill('#setSidebarDelay', 'soon'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
check('something that is not a time is refused, and the setting is kept', await pg.locator('#setSidebarDelayErr').count() === 1 && await pg.evaluate(() => window.__dmforge.S.settings.sidebarDelay) === 500);
await pg.fill('#setSidebarDelay', '99'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
check('so is more than ten seconds', await pg.evaluate(() => window.__dmforge.S.settings.sidebarDelay) === 500);
await pg.evaluate(() => window.__dmforge.A.setSection('overview'));
await away(); await sleep(900);
// turning it off from the pin
await pg.mouse.move(30, 300); await sleep(1500);
await pg.click('#sbPin');
await away(); await sleep(900);
check('clicking the pin again puts the sidebar back for good', (await w()) === 252 && await pg.evaluate(() => window.__dmforge.S.settings.sidebarAuto) === false);
// remembered
await pg.click('#sbPin'); await away(); await sleep(700);
const saved = await pg.evaluate(() => Object.entries(localStorage).filter(([k]) => /settings/i.test(k)).map(([, v]) => v).join('|'));
check('the choice is remembered', /"sidebarAuto":true/.test(saved) && /"sidebarDelay":500/.test(saved), saved.slice(0, 200));
// a menu never runs under the sidebar or off the window: the note's ... menu, with the buttons wrapped, at several widths
await away(); await sleep(800);
const sessPath = await pg.evaluate(() => window.__dmforge.getIndex().byType.session[0].path);
await pg.evaluate(p => window.__dmforge.A.goto(p), sessPath);
for (const width of [760, 900, 1100, 1500]) {
  await pg.setViewportSize({ width, height: 900 }); await sleep(250);
  await pg.waitForSelector('.pane:not([hidden]) #noteMore');
  await pg.evaluate(() => { const pm = document.querySelector('.pane:not([hidden]) #noteMore').closest('.popmenu'); pm.style.transform = ''; const x = pm.getBoundingClientRect().left; pm.style.transform = 'translateX(' + (100 - x) + 'px)'; });   // the ... sits near the left edge, as when the buttons wrap
  await pg.evaluate(() => document.querySelector('.pane:not([hidden]) #noteMore').click()); await sleep(150);
  const r = await pg.evaluate(() => { const m = document.querySelector('.pane:not([hidden]) .popmenu-pop:not([hidden])'); const sb = document.querySelector('.sidebar').getBoundingClientRect(); const b = m.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), sbRight: Math.round(sb.right), vw: innerWidth, side: m.className }; });
  check('at ' + width + 'px the note menu is fully visible, not under the sidebar', r.left >= r.sbRight && r.right <= r.vw, JSON.stringify(r));
  await pg.keyboard.press('Escape'); await sleep(100);
  await pg.evaluate(() => { const b = document.querySelector('.pane:not([hidden]) #noteMore'); if (b.getAttribute('aria-expanded') === 'true') b.click(); });
  await pg.evaluate(() => { document.querySelector('.pane:not([hidden]) #noteMore').closest('.popmenu').style.transform = ''; });
}
await pg.setViewportSize({ width: 1440, height: 900 });
// narrow windows keep their drawer
await pg.setViewportSize({ width: 800, height: 700 }); await sleep(300);
check('on a narrow window the pin button is hidden and the drawer is used', !(await pg.locator('#sbPin').isVisible()) && await pg.locator('#drawerBtn').isVisible());
// the session you are running is pinned under Combat (2.47.4)
await pg.setViewportSize({ width: 1440, height: 900 }); await sleep(300);
await pg.evaluate(() => { window.__dmforge.A.updateSetting('sidebarAuto', false); window.__dmforge.A.setSection('overview'); }); await sleep(300);
const sess = () => pg.evaluate(() => { const e = document.querySelector('#navSession'); return e ? { label: e.querySelector('.nav-label').textContent, title: e.title, path: e.dataset.session, after: [...document.querySelectorAll('#navPinned > *')].map(x => x.id) } : null; });
const s0 = await sess();
check('the session you are running is pinned under Combat', !!s0 && s0.after.join() === 'navParty,navCombat,navSession', s0 && s0.after.join());
check('it shows the session\'s name without its date, with the full name as a tooltip', !!s0 && !/^\d{4}-\d{2}-\d{2}/.test(s0.label) && s0.title.endsWith(await pg.evaluate(p => window.__dmforge.getIndex().byPath.get(p).name, s0.path)), JSON.stringify(s0));
check('by default it is the newest session', await pg.evaluate(p => window.__dmforge.getIndex().byType.session[0].path === p, s0.path));
await pg.click('#navSession'); await sleep(250);
check('one click opens it, and it is marked as the page you are on', (await pg.textContent('.pane:not([hidden]) #noteTitle')) === (await pg.evaluate(p => window.__dmforge.getIndex().byPath.get(p).name, s0.path)) && (await pg.getAttribute('#navSession', 'aria-current')) === 'page');
const created = await pg.evaluate(() => window.__dmforge.A.createSession({ title: 'The Pinned One', date: '2027-01-01', number: 91, word: 'Session' }));
await sleep(250);
const s1 = await sess();
check('a new session becomes the pinned one straight away', !!s1 && s1.path === created && /Session 91/.test(s1.label), JSON.stringify(s1));
const older = await pg.evaluate(c => window.__dmforge.getIndex().byType.session.find(x => x.path !== c).path, created);
await pg.evaluate(p => window.__dmforge.A.setCurrentSession(p), older); await sleep(200);
check('it follows the session the log box is pointed at', (await sess()).path === older);
await pg.evaluate(p => window.__dmforge.A.setCurrentSession(p), created); await sleep(200);
await pg.evaluate(() => window.__dmforge.A.createSession({ title: 'An extremely long title that cannot possibly fit in the sidebar however wide it is made', date: '2027-02-01', number: 92, word: 'Session' })); await sleep(250);
check('a very long name is cut with an ellipsis and stays inside the sidebar', await pg.evaluate(() => { const b = document.querySelector('#navSession'), sb = document.querySelector('.sidebar'); const l = b.querySelector('.nav-label'); return l.scrollWidth > l.clientWidth && b.getBoundingClientRect().right <= sb.getBoundingClientRect().right + 1; }));
await pg.evaluate(() => window.__dmforge.A.updateSetting('sidebarAuto', true)); await away(); await sleep(900);
check('in the icon column it shows as an icon, with the name on hover', await pg.evaluate(() => { const b = document.querySelector('#navSession'); const r = b.getBoundingClientRect(); return r.width > 30 && getComputedStyle(b.querySelector('.nav-label')).display === 'none' && /Open the session/.test(b.title); }));
await pg.evaluate(() => window.__dmforge.A.updateSetting('sidebarAuto', false)); await sleep(300);
await pg.setViewportSize({ width: 800, height: 700 }); await sleep(300);
await pg.click('#drawerBtn'); await sleep(300);
check('in the narrow-window drawer it is there too', await pg.locator('#navSession').isVisible());
await pg.setViewportSize({ width: 1440, height: 900 }); await sleep(200);
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
