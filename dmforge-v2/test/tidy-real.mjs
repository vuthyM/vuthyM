/* Tidy notes against the REAL Claude Code (not the stand-in). Run by hand, now and then; it is not part of the usual chain because it
   needs Claude Code signed in and makes real requests (about a minute each).      node --import ./test/open-nav.mjs test/tidy-real.mjs
   Rough notes like the ones typed at a table go in, the real model tidies them, and the result is checked the way the app checks it:
   nothing lost, secrets in the DM part, promises kept as tasks, Prep and Recap untouched, the original restorable. The tidy version
   is printed so it can be read. Only invented sample notes are sent. */
import path from 'node:path'; import fs from 'node:fs';
import * as K from './sunday-kit.mjs';
const { check, done } = K.makeChecker();
const { sleep } = K;

const tmp = K.tmpDir('dmf-real-');
const vault = path.join(tmp, 'Vault'); fs.mkdirSync(vault);
const made = K.bigVault(vault);
const C = made.campaign;
const SESSION = `${C}/Sessions/${made.play}.md`;
const [PLACE, PLACE2] = [made.places[3], made.places[4]];
const NPC1 = made.npcs[0], NPC2 = made.npcs[5], FACTION = made.factions[2];

const h = await K.startHelper({ vault, tmp, env: { DMF_NO_LOGIN_SHELL: '1' } });          // no DMF_CLAUDE_BIN: the helper finds the real claude
const chk = await (await h.api('claude-check', '', { method: 'POST' })).json();
console.log(chk.report || JSON.stringify(chk));
if (!chk.ok) { console.log('Claude Code is not usable here, so this test cannot run.'); await h.stop(); process.exit(2); }
const b = await K.launch();
const pg = await K.openApp(b, h, C, { ctx: await b.newContext({ viewport: { width: 1360, height: 900 } }) });
const get = p => K.getNote(pg, p);
await pg.evaluate(() => window.__dmforge.A.setClaudeOn(true));
await pg.evaluate(p => { window.__dmforge.A.setCurrentSession(p); window.__dmforge.A.goto(p); }, SESSION);
await pg.waitForSelector('#noteTitle');

/* the notes as they really come out at a table: lower case, typos, run-ons, shorthand, a secret, tags, a promise and a hook */
const typed = [
  [`party gets to ${PLACE} late, raining hard. ${NPC1.toLowerCase()} waiting at the gate, wants them to find his brother`],
  ['brother is in the cellar under ' + PLACE2 + ' prob dead, ' + NPC1.split(' ')[0].toLowerCase() + ' doesnt know', 'reveal'],
  ['ambush on the road 4 goblins + 1 ogre, kestra got hit for 9, bram dropped the ogre w a crit'],
  ['35 gp, a silver ring (25gp) and 2 potions of healing', 'loot'],
  ['Secret: the ring is cursed, DC 15 arcana to notice. curse = disadvantage on saves vs fear'],
  [`talked to ${NPC2.toLowerCase()} at the inn, she lied abt the ledger, sorrel noticed`],
  [`party sided w the watch not the ${FACTION}`, 'decision'],
  ['ladders cost half movement, ok for the rest of the campaign', 'ruling'],
  ['return the ring to the innkeeper by friday', 'promise'],
  ['who opened the gate at night??', 'hook'],
  ['pip used his last 3rd lvl slot on fireball, killed 6 skeletons in the crypt'],
  ['sorrel did a great job keeping everyone up', 'spotlight'],
];
for (const [t, tag] of typed) await pg.evaluate(([t, tag]) => window.__dmforge.A.logLine(t, tag), [t, tag]);
const before = await get(SESSION);
check('twelve rough lines are logged', (before.match(/^- (\[ \] )?\d\d:\d\d /gm) || []).length === 12);
const slice = (s, a, z) => s.slice(s.indexOf(a), s.indexOf(z));

await pg.click('#tidyBtn'); await pg.waitForSelector('#tdSend');
check('Send to Claude is available (Claude is on)', !(await pg.isDisabled('#tdSend')));
const t0 = Date.now();
await pg.click('#tdSend'); await pg.waitForSelector('#jobPill');
await pg.waitForFunction(() => /ready|failed/.test((document.querySelector('#jobPill') || {}).textContent || ''), null, { timeout: 240000 });
const secs = Math.round((Date.now() - t0) / 1000);
const state = await pg.textContent('#jobPill');
check('the real Claude answered, and DM Forge could use the answer (' + secs + ' s)', /ready/.test(state), state);
if (!/ready/.test(state)) { await pg.click('#jobPill'); await pg.waitForSelector('#tdError'); console.log('ERROR SHOWN:', await pg.textContent('#tdError')); await b.close(); await h.stop(); process.exit(done() || 1); }
await pg.click('#jobPill'); await pg.waitForSelector('#tdReview');
const tidy = await pg.inputValue('#tdTidy');
console.log('\n================ THE REAL CLAUDE\'S TIDY VERSION ================\n' + tidy + '\n=================================================================\n');
const missing = await pg.locator('#tdMissing').count() ? await pg.textContent('#tdMissing') : '';
const added = await pg.locator('#tdAdded').count() ? await pg.textContent('#tdAdded') : '';
const leaks = await pg.locator('#tdLeaks').count() ? await pg.textContent('#tdLeaks') : '';
console.log('CHECK PANEL:', (await pg.textContent('#tdCheck')).replace(/\s+/g, ' '));

check('it is organised by scene, in order, with headings and bullets', /^### .+/m.test(tidy) && (tidy.match(/^- /gm) || []).length >= 8);
check('nothing from your notes is missing (every name, number and link)', !missing, missing);
check('nothing was added that is not in your notes', !added, added);
check('no secret is outside the DM part', !leaks);
const beforeSecrets = tidy.split(/^###\s+Secrets/im)[0];
check('the cursed ring and its DC are only under the Secrets heading', /### Secrets/i.test(tidy) && !/cursed|DC 15/i.test(beforeSecrets) && /cursed/i.test(tidy.split(/^###\s+Secrets/im)[1] || ''), beforeSecrets.slice(-200));
check('the promise and the hook are left out of the text (the app keeps them as tasks)', !/return the ring to the innkeeper/i.test(tidy) && !/who opened the gate/i.test(tidy));
check('every number from the table is still there (9, 4, 35, 25, 15, 2, 3, 6)', ['9', '4', '35', '25', '15', '2', '3', '6'].every(n => new RegExp('(?<![\\d.])' + n + '(?![\\d])').test(tidy)));
check('the ruling, the decision and the loot carry their labels', /\*\*Ruling:\*\*/.test(tidy) && /\*\*Decision:\*\*/.test(tidy) && /\*\*Loot:\*\*/.test(tidy), tidy.slice(0, 300));
const links = [...tidy.matchAll(/\[\[([^\]|]+)/g)].map(m => m[1]);
const known = await pg.evaluate(ls => ls.map(n => !!window.__dmforge.getIndex().resolve(n)), links);
check('every [[link]] it wrote points at a real note (' + links.length + ' links)', links.length >= 2 && known.every(Boolean), JSON.stringify(links.filter((l, i) => !known[i])));
check('the people from the notes are linked (' + NPC1 + ', ' + NPC2 + ')', links.some(l => l.toLowerCase() === NPC1.toLowerCase()) && links.some(l => l.toLowerCase() === NPC2.toLowerCase()), JSON.stringify(links));
check('no chatty introduction or closing line', !/^(here|sure|certainly|of course|i have|i\'ve)/i.test(tidy.trim()) && !/(let me know|hope this helps)/i.test(tidy));

await pg.click('#tdApply'); await pg.waitForFunction(() => !document.querySelector('.modal'));
const after = await get(SESSION);
check('Prep and the players\' Recap are byte for byte what they were', slice(after, '## Prep', '## Recap') === slice(before, '## Prep', '## Recap'));
check('the promise and the hook are kept as tasks exactly as typed', /- \[ \] \d\d:\d\d #promise return the ring to the innkeeper by friday/.test(after) && /- \[ \] \d\d:\d\d #hook who opened the gate at night\?\?/.test(after));
const orig = after.match(/<!-- dmforge:original[^\n]*\n([\s\S]*?)\n-->/);
check('your twelve lines are kept exactly as typed in the hidden original', !!orig && typed.every(([t]) => orig[1].includes(t)));
await pg.evaluate(() => window.__dmforge.A.setSection('overview')); await pg.waitForSelector('#forgetCard');
check('What am I forgetting? still finds both', /return the ring to the innkeeper/.test(await pg.textContent('[data-fg="waiting"]')) && /who opened the gate/.test(await pg.textContent('[data-fg="waiting"]')));
await pg.evaluate(p => { window.__dmforge.S.dialog = { kind: 'playersafe', path: p }; window.__dmforge.emit(); }, SESSION);
await pg.waitForSelector('#psText');
const safe = await pg.inputValue('#psText');
check('the player-safe copy has the story but not the curse or the original', /goblin/i.test(safe) && !/cursed|DC 15|disadvantage on saves/i.test(safe) && !safe.includes('dmforge'), safe.slice(0, 300));
await pg.keyboard.press('Escape');
await pg.evaluate(p => window.__dmforge.A.restoreOriginalNote(p), SESSION);
const back = await get(SESSION);
check('Put back my original returns exactly what was typed', !back.includes('dmforge:tidy') && typed.every(([t]) => back.includes(t)) && slice(back, '## Prep', '## Recap') === slice(before, '## Prep', '## Recap'));
check('no page errors', pg.errors.length === 0, pg.errors.join('\n'));

const log = fs.existsSync(path.join(h.cfg, 'claude.log')) ? fs.readFileSync(path.join(h.cfg, 'claude.log'), 'utf8') : '';
console.log('\nHELPER\'S LOG OF CLAUDE REQUESTS (times and results only):\n' + log.split('\n').slice(-6).join('\n'));
await b.close(); await h.stop(); K.rm(tmp);
process.exit(done());
