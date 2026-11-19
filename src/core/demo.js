/* A made-up campaign so the whole app can be tried without a vault.
   Deliberately mixed: some notes use front matter, some inline fields, some neither. */

const MAP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
<rect width="640" height="420" fill="#e8dfc7"/>
<path d="M0 300 Q160 250 320 290 T640 270 V420 H0Z" fill="#b8cfa0"/>
<path d="M0 340 Q200 320 400 350 T640 330 V420 H0Z" fill="#9dbb86"/>
<path d="M60 40 Q120 10 200 30 T330 60" stroke="#6aa1c9" stroke-width="12" fill="none" stroke-linecap="round"/>
<rect x="250" y="180" width="30" height="26" fill="#8a6a45"/><rect x="290" y="190" width="26" height="22" fill="#8a6a45"/>
<rect x="326" y="176" width="34" height="30" fill="#7b5c3a"/><rect x="370" y="192" width="24" height="20" fill="#8a6a45"/>
<text x="238" y="170" font-family="Georgia,serif" font-size="22" fill="#3b2b17">Greenhold</text>
<circle cx="500" cy="120" r="26" fill="#cbbf9d" stroke="#6b5a3a" stroke-width="3"/>
<text x="470" y="170" font-family="Georgia,serif" font-size="16" fill="#3b2b17">The Sunken Chapel</text>
<path d="M395 200 Q450 190 480 140" stroke="#8a6a45" stroke-width="3" stroke-dasharray="6 5" fill="none"/>
</svg>`;

export const DEMO_CAMPAIGN = 'Ashfall';
export const DEMO_VAULT_NAME = 'Demo Vault';

export function demoFiles() {
  const f = {};
  f['Ashfall/Ashfall.md'] = `# Ashfall

A slow-burning mystery in the river village of Greenhold, where the temple bells went missing the night before the first frost. The party (three level 5 adventurers) arrived looking for work and found a town that stopped talking.

## Themes
Grief, quiet bargains, and what a community will overlook to keep the peace.

See [[The Missing Bells]] and [[Who Poisoned the Well]] for the open threads.
`;

  f['Ashfall/NPCs/Mireille Vane.md'] = `---
race: Half-elf
role: Innkeeper
status: Alive
location: "[[Greenhold]]"
faction: "[[Ember Court]]"
tags:
  - npc
  - greenhold
---

# Mireille Vane

Runs the Cinder & Crown, the only inn in [[Greenhold]]. Soft-spoken, tracks everything, writes nothing down. She knows who rang the bells last, and is quietly paying [[Old Tam]] to keep the ferry moving at night.

## Wants
To keep the inn open through winter without anyone asking about [[Brother Calder]].
`;

  f['Ashfall/NPCs/Brother Calder.md'] = `# Brother Calder

**Race:** Human
**Role:** Priest of the Quiet Flame
**Location:** [[The Sunken Chapel]]

Gaunt, kind, and lying about something. He says the chapel flooded years ago, but the floor is dry and the candles are fresh. Mireille brings him supper on Thursdays.
`;

  f['Ashfall/NPCs/Old Tam.md'] = `---
role: Ferryman
---

Rows the river crossing at all hours and never asks for a fare twice. Sees more than he says. Owes [[Mireille Vane]] a favor.
`;

  f['Ashfall/NPCs/Captain Isolde Ravenscroft.md'] = `---
race: Human
role: Guard captain
faction: "[[Ember Court]]"
status: Alive
---

# Captain Isolde Ravenscroft

Leads the six-person watch. Believes the bells were stolen by outsiders and is **very** interested in the party's story.
`;

  f['Ashfall/Players/Kestra Dune.md'] = `---
player: Alex
class: Rogue
race: Tiefling
level: 5
hp: 38
ac: 15
init: 4
---

# Kestra Dune

Former courier for a smuggling ring. Carries a letter she hasn't opened.
`;

  f['Ashfall/Players/Bram Ironhollow.md'] = `---
player: Sam
class: Cleric
race: Dwarf
level: 5
hp: 44
ac: 18
init: 0
---

# Bram Ironhollow

Cleric of the Hearth. Wants to know why Greenhold's shrine is cold.
`;

  f['Ashfall/Players/Sorrel Vance.md'] = `# Sorrel Vance

Class:: Wizard
Level:: 5
HP:: 31
AC:: 13
Init:: 2

Halfling diviner, collects local rumors in a pocket ledger.
`;

  f['Ashfall/Locations/Greenhold.md'] = `---
kind: Village
---

# Greenhold

About 400 people on the north bank of the Weir. One inn, one ferry, a shrine nobody will explain. ![[Greenhold Map.svg]]

Home to [[Mireille Vane]] and the watch under [[Captain Isolde Ravenscroft]].
`;

  f['Ashfall/Locations/The Sunken Chapel.md'] = `---
kind: Ruin
region: "[[Greenhold]]"
---

# The Sunken Chapel

Half a mile upriver. [[Brother Calder]] keeps vigil here. The bell tower is empty.
`;

  f['Ashfall/Factions/Ember Court.md'] = `---
goal: Keep Greenhold's bells silent
leader: "[[Captain Isolde Ravenscroft]]"
---

# Ember Court

Village council in all but name. Meets in the back of the Cinder & Crown. [[Mireille Vane]] sits on it; Calder does not.
`;

  f['Ashfall/Plot Threads/The Missing Bells.md'] = `---
status: Active
seeded:
  - "[[Old Tam]]"
  - "[[Ember Court]]"
appears:
  - "[[Greenhold]]"
  - "[[The Sunken Chapel]]"
---

# The Missing Bells

Three bells vanished from the shrine tower on the night of the first frost. Nobody heard them come down.

## Next steps
- Ask [[Old Tam]] who he ferried that night
- Search [[The Sunken Chapel]]
`;

  f['Ashfall/Plot Threads/Who Poisoned the Well.md'] = `---
status: Dormant
seeded:
  - "[[Sorrel Vance]]"
---

# Who Poisoned the Well

The east well tasted of iron in the spring. Ignored by everyone except Sorrel.
`;

  f['Ashfall/Sessions/2026-10-05 Session 11.md'] = `---
number: 11
date: 2026-10-05
---

# Session 11: Cold Welcome

## Recap
The party reached Greenhold, met [[Mireille Vane]], and learned the bells are missing. Kestra picked a lock she should not have.
`;

  f['Ashfall/Sessions/2026-10-12 Session 12.md'] = `---
number: 12
date: 2026-10-12
---

# Session 12: The Ferry at Night

## Prep
- Old Tam's ferry schedule
- Captain Isolde's first interrogation

## Recap
Ferried upriver after dark. Found the chapel dry and warm, with fresh candles. [[Brother Calder]] was not alone.
`;

  f['Ashfall/Maps/Greenhold Map.svg'] = new Blob([MAP_SVG], { type: 'image/svg+xml' });
  f['Ashfall/Maps/Map notes.md'] = `# Map notes

Handout for players: ![[Greenhold Map.svg]]
`;

  /* the rest of the vault, so the folder picker has something to browse */
  f['Templates/Session Template.md'] = '## Prep\n\n## Recap\n';
  f['Archive/Old Campaign/Session 1.md'] = '# Session 1\n\nThe party met in a tavern, obviously.\n';
  f['Work/Meeting notes.md'] = '# Meeting notes\n\nNothing about dragons here.\n';
  f['.obsidian/community-plugins.json'] = JSON.stringify(['dataview', 'templater-obsidian']);
  f['.obsidian/app.json'] = JSON.stringify({ attachmentFolderPath: 'Attachments', newFileLocation: 'current' });
  return f;
}
