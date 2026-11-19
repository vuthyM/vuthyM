/* The DM cheat sheet: short reminders of the 2024 rules (5th edition, revised), written in our own words.
   Distances, speeds and weights are metric. (Older text written as metric shows only its first half.)
   A card with check: true is one whose details are worth confirming in the book. */

export const EDITION = '2024';

const t = (rows, head) => '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n');

export const GROUPS = [
  {
    id: 'abilities', title: 'The six abilities',
    cards: [
      {
        id: 'abilities', title: 'What each ability means (one tomato)',
        body: 'An ability score is what you roll with. Each ability has skills tied to it, and a **save** is the same ability used to resist something.\n\n' + [
          ['Strength', 'Raw physical power', 'Athletics', 'Crushing a tomato in your fist, hurling it across a tavern, hauling a crate of them up a ladder. *Save:* not being knocked off your feet by a rolling barrel of them.'],
          ['Dexterity', 'Agility, reflexes, balance, fine hands', 'Acrobatics, Sleight of Hand, Stealth', 'Catching a tomato thrown at you, slicing it paper-thin without squishing it, palming one off a market stall. *Save:* dodging the tomato someone throws at you. Also used for initiative.'],
          ['Constitution', 'Health, stamina, grit', 'none (hit points, concentration, endurance)', 'Keeping down a very rotten tomato, or marching all day on nothing else. *Save:* resisting the poison from it.'],
          ['Intelligence', 'Reasoning, memory, knowledge', 'Arcana, History, Investigation, Nature, Religion', 'Knowing a tomato is technically a fruit (Nature), working out from the splatter who threw it (Investigation), recalling how it came to be traded (History), knowing which potion it goes in (Arcana). *Save:* seeing through an illusion of one.'],
          ['Wisdom', 'Awareness, intuition, insight', 'Animal Handling, Insight, Medicine, Perception, Survival', 'Spotting the one bad tomato in the pile (Perception), sensing the seller is lying about where they came from (Insight), knowing if it will make someone sick (Medicine), finding wild ones to forage (Survival). *Save:* resisting being charmed or frightened.'],
          ['Charisma', 'Force of personality', 'Deception, Intimidation, Performance, Persuasion', 'Talking the stallholder into a discount (Persuasion), claiming it is a rare magical fruit (Deception), threatening to splat the guard (Intimidation), juggling them for coins (Performance). *Save:* resisting being banished or having your will overridden.'],
        ].map(r => '**' + r[0] + '** (' + r[1].toLowerCase() + ')\n- *Skills:* ' + r[2] + '\n- *The tomato:* ' + r[3]).join('\n\n'),
      },
      {
        id: 'which-ability', title: 'Which ability do I call for?',
        body: 'Ask what the character is relying on:\n\n- Muscle or force? **Strength**\n- Reflexes, balance or a steady hand? **Dexterity**\n- Endurance or toughness? **Constitution**\n- Knowledge or reasoning? **Intelligence**\n- Noticing, reading a person or instinct? **Wisdom**\n- Persuasion or presence? **Charisma**\n\nPick the ability from what the player *describes doing*, then the skill that fits it. The same skill can pair with a different ability if the approach changes (Strength (Intimidation) to threaten with muscle).',
      },
    ],
  },
  {
    id: 'core', title: 'Core rules',
    cards: [
      { id: 'd20', title: 'D20 Test', body: 'Attack roll, ability check or saving throw: **d20 + modifier** against a DC (or the target\'s AC). Meeting the number succeeds.' },
      { id: 'nat', title: 'Natural 20 and natural 1', body: 'These only count on **attack rolls**: a 20 always hits and is a critical hit, a 1 always misses. On checks and saves they have no special effect.' },
      { id: 'adv', title: 'Advantage and disadvantage', body: 'Roll two d20s and take the higher (advantage) or lower (disadvantage). They never stack. If you have both, they cancel to one normal roll, however many of each.' },
      { id: 'inspiration', title: 'Heroic Inspiration', body: 'Spend it to **reroll any one die** and keep the new result. You can only hold one at a time. The DM can award it for bold or in-character moments; humans get it at the start of each long rest.' },
      {
        id: 'prof', title: 'Proficiency bonus',
        body: t([['+2', '+3', '+4', '+5', '+6']], ['Levels 1–4', '5–8', '9–12', '13–16', '17–20']),
      },
      {
        id: 'dcs', title: 'Typical DCs',
        body: t([['5', '10', '15', '20', '25', '30']], ['Very easy', 'Easy', 'Medium', 'Hard', 'Very hard', 'Nearly impossible']),
      },
      { id: 'passive', title: 'Passive checks', body: '**10 + the check\'s modifier.** Advantage adds 5, disadvantage subtracts 5.' },
      { id: 'help-check', title: 'Help (on a check)', body: 'You can only help if you could attempt the task yourself. The helped creature gets **advantage** on that check.' },
      { id: 'group', title: 'Group checks', body: 'Everyone rolls. If at least **half** succeed, the group succeeds.' },
    ],
  },
  {
    id: 'combat', title: 'Your turn and combat',
    cards: [
      { id: 'turn', title: 'Turn structure', body: 'One **move**, one **action**, one **bonus action** (only if something gives you one) and one free object interaction. You get one **reaction** per round, and it refreshes at the start of your own turn.' },
      { id: 'initiative', title: 'Initiative', check: true, body: 'A **Dexterity check** when combat starts. A surprised creature has **disadvantage** on its initiative roll (the 2024 rules have no separate surprise round). Ties are the DM\'s call. A group of identical monsters can share one roll.' },
      {
        id: 'actions', title: 'The 12 actions',
        body: t([
          ['**Attack**', 'Make one attack (more with Extra Attack). You can swap one attack for a grapple, a shove or another unarmed strike effect.'],
          ['**Dash**', 'Gain extra movement equal to your speed.'],
          ['**Disengage**', 'Your movement does not provoke opportunity attacks for the rest of the turn.'],
          ['**Dodge**', 'Until your next turn, attacks against you have disadvantage (if you can see the attacker) and you have advantage on Dex saves. Lost if you are Incapacitated or your speed is 0.'],
          ['**Help**', 'Give a creature advantage on an ability check, or give an ally advantage on their next attack against an enemy within 1.5 m of you.'],
          ['**Hide**', 'A **DC 15 Dexterity (Stealth)** check, only if you are heavily obscured or behind three-quarters or total cover. Success makes you Invisible, and your roll is the DC to find you. It ends if you make noise, attack, or cast a spell with a verbal component.'],
          ['**Influence**', 'Charisma (Deception, Intimidation, Performance, Persuasion) or Wisdom (Animal Handling) check against a DC the DM sets.'],
          ['**Magic**', 'Cast a spell, use a magic item, or use a magical feature.'],
          ['**Ready**', 'Pick a trigger and a response. Your reaction fires when the trigger happens. A readied spell uses the slot now and needs concentration until released.'],
          ['**Search**', 'A Wisdom check (Insight, Medicine, Perception or Survival).'],
          ['**Study**', 'An Intelligence check (Arcana, History, Investigation, Nature or Religion).'],
          ['**Utilize**', 'Use a nonmagical object that needs an action.'],
        ], ['Action', 'What it does']),
      },
      { id: 'oa', title: 'Opportunity attack', body: 'A **reaction**. It triggers when a creature you can see leaves your reach by its **own movement**. It does not trigger on teleporting or forced movement.' },
      { id: 'ranged', title: 'Ranged attacks', body: '**Disadvantage** if a hostile creature that can act is within 1.5 m of you. Disadvantage beyond normal range. You cannot attack beyond long range.' },
      { id: 'twf', title: 'Two-weapon fighting', body: 'When you attack with a **Light** weapon, you can make a bonus-action attack with a different Light weapon. You do not add your ability modifier to that damage unless it is negative.' },
      {
        id: 'cover', title: 'Cover',
        body: t([['+2 to AC and Dex saves', '+5 to AC and Dex saves', 'Cannot be targeted directly']], ['Half', 'Three-quarters', 'Total']),
      },
      { id: 'unarmed', title: 'Unarmed strike', body: '**1 + Strength modifier** bludgeoning damage, or a grapple or shove (below).' },
      { id: 'grapple', title: 'Grapple', body: 'The target must be **no more than one size larger** than you and within reach, and you need a free hand. It makes a Strength or Dexterity save against **DC 8 + your Strength modifier + proficiency bonus**. On a fail it is **Grappled**. Moving a grappled creature halves your speed, unless it is Tiny or two or more sizes smaller than you. Escaping takes an action and the same DC check.' },
      { id: 'shove', title: 'Shove', body: 'Same save and DC as a grapple, and the target can be at most one size larger. On a fail you push it 1.5 m away **or** knock it **Prone**.' },
      { id: 'mounted', title: 'Mounted combat', body: 'The mount must be at least **one size larger** than you. Mounting or dismounting costs **half your speed**. A *controlled* mount acts on your initiative and can only Dash, Disengage or Dodge. An *independent* mount acts on its own. If your mount is knocked Prone, make a **DC 10 Dex save** or you fall Prone beside it.' },
      { id: 'underwater', title: 'Underwater', check: true, body: 'A melee attack from a creature without a swim speed has **disadvantage** unless it is a dagger, javelin, shortsword, spear or trident. A ranged attack misses beyond normal range and has disadvantage within it. Everything underwater has **fire resistance**.' },
      { id: 'crit', title: 'Critical hit', body: 'Roll **all the weapon\'s damage dice twice**, then add modifiers once.' },
      { id: 'damage', title: 'Damage adjustments', body: 'Apply bonuses and penalties first, then **resistance** (halve, round down), then **vulnerability** (double). **Temporary HP** absorbs damage first, never stacks (keep the larger pool), and is not healing.' },
      {
        id: 'zero', title: 'At 0 hit points',
        body: '- If the damage left over after reaching 0 is at least your **max HP**, you die outright.\n- Otherwise you fall **Unconscious** and start death saves.\n- **Death save:** d20 at the start of each of your turns. **10 or higher** is a success, below 10 a failure. **3 successes** and you are stable; **3 failures** and you die.\n- A natural **1** counts as 2 failures. A natural **20** brings you back with **1 HP**.\n- Taking damage at 0 HP is 1 failure (2 if it is a critical hit).\n- **Stabilizing someone:** a **DC 10 Wisdom (Medicine)** check, using the Help action. A stable creature regains 1 HP after 1d4 hours.\n- **Knocking out:** reduce a creature to 0 with a melee attack and you can choose to leave it Unconscious and stable instead of killing it.',
        check: true,
      },
      { id: 'concentration', title: 'Concentration', body: 'It ends if you cast another concentration spell, become **Incapacitated**, or die. When you take damage, make a **Constitution save** against **DC 10 or half the damage**, whichever is higher (maximum DC 30).' },
      { id: 'spellcasting', title: 'Spellcasting limits', body: 'If you cast a spell as a **bonus action**, the only other spell you can cast that turn is a cantrip with a casting time of one action. **Ritual** casting adds 10 minutes and uses no slot. A ranged spell attack with a hostile within 1.5 m has disadvantage.' },
    ],
  },
  {
    id: 'conditions', title: 'Conditions',
    cards: [
      {
        id: 'conditions', title: 'All conditions',
        body: t([
          ['**Blinded**', 'Cannot see. Fails sight-based checks. Attacks against you have advantage, yours have disadvantage.'],
          ['**Charmed**', 'Cannot attack the charmer or target them with harmful effects. The charmer has advantage on social checks against you.'],
          ['**Deafened**', 'Cannot hear. Fails hearing-based checks.'],
          ['**Exhaustion**', 'Cumulative levels, up to 6 (death). Every d20 Test is reduced by **2 × level**. Speed drops by 1.5 m × level. A long rest removes 1 level.'],
          ['**Frightened**', 'Disadvantage on ability checks and attacks while the source of fear is in line of sight. You cannot willingly move closer to it.'],
          ['**Grappled**', 'Speed 0. Disadvantage on attacks against anyone but the grappler. The grappler can drag or carry you. Ends if the grappler is Incapacitated or you are moved out of reach.'],
          ['**Incapacitated**', 'No actions, bonus actions or reactions. Concentration breaks. Cannot speak. Disadvantage on initiative.'],
          ['**Invisible**', 'Not affected by effects that need to see you. Attacks against you have disadvantage, yours have advantage. Advantage on initiative. Does not work against creatures that can see you.'],
          ['**Paralyzed**', 'Incapacitated, speed 0. Auto-fail Str and Dex saves. Attacks against you have advantage. A hit from within 1.5 m is a **critical hit**.'],
          ['**Petrified**', 'Turned to stone. Incapacitated, speed 0. Auto-fail Str and Dex saves. Attacks against you have advantage. Resistance to all damage. Immune to Poisoned.'],
          ['**Poisoned**', 'Disadvantage on attack rolls and ability checks.'],
          ['**Prone**', 'You can only crawl or stand up (standing costs half your speed). Disadvantage on your attacks. Attacks against you have advantage from within 1.5 m, otherwise disadvantage.'],
          ['**Restrained**', 'Speed 0. Attacks against you have advantage, yours have disadvantage. Disadvantage on Dex saves.'],
          ['**Stunned**', 'Incapacitated. Auto-fail Str and Dex saves. Attacks against you have advantage.'],
          ['**Unconscious**', 'Incapacitated, Prone, drops what it holds. Speed 0. Auto-fail Str and Dex saves. Attacks against you have advantage. A hit from within 1.5 m is a **critical hit**.'],
        ], ['Condition', 'Effect']),
      },
    ],
  },
  {
    id: 'mastery', title: 'Weapon mastery',
    cards: [
      {
        id: 'mastery', title: 'The eight properties',
        body: 'You can only use a mastery property if your class lets you and you have chosen that weapon.\n\n' + t([
          ['**Cleave**', 'Attack a second creature within 1.5 m of the first, adding no ability modifier to damage unless it is negative. Once per turn.'],
          ['**Graze**', 'On a **miss**, you still deal damage equal to the ability modifier you used.'],
          ['**Nick**', 'The extra Light-weapon attack becomes part of the Attack action instead of using your bonus action. Once per turn.'],
          ['**Push**', 'Push a Large or smaller target up to 3 m straight away.'],
          ['**Sap**', 'The target has disadvantage on its next attack roll before your next turn.'],
          ['**Slow**', 'The target\'s speed drops by 3 m until the start of your next turn. Does not stack.'],
          ['**Topple**', 'The target makes a Con save (DC 8 + your modifier + proficiency bonus) or is knocked Prone.'],
          ['**Vex**', 'You have advantage on your next attack against the target before the end of your next turn.'],
        ], ['Property', 'On a hit (unless noted)']),
      },
    ],
  },
  {
    id: 'rest', title: 'Resting',
    cards: [
      { id: 'short-rest', title: 'Short rest', body: 'At least **1 hour**. Spend **Hit Dice** to heal (roll the die plus your Con modifier for each). Some features recharge. Fighting, casting a spell or similar effort interrupts it.' },
      { id: 'long-rest', title: 'Long rest', body: 'At least **8 hours** (6 asleep, no more than 2 of light activity). You regain all HP, up to **half your total Hit Dice** (minimum 1), and **1 level of exhaustion** is removed. You need at least 1 HP to start and can take only one per 24 hours. An hour of strenuous activity (walking, fighting, casting) interrupts it.' },
    ],
  },
  {
    id: 'explore', title: 'Exploration and the world',
    cards: [
      {
        id: 'travel', title: 'Travel pace', check: true,
        body: t([
          ['Fast', '6 km', '45 km', '-5 to passive Perception'],
          ['Normal', '4.5 km', '36 km', 'none'],
          ['Slow', '3 km', '27 km', 'can use Stealth'],
        ], ['Pace', 'Per hour', 'Per day', 'Effect']),
      },
      { id: 'forced', title: 'Forced march', body: 'After 8 hours of travel, each extra hour needs a **Con save (DC 10, +1 per extra hour)**. A fail gives **1 level of exhaustion**.' },
      {
        id: 'light', title: 'Light and vision',
        body: t([
          ['Bright', 'Normal vision.'],
          ['Dim (lightly obscured)', 'Disadvantage on sight-based Perception checks.'],
          ['Darkness (heavily obscured)', 'Treated as **Blinded**.'],
        ], ['Light', 'Effect']) + '\n\nDarkvision turns dim light into bright and darkness into dim, out to its range.',
      },
      { id: 'falling', title: 'Falling', body: '**1d6 bludgeoning** damage per 3 m fallen, to a maximum of **20d6**. You land **Prone** unless you took no damage.' },
      { id: 'suffocating', title: 'Suffocating', check: true, body: 'You can hold your breath for **1 + Con modifier minutes** (minimum 30 seconds). After that you survive a number of rounds equal to your **Con modifier** (minimum 1), then drop to 0 HP and cannot heal until you can breathe.' },
      { id: 'jumping', title: 'Jumping', body: '**Long jump:** Strength score × 0.3 m, with a 3 m run-up (half without).\n\n**High jump:** 0.9 m + 0.3 m × Strength modifier.' },
      { id: 'carrying', title: 'Carrying', body: '**Carry:** 7.5 kg × Strength score.\n\n**Push, drag or lift:** 15 kg × Strength score.' },
      {
        id: 'objects', title: 'Object AC',
        body: t([['11', '13', '15', '17', '19', '21', '23']], ['Cloth, paper', 'Glass, ice', 'Wood, bone', 'Stone', 'Iron, steel', 'Mithral', 'Adamantine']),
      },
      {
        id: 'size', title: 'Creature size and space',
        body: t([['0.75 m', '1.5 m', '1.5 m', '3 m', '4.5 m', '6 m+']], ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']),
      },
    ],
  },
  {
    id: 'ref', title: 'Reference lists',
    cards: [
      { id: 'damage-types', title: 'Damage types (13)', body: 'Acid, bludgeoning, cold, fire, force, lightning, necrotic, piercing, poison, psychic, radiant, slashing, thunder.' },
      { id: 'currency', title: 'Currency', body: '1 gp = 10 sp = 100 cp. 1 ep = 5 sp. 1 pp = 10 gp.' },
      { id: 'attunement', title: 'Attunement', body: 'Up to **3 items** at a time. Attuning takes a short rest spent focused on the item.' },
      { id: 'monsters', title: 'Monster terms', body: '- **Bloodied:** at half HP or less.\n- **Recharge X–6:** at the start of its turn, roll a d6. If you roll X or higher, the ability is back.\n- **Legendary actions:** usually 3 per round, used one at a time after another creature\'s turn, and refreshed at the start of the monster\'s turn. They cannot be used while Incapacitated.\n- **Legendary Resistance:** turns a failed save into a success, a limited number of times per day.' },
    ],
  },
  {
    id: 'tips', title: 'DM tips',
    cards: [
      { id: 'tip-rolls', title: 'Roll only when it matters', body: 'Call for a roll when the outcome is uncertain and failing would be interesting. If it is easy, or there is no pressure and plenty of time, just let it succeed.' },
      { id: 'tip-approach', title: 'Ask for the approach first', body: 'Say "what do you do?", then pick the ability and skill that fit what they described, not the one they name.' },
      { id: 'tip-dc', title: 'Set the DC before the roll', body: 'Use the DC table (5, 10, 15, 20, 25, 30). Do not adjust it after seeing the result.' },
      { id: 'tip-passive', title: 'Use passive scores', body: 'For noticing a trap or a hidden door, a passive score saves interrupting the flow, and nobody learns something is there just because you asked for a roll.' },
      { id: 'tip-forward', title: 'Fail forward', body: 'A failed check can still move the story: they succeed but with a cost, they are noticed, or time passes.' },
      { id: 'tip-ruling', title: 'Make a ruling now, look it up later', body: 'Keep the game moving and check the book after the session.' },
      { id: 'tip-telegraph', title: 'Telegraph danger', body: 'Describe signs before the threat arrives so players feel their choices matter.' },
      { id: 'tip-combat', title: 'Keep combat quick', body: 'Roll monster initiative in groups, use average damage, narrate misses with flavour, and use "bloodied" to hint a monster is hurting.' },
      { id: 'tip-pillars', title: 'Balance the three pillars', body: 'Mix combat, exploration and social scenes in a session.' },
      { id: 'tip-inspiration', title: 'Reward heroics', body: 'Give Heroic Inspiration for bold or in-character moments, and do not hoard it.' },
      { id: 'tip-clues', title: 'Plan clues in threes', body: 'If something is essential, give it three different ways to be found.' },
      { id: 'tip-session', title: 'Start with a hook, end on a beat', body: 'Open with a short recap and a strong first scene, and stop at a moment that makes them want the next session.' },
      { id: 'tip-zero', title: 'Session zero and safety', body: 'Agree lines (not at the table) and veils (fade to black) before you start.' },
    ],
  },
];

/* ---- units ---- */
export function unitize(text) {
  return String(text).replace(/\{\{([^|}]+)\|([^}]+)\}\}/g, (_, m) => m);
}

/* ---- your own cards live in a note: each "##" section is one card ---- */
export const CUSTOM_NOTE = 'DM Cheat Sheet';
const HEAD = '# DM Cheat Sheet\n\nYour own rules and reminders. DM Forge shows each "##" section as a card in the cheat sheet.\n';

export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card';

export function parseCustom(text) {
  const cards = [];
  let cur = null, fence = false;
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && line.match(/^##[ \t]+(.+?)[ \t]*#*[ \t]*$/);
    if (m) { cur = { title: m[1].trim(), lines: [] }; cards.push(cur); }
    else if (cur) cur.lines.push(line);
  }
  const seen = new Set();
  return cards.map(c => {
    let id = 'my-' + slug(c.title), n = 2;
    while (seen.has(id)) id = 'my-' + slug(c.title) + '-' + n++;
    seen.add(id);
    return { id, title: c.title, body: c.lines.join('\n').trim(), custom: true };
  });
}

/* the text before the first card (a title, notes of your own) is kept as it is when the cards are saved */
export function buildCustom(cards, existing) {
  let head = HEAD;
  if (existing) {
    const lines = String(existing).replace(/\r\n/g, '\n').split('\n'), out = [];
    let fence = false;
    for (const line of lines) {
      if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
      if (!fence && /^##[ \t]+/.test(line)) break;
      out.push(line);
    }
    head = out.join('\n').replace(/\s+$/, '') + '\n';
  }
  return head + cards.map(c => '\n## ' + c.title.replace(/\s+/g, ' ').trim() + '\n\n' + String(c.body || '').trim() + '\n').join('');
}

/* ---- search: every word has to appear in the card's title or text ---- */
const plain = s => String(s).toLowerCase().replace(/\{\{([^|}]+)\|[^}]+\}\}/g, '$1').replace(/[*|_`>#-]/g, ' ');
export function matches(card, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = card.title.toLowerCase() + ' ' + plain(card.body);
  return words.every(w => hay.includes(w));
}

export function allCards(custom) { return [...custom, ...GROUPS.flatMap(g => g.cards)]; }
