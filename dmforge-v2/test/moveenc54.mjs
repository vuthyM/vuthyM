import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import path from 'node:path'; import url from 'node:url';

/* Prepared encounters you did not get to can be moved to the next session; ones you ran are marked and stay. */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.evaluate(() => window.__dmforge.A.openPlainDemo());
await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');
const sessions = await pg.evaluate(() => window.__dmforge.getIndex().byType.session.map(n => ({ path: n.path, name: n.name })));
const [newest, older] = sessions;
const bodyOf = p => pg.evaluate(x => window.__dmforge.getIndex().byPath.get(x).body, p);
const encTitles = async p => (await bodyOf(p)).split('\n').filter(l => /Encounter:/.test(l)).map(l => l.replace(/^.*Encounter:\s*/, ''));
await pg.evaluate(o => { const A = window.__dmforge.A; A.saveEncounterTo(o, 'Ambush', [{ qty: 3, name: 'Goblin Warrior' }]); A.saveEncounterTo(o, 'Cellar stair', [{ qty: 2, name: 'Goblin Warrior' }]); }, older.path);
check('two prepared encounters in the older session', (await encTitles(older.path)).length === 2);

await pg.evaluate(p => window.__dmforge.A.goto(p), older.path);
await pg.waitForSelector('#mode-prep'); await pg.click('#mode-prep');
await pg.waitForSelector('#encounters');
check('each unrun encounter offers a move', (await pg.locator('[data-moveenc]').count()) === 2);
// run one: it is marked, and no longer offered
await pg.click('[data-run="Ambush"]');
await pg.waitForSelector('.combat, text=Combat', { timeout: 5000 }).catch(() => {});
check('running it marks the note with a dated line', (await bodyOf(older.path)).includes('> Ran in combat: '), await bodyOf(older.path));
await pg.evaluate(p => window.__dmforge.A.goto(p), older.path);
await pg.waitForSelector('#mode-prep'); await pg.click('#mode-prep'); await pg.waitForSelector('#encounters');
check('the card shows it ran, and offers Run again', (await pg.locator('[data-ran]').count()) === 1 && (await pg.textContent('[data-run="Ambush"]')) === 'Run again');
check('only the unrun one can be moved', (await pg.locator('[data-moveenc]').count()) === 1 && (await pg.locator('[data-moveenc="Cellar stair"]').count()) === 1);

// Wrap up: the strip offers the unrun one
await pg.click('#mode-wrap');
await pg.waitForSelector('#unrunStrip');
check('Wrap up names the encounter that was never run', (await pg.textContent('#unrunStrip')).includes('Cellar stair') && !(await pg.textContent('#unrunStrip')).includes('Ambush'));
check('and says where it will go', (await pg.textContent('#unrunMove')).includes(newest.name));
await pg.click('#unrunMove');
await pg.waitForFunction(() => !document.querySelector('#unrunStrip'));
check('it is gone from this session and the ran one stays', (await encTitles(older.path)).join() === 'Ambush');
check('it is in the next session, creatures intact', (await encTitles(newest.path)).includes('Cellar stair') && (await bodyOf(newest.path)).includes('2× Goblin Warrior'));
check('it counts as an unpushed change', (await pg.evaluate(() => window.__dmforge.S.working.count)) >= 2);

// the newest session has no next one: a new one is made, and the pinned session is not changed
const before = await pg.evaluate(() => window.__dmforge.A.currentSessionPath());
await pg.evaluate(p => window.__dmforge.A.saveEncounterTo(p, 'Chapel door', [{ qty: 1, name: 'Goblin Warrior' }]), newest.path);
await pg.evaluate(p => window.__dmforge.A.goto(p), newest.path);
await pg.waitForSelector('#mode-wrap'); await pg.click('#mode-wrap'); await pg.waitForSelector('#unrunStrip');
check('with no next session it offers a new one', (await pg.textContent('#unrunMove')).includes('new next session'));
await pg.click('#unrunMove');
await pg.waitForFunction(n => window.__dmforge.getIndex().byType.session.length === n + 1, sessions.length);
const after = await pg.evaluate(() => ({ list: window.__dmforge.getIndex().byType.session.map(n => n.path), cur: window.__dmforge.A.currentSessionPath() }));
const made = after.list.find(p => !sessions.some(s => s.path === p));
check('a new session was made and holds the encounters', made && (await encTitles(made)).sort().join() === 'Cellar stair,Chapel door' && (await encTitles(newest.path)).length === 0, made && (await encTitles(made)).join());
check('the pinned session did not jump to the new one', after.cur === before, before + ' -> ' + after.cur);
check('no page errors', errs.length === 0, errs.join('\n'));
await b.close();
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
