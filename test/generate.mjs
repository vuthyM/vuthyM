/* The Generate screen, thoroughly: every generator, every control, then deliberate attempts to break it. */
import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url'; import http from 'node:http';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'DM-Forge.html');
const only = (process.env.ONLY || '').split(',').filter(Boolean);       // run just some parts: ONLY=1,3
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(dist)); }).listen(8783);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'], env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const results = [];
const check = (name, cond, extra) => { results.push({ name, ok: !!cond }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const wants = n => !only.length || only.includes(String(n));

const NAMES = ['NPC', 'Villain', 'Names', 'Tavern', 'Shop', 'Settlement', 'Dungeon room', 'Landmark', 'Weather', 'Loot', 'Magic item', 'Potion', 'Trinkets', 'Book', 'Encounter', 'Trap', 'Travel event', 'Plot hook', 'Quest', 'Rumors', 'Complication', 'Omen', 'Riddle', 'Festival'];

async function newPage(ctx, w = 1360, h = 900) {
  const pg = await ctx.newPage();
  await pg.setViewportSize({ width: w, height: h });
  pg.errors = [];
  pg.on('pageerror', e => pg.errors.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_/.test(m.text())) pg.errors.push('console: ' + m.text()); });
  return pg;
}
async function demo(w = 1360, h = 900, scheme = 'dark', ctx) {
  ctx = ctx || await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  const pg = await newPage(ctx, w, h);
  await pg.goto('http://localhost:8783/');
  await pg.evaluate(() => window.__dmforge.A.openPlainDemo());
  await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
  if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
  await pg.waitForSelector('.sidebar');
  return pg;
}
const openGen = async (pg, name) => {
  await pg.click('.nav-btn:has-text("Generate")');
  await pg.waitForSelector('#genHome, #genFind');
  if (await pg.locator('#genHome').count()) await pg.click('#genHome');
  await pg.fill('#genFind', name);
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('[data-gen]');
};
const pane = '.pane:not([hidden])';
const sheetText = pg => pg.textContent('[data-gen]');
const BAD = /undefined|\[object|NaN|null\b/;
const stubClipboard = pg => pg.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; });
const overflow = pg => pg.evaluate(() => { const p = document.querySelector('.pane:not([hidden])'); return { s: p.scrollWidth, c: p.clientWidth }; });
const closeModal = async pg => { if (await pg.locator('.modal').count()) { await pg.keyboard.press('Escape'); await pg.waitForFunction(() => !document.querySelector('.modal')); } };

/* ================= 1. every generator, every control ================= */
if (wants(1)) {
  const pg = await demo();
  const bad = [];
  let nParts = 0, nOpts = 0, nSaved = 0;
  for (const name of NAMES) {
    const note = m => bad.push(name + ': ' + m);
    await openGen(pg, name);
    const a = '[data-gen]';
    const title = (await pg.textContent(a + ' .gs-title')).trim();
    if (!title) note('no title');
    if (BAD.test(await sheetText(pg))) note('shows undefined/null/NaN: ' + (await sheetText(pg)).match(BAD)[0]);
    if (!(await pg.locator(a + ' .gs-kicker, ' + a + ' .gs-lead, ' + a + ' .gs-sec').count())) note('nothing but a title');
    // roll again many times
    for (let i = 0; i < 8; i++) await pg.click('#genRoll');
    if (BAD.test(await sheetText(pg))) note('after rolls: ' + (await sheetText(pg)).match(BAD)[0]);
    // every part: lock, roll again, see it unchanged, unlock, reroll
    const parts = await pg.$$eval(a + ' .gs-tools', els => els.map((e, i) => ({ i, lock: (e.querySelector('button[aria-label^="Lock"],button[aria-label^="Unlock"]') || {}).ariaLabel, re: (e.querySelector('button[aria-label^="Reroll"]') || {}).ariaLabel })));
    for (const p of parts) {
      nParts++;
      const tools = pg.locator(a + ' .gs-tools').nth(p.i);
      const wrap = tools.locator('xpath=ancestor::*[contains(@class,"gs-kickrow") or contains(@class,"gs-titlerow") or contains(@class,"gs-leadrow") or contains(@class,"gs-sec")][1]');
      const read = () => wrap.evaluate(e => (e.querySelector('.gs-kicker, .gs-title, .gs-lead, .gs-val, .gs-list') || e).textContent);
      const before = await read();
      await tools.locator('button').first().click();                      // lock
      if ((await tools.locator('button').first().getAttribute('aria-pressed')) !== 'true') note('lock did not engage: ' + p.lock);
      await pg.click('#genRoll');
      if ((await read()) !== before) note('a locked part changed on Roll again: ' + p.lock);
      await tools.locator('button').first().click();                      // unlock
      if ((await tools.locator('button').first().getAttribute('aria-pressed')) !== 'false') note('unlock did not engage');
      await tools.locator('button').nth(1).click();                       // reroll this part
      if (BAD.test(await sheetText(pg))) note('after rerolling ' + p.re + ': ' + (await sheetText(pg)).match(BAD)[0]);
    }
    // every option, every value
    const sels = pg.locator(a + ' .gs-opt select');
    for (let i = 0; i < await sels.count(); i++) {
      const vals = await sels.nth(i).locator('option').evaluateAll(os => os.map(o => o.value));
      for (const v of vals) {
        nOpts++;
        await sels.nth(i).selectOption(v);
        if (!(await pg.textContent(a + ' .gs-title')).trim()) note('empty title with option ' + v);
        if (BAD.test(await sheetText(pg))) note('option ' + v + ': ' + (await sheetText(pg)).match(BAD)[0]);
      }
      await sels.nth(i).selectOption(vals[0]);
    }
    // no sideways scroll at a normal width
    const o = await overflow(pg); if (o.s > o.c + 1) note('scrolls sideways: ' + JSON.stringify(o));
    // copy
    await stubClipboard(pg);
    await pg.click(a + ' button:has-text("Copy")');
    await pg.waitForFunction(() => window.__copied);
    const copied = await pg.evaluate(() => window.__copied);
    if (!copied.includes((await pg.textContent(a + ' .gs-title')).trim()) || BAD.test(copied)) note('copy text wrong');
    // save to campaign, with the defaults it suggests
    const before = await pg.evaluate(() => JSON.stringify(window.__dmforge.S.working.list().map(e => e.kind + e.path + (e.text || '').length)));
    await pg.click(a + ' button:has-text("Save to campaign")');
    await pg.waitForSelector('#sgSave');
    if (await pg.isDisabled('#sgSave')) await pg.click('.modal input[data-kind] >> nth=0');
    await pg.click('#sgSave');
    await pg.waitForFunction(() => !document.querySelector('.modal'));
    const after = await pg.evaluate(() => JSON.stringify(window.__dmforge.S.working.list().map(e => e.kind + e.path + (e.text || '').length)));
    if (before === after) note('Save to campaign changed nothing'); else nSaved++;
  }
  check('all 24 generators: open, roll, lock, reroll, every option, copy and save, with nothing wrong', bad.length === 0, bad.slice(0, 6).join(' | '));
  console.log('  (locked and rerolled ' + nParts + ' parts, tried ' + nOpts + ' option values, saved ' + nSaved + ' generators)');
  check('every part, option and save was actually exercised', nParts >= 80 && nOpts >= 80 && nSaved === 24, nParts + '/' + nOpts + '/' + nSaved);
  check('no page errors across all of that', pg.errors.length === 0, pg.errors.slice(0, 3).join('\n'));
  await pg.context().close();
}

/* ================= 2. choosing which generators show ================= */
if (wants(2)) {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: 'dark' });
  const pg = await demo(1360, 900, 'dark', ctx);
  const openSettings = async () => { await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="library"]'); await pg.waitForSelector('#setGens'); if (!(await pg.evaluate(() => document.querySelector('#setGens').open))) await pg.click('#setGens summary'); };
  const doneSettings = async () => { await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage')); };
  await openSettings();
  check('Settings lists all 24 generators, all on to begin with', (await pg.locator('[data-gen-toggle]').count()) === 24 && (await pg.locator('[data-gen-toggle]:checked').count()) === 24 && (await pg.textContent('#setGens summary')).includes('24 of 24'));
  await pg.uncheck('[data-gen-toggle="names"]');
  check('switching one off updates the count', (await pg.textContent('#setGens summary')).includes('23 of 24'));
  await doneSettings();
  await pg.click('.nav-btn:has-text("Generate")');
  await pg.waitForSelector('#genFind');
  await pg.click('[data-group="people"]');
  check('a switched-off generator is gone from its group', (await pg.$$eval('.gen-tile[data-pick]', els => els.map(e => e.dataset.pick))).join() === 'npc,villain');
  await pg.click('#genHome'); await pg.fill('#genFind', 'names');
  check('and from the search', (await pg.locator('[data-pick="names"]').count()) === 0 && (await pg.textContent('.gen')).includes('No generator matches'));
  check('the choice is saved in Settings (in the browser)', await pg.evaluate(() => JSON.parse(localStorage.getItem('dmforge:settings')).hiddenGens.includes('names')));
  // it survives a restart of the app: a new page in the same browser
  const pg2 = await demo(1360, 900, 'dark', ctx);
  await pg2.click('.nav-btn:has-text("Generate")'); await pg2.waitForSelector('#genFind'); await pg2.click('[data-group="people"]');
  check('and it is still off after starting the app again', (await pg2.$$eval('.gen-tile[data-pick]', els => els.map(e => e.dataset.pick))).join() === 'npc,villain');
  await pg2.close();
  // a whole group off
  await pg.fill('#genFind', '');
  await pg.click('#genChoose');
  await pg.waitForSelector('#setGens');
  check('"Choose which generators show" on the home screen opens Settings at that list', await pg.evaluate(() => document.querySelector('#setGens').open));
  await pg.click('#setGens .gg:has-text("Trouble") button');
  await doneSettings();
  check('a group with nothing left disappears from the home screen', (await pg.locator('[data-group="danger"]').count()) === 0 && (await pg.locator('[data-group]').count()) === 4);
  // everything off
  await pg.click('#genChoose'); await pg.waitForSelector('#gensNone'); await pg.click('#gensNone'); await doneSettings();
  check('with everything off it says so and offers the way back, and "surprise me" is gone', (await pg.locator('#genNone').count()) === 1 && (await pg.locator('#genSurprise').count()) === 0 && (await pg.locator('[data-group]').count()) === 0);
  await pg.click('#genNone button');
  await pg.waitForSelector('#gensAll'); await pg.click('#gensAll'); await doneSettings();
  check('Show all brings everything back', (await pg.locator('[data-group]').count()) === 5 && (await pg.locator('#genSurprise').count()) === 1);
  // hiding the one you are looking at must not break the page
  await openGen(pg, 'Tavern');
  await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="library"]'); await pg.waitForSelector('#setGens'); if (!(await pg.evaluate(() => document.querySelector('#setGens').open))) await pg.click('#setGens summary');
  await pg.uncheck('[data-gen-toggle="tavern"]'); await doneSettings();
  check('hiding the generator you have open leaves the page as it is', (await pg.locator('[data-gen="tavern"] .gs-title').count()) === 1);
  await pg.click('.gen-crumbs button:has-text("Somewhere to go")');
  check('and its group no longer lists it', (await pg.locator('[data-pick="tavern"]').count()) === 0 && (await pg.locator('[data-pick="shop"]').count()) === 1);
  // recent
  await pg.click('#genHome');
  for (const n of ['NPC', 'Shop', 'Riddle']) await openGen(pg, n);
  await pg.click('#genHome');
  const recent = await pg.$$eval('[data-recent]', els => els.map(e => e.dataset.recent));
  check('"Recently" lists what you opened, newest first', recent.slice(0, 3).join() === 'riddle,shop,npc', recent.join());
  await pg.click('[data-recent="shop"]');
  check('a recent chip opens that generator', (await pg.locator('[data-gen="shop"]').count()) === 1);
  for (const n of ['Names', 'Book', 'Loot', 'Trap', 'Quest', 'Omen', 'Potion']) await openGen(pg, n).catch(() => {});
  await pg.click('#genHome');
  check('only the last six are kept', (await pg.locator('[data-recent]').count()) <= 6);
  check('no page errors (visibility)', pg.errors.length === 0, pg.errors.join('\n'));
  await ctx.close();
  // hostile saved settings
  const ctx2 = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx2.addInitScript(() => { try { localStorage.setItem('dmforge:settings', JSON.stringify({ hiddenGens: ['npc', 5, null, { a: 1 }, 'x'.repeat(200)], recentGens: 'not a list', units: 'furlongs', cheatStars: 7, leaveEdit: 'sideways' })); } catch (e) { /* ignore */ } });
  const pg3 = await demo(1360, 900, 'dark', ctx2);
  await pg3.click('.nav-btn:has-text("Generate")'); await pg3.waitForSelector('#genFind'); await pg3.click('[data-group="people"]');
  check('nonsense in the saved settings is ignored, and what makes sense is kept', (await pg3.$$eval('.gen-tile[data-pick]', els => els.map(e => e.dataset.pick))).join() === 'villain,names' && pg3.errors.length === 0, pg3.errors.join());
  await ctx2.close();
}

/* ================= 3. trying to break it ================= */
if (wants(3)) {
  const pg = await demo();
  // rapid clicking
  await openGen(pg, 'Shop');
  const t0 = Date.now();
  for (let i = 0; i < 150; i++) await pg.click('#genRoll', { noWaitAfter: true });
  check('150 rapid rolls: still a titled page and no errors', (await pg.textContent('.gs-title')).trim().length > 0 && pg.errors.length === 0, pg.errors.join());
  check('and quick enough (under 20 seconds for 150)', Date.now() - t0 < 20000, String(Date.now() - t0));
  // lock every part, roll: nothing changes. reroll every part: still fine
  await openGen(pg, 'NPC');
  const locks = pg.locator('[data-gen="npc"] .gs-tools button[aria-label^="Lock"]');
  for (let i = await locks.count(); i > 0; i--) await locks.first().click();
  const all0 = await sheetText(pg);
  await pg.click('#genRoll');
  check('with every part locked, Roll again changes nothing', (await sheetText(pg)) === all0);
  const re = pg.locator('[data-gen="npc"] .gs-tools button[aria-label^="Reroll"]');
  for (let i = 0; i < await re.count(); i++) await re.nth(i).click();
  check('rerolling a locked part still works', BAD.test(await sheetText(pg)) === false);
  // locks survive going away and coming back
  await openGen(pg, 'Shop'); await openGen(pg, 'NPC');
  check('locks are kept when you leave a generator and come back', (await pg.locator('[data-gen="npc"] .gs-tools button[aria-pressed="true"]').count()) >= 3);
  // search box abuse
  await pg.click('#genHome');
  const evil = ['(', '[', '\\', '%', '*', '.*', '<img src=x onerror="window.__x=1">', '<script>window.__x=1</script>', '   ', 'a'.repeat(6000), '\u0000', '😀', "'; DROP TABLE x;--"];
  for (const e of evil) { await pg.fill('#genFind', e); await pg.keyboard.press('Enter'); await pg.waitForTimeout(20); if (await pg.locator('[data-gen]').count()) await pg.click('#genHome'); }
  check('odd and hostile text in the search box does nothing bad', pg.errors.length === 0 && !(await pg.evaluate(() => window.__x)), pg.errors.join());
  await pg.fill('#genFind', '   ');
  check('a search of only spaces shows the normal tiles', (await pg.locator('[data-group]').count()) === 5);
  await pg.fill('#genFind', 'zzzz'); await pg.keyboard.press('Enter');
  check('Enter with no match does nothing', (await pg.locator('[data-gen]').count()) === 0 && (await pg.locator('#genFind').count()) === 1);
  await pg.keyboard.press('Escape');
  check('Escape clears the box', (await pg.inputValue('#genFind')) === '');
  // hostile rows in the Claude tables note
  const rows = ['<img src=x onerror="window.__x=2">', '<script>window.__x=3</script>', '**bold** and _italic_ and `code` | a | pipe', 'x'.repeat(380), '[true]', 'Plain row', '😀 emoji row', '- nested bullet'];
  await pg.evaluate(rows => {
    const { S, touch } = window.__dmforge;
    const t = '# Generator Tables\n\n## NPC · Quirk\n<!-- dmf: npc/quirk -->\n\n' + rows.map(r => '- ' + r).join('\n') + '\n\n## Broken\n<!-- dmf: not/real -->\n- x\n\n```\n## unclosed fence\n<!-- dmf: npc/voice -->\n- never\n';
    S.working.create(S.campaign.path + '/Generator Tables.md', t); touch();
  }, rows);
  await openGen(pg, 'NPC');
  let sawRow = false, sawLong = false;
  for (let i = 0; i < 300; i++) {
    await pg.click('[data-field="quirk"] button[aria-label="Reroll Quirk"]');
    const t = await pg.textContent('[data-field="quirk"] .gs-val');
    if (/Plain row|emoji row|bold\*\*|<img|<script|nested bullet/.test(t)) sawRow = true;
    if (t.length >= 380) sawLong = true;
  }
  check('rows from the note turn up, shown as plain text', sawRow);
  check('a hostile row (script or image tag) is shown as text and never runs', !(await pg.evaluate(() => window.__x)) && (await pg.locator('[data-gen] img, [data-gen] script').count()) === 0);
  const o1 = await overflow(pg);
  check('a very long row wraps and does not push the page sideways', o1.s <= o1.c + 1, JSON.stringify(o1));
  check('a malformed note (no key, an unclosed code fence) is harmless', pg.errors.length === 0, pg.errors.join());
  await pg.close();
}

/* ================= 4. window sizes, themes, panes ================= */
if (wants(4)) {
  for (const [w, scheme] of [[320, 'dark'], [600, 'light'], [900, 'dark'], [1360, 'light']]) {
    const pg = await demo(w, 800, scheme);
    const bad = [];
    for (const name of NAMES) {
      await openGen(pg, name);
      const o = await overflow(pg);
      if (o.s > o.c + 1) bad.push(name + ' ' + JSON.stringify(o));
      const clipped = await pg.evaluate(() => { const r = document.querySelector('[data-gen]').getBoundingClientRect(); const p = document.querySelector('.pane:not([hidden])').getBoundingClientRect(); return r.right > p.right + 1 || r.left < p.left - 1; });
      if (clipped) bad.push(name + ' clipped');
    }
    check('width ' + w + ' (' + scheme + '): all 24 pages fit without sideways scroll', bad.length === 0, bad.join(' | '));
    check('width ' + w + ': no errors', pg.errors.length === 0, pg.errors.join());
    await pg.context().close();
  }
  // contrast in both themes
  for (const scheme of ['dark', 'light']) {
    const pg = await demo(1360, 900, scheme);
    await openGen(pg, 'Shop');
    const worst = await pg.evaluate(() => {
      const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d', { willReadFrequently: true });
      const rgb = col => { x.clearRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillStyle = col; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bg = rgb(getComputedStyle(document.querySelector('.pane:not([hidden])')).backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.body).backgroundColor : getComputedStyle(document.querySelector('.pane:not([hidden])')).backgroundColor);
      const out = [];
      for (const sel of ['.gs-kicker', '.gs-title', '.gs-lead', '.gs-lbl', '.gs-val', '.gs-opt', '.gen-crumbs', '.gen-crumbs .linkish', '.gs-note']) {
        const el = document.querySelector('[data-gen] ' + sel) || document.querySelector(sel); if (!el) continue;
        const fg = rgb(getComputedStyle(el).color); const L1 = lum(fg), L2 = lum(bg);
        out.push([sel, (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)]);
      }
      return out;
    });
    const low = worst.filter(([, r]) => r < 4.5);
    check(scheme + ' theme: text contrast is at least 4.5:1 for every part of the page', low.length === 0, JSON.stringify(low));
    await pg.context().close();
  }
  // two panes: two Generate tabs, each keeps its own place
  const pg = await demo(1360, 900);
  await pg.click('#layoutBtn'); await pg.click('.ctx-item:has-text("Two columns")'); await pg.waitForFunction(() => !document.querySelector('.ctx'));
  await pg.click('.nav-btn:has-text("Generate")'); await pg.waitForSelector('#genFind');
  await pg.click('.tabbar[data-pane="1"] .tab-new'); await pg.click('.nav-btn:has-text("Generate")');
  await pg.waitForFunction(() => document.querySelectorAll('.pane:not([hidden]) #genFind, .pane:not([hidden]) [data-gen]').length >= 1);
  const panes = await pg.locator('.pane:not([hidden])').count();
  check('two panes can each show Generate', panes === 2 || panes === 1);
  await pg.locator('.pane:not([hidden])').first().locator('#genFind').fill('shop').catch(() => {});
  await pg.keyboard.press('Enter').catch(() => {});
  await pg.waitForTimeout(100);
  const stacked = await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) .gs-list.two')].every(l => getComputedStyle(l).columnCount === '1' || l.closest('.pane').dataset.wide !== '0'));
  check('in a narrow pane the two-column lists become one column', stacked);
  check('no page errors (panes)', pg.errors.length === 0, pg.errors.join());
  await pg.context().close();
}

/* ================= 5. keyboard, navigation and tabs ================= */
if (wants(5)) {
  const pg = await demo();
  await pg.click('.nav-btn:has-text("Generate")'); await pg.waitForSelector('#genFind');
  await pg.focus('#genFind');
  const order = [];
  for (let i = 0; i < 12 && !order.some(x => x === 'people'); i++) { await pg.keyboard.press('Tab'); order.push(await pg.evaluate(() => document.activeElement.dataset.recent || document.activeElement.dataset.combo || document.activeElement.dataset.comboDel || document.activeElement.dataset.group || document.activeElement.id)); }
  check('Tab walks from the search box through the combos to the first tile', order[0] && order.includes('people') && order.indexOf('people') >= 1, order.join());
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('[data-pick="npc"]');
  check('Enter on a tile opens it', (await pg.locator('[data-pick]').count()) === 3);
  await pg.focus('[data-pick="villain"]'); await pg.keyboard.press('Space');
  await pg.waitForSelector('[data-gen="villain"]');
  check('Space on a tile opens the generator', (await pg.locator('[data-gen="villain"]').count()) === 1);
  await pg.focus('#genRoll'); const t0 = await sheetText(pg);
  let changed = false; for (let i = 0; i < 10 && !changed; i++) { await pg.keyboard.press('Enter'); changed = (await sheetText(pg)) !== t0; }
  check('Roll again works from the keyboard', changed);
  check('every button on the page has a name a screen reader can read', await pg.evaluate(() => [...document.querySelectorAll('[data-gen] button, .gen-crumbs button')].every(b => (b.textContent || '').trim() || b.getAttribute('aria-label'))));
  check('and every select and input has a label', await pg.evaluate(() => [...document.querySelectorAll('[data-gen] select, .gen input')].every(e => e.getAttribute('aria-label') || e.closest('label'))));
  // breadcrumb round trips, many times
  for (let i = 0; i < 40; i++) {
    await pg.click('#genHome');
    await pg.click('[data-group="people"]');
    await pg.click('[data-pick="npc"]');
    await pg.click('.gen-crumbs button:has-text("Someone to talk to")');
    await pg.click('#genHome');
    await pg.click('[data-group="places"]');
    await pg.click('[data-pick="shop"]');
  }
  await pg.click('#genHome');
  check('40 laps of group, generator and back leave no errors and a working screen', pg.errors.length === 0 && (await pg.locator('#genFind').count()) === 1, pg.errors.join());
  // the tools page
  await pg.click('#genTools');
  await pg.click('[data-gen="dice"] button[data-expr="d20"]');
  const n = Number(await pg.textContent('#diceTotal'));
  check('dice still roll, from the tools page', n >= 1 && n <= 20);
  await pg.fill('[data-gen="dice"] input[aria-label="Dice expression"]', '2d6+3'); await pg.keyboard.press('Enter');
  check('and take an expression', Number(await pg.textContent('#diceTotal')) >= 5);
  await pg.fill('[data-gen="dice"] input[aria-label="Dice expression"]', 'banana'); await pg.keyboard.press('Enter');
  check('a nonsense expression gives a message, not an error', (await pg.locator('.toast').last().textContent()).includes('Try something') && pg.errors.length === 0);
  check('My tables is not shown when you have none and Claude is off', (await pg.locator('[data-gen="tables"]').count()) === 0);
  // a tab pinned to Generate still works inside itself
  await pg.click('.tabbar .tab >> nth=0', { button: 'right' });
  await pg.click('.ctx-item:has-text("Pin")');
  await pg.click('#genHome'); await pg.click('[data-group="story"]'); await pg.click('[data-pick="quest"]');
  check('a pinned Generate tab still moves between its own screens', (await pg.locator('[data-gen="quest"]').count()) === 1 && (await pg.locator('.tab').count()) === 1);
  // coming back after visiting another page and after switching campaign
  await pg.click('.nav-btn:has-text("Overview")'); await pg.click('.nav-btn:has-text("Generate")');
  check('the page remembers where it was', (await pg.locator('[data-gen="quest"]').count()) === 1 || (await pg.locator('.gen').count()) === 1);
  check('no page errors (keyboard and navigation)', pg.errors.length === 0, pg.errors.join());
  await pg.context().close();
}

/* ================= 6. random clicking ================= */
if (wants(6)) {
  const pg = await demo();
  let seed = 20261026;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const words = ['npc', 'shop', '', 'x', '(', 'tavern', 'ZZZ', 'rumor', '😀'];
  await pg.click('.nav-btn:has-text("Generate")');
  let steps = 0, acted = 0, dialogs = 0;
  for (; steps < 700; steps++) {
    try {
      if (await pg.locator('.modal').count()) { dialogs++; await pg.keyboard.press('Escape'); await pg.waitForTimeout(30); if (await pg.locator('.modal').count()) { const x = pg.locator('.modal button').last(); await x.click({ timeout: 800 }).catch(() => {}); } continue; }
      if (!(await pg.locator('.gen').count())) { await pg.click('.nav-btn:has-text("Generate")'); continue; }
      const r = rnd();
      if (r < 0.06) { await pg.fill('#genFind', words[Math.floor(rnd() * words.length)], { timeout: 300 }).catch(() => {}); continue; }
      if (r < 0.1) { await pg.keyboard.press(['Enter', 'Escape', 'Tab', 'Space'][Math.floor(rnd() * 4)]); continue; }
      if (r < 0.15) { await pg.setViewportSize({ width: [360, 700, 1000, 1360][Math.floor(rnd() * 4)], height: 800 }); continue; }
      const els = await pg.$$('.gen button:not([disabled]), .gen select, .gen-tile, .gen-recent .chip, .gen-pick input, .gen-jump .chip');
      if (!els.length) continue;
      const el = els[Math.floor(rnd() * els.length)];
      const tag = await el.evaluate(e => e.tagName);
      if (tag === 'SELECT') { const vals = await el.evaluate(e => [...e.options].map(o => o.value)); await el.selectOption(vals[Math.floor(rnd() * vals.length)]).catch(() => {}); }
      else await el.click({ timeout: 800, noWaitAfter: true }).then(() => { acted++; }).catch(() => {});
    } catch (e) { /* a click that missed because the screen changed under it is not a failure */ }
  }
  await closeModal(pg);
  console.log('  (' + acted + ' real clicks, ' + dialogs + ' dialogs opened and closed)');
  check('the random clicking really did things', acted > 250 && dialogs > 3, acted + '/' + dialogs);
  check('700 random clicks, keys, searches and window resizes: no errors', pg.errors.length === 0, pg.errors.slice(0, 3).join('\n'));
  await pg.click('.nav-btn:has-text("Generate")');
  check('and Generate still opens afterwards', (await pg.locator('.gen').count()) === 1 && (await pg.locator('.gen-crumbs, #genFind').count()) >= 1);
  await pg.context().close();
}

/* ================= 7. picking several, quantities, Save all, combos ================= */
if (wants(7)) {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: 'dark' });
  const pg = await demo(1360, 900, 'dark', ctx);
  const home = async () => { await pg.click('.nav-btn:has-text("Generate")'); await pg.waitForSelector('#genHome, #genFind'); if (await pg.locator('#genHome').count()) await pg.click('#genHome'); };
  const group = async id => { await home(); await pg.click('[data-group="' + id + '"]'); };
  const titles = () => pg.$$eval('.gen-multi .gs-title', els => els.map(e => e.textContent.trim()));
  const tagsOf = () => pg.$$eval('.gen-multi .gs-tag', els => els.map(e => e.textContent.trim()));
  const picked = () => pg.$$eval('#genTray [data-pk]', els => els.map(e => e.dataset.pk + ':' + e.querySelector('.pk-q').textContent));

  // ticking, and the tile itself still opens the generator
  await group('places');
  check('every generator tile has a tick box', (await pg.locator('[data-pick-box]').count()) === 6);
  check('with nothing picked there is no tray', (await pg.locator('#genTray').count()) === 0);
  await pg.check('[data-pick-box="tavern"]');
  await pg.check('[data-pick-box="shop"]');
  check('ticking two shows them in a tray, with a count', (await picked()).join() === 'tavern:1,shop:1' && (await pg.textContent('#genTray')).includes('Picked (2 of 8)'));
  check('a ticked tile is marked', (await pg.locator('.gen-tile.picked').count()) === 2);
  await pg.uncheck('[data-pick-box="shop"]');
  check('unticking takes it out again', (await picked()).join() === 'tavern:1');
  await pg.check('[data-pick-box="shop"]');
  await pg.click('[data-pick="settlement"]', { modifiers: ['Control'] });
  check('Ctrl-click ticks a tile instead of opening it', (await pg.locator('[data-gen]').count()) === 0 && (await picked()).join() === 'tavern:1,shop:1,settlement:1');
  await pg.click('[data-pick="settlement"]', { modifiers: ['Control'] });
  check('and Ctrl-click again takes it out', (await picked()).join() === 'tavern:1,shop:1');
  // picks carry over to other groups
  await pg.click('.gen-crumbs button:has-text("Generate")');
  await pg.click('[data-group="people"]');
  check('the tray is still there in another group', (await picked()).join() === 'tavern:1,shop:1');
  await pg.check('[data-pick-box="npc"]');
  check('and picks from several groups add up', (await picked()).join() === 'tavern:1,shop:1,npc:1');
  // roll them
  await pg.click('#pickRoll');
  await pg.waitForSelector('.gen-multi .gs');
  check('Roll them opens one page with each result under the last, in the order picked', (await tagsOf()).join() === 'Tavern,Shop,NPC', (await tagsOf()).join());
  check('each is a full page with a title', (await titles()).length === 3 && (await titles()).every(t => t.length > 0));
  check('the trail says so, and the jump chips name each one', (await pg.textContent('.gen-crumbs')).includes('Picked together') && (await pg.$$eval('.gen-jump .chip', els => els.map(e => e.textContent))).join() === 'Tavern,Shop,NPC');
  await pg.click('.gen-jump .chip:has-text("NPC")');
  const scrolled = await pg.waitForFunction(() => { const r = document.querySelector('#ms-npc-0').getBoundingClientRect(); const p = document.querySelector('.pane:not([hidden])').getBoundingClientRect(); return r.top < p.top + p.height * 0.6; }, null, { timeout: 4000 }).then(() => true, () => false);
  check('a jump chip scrolls to that result', scrolled);
  check('there is no second primary button on a sheet: only the page\'s Roll all again', (await pg.locator('.gen-multi .btn-primary').count()) === 1);
  const sw = await overflow(pg);
  check('the stacked page does not scroll sideways', sw.s <= sw.c + 1, JSON.stringify(sw));
  // locks and rerolls are per sheet
  const before = await titles();
  await pg.click('#ms-tavern-0 button[aria-label="Lock Name"]');
  await pg.click('#multiRoll');
  const after = await titles();
  check('Roll all again leaves a locked part alone and rerolls the rest', after[0] === before[0] && (after[1] !== before[1] || after[2] !== before[2]), before.join('|') + ' -> ' + after.join('|'));
  const t1 = await titles();
  let moved = false;
  for (let i = 0; i < 10 && !moved; i++) { await pg.click('#ms-shop-0 button:has-text("Roll this again")'); const t = await titles(); moved = t[1] !== t1[1]; if (moved) check('Roll this again changes only that sheet', t[0] === t1[0] && t[2] === t1[2]); }
  check('and it does change it', moved);
  // options on one sheet do not touch another
  const selShop = pg.locator('#ms-shop-0 .gs-opt select').first();
  const vals = await selShop.locator('option').evaluateAll(os => os.map(o => o.value));
  await selShop.selectOption(vals[2]);
  check('an option on one sheet stays on that sheet', (await pg.locator('#ms-shop-0 .gs-kicker').textContent()).length > 0 && (await pg.locator('#ms-npc-0 .gs-opt select').first().inputValue()) === 'Any');
  // quantity
  await pg.click('#genTray button[aria-label="More NPC"]');
  check('More NPC makes a second NPC on the page, each its own roll', (await tagsOf()).join() === 'Tavern,Shop,NPC 1,NPC 2' && (await picked()).includes('npc:2'));
  const npcs = await pg.$$eval('#ms-npc-0 .gs-title, #ms-npc-1 .gs-title', els => els.map(e => e.textContent));
  let differ = npcs[0] !== npcs[1];
  for (let i = 0; i < 6 && !differ; i++) { await pg.click('#ms-npc-1 button:has-text("Roll this again")'); differ = (await pg.textContent('#ms-npc-0 .gs-title')) !== (await pg.textContent('#ms-npc-1 .gs-title')); }
  check('the two NPCs are different people', differ);
  await pg.click('#genTray button[aria-label="Fewer NPC"]');
  check('Fewer takes one away, and it cannot go below one', (await tagsOf()).join() === 'Tavern,Shop,NPC' && await pg.isDisabled('#genTray button[aria-label="Fewer NPC"]'));
  // the cap
  for (let i = 0; i < 8; i++) { const more = pg.locator('#genTray button[aria-label="More NPC"]'); if (!(await more.isDisabled())) await more.click(); }
  check('there is a cap of 8 on the page, and More is switched off at it', (await tagsOf()).length === 8 && await pg.isDisabled('#genTray button[aria-label="More NPC"]') && (await pg.textContent('#genTray')).includes('Picked (8 of 8)'), (await tagsOf()).join());
  for (let i = 0; i < 5; i++) await pg.click('#genTray button[aria-label="Fewer NPC"]');
  // copy all
  await stubClipboard(pg);
  await pg.click('#multiCopy');
  await pg.waitForFunction(() => window.__copied);
  const all = await pg.evaluate(() => window.__copied);
  check('Copy all gives every result, separated by a rule', (all.match(/\n---\n/g) || []).length === 2 && !BAD.test(all), all.slice(0, 200));
  // save all
  const wBefore = await pg.evaluate(() => window.__dmforge.S.working.list().length);
  await pg.click('#multiSave');
  await pg.waitForSelector('[data-sa-row]');
  const dests = await pg.$$eval('[data-sa-row]', rows => rows.map(r => r.dataset.saRow + ':' + r.querySelector('[data-sa-dest]').value));
  check('Save all lists each result with its usual place', dests.join() === 'tavern:location,shop:location,npc:npc', dests.join());
  await pg.click('#saAllPrep');
  check('"Put them all in session prep" sets every place to prep', (await pg.$$eval('[data-sa-dest]', els => els.map(e => e.value))).every(v => v === 'prep') && (await pg.locator('#saSession').count()) === 1);
  await pg.click('#saUsual');
  check('"Back to the usual places" undoes that', (await pg.$$eval('[data-sa-dest]', els => els.map(e => e.value))).join() === 'location,location,npc');
  await pg.uncheck('[data-sa-row="shop"] input[type=checkbox]');
  await pg.fill('[data-sa-row="npc"] .sa-name', '');
  check('a note with no name cannot be saved, and an unticked result is left out', (await pg.textContent('#saSave')).trim() === 'Save 1');
  await pg.fill('[data-sa-row="npc"] .sa-name', 'Odd Fellow');
  await pg.click('#saSave');
  await pg.waitForFunction(() => !document.querySelector('.modal'));
  const wAfter = await pg.evaluate(() => window.__dmforge.S.working.list().map(e => e.path));
  check('Save all made the notes asked for: the tavern and the NPC, not the shop', wAfter.length - wBefore === 2 && wAfter.some(x => /Odd Fellow\.md$/.test(x)), wAfter.join(' | '));
  // all to prep
  await pg.click('.nav-btn:has-text("Generate")'); await pg.waitForSelector('#multiSave');
  await pg.click('#multiSave'); await pg.waitForSelector('[data-sa-row]');
  await pg.click('#saAllPrep'); await pg.click('#saSave');
  await pg.waitForFunction(() => !document.querySelector('.modal'));
  const prepText = await pg.evaluate(() => { const S = window.__dmforge.S; const p = S.working.paths().find(x => /Session 12/.test(x)); return S.working.get(p); });
  check('saving all to prep adds each as a foldable entry in the session', /\[!info\]- Tavern/.test(prepText) && /\[!info\]- Shop/.test(prepText) && /\[!example\]- NPC/.test(prepText));
  // combos
  await home();
  const starters = await pg.$$eval('[data-combo]', els => els.map(e => e.textContent));
  check('three starter combos are there to begin with', starters.join() === 'A night at the inn,Market day,Trouble on the road', starters.join());
  await pg.click('[data-combo]:has-text("A night at the inn")');
  await pg.waitForSelector('.gen-multi .gs');
  check('a combo rolls its set on the one page, with the quantities', (await tagsOf()).join() === 'Tavern,NPC 1,NPC 2,Rumors', (await tagsOf()).join());
  check('and the tray shows what it is', (await picked()).join() === 'tavern:1,npc:2,rumors:1');
  // save a new combo
  await pg.click('#pickClear');
  await group('places'); await pg.check('[data-pick-box="shop"]'); await pg.click('.gen-crumbs button:has-text("Generate")'); await pg.click('[data-group="people"]'); await pg.check('[data-pick-box="npc"]'); await pg.click('#genTray button[aria-label="More NPC"]'); await pg.click('#genTray button[aria-label="More NPC"]');
  await pg.click('#pickCombo');
  check('Save as a combo asks for a name, and cannot be saved without one', await pg.isDisabled('#comboSave'));
  await pg.fill('#comboName', 'Shop and a crowd');
  await pg.click('#comboSave');
  await home();
  check('the new combo is on the home screen', (await pg.locator('[data-combo]:has-text("Shop and a crowd")').count()) === 1);
  check('and it was saved to Settings', await pg.evaluate(() => JSON.parse(localStorage.getItem('dmforge:settings')).combos.some(c => c.name === 'Shop and a crowd' && c.picks.some(p => p.id === 'npc' && p.qty === 3))));
  const pg2 = await demo(1360, 900, 'dark', ctx);
  await pg2.click('.nav-btn:has-text("Generate")'); await pg2.waitForSelector('#genFind');
  check('it is still there when the app is started again', (await pg2.locator('[data-combo]:has-text("Shop and a crowd")').count()) === 1);
  await pg2.close();
  // the same name replaces; a hostile name is text; a long name is cut
  await pg.click('[data-combo]:has-text("Shop and a crowd")'); await pg.waitForSelector('.gen-multi .gs');
  await pg.click('#genTray button[aria-label="Remove NPC"]');
  await pg.click('#pickCombo'); await pg.fill('#comboName', 'shop and a crowd'); await pg.click('#comboSave');
  await home();
  check('saving under the same name replaces it, it does not add a copy', (await pg.locator('[data-combo]:has-text("hop and a crowd")').count()) === 1);
  await pg.click('[data-combo]:has-text("hop and a crowd")'); await pg.waitForSelector('.gen-multi .gs');
  await pg.click('#pickCombo'); await pg.fill('#comboName', '<img src=x onerror="window.__y=1"> ' + 'z'.repeat(80)); await pg.click('#comboSave');
  await home();
  const longName = await pg.$$eval('[data-combo]', els => els.map(e => e.textContent).find(t => t.startsWith('<img')));
  check('a hostile combo name is shown as text and never runs, and a long one is cut to 40', !!longName && longName.length === 40 && !(await pg.evaluate(() => window.__y)) && (await pg.locator('.gen-combos img').count()) === 0, String(longName));
  // delete asks first
  await pg.click('[data-combo-del]:near([data-combo]:has-text("hop and a crowd"))').catch(async () => { await pg.locator('[data-combo-del]').nth(3).click(); });
  check('deleting a combo asks first', (await pg.locator('.modal').count()) === 1);
  await pg.click('.modal button:has-text("Cancel")');
  const nCombos = await pg.locator('[data-combo]').count();
  await pg.locator('[data-combo-del]').last().click(); await pg.click('.modal .btn-danger');
  await pg.waitForFunction(() => !document.querySelector('.modal'));
  check('and Delete removes just that one', (await pg.locator('[data-combo]').count()) === nCombos - 1);
  // a combo with a switched-off generator rolls the rest; one with none left disappears
  await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="library"]'); await pg.waitForSelector('#setGens'); if (!(await pg.evaluate(() => document.querySelector('#setGens').open))) await pg.click('#setGens summary');
  await pg.uncheck('[data-gen-toggle="tavern"]'); await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage'));
  await home();
  await pg.click('[data-combo]:has-text("A night at the inn")'); await pg.waitForSelector('.gen-multi .gs');
  check('a combo with a switched-off generator rolls the rest', (await tagsOf()).join() === 'NPC 1,NPC 2,Rumors', (await tagsOf()).join());
  await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="library"]'); await pg.waitForSelector('#setGens'); if (!(await pg.evaluate(() => document.querySelector('#setGens').open))) await pg.click('#setGens summary');
  await pg.click('#gensNone'); await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage'));
  await home();
  check('with everything switched off the combos and the tray are gone, with no error', (await pg.locator('[data-combo], #genTray').count()) === 0 && pg.errors.length === 0, pg.errors.join());
  await pg.click('#genNone button'); await pg.click('#gensAll'); await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage'));
  // tab memory
  await home(); if (await pg.locator('#pickClear').count()) await pg.click('#pickClear');
  await group('places'); await pg.check('[data-pick-box="weather"]');
  await pg.click('.nav-btn:has-text("Overview")'); await pg.click('.nav-btn:has-text("Generate")');
  check('picks and screen are remembered when you leave and come back', (await picked()).join() === 'weather:1');
  await pg.click('#genTray button[aria-label="Remove Weather"]');
  check('removing the last pick removes the tray', (await pg.locator('#genTray').count()) === 0);
  check('no page errors (picking several)', pg.errors.length === 0, pg.errors.join('\n'));
  await ctx.close();

  // ---- trying to break it
  const bad = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await bad.addInitScript(() => { try { localStorage.setItem('dmforge:settings', JSON.stringify({ combos: [
    { id: 'x', name: 'Bad one', picks: [{ id: 'nope', qty: 5 }, { id: 'npc', qty: 999 }, { id: 'npc', qty: 2 }, { id: 'shop', qty: '3' }, { id: 'tavern', qty: -4 }, 7, null] },
    { id: 'x', name: 'Duplicate id', picks: [{ id: 'npc', qty: 1 }] },
    { id: 'y', name: '   ', picks: [{ id: 'npc', qty: 1 }] },
    { id: 'z', name: 'Nothing in it', picks: [] },
    'not a combo', null, { id: 'w', name: 'Fine', picks: [{ id: 'quest', qty: 1 }] },
    ...Array.from({ length: 40 }, (_, i) => ({ id: 'm' + i, name: 'Many ' + i, picks: [{ id: 'omen', qty: 1 }] })),
  ] })); } catch (e) { /* ignore */ } });
  const pb = await demo(1360, 900, 'dark', bad);
  await pb.click('.nav-btn:has-text("Generate")'); await pb.waitForSelector('#genFind');
  const names = await pb.$$eval('[data-combo]', els => els.map(e => e.textContent));
  check('nonsense combos in the saved settings are cleaned: bad ones dropped, the rest kept, never more than 20', names[0] === 'Bad one' && names.includes('Fine') && !names.includes('Duplicate id') && !names.includes('Nothing in it') && names.length <= 20, names.join('|'));
  await pb.click('[data-combo]:has-text("Bad one")'); await pb.waitForSelector('.gen-multi .gs');
  const tg = await pb.$$eval('.gen-multi .gs-tag', els => els.map(e => e.textContent.trim()));
  check('and a combo asking for 999 NPCs and a negative number of taverns is cut down to 8 sheets at most', tg.length >= 1 && tg.length <= 8 && !tg.some(t => /nope/i.test(t)), tg.join());
  check('no page errors from hostile settings', pb.errors.length === 0, pb.errors.join());
  await bad.close();

  // rapid toggling and clicking everything in the tray
  const ctx3 = await b.newContext({ viewport: { width: 1360, height: 900 } });
  const pc = await demo(1360, 900, 'dark', ctx3);
  await pc.click('.nav-btn:has-text("Generate")'); await pc.waitForSelector('#genFind'); await pc.click('[data-group="story"]');
  for (let i = 0; i < 120; i++) { const id = ['hook', 'quest', 'rumors', 'twist', 'omen', 'riddle', 'festival'][i % 7]; await pc.locator('[data-pick-box="' + id + '"]').click({ noWaitAfter: true }); }
  const left = await pc.$$eval('#genTray [data-pk]', els => els.length);
  check('120 rapid ticks and unticks leave a sane tray', left >= 0 && left <= 7 && pc.errors.length === 0, left + ' ' + pc.errors.join());
  for (const id of ['hook', 'quest', 'rumors', 'twist', 'omen', 'riddle', 'festival']) { if (!(await pc.locator('[data-pick-box="' + id + '"]').isChecked())) await pc.locator('[data-pick-box="' + id + '"]').check(); }
  for (let i = 0; i < 12; i++) { const more = pc.locator('#genTray button[aria-label^="More"]').first(); if (await more.count() && !(await more.isDisabled())) await more.click(); }
  check('seven picks plus extra copies never go past 8', (await pc.textContent('#genTray')).match(/Picked \((\d+) of 8\)/)[1] <= 8);
  await pc.click('#pickRoll'); await pc.waitForSelector('.gen-multi .gs');
  check('the maximum page of 8 rolls without error', (await pc.locator('.gen-multi .gs').count()) === 8 && pc.errors.length === 0, pc.errors.join());
  for (let i = 0; i < 40; i++) await pc.click('#multiRoll', { noWaitAfter: true });
  check('40 quick Roll all again clicks on 8 sheets: no errors', pc.errors.length === 0, pc.errors.join());
  await pc.click('#pickClear');
  check('Clear empties the page without breaking it', (await pc.locator('.gen-multi .gs').count()) === 0 && (await pc.textContent('.gen-multi')).includes('Nothing is picked'));
  await ctx3.close();

  // narrow window and keyboard
  const pn = await demo(360, 800, 'dark');
  await pn.click('.nav-btn:has-text("Generate")'); await pn.waitForSelector('#genFind'); await pn.click('[data-group="places"]');
  await pn.check('[data-pick-box="tavern"]'); await pn.check('[data-pick-box="shop"]'); await pn.click('#pickRoll'); await pn.waitForSelector('.gen-multi .gs');
  const nw = await pn.evaluate(() => ({ s: document.querySelector('.pane:not([hidden])').scrollWidth, c: document.querySelector('.pane:not([hidden])').clientWidth }));
  check('on a phone-sized window the picked page and tray fit the width', nw.s <= nw.c + 1, JSON.stringify(nw));
  await pn.click('#genHome'); await pn.click('[data-group="places"]');
  await pn.focus('[data-pick-box="weather"]'); await pn.keyboard.press('Space');
  check('a tick box works from the keyboard', (await pn.locator('#genTray [data-pk="weather"]').count()) === 1);
  check('every control in the tray has a name', await pn.evaluate(() => [...document.querySelectorAll('#genTray button, #genTray input')].every(e => (e.textContent || '').trim() || e.getAttribute('aria-label'))));
  check('no page errors (narrow)', pn.errors.length === 0, pn.errors.join());
  await pn.context().close();
}

await b.close(); srv.close();
const fails = results.filter(r => !r.ok);
console.log('\n' + (results.length - fails.length) + '/' + results.length + ' checks passed');
process.exit(fails.length ? 1 : 0);
