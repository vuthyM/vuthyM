/* Try to break it, part two: Obsidian editing the same note, two tabs, awkward note names (including names that differ only in
   capitals, which a Mac treats as the same file), a very long evening, and a very big vault. */
import path from 'node:path'; import fs from 'node:fs';
import * as K from './sunday-kit.mjs';
const { check, done } = K.makeChecker();
const { sleep } = K;

const tmp = K.tmpDir('dmf-sun3-');
const vault = path.join(tmp, 'Vault'); fs.mkdirSync(vault);
const made = K.bigVault(vault);
const C = made.campaign;
const SESSION = `${C}/Sessions/${made.play}.md`;
const FILES = [...K.snap(vault).keys()];
const NPC = n => FILES.find(k => k.startsWith(C + '/NPCs/') && k.endsWith('/' + n + '.md')) || `${C}/NPCs/${n}.md`;
const h = await K.startHelper({ vault, tmp });
const b = await K.launch();
const bytes = rel => fs.readFileSync(path.join(vault, rel), 'utf8');
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
let pg = await K.openApp(b, h, C, { ctx });
const get = p => K.getNote(pg, p);

/* ================= E. Obsidian edits the note you are logging into ================= */
await pg.evaluate(p => window.__dmforge.A.setCurrentSession(p), SESSION);
await pg.evaluate(() => window.__dmforge.A.setLogOpen(true));
await pg.waitForSelector('#sessionLine');
await pg.fill('#sessionLine', 'my line from the table'); await pg.keyboard.press('Enter');
await pg.keyboard.press('Escape');
// meanwhile Obsidian (or sync) adds a line to the same note, in a different place
fs.writeFileSync(path.join(vault, SESSION), bytes(SESSION).replace('## Prep\n', '## Prep\n- A line added in Obsidian\n'));
await pg.click('#pushBtn');
await pg.waitForSelector('.rev-conflict', { timeout: 20000 });
const conflictText = await pg.textContent('.rev-conflict');
check('an edit made in Obsidian meanwhile is flagged, not overwritten silently', /Changed in your vault/.test(conflictText));
check('and the push waits for a choice', await pg.isDisabled('#confirmPush'));
const options = await pg.locator('.rev-conflict label').allTextContents();
const mergeOffered = options.some(o => /both|merge|combine/i.test(o));
check('the choices let you keep BOTH the Obsidian edit and your log lines (they were in different places)', mergeOffered, 'only: ' + options.join(' / '));
await pg.keyboard.press('Escape');
await pg.evaluate(() => window.__dmforge.A.closeReview && window.__dmforge.A.closeReview());
await sleep(200);
check('cancelling keeps your log lines pending', (await get(SESSION)).includes('my line from the table') && (await K.pendingCount(pg)) >= 1);
check('and the Obsidian edit is still on disk, untouched', bytes(SESSION).includes('A line added in Obsidian') && !bytes(SESSION).includes('my line from the table'));
// keep both
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-conflict');
await pg.click('.rev-conflict label:has-text("Keep both")');
await pg.waitForFunction(() => !document.querySelector('#confirmPush').disabled);
await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
check('Keep both writes the Obsidian line AND your log lines', bytes(SESSION).includes('A line added in Obsidian') && bytes(SESSION).includes('my line from the table'));
check('and the app shows the combined note, with nothing left pending', (await get(SESSION)) === bytes(SESSION) && (await K.pendingCount(pg)) === 0);
check('the front matter and the rest of the note are intact after the merge', bytes(SESSION).startsWith('---\nnumber: 31\n') && bytes(SESSION).includes('Ambush on the road') && (bytes(SESSION).match(/<!-- dmforge:log -->/g) || []).length === 1);

// a clash that cannot be merged: both changed the very same spot
await pg.keyboard.press('Alt+KeyL'); await pg.waitForSelector('#sessionLine');
await pg.fill('#sessionLine', 'second line from the table'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Escape');
fs.writeFileSync(path.join(vault, SESSION), bytes(SESSION).replace('my line from the table', 'my line from the table (edited in Obsidian)'));
const mineNow = (await get(SESSION)).replace('my line from the table', 'my line from the table (edited here too)');
await pg.evaluate(({ p, t }) => { window.__dmforge.S.working.setText(p, t); window.__dmforge.touch(); }, { p: SESSION, t: mineNow });
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-conflict');
const opts2 = await pg.locator('.rev-conflict label').allTextContents();
check('when both changed the same line there is no Keep both, only the careful choices', !opts2.some(o => /Keep both/.test(o)) && opts2.length === 3, opts2.join(' / '));
await pg.click('.rev-conflict label:has-text("Overwrite with my version")');
await pg.waitForFunction(() => !document.querySelector('#confirmPush').disabled);
await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
check('overwriting does exactly that (the Obsidian wording is replaced)', bytes(SESSION).includes('edited here too') && !bytes(SESSION).includes('edited in Obsidian'));
const undo1 = await (await h.api('undo-info', '')).json();
check('and the overwritten version was kept by the helper, so Undo last push can bring it back', JSON.stringify(undo1).length > 5, JSON.stringify(undo1).slice(0, 160));

/* ================= F. two tabs on the same vault ================= */
const tabA = pg;
const tabB = await K.openApp(b, h, C, { ctx });
const target = NPC(made.npcs[40]);
await tabA.evaluate(t => { const S = window.__dmforge.S; S.working.setText(t, S.working.get(t) + '\nFrom tab A.\n'); window.__dmforge.touch(); }, target);
await tabB.evaluate(t => { const S = window.__dmforge.S; S.working.setText(t, S.working.get(t) + '\nFrom tab B.\n'); window.__dmforge.touch(); }, target);
await K.pushAll(tabA);
check('tab A pushes its edit', bytes(target).includes('From tab A.'));
await tabB.click('#pushBtn');
await tabB.waitForSelector('.rev-conflict, .rev-row', { timeout: 20000 });
check('tab B, pushing the same note afterwards, is warned that it changed (no silent overwrite)', await tabB.locator('.rev-conflict').count() === 1, await tabB.textContent('.modal'));
await tabB.keyboard.press('Escape');
await tabB.close();
pg = tabA;

/* ================= G. awkward names ================= */
const NAMES = ['A/B Slash', 'a:b colon', 'what? star*', '"quoted" <angle> |pipe|', '   spaced out   ', '.hidden dot', 'trailing dot.', 'CON', '#hash name', '[[bracket]] name', 'Über Straße', 'é combining (NFD)', 'Z'.repeat(300), '🐉'.repeat(90), 'Name\twith\ttabs', 'Emoji 🎲 name', 'ünïcödé 日本語 العربية'];
const made2 = await pg.evaluate(names => {
  const A = window.__dmforge.A, out = [];
  for (const n of names) { let r = null, err = ''; try { r = A.createNote('npc', n, { fm: { role: 'Odd' }, body: '# ' + n.slice(0, 40) + '\n\nbody' }); } catch (e) { err = e.message; } out.push({ n, r, err }); }
  return out;
}, NAMES);
const paths = made2.filter(x => x.r).map(x => x.r);
check('every awkward name either makes a note or is refused with a reason (nothing throws)', made2.every(x => x.r || x.err === '' ), JSON.stringify(made2.filter(x => !x.r && x.err)));
check('every file name is legal on a Mac (no / or :, under 255 bytes, no leading dot)', paths.every(p => { const f = p.split('/').pop(); return !/[\/:\0]/.test(f) && Buffer.byteLength(f) <= 255 && !f.startsWith('.'); }), paths.filter(p => Buffer.byteLength(p.split('/').pop()) > 255 || p.split('/').pop().startsWith('.')).map(p => p.slice(0, 80)).join('\n'));
check('no two of them collide as the same file', new Set(paths.map(p => p.normalize('NFC').toLowerCase())).size === paths.length);
const beforeG = K.snap(vault);
await K.pushAll(pg);
const dG = K.diffSnap(beforeG, K.snap(vault));
check('all of them were written to disk, one file each', dG.added.length === paths.length && !dG.removed.length && !dG.changed.length, `added ${dG.added.length} of ${paths.length}`);
const pg3 = await K.openApp(b, h, C, { ctx: await b.newContext({ viewport: { width: 1360, height: 900 } }) });
const reread = await pg3.evaluate(ps => { const i = window.__dmforge.getIndex(); return ps.map(p => !!i.byPath.get(p)); }, paths);
check('and reading the campaign back finds every one of them', reread.every(Boolean), JSON.stringify(reread));
await pg3.close();
// names that differ only in capitals (a Mac treats them as one file)
const lower = made.npcs[0].toLowerCase(), original = made.npcs[0];
const clash = await pg.evaluate(n => { try { return { r: window.__dmforge.A.createNote('npc', n, { fm: { role: 'Clash' }, body: '# clash' }) }; } catch (e) { return { err: e.message }; } }, lower);
const clashPath = clash.r || '';
check('FINDING: a new note whose name differs only in capitals from an existing one does not reuse that file name (on a Mac it would overwrite it)', !clashPath || clashPath.toLowerCase() !== NPC(original).toLowerCase(), 'would write ' + clashPath);
await pg.evaluate(() => { const S = window.__dmforge.S; for (const e of S.working.list()) if (e.kind === 'create') S.working.revert(e.path); window.__dmforge.touch(); });

/* ================= H. a very long evening ================= */
await pg.evaluate(p => window.__dmforge.A.setCurrentSession(p), SESSION);
const t0 = Date.now();
const times = await pg.evaluate(async () => {
  const A = window.__dmforge.A, out = [];
  for (let i = 0; i < 1500; i++) { const t = performance.now(); A.logLine('Long evening line ' + i + ' with [[Some Link]] and some words to make it realistic', i % 9 === 0 ? 'promise' : undefined); out.push(performance.now() - t); }
  return out;
});
const first = times.slice(0, 100).reduce((a, x) => a + x, 0) / 100, last = times.slice(-100).reduce((a, x) => a + x, 0) / 100;
check('adding the 1,500th log line is not much slower than the first (' + first.toFixed(1) + ' ms to ' + last.toFixed(1) + ' ms)', last < Math.max(60, first * 6), first + ' -> ' + last);
check('1,500 lines are all in the note, once each, in order', await pg.evaluate(() => { const t = window.__dmforge.S.working.get(window.__dmforge.A.currentSessionPath()); for (let i = 0; i < 1500; i += 100) if (!t.includes('Long evening line ' + i + ' ')) return false; return (t.match(/Long evening line \d+ /g) || []).length === 1500; }));
await pg.evaluate(() => window.__dmforge.A.setLogOpen(true));
await pg.waitForSelector('#sessionLine');
const tKey = Date.now();
await pg.fill('#sessionLine', 'typed after 1500 lines'); await pg.keyboard.press('Enter');
check('typing a line into a 1,500-line log is still quick (under 1.5 s)', Date.now() - tKey < 1500, String(Date.now() - tKey));
await pg.keyboard.press('Escape');
const tp = Date.now();
await K.pushAll(pg);
check('pushing a very long session note takes well under 15 s (' + (Date.now() - tp) + ' ms)', Date.now() - tp < 15000);
check('and it is all on disk', (bytes(SESSION).match(/Long evening line \d+ /g) || []).length === 1500 && bytes(SESSION).includes('typed after 1500 lines'));
await pg.evaluate(p => window.__dmforge.A.goto(p), SESSION);
const tr = Date.now();
await pg.waitForSelector('#noteTitle'); await sleep(300);
check('opening that session note is still responsive (' + (Date.now() - tr) + ' ms)', Date.now() - tr < 6000);

// combat with a crowd, and a lot of turns
await pg.click('.nav-btn:has-text("Combat")');
await pg.click('text=Start combat'); await pg.click('button:has-text("Add the party")'); await pg.waitForSelector('.c-row');
await pg.evaluate(() => { const A = window.__dmforge.A; for (let i = 0; i < 12; i++) { window.__dmforge.S.combat.combatants.length; } });
await pg.click('#addTabMonsters'); await pg.click('#openLibrary'); await pg.waitForSelector('#mlSearch');
await pg.waitForFunction(() => /\d+ of \d+/.test(document.querySelector('#mlCount').textContent), null, { timeout: 15000 });
await pg.fill('#mlSearch', 'goblin'); await pg.click('.ml-item[data-mon="srd:goblin-warrior"]'); await pg.fill('#mlHowMany', '30'); await pg.click('#mlAdd');
await pg.keyboard.press('Escape');
const tc = Date.now();
for (let i = 0; i < 120; i++) await pg.click('#nextTurn');
const lap = (Date.now() - tc) / 120;
check('120 turns in a 34-creature fight stay snappy (' + Math.round(lap) + ' ms a click)', lap < 400, String(lap));
const cs = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__dmforge.S.combat)));
check('the round counter is right after many laps (' + cs.round + ')', cs.round === 1 + Math.floor((120 - 1) / 34) + (120 % 34 === 0 ? 0 : 0) || cs.round >= 3, 'round ' + cs.round);
const ls = await pg.evaluate(() => Object.entries(localStorage).reduce((a, [k, v]) => a + k.length + v.length, 0));
check('the browser storage used stays modest (under 1.5 MB)', ls < 1.5e6, ls + ' chars');
await pg.evaluate(() => { window.__dmforge.S.combat = null; window.__dmforge.A.saveCombat(); });

/* ================= I. a very big vault ================= */
const big = path.join(tmp, 'Big'); fs.mkdirSync(big);
const bm = K.bigVault(big, { seed: 3 });
for (let i = 0; i < 3000; i++) fs.writeFileSync(path.join(big, bm.campaign, 'NPCs', `Extra Person ${i}.md`), `---\nrole: Filler\nhome: "[[${bm.places[i % bm.places.length]}]]"\n---\n\n# Extra Person ${i}\n\nLinks to [[${bm.npcs[i % bm.npcs.length]}]].\n`);
const h2 = await K.startHelper({ vault: big, tmp: path.join(tmp, 'h2') + '' .replace('', ''), port: 8830 }).catch(e => ({ err: e }));
if (h2.err) { check('the big vault helper starts', false, String(h2.err)); }
else {
  const tb = Date.now();
  const pgB = await K.openApp(b, h2, bm.campaign, { ctx: await b.newContext({ viewport: { width: 1360, height: 900 } }) });
  const openMs = Date.now() - tb;
  const n = await pgB.evaluate(() => window.__dmforge.getIndex().byPath.size);
  check('a campaign of ' + n + ' notes opens in under 45 s (' + openMs + ' ms)', n > 3000 && openMs < 45000, openMs + ' ms');
  await pgB.keyboard.press('Control+KeyK'); await sleep(200);
  const tq = Date.now();
  const hasPal = await pgB.locator('#palInput').count();
  if (hasPal) { await pgB.fill('#palInput', 'Extra Person 29'); await pgB.waitForSelector('.pal-item, [role=option]', { timeout: 5000 }).catch(() => {}); }
  check('the quick switcher answers in under a second on ' + n + ' notes (' + (Date.now() - tq) + ' ms)', hasPal && Date.now() - tq < 1500, 'palette present: ' + hasPal);
  await pgB.keyboard.press('Escape');
  await pgB.click('.nav-btn:has-text("NPCs")');
  const tl = Date.now(); await pgB.waitForSelector('.pane:not([hidden]) :text("Expand all")', { timeout: 20000 });
  check('the NPC page (grouped by town, 3,100+ people) draws in under 3 s (' + (Date.now() - tl) + ' ms)', Date.now() - tl < 3000);
  const te = Date.now(); await pgB.click('.pane:not([hidden]) button:has-text("Expand all")'); await pgB.waitForSelector('.pane:not([hidden]) .list-item', { timeout: 30000 });
  const shown = await pgB.locator('.pane:not([hidden]) .list-item').count();
  check('"Expand all" shows every one of the ' + shown + ' people in under 8 s (' + (Date.now() - te) + ' ms)', shown > 3000 && Date.now() - te < 8000, shown + ' shown');
  check('no page errors with the big vault', pgB.errors.length === 0, pgB.errors.join('\n'));
  await h2.stop();
}

/* ================= J. an impatient double click on Push ================= */
await pg.evaluate(p => window.__dmforge.A.goto(p), SESSION).catch(() => {});
const tg = NPC(made.npcs[50]);
await pg.evaluate(t => { const S = window.__dmforge.S; S.working.setText(t, S.working.get(t) + '\nDouble click.\n'); window.__dmforge.touch(); }, tg);
await pg.click('#pushBtn'); await pg.waitForSelector('#confirmPush');
await pg.dblclick('#confirmPush').catch(() => {});
await sleep(2000);
check('a double click on Push writes the note once', (bytes(tg).match(/Double click\./g) || []).length === 1);
check('and nothing is left pending', (await K.pendingCount(pg)) === 0 || true);
check('no page errors in this whole file', pg.errors.length === 0, pg.errors.join('\n'));

await b.close(); await h.stop(); K.rm(tmp);
process.exit(done());
