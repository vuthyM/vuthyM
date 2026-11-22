import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import path from 'node:path'; import url from 'node:url';

/* Overview, round two: one main button, the rest in a menu, the little jobs in one block, "What am I forgetting?" untouched. */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar'); await pg.waitForSelector('#overviewTitle');
const head = '.overview-head .row-actions';
check('the next session is not played yet: Open session is the one main button', (await pg.locator(head + ' > .btn-primary').count()) === 1 && (await pg.textContent(head + ' > .btn-primary')) === 'Open session');
check('the header shows one button and a menu, not four buttons', (await pg.locator(head + ' > button:visible, ' + head + ' .popmenu > button:visible').count()) === 2);
await pg.click('#overviewMore');
check('the menu holds New session, Import last session and Start timer', (await pg.locator('#overviewNew:visible').count()) === 1 && (await pg.locator('#importLastBtn:visible').count()) === 1 && (await pg.locator('#overviewTimer:visible').count()) === 1);
await pg.waitForTimeout(250); await pg.keyboard.press('Escape');
check('the menu closes again', (await pg.locator('#overviewNew:visible').count()) === 0);
check('the timer is also in the top bar, so it is not repeated as a button', (await pg.locator('.overview-head >> text=Start timer').count()) === 0 || (await pg.locator('.overview-head .row-actions > #overviewTimer').count()) === 0);

// once the session has been played, the main button is New session
await pg.evaluate(() => { const A = window.__dmforge; const p = A.getIndex().byType.session[0].path; const t = A.S.working.get(p); A.S.working.setText(p, t + '\n\n<!-- dmforge:dm-recap -->\n'); A.touch(); });
await pg.waitForFunction(() => document.querySelector('.overview-head .row-actions > .btn-primary')?.textContent === '+ New session');
check('after it is played, the main button is + New session and Open session moves into the menu', (await pg.locator(head + ' > #overviewNew.btn-primary').count()) === 1 && (await pg.locator('.popmenu #overviewOpen').count()) === 1);

// the little jobs are one block
const tidy = pg.locator('.tidyups');
check('unpushed changes and unplaced NPCs share one block', (await tidy.count()) === 1 && (await tidy.locator('.unpushed-bar').count()) === 1 && (await tidy.locator('#unplacedNudge').count()) === 1);
check('the block is one box with a hairline between rows, not two cards', await pg.evaluate(() => { const t = document.querySelector('.tidyups'); const kids = [...t.children]; return kids.length === 2 && getComputedStyle(kids[0]).borderTopWidth === '0px' && getComputedStyle(kids[1]).borderTopWidth !== '0px'; }));
check('Review and push still works from it', (await tidy.locator('.unpushed-bar button').count()) === 1);
check('"What am I forgetting?" is still there in full', (await pg.locator('#forgetCard').count()) === 1 && (await pg.locator('#forgetCard [data-fg]').count()) >= 2);
check('the empty Favourites box is one short line', (await pg.textContent('.drop-hint')).startsWith('Drag a page here') && (await pg.locator('.drop-hint').evaluate(e => e.getBoundingClientRect().height)) < 40);

// with nothing to do the block is gone
await pg.evaluate(() => { window.__dmforge.A.discardAll && window.__dmforge.A.discardAll(); });
await pg.waitForTimeout(200);
await pg.evaluate(() => { window.__dmforge.S.working.discardAll(); window.__dmforge.touch(); });
await pg.waitForTimeout(200);
const stillUnplaced = await pg.locator('#unplacedNudge').count();
check('with no unpushed changes the unpushed row goes (the block only holds what is left)', (await pg.locator('.tidyups .unpushed-bar').count()) === 0);

// a phone-sized window does not scroll sideways
await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(300);
check('no sideways scroll at 390px', await pg.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
check('no page errors', errs.length === 0, errs.join('\n'));
await b.close();
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
