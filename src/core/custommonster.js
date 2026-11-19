/* Your own monsters. A custom monster is an ordinary note in your Bestiary folder: properties (cr, size, creature, ac, hp, init, speed...)
   and a stat block in the same layout as the built-in ones, so the library, the fight tracker and Obsidian all treat it like any other.
   The form that made it is kept in a hidden comment at the end of the note, so Edit can open it again exactly as it was. */
import { statBlockMarkdown, crLabel, parseCr } from './monsters.js';
import { metricize } from './units.js';

export const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
export const ABILITIES = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
const MARK = 'dmforge:monster';
const COMMENT = new RegExp('\\n*<!-- ' + MARK + ' (\\{[\\s\\S]*?\\}) -->\\s*$');

export const blankMonster = () => ({ name: '', size: 'Medium', type: '', align: '', ac: '', acd: '', hp: '', hd: '', ini: '', speed: '9 m', ab: ['10', '10', '10', '10', '10', '10'], sv: '', sk: '', dv: '', dr: '', di: '', ci: '', se: '', ln: '', cr: '1', tr: '', act: '', ba: '', re: '', la: '' });
export const abMod = n => Math.floor(((Number(n) || 10) - 10) / 2);

/* a paragraph list from entries: "**Name.** text", one per paragraph */
const entriesText = list => (list || []).map(r => (r[0] ? '**' + String(r[0]).replace(/\.$/, '') + '.** ' : '') + r[1]).join('\n\n');

/* a built-in monster as a form to start from ("copy and edit") */
export function monsterToForm(m) {
  const f = blankMonster();
  return Object.assign(f, {
    name: m.n + (m.src === 'srd' ? ' (custom)' : ''), size: SIZES.includes(m.sz) ? m.sz : 'Medium', type: m.t || '', align: m.al || '', ac: m.ac ?? '', acd: m.acd || '', hp: m.hp ?? '', hd: m.hd || '', ini: m.ini ?? '',
    speed: metricize(m.sp || '').replace(/\bm\.$/, 'm'), ab: (m.ab || f.ab).map(String), sv: m.sv || '', sk: m.sk || '', dv: m.dv || '', dr: m.dr || '', di: [m.di, m.ci].filter(Boolean).join('; ') ? (m.di || '') : '', ci: m.ci || '', se: metricize(m.se || ''), ln: m.ln || '',
    cr: crLabel(m.cr), tr: metricize(entriesText(m.tr)), act: metricize(entriesText(m.ac_)), ba: metricize(entriesText(m.ba)), re: metricize(entriesText(m.re)),
    la: metricize(entriesText((m.la || []).map(a => [a[0] + (a[2] > 1 ? ' (Cost ' + a[2] + ')' : ''), a[1]]))),
  });
}

/* the entries in a block of text: "**Name.** What it does" (or "Name. What it does"), one per paragraph; a paragraph with no name is kept as plain text */
const NAME = /^(?:\*{1,3}|_{1,3})?([A-Z][A-Za-z'’\-]*(?:\s+(?:[A-Za-z'’\-]+)){0,5}(?:\s*\([^)]{1,40}\))?)\.(?:\*{1,3}|_{1,3})?\s+(\S[\s\S]*)$/;
export function parseEntries(text) {
  const out = [];
  for (const para of String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const t = para.trim().replace(/\n+/g, ' ');
    if (!t) continue;
    const m = NAME.exec(t);
    if (m) out.push([m[1].replace(/[*_]/g, '').trim(), m[2].trim()]); else out.push(['', t]);
  }
  return out;
}

export function formToRecord(f) {
  const ab = (f.ab || []).map(x => { const n = parseInt(x, 10); return Number.isFinite(n) ? n : 10; });
  while (ab.length < 6) ab.push(10);
  const dex = abMod(ab[1]);
  const ini = f.ini === '' || f.ini === undefined || Number.isNaN(parseInt(f.ini, 10)) ? dex : parseInt(f.ini, 10);
  const la = parseEntries(f.la).map(([n, t]) => { const c = /\(\s*Costs?\s+(\d)\s*(?:Actions?)?\s*\)/i.exec(n); return [c ? n.replace(c[0], '').trim() : n, t, c ? +c[1] : 1]; });
  return {
    n: String(f.name || '').trim(), sz: f.size, t: String(f.type || '').trim(), al: String(f.align || '').trim(),
    ac: parseInt(f.ac, 10), acd: String(f.acd || '').trim(), hp: parseInt(f.hp, 10), hd: String(f.hd || '').trim(), ini, sp: String(f.speed || '').trim(),
    ab, sv: f.sv, sk: f.sk, dv: f.dv, dr: f.dr, di: f.di, ci: f.ci, se: f.se, ln: f.ln, cr: parseCr(f.cr),
    tr: parseEntries(f.tr), ac_: parseEntries(f.act), ba: parseEntries(f.ba), re: parseEntries(f.re), la,
  };
}

/* what is wrong with the form, in words; nothing means it can be saved */
export function checkForm(f) {
  const errs = {};
  if (!String(f.name || '').trim()) errs.name = 'Give it a name.';
  else if (/[\\/:*?"<>|#^\[\]]/.test(f.name)) errs.name = 'A name cannot have any of  \\ / : * ? " < > | # ^ [ ]';
  if (!(parseInt(f.hp, 10) >= 1)) errs.hp = 'Hit points are a whole number, 1 or more.';
  if (!(parseInt(f.ac, 10) >= 0)) errs.ac = 'Armour class is a whole number.';
  if (String(f.cr || '').trim() && parseCr(f.cr) === null) errs.cr = 'Challenge rating is like 1/4, 1/2 or 5.';
  if (String(f.ini ?? '').trim() && Number.isNaN(parseInt(f.ini, 10))) errs.ini = 'Initiative is a number, like +2.';
  return errs;
}

/* the note for a form: properties, and the stat block with the form tucked in at the end */
export function formNote(f) {
  const rec = formToRecord(f);
  const fm = { cr: Number.isInteger(rec.cr) ? rec.cr : crLabel(rec.cr), size: rec.sz, creature: rec.t.toLowerCase(), ac: rec.ac, hp: rec.hp, init: rec.ini, speed: metricize(rec.sp) };
  if (rec.hd) fm.hd = rec.hd;
  if (rec.al) fm.alignment = rec.al;
  fm.statblock = 'form';
  for (const k of Object.keys(fm)) if (fm[k] === '' || fm[k] === undefined || (typeof fm[k] === 'number' && Number.isNaN(fm[k]))) delete fm[k];
  if (fm.cr === '?') delete fm.cr;
  const visible = '# ' + rec.n + '\n\n' + statBlockMarkdown(rec);
  const json = JSON.stringify(f).replace(/>/g, '\\u003e').replace(/--/g, '-\\u002d');
  return { fm, visible, body: visible + '\n\n<!-- ' + MARK + ' ' + json + ' -->\n' };
}

/* the form a note was made from, if it was made with the form and its text has not been changed since ({ form, edited }) */
export function readForm(body) {
  const text = String(body || '').replace(/\r\n/g, '\n');
  const m = COMMENT.exec(text);
  if (!m) return null;
  let form;
  try { form = Object.assign(blankMonster(), JSON.parse(m[1])); } catch (e) { return null; }
  const visible = text.slice(0, m.index).trim();
  return { form, edited: visible !== formNote(form).visible.trim() };
}

/* ---------- reading a pasted stat block ---------- */
const plain = l => String(l).replace(/[*_`]/g, '').replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
const HEAD = /^#*\s*(Traits|Actions|Bonus Actions|Reactions|Legendary Actions)(?:\s*\(.*\))?\s*:?\s*$/i;
const SECTION = { traits: 'tr', actions: 'act', 'bonus actions': 'ba', reactions: 're', 'legendary actions': 'la' };
const titleCase = s => s.toLowerCase().replace(/(^|\s)([a-z])/g, (_, a, b) => a + b.toUpperCase());
const dash = s => String(s).replace(/[−–]/g, '-');

/* returns the fields that could be read, as a partial form, and a count; nothing is guessed */
export function parseStatBlock(raw) {
  const out = {};
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/^\s*>+\s?/, ''));
  const body = { tr: [], act: [], ba: [], re: [], la: [] };
  let state = 'head', section = null, named = false;
  const set = (k, v) => { if (v !== undefined && v !== '' && out[k] === undefined) out[k] = v; };
  const headLines = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const p = plain(rawLine);
    if (!p) { if (section) body[section].push(''); continue; }
    if (/^[-:| ]+$/.test(rawLine.trim())) continue;                            // a markdown table's rule line
    const h = HEAD.exec(p);
    if (h) { section = SECTION[h[1].toLowerCase()]; state = 'body'; continue; }
    if (state === 'head') {
      headLines.push(p);
      if (!named) {
        const size = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i.exec(p);
        if (!size && !/^(Armor Class|AC|Hit Points|HP|Speed)\b/i.test(p)) { named = true; const nm = p.replace(/^#+\s*/, ''); set('name', nm === nm.toUpperCase() ? titleCase(nm) : nm); continue; }
        named = true;
      }
      const ty = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)(?:\s+or\s+\w+)?\s+([^,(]+?)(?:\s*\(([^)]*)\))?\s*,\s*(.+)$/i.exec(p);
      if (ty) { set('size', titleCase(ty[1])); set('type', (ty[2].trim().toLowerCase() + (ty[3] ? ' (' + ty[3].trim() + ')' : ''))); set('align', ty[4].trim().toLowerCase()); continue; }
      let m;
      if ((m = /\b(?:Armor Class|AC)\s+(\d+)(?:\s*\(([^)]*)\))?/i.exec(p))) { set('ac', m[1]); set('acd', m[2]); }
      if ((m = /\b(?:Hit Points|HP)\s+(\d+)(?:\s*\(([^)]*)\))?/i.exec(p))) { set('hp', m[1]); set('hd', m[2] && m[2].replace(/\s+/g, '')); }
      if ((m = /\bInitiative\s+([+\-−–]?\d+)/i.exec(p))) set('ini', dash(m[1]).replace('+', ''));
      if ((m = /^Speed\s+(.+)$/i.exec(p))) set('speed', metricize(m[1]).replace(/\bm\.$/, 'm'));
      if ((m = /^(?:Saving Throws|Saves)\s+(.+)$/i.exec(p))) set('sv', m[1]);
      if ((m = /^Skills\s+(.+)$/i.exec(p))) set('sk', m[1]);
      if ((m = /^(?:Damage )?Vulnerabilities\s+(.+)$/i.exec(p))) set('dv', m[1]);
      if ((m = /^(?:Damage )?Resistances\s+(.+)$/i.exec(p))) set('dr', m[1]);
      if ((m = /^(?:Damage )?Immunities\s+(.+)$/i.exec(p))) set('di', m[1]);
      if ((m = /^Condition Immunities\s+(.+)$/i.exec(p))) set('ci', m[1]);
      if ((m = /^Senses\s+(.+)$/i.exec(p))) set('se', metricize(m[1]));
      if ((m = /^Languages\s+(.+)$/i.exec(p))) set('ln', m[1]);
      if ((m = /^(?:Challenge|CR)\s+(\d+(?:\s*\/\s*\d+)?)/i.exec(p))) { set('cr', m[1].replace(/\s+/g, '')); state = 'body'; section = 'tr'; }
      continue;
    }
    if (section) body[section].push(rawLine.trim());
  }
  // the six scores: "STR 8 (-1) DEX 14 (+2)...", "Str 8 −1 −1" rows, or a table of "8 (-1)" cells
  const head = headLines.join('  ');
  const ab = ABILITIES.map(a => { const m = new RegExp('\\b' + a + '\\b\\s*:?\\s*(\\d{1,2})\\b', 'i').exec(head); return m ? m[1] : null; });
  if (ab.every(Boolean)) out.ab = ab;
  else {
    for (const l of headLines) { const cells = [...l.matchAll(/(\d{1,2})\s*\(\s*[+\-−–]?\d+\s*\)/g)].map(m => m[1]); if (cells.length >= 6) { out.ab = cells.slice(0, 6); break; } }
  }
  for (const k of Object.keys(body)) {
    const text = body[k].join('\n');
    const paras = text.split(/\n\s*\n/).map(x => x.replace(/\n+/g, ' ').trim()).filter(Boolean);
    // lines of one entry may be wrapped without a blank line between entries: start a new entry at a "Name." that is bold or looks like a name
    const entries = [];
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const bold = /^(\*{1,3}|_{1,3})[^*_]{1,70}?\.\1/.test(t) || /^(\*{1,3}|_{1,3})[^*_]{1,70}?\.\s/.test(t);
      const nm = NAME.exec(t);
      const nameWords = nm ? nm[1].replace(/\([^)]*\)/, '').trim().split(/\s+/) : [];
      const looksName = nm && !/[:\d]/.test(nm[1].replace(/\([^)]*\)/, '')) && nameWords.length <= 5 && nameWords.every(w => /^([A-Z][\w'’\-]*|of|the|a|an|in|to|and|or|on)$/.test(w));
      if (nm && (bold || looksName)) entries.push([nm[1].replace(/[*_]/g, '').trim(), nm[2].trim()]);
      else if (entries.length) entries[entries.length - 1][1] += ' ' + t;
      else entries.push(['', t]);
    }
    void paras;
    if (entries.length) out[k] = entriesText(entries);
  }
  const keys = Object.keys(out);
  return { fields: out, count: keys.length, missing: ['name', 'ac', 'hp', 'cr'].filter(k => out[k] === undefined) };
}
