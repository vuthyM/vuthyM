/* 2.44: the tool island: timer, dice and log in one pill that grows to hold the tool; the cheat sheet in its own box. Full demo campaign. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const away = () => pg.mouse.move(700, 650);
const state = () => pg.evaluate(() => { const S = window.__dmforge.S; return { timer: !!S.timer.open, dice: !!S.diceOpen, log: !!S.logOpen, pin: !!S.islandPin }; });
const widthOf = sel => pg.evaluate(s => Math.round(document.querySelector(s).getBoundingClientRect().width), sel);
await pg.evaluate(() => window.__dmforge.A.goto(window.__dmforge.getIndex().byType.session[0].path));
await away();

// ---- closed: three tools in the pill, the cheat sheet in its own box
check('the pill holds the timer, dice and log', await pg.locator('.island-bar #timerChip').count() === 1 && await pg.locator('.island-bar #diceBtn').count() === 1 && await pg.locator('.island-bar #logBtn').count() === 1);
check('and the cheat sheet is in a box of its own', await pg.locator('.tb-solo #cheatBtn').count() === 1 && await pg.locator('.island-bar #cheatBtn').count() === 0);
const closedW = await widthOf('.island-bar');
const searchW0 = await widthOf('.search-wrap');

// ---- dice
await pg.click('#diceBtn'); await sleep(450);
check('pressing Dice opens it inside the island, not in a window of its own', await pg.locator('.island #islandCard #diceBox').count() === 1 && await pg.evaluate(() => getComputedStyle(document.querySelector('#diceBox')).position !== 'fixed'));
const openW = await widthOf('.island-bar');
check('the pill has grown', openW >= 330 && openW > closedW + 150, closedW + ' -> ' + openW);
check('and the search box gave up room for it', (await widthOf('.search-wrap')) < searchW0, searchW0 + ' -> ' + await widthOf('.search-wrap'));
check('the card is as wide as the pill and hangs from it', await pg.evaluate(() => { const a = document.querySelector('.island-bar').getBoundingClientRect(), c = document.querySelector('#islandCard').getBoundingClientRect(); return Math.abs(a.left - c.left) <= 1 && Math.abs(a.width - c.width) <= 2 && Math.abs(c.top - a.bottom) <= 3; }));
await pg.click('[data-die="20"]'); await sleep(150);
check('and it works: a roll gives a result', await pg.locator('#diceTotal').count() === 1);

// ---- one at a time
await pg.click('#timerChip'); await sleep(450);
let st = await state();
check('pressing Timer swaps to it and closes the dice', st.timer && !st.dice && !st.log, JSON.stringify(st));
check('the timer is in the card', await pg.locator('#islandCard #timerBox').count() === 1 && await pg.locator('#diceBox').count() === 0);
await pg.click('#timerToggle'); await sleep(1300);
await pg.click('#timerChip'); await sleep(450);
check('pressing the open tool again closes it', (await state()).timer === false && await pg.locator('#islandCard').count() === 0);
await sleep(350);
check('the pill shrinks back', Math.abs((await widthOf('.island-bar')) - closedW) < 120, String(await widthOf('.island-bar')));
check('a running timer keeps its time in the closed pill', /\d:\d\d/.test(await pg.textContent('#timerChip')) && (await widthOf('.island-bar')) >= closedW, await pg.textContent('#timerChip'));
await pg.evaluate(() => window.__dmforge.A.timerReset());

// ---- it closes the moment the mouse leaves
await pg.click('#diceBtn'); await sleep(400);
await pg.mouse.move(700, 24); await sleep(100);                      // onto the pill (it sits at about x 540 to 960)
await pg.mouse.move(760, 120); await sleep(60);                      // down into the card
check('it stays while the mouse is on the pill or its card', (await state()).dice === true);
await pg.mouse.move(200, 600); await sleep(120);
check('and closes at once when the mouse moves away', (await state()).dice === false, JSON.stringify(await state()));

// ---- pin
await pg.click('#diceBtn'); await sleep(400);
check('there is a pin button while it is open', await pg.locator('#islandPin').count() === 1 && (await pg.getAttribute('#islandPin', 'aria-pressed')) === 'false');
await pg.click('#islandPin');
check('pinning is shown', (await pg.getAttribute('#islandPin', 'aria-pressed')) === 'true' && (await state()).pin === true);
await away(); await sleep(400);
check('a pinned island stays open when the mouse leaves', (await state()).dice === true);
await pg.keyboard.press('Escape'); await sleep(300);
st = await state();
check('Escape closes it, and the pin is forgotten', !st.dice && st.pin === false, JSON.stringify(st));

// ---- the log, opened from the keyboard, and typing
await away();
await pg.keyboard.press('Alt+KeyL'); await sleep(400);
check('Option+L opens the log in the island', (await state()).log === true && await pg.locator('#islandCard #logBox').count() === 1);
await sleep(300);
check('with the mouse never having been on it, it stays', (await state()).log === true);
await pg.mouse.move(700, 24); await sleep(80); await away(); await sleep(150);
check('once the mouse has been on it and leaves, an empty log closes', (await state()).log === false, JSON.stringify(await state()));
await pg.click('#logBtn'); await sleep(400);
await pg.fill('#sessionLine', 'Half a sentence');
await away(); await sleep(250);
check('but not while you are partway through a line', (await state()).log === true);
await pg.fill('#sessionLine', '');
await pg.mouse.move(700, 24); await sleep(60); await away(); await sleep(150);
check('and it goes once the line is empty again', (await state()).log === false);
await pg.click('#logBtn'); await sleep(400);
await pg.fill('#sessionLine', 'The bridge is out');
await pg.keyboard.press('Enter'); await sleep(200);
check('and logging a line (which adds a Push button and shifts the top bar) does not close it', (await state()).log === true && /Push 1 change/.test(await pg.textContent('#pushBtn')));
check('a line still logs from inside the island', await pg.evaluate(() => [...window.__dmforge.getIndex().byType.session].some(n => /The bridge is out/.test(window.__dmforge.S.working.get(n.path)))));
await pg.keyboard.press('Escape'); await sleep(250);

// ---- the cheat sheet is its own thing
await pg.click('#cheatBtn'); await sleep(350);
check('the cheat sheet still opens as its own panel', await pg.locator('#cheatPanel').count() === 1 && await pg.locator('.island #cheatPanel').count() === 0);
await pg.keyboard.press('Escape'); await sleep(250);

// ---- a narrow window keeps the floating boxes and the bottom bar
await pg.setViewportSize({ width: 600, height: 800 }); await sleep(300);
check('on a phone-sized window the pill is gone', !(await pg.locator('.island').isVisible()));
await pg.evaluate(() => window.__dmforge.A.setDiceOpen(true)); await sleep(300);
check('and the tools open as floating boxes', await pg.locator('#diceBox').count() === 1 && await pg.evaluate(() => getComputedStyle(document.querySelector('#diceBox')).position === 'fixed'));
check('and the page does not scroll sideways there', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
// ---- the sidebar keeps Party and Combat on show
await pg.setViewportSize({ width: 1280, height: 800 }); await sleep(300);
check('Party and Combat are always visible under Overview, without opening a group', await pg.locator('#navPinned #navParty').isVisible() && await pg.locator('#navPinned #navCombat').isVisible());
check('so Combat is one click from anywhere', await pg.evaluate(() => { document.querySelector('#navCombat').click(); return window.__dmforge.S.section === 'combat'; }));
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
