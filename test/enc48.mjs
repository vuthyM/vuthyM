/* 2.48: a prepared encounter can be edited in place: rename, how many, which creature, more, fewer. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
const P = '.pane:not([hidden]) ';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sess = await pg.evaluate(() => window.__dmforge.getIndex().byType.session[0].path);
const body = () => pg.evaluate(p => window.__dmforge.getIndex().byPath.get(p).body, sess);
await pg.evaluate(p => { const A = window.__dmforge.A; A.setCurrentSession(p); A.saveEncounterTo(p, 'Ambush at the weir', [{ qty: 3, name: 'Goblin Warrior' }, { qty: 1, name: 'Bugbear Warrior' }]); A.saveEncounterTo(p, 'The crypt door', [{ qty: 2, name: 'Skeleton' }]); A.goto(p); }, sess);
await pg.waitForSelector(P + '#encounters'); await sleep(200);
const row = t => P + '[data-enc="' + t + '"] ';
check('both encounters are listed with an Edit button', await pg.locator(P + '[data-editenc]').count() === 2);

await pg.click(row('Ambush at the weir') + '[data-editenc]');
await pg.waitForSelector(P + '#encName');
check('Edit opens the name, the creatures and an Add box', (await pg.inputValue(P + '#encName')) === 'Ambush at the weir' && await pg.locator(P + '.enc-line').count() === 2 && await pg.locator(P + '#encAdd').count() === 1);
check('only that encounter is open for editing', await pg.locator(P + '.enc-edit').count() === 1);
check('there is a Save and a Cancel', await pg.locator(P + '#encCancel').count() === 1 && await pg.locator(P + '#encSave').count() === 1);

await pg.click(P + '[data-encplus="Goblin Warrior"]'); await pg.click(P + '[data-encplus="Goblin Warrior"]');          // 3 -> 5
check('the minus stops at one', await pg.isDisabled(P + '[data-encminus="Bugbear Warrior"]'));
await pg.fill(P + '[data-encline="Bugbear Warrior"] .enc-name', 'Ogre');
check('Ogre is in the library, so it is not flagged', await pg.locator(P + '.enc-miss').count() === 0);
await pg.fill(P + '#encAdd', 'Wolf'); await pg.keyboard.press('Enter');
check('Add puts a new line in (Enter works too)', await pg.locator(P + '.enc-line').count() === 3);
await pg.fill(P + '#encAdd', 'Goblin Warrior'); await pg.click(P + '#encAddBtn');
check('adding one that is already there raises its number instead of doubling it', await pg.locator(P + '.enc-line').count() === 3 && (await pg.inputValue(P + '[data-encline="Goblin Warrior"] .enc-n')) === '6');
await pg.fill(P + '#encAdd', 'Zorblax the Unlisted'); await pg.click(P + '#encAddBtn');
check('a name that is not in the library is flagged but allowed', await pg.locator(P + '.enc-miss').count() === 1);
await pg.click(P + '[data-encremove="Zorblax the Unlisted"]');
await pg.fill(P + '#encName', 'Ambush at the ford');
await pg.click(P + '#encSave'); await sleep(250);
const b1 = await body();
check('Save writes the new name and creatures into the note', /\[!danger\]- Encounter: Ambush at the ford\n> - 6× Goblin Warrior\n> - 1× Ogre\n> - 1× Wolf/.test(b1), b1.slice(b1.indexOf('Ambush') - 40, b1.indexOf('Ambush') + 160));
check('the other encounter is untouched', /Encounter: The crypt door\n> - 2× Skeleton/.test(b1));
check('the editor closes and the card shows the new list', await pg.locator(P + '.enc-edit').count() === 0 && /6× Goblin Warrior, 1× Ogre, 1× Wolf/.test(await pg.textContent(P + '[data-enc="Ambush at the ford"]')));
check('the session is a pending change', (await pg.evaluate(() => window.__dmforge.S.working.list().length)) === 1);

/* run it: the edited numbers are what goes into combat */
await pg.click(row('Ambush at the ford') + '[data-run]'); await pg.waitForSelector('#combatBar, .combat-bar, [data-cb], .cb-row', { timeout: 5000 }).catch(() => {});
const inFight = await pg.evaluate(() => JSON.stringify(window.__dmforge.S.combat || {}).match(/Goblin/g)?.length || 0);
check('Run in Combat uses the edited numbers (6 goblins)', inFight >= 6, inFight);
await pg.evaluate(p => window.__dmforge.A.goto(p), sess); await pg.waitForSelector(P + '#encounters');

/* cancel and Escape change nothing */
const keep = await body();
await pg.click(row('The crypt door') + '[data-editenc]'); await pg.click(P + '[data-encplus="Skeleton"]'); await pg.click(P + '#encCancel'); await sleep(150);
check('Cancel throws the edit away', (await body()) === keep && await pg.locator(P + '.enc-edit').count() === 0);
await pg.click(row('The crypt door') + '[data-editenc]'); await pg.click(P + '[data-encplus="Skeleton"]'); await pg.focus(P + '#encName'); await pg.keyboard.press('Escape'); await sleep(150);
check('Escape does the same', (await body()) === keep && await pg.locator(P + '.enc-edit').count() === 0);

/* an encounter cannot be emptied by editing */
await pg.click(row('The crypt door') + '[data-editenc]'); await pg.click(P + '[data-encremove="Skeleton"]');
check('with no creatures left, Save is off', await pg.isDisabled(P + '#encSave'));
await pg.click(P + '#encCancel');
/* typing a number */
await pg.click(row('The crypt door') + '[data-editenc]');
await pg.fill(P + '[data-encline="Skeleton"] .enc-n', '12'); await pg.click(P + '#encSave'); await sleep(250);
check('typing a number works', /Encounter: The crypt door\n> - 12× Skeleton/.test(await body()));
/* undo through "Undo my edits" brings the original back */
await pg.click(P + '.unpushed-bar button:has-text("Undo my edits")'); await sleep(250);
const b3 = await body(); 
check('Undo my edits takes it all back (the whole session returns to what is in the vault)', !/Ambush at the ford/.test(b3) && !/12× Skeleton/.test(b3) && (await pg.evaluate(() => window.__dmforge.S.working.list().length)) === 0, b3.slice(0, 200));
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
