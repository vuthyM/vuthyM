/* The showcase: a heavily filled version of the demo campaign ("Ashfall"), built so every part of DM Forge has something to show: sessions with
   a live log, a Close out and a "Last time" to import, secrets and clues, scenes for the timer, a party with numbers and an absent player,
   neglected threads and NPCs for "What am I forgetting?", clocks and faction standing, a Bestiary, items, handouts, a cheat sheet, your own
   generator rows and tables, and a Character Library at the root of the vault.

   It is the "Try the demo vault" campaign. The smaller demoFiles() stays as it was, because the tests rely on its exact contents. */
import { SHOWCASE_CHARS } from '../data/showcase-chars.js';
import { buildNote } from './clocks.js';
import { mapNoteText } from './maps.js';

const svg = (w, h, inner) => new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + inner + '</svg>'], { type: 'image/svg+xml' });

const GREENHOLD_MAP = svg(640, 420, `<rect width="640" height="420" fill="#e8dfc7"/>
<path d="M0 300 Q160 250 320 290 T640 270 V420 H0Z" fill="#b8cfa0"/><path d="M0 340 Q200 320 400 350 T640 330 V420 H0Z" fill="#9dbb86"/>
<path d="M60 40 Q120 10 200 30 T330 60" stroke="#6aa1c9" stroke-width="12" fill="none" stroke-linecap="round"/>
<rect x="250" y="180" width="30" height="26" fill="#8a6a45"/><rect x="290" y="190" width="26" height="22" fill="#8a6a45"/><rect x="326" y="176" width="34" height="30" fill="#7b5c3a"/><rect x="370" y="192" width="24" height="20" fill="#8a6a45"/>
<text x="238" y="170" font-family="Georgia,serif" font-size="22" fill="#3b2b17">Greenhold</text>
<circle cx="500" cy="120" r="26" fill="#cbbf9d" stroke="#6b5a3a" stroke-width="3"/><text x="470" y="170" font-family="Georgia,serif" font-size="16" fill="#3b2b17">The Sunken Chapel</text>
<path d="M395 200 Q450 190 480 140" stroke="#8a6a45" stroke-width="3" stroke-dasharray="6 5" fill="none"/>`);
const CHAPEL_MAP = svg(560, 400, `<rect width="560" height="400" fill="#d9d2bf"/><rect x="60" y="60" width="440" height="280" fill="#efe9d8" stroke="#4a3f2c" stroke-width="5"/>
<rect x="60" y="150" width="140" height="100" fill="#e1d8bf" stroke="#4a3f2c" stroke-width="3"/><text x="82" y="205" font-family="Georgia,serif" font-size="15" fill="#3b2b17">Vestry</text>
<rect x="200" y="100" width="180" height="180" fill="#e9e1ca" stroke="#4a3f2c" stroke-width="3"/><text x="248" y="195" font-family="Georgia,serif" font-size="18" fill="#3b2b17">The Nave</text>
<circle cx="440" cy="190" r="48" fill="#cfc5a8" stroke="#4a3f2c" stroke-width="3"/><text x="410" y="195" font-family="Georgia,serif" font-size="14" fill="#3b2b17">Bell tower</text>
<rect x="268" y="300" width="44" height="40" fill="#b3a98c"/><text x="256" y="365" font-family="Georgia,serif" font-size="13" fill="#3b2b17">Dry cellar stair</text>
<circle cx="290" cy="120" r="6" fill="#d4a13f"/><circle cx="330" cy="120" r="6" fill="#d4a13f"/><circle cx="290" cy="260" r="6" fill="#d4a13f"/><circle cx="330" cy="260" r="6" fill="#d4a13f"/>`);
const WEIR_MAP = svg(600, 360, `<rect width="600" height="360" fill="#dde7d2"/><path d="M0 170 Q150 120 300 180 T600 150 V230 Q450 260 300 220 T0 250Z" fill="#7fb0d4"/>
<path d="M120 60 V300" stroke="#8a6a45" stroke-width="5" stroke-dasharray="3 6"/><rect x="108" y="150" width="24" height="60" fill="#6b4f2d"/><text x="140" y="140" font-family="Georgia,serif" font-size="15" fill="#3b2b17">Tam's ferry</text>
<rect x="320" y="120" width="70" height="26" fill="#9a9a9a" stroke="#555"/><text x="326" y="112" font-family="Georgia,serif" font-size="14" fill="#3b2b17">The Weir</text>
<circle cx="470" cy="200" r="30" fill="#2f3b46" opacity=".75"/><text x="428" y="260" font-family="Georgia,serif" font-size="14" fill="#2f2a22">Hollow Reach (cave mouth)</text>`);

/* a session note: properties, then the sections in the order the app writes them */
const mk = (number, date, title, extra, body) => '---\nnumber: ' + number + '\ndate: ' + date + '\n' + (extra || '') + '---\n\n# Session ' + number + ': ' + title + '\n\n' + body.trim() + '\n';
const block = (id, text) => '<!-- dmforge:' + id + ' -->\n' + text.trim() + '\n<!-- /dmforge:' + id + ' -->';

/* the example characters, by name (the sample adds them to Character Library/Examples, apart from your own) */
export const EXAMPLE_CHARS = SHOWCASE_CHARS;

export const SHOWCASE_CAMPAIGN = 'Ashfall';
export const SHOWCASE_VAULT = 'Demo Vault';

/* how the top-level folders are mapped, so the demo opens straight into the campaign */
export const SHOWCASE_MAPPING = { NPCs: 'npc', Players: 'player', Locations: 'location', Factions: 'faction', 'Plot Threads': 'plot', Sessions: 'session', Items: 'item', Maps: 'map', Bestiary: 'x:Bestiary', 'Custom tables': 'other' };

export function showcaseFiles() {
  const f = {};
  const A = 'Ashfall/';

  /* ---------- the campaign ---------- */
  f[A + 'Ashfall.md'] = `# Ashfall

A slow-burning mystery in the river village of [[Greenhold]], where the temple bells went missing the night before the first frost. The party (four level 5 adventurers) arrived looking for work and found a town that stopped talking.

## Themes
Grief, quiet bargains, and what a community will overlook to keep the peace. Gentle horror: the dread is in what people don't say.

## Tone and table
Mystery first, some combat, a lot of conversation. Lines: harm to children on screen. Veils: what happened to [[Pell the Younger]] stays off-screen until the party earns it. X-card on the table.

## The truth (DM only)
The bells were never stolen. The [[Ember Court]] lowered them into the [[The Weir]] to keep the [[The Hollow Choir]] asleep: the Choir wakes when the bells ring. [[Brother Calder]], [[Mireille Vane]], [[Old Tam]] and [[Old Haldor]] helped. Someone has been poisoning the [[The East Well]] with bell-metal to turn the village against the Court. That someone is [[Nym]].

## Open threads
[[The Missing Bells]] · [[Who Poisoned the Well]] · [[The Letter Kestra Won't Open]] · [[Brother Calder's Secret]] · [[Pell Is Missing]] · [[The Hollow Choir (thread)]]

## Running notes
Players: [[Kestra Dune]], [[Bram Ironhollow]], [[Sorrel Vance]], [[Toby Wren]]. Where things stand with each group: [[Clocks and Standing]].
`;

  /* ---------- NPCs ---------- */
  f[A + 'NPCs/Mireille Vane.md'] = `---
race: Half-elf
role: Innkeeper
status: Alive
location: "[[The Cinder & Crown]]"
faction: "[[Ember Court]]"
tags:
  - npc
  - greenhold
  - ally-ish
---

# Mireille Vane

Runs the [[The Cinder & Crown]], the only inn in [[Greenhold]]. Soft-spoken, tracks everything, writes nothing down. She knows who rang the bells last, and is quietly paying [[Old Tam]] to keep the ferry moving at night.

## Wants
To keep the inn open through winter without anyone asking about [[Brother Calder]].

## Secret
She helped lower the bells into [[The Weir]]. She has not slept properly since.

## Voice
Low and even. Never raises her voice; lowers it when angry.

## Session updates
- [[2026-10-05 Session 11]] (2026-10-05): Offered the party a room and a warning in the same breath.
- [[2026-10-19 Session 13]] (2026-10-19): Lied to Kestra's face about Thursday suppers, badly.
`;
  f[A + 'NPCs/Brother Calder.md'] = `# Brother Calder

**Race:** Human
**Role:** Priest of the Quiet Flame
**Status:** Alive
**Location:** [[The Sunken Chapel]]
**Faction:** [[The Quiet Flame]]

Gaunt, kind, and lying about something. He says the chapel flooded years ago, but the floor is dry and the candles are fresh. [[Mireille Vane]] brings him supper on Thursdays.

## What he is hiding
The chapel's cellar stair leads to the dry vault where the bell clappers are kept. He is guarding them, not hiding them.

## Session updates
- [[2026-10-12 Session 12]] (2026-10-12): Was not alone in the chapel. Said the second voice was "the wind in the flue".
- [[2026-10-19 Session 13]] (2026-10-19): Shown a bell-metal shaving from [[The East Well]]. Went grey.
`;
  f[A + 'NPCs/Old Tam.md'] = `---
role: Ferryman
status: Alive
location: "[[The Weir]]"
faction: "[[Weir Ferrymen]]"
---

Rows the river crossing at all hours and never asks for a fare twice. Sees more than he says. Owes [[Mireille Vane]] a favour. His ledger records every crossing, including the night the bells went missing.

## Session updates
- [[2026-10-12 Session 12]] (2026-10-12): Rowed the party upriver after dark and refused payment.
`;
  f[A + 'NPCs/Captain Isolde Ravenscroft.md'] = `---
race: Human
role: Guard captain
faction: "[[Greenhold Watch]]"
status: Alive
location: "[[Greenhold]]"
---

# Captain Isolde Ravenscroft

Leads the six-person watch. Believes the bells were stolen by outsiders and is **very** interested in the party's story. Her patience is the thing to watch: see [[Clocks and Standing]].

## Wants
A culprit by the next full moon, and she will take a convenient one.
`;
  f[A + 'NPCs/Edda Wick.md'] = `---
race: Human
role: Apothecary
status: Alive
location: "[[Greenhold]]"
---

# Edda Wick

Runs the apothecary on the square. Tested the east well water in spring and wrote down the iron taste. Her notebook has a column nobody has asked about: who bought lamp oil and bell-wax in bulk. Likes [[Sorrel Vance]]; distrusts anyone who tells her what to think.
`;
  f[A + 'NPCs/Harl Dunmere.md'] = `---
race: Human
role: Miller
status: Dead
location: "[[Millrace Mill]]"
---

# Harl Dunmere

Found at the bottom of the millrace in the second week of frost. The watch called it an accident. His hands were clean of grain: he had not been working. He had lent [[Old Tam]] a rope-winch the week before the bells went.
`;
  f[A + 'NPCs/Pell the Younger.md'] = `---
race: Human
role: Bell-ringer's apprentice
status: Missing
location: "[[The Hollow Reach]]"
---

# Pell the Younger

Fourteen. Rang the shrine bells every dawn until the night of the first frost. Last seen going toward [[The Weir]] with a lantern. His mother still sets a place at the table. See [[Pell Is Missing]].
`;
  f[A + 'NPCs/Warden Corvin Ash.md'] = `---
race: Dwarf
role: Elder of the Ember Court
status: Alive
faction: "[[Ember Court]]"
location: "[[Greenhold]]"
---

# Warden Corvin Ash

Chairs the Court and speaks last. Would give up the inn, the ferry and his own pension before the bells. Distrusts [[Mireille Vane]]'s soft heart; trusts [[Captain Isolde Ravenscroft]]'s hard one.
`;
  f[A + 'NPCs/Sister Vesper.md'] = `---
race: Human
role: Travelling priest
status: Alive
faction: "[[The Quiet Flame]]"
---

# Sister Vesper

Arrived on the [[Orchard Road]] with a letter for [[Brother Calder]] and a lantern that burns without oil. Pleasant, curious, and taking notes on everyone. Reports to someone the party hasn't met.
`;
  f[A + 'NPCs/Gideon Marsh.md'] = `---
race: Halfling
role: Merchant and smuggler
status: Alive
location: "[[The Cinder & Crown]]"
---

# Gideon Marsh

Sells lamp oil, rope and silence. [[Kestra Dune]] used to run cargo for him. He knows who paid to have her letter delivered, and has decided it is funnier not to say.
`;
  f[A + 'NPCs/Dessa Thorne.md'] = `---
race: Half-orc
role: Bard
status: Alive
location: "[[The Cinder & Crown]]"
---

# Dessa Thorne

Plays the inn on Thursdays. Her songs about the bells are older than the bells. Takes requests, and silently skips two verses of "The Sleeping Weir" every time.
`;
  f[A + 'NPCs/Nym.md'] = `---
race: Unknown
role: Choirmaster
status: Alive
faction: "[[The Hollow Choir]]"
location: "[[The Hollow Reach]]"
---

# Nym

Voice like a bell struck underwater. Not a person any more, exactly: a conductor for the Choir's patience. Wants the bells rung. Believes the village owes the Choir an apology and a debt. Stat block: [[Nym, Choirmaster]].
`;
  f[A + 'NPCs/Lady Orsolya Quill.md'] = `---
race: Human
role: Noble patron
status: Alive
location: "[[Greenhold]]"
---

# Lady Orsolya Quill

Wrote the letter [[Kestra Dune]] hasn't opened. Wants Kestra to deliver it to [[Brother Calder]] unread. She is Calder's sister. See [[The Letter Kestra Won't Open]].
`;
  f[A + 'NPCs/Finch.md'] = `---
role: Stable hand
status: Alive
location: "[[The Cinder & Crown]]"
---

# Finch

Eleven. Collects rumours the way other children collect stones. Knows where [[Pell the Younger]] liked to hide, and will trade it for a story.
`;

  f[A + 'NPCs/Old Haldor.md'] = `---
race: Dwarf
role: Keeper of the shrine records
status: Alive
location: "[[The Shrine Tower]]"
faction: "[[Ember Court]]"
---

# Old Haldor

Has buried three priests and is not planning on a fourth. Keeps the shrine records and the Court's accounts. Helped lower the bells and has not forgiven himself. Also in the Character Library as a full stat sheet.
`;
  f[A + 'NPCs/Archmage Vaelith.md'] = `---
race: Elf
role: Distant patron
status: Alive
faction: "[[The Quiet Flame]]"
---

# Archmage Vaelith

Nobody in Greenhold has met her, though several have heard her name. The Quiet Flame owes her a debt. She sent a student into the Hollow Reach years ago and wants to know what he found. Full sheet in the Character Library.
`;

  /* ---------- the party ---------- */
  f[A + 'Players/Kestra Dune.md'] = `---
player: Alex
class: Rogue
race: Tiefling
level: 5
hp: 38
ac: 15
init: 4
perception: 17
gold: 214
xp: 6840
---

# Kestra Dune

Former courier for a smuggling ring. Carries a letter she hasn't opened: [[The Letter Kestra Won't Open]]. Picked a lock she shouldn't have in [[2026-10-05 Session 11]].

## Wants
To stop owing people. Starting with [[Gideon Marsh]].
`;
  f[A + 'Players/Bram Ironhollow.md'] = `---
player: Sam
class: Cleric
race: Dwarf
level: 5
hp: 44
ac: 18
init: 0
perception: 14
gold: 96
xp: 6840
---

# Bram Ironhollow

Cleric of the Hearth. Wants to know why Greenhold's shrine is cold. Keeps the party alive and notices everything about [[Old Haldor]]'s grief.
`;
  f[A + 'Players/Sorrel Vance.md'] = `# Sorrel Vance

Class:: Wizard
Level:: 5
HP:: 31
AC:: 13
Init:: 2
Perception:: 15
Gold:: 322
XP:: 6840
Player:: Jamie

Halfling diviner, collects local rumours in a pocket ledger. Ignored the taste of the well in spring; has not forgiven herself. See [[Who Poisoned the Well]].
`;
  f[A + 'Players/Toby Wren.md'] = `---
player: Priya
class: Ranger
race: Wood elf
level: 5
hp: 42
ac: 16
init: 3
perception: 18
gold: 58
xp: 6500
---

# Toby Wren

Joined in [[2026-10-12 Session 12]] after tracking something out of the reeds that turned out to be the party. Quiet. Reads the river better than anyone, which is why [[Old Tam]] watches him.
`;

  /* ---------- places ---------- */
  f[A + 'Locations/Greenhold.md'] = `---
kind: Village
---

# Greenhold

About 400 people on the north bank of the Weir. One inn, one ferry, a shrine nobody will explain. ![[Greenhold Map.svg]]

Home to [[Mireille Vane]], [[Edda Wick]], [[Warden Corvin Ash]] and the watch under [[Captain Isolde Ravenscroft]]. Places: [[The Cinder & Crown]], [[The Shrine Tower]], [[The East Well]], [[Millrace Mill]].
`;
  f[A + 'Locations/The Cinder & Crown.md'] = `---
kind: Inn
region: "[[Greenhold]]"
---

# The Cinder & Crown

The only inn. Eight rooms, one common room, a hearth that is never allowed to go out. The Court meets in the back. [[Mireille Vane]] runs it; [[Dessa Thorne]] plays Thursdays; [[Gideon Marsh]] holds the corner table.
`;
  f[A + 'Locations/The Shrine Tower.md'] = `---
kind: Landmark
region: "[[Greenhold]]"
---

# The Shrine Tower

Where the bells hung. The ropes are cut clean, not torn. Bell-wax on the sill; scrape marks on the beam from a lowering rig. Cold in a way the weather doesn't explain.
`;
  f[A + 'Locations/The Sunken Chapel.md'] = `---
kind: Ruin
region: "[[Greenhold]]"
---

# The Sunken Chapel

Half a mile upriver. [[Brother Calder]] keeps vigil here. The bell tower is empty. The floor is dry and the candles are fresh. A cellar stair behind the vestry goes down further than the river should allow. Floorplan: ![[Sunken Chapel Floorplan.svg]]
`;
  f[A + 'Locations/The East Well.md'] = `---
kind: Landmark
region: "[[Greenhold]]"
---

# The East Well

Tasted of iron in the spring and again after the first frost. [[Edda Wick]] tested it; [[Sorrel Vance]] ignored it. Bell-metal shavings at the bottom. See [[Who Poisoned the Well]].
`;
  f[A + 'Locations/The Weir.md'] = `---
kind: River
region: "[[Greenhold]]"
---

# The Weir

The river and the low stone dam that gave the village its name. [[Old Tam]]'s ferry crosses here. The bells sleep in the deep pool below the sluice. Map: ![[Weir Crossing.svg]]
`;
  f[A + 'Locations/Millrace Mill.md'] = `---
kind: Building
region: "[[Greenhold]]"
---

# Millrace Mill

[[Harl Dunmere]]'s mill. Shut since he died. The millrace runs under the floor; the lowering winch was kept in the loft.
`;
  f[A + 'Locations/The Hollow Reach.md'] = `---
kind: Cave
region: "[[The Weir]]"
---

# The Hollow Reach

A cave mouth behind the weir that floods and drains on no tide the village knows. The sound of a choir carries out of it on still nights. [[Pell the Younger]] went in; [[Nym]] holds court inside.
`;
  f[A + 'Locations/Orchard Road.md'] = `---
kind: Road
region: "[[Greenhold]]"
---

# Orchard Road

The way in from the south. [[Sister Vesper]] walked it. Apples nobody picks, and a milestone someone keeps scratching out.
`;

  /* ---------- factions ---------- */
  f[A + 'Factions/Ember Court.md'] = `---
goal: Keep Greenhold's bells silent
leader: "[[Warden Corvin Ash]]"
base: "[[The Cinder & Crown]]"
---

# Ember Court

Village council in all but name. Meets in the back of [[The Cinder & Crown]]. [[Mireille Vane]] sits on it; [[Brother Calder]] does not. Holds the secret of the bells.
`;
  f[A + 'Factions/The Quiet Flame.md'] = `---
goal: Keep the old vigils, and the old promises
leader: "[[Sister Vesper]]"
base: "[[The Sunken Chapel]]"
---

# The Quiet Flame

A small, patient church. [[Brother Calder]] is their priest in Greenhold; [[Sister Vesper]] is their eyes. They owe [[Archmage Vaelith]] a debt nobody remembers.
`;
  f[A + 'Factions/Weir Ferrymen.md'] = `---
goal: Keep the crossing open, and the questions closed
leader: "[[Old Tam]]"
base: "[[The Weir]]"
---

# Weir Ferrymen

Seven boats, nine families, one ledger. They ferried the bells downriver in the dark.
`;
  f[A + 'Factions/Greenhold Watch.md'] = `---
goal: Find someone to blame
leader: "[[Captain Isolde Ravenscroft]]"
base: "[[Greenhold]]"
---

# Greenhold Watch

Six people and a very loud rattle. Honest, tired, and getting less patient.
`;
  f[A + 'Factions/The Hollow Choir.md'] = `---
goal: Be woken, and be paid what is owed
leader: "[[Nym]]"
base: "[[The Hollow Reach]]"
---

# The Hollow Choir

Whatever sings in [[The Hollow Reach]]. They stay quiet while the bells are silent. They remember the village's promise to them, and the village's failure to keep it.
`;

  /* ---------- plot threads ---------- */
  f[A + 'Plot Threads/The Missing Bells.md'] = `---
status: Active
seeded:
  - "[[Old Tam]]"
  - "[[Ember Court]]"
appears:
  - "[[The Shrine Tower]]"
  - "[[The Sunken Chapel]]"
  - "[[The Weir]]"
---

# The Missing Bells

Three bells vanished from the shrine tower on the night of the first frost. Nobody heard them come down. The ropes were cut clean.

## Secrets and clues
- [ ] The bells were lowered into the Weir by the Court, not stolen — Old Tam's ledger; the cut ropes; bell-wax on the sill; Harl's winch
- [x] Someone in the village wanted the bells found (revealed in [[2026-10-19 Session 13]])

## Next steps
- Ask [[Old Tam]] who he ferried that night
- Search [[The Sunken Chapel]]
- Find out what the dry cellar stair is for

## Session updates
- [[2026-10-12 Session 12]] (2026-10-12): Chapel is dry and warm. Calder not alone.
- [[2026-10-19 Session 13]] (2026-10-19): Party now suspects the bells are underwater.
`;
  f[A + 'Plot Threads/Who Poisoned the Well.md'] = `---
status: Active
seeded:
  - "[[Sorrel Vance]]"
  - "[[Edda Wick]]"
appears:
  - "[[The East Well]]"
---

# Who Poisoned the Well

The east well tasted of iron in the spring. Ignored by everyone except [[Sorrel Vance]] and [[Edda Wick]]. Bell-metal shavings turned up in [[The East Well]] in [[2026-10-19 Session 13]].

## Secrets and clues
- [ ] Nym is feeding bell-metal into the well to turn the village against the Court — the shaving pattern; the iron taste after rain; Finch saw a figure at the well on Thursday

## Next steps
- Question [[Edda Wick]] about who bought lamp oil in bulk
- Watch the well at night
`;
  f[A + 'Plot Threads/The Letter Kestra Won\'t Open.md'] = `---
status: Active
seeded:
  - "[[Kestra Dune]]"
---

# The Letter Kestra Won't Open

A sealed letter, delivered by [[Gideon Marsh]] on behalf of [[Lady Orsolya Quill]]. Addressed to [[Brother Calder]]. Kestra has carried it for six weeks.

## Secrets and clues
- [ ] Lady Orsolya is Calder's sister — the wax seal; the shared family crest; Calder's reaction to the name Quill

## Next steps
- Ask Gideon who paid him
- Decide, as a party, whether to open it
`;
  f[A + 'Plot Threads/Brother Calder\'s Secret.md'] = `---
status: Active
seeded:
  - "[[Brother Calder]]"
  - "[[The Quiet Flame]]"
---

# Brother Calder's Secret

He lies to the party and he lies well. He is guarding something, not hiding it.

## Secrets and clues
- [ ] The chapel's dry vault holds the bell clappers — the cellar stair; fresh candle wax; Mireille's Thursday suppers

## Next steps
- Go down the cellar stair
- Find out who the second voice in the chapel was
`;
  f[A + 'Plot Threads/Pell Is Missing.md'] = `---
status: Active
---

# Pell Is Missing

[[Pell the Younger]] went toward [[The Weir]] with a lantern on the night of the first frost. His mother keeps a place at the table. [[Finch]] knows where Pell liked to hide.

## Next steps
- Talk to Finch
- Check the weir at low water
`;
  f[A + 'Plot Threads/The Hollow Choir (thread).md'] = `---
status: Dormant
---

# The Hollow Choir (thread)

Mentioned in a song and a half-burnt page of [[Orrin's Notebook]]. Not yet connected by the party to anything. If the bells ring, this thread wakes up in a way nobody will enjoy.

## Next steps
- Seed a second clue before the bells are found
`;
  f[A + 'Plot Threads/The Ferry at Night.md'] = `---
status: Resolved
seeded:
  - "[[Weir Ferrymen]]"
appears:
  - "[[The Weir]]"
---

# The Ferry at Night

How the party first learned the crossing is never idle. Resolved in [[2026-10-12 Session 12]]: [[Old Tam]] ferried them and refused payment.
`;

  /* ---------- sessions ---------- */
  f[A + 'Sessions/2026-09-21 Session 9.md'] = mk(9, '2026-09-21', 'Arrivals', '', `
## Recap
The party arrived on the Orchard Road in a cold rain. [[Mireille Vane]] gave them rooms. [[Gideon Marsh]] cornered [[Kestra Dune]] at the bar. Locals will say nothing about [[Pell the Younger]]. [[The Hollow Choir]] came up once, in a song.

## Session log

${block('log', `- 19:05 #reveal The shrine bells have been gone nine days
- 19:30 #decision The party agreed to take rooms at the Cinder & Crown
- 19:48 #spotlight [[Kestra Dune]] spotted the false bottom in Gideon's crate
- [ ] 20:10 #hook Dessa skips two verses of the Sleeping Weir
- 20:25 #loot Found 40 gp and a bell-wax candle in the stables`)}
`);
  f[A + 'Sessions/2026-09-28 Session 10.md'] = mk(10, '2026-09-28', 'The Well', '', `
## Recap
[[Edda Wick]] showed [[Sorrel Vance]] her spring notebook and the iron-taste column. [[Warden Corvin Ash]] asked the party to leave the matter to the Court. Someone left a lantern on the [[The East Well]] wall.

## Session log

${block('log', `- 19:12 #reveal Edda recorded the iron taste in spring
- 19:40 #spotlight [[Sorrel Vance]] matched the well water to a spring entry in Edda's ledger
- 20:03 #ruling Passive Perception beats the Stealth DC: no roll to notice the lantern
- 20:31 #decision Party will watch the well on Thursday
- 20:55 #spotlight [[Bram Ironhollow]] prayed at the cold shrine and felt something look back`)}
`);
  f[A + 'Sessions/2026-10-05 Session 11.md'] = mk(11, '2026-10-05', 'Cold Welcome', '', `
## Recap
The party met [[Mireille Vane]] properly and learned the bells are missing. [[Kestra Dune]] picked a lock she should not have, and found a ledger page in [[The Shrine Tower]]. [[Captain Isolde Ravenscroft]] took notes.

## Session log

${block('log', `- 19:15 #reveal The shrine tower ropes were cut clean from above
- 19:40 #spotlight [[Kestra Dune]] picked the shrine lock and found a ledger page
- 20:05 #ruling Advantage on the climb thanks to the cut ropes
- 20:22 #decision Party agreed not to tell the Captain about the ledger
- [ ] 20:48 #promise [[Kestra Dune]] promised Mireille she wouldn't take anything from the tower
- 21:02 #loot A bell-wax candle`)}
`);
  f[A + 'Sessions/2026-10-12 Session 12.md'] = mk(12, '2026-10-12', 'The Ferry at Night', '', `
## Prep
- Old Tam's ferry schedule
- Captain Isolde's first interrogation

## Recap
Ferried upriver after dark by [[Old Tam]]. Found [[The Sunken Chapel]] dry and warm, with fresh candles. [[Brother Calder]] was not alone. [[Toby Wren]] joined the party out of the reeds.

## Session log

${block('log', `- 19:20 #reveal The Sunken Chapel floor is dry and warm
- 19:44 #spotlight [[Toby Wren]] read the river and found where the ferry drifts at night
- 20:07 #decision Party decided to say nothing to the Captain about the chapel
- [ ] 20:30 #hook A second voice in the chapel, not Calder's
- [ ] 20:52 #promise [[Bram Ironhollow]] promised Calder he'd come back with a blessing`)}
`);
  f[A + 'Sessions/2026-10-19 Session 13.md'] = mk(13, '2026-10-19', 'The Dry Chapel', 'absent:\n  - Toby Wren\n', `
## Prep
- [[Brother Calder's Secret]]: the cellar stair
- [[Who Poisoned the Well]]: the shaving from the east well
- [[The Letter Kestra Won't Open]]: Calder will ask about a letter

## Session log

${block('log', `- 19:08 #reveal Calder went grey when shown the bell-metal shaving
- 19:31 #spotlight [[Kestra Dune]] talked her way past the watch at the chapel gate
- 19:55 #spotlight [[Bram Ironhollow]] sensed the vault under the chapel and called it holy
- 20:12 #ruling Sorrel's Detect Magic carries through thin walls only if a spell slot is spent
- 20:40 #decision Party chose not to descend until the whole group is here
- [ ] 20:58 #promise [[Sorrel Vance]] promised Calder she'd keep the shaving secret
- [ ] 21:04 #hook Calder asked if anyone had a letter for him
- 21:15 #loot A clapper-shaped key`)}

## Players' Recap
We kept the shaving to ourselves for now. Calder is definitely hiding something under the chapel but he looked scared, not guilty. Kestra still hasn't opened the letter. We decided to go down together once Toby's back.

## DM recap

${block('dm-recap', `- The party showed Brother Calder a bell-metal shaving from the east well; he nearly confessed and was saved by the bell of the supper-hour.
- Sorrel kept a promise she may regret. Bram learned the chapel sits on something holy and old.
- Kestra's letter nearly came out: Calder asked for one without saying why. [[Mireille Vane]] brought his supper tray through the gate, and Kestra clocked how she avoided his eye.
- **The players do not know:** the dry vault under the chapel holds the three bell clappers, and Calder is guarding them from [[Nym]].`)}

## Recap check

${block('recap-check', `- The players think Calder is guilty; he is guarding something, not hiding it.
- They have not connected the Hollow Choir to the well.`)}

## Next time

${block('next', `- [ ] Go down the cellar stair together, with Toby
- [ ] Decide what to do about Kestra's letter
- [x] Show Calder the shaving
- [ ] Follow up on the iron taste at the apothecary`)}
`);
  f[A + 'Sessions/2026-11-02 Session 14.md'] = mk(14, '2026-11-02', 'Down the Stair', '', `
## Prep

> [!warning] MUST HAPPEN
> - [ ] Calder's confession, one way or another
> - [ ] The party chooses what to do with the clappers

Thread: [[The Missing Bells]]. The party returns to [[The Sunken Chapel]] with Toby back and [[Brother Calder]] expecting them. Run the cellar as a slow descent: each landing shows something about the bells. [[Sister Vesper]] arrives at the end of the evening.

## Scenes
- [ ] The chapel gate and Calder's welcome (15 min)
- [ ] The cellar stair: three landings (30 min)
- [ ] The dry vault: the clappers (20 min)
- [ ] The Choir answers (25 min)
- [ ] Sister Vesper at the door (10 min)

## Secrets and clues
- [ ] The three bell clappers are in the vault, kept dry and silent — the stair; Calder's key; the supper trays
- [ ] The vault is a ward against the Hollow Choir — chalk sigils on the lintel; the cold air from below
- [ ] Sister Vesper was sent to judge Calder, not help him — her lantern; the way she asks about the cellar

## Encounters
- Three Hollow Choir Cultists on the second landing ([[Hollow Choir Cultist]])
- A Chapel Warden wakes in the vault if a clapper is touched ([[Chapel Warden]])
- Optional: [[Nym, Choirmaster]] speaks through the stone, does not fight yet

## Loot
[[Clapper of the Third Bell]], [[Calder's Candle]]

## Notes
Reminder: ask for perception checks *before* the stair, not during.
`);

  /* ---------- the Bestiary ---------- */
  f[A + 'Bestiary/Hollow Choir Cultist.md'] = `---
cr: 1/2
size: Medium
creature: humanoid
ac: 13
hp: 33
init: 1
---

# Hollow Choir Cultist

*Medium humanoid, neutral evil*

**AC** 13 · **HP** 33 (6d8 + 6) · **Initiative** +1 · **Speed** 9 m

| Str | Dex | Con | Int | Wis | Cha |
|:-:|:-:|:-:|:-:|:-:|:-:|
| 11 (+0) | 12 (+1) | 12 (+1) | 10 (+0) | 13 (+1) | 14 (+2) |

**Senses** Passive Perception 11 · **Languages** Common · **CR** 1/2 (XP 100)

### Traits
**Chorister's Resonance.** While two or more Choir creatures are within 9 metres, each has Advantage on saving throws against being Frightened.

### Actions
**Hymn-Knife.** *Melee Attack Roll:* +4, reach 1.5 m. *Hit:* 5 (1d6 + 2) Piercing damage plus 2 (1d4) Thunder damage.
**Dissonant Note (Recharge 5-6).** Each creature within 4.5 m makes a DC 12 Constitution saving throw or takes 7 (2d6) Thunder damage and can't take Reactions until the end of its next turn.
`;
  f[A + 'Bestiary/Chapel Warden.md'] = `---
cr: 4
size: Large
creature: construct
ac: 17
hp: 85
init: -1
---

# Chapel Warden

*Large construct, unaligned*

**AC** 17 · **HP** 85 (10d10 + 30) · **Initiative** -1 · **Speed** 7.5 m

| Str | Dex | Con | Int | Wis | Cha |
|:-:|:-:|:-:|:-:|:-:|:-:|
| 19 (+4) | 8 (-1) | 16 (+3) | 3 (-4) | 10 (+0) | 1 (-5) |

**Damage Immunities** Poison, Psychic · **Condition Immunities** Charmed, Frightened, Poisoned · **CR** 4 (XP 1,100)

### Traits
**Bell-Cast.** Immune to nonmagical weapon damage unless the attacker is wielding a bell-wax candle.

### Actions
**Multiattack.** Two Slam attacks.
**Slam.** *Melee Attack Roll:* +7, reach 3 m. *Hit:* 13 (2d8 + 4) Bludgeoning damage.
**Toll (Recharge 6).** Each creature within 9 m makes a DC 14 Constitution saving throw or takes 18 (4d8) Thunder damage and is Deafened for 1 minute.
`;
  f[A + 'Bestiary/Marsh Hound.md'] = `---
cr: 1
size: Medium
creature: beast
ac: 13
hp: 30
init: 2
---

# Marsh Hound

*Medium beast, unaligned*

**AC** 13 · **HP** 30 (4d8 + 12) · **Initiative** +2 · **Speed** 12 m, swim 9 m

| Str | Dex | Con | Int | Wis | Cha |
|:-:|:-:|:-:|:-:|:-:|:-:|
| 15 (+2) | 15 (+2) | 16 (+3) | 3 (-4) | 12 (+1) | 6 (-2) |

**Senses** Darkvision 18 m, Passive Perception 13 · **CR** 1 (XP 200)

### Actions
**Bite.** *Melee Attack Roll:* +4, reach 1.5 m. *Hit:* 7 (1d8 + 3) Piercing damage. If the target is Medium or smaller, it has the Prone condition.
`;
  f[A + 'Bestiary/Bellbound Revenant.md'] = `---
cr: 5
size: Medium
creature: undead
ac: 15
hp: 95
init: 2
---

# Bellbound Revenant

*Medium undead, neutral*

**AC** 15 · **HP** 95 (10d8 + 50) · **Initiative** +2 · **Speed** 9 m

| Str | Dex | Con | Int | Wis | Cha |
|:-:|:-:|:-:|:-:|:-:|:-:|
| 18 (+4) | 14 (+2) | 20 (+5) | 10 (+0) | 12 (+1) | 15 (+2) |

**Damage Resistances** Necrotic · **Damage Immunities** Poison · **CR** 5 (XP 1,800)

### Actions
**Multiattack.** Two Rope-Chain attacks.
**Rope-Chain.** *Melee Attack Roll:* +7, reach 3 m. *Hit:* 11 (2d6 + 4) Bludgeoning damage and the target is Grappled (escape DC 15).
**Ring of Ruin (Recharge 5-6).** Each creature within 9 m makes a DC 15 Wisdom saving throw or takes 22 (4d10) Psychic damage.
`;
  f[A + 'Bestiary/Nym, Choirmaster.md'] = `---
cr: 6
size: Medium
creature: aberration
ac: 16
hp: 120
init: 3
---

# Nym, Choirmaster

*Medium aberration, lawful evil*

**AC** 16 · **HP** 120 (16d8 + 48) · **Initiative** +3 · **Speed** 9 m, fly 9 m (hover)

| Str | Dex | Con | Int | Wis | Cha |
|:-:|:-:|:-:|:-:|:-:|:-:|
| 10 (+0) | 16 (+3) | 16 (+3) | 17 (+3) | 15 (+2) | 20 (+5) |

**Saving Throws** Wis +5, Cha +8 · **Damage Resistances** Thunder · **CR** 6 (XP 2,300)

### Traits
**Legendary Resistance (2/Day).** If Nym fails a saving throw, it can choose to succeed instead.

### Actions
**Multiattack.** Two Dirge-Staff attacks, or one Dirge-Staff attack and Cantor's Command.
**Dirge-Staff.** *Melee Attack Roll:* +6, reach 1.5 m. *Hit:* 9 (2d4 + 4) Bludgeoning damage plus 10 (3d6) Thunder damage.
**Cantor's Command.** One creature within 18 m makes a DC 16 Wisdom saving throw or uses its Reaction to move 3 m away and drop what it is holding.

### Legendary Actions
Nym can take 3 Legendary Actions, choosing from those below.
**Single Note.** Nym casts *Thaumaturgy* or uses Dirge-Staff.
**Swell (Costs 2 Actions).** Each creature within 9 m makes a DC 16 Constitution saving throw or takes 14 (4d6) Thunder damage.
`;
  f[A + 'Bestiary/Weir Drowned.md'] = `---
cr: 1/4
size: Medium
creature: undead
ac: 10
hp: 22
init: 0
---

# Weir Drowned

*Medium undead, unaligned*

**AC** 10 · **HP** 22 (3d8 + 9) · **Initiative** +0 · **Speed** 6 m, swim 6 m

| Str | Dex | Con | Int | Wis | Cha |
|:-:|:-:|:-:|:-:|:-:|:-:|
| 13 (+1) | 6 (-2) | 16 (+3) | 3 (-4) | 6 (-2) | 5 (-3) |

**CR** 1/4 (XP 50)

### Actions
**Slam.** *Melee Attack Roll:* +3, reach 1.5 m. *Hit:* 4 (1d6 + 1) Bludgeoning damage.
`;

  /* ---------- items ---------- */
  const item = (name, kind, rarity, body, at) => { f[A + 'Items/' + name + '.md'] = '---\nkind: ' + kind + '\nrarity: ' + rarity + (at ? '\nlocation: "[[' + at + ']]"' : '') + '\n---\n\n# ' + name + '\n\n' + body + '\n'; };
  item('Clapper of the Third Bell', 'Wondrous item', 'Rare', 'A heavy iron bell clapper, cold to the touch. While you carry it, creatures of the [[The Hollow Choir]] cannot sense you. If it is struck against bronze, every Choir creature within a mile knows exactly where you are.');
  item("Calder's Candle", 'Wondrous item', 'Uncommon', 'A candle of pale wax that never gutters. While lit, you have Advantage on saving throws against being Frightened, and the Chapel Warden treats you as a friend. Burns for 10 hours in total.');
  item('Ferryman\'s Coin', 'Wondrous item', 'Common', 'A worn coin on a cord. [[Old Tam]] gave it to Toby. Show it to any ferryman on the Weir and they will take you across, no questions asked.');
  item('Lantern of Honest Light', 'Wondrous item', 'Uncommon', 'A hooded lantern. Its light shows invisible creatures faintly, and shows lies as a faint flicker in the flame. [[Sister Vesper]] carries one.', 'The Cinder & Crown');
  item('Bell-Wax Candle', 'Consumable', 'Common', 'Wax with bell-metal flecks. Burning one for an hour lets a creature hear the Choir faintly, without Advantage on saves against its songs.', 'The Sunken Chapel');
  item('Kestra\'s Sealed Letter', 'Quest item', 'Common', 'A letter sealed with the Quill crest. Addressed to [[Brother Calder]]. See [[The Letter Kestra Won\'t Open]].');
  item("Orrin's Notebook", 'Quest item', 'Uncommon', 'Half-burnt pages in a wizard\'s cramped hand. One surviving page mentions a choir under a river. Sorrel is working on the rest.', 'The Hollow Reach');
  item('Cloak of Protection', 'Wondrous item', 'Uncommon', 'You gain a +1 bonus to AC and saving throws while you wear this cloak. Requires attunement.');
  item('Potion of Healing', 'Potion', 'Common', 'You regain 2d4 + 2 hit points when you drink this potion. The potion\'s red liquid glimmers when agitated.');

  /* ---------- maps ---------- */
  f[A + 'Maps/Greenhold Map.svg'] = GREENHOLD_MAP;
  f[A + 'Maps/Sunken Chapel Floorplan.svg'] = CHAPEL_MAP;
  f[A + 'Maps/Weir Crossing.svg'] = WEIR_MAP;
  f[A + 'Maps/Map notes.md'] = `# Map notes

Handouts for players: ![[Greenhold Map.svg]]

DM only: ![[Sunken Chapel Floorplan.svg]] and ![[Weir Crossing.svg]]. The dry cellar stair is not on the players' copy.
`;
  // pinned maps: the pins live in these notes (see core/maps.js). Greenhold's map links down to the Weir's, which links to the chapel's.
  f[A + 'Maps/Greenhold Map.md'] = mapNoteText('Greenhold Map.svg', [
    { x: 31, y: 8.5, place: 'The Weir' }, { x: 40.6, y: 46.5, place: 'Millrace Mill' }, { x: 47.5, y: 47.5, place: 'The Shrine Tower' },
    { x: 53.6, y: 45.5, place: 'The Cinder & Crown' }, { x: 60, y: 47.5, place: 'The East Well' }, { x: 78.1, y: 28.6, place: 'The Sunken Chapel' },
  ], { place: 'Greenhold', scale: '2 km' });
  f[A + 'Maps/Weir Crossing.md'] = mapNoteText('Weir Crossing.svg', [
    { x: 78.3, y: 55.5, place: 'The Hollow Reach' }, { x: 20, y: 50, label: "Tam's ferry", note: 'Old Tam works here at dawn' }, { x: 59, y: 37, label: 'The weir', note: 'where the water backs up' },
  ], { place: 'The Weir', scale: '400 m' });
  f[A + 'Maps/Sunken Chapel Floorplan.md'] = mapNoteText('Sunken Chapel Floorplan.svg', [
    { x: 23, y: 50, label: 'Vestry' }, { x: 51.8, y: 47.5, label: 'The Nave', note: 'four candle stands; the Choir is loudest here' }, { x: 78.6, y: 47.5, label: 'Bell tower' },
    { x: 51.8, y: 80, label: 'Dry cellar stair', secret: true, note: 'not on the players\' copy' },
  ], { place: 'The Sunken Chapel', scale: '30 m' });

  /* ---------- the tools' own notes ---------- */
  f[A + 'Clocks and Standing.md'] = buildNote(
    [
      { name: 'The bells ring again', filled: 3, size: 6, note: 'if it fills, the Hollow Choir wakes' },
      { name: 'The frost deepens', filled: 2, size: 4, note: 'the village is running out of firewood' },
      { name: "Isolde's patience", filled: 5, size: 8, note: 'she arrests someone convenient when it fills' },
      { name: "Nym's well", filled: 1, size: 6, note: 'every filled slice sours the village a little more' },
    ],
    [
      { name: 'Ember Court', value: 1, note: 'they owe the party a favour' },
      { name: 'The Quiet Flame', value: 0, note: 'Sister Vesper is watching' },
      { name: 'Weir Ferrymen', value: 2, note: 'Tam trusts Toby' },
      { name: 'Greenhold Watch', value: -1, note: 'the Captain thinks the party is hiding something' },
      { name: 'The Hollow Choir', value: -2, note: 'they have been waiting a long time' },
    ]);
  f[A + 'DM Cheat Sheet.md'] = `# DM Cheat Sheet

Your own rules and reminders. DM Forge shows each "##" section as a card in the cheat sheet.

## Ashfall house rules

- Death saves are rolled in the open.
- Potions are a Bonus Action to drink, an Action to feed to an ally.
- Inspiration: one per player per session, earned for roleplaying a flaw.
- Short rest is one hour; long rest is eight, and not in the chapel.

## Gentle horror toolkit

- Describe the *absence* of sound before describing a sound.
- Every scare gets a beat of safety afterwards.
- X-card on the table; pause button for anyone, any time.
- Lines: harm to children on screen. Veils: what happened to Pell.

## Voices

- **Mireille:** low, even, never raises her voice.
- **Calder:** soft, apologises at the end of sentences.
- **Tam:** the river in a man. Short sentences, long pauses.
- **Isolde:** clipped, tired, honest.
- **Nym:** speak as if underwater, a half-second late.

## Passive scores to remember

Kestra 17 · Bram 14 · Sorrel 15 · Toby 18. Nobody sneaks past Toby by accident.
`;
  f[A + 'Generator Tables.md'] = `# Generator Tables

Extra rows for the generators, written with Claude's help. DM Forge mixes them in when you roll on the matching generator. Edit or delete rows freely: one bullet per row.

## NPC · Quirk
<!-- dmf: npc/quirk -->

- Hums two notes of a hymn and stops, every time
- Keeps a candle stub in each pocket, just in case
- Refuses to cross water on a Thursday
- Never sits with their back to a bell
- Counts the beams in every ceiling

## NPC · Wants
<!-- dmf: npc/wants -->

- Someone to finally ask about the bells
- A quiet winter with no visitors
- To be proven right about the well
- Forgiveness they will not ask for

## NPC · Secret
<!-- dmf: npc/secret -->

- Saw the bells go into the river and said nothing
- Owes the Ember Court a debt they cannot repay
- Has been feeding something in the Hollow Reach
- Is not as old as they look
`;
  f[A + 'Custom tables/Greenhold Rumours.md'] = `# Greenhold Rumours

*d8 table, written with Claude's help*

| d8 | Result |
|---|---|
| 1 | The bells weren't stolen: they *left*. |
| 2 | Old Tam hasn't slept in a bed since the first frost. |
| 3 | Brother Calder talks to someone in the empty chapel every night. |
| 4 | The east well tastes of iron because there's a bell at the bottom of it. |
| 5 | Mireille pays the ferry in silver, not copper. |
| 6 | Finch says the shrine tower hums when nobody is in it. |
| 7 | Captain Isolde wants the party gone before the next full moon. |
| 8 | Someone left a lantern burning on the well wall again. |
`;
  f[A + 'Custom tables/Weir Weather.md'] = `# Weir Weather

*d6 table, written with Claude's help*

| d6 | Result |
|---|---|
| 1 | Still. No wind at all, and every sound carries too far. |
| 2 | Frost on the reeds, thin ice in the shallows. |
| 3 | Fog off the river, thick to the knee. |
| 4 | Freezing drizzle. Everything slick. |
| 5 | Clear and bitterly cold; the stars look close. |
| 6 | A low hum on the wind, from the direction of the weir. |
`;

  /* ---------- the rest of the vault ---------- */
  f['Templates/Session Template.md'] = '## Prep\n\n## Recap\n';
  f['Archive/Old Campaign/Session 1.md'] = '# Session 1\n\nThe party met in a tavern, obviously.\n';
  f['Work/Meeting notes.md'] = '# Meeting notes\n\nNothing about dragons here.\n';
  f['.obsidian/community-plugins.json'] = JSON.stringify(['dataview', 'templater-obsidian']);
  f['.obsidian/app.json'] = JSON.stringify({ attachmentFolderPath: 'Attachments', newFileLocation: 'current' });

  /* ---------- the Character Library, at the root of the vault ---------- */
  for (const [name, text] of Object.entries(SHOWCASE_CHARS)) f['Character Library/Characters/' + name + '.md'] = text;
  return f;
}
