/* 2.47.4: "Where you left off" must not describe a change that was undone. Add a scene, do not push, undo it: the card goes. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault');
await pg.waitForSelector('.sidebar');
const P = '.pane:not([hidden]) ';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sess = await pg.evaluate(() => { const s = window.__dmforge.getIndex().byType.session[0]; return { path: s.path }; });
const open = () => pg.evaluate(p => window.__dmforge.A.goto(p), sess.path);
const body = () => pg.evaluate(p => window.__dmforge.getIndex().byPath.get(p).body, sess.path);
const addScene = async text => { const b0 = await body(); await pg.evaluate(([p, t]) => window.__dmforge.A.saveNoteEdit(p, { body: t }), [sess.path, b0 + '\n\n## ' + text + '\n- [ ] ' + text + ' _(15 min)_\n']); await sleep(150); };
const card = async () => (await pg.locator(P + '#leftOff').count()) ? (await pg.textContent(P + '#leftOff')).replace(/\s+/g, ' ') : '';
await open(); await pg.waitForSelector(P + '#noteTitle');
await pg.evaluate(() => window.__dmforge.A.clearLeftOff());
await sleep(100);
check('to begin with there is nothing to show', (await card()) === '');

/* ---- the report: add a scene, do not push, undo it */
await addScene('The ambush at the ford');
check('a scene is added: "Where you left off" points at it', /ambush at the ford/i.test(await card()), await card());
await pg.waitForSelector(P + '.unpushed-bar button');
await pg.click(P + '.unpushed-bar button:has-text("Undo my edits")'); await sleep(200);
check('Undo my edits takes the scene out of the note', !(await body()).includes('The ambush at the ford'));
check('and "Where you left off" no longer mentions it', (await card()) === '', await card());

/* ---- discard all */
await addScene('A scene to discard'); await pg.waitForSelector(P + '#leftOff');
await pg.evaluate(() => window.__dmforge.A.discardAll()); await sleep(200);
check('Discard all also removes it', (await card()) === '', await card());

/* ---- discard from the push review */
await addScene('A scene dropped in the review');
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row');
await pg.click('.rev-row button:has-text("Discard")'); await sleep(250);
check('discarding the note in the push review removes it too', (await card()) === '' && !(await body()).includes('dropped in the review'), await card());

/* ---- a pushed change stays as history */
await addScene('A scene that is kept');
await pg.click('#pushBtn'); await pg.waitForSelector('.rev-row'); await pg.click('#confirmPush');
await pg.waitForSelector('text=Pushed to your vault'); await pg.click('text=Done'); await sleep(200);
check('after a push it stays as where you left off', /that is kept/.test(await card()), await card());
check('and is no longer marked as unpushed', await pg.evaluate(p => window.__dmforge.S.leftOff[p].every(e => !e.pending), sess.path));

/* ---- older entries survive an undo of a newer one */
await addScene('A newer scene that is undone');
check('a newer change is the one shown', /newer scene that is undone/.test(await card()), await card());
await pg.click(P + '.unpushed-bar button:has-text("Undo my edits")'); await sleep(200);
check('undoing it brings the earlier, pushed one back as where you left off', /that is kept/.test(await card()) && !/undone/.test(await card()), await card());

/* ---- a stale entry (the line is gone from the note) is not shown, whatever removed it */
await pg.evaluate(p => { const S = window.__dmforge.S; S.leftOff[p] = [{ ts: Date.now(), line: 3, snippet: 'A line that is not in the note any more', section: 'Scenes', kind: 'added' }, ...(S.leftOff[p] || [])]; window.__dmforge.emit(); }, sess.path);
await sleep(150);
check('an entry whose line is no longer in the note is not shown', !/not in the note any more/.test(await card()), await card());
await pg.evaluate(p => { const S = window.__dmforge.S; S.leftOff[p] = [{ ts: Date.now(), line: 3, snippet: 'A line that is not in the note any more', section: 'Scenes', kind: 'added' }]; window.__dmforge.emit(); }, sess.path);
await sleep(150);
check('and when that was the only one, there is no card at all', (await card()) === '', await card());
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const ok = results.filter(Boolean).length;
console.log(ok + '/' + results.length + ' checks passed');
process.exit(ok === results.length ? 0 : 1);
