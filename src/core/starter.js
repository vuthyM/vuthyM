/* The session zero kit: a few questions about the campaign and the table, and the notes they turn into: a "Session Zero" note,
   the players, a questionnaire to send them, a first plot thread and a first session with a prep outline. */
import { sanitizeName } from './util.js';

export const TONES = ['Heroic', 'Gritty', 'Dark', 'Comedic', 'Mystery', 'Political', 'Exploration', 'Horror', 'Whimsical', 'Epic'];
export const PILLAR_LEVELS = ['A lot', 'Some', 'A little'];
export const SAFETY_TOOLS = [
  ['lines', 'Lines and veils: lines are things we will not include; veils are things that happen off-screen'],
  ['xcard', 'X-card: anyone can tap it to skip something, no questions asked'],
  ['pause', 'Pause button: anyone can ask to stop for a moment'],
  ['checkin', 'A check-in after hard scenes, and at the end of each session'],
  ['script', 'Script change tools (rewind, fast-forward, pause)'],
];
export const ETIQUETTE = [
  ['phones', 'Phones away unless it is for the game'],
  ['table', 'One conversation at a time at the table'],
  ['rules', 'The DM makes the final rules call during play; we talk it through afterwards'],
  ['absent', 'If you miss a session, your character is played by the DM or fades into the background'],
  ['spotlight', 'Everyone gets a moment in the spotlight each session'],
  ['snacks', 'Bring snacks to share'],
];
export const HOUSE_RULES = [
  'Roll death saves in the open',
  'Flanking gives Advantage on melee attacks',
  'Drinking a potion is a Bonus Action',
  'Critical hits do maximum damage on the first die',
  'Milestone levelling (no XP to track)',
  'Initiative is rolled once per side, not once per creature',
  'Rest rules: a Short Rest is 1 hour, a Long Rest is 8',
];
export const LENGTHS = ['A one-shot', 'A short story (3 to 6 sessions)', 'A season (about 10 to 20 sessions)', 'A long campaign (a year or more)', 'We will see how it goes'];

export const QUESTIONS = [
  'Who is your character, in a sentence?',
  'What do they want most right now?',
  'What are they afraid of, or ashamed of?',
  'Who do they care about, and who do they owe?',
  'What is one secret about them, that only you and I will know?',
  'What do you want to see in this campaign: a fight, a puzzle, a mystery, a big choice, a quiet scene?',
  'Is there a kind of scene you would like less of?',
  'What is one thing your character is good at that you would love to show off?',
  'What is something in the world of the game that you want to be true?',
];

const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
const list = a => (a || []).map(oneLine).filter(Boolean);
const bullets = (a, none = '_Nothing yet._') => (list(a).length ? list(a).map(x => '- ' + x).join('\n') : none);
const para = (s, none = '_Not decided yet._') => (String(s || '').trim() ? String(s).trim() : none);
const pick = (all, ids) => (ids || []).map(id => (all.find(x => x[0] === id) || [])[1]).filter(Boolean);

export function emptyAnswers() {
  return { campaign: '', premise: '', setting: '', tones: [], pillars: { combat: 'Some', explore: 'Some', social: 'Some' }, level: 1, length: LENGTHS[4], schedule: '', sessionLength: '', lines: '', veils: '', tools: ['lines', 'xcard'], etiquette: ['phones', 'table'], houseRules: [], customRules: '', players: [{ player: '', character: '', cls: '' }], thread: '', session1: true };
}

/* the Session Zero note */
export function sessionZeroText(a) {
  const tones = list(a.tones);
  const p = a.pillars || {};
  const rules = [...list(a.houseRules), ...String(a.customRules || '').split(/\n/).map(oneLine).filter(Boolean)];
  return [
    '# Session Zero',
    '',
    '_What we agreed before the first session. Everyone can change their mind at any time: tell the DM._',
    '',
    '## The campaign',
    '',
    '**Premise:** ' + para(a.premise),
    '**Setting:** ' + para(a.setting),
    '**Tone:** ' + (tones.length ? tones.join(', ') : '_Not decided yet._'),
    '**Starting level:** ' + (Number(a.level) || 1),
    '**Length:** ' + para(a.length),
    '',
    '## What we will do',
    '',
    '- Combat: ' + (p.combat || 'Some'),
    '- Exploration: ' + (p.explore || 'Some'),
    '- Roleplay and social scenes: ' + (p.social || 'Some'),
    '',
    '## The table',
    '',
    '**When:** ' + para(a.schedule, '_Not decided yet._') + (a.sessionLength ? ' (' + oneLine(a.sessionLength) + ' each)' : ''),
    '',
    '### Lines (we will not include these)',
    '',
    bullets(String(a.lines || '').split(/\n|;/), '_None named yet._'),
    '',
    '### Veils (these happen off-screen)',
    '',
    bullets(String(a.veils || '').split(/\n|;/), '_None named yet._'),
    '',
    '### Safety tools',
    '',
    bullets(pick(SAFETY_TOOLS, a.tools), '_None chosen._'),
    '',
    '### How we play together',
    '',
    bullets(pick(ETIQUETTE, a.etiquette), '_Nothing yet._'),
    '',
    '## House rules',
    '',
    bullets(rules, '_None: the rules as written._'),
    '',
    '## Questions that came up',
    '',
    '- ',
    '',
  ].join('\n');
}

export function questionnaireText(a) {
  return [
    '# Session Zero Questionnaire',
    '',
    '_Send this to each player before the first session. Answers can be short._',
    '',
    ...QUESTIONS.flatMap((q, i) => [(i + 1) + '. **' + q + '**', '   - ', '']),
    '## Table questions',
    '',
    '1. **Lines (things you do not want in the game at all):**',
    '   - ',
    '2. **Veils (things you are fine with, but off-screen):**',
    '   - ',
    '3. **Anything I should know to make the game work for you?**',
    '   - ',
    '',
  ].join('\n');
}

export function playerBody(name, a, p) {
  return ['# ' + name, '', p.player ? 'Played by ' + oneLine(p.player) + '.' : '', '', '## Who they are', '', '', '## What they want', '', '', '## Fears and bonds', '', '', '## Hooks for the DM', '', '- ', ''].join('\n').replace(/\n{4,}/g, '\n\n\n');
}

export function threadBody(a) {
  return ['# ' + oneLine(a.thread), '', para(a.premise, 'Where it starts, and what is at stake.'), '', '## Next steps', '', '- Decide how the party first hears of it', '- ', ''].join('\n');
}

export function session1Prep(a) {
  return [
    '**Strong start:** ' + 'Begin in the middle of something. (What is happening when the first scene opens?)',
    '',
    '## Scenes',
    '',
    '- [ ] The opening scene (20 min)',
    '- [ ] The first choice (30 min)',
    '- [ ] The hook into the campaign (20 min)',
    '',
    '## Secrets and clues',
    '',
    '- [ ] ',
    '',
    '> [!important]+ MUST HAPPEN',
    '> ',
    '> - [ ] The party meets each other and has a reason to stay together',
    '> - [ ] The hook is on the table',
    '> ',
  ].join('\n');
}

/* every note the kit would make: { kind, name, fm, body } (kind: root, player, plot) plus whether to make Session 1 */
export function buildStarter(a) {
  const out = [];
  out.push({ kind: 'root', name: 'Session Zero', body: sessionZeroText(a) });
  out.push({ kind: 'root', name: 'Session Zero Questionnaire', body: questionnaireText(a) });
  const seen = new Set();
  for (const p of a.players || []) {
    const who = sanitizeName(oneLine(p.character) || oneLine(p.player));
    if (!who || seen.has(who.toLowerCase())) continue;
    seen.add(who.toLowerCase());
    const fm = {};
    if (oneLine(p.player)) fm.player = oneLine(p.player);
    if (oneLine(p.cls)) fm.class = oneLine(p.cls);
    fm.level = Number(a.level) || 1;
    out.push({ kind: 'player', name: who, fm, body: playerBody(who, a, p) });
  }
  const t = sanitizeName(oneLine(a.thread));
  if (t) out.push({ kind: 'plot', name: t, fm: { status: 'Active' }, body: threadBody(a) });
  return { notes: out, session1: !!a.session1, prep: a.session1 ? session1Prep(a) : '' };
}
