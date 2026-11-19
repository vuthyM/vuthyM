/* Tidy notes, end to end: a messy campaign, the real helper, and a stand-in for Claude that can misbehave on purpose.
   The checks are about what matters: nothing of yours is lost or changed, the original comes back exactly, promises keep working
   in What am I forgetting? and Close out, secrets stay out of the player-safe copy, and a tidy version that lost or invented
   something is caught before it is applied. */
import path from 'node:path'; import fs from 'node:fs';
import * as K from './sunday-kit.mjs';
const { check, done } = K.makeChecker();
const { sleep } = K;

const tmp = K.tmpDir('dmf-tidy-');
const vault = path.join(tmp, 'Vault'); fs.mkdirSync(vault);
const made = K.bigVault(vault);
const C = made.campaign;
const SESSION = `${C}/Sessions/${made.play}.md`;
const NPC_A = made.npcs[5];
const MET = 'met ' + NPC_A.toLowerCase() + ' at the ford, he wants 50 gold for the crossing';

/* a stand-in for Claude: it tidies by keeping every line, grouping them, labelling tags and linking names it was offered.
   Words in the notes make it misbehave: DROP-NUMBER, INVENT, LEAK, GARBAGE. */
const fake = path.join(tmp, 'claude');
const calls = path.join(tmp, 'calls.txt');
fs.writeFileSync(fake, `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('9.9.9 (Fake Claude)'); process.exit(0); }
if (a[0] === 'auth') { console.log('{"loggedIn": true}'); process.exit(0); }
let input = '';
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => { fs.appendFileSync(${JSON.stringify(calls)}, '=====CALL=====\\n' + input + '\\n'); setTimeout(() => respond(input), 400); });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function respond(p) {
  if (/Here are my tidied notes/.test(p)) { console.log('### At a glance\\n- **Who:** the people from the notes'); return; }
  const notes = p.split('=== MY ROUGH NOTES ===\\n')[1] || '';
  const last = notes.split('\\n').filter(l => l.trim() && !/^\\s*[-*]\\s+\\[[ xX]\\]/.test(l)).pop() || '';      // only the newest line can make it misbehave
  const flag = w => new RegExp(w).test(last);
  if (flag('GARBAGE')) { console.log('I could not do that, sorry.'); return; }
  const names = ((p.split('=== PEOPLE, PLACES AND FACTIONS I CAN LINK ===\\n')[1] || '').split('\\n\\n')[0] || '').split('\\n').map(x => x.replace(/^- /, '')).filter(x => x && x !== '(none)');
  const part = /part (\\d+) of (\\d+)/.exec(p);
  const glance = /End with "### At a glance"/.test(p);
  const body = [], secrets = [];
  for (let l of notes.split('\\n')) {
    if (!l.trim() || /^##\\s/.test(l) || /^\\s*[-*]\\s+\\[[ xX]\\]/.test(l)) continue;
    if (/secret:/i.test(l) && !flag('LEAK')) { secrets.push(l.replace(/^\\s*-\\s+/, '- ')); continue; }
    l = l.replace(/^(\\s*-\\s+)(\\d\\d:\\d\\d)\\s+#(reveal|loot|decision|ruling|spotlight)\\s+/, (m, b, t, tag) => b + t + ' **' + cap(tag) + ':** ');
    l = l.replace(/^(\\s*-\\s+\\d\\d:\\d\\d\\s+)#(reveal|loot|decision|ruling|spotlight)\\b\\s*/, '$1');
    for (const n of names) l = l.replace(new RegExp('\\\\b' + n.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\b', 'i'), m => '[[' + n + ']]');
    if (flag('DROP-NUMBER')) l = l.replace(/\\d+(?!:)/g, '');
    body.push(l.replace(/^\\s*-\\s+/, '- '));
  }
  let out = '### ' + (part ? 'Part ' + part[1] : 'The evening') + '\\n' + body.join('\\n');
  if (flag('INVENT')) out += '\\n- The boss, Zargon the Red, attacked with 777 goblins';
  if (secrets.length) out += '\\n\\n### Secrets (DM only)\\n' + secrets.join('\\n');
  if (glance) out += '\\n\\n### At a glance\\n- **Who:** everyone';
  console.log(out);
}
`, { mode: 0o755 });

const h = await K.startHelper({ vault, tmp, env: { DMF_CLAUDE_BIN: fake } });
const b = await K.launch();
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const pg = await K.openApp(b, h, C, { ctx });
const get = p => K.getNote(pg, p);
const callCount = () => (fs.existsSync(calls) ? (fs.readFileSync(calls, 'utf8').match(/=====CALL=====/g) || []).length : 0);
const lastCall = () => { const t = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').split('=====CALL=====').pop() : ''; return t; };
await pg.evaluate(() => window.__dmforge.A.setClaudeOn(true));
await pg.evaluate(p => { window.__dmforge.A.setCurrentSession(p); window.__dmforge.A.goto(p); }, SESSION);
await pg.waitForSelector('#noteTitle');

const log = async lines => { for (const [t, tag] of lines) await pg.evaluate(([t, tag]) => window.__dmforge.A.logLine(t, tag), [t, tag]); };
const typed = [
  [MET],
  ['tam is working for the Ember Court', 'reveal'],
  ['silver ring from the goblin chief, worth 25gp', 'loot'],
  ['return the ring to the innkeeper by friday', 'promise'],
  ['who left the gate open at night?', 'hook'],
  ['party sided with the watch', 'decision'],
  ['Secret: the ring is cursed (DC 15 to notice)'],
  ['rested at the inn, 3 hours'],
];
await log(typed);
const before = await get(SESSION);
check('eight lines are logged, and the note has its Prep and the players\' Recap', before.includes('<!-- dmforge:log -->') && before.includes('## Prep') && before.includes('## Recap'));
const prepSlice = s => s.slice(s.indexOf('## Prep'), s.indexOf('## Recap'));
const recapSlice = s => s.slice(s.indexOf('## Recap'), s.indexOf('## Session log'));

/* ================= the dialog ================= */
await pg.click('#tidyBtn');
await pg.waitForSelector('#tdSections');
check('Tidy notes opens, listing the sections: the log is ticked, Prep and Recap are left alone', await pg.isChecked('[data-td="h:session log"] input') && await pg.isDisabled('[data-td="h:prep"] input') && await pg.isDisabled('[data-td="h:recap"] input') && /left exactly as it is/.test(await pg.textContent('[data-td="h:prep"]')), await pg.textContent('#tdSections'));
check('and says how many lines are in the log', /8 lines/.test(await pg.textContent('[data-td="h:session log"]')));
await pg.click('#tdSent summary');
const prompt = await pg.textContent('#tdPrompt');
check('what will be sent is shown: the typed lines, not Prep or the players\' recap', prompt.includes('50 gold for the crossing') && !prompt.includes('Open at ') && !prompt.includes('Recap\n'), prompt.slice(0, 200));
check('and it offers the names the notes mention for linking', prompt.includes('- ' + NPC_A), prompt.slice(prompt.indexOf('I CAN LINK'), prompt.indexOf('I CAN LINK') + 200));
check('and tells Claude to keep wording, add nothing, and put secrets in their own part', /never invent|do not add anything/i.test(prompt) && /Secrets \(DM only\)/.test(prompt));

/* ================= Claude tidies, in the background, while you keep logging ================= */
const c0 = callCount();
await pg.click('#tdSend');
await pg.waitForSelector('#jobPill');
check('Send closes the window and the work carries on in the top bar', await pg.locator('.modal').count() === 0 && /Tidy notes/.test(await pg.textContent('#jobPill')));
await log([['a line typed while Claude was reading']]);
await pg.waitForFunction(() => /ready/.test((document.querySelector('#jobPill') || {}).textContent || ''), null, { timeout: 40000 });
check('one question was sent, and nothing was changed in the note meanwhile', callCount() === c0 + 1 && !(await get(SESSION)).includes('<!-- dmforge:tidy -->'));
await pg.click('#jobPill');
await pg.waitForSelector('#tdReview');
const orig = await pg.inputValue('#tdOriginal'), tidy0 = await pg.inputValue('#tdTidy');
check('the review shows what you typed on the left and the tidy version on the right', orig.includes(MET) && tidy0.includes('### The evening') && tidy0.includes('**Reveal:**'));
check('names are linked, and the secret is in its own DM part', tidy0.includes('[[' + NPC_A + ']]') && /### Secrets \(DM only\)\n- .*ring is cursed/.test(tidy0), tidy0);
check('the promise and the hook are not in the tidy text (the app keeps them as tasks)', !/return the ring to the innkeeper/.test(tidy0) && !/who left the gate open/.test(tidy0));
check('nothing is lost and nothing made up: the check says so', await pg.locator('#tdClean').count() === 1 || (await pg.locator('#tdMissing').count()) === 0, await pg.textContent('#tdCheck'));
check('Apply is available', !(await pg.isDisabled('#tdApply')));
await pg.click('#tdApply');
await pg.waitForFunction(() => !document.querySelector('.modal'));
const after = await get(SESSION);

/* ================= what the note looks like now ================= */
check('Prep is byte for byte what it was', prepSlice(after) === prepSlice(before));
check('the players\' Recap is byte for byte what it was', after.includes(recapSlice(before).trimEnd()));
check('the title and properties are untouched', after.startsWith(before.slice(0, before.indexOf('## Prep'))));
check('the tidy version is in the note, under Session notes', after.includes('## Session notes\n<!-- dmforge:tidy -->') && after.includes('**Loot:** silver ring from the goblin chief, worth 25gp'));
check('the promise and the hook stay as tasks, exactly as typed', /<!-- dmforge:log -->\n- \[ \] \d\d:\d\d #promise return the ring to the innkeeper by friday\n- \[ \] \d\d:\d\d #hook who left the gate open at night\?\n<!-- \/dmforge:log -->/.test(after), after.slice(after.indexOf('Promises')));
check('the line typed while Claude was working was not lost', after.includes('### Added while tidying\n- ') && after.includes('a line typed while Claude was reading'));
const origBlock = after.match(/<!-- dmforge:original[^\n]*\n([\s\S]*?)\n-->/);
check('your notes as typed are kept in one hidden comment, every line', !!origBlock && typed.every(([t]) => origBlock[1].includes(t)) && origBlock[1].includes('a line typed while Claude was reading'));
check('the raw log is no longer a visible section', !after.replace(/<!-- dmforge:original[\s\S]*?-->/, '').includes('## Session log'));
const shown = await pg.evaluate(() => document.querySelector('#noteTitle').closest('.card').innerText);
check('reading the note in DM Forge shows the tidy version once, not the original as well', (shown.match(/50 gold for the crossing/g) || []).length === 1 && !/dmforge:original/.test(shown), String((shown.match(/50 gold for the crossing/g) || []).length));
check('the strip says it was tidied and offers the original', await pg.locator('#tidyStrip').count() === 1 && await pg.locator('#tidyShowOrig').count() === 1);

/* ================= everything that reads the note still works ================= */
await pg.evaluate(() => window.__dmforge.A.setSection('overview'));
await pg.waitForSelector('#forgetCard');
const waiting = await pg.textContent('[data-fg="waiting"]');
check('What am I forgetting? still finds the promise and the hook', waiting.includes('return the ring to the innkeeper') && waiting.includes('who left the gate open'), waiting.slice(0, 300));
await pg.evaluate(p => window.__dmforge.A.goto(p), SESSION);
await pg.waitForSelector('#closeoutBtn'); await pg.click('#closeoutBtn'); await pg.waitForSelector('#coPrompt, #coSent');
await pg.click('#coSent summary');
const coPrompt = await pg.textContent('#coPrompt');
check('Close out reads the tidy version (and not the original as well)', coPrompt.includes('**Reveal:** tam is working for the Ember Court') && !coPrompt.includes('dmforge:original') && (coPrompt.match(/50 gold for the crossing/g) || []).length === 1, coPrompt.slice(coPrompt.indexOf('MY NOTES'), coPrompt.indexOf('MY NOTES') + 300));
await pg.keyboard.press('Escape');
await pg.evaluate(p => { window.__dmforge.S.dialog = { kind: 'playersafe', path: p }; window.__dmforge.emit(); }, SESSION);
await pg.waitForSelector('#psText');
const safe = await pg.inputValue('#psText');
check('the player-safe copy has the tidy notes, without the secret, the original, or the DM section', safe.includes('50 gold for the crossing') && !/cursed/i.test(safe) && !/Secret/i.test(safe) && !safe.includes('dmforge'), safe.slice(0, 400));
await pg.keyboard.press('Escape');
/* ================= push, reload, and the original comes back exactly ================= */
await K.pushAll(pg);
const disk = fs.readFileSync(path.join(vault, SESSION), 'utf8');
check('on disk: the tidy version, the tasks and the original are all there', disk === after && disk.includes('<!-- dmforge:tidy -->') && disk.includes('<!-- dmforge:original'));
check('and in Obsidian\'s reading view the original is a comment, so it is hidden (one comment, closed)', (disk.match(/<!-- dmforge:original/g) || []).length === 1 && /\n-->\n$/.test(disk));
const pg2 = await K.openApp(b, h, C, { ctx: await b.newContext({ viewport: { width: 1360, height: 900 } }) });
await pg2.evaluate(p => window.__dmforge.A.goto(p), SESSION); await pg2.waitForSelector('#tidyStrip');
check('opening the campaign fresh shows the tidied note with its strip', true);
await pg2.click('#tidyShowOrig'); await pg2.waitForSelector('#tdOrigText');
check('Show my original shows exactly what was typed', (await pg2.inputValue('#tdOrigText')).includes(MET) && (await pg2.inputValue('#tdOrigText')).includes('Secret: the ring is cursed (DC 15 to notice)'));
await pg2.click('#tdPutBack'); await pg2.click('.modal button:has-text("Put them back")');
await sleep(300);
const back = await pg2.evaluate(p => window.__dmforge.S.working.get(p), SESSION);
check('Put back my original removes the tidy version and the tasks block, and returns every typed line', !back.includes('dmforge:tidy') && !back.includes('dmforge:original') && !back.includes('## Session notes') && typed.every(([t]) => back.includes(t)) && back.includes('a line typed while Claude was reading'));
check('the log block is back as one block, with its heading, and Prep and Recap are still exactly as they were', (back.match(/<!-- dmforge:log -->/g) || []).length === 1 && back.includes('## Session log') && prepSlice(back) === prepSlice(before));
await K.pushAll(pg2);
check('pushing the restored note writes the original back to disk, and the tidy version is gone from the vault', !fs.readFileSync(path.join(vault, SESSION), 'utf8').includes('dmforge:'.concat('tidy')) && fs.readFileSync(path.join(vault, SESSION), 'utf8').includes(MET));
await pg2.close();

/* ================= a tidy version that went wrong is caught ================= */
async function tidyWith(marker) {
  await pg.evaluate(p => window.__dmforge.A.goto(p), SESSION);
  await pg.evaluate(m => window.__dmforge.A.logLine(m), marker);
  await pg.click('#tidyBtn'); await pg.waitForSelector('#tdSend');
  await pg.click('#tdSend'); await pg.waitForSelector('#jobPill');
  await pg.waitForFunction(() => /ready|failed/.test((document.querySelector('#jobPill') || {}).textContent || ''), null, { timeout: 40000 });
}
// restore the pushed state first: the app holds the "put back" result as pending, so drop it
await pg.evaluate(() => window.__dmforge.A.reloadCampaign());
await sleep(1500);
await pg.waitForSelector('.sidebar');

await tidyWith('DROP-NUMBER the ferry costs 40 gold and there were 12 guards');
await pg.click('#jobPill'); await pg.waitForSelector('#tdReview');
check('when Claude leaves out numbers, the review says which, and Apply waits until you have looked', await pg.locator('#tdMissing').count() === 1 && /40/.test(await pg.textContent('#tdMissing')) && await pg.isDisabled('#tdApply'), await pg.textContent('#tdCheck'));
await pg.click('#tdAccept');
check('ticking "I have looked" lets you apply', !(await pg.isDisabled('#tdApply')));
await pg.fill('#tdTidy', (await pg.inputValue('#tdTidy')) + '\n- the ferry costs 40 gold and there were 12 guards');
check('or you can put the missing details back in the text, and the warning clears', await pg.locator('#tdMissing').count() === 0 || !/40|12/.test(await pg.textContent('#tdMissing')), await pg.textContent('#tdCheck'));
await pg.click('#tdDiscard'); await sleep(200);
check('throwing it away changes nothing in the note', !(await get(SESSION)).includes('dmforge:tidy'));

await pg.evaluate(() => window.__dmforge.A.clearJob());
await tidyWith('INVENT a quiet evening');
await pg.click('#jobPill'); await pg.waitForSelector('#tdReview');
check('when Claude makes something up, the review highlights it (a name and a number) but does not block', await pg.locator('#tdAdded').count() === 1 && /Zargon/.test(await pg.textContent('#tdAdded')) && /777/.test(await pg.textContent('#tdAdded')) && !(await pg.isDisabled('#tdApply')), await pg.textContent('#tdCheck'));
await pg.click('#tdDiscard'); await pg.evaluate(() => window.__dmforge.A.clearJob());

await tidyWith('LEAK the vault code is 4471');
await pg.click('#jobPill'); await pg.waitForSelector('#tdReview');
check('when a secret ends up outside the DM part, the review warns that players could see it', await pg.locator('#tdLeaks').count() === 1 && /cursed/.test(await pg.textContent('#tdLeaks')), await pg.textContent('#tdCheck'));
await pg.click('#tdDiscard'); await pg.evaluate(() => window.__dmforge.A.clearJob());

await tidyWith('GARBAGE reply please');
check('when Claude gives nothing usable the pill turns red', await pg.locator('#jobPill.failed').count() === 1);
await pg.click('#jobPill'); await pg.waitForSelector('#tdError');
check('and says so, with a way to try again or dismiss', /nothing I can use/.test(await pg.textContent('#tdError')) && await pg.locator('#tdRetry').count() === 1);
await pg.click('#tdFailed button:has-text("Dismiss")');
check('Dismiss clears it, and the note is still as it was', await pg.locator('#jobPill').count() === 0 && !(await get(SESSION)).includes('dmforge:tidy'));

/* ================= without Claude ================= */
await pg.evaluate(() => window.__dmforge.A.setClaudeOn(false));
await pg.evaluate(p => window.__dmforge.A.goto(p), SESSION);
await pg.click('#tidyBtn'); await pg.waitForSelector('#tdPlain');
check('with Claude off, Send is greyed out but Tidy without Claude works', await pg.isDisabled('#tdSend') && !(await pg.isDisabled('#tdPlain')));
const cN = callCount();
await pg.click('#tdPlain'); await pg.waitForSelector('#tdReview');
const plainTidy = await pg.inputValue('#tdTidy');
check('the plain version is a timeline with tags as labels, secrets in the DM part, and nothing reworded', plainTidy.includes('### Timeline') && /\*\*Loot:\*\* silver ring from the goblin chief, worth 25gp/.test(plainTidy) && /### Secrets \(DM only\)\n- .*cursed/.test(plainTidy), plainTidy);
check('and no question was sent to Claude', callCount() === cN);
await pg.click('#tdApply'); await pg.waitForFunction(() => !document.querySelector('.modal'));
const plainDone = await get(SESSION);
check('applying it works the same way: the original is kept, promises stay as tasks', plainDone.includes('dmforge:original') && /#promise return the ring/.test(plainDone) && !plainDone.replace(/<!-- dmforge:original[\s\S]*?-->/, '').includes('## Session log'));
await pg.evaluate(() => window.__dmforge.A.setClaudeOn(true));

/* ================= tidying again ================= */
await pg.evaluate(() => window.__dmforge.A.logLine('typed after the first tidy'));
await pg.click('#tidyAgain'); await pg.waitForSelector('#tdAgain');
check('Tidy again says it will start from the original plus what was typed since', /starts from your original notes/.test(await pg.textContent('#tdAgain')));
await pg.evaluate(() => window.__dmforge.A.setClaudeOn(true));
await pg.click('#tdSend'); await pg.waitForSelector('#jobPill');
await pg.waitForFunction(() => /ready/.test((document.querySelector('#jobPill') || {}).textContent || ''), null, { timeout: 40000 });
const sentAgain = lastCall();
check('the second question has the original lines and the new one, each once', (sentAgain.match(/50 gold for the crossing/g) || []).length === 1 && sentAgain.includes('typed after the first tidy'), String((sentAgain.match(/50 gold for the crossing/g) || []).length));
await pg.click('#jobPill'); await pg.waitForSelector('#tdReview');
await pg.click('#tdApply'); await pg.waitForFunction(() => !document.querySelector('.modal'));
const again = await get(SESSION);
const ob = again.match(/<!-- dmforge:original[^\n]*\n([\s\S]*?)\n-->/);
check('after tidying twice: one tidy block, one original, and the new line is in both', (again.match(/<!-- dmforge:tidy -->/g) || []).length === 1 && (again.match(/<!-- dmforge:original/g) || []).length === 1 && !!ob && /typed after the first tidy/.test(ob[1]) && /typed after the first tidy/.test(again.split('<!-- dmforge:original')[0]), JSON.stringify({ tidy: (again.match(/<!-- dmforge:tidy -->/g) || []).length, orig: (again.match(/<!-- dmforge:original/g) || []).length, inOrig: !!ob && /typed after the first tidy/.test(ob[1]), inTidy: /typed after the first tidy/.test(again.split('<!-- dmforge:original')[0]), tail: again.slice(-600) }));

/* ================= a long night ================= */
await pg.evaluate(p => window.__dmforge.A.goto(p), SESSION);
await pg.evaluate(() => { const A = window.__dmforge.A; for (let i = 0; i < 260; i++) A.logLine('long night line ' + i + ' in the cellar under the old mill with some more words to pad it out, ' + (i * 3 + 7) + ' coins', i % 40 === 0 ? 'loot' : undefined); A.logLine('Secret: the cellar door code is 9913'); });
await pg.click('#tidyAgain').catch(() => pg.click('#tidyBtn'));
await pg.waitForSelector('#tdSend');
const cLong = callCount();
await pg.click('#tdSend'); await pg.waitForSelector('#jobPill');
await pg.waitForFunction(() => /ready|failed/.test((document.querySelector('#jobPill') || {}).textContent || ''), null, { timeout: 90000 });
const longCalls = callCount() - cLong;
check('a very long night is sent in several parts, one after the other (' + longCalls + ' calls), then a summary', longCalls >= 4, String(longCalls));
await pg.click('#jobPill'); await pg.waitForSelector('#tdReview');
const longTidy = await pg.inputValue('#tdTidy');
check('the parts come back in order, as one tidy version, with every line', longTidy.indexOf('### Part 1') < longTidy.indexOf('### Part 2') && longTidy.includes('long night line 0 ') && longTidy.includes('long night line 259 '));
check('all the secrets are gathered under one heading', (longTidy.match(/### Secrets/g) || []).length === 1 && /9913/.test(longTidy.split('### Secrets')[1]));
check('and there is one At a glance', (longTidy.match(/### At a glance/g) || []).length === 1);
check('and the check finds nothing missing across all the parts', await pg.locator('#tdMissing').count() === 0, await pg.textContent('#tdCheck'));
await pg.click('#tdDiscard'); await pg.evaluate(() => window.__dmforge.A.clearJob());

check('no page errors through all of it', pg.errors.length === 0, pg.errors.slice(0, 4).join('\n'));
await b.close(); await h.stop(); K.rm(tmp);
process.exit(done());
