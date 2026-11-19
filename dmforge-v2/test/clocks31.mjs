/* 2.31: odd clock sizes, clocks that belong to a note (a plot thread), and the dropdown arrow. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.evaluate(() => window.__dmforge.A.openPlainDemo());
await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
await pg.waitForSelector('.sidebar');
await pg.click('#navClocks');
await pg.waitForSelector('#clockAdd');
const sizes = await pg.locator('#clockSize option').allTextContents();
check('the slice choices include the odd sizes: 2, 3, 5, 7, 9', ['2 slices', '3 slices', '5 slices', '7 slices', '9 slices'].every(x => sizes.includes(x)), sizes.join());
await pg.fill('#clockName', 'The vault door'); await pg.selectOption('#clockSize', '3'); await pg.click('#clockAddBtn');
await pg.waitForSelector('[data-clock="The vault door"]');
check('a 3-slice clock is drawn with 3 slices', await pg.locator('[data-clock="The vault door"] svg path').count() === 3);
const clocksText = () => pg.evaluate(() => { const S = window.__dmforge.S; return S.working.get(S.campaign.path + '/Clocks and Standing.md'); });
check('and saved as 0/3', /\*\*The vault door\*\* — 0\/3/.test(await clocksText()));
await pg.click('[data-clock="The vault door"] button[aria-label^="Fill a slice"]');
check('ticking works at 3 (1/3)', (await pg.textContent('[data-clock="The vault door"] [data-filled]')) === '1/3');

// link it to a plot thread
const box = pg.locator('[data-clock="The vault door"] input[name="clock-link"]');
await box.fill('The Missing Bells'); await box.blur();
await pg.waitForTimeout(150);
check('linking to a plot thread writes a plain [[link]] in the clock\'s line', /\*\*The vault door\*\* — 1\/3 — \[\[The Missing Bells\]\]/.test(await clocksText()), await clocksText());
check('the clock shows the thread\'s status', (await pg.textContent('[data-clock="The vault door"] [data-clockstatus]')).trim() === 'Active');
await box.fill('No Such Note'); await box.blur();
await pg.waitForTimeout(150);
check('a name that is not a note is refused, and the link stays', /\[\[The Missing Bells\]\]/.test(await clocksText()) && /There is no note called/.test(await pg.textContent('.toasts')));
// on the thread's own page
await pg.evaluate(() => { const n = window.__dmforge.getIndex().notes.find(x => x.name === 'The Missing Bells'); window.__dmforge.A.goto(n.path); });
await pg.waitForSelector('#noteClocks');
check('the thread\'s page shows its clock, with the count', (await pg.textContent('[data-noteclock="The vault door"]')).includes('1/3'));
await pg.click('[data-noteclock="The vault door"] button[aria-label^="Fill a slice"]');
check('ticking from the thread updates the clock', (await pg.textContent('[data-noteclock="The vault door"] [data-filled]')) === '2/3' && /\*\*The vault door\*\* — 2\/3/.test(await clocksText()));
await pg.click('[data-noteclock="The vault door"] button[aria-label^="Fill a slice"]');
check('filling it says so, and changes nothing else (the thread status is not touched)', /is full/.test(await pg.textContent('.toasts')) && await pg.evaluate(() => { const n = window.__dmforge.getIndex().notes.find(x => x.name === 'The Missing Bells'); return n.fm.status === 'Active'; }));
check('the Fill button is off at full, and Minus is on', await pg.locator('[data-noteclock="The vault door"] button[aria-label^="Fill a slice"]').isDisabled() && await pg.locator('[data-noteclock="The vault door"] button[aria-label^="Take a slice"]').isEnabled());
// another note has none
await pg.evaluate(() => { const n = window.__dmforge.getIndex().notes.find(x => x.name === 'Who Poisoned the Well'); window.__dmforge.A.goto(n.path); });
await pg.waitForTimeout(200);
check('a note with no clock shows no strip', await pg.locator('#noteClocks').count() === 0);
// renaming the thread keeps the link
await pg.evaluate(() => { const n = window.__dmforge.getIndex().notes.find(x => x.name === 'The Missing Bells'); window.__dmforge.A.renameNote(n.path, { name: 'The Silent Bells', updateLinks: true }); });
await pg.waitForTimeout(300);
check('renaming the thread updates the clock\'s link', /\[\[The Silent Bells\]\]/.test(await clocksText()), await clocksText());
// the arrow
await pg.click('#navClocks'); await pg.waitForSelector('#clockSize');
const st = await pg.evaluate(() => { const c = getComputedStyle(document.querySelector('#clockSize')); return { app: c.appearance, pr: parseFloat(c.paddingRight), img: c.backgroundImage.slice(0, 20), pos: c.backgroundPosition }; });
check('dropdowns use our own arrow, set in from the edge with room for the text', st.app === 'none' && st.pr >= 30 && st.img.startsWith('url('), JSON.stringify(st));
const all = await pg.evaluate(() => [...document.querySelectorAll('select')].every(s => parseFloat(getComputedStyle(s).paddingRight) >= 30));
check('and so does every dropdown on the page', all);
check('no errors from the page', errors.length === 0, errors.join('\n'));
await b.close();
const ok = results.filter(Boolean).length;
console.log(`${ok}/${results.length} checks passed`);
process.exit(ok === results.length ? 0 : 1);
