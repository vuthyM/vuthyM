import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import path from 'node:path'; import url from 'node:url';

/* 2.64: the run sheet: big text, read-only, scene by scene, with where you are up to kept on the device */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 } });
await ctx.addInitScript(() => { try { if (!localStorage.getItem('dmforge:settings')) localStorage.setItem('dmforge:settings', JSON.stringify({ palette: 'classic', ideasSaveSecs: 15 })); localStorage.setItem('dmforge:sp-cast', '1'); } catch (e) {} });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar');
const IDEA = `---
type: idea
status: ready
pitch: A ferry that never arrives
---
# The Drowned Bell

## Hook
The ferry stops short of the dock. **Ask for names.**

## Cast
- **Mira Voss** — wants: the ledger · secret: she sold the map · voice: dry, never blinks
- **Old Tam** — wants: one more crossing

## Places
- **The Weir** — where the bell went down

## Scenes and plot points
1. **Arrival** — the ferry stops
2. **The Weir** — they dive
   Something answers.
3. **Aftermath** — the village wakes

## Stakes, goals and the clock
They lose the village if the bell rings at midnight.

## Endings
- **If they ring it:** the Choir wakes

## Rewards
A bell-wax candle.
`;
await pg.evaluate(async t => { const v = window.__dmforge.S.vault; await v.mkdir('Ideas'); await v.writeText('Ideas/The Drowned Bell.md', t); }, IDEA);
const read = p => pg.evaluate(p => window.__dmforge.S.vault.readText(p), p);
await pg.click('#navWorkshop'); await pg.waitForSelector('#ideaGrid');

/* ---------- straight from the shelf ---------- */
await pg.click('.idea-card:has-text("Drowned") .idea-card-more'); await pg.click('.idea-card:has-text("Drowned") [data-act="run"]');
await pg.waitForSelector('#runSheet');
check('"Run it" on a card opens the run sheet', await pg.locator('#runSheet').count() === 1);
check('it is read-only: nothing to type in', await pg.locator('#runSheet input:not([type=hidden]), #runSheet textarea, #runSheet select').count() === 0);
check('the hook is first, with the writing formatted', (await pg.textContent('#run-hook')).includes('Ask for names') && await pg.locator('#run-hook strong').count() === 1);
check('scenes are big numbered cards', await pg.locator('.run-scene').count() === 3 && (await pg.textContent('#run-scene-1')).includes('Something answers'));
check('the first scene is the current one', await pg.locator('#run-scene-0.cur').count() === 1 && (await pg.textContent('#runProgress')).includes('Scene 1 of 3'));
check('the cast is open, with the secret picked out', (await pg.textContent('#run-cast')).includes('she sold the map') && await pg.locator('#run-cast .run-secret').count() === 1);
check('places are folded away until asked for', await pg.locator('#run-places .run-cards').count() === 0);
await pg.click('#run-places .run-fold');
check('and open when asked', (await pg.textContent('#run-places')).includes('where the bell went down'));
check('empty sections are not there at all', await pg.locator('#run-twists, #run-monsters, #run-props').count() === 0);

/* ---------- moving through the scenes ---------- */
await pg.click('#runNext');
check('"Done, next scene" ticks it and moves on', await pg.locator('#run-scene-0.done').count() === 1 && await pg.locator('#run-scene-1.cur').count() === 1 && (await pg.textContent('#runProgress')).includes('Scene 2 of 3 · 1 done'));
await pg.keyboard.press('ArrowRight');
check('the arrow keys do the same', await pg.locator('#run-scene-2.cur').count() === 1 && await pg.locator('#run-scene-1.done').count() === 1);
check('on the last scene the button says so', (await pg.textContent('#runNext')).includes('Finish'));
await pg.keyboard.press('ArrowLeft');
check('and back goes back without un-ticking', await pg.locator('#run-scene-1.cur').count() === 1 && await pg.locator('#run-scene-1.done').count() === 1);
await pg.click('#run-scene-1 .run-check');
check('a scene can be un-ticked by hand', await pg.locator('#run-scene-1.done').count() === 0);
await pg.click('#run-scene-2 .run-scene-body');
check('clicking a scene makes it the current one', await pg.locator('#run-scene-2.cur').count() === 1);

/* ---------- text size ---------- */
const fs0 = await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.run-scene-note')).fontSize));
await pg.click('#runBigger');
const fs1 = await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.run-scene-note')).fontSize));
check('A+ makes the text bigger (' + fs0 + ' to ' + fs1 + ')', fs1 > fs0);
check('and it stops at the biggest', await pg.locator('#runBigger:disabled').count() === 1);
await pg.click('#runSmaller'); await pg.click('#runSmaller');
check('A− makes it smaller again', (await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.run-scene-note')).fontSize))) < fs0);
await pg.click('#runBigger');

/* ---------- where you are up to stays put ---------- */
await pg.click('#runBack'); await pg.waitForSelector('#ideaTitle');
check('Back returns to the idea page', await pg.locator('#runSheet').count() === 0);
await pg.click('#ideaRun'); await pg.waitForSelector('#runSheet');
check('running it again picks up where you left off', await pg.locator('#run-scene-0.done').count() === 1 && await pg.locator('#run-scene-2.cur').count() === 1 && await pg.locator('#run-places .run-cards').count() === 1);
await pg.click('#runReset');
check('"Start over" clears the ticks', await pg.locator('.run-scene.done').count() === 0 && await pg.locator('#run-scene-0.cur').count() === 1);

/* ---------- the end ---------- */
await pg.click('#runFinish');
check('"mark it as Played" does', await pg.locator('#runPlayed').count() === 1);
await pg.click('#runBack'); await pg.waitForSelector('#ideaTitle');
check('the idea page shows Played', (await pg.inputValue('#ideaStatus')) === 'played');
await pg.click('#ideaSaveNow').catch(() => {});
await pg.waitForFunction(() => document.querySelector('#ideaSaveState')?.textContent.startsWith('Saved'), null, { timeout: 25000 });
check('and it is saved', (await read('Ideas/The Drowned Bell.md')).includes('status: played'));
check('running it changed nothing else in the note', (await read('Ideas/The Drowned Bell.md')).includes('- **Mira Voss** — wants: the ledger · secret: she sold the map'));
check('no page errors', errs.length === 0, errs.join('\n'));
await b.close();
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
