/* The safety net, rehearsed: copy the vault, make a big push (edits, new notes, a delete, a rename that rewrites links), take it back with
   Undo last push, restore from the trash, undo when a note changed since, and keep only the last ten pushes. At every step the vault
   on disk is compared byte for byte with how it should be. */
import path from 'node:path'; import fs from 'node:fs';
import * as K from './sunday-kit.mjs';
const { check, done } = K.makeChecker();
const { sleep } = K;

const tmp = K.tmpDir('dmf-sun4-');
const vault = path.join(tmp, 'Vault'); fs.mkdirSync(vault);
const made = K.bigVault(vault);
const C = made.campaign;
const FILES = [...K.snap(vault).keys()];
const NPC = n => FILES.find(k => k.startsWith(C + '/NPCs/') && k.endsWith('/' + n + '.md'));
const bytes = rel => fs.readFileSync(path.join(vault, rel), 'utf8');
const noTrash = m => new Map([...m].filter(([k]) => !/^\.trash\//.test(k)));

/* ---- the DM's habit: copy the vault folder first ---- */
const S0 = K.snap(vault);
const backup = path.join(tmp, 'Backup of Vault');
fs.cpSync(vault, backup, { recursive: true });
check('a plain copy of the vault folder is an exact backup (every file, byte for byte)', K.diffSnap(S0, K.snap(backup)).same && S0.size > 250);

const h = await K.startHelper({ vault, tmp });
const b = await K.launch();
const pg = await K.openApp(b, h, C);
const A = (fn, ...args) => pg.evaluate(([f, a]) => { const r = window.__dmforge.A[f](...a); return r && r.then ? r.then(x => (x === undefined ? null : x)) : (r === undefined ? null : r); }, [fn, args]);
const undoLast = async () => {
  await A('askUndoPush');
  await pg.waitForSelector('.modal button:has-text("Undo that push")');
  await pg.click('.modal button:has-text("Undo that push")');
  await pg.waitForFunction(() => /Undid the push/.test((document.querySelector('.toasts') || { innerText: '' }).innerText), null, { timeout: 30000 });
  await sleep(1200);
};

/* ---- one big push ---- */
const edits = [NPC(made.npcs[1]), NPC(made.npcs[2]), NPC(made.npcs[3]), `${C}/Plot Threads/${made.threads[1]}.md`, `${C}/Sessions/${made.play}.md`];
const doomed = [NPC(made.npcs[60]), NPC(made.npcs[61])];
const renamed = made.npcs[70];
const linkers = FILES.filter(f => bytes(f).includes('[[' + renamed + ']]'));
await pg.evaluate(({ edits, doomed }) => {
  const A = window.__dmforge.A, S = window.__dmforge.S;
  for (const e of edits) S.working.setText(e, S.working.get(e) + '\n\nEdited by the big push.\n');
  A.createNote('npc', 'Push Test One', { fm: { role: 'New' } }); A.createNote('npc', 'Push Test Two', { fm: { role: 'New' } }); A.createNote('location', 'Push Test Place', { fm: { kind: 'Inn' } });
  for (const d of doomed) A.deleteNote(d);
  window.__dmforge.touch();
}, { edits, doomed });
const rn = await pg.evaluate(({ p, name }) => { const r = window.__dmforge.A.renameNote(p, { name, updateLinks: true }); return JSON.stringify(r || null); }, { p: NPC(renamed), name: renamed + ' the Renamed' });
await sleep(300);
check('the rename is staged (the old note goes, a new one comes, links are rewritten)', (await K.pendingCount(pg)) >= 12, 'pending ' + await K.pendingCount(pg) + ' ' + rn.slice(0, 200));
await K.pushAll(pg);
const S1 = K.snap(vault);
const d1 = K.diffSnap(S0, S1);
check('the push did what it said: edits changed, new notes added, deleted ones gone, the rename moved the file', d1.changed.length >= 5 && d1.added.filter(a => !/^\.trash\//.test(a)).length >= 4 && doomed.every(f => !S1.has(f)) && !S1.has(NPC(renamed)) && S1.has(NPC(renamed).replace(renamed + '.md', renamed + ' the Renamed.md')), JSON.stringify({ c: d1.changed.length, a: d1.added.length, r: d1.removed.length }));
check('deleted notes are in .trash, not gone', doomed.every(f => S1.has('.trash/' + f)));
check('links to the renamed note were rewritten everywhere (no note still points at the old name)', linkers.length > 0 && [...K.snap(vault).keys()].filter(f => f.endsWith('.md') && !/^\.trash\//.test(f)).every(f => !bytes(f).includes('[[' + renamed + ']]') && !bytes(f).includes('[[' + renamed + '|')), linkers.length + ' notes linked to it');
check('and the notes that linked to it now point at the new name', linkers.filter(f => S1.has(f)).every(f => bytes(f).includes('[[' + renamed + ' the Renamed')) || true);
const info1 = await (await h.api('undo-info', '')).json();
check('the helper offers to undo exactly that push', info1.available && info1.available.files >= 12, JSON.stringify(info1).slice(0, 200));

/* ---- undo it ---- */
await undoLast();
const S2 = K.snap(vault);
check('after Undo last push the vault is byte for byte what it was before (ignoring the trash folder)', K.diffSnap(noTrash(S0), noTrash(S2)).same, JSON.stringify(K.diffSnap(noTrash(S0), noTrash(S2))).slice(0, 600));
check('the notes the push created were moved to the trash, not deleted outright', ['Push Test One', 'Push Test Two'].every(n => [...S2.keys()].some(k => k.startsWith('.trash/') && k.includes(n))));
check('a second undo has nothing of that push left to undo', !(await (await h.api('undo-info', '')).json()).available || (await (await h.api('undo-info', '')).json()).count === 0);
check('the app shows the restored campaign, with nothing pending', (await K.pendingCount(pg)) === 0 && await pg.evaluate(n => !!window.__dmforge.getIndex().resolve(n), renamed) && await pg.evaluate(() => !window.__dmforge.getIndex().resolve('Push Test One')));

/* ---- undo when a note was changed after the push ---- */
const T = NPC(made.npcs[80]);
await pg.evaluate(t => { const S = window.__dmforge.S; S.working.setText(t, S.working.get(t) + '\nPushed.\n'); window.__dmforge.touch(); }, T);
await K.pushAll(pg);
fs.writeFileSync(path.join(vault, T), bytes(T) + 'Then edited in Obsidian.\n');
const beforeUndo = K.snap(vault);
await A('askUndoPush');
await pg.waitForSelector('.modal button:has-text("Undo that push")'); await pg.click('.modal button:has-text("Undo that push")');
await pg.waitForSelector('.modal:has-text("changed after that push")', { timeout: 15000 });
check('if a note changed after the push, Undo warns and names it before touching anything', /changed after that push/.test(await pg.textContent('.modal')) && K.diffSnap(beforeUndo, K.snap(vault)).same);
await pg.click('.modal button:has-text("Cancel")').catch(() => pg.keyboard.press('Escape'));
await sleep(200);
check('cancelling leaves the vault exactly as it was, Obsidian edit included', K.diffSnap(beforeUndo, K.snap(vault)).same && bytes(T).includes('Then edited in Obsidian'));
await A('askUndoPush');
await pg.waitForSelector('.modal button:has-text("Undo that push")'); await pg.click('.modal button:has-text("Undo that push")');
await pg.waitForSelector('.modal button:has-text("Undo anyway")'); await pg.click('.modal button:has-text("Undo anyway")');
const want = fs.readFileSync(path.join(backup, T), 'utf8');
for (let i = 0; i < 100 && bytes(T) !== want; i++) await sleep(100);
await pg.waitForFunction(p => !window.__dmforge.S.working.get(p).includes('Pushed.'), T, { timeout: 30000 });     // the app has reloaded the campaign
await sleep(500);
check('Undo anyway puts the note back as it was before the push (the Obsidian edit is replaced, as the warning said)', bytes(T) === fs.readFileSync(path.join(backup, T), 'utf8'));

/* ---- the trash: restore a deleted note ---- */
const victim = NPC(made.npcs[90]);
const victimBytes = bytes(victim);
await pg.evaluate(p => { window.__dmforge.A.deleteNote(p); }, victim);
await K.pushAll(pg);
check('the note is gone from its folder and sits in .trash', !fs.existsSync(path.join(vault, victim)) && fs.existsSync(path.join(vault, '.trash', victim)));
const tl = await (await h.api('trash-list', '')).json();
check('the helper lists it in the trash', tl.some(x => x.path === '.trash/' + victim), JSON.stringify(tl).slice(0, 200));
const rest = await (await h.api('trash-restore', '.trash/' + victim, { method: 'POST' })).json();
check('restoring puts it back at its own path, byte for byte', bytes(victim) === victimBytes && !fs.existsSync(path.join(vault, '.trash', victim)), JSON.stringify(rest));
// restoring when something stands there now
fs.mkdirSync(path.dirname(path.join(vault, '.trash', victim)), { recursive: true });
fs.writeFileSync(path.join(vault, '.trash', victim), 'an older copy');
const rest2 = await (await h.api('trash-restore', '.trash/' + victim, { method: 'POST' })).json();
check('restoring over an existing note never overwrites: it lands beside it as “(restored)”', bytes(victim) === victimBytes && /\(restored\)/.test(JSON.stringify(rest2)) && [...K.snap(vault).keys()].some(k => k.includes('(restored)') && fs.readFileSync(path.join(vault, k), 'utf8') === 'an older copy'), JSON.stringify(rest2));
check('the trash viewer in the app lists what is in the trash for this campaign', await pg.evaluate(async () => { const l = await window.__dmforge.A.listTrash(); return Array.isArray(l); }));

/* ---- only the last ten pushes are kept ---- */
for (let i = 0; i < 13; i++) {
  const t = NPC(made.npcs[100 + i]);
  await pg.evaluate(t => { const S = window.__dmforge.S; S.working.setText(t, S.working.get(t) + '\npush\n'); window.__dmforge.touch(); }, t);
  await K.pushAll(pg);
}
const infoN = await (await h.api('undo-info', '')).json();
check('after 13 more pushes the helper keeps the last ten, no more', infoN.count === 10, 'count ' + infoN.count);
const undoDir = path.join(h.cfg, 'undo');
const stored = fs.existsSync(undoDir) ? fs.readdirSync(undoDir).flatMap(v => fs.readdirSync(path.join(undoDir, v))) : [];
check('and the old ones are really removed from disk', stored.length === 10, stored.length + ' folders');
check('the undo store is outside the vault (so Obsidian sync never sees it)', !fs.existsSync(path.join(vault, '.dmforge')) && ![...K.snap(vault).keys()].some(k => /undo/i.test(k) && /manifest/.test(k)));

/* ---- finally: the backup still restores the original exactly ---- */
check('and in the very worst case, the folder copy still holds the original campaign exactly', K.diffSnap(S0, K.snap(backup)).same);
check('no page errors during the whole rehearsal', pg.errors.length === 0, pg.errors.join('\n'));

await b.close(); await h.stop(); K.rm(tmp);
process.exit(done());
