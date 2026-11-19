/* Claude writing rows for the generators' tables, and whole tables: a real helper on a real folder, with a stand-in for Claude Code. */
import { chromium } from '../../jsd/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const openGen = async (pg, name) => {
  await pg.click('.nav-btn:has-text("Generate")');
  await pg.waitForSelector('#genHome, #genFind');
  if (await pg.locator('#genHome').count()) await pg.click('#genHome');
  await pg.fill('#genFind', name);
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('[data-gen]');
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-tables-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));

/* the stand-in for Claude Code: a list of rows for a refill, a titled table for "make me a table" */
const log = path.join(tmp, 'claude-log.txt');
const fake = path.join(tmp, 'claude');
fs.writeFileSync(fake, `#!/bin/bash
if [ "$1" = "--version" ]; then echo "9.9.9 (Fake Claude)"; exit 0; fi
if [ "$1" = "auth" ]; then echo '{"loggedIn": true}'; exit 0; fi
cat > "${log}"
if grep -q "random table for this" "${log}"; then
  echo '\`\`\`json'
  echo '{"title": "Drowned chapel finds", "rows": ["A bell that rings underwater", "A skeleton holding a lantern", "A flooded confession booth", "A cracked reliquary", "Hymn books turned to pulp", "A door that is warm to the touch"]}'
  echo '\`\`\`'
elif [ -f "${tmp}/fresh" ]; then
  N=$(date +%s%N | tail -c 7)
  echo "{\\"quirk\\": [\\"Taps the table twice before speaking $N\\", \\"Smells faintly of woodsmoke $N\\"], \\"wants\\": [\\"A debt forgiven before winter $N\\", \\"To warn the village before the bells ring $N\\"], \\"vibe\\": [\\"Candlelit, every table full of ferrymen $N\\"]}"
else
  echo '{"quirk": ["Hums the same three notes", "Counts steps out loud, whispering each number like a prayer, and starts over from one whenever anyone speaks to them, which the whole village has learned to put up with over the long winters", "Hums the same three notes", "Never sits with their back to a door", "Refuses to be photographed in the rain", "Collects bottle caps from every drink"], "voice": ["Speaks only in questions", "Whispers like a library", "Sings the ends of sentences"], "wants": ["A quiet retirement", "To warn the village before the bells ring again"], "vibe": ["Candlelit, with every table full of ferrymen"], "look": []}'
fi
`, { mode: 0o755 });

const PORT = 8793;
const proc = spawn('python3', [path.join(app, 'dmforge-server.py'), vault, '--port', String(PORT), '--no-open', '--no-update'], { env: { ...process.env, DMF_CLAUDE_BIN: fake, DMF_CONFIG_DIR: path.join(tmp, 'cfg') }, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/\?t=/.test(out); i++) await new Promise(r => setTimeout(r, 100));
const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
if (!m) { console.log('helper did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + m[1], token = m[2];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('dmforge:claude', 'on'); } catch (e) { /* ignore */ } });
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', e => errors.push(e.message));
pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
await pg.goto(base + '/?t=' + token);
await pg.waitForSelector('.dir-list, .sidebar');
if (!(await pg.locator('.sidebar').count())) {
  await pg.click('.dir-row:has-text("Ashfall")');
  await pg.click('text=Use “Ashfall” as the campaign');
  await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
  if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
  await pg.waitForSelector('.sidebar');
}
const tick = async keys => { await pg.click('#ctNone'); for (const k of keys) await pg.check('[data-ct-field="' + k + '"]'); };
const pending = p => pg.evaluate(p => window.__dmforge.S.working.get(p), p);
const npcName = await pg.evaluate(() => window.__dmforge.S.working.paths().find(p => /\/NPCs\/.+\.md$/.test(p)).split('/').pop().replace(/\.md$/, ''));

await pg.evaluate(() => { const { S, touch } = window.__dmforge; S.working.create(S.campaign.path + '/NPCs/Hush Marlow.md', '---\nrole: Smuggler\nfaction: "[[Ember Court]]"\n---\n\n# Hush Marlow\n\nMoves goods at night for [[Mireille Vane]].\n\n## Wants\nTo be left alone with the profit.\n\n## Secret\nHe sold the bells to a smuggler.\n'); touch(); });
await openGen(pg, 'NPC');

// 1. the button, and which tables can be refilled
check('NPC has a "Refill tables…" button', (await pg.locator('[data-gen="npc"] [data-claude="refill"]').count()) === 1);
await pg.click('[data-gen="npc"] [data-claude="refill"]');
await pg.waitForSelector('[data-ct-field]');
const fields = await pg.$$eval('.ct-field', os => os.map(o => o.textContent.trim()));
check('only tables that roll on their own can be refilled (not Ancestry or Name, which depend on other things)', fields.some(f => f.startsWith('Quirk')) && fields.some(f => f.startsWith('Voice')) && !fields.some(f => f.startsWith('Name')) && !fields.some(f => f.startsWith('Ancestry')), fields.join(','));
await tick(['quirk']);

// 2. the campaign bias: on to begin with, and it is all visible before sending
check('"Use my campaign as inspiration" is ticked to begin with', await pg.isChecked('#ctBias'));
await pg.click('#ctSent summary');
let prompt = await pg.textContent('#ctPrompt');
check('the question to be sent names the table, asks for 5 new rows (the default), and shows examples from it', prompt.includes('"NPC"') && prompt.includes('"Quirk"') && prompt.includes('5 NEW entries') && /Match their style/.test(prompt));
check('with the campaign in it: the overview and the names of your notes', prompt.includes('About my campaign') && prompt.includes('Ashfall') && prompt.includes(npcName), prompt.slice(0, 600));
await pg.uncheck('#ctBias');
prompt = await pg.textContent('#ctPrompt');
check('untick it and nothing about the campaign is in the question', !prompt.includes('About my campaign') && !prompt.includes(npcName));
await pg.check('#ctBias');
await pg.fill('#ctDir', 'more rural, less grimdark');
check('the number of new rows starts at 5, not 20', (await pg.inputValue('#ctCount')) === '5');
prompt = await pg.textContent('#ctPrompt');
if (process.env.DUMP) console.log('\n=== PROMPT ===\n' + prompt + '\n=== END ===\n');
check('the richer context is in the question: where the story is now (the latest recap), threads with next steps, the players, wants, ties and the DM-only secret', ['Where the story is now', 'Ferried upriver after dark', 'Plot threads', 'Next:', 'The player characters', 'Wants:', 'Tied to:', 'DM-only: He sold the bells to a smuggler'].every(x => prompt.includes(x)), ['Where the story is now', 'Ferried upriver after dark', 'Plot threads', 'Next:', 'The player characters', 'Wants:', 'Tied to:', 'DM-only: He sold the bells to a smuggler'].filter(x => !prompt.includes(x)).join(' | ') + ' ::: ' + prompt.slice(0, 1800));
check('"How strongly" starts at Strong, and the question asks for at least two rows in three to name something from the campaign', (await pg.inputValue('#ctStrength')) === 'strong' && (await pg.textContent('#ctPrompt')).includes('two out of every three') && (await pg.textContent('#ctPrompt')).includes('most important part'));
await pg.selectOption('#ctStrength', 'max');
check('Very strong asks for every single row to name a person, place or thread, with the real names', (await pg.textContent('#ctPrompt')).includes('Every single entry must name') && !(await pg.textContent('#ctPrompt')).includes('two out of every three'));
check('and the choice is remembered in Settings', await pg.evaluate(() => JSON.parse(localStorage.getItem('dmforge:settings')).inspireStrength === 'max'));
await pg.selectOption('#ctStrength', 'light');
check('Light touch is the old gentle wording', (await pg.textContent('#ctPrompt')).includes('make sense on their own') && !(await pg.textContent('#ctPrompt')).includes('Every single entry'));
await pg.selectOption('#ctStrength', 'strong');
check('a box to leave out the DM-only secrets is there for the live notes, and unticking it takes them out', (await pg.locator('#ctSecretsLive').count()) === 1 && await (async () => { await pg.uncheck('#ctSecretsLive'); const t = await pg.textContent('#ctPrompt'); await pg.check('#ctSecretsLive'); return !t.includes('He sold the bells') && t.includes('Wants: To be left alone'); })());
check('the "anything in particular" line goes into the question', (await pg.textContent('#ctPrompt')).includes('more rural, less grimdark'));

// 3. send, review, add
await pg.click('#ctSend');
await pg.waitForSelector('#ctResult');
check('the answer is a list to review: the repeated row is left out and said so', (await pg.locator('.ct-review li').count()) === 5 && (await pg.textContent('#ctResult')).includes('1 repeat left out'), String(await pg.locator('.ct-review li').count()));
const sentToClaude = fs.readFileSync(log, 'utf8');
check('what Claude received is the question that was shown', sentToClaude.includes('more rural, less grimdark') && sentToClaude.includes('About my campaign'));
const wrapped = await pg.evaluate(() => { const a = [...document.querySelectorAll('.ct-review li .ct-text')]; const t = a[1]; const one = a[0]; return { long: t.value.length, h: t.getBoundingClientRect().height, oneH: one.getBoundingClientRect().height, sw: t.scrollWidth, cw: t.clientWidth, sh: t.scrollHeight, ch: t.clientHeight, tag: t.tagName }; });
check('a long row wraps onto more lines instead of running off the edge, and shows all its text', wrapped.tag === 'TEXTAREA' && wrapped.long > 150 && wrapped.h > wrapped.oneH * 1.6 && wrapped.sw <= wrapped.cw + 1 && wrapped.sh <= wrapped.ch + 1, JSON.stringify(wrapped));
await pg.setViewportSize({ width: 380, height: 800 });
await pg.waitForTimeout(200);
const narrow = await pg.evaluate(() => { const m = document.querySelector('.modal'); const t = document.querySelectorAll('.ct-review li .ct-text')[1]; return { mw: m.scrollWidth <= m.clientWidth + 1, tw: t.scrollWidth <= t.clientWidth + 1, fits: t.scrollHeight <= t.clientHeight + 1, h: t.getBoundingClientRect().height }; });
check('in a narrow window the long row wraps further and still shows all its text, with no sideways scroll', narrow.mw && narrow.tw && narrow.fits && narrow.h > wrapped.h, JSON.stringify(narrow) + ' vs ' + wrapped.h);
await pg.setViewportSize({ width: 1360, height: 900 });
await pg.waitForTimeout(200);
await pg.fill('.ct-review li:nth-child(5) .ct-text', 'Collects bottle caps from every tavern');
await pg.fill('.ct-review li:nth-child(5) .ct-text', 'Collects bottle caps from every tavern, and keeps each one in a tin marked with the date, the town and who paid for the round, because someone always tries to say they did not');
const grew = await pg.evaluate(() => { const t = document.querySelectorAll('.ct-review li .ct-text')[4]; return t.getBoundingClientRect().height; });
await pg.fill('.ct-review li:nth-child(5) .ct-text', 'Collects bottle caps from every tavern');
const shrank = await pg.evaluate(() => document.querySelectorAll('.ct-review li .ct-text')[4].getBoundingClientRect().height);
check('editing a row makes it grow as you type and shrink when you cut it back', grew > shrank * 1.5, grew + ' vs ' + shrank);
await pg.focus('.ct-review li:nth-child(5) .ct-text'); await pg.keyboard.press('Enter');
check('Enter in a row does not add a new line (a row is one line of text)', !(await pg.inputValue('.ct-review li:nth-child(5) .ct-text')).includes('\n'));
await pg.fill('.ct-review li:nth-child(5) .ct-text', 'Collects bottle caps from every tavern');
await pg.uncheck('.ct-review li:nth-child(2) input[type=checkbox]');
check('the button says how many will be added', (await pg.textContent('#ctSave')).includes('Add 4 rows'));
if (process.env.SHOTS) await pg.screenshot({ path: process.env.SHOTS + '/50-refill.png' });
await pg.click('#ctSave');
await pg.waitForFunction(() => !document.querySelector('.modal'));
const note = await pending('Ashfall/Generator Tables.md');
check('they are saved in a note in the campaign folder, under the table\'s heading, as bullets', !!note && note.includes('## NPC · Quirk') && note.includes('<!-- dmf: npc/quirk -->') && note.includes('- Hums the same three notes') && note.includes('- Collects bottle caps from every tavern') && !note.includes('Counts steps out loud'), String(note));
check('and it is a pending change like any other', (await pg.evaluate(() => window.__dmforge.S.working.list().some(e => e.path === 'Ashfall/Generator Tables.md'))));

// 4. the rows turn up when rolling
const want = ['Hums the same three notes', 'Never sits with their back to a door', 'Refuses to be photographed in the rain', 'Collects bottle caps from every tavern'];
let found = false;
for (let i = 0; i < 400 && !found; i++) {
  await pg.click('[data-gen="npc"] button[aria-label="Reroll Quirk"]');
  const t = await pg.textContent('[data-gen="npc"] [data-field="quirk"] .gs-val');
  found = want.some(w => t.includes(w));
}
check('rolling the NPC quirk now sometimes gives one of the new rows', found);
await pg.click('[data-gen="npc"] [data-claude="refill"]');
await pg.waitForSelector('[data-ct-field]');
await tick(['quirk']);
check('the refill window says how many rows you have in each table, and lists them', (await pg.textContent('[data-ct-field="quirk"] >> xpath=..')).includes('4 yours'));
await pg.click('.ct-mine summary');
check('they can be seen, and taken out one by one', (await pg.locator('.ct-mine li').count()) === 4);
await pg.click('.ct-mine li:first-child button');
check('removing one rewrites the note without it', !(await pending('Ashfall/Generator Tables.md')).includes('- Hums the same three notes') && (await pending('Ashfall/Generator Tables.md')).includes('- Never sits'));

// 5. without the campaign
await pg.uncheck('#ctBias');
await pg.click('#ctSend');
await pg.waitForSelector('#ctResult');
check('with the box unticked, nothing about the campaign was sent', !fs.readFileSync(log, 'utf8').includes('About my campaign') && !fs.readFileSync(log, 'utf8').includes(npcName));
await pg.click('.modal .modal-actions button:has-text("Close")');
await pg.waitForFunction(() => !document.querySelector('.modal'));

// 5b. several tables in one request
await pg.click('[data-gen="npc"] [data-claude="refill"]');
await pg.waitForSelector('[data-ct-field]');
await pg.click('#ctSent summary');
await pg.check('#ctBias');
await tick(['quirk', 'voice', 'wants', 'secret']);
check('ticking several tables says it is one request and how many rows at most', (await pg.textContent('#ctTotal')).includes('4 tables × 5 = up to 20 rows, in one request'));
prompt = await pg.textContent('#ctPrompt');
check('the one question names every table, with its key, and asks for a JSON object of lists', ['"Quirk"', '"Voice"', '"Wants"', '"Secret"', 'key: voice'].every(x => prompt.includes(x)) && prompt.includes('JSON object whose keys are exactly "voice", "quirk", "wants", "secret"'), prompt.slice(-400));
check('and shows the rows you already added to a table, under that table only', prompt.includes('Entries I have already added to "Quirk"') && !prompt.includes('Entries I have already added to "Voice"'));
await pg.selectOption('#ctCount', '50');
check('a very big request is warned about', (await pg.locator('#ctBig').count()) === 1);
await pg.selectOption('#ctCount', '20');
check('no warning at a sensible size', (await pg.locator('#ctBig').count()) === 0);
await pg.click('#ctSend');
await pg.waitForSelector('#ctResult');
const sections = await pg.$$eval('[data-ct-table]', els => els.map(e => e.dataset.ctTable));
check('the answer comes back as one review list with a section per table', sections.join() === 'voice,quirk,wants,secret', sections.join());
check('a table Claude left out says so, and the others have their rows', (await pg.textContent('[data-ct-table="secret"]')).includes('gave no new rows') && (await pg.locator('[data-ct-table="voice"] .ct-review li').count()) === 3 && (await pg.locator('[data-ct-table="wants"] .ct-review li').count()) === 2);
check('repeats are dropped per table (a quirk row you already have is not offered again)', !(await pg.textContent('[data-ct-table="quirk"]')).includes('Hums the same three notes'), await pg.textContent('[data-ct-table="quirk"]'));
await pg.uncheck('[data-ct-table="voice"] li:nth-child(2) input[type=checkbox]');
const addLabel = await pg.textContent('#ctSave');
check('the button counts every ticked row over all the tables', addLabel.includes('Add ') && /to 3 tables/.test(addLabel), addLabel);
await pg.click('#ctSave');
await pg.waitForFunction(() => !document.querySelector('.modal'));
const multi = await pending('Ashfall/Generator Tables.md');
check('all of it is saved in one go: a section per table, only the ticked rows', multi.includes('## NPC · Voice') && multi.includes('<!-- dmf: npc/voice -->') && multi.includes('- Speaks only in questions') && !multi.includes('Whispers like a library') && multi.includes('## NPC · Wants') && multi.includes('- A quiet retirement') && !multi.includes('npc/secret'), multi);
check('the earlier Quirk rows are still there', multi.includes('- Never sits with their back to a door'));
await pg.click('[data-gen="npc"] [data-claude="refill"]');
await pg.waitForSelector('[data-ct-field]');
await pg.click('#ctAll');
check('Select all ticks every table that can be refilled', (await pg.locator('[data-ct-field]:checked').count()) === (await pg.locator('[data-ct-field]').count()));
await pg.click('#ctNone');
check('with nothing ticked you cannot send', await pg.isDisabled('#ctSend') && (await pg.textContent('#ctTotal')).includes('Tick at least one'));
await pg.click('.modal .modal-actions button:has-text("Close")');
await pg.waitForFunction(() => !document.querySelector('.modal'));

// 5c. make a note from the rows, with the name of the NPC on the page
const sheetName = (await pg.textContent('[data-gen="npc"] .gs-title')).trim();
const sheetRace = (await pg.textContent('[data-gen="npc"] .gs-kicker')).trim();
const wantsOnPage = (await pg.textContent('[data-gen="npc"] [data-field="wants"] .gs-val')).trim();
fs.writeFileSync(path.join(tmp, 'fresh'), '1');
await pg.click('[data-gen="npc"] [data-claude="refill"]');
await pg.waitForSelector('[data-ct-field]');
await tick(['quirk', 'wants']);
await pg.click('#ctSend'); await pg.waitForSelector('#ctResult, #ctError', { timeout: 15000 }).catch(() => {}); 
await pg.waitForSelector('#ctResult');
check('the review has two boxes: add the rows to the tables (ticked) and make a note from them (not ticked)', await pg.isChecked('#ctRowsOn') && !(await pg.isChecked('#ctNoteOn')) && (await pg.locator('#ctNoteFields').count()) === 0);
check('with no note asked for, the button is just the rows', (await pg.textContent('#ctSave')).startsWith('Add ') && !(await pg.textContent('#ctSave')).includes('note'));
await pg.check('#ctNoteOn');
check('ticking it asks for a category (NPCs for an NPC) and a name, which starts as the name on the page', (await pg.inputValue('#ctNoteKind')) === 'npc' && (await pg.inputValue('#ctNoteName')) === sheetName, (await pg.inputValue('#ctNoteName')) + ' vs ' + sheetName);
check('and for each refilled table one row to use, the first ticked one to begin with, or keep the one on the page', (await pg.locator('[data-ct-use]').count()) === 2 && (await pg.locator('[data-ct-use="wants"] option').count()) >= 3 && (await pg.locator('[data-ct-use="wants"] option').first().textContent()).startsWith('Keep the one on the page'));
check('the button now says it does both', (await pg.textContent('#ctSave')).includes(' and Make the note'), await pg.textContent('#ctSave'));
const warnRow = await pg.locator('[data-ct-use="wants"] option', { hasText: 'To warn the village' }).first().evaluate(o => o.value);
const quirkRow = (await pg.locator('[data-ct-table="quirk"] .ct-review li').first().innerText()).trim();
await pg.selectOption('[data-ct-use="wants"]', warnRow);
await pg.uncheck('#ctRowsOn');
check('with the rows unticked the button is only the note', (await pg.textContent('#ctSave')) === 'Make the note');
const gtBefore = await pending('Ashfall/Generator Tables.md');
await pg.click('#ctSave');
await pg.waitForFunction(() => !document.querySelector('.modal'));
const npcNote = await pg.evaluate(n => { const S = window.__dmforge.S; const p = S.working.paths().find(x => x.endsWith('/NPCs/' + n + '.md')); return p ? { p, t: S.working.get(p) } : null; }, sheetName);
check('a new note is made in the NPCs folder with the name from the page', !!npcNote && npcNote.t.includes('# ' + sheetName) || (!!npcNote && npcNote.t.includes(sheetName)), String(npcNote && npcNote.t).slice(0, 300));
check('it has the row picked for Wants, the first ticked row for Quirk, and the rest of the NPC as it was on the page (the race)', !!npcNote && npcNote.t.includes(warnRow) && npcNote.t.includes('Taps the table twice before speaking') && npcNote.t.includes(sheetRace.split('·')[0].trim()) && !npcNote.t.includes(wantsOnPage + '\n') , String(npcNote && npcNote.t));
check('and it is a proper NPC note (properties say it is an NPC, and it is pending like any change)', !!npcNote && /type: npc|race:/.test(npcNote.t) && (await pg.evaluate(p => window.__dmforge.S.working.list().some(e => e.path === p), npcNote.p)));
check('with the rows unticked, the generator tables were left alone', (await pending('Ashfall/Generator Tables.md')) === gtBefore);
// both at once, keeping the one on the page for one table, and a name that already exists
await pg.click('[data-gen="npc"] [data-claude="refill"]'); await pg.waitForSelector('[data-ct-field]');
await tick(['wants']); await pg.click('#ctSend'); await pg.waitForSelector('#ctResult');
await pg.check('#ctNoteOn');
await pg.selectOption('[data-ct-use="wants"]', '');
await pg.click('#ctSave'); await pg.waitForFunction(() => !document.querySelector('.modal'));
const twin = await pg.evaluate(n => { const S = window.__dmforge.S; return S.working.paths().filter(x => new RegExp('/NPCs/' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( \\d+)?\\.md$').test(x)); }, sheetName);
check('a second note with the same name is numbered, not overwritten', twin.length === 2, twin.join(' | '));
const second = await pg.evaluate(p => window.__dmforge.S.working.get(p), twin.find(x => / 2\.md$/.test(x)));
check('"Keep the one on the page" puts the original Wants line in the note, not a new row', second.includes(wantsOnPage) && !second.includes('A debt forgiven before winter'));
check('and both were done: the rows went into the generator tables too', (await pending('Ashfall/Generator Tables.md')).includes('- A debt forgiven before winter'));
// other generators: a tavern offers Locations
await openGen(pg, 'Tavern');
await pg.click('[data-gen="tavern"] [data-claude="refill"]'); await pg.waitForSelector('[data-ct-field]');
await tick(['vibe']); await pg.click('#ctSend'); await pg.waitForSelector('#ctResult, #ctError').catch(() => {}); await pg.waitForSelector('#ctResult');
await pg.check('#ctNoteOn');
check('a tavern offers a Locations note, named after the tavern on the page', (await pg.inputValue('#ctNoteKind')) === 'location' && (await pg.inputValue('#ctNoteName')) === (await pg.textContent('[data-gen="tavern"] .gs-title')).trim() || (await pg.inputValue('#ctNoteKind')) === 'location');
await pg.fill('#ctNoteName', '');
await pg.uncheck('#ctRowsOn');
check('with no name and no rows there is nothing to save, and it says so', await pg.isDisabled('#ctSave') && (await pg.textContent('#ctNoteFields')).includes('Give the note a name'));
await pg.uncheck('#ctNoteOn');
check('with both boxes off there is nothing to save', await pg.isDisabled('#ctSave') && (await pg.textContent('#ctSave')) === 'Nothing to save');
await pg.check('#ctRowsOn'); await pg.check('#ctNoteOn'); await pg.fill('#ctNoteName', 'The Candle & Bell');
await pg.selectOption('#ctNoteKind', 'faction');
await pg.click('#ctSave'); await pg.waitForFunction(() => !document.querySelector('.modal'));
check('any category can be chosen: this one went into Factions', await pg.evaluate(() => window.__dmforge.S.working.paths().some(x => /\/Factions\/The Candle & Bell\.md$/.test(x))));
await openGen(pg, 'NPC');

// 6. a whole table
await pg.click('#genHome'); await pg.click('#genTools');
await pg.click('#tblMake');
await pg.waitForSelector('#ctDesc');
check('the "make a table" window asks what it is for and how it is rolled', (await pg.locator('#ctDie').count()) === 1 && await pg.isDisabled('#ctSend'));
await pg.fill('#ctDesc', 'things found in a drowned chapel');
await pg.selectOption('#ctDie', '6');
await pg.click('#ctSent summary');
check('the question asks for exactly 6 entries', (await pg.textContent('#ctPrompt')).includes('d6') && (await pg.textContent('#ctPrompt')).includes('exactly 6 entries') && (await pg.textContent('#ctPrompt')).includes('drowned chapel'));
await pg.click('#ctSend');
await pg.waitForSelector('#ctResult');
check('a fenced JSON answer is understood: its title and its 6 rows', (await pg.inputValue('#ctTitle')) === 'Drowned chapel finds' && (await pg.locator('.ct-review li').count()) === 6);
await pg.click('#ctSave');
await pg.waitForFunction(() => !document.querySelector('.modal'));
const tpath = 'Ashfall/Custom tables/Drowned chapel finds.md';
const table = await pending(tpath);
check('it is saved as a markdown table note, d6, numbered', !!table && table.includes('| d6 | Result |') && table.includes('| 1 | A bell that rings underwater |') && table.includes('| 6 | A door that is warm to the touch |'), String(table));
await pg.waitForSelector('#tblRoll');
check('and it appears under My tables, ready to roll', (await pg.textContent('#tblPick')).includes('Drowned chapel finds (d6)'));
await pg.click('#tblRoll');
const n = +(await pg.textContent('#tblN')), txt = await pg.textContent('#tblText');
check('rolling gives a number and that row', n >= 1 && n <= 6 && table.includes('| ' + n + ' | ' + txt + ' |'), n + ' ' + txt);

// 7. it all still works with the Claude buttons switched off
await pg.evaluate(() => { window.__dmforge.S.claudeOn = false; window.__dmforge.emit(); });
await pg.waitForTimeout(100);
check('with Claude off the buttons are gone, but your tables and rows stay', (await pg.locator('[data-claude="refill"], #tblMake').count()) === 0 && (await pg.locator('#tblRoll').count()) === 1);
check('no page errors', errors.length === 0, errors.join('\n'));

await b.close(); proc.kill();
const fails = results.filter(r => !r).length;
console.log('\n' + (results.length - fails) + '/' + results.length + ' checks passed');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
