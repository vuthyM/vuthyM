/* 2.43: a colour for each campaign, and weight and scale where it matters (combat numbers, clock dials, titles). Full demo campaign. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
const P = '.pane:not([hidden]) ';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const accent = () => pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
const hex = c => { const m = /rgb\((\d+), (\d+), (\d+)/.exec(c); return m ? '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('') : c; };
const openSettings = async () => { await pg.evaluate(() => window.__dmforge.A.openSettings('appearance')); await pg.waitForSelector('#accentGroup'); };

// ---- accents
await sleep(3300);
check('the default gold is the app\'s own colour', hex(await accent()) === '#8a6218', await accent());
await openSettings();
check('Settings offers six colours for this campaign', await pg.locator('#accentGroup [data-accent-pick]').count() === 6);
check('gold is the one ticked at first', (await pg.getAttribute('[data-accent-pick="gold"]', 'aria-checked')) === 'true');
await pg.click('[data-accent-pick="ember"]');
await sleep(3300);
check('choosing Ember repaints the app', hex(await accent()) === '#b6451b' && await pg.evaluate(() => document.documentElement.dataset.accent) === 'ember', await accent());
check('the buttons really take it', hex(await pg.evaluate(() => getComputedStyle(document.querySelector('.btn-primary, .nav-btn[aria-current="page"], .seg-opt.on')).backgroundColor)) === '#b6451b');
check('and it is remembered for this campaign', await pg.evaluate(() => Object.entries(localStorage).some(([k, v]) => /^dmforge:accent:/.test(k) && v === 'ember')));
await pg.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await sleep(3300);
check('in the dark theme it is a lighter Ember', hex(await accent()) === '#f28d68', await accent());
await pg.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
await sleep(3300);
await pg.evaluate(() => window.__dmforge.A.setSection('overview'));
await pg.keyboard.press('Control+KeyK');
await pg.fill('#palInput', 'campaign colour frost');
await pg.waitForSelector('.pal-row[data-pal*="Frost"], .pal-row:has-text("Frost")');
await pg.keyboard.press('Enter');
await sleep(3300);
check('Ctrl+K can change the colour too', hex(await accent()) === '#266fa2', await accent());
await pg.evaluate(() => window.__dmforge.A.setAccent('gold'));
await sleep(200);
check('gold puts everything back and forgets the choice', await pg.evaluate(() => document.documentElement.dataset.accent === undefined && !Object.keys(localStorage).some(k => /^dmforge:accent:/.test(k))));
await pg.evaluate(() => window.__dmforge.A.setAccent('crimson'));
await pg.evaluate(() => window.__dmforge.A.closeCampaign());
await sleep(200);
check('leaving the campaign goes back to gold', await pg.evaluate(() => document.documentElement.dataset.accent === undefined));
await pg.evaluate(() => window.__dmforge.A.setAccent('gold'));

// ---- weight and scale: combat
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar');
await pg.evaluate(() => window.__dmforge.A.addMonstersToCombat([{ m: { n: 'Goblin', key: 'srd:goblin', hp: 7, ac: 15, ini: 2 }, qty: 2 }]));
await pg.evaluate(() => window.__dmforge.A.setSection('combat'));
await pg.waitForSelector('#nextTurn');
await pg.click('#nextTurn'); await sleep(200);
const sizes = await pg.evaluate(() => ({ next: document.querySelector('#nextTurn').getBoundingClientRect().height, init: parseFloat(getComputedStyle(document.querySelector('.c-init')).fontSize), round: parseFloat(getComputedStyle(document.querySelector('.round-badge')).fontSize), who: parseFloat(getComputedStyle(document.querySelector('.combat-who')).fontSize), text: document.querySelector('#combatTurn').textContent }));
check('Next turn is a big, easy target', sizes.next >= 48, JSON.stringify(sizes));
check('initiative numbers are large', sizes.init >= 28, JSON.stringify(sizes));
check('the round number and whose turn it is lead the bar', sizes.round >= 32 && sizes.who >= 20, JSON.stringify(sizes));
check('the words are unchanged', /^Round \d+ · Goblin( \d)?’s turn$/.test(sizes.text), sizes.text);
check('and the bar still pins to the top while the list scrolls', await pg.evaluate(() => getComputedStyle(document.querySelector('#combatBar')).position === 'sticky'));

// ---- the clock dials in Live
await pg.evaluate(() => window.__dmforge.A.goto(window.__dmforge.getIndex().byType.session[0].path));
await pg.waitForSelector(P + '#liveBtn'); await pg.click(P + '#liveBtn'); await pg.waitForSelector(P + '#livePanel');
const dials = await pg.evaluate(() => ({ pies: document.querySelectorAll('.pane:not([hidden]) .live-clock .pie').length, rows: document.querySelectorAll('.pane:not([hidden]) .live-clock').length, w: document.querySelector('.pane:not([hidden]) .live-clock .pie').getBoundingClientRect().width }));
check('every Live clock has a dial', dials.rows >= 3 && dials.pies === dials.rows && dials.w >= 40, JSON.stringify(dials));
const c0 = await pg.textContent(P + '.live-clock [data-count]');
await pg.click(P + '.live-clock button[aria-label^="One slice forward"]'); await sleep(200);
check('and the dial moves with the + button', (await pg.textContent(P + '.live-clock [data-count]')) !== c0 && await pg.evaluate(() => { const p = document.querySelector('.pane:not([hidden]) .live-clock .pie'); return p.querySelectorAll('.pie-on').length === Number(document.querySelector('.pane:not([hidden]) .live-clock [data-count]').textContent.split('/')[0]); }));
check('note titles are larger', await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.pane:not([hidden]) #noteTitle')).fontSize) >= 30));
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
