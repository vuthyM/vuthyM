/* Try to break it: the things that go wrong on a real night. Refresh and crash with work unsaved, the helper stopping, a push that
   half fails, Obsidian editing the same note, two tabs, awkward names, a very long evening. Each case checks that the app
   copes, says what happened, and never loses or corrupts a note it was not meant to touch. */
import path from 'node:path'; import fs from 'node:fs';
import * as K from './sunday-kit.mjs';
const { check, done } = K.makeChecker();
const { sleep } = K;

const tmp = K.tmpDir('dmf-sun2-');
const vault = path.join(tmp, 'Vault'); fs.mkdirSync(vault);
const made = K.bigVault(vault);
const C = made.campaign;
const SESSION = `${C}/Sessions/${made.play}.md`;
const FILES = [...K.snap(vault).keys()];
const NPC = n => FILES.find(k => k.startsWith(C + '/NPCs/') && k.endsWith('/' + n + '.md')) || `${C}/NPCs/${n}.md`;
const h = await K.startHelper({ vault, tmp });
const b = await K.launch();
const bytes = rel => fs.readFileSync(path.join(vault, rel), 'utf8');

/* a page that remembers what the browser asked about leaving */
async function page(ctx) {
  const pg = await K.openApp(b, h, C, { ctx });
  pg.dialogs = [];
  pg.on('dialog', d => { pg.dialogs.push(d.type()); d.accept().catch(() => {}); });
  return pg;
}
const ctx1 = await b.newContext({ viewport: { width: 1360, height: 900 } });
let pg = await page(ctx1);
const get = p => K.getNote(pg, p);
const comb = () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__dmforge.S.combat)));

/* ================= A. refresh in the middle of a fight ================= */
await pg.click('.nav-btn:has-text("Combat")');
await pg.click('text=Start combat');
await pg.click('button:has-text("Add the party")');
await pg.waitForSelector('.c-row');
await pg.click('#addTabMonsters'); await pg.click('#openLibrary'); await pg.waitForSelector('#mlSearch');
await pg.waitForFunction(() => /\d+ of \d+/.test(document.querySelector('#mlCount').textContent), null, { timeout: 15000 });
await pg.fill('#mlSearch', 'goblin'); await pg.click('.ml-item[data-mon="srd:goblin-warrior"]'); await pg.fill('#mlHowMany', '3'); await pg.click('#mlAdd');
await pg.keyboard.press('Escape');
for (let i = 0; i < 12; i++) { await pg.click('#nextTurn'); await sleep(30); }
const row = name => pg.locator('.c-row', { hasText: name });
await row('Kestra Dune').locator('input[aria-label^="Amount"]').fill('9'); await row('Kestra Dune').locator('button:has-text("Damage")').click();
await row('Kestra Dune').locator('.c-note').fill('Concentrating on Bless');
await sleep(300);
const fight = await comb();
check('a fight is under way (round 2 or later, a player hurt, a note on them)', fight.round >= 2 && fight.combatants.find(c => c.name === 'Kestra Dune').hp === 29, 'round ' + fight.round);
await pg.reload();
await pg.waitForSelector('.sidebar', { timeout: 30000 });
await sleep(500);
const back = await comb();
check('after a refresh the fight is exactly as it was (round, turn, hit points, notes, log)', JSON.stringify(back) === JSON.stringify(fight), back ? 'round ' + back.round + ' turn ' + back.turn : 'gone');
await pg.click('.nav-btn:has-text("Combat")');
check('and the Combat page shows it, with the turn banner', await pg.locator('.c-row').count() === 7 && /Round \d+/.test(await pg.textContent('#combatTurn')));
await pg.click('#nextTurn');
check('and you can carry on from it', (await comb()).turn !== fight.turn || (await comb()).round !== fight.round);
await pg.evaluate(() => { window.__dmforge.S.combat = null; window.__dmforge.A.saveCombat(); });

/* ================= B. closing the tab, or the browser crashing, with unpushed work ================= */
await pg.evaluate(p => { const A = window.__dmforge.A; A.setCurrentSession(p); }, SESSION);
await pg.evaluate(() => window.__dmforge.A.setLogOpen(true));
await pg.waitForSelector('#sessionLine');
for (const t of ['one', 'two', 'three']) { await pg.fill('#sessionLine', 'line ' + t); await pg.keyboard.press('Enter'); }
check('three lines logged, none pushed', (await K.pendingCount(pg)) === 1 && (await get(SESSION)).includes('line three'));
const leaveAsks = () => pg.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
check('leaving the page with unpushed work asks first', await leaveAsks());
await sleep(700);                                              // the working copy is saved to the browser a moment after each change
await pg.close();                                              // the tab goes away without asking: a crash
pg = await page(ctx1);                                         // the same browser profile, as Brave would be
await sleep(600);
let afterCrash = await get(SESSION);
check('after a crash the unpushed log lines are restored when you come back', afterCrash.includes('line one') && afterCrash.includes('line two') && afterCrash.includes('line three'), 'they are gone');
check('and it says it restored them', /Restored \d+ unpushed change/.test(await pg.evaluate(() => document.querySelector('.toasts') ? document.querySelector('.toasts').innerText : '')) || (await K.pendingCount(pg)) === 1);
check('nothing was written to the vault by getting them back', !bytes(SESSION).includes('line one'));
await K.pushAll(pg);
check('and they can be pushed', bytes(SESSION).includes('line one') && bytes(SESSION).includes('line three'));
check('with nothing pending, leaving the page does not nag', !(await leaveAsks()));

/* ================= C. the helper stops, then comes back ================= */
await pg.evaluate(p => window.__dmforge.A.setCurrentSession(p), SESSION);
await pg.evaluate(() => window.__dmforge.A.setLogOpen(true));
await pg.waitForSelector('#sessionLine');
await pg.fill('#sessionLine', 'logged while the helper was alive'); await pg.keyboard.press('Enter');
await h.kill();
await pg.fill('#sessionLine', 'logged while the helper was down'); await pg.keyboard.press('Enter');
check('with the helper stopped, you can still keep logging', (await get(SESSION)).includes('while the helper was down'));
await pg.keyboard.press('Escape');
await pg.click('#pushBtn').catch(() => {});
await sleep(1500);
const seen = () => pg.evaluate(() => ({ count: window.__dmforge.S.working.count, text: [...document.querySelectorAll('.modal, .toasts')].map(e => e.innerText).join(' | ').slice(0, 500) }));
let st1 = await seen();
check('a push with the helper down keeps the pending changes', st1.count >= 1, JSON.stringify(st1));
check('and tells you the helper cannot be reached, not that your note is gone', /cannot reach|can.?t reach|helper/i.test(st1.text) && !/No longer exists/i.test(st1.text), st1.text);
check('and tells you your changes are kept', /kept|come back|still here/i.test(st1.text), st1.text);
await h.restart();
await sleep(400);
await pg.click('#pushBtn').catch(() => {});
await sleep(2000);
const st2 = await seen();
check('after the helper is started again, the old page says what to do (it has the wrong token now)', /out of date|link|started again|reload/i.test(st2.text) && !/No longer exists/i.test(st2.text), st2.text);
check('and nothing was written meanwhile', !bytes(SESSION).includes('while the helper was down'));
await sleep(500);
await pg.close();
pg = await K.openApp(b, h, C, { ctx: ctx1 });                  // the new link
await sleep(600);
check('opening the new link brings the unpushed lines back', (await get(SESSION)).includes('while the helper was down') && (await get(SESSION)).includes('while the helper was alive'));
await K.pushAll(pg);
check('and they push fine', bytes(SESSION).includes('while the helper was down'));
await pg.close();

/* ================= D. a path that is taken by something that is not a note, and a write that fails half way ================= */
pg = await page(ctx1);
const goodA = NPC(made.npcs[20]), goodB = NPC(made.npcs[21]);
fs.mkdirSync(path.join(vault, C, 'NPCs', 'Blocked Bob.md'));                 // a folder where a note is about to go
await pg.evaluate(({ a, b2 }) => {
  const A = window.__dmforge.A, S = window.__dmforge.S;
  S.working.setText(a, S.working.get(a) + '\nEdit one.\n'); S.working.setText(b2, S.working.get(b2) + '\nEdit two.\n');
  A.createNote('npc', 'Blocked Bob', { fm: { role: 'Blocked' }, body: '# Blocked Bob\n' });
  window.__dmforge.touch();
}, { a: goodA, b2: goodB });
{ const n = await pg.evaluate(() => ({ c: window.__dmforge.S.working.count, l: window.__dmforge.S.working.list().map(e => e.kind + ' ' + e.path) })); check('three changes are waiting', n.c === 3, JSON.stringify(n)); }
await pg.click('#pushBtn');
await pg.waitForSelector('.rev-row, .rev-conflict', { timeout: 20000 });
const revText = await pg.textContent('.modal');
check('the review flags the note whose place is taken, rather than failing or hiding it', await pg.locator('.rev-conflict').count() >= 1 && /Blocked Bob/.test(revText), revText.slice(0, 300));
check('and it cannot be pushed until you choose', await pg.isDisabled('#confirmPush'));
await pg.evaluate(() => window.__dmforge.A.resolveAll('mine'));
await pg.waitForFunction(() => !document.querySelector('#confirmPush').disabled);
await pg.click('#confirmPush');
await pg.waitForSelector('text=Pushed to your vault', { timeout: 30000 });
await pg.click('text=Done');
check('choosing to keep both writes it under another name, beside the folder', bytes(`${C}/NPCs/Blocked Bob 2.md`).includes('Blocked Bob') && fs.statSync(path.join(vault, C, 'NPCs', 'Blocked Bob.md')).isDirectory());
check('and the two edits were written', bytes(goodA).endsWith('Edit one.\n') && bytes(goodB).endsWith('Edit two.\n'));

// a write that fails after the review was shown: the note is swapped for a folder behind the app's back
const goodC = NPC(made.npcs[30]), goodD = NPC(made.npcs[31]);
await pg.evaluate(({ c, d }) => { const S = window.__dmforge.S; S.working.setText(c, S.working.get(c) + '\nEdit three.\n'); S.working.setText(d, S.working.get(d) + '\nEdit four.\n'); window.__dmforge.touch(); }, { c: goodC, d: goodD });
const before2 = K.snap(vault);
await pg.click('#pushBtn'); await pg.waitForSelector('#confirmPush', { timeout: 20000 });
const fullD = path.join(vault, goodD);
fs.rmSync(fullD); fs.mkdirSync(fullD);                                         // now it cannot be written
await pg.click('#confirmPush');
await sleep(2500);
const res = await pg.evaluate(() => ({ count: window.__dmforge.S.working.count, text: [...document.querySelectorAll('.modal, .toasts')].map(e => e.innerText).join(' | ').slice(0, 700) }));
check('the note that could be written was written', bytes(goodC).endsWith('Edit three.\n'));
check('the one that failed is still pending, not silently dropped', res.count === 1 && (await pg.evaluate(p => window.__dmforge.S.working.get(p), goodD)).endsWith('Edit four.\n'), JSON.stringify(res));
check('the report names the note that failed and says it did not go', new RegExp(made.npcs[31]).test(res.text) && /fail|could not|couldn.?t|error|not written|problem|not pushed/i.test(res.text), res.text);
check('no temp files were left behind', ![...K.snap(vault).keys()].some(k => /\.dmforge-.*\.tmp$/.test(k)));
const d2 = K.diffSnap(before2, K.snap(vault));
check('nothing else in the vault changed', d2.changed.join('|') === goodC && d2.removed.join('|') === goodD && d2.added.length === 0, JSON.stringify(d2));
await pg.keyboard.press('Escape');
check('no page errors in the whole run', pg.errors.length === 0, pg.errors.join('\n'));
await pg.close();

await b.close(); await h.stop(); K.rm(tmp);
process.exit(done());
