import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import path from 'node:path'; import url from 'node:url';

/* 2.62: roll-one buttons, questions for a blank section, and the ready-to-run checklist */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 } });
await ctx.addInitScript(() => { try { localStorage.setItem('dmforge:settings', JSON.stringify({ palette: 'classic', ideasSaveSecs: 15 })); localStorage.setItem('dmforge:sp-cast', '1'); } catch (e) {} });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar');
await pg.click('#navWorkshop'); await pg.click('#ideaNewEmpty'); await pg.fill('#ideaNameInput', 'Spark Test'); await pg.press('#ideaNameInput', 'Enter'); await pg.waitForSelector('#ideaTitle');
const model = () => pg.evaluate(() => { const m = window.__dmforge.S.ideas.model; return JSON.parse(JSON.stringify(m.sec)); });

/* ---------- roll one ---------- */
await pg.click('#spark-cast'); await pg.click('#spark-cast ~ .popmenu-pop [data-spark="npc"], [data-spark="npc"]');
await pg.waitForSelector('#rows-cast .idea-row');
let sec = await model();
check('rolling an NPC adds a cast row with a name, a want, a secret and a voice', sec.cast.length === 1 && sec.cast[0].name && sec.cast[0].wants && sec.cast[0].secret && sec.cast[0].voice, JSON.stringify(sec.cast));
check('the new row is marked so it is easy to spot', await pg.locator('#rows-cast .idea-row.fresh').count() === 1);
check('and shows in the boxes (editable like any row)', (await pg.inputValue('#rows-cast .idea-row >> nth=0 >> input >> nth=0')) === sec.cast[0].name);
await pg.click('#spark-cast'); await pg.click('[data-spark="villain"]');
sec = await model();
check('a villain is a second row, with their goal, method and weakness filled in', sec.cast.length === 2 && /Weakness:/.test(sec.cast[1].secret), JSON.stringify(sec.cast[1]));
await pg.click('#spark-places'); await pg.click('[data-spark="tavern"]');
await pg.click('#spark-places'); await pg.click('[data-spark="settlement"]');
sec = await model();
check('places roll as places (a tavern, a village)', sec.places.length === 2 && sec.places.every(p => p.name && p.note), JSON.stringify(sec.places));
await pg.click('#spark-scenes'); await pg.click('[data-spark="fight"]');
await pg.click('#spark-scenes'); await pg.click('[data-spark="complication"]');
sec = await model();
check('scenes roll as numbered beats', sec.scenes.length === 2 && (await pg.locator('#rows-scenes .idea-row-n').allTextContents()).join() === '1,2');
// a section with one spark is a single button; a text section gets text added under what is there
await pg.fill('#ta-hook', 'My own hook.');
await pg.click('#spark-hook'); await pg.click('[data-spark="hook"]');
sec = await model();
check('a rolled hook is added under what was already written, not over it', sec.hook.startsWith('My own hook.\n\n') && sec.hook.length > 40, sec.hook);
check('and shows in the box', (await pg.inputValue('#ta-hook')) === sec.hook);
check('"Roll" on a one-spark section is one button', await pg.locator('button#spark-stakes').count() === 1);
await pg.click('#spark-stakes');
check('it adds a clock to the stakes', (await model()).stakes.includes('Deadline:'));
await pg.click('#spark-rewards'); await pg.click('[data-spark="magicitem"]');
check('treasure rolls as text', (await model()).rewards.length > 20);
const metric = JSON.stringify(await model());
check('rolled things are metric', !/\b\d+[- ]?(feet|foot|ft|miles?|pounds?|lbs?)\b/.test(metric));

/* ---------- questions for a blank section ---------- */
check('a blank section offers a question', (await pg.textContent('[data-prompt="endings"]')).includes('Stuck?'));
const q1 = await pg.textContent('[data-prompt="endings"] .idea-prompt-q');
await pg.click('[data-prompt="endings"] button:has-text("Another")');
check('"Another" gives a different one', (await pg.textContent('[data-prompt="endings"] .idea-prompt-q')) !== q1);
check('a section with writing in it does not nag', await pg.locator('[data-prompt="hook"]').count() === 0);
await pg.click('[data-prompt="notes"] button:has-text("Use it")');
check('"Use it" puts the question into a text section to answer under', (await pg.inputValue('#ta-notes')).includes('What do you need to remember'));
check('and the prompt goes away once there is writing', await pg.locator('[data-prompt="notes"]').count() === 0);

/* ---------- ready to run? ---------- */
check('the checklist starts incomplete and says how far along it is', (await pg.textContent('#ideaReadyN')).includes('of 8') && !(await pg.textContent('#ideaReady')).includes('Ready to run\n'));
const n0 = parseInt(await pg.textContent('#ideaReadyN'));
await pg.fill('#ideaPitch', 'A ferry that never arrives');
await sleep(900);
check('it follows what you type, without redrawing the page', parseInt(await pg.textContent('#ideaReadyN')) === n0 + 1 && await pg.evaluate(() => document.activeElement.id) === 'ideaPitch', await pg.textContent('#ideaReadyN'));
check('each missing item says what is missing', (await pg.textContent('[data-check="places"]')).length > 5);
await pg.click('[data-check="endings"] button');
await sleep(500);
check('clicking a missing item jumps to its section', await pg.evaluate(() => { const r = document.getElementById('sec-endings').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));
// fill in what is missing
await pg.click('#add-endings'); await pg.fill('#rows-endings .idea-row >> nth=0 >> input', 'If they win'); await pg.fill('#rows-endings .idea-row >> nth=0 >> textarea', 'The ferry runs again');
await pg.click('#add-scenes');
await pg.fill('#rows-scenes .idea-row >> nth=2 >> input', 'Climax');
await pg.click('#add-cast'); await pg.fill('#rows-cast .idea-row >> nth=2 >> input >> nth=0', 'Extra NPC'); await pg.fill('#rows-cast .idea-row >> nth=2 >> textarea >> nth=0', 'a debt paid');
await sleep(900);
const ready = await pg.textContent('#ideaReady');
check('with everything in, it says Ready to run', /8 of 8/.test(ready) && ready.includes('Ready to run'), ready.slice(0, 200));
await pg.click('#ideaMarkReady');
check('and offers to mark the idea Ready, which does', (await pg.inputValue('#ideaStatus')) === 'ready' && await pg.locator('#ideaMarkReady').count() === 0);
await pg.click('#ideaSaveNow');
await pg.waitForFunction(() => document.querySelector('#ideaSaveState')?.textContent.startsWith('Saved'));
const text = await pg.evaluate(() => window.__dmforge.S.vault.readText('Ideas/Spark Test.md'));
check('everything rolled and written is in the note, which round-trips', text.includes('status: ready') && text.includes('Extra NPC') && /Weakness:/.test(text) && text.includes('1. **') && text.includes('If they win'));
check('no page errors', errs.length === 0, errs.join('\n'));
await b.close();
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
