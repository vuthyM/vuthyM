/* Writing a field back to a note where its value already lives, so the sheet and anything that reads it agree:
   a property in the front matter, or an inline line ("Level:: 5", "**HP:** 38") in the text. Only if the note has the
   value in neither place is a property added. The rest of the note is left exactly as it was. */
import { splitFrontmatter, patchFrontmatter } from './frontmatter.js';

const BOLD = /^(\s*(?:[-*]\s+)?\*\*([^*:\n]{1,40}?):?\*\*:?\s*)(.*)$/;
const DBLC = /^(\s*(?:[-*]\s+)?([A-Za-z][\w ]{0,30}?)::\s*)(.*)$/;

/* the new text for an old value: a plain number is replaced; "5th", "1,250 gp" keep their words; "30/38" changes the max (HP) or the first number */
export function mergeValue(old, nv, key = '') {
  if (nv === undefined || nv === null || nv === '') return '';
  const o = String(old ?? '');
  const n = String(nv);
  if (!/\d/.test(o) || /^\s*-?\d[\d,]*(\.\d+)?\s*$/.test(o)) return n;
  const slash = /^(\s*)(\d+)(\s*\/\s*)(\d+)(\s*)$/.exec(o);
  if (slash) return key === 'hp' ? slash[1] + slash[2] + slash[3] + n + slash[5] : slash[1] + n + slash[3] + slash[4] + slash[5];
  return o.replace(/\d[\d,]*(\.\d+)?/, n);
}

const asValue = v => {
  const raw = String(v ?? '').trim();
  if (raw === '') return undefined;
  return Number.isFinite(Number(raw)) ? Number(raw) : raw;
};

/* the lines of a body that look like inline fields ("Level:: 5", "**HP:** 38"), outside code fences */
function inlineFields(lines) {
  const found = [];
  let fence = null;
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) { fence = fence === null ? f[1] : (fence === f[1] ? null : fence); return; }
    if (fence !== null) return;
    const m = BOLD.exec(line) || DBLC.exec(line);
    if (m && m[3].trim() !== '') found.push({ i, label: m[2].trim().toLowerCase(), prefix: m[1], value: m[3], cr: /\r$/.test(raw) ? '\r' : '' });
  });
  return found;
}

/* a field that holds several links ("Seeded by"): written as a list of [[links]] where the value already lives (a property, or an inline line as "[[A]], [[B]]") */
function writeLinks(text, field, value) {
  const names = (Array.isArray(value) ? value : String(value ?? '').split(/\s*,\s*/)).map(x => String(x).trim().replace(/^\[\[|\]\]$/g, '')).filter(Boolean);
  const stored = names.map(n => '[[' + n + ']]');
  const keys = [field.key, ...(field.aliases || [])].map(k => k.toLowerCase());
  const sp = splitFrontmatter(text);
  const fmKey = Object.keys(sp.fm || {}).find(k => keys.includes(k.toLowerCase()));
  if (fmKey !== undefined) return patchFrontmatter(text, { [fmKey]: stored.length ? stored : undefined });
  const lines = sp.body.split('\n');
  const found = inlineFields(lines);
  for (const k of keys) {
    const hit = found.find(x => x.label === k);
    if (!hit) continue;
    lines[hit.i] = hit.prefix + stored.join(', ') + hit.cr;
    return sp.prefix + lines.join('\n');
  }
  return stored.length ? patchFrontmatter(text, { [field.key]: stored }) : text;
}

export function writeField(text, field, value) {
  if (field.kind === 'links') return writeLinks(text, field, value);
  const nv = asValue(value);
  const keys = [field.key, ...(field.aliases || [])].map(k => k.toLowerCase());
  const sp = splitFrontmatter(text);
  // 1. a property
  const fmKey = Object.keys(sp.fm || {}).find(k => keys.includes(k.toLowerCase()));
  if (fmKey !== undefined) {
    const old = sp.fm[fmKey];
    const next = typeof old === 'string' && nv !== undefined ? (field.kind === 'link' ? String(nv) : mergeValue(old, nv, field.key)) : nv;
    return patchFrontmatter(text, { [fmKey]: typeof next === 'string' && Number.isFinite(Number(next)) && next !== '' && typeof old !== 'string' ? Number(next) : (next === '' ? undefined : next) });
  }
  // 2. an inline line, the first one that names the field (in the order the keys are tried when reading)
  const lines = sp.body.split('\n');
  const found = inlineFields(lines);
  for (const k of keys) {
    const hit = found.find(x => x.label === k);
    if (!hit) continue;
    lines[hit.i] = hit.prefix + (field.kind === 'link' ? (nv === undefined ? '' : String(nv)) : mergeValue(hit.value, nv, field.key)) + hit.cr;
    return sp.prefix + lines.join('\n');
  }
  // 3. neither: a property
  return nv === undefined ? text : patchFrontmatter(text, { [field.key]: nv });
}
