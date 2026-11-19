/* The tour, the session zero kit and the sample campaign, end to end: a real helper on a real folder, with a stand-in for Claude Code. */
import { chromium } from '../../jsd/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-o26-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));


const PORT = 8805;
const app2 = app;
const proc = spawn('python3', [path.join(app2, 'dmforge-server.py'), vault, '--port', String(PORT), '--no-open', '--no-update'], { env: { ...process.env, DMF_CONFIG_DIR: path.join(tmp, 'cfg') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { proc.kill(); } catch (e) { /* gone */ } });
let out = '';
proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/\?t=/.test(out); i++) await new Promise(r => setTimeout(r, 100));
const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
if (!m) { console.log('helper did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + m[1], token = m[2];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
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
const get = p => pg.evaluate(p => window.__dmforge.S.working.get(p), p);
const comb = () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__dmforge.S.combat)));
const row = name => pg.locator('.c-row', { hasText: name });
const amt = async (name, n) => { await row(name).locator('input[aria-label^="Amount"]').fill(String(n)); };


const open = p => pg.evaluate(p => window.__dmforge.A.goto(p), p);
const onDisk = p => fs.existsSync(path.join(vault, p));
const read = p => fs.readFileSync(path.join(vault, p), 'utf8');

// ---- the tour
await pg.waitForSelector('#startCard');
check('a new campaign shows the start card with the tour, the session zero kit and the sample campaign', await pg.locator('#startTour').count() === 1 && await pg.locator('#startKit').count() === 1 && await pg.locator('#startSample').count() === 1);
await pg.click('#startTour');
await pg.waitForSelector('#tour');
check('the tour starts with a welcome and says nothing is written until you push', (await pg.textContent('#tourTitle')).includes('Welcome') && (await pg.textContent('#tourText')).includes('Push') && await pg.locator('#tourSpot').count() === 0);
const titles = [await pg.textContent('#tourTitle')], spots = [];
for (let i = 0; i < 14; i++) {
  await pg.click('#tourNext');
  await pg.waitForTimeout(450);
  titles.push(await pg.textContent('#tourTitle'));
  const sp = await pg.evaluate(() => { const e = document.querySelector('#tourSpot'); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), inView: r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight }; });
  spots.push(sp);
  if (i === 2) check('the note stop goes to a note, and lights up its title', (await pg.textContent('#tourTitle')).includes('Notes you can change') && sp && await pg.locator('#noteTitle').count() === 1, JSON.stringify(sp));
}
check('it has 15 stops, in order, ending with “That is the tour”', titles.length === 15 && titles[0].includes('Welcome') && titles[14].includes('That is the tour'), titles.join(' | '));
check('every stop that points at something lights it up, on screen', spots.slice(0, 13).filter(x => x && x.w > 20 && x.inView).length >= 12, JSON.stringify(spots));
check('the last stop has Finish', (await pg.textContent('#tourNext')) === 'Finish');
await pg.click('#tourNext');
await pg.waitForFunction(() => !document.querySelector('#tour'));
check('Finish closes it and remembers you took it', await pg.evaluate(() => localStorage.getItem('dmforge:tour')) === 'seen');
await pg.evaluate(() => { window.__dmforge.A.startTour(); });
await pg.waitForSelector('#tour');
await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowLeft');
check('the arrow keys move through it', (await pg.textContent('#tourTitle')).includes('Your campaign'), await pg.textContent('#tourTitle'));
await pg.keyboard.press('Escape');
check('Esc leaves it', await pg.locator('#tour').count() === 0);
await pg.click('#navSettings'); await pg.click('#menuTour');
await pg.waitForSelector('#tour');
check('the Menu can start it again', (await pg.textContent('#tourTitle')).includes('Welcome'));
await pg.click('#tourSkip');

// ---- the session zero kit
await pg.click('#navSettings'); await pg.click('#menuStarter');
await pg.waitForSelector('#szStep');
check('the kit has four steps, starting with the campaign', await pg.locator('.sz-steps li').count() === 4 && (await pg.textContent('.sz-steps li.on')).includes('The campaign'));
await pg.fill('#szPremise', 'A drowned city rises, bell by bell.');
await pg.fill('#szSetting', 'The Salt Marches');
await pg.click('[data-tone="Mystery"]'); await pg.click('[data-tone="Dark"]');
await pg.selectOption('#szP-combat', 'A lot'); await pg.fill('#szLevel', '3');
await pg.click('#szNext');
check('step two is the table: schedule, lines and veils, safety tools, house rules', await pg.locator('#szLines').count() === 1 && await pg.locator('[data-tool]').count() >= 4 && await pg.locator('[data-house]').count() >= 5);
await pg.fill('#szSchedule', 'Fortnightly, Tuesday 7pm'); await pg.fill('#szLen', '3 hours');
await pg.fill('#szLines', 'harm to children\nspiders'); await pg.fill('#szVeils', 'romance');
await pg.click('[data-tool="script"]'); await pg.click('[data-house="0"]'); await pg.fill('#szCustom', 'Natural 1 on a save: a small mishap');
await pg.click('#szNext');
const pl = n => pg.locator('[data-pl="' + n + '"]');
await pl(0).locator('input').nth(0).fill('Angelo'); await pl(0).locator('input').nth(1).fill('LeBron James'); await pl(0).locator('input').nth(2).fill('Rogue');
await pg.click('#szAddPlayer');
await pl(1).locator('input').nth(0).fill('Paris'); await pl(1).locator('input').nth(1).fill('Lola Chudington'); await pl(1).locator('input').nth(2).fill('Wizard');
await pg.fill('#szThread', 'The Drowned Bell');
await pg.click('#szNext');
const sum = await pg.textContent('#szSummary');
check('the last step lists every note it will make', ['Session Zero', 'Session Zero Questionnaire', 'LeBron James', 'Lola Chudington', 'The Drowned Bell', 'Session 1'].every(x => sum.includes(x)), sum);
await pg.click('#szBack'); await pg.click('#szNext');
await pg.click('#szCreate');
await pg.waitForFunction(() => !document.querySelector('.modal'));
const zero = await get('Ashfall/Session Zero.md');
check('Session Zero has the premise, tone, level, schedule, lines, veils, safety tools and house rules', !!zero && zero.includes('A drowned city rises') && zero.includes('**Tone:** Mystery, Dark') && zero.includes('**Starting level:** 3') && zero.includes('Fortnightly, Tuesday 7pm (3 hours each)') && zero.includes('- harm to children') && zero.includes('- romance') && zero.includes('Script change tools') && zero.includes('Roll death saves in the open') && zero.includes('Natural 1 on a save'), String(zero).slice(0, 400));
check('the questionnaire is made', (await get('Ashfall/Session Zero Questionnaire.md') || '').includes('Who is your character, in a sentence?'));
const lb = await get('Ashfall/Players/LeBron James.md');
check('each player is a note under Players with their class, level and who plays them', !!lb && /player: Angelo/.test(lb) && /class: Rogue/.test(lb) && /level: 3/.test(lb) && lb.includes('## Hooks for the DM'), String(lb));
check('and the first plot thread is active', /status: Active/.test(await get('Ashfall/Plot Threads/The Drowned Bell.md') || ''));
const ps = await pg.evaluate(() => window.__dmforge.S.working.paths());
const s13 = ps.find(p => /Sessions\/.*Session 13\.md$/.test(p));
check('Session 13 (the next one) is made with a prep outline: scenes with times, secrets and clues, must happen', !!s13 && (await get(s13)).includes('## Scenes') && (await get(s13)).includes('- [ ] The opening scene (20 min)') && (await get(s13)).includes('## Secrets and clues') && (await get(s13)).includes('MUST HAPPEN'));
check('and the Session Zero note is opened for you', (await pg.textContent('#noteTitle')) === 'Session Zero', await pg.textContent('#noteTitle').catch(() => ''));
// the timer reads the scenes the kit planned
await open(s13);
await pg.click('#timerChip'); await pg.waitForSelector('#timerScenes');
check('the session timer picks up those scenes', (await pg.textContent('#timerScenes')).includes('The opening scene') && (await pg.textContent('#timerPace')).includes('planned 70 min'), await pg.textContent('#timerPace'));
await pg.click('#timerClose');
await pg.click('#pushBtn'); await pg.waitForSelector('#confirmPush'); await pg.click('#confirmPush');
await pg.waitForTimeout(1200);
check('pushing writes them to the vault', onDisk('Ashfall/Session Zero.md') && onDisk('Ashfall/Players/LeBron James.md') && onDisk('Ashfall/Players/Lola Chudington.md'));

// ---- the sample campaign, added to the vault
await pg.keyboard.press('Escape');
await pg.click('#navSettings');
await pg.waitForSelector('#menuSample');
check('an ordinary campaign has no "Remove the sample campaign" in the Menu', await pg.locator('#menuRemoveSample').count() === 0);
await pg.click('#menuSample');
await pg.waitForSelector('#sampleFolder');
check('the dialog suggests a new folder and says it never overwrites', (await pg.inputValue('#sampleFolder')) === 'Ashfall (sample)' && (await pg.textContent('.modal')).includes('never writes into a folder that already has something in it'));
await pg.fill('#sampleFolder', 'Ashfall');
await pg.click('#sampleGo');
await pg.waitForSelector('#sampleError');
check('a folder that already has notes is refused, so nothing is overwritten', (await pg.textContent('#sampleError')).includes('already a folder'));
fs.mkdirSync(path.join(vault, 'Character Library/Characters'), { recursive: true });
fs.writeFileSync(path.join(vault, 'Character Library/Characters/Mira Vell.md'), 'my own Mira');
check('the dialog offers the example characters, off by default', !(await pg.locator('#sampleChars').isChecked()));
await pg.click('#sampleChars');
check('and says they go in their own Examples section', (await pg.textContent('.modal')).includes('own Examples section'));
await pg.fill('#sampleFolder', 'Ashfall (sample)');
await pg.click('#sampleGo');
await pg.waitForSelector('#sampleDone');
const n = Number((/Added (\d+) notes/.exec(await pg.textContent('#sampleDone')) || [])[1]);
check('it writes the whole sample into the new folder, on disk right away', n >= 15 && onDisk('Ashfall (sample)/NPCs/Mireille Vane.md') && onDisk('Ashfall (sample)/Sessions/2026-10-12 Session 12.md') && onDisk('Ashfall (sample)/Plot Threads/The Missing Bells.md'), String(n));
check('the whole showcase is written: the Bestiary, clocks and the cheat sheet (and no image files)', n >= 65 && !onDisk('Ashfall (sample)/Maps/Greenhold Map.svg') && onDisk('Ashfall (sample)/Bestiary/Nym, Choirmaster.md') && onDisk('Ashfall (sample)/Clocks and Standing.md') && onDisk('Ashfall (sample)/DM Cheat Sheet.md'), String(n));
check('the example characters are in Character Library/Examples, marked as examples, never among your own', onDisk('Character Library/Examples/Archmage Vaelith.md') && /example: true/.test(read('Character Library/Examples/Archmage Vaelith.md')) && !onDisk('Character Library/Characters/Archmage Vaelith.md') && read('Character Library/Characters/Mira Vell.md') === 'my own Mira' && (await pg.textContent('#sampleDone')).includes('Examples'));
check('the sample campaign\'s own note is marked as a sample', /dmforge_sample: true/.test(read('Ashfall (sample)/Ashfall.md')));
check('your own campaign was not changed by it', read('Ashfall/NPCs/Mireille Vane.md') === (await get('Ashfall/NPCs/Mireille Vane.md')));
await pg.click('#sampleClose');
await pg.click('#navSettings'); await pg.click('#menuSample'); await pg.waitForSelector('#sampleFolder');
await pg.click('#sampleGo'); await pg.waitForSelector('#sampleError');
check('doing it again with the same name is refused too', (await pg.textContent('#sampleError')).includes('already a folder'));
await pg.keyboard.press('Escape');
// open the new campaign: it is already sorted into categories, so there is no mapping step
await pg.click('#campMenuBtn'); await pg.click('#campSwitch');
if (await pg.locator('.modal .btn-primary:has-text("Switch campaign")').count()) await pg.click('.modal .btn-primary:has-text("Switch campaign")');
await pg.waitForSelector('.dir-row:has-text("Ashfall (sample)")');
await pg.click('.dir-row:has-text("Ashfall (sample)")');
await pg.click('text=Use “Ashfall (sample)” as the campaign');
await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
check('the sample campaign opens straight into the app, with its Bestiary as a category', await pg.locator('.sidebar').count() === 1 && (await pg.locator('.nav-btn:has-text("Bestiary")').count()) === 1);
// remove the sample again: notes you added or changed stay
fs.writeFileSync(path.join(vault, 'Ashfall (sample)/NPCs/My Own NPC.md'), '# My Own NPC\nmine');
fs.appendFileSync(path.join(vault, 'Ashfall (sample)/NPCs/Old Tam.md'), '\nmy edit');
await pg.click('#navSettings'); await pg.waitForSelector('#menuRemoveSample');
// (the sample is open from the step above, but the notes on disk changed, so reload what the app sees)
check('the sample campaign offers to be removed', await pg.locator('#menuRemoveSample').count() === 1);
await pg.click('#menuRemoveSample');
await pg.click('.modal .btn-danger');
await pg.waitForSelector('.dir-list');
check('removing it takes away the sample notes you did not change', !onDisk('Ashfall (sample)/NPCs/Mireille Vane.md') && !onDisk('Ashfall (sample)/Ashfall.md') && !onDisk('Ashfall (sample)/Sessions/2026-11-02 Session 14.md'));
check('and keeps the ones you added or changed', onDisk('Ashfall (sample)/NPCs/My Own NPC.md') && /my edit/.test(read('Ashfall (sample)/NPCs/Old Tam.md')));
check('the example characters and your own campaign are not touched', onDisk('Character Library/Examples/Archmage Vaelith.md') && onDisk('Ashfall/NPCs/Mireille Vane.md'));
check('no page errors (onboarding)', errors.length === 0, errors.join('\n'));

await b.close(); proc.kill();
const fails = results.filter(r => !r).length;
console.log('\n' + (results.length - fails) + '/' + results.length + ' checks passed');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
