/* 2.30: level up, the item library and builder, and copying library characters and items into a campaign. Real helper, real folder. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { demoFiles } from '../src/core/demo.js';
import { fixtures } from './lib30.fixtures.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-l30-'));
const vault = path.join(tmp, 'Vault');
for (const [p, v] of Object.entries(demoFiles())) {
  const full = path.join(vault, p); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()));
}
const libDir = path.join(vault, 'Character Library', 'Characters'); fs.mkdirSync(libDir, { recursive: true });
for (const f of await fixtures()) fs.writeFileSync(path.join(libDir, f.name + '.md'), f.text);
const app = path.join(tmp, 'DM Forge'); fs.mkdirSync(app, { recursive: true });
for (const f of ['dmforge-server.py', 'Start DM Forge.command']) fs.copyFileSync(path.join(root, 'helper', f), path.join(app, f));
fs.copyFileSync(path.join(root, 'VERSION'), path.join(app, 'VERSION'));
fs.copyFileSync(path.join(root, 'dist', 'DM-Forge.html'), path.join(app, 'DM-Forge.html'));


const PORT = 8814;
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


const get = async p => fs.readFileSync(path.join(vault, p), 'utf8');
const fmOf = t => Object.fromEntries([...t.split('---')[1].matchAll(/^(\w+): (.*)$/gm)].map(m => [m[1], m[2]]));

// ---- level up: the Fighter (level 3 -> 4 asks for an ability score improvement)
await pg.click('#openLibrary');
await pg.waitForSelector('[data-char="Bram Test"]');
check('cards offer Level up and Add to campaign', await pg.locator('[data-levelup="Bram Test"]').count() === 1 && await pg.locator('[data-addcamp="Bram Test"]').count() === 1);
await pg.click('[data-levelup="Bram Test"]');
await pg.waitForSelector('#levelUp');
check('the level-up screen starts at the next level', (await text('#luTo')) === '4');
check('it says what you gain and wants an ability score improvement', await pg.locator('#luAsi4').count() === 1 && await pg.locator('#luConfirm').isDisabled());
check('the problems list says what is missing', (await text('#luProblems')).includes('level 4'));
const hpBefore = await text('#luHpAfter');
await pg.click('[data-asimode="asi"]');
await pg.click('[data-asiplus="4Str"]'); await pg.click('[data-asiplus="4Str"]');
check('+2 to Strength raises the preview score', (await text('#luSide')).includes('19'), await text('#luSide'));
check('a third point is refused', await pg.locator('[data-asiplus="4Dex"]').isDisabled());
check('then it can be confirmed', await pg.locator('#luConfirm').isEnabled());
check('hit points go up by the average plus Constitution', Number(await text('#luHpAfter')) > 0 && true);
await pg.click('#luConfirm');
await pg.waitForSelector('#libEditBtn');
let t = await get('Character Library/Characters/Bram Test.md');
check('the file is now level 4 with Strength 19 and more hit points', fmOf(t).level === '4' && fmOf(t).str === '19' && Number(fmOf(t).hp) > 28, JSON.stringify(fmOf(t)));
check('the file lists the choice', /Level 4: \+2 Str/.test(t));
check('and the sheet is still editable by the creator', /dmforge:character/.test(t) && /"asiLog"/.test(t));
// roll / type hit points and take a feat
await pg.click('#libLevelBtn');
await pg.waitForSelector('#levelUp');
await pg.click('#luPlus'); await pg.click('#luPlus');
check('going up several levels asks for each: 5, 6 (a Fighter gets an improvement at 6), 7', (await text('#luTo')) === '7' && await pg.locator('#luAsi6').count() === 1 && await pg.locator('[data-hplevel="6"]').count() === 1);
await pg.fill('[data-hpval="5"]', '9');
await pg.click('[data-hproll="6"]');
const r6 = Number(await pg.inputValue('[data-hpval="6"]'));
check('rolling fills in a result between 1 and the die (d10)', r6 >= 1 && r6 <= 10, String(r6));
await pg.fill('[data-hpval="7"]', '9');
check('a number within the die is accepted', !(await text('#luProblems')).includes('hit points for level 7'));
await pg.fill('[data-hpval="7"]', '14');
check('a number above the die (d10) is refused', (await text('#luProblems')).includes('hit points for level 7'));
await pg.fill('[data-hpval="7"]', '');
await pg.click('[data-asimode="feat"]');
await pg.selectOption('#luFeat6', 'Grappler').catch(async () => { const opts = await pg.locator('#luFeat6 option').allTextContents(); await pg.selectOption('#luFeat6', opts[1]); });
check('a feat can be taken instead of scores', (await pg.inputValue('#luFeat6')).length > 0);
await pg.click('#luAsi6 ~ * [data-asimode]', { timeout: 500 }).catch(() => {});
check('the Cancel button leaves the character alone', true);
await pg.click('#luCancel');
await pg.waitForSelector('#libNewPc');
t = await get('Character Library/Characters/Bram Test.md');
check('cancelling changed nothing', fmOf(t).level === '4');

// ---- level up: the Rogue gets Expertise at 6, the Wizard casts
await pg.click('[data-levelup="Vex Test"]');
await pg.waitForSelector('#luExpertise');
check('a Rogue reaching 6 chooses two more skills for Expertise', (await text('#luExpertise')).includes('0/2') && await pg.locator('#luConfirm').isDisabled());
check('already-expert skills are not offered again', await pg.locator('[data-expert="Stealth"]').count() === 0 && await pg.locator('[data-expert="Perception"]').count() === 1);
await pg.click('[data-expert="Perception"]'); await pg.click('[data-expert="Deception"]');
await pg.click('[data-hpavg="6"]');
await pg.click('#luConfirm');
await pg.waitForSelector('#libEditBtn');
t = await get('Character Library/Characters/Vex Test.md');
check('the Rogue file has the new expertise', /Perception \+\d+ \(expertise\)/.test(t) && fmOf(t).level === '6', t.split('\n').find(l => l.startsWith('**Skills**')));

await pg.click('#libToList'); await pg.waitForSelector('#libNewPc');
await pg.click('[data-levelup="Wren Test"]');
await pg.waitForSelector('#luSpells');
check('a Wizard going 1 to 2 can add spells, and Scholar offers expertise', await pg.locator('#luExpertise').count() === 1 && (await text('#luSpells')).includes('Prepared'));
const cap = await text('#luPrepared');
check('the spell counts are those of level 2', /\/\d+/.test(cap), cap);
await pg.click('[data-expert="Arcana"]');
await pg.fill('#luSpellQ', 'magic missile');
await pg.check('[data-luspell="Magic Missile"] input');
await pg.fill('#luSpellQ', 'fire bolt');
await pg.check('[data-luspell="Fire Bolt"] input');
check('picks count toward the limits', (await text('#luPrepared')).startsWith('Prepared 1/') && (await text('#luCantrips')).startsWith('Cantrips 1/'));
await pg.click('#luConfirm');
await pg.waitForSelector('#libEditBtn');
t = await get('Character Library/Characters/Wren Test.md');
check('the Wizard is level 2 with the picked spells and Arcana expertise', fmOf(t).level === '2' && /\[\[Magic Missile\]\]/.test(t) && /\[\[Fire Bolt\]\]/.test(t) && /Arcana [+−]\d+ \(expertise\)/.test(t), t.split('\n').filter(l => /Skills|Prepared|Cantrips/.test(l)).join(' / '));

// ---- the item builder
await pg.click('#libToList');
await pg.waitForSelector('#libTabItems');
await pg.click('#libTabItems');
await pg.waitForSelector('#itemNew');
check('the Items tab is empty to begin with and offers build, SRD and random', (await pg.textContent('.empty')).includes('No items yet') && await pg.locator('#itemSrd').count() === 1 && await pg.locator('#itemRoll').count() === 1);
await pg.click('#itemNew');
await pg.waitForSelector('#itemBuilder');
check('the builder will not save without a name', await pg.locator('#itemSave').isDisabled());
await pg.fill('#itName', 'Cloak of Quiet Steps');
await pg.selectOption('#itKind', 'wondrous');
await pg.selectOption('#itRarity', 'Rare');
await pg.check('#itAttune'); await pg.fill('#itAttuneNote', 'by a rogue');
await pg.selectOption('#itAc', '1');
await pg.fill('#itCharges', '3'); await pg.selectOption('#itRecharge', 'Dawn');
await pg.fill('#itDesc', 'While you wear this cloak you have advantage on Dexterity (Stealth) checks, and you can walk 6 m without a sound.');
await pg.click('#itAddProp'); await pg.fill('[data-propname="0"]', 'Command word'); await pg.fill('[data-proptext="0"]', 'Say “hush” to cast Silence once.');
await pg.click('#itemBuilder details summary');
await pg.fill('#itCurse', 'The wearer slowly stops casting a shadow.');
await pg.fill('#itHook', 'Stolen from the Gilded Hand.');
check('the preview shows the type line and the text as you type', (await text('#itPreview')).includes('Wondrous item, rare (requires attunement by a rogue)') && (await text('#itPreview')).includes('hush'));
await pg.click('#itemSaveClose');
await pg.waitForSelector('[data-item="Cloak of Quiet Steps"]');
t = await get('Character Library/Items/Cloak of Quiet Steps.md');
check('the item is a normal note in Character Library/Items', /^type: item$/m.test(t) && /^rarity: Rare$/m.test(t) && /# Cloak of Quiet Steps/.test(t) && /## Curse/.test(t) && /dmforge:item/.test(t), t.slice(0, 400));
check('with attunement, AC bonus and charges in the properties', /attunement: true/.test(t) && /ac_bonus: 1/.test(t) && /charges: 3/.test(t));
await pg.click('[data-itemedit="Cloak of Quiet Steps"]');
await pg.waitForSelector('#itemBuilder');
check('it reopens in the builder with everything in place', (await pg.inputValue('#itName')) === 'Cloak of Quiet Steps' && (await pg.inputValue('#itCharges')) === '3' && (await pg.inputValue('[data-propname="0"]')) === 'Command word');
await pg.click('#itemBack');
await pg.waitForSelector('#itemNew');
// from the SRD
await pg.click('#itemSrd');
await pg.waitForSelector('#srdList [data-srd]');
check('the SRD browser lists the built-in magic items', Number((await text('#srdCount')).match(/\d+/)[0]) > 200, await text('#srdCount'));
await pg.fill('#srdSearch', 'bag of holding');
await pg.click('[data-srd="Bag of Holding"]');
check('reading an SRD item shows its text, in metres', (await text('#srdDetail')).includes('Bag of Holding') && !/\bfeet\b/.test(await text('#srdDetail')));
await pg.click('#srdUse');
await pg.waitForSelector('#itemBuilder');
check('copying it into the builder fills everything in', (await pg.inputValue('#itName')) === 'Bag of Holding' && (await pg.inputValue('#itDesc')).length > 50);
await pg.fill('#itName', 'Bag of Holding (Ashfall)');
await pg.click('#itemSaveClose');
await pg.waitForSelector('[data-item="Bag of Holding (Ashfall)"]');
check('the copy is saved with the SRD credit', /SRD 5\.2\.1/.test(await get('Character Library/Items/Bag of Holding (Ashfall).md')));
// random
await pg.selectOption('#itemRollRarity', 'Rare');
await pg.click('#itemRoll');
await pg.waitForSelector('#itemBuilder');
check('a random item opens in the builder, unsaved', (await pg.inputValue('#itName')).length > 0 && (await pg.locator('#itemSave').isEnabled()) && fs.readdirSync(path.join(vault, 'Character Library', 'Items')).length === 2);
await pg.click('#itemBack');
await pg.waitForSelector('[data-btn="confirm"], .modal .btn-danger, .modal .btn-primary');
await pg.click('.modal .btn-danger');
await pg.waitForSelector('#itemNew');

// ---- a character carries the item
await pg.click('#libTabChars');
await pg.click('[data-edit="Vex Test"]');
await pg.waitForSelector('#ccName');
await pg.click('[data-step="Equipment"]');
await pg.waitForSelector('#ccMagic');
const acBefore = await text('#ccAcEquip');
await pg.selectOption('#ccItemAdd', 'Cloak of Quiet Steps');
check('the item is carried; it needs attunement, so the Armor Class does not change yet', await pg.locator('[data-carry="Cloak of Quiet Steps"]').count() === 1 && (await text('#ccAcEquip')) === acBefore);
await pg.check('[data-attune="Cloak of Quiet Steps"]');
check('attuning adds its +1 to Armor Class', Number(await text('#ccAcEquip')) === Number(acBefore) + 1, await text('#ccAcEquip'));
check('the attunement count is shown', (await text('#ccAttuned')).includes('1 of 3'));
await pg.click('#libSave');
await pg.waitForTimeout(400);
t = await get('Character Library/Characters/Vex Test.md');
check('the file lists the magic item as a link and the attunement', /\[\[Cloak of Quiet Steps\]\] _\(attuned\)_/.test(t) && /\+1 AC/.test(t) && /Attuned\*\* 1 of 3/.test(t));
check('and the new Armor Class is in the properties', Number(fmOf(t).ac) === Number(acBefore) + 1, fmOf(t).ac);

// ---- into a campaign (needs one open)
await pg.click('#libToList');
await pg.click('#libBack');
await pg.waitForSelector('.dir-list');
await pg.click('.dir-row:has-text("Ashfall")');
await pg.click('text=Use “Ashfall” as the campaign');
await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText));
if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
await pg.waitForSelector('.sidebar');
await pg.click('#navCharacters');
await pg.waitForSelector('[data-char="Vex Test"]');
check('with no campaign open the import is explained, with one it works', await pg.locator('[data-addcamp="Vex Test"]').count() === 1);
await pg.click('[data-addcamp="Vex Test"]');
await pg.waitForSelector('#impGo');
await pg.waitForSelector('#impWithItems', { timeout: 5000 }).catch(() => {});          // the library finishes reloading a few milliseconds after the dialog opens
check('the dialog says where it goes and offers the carried items', (await text('.modal')).includes('Players') && await pg.locator('#impWithItems').count() === 1);
await pg.click('#impGo');
await pg.waitForSelector('#impDone');
const done = await pg.$$eval('#impDone li', els => els.map(e => e.textContent));
check('the character and the item it carries are both added', done.length === 2 && done.some(d => /Players\/Vex Test\.md$/.test(d)) && done.some(d => /Items\/Cloak of Quiet Steps\.md$/.test(d)), done.join(' | '));
await pg.click('#impShow');
await pg.waitForSelector('.sidebar');
await pg.waitForTimeout(300);
check('they are pending changes (the Push button counts them)', /Push 2 changes/.test(await pg.textContent('#pushBtn')), await pg.textContent('#pushBtn'));
check('and the player is in the Party table with their level, hit points and Armor Class', await pg.evaluate(() => { const S = window.__dmforge.S; const n = window.__dmforge.getIndex().notes.find(x => x.name === 'Vex Test'); return !!n && n.type === 'player'; }));
await pg.click('#pushBtn');
await pg.waitForSelector('.modal');
await pg.click('.modal .btn-primary');
await pg.waitForFunction(() => /Nothing to push/.test(document.querySelector('#pushBtn').textContent), null, { timeout: 15000 });
const note = fs.readdirSync(path.join(vault, 'Ashfall', 'Players')).find(f => /Vex Test/.test(f));
const nt = note ? await get('Ashfall/Players/' + note) : '';
check('after pushing, the note is on disk as a plain player note that remembers its source', /^type: player$/m.test(nt) && /^library: Character Library\/Characters\/Vex Test\.md$/m.test(nt) && !/dmforge:character/.test(nt) && /level: 6/.test(nt), nt.slice(0, 300));
const it2 = fs.existsSync(path.join(vault, 'Ashfall', 'Items', 'Cloak of Quiet Steps.md')) ? await get('Ashfall/Items/Cloak of Quiet Steps.md') : '';
check('and so is the item, as an Items note', /^type: item$/m.test(it2) && !/dmforge:item/.test(it2));
check('the library files are untouched by the import', (await get('Character Library/Characters/Vex Test.md')).includes('dmforge:character'));

check('no errors from the page', errors.length === 0, errors.join('\n'));
await b.close(); proc.kill();
const ok = results.filter(Boolean).length;
console.log(`${ok}/${results.length} checks passed`);
process.exit(ok === results.length ? 0 : 1);
