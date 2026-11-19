import test from 'node:test';
import assert from 'node:assert/strict';
import * as yaml from 'js-yaml';
import { splitFrontmatter, patchFrontmatter, serializeKV, scalarize, replaceBody, setFrontmatterRaw, applyBody } from '../src/core/frontmatter.js';
import { extractLinks, extractInline, extractTags, summarize, parseNote, appendToSection, upsertBlock } from '../src/core/markdown.js';
import { detectType, detectMapping, getField, TYPES, toStored } from '../src/core/schema.js';
import { MemoryVault } from '../src/core/vault.js';
import { loadCampaign, buildIndex, topFolders, newNotePath, search, suggestSessionNumber, sessionWord } from '../src/core/campaign.js';
import { Working } from '../src/core/working.js';
import { buildReview, applyPush, defaultDecisions, visibleItems } from '../src/core/push.js';
import { reformatBody } from '../src/core/reformat.js';
import { typeInfo, isCustom, customId } from '../src/core/schema.js';
import { GROUPS, unitize, parseCustom, buildCustom, matches, allCards, slug } from '../src/core/cheatsheet.js';
import { metricize } from '../src/core/units.js';
import { SNAPSHOT_NOTE, fingerprint, snapshotNotes, noteBlock, planSnapshot, snapshotPrompt, mergePrompt, cleanSnapshot, buildSnapshotNote, parseSnapshot, snapshotContext, compareSnapshot, describeSnapshot } from '../src/core/snapshot.js';
import { parsePools, buildPools, parseAnswer, parseTables, freshRows, refillPrompt, tablePrompt, campaignContext, sectionText, liveHasSecrets, inspirationText, STRENGTHS, buildTable, parseTable, rollTable } from '../src/core/pools.js';
import { GENS_BY_ID, fieldMeta, setPoolSource } from '../src/core/generators.js';
import { GROUPS as GEN_GROUPS, BLURBS, LAYOUTS, buildSheet, sheetText, end, MAX_PICKS, STARTER_COMBOS, picksTotal, cleanPicks, multiText } from '../src/core/genlayout.js';
import { demoFiles } from '../src/core/demo.js';
import * as combat from '../src/core/combat.js';
import { rollExpr } from '../src/core/dice.js';
import { scanVault, buildReport } from '../src/core/inspector.js';
import { GENERATORS, newGenState, rollAll, rerollField } from '../src/core/generators.js';
import * as IT from '../src/core/items.js';
import fs from 'node:fs';
import { CHANGELOG, BEFORE_V2, KINDS } from '../src/core/changelog.js';
import { describeChange, addEntry, timeAgo } from '../src/core/leftoff.js';
import { buildBlocks, renderBlock, unitText, applyUnitEdit, toggleTask, addSibling, removeItem, blockText, applyBlockEdit, unitAt } from '../src/core/blocks.js';
import { expandPrompt, notePrompt, QUESTION_MARK } from '../src/core/claudeprompts.js';
import { SESSION_TEMPLATES, insertAt, templateById, placeTemplate } from '../src/core/sessiontemplates.js';
import { genToNote, genToPrep, buildNoteText, suggestName, defaultDest } from '../src/core/templates.js';

const parse = t => yaml.load(splitFrontmatter(t).fmRaw, { schema: yaml.JSON_SCHEMA });

/* ---------- front matter ---------- */
test('splitFrontmatter: with, without, empty, BOM, CRLF', () => {
  assert.equal(splitFrontmatter('# Hi\nbody').hasFm, false);
  const a = splitFrontmatter('---\nrace: Elf\n---\n\nBody');
  assert.equal(a.hasFm, true); assert.equal(a.fm.race, 'Elf'); assert.equal(a.body, '\nBody');
  assert.equal(splitFrontmatter('---\n---\nx').hasFm, true);
  assert.equal(splitFrontmatter('﻿---\na: 1\n---\nx').fm.a, 1);
  assert.equal(splitFrontmatter('---\r\na: 1\r\n---\r\nx').fm.a, 1);
  assert.equal(splitFrontmatter('---\nbad: [unclosed\n---\nx').error !== null, true);
});

test('dates stay strings and unquoted wikilinks are recovered', () => {
  const sp = splitFrontmatter('---\ndate: 2026-10-19\nloc: [[Greenhold]]\nq: "[[Mira]]"\nflag: yes\n---\n');
  assert.equal(sp.fm.date, '2026-10-19');
  assert.equal(scalarize(sp.fm.loc), '[[Greenhold]]');
  assert.equal(scalarize(sp.fm.q), '[[Mira]]');
});

test('patchFrontmatter: replaces one key, keeps everything else byte-for-byte', () => {
  const src = '---\n# my comment\nrace: Elf\nrole: Smith\ntags:\n  - a\n  - b\ncustom: keep me\n---\n\n# Body\n';
  const out = patchFrontmatter(src, { role: 'Innkeeper' });
  assert.equal(out, src.replace('role: Smith', 'role: Innkeeper'));
});

test('patchFrontmatter: add, delete, list, quoting', () => {
  let t = '---\na: 1\n---\nBody\n';
  t = patchFrontmatter(t, { location: '[[Greenhold]]', note: 'a: b', tags: ['x', 'y z'], empty: '' });
  const fm = parse(t);
  assert.equal(fm.location.toString().includes('Greenhold'), true);
  assert.equal(scalarize(fm.location), '[[Greenhold]]');
  assert.equal(fm.note, 'a: b'); assert.deepEqual(fm.tags, ['x', 'y z']); assert.equal(fm.empty, '');
  t = patchFrontmatter(t, { a: undefined });
  assert.equal('a' in parse(t), false);
  assert.ok(t.endsWith('---\nBody\n'));
});

test('patchFrontmatter: replaces a multi-line list wholesale without leaving orphans', () => {
  const src = '---\ntags:\n  - one\n  - two\nafter: 1\n---\nx';
  const out = patchFrontmatter(src, { tags: ['solo'] });
  assert.deepEqual(parse(out), { tags: ['solo'], after: 1 });
});

test('patchFrontmatter: note with no front matter gets a block; body untouched', () => {
  const src = '# Title\n\nText\n';
  const out = patchFrontmatter(src, { race: 'Elf', level: 5 });
  assert.equal(out, '---\nrace: Elf\nlevel: 5\n---\n# Title\n\nText\n');
  assert.equal(patchFrontmatter(src, { race: undefined }), src);
});

test('patchFrontmatter preserves CRLF and BOM', () => {
  const src = '﻿---\r\nrace: Elf\r\n---\r\nBody\r\n';
  const out = patchFrontmatter(src, { role: 'Smith' });
  assert.equal(out, '﻿---\r\nrace: Elf\r\nrole: Smith\r\n---\r\nBody\r\n');
});

test('serializeKV round-trips awkward values through a real YAML parser', () => {
  const vals = ['plain', 'has: colon', '#hash', 'true', '123', '[[Link]]', ' spaced ', 'quote"inside', "it's", '', 'multi\nline', '2026-10-19', '- dash', '@at'];
  for (const v of vals) {
    const text = '---\n' + serializeKV('k', v).join('\n') + '\n---\n';
    const got = splitFrontmatter(text).fm.k;
    assert.equal(scalarize(got), v === '2026-10-19' ? v : v, 'value ' + JSON.stringify(v));
  }
});

test('replaceBody keeps the front matter block exactly', () => {
  const src = '---\na: 1\n---\nold body';
  assert.equal(replaceBody(src, 'new body'), '---\na: 1\n---\nnew body');
});

test('setFrontmatterRaw replaces or adds the block, keeping the body', () => {
  assert.equal(setFrontmatterRaw('---\na: 1\n---\nBody', 'b: 2\nc: 3'), '---\nb: 2\nc: 3\n---\nBody');
  assert.equal(setFrontmatterRaw('Body', 'b: 2'), '---\nb: 2\n---\nBody');
  assert.equal(setFrontmatterRaw('Body', ''), 'Body');
  assert.equal(setFrontmatterRaw('---\r\na: 1\r\n---\r\nB', 'x: 1\ny: 2'), '---\r\nx: 1\r\ny: 2\r\n---\r\nB');
});

test('applyBody leaves untouched CRLF bodies alone and keeps CRLF when edited', () => {
  const src = '---\r\nrole: Smith\r\n---\r\nLine one\r\nLine two\r\n';
  assert.equal(applyBody(src, 'Line one\nLine two\n'), src, 'editor round trip must not change a CRLF file');
  assert.equal(applyBody(src, 'Line one\nLine 2\n'), '---\r\nrole: Smith\r\n---\r\nLine one\r\nLine 2\r\n');
  assert.equal(applyBody('a\nb\n', 'a\nc\n'), 'a\nc\n');
});

test('MemoryVault remembers empty folders; campaign load reports them', async () => {
  const v = new MemoryVault({ 'Top/Camp/Camp.md': '# Camp' });
  await v.mkdir('Top/Camp/NPCs'); await v.mkdir('Top/Camp/Plot Threads');
  assert.deepEqual((await v.list('Top/Camp')).map(e => e.name + ':' + e.kind).sort(), ['Camp.md:file', 'NPCs:dir', 'Plot Threads:dir']);
  const loaded = await loadCampaign(v, 'Top/Camp');
  assert.deepEqual(topFolders(loaded.files, 'Top/Camp', loaded.dirs), ['NPCs', 'Plot Threads']);
  assert.deepEqual(topFolders(loaded.files, 'Top/Camp'), [], 'without dirs, empty folders are invisible');
});

/* ---------- markdown ---------- */
test('extractLinks handles alias, heading, embeds, code', () => {
  const l = extractLinks('See [[Mira]] and [[Greenhold#History|the village]] and ![[map.png]]. `[[nope]]`\n```\n[[also nope]]\n```');
  assert.deepEqual(l.map(x => [x.target, x.embed]), [['Mira', false], ['Greenhold', false], ['map.png', true]]);
});

test('extractInline reads Dataview and bold-label styles', () => {
  const i = extractInline('Class:: Wizard\n**Race:** Human\n- **Role**: Priest\nHP:: 31\n```\nFake:: no\n```');
  assert.equal(i.class, 'Wizard'); assert.equal(i.race, 'Human'); assert.equal(i.role, 'Priest'); assert.equal(i.hp, '31'); assert.equal(i.fake, undefined);
});

test('extractTags merges body tags and property tags', () => {
  assert.deepEqual(extractTags('hello #one and #two/three', { tags: ['four', '#five'] }).sort(), ['five', 'four', 'one', 'two/three']);
});

test('summarize skips headings, fields and lists', () => {
  assert.equal(summarize('# T\n\n**Race:** Elf\n\nThe first real paragraph with [[Link]].\n\n- item'), 'The first real paragraph with Link.');
});

test('appendToSection: existing, missing, and stops at next heading', () => {
  const body = '# T\n\n## Prep\n- a\n\n## Recap\ntext\n';
  const out = appendToSection(body, 'Prep', '- b');
  assert.equal(out, '# T\n\n## Prep\n- a\n\n- b\n\n## Recap\ntext\n');
  const out2 = appendToSection('# T\n', 'Combat', 'x');
  assert.equal(out2, '# T\n\n## Combat\n\nx\n');
  assert.equal(appendToSection('## Prep\n', 'Prep', '- first'), '## Prep\n\n- first\n');
});

test('upsertBlock is idempotent and replaces in place', () => {
  const a = upsertBlock('# S\n', 'combat-1', 'first', { heading: 'Combat' });
  const b = upsertBlock(a, 'combat-1', 'second', { heading: 'Combat' });
  assert.equal((b.match(/<!-- dmforge:combat-1 -->/g) || []).length, 1);
  assert.ok(b.includes('second') && !b.includes('first'));
  const c = upsertBlock(b, 'combat-2', 'other', { heading: 'Combat' });
  assert.ok(c.includes('second') && c.includes('other'));
});

/* ---------- schema ---------- */
test('folder names map to types loosely', () => {
  assert.equal(detectType('NPCs'), 'npc'); assert.equal(detectType('npc'), 'npc');
  assert.equal(detectType('01 - Players'), 'player'); assert.equal(detectType('Plot Threads'), 'plot');
  assert.equal(detectType('Session Notes'), 'session'); assert.equal(detectType('Maps'), 'map');
  assert.equal(detectType('Random stuff'), null);
  assert.deepEqual(detectMapping(['npc', 'players', 'maps', 'Lore']), { npc: 'npc', players: 'player', maps: 'map', Lore: 'other' });
});

test('getField reads front matter, then inline, with aliases', () => {
  const n1 = parseNote('C/Players/A.md', '---\nhp: 38\n---\n');
  const hp = TYPES.player.fields.find(f => f.key === 'hp');
  assert.equal(getField(n1, hp).value, '38'); assert.equal(getField(n1, hp).source, 'fm');
  const n2 = parseNote('C/Players/B.md', 'HP:: 31\n');
  assert.equal(getField(n2, hp).value, '31'); assert.equal(getField(n2, hp).source, 'inline');
  const loc = TYPES.npc.fields.find(f => f.key === 'location');
  assert.equal(getField(parseNote('x.md', '---\nlocation: "[[Greenhold]]"\n---\n'), loc).value, 'Greenhold');
  assert.equal(toStored(loc, 'Greenhold'), '[[Greenhold]]'); assert.equal(toStored(loc, ''), undefined);
  assert.equal(toStored(hp, '40'), 40);
});

/* ---------- campaign + working copy + push ---------- */
async function loadDemo() {
  const vault = new MemoryVault(demoFiles());
  const campaign = { path: 'Ashfall', name: 'Ashfall' };
  const loaded = await loadCampaign(vault, 'Ashfall');
  const mapping = detectMapping(topFolders(loaded.files, 'Ashfall'));
  const working = new Working(); working.loadBase(loaded.texts);
  return { vault, campaign, loaded, mapping, working, index: () => buildIndex({ campaign, mapping, working, files: loaded.files }) };
}

test('loads the demo campaign and builds an index', async () => {
  const d = await loadDemo();
  assert.equal(d.mapping.NPCs, 'npc'); assert.equal(d.mapping.Maps, 'map');
  const idx = d.index();
  assert.equal(idx.byType.npc.length, 4); assert.equal(idx.byType.player.length, 3);
  assert.equal(idx.byType.session[0].name.includes('Session 12'), true, 'newest session first');
  assert.equal(idx.byType.session[0].sdate, '2026-10-12'); assert.equal(idx.byType.session[0].snum, 12);
  assert.equal(idx.resolve('mireille vane').name, 'Mireille Vane');
  assert.ok(idx.backlinks.get('Ashfall/Locations/Greenhold.md').length >= 2);
  assert.equal(idx.findAsset('Greenhold Map.svg'), 'Ashfall/Maps/Greenhold Map.svg');
  assert.ok(!idx.notes.some(n => n.path.includes('Templates')), 'outside the campaign folder is not loaded');
});

test('search ranks name matches first', async () => {
  const d = await loadDemo();
  const r = search(d.index(), 'bells');
  assert.equal(r[0].note.name, 'The Missing Bells');
  assert.ok(r.length >= 2);
});

test('edit a note: only the changed property is rewritten', async () => {
  const d = await loadDemo();
  const p = 'Ashfall/NPCs/Mireille Vane.md';
  const before = d.working.get(p);
  d.working.setText(p, patchFrontmatter(before, { role: 'Innkeeper and informant' }));
  assert.equal(d.working.count, 1);
  const bl = before.split('\n'), al = d.working.get(p).split('\n');
  const changed = al.filter(l => !bl.includes(l)).concat(bl.filter(l => !al.includes(l)));
  assert.deepEqual(changed.sort(), ['role: Innkeeper', 'role: Innkeeper and informant']);
  d.working.setText(p, before);
  assert.equal(d.working.count, 0, 'reverting to the original clears the pending change');
});

test('push writes creates, updates and deletes, and clears pending', async () => {
  const d = await loadDemo();
  const edited = 'Ashfall/NPCs/Old Tam.md';
  d.working.setText(edited, patchFrontmatter(d.working.get(edited), { race: 'Human' }));
  const np = newNotePath(d.campaign, d.mapping, 'location', 'New Place', d.working);
  assert.equal(np.path, 'Ashfall/Locations/New Place.md');
  d.working.create(np.path, '# New Place\n');
  d.working.remove('Ashfall/Plot Threads/Who Poisoned the Well.md');
  const items = await buildReview(d.vault, d.working);
  assert.deepEqual(items.map(i => i.kind).sort(), ['create', 'delete', 'update']);
  assert.ok(items.every(i => !i.conflict));
  const res = await applyPush(d.vault, d.working, items, defaultDecisions(items));
  assert.deepEqual(res.map(r => r.status).sort(), ['deleted', 'written', 'written']);
  assert.equal(d.working.count, 0);
  assert.ok((await d.vault.readText(edited)).includes('race: Human'));
  assert.equal(await d.vault.exists('Ashfall/Locations/New Place.md'), true);
  assert.equal(await d.vault.exists('Ashfall/Plot Threads/Who Poisoned the Well.md'), false);
  assert.equal(await d.vault.exists('.trash/Ashfall/Plot Threads/Who Poisoned the Well.md'), true, 'deletes go to .trash');
});

test('an edit made in Obsidian meanwhile is flagged, never silently overwritten', async () => {
  const d = await loadDemo();
  const p = 'Ashfall/NPCs/Old Tam.md';
  d.working.setText(p, patchFrontmatter(d.working.get(p), { race: 'Human' }));
  d.vault.externalEdit(p, d.loaded.texts.get(p) + '\nEdited in Obsidian.\n');
  const items = await buildReview(d.vault, d.working);
  assert.equal(items[0].conflict, 'changed');
  let dec = defaultDecisions(items);
  assert.equal(dec[p], null);
  let res = await applyPush(d.vault, d.working, items, dec);
  assert.equal(res[0].status, 'skipped');
  assert.ok((await d.vault.readText(p)).includes('Edited in Obsidian'));
  assert.ok(!(await d.vault.readText(p)).includes('race: Human'));
  assert.equal(d.working.count, 1, 'skipped change stays pending');
  const items2 = await buildReview(d.vault, d.working);
  res = await applyPush(d.vault, d.working, items2, { [p]: 'disk' });
  assert.equal(res[0].status, 'kept-disk'); assert.equal(d.working.count, 0);
  assert.ok(d.working.get(p).includes('Edited in Obsidian'));
});

test('overwrite and rename decisions', async () => {
  const d = await loadDemo();
  const p = 'Ashfall/NPCs/Old Tam.md';
  d.working.setText(p, '# mine\n');
  d.vault.externalEdit(p, 'theirs');
  let items = await buildReview(d.vault, d.working);
  await applyPush(d.vault, d.working, items, { [p]: 'mine' });
  assert.equal(await d.vault.readText(p), '# mine\n');
  const q = 'Ashfall/NPCs/Dup.md';
  d.working.create(q, 'new'); d.vault.externalEdit(q, 'already here');
  items = await buildReview(d.vault, d.working);
  assert.equal(items[0].conflict, 'exists');
  const res = await applyPush(d.vault, d.working, items, { [q]: 'rename' });
  assert.equal(res[0].to, 'Ashfall/NPCs/Dup 2.md');
  assert.equal(await d.vault.readText(q), 'already here'); assert.equal(await d.vault.readText('Ashfall/NPCs/Dup 2.md'), 'new');
});

test('pending changes survive serialize/restore', async () => {
  const d = await loadDemo();
  d.working.setText('Ashfall/NPCs/Old Tam.md', 'changed');
  d.working.create('Ashfall/NPCs/Fresh.md', 'x');
  d.working.remove('Ashfall/Plot Threads/The Missing Bells.md');
  const saved = JSON.parse(JSON.stringify(d.working.serialize()));
  const w2 = new Working(); w2.loadBase(d.loaded.texts); w2.restore(saved);
  assert.equal(w2.count, 3); assert.equal(w2.get('Ashfall/NPCs/Old Tam.md'), 'changed');
  assert.equal(w2.get('Ashfall/Plot Threads/The Missing Bells.md'), undefined);
});

/* ---------- combat, dice, generators, inspector ---------- */
test('combat: initiative order, turns, rounds, defeated skipped, summary', () => {
  const c = combat.newCombat();
  combat.addCombatant(c, { name: 'Kestra', init: 18, hp: 38, ac: 15, pc: true });
  combat.addCombatant(c, { name: 'Goblin', init: 12, hp: 7, count: 2 });
  combat.addCombatant(c, { name: 'Bram', init: 8, hp: 44, pc: true });
  assert.deepEqual(c.combatants.map(x => x.name), ['Kestra', 'Goblin 1', 'Goblin 2', 'Bram']);
  combat.damage(c, c.combatants[1].id, 9);
  assert.equal(c.combatants[1].hp, 0);
  combat.nextTurn(c); assert.equal(c.combatants[c.turn].name, 'Goblin 2', 'skips the defeated goblin');
  combat.nextTurn(c); combat.nextTurn(c);
  assert.equal(c.round, 2); assert.equal(c.combatants[c.turn].name, 'Kestra');
  combat.heal(c, c.combatants[3].id, 5); assert.equal(c.combatants[3].hp, 44);
  const md = combat.summaryMarkdown(c, '2026-10-19');
  assert.ok(md.includes('Defeated:** Goblin 1') && md.includes('Still standing:** Goblin 2'));
  combat.removeCombatant(c, c.combatants[0].id);
  assert.equal(c.combatants.length, 3);
});

test('dice expressions', () => {
  for (let i = 0; i < 200; i++) { const r = rollExpr('4d6kh3+2'); assert.ok(r.total >= 5 && r.total <= 20); }
  assert.equal(rollExpr('abc'), null); assert.equal(rollExpr('2d6kh9'), null); assert.equal(rollExpr('0d6'), null);
  const r = rollExpr('d20'); assert.ok(r.total >= 1 && r.total <= 20);
});

test('every generator rolls, rerolls and converts to a note without junk', () => {
  for (const g of GENERATORS) {
    for (let i = 0; i < 25; i++) {
      const st = newGenState(g);
      rollAll(g, st);
      for (const f of g.fields) rerollField(g, st, f.key);
      const text = JSON.stringify(st.vals);
      assert.ok(!/undefined|NaN|\[object/.test(text), g.id + ' produced junk: ' + text);
      const dest = defaultDest(g);
      const name = suggestName(g, st.vals);
      assert.ok(name.length > 0, g.id + ' has no suggested name');
      if (dest === 'prep') { assert.match(genToPrep(g, st.vals), /^> \[!\w+\]- /); assert.ok(genToPrep(g, st.vals, { fold: false }).startsWith('### ')); }
      else { const n = genToNote(g, st, dest, name); assert.ok(buildNoteText(n.fm, n.body).includes('# ' + name)); }
    }
  }
});

test('generated NPC note is valid front matter the reader understands', () => {
  const g = GENERATORS.find(x => x.id === 'npc'); const st = newGenState(g);
  const n = genToNote(g, st, 'npc', st.vals.name);
  const parsed = parseNote('C/NPCs/' + st.vals.name + '.md', buildNoteText(n.fm, n.body));
  assert.equal(parsed.fm.type, 'npc'); assert.equal(parsed.fm.race, st.vals.race);
  assert.equal(getField(parsed, TYPES.npc.fields[0]).value, st.vals.race);
});

test('inspector report has structure but no note contents', async () => {
  const vault = new MemoryVault(demoFiles());
  const data = await scanVault(vault, {});
  const report = buildReport(data);
  assert.ok(report.includes('Ashfall/') && report.includes('NPCs/'));
  assert.ok(report.includes('dataview') && report.includes('templater-obsidian'));
  assert.ok(report.includes('race') && report.includes('hp'));
  for (const secret of ['Mireille', 'Calder', 'bells', 'Quiet Flame', 'inn in Greenhold']) assert.ok(!report.includes(secret), 'leaked: ' + secret);
  const named = buildReport(await scanVault(vault, { includeNames: true }), { includeNames: true });
  assert.ok(named.includes('Mireille Vane'));
});


/* ---------- moves, categories, review without diffs ---------- */
test('review items carry no content diff', async () => {
  const d = await loadDemo();
  const p = 'Ashfall/NPCs/Old Tam.md';
  d.working.setText(p, patchFrontmatter(d.working.get(p), { race: 'Human' }));
  const items = await buildReview(d.vault, d.working);
  assert.equal(items.length, 1);
  assert.ok(!('ops' in items[0]) && !('stats' in items[0]));
});

test('moving a note is staged as one change and pushed new-copy-first', async () => {
  const d = await loadDemo();
  const from = 'Ashfall/NPCs/Old Tam.md', to = 'Ashfall/Locations/Old Tam.md';
  const text = d.working.get(from);
  d.working.move(from, to, text);
  assert.equal(d.working.count, 1, 'a move counts once');
  assert.equal(d.working.get(from), undefined); assert.equal(d.working.get(to), text);
  const items = await buildReview(d.vault, d.working);
  assert.equal(items.length, 2); assert.equal(visibleItems(items).length, 1);
  assert.equal(visibleItems(items)[0].movedFrom, from);
  const res = await applyPush(d.vault, d.working, items, defaultDecisions(items));
  assert.equal(res.filter(r => r.status === 'written').length, 1);
  assert.equal(await d.vault.exists(to), true); assert.equal(await d.vault.exists(from), false);
  assert.equal(await d.vault.exists('.trash/' + from), true);
  assert.equal(d.working.count, 0); assert.equal(d.working.has(from), false); assert.equal(d.working.has(to), true);
});

test('a skipped move leaves the original where it was', async () => {
  const d = await loadDemo();
  const from = 'Ashfall/NPCs/Old Tam.md', to = 'Ashfall/Locations/Old Tam.md';
  d.working.move(from, to, d.working.get(from));
  const items = await buildReview(d.vault, d.working);
  const res = await applyPush(d.vault, d.working, items, { [to]: 'skip' });
  assert.deepEqual(res.map(r => r.status), ['skipped']);
  assert.equal(await d.vault.exists(from), true); assert.equal(await d.vault.exists(to), false);
  assert.equal(d.working.count, 1, 'still pending');
});

test('moving back, chaining moves and discarding keep the working copy consistent', async () => {
  const d = await loadDemo();
  const a = 'Ashfall/NPCs/Old Tam.md', b = 'Ashfall/Locations/Old Tam.md', c = 'Ashfall/Factions/Old Tam.md';
  const text = d.working.get(a);
  d.working.move(a, b, text); d.working.move(b, c, text);
  assert.equal(d.working.count, 1);
  assert.equal(d.working.pending.get(a).movedTo, c); assert.equal(d.working.pending.get(c).movedFrom, a);
  assert.equal(d.working.pending.has(b), false);
  d.working.move(c, a, text);
  assert.equal(d.working.count, 0, 'back where it started is no change at all');
  d.working.move(a, b, text);
  const gone = d.working.revert(b);
  assert.deepEqual(gone.sort(), [a, b].sort());
  assert.equal(d.working.count, 0); assert.equal(d.working.get(a), text);
  d.working.move(a, b, text); d.working.remove(b);
  assert.equal(d.working.pending.get(a).kind, 'delete'); assert.equal(d.working.pending.get(a).movedTo, undefined, 'deleting the moved copy turns it into a plain delete');
  // survives a save and restore
  const w2 = new Working(); w2.loadBase(d.loaded.texts);
  d.working.revert(a); d.working.move(a, b, text);
  w2.restore(JSON.parse(JSON.stringify(d.working.serialize())));
  assert.equal(w2.count, 1); assert.equal(w2.pending.get(b).movedFrom, a);
});

test('a moved note whose original changed in Obsidian is flagged', async () => {
  const d = await loadDemo();
  const from = 'Ashfall/NPCs/Old Tam.md', to = 'Ashfall/Locations/Old Tam.md';
  d.working.move(from, to, d.working.get(from));
  d.vault.externalEdit(from, d.loaded.texts.get(from) + '\nNew in Obsidian\n');
  const items = await buildReview(d.vault, d.working);
  const row = visibleItems(items)[0];
  assert.equal(row.conflict, 'srcchanged');
  const res = await applyPush(d.vault, d.working, items, defaultDecisions(items));
  assert.equal(res[0].status, 'skipped');
  assert.ok((await d.vault.readText(from)).includes('New in Obsidian'));
});

test('custom categories have their own label and folder', async () => {
  assert.equal(customId('Bestiary'), 'x:Bestiary'); assert.ok(isCustom('x:Bestiary')); assert.ok(!isCustom('npc'));
  assert.equal(typeInfo('x:Bestiary').label, 'Bestiary'); assert.equal(typeInfo('x:Bestiary').custom, true);
  const d = await loadDemo();
  d.mapping.Bestiary = 'x:Bestiary';
  const np = newNotePath(d.campaign, d.mapping, 'x:Bestiary', 'Owlbear', d.working);
  assert.equal(np.path, 'Ashfall/Bestiary/Owlbear.md'); assert.equal(np.isNewFolder, false);
  d.working.create(np.path, '# Owlbear\n');
  const idx = d.index();
  assert.equal(idx.byType['x:Bestiary'].length, 1);
});

/* ---------- reformat ---------- */
test('reformat fixes broken structure, leaves Obsidian syntax and code alone, and is idempotent', () => {
  const src = '##Heading\nText\n* a\n+ b\n-[ ]todo\n| a | b |\n|---|---|\n| 1 | 2 |\nafter\n\n\n\nSee [[ Mira | the keeper ]]\n> [!note] Keep this\n> callout\n==hl== %%c%% #tag\n```\n##code\n* keep\n```\n---\n* * *\n';
  const r = reformatBody(src);
  assert.ok(r.body.startsWith('## Heading\n\nText\n- a\n- b\n- [ ] todo\n\n| a | b |'));
  assert.ok(r.body.includes('| 1 | 2 |\n\nafter'));
  assert.ok(r.body.includes('[[Mira|the keeper]]'));
  assert.ok(r.body.includes('> [!note] Keep this\n> callout') && r.body.includes('==hl== %%c%% #tag'), 'Obsidian syntax untouched');
  assert.ok(r.body.includes('```\n##code\n* keep\n```'), 'code blocks untouched');
  assert.ok(r.body.includes('---\n* * *'), 'rules untouched');
  assert.ok(!/\n\n\n/.test(r.body));
  assert.ok(r.changes.length >= 5);
  assert.deepEqual(reformatBody(r.body).changes, [], 'second run changes nothing');
  assert.equal(reformatBody('# Clean\n\nAll good.\n').changes.length, 0);
  assert.ok(reformatBody('text\n```js\nx').body.endsWith('```'), 'unclosed fence is closed');
});

/* ---------- combat: rolling ---------- */
test('combat: roll initiative for a creature and for all enemies', () => {
  const c = combat.newCombat();
  combat.addCombatant(c, { name: 'Kestra', init: 18, hp: 30, pc: true });
  combat.addCombatant(c, { name: 'Goblin', init: 'roll', bonus: 2, hp: 7, count: 3 });
  assert.equal(c.combatants.length, 4);
  assert.ok(c.combatants.filter(x => !x.pc).every(x => x.bonus === 2 && x.init >= 3 && x.init <= 22));
  const before = c.combatants.find(x => x.pc).init;
  const n = combat.rollEnemies(c);
  assert.equal(n, 3); assert.equal(c.combatants.find(x => x.pc).init, before, 'players are never re-rolled');
  const inits = c.combatants.map(x => x.init);
  assert.deepEqual(inits, [...inits].sort((a, b) => b - a), 'list stays sorted');
  const id = c.combatants.find(x => !x.pc).id;
  const v = combat.rollFor(c, id);
  assert.ok(v >= 3 && v <= 22); assert.equal(c.combatants.find(x => x.id === id).init, v);
  // changing one value re-sorts and keeps the turn on the same creature (once the fight is under way)
  c.opened = true;
  c.turn = c.combatants.findIndex(x => x.pc);
  const kid = c.combatants[c.turn].id;
  combat.setInit(c, kid, 1);
  assert.equal(c.combatants[c.turn].id, kid); assert.equal(c.combatants[c.combatants.length - 1].id, kid);
});

/* ---------- link suggestions and the graph ---------- */
import { suggestLinks, applyLinkToText, allMentions, findMention, formsOf, maskOf, plainText } from '../src/core/mentions.js';
import { graphData, localSubgraph, createSim } from '../src/core/graph.js';

async function linkIdx(files, mapping = { Factions: 'faction', Players: 'player', NPCs: 'npc', Locations: 'location' }) {
  const vault = new MemoryVault(files);
  const loaded = await loadCampaign(vault, 'C');
  const working = new Working(); working.loadBase(loaded.texts);
  return { vault, working, idx: buildIndex({ campaign: { path: 'C', name: 'C' }, mapping, working, files: loaded.files }) };
}
const sl = (idx, p, opts) => suggestLinks(idx.byPath.get(p), idx, opts);

test('links: the AOS example. Xir Valen writes "acyolytes of solice", the AOS page offers [[AOS|…]] in his note', async () => {
  const files = {
    'C/Factions/AOS.md': '# AOS\n\nA cult of the old city.',
    'C/Players/Xir Valen.md': '---\ntype: player-character\nname: Xir Valen\n---\ntiefling red skin horns acyolytes of solice\nperception:: 12',
    'C/NPCs/Mira.md': 'Mira sells bread. A villain? A lich? A zombie horde? No.',
  };
  const { idx } = await linkIdx(files);
  const s = sl(idx, 'C/Factions/AOS.md');
  assert.equal(s.length, 1, JSON.stringify(s));
  assert.equal(s[0].path, 'C/Players/Xir Valen.md'); assert.equal(s[0].matched, 'acyolytes of solice');
  assert.equal(s[0].link, '[[AOS|acyolytes of solice]]'); assert.equal(s[0].kind, 'in-other');
  assert.equal(s[0].before, 'tiefling red skin horns '); assert.equal(s[0].after, '', 'the preview is the line the text is on');
  // the same suggestion from the player's side
  const t = sl(idx, 'C/Players/Xir Valen.md');
  assert.equal(t.length, 1); assert.equal(t[0].kind, 'in-this'); assert.equal(t[0].link, '[[AOS|acyolytes of solice]]');
  assert.deepEqual(sl(idx, 'C/NPCs/Mira.md'), [], 'nothing from random words');
  // approving changes only that text, in the right note, front matter and the rest untouched
  const r = applyLinkToText(files['C/Players/Xir Valen.md'], s[0].matched, s[0].link);
  assert.ok(r.changed && r.text === files['C/Players/Xir Valen.md'].replace('acyolytes of solice', '[[AOS|acyolytes of solice]]'));
  // once linked, the suggestion is gone and the link shows up as a connection
  const after = await linkIdx({ ...files, 'C/Players/Xir Valen.md': r.text });
  assert.deepEqual(sl(after.idx, 'C/Factions/AOS.md'), []);
  assert.ok(after.idx.backlinks.get('C/Factions/AOS.md').some(n => n.name === 'Xir Valen'));
});

test('links: name, alias, acronym, typo and plural are found; links, code, headings, urls and tags are not touched', async () => {
  const { idx } = await linkIdx({
    'C/Factions/Acolytes of Solace.md': '---\naliases: [The Solace Order]\n---\nAcolytes of Solace (AOS) tend the shrine.',
    'C/Players/A.md': 'Left the AOS last year.',
    'C/Players/B.md': 'Once an acyolytes of solice, now free.',
    'C/Players/C.md': 'Raised by the Solace Order.',
    'C/Players/D.md': 'Serves [[Acolytes of Solace]] in secret.',
    'C/Players/E.md': 'Plays cards. Nothing to do with the shrine.',
    'C/Players/F.md': '# Acolytes of Solace\n`Acolytes of Solace` and https://x.test/acolytes-of-solace and #acolytes-of-solace\n```\nAcolytes of Solace\n```\n[the order](Acolytes%20of%20Solace.md) and [[Other|Acolytes of Solace]]',
    'C/Players/G.md': 'Two acolytes of solace walk in, then Acolytes of Solace again.',
  });
  const s = sl(idx, 'C/Factions/Acolytes of Solace.md');
  assert.deepEqual(s.map(x => x.path.split('/').pop()).sort(), ['A.md', 'B.md', 'C.md', 'G.md']);
  assert.ok(s.every(x => x.link.startsWith('[[Acolytes of Solace')));
  assert.equal(s.find(x => x.path.endsWith('A.md')).link, '[[Acolytes of Solace|AOS]]');
  assert.equal(s.find(x => x.path.endsWith('G.md')).matched, 'acolytes of solace', 'the first one is offered, with the writer\'s own capitalisation kept');
  assert.equal(s.find(x => x.path.endsWith('G.md')).link, '[[Acolytes of Solace|acolytes of solace]]');
});

test('links: first and last names are only used when unambiguous, and people get no made-up acronyms', async () => {
  const { idx } = await linkIdx({
    'C/NPCs/Captain Isolde Ravenscroft.md': 'Guard.',
    'C/NPCs/Isolde Black.md': 'Another Isolde.',
    'C/Players/Xir Valen.md': 'CIR means nothing. Ravenscroft hates him. Isolde smiled.',
    'C/Players/Bo.md': 'Valen was here.',
  });
  const s = sl(idx, 'C/NPCs/Captain Isolde Ravenscroft.md');
  assert.ok(s.some(x => x.path.endsWith('Xir Valen.md') && x.matched === 'Ravenscroft'), JSON.stringify(s));
  assert.ok(!s.some(x => x.matched === 'Isolde' || x.matched === 'CIR'), 'Isolde is ambiguous between two notes');
  const v = sl(idx, 'C/Players/Xir Valen.md');
  assert.ok(v.some(x => x.kind === 'in-other' && x.path.endsWith('Bo.md') && x.matched === 'Valen'));
});

test('links: the preview is readable text, not markdown, and says where the mention is', async () => {
  const { idx } = await linkIdx({
    'C/Factions/Sons of Alagondar.md': '# Sons of Alagondar\n\nResistance.',
    'C/Players/Robbie.md': '# Arther\n\n## Connections\n\n> [!example] Organisation: The Sons of Alagondar\n> An underground group.',
    'C/Sessions/Episode 2.md': '## NPCs\n\n| Name | Hook | Notes |\n|---|---|---|\n| **Aurther** _(halfling rogue, Sons of Alagondar)_ | **Revenge on bullies** | wanted posters |\n',
  }, { Factions: 'faction', Players: 'player', Sessions: 'session' });
  const s = sl(idx, 'C/Factions/Sons of Alagondar.md');
  const table = s.find(x => x.path.endsWith('Episode 2.md')), call = s.find(x => x.path.endsWith('Robbie.md'));
  assert.equal(table.before + '|' + table.matched + '|' + table.after, 'Aurther (halfling rogue, |Sons of Alagondar|)');
  assert.ok(table.inTable && table.section === 'NPCs');
  assert.equal(call.before + call.matched + call.after, 'Organisation: The Sons of Alagondar');
  assert.equal(call.section, 'Connections'); assert.equal(call.reason, '');
  for (const x of s) assert.ok(!/[*_|>#\[\]]/.test(x.before + x.after), 'no markdown left in: ' + x.before + x.after);
  assert.equal(plainText('> [!note]- Title **bold** [[A|b]] `code` [t](http://u) ~~x~~'), 'Title bold b code t x');
  assert.equal(plainText('| a | b |'), 'a · b'); assert.equal(plainText('|---|---|'), '');
});

test('links: applying looks the text up again, skips protected spots, and survives edits and CRLF', () => {
  const text = '---\nrace: Elf\n---\n# Acolytes of Solace\nSee `Acolytes of Solace`. The Acolytes of Solace rule.\n';
  const r = applyLinkToText(text, 'Acolytes of Solace', '[[AOS|Acolytes of Solace]]');
  assert.ok(r.changed && r.text.includes('The [[AOS|Acolytes of Solace]] rule.') && r.text.includes('# Acolytes of Solace\n') && r.text.includes('`Acolytes of Solace`'));
  assert.equal(applyLinkToText('nothing here', 'Acolytes', '[[x]]').changed, false);
  assert.equal(applyLinkToText('Xacolytes', 'acolytes', '[[x]]').changed, false, 'whole words only');
  const crlf = applyLinkToText('---\r\na: 1\r\n---\r\nHe left the AOS today.\r\n', 'AOS', '[[AOS]]');
  assert.equal(crlf.text, '---\r\na: 1\r\n---\r\nHe left the [[AOS]] today.\r\n');
  assert.equal(maskOf('[[a b]] c').slice(0, 7).every(Boolean), true);
});

test('links: duplicate note names link by path', async () => {
  const { idx } = await linkIdx({ 'C/Locations/Greenhold.md': 'A town.', 'C/Factions/Greenhold.md': 'A faction.', 'C/Players/P.md': 'Born in Greenhold.' });
  const s = sl(idx, 'C/Locations/Greenhold.md');
  assert.equal(s[0].link, '[[C/Locations/Greenhold|Greenhold]]');
});

test('links: every unlinked mention in the campaign (for the graph) and the graph data', async () => {
  const { idx } = await linkIdx({
    'C/Factions/AOS.md': '# AOS\nLed by [[Mira]].',
    'C/Players/Xir Valen.md': 'He left the AOS.',
    'C/NPCs/Mira.md': 'Runs the AOS and knows [[Greenhold]].',
    'C/Locations/Greenhold.md': 'A town.',
    'C/NPCs/Loner.md': 'Keeps to himself.',
  });
  const m = await allMentions(idx);
  assert.deepEqual(m.map(x => x.from.split('/').pop() + '>' + x.to.split('/').pop()).sort(), ['Mira.md>AOS.md', 'Xir Valen.md>AOS.md']);
  const g = graphData(idx);
  assert.equal(g.nodes.size, 5); assert.equal(g.links.length, 2);
  assert.equal(g.nodes.get('C/NPCs/Mira.md').deg, 2); assert.equal(g.nodes.get('C/NPCs/Loner.md').deg, 0);
  assert.deepEqual([...localSubgraph(g, 'C/Factions/AOS.md', 1)].sort(), ['C/Factions/AOS.md', 'C/NPCs/Mira.md']);
  assert.equal(localSubgraph(g, 'C/Factions/AOS.md', 2).size, 3);
  assert.equal(localSubgraph(g, 'C/Nope.md', 2).size, 0);
});

test('graph layout: finite, separated, and stable for the same input', () => {
  const nodes = Array.from({ length: 60 }, (_, i) => ({ id: 'n' + i, deg: i % 7 === 0 ? 5 : 1 }));
  const edges = nodes.slice(1).map((n, i) => ({ a: 'n' + (i % 9), b: n.id }));
  const run = () => { const s = createSim(nodes, edges); for (let i = 0; i < 200; i++) s.tick(); return s; };
  const a = run(), b = run();
  assert.ok([...a.x, ...a.y].every(Number.isFinite));
  assert.deepEqual([...a.x], [...b.x], 'deterministic');
  let min = Infinity;
  for (let i = 0; i < 60; i++) for (let j = i + 1; j < 60; j++) min = Math.min(min, Math.hypot(a.x[i] - a.x[j], a.y[i] - a.y[j]));
  assert.ok(min > 5, 'nodes do not sit on top of each other: ' + min);
  const bounds = a.bounds(); assert.ok(bounds.maxX - bounds.minX < 2500);
  const kept = createSim(nodes, edges, a.positions());
  assert.ok(Math.abs(kept.x[3] - a.x[3]) < 1e-9, 'positions are kept when the graph is rebuilt');
});

/* ---------- removing links, turning selections into links/pages ---------- */
import { bodyLinks, removeLinks, linkAt, plainOccurrences, linkFor, addAliasToText, codeMask, addLinksToText, groupForLinking } from '../src/core/linkedit.js';

test('unlinking: words stay, aliases are used, code and embeds are left alone, front matter is untouched', async () => {
  const { idx } = await linkIdx({
    'C/Factions/AOS.md': '# AOS',
    'C/Locations/Greenhold.md': 'A town.',
    'C/Players/Xir.md': '---\nfaction: "[[AOS]]"\n---\nHe left [[AOS|the order]] and [[AOS]] and [[AOS#History|AOS]], then ![[AOS]]. `[[AOS]]`\n```\n[[AOS]]\n```\nHome: [[Greenhold]] and [[Folder/Greenhold|town]] ![[map.png]]',
  });
  const text = idx.byPath.get('C/Players/Xir.md').text;
  const links = bodyLinks(idx.byPath.get('C/Players/Xir.md').body);
  assert.equal(links.length, 7, 'code is not counted: ' + links.map(l => l.raw));
  const all = removeLinks(text, idx, { path: 'C/Factions/AOS.md' });
  assert.equal(all.count, 3);
  assert.ok(all.text.includes('He left the order and AOS and AOS, then ![[AOS]]. `[[AOS]]`') && all.text.includes('faction: "[[AOS]]"'), all.text);
  assert.ok(all.text.includes('```\n[[AOS]]\n```') && all.text.includes('![[map.png]]'));
  const second = removeLinks(text, idx, { targetText: 'AOS', nth: 1 });
  assert.ok(second.text.includes('[[AOS|the order]] and AOS and [[AOS#History|AOS]]'), second.text);
  assert.equal(removeLinks(text, idx, { targetText: 'AOS', nth: 3 }).changed, false, 'the 4th AOS link is an embed, which is kept');
  assert.equal(removeLinks('no links', idx, { path: 'C/Factions/AOS.md' }).changed, false);
  const crlf = removeLinks('---\r\na: 1\r\n---\r\nGo to [[Greenhold]] now\r\n', idx, { targetText: 'Greenhold', nth: 0 });
  assert.equal(crlf.text, '---\r\na: 1\r\n---\r\nGo to Greenhold now\r\n');
  assert.equal(linkAt('x [[AOS|y]] z', 5).target, 'AOS'); assert.equal(linkAt('x [[AOS|y]] z', 1), null);
});

test('selected words: whole-word occurrences outside links/code/headings, nth lookup, link text, aliases', () => {
  const body = '# Iarno here\nIarno was seen. [[Iarno]] and `Iarno`.\nXIarno and Iarno again.';
  const mask = maskOfForTest(body);
  const occ = plainOccurrences(body, 'Iarno', mask);
  assert.equal(occ.length, 2, 'the heading, the link, the code and XIarno are skipped: ' + occ);
  assert.equal(body.slice(occ[0], occ[0] + 5), 'Iarno');
  const r = applyLinkToText('---\na: 1\n---\n' + body, 'Iarno', '[[Iarno]]', 1);
  assert.ok(r.changed && r.text.endsWith('XIarno and [[Iarno]] again.'), r.text);
  assert.equal(linkFor('Iarno', 'Iarno'), '[[Iarno]]'); assert.equal(linkFor('Iarno', 'the elf'), '[[Iarno|the elf]]');
  assert.equal(linkFor('Greenhold', 'town', 'Locations/Greenhold'), '[[Locations/Greenhold|town]]');
  assert.ok(addAliasToText('---\nrace: x\n---\nb', 'Larno').includes('aliases:\n  - Larno'));
  assert.equal(addAliasToText('---\naliases: [Larno]\n---\nb', 'larno'), '---\naliases: [Larno]\n---\nb', 'no duplicates');
  assert.ok(addAliasToText('no fm', 'Larno').startsWith('---\naliases:\n  - Larno\n---\n'));
});

test('new pages can go in a subfolder of a category', async () => {
  const d = await loadDemo();
  const np = newNotePath(d.campaign, d.mapping, 'npc', 'Iarno', d.working, 'Villains');
  assert.equal(np.path, 'Ashfall/NPCs/Villains/Iarno.md'); assert.equal(np.isNewFolder, false);
  assert.equal(newNotePath(d.campaign, d.mapping, 'npc', 'Iarno', d.working, 'a/../b/c').path, 'Ashfall/NPCs/a/b/c/Iarno.md', 'no way out of the category folder');
  assert.equal(newNotePath(d.campaign, d.mapping, 'npc', 'Iarno', d.working, '../../Elsewhere/.hidden').path, 'Ashfall/NPCs/Elsewhere/Iarno.md');
  assert.equal(newNotePath(d.campaign, d.mapping, 'npc', 'Iarno', d.working).path, 'Ashfall/NPCs/Iarno.md');
});
function maskOfForTest(body) { return maskOf(body); }

test('the next session number follows how many sessions are in the folder', async () => {
  const mk = names => names.map((name, i) => ({ name, snum: null, i }));
  const idxOf = async names => (await linkIdx(Object.fromEntries(names.map(n => ['C/Sessions/' + n + '.md', 'x'])), { Sessions: 'session' })).idx.byType.session;
  // the user's folder: three notes, only two carry a number in their name
  const s3 = await idxOf(['Epilogue - Phandelver introduction', 'Episode 2 - The Three Rings', '2026-11-01 Session 3 - Episode 3 - The Three Rings Pt. 2']);
  assert.deepEqual(s3.map(n => n.snum).sort(), [2, 3, null]);
  assert.equal(suggestSessionNumber(s3), 4);
  assert.equal(suggestSessionNumber(await idxOf(['Prologue', 'The heist', 'Aftermath', 'Notes', 'Misc'])), 6, 'five unnumbered notes: the sixth');
  assert.equal(suggestSessionNumber(await idxOf(['Session 1', 'Session 2', 'Session 12'])), 13, 'never lower than the highest number used');
  assert.equal(suggestSessionNumber([]), 1);
  const demo = await loadDemo();
  assert.equal(suggestSessionNumber(demo.index().byType.session), 13, 'the demo has sessions 11 and 12');
  assert.equal(mk(['a']).length, 1);
});

test('sessions are called Session, Episode, Chapter or Part, following the folder and the notes', async () => {
  const names = async ns => (await linkIdx(Object.fromEntries(ns.map(n => ['C/X/' + n + '.md', 'x'])), { X: 'session' })).idx.byType.session;
  assert.equal(sessionWord([], 'Episodes'), 'Episode'); assert.equal(sessionWord([], 'EPisodes'), 'Episode');
  assert.equal(sessionWord([], 'Session Notes'), 'Session'); assert.equal(sessionWord([], '03 - Chapters'), 'Chapter');
  assert.equal(sessionWord([], 'Sessions'), 'Session'); assert.equal(sessionWord([], 'Journal'), 'Session', 'no hint: Session');
  const notes = await names(['Episode 1 - A', 'Episode 2 - B', 'Session 3']);
  assert.equal(sessionWord(notes, 'Logs'), 'Episode', 'the word the notes use most');
  assert.equal(sessionWord(notes, 'Sessions'), 'Session', 'an explicit folder name wins');
  assert.equal(sessionWord(await names(['Prologue', 'Epilogue']), 'Logs'), 'Session');
});

/* ---------- items and shops ---------- */
const allText = vals => Object.values(vals).flat().join(' | ');
test('shops: every type and settlement size rolls priced, quantified stock that scales with the price level', () => {
  const g = GENERATORS.find(x => x.id === 'shop');
  assert.ok(IT.SHOP_TYPES.length >= 19);
  for (const type of IT.SHOP_TYPES) for (const size of IT.SHOP_SIZES) for (let i = 0; i < 6; i++) {
    const st = newGenState(g); st.opts.type = type; st.opts.size = size; rollAll(g, st);
    assert.equal(st.vals.type, type);
    assert.ok(st.vals.stock.length >= 3, type + ' ' + size + ' has stock');
    for (const line of st.vals.stock) assert.match(line, /^.+ — [\d,.]+ (cp|sp|gp)( \(.+\))?$/, line);
    const magic = Array.isArray(st.vals.magic) ? st.vals.magic : [];
    for (const m of magic) assert.match(m, / — [\d,]+ gp$/, m);
    if (type === 'Magic emporium') assert.ok(magic.length >= 1, 'an emporium always has magic');
    if (size === 'Hamlet' && type !== 'Magic emporium') assert.ok(magic.length <= 2);
    for (const k of ['keeper', 'first', 'where', 'special', 'buys', 'haggle', 'rep', 'want', 'secret', 'name']) assert.ok(String(st.vals[k]).length > 8, k);
    assert.ok(!/[{}]|undefined|NaN/.test(allText(st.vals)), allText(st.vals));
  }
  const avg = prices => { let sum = 0, n = 0; for (let i = 0; i < 60; i++) for (const l of IT.shopStock('Weaponsmith', 'Town', prices)) { if (/^Longsword/.test(l)) { sum += parseFloat(l.match(/— ([\d.,]+) gp/)[1].replace(',', '')); n++; } } return n ? sum / n : 0; };
  const [bargain, fair, steep] = [avg('Bargain'), avg('Fair'), avg('Steep')];
  assert.ok(Math.abs(fair - 15) < 1 && bargain < fair && steep > fair, bargain + ' ' + fair + ' ' + steep);
  assert.equal(IT.fmtCp(5), '5 cp'); assert.equal(IT.fmtCp(30), '3 sp'); assert.equal(IT.fmtCp(1500), '15 gp'); assert.equal(IT.fmtCp(150), '1.5 gp'); assert.equal(IT.fmtCp(1350000), '13,500 gp');
});

test('magic items: rarity decides bonus, price range and attunement; kinds behave; curses follow the setting', () => {
  const g = GENERATORS.find(x => x.id === 'magicitem');
  const range = { Common: [50, 100], Uncommon: [101, 500], Rare: [501, 5000], 'Very rare': [5001, 50000], Legendary: [50001, 250000] };
  for (const rarity of IT.RARITIES) for (const kind of ['Any', 'Weapon', 'Armor', 'Ring', 'Wand', 'Staff', 'Wondrous item']) for (let i = 0; i < 12; i++) {
    const st = newGenState(g); st.opts.rarity = rarity; st.opts.kind = kind; rollAll(g, st);
    const t = IT.parseType(st.vals.type);
    assert.equal(t.rarity, rarity, st.vals.type);
    if (kind !== 'Any') assert.ok(st.vals.type.startsWith(kind), st.vals.type);
    assert.ok(st.vals.effect.length > 20 && !/\{|undefined/.test(st.vals.effect), st.vals.effect);
    const gp = parseFloat(st.vals.value.match(/About ([\d,]+) gp/)[1].replace(/,/g, ''));
    assert.ok(gp >= range[rarity][0] * 0.95 && gp <= range[rarity][1] * 1.05, rarity + ' ' + gp);
    if (rarity === 'Common') assert.ok(!t.attune && !/\+\d bonus/.test(st.vals.effect), 'common items are minor: ' + st.vals.effect);
    if (t.kind === 'weapon' && rarity === 'Uncommon') assert.match(st.vals.effect, /\+1 bonus/);
    if (t.kind === 'weapon' && rarity === 'Legendary') assert.match(st.vals.effect, /\+3 bonus/);
    if (t.kind === 'wand') assert.match(st.vals.effect, /charge|at will/);
  }
  const catches = curse => { let cursed = 0; for (let i = 0; i < 300; i++) { const st = newGenState(g); st.opts.rarity = 'Rare'; st.opts.curse = curse; rollAll(g, st); if (/cursed/.test(st.vals.catch)) cursed++; } return cursed; };
  assert.equal(catches('Never'), 0); assert.equal(catches('Always'), 300);
  const some = catches('Sometimes'); assert.ok(some > 15 && some < 100, 'about one in six: ' + some);
  // rerolling just the effect keeps the type and rarity
  const st = newGenState(g); st.opts.rarity = 'Rare'; rollAll(g, st);
  const type = st.vals.type; rerollField(g, st, 'effect'); assert.equal(st.vals.type, type);
  const it = IT.makeMagicItem({ rarity: 'Rare', kind: 'Ring', curse: 'Never' });
  assert.equal(IT.parseType(IT.typeLine(it)).kind, 'ring'); assert.ok(!it.cursed);
});

test('potions: the effect belongs to the name, prices follow rarity, healing scales', () => {
  const g = GENERATORS.find(x => x.id === 'potion');
  const heal = { Common: ['Potion of healing', '2d4 + 2'], Uncommon: ['Potion of greater healing', '4d4 + 4'], Rare: ['Potion of superior healing', '8d4 + 8'], 'Very rare': ['Potion of supreme healing', '10d4 + 20'] };
  for (const rarity of Object.keys(heal)) for (let i = 0; i < 8; i++) {
    const st = newGenState(g); st.opts.rarity = rarity; st.opts.kind = 'Healing'; rollAll(g, st);
    if (st.vals.name === 'Potion of vitality') { assert.match(st.vals.effect, /poison and disease/); continue; }   // the other rare healing potion
    assert.equal(st.vals.name, heal[rarity][0]); assert.ok(st.vals.effect.includes(heal[rarity][1]), st.vals.effect);
  }
  for (const kind of ['Any', 'Utility', 'Combat']) for (const rarity of ['Common', 'Uncommon', 'Rare', 'Very rare']) for (let i = 0; i < 10; i++) {
    const st = newGenState(g); st.opts.rarity = rarity; st.opts.kind = kind; rollAll(g, st);
    assert.ok(!/[{}]|undefined/.test(allText(st.vals)));
    const gp = parseFloat(st.vals.value.match(/About ([\d,]+) gp/)[1].replace(/,/g, ''));
    const hi = { Common: 50, Uncommon: 250, Rare: 2500, 'Very rare': 25000 }[rarity];
    assert.ok(gp > 0 && gp <= hi * 1.05, rarity + ' ' + gp);
  }
  assert.equal(IT.makeScroll(0).level, 0); assert.ok(IT.makeScroll(3).level <= 3);
});

test('loot and trinkets: art objects, magic past the first tier, trinket secrets; notes carry the right properties', () => {
  const g = GENERATORS.find(x => x.id === 'loot');
  const withMagic = tier => { let n = 0; for (let i = 0; i < 80; i++) { const st = newGenState(g); st.opts.tier = tier; rollAll(g, st); if (Array.isArray(st.vals.magic)) { n++; for (const m of st.vals.magic) assert.match(m, / — [\d,]+ gp$/); } assert.ok(!/undefined|NaN/.test(JSON.stringify(st.vals))); } return n; };
  assert.equal(withMagic('Moderate (levels 5-10)'), 80); assert.equal(withMagic('Major (levels 11+)'), 80); assert.ok(withMagic('Minor (levels 1-4)') < 40);
  assert.match(IT.artObject(2), /\(about [\d,]+ gp\)$/);
  const t = GENERATORS.find(x => x.id === 'trinket'); const st = newGenState(t);
  assert.equal(st.vals.list.length, 3); assert.ok(IT.TRINKETS_ALL.length >= 55); assert.ok(st.vals.secret.length > 20);
  const sh = GENERATORS.find(x => x.id === 'shop'); const ss = newGenState(sh); ss.opts.type = 'Blacksmith'; rollAll(sh, ss);
  const n = genToNote(sh, ss, 'location', ss.vals.name); assert.equal(n.fm.kind, 'Blacksmith');
  const mg = GENERATORS.find(x => x.id === 'magicitem'); const ms = newGenState(mg); ms.opts.rarity = 'Rare'; rollAll(mg, ms);
  const mn = genToNote(mg, ms, 'item', ms.vals.name); assert.equal(mn.fm.rarity, 'Rare'); assert.equal(mn.fm.kind, ms.vals.type.split(',')[0]);
  const pg = GENERATORS.find(x => x.id === 'potion'); const ps = newGenState(pg); assert.equal(suggestName(pg, ps.vals), ps.vals.name);
  assert.equal(genToNote(pg, ps, 'item', ps.vals.name).fm.rarity, 'Common');
});

test('saved generations are collapsible callouts that do not leak fields into the session note', () => {
  const g = GENERATORS.find(x => x.id === 'shop'); const st = newGenState(g); st.opts.type = 'Blacksmith'; rollAll(g, st);
  const md = genToPrep(g, st.vals);
  const lines = md.split('\n');
  assert.match(lines[0], /^> \[!info\]- Shop — .+/); assert.ok(lines.every(l => l.startsWith('> ')), 'every line is inside the callout');
  assert.ok(lines.some(l => l.startsWith('> - **In stock:**')) && lines.some(l => l.startsWith('>   - ')), 'nested lists keep their indentation');
  assert.match(genToPrep(g, st.vals, { linkTo: 'Iron Hand Smithy' }).split('\n')[0], /^> \[!info\]- Shop — \[\[Iron Hand Smithy\]\]$/);
  const callouts = { npc: 'example', tavern: 'info', magicitem: 'tip', encounter: 'danger', hook: 'quote' };
  for (const [id, kind] of Object.entries(callouts)) { const gg = GENERATORS.find(x => x.id === id); assert.match(genToPrep(gg, newGenState(gg).vals).split('\n')[0], new RegExp('^> \\[!' + kind + '\\]- ')); }
  // inside a session note the facts are not read as that session's own properties, and the block can be updated or reread
  const note = parseNote('C/Sessions/S.md', '# S\n\n## Prep\n\n' + md + '\n');
  assert.deepEqual(note.inline, {}, JSON.stringify(note.inline));
  assert.ok(note.summary === '' || !/In stock|Keeper/.test(note.summary));
});

test('adding links by choice: lands under a heading, skips what is already linked, keeps CRLF and front matter', async () => {
  const { idx } = await linkIdx({
    'C/Factions/AOS.md': '# AOS',
    'C/Locations/Greenhold.md': 'A town.',
    'C/Plot Threads/Bells.md': '# Bells',
    'C/Players/Xir.md': '---\nrace: Elf\n---\n# Xir\r\n\r\nHe knows [[Greenhold]].\r\n',
    'C/NPCs/Iarno.md': '# Iarno\n\n## Related\n- [[Greenhold]]\n\n## Notes\nText\n',
  });
  const t = (...ps) => ps.map(p => idx.byPath.get(p));
  const xir = idx.byPath.get('C/Players/Xir.md').text;
  const r = addLinksToText(xir, t('C/Factions/AOS.md', 'C/Locations/Greenhold.md', 'C/Plot Threads/Bells.md'), idx);
  assert.deepEqual(r.added, ['AOS', 'Bells']);
  assert.deepEqual(r.already, ['Greenhold']);
  assert.ok(r.text.startsWith('---\nrace: Elf\n---\n'));
  assert.ok(r.text.includes('## Related\r\n\r\n- [[AOS]]\r\n- [[Bells]]'), JSON.stringify(r.text));
  assert.ok(!/[^\r]\n/.test(r.text.slice(r.text.indexOf('# Xir'))), 'line endings stay CRLF');
  // an existing heading is reused, and a heading is optional
  const iarno = idx.byPath.get('C/NPCs/Iarno.md').text;
  const r2 = addLinksToText(iarno, t('C/Factions/AOS.md'), idx);
  assert.ok(r2.text.includes('- [[Greenhold]]\n\n- [[AOS]]\n') || r2.text.includes('- [[Greenhold]]\n- [[AOS]]'), JSON.stringify(r2.text));
  assert.equal((r2.text.match(/## Related/g) || []).length, 1);
  assert.ok(r2.text.includes('## Notes\nText'));
  const r3 = addLinksToText(iarno, t('C/Factions/AOS.md'), idx, '');
  assert.ok(r3.text.endsWith('\n- [[AOS]]\n'), JSON.stringify(r3.text));
  assert.deepEqual(addLinksToText(iarno, t('C/Locations/Greenhold.md'), idx).added, []);
});

test('choosing links: grouped by category, most-linked category first, sessions newest first, search hides empty groups', async () => {
  const { idx } = await linkIdx({
    'C/NPCs/Mira.md': '# Mira',
    'C/NPCs/Aldo.md': '# Aldo',
    'C/Locations/Greenhold.md': '# Greenhold',
    'C/Factions/AOS.md': '# AOS',
    'C/Sessions/Session 1.md': '---\ndate: 2026-01-01\nnumber: 1\n---\n# Session 1\n[[Mira]] [[Aldo]] [[Greenhold]]',
    'C/Sessions/Session 2.md': '---\ndate: 2026-02-01\nnumber: 2\n---\n# Session 2\n[[Mira]] [[Greenhold]]',
    'C/Sessions/Session 10.md': '---\ndate: 2026-03-01\nnumber: 10\n---\n# Session 10\n[[Mira]]',
    'C/Bestiary/Goblin.md': '# Goblin\n[[Mira]]',
    'C/Notes.md': '# Loose',
  }, { NPCs: 'npc', Locations: 'location', Factions: 'faction', Sessions: 'session', Bestiary: 'x:Bestiary' });
  const g = groupForLinking(idx, '', 'C/Sessions/Session 10.md');
  assert.deepEqual(g.map(x => x.label), ['NPCs', 'Locations', 'Factions', 'Sessions', 'Bestiary', 'Other notes'].filter(l => g.some(x => x.label === l)));
  assert.equal(g[0].label, 'NPCs', 'four links point at NPCs, the most');
  assert.equal(g[1].label, 'Locations');
  assert.deepEqual(g.find(x => x.label === 'Sessions').notes.map(n => n.name), ['Session 2', 'Session 1'], 'newest first, and the note itself is left out');
  assert.deepEqual(g.find(x => x.label === 'NPCs').notes.map(n => n.name), ['Aldo', 'Mira']);
  assert.equal(g[g.length - 1].label, 'Other notes', 'loose notes go last');
  const q = groupForLinking(idx, 'gre');
  assert.deepEqual(q.map(x => x.label), ['Locations'], 'only groups with a match remain');
  const q2 = groupForLinking(idx, 'session');
  assert.deepEqual(q2.map(x => x.label), ['Sessions']);
  assert.equal(q2[0].notes.length, 3);
});

test('version history: the newest entry is the current VERSION, newest first, every change has a valid kind and text', () => {
  const version = fs.readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
  assert.equal(CHANGELOG[0].version, version, 'add an entry to src/core/changelog.js for every new version');
  const nums = CHANGELOG.map(r => r.version).filter(v => /^\d+\.\d+\.\d+$/.test(v)).map(v => v.split('.').map(Number));
  for (let i = 1; i < nums.length; i++) {
    const [a, b] = [nums[i - 1], nums[i]];
    assert.ok(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2]))), 'newest first: ' + a.join('.') + ' then ' + b.join('.'));
  }
  const seen = new Set();
  for (const r of [...CHANGELOG, ...BEFORE_V2]) {
    assert.ok(!seen.has(r.version), 'duplicate ' + r.version); seen.add(r.version);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.title && r.changes.length, r.version);
    for (const [k, t] of r.changes) { assert.ok(KINDS[k], r.version + ' kind ' + k); assert.ok(typeof t === 'string' && t.length > 10, r.version); }
  }
});

test('session templates: the layout is the DM\'s callout structure, and pasting keeps blank lines around it', () => {
  const full = templateById('session-prep').body;
  for (const h of ['> [!important]+ MUST HAPPEN', '## Locations _(one line each)_', '> [!abstract]+ Places', '## State tracker', '> [!todo]+ Track', '\n---\n', "## NPC's appearing in this episode"]) assert.ok(full.includes(h), h);
  assert.ok(full.includes('> _Everything else is bonus._') && full.includes('> - [ ] \n'), 'blank checkbox lines');
  assert.ok(SESSION_TEMPLATES.every(t => t.id && t.name && t.blurb && t.body.endsWith('\n')));
  const card = templateById('npc-card').body;
  for (const f of ['Voice/mannerisms', 'Look', 'Knows', 'Wants', 'Does', 'Say', 'Stat block']) assert.ok(card.includes('**' + f + ':**'), f);
  // every line of a callout is quoted, so Obsidian keeps it one block
  for (const t of SESSION_TEMPLATES) { let inCallout = false; for (const l of t.body.split('\n')) { if (/^> \[!/.test(l)) inCallout = true; else if (l === '') inCallout = false; else if (inCallout) assert.ok(l.startsWith('>'), t.id + ': ' + l); } }
  // placement
  const a = insertAt('# S\n\nText', 10, 'X\n');
  assert.equal(a.text, '# S\n\nText\n\nX\n');
  const b = insertAt('', 0, 'X\n');
  assert.equal(b.text, 'X\n');
  const c = insertAt('Before\nAfter', 7, 'X\n');
  assert.equal(c.text, 'Before\n\nX\n\nAfter');
  assert.equal(c.caret, 'Before\n\nX'.length);
  const d = insertAt('A\n\nB', 3, 'X\n');
  assert.equal(d.text, 'A\n\nX\n\nB');
});

test('claude prompts: the generated result and the note are in the text that is shown, and nothing else', () => {
  const g = GENERATORS.find(x => x.id === 'shop');
  const st = newGenState(g);
  const p = expandPrompt(g, st.vals, 'Ashfall');
  assert.ok(p.includes('"Ashfall"') && p.includes('read aloud') && p.includes('DM notes:'));
  for (const f of g.fields) assert.ok(p.includes('**' + f.label + ':**'), f.label);
  const q = notePrompt({ text: '---\ntype: npc\n---\n# Iarno\nA wizard.\n\n' }, 'Ashfall');
  assert.ok(q.includes('# Iarno') && q.includes('type: npc') && q.includes('This is all of it that you can see'));
  assert.ok(q.trim().endsWith(QUESTION_MARK), 'ends where the user types the question');
  assert.ok(!q.includes('Kestra'));
});

const BLK = `## Recap

> [!important]+ MUST HAPPEN
> 
> - [x] **Bart** points them
> - [ ] second
>     - nested one
>     - nested two
> - [ ] 
> 
> _Everything else is bonus._

Plain para line one
line two

- a
- b

  more of b
  - child
1. one
2. two
`;

test('edit in place: every heading, paragraph and bullet is traced to its own lines, callouts and nesting included', () => {
  const r = buildBlocks(BLK, BLK);
  assert.ok(r.ok);
  assert.deepEqual(r.blocks.map(b => b.type + '@' + b.start + '-' + b.end), ['heading@0-1', 'blockquote@2-11', 'paragraph@12-14', 'list@15-20', 'list@20-22']);
  const texts = r.units.map(u => u.kind + ':' + unitText(BLK, u));
  for (const want of ['h:Recap', 'p:[!important]+ MUST HAPPEN', 'li:**Bart** points them', 'li:second', 'li:nested one', 'li:', 'p:_Everything else is bonus._', 'p:Plain para line one\nline two', 'li:a', 'li:b', 'p:more of b', 'li:child', 'li:one', 'li:two']) assert.ok(texts.includes(want), want + ' in ' + texts.join(' | '));
  const html = renderBlock(r.blocks[1]);
  assert.equal((html.match(/data-u="/g) || []).length, 7, 'ids on the callout title, five bullets and the last line');
  assert.ok(html.includes('<input type="checkbox" data-task="') && html.includes('checked'));
  assert.ok(renderBlock(r.blocks[0]).includes('<h2 data-u="0">Recap</h2>'));
});

test('edit in place: an edit rewrites only its own lines, keeps the "> " and the indentation, and nothing else changes', () => {
  const r = buildBlocks(BLK, BLK);
  const by = t => r.units.find(u => unitText(BLK, u) === t);
  const lines = b => b.split('\n');
  const diff = (a, b) => { const x = lines(a), y = lines(b); const out = []; for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) out.push(i); return out; };
  let b = applyUnitEdit(BLK, by('second'), 'second, edited');
  assert.equal(lines(b)[5], '> - [ ] second, edited'); assert.deepEqual(diff(BLK, b), [5]);
  b = applyUnitEdit(BLK, by('nested two'), 'deeper');
  assert.equal(lines(b)[7], '>     - deeper'); assert.deepEqual(diff(BLK, b), [7]);
  const blank = r.units.find(u => u.kind === 'li' && u.task === ' ' && unitText(BLK, u) === '');
  b = applyUnitEdit(BLK, blank, 'filled in');
  assert.equal(lines(b)[8], '> - [ ] filled in'); assert.deepEqual(diff(BLK, b), [8]);
  b = applyUnitEdit(BLK, by('Recap'), 'Session recap');
  assert.equal(lines(b)[0], '## Session recap');
  b = applyUnitEdit(BLK, by('Plain para line one\nline two'), 'one\ntwo\nthree');
  assert.deepEqual(lines(b).slice(12, 16), ['one', 'two', 'three', '']);
  b = applyUnitEdit(BLK, by('more of b'), 'changed');
  assert.equal(lines(b)[18], '  changed', 'an indented paragraph keeps its indent');
  b = applyUnitEdit(BLK, by('two'), 'II');
  assert.equal(lines(b)[21], '2. II');
  b = applyUnitEdit(BLK, by('[!important]+ MUST HAPPEN'), '[!important]+ MUST DO');
  assert.equal(lines(b)[2], '> [!important]+ MUST DO');
});

test('edit in place: ticking a box, adding a bullet under one, deleting one, and editing a whole callout', () => {
  const r = buildBlocks(BLK, BLK);
  const by = t => r.units.find(u => unitText(BLK, u) === t);
  const lines = b => b.split('\n');
  assert.equal(lines(toggleTask(BLK, by('**Bart** points them')))[4], '> - [ ] **Bart** points them');
  assert.equal(lines(toggleTask(BLK, by('second')))[5], '> - [x] second');
  assert.equal(toggleTask(BLK, by('a')), BLK, 'a plain bullet is not a checkbox');
  const add = addSibling(BLK, by('second'));
  assert.equal(add.line, 8, 'after its sub-items');
  assert.deepEqual(lines(add.body).slice(4, 10), ['> - [x] **Bart** points them', '> - [ ] second', '>     - nested one', '>     - nested two', '> - [ ] ', '> - [ ] ']);
  assert.equal(lines(addSibling(BLK, by('two')).body)[22], '3. ', 'numbered items count on');
  assert.equal(lines(addSibling(BLK, by('a')).body)[16], '- ');
  assert.deepEqual(lines(removeItem(BLK, by('second'))).slice(3, 8), ['> ', '> - [x] **Bart** points them', '> - [ ] ', '> ', '> _Everything else is bonus._']);
  const q = r.blocks[1];
  assert.equal(blockText(BLK, q).split('\n')[0], '[!important]+ MUST HAPPEN', 'a callout is edited without its > marks');
  const nb = applyBlockEdit(BLK, q, '[!important]+ NEW\n\n- [ ] x\n');
  assert.deepEqual(lines(nb).slice(2, 6), ['> [!important]+ NEW', '>', '> - [ ] x', '']);
  assert.equal(lines(nb).slice(5).join('\n'), lines(BLK).slice(11).join('\n'), 'everything after the callout is untouched');
  assert.equal(unitAt(r.units, 19, 'li').start, 19);
});

test('edit in place: if the lines in the page and the file do not line up, editing is switched off instead of guessing', () => {
  assert.equal(buildBlocks('a\n\nb', 'a\nb').ok, false);
});

test('where you left off: the changed line, the heading above it, and a few words of it', () => {
  const before = '---\ntype: session\n---\n# Session 3\n\n## Recap\n\nThe party arrived.\n\n## Prep\n\n- one\n';
  const after = before.replace('The party arrived.', 'The party arrived at **Phandalin** and met [[Sildar]].');
  const c = describeChange(before, after);
  assert.equal(c.kind, 'edit');
  assert.equal(c.section, 'Recap');
  assert.equal(c.snippet, 'The party arrived at Phandalin and met Sildar.');
  assert.equal(c.line, 4, 'counted from the top of the body (after the properties): # Session 3 is line 0');
  const added = describeChange(before, before + '- two\n');
  assert.equal(added.kind, 'added'); assert.equal(added.section, 'Prep'); assert.equal(added.snippet, 'two');
  const removed = describeChange(before, before.replace('- one\n', ''));
  assert.equal(removed.kind, 'removed'); assert.equal(removed.snippet, 'one');
  assert.equal(describeChange(before, before.replace('type: session', 'type: episode')).kind, 'properties');
  assert.equal(describeChange(before, before), null);
  const crlf = describeChange(before.replace(/\n/g, '\r\n'), after.replace(/\n/g, '\r\n'));
  assert.equal(crlf.line, 4);
  assert.equal(describeChange('a', 'b'.repeat(300)).snippet.length, 110, 'long lines are cut short');
});

test('where you left off: a quick follow-up on the same line replaces the entry, otherwise newest first and capped', () => {
  const e = (ts, line, kind = 'edit') => ({ ts, line, kind, snippet: 'x' + ts });
  let l = addEntry([], e(1000, 5));
  l = addEntry(l, e(20000, 5));
  assert.equal(l.length, 1); assert.equal(l[0].ts, 20000, 'same line within 90 s: one entry');
  l = addEntry(l, e(30000, 9)); l = addEntry(l, e(400000, 9));
  assert.deepEqual(l.map(x => x.ts), [400000, 30000, 20000], 'a different time or line: a new entry on top');
  let many = [];
  for (let i = 0; i < 30; i++) many = addEntry(many, e(i * 1e6, i), 10);
  assert.equal(many.length, 10); assert.equal(many[0].line, 29);
  assert.equal(addEntry([e(1000, 5)], e(2000, 5, 'removed'))[0].kind, 'removed');
  assert.equal(addEntry([e(1000, 5)], e(2000, 5, 'removed')).length, 2, 'a removal is always its own entry');
});

test('where you left off: how long ago, in words', () => {
  const now = Date.UTC(2026, 9, 22, 12, 0, 0);
  assert.equal(timeAgo(now - 10000, now), 'just now');
  assert.equal(timeAgo(now - 60000, now), '1 minute ago');
  assert.equal(timeAgo(now - 25 * 60000, now), '25 minutes ago');
  assert.equal(timeAgo(now - 3 * 3600000, now), '3 hours ago');
  assert.equal(timeAgo(now - 2 * 86400000, now), '2 days ago');
  assert.equal(timeAgo(now - 40 * 86400000, now), '2026-09-12');
});

test('templates go where they belong in a session note: Prep, and the NPC section for an NPC card, never under last session\'s Recap', () => {
  const sess = '# Episode 3\n\n## Prep\n\nSome prep text.\n\n## Recap\n\nLast time: the ferry.\n';
  const prep = templateById('session-prep').body, card = templateById('npc-card').body;
  const a = placeTemplate(sess, 'session-prep', prep);
  assert.equal(a.where, 'under “Prep”');
  const ia = a.text.indexOf('> [!important]+ MUST HAPPEN'), ir = a.text.indexOf('## Recap');
  assert.ok(a.text.indexOf('Some prep text.') < ia && ia < ir, 'after the existing prep, before Recap');
  assert.ok(a.text.endsWith('## Recap\n\nLast time: the ferry.\n'), 'the Recap is untouched');
  assert.equal(a.text.split('\n')[a.line], '> [!important]+ MUST HAPPEN', 'line says where it starts');
  assert.ok(/Some prep text\.\n\n> \[!important\]/.test(a.text) && /\n\n## Locations/.test(a.text));
  // an NPC card with no NPC section goes under Prep, not Recap
  const c1 = placeTemplate(sess, 'npc-card', card);
  assert.ok(c1.text.indexOf('> [!note]- NPC name') < c1.text.indexOf('## Recap'), c1.text);
  // with the session prep in, the NPC card goes under "NPC's appearing in this episode", and the next card under that one
  const c2 = placeTemplate(a.text, 'npc-card', card);
  assert.equal(c2.where, "under “NPC's appearing in this episode”");
  const heading = c2.text.indexOf("## NPC's appearing in this episode");
  assert.ok(heading < c2.text.indexOf('> [!note]- NPC name') && c2.text.indexOf('> [!note]- NPC name') < c2.text.indexOf('## Recap'));
  const c3 = placeTemplate(c2.text, 'npc-card', card);
  assert.equal((c3.text.match(/> \[!note\]- NPC name/g) || []).length, 2);
  assert.ok(c3.text.indexOf('> [!note]- NPC name') < c3.text.lastIndexOf('> [!note]- NPC name') && c3.text.lastIndexOf('> [!note]- NPC name') < c3.text.indexOf('## Recap'));
  // a note with a Recap but no Prep gets a Prep heading before the Recap; one with neither gets it at the end
  const noPrep = placeTemplate('# E\n\n## Recap\n\nr\n', 'npc-card', card);
  assert.ok(noPrep.text.indexOf('## Prep') < noPrep.text.indexOf('> [!note]- NPC name') && noPrep.text.indexOf('> [!note]- NPC name') < noPrep.text.indexOf('## Recap'));
  assert.equal(noPrep.text.split('\n')[noPrep.line], '> [!note]- NPC name — _role or one-line note_');
  const plain = placeTemplate('# E\n\nJust text.\n', 'session-prep', prep);
  assert.equal(plain.where, 'at the end of the note'); assert.ok(plain.text.startsWith('# E\n\nJust text.\n\n> [!important]'));
  const empty = placeTemplate('', 'npc-card', card);
  assert.ok(empty.text.startsWith('> [!note]- NPC name'));
  // a "## Prep" inside a code block is not a heading
  const fenced = placeTemplate('# E\n\n```\n## Prep\n```\n\n## Recap\n\nr\n', 'npc-card', card);
  assert.ok(fenced.text.indexOf('## Prep\n\n> [!note]') > fenced.text.indexOf('```\n\n'), 'made its own Prep before Recap');
});

test('cheat sheet: every card has a unique id, a title and text, and the six abilities and all fifteen conditions are there', () => {
  const cards = allCards([]);
  assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
  assert.ok(cards.every(c => c.title && c.body));
  const ab = cards.find(c => c.id === 'abilities').body;
  for (const a of ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']) assert.ok(ab.includes('**' + a + '**'), a);
  assert.ok((ab.match(/tomato/gi) || []).length >= 6);
  const cond = cards.find(c => c.id === 'conditions').body;
  for (const c of ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious']) assert.ok(cond.includes('**' + c + '**'), c);
  assert.ok(GROUPS.some(g => g.id === 'tips' && g.cards.length >= 10));
});

test('cheat sheet: text is metric only, and nothing is left unconverted', () => {
  assert.equal(unitize('Push {{3 m|10 ft}}.'), 'Push 3 m.');
  for (const c of allCards([])) assert.ok(!/\{\{|\}\}/.test(unitize(c.body)), c.id);
  assert.ok(!/\b\d+ ?(ft|feet|miles?|lb)\b/.test(allCards([]).map(c => unitize(c.body)).join('\n')));
});

test('cheat sheet: your own cards are read from, and written back to, a note; text above the first card is kept', () => {
  const text = '# DM Cheat Sheet\n\nMy notes up here.\n\n## Flanking\n\nAdvantage with an ally opposite.\n\n## Crits\n\nMax the first die.\n';
  const cards = parseCustom(text);
  assert.deepEqual(cards.map(c => [c.id, c.title, c.body]), [['my-flanking', 'Flanking', 'Advantage with an ally opposite.'], ['my-crits', 'Crits', 'Max the first die.']]);
  const out = buildCustom([{ title: 'Flanking', body: 'Changed.' }, cards[1]], text);
  assert.ok(out.startsWith('# DM Cheat Sheet\n\nMy notes up here.\n'));
  assert.deepEqual(parseCustom(out).map(c => c.body), ['Changed.', 'Max the first die.']);
  assert.equal(parseCustom(buildCustom([], '')).length, 0);
  assert.ok(buildCustom([{ title: 'A', body: 'b' }]).startsWith('# DM Cheat Sheet'));
  // a ## inside a code block is not a card, and two cards with the same title get different ids
  assert.equal(parseCustom('## One\n\n```\n## not a card\n```\n').length, 1);
  assert.deepEqual(parseCustom('## Same\n\na\n\n## Same\n\nb').map(c => c.id), ['my-same', 'my-same-2']);
  assert.equal(slug('Flanking (house rule)'), 'flanking-house-rule');
});

test('cheat sheet: search needs every word, in the title or the text', () => {
  const c = { title: 'Grapple', body: 'The target must be **no more than one size larger**' };
  assert.ok(matches(c, '') && matches(c, 'grap') && matches(c, 'size larger') && matches(c, 'LARGER grapple'));
  assert.ok(!matches(c, 'grapple prone'));
});

test('metric: generated feet, miles, pounds and inches are rewritten with the 2024 conversions, always', () => {
  {
    assert.equal(metricize('a 10-foot radius'), 'a 3-metre radius');
    assert.equal(metricize('Rope, 50 ft: 1 gp'), 'Rope, 15 m: 1 gp');
    assert.equal(metricize('within 30 feet'), 'within 9 m');
    assert.equal(metricize('20 × 20 ft'), '6 × 6 m');
    assert.equal(metricize('3 miles away'), '4.5 km away');
    assert.equal(metricize('weighs 15 pounds'), 'weighs 7.5 kg');
    assert.equal(metricize('6 inches above'), '15 cm above');
    assert.deepEqual(metricize(['60 feet', '1 mile']), ['18 m', '1.5 km']);
    assert.equal(metricize('2d6 fire damage, 5 days, Salt, pound'), '2d6 fire damage, 5 days, Salt, pound');
    assert.equal(metricize(42), 42);
  }
});

test('claude tables: which generator tables can take extra rows', () => {
  const npc = GENS_BY_ID.npc;
  const ok = npc.fields.filter(f => fieldMeta(npc, f)).map(f => f.key);
  assert.ok(['quirk', 'voice', 'wants', 'secret', 'role'].every(k => ok.includes(k)), ok.join(','));
  assert.ok(!ok.includes('name') && !ok.includes('race'));          // these depend on another field or on the options
  const m = fieldMeta(npc, npc.fields.find(f => f.key === 'quirk'));
  assert.ok(m.size >= 5 && m.samples.length >= 3 && m.tag === false);
  assert.equal(fieldMeta(GENS_BY_ID.rumors, GENS_BY_ID.rumors.fields[0]).tag, true);       // rumours carry [true]/[false]
  for (const g of GENERATORS) for (const f of g.fields) { const x = fieldMeta(g, f); if (x) assert.ok(x.samples.every(t => typeof t === 'string' && t) && x.size >= x.samples.length, g.id + '/' + f.key); }
});

test('claude tables: extra rows are mixed in when rolling, for single values and for lists, and a rumour keeps its truth marker', () => {
  const npc = GENS_BY_ID.npc, rumors = GENS_BY_ID.rumors;
  setPoolSource(key => (key === 'npc/quirk' ? ['ZZ-ROW-ONE', 'ZZ-ROW-TWO', 'ZZ-ROW-THREE', 'ZZ-ROW-FOUR', 'ZZ-ROW-FIVE', 'ZZ-ROW-SIX', 'ZZ-ROW-SEVEN', 'ZZ-ROW-EIGHT'] : key === 'rumors/list' ? ['ZZ rumour about the bridge', 'ZZ rumour about the mill'] : null));
  try {
    const st = newGenState(npc);
    let hits = 0;
    for (let i = 0; i < 600; i++) { rerollField(npc, st, 'quirk'); if (/^ZZ-ROW/.test(st.vals.quirk)) hits++; }
    assert.ok(hits > 20 && hits < 480, 'hits ' + hits);             // sometimes, not always
    const rs = newGenState(rumors);
    let seen = 0;
    for (let i = 0; i < 400; i++) { rollAll(rumors, rs); assert.equal(rs.vals.list.length, 4); for (const r of rs.vals.list) { assert.match(r, /\[(true|false)\]$/); if (r.startsWith('ZZ ')) seen++; } }
    assert.ok(seen > 5);
    // a table without extra rows, or a locked one, is left alone
    const st2 = newGenState(npc); st2.locks.quirk = true; const q = st2.vals.quirk;
    rollAll(npc, st2); assert.equal(st2.vals.quirk, q);
  } finally { setPoolSource(null); }
  const st3 = newGenState(npc);
  for (let i = 0; i < 100; i++) { rerollField(npc, st3, 'quirk'); assert.ok(!/^ZZ-ROW/.test(st3.vals.quirk)); }
});

test('claude tables: the note of extra rows is read and written, keeping what you wrote above the first section', () => {
  const text = '# Generator Tables\n\nMy own intro.\n\n## NPC · Quirk\n<!-- dmf: npc/quirk -->\n\n- Hums\n- Counts steps\n\n## Tavern · Vibe\n<!-- dmf: tavern/vibe -->\n\n- Smells of pine\n\n## Some heading of mine\n\n- not a pool\n';
  const p = parsePools(text);
  assert.deepEqual(Object.keys(p), ['npc/quirk', 'tavern/vibe']);
  assert.deepEqual(p['npc/quirk'].rows, ['Hums', 'Counts steps']);
  p['npc/quirk'].rows.push('New one');
  const out = buildPools(p, text);
  assert.ok(out.startsWith('# Generator Tables\n\nMy own intro.\n'));
  assert.deepEqual(parsePools(out)['npc/quirk'].rows, ['Hums', 'Counts steps', 'New one']);
  assert.deepEqual(parsePools(out)['tavern/vibe'].rows, ['Smells of pine']);
  assert.deepEqual(parsePools(buildPools({ 'a/b': { title: 'A · B', rows: [] } }, '')), {});       // an empty table is not written
  assert.ok(buildPools({ 'a/b': { title: 'A · B', rows: ['x'] } }).startsWith('# Generator Tables'));
});

test('claude tables: Claude\'s answer is understood however it is wrapped, and repeats are dropped', () => {
  assert.deepEqual(parseAnswer('["one", "two"]').rows, ['one', 'two']);
  assert.deepEqual(parseAnswer('```json\n["one", "two"]\n```').rows, ['one', 'two']);
  assert.deepEqual(parseAnswer('Here you go:\n["one", "two"]\nEnjoy').rows, ['one', 'two']);
  const t = parseAnswer('{"title": "Finds", "rows": ["a", " b  b ", ""]}');
  assert.equal(t.title, 'Finds'); assert.deepEqual(t.rows, ['a', 'b b']);
  assert.deepEqual(parseAnswer('1. first thing\n2. second thing\n- third').rows, ['first thing', 'second thing', 'third']);
  assert.deepEqual(parseAnswer('["x".repeat"]').rows.length >= 0, true);
  assert.deepEqual(parseAnswer('').rows, []);
  const f = freshRows(['Hums.', 'hums', 'New', 'Counts steps'], ['Counts Steps']);
  assert.deepEqual(f.rows, ['Hums.', 'New']); assert.equal(f.dropped, 2);
});

test('claude tables: the questions name the tables, the count and the die, and the campaign only when asked', () => {
  const a = refillPrompt({ gen: 'NPC', tables: [{ key: 'quirk', label: 'Quirk', samples: ['Hums', 'Whistles'], mine: ['Counts'] }], count: 20, context: 'Overview of the campaign "Ashfall":\nGrief.', direction: 'rural' });
  assert.ok(a.includes('"NPC"') && a.includes('"Quirk"') && a.includes('20 NEW entries') && a.includes('- Hums') && a.includes('- Counts') && a.includes('Grief.') && a.includes('rural') && a.endsWith('each holding an array of 20 strings.'));
  const m = refillPrompt({ gen: 'NPC', tables: [{ key: 'quirk', label: 'Quirk', samples: ['Hums'], mine: ['Counts'] }, { key: 'voice', label: 'Voice', samples: ['Soft'], mine: [] }], count: 10, context: '', direction: '' });
  assert.ok(m.includes('2 tables: "Quirk", "Voice"') && m.includes('(key: quirk)') && m.includes('(key: voice)') && m.includes('Entries I have already added to "Quirk"') && !m.includes('already added to "Voice"') && m.includes('keys are exactly "quirk", "voice"'));
  const b = refillPrompt({ gen: 'NPC', tables: [{ key: 'quirk', label: 'Quirk', samples: ['Hums'], mine: [] }], count: 10, context: '', direction: '' });
  assert.ok(!b.includes('About my campaign') && !b.includes('Entries I have already added'));
  const t = tablePrompt({ description: 'things in a chapel', die: 'd8', context: '' });
  assert.ok(t.includes('exactly 8 entries') && t.includes('d8') && t.includes('things in a chapel') && t.includes('"rows"'));
});

test('claude tables: an answer for several tables is split into their lists, however it is wrapped', () => {
  const keys = ['quirk', 'voice', 'wants'];
  const o = parseTables('```json\n{"quirk": ["a", " b  b ", ""], "voice": ["c"], "extra": ["zzz"]}\n```', keys);
  assert.deepEqual(o, { quirk: ['a', 'b b'], voice: ['c'] });         // a table left out is simply missing; keys not asked for are ignored
  assert.deepEqual(parseTables('Here you go: {"wants": ["x"]} Enjoy', keys), { wants: ['x'] });
  assert.deepEqual(parseTables('["one", "two"]', ['quirk']), { quirk: ['one', 'two'] });          // a plain list is fine for a single table
  assert.deepEqual(parseTables('["one", "two"]', keys), {});            // ...but not when it cannot be told which table it is for
  assert.deepEqual(parseTables('', keys), {});
  assert.deepEqual(parseTables('{"quirk": "not a list", "voice": [5, null, {"text": "ok"}]}', keys), { voice: ['ok'] });
});

test('claude tables: the campaign summary has the overview and the names and first lines of notes, and is capped', () => {
  const idx = { notes: [{ type: 'root', name: 'Ashfall', body: 'A slow-burning mystery.' }], byType: {
    npc: [{ name: 'Kestra', body: '# Kestra\n\nA ferrywoman who knows too much.\n' }, { name: 'Bram', body: '' }],
    session: [{ name: 'Session 1', body: 'secret session text' }],
    location: [{ name: 'Greenhold', body: 'A river village.' }] } };
  const c = campaignContext(idx, { name: 'Ashfall' });
  assert.ok(c.includes('Overview of the campaign "Ashfall"') && c.includes('A slow-burning mystery.') && c.includes('- Kestra: A ferrywoman who knows too much.') && c.includes('- Bram') && c.includes('- Greenhold: A river village.'));
  assert.ok(!c.includes('secret session text'));
  const big = { notes: [], byType: { npc: Array.from({ length: 200 }, (_, i) => ({ name: 'Person number ' + i, body: 'x '.repeat(60) })) } };
  assert.ok(campaignContext(big, null, { max: 500, perType: 200 }).length <= 500);
});

test('claude tables: a table of your own is a markdown table that reads back the same', () => {
  const rows = ['A bell', 'A | pipe', 'Third thing'];
  const text = buildTable('Chapel finds', rows);
  assert.ok(text.startsWith('# Chapel finds') && text.includes('| d3 | Result |') && text.includes('| 2 | A \\| pipe |'));
  assert.deepEqual(parseTable('Chapel finds', text).rows, rows);
  const r = rollTable({ rows });
  assert.ok(r.n >= 1 && r.n <= 3 && rows[r.n - 1] === r.text);
  assert.equal(rollTable({ rows: [] }), null);
});

test('generate layout: every generator is in exactly one group and has a description and a layout', () => {
  const ids = GEN_GROUPS.flatMap(g => g.gens);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), GENERATORS.map(g => g.id).sort());
  for (const id of ids) { assert.ok(BLURBS[id] && BLURBS[id].length > 10, id); assert.ok(LAYOUTS[id], id); }
  assert.ok(GEN_GROUPS.every(g => g.title && g.blurb && g.cat));
});

test('generate layout: every generator rolls into a titled page, with no field shown twice', () => {
  for (const g of GENERATORS) {
    for (let i = 0; i < 25; i++) {
      const st = newGenState(g);
      const s = buildSheet(g, st);
      assert.ok(s.title.text && s.title.text.trim(), g.id + ' title');
      const used = [...(s.title.keys || []), ...(s.kicker ? s.kicker.keys : []), ...(s.lead ? s.lead.keys : [])];
      const shown = [...used, ...s.sections.map(x => x.key)];
      assert.equal(new Set(shown).size, shown.length, g.id + ' shows a field twice');
      assert.equal(shown.length, g.fields.length, g.id + ' leaves a field out');
      if (s.kicker) assert.ok(s.kicker.text.trim() && !/undefined|null/.test(s.kicker.text), g.id + ' kicker: ' + s.kicker.text);
      if (s.lead) assert.ok(s.lead.text.trim() && !/undefined|null/.test(s.lead.text), g.id + ' lead: ' + s.lead.text);
      assert.ok(!/undefined|\[object/.test(sheetText(g, st)), g.id);
    }
  }
});

test('generate layout: the pieces read as sentences, and a page with no layout still works', () => {
  assert.equal(end('Found in a barn'), 'Found in a barn.');
  assert.equal(end('Already done.'), 'Already done.');
  assert.equal(end(''), '');
  const st = newGenState(GENS_BY_ID.shop);
  const s = buildSheet(GENS_BY_ID.shop, st);
  assert.ok(/[.!?]$/.test(s.lead.text) && s.lead.text.length > 40);
  assert.ok(s.kicker.text.includes(' · '));
  const fake = { id: 'zzz', name: 'Zed', fields: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] };
  const f = buildSheet(fake, { vals: { a: 'Short', b: ['x', 'y'] }, opts: {}, locks: {}, revealed: {} });
  assert.equal(f.title.text, 'Short');
  assert.deepEqual(f.sections.map(x => [x.key, x.kind]), [['b', 'list']]);
  const none = buildSheet(GENS_BY_ID.loot, { vals: { coins: '5 gp', gems: 'None', art: 'None', items: ['a'], magic: ['b'] }, opts: {}, locks: {}, revealed: {} });
  assert.deepEqual(none.sections.filter(x => x.muted).map(x => x.key), ['gems', 'art']);
});

test('pick several: picks are cleaned to known generators, each once, 1 to 8 copies, 8 in all, and switched-off ones are dropped', () => {
  const known = id => !!GENS_BY_ID[id];
  assert.deepEqual(cleanPicks([{ id: 'npc', qty: 2 }, { id: 'shop', qty: 1 }], known), [{ id: 'npc', qty: 2 }, { id: 'shop', qty: 1 }]);
  assert.deepEqual(cleanPicks([{ id: 'npc', qty: 2 }, { id: 'npc', qty: 5 }], known), [{ id: 'npc', qty: 2 }]);                  // a generator only once
  assert.deepEqual(cleanPicks([{ id: 'nope', qty: 1 }, { id: 'npc' }, null, 7, 'x', { qty: 3 }, { id: 5 }], known), [{ id: 'npc', qty: 1 }]);
  assert.deepEqual(cleanPicks([{ id: 'npc', qty: 999 }], known), [{ id: 'npc', qty: 8 }]);
  assert.deepEqual(cleanPicks([{ id: 'npc', qty: -3 }, { id: 'shop', qty: 'abc' }, { id: 'tavern', qty: '3' }], known), [{ id: 'npc', qty: 1 }, { id: 'shop', qty: 1 }, { id: 'tavern', qty: 3 }]);
  const many = cleanPicks(['npc', 'shop', 'tavern', 'omen', 'quest', 'hook', 'riddle', 'trap', 'loot', 'book'].map(id => ({ id, qty: 3 })), known);
  assert.equal(picksTotal(many), MAX_PICKS);
  assert.ok(many.length >= 3 && many.every(p => p.qty >= 1));
  assert.deepEqual(cleanPicks([{ id: 'npc', qty: 1 }, { id: 'shop', qty: 1 }], known, id => id !== 'npc'), [{ id: 'shop', qty: 1 }]);
  assert.deepEqual(cleanPicks('not a list', known), []);
  assert.deepEqual(cleanPicks(undefined, known), []);
});

test('pick several: the starter combos only use real generators, and the whole page copies as one text', () => {
  for (const c of STARTER_COMBOS) {
    assert.ok(c.id && c.name && c.picks.length);
    assert.deepEqual(cleanPicks(c.picks, id => !!GENS_BY_ID[id]), c.picks, c.name);
  }
  const a = newGenState(GENS_BY_ID.shop), b = newGenState(GENS_BY_ID.npc);
  const t = multiText([{ g: GENS_BY_ID.shop, st: a }, { g: GENS_BY_ID.npc, st: b }]);
  assert.equal((t.match(/\n\n---\n\n/g) || []).length, 1);
  assert.ok(t.includes(buildSheet(GENS_BY_ID.shop, a).title.text) && t.includes(buildSheet(GENS_BY_ID.npc, b).title.text));
  assert.equal(multiText([]), '');
});

const SNAP_BODY = '## Premise and tone\nA slow-burning mystery.\n\n## Where the story is now\nThe party has reached Greenhold.\n\n## Open threads\n- The missing bells\n\n## Factions\n- **[[Cinder Crown]]** runs the inn\n\n## Key people\n- **[[Kestra]]** a ferrywoman\n\n## Places\n- **[[Greenhold]]**\n\n## Recent sessions\n- Session 12: the ferry\n\n## Secrets (DM only)\nKestra took the bells.\n';
const mkNote = (path, name, type, body, fm = {}) => ({ path, name, type, body, fm });

test('snapshot: a fingerprint changes with the text and nothing else', () => {
  assert.equal(fingerprint('hello'), fingerprint('hello'));
  assert.notEqual(fingerprint('hello'), fingerprint('hellp'));
  assert.notEqual(fingerprint(''), fingerprint(' '));
  assert.equal(typeof fingerprint(undefined), 'string');
});

test('snapshot: the notes it reads leave out the ones DM Forge writes itself, and long notes are cut', () => {
  const idx = { notes: [
    mkNote('Ashfall/NPCs/Kestra.md', 'Kestra', 'npc', 'A ferrywoman.', { role: 'Ferrywoman', tags: ['x'] }),
    mkNote('Ashfall/Campaign Snapshot.md', 'Campaign Snapshot', 'root', 'old'),
    mkNote('Ashfall/Generator Tables.md', 'Generator Tables', 'root', 'rows'),
    mkNote('Ashfall/DM Cheat Sheet.md', 'DM Cheat Sheet', 'root', 'cards'),
    mkNote('Ashfall/Custom tables/Chapel.md', 'Chapel', 'other', 'table'),
    mkNote('Ashfall/Sessions/S1.md', 'S1', 'session', 'We met. '.repeat(900)),
  ] };
  const notes = snapshotNotes(idx, { path: 'Ashfall' });
  assert.deepEqual(notes.map(n => n.name), ['Kestra', 'S1']);
  const b = noteBlock(notes[0]);
  assert.ok(b.startsWith('### ') && b.includes('Kestra') && b.includes('role: Ferrywoman') && !b.includes('tags'));
  const long = noteBlock(notes[1]);
  assert.ok(long.length < 4300 && long.includes('the rest of this note is left out'));
});

test('snapshot: a normal campaign is one request, a big one is read in parts, and a single huge note never makes an empty part', () => {
  const small = Array.from({ length: 10 }, (_, i) => mkNote('a/' + i + '.md', 'N' + i, 'npc', 'x'.repeat(500)));
  assert.equal(planSnapshot(small).batches.length, 1);
  assert.equal(planSnapshot(small).count, 10);
  const big = Array.from({ length: 30 }, (_, i) => mkNote('a/' + i + '.md', 'N' + i, 'npc', 'y'.repeat(3900)));
  const p = planSnapshot(big);
  assert.ok(p.batches.length >= 3 && p.batches.every(b => b.length > 0 && b.length <= 46000), p.batches.map(b => b.length).join());
  assert.ok(big.every(n => p.batches.join('').includes(': ' + n.name + '\n')));       // every note is in exactly one part
  assert.equal(planSnapshot([]).batches.length, 0);
  assert.equal(planSnapshot([mkNote('a.md', 'Huge', 'npc', 'z'.repeat(90000))], 1000).batches.length, 1);
});

test('snapshot: the questions ask for the headings, keep secrets in their own section, and join parts', () => {
  const a = snapshotPrompt({ campaign: 'Ashfall', text: '### NPC: Kestra\nA ferrywoman.', secrets: true });
  for (const h of ['Premise and tone', 'Where the story is now', 'Open threads', 'Factions', 'Key people', 'Places', 'Recent sessions', 'Secrets (DM only)']) assert.ok(a.includes('## ' + h), h);
  assert.ok(a.includes('"Ashfall"') && a.includes('A ferrywoman.') && a.includes('1,500 words') && a.includes('only') && a.includes('[[Name]]'));
  const n = snapshotPrompt({ campaign: 'Ashfall', text: 'x', secrets: false });
  assert.ok(!n.includes('Secrets (DM only)') && n.includes('Leave out anything the players do not know yet'));
  const part = snapshotPrompt({ campaign: 'Ashfall', text: 'x', part: 1, parts: 3 });
  assert.ok(part.includes('part 2 of 3') && part.includes('900 words'));
  const m = mergePrompt({ campaign: 'Ashfall', partials: ['## Premise and tone\nA', '## Premise and tone\nB'], secrets: true });
  assert.ok(m.includes('2 partial snapshots') && m.includes('--- part 2 ---') && m.includes('## Secrets (DM only)') && m.includes('remove repeats'));
});

test('snapshot: Claude\'s answer is tidied, and one with too few headings is flagged', () => {
  const ok = cleanSnapshot('Sure! Here it is:\n\n```markdown\n' + SNAP_BODY + '\n```');
  assert.ok(ok.ok && ok.headings.length === 8 && ok.text.startsWith('## Premise and tone') && !ok.text.includes('```') && !ok.text.includes('Sure!'));
  const thin = cleanSnapshot('## Premise and tone\nOnly this.');
  assert.ok(!thin.ok && thin.headings.length === 1);
  assert.ok(!cleanSnapshot('no headings at all').ok);
  assert.equal(cleanSnapshot('').text, '');
  assert.equal(cleanSnapshot(null).text, '');
});

test('snapshot: the note is written and read back, with its fingerprints, and the secrets can be left out when it is used', () => {
  const notes = [mkNote('Ashfall/NPCs/Kestra.md', 'Kestra', 'npc', 'A ferrywoman.')];
  const text = buildSnapshotNote({ body: SNAP_BODY, notes, campaign: 'Ashfall', secrets: true, made: new Date('2026-10-20T10:00:00Z') });
  assert.ok(text.startsWith('# Campaign Snapshot') && text.includes('Made 2026-10-20') && text.includes('<!-- dmf-snapshot:'));
  const s = parseSnapshot(text);
  assert.equal(s.meta.secrets, true);
  assert.deepEqual(Object.keys(s.meta.notes), ['Ashfall/NPCs/Kestra.md']);
  assert.equal(s.made.toISOString(), '2026-10-20T10:00:00.000Z');
  assert.deepEqual(Object.keys(s.sections), ['Premise and tone', 'Where the story is now', 'Open threads', 'Factions', 'Key people', 'Places', 'Recent sessions', 'Secrets (DM only)']);
  assert.equal(s.sections['Secrets (DM only)'], 'Kestra took the bells.');
  const withS = snapshotContext(text, { secrets: true });
  const without = snapshotContext(text, { secrets: false });
  assert.ok(withS.includes('Kestra took the bells.') && !without.includes('Kestra took the bells.') && !without.includes('Secrets') && without.includes('A slow-burning mystery.'));
  assert.ok(!withS.includes('dmf-snapshot') && !withS.includes('Made 2026'));
  assert.ok(snapshotContext(text, { max: 200 }).length <= 200);
  // damaged or missing pieces do not break it
  assert.equal(parseSnapshot(''), null);
  assert.equal(parseSnapshot(null), null);
  const broken = parseSnapshot('# Campaign Snapshot\n<!-- dmf-snapshot: {not json} -->\n## Premise and tone\nHi');
  assert.equal(broken.meta, null);
  assert.equal(compareSnapshot(broken, notes), null);
  assert.equal(describeSnapshot(broken, null), 'Made earlier');
  assert.equal(snapshotContext('', {}), '');
});

test('snapshot: how far the campaign has moved on, and when it is worth refreshing', () => {
  const base = Array.from({ length: 40 }, (_, i) => mkNote('a/N' + i + '.md', 'N' + i, 'npc', 'body ' + i));
  const snap = parseSnapshot(buildSnapshotNote({ body: SNAP_BODY, notes: base, secrets: true, made: new Date('2026-10-20T00:00:00Z') }));
  const same = compareSnapshot(snap, base);
  assert.deepEqual([same.changed.length, same.added.length, same.removed.length, same.affected, same.worth], [0, 0, 0, 0, false]);
  const edit = n => base.map((x, i) => (i < n ? { ...x, body: x.body + ' edited' } : x));
  assert.deepEqual([compareSnapshot(snap, edit(1)).changed.length, compareSnapshot(snap, edit(1)).worth], [1, false]);
  assert.equal(compareSnapshot(snap, edit(4)).worth, false);                        // 4 of 40 is under both thresholds
  assert.equal(compareSnapshot(snap, edit(5)).worth, true);                         // 5 notes
  const few = Array.from({ length: 20 }, (_, i) => mkNote('b/N' + i + '.md', 'N' + i, 'npc', 'b' + i));
  const snap2 = parseSnapshot(buildSnapshotNote({ body: SNAP_BODY, notes: few, secrets: true }));
  assert.equal(compareSnapshot(snap2, few.map((x, i) => (i < 3 ? { ...x, body: 'changed' } : x))).worth, true);          // 3 of 20 is 15%
  assert.equal(compareSnapshot(snap2, few.map((x, i) => (i < 2 ? { ...x, body: 'changed' } : x))).worth, false);         // 2 of 20 is 10%
  const withSession = [...base, mkNote('a/Sessions/S13.md', 'S13', 'session', 'new')];
  const c = compareSnapshot(snap, withSession);
  assert.deepEqual([c.added, c.sessions, c.worth], [['a/Sessions/S13.md'], true, true]);                                 // one new session is enough
  const gone = compareSnapshot(snap, base.slice(1));
  assert.deepEqual([gone.removed, gone.affected], [['a/N0.md'], 1]);
  const now = new Date('2026-10-24T12:00:00Z').getTime();
  assert.equal(describeSnapshot(snap, compareSnapshot(snap, base), now), 'Made 4 days ago · nothing has changed since');
  assert.equal(describeSnapshot(snap, compareSnapshot(snap, [...edit(3).slice(1), mkNote('a/new.md', 'new', 'npc', 'x')]), now), 'Made 4 days ago · 2 notes changed, 1 new, 1 removed');
  assert.equal(describeSnapshot(snap, null, new Date('2026-10-20T20:00:00Z').getTime()), 'Made today');
  assert.equal(describeSnapshot(snap, null, new Date('2026-10-21T20:00:00Z').getTime()), 'Made yesterday');
  assert.equal(describeSnapshot(null, null), '');
});

test('inspiration: a section of a note is found by its heading, down to the next heading of the same or higher level', () => {
  const body = '# Name\n\nIntro.\n\n## Wants\nTo be left alone.\n\n### Sub\nnested\n\n## Secret\nHe did it.\n';
  assert.equal(sectionText(body, /^wants?$/i), 'To be left alone.\n\n### Sub\nnested');
  assert.equal(sectionText(body, /^secrets?$/i), 'He did it.');
  assert.equal(sectionText(body, /^nope$/i), '');
  assert.equal(sectionText('', /x/), '');
  assert.equal(sectionText(null, /x/), '');
});

test('inspiration: the live context has the story so far, threads with next steps, the players, wants, ties and secrets, and the secrets can stay out', () => {
  const idx = {
    notes: [mkNote('A/Ashfall.md', 'Ashfall', 'root', 'A slow mystery.'), mkNote('A/NPCs/Hush.md', 'Hush', 'npc', 'A smuggler.\n\n## Secret\nHe sold the bells.')],
    byType: {
      session: [mkNote('A/S/1.md', 'S1', 'session', '## Recap\nThe party arrived.', { number: 1 }), mkNote('A/S/2.md', 'S2', 'session', '## Prep\nstuff\n\n## Recap\nThey took the ferry.', { number: 2 }), mkNote('A/S/3.md', 'S3', 'session', 'no recap yet', { number: 3 })],
      plot: [mkNote('A/P/old.md', 'Old thread', 'plot', 'Done long ago.', { status: 'Resolved' }), mkNote('A/P/bells.md', 'The Bells', 'plot', 'Bells vanished.\n\n## Next steps\n- Ask Tam\n- Search the chapel', { status: 'Active' })],
      player: [mkNote('A/Pl/k.md', 'Kestra', 'player', 'A rogue.', { race: 'Tiefling', class: 'Rogue' })],
      npc: [{ ...mkNote('A/NPCs/Hush.md', 'Hush', 'npc', 'A smuggler.\n\n## Wants\nTo be left alone.\n\n## Secret\nHe sold the bells.', { role: 'Smuggler' }), links: ['Tam', 'Hush', 'Tam#x'] }],
    },
  };
  const c = campaignContext(idx, { name: 'Ashfall' });
  assert.ok(c.includes('Overview of the campaign "Ashfall"'));
  const story = c.slice(c.indexOf('Where the story is now'), c.indexOf('Plot threads'));
  assert.ok(story.indexOf('S2: They took the ferry.') < story.indexOf('S1: The party arrived.') && !story.includes('S3') && !story.includes('stuff'), story);   // newest first, recaps only
  assert.ok(c.indexOf('- The Bells (Active)') < c.indexOf('- Old thread (Resolved)') && c.includes('Next: Ask Tam; Search the chapel'));   // active threads first
  assert.ok(c.includes('The player characters:\n- Kestra (Tiefling, Rogue)'));
  assert.ok(c.includes('- Hush (Smuggler): A smuggler. Wants: To be left alone. DM-only: He sold the bells. Tied to: Tam.') && !c.includes('..'));
  assert.ok(liveHasSecrets(idx));
  const quiet = campaignContext(idx, { name: 'Ashfall' }, { secrets: false });
  assert.ok(!quiet.includes('DM-only') && !quiet.includes('sold the bells') && quiet.includes('Wants: To be left alone'));
  assert.ok(!liveHasSecrets({ notes: [mkNote('a.md', 'a', 'npc', 'x')] }));
  const short = campaignContext(idx, { name: 'Ashfall' }, { max: 300 });
  assert.ok(short.length <= 300 && short.startsWith('Overview of the campaign'));
});

test('inspiration: the three strengths ask for more and more, the strong one is the default, and what is sent says it matters', () => {
  assert.deepEqual(STRENGTHS.map(x => x[0]), ['light', 'strong', 'max']);
  assert.ok(inspirationText('light').includes('make sense on their own') && !inspirationText('light').includes('two out of every three'));
  assert.ok(inspirationText('strong').includes('two out of every three') && inspirationText('strong').includes('players can see the connection'));
  assert.ok(inspirationText('max').includes('Every single entry must name') && inspirationText('max').includes('real names'));
  assert.equal(inspirationText(undefined), inspirationText('strong'));
  assert.ok(!inspirationText('strong', false).includes('The examples above'));
  const t = [{ key: 'quirk', label: 'Quirk', samples: ['a'], mine: [] }];
  const p = refillPrompt({ gen: 'NPC', tables: t, count: 5, context: 'CTX' });
  assert.ok(p.includes('This is the most important part') && p.includes('two out of every three') && p.indexOf('CTX') < p.indexOf('two out of every three'));
  assert.ok(refillPrompt({ gen: 'NPC', tables: t, count: 5, context: 'CTX', strength: 'max' }).includes('Every single entry'));
  assert.ok(!refillPrompt({ gen: 'NPC', tables: t, count: 5, context: '', strength: 'max' }).includes('Every single entry'));
  assert.ok(tablePrompt({ description: 'x', die: 'd6', context: 'CTX' }).includes('two out of every three'));
});

/* ---- session log and close out (2.19) ---- */
import { buildLine, appendLogLine, parseLog, removeLastLogLine, toggleLogTask, mentionMatches, mentionAt, fmtTime } from '../src/core/sessionlog.js';
import { getSection, playersRecap, closeoutPrompt, parseCloseout, plainCloseout, applySessionParts, applyNoteUpdate, updateLine, closeoutContext } from '../src/core/closeout.js';

test('log lines: time, tag, tasks for promises and hooks, one line only', () => {
  assert.equal(buildLine({ time: '20:41', text: 'The ferryman   is\nthe smuggler', tag: 'reveal' }), '- 20:41 #reveal The ferryman is the smuggler');
  assert.equal(buildLine({ time: '9:05', text: 'We owe the monk a favour', tag: 'promise' }), '- [ ] 9:05 #promise We owe the monk a favour');
  assert.equal(buildLine({ time: '20:41', text: '   ' }), '');
  assert.match(buildLine({ text: 'now' }), /^- \d\d:\d\d now$/);
  assert.match(fmtTime(new Date(2026, 0, 1, 7, 3)), /^07:03$/);
});

test('the log block is made under "Session log" the first time, and lines are added inside it afterwards', () => {
  let b = '# Session 4\n\n## Prep\n\nstuff\n\n## Recap\n';
  b = appendLogLine(b, '- 20:01 one');
  assert.ok(b.includes('## Session log') && b.includes('<!-- dmforge:log -->') && b.includes('- 20:01 one'));
  b = appendLogLine(b, '- 20:05 two');
  assert.equal(b.match(/<!-- dmforge:log -->/g).length, 1);
  assert.deepEqual(parseLog(b).map(e => e.text), ['one', 'two']);
  assert.ok(b.indexOf('- 20:01 one') < b.indexOf('- 20:05 two') && b.indexOf('- 20:05 two') < b.indexOf('<!-- /dmforge:log -->'));
  assert.ok(b.includes('## Prep\n\nstuff'));
});

test('lines you add in Obsidian inside the block are kept; Windows line endings stay', () => {
  let b = '## Session log\r\n\r\n<!-- dmforge:log -->\r\n- 20:01 one\r\n- my own line\r\n<!-- /dmforge:log -->\r\n';
  b = appendLogLine(b, '- 20:09 two');
  assert.ok(b.includes('- my own line') && b.includes('- 20:09 two'));
  assert.ok(!/[^\r]\n/.test(b), 'no bare LF added');
});

test('parseLog reads time, tags and tasks, and undo removes only the last line', () => {
  let b = appendLogLine('', '- 20:01 #reveal The bells were sold');
  b = appendLogLine(b, '- [ ] 20:10 #promise Return the lantern');
  b = appendLogLine(b, '- [x] 20:11 #hook Old map');
  const e = parseLog(b);
  assert.equal(e.length, 3);
  assert.deepEqual([e[0].time, e[0].text, e[0].tags, e[0].task], ['20:01', 'The bells were sold', ['reveal'], false]);
  assert.deepEqual([e[1].task, e[1].done, e[1].tags], [true, false, ['promise']]);
  assert.equal(e[2].done, true);
  const u = removeLastLogLine(b);
  assert.equal(parseLog(u).length, 2);
  assert.equal(removeLastLogLine(''), null);
});

test('ticking a promise in the log flips only that line', () => {
  let b = appendLogLine('', '- [ ] 20:10 #promise Return the lantern');
  b = appendLogLine(b, '- [ ] 20:12 #hook Old map');
  const raw = parseLog(b)[0].raw;
  const t = toggleLogTask(b, raw);
  assert.deepEqual(parseLog(t).map(x => x.done), [true, false]);
  assert.deepEqual(parseLog(toggleLogTask(t, parseLog(t)[0].raw)).map(x => x.done), [false, false]);
  assert.equal(toggleLogTask(b, 'nope'), null);
});

test('@name: finds the fragment at the caret and the notes it could mean', () => {
  assert.deepEqual(mentionAt('met @Hu', 7), { start: 4, frag: 'Hu' });
  assert.equal(mentionAt('no mention here', 15), null);
  assert.equal(mentionAt('email a@b', 9), null);
  const notes = [{ name: 'Hush Marlow' }, { name: 'Shushan' }, { name: 'Hugo' }, { name: 'Thaewen' }];
  assert.deepEqual(mentionMatches(notes, 'hu').map(n => n.name), ['Hugo', 'Hush Marlow', 'Shushan']);
  assert.deepEqual(mentionMatches(notes, ''), []);
});

const mkIdx = notes => {
  const byName = new Map(notes.map(n => [n.name.toLowerCase(), n]));
  return { notes, resolve: t => byName.get(String(t).toLowerCase()) || null };
};

test('the players\' recap is read from the Recap section, without what DM Forge wrote there', () => {
  const body = '## Prep\nx\n\n## Recap\nThey took the boat.\n<!-- dmforge:x -->\nhidden\n<!-- /dmforge:x -->\n\n## Next\n';
  assert.equal(getSection(body, 'Recap'), 'They took the boat.\n<!-- dmforge:x -->\nhidden\n<!-- /dmforge:x -->\n');
  assert.equal(playersRecap(body), 'They took the boat.');
  assert.equal(playersRecap('## Players recap\nA\n\n## Recap\nB\n'), 'A');
  assert.equal(playersRecap('## Prep\nx'), '');
});

test('close out: the question holds the log, the threads and NPCs, and asks for JSON; the answer is checked', () => {
  const session = { name: 'Session 4', links: ['Hush Marlow'], text: '---\nnumber: 4\n---\n## Prep\nGo to the ferry\n\n## Session log\n\n<!-- dmforge:log -->\n- 20:01 #reveal Hush sold the bells\n- [ ] 20:10 #promise Return the lantern\n<!-- /dmforge:log -->\n\n## Recap\nThey fought bandits.\n' };
  const idx = mkIdx([
    { name: 'Hush Marlow', type: 'npc', path: 'C/NPCs/Hush Marlow.md', fm: { status: 'Alive' }, summary: 'Ferryman' },
    { name: 'Other', type: 'npc', path: 'C/NPCs/Other.md', fm: {}, summary: '' },
    { name: 'The Bells', type: 'plot', path: 'C/Plot Threads/The Bells.md', fm: { status: 'Active' }, summary: 'Who sold them' },
    { name: 'Done', type: 'plot', path: 'C/Plot Threads/Done.md', fm: { status: 'Resolved' }, summary: '' },
  ]);
  const ctx = closeoutContext({ session, idx });
  assert.ok(ctx.log.includes('20:01 [reveal] Hush sold the bells') && ctx.recap === 'They fought bandits.');
  assert.deepEqual(ctx.npcs.map(n => n.name), ['Hush Marlow']);
  assert.deepEqual(ctx.threads.map(n => n.name), ['The Bells']);
  const p = closeoutPrompt({ campaign: 'Ashfall', session: 'Session 4', ctx });
  assert.ok(p.includes('JSON object') && p.includes('"differences"') && p.includes('Hush sold the bells') && p.includes('The Bells (Active)') && p.includes('THE PLAYERS\' RECAP'));
  assert.ok(!closeoutPrompt({ campaign: '', session: 'S', ctx: { ...ctx, recap: '' } }).includes('"differences"'));
  const ans = '```json\n' + JSON.stringify({ recap: '- They learned the truth', threads: [{ name: 'The Bells', status: 'resolved', text: 'Found the buyer' }, { name: 'Nope', status: 'Active', text: 'x' }], npcs: [{ name: 'Hush Marlow', status: 'Missing', text: 'Fled' }, { name: 'Hush Marlow', status: 'Zombie', text: '' }], next: ['Find the buyer', 'Find the buyer'], differences: ['They missed the bells'] }) + '\n```';
  const r = parseCloseout(ans, idx);
  assert.equal(r.recap, '- They learned the truth');
  assert.deepEqual(r.threads.map(t => [t.name, t.path !== '', t.status]), [['The Bells', true, 'Resolved'], ['Nope', false, 'Active']]);
  assert.deepEqual(r.npcs.map(t => [t.status, t.text]), [['Missing', 'Fled']]);
  assert.deepEqual(r.differences, ['They missed the bells']);
  assert.equal(parseCloseout('not json at all', idx), null);
  assert.equal(parseCloseout('{"recap":"","threads":[],"npcs":[],"next":[]}', idx), null);
});

test('close out without Claude: the log becomes a recap, open promises and hooks become next-time tasks', () => {
  let b = appendLogLine('', '- 20:01 #reveal Hush sold the bells');
  b = appendLogLine(b, '- [ ] 20:10 #promise Return the lantern');
  b = appendLogLine(b, '- [x] 20:11 #hook Old map');
  const r = plainCloseout(b);
  assert.equal(r.recap, '- 20:01 (reveal) Hush sold the bells');
  assert.deepEqual(r.next, ['Return the lantern']);
});

test('applying: marked blocks that update on a second run; next-time keeps ticks and does not repeat', () => {
  const base = '---\nnumber: 4\n---\n# Session 4\n\n## Recap\nTheirs.\n';
  let t = applySessionParts(base, { recap: '- one', next: ['Find the buyer', 'Return the lantern'], check: ['They missed the bells'] });
  assert.ok(t.includes('## DM recap') && t.includes('- one') && t.includes('## Next time') && t.includes('- [ ] Find the buyer') && t.includes('## Recap check'));
  assert.ok(t.includes('## Recap\nTheirs.'), 'the players recap is untouched');
  t = t.replace('- [ ] Find the buyer', '- [x] Find the buyer');
  t = applySessionParts(t, { recap: '- two', next: ['find the buyer', 'Bury the bell'] });
  assert.equal(t.match(/## DM recap/g).length, 1);
  assert.ok(t.includes('- two') && !t.includes('- one'));
  assert.ok(t.includes('- [x] Find the buyer') && t.includes('- [ ] Bury the bell') && (t.match(/Find the buyer/gi) || []).length === 1);
  assert.equal(applySessionParts(base, {}), base);
});

test('applying to a thread or NPC: status only when it changes, one linked line, never twice', () => {
  const npc = '---\nstatus: Alive\nrace: Elf\n---\n# Hush\n\nFerryman.\n';
  const line = updateLine('Session 4', '2026-10-30', 'Fled upriver');
  assert.equal(line, '- [[Session 4]] (2026-10-30): Fled upriver');
  let t = applyNoteUpdate(npc, { status: 'Missing', line });
  assert.ok(t.includes('status: Missing') && t.includes('race: Elf') && t.includes('## Session updates') && t.includes(line));
  assert.equal(applyNoteUpdate(t, { status: 'Missing', line }), t);
  assert.equal(applyNoteUpdate(npc, { status: 'alive' }), npc);
  assert.ok(applyNoteUpdate('# Plain\n', { status: 'Active', line }).startsWith('---\nstatus: Active\n---'));
});

/* ---- what am I forgetting? (2.20) ---- */
import { forgetting, mustHappen, nextTime, flipTaskLine, forgettingMarkdown, addForgettingToPrep, sinceText } from '../src/core/forgetting.js';

function forgetIdx(files) {
  const notes = Object.entries(files).map(([p, text]) => {
    const n = parseNote(p, text);
    n.type = p.split('/')[1] === 'NPCs' ? 'npc' : p.split('/')[1] === 'Plot Threads' ? 'plot' : p.split('/')[1] === 'Sessions' ? 'session' : 'other';
    return n;
  });
  const byName = new Map(notes.map(n => [n.name.toLowerCase(), n]));
  const byType = {};
  for (const n of notes) (byType[n.type] = byType[n.type] || []).push(n);
  byType.session.sort((a, b) => b.name.localeCompare(a.name));
  const backlinks = new Map();
  for (const n of notes) for (const l of n.links) { const r = byName.get(l.toLowerCase()); if (r) { if (!backlinks.has(r.path)) backlinks.set(r.path, []); backlinks.get(r.path).push(n); } }
  return { notes, byType, backlinks, resolve: t => byName.get(String(t).toLowerCase()) || null };
}
const session = (n, body) => ['C/Sessions/S' + n + '.md', '---\nnumber: ' + n + '\n---\n# S' + n + '\n' + body];

test('forgetting: threads and NPCs that have gone quiet, by sessions since a link or a plain mention', () => {
  const files = Object.fromEntries([
    ['C/NPCs/Hush Marlow.md', '---\nstatus: Alive\n---\n# Hush Marlow'],
    ['C/NPCs/Old Tam.md', '---\nstatus: Alive\n---\n# Old Tam'],
    ['C/NPCs/Dead Dan.md', '---\nstatus: Dead\n---\n# Dead Dan'],
    ['C/NPCs/Never Seen.md', '# Never Seen'],
    ['C/Plot Threads/The Bells.md', '---\nstatus: Active\n---\n# The Bells\n\n## Next steps\n- Ask [[Old Tam]] who he ferried\n- Search the chapel\n'],
    ['C/Plot Threads/The Well.md', '---\nstatus: Active\n---\n# The Well'],
    ['C/Plot Threads/Old Quest.md', '---\nstatus: Resolved\n---\n# Old Quest'],
    ['C/Plot Threads/Fresh.md', '---\nstatus: Active\n---\n# Fresh'],
    session(1, 'Met [[Hush Marlow]] and [[Dead Dan]]. The Bells rang. Old Tam waved.'),
    session(2, 'Quiet travel.'),
    session(3, 'More travel.'),
    session(4, 'Arrived. [[Fresh]] began.'),
  ]);
  const f = forgetting(forgetIdx(files), { after: 3 });
  assert.equal(f.sessionCount, 4);
  const th = Object.fromEntries(f.threads.map(t => [t.name, t]));
  assert.ok(th['The Bells'] && th['The Bells'].since === 3 && th['The Bells'].next === 'Ask Old Tam who he ferried');
  assert.ok(th['The Well'] && th['The Well'].never);
  assert.ok(!th['Old Quest'] && !th['Fresh']);
  assert.equal(sinceText(th['The Bells']), 'not mentioned for 3 sessions');
  assert.equal(sinceText(th['The Well']), 'never mentioned in a session');
  assert.deepEqual(f.threads.map(t => t.name), ['The Well', 'The Bells']);
  assert.deepEqual(f.npcs.map(n => n.name).sort(), ['Hush Marlow', 'Old Tam']);
  assert.equal(forgetting(forgetIdx(files), { after: 5 }).threads.length, 0);
  assert.equal(forgetting(forgetIdx(files), { after: 2 }).threads.find(t => t.name === 'The Bells').since, 3);
});

test('forgetting: a campaign with too few sessions does not call things neglected', () => {
  const f = forgetting(forgetIdx(Object.fromEntries([['C/Plot Threads/A.md', '# A'], session(1, 'x')])), { after: 3 });
  assert.equal(f.threads.length, 0);
});

test('forgetting: MUST HAPPEN items, Next time tasks and unticked log promises are collected', () => {
  const prep = '## Prep\n> [!important]+ MUST HAPPEN\n> \n> - [ ] Tell them about the bells\n> - [x] Introduce Hush\n> - [ ] \n> \n> _Everything else is bonus._\n\n> [!tip]+ Table rules\n> - [ ] not me\n';
  assert.deepEqual(mustHappen(prep).map(m => m.text), ['Tell them about the bells']);
  assert.equal(mustHappen(prep)[0].raw, '> - [ ] Tell them about the bells');
  assert.deepEqual(nextTime('## Next time\n\n<!-- dmforge:next -->\n- [ ] Find the buyer\n- [x] Done thing\n<!-- /dmforge:next -->\n').map(m => m.text), ['Find the buyer']);
  const files = Object.fromEntries([
    session(2, prep + '\n## Next time\n- [ ] Find the buyer\n\n## Session log\n\n<!-- dmforge:log -->\n- 20:01 note\n- [ ] 20:10 #promise Return the lantern\n- [x] 20:11 #hook Old map\n<!-- /dmforge:log -->\n'),
    session(1, '## Next time\n- [ ] find the buyer\n'),
  ]);
  const f = forgetting(forgetIdx(files), { after: 3 });
  assert.deepEqual(f.carry.map(c => [c.kind, c.text, c.session]), [['must', 'Tell them about the bells', 'S2'], ['next', 'Find the buyer', 'S2']]);
  assert.deepEqual(f.promises.map(p => [p.text, p.tag]), [['Return the lantern', 'promise']]);
  assert.equal(f.total, 3);
});

test('ticking a task line, and the checklist written into the prep', () => {
  const t = 'a\n> - [ ] Tell them\r\n- [ ] other\n';
  assert.equal(flipTaskLine(t, '> - [ ] Tell them'), 'a\n> - [x] Tell them\r\n- [ ] other\n');
  assert.equal(flipTaskLine(t, 'missing'), null);
  assert.equal(flipTaskLine('- [x] done', '- [x] done'), '- [ ] done');
  const f = { carry: [{ kind: 'must', text: 'Tell them', session: 'S2' }], promises: [{ text: 'Return the lantern', tag: 'promise', session: 'S2' }], threads: [{ name: 'The Bells', never: false, since: 3, next: 'Ask Tam' }], npcs: [{ name: 'Hush', never: false, since: 4 }] };
  const md = forgettingMarkdown(f);
  assert.ok(md.startsWith('**Before we start**') && md.includes('- [ ] Tell them _(must happen, S2)_') && md.includes('- [ ] [[The Bells]]: not mentioned for 3 sessions. Next: Ask Tam') && md.includes('[[Hush]]: not mentioned for 4 sessions'));
  const out = addForgettingToPrep('---\nnumber: 5\n---\n# S5\n\n## Prep\nstuff\n\n## Recap\n', f);
  assert.ok(out.startsWith('---\nnumber: 5\n---') && out.indexOf('Before we start') > out.indexOf('stuff') && out.indexOf('Before we start') < out.indexOf('## Recap'));
  assert.equal(addForgettingToPrep(out, f), out, 'doing it again changes nothing');
});

/* ---- combat polish and the monster library (2.21) ---- */
import { loadSrd, searchMonsters, monsterTypes, crLabel, parseCr, crXp, noteMonster, combatSpec, statBlockMarkdown, monsterNote, hpOf, bestiaryNotes, SRD_CREDIT, CR_XP, CR_STEPS } from '../src/core/monsters.js';

test('combat: temporary hit points take damage first and do not stack', () => {
  const c = combat.newCombat();
  combat.addCombatant(c, { name: 'Kestra', init: 10, hp: 20, pc: true });
  const id = c.combatants[0].id;
  combat.setTemp(c, id, 8); combat.setTemp(c, id, 5);
  assert.equal(c.combatants[0].temp, 8);
  combat.setTemp(c, id, 12);
  assert.equal(c.combatants[0].temp, 12);
  combat.damage(c, id, 5);
  assert.deepEqual([c.combatants[0].temp, c.combatants[0].hp], [7, 20]);
  combat.damage(c, id, 10);
  assert.deepEqual([c.combatants[0].temp, c.combatants[0].hp], [0, 17]);
  combat.setTemp(c, id, 3); combat.clearTemp(c, id);
  assert.equal(c.combatants[0].temp, 0);
});

test('combat: death saves for a player at 0, healing and a natural 20 bring them back, three failures end it', () => {
  const c = combat.newCombat();
  combat.addCombatant(c, { name: 'Bram', init: 10, hp: 12, pc: true });
  combat.addCombatant(c, { name: 'Goblin', init: 5, hp: 7 });
  const [bram, gob] = c.combatants;
  assert.equal(combat.deathState(bram), '');
  combat.deathSave(c, bram.id, 'fail');                      // not at 0 yet: nothing happens
  assert.equal(bram.ds.f, 0);
  combat.damage(c, bram.id, 50);
  assert.equal(combat.deathState(bram), 'dying');
  combat.deathSave(c, bram.id, 'success'); combat.deathSave(c, bram.id, 'fail');
  assert.deepEqual([bram.ds.s, bram.ds.f], [1, 1]);
  combat.deathSave(c, bram.id, 'undo-fail');
  assert.equal(bram.ds.f, 0);
  combat.deathSave(c, bram.id, 'crit'); combat.deathSave(c, bram.id, 'fail');
  assert.equal(combat.deathState(bram), 'dead');
  assert.equal(combat.isDown(bram), true);
  combat.deathSave(c, bram.id, 'reset');
  combat.deathSave(c, bram.id, 'success'); combat.deathSave(c, bram.id, 'success'); combat.deathSave(c, bram.id, 'success');
  assert.equal(combat.deathState(bram), 'stable');
  combat.deathSave(c, bram.id, 'nat20');
  assert.deepEqual([bram.hp, combat.deathState(bram)], [1, '']);
  combat.damage(c, bram.id, 5); combat.deathSave(c, bram.id, 'fail');
  combat.heal(c, bram.id, 4);
  assert.deepEqual([bram.hp, bram.ds.f], [4, 0]);
  combat.damage(c, gob.id, 99);
  assert.equal(combat.deathState(gob), '');
  assert.ok(combat.summaryMarkdown(c, '2026-11-01').includes('Bram 4/12'));
});

test('combat: reactions come back and legendary actions refill when a turn begins; recharge and per-day abilities', () => {
  const c = combat.newCombat();
  combat.addCombatant(c, { name: 'Dragon', init: 20, hp: 200, legendary: 3, uses: [{ name: 'Fire Breath (Recharge 5–6)', kind: 'recharge', n: 5 }, { name: 'Dominate (2/Day)', kind: 'day', n: 2 }] });
  combat.addCombatant(c, { name: 'Kestra', init: 10, hp: 10, pc: true });
  const [d, k] = c.combatants;
  assert.deepEqual(d.leg, { n: 3, max: 3 });
  combat.legendary(c, d.id, -2); assert.equal(d.leg.n, 1);
  combat.legendary(c, d.id, -5); assert.equal(d.leg.n, 0);
  combat.toggleReaction(c, d.id); assert.equal(d.reaction, true);
  combat.nextTurn(c); combat.nextTurn(c);               // Kestra, then back to the dragon
  assert.deepEqual([d.reaction, d.leg.n], [false, 3]);
  combat.useAbility(c, d.id, 0); assert.equal(d.uses[0].left, 0);
  assert.equal(combat.rollRecharge(c, d.id, 0, () => 4), 4); assert.equal(d.uses[0].left, 0);
  assert.equal(combat.rollRecharge(c, d.id, 0, () => 5), 5); assert.equal(d.uses[0].left, 1);
  combat.useAbility(c, d.id, 1); combat.useAbility(c, d.id, 1); combat.useAbility(c, d.id, 1);
  assert.equal(d.uses[1].left, 0);
  combat.useAbility(c, d.id, 1, +1); assert.equal(d.uses[1].left, 1);
  assert.equal(combat.rollRecharge(c, d.id, 1), null);
  combat.setNote(c, d.id, 'Concentrating on Haste'); assert.equal(d.note, 'Concentrating on Haste');
  assert.ok(combat.CONDITIONS.includes('Exhaustion') && combat.CONDITIONS.includes('Petrified'));
});

test('combat: a fight saved by an older version (no temp, death saves or counters) still works', () => {
  const old = { id: 'x', round: 1, turn: 0, seq: 2, combatants: [{ id: 'a', name: 'Old', init: 5, hp: 5, maxHp: 5, ac: null, pc: true, conds: [], order: 0 }, { id: 'b', name: 'Orc', init: 3, hp: 5, maxHp: 5, ac: null, pc: false, conds: [], order: 1 }] };
  combat.damage(old, 'a', 3); combat.heal(old, 'a', 1); combat.setTemp(old, 'a', 4); combat.deathSave(old, 'a', 'fail');
  combat.legendary(old, 'b', -1); combat.useAbility(old, 'b', 0); combat.toggleReaction(old, 'b');
  combat.nextTurn(old); combat.nextTurn(old);
  assert.equal(old.combatants[0].hp, 3);
  assert.ok(combat.summaryMarkdown(old, 'd').includes('Old 3/5'));
});

test('monsters: the SRD set unpacks (331 creatures, 2024 rules) and is searchable', async () => {
  const list = await loadSrd();
  assert.equal(list.length, 331);
  const gob = list.find(m => m.n === 'Goblin Warrior');
  assert.ok(gob && gob.cr === 0.25 && gob.ac >= 12 && gob.hp === 10 && typeof gob.ini === 'number' && gob.key === 'srd:' + gob.id);
  const dragon = list.find(m => m.n === 'Adult Red Dragon');
  assert.ok(dragon.la.length > 0 && dragon.uses.some(u => u[1] === 'recharge'));
  assert.equal(searchMonsters(list, { q: 'goblin' })[0].n.startsWith('Goblin'), true);
  assert.ok(searchMonsters(list, { q: 'dragon', crMin: 10 }).every(m => m.cr >= 10 && /dragon/i.test(m.n + m.t)));
  assert.ok(searchMonsters(list, { crMax: 0.25, type: 'beast' }).every(m => m.cr <= 0.25 && m.t === 'beast'));
  assert.ok(monsterTypes(list).includes('undead') && monsterTypes(list).includes('dragon'));
  assert.equal(searchMonsters(list, { q: 'zzzznope' }).length, 0);
  assert.ok(SRD_CREDIT.includes('Creative Commons Attribution 4.0'));
});

test('monsters: challenge ratings and their XP', () => {
  assert.deepEqual([0, 0.125, 0.25, 0.5, 1, 17, 30].map(crLabel), ['0', '1/8', '1/4', '1/2', '1', '17', '30']);
  assert.deepEqual(['1/4', '1/8', '3', '0.5', '', 'x'].map(parseCr), [0.25, 0.125, 3, 0.5, null, null]);
  assert.deepEqual([0.25, 1, 5, 20, 30].map(crXp), [50, 200, 1800, 25000, 155000]);
  assert.equal(CR_STEPS.length, 34);
  assert.equal(Object.keys(CR_XP).length, 34);
});

test('monsters: HP can be the average or rolled from the dice; a spec has what the tracker needs', async () => {
  const list = await loadSrd();
  const wolf = list.find(m => m.n === 'Wolf');
  assert.equal(hpOf(wolf, false), wolf.hp);
  for (let i = 0; i < 20; i++) { const h = hpOf(wolf, true); assert.ok(h >= 4 && h <= 18, 'wolf 2d8+2 gives ' + h); }
  const spec = combatSpec(list.find(m => m.n === 'Adult Red Dragon'));
  assert.ok(spec.legendary === 3 && spec.uses.length >= 1 && spec.mon === 'srd:adult-red-dragon' && spec.hp === spec.maxHp && spec.bonus === 12);
  assert.equal(combatSpec({ n: 'X', hp: 0, ini: 2, la: [], uses: [] }).hp, 1);
});

test('monsters: your own Bestiary notes (properties, or "AC 15" in the text) become monster records', () => {
  const a = noteMonster({ path: 'C/Bestiary/Ash Wight.md', name: 'Ash Wight', body: '# Ash Wight\nA dead thing.', fm: { cr: '1/2', ac: 13, hp: 22, init: 2, creature: 'undead' }, inline: {} });
  assert.deepEqual([a.key, a.cr, a.ac, a.hp, a.ini, a.t, a.src, a.mine], ['note:C/Bestiary/Ash Wight.md', 0.5, 13, 22, 2, 'undead', 'note', true]);
  const b = noteMonster({ path: 'C/Monsters/Crow.md', name: 'Crow', body: '**AC** 12 · **HP** 9 · **Initiative** +3\n**CR** 1/8', fm: {}, inline: {} });
  assert.deepEqual([b.ac, b.hp, b.ini, b.cr], [12, 9, 3, 0.125]);
  const c = noteMonster({ path: 'C/Monsters/Blob.md', name: 'Blob', body: 'nothing here', fm: {}, inline: {} });
  assert.deepEqual([c.ac, c.hp, c.ini, c.cr], [null, null, 0, null]);
  assert.equal(combatSpec(c).hp, 1);
  const idx = { notes: [{ top: 'Bestiary', type: 'other', path: 'a/Bestiary/A.md' }, { top: 'monsters', type: 'other', path: 'a/monsters/B.md' }, { top: 'NPCs', type: 'npc', path: 'a/NPCs/C.md' }, { top: 'Sessions', type: 'session', path: 'a/Sessions/D.md' }] };
  assert.equal(bestiaryNotes(idx).length, 2);
});

test('monsters: the stat block as markdown (always metric) and as a new Bestiary note', async () => {
  const list = await loadSrd();
  const aboleth = list.find(m => m.n === 'Aboleth');
  const imp = statBlockMarkdown(aboleth);
  assert.ok(imp.includes('**AC** 17') && imp.includes('**Initiative** +7') && imp.includes('| 21 (+5) |') && imp.includes('### Actions') && imp.includes('### Legendary Actions') && imp.includes('Consume Memories'));
  assert.ok(imp.includes('(XP 5,900)'));
  const met = imp;
  assert.ok(met.includes('3 m., Swim 12 m.') || met.includes('3 m, Swim 12 m'), met.split('\n').find(l => l.includes('Speed')));
  assert.ok(!/\b30 feet\b/.test(met));
  const n = monsterNote(aboleth);
  assert.deepEqual([n.fm.cr, n.fm.ac, n.fm.hp, n.fm.init, n.fm.creature], ['10', 17, 150, 7, 'aberration']);
  assert.ok(n.body.startsWith('# Aboleth') && n.body.includes('System Reference Document 5.2.1'));
});

/* ---- the party and the encounter budget (2.22) ---- */
import { XP_BUDGET, budgetFor, difficulty, fitCounts, absentOf, withPresence, partyRows } from '../src/core/party.js';

test('party: the 2024 per-character budget table, added up for the party', () => {
  assert.equal(Object.keys(XP_BUDGET).length, 20);
  assert.deepEqual(XP_BUDGET[1], [50, 75, 100]);
  assert.deepEqual(XP_BUDGET[20], [6400, 13200, 22000]);
  for (let l = 2; l <= 20; l++) for (let t = 0; t < 3; t++) assert.ok(XP_BUDGET[l][t] > XP_BUDGET[l - 1][t], 'level ' + l + ' tier ' + t + ' goes up');
  for (let l = 1; l <= 20; l++) assert.ok(XP_BUDGET[l][0] < XP_BUDGET[l][1] && XP_BUDGET[l][1] < XP_BUDGET[l][2]);
  assert.deepEqual(budgetFor([5, 5, 5, 5]), { low: 2000, moderate: 3000, high: 4400, n: 4 });
  assert.deepEqual(budgetFor([1, 20]), { low: 6450, moderate: 13275, high: 22100, n: 2 });
  assert.deepEqual(budgetFor([0, null, 'x', 25, 3.4]), { low: 6400 + 150, moderate: 13200 + 225, high: 22000 + 400, n: 2 });
  assert.deepEqual(budgetFor([]), { low: 0, moderate: 0, high: 0, n: 0 });
});

test('party: how hard monsters are, and how many of one fit', () => {
  const b = budgetFor([5, 5, 5, 5]);
  assert.equal(difficulty(0, b).tier, 'empty');
  assert.equal(difficulty(100, budgetFor([])).tier, 'none');
  assert.deepEqual(['low', 'moderate', 'high', 'over'], [1500, 2001, 3001, 4401].map(t => difficulty(t, b).tier));
  assert.equal(difficulty(2000, b).tier, 'low');
  assert.equal(difficulty(4400, b).tier, 'high');
  assert.equal(difficulty(4401, b).label, 'Beyond High');
  assert.deepEqual(fitCounts(450, b), { low: 4, moderate: 6, high: 9 });
  assert.deepEqual(fitCounts(0, b), { low: 0, moderate: 0, high: 0 });
});

test('party: who is away is a list on the session note, and nobody away removes it', () => {
  assert.deepEqual(absentOf({ absent: ['Bram', '[[Sorrel]]'] }), ['Bram', 'Sorrel']);
  assert.deepEqual(absentOf({ Absent: 'Bram, Kestra' }), ['Bram', 'Kestra']);
  assert.deepEqual(absentOf({}), []);
  const note = '---\nnumber: 4\n---\n# S4\n';
  const a = withPresence(note, [], 'Bram', false);
  assert.ok(a.includes('absent:') && a.includes('  - Bram') && a.includes('number: 4'));
  const b = withPresence(a, ['Bram'], 'Kestra', false);
  assert.ok(b.includes('Bram') && b.includes('Kestra'));
  const c = withPresence(b, ['Bram', 'Kestra'], 'bram', true);
  assert.ok(!c.includes('Bram') && c.includes('Kestra'));
  const d = withPresence(c, ['Kestra'], 'Kestra', true);
  assert.ok(!d.includes('absent') && d.includes('number: 4'));
});

test('party: a row for each player, with the stats from their note and who is here', () => {
  const mk = (name, fm) => { const n = parseNote('C/Players/' + name + '.md', '---\n' + Object.entries(fm).map(([k, v]) => k + ': ' + v).join('\n') + '\n---\n# ' + name); return n; };
  const idx = { byType: { player: [mk('Kestra', { level: 5, hp: 38, ac: 16, perception: 14, gold: '1,250', xp: 6500 }), mk('Bram', { level: 4 })] } };
  const rows = partyRows(idx, ['bram']);
  assert.deepEqual(rows.map(r => [r.name, r.level, r.hp, r.ac, r.perception, r.gold, r.xp, r.here]), [['Kestra', 5, 38, 16, 14, 1250, 6500, true], ['Bram', 4, null, null, null, null, null, false]]);
  assert.ok(TYPES.player.fields.some(f => f.key === 'perception') && TYPES.player.fields.some(f => f.key === 'gold'));
});

/* ---- writing a field back where it lives (2.23) ---- */
import { writeField, mergeValue } from '../src/core/fieldwrite.js';
const PF = fieldDefs => TYPES.player.fields.find(f => f.key === fieldDefs);

test('field write: a property is updated in place, under the key the note already uses', () => {
  const t = '---\nLevel: 3\nclass: Rogue\n---\n# Kestra\n\nBody text.\n';
  const out = writeField(t, PF('level'), '4');
  assert.equal(out, '---\nLevel: 4\nclass: Rogue\n---\n# Kestra\n\nBody text.\n');
  assert.ok(writeField('---\nlvl: 3\n---\n# K', PF('level'), 7).includes('lvl: 7') && !writeField('---\nlvl: 3\n---\n# K', PF('level'), 7).includes('level:'));
  assert.ok(!writeField(t, PF('level'), '').includes('Level'));
});

test('field write: an inline line ("Level:: 5", "**HP:** 38") is edited where it is, and no property is added', () => {
  const t = '# Kestra\n\n- **Class:** Rogue\n- **HP:** 38\n- **AC:** 16\nLevel:: 5\n\nNotes **HP:** 99 later\n';
  let o = writeField(t, PF('hp'), '40');
  assert.equal(o, t.replace('**HP:** 38', '**HP:** 40'));
  assert.ok(!o.startsWith('---'));
  o = writeField(t, PF('level'), 6);
  assert.equal(o, t.replace('Level:: 5', 'Level:: 6'));
  o = writeField(t, PF('ac'), '17');
  assert.ok(o.includes('- **AC:** 17'));
  o = writeField(t, PF('hp'), '');
  assert.ok(o.includes('- **HP:** \n') || o.includes('- **HP:**\n') || /- \*\*HP:\*\*\s*\n/.test(o));
});

test('field write: aliases are found, words and ranges around the number are kept, code is ignored', () => {
  assert.ok(writeField('# K\n\nPassive Perception:: 12\n', PF('perception'), 14).includes('Passive Perception:: 14'));
  assert.equal(mergeValue('5th', 6), '6th');
  assert.equal(mergeValue('1,250 gp', 1300), '1300 gp');
  assert.equal(mergeValue('30/38', 40, 'hp'), '30/40');
  assert.equal(mergeValue('30/38', 4, 'level'), '4/38');
  assert.equal(mergeValue('12', 14), '14');
  assert.equal(mergeValue('', 14), '14');
  assert.equal(mergeValue('abc', 14), '14');
  const code = '# K\n\n```\nHP:: 1\n```\n\nHP:: 20\n';
  assert.equal(writeField(code, PF('hp'), 25), code.replace('HP:: 20', 'HP:: 25'));
});

test('field write: with the value nowhere, a property is added; Windows line endings stay', () => {
  const t = '# K\n\nJust prose.\n';
  const o = writeField(t, PF('gold'), 1250);
  assert.ok(o.startsWith('---\ngold: 1250\n---\n') && o.endsWith('# K\n\nJust prose.\n'));
  assert.equal(writeField(t, PF('gold'), ''), t);
  const crlf = '# K\r\n\r\n**HP:** 38\r\n**AC:** 16\r\n';
  const out = writeField(crlf, PF('hp'), 40);
  assert.equal(out, '# K\r\n\r\n**HP:** 40\r\n**AC:** 16\r\n');
  const fmCrlf = '---\r\nlevel: 2\r\n---\r\n# K\r\n';
  assert.ok(writeField(fmCrlf, PF('level'), 3).includes('level: 3'));
});

/* ---- the combat log (2.23) ---- */
test('combat log: set-up is not logged; the first turn change or event opens it with the initiative order', () => {
  const c = combat.newCombat();
  combat.addCombatant(c, { name: 'Dragon', init: 24, hp: 100 });
  combat.addCombatant(c, { name: 'Tyler', init: 17, hp: 20, pc: true });
  const byName = n => c.combatants.find(x => x.name === n);
  combat.rollFor(c, byName('Dragon').id); combat.setInit(c, byName('Dragon').id, 24); combat.setInit(c, byName('Tyler').id, 17);
  assert.deepEqual(c.log || [], [], 'nothing before the fight begins');
  combat.damage(c, byName('Tyler').id, 5);
  const kinds = c.log.map(e => e.kind);
  assert.deepEqual(kinds, ['init', 'turn', 'event']);
  assert.equal(c.log[0].text, 'Initiative: Dragon 24, Tyler 17');
  assert.equal(c.log[1].t, 'Dragon');
  assert.equal(c.log[2].text, 'Tyler took 5 (20 → 15)');
  assert.equal(c.log[2].t, 'Dragon', 'it says whose turn it was');
});

test('combat log: what each change says', () => {
  const c = combat.newCombat();
  combat.addCombatant(c, { name: 'Dragon', init: 24, hp: 100, legendary: 3, uses: [{ name: 'Fire Breath (Recharge 5–6)', kind: 'recharge', n: 5 }, { name: 'Dominate (2/Day)', kind: 'day', n: 2 }] });
  combat.addCombatant(c, { name: 'Tyler', init: 17, hp: 10, pc: true });
  const [d, t] = c.combatants;
  combat.setTemp(c, t.id, 4); combat.damage(c, t.id, 6); combat.damage(c, t.id, 99);
  combat.deathSave(c, t.id, 'fail'); combat.deathSave(c, t.id, 'crit');
  combat.heal(c, t.id, 3);
  combat.toggleCondition(c, d.id, 'Frightened'); combat.toggleCondition(c, d.id, 'Frightened');
  combat.legendary(c, d.id, -1); combat.useAbility(c, d.id, 0); combat.rollRecharge(c, d.id, 0, () => 2); combat.rollRecharge(c, d.id, 0, () => 6);
  combat.useAbility(c, d.id, 1); combat.toggleReaction(c, d.id);
  combat.addCombatant(c, { name: 'Wolf', init: 5, hp: 5 }); combat.removeCombatant(c, c.combatants[2].id);
  combat.addLogNote(c, '  The   dragon roars  ');
  const text = c.log.filter(e => e.kind === 'event' || e.kind === 'note').map(e => e.text);
  assert.deepEqual(text, [
    'Tyler gained 4 temporary hit points',
    'Tyler took 6 (10 → 8), 4 absorbed by temporary hit points',
    'Tyler took 99 (8 → 0): down, dying',
    'Tyler death save: fail (0 successes, 1 failures)',
    'Tyler was hit while dying: two failures (0 successes, 3 failures): dead',
    'Tyler healed 3 (0 → 3): back up',
    'Dragon is now Frightened',
    'Dragon is no longer Frightened',
    'Dragon used a legendary action (2/3 left)',
    'Dragon’s Fire Breath is spent',
    'Dragon rolled 2 to recharge Fire Breath: still spent',
    'Dragon rolled 6 to recharge Fire Breath: recharged',
    'Dragon used Dominate (1/2 left)',
    'Dragon used its reaction',
    text[14],
    'Wolf left the fight',
    'Note: The dragon roars',
  ]);
  assert.match(text[14], /^Wolf joined the fight \(initiative \d+\)$/);
});

test('combat log: turns are headings, quiet turns are joined, rounds count, typing an initiative is one change', () => {
  const c = combat.newCombat();
  combat.addCombatant(c, { name: 'Dragon', init: 24, hp: 100 });
  combat.addCombatant(c, { name: 'Tyler', init: 17, hp: 20, pc: true });
  combat.addCombatant(c, { name: 'Angelo', init: 1, hp: 20, pc: true });
  const [d, t, a] = c.combatants;
  combat.damage(c, t.id, 25);
  combat.nextTurn(c); combat.damage(c, d.id, 22);
  combat.nextTurn(c);
  combat.nextTurn(c);
  combat.toggleCondition(c, t.id, 'Frightened');
  const g = combat.logGroups(c);
  assert.deepEqual(g.map(r => r.r), [1, 2]);
  assert.deepEqual(g[0].turns.map(x => [x.name, x.events.length]), [['Dragon', 1], ['Tyler', 1], ['Angelo', 0]]);
  const md = combat.logMarkdown(c, '2026-11-01');
  assert.ok(md.startsWith('> [!note]- Combat log: 2026-11-01 (2 rounds)'));
  assert.ok(md.includes('> **Round 1**') && md.includes('> - Initiative: Dragon 24, Tyler 17, Angelo 1') && md.includes('> - ▶ **Dragon**\n>   - Tyler took 25 (20 → 0)') && md.includes('> - Nothing logged: Angelo') && md.includes('> **Round 2**'));
  assert.ok(md.split('\n').every(l => l.startsWith('>')), 'one callout');
  combat.setInit(c, a.id, 5); combat.setInit(c, a.id, 55); combat.setInit(c, a.id, 5);
  assert.equal(c.log.filter(e => e.kind === 'initset').length, 1);
  assert.ok(c.log.some(e => e.text === 'Angelo’s initiative set to 5'));
  assert.equal(combat.logMarkdown(combat.newCombat(), 'd'), '');
});

test('combat log: a fight from an older version has no log and still works', () => {
  const old = { id: 'x', round: 1, turn: 0, seq: 1, combatants: [{ id: 'a', name: 'Old', init: 5, hp: 5, maxHp: 5, ac: null, pc: false, conds: [], order: 0 }] };
  combat.damage(old, 'a', 2); combat.nextTurn(old);
  assert.equal(old.log.length > 0, true);
  assert.ok(combat.logMarkdown(old, 'd').includes('Old took 2 (5 → 3)'));
});

/* ---- dice, spells, rules, scenes (2.24) ---- */
import { parseDice, rollDice, normalize, expressionFor, MAX_DICE } from '../src/core/roller.js';
import { loadSpells, searchSpells, spellMarkdown, spellNote, levelName, SCHOOLS, SPELL_CLASSES } from '../src/core/spells.js';
import { CONDITION_RULES, ruleFor } from '../src/core/rules.js';
import { parseScenes, currentScene, pace, sceneLine, finishScene, fmtClock } from '../src/core/scenes.js';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('dice: expressions are parsed and bad ones refused', () => {
  assert.equal(normalize('2D6 + 3'), '2d6+3');
  assert.equal(normalize('d20'), 'd20');
  assert.equal(normalize('4d6kh3'), '4d6kh3');
  assert.equal(normalize('1d8 + 1d6 − 2'), 'd8+d6-2');
  assert.equal(normalize('d%'), 'd100');
  assert.equal(normalize('-d4+10'), '-d4+10');
  for (const bad of ['', 'abc', '5', '2d', 'd1', 'd1001', '2d6 3', '2d6++3', '4d6kh5', '201d6', '1d6+1d6+d6x', null, undefined]) assert.equal(parseDice(bad), null, String(bad));
  assert.equal(MAX_DICE, 200);
  assert.equal(parseDice('200d6').length, 1);
  assert.equal(parseDice('100d6+101d4'), null);
});

test('dice: totals, keep highest or lowest, signs and modifiers', () => {
  let r = rollDice('2d6+3', { rng: seq(4, 5) });
  assert.deepEqual([r.total, r.detail, r.crit, r.fumble], [12, '2d6 [4, 5] + 3', false, false]);
  r = rollDice('4d6kh3', { rng: seq(6, 1, 5, 4) });
  assert.equal(r.total, 15); assert.ok(r.detail.includes('keep [6, 5, 4]'));
  r = rollDice('4d6kl1', { rng: seq(6, 1, 5, 4) });
  assert.equal(r.total, 1);
  r = rollDice('d8-d4-1', { rng: seq(7, 2) });
  assert.equal(r.total, 4);
  assert.equal(rollDice('nope'), null);
  for (let i = 0; i < 200; i++) { const x = rollDice('3d6+2'); assert.ok(x.total >= 5 && x.total <= 20); }
});

test('dice: advantage and disadvantage on a d20, natural 20 and natural 1', () => {
  let r = rollDice('d20+5', { mode: 'adv', rng: seq(7, 15) });
  assert.deepEqual([r.total, r.mode], [20, 'adv']); assert.ok(r.detail.includes('[7, 15] adv → 15'));
  r = rollDice('d20+5', { mode: 'dis', rng: seq(7, 15) });
  assert.equal(r.total, 12);
  r = rollDice('d20', { rng: seq(20) });
  assert.deepEqual([r.crit, r.fumble], [true, false]);
  r = rollDice('d20', { rng: seq(1) });
  assert.deepEqual([r.crit, r.fumble], [false, true]);
  r = rollDice('d20', { mode: 'adv', rng: seq(1, 20) });
  assert.deepEqual([r.total, r.crit], [20, true]);
  r = rollDice('2d6', { mode: 'adv', rng: seq(3, 4) });
  assert.equal(r.total, 7, 'advantage only touches a single d20');
  r = rollDice('d20+d4', { rng: seq(20, 2) });
  assert.equal(r.crit, true);
});

test('dice: what a click in a note rolls', () => {
  assert.equal(expressionFor('2d6 + 5'), '2d6+5');
  assert.equal(expressionFor('+9'), 'd20+9');
  assert.equal(expressionFor('−2'), 'd20-2');
  assert.equal(expressionFor('hello'), '');
});

test('spells: the SRD set unpacks (339 spells) and can be searched and filtered', async () => {
  const list = await loadSpells();
  assert.equal(list.length, 339);
  const fb = list.find(s => s.n === 'Fireball');
  assert.ok(fb && fb.lv === 3 && fb.sc === 'Evocation' && fb.cl.includes('Wizard') && fb.cl.includes('Sorcerer') && fb.cp.includes('V, S, M') && fb.dm === '8d6' && fb.key === 'spell:fireball');
  assert.equal(searchSpells(list, { q: 'fireb' })[0].n, 'Fireball');
  assert.ok(searchSpells(list, { level: 0 }).every(s => s.lv === 0) && searchSpells(list, { level: 0 }).length === 27);
  assert.ok(searchSpells(list, { cls: 'Cleric', school: 'Necromancy' }).every(s => s.cl.includes('Cleric') && s.sc === 'Necromancy'));
  assert.ok(searchSpells(list, { concentration: true }).every(s => s.cn) && searchSpells(list, { ritual: true }).every(s => s.ri));
  assert.ok(searchSpells(list, { q: 'radiant' }).length > 3, 'it also looks in the text');
  assert.equal(searchSpells(list, { q: 'zzzznope' }).length, 0);
  assert.ok(SCHOOLS.every(sc => list.some(s => s.sc === sc)) && SPELL_CLASSES.every(c => list.some(s => s.cl.includes(c))));
  assert.deepEqual([levelName(0), levelName(1), levelName(2), levelName(3), levelName(9)], ['Cantrip', '1st level', '2nd level', '3rd level', '9th level']);
});

test('spells: the markdown (always metric) and a note from a spell', async () => {
  const list = await loadSpells();
  const fb = list.find(s => s.n === 'Fireball');
  const imp = spellMarkdown(fb);
  assert.ok(imp.startsWith('*3rd level evocation') && imp.includes('**Casting Time** Action') && imp.includes('**Range** 45 m') && imp.includes('8d6 Fire damage') && imp.includes('Using a Higher-Level Spell Slot'));
  assert.ok(!spellMarkdown(fb).includes('150 feet'));
  const conc = list.find(s => s.cn);
  assert.ok(spellMarkdown(conc).includes('Concentration, up to'));
  const n = spellNote(fb);
  assert.deepEqual([n.fm.level, n.fm.school, n.fm.concentration], [3, 'Evocation', false]);
  assert.ok(n.body.startsWith('# Fireball') && n.body.includes('System Reference Document 5.2.1'));
});

test('rules: every condition in the tracker has a reminder', () => {
  for (const c of combat.CONDITIONS) assert.ok(ruleFor(c).length > 20, c);
  assert.equal(ruleFor('Nonsense'), '');
  assert.ok(CONDITION_RULES.Frightened.includes('Disadvantage'));
});

test('scenes: planned scenes under "## Scenes", the one being played, pace, and finishing one', () => {
  const body = '# S\n\n## Scenes\n\n- [x] Arrival at the inn (15 min) — took 25 min\n- [x] A quiet word (10 min)\n- [ ] The ambush at the ford (20 min)\n- [ ] Aftermath (15 min)\n- not a task\n\n## Recap\n- [ ] not a scene (5 min)\n';
  const sc = parseScenes(body);
  assert.deepEqual(sc.map(s => [s.name, s.est, s.took, s.done]), [['Arrival at the inn', 15, 25, true], ['A quiet word', 10, null, true], ['The ambush at the ford', 20, null, false], ['Aftermath', 15, null, false]]);
  assert.equal(currentScene(sc).name, 'The ambush at the ford');
  const p = pace(sc, 50, 5);
  assert.deepEqual([p.planned, p.done, p.total, p.delta, p.left], [60, 2, 4, 10, 35]);
  assert.equal(pace(sc, 70, 30).delta, 20, 'running over the scene being played counts');
  assert.equal(pace([], 10).planned, 0);
  assert.equal(sceneLine('  The   Chase ', 25), '- [ ] The Chase (25 min)');
  assert.equal(sceneLine('Free play', 0), '- [ ] Free play');
  const f = finishScene(body, 22);
  assert.equal(f.from, '- [ ] The ambush at the ford (20 min)');
  assert.equal(f.to, '- [x] The ambush at the ford (20 min) — took 22 min');
  assert.equal(finishScene('## Scenes\n- [x] Done (5 min)\n', 5), null);
  assert.deepEqual(parseScenes('no scenes here'), []);
  assert.equal(fmtClock(0), '0:00'); assert.equal(fmtClock(65000), '1:05'); assert.equal(fmtClock(3725000), '1:02:05');
});

/* ---- renaming a note (2.24) ---- */
import { renameLinks, headingOf, setHeading, planRename, cleanName } from '../src/core/rename.js';

test('rename: every kind of link to the note follows it, and nothing in code does', () => {
  const t = 'See [[Old Name]] and [[old name|the elf]], [[Old Name#Wants]], [[Old Name#^b1|x]], ![[Old Name]] and [[folder/Old Name]] or [[Old Name.md]].\nAlso [[Other]] and ![[Old Name.png]].\n`[[Old Name]]` and\n```\n[[Old Name]]\n```\n---\nlocation: "[[Old Name]]"';
  const r = renameLinks(t, 'Old Name', 'New');
  assert.equal(r.count, 7 + 1);
  assert.ok(r.text.includes('See [[New]] and [[New|the elf]], [[New#Wants]], [[New#^b1|x]], ![[New]] and [[folder/New]] or [[New.md]].'));
  assert.ok(r.text.includes('![[Old Name.png]]') && r.text.includes('[[Other]]'), 'an image of the same name is left alone');
  assert.ok(r.text.includes('`[[Old Name]]`') && r.text.includes('```\n[[Old Name]]\n```'), 'code is left alone');
  assert.ok(r.text.includes('location: "[[New]]"'), 'properties follow');
  assert.equal(renameLinks('[[Old Name]] [[Old Name|x]]', 'Old Name', 'New', { keepAlias: true }).text, '[[New|Old Name]] [[New|x]]');
  assert.equal(renameLinks('nothing', 'Old', 'New').count, 0);
  assert.equal(renameLinks('[[Older]] [[Old Name Two]]', 'Old Name', 'New').count, 0);
});

test('rename: names are made safe, and the title heading is found and changed', () => {
  assert.equal(cleanName('  LeBron: James?  '), 'LeBron James');
  assert.equal(cleanName('a/b\\c|d'), 'abcd');
  assert.equal(cleanName('...'), '');
  assert.equal(cleanName('Name. '), 'Name');
  assert.equal(headingOf('intro\n# Angelo - LeBron\n\nbody'), 'Angelo - LeBron');
  assert.equal(setHeading('intro\n# Angelo - LeBron\n\nbody', 'LeBron James'), 'intro\n# LeBron James\n\nbody');
  assert.equal(headingOf('## only h2'), '');
});

function renameIdx(files) {
  const notes = Object.entries(files).map(([p, text]) => { const n = parseNote(p, text); n.rel = p.split('/').slice(1).join('/'); return n; });
  const byName = new Map();
  for (const n of notes) { const k = n.name.toLowerCase(); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(n); }
  const byPath = new Map(notes.map(n => [n.path, n]));
  const working = { get: p => files[p], has: p => p in files };
  return { idx: { notes, byName, byPath }, working };
}

test('rename: a plan changes the file name, the heading and the links in other notes, and says what it did', () => {
  const files = {
    'C/Players/Angelo - LeBron James.md': '---\nlevel: 3\n---\n# Angelo - LeBron James\n\nHe met [[Angelo - LeBron James]] (himself) once.\n',
    'C/Sessions/S1.md': '# S1\n\n[[Angelo - LeBron James]] arrived. Also [[Angelo - LeBron James|LeBron]].\n',
    'C/NPCs/Tam.md': '---\nfriend: "[[Angelo - LeBron James]]"\n---\n# Tam\n',
    'C/NPCs/Unrelated.md': '# Unrelated\n[[Someone Else]]\n',
  };
  const { idx, working } = renameIdx(files);
  const p = planRename({ idx, working, path: 'C/Players/Angelo - LeBron James.md', newName: 'LeBron James', title: 'LeBron James' });
  assert.ok(p.ok && p.newPath === 'C/Players/LeBron James.md' && p.renamed && p.retitled);
  assert.ok(p.self.includes('# LeBron James') && p.self.includes('[[LeBron James]] (himself)') && p.self.startsWith('---\nlevel: 3\n---'));
  assert.deepEqual(p.edits.map(e => e.path).sort(), ['C/NPCs/Tam.md', 'C/Sessions/S1.md']);
  assert.equal(p.linkCount, 1 + 2 + 1);
  assert.equal(p.noteCount, 2);
  assert.ok(p.edits.find(e => e.path === 'C/Sessions/S1.md').text.includes('[[LeBron James|LeBron]]'));
  const off = planRename({ idx, working, path: 'C/Players/Angelo - LeBron James.md', newName: 'LeBron James', updateLinks: false });
  assert.equal(off.edits.length, 0);
  assert.equal(off.retitled, false, 'with no title given the heading is left alone');
});

test('rename: only the heading can change too; clashes, empty names and capitals-only are refused', () => {
  const files = { 'C/Players/Kes.md': '# Kes\nx', 'C/NPCs/Tam.md': '# Tam\n[[Kes]]', 'C/Locations/Greenhold.md': '# Greenhold' };
  const { idx, working } = renameIdx(files);
  const h = planRename({ idx, working, path: 'C/Players/Kes.md', newName: 'Kes', title: 'Kestra Dune' });
  assert.ok(h.ok && !h.renamed && h.retitled && h.self.includes('# Kestra Dune') && h.edits.length === 0);
  assert.ok(planRename({ idx, working, path: 'C/Players/Kes.md', newName: 'Kes' }).nothing);
  assert.match(planRename({ idx, working, path: 'C/Players/Kes.md', newName: 'greenhold' }).error, /already a note called/);
  assert.equal(planRename({ idx, working, path: 'C/Players/Kes.md', newName: '  ' }).error, 'Type a name.');
  assert.match(planRename({ idx, working, path: 'C/Players/Kes.md', newName: 'KES' }).error, /capital letters/);
  assert.equal(planRename({ idx, working, path: 'C/Nope.md', newName: 'x' }).ok, false);
  assert.match(planRename({ idx: renameIdx({ ...files, 'C/Players/Zed.md': '# Zed' }).idx, working: { get: p => files[p], has: p => p === 'C/Players/Zed2.md' || p in files }, path: 'C/Players/Zed.md', newName: 'Zed2' }).error, /already a file/);
});

/* ---- name checker, secrets and clues, spotlight, clocks (2.25) ---- */
import { nameClashes, hasClash, distance } from '../src/core/names.js';
import { parseSecrets, secretLine, secretsFrom, setRevealed, needsClues, CLUES_WANTED } from '../src/core/secrets.js';
import { spotlightStats } from '../src/core/spotlight.js';
import { parseClocks, parseStandings, clockLine, standingLine, writeLists, readLists, buildNote, standingLabel, STANDINGS, CLOCKS_NOTE } from '../src/core/clocks.js';

const nIdx = names => ({ notes: names.map(([name, type]) => ({ name, type, path: 'C/' + type + '/' + name + '.md' })) });

test('names: exact, first-name, family-name and close matches, ignoring titles and other kinds of note', () => {
  const idx = nIdx([['Mireille Vane', 'npc'], ['Old Tam', 'npc'], ['Greenhold', 'location'], ['Kestra Dune', 'player'], ['Session 1', 'session'], ['Captain Isolde Ravenscroft', 'npc']]);
  assert.deepEqual(nameClashes('mireille vane', idx).exact.map(n => n.name), ['Mireille Vane']);
  assert.deepEqual(nameClashes('Mireille Dunmore', idx).first.map(n => n.name), ['Mireille Vane']);
  assert.deepEqual(nameClashes('Joran Vane', idx).last.map(n => n.name), ['Mireille Vane']);
  assert.deepEqual(nameClashes('Mireile Vain', idx).close.map(n => n.name), ['Mireille Vane']);
  assert.ok(nameClashes('Captain Marcus Hale', idx).first.length === 0, 'a title alone is not a match');
  assert.ok(nameClashes('Brother Tam', idx).first.length === 0 || nameClashes('Brother Tam', idx).first[0].name === 'Old Tam', 'short names are not matched by length');
  assert.equal(hasClash(nameClashes('Session 1', idx)), false, 'session notes are not names');
  assert.equal(hasClash(nameClashes('Totally New', idx)), false);
  assert.deepEqual(nameClashes('Greenhold', idx, { exclude: 'C/location/Greenhold.md' }).exact, []);
  assert.deepEqual([distance('abc', 'abc'), distance('abc', 'abd'), distance('kitten', 'sitting')], [0, 1, 3]);
  assert.equal(nameClashes('', idx).exact.length, 0);
});

test('secrets: tasks under "Secrets and clues" with clues after a dash; fewer than three clues is flagged', () => {
  const body = '# S\n\n## Secrets and clues\n\n- [ ] The ferryman sold the bells — Old Tam’s ledger; the missing rope\n- [x] Calder is hiding someone — fresh candles; dry floor; Mireille’s suppers (revealed in [[Session 11]])\n- [ ] No clues yet\n- not a task\n\n## Recap\n- [ ] not a secret\n';
  const s = parseSecrets(body);
  assert.deepEqual(s.map(x => [x.secret, x.clues.length, x.done, x.revealedIn]), [['The ferryman sold the bells', 2, false, ''], ['Calder is hiding someone', 3, true, 'Session 11'], ['No clues yet', 0, false, '']]);
  assert.deepEqual(s.filter(needsClues).map(x => x.secret), ['The ferryman sold the bells', 'No clues yet']);
  assert.equal(CLUES_WANTED, 3);
  assert.equal(secretLine('  A  secret ', ['one', ' two ', '']), '- [ ] A secret — one; two');
  assert.equal(secretLine('Bare', []), '- [ ] Bare');
  assert.deepEqual(parseSecrets('## Secrets\n- [ ] Just this -- one clue, another\n').map(x => x.clues), [['one clue', 'another']]);
  assert.deepEqual(parseSecrets('nothing'), []);
  const r = setRevealed(body, s[0].raw, true, 'Session 12');
  assert.ok(r.includes('- [x] The ferryman sold the bells — Old Tam’s ledger; the missing rope (revealed in [[Session 12]])'));
  assert.equal(parseSecrets(r)[0].revealedIn, 'Session 12');
  assert.equal(parseSecrets(r)[0].clues.length, 2, 'the revealed marker is not a clue');
  const back = setRevealed(r, parseSecrets(r)[0].raw, false);
  assert.ok(back.includes('- [ ] The ferryman sold the bells — Old Tam’s ledger; the missing rope\n'));
  assert.equal(setRevealed(body, 'missing', true), null);
  const idx = { byType: { session: [{ path: 'a', name: 'S2', type: 'session', text: body }], plot: [{ path: 'b', name: 'P', type: 'plot', text: '# P\n' }] } };
  assert.deepEqual(secretsFrom(idx).map(x => [x.name, x.items.length]), [['S2', 3]]);
});

test('spotlight: moments per player over the last sessions, and who has had none', () => {
  const log = lines => '## Session log\n<!-- dmforge:log -->\n' + lines.join('\n') + '\n<!-- /dmforge:log -->\n';
  const sess = (name, lines) => ({ name, text: '# ' + name + '\n' + log(lines) });
  const idx = {
    byType: {
      player: [{ name: 'Kestra Dune', path: 'k' }, { name: 'Bram Ironhollow', path: 'b' }, { name: 'Sorrel Vance', path: 's' }],
      session: [
        sess('S4', ['- 20:01 #spotlight [[Kestra Dune]] picked the lock', '- 20:05 #reveal Bram found a note', '- 20:09 #spotlight Bram talked down the guard']),
        sess('S3', ['- 20:01 #spotlight Kestra again']),
        sess('S2', []), sess('S1', []),
        sess('S0', ['- 20:00 #spotlight Sorrel long ago']),
      ],
    },
  };
  const r = spotlightStats(idx, { sessions: 4 });
  const by = Object.fromEntries(r.rows.map(x => [x.name, x]));
  assert.deepEqual([by['Kestra Dune'].count, by['Bram Ironhollow'].count, by['Sorrel Vance'].count], [2, 1, 0]);
  assert.equal(by['Kestra Dune'].last, 0);
  assert.equal(by['Sorrel Vance'].last, 4, 'she did have one, but longer ago than the window');
  assert.deepEqual(r.quiet.map(x => x.name), ['Sorrel Vance']);
  assert.equal(r.rows[0].name, 'Sorrel Vance', 'the quietest first');
  assert.equal(spotlightStats(idx, { sessions: 4, away: ['sorrel vance'] }).quiet.length, 0, 'someone who is away is not called quiet');
  assert.equal(r.sessions, 4);
});

test('clocks and standing: lines are read and written, and the rest of the note is left alone', () => {
  assert.equal(clockLine({ name: 'The bells ring again', filled: 3, size: 6, note: 'the ferrymen finish' }), '- **The bells ring again** — 3/6 — the ferrymen finish');
  assert.equal(clockLine({ name: 'Doom', filled: 0, size: 4, note: '' }), '- **Doom** — 0/4');
  assert.equal(standingLine({ name: 'Ember Court', value: 1, note: 'owe a favour' }), '- [[Ember Court]] — Friendly (+1) — owe a favour');
  assert.equal(standingLine({ name: 'Crown', value: -2, note: '' }), '- [[Crown]] — Unfriendly (−2)');
  assert.equal(standingLabel(3), 'Allied'); assert.equal(STANDINGS.length, 7);
  const t = buildNote([{ name: 'A', filled: 2, size: 4, note: '' }, { name: 'B', filled: 6, size: 6, note: 'full' }], [{ name: 'Ember Court', value: 2, note: '' }, { name: 'Crown', value: -3, note: 'at war' }]);
  assert.ok(t.startsWith('# ' + CLOCKS_NOTE) && t.includes('## Clocks') && t.includes('## Faction standing'));
  const r = readLists(t);
  assert.deepEqual(r.clocks.map(c => [c.name, c.filled, c.size, c.note]), [['A', 2, 4, ''], ['B', 6, 6, 'full']]);
  assert.deepEqual(r.standings.map(c => [c.name, c.value, c.note]), [['Ember Court', 2, ''], ['Crown', -3, 'at war']]);
  const mine = '---\ntags: x\n---\n# Clocks and Standing\n\nMy own intro.\n\n## Clocks\n\n- **Old** — 1/4\n\n## My musings\n\nKeep me.\n\n## Faction standing\n\n_None yet._\n';
  const out = writeLists(mine, [{ name: 'New', filled: 1, size: 8, note: '' }], [{ name: 'Guild', value: 0, note: '' }]);
  assert.ok(out.startsWith('---\ntags: x\n---') && out.includes('My own intro.') && out.includes('## My musings\n\nKeep me.') && out.includes('- **New** — 1/8') && !out.includes('Old') && out.includes('- [[Guild]] — Neutral (0)'));
  assert.deepEqual(readLists('# nothing').clocks, []);
  assert.equal(parseClocks('## Clocks\n- **Loose**\n').length, 1);
  assert.equal(parseClocks('## Clocks\n- **Big** — 99/99\n')[0].size, 24);
  assert.ok(writeLists('', [], []).includes('_None yet._'));
});

/* ---- the session zero kit (2.26) ---- */
import { emptyAnswers, buildStarter, sessionZeroText, questionnaireText, QUESTIONS, TONES, SAFETY_TOOLS, HOUSE_RULES, session1Prep } from '../src/core/starter.js';

test('starter: the Session Zero note records the answers, and says plainly what is not decided yet', () => {
  const a = emptyAnswers();
  const bare = sessionZeroText(a);
  assert.ok(bare.startsWith('# Session Zero') && bare.includes('_Not decided yet._') && bare.includes('_None: the rules as written._') && bare.includes('- Combat: Some'));
  Object.assign(a, { premise: 'A town where the bells went missing', setting: 'Greenhold', tones: ['Mystery', 'Gritty'], level: 3, schedule: 'Fortnightly on Tuesdays', sessionLength: '3 hours', lines: 'harm to children; spiders', veils: 'romance', tools: ['xcard', 'lines'], houseRules: ['Roll death saves in the open'], customRules: 'Natural 1 on a save: a small mishap\n' });
  a.pillars = { combat: 'A lot', explore: 'A little', social: 'Some' };
  const t = sessionZeroText(a);
  assert.ok(t.includes('**Premise:** A town where the bells went missing') && t.includes('**Tone:** Mystery, Gritty') && t.includes('**Starting level:** 3'));
  assert.ok(t.includes('- Combat: A lot') && t.includes('- Exploration: A little'));
  assert.ok(t.includes('Fortnightly on Tuesdays (3 hours each)') && t.includes('- harm to children\n- spiders') && t.includes('### Veils') && t.includes('- romance'));
  assert.ok(t.includes('X-card') && t.includes('Lines and veils') && !t.includes('Script change'));
  assert.ok(t.includes('- Roll death saves in the open\n- Natural 1 on a save: a small mishap'));
});

test('starter: the questionnaire, players with their numbers, a first thread and a first session', () => {
  assert.ok(questionnaireText(emptyAnswers()).includes('1. **' + QUESTIONS[0] + '**') && questionnaireText(emptyAnswers()).includes('Lines (things you do not want'));
  assert.ok(QUESTIONS.length >= 8 && TONES.includes('Mystery') && SAFETY_TOOLS.length >= 4 && HOUSE_RULES.length >= 5);
  const a = { ...emptyAnswers(), level: 2, thread: 'The Missing Bells', premise: 'Bells vanish', session1: true, players: [{ player: 'Angelo', character: 'LeBron James', cls: 'Rogue' }, { player: 'Paris', character: '', cls: '' }, { player: '', character: '', cls: '' }, { player: 'x', character: 'lebron james', cls: '' }, { player: 'Rob/ie', character: 'Arther: Sparks?', cls: 'Wizard' }] };
  const r = buildStarter(a);
  assert.deepEqual(r.notes.map(n => n.kind + ':' + n.name), ['root:Session Zero', 'root:Session Zero Questionnaire', 'player:LeBron James', 'player:Paris', 'player:Arther Sparks', 'plot:The Missing Bells']);
  const lb = r.notes.find(n => n.name === 'LeBron James');
  assert.deepEqual(lb.fm, { player: 'Angelo', class: 'Rogue', level: 2 });
  assert.ok(lb.body.startsWith('# LeBron James') && lb.body.includes('Played by Angelo.') && lb.body.includes('## Hooks for the DM'));
  assert.deepEqual(r.notes.find(n => n.name === 'Paris').fm, { player: 'Paris', level: 2 });
  assert.equal(r.notes.find(n => n.kind === 'plot').fm.status, 'Active');
  assert.ok(r.notes.find(n => n.kind === 'plot').body.includes('Bells vanish') && r.notes.find(n => n.kind === 'plot').body.includes('## Next steps'));
  assert.ok(r.session1 && r.prep.includes('## Scenes') && r.prep.includes('(20 min)') && r.prep.includes('## Secrets and clues') && r.prep.includes('MUST HAPPEN'));
  assert.equal(buildStarter({ ...a, session1: false }).prep, '');
  assert.equal(buildStarter(emptyAnswers()).notes.length, 2, 'with no players and no thread, just the two documents');
  assert.ok(session1Prep(a).startsWith('**Strong start:**'));
});

/* ---- import last session (2.27) ---- */
import { lastSessionData, lastTimeMarkdown, putLastTime, previousSession } from '../src/core/lastsession.js';
import { lastTimeTasks, nextTimeAll } from '../src/core/forgetting.js';

const closedOut = () => {
  let t = '---\nnumber: 12\n---\n# Session 12\n\n## Prep\n> [!important]+ MUST HAPPEN\n> \n> - [ ] Tell them about the bells\n> - [x] Introduce Hush\n\n## Secrets and clues\n\n- [ ] The ferryman sold the bells — ledger; rope\n- [x] Calder hides someone — a; b; c\n\n## Recap\nTheirs: they took the boat.\n\n## Session log\n\n<!-- dmforge:log -->\n- 20:01 The ferryman is nervous\n- [ ] 20:10 #promise Return the lantern\n<!-- /dmforge:log -->\n';
  return applySessionParts(t, { recap: '- They learned the ferryman lied\n- Hush fled', next: ['Find the buyer', 'Return the lantern'] });
};

test('last session: what Close out saved is picked up, in the right order, without repeats', () => {
  const d = lastSessionData(closedOut());
  assert.equal(d.from, 'dm');
  assert.ok(d.recap.includes('They learned the ferryman lied'));
  assert.deepEqual(d.carry, ['Find the buyer', 'Return the lantern', 'Tell them about the bells']);
  assert.deepEqual(d.secrets, [{ text: 'The ferryman sold the bells', clues: 2 }]);
  assert.equal(d.empty, false);
  const players = lastSessionData('# S\n\n## Recap\nThe players say hello.\n');
  assert.deepEqual([players.from, players.recap], ['players', 'The players say hello.']);
  const log = lastSessionData('# S\n\n## Session log\n\n<!-- dmforge:log -->\n- 20:01 One\n- 20:02 Two\n<!-- /dmforge:log -->\n');
  assert.deepEqual([log.from, log.recap], ['log', '- One\n- Two']);
  assert.equal(lastSessionData('# S\n\n## Prep\nnothing\n').empty, true);
});

test('last session: a "Last time" section goes before Prep, can be refreshed, and keeps what you ticked', () => {
  const d = lastSessionData(closedOut());
  const next = '---\nnumber: 13\n---\n# Session 13\n\n## Prep\n\nplans\n\n## Recap\n';
  const a = putLastTime(next, d, 'Session 12');
  assert.ok(a.startsWith('---\nnumber: 13\n---') && a.indexOf('## Last time') < a.indexOf('## Prep') && a.indexOf('## Last time') > a.indexOf('# Session 13'));
  assert.ok(a.includes('**Previously, in [[Session 12]]** _(your recap)_:') && a.includes('- [ ] Find the buyer') && a.includes('**Secrets still hidden**') && a.includes('- The ferryman sold the bells _(2 clues)_'));
  assert.ok(a.includes('plans') && a.includes('## Recap'));
  assert.deepEqual(lastTimeTasks(a).map(t => t.text), ['Find the buyer', 'Return the lantern', 'Tell them about the bells']);
  // tick one, add one of your own inside the block, import again
  let b = a.replace('- [ ] Find the buyer', '- [x] Find the buyer').replace('**Secrets still hidden**', '- [ ] My own task\n\n**Secrets still hidden**');
  const again = putLastTime(b, { ...d, recap: '- A fresher recap' }, 'Session 12');
  assert.equal((again.match(/## Last time/g) || []).length, 1);
  assert.ok(again.includes('- A fresher recap') && !again.includes('They learned the ferryman lied'), 'the recap is refreshed');
  assert.ok(again.includes('- [x] Find the buyer') && again.includes('- [ ] My own task') && (again.match(/Find the buyer/g) || []).length === 1, 'ticks and your own tasks are kept, nothing repeats');
  const noPrep = putLastTime('# S13\n\nbody\n', d, 'Session 12');
  assert.ok(noPrep.startsWith('# S13\n\n## Last time') && noPrep.includes('body'));
  assert.ok(putLastTime('plain', d, 'S').startsWith('## Last time'));
  const crlf = putLastTime('# S\r\n\r\n## Prep\r\n', d, 'Session 12');
  assert.ok(!/[^\r]\n/.test(crlf), 'Windows line endings stay');
});

test('last session: the session before; and a task done in the newer copy is no longer waiting', () => {
  const idx = { byType: { session: [{ path: 'c' }, { path: 'b' }, { path: 'a' }] } };
  assert.equal(previousSession(idx, 'c').path, 'b');
  assert.equal(previousSession(idx, 'a'), null);
  assert.equal(previousSession(idx, 'new').path, 'c');
  assert.equal(previousSession({ byType: {} }, 'x'), null);
  assert.equal(lastTimeMarkdown({ recap: '', from: '', carry: [], secrets: [] }, 'S'), '');
  const mk = (n, name, text) => { const x = parseNote('C/Sessions/' + name + '.md', text); x.type = 'session'; return x; };
  const old = mk(0, 'S12', '---\nnumber: 12\n---\n# S12\n\n## Next time\n\n<!-- dmforge:next -->\n- [ ] Find the buyer\n- [ ] Bury the bell\n<!-- /dmforge:next -->\n');
  const fresh = mk(1, 'S13', putLastTime('---\nnumber: 13\n---\n# S13\n\n## Prep\n', lastSessionData(old.text), 'S12').replace('- [ ] Find the buyer', '- [x] Find the buyer'));
  const idx2 = { notes: [], byType: { session: [fresh, old], plot: [], npc: [], player: [] }, backlinks: new Map(), resolve: () => null };
  const f = forgetting(idx2, { after: 3 });
  assert.deepEqual(f.carry.map(c => c.text), ['Bury the bell'], 'the buyer was found in session 13, so it is not carried; the bell is, once');
  assert.equal(nextTimeAll('## Next time\n- [x] a\n- [ ] b\n').length, 2);
});

/* ---------- Character Library (2.28.0) ---------- */
import { loadChars } from '../src/core/chardata.js';
import * as CH from '../src/core/character.js';
import { listCharacters, saveCharacter, loadCharacter, deleteCharacter, copyName, pathFor } from '../src/core/library.js';
import { MemoryVault as MemVault } from '../src/core/vault.js';

test('character data: the SRD pack has 12 classes, 9 species and 17 feats, with real tables', async () => {
  const d = await loadChars();
  assert.equal(Object.keys(d.classes).length, 12);
  assert.equal(Object.keys(d.species).length, 9);
  assert.equal(d.feats.length, 17);
  const w = d.classes.Wizard;
  assert.equal(w.hd, 6); assert.deepEqual(w.saves.sort(), ['Int', 'Wis']);
  assert.equal(w.skillN, 2); assert.ok(w.skills.includes('Arcana') && w.skills.includes('Insight'), 'mended "In sight"');
  assert.equal(w.kits.length, 2); assert.equal(w.kits[0].gp, 5); assert.equal(w.kits[1].gp, 55);
  assert.equal(d.classes.Fighter.kits.length, 3);
  assert.equal(d.classes.Rogue.skillN, 4);
  assert.ok(d.classes.Bard.skills.length === 18, 'Bard: any skill');
  assert.ok(Object.keys(d.classes.Wizard.subs).includes('Evoker'));
  assert.ok(d.classes.Barbarian.other.some(r => r[0] === 'Rages') && d.classes.Monk.other.some(r => r[0] === 'Unarmored Movement'), 'typos in the source names are mended');
  assert.ok(d.armor.some(a => a.n === 'Chain Mail' && a.ac === 16 && !a.dex));
});

test('character rules: hit points, armour class, proficiency, scores, spells', async () => {
  const d = await loadChars();
  const mk = (cls, level, extra = {}) => { const c = CH.blankCharacter(d); c.cls = cls; c.sub = CH.firstSub(d, cls); c.level = level; c.base = { Str: 10, Dex: 14, Con: 14, Int: 10, Wis: 10, Cha: 10 }; c.bg = 'Sage'; c.bgMode = '111'; return Object.assign(c, extra); };
  assert.equal(CH.profBonus(1), 2); assert.equal(CH.profBonus(5), 3); assert.equal(CH.profBonus(9), 4); assert.equal(CH.profBonus(20), 6);
  const wiz = mk('Wizard', 5, { kit: 'A' });                         // Sage +1 Con/Int/Wis: Con 15, Dex 14
  assert.equal(CH.scores(wiz).Con, 15);
  assert.equal(CH.derive(d, wiz).hp, 6 + 2 + 4 * (4 + 2), 'average hit points: d6 first level full, then 4 each, plus Con');
  assert.equal(CH.derive(d, wiz).ac, 12, 'no armour: 10 + Dex');
  const fighter = mk('Fighter', 1, { kit: 'A' });
  assert.equal(CH.derive(d, fighter).ac, 16, 'chain mail ignores Dex');
  fighter.gear = ['Shield'];
  assert.equal(CH.derive(d, fighter).ac, 18, 'a shield adds 2');
  fighter.kit = 'B';
  assert.equal(CH.derive(d, fighter).ac, 16, 'studded leather 12 + Dex 2 + shield 2');
  const barb = mk('Barbarian', 1, { kit: 'B' });
  assert.equal(CH.derive(d, barb).ac, 10 + 2 + 2, 'Unarmored Defense: 10 + Dex + Con');
  const monk = mk('Monk', 1, { kit: 'B' }); monk.base.Wis = 14;
  assert.equal(CH.derive(d, monk).ac, 10 + 2 + 2, 'Monk: 10 + Dex + Wis (Sage +1 each)');
  // rounding of the two bonus modes
  const c = mk('Fighter', 1, { bgMode: '21', bg: 'Soldier', bgA: 'Str', bgB: 'Con' });
  assert.deepEqual([CH.scores(c).Str, CH.scores(c).Con, CH.scores(c).Dex], [12, 15, 14]);
  c.base.Str = 19; assert.equal(CH.scores(c).Str, 20, 'capped at 20');
  // spells
  const w5 = CH.spellInfo(d, wiz);
  assert.deepEqual([w5.cantrips, w5.prepared, w5.slots, w5.maxLvl], [4, 9, [4, 3, 2], 3]);
  const w20 = CH.spellInfo(d, mk('Wizard', 20));
  assert.equal(w20.slots.length, 9); assert.equal(w20.slots[0], 4);
  const lock = CH.spellInfo(d, mk('Warlock', 5));
  assert.deepEqual([lock.pact.n, lock.pact.lvl, lock.slots.length], [2, 3, 0], 'Pact Magic: two level 3 slots at 5');
  assert.equal(CH.slotsText(lock), '2 × level 3 (Pact Magic)');
  const pal1 = CH.spellInfo(d, mk('Paladin', 1)), pal5 = CH.spellInfo(d, mk('Paladin', 5));
  assert.equal(pal5.slots.length, 2); assert.equal(pal5.cantrips, 0, 'half casters have no cantrips');
  assert.ok(pal1.slots.length <= 1);
  assert.equal(CH.spellInfo(d, mk('Fighter', 5)), null);
  assert.equal(w5.dc, 8 + 3 + CH.mod(CH.scores(wiz).Int));
  // trims the picks to the class and level
  const picks = mk('Wizard', 1, { cantrips: ['Fire Bolt', 'Light', 'Mage Hand', 'Prestidigitation', 'Ray of Frost'], prepared: ['Fireball', 'Magic Missile', 'Shield'] });
  CH.fitSpells(d, picks, [{ n: 'Fire Bolt', lv: 0, cl: ['Wizard'] }, { n: 'Light', lv: 0, cl: ['Wizard'] }, { n: 'Mage Hand', lv: 0, cl: ['Wizard'] }, { n: 'Prestidigitation', lv: 0, cl: ['Wizard'] }, { n: 'Fireball', lv: 3, cl: ['Wizard'] }, { n: 'Magic Missile', lv: 1, cl: ['Wizard'] }, { n: 'Shield', lv: 1, cl: ['Wizard'] }]);
  assert.deepEqual(picks.cantrips, ['Fire Bolt', 'Light', 'Mage Hand']);
  assert.deepEqual(picks.prepared, ['Magic Missile', 'Shield'], 'a level 3 spell is not available at level 1');
  // ability score rules
  assert.equal(CH.standardArrayProblem({ Str: 15, Dex: 14, Con: 13, Int: 12, Wis: 10, Cha: 8 }), '');
  assert.ok(CH.standardArrayProblem({ Str: 15, Dex: 15, Con: 13, Int: 12, Wis: 10, Cha: 8 }));
  assert.equal(CH.pointsLeft({ Str: 8, Dex: 8, Con: 8, Int: 8, Wis: 8, Cha: 8 }), 27);
  assert.equal(CH.pointsLeft({ Str: 15, Dex: 15, Con: 15, Int: 8, Wis: 8, Cha: 8 }), 0);
  const r = CH.rollScores(() => 0.5); assert.equal(r.length, 6); assert.ok(r.every(x => x.dice.length === 4 && x.total === x.dice.reduce((a, b) => a + b) - Math.min(...x.dice)));
  const sug = CH.suggestScores(d, 'Wizard'); assert.deepEqual([sug.Int, sug.Con], [15, 14]);
  assert.deepEqual(Object.values(CH.suggestScores(d, 'Fighter')).sort((a, b) => b - a), [15, 14, 13, 12, 10, 8]);
});

test('character file: markdown with properties, details read back, and edits made outside survive', async () => {
  const d = await loadChars();
  const c = CH.blankCharacter(d); Object.assign(c, { name: 'Thessaly', cls: 'Wizard', sub: 'Evoker', level: 5, species: 'Elf', bg: 'Sage', bgA: 'Int', bgB: 'Con', kit: 'A', cantrips: ['Fire Bolt'], prepared: ['Shield', 'Fireball'] });
  c.sections = ['basics', 'look', 'back']; c.kind = 'pc';
  c.d = { align: 'Neutral Good', player: 'Sam', concept: "A scholar who follows her master's trail", look: 'Silver braid\n\nand a scorched sleeve', grew: 'Ael Varen?', story: 'Line one\nLine two --> not a comment' };
  c.custom = [{ title: 'Pets', text: 'A raven named Footnote.' }];
  const md = CH.characterMarkdown(d, c);
  assert.ok(md.startsWith('---\ntype: character\nkind: pc\nclass: Wizard\nsubclass: Evoker\nlevel: 5'));
  assert.ok(/\nhp: \d+\nac: \d+\n/.test(md) && md.includes('speed: 9 m') && md.includes('perception:'));
  assert.ok(md.includes('# Thessaly') && md.includes('## Features') && md.includes('## Spells') && md.includes('[[Fire Bolt]]') && md.includes('## Equipment') && md.includes('## Pets'));
  assert.ok(md.includes('Creative Commons Attribution 4.0'));
  assert.ok(!/Magic Initiate \(Wizard\)\*\* _\(Origin feat\)_\. You gain the following benefits/.test(md), 'a feat with no text of its own shows just its name');
  assert.equal((md.match(/<!-- dmforge:character/g) || []).length, 1);
  // read it back
  const back = CH.characterFromText(d, md, 'Thessaly');
  assert.equal(back.cls, 'Wizard'); assert.equal(back.level, 5); assert.deepEqual(back.cantrips, ['Fire Bolt']); assert.deepEqual(back.prepared, ['Shield', 'Fireball']);
  assert.equal(back.d.align, 'Neutral Good'); assert.equal(back.d.concept, "A scholar who follows her master's trail");
  assert.equal(back.d.look, 'Silver braid\n\nand a scorched sleeve'); assert.equal(back.d.grew, 'Ael Varen?');
  assert.ok(back.d.story.includes('Line two --> not a comment'), 'text that looks like a comment closing is safe');
  assert.deepEqual(back.custom, [{ title: 'Pets', text: 'A raven named Footnote.' }]);
  assert.deepEqual(back.sections.sort(), ['back', 'basics', 'look'].sort());
  // an edit made in Obsidian is what the creator reads next
  const edited = md.replace('**One-line concept:** A scholar who follows her master\'s trail', '**One-line concept:** Edited elsewhere');
  assert.equal(CH.characterFromText(d, edited, 'Thessaly').d.concept, 'Edited elsewhere');
  // empty sections are not written; a file with no state comment is not editable
  c.d.grew = ''; c.d.story = '';
  assert.ok(!CH.characterMarkdown(d, c).includes('## Backstory'));
  assert.equal(CH.characterFromText(d, md.replace(/<!-- dmforge:character[\s\S]*?-->/, ''), 'x'), null);
  assert.equal(CH.parseCharacterFile('# Just a note').state, null);
  // NPC sections
  const npc = CH.blankCharacter(d, 'npc'); npc.name = 'Haldor'; npc.sections = ['basics', 'run']; npc.d = { align: 'Neutral', role: 'Innkeeper', wants: 'Quiet' };
  const nmd = CH.characterMarkdown(d, npc);
  assert.ok(nmd.includes('kind: npc') && nmd.includes('## Running this NPC') && nmd.includes('**Role in your world:** Innkeeper') && !/\nplayer: \S/.test(nmd));
  assert.equal(CH.characterFromText(d, nmd, 'Haldor').d.wants, 'Quiet');
});

test('character library: save, list, edit, rename, copy and delete on the vault', async () => {
  const d = await loadChars();
  const v = new MemVault({ 'Camp/x.md': '# x' }, 'V');
  const c = CH.blankCharacter(d); c.name = 'Korg: "Ironhand"'; c.cls = 'Fighter'; c.level = 3; c.species = 'Goliath';
  assert.equal(await listCharacters(v).then(l => l.length), 0, 'an empty library lists nothing');
  const p = await saveCharacter(v, d, c);
  assert.equal(p, 'Character Library/Characters/Korg Ironhand.md', 'illegal characters are dropped from the file name');
  assert.ok(await v.exists(p));
  const list = await listCharacters(v);
  assert.equal(list.length, 1); assert.equal(list[0].fm.class, 'Fighter'); assert.equal(list[0].fm.level, 3); assert.ok(list[0].hasState);
  await assert.rejects(() => saveCharacter(v, d, c), /already a character called/, 'a second one with the same name is refused');
  const { c: loaded } = await loadCharacter(v, d, p);
  assert.equal(loaded.level, 3);
  loaded.name = 'Korg Ironhand II';
  const p2 = await saveCharacter(v, d, loaded, { oldPath: p });
  assert.ok(await v.exists(p2) && !(await v.exists(p)), 'renaming moves the file');
  assert.equal(await copyName(v, 'Korg Ironhand II'), 'Korg Ironhand II copy');
  await saveCharacter(v, d, Object.assign({}, loaded, { name: 'Korg Ironhand II copy' }));
  assert.equal(await copyName(v, 'Korg Ironhand II'), 'Korg Ironhand II copy 2');
  await v.writeText('Character Library/Characters/Plain.md', '# plain');
  assert.equal((await listCharacters(v)).find(x => x.name === 'Plain').hasState, false);
  await deleteCharacter(v, p2);
  assert.ok(!(await v.exists(p2)));
  await assert.rejects(() => saveCharacter(v, d, Object.assign({}, c, { name: '  ' })), /name/);
  assert.equal(pathFor({ name: 'A/B' }), 'Character Library/Characters/AB.md');
});

/* ---------- the showcase demo campaign ---------- */
import { showcaseFiles, SHOWCASE_MAPPING } from '../src/core/showcase.js';
import * as SX_SECRETS from '../src/core/secrets.js';
import * as SX_CLOCKS from '../src/core/clocks.js';
import * as SX_SCENES from '../src/core/scenes.js';
import * as SX_LOG from '../src/core/sessionlog.js';
import * as SX_CHEAT from '../src/core/cheatsheet.js';
import * as SX_POOLS from '../src/core/pools.js';
import * as SX_LAST from '../src/core/lastsession.js';
import * as SX_FORGET from '../src/core/forgetting.js';
import * as SX_FM from '../src/core/frontmatter.js';
import * as SX_MON from '../src/core/monsters.js';

const X = { chars: CH.parseCharacterFile, secrets: SX_SECRETS.parseSecrets, needs: SX_SECRETS.needsClues, clocks: SX_CLOCKS.parseClocks, standings: SX_CLOCKS.parseStandings, scenes: SX_SCENES.parseScenes, log: SX_LOG.parseLog, custom: SX_CHEAT.parseCustom, pools: SX_POOLS.parsePools, table: SX_POOLS.parseTable, last: SX_LAST.lastSessionData, must: SX_FORGET.mustHappen, nextAll: SX_FORGET.nextTimeAll, fm: SX_FM.splitFrontmatter, monster: SX_MON.noteMonster };

test('showcase: every link resolves, every feature has data, and the library is full', async () => {
  const f = showcaseFiles();
  const names = new Set(Object.keys(f).map(p => p.split('/').pop().replace(/\.[^.]+$/, '')));
  const files = new Set(Object.keys(f).map(p => p.split('/').pop()));
  const broken = [];
  for (const [p, v] of Object.entries(f)) {
    if (typeof v !== 'string' || !p.endsWith('.md') || p.startsWith('Character Library/')) continue;   // library spell links open the SRD spell cards
    for (const m of v.matchAll(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
      const t = m[1].trim();
      if (!names.has(t) && !files.has(t)) broken.push(p + ' -> ' + t);
    }
  }
  assert.deepEqual(broken, [], 'no broken links');
  const top = new Set(Object.keys(f).filter(p => p.startsWith('Ashfall/') && p.split('/').length > 2).map(p => p.split('/')[1]));
  for (const folder of top) assert.ok(folder in SHOWCASE_MAPPING, folder + ' is mapped');
  const under = dir => Object.keys(f).filter(p => p.startsWith('Ashfall/' + dir + '/'));
  assert.ok(under('NPCs').length >= 14 && under('Players').length === 4 && under('Locations').length >= 8 && under('Factions').length === 5 && under('Plot Threads').length >= 6 && under('Sessions').length === 6 && under('Bestiary').length >= 6 && under('Items').length >= 8 && under('Maps').length >= 4);
  const sess = n => f['Ashfall/Sessions/' + Object.keys(f).find(p => p.includes('Session ' + n + '.md')).split('/').pop()];
  const s13 = sess(13), s14 = sess(14);
  assert.ok(X.log(X.fm(s13).body).length >= 7, 'a live log');
  assert.ok(X.log(X.fm(s13).body).some(e => e.tags.includes('spotlight')) && X.log(X.fm(s13).body).some(e => e.task && !e.done), 'spotlight and open promises');
  assert.ok(X.last(s13).recap && X.last(s13).carry.length >= 3, 'something to import as last session');
  assert.ok(X.nextAll(X.fm(s13).body).some(t => t.done) && X.nextAll(X.fm(s13).body).some(t => !t.done));
  assert.deepEqual(X.fm(s13).fm.absent, ['Toby Wren'], 'an absent player');
  assert.equal(X.must(X.fm(s14).body).length, 2, 'two must-happen items');
  assert.equal(X.scenes(X.fm(s14).body).length, 5, 'scenes for the timer');
  const sec = X.secrets(X.fm(s14).body);
  assert.equal(sec.length, 3); assert.ok(sec.some(X.needs) && sec.some(x => !X.needs(x)), 'secrets with and without enough clues');
  assert.equal(X.clocks(f['Ashfall/Clocks and Standing.md']).length, 4); assert.equal(X.standings(f['Ashfall/Clocks and Standing.md']).length, 5);
  assert.ok(X.custom(f['Ashfall/DM Cheat Sheet.md']).length >= 4);
  assert.ok(Object.keys(X.pools(f['Ashfall/Generator Tables.md'])).includes('npc/quirk'));
  assert.equal(X.table('x', f['Ashfall/Custom tables/Greenhold Rumours.md']).rows.length, 8);
  // the Bestiary reads as monsters
  for (const p of under('Bestiary')) {
    const { fm, body } = X.fm(f[p]);
    const m = X.monster({ path: p, name: p.split('/').pop().replace('.md', ''), fm, body, inline: {} });
    assert.ok(m.ac && m.hp && m.cr !== null, p + ' has AC, HP and CR');
  }
  // the library
  const chars = Object.keys(f).filter(p => p.startsWith('Character Library/Characters/'));
  assert.equal(chars.length, 10);
  for (const p of chars) assert.ok(X.chars(f[p]).state, p + ' can be edited in the creator');
});

/* ---------- example characters are kept apart (2.28.3) ---------- */
import * as LIBX from '../src/core/library.js';
import { EXAMPLE_CHARS } from '../src/core/showcase.js';

test('examples: kept in their own folder, found when loose, moved, edited in place and removed', async () => {
  const d = await loadChars();
  const v = new MemVault({ 'Camp/x.md': '# x' }, 'V');
  const mine = CH.blankCharacter(d); mine.name = 'Beidou'; mine.cls = 'Fighter';
  await saveCharacter(v, d, mine);
  // the sample wrote ten examples straight into Characters (the old way), one of them since edited by the user
  for (const [name, text] of Object.entries(EXAMPLE_CHARS)) await v.writeText('Character Library/Characters/' + name + '.md', text);
  await v.writeText('Character Library/Characters/Mira Vell.md', EXAMPLE_CHARS['Mira Vell'] + '\nmy own note');
  const loose = await LIBX.looseExamples(v, EXAMPLE_CHARS);
  assert.equal(loose.length, 9, 'nine are exactly as shipped; the edited one is yours');
  assert.ok(!loose.some(p => p.includes('Mira Vell')) && !loose.some(p => p.includes('Beidou')));
  assert.equal(await LIBX.moveToExamples(v, loose), 9);
  const list = await listCharacters(v);
  assert.equal(list.filter(r => r.example).length, 9); assert.equal(list.filter(r => !r.example).map(r => r.name).sort().join(), 'Beidou,Mira Vell');
  assert.ok(list.filter(r => r.example).every(r => r.path.startsWith('Character Library/Examples/') && r.fm.example === true));
  assert.deepEqual(list.slice(0, 2).map(r => r.example), [false, false], 'yours come first');
  assert.equal((await LIBX.looseExamples(v, EXAMPLE_CHARS)).length, 0, 'nothing left to move');
  // editing an example keeps it an example, in Examples (also after a rename); a copy is yours
  const p = 'Character Library/Examples/Korg Ironhand.md';
  const { c } = await loadCharacter(v, d, p);
  c.d.concept = 'Edited'; const same = await saveCharacter(v, d, c, { oldPath: p });
  assert.equal(same, p); assert.ok((await v.readText(p)).includes('example: true'));
  c.name = 'Korg Renamed'; const moved = await saveCharacter(v, d, c, { oldPath: p });
  assert.equal(moved, 'Character Library/Examples/Korg Renamed.md'); assert.ok(!(await v.exists(p)));
  const copy = await copyName(v, 'Korg Renamed'); c.name = copy;
  const copyPath = await saveCharacter(v, d, c, {});
  assert.equal(copyPath, 'Character Library/Characters/' + copy + '.md'); assert.ok(!(await v.readText(copyPath)).includes('example: true'));
  // the sample adds into Examples without touching what is there, and remove takes only the examples
  assert.equal(await LIBX.removeExamples(v), 9);
  assert.equal((await listCharacters(v)).filter(r => r.example).length, 0);
  assert.ok(await v.exists('Character Library/Characters/Beidou.md'), 'your own characters stay');
  assert.equal(await LIBX.removeExamples(v), 0);
});

/* ---------- 2.30: level up, items, import ---------- */
import * as LU from '../src/core/levelup.js';
import * as ITL from '../src/core/itemlib.js';
import { campaignNoteText, withoutState, typeForCharacter } from '../src/core/libimport.js';
const mkChar = (d, cls, level, f = () => {}) => { const c = CH.blankCharacter(d, 'pc'); c.name = 'T'; c.cls = cls; c.sub = CH.firstSub(d, cls); c.level = level; c.base = { Str: 15, Dex: 13, Con: 14, Int: 12, Wis: 10, Cha: 8 }; f(c); return c; };

test('level up: the ability score improvement levels come from the class', async () => {
  const d = await loadChars();
  assert.deepEqual(LU.asiLevels(d, 'Fighter').map(x => x.lvl), [4, 6, 8, 12, 14, 16, 19]);
  assert.deepEqual(LU.asiLevels(d, 'Rogue').map(x => x.lvl), [4, 8, 10, 12, 16, 19]);
  assert.equal(LU.asiLevels(d, 'Wizard').at(-1).boon, true);
  assert.equal(LU.pendingAsi(d, mkChar(d, 'Fighter', 3)).length, 0);
  assert.equal(LU.pendingAsi(d, mkChar(d, 'Fighter', 6)).length, 2);
  const c = mkChar(d, 'Fighter', 6, x => { x.asiLog = { 4: { k: 'asi', plus: { Str: 2 } } }; });
  assert.deepEqual(LU.pendingAsi(d, c).map(x => x.lvl), [6]);
});

test('level up: hit points are the average unless rolled, plus Constitution, and Dwarves add one a level', async () => {
  const d = await loadChars();
  const c = mkChar(d, 'Fighter', 1, x => { x.species = 'Human'; });
  const conM = CH.mod(CH.scores(c).Con);
  assert.equal(CH.derive(d, c).hp, 10 + conM);
  c.level = 3; assert.equal(CH.derive(d, c).hp, 10 + conM + 2 * (6 + conM));
  c.hpRolls = { 2: 10, 3: 1 }; assert.equal(CH.derive(d, c).hp, 10 + conM + (10 + conM) + (1 + conM));
  c.hpRolls = { 2: 1 }; c.base.Con = 3; assert.ok(CH.derive(d, c).hp >= 3, 'at least 1 a level');
  const dw = mkChar(d, 'Fighter', 3, x => { x.species = 'Dwarf'; });
  const hu = mkChar(d, 'Fighter', 3, x => { x.species = 'Human'; });
  assert.equal(CH.derive(d, dw).hp - CH.derive(d, hu).hp, 3);
});

test('level up: choices raise scores (to 20, or 30 for an epic boon), feats are kept, expertise doubles the bonus', async () => {
  const d = await loadChars();
  const c = mkChar(d, 'Rogue', 4, x => { x.base = { Str: 8, Dex: 18, Con: 13, Int: 12, Wis: 10, Cha: 14 }; x.skills = ['Stealth', 'Perception']; x.asiLog = { 4: { k: 'asi', plus: { Dex: 2 } } }; x.expertise = ['Stealth']; });
  assert.equal(CH.scores(c).Dex, 20, 'capped at 20');
  const sk = n => CH.derive(d, c).skills.find(x => x.n === n);
  assert.equal(sk('Stealth').v, CH.mod(20) + 2 * CH.profBonus(4));
  assert.equal(sk('Perception').v, CH.mod(10) + CH.profBonus(4));
  assert.equal(sk('Acrobatics').v, CH.mod(20), 'not proficient: no bonus even if listed');
  c.asiLog[19] = { k: 'feat', feat: 'Boon of Speed', plus: { Dex: 1 }, boon: true };
  assert.ok(CH.scores(c).Dex > 20 && CH.scores(c).Dex <= 30, 'an epic boon may pass 20');
});

test('level up: preview lists new features, proficiency, spells and what must be chosen', async () => {
  const d = await loadChars();
  const f = mkChar(d, 'Fighter', 3);
  const pv = LU.preview(d, f, 4);
  assert.deepEqual(pv.levels, [4]);
  assert.equal(pv.asi.length, 1); assert.equal(pv.asi[0].lvl, 4);
  assert.equal(pv.caster, false);
  const w = mkChar(d, 'Wizard', 1);
  const pw = LU.preview(d, w, 2);
  assert.ok(pw.caster); assert.equal(pw.expertise, 1, 'Scholar');
  assert.ok(pw.prepared[1] >= pw.prepared[0]);
  const r = mkChar(d, 'Rogue', 5, x => { x.skills = ['Stealth', 'Perception']; x.expertise = ['Stealth', 'Perception']; });
  assert.equal(LU.preview(d, r, 6).expertise, 2);
  const p5 = mkChar(d, 'Fighter', 4, x => { x.asiLog = { 4: { k: 'asi', plus: { Str: 2 } } }; });
  assert.equal(LU.preview(d, p5, 5).asi.length, 0, 'earlier choice already made');
  assert.equal(LU.preview(d, mkChar(d, 'Fighter', 5), 5 + 1).asi.length, 2, 'a catch-up: level 4 was never chosen, level 6 is new');
});

test('level up: problems say what is missing; applying changes a copy and keeps the numbers right', async () => {
  const d = await loadChars();
  const c = mkChar(d, 'Fighter', 3);
  const pv = LU.preview(d, c, 4);
  assert.match(LU.problems(d, c, pv, { to: 4 }).join(' '), /level 4/);
  assert.match(LU.problems(d, c, pv, { to: 4, asi: { 4: { k: 'asi', plus: { Str: 1 } } } }).join(' '), /exactly 2/);
  assert.match(LU.problems(d, c, pv, { to: 4, asi: { 4: { k: 'asi', plus: { Str: 2 } } }, hp: { 4: 11 } }).join(' '), /between 1 and 10/);
  assert.match(LU.problems(d, c, pv, { to: 4, asi: { 4: { k: 'feat', feat: '' } } }).join(' '), /feat/);
  const ch = { to: 4, asi: { 4: { k: 'asi', plus: { Str: 2 } } }, hp: { 4: 8 } };
  assert.deepEqual(LU.problems(d, c, pv, ch), []);
  const n = LU.applyLevelUp(d, c, ch, null);
  assert.equal(c.level, 3, 'the original is not changed'); assert.equal(n.level, 4);
  assert.equal(CH.scores(n).Str, CH.scores(c).Str + 2);
  assert.equal(n.hpRolls[4], 8);
  assert.equal(CH.derive(d, n).hp, CH.derive(d, c).hp + Math.max(1, 8 + CH.mod(CH.scores(n).Con)));
  // the file round-trips through the creator's own reader
  const back = CH.characterFromText(d, CH.characterMarkdown(d, n), 'T');
  assert.equal(back.level, 4); assert.deepEqual(back.asiLog, n.asiLog); assert.deepEqual(back.hpRolls, n.hpRolls);
  assert.match(CH.characterMarkdown(d, n), /Level 4: \+2 Str/);
});

test('items: the SRD pack loads, search works, and an SRD item becomes a builder item', async () => {
  const list = await ITL.loadSrdItems();
  assert.ok(list.length > 250 && list.length < 300, String(list.length));
  const bag = list.find(x => x.n === 'Bag of Holding');
  assert.ok(bag && bag.k === 'wondrous' && /\bfeet\b|bag/i.test(bag.d));
  assert.ok(ITL.searchSrdItems(list, { q: 'holding' }).length >= 1);
  assert.ok(ITL.searchSrdItems(list, { kind: 'weapon', rarity: 'Rare' }).every(x => x.k === 'weapon' && x.r === 'Rare'));
  assert.ok(list.some(x => x.n === 'Weapon, +1' && x.v && x.v.length > 20), 'weapon variants are folded into one item');
  const it = ITL.itemFromSrd(list.find(x => x.n === 'Weapon, +2'), 'Longsword');
  assert.equal(it.bonus, 2); assert.match(it.name, /Longsword/); assert.equal(it.from, 'SRD 5.2.1');
  const ar = ITL.itemFromSrd(list.find(x => x.n === 'Armor, +1'), 'Chain Mail');
  assert.equal(ar.ac, 1);
});

test('items: markdown round trip, frontmatter and the library folder', async () => {
  const it = ITL.blankItem();
  it.name = 'Cloak of Quiet Steps'; it.kind = 'wondrous'; it.rarity = 'Rare'; it.attune = true; it.attuneNote = 'by a rogue'; it.ac = 1; it.charges = 3; it.recharge = 'Dawn';
  it.desc = 'Advantage on Stealth.'; it.props = [{ n: 'Command word', t: 'hush' }]; it.curse = 'No shadow.'; it.hook = 'Stolen.';
  const t = ITL.itemMarkdown(it);
  const sp = splitFrontmatter(t);
  assert.equal(sp.fm.type, 'item'); assert.equal(sp.fm.rarity, 'Rare'); assert.equal(sp.fm.attunement, true); assert.equal(sp.fm.ac_bonus, 1);
  assert.match(sp.fm.kind, /requires attunement by a rogue/);
  assert.match(t, /## Curse/); assert.match(t, /\*\*Command word\.\*\* hush/);
  const back = ITL.itemFromText(t, 'Cloak of Quiet Steps');
  assert.deepEqual(back, it);
  assert.equal(ITL.itemFromText('# plain note', 'x'), null);
  const v = new MemoryVault({ 'a.md': 'x' });
  const p = await ITL.saveItem(v, it, {});
  assert.equal(p, 'Character Library/Items/Cloak of Quiet Steps.md');
  await assert.rejects(ITL.saveItem(v, it, {}), /already an item/);
  assert.equal((await ITL.listItems(v)).length, 1);
  assert.equal((await ITL.listItems(v))[0].state.rarity, 'Rare');
  const it2 = { ...it, name: 'Cloak of Quiet Steps 2' };
  const moved = await ITL.saveItem(v, it2, { oldPath: p });
  assert.ok(!(await v.exists(p)) && await v.exists(moved));
  await assert.rejects(ITL.saveItem(v, ITL.blankItem(), {}), /name/);
  await ITL.deleteItem(v, moved);
  assert.equal((await ITL.listItems(v)).length, 0);
  const rolled = ITL.rollItem({ rarity: 'Rare', kind: 'Weapon' });
  assert.ok(rolled.name.length > 2 && rolled.kind === 'weapon' && rolled.rarity === 'Rare');
});

test('items: carried by a character - attunement limit and Armor Class from magic items', async () => {
  const d = await loadChars();
  const cloak = { ...ITL.blankItem(), name: 'Cloak', attune: true, ac: 1 };
  const c = mkChar(d, 'Fighter', 3);
  const base = CH.derive(d, c).ac;
  c.items = [ITL.carriedFrom(cloak)];
  assert.equal(CH.derive(d, c).ac, base, 'needs attunement first');
  c.items[0].attuned = true;
  assert.equal(CH.derive(d, c).ac, base + 1);
  assert.equal(ITL.attunedCount(c), 1);
  assert.match(CH.characterMarkdown(d, c), /\[\[Cloak\]\] _\(attuned\)_/);
  const loose = { ...ITL.blankItem(), name: 'Ring of Protection', ac: 1 };
  c.items.push(ITL.carriedFrom(loose));
  assert.equal(CH.derive(d, c).ac, base + 2, 'no attunement needed');
  const back = CH.characterFromText(d, CH.characterMarkdown(d, c), 'T');
  assert.deepEqual(back.items, c.items);
});

test('import: a library file becomes a plain campaign note that remembers its source', async () => {
  const d = await loadChars();
  const c = mkChar(d, 'Wizard', 2); c.name = 'Wren'; c.d.player = 'Sam';
  const md = CH.characterMarkdown(d, c);
  const note = campaignNoteText(md, 'player', 'Character Library/Characters/Wren.md');
  assert.ok(!/dmforge:character/.test(note));
  const sp = splitFrontmatter(note);
  assert.equal(sp.fm.type, 'player'); assert.equal(sp.fm.library, 'Character Library/Characters/Wren.md');
  assert.equal(sp.fm.level, 2); assert.ok(!('source' in sp.fm) && !('example' in sp.fm));
  assert.match(sp.body, /# Wren/);
  const ex = patchFrontmatter(md, { example: true });
  assert.ok(!('example' in splitFrontmatter(campaignNoteText(ex, 'npc', 'x')).fm));
  assert.equal(typeForCharacter({ kind: 'npc' }), 'npc'); assert.equal(typeForCharacter({ kind: 'pc' }), 'player'); assert.equal(typeForCharacter({}), 'player');
  assert.ok(!/dmforge/.test(withoutState('a\n<!-- dmforge:item {"a":1} -->\n')));
  // the note is picked up by the campaign index as a player with its numbers
  const vault = new MemoryVault({ 'C/Players/Wren.md': note });
  const loaded = await loadCampaign(vault, 'C');
  const working = new Working(); working.loadBase(loaded.texts);
  const idx = buildIndex({ campaign: { path: 'C', name: 'C' }, mapping: { Players: 'player' }, working, files: loaded.files });
  assert.equal(idx.byType.player.length, 1);
  assert.equal(idx.byType.player[0].fm.level, 2);
});

/* ---------- 2.31: clocks that belong to a note ---------- */
import * as CLK from '../src/core/clocks.js';
test('clocks: odd sizes, and a clock can belong to a note through a plain [[link]]', () => {
  assert.ok([2, 3, 5, 7, 9].every(n => CLK.CLOCK_SIZES.includes(n)));
  const body = '## Clocks\n\n- **Vault door** — 1/3 — [[The Missing Bells]] — the vault opens\n- **Ritual** — 2/6 — [[Calder]] confesses first\n- **Siege** — 0/8\n- **Patrol** — 4/5 — [[Old Tam]]\n- **Odd** — 1/7 — the tide comes in\n';
  const c = CLK.parseClocks(body);
  assert.deepEqual(c.map(x => [x.name, x.filled, x.size, x.link, x.note]), [
    ['Vault door', 1, 3, 'The Missing Bells', 'the vault opens'],
    ['Ritual', 2, 6, '', '[[Calder]] confesses first'],     // a link inside the words is not "belongs to"
    ['Siege', 0, 8, '', ''],
    ['Patrol', 4, 5, 'Old Tam', ''],
    ['Odd', 1, 7, '', 'the tide comes in'],
  ]);
  assert.equal(CLK.clockLine(c[0]), '- **Vault door** — 1/3 — [[The Missing Bells]] — the vault opens');
  assert.equal(CLK.clockLine(c[3]), '- **Patrol** — 4/5 — [[Old Tam]]');
  assert.equal(CLK.clockLine(c[1]), '- **Ritual** — 2/6 — [[Calder]] confesses first', 'lines without a link come back as they were');
  // a round trip through the note keeps everything
  const text = CLK.writeLists('# Clocks and Standing\n\n## Clocks\n\n## Faction standing\n', c, []);
  assert.deepEqual(CLK.readLists(text).clocks, c);
  // an alias or heading in the link keeps just the name
  assert.equal(CLK.parseClocks('## Clocks\n- **A** — 1/4 — [[The Missing Bells|the bells]] — x')[0].link, 'The Missing Bells');
});

/* ---------- 2.32: places inside places ---------- */
import * as LOC from '../src/core/locations.js';
async function locIndex(files) {
  const vault = new MemoryVault(files);
  const loaded = await loadCampaign(vault, 'C');
  const working = new Working(); working.loadBase(loaded.texts);
  const mapping = { Locations: 'location', NPCs: 'npc', Sessions: 'session', 'Plot Threads': 'plot', Factions: 'faction' };
  return buildIndex({ campaign: { path: 'C', name: 'C' }, mapping, working, files: loaded.files });
}
const L = (name, extra = '') => ['C/Locations/' + name + '.md', '---\n' + extra + '---\n# ' + name + '\n'];
test('locations: the Within property builds a tree, with ancestors, children and a flat order', async () => {
  const idx = await locIndex(Object.fromEntries([
    L('Town', 'kind: Village\n'), L('Inn', 'region: "[[Town]]"\n'), L('Cellar', 'region: "[[Inn]]"\n'), L('Mill', 'region: "[[Town]]"\n'), L('Far Hill'),
    L('Orphan', 'region: "[[No Such Place]]"\n'),
  ]));
  const t = LOC.locationTree(idx);
  const n = name => idx.notes.find(x => x.name === name);
  assert.deepEqual(t.roots.map(x => x.name), ['Far Hill', 'Orphan', 'Town']);
  assert.deepEqual(t.children(n('Town')).map(x => x.name), ['Inn', 'Mill']);
  assert.deepEqual(t.ancestors(n('Cellar')).map(x => x.name), ['Town', 'Inn']);
  assert.deepEqual(t.descendants(n('Town')).map(x => x.name), ['Inn', 'Cellar', 'Mill']);
  assert.deepEqual(t.flat().map(x => x.depth + x.note.name), ['0Far Hill', '0Orphan', '0Town', '1Inn', '2Cellar', '1Mill']);
  assert.equal(t.flat().find(x => x.note.name === 'Town').inside, 2);
  assert.equal(t.parentNote(n('Orphan')), null, 'a Within that names nothing is a top place');
});

test('locations: a loop is cut, not followed forever', async () => {
  const idx = await locIndex(Object.fromEntries([L('A', 'region: "[[B]]"\n'), L('B', 'region: "[[A]]"\n'), L('Self', 'region: "[[Self]]"\n')]));
  const t = LOC.locationTree(idx);
  assert.equal(t.flat().length, 3);
  assert.ok(t.ancestors(idx.notes.find(x => x.name === 'A')).length <= 1);
  assert.ok(t.roots.length >= 2);
});

test('locations: who is here includes people in places inside, and what mentions the place', async () => {
  const files = Object.fromEntries([
    L('Town'), L('Inn', 'region: "[[Town]]"\n'), L('Elsewhere'),
    ['C/NPCs/Mara.md', '---\nlocation: "[[Town]]"\nrole: Mayor\n---\n# Mara\n'],
    ['C/NPCs/Bo.md', '---\nlocation: "[[Inn]]"\n---\n# Bo\n'],
    ['C/NPCs/Cy.md', '---\nlocation: "[[Elsewhere]]"\n---\n# Cy\nHe once passed through [[Town]].\n'],
    ['C/Sessions/Session 1.md', '---\ndate: 2026-01-01\n---\n# Session 1\nThey reached [[Town]].\n'],
    ['C/Sessions/Session 2.md', '---\ndate: 2026-02-01\n---\n# Session 2\nA fight in [[Inn]].\n'],
    ['C/Plot Threads/Bells.md', '---\nstatus: Active\n---\n# Bells\nStarted in [[Inn]].\n'],
    ['C/Factions/Guild.md', '---\nhq: "[[Inn]]"\n---\n# Guild\n'],
  ]);
  const idx = await locIndex(files);
  const town = idx.notes.find(x => x.name === 'Town');
  const h = LOC.hereOf(idx, town);
  assert.deepEqual(h.people.map(p => [p.note.name, p.where && p.where.name]), [['Mara', null], ['Bo', 'Inn']]);
  assert.deepEqual(h.mentionedPeople.map(x => x.name), ['Cy'], 'mentioned in the text but located elsewhere');
  assert.equal(h.lastSession.name, 'Session 2');
  assert.equal(h.lastVia.name, 'Inn', 'the last session was in a place inside');
  assert.deepEqual(h.threads.map(x => x.name), ['Bells']);
  assert.deepEqual(h.factions.map(x => x.name), ['Guild'], 'a faction whose property names a place inside');
  assert.equal(h.insideCount, 1);
  const inn = LOC.hereOf(idx, idx.notes.find(x => x.name === 'Inn'));
  assert.deepEqual(inn.people.map(p => p.note.name), ['Bo']);
  assert.equal(inn.lastVia, null);
});

test('locations: each kind of place starts with its own headings', () => {
  assert.equal(LOC.kindFor('Tavern or inn').id, 'tavern');
  assert.equal(LOC.kindFor('inn').id, 'tavern');
  assert.equal(LOC.kindFor('Shop').id, 'shop');
  assert.equal(LOC.kindFor('hamlet').id, 'village');
  assert.equal(LOC.kindFor('River'), null);
  assert.equal(LOC.kindFor(''), null);
  const t = LOC.locationBody('Tavern or inn', 'The Rusty Anchor');
  assert.ok(t.startsWith('# The Rusty Anchor\n\n## The place'));
  for (const h of ['Food, drink and prices', 'Rooms', 'Regulars and gossip', 'Secrets', 'Hooks']) assert.ok(t.includes('## ' + h));
  assert.match(LOC.locationBody('Dungeon or keyed area', 'Vault'), /## Rooms\n\n1\. \*\*Entrance\*\*/);
  assert.equal(LOC.locationBody('River', 'The Weir'), '# The Weir\n\n## Description\n\n## Points of interest\n', 'an unknown kind keeps the old page');
  for (const k of LOC.LOCATION_KINDS) assert.ok(LOC.locationBody(k.label, 'X').startsWith('# X\n\n## '));
});

/* ---------- 2.33: maps with pins ---------- */
import * as MAP from '../src/core/maps.js';
test('maps: pins are plain lines that read back exactly, with places as [[links]]', () => {
  const pins = [
    { x: 41.23, y: 63.5, place: 'The Cinder & Crown', label: '', secret: false, note: '' },
    { x: 72, y: 20, place: 'The Shrine Tower', label: '', secret: true, note: 'seen from the road' },
    { x: 10, y: 80, place: '', label: 'Old bridge', secret: false, note: 'third plank is rotten' },
  ];
  const t = MAP.mapNoteText('Maps/Greenhold Map.svg', pins, { place: 'Greenhold', scale: '25 km' });
  const sp = splitFrontmatter(t);
  assert.equal(sp.fm.type, 'map'); assert.equal(sp.fm.image, 'Greenhold Map.svg'); assert.equal(sp.fm.scale, '25 km');
  assert.match(String(sp.fm.place), /Greenhold/);
  assert.match(sp.body, /!\[\[Greenhold Map\.svg\]\]/);
  const back = MAP.parsePins(sp.body);
  assert.deepEqual(back.map(p => [p.x, p.y, p.place, p.label, p.secret, p.note]), [[41.2, 63.5, 'The Cinder & Crown', '', false, ''], [72, 20, 'The Shrine Tower', '', true, 'seen from the road'], [10, 80, '', 'Old bridge', false, 'third plank is rotten']]);
  assert.equal(MAP.pinLine(back[1]), '- 72, 20 — [[The Shrine Tower]] — secret — seen from the road');
  // rewriting the list keeps everything else in the note
  const more = MAP.writePins(t.replace('## Pins', '## Pins') + '\n## Notes\nKeep this.\n', [back[0]]);
  assert.match(more, /## Notes\nKeep this\./); assert.equal(MAP.parsePins(more).length, 1);
  assert.deepEqual(MAP.parsePins(MAP.writePins('# x\n', [])), []);
  assert.deepEqual(MAP.parsePins('## Pins\n- not a pin\n- 150, -3 — Edge\n').map(p => p.x), [], 'only whole lines with two numbers count');
  assert.equal(MAP.parsePins('## Pins\n- 100, 0 — Corner')[0].x, 100);
});

test('maps: scale, distance and walking time', () => {
  const sc = MAP.parseScale('25 km');
  assert.equal(sc.metres, 25000);
  assert.equal(MAP.parseScale('300 m').metres, 300); assert.equal(MAP.parseScale('2 miles').unit, 'mi'); assert.equal(MAP.parseScale('abc'), null); assert.equal(MAP.parseScale('0 km'), null);
  // a line half the width of a 3:2 picture is 12.5 km on a 25 km picture
  assert.equal(MAP.metresBetween({ x: 0, y: 0 }, { x: 50, y: 0 }, sc, 1.5), 12500);
  // going down counts for the picture's shape: 100% of the height of a 2:1 picture is half the width
  assert.equal(MAP.metresBetween({ x: 0, y: 0 }, { x: 0, y: 100 }, sc, 2), 12500);
  assert.equal(MAP.scaleFromLine({ x: 0, y: 0 }, { x: 50, y: 0 }, 1.5, 12500), 25000);
  assert.equal(MAP.scaleFromLine({ x: 5, y: 5 }, { x: 5, y: 5 }, 1, 100), null);
  assert.equal(MAP.fmtDistance(12500), '12.5 km'); assert.equal(MAP.fmtDistance(540), '540 m');
  assert.equal(MAP.walkingTime(300), ''); assert.equal(MAP.walkingTime(2400), 'under an hour on foot'); assert.equal(MAP.walkingTime(12000), 'about 2.5 hours on foot'); assert.match(MAP.walkingTime(60000), /day/);
  assert.equal(MAP.scaleFromMetres(25000), '25 km'); assert.equal(MAP.scaleFromMetres(400), '400 m');
});

test('maps: finding a map from a place, and the pins of a place', async () => {
  const files = Object.fromEntries([
    ['C/Locations/Town.md', '# Town\n'], ['C/Locations/Inn.md', '---\nregion: "[[Town]]"\n---\n# Inn\n'],
    ['C/Maps/Town Map.md', MAP.mapNoteText('Town Map.svg', [{ x: 10, y: 20, place: 'Inn' }, { x: 50, y: 50, label: 'Well' }], { place: 'Town', scale: '1 km' })],
    ['C/Maps/Inn Plan.md', MAP.mapNoteText('Inn Plan.png', [], { place: 'Inn' })],
    ['C/Maps/Town Map.svg', new Blob(['<svg/>'])], ['C/Maps/Inn Plan.png', new Blob(['x'])],
  ]);
  const vault = new MemoryVault(files);
  const loaded = await loadCampaign(vault, 'C');
  const working = new Working(); working.loadBase(loaded.texts);
  const idx = buildIndex({ campaign: { path: 'C', name: 'C' }, mapping: { Locations: 'location', Maps: 'map' }, working, files: loaded.files });
  const town = idx.notes.find(n => n.name === 'Town'), inn = idx.notes.find(n => n.name === 'Inn');
  assert.equal(MAP.mapNoteFor(idx, 'C/Maps/Town Map.svg').name, 'Town Map');
  assert.equal(MAP.mapNoteFor(idx, 'whatever/town map.SVG').name, 'Town Map', 'by file name, any case, any folder');
  assert.equal(MAP.mapNoteFor(idx, 'C/Maps/Other.png'), null);
  assert.equal(MAP.placeOf(idx, MAP.mapNoteFor(idx, 'x/Inn Plan.png')).name, 'Inn');
  assert.deepEqual(MAP.mapsOfPlace(idx, town).map(m => m.note.name), ['Town Map']);
  assert.deepEqual(MAP.mapsOfPlace(idx, inn).map(m => m.image), ['C/Maps/Inn Plan.png']);
  const where = MAP.pinsOfPlace(idx, inn);
  assert.equal(where.length, 1); assert.equal(where[0].note.name, 'Town Map'); assert.equal(where[0].pin.x, 10);
  assert.equal(MAP.pinsOfPlace(idx, town).length, 0);
  assert.ok(MAP.isMapNote(MAP.mapNoteFor(idx, 'Town Map.svg')));
});

/* ---------- 2.35: long lists folded up by town ---------- */
import * as GRP from '../src/core/grouping.js';
async function grpIndex() {
  const N = (name, loc, extra = '') => ['C/NPCs/' + name + '.md', '---\n' + (loc ? 'location: "[[' + loc + ']]"\n' : '') + extra + '---\n# ' + name + '\n'];
  const P = (name, kind, within) => ['C/Locations/' + name + '.md', '---\nkind: ' + kind + '\n' + (within ? 'region: "[[' + within + ']]"\n' : '') + '---\n# ' + name + '\n'];
  const files = Object.fromEntries([
    P('Kingdom', 'Region'), P('Greenhold', 'Village', 'Kingdom'), P('Inn', 'Inn', 'Greenhold'), P('Cellar', 'Building', 'Inn'), P('Wilds', 'Wilderness', 'Kingdom'), P('Cave', 'Cave', 'Wilds'),
    N('Ann', 'Inn'), N('Bob', 'Cellar'), N('Cy', 'Greenhold'), N('Di', 'Cave'), N('Eli', ''), N('Fay', '', '---\n'.slice(0, 0)),
    ['C/NPCs/Gus.md', '---\nrole: x\n---\n# Gus\nHe drinks at [[Inn]] and sometimes [[Inn]] again, once at [[Cave]].\n'],
    ['C/NPCs/Hal.md', '---\nfaction: "[[Guild]]"\nlocation: "[[Wilds]]"\n---\n# Hal\n'], ['C/Factions/Guild.md', '---\ngoal: x\n---\n# Guild\n'],
  ]);
  const vault = new MemoryVault(files);
  const loaded = await loadCampaign(vault, 'C');
  const working = new Working(); working.loadBase(loaded.texts);
  return buildIndex({ campaign: { path: 'C', name: 'C' }, mapping: { Locations: 'location', NPCs: 'npc', Factions: 'faction' }, working, files: loaded.files });
}
test('grouping: a town is the nearest place that is a town, city or village, else the outermost place', async () => {
  const idx = await grpIndex(); const tree = LOC.locationTree(idx);
  const n = name => idx.notes.find(x => x.name === name);
  assert.equal(GRP.townOf(tree, n('Cellar')).name, 'Greenhold', 'a village, going outwards');
  assert.equal(GRP.townOf(tree, n('Greenhold')).name, 'Greenhold');
  assert.equal(GRP.townOf(tree, n('Cave')).name, 'Kingdom', 'no town on the way: the outermost place');
  assert.equal(GRP.placeOf(idx, n('Ann')).name, 'Inn'); assert.equal(GRP.placeOf(idx, n('Eli')), null);
});
test('grouping: groups by town, by exact place and by faction, A to Z, with the "nowhere" group last', async () => {
  const idx = await grpIndex(); const tree = LOC.locationTree(idx);
  const npcs = idx.byType.npc;
  const town = GRP.groupNotes(idx, npcs, 'npc', 'place', tree);
  assert.deepEqual(town.map(g => g.label + ':' + g.notes.map(x => x.name).join('+')), ['Greenhold:Ann+Bob+Cy', 'Kingdom:Di+Hal', 'Not placed anywhere:Eli+Fay+Gus']);
  assert.equal(town[2].none, true);
  const exact = GRP.groupNotes(idx, npcs, 'npc', 'exact', tree);
  assert.deepEqual(exact.map(g => g.label), ['Cave', 'Cellar', 'Greenhold', 'Inn', 'Wilds', 'Not placed anywhere']);
  const fac = GRP.groupNotes(idx, npcs, 'npc', 'faction', tree);
  assert.deepEqual(fac.map(g => g.label), ['Guild', 'No faction']); assert.equal(fac[1].notes.length, npcs.length - 1);
  assert.equal(town.reduce((t, g) => t + g.notes.length, 0), npcs.length, 'everyone is in exactly one group');
});
test('grouping: unplaced notes are offered the place their own text mentions most', async () => {
  const idx = await grpIndex();
  const sug = GRP.suggestPlaces(idx, idx.byType.npc);
  assert.equal(sug.get(idx.notes.find(x => x.name === 'Gus').path).name, 'Inn');
  assert.equal(sug.size, 1, 'only notes with no place and a mention');
});
test('grouping: when a list is long enough to group', () => {
  assert.equal(GRP.shouldGroup(21, 20), true); assert.equal(GRP.shouldGroup(20, 20), false); assert.equal(GRP.shouldGroup(1, 0), true); assert.equal(GRP.shouldGroup(500, 9999), false);
});
test('placing: the property the note already uses is the one that changes, in the front matter or the text', () => {
  const def = { key: 'location', kind: 'link', aliases: ['home', 'place'] };
  assert.equal(writeField('---\nhome: "[[Route 66]]"\n---\n# X\n', def, '[[The Weir]]'), '---\nhome: "[[The Weir]]"\n---\n# X\n', 'a place name with digits is replaced whole');
  assert.match(writeField('# X\n\n**Location:** [[Route 66]]\n', def, '[[The Weir]]'), /\*\*Location:\*\* \[\[The Weir\]\]/);
  assert.equal(writeField('---\nlocation: "[[A]]"\n---\n# X\n', def, ''), '---\n---\n# X\n'.replace('---\n---\n', '---\n---\n'));
  assert.match(writeField('# X\n', def, '[[The Weir]]'), /location: "?\[\[The Weir\]\]"?/);
});

/* ---------- 2.36: sort, filter chips ---------- */
import * as LV from '../src/core/listview.js';
test('lists: facets come from the type\'s own choice field, with counts, in the order of its options', async () => {
  const mk = (name, status) => ['C/NPCs/' + name + '.md', '---\n' + (status ? 'status: ' + status + '\n' : '') + '---\n# ' + name + '\n'];
  const vault = new MemoryVault(Object.fromEntries([mk('A', 'Dead'), mk('B', 'Alive'), mk('C', 'alive'), mk('D', 'Missing'), mk('E', ''), ['C/Locations/X.md', '---\nkind: Inn\n---\n# X\n'], ['C/Locations/Y.md', '---\nkind: Village\n---\n# Y\n'], ['C/Locations/Z.md', '---\nkind: inn\n---\n# Z\n']]));
  const loaded = await loadCampaign(vault, 'C');
  const working = new Working(); working.loadBase(loaded.texts);
  const idx = buildIndex({ campaign: { path: 'C', name: 'C' }, mapping: { NPCs: 'npc', Locations: 'location' }, working, files: loaded.files });
  const f = LV.facetFor('npc', idx.byType.npc);
  assert.deepEqual(f.values.map(v => v.v + ':' + v.count), ['Alive:2', 'Dead:1', 'Missing:1'], 'Alive, Dead, Missing, Unknown order; case folded; blanks ignored');
  assert.deepEqual(LV.filterByFacet(idx.byType.npc, 'npc', f, ['alive', 'missing']).map(n => n.name), ['B', 'C', 'D']);
  assert.equal(LV.filterByFacet(idx.byType.npc, 'npc', f, []).length, 5);
  const lf = LV.facetFor('location', idx.byType.location);
  assert.deepEqual(lf.values.map(v => v.v + ':' + v.count), ['Inn:2', 'Village:1'], 'a text Type works as a facet when there are a few');
  assert.equal(LV.facetFor('session', []), null);
  const [a, b, c] = idx.byType.npc;
  const mt = new Map([[a.path, 300], [b.path, 100], [c.path, 200]]);
  assert.deepEqual(LV.sortNotes([a, b, c], 'edited', mt).map(n => n.name), ['A', 'C', 'B']);
  assert.deepEqual(LV.sortNotes([a, b, c], 'stale', mt).map(n => n.name), ['B', 'C', 'A']);
  assert.deepEqual(LV.sortNotes([c, a, b], 'name', mt).map(n => n.name), ['A', 'B', 'C']);
  b.pending = 'edit';
  assert.equal(LV.sortNotes([a, b, c], 'edited', mt)[0].name, 'B', 'unpushed changes count as just now');
  const m = await LV.readMtimes(vault, ['C/NPCs/A.md', 'C/NPCs/Missing.md']);
  assert.ok(m.get('C/NPCs/A.md') > 0); assert.equal(m.get('C/NPCs/Missing.md'), 0);
});

test('cast: adding under the cast heading, copies and rolled people', async () => {
  const C = await import('../src/core/cast.js');
  const LV = await import('../src/core/listview.js');
  const body = "# S\n\n## Prep\n\ntext\n\n## NPC's appearing in this episode\n\n> [!example]- NPC: Bob\n> - x\n\n## Recap\n\nr\n";
  const a = C.addToCast(body, 'Ann');
  assert.equal(a.heading, "NPC's appearing in this episode");
  assert.ok(a.body.indexOf('- [[Ann]]') > a.body.indexOf('[!example]') && a.body.indexOf('- [[Ann]]') < a.body.indexOf('## Recap'), 'goes at the end of the section, before the next heading');
  const c = C.addToCast(a.body, 'Cy');
  assert.ok(c.body.includes('- [[Ann]]\n- [[Cy]]'), 'a second one joins the same list');
  assert.equal(C.addToCast(c.body, 'ann').dup, true, 'not added twice');
  const none = C.addToCast('# S\n\n## Recap\n', 'Z');
  assert.equal(none.created, true); assert.ok(none.body.endsWith('## Cast\n\n- [[Z]]\n'));
  assert.equal(C.addToCast('# S\n\n```\n## NPCs\n```\n', 'Q').created, true, 'a heading inside a code block is not a heading');
  assert.equal(C.copyName('Bob', ['Bob', 'Bob (copy)']), 'Bob (copy 2)');
  assert.equal(C.copyName('Bob (copy)', ['Bob', 'Bob (copy)']), 'Bob (copy 2)');
  assert.equal(C.copyText('---\na: 1\n---\n# Bob\n\n## Bob\n', 'Bob', 'Bob (copy)'), '---\na: 1\n---\n# Bob (copy)\n\n## Bob\n', 'only the first title heading changes');
  const idx = { resolve: n => (n === 'Taken' ? {} : null) };
  const rolled = C.rollPeople(idx, 8);
  assert.equal(rolled.length, 8); assert.equal(new Set(rolled.map(r => r.name)).size, 8, 'all different');
  assert.ok(rolled.every(r => r.fm.type === 'npc' && r.body.startsWith('# ' + r.name)));
  assert.equal(C.suggestedCount('Tavern', false), 4); assert.equal(C.suggestedCount('', true), 6); assert.equal(C.suggestedCount('Shop', true), 2);
  assert.equal(LV.defaultSort('session'), 'date'); assert.equal(LV.defaultSort('npc'), 'name');
  assert.deepEqual(LV.sortNotes([{ name: 'B', path: 'b' }, { name: 'A', path: 'a' }], 'date', null).map(n => n.name), ['B', 'A'], 'date order keeps the list as given');
});

test('player-safe copies, travel times and the shortcut list', async () => {
  const PS = await import('../src/core/playersafe.js');
  const MP = await import('../src/core/maps.js');
  const SC = await import('../src/core/shortcuts.js');
  const t = '---\ntype: npc\n---\n# Bob\n\nHe is [[Greenhold|the town]] baker.\n\n- **Role:** baker\n- **Secret:** is a spy\n  - works for [[Guild]]\n- **Wants:** peace\n\n## Secrets and clues\n\n- [ ] one\n\n## Notes\n\n> [!secret] hidden\n> shh\n\n> [!info] ok\n> fine\n\n%%private%%\n\n## Pins\n\n- 10, 20 — [[A]]\n- 30, 40 — [[B]] — secret — x\n';
  const r = PS.playerSafe(t, 'Bob');
  assert.ok(!/spy|Guild|shh|private|one|\[\[B\]\]|^- 30/m.test(r.text.replace('Bob', '')), r.text);
  assert.ok(r.text.includes('the town baker') && r.text.includes('**Wants:** peace') && r.text.includes('> fine') && r.text.includes('- 10, 20 — A'));
  assert.deepEqual([r.removed.sections.length, r.removed.callouts, r.removed.lines, r.removed.pins, r.removed.comments], [1, 1, 1, 1, 1]);
  assert.ok(PS.playerSafe(t, 'Bob', { plainLinks: false }).text.includes('[[Greenhold|the town]]'));
  assert.equal(PS.playerSafe('# X\n\nnothing secret here\n', 'X').total, 0);
  assert.ok(PS.playerSafe('```\n## Secrets\n```\n', '').text.includes('## Secrets'), 'code blocks are left alone');
  assert.equal(MP.travelText(2400, 4800), '30 minutes'.replace('30 minutes', 'under an hour'));
  assert.equal(MP.travelText(24000, 4800), '5 hours'); assert.equal(MP.travelText(48000, 4800), '1.5 days'); assert.equal(MP.travelText(100, 4800), 'a few minutes');
  const idx = { resolve: n => ({ A: { path: 'a', name: 'A' }, B: { path: 'b', name: 'B' }, C: { path: 'c', name: 'C' } }[n] || null) };
  const map = { body: '## Pins\n\n- 10, 10 — [[A]]\n- 40, 10 — [[B]]\n- 90, 10 — [[C]]\n- 50, 50 — [[C]] — secret\n', fm: { scale: '10 km' } };
  const d = MP.distancesFrom(idx, { path: 'a' }, map, 2);
  assert.deepEqual(d.map(x => x.note.name), ['B', 'C']);
  assert.equal(Math.round(d[0].metres), 3000); assert.equal(Math.round(d[1].metres), 8000, 'the secret pin is not used');
  assert.equal(MP.distancesFrom(idx, { path: 'zz' }, map, 2).length, 0);
  assert.equal(SC.keysText('mod+K', true), '⌘K'); assert.equal(SC.keysText('mod+K', false), 'Ctrl+K'); assert.equal(SC.keysText('alt+L', true), '⌥L');
  assert.ok(SC.SHORTCUTS.every(g => g.items.every(([k, w]) => k && w)));
});

test('prep and live play: outline, moving sections, must-happen, encounters, the prep check', async () => {
  const P = await import('../src/core/prep40.js');
  const E = await import('../src/core/encounters.js');
  const b = '# S\n\n## Prep\n\n## A\n\nx\n\n### A1\n\nsub\n\n## B\n\ny\n\n## C\n\nz\n';
  assert.deepEqual(P.outline(b).map(h => h.text), ['S', 'Prep', 'A', 'A1', 'B', 'C']);
  assert.equal(P.moveSection(b, 4, 1), '# S\n\n## Prep\n\n## B\n\ny\n\n## A\n\nx\n\n### A1\n\nsub\n\n## C\n\nz\n', 'a section takes its sub-sections with it');
  assert.equal(P.moveSection(b, 2, -1), null, 'nothing above Prep at its level');
  assert.equal(P.moveSection(b, 16, 1), null, 'nothing below the last one');
  assert.ok(P.moveSection(P.moveSection(b, 4, 1), 8, -1) === b, 'moving back restores it exactly');
  const must = '> [!important]+ MUST HAPPEN\n> \n> - [ ] a\n> - [x] b\n> - [ ] \n';
  assert.deepEqual(P.mustItems(must).map(m => m.text + m.done), ['afalse', 'btrue']);
  const enc = E.addEncounter('# S\n\n## Prep\n\nhi\n\n## Recap\n', 'Ambush', [{ qty: 3, name: 'Goblin' }, { qty: 1, name: 'Bugbear' }]);
  assert.ok(enc.indexOf('Encounter: Ambush') > enc.indexOf('## Prep') && enc.indexOf('Encounter: Ambush') < enc.indexOf('## Recap'), 'goes under Prep');
  const parsed = E.parseEncounters(enc);
  assert.deepEqual(parsed[0].items, [{ qty: 3, name: 'Goblin' }, { qty: 1, name: 'Bugbear' }]);
  assert.equal(E.removeEncounter(enc, parsed[0]), '# S\n\n## Prep\n\nhi\n\n## Recap\n');
  const { found, missing } = E.resolveItems(parsed[0].items, [{ n: 'goblin', cr: 0.25, key: 'g' }]);
  assert.equal(found.length, 1); assert.equal(missing[0].name, 'Bugbear'); assert.equal(E.xpOf(found), 150);
  // the prep check
  const mk = (name, type, body, fm = {}) => ({ name, type, body, fm, path: name + '.md', links: [] });
  const bob = mk('Bob', 'npc', '# Bob\n'), place = mk('Inn', 'location', '# Inn\n\nA long and cheerful common room full of smoke and singing.\n');
  const sess = { ...mk('S1', 'session', '# S1\n\n## Prep\n'), links: ['Bob', 'Inn'] };
  const idx = { byType: { npc: [bob], location: [place], player: [], plot: [], item: [], faction: [] }, byPath: new Map(), notes: [bob, place, sess], resolve: n => [bob, place].find(x => x.name === n) || null };
  const ids = P.readiness(idx, sess, {}).map(t => t.id);
  assert.ok(ids.includes('must') && ids.includes('thin') && ids.includes('place'), ids.join());
  assert.ok(!ids.includes('cast') && !ids.includes('bare'));
  assert.equal(P.readiness(idx, { ...sess, body: '# S1\n\n> [!important]+ MUST HAPPEN\n> - [ ] \n' }, {}).find(t => t.id === 'must').fix, undefined, 'an empty list is flagged but not re-added');
  assert.deepEqual(P.readiness(idx, { ...sess, body: '> [!important]+ MUST HAPPEN\n> - [ ] go\n' }, {}).map(t => t.id).includes('must'), false);
  assert.deepEqual(mentionAt('met [[Ha', 8), { start: 4, frag: 'Ha', bracket: true });
  assert.deepEqual(mentionAt('met @Hu', 7), { start: 4, frag: 'Hu' });
});

test('sidebar delay: any way of typing a time', async () => {
  const { parseDelay, delayText } = await import('../src/core/shortcuts.js');
  const ok = { '0.5': 500, '.25': 250, '1/2': 500, '1 1/2': 1500, '3/4': 750, '750ms': 750, '750 ms': 750, '2': 2000, '2s': 2000, '2 seconds': 2000, '0,5': 500, '0': 0, ' 1 ': 1000, '10': 10000 };
  for (const [t, ms] of Object.entries(ok)) assert.equal(parseDelay(t), ms, t);
  for (const t of ['', 'soon', '-1', '11', '1/0', '1..5', '5000ms ', 'abc 1']) assert.equal(parseDelay(t), t === '5000ms ' ? 5000 : null, t);
  assert.equal(delayText(0), 'straight away'); assert.equal(delayText(250), '250 ms'); assert.equal(delayText(1000), '1 second'); assert.equal(delayText(1500), '1.5 seconds');
});

test('campaign accents all pass contrast in both themes', async () => {
  const { ACCENTS, accentKey, accentOf } = await import('../src/core/accent.js');
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  assert.equal(ACCENTS.length, 6); assert.equal(new Set(ACCENTS.map(a => a.key)).size, 6);
  for (const a of ACCENTS) {
    for (const bg of ['#ffffff', '#efece2', '#f4f0e5', '#fffaf0']) assert.ok(ratio(a.light, bg) >= 4.5, a.key + ' light on ' + bg + ' ' + ratio(a.light, bg).toFixed(2));
    for (const bg of ['#181714', '#211f1b', '#2a2722', '#15171d', '#1b1e26', '#22262f', '#1a1408']) assert.ok(ratio(a.dark, bg) >= 4.5, a.key + ' dark on ' + bg + ' ' + ratio(a.dark, bg).toFixed(2));
  }
  assert.equal(accentKey('nonsense'), 'gold'); assert.equal(accentKey('ember'), 'ember'); assert.equal(accentOf('x').key, 'gold');
});

test('combat: the highest initiative has the first turn, however the party was added', async () => {
  const C = await import('../src/core/combat.js');
  const st = C.newCombat();
  for (const [n, i] of [['Arther', 1], ['LeBron', 2], ['Xir', 8], ['Lola', 10]]) C.addCombatant(st, { name: n, init: i, pc: true });
  assert.deepEqual(st.combatants.map(c => c.name), ['Lola', 'Xir', 'LeBron', 'Arther']);
  assert.equal(st.combatants[st.turn].name, 'Lola', 'the first one added (who rolled lowest) does not keep the turn');
  C.setInit(st, st.combatants[3].id, 20);
  assert.equal(st.combatants[st.turn].name, 'Arther', 'changing a number before the fight begins puts the new top first');
  C.nextTurn(st);
  assert.equal(st.combatants[st.turn].name, 'Lola', 'then it goes down the list');
  C.addCombatant(st, { name: 'Late', init: 30, pc: false });
  assert.equal(st.combatants[0].name, 'Late');
  assert.equal(st.combatants[st.turn].name, 'Lola', 'once the fight has begun, a late arrival does not steal the turn');
  C.nextTurn(st); C.nextTurn(st);
  assert.equal(st.round, 1); assert.equal(st.combatants[st.turn].name, 'LeBron');
  C.nextTurn(st);
  assert.equal(st.round, 2); assert.equal(st.combatants[st.turn].name, 'Late', 'and a new round starts at the top');
});

/* ---------- keep both (three-way merge), safe names, and the Sunday-readiness fixes ---------- */
import { merge3, hunks } from '../src/core/merge3.js';
import { sanitizeName } from '../src/core/util.js';

test('merge3: changes in different places are combined', () => {
  const base = 'a\nb\nc\nd\ne\nf\ng';
  assert.equal(merge3(base, 'a\nb\nc\nMINE\nd\ne\nf\ng', 'THEIRS\na\nb\nc\nd\ne\nf\ng'), 'THEIRS\na\nb\nc\nMINE\nd\ne\nf\ng');
  assert.equal(merge3(base, 'a\nb\nc\nd\ne\nf\ng\nmine tail', 'a\nb\nCHANGED\nd\ne\nf\ng'), 'a\nb\nCHANGED\nd\ne\nf\ng\nmine tail');
});
test('merge3: the same change on both sides, or a change on one side only, is fine', () => {
  assert.equal(merge3('a\nb', 'a\nB', 'a\nB'), 'a\nB');
  assert.equal(merge3('a\nb', 'a\nb', 'x\nb'), 'x\nb');
  assert.equal(merge3('a\nb', 'x\nb', 'a\nb'), 'x\nb');
});
test('merge3: overlapping, touching or same-spot changes are not merged', () => {
  assert.equal(merge3('a\nb\nc', 'a\nMINE\nc', 'a\nTHEIRS\nc'), null, 'the same line changed two ways');
  assert.equal(merge3('a\nb\nc', 'a\nb\nMINE\nc', 'a\nb\nTHEIRS\nc'), null, 'two lines added at the same spot');
  assert.equal(merge3('a\nb\nc\nd', 'a\nX\nc\nd', 'a\nb\nY\nd'), null, 'touching lines');
  assert.equal(merge3('a\nb\nc', 'a\nc', 'a\nB\nc'), null, 'deleted by one side and changed by the other');
});
test('merge3: a big note with log lines added in one place and a line in another', () => {
  const base = ['---', 'n: 1', '---', '## Prep', ...Array.from({ length: 800 }, (_, i) => 'line ' + i), '## Log', '<!-- start -->', '- one', '<!-- end -->', '## Recap', ''].join('\n');
  const mine = base.replace('- one\n', '- one\n- two\n- three\n');
  const theirs = base.replace('## Prep\n', '## Prep\n- from obsidian\n');
  const out = merge3(base, mine, theirs);
  assert.ok(out && out.includes('- from obsidian') && out.includes('- three'));
  assert.equal(out.split('\n').length, base.split('\n').length + 3);
});
test('merge3: CRLF notes merge too', () => {
  const base = 'a\r\nb\r\nc\r\nd\r\ne\r\n';
  assert.equal(merge3(base, 'a\r\nb\r\nc\r\nd\r\ne\r\nmine\r\n', 'THEIRS\r\na\r\nb\r\nc\r\nd\r\ne\r\n'), 'THEIRS\r\na\r\nb\r\nc\r\nd\r\ne\r\nmine\r\n');
});
test('merge3: gives up rather than guess on huge differing regions', () => {
  const a = Array.from({ length: 4000 }, (_, i) => 'a' + i).join('\n'), b = Array.from({ length: 4000 }, (_, i) => 'b' + i).join('\n');
  assert.equal(hunks(a.split('\n'), b.split('\n')), null);
});

test('sanitizeName: no leading dot, composed accents, byte-limited, nothing a Mac refuses', () => {
  assert.equal(sanitizeName('.hidden dot'), 'hidden dot');
  assert.equal(sanitizeName('trailing dot.'), 'trailing dot');
  assert.equal(sanitizeName('A/B:C?'), 'ABC');
  assert.equal(sanitizeName('é'), 'é', 'composed');
  assert.ok(new TextEncoder().encode(sanitizeName('日'.repeat(100))).length <= 200);
  assert.ok(new TextEncoder().encode(sanitizeName('🐉'.repeat(90))).length <= 200);
  assert.equal(sanitizeName('Über Straße'), 'Über Straße');
});
test('newNotePath: a name that differs only in capitals counts as taken (one file on a Mac)', async () => {
  const v = new MemoryVault({ 'Camp/Camp.md': '# Camp', 'Camp/NPCs/Wren Dunmere.md': '---\nrole: x\n---\n' }, 'V');
  const loaded = await loadCampaign(v, 'Camp');
  const w = new Working(); w.loadBase(loaded.texts);
  const np = newNotePath({ path: 'Camp' }, { NPCs: 'npc' }, 'npc', 'wren dunmere', w);
  assert.equal(np.path, 'Camp/NPCs/wren dunmere 2.md');
  const np2 = newNotePath({ path: 'Camp' }, { NPCs: 'npc' }, 'npc', 'WREN DUNMERE', w);
  assert.notEqual(np2.path.toLowerCase(), 'camp/npcs/wren dunmere.md');
});
test('working.restore drops what is already on disk, and keeps real unpushed changes', () => {
  const w = new Working(); w.loadBase(new Map([['a.md', 'one'], ['b.md', 'two']]));
  w.restore([{ path: 'a.md', kind: 'update', original: 'old', text: 'one' }, { path: 'b.md', kind: 'update', original: 'two', text: 'two!' }, { path: 'c.md', kind: 'create', original: null, text: 'new' }, { path: 'gone.md', kind: 'delete', original: 'x', text: null }]);
  assert.deepEqual(w.list().map(e => e.path).sort(), ['b.md', 'c.md']);
});
test('push review: a note changed on disk and here in different places can be kept together, and never is without a choice', async () => {
  const base = '---\nnumber: 1\n---\n## Prep\n- a\n## Log\n- one\n## Recap\n';
  const v = new MemoryVault({ 'C/C.md': '# C', 'C/Sessions/S1.md': base }, 'V');
  const loaded = await loadCampaign(v, 'C');
  const w = new Working(); w.loadBase(loaded.texts);
  w.setText('C/Sessions/S1.md', base.replace('- one\n', '- one\n- two\n'));
  await v.writeText('C/Sessions/S1.md', base.replace('## Prep\n', '## Prep\n- from obsidian\n'));
  const items = await buildReview(v, w);
  assert.equal(items[0].conflict, 'changed');
  assert.ok(typeof items[0].merged === 'string' && items[0].merged.includes('- from obsidian') && items[0].merged.includes('- two'));
  assert.equal(defaultDecisions(items)['C/Sessions/S1.md'], null, 'it is never chosen for you');
  const res = await applyPush(v, w, items, { 'C/Sessions/S1.md': 'merge' });
  assert.equal(res[0].status, 'written');
  const disk = await v.readText('C/Sessions/S1.md');
  assert.ok(disk.includes('- from obsidian') && disk.includes('- two'));
  assert.equal(w.get('C/Sessions/S1.md'), disk, 'the app now shows the combined note');
  assert.equal(w.count, 0);
});
test('push review: a changed note whose changes overlap offers no merge', async () => {
  const v = new MemoryVault({ 'C/C.md': '# C', 'C/N/X.md': 'a\nb\nc' }, 'V');
  const loaded = await loadCampaign(v, 'C');
  const w = new Working(); w.loadBase(loaded.texts);
  w.setText('C/N/X.md', 'a\nMINE\nc');
  await v.writeText('C/N/X.md', 'a\nTHEIRS\nc');
  const items = await buildReview(v, w);
  assert.equal(items[0].conflict, 'changed'); assert.equal(items[0].merged, null);
});

/* ---------- Tidy notes ---------- */
import * as TD from '../src/core/tidy.js';
import { parseLog as parseLogT, toggleLogTask as toggleLogTaskT } from '../src/core/sessionlog.js';
import { extractLinks as linksT, extractTags as tagsT } from '../src/core/markdown.js';
import { playerSafe as playerSafeT } from '../src/core/playersafe.js';
import { closeoutContext as closeoutContextT } from '../src/core/closeout.js';

const SESSION_BODY = [
  '# Session 31: Tonight', '',
  '## Prep', '- Open at the ford', '- [[Old Tam]] wants to hire the party', '',
  '## Recap', 'The players say they met a ferryman.', '',
  '## Session log', '<!-- dmforge:log -->',
  '- 19:10 met old tam at the ford, he wants 50 gold for the crossing',
  '- 19:25 #reveal tam is working for the Ember Court',
  '- 19:40 #loot silver ring from the goblin chief, worth 25gp',
  '- [ ] 19:55 #promise return the ring to Mireille by friday',
  '- 20:30 #decision party sided with calder',
  '- 20:41 Secret: the ring is cursed (DC 15 to notice)',
  '<!-- /dmforge:log -->', '',
  '## Combat', '<!-- dmforge:combat-abc -->', 'Round 3, goblins down.', '<!-- /dmforge:combat-abc -->', '',
].join('\n');
const TIDY_MD = '### The ford\n- 19:10 Met [[Old Tam]] at the ford. He wants 50 gold for the crossing.\n- 19:25 **Reveal:** Tam is working for the Ember Court.\n\n### The goblin chief\n- 19:40 **Loot:** a silver ring from the goblin chief, worth 25gp.\n\n### Decisions\n- 20:30 **Decision:** the party sided with Calder.\n\n### Secrets (DM only)\n- 20:41 The ring is cursed (DC 15 to notice).';

test('tidy: a session note is split into the parts that matter', () => {
  const { segments } = TD.splitSession(SESSION_BODY);
  const kinds = Object.fromEntries(segments.map(s => [s.heading, s.kind]));
  assert.deepEqual(kinds, { null: 'keep', Prep: 'keep', Recap: 'keep', 'Session log': 'log', Combat: 'machine' });
  const plan = TD.tidyPlan(SESSION_BODY);
  assert.deepEqual(plan.segments.map(s => [s.heading, s.include, s.locked]), [['Prep', false, true], ['Recap', false, true], ['Session log', true, false]]);
  assert.equal(plan.logLines, 6);
});
test('tidy: the material is the typed lines only (not Prep, the players\' Recap or combat)', () => {
  const plan = TD.tidyPlan(SESSION_BODY);
  const m = TD.buildMaterial(SESSION_BODY, plan.segments.filter(s => s.include).map(s => s.id));
  assert.ok(m.text.includes('met old tam at the ford') && m.text.includes('#promise return the ring'));
  assert.ok(!m.text.includes('Open at the ford') && !m.text.includes('The players say') && !m.text.includes('Round 3'));
  assert.ok(!m.text.includes('dmforge:log') && !/Session log/.test(m.text));
});
test('tidy: applying keeps everything else byte for byte, keeps promises as a log block, and keeps the original', () => {
  const plan = TD.tidyPlan(SESSION_BODY), ids = plan.segments.filter(s => s.include).map(s => s.id);
  const m = TD.buildMaterial(SESSION_BODY, ids);
  const out = TD.applyTidy(SESSION_BODY, { tidy: TIDY_MD, ids, material: m.text, today: '2026-11-20' });
  assert.ok(out.includes('## Prep\n- Open at the ford\n- [[Old Tam]] wants to hire the party\n\n## Recap\nThe players say they met a ferryman.\n\n'), 'Prep and Recap are untouched');
  assert.ok(out.includes('## Combat\n<!-- dmforge:combat-abc -->\nRound 3, goblins down.\n<!-- /dmforge:combat-abc -->'));
  assert.ok(out.includes('<!-- dmforge:tidy -->') && out.includes('### The ford') && out.includes('<!-- /dmforge:tidy -->'));
  assert.ok(!out.replace(/<!-- dmforge:original[^\n]*\n[\s\S]*?-->/, '').includes('## Session log'), 'the raw log is no longer a visible section');
  const tasks = parseLogT(out);
  assert.deepEqual(tasks.map(e => e.raw), ['- [ ] 19:55 #promise return the ring to Mireille by friday'], 'only the promise stays in the log block');
  const orig = TD.getOriginal(out);
  assert.ok(orig && orig.raw.includes('- 19:10 met old tam at the ford, he wants 50 gold for the crossing') && orig.raw.includes('Secret: the ring is cursed'));
  assert.equal(orig.date, '2026-11-20');
  assert.equal((out.match(/<!-- dmforge:original/g) || []).length, 1);
  assert.ok(TD.hasTidy(out) && TD.hasOriginal(out));
});
test('tidy: put back my original restores the note exactly', () => {
  const plan = TD.tidyPlan(SESSION_BODY), ids = plan.segments.filter(s => s.include).map(s => s.id);
  const m = TD.buildMaterial(SESSION_BODY, ids);
  const out = TD.applyTidy(SESSION_BODY, { tidy: TIDY_MD, ids, material: m.text, today: '2026-11-20' });
  const back = TD.restoreOriginal(out);
  assert.equal(back, SESSION_BODY.replace(/\s+$/, '') + '\n');
});
test('tidy: a promise ticked after tidying stays ticked when the original is put back', () => {
  const plan = TD.tidyPlan(SESSION_BODY), ids = plan.segments.filter(s => s.include).map(s => s.id);
  const m = TD.buildMaterial(SESSION_BODY, ids);
  let out = TD.applyTidy(SESSION_BODY, { tidy: TIDY_MD, ids, material: m.text, today: '2026-11-20' });
  const raw = parseLogT(out)[0].raw;
  out = toggleLogTaskT(out, raw);
  assert.ok(out.includes('- [x] 19:55 #promise return the ring'));
  assert.ok(TD.restoreOriginal(out).includes('- [x] 19:55 #promise return the ring'));
});
test('tidy: lines typed while Claude was working are not lost', () => {
  const plan = TD.tidyPlan(SESSION_BODY), ids = plan.segments.filter(s => s.include).map(s => s.id);
  const m = TD.buildMaterial(SESSION_BODY, ids);
  const later = SESSION_BODY.replace('<!-- /dmforge:log -->', '- 21:05 the goblin that fled came back with friends\n- [ ] 21:06 #hook who sent the goblins?\n<!-- /dmforge:log -->');
  const out = TD.applyTidy(later, { tidy: TIDY_MD, ids, material: m.text, today: '2026-11-20' });
  assert.ok(out.includes('### Added while tidying\n- 21:05 the goblin that fled came back with friends'));
  assert.ok(parseLogT(out).some(e => /who sent the goblins/.test(e.text)), 'a new promise is kept as a task');
  assert.ok(TD.getOriginal(out).raw.includes('the goblin that fled came back'), 'and it is in the original too');
});
test('tidy: tidying again starts from the original plus whatever was typed since, and replaces the earlier tidy', () => {
  const plan = TD.tidyPlan(SESSION_BODY), ids = plan.segments.filter(s => s.include).map(s => s.id);
  const m = TD.buildMaterial(SESSION_BODY, ids);
  let out = TD.applyTidy(SESSION_BODY, { tidy: TIDY_MD, ids, material: m.text, today: '2026-11-20' });
  out = out.replace('<!-- /dmforge:log -->', '- 22:00 an extra line typed after the tidy\n<!-- /dmforge:log -->');
  const plan2 = TD.tidyPlan(out);
  assert.ok(plan2.tidied);
  const ids2 = plan2.segments.filter(s => s.include).map(s => s.id);
  const m2 = TD.buildMaterial(out, ids2);
  assert.ok(m2.text.includes('met old tam at the ford') && m2.text.includes('an extra line typed after the tidy'), 'the original and the new line');
  assert.equal((m2.text.match(/met old tam at the ford/g) || []).length, 1, 'nothing doubled');
  const out2 = TD.applyTidy(out, { tidy: TIDY_MD + '\n- 22:00 an extra line typed after the tidy', ids: ids2, material: m2.text, today: '2026-11-21' });
  assert.equal((out2.match(/<!-- dmforge:tidy -->/g) || []).length, 1, 'one tidy block');
  assert.equal((out2.match(/<!-- dmforge:original/g) || []).length, 1, 'one original');
  assert.ok(TD.getOriginal(out2).raw.includes('an extra line typed after the tidy') && TD.getOriginal(out2).raw.includes('met old tam at the ford'));
  assert.equal((TD.getOriginal(out2).raw.match(/met old tam at the ford/g) || []).length, 1);
});
test('tidy: CRLF notes stay CRLF', () => {
  const crlf = SESSION_BODY.replace(/\n/g, '\r\n');
  const plan = TD.tidyPlan(crlf), ids = plan.segments.filter(s => s.include).map(s => s.id);
  const m = TD.buildMaterial(crlf, ids);
  const out = TD.applyTidy(crlf, { tidy: TIDY_MD, ids, material: m.text, today: '2026-11-20' });
  assert.ok(!/[^\r]\n/.test(out), 'no bare LF');
  assert.equal(TD.restoreOriginal(out), crlf.replace(/\s+$/, '') + '\r\n');
});
test('tidy: the preserved original is not counted for links or tags, and the player-safe copy drops it and the secrets', () => {
  const plan = TD.tidyPlan(SESSION_BODY), ids = plan.segments.filter(s => s.include).map(s => s.id);
  const m = TD.buildMaterial(SESSION_BODY, ids);
  const out = TD.applyTidy(SESSION_BODY, { tidy: TIDY_MD, ids, material: m.text, today: '2026-11-20' });
  const withOrig = out, without = out.replace(/<!-- dmforge:original[^\n]*\n[\s\S]*?-->/, '');
  assert.deepEqual(linksT(withOrig), linksT(without));
  assert.deepEqual(tagsT(withOrig, {}), tagsT(without, {}));
  const safe = playerSafeT(out, 'S').text;
  assert.ok(!safe.includes('Secret') && !safe.includes('cursed') && !safe.includes('met old tam at the ford, he wants') && !safe.includes('dmforge:original'));
  assert.ok(safe.includes('Met Old Tam at the ford'), 'the rest of the tidy version is shown');
});
test('tidy: Close out reads the tidy version', () => {
  const plan = TD.tidyPlan(SESSION_BODY), ids = plan.segments.filter(s => s.include).map(s => s.id);
  const m = TD.buildMaterial(SESSION_BODY, ids);
  const out = TD.applyTidy(SESSION_BODY, { tidy: TIDY_MD, ids, material: m.text, today: '2026-11-20' });
  const ctx = closeoutContextT({ session: { text: out, links: [], name: 'S' }, idx: { notes: [], resolve: () => null } });
  assert.ok(ctx.notes.includes('Tam is working for the Ember Court'));
  assert.ok(!ctx.notes.includes('met old tam at the ford, he wants'), 'not the original as well');
});
test('tidy: the check finds a lost number, a lost name, and something made up', () => {
  const mat = '- 19:10 met old tam at the ford, he wants 50 gold\n- 19:40 silver ring from Chief Brakk, worth 25gp';
  const good = 'Met [[Old Tam]] at the ford. He wants 50 gold.\nA silver ring from Chief Brakk, worth 25gp.';
  assert.equal(TD.checkFidelity(mat, good, ['Old Tam']).hard, 0);
  const lost = TD.checkFidelity(mat, 'Met Old Tam at the ford. A silver ring from Chief Brakk.', ['Old Tam']);
  assert.deepEqual(lost.missing.numbers.sort(), ['25', '50']);
  const lostName = TD.checkFidelity(mat, 'Met Old Tam at the ford. He wants 50 gold. A silver ring, worth 25gp.', ['Old Tam']);
  assert.ok(lostName.missing.names.includes('brakk') || lostName.missing.names.includes('chief'));
  const made = TD.checkFidelity(mat, good + ' Brakk had 300 followers and rode a Dragon.', ['Old Tam']);
  assert.ok(made.added.numbers.includes('300') && made.added.names.includes('dragon'));
  assert.equal(made.hard, 0, 'additions are flagged but do not block');
});
test('tidy: the check sees a lost link to a known person even if the name was reworded', () => {
  const r = TD.checkFidelity('- 19:10 Mireille gave us the key', 'The innkeeper gave us the key.', ['Mireille Vane']);
  assert.ok(r.hard >= 1);
});
test('tidy: a secret that moved out of the DM section is caught', () => {
  const mat = '- 20:41 Secret: the ring is cursed, 15 hit points to break it\n- 20:50 The party rested';
  const leaky = '### Scenes\n- 20:50 The party rested.\n- The ring is cursed and takes 15 hit points to break.';
  const safe = '### Scenes\n- 20:50 The party rested.\n\n### Secrets (DM only)\n- The ring is cursed and takes 15 hit points to break.';
  assert.equal(TD.secretLeaks(mat, safe).length, 0);
  assert.equal(TD.secretLeaks(mat, leaky).length, 1);
});
test('tidy: long notes are split at scene breaks, in order, with nothing lost', () => {
  const text = Array.from({ length: 400 }, (_, i) => '- 19:' + String(i % 60).padStart(2, '0') + ' line number ' + i + ' with some words to make it long enough').join('\n');
  const chunks = TD.chunkMaterial(text, 3000);
  assert.ok(chunks.length > 4 && chunks.every(c => c.length <= 3100));
  assert.equal(chunks.join('\n').split('\n').length, 400);
  assert.ok(chunks[0].includes('line number 0 ') && chunks[chunks.length - 1].includes('line number 399 '));
});
test('tidy: without Claude, the log becomes a timeline with tags as labels, and promises are left as tasks', () => {
  const t = TD.plainTidy('- 19:10 met old tam\n- 19:25 #reveal tam is a spy\n- [ ] 19:55 #promise return the ring\n- 20:30 #decision sided with calder\n\nsome loose notes\n##Heading no space');
  assert.ok(t.includes('### Timeline') && t.includes('- 19:10 met old tam') && t.includes('**Reveal:** tam is a spy') && t.includes('**Decision:** sided with calder'));
  assert.ok(!t.includes('return the ring'), 'the promise stays as a task');
  assert.ok(t.includes('some loose notes') && t.includes('## Heading no space'));
  const sec = TD.plainTidy('- 19:10 met tam\n- 20:41 Secret: the ring is cursed');
  assert.ok(sec.includes('### Secrets (DM only)\n- 20:41 Secret: the ring is cursed') && !sec.split('### Secrets')[0].includes('cursed'), 'secret lines go to the DM section');
});
test('tidy: Claude\'s answer is read as markdown, and rubbish is refused', () => {
  assert.equal(TD.parseTidy('```markdown\n### Scene\n- 19:10 something happened\n```'), '### Scene\n- 19:10 something happened');
  assert.equal(TD.parseTidy('sorry'), null);
  assert.equal(TD.parseTidy('I could not do that, sorry. Please try again later.'), null, 'prose with no headings or bullets');
  assert.equal(TD.parseTidy("Here is the tidy version:\n\n### Scene\n- 19:10 something happened here"), '### Scene\n- 19:10 something happened here', 'a chatty first line is dropped');
  assert.equal(TD.parseTidy('### A\n- one', 500), null, 'far shorter than the notes');
  assert.equal(TD.parseTidy(''), null);
});

test('tidy: parts of a long night are joined with all the secrets under one heading', () => {
  const j = TD.joinParts(['### One\n- a\n\n### Secrets (DM only)\n- s1', '### Two\n- b\n\n### Secrets (DM only)\n- s2\n- s3']);
  assert.equal(j, '### One\n- a\n\n### Two\n- b\n\n### Secrets (DM only)\n- s1\n- s2\n- s3');
});
test('tidy: section ids do not move when a section is added while Claude works', () => {
  const a = TD.splitSession('# T\n\n## Notes\nx\n\n## Recap\ny\n').segments.map(s => s.id);
  const b = TD.splitSession('# T\n\n## Notes\nx\n\n## Brand new\nz\n\n## Recap\ny\n').segments.map(s => s.id);
  assert.ok(a.includes('h:notes') && b.includes('h:notes') && a.includes('h:recap') && b.includes('h:recap'));
});
test('tidy: names offered to Claude are the ones the notes mention, and the party', () => {
  const notes = [{ name: 'Old Tam', type: 'npc' }, { name: 'Mireille Vane', type: 'npc' }, { name: 'Greenhold', type: 'location' }, { name: 'Zed Nothere', type: 'npc' }, { name: 'Kestra Dune', type: 'player' }];
  const r = TD.mentionedNames('met old tam, then mireille at greenhold', notes);
  assert.deepEqual(r.names.sort(), ['Greenhold', 'Mireille Vane', 'Old Tam']);
  assert.deepEqual(r.party, ['Kestra Dune']);
});

test('tidy: when the log is the last section, tidying twice still leaves exactly one original, not one inside another', () => {
  const body = '# T\n\n## Prep\n- p\n\n## Session log\n<!-- dmforge:log -->\n- 19:10 met tam\n- [ ] 19:20 #promise pay tam\n<!-- /dmforge:log -->\n';
  const ids = TD.tidyPlan(body).segments.filter(s => s.include).map(s => s.id);
  const m = TD.buildMaterial(body, ids);
  let out = TD.applyTidy(body, { tidy: '### Scene\n- 19:10 Met tam.', ids, material: m.text, today: '2026-11-20' });
  assert.equal((out.match(/<!-- dmforge:original/g) || []).length, 1);
  const ids2 = TD.tidyPlan(out).segments.filter(s => s.include).map(s => s.id);
  const m2 = TD.buildMaterial(out, ids2);
  assert.ok(!m2.text.includes('dmforge:original'), 'the original is not part of the material');
  const out2 = TD.applyTidy(out, { tidy: '### Scene\n- 19:10 Met tam.', ids: ids2, material: m2.text, today: '2026-11-21' });
  assert.equal((out2.match(/<!-- dmforge:original/g) || []).length, 1, 'one original');
  assert.ok(!TD.getOriginal(out2).raw.includes('dmforge:original'), 'and nothing nested in it');
  assert.equal(TD.restoreOriginal(out2), body);
});

test('tidy: a word the notes had in lower case, capitalised by the tidy version, is not flagged as made up', () => {
  const r = TD.checkFidelity('- 20:10 DC 15 arcana to notice, then went to the inn', '- 20:10 DC 15 Arcana to notice, then went to the Inn.', []);
  assert.deepEqual(r.added.names, []);
  const made = TD.checkFidelity('- 20:10 went to the inn', '- 20:10 went to the inn, where the Dragon waited.', []);
  assert.deepEqual(made.added.names, ['dragon'], 'but a word that is nowhere in the notes still is');
});

test('tidy: a possessive is the same name (Wren\'s is Wren), in the notes or the tidy version', () => {
  const r = TD.checkFidelity('- 20:10 met wren at the gate. Kestra took the Ogre\'s club', '- 20:10 Met Wren at the gate. Kestra took the Ogre\u2019s club. Wren\'s brother is missing.', []);
  assert.deepEqual(r.added.names, [], JSON.stringify(r));
  assert.equal(r.hard, 0);
});

/* ---- 2.48: editing a prepared encounter ---- */
import { parseEncounters as pe48, replaceEncounter as re48, encounterBlock as eb48 } from '../src/core/encounters.js';
test('replaceEncounter changes the name and creatures, keeps your own notes and the fold marker', () => {
  const body = '## Prep\n\n> [!danger]+ Encounter: Ambush at the weir\n> - 3× Goblin\n> - 1× Bugbear\n> Tactics: they hide in the reeds\n\nAfter.\n';
  const enc = pe48(body)[0];
  const out = re48(body, enc, 'Ambush at the ford', [{ qty: 2, name: 'Goblin' }, { qty: 1, name: 'Ogre' }, { qty: 4, name: 'Wolf' }]);
  const again = pe48(out);
  assert.equal(again.length, 1);
  assert.equal(again[0].title, 'Ambush at the ford');
  assert.deepEqual(again[0].items, [{ qty: 2, name: 'Goblin' }, { qty: 1, name: 'Ogre' }, { qty: 4, name: 'Wolf' }]);
  assert.match(out, /\[!danger\]\+ Encounter: Ambush at the ford/);
  assert.match(out, /> Tactics: they hide in the reeds/);
  assert.ok(out.endsWith('\n\nAfter.\n'));
  assert.ok(out.startsWith('## Prep\n\n'));
});
test('replaceEncounter with the same content changes nothing, and limits quantities to 1 to 99', () => {
  const body = eb48('Fight', [{ qty: 3, name: 'Goblin' }, { qty: 1, name: 'Bugbear' }]) + '\n';
  const enc = pe48(body)[0];
  assert.equal(re48(body, enc, 'Fight', enc.items), body);
  const big = re48(body, enc, 'Fight', [{ qty: 500, name: 'Rat' }, { qty: 0, name: 'Bat' }]);
  assert.deepEqual(pe48(big)[0].items, [{ qty: 99, name: 'Rat' }, { qty: 1, name: 'Bat' }]);
});
test('replaceEncounter edits the right one of two encounters, with Windows line endings', () => {
  const body = ['> [!danger]- Encounter: One', '> - 1× Rat', '', '> [!danger]- Encounter: Two', '> - 2× Bat', ''].join('\r\n');
  const encs = pe48(body);
  const out = re48(body, encs[1], 'Two (hard)', [{ qty: 5, name: 'Bat' }]);
  const p = pe48(out);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0].items, [{ qty: 1, name: 'Rat' }]);
  assert.equal(p[1].title, 'Two (hard)');
  assert.deepEqual(p[1].items, [{ qty: 5, name: 'Bat' }]);
});

/* ---- 2.48: typeface sets ---- */
import { FONT_SETS as FS48, FONT_SET_IDS as FSI48, fontSetOf as fso48 } from '../src/core/fontsets.js';
import fs48 from 'node:fs';
test('typeface sets: seven, unique, Today first, and the unknown id falls back to Today', () => {
  assert.equal(FS48.length, 7);
  assert.equal(new Set(FSI48).size, 7);
  assert.equal(FS48[0].id, 'today');
  assert.equal(fso48('nope').id, 'today');
  assert.equal(fso48('storybook').head, 'Alegreya');
});
test('typeface sets: every font is embedded (fonts.css) and every set has its CSS (styles.css)', () => {
  const fonts = fs48.readFileSync(new URL('../src/ui/fonts.css', import.meta.url), 'utf8');
  const css = fs48.readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  for (const f of FS48) {
    for (const fam of [f.head, f.body, f.mono]) assert.ok(fonts.includes("font-family:'" + fam + "'"), f.id + ': ' + fam + ' is not embedded');
    if (f.id !== 'today') {
      const rule = new RegExp(':root\\[data-type="' + f.id + '"\\]\\{([^}]*)\\}').exec(css);
      assert.ok(rule, f.id + ' has no CSS');
      for (const fam of [f.head, f.body, f.mono]) assert.ok(rule[1].includes("'" + fam + "'"), f.id + ' CSS does not use ' + fam);
    }
  }
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(fonts + css), 'no font may be loaded from the internet');
});

/* ---- 2.49: who seeded a plot thread ---- */
import * as SD from '../src/core/seeds.js';
import { writeField as wf49 } from '../src/core/fieldwrite.js';
import { toStored as ts49, fieldDefs as fd49 } from '../src/core/schema.js';
const seedDef49 = fd49('plot').find(f => f.key === 'seeded');
async function world49() {
  const f = {
    'C/NPCs/Old Tam.md': '---\nrole: Ferryman\n---\n# Old Tam\n',
    'C/NPCs/Edda Wick.md': '# Edda Wick\n',
    'C/Factions/Ember Court.md': '# Ember Court\n',
    'C/Players/Kestra Dune.md': '---\nclass: Rogue\n---\n# Kestra Dune\n',
    'C/Plot Threads/Bells.md': '---\nstatus: Active\nseeded:\n  - "[[Old Tam]]"\n  - "[[Ember Court]]"\n---\n# Bells\n',
    'C/Plot Threads/Well.md': '---\nstatus: Active\nseeded: [[Kestra Dune]]\n---\n# Well\n',
    'C/Plot Threads/Letter.md': '---\nstatus: Dormant\nplanted by: Old Tam, Edda Wick, Nobody Known\n---\n# Letter\n',
    'C/Plot Threads/Plain.md': '---\nstatus: Active\n---\n# Plain\n',
  };
  const loaded = await loadCampaign(new MemoryVault(f), 'C');
  const working = new Working(); working.loadBase(loaded.texts);
  return buildIndex({ campaign: { path: 'C', name: 'C' }, mapping: { NPCs: 'npc', Factions: 'faction', Players: 'player', 'Plot Threads': 'plot' }, working, files: loaded.files });
}
test('seeders: read from a list of links, one link, or plain names under an alias; unknown names are kept', async () => {
  const idx = await world49();
  const of = n => SD.seedersOf(idx, idx.byType.plot.find(t => t.name === n)).map(s => s.name + (s.note ? '' : '?'));
  assert.deepEqual(of('Bells'), ['Old Tam', 'Ember Court']);
  assert.deepEqual(of('Well'), ['Kestra Dune']);
  assert.deepEqual(of('Letter'), ['Old Tam', 'Edda Wick', 'Nobody Known?']);
  assert.deepEqual(of('Plain'), []);
});
test('seeders: the threads an NPC, faction or player seeded, and the filter chips', async () => {
  const idx = await world49();
  const tam = idx.resolve('Old Tam');
  assert.deepEqual(SD.seededThreads(idx, tam).map(t => t.name), ['Bells', 'Letter']);
  assert.deepEqual(SD.seededThreads(idx, idx.resolve('Kestra Dune')).map(t => t.name), ['Well']);
  assert.deepEqual(SD.seededThreads(idx, idx.resolve('Edda Wick')).map(t => t.name), ['Letter']);
  const f = SD.seederFacet(idx, idx.byType.plot);
  assert.equal(f.values[0].v, 'Old Tam'); assert.equal(f.values[0].count, 2);
  assert.deepEqual(SD.filterBySeeder(idx, idx.byType.plot, ['old tam']).map(t => t.name).sort(), ['Bells', 'Letter']);
  assert.deepEqual(SD.filterBySeeder(idx, idx.byType.plot, ['ember court', 'kestra dune']).map(t => t.name).sort(), ['Bells', 'Well']);
  assert.equal(SD.filterBySeeder(idx, idx.byType.plot, []).length, 4);
  assert.equal(SD.seederFacet(idx, [idx.byType.plot.find(t => t.name === 'Plain')]), null);
});
test('seeders: toStored turns "A, B" into a list of links, and nothing into nothing', () => {
  assert.deepEqual(ts49(seedDef49, 'Old Tam, Ember Court'), ['[[Old Tam]]', '[[Ember Court]]']);
  assert.deepEqual(ts49(seedDef49, ['[[Old Tam]]', ' Edda Wick ']), ['[[Old Tam]]', '[[Edda Wick]]']);
  assert.equal(ts49(seedDef49, ''), undefined);
  assert.equal(ts49(seedDef49, ' , '), undefined);
});
test('seeders: writing the field keeps the property where it is, and leaves the rest of the note alone', () => {
  const note = '---\nstatus: Active\nplanted by: "[[Old Tam]]"\ntags: [a]\n---\n# T\n\nBody [[X]].\n';
  const out = wf49(note, seedDef49, ['Old Tam', 'Ember Court']);
  assert.match(out, /planted by:\n  - "\[\[Old Tam\]\]"\n  - "\[\[Ember Court\]\]"\ntags: \[a\]\n---\n# T\n\nBody \[\[X\]\]\.\n$/);
  assert.ok(!/seeded:/.test(out), 'no second copy under the schema key');
  assert.ok(!/planted by/.test(wf49(note, seedDef49, [])), 'no seeders removes the property');
  const none = '---\nstatus: Active\n---\n# T\n';
  assert.match(wf49(none, seedDef49, 'Edda Wick'), /seeded:\n  - "\[\[Edda Wick\]\]"\n---/);
  assert.equal(wf49(none, seedDef49, []), none);
  const inline = '# T\n\nSeeded by:: [[Old Tam]]\n\nText\n';
  assert.equal(wf49(inline, seedDef49, ['Old Tam', 'Edda Wick']), '# T\n\nSeeded by:: [[Old Tam]], [[Edda Wick]]\n\nText\n');
});

/* ---- 2.50: custom monsters ---- */
import * as CM from '../src/core/custommonster.js';
import { noteMonster as nm50, statBlockMarkdown as sbm50 } from '../src/core/monsters.js';
import { splitFrontmatter as sf50 } from '../src/core/frontmatter.js';
const goblinForm = () => Object.assign(CM.blankMonster(), { name: 'Cave Goblin', size: 'Small', type: 'humanoid (goblinoid)', align: 'chaotic neutral', ac: '15', acd: 'leather, shield', hp: '10', hd: '3d6', ini: '', speed: '9 m', ab: ['8', '14', '10', '10', '8', '8'], sk: 'Stealth +6', se: 'Darkvision 18 m; Passive Perception 9', ln: 'Common, Goblin', cr: '1/4', tr: '**Nimble Escape.** Disengages as a bonus action.', act: '**Scimitar.** Melee: +4 to hit. Hit: 5 (1d6 + 2) slashing damage.\n\n**Shortbow.** Ranged: +4 to hit, range 24/96 m.', la: 'Pack up and run.\n\n**Scatter (Costs 2 Actions).** Everyone moves.' });
test('custom monster: the form checks name, hit points, armour class and challenge rating', () => {
  assert.deepEqual(Object.keys(CM.checkForm(CM.blankMonster())).sort(), ['ac', 'hp', 'name']);
  assert.deepEqual(CM.checkForm(goblinForm()), {});
  assert.ok(CM.checkForm({ ...goblinForm(), name: 'A/B' }).name);
  assert.ok(CM.checkForm({ ...goblinForm(), hp: '0' }).hp);
  assert.ok(CM.checkForm({ ...goblinForm(), cr: 'tough' }).cr);
  assert.deepEqual(CM.checkForm({ ...goblinForm(), cr: '' }), {});
});
test('custom monster: the note carries properties the library reads, and the stat block', () => {
  const n = CM.formNote(goblinForm());
  assert.deepEqual([n.fm.cr, n.fm.size, n.fm.creature, n.fm.ac, n.fm.hp, n.fm.init, n.fm.hd, n.fm.statblock], ['1/4', 'Small', 'humanoid (goblinoid)', 15, 10, 2, '3d6', 'form']);
  assert.match(n.body, /^# Cave Goblin\n\n\*Small Humanoid \(goblinoid\), Chaotic Neutral\*/);
  assert.match(n.body, /\*\*Scimitar\.\*\* Melee/);
  assert.match(n.body, /### Legendary Actions\n\nPack up and run\.\n\*\*Scatter \(Cost 2\)\.\*\* Everyone moves\./);
  const m = nm50({ name: 'Cave Goblin', path: 'C/Bestiary/Cave Goblin.md', fm: n.fm, body: n.body, inline: {} });
  assert.deepEqual([m.ac, m.hp, m.ini, m.cr, m.t, m.hd], [15, 10, 2, 0.25, 'humanoid (goblinoid)', '3d6']);
});
test('custom monster: initiative is the Dex modifier unless you give one', () => {
  assert.equal(CM.formNote({ ...goblinForm(), ini: '' }).fm.init, 2);
  assert.equal(CM.formNote({ ...goblinForm(), ini: '-1' }).fm.init, -1);
  assert.equal(CM.formNote({ ...goblinForm(), ini: '4' }).fm.init, 4);
});
test('custom monster: the form is kept in the note and comes back; a note changed by hand is told apart', () => {
  const f = goblinForm();
  const n = CM.formNote(f);
  const r = CM.readForm(n.body);
  assert.equal(r.edited, false);
  assert.deepEqual(r.form, f);
  assert.equal(CM.readForm(n.body.replace('Melee: +4', 'Melee: +9')).edited, true);
  assert.equal(CM.readForm('# Just a note\n'), null);
  const tricky = { ...f, tr: '**Odd.** Has --> and <!-- and "quotes" in it.' };
  const rt = CM.readForm(CM.formNote(tricky).body);
  assert.equal(rt.form.tr, tricky.tr);
  assert.equal(CM.readForm(CM.formNote(tricky).body.replace(/\r?\n/g, '\r\n')).edited, false, 'Windows line endings do not count as a change');
});
test('custom monster: a copy of a built-in monster becomes a form and goes back to the same stat block', () => {
  const m = { src: 'srd', n: 'Wolf', sz: 'Medium', t: 'beast', al: 'unaligned', ac: 12, acd: 'natural armor', hp: 11, hd: '2d8 + 2', ini: 2, sp: '40 ft.', ab: [12, 15, 12, 3, 12, 6], sk: 'Perception +3, Stealth +4', se: 'Passive Perception 13', ln: '', cr: 0.25, tr: [['Pack Tactics', 'Advantage on attacks.']], ac_: [['Bite', 'Melee: +4. Hit: 7 (2d4 + 2) piercing damage.']], ba: [], re: [], la: [] };
  const f = CM.monsterToForm(m);
  assert.equal(f.name, 'Wolf (custom)'); assert.equal(f.cr, '1/4'); assert.equal(f.speed, '12 m');
  const rec = CM.formToRecord(f);
  assert.deepEqual([rec.ac, rec.hp, rec.cr, rec.ab.join()], [12, 11, 0.25, '12,15,12,3,12,6']);
  assert.deepEqual(rec.tr, [['Pack Tactics', 'Advantage on attacks.']]);
  assert.deepEqual(rec.ac_.map(a => a[0]), ['Bite']);
});
test('custom monster: pasting a stat block fills the form (2024 and older layouts)', () => {
  const a = CM.parseStatBlock('GOBLIN WARRIOR\nSmall Humanoid, Chaotic Neutral\nAC 15 Initiative +2 (12)\nHP 10 (3d6)\nSpeed 30 ft.\nSTR 8 (-1) DEX 14 (+2) CON 10 (+0) INT 10 (+0) WIS 8 (-1) CHA 8 (-1)\nSkills Stealth +6\nSenses Darkvision 60 ft.; Passive Perception 9\nLanguages Common, Goblin\nCR 1/4 (XP 50; PB +2)\nTraits\nNimble Escape. The goblin can Disengage as a Bonus Action.\nActions\nScimitar. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.\nShortbow. Ranged Attack Roll: +4, range 80/320 ft. Hit: 5 (1d6 + 2)\nPiercing damage.');
  const f = a.fields;
  assert.deepEqual([f.name, f.size, f.type, f.align, f.ac, f.hp, f.hd, f.ini, f.cr, f.ab.join()], ['Goblin Warrior', 'Small', 'humanoid', 'chaotic neutral', '15', '10', '3d6', '2', '1/4', '8,14,10,10,8,8']);
  assert.match(f.speed, /^9 m/); assert.match(f.se, /Darkvision 18 m/);
  assert.equal(f.tr, '**Nimble Escape.** The goblin can Disengage as a Bonus Action.');
  assert.match(f.act, /^\*\*Scimitar\.\*\* Melee Attack Roll: \+4/);
  assert.match(f.act, /\n\n\*\*Shortbow\.\*\* .*Hit: 5 \(1d6 \+ 2\) Piercing damage\.$/, 'a wrapped line stays with its entry');
  assert.deepEqual(a.missing, []);
  const b = CM.parseStatBlock('Goblin\nSmall humanoid (goblinoid), neutral evil\nArmor Class 15 (leather armor, shield)\nHit Points 7 (2d6)\nSpeed 30 ft.\nSTR DEX CON INT WIS CHA\n8 (-1) 14 (+2) 10 (+0) 10 (+0) 8 (-1) 8 (-1)\nChallenge 1/4 (50 XP)\nNimble Escape. The goblin can take the Disengage or Hide action as a bonus action.\nACTIONS\nScimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.').fields;
  assert.deepEqual([b.name, b.type, b.acd, b.hp, b.hd, b.cr, b.ab.join()], ['Goblin', 'humanoid (goblinoid)', 'leather armor, shield', '7', '2d6', '1/4', '8,14,10,10,8,8']);
  assert.match(b.tr, /^\*\*Nimble Escape\.\*\*/); assert.match(b.act, /^\*\*Scimitar\.\*\*/);
  const none = CM.parseStatBlock('hello there, this is not a stat block');
  assert.equal(none.count, 1);
  assert.deepEqual(none.missing, ['ac', 'hp', 'cr']);
});

/* ---- 2.51: where a plot thread appears ---- */
import * as AP from '../src/core/appears.js';
async function world51() {
  const f = {
    'C/Locations/Greenhold.md': '---\nkind: Town\n---\n# Greenhold\n',
    'C/Locations/The Weir.md': '# The Weir\n',
    'C/Locations/The Chapel.md': '# The Chapel\n',
    'C/NPCs/Old Tam.md': '# Old Tam\n',
    'C/Plot Threads/Bells.md': '---\nstatus: Active\nappears:\n  - "[[Greenhold]]"\n  - "[[The Weir]]"\n---\n# Bells\n\nSearch [[The Chapel]] and talk to [[Old Tam]]. Back in [[Greenhold]].\n',
    'C/Plot Threads/Well.md': '---\nstatus: Active\nappears in: The Weir\n---\n# Well\n',
    'C/Plot Threads/Letter.md': '---\nstatus: Dormant\n---\n# Letter\n\nIt was found in [[The Chapel]].\n',
    'C/Plot Threads/Plain.md': '---\nstatus: Active\n---\n# Plain\n\nNothing here but [[Old Tam]].\n',
  };
  const loaded = await loadCampaign(new MemoryVault(f), 'C');
  const working = new Working(); working.loadBase(loaded.texts);
  return buildIndex({ campaign: { path: 'C', name: 'C' }, mapping: { Locations: 'location', NPCs: 'npc', 'Plot Threads': 'plot' }, working, files: loaded.files });
}
test('appears in: a thread is at the places on its property only; places its text mentions are only suggested', async () => {
  const idx = await world51();
  const at = n => AP.placesOf(idx, idx.byType.plot.find(t => t.name === n)).map(p => p.note.name);
  assert.deepEqual(at('Bells'), ['Greenhold', 'The Weir']);
  assert.deepEqual(at('Well'), ['The Weir'], 'a plain-name alias on the property is read, an NPC link is not a place');
  assert.deepEqual(at('Letter'), [], 'mentioning a place in the text does not put the thread there');
  assert.deepEqual(at('Plain'), []);
  const sug = n => AP.textPlaces(idx, idx.byType.plot.find(t => t.name === n)).map(p => p.note.name + ':' + p.count);
  assert.deepEqual(sug('Bells'), ['The Chapel:1'], 'Greenhold is already on the property, so it is not offered again');
  assert.deepEqual(sug('Letter'), ['The Chapel:1']);
  assert.deepEqual(sug('Plain'), []);
});
test('appears in: threads at a place, the filter chips, the filter, and grouping by place', async () => {
  const idx = await world51();
  const plots = idx.byType.plot;
  assert.deepEqual(AP.threadsAt(idx, idx.resolve('The Weir')).map(t => t.name), ['Bells', 'Well']);
  assert.deepEqual(AP.threadsAt(idx, idx.resolve('The Chapel')).map(t => t.name), [], 'a mention is not an appearance');
  const f = AP.appearsFacet(idx, plots);
  assert.deepEqual(f.values.map(v => v.v + ':' + v.count).sort(), ['Greenhold:1', 'The Weir:2']);
  const greenhold = idx.resolve('Greenhold').path, weir = idx.resolve('The Weir').path;
  assert.deepEqual(AP.filterByPlace(idx, plots, [greenhold]).map(t => t.name), ['Bells']);
  assert.deepEqual(AP.filterByPlace(idx, plots, [greenhold, weir]).map(t => t.name).sort(), ['Bells', 'Well']);
  assert.equal(AP.filterByPlace(idx, plots, []).length, 4);
  const g = AP.groupByPlace(idx, plots);
  assert.deepEqual(g.map(x => x.label + ':' + x.notes.map(n => n.name).join('+')), ['Greenhold:Bells', 'The Weir:Bells+Well', 'Not tied to a place:Letter+Plain']);
  assert.equal(g[g.length - 1].none, true);
  assert.equal(AP.appearsFacet(idx, [plots.find(t => t.name === 'Plain')]), null);
});
test('appears in: the field writes as a list of links, like Seeded by', () => {
  const def = fd49('plot').find(f => f.key === 'appears');
  assert.equal(def.kind, 'links');
  assert.match(wf49('---\nstatus: Active\n---\n# T\n', def, ['Greenhold', 'The Weir']), /appears:\n  - "\[\[Greenhold\]\]"\n  - "\[\[The Weir\]\]"\n---/);
});
