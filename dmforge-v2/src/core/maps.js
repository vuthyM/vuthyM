/* Maps with pins. A map is an image in the campaign (downloaded, drawn, an SVG...); its pins live in a small note beside it:

     ---
     type: map
     image: Greenhold Map.svg          the picture this note is about
     place: "[[Greenhold]]"            the place this map shows (optional: lets a place find its own map)
     scale: 25 km                      how wide the whole picture is in the world (optional: turns a measured line into a distance)
     ---
     # Greenhold Map
     ![[Greenhold Map.svg]]
     ## Pins
     - 41.2, 63.5 — [[The Cinder & Crown]]
     - 72, 20 — [[The Shrine Tower]] — secret
     - 10, 80 — Old bridge — a rotten plank, third from the left

   A pin is a position (percent across, percent down), then a [[place]] or a plain label, then optional `secret` and a note.
   A link can point at a heading in a note ([[Rift Keep#2.1. The Hall]]); that anchor is kept when a pin is read and written, and clicking
   the pin opens the note at that section. A pin made by the DMAtlas import also ends with a hidden marker (<!-- room:ID -->) so the
   next import finds it again even if the heading was renamed.
   Because the places are ordinary [[links]], renaming a place updates its pins and Obsidian shows them as links. */
import { splitFrontmatter, serializeKV } from './frontmatter.js';

export const PINS_HEADING = 'Pins';
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
const clamp = n => Math.max(0, Math.min(100, Math.round(n * 10) / 10));
const base = p => String(p || '').split('/').pop();
const stemOf = p => base(p).replace(/\.[^.]+$/, '');
const sameName = (a, b) => base(a).toLowerCase() === base(b).toLowerCase();

/* ---------- pins ---------- */
const ROOM_MARK = /\s*<!--\s*room:([A-Za-z0-9._:-]{1,64})\s*-->\s*$/;
export function parsePins(body) {
  const lines = String(body || '').split(/\r?\n/);
  const i = lines.findIndex(l => new RegExp('^##\\s+' + PINS_HEADING + '\\s*$', 'i').test(l));
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    let l = lines[j];
    if (/^#{1,2}\s/.test(l)) break;
    let roomId = '';
    const rm = ROOM_MARK.exec(l);
    if (rm) { roomId = rm[1]; l = l.slice(0, rm.index); }
    const m = /^\s*[-*]\s+(\d{1,3}(?:\.\d+)?)\s*[,;]\s*(\d{1,3}(?:\.\d+)?)\s*(?:[—–-]+\s*(.*))?$/.exec(l);
    if (!m) continue;
    const parts = (m[3] || '').split(/\s+[—–]\s+/).map(oneLine).filter(Boolean);
    let place = '', heading = '', label = '', secret = false;
    const notes = [];
    parts.forEach((p, k) => {
      if (/^secret$/i.test(p)) { secret = true; return; }
      const lk = /^\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|[^\]]*)?\]\]$/.exec(p);
      if (k === 0 && lk) { place = oneLine(lk[1]); heading = oneLine(lk[2] || ''); }
      else if (k === 0) label = p;
      else notes.push(p);
    });
    out.push({ x: clamp(parseFloat(m[1])), y: clamp(parseFloat(m[2])), place, heading, label, secret, note: notes.join(' — '), roomId });
  }
  return out;
}
/* a pin that points at a heading is named for it ("2.1. The Hall"), not for the note it is in */
export const pinTitle = p => p.heading || p.place || p.label || 'Pin';
export function pinLine(p) {
  const what = p.place ? '[[' + oneLine(p.place) + (p.heading ? '#' + oneLine(p.heading) : '') + ']]' : oneLine(p.label) || 'Pin';
  const mark = p.roomId && /^[A-Za-z0-9._:-]{1,64}$/.test(p.roomId) ? ' <!-- room:' + p.roomId + ' -->' : '';
  return '- ' + clamp(p.x) + ', ' + clamp(p.y) + ' — ' + what + (p.secret ? ' — secret' : '') + (p.note ? ' — ' + oneLine(p.note) : '') + mark;
}
const replacePins = (body, pins) => {
  const all = body.split('\n');
  const i = all.findIndex(l => new RegExp('^##\\s+' + PINS_HEADING + '\\s*$', 'i').test(l.replace(/\r$/, '')));
  const text = pins.length ? pins.map(pinLine).join('\n') : '_No pins yet._';
  if (i < 0) return body.replace(/\s+$/, '') + '\n\n## ' + PINS_HEADING + '\n\n' + text + '\n';
  let end = all.length;
  for (let j = i + 1; j < all.length; j++) if (/^#{1,2}\s/.test(all[j])) { end = j; break; }
  return [...all.slice(0, i + 1), '', text, '', ...all.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n');
};
/* the note's text with its Pins list replaced */
export function writePins(text, pins) {
  const sp = splitFrontmatter(text || '');
  return (sp.prefix || '') + replacePins(sp.body || '', pins);
}
export function mapNoteText(imagePath, pins = [], props = {}) {
  const name = base(imagePath), stem = stemOf(imagePath);
  const fm = ['type: map', 'image: ' + (/[:#]/.test(name) ? JSON.stringify(name) : name)];
  if (props.place) fm.push('place: ' + JSON.stringify('[[' + props.place + ']]'));
  if (props.scale) fm.push('scale: ' + props.scale);
  for (const [k, v] of Object.entries(props.extra || {})) if (v !== undefined && v !== null && v !== '') fm.push(...serializeKV(k, v));
  return '---\n' + fm.join('\n') + '\n---\n# ' + oneLine(props.title || stem) + '\n\n![[' + name + ']]\n\n' + replacePins('', pins).replace(/^\n+/, '');
}

/* the line (0-based, in the note's body) a heading is on, for a link like [[Note#2.1. The Hall]]. Case and spacing are not compared,
   and a hidden marker at the end of the heading (<!-- room:ID -->) is ignored. -1 when there is no such heading. */
export function headingLine(body, heading) {
  const norm = t => String(t || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const want = norm(heading);
  if (!want) return -1;
  const lines = String(body || '').split(/\r?\n/);
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence) continue;
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(lines[i]);
    if (m && norm(m[1]) === want) return i;
  }
  return -1;
}

/* ---------- finding maps ---------- */
export const isMapNote = n => n.type === 'map' && !!(n.fm && n.fm.image);
export function mapNoteFor(idx, imagePath) {
  return (idx.byType.map || []).find(n => n.fm && n.fm.image && sameName(String(n.fm.image), imagePath)) || null;
}
export const placeOf = (idx, note) => {
  const v = note && note.fm && note.fm.place;
  if (!v) return null;
  const m = /\[\[([^\]|#]+)/.exec(Array.isArray(v) ? v.join(' ') : String(v));
  return idx.resolve(m ? m[1] : String(v));
};
/* maps whose `place` is this note: [{ note, image }] (image is the path of the picture) */
export function mapsOfPlace(idx, place) {
  return (idx.byType.map || []).filter(n => isMapNote(n) && (placeOf(idx, n) || {}).path === place.path).map(n => ({ note: n, image: idx.findAsset(String(n.fm.image)) })).filter(x => x.image);
}
/* where a place is pinned: [{ note (the map note), image, pin }] */
export function pinsOfPlace(idx, place) {
  const out = [];
  for (const n of idx.byType.map || []) {
    if (!isMapNote(n)) continue;
    const image = idx.findAsset(String(n.fm.image));
    if (!image) continue;
    for (const pin of parsePins(n.body)) if (pin.place && (idx.resolve(pin.place) || {}).path === place.path) out.push({ note: n, image, pin });
  }
  return out;
}

/* ---------- scale and distance ---------- */
const TO_M = { m: 1, km: 1000, ft: 0.3048, mi: 1609.344 };
export function parseScale(text) {
  const m = /^\s*([\d.]+)\s*(km|kilometres?|kilometers?|mi|miles?|m|metres?|meters?|ft|feet)\s*$/i.exec(String(text || ''));
  if (!m) return null;
  const u = m[2].toLowerCase();
  const unit = u.startsWith('k') ? 'km' : u.startsWith('mi') ? 'mi' : u.startsWith('f') ? 'ft' : 'm';
  const n = parseFloat(m[1]);
  return n > 0 ? { n, unit, metres: n * TO_M[unit] } : null;
}
/* real distance in metres between two pins, given the scale (the picture's whole width) and its shape (width / height) */
export function metresBetween(a, b, scale, aspect) {
  if (!scale || !aspect) return null;
  return (scale.metres / 100) * Math.hypot(a.x - b.x, (a.y - b.y) / aspect);
}
/* the whole width of the picture, from a measured line and what it really is */
export function scaleFromLine(a, b, aspect, realMetres) {
  const per = Math.hypot(a.x - b.x, (a.y - b.y) / aspect);   // percent of the width
  if (!(per > 0) || !(realMetres > 0)) return null;
  return realMetres * 100 / per;
}
export function fmtDistance(metres) {
  if (!(metres >= 0)) return '';
  return metres < 1000 ? Math.round(metres / 5) * 5 + ' m' : (Math.round(metres / 100) / 10) + ' km';
}
/* on foot at a normal pace: 4.8 km/h (3 mph) for 8 hours a day */
export function walkingTime(metres) {
  if (!(metres >= 500)) return '';
  const hours = metres / 4800;
  if (hours < 1) return 'under an hour on foot';
  if (hours <= 8) return 'about ' + (Math.round(hours * 2) / 2) + ' hour' + (hours === 1 ? '' : 's') + ' on foot';
  const days = hours / 8;
  return 'about ' + (Math.round(days * 2) / 2) + ' day' + (days === 1 ? '' : 's') + ' on foot';
}
export const scaleText = (n, unit) => (Math.round(n * 100) / 100) + ' ' + unit;
/* a width in metres as the nearest clean "n unit" for the scale property */
export function scaleFromMetres(metres) {
  return metres >= 1000 ? scaleText(metres / 1000, 'km') : scaleText(metres, 'm');
}

/* ---------- travel between places ---------- */
/* hours to cover a distance: 4.8 km/h (3 mph) on foot, twice that on a horse, eight hours of travel a day */
export const PACES = [['foot', 'On foot', 4800], ['horse', 'On a horse', 9600]];
export function travelText(metres, perHour) {
  if (!(metres >= 300)) return 'a few minutes';
  const hours = metres / perHour;
  if (hours < 1) return 'under an hour';
  if (hours <= 8) return (Math.round(hours * 2) / 2) + ' hour' + (Math.round(hours * 2) / 2 === 1 ? '' : 's');
  const days = hours / 8;
  const d = Math.round(days * 2) / 2;
  return d + ' day' + (d === 1 ? '' : 's');
}
/* every other place pinned on the same map as this one, nearest first, with the real distance (when the map has a scale).
   `aspect` is the picture's width divided by its height. */
export function distancesFrom(idx, place, mapNote, aspect) {
  const pins = parsePins(mapNote.body);
  const mine = pins.filter(p => p.place && (idx.resolve(p.place) || {}).path === place.path);
  if (!mine.length) return [];
  const scale = parseScale(mapNote.fm && mapNote.fm.scale);
  const seen = new Map();
  for (const p of pins) {
    if (!p.place || p.secret) continue;
    const other = idx.resolve(p.place);
    if (!other || other.path === place.path) continue;
    let best = null;
    for (const m of mine) {
      const d = metresBetween(m, p, scale, aspect);
      const pct = Math.hypot(m.x - p.x, (m.y - p.y) / (aspect || 1));
      const v = d === null ? pct : d;
      if (best === null || v < best.v) best = { v, metres: d };
    }
    const cur = seen.get(other.path);
    if (!cur || best.v < cur.v) seen.set(other.path, { note: other, v: best.v, metres: best.metres });
  }
  return [...seen.values()].sort((a, b) => a.v - b.v);
}
