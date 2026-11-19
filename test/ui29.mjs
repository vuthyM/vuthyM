/* 2.29: the redesigned shell - accordion sidebar, Favourites, two dark styles, Overview, graph filters, tour card, narrow windows. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
const bg = () => pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
const open = () => pg.$$eval('.nav-items:not([hidden])', els => els.map(e => e.parentElement.dataset.navgroup));
const dom = sel => pg.evaluate(s => document.querySelector(s).click(), sel);

// ---- accordion: one group open at a time
check('the sidebar has four groups and Overview, Favourites and Characters around them', await pg.locator('.nav-section').count() === 4 && await pg.locator('#navOverview').count() === 1 && await pg.locator('#navCharacters').count() === 1);
check('only the group holding the page you are on is open', (await open()).length === 1, JSON.stringify(await open()));
await pg.click('.nav-group-btn >> nth=2');
check('opening another group closes the first', (await open()).length === 1);
const g2 = (await open())[0];
await pg.click('.nav-group-btn >> nth=0');
check('and again', (await open()).length === 1 && (await open())[0] !== g2);

// ---- Favourites
check('the Favourites section is empty to begin with, saying how to add', (await pg.locator('.nav-fav').count()) === 0 && /star|drag/i.test(await pg.innerText('#navFavs')));
await dom('[data-star="sec:combat"]');
await pg.waitForSelector('.nav-fav');
check('starring a page adds it to Favourites', (await pg.locator('.nav-fav').count()) === 1 && (await pg.textContent('.nav-fav')).includes('Combat'));
check('and it is still where it was, pinned under Overview', await pg.locator('#navPinned #navCombat').count() === 1 && await pg.locator('.nav-section #navCombat').count() === 0);
await pg.reload(); await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar');
check('Favourites survive a reload (kept per campaign)', await pg.locator('.nav-fav').count() === 1);
// drag a page into Favourites
const dt = await pg.evaluateHandle(() => new DataTransfer());
await dom('.nav-fav .nav-unpin');
check('the ✕ on a favourite unpins it', await pg.locator('.nav-fav').count() === 0);
await pg.evaluate(() => {
  const src = document.querySelector('#navParty'), dst = document.querySelector('#navFavs');
  const d = new DataTransfer();
  src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: d, bubbles: true }));
  dst.dispatchEvent(new DragEvent('dragover', { dataTransfer: d, bubbles: true, cancelable: true }));
  dst.dispatchEvent(new DragEvent('drop', { dataTransfer: d, bubbles: true, cancelable: true }));
});
await pg.waitForTimeout(150);
check('dragging a page onto Favourites pins it', (await pg.locator('.nav-fav').count()) === 1 && (await pg.textContent('.nav-fav')).includes('Party'));
await pg.click('.nav-fav');
check('clicking a favourite goes to that page', await pg.evaluate(() => window.__dmforge.S.section) === 'party');
// a note can be starred too
await dom('#navOverview');
await pg.waitForSelector('#overviewTitle');
await pg.evaluate(() => window.__dmforge.A.goto(window.__dmforge.getIndex().notes.find(n => n.type === 'npc').path));
await pg.waitForSelector('#pinNote', { state: 'attached' });
await pg.click('#pinNote');
await pg.waitForFunction(() => document.querySelectorAll('.nav-fav').length === 2);
check('a note can be pinned from its ⋯ menu', await pg.locator('.nav-fav').count() === 2);

// ---- two dark styles
const warm = await bg();
check('dark mode is the warm style by default', warm === 'rgb(24, 23, 20)', warm);
await dom('#navSettings');
await pg.waitForSelector('#menuSettings', { state: 'attached' });
await pg.click('#menuSettings'); await pg.click('[data-setcat="appearance"]'); await pg.waitForSelector('#setDarkSlate');
await pg.click('#setDarkSlate');
await pg.waitForTimeout(3300);
const slate = await bg();
check('choosing the blue-grey style changes the dark background', slate !== warm && slate === 'rgb(21, 23, 29)', slate);
check('the choice is kept in settings', await pg.evaluate(() => window.__dmforge.S.settings.darkStyle) === 'slate');
await pg.click('#setDarkWarm'); await pg.waitForTimeout(3300);
check('and warm comes back', (await bg()) === warm);
await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage'));

// ---- Overview
await pg.click('#navOverview');
await pg.waitForSelector('#overviewTitle');
check('the Overview leads with the next session, not stat tiles', (await pg.locator('.stat-grid').count()) === 0 && (await pg.textContent('#overviewTitle')).length > 3);
check('with a timer and an Open button', await pg.locator('#overviewTimer').count() === 1 && await pg.locator('#overviewOpen').count() === 1);

// ---- note page
await pg.evaluate(() => window.__dmforge.A.goto(window.__dmforge.getIndex().notes.find(n => n.type === 'npc').path));
await pg.waitForSelector('#editBtn');
check('a note has one clear Edit button and a ⋯ menu', await pg.locator('#editBtn').count() === 1 && await pg.locator('#noteMore').count() === 1);
check('Properties are folded up (a collapsible box)', await pg.locator('.props-box').count() === 1);

// ---- graph: filters on demand, full-width canvas
await pg.evaluate(() => document.querySelector('#navGraph').click());
await pg.waitForSelector('#graphCanvas');
const w1 = await pg.evaluate(() => document.querySelector('.graph-wrap').getBoundingClientRect().width);
check('the graph canvas has the full width until you open Filters', w1 > 900, String(w1));
await pg.click('#graphFilters');
const w2 = await pg.evaluate(() => document.querySelector('.graph-wrap').getBoundingClientRect().width);
check('Filters opens a side panel', w2 < w1 && await pg.locator('#graphSearch').isVisible());
check('a big campaign opens around its most-linked note, not as a hairball', /around/.test(await pg.textContent('#graphStats')), await pg.textContent('#graphStats'));

// ---- tour card stays in the window, off the thing it points at
await pg.evaluate(() => window.__dmforge.A.startTour());
const sizes = [[1440, 900], [1100, 640], [800, 600], [390, 760]];
let tourOk = true, why = '';
for (const [w, h] of sizes) {
  await pg.setViewportSize({ width: w, height: h });
  for (let i = 0; i < 13; i++) {
    await pg.evaluate(n => window.__dmforge.A.tourGo(n), i);
    await pg.waitForTimeout(320);
    const r = await pg.evaluate(() => {
      const c = document.querySelector('#tourCard').getBoundingClientRect(); const sp = document.querySelector('#tourSpot');
      const s = sp ? sp.getBoundingClientRect() : null;
      const overlap = s && !(c.right <= s.left || c.left >= s.right || c.bottom <= s.top || c.top >= s.bottom);
      return { inside: c.left >= 0 && c.top >= 0 && c.right <= innerWidth + 0.5 && c.bottom <= innerHeight + 0.5, overlap: !!overlap, w: innerWidth, h: innerHeight };
    });
    if (!r.inside || r.overlap) { tourOk = false; why += ` [${w}x${h} step ${i}: ${JSON.stringify(r)}]`; }
  }
}
check('the tour card is always inside the window and never covers what it points at', tourOk, why);
await pg.evaluate(() => window.__dmforge.A.endTour());

// ---- narrow windows
await pg.setViewportSize({ width: 800, height: 700 });
await pg.waitForTimeout(200);
check('on a narrow window the sidebar becomes a drawer, opened from the menu button', await pg.locator('#drawerBtn').isVisible() && !(await pg.locator('.sidebar').evaluate(e => e.getBoundingClientRect().right > 20)));
await pg.click('#drawerBtn'); await pg.waitForTimeout(300);
check('which slides in', await pg.locator('.sidebar').evaluate(e => e.getBoundingClientRect().left >= -1));
await dom('#navCombat'); await pg.waitForTimeout(300);
check('choosing a page closes the drawer', await pg.evaluate(() => window.__dmforge.S.section) === 'combat' && await pg.locator('.sidebar').evaluate(e => e.getBoundingClientRect().right <= 20));
await pg.setViewportSize({ width: 390, height: 800 });
await pg.waitForTimeout(200);
check('on a phone there is a bottom bar', await pg.locator('.bottombar').isVisible());
check('and nothing scrolls sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

check('no errors from the page', errors.length === 0, errors.join('\n'));
await b.close();
const ok = results.filter(Boolean).length;
console.log(`${ok}/${results.length} checks passed`);
process.exit(ok === results.length ? 0 : 1);
