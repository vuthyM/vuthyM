/* The campaign snapshot, end to end: a real helper on a real folder, with a stand-in for Claude Code. */
import { chromium } from '../../jsd/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-snap-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));

/* the stand-in for Claude Code: it answers each kind of question, and keeps every question it was asked */
const log = path.join(tmp, 'last.txt');
const calls = path.join(tmp, 'calls.txt');
const fake = path.join(tmp, 'claude');
fs.writeFileSync(fake, `#!/bin/bash
if [ "$1" = "--version" ]; then echo "9.9.9 (Fake Claude)"; exit 0; fi
if [ "$1" = "auth" ]; then echo '{"loggedIn": true}'; exit 0; fi
cat > "${log}"
{ echo "=====CALL====="; cat "${log}"; } >> "${calls}"
sleep 1.2
if grep -q "FAIL-SNAPSHOT" "${log}"; then echo "Something went wrong inside Claude" >&2; exit 1; fi
if grep -q "GARBAGE-SNAPSHOT" "${log}"; then echo "I could not do that, sorry."; exit 0; fi
if grep -q "partial snapshots" "${log}"; then
  printf '## Premise and tone\\nMERGED: a slow-burning mystery.\\n\\n## Where the story is now\\nMerged.\\n\\n## Open threads\\n- merged\\n\\n## Factions\\n- merged\\n\\n## Key people\\n- merged\\n\\n## Places\\n- merged\\n\\n## Recent sessions\\n- merged\\n\\n## Secrets (DM only)\\nMerged secrets.\\n'
elif grep -q "campaign snapshot" "${log}"; then
  printf 'Here is the snapshot:\\n\\n## Premise and tone\\nA slow-burning mystery in Greenhold, where the temple bells went missing. Tone: grief and quiet bargains.\\n\\n## Where the story is now\\nThe party has just reached the river crossing.\\n\\n## Open threads\\n- The missing bells\\n\\n## Factions\\n- **[[Cinder Crown]]** runs the inn\\n\\n## Key people\\n- **[[Kestra Dune]]** the ferrywoman\\n\\n## Places\\n- **[[Greenhold]]**\\n\\n## Recent sessions\\n- Session 12: the ferry\\n'
  if grep -q "## Secrets (DM only)" "${log}"; then printf '\\n## Secrets (DM only)\\nThe ferrywoman took the bells herself.\\n'; fi
else
  echo '{"quirk": ["Hums an old lullaby", "Counts the bells under their breath"], "voice": ["Speaks softly"], "wants": ["To find the bells"]}'
fi
`, { mode: 0o755 });

const PORT = 8795;
const proc = spawn('python3', [path.join(app, 'dmforge-server.py'), vault, '--port', String(PORT), '--no-open', '--no-update'], { env: { ...process.env, DMF_CLAUDE_BIN: fake, DMF_CONFIG_DIR: path.join(tmp, 'cfg') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { proc.kill(); } catch (e) { /* gone */ } });
let out = '';
proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/\?t=/.test(out); i++) await new Promise(r => setTimeout(r, 100));
const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
if (!m) { console.log('helper did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + m[1], token = m[2];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const claudeOnInit = on => ctx.addInitScript(on => { try { if (on) localStorage.setItem('dmforge:claude', 'on'); } catch (e) { /* ignore */ } }, on);
await claudeOnInit(true);
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', e => errors.push(e.message));
pg.on('console', msg => { if (msg.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_/.test(msg.text())) errors.push(msg.text()); });
await pg.goto(base + '/?t=' + token);
await pg.waitForSelector('.dir-list, .sidebar');
if (!(await pg.locator('.sidebar').count())) {
  await pg.click('.dir-row:has-text("Ashfall")');
  await pg.click('text=Use “Ashfall” as the campaign');
  await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
  if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
  await pg.waitForSelector('.sidebar');
}
const SNAP = 'Ashfall/Campaign Snapshot.md';
const get = p => pg.evaluate(p => window.__dmforge.S.working.get(p), p);
const openSettings = async () => { await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="claude"]'); await pg.waitForSelector('#setSnapshot'); };
const closeSettings = async () => { await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage')); };
const waitReady = async () => { await pg.waitForFunction(() => document.querySelector('#jobPill') && /ready/.test(document.querySelector('#jobPill').textContent), null, { timeout: 40000 }); await pg.click('#jobPill'); await pg.waitForSelector('#snapResult'); };
const callsText = () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '');
const nCalls = () => (callsText().match(/=====CALL=====/g) || []).length;
const addNote = (p, text) => pg.evaluate(([p, t]) => { const { S, touch } = window.__dmforge; S.working.create(p, t); touch(); }, [p, text]);
const editNote = (p, extra) => pg.evaluate(([p, e]) => { const { S, touch } = window.__dmforge; S.working.setText(p, S.working.get(p) + e); touch(); }, [p, extra]);
const npcPaths = await pg.evaluate(() => window.__dmforge.S.working.paths().filter(p => /\/NPCs\/.+\.md$/.test(p)));
const sessionPath = await pg.evaluate(() => window.__dmforge.S.working.paths().find(p => /\/Sessions\/.+\.md$/.test(p)));

// 1. before there is one
const sb = await pg.evaluate(() => { const b = document.querySelector('#snapBtn'), l = document.querySelector('#layoutBtn'); if (!b) return null; const a = b.getBoundingClientRect(), c = l.getBoundingClientRect(); return { text: b.textContent.trim(), title: b.title, disabled: b.disabled, dot: !!b.querySelector('.snap-dot'), sameRow: Math.abs(a.top - c.top) < 20, left: a.right <= c.left + 1 }; });
check('the top bar always has a Snapshot button, just left of Layout, usable with Claude on', !!sb && sb.text === 'Snapshot' && !sb.disabled && sb.sameRow && sb.left, JSON.stringify(sb));
check('and it says there is no snapshot yet, with no dot', !!sb && sb.title.includes('No snapshot yet') && !sb.dot);
await pg.click('#snapBtn');
await pg.waitForSelector('#snapFacts');
check('pressing it opens the make-a-snapshot window', (await pg.textContent('#snapSend')).includes('Send to Claude'));
await pg.click('.modal .modal-actions button:has-text("Close")'); await pg.waitForFunction(() => !document.querySelector('.modal'));
await openSettings();
check('Settings has a Campaign snapshot section that says there is none yet', (await pg.textContent('#snapStatus')).includes('No snapshot yet'));
check('"Make a snapshot…" is there and, with Claude on, usable', (await pg.textContent('#snapMake')).includes('Make a snapshot') && !(await pg.isDisabled('#snapMake')));
check('there is no "Open the note" yet', (await pg.locator('#snapOpen').count()) === 0);
await pg.click('#snapMake');
await pg.waitForSelector('#snapFacts');
const facts = await pg.textContent('#snapFacts');
check('the window says how many notes will be read, and that it is one request', /\d+ notes will be read/.test(facts) && facts.includes('One request.'), facts);
check('the secrets box is ticked to begin with', await pg.isChecked('#snapSecrets'));
await pg.click('#snapSent summary');
let prompt = await pg.textContent('#snapPrompt');
check('the question to be sent has the notes (an NPC, a location) and asks for the headings, secrets included', prompt.includes('Kestra') && prompt.includes('Greenhold') && prompt.includes('## Secrets (DM only)') && prompt.includes('1,500 words'), prompt.slice(0, 300));
check('and nothing that DM Forge wrote itself', !prompt.includes('Generator Tables') && !prompt.includes('Campaign Snapshot'));
await pg.uncheck('#snapSecrets');
prompt = await pg.textContent('#snapPrompt');
check('unticking the secrets box takes the Secrets heading out of the question', !prompt.includes('## Secrets (DM only)') && prompt.includes('Leave out anything the players do not know yet'));
await pg.check('#snapSecrets');
const before = nCalls();
await pg.click('#snapSend');
await pg.waitForFunction(() => !document.querySelector('.modal'));
await pg.waitForSelector('#jobPill');
const pill = await pg.evaluate(() => { const a = document.querySelector('#jobPill').getBoundingClientRect(), l = document.querySelector('#layoutBtn').getBoundingClientRect(); return { sameRow: Math.abs(a.top - l.top) < 20, left: a.right <= l.left + 1, spinner: !!document.querySelector('#jobPill .spinner'), text: document.querySelector('#jobPill').textContent }; });
check('Send closes the window and the work carries on in the background: a pill with a spinner appears in the top bar, just left of Layout', pill.sameRow && pill.left && pill.spinner && /Snapshot/.test(pill.text), JSON.stringify(pill));
check('the pill says what it is doing and counts the time', /Reading your notes/.test(pill.text) && /\d:\d\d/.test(pill.text), pill.text);
// DM Forge keeps working while it reads
await pg.click('.nav-btn:has-text("NPCs")');
await pg.click('.pane:not([hidden]) .list-item >> nth=0');
await pg.waitForSelector('.pane:not([hidden]) .note-head');
check('while it is being made the button gives way to the progress pill', (await pg.locator('#snapBtn').count()) === 0 && (await pg.locator('#jobPill').count()) === 1);
check('DM Forge still works while the snapshot is being made (a note opens)', (await pg.locator('.pane:not([hidden]) .note-head h2').count()) === 1 && (await pg.locator('#jobPill .spinner').count()) === 1);
await editNote(npcPaths[0], '\n\nChanged while Claude was reading.');
await pg.click('#askClaudeBtn');
await pg.waitForSelector('#claudeBusy');
check('other Claude buttons say Claude is busy, and cannot send, until it is done', await pg.isDisabled('#claudeSend') && (await pg.textContent('#claudeBusy')).includes('busy making the campaign snapshot'));
await pg.keyboard.press('Escape'); await pg.waitForFunction(() => !document.querySelector('.modal'));
await pg.click('#jobPill');
await pg.waitForSelector('#snapRunning');
check('clicking the pill shows the progress, and lets you close it and keep working', (await pg.textContent('#snapRunning')).includes('keep using DM Forge') && (await pg.locator('#snapHide').count()) === 1);
await pg.click('#snapHide'); await pg.waitForFunction(() => !document.querySelector('.modal'));
await waitReady();
check('one press sent one request', nCalls() - before === 1);
check('and when it is done the pill turns into "ready: review", which opens the answer', true);
const draft = await pg.inputValue('#snapText');
check('the answer is shown to edit, tidied: the chatty first line is gone', draft.startsWith('## Premise and tone') && draft.includes('## Secrets (DM only)') && !draft.includes('Here is the snapshot'), draft.slice(0, 120));
check('nothing is saved until you say so', (await get(SNAP)) === undefined);
await pg.fill('#snapText', draft.replace('quiet bargains', 'quiet bargains and old debts'));
await pg.click('#snapSave');
await pg.waitForFunction(() => !document.querySelector('.modal'));
const note = await get(SNAP);
check('Save writes the note in the campaign folder, with a header and its fingerprints, and the edit kept', !!note && note.startsWith('# Campaign Snapshot') && note.includes('<!-- dmf-snapshot:') && note.includes('old debts') && note.includes('## Secrets (DM only)\nThe ferrywoman took the bells herself.'), String(note).slice(0, 300));
check('it is a pending change like any other', await pg.evaluate(p => window.__dmforge.S.working.list().some(e => e.path === p), SNAP));

// 2. the state it shows
await openSettings();
check('the section says when it was made, and counts the note you changed while it was reading as changed', (await pg.textContent('#snapStatus')).includes('Made today · 1 note changed'), await pg.textContent('#snapStatus'));
check('the pill is gone once it is saved, and the Snapshot button is back', (await pg.locator('#jobPill').count()) === 0 && (await pg.locator('#snapBtn').count()) === 1);
check('with no "worth refreshing" hint', (await pg.locator('#snapHint').count()) === 0);
check('and a button to refresh, and to open the note', (await pg.textContent('#snapMake')).includes('Refresh') && (await pg.locator('#snapOpen').count()) === 1);
await closeSettings();
check('once there is a snapshot the top bar button offers to refresh it', (await pg.getAttribute('#snapBtn', 'title')).includes('Click to refresh') && (await pg.locator('#snapBtn .snap-dot').count()) === 0, await pg.getAttribute('#snapBtn', 'title'));
await editNote(npcPaths[0], '\n\nA new detail.');         // the same note again: still one changed note
await openSettings();
check('after one note is edited it says so, and does not nag', (await pg.textContent('#snapStatus')).includes('1 note changed') && (await pg.locator('#snapHint').count()) === 0, await pg.textContent('#snapStatus'));
await closeSettings();
await editNote(sessionPath, '\n\nAnd then something happened.');
check('when it is worth refreshing the top bar button gets a dot and says so', (await pg.locator('#snapBtn.worth .snap-dot').count()) === 1 && (await pg.getAttribute('#snapBtn', 'title')).includes('Worth refreshing'), await pg.getAttribute('#snapBtn', 'title'));
await openSettings();
check('a changed session note makes it worth refreshing', (await pg.locator('#snapHint').count()) === 1 && (await pg.textContent('#snapHint')).includes('session note'), await pg.textContent('#snapStatus'));
await closeSettings();
await addNote('Ashfall/NPCs/Newcomer.md', '# Newcomer\n\nJust arrived.');
await openSettings();
check('a new note is counted as new', (await pg.textContent('#snapStatus')).includes('1 new'), await pg.textContent('#snapStatus'));
await closeSettings();
// five changes
await pg.evaluate(() => { const { S, touch } = window.__dmforge; const ps = S.working.paths().filter(p => /\/(NPCs|Locations|Players|Factions)\/.+\.md$/.test(p)).slice(0, 6); ps.forEach(p => S.working.setText(p, S.working.get(p) + '\nchanged')); touch(); });
await openSettings();
check('five or more changed notes is worth refreshing, and it says how many', (await pg.textContent('#snapHint')).match(/\d+ of \d+ notes have changed/) !== null, await pg.textContent('#snapHint'));
await closeSettings();

// 3. using it as inspiration
await pg.click('.nav-btn:has-text("Generate")'); await pg.waitForSelector('#genHome, #genFind'); if (await pg.locator('#genHome').count()) await pg.click('#genHome');
await pg.fill('#genFind', 'NPC'); await pg.keyboard.press('Enter'); await pg.waitForSelector('[data-gen="npc"]');
await pg.click('[data-gen="npc"] [data-claude="refill"]'); await pg.waitForSelector('[data-ct-field]');
await pg.click('#ctNone'); await pg.check('[data-ct-field="quirk"]');
check('the refill window offers the snapshot, and uses it to begin with', await pg.isChecked('#ctSrcSnap') && (await pg.textContent('#ctSrcRow')).includes('Made today'));
check('and says the campaign has moved on, as it has', (await pg.locator('#ctStale').count()) === 1);
await pg.click('#ctSent summary');
let ctp = await pg.textContent('#ctPrompt');
check('the question carries the snapshot, with the secrets', ctp.includes('About my campaign') && ctp.includes('slow-burning mystery') && ctp.includes('took the bells herself') && !ctp.includes('dmf-snapshot'), ctp.slice(-900));
check('and not the names-and-first-lines list', !ctp.includes('Overview of the campaign'));
await pg.uncheck('#ctSecrets');
ctp = await pg.textContent('#ctPrompt');
check('"Include the DM-only secrets" unticked: the secrets are not sent, the rest is', !ctp.includes('took the bells herself') && ctp.includes('slow-burning mystery'));
await pg.click('#ctSrcLive');
ctp = await pg.textContent('#ctPrompt');
check('"Build from my notes now" goes back to the live list', ctp.includes('Overview of the campaign') && !ctp.includes('slow-burning mystery in Greenhold') && (await pg.locator('#ctSecrets').count()) === 0);
await pg.click('#ctSrcSnap'); await pg.check('#ctSecrets');
await pg.uncheck('#ctBias');
check('with inspiration off nothing about the campaign is sent, and the source choices go away', !(await pg.textContent('#ctPrompt')).includes('About my campaign') && (await pg.locator('#ctSrcRow').count()) === 0);
await pg.check('#ctBias');
await pg.click('#ctSend'); await pg.waitForSelector('#ctResult');
check('what Claude got is the snapshot version of the question', callsText().split('=====CALL=====').pop().includes('slow-burning mystery') && callsText().split('=====CALL=====').pop().includes('NEW entries'));
await pg.click('.modal .modal-actions button:has-text("Close")'); await pg.waitForFunction(() => !document.querySelector('.modal'));

// 4. refresh
await openSettings();
await pg.click('#snapMake'); await pg.waitForSelector('#snapFacts');
check('refreshing warns that it replaces the current one', (await pg.textContent('.modal')).includes('replaces the current snapshot'));
await pg.uncheck('#snapSecrets');
await pg.click('#snapSend'); await waitReady();
check('with the secrets unticked, the answer has no Secrets section', !(await pg.inputValue('#snapText')).includes('Secrets (DM only)'));
await pg.click('#snapSave'); await pg.waitForFunction(() => !document.querySelector('.modal'));
const refreshed = await get(SNAP);
check('the note was replaced, and remembers that it was made without secrets', !refreshed.includes('Secrets (DM only)') && refreshed.includes('"secrets":false'));
await openSettings();
check('after a refresh the notes count as up to date, and the new note is part of it', (await pg.textContent('#snapStatus')).includes('nothing has changed since') && refreshed.includes('Newcomer.md'), await pg.textContent('#snapStatus'));
await closeSettings();
await pg.click('.nav-btn:has-text("Generate")'); await pg.click('#genHome'); await pg.fill('#genFind', 'NPC'); await pg.keyboard.press('Enter');
await pg.click('[data-gen="npc"] [data-claude="refill"]'); await pg.waitForSelector('[data-ct-field]');
check('and the refill window then has no secrets box, since the snapshot has none', (await pg.locator('#ctSecrets').count()) === 0);
await pg.click('.modal .modal-actions button:has-text("Close")'); await pg.waitForFunction(() => !document.querySelector('.modal'));

// 5. a big campaign is read in parts
await pg.evaluate(() => { const { S, touch } = window.__dmforge; for (let i = 0; i < 30; i++) S.working.create(S.campaign.path + '/Lore/Lore ' + i + '.md', '# Lore ' + i + '\n\n' + ('The history of place number ' + i + ' is long. ').repeat(110)); touch(); });
await openSettings(); await pg.click('#snapMake'); await pg.waitForSelector('#snapFacts');
const bigFacts = await pg.textContent('#snapFacts');
check('a big campaign says it will be read in parts, and how many requests that is', /read in \d+ parts and then joined: \d+ requests/.test(bigFacts), bigFacts);
const parts = +bigFacts.match(/read in (\d+) parts/)[1];
const c0 = nCalls();
await pg.click('#snapSend');
await pg.waitForFunction(() => !document.querySelector('.modal'));
await pg.waitForFunction(() => /Reading part 1 of/.test(document.querySelector('#jobPill').textContent), null, { timeout: 8000 });
check('the pill says which part it is on', true);
await pg.waitForFunction(() => /Putting the parts together/.test(document.querySelector('#jobPill').textContent), null, { timeout: 40000 });
check('and then that it is joining them', true);
await waitReady();
check('each part and then the join were asked, in that many requests', nCalls() - c0 === parts + 1, (nCalls() - c0) + ' vs ' + (parts + 1));
const all = callsText().split('=====CALL=====').slice(-(parts + 1));
check('the parts hold every note once, and the join asks to combine them', all.slice(0, parts).join('').match(/### [^:\n]+: Lore \d+/g).length === 30 && all[parts].includes('partial snapshots'));
check('and the answer shown is the joined one', (await pg.inputValue('#snapText')).startsWith('## Premise and tone\nMERGED'));
await pg.click('#snapDiscard'); await pg.waitForFunction(() => !document.querySelector('.modal'));
check('Throw it away discards the draft: nothing is saved and the pill goes', (await pg.locator('#jobPill').count()) === 0 && !(await get(SNAP)).includes('MERGED'));

// 5b. stopping a job
await openSettings(); await pg.click('#snapMake'); await pg.waitForSelector('#snapFacts'); await pg.click('#snapSend'); await pg.waitForSelector('#jobPill');
await pg.click('#jobPill'); await pg.waitForSelector('#snapStop'); await pg.click('#snapStop');
check('Stop says it is finishing the request in hand', (await pg.textContent('#snapRunning')).includes('Stopping') || (await pg.textContent('#jobPill')).includes('Finishing'));
await pg.waitForFunction(() => !document.querySelector('#jobPill'), null, { timeout: 30000 });
check('and it ends without a draft or a saved note, and Claude is free again', !(await get(SNAP)).includes('MERGED') && (await pg.locator('#snapResult').count()) === 0);
await pg.keyboard.press('Escape').catch(() => {}); await pg.waitForFunction(() => !document.querySelector('.modal')).catch(() => {});
await closeSettings().catch(() => {});

// 6. things going wrong
await pg.evaluate(() => { const { S, touch } = window.__dmforge; for (const p of S.working.paths().filter(p => /\/Lore\//.test(p))) S.working.remove(p); touch(); });
await addNote('Ashfall/NPCs/Poison.md', '# Poison\n\nFAIL-SNAPSHOT');
await openSettings(); await pg.click('#snapMake'); await pg.waitForSelector('#snapFacts');
const oldText = await get(SNAP);
await pg.click('#snapSend');
await pg.waitForFunction(() => !document.querySelector('.modal'));
await pg.waitForFunction(() => /failed/.test((document.querySelector('#jobPill') || {}).textContent || ''), null, { timeout: 30000 });
check('when Claude fails the pill turns red and says so', (await pg.locator('#jobPill.failed').count()) === 1);
await pg.click('#jobPill'); await pg.waitForSelector('#snapError');
check('opening it shows the reason, and nothing was changed', (await pg.textContent('#snapError')).includes('Something went wrong') && (await get(SNAP)) === oldText && (await pg.locator('#snapResult').count()) === 0);
await pg.click('#snapRetry'); await pg.waitForSelector('#snapFacts');
check('Try again goes back to the start, ready to send', !(await pg.isDisabled('#snapSend')) && (await pg.locator('#jobPill').count()) === 0);
await pg.click('.modal .modal-actions button:has-text("Close")'); await pg.waitForFunction(() => !document.querySelector('.modal'));
await closeSettings().catch(() => {});
await pg.evaluate(() => { const { S, touch } = window.__dmforge; S.working.remove(S.campaign.path + '/NPCs/Poison.md'); touch(); });
await addNote('Ashfall/NPCs/Garbage.md', '# Garbage\n\nGARBAGE-SNAPSHOT');
await openSettings(); await pg.click('#snapMake'); await pg.waitForSelector('#snapFacts');
await pg.click('#snapSend'); await waitReady();
check('an answer with no headings is flagged, and can still be edited by hand', (await pg.locator('#snapWarn').count()) === 1 && (await pg.inputValue('#snapText')).includes('could not do that'));
await pg.fill('#snapText', '');
check('an empty snapshot cannot be saved', await pg.isDisabled('#snapSave'));
await pg.click('#snapDiscard'); await pg.waitForFunction(() => !document.querySelector('.modal'));
await closeSettings().catch(() => {});
await pg.evaluate(() => { const { S, touch } = window.__dmforge; S.working.remove(S.campaign.path + '/NPCs/Garbage.md'); touch(); });

// 7. a damaged snapshot, a hostile one, and Claude off
await pg.evaluate(p => { const { S, touch } = window.__dmforge; S.working.setText(p, '# Campaign Snapshot\n\n<!-- dmf-snapshot: {broken -->\n\n## Premise and tone\n<script>window.__z=1</script> <img src=x onerror="window.__z=2"> hello\n\n## Secrets (DM only)\nshh\n'); touch(); }, SNAP);
await openSettings();
check('a snapshot whose fingerprints are damaged still shows, without a comparison, and does not break the window', (await pg.textContent('#snapStatus')).includes('Made earlier') && errors.length === 0, await pg.textContent('#snapStatus'));
await closeSettings();
await pg.click('.nav-btn:has-text("Generate")'); await pg.click('#genHome'); await pg.fill('#genFind', 'NPC'); await pg.keyboard.press('Enter');
await pg.click('[data-gen="npc"] [data-claude="refill"]'); await pg.waitForSelector('[data-ct-field]');
check('and it can still be used as inspiration', await pg.isChecked('#ctSrcSnap') && (await pg.locator('#ctStale').count()) === 0);
await pg.click('#ctSent summary');
check('hostile text inside it is only text in the question, and nothing runs', (await pg.textContent('#ctPrompt')).includes('hello') && !(await pg.evaluate(() => window.__z)));
await pg.click('.modal .modal-actions button:has-text("Close")'); await pg.waitForFunction(() => !document.querySelector('.modal'));
await pg.evaluate(() => { window.__dmforge.S.claudeOn = false; window.__dmforge.emit(); });
await openSettings();
check('with Claude off the snapshot button is disabled and says why, but the note can still be opened', await pg.isDisabled('#snapMake') && (await pg.textContent('#setSnapshot')).includes('Needs Claude') && (await pg.locator('#snapOpen').count()) === 1);
await pg.click('#snapOpen');
await pg.waitForSelector('.pane:not([hidden]) .note-head');
check('"Open the note" opens it as a note, with the hostile text safe', (await pg.textContent('.pane:not([hidden]) .note-head h2')).includes('Campaign Snapshot') && !(await pg.evaluate(() => window.__z)));
check('no page errors (snapshot)', errors.length === 0, errors.join('\n'));

await b.close(); proc.kill();
const fails = results.filter(r => !r).length;
console.log('\n' + (results.length - fails) + '/' + results.length + ' checks passed');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
