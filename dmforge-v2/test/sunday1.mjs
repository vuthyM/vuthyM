/* A whole game night, start to finish, on a big messy campaign, through the real helper and real files.
   Prep -> run a combat (three rounds, deaths, conditions, undo) -> log the evening -> push half way -> carry on -> close out
   with a stand-in for Claude -> push again. Then the files on disk are compared with what the app shows, and every file the
   night had no business touching is checked byte for byte. */
import path from 'node:path'; import fs from 'node:fs';
import * as K from './sunday-kit.mjs';
const { check, done } = K.makeChecker();
const { sleep } = K;

const tmp = K.tmpDir('dmf-sun1-');
const vault = path.join(tmp, 'Vault'); fs.mkdirSync(vault);
const made = K.bigVault(vault);
const C = made.campaign;
const SESSION = `${C}/Sessions/${made.play}.md`;
const THREAD = `${C}/Plot Threads/${made.threads[0]}.md`;
const THREAD_NAME = made.threads[0];
const NPC_A = made.npcs[5], NPC_B = made.npcs[9];

// a stand-in for Claude Code, so Close out can be tried without a login
const fake = path.join(tmp, 'claude');
fs.writeFileSync(fake, `#!/bin/bash
if [ "$1" = "--version" ]; then echo "9.9.9 (Fake Claude)"; exit 0; fi
if [ "$1" = "auth" ]; then echo '{"loggedIn": true}'; exit 0; fi
cat > "${path.join(tmp, 'last.txt')}"
sleep 1
echo '{"recap": "- The party met the hireling at the inn\\n- A fight on the road, one goblin fled", "threads": [{"name": ${JSON.stringify(THREAD_NAME)}, "status": "Active", "text": "A clue turned up at the ford"}], "npcs": [{"name": ${JSON.stringify(NPC_A)}, "status": "", "text": "Was seen at the ford"}], "next": ["Chase the goblin that fled"], "differences": []}'
`, { mode: 0o755 });

const before = K.snap(vault);
const h = await K.startHelper({ vault, tmp, env: { DMF_CLAUDE_BIN: fake } });
const b = await K.launch();
const t0 = Date.now();
const pg = await K.openApp(b, h, C);
const loadMs = Date.now() - t0;
const get = p => K.getNote(pg, p);
const comb = () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__dmforge.S.combat)));
const row = name => pg.locator('.c-row', { hasText: name });
const amt = async (name, n) => { await row(name).locator('input[aria-label^="Amount"]').fill(String(n)); };

/* ================= 1. the campaign opens ================= */
const counts = await pg.evaluate(() => { const i = window.__dmforge.getIndex(); return { n: i.byPath.size, npc: (i.byType.npc || []).length, pc: (i.byType.player || []).length, ses: (i.byType.session || []).length }; });
check('a big messy campaign opens (' + loadMs + ' ms)', counts.n > 250 && counts.pc === 4 && counts.ses === 31 && loadMs < 30000, JSON.stringify(counts) + ' ' + loadMs);
check('opening it changes nothing on disk', K.diffSnap(before, K.snap(vault)).same);
check('the awkward notes did not break the app (broken front matter, empty file, 200 KB note)', pg.errors.length === 0, pg.errors.join('\n'));
check('every awkward note can be opened', await pg.evaluate(async names => {
  const A = window.__dmforge.A, i = window.__dmforge.getIndex(); let bad = [];
  for (const n of names) { const note = i.resolve(n); if (!note) { bad.push('missing ' + n); continue; } try { A.goto(note.path); } catch (e) { bad.push(n + ': ' + e.message); } await new Promise(r => setTimeout(r, 60)); }
  return bad.length ? bad.join('; ') : true;
}, [...made.odd, ...made.broken]) === true);
await pg.evaluate(() => window.__dmforge.A.setSection('overview'));

/* ================= 2. prep ================= */
await pg.evaluate(p => window.__dmforge.A.goto(p), SESSION);
await pg.waitForSelector('#noteTitle');
check('the session to play opens', (await pg.textContent('#noteTitle')).includes('Session 31'));
await pg.evaluate(({ p, n }) => { const A = window.__dmforge.A; A.appendToPrep(p, '- Bring the lantern to [[' + n + ']]'); A.createNote('npc', 'Mock Hireling', { fm: { role: 'Hireling' }, body: '# Mock Hireling\n\nCreated while prepping.' }); A.setCurrentSession(p); }, { p: SESSION, n: NPC_A });
check('prep added a line and made a new NPC (two pending changes)', (await K.pendingCount(pg)) === 2 && (await get(SESSION)).includes('Bring the lantern'));
check('the session note kept its properties', (await get(SESSION)).startsWith('---\nnumber: 31\n'));

/* ================= 3. the party sits down: combat ================= */
await pg.click('.nav-btn:has-text("Combat")');
await pg.click('text=Start combat');
await pg.click('button:has-text("Add the party")');
await pg.waitForSelector('.c-row');
let st = await comb();
check('the four players come in with their stats from their notes', st.combatants.length === 4 && st.combatants.every(c => c.pc && c.maxHp > 20 && c.ac >= 12), JSON.stringify(st.combatants.map(c => [c.name, c.maxHp, c.ac])));
await pg.click('#addTabMonsters'); await pg.click('#openLibrary');
await pg.waitForSelector('#mlSearch');
await pg.waitForFunction(() => /\d+ of \d+/.test(document.querySelector('#mlCount').textContent), null, { timeout: 15000 });
for (const [q, key, n] of [['goblin', 'srd:goblin-warrior', 4], ['ogre', 'srd:ogre', 1]]) {
  await pg.fill('#mlSearch', q); await pg.click(`.ml-item[data-mon="${key}"]`); await pg.fill('#mlHowMany', String(n)); await pg.click('#mlAdd');
}
await pg.keyboard.press('Escape');
await pg.waitForFunction(() => !document.querySelector('#mlSearch'));
st = await comb();
check('five foes join: four goblins and an ogre, each with hit points and initiative', st.combatants.length === 9 && st.combatants.filter(c => !c.pc).every(c => c.maxHp > 0 && Number.isFinite(c.init)), JSON.stringify(st.combatants.map(c => [c.name, c.init])));
const orderBefore = st.combatants.map(c => c.init);
check('the order is highest initiative first', orderBefore.every((v, i) => i === 0 || orderBefore[i - 1] >= v), orderBefore.join());
check('the turn is on the top of the order, and round 1 until the fight starts', st.turn === 0 && st.round === 1);
await pg.waitForSelector('#nextTurn');
const names = st.combatants.map(c => c.name);

// three full rounds, with things happening
const goblins = names.filter(n => /^Goblin Warrior/.test(n));
let turns = 0;
const advance = async k => { for (let i = 0; i < k; i++) { await pg.click('#nextTurn'); turns++; await sleep(40); } };
await advance(1);
st = await comb();
check('pressing next opens the fight and the turn banner names who is up', /Round/.test(await pg.textContent('#combatTurn')) && (await pg.textContent('#combatTurn')).includes('’s turn'), await pg.textContent('#combatTurn'));
await advance(9);
st = await comb();
check('after one lap the round goes up to 2', st.round === 2, 'round ' + st.round);
await amt(goblins[0], 99); await row(goblins[0]).locator('button:has-text("Damage")').click();
await amt(goblins[1], 4); await row(goblins[1]).locator('button:has-text("Damage")').click();
await amt('Kestra Dune', 7); await row('Kestra Dune').locator('button:has-text("Damage")').click();
st = await comb();
check('a goblin down (0 hp), another hurt, a player hurt', st.combatants.find(c => c.name === goblins[0]).hp <= 0 && st.combatants.find(c => c.name === goblins[1]).hp < st.combatants.find(c => c.name === goblins[1]).maxHp && st.combatants.find(c => c.name === 'Kestra Dune').hp === 38 - 7);
await row('Bram Ironhollow').locator('[data-cond-btn], button:has-text("Condition")').first().click().catch(() => {});
await pg.keyboard.press('Escape');
await advance(9);
st = await comb();
check('round 3 reached, and a downed goblin is skipped or greyed, not removed', st.round === 3 && st.combatants.some(c => c.name === goblins[0]), 'round ' + st.round);
// the ogre drops a player to 0: death saves
await amt('Pip Underbough', 99); await row('Pip Underbough').locator('button:has-text("Damage")').click();
check('a player at 0 hp shows death saves', await row('Pip Underbough').locator('[data-death]').count() === 1);
await row('Pip Underbough').locator('[data-ds="success"]').click();
await amt('Sorrel Vance', 6); await row('Sorrel Vance').locator('button:has-text("Heal")').click();
check('a heal on a player at full hp does not go over the maximum', (await comb()).combatants.find(c => c.name === 'Sorrel Vance').hp <= 41);
// a slip: undo it
await pg.waitForTimeout(800);
await amt('Bram Ironhollow', 30); await row('Bram Ironhollow').locator('button:has-text("Damage")').click();
const bHp = (await comb()).combatants.find(c => c.name === 'Bram Ironhollow').hp;
await pg.click('#undoCombat');
check('Undo takes back a slip of the finger', (await comb()).combatants.find(c => c.name === 'Bram Ironhollow').hp === 52 && bHp === 22, 'after damage ' + bHp);
// the rest of the goblins fall, the fight ends
for (const g of goblins.slice(1)) { await amt(g, 99); await row(g).locator('button:has-text("Damage")').click(); }
const ogre = names.find(n => /^Ogre/.test(n));
await amt(ogre, 999); await row(ogre).locator('button:has-text("Damage")').click();
st = await comb();
check('every foe is down', st.combatants.filter(c => !c.pc).every(c => c.hp <= 0));
check('the combat log recorded the evening so far', (st.log || []).length >= 8, String((st.log || []).length));
const persisted = await pg.evaluate(() => Object.entries(localStorage).filter(([k]) => /combat/i.test(k)).length);
check('the fight is saved in the browser as it goes', persisted >= 1);
// save the log to the session
await pg.click('#tabLog');
await pg.selectOption('#clSession', SESSION);
await pg.click('#clSave');
await sleep(200);
const sessAfterCombat = await get(SESSION);
check('Save to session writes the combat summary and log into the session note', sessAfterCombat.includes('## Combat') && /dmforge:combat-/.test(sessAfterCombat));
await pg.click('#endCombat');
await pg.waitForSelector('#endCombatGo');
check('End combat offers the session the log was saved to (not an older one)', (await pg.inputValue('.modal select')) === SESSION, await pg.inputValue('.modal select'));
await pg.click('#endCombatGo');
await pg.waitForFunction(() => window.__dmforge.S.combat === null);
check('ending the fight clears it', (await comb()) === null);
check('ending it after saving does not write the combat block twice', ((await get(SESSION)).match(/dmforge:combat-[^ ]+ -->/g) || []).length === 1 || ((await get(SESSION)).match(/<!-- dmforge:combat-/g) || []).length === 1, ((await get(SESSION)).match(/<!-- dmforge:combat-/g) || []).length + ' blocks');

/* ================= 4. the log, through the island ================= */
await pg.keyboard.press('Alt+KeyL');
await pg.waitForSelector('#sessionLine');
const add = async (text, tagKey) => { await pg.fill('#sessionLine', text); if (tagKey) await pg.keyboard.press('Alt+Digit' + tagKey); await pg.keyboard.press('Enter'); await sleep(30); };
await add('The party reached the inn');
await pg.fill('#sessionLine', 'Met @' + NPC_A.split(' ')[0].slice(0, 4));
await pg.waitForSelector('#logMentions');
check('typing @ offers matching notes even in a campaign this size', await pg.locator('#logMentions .log-mention').count() >= 1);
await pg.keyboard.press('Escape');
await pg.fill('#sessionLine', 'Met [[' + NPC_A + ']] there');
await pg.keyboard.press('Enter');
await add('The hireling is lying about the road', 1);
await add('Found a silver ring on the goblin chief', 2);
await add('Agreed to escort the caravan', 3);
await add('Ruled: ladders cost half movement', 4);
await add('Promised to return the ring to its owner', 5);
await add('Who left the gate open at night?', 6);
await pg.fill('#sessionLine', 'A stranger called [[Zorp Newcomer');
await pg.waitForSelector('#logMentions [data-logcreate="npc"]');
await pg.click('#logMentions [data-logcreate="npc"]');
await pg.keyboard.press('Enter');
await sleep(150);
check('a name that is not a note is created as an NPC from the log box', (await K.getNote(pg, `${C}/NPCs/Zorp Newcomer.md`)) !== undefined);
await add('Unicode ☕ and “quotes” and [brackets] and 100% stay as typed');
await add('   leading and trailing spaces trimmed   ');
const logBlock = (await get(SESSION)).match(/<!-- dmforge:log -->([\s\S]*?)<!-- \/dmforge:log -->/);
const lines = logBlock ? logBlock[1].trim().split('\n') : [];
check('eleven lines are in the log, in the order they were typed, once each', lines.length === 11 && /reached the inn/.test(lines[0]) && /trimmed/.test(lines[10]), String(lines.length) + '\n' + lines.join('\n'));
check('tags are saved as #tags, and promises and hooks are tasks', lines.some(l => /#reveal/.test(l)) && lines.some(l => /^- \[ \] .*#promise/.test(l)) && lines.some(l => /^- \[ \] .*#hook/.test(l)), lines.join('\n'));
check('the odd characters survived exactly', lines.some(l => l.includes('Unicode ☕ and “quotes” and [brackets] and 100% stay as typed')));
await pg.click('#logUndo'); await pg.fill('#sessionLine', 'trimmed line again'); await pg.keyboard.press('Enter');
check('Undo last and re-adding does not duplicate or lose lines', (((await get(SESSION)).match(/<!-- dmforge:log -->([\s\S]*?)<!-- \/dmforge:log -->/) || [])[1] || '').trim().split('\n').length === 11);
await pg.keyboard.press('Escape');

// dice and the timer
await pg.click('#diceBtn'); await pg.waitForSelector('#diceBox');
await pg.fill('#diceExpr', '2d6+3'); await pg.keyboard.press('Enter'); await sleep(100);
await pg.fill('#diceExpr', 'd20+5'); await pg.keyboard.press('Enter');
await sleep(150);
check('the dice roller rolls an expression and keeps a history', /\d+/.test(await pg.textContent('#diceTotal')) && (await pg.locator('#diceHist > *').count()) >= 1);
await pg.keyboard.press('Escape');
await pg.click('#timerChip'); await pg.waitForSelector('#timerBox');
await pg.click('#timerToggle'); await sleep(1300);
check('the timer runs', /0:0[1-3]/.test(await pg.textContent('#timerBig')), await pg.textContent('#timerBig'));
await pg.click('#timerToggle'); await pg.keyboard.press('Escape');

/* ================= 5. push half way ================= */
const mid = K.diffSnap(before, K.snap(vault));
check('nothing reaches the vault until you push', mid.same);
const pendingBefore = await K.pendingCount(pg);
check('the Push button shows the count', new RegExp('Push ' + pendingBefore + ' change').test(await pg.textContent('#pushBtn')), await pg.textContent('#pushBtn'));
await K.pushAll(pg);
check('nothing is pending after a push', (await K.pendingCount(pg)) === 0);
let d = K.diffSnap(before, K.snap(vault));
check('exactly the right files changed: the session, plus two new NPCs', d.changed.length === 1 && d.changed[0] === SESSION && d.added.sort().join('|') === [`${C}/NPCs/Mock Hireling.md`, `${C}/NPCs/Zorp Newcomer.md`].sort().join('|') && !d.removed.length, JSON.stringify(d));
const onDisk = fs.readFileSync(path.join(vault, SESSION), 'utf8');
check('what is on disk is exactly what the app has', onDisk === await get(SESSION));
check('no temp files left in the vault', ![...K.snap(vault).keys()].some(k => /\.dmforge-.*\.tmp$/.test(k)));
check('the session note on disk still starts with its properties and keeps its prep', onDisk.startsWith('---\nnumber: 31\ndate:') && onDisk.includes('Ambush on the road') && onDisk.includes('Bring the lantern'));

/* ================= 6. keep playing, then close out ================= */
await pg.keyboard.press('Alt+KeyL'); await pg.waitForSelector('#sessionLine');
await add('After the break: the caravan left at dawn');
await add('The goblin that fled was seen at the ford', 5);
await pg.keyboard.press('Escape');
check('lines added after a push land in the same log block (still one block)', ((await get(SESSION)).match(/<!-- dmforge:log -->/g) || []).length === 1 && (await get(SESSION)).includes('caravan left at dawn'));
await pg.evaluate(p => window.__dmforge.A.goto(p), SESSION);
await pg.waitForSelector('#closeoutBtn');
await pg.evaluate(() => window.__dmforge.A.setClaudeOn(true));
await pg.click('#closeoutBtn'); await pg.waitForSelector('#coSend');
const facts = await pg.textContent('#coFacts');
check('Close out says how many lines it will read', /1[3-6] lines? in the session log/.test(facts), facts);
await pg.click('#coSend');
await pg.waitForFunction(() => /ready/.test((document.querySelector('#jobPill') || {}).textContent || ''), null, { timeout: 40000 });
await pg.click('#jobPill'); await pg.waitForSelector('#coReview');
check('the review offers the recap, the thread and the NPC', (await pg.inputValue('#coRecap')).includes('hireling') && await pg.locator('[data-co="threads"] li').count() >= 1);
await pg.click('#coApply'); await pg.waitForFunction(() => !document.querySelector('.modal'));
let sess = await get(SESSION);
check('the recap, the carry-over and the thread update are written', sess.includes('## DM recap') && sess.includes('Chase the goblin that fled') && (await get(THREAD)).includes('A clue turned up at the ford'));
check('the log lines are all still there after closing out', ['reached the inn', 'caravan left at dawn', 'fled was seen'].every(s => sess.includes(s)));
await K.pushAll(pg);
d = K.diffSnap(before, K.snap(vault));
const npcAPath = await pg.evaluate(n => window.__dmforge.getIndex().resolve(n).path, NPC_A);
check('after the second push: the session, the thread and the NPC Claude updated changed, two NPCs were added, and nothing else', d.changed.sort().join('|') === [SESSION, THREAD, npcAPath].sort().join('|') && d.added.length === 2 && !d.removed.length, JSON.stringify(d));
check('the awkward notes are byte for byte untouched (CRLF, broken front matter, empty, 200 KB)', ['CRLF Carl', 'Broken Barnaby', 'Empty Edna', 'Giant Gwen', 'Tabbed Tilly', 'No Frontmatter Nell'].every(n => before.get(`${C}/NPCs/${n}.md`) === K.snap(vault).get(`${C}/NPCs/${n}.md`)));
check('the other folders (Archive, Templates, Work, .obsidian) are untouched', [...before.keys()].filter(k => /^(Archive|Templates|Work|\.obsidian)\//.test(k)).every(k => before.get(k) === K.snap(vault).get(k)));

/* ================= 7. reopen: the disk and the app agree ================= */
const diskSession = fs.readFileSync(path.join(vault, SESSION), 'utf8');
const pg2 = await K.openApp(b, h, C);
const reloaded = await pg2.evaluate(p => window.__dmforge.S.working.get(p), SESSION);
check('opening the campaign again shows exactly what was pushed', reloaded === diskSession);
check('and the evening is complete in it (13+ log lines, combat block, recap, carry-over)', (diskSession.match(/^- (\[.\] )?\d\d:\d\d /gm) || []).length >= 13 && diskSession.includes('## Combat') && diskSession.includes('## DM recap') && diskSession.includes('## Next time'));
const info = await (await h.api('undo-info', '')).json();
check('the helper kept the last pushes so they can be undone', info && (info.pushes ? info.pushes.length : info.length || info.id || info.count) >= 1, JSON.stringify(info).slice(0, 200));
check('no errors in the page all night', pg.errors.length === 0 && pg2.errors.length === 0, pg.errors.concat(pg2.errors).join('\n'));
const heap = await pg.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0));
check('the page is not bloated after the night (under 400 MB of memory)', heap < 400, Math.round(heap) + ' MB');

await b.close(); await h.stop(); K.rm(tmp);
process.exit(done());
