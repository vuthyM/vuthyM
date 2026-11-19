/* The tour, the session zero kit and the sample campaign, end to end: a real helper on a real folder, with a stand-in for Claude Code. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-l28-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));


const PORT = 8812;
const app2 = app;
const proc = spawn('python3', [path.join(app2, 'dmforge-server.py'), vault, '--port', String(PORT), '--no-open', '--no-update'], { env: { ...process.env, DMF_CONFIG_DIR: path.join(tmp, 'cfg') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { proc.kill(); } catch (e) { /* gone */ } });
let out = '';
proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
for (let i = 0; i < 50 && !/\?t=/.test(out); i++) await new Promise(r => setTimeout(r, 100));
const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
if (!m) { console.log('helper did not start:\n' + out); process.exit(1); }
const base = 'http://127.0.0.1:' + m[1], token = m[2];


const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', e => errors.push(e.message));
pg.on('console', msg => { if (msg.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_/.test(msg.text())) errors.push(msg.text()); });
await pg.goto(base + '/?t=' + token);
await pg.waitForSelector('.dir-list, .sidebar');
const onDisk = p => fs.existsSync(path.join(vault, p));
const read = p => fs.readFileSync(path.join(vault, p), 'utf8');
const next = async () => { await pg.click('#ccNext'); await pg.waitForTimeout(80); };
const text = sel => pg.textContent(sel);

// ---- open the library from the campaign picker
check('the campaign picker has a Character Library button', await pg.locator('#openLibrary').count() === 1);
await pg.click('#openLibrary');
await pg.waitForSelector('#libNewPc:not([disabled])');
check('an empty library says so and offers a new player character and a new NPC', (await pg.textContent('.empty')).includes('No characters of your own yet') && await pg.locator('#libNewNpc').count() === 1);

// ---- make a level 5 wizard
await pg.click('#libNewPc');
await pg.fill('#ccName', 'Thessaly Brightwater');
await pg.click('[data-class="Wizard"]');
await pg.click('[data-level="5"]');
check('a subclass can be chosen from level 3, and Evoker is the SRD one', (await pg.locator('#ccSub option').allTextContents()).includes('Evoker'));
check('the class skill count starts at 0 of 2', (await text('#ccSkillCount')).includes('0 of 2'));
await pg.click('[data-skill="Investigation"]'); await pg.click('[data-skill="Insight"]');
check('two skills chosen is 2 of 2', (await text('#ccSkillCount')).includes('2 of 2'));
await pg.click('[data-skill="Medicine"]');
check('a third skill is refused', (await text('#ccSkillCount')).includes('2 of 2') && !(await pg.locator('[data-skill="Medicine"].on').count()));
check('features show up to level 5 for the class and subclass', (await pg.locator('.cc-feat summary').allTextContents()).join('|').includes('Memorize Spell') && (await pg.locator('.cc-feat summary').allTextContents()).join('|').includes('Potent Cantrip'));
await next();
await pg.click('[data-species="Elf"]');
await pg.click('[data-bg="Sage"]');
await pg.selectOption('#ccBgA', 'Int'); await pg.selectOption('#ccBgB', 'Con');
check('Elf shows its SRD traits', (await pg.locator('.cc-feat summary').allTextContents()).join('|').includes('Fey Ancestry'));
await next();
check('standard array is suggested for a Wizard: Int and Con highest', await pg.locator('#ccSide').textContent().then(t => t.includes('INT') && t.includes('17')));
check('hit points use the average: 32 for a level 5 Wizard with Con 15', (await text('#ccHp')) === '32', await text('#ccHp'));
check('armour class is 10 + Dex when unarmoured: 11', (await text('#ccAc')) === '11');
await pg.click('[data-method="buy"]');
check('point buy starts with 27 points', (await text('#ccPoints')).includes('27 of 27'));
for (let i = 0; i < 9; i++) await pg.click('[data-pb="Int+"]');
check('point buy stops at 15 and spends 9 points', (await text('#ccPoints')).includes('18 of 27'));
await pg.click('[data-method="roll"]');
check('rolling gives six numbers', await pg.locator('.cc-abl tr').count() === 6);
await pg.click('[data-method="man"]');
await pg.fill('[data-ab="Int"]', '15'); await pg.fill('[data-ab="Con"]', '13');
await pg.click('[data-method="std"]');
check('back to the standard array', await pg.locator('select[data-ab]').count() === 6);
await next();
// ---- spells
check('a caster gets the Spells step', await pg.locator('.cc-step[data-step="Spells"]').count() === 1);
check('level 5 Wizard: 4 cantrips and 9 prepared from the SRD tables', (await text('#ccCantrips')).includes('0/4') && (await text('#ccPrepared')).includes('0/9'), (await text('#ccCantrips')) + (await text('#ccPrepared')));
await pg.fill('#ccSpellQ', 'fire');
await pg.waitForTimeout(100);
check('searching finds Fire Bolt (cantrip) and Fireball (level 3)', await pg.locator('[data-spell="Fire Bolt"]').count() === 1 && await pg.locator('[data-spell="Fireball"]').count() === 1);
await pg.fill('#ccSpellQ', '');
const boxes = pg.locator('.cc-spell');
const pick = async (lvTag, n) => { const els = await pg.locator('.cc-spell:has(.cc-lvl:text-is("' + lvTag + '")) input').all(); for (const e of els.slice(0, n)) await e.click(); };
await pick('C', 5);
check('cantrips stop at the limit of 4', (await text('#ccCantrips')).includes('4/4'));
await pick('L1', 4); await pick('L2', 3); await pick('L3', 3);
check('prepared spells stop at 9', (await text('#ccPrepared')).includes('9/9'), await text('#ccPrepared'));
check('no spells above the level 3 slots are offered', (await pg.locator('.cc-lvl').allTextContents()).every(t => ['C', 'L1', 'L2', 'L3'].includes(t)));
await next();
// ---- equipment
check('the Wizard kit and the gold option are offered', await pg.locator('[data-kit="A"]').count() === 1 && await pg.locator('[data-kit="B"]').count() === 1 && (await text('[data-kit="A"]')).includes('Spellbook'));
await pg.fill('#ccGear', 'Plate Armor'); await pg.click('#ccGearAdd');
check('adding Plate Armor makes AC 18', (await text('#ccAcEquip')) === '18', await text('#ccAcEquip'));
await pg.click('.cc-chip .cc-x');
check('removing it puts AC back to 11', (await text('#ccAcEquip')) === '11');
await pg.fill('#ccGear', 'Shield'); await pg.click('#ccGearAdd');
check('a shield adds 2', (await text('#ccAcEquip')) === '13');
await next();
// ---- details
check('Standard depth is the default only after you pick it: Basics is open', await pg.locator('[data-section="basics"]').count() === 1 && await pg.locator('[data-section="back"]').count() === 0);
await pg.click('[data-depth="deep"]');
check('Deep opens every section for a player character', await pg.locator('[data-section]').count() === 11 - 1 /* the NPC-only one */, await pg.locator('[data-section]').count());
await pg.click('[data-depth="quick"]');
check('Quick is just the basics', await pg.locator('[data-section]').count() === 1);
await pg.click('[data-depth="std"]');
check('Standard adds appearance and personality', await pg.locator('[data-section]').count() === 3);
await pg.fill('#cd-concept', 'A scholar who follows her missing master\'s trail of burnt notebooks.');
await pg.fill('#cd-player', 'Sam');
await pg.selectOption('#cd-align', 'Neutral Good');
await pg.click('[data-add="back"]');
await pg.fill('#cd-grew', 'Raised in Ael Varen.\nSecond line of text.');
await pg.click('[data-more="basics"]');
await pg.fill('#cd-age', '112');
await pg.click('[data-suggest="flaw"]');
check('the suggest button fills a flaw from the table', (await pg.inputValue('#cd-flaw')).length > 10);
await pg.fill('#ccCustomName', 'Pets'); await pg.click('#ccCustomAdd');
await pg.fill('[data-custom="Pets"] textarea', 'A raven named Footnote.');
await pg.fill('#ccCustomName', 'Features'); await pg.click('#ccCustomAdd');
check('a heading the file already uses (Features) is refused', await pg.locator('[data-custom="Features"]').count() === 0);
await next();
// ---- review
check('review lists what is still open, and none for a finished build', await pg.locator('#ccProblems').count() === 0 || !(await text('#ccProblems')).includes('name'));
await pg.click('#ccFileTab');
const file = await text('#ccFile');
check('the file tab shows frontmatter, sections and the details', file.includes('type: character') && file.includes('## Features') && file.includes('## Pets') && file.includes('**Where did they grow up?**'));
check('the file has the SRD credit', file.includes('Creative Commons Attribution 4.0'));
check('distances are metric', file.includes('speed: 9 m'));
await pg.click('#ccFinish');
await pg.waitForSelector('[data-char="Thessaly Brightwater"]');
const P = 'Character Library/Characters/Thessaly Brightwater.md';
check('it is written to Character Library/Characters at the vault root', onDisk(P));
const saved = read(P);
check('the saved file has the numbers (HP 32, AC 13, Int 17) and a hidden state comment', /hp: 32/.test(saved) && /ac: 13/.test(saved) && /int: 17/.test(saved) && saved.includes('<!-- dmforge:character'));
check('the card shows level, species, class and HP', (await text('[data-char="Thessaly Brightwater"]')).includes('Level 5') && (await text('[data-char="Thessaly Brightwater"]')).includes('Elf Wizard'));
check('nothing was written inside a campaign', !fs.existsSync(path.join(vault, 'Ashfall', 'Character Library')));

// ---- edit it again: the picks come back
await pg.click('[data-edit="Thessaly Brightwater"]');
await pg.waitForSelector('#ccName');
check('editing restores the name, level and class', (await pg.inputValue('#ccName')) === 'Thessaly Brightwater' && await pg.locator('[data-level="5"].on').count() === 1 && await pg.locator('[data-class="Wizard"].on').count() === 1);
await pg.click('.cc-step[data-step="Spells"]');
check('the spell picks come back (4 cantrips, 9 prepared)', (await text('#ccCantrips')).includes('4/4') && (await text('#ccPrepared')).includes('9/9'));
await pg.click('.cc-step[data-step="Details"]');
check('the details come back from the file, including your own section', (await pg.inputValue('#cd-concept')).includes('burnt notebooks') && (await pg.inputValue('#cd-grew')).includes('Second line') && await pg.locator('[data-custom="Pets"]').count() === 1);
await pg.click('#libToList');
await pg.waitForSelector('[data-char]');
await pg.waitForTimeout(700);

// ---- an edit made in Obsidian survives
fs.writeFileSync(path.join(vault, P), read(P).replaceAll('A scholar who follows her missing master\'s trail of burnt notebooks.', 'Edited in Obsidian.'));
await pg.click('[data-edit="Thessaly Brightwater"]');
await pg.waitForSelector('#ccName');
await pg.click('.cc-step[data-step="Details"]');
check('text changed in Obsidian is what the creator shows', (await pg.inputValue('#cd-concept')) === 'Edited in Obsidian.', await pg.inputValue('#cd-concept'));
// rename on save
await pg.click('.cc-step[data-step="Class"]');
await pg.fill('#ccName', 'Thessaly the Bright');
await pg.click('#libSaveClose');
await pg.waitForSelector('[data-char="Thessaly the Bright"]');
check('renaming moves the file (the old one goes to the trash)', onDisk('Character Library/Characters/Thessaly the Bright.md') && !onDisk(P));
// copy
await pg.click('[data-copy="Thessaly the Bright"]');
await pg.waitForSelector('[data-char="Thessaly the Bright copy"]');
check('Copy makes "Thessaly the Bright copy"', onDisk('Character Library/Characters/Thessaly the Bright copy.md'));
// a quick NPC
await pg.click('#libNewNpc');
await pg.fill('#ccName', 'Old Haldor');
await pg.click('[data-class="Cleric"]');
check('an NPC can be made quickly: Details has Basics and no Player field, with a role', true);
await pg.click('.cc-step[data-step="Details"]');
check('the NPC details have "Running this NPC" available and no PC-only sections', await pg.locator('[data-add="run"]').count() === 1 && await pg.locator('[data-add="hooks"]').count() === 0 && await pg.locator('#cd-player').count() === 0 && await pg.locator('#cd-role').count() === 1);
await pg.click('#libSaveClose');
await pg.waitForSelector('[data-char="Old Haldor"]');
check('NPC files say kind: npc', /kind: npc/.test(read('Character Library/Characters/Old Haldor.md')));
await pg.click('button:has-text("NPCs")');
check('the NPC filter hides players', await pg.locator('[data-char]').count() === 1);
await pg.click('button:has-text("All")');
// a file that was not made in the creator
fs.writeFileSync(path.join(vault, 'Character Library/Characters/Plain Note.md'), '---\ntype: character\nclass: Rogue\nlevel: 3\n---\n# Plain\nJust a note.\n');
await pg.reload(); await pg.waitForSelector('#openLibrary'); await pg.click('#openLibrary'); await pg.waitForSelector('[data-char]');
check('a plain markdown file is listed, viewable, and not editable', await pg.locator('[data-char="Plain Note"]').count() === 1 && await pg.locator('[data-edit="Plain Note"]').isDisabled());
await pg.click('[data-open="Plain Note"]');
check('viewing a plain note shows its text', (await text('.cc-file')).includes('Just a note.'));
await pg.click('#libToList');
// view a sheet, print button exists
await pg.click('[data-open="Old Haldor"]');
check('the sheet shows abilities and features', (await text('.cc-sheet')).includes('Abilities and saves') && (await text('.cc-sheet')).includes('Features'));
check('there is a print button', await pg.locator('#libPrint').count() === 1);
await pg.click('#libToList');
// delete
await pg.click('[data-delete="Thessaly the Bright copy"]');
await pg.click('.modal .btn-danger');
await pg.waitForFunction(() => !document.querySelector('[data-char="Thessaly the Bright copy"]'));
check('delete moves the file to the trash', !onDisk('Character Library/Characters/Thessaly the Bright copy.md'));

// ---- example characters are kept apart from yours
const shipped = (await import('../src/core/showcase.js')).EXAMPLE_CHARS;
for (const n of ['Archmage Vaelith', 'Brother Anselm']) fs.writeFileSync(path.join(vault, 'Character Library/Characters/' + n + '.md'), shipped[n]);
await pg.click('#libBack'); await pg.waitForSelector('#openLibrary'); await pg.click('#openLibrary');
await pg.waitForSelector('#libLoose');
check('two example characters sitting among yours are noticed', (await text('#libLoose')).includes('2 example characters'));
check('they are shown with yours until moved', await pg.locator('#libMine [data-char="Archmage Vaelith"]').count() === 1);
await pg.click('#libMoveLoose');
await pg.waitForFunction(() => !document.querySelector('#libLoose'));
check('moving them puts them in Character Library/Examples, marked as examples', onDisk('Character Library/Examples/Archmage Vaelith.md') && /example: true/.test(read('Character Library/Examples/Brother Anselm.md')) && !onDisk('Character Library/Characters/Archmage Vaelith.md'));
check('your own list no longer has them, and the Examples section counts two', await pg.locator('#libMine [data-char="Archmage Vaelith"]').count() === 0 && (await text('#libToggleExamples')).includes('Examples (2)'));
check('right after the move the Examples section is open, so you see where they went', await pg.locator('#libExamples [data-char]').count() === 2);
await pg.click('#libToggleExamples');
check('and it collapses again', await pg.locator('#libExamples [data-char]').count() === 0);
await pg.click('#libToggleExamples');
check('opening shows them, marked Example', await pg.locator('#libExamples [data-char="Archmage Vaelith"]').count() === 1 && (await text('#libExamples [data-char="Archmage Vaelith"]')).includes('Example'));
await pg.click('#libExamples [data-edit="Archmage Vaelith"]');
await pg.waitForSelector('#ccName');
await pg.click('#libSaveClose');
await pg.waitForSelector('#libExamples');
check('editing an example keeps it in Examples', onDisk('Character Library/Examples/Archmage Vaelith.md') && !onDisk('Character Library/Characters/Archmage Vaelith.md') && /example: true/.test(read('Character Library/Examples/Archmage Vaelith.md')));
await pg.click('#libExamples [data-copy="Brother Anselm"]');
await pg.waitForSelector('#libMine [data-char="Brother Anselm copy"]');
check('a copy of an example is yours: it goes among your own characters', onDisk('Character Library/Characters/Brother Anselm copy.md') && !/example: true/.test(read('Character Library/Characters/Brother Anselm copy.md')));
await pg.click('#libRemoveExamples');
await pg.click('.modal .btn-danger');
await pg.waitForFunction(() => !document.querySelector('#libExamples'));
check('Remove all examples takes only the examples (they go to the trash)', !onDisk('Character Library/Examples/Archmage Vaelith.md') && !onDisk('Character Library/Examples/Brother Anselm.md') && onDisk('Character Library/Characters/Brother Anselm copy.md') && onDisk('Character Library/Characters/Old Haldor.md'));

// ---- from inside a campaign
await pg.click('#libBack');
await pg.waitForSelector('.dir-list');
await pg.click('.dir-row:has-text("Ashfall")');
await pg.click('text=Use “Ashfall” as the campaign');
await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
await pg.waitForSelector('.sidebar');
await pg.click('#navCharacters');
await pg.waitForSelector('[data-char]');
check('the Characters button in the campaign opens the same library', await pg.locator('[data-char="Old Haldor"]').count() === 1);
check('Back returns to the campaign', (await text('#libBack')).includes('Ashfall'));
await pg.click('#libBack');
await pg.waitForSelector('.sidebar');
check('the campaign is as it was left', await pg.locator('.sidebar').count() === 1);

check('no page errors', errors.length === 0, errors.join(' | '));
await b.close(); proc.kill();
const failed = results.filter(r => !r).length;
console.log(failed ? failed + ' FAILED' : 'all ' + results.length + ' passed');
process.exit(failed ? 1 : 0);
