import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import path from 'node:path'; import url from 'node:url';

/* 2.61: the Workshop. A shelf of ideas, one big page per idea, typing that never lags, saving on a timer, and nothing lost offline or on a conflict. */
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
const read = p => pg.evaluate(p => window.__dmforge.S.vault.readText(p), p);
const exists = p => pg.evaluate(p => window.__dmforge.S.vault.exists(p), p);

/* ---------- getting there, and the empty shelf ---------- */
await pg.click('#navWorkshop');
await pg.waitForSelector('#ideas');
check('the Workshop opens from the sidebar as its own screen, apart from the campaign', await pg.locator('#ideas').count() === 1 && await pg.locator('.sidebar').count() === 0);
check('with nothing on the shelf it explains itself and offers a first idea', (await pg.textContent('#ideasEmpty')).includes('one big page') && await pg.locator('#ideaNewEmpty').count() === 1);

/* ---------- making an idea ---------- */
await pg.click('#ideaNew'); await pg.waitForSelector('#ideaNameInput');
check('Start writing waits for a name', await pg.locator('#ideaCreate').isDisabled());
await pg.fill('#ideaNameInput', 'The Drowned Bell');
await pg.click('#ideaCreate');
await pg.waitForSelector('#ideaTitle');
check('it opens on one big page, titled, with every section on it', (await pg.inputValue('#ideaTitle')) === 'The Drowned Bell' && await pg.locator('.idea-sec').count() >= 12);
check('the note exists in the Ideas folder straight away', await exists('Ideas/The Drowned Bell.md'));
check('the outline lists the sections', (await pg.locator('.idea-out-item').count()) >= 12);

/* ---------- writing: typing is smooth ---------- */
await pg.click('#ideaPitch');
const typed = 'A ferry that never arrives and a village that pays the river';
await pg.keyboard.type(typed, { delay: 4 });
check('typing in a box keeps the focus and every letter', (await pg.inputValue('#ideaPitch')) === typed && await pg.evaluate(() => document.activeElement.id) === 'ideaPitch');
await pg.fill('#ta-hook', 'The ferry stops short of the dock and the ferryman asks for a name.');
await pg.fill('#ta-idea', 'A village pays the river to keep quiet.');
await pg.selectOption('#ideaStatus', 'developing');
await pg.fill('#ideaTone', 'Gothic comedy'); await pg.fill('#ideaLength', '3 to 4 hours'); await pg.fill('#ideaPlayers', '4'); await pg.fill('#ideaLevel', '3');
await pg.fill('#ideaTags', 'boats, horror');
check('the little label says the changes are waiting', (await pg.textContent('#ideaSaveState')).includes('every 15 seconds'), await pg.textContent('#ideaSaveState'));
// rows
await pg.click('#add-cast');
const castRow = '#rows-cast .idea-row >> nth=0';
await pg.fill(castRow + ' >> input >> nth=0', 'Mira Voss'); await pg.fill(castRow + ' >> :is(input, textarea) >> nth=1', 'the ledger');
await pg.fill(castRow + ' >> :is(input, textarea) >> nth=2', 'she sold the map'); await pg.fill(castRow + ' >> :is(input, textarea) >> nth=3', 'dry, never blinks');
await pg.click('#add-places'); await pg.fill('#rows-places .idea-row >> nth=0 >> input', 'The Weir'); await pg.fill('#rows-places .idea-row >> nth=0 >> textarea', 'where the bell went down');
for (const [n, t] of [['Arrival', 'the ferry stops'], ['The Weir', 'they dive'], ['Aftermath', 'the village wakes']]) {
  await pg.click('#add-scenes');
  const i = await pg.locator('#rows-scenes .idea-row').count() - 1;
  await pg.fill('#rows-scenes .idea-row >> nth=' + i + ' >> input', n); await pg.fill('#rows-scenes .idea-row >> nth=' + i + ' >> textarea', t);
}
check('scenes are numbered', (await pg.locator('#rows-scenes .idea-row-n').allTextContents()).join(',') === '1,2,3');
await pg.click('#rows-scenes .idea-row >> nth=2 >> button[aria-label="Move up"]');
check('a scene moves up, and the numbers follow the order', (await pg.locator('#rows-scenes .idea-row >> input.idea-row-name').evaluateAll(es => es.map(e => e.value))).join('|') === 'Arrival|Aftermath|The Weir');
await pg.click('#add-twists'); await pg.click('#rows-twists .idea-row >> nth=0 >> button[data-remove]');
check('a row can be removed', await pg.locator('#rows-twists .idea-row').count() === 0);
await pg.click('[data-sec="rewards"] .idea-sec-toggle');
check('a section folds away and its hint goes with it', await pg.locator('#ta-rewards').count() === 0);
await pg.click('[data-sec="rewards"] .idea-sec-toggle');
check('and opens again', await pg.locator('#ta-rewards').count() === 1);

/* ---------- it saves by itself, on the timer ---------- */
check('nothing has reached the vault yet (the timer has not run)', !(await read('Ideas/The Drowned Bell.md')).includes('Mira Voss'));
await pg.waitForFunction(() => document.querySelector('#ideaSaveState')?.textContent.startsWith('Saved'), null, { timeout: 25000 });
const saved = await read('Ideas/The Drowned Bell.md');
check('after the wait it is saved: the cast row, the pitch, the settings', saved.includes('- **Mira Voss** — wants: the ledger · secret: she sold the map · voice: dry, never blinks') && saved.includes('pitch: A ferry that never arrives') && saved.includes('status: developing') && saved.includes('players: 4'), saved.slice(0, 500));
check('scenes are saved numbered, in the new order', saved.includes('1. **Arrival**') && saved.includes('2. **Aftermath**') && saved.includes('3. **The Weir**'));
check('the label says Saved', (await pg.textContent('#ideaSaveState')).includes('Saved'));

/* ---------- renaming ---------- */
await pg.fill('#ideaTitle', 'The Drowned Bell (v2)');
await pg.click('#ideaSaveNow');
await pg.waitForFunction(() => document.querySelector('#ideaSaveState')?.textContent.startsWith('Saved'));
check('changing the title renames the note, and the old one goes to the trash', await exists('Ideas/The Drowned Bell (v2).md') && !(await exists('Ideas/The Drowned Bell.md')));
check('the content came with it', (await read('Ideas/The Drowned Bell (v2).md')).includes('Mira Voss'));

/* ---------- the shelf ---------- */
await pg.click('#ideaToShelf'); await pg.waitForSelector('#ideaGrid');
const card = '.idea-card';
check('the shelf shows the idea as a card with its pitch, settings and counts', (await pg.textContent(card)).includes('Drowned Bell') && (await pg.textContent(card)).includes('Gothic comedy') && (await pg.textContent(card)).includes('1 NPC') && (await pg.textContent(card)).includes('3 scenes') && (await pg.textContent(card)).includes('Developing'), await pg.textContent(card));
await pg.click('#ideaNew'); await pg.fill('#ideaNameInput', 'Night Market'); await pg.press('#ideaNameInput', 'Enter'); await pg.waitForSelector('#ideaTitle');
await pg.click('#ideaToShelf'); await pg.waitForFunction(() => document.querySelectorAll('.idea-card').length === 2);
check('two ideas are on the shelf, the one in progress first', await pg.locator('.idea-card').count() === 2 && (await pg.textContent('.idea-card >> nth=0')).includes('Drowned'));
await pg.fill('#ideaSearch', 'market'); await sleep(100);
check('search narrows the shelf', await pg.locator('.idea-card').count() === 1 && (await pg.textContent('.idea-card')).includes('Night Market'));
await pg.fill('#ideaSearch', '');
await pg.click('[data-status="developing"]');
check('and so does the status filter', await pg.locator('.idea-card').count() === 1 && (await pg.textContent('.idea-card')).includes('Drowned'));
await pg.click('[data-status="developing"]');
await pg.click('.idea-card:has-text("Drowned") .idea-card-main'); await pg.waitForSelector('#ideaTitle');
check('opening it again brings everything back', (await pg.inputValue('#ideaPitch')).startsWith('A ferry') && (await pg.inputValue('#rows-cast .idea-row >> nth=0 >> input >> nth=0')) === 'Mira Voss' && (await pg.locator('#rows-scenes .idea-row').count()) === 3 && (await pg.inputValue('#ideaTags')) === 'boats, horror');

/* ---------- no connection: nothing is lost ---------- */
await pg.evaluate(() => { const v = window.__dmforge.S.vault; v.__w = v.writeText.bind(v); v.writeText = async () => { const e = new Error('offline'); e.offline = true; throw e; }; });
await pg.fill('#ta-hook', 'Written with no connection.');
await pg.click('#ideaSaveNow');
await pg.waitForFunction(() => document.querySelector('#ideaSaveState')?.textContent.includes('Offline'));
check('with the server out of reach it says so, and that it is kept on this device', (await pg.textContent('#ideaSaveState')).includes('kept on this device'));
check('and nothing was written to the vault', !(await read('Ideas/The Drowned Bell (v2).md')).includes('Written with no connection'));
await pg.click('#ideaToShelf'); await pg.waitForSelector('#ideaGrid');
await sleep(300);
check('leaving anyway is allowed, and the card says it is not on the server yet', (await pg.textContent('.idea-card:has-text("Drowned")')).includes('Not saved to the server'));
await pg.evaluate(() => { const v = window.__dmforge.S.vault; v.writeText = v.__w; });
await pg.click('.idea-card:has-text("Drowned") .idea-card-main'); await pg.waitForSelector('#ideaTitle');
check('opening it brings the kept changes back and says so', (await pg.inputValue('#ta-hook')) === 'Written with no connection.' && (await pg.textContent('#ideaMsg')).includes('Brought back your changes'));
await pg.waitForFunction(() => document.querySelector('#ideaSaveState')?.textContent.startsWith('Saved'), null, { timeout: 25000 });
check('and once the server answers they are saved', (await read('Ideas/The Drowned Bell (v2).md')).includes('Written with no connection'));

/* ---------- the idea changed somewhere else ---------- */
await pg.evaluate(() => { const v = window.__dmforge.S.vault; v.__w2 = v.writeText.bind(v); let once = true; v.writeText = async (p, t) => { if (once && /Drowned/.test(p)) { once = false; const e = new Error('conflict'); e.conflict = 'changed'; e.current = { version: 9, text: '---\ntype: idea\nstatus: ready\n---\n# The Drowned Bell (v2)\n\n## Hook\n\nWritten on the other device.\n' }; throw e; } return v.__w2(p, t); }; });
await pg.fill('#ta-hook', 'Written here at the same moment.');
await pg.click('#ideaSaveNow');
await pg.waitForSelector('#ideaConflict');
check('a clash is shown, with three choices, and nothing was overwritten', await pg.locator('#ideaKeepBoth, #ideaKeepTheirs, #ideaKeepMine').count() === 3 && !(await read('Ideas/The Drowned Bell (v2).md')).includes('same moment'));
await pg.click('#ideaKeepBoth');
await pg.waitForFunction(() => !document.querySelector('#ideaConflict'));
const copies = await pg.evaluate(async () => (await window.__dmforge.S.vault.list('Ideas')).map(e => e.name));
check('"Keep both" saves mine as a copy and opens the other version', copies.some(n => /my copy/.test(n)) && (await pg.inputValue('#ta-hook')) === 'Written on the other device.', JSON.stringify(copies));
const copyText = await read('Ideas/' + copies.find(n => /my copy/.test(n)));
check('the copy holds what I wrote', copyText.includes('Written here at the same moment'));
await pg.evaluate(() => { const v = window.__dmforge.S.vault; v.writeText = v.__w2; });

/* ---------- copy and delete ---------- */
await pg.click('#ideaToShelf'); await pg.waitForFunction(() => [...document.querySelectorAll('.idea-card')].some(c => /my copy/.test(c.textContent)));
check('the copy is on the shelf', await pg.locator('.idea-card:has-text("my copy")').count() === 1);
await pg.click('.idea-card:has-text("my copy") .idea-card-more'); await pg.click('.idea-card:has-text("my copy") [data-act="delete"]');
await pg.waitForSelector('.modal'); await pg.click('.modal .btn-danger, .modal .danger, .modal button:has-text("Delete")');
await pg.waitForFunction(() => !document.querySelector('.idea-card') || ![...document.querySelectorAll('.idea-card')].some(c => /my copy/.test(c.textContent)));
check('deleting asks first, then the idea leaves the shelf (and goes to the trash)', await pg.locator('.idea-card:has-text("my copy")').count() === 0);
await pg.click('.idea-card:has-text("Drowned") .idea-card-more'); await pg.click('.idea-card:has-text("Drowned") [data-act="copy"]');
await pg.waitForFunction(() => [...document.querySelectorAll('.idea-card')].some(c => /copy/.test(c.textContent)));
check('"Make a copy" adds a Spark with the same content', (await read('Ideas/The Drowned Bell (v2) copy.md')).includes('Mira Voss') && (await read('Ideas/The Drowned Bell (v2) copy.md')).includes('status: spark'));

/* ---------- back out ---------- */
await pg.click('#ideasBack'); await pg.waitForSelector('.sidebar');
check('Back returns to the campaign', await pg.locator('.sidebar').count() === 1);
check('no page errors', errs.length === 0, errs.join('\n'));
await b.close();
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
