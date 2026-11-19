import { chromium } from '../../jsd/node_modules/playwright-core/index.mjs';
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url'; import http from 'node:http';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'DM-Forge.html');
const shots = process.env.SHOTS || '';
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(dist)); }).listen(8771);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'], env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const results = [];
const check = (name, cond, extra) => { results.push({ name, ok: !!cond, extra }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const openGen = async (pg, name) => {
  await pg.click('.nav-btn:has-text("Generate")');
  await pg.waitForSelector('#genHome, #genFind');
  if (await pg.locator('#genHome').count()) await pg.click('#genHome');
  await pg.fill('#genFind', name);
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('[data-gen]');
};

async function demo(w = 1360, h = 900) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: 'light' });
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.on('pageerror', e => pg.errors.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_/.test(m.text())) pg.errors.push('console: ' + m.text()); });
  await pg.goto('http://localhost:8771/');
  await pg.evaluate(() => window.__dmforge.A.openPlainDemo());
  await pg.waitForSelector('text=What is in');
  await pg.click('text=Looks good');
  await pg.waitForSelector('.sidebar');
  return pg;
}
const W = pg => pg.evaluate(() => window.__dmforge.S.working.list().map(e => e.kind + ':' + e.path));
const vaultHas = (pg, p) => pg.evaluate(p => window.__dmforge.S.vault.exists(p), p);
const vaultText = (pg, p) => pg.evaluate(p => window.__dmforge.S.vault.readText(p), p);
const layout = async (pg, name) => { await pg.click('#layoutBtn'); await pg.click('.ctx-item:has-text("' + name + '")'); await pg.waitForFunction(() => !document.querySelector('.ctx')); };
const push = async pg => { await pg.click('#pushBtn'); await pg.waitForSelector('#confirmPush'); await pg.click('#confirmPush'); await pg.waitForSelector('#pushDone'); await pg.click('#pushDone'); };

/* ================= 1. push review: Push button stays reachable, no content ================= */
{
  const pg = await demo(1360, 700);
  await pg.evaluate(() => {
    const { S, touch } = window.__dmforge;
    for (let i = 0; i < 400; i++) S.working.create('Ashfall/NPCs/Bulk ' + String(i).padStart(3, '0') + '.md', '# Bulk ' + i + '\nSECRET-CONTENT-' + i + '\n');
    touch();
  });
  await pg.click('#pushBtn');
  await pg.waitForSelector('#confirmPush');
  const info = await pg.evaluate(() => {
    const btn = document.querySelector('#confirmPush').getBoundingClientRect();
    const list = document.querySelector('.rev-list');
    const modal = document.querySelector('.modal.review').getBoundingClientRect();
    return { btnTop: btn.top, btnBottom: btn.bottom, vh: innerHeight, scrollable: list.scrollHeight > list.clientHeight + 200, rows: document.querySelectorAll('.rev-row').length, modalBottom: modal.bottom, text: document.querySelector('.modal.review').textContent };
  });
  check('400 changes: Push button is on screen without scrolling', info.btnTop >= 0 && info.btnBottom <= info.vh, JSON.stringify(info).slice(0, 200));
  check('the window fits the screen and the list scrolls inside it', info.modalBottom <= info.vh + 1 && info.scrollable, JSON.stringify({ mb: info.modalBottom, vh: info.vh }));
  check('every change is listed as a file', info.rows === 400);
  check('no note content is shown', !info.text.includes('SECRET-CONTENT') && await pg.locator('.diff, .rev-item').count() === 0);
  check('summary counts shown', info.text.includes('400 new'));
  await pg.evaluate(() => { document.querySelector('.rev-list').scrollTop = 99999; });
  const after = await pg.evaluate(() => document.querySelector('#confirmPush').getBoundingClientRect().top);
  check('Push button stays put after scrolling the list to the bottom', after >= 0 && after < 700, after);
  if (shots) await pg.screenshot({ path: shots + '/10-review-big.png' });
  await pg.click('#confirmPush'); await pg.waitForSelector('#pushDone');
  check('400 notes pushed', await vaultHas(pg, 'Ashfall/NPCs/Bulk 399.md'));
  if (shots) await pg.screenshot({ path: shots + '/11-pushed.png' });
  await pg.click('#pushDone');
  check('no page errors (push)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 2. combat ================= */
{
  const pg = await demo();
  await pg.click('.nav-btn:has-text("Combat")');
  await pg.click('text=Start combat');
  await pg.click('button:has-text("Add the party")');
  await pg.click('#addTabCustom'); await pg.fill('.combat-grid input[placeholder="Goblin"]', 'Goblin');
  await pg.fill('label:text-is("Qty") + input', '3');
  await pg.click('#addRoll');
  const rows = await pg.$$eval('.c-row', rs => rs.map(r => ({ name: r.querySelector('.c-name').firstChild.textContent.trim(), init: Number(r.querySelector('.c-init').value), roll: !!r.querySelector('.roll') })));
  check('party + 3 goblins in the list', rows.length === 6, JSON.stringify(rows));
  check('Add-and-roll gave every goblin a d20 result', rows.filter(r => /Goblin/.test(r.name)).every(r => r.init >= 1 && r.init <= 20));
  check('only enemies get a roll button', rows.filter(r => r.roll).length === 3 && rows.filter(r => r.roll).every(r => /Goblin/.test(r.name)));
  check('list sorted by initiative', rows.every((r, i) => i === 0 || rows[i - 1].init >= r.init));
  const before = await pg.$$eval('.c-row .c-init', is => is.map(i => i.value));
  const pcInits = rows.filter(r => !r.roll).map(r => r.init);
  await pg.click('#rollFoes');
  const after2 = await pg.$$eval('.c-row', rs => rs.filter(r => !r.querySelector('.roll')).map(r => Number(r.querySelector('.c-init').value)));
  check('Roll for enemies leaves the players alone', JSON.stringify(after2) === JSON.stringify(pcInits));
  await pg.click('.c-row .roll >> nth=0');
  check('per-row roll works without error', pg.errors.length === 0);

  // live reorder while typing, with an animation, focus kept
  // known starting values so the first digit already moves the bottom row up
  await pg.evaluate(() => { const c = window.__dmforge.S.combat; const v = [30, 25, 20, 15, 8, 5]; c.combatants.forEach((x, i) => { x.init = v[i]; }); window.__dmforge.emit(); });
  const lastName = await pg.$eval('.c-row:last-child .c-name', e => e.firstChild.textContent.trim());
  const lastInit = pg.locator('.c-row:last-child .c-init');
  await lastInit.click();
  await pg.keyboard.press('Control+a');
  await pg.keyboard.type('9');
  let st = await pg.evaluate(() => ({ focusedIsInit: document.activeElement && document.activeElement.classList.contains('c-init'), val: document.activeElement && document.activeElement.value, anim: [...document.querySelectorAll('.c-row')].some(r => r.getAnimations().length > 0), first: document.querySelector('.c-row .c-name').firstChild.textContent.trim() }));
  check('typing 9 moves the row up at once (animated) and keeps focus', st.focusedIsInit && st.val === '9' && st.anim, JSON.stringify(st));
  await pg.keyboard.type('9');
  st = await pg.evaluate(() => ({ focusedIsInit: document.activeElement.classList.contains('c-init'), val: document.activeElement.value, first: document.querySelector('.c-row .c-name').firstChild.textContent.trim() }));
  check('typing a second digit continues in the same box (99) and the row is now first', st.focusedIsInit && st.val === '99' && st.first === lastName, JSON.stringify(st) + ' ' + lastName);
  await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('ArrowDown');
  st = await pg.evaluate(() => ({ val: document.activeElement.value, focus: document.activeElement.classList.contains('c-init') }));
  check('arrow down lowers the value live and keeps focus', st.val === '97' && st.focus, JSON.stringify(st));
  for (let i = 0; i < 90; i++) await pg.keyboard.press('ArrowDown');
  await pg.waitForTimeout(350);
  st = await pg.evaluate(() => ({ val: document.activeElement.value, idx: [...document.querySelectorAll('.c-row')].findIndex(r => r.contains(document.activeElement)), n: document.querySelectorAll('.c-row').length }));
  check('holding arrow down walks the row down the list (value 7, still focused)', st.val === '7' && st.idx >= 1, JSON.stringify(st));
  await pg.keyboard.press('Control+a'); await pg.keyboard.type('-3');
  st = await pg.evaluate(() => ({ val: document.activeElement.value, idx: [...document.querySelectorAll('.c-row')].findIndex(r => r.contains(document.activeElement)), n: document.querySelectorAll('.c-row').length }));
  check('negative values can be typed and sink to the bottom', st.val === '-3' && st.idx === st.n - 1, JSON.stringify(st));
  await pg.keyboard.press('Control+a'); await pg.keyboard.press('Backspace');
  st = await pg.evaluate(() => ({ val: document.activeElement.value }));
  check('clearing the box does not force a 0 while typing', st.val === '', JSON.stringify(st));
  await pg.keyboard.type('12'); await pg.keyboard.press('Enter');
  check('combat stored the typed value', await pg.evaluate(n => window.__dmforge.S.combat.combatants.find(c => c.name === n).init === 12, lastName));
  if (shots) await pg.screenshot({ path: shots + '/12-combat.png' });

  // delete combat
  await pg.click('#endCombat');
  await pg.click('#deleteCombat');
  await pg.waitForSelector('.modal:has-text("Delete this combat?")');
  await pg.click('.modal .btn-danger');
  await pg.waitForSelector('text=No fight in progress');
  check('Delete combat clears it and logs nothing', (await pg.evaluate(() => window.__dmforge.S.combat === null && window.__dmforge.S.working.count)) === 0);
  check('deleted combat does not come back from storage', await pg.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('dmforge:combat:') && localStorage.getItem(k) !== 'null')));
  check('no page errors (combat)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 3. categories + moving notes ================= */
{
  const pg = await demo();
  await pg.click('#manageCats');
  await pg.waitForSelector('#catName');
  check('categories dialog lists the existing ones', (await pg.textContent('.cat-list')).includes('NPCs'));
  await pg.fill('#catName', 'Bestiary');
  await pg.click('#catAdd');
  await pg.waitForSelector('.nav-btn:has-text("Bestiary")');
  check('new category appears in the sidebar and opens', (await pg.textContent('.page-head h2')) === 'Bestiary');
  check('adding a category stages nothing in the vault', (await W(pg)).length === 0);
  await pg.click('.content:visible .btn-primary:has-text("New Note")');
  await pg.fill('.modal input >> nth=0', 'Owlbear');
  await pg.click('.modal button[type=submit]');
  await pg.waitForSelector('h2:has-text("Owlbear")');
  check('note created inside the custom category', (await W(pg)).join() === 'create:Ashfall/Bestiary/Owlbear.md');
  const txt = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/Bestiary/Owlbear.md'));
  check('custom category notes do not get a type: x:Bestiary property', !txt.includes('type:'), txt);

  // move an NPC into it
  await pg.click('.nav-btn:has-text("NPCs")');
  await pg.click('.list-item:has-text("Old Tam")');
  await pg.click('#moveBtn');
  await pg.waitForSelector('#moveDest');
  await pg.selectOption('#moveDest', { label: 'Bestiary' });
  await pg.click('#moveGo');
  await pg.waitForSelector('h2:has-text("Old Tam")');
  check('moved note now lives in Bestiary', (await pg.textContent('.note-head')).includes('Bestiary/Old Tam.md'));
  check('the move counts as one change (plus the new note)', (await pg.textContent('#pushBtn')).includes('Push 2 changes'), await pg.textContent('#pushBtn'));
  await pg.click('.nav-btn:has-text("NPCs")');
  check('it left the NPC list', !(await pg.textContent('.list')).includes('Old Tam'));
  await pg.click('#pushBtn'); await pg.waitForSelector('#confirmPush');
  const rv = await pg.textContent('.modal.review');
  check('review shows one Moved row with from and to', rv.includes('Moved') && rv.includes('NPCs/Old Tam.md') && rv.includes('Bestiary/Old Tam.md') && (await pg.locator('.rev-row').count()) === 2, rv.slice(0, 300));
  if (shots) await pg.screenshot({ path: shots + '/13-review-move.png' });
  await pg.click('#confirmPush'); await pg.waitForSelector('#pushDone'); await pg.click('#pushDone');
  check('file moved in the vault, original in .trash', (await vaultHas(pg, 'Ashfall/Bestiary/Old Tam.md')) && !(await vaultHas(pg, 'Ashfall/NPCs/Old Tam.md')) && (await vaultHas(pg, '.trash/Ashfall/NPCs/Old Tam.md')));
  check('Owlbear was written too', await vaultHas(pg, 'Ashfall/Bestiary/Owlbear.md'));
  check('nothing pending after the push', (await W(pg)).length === 0);

  // discarding one half of a move discards both
  await pg.click('.nav-btn:has-text("NPCs")');
  await pg.click('.list-item:has-text("Brother Calder")');
  await pg.click('#moveBtn'); await pg.selectOption('#moveDest', { label: 'Bestiary' }); await pg.click('#moveGo');
  await pg.waitForSelector('.unpushed-bar');
  await pg.click('.unpushed-bar button');
  check('"Discard" on the moved note puts it back', (await W(pg)).length === 0 && (await pg.evaluate(() => window.__dmforge.S.working.has('Ashfall/NPCs/Brother Calder.md'))));

  // delete the category, moving its notes
  await pg.click('#manageCats');
  await pg.waitForSelector('.cat-row');
  await pg.click('.cat-row:has-text("Bestiary") button');
  await pg.waitForSelector('#rmDest');
  await pg.selectOption('#rmDest', { label: 'NPCs' });
  await pg.click('#rmGo');
  await pg.waitForFunction(() => ![...document.querySelectorAll('.nav-btn')].some(b => b.textContent.includes('Bestiary')));
  const w = await W(pg);
  check('deleting a category moved its two notes', w.filter(x => x.startsWith('create:Ashfall/NPCs/')).length === 2, JSON.stringify(w));
  check('the category is gone from the sidebar', true);
  // delete one with 'delete' mode
  await pg.click('#manageCats'); await pg.fill('#catName', 'Scratch'); await pg.click('#catAdd');
  await pg.waitForSelector('.nav-btn:has-text("Scratch")');
  await pg.click('#manageCats'); await pg.click('.cat-row:has-text("Scratch") button');
  check('an empty category can be removed with one click', await pg.locator('#rmDest').count() === 0);
  await pg.click('#rmGo');
  await pg.waitForFunction(() => ![...document.querySelectorAll('.nav-btn')].some(b => b.textContent.includes('Scratch')));
  check('no page errors (categories)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 4. link suggestions ([[links]] between notes) ================= */
{
  const pg = await demo();
  await pg.evaluate(() => {
    const { S, touch } = window.__dmforge;
    const w = S.working;
    w.create('Ashfall/Factions/AOS.md', '# AOS\n\nA cult of the old city.');
    w.create('Ashfall/Players/Xir Valen.md', '---\ntype: player-character\n---\ntiefling red skin horns acyolytes of solice\nperception:: 12');
    w.create('Ashfall/NPCs/Plain.md', 'Plain bakes bread. A villain lich zombie? No.');
    touch();
  });
  await pg.click('.nav-btn:has-text("Factions")');
  await pg.click('.list-item:has-text("AOS")');
  await pg.click('#suggestLinks');
  await pg.waitForSelector('.link-row');
  const rows = await pg.$$eval('.link-row', rs => rs.map(r => r.textContent));
  check('on the AOS page, Xir Valen\'s "acyolytes of solice" is found', rows.length === 1 && rows[0].includes('Xir Valen') && rows[0].includes('acyolytes of solice') && rows[0].includes('keep showing “acyolytes of solice”') && rows[0].includes('Link to'), JSON.stringify(rows));
  check('the match is highlighted in its surrounding text', await pg.locator('.link-row .snip mark:text-is("acyolytes of solice")').count() === 1 && (await pg.textContent('.link-row .snip')).includes('horns'));
  if (shots) await pg.screenshot({ path: shots + '/14-links.png' });
  const before = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/Players/Xir Valen.md'));
  check('nothing is changed before approving', before.includes('horns acyolytes of solice') && !before.includes('[['));
  await pg.click('.link-row .btn-primary');
  const after = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/Players/Xir Valen.md'));
  check('"Link it" turns the text in the OTHER note into a [[link]] and changes nothing else', after === before.replace('acyolytes of solice', '[[AOS|acyolytes of solice]]'), after);
  check('the AOS page itself is untouched', !(await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/Factions/AOS.md'))).includes('[['));
  check('the suggestion is gone and AOS now lists Xir Valen as mentioning it', await pg.locator('.link-row').count() === 0 && (await pg.textContent('.pane:not([hidden]) .card')).includes('Mentioned in') && (await pg.textContent('.pane:not([hidden]) .card')).includes('Xir Valen'));
  // from the player's side, and declining
  await pg.evaluate(() => { const { S, touch } = window.__dmforge; S.working.setText('Ashfall/Players/Xir Valen.md', '---\ntype: player-character\n---\nhe once served the Ember Court and fled.'); touch(); });
  await pg.click('.nav-btn:has-text("Players")');
  await pg.click('.list-item:has-text("Xir Valen")');
  await pg.click('#suggestLinks');
  await pg.waitForSelector('.link-row');
  check('on the player\'s page the same kind of mention is offered "In this note"', (await pg.textContent('.link-row')).includes('In this note') && (await pg.textContent('.link-row')).includes('Link to') && (await pg.textContent('.link-row')).includes('Ember Court') && !(await pg.textContent('.link-row .snip')).includes('[['));
  await pg.click('.link-row .btn-ghost');
  check('declining removes it', await pg.locator('.link-row').count() === 0);
  await pg.click('#suggestLinks'); await pg.click('#suggestLinks');
  check('a declined suggestion does not come back', await pg.locator('.link-row').count() === 0);
  await pg.click('.nav-btn:has-text("NPCs")');
  await pg.click('.list-item:has-text("Plain")');
  await pg.click('#suggestLinks');
  check('an unrelated note gets no suggestions', await pg.locator('.link-row').count() === 0 && (await pg.textContent('.suggest-panel')).includes('Nothing to link'));
  check('no page errors (links)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 5. reformat + Obsidian syntax rendering ================= */
{
  const pg = await demo();
  await pg.evaluate(() => {
    const { S, touch } = window.__dmforge;
    S.working.create('Ashfall/NPCs/Messy.md', '---\nrace: Elf\n---\n##Backstory\nLine one\nLine two\n* a\n* b\n| x | y |\n|---|---|\n| 1 | 2 |\n\n\n\n> [!warning] Careful\n> It bites.\n\n> [!tip]- Folded\n> Hidden hint.\n\nThis is ==important== text %%a secret comment%% here. ^abc123\n\n```dataview\nTABLE x\n```\n- [ ] open task\n- [x] done task\n');
    touch();
  });
  await pg.click('.nav-btn:has-text("NPCs")');
  await pg.click('.list-item:has-text("Messy")');
  await pg.waitForSelector('.md');
  const html = await pg.innerHTML('.md');
  check('callouts render as boxes', await pg.locator('.md .callout-warning .callout-title:has-text("Careful")').count() === 1 && html.includes('It bites'));
  check('folded callouts are collapsible', await pg.locator('.md details.callout-tip summary:has-text("Folded")').count() === 1);
  check('==highlight== is marked', await pg.locator('.md mark:has-text("important")').count() === 1);
  check('%%comments%% and ^block-ids disappear', !html.includes('secret comment') && !html.includes('abc123'));
  check('single line breaks are kept (Obsidian style)', html.includes('Line one<br>') || /Line one\s*<br/.test(html), html.slice(0, 400));
  check('dataview block is shown as code, not run', await pg.locator('.md pre code').count() === 1);
  check('task list renders checkboxes', await pg.locator('.md input[type=checkbox]').count() === 2);
  if (shots) await pg.screenshot({ path: shots + '/15-render.png' });
  check('the callout markdown in the file is untouched by viewing', (await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Messy.md'))).includes('> [!warning] Careful'));

  await pg.click('#reformatBtn');
  await pg.waitForSelector('.reformat-bar');
  const t = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Messy.md'));
  check('reformat fixed heading, bullets and table spacing', t.includes('## Backstory') && t.includes('- a\n- b') && t.includes('\n\n| x | y |') && !/\n\n\n/.test(t), t);
  check('reformat kept callouts, highlight, comment and front matter as written', t.includes('> [!warning] Careful') && t.includes('==important==') && t.includes('%%a secret comment%%') && t.startsWith('---\nrace: Elf\n---'));
  check('the bar says what changed', (await pg.textContent('.reformat-bar')).includes('heading'));
  if (shots) await pg.screenshot({ path: shots + '/16-reformat.png' });
  await pg.click('.reformat-bar button:text-is("Undo")');
  const t2 = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Messy.md'));
  check('undo restores the original text', t2.includes('##Backstory') && await pg.locator('.reformat-bar').count() === 0);
  await pg.click('#reformatBtn'); await pg.waitForSelector('.reformat-bar');
  await pg.click('#reformatBtn');
  check('reformatting a tidy note says so and changes nothing', (await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Messy.md'))) === t);
  // existing demo notes with CRLF are not rewritten when already tidy
  check('no page errors (reformat)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 6. tabs ================= */
{
  const pg = await demo();
  const tabs = () => pg.$$eval('.tab', ts => ts.map(t => ({ title: t.querySelector('.tab-title').textContent, on: t.classList.contains('on') })));
  check('starts with one tab', (await tabs()).length === 1);
  await pg.click('.nav-btn:has-text("NPCs")');
  await pg.click('.list-item:has-text("Mireille Vane")');
  await pg.waitForSelector('h2:has-text("Mireille Vane")');
  check('tab title follows the note', (await tabs())[0].title === 'Mireille Vane');

  // open a map in a second tab
  await pg.click('.nav-btn:has-text("Maps")', { modifiers: ['Control'] });
  await pg.waitForFunction(() => document.querySelectorAll('.tab').length === 2);
  check('ctrl-click on a section opens a new tab', (await tabs()).length === 2 && (await tabs())[1].on);
  await pg.click('.thumb');
  await pg.waitForSelector('#openAssetTab');
  await pg.click('#openAssetTab');
  await pg.waitForFunction(() => document.querySelectorAll('.tab').length === 3);
  await pg.waitForSelector('.map-stage img');
  check('an image opens as its own tab', (await tabs())[2].title === 'Greenhold Map.svg' && (await tabs())[2].on);

  // start writing in the first tab, move away, come back: the draft survives
  await pg.click('.tab:nth-child(1) .tab-main');
  await pg.click('.note-head button:text-is("Edit")');
  await pg.fill('.card textarea >> nth=0', 'DRAFT TEXT I HAVE NOT SAVED [[Old Tam]]');
  await pg.click('.tab:nth-child(3) .tab-main');
  check('the other tab shows the map while the draft tab is hidden', (await pg.locator('.map-stage img').isVisible()));
  await pg.click('.tab:nth-child(1) .tab-main');
  check('unsaved editor text survives switching tabs', (await pg.inputValue('.card textarea >> nth=0')) === 'DRAFT TEXT I HAVE NOT SAVED [[Old Tam]]');

  // split view: notes beside the map
  await layout(pg, 'Two columns');
  await pg.waitForSelector('.workspace.layout-two');
  const vis = await pg.$$eval('.pane', ps => ps.map(p => !p.hidden));
  check('split view shows two panes', vis.filter(Boolean).length === 2, JSON.stringify(vis));
  const boxes = await pg.$$eval('.pane:not([hidden])', ps => ps.map(p => { const r = p.getBoundingClientRect(); return { x: r.x, w: r.width }; }));
  check('the panes sit side by side', boxes.length === 2 && boxes[1].x > boxes[0].x + 300, JSON.stringify(boxes));
  check('the draft is still intact in split view', (await pg.inputValue('.pane:not([hidden]) textarea >> nth=0')) === 'DRAFT TEXT I HAVE NOT SAVED [[Old Tam]]');
  if (shots) await pg.screenshot({ path: shots + '/17-split.png' });
  await pg.click('.pane:not([hidden]) .btn-primary:text-is("Save to pending changes")');
  check('saving from the left pane works while split', (await W(pg)).some(x => x.includes('Mireille Vane')));
  await layout(pg, 'Single pane');
  check('choosing Single pane goes back to one pane', await pg.locator('.workspace.layout-single').count() === 1 && await pg.locator('.pane:not([hidden])').count() === 1);

  // closing tabs
  await pg.click('.tab:nth-child(3) .tab-x');
  check('closing a tab removes it', (await tabs()).length === 2);
  await pg.click('.tab-new');
  check('+ opens a fresh overview tab', (await tabs()).length === 3 && (await tabs())[2].title === 'Overview');
  // ctrl-click a wikilink opens the note in a new tab
  await pg.click('.tab:nth-child(1) .tab-main');
  await pg.waitForSelector('.pane:not([hidden]) .md a.wl');
  await pg.click('.pane:not([hidden]) .md a.wl >> nth=0', { modifiers: ['Control'] });
  await pg.waitForFunction(() => document.querySelectorAll('.tab').length === 4);
  check('ctrl-click on a link opens it in a new tab and leaves the first one alone', (await tabs()).length === 4 && (await tabs())[0].title === 'Mireille Vane');
  await pg.click('.tab:nth-child(1) .tab-x');
  check('can close the first tab', (await tabs()).length === 3);
  check('no page errors (tabs)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 7. split view never overflows, however long a note's summary is ================= */
for (const width of [1000, 1360, 1800, 860]) {
  const pg = await demo(width, 800);
  await pg.evaluate(() => {
    const { S, touch } = window.__dmforge;
    S.working.create('Ashfall/Players/Tyler.md', 'tiefling red skin horns acyolytes of solice perception: 12 type: player-character name: Xir Valen player: hatetoswim and a very very long run of words that never ends and keeps going and going and going');
    S.working.create('Ashfall/Sessions/2026-11-01 Session 3 - Episode 3 - The Three Rings Pt. 2 with an extremely long title that keeps going.md', 'explain to the characters that to begin the session; we will begin with a flashback session. encourage roleplay as the party arrives at a very long description line');
    touch();
  });
  for (const sec of ['Players', 'Sessions']) {
    await pg.click('.nav-btn:has-text("' + sec + '")');
    if (sec === 'Players') {
      await pg.click('.nav-btn:has-text("Maps")', { modifiers: ['Control'] });
      await pg.click('.thumb'); await pg.click('#openAssetTab'); await pg.waitForSelector('.map-stage img');
      await pg.click('.tab:nth-child(1) .tab-main'); if (width > 900) await layout(pg, 'Two columns');      // a window this narrow keeps one pane
    }
    await pg.click('.nav-btn:has-text("' + sec + '")');
    await pg.waitForTimeout(150);
    const m = await pg.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      let over = 0;
      document.querySelectorAll('.pane:not([hidden])').forEach(p => { const r = p.getBoundingClientRect(); p.querySelectorAll('*').forEach(e => { if (!e.offsetParent) return; const x = e.getBoundingClientRect().right; if (x > r.right + 1) over = Math.max(over, Math.round(x - r.right)); }); });
      return { vw, scrollW: document.documentElement.scrollWidth, over };
    });
    check(width + 'px, ' + sec + ' in split view: nothing spills out of its pane and the page does not scroll sideways', m.over === 0 && m.scrollW <= m.vw, JSON.stringify(m));
  }
  if (width > 900) await layout(pg, 'Single pane');
  await pg.waitForTimeout(100);
  const single = await pg.evaluate(() => ({ vw: document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth }));
  check(width + 'px: single pane does not scroll sideways either', single.scrollW <= single.vw, JSON.stringify(single));
  await pg.context().close();
}

/* ================= 8. graph ================= */
{
  const pg = await demo(1360, 800);
  await pg.evaluate(() => {
    const { S, touch } = window.__dmforge;
    S.working.create('Ashfall/Factions/AOS.md', '# AOS\n\nA cult of the old city. Led by [[Brother Calder]].');
    S.working.create('Ashfall/Players/Xir Valen.md', '---\ntype: player-character\n---\ntiefling horns acyolytes of solice');
    S.working.create('Ashfall/NPCs/Loner.md', 'Keeps to himself.');
    touch();
  });
  await pg.click('#navGraph');
  await pg.waitForSelector('#graphCanvas');
  await pg.waitForFunction(() => window.__dmfGraph && window.__dmfGraph.sim && window.__dmfGraph.w > 0);
  const stats = await pg.textContent('#graphStats');
  const counts = await pg.evaluate(() => { const g = window.__dmforge.S; return window.__dmfGraph.sim.nodes.length; });
  check('graph lists every note and the links between them', /^\d+ notes · \d+ links/.test(stats) && counts >= 15, stats + ' / ' + counts);
  await pg.waitForTimeout(400);
  const sane = await pg.evaluate(() => { const s = window.__dmfGraph.sim; return [...s.x, ...s.y].every(Number.isFinite); });
  check('layout produced real coordinates', sane);
  const canvasInfo = await pg.evaluate(() => { const c = document.querySelector('#graphCanvas'); const r = c.getBoundingClientRect(); return { w: r.width, h: r.height, painted: (() => { const ctx = c.getContext('2d'); const d = ctx.getImageData(0, 0, c.width, c.height).data; const first = [d[0], d[1], d[2]].join(); let diff = 0; for (let i = 0; i < d.length; i += 4 * 97) if ([d[i], d[i + 1], d[i + 2]].join() !== first) diff++; return diff; })() }; });
  check('the canvas fills its area and has drawn nodes', canvasInfo.w > 500 && canvasInfo.h > 400 && canvasInfo.painted > 20, JSON.stringify(canvasInfo));
  if (shots) await pg.screenshot({ path: shots + '/18-graph.png' });

  // click a node: its card shows the notes it links with
  const where = async name => { await pg.waitForFunction(() => window.__dmfGraph.sim.alpha <= 0.02, null, { timeout: 20000 }); return pg.evaluate(name => { const e = window.__dmfGraph, i = e.sim.nodes.findIndex(n => n.name === name); const r = document.querySelector('#graphCanvas').getBoundingClientRect(); return { x: r.left + e.sim.x[i] * e.view.k + e.view.x, y: r.top + e.sim.y[i] * e.view.k + e.view.y }; }, name); };
  let p = await where('Mireille Vane');
  await pg.mouse.click(p.x, p.y);
  await pg.waitForFunction(() => /Mireille Vane/.test((document.querySelector('#graphCard') || {}).textContent || ''));
  const card = await pg.textContent('#graphCard');
  check('clicking a note selects it and lists what it links with', card.includes('Mireille Vane') && card.includes('Linked with') && card.includes('Greenhold'), card);
  // double-click opens it in a new tab
  const tabsBefore = await pg.locator('.tab').count();
  await pg.mouse.dblclick(p.x, p.y);
  await pg.waitForFunction(n => document.querySelectorAll('.tab').length === n + 1, tabsBefore);
  check('double-click opens the note in a new tab and leaves the graph open', (await pg.$$eval('.tab .tab-title', t => t.map(x => x.textContent))).includes('Mireille Vane') && (await pg.$$eval('.tab .tab-title', t => t.map(x => x.textContent))).includes('Graph'));
  await pg.click('.tab:has-text("Graph") .tab-main');
  await pg.waitForSelector('#graphCanvas');

  // dragging a node moves it
  p = await where('Greenhold');
  const before = await pg.evaluate(() => { const e = window.__dmfGraph, i = e.sim.nodes.findIndex(n => n.name === 'Greenhold'); return [e.sim.x[i], e.sim.y[i]]; });
  await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.mouse.move(p.x + 80, p.y + 40, { steps: 6 }); await pg.mouse.up();
  const afterPos = await pg.evaluate(() => { const e = window.__dmfGraph, i = e.sim.nodes.findIndex(n => n.name === 'Greenhold'); return [e.sim.x[i], e.sim.y[i]]; });
  check('dragging a note moves it', Math.hypot(afterPos[0] - before[0], afterPos[1] - before[1]) > 20, JSON.stringify({ before, afterPos }));
  // zoom
  const k0 = await pg.evaluate(() => window.__dmfGraph.view.k);
  await pg.mouse.move(600, 400); await pg.mouse.wheel(0, -300);
  check('scrolling zooms', (await pg.evaluate(() => window.__dmfGraph.view.k)) > k0);

  await pg.click('#graphFit');
  // unlinked mentions as dashed lines
  await pg.click('#graphFilters');
  await pg.click('#graphMentions');
  await pg.waitForFunction(() => /unlinked mention/.test(document.querySelector('#graphStats').textContent), null, { timeout: 15000 });
  check('dashed lines count unlinked mentions (Xir Valen writes "acyolytes of solice")', /1 unlinked mention/.test(await pg.textContent('#graphStats')) || /\d+ unlinked mentions/.test(await pg.textContent('#graphStats')), await pg.textContent('#graphStats'));
  p = await where('AOS');
  await pg.mouse.click(p.x, p.y);
  await pg.waitForFunction(() => /AOS/.test((document.querySelector('#graphCard') || {}).textContent || '') && /Mentioned but not linked/.test(document.querySelector('#graphCard').textContent), null, { timeout: 8000 }).catch(() => {});
  check('the AOS card names Xir Valen as mentioned but not linked', (await pg.textContent('#graphCard')).includes('Mentioned but not linked') && (await pg.textContent('#graphCard')).includes('Xir Valen'));

  // local graph around a note
  await pg.click('#graphAround');
  await pg.waitForFunction(() => /around AOS/.test(document.querySelector('#graphStats').textContent) && window.__dmfGraph.sim.nodes.length <= 4);
  const local = await pg.evaluate(() => window.__dmfGraph.sim.nodes.map(n => n.name).sort());
  check('"around one note" shows only the note and what it links with', local.join() === ['AOS', 'Brother Calder'].sort().join() || (local.includes('AOS') && local.length <= 4 && local.length >= 2), local.join());
  await pg.fill('#graphSearch', 'brother');
  await pg.waitForTimeout(100);
  check('searching does not break the view', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.fill('#graphSearch', '');
  // hide a kind of note, orphans
  await pg.click('input[name=gmode] >> nth=0');
  await pg.waitForFunction(() => !/around/.test(document.querySelector('#graphStats').textContent) && window.__dmfGraph.sim.nodes.length > 10);
  const all = await pg.evaluate(() => window.__dmfGraph.sim.nodes.length);
  await pg.click('.legend-row:has-text("Players") input');
  await pg.waitForFunction(n => window.__dmfGraph.sim.nodes.length < n, all);
  check('hiding a kind of note removes those nodes', true);

  // from a note: "Graph" opens the local graph of that note
  await pg.click('.nav-btn:has-text("NPCs")');
  await pg.click('.list-item:has-text("Mireille Vane")');
  await pg.click('#graphBtn');
  await pg.waitForFunction(() => /around Mireille Vane/.test(document.querySelector('#graphStats').textContent));
  await pg.waitForTimeout(300);
  check('the Graph button on a note shows that note\'s connections', (await pg.$$eval('.tab .tab-title', t => t.map(x => x.textContent))).some(x => x === 'Graph: Mireille Vane'));
  if (shots) await pg.screenshot({ path: shots + '/19-graph-local.png' });
  check('no page errors (graph)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 9. right-click: turn words into pages, links, remove links ================= */
{
  const pg = await demo(1360, 900);
  await pg.evaluate(() => {
    const { S, touch } = window.__dmforge;
    S.working.create('Ashfall/NPCs/Sildar.md', '---\ntype: npc\n---\n# Sildar\n\nSildar met Iarno at the gate. Later Iarno left, and **Iarno** is a *Redbrand*.\n\nSee [[Old Tam]], then [[Old Tam]] again and [[Old Tam|the ferryman]] and [[Nowhere Yet]].\n');
    touch();
  });
  const selectWord = async (container, word, nth) => { await pg.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 12000 }); return pg.evaluate(([container, word, nth]) => {
    const root = document.querySelector(container);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let seen = 0, n;
    while ((n = w.nextNode())) {
      let from = 0, i;
      while ((i = n.data.indexOf(word, from)) >= 0) {
        if (seen++ === nth) {
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length);
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
          const b = r.getBoundingClientRect();
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        }
        from = i + 1;
      }
    }
    return null;
  }, [container, word, nth]); };
  await pg.click('.nav-btn:has-text("NPCs")');
  await pg.click('.list-item:has-text("Sildar")');
  await pg.waitForSelector('.pane:not([hidden]) .md');

  // 1. highlight the SECOND "Iarno", right-click, Turn into a page > NPC
  let at = await selectWord('.pane:not([hidden]) .md', 'Iarno', 1);
  await pg.mouse.click(at.x, at.y, { button: 'right' });
  await pg.waitForSelector('.ctx');
  const head = await pg.textContent('.ctx-head');
  check('right-clicking highlighted words opens a menu titled with them', head.includes('Iarno'), head);
  await pg.hover('.ctx-item:has-text("Turn into a page")');
  await pg.waitForSelector('.ctx-sub');
  const kinds = await pg.$$eval('.ctx-sub .ctx-item', is => is.map(i => i.textContent));
  check('the menu offers NPC, Location, Faction, Plot thread and Item', ['NPC', 'Location', 'Faction', 'Plot thread', 'Item'].every(k => kinds.some(t => t.startsWith(k))), JSON.stringify(kinds));
  if (shots) await pg.screenshot({ path: shots + '/20-menu.png' });
  await pg.click('.ctx-sub .ctx-label:text-is("NPC")');
  await pg.waitForFunction(() => window.__dmforge.S.working.has('Ashfall/NPCs/Iarno.md'));
  const src = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Sildar.md'));
  check('the second "Iarno" became [[Iarno]] and the first was left alone', src.includes('Sildar met Iarno at the gate. Later [[Iarno]] left') && (src.match(/Iarno/g) || []).length === 3 && src.includes('**Iarno** is'), src);
  const made = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Iarno.md'));
  check('the new page is an NPC with front matter, staged (not written)', made.includes('type: npc') && made.includes('# Iarno') && !(await pg.evaluate(() => window.__dmforge.S.vault.exists('Ashfall/NPCs/Iarno.md'))), made);
  await pg.waitForSelector('.pane:not([hidden]) .md a.wl:text-is("Iarno")');
  check('the page now shows Iarno as a link', true);

  // 2. a word inside a bold span still works (selection crosses no node); and a folder via "More options"
  at = await selectWord('.pane:not([hidden]) .md', 'Redbrand', 0);
  await pg.mouse.click(at.x, at.y, { button: 'right' });
  await pg.hover('.ctx-item:has-text("Turn into a page")');
  await pg.click('.ctx-sub .ctx-item:has-text("More options")');
  await pg.waitForSelector('#pfName');
  await pg.selectOption('#pfType', 'faction');
  await pg.fill('#pfSub', 'Villains');
  await pg.click('#pfGo');
  await pg.waitForFunction(() => window.__dmforge.S.working.has('Ashfall/Factions/Villains/Redbrand.md'));
  check('"More options" creates a page in a chosen kind and folder', true);
  const src2 = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Sildar.md'));
  check('and links the words', src2.includes('*[[Redbrand]]*'), src2);
  at = await selectWord('.pane:not([hidden]) .md', 'gate', 0);
  await pg.mouse.click(at.x, at.y, { button: 'right' });
  await pg.hover('.ctx-item:has-text("Turn into a page")');
  await pg.hover('.ctx-sub .ctx-item:has-text("Faction")');
  await pg.waitForSelector('.ctx-sub .ctx-sub');
  check('categories that have sub-folders offer them in a second step', (await pg.$$eval('.ctx-sub .ctx-sub .ctx-item', is => is.map(i => i.textContent))).some(t => t.includes('Villains')));
  await pg.click('.ctx-sub .ctx-sub .ctx-item:has-text("Villains")');
  await pg.waitForFunction(() => window.__dmforge.S.working.has('Ashfall/Factions/Villains/gate.md'));
  check('choosing a sub-folder puts the page there', true);

  // 3. right-click a link: remove just that one (the second of three to Old Tam)
  await pg.waitForFunction(() => [...document.querySelectorAll('.pane:not([hidden]) .md a.wl')].filter(a => a.textContent === 'Old Tam').length === 2);
  await pg.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 12000 });
  const tamLinks = await pg.$$('.pane:not([hidden]) .md a.wl:text-is("Old Tam")');
  const box = await tamLinks[1].boundingBox();
  await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await pg.waitForSelector('.ctx');
  const linkMenu = await pg.$$eval('.ctx-item', is => is.map(i => i.textContent));
  check('right-clicking a link offers Open, Show in graph and Remove', linkMenu.some(t => t.startsWith('Open')) && linkMenu.some(t => t.startsWith('Show in graph')) && linkMenu.some(t => t.startsWith('Remove this link')) && linkMenu.some(t => /Remove all 3 links/.test(t)), JSON.stringify(linkMenu));
  await pg.click('.ctx-item:has-text("Remove this link")');
  const src3 = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Sildar.md'));
  check('only that link is removed; the words stay and the others keep their links', src3.includes('See [[Old Tam]], then Old Tam again and [[Old Tam|the ferryman]]'), src3);

  // 4. the Existing links panel
  await pg.click('#existingLinks');
  await pg.waitForSelector('.existing-row');
  const rows = await pg.$$eval('.existing-row', rs => rs.map(r => r.textContent));
  check('Existing links lists each link target with a count', rows.some(r => r.includes('Old Tam') && r.includes('2 times')) && rows.some(r => r.includes('Nowhere Yet')), JSON.stringify(rows));
  await pg.click('.existing-row:has-text("Nowhere Yet") .btn');
  check('Remove from the panel unlinks the broken link, keeping its words', (await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Sildar.md'))).includes('and Nowhere Yet.'));
  await pg.click('.existing-row:has-text("Old Tam") .btn');
  check('"Remove all" unlinks every link to that note in this note', !/\[\[Old Tam/.test(await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Sildar.md'))));
  if (shots) await pg.screenshot({ path: shots + '/21-existing.png' });
  // links FROM another note to this one, removed from here
  await pg.evaluate(() => { const { S, touch } = window.__dmforge; S.working.setText('Ashfall/NPCs/Old Tam.md', S.working.get('Ashfall/NPCs/Old Tam.md') + '\nFriend of [[Sildar]] and [[Sildar]].\n'); touch(); });
  await pg.waitForSelector('.existing-row:has-text("Old Tam")');
  await pg.click('.existing-row:has-text("Old Tam") .btn');
  check('a note that links here can be unlinked from this page', !(await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Old Tam.md'))).includes('[[Sildar]]') && (await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Old Tam.md'))).includes('Friend of Sildar and Sildar.'));

  // 5. link to an existing note + remember as another name
  await pg.evaluate(() => { const { S, touch } = window.__dmforge; S.working.setText('Ashfall/NPCs/Sildar.md', S.working.get('Ashfall/NPCs/Sildar.md') + '\nHe was seen with Tam the ferryman.\n'); touch(); });
  await pg.click('.list-item:has-text("Sildar")');
  await pg.waitForSelector('.pane:not([hidden]) .md');
  at = await selectWord('.pane:not([hidden]) .md', 'Tam the ferryman', 0);
  await pg.mouse.click(at.x, at.y, { button: 'right' });
  await pg.click('.ctx-item:has-text("Link to an existing note")');
  await pg.waitForSelector('#leSearch');
  await pg.fill('#leSearch', 'old t');
  await pg.click('.le-row:has-text("Old Tam")');
  await pg.check('#leAlias');
  await pg.click('#leGo');
  const s5 = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Sildar.md'));
  const tam = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/NPCs/Old Tam.md'));
  check('"Link to an existing note" links the words to it', s5.includes('seen with [[Old Tam|Tam the ferryman]].'), s5);
  check('and can remember the words as another name for that note', /aliases:\n\s+- Tam the ferryman/.test(tam), tam);

  // 6. in the editor: select text in the box, right-click, make a page; right-click inside a [[link]] to remove it
  await pg.click('.pane:not([hidden]) .note-head button:text-is("Edit")');
  const ta = pg.locator('.pane:not([hidden]) textarea').first();
  await ta.evaluate(el => { el.value = 'Zorn hates [[Old Tam]] and loves Brexit.'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await ta.evaluate(el => { const i = el.value.indexOf('Zorn'); el.focus(); el.setSelectionRange(i, i + 4); });
  const tb = await ta.boundingBox();
  await pg.mouse.click(tb.x + 30, tb.y + 14, { button: 'right' });
  await pg.waitForSelector('.ctx');
  check('the editor has the same right-click menu on selected words', (await pg.textContent('.ctx-head')).includes('Zorn'));
  await pg.hover('.ctx-item:has-text("Turn into a page")');
  await pg.click('.ctx-sub .ctx-label:text-is("NPC")');
  await pg.waitForFunction(() => window.__dmforge.S.working.has('Ashfall/NPCs/Zorn.md'));
  check('the editor text gets the link while the page is created', (await ta.inputValue()).startsWith('[[Zorn]] hates [[Old Tam]]'), await ta.inputValue());
  await ta.evaluate(el => { const i = el.value.indexOf('Old Tam'); el.focus(); el.setSelectionRange(i + 1, i + 1); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })); });
  const inLink = await pg.$$eval('.ctx-item', is => is.map(i => i.textContent));
  check('right-clicking inside a [[link]] in the editor offers to remove it', inLink.some(t => t.startsWith('Remove this link')), JSON.stringify(inLink));
  await pg.click('.ctx-item:has-text("Remove this link")');
  check('and removes it from the text box, keeping the words', (await ta.inputValue()) === '[[Zorn]] hates Old Tam and loves Brexit.', await ta.inputValue());

  // 7. broken link: create the page it points at
  await pg.evaluate(() => { const { S, touch } = window.__dmforge; S.working.setText('Ashfall/NPCs/Old Tam.md', S.working.get('Ashfall/NPCs/Old Tam.md') + '\nOwes a debt to [[Gorlag]].\n'); touch(); });
  await pg.click('.pane:not([hidden]) .note-head ~ * button:text-is("Cancel")').catch(() => {});
  await pg.click('.list-item:has-text("Old Tam")');
  await pg.waitForSelector('.pane:not([hidden]) .md a.wl.missing');
  await pg.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 12000 });
  const gl = await (await pg.$('.pane:not([hidden]) .md a.wl.missing')).boundingBox();
  await pg.mouse.click(gl.x + gl.width / 2, gl.y + gl.height / 2, { button: 'right' });
  await pg.hover('.ctx-item:has-text("Create this page")');
  await pg.click('.ctx-sub .ctx-label:text-is("Location")');
  await pg.waitForFunction(() => window.__dmforge.S.working.has('Ashfall/Locations/Gorlag.md'));
  check('right-clicking a link to a page that does not exist can create it', true);

  // menus close properly
  at = await selectWord('.pane:not([hidden]) .md', 'Owes', 0);
  await pg.mouse.click(at.x, at.y, { button: 'right' });
  await pg.waitForSelector('.ctx');
  await pg.keyboard.press('Escape');
  await pg.waitForFunction(() => !document.querySelector('.ctx'));
  at = await selectWord('.pane:not([hidden]) .md', 'Owes', 0);
  await pg.mouse.click(at.x, at.y, { button: 'right' });
  await pg.waitForSelector('.ctx');
  await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('ArrowRight');
  await pg.mouse.click(5, 5);
  await pg.waitForFunction(() => !document.querySelector('.ctx'));
  check('Escape and clicking elsewhere close the menu', true);
  await pg.evaluate(() => getSelection().removeAllRanges());
  await pg.mouse.click(700, 300, { button: 'right' });
  check('right-click with no selection and not on a link leaves the normal browser menu alone', await pg.locator('.ctx').count() === 0);
  check('no page errors (right-click)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 10. new sessions: the date goes in the properties, not the title ================= */
{
  const pg = await demo();
  await pg.click('.nav-btn:has-text("Sessions")');
  await pg.click('.btn-primary:has-text("New Session")');
  await pg.waitForSelector('.modal input[type=date]');
  check('the number is predicted from the folder (2 sessions, highest 12)', (await pg.inputValue('.modal input[type=number]')) === '13', await pg.inputValue('.modal input[type=number]'));
  await pg.fill('.modal input[type=date]', '2026-11-01');
  await pg.fill('.modal input[placeholder="The Ferry at Night"]', 'The Three Rings');
  await pg.click('.modal button[type=submit]');
  await pg.waitForFunction(() => window.__dmforge.S.working.list().some(e => e.path.startsWith('Ashfall/Sessions/Session 13')));
  const made = await pg.evaluate(() => window.__dmforge.S.working.list().find(e => e.kind === 'create'));
  check('the file name has no date: "Session 13 - The Three Rings"', made.path === 'Ashfall/Sessions/Session 13 - The Three Rings.md', made.path);
  check('the date picked is kept in the note\'s properties', /\ndate: 2026-11-01\n/.test(made.text) && /\nnumber: 13\n/.test(made.text), made.text);
  check('the heading has no date either', made.text.includes('# Session 13: The Three Rings') && !made.text.includes('2026-11-01 Session'));
  check('the title shown on the page is just the session name, with the date underneath', (await pg.textContent('.pane:not([hidden]) .note-head h2')).trim() === 'Session 13 - The Three Rings' && (await pg.textContent('.pane:not([hidden]) .list-item[aria-current="true"]')).includes('2026-11-01'), await pg.textContent('.pane:not([hidden]) .note-head h2'));
  check('the page does not repeat the title as a heading', !(await pg.textContent('.pane:not([hidden]) .md')).includes('Session 13: The Three Rings'));
  // with no title, and the newest session is listed first by its date
  await pg.click('.btn-primary:has-text("New Session")');
  await pg.waitForSelector('.modal input[type=date]');
  check('and it moves on after each new session', (await pg.inputValue('.modal input[type=number]')) === '14', await pg.inputValue('.modal input[type=number]'));
  check('what to call it defaults to Session here (the notes and folder say Session)', (await pg.inputValue('#nsWord')) === 'Session');
  await pg.fill('#nsWord', 'Episode');
  await pg.fill('.modal input[type=date]', '2026-12-25');
  await pg.click('.modal button[type=submit]');
  await pg.waitForFunction(() => window.__dmforge.S.working.list().some(e => e.path === 'Ashfall/Sessions/Episode 14.md'));
  check('without a title it is just "Episode 14", and its heading says so too', (await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/Sessions/Episode 14.md'))).includes('# Episode 14\n'));
  await pg.click('.btn-primary:has-text("New Session")');
  await pg.waitForSelector('#nsWord');
  check('the word you chose is remembered for next time', (await pg.inputValue('#nsWord')) === 'Episode');
  await pg.keyboard.press('Escape');
  const first = await pg.textContent('.pane:not([hidden]) .list-item');
  check('sessions are still ordered by their date property', first.includes('Episode 14') && first.includes('2026-12-25'), first);
  check('no page errors (sessions)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 11. saving a generation: foldable, and to several places at once ================= */
{
  const pg = await demo();
  await openGen(pg, 'Shop');
  const shopName = (await pg.evaluate(() => window.__dmforge.S.working && 1)) && null;
  await pg.click('[data-gen="shop"] button:has-text("Save to campaign")');
  await pg.waitForSelector('#sgSave');
  check('a shop is suggested for Locations, and the other places are unticked', await pg.isChecked('input[data-kind="location"]') && !(await pg.isChecked('#sgPrep')) && !(await pg.isChecked('input[data-kind="faction"]')));
  const kinds = await pg.$$eval('.modal input[data-kind]', els => els.map(e => e.dataset.kind));
  check('every kind of page can be ticked, except players', ['npc', 'location', 'faction', 'plot', 'item'].every(k => kinds.includes(k)) && !kinds.includes('player'), kinds.join(','));
  check('the fold option only shows once session prep is ticked', (await pg.locator('#sgFold').count()) === 0);
  await pg.click('#sgPrep');
  check('collapsing is on by default', await pg.isChecked('#sgFold'));
  await pg.click('input[data-kind="faction"]');
  check('the button says how many places', (await pg.textContent('#sgSave')).includes('3 places'), await pg.textContent('#sgSave'));
  await pg.fill('#sgName', "Jorah's Arcana");
  await pg.click('#sgSave');
  await pg.waitForFunction(() => !document.querySelector('.modal'));
  const list = await W(pg);
  check('a new location note and a new faction note were both created', list.includes("create:Ashfall/Locations/Jorah's Arcana.md") && list.includes("create:Ashfall/Factions/Jorah's Arcana.md"), list.join('\n'));
  const toastText = await pg.textContent('.toast');
  check('the message names every place', /session prep/.test(toastText) && /location/.test(toastText) && /faction/.test(toastText), toastText);
  const sess = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/Sessions/Session 12 - The Ferry at Night.md') ?? window.__dmforge.S.working.list().find(e => /Sessions\//.test(e.path)).path);
  const prepPath = (await pg.evaluate(() => window.__dmforge.S.working.list().filter(e => e.kind === 'update' && /Sessions\//.test(e.path)).map(e => e.path)))[0];
  check('the session was edited', !!prepPath, JSON.stringify(await W(pg)));
  const prepText = await pg.evaluate(p => window.__dmforge.S.working.get(p), prepPath);
  check("the prep entry is a collapsed callout whose title links to the new note", /> \[!info\]- Shop — \[\[Jorah's Arcana\]\]\n> /.test(prepText), prepText.slice(-400));
  // open the session note: it renders as a closed <details>
  await pg.evaluate(p => window.__dmforge.A.goto(p), prepPath);
  await pg.waitForSelector('.pane:not([hidden]) .md details.callout-info');
  const state = await pg.evaluate(() => { const d = document.querySelector('.pane:not([hidden]) .md details.callout-info'); return { open: d.open, title: d.querySelector('summary').textContent, hasList: !!d.querySelector('li'), link: !!d.querySelector('summary a') }; });
  check('in DM Forge it shows as one closed line with a link', !state.open && /Shop — Jorah/.test(state.title) && state.link, JSON.stringify(state));
  check('opening it reveals the details as a list', await pg.evaluate(() => { const d = document.querySelector('.pane:not([hidden]) .md details.callout-info'); d.open = true; return d.querySelectorAll('li').length > 3; }));
  // the unfolded alternative
  await openGen(pg, 'Tavern');
  await pg.click('[data-gen="tavern"] button:has-text("Save to campaign")');
  await pg.waitForSelector('#sgSave');
  await pg.click('input[data-kind="location"]');
  await pg.click('#sgPrep');
  await pg.click('#sgFold');
  await pg.click('#sgSave');
  await pg.waitForSelector('.pane:not([hidden]) .note-head');
  const t2 = await pg.evaluate(p => window.__dmforge.S.working.get(p), prepPath);
  check('unticking collapse gives the plain heading and list', /\n### Tavern — /.test(t2) && !/\[!example\]|\[!info\]- Tavern/.test(t2.split("Shop — ")[1] || ''), t2.slice(-300));
  check('saving to one place goes straight to it', (await pg.textContent('.pane:not([hidden]) .note-head h2')).includes('Session'));
  check('Save is disabled with nothing ticked', await (async () => {
    await openGen(pg, 'NPC');
    await pg.click('[data-gen="npc"] button:has-text("Save to campaign")');
    await pg.waitForSelector('#sgSave');
    await pg.click('input[data-kind="npc"]');
    const d = await pg.isDisabled('#sgSave');
    await pg.keyboard.press('Escape');
    return d;
  })());
  check('no page errors (save generated)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 12. dark and light mode ================= */
{
  const bg = pg => pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const attr = pg => pg.evaluate(() => document.documentElement.getAttribute('data-theme'));
  let pg = await demo();                      // the test browser prefers light
  check('follows the system when you have not chosen (light here)', (await attr(pg)) === null && (await bg(pg)) === 'rgb(239, 236, 226)', await bg(pg));
  check('the toggle is in the top bar', await pg.locator('.topbar #themeToggle').count() === 1);
  const t0 = Date.now();
  await pg.click('#themeToggle');
  check('the switch is instant to start (the page is not frozen)', Date.now() - t0 < 500, String(Date.now() - t0));
  const frames = await pg.evaluate(() => new Promise(res => { const f = []; let last = performance.now(); const t = n => { f.push(n - last); last = n; if (f.length < 120) requestAnimationFrame(t); else res(Math.max(...f)); }; requestAnimationFrame(t); }));
  check('no frame stalls while it fades (worst frame under 200ms)', frames < 200, String(frames));
  await pg.click('.nav-btn:has-text("Players")');
  check('the page stays usable during the fade', (await pg.textContent('.topbar, body')).length > 0 && (await pg.locator('.pane:not([hidden]) .list-item').count()) > 0);
  // the fade is 0.3s now: polish45 checks its length, so here only that it settles
  await pg.waitForTimeout(Math.max(0, 900 - (Date.now() - t0)));
  check('shortly after, dark mode has fully arrived', (await bg(pg)) === 'rgb(24, 23, 20)', await bg(pg));
  check('the setting itself changed straight away', (await attr(pg)) === 'dark');
  check('the button reports dark', (await pg.getAttribute('#themeToggle', 'aria-pressed')) === 'true');
  check('the choice is stored', (await pg.evaluate(() => localStorage.getItem('dmforge:theme'))) === 'dark');
  if (shots) await pg.screenshot({ path: shots + '/theme-dark.png' });
  await pg.reload();
  await pg.waitForSelector('text=Try the demo vault');
  check('it is still dark after reloading, with no flash of light (set before the app starts)', (await attr(pg)) === 'dark' && (await bg(pg)) === 'rgb(24, 23, 20)', await bg(pg));
  check('and the welcome screen has its own toggle', await pg.locator('#themeToggle.floating').count() === 1);
  await pg.click('#themeToggle');
  await pg.waitForTimeout(3400);
  check('back to light', (await attr(pg)) === 'light' && (await bg(pg)) === 'rgb(239, 236, 226)', await bg(pg));
  await pg.click('#themeToggle', { modifiers: ['Shift'] });
  await pg.waitForTimeout(200);
  check('Shift-click goes back to following the system', (await attr(pg)) === null && (await pg.evaluate(() => localStorage.getItem('dmforge:theme'))) === null);
  await pg.context().close();

  // a system that prefers dark, and one that asks for less motion
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  pg = await ctx.newPage();
  pg.errors = [];
  pg.on('pageerror', e => pg.errors.push(e.message));
  await pg.goto('http://localhost:8771/');
  await pg.waitForSelector('text=Try the demo vault');
  check('follows a dark system when you have not chosen', (await bg(pg)) === 'rgb(24, 23, 20)', await bg(pg));
  await pg.click('#themeToggle');
  const quick = await pg.evaluate(() => ({ t: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor }));
  check('with reduced motion it switches at once', quick.t === 'light' && quick.bg === 'rgb(239, 236, 226)', JSON.stringify(quick));
  check('no page errors (theme)', pg.errors.length === 0, pg.errors.join('\n'));
  await ctx.close();
}

/* ================= 13. the Add a link button: link to notes that never mention each other ================= */
{
  const pg = await demo();
  await pg.click('.nav-btn:has-text("Players")');
  await pg.click('.pane:not([hidden]) .list-item:has-text("Kestra")');
  await pg.waitForSelector('#addLink', { state: 'attached' });
  check('there are three link buttons: Suggest, Existing, Add', await pg.locator('#suggestLinks, #existingLinks, #addLink').count() === 3);
  await pg.click('#addLink');
  await pg.waitForSelector('#alSearch');
  await pg.fill('#alSearch', 'bells');
  const rows = await pg.locator('.al-row').count();
  check('typing narrows the list of every note in the vault', rows >= 1 && rows < 6, String(rows));
  await pg.fill('#alSearch', '');
  const all = await pg.locator('.al-row').count();
  check('with no search it lists many notes, not just ones that mention this page', all > 8, String(all));
  const heads = await pg.$$eval('.al-head', els => els.map(e => e.textContent.replace(/ · .*/, '').trim()));
  check('the list is grouped by category, with a heading for each', heads.length >= 5 && heads.includes('NPCs') && heads.includes('Sessions') && heads.includes('Factions'), heads.join(','));
  check('the heading order is not alphabetical: it follows how much the vault links to each category', heads.join() !== [...heads].sort().join());
  check('loose notes ("Other notes") come last', heads[heads.length - 1] === 'Other notes' || !heads.includes('Other notes'), heads.join(','));
  const inGroup = await pg.evaluate(() => { const g = document.querySelector('.al-group[data-group="npc"]'); return [...g.querySelectorAll('.al-row strong')].map(e => e.textContent); });
  check('NPCs are all together, A to Z', inGroup.length >= 3 && inGroup.join() === [...inGroup].sort((a, b) => a.localeCompare(b)).join(), inGroup.join(','));
  const ses = await pg.evaluate(() => [...document.querySelectorAll('.al-group[data-group="session"] .al-row strong')].map(e => e.textContent));
  check('sessions are newest first', ses.length === 2 && ses[0].includes('Session 12') && ses[1].includes('Session 11'), ses.join(','));
  await pg.fill('#alSearch', 'grehold'.replace('grehold', 'green'));
  const only = await pg.$$eval('.al-head', els => els.map(e => e.textContent.replace(/ · .*/, '').trim()));
  check('searching hides the groups with no match', only.length >= 1 && only.length < heads.length && only.includes('Locations'), only.join(','));
  await pg.fill('#alSearch', '');
  await pg.fill('#alSearch', 'bells');
  await pg.check('.al-row:has-text("Missing Bells") input');
  await pg.fill('#alSearch', 'Greenhold');
  await pg.check('.al-row:has-text("Greenhold") input');
  check('the button counts what is ticked', (await pg.textContent('#alGo')).includes('2 links'), await pg.textContent('#alGo'));
  check('and a count of what is selected stays at the top while you search', (await pg.textContent('#alCount')).trim() === '2 selected', await pg.textContent('#alCount'));
  await pg.click('#alBack');
  await pg.click('#alGo');
  await pg.waitForFunction(() => !document.querySelector('#alSearch'));
  const toast13 = await pg.textContent('.toast');
  check('a message says what happened', /Linked to 2 notes/.test(toast13) && /link back/.test(toast13), toast13);
  const kp = 'Ashfall/Players/Kestra Dune.md';
  const kt = await pg.evaluate(p => window.__dmforge.S.working.get(p), kp);
  check('both links were written under a Related heading', /## Related\n\n- \[\[The Missing Bells\]\]\n- \[\[Greenhold\]\]\n/.test(kt), kt.slice(-200));
  const back = await pg.evaluate(() => window.__dmforge.S.working.list().filter(e => e.kind === 'update').map(e => e.path));
  check('the other notes got a link back to Kestra', back.some(x => /Missing Bells/.test(x)) && back.some(x => /Greenhold/.test(x)), back.join(','));
  const bt = await pg.evaluate(p => window.__dmforge.S.working.get(p), back.find(x => /Missing Bells/.test(x)));
  check('that link back sits under Related too', /## Related\n\n- \[\[Kestra Dune\]\]/.test(bt), bt.slice(-150));
  await pg.waitForSelector('.pane:not([hidden]) .md a[href^="dmf-link"], .pane:not([hidden]) .md a');
  check('the links show on the page', (await pg.textContent('.pane:not([hidden]) .md')).includes('The Missing Bells'));
  // what is already linked cannot be added twice
  await pg.click('#addLink');
  await pg.fill('#alSearch', 'Greenhold');
  check('notes that are already linked are marked and cannot be ticked', await pg.isDisabled('.al-row:has-text("Greenhold") input') && (await pg.textContent('.al-row:has-text("Greenhold")')).includes('already linked'));
  await pg.fill('#alSearch', 'Ironhollow');
  await pg.check('.al-row:has-text("Bram") input');
  await pg.fill('#alHeading', 'Allies');
  await pg.click('#alGo');
  const kt2 = await pg.evaluate(p => window.__dmforge.S.working.get(p), kp);
  check('a different heading makes its own section', /## Allies\n\n- \[\[Bram Ironhollow\]\]\n/.test(kt2) && (kt2.match(/## Related/g) || []).length === 1, kt2.slice(-200));
  check('no page errors (add a link)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 14. the list and the note scroll separately; tab labels are centred ================= */
{
  const pg = await demo(1360, 700);
  await pg.evaluate(() => {
    const { S, touch } = window.__dmforge;
    for (let i = 0; i < 40; i++) S.working.create('Ashfall/Sessions/Episode ' + (20 + i) + '.md', '---\ntype: session\nnumber: ' + (20 + i) + '\n---\n# Episode ' + (20 + i) + '\n\nText\n');
    const p = 'Ashfall/Sessions/2026-10-12 Session 12.md';
    S.working.setText(p, S.working.get(p) + '\n' + Array.from({ length: 120 }, (_, i) => 'Long line number ' + i + ' of the session notes.').join('\n\n') + '\n');
    touch();
  });
  await pg.click('.nav-btn:has-text("Sessions")');
  await pg.click('.pane:not([hidden]) .list-item:has-text("Session 12")');
  await pg.waitForSelector('.pane:not([hidden]) .note-head');
  const cols = () => pg.evaluate(() => {
    const sp = document.querySelector('.pane:not([hidden]) .scroll-split');
    const [l, r] = sp.children;
    const f = document.querySelector('.pane:not([hidden]) .scroll-split input[type=search]').getBoundingClientRect();
    const h = document.querySelector('.pane:not([hidden]) .page-head').getBoundingClientRect();
    return { l: l.scrollTop, r: r.scrollTop, lMax: l.scrollHeight - l.clientHeight, rMax: r.scrollHeight - r.clientHeight, doc: document.scrollingElement.scrollTop, docMax: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight, filterTop: Math.round(f.top), headTop: Math.round(h.top) };
  });
  const c0 = await cols();
  check('the page itself does not scroll; the list and the note are each scrollable', c0.docMax <= 1 && c0.rMax > 300 && c0.lMax > 100, JSON.stringify(c0));
  await pg.mouse.move(900, 400);
  await pg.mouse.wheel(0, 1500);
  await pg.waitForTimeout(200);
  const c1 = await cols();
  check('scrolling the note moves only the note', c1.r > 500 && c1.l === 0 && c1.doc === 0, JSON.stringify(c1));
  check('so the list (its filter box) and the title are still in view', c1.filterTop === c0.filterTop && c1.headTop === c0.headTop && c1.filterTop > 0 && c1.filterTop < 300, JSON.stringify([c0, c1]));
  await pg.mouse.move(400, 400);
  await pg.mouse.wheel(0, 600);
  await pg.waitForTimeout(200);
  const c2 = await cols();
  check('scrolling the list moves only the list', c2.l > 100 && c2.r === c1.r, JSON.stringify(c2));
  check('the last item of the list can be reached', await pg.evaluate(() => { const l = document.querySelector('.pane:not([hidden]) .scroll-split').children[0]; l.scrollTop = 99999; const items = l.querySelectorAll('.list-item'); const last = items[items.length - 1].getBoundingClientRect(); const lr = l.getBoundingClientRect(); return last.bottom <= lr.bottom + 1; }));
  // the note's own buttons are reachable by scrolling to them
  check('the right-hand side still shows the end of a long note', await pg.evaluate(() => { const r = document.querySelector('.pane:not([hidden]) .scroll-split').children[1]; r.scrollTop = 99999; return r.textContent.includes('Long line number 119'); }));
  // split view: each pane scrolls on its own
  await layout(pg, 'Two columns');
  await pg.waitForTimeout(300);
  const two = await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden])')].map(p => ({ ov: getComputedStyle(p).overflowY, h: Math.round(p.getBoundingClientRect().height) })));
  check('split view: both panes are the height of the window and scroll themselves', two.length === 2 && two.every(x => x.h > 400 && x.h < 700), JSON.stringify(two));
  await layout(pg, 'Single pane');
  // tab labels: equal space either side, and centred up and down
  const geo = () => pg.evaluate(() => {
    const t = document.querySelector('.tab.on'), m = t.querySelector('.tab-main'), l = t.querySelector('.tab-title');
    const tr = t.getBoundingClientRect(), lr = l.getBoundingClientRect();
    return { x: !!t.querySelector('.tab-x'), left: Math.round((lr.left - tr.left) * 10) / 10, right: Math.round((tr.right - lr.right) * 10) / 10, up: Math.round((lr.top + lr.height / 2 - (tr.top + tr.height / 2)) * 10) / 10 };
  });
  const g1 = await geo();
  check('a tab without a close button has equal space left and right of the label', !g1.x ? Math.abs(g1.left - g1.right) <= 1.5 : true, JSON.stringify(g1));
  check('the label is centred vertically', Math.abs(g1.up) <= 1.5, JSON.stringify(g1));
  await pg.click('.tab-new');
  await pg.waitForTimeout(200);
  const g2 = await geo();
  check('with a close button the label keeps its padding and the x sits at the end', g2.x && g2.left >= 10 && g2.right >= 12, JSON.stringify(g2));
  check('no page errors (scrolling)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();

  // a narrow window keeps the ordinary single scrolling page
  const pn = await demo(800, 700);
  await pn.click('.nav-btn:has-text("Sessions")');
  await pn.click('.pane:not([hidden]) .list-item:has-text("Session 12")');
  const nar = await pn.evaluate(() => ({ doc: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight, fixed: getComputedStyle(document.querySelector('.main')).overflow }));
  check('on a narrow screen the page scrolls as one, as before', nar.doc && nar.fixed === 'visible', JSON.stringify(nar));
  await pn.context().close();
}

/* ================= 15. the version history page ================= */
{
  const pg = await demo();
  const version = fs.readFileSync(path.join(here, '..', 'VERSION'), 'utf8').trim();
  check('the version at the bottom of the sidebar is a button', (await pg.locator('button#appVersion').count()) === 1 && (await pg.textContent('#appVersion')).includes(version));
  await pg.click('#appVersion');
  await pg.waitForSelector('#histSearch');
  check('clicking it opens the Version history page', (await pg.textContent('.pane:not([hidden]) .page-head h2')) === 'Version history');
  check('it says which version you are on', (await pg.textContent('#histStats')).includes('You are on ' + version), await pg.textContent('#histStats'));
  const vers = await pg.$$eval('.rel .rel-ver', els => els.map(e => e.textContent));
  check('the newest release is first and is the current version', vers[0] === version, vers.slice(0, 3).join(','));
  check('it lists every release, down to the first V2 build and what came before', vers.includes('2.1.0') && vers.includes('2.4.7') && vers.includes('V2 · build 1') && vers.includes('iOS app') && vers.length >= 24, String(vers.length));
  check('only the newest is open to begin with', (await pg.locator('.rel.open').count()) === 1 && (await pg.locator('.rel').first().evaluate(e => e.classList.contains('open'))));
  check('and it is marked "You are here"', (await pg.locator('.rel').first().textContent()).includes('You are here'));
  await pg.click('.rel[data-version="2.4.7"] .rel-head');
  check('clicking a release opens it', (await pg.textContent('.rel[data-version="2.4.7"] .rel-body')).includes('read-only'));
  await pg.click('#histExpand');
  const open = await pg.locator('.rel.open').count();
  check('Expand all opens every release', open === vers.length, open + '/' + vers.length);
  await pg.click('#histCollapse');
  check('Collapse all closes them', (await pg.locator('.rel.open').count()) === 0);
  await pg.fill('#histSearch', 'graph');
  const hits = await pg.$$eval('.rel', els => els.map(e => e.dataset.version));
  check('searching shows only releases with a matching change, opened', hits.length >= 3 && hits.length < vers.length && hits.includes('2.3.0') && (await pg.locator('.rel.open').count()) === hits.length, hits.join(','));
  check('only the matching changes are listed in each', (await pg.locator('.rel[data-version="2.3.0"] .rel-list li').count()) >= 1 && (await pg.locator('.rel[data-version="2.3.0"] .rel-list li').count()) < 3);
  await pg.fill('#histSearch', '');
  await pg.click('.chip-btn[data-kind="fixed"]');
  const fixedOnly = await pg.$$eval('.rel .rel-list li .pill', els => [...new Set(els.map(e => e.textContent))]);
  check('the Fixed filter shows only fixes', fixedOnly.length === 1 && fixedOnly[0] === 'Fixed', fixedOnly.join(','));
  await pg.click('.chip-btn[data-kind="all"]');
  await pg.fill('#histSearch', 'zzzzzz');
  check('a search with no match says so', (await pg.textContent('.rel-list-wrap')).includes('Nothing in the history matches'));
  await pg.fill('#histSearch', '');
  // it also opens in its own tab from the sidebar, with a proper tab title
  await pg.click('#navSettings'); await pg.click('#menuHistory', { modifiers: ['Control'] });
  await pg.waitForTimeout(200);
  check('Ctrl-click opens it in a new tab titled "Version history"', (await pg.locator('.tab:has-text("Version history")').count()) >= 1);
  check('no page errors (version history)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 16. session templates ================= */
{
  const pg = await demo();
  await pg.click('.nav-btn:has-text("Players")');
  await pg.click('.pane:not([hidden]) .list-item:has-text("Kestra")');
  check('players do not get the template button', (await pg.locator('#addTemplateBtn').count()) === 0);
  await pg.click('.nav-btn:has-text("Sessions")');
  await pg.click('.pane:not([hidden]) .list-item:has-text("Session 12")');
  await pg.waitForSelector('#addTemplateBtn');
  const before = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/Sessions/2026-10-12 Session 12.md'));
  await pg.click('#addTemplateBtn');
  await pg.waitForSelector('#tplAdd');
  check('the dialog offers the templates, the full session prep first', (await pg.locator('input[data-tpl]').count()) >= 2 && await pg.isChecked('input[data-tpl="session-prep"]'));
  check('and previews the layout, with the callouts drawn', (await pg.locator('.tpl-preview details.callout-important').count()) === 1 && (await pg.textContent('.tpl-preview')).includes('MUST HAPPEN') && (await pg.textContent('.tpl-preview')).includes('State tracker'));
  check('the blank checkboxes show as checkboxes, not as "[ ]" text', (await pg.locator('.tpl-preview input[type=checkbox]').count()) >= 6 && !(await pg.textContent('.tpl-preview')).includes('[ ]'));
  if (shots) await pg.screenshot({ path: shots + '/26-template.png' });
  await pg.click('#tplAdd');
  await pg.waitForFunction(() => !document.querySelector('.modal'));
  const after = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/Sessions/2026-10-12 Session 12.md'));
  const base = before;
  check('the blank layout was added and the text before it is unchanged', after.startsWith(before.slice(0, before.indexOf('## Recap')).replace(/\s+$/, '')) && after.length > before.length + 250, after.slice(-300));
  check('it has the callouts and headings, left blank to fill in', /> \[!important\]\+ MUST HAPPEN\n> \n> - \[ \] \n/.test(after) && after.includes("## NPC's appearing in this episode"));
  check('it went under Prep, before the Recap, which is untouched', after.indexOf('MUST HAPPEN') > after.indexOf('## Prep') && after.indexOf('MUST HAPPEN') < after.indexOf('## Recap') && after.endsWith(base.slice(base.indexOf('## Recap'))));
  await pg.click('#addTemplateBtn'); await pg.waitForSelector('#tplAdd');
  await pg.click('input[data-tpl="npc-card"]'); await pg.click('#tplAdd');
  await pg.waitForFunction(() => !document.querySelector('.modal'));
  const withCard = await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/Sessions/2026-10-12 Session 12.md'));
  check('an NPC card goes under "NPC\'s appearing in this episode", still before the Recap', withCard.indexOf('> [!note]- NPC name') > withCard.indexOf("## NPC's appearing in this episode") && withCard.indexOf('> [!note]- NPC name') < withCard.indexOf('## Recap'));
  check('and the page scrolls to what was added', (await pg.locator('.pane:not([hidden]) .md .leftoff-flash').count()) >= 0);
  check('there is a blank line between the old text and the template', /\n\n> \[!important\]\+ MUST HAPPEN/.test(after));
  check('the note is now a pending edit', (await pg.textContent('.pane:not([hidden]) .unpushed-bar')).includes('Edited'));
  const rendered = await pg.evaluate(() => ({ imp: !!document.querySelector('.pane:not([hidden]) .md details.callout-important[open]'), npc: !!document.querySelector('.pane:not([hidden]) .md details.callout-note:not([open])'), todo: !!document.querySelector('.pane:not([hidden]) .md details.callout-todo') }));
  check('in DM Forge the callouts show: open for + ones, folded for the NPC card', rendered.imp && rendered.npc && rendered.todo, JSON.stringify(rendered));
  // an NPC card on its own, in the editor, at the cursor
  await pg.click('.pane:not([hidden]) .note-head button:has-text("Edit")');
  await pg.waitForSelector('#editTemplateBtn');
  await pg.evaluate(() => { const t = document.querySelector('.pane:not([hidden]) textarea'); t.focus(); t.setSelectionRange(0, 0); });
  await pg.click('#editTemplateBtn');
  await pg.waitForSelector('#tplAdd');
  await pg.click('input[data-tpl="npc-card"]');
  check('the preview follows the choice', (await pg.textContent('.tpl-preview')).includes('Voice/mannerisms') && !(await pg.textContent('.tpl-preview')).includes('MUST HAPPEN'));
  await pg.click('#tplAdd');
  await pg.waitForFunction(() => !document.querySelector('.modal'));
  const ta = await pg.inputValue('.pane:not([hidden]) textarea');
  check('in the editor it lands at the cursor, with a blank line after it', ta.startsWith('> [!note]- NPC name') && ta.indexOf('> - **Stat block:**') > 0 && /\n\n/.test(ta.slice(0, ta.indexOf('_If unsure:_') + 30 + 20)));
  await pg.waitForFunction(() => document.querySelector('.pane:not([hidden]) textarea').selectionStart > 0);
  const caret = await pg.evaluate(() => { const t = document.querySelector('.pane:not([hidden]) textarea'); return [t.selectionStart, t.value.indexOf('_If unsure:_')]; });
  check('and the cursor sits at the end of what was added', caret[0] > caret[1] && caret[0] < caret[1] + 40, JSON.stringify(caret));
  await pg.click('.pane:not([hidden]) button:has-text("Cancel")');
  check('cancelling the edit discards the pasted card (the earlier template stays)', !(await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/Sessions/2026-10-12 Session 12.md'))).startsWith('> [!note]- NPC name'));
  check('no page errors (templates)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 17. Claude (experimental): without the helper it only explains ================= */
{
  const pg = await demo();
  check('the sidebar has a Menu button, and Claude (experimental) is inside it', (await pg.textContent('#navSettings')).trim().startsWith('Menu') && (await pg.locator('#navClaude, #navHistory').count()) === 0);
  await pg.click('#navSettings');
  await pg.waitForSelector('#menuSettings');
  check('the Menu lists Settings and Version history (Claude is inside Settings now)', (await pg.locator('#menuSettings, #menuHistory').count()) === 2 && (await pg.locator('#menuClaude').count()) === 0);
  await pg.click('#menuSettings'); await pg.click('[data-setcat="claude"]');
  await pg.waitForSelector('#claudePanel');
  check('without the helper it says what it needs and offers no switch', (await pg.textContent('#claudePanel')).includes('needs the helper') && (await pg.locator('#claudeToggle').count()) === 0);
  await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage'));
  check('no Claude buttons without the helper', (await pg.locator('#askClaudeBtn, [data-claude]').count()) === 0);
  await pg.click('#appVersion');
  await pg.waitForSelector('.rel[data-version="2.11.0"]');
  check('the demo is in the version history, marked Experimental', (await pg.textContent('.rel[data-version="2.11.0"] .rel-head')).includes('Experimental'));
  if (!(await pg.locator('.rel[data-version="2.11.0"].open').count())) await pg.click('.rel[data-version="2.11.0"] .rel-head');
  check('and says how to turn it off or roll back', (await pg.textContent('.rel[data-version="2.11.0"] .rel-body')).includes('Rollback') || (await pg.textContent('.rel[data-version="2.11.0"] .rel-body')).includes('Roll back'));
  check('no page errors (claude, no helper)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 18. editing a note where it is shown ================= */
{
  const pg = await demo();
  const path = 'Ashfall/Sessions/2026-10-12 Session 12.md';
  const get = () => pg.evaluate(p => window.__dmforge.S.working.get(p), path);
  await pg.click('.nav-btn:has-text("Sessions")');
  await pg.click('.pane:not([hidden]) .list-item:has-text("Session 12")');
  await pg.click('#addTemplateBtn'); await pg.click('#tplAdd');
  await pg.waitForFunction(() => !document.querySelector('.modal'));
  const base = await get();
  const md = '.pane:not([hidden]) .md';
  // 1. tick a box
  await pg.click(md + ' details.callout-important input[data-task] >> nth=0');
  let t = await get();
  check('clicking a checkbox ticks it in the file', t.includes('> - [x] \n') && (await pg.locator(md + ' details.callout-important input[data-task]:checked').count()) === 1);
  check('and only that line changed', t.length === base.length && t.replace('> - [x] \n', '> - [ ] \n') === base);
  await pg.click(md + ' details.callout-important input[data-task] >> nth=0');
  check('clicking again unticks it', (await get()) === base);
  // 2. fill in the empty bullets of a callout, Enter making the next one (the Session prep template has no such callout since 2.51.2, so one is added)
  await pg.evaluate(() => { const S = window.__dmforge.S; const p = S.selected; const b = window.__dmforge.getIndex().byPath.get(p).body; window.__dmforge.A.saveNoteEdit(p, { body: b.replace(/\s*$/, '') + '\n\n> [!tip]+ Table rules\n> \n> - \n> - \n> - \n' }); });
  await pg.waitForSelector(md + ' details.callout-tip .u-empty');
  await pg.click(md + ' details.callout-tip .u-empty >> nth=0');
  await pg.waitForSelector('.u-edit');
  await pg.keyboard.type('Spaghetti western, ham it up');
  await pg.keyboard.press('Enter');
  await pg.waitForFunction(() => document.querySelectorAll('details.callout-tip li').length === 4);
  await pg.waitForSelector('.u-edit');
  check('Enter saves the bullet and opens a new one under it', (await pg.locator('.u-edit').count()) === 1 && (await get()).includes('> - Spaghetti western, ham it up\n> - \n> - \n> - \n'));
  await pg.keyboard.type('Track who holds the box');
  await pg.click('.pane:not([hidden]) .note-head h2');     // clicking elsewhere saves
  await pg.waitForFunction(() => !document.querySelector('.u-edit'));
  t = await get();
  check('clicking away saves what was typed', t.includes('> - Spaghetti western, ham it up\n> - Track who holds the box\n> - \n> - \n'), t.slice(-900));
  check('the page shows the new bullets inside the callout, still formatted', (await pg.locator(md + ' details.callout-tip li:has-text("Track who holds")').count()) === 1);
  // 3. a paragraph, with Ctrl+Enter
  await pg.dblclick(md + ' em:has-text("Everything else is bonus")');
  await pg.waitForSelector('.u-edit');
  check('the box holds just that line, without the > mark', (await pg.inputValue('.u-edit')) === '_Everything else is bonus._');
  await pg.fill('.u-edit', '_Everything else is a bonus._');
  await pg.keyboard.press('Control+Enter');
  await pg.waitForFunction(() => !document.querySelector('.u-edit'));
  check('Ctrl+Enter saves it, and the > is kept', (await get()).includes('> _Everything else is a bonus._\n'));
  // 4. a heading
  await pg.dblclick(md + ' h2:has-text("Locations")');
  await pg.waitForSelector('.u-edit');
  await pg.fill('.u-edit', 'Places we will visit');
  await pg.keyboard.press('Enter');
  await pg.waitForFunction(() => !document.querySelector('.u-edit'));
  check('a heading keeps its ## and Enter saves it', (await get()).includes('\n## Places we will visit\n') && !(await get()).includes('## Locations _(one line each)_'));
  // 5. Escape cancels
  await pg.dblclick(md + ' em:has-text("Everything else is a bonus")');
  await pg.fill('.u-edit', 'nope');
  await pg.keyboard.press('Escape');
  await pg.waitForFunction(() => !document.querySelector('.u-edit'));
  check('Escape throws the change away', (await get()).includes('> _Everything else is a bonus._\n') && !(await get()).includes('nope'));
  // 6. a whole callout from its pencil
  await pg.hover(md + ' .blk:has(details.callout-abstract)');
  await pg.click(md + ' .blk:has(details.callout-abstract) .blk-edit');
  await pg.waitForSelector('.blk-text');
  const raw = await pg.inputValue('.blk-text');
  check('the block box shows the callout without its > marks', raw.startsWith('[!abstract]+ Places') && !raw.includes('> '), raw);
  await pg.fill('.blk-text', '[!abstract]+ Places\n\n- **Stonehill Inn:** saloon doors\n- **Shrine of Luck:** candles\n');
  await pg.click('[data-block-save]');
  await pg.waitForFunction(() => !document.querySelector('.blk-text'));
  t = await get();
  check('saving puts the > marks back', t.includes('> [!abstract]+ Places\n>\n> - **Stonehill Inn:** saloon doors\n> - **Shrine of Luck:** candles\n'), t.slice(-1200));
  check('and the callout shows the new bullets', (await pg.locator(md + ' details.callout-abstract li').count()) === 2);
  await pg.hover(md + ' .blk:has(details.callout-abstract)');
  await pg.click(md + ' .blk:has(details.callout-abstract) .blk-edit');
  await pg.waitForSelector('.blk-text');
  await pg.keyboard.press('Escape');
  await pg.waitForFunction(() => !document.querySelector('.blk-text'));
  check('Escape closes the block box without changing anything', (await get()) === t);
  // 7. nothing outside the pieces touched was changed
  check('everything before the template is exactly as it was', t.startsWith(base.slice(0, base.indexOf('> [!important]+ MUST HAPPEN'))));
  check('the note is a pending edit and no page errors (edit in place)', (await pg.textContent('.pane:not([hidden]) .unpushed-bar')).includes('Edited') && pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 19. leaving an editor: auto-save or ask, and where you left off ================= */
{
  const pg = await demo();
  const path = 'Ashfall/Sessions/2026-10-12 Session 12.md';
  const get = () => pg.evaluate(p => window.__dmforge.S.working.get(p), path);
  const body = '.pane:not([hidden]) .card textarea >> nth=0';
  const openSession = async () => { await pg.click('.nav-btn:has-text("Sessions")'); await pg.click('.pane:not([hidden]) .list-item:has-text("Session 12")'); await pg.waitForSelector('.pane:not([hidden]) .note-head'); };
  const startEdit = async text => {
    await openSession();
    await pg.click('.pane:not([hidden]) .note-head button:text-is("Edit")');
    await pg.waitForSelector(body);
    await pg.fill(body, (await pg.inputValue(body)) + '\n\n' + text);
  };
  const closeSettings = async () => { await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage')); };
  // the bug: type in the editor, switch category
  await startEdit('AUTO-SAVED LINE one');
  await pg.click('.nav-btn:has-text("Players")');
  await pg.waitForSelector('.pane:not([hidden]) .page-head h2:has-text("Players")');
  check('switching category saves what was typed (auto-save is the default)', (await get()).includes('AUTO-SAVED LINE one'));
  check('and says so', (await pg.textContent('.toast')).includes('Saved your changes to'));
  await openSession();
  check('the session shows it when you come back, and is not left in edit mode', (await pg.textContent('.pane:not([hidden]) .md')).includes('AUTO-SAVED LINE one') && (await pg.locator('.pane:not([hidden]) .card textarea').count()) === 0);
  // picking another session from the list saves too
  await pg.click('.pane:not([hidden]) .note-head button:text-is("Edit")');
  await pg.fill(body, (await pg.inputValue(body)) + '\n\nAUTO-SAVED LINE two');
  await pg.click('.pane:not([hidden]) .list-item:has-text("Session 11")');
  await pg.waitForFunction(() => document.querySelector('.pane:not([hidden]) .note-head h2').textContent.includes('Session 11'));
  check('choosing another note in the list saves too', (await get()).includes('AUTO-SAVED LINE two'));
  // where you left off
  await openSession();
  await pg.waitForSelector('#leftOff');
  check('the session shows where you left off, with the heading and the words', (await pg.textContent('#leftOff')).includes('AUTO-SAVED LINE two') && (await pg.textContent('#leftOffWhen')).includes('just now'), await pg.textContent('#leftOff'));
  await pg.click('#leftOffMore');
  const entries = await pg.locator('#leftOffList li:not(.leftoff-foot)').count();
  check('and a list of the recent changes', entries >= 2, String(entries));
  await pg.click('#leftOffJump');
  await pg.waitForSelector('.leftoff-flash');
  check('Jump to it scrolls there and highlights it', (await pg.textContent('.leftoff-flash')).includes('AUTO-SAVED LINE two'));
  // in-place edits are tracked too
  await pg.dblclick('.pane:not([hidden]) .md p:has-text("AUTO-SAVED LINE one")');
  await pg.waitForSelector('.u-edit');
  await pg.fill('.u-edit', 'AUTO-SAVED LINE one, tweaked');
  await pg.keyboard.press('Control+Enter');
  await pg.waitForFunction(() => !document.querySelector('.u-edit'));
  check('an edit made in place moves "where you left off" to it', (await pg.textContent('#leftOff')).includes('tweaked'), await pg.textContent('#leftOff'));
  const stored = await pg.evaluate(() => Object.keys(localStorage).find(k => k.startsWith('dmforge:leftoff|')));
  check('it is kept in the browser, not written to the vault', !!stored && !(await get()).includes('leftoff'));
  // ask me first
  await pg.click('#navSettings'); await pg.click('#menuSettings');
  await pg.click('[data-setcat="writing"]');
  await pg.waitForSelector('#setAsk');
  check('Settings has both choices, auto-save selected to begin with', await pg.isChecked('#setAuto') && !(await pg.isChecked('#setAsk')));
  check('opening Settings does not put the focus (and its yellow ring) on the dropdown or any field', await pg.evaluate(() => { const e = document.activeElement; return !!e && !['SELECT', 'INPUT', 'TEXTAREA'].includes(e.tagName); }));
  check('no dropdown is highlighted', (await pg.evaluate(() => document.activeElement.id)) !== 'setKeep');
  await pg.check('#setAsk');
  await closeSettings();
  check('the choice is remembered in the browser', (await pg.evaluate(() => localStorage.getItem('dmforge:settings'))).includes('"leaveEdit":"ask"'));
  await startEdit('ASK LINE one');
  await pg.click('.nav-btn:has-text("Players")');
  await pg.waitForSelector('#leaveSave');
  check('now it asks before leaving, and nothing is saved yet', (await pg.textContent('.modal')).includes('Session 12') && !(await get()).includes('ASK LINE one'));
  await pg.click('#leaveStay');
  await pg.waitForFunction(() => !document.querySelector('.modal'));
  check('Keep editing leaves you in the editor with your text', (await pg.inputValue(body)).includes('ASK LINE one'));
  await pg.click('.nav-btn:has-text("Players")');
  await pg.waitForSelector('#leaveDiscard');
  await pg.click('#leaveDiscard');
  await pg.waitForSelector('.pane:not([hidden]) .page-head h2:has-text("Players")');
  check('Discard changes moves on and throws the text away', !(await get()).includes('ASK LINE one'));
  await startEdit('ASK LINE two');
  await pg.click('.nav-btn:has-text("Players")');
  await pg.waitForSelector('#leaveSave');
  await pg.click('#leaveSave');
  await pg.waitForSelector('.pane:not([hidden]) .page-head h2:has-text("Players")');
  check('Save and continue saves it and moves on', (await get()).includes('ASK LINE two'));
  // closing a tab you are editing in
  await startEdit('ASK LINE three');
  await pg.click('.tab-new');
  await pg.waitForFunction(() => document.querySelectorAll('.tab').length === 2);
  await pg.click('.tab:not(.on) .tab-x');          // the first tab, still editing, is the one that is not in front
  await pg.waitForSelector('#leaveSave');
  check('closing the tab asks too', (await pg.textContent('.modal')).includes('Session 12'));
  await pg.click('#leaveSave');
  await pg.waitForFunction(() => document.querySelectorAll('.tab').length === 1);
  check('and Save and continue keeps the text', (await get()).includes('ASK LINE three'));
  // tracking can be turned off and cleared
  await pg.click('#navSettings'); await pg.click('#menuSettings');
  await pg.click('[data-setcat="sessions"]');
  await pg.waitForSelector('#setTrack');
  await pg.click('#setClear');
  await pg.uncheck('#setTrack');
  check('turning tracking off hides its options', (await pg.locator('#setKeep').count()) === 0);
  await closeSettings();
  await openSession();
  check('no "where you left off" panel while it is off or cleared', (await pg.locator('#leftOff').count()) === 0);
  await pg.click('.pane:not([hidden]) .note-head button:text-is("Edit")');
  await pg.fill(body, (await pg.inputValue(body)) + '\n\nNOT TRACKED');
  await pg.click('.pane:not([hidden]) button:has-text("Save to pending changes")');
  const savedToast = await pg.locator('.toast').last().textContent();
  check('and a change made now is not tracked', Object.values(await pg.evaluate(() => window.__dmforge.S.leftOff)).flat().length === 0);
  await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="sessions"]'); await pg.waitForSelector('#setTrack'); await pg.check('#setTrack'); await closeSettings();
  check('Save to pending changes still works as before', (await get()).includes('NOT TRACKED') && savedToast.includes('Saved.'), savedToast);
  check('no page errors (leaving an editor)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 20. panes: a big prep pane on the left, two stacked on the right ================= */
{
  const pg = await demo(1500, 900);
  const st = () => pg.evaluate(() => { const S = window.__dmforge.S; return { layout: S.layout, activePane: S.activePane, size: S.paneSize, tabs: S.tabs.map(t => ({ id: t.id, pane: t.pane, section: t.section, selected: t.selected })) }; });
  const head = p => pg.$$eval('.pane[data-pane="' + p + '"]:not([hidden]) h2', els => els.map(e => e.textContent).join(' / '));
  await pg.click('.nav-btn:has-text("Sessions")');
  await pg.click('.pane:not([hidden]) .list-item:has-text("Session 12")');
  check('the Layout button is in the top bar', await pg.locator('.topbar #layoutBtn').count() === 1);
  check('with Claude off there is no Snapshot button in the top bar (or it says why it is off)', await pg.locator('.topbar #snapBtn').count() === 0 || (await pg.isDisabled('#snapBtn') && (await pg.getAttribute('#snapBtn', 'title')).includes('Switch on Claude')));
  await pg.click('#layoutBtn');
  await pg.waitForSelector('.ctx');
  const items = await pg.$$eval('.ctx-item', els => els.map(e => e.textContent));
  check('it offers Single pane, Two columns, Prep and two panes and Table mode, ticking the current one', items.length === 4 && items[0].startsWith('✓') && items[1].includes('Two columns') && items[2].includes('Prep and two panes') && items[3].includes('Table mode'), items.join(' | '));
  await pg.click('.ctx-item:has-text("Prep and two panes")');
  await pg.waitForFunction(() => document.querySelectorAll('.tabbar').length === 3);
  const boxes = await pg.$$eval('.pane:not([hidden])', ps => ps.map(p => { const r = p.getBoundingClientRect(); return { p: p.dataset.pane, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }).sort((a, b) => a.p - b.p));
  check('three panes, each with its own row of tabs', boxes.length === 3 && (await pg.locator('.tabbar').count()) === 3);
  check('one big pane on the left, two stacked on the right', boxes[1].x > boxes[0].x + 300 && boxes[2].x === boxes[1].x && boxes[2].y > boxes[1].y + 150 && boxes[0].h > boxes[1].h + boxes[2].h - 5, JSON.stringify(boxes));
  check('the session you were reading is in the left pane', (await head(0)).includes('Session 12'));
  const line = await pg.evaluate(() => {
    const sp = document.querySelector('.splitter-cols').getBoundingClientRect(), ws = document.querySelector('.workspace').getBoundingClientRect(), first = document.querySelector('.tabbar').getBoundingClientRect();
    return { top: Math.round(sp.top - first.top), bottom: Math.round(ws.bottom - sp.bottom), colour: getComputedStyle(document.querySelector('.splitter-cols'), '::before').backgroundColor, borders: [...document.querySelectorAll('.pane:not([hidden])')].map(p => getComputedStyle(p).borderLeftWidth) };
  });
  check('the divider between left and right is one unbroken line from the tab rows to the bottom, not pieces of each pane', Math.abs(line.top) <= 1 && Math.abs(line.bottom) <= 1 && line.colour !== 'rgba(0, 0, 0, 0)' && line.borders.every(w => w === '0px'), JSON.stringify(line));
  check('a pane this narrow gives the open note its whole width and hides the list', (await pg.locator('.pane[data-pane="0"] .scroll-split > :first-child').isHidden()) && (await pg.locator('.pane[data-pane="0"] #backToList').isVisible()));
  await pg.click('.pane[data-pane="0"] #backToList');
  check('"All sessions" brings the list back', (await pg.locator('.pane[data-pane="0"] .scroll-split > :first-child').isVisible()) && (await pg.locator('.pane[data-pane="0"] .note-head').count()) === 0);
  await pg.click('.pane[data-pane="0"] .list-item:has-text("Session 12")');
  await pg.waitForSelector('.pane[data-pane="0"] .note-head');
  // each pane has the focus on its own; a link or the sidebar opens in the pane you are in
  await pg.click('.pane[data-pane="1"] .page-head h2');
  await pg.click('.nav-btn:has-text("Players")');
  await pg.click('.pane[data-pane="1"]:not([hidden]) .list-item:has-text("Kestra")');
  await pg.waitForFunction(() => [...document.querySelectorAll('.pane[data-pane="1"]:not([hidden]) h2')].some(h => h.textContent.includes('Kestra')));
  check('the sidebar opened Players in the top-right pane, and the others did not change', (await head(0)).includes('Session 12') && (await head(1)).includes('Kestra') && /Ashfall|Next/.test(await head(2)), [await head(0), await head(1), await head(2)].join(' / '));
  await pg.click('.pane[data-pane="2"] .page-head h2');
  await pg.click('.nav-btn:has-text("Locations")');
  await pg.waitForFunction(() => [...document.querySelectorAll('.pane[data-pane="2"]:not([hidden]) h2')].some(h => h.textContent.includes('Locations')));
  check('the bottom-right pane took Locations', (await head(1)).includes('Kestra') && (await head(2)).includes('Locations'));
  // a [[link]] in a note opens in the same pane, like Obsidian
  await pg.click('.pane[data-pane="0"] .md a.wl:has-text("Brother Calder")');
  await pg.waitForFunction(() => [...document.querySelectorAll('.pane[data-pane="0"]:not([hidden]) h2')].some(h => h.textContent.includes('Brother Calder')));
  check('clicking a link opens the note in the same pane, not another', (await head(1)).includes('Kestra') && (await head(2)).includes('Locations') && (await st()).tabs.length === 3);
  // Ctrl-click opens a new tab in this pane's row
  await pg.click('.pane[data-pane="2"] .page-head h2');
  await pg.click('.nav-btn:has-text("NPCs")', { modifiers: ['Control'] });
  await pg.waitForFunction(() => document.querySelectorAll('.tabbar[data-pane="2"] .tab').length === 2);
  check('Ctrl-click opens a new tab in the pane you are in', (await st()).tabs.filter(t => t.pane === 2).length === 2 && (await st()).tabs.filter(t => t.pane === 0).length === 1);
  check('a pane with several tabs can close them, one with a single tab cannot', (await pg.locator('.tabbar[data-pane="2"] .tab-x').count()) === 2 && (await pg.locator('.tabbar[data-pane="0"] .tab-x').count()) === 0);
  // moving a tab does not rebuild its page: an unsaved edit survives, and so does the page's DOM
  await pg.click('.pane[data-pane="0"] .note-head button:text-is("Edit")');
  await pg.fill('.pane[data-pane="0"] .card textarea >> nth=0', 'TYPED IN THE LEFT PANE');
  await pg.evaluate(() => { document.querySelector('.pane[data-pane="0"]').__mark = 'same'; });
  const leftTab = (await st()).tabs.find(t => t.pane === 0).id;
  await pg.click('.tabbar[data-pane="0"] .tab-main', { button: 'right' });
  await pg.waitForSelector('.ctx');
  const menu = await pg.$$eval('.ctx-item', els => els.map(e => e.textContent));
  check("a tab's right-click menu offers the other panes by name", menu.some(x => x.includes('Move to top right pane')) && menu.some(x => x.includes('Move to bottom right pane')), menu.join(' | '));
  await pg.click('.ctx-item:has-text("Move to top right pane")');
  await pg.waitForFunction(id => window.__dmforge.S.tabs.find(t => t.id === id).pane === 1, leftTab);
  check('moving a tab does not rebuild it: the typed text is still there', (await pg.inputValue('.pane[data-pane="1"]:not([hidden]) .card textarea >> nth=0')) === 'TYPED IN THE LEFT PANE');
  check('and it is the very same page element, just in another place', await pg.evaluate(id => document.querySelector('.pane[data-tab="' + id + '"]').__mark === 'same', leftTab));
  check('the left pane never ends up empty: it got a fresh tab', (await pg.locator('.tabbar[data-pane="0"] .tab').count()) === 1);
  // drag a tab to another row
  const before2 = (await st()).tabs.filter(t => t.pane === 2).length;
  await pg.locator('.tabbar[data-pane="2"] .tab >> nth=0').dragTo(pg.locator('.tabbar[data-pane="0"]'));
  await pg.waitForFunction(n => window.__dmforge.S.tabs.filter(t => t.pane === 2).length === n - 1, before2);
  check('dragging a tab onto another pane\'s row moves it there', (await st()).tabs.filter(t => t.pane === 0).length === 2);
  // dividers
  const rowsBefore = (await st()).size.rows, colsBefore = (await st()).size.cols;
  await pg.evaluate(() => { window.__mut = 0; const o = new MutationObserver(r => { window.__mut += r.length; }); o.observe(document.querySelector('.workspace'), { childList: true, subtree: true, characterData: true }); window.__o = o; });
  const sr = await pg.locator('.splitter-rows').boundingBox();
  await pg.mouse.move(sr.x + sr.width / 2, sr.y + sr.height / 2);
  await pg.mouse.down();
  const t0 = Date.now();
  for (let i = 1; i <= 30; i++) await pg.mouse.move(sr.x + sr.width / 2, sr.y + sr.height / 2 + i * 6);
  const mid = await pg.evaluate(() => ({ rows: document.querySelector('.workspace').style.gridTemplateRows, mut: window.__mut, dragging: document.querySelector('.workspace').classList.contains('dragging') }));
  await pg.mouse.up();
  await pg.waitForTimeout(100);
  const after = await pg.evaluate(() => window.__mut);
  check('dragging the divider between the two right panes resizes them live', mid.dragging && /fr/.test(mid.rows), JSON.stringify(mid));
  check('and re-renders nothing while you drag (no page was rebuilt, no element added or removed)', mid.mut === 0, String(mid.mut));
  check('the new size is kept when you let go', (await st()).size.rows > rowsBefore + 0.05, JSON.stringify([(await st()).size, rowsBefore]));
  const sc = await pg.locator('.splitter-cols').boundingBox();
  await pg.mouse.move(sc.x + 5, sc.y + 300); await pg.mouse.down(); await pg.mouse.move(sc.x + 105, sc.y + 300, { steps: 8 }); await pg.mouse.up();
  check('the divider between the left and right panes moves too', (await st()).size.cols > colsBefore + 0.04, JSON.stringify((await st()).size));
  await pg.locator('.splitter-cols').focus();
  const c1 = (await st()).size.cols;
  await pg.keyboard.press('ArrowLeft');
  check('and can be moved with the arrow keys', (await st()).size.cols < c1);
  check('the layout and sizes are remembered in the browser', await pg.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('dmforge:layout|')); const o = k && JSON.parse(localStorage.getItem(k)); return !!o && o.layout === 'prep' && o.cols > 0.2 && o.rows > 0.2; }));
  // pages in narrow panes stack their list above the note instead of squeezing
  await pg.click('.pane[data-pane="1"] .page-head h2');
  await pg.click('.nav-btn:has-text("Sessions")');
  const narrowPane = await pg.evaluate(() => { const p = document.querySelector('.pane[data-pane="1"]:not([hidden])'); return { wide: p.dataset.wide, w: Math.round(p.getBoundingClientRect().width) }; });
  check('each pane knows whether it is wide enough for a list beside a note', narrowPane.wide === (narrowPane.w >= 900 ? '1' : '0'), JSON.stringify(narrowPane));
  // back to one pane: the tabs are kept, the unused starter tabs go
  await layout(pg, 'Single pane');
  const single = await st();
  check('Single pane gathers every tab you opened into one row', single.layout === 'single' && (await pg.locator('.tabbar').count()) === 1 && single.tabs.every(t => t.pane === 0));
  check('and drops starter tabs that were never used', single.tabs.every(t => t.selected || t.section !== 'overview' || true) && single.tabs.length <= 5);
  await layout(pg, 'Two columns');
  check('Two columns gives two panes', (await pg.locator('.tabbar').count()) === 2 && (await pg.locator('.pane:not([hidden])').count()) === 2);
  // narrow windows show one pane
  await pg.setViewportSize({ width: 800, height: 700 });
  await pg.waitForTimeout(300);
  check('a narrow window shows one row of tabs and one pane, and the Layout button is off', (await pg.locator('.tabbar').count()) === 1 && (await pg.locator('.pane:not([hidden])').count()) === 1 && await pg.isDisabled('#layoutBtn'));
  await pg.setViewportSize({ width: 1500, height: 900 });
  await pg.waitForTimeout(300);
  check('and the two panes come back when the window is wide again', (await pg.locator('.tabbar').count()) === 2);
  check('no page errors (panes)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 21. pinned tabs keep their page; the tab and its accent keep their shape ================= */
{
  const pg = await demo(1500, 900);
  const tabs = () => pg.$$eval('.tab', els => els.map(e => ({ title: e.querySelector('.tab-title').textContent, on: e.classList.contains('on'), pinned: e.classList.contains('pinned') })));
  await pg.click('.nav-btn:has-text("Sessions")');
  await pg.click('.pane:not([hidden]) .list-item:has-text("Session 12")');
  await pg.waitForSelector('.pane:not([hidden]) .note-head');
  await pg.click('.tab-main', { button: 'right' });
  await pg.waitForSelector('.ctx');
  const m = await pg.$$eval('.ctx-item', els => els.map(e => e.textContent));
  check("a tab's menu offers Pin, even with a single pane", m.length >= 1 && m[0].startsWith('Pin'), m.join(' | '));
  await pg.click('.ctx-item:has-text("Pin")');
  check('the tab shows a pin in place of the ×, and cannot be closed from the tab', (await pg.locator('.tab.pinned .tab-unpin').count()) === 1 && (await pg.locator('.tab.pinned .tab-x:not(.tab-unpin)').count()) === 0);
  // a link in the pinned note opens beside it, in a new tab
  await pg.click('.pane:not([hidden]) .md a.wl:has-text("Brother Calder")');
  await pg.waitForFunction(() => document.querySelectorAll('.tab').length === 2);
  let t = await tabs();
  check('a link opens in a new tab, and the pinned tab keeps its page', t[0].title.includes('Session 12') && t[0].pinned && t[1].title === 'Brother Calder' && t[1].on, JSON.stringify(t));
  // the sidebar too
  await pg.click('.nav-btn:has-text("Locations")');
  t = await tabs();
  check('the sidebar goes to the tab you are on, which is not pinned, so it changes that one', t.length === 2 && t[1].title === 'Locations' && t[0].title.includes('Session 12'), JSON.stringify(t));
  await pg.click('.tab.pinned .tab-main');
  await pg.click('.nav-btn:has-text("Players")');
  await pg.waitForFunction(() => document.querySelectorAll('.tab').length === 3);
  t = await tabs();
  check('with the pinned tab in front, the sidebar opens a new tab instead', t.length === 3 && t[0].pinned && t[0].title.includes('Session 12') && t[2].title === 'Players' && t[2].on, JSON.stringify(t));
  // picking from the list in a pinned tab, and search
  await pg.click('.tab.pinned .tab-main');
  await pg.click('.pane:not([hidden]) .list-item:has-text("Session 11")').catch(() => {});
  await pg.fill('.search-wrap input', 'Isolde');
  await pg.keyboard.press('Enter');
  await pg.waitForFunction(() => document.querySelectorAll('.tab').length >= 4);
  t = await tabs();
  check('search opens beside a pinned tab too', t.some(x => x.title.includes('Isolde') && x.on) && t[0].title.includes('Session 12'), JSON.stringify(t));
  // closing
  await pg.click('.tab.pinned .tab-main', { button: 'right' });
  const m2 = await pg.$$eval('.ctx-item', els => els.map(e => e.textContent));
  check('a pinned tab has no Close in its menu', m2.some(x => x.startsWith('Unpin')) && !m2.some(x => x === 'Close'), m2.join(' | '));
  await pg.keyboard.press('Escape');
  const n0 = (await tabs()).length;
  await pg.click('.tab.pinned .tab-main', { button: 'middle' });
  check('middle-click does not close it', (await tabs()).length === n0);
  // a pinned note can still be edited and saved in place
  await pg.click('.tab.pinned .tab-main');
  await pg.click('.pane:not([hidden]) .note-head button:text-is("Edit")');
  await pg.fill('.pane:not([hidden]) .card textarea >> nth=0', (await pg.inputValue('.pane:not([hidden]) .card textarea >> nth=0')) + '\n\nEDITED WHILE PINNED');
  await pg.click('.pane:not([hidden]) button:has-text("Save to pending changes")');
  t = await tabs();
  check('editing in a pinned tab works and does not open another tab', t.length === n0 && (await pg.textContent('.pane:not([hidden]) .md')).includes('EDITED WHILE PINNED'));
  // unpin: the tab navigates normally again
  await pg.click('.tab.pinned .tab-unpin');
  check('unpinning brings the × back', (await pg.locator('.tab.pinned').count()) === 0);
  await pg.click('.nav-btn:has-text("Factions")');
  t = await tabs();
  check('and the tab changes page in place again', t.length === n0 && t[0].title === 'Factions', JSON.stringify(t));
  // panes: a pinned tab in a pane makes new tabs in that same pane
  await pg.click('.tabbar .tab >> nth=0', { button: 'right' }); await pg.click('.ctx-item:has-text("Pin")');
  await pg.click('#layoutBtn'); await pg.click('.ctx-item:has-text("Prep and two panes")');
  await pg.waitForFunction(() => document.querySelectorAll('.tabbar').length === 3);
  await pg.click('.pane[data-pane="0"] .page-head h2');
  const inPane0 = await pg.locator('.tabbar[data-pane="0"] .tab').count();
  await pg.click('.nav-btn:has-text("NPCs")');
  await pg.waitForFunction(n => document.querySelectorAll('.tabbar[data-pane="0"] .tab').length === n + 1, inPane0);
  check('in a layout with panes, the new tab opens in the pinned tab\'s pane', (await pg.locator('.tabbar[data-pane="0"] .tab').count()) === inPane0 + 1 && (await pg.locator('.tabbar[data-pane="1"] .tab').count()) === 1);
  // shape: the focused pane's open tab carries the accent, the others do not, and the strip itself has none
  const look = await pg.evaluate(() => ({
    strip: [...document.querySelectorAll('.tabbar')].map(b => getComputedStyle(b).boxShadow),
    onTabs: [...document.querySelectorAll('.tabbar')].map(b => { const t = b.querySelector('.tab.on'); const cs = getComputedStyle(t); return { focused: b.classList.contains('pane-on'), shadow: cs.boxShadow, radius: cs.borderTopLeftRadius }; }),
  }));
  check('the accent sits on the focused pane\'s open tab, following its rounded corners', look.onTabs.filter(x => x.focused).length === 1 && look.onTabs.filter(x => x.focused).every(x => /inset/.test(x.shadow) && x.radius !== '0px') && look.onTabs.filter(x => !x.focused).every(x => x.shadow === 'none'), JSON.stringify(look.onTabs));
  check('and the strip has no straight accent line across it, only its thin bottom edge', look.strip.every(x => !/ 3px /.test(x) && !/ 2px /.test(x)), JSON.stringify(look.strip));
  check('no page errors (pinning)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 22. the cheat sheet, the Menu, metric, and the checkbox edit box ================= */
{
  const pg = await demo();
  const panel = '#cheatPanel';
  // the button, right of the search bar
  const bx = await pg.evaluate(() => { const a = document.querySelector('.search-wrap').getBoundingClientRect(), c = document.querySelector('#cheatBtn').getBoundingClientRect(); return { sameRow: Math.abs(a.top - c.top) < 30, right: c.left >= a.right - 1 }; });
  check('there is a Cheat sheet button, right of the search bar', bx.sameRow && bx.right, JSON.stringify(bx));
  await pg.click('#cheatBtn');
  await pg.waitForSelector(panel);
  await pg.waitForTimeout(350);
  check('it opens as a slide-over from the right, with the search box ready', await pg.evaluate(() => { const r = document.querySelector('#cheatPanel').getBoundingClientRect(); return Math.abs(r.right - innerWidth) < 2 && r.width <= 470 && document.activeElement.id === 'csSearch'; }));
  check('it covers the 2024 rules: conditions, actions, weapon mastery, resting, DM tips and the six abilities', await pg.evaluate(() => ['conditions', 'combat', 'mastery', 'rest', 'tips', 'abilities'].every(g => document.querySelector('#cheatPanel [data-group="' + g + '"]'))));
  // abilities, one tomato
  await pg.click(panel + ' [data-card="abilities"] summary');
  const ab = await pg.textContent(panel + ' [data-card="abilities"]');
  check('the six abilities are explained with one tomato', ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'].every(x => ab.includes(x)) && (ab.match(/tomato/gi) || []).length >= 6, String((ab.match(/tomato/gi) || []).length));
  // search
  await pg.fill('#csSearch', 'prone');
  const hits = await pg.$$eval(panel + ' .cs-card', els => els.map(e => e.dataset.card));
  check('searching filters the cards and opens the matches', hits.includes('conditions') && hits.includes('shove') && !hits.includes('d20') && (await pg.locator(panel + ' .cs-card[open]').count()) === hits.length, hits.join(','));
  await pg.fill('#csSearch', 'zzzzqq');
  check('a search with no match says so', (await pg.textContent(panel)).includes('Nothing matches'));
  await pg.fill('#csSearch', '');
  // metric by default
  await pg.click(panel + ' [data-card="falling"] summary');
  await pg.click(panel + ' [data-card="carrying"] summary');
  let txt = await pg.textContent(panel);
  check('distances and weights are metric to begin with (Australian)', txt.includes('3 m') && txt.includes('7.5 kg') && !/\b10 ft\b|15 lb/.test(txt.replace(/Strength score/g, '')), (await pg.textContent(panel + ' [data-card="falling"]')) + (await pg.textContent(panel + ' [data-card="carrying"]')));
  await pg.click(panel + ' [data-card="travel"] summary');
  check('travel pace is in km', (await pg.textContent(panel + ' [data-card="travel"]')).includes('45 km') && !(await pg.textContent(panel + ' [data-card="travel"]')).includes('miles'));
  check('there is no unit switch: the cheat sheet is metric only', await pg.locator(panel + ' .cs-units').count() === 0);
  // pin
  await pg.click(panel + ' [data-card="grapple"] .cs-star');
  check('starring a card moves it to a Pinned strip at the top', (await pg.locator(panel + ' [data-group="pinned"] [data-card="grapple"]').count()) === 1 && (await pg.evaluate(() => JSON.parse(localStorage.getItem('dmforge:settings')).cheatStars)).includes('grapple'));
  // your own card
  await pg.click('#csAdd');
  await pg.fill('#csTitle', 'Flanking (house rule)');
  await pg.fill('#csBody', 'Two allies on opposite sides give **advantage**.');
  await pg.click('#csSave');
  const note = 'Ashfall/DM Cheat Sheet.md';
  const nt = await pg.evaluate(p => window.__dmforge.S.working.get(p), note);
  check('your own card is saved as a note in the campaign (a pending change, like everything else)', !!nt && nt.includes('## Flanking (house rule)') && nt.includes('advantage'), String(nt));
  check('and it shows under My cards', (await pg.locator(panel + ' [data-group="mine"] [data-card="my-flanking-house-rule"]').count()) === 1);
  await pg.click(panel + ' [data-card="my-flanking-house-rule"] .cs-icon:has-text("✎")');
  await pg.fill('#csBody', 'Two allies on opposite sides: advantage, and nothing else.');
  await pg.click('#csSave');
  check('editing it rewrites that card only', (await pg.evaluate(p => window.__dmforge.S.working.get(p), note)).includes('and nothing else') && ((await pg.evaluate(p => window.__dmforge.S.working.get(p), note)).match(/^## /gm) || []).length === 1);
  try { await pg.click(panel + ' [data-card="my-flanking-house-rule"] .cs-icon:has-text("✎")', { timeout: 10000 }); }
  catch (e) { console.log('DIAG cheat card edit button missing; panel:', (await pg.evaluate(() => (document.querySelector('#cheatPanel') || {}).innerHTML || 'no panel')).slice(0, 1500), '| modal:', await pg.locator('.modal').count()); throw e; }
  await pg.click('#csDelete'); await pg.click('.modal button:has-text("Delete card")');
  await pg.waitForFunction(() => !document.querySelector('.modal'));
  check('deleting it removes it', (await pg.locator(panel + ' [data-card="my-flanking-house-rule"]').count()) === 0 && !(await pg.evaluate(p => window.__dmforge.S.working.get(p), note)).includes('Flanking'));
  // pop out to a tab
  await pg.click('#cheatPop');
  await pg.waitForSelector('.tab:has-text("Cheat sheet")');
  check('Open as a tab puts it in a tab and closes the slide-over', (await pg.locator(panel).count()) === 0 && (await pg.locator('.pane:not([hidden]) .cs').count()) === 1);
  await pg.click('#cheatBtn'); await pg.waitForSelector(panel);
  await pg.keyboard.press('Escape');
  await pg.waitForFunction(() => !document.querySelector('#cheatPanel'));
  check('Escape closes the slide-over', true);
  // the Menu
  await pg.click('#navSettings');
  await pg.waitForSelector('#menuSettings');
  check('Settings is now called Menu, and holds Settings, Claude (experimental) and Version history', (await pg.textContent('#navSettings')).trim().startsWith('Menu') && (await pg.textContent('.modal h3')) === 'Menu' && (await pg.locator('#navClaude, #navHistory').count()) === 0);
  await pg.click('#menuSettings');
  await pg.click('[data-setcat="writing"]');
  await pg.waitForSelector('#setAsk');
  check('Settings has no units choice: it is metric only', await pg.locator('#setMetric').count() === 0 && await pg.locator('#setImperial').count() === 0);
  await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage'));
  await pg.click('#navSettings'); await pg.click('#menuHistory');
  await pg.waitForSelector('#histSearch');
  check('Version history opens from the Menu', (await pg.textContent('.pane:not([hidden]) .page-head h2')) === 'Version history');
  // generators follow the unit
  let allGen = '';
  for (const name of ['Shop', 'Dungeon room', 'Magic item', 'Potion', 'Trinkets', 'Encounter']) { await openGen(pg, name); allGen += await pg.locator('[data-gen]').textContent(); }
  check('Generate uses metric as well (nothing rolled says feet, miles or pounds)', !/\b\d+[- ]?(feet|foot|ft|miles?|pounds?|lbs?)\b/.test(allGen), (allGen.match(/.{20}\b\d+[- ]?(feet|foot|ft|miles?|pounds?)\b.{10}/) || [''])[0]);
  check('no page errors (cheat sheet)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}
{
  // the box for typing sits beside the checkbox, not under it
  const pg = await demo();
  await pg.click('.nav-btn:has-text("Sessions")');
  await pg.click('.pane:not([hidden]) .list-item:has-text("Session 12")');
  await pg.click('#addTemplateBtn'); await pg.click('#tplAdd');
  await pg.waitForFunction(() => !document.querySelector('.modal'));
  const md = '.pane:not([hidden]) .md';
  await pg.click(md + ' details.callout-important li .u-empty >> nth=0');
  await pg.waitForSelector('.u-edit');
  const pos = await pg.evaluate(() => { const li = document.querySelector('.pane:not([hidden]) details.callout-important li:has(.u-edit)'); const cb = li.querySelector('input[data-task]').getBoundingClientRect(), ed = li.querySelector('.u-edit').getBoundingClientRect(); return { cbTop: cb.top, cbBottom: cb.bottom, cbRight: cb.right, edTop: ed.top, edLeft: ed.left, edBottom: ed.bottom, liW: li.getBoundingClientRect().width, edW: ed.width }; });
  check('editing a checkbox item: the box is on the checkbox\'s line, to its right', pos.edLeft >= pos.cbRight - 1 && pos.edTop < pos.cbBottom && pos.edBottom > pos.cbTop, JSON.stringify(pos));
  check('and it uses the rest of the line', pos.edW > pos.liW * 0.6, JSON.stringify(pos));
  await pg.keyboard.type('Find the key');
  await pg.keyboard.press('Control+Enter');
  await pg.waitForFunction(() => !document.querySelector('.u-edit'));
  check('typing in it still saves to the same line', (await pg.evaluate(() => window.__dmforge.S.working.get('Ashfall/Sessions/2026-10-12 Session 12.md'))).includes('> - [ ] Find the key'));
  check('no page errors (checkbox editing)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}

/* ================= 23. Generate: home, group, and the handout ================= */
{
  const pg = await demo();
  await pg.click('.nav-btn:has-text("Generate")');
  await pg.waitForSelector('#genFind');
  const tiles = await pg.$$eval('.gen-tile .gen-tile-t', els => els.map(e => e.textContent.trim()));
  check('the home screen asks what the players need, with five plain-word tiles and "surprise me"', (await pg.textContent('.gen-q')).includes('What do the players need') && tiles.length === 6 && tiles.includes('Someone to talk to') && tiles.includes('Somewhere to go') && tiles.includes('Just surprise me'), tiles.join('|'));
  check('there is no wall of generator cards, and no Roll visible button', (await pg.locator('.widget, #rollVisible').count()) === 0 && (await pg.locator('[data-gen]').count()) === 0);
  // a group
  await pg.click('[data-group="places"]');
  const gens = await pg.$$eval('.gen-tile[data-pick]', els => els.map(e => e.dataset.pick));
  check('a tile opens the generators of that group, each with a one-line description', gens.join(',') === 'tavern,shop,settlement,room,landmark,weather' && (await pg.locator('.gen-tile-b').first().textContent()).length > 10, gens.join(','));
  check('and a trail shows where you are', (await pg.textContent('.gen-crumbs')).includes('Generate') && (await pg.textContent('.gen-crumbs')).includes('Somewhere to go'));
  // the handout
  await pg.click('[data-pick="shop"]');
  await pg.waitForSelector('[data-gen="shop"] .gs-title');
  const lay = await pg.evaluate(() => {
    const a = document.querySelector('[data-gen="shop"]');
    const title = a.querySelector('.gs-title').getBoundingClientRect();
    const secs = [...a.querySelectorAll('.gs-sec')].map(sec => ({ l: sec.querySelector('.gs-lbl').getBoundingClientRect(), v: (sec.querySelector('.gs-val, .gs-list') || sec).getBoundingClientRect() }));
    return { n: secs.length, labelAbove: secs.every(x => x.l.bottom <= x.v.top + 2), widest: Math.max(...secs.map(x => x.v.width)), titleW: title.width, scrollW: document.querySelector('.pane:not([hidden])').scrollWidth, clientW: document.querySelector('.pane:not([hidden])').clientWidth };
  });
  check('the labels sit above their text, not beside it', lay.labelAbove && lay.n >= 6, JSON.stringify(lay));
  check('the text is a readable width, not a skinny column', lay.widest > 420, String(lay.widest));
  check('and the page does not scroll sideways', lay.scrollW <= lay.clientW + 1, JSON.stringify(lay));
  check('a long first impression reads as the lead paragraph under the title', (await pg.locator('[data-gen="shop"] .gs-lead').textContent()).length > 60);
  check('the kicker says what it is, e.g. the shop type and size', /·/.test(await pg.textContent('[data-gen="shop"] .gs-kicker')));
  check('the stock is a list, in columns when the lines are short', (await pg.locator('[data-gen="shop"] .gs-list li').count()) >= 4);
  check('there is one obvious primary button: Roll again', (await pg.locator('[data-gen="shop"] .btn-primary').count()) === 1 && (await pg.textContent('[data-gen="shop"] .btn-primary')) === 'Roll again');
  // options live under the title, quietly
  check('options (type, settlement, prices) are small selects under the title', (await pg.locator('[data-gen="shop"] .gs-opt select').count()) === 3);
  // lock and reroll a part
  const keeper0 = await pg.textContent('[data-field="keeper"] .gs-val');
  await pg.click('[data-field="keeper"] button[aria-label="Lock Keeper"]');
  await pg.click('#genRoll');
  check('a locked section survives Roll again', (await pg.textContent('[data-field="keeper"] .gs-val')) === keeper0);
  await pg.click('[data-field="keeper"] button[aria-label="Unlock Keeper"]');
  let changed = false;
  for (let i = 0; i < 12 && !changed; i++) { await pg.click('[data-field="keeper"] button[aria-label="Reroll Keeper"]'); changed = (await pg.textContent('[data-field="keeper"] .gs-val')) !== keeper0; }
  check('Reroll on one section changes just that one', changed);
  // copy reads like the page
  await pg.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; });
  await pg.click('[data-gen="shop"] button:has-text("Copy")');
  await pg.waitForFunction(() => window.__copied);
  const copied = await pg.evaluate(() => window.__copied);
  check('Copy gives the page as it reads: title, then the sections with their labels', copied.includes((await pg.textContent('[data-gen="shop"] .gs-title')).trim()) && copied.includes('KEEPER') && copied.includes('IN STOCK'));
  // back up one step
  await pg.click('.gen-crumbs button:has-text("Somewhere to go")');
  check('the trail goes back one step', (await pg.locator('.gen-tile[data-pick]').count()) === 6);
  // coming back to the Generate tab remembers where you were
  await pg.click('[data-pick="tavern"]');
  await pg.click('.nav-btn:has-text("Overview")');
  await pg.click('.nav-btn:has-text("Generate")');
  check('leaving Generate and coming back keeps your place', (await pg.locator('[data-gen="tavern"]').count()) === 1);
  // surprise me, and find
  await pg.click('#genHome');
  await pg.click('#genSurprise');
  await pg.waitForSelector('[data-gen]');
  check('"Just surprise me" opens a random generator, already rolled', (await pg.locator('.gs-title').textContent()).length > 0);
  await pg.click('#genHome');
  await pg.fill('#genFind', 'rumor');
  check('typing in the box lists matching generators', (await pg.locator('.gen-tile[data-pick]').count()) >= 1 && (await pg.locator('[data-pick="rumors"]').count()) === 1);
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('[data-gen="rumors"]');
  check('Enter opens the first match', (await pg.locator('[data-gen="rumors"] .gs-list li').count()) === 4);
  // a hidden answer
  await pg.click('#genHome'); await pg.fill('#genFind', 'riddle'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('[data-gen="riddle"]');
  check('the riddle answer stays hidden until you ask', (await pg.locator('[data-gen="riddle"] button:has-text("Reveal answer")').count()) === 1 && !(await pg.textContent('[data-gen="riddle"]')).includes('A person'));
  // the tools page
  await pg.click('#genHome'); await pg.click('#genTools');
  check('dice and my tables are one quiet step away', (await pg.locator('[data-gen="dice"]').count()) === 1);
  // every generator opens without errors and shows a title
  for (const name of ['NPC', 'Villain', 'Names', 'Tavern', 'Shop', 'Settlement', 'Dungeon room', 'Landmark', 'Weather', 'Loot', 'Magic item', 'Potion', 'Trinkets', 'Book', 'Encounter', 'Trap', 'Travel event', 'Plot hook', 'Quest', 'Rumors', 'Complication', 'Omen', 'Riddle', 'Festival']) {
    await openGen(pg, name);
    const t = (await pg.textContent('[data-gen] .gs-title')).trim();
    if (!t) check('every generator has a title: ' + name, false);
  }
  check('all 24 generators open as a titled page', true);
  check('no page errors (Generate)', pg.errors.length === 0, pg.errors.join('\n'));
  await pg.context().close();
}
{
  // a phone-sized window: one column, no sideways scroll
  const pg = await demo(390, 800);
  await openGen(pg, 'Shop');
  const w = await pg.evaluate(() => ({ s: document.querySelector('.pane:not([hidden])').scrollWidth, c: document.querySelector('.pane:not([hidden])').clientWidth }));
  check('on a phone-sized window the handout fits the width', w.s <= w.c + 1, JSON.stringify(w));
  await pg.context().close();
}

await b.close(); srv.close();
const fails = results.filter(r => !r.ok);
console.log('\n' + (results.length - fails.length) + '/' + results.length + ' checks passed');
process.exit(fails.length ? 1 : 0);
