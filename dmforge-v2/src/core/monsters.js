/* The monster library: the SRD 5.2.1 creatures that come with DM Forge (CC-BY 4.0, unpacked the first time they are needed),
   and your own Bestiary notes. Both give the same record, so the library, the combat tracker and the encounter budget treat them alike.

   This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
   https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License,
   available at https://creativecommons.org/licenses/by/4.0/legalcode. */
import { SRD_GZ_B64 } from '../data/srd-monsters.js';
import { rollExpr } from './dice.js';
import { metricize } from './units.js';

export const SRD_CREDIT = 'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';
export const BESTIARY_FOLDERS = /^(bestiary|monsters?|creatures?|monster manual)$/i;

/* ---------- the SRD set ---------- */
let srd = null, loading = null;
export const srdLoaded = () => srd;
export function loadSrd() {
  if (srd) return Promise.resolve(srd);
  if (!loading) {
    loading = (async () => {
      const bin = atob(SRD_GZ_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      srd = JSON.parse(text).map(r => Object.assign(r, { src: 'srd', key: 'srd:' + r.id }));
      return srd;
    })().catch(e => { loading = null; throw e; });
  }
  return loading;
}

/* ---------- challenge rating ---------- */
export const CR_XP = { '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000 };
export function crLabel(cr) {
  if (cr === null || cr === undefined || Number.isNaN(cr)) return '?';
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(Math.round(cr));
}
export function parseCr(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim();
  if (!s) return null;
  const f = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (f) return +f[2] ? +f[1] / +f[2] : null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
export const crXp = cr => CR_XP[crLabel(cr)] ?? 0;
export const CR_STEPS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];

const mod = n => Math.floor((n - 10) / 2);
const signed = n => (n >= 0 ? '+' : '−') + Math.abs(n);

/* ---------- search ---------- */
export function searchMonsters(list, { q = '', crMin = null, crMax = null, type = '' } = {}) {
  const s = String(q || '').trim().toLowerCase();
  const out = [];
  for (const m of list) {
    if (crMin !== null && (m.cr === null || m.cr < crMin)) continue;
    if (crMax !== null && (m.cr === null || m.cr > crMax)) continue;
    if (type && String(m.t || '').toLowerCase() !== type.toLowerCase()) continue;
    const name = m.n.toLowerCase();
    let rank = 3;
    if (!s) rank = 0;
    else if (name.startsWith(s)) rank = 0;
    else if (name.includes(s)) rank = 1;
    else if (String(m.t || '').toLowerCase().includes(s)) rank = 2;
    else continue;
    out.push([rank, m]);
  }
  out.sort((a, b) => a[0] - b[0] || (a[1].mine ? 0 : 1) - (b[1].mine ? 0 : 1) || a[1].n.localeCompare(b[1].n));
  return out.map(x => x[1]);
}
export const monsterTypes = list => [...new Set(list.map(m => String(m.t || '').toLowerCase()).filter(Boolean))].sort();

/* ---------- your own Bestiary notes ---------- */
const fmGet = (note, keys) => {
  for (const [k, v] of Object.entries(note.fm || {})) if (keys.includes(k.toLowerCase())) return v;
  for (const k of keys) if (note.inline && note.inline[k] !== undefined) return note.inline[k];
  return undefined;
};
const asNum = v => { const m = /-?\d+(\.\d+)?/.exec(String(v ?? '')); return m ? Number(m[0]) : null; };

export function bestiaryNotes(idx) {
  return idx.notes.filter(n => n.type !== 'session' && BESTIARY_FOLDERS.test(n.top || '') && /\.md$/i.test(n.path));
}
/* a note as a monster record. Properties win; "AC 15", "HP 22" and "Initiative +2" in the text fill the gaps. */
export function noteMonster(note) {
  const body = note.body || '';
  const find = (re) => { const m = re.exec(body); return m ? Number(m[1]) : null; };
  const ac = asNum(fmGet(note, ['ac', 'armor class', 'armour class'])) ?? find(/\bAC\b\**[:\s]*\**\s*(\d+)/i);
  const hp = asNum(fmGet(note, ['hp', 'hit points'])) ?? find(/\b(?:HP|Hit Points)\b\**[:\s]*\**\s*(\d+)/i);
  let ini = asNum(fmGet(note, ['init', 'initiative', 'initiative bonus']));
  if (ini === null) ini = find(/\bInitiative\b\**[:\s]*\**\s*([+\-−]?\d+)/i);
  const cr = parseCr(fmGet(note, ['cr', 'challenge', 'challenge rating'])) ?? (() => { const m = /\b(?:CR|Challenge)\b\**[:\s]*\**\s*(\d+(?:\/\d+)?)/i.exec(body); return m ? parseCr(m[1]) : null; })();
  const t = String(fmGet(note, ['creature', 'creature type', 'monster type']) ?? '').trim();
  return { src: 'note', mine: true, key: 'note:' + note.path, id: note.path, n: note.name, path: note.path, ac, hp, ini: ini ?? 0, cr, t, sz: String(fmGet(note, ['size']) ?? ''), hd: String(fmGet(note, ['hd', 'hit dice']) ?? '').trim() || undefined, text: body, uses: [], la: [] };
}

/* ---------- stats for the tracker ---------- */
export function hpOf(m, rolled) {
  if (rolled && m.hd) { const r = rollExpr(String(m.hd)); if (r && r.total > 0) return r.total; }
  return m.hp ?? 1;
}
/* what the combat tracker is given for one creature of this kind */
export function combatSpec(m, { roll = false } = {}) {
  const hp = Math.max(1, hpOf(m, roll));
  const la = (m.la || []).length ? 3 : 0;
  return { name: m.n, hp, maxHp: hp, ac: m.ac ?? null, bonus: m.ini ?? 0, mon: m.key, legendary: la, uses: (m.uses || []).map(u => ({ name: u[0], kind: u[1], n: u[2] })) };
}

/* ---------- the stat block as markdown ---------- */
const block = (title, rows) => (rows && rows.length ? ['', '### ' + title, '', ...rows.map(r => (r[0] ? '**' + r[0].replace(/\.$/, '') + '.** ' : '') + r[1])] : []);
export function statBlockMarkdown(m) {
  if (m.src === 'note') return m.text || '';
  const lines = [];
  lines.push('*' + [m.sz, m.t && m.t[0].toUpperCase() + m.t.slice(1)].filter(Boolean).join(' ') + (m.al ? ', ' + m.al.replace(/\b\w/g, c => c.toUpperCase()) : '') + '*', '');
  lines.push('**AC** ' + m.ac + (m.acd ? ' (' + m.acd + ')' : '') + ' · **HP** ' + m.hp + (m.hd ? ' (' + m.hd + ')' : '') + ' · **Initiative** ' + signed(m.ini));
  lines.push('**Speed** ' + m.sp);
  lines.push('');
  lines.push('| Str | Dex | Con | Int | Wis | Cha |', '|:-:|:-:|:-:|:-:|:-:|:-:|', '| ' + m.ab.map(a => a + ' (' + signed(mod(a)) + ')').join(' | ') + ' |');
  lines.push('');
  const facts = [['Saving Throws', m.sv], ['Skills', m.sk], ['Damage Vulnerabilities', m.dv], ['Damage Resistances', m.dr], ['Damage Immunities', m.di], ['Condition Immunities', m.ci], ['Senses', m.se], ['Languages', m.ln], ['CR', crLabel(m.cr) + ' (XP ' + crXp(m.cr).toLocaleString('en-US') + ')']];
  for (const [k, v] of facts) if (v) lines.push('**' + k + '** ' + v + '  ');
  lines.push(...block('Traits', m.tr), ...block('Actions', m.ac_), ...block('Bonus Actions', m.ba), ...block('Reactions', m.re));
  if (m.la && m.la.length) lines.push(...block('Legendary Actions', m.la.map(a => [a[0] + (a[2] > 1 ? ' (Cost ' + a[2] + ')' : ''), a[1]])));
  return metricize(lines.join('\n'));
}

/* a new Bestiary note from an SRD creature: properties you can edit, then the stat block */
export function monsterNote(m) {
  const fm = { cr: crLabel(m.cr), size: m.sz, creature: m.t, ac: m.ac, hp: m.hp, init: m.ini, speed: metricize(m.sp), source: 'SRD 5.2.1 (CC-BY 4.0)' };
  const body = '# ' + m.n + '\n\n' + statBlockMarkdown(m) + '\n\n---\n_' + SRD_CREDIT + '_\n';
  return { fm, body };
}
