import * as yaml from 'js-yaml';

export function detectEol(text) { return text.indexOf('\r\n') >= 0 ? '\r\n' : '\n'; }

const FM_RE = /^(﻿?)---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function splitFrontmatter(text) {
  const m = text.match(FM_RE);
  if (!m) return { hasFm: false, fmRaw: '', fm: {}, body: text, prefix: '', bom: '', error: null };
  const raw = m[2] || '';
  let fm = {}, error = null;
  try {
    const v = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
    fm = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (e) { error = e.message; }
  return { hasFm: true, fmRaw: raw, fm, body: text.slice(m[0].length), prefix: m[0], bom: m[1] || '', error };
}

/* Turns whatever YAML gave us into a string or array of strings.
   Unquoted [[Link]] parses as a nested array; turn it back into [[Link]]. */
export function scalarize(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    if (v.length === 1 && Array.isArray(v[0]) && v[0].length === 1 && typeof v[0][0] === 'string') return '[[' + v[0][0] + ']]';
    return v.map(x => {
      const s = scalarize(x);
      return Array.isArray(s) ? s.join(', ') : s;
    });
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const KEY_RE = /^([A-Za-z0-9_][^:#]*?|"[^"]+"|'[^']+'):(?:[ \t]|$)/;

function splitBlocks(lines) {
  const blocks = [];
  let cur = null;
  for (const ln of lines) {
    const m = ln.match(KEY_RE);
    if (m) {
      cur = { key: m[1].trim().replace(/^["']|["']$/g, ''), lines: [ln] };
      blocks.push(cur);
    } else if (cur) {
      cur.lines.push(ln);
    } else {
      cur = { key: null, lines: [ln] };
      blocks.push(cur);
    }
  }
  return blocks;
}

const RESERVED = /^(true|false|null|yes|no|on|off|y|n|~)$/i;
const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

function needsQuote(s) {
  if (s === '') return true;
  if (/^\s|\s$/.test(s)) return true;
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) return true;
  if (/: |:$|\s#|\n|\t/.test(s)) return true;
  if (RESERVED.test(s) || NUMERIC.test(s)) return true;
  return false;
}
const scalar = v => {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (v === null || v === undefined) return 'null';
  const s = String(v);
  return needsQuote(s) ? JSON.stringify(s) : s;
};
const keyText = k => (/^[A-Za-z0-9_][\w \-]*$/.test(k) ? k : JSON.stringify(k));

export function serializeKV(key, value) {
  const k = keyText(key);
  if (Array.isArray(value)) {
    if (!value.length) return [k + ': []'];
    return [k + ':', ...value.map(x => '  - ' + scalar(x))];
  }
  if (value === null) return [k + ':'];
  return [k + ': ' + scalar(value)];
}

/* Changes only the keys named in `changes`; every other line (comments,
   ordering, unknown keys) is left exactly as it was. value === undefined deletes. */
export function patchFrontmatter(text, changes) {
  const entries = Object.entries(changes).filter(([, v]) => true);
  if (!entries.length) return text;
  const eol = detectEol(text);
  const sp = splitFrontmatter(text);
  if (!sp.hasFm) {
    const lines = [];
    for (const [k, v] of entries) { if (v !== undefined) lines.push(...serializeKV(k, v)); }
    if (!lines.length) return text;
    return '---' + eol + lines.join(eol) + eol + '---' + eol + text;
  }
  const lines = sp.fmRaw === '' ? [] : sp.fmRaw.split(/\r?\n/);
  const blocks = splitBlocks(lines);
  for (const [k, v] of entries) {
    const idx = blocks.findIndex(b => b.key === k);
    if (v === undefined) { if (idx >= 0) blocks.splice(idx, 1); continue; }
    const ser = serializeKV(k, v);
    if (idx >= 0) blocks[idx] = { key: k, lines: ser };
    else blocks.push({ key: k, lines: ser });
  }
  const out = blocks.flatMap(b => b.lines);
  return sp.bom + '---' + eol + out.join(eol) + (out.length ? eol : '') + '---' + eol + sp.body;
}

export function replaceBody(text, newBody) {
  const sp = splitFrontmatter(text);
  return sp.prefix + newBody;
}

/* Replaces the whole front matter block with raw YAML text the user edited. */
export function setFrontmatterRaw(text, raw) {
  const eol = detectEol(text);
  const sp = splitFrontmatter(text);
  const clean = String(raw).replace(/\r?\n/g, eol).replace(/\s+$/, '');
  const block = '---' + eol + (clean ? clean + eol : '') + '---' + eol;
  if (sp.hasFm) return sp.bom + block + sp.body;
  return clean ? block + text : text;
}

/* Replaces the body with text from an editor (always LF). Untouched bodies are
   left byte-for-byte alone; edited ones keep the file's own line endings. */
export function applyBody(text, newBodyLf) {
  const eol = detectEol(text);
  const sp = splitFrontmatter(text);
  if (sp.body.replace(/\r\n/g, '\n') === newBodyLf) return text;
  return sp.prefix + (eol === '\r\n' ? newBodyLf.replace(/\n/g, '\r\n') : newBodyLf);
}
