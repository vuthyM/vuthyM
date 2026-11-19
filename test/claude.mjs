/* The experimental Claude buttons, end to end: a real helper on a real folder, with a stand-in for Claude Code. */
import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-claude-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
/* an app folder as the updater leaves it: this version, with the one before it in .previous */
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(path.join(app, '.previous'), { recursive: true });
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
for (const f of ['dmforge-server.py', 'Start DM Forge.command', 'README.md', 'VERSION']) fs.copyFileSync(path.join(f === 'dmforge-server.py' || f === 'Start DM Forge.command' ? path.join(root, 'helper') : root, f), path.join(app, f));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));
for (const f of ['dmforge-server.py', 'Start DM Forge.command', 'README.md']) fs.copyFileSync(path.join(app, f), path.join(app, '.previous', f));
fs.writeFileSync(path.join(app, '.previous', 'DM-Forge.html'), '<!doctype html><html><head><!--DMF_SERVER--></head><body>PREVIOUS VERSION</body></html>');
fs.writeFileSync(path.join(app, '.previous', 'VERSION'), '0.0.1\n');

/* the stand-in for Claude Code */
const log = path.join(tmp, 'claude-log.txt');
const fake = path.join(tmp, 'claude');
fs.writeFileSync(fake, `#!/bin/bash
if [ "$1" = "--version" ]; then echo "9.9.9 (Fake Claude)"; exit 0; fi
if [ "$1" = "auth" ]; then echo '{"loggedIn": true, "authMethod": "oauth_token", "apiProvider": "firstParty", "configDirectory": "/home/me/.claude"}'; exit 0; fi
{ echo "ARGS:$*"; echo "STDIN:"; cat; } > "${log}"
if grep -q FAIL-PLEASE "${log}"; then echo "Not logged in" >&2; exit 1; fi
echo "The **door** opens on a counter-weight that thumps."
`, { mode: 0o755 });

const PORT = 8792;
const proc = spawn('python3', [path.join(app, 'dmforge-server.py'), vault, '--port', String(PORT), '--no-open', '--no-update'], { env: { ...process.env, DMF_CLAUDE_BIN: fake, DMF_CONFIG_DIR: path.join(tmp, 'cfg') }, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/\?t=/.test(out); i++) await new Promise(r => setTimeout(r, 100));
const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
if (!m) { console.log('helper did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + m[1], token = m[2];
const api = (op, init = {}) => fetch(base + '/api/' + op + '?path=', { ...init, headers: { 'X-DMF-Token': token, ...(init.headers || {}) } });

check('the Claude endpoints need the token', (await fetch(base + '/api/claude-status?path=')).status === 403 && (await fetch(base + '/api/claude?path=', { method: 'POST', body: '{"prompt":"x"}' })).status === 403);
check('GET cannot ask Claude', (await api('claude')).status === 404);
const st = await (await api('claude-status')).json();
check('the helper finds Claude Code', st.available && /9\.9\.9/.test(st.version), JSON.stringify(st));
const ans = await api('claude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'hello there' }) });
check('and returns its answer as text', ans.status === 200 && (await ans.json()).text.includes('door'));
check('Claude was started with tools off and the prompt on stdin', /--tools\s+--no-session-persistence/.test(fs.readFileSync(log, 'utf8')) && fs.readFileSync(log, 'utf8').includes('STDIN:\nhello there'));
check('a bad request body is refused cleanly', (await api('claude', { method: 'POST', body: 'not json' })).status === 400);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', e => errors.push(e.message));
pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
const openApp = async () => {
  await pg.waitForSelector('.dir-list, .sidebar');
  if (await pg.locator('.sidebar').count()) return;
  await pg.click('.dir-row:has-text("Ashfall")');
  await pg.click('text=Use “Ashfall” as the campaign');
  await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
  if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
  await pg.waitForSelector('.sidebar');
};
await pg.goto(base + '/?t=' + token);
await openApp();

await pg.waitForTimeout(1500);
check('no update bar while the page and the helper run the same version', (await pg.locator('#updateBar').count()) === 0);
check('it starts switched off: no Claude buttons anywhere', (await pg.locator('#askClaudeBtn, [data-claude]').count()) === 0);
await openGen(pg, 'Shop');
check('generated results have no Expand button yet', (await pg.locator('[data-claude="expand"]').count()) === 0);
await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="claude"]');
await pg.waitForSelector('#claudeStatus .pill-good');
check('the settings say Claude Code was found, and which version', (await pg.textContent('#claudeStatus')).includes('9.9.9'));
check('they say what is and is not sent', (await pg.textContent('#claudePanel')).includes('Only text you can see is passed to it'));
await pg.click('#claudeCheck');
await pg.waitForSelector('#claudeReport');
const rep = await pg.textContent('#claudeReport');
check('Check sign-in shows which Claude Code is used, the sign-in and a test answer', rep.includes('Claude Code used:') && rep.includes('Sign-in: signed in') && rep.includes('Test question: answered') && (await pg.textContent('#claudeReportWrap')).includes('Working'), rep);
check('and the report has no secrets or prompt text', !/sk-ant|Tresadore/.test(rep));
await pg.click('#claudeReportCopy');
await pg.check('#claudeToggle');
check('the Menu button in the sidebar shows Claude is on', (await pg.textContent('#navSettings')).includes('Claude on'));
await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage'));

// 1. expand a generated result: it sends at once, and shows what it sent
const shop = pg.locator('[data-gen="shop"]');
await shop.locator('[data-claude="expand"]').click();
await pg.waitForSelector('#claudeAnswer');
check('Expand sends straight away and shows the answer, with its markdown drawn', (await pg.textContent('#claudeAnswer')).includes('The door opens') && (await pg.locator('#claudeAnswer strong').count()) === 1);
check('there was no box to skim first: the text that was sent is folded away', (await pg.locator('#claudeSent').count()) === 1 && !(await pg.locator('#claudeSent').evaluate(e => e.open)));
let sent = fs.readFileSync(log, 'utf8');
check('what was sent is the generated shop plus the request, and nothing else from the vault', sent.includes('Ashfall') && sent.includes('- **Keeper:**') && sent.includes('read aloud') && !sent.includes('Kestra Dune') && !sent.includes('Bram Ironhollow'));
check('with every tool off', /--tools\s+--no-session-persistence/.test(sent.split('\n')[0]));
await pg.click('#claudeSent summary');
const prompt = await pg.inputValue('#claudeText');
check('opening it shows exactly the text that was sent', prompt.includes('- **Keeper:**') && sent.includes(prompt.split('\n')[0]));
await pg.fill('#claudeText', prompt + '\nKeep it under 80 words.');
await pg.click('#claudeSend');
await pg.waitForFunction(() => document.querySelector('#claudeSend') && document.querySelector('#claudeSend').textContent.includes('Ask again'));
await pg.waitForTimeout(300);
sent = fs.readFileSync(log, 'utf8');
check('edit it and ask again: the edited text is what is sent', sent.includes('Keep it under 80 words.'));
await pg.click('#claudeCopy');
await pg.waitForSelector('.toast');
await pg.keyboard.press('Escape');
await pg.waitForFunction(() => !document.querySelector('.modal'));

// 2. ask about a note
await pg.click('.nav-btn:has-text("NPCs")');
await pg.click('.pane:not([hidden]) .list-item >> nth=0');
await pg.waitForSelector('#askClaudeBtn', { state: 'attached' });
const noteName = (await pg.textContent('.pane:not([hidden]) .note-head h2')).trim();
await pg.click('#askClaudeBtn');
await pg.waitForSelector('#claudeText');
check('Ask Claude on a note shows the whole note and a place for the question', (await pg.inputValue('#claudeText')).includes('This is all of it that you can see') && (await pg.inputValue('#claudeText')).trim().endsWith('My question:'));
check('Send is disabled until a question is typed', await pg.isDisabled('#claudeSend'));
await pg.fill('#claudeText', (await pg.inputValue('#claudeText')) + 'What does this NPC want?');
await pg.click('#claudeSend');
await pg.waitForSelector('#claudeAnswer');
const sent2 = fs.readFileSync(log, 'utf8');
check('only that note and the question were sent', sent2.includes('What does this NPC want?') && !sent2.includes('Kestra Dune'), sent2.slice(0, 300));

// 3. an error is explained
await pg.fill('#claudeText', 'FAIL-PLEASE');
await pg.click('#claudeSend');
await pg.waitForSelector('#claudeError');
check('a failure says what happened and what to do', (await pg.textContent('#claudeError')).includes('Not logged in') && (await pg.textContent('#claudeError')).includes('Check sign-in'));
await pg.keyboard.press('Escape');
await pg.waitForFunction(() => !document.querySelector('.modal'));

// 4. it is remembered, and turning it off removes every trace
await pg.reload();
await openApp();
check('the choice survives a reload', (await pg.textContent('#navSettings')).includes('Claude on'));
await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="claude"]'); await pg.waitForSelector('#claudeToggle');
await pg.uncheck('#claudeToggle');
await pg.click('#navBack'); await pg.waitForFunction(() => !document.querySelector('#settingsPage'));
check('turned off: the badge is gone', !(await pg.textContent('#navSettings')).includes('Claude on'));
check('and so are the buttons', (await pg.locator('#askClaudeBtn, [data-claude]').count()) === 0);

// 5. roll back
await pg.click('#navSettings'); await pg.click('#menuSettings'); await pg.click('[data-setcat="claude"]');
await pg.waitForSelector('#rollbackBtn');
check('the settings offer to go back to the previous version', (await pg.textContent('#rollbackBtn')).includes('0.0.1') && (await pg.textContent('#claudePanel')).includes('You are on ' + version));
await pg.click('#rollbackBtn');
await pg.waitForSelector('.modal button:has-text("Roll back")');
check('it asks first, and explains notes are not touched', (await pg.textContent('.modal')).includes('Your notes and unpushed changes are not touched'));
check('nothing changed yet', fs.readFileSync(path.join(app, 'VERSION'), 'utf8').trim() === version);
await pg.click('.modal button:has-text("Roll back")');
await pg.waitForSelector('#rollbackDone');
check('it says it is done and to restart', (await pg.textContent('#rollbackDone')).includes('0.0.1') && (await pg.textContent('#rollbackDone')).includes('start DM Forge again'));
check('the previous version is back in the app folder', fs.readFileSync(path.join(app, 'VERSION'), 'utf8').trim() === '0.0.1' && fs.readFileSync(path.join(app, 'DM-Forge.html'), 'utf8').includes('PREVIOUS VERSION'));
check('and the version it replaced is kept', fs.readFileSync(path.join(app, '.rolled-back', 'VERSION'), 'utf8').trim() === version && fs.readFileSync(path.join(app, '.rolled-back', 'DM-Forge.html'), 'utf8').length > 100000);
check('the vault was not touched', fs.existsSync(path.join(vault, 'Ashfall', 'NPCs')) && fs.readdirSync(path.join(vault, 'Ashfall', 'NPCs')).length >= 3);
check('the open page notices that the helper now has a different version and offers a reload', await pg.waitForSelector('#updateBar', { timeout: 15000 }).then(() => true, () => false));
check('the banner names the version and says unpushed changes are kept', (await pg.textContent('#updateBar')).includes('0.0.1') && (await pg.textContent('#updateBar')).includes('unpushed changes are kept'));
check('and has a Reload button', (await pg.locator('#reloadForUpdate').count()) === 1);
check('no page errors', errors.length === 0, errors.join('\n'));

await b.close(); proc.kill();
const fails = results.filter(r => !r).length;
console.log('\n' + (results.length - fails) + '/' + results.length + ' checks passed');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
