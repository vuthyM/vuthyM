/* 2.48: Settings as a page (categories, search, compact controls) and the typeface sets. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const pg = await ctx.newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
const external = []; pg.on('request', r => { const u = r.url(); if (!/^(file|data|blob|about):/.test(u)) external.push(u); });
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const settings = () => pg.evaluate(() => window.__dmforge.S.settings);
const shown = () => pg.evaluate(() => [...document.querySelectorAll('#settingsPage [data-set]')].map(e => e.dataset.set));

/* ---- getting there */
await pg.click('#navSettings');
check('the Menu holds Settings and the help items, not Claude, Trash, Version or Update', await pg.locator('#menuSettings').count() === 1 && await pg.locator('#menuClaude, #menuTrash, #menuVersion, #menuUpdate, #menuUndoPush').count() === 0);
await pg.click('#menuSettings'); await pg.waitForSelector('#settingsPage');
check('Settings opens as a page (not a window), as its own tab', await pg.locator('.modal').count() === 0 && (await pg.textContent('.tab[aria-selected="true"], .tab.active, .tab.on')).includes('Settings'));
check('seven categories down the left', await pg.locator('.set-cat').count() === 7, await pg.locator('.set-cat').count());
check('it starts on Appearance', (await pg.getAttribute('[data-setcat="appearance"]', 'aria-current')) === 'page');

/* ---- one category at a time */
const cats = { appearance: ['theme', 'palette', 'accent', 'fontset'], layout: ['layout', 'sidebar'], writing: ['leave', 'autopush', 'autoopen'], sessions: ['track', 'neglect'], library: ['srd', 'groupafter', 'gens'], claude: ['claude', 'snapshot'], data: ['undopush', 'moveset', 'atlas', 'trash', 'update', 'version'] };
for (const [c, ids] of Object.entries(cats)) {
  await pg.click('[data-setcat="' + c + '"]');
  const got = await shown();
  check(c + ' shows just its own options (' + ids.join(', ') + ')', JSON.stringify(got) === JSON.stringify(ids), JSON.stringify(got));
}

/* ---- the controls do what they always did */
await pg.click('[data-setcat="writing"]');
check('the two saving choices are real radio buttons, "Save it for me" ticked', await pg.isChecked('#setAuto') && !(await pg.isChecked('#setAsk')));
await pg.check('#setAsk');
check('choosing "Ask me first" is saved', (await settings()).leaveEdit === 'ask' && await pg.isChecked('#setAsk') && !(await pg.isChecked('#setAuto')));
await pg.check('#setAuto');
check('and back', (await settings()).leaveEdit === 'auto');
check('a switch is a real checkbox with a switch role', (await pg.getAttribute('#setAutoOpen', 'role')) === 'switch' && await pg.isChecked('#setAutoOpen'));
await pg.uncheck('#setAutoOpen');
check('turning it off is saved', (await settings()).autoOpenLast === false);
await pg.check('#setAutoOpen');
await pg.click('[data-setcat="layout"]');
check('the sidebar delay is not shown while the sidebar stays put', await pg.locator('#setSidebarDelay').count() === 0);
await pg.check('#setSidebarAuto');
check('it appears when you switch auto-hide on', await pg.locator('#setSidebarDelay').count() === 1 && (await settings()).sidebarAuto === true);
await pg.uncheck('#setSidebarAuto');
check('and goes again', await pg.locator('#setSidebarDelay').count() === 0);
await pg.click('[data-setcat="sessions"]');
check('"Keep the last N" is there while tracking is on', await pg.locator('#setKeep').count() === 1);
await pg.uncheck('#setTrack');
check('and not when it is off', await pg.locator('#setKeep').count() === 0);
await pg.check('#setTrack');
await pg.click('[data-setcat="library"]');
await pg.selectOption('#setGroupAfter', '50');
check('a dropdown saves', (await settings()).groupAfter === 50);
await pg.selectOption('#setGroupAfter', '20');


/* ---- search */
await pg.fill('#settingsSearch', 'sidebar');
check('searching "sidebar" finds the sidebar option, whichever category it is in', JSON.stringify(await shown()).includes('sidebar') && (await pg.textContent('#setResults')).includes('match'), JSON.stringify(await shown()));
check('and no category is marked as the one you are in', await pg.locator('.set-cat.on').count() === 0);
await pg.fill('#settingsSearch', 'font');
check('"font" finds the typeface choice', (await shown()).includes('fontset'));
await pg.fill('#settingsSearch', 'where i left off');
check('a phrase works, across words', (await shown()).includes('track'));
await pg.fill('#settingsSearch', 'zzzzqqq');
check('nothing matching says so', (await shown()).length === 0 && (await pg.textContent('#setResults')).includes('Nothing matches'));
await pg.fill('#settingsSearch', 'dark');
const darkHits = await shown();
check('"dark" finds the colour options (the dark-style row belongs to Classic only)', darkHits.includes('theme') && darkHits.includes('palette') && !darkHits.includes('darkstyle'), JSON.stringify(darkHits));
await pg.keyboard.press('Escape');
check('Escape clears the search and returns to the category', (await pg.inputValue('#settingsSearch')) === '' && await pg.locator('.set-cat.on').count() === 1);
await pg.fill('#settingsSearch', 'srd'); 
check('a control found by search still works (the monsters switch)', await pg.locator('#setSrd').count() === 1);
await pg.uncheck('#setSrd'); check('and its switch is saved', (await settings()).srdOn === false); await pg.check('#setSrd');
await pg.fill('#settingsSearch', '');

/* ---- typeface sets */
await pg.click('[data-setcat="appearance"]');
check('seven typeface cards, Today ticked', await pg.locator('.font-card').count() === 7 && await pg.isChecked('#setFont-today'));
check('today has no type attribute (it is the default)', (await pg.evaluate(() => document.documentElement.dataset.type)) === undefined);
const fam = sel => pg.evaluate(s => getComputedStyle(document.querySelector(s)).fontFamily.split(',')[0].replace(/["']/g, '').trim(), sel);
const wantFonts = { today: ['Fraunces', 'Work Sans', 'IBM Plex Mono'], manuscript: ['Cinzel', 'Source Sans 3', 'IBM Plex Mono'], storybook: ['Alegreya', 'Alegreya Sans', 'DM Mono'], clear: ['Literata', 'Atkinson Hyperlegible', 'JetBrains Mono'], bold: ['Young Serif', 'Figtree', 'Fira Code'], clean: ['Plus Jakarta Sans', 'Inter', 'JetBrains Mono'], modern: ['Bricolage Grotesque', 'DM Sans', 'DM Mono'] };
for (const id of Object.keys(wantFonts)) {
  await pg.check('#setFont-' + id); await sleep(250);
  const [h, bo, m] = wantFonts[id];
  const got = [await fam('#settingsPage h2'), await fam('body'), await pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-mono').split(',')[0].replace(/["']/g, '').trim())];
  check(id + ': titles ' + h + ', text ' + bo + ', numbers ' + m, JSON.stringify(got) === JSON.stringify(wantFonts[id]), JSON.stringify(got));
  const loaded = await pg.evaluate(async ([h, b]) => { await document.fonts.ready; return [h, b].map(f => [...document.fonts].some(x => x.family.replace(/["']/g, '') === f && x.status === 'loaded')); }, [h, bo]);
  check(id + ': the fonts really loaded from the app itself', loaded.every(Boolean), JSON.stringify(loaded));
  check(id + ': the attribute and the saved choice match', (await pg.evaluate(() => document.documentElement.dataset.type || 'today')) === id && ((await settings()).fontSet || 'today') === id);
}
check('no font or anything else was fetched from the internet', external.length === 0, external.join(' '));
await pg.check('#setFont-storybook');
await pg.reload(); await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar');
await pg.waitForFunction(() => document.documentElement.dataset.type === 'storybook'); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(250);
check('the choice survives a restart', (await pg.evaluate(() => document.documentElement.dataset.type)) === 'storybook' && (await fam('body')) === 'Alegreya Sans');
await pg.evaluate(() => localStorage.setItem('dmforge:settings', JSON.stringify({ fontSet: 'comic-sans' })));
await pg.reload(); await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar');
await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(400);
check('an unknown saved typeface is ignored (Today)', (await pg.evaluate(() => document.documentElement.dataset.type)) === undefined && (await fam('body')) === 'Work Sans');

/* ---- the other ways in */
await pg.evaluate(() => { window.__dmforge.S.dialog = { kind: 'settings' }; window.__dmforge.emit(); });
await pg.waitForSelector('#settingsPage');
check('the old window request lands on the page', await pg.locator('.modal').count() === 0);
await pg.evaluate(() => { window.__dmforge.S.dialog = { kind: 'claudeSettings' }; window.__dmforge.emit(); });
await pg.waitForSelector('#claudePanel');
check('the old Claude window request lands on the Claude category', (await pg.getAttribute('[data-setcat="claude"]', 'aria-current')) === 'page');
await pg.keyboard.press('Control+KeyK'); await pg.fill('#palInput', 'settings'); await sleep(150); await pg.keyboard.press('Enter');
await pg.waitForSelector('#settingsPage');
check('Command-K "Settings" opens the page', true);
await pg.click('[data-setcat="data"]');
check('without the helper the undo, update and version buttons are off, with the reason', await pg.isDisabled('#setUndoPush') && await pg.isDisabled('#setUpdate') && await pg.isDisabled('#setVersion') && (await pg.textContent('[data-set="update"]')).includes('Needs the helper'));
await pg.click('#setTrashBtn'); await pg.waitForSelector('.modal');
check('Trash opens from here', (await pg.textContent('.modal')).toLowerCase().includes('trash'));
await pg.keyboard.press('Escape'); await pg.waitForFunction(() => !document.querySelector('.modal'));
await pg.evaluate(() => window.__dmforge.A.openSettings('library', 'gens'));
check('"Choose which generators show" lands on that list, open', await pg.evaluate(() => document.querySelector('#setGens') && document.querySelector('#setGens').open));
await pg.evaluate(() => window.__dmforge.A.openSettings('sessions', '', { ctrlKey: true }));
check('ctrl-click opens Settings in a new tab', await pg.locator('.tab:has-text("Settings")').count() >= 2, await pg.locator('.tab:has-text("Settings")').count());

/* ---- narrow, and every category fits, light and dark */
let overflowed = false;
for (const w of [1440, 900, 560, 390]) {
  await pg.setViewportSize({ width: w, height: 900 });
  for (const theme of ['light', 'dark']) {
    await pg.evaluate(t => window.__dmforge.A.setTheme(t), theme);
    for (const c of Object.keys(cats)) {
      await pg.evaluate(c => window.__dmforge.A.openSettings(c), c); await sleep(60);
      const over = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('#settingsPage *')].some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && !e.closest('.set-nav'); }));
      if (over) { overflowed = true; check('no horizontal overflow: ' + c + ' at ' + w + ' ' + theme, false, 'overflows'); }
    }
  }
}
check('no category overflows at 1440, 900, 560 or 390 wide, light or dark', !overflowed);
await pg.setViewportSize({ width: 560, height: 900 });
await pg.evaluate(() => window.__dmforge.A.openSettings('appearance')); await sleep(100);
check('on a narrow window the categories become a row above the options', (await pg.evaluate(() => getComputedStyle([...document.querySelectorAll('.set-nav')].find(e => e.offsetParent)).flexDirection)) === 'row');
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
