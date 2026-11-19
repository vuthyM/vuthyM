/* Copying a library character or item into the open campaign. The copy is an ordinary note (the creator's hidden comment is
   dropped, so Obsidian and DM Forge treat it like any other NPC, player or item) that remembers where it came from. */
import { patchFrontmatter, splitFrontmatter } from './frontmatter.js';

const STATE_COMMENT = /\n?<!--\s*dmforge:(?:character|item)\s+[\s\S]*?-->\s*/g;
export const withoutState = text => String(text).replace(STATE_COMMENT, '\n').replace(/\n{3,}$/g, '\n\n').replace(/\s+$/, '') + '\n';

/* kind: 'npc' | 'player' (a character) or 'item' */
export function campaignNoteText(text, kind, from) {
  let t = withoutState(text);
  t = patchFrontmatter(t, { type: kind, library: from, example: undefined, updated: undefined, source: undefined });
  return t;
}
/* the type a character's note should have in a campaign */
export const typeForCharacter = fm => (String((fm && fm.kind) || 'pc') === 'npc' ? 'npc' : 'player');
export const nameOfNote = text => { const m = /^#\s+(.+)$/m.exec(splitFrontmatter(text).body); return m ? m[1].trim() : ''; };
