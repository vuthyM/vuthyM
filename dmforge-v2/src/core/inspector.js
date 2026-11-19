import { splitFrontmatter, scalarize } from './frontmatter.js';
import { extractLinks, extractInline, extractTags } from './markdown.js';
import { ext, basename, stem } from './util.js';

/* Walks a vault and measures it. The report never includes note contents:
   folder names, counts, property names and file-name patterns only. */
export async function scanVault(vault, { includeNames = false, sample = 500, onProgress } = {}) {
  const folders = new Map();
  const mdFiles = [];
  const otherExt = {};
  const names = new Map();
  let total = 0;

  async function walk(dir, depth) {
    let ents;
    try { ents = await vault.list(dir); } catch (e) { return; }
    const rec = folders.get(dir) || { md: 0, other: 0, dirs: 0 };
    folders.set(dir, rec);
    for (const e of ents) {
      if (e.name === '.trash' || e.name === '.git' || e.name === 'node_modules') continue;
      if (e.name.startsWith('.')) continue;
      const p = dir ? dir + '/' + e.name : e.name;
      if (e.kind === 'dir') { rec.dirs++; await walk(p, depth + 1); }
      else {
        total++;
        if (/\.md$/i.test(e.name)) { rec.md++; mdFiles.push(p); if (includeNames) { const a = names.get(dir) || []; if (a.length < 4) a.push(stem(p)); names.set(dir, a); } }
        else { rec.other++; const x = ext(p) || '(none)'; otherExt[x] = (otherExt[x] || 0) + 1; }
        if (onProgress && total % 50 === 0) onProgress(total);
      }
    }
  }
  await walk('', 0);

  const step = Math.max(1, Math.ceil(mdFiles.length / sample));
  const picked = mdFiles.filter((_, i) => i % step === 0);
  const keyStats = new Map();
  let withFm = 0, fmErrors = 0, withInline = 0, withBold = 0, linkTotal = 0, embedTotal = 0, tagNotes = 0, readOk = 0, bytes = 0;
  const patterns = { dated: 0, session: 0, numbered: 0 };
  for (const p of mdFiles) {
    const b = stem(p);
    if (/^\d{4}-\d{2}-\d{2}/.test(b)) patterns.dated++;
    if (/session\s*#?\d+/i.test(b)) patterns.session++;
    if (/^\d+[\s._-]/.test(b)) patterns.numbered++;
  }
  for (const p of picked) {
    let text;
    try { text = await vault.readText(p); } catch (e) { continue; }
    readOk++; bytes += text.length;
    const sp = splitFrontmatter(text);
    if (sp.hasFm) {
      withFm++;
      if (sp.error) fmErrors++;
      for (const [k, v] of Object.entries(sp.fm)) {
        const s = scalarize(v);
        const kind = Array.isArray(s) ? 'list' : /\[\[.*\]\]/.test(s) ? 'link' : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'yes/no' : 'text';
        const rec = keyStats.get(k) || { n: 0, kinds: {} };
        rec.n++; rec.kinds[kind] = (rec.kinds[kind] || 0) + 1;
        keyStats.set(k, rec);
      }
    }
    const inline = extractInline(sp.body);
    if (/::/.test(sp.body) && Object.keys(inline).length) withInline++;
    if (/^\s*(?:[-*]\s+)?\*\*[^*]+\*\*:?/m.test(sp.body)) withBold++;
    const links = extractLinks(sp.body);
    linkTotal += links.filter(l => !l.embed).length;
    embedTotal += links.filter(l => l.embed).length;
    if (extractTags(sp.body, sp.fm).length) tagNotes++;
  }

  const config = {};
  for (const f of ['community-plugins.json', 'core-plugins.json', 'app.json']) {
    try { config[f] = JSON.parse(await vault.readText('.obsidian/' + f)); } catch (e) { /* not present or unreadable */ }
  }
  return { vaultName: vault.name, total, mdCount: mdFiles.length, sampled: readOk, step, folders, names, otherExt, withFm, fmErrors, withInline, withBold, linkTotal, embedTotal, tagNotes, bytes, keyStats, patterns, config };
}

function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '0%'; }

export function buildReport(d, { includeNames = false } = {}) {
  const L = [];
  L.push('DM FORGE VAULT REPORT');
  L.push('Contains folder names, counts, property names and file-name patterns. No note contents.');
  L.push('Generated: ' + new Date().toISOString().slice(0, 10));
  L.push('');
  L.push('VAULT: ' + d.vaultName);
  L.push('Files: ' + d.total + '   Markdown notes: ' + d.mdCount + '   Read for statistics: ' + d.sampled + (d.step > 1 ? ' (every ' + d.step + 'th note)' : ' (all)'));
  const ex = Object.entries(d.otherExt).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => '.' + k + ' ×' + v).join(', ');
  if (ex) L.push('Other file types: ' + ex);
  L.push('');
  L.push('FOLDER TREE (notes per folder, depth up to 3)');
  const paths = [...d.folders.keys()].sort((a, b) => a.localeCompare(b));
  for (const p of paths) {
    const depth = p ? p.split('/').length : 0;
    if (depth > 3) continue;
    const r = d.folders.get(p);
    const label = p ? p.split('/').pop() : '(vault root)';
    let line = '  '.repeat(depth) + label + '/   ' + r.md + ' notes' + (r.other ? ', ' + r.other + ' other files' : '') + (r.dirs ? ', ' + r.dirs + ' subfolders' : '');
    if (includeNames && d.names.get(p)) line += '   e.g. ' + d.names.get(p).join(' | ');
    L.push(line);
  }
  L.push('');
  L.push('PROPERTIES (front matter)');
  L.push('Notes with front matter: ' + d.withFm + ' of ' + d.sampled + ' (' + pct(d.withFm, d.sampled) + ')' + (d.fmErrors ? '   unreadable blocks: ' + d.fmErrors : ''));
  const keys = [...d.keyStats.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30);
  if (keys.length) {
    L.push('Most common properties:');
    for (const [k, r] of keys) L.push('  ' + k + '   ×' + r.n + '   (' + Object.entries(r.kinds).map(([a, b]) => a + (Object.keys(r.kinds).length > 1 ? ' ' + b : '')).join(', ') + ')');
  } else L.push('No front matter properties found.');
  L.push('');
  L.push('OTHER CONVENTIONS');
  L.push('Notes using "Key:: value" inline fields: ' + d.withInline + ' of ' + d.sampled);
  L.push('Notes using **Bold label:** lines: ' + d.withBold + ' of ' + d.sampled);
  L.push('Notes with #tags or a tags property: ' + d.tagNotes + ' of ' + d.sampled);
  L.push('[[Wikilinks]] per note (average): ' + (d.sampled ? (d.linkTotal / d.sampled).toFixed(1) : '0') + '   embeds ![[…]] total in sample: ' + d.embedTotal);
  L.push('File names: ' + d.patterns.dated + ' start with a date (YYYY-MM-DD), ' + d.patterns.session + ' contain "Session N", ' + d.patterns.numbered + ' start with a number');
  L.push('');
  L.push('OBSIDIAN SETUP');
  const cp = d.config['community-plugins.json'];
  L.push('Community plugins: ' + (Array.isArray(cp) && cp.length ? cp.join(', ') : 'none found'));
  const app = d.config['app.json'];
  if (app) {
    const pick = ['attachmentFolderPath', 'newFileLocation', 'newFileFolderPath', 'useMarkdownLinks'].filter(k => k in app).map(k => k + ' = ' + JSON.stringify(app[k]));
    if (pick.length) L.push('Settings: ' + pick.join('; '));
  }
  const tpl = paths.filter(p => /template/i.test(basename(p)));
  L.push('Template folders: ' + (tpl.length ? tpl.map(p => p + ' (' + d.folders.get(p).md + ' notes)').join(', ') : 'none found'));
  return L.join('\n');
}
