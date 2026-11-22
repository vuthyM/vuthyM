import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http'; import zlib from 'node:zlib'; import crypto from 'node:crypto';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

/* The DMAtlas import, end to end: a stand-in DMAtlas, the real DM Forge server, and the real app in a browser. Follows the owner's test checklist. */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- a stand-in DMAtlas ---- */
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const png = (w, h, color) => {
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(w).fill(color).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
};
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const pics = { e1: png(40, 30, [60, 30, 20]), e2: png(40, 30, [90, 40, 10]), r1: png(40, 30, [20, 40, 60]), r2: png(40, 30, [20, 60, 40]) };
const lvl = (mapId, level, order, pic, rooms) => ({ mapId, mapName: level, level, order, cellFt: 5, publishedAt: 't', mapUpdatedAt: 't', image: { url: '/x', type: 'image/png', width: 40, height: 30, bytes: pics[pic].length, sha256: sha(pics[pic]), pxPerCell: 4 }, rooms });
const rm = (id, n, name, x, y, secret = false, seed = '') => ({ id, n, name, x, y, cx: 1, cy: 1, secret, seed });
const atlas = {
  hits: [], down: false,
  dungeons: {
    'd-ember': { format: 'dmatlas-forge/1', id: 'd-ember', name: 'Ember Hollow', publishedAt: 't', levels: [lvl('m-e1', 'Level 1', 0, 'e1', [rm('e-a', '1', 'Mouth', 12, 80, false, 'A wide cave mouth, breathing warm air.'), rm('e-b', '2', 'Glow Pool', 55, 40), rm('e-c', '3', 'Hidden Forge', 85, 15, true, 'The forge is still hot.')])] },
    'd-rift': { format: 'dmatlas-forge/1', id: 'd-rift', name: 'Rift Keep', publishedAt: 't', levels: [lvl('m-r2', 'Level 2', 1, 'r2', [rm('r-d', '2.1', 'Pit', 30, 30), rm('r-e', '2.2', 'Secret Shrine', 70, 70, true, 'Holy.')]), lvl('m-r1', 'Level 1', 0, 'r1', [rm('r-a', '1.1', 'Gate', 10, 20, false, 'Cold stone.'), rm('r-b', '1.2', 'Hall', 50, 60)])] },
  },
};
const atlasSrv = http.createServer((req, res) => {
  atlas.hits.push(req.url);
  if (atlas.down) { res.writeHead(500); return res.end('down'); }
  const json = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  if (req.url === '/api/forge/dungeons') return json(Object.values(atlas.dungeons).map(d => ({ id: d.id, name: d.name, publishedAt: d.publishedAt, levels: d.levels.length, rooms: d.levels.reduce((n, l) => n + l.rooms.length, 0), maps: [] })));
  const m = /^\/api\/forge\/dungeons\/([\w.:-]+)$/.exec(req.url);
  if (m) return atlas.dungeons[m[1]] ? json(atlas.dungeons[m[1]]) : (res.writeHead(404), res.end('{}'));
  const im = /^\/api\/forge\/maps\/([\w.:-]+)\/image\/([0-9a-f]{64})\.png$/.exec(req.url);
  if (im) { const pic = Object.values(pics).find(p => sha(p) === im[2]); if (pic) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(pic); } }
  res.writeHead(404); res.end('');
});
await new Promise(r => atlasSrv.listen(8798, '127.0.0.1', r));

/* ---- DM Forge: a server with a campaign in it ---- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-atlas-'));
const vault = path.join(tmp, 'vault'); const data = path.join(tmp, 'data');
for (const [p, v] of Object.entries(demoFiles())) { const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer())); }
spawnSync('python3', ['-I', path.join(root, 'server', 'dmforge_io.py'), 'import', '--data', data, vault], { encoding: 'utf8' });
const TOKEN = 'atlas-e2e-token-0123456789', PORT = 8797;
const proc = spawn('python3', ['-I', path.join(root, 'server', 'dmforge_hosted.py'), '--data', data, '--bind', '127.0.0.1', '--port', String(PORT), '--name', 'Hosted', '--app', path.join(root, 'dist', 'DM-Forge.html'), '--dmatlas-url', 'http://127.0.0.1:8798'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DMFORGE_TOKEN: TOKEN } });
let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 60 && !/listening/.test(out); i++) await sleep(100);
if (!/listening/.test(out)) { console.log('server did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + PORT;
const api = (op, p, init = {}) => fetch(base + '/api/' + op + '?path=' + encodeURIComponent(p), { ...init, headers: { 'X-DMF-Token': TOKEN, ...(init.headers || {}) } });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
await pg.goto(base + '/'); await pg.fill('input[name=token]', TOKEN); await pg.click('button[type=submit]');
await pg.waitForSelector('.dir-list');
await pg.click('.dir-row:has-text("Ashfall")'); await pg.click('text=Use “Ashfall” as the campaign');
await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');

const S = f => pg.evaluate(f);
const note = name => pg.evaluate(n => { const x = window.__dmforge.getIndex().notes.find(y => y.name === n); return x ? { path: x.path, text: window.__dmforge.S.working.get(x.path), fm: x.fm } : null; }, name);
const count = () => S(() => window.__dmforge.S.working.count);
const openDialog = async () => { await pg.evaluate(() => window.__dmforge.A.setSection('map')); await pg.click('#atlasBtn'); await pg.waitForSelector('#atlasList, #atlasError'); };
const push = async () => { await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done'); };
const importOne = async id => { await openDialog(); await pg.click('[data-atlas-pick="' + id + '"]'); await pg.waitForSelector('#atlasPlan'); const text = await pg.textContent('#atlasPlanText'); await pg.click('#atlasGo'); await pg.waitForSelector('#atlasPlan', { state: 'detached' }); await sleep(200); return text; };

/* ---- the list ---- */
await openDialog();
check('the dialog lists what DMAtlas has published, both new', (await pg.locator('#atlasList [data-atlas]').count()) === 2 && (await pg.textContent('#atlasList')).includes('Ember Hollow') && !(await pg.textContent('#atlasList')).includes('Imported'));
await pg.keyboard.press('Escape'); await sleep(200);
if (await pg.locator('#atlasList').count()) await pg.click('.modal .btn:has-text("Close")');

/* ---- a one-level map with a secret room ---- */
const t1 = await importOne('d-ember');
check('the preview says what will be made', /new note with 3 rooms on 1 level/.test(t1), t1);
const em = await note('Ember Hollow');
check('one note, in the Dungeons folder, named after the dungeon', em && em.path === 'Ashfall/Dungeons/Ember Hollow.md', em && em.path);
check('a section per room in the exact form, starter text used', em.text.includes('## 1. Mouth <!-- room:e-a -->\n\nA wide cave mouth, breathing warm air.') && em.text.includes('## 2. Glow Pool <!-- room:e-b -->') && em.text.includes('## 3. Hidden Forge <!-- room:e-c -->'));
check('the secret room is listed as secret in the note', /secret-rooms:\n {2}- e-c/.test(em.text));
const emImg = 'Ashfall/Maps/ember-hollow/level-1-' + sha(pics.e1).slice(0, 8) + '.png';
const got = await api('read', emImg);
check('the picture was fetched by the server, checked and stored under Maps', got.status === 200 && Buffer.from(await got.arrayBuffer()).equals(pics.e1));
const emMap = await note('Ember Hollow');
const mapNote = await pg.evaluate(() => { const m = window.__dmforge.getIndex().byType.map.find(x => x.fm && x.fm['dmatlas-map'] === 'm-e1'); return m ? { path: m.path, text: window.__dmforge.S.working.get(m.path) } : null; });
check('one map note per level, with the picture, scale in metres and pins linking to the sections', mapNote && /image: level-1-[0-9a-f]{8}\.png/.test(mapNote.text) && /scale: 15\.2 m/.test(mapNote.text) && mapNote.text.includes('[[Ember Hollow#2. Glow Pool]]') && mapNote.text.includes('— secret <!-- room:e-c -->'), mapNote && mapNote.text);
check('both notes are ordinary unpushed changes', (await count()) === 2);
check('a Dungeons category appeared in the sidebar', (await S(() => !!window.__dmforge.S.mapping.Dungeons)));

/* ---- a two-level dungeon ---- */
const t2 = await importOne('d-rift');
const rk = await note('Rift Keep');
const heads = rk.text.split('\n').filter(l => /^#{1,2}\s/.test(l));
check('levels are grouped in order with the room markers unchanged', heads.join('|') === '# Rift Keep|# Level 1 <!-- dmatlas:level:m-r1 -->|## 1.1. Gate <!-- room:r-a -->|## 1.2. Hall <!-- room:r-b -->|# Level 2 <!-- dmatlas:level:m-r2 -->|## 2.1. Pit <!-- room:r-d -->|## 2.2. Secret Shrine <!-- room:r-e -->', heads.join('|'));
const rkMaps = await pg.evaluate(() => window.__dmforge.getIndex().byType.map.filter(x => x.fm && x.fm.dmatlas === 'd-rift').map(x => x.fm['dmatlas-level']).sort());
check('one map per level', rkMaps.join() === 'Level 1,Level 2', rkMaps.join());
check('both pictures are on the server', (await api('read', 'Ashfall/Maps/rift-keep/level-1-' + sha(pics.r1).slice(0, 8) + '.png')).status === 200 && (await api('read', 'Ashfall/Maps/rift-keep/level-2-' + sha(pics.r2).slice(0, 8) + '.png')).status === 200);
await push();
check('after a push everything is in the database', (await api('read', 'Ashfall/Dungeons/Rift Keep.md')).status === 200 && (await api('read', 'Ashfall/Dungeons/Ember Hollow.md')).status === 200);

/* ---- importing again with nothing changed ---- */
const imageHits = () => atlas.hits.filter(h => h.includes('/image/')).length;
const hitsBefore = imageHits();
await openDialog();
check('the dialog now says they are imported', (await pg.textContent('#atlasList')).includes('Imported'));
await pg.click('[data-atlas-pick="d-ember"]'); await pg.waitForSelector('#atlasPlan');
check('a re-import of an unchanged dungeon says nothing changed and offers nothing', (await pg.textContent('#atlasPlanText')).includes('Nothing has changed') && (await pg.isDisabled('#atlasGo')));
check('and no picture would be downloaded again', (await pg.textContent('#atlasPlan')).includes('nothing to download'));
await pg.click('.modal .btn:has-text("Close"), #atlasBack').catch(() => {}); await pg.keyboard.press('Escape'); await sleep(300);
if (await pg.locator('.modal').count()) await pg.evaluate(() => window.__dmforge.S.dialog = null);
await pg.evaluate(() => window.__dmforge.emit());
check('no changes were staged', (await count()) === 0);
check('the server did not fetch any picture again', imageHits() === hitsBefore);

/* ---- your prose stays when DMAtlas moves a room; a rename changes only the heading ---- */
await pg.evaluate(() => { const A = window.__dmforge; const n = A.getIndex().notes.find(x => x.name === 'Ember Hollow'); A.S.working.setText(n.path, A.S.working.get(n.path).replace('A wide cave mouth, breathing warm air.', 'MY WORDS: the mouth smells of ash.\n\n### My trap\nPit behind the stalagmite.')); A.touch(); });
await push();
atlas.dungeons['d-ember'].levels[0].rooms[0].x = 33.3; atlas.dungeons['d-ember'].levels[0].rooms[0].y = 66.6; atlas.dungeons['d-ember'].publishedAt = 'later';
await importOne('d-ember');
const afterMove = await note('Ember Hollow');
check('a moved room moves its pin and leaves the prose alone', afterMove.text.includes('MY WORDS: the mouth smells of ash.') && afterMove.text.includes('### My trap\nPit behind the stalagmite.'));
const movedMap = await pg.evaluate(() => { const m = window.__dmforge.getIndex().byType.map.find(x => x.fm && x.fm['dmatlas-map'] === 'm-e1'); return window.__dmforge.S.working.get(m.path); });
check('and the pin is at the new place', movedMap.includes('- 33.3, 66.6 — [[Ember Hollow#1. Mouth]]'));
check('the note itself was not even changed', (await count()) === 1);
await push();
atlas.dungeons['d-ember'].levels[0].rooms[1].name = 'Glowing Pool';
const before = (await note('Ember Hollow')).text.split('\n');
await importOne('d-ember');
const after = (await note('Ember Hollow')).text.split('\n');
const diffs = before.map((l, i) => [l, after[i]]).filter(([a, c]) => a !== c);
check('renaming a room changes only its heading line', after.length === before.length && diffs.length === 1 && diffs[0][1] === '## 2. Glowing Pool <!-- room:e-b -->', JSON.stringify(diffs));
await push();

/* ---- pins open their section, and the anchor survives a save and a reload ---- */
const mapPath = await pg.evaluate(() => window.__dmforge.getIndex().byType.map.find(x => x.fm && x.fm['dmatlas-map'] === 'm-e1').fm.image);
const savedMap = await (await api('read', 'Ashfall/Maps/ember-hollow/level-1.md')).text();
check('the heading anchors are in the saved map note', savedMap.includes('[[Ember Hollow#2. Glowing Pool]]') && savedMap.includes('<!-- room:e-b -->'), savedMap);
await pg.reload(); await pg.waitForSelector('.sidebar');
await pg.evaluate(img => window.__dmforge.A.openAssetTab(img), 'Ashfall/Maps/ember-hollow/' + mapPath);
await pg.waitForSelector('.map-pin[data-pin="2. Glowing Pool"]');
check('a pin on the map is named for its room', (await pg.locator('.map-pin').count()) === 3);
await pg.click('.map-pin[data-pin="2. Glowing Pool"]');
await pg.waitForSelector('#mapCard');
check('its card names the room and offers to open it', (await pg.textContent('#mapCard')).includes('2. Glowing Pool') && (await pg.textContent('#mapOpenPlace')) === 'Open the room');
await pg.evaluate(() => { const St = window.__dmforge.S; let v = St.jump; window.__jumps = []; Object.defineProperty(St, 'jump', { get: () => v, set: x => { if (x) window.__jumps.push({ path: x.path, line: x.line }); v = x; }, configurable: true }); });
await pg.click('#mapOpenPlace'); await sleep(500);
const bodyNow = await pg.evaluate(() => window.__dmforge.getIndex().byPath.get('Ashfall/Dungeons/Ember Hollow.md').body);
const wantLine = bodyNow.split('\n').findIndex(l => l.startsWith('## 2. Glowing Pool'));
const j1 = await S(() => ({ sel: window.__dmforge.S.selected, jumps: window.__jumps }));
check('opening the pin opens the dungeon note at exactly that section', j1.sel === 'Ashfall/Dungeons/Ember Hollow.md' && wantLine > 0 && j1.jumps.length === 1 && j1.jumps[0].line === wantLine && j1.jumps[0].path === 'Ashfall/Dungeons/Ember Hollow.md', JSON.stringify({ j1, wantLine }));
// and a double-click on the pin does the same, straight from the map
await pg.evaluate(img => window.__dmforge.A.openAssetTab(img), 'Ashfall/Maps/ember-hollow/' + mapPath);
await pg.waitForSelector('.map-pin[data-pin="1. Mouth"]');
await pg.evaluate(() => { window.__jumps.length = 0; });
await pg.dblclick('.map-pin[data-pin="1. Mouth"]'); await sleep(500);
const want1 = bodyNow.split('\n').findIndex(l => l.startsWith('## 1. Mouth'));
const j2 = await S(() => window.__jumps);
check('double-clicking a pin opens its section too', j2.length >= 1 && j2[j2.length - 1].line === want1, JSON.stringify({ j2, want1 }));

/* ---- player-safe ---- */
await pg.evaluate(p => window.__dmforge.A.goto(p), 'Ashfall/Dungeons/Ember Hollow.md');
await pg.evaluate(() => { window.__dmforge.S.dialog = { kind: 'playersafe', path: 'Ashfall/Dungeons/Ember Hollow.md' }; window.__dmforge.emit(); });
await pg.waitForSelector('#psSummary');
const safe = await pg.inputValue('#psText');
check('the player-safe copy of the dungeon has no secret room, section or marker', !safe.includes('Hidden Forge') && !safe.includes('still hot') && !safe.includes('room:') && safe.includes('Mouth') && safe.includes('Glowing Pool'), safe);
await pg.evaluate(() => { window.__dmforge.S.dialog = null; window.__dmforge.emit(); });
await pg.evaluate(() => { window.__dmforge.S.dialog = { kind: 'playersafe', path: window.__dmforge.getIndex().byType.map.find(x => x.fm && x.fm['dmatlas-map'] === 'm-e1').path }; window.__dmforge.emit(); });
await pg.waitForSelector('#psSummary');
const safeMap = await pg.inputValue('#psText');
const safeSummary = await pg.textContent('#psSummary');
check('and the player-safe map has no secret pin', !safeMap.includes('Hidden Forge') && safeMap.includes('Glowing Pool') && /secret map pin/.test(safeSummary), safeMap + safeSummary);
await pg.evaluate(() => { window.__dmforge.S.dialog = null; window.__dmforge.emit(); });

/* ---- DMAtlas switched off: a clear message and nothing changes ---- */
atlas.down = true;
const stagedBefore = await count();
await pg.evaluate(() => window.__dmforge.A.setSection('map')); await pg.click('#atlasBtn'); await pg.waitForSelector('#atlasError');
const errText = await pg.textContent('#atlasErrorText');
check('with DMAtlas down the dialog says so and says what to check', /DMAtlas/.test(errText) && /(answered 500|Cannot reach)/.test(errText), errText);
check('nothing was changed', (await count()) === stagedBefore);
atlas.down = false;
await pg.click('#atlasRetry'); await pg.waitForSelector('#atlasList');
check('Try again works once it is back', (await pg.locator('#atlasList [data-atlas]').count()) === 2);
await pg.evaluate(() => { window.__dmforge.S.dialog = null; window.__dmforge.emit(); });

/* ---- a changed picture: the new one is stored, the old one stays, the map follows ---- */
const oldImg = 'Ashfall/Maps/ember-hollow/level-1-' + sha(pics.e1).slice(0, 8) + '.png';
const newImg = 'Ashfall/Maps/ember-hollow/level-1-' + sha(pics.e2).slice(0, 8) + '.png';
atlas.dungeons['d-ember'].levels[0].image = { ...atlas.dungeons['d-ember'].levels[0].image, sha256: sha(pics.e2), bytes: pics.e2.length };
const hitsPic = imageHits();
await importOne('d-ember');
check('the new picture was fetched once and stored beside the old one, which is kept', imageHits() === hitsPic + 1 && (await api('read', newImg)).status === 200 && (await api('read', oldImg)).status === 200);
const swapped = await pg.evaluate(() => { const m = window.__dmforge.getIndex().byType.map.find(x => x.fm && x.fm['dmatlas-map'] === 'm-e1'); return window.__dmforge.S.working.get(m.path); });
check('the map note now uses the new picture, and its pins are untouched', swapped.includes('image: level-1-' + sha(pics.e2).slice(0, 8) + '.png') && swapped.includes('![[level-1-' + sha(pics.e2).slice(0, 8) + '.png]]') && swapped.includes('[[Ember Hollow#1. Mouth]]'));
await push();

/* ---- every import is undoable ---- */
atlas.dungeons['d-rift'].levels.find(l => l.mapId === 'm-r2').rooms.push(rm('r-z', '2.3', 'Armoury', 90, 90, false, 'Racks of rusted spears.'));
const rkBefore = await (await api('read', 'Ashfall/Dungeons/Rift Keep.md')).text();
await importOne('d-rift');
await push();
const rkAfter = await (await api('read', 'Ashfall/Dungeons/Rift Keep.md')).text();
check('a re-import adds the new room (with its starter text) when pushed', rkAfter.includes('## 2.3. Armoury <!-- room:r-z -->') && rkAfter.includes('Racks of rusted spears.') && rkAfter.includes('Cold stone.'));
const undone = await (await api('undo-push', '', { method: 'POST', body: '{}' })).json();
check('Undo last push puts the dungeon note and its map back as they were', (undone.conflicts || []).length === 0 && (await (await api('read', 'Ashfall/Dungeons/Rift Keep.md')).text()) === rkBefore);

/* ---- a first import can be undone too: the new notes go to the trash ---- */
atlas.dungeons['d-new'] = { format: 'dmatlas-forge/1', id: 'd-new', name: 'Mossy Crypt', publishedAt: 't', levels: [lvl('m-n1', 'Level 1', 0, 'r1', [rm('n-a', '1', 'Door', 5, 5)])] };
await importOne('d-new');
await push();
check('a brand new dungeon is pushed', (await api('read', 'Ashfall/Dungeons/Mossy Crypt.md')).status === 200);
await api('undo-push', '', { method: 'POST', body: '{}' });
check('and undoing that push takes the new notes away again', (await api('read', 'Ashfall/Dungeons/Mossy Crypt.md')).status === 404 && (await (await api('trash-list', '')).json()).some(t => t.path.endsWith('Mossy Crypt.md')));
check('no page errors', errs.length === 0, errs.join('\n'));
await b.close(); proc.kill(); atlasSrv.close();
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
