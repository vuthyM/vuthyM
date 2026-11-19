/* Shared kit for the "ready for a real session" tests (sunday1 mock session, sunday2 break-it, sunday3 backup/undo).
   - bigVault(dir): a large, deliberately messy campaign written to disk (accents, emoji, apostrophes, CRLF, broken front matter,
     empty files, a 200 KB note, deep sub-folders, duplicate names in other folders, non-markdown files, hidden folders)
   - startHelper(): the real helper on that folder, on a temp config dir
   - snap(dir): sha1 of every file, to compare a vault before and after
   Nothing here touches a real vault. */
import { chromium } from '../../jsd/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
export const root = path.join(here, '..');

export function makeChecker() {
  const results = [];
  const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
  const done = () => { const failed = results.filter(x => !x).length; console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed'); return failed ? 1 : 0; };
  return { check, done, results };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- a deterministic random, so a failure can be repeated ---------- */
export function rng(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const FIRST = ['Aldric', 'Brienne', 'Cael', 'Dara', 'Eamon', 'Fenna', 'Garrick', 'Hesper', 'Ilsa', 'Joren', 'Kaelen', 'Lirael', 'Maddox', 'Nessa', 'Orin', 'Perrin', 'Quill', 'Rowan', 'Sabine', 'Tobias', 'Ulla', 'Varro', 'Wren', 'Xanthe', 'Yorick', 'Zephyr'];
const LAST = ['Ashdown', 'Blackwater', 'Coldbrook', 'Dunmere', 'Emberlane', 'Fairweather', 'Greywick', 'Holloway', 'Ironbark', 'Juniper', 'Kettleby', 'Larkspur', 'Mossgrove', 'Nightingale', 'Oakhaven', 'Pennywhistle', 'Quickwater', 'Ravenscar', 'Stonebridge', 'Thornfield'];
const ROLES = ['Innkeeper', 'Smith', 'Priest', 'Spy', 'Merchant', 'Guard captain', 'Hermit', 'Bard', 'Healer', 'Smuggler', 'Noble', 'Ferryman'];
const KINDS = ['Village', 'Town', 'City', 'Dungeon', 'Ruin', 'Region', 'Inn', 'Shop', 'Temple'];

/* names that are legal on a Mac and awkward for software */
const ODD = [
  "Ælfric the Ünbroken", "D'Arcy O'Neill", 'Zoë 🐉 Dragonborn', 'Brother Mattheüs (the Elder)', 'Ser Gawain – Knight of the Pale Moon',
  'The Duke of 100% Pure Evil', 'A Very Long Name Indeed ' + 'of the Seven Hundred Rolling Hills '.repeat(2).trim(), '“Quotes” and ‘Curly’ Marks', 'Mr. Dot.', '#1 Fan',
  'Ünïcödé Wïzard', '李 Wei the Quiet', 'Name With  Double  Spaces', 'Tilde~Name', 'Name_with_underscores', 'Hash # Name', 'Plus + Minus - Name',
];

export function bigVault(dir, { seed = 7 } = {}) {
  const R = rng(seed);
  const pick = a => a[Math.floor(R() * a.length)];
  const put = (rel, text) => { const full = path.join(dir, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, text); return rel; };
  const C = 'Emberfall';
  const made = { npcs: [], players: [], places: [], factions: [], threads: [], sessions: [], odd: [], broken: [] };
  const used = new Set();
  const uniq = base => { let n = base, i = 2; while (used.has(n.toLowerCase())) n = base + ' ' + i++; used.add(n.toLowerCase()); return n; };

  const places = [];
  // regions -> towns -> buildings (a real tree, three deep)
  const regions = ['The Northmarch', 'Saltcoast', 'The Hollow Weald', 'Dunmere Fens'];
  for (const reg of regions) {
    const rn = uniq(reg); places.push(rn);
    put(`${C}/Locations/${rn}.md`, `---\nkind: Region\n---\n\n# ${rn}\n\nA wide, cold land. Dangerous roads.\n`);
    for (let t = 0; t < 4; t++) {
      const tn = uniq(pick(FIRST) + (R() < 0.5 ? 'ford' : 'haven')); places.push(tn);
      put(`${C}/Locations/${tn}.md`, `---\nkind: ${pick(['Village', 'Town', 'City'])}\nregion: "[[${rn}]]"\n---\n\n# ${tn}\n\nPart of [[${rn}]]. About ${100 + Math.floor(R() * 4000)} people.\n`);
      for (let k = 0; k < 2; k++) {
        const bn = uniq(`${pick(['The Gilded', 'The Crooked', 'The Sleeping', 'The Silver', 'The Rusty'])} ${pick(['Stag', 'Anchor', 'Lantern', 'Goblet', 'Hound'])}`); places.push(bn);
        put(`${C}/Locations/${bn}.md`, `---\nkind: ${pick(['Inn', 'Shop', 'Temple'])}\nregion: "[[${tn}]]"\n---\n\n# ${bn}\n\nIn [[${tn}]].\n`);
      }
    }
  }
  made.places = places;

  const factions = [];
  for (let i = 0; i < 24; i++) {
    const n = uniq(`${pick(['The', 'House', 'Order of the', 'Brotherhood of'])} ${pick(LAST)} ${pick(['Court', 'Guild', 'Company', 'Circle', 'League'])}`); factions.push(n);
    put(`${C}/Factions/${n}.md`, `---\ngoal: ${pick(['Control the river trade', 'Find the lost crown', 'Keep the peace', 'Burn it all down', 'Hoard secrets'])}\n---\n\n# ${n}\n\nBased in [[${pick(places)}]].\n`);
  }
  made.factions = factions;

  const npcs = [];
  for (let i = 0; i < 120; i++) {
    const n = uniq(`${pick(FIRST)} ${pick(LAST)}`); npcs.push(n);
    const sub = R() < 0.3 ? pick(['Allies', 'Villains', 'Merchants']) + '/' : '';
    put(`${C}/NPCs/${sub}${n}.md`, `---\nrole: ${pick(ROLES)}\nhome: "[[${pick(places)}]]"\nfaction: "[[${pick(factions)}]]"\n---\n\n# ${n}\n\n${pick(['Gruff.', 'Cheerful.', 'Suspicious of strangers.', 'Owes a favour to [[' + pick(npcs.length ? npcs : ['nobody']) + ']].'])} Often found in [[${pick(places)}]].\n`);
  }
  // deliberately odd names, in all the folders that matter
  for (const o of ODD) {
    const n = uniq(o); made.odd.push(n);
    put(`${C}/NPCs/${n}.md`, `---\nrole: Oddity\nhome: "[[${pick(places)}]]"\n---\n\n# ${n}\n\nA test of the awkward. Knows [[${pick(npcs)}]].\n`);
    npcs.push(n);
  }
  made.npcs = npcs;

  // the party: four players, full combat stats
  const pcs = [['Kestra Dune', 'Rogue', 5, 38, 15, 4, 'Alex'], ['Bram Ironhollow', 'Fighter', 5, 52, 18, 1, 'Sam'], ['Sorrel Vance', 'Cleric', 5, 41, 17, 0, 'Jo'], ['Pip Underbough', 'Wizard', 5, 27, 12, 2, 'Max']];
  for (const [n, cls, lv, hp, ac, init, player] of pcs) { used.add(n.toLowerCase()); put(`${C}/Players/${n}.md`, `---\nplayer: ${player}\nclass: ${cls}\nrace: Human\nlevel: ${lv}\nhp: ${hp}\nac: ${ac}\ninit: ${init}\n---\n\n# ${n}\n\nBackstory about [[${pick(npcs)}]].\n`); made.players.push(n); }

  const threads = [];
  for (let i = 0; i < 24; i++) {
    const n = uniq(`The ${pick(['Missing', 'Poisoned', 'Cursed', 'Stolen', 'Silent', 'Burning'])} ${pick(['Bells', 'Crown', 'Well', 'Heir', 'Ledger', 'Harbour', 'Oath'])}`); threads.push(n);
    put(`${C}/Plot Threads/${n}.md`, `---\nstatus: ${pick(['Active', 'Active', 'Dormant', 'Resolved'])}\n---\n\n# ${n}\n\n## Next steps\n- Ask [[${pick(npcs)}]] about it\n- Search [[${pick(places)}]]\n`);
  }
  made.threads = threads;

  // sessions: 30 past, the newest one is the one we will "play"
  for (let i = 1; i <= 30; i++) {
    const day = new Date(Date.UTC(2026, 0, 4 + i * 7)).toISOString().slice(0, 10);
    const n = `${day} Session ${i}`; made.sessions.push(n);
    const cast = [pick(npcs), pick(npcs), pick(npcs)];
    const log = i < 30 ? `\n## Session log\n<!-- dmforge:log -->\n- 19:10 Met [[${cast[0]}]] at [[${pick(places)}]]\n- 19:55 #reveal [[${cast[1]}]] was lying\n- 20:40 #decision The party sided with [[${pick(factions)}]]\n<!-- /dmforge:log -->\n` : '';
    put(`${C}/Sessions/${n}.md`, `---\nnumber: ${i}\ndate: ${day}\n---\n\n# Session ${i}: ${pick(['Cold Welcome', 'The Ferry', 'Smoke on the Water', 'Bad Debts', 'The Long Road', 'Embers'])}\n\n## Prep\n- Scene at [[${pick(places)}]] with [[${cast[0]}]]\n- Tension: [[${cast[1]}]] wants [[${cast[2]}]] gone\n\n## Recap\nThey met [[${cast[0]}]]. ${i < 30 ? 'It went badly.' : ''}\n${log}`);
  }
  // session 31: the one we play tonight, with a prep list but no recap
  const play = `${new Date(Date.UTC(2026, 0, 4 + 31 * 7)).toISOString().slice(0, 10)} Session 31`;
  made.play = play;
  put(`${C}/Sessions/${play}.md`, `---\nnumber: 31\ndate: ${new Date(Date.UTC(2026, 0, 4 + 31 * 7)).toISOString().slice(0, 10)}\n---\n\n# Session 31: Tonight\n\n## Prep\n- Open at [[${places[3]}]]\n- [[${npcs[0]}]] wants to hire the party\n- Ambush on the road (see encounter)\n\n## Recap\n`);
  put(`${C}/${C}.md`, `# ${C}\n\nA big, messy, long-running campaign used to test DM Forge.\n\n## Themes\nDebt, loyalty.\n`);

  // the awkward notes
  put(`${C}/NPCs/CRLF Carl.md`, '---\r\nrole: Smith\r\n---\r\n\r\n# CRLF Carl\r\n\r\nWindows line endings, as Obsidian sync on a PC would leave them.\r\n'); made.odd.push('CRLF Carl');
  put(`${C}/NPCs/No Frontmatter Nell.md`, '# No Frontmatter Nell\n\nJust text. Knows [[' + npcs[1] + ']].\n'); made.odd.push('No Frontmatter Nell');
  put(`${C}/NPCs/Broken Barnaby.md`, '---\nrole: Spy\nhome: [[Unclosed\n\n# Broken Barnaby\n\nThe front matter above never closes properly.\n'); made.broken.push('Broken Barnaby');
  put(`${C}/NPCs/Empty Edna.md`, ''); made.broken.push('Empty Edna');
  put(`${C}/NPCs/Dangling Dan.md`, '---\nrole: Hermit\n---\n\n# Dangling Dan\n\nLinks to [[A Note That Does Not Exist]] and [[Another Missing One|an alias]].\n'); made.odd.push('Dangling Dan');
  put(`${C}/NPCs/Giant Gwen.md`, '---\nrole: Archivist\n---\n\n# Giant Gwen\n\n' + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. [[' + npcs[2] + ']] sed do eiusmod tempor.\n'.repeat(2600)); made.odd.push('Giant Gwen');
  put(`${C}/NPCs/Tabbed Tilly.md`, '---\nrole:\tBard\n---\n\n# Tabbed Tilly\n\n\tindented with a tab\n\t- a list\n'); made.odd.push('Tabbed Tilly');
  // a duplicate of a real NPC's name in another place (an archive), the way an old campaign leaves them
  put(`Archive/Old Emberfall/${npcs[0]}.md`, `---\nrole: Retired\n---\n\n# ${npcs[0]}\n\nThe same name, an older note.\n`);
  put('Templates/Session Template.md', '## Prep\n\n## Recap\n');
  put('Work/Meeting notes.md', '# Not part of any campaign\n');
  put('.obsidian/app.json', '{}');
  put('.obsidian/workspace.json', '{"main":{}}');
  fs.writeFileSync(path.join(dir, C, 'notes.png'), Buffer.from('89504e470d0a1a0a', 'hex'));    // a non-markdown file in the campaign
  fs.writeFileSync(path.join(dir, C, 'NPCs', 'not-a-note.txt'), 'plain text');
  made.campaign = C;
  made.all = [...npcs, ...places, ...factions, ...threads];
  return made;
}

export function snap(dir) {
  const out = new Map();
  const walk = rel => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out.set(r, crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, r))).digest('hex'));
    }
  };
  walk('');
  return out;
}
export function diffSnap(a, b) {
  const added = [], removed = [], changed = [];
  for (const [k, v] of b) { if (!a.has(k)) added.push(k); else if (a.get(k) !== v) changed.push(k); }
  for (const k of a.keys()) if (!b.has(k)) removed.push(k);
  return { added, removed, changed, same: !added.length && !removed.length && !changed.length };
}

let portCounter = 8800;
export async function startHelper({ vault, tmp, port, env = {} } = {}) {
  port = port || portCounter++;
  const cfg = path.join(tmp, 'cfg');
  const args = [path.join(root, 'helper', 'dmforge-server.py'), vault, '--port', String(port), '--no-open', '--no-update', '--app', path.join(root, 'dist', 'DM-Forge.html')];
  const h = { port, cfg, out: '', proc: null };
  const boot = async () => {
    h.out = '';
    h.proc = spawn('python3', args, { env: { ...process.env, DMF_CONFIG_DIR: cfg, DMF_NO_COMMANDS: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    h.proc.stdout.on('data', d => { h.out += d; }); h.proc.stderr.on('data', d => { h.out += d; });
    for (let i = 0; i < 80 && !/\?t=/.test(h.out); i++) await sleep(100);
    const m = h.out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/);
    if (!m) throw new Error('helper did not start:\n' + h.out);
    h.base = 'http://127.0.0.1:' + m[1]; h.token = m[2]; h.url = h.base + '/?t=' + h.token;
  };
  await boot();
  h.api = (op, p, init = {}) => fetch(h.base + '/api/' + op + '?path=' + encodeURIComponent(p || '') + (init.q || ''), { ...init, headers: { 'X-DMF-Token': h.token, ...(init.headers || {}) } });
  h.kill = () => new Promise(res => { if (!h.proc || h.proc.exitCode !== null || h.proc.signalCode !== null) return res(); h.proc.once('exit', () => res()); h.proc.kill('SIGKILL'); });
  h.restart = async () => { await h.kill(); await boot(); };
  h.stop = async () => { await h.kill(); };
  process.on('exit', () => { try { h.proc.kill('SIGKILL'); } catch (e) { /* gone */ } });
  return h;
}

export async function launch() { return chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'], env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } }); }

/* a page on the helper, signed in and inside the campaign */
export async function openApp(browser, h, campaign, { viewport = { width: 1360, height: 900 }, ctx = null } = {}) {
  const context = ctx || await browser.newContext({ viewport });
  const pg = await context.newPage();
  pg.errors = [];
  pg.on('pageerror', e => pg.errors.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|fonts\.g/.test(m.text())) pg.errors.push(m.text()); });
  await pg.goto(h.url);
  await pg.waitForSelector('.dir-list, .sidebar');
  if (!(await pg.locator('.sidebar').count())) {
    await pg.click(`.dir-row:has-text("${campaign}")`);
    await pg.click(`text=Use “${campaign}” as the campaign`);
    await pg.waitForFunction(() => document.querySelector('.sidebar') || /What is in/.test(document.body.innerText), null, { timeout: 60000 });
    if (await pg.locator('text=Looks good').count()) await pg.click('text=Looks good');
    await pg.waitForSelector('.sidebar');
  }
  return pg;
}
export const getNote = (pg, p) => pg.evaluate(p => window.__dmforge.S.working.get(p), p);
export const pendingCount = pg => pg.evaluate(() => window.__dmforge.S.working.count);

/* push whatever is pending, through the review dialog, and report what it said */
export async function pushAll(pg, { keepVault = false } = {}) {
  await pg.click('#pushBtn');
  await pg.waitForSelector('.rev-row, .rev-conflict', { timeout: 30000 });
  if (keepVault && await pg.locator('.rev-conflict label:has-text("Keep the vault")').count()) {
    for (const l of await pg.locator('.rev-conflict label:has-text("Keep the vault")').all()) await l.click();
    await pg.waitForFunction(() => !document.querySelector('#confirmPush').disabled);
  }
  await pg.click('#confirmPush');
  await pg.waitForSelector('text=Pushed to your vault', { timeout: 60000 });
  await pg.click('text=Done');
}

export const tmpDir = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
export const rm = d => fs.rmSync(d, { recursive: true, force: true });
