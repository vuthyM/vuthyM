/* Short reminders of what each condition does, for the combat tracker's hover text. They are written for DM Forge from the 2024 rules
   (the SRD 5.2.1 Rules Glossary has the exact wording), so check the book for anything that matters. */
export const CONDITION_RULES = {
  Blinded: 'Can’t see, and fails any check that needs sight. Attack rolls against it have Advantage; its attack rolls have Disadvantage.',
  Charmed: 'Can’t attack the charmer or target them with harmful abilities or magical effects. The charmer has Advantage on social ability checks against it.',
  Deafened: 'Can’t hear, and fails any check that needs hearing.',
  Exhaustion: 'Has levels of exhaustion (it stacks). Each level: −2 to D20 Tests and −5 ft (1.5 m) Speed. Dies at level 6. A Long Rest removes one level.',
  Frightened: 'Disadvantage on ability checks and attack rolls while it can see the source of its fear, and it can’t willingly move closer to it.',
  Grappled: 'Speed is 0 and can’t increase. Disadvantage on attack rolls against anyone but the grappler. The grappler can drag or carry it (extra movement).',
  Incapacitated: 'Can’t take actions, Bonus Actions or Reactions. Concentration is broken. Can’t speak. Disadvantage on Initiative if it becomes incapacitated as it rolls.',
  Invisible: 'Can’t be seen without special senses or magic. Attack rolls against it have Disadvantage; its attack rolls have Advantage. Advantage on Initiative.',
  Paralyzed: 'Incapacitated, Speed 0, fails Strength and Dexterity saves. Attack rolls against it have Advantage, and a hit from within 5 ft (1.5 m) is a Critical Hit.',
  Petrified: 'Turned to stone: Incapacitated, Speed 0, unaware, fails Strength and Dexterity saves. Attacks against it have Advantage. Resistance to all damage, immune to Poisoned.',
  Poisoned: 'Disadvantage on attack rolls and ability checks.',
  Prone: 'Can only crawl, or spend half its Speed to stand. Disadvantage on attack rolls. Attacks against it have Advantage from within 5 ft (1.5 m), Disadvantage from farther.',
  Restrained: 'Speed is 0. Attack rolls against it have Advantage; its attack rolls have Disadvantage. Disadvantage on Dexterity saves.',
  Stunned: 'Incapacitated, fails Strength and Dexterity saves. Attack rolls against it have Advantage.',
  Unconscious: 'Incapacitated and Prone, drops what it holds, Speed 0, unaware. Fails Strength and Dexterity saves. Attacks against it have Advantage; a hit from within 5 ft (1.5 m) is a Critical Hit.',
  Concentrating: 'Keeping a spell going. Taking damage means a Constitution save (DC 10 or half the damage, whichever is higher). Incapacitated or dying ends it.',
};
export const ruleFor = name => CONDITION_RULES[name] || '';
