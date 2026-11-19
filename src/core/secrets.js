/* Secrets and clues: what the players could learn, and where they can find it. They are tasks under "## Secrets and clues" in a
   session or plot thread note:
     - [ ] The ferryman sold the bells — Old Tam's ledger; Brother Calder's confession; the missing rope
   The words after the dash are the clues (separated by ; or ,). Three ways to find a secret is a good number: with fewer the
   tracker says so. Ticking a secret means the players now know it. */
import { splitFrontmatter } from './frontmatter.js';

export const SECRET_HEADINGS = ['Secrets and clues', 'Secrets & clues', 'Secrets', 'Clues'];
export const CLUES_WANTED = 3;
const LINE = /^(\s*[-*]\s+)\[( |x|X)\]\s+(.*?)\s*$/;
const REVEALED = /\s*\(revealed in \[\[([^\]]+)\]\]\)\s*$/;

function sectionLines(body) {
  const lines = String(body || '').split(/\r?\n/);
  for (const h of SECRET_HEADINGS) {
    const re = new RegExp('^##\\s+' + h.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&') + '\\s*$', 'i');
    const i = lines.findIndex(l => re.test(l));
    if (i < 0) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) if (/^#{1,2}\s/.test(lines[j])) { end = j; break; }
    return lines.slice(i + 1, end);
  }
  return [];
}

export function parseSecrets(body) {
  const out = [];
  for (const raw of sectionLines(body)) {
    const m = LINE.exec(raw);
    if (!m || !m[3]) continue;
    let text = m[3];
    const rev = REVEALED.exec(text);
    if (rev) text = text.replace(REVEALED, '');
    const dash = text.search(/\s[—–]\s|\s--\s/);
    const secret = (dash >= 0 ? text.slice(0, dash) : text).trim();
    const rest = dash >= 0 ? text.slice(dash).replace(/^\s*(?:—|–|--)\s*/, '') : '';
    const clues = rest.split(/;|,(?![^\[]*\]\])/).map(s => s.trim()).filter(Boolean);
    if (secret) out.push({ raw: raw.replace(/\r$/, ''), secret, clues, done: m[2] !== ' ', revealedIn: rev ? rev[1] : '' });
  }
  return out;
}

export function secretLine(secret, clues = []) {
  const c = clues.map(x => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  return '- [ ] ' + String(secret).replace(/\s+/g, ' ').trim() + (c.length ? ' — ' + c.join('; ') : '');
}

/* every note that has secrets: sessions (newest first) and plot threads */
export function secretsFrom(idx) {
  const out = [];
  const notes = [...(idx.byType.session || []), ...(idx.byType.plot || [])];
  for (const n of notes) {
    const items = parseSecrets(splitFrontmatter(n.text).body);
    if (items.length) out.push({ path: n.path, name: n.name, type: n.type, items });
  }
  return out;
}

/* ticks a secret as revealed (and says where), or unticks it; returns the new text, or null */
export function setRevealed(text, raw, revealed, sessionName = '') {
  const lines = String(text).split('\n');
  const i = lines.findIndex(l => l.replace(/\r$/, '') === raw);
  if (i < 0) return null;
  const cr = /\r$/.test(lines[i]) ? '\r' : '';
  let body = raw.replace(/\[[ xX]\]/, revealed ? '[x]' : '[ ]').replace(REVEALED, '');
  if (revealed && sessionName) body += ' (revealed in [[' + sessionName + ']])';
  lines[i] = body + cr;
  return lines.join('\n');
}

export const needsClues = item => !item.done && item.clues.length < CLUES_WANTED;
