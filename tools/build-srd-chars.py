#!/usr/bin/env python3
"""Builds src/data/srd-chars.js (classes, species, feats, armour, weapons) from the Open5e data for the System Reference Document 5.2.1 (CC-BY 4.0).

Usage:  python3 tools/build-srd-chars.py DIR
DIR holds CharacterClass.json, ClassFeature.json, ClassFeatureItem.json, Species.json, SpeciesTrait.json, Feat.json, Armor.json, Weapon.json
(from https://github.com/open5e/open5e-api/tree/staging/data/v2/wizards-of-the-coast/srd-2024, saved as chk_<name>.json or <name>.json).

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/legalcode.
"""
import base64, collections, gzip, json, os, re, sys

src = sys.argv[1] if len(sys.argv) > 1 else '.'

def load(name):
    for n in ('chk_' + name + '.json', name + '.json'):
        p = os.path.join(src, n)
        if os.path.exists(p):
            return json.load(open(p, encoding='utf-8'))
    raise SystemExit('missing ' + name + '.json')

classes_raw, feats_raw, items_raw = load('CharacterClass'), load('ClassFeature'), load('ClassFeatureItem')
species_raw, traits_raw, feat_raw = load('Species'), load('SpeciesTrait'), load('Feat')
armor_raw, weapon_raw = load('Armor'), load('Weapon')

SKILLS = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival']
squash = lambda s: re.sub(r'[^a-z]', '', s.lower())
SK = {squash(s): s for s in SKILLS}

# the source text has stray spaces inside some words ("Na ture", "Ar rows"): mend the ones that join up to a word seen elsewhere
corpus = ' '.join(f['fields']['desc'] for f in feats_raw) + ' ' + ' '.join(t['fields']['desc'] for t in traits_raw)
vocab = collections.Counter(re.findall(r"[A-Za-z']+", corpus.lower()))
FIXES = {}
def mend(text):
    def rep(m):
        a, b = m.group(1), m.group(2)
        j = (a + b).lower()
        if vocab[j] >= 1 and (vocab[a.lower()] <= 2 or vocab[b.lower()] <= 2) and len(j) >= 5 and a.lower() not in ('a', 'an', 'the', 'to', 'of', 'in', 'on'):
            FIXES[a + ' ' + b] = a + b
            return a + b
        return m.group(0)
    return re.sub(r"\b([A-Za-z]{1,6}) ([a-z]{2,6})\b", rep, text)
NAMEFIX = {'Studdied': 'Studied', 'Unarmoed': 'Unarmored'}
KNOWN = {'Ar cane': 'Arcane', 'Ar rows': 'Arrows', 'Na ture': 'Nature', 'In sight': 'Insight', 'Ar mor': 'Armor', 'Ar row': 'Arrow', 'Ar tisan': 'Artisan'}
def clean(text):
    t = text
    for k, v in NAMEFIX.items():
        t = t.replace(k, v)
    for k, v in KNOWN.items():
        t = t.replace(k, v)
    return t

def num(v):
    try:
        return int(v)
    except Exception:
        return v

name_of = {c['pk']: c['fields']['name'] for c in classes_raw}
feat_by = {f['pk']: f['fields'] for f in feats_raw}
levels = collections.defaultdict(list)
cols = collections.defaultdict(dict)
for it in items_raw:
    f = it['fields']
    if f['column_value'] is None:
        levels[f['parent']].append(f['level'])
    else:
        cols[f['parent']][f['level']] = f['column_value']

def series(pk, n=20):
    d = cols.get(pk, {})
    out, last = [], None
    for lv in range(1, n + 1):
        if lv in d:
            last = d[lv]
        out.append(num(last) if last is not None else None)
    return out

TABLE_SKIP = re.compile(r'(proficiency-bonus|^cantrips$|prepared-spells|slots-|spell-slots|slot-level|pact)')
out = {'classes': {}, 'species': {}, 'feats': [], 'armor': [], 'weapons': []}

def feature_list(parent_pk):
    res = []
    for pk, f in feat_by.items():
        if f['parent'] != parent_pk:
            continue
        slug = pk.split('_')[-1]
        if slug in ('core-traits',) or pk not in levels or not f['desc'].strip():
            continue
        if re.search(r'spell-list$', slug):
            continue
        for lv in sorted(set(levels[pk])):
            res.append([lv, clean(f['name']), clean(f['desc'].strip())])
    res.sort(key=lambda r: (r[0], r[1]))
    return res

for c in classes_raw:
    f = c['fields']
    if f['subclass_of']:
        continue
    cname = f['name']
    slug = c['pk'].split('_', 1)[1]
    core = feat_by.get('srd-2024_%s_core-traits' % slug, {}).get('desc', '')
    rows = {}
    for line in core.split('\n'):
        m = re.match(r'\|([^|]+)\|(.*)\|$', line)
        if m and m.group(1).strip():
            rows[m.group(1).strip()] = clean(m.group(2).strip())
    skills = rows.get('Skill Proficiencies', '')
    sk_n, sk_opt = 2, []
    m = re.search(r'Choose (?:any )?(\d+)', skills)
    if m:
        sk_n = int(m.group(1))
    if 'any' in skills.lower() and ':' not in skills:
        sk_opt = list(SKILLS)
    else:
        rest = skills.split(':', 1)[1] if ':' in skills else ''
        for part in re.split(r',|\bor\b', rest):
            k = squash(part)
            if k in SK:
                sk_opt.append(SK[k])
    eq = rows.get('Starting Equipment', '')
    kits = []
    for m in re.finditer(r'\(([A-C])\)\s*(.+?)(?=;\s*(?:or\s*)?\([A-C]\)|$)', eq):
        text = re.sub(r'^or\s+', '', m.group(2)).strip().rstrip('.;')
        gp = re.search(r'(?:,\s*and|\band|,)\s*(\d+)\s*GP$', text) or re.search(r'^(\d+)\s*GP$', text)
        items = []
        gold = 0
        for part in re.split(r',\s*(?:and\s+)?|\s+and\s+(?=\d+\s*GP)', text):
            part = part.strip()
            g = re.match(r'^(\d+)\s*GP$', part)
            if g:
                gold = int(g.group(1))
            elif part:
                items.append(part)
        kits.append({'id': m.group(1), 'items': items, 'gp': gold})
    caster = f['caster_type'] if f['caster_type'] != 'NONE' else ''
    sc_ab = ''
    sc = feat_by.get('srd-2024_%s_spellcasting' % slug) or feat_by.get('srd-2024_%s_pact-magic' % slug)
    if sc:
        m = re.search(r'(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+is\s+your\s+spellcasting\s+ability', sc['desc'])
        if m:
            sc_ab = m.group(1)[:3]
    table = {'prof': series('srd-2024_%s_proficiency-bonus' % slug)}
    for key in ('cantrips', 'prepared-spells', 'spell-slots', 'slot-level'):
        s = series('srd-2024_%s_%s' % (slug, key))
        if any(x is not None for x in s):
            table[key] = s
    slots = []
    for lv in range(1, 10):
        ordn = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][lv - 1]
        s = series('srd-2024_%s_slots-%s' % (slug, ordn))
        if any(x is not None for x in s):
            slots.append([num(x) if x is not None else 0 for x in s])
    if slots:
        table['slots'] = slots
    other = []
    for pk in cols:
        if pk.startswith('srd-2024_%s_' % slug) and not TABLE_SKIP.search(pk.split('_', 2)[2]):
            fn = feat_by.get(pk)
            if fn:
                if fn['name'] != 'Cantrips Known':
                    other.append([clean(fn['name']), series(pk)])
    other.sort(key=lambda r: r[0])
    subs = {}
    for s in classes_raw:
        if s['fields']['subclass_of'] == c['pk']:
            subs[s['fields']['name']] = feature_list('srd-2024_' + s['pk'].split('_', 1)[1])
    primary = rows.get('Primary Ability', '')
    out['classes'][cname] = {
        'hd': int(re.search(r'\d+', f['hit_dice'])[0]), 'saves': sorted(x[:3].title() for x in f['saving_throws']),
        'primary': primary, 'skillN': sk_n, 'skills': sk_opt, 'weapons': rows.get('Weapon Proficiencies', ''), 'armor': rows.get('Armor Training', ''),
        'tools': rows.get('Tool Proficiencies', ''), 'kits': kits, 'caster': caster, 'ab': sc_ab,
        'table': table, 'other': other, 'features': feature_list(c['pk']), 'subs': subs,
    }

tr = collections.defaultdict(list)
for t in sorted(traits_raw, key=lambda x: (x['fields']['parent'], x['fields']['order'])):
    tr[t['fields']['parent']].append(t['fields'])
for s in species_raw:
    f = s['fields']
    if f['subspecies_of']:
        continue
    size, speed, traits = '', '', []
    for t in tr[s['pk']]:
        if t['type'] == 'SIZE':
            size = t['desc'].strip()
        elif t['type'] == 'SPEED':
            speed = t['desc'].strip()
        else:
            traits.append([t['name'], clean(t['desc'].strip())])
    out['species'][f['name']] = {'size': size, 'speed': speed, 'traits': traits}

for f in feat_raw:
    x = f['fields']
    out['feats'].append({'n': x['name'], 'type': x['type'], 'pre': x['prerequisite'], 'desc': clean(x['desc'].strip())})
out['feats'].sort(key=lambda r: r['n'])
for a in armor_raw:
    x = a['fields']
    out['armor'].append({'n': x['name'], 'ac': x['ac_base'], 'dex': bool(x['ac_add_dexmod']), 'cap': x['ac_cap_dexmod'], 'str': x['strength_score_required'], 'stealth': bool(x['grants_stealth_disadvantage'])})
for w in weapon_raw:
    x = w['fields']
    out['weapons'].append({'n': x['name'], 'dd': x['damage_dice'], 'dt': x['damage_type'], 'simple': bool(x['is_simple']), 'rg': x['range'], 'lr': x['long_range']})

raw = json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
gz = gzip.compress(raw, 9, mtime=0)
b64 = base64.b64encode(gz).decode('ascii')
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data', 'srd-chars.js')
with open(dest, 'w', encoding='utf-8') as fh:
    fh.write('/* Classes, species, feats, armour and weapons from the System Reference Document 5.2.1 (CC-BY 4.0), made by tools/build-srd-chars.py. Do not edit.\n')
    fh.write('   This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at\n')
    fh.write('   https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at\n')
    fh.write('   https://creativecommons.org/licenses/by/4.0/legalcode. */\n')
    fh.write("export const CHARS_GZ_B64 = '" + b64 + "';\n")
print('%d classes, %d species, %d feats; %d bytes JSON, %d gzipped, %d as text' % (len(out['classes']), len(out['species']), len(out['feats']), len(raw), len(gz), len(b64)))
