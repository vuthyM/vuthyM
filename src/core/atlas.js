/* Importing dungeons from DMAtlas (the owner's dungeon-map app).

   DMAtlas owns the geometry: the picture, where each room is, its number and name. DM Forge owns the prose. So an import
     * makes (or updates) ONE note for the dungeon, with a section per room:    ## 2.1. The Hall <!-- room:ROOM-ID -->
     * makes (or updates) one map note per level, with the picture and a pin per room that links to its section: [[Rift Keep#2.1. The Hall]]
   and on a re-import it finds rooms ONLY by the hidden room:ID marker. A room that is there gets its heading text and its pin moved,
   and nothing under the heading is ever touched. A new room gets a section (starter text from DMAtlas, once) and a pin. A room DMAtlas no
   longer has is flagged "Removed in DMAtlas", never deleted.

   Everything from DMAtlas is untrusted: sanitizeDungeon checks every field's type and range (positions are clamped to 0-100), names are cut
   down to text that cannot break a heading or a [[link]], and starter text is escaped so it cannot make headings, code blocks or comments.

   This file is pure: it takes text in and gives text out. The app stages the results as ordinary changes (so Push and Undo last push
   cover them); the server stores the pictures (see server/dmforge_atlas.py). */
import * as yaml from 'js-yaml';
import { splitFrontmatter, patchFrontmatter } from './frontmatter.js';
import { buildNoteText } from './templates.js';
import { mapNoteText, parsePins, writePins, pinLine } from './maps.js';

export const FORMAT_PREFIX = 'dmatlas-forge/';
const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_PIXELS = 16384;
const MAX_LEVELS = 30, MAX_ROOMS = 500, SEED_CHARS = 4000, SEED_LINES = 60;

export const ROOM_HEAD = /^##\s+(.*?)\s*<!--\s*room:([A-Za-z0-9._:-]{1,64})\s*-->\s*$/;
export const LEVEL_HEAD = /^#\s+(.*?)\s*<!--\s*dmatlas:level:([A-Za-z0-9._:-]{1,64})\s*-->\s*$/;
export const IMAGE_LINE = /^!\[\[([^\]]+)\]\]\s*<!--\s*dmatlas:image:([A-Za-z0-9._:-]{1,64})\s*-->\s*$/;
const REMOVED_MARK = '<!-- dmatlas:removed -->';
export const REMOVED_FLAG = 'removed in DMAtlas';

/* ---------- making text safe ---------- */
const LS_PS = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
/* control characters (and the Unicode line/paragraph separators) become spaces; \n is only kept where the caller wants lines */
const stripControls = (s, keepNewline) => String(s).replace(keepNewline ? /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/g : /[\x00-\x1f\x7f]/g, ' ').replace(LS_PS, ' ');
/* a name that is safe in a heading and inside [[Note#heading]]: one line, none of  [ ] | # ^ < > ` \  and no %% (an Obsidian comment) */
export function cleanName(s, max = 120) {
  return stripControls(s).normalize('NFC').replace(/[\[\]|#^<>`\\]/g, ' ').replace(/%%+/g, '%').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}
/* starter text for a room, made harmless: no heading, rule, code fence, comment, blockquote, link or HTML can be started by it */
export function escapeProse(s) {
  const text = stripControls(String(s).replace(/\r\n?/g, '\n').replace(/\t/g, '    '), true).normalize('NFC').slice(0, SEED_CHARS);
  const lines = text.split('\n').slice(0, SEED_LINES).map(l => l.replace(/\s+$/, ''));
  const out = lines.map(l => {
    let t = l.replace(/%%/g, '% %').replace(/</g, '&lt;').replace(/\[\[/g, '\\[\\[').replace(/\]\]/g, '\\]\\]');
    if (/^\s{0,3}(#{1,6}(\s|$)|`{3,}|~{3,}|[-*_]{3,}\s*$|={3,}\s*$|>)/.test(t)) t = t.replace(/^(\s*)/, '$1\\');
    return t;
  });
  while (out.length && !out[out.length - 1].trim()) out.pop();
  while (out.length && !out[0].trim()) out.shift();
  return out.join('\n');
}
export function slugify(s, fallback = 'dungeon') {
  const t = String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return t || fallback;
}

/* ---------- checking what DMAtlas sent ---------- */
const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isInt = v => Number.isInteger(v);
const pct = v => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

/* the list (GET /api/forge/dungeons): [{ id, name, levels, rooms }] with anything unexpected dropped */
export function sanitizeList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const d of list.slice(0, 500)) {
    if (!d || !isStr(d.id) || !ID_RE.test(d.id)) continue;
    out.push({ id: d.id, name: cleanName(d.name) || 'Dungeon', publishedAt: isStr(d.publishedAt) ? d.publishedAt.slice(0, 40) : '', levels: isInt(d.levels) ? d.levels : 0, rooms: isInt(d.rooms) ? d.rooms : 0 });
  }
  return out;
}

/* one dungeon (GET /api/forge/dungeons/:id). -> { dungeon, warnings } or { error } */
export function sanitizeDungeon(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object') return { error: 'DMAtlas sent a dungeon we cannot read.' };
  if (!isStr(raw.format) || !raw.format.startsWith(FORMAT_PREFIX)) return { error: 'DMAtlas sent a dungeon in a format we do not know.' };
  if (raw.format !== FORMAT_PREFIX + '1') return { error: 'DMAtlas now publishes a newer format (' + raw.format.slice(0, 30) + '). Update DM Forge first.' };
  if (!isStr(raw.id) || !ID_RE.test(raw.id)) return { error: 'The dungeon has no usable id.' };
  if (!Array.isArray(raw.levels) || !raw.levels.length) return { error: 'The dungeon has no levels.' };
  if (raw.levels.length > MAX_LEVELS) return { error: 'The dungeon has more than ' + MAX_LEVELS + ' levels.' };
  const name = cleanName(raw.name) || 'Dungeon';
  const mapIds = new Set(), roomIds = new Set();
  const levels = [];
  raw.levels.forEach((lv, i) => {
    if (!lv || typeof lv !== 'object') { warnings.push('Level ' + (i + 1) + ' was skipped (not readable).'); return; }
    if (!isStr(lv.mapId) || !ID_RE.test(lv.mapId)) { warnings.push('Level ' + (i + 1) + ' was skipped (no usable map id).'); return; }
    if (mapIds.has(lv.mapId)) { warnings.push('Level ' + (i + 1) + ' was skipped (its map appears twice).'); return; }
    mapIds.add(lv.mapId);
    const im = lv.image;
    if (!im || typeof im !== 'object' || !isStr(im.sha256) || !SHA_RE.test(im.sha256) || !isInt(im.width) || !isInt(im.height)
      || im.width < 1 || im.height < 1 || im.width > MAX_PIXELS || im.height > MAX_PIXELS || !isInt(im.bytes) || im.bytes < 1 || im.bytes > MAX_IMAGE_BYTES) {
      warnings.push('Level ' + (i + 1) + ' was skipped (its picture is missing, too large, or not described properly).');
      mapIds.delete(lv.mapId);
      return;
    }
    const rooms = [];
    const rawRooms = Array.isArray(lv.rooms) ? lv.rooms.slice(0, MAX_ROOMS) : [];
    for (const r of rawRooms) {
      if (!r || typeof r !== 'object' || !isStr(r.id) || !ID_RE.test(r.id)) { warnings.push('A room without a usable id was skipped.'); continue; }
      if (roomIds.has(r.id)) { warnings.push('Room ' + r.id + ' appears twice; the second was skipped.'); continue; }
      if (!isNum(r.x) || !isNum(r.y)) { warnings.push('Room ' + r.id + ' was skipped (no usable position).'); continue; }
      roomIds.add(r.id);
      const n = cleanName(isStr(r.n) || isNum(r.n) ? String(r.n) : '', 16).replace(/\.+$/, '');
      rooms.push({ id: r.id, n, name: cleanName(r.name) || 'Room', x: pct(r.x), y: pct(r.y), secret: r.secret === true, seed: isStr(r.seed) ? escapeProse(r.seed) : '' });
    }
    levels.push({
      mapId: lv.mapId, level: cleanName(lv.level, 80) || 'Level ' + (levels.length + 1), order: isNum(lv.order) ? lv.order : i,
      cellFt: isNum(lv.cellFt) && lv.cellFt > 0 ? lv.cellFt : null,
      image: { sha256: im.sha256, width: im.width, height: im.height, bytes: im.bytes, pxPerCell: isNum(im.pxPerCell) && im.pxPerCell > 0 ? im.pxPerCell : null },
      rooms,
    });
  });
  if (!levels.length) return { error: 'None of the dungeon\'s levels could be used: ' + (warnings[0] || 'nothing readable.') };
  levels.sort((a, b) => a.order - b.order);
  return { dungeon: { id: raw.id, name, levels }, warnings };
}

/* ---------- names, paths, labels ---------- */
export const roomLabel = r => (r.n ? r.n + '. ' : '') + r.name;
export const imageFileName = (dungeon, level) => slugify(level.level, 'level') + '-' + level.image.sha256.slice(0, 8) + '.png';
export const mapFolder = (campaignPath, dungeon) => campaignPath + '/Maps/' + slugify(dungeon.name, 'dungeon-' + dungeon.id.slice(0, 6).toLowerCase());
export const imageDest = (campaignPath, dungeon, level) => mapFolder(campaignPath, dungeon) + '/' + imageFileName(dungeon, level);
export const mapNotePath = (campaignPath, dungeon, level) => mapFolder(campaignPath, dungeon) + '/' + slugify(level.level, 'level') + '.md';
/* the width of the whole picture, in metres, when DMAtlas says how many pixels and how many feet a cell is (DM Forge is metric) */
export function widthMetres(level) {
  const { cellFt, image } = level;
  if (!cellFt || !image.pxPerCell) return null;
  const m = (image.width / image.pxPerCell) * cellFt * 0.3048;
  return m > 0 && m < 1e5 ? Math.round(m * 10) / 10 : null;
}

/* ---------- reading a dungeon note ---------- */
const fenceToggle = (l, f) => (/^\s*(```|~~~)/.test(l) ? !f : f);
/* the room sections, level headings and picture lines of a note body (by line number) */
export function readStructure(body) {
  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  const rooms = [], levels = [], images = [];
  let fence = false;
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    fence = fenceToggle(lines[i], fence);
    if (fence || /^\s*(```|~~~)/.test(lines[i])) continue;
    if (/^#{1,2}\s/.test(lines[i])) heads.push(i);
    const rh = ROOM_HEAD.exec(lines[i]);
    if (rh) rooms.push({ id: rh[2], line: i, label: rh[1].trim() });
    const lh = LEVEL_HEAD.exec(lines[i]);
    if (lh) levels.push({ mapId: lh[2], line: i, label: lh[1].trim() });
    const im = IMAGE_LINE.exec(lines[i]);
    if (im) images.push({ mapId: im[2], line: i, name: im[1] });
  }
  for (const r of rooms) {
    const next = heads.find(h => h > r.line);
    r.end = next === undefined ? lines.length : next;           // the section is its heading up to (not including) the next # or ## heading
    r.removedFlag = lines.slice(r.line + 1, r.end).some(l => l.includes(REMOVED_MARK));
  }
  return { lines, rooms, levels, images };
}

const imageLine = (dungeon, level) => '![[' + imageFileName(dungeon, level) + ']] <!-- dmatlas:image:' + level.mapId + ' -->';
const levelHeadLine = level => '# ' + level.level + ' <!-- dmatlas:level:' + level.mapId + ' -->';
const roomHeadLine = r => '## ' + roomLabel(r) + ' <!-- room:' + r.id + ' -->';
const removedCallout = ['> [!warning] Removed in DMAtlas ' + REMOVED_MARK, '> This room is no longer on the published map. Delete this section (and its pin) when you are done with it.'];
const roomBlock = r => [roomHeadLine(r), ...(r.seed ? ['', ...r.seed.split('\n')] : [])];

/* the body of a brand new dungeon note */
export function buildNewBody(dungeon) {
  const multi = dungeon.levels.length > 1;
  const out = ['# ' + dungeon.name, ''];
  for (const lv of dungeon.levels) {
    if (multi) out.push(levelHeadLine(lv), '');
    out.push(imageLine(dungeon, lv), '');
    for (const r of lv.rooms) out.push(...roomBlock(r), '');
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

/* The body of an existing dungeon note after a re-import. Only managed lines change (room headings, level headings, picture lines,
   removed flags); room prose is never touched. Returns { body, stats }. */
export function updateBody(oldBody, dungeon) {
  const st = readStructure(oldBody);
  let lines = st.lines.slice();
  const stats = { newRooms: 0, updatedRooms: 0, removedRooms: 0, restoredRooms: 0, unchangedRooms: 0, levelsAdded: 0 };
  const multi = dungeon.levels.length > 1;
  const snapshotIds = new Set(dungeon.levels.flatMap(l => l.rooms.map(r => r.id)));

  // helpers working on the current `lines`, found again each time because lines move as we insert
  const find = () => readStructure(lines.join('\n'));
  const insertAt = (at, block) => { lines.splice(at, 0, ...block); };
  const trimBlankBefore = at => { while (at > 0 && lines[at - 1] === '') at--; return at; };

  // 1. levels: picture line, level heading
  for (const lv of dungeon.levels) {
    let s = find();
    const img = s.images.find(i => i.mapId === lv.mapId);
    const hd = s.levels.find(l => l.mapId === lv.mapId);
    if (img) {
      if (lines[img.line] !== imageLine(dungeon, lv)) lines[img.line] = imageLine(dungeon, lv);
      if (multi) {
        if (hd) { if (lines[hd.line] !== levelHeadLine(lv)) lines[hd.line] = levelHeadLine(lv); }
        else { insertAt(img.line, [levelHeadLine(lv), '']); }
      }
    } else if (!s.rooms.some(r => lv.rooms.some(x => x.id === r.id)) || true) {
      // a level this note does not have yet (or whose picture line was deleted): add it at the end
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      const block = [''];
      if (multi) block.push(levelHeadLine(lv), '');
      block.push(imageLine(dungeon, lv));
      insertAt(lines.length, block);
      stats.levelsAdded++;
    }
  }

  // 2. rooms in the snapshot: update the heading of ones we have, add the ones we do not
  for (const lv of dungeon.levels) {
    lv.rooms.forEach((r, k) => {
      let s = find();
      const have = s.rooms.find(x => x.id === r.id);
      if (have) {
        const want = roomHeadLine(r);
        let changed = false;
        if (lines[have.line] !== want) { lines[have.line] = want; changed = true; }
        if (have.removedFlag) {                       // it is back: take our flag away (two lines and the blank we added)
          const i = lines.findIndex((l, j) => j > have.line && j < have.end && l.includes(REMOVED_MARK));
          if (i > 0) { lines.splice(i, 2); if (lines[i] === '') lines.splice(i, 1); }   // our two lines and the one blank we added after them
          stats.restoredRooms++; changed = true;
        }
        if (changed) stats.updatedRooms++; else stats.unchangedRooms++;
        return;
      }
      // new room: after the room before it in DMAtlas's order if that one is in the note, else straight after the level's picture, else at the end
      let at = -1;
      for (let j = k - 1; j >= 0 && at < 0; j--) { const prev = s.rooms.find(x => x.id === lv.rooms[j].id); if (prev) at = trimBlankBefore(prev.end); }
      if (at < 0) { const img = s.images.find(i => i.mapId === lv.mapId); if (img) at = img.line + 1; }
      if (at < 0) at = trimBlankBefore(lines.length);
      insertAt(at, ['', ...roomBlock(r)]);
      stats.newRooms++;
    });
  }

  // 3. rooms the note has that DMAtlas no longer does: flag them, delete nothing
  for (const r of find().rooms) {
    if (snapshotIds.has(r.id) || r.removedFlag) continue;
    lines.splice(r.line + 1, 0, ...removedCallout, '');
    stats.removedRooms++;
  }
  let body = lines.join('\n').replace(/\n{3,}/g, m => m).replace(/\s+$/, '') + '\n';
  return { body, stats };
}

/* ---------- the dungeon note's properties ---------- */
const parseFm = text => { try { const o = yaml.load(splitFrontmatter(String(text)).fmRaw || ''); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
export function secretRoomIds(fm) { const v = fm && fm['secret-rooms']; return Array.isArray(v) ? v.map(String).filter(x => ID_RE.test(x)) : []; }

/* the secret rooms a note lists (its secret-rooms property), read straight from its text */
export function secretIdsOfText(text) { return secretRoomIds(parseFm(text)); }
/* rooms to keep out of a player-safe copy that the dungeon note does not list but the map pins say are secret: a pin marked secret (in DM Forge's
   map view, say) that points at one of this note's room sections takes that section out too. -> [room id] */
export function secretRoomsFromPins(idx, note) {
  const sections = new Map(readStructure(note.body || '').rooms.map(r => [r.label.replace(/\s+/g, ' ').trim().toLowerCase(), r.id]));
  const out = new Set();
  for (const m of idx.byType.map || []) {
    for (const p of parsePins(m.body)) {
      if (!p.secret || !p.heading) continue;
      if ((idx.resolve(p.place) || {}).path !== note.path) continue;
      const id = p.roomId || sections.get(p.heading.replace(/\s+/g, ' ').trim().toLowerCase());
      if (id) out.add(id);
    }
  }
  return [...out];
}

/* the room ids to keep out of player-safe copies: secret now, plus any secret one that has since been removed from DMAtlas (its section is still in the note) */
export function nextSecretIds(oldIds, dungeon) {
  const now = new Set(dungeon.levels.flatMap(l => l.rooms.filter(r => r.secret).map(r => r.id)));
  const all = new Set(dungeon.levels.flatMap(l => l.rooms.map(r => r.id)));
  for (const id of oldIds) if (!all.has(id)) now.add(id);
  return [...now].sort();
}

/* ---------- the map note of one level ---------- */
function pinFor(r, noteName, old) {
  return { x: r.x, y: r.y, place: noteName, heading: roomLabel(r), label: '', secret: r.secret || !!(old && old.secret), note: old && old.note === REMOVED_FLAG ? '' : (old ? old.note : ''), roomId: r.id };
}
export function pinsFor(level, noteName, existing, oldLabels) {
  const out = existing.map(p => ({ ...p }));
  const used = new Set();
  for (const r of level.rooms) {
    let i = out.findIndex((p, k) => !used.has(k) && p.roomId === r.id);
    if (i < 0 && oldLabels && oldLabels.get(r.id)) i = out.findIndex((p, k) => !used.has(k) && !p.roomId && p.heading && p.heading === oldLabels.get(r.id));
    if (i >= 0) { out[i] = pinFor(r, noteName, out[i]); used.add(i); }
    else { out.push(pinFor(r, noteName, null)); used.add(out.length - 1); }
  }
  const here = new Set(level.rooms.map(r => r.id));
  out.forEach((p, k) => { if (!used.has(k) && p.roomId && !here.has(p.roomId) && !p.note.includes(REMOVED_FLAG)) p.note = p.note ? p.note + ' — ' + REMOVED_FLAG : REMOVED_FLAG; });
  return out;
}
export function newMapNote(dungeon, level, noteName, campaignPath) {
  const m = widthMetres(level);
  return mapNoteText(imageFileName(dungeon, level), pinsFor(level, noteName, [], null).map(p => p), {
    title: dungeon.name + (dungeon.levels.length > 1 ? ' — ' + level.level : ''),
    scale: m ? m + ' m' : '',
    extra: { dmatlas: dungeon.id, 'dmatlas-map': level.mapId, 'dmatlas-level': level.level, 'dmatlas-sha': level.image.sha256 },
  });
}
/* an existing map note after a re-import: picture, sha and pins; everything else in the note (your text, a scale you set, your pin notes) stays */
export function updateMapNote(text, dungeon, level, noteName, oldLabels) {
  const fm = parseFm(text);
  const imgName = imageFileName(dungeon, level);
  const changes = {};
  if (String(fm.image || '') !== imgName) changes.image = imgName;
  if (String(fm['dmatlas-sha'] || '') !== level.image.sha256) changes['dmatlas-sha'] = level.image.sha256;
  if (String(fm['dmatlas-level'] || '') !== level.level) changes['dmatlas-level'] = level.level;
  if (!fm.scale) { const m = widthMetres(level); if (m) changes.scale = m + ' m'; }
  let out = Object.keys(changes).length ? patchFrontmatter(text, changes) : text;
  if (changes.image) {                                    // the embed under the title follows the picture
    const old = String(fm.image || '');
    if (old) out = out.replace('![[' + old + ']]', '![[' + imgName + ']]');
  }
  const sp = splitFrontmatter(out);
  const pins = pinsFor(level, noteName, parsePins(sp.body), oldLabels);
  const next = writePins(out, pins);
  return next;
}

/* ---------- the whole import, as a plan ---------- */
/* ctx: { dungeon (checked), campaignPath, note: { path, name, text } | null, noteName (when there is no note yet),
          maps: Map(mapId -> { path, text }) of map notes this dungeon already has }
   -> { note: { path|null, name, text, isNew, changed }, maps: [{ mapId, level, path|null, dest, text, isNew, changed, needsImage }], summary, warnings } */
export function planImport(ctx) {
  const { dungeon, campaignPath } = ctx;
  const old = ctx.note;
  const noteName = old ? old.name : ctx.noteName;
  let noteText, stats, oldLabels = new Map();
  const secretNow = nextSecretIds(old ? secretRoomIds(parseFm(old.text)) : [], dungeon);
  if (!old) {
    const body = buildNewBody(dungeon);
    const fm = { dmatlas: dungeon.id };
    if (secretNow.length) fm['secret-rooms'] = secretNow;
    noteText = buildNoteText(fm, body);
    stats = { newRooms: dungeon.levels.reduce((n, l) => n + l.rooms.length, 0), updatedRooms: 0, removedRooms: 0, restoredRooms: 0, unchangedRooms: 0, levelsAdded: dungeon.levels.length };
  } else {
    const sp = splitFrontmatter(old.text.replace(/\r\n/g, '\n'));
    for (const r of readStructure(sp.body).rooms) oldLabels.set(r.id, r.label);
    const u = updateBody(sp.body, dungeon);
    stats = u.stats;
    noteText = sp.prefix + u.body;
    const have = secretRoomIds(parseFm(old.text));
    if (have.join() !== secretNow.join()) noteText = patchFrontmatter(noteText, { 'secret-rooms': secretNow.length ? secretNow : undefined });
    if (parseFm(old.text).dmatlas !== dungeon.id) noteText = patchFrontmatter(noteText, { dmatlas: dungeon.id });
  }
  const noteChanged = !old || noteText !== old.text.replace(/\r\n/g, '\n');
  const maps = dungeon.levels.map(lv => {
    const have = ctx.maps.get(lv.mapId);
    const text = have ? updateMapNote(have.text, dungeon, lv, noteName, oldLabels) : newMapNote(dungeon, lv, noteName, campaignPath);
    return { mapId: lv.mapId, level: lv, path: have ? have.path : null, dest: imageDest(campaignPath, dungeon, lv), imageName: imageFileName(dungeon, lv), text, isNew: !have, changed: !have || text !== have.text, needsImage: true };
  });
  const roomCount = dungeon.levels.reduce((n, l) => n + l.rooms.length, 0);
  const pinsMoved = maps.filter(m => !m.isNew && m.changed).length;
  const summary = { levels: dungeon.levels.length, rooms: roomCount, ...stats, pinsMoved, noteIsNew: !old, mapsNew: maps.filter(m => m.isNew).length };
  summary.nothing = !!old && !noteChanged && !maps.some(m => m.changed);
  return { note: { path: old ? old.path : null, name: noteName, text: noteText, isNew: !old, changed: noteChanged }, maps, summary, warnings: [] };
}

/* a one-line description of what an import will do, for the screen that asks first */
export function describePlan(plan) {
  const s = plan.summary;
  if (s.nothing) return 'Nothing has changed since the last import.';
  const bits = [];
  if (s.noteIsNew) bits.push('a new note with ' + s.rooms + ' room' + (s.rooms === 1 ? '' : 's') + ' on ' + s.levels + ' level' + (s.levels === 1 ? '' : 's'));
  else {
    if (s.newRooms) bits.push(s.newRooms + ' new room' + (s.newRooms === 1 ? '' : 's'));
    if (s.updatedRooms) bits.push(s.updatedRooms + ' room' + (s.updatedRooms === 1 ? '' : 's') + ' renamed or restored');
    if (s.removedRooms) bits.push(s.removedRooms + ' room' + (s.removedRooms === 1 ? '' : 's') + ' flagged as removed in DMAtlas');
    if (s.levelsAdded) bits.push(s.levelsAdded + ' new level' + (s.levelsAdded === 1 ? '' : 's'));
    if (s.pinsMoved) bits.push('pins updated on ' + s.pinsMoved + ' map' + (s.pinsMoved === 1 ? '' : 's'));
    if (!bits.length) bits.push('map pins updated');
  }
  return bits.join(', ') + '.';
}
