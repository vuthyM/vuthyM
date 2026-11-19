/* Fixed data for the Character Library: the pieces the SRD does not spell out (the four SRD backgrounds, skills, the details sections and
   the "suggest" tables) and the loader for the SRD pack (classes, species, feats, armour, weapons), unpacked the first time it is needed.

   This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
   https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License,
   available at https://creativecommons.org/licenses/by/4.0/legalcode. */
import { CHARS_GZ_B64 } from '../data/srd-chars.js';

export const LIB_FOLDER = 'Character Library';
export const CHAR_FOLDER = 'Character Library/Characters';
export const EXAMPLE_FOLDER = 'Character Library/Examples';     // the sample campaign's example characters, kept apart from yours

export const AB = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
export const ABN = { Str: 'Strength', Dex: 'Dexterity', Con: 'Constitution', Int: 'Intelligence', Wis: 'Wisdom', Cha: 'Charisma' };
export const SKILLS = { Acrobatics: 'Dex', 'Animal Handling': 'Wis', Arcana: 'Int', Athletics: 'Str', Deception: 'Cha', History: 'Int', Insight: 'Wis', Intimidation: 'Cha', Investigation: 'Int', Medicine: 'Wis', Nature: 'Int', Perception: 'Wis', Performance: 'Cha', Persuasion: 'Cha', Religion: 'Int', 'Sleight of Hand': 'Dex', Stealth: 'Dex', Survival: 'Wis' };
export const SKILL_LIST = Object.keys(SKILLS);
export const ALIGNMENTS = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned'];
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUDGET = 27;

/* the four SRD 5.2.1 backgrounds. The SRD pack does not carry their details, so these are written here: check them against your book. */
export const BACKGROUNDS = {
  Acolyte: { ab: ['Int', 'Wis', 'Cha'], skills: ['Insight', 'Religion'], feat: 'Magic Initiate (Cleric)', tool: "Calligrapher's Supplies" },
  Criminal: { ab: ['Dex', 'Con', 'Int'], skills: ['Sleight of Hand', 'Stealth'], feat: 'Alert', tool: "Thieves' Tools" },
  Sage: { ab: ['Con', 'Int', 'Wis'], skills: ['Arcana', 'History'], feat: 'Magic Initiate (Wizard)', tool: "Calligrapher's Supplies" },
  Soldier: { ab: ['Str', 'Dex', 'Con'], skills: ['Athletics', 'Intimidation'], feat: 'Savage Attacker', tool: 'One gaming set' },
};

/* ---------- the details step: sections, fields and the suggestion tables ---------- */
export const PROMPTS={
 trait:['I always have a plan for what to do when things go wrong.','I am slow to trust, quick to forgive.','I quote proverbs I half remember.','I collect small, useless souvenirs.','I am unfailingly polite, even to people I plan to rob.','I speak to animals as if they were people.','I hum when I am nervous, and I am always nervous.','I judge people by how they treat waiters and ferrymen.','I turn everything into a bet.','I cannot sit still through a long silence.','I take notes on everything, including conversations.','I am relentlessly cheerful, which unsettles people.'],
 ideal:['Freedom: chains are meant to be broken.','Duty: someone has to hold the line.','Knowledge: the world is a puzzle to be solved.','Community: we rise or fall together.','Redemption: nobody is beyond a second chance.','Power: the strong are meant to protect the weak.','Tradition: the old ways exist for good reasons.','Greed: coin is the only honest language.','Honour: my word is my bond.','Mercy: I never take a life I can spare.','Change: nothing should stay the way it is.','Faith: something larger than us is watching.'],
 bond:['I owe my life to someone I can never repay.','My family\'s honour depends on what I do next.','I will find whoever burned my home.','A stranger gave me a gift, and I intend to earn it.','I carry a letter I have never been able to deliver.','My old master vanished and I want to know why.','I protect a younger sibling who does not know what I am.','I swore an oath at a graveside and I mean to keep it.','My hometown is gone and I am its last memory.','I am searching for the person who taught me everything and then left.','I owe a favour to someone dangerous.','My mentor\'s last words still bother me.'],
 flaw:['I cannot resist a locked door.','I hold a grudge for far too long.','I lie when the truth would do.','I trust people who flatter me.','I would rather run than ask for help.','I drink more than I admit.','I cannot leave a mystery alone, even a dangerous one.','I bargain with things I should not.','I am proud, and I will not apologise first.','I cannot keep a secret for more than a day.','I take on debts I cannot pay.','I assume the worst of strangers.'],
 fears:['Being forgotten.','Deep water.','Becoming what my enemy was.','Fire, still.','Being locked in a small room.','Letting my friends down when it counts.','Dying without a name.','Silence at night.','Being ordinary.','Going back to where I started.'],
 quirks:['Knocks twice on every door before opening it.','Never sits with their back to a door.','Names every weapon they own.','Cannot pass a stray cat without feeding it.','Whistles old tunes when thinking.','Keeps a tally of favours owed on their forearm.','Sleeps with one boot on.','Always carries a spare candle.','Reads the last page of a book first.','Refuses to eat anything blue.'],
 goal:['Find out what happened to my old master.','Earn enough to buy back the family farm.','Clear my name.','Reach the top of the guild.','Get to the bottom of a rumour that will not die.','Find a cure for a curse.','Finish a spell that has taken years.','Be somewhere that feels like home.','Prove a rival wrong.','Atone for something I never talk about.'],
 voice:['Quiet and precise, speeds up when excited.','Low and gravelly, with long pauses.','Bright, quick and a little too loud.','Soft-spoken, with a heavy northern lilt.','Formal, as if reading from a script.','Warm, unhurried, with a laugh behind every sentence.','Clipped, military, no wasted words.','Sing-song, with odd rhymes.'],
 manner:['Fidgets with a ring while thinking.','Taps two fingers on the table when impatient.','Looks over their shoulder before answering.','Bows slightly when introduced.','Rubs the back of their neck when lying.','Laughs a beat too late.','Stands very close when talking.','Never uses contractions.']
};
export const DSEC=[
 {id:'basics',t:'Basics',h:'The facts at a glance',f:[
  {k:'align',l:'Alignment',type:'align',lv:1},
  {k:'player',l:'Player',lv:1,kind:'pc'},{k:'role',l:'Role in your world',lv:1,kind:'npc',ph:'Innkeeper, rival, quest-giver'},
  {k:'concept',l:'One-line concept',lv:1,ph:'The disgraced knight who…'},
  {k:'age',l:'Age',lv:2},{k:'pron',l:'Pronouns',lv:2},{k:'height',l:'Height (cm)',lv:2},{k:'weight',l:'Weight (kg)',lv:2},{k:'eyes',l:'Eyes',lv:2},{k:'hair',l:'Hair',lv:2},{k:'skin',l:'Skin',lv:2},{k:'langs',l:'Languages',lv:2},{k:'faith',l:'Faith or deity',lv:2}]},
 {id:'look',t:'Appearance and voice',h:'What people notice first',f:[
  {k:'look',l:'Appearance',type:'area',lv:1},{k:'marks',l:'Scars, tattoos, marks',lv:2},{k:'clothes',l:'How they dress',lv:2},{k:'voice',roll:1,l:'Voice',lv:1},{k:'manner',roll:1,l:'Mannerisms and habits',lv:2}]},
 {id:'pers',t:'Personality',h:'The four classic prompts, plus more',f:[
  {k:'trait',l:'Personality trait',type:'area',lv:1,roll:1},{k:'ideal',l:'Ideal',type:'area',lv:1,roll:1},{k:'bond',l:'Bond',type:'area',lv:1,roll:1},{k:'flaw',l:'Flaw',type:'area',lv:1,roll:1},
  {k:'fears',roll:1,l:'Fears',lv:2},{k:'quirks',roll:1,l:'Quirks',lv:2},{k:'goal',roll:1,l:'What they want right now',lv:2}]},
 {id:'back',t:'Backstory',h:'Guided questions, or just write it all out',f:[
  {k:'grew',l:'Where did they grow up?',type:'area',lv:1},{k:'family',l:'Who is their family?',type:'area',lv:2},{k:'why',l:'Why did they take up this life?',type:'area',lv:1},{k:'moment',l:'What event changed them?',type:'area',lv:2},{k:'left',l:'What did they leave behind?',type:'area',lv:2},{k:'secret',l:'What do they hide?',type:'area',lv:2},{k:'story',l:'Full backstory (free text)',type:'area',lv:1,tall:1}]},
 {id:'rel',t:'Relationships',h:'People, factions, and ties to the rest of the party',f:[
  {k:'allies',l:'Allies and friends',type:'area',lv:1,ph:'Link notes: [[Old Haldor]]'},{k:'rivals',l:'Rivals and enemies',type:'area',lv:1},{k:'faction',l:'Faction, patron or organisation',lv:2},{k:'party',l:'Ties to the other PCs',type:'area',lv:2,kind:'pc',ph:'Good for session zero: why does this character trust the party?'}]},
 {id:'fam',t:'Family tree',h:'Who they come from, and who comes after',f:[
  {k:'parents',l:'Parents and guardians',type:'area',lv:1},{k:'siblings',l:'Siblings',type:'area',lv:1},{k:'partner',l:'Partner or spouse',lv:2},{k:'kids',l:'Children',lv:2},{k:'ancestors',l:'Grandparents, ancestors, bloodline',type:'area',lv:2},{k:'tree',l:'Family tree (free text, one line per person)',type:'area',lv:2,tall:1,ph:'Orrin Brightwater (grandfather, wizard)\n  └ Maelis (mother, cartographer)\n      └ Thessaly'}]},
 {id:'time',t:'Timeline',h:'Life events in order',f:[
  {k:'timeline',l:'Timeline of life events',type:'area',lv:1,tall:1,ph:'Age 6: Found the library under the old mill\nAge 19: Apprenticed to Orrin\nAge 60: Orrin disappears\n1 year ago: Joined the party'},{k:'turning',l:'Turning points',type:'area',lv:2},{k:'present',l:'What has happened lately',type:'area',lv:2}]},
 {id:'pcties',t:'Bonds with the other PCs',kind:'pc',h:'Good for session zero',f:[
  {k:'met',l:'How we met',type:'area',lv:1},{k:'admire',l:'What I admire about them',type:'area',lv:2},{k:'annoys',l:'What annoys me about them',type:'area',lv:2},{k:'hidefrom',l:'What I keep from them',type:'area',lv:2}]},
 {id:'hooks',t:'Hooks for your DM',kind:'pc',h:'What you want to see in the story',f:[
  {k:'hooks',l:'Story hooks I would love',type:'area',lv:1},{k:'threads',l:'Unfinished business',type:'area',lv:2},{k:'never',l:'What my character would never do',type:'area',lv:2},{k:'lines',l:'Lines and veils (topics to avoid or fade out)',type:'area',lv:2}]},
 {id:'run',t:'Running this NPC',kind:'npc',h:'Tools for you at the table',f:[
  {k:'wants',l:'What they want',type:'area',lv:1},{k:'knows',l:'What they know',type:'area',lv:1},{k:'nsecret',l:'Their secret',type:'area',lv:2},{k:'talk',l:'How to play them (voice, tics)',type:'area',lv:2},{k:'where',l:'Where to find them',lv:2},{k:'react',l:'How they react if the party…',type:'area',lv:2}]},
 {id:'notes',t:'Notes',h:'Anything else',f:[{k:'notes',l:'Notes',type:'area',lv:1,tall:1}]}
];
export const DEPTH={quick:['basics'],std:['basics','look','pers'],deep:['basics','look','pers','back','fam','time','rel','pcties','hooks','run','notes']};

export const secFor = kind => DSEC.filter(x => !x.kind || x.kind === kind);
export const fieldsFor = (kind, sec) => sec.f.filter(f => !f.kind || f.kind === kind);
/* every details field, by key (the keys are unique across sections) */
export const DETAIL_KEYS = DSEC.flatMap(x => x.f.map(f => f.k));
export const RESERVED_HEADINGS = ['Features', 'Level choices', 'Magic items', 'Spells', 'Equipment', 'Proficiencies', 'Class resources', ...DSEC.map(x => x.t)];

/* ---------- the SRD pack ---------- */
let data = null, loading = null;
export const charsLoaded = () => data;
export function loadChars() {
  if (data) return Promise.resolve(data);
  if (!loading) {
    loading = (async () => {
      const bin = atob(CHARS_GZ_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      data = JSON.parse(text);
      return data;
    })().catch(e => { loading = null; throw e; });
  }
  return loading;
}
