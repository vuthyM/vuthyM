/* Generator data and definitions (shared with the DM Forge web dashboard). */
import * as IT from './items.js';
import { metricize } from './units.js';
/* ================= helpers ================= */
const rnd=n=>Math.floor(Math.random()*n);
const pick=a=>a[rnd(a.length)];
const range=(a,b)=>a+rnd(b-a+1);
const chance=p=>Math.random()<p;
const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;
const fmt=n=>n.toLocaleString('en-US');
function pickN(a,n){const c=a.slice(),o=[];while(o.length<n&&c.length)o.push(c.splice(rnd(c.length),1)[0]);return o}
function weighted(pairs){const t=pairs.reduce((s,p)=>s+p[1],0);let r=Math.random()*t;for(const p of pairs){r-=p[1];if(r<0)return p[0]}return pairs[pairs.length-1][0]}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function uid(){return Math.random().toString(36).slice(2,9)+Date.now().toString(36)}

/* ================= word lists ================= */
const ANCESTRIES=["Human","Elf","Half-elf","Dwarf","Halfling","Gnome","Half-orc","Tiefling","Dragonborn"];
const FIRST_NAMES=["Aldric","Branwen","Caius","Delyth","Eamon","Fenwick","Galadrin","Hesper","Ivar","Jorah","Kestrel","Lysandra","Mireille","Nolwenn","Osric","Percival","Quilla","Rowena","Soren","Thessaly","Ulric","Vesper","Wrenna","Xandric","Yorick","Zephyra","Aldous","Brielle","Corvin","Draven","Elowen","Fenris","Griselda","Halric","Isolde","Jareth","Kyrian","Liora","Magnus","Nessa"];
const SURNAMES=["Ashworth","Blackwood","Cinderfall","Duskmere","Emberlyn","Frostwind","Graystone","Hollowvale","Ironbrook","Journeyman","Kestrelwing","Larkspur","Moonwhisper","Nightshade","Oakhart","Pemberton","Quickwater","Ravenscroft","Stormcrow","Thistledown","Underhill","Vaneford","Wyndham","the Bold","the Cunning","the Grey","the Wanderer","of the Vale","of Three Rivers","Cobblestone"];
const ELF_A=["Ae","Cae","Ela","Fae","Ili","Lor","Mae","Syl","Thae","Yl","Nym","Ara","Eri","Sera"];
const ELF_B=["lindra","thiel","wen","rion","nael","soryn","dris","lanar","vyre","mira","thas","enya"];
const ELF_C=["Moonwhisper","Silverleaf","Dawnstrider","Starbloom","Nightbreeze","Amberglade","Willowmere"];
const DWARF_F=["Borrik","Dagna","Thora","Kazrik","Hilda","Orsik","Vondra","Brunhild","Durgan","Gunnhild","Baldrek","Ingra","Rurik","Helga","Torga","Marek"];
const DWARF_C=["Ironbrow","Deepdelver","Stonehand","Anvilborn","Coppervein","Hammerfall","Goldbeard","Blackforge","Rockwhistle","Coalheart"];
const HALF_F=["Pip","Merrin","Tansy","Bram","Cora","Finn","Hazel","Perrin","Rosie","Wick","Lyle","Marigold","Nob","Tilda","Sorrel","Jory"];
const HALF_C=["Goodbarrel","Thistlewood","Underbough","Brushgather","Tealeaf","Greenbottle","Hilltopple","Appleby","Longfurrow","Warmhearth"];
const GNOME_F=["Bimble","Nim","Zook","Fizwick","Orla","Tinkerby","Wobbin","Jebbik","Nyx","Sprocket","Quillby","Dimble"];
const GNOME_C=["Cogsworth","Sparkgear","Whistlewick","Gimblepot","Fumblecrank","Brasskettle","Tumbleshaft","Glimmerspring"];
const ORC_F=["Grusk","Ugra","Mog","Thokk","Shara","Bolg","Dunka","Krag","Yeva","Ront","Vrash","Orga"];
const ORC_C=["Ironhide","Redtusk","Splitshield","Skullsong","Gravelthroat","Boarbane"];
const TIEF_V=["Ardent","Carrion","Glory","Hollow","Kindle","Lament","Mercy","Reverie","Sorrow","Vigil","Zeal","Ruin"];
const TIEF_A=["Mal","Kor","Rav","Zed","Vor","Ish","Nar","Sab"];
const TIEF_B=["akos","ira","thar","eth","enna","isar","oc","azel"];
const DRAG_A=["Ark","Bal","Dhar","Kriv","Med","Naar","Pand","Rhog","Sora","Tor","Yrja","Vash"];
const DRAG_B=["asar","ash","jhin","ranx","ala","hesh","oth","ixa"];
const DRAG_C=["Vaekrith","Orshanthul","Dhaelzar","Kyrravoss","Thundrel","Nyxarra"];

function nameFor(race){
  switch(race){
    case 'Elf': return pick(ELF_A)+pick(ELF_B)+" "+pick(ELF_C);
    case 'Half-elf': return chance(.5)?nameFor('Human'):nameFor('Elf');
    case 'Dwarf': return pick(DWARF_F)+" "+pick(DWARF_C);
    case 'Halfling': return pick(HALF_F)+" "+pick(HALF_C);
    case 'Gnome': return pick(GNOME_F)+" "+pick(GNOME_C);
    case 'Half-orc': return pick(ORC_F)+(chance(.4)?" "+pick(ORC_C):"");
    case 'Tiefling': return chance(.5)?pick(TIEF_V):pick(TIEF_A)+pick(TIEF_B);
    case 'Dragonborn': return pick(DRAG_A)+pick(DRAG_B)+" "+pick(DRAG_C);
    default: return pick(FIRST_NAMES)+" "+pick(SURNAMES);
  }
}
const randomName=()=>nameFor(pick(ANCESTRIES));

const PLACE_PRE=["Ravens","Thorn","Iron","Stone","Wolf","Silver","Black","Green","Wind","Storm","Shadow","Sun","Moon","Bright","Grim"];
const PLACE_SUF=["hollow","watch","hold","haven","reach","ford","bridge","spire","gate","mere","wood","moor","crest","fen","vale"];
const placeName=()=>cap(pick(PLACE_PRE)+pick(PLACE_SUF));
const TAVERN_ADJ=["Prancing","Drunken","Laughing","Weary","Golden","Silver","Rusty","Crooked","Gilded","Sleepy","Howling","Salty","Wandering","Blind","Merry","Broken"];
const TAVERN_NOUN=["Pony","Dragon","Griffin","Anchor","Kraken","Stag","Serpent","Boar","Lantern","Crown","Tankard","Owl","Wolf","Mermaid","Wyvern","Barrel"];
const FACTION_WORDS=["Hand","Order","Circle","Guild","Covenant","Brotherhood"];
const factionName=()=>"the "+pick(TAVERN_ADJ)+" "+pick(FACTION_WORDS);

const NPC_ROLES=["Blacksmith","Innkeeper","Guard captain","Street urchin","Merchant","Cutpurse","Village elder","Traveling bard","Retired adventurer","Cult zealot","Court wizard","Smuggler","Herbalist","Gravedigger","Fence for stolen goods","Mercenary","Noble in disguise","Fanatic priest","Beast trainer","Spy","Fortune teller","Corrupt tax collector","Shipwright","Hermit","Grieving parent","Escaped prisoner"];
const BUILDS=["tall and rangy","short and stocky","broad-shouldered","wiry and quick-eyed","heavyset and slow-moving","slight, almost frail","athletic, with a soldier's posture","hunched, as if bracing against wind"];
const FEATURES=["a crescent scar through one eyebrow","ink-stained fingertips","a missing front tooth","braids threaded with copper wire","an ornate ring too big for their finger","freckles like spilled pepper","one pale, cloudy eye","heavy rings under both eyes","a perfectly waxed mustache","a swallow tattooed on the neck","calloused hands with burn marks","unusually fine, expensive boots","a patched coat in three mismatched colors","silver-streaked hair they clearly dye","a faint smell of cloves"];
const VOICES=["gravelly whisper","sing-song and cheerful","clipped and formal","booming, laughing mid-sentence","slow, with long pauses","fast and breathless","soft, almost apologetic","dry and sarcastic","thick regional accent","speaks of themselves in the third person"];
const QUIRKS=["always speaks in rhyme","has a pet raven that mimics conversations","is missing an eye and wears a jeweled patch","collects buttons obsessively","never removes their gloves","smells faintly of lavender and smoke","has a nervous laugh before lying","keeps a battered locket they won't open","talks to themselves when nervous","is convinced they're being followed","hums old war songs absentmindedly","flinches at loud noises","counts coins compulsively","has an unsettling, unblinking stare","always offers unsolicited advice","wears mismatched boots","carries a lucky (cursed) trinket","refuses to enter buildings after dark","has a pronounced limp from an old wound","speaks fondly of a rival who 'isn't really gone'"];
const WANTS=["to pay off a debt before the next full moon","to see a missing sibling again","to be taken seriously by their peers","revenge on someone who wronged their family","to retire somewhere quiet and warm","a rare ingredient for a dying friend","to prove their innocence","enough gold to buy a title","to keep a dangerous secret buried","to protect someone who doesn't know they're in danger","to finish a masterwork before they die","to escape the life they were born into"];
const SECRETS=["is secretly in the pay of a rival faction","once belonged to a cult and still bears the brand","is not who they claim to be","knows where something valuable is hidden","caused a disaster everyone blames on someone else","is slowly being cursed and hiding it","has a child nobody knows about","is a retired adventurer who fled something terrifying","is blackmailing a local official","owes a dangerous favor to a powerful patron","can't read and hides it carefully","witnessed a murder and said nothing"];

const VILLAIN_WHO=["a cult prophet who hears a voice no one else can","a corrupt magistrate hiding behind the law","an exiled noble with a claim to the throne","a guild boss who owns half the city's debts","a scholar who has outgrown morality","a warlord rebuilding an army from the ruins of a defeat","a charming merchant prince with ruinous plans","a hag who trades in bargains","a priest convinced the world must end to be saved","an alchemist whose cure turned into a plague","a bandit queen with a code that is only half a lie","a knight who failed one oath and now serves another"];
const VILLAIN_GOAL=["seize the throne before the old ruler dies","bring back someone who should stay dead","wipe out a rival bloodline","open a sealed gate","corner the region's grain supply","become immortal at any price","avenge an old betrayal","prove their genius to a world that laughed"];
const VILLAIN_METHOD=["blackmail and bribery","cult infiltration of respected institutions","hired monsters and mercenaries","forged documents and false witnesses","plagues and poisons","political marriage","stolen relics","illusions and impersonation"];
const VILLAIN_WEAK=["fears being exposed as a fraud","loves one person above all else","is bound by a sworn oath","cannot cross running water","is tied to an object kept in a hidden place","is arrogant and always explains the plan","needs a rare reagent every month","trusts a lieutenant who is already plotting betrayal"];
const LAIRS=["a sealed manor on the edge of town","a temple converted into a fortress","the cellars beneath a respectable business","a hidden valley reachable by one road","a flooded mine","a barge that never docks","a mountaintop observatory","a catacomb under the city's oldest cemetery"];
const MINIONS=["loyal bandits","brainwashed townsfolk","bound spirits","a mercenary company","twin assassins","trained beasts","fanatical acolytes","hired constables on the take"];

const DRINKS=["a smoky amber ale","spiced plum wine","honeyed mead served warm","a sharp cider that bites back","black barley stout","a clear spirit the locals call 'dragonwater'","elderflower cordial","hot mulled cider with a splash of brandy"];
const FOODS=["rabbit stew thick with barley","roast boar on dark bread","smoked trout and pickled onions","buttered turnip pie","spiced lamb skewers","a famously bad (but loved) fish chowder","honey-glazed ham","cheese baked in a bread bowl"];
const VIBES=["warm, loud, and crowded","hushed, everyone minding their own business","rowdy; a brawl is ten minutes away","dusty and half-empty, clearly past its prime","fancy, trying very hard to impress","cozy, with a roaring fire and a sleeping dog","tense; a faction has taken the back tables","festive; someone is celebrating something"];
const CROWDS=["a table of off-duty city guards","two cloaked strangers who keep eyeing the door","a bard stuck on one song","merchants arguing over a shipment","pilgrims sharing a single loaf","a lone drunk muttering about a dragon","traveling performers rehearsing in a corner","miners fresh off a shift"];
const NOTICES=["a bounty on a wolf-pack leader, 50 gp","'Missing: one prize goat, and also my brother'","a request for escorts to the next town","a faded poster for a wizard's apprentice","an unsigned note: 'Meet me at midnight at the old well'","a warning: 'Do not drink from the east well'","a job offer: caravan guards wanted, no questions","a sketch of a face with 'Seen this person?' scrawled beneath"];
const KEEPER_TRAITS=["nosy","generous to a fault","suspicious of adventurers","a retired soldier full of war stories","terrible at math","gossip incarnate","obsessively tidy","secretly a better fighter than they let on"];

const SHOPS={
 "General store":{nouns:["Provisions","Goods","Emporium","Mercantile"],stock:["Rope, 50 ft: 1 gp","Torches, bundle of 10: 1 sp","Rations, 5 days: 2 gp","Waterskin: 2 sp","Bedroll: 1 gp","Hooded lantern: 5 gp","Crowbar: 2 gp","Iron spikes, 10: 1 gp","Backpack: 2 gp","Chalk, 10 pieces: 1 cp"]},
 "Blacksmith":{nouns:["Forge","Anvil","Smithy","Hammer & Tongs"],stock:["Dagger: 2 gp","Shortsword: 10 gp","Longsword: 15 gp","Chain shirt: 50 gp","Shield: 10 gp","Horseshoes, set: 5 sp","Iron cookpot: 2 gp","Hand axe: 5 gp","Sharpening service: 5 sp","Custom hinges and nails: 1 sp"]},
 "Apothecary":{nouns:["Remedies","Mortar & Pestle","Tinctures","Herbs"],stock:["Potion of healing: 50 gp","Healer's kit: 5 gp","Antitoxin vial: 50 gp","Dried willow bark: 5 sp","Sleeping tea, 3 doses: 1 gp","Herbalism kit: 5 gp","Salve for burns: 2 gp","Smelling salts: 5 sp","Fresh wolfsbane bundle: 1 gp","Tonic 'for the nerves': 3 gp"]},
 "Arcane curios":{nouns:["Curios","Oddities","Wonders","Cabinet"],stock:["Spell component pouch: 25 gp","Crystal arcane focus: 10 gp","Blank spellbook: 50 gp","Scroll of a 1st-level spell: 75 gp","Fine ink and quills: 10 gp","Lens sold as 'true-seeing' (may not be): 15 gp","Jar of 'ghost-light': 30 gp","Brass astrolabe: 40 gp","Pinch of powdered meteorite: 20 gp","Bottled thunderclap, single use: 25 gp"]},
 "Tailor":{nouns:["Threads","Needle & Thread","Finery","Wardrobe"],stock:["Traveler's clothes: 2 gp","Fine clothes: 15 gp","Wool winter cloak: 5 gp","Oilcloth hooded cloak: 3 gp","Embroidered gloves: 4 gp","Disguise kit: 25 gp","Noble's outfit, tailored to order: 60 gp","Sturdy patched boots: 3 gp","Cloak pin with a hidden compartment: 12 gp","Scarf in house colors: 1 gp"]},
 "Bookseller":{nouns:["Folios","Pages","Tomes","Ink & Quill"],stock:["Regional almanac: 5 gp","Prayer book: 2 gp","Bestiary of local fauna: 25 gp","Illustrated coastal map: 10 gp","Three-volume romance: 6 gp","Blank journal: 2 gp","Treatise on poisons (under the counter): 40 gp","Collection of folk songs: 3 gp","History of the town: 18 gp","Book of riddles: 4 gp"]},
 "Stables":{nouns:["Stables","Hoofs & Harness","Livery"],stock:["Riding horse: 75 gp","Pony: 30 gp","Mule: 8 gp","Saddle and tack: 20 gp","Feed, one week: 5 sp","Overnight stabling: 5 sp","Draft horse: 50 gp","Cart: 15 gp","Carrier pigeon: 5 gp","Trained guard dog: 25 gp"]},
 "Jeweler":{nouns:["Gems","Gilded Things","Brilliants","Facets"],stock:["Silver ring: 10 gp","Gold locket: 25 gp","Cut garnet: 50 gp","Blank signet ring: 20 gp","Pearl earrings: 40 gp","Gem appraisal: 5 gp","Copper bracelet 'against bad luck': 8 gp","Copy of a noble house brooch: 15 gp","Loose moonstone: 50 gp","Ivory prayer beads: 12 gp"]}
};
const SHOP_SPECIAL=["a cloak that always stays dry, kept behind the counter","a dented helm said to have belonged to a famous general","a small music box that never needs winding","a map with half the labels scratched out","a ring engraved with a name the keeper won't discuss","a staff carved in a language no one in town can read","a crate marked 'DO NOT OPEN', left as payment for a debt","a bottle of ink that writes only in moonlight"];
const SHOP_QUIRKS=["haggles by telling elaborate stories","only accepts exact change","closes without warning when the bells chime","has a talking parrot that insults customers","keeps a loaded crossbow under the counter","is writing a novel and reads from it between sales","refuses to sell to anyone wearing red","gives a free trinket for the customer's best joke"];

const GOV=["a village elder and a council of three","a hereditary lord who rarely visits","a merchant guild that sets the laws","an elected mayor locked in a feud with the guards","a temple that doubles as the town hall","a martial captain under a distant crown","a council of rival families","a charismatic stranger nobody remembers electing"];
const KNOWN_FOR=["its cheese, which draws buyers from three kingdoms","a bridge nobody will say who built","an annual festival of lanterns","an always-full tavern","the finest blades in the region","a famous healing spring","a very old, very large tree at its center","exports of ink and parchment","being the last stop before the wilderness","an unusually friendly population (suspiciously so)"];
const S_FEATURE=["a watchtower that leans noticeably","a market square built around a dry fountain","a stone circle at the edge of town","a library in a former granary","a mill whose wheel turns without water","a hill topped with a ruined shrine","a canal lined with willow trees","a bell that rings at hours that make no sense"];
const S_TROUBLE=["wolves are taking livestock at night","tax collectors arrived early and nobody can pay","the well water tastes strange","a rival town is sabotaging trade","three people have vanished in a month","the festival fund has been stolen","a new cult recruits openly in the square","the lord's heir has disappeared"];
const SIZES=["Hamlet, about 60 people","Village, about 400 people","Village, about 800 people","Town, about 2,500 people","Town, about 5,000 people","City, about 12,000 people","Large city, about 30,000 people"];

const ROOM_SHAPES=["a long, narrow hall with pillars","a circular chamber under a domed ceiling","a cramped square cell","a vaulted crypt with side alcoves","a wide cavern, floor sloping toward the center","an L-shaped corridor ending in a landing","a flooded room, knee-deep and cold","a half-collapsed chamber, rubble blocking part of the floor"];
const ROOM_SIZES=["10 × 10 ft","20 × 20 ft","30 × 40 ft","15 × 50 ft","40 × 40 ft"];
const ROOM_FEATURES=["murals depicting a forgotten procession","a dry fountain choked with bone dust","a stone altar stained dark","rows of empty weapon racks","a toppled statue missing its head","a pit in the center, ropes still tied to the edge","scratched tally marks covering one wall","a hearth that is still faintly warm","a rusted iron chandelier overhead","glowing fungus on the ceiling"];
const ROOM_ATMOS=["cold air and a faint smell of rot","dripping water echoing somewhere","a low, steady hum from the walls","total silence that feels deliberate","warm, damp, with a sulfur tang","flickering light with no visible source","distant chanting that stops when you listen","dust that hasn't been disturbed in years, mostly"];
const ROOM_PUZZLES=["A lever puzzle: four levers, only one order opens the exit","A mosaic floor where stepping on the wrong tiles triggers a trap","Statues with riddles carved at their feet","A locked chest whose key is held by a statue's outstretched hand","A pool with three colored gems at the bottom and a faded inscription"];
const ROOM_HAZARDS=["The floor is slick with ancient oil","A section of ceiling is ready to collapse","Thick mold fills the air (Constitution save or cough for a minute)","A shimmering patch of floor teleports the unwary to another room","A cold spot drains warmth and light from torches"];
const ROOM_EXITS=["one rusted iron door, stuck","a narrow crawlspace behind a loose stone","stairs descending into the dark","a secret door (DC 15 to find)","a rope bridge across a gap","a locked wooden door (DC 13 to pick)","a collapsed tunnel that can be cleared in an hour","an archway sealed by a faint shimmer"];

const LANDMARKS={
 Forest:["a lightning-split oak the size of a house","a ring of mushrooms around a flat stone","an abandoned woodcutter's cabin","a clearing with no birdsong","a moss-covered statue of a forgotten god","a hollow tree big enough to shelter in"],
 Mountain:["a cairn of stacked stones, hundreds of years old","a narrow pass with ancient wheel ruts","a frozen waterfall","a cave mouth breathing warm air","a rope bridge over a deep gorge","a shrine carved into the cliff face"],
 Swamp:["a sunken boat with a rotted figurehead","stilt huts joined by rope walkways","a stand of dead white trees","a boardwalk that ends mid-marsh","a lone stone tower leaning into the mud","a pool that reflects a different sky"],
 Coast:["a lighthouse, dark for years","a shipwreck exposed at low tide","sea caves that flood with the tide","a rock arch with carvings","a beach littered with strange glass","a fishing village built on pilings"],
 Plains:["a lone standing stone","a burned-out farmstead","a circle of old wagon wrecks","a shallow ford with a toll hut","a hill topped with a ruined watchtower","a field of flowers blooming out of season"],
 Desert:["a half-buried statue","a dry oasis ringed with dead palms","a wind-carved stone arch","an abandoned caravanserai","bleached bones arranged in a spiral","a glass-smooth crater"],
 Tundra:["a frozen lake with something dark beneath","a giant ribcage jutting from the ice","an ice cave glowing blue","a lone totem pole","an abandoned hunter's camp with the fire still warm","a sled half-buried in snow"]
};
const SIGNS=["fresh tracks leading away","a fire pit, still warm","claw marks on nearby trees","a discarded, bloodied bandage","a crude warning scratched into stone","the smell of smoke on the wind","a trail of scattered coins","a broken wagon wheel","distant howling, closer than it should be","an arrow stuck in the ground, pointing somewhere"];
const FINDS=["a hidden cache of supplies (a few days' rations and a healing herb)","a dying traveler with a message","a clue to a bigger mystery","a safe campsite with fresh water","a trapped animal that can be freed, and might remember it","a locked chest with no key in sight","a patrol of locals who warn about something ahead","nothing, but a distinct feeling of being watched"];

const TEMPS=["Freezing","Bitterly cold","Cold","Cool","Mild","Warm","Hot","Scorching"];
const SEASON_BASE={Spring:3,Summer:5,Autumn:3,Winter:1};
const CLIMATE_OFF={Temperate:0,Cold:-2,Arid:1,Tropical:2};
const SKY_COLD=["clear and bitterly bright","overcast, low and grey","light snow","heavy snowfall","a blowing blizzard","freezing fog"];
const SKY_MILD=["clear skies","scattered clouds","overcast","drizzle","steady rain","patchy fog","a thunderstorm rolling in","sleet"];
const SKY_HOT=["blazing, cloudless sun","hazy and humid","a few high clouds","a thunderstorm building in the distance","dust haze on the horizon"];
const WINDS=["Still air","A light breeze","A steady wind","Gusty","A howling gale"];

const GEMS=["azurite","bloodstone","citrine","jasper","moonstone","onyx","quartz","tourmaline","garnet","pearl","amethyst","topaz","opal"];
const LOOT_COMMON=["a handful of copper coins","a set of worn traveler's clothes","a half-eaten loaf of bread","a rusty dagger","a tattered map of a nearby town","a small tin whistle","a coil of hempen rope","a cracked ceramic mug","a moth-eaten wool blanket","a pouch of common herbs"];
const LOOT_UNCOMMON=["a silver locket with no portrait inside","an unlabeled potion of healing","a finely balanced throwing knife","a spyglass with a cracked lens","a signet ring of a minor noble house","a spellbook page, torn and singed","a set of loaded dice","a music box that plays a haunting tune","a vial of glowing blue liquid","a masterwork lockpick set"];
const LOOT_RARE=["a wand humming with faint magic","a cloak that shifts color with the wearer's mood","an ancient coin from a fallen empire","a shard of a shattered artifact","a ring that never tarnishes","a dagger that whispers in a forgotten tongue","a folded letter sealed with an unfamiliar crest","a weapon with a name etched along the blade (it may be magical)"];

const ITEM_TYPES=["ring","amulet","cloak","boots","gloves","staff","wand","sword","dagger","shield","helm","lantern","satchel","goblet","mirror","key"];
const MATERIALS=["silver-threaded","blackened iron","bone-white","jade-green","copper-banded","glass-clear","rune-etched oak","salt-crusted","obsidian","amber-set"];
const CONCEPTS=["Whispers","Embers","Quiet Footsteps","the Drowned King","Borrowed Time","Hollow Hunger","Windward Luck","Ninefold Echoes","Stubborn Mercy","Starfall","Long Memory","the Last Laugh"];
const ITEM_EFFECTS={
 "Common":["Sheds dim light on command","Never gets wet or dirty","Hums softly near hidden doors","Warms to the touch in cold weather","Always points faintly north","Whistles once when poison is nearby"],
 "Uncommon":["Once per day, grants advantage on one ability check","Stores one 1st-level spell, usable once per day","Lets you breathe underwater for an hour each day","Halves the fall damage you take","Grants darkvision out to 60 ft while worn","Once a week, turns a failed saving throw into a success"],
 "Rare":["Grants resistance to one damage type, chosen each dawn","Casts misty step up to three times per day","Once per day, reveals invisible creatures and hidden doors for a minute","Gives a +1 bonus to attack and damage rolls","Stores and releases one 3rd-level spell per week","Lets you speak and understand any language for 10 minutes, three times a day"],
 "Very rare":["Once per day, reroll any one d20 and choose the result","Grants a flying speed for 10 minutes per day","Grants immunity to being frightened and charmed while worn","Once per week, produces a 5th-level effect of the DM's choosing","Becomes any weapon the wielder wants as a bonus action","Gives a +2 bonus to attack, damage, and AC while attuned"]
};
const ITEM_CATCHES=["attunement requires a drop of the wearer's blood each dawn","whispers in a dead language while the wearer sleeps","loses its power if used against the innocent","the previous owner's ghost occasionally comments","glows when a certain creature type is near, wanted or not","each use ages the wearer by a day","it hates being left behind and finds its way back","works only if the wearer has told no lie that day"];
const ITEM_HISTORY=["forged for a queen who vanished","stolen three times, always returned to the same shop","last seen on a hero who died laughing","made as a wedding gift between rival houses","pulled from the wreck of a ship that never sank","said to be cursed, yet every owner prospered"];

const POTION_COLOR=["a cloudy violet","a bright emerald","an oily black","a pale, pearly","a deep amber","a fizzing silver","a watery blue","a thick crimson"];
const POTION_DETAIL=["with floating gold flecks","that sparkles in lamplight","that swirls on its own","that smells of rain","with a faint glow","that steams slightly","separated into two layers","that is oddly warm to the touch"];
const POTION_TASTE=["sweet as honey","bitter like burnt bark","like cold iron","like copper coins","of mint and smoke","salty, like seawater","oddly like fresh bread","utterly flavorless"];
const POTION_EFFECT=["heals 2d4 + 2 hit points","grants darkvision for 1 hour","lets you speak with animals for 10 minutes","makes you float 6 inches above the ground for 10 minutes","lets you mimic any voice you've heard today","gives advantage on Dexterity checks for 1 hour","lets you see invisible things for 10 minutes","cures one common ailment","grants resistance to cold for 1 hour","makes you impossible to track by scent for an hour"];
const POTION_SIDE=["you hiccup bubbles for an hour","everything smells like cinnamon","a sudden craving for raw fish","you glow faintly for a minute","you hear a distant song only you can hear","mild euphoria (DC 10 Wisdom save to resist doing something silly)","your voice drops an octave until dawn","your shadow lags a half-second behind"];

const TRINKETS=["a tarnished silver button engraved with a tiny crown","a glass eye that seems to follow the light","a deck of cards missing the queen of hearts","a small jar of sand that never settles","a bird's skull wrapped in red thread","a child's wooden sword, well loved","a ticket stub to a performance that never happened","a lock of hair tied with a faded ribbon","a coin from a nation that no longer exists","a brass compass that points to the nearest tavern","a pressed flower between two tiny panes of glass","a spoon bent in a very deliberate way","a map of a city drawn on a handkerchief","a whistle that makes no sound a human can hear","a half-finished letter addressed to 'Dearest'","a ring of keys, none fitting anything the owner knows","a vial of seawater that stays cold","a tiny portrait of a stranger with your eyes","a snail shell that hums when held to the ear","a wax seal stamped with an unknown crest","a feather that drifts down no matter how hard it's thrown","a charred scrap of a wedding invitation","a smooth black stone that is always warm","a mismatched pair of dice"];

const BOOK_SUBJ=["wyvern husbandry","forgotten burial customs","the rivers of the north","poisons and their cures","star-reading","the ethics of necromancy","local folk remedies","siege engines","tavern etiquette","the history of a war nobody remembers"];
const BOOK_ADJ=["Forgotten","Hollow","Burning","Gilded","Silent","Crooked","Unfinished"];
const BOOK_NOUN=["Almanac","Grimoire","Testament","Chronicle","Ledger","Hymnal","Bestiary"];
const AUTHOR_DESC=["a disgraced court scholar","a monk of a minor order","an anonymous traveler","a retired spy","a famously unreliable sage","a child prodigy"];
const BOOK_COND=["pristine, as if never read","water-stained and swollen","missing its last chapters","annotated in three different hands","bound in an odd, faintly warm leather","partially burned","held shut by a small brass lock"];
const BOOK_CONTENT=["practical advice that mostly works","a dry account of tax law with a shocking footnote","bawdy songs with marginal notes in code","a genealogy that contradicts the official one","detailed instructions for a ritual (probably unsafe)","a dozen recipes, one of which is a poison","a map folded into the spine","a diary entry that ends mid-sentence"];
const BOOK_SECRET=["a page near the end is a cipher, and the key is elsewhere in the book","the margins hide a confession","a hollow in the cover holds a small key","the last chapter predicts a local event with unsettling accuracy","one page is written in invisible ink (revealed by heat)","the author's name is a forgery"];

const ENC={
 Forest:[["wolf","wolves"],"giant spider","bandit","goblin","owlbear",["dire wolf","dire wolves"],"venomous snake","boar"],
 Dungeon:["skeleton","zombie","giant rat","kobold","cultist","ghoul","gelatinous cube","mimic"],
 Urban:["thug","corrupt guard","pickpocket","smuggler","assassin",["cultist in disguise","cultists in disguise"],"rival adventurer"],
 Mountain:["orc","harpy","griffon","yeti","ogre","stone giant","wyvern"],
 Swamp:[["lizardfolk","lizardfolk"],"giant frog","crocodile","stirge","will-o'-wisp","swamp hag"],
 Coastal:["merfolk raider","giant crab","pirate","smuggler",["sahuagin","sahuagin"],"harpy"],
 Desert:["giant scorpion","bandit raider",["mummy","mummies"],"giant lizard","gnoll","dust cultist"],
 Tundra:[["wolf","wolves"],["winter wolf","winter wolves"],"yeti","polar bear","ice mephit","frost giant"]
};
const ENC_DOING=["ambushing from cover","feeding on a fresh kill","guarding a camp and arguing","fleeing from something worse","traveling in formation","hunting a specific target","negotiating, and open to a bribe","asleep, mostly"];
const ENC_TERRAIN=["the ground is slick with mud","fog drifts in after round two","a collapsing bridge adds a hazard","a narrow chokepoint limits movement","the foes hold the high ground","a nearby fire is spreading","loud noise attracts a second group in 3 rounds","a river cuts the battlefield in two"];
const ENC_WILD=["a bystander is caught in the middle","one foe is far stronger than the rest","a horn sounds; reinforcements are coming","they're after one specific item a PC carries","one foe wants to surrender but is afraid of its leader","an unseen third party is watching, and acts if the fight drags on"];
function plural(entry,n){const e=Array.isArray(entry)?entry:[entry,entry+"s"];return n===1?e[0]:e[1]}

const SEV={Setback:{dc:[10,11],dmg:"1d10"},Dangerous:{dc:[12,15],dmg:"2d10"},Deadly:{dc:[16,20],dmg:"4d10"}};
const TRAP_TRIGGER=["a hidden pressure plate under the rug","a tripwire at ankle height","opening a chest lid","lifting a candlestick from its holder","stepping on one particular floor tile","reading an inscription aloud","removing a gem from its socket","opening a door without the right key"];
const TRAP_EFFECT=["Darts fire from the walls: DC {dc} Dexterity save, {dmg} piercing damage on a failure","The floor drops into a spiked pit: DC {dc} Dexterity save or fall, taking {dmg} damage","A blade swings from the ceiling: DC {dc} Dexterity save or take {dmg} slashing damage","Poison gas hisses out: DC {dc} Constitution save, {dmg} poison damage on a failure","A rune flares with fire: DC {dc} Dexterity save, {dmg} fire damage (half on a success)","A stone block falls from above: DC {dc} Dexterity save or take {dmg} bludgeoning damage"];
const TRAP_CLUE=["thin scratch marks around the plate","fresh oil on the hinges","a skeleton nearby clutching a lantern","scorch marks on the ceiling","a faint draft from the wall seams","dust disturbed in a narrow, deliberate line"];
const TRAP_DISARM=["jam the mechanism with an iron spike","cut the wire before it's pulled","pour water into the vent to clog it","dispel the rune with dispel magic","speak the correct phrase, which is hinted at nearby"];

const TRAVEL_EVENTS=["A washed-out bridge forces a long detour","A friendly caravan offers to share a campfire and news","Thick fog rolls in; navigating is slow and uncertain","Bandits demand a toll, and they look nervous","A stray, well-trained dog follows the party for a day","The road is blocked by a fallen tree with fresh axe marks","A wandering merchant sells suspiciously cheap goods","A lone rider passes at speed, ignoring greetings","Strange tracks lead off the road toward a hidden hollow","Distant smoke rises from a place that should be empty","A thunderstorm forces everyone to find shelter","A pilgrim procession blocks the road for hours"];
const TRAVEL_COSTS=["lose half a day","a day of rations spoils","a mount goes lame","the party gets lost (DC 12 Survival to recover the trail)","something small is stolen overnight","everyone is worn out: disadvantage on the next watch check","no cost this time"];
const TRAVEL_BOONS=["a shortcut known only to locals","a reliable guide for a small fee","a free night's lodging in exchange for a favor","fresh rations and fresher news","a clue about a nearby ruin","nothing extra"];

const HOOK_TEMPLATES=["%npc% has gone missing near %place%, and the only clue is a torn scrap bearing the mark of %faction%.","%faction% is quietly buying up property in %place%, and %npc% wants to know why.","A plague of nightmares has struck %place%; the locals blame %npc%, but the truth points to %faction%.","%npc% offers a reward for retrieving a stolen heirloom last seen in the hands of %faction%.","Strange lights have been seen over %place% at night, and %npc% believes %faction% is responsible.","%npc% needs an escort to %place%, but refuses to explain why %faction% wants them dead.","A ritual site was discovered beneath %place%; %faction% will pay handsomely for it to stay buried.","%npc% has been framed for a crime committed by %faction%, and the trail leads to %place%.","Refugees fleeing %place% speak of a deal gone wrong between %npc% and %faction%.","%faction% has placed a bounty on %npc%, last seen heading toward %place%."];
const STAKES=["a person's life","a town's future","a family's honor","a priceless relic","a fragile political alliance","a long-buried truth"];
const TWISTS=["the quest giver is lying about their motives","the target is already dead","the villain is an old friend of a PC's family","a rival party is after the same prize","the 'monster' is protecting something innocent","the reward is cursed","the deadline is much shorter than claimed","the real danger is somewhere else entirely"];
const QUEST_GOALS=["Escort %npc% safely to %place%","Retrieve %item% from the ruins near %place%","Find %npc%, who vanished on the road to %place%","Clear %foe% out of %place% before the harvest","Deliver a sealed letter to %npc% without opening it","Investigate the strange lights over %place%","Recover what %faction% stole from %npc%","Guard %place% during a visit from %npc%, who has many enemies","Track down %npc%, wanted by %faction%, and bring them in alive","Break the curse on %place% before the next new moon"];
const QUEST_ITEMS=["a stolen family heirloom","a sealed iron coffer","a stolen shipment of silver","a book of forbidden rites","a sacred bell cracked in two","the deed to a disputed farm","a signet ring of a vanished house","a crate of unmarked vials"];
const QUEST_FOES=["goblins","bandits","giant spiders","restless dead","stirges","wolves","cultists","a troll"];
const REWARDS=["75 gp each","a favor owed by a minor noble","a map marked with an X and no explanation","a potion or minor magic trinket","free lodging for a season","a letter of introduction to a powerful patron","the deed to a small, mildly haunted cottage","half now, half on completion, and a bad feeling about the second half"];
const DEADLINES=["by sunrise","within three days","before the next full moon","by the end of the week","before the festival","before winter closes the pass","no deadline, but someone else is also looking"];
const RUMORS=["%npc% was seen leaving %place% before dawn, carrying something heavy.","The old ruin near %place% is haunted; three men went in, one came out.","%faction% is paying double for any news of %place%.","%npc% isn't who they say they are.","A dragon has been spotted near %place%, or maybe just a very big lizard.","The well at %place% grants wishes, but not the way you'd think.","Merchants say the road to %place% is cursed.","%npc%'s fortune came from something dark.","Soldiers have been quietly gathering near %place%.","%faction% has a spy in every tavern from here to %place%.","%npc% owes more money than the whole town is worth.","Nobody who sleeps in %place% remembers their dreams."];
const COMPLICATIONS=["A rival party arrives and wants the same thing","The person who hired you is lying about something important","A natural hazard hits at the worst moment (storm, quake, flood)","An innocent gets caught in the middle","The authorities show up and misread the situation","Someone close to a PC is involved","The goal is already gone; someone beat you to it","A crucial NPC changes sides","The place is not what the map says","Time suddenly gets shorter","Reinforcements arrive for the other side","A trusted tool or item fails at a critical moment","An old enemy surfaces with leverage","A choice appears: save the goal or save people"];
const ESCALATIONS=["a bystander is in danger","the deadline moves up","a second threat appears","the cost of failure goes up","an ally is revealed to be compromised","the environment turns hostile","an NPC panics and does something rash","word spreads, and enemies prepare"];
const OMENS=["The moon rose red for three nights","All the birds fell silent at noon","Milk curdled in every pail overnight","A comet split in two over the harbor","The river ran backward for an hour","A child spoke in a dead language","Shadows pointed the wrong way at noon","Bells rang with no one near them"];
const OMEN_MEANINGS=["the return of something long sealed away","a god's displeasure with the region's ruler","a powerful figure dying, and a succession struggle to follow","a bargain made long ago coming due","nothing at all, though people will act as if it matters","a planar boundary thinning nearby","the land itself warning of disaster","a hero's destined arrival, though nobody knows who"];
const P_A=["the red moon","the drowned bell","the last king's crown","a crow with one white wing","the river of salt","the seventh door","the blind queen"];
const P_V=["rises over","kneels before","is broken by","devours","is carried across","answers","forgets"];
const P_B=["the burning city","the hollow throne","the sleeping giant","the nine candles","the silver gate","the forgotten name"];
const P_C=["a stranger","the youngest child","one who has already died","the faithful","a liar","two rivals"];
const P_W=["inherit the storm","speak a truth that cannot be unsaid","open what was sealed","pay the debt in full","wake the one beneath","carry the light home"];
const RIDDLES=[
 {q:"I have cities but no houses, mountains but no trees, and water but no fish. What am I?",a:"A map"},
 {q:"The more you take, the more you leave behind. What am I?",a:"Footsteps"},
 {q:"I speak without a mouth and hear without ears. I have no body, but I come alive with the wind. What am I?",a:"An echo"},
 {q:"I'm not alive, but I grow. I don't have lungs, but I need air. I have no mouth, but water kills me. What am I?",a:"Fire"},
 {q:"What can fill a room but takes up no space?",a:"Light"},
 {q:"The one who makes it sells it. The one who buys it never uses it. The one who uses it never knows. What is it?",a:"A coffin"},
 {q:"What gets wetter the more it dries?",a:"A towel"},
 {q:"Thirty white horses on a red hill: first they champ, then they stamp, then they stand still.",a:"Teeth"},
 {q:"A box without hinges, key, or lid, yet golden treasure inside is hid.",a:"An egg"},
 {q:"What walks on four legs in the morning, two at noon, and three in the evening?",a:"A person (crawling, walking, then with a cane)"},
 {q:"I have a head and a tail, but no body. What am I?",a:"A coin"},
 {q:"The poor have it, the rich need it, and if you eat it you die. What is it?",a:"Nothing"}
];
const FEST_NAMES=["The Festival of Lanterns","The Harvest Dance","The Night of Masks","Founder's Week","The Feast of First Frost","Midsummer Revel","The Blessing of the Boats","The Hollow Fair","Bellringers' Day","The Running of the Geese"];
const FEST_ACTIVITIES=["a procession of lanterns to the river","a pie-baking contest with serious rivalries","masked dancing in the square","archery and wrestling tournaments","a mock trial of the town's oldest grudge","a bonfire with fortune-telling","a market where everything is traded, not sold","storytelling contests on the green","boat races with sabotage as tradition"];
const FEST_TRADITION=["everyone wears a mask until midnight","no one may speak a lie for a full day","the youngest person in town rules for the afternoon","a chair is left empty for those who died this year","visitors must be given a gift on arrival","the oldest bell in town is rung exactly once"];
const FEST_TROUBLE=["a prized festival item has been stolen","a rival town sent saboteurs","a guest of honor has not arrived","an old feud is about to boil over","something in the food is making people sleepy","a stranger insists the festival is a ritual that must not finish"];

/* ================= generators ================= */
function fill(t){
  const m={};
  const g={npc:randomName,place:placeName,item:()=>pick(QUEST_ITEMS),foe:()=>pick(QUEST_FOES),faction:factionName};
  return cap(t.replace(/%(\w+)%/g,(_,k)=>m[k]||(m[k]=g[k]())));
}
function tierIdx(o){return ['Minor','Moderate','Major'].findIndex(t=>o.tier.indexOf(t)===0)}
function lootItem(ti){
  const w=[[75,23,2],[45,40,15],[20,45,35]][ti];
  const r=weighted([['c',w[0]],['u',w[1]],['r',w[2]]]);
  return pick(r==='c'?LOOT_COMMON:r==='u'?LOOT_UNCOMMON:LOOT_RARE);
}
function encText(env,n){const e=pick(ENC[env]);return n+" "+plural(e,n)}
function tavernName(){
  const r=rnd(4);
  if(r===0)return "The "+pick(TAVERN_ADJ)+" "+pick(TAVERN_NOUN);
  if(r===1){const n=pickN(TAVERN_NOUN,2);return "The "+n[0]+" & "+n[1]}
  if(r===2)return pick(FIRST_NAMES)+"'s "+pick(["Rest","Hearth","Cup","Ladle"]);
  return "The "+pick(TAVERN_NOUN)+"'s "+pick(["Head","Tail","Rest","Roost"]);
}
function weatherEffect(temp,sky){
  const i=TEMPS.indexOf(temp),s=sky.toLowerCase(),out=[];
  if(s.indexOf('thunder')>=0)out.push("Ranged attacks have disadvantage, thunder drowns out conversation, and metal gear is a lightning risk in the open.");
  else if(s.indexOf('fog')>=0)out.push("Heavily obscured beyond 30 ft; sight-based Perception at disadvantage.");
  else if(s.indexOf('snow')>=0||s.indexOf('blizzard')>=0)out.push("Deep drifts count as difficult terrain; tracks are easy to follow.");
  else if(s.indexOf('rain')>=0||s.indexOf('drizzle')>=0||s.indexOf('sleet')>=0)out.push("Hearing-based Perception at disadvantage; open flames are hard to keep lit.");
  else if(s.indexOf('dust')>=0)out.push("Visibility drops to about 300 ft; travelers need cloth over the mouth.");
  if(i>=6)out.push("Extreme heat: without extra water, travelers risk exhaustion (Constitution save each hour).");
  if(i<=1)out.push("Extreme cold: DC 10 Constitution save each hour without cold-weather gear, or gain a level of exhaustion.");
  return out.length?out.join(" "):"No special effects. A fine day to travel.";
}

const GENS=[
 /* ---- People ---- */
 {id:'npc',name:'NPC',cat:'People',kw:'character person villager npc stranger',
  opts:[{key:'race',label:'Ancestry',values:['Any'].concat(ANCESTRIES)}],
  fields:[
   {key:'race',label:'Ancestry',roll:(v,o)=>o.race==='Any'?pick(ANCESTRIES):o.race},
   {key:'name',label:'Name',dep:['race'],roll:v=>nameFor(v.race)},
   {key:'role',label:'Role',roll:()=>pick(NPC_ROLES)},
   {key:'look',label:'Look',roll:()=>cap(pick(BUILDS))+", "+pick(FEATURES)},
   {key:'voice',label:'Voice',roll:()=>cap(pick(VOICES))},
   {key:'quirk',label:'Quirk',roll:()=>cap(pick(QUIRKS))},
   {key:'wants',label:'Wants',roll:()=>cap(pick(WANTS))},
   {key:'secret',label:'Secret',roll:()=>cap(pick(SECRETS))}
  ]},
 {id:'names',name:'Names',cat:'People',kw:'name names baby naming',
  opts:[{key:'culture',label:'Culture',values:['Any'].concat(ANCESTRIES)}],
  fields:[{key:'list',label:'Six names',roll:(v,o)=>Array.from({length:6},()=>nameFor(o.culture==='Any'?pick(ANCESTRIES):o.culture))}]},
 {id:'villain',name:'Villain',cat:'People',kw:'antagonist boss enemy bbeg',
  fields:[
   {key:'name',label:'Name',roll:randomName},
   {key:'who',label:'Who',roll:()=>cap(pick(VILLAIN_WHO))},
   {key:'goal',label:'Goal',roll:()=>cap(pick(VILLAIN_GOAL))},
   {key:'method',label:'Method',roll:()=>cap(pick(VILLAIN_METHOD))},
   {key:'weak',label:'Weakness',roll:()=>cap(pick(VILLAIN_WEAK))},
   {key:'lair',label:'Lair',roll:()=>cap(pick(LAIRS))},
   {key:'minions',label:'Minions',roll:()=>cap(pick(MINIONS))}
  ]},
 /* ---- Places ---- */
 {id:'tavern',name:'Tavern',cat:'Places',kw:'inn pub bar tavern',
  fields:[
   {key:'name',label:'Name',roll:tavernName},
   {key:'keeper',label:'Keeper',roll:()=>{const r=pick(ANCESTRIES);return nameFor(r)+", "+r.toLowerCase()+", "+pick(KEEPER_TRAITS)}},
   {key:'menu',label:'On offer',roll:()=>cap(pick(DRINKS))+"; "+pick(FOODS)},
   {key:'vibe',label:'Vibe',roll:()=>cap(pick(VIBES))},
   {key:'crowd',label:'Crowd',roll:()=>cap(pick(CROWDS))},
   {key:'notice',label:'Notice board',roll:()=>cap(pick(NOTICES))}
  ]},
 {id:'shop',name:'Shop',cat:'Places',kw:'store merchant vendor market',desc:'Prices are guidelines. Haggle freely.',
  opts:[{key:'type',label:'Type',values:['Any'].concat(Object.keys(SHOPS))}],
  fields:[
   {key:'type',label:'Type',roll:(v,o)=>o.type==='Any'?pick(Object.keys(SHOPS)):o.type},
   {key:'name',label:'Name',dep:['type'],roll:v=>chance(.5)?pick(FIRST_NAMES)+"'s "+pick(SHOPS[v.type].nouns):"The "+pick(TAVERN_ADJ)+" "+pick(SHOPS[v.type].nouns)},
   {key:'keeper',label:'Keeper',roll:()=>{const r=pick(ANCESTRIES);return nameFor(r)+", "+r.toLowerCase()+", who "+pick(SHOP_QUIRKS)}},
   {key:'stock',label:'In stock',dep:['type'],roll:v=>pickN(SHOPS[v.type].stock,5)},
   {key:'special',label:'Rare find',roll:()=>cap(pick(SHOP_SPECIAL))}
  ]},
 {id:'settlement',name:'Settlement',cat:'Places',kw:'town village city hamlet',
  fields:[
   {key:'name',label:'Name',roll:placeName},
   {key:'size',label:'Size',roll:()=>pick(SIZES)},
   {key:'gov',label:'Ruled by',roll:()=>cap(pick(GOV))},
   {key:'known',label:'Known for',roll:()=>cap(pick(KNOWN_FOR))},
   {key:'landmark',label:'Landmark',roll:()=>cap(pick(S_FEATURE))},
   {key:'trouble',label:'Trouble',roll:()=>cap(pick(S_TROUBLE))},
   {key:'notable',label:'Notable',roll:()=>{const r=pick(ANCESTRIES);return nameFor(r)+", "+r.toLowerCase()+" "+pick(NPC_ROLES).toLowerCase()}}
  ]},
 {id:'room',name:'Dungeon Room',cat:'Places',kw:'dungeon room chamber crypt',
  fields:[
   {key:'shape',label:'Shape',roll:()=>cap(pick(ROOM_SHAPES))+", "+pick(ROOM_SIZES)},
   {key:'feature',label:'Feature',roll:()=>cap(pick(ROOM_FEATURES))},
   {key:'air',label:'Atmosphere',roll:()=>cap(pick(ROOM_ATMOS))},
   {key:'inside',label:'Inside',roll:()=>weighted([
     [()=>"Occupied: "+encText('Dungeon',range(1,4)),30],
     [()=>"Trapped. "+pick(TRAP_TRIGGER).replace(/^./,c=>c.toUpperCase())+" sets it off",15],
     [()=>"Treasure: "+pick(LOOT_UNCOMMON)+", hidden in the room",15],
     [()=>pick(ROOM_PUZZLES),10],
     [()=>pick(ROOM_HAZARDS),10],
     [()=>"Empty, though something passed through recently",20]
   ])()},
   {key:'exits',label:'Exits',roll:()=>pickN(ROOM_EXITS,range(1,3)).map(cap)}
  ]},
 {id:'landmark',name:'Landmark',cat:'Places',kw:'wilderness terrain point of interest',
  opts:[{key:'terrain',label:'Terrain',values:Object.keys(LANDMARKS)}],
  fields:[
   {key:'landmark',label:'Landmark',roll:(v,o)=>cap(pick(LANDMARKS[o.terrain]))},
   {key:'sign',label:'Sign',roll:()=>"Signs of recent activity: "+pick(SIGNS)},
   {key:'find',label:'Discovery',roll:()=>cap(pick(FINDS))}
  ]},
 {id:'weather',name:'Weather',cat:'Places',kw:'weather season storm temperature',
  opts:[{key:'season',label:'Season',values:Object.keys(SEASON_BASE)},{key:'climate',label:'Climate',values:Object.keys(CLIMATE_OFF)}],
  fields:[
   {key:'temp',label:'Temperature',roll:(v,o)=>TEMPS[Math.max(0,Math.min(7,SEASON_BASE[o.season]+CLIMATE_OFF[o.climate]+range(-1,1)))]},
   {key:'sky',label:'Sky',dep:['temp'],roll:(v,o)=>{
     const i=TEMPS.indexOf(v.temp);
     let pool=i<=1?SKY_COLD:i>=6?SKY_HOT:SKY_MILD;
     if(o.climate==='Arid')pool=pool.concat(["clear and dry","clear and dry","clear and dry"]);
     if(o.climate==='Tropical'&&i>=3)pool=pool.concat(["a warm downpour","a humid, heavy rain"]);
     return cap(pick(pool));
   }},
   {key:'wind',label:'Wind',roll:()=>WINDS[weighted([[0,3],[1,4],[2,3],[3,2],[4,1]])]},
   {key:'effect',label:'Effect',dep:['temp','sky'],roll:v=>weatherEffect(v.temp,v.sky)}
  ]},
 /* ---- Items ---- */
 {id:'loot',name:'Loot',cat:'Items',kw:'treasure hoard gold coins gems',
  opts:[{key:'tier',label:'Tier',values:['Minor (levels 1-4)','Moderate (levels 5-10)','Major (levels 11+)']}],
  fields:[
   {key:'coins',label:'Coins',roll:(v,o)=>{
     const ti=tierIdx(o),gp=[range(8,60),range(80,450),range(600,3500)][ti],sp=[range(10,120),range(0,300),0][ti];
     return [sp?fmt(sp)+" sp":null,fmt(gp)+" gp",ti===2?range(2,40)+" pp":null].filter(Boolean).join(", ");
   }},
   {key:'gems',label:'Gems',roll:(v,o)=>{
     const ti=tierIdx(o);
     if(ti===0&&chance(.55))return "None";
     return range(1,[3,4,5][ti])+" × "+pick(GEMS)+" (about "+[10,50,500][ti]+" gp each)";
   }},
   {key:'items',label:'Items',roll:(v,o)=>{
     const ti=tierIdx(o),n=[2,3,4][ti],out=[];let guard=0;
     while(out.length<n&&guard++<30){const it=lootItem(ti);if(out.indexOf(it)<0)out.push(it)}
     return out.map(cap);
   }}
  ]},
 {id:'magicitem',name:'Magic Item',cat:'Items',kw:'magic item artifact wondrous ring wand',desc:'Effects are suggestions. Tune to your table.',
  opts:[{key:'rarity',label:'Rarity',values:['Common','Uncommon','Rare','Very rare'],def:'Uncommon'}],
  fields:[
   {key:'name',label:'Name',dep:['form'],roll:v=>{const t=v.form.split(' ').pop();return cap(t)+" of "+pick(CONCEPTS)}},
   {key:'form',label:'Form',roll:()=>cap(pick(MATERIALS))+" "+pick(ITEM_TYPES)},
   {key:'effect',label:'Effect',roll:(v,o)=>pick(ITEM_EFFECTS[o.rarity])},
   {key:'catch',label:'The catch',roll:()=>cap(pick(ITEM_CATCHES))},
   {key:'history',label:'History',roll:()=>cap(pick(ITEM_HISTORY))}
  ]},
 {id:'potion',name:'Potion',cat:'Items',kw:'potion elixir drink brew',
  fields:[
   {key:'look',label:'Appearance',roll:()=>cap(pick(POTION_COLOR))+" liquid "+pick(POTION_DETAIL)},
   {key:'taste',label:'Taste',roll:()=>cap(pick(POTION_TASTE))},
   {key:'effect',label:'Effect',roll:()=>cap(pick(POTION_EFFECT))},
   {key:'side',label:'Side effect',roll:()=>cap(pick(POTION_SIDE))}
  ]},
 {id:'trinket',name:'Trinkets',cat:'Items',kw:'trinket junk pocket curio',
  fields:[{key:'list',label:'Pockets hold',roll:()=>pickN(TRINKETS,3).map(cap)}]},
 {id:'book',name:'Book',cat:'Items',kw:'book tome scroll library',
  fields:[
   {key:'title',label:'Title',roll:()=>pick([
     ()=>"A Treatise on "+cap(pick(BOOK_SUBJ)),
     ()=>"The "+pick(BOOK_ADJ)+" "+pick(BOOK_NOUN),
     ()=>cap(pick(BOOK_SUBJ))+": A Practical Guide",
     ()=>"Collected Letters of "+randomName()
   ])()},
   {key:'author',label:'Author',roll:()=>randomName()+", "+pick(AUTHOR_DESC)},
   {key:'cond',label:'Condition',roll:()=>cap(pick(BOOK_COND))},
   {key:'content',label:'Contents',roll:()=>cap(pick(BOOK_CONTENT))},
   {key:'secret',label:'Hidden',roll:()=>cap(pick(BOOK_SECRET))}
  ]},
 /* ---- Danger ---- */
 {id:'encounter',name:'Encounter',cat:'Danger',kw:'monster fight combat enemies',desc:'Threat sets group size only. Tune to your party.',
  opts:[{key:'env',label:'Environment',values:Object.keys(ENC)},{key:'threat',label:'Threat',values:['Easy','Medium','Hard'],def:'Medium'}],
  fields:[
   {key:'foes',label:'Foes',roll:(v,o)=>{const n=o.threat==='Easy'?range(1,2):o.threat==='Hard'?range(4,6):range(2,4);return encText(o.env,n)}},
   {key:'doing',label:'Doing',roll:()=>cap(pick(ENC_DOING))},
   {key:'terrain',label:'Terrain',roll:()=>cap(pick(ENC_TERRAIN))},
   {key:'wild',label:'Wildcard',roll:()=>cap(pick(ENC_WILD))}
  ]},
 {id:'trap',name:'Trap',cat:'Danger',kw:'trap hazard dungeon trigger',desc:'DCs and damage follow common 5e severity bands.',
  opts:[{key:'sev',label:'Severity',values:Object.keys(SEV)}],
  fields:[
   {key:'trigger',label:'Trigger',roll:()=>cap(pick(TRAP_TRIGGER))},
   {key:'dc',label:'DC',roll:(v,o)=>String(range(SEV[o.sev].dc[0],SEV[o.sev].dc[1]))},
   {key:'effect',label:'Effect',dep:['dc'],roll:(v,o)=>pick(TRAP_EFFECT).replace('{dc}',v.dc).replace('{dmg}',SEV[o.sev].dmg)},
   {key:'clue',label:'Clue',dep:['dc'],roll:v=>cap(pick(TRAP_CLUE))+" (DC "+v.dc+" to notice)"},
   {key:'disarm',label:'Disarm',dep:['dc'],roll:v=>cap(pick(TRAP_DISARM))+" (DC "+v.dc+")"}
  ]},
 {id:'travel',name:'Travel Event',cat:'Danger',kw:'travel road journey wilderness event',
  fields:[
   {key:'event',label:'Event',roll:()=>pick(TRAVEL_EVENTS)},
   {key:'cost',label:'Cost',roll:()=>cap(pick(TRAVEL_COSTS))},
   {key:'boon',label:'Upside',roll:()=>cap(pick(TRAVEL_BOONS))}
  ]},
 /* ---- Story ---- */
 {id:'hook',name:'Plot Hook',cat:'Story',kw:'hook adventure idea seed',
  fields:[
   {key:'hook',label:'Hook',roll:()=>fill(pick(HOOK_TEMPLATES))},
   {key:'stakes',label:'At stake',roll:()=>cap(pick(STAKES))},
   {key:'twist',label:'Twist',roll:()=>cap(pick(TWISTS))}
  ]},
 {id:'quest',name:'Quest',cat:'Story',kw:'quest job mission contract',
  fields:[
   {key:'giver',label:'Giver',roll:()=>{const r=pick(ANCESTRIES);return nameFor(r)+", "+r.toLowerCase()+" "+pick(NPC_ROLES).toLowerCase()}},
   {key:'goal',label:'Goal',roll:()=>fill(pick(QUEST_GOALS))},
   {key:'reward',label:'Reward',roll:()=>cap(pick(REWARDS))},
   {key:'deadline',label:'Deadline',roll:()=>cap(pick(DEADLINES))},
   {key:'complication',label:'Complication',roll:()=>pick(COMPLICATIONS)}
  ]},
 {id:'rumors',name:'Rumors',cat:'Story',kw:'rumor gossip news tavern talk',desc:'Truth is shown in brackets, for your eyes only.',
  fields:[{key:'list',label:'Overheard',roll:()=>Array.from({length:4},()=>fill(pick(RUMORS))+" ["+(chance(.55)?"true":"false")+"]")}]},
 {id:'twist',name:'Complication',cat:'Story',kw:'twist complication problem surprise',
  fields:[
   {key:'comp',label:'Complication',roll:()=>pick(COMPLICATIONS)},
   {key:'esc',label:'If ignored',roll:()=>cap(pick(ESCALATIONS))}
  ]},
 {id:'omen',name:'Omen & Prophecy',cat:'Story',kw:'omen prophecy fate portent',
  fields:[
   {key:'omen',label:'Omen',roll:()=>pick(OMENS)},
   {key:'meaning',label:'Means',roll:()=>"Heralds "+pick(OMEN_MEANINGS)},
   {key:'prophecy',label:'Prophecy',roll:()=>{
     const a=pick(P_A),vb=pick(P_V),b=pick(P_B),c=pick(P_C),w=pick(P_W);
     return chance(.5)?"When "+a+" "+vb+" "+b+", "+c+" shall "+w+".":cap(c)+" will "+w+", but only after "+a+" "+vb+" "+b+".";
   }}
  ]},
 {id:'riddle',name:'Riddle',cat:'Story',kw:'riddle puzzle sphinx',
  fields:[
   {key:'riddle',label:'Riddle',roll:()=>pick(RIDDLES).q},
   {key:'answer',label:'Answer',dep:['riddle'],hidden:true,roll:v=>RIDDLES.find(r=>r.q===v.riddle).a}
  ]},
 {id:'festival',name:'Festival',cat:'Story',kw:'festival event celebration holiday fair',
  fields:[
   {key:'name',label:'Name',roll:()=>pick(FEST_NAMES)},
   {key:'doing',label:'Highlights',roll:()=>pickN(FEST_ACTIVITIES,3).map(cap)},
   {key:'tradition',label:'Tradition',roll:()=>cap(pick(FEST_TRADITION))},
   {key:'trouble',label:'Trouble',roll:()=>cap(pick(FEST_TROUBLE))}
  ]},
];

/* ---- items and shops: the richer generators (see items.js) replace the simple ones above, in the same place ---- */
const ITEM_GENS=[
 {id:'shop',name:'Shop',cat:'Places',kw:'store merchant vendor market smith apothecary stables jeweler tailor armorer weaponsmith pawn fence',desc:'Prices follow the 5e equipment list, scaled by settlement. Haggle freely.',
  opts:[{key:'type',label:'Type',values:['Any'].concat(IT.SHOP_TYPES)},{key:'size',label:'Settlement',values:IT.SHOP_SIZES,def:'Town'},{key:'prices',label:'Prices',values:IT.SHOP_PRICES}],
  fields:[
   {key:'type',label:'Type',roll:(v,o)=>o.type==='Any'?pick(IT.SHOP_TYPES):o.type},
   {key:'name',label:'Name',dep:['type'],roll:v=>IT.shopName(v.type)},
   {key:'keeper',label:'Keeper',roll:()=>{const r=pick(ANCESTRIES);return nameFor(r)+", "+r.toLowerCase()+", who "+pick(IT.MANNER)+" and "+pick(IT.QUIRKS)}},
   {key:'first',label:'First impression',dep:['type'],roll:v=>pick(IT.SOUNDS)+". "+pick(IT.SIGHTS)+". The air smells of "+IT.shopAir(v.type)+"."},
   {key:'where',label:'Where and when',roll:()=>"Found "+pick(IT.PLACES)+". "+pick(IT.HOURS)},
   {key:'stock',label:'In stock',dep:['type'],roll:(v,o)=>IT.shopStock(v.type,o.size,o.prices)},
   {key:'magic',label:'Magic wares',dep:['type'],roll:(v,o)=>{const m=IT.shopMagic(v.type,o.size);return m.length?m:"Nothing magical on the shelves"}},
   {key:'special',label:'Rare find',roll:()=>pick(IT.RARE_FINDS)},
   {key:'buys',label:'Will buy',dep:['type'],roll:v=>{const b=IT.shopBuys(v.type);return cap(b)+(/third|half/.test(b)?'.':', at about half what it sells for.')}},
   {key:'haggle',label:'Haggling',roll:()=>pick(IT.HAGGLE).replace('{dc}',range(11,16))},
   {key:'rep',label:'Reputation',roll:()=>cap(pick(IT.REPUTATION))+"."},
   {key:'want',label:'What the keeper wants',roll:()=>"The keeper "+pick(IT.WANTS)+"."},
   {key:'secret',label:'Secret',roll:()=>"The keeper "+pick(IT.SECRETS)+"."}
  ]},
 {id:'magicitem',name:'Magic Item',cat:'Items',kw:'magic item artifact wondrous ring wand staff weapon armor curse rarity',desc:'Rarity and value follow the DMG. Effects are suggestions: tune them to your table.',
  opts:[{key:'rarity',label:'Rarity',values:IT.RARITIES,def:'Uncommon'},{key:'kind',label:'Kind',values:['Any','Weapon','Armor','Ring','Wand','Staff','Wondrous item']},{key:'curse',label:'Curse',values:['Sometimes','Never','Always']}],
  fields:[
   {key:'name',label:'Name',dep:['type'],roll:v=>{const t=IT.parseType(v.type);return IT.itemName(t.kind,t.base,t.rarity)}},
   {key:'type',label:'Type',roll:(v,o)=>{const k=IT.rollKind(o.kind),base=IT.rollBase(k);return IT.typeLine({kind:k,base,rarity:o.rarity,attune:IT.rollAttune(o.rarity)})}},
   {key:'form',label:'Appearance',dep:['type'],roll:v=>{const t=IT.parseType(v.type);return IT.itemForm(t.kind,t.base)}},
   {key:'effect',label:'What it does',dep:['type'],roll:v=>{const t=IT.parseType(v.type);return IT.rollEffect(t.kind,t.base,t.rarity)}},
   {key:'catch',label:'The catch',dep:['type'],roll:(v,o)=>IT.rollCatch(IT.parseType(v.type).rarity,o.curse)},
   {key:'history',label:'History',roll:()=>IT.rollHistory()},
   {key:'value',label:'Value',dep:['type'],roll:v=>IT.valueText(IT.parseType(v.type).rarity)},
   {key:'hook',label:'Story hook',roll:()=>IT.rollHook()}
  ]},
 {id:'potion',name:'Potion',cat:'Items',kw:'potion elixir drink brew draught healing',desc:'Prices follow the DMG, halved for consumables.',
  opts:[{key:'rarity',label:'Rarity',values:['Common','Uncommon','Rare','Very rare']},{key:'kind',label:'Kind',values:['Any','Healing','Utility','Combat']}],
  fields:[
   {key:'name',label:'Name',roll:(v,o)=>IT.potionNameFor({rarity:o.rarity,kind:o.kind})},
   {key:'look',label:'Appearance',roll:()=>cap(pick(IT.POTION_COLOR))+" liquid "+pick(IT.POTION_DETAIL)},
   {key:'taste',label:'Taste',roll:()=>cap(pick(IT.POTION_TASTE))},
   {key:'effect',label:'Effect',dep:['name'],roll:(v,o)=>IT.potionEffect(v.name,o.rarity)},
   {key:'side',label:'Side effect',roll:()=>chance(.6)?pick(IT.POTION_SIDE):"None that anyone has noticed."},
   {key:'value',label:'Value',roll:(v,o)=>"About "+IT.potionValue(o.rarity)},
   {key:'origin',label:'Origin',roll:()=>pick(IT.BREWERS)},
   {key:'id',label:'Identifying it',roll:(v,o)=>"A detect magic spell, a taste, or a DC "+IT.potionDC(o.rarity)+" Intelligence (Arcana) check reveals what it is."}
  ]},
 {id:'trinket',name:'Trinkets',cat:'Items',kw:'trinket junk pocket curio',
  fields:[
   {key:'list',label:'Pockets hold',roll:()=>pickN(IT.TRINKETS_ALL,3).map(cap)},
   {key:'secret',label:'Look closer',dep:['list'],roll:v=>"The "+v.list[rnd(v.list.length)].replace(/^(A|An)\s/,'').toLowerCase().replace(/[.]$/,'')+": "+pick(IT.TRINKET_SECRETS)+"."}
  ]}
];
ITEM_GENS.forEach(g=>{const i=GENS.findIndex(x=>x.id===g.id);if(i>=0)GENS[i]=g});
/* loot gains art objects and, past the first tier, magic: the existing fields are kept */
{
  const loot=GENS.find(x=>x.id==='loot');
  const items=loot.fields.find(f=>f.key==='items');
  loot.fields.splice(loot.fields.indexOf(items),0,{key:'art',label:'Art',roll:(v,o)=>{const ti=tierIdx(o);return ti===0&&chance(.6)?"None":IT.artObject(ti)}});
  loot.fields.push({key:'magic',label:'Magic',roll:(v,o)=>{const m=IT.lootMagic(tierIdx(o));return m.length?m:"None"}});
}
const GENS_BY_ID={};GENS.forEach(g=>GENS_BY_ID[g.id]=g);
const CATS=['All','People','Places','Items','Danger','Story'];
const CAT_VAR={People:'--c-people',Places:'--c-places',Items:'--c-items',Danger:'--c-danger',Story:'--c-story'};

export const GENERATORS = GENS;
export { pick, rnd, range, chance, cap, fmt, pickN, weighted, nameFor, randomName, placeName, ENC, CATS, CAT_VAR, GENS_BY_ID, ANCESTRIES };

/* ---- your own rows: extra entries for a table, mixed in when it is rolled ----
   The app gives a function that returns the extra rows for "generator/field" (they live in a note in the vault, see core/pools.js).
   Only a field that rolls on its own (it does not depend on another field or on the options) can take extra rows. */
let poolSource = null;
export const setPoolSource = fn => { poolSource = fn; };

const metaCache = new Map();
/* null when a field cannot take extra rows; else { size: about how many different entries it already has, samples, tag } */
export function fieldMeta(g, f) {
  const key = g.id + '/' + f.key;
  if (metaCache.has(key)) return metaCache.get(key);
  let meta = null;
  if (!f.dep && !f.hidden && f.roll.length === 0) {
    const TAG = / \[(true|false)\]$/;
    const seen = new Map();
    let n = 0, tag = false, ok = true;
    for (let i = 0; i < 160 && ok; i++) {
      let v;
      try { v = f.roll(); } catch (e) { ok = false; break; }
      for (const x of (Array.isArray(v) ? v : [v])) {
        if (typeof x !== 'string' || !x) { ok = false; break; }
        const s = x.replace(TAG, '');
        if (s !== x) tag = true;
        seen.set(s, (seen.get(s) || 0) + 1); n++;
      }
    }
    if (ok && seen.size >= 3) {
      // how many different entries there probably are: the number seen, corrected for the ones not met yet
      const u = seen.size;
      let size = u;
      if (u > n * 0.9) size = 80;        // built from templates: nearly every roll is different, so give your rows a fair share anyway
      else { let lo = u, hi = 1e6; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (m * (1 - Math.exp(-n / m)) < u) lo = m; else hi = m; } size = Math.round(hi); }
      meta = { size: Math.min(size, 80), tag, samples: [...seen.keys()].slice(0, 8) };
    }
  }
  metaCache.set(key, meta);
  return meta;
}

function rollField(g, f, st) {
  const base = f.roll(st.vals, st.opts);
  const rows = poolSource && !f.dep && !f.hidden && f.roll.length === 0 ? poolSource(g.id + '/' + f.key) : null;
  const meta = rows && rows.length ? fieldMeta(g, f) : null;
  if (!meta) return metricize(base);
  const p = Math.min(0.7, rows.length / (rows.length + meta.size));
  const row = () => { const r = pick(rows); return meta.tag ? r + ' [' + (chance(0.55) ? 'true' : 'false') + ']' : r; };
  if (Array.isArray(base)) {
    const out = [];
    for (const x of base) { let c = chance(p) ? row() : x; if (out.includes(c)) c = x; out.push(c); }
    return metricize(out);
  }
  return metricize(chance(p) ? row() : base);
}

/* ---- engine: one state object per generator card ---- */
export function newGenState(g) {
  const st = { opts: {}, vals: {}, locks: {}, revealed: {} };
  (g.opts || []).forEach(o => { st.opts[o.key] = o.def || o.values[0]; });
  rollAll(g, st);
  return st;
}
export function rollAll(g, st) {
  const done = new Set();
  let guard = 0;
  while (done.size < g.fields.length && guard++ < 10) {
    for (const f of g.fields) {
      if (done.has(f.key)) continue;
      if ((f.dep || []).every(d => done.has(d))) {
        if (!(st.locks[f.key] && st.vals[f.key] !== undefined)) st.vals[f.key] = rollField(g, f, st);
        done.add(f.key);
      }
    }
  }
  st.revealed = {};
}
export function rerollField(g, st, key) {
  const f = g.fields.find(x => x.key === key);
  st.vals[key] = rollField(g, f, st);
  const q = [key];
  while (q.length) {
    const k = q.shift();
    for (const d of g.fields) {
      if ((d.dep || []).indexOf(k) >= 0 && !st.locks[d.key]) { st.vals[d.key] = rollField(g, d, st); q.push(d.key); }
    }
  }
  st.revealed = {};
}
