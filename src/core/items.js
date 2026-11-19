/* Items and shops. Magic items have a real type, rarity, mechanics, a catch or curse, a history, a value and a hook;
   shops have a type and size, a keeper with a manner and a secret, priced stock, magic wares, what they buy and how
   to haggle. Prices and rarities follow the 5th-edition guidelines (the DMG's value ranges). Nothing here needs
   anything outside this file except the helpers handed to buildItemGenerators. */

const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const chance = p => Math.random() < p;
const range = (a, b) => a + rnd(b - a + 1);
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const fmt = n => n.toLocaleString('en-US');
function pickN(a, n) { const c = a.slice(), o = []; while (o.length < n && c.length) o.push(c.splice(rnd(c.length), 1)[0]); return o; }
function weighted(pairs) { const t = pairs.reduce((s, p) => s + p[1], 0); let r = Math.random() * t; for (const p of pairs) { r -= p[1]; if (r < 0) return p[0]; } return pairs[pairs.length - 1][0]; }

/* ---------- money ---------- */
const UNIT = { cp: 1, sp: 10, gp: 100, pp: 1000 };
const cpOf = s => { const m = /^([\d.]+)(cp|sp|gp|pp)$/.exec(s); return m ? Math.round(parseFloat(m[1]) * UNIT[m[2]]) : 0; };
export function fmtCp(cp) {
  if (cp < 10) return cp + ' cp';
  if (cp < 100) return Math.round(cp / 10) + ' sp';
  let gp = cp / 100;
  gp = gp < 10 ? Math.round(gp * 2) / 2 : gp < 100 ? Math.round(gp) : gp < 1000 ? Math.round(gp / 5) * 5 : gp < 10000 ? Math.round(gp / 25) * 25 : Math.round(gp / 250) * 250;
  return fmt(gp) + ' gp';
}
const fmtGp = gp => fmtCp(Math.round(gp * 100));

/* ---------- rarities ---------- */
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary'];
const DC = { 'Common': 11, 'Uncommon': 13, 'Rare': 15, 'Very rare': 17, 'Legendary': 19 };
const BONUS = { 'Uncommon': 1, 'Rare': 2, 'Very rare': 3, 'Legendary': 3 };
const XDICE = { 'Uncommon': '1d4', 'Rare': '1d6', 'Very rare': '2d6', 'Legendary': '3d6' };
const VALUE = { 'Common': [50, 100], 'Uncommon': [101, 500], 'Rare': [501, 5000], 'Very rare': [5001, 50000], 'Legendary': [50001, 250000] };
const ELEMS = ['fire', 'cold', 'lightning', 'thunder', 'acid', 'necrotic', 'radiant', 'poison', 'psychic', 'force'];
const SKILLS = ['Stealth', 'Perception', 'Athletics', 'Acrobatics', 'Insight', 'Persuasion', 'Survival', 'Arcana', 'History', 'Investigation'];
const SP = {
  0: ['Light', 'Mage Hand', 'Prestidigitation', 'Minor Illusion', 'Mending', 'Message', 'Dancing Lights', 'Druidcraft', 'Spare the Dying', 'Guidance'],
  1: ['Magic Missile', 'Shield', 'Sleep', 'Thunderwave', 'Burning Hands', 'Cure Wounds', 'Healing Word', 'Feather Fall', 'Fog Cloud', 'Detect Magic', 'Jump', 'Longstrider', 'Mage Armor', 'Charm Person', 'Disguise Self', 'Silent Image', 'Guiding Bolt', 'Hellish Rebuke', 'Expeditious Retreat'],
  2: ['Misty Step', 'Invisibility', 'Mirror Image', 'Web', 'Levitate', 'Hold Person', 'Scorching Ray', 'Blur', 'Darkness', 'Silence', 'Spider Climb', 'Lesser Restoration', 'Knock', 'Pass without Trace', 'Shatter', 'Suggestion', 'See Invisibility', 'Gust of Wind'],
  3: ['Fireball', 'Lightning Bolt', 'Counterspell', 'Dispel Magic', 'Fly', 'Haste', 'Slow', 'Hypnotic Pattern', 'Major Image', 'Water Breathing', 'Tongues', 'Blink', 'Fear', 'Gaseous Form', 'Remove Curse', 'Stinking Cloud', 'Wind Wall'],
  4: ['Dimension Door', 'Greater Invisibility', 'Ice Storm', 'Polymorph', 'Stoneskin', 'Wall of Fire', 'Banishment', 'Confusion', 'Blight', 'Fire Shield'],
  5: ['Cone of Cold', 'Wall of Force', 'Telekinesis', 'Hold Monster', 'Dominate Person', 'Scrying', 'Raise Dead', 'Teleportation Circle'],
  6: ['Chain Lightning', 'Disintegrate', 'True Seeing', 'Globe of Invulnerability', 'Heal', 'Sunbeam'],
};
const spellAt = (a, b) => pick(SP[range(a, b)]);

/* ---------- what an item is made of and looks like ---------- */
const WEAPONS = ['longsword', 'shortsword', 'rapier', 'scimitar', 'greatsword', 'battleaxe', 'handaxe', 'warhammer', 'mace', 'spear', 'dagger', 'glaive', 'longbow', 'shortbow', 'light crossbow', 'quarterstaff', 'trident', 'whip'];
const ARMORS = ['leather armor', 'studded leather', 'chain shirt', 'scale mail', 'breastplate', 'half plate', 'plate', 'shield', 'shield', 'chain mail'];
const WONDROUS = ['cloak', 'boots', 'gloves', 'amulet', 'helm', 'belt', 'bracers', 'lantern', 'satchel', 'goblet', 'mirror', 'key', 'horn', 'brooch', 'circlet', 'pipes', 'compass', 'bell'];
const MATERIALS = ['silver-threaded', 'blackened iron', 'bone-white', 'jade-green', 'copper-banded', 'glass-clear', 'rune-etched oak', 'salt-crusted', 'obsidian', 'amber-set', 'moon-pale', 'wyrmscale', 'sun-bleached', 'ink-black', 'verdigris-green', 'rose-gold'];
const DETAILS = ['engraved with a ring of tiny stars', 'wrapped in faded red cord', 'etched with a map of a river that no longer exists', 'set with a single dull gem that brightens in firelight', 'worn smooth where thousands of thumbs have rubbed it', 'stamped with a maker\'s mark nobody recognizes', 'inscribed with a prayer in a dead language', 'scorched along one edge', 'carved with small, patient faces', 'dotted with tiny holes, like a night sky', 'bearing a coat of arms that has been deliberately chiseled off', 'faintly warm, as if recently held', 'covered in neat, tiny tally marks', 'engraved with a name that changes when no one is looking'];
const CONCEPTS = ['Whispers', 'Embers', 'Quiet Footsteps', 'the Drowned King', 'Borrowed Time', 'Hollow Hunger', 'Windward Luck', 'Ninefold Echoes', 'Stubborn Mercy', 'Starfall', 'Long Memory', 'the Last Laugh', 'the Patient Wolf', 'Salt and Iron', 'Fading Names', 'the Open Door', 'Seven Winters', 'Tarnished Oaths', 'the Cartographer', 'Small Mercies', 'the Unsent Letter', 'Thin Ice', 'the Third Bell', 'Midnight Debts'];
const NAME_ADJ = ['Gilded', 'Hollow', 'Silent', 'Patient', 'Burning', 'Forgotten', 'Quiet', 'Wandering', 'Stubborn', 'Midnight', 'Brazen', 'Mournful', 'Wary', 'Restless'];
const BLADE_A = ['Dawn', 'Night', 'Storm', 'Grave', 'Oath', 'Ember', 'Frost', 'Wyrm', 'Thorn', 'Iron', 'Silver', 'Gloom', 'Star', 'Sorrow', 'Mercy', 'Tide'];
const BLADE_B = ['bane', 'fang', 'song', 'edge', 'reach', 'bite', 'cleaver', 'ward', 'brand', 'whisper', 'thirst', 'fall', 'warden', 'sting'];
const OWNERS = ['Aldric', 'Branwen', 'Caius', 'Delyth', 'Eamon', 'Fenwick', 'Galadrin', 'Hesper', 'Ivar', 'Jorah', 'Kestrel', 'Lysandra', 'Mireille', 'Nolwenn', 'Osric', 'Percival', 'Quilla', 'Rowena', 'Soren', 'Thessaly', 'Ulric', 'Vesna', 'Wystan', 'Ysolde'];

/* ---------- what it does, by kind and rarity ({dc} {elem} {dice} {spell1} {spell2} {skill} {n} are filled in) ---------- */
const FX = {
  weapon: {
    Common: ['It is a perfectly ordinary weapon that sheds dim light in a 10-foot radius whenever you command it.', 'It never dulls, rusts or needs oiling.', 'It makes no sound when drawn, sheathed or struck against a shield.', 'Its finish changes color to match the wielder\'s mood.', 'It hums faintly when a creature that is lying stands within 10 feet.', 'It cannot be tarnished, and polishes itself overnight.'],
    Uncommon: ['You have a +1 bonus to attack and damage rolls made with this magic weapon.', 'You have a +1 bonus to attack and damage rolls made with this magic weapon. Once per dawn, you can command it to shed bright light in a 20-foot radius for 10 minutes.', 'You have a +1 bonus to attack and damage rolls made with this magic weapon. It returns to your hand as a bonus action if it is within 30 feet.', 'You have a +1 bonus to attack and damage rolls made with this magic weapon. Against one creature type chosen when it is first attuned, it deals an extra 1d4 damage.', 'You have a +1 bonus to attack and damage rolls made with this magic weapon. It cannot be disarmed from you while you are attuned.'],
    Rare: ['You have a +1 bonus to attack and damage rolls made with this magic weapon. When you hit, it deals an extra {dice} {elem} damage.', 'You have a +2 bonus to attack and damage rolls made with this magic weapon.', 'You have a +1 bonus to attack and damage rolls made with this magic weapon. Once per dawn, when you hit a creature, you can force it to make a DC {dc} Wisdom saving throw or be frightened of you until the end of your next turn.', 'You have a +1 bonus to attack and damage rolls made with this magic weapon. Once per dawn, you can cast {spell1} from it (save DC {dc}).', 'You have a +2 bonus to attack and damage rolls made with this magic weapon. It glows when a creature that hates you is within 60 feet.', 'You have a +1 bonus to attack and damage rolls made with this magic weapon. When you reduce a creature to 0 hit points with it, you gain {n} temporary hit points.'],
    'Very rare': ['You have a +2 bonus to attack and damage rolls made with this magic weapon. When you hit, it deals an extra {dice} {elem} damage.', 'You have a +3 bonus to attack and damage rolls made with this magic weapon.', 'You have a +2 bonus to attack and damage rolls made with this magic weapon. Once per dawn, you can cast {spell1} from it (save DC {dc}), and you have resistance to {elem} damage while holding it.', 'You have a +2 bonus to attack and damage rolls made with this magic weapon. On a critical hit, the target must succeed on a DC {dc} Constitution saving throw or be stunned until the end of your next turn.'],
    Legendary: ['You have a +3 bonus to attack and damage rolls made with this magic weapon. When you hit, it deals an extra {dice} {elem} damage, and once per dawn you can cast {spell1} from it (save DC {dc}).', 'You have a +3 bonus to attack and damage rolls made with this magic weapon. It is intelligent enough to warn you of danger: you cannot be surprised while holding it, and you add +5 to your initiative.', 'You have a +3 bonus to attack and damage rolls made with this magic weapon. Once per dawn, when you hit, you can call down {dice} {elem} damage on every creature of your choice within 15 feet of the target (DC {dc} saving throw for half).'],
  },
  armor: {
    Common: ['It never needs cleaning and does not clink or creak when you move.', 'Its color and trim change on command.', 'It keeps you comfortably warm in the cold and cool in the heat.', 'Rain beads off it, and it dries instantly.'],
    Uncommon: ['You have a +1 bonus to AC while wearing this armor.', 'You have a +1 bonus to AC while wearing this armor. It never imposes disadvantage on Dexterity (Stealth) checks.', 'You have a +1 bonus to AC while wearing this armor. You can breathe underwater and have a swimming speed equal to your walking speed.'],
    Rare: ['You have a +1 bonus to AC and resistance to {elem} damage while wearing this armor.', 'You have a +2 bonus to AC while wearing this armor.', 'You have a +1 bonus to AC while wearing this armor. Once per dawn, as a reaction when you are hit by an attack, you can gain a +3 bonus to AC against that attack.'],
    'Very rare': ['You have a +2 bonus to AC and resistance to {elem} damage while wearing this armor.', 'You have a +3 bonus to AC while wearing this armor.', 'You have a +2 bonus to AC while wearing this armor. Once per dawn, you can cast {spell1} from it (save DC {dc}) without using a spell slot.'],
    Legendary: ['You have a +3 bonus to AC and resistance to all damage from nonmagical attacks while wearing this armor.', 'You have a +3 bonus to AC, resistance to {elem} damage, and once per dawn you can drop to 1 hit point instead of 0.'],
  },
  ring: {
    Common: ['It keeps your hands warm in any weather.', 'It glows a soft color you choose, giving off dim light in a 5-foot radius.', 'It chimes softly when anyone within 30 feet of you means you harm.'],
    Uncommon: ['Once per dawn, when you fail a saving throw, you can reroll it and use the new result.', 'You have advantage on saving throws against being charmed.', 'You can cast {spell1} from it once per day (save DC {dc}).', 'You gain proficiency in {skill} while wearing it.', 'You have a swimming speed equal to your walking speed and can breathe underwater.'],
    Rare: ['You have resistance to {elem} damage.', 'You can cast {spell2} from it three times per day (save DC {dc}).', 'You have a +1 bonus to AC and to all saving throws.', 'Once per dawn, you can become invisible for up to 1 minute (it ends if you attack or cast a spell).'],
    'Very rare': ['You have a +2 bonus to AC and to all saving throws, and resistance to {elem} damage.', 'You can cast {spell2} from it three times per day and {spell3} once per day (save DC {dc}).', 'Once per dawn, when you would be reduced to 0 hit points, you drop to 1 hit point instead.'],
    Legendary: ['You can cast {spell3} at will and {spell4} once per day (save DC {dc}). You have resistance to {elem} damage.', 'It grants one wish-sized favor once per year: the DM decides exactly what it costs.'],
  },
  wand: {
    Common: ['It is a spellcasting focus that lets you cast {cantrip} at will.', 'It lets you cast {cantrip} at will, but the effect is always a little theatrical.'],
    Uncommon: ['It has 7 charges and regains 1d6 + 1 at dawn. You can expend charges to cast: {spell1} (1 charge), {spell1b} (1 charge). Save DC {dc}. If you use the last charge, roll a d20: on a 1, the wand crumbles to ash.'],
    Rare: ['It has 7 charges and regains 1d6 + 1 at dawn. You can expend charges to cast: {spell1} (1 charge), {spell2} (2 charges), {spell3} (3 charges). Save DC {dc}. If you use the last charge, roll a d20: on a 1, the wand crumbles to ash.'],
    'Very rare': ['It has 7 charges and regains 1d6 + 1 at dawn. You can expend charges to cast: {spell2} (2 charges), {spell3} (3 charges), {spell4} (4 charges), {spell5} (5 charges). Save DC {dc}. If you use the last charge, roll a d20: on a 1, the wand crumbles to ash.'],
    Legendary: ['It has 10 charges and regains 1d6 + 4 at dawn. You can expend charges to cast: {spell3} (3 charges), {spell4} (4 charges), {spell5} (5 charges), {spell6} (6 charges). Save DC {dc}.'],
  },
  staff: {
    Common: ['It is a sturdy walking staff that sheds bright light on command and never slips on ice.'],
    Uncommon: ['It is a spellcasting focus that gives +1 to spell attack rolls. It has 10 charges and regains 1d6 + 4 at dawn. You can expend charges to cast: {spell1} (1 charge), {spell1b} (1 charge). Save DC {dc}.'],
    Rare: ['It is a spellcasting focus that gives +2 to spell attack rolls. It has 10 charges and regains 1d6 + 4 at dawn. You can expend charges to cast: {spell1} (1 charge), {spell2} (2 charges), {spell3} (3 charges). Save DC {dc}.'],
    'Very rare': ['It is a spellcasting focus that gives +2 to spell attack rolls. It has 20 charges and regains 2d8 + 4 at dawn. You can expend charges to cast: {spell2} (2 charges), {spell3} (3 charges), {spell4} (4 charges), {spell5} (5 charges). Save DC {dc}.'],
    Legendary: ['It is a spellcasting focus that gives +3 to spell attack rolls. It has 25 charges and regains 4d6 + 2 at dawn. You can expend charges to cast: {spell3} (3 charges), {spell5} (5 charges), {spell6} (6 charges). Save DC {dc}. As a reaction, you can spend 2 charges to add +4 to a saving throw.'],
  },
  wondrous: {
    Common: ['It sheds dim light in a 10-foot radius on command.', 'It never gets wet, dirty or creased.', 'It hums softly when a hidden door is within 10 feet.', 'It warms to the touch in cold weather.', 'Its owner can whisper one sentence to a named creature within a mile, once per day.', 'It changes color on command.', 'It whistles once when poison is within 10 feet.'],
    Uncommon: ['Once per dawn, you can cast {spell1} from it (save DC {dc}).', 'Once per dawn, you can reroll one ability check after seeing the result.', 'You gain proficiency in {skill} while attuned to it.', 'You have advantage on saving throws against being frightened.', 'You have a climbing speed equal to your walking speed.', 'You ignore nonmagical difficult terrain.', 'You can breathe underwater and swim at your walking speed for 1 hour each day.', 'You halve any falling damage you take.'],
    Rare: ['Once per dawn, you can cast {spell2} from it (save DC {dc}).', 'You have resistance to {elem} damage.', 'You can cast {spell2} from it three times per day (save DC {dc}).', 'You have advantage on Dexterity saving throws and cannot be surprised.', 'Once per dawn, as a bonus action, you can teleport up to 30 feet to a space you can see.', 'You have a flying speed of 30 feet for up to 10 minutes per day.'],
    'Very rare': ['Once per dawn, you can cast {spell3} from it (save DC {dc}).', 'You have resistance to {elem} damage and a +1 bonus to saving throws.', 'Once per dawn, you can reroll any one d20 roll and choose either result.', 'You have a flying speed of 60 feet for up to 1 hour per day.', 'You can cast {spell4} from it once per dawn (save DC {dc}).'],
    Legendary: ['You can cast {spell4} from it at will and {spell5} once per dawn (save DC {dc}).', 'Once per week, you can undo the last 6 seconds: the DM rewinds one round of your choosing.', 'You cannot be charmed, frightened or put to sleep, and you regain 1d6 hit points at the start of each turn.'],
  },
};
/* each kind of wearable adds a few effects that fit it, so a cloak behaves like a cloak */
const SIGNATURE = {
  cloak: { Uncommon: 'You have advantage on Dexterity (Stealth) checks made in dim light or darkness.', Rare: 'Once per dawn, you can vanish into the shadows: you become invisible until the end of your next turn.', 'Very rare': 'You have resistance to {elem} damage and advantage on Dexterity (Stealth) checks.' },
  boots: { Uncommon: 'Your walking speed increases by 10 feet and your jump distance doubles.', Rare: 'Once per dawn, as a bonus action, you can double your walking speed for 1 minute.', 'Very rare': 'You can walk on water and across vertical surfaces for up to 1 hour per day.' },
  gloves: { Uncommon: 'You have advantage on Strength (Athletics) checks to grapple and on checks to climb.', Rare: 'Missiles and thrown weapons aimed at you are caught: once per dawn, as a reaction, you can reduce ranged weapon damage by 1d10 + {n}.', 'Very rare': 'Once per dawn, you can cast {spell2} from them (save DC {dc}), and you cannot be disarmed.' },
  amulet: { Uncommon: 'You have advantage on saving throws against being poisoned.', Rare: 'Once per dawn, you can cast {spell1} from it at 3rd level (save DC {dc}).', 'Very rare': 'You have resistance to necrotic damage, and your hit point maximum cannot be reduced.' },
  helm: { Uncommon: 'You have advantage on Wisdom (Perception) checks that rely on sight.', Rare: 'You cannot be charmed, and you have darkvision out to 60 feet.', 'Very rare': 'You can cast {spell3} from it once per dawn (save DC {dc}) and you have truesight out to 30 feet.' },
  belt: { Uncommon: 'Your Strength score is 17 while you wear it (no effect if it is already 17 or higher).', Rare: 'Your Strength score is 21 while you wear it.', 'Very rare': 'Your Constitution score is 21 while you wear it, and you have advantage on saves against poison.' },
  lantern: { Uncommon: 'It reveals invisible creatures within 30 feet as faint outlines in its light.', Rare: 'It reveals illusions for what they are within 30 feet, and burns without fuel.', 'Very rare': 'Undead and fiends in its light have disadvantage on attack rolls against you.' },
  satchel: { Uncommon: 'Its inside is far larger than its outside: it holds up to 500 pounds in 64 cubic feet, and weighs 15 pounds regardless.', Rare: 'Anything you name can be called from the satchel as a bonus action, if it is inside.', 'Very rare': 'It is a portal to a small pocket space with a bed, a fire and a locked door only you can open.' },
  goblet: { Uncommon: 'Any liquid poured in is purified of ordinary poison, and any wine tastes excellent.', Rare: 'Once per dawn, water poured in becomes a potion of healing (2d4 + 2).', 'Very rare': 'Once per dawn, whatever is poured in becomes a draught of truth: a creature that drinks it must answer one question honestly (DC {dc} Charisma save).' },
  mirror: { Uncommon: 'It shows the reflection of anything you name that is within 1 mile, once per day.', Rare: 'It reveals a disguise or shapechanger when you look at them in it.', 'Very rare': 'Once per dawn, you can step through it to any other mirror you have touched.' },
  key: { Uncommon: 'It opens any ordinary lock it is pressed against.', Rare: 'It opens any lock not protected by a spell of 3rd level or higher, and silences the lock as it turns.', 'Very rare': 'It opens any door, and will show you where the door leads before you open it.' },
  horn: { Uncommon: 'Once per dawn, a blast can be heard up to 3 miles away and carries a message of up to 6 words in your voice.', Rare: 'Once per dawn, a blast deals {dice} thunder damage to creatures in a 30-foot cone (DC {dc} Constitution save for half).', 'Very rare': 'Once per dawn, a blast frightens all enemies within 60 feet for 1 minute (DC {dc} Wisdom save).' },
  compass: { Uncommon: 'It always points to the nearest settlement of 100 or more people.', Rare: 'It points to any creature or object you have held in your mind for an hour.', 'Very rare': 'You can never be lost, and travel time across any terrain is reduced by a quarter.' },
};

/* ---------- catches, curses, history, hooks ---------- */
const CATCHES = ['Attunement requires a drop of the wearer\'s blood each dawn.', 'It whispers in a dead language while its owner sleeps.', 'It loses its power if used against the innocent.', 'The previous owner\'s ghost occasionally comments.', 'It glows when a certain kind of creature is near, whether wanted or not.', 'It hates being left behind and finds its way back, usually at an awkward moment.', 'It works only if the owner has told no lie that day.', 'It hums off-key whenever its owner is nervous.', 'It cannot be used while its owner is angry.', 'It grows cold when its owner is lying.', 'The first time each day it is used, it demands a word of thanks.', 'It leaves a faint scent of lavender that lingers for hours.'];
const CURSES = [
  { t: 'It is cursed: once attuned, you cannot willingly part with it, and you are loath to let others near it. Remove curse or similar magic ends the attunement.', sev: 'mild' },
  { t: 'It is cursed: while attuned, you have disadvantage on Charisma checks, and animals refuse to approach you.', sev: 'mild' },
  { t: 'It is cursed: each dawn it drinks a memory, and you forget one small fact of the DM\'s choosing.', sev: 'mild' },
  { t: 'It is cursed: while attuned, you are vulnerable to one damage type of the DM\'s choosing, which you learn when it first hurts you.', sev: 'serious' },
  { t: 'It is cursed: once per day the DM can have it urge you to use it against an ally; resist with a DC 15 Wisdom saving throw.', sev: 'serious' },
  { t: 'It is cursed: whenever you roll a 1 on a d20 while attuned, it grows heavier, and you gain one level of exhaustion that cannot be removed until you part with it.', sev: 'serious' },
  { t: 'It is cursed: it is secretly a mimic of the true item, and bites its owner for 2d6 piercing damage the first time it is used in a fight.', sev: 'serious' },
];
const HISTORY = ['Forged for a queen who vanished.', 'Stolen three times, and always returned to the same shop.', 'Last seen on a hero who died laughing.', 'Made as a wedding gift between rival houses.', 'Pulled from the wreck of a ship that never sank.', 'Said to be cursed, yet every owner prospered.', 'Carried by a regiment that no longer exists, and now owned by its only survivor\'s grandchild.', 'Won in a game of dice, then lost in the next one.', 'Made by an apprentice who never signed it, out of spite.', 'Buried with a king, then dug up by a farmer.', 'Passed through six owners in as many years, none of whom will say why they sold it.', 'Once part of a matched set. The other pieces are still out there.', 'Salvaged from a library fire, where it was the only thing that would not burn.', 'Crafted to settle a debt between a dwarven clan and a river spirit.'];
const HOOKS = ['A noble house insists it was stolen from them, and has sent someone to retrieve it.', 'A rival collector will pay triple to see it destroyed.', 'It has a twin, and the twin\'s owner is looking for it.', 'The maker\'s guild wants to know how it was made.', 'A temple believes it is a holy relic and is willing to deal gently the first time.', 'It was reported lost with a caravan, and the insurer\'s agent is in town.', 'Its last owner left a note: "Do not sell it to anyone who asks."', 'A fence in the next city has been asking about it by name.'];

/* ---------- making a magic item ---------- */
const KINDS = { Weapon: 'weapon', Armor: 'armor', Ring: 'ring', Wand: 'wand', Staff: 'staff', 'Wondrous item': 'wondrous' };
const KIND_LABEL = { weapon: 'Weapon', armor: 'Armor', ring: 'Ring', wand: 'Wand', staff: 'Staff', wondrous: 'Wondrous item' };

function rollValue(rarity, consumable) {
  const [lo, hi] = VALUE[rarity];
  const r = Math.random();
  let gp = lo + (hi - lo) * r * r;
  if (consumable) gp /= 2;
  const step = gp < 1000 ? 5 : gp < 10000 ? 50 : 500;
  return Math.max(step, Math.round(gp / step) * step);
}
function ctxFor(rarity) {
  const lvl = { Common: [0, 0], Uncommon: [1, 1], Rare: [2, 3], 'Very rare': [3, 5], Legendary: [4, 6] }[rarity];
  const spell = n => spellAt(Math.min(6, n), Math.min(6, n));
  return {
    dc: DC[rarity], elem: pick(ELEMS), dice: XDICE[rarity] || '1d4', skill: pick(SKILLS), n: range(4, 12) + (BONUS[rarity] || 0) * 3,
    cantrip: pick(SP[0]),
    spell1: spellAt(1, Math.max(1, lvl[1] >= 2 ? 1 : 1)), spell1b: (() => { let s; do { s = pick(SP[1]); } while (false); return s; })(),
    spell2: spell(2), spell3: spell(3), spell4: spell(4), spell5: spell(5), spell6: spell(6),
  };
}
function distinctSpells(c) { if (c.spell1b === c.spell1) c.spell1b = SP[1][(SP[1].indexOf(c.spell1) + 3) % SP[1].length]; return c; }
const fill = (s, c) => s.replace(/\{(\w+)\}/g, (m, k) => (c[k] !== undefined ? c[k] : m));

/* single-field rollers, so a card can reroll one line of an item without changing the rest */
export function rollEffect(kind, base, rarity) {
  const ctx = distinctSpells(ctxFor(rarity));
  const text = (kind === 'wondrous' && SIGNATURE[base] && SIGNATURE[base][rarity] && chance(0.65)) ? SIGNATURE[base][rarity] : pick(FX[kind][rarity] || FX[kind].Uncommon);
  return fill(text, ctx);
}
export function rollCatch(rarity, curse) {
  const cursed = curse === 'Always' || (curse === 'Sometimes' && rarity !== 'Common' && chance(1 / 6));
  return cursed ? pick(CURSES).t : pick(CATCHES);
}
export const rollHistory = () => pick(HISTORY);
export const rollHook = () => pick(HOOKS);
export function valueText(rarity) {
  const [lo, hi] = VALUE[rarity];
  return 'About ' + fmtGp(rollValue(rarity, false)) + ' (items of this rarity usually sell for ' + fmt(lo) + ' to ' + fmt(hi) + ' gp)';
}
export const rollAttune = rarity => (rarity === 'Common' ? false : chance({ Uncommon: 0.35, Rare: 0.7, 'Very rare': 0.85, Legendary: 0.95 }[rarity]));
export function rollKind(kind) { return kind === 'Any' || !KINDS[kind] ? weighted([['weapon', 22], ['armor', 14], ['ring', 12], ['wand', 8], ['staff', 5], ['wondrous', 39]]) : KINDS[kind]; }
export function rollBase(k) { return k === 'weapon' ? pick(WEAPONS) : k === 'armor' ? pick(ARMORS) : k === 'wondrous' ? pick(WONDROUS) : ''; }

export function makeMagicItem({ rarity = 'Uncommon', kind = 'Any', curse = 'Sometimes' } = {}) {
  const k = kind === 'Any' || !KINDS[kind] ? weighted([['weapon', 22], ['armor', 14], ['ring', 12], ['wand', 8], ['staff', 5], ['wondrous', 39]]) : KINDS[kind];
  let base = '';
  if (k === 'weapon') base = pick(WEAPONS);
  else if (k === 'armor') base = pick(ARMORS);
  else if (k === 'wondrous') base = pick(WONDROUS);
  const attune = rarity === 'Common' ? false : chance({ Uncommon: 0.35, Rare: 0.7, 'Very rare': 0.85, Legendary: 0.95 }[rarity]);
  const ctx = distinctSpells(ctxFor(rarity));
  let pool = FX[k][rarity] || FX[k].Uncommon;
  let text = pick(pool);
  if (k === 'wondrous' && SIGNATURE[base] && SIGNATURE[base][rarity] && chance(0.65)) text = SIGNATURE[base][rarity];
  const effect = fill(text, ctx);
  const cursed = curse === 'Always' || (curse === 'Sometimes' && rarity !== 'Common' && chance(1 / 6));
  const curseEntry = cursed ? pick(CURSES) : null;
  return {
    kind: k, base, rarity, attune: attune || cursed, effect,
    cursed, curse: curseEntry ? curseEntry.t : '',
    quirk: pick(CATCHES), history: pick(HISTORY), hook: pick(HOOKS),
    value: rollValue(rarity, false),
  };
}
export function typeLine(it) {
  return KIND_LABEL[it.kind] + (it.base ? ' (' + it.base + ')' : '') + ', ' + it.rarity.toLowerCase() + (it.attune ? ' (requires attunement)' : '');
}
const TYPE_RE = /^(Weapon|Armor|Ring|Wand|Staff|Wondrous item)(?: \(([^)]+)\))?, ([a-z ]+?)( \(requires attunement\))?$/;
export function parseType(s) {
  const m = TYPE_RE.exec(String(s));
  if (!m) return { kind: 'wondrous', base: 'cloak', rarity: 'Uncommon', attune: false };
  return { kind: KINDS[m[1]], base: m[2] || '', rarity: cap(m[3]), attune: !!m[4] };
}
export function itemName(kind, base, rarity) {
  const b = base || kind;
  if (kind === 'weapon' && chance(0.45)) return pick(BLADE_A) + pick(BLADE_B);
  const r = Math.random();
  if (r < 0.55) return cap(b) + ' of ' + pick(CONCEPTS);
  if (r < 0.8) return 'The ' + pick(NAME_ADJ) + ' ' + cap(b);
  return pick(OWNERS) + '\'s ' + cap(b);
}
export function itemForm(kind, base) {
  const noun = base || { ring: 'ring', wand: 'wand', staff: 'staff' }[kind] || 'trinket';
  return cap(pick(MATERIALS)) + ' ' + noun + ', ' + pick(DETAILS);
}

/* ---------- potions and scrolls ---------- */
const P = [
  ['Healing', 'Common', 'Healing', 'You regain 2d4 + 2 hit points.'],
  ['Greater healing', 'Uncommon', 'Healing', 'You regain 4d4 + 4 hit points.'],
  ['Superior healing', 'Rare', 'Healing', 'You regain 8d4 + 8 hit points.'],
  ['Supreme healing', 'Very rare', 'Healing', 'You regain 10d4 + 20 hit points.'],
  ['Climbing', 'Common', 'Utility', 'For 1 hour you have a climbing speed equal to your walking speed, and advantage on Strength (Athletics) checks to climb.'],
  ['Night sight', 'Common', 'Utility', 'For 1 hour you have darkvision out to 60 feet.'],
  ['Beast speech', 'Common', 'Utility', 'For 10 minutes you can speak with animals, and they are friendlier toward you.'],
  ['Soft footing', 'Common', 'Utility', 'For 1 hour you have advantage on Dexterity (Stealth) checks, and your footsteps make no sound.'],
  ['Clear thinking', 'Common', 'Utility', 'You have advantage on the next Intelligence check you make in the next hour, then roll a d4: on a 1 you forget the last hour.'],
  ['Water breathing', 'Uncommon', 'Utility', 'For 1 hour you can breathe underwater.'],
  ['Resistance', 'Uncommon', 'Utility', 'For 1 hour you have resistance to {elem} damage.'],
  ['Heroism', 'Uncommon', 'Combat', 'For 1 hour you are immune to being frightened and gain 10 temporary hit points at the start of each of your turns.'],
  ['Swiftness', 'Uncommon', 'Combat', 'For 1 minute your walking speed increases by 20 feet and you can take the Dash action as a bonus action.'],
  ['Fire breath', 'Uncommon', 'Combat', 'For 1 hour, as a bonus action, you can exhale fire in a 15-foot cone (DC 13 Dexterity save, 4d6 fire damage on a fail, half on a success). You can do so up to 3 times.'],
  ['Mind reading', 'Uncommon', 'Utility', 'For 10 minutes you can cast detect thoughts at will (DC 13 to resist).'],
  ['Growth', 'Uncommon', 'Combat', 'For 1 minute you grow one size larger: advantage on Strength checks and saves, and your weapon attacks deal an extra 1d4 damage.'],
  ['Invisibility', 'Rare', 'Utility', 'For 1 hour you are invisible. It ends early if you attack or cast a spell.'],
  ['Flying', 'Rare', 'Utility', 'For 1 hour you have a flying speed of 60 feet.'],
  ['Speed', 'Rare', 'Combat', 'For 1 minute you are hasted, as the haste spell. When it ends, you cannot move or act until after your next turn.'],
  ['Hill giant strength', 'Rare', 'Combat', 'For 1 hour your Strength score is 21.'],
  ['Mind shielding', 'Rare', 'Utility', 'For 8 hours, creatures cannot read your thoughts, learn if you lie, or magically charm you.'],
  ['Vitality', 'Rare', 'Healing', 'For 24 hours you are cured of poison and disease, and any healing you receive is maximized.'],
  ['Storm giant strength', 'Very rare', 'Combat', 'For 1 hour your Strength score is 29.'],
  ['Longevity', 'Very rare', 'Utility', 'Your physical age is reduced by 1d6 + 6 years. The effect repeats each time it is taken, but 1 in 6 times you age 1d6 years instead.'],
  ['Invulnerability', 'Very rare', 'Combat', 'For 1 minute you have resistance to all damage.'],
  ['Clairvoyance', 'Very rare', 'Utility', 'For 10 minutes you can cast clairvoyance (DC 17), seeing through a spot you have visited.'],
];
const POTION_VESSEL = ['Potion', 'Potion', 'Potion', 'Elixir', 'Draught', 'Philter', 'Tonic'];
const POTION_COLOR = ['a cloudy violet', 'a bright emerald', 'an oily black', 'a pale, pearly', 'a deep amber', 'a fizzing silver', 'a watery blue', 'a thick crimson', 'a rich, honeyed gold', 'a cold, clear'];
const POTION_DETAIL = ['with floating gold flecks', 'that sparkles in lamplight', 'that swirls on its own', 'that smells of rain', 'with a faint glow', 'that steams slightly', 'separated into two layers', 'that is oddly warm to the touch', 'with a single bubble that never rises', 'that clouds when someone lies nearby'];
const POTION_TASTE = ['sweet as honey', 'bitter like burnt bark', 'like cold iron', 'like copper coins', 'of mint and smoke', 'salty, like seawater', 'oddly like fresh bread', 'utterly flavorless', 'like lemon and woodsmoke', 'like a thunderstorm'];
const POTION_SIDE = ['You hiccup bubbles for an hour.', 'Everything smells like cinnamon for a day.', 'A sudden craving for raw fish.', 'You glow faintly for a minute.', 'You hear a distant song only you can hear for an hour.', 'Mild euphoria: DC 10 Wisdom save to resist doing something silly.', 'Your voice drops an octave until dawn.', 'Your shadow lags half a second behind you until dawn.', 'You cannot stop humming for an hour.', 'Your hair stands on end for the next hour.'];
const BREWERS = ['Mixed by a hedge witch who sells only to people she likes.', 'A guild brewer\'s stamp is on the cork, slightly smudged.', 'The label is in a cramped hand and mentions an apothecary who closed years ago.', 'No label at all: it was bought from a traveling peddler.', 'Hand-lettered "FOR EMERGENCIES" with several crossings-out.', 'The wax seal bears a temple\'s mark.', 'It was found in a dead alchemist\'s coat, still sealed.'];

export function makePotion({ rarity = 'Common', kind = 'Any' } = {}) {
  let pool = P.filter(p => p[1] === rarity && (kind === 'Any' || p[2] === kind));
  if (!pool.length) pool = P.filter(p => p[1] === rarity);
  if (!pool.length) pool = P.filter(p => p[1] === 'Common');
  const [name, , type, text] = pick(pool);
  const vessel = type === 'Healing' ? 'Potion' : pick(POTION_VESSEL);
  const ctx = { elem: pick(ELEMS) };
  return { name: vessel + ' of ' + name.toLowerCase() + (name.includes('{') ? '' : ''), rarity, type, effect: fill(text, ctx), value: rollValue(rarity, true) };
}
export function potionNameFor(o) { return makePotion(o).name; }
export function potionEffect(name, rarity) {
  const m = /^\w+ of (.+)$/.exec(String(name));
  const key = m ? m[1].toLowerCase() : '';
  const e = P.find(p => p[0].toLowerCase() === key) || P.find(p => p[1] === rarity) || P[0];
  return fill(e[3], { elem: pick(ELEMS) });
}
export const potionValue = rarity => fmtGp(rollValue(rarity, true));
export const potionDC = rarity => DC[rarity] || 13;
const SCROLL = { 0: ['cantrip', 30], 1: ['1st-level', 75], 2: ['2nd-level', 150], 3: ['3rd-level', 300], 4: ['4th-level', 2500], 5: ['5th-level', 5000], 6: ['6th-level', 10000] };
export function makeScroll(maxLevel) {
  const level = Math.min(range(0, maxLevel), 6);
  const [label, gp] = SCROLL[level];
  return { name: 'Spell scroll (' + label + '): ' + pick(SP[level]), level, value: Math.round(gp * (0.8 + Math.random() * 0.5) / 5) * 5 || gp };
}

/* ---------- treasure ---------- */
const ART = [
  ['a silver ewer', 'a carved bone statuette', 'a small gold bracelet', 'a cloth-of-gold vestment', 'a silk tapestry fragment, finely woven', 'a brass astrolabe, beautifully engraved', 'an ivory-handled letter opener', 'a painted miniature in a silver frame'],
  ['a gold music box', 'a jeweled gold ring', 'a carved ivory statuette', 'a silver chalice set with moonstones', 'a platinum-inlaid hand mirror', 'a pair of engraved gold candlesticks', 'a gold-leafed prayer book', 'a feathered cloak of an extinct bird'],
  ['a gold crown set with gems', 'a jeweled platinum necklace', 'a gold dragon statuette with ruby eyes', 'a masterwork painting in a gilded frame', 'a jeweled gold scepter', 'an enameled gold chalice', 'a set of ivory dice with gold pips', 'a suit of ceremonial armor, gold-trimmed'],
];
const ART_VALUE = [[25, 25], [250, 250], [750, 2500]];
export function artObject(ti) {
  const [lo, hi] = ART_VALUE[ti];
  const gp = lo === hi ? lo : Math.round((lo + Math.random() * (hi - lo)) / 25) * 25;
  return cap(pick(ART[ti])) + ' (about ' + fmt(gp) + ' gp)';
}
export function lootMagic(ti) {
  const out = [];
  const add = rarity => {
    if (chance(0.3)) { const p = makePotion({ rarity: rarity === 'Common' || rarity === 'Uncommon' ? rarity : 'Rare' }); out.push(p.name + ' (' + p.rarity.toLowerCase() + ') — ' + fmtGp(p.value)); return; }
    if (chance(0.2)) { const sc = makeScroll(Math.min(6, ti * 2 + 1)); out.push(sc.name + ' — ' + fmtGp(sc.value)); return; }
    const it = makeMagicItem({ rarity, curse: 'Sometimes' });
    out.push(itemName(it.kind, it.base, rarity) + ' — ' + typeLine(it).replace(/^./, c => c.toUpperCase()) + ' — ' + fmtGp(it.value));
  };
  if (ti === 0) { if (chance(0.25)) add('Common'); }
  else if (ti === 1) { add(weighted([['Common', 25], ['Uncommon', 60], ['Rare', 15]])); if (chance(0.25)) add('Uncommon'); }
  else { add(weighted([['Rare', 55], ['Very rare', 40], ['Legendary', 5]])); if (chance(0.5)) add('Uncommon'); if (chance(0.25)) add('Rare'); }
  return out;
}
export const TRINKETS_ALL = ['a tarnished silver button engraved with a tiny crown', 'a glass eye that seems to follow the light', 'a deck of cards missing the queen of hearts', 'a small jar of sand that never settles', 'a bird\'s skull wrapped in red thread', 'a child\'s wooden sword, well loved', 'a ticket stub to a performance that never happened', 'a lock of hair tied with a faded ribbon', 'a coin from a nation that no longer exists', 'a brass compass that points to the nearest tavern', 'a pressed flower between two tiny panes of glass', 'a spoon bent in a very deliberate way', 'a map of a city drawn on a handkerchief', 'a whistle that makes no sound a human can hear', 'a half-finished letter addressed to "Dearest"', 'a ring of keys, none fitting anything the owner knows', 'a vial of seawater that stays cold', 'a tiny portrait of a stranger with your eyes', 'a snail shell that hums when held to the ear', 'a wax seal stamped with an unknown crest', 'a feather that drifts down no matter how hard it is thrown', 'a charred scrap of a wedding invitation', 'a smooth black stone that is always warm', 'a mismatched pair of dice',
  'a pocket-sized book of recipes, each ending mid-ingredient', 'a thimble engraved with someone else\'s initials', 'a clay figurine of a god no priest can name', 'a candle stub that has never burned down', 'a bent iron nail wrapped in a prayer', 'a miniature chess piece, a queen, carved from a tooth', 'a rusted locket containing a pressed four-leaf clover', 'a small leather purse sewn shut, with something rattling inside', 'a boot buckle in the shape of a fox', 'a tarnished harmonica missing its middle notes', 'a sprig of dried lavender tied with wire', 'a stone with a hole, strung on a bootlace', 'a tin soldier missing an arm', 'a cracked monocle with a green tint', 'a slip of paper reading "Third door on the left, then ask for Marta"', 'a button-sized mirror that shows a different room', 'a small brass bell with no clapper', 'a hand-drawn map of a tavern with an X in the cellar', 'a broken wristwatch from a land that has no clocks', 'a wolf\'s tooth on a leather cord', 'a folded paper boat that never seems to get wet', 'a tiny wooden door, hinged, with a keyhole', 'a tin of mint lozenges that taste faintly of blood', 'a rolled-up tavern tab for forty gold, signed by a stranger', 'a rabbit\'s foot dyed purple', 'a signet ring without its stone', 'a mourning brooch with someone\'s hair braided into it', 'a pair of spectacles with no glass in them', 'a feather quill that writes in a different color each time', 'a silver spoon with a family crest scratched out', 'a bag of fourteen different keys and one very small lock', 'a pewter flask engraved with a toast in Dwarvish', 'a lump of amber with a perfectly preserved beetle', 'a sewing needle threaded with a hair of unusual color', 'a postcard of a lighthouse that does not exist', 'a hand-knit mitten, enormous'];
export const TRINKET_SECRETS = ['it is actually the key to a deposit box in a distant city', 'it glows faintly at the full moon', 'it was owned by someone who is now looking for it', 'it is worth far more than it seems (about 50 gp to the right buyer)', 'it is magical in a tiny way: once a day, it does one small, useless wonder', 'it carries a minor curse: a little bad luck on the first of each month', 'it belonged to a person the party has met', 'a name is scratched inside it that matches an NPC in the area', 'it is a clue to a treasure someone buried long ago', 'it is cursed to return to its maker, and always does, eventually', 'it can be used to identify someone as a member of a secret society', 'it is a fake of something famous, and a very good one'];

/* ---------- shops ---------- */
/* stock: "Item|price" separated by ;  a trailing * marks things sold in quantity */
const SHOP_DATA = {
  'General store': { nouns: ['Provisions', 'Goods', 'Emporium', 'Mercantile', 'Supply', 'Outfitters'], air: 'rope, lamp oil and sawdust', sells: 'rope, rations, torches, backpacks, tools and camping gear', buys: 'used adventuring gear, furs and spare rope', magic: 'none',
    stock: 'Backpack|2gp;Bedroll|1gp;Blanket, wool|5sp;Candles, 10|1cp*;Crowbar|2gp;Hammer|1gp;Hooded lantern|5gp;Oil, flask|1sp*;Rope, hempen, 50 ft|1gp;Rations, 1 day|5sp*;Sack|1cp;Shovel|2gp;Tinderbox|5sp;Torches, 10|1sp*;Waterskin|2sp;Whetstone|1cp;Iron spikes, 10|1gp*;Tent, two-person|2gp;Fishing tackle|1gp;Mess kit|2sp;Chalk, 10 sticks|1cp*;Grappling hook|2gp;Pouch|5sp;Steel mirror|5gp;Manacles|2gp;Iron pot|2gp;Block and tackle|1gp;Ball bearings, 1,000|1gp' },
  'Blacksmith': { nouns: ['Forge', 'Anvil', 'Smithy', 'Hammer & Tongs', 'Bellows'], air: 'hot iron, coal smoke and quenching oil', sells: 'tools, hardware and simple weapons', buys: 'scrap iron and broken blades', magic: 'none',
    stock: 'Handaxe|5gp;Dagger|2gp;Mace|5gp;Spear|1gp;Warhammer|15gp;Crowbar|2gp;Hammer, sledge|2gp;Pickaxe|2gp;Iron pot|2gp;Horseshoes, set of four|5sp;Nails, 100|1sp*;Hinges, pair|1sp;Chain, 10 ft|5gp;Lock, good|10gp;Padlock|5gp;Iron spikes, 10|1gp*;Cleaver|1gp;Sharpening service|2sp;Dented shield, repaired|3gp;Custom ironwork (per order)|10gp' },
  'Weaponsmith': { nouns: ['Arms', 'Blades', 'Armory', 'Steel', 'Edge'], air: 'oiled steel, leather and whetstone dust', sells: 'weapons of every kind', buys: 'used weapons at half price and anything with a maker\'s mark', magic: 'weapon',
    stock: 'Dagger|2gp;Handaxe|5gp;Javelin|5sp;Mace|5gp;Quarterstaff|2sp;Spear|1gp;Shortsword|10gp;Longsword|15gp;Rapier|25gp;Scimitar|25gp;Battleaxe|10gp;Warhammer|15gp;Greataxe|30gp;Greatsword|50gp;Glaive|20gp;Halberd|20gp;Morningstar|15gp;Trident|5gp;Whip|2gp;Flail|10gp;Maul|10gp;Lance|10gp' },
  'Armorer': { nouns: ['Plate & Mail', 'Harness', 'Shield & Helm', 'Armory', 'Buckle'], air: 'leather, chain oil and cold steel', sells: 'armor and shields, fitted to the customer', buys: 'used armor at half price and mail needing repair', magic: 'armor',
    stock: 'Padded armor|5gp;Leather armor|10gp;Studded leather|45gp;Hide armor|10gp;Chain shirt|50gp;Scale mail|50gp;Breastplate|400gp;Half plate|750gp;Ring mail|30gp;Chain mail|75gp;Splint armor|200gp;Plate armor|1500gp;Shield|10gp;Helm, iron|5gp;Gauntlets, pair|8gp;Fitting and adjustment|5gp;Repairs, per piece|2gp' },
  'Apothecary': { nouns: ['Remedies', 'Mortar & Pestle', 'Tinctures', 'Herbs', 'Dispensary'], air: 'dried herbs, camphor and something faintly sweet', sells: 'remedies, kits and healing herbs', buys: 'rare herbs and monster parts', magic: 'potion',
    stock: 'Potion of healing|50gp*;Healer\'s kit|5gp*;Antitoxin, vial|50gp*;Herbalism kit|5gp;Holy water, flask|25gp*;Perfume, vial|5gp;Soap|2cp*;Smelling salts|5sp*;Willow bark, dried|5sp*;Sleeping tea, 3 doses|1gp*;Salve for burns|2gp*;Wolfsbane bundle|1gp*;Honey and thyme cough syrup|3sp*;Bandages, 10|1sp*;Tonic for the nerves|3gp*;Basic poison, vial|100gp*' },
  'Alchemist': { nouns: ['Alembic', 'Cauldron', 'Philters', 'Distillery', 'Retort'], air: 'sulfur, vinegar and burnt sugar', sells: 'acids, fire, potions and reagents', buys: 'reagents, strange minerals and monster glands', magic: 'potion',
    stock: 'Acid, vial|25gp*;Alchemist\'s fire, flask|50gp*;Antitoxin, vial|50gp*;Oil, flask|1sp*;Holy water, flask|25gp*;Alchemist\'s supplies|50gp;Smoke stick (thick smoke, 20-ft radius for 1 minute)|10gp*;Flash powder pouch (DC 12 Constitution save or blinded 1 round)|15gp*;Glue, flask (holds a creature-sized object)|3gp*;Basic poison, vial|100gp*;Potion of healing|50gp*;Sulfur, pound|1gp;Quicksilver, flask|5gp;Saltpeter, pound|2gp' },
  'Arcane curios': { nouns: ['Curios', 'Oddities', 'Wonders', 'Cabinet', 'Sundries'], air: 'incense, old paper and a hint of ozone', sells: 'spell components, foci, scrolls and oddities', buys: 'spellbooks, scrolls and anything that hums', magic: 'scroll',
    stock: 'Component pouch|25gp;Crystal arcane focus|10gp;Orb arcane focus|20gp;Rod arcane focus|10gp;Wand arcane focus|10gp;Spellbook, blank|50gp;Ink, 1-ounce bottle|10gp;Parchment, 10 sheets|1gp*;Magnifying glass|100gp;Hourglass|25gp;Lens sold as "true-seeing" (it may not be)|15gp;Jar of "ghost-light"|30gp;Brass astrolabe|40gp;Pinch of powdered meteorite|20gp*;Bottled thunderclap, single use|25gp*;Quill that never needs ink|60gp' },
  'Magic emporium': { nouns: ['Enchantments', 'Wondrous Wares', 'Arcana', 'Marvels', 'Miracles'], air: 'sandalwood, hot metal and the smell just before lightning', sells: 'magic items, with the odd mundane curiosity', buys: 'magic items (they appraise honestly) and rare components', magic: 'any',
    stock: 'Component pouch|25gp;Crystal arcane focus|10gp;Spellbook, blank|50gp;Ink, 1-ounce bottle|10gp;Detect magic service (10 minutes)|10gp;Appraisal of an item\'s worth|5gp;Identify service (1 item)|100gp' },
  'Tailor': { nouns: ['Threads', 'Needle & Thread', 'Finery', 'Wardrobe', 'Seams'], air: 'wool, starch and hot pressing irons', sells: 'clothing, cloaks and costume', buys: 'good cloth and fine furs', magic: 'none',
    stock: 'Common clothes|5sp;Traveler\'s clothes|2gp;Fine clothes|15gp;Costume|5gp;Robes|1gp;Wool winter cloak|5gp;Oilcloth hooded cloak|3gp;Embroidered gloves|4gp;Disguise kit|25gp;Noble\'s outfit, made to order|60gp;Boots, sturdy|3gp;Cloak pin with a hidden compartment|12gp;Scarf in house colors|1gp;Mending, per garment|2sp;Hat, felted|8sp' },
  'Bookseller': { nouns: ['Folios', 'Pages', 'Tomes', 'Ink & Quill', 'Leaves'], air: 'old paper, leather and candle wax', sells: 'books, maps, paper and writing supplies', buys: 'books and maps, with a keen eye for rare ones', magic: 'scroll',
    stock: 'Regional almanac|5gp;Prayer book|25gp;Bestiary of local fauna|25gp;Illustrated coastal map|10gp;Three-volume romance|6gp;Blank journal|2gp;Treatise on poisons (under the counter)|40gp;Collection of folk songs|3gp;History of the town|18gp;Book of riddles|4gp;Ink, 1-ounce bottle|10gp;Ink pen|2cp;Paper, one sheet|2gp*;Parchment, one sheet|1sp*;Sealing wax|5sp;Map or scroll case|1gp' },
  'Stables': { nouns: ['Stables', 'Hoofs & Harness', 'Livery', 'Saddle & Stirrup'], air: 'hay, horse and warm leather', sells: 'mounts, tack and stabling', buys: 'healthy horses, and saddles in good repair', magic: 'none',
    stock: 'Riding horse|75gp;Pony|30gp;Mule|8gp;Draft horse|50gp;Warhorse|400gp;Camel|50gp;Donkey|8gp;Saddle, riding|10gp;Saddle, pack|5gp;Saddle, military|20gp;Saddlebags|4gp;Bit and bridle|2gp;Feed, per day|5cp*;Stabling, per day|5sp;Cart|15gp;Wagon|35gp;Carriage|100gp;Sled|20gp;Carrier pigeon|5gp' },
  'Jeweler': { nouns: ['Gems', 'Gilded Things', 'Brilliants', 'Facets', 'Settings'], air: 'metal polish and cold glass', sells: 'jewelry and cut gems', buys: 'gems, gold and silver by weight', magic: 'ring',
    stock: 'Silver ring|10gp;Gold ring|25gp;Signet ring, blank|20gp;Gold locket|25gp;Pearl earrings|40gp;Silver chain|15gp;Cut azurite|10gp;Cut moonstone|50gp;Cut garnet|100gp;Cut black pearl|500gp;Gem appraisal|5gp;Copper bracelet "against bad luck"|8gp;Ivory prayer beads|12gp;Brooch, house colors|15gp;Engraving, per piece|3gp' },
  'Leatherworker': { nouns: ['Hide & Seek', 'Tannery', 'Saddlery', 'Buckle & Strap', 'Leather Goods'], air: 'tanned leather, neatsfoot oil and beeswax', sells: 'leather armor, packs, belts and tack', buys: 'hides and furs', magic: 'armor',
    stock: 'Leather armor|10gp;Studded leather|45gp;Hide armor|10gp;Padded armor|5gp;Quiver|1gp;Pouch|5sp;Belt pouch, large|1gp;Waterskin|2sp;Backpack|2gp;Saddlebags|4gp;Boots, sturdy|3gp;Gloves, work|5sp;Scabbard|5sp;Whip|2gp;Bandolier|3gp;Repairs, per piece|1gp' },
  'Bowyer & fletcher': { nouns: ['Bow & Arrow', 'Fletching', 'Quiver', 'Straight Shaft', 'Longbow'], air: 'cut ash, bowstring wax and goose feathers', sells: 'bows, crossbows and ammunition', buys: 'good feathers and seasoned yew', magic: 'weapon',
    stock: 'Shortbow|25gp;Longbow|50gp;Light crossbow|25gp;Heavy crossbow|50gp;Hand crossbow|75gp;Arrows, 20|1gp*;Crossbow bolts, 20|1gp*;Sling bullets, 20|4cp*;Darts, 10|5cp*;Blowgun|10gp;Blowgun needles, 50|1gp*;Quiver|1gp;Bowstring, spare|1sp*;Sling|1sp' },
  'Cartographer': { nouns: ['Charts', 'Meridian', 'Compass Rose', 'Atlas', 'Longitude'], air: 'ink, vellum and sealing wax', sells: 'maps, charts and navigation tools', buys: 'maps, journals and surveying notes', magic: 'compass',
    stock: 'Local map|5gp;Regional map|25gp;Coastal chart|40gp;Dungeon sketch (rumored, unverified)|15gp;Cartographer\'s tools|15gp;Navigator\'s tools|25gp;Map or scroll case|1gp;Compass|30gp;Spyglass|1000gp;Ink, 1-ounce bottle|10gp;Parchment, one sheet|1sp*;Custom map, per square mile|2gp' },
  'Reliquary': { nouns: ['Reliquary', 'Candle & Cloth', 'Holy Stores', 'Vigil', 'Censer'], air: 'incense, beeswax and stone', sells: 'holy symbols, candles and blessed goods', buys: 'relics, holy water, and sacred texts', magic: 'potion',
    stock: 'Holy symbol, amulet|5gp;Holy symbol, emblem|5gp;Holy symbol, reliquary|5gp;Holy water, flask|25gp*;Candles, 10|1cp*;Incense, block|1gp*;Prayer book|25gp;Vestments|1gp;Blessed salt, pouch|5gp*;Censer|5gp;Healing, a day\'s care|5gp;Funerary service, simple|10gp' },
  'Provisions': { nouns: ['Larder', 'Bread & Board', 'Pantry', 'Hearth', 'Provender'], air: 'fresh bread, smoked meat and spice', sells: 'food, drink and trail rations', buys: 'game, honey and fresh produce', magic: 'none',
    stock: 'Rations, 1 day|5sp*;Bread, loaf|2cp*;Cheese, hard wedge|1sp*;Ale, gallon|2sp*;Wine, common, pitcher|2sp*;Wine, fine, bottle|10gp;Honey, jar|5sp*;Salt, pound|5cp*;Pepper, pound|2gp*;Cinnamon, pound|2gp*;Saffron, pound|15gp;Smoked ham, whole|2gp;Dried fruit, pound|2sp*;Sausage, string|3sp*' },
  'Fence': { nouns: ['Second Chances', 'Odds & Ends', 'Back Room', 'Lost & Found', 'Quiet Trade'], air: 'dust, tobacco and lamp oil', sells: 'no questions asked, mostly stolen or secondhand goods', buys: 'anything, at a third of its worth and no questions', magic: 'any',
    stock: 'Thieves\' tools|25gp;Disguise kit|25gp;Forgery kit|15gp;Poisoner\'s kit|50gp;Caltrops, 20|1gp*;Ball bearings, 1,000|1gp;Lock, good|10gp;Manacles|2gp;Crowbar|2gp;Dark hooded cloak|5gp;Unmarked coin purse|5sp;Forged writ of passage|40gp;Sealed letter, no return address|5gp;Silk rope, 50 ft|10gp;Hooded lantern|5gp' },
  'Pawnbroker': { nouns: ['Pawn', 'Second Hand', 'Three Brass Balls', 'Fair Loans', 'Keepsakes'], air: 'brass polish, dust and old perfume', sells: 'secondhand goods of every kind', buys: 'almost anything, with loans against it', magic: 'any',
    stock: 'Longsword, used|8gp;Chain shirt, used|25gp;Shield, dented|5gp;Signet ring, no crest|15gp;Silver locket (empty)|12gp;Traveler\'s clothes, worn|1gp;Backpack, patched|1gp;Spyglass, cracked lens|300gp;Music box, plays three notes|20gp;Wedding band, engraved|8gp;Holy symbol, someone else\'s|3gp;Shortbow, restrung|12gp;Pocket watch, runs slow|60gp' },
  'Tinker & clockmaker': { nouns: ['Cogs & Springs', 'Tick & Tock', 'Gearworks', 'The Brass Beetle', 'Fine Mechanisms'], air: 'brass filings, machine oil and a ticking too many to count', sells: 'locks, tools and clockwork', buys: 'broken clockwork, gears and fine tools', magic: 'wondrous',
    stock: 'Tinker\'s tools|50gp;Lock, good|10gp;Padlock|5gp;Hourglass|25gp;Bell|1gp;Alarm bell with trip wire|8gp;Clockwork toy|5gp;Music box|25gp;Pocket watch|60gp;Mechanical bird (sings on the hour)|40gp;Spyglass|1000gp;Magnifying glass|100gp;Hand crank winch|15gp;Repair, per item|3gp' },
  'Carpenter': { nouns: ['Joinery', 'Plane & Chisel', 'Timber', 'Sawdust', 'Woodwright'], air: 'sawdust, pine resin and linseed', sells: 'furniture, barrels, handles and repairs', buys: 'seasoned timber', magic: 'none',
    stock: 'Ladder, 10 ft|1sp;Barrel|2gp;Chest|5gp;Crate|1gp;Club|1sp;Quarterstaff|2sp;Wooden shield|3gp;Handcart|8gp;Pole, 10 ft|5cp;Torches, 10|1sp*;Wedges, 10|2sp*;Door, plain, hung|3gp;Wheel, cart|3gp;Repairs, per day|5sp;Custom coffin, plain|12gp' },
};
export const SHOP_TYPES = Object.keys(SHOP_DATA);
const SIZES = { Hamlet: { n: 4, magic: 0.08, mod: 1.15, rarity: 0 }, Village: { n: 5, magic: 0.3, mod: 1.05, rarity: 1 }, Town: { n: 7, magic: 0.6, mod: 1, rarity: 2 }, City: { n: 9, magic: 0.9, mod: 0.95, rarity: 3 } };
export const SHOP_SIZES = Object.keys(SIZES);
const PRICE = { Fair: 1, Steep: 1.3, Bargain: 0.8 };
export const SHOP_PRICES = Object.keys(PRICE);
const parseStock = s => s.split(';').map(x => { const [n, p] = x.split('|'); const cons = p.endsWith('*'); return { n, cp: cpOf(p.replace('*', '')), cons }; });

const SOUNDS = ['The door chimes with a string of small bells', 'The door sticks and then bangs open', 'A bell above the door gives a cracked little ring', 'The hinges squeal like a pig', 'Floorboards complain with every step', 'The door opens on a counter-weight that thumps'];
const SIGHTS = ['Shelves lean under their load, labeled in three different handwritings', 'Everything is spotless and arranged by size', 'A cat sleeps on the best-looking item in the window', 'Hand-painted signs advertise yesterday\'s sales as today\'s', 'A curtain hides a back room, and it is never quite still', 'A faded guild certificate hangs crooked above the counter', 'The window is crammed with things that should not be in a window', 'Lamps hang low, so everyone leans in to see the goods'];
const HOURS = ['Open from dawn until dusk, closed on temple days.', 'Open only in the afternoon; mornings are for deliveries.', 'Open late, until the third bell of night.', 'Open every day except the first of the month.', 'Open when the keeper is in, which is usually.', 'Open by appointment: knock three times.', 'Open at market hours, with a lunch hour that runs long.', 'Open from sunrise, and the keeper sleeps over the shop.'];
const PLACES = ['on the market square, next to the well', 'down a narrow alley behind the temple', 'in a converted barn at the edge of town', 'on the ground floor of a leaning three-story house', 'at the crossroads under a canvas awning', 'beside the river docks, a short walk from the ferry', 'in the shadow of the town walls', 'above a cellar that floods every spring', 'opposite the guardhouse, which is either very good or very bad for business', 'at the end of a row of closed shops'];
const MANNER = ['talks fast and rarely lets customers finish a sentence', 'is polite to a fault and quietly keeps a ledger of every slight', 'is gruff but fair, and never lies about quality', 'greets everyone like an old friend, including enemies', 'speaks in a hush, as if the goods might overhear', 'is endlessly curious about where customers have been', 'has an opinion about everything and shares most of them', 'treats every sale like a duel of wits', 'is nervous and checks the door constantly', 'is cheerful beyond reason and hums while counting change', 'is a retired adventurer and tells the story behind the scar', 'is formal and addresses everyone as "honored guest"'];
const QUIRKS = ['haggles by telling elaborate stories', 'accepts only exact change', 'closes without warning when the bells chime', 'has a talking parrot that insults customers', 'keeps a loaded crossbow under the counter', 'is writing a novel and reads from it between sales', 'refuses to sell to anyone wearing red', 'gives a free trinket for the customer\'s best joke', 'weighs every coin on a tiny brass scale', 'will not sell anything on the first of the month', 'wraps every purchase in old newspapers and string', 'keeps a running tally on the wall of what each customer owes'];
const WANTS = ['pays well for monster parts: pelts, teeth, owlbear feathers', 'is three months behind on rent to the merchants\' guild and getting desperate', 'needs someone to deliver a package to the next town, no questions asked', 'is looking for a missing sibling who was last seen guarding a caravan', 'is being pressured to sell the shop to a rival, and is refusing', 'wants proof that a competitor sells counterfeit goods', 'needs a rare ingredient fetched from a dangerous place, and will pay in stock', 'wants an escort for a shipment worth more than the shop', 'is trying to hide that stock has been going missing', 'wants rid of an item left as a pledge that has started humming at night', 'is hoping an adventuring party will clear rats from the cellar, quietly', 'would trade the best item in the shop for the right piece of gossip'];
const SECRETS = ['fronts for the thieves\' guild; a fence works the back room', 'sells a few counterfeits mixed in with the genuine goods', 'is a retired adventurer who still keeps a dragon-tooth dagger under the counter', 'is an informant for the town watch', 'owes a dangerous debt to a smuggler, who visits at night', 'keeps the real stock in a hidden cellar, and the front is a decoy', 'is hiding a runaway noble in the apartment upstairs', 'quietly supplies a resistance group with goods and information', 'has a cursed item for sale that the keeper does not know is cursed', 'is under a geas not to sell to a particular family', 'is a doppelganger who took over the real keeper\'s life last winter', 'is slowly poisoning a rival shopkeeper, one sale at a time'];
const REPUTATION = ['known as the fairest dealer in town', 'locals say prices are steep but the goods are worth it', 'has a reputation for the odd faulty item, and for replacing it with a smile', 'trusted by the watch, and by the people the watch watches', 'new in town, and still earning trust', 'the oldest shop in town, and proud of it', 'rumored to cheat strangers, though no one has proved it', 'loved by children and disliked by merchants'];
const HAGGLE = ['A DC {dc} Persuasion check takes 10% off the price; failing by 5 or more ends the haggling for the day.', 'Does not haggle over coin, but trades favors: a DC {dc} Insight check shows what the keeper really wants.', 'Accepts trade goods, such as monster parts, at fair rates, and drops prices for a DC {dc} Persuasion check.', 'Enjoys a good story: a DC {dc} Performance check earns 15% off.', 'Stubborn: prices are firm unless a customer beats the keeper at a game of dice (DC {dc} Wisdom (Insight) to read the tells).', 'Gives a "friends and family" discount of 10% to anyone who impresses the keeper (DC {dc} Charisma check).'];
const RARE_FINDS = ['A cloak that always stays dry, kept behind the counter', 'A dented helm said to have belonged to a famous general', 'A small music box that never needs winding', 'A map with half the labels scratched out', 'A ring engraved with a name the keeper won\'t discuss', 'A staff carved in a language no one in town can read', 'A crate marked "DO NOT OPEN", left as payment for a debt', 'A bottle of ink that writes only in moonlight', 'A mask that fits no face it is tried on', 'A bell that rings when someone nearby lies', 'A single coin from a kingdom that never existed', 'A suit of armor too small for an adult and too finely made for a child'];

export function shopName(type) {
  const d = SHOP_DATA[type];
  const r = Math.random();
  if (r < 0.35) return pick(OWNERS) + '\'s ' + pick(d.nouns);
  if (r < 0.65) return 'The ' + pick(NAME_ADJ) + ' ' + pick(d.nouns);
  if (r < 0.85) return pick(d.nouns) + ' & ' + pick(['Sons', 'Daughters', 'Co.', 'Company', 'Partners']);
  return pick(OWNERS) + ' ' + pick(['the Elder', 'the Younger', 'of the Lane', 'Fairweather']) + ': ' + pick(d.nouns);
}
function wareLine(it) { return it.name + (it.type ? ' (' + it.type + ')' : '') + ' — ' + fmtGp(it.value); }
function magicWares(type, size) {
  const d = SHOP_DATA[type], sz = SIZES[size];
  const lines = [];
  const emporium = type === 'Magic emporium';
  let count = emporium ? [range(1, 2), range(2, 3), range(3, 5), range(5, 8)][sz.rarity] : (chance(sz.magic) ? (sz.rarity >= 2 && chance(0.4) ? 2 : 1) : 0);
  if (d.magic === 'none' && !emporium) count = chance(sz.magic * 0.1) ? 1 : 0;
  const maxRar = Math.min(emporium ? sz.rarity + 1 : sz.rarity, 4);
  const rarityFor = () => weighted(RARITIES.slice(0, maxRar + 1).map((r, i) => [r, [50, 28, 14, 7, 1][i]]));
  for (let i = 0; i < count; i++) {
    const rarity = rarityFor();
    const how = d.magic === 'none' ? 'any' : d.magic;
    if (how === 'potion' || (how === 'any' && chance(0.25))) {
      const pr = ['Common', 'Uncommon', 'Rare', 'Very rare'].includes(rarity) ? rarity : 'Very rare';
      const p = makePotion({ rarity: pr });
      lines.push(p.name + ' (' + pr.toLowerCase() + ') — ' + fmtGp(p.value));
    } else if (how === 'scroll' || (how === 'any' && chance(0.2))) {
      const s = makeScroll(Math.min(6, sz.rarity + 2));
      lines.push(s.name + ' — ' + fmtGp(s.value));
    } else {
      const kind = { weapon: 'Weapon', armor: 'Armor', ring: 'Ring', compass: 'Wondrous item', wondrous: 'Wondrous item' }[how] || 'Any';
      const it = makeMagicItem({ rarity, kind, curse: 'Never' });
      const nm = itemName(it.kind, it.base, rarity);
      lines.push(nm + ' — ' + typeLine(it).toLowerCase().replace(/^./, c => c.toUpperCase()) + ' — ' + fmtGp(it.value));
    }
  }
  return lines;
}
export function shopStock(type, size, prices) {
  const d = SHOP_DATA[type], sz = SIZES[size];
  const items = parseStock(d.stock);
  const n = Math.min(items.length, sz.n + range(0, 2));
  const mod = (PRICE[prices] || 1) * (size === 'Hamlet' ? 1.1 : 1);
  return pickN(items, n).map(it => {
    const cp = Math.max(1, Math.round(it.cp * mod));
    let q = '';
    if (it.cons) q = ' (' + range(2, [4, 6, 10, 16][sz.rarity]) + ' in stock)';
    else if (cp >= 20000) q = ' (just the one)';
    else if (cp >= 2000) q = chance(0.6) ? ' (' + range(1, 2) + ' in stock)' : ' (to order, ' + range(3, 10) + ' days)';
    else if (size === 'Hamlet' && chance(0.3)) q = ' (to order, ' + range(3, 8) + ' days)';
    return it.n + ' — ' + fmtCp(cp) + q;
  });
}
export function shopBuys(type) { return SHOP_DATA[type].buys; }
export function shopAir(type) { return SHOP_DATA[type].air; }
export function shopSells(type) { return SHOP_DATA[type].sells; }
export function shopMagic(type, size) { return magicWares(type, size); }
export { SHOP_DATA, SOUNDS, SIGHTS, HOURS, PLACES, MANNER, QUIRKS, WANTS, SECRETS, REPUTATION, HAGGLE, RARE_FINDS, POTION_COLOR, POTION_DETAIL, POTION_TASTE, POTION_SIDE, BREWERS, DC };
export const hdr = { fmtGp, cap, pick, chance, range, pickN, weighted, rnd, fmt };
export { fmtGp };
