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

const S='/tmp/claude-0/-home-user-vuthyM/1d654b07-7e86-58fc-b4c9-13f1eaeef043/scratchpad/shots31/';
import('node:fs').then(f=>f.mkdirSync(S,{recursive:true}));
await pg.click('#navClocks'); await pg.waitForSelector('#clockAdd');
await pg.fill('#clockName', 'The vault door'); await pg.selectOption('#clockSize', '3'); await pg.click('#clockAddBtn');
await pg.waitForSelector('[data-clock="The vault door"]');
const box = pg.locator('[data-clock="The vault door"] input[name="clock-link"]'); await box.fill('The Missing Bells'); await box.blur();
await pg.click('[data-clock="The vault door"] button[aria-label^="Fill a slice"]');
await pg.screenshot({ path: S + '1-clocks.png' });
await pg.evaluate(() => { const n = window.__dmforge.getIndex().notes.find(x => x.name === 'The Missing Bells'); window.__dmforge.A.goto(n.path); });
await pg.waitForSelector('#noteClocks');
await pg.screenshot({ path: S + '2-thread.png' });
await b.close();
