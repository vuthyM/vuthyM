import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/core/atlas.js';
import { parsePins, pinLine, headingLine, writePins } from '../src/core/maps.js';
import { playerSafe } from '../src/core/playersafe.js';
import { splitFrontmatter } from '../src/core/frontmatter.js';

const SHA1 = 'a'.repeat(64), SHA2 = 'b'.repeat(64), SHA3 = 'c'.repeat(64);
const room = (id, n, name, x, y, secret = false, seed = '') => ({ id, n, name, x, y, cx: 1, cy: 1, secret, seed });
const level = (mapId, lv, order, rooms, sha = SHA1) => ({ mapId, mapName: 'm', level: lv, order, cellFt: 5, publishedAt: 't', mapUpdatedAt: 't', image: { url: '/x', type: 'image/png', width: 1000, height: 800, bytes: 5000, sha256: sha, pxPerCell: 50 }, rooms });
const raw = (levels, extra = {}) => ({ format: 'dmatlas-forge/1', id: 'd1', name: 'Rift Keep', publishedAt: 't', levels, ...extra });
const oneLevel = () => raw([level('m1', 'Level 1', 0, [room('r1', '1', 'Entrance', 10, 20, false, 'A cold draught.'), room('r2', '2', 'Vault', 50.04, 60.06, true, 'Gold, and a trap.'), room('r3', '3', 'Cellar', 80, 90)])]);
const twoLevels = () => raw([
  level('m2', 'Level 2', 1, [room('r4', '2.1', 'Pit', 30, 30), room('r5', '2.2', 'Secret Shrine', 70, 70, true, 'Holy.')], SHA2),
  level('m1', 'Level 1', 0, [room('r1', '1.1', 'Entrance', 10, 20, false, 'Cold.'), room('r2', '1.2', 'Hall', 50, 60)]),
]);
const ok = r => { const x = A.sanitizeDungeon(r); assert.ok(x.dungeon, x.error); return x.dungeon; };

/* ---------- checking what DMAtlas sent ---------- */
test('atlas: a good dungeon is accepted, levels go in order and positions are clamped and rounded', () => {
  const d = ok(twoLevels());
  assert.deepEqual(d.levels.map(l => l.level), ['Level 1', 'Level 2']);
  const w = ok(raw([level('m1', 'L', 0, [room('a', '1', 'Edge', -20, 250.55), room('b', '2', 'Mid', 33.349, 66.66)])]));
  assert.deepEqual(w.levels[0].rooms.map(r => [r.x, r.y]), [[0, 100], [33.3, 66.7]]);
});
test('atlas: a dungeon in a format we do not know, or a newer one, is refused with a reason', () => {
  assert.match(A.sanitizeDungeon(null).error, /cannot read/);
  assert.match(A.sanitizeDungeon({ ...oneLevel(), format: 'other/1' }).error, /format we do not know/);
  assert.match(A.sanitizeDungeon({ ...oneLevel(), format: 'dmatlas-forge/2' }).error, /newer format/);
  assert.match(A.sanitizeDungeon({ ...oneLevel(), id: '../x' }).error, /usable id/);
  assert.match(A.sanitizeDungeon({ ...oneLevel(), levels: [] }).error, /no levels/);
  assert.match(A.sanitizeDungeon({ ...oneLevel(), levels: Array(31).fill(oneLevel().levels[0]) }).error, /more than/);
});
test('atlas: rooms and levels that are not usable are skipped with a warning, never trusted', () => {
  const bad = raw([level('m1', 'L', 0, [
    room('ok', '1', 'Fine', 5, 5),
    { id: 'nan', n: '2', name: 'NaN', x: NaN, y: 5 },
    { id: 'str', n: '3', name: 'Str', x: '5', y: 5 },
    { id: '../evil', n: '4', name: 'Evil', x: 1, y: 1 },
    { id: 'ok', n: '5', name: 'Duplicate', x: 1, y: 1 },
    null, 7, 'x',
  ]), { ...level('m2', 'No picture', 1, []), image: null }, level('m3', 'Huge', 2, [], SHA3)]);
  bad.levels[2].image.width = 99999;
  const x = A.sanitizeDungeon(bad);
  assert.deepEqual(x.dungeon.levels.map(l => l.mapId), ['m1']);
  assert.deepEqual(x.dungeon.levels[0].rooms.map(r => r.id), ['ok']);
  assert.ok(x.warnings.length >= 6);
  const none = A.sanitizeDungeon(raw([{ ...level('m1', 'L', 0, []), image: { sha256: 'short' } }]));
  assert.match(none.error, /None of the dungeon/);
  const sizes = raw([level('m1', 'L', 0, [])]); sizes.levels[0].image.bytes = 16 * 1024 * 1024;
  assert.ok(A.sanitizeDungeon(sizes).error);
  const dupMaps = raw([level('m1', 'A', 0, []), level('m1', 'B', 1, [])]);
  assert.equal(A.sanitizeDungeon(dupMaps).dungeon.levels.length, 1);
});
test('atlas: names cannot break a heading or a [[link]]; starter text cannot start headings, code, comments or HTML', () => {
  assert.equal(A.cleanName('  The [Great] Hall | #1 ^x <b> `y` \\ %%no%% '), 'The Great Hall 1 x b y %no%');
  assert.equal(A.cleanName('a\nb\tc\u0007 d'), 'a b c d');
  assert.equal(A.cleanName('x'.repeat(500)).length, 120);
  const seed = A.escapeProse('# Not a heading\n```js\nx\n---\n<script>alert(1)</script> [[Link]] %%c%% <!-- room:evil -->\n> quote\n\n\n');
  const lines = seed.split('\n');
  assert.ok(lines.every(l => !/^\s{0,3}(#|```|---|>)/.test(l)), seed);
  assert.ok(!seed.includes('<') && !seed.includes('[[') && !seed.includes('%%'));
  assert.equal(A.readStructure('## 1. A <!-- room:a -->\n' + seed).rooms.length, 1, 'an injected room marker did not become a section');
  assert.ok(A.escapeProse('x'.repeat(9000)).length <= 4000);
  assert.ok(A.escapeProse(Array(200).fill('line').join('\n')).split('\n').length <= 60);
});
test('atlas: hostile names and starter text leave the note\'s structure exactly as designed', () => {
  const r = raw([level('m1', 'Level [1] <!-- x -->', 0, [
    room('r1', '1', 'Hall <!-- room:evil --> ## fake', 1, 1, false, '## Injected room <!-- room:evil2 -->\ntext'),
    room('r2', '2]]', 'Vault]]|alias#h', 2, 2, true, '```\nunclosed fence'),
  ])]);
  const d = ok(r);
  const plan = A.planImport({ dungeon: d, campaignPath: 'Camp', note: null, noteName: 'Rift Keep', maps: new Map() });
  const st = A.readStructure(splitFrontmatter(plan.note.text).body);
  assert.deepEqual(st.rooms.map(x => x.id), ['r1', 'r2']);
  assert.equal((splitFrontmatter(plan.note.text).body.match(/^#{1,2}\s/gm) || []).length, 3, 'title + two rooms, no extra headings');
  const pins = parsePins(plan.maps[0].text);
  assert.equal(pins.length, 2);
  assert.ok(pins.every(p => p.place === 'Rift Keep' && p.heading && !/[\[\]|#]/.test(p.heading)));
});

/* ---------- a new dungeon ---------- */
test('atlas: a new dungeon is one note with a section per room, in the exact form, with the starter text once', () => {
  const d = ok(oneLevel());
  const plan = A.planImport({ dungeon: d, campaignPath: 'Camp', note: null, noteName: 'Rift Keep', maps: new Map() });
  const text = plan.note.text;
  assert.match(text, /^---\ndmatlas: d1\nsecret-rooms:\n {2}- r2\n---\n/);
  const body = splitFrontmatter(text).body;
  assert.ok(body.includes('## 1. Entrance <!-- room:r1 -->\n\nA cold draught.\n'));
  assert.ok(body.includes('## 2. Vault <!-- room:r2 -->\n\nGold, and a trap.\n'));
  assert.ok(body.includes('## 3. Cellar <!-- room:r3 -->\n\n## ') === false);
  assert.ok(/## 3\. Cellar <!-- room:r3 -->\s*$/.test(body));
  assert.match(body.replace(/^\n/, ''), /^# Rift Keep\n\n!\[\[level-1-aaaaaaaa\.png\]\] <!-- dmatlas:image:m1 -->\n/);
  assert.ok(!body.includes('dmatlas:level'), 'a single-level dungeon has no level heading');
  assert.equal(plan.note.isNew, true);
});
test('atlas: a two-level dungeon groups rooms by level, in order, with a level heading and one picture per level', () => {
  const d = ok(twoLevels());
  const plan = A.planImport({ dungeon: d, campaignPath: 'Camp', note: null, noteName: 'Rift Keep', maps: new Map() });
  const body = splitFrontmatter(plan.note.text).body;
  const heads = body.split('\n').filter(l => /^#{1,2}\s/.test(l));
  assert.deepEqual(heads, ['# Rift Keep', '# Level 1 <!-- dmatlas:level:m1 -->', '## 1.1. Entrance <!-- room:r1 -->', '## 1.2. Hall <!-- room:r2 -->', '# Level 2 <!-- dmatlas:level:m2 -->', '## 2.1. Pit <!-- room:r4 -->', '## 2.2. Secret Shrine <!-- room:r5 -->']);
  assert.equal(plan.maps.length, 2);
  assert.deepEqual(plan.maps.map(m => m.dest), ['Camp/Maps/rift-keep/level-1-aaaaaaaa.png', 'Camp/Maps/rift-keep/level-2-bbbbbbbb.png']);
  assert.ok(/secret-rooms:\n {2}- r5\n/.test(plan.note.text));
});
test('atlas: each level gets a map note with the picture, a pin per room linking to its section, and secret flagged', () => {
  const d = ok(twoLevels());
  const plan = A.planImport({ dungeon: d, campaignPath: 'Camp', note: null, noteName: 'Rift Keep', maps: new Map() });
  const m2 = plan.maps[1];
  assert.match(m2.text, /^---\ntype: map\nimage: level-2-bbbbbbbb\.png\n/);
  assert.match(m2.text, /dmatlas: d1\ndmatlas-map: m2\ndmatlas-level: Level 2\ndmatlas-sha: b{64}\n---\n# Rift Keep — Level 2\n\n!\[\[level-2-bbbbbbbb\.png\]\]/);
  const pins = parsePins(m2.text);
  assert.deepEqual(pins.map(p => [p.x, p.y, p.place, p.heading, p.secret, p.roomId]), [[30, 30, 'Rift Keep', '2.1. Pit', false, 'r4'], [70, 70, 'Rift Keep', '2.2. Secret Shrine', true, 'r5']]);
  assert.ok(m2.text.includes('[[Rift Keep#2.2. Secret Shrine]] — secret <!-- room:r5 -->'));
  assert.equal(plan.maps[0].path, null);
  assert.equal(A.mapNotePath('Camp', d, d.levels[1]), 'Camp/Maps/rift-keep/level-2.md');
});
test('atlas: the map\'s scale comes out in metres from pixels, cells and feet', () => {
  const d = ok(oneLevel());          // 1000 px wide, 50 px a cell, 5 ft a cell = 100 ft = 30.48 m
  assert.equal(A.widthMetres(d.levels[0]), 30.5);
  const plan = A.planImport({ dungeon: d, campaignPath: 'Camp', note: null, noteName: 'Rift Keep', maps: new Map() });
  assert.match(plan.maps[0].text, /scale: 30\.5 m\n/);
  const noScale = ok(raw([{ ...level('m1', 'L', 0, []), cellFt: null }]));
  assert.equal(A.widthMetres(noScale.levels[0]), null);
});

/* ---------- re-importing ---------- */
const importNew = (raw0 = oneLevel(), noteName = 'Rift Keep') => {
  const d = ok(raw0);
  const plan = A.planImport({ dungeon: d, campaignPath: 'Camp', note: null, noteName, maps: new Map() });
  const maps = new Map(plan.maps.map(m => [m.mapId, { path: 'Camp/Maps/rift-keep/' + m.mapId + '.md', text: m.text }]));
  return { note: { path: 'Camp/Dungeons/' + noteName + '.md', name: noteName, text: plan.note.text }, maps };
};
const again = (state, raw1) => A.planImport({ dungeon: ok(raw1), campaignPath: 'Camp', note: state.note, noteName: state.note.name, maps: state.maps });

test('atlas: re-importing with nothing changed changes nothing at all', () => {
  const st = importNew(twoLevels());
  const plan = again(st, twoLevels());
  assert.equal(plan.summary.nothing, true);
  assert.equal(plan.note.text, st.note.text);
  assert.ok(plan.maps.every(m => !m.changed && m.text === st.maps.get(m.mapId).text));
  assert.equal(A.describePlan(plan), 'Nothing has changed since the last import.');
});
test('atlas: your prose is never touched; a moved room moves its pin only', () => {
  const st = importNew();
  st.note.text = st.note.text.replace('A cold draught.', 'MY OWN WORDS about the draught.\n\n### My sub-heading\nmore of my notes').replace('Gold, and a trap.', '');
  const moved = oneLevel(); moved.levels[0].rooms[0].x = 44.4; moved.levels[0].rooms[0].y = 11.1;
  const plan = again(st, moved);
  assert.equal(plan.note.text, st.note.text, 'the note is byte-for-byte what you had');
  const pin = parsePins(plan.maps[0].text).find(p => p.roomId === 'r1');
  assert.deepEqual([pin.x, pin.y], [44.4, 11.1]);
  assert.equal(plan.summary.nothing, false);
  assert.equal(plan.note.changed, false);
  assert.equal(plan.maps[0].changed, true);
});
test('atlas: renaming a room changes only its heading line (and its pin\'s link)', () => {
  const st = importNew();
  st.note.text += '\nMy trailing notes.\n';
  const ren = oneLevel(); ren.levels[0].rooms[1].name = 'Treasury'; ren.levels[0].rooms[1].n = '2b';
  const plan = again(st, ren);
  const before = st.note.text.split('\n'), after = plan.note.text.split('\n');
  assert.equal(before.length, after.length);
  const diffs = before.map((l, i) => [l, after[i]]).filter(([a, b]) => a !== b);
  assert.deepEqual(diffs, [['## 2. Vault <!-- room:r2 -->', '## 2b. Treasury <!-- room:r2 -->']]);
  const pin = parsePins(plan.maps[0].text).find(p => p.roomId === 'r2');
  assert.equal(pin.heading, '2b. Treasury');
  assert.equal(headingLine(plan.note.text, pin.heading) >= 0, true, 'the pin\'s anchor still finds its section');
  assert.equal(plan.summary.updatedRooms, 1);
});
test('atlas: a new room is added after the room before it, with its starter text, and a pin', () => {
  const st = importNew();
  const more = oneLevel();
  more.levels[0].rooms.splice(1, 0, room('r9', '1b', 'Guard Post', 5, 5, false, 'Two bored guards.'));
  const plan = again(st, more);
  const heads = plan.note.text.split('\n').filter(l => ROOM.test(l));
  assert.deepEqual(heads, ['## 1. Entrance <!-- room:r1 -->', '## 1b. Guard Post <!-- room:r9 -->', '## 2. Vault <!-- room:r2 -->', '## 3. Cellar <!-- room:r3 -->']);
  assert.ok(plan.note.text.includes('## 1b. Guard Post <!-- room:r9 -->\n\nTwo bored guards.\n'));
  assert.ok(plan.note.text.includes('A cold draught.'));
  assert.equal(plan.summary.newRooms, 1);
  assert.ok(parsePins(plan.maps[0].text).some(p => p.roomId === 'r9' && p.heading === '1b. Guard Post'));
  assert.equal(again({ note: { ...st.note, text: plan.note.text }, maps: new Map([['m1', { path: 'p', text: plan.maps[0].text }]]) }, more).summary.nothing, true);
});
const ROOM = /^## .*<!-- room:/;
test('atlas: a room DMAtlas no longer has is flagged, not deleted, once; it comes back cleanly', () => {
  const st = importNew();
  st.note.text = st.note.text.replace('Gold, and a trap.', 'My vault notes.');
  const gone = oneLevel(); gone.levels[0].rooms.splice(1, 1);
  const p1 = again(st, gone);
  assert.ok(p1.note.text.includes('My vault notes.'), 'nothing deleted');
  assert.ok(p1.note.text.includes('## 2. Vault <!-- room:r2 -->\n> [!warning] Removed in DMAtlas <!-- dmatlas:removed -->'));
  assert.equal(p1.summary.removedRooms, 1);
  assert.equal((p1.note.text.match(/dmatlas:removed/g) || []).length, 1);
  const pin = parsePins(p1.maps[0].text).find(p => p.roomId === 'r2');
  assert.ok(pin && pin.note === 'removed in DMAtlas', 'the pin stays, flagged');
  // importing the same thing again does not flag it twice
  const p2 = again({ note: { ...st.note, text: p1.note.text }, maps: new Map([['m1', { path: 'p', text: p1.maps[0].text }]]) }, gone);
  assert.equal(p2.summary.nothing, true);
  // it comes back: the flag goes, the prose stays, the pin note clears
  const p3 = again({ note: { ...st.note, text: p1.note.text }, maps: new Map([['m1', { path: 'p', text: p1.maps[0].text }]]) }, oneLevel());
  assert.ok(!p3.note.text.includes('dmatlas:removed'));
  assert.ok(p3.note.text.includes('My vault notes.'));
  assert.equal(p3.note.text, st.note.text);
  assert.equal(parsePins(p3.maps[0].text).find(p => p.roomId === 'r2').note, '');
});
test('atlas: a new level is added at the end; a single-level dungeon that grows gets level headings', () => {
  const st = importNew(oneLevel());
  const grown = oneLevel();
  grown.levels.push(level('m2', 'Level 2', 1, [room('r7', '4', 'Deep Hall', 20, 20, false, 'Echoes.')], SHA2));
  const plan = again(st, grown);
  const heads = plan.note.text.split('\n').filter(l => /^#{1,2}\s/.test(l));
  assert.deepEqual(heads, ['# Rift Keep', '# Level 1 <!-- dmatlas:level:m1 -->', '## 1. Entrance <!-- room:r1 -->', '## 2. Vault <!-- room:r2 -->', '## 3. Cellar <!-- room:r3 -->', '# Level 2 <!-- dmatlas:level:m2 -->', '## 4. Deep Hall <!-- room:r7 -->']);
  assert.ok(plan.note.text.includes('A cold draught.') && plan.note.text.includes('Echoes.'));
  assert.equal(plan.maps.find(m => m.mapId === 'm2').isNew, true);
  assert.equal(plan.summary.levelsAdded >= 1, true);
});
test('atlas: a changed picture updates the map note\'s image, its embed and its sha, and keeps your scale and pin notes', () => {
  const st = importNew();
  st.maps.get('m1').text = st.maps.get('m1').text.replace(/scale: .*\n/, 'scale: 99 m\n').replace('Entrance]]', 'Entrance]] — my trap note');
  const next = oneLevel(); next.levels[0].image.sha256 = SHA3;
  const plan = again(st, next);
  const t = plan.maps[0].text;
  assert.match(t, /image: level-1-cccccccc\.png/);
  assert.ok(t.includes('![[level-1-cccccccc.png]]') && !t.includes('level-1-aaaaaaaa'));
  assert.match(t, /dmatlas-sha: c{64}/);
  assert.match(t, /scale: 99 m/);
  assert.equal(parsePins(t).find(p => p.roomId === 'r1').note, 'my trap note');
  assert.ok(plan.note.text.includes('![[level-1-cccccccc.png]] <!-- dmatlas:image:m1 -->'));
  assert.ok(plan.note.changed);
});
test('atlas: a pin without a room id is matched to its room by its old heading; one you added yourself is left alone', () => {
  const st = importNew();
  let mt = st.maps.get('m1').text.replace(' <!-- room:r3 -->', '');                // an older pin with no marker
  mt = writePins(mt, [...parsePins(mt), { x: 1, y: 1, place: '', heading: '', label: 'My own pin', secret: false, note: 'mine', roomId: '' }]);
  st.maps.get('m1').text = mt;
  const ren = oneLevel(); ren.levels[0].rooms[2].x = 77;
  const plan = again(st, ren);
  const pins = parsePins(plan.maps[0].text);
  assert.equal(pins.length, 4);
  assert.equal(pins.find(p => p.roomId === 'r3').x, 77);
  assert.ok(pins.some(p => p.label === 'My own pin' && p.note === 'mine'));
});

/* ---------- secrets and player-safe ---------- */
test('atlas: secret rooms are listed in the note, flagged secret on their pins, and stay secret when a pin is already secret', () => {
  const st = importNew(twoLevels());
  assert.deepEqual(A.secretRoomIds({ 'secret-rooms': ['r5', 'x y'] }), ['r5']);
  const flipped = twoLevels(); flipped.levels[0].rooms[1].secret = false;      // DMAtlas says the shrine is no longer secret
  const plan = again(st, flipped);
  assert.ok(!/secret-rooms/.test(plan.note.text), 'the list goes when no room is secret');
  assert.equal(parsePins(plan.maps[1].text).find(p => p.roomId === 'r5').secret, true, 'a pin that was secret is never made public by an import');
});
test('atlas: a secret room that was removed from DMAtlas is still kept out of player-safe copies', () => {
  const st = importNew(twoLevels());
  const gone = twoLevels(); gone.levels[0].rooms.splice(1, 1);        // the secret shrine is gone from DMAtlas
  const plan = again(st, gone);
  assert.ok(/secret-rooms:\n {2}- r5\n/.test(plan.note.text), 'its id stays on the list while its section is still in the note');
  const safe = playerSafe(plan.note.text, 'Rift Keep');
  assert.ok(!safe.text.includes('Secret Shrine') && !safe.text.includes('Holy.'));
});
test('player-safe: no secret room, section, pin or hidden marker reaches the players', () => {
  const st = importNew(twoLevels());
  const safeNote = playerSafe(st.note.text, 'Rift Keep');
  assert.ok(!safeNote.text.includes('Secret Shrine') && !safeNote.text.includes('Holy.') && !safeNote.text.includes('room:'));
  assert.ok(safeNote.text.includes('Entrance') && safeNote.text.includes('Pit'));
  assert.deepEqual(safeNote.removed.sections, ['2.2. Secret Shrine']);
  const safeMap = playerSafe(st.maps.get('m2').text, 'Level 2');
  assert.equal(safeMap.removed.pins, 1);
  assert.ok(!safeMap.text.includes('Shrine') && safeMap.text.includes('Pit'));
  // a pin the owner marks secret in DM Forge takes its section out too, even if the note does not list the room
  const note = { path: 'Camp/Dungeons/Rift Keep.md', body: splitFrontmatter(st.note.text).body };
  const mapBody = splitFrontmatter(st.maps.get('m2').text).body.replace('2.1. Pit]]', '2.1. Pit]] — secret').replace(/ <!-- room:r4 -->/, '');
  const idx = { byType: { map: [{ body: mapBody }] }, resolve: n => (n === 'Rift Keep' ? note : null) };
  const extra = A.secretRoomsFromPins(idx, note);
  assert.deepEqual(extra.sort(), ['r4', 'r5']);
  assert.ok(!playerSafe(st.note.text, 'Rift Keep', { secretRooms: extra }).text.includes('## 2.1. Pit'));
});

/* ---------- pins that point at headings ---------- */
test('maps: a pin\'s heading anchor and room id survive a read and a write, and a click can find the section', () => {
  const line = '- 10, 20 — [[Rift Keep#2.1. The Hall]] — secret — a trap <!-- room:abc-1 -->';
  const [p] = parsePins('## Pins\n\n' + line + '\n');
  assert.deepEqual([p.place, p.heading, p.secret, p.note, p.roomId], ['Rift Keep', '2.1. The Hall', true, 'a trap', 'abc-1']);
  assert.equal(pinLine(p), line);
  assert.equal(pinLine(parsePins('## Pins\n\n' + pinLine(p) + '\n')[0]), line);
  assert.equal(pinLine({ x: 1, y: 2, place: 'Old Tam', secret: false, note: '' }), '- 1, 2 — [[Old Tam]]');
  const body = '# Keep\n\n## 1. Hall <!-- room:a -->\ntext\n\n```\n## 2. Fenced <!-- room:b -->\n```\n\n## 2.1. The Hall <!-- room:abc-1 -->\n';
  assert.equal(headingLine(body, '2.1. the  hall'), 9);
  assert.equal(headingLine(body, '2. Fenced'), -1, 'a heading inside a code fence is not a section');
  assert.equal(headingLine(body, 'Nope'), -1);
});
test('maps: pins without anchors read and write exactly as before', () => {
  const body = '## Pins\n\n- 41.2, 63.5 — [[The Cinder & Crown]]\n- 72, 20 — [[The Shrine Tower]] — secret\n- 10, 80 — Old bridge — a rotten plank\n';
  const pins = parsePins(body);
  assert.deepEqual(pins.map(pinLine), ['- 41.2, 63.5 — [[The Cinder & Crown]]', '- 72, 20 — [[The Shrine Tower]] — secret', '- 10, 80 — Old bridge — a rotten plank']);
  assert.ok(pins.every(p => p.heading === '' && p.roomId === ''));
});
