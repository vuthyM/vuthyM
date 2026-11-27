import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import path from 'node:path'; import url from 'node:url';

/* 2.63: an idea becomes a campaign folder: overview, first session, NPC and place notes, plot thread */
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
const IDEA = `---
type: idea
status: ready
pitch: A ferry that never arrives
tone: Gothic comedy
players: 4
level: 3
---
# The Drowned Bell

## The idea
A village pays the river to keep quiet.

## Hook
The ferry stops short of the dock.

## Cast
- **Mira Voss** — wants: the ledger · secret: she sold the map · voice: dry, never blinks
- **Old Tam** — wants: one more crossing

## Places
- **The Weir** — where the bell went down
- **The Inn** — everyone's alibi

## Scenes and plot points
1. **Arrival** — the ferry stops
2. **The Weir** — they dive
3. **Aftermath** — the village wakes

## Stakes, goals and the clock
They lose the village if the bell rings at midnight.

## Endings
- **If they ring it:** the Choir wakes
`;
await pg.evaluate(async t => { const v = window.__dmforge.S.vault; await v.mkdir('Ideas'); await v.writeText('Ideas/The Drowned Bell.md', t); }, IDEA);
const read = p => pg.evaluate(p => window.__dmforge.S.vault.readText(p), p);
const exists = p => pg.evaluate(p => window.__dmforge.S.vault.exists(p), p);
await pg.click('#navWorkshop'); await pg.waitForSelector('#ideaGrid');
await pg.click('.idea-card:has-text("Drowned") .idea-card-main'); await pg.waitForSelector('#ideaTitle');

/* ---------- the dialog ---------- */
await pg.click('#ideaPromote'); await pg.waitForSelector('#promoteForm');
check('the dialog is filled in with a folder name from the title', (await pg.inputValue('#promoteFolder')) === 'The Drowned Bell');
let plan = await pg.textContent('#promotePlan');
check('it lists every note that will be made, before anything is written', plan.includes('7 notes will be made') && plan.includes('Sessions/') && plan.includes('NPCs/Mira Voss.md') && plan.includes('Locations/The Weir.md') && plan.includes('Plot Threads/'), plan);
await pg.uncheck('#promoteNpcs');
plan = await pg.textContent('#promotePlan');
check('leaving out the NPC notes takes them off the list', plan.includes('5 notes will be made') && !plan.includes('Mira Voss.md'), plan);
await pg.check('#promoteNpcs');
await pg.fill('#promoteFolder', 'Ashfall');
await pg.click('#promoteGo'); await pg.waitForSelector('#promoteErr');
check('a folder that already has things in it is refused, and nothing is written', (await pg.textContent('#promoteErr')).includes('already a folder') && !(await exists('Ashfall/Sessions/Session 1.md')));
await pg.fill('#promoteFolder', 'Drowned Bell Campaign');
check('the error clears when the name changes', await pg.locator('#promoteErr').count() === 0);
check('the list follows the folder name', (await pg.textContent('#promotePlan')).includes('made in Drowned Bell Campaign'));
await pg.click('#promoteGo'); await pg.waitForSelector('#promoteDone');
check('it says what it made', (await pg.textContent('#promoteDone')).includes('Made 7 notes'));

/* ---------- what was written ---------- */
const F = 'Drowned Bell Campaign/';
const session = await read(F + 'Sessions/' + new Date().toISOString().slice(0, 10) + ' Session 1.md').catch(() => '');
const list = await pg.evaluate(async () => { const v = window.__dmforge.S.vault; const out = []; const walk = async d => { for (const e of await v.list(d)) { const p = d + '/' + e.name; if (e.kind === 'dir') await walk(p); else out.push(p); } }; await walk('Drowned Bell Campaign'); return out; });
check('seven notes are in the new folder', list.length === 7, list.join('\n'));
check('an NPC note holds their want, secret and voice', (await read(F + 'NPCs/Mira Voss.md')).includes('**Secret (DM only):** she sold the map'));
check('a place note holds its description', (await read(F + 'Locations/The Weir.md')).includes('where the bell went down'));
check('the idea note now says which campaign it became', (await read('Ideas/The Drowned Bell.md')).includes('campaign: Drowned Bell Campaign'));
check('and the idea itself is otherwise unchanged', (await read('Ideas/The Drowned Bell.md')).includes('- **Mira Voss** — wants: the ledger'));

/* ---------- open it ---------- */
await pg.click('#promoteOpen');
await pg.waitForSelector('.sidebar', { timeout: 15000 });
check('the campaign opens straight away, without asking how to sort its folders', await pg.locator('#mappingScreen, .mapping').count() === 0 && (await pg.textContent('.sidebar')).includes('Drowned Bell Campaign'));
check('its categories hold what was made (2 NPCs, 2 places, 1 session)', (await pg.textContent('.nav-btn:has-text("NPCs")')).includes('2') && (await pg.textContent('.nav-btn:has-text("Locations")')).includes('2') && (await pg.textContent('.nav-btn:has-text("Sessions")')).includes('1'));
await pg.click('.nav-btn:has-text("Sessions")'); await pg.click('.pane:not([hidden]) .list-item:has-text("Session 1")');
await pg.waitForSelector('.pane:not([hidden]) .md');
const md = '.pane:not([hidden]) .md';
check('the first session shows the prep as callouts (hook, scenes, stakes, cast, places, endings)', (await pg.locator(md + ' .callout, ' + md + ' details.callout').count()) >= 6, await pg.locator(md + ' .callout, ' + md + ' details.callout').count());
check('the NPC and place names in it are working links', (await pg.locator(md + ' a[href^="dmf-link"]').count()) >= 4);
check('and none of them is a dead link', (await pg.locator(md + ' a.broken, ' + md + ' a.unresolved').count()) === 0);
await pg.click('.nav-btn:has-text("Plot threads")');
check('the plot thread is there, active', (await pg.textContent('.pane:not([hidden])')).includes('The Drowned Bell'));

/* ---------- back to the idea ---------- */
await pg.click('#navWorkshop'); await pg.waitForSelector('#ideaGrid');
check('on the shelf the idea is marked as a campaign now', (await pg.textContent('.idea-card')).includes('Campaign'));
await pg.click('.idea-card-main'); await pg.waitForSelector('#ideaCampaign');
check('its page says so, with a way to open it', (await pg.textContent('#ideaCampaign')).includes('Drowned Bell Campaign') && await pg.locator('#ideaOpenCampaign').count() === 1);
check('no page errors', errs.length === 0, errs.join('\n'));
await b.close();
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
