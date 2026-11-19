/* 2.40: live panel, improvised NPCs, create from the log box, outline, prep check, who is likely there, prepared encounters, more templates. Full demo campaign. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1500, height: 1200 } })).newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
await pg.evaluate(() => localStorage.setItem('dmforge:sp-cast', '1'));
const P = '.pane:not([hidden]) ';
const open = name => pg.evaluate(n => { const x = window.__dmforge.getIndex().notes.find(y => y.name === n); window.__dmforge.A.goto(x.path); }, name);
const note = name => pg.evaluate(n => { const x = window.__dmforge.getIndex().notes.find(y => y.name === n); return x ? { path: x.path, body: x.body, text: window.__dmforge.S.working.get(x.path), type: x.type, fm: x.fm } : null; }, name);
const domClick = sel => pg.evaluate(s => document.querySelector(s).click(), sel);
const nav = label => pg.evaluate(l => [...document.querySelectorAll('.nav-btn')].find(e => new RegExp(l).test(e.textContent)).click(), label);

// ---- a fresh session to prep
await pg.evaluate(() => window.__dmforge.A.createSession({ title: 'The Long Night', date: '2026-12-31', number: 90, word: 'Session' }));
const sname = 'Session 90 - The Long Night';
await open(sname);
await pg.waitForSelector(P + '#castStrip');

// ---- prep check
check('the prep check says how many things to look at', /\d+ things? to look at/.test(await pg.textContent(P + '#prepCount')), await pg.textContent(P + '#prepCount'));
await pg.click(P + '#prepCheck summary');
check('a session with no MUST HAPPEN list is flagged, with a fix', await pg.locator(P + '[data-gap="must"] [data-fix="must"]').count() === 1);
check('and one with no NPCs linked', await pg.locator(P + '[data-gap="cast"]').count() === 1);
await pg.click(P + '[data-fix="must"]');
await pg.waitForTimeout(200);
check('the fix adds a MUST HAPPEN list under Prep', (await note(sname)).body.includes('MUST HAPPEN') && await pg.locator(P + '[data-gap="must"] [data-fix]').count() === 0);
check('and the check then says it is empty until you fill it in', /empty/.test(await pg.textContent(P + '[data-gap="must"]')));

// ---- cast: improvise an NPC
const place = await pg.evaluate(() => window.__dmforge.getIndex().byType.location.find(l => /Cinder/.test(l.name)).name);
await pg.evaluate(([n, p]) => window.__dmforge.A.saveNoteEdit(window.__dmforge.getIndex().notes.find(x => x.name === n).path, { body: window.__dmforge.getIndex().notes.find(x => x.name === n).body + '\nThe party meets in [[' + p + ']].\n' }), [sname, place]);
await pg.waitForSelector(P + '#castLikely [data-addlikely]');
check('places the session mentions suggest the people placed there', await pg.locator(P + '#castLikely [data-addlikely]').count() >= 1);
const likelyName = await pg.getAttribute(P + '#castLikely [data-addlikely]', 'data-addlikely');
await pg.click(P + '#castLikely [data-addlikely]');
await pg.waitForTimeout(200);
check('one click adds them to the cast', (await note(sname)).body.includes('[[' + likelyName + ']]') && await pg.locator(P + '#castNpcs [data-cast="' + likelyName + '"]').count() === 1);
await pg.click(P + '#castImprov');
await pg.waitForSelector('#improv');
const first = await pg.inputValue('#improvName');
check('Improvise an NPC rolls someone with a look, voice and quirk', first.length > 2 && (await pg.textContent('#improv .improv-rows')).length > 20);
check('placed at the session\'s place by default', (await pg.inputValue('#improvAt')) === place, await pg.inputValue('#improvAt'));
let changed = false;
for (let i = 0; i < 6 && !changed; i++) { await pg.click('#improvReroll'); changed = (await pg.inputValue('#improvName')) !== first; }
check('Roll again gives someone else', changed);
const improvName = await pg.inputValue('#improvName');
await pg.click('#improvSave');
await pg.waitForTimeout(250);
const made = await note(improvName);
check('Save makes the NPC, placed there', !!made && made.type === 'npc' && made.text.includes('[[' + place + ']]'), made && made.text);
const after = await note(sname);
check('adds them to the session\'s cast', after.body.includes('[[' + improvName + ']]'));
check('and logs that they were met', after.body.includes('Met [[' + improvName + ']]'));

// ---- the live panel
await pg.click(P + '#mode-run');
await pg.click(P + '#liveBtn');
await pg.waitForSelector(P + '#livePanel');
check('Live opens a panel on the session', await pg.locator(P + '#livePanel').count() === 1);
check('with the MUST HAPPEN list', await pg.locator(P + '#liveMust').count() === 1);
await pg.evaluate(p => { const A = window.__dmforge.A; A.saveNoteEdit(p, { body: window.__dmforge.getIndex().byPath.get(p).body.replace('> - [ ] \n', '> - [ ] Find the cellar key\n') }); }, after.path);
await pg.waitForSelector(P + '#liveMust .live-task');
await pg.click(P + '#liveMust .live-task input');
await pg.waitForTimeout(200);
check('ticking a MUST HAPPEN item ticks it in the note', (await note(sname)).body.includes('> - [x] Find the cellar key'));
// formatting in the list (bold, italic, code) shows as formatting, not as ** and _ marks (2.47.2)
await pg.evaluate(p => { window.__dmforge.A.saveNoteEdit(p, { body: window.__dmforge.getIndex().byPath.get(p).body.replace('> - [x] Find the cellar key\n', '> - [x] Find the cellar key\n> - [ ] **Bart** points them at the **Redbrands** _(early)_ and `a code word`\n') }); }, after.path);
await pg.waitForFunction(sel => document.querySelectorAll(sel).length === 2, P + '#liveMust .live-task');
const fm = await pg.evaluate(sel => { const t = document.querySelectorAll(sel)[1]; return { html: t.querySelector('.inline-md').innerHTML, text: t.textContent, label: t.querySelector('input').getAttribute('aria-label') }; }, P + '#liveMust .live-task');
check('bold, italic and code in a MUST HAPPEN item show as formatting in Live', fm.html.includes('<strong>Bart</strong>') && fm.html.includes('<strong>Redbrands</strong>') && fm.html.includes('<em>(early)</em>') && fm.html.includes('<code>a code word</code>'), fm.html);
check('and no ** or _ marks are left on the screen', !/[*_`]/.test(fm.text), fm.text);
check('a ticked item is still struck through, formatting and all', await pg.evaluate(sel => getComputedStyle(document.querySelector(sel + '.done .inline-md')).textDecorationLine.includes('line-through'), P + '#liveMust .live-task'));
check('the checkbox is named in plain words for a screen reader', fm.label === 'Bart points them at the Redbrands (early) and a code word', fm.label);
await pg.evaluate(() => window.__dmforge.A.logLine('The **cellar door** was _open_'));
check('a formatted log line shows as formatting in the recent lines', (await pg.innerHTML(P + '#liveRecent')).includes('<strong>cellar door</strong>') && !/[*]/.test(await pg.textContent(P + '#liveRecent')), await pg.innerHTML(P + '#liveRecent'));
// only one session is live at a time (2.47.3)
const other = await pg.evaluate(n => window.__dmforge.getIndex().byType.session.find(x => x.name !== n).path, sname);
const otherName = await pg.evaluate(p => window.__dmforge.getIndex().byPath.get(p).name, other);
check('Live is on for this session', await pg.evaluate(p => window.__dmforge.S.live === window.__dmforge.getIndex().notes.find(x => x.name === p).path, sname));
await pg.evaluate(p => window.__dmforge.A.goto(p), other);
await pg.click(P + '#mode-run'); await pg.waitForSelector(P + '#liveBtn');
check('another session is not live: no Live panel on it', await pg.locator(P + '#livePanel').count() === 0);
check('and its Live button is not pressed', (await pg.getAttribute(P + '#liveBtn', 'aria-pressed')) === 'false');
await pg.click(P + '#liveBtn'); await pg.waitForSelector(P + '#livePanel');
check('pressing Live on it makes it live', await pg.locator(P + '#livePanel').count() === 1 && (await pg.getAttribute(P + '#liveBtn', 'aria-pressed')) === 'true');
check('and the log box now points at it', await pg.evaluate(p => window.__dmforge.A.currentSessionPath() === p, other));
await open(sname); await pg.click(P + '#mode-run'); await pg.waitForSelector(P + '#liveBtn');
check('the first session is no longer live: its panel is gone and its button is not pressed', await pg.locator(P + '#livePanel').count() === 0 && (await pg.getAttribute(P + '#liveBtn', 'aria-pressed')) === 'false');
await pg.evaluate(p => window.__dmforge.A.goto(p), other);
await pg.waitForSelector(P + '#livePanel');
check('Live is remembered for the campaign (reloaded, it is still that session)', await pg.evaluate(p => { const A = window.__dmforge.A, S = window.__dmforge.S; A.loadLive(); return S.live === p; }, other));
await pg.click(P + '#liveClose'); await pg.waitForTimeout(150);
check('Close stops it being live', await pg.locator(P + '#livePanel').count() === 0 && await pg.evaluate(() => window.__dmforge.S.live === ''));
await pg.keyboard.press('Control+KeyK'); await pg.fill('#palInput', 'Live mode'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200);
check('the "Live mode" command in the quick switcher makes the session you have open live', await pg.locator(P + '#livePanel').count() === 1 && await pg.evaluate(p => window.__dmforge.S.live === p, other));
await pg.keyboard.press('Control+KeyK'); await pg.fill('#palInput', 'Live mode'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200);
check('and again turns it off', await pg.locator(P + '#livePanel').count() === 0);
await pg.evaluate(() => { localStorage.setItem('dmforge:live', '1'); window.__dmforge.A.loadLive(); });
check('an old on/off setting from before is ignored (nothing is live)', await pg.evaluate(() => window.__dmforge.S.live === ''));
await open(sname); await pg.click(P + '#mode-run'); await pg.waitForSelector(P + '#liveBtn'); await pg.click(P + '#liveBtn'); await pg.waitForSelector(P + '#livePanel');          // back to Live on this session for the checks that follow
const clock = await pg.getAttribute(P + '#liveClocks [data-liveclock]', 'data-liveclock');
const c0 = await pg.textContent(P + '#liveClocks [data-liveclock] [data-count]');
await pg.click(P + '#liveClocks [data-liveclock] button[aria-label^="One slice forward"]');
await pg.waitForTimeout(200);
const c1 = await pg.textContent(P + '#liveClocks [data-liveclock="' + clock + '"] [data-count]');
check('a clock moves a slice from here', c0 !== c1 && Number(c1.split('/')[0]) === Number(c0.split('/')[0]) + 1, c0 + ' -> ' + c1);
await pg.fill(P + '#liveLine', 'The cellar door was already open');
await pg.keyboard.press('Enter');
await pg.waitForTimeout(200);
check('a log line goes into this session', (await note(sname)).body.includes('The cellar door was already open') && await pg.locator(P + '#liveRecent').textContent().then(t => t.includes('cellar door')));
const sec = await pg.locator(P + '#liveSecrets [data-reveal]').count();
if (sec) {
  const label = await pg.getAttribute(P + '#liveSecrets [data-reveal]', 'data-reveal');
  await pg.click(P + '#liveSecrets [data-reveal]');
  await pg.waitForTimeout(200);
  check('a secret is revealed with one click, and logged', (await note(sname)).body.includes('Revealed: ' + label), label);
} else check('(no hidden secrets to reveal in the demo)', true);
check('open threads are listed', await pg.locator(P + '#liveThreads [data-thread]').count() >= 1);
await pg.click(P + '#liveClose');
check('Live closes again', await pg.locator(P + '#livePanel').count() === 0);

// ---- the quick log: create a note from it
await pg.evaluate(() => window.__dmforge.A.setLogOpen(true));
await pg.waitForSelector('#sessionLine');
await pg.fill('#sessionLine', 'Spoke with @Zelda');
await pg.waitForSelector('#logMentions [data-logcreate]');
check('a name that is not a note offers to create it as an NPC, place or item', await pg.locator('#logMentions [data-logcreate]').count() === 3);
await pg.keyboard.press('Enter');
await pg.waitForTimeout(150);
check('Enter alone does not create anything: it just adds the line', !(await note('Zelda Thornwick')) && (await note(sname)).body.includes('Spoke with @Zelda'));
await pg.fill('#sessionLine', 'Spoke with [[Zelda Thornwick');
await pg.waitForSelector('#logMentions [data-logcreate="npc"]');
await pg.click('#logMentions [data-logcreate="npc"]');
await pg.waitForTimeout(250);
const zelda = await note('Zelda Thornwick');
check('choosing Create makes the NPC', !!zelda && zelda.type === 'npc' && /NPCs\//.test(zelda.path));
check('placed at the place the session mentions', !!zelda && zelda.text.includes('[[' + place + ']]'), zelda && zelda.text);
check('and links it in the line', (await pg.inputValue('#sessionLine')).includes('[[Zelda Thornwick]]'));
await pg.evaluate(() => window.__dmforge.A.setLogOpen(false));

// ---- the outline
await open(sname);
await pg.click(P + '#mode-prep'); await pg.waitForSelector(P + '#castStrip');
await pg.evaluate(() => { const d = document.querySelector('.pane:not([hidden]) #spDetails'); if (d) d.open = true; });
await pg.evaluate(p => { const i = window.__dmforge.getIndex().byPath.get(p); window.__dmforge.A.saveNoteEdit(p, { body: i.body.replace(/\s+$/, '') + '\n\n## Scene A\n\nOne.\n\n## Scene B\n\nTwo.\n\n## Scene C\n\nThree.\n' }); }, after.path);
await pg.waitForSelector(P + '#outline');
await pg.click(P + '#outline summary');
check('a session with many sections has an outline', await pg.locator(P + '#outline [data-outline]').count() >= 5);
const order = () => pg.$$eval('.pane:not([hidden]) #outline [data-outline]', els => els.map(e => e.getAttribute('data-outline')));
await pg.click(P + '[data-outline="Scene C"] [data-up]');
await pg.waitForTimeout(250);
let o = await order();
check('a section moves up', o.indexOf('Scene C') < o.indexOf('Scene B') && o.indexOf('Scene B') > o.indexOf('Scene A'), o.join(','));
check('with its text', (await note(sname)).body.indexOf('Three.') < (await note(sname)).body.indexOf('Two.'));
await pg.click(P + '[data-outline="Scene C"] [data-down]');
await pg.waitForTimeout(250);
o = await order();
check('and back down', o.indexOf('Scene B') < o.indexOf('Scene C'));
await pg.click(P + '#outlineFold');
check('Fold all closes the callouts', await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) .edit-body details')].every(d => !d.open)));
await pg.click(P + '#outlineOpen');
check('and Open all opens them', await pg.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) .edit-body details')].every(d => d.open)));

// ---- prepared encounters: from the Party page into the session, and run
await nav('Party');
await pg.waitForSelector('#ebSearch');
await pg.fill('#ebSearch', 'goblin');
await pg.waitForSelector('#ebHits [data-add]');
await pg.click('#ebHits [data-add] >> nth=0'); await pg.waitForTimeout(200);
await pg.click('#ebHits [data-add] >> nth=0'); await pg.waitForTimeout(200);
await pg.waitForSelector('#ebSaveBar');
await pg.selectOption('#ebSession', { label: sname });
await pg.fill('#ebTitle', 'Ambush at the weir');
await pg.click('#ebSave');
await pg.waitForTimeout(250);
const encBody = (await note(sname)).body;
check('Save to session writes the encounter into the session\'s prep', /> \[!danger\]- Encounter: Ambush at the weir\n(> - \d+× .+\n)*> - 2× Goblin/.test(encBody), encBody.slice(encBody.indexOf('Encounter') - 20, encBody.indexOf('Encounter') + 120));
await open(sname);
await pg.waitForSelector(P + '#encounters');
check('the session lists it with how hard it is', await pg.locator(P + '[data-enc="Ambush at the weir"] [data-diff]').count() === 1);
await pg.click(P + '[data-run="Ambush at the weir"]');
await pg.waitForTimeout(400);
check('Run in Combat puts the monsters in the fight', await pg.evaluate(() => window.__dmforge.S.combat && window.__dmforge.S.combat.combatants.length) >= 2 && await pg.evaluate(() => window.__dmforge.S.section) === 'combat');
await open(sname);
await pg.waitForSelector(P + '#encounters');
await pg.click(P + '[data-delenc="Ambush at the weir"]');
await pg.waitForTimeout(200);
check('Remove takes it out of the note again', !(await note(sname)).body.includes('Encounter: Ambush'));

// ---- more session templates
await pg.evaluate(() => window.__dmforge.S.dialog = { kind: 'template', path: window.__dmforge.getIndex().notes.find(n => n.name === 'Session 90 - The Long Night').path, insert: null });
await pg.evaluate(() => window.__dmforge.emit());
await pg.waitForTimeout(200);
const tpls = await pg.$$eval('.modal [data-tpl], .modal .tpl-opt, .modal label', els => els.map(e => e.textContent).join(' | '));
check('the template list has the new layouts', /Dungeon crawl/.test(tpls) && /Intrigue and social/.test(tpls) && /Travel and exploration/.test(tpls) && /One-shot/.test(tpls), tpls.slice(0, 300));

check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
