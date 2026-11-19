/* 2.30.1: double-click the space between parts of a note to add a line there. */
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
// a note with headings and little under them, like the screenshot
const path0 = await pg.evaluate(() => {
  const A = window.__dmforge.A;
  return A.createNote('session', 'Session 40', { fm: {}, body: '# Session 40\n\n## NPCs appearing in this episode\n\n## Recap\n\n## Session log\n\n- first thing\n- second thing\n' });
});
await pg.evaluate(p => window.__dmforge.A.goto(p), path0);
await pg.waitForSelector('.edit-body .blk');
const bodyOf = () => pg.evaluate(p => window.__dmforge.getIndex().byPath.get(p).body, path0);
const gapBelow = async text => pg.evaluate(t => {
  const h = [...document.querySelectorAll('.edit-body h2')].find(x => x.textContent.includes(t));
  const blk = h.closest('.blk'); const r = blk.getBoundingClientRect(); const next = blk.nextElementSibling;
  const nr = next ? next.getBoundingClientRect() : null;
  return { x: r.left + 24, y: nr ? (r.bottom + nr.top) / 2 : r.bottom + 10 };
}, text);
let g = await gapBelow('Recap');
await pg.mouse.dblclick(g.x, g.y);
await pg.waitForSelector('.u-new textarea');
check('double-clicking the gap under "Recap" opens a box for a new line', await pg.locator('.u-new textarea').count() === 1);
await pg.fill('.u-new textarea', 'The party met Pell at the well.');
await pg.keyboard.press('Enter');
await pg.waitForTimeout(200);
let body = await bodyOf();
check('Enter adds it as its own paragraph under Recap, before Session log', /## Recap\n\nThe party met Pell at the well\.\n\n## Session log/.test(body), JSON.stringify(body));
check('and it shows on the page, with nothing else changed', (await pg.locator('.edit-body p:has-text("met Pell")').count()) === 1 && /## NPCs appearing in this episode\n\n## Recap/.test(body));
check('it is a pending change', /Push 1 change/.test(await pg.textContent('#pushBtn')));
// under the list: a bullet
const end = await pg.evaluate(() => { const l = [...document.querySelectorAll('.edit-body .blk')].pop(); l.scrollIntoView({ block: 'center' }); const r = l.getBoundingClientRect(); return { x: r.left + 24, y: r.bottom + 20 }; });
await pg.mouse.dblclick(end.x, end.y);
await pg.waitForSelector('.edit-body textarea.u-edit');
await pg.keyboard.type('third thing');
await pg.keyboard.press('Enter');
await pg.keyboard.press('Escape');
await pg.waitForTimeout(200);
body = await bodyOf();
check('double-clicking under the bullet list adds a bullet', /- second thing\n- third thing/.test(body), JSON.stringify(body));
// Esc cancels, an empty box adds nothing
const before = await bodyOf();
g = await gapBelow('NPCs appearing');
await pg.mouse.dblclick(g.x, g.y);
await pg.waitForSelector('.u-new textarea');
await pg.keyboard.type('never mind');
await pg.keyboard.press('Escape');
await pg.waitForTimeout(150);
check('Esc cancels and adds nothing', (await pg.locator('.u-new').count()) === 0 && (await bodyOf()) === before);
await pg.mouse.dblclick(g.x, g.y);
await pg.waitForSelector('.u-new textarea');
await pg.keyboard.press('Enter');
await pg.waitForTimeout(150);
check('Enter on an empty box adds nothing', (await bodyOf()) === before);
// under the first heading: goes after the title, not above it
g = await gapBelow('NPCs appearing');
await pg.mouse.dblclick(g.x, g.y);
await pg.waitForSelector('.u-new textarea');
await pg.fill('.u-new textarea', 'Line one');
await pg.keyboard.press('Shift+Enter');
await pg.keyboard.type('line two');
await pg.keyboard.press('Enter');
await pg.waitForTimeout(200);
body = await bodyOf();
check('Shift+Enter makes a second line inside the same paragraph', /## NPCs appearing in this episode\n\nLine one\nline two\n\n## Recap/.test(body), JSON.stringify(body));
// double-clicking text still edits that text
await pg.dblclick('.edit-body p:has-text("met Pell")');
await pg.waitForSelector('textarea.u-edit');
check('double-clicking text itself still edits that text', (await pg.inputValue('textarea.u-edit')).includes('met Pell'));
await pg.keyboard.press('Escape');
check('no errors from the page', errors.length === 0, errors.join('\n'));
await b.close();
const ok = results.filter(Boolean).length;
console.log(`${ok}/${results.length} checks passed`);
process.exit(ok === results.length ? 0 : 1);
