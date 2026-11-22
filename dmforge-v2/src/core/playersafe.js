/* A copy of a note that is safe to show players: the DM's secrets taken out. Nothing in the vault is changed. */
import { splitFrontmatter } from './frontmatter.js';
import { ROOM_HEAD, secretIdsOfText } from './atlas.js';

/* a section whose heading says it is for the DM */
const DM_HEADING = /^(secrets?(\s+(and|&)\s+clues)?|clues|for\s+the\s+(dm|gm)|(dm|gm)(['’]s)?\s+(notes?|only|eyes(\s+only)?|section|info)|(dm|gm)\s+only|hidden|spoilers?|behind\s+the\s+scenes|what\s+(is\s+)?really\s+(happening|going\s+on)|real\s+(story|truth))\b/i;
/* a callout (> [!type]) the DM keeps for themselves */
const DM_CALLOUT = /^>\s*\[!\s*(secret|dm|gm|spoiler|hidden|dm-only|gm-only)[^\]]*\]/i;
/* a line such as "- **Secret:** ..." (and the lines indented under it) */
const DM_LINE = /^(\s*)(?:[-*+]\s+)?\*\*(secrets?|dm\s+notes?|gm\s+notes?|dm|gm|hidden)\s*:?\*\*\s*:?/i;
/* a map pin marked secret */
/* any map pin line (position, then what it points at) */
const PIN_LINE = /^\s*[-*+]\s+\d{1,3}(?:\.\d+)?\s*[,;]\s*\d{1,3}(?:\.\d+)?\s*[—–-]+/;
const SECRET_PIN = /^\s*[-*+]\s+\d{1,3}(?:\.\d+)?\s*[,;]\s*\d{1,3}(?:\.\d+)?\s*[—–-]+.*[—–]\s*secret\b/i;

const indentOf = l => (/^(\s*)/.exec(l)[1] || '').replace(/\t/g, '    ').length;

/* secretRooms: more room ids to keep out (see secretRoomsFromPins), on top of the ones the dungeon note itself lists in its secret-rooms property */
export function playerSafe(text, name = '', { plainLinks = true, secretRooms = [] } = {}) {
  const removed = { sections: [], callouts: 0, lines: 0, pins: 0, comments: 0 };
  let body = splitFrontmatter(String(text || '').replace(/\r\n/g, '\n')).body;
  // a dungeon imported from DMAtlas: the sections of secret rooms go first, while their hidden room:ID markers are still there
  const secret = new Set([...secretIdsOfText(String(text || '')), ...secretRooms]);
  if (secret.size) body = dropRoomSections(body, secret, removed);
  // Obsidian %%comments%% and HTML comments
  body = body.replace(/%%[\s\S]*?%%/g, () => { removed.comments++; return ''; }).replace(/<!--[\s\S]*?-->/g, () => { removed.comments++; return ''; });
  const lines = body.split('\n');
  const out = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; out.push(l); continue; }
    if (fence) { out.push(l); continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (h && DM_HEADING.test(h[2].replace(/[*_`]/g, '').trim())) {
      const level = h[1].length;
      removed.sections.push(h[2].replace(/[*_`]/g, '').trim());
      i++;
      let f = false;
      while (i < lines.length) {
        if (/^\s*(```|~~~)/.test(lines[i])) f = !f;
        const m = !f && /^(#{1,6})\s+\S/.exec(lines[i]);
        if (m && m[1].length <= level) break;
        i++;
      }
      i--;
      continue;
    }
    if (DM_CALLOUT.test(l)) {
      removed.callouts++;
      while (i + 1 < lines.length && /^>/.test(lines[i + 1])) i++;
      continue;
    }
    if (DM_LINE.test(l)) {
      removed.lines++;
      const ind = indentOf(l);
      while (i + 1 < lines.length && lines[i + 1].trim() && indentOf(lines[i + 1]) > ind) i++;
      continue;
    }
    if (SECRET_PIN.test(l)) { removed.pins++; continue; }
    // a pin that points at a section of a note ([[Rift Keep#2.1. The Hall]]) reads as the section's name, not the note's
    out.push(PIN_LINE.test(l) ? l.replace(/\[\[[^\]|#]+#([^\]|]+)(?:\|[^\]]*)?\]\]/, '$1') : l);
  }
  let t = out.join('\n');
  if (plainLinks) t = t.replace(/!\[\[[^\]]*\]\]/g, m => m).replace(/(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (m, target, alias) => (alias || target).trim());
  t = t.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  if (name && !/^#\s/.test(t)) t = '# ' + name + '\n\n' + t;
  const total = removed.sections.length + removed.callouts + removed.lines + removed.pins;
  return { text: t + '\n', removed, total };
}

/* removes each "## n. name <!-- room:ID -->" section whose id is in `ids`, up to the next heading of the same or a higher level */
function dropRoomSections(body, ids, removed) {
  const lines = body.split('\n');
  const out = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; out.push(l); continue; }
    const m = !fence && ROOM_HEAD.exec(l);
    if (m && ids.has(m[2])) {
      removed.sections.push(m[1].replace(/[*_`]/g, '').trim());
      let f = false;
      i++;
      while (i < lines.length) {
        if (/^\s*(```|~~~)/.test(lines[i])) f = !f;
        if (!f && /^#{1,2}\s/.test(lines[i])) break;
        i++;
      }
      i--;
      continue;
    }
    out.push(l);
  }
  return out.join('\n');
}

export function removedSummary(r) {
  const parts = [];
  if (r.sections.length) parts.push(r.sections.length + ' section' + (r.sections.length === 1 ? '' : 's') + ' (' + r.sections.slice(0, 4).join(', ') + (r.sections.length > 4 ? '…' : '') + ')');
  if (r.callouts) parts.push(r.callouts + ' DM callout' + (r.callouts === 1 ? '' : 's'));
  if (r.lines) parts.push(r.lines + ' secret line' + (r.lines === 1 ? '' : 's'));
  if (r.pins) parts.push(r.pins + ' secret map pin' + (r.pins === 1 ? '' : 's'));
  if (r.comments) parts.push(r.comments + ' comment' + (r.comments === 1 ? '' : 's'));
  return parts.join(', ');
}
