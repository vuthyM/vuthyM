/* Characters made in code (the same way the creator makes them) for the library tests. */
import { loadChars } from '../src/core/chardata.js';
import { blankCharacter, characterMarkdown, firstSub } from '../src/core/character.js';

export async function fixtures() {
  const data = await loadChars();
  const mk = (name, f) => { const c = blankCharacter(data, 'pc'); c.name = name; f(c); return { name, text: characterMarkdown(data, c) }; };
  return [
    mk('Bram Test', c => { c.cls = 'Fighter'; c.sub = firstSub(data, 'Fighter'); c.level = 3; c.species = 'Human'; c.bg = 'Soldier'; c.base = { Str: 15, Dex: 13, Con: 14, Int: 8, Wis: 12, Cha: 10 }; c.skills = ['Athletics', 'Perception']; }),
    mk('Vex Test', c => { c.cls = 'Rogue'; c.sub = firstSub(data, 'Rogue'); c.level = 5; c.species = 'Elf'; c.bg = 'Criminal'; c.base = { Str: 8, Dex: 15, Con: 13, Int: 12, Wis: 10, Cha: 14 }; c.skills = ['Stealth', 'Sleight of Hand', 'Perception', 'Deception']; c.expertise = ['Stealth', 'Sleight of Hand']; c.asiLog = { 4: { k: 'asi', plus: { Dex: 2 } } }; }),
    mk('Wren Test', c => { c.cls = 'Wizard'; c.sub = firstSub(data, 'Wizard'); c.level = 1; c.species = 'Human'; c.bg = 'Sage'; c.base = { Str: 8, Dex: 14, Con: 13, Int: 15, Wis: 12, Cha: 10 }; c.skills = ['Arcana', 'History']; }),
  ];
}
