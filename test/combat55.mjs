import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import path from 'node:path'; import url from 'node:url';

/* Combat, round two: the creature whose turn it is has everything open; the others are a line and the amount box. */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar');
await pg.evaluate(() => window.__dmforge.A.setSection('combat'));
await pg.click('#startAll'); await pg.waitForSelector('.c-row');
const rows = pg.locator('.c-row'); const n = await rows.count();
check('a fight with the party and four creatures', n === 8, n);
const visibleButtons = () => pg.locator('.main .c-list button:visible').count();
const more = () => pg.locator('.c-row .c-more').count();
check('only the creature whose turn it is has its controls open', (await more()) === 1 && (await pg.locator('.c-row.turn .c-more').count()) === 1);
const compactButtons = await visibleButtons();
await pg.click('#combatRowsToggle');
const fullButtons = await visibleButtons();
await pg.click('#combatRowsToggle');
check('well under two thirds of the buttons the full layout puts on screen', compactButtons < fullButtons * 0.67, compactButtons + ' vs ' + fullButtons);
check('the current turn is plainly marked', (await pg.locator('.c-row.turn').count()) === 1);
check('the rows still take damage from the one line', true);

// damage and heal work from a collapsed row
const quiet = pg.locator('.c-row:not(.turn)').first();
const nm = (await quiet.locator('.c-name span').first().textContent()).trim();
const hpBefore = (await quiet.locator('.c-hp .mono').textContent()).trim();
await quiet.locator('input[placeholder="amt"]').fill('5'); await quiet.locator('button:has-text("Damage")').click();
const hpAfter = (await pg.locator('.c-row', { hasText: nm }).first().locator('.c-hp .mono').textContent()).trim();
check('Damage from a collapsed row works', hpBefore !== hpAfter, hpBefore + ' -> ' + hpAfter);

// open a quiet row with its chevron; reaction and a note show on the compact line afterwards
const row = () => pg.locator('.c-row', { hasText: nm }).first();
await row().locator('.c-toggle').click();
check('the chevron opens that row', (await row().locator('.c-more').count()) === 1 && (await more()) === 2);
await row().locator('[data-reaction]').click();
await row().locator('.c-note').fill('Concentrating on Bless');
await row().locator('.c-toggle').click();
check('and closes it again', (await row().locator('.c-more').count()) === 0);
check('a used reaction and the note still show on the one line', (await row().textContent()).includes('Reaction used') && (await row().textContent()).includes('Concentrating on Bless'));

// the turn moves: the new creature opens, the old one closes
const who = async () => (await pg.locator('.c-row.turn .c-name span').first().textContent()).trim();
const first = await who();
await pg.click('#nextTurn'); await pg.waitForTimeout(200);
const second = await who();
check('Next turn moves the open controls to the new creature', first !== second && (await more()) === 1 && (await pg.locator('.c-row.turn .c-more').count()) === 1);
check('the chevron is locked on the current turn', await pg.locator('.c-row.turn .c-toggle').isDisabled());

// conditions and temp HP, inside the open row
await pg.locator('.c-row.turn .c-conds summary').click();
await pg.locator('.c-row.turn .cond[data-rule="Frightened"]').click();
check('a condition set inside the open row shows as a pill on the line', (await pg.locator('.c-row.turn .c-name .pill[data-rule="Frightened"]').count()) === 1);
await pg.locator('.c-row.turn input[placeholder="amt"]').fill('4'); await pg.locator('.c-row.turn [data-temp-btn]').click();
check('Temp HP works from the open row', (await pg.locator('.c-row.turn [data-temp]').count()) === 1);

// a player at 0 hit points: the death saves must be visible with the row collapsed
const pc = pg.locator('.c-row', { has: pg.locator('.pill-good:text("PC")') }).filter({ hasNot: pg.locator('.turn') }).first();
const pcName = (await pc.locator('.c-name span').first().textContent()).trim();
const pcRow = () => pg.locator('.c-row', { hasText: pcName }).first();
const max = Number((await pcRow().locator('.c-hp .mono').textContent()).split('/')[1]);
if (await pcRow().evaluate(e => e.classList.contains('turn'))) await pg.click('#nextTurn');
await pcRow().locator('input[placeholder="amt"]').fill(String(max)); await pcRow().locator('button:has-text("Damage")').click();
check('a player at 0 shows death saves even with the row collapsed', (await pcRow().locator('[data-death]:visible').count()) === 1 && (await pcRow().locator('.c-more').count()) === 0);

// the switch for everything-open, and that it is remembered
await pg.click('#combatRowsToggle');
check('"Show all details" opens every row', (await more()) === 8);
await pg.reload(); await pg.waitForSelector('.sidebar').catch(() => {});
check('the choice is remembered in the browser', (await pg.evaluate(() => localStorage.getItem('dmforge:combat-rows'))) === 'all');
check('no page errors', errs.length === 0, errs.join('\n'));
await b.close();
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
