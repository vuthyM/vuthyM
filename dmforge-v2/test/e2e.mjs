import { chromium } from '../../jsd/node_modules/playwright-core/index.mjs';
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url'; import http from 'node:http';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'DM-Forge.html');
const shots = process.env.SHOTS || '';
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(dist)); }).listen(8770);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'], env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const results = [];
const check = (name, cond, extra) => { results.push({ name, ok: !!cond, extra }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const openGen = async (pg, name) => {
  await pg.click('.nav-btn:has-text("Generate")');
  await pg.waitForSelector('#genHome, #genFind');
  if (await pg.locator('#genHome').count()) await pg.click('#genHome');
  await pg.fill('#genFind', name);
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('[data-gen]');
};

async function newPage(scheme = 'light', w = 1360, h = 900) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8770' }).catch(() => {});
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.on('pageerror', e => pg.errors.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_/.test(m.text())) pg.errors.push('console: ' + m.text()); });
  await pg.goto('http://localhost:8770/');
  return pg;
}
const S = pg => pg.evaluate(() => ({ pending: window.__dmforge.S.working.count, screen: window.__dmforge.S.screen, section: window.__dmforge.S.section }));
const vaultText = (pg, p) => pg.evaluate(async p => window.__dmforge.S.vault.readText(p), p);

/* ================= demo vault flow ================= */
let pg = await newPage('light');
check('welcome screen renders', await pg.locator('text=Open vault folder').count() === 1);
await pg.evaluate(() => window.__dmforge.A.openPlainDemo());
await pg.waitForSelector('text=What is in');
const mapRows = await pg.$$eval('table tbody tr', rs => rs.map(r => r.querySelector('td strong').textContent + '=' + r.querySelector('select').value));
check('folders auto-mapped from their names', ['NPCs=npc', 'Players=player', 'Locations=location', 'Factions=faction', 'Plot Threads=plot', 'Sessions=session', 'Maps=map'].every(x => mapRows.includes(x)), JSON.stringify(mapRows));
if (shots) await pg.screenshot({ path: shots + '/01-mapping.png' });
await pg.click('text=Looks good');
await pg.waitForSelector('.sidebar');
check('overview shows campaign + counts', (await pg.textContent('#overviewTitle')).length > 0 && (await pg.textContent('.content')).includes('Greenhold'));
const threadsCard = await pg.textContent('.card:has(h3:text-is("Active plot threads"))');
check('active plot threads listed', threadsCard.includes('The Missing Bells') && !threadsCard.includes('Who Poisoned the Well'), threadsCard);
check('the practice campaign says so, and nothing is saved', (await pg.textContent('#startCard')).includes('practice campaign') && (await pg.textContent('#startCard')).includes('Nothing you do here is saved') && await pg.locator('#startSample').count() === 0);
check('and offers the tour and the session zero kit', await pg.locator('#startTour').count() === 1 && await pg.locator('#startKit').count() === 1);
if (shots) await pg.screenshot({ path: shots + '/02-overview.png' });

// NPC detail with properties, markdown, wikilinks, backlinks
await pg.click('.nav-btn:has-text("NPCs")');
await pg.click('.list-item:has-text("Mireille Vane")');
let detail = await pg.textContent('.card');
check('NPC properties from front matter', detail.includes('Half-elf') && detail.includes('Innkeeper') && detail.includes('Greenhold') && detail.includes('Ember Court'));
await pg.waitForSelector('.md a.wl');
check('wikilinks rendered as links', await pg.locator('.md a.wl').count() >= 3);
if (shots) await pg.screenshot({ path: shots + '/03-npc.png' });
await pg.click('.md a.wl:has-text("Brother Calder")');
await pg.waitForSelector('h2:has-text("Brother Calder")');
detail = await pg.textContent('.card');
check('note without front matter still shows race/role (inline fields)', detail.includes('Human') && detail.includes('Priest of the Quiet Flame'), detail.slice(0, 200));
check('backlinks shown', detail.includes('Mentioned in') && detail.includes('Mireille Vane'));

// players via inline fields
await pg.click('.nav-btn:has-text("Players")');
await pg.click('.list-item:has-text("Sorrel Vance")');
detail = await pg.textContent('.card');
check('inline Dataview fields read for players', detail.includes('Wizard') && detail.includes('31'), detail.slice(0, 200));

// search
await pg.fill('.search-wrap input', 'bells');
await pg.waitForSelector('.search-hit');
check('search finds the plot thread first', (await pg.textContent('.search-hit')).includes('The Missing Bells'));
await pg.keyboard.press('Enter');
await pg.waitForSelector('h2:has-text("The Missing Bells")');

// edit: change a property and body text, stage, review, push
await pg.click('.nav-btn:has-text("NPCs")');
await pg.click('.list-item:has-text("Old Tam")');
await pg.click('.note-head button:text-is("Edit")');
await pg.fill('.card input >> nth=0', 'Human');
await pg.fill('textarea >> nth=0', 'Rows the river crossing. Now suspicious of [[Brother Calder]].\n');
await pg.click('text=Save to pending changes');
check('edit stages one pending change', (await S(pg)).pending === 1);
check('push button shows the count', (await pg.textContent('#pushBtn')).includes('Push 1 change'));
check('vault untouched before push', !(await vaultText(pg, 'Ashfall/NPCs/Old Tam.md')).includes('race: Human'));
await pg.click('#pushBtn');
await pg.waitForSelector('.rev-row');
const reviewText = await pg.textContent('.modal');
check('review lists the edited note by path', reviewText.includes('Edited') && reviewText.includes('NPCs/'), reviewText.slice(0, 200));
check('review shows no note content or diff', !reviewText.includes('race: Human') && !reviewText.includes('role: Ferryman') && await pg.locator('.diff').count() === 0);
await pg.click('#confirmPush');
await pg.waitForSelector('text=Pushed to your vault');
const tam = await vaultText(pg, 'Ashfall/NPCs/Old Tam.md');
check('push wrote the file', tam.includes('race: Human') && tam.includes('role: Ferryman') && tam.includes('suspicious of [[Brother Calder]]'), tam);
await pg.click('text=Done');
check('pending cleared after push', (await S(pg)).pending === 0);

// create NPC
await pg.click('.nav-btn:has-text("NPCs")');
await pg.click('button:has-text("+ New npc")');
await pg.fill('.modal input >> nth=0', 'Harlow the Ratcatcher');
await pg.click('.modal button:has-text("Create")');
await pg.waitForSelector('h2:has-text("Harlow the Ratcatcher")');
check('new note is pending', (await S(pg)).pending === 1);

// generator: roll, lock, save as note
await openGen(pg, 'NPC');
const before = await pg.textContent('[data-gen="npc"] [data-part="title"]');
await pg.click('[data-gen="npc"] button[aria-label="Lock Name"]');
await pg.click('#genRoll');
check('a locked name survives Roll again', (await pg.textContent('[data-gen="npc"] [data-part="title"]')) === before);
const genName = before;
await pg.click('[data-gen="npc"] button:has-text("Save to campaign")');
await pg.waitForSelector('.modal');
check('save dialog defaults to NPC with generated name', (await pg.inputValue('#sgName')) === genName);
await pg.click('.modal button:has-text("Save")');
await pg.waitForSelector('.card h2');
check('generated NPC became a pending note', (await S(pg)).pending === 2);
// riddle reveal + dice
await openGen(pg, 'Riddle');
await pg.click('[data-gen="riddle"] button:has-text("Reveal answer")');
check('riddle answer reveals', (await pg.textContent('[data-gen="riddle"]')).includes('Answer') && !(await pg.textContent('[data-gen="riddle"]')).includes('Reveal answer'));
await pg.click('#genHome'); await pg.click('#genTools');
await pg.click('[data-gen="dice"] button[data-expr="d20"]');
const total = Number(await pg.textContent('#diceTotal'));
check('dice roll shows a result', total >= 1 && total <= 20);

// generator -> session prep
await openGen(pg, 'Tavern');
await pg.click('[data-gen="tavern"] button:has-text("Save to campaign")');
await pg.click('input[data-kind="location"]');
await pg.click('#sgPrep');
await pg.click('#sgSave');
await pg.waitForSelector('h2:has-text("Session 12")');
check('tavern appended to the latest session Prep', (await pg.textContent('.md')).includes('Tavern'));

// combat
await pg.click('.nav-btn:has-text("Combat")');
await pg.click('button:has-text("Start combat")');
await pg.click('button:has-text("Add the party")');
check('party added with rolled initiative', (await pg.$$('.c-row')).length === 3);
await pg.click('#addTabCustom'); await pg.fill('.card input[placeholder="Goblin"]', 'Goblin');
await pg.fill('.card input[type=number] >> nth=0', '3');
await pg.click('.card button:has-text("Add"):not(:has-text("party"))');
check('3 goblins added', (await pg.$$('.c-row')).length === 6);
const kestraHp = await pg.textContent('.c-row:has-text("Kestra") .c-hp .mono');
check('PC hit points come from the Players note', kestraHp.trim() === '38/38', kestraHp);
await pg.fill('.c-row:has-text("Goblin 1") input[placeholder="amt"]', '20');
await pg.click('.c-row:has-text("Goblin 1") button:has-text("Damage")');
const g1t = await pg.textContent('.c-row:has-text("Goblin 1")');
check('goblin goes down', g1t.includes('Down'), g1t.slice(0, 80) + ' | rows=' + (await pg.$$eval('.c-row', rs => rs.map(r => r.querySelector('.c-name').textContent.slice(0, 12)).join(','))));
const r1 = await pg.textContent('.round-badge');
for (let i = 0; i < 6; i++) await pg.click('#nextTurn');
check('rounds advance', Number(await pg.textContent('.round-badge')) > Number(r1));
await pg.click('button:has-text("End combat")');
await pg.click('.modal button:has-text("End combat")');
await pg.waitForSelector('h2:has-text("Session 12")');
const bodyTxt = await pg.textContent('.md');
check('combat summary logged into the session note', bodyTxt.includes('Combat') && bodyTxt.includes('Defeated') && bodyTxt.includes('Goblin 1'), bodyTxt.slice(-300));
if (shots) await pg.screenshot({ path: shots + '/04-session-combat.png' });

// maps
await pg.click('.nav-btn:has-text("Maps")');
await pg.waitForSelector('.thumb img[src^="blob:"]');
check('map image loads from the vault', true);
await pg.click('.thumb');
await pg.waitForSelector('.lightbox img[src^="blob:"]');
await pg.keyboard.press('Escape');

// conflict: someone edits a note in Obsidian while we have pending changes
await pg.click('.nav-btn:has-text("Players")');
await pg.click('.list-item:has-text("Kestra Dune")');
await pg.click('.note-head button:text-is("Edit")');
await pg.fill('.card input >> nth=1', 'Assassin');
await pg.evaluate(() => { window.__dmforge.emit(); window.__dmforge.toast('unrelated toast'); });
await new Promise(r => setTimeout(r, 150));
check('typing survives an app-wide update (toast, etc.)', (await pg.inputValue('.card input >> nth=1')) === 'Assassin');
await pg.click('text=Save to pending changes');
check('edit saved after an app-wide update', await pg.evaluate(() => window.__dmforge.S.working.list().some(e => e.path.includes('Kestra'))));
await pg.evaluate(() => { const v = window.__dmforge.S.vault; return v.readText('Ashfall/Players/Kestra Dune.md').then(t => v.externalEdit('Ashfall/Players/Kestra Dune.md', t + '\nEdited in Obsidian during the session.\n')); });
await pg.click('#pushBtn');
await pg.waitForSelector('.rev-row');
await pg.waitForSelector('.rev-conflict');
check('external edit flagged as a conflict', (await pg.textContent('.rev-conflict')).includes('Changed in your vault'));
check('push disabled until the conflict is decided', await pg.isDisabled('#confirmPush'));
if (shots) await pg.screenshot({ path: shots + '/05-review.png' });
await pg.click('.rev-conflict label:has-text("Keep the vault")');
await pg.waitForFunction(() => !document.querySelector('#confirmPush').disabled);
await pg.click('#confirmPush');
await pg.waitForSelector('text=Pushed to your vault');
const kestra = await vaultText(pg, 'Ashfall/Players/Kestra Dune.md');
check('keeping the vault version preserved the Obsidian edit', kestra.includes('Edited in Obsidian') && !kestra.includes('Assassin'));
await pg.click('text=Done');
check('one push wrote everything else and the conflict item was resolved', (await S(pg)).pending === 0);
const sess2 = await vaultText(pg, 'Ashfall/Sessions/2026-10-12 Session 12.md');
check('session note has prep + combat block, recap intact', /^> \[!\w+\]- Tavern/m.test(sess2) && sess2.includes('<!-- dmforge:combat-') && sess2.includes('## Recap') && sess2.includes('Ferried upriver'));
check('generated NPC written to NPCs folder', await pg.evaluate(async n => window.__dmforge.S.vault.exists('Ashfall/NPCs/' + n + '.md'), genName));
check('created NPC written', await pg.evaluate(async () => window.__dmforge.S.vault.exists('Ashfall/NPCs/Harlow the Ratcatcher.md')));
// create a brand-new campaign from the folder browser
await pg.click('#campMenuBtn'); await pg.click('#campSwitch');
await pg.waitForSelector('.dir-row:has-text("Ashfall")');
check('switching campaign returns to the folder browser', (await pg.textContent('.dir-list')).includes('Ashfall'));
await pg.fill('input[aria-label="New campaign name"]', 'Brightwater');
await pg.click('button:has-text("Create campaign folder")');
await pg.waitForSelector('text=What is in');
const m3 = await pg.$$eval('table tbody tr', rs => rs.map(r => r.querySelector('td strong').textContent + '=' + r.querySelector('select').value));
check('new campaign comes with the standard folders, mapped', m3.length === 7 && m3.includes('NPCs=npc') && m3.includes('Plot Threads=plot') && m3.includes('Sessions=session'), JSON.stringify(m3));
await pg.click('text=Looks good');
await pg.waitForSelector('.sidebar');
check('new campaign opens empty', (await pg.textContent('.page-head')).includes('Brightwater') && (await pg.textContent('.nav-btn:has-text("NPCs")')).includes('0'));
await pg.click('.nav-btn:has-text("NPCs")');
check('button label uses the proper name', (await pg.textContent('.page-head')).includes('+ New NPC'));
await pg.click('button:has-text("+ New NPC")');
await pg.fill('.modal input >> nth=0', 'Test Hero');
await pg.click('.modal button:has-text("Create")');
await pg.waitForSelector('h2:has-text("Test Hero")');
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
check('campaign index note and first NPC are in the vault', await pg.evaluate(async () => { const v = window.__dmforge.S.vault; return (await v.exists('Brightwater/Brightwater.md')) && (await v.exists('Brightwater/NPCs/Test Hero.md')); }));
check('no page errors (demo flow)', pg.errors.length === 0, pg.errors.join('\n'));

// restore pending after reload of the page: stage a change, reload, reopen demo
await pg.close();

/* ================= real directory handle (OPFS) through the folder browser ================= */
pg = await newPage('dark');
const setup = await pg.evaluate(async () => {
  const D = window.__dmforge;
  const files = new D.MemoryVault({}).files; // placeholder to keep bundle reference
  const root = await navigator.storage.getDirectory();
  for await (const [n] of root.entries()) await root.removeEntry(n, { recursive: true });
  async function put(p, content) {
    const parts = p.split('/'); let d = root;
    for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create: true });
    const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
    const w = await fh.createWritable(); await w.write(content); await w.close();
  }
  await put('My Vault Notes/Campaigns/Cinders/NPCs/Ash Warden.md', '---\nrole: Warden\n---\nGuards the ash gate. Friend of [[Mira]].\n');
  await put('My Vault Notes/Campaigns/Cinders/NPCs/Mira.md', '# Mira\n\nRace:: Elf\n');
  await put('My Vault Notes/Campaigns/Cinders/Sessions/Session 1.md', '# Session 1\n\n## Recap\nThey arrived.\n');
  await put('My Vault Notes/Campaigns/Cinders/Lore/Founding.md', 'Old story.\n');
  await put('My Vault Notes/Other Stuff/Groceries.md', 'milk\n');
  await put('My Vault Notes/Campaigns/Cinders/NPCs/Windows Wanda.md', '---\r\nrole: Smith\r\n---\r\n# Windows Wanda\r\n\r\nLine one\r\nLine two\r\n');
  D.startVault(new D.FsaVault(root));
  return true;
});
await pg.waitForSelector('.dir-list');
await pg.click('.dir-row:has-text("My Vault Notes")');
await pg.click('.dir-row:has-text("Campaigns")');
await pg.click('.dir-row:has-text("Cinders")');
await pg.waitForSelector('text=Use “Cinders” as the campaign');
if (shots) await pg.screenshot({ path: shots + '/06-browse.png' });
await pg.click('text=Use “Cinders” as the campaign');
await pg.waitForSelector('text=What is in');
const m2 = await pg.$$eval('table tbody tr', rs => rs.map(r => r.querySelector('td strong').textContent + '=' + r.querySelector('select').value));
check('unknown folder defaults to Other notes', m2.includes('Lore=other') && m2.includes('NPCs=npc'), JSON.stringify(m2));
await pg.click('text=Looks good');
await pg.waitForSelector('.sidebar');
await pg.click('.nav-btn:has-text("Other notes")');
check('unrecognised folder notes listed', (await pg.textContent('.list')).includes('Founding'));
await pg.click('.nav-btn:has-text("NPCs")');
await pg.click('.list-item:has-text("Ash Warden")');
check('real folder: note and wikilink load', await pg.locator('.md a.wl:has-text("Mira")').count() === 1);
await pg.click('.note-head button:text-is("Edit")');
await pg.fill('.card input >> nth=0', 'Dwarf');
await pg.click('text=Save to pending changes');
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
const onDisk = await pg.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const d = await (await (await root.getDirectoryHandle('My Vault Notes')).getDirectoryHandle('Campaigns')).getDirectoryHandle('Cinders');
  const n = await d.getDirectoryHandle('NPCs'); const f = await (await n.getFileHandle('Ash Warden.md')).getFile(); return f.text();
});
check('real folder: file on disk updated minimally', onDisk === '---\nrole: Warden\nrace: Dwarf\n---\nGuards the ash gate. Friend of [[Mira]].\n', JSON.stringify(onDisk));
// a Windows-style (CRLF) note: property edit keeps every line ending; a body edit keeps CRLF
await pg.click('.nav-btn:has-text("NPCs")');
await pg.click('.list-item:has-text("Windows Wanda")');
await pg.click('.note-head button:text-is("Edit")');
await pg.fill('.card input >> nth=0', 'Dwarf');
await pg.click('text=Save to pending changes');
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
const readOpfs = name => pg.evaluate(async n => {
  const root = await navigator.storage.getDirectory();
  const d = await (await (await (await root.getDirectoryHandle('My Vault Notes')).getDirectoryHandle('Campaigns')).getDirectoryHandle('Cinders')).getDirectoryHandle('NPCs');
  return (await (await d.getFileHandle(n)).getFile()).text();
}, name);
check('CRLF note: property edit leaves body bytes untouched', (await readOpfs('Windows Wanda.md')) === '---\r\nrole: Smith\r\nrace: Dwarf\r\n---\r\n# Windows Wanda\r\n\r\nLine one\r\nLine two\r\n', JSON.stringify(await readOpfs('Windows Wanda.md')));
await pg.click('.note-head button:text-is("Edit")');
await pg.fill('textarea >> nth=0', '# Windows Wanda\n\nLine one\nLine 2\n');
await pg.click('text=Save to pending changes');
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
check('CRLF note: body edit keeps CRLF line endings', (await readOpfs('Windows Wanda.md')) === '---\r\nrole: Smith\r\nrace: Dwarf\r\n---\r\n# Windows Wanda\r\n\r\nLine one\r\nLine 2\r\n', JSON.stringify(await readOpfs('Windows Wanda.md')));
check('duplicate title heading is not shown twice', (await pg.locator('.card h2', { hasText: 'Windows Wanda' }).count()) === 1);
// new item note creates a brand-new folder; delete moves to .trash
await pg.click('.nav-btn:has-text("NPCs")');
await pg.click('.list-item:has-text("Mira")');
await pg.click('#deleteBtn'); await pg.click('.modal button:has-text("Delete note")');
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush'); await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done');
const trashed = await pg.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  try { await (await root.getDirectoryHandle('.trash')); return true; } catch (e) { return false; }
});
check('real folder: deleted note moved to .trash', trashed);
// persistence of unpushed work across a page reload
await pg.click('.nav-btn:has-text("Sessions")');
await pg.click('.list-item >> nth=0');
await pg.click('.note-head button:text-is("Edit")');
await pg.fill('textarea >> nth=0', '# Session 1\n\n## Recap\nThey arrived, and then left.\n');
await pg.click('text=Save to pending changes');
await new Promise(r => setTimeout(r, 700));
const saved = await pg.evaluate(async () => new Promise(res => { const r = indexedDB.open('dmforge', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').getAll(); q.onsuccess = () => res(q.result.length); }; }));
check('unpushed changes autosaved in the browser', saved >= 1, saved);
check('no page errors (real folder flow)', pg.errors.length === 0, pg.errors.join('\n'));
if (shots) await pg.screenshot({ path: shots + '/07-dark.png' });
await pg.close();

/* ================= inspector ================= */
pg = await newPage('light');
await pg.click('text=Inspect a vault');
await pg.click('text=Try it on the demo vault');
await pg.waitForSelector('textarea.report');
const rep = await pg.inputValue('textarea.report');
check('inspector report generated', rep.includes('DM FORGE VAULT REPORT') && rep.includes('NPCs/') && !rep.includes('Mireille'));
check('no page errors (inspector)', pg.errors.length === 0, pg.errors.join('\n'));
await pg.close();

await b.close(); srv.close();
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
