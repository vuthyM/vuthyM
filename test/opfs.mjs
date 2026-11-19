import { build } from 'esbuild';
import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url'; import http from 'node:http';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const out = path.join(here, '.opfs-bundle.js');
await build({ entryPoints: [path.join(here, 'opfs-entry.js')], bundle: true, format: 'iife', outfile: out, logLevel: 'error' });
fs.writeFileSync(path.join(here, '.opfs.html'), '<!doctype html><script src=".opfs-bundle.js"></script>');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'], env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const pg = await (await b.newContext()).newPage();
pg.on('pageerror', e => console.log('PAGEERROR', e.message));
const srv = http.createServer((q, r) => { const f = q.url === '/' ? '.opfs.html' : q.url.slice(1); try { r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'text/html'); r.end(fs.readFileSync(path.join(here, f))); } catch (e) { r.statusCode = 404; r.end(); } }).listen(8766);
await pg.goto('http://localhost:8766/');
const res = await pg.evaluate(async () => {
  const log = [];
  try {
  const ok = (name, cond, extra) => log.push({ name, ok: !!cond, extra });
  const root = await navigator.storage.getDirectory();
  for await (const [n] of root.entries()) await root.removeEntry(n, { recursive: true });
  // populate a real directory tree from the demo files
  const files = T.demoFiles();
  for (const [p, content] of Object.entries(files)) {
    const parts = p.split('/'); let d = root;
    for (const part of parts.slice(0, -1)) { try { d = await d.getDirectoryHandle(part, { create: true }); } catch (e) { throw new Error('dir failed at ' + p + ' part ' + part + ': ' + e.message); } }
    try {
      const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable(); await w.write(content); await w.close();
    } catch (e) { throw new Error('populate failed at ' + p + ': ' + e.message); }
  }
  const vault = new T.FsaVault(root);
  ok('lists root, hides nothing yet', (await vault.list('')).some(e => e.name === 'Ashfall' && e.kind === 'dir'));
  const loaded = await T.loadCampaign(vault, 'Ashfall');
  ok('loads md files recursively', loaded.texts.size === 16, loaded.texts.size);
  ok('skips non-md in text map but lists them', loaded.files.includes('Ashfall/Maps/Greenhold Map.svg'));
  const mapping = T.detectMapping(T.topFolders(loaded.files, 'Ashfall'));
  const working = new T.Working(); working.loadBase(loaded.texts);
  const campaign = { path: 'Ashfall', name: 'Ashfall' };
  const index = T.buildIndex({ campaign, mapping, working, files: loaded.files });
  ok('index sees 4 NPCs', index.byType.npc.length === 4);
  const blob = await vault.readBlob('Ashfall/Maps/Greenhold Map.svg');
  ok('reads binary-ish file as a Blob', blob.size > 100 && (await blob.text()).includes('<svg'));
  // edit, create (new folder), delete
  const p = 'Ashfall/NPCs/Old Tam.md';
  working.setText(p, T.patchFrontmatter(working.get(p), { race: 'Human', location: '[[Greenhold]]' }));
  const np = T.newNotePath(campaign, mapping, 'item', 'Silver Bell', working);
  working.create(np.path, '---\ntype: item\n---\n\n# Silver Bell\n');
  working.remove('Ashfall/Plot Threads/Who Poisoned the Well.md');
  let items = await T.buildReview(vault, working);
  ok('review has no conflicts', items.length === 3 && items.every(i => !i.conflict), JSON.stringify(items.map(i => i.conflict)));
  ok('write permission check passes', await vault.ensureWrite());
  const results = await T.applyPush(vault, working, items, T.defaultDecisions(items));
  ok('push results ok', results.every(r => r.status === 'written' || r.status === 'deleted'), JSON.stringify(results));
  ok('updated file on disk', (await vault.readText(p)).includes('race: Human'));
  ok('new file in a brand-new folder', (await vault.readText('Ashfall/Items/Silver Bell.md')).includes('# Silver Bell'));
  ok('deleted file gone', !(await vault.exists('Ashfall/Plot Threads/Who Poisoned the Well.md')));
  ok('deleted file in .trash', (await vault.readText('.trash/Ashfall/Plot Threads/Who Poisoned the Well.md')).includes('Poisoned'));
  ok('pending cleared', working.count === 0);
  // unicode + CRLF survive a write
  const odd = 'Ashfall/NPCs/Ünïcode — Test.md';
  log.push({ name: 'step: unicode write', ok: true });
  await vault.writeText(odd, '---\r\nrole: Smith\r\n---\r\nCafé ☕ 日本語\r\n');
  const back = await vault.readText(odd);
  ok('unicode and CRLF round trip exactly', back === '---\r\nrole: Smith\r\n---\r\nCafé ☕ 日本語\r\n');
  log.push({ name: 'step: conflict', ok: true });
  // conflict: external edit
  working.setText(p, working.get(p) + '\nmine\n');
  await vault.writeText(p, (await vault.readText(p)) + '\ntheirs\n');
  items = await T.buildReview(vault, working);
  ok('external edit detected', items[0].conflict === 'changed');
  log.push({ name: 'step: inspector', ok: true });
  // inspector on a real handle
  const data = await T.scanVault(vault, {});
  const report = T.buildReport(data);
  ok('inspector works on a real directory', report.includes('Ashfall/') && report.includes('dataview'));
  } catch (e) { log.push({ name: 'EXCEPTION ' + e.message + ' :: ' + String(e.stack).split('\n').slice(0, 4).join(' | '), ok: false }); }
  return log;
});
let bad = 0;
for (const r of res) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + r.extra)); if (!r.ok) bad++; }
await b.close(); srv.close();
fs.rmSync(out, { force: true }); fs.rmSync(path.join(here, '.opfs.html'), { force: true });
process.exit(bad ? 1 : 0);
