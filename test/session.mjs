/* The session log and Close out, end to end: a real helper on a real folder, with a stand-in for Claude Code. */
import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-sess-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));

const log = path.join(tmp, 'last.txt');
const calls = path.join(tmp, 'calls.txt');
const fake = path.join(tmp, 'claude');
fs.writeFileSync(fake, `#!/bin/bash
if [ "$1" = "--version" ]; then echo "9.9.9 (Fake Claude)"; exit 0; fi
if [ "$1" = "auth" ]; then echo '{"loggedIn": true}'; exit 0; fi
cat > "${log}"
{ echo "=====CALL====="; cat "${log}"; } >> "${calls}"
sleep 1
if grep -q "GARBAGE-CLOSEOUT" "${log}"; then echo "I could not do that, sorry."; exit 0; fi
echo '\`\`\`json'
echo '{"recap": "- The party ferried upriver\\n- Hush sold the bells", "threads": [{"name": "The Missing Bells", "status": "Active", "text": "The buyer is in Greenhold"}, {"name": "Nonexistent Thread", "status": "Active", "text": "x"}], "npcs": [{"name": "Mireille Vane", "status": "Missing", "text": "Left the inn at dusk"}], "next": ["Find the buyer", "Return the lantern"], "differences": ["The players forgot the lantern", "They think Calder was alone"]}'
echo '\`\`\`'
`, { mode: 0o755 });

const PORT = 8796;
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
await ctx.addInitScript(() => { try { localStorage.setItem('dmforge:claude', 'on'); } catch (e) { /* ignore */ } });
// records every field that reaches the live page WITHOUT the password-manager marks (they must be on when the field is inserted)
await ctx.addInitScript(() => {
  window.__unmarked = [];
  const skip = ['checkbox', 'radio', 'button', 'submit', 'hidden', 'file', 'range', 'color', 'image', 'reset'];
  const chk = n => {
    if (!n || n.nodeType !== 1) return;
    for (const e of [n, ...n.querySelectorAll('input,textarea,select')]) {
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName)) continue;
      if (e.tagName === 'INPUT' && skip.includes((e.getAttribute('type') || 'text').toLowerCase())) continue;
      if (e.getAttribute('data-bwignore') !== 'true' || e.getAttribute('autocomplete') !== 'off') window.__unmarked.push((e.id || e.getAttribute('aria-label') || e.tagName));
    }
  };
  const ib = Node.prototype.insertBefore, ac = Node.prototype.appendChild;
  Node.prototype.insertBefore = function (n, r) { if (this.isConnected) chk(n); return ib.call(this, n, r); };
  Node.prototype.appendChild = function (n) { if (this.isConnected) chk(n); return ac.call(this, n); };
});
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
const S12 = 'Ashfall/Sessions/2026-10-12 Session 12.md', S11 = 'Ashfall/Sessions/2026-10-05 Session 11.md';
const MIR = 'Ashfall/NPCs/Mireille Vane.md', BELLS = 'Ashfall/Plot Threads/The Missing Bells.md';
const get = p => pg.evaluate(p => window.__dmforge.S.working.get(p), p);
const nCalls = () => (fs.existsSync(calls) ? (fs.readFileSync(calls, 'utf8').match(/=====CALL=====/g) || []).length : 0);
const lastCall = () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').split('=====CALL=====').pop() : '');
const add = async (text, tag) => { if (tag) await pg.click('[data-log-tag="' + tag + '"]'); await pg.fill('#sessionLine', text); await pg.keyboard.press('Enter'); };

// 1. the log
check('the top bar has a Log button, left of the View menu, and the box is closed', await pg.locator('.topbar #logBtn').count() === 1 && await pg.locator('#logBox').count() === 0 && await pg.evaluate(() => document.querySelector('#logBtn').getBoundingClientRect().right <= document.querySelector('#viewMenu').getBoundingClientRect().left + 1));
await pg.click('#logBtn');
await pg.waitForSelector('#logBox');
check('it opens a small box with the cursor in it, logging to the newest session', await pg.evaluate(() => document.activeElement && document.activeElement.id === 'sessionLine') && (await pg.inputValue('#sessionPick')) === S12);
await add('The ferryman is nervous');
let t = await get(S12);
check('Enter adds a timestamped line under “Session log” in a marked block, and the box stays ready', /## Session log\n\n<!-- dmforge:log -->\n- \d\d:\d\d The ferryman is nervous\n<!-- \/dmforge:log -->/.test(t) && (await pg.inputValue('#sessionLine')) === '' && await pg.evaluate(() => document.activeElement.id === 'sessionLine'), t.slice(-300));
check('the latest lines are listed in the box', (await pg.textContent('#logRecent')).includes('The ferryman is nervous'));
await add('Hush sold the bells', 'reveal');
await add('We will return the lantern', 'promise');
t = await get(S12);
check('a tag adds a #tag, and Promise makes it a task you can tick', t.includes('#reveal Hush sold the bells') && /- \[ \] \d\d:\d\d #promise We will return the lantern/.test(t));
check('the tag choice resets after a line is added', (await pg.locator('[data-log-tag].on').count()) === 0);
await pg.fill('#sessionLine', 'They chose the river road');
await pg.keyboard.press('Alt+Digit3');
check('Alt plus a number picks a tag from the keyboard', (await pg.getAttribute('[data-log-tag="decision"]', 'aria-pressed')) === 'true');
await pg.keyboard.press('Enter');
check('and the line carries that tag', (await get(S12)).includes('#decision They chose the river road'));
await pg.fill('#sessionLine', 'Met @Mire');
check('typing @ and a few letters offers matching notes', await pg.locator('#logMentions .log-mention').count() >= 1 && (await pg.textContent('#logMentions')).includes('Mireille Vane'));
await pg.keyboard.press('Enter');
check('Enter picks it and writes a [[link]]', (await pg.inputValue('#sessionLine')) === 'Met [[Mireille Vane]] ');
await pg.keyboard.press('Enter');
check('and the link is in the note', (await get(S12)).includes('Met [[Mireille Vane]]'));
await add('A line to take back');
await pg.click('#logUndo');
t = await get(S12);
check('Undo last removes only the last line', !t.includes('A line to take back') && t.includes('Met [[Mireille Vane]]'));
check('the Push button counts the change', /Push \d+ change/.test(await pg.textContent('#pushBtn')));
// the session it goes to
await pg.selectOption('#sessionPick', S11);
await add('A line for the older session');
check('choosing another session sends the lines there', (await get(S11)).includes('A line for the older session') && !(await get(S12)).includes('older session'));
await pg.click('#logClose');
check('Close hides the box', await pg.locator('#logBox').count() === 0);
await pg.keyboard.press('Alt+KeyL');
await pg.waitForSelector('#logBox');
await pg.waitForFunction(() => document.activeElement && document.activeElement.id === 'sessionLine');
check('Option+L opens it again, remembering the session you chose', (await pg.inputValue('#sessionPick')) === S11 && await pg.evaluate(() => document.activeElement.id === 'sessionLine'));
await pg.keyboard.press('Escape');
check('Esc closes it', await pg.locator('#logBox').count() === 0);
await pg.keyboard.press('Alt+KeyL'); await pg.waitForSelector('#logBox');
await pg.selectOption('#sessionPick', S12);
await pg.evaluate(() => window.__dmforge.A.setLogOpen(true));
await pg.click('#islandPin');                                   // pinned, the log stays open while you move around (unpinned, it closes when you go elsewhere)
await pg.click('.nav-btn:has-text("Combat")');
check('the box stays over other pages, so combat is still in view', await pg.locator('#logBox').isVisible());
await pg.setViewportSize({ width: 390, height: 800 });
await pg.waitForFunction(() => { const b = document.querySelector('#logBox'); return b && getComputedStyle(b).position === 'fixed'; });        // on a narrow window the log leaves the pill and floats
check('on a phone-sized window it fits (no sideways scroll)', await pg.evaluate(() => { const r = document.querySelector('#logBox').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && document.documentElement.scrollWidth <= window.innerWidth; }));
await pg.setViewportSize({ width: 1360, height: 900 });
await pg.click('#logClose');

// password managers are told to keep out of every field
await pg.click('#logBtn'); await pg.waitForSelector('#sessionLine');
const pm = await pg.evaluate(() => { const bad = []; document.querySelectorAll('input,textarea,select').forEach(e => { const t = (e.getAttribute('type') || 'text').toLowerCase(); if (['checkbox', 'radio', 'button', 'submit', 'hidden', 'file', 'range', 'color'].includes(t)) return; if (e.getAttribute('data-bwignore') !== 'true' || e.getAttribute('data-lpignore') !== 'true' || !e.hasAttribute('data-1p-ignore') || e.getAttribute('data-form-type') !== 'other' || e.getAttribute('autocomplete') !== 'off') bad.push((e.id || e.getAttribute('aria-label') || e.tagName)); }); return { bad, n: document.querySelectorAll('input,textarea,select').length, name: document.querySelector('#sessionLine').getAttribute('name') }; });
check('every field (the log box, search, the session picker) is marked so password managers ignore it', pm.bad.length === 0 && pm.n >= 3, JSON.stringify(pm));
check('and the log field has a neutral name, id and role (no word like login in them)', pm.name === 'session-line' && !/login|user|mail|pass|account/i.test(await pg.evaluate(() => { const e = document.querySelector('#sessionLine'); return [e.id, e.name, e.placeholder, e.getAttribute('aria-label') || ''].join(' '); })));
check('every field was marked at the moment it was added to the page, not afterwards', (await pg.evaluate(() => window.__unmarked)).length === 0, JSON.stringify(await pg.evaluate(() => window.__unmarked)));
await pg.click('#logClose');
// a field made later is marked too
await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="sessions"]'); await pg.waitForSelector('#setNeglect');
check('fields on pages opened later are marked as well', (await pg.getAttribute('#setNeglect', 'data-bwignore')) === 'true');
await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage'));

// 2. close out
await pg.evaluate(p => window.__dmforge.A.goto(p), S12);
await pg.waitForSelector('#closeoutBtn');
await pg.click('#closeoutBtn');
await pg.waitForSelector('#coFacts');
const facts = await pg.textContent('#coFacts');
check('Close out shows what it will read: the lines, the players’ recap, the threads and NPCs', /\d+ lines? in the session log/.test(facts) && facts.includes('players’ recap in the note will be compared') && /open threads?/.test(facts), facts);
await pg.click('#coSent summary');
const prompt = await pg.textContent('#coPrompt');
check('the preview is exactly the question: the log, the players’ recap, the threads and the NPC named in the log', prompt.includes('Hush sold the bells') && prompt.includes('Ferried upriver after dark') && prompt.includes('The Missing Bells (Active)') && prompt.includes('Mireille Vane (Alive)') && prompt.includes('JSON object'));
check('the DM Forge blocks are not repeated inside “my notes”', !/MY NOTES FOR THE SESSION ===[\s\S]*dmforge:log/.test(prompt));
const before = nCalls();
await pg.click('#coSend');
await pg.waitForSelector('#jobPill');
check('Send closes the window and the work carries on in the top bar', await pg.locator('.modal').count() === 0 && (await pg.textContent('#jobPill')).includes('Close out'));
check('while it runs, you can keep working (the log still adds lines)', await (async () => { await pg.click('#logBtn'); await add('Added while Claude reads'); await pg.click('#logClose'); return (await get(S12)).includes('Added while Claude reads'); })());
await pg.waitForFunction(() => /ready/.test((document.querySelector('#jobPill') || {}).textContent || ''), null, { timeout: 30000 });
check('one question was sent', nCalls() === before + 1 && lastCall().includes('I have just played'));
await pg.click('#jobPill');
await pg.waitForSelector('#coReview');
check('the review has your recap, the thread, the NPC and what to carry over, all ticked', (await pg.inputValue('#coRecap')).includes('Hush sold the bells') && await pg.isChecked('#coRecapOn') && (await pg.locator('[data-co="next"] input[type=checkbox]:checked').count()) === 2);
check('a thread name that is not a note is shown, but cannot be ticked', await pg.locator('[data-co="threads"] li.off').count() === 1 && await pg.locator('[data-co="threads"] li.off input[type=checkbox]').isDisabled());
check('the differences from the players’ recap are listed', (await pg.textContent('[data-co="diffs"]')).includes('The players forgot the lantern'));
const sess0 = await get(S12), mir0 = await get(MIR);
check('nothing is changed yet', !sess0.includes('DM recap') && (await get(BELLS)).indexOf('Session updates') < 0);
await pg.fill('#coRecap', '- The party ferried upriver\n- Hush sold the bells (edited)');
await pg.uncheck('[aria-label="Update Mireille Vane"]');
await pg.uncheck('[aria-label="Carry over: Return the lantern"]');
check('the button counts what is ticked', (await pg.textContent('#coApply')).startsWith('Apply 4 changes'), await pg.textContent('#coApply'));
await pg.click('#coApply');
await pg.waitForFunction(() => !document.querySelector('.modal'));
const sess1 = await get(S12), bells1 = await get(BELLS);
check('the recap is saved under “DM recap”, as edited, and the players’ recap is untouched', sess1.includes('## DM recap') && sess1.includes('Hush sold the bells (edited)') && sess1.includes('## Recap\nFerried upriver after dark.'));
check('what to carry over is saved as tasks (only the ticked one)', sess1.includes('## Next time') && sess1.includes('- [ ] Find the buyer') && !sess1.includes('- [ ] Return the lantern\n<!--'), sess1.slice(-500));
check('the differences are saved under “Recap check”', sess1.includes('## Recap check') && sess1.includes('The players forgot the lantern'));
check('the thread gets a line that links back to the session, and its status is kept', bells1.includes('## Session updates') && bells1.includes('- [[2026-10-12 Session 12]] (2026-10-12): The buyer is in Greenhold') && bells1.includes('status: Active'), bells1.slice(-300));
check('the NPC that was unticked is untouched', (await get(MIR)) === mir0);
check('the log lines are still there after closing out', sess1.includes('<!-- dmforge:log -->') && sess1.includes('Added while Claude reads'));
check('the pill is gone', await pg.locator('#jobPill').count() === 0 && await pg.locator('#snapBtn').count() === 1);
// again: marked blocks update, nothing doubles
await pg.click('#closeoutBtn'); await pg.waitForSelector('#coTidy');
await pg.click('#coTidy'); await pg.waitForSelector('#coReview');
check('Just tidy the log needs no Claude: the log becomes a recap and open promises become tasks', (await pg.inputValue('#coRecap')).includes('Hush sold the bells') && (await pg.locator('[data-co="threads"]').count()) === 0 && (await pg.locator('[data-co="next"] .co-text').first().inputValue()).includes('return the lantern'));
await pg.click('#coApply'); await pg.waitForFunction(() => !document.querySelector('.modal'));
const sess2 = await get(S12);
check('doing it again updates the blocks instead of adding more', (sess2.match(/## DM recap/g) || []).length === 1 && (sess2.match(/## Next time/g) || []).length === 1 && (sess2.match(/Find the buyer/g) || []).length === 1 && (sess2.match(/We will return the lantern/g) || []).length === 2, sess2.slice(-700));
check('and no extra call was made to Claude for the tidy', nCalls() === before + 1);
// a task in the log can be ticked in the note; failure path on another session
await pg.click('#logBtn'); await pg.selectOption('#sessionPick', S11); await add('GARBAGE-CLOSEOUT line'); await pg.click('#logClose');
await pg.evaluate(p => window.__dmforge.A.goto(p), S11);
await pg.waitForSelector('#closeoutBtn'); await pg.click('#closeoutBtn'); await pg.waitForSelector('#coSend'); await pg.click('#coSend');
await pg.waitForFunction(() => /failed/.test((document.querySelector('#jobPill') || {}).textContent || ''), null, { timeout: 30000 });
check('when Claude gives nothing usable the pill turns red', await pg.locator('#jobPill.failed').count() === 1);
await pg.click('#jobPill'); await pg.waitForSelector('#coError');
check('and says so, with a way to try again or dismiss', (await pg.textContent('#coError')).includes('nothing I can use') && await pg.locator('#coRetry').count() === 1);
await pg.click('#coFailed button:has-text("Dismiss")');
check('Dismiss clears it', await pg.locator('#jobPill').count() === 0);
// 3. what am I forgetting? (the Overview card)
await pg.evaluate(() => window.__dmforge.A.setSection('overview'));
await pg.waitForSelector('#forgetCard');
const waiting = await pg.textContent('[data-fg="waiting"]');
check('the Overview has a “What am I forgetting?” card listing what is waiting: a log promise and a carried-over task', waiting.includes('We will return the lantern') && waiting.includes('Find the buyer'), waiting);
check('with where each came from', waiting.includes('carried over') && waiting.includes('2026-10-12 Session 12'));
const lantern = '[aria-label="Tick off: We will return the lantern"]';
await pg.click(lantern);
await pg.waitForFunction(() => !document.querySelector('[aria-label="Tick off: We will return the lantern"]'));
check('ticking one removes it from the card (it was listed once) and ticks it in the session log and in Next time', /- \[x\] \d\d:\d\d #promise We will return the lantern/.test(await get(S12)) && /- \[x\] We will return the lantern/.test(await get(S12)), (await get(S12)).slice(-900));
await pg.click('#forgetToPrep');
check('Add to prep writes a checklist at the end of the newest session’s Prep (once)', (await get(S12)).includes('**Before we start**') && (await get(S12)).includes('- [ ] Find the buyer _(carried over, ') && (await get(S12)).indexOf('Before we start') < (await get(S12)).indexOf('## Session log'));
await pg.click('#forgetToPrep');
check('doing it twice does not repeat it', ((await get(S12)).match(/Before we start/g) || []).length === 1);
await pg.evaluate(() => window.__dmforge.A.setSection('overview'));
await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="sessions"]'); await pg.waitForSelector('#setNeglect');
await pg.selectOption('#setNeglect', '2');
check('Settings has how many sessions before something counts as neglected, and it is remembered', (await pg.evaluate(() => window.__dmforge.S.settings.neglectAfter)) === 2);
await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage'));
check('the card says what the setting is', (await pg.textContent('#forgetCard')).includes('after 2 sessions'));

// Claude off
await pg.evaluate(p => window.__dmforge.A.goto(p), S11); await pg.waitForSelector('#closeoutBtn');
await pg.evaluate(() => window.__dmforge.A.setClaudeOn(false));
await pg.click('#closeoutBtn'); await pg.waitForSelector('#coSend');
check('with Claude off, Send is greyed out but tidying the log still works', await pg.isDisabled('#coSend') && !(await pg.isDisabled('#coTidy')));
await pg.click('.modal .modal-actions button:has-text("Close")');
// import last session: after closing out, the next session can start from it
await pg.evaluate(() => { window.__dmforge.S.dialog = { kind: 'newSession' }; window.__dmforge.emit(); });
await pg.waitForSelector('#nsImport');
check('the New session window offers to bring in last session, saying what from', (await pg.textContent('.modal')).includes('Session 12') && /recap|tasks?/.test(await pg.textContent('.modal')));
await pg.click('.modal button[type=submit]');
await pg.waitForFunction(() => window.__dmforge.S.working.paths().some(p => /Sessions\/.*13\.md$/.test(p)));
const s13p = (await pg.evaluate(() => window.__dmforge.S.working.paths())).find(p => /Sessions\/.*13\.md$/.test(p));
const s13t = await get(s13p);
check('the new session starts with a “Last time” section before its Prep: your recap and what to carry over', s13t.includes('## Last time') && s13t.indexOf('## Last time') < s13t.indexOf('## Prep') && s13t.includes('Hush sold the bells') && s13t.includes('_(your recap)_') && s13t.includes('- [ ] Find the buyer'), s13t.slice(0, 900));
check('the Next time tasks and the secrets still hidden come with it', s13t.includes('**To carry over**'));
await pg.evaluate(() => { window.__dmforge.S.dialog = { kind: 'newSession' }; window.__dmforge.emit(); });
await pg.waitForSelector('#nsImport');
await pg.fill('.modal input[type=number]', '14');
await pg.uncheck('#nsImport');
await pg.click('.modal button[type=submit]');
await pg.waitForFunction(() => window.__dmforge.S.working.paths().some(p => /Sessions\/.*14\.md$/.test(p)));
const s14p = (await pg.evaluate(() => window.__dmforge.S.working.paths())).find(p => /Sessions\/.*14\.md$/.test(p));
check('unticking it starts a clean session', !(await get(s14p)).includes('## Last time'));
await pg.waitForSelector('#importLastBtn');
check('and the Import last session button on a session does it afterwards', !(await pg.isDisabled('#importLastBtn')));
await pg.click('#importLastBtn');
check('it brings in the same things, carried on from the session before', (await get(s14p)).includes('## Last time') && (await get(s14p)).includes('- [ ] Find the buyer'));
await pg.click('#importLastBtn');
check('pressing it again refreshes the section instead of repeating it', ((await get(s14p)).match(/## Last time/g) || []).length === 1 && ((await get(s14p)).match(/Find the buyer/g) || []).length === 1);
check('no page errors (session)', errors.length === 0, errors.join('\n'));

await b.close(); proc.kill();
const fails = results.filter(r => !r).length;
console.log('\n' + (results.length - fails) + '/' + results.length + ' checks passed');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
