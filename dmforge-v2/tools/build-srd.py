#!/usr/bin/env python3
"""Builds src/data/srd-monsters.js from the Open5e data for the System Reference Document 5.2 (CC-BY 4.0).

Usage:  python3 tools/build-srd.py DIR      (DIR holds Creature.json, CreatureAction.json, CreatureTrait.json)
Get the files from
  https://raw.githubusercontent.com/open5e/open5e-api/staging/data/v2/wizards-of-the-coast/srd-2024/<File>.json
The output is every creature in a compact form, gzipped and base64-encoded (the app unpacks it the first time the monster library is opened).

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/legalcode.
"""
import base64, gzip, json, os, sys

src = sys.argv[1] if len(sys.argv) > 1 else '.'
load = lambda n: json.load(open(os.path.join(src, n + '.json'), encoding='utf-8'))
creatures, actions, traits = load('Creature'), load('CreatureAction'), load('CreatureTrait')

by_parent = lambda rows: {}
def group(rows):
    out = {}
    for r in rows:
        out.setdefault(r['fields']['parent'], []).append(r['fields'])
    return out
acts, trts = group(actions), group(traits)

def num(v):
    return None if v is None else float(v)

def speed(f):
    parts = []
    if f.get('walk') is not None: parts.append('%d ft.' % f['walk'])
    for k, label in (('burrow', 'Burrow'), ('climb', 'Climb'), ('fly', 'Fly'), ('swim', 'Swim')):
        if f.get(k):
            parts.append('%s %d ft.%s' % (label, f[k], ' (hover)' if k == 'fly' and f.get('hover') else ''))
    return ', '.join(parts) or '0 ft.'

def senses(f):
    parts = []
    for k, label in (('blindsight_range', 'Blindsight'), ('darkvision_range', 'Darkvision'), ('tremorsense_range', 'Tremorsense'), ('truesight_range', 'Truesight')):
        if f.get(k): parts.append('%s %d ft.' % (label, f[k]))
    parts.append('Passive Perception %s' % (f.get('passive_perception') if f.get('passive_perception') is not None else 10))
    return ', '.join(parts)

ABIL = [('strength', 'Str'), ('dexterity', 'Dex'), ('constitution', 'Con'), ('intelligence', 'Int'), ('wisdom', 'Wis'), ('charisma', 'Cha')]
def saves(f):
    return ', '.join('%s %+d' % (a, f['saving_throw_' + k]) for k, a in ABIL if f.get('saving_throw_' + k) is not None)

SKILLS = ['acrobatics', 'animal_handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight_of_hand', 'stealth', 'survival']
def skills(f):
    return ', '.join('%s %+d' % (s.replace('_', ' ').title(), f['skill_bonus_' + s]) for s in SKILLS if f.get('skill_bonus_' + s) is not None)

def uses(a):
    t, p = a.get('uses_type'), a.get('uses_param')
    if t == 'PER_DAY' and p: return '%d/Day' % p
    if t == 'RECHARGE_ON_ROLL' and p: return 'Recharge %d–6' % p
    if t == 'RECHARGE': return ''
    return ''

def act(a):
    u = uses(a)
    return [a['name'] + (' (' + u + ')' if u and '(' not in a['name'] else ''), a['desc'].strip()]

def cr_value(s):
    return float(s)

out = []
for c in creatures:
    f = c['fields']
    key = c['pk'].split('_', 1)[1]
    ac = lambda t: sorted([a for a in acts.get(c['pk'], []) if a['action_type'] == t], key=lambda a: (a.get('order_in_statblock') or 0, a['name']))
    rec = {
        'id': key, 'n': f['name'], 'sz': f['size'].title(), 't': f['type'], 'al': f.get('alignment') or '',
        'ac': f['armor_class'], 'acd': f.get('armor_detail') or '', 'hp': f['hit_points'], 'hd': f.get('hit_dice') or '',
        'sp': speed(f), 'ini': f.get('initiative_bonus') if f.get('initiative_bonus') is not None else (f['ability_score_dexterity'] - 10) // 2,
        'ab': [f['ability_score_' + k] for k, _ in ABIL], 'sv': saves(f), 'sk': skills(f),
        'dv': f.get('damage_vulnerabilities_display') or '', 'dr': f.get('damage_resistances_display') or '', 'di': f.get('damage_immunities_display') or '',
        'ci': f.get('condition_immunities_display') or '', 'se': senses(f), 'ln': f.get('languages_desc') or '',
        'cr': cr_value(f['challenge_rating']),
        'tr': [[t['name'], t['desc'].strip()] for t in trts.get(c['pk'], [])],
        'ac_': [act(a) for a in ac('ACTION')], 'ba': [act(a) for a in ac('BONUS_ACTION')], 're': [act(a) for a in ac('REACTION')],
        'la': [act(a) + [a.get('legendary_action_cost') or 1] for a in ac('LEGENDARY_ACTION')],
        'cat': f.get('category') or '',
    }
    # the creature's own recharge abilities, for the combat tracker: [name, kind, n]
    ab = []
    for a in acts.get(c['pk'], []):
        if a.get('uses_type') == 'RECHARGE_ON_ROLL' and a.get('uses_param'): ab.append([a['name'], 'recharge', a['uses_param']])
        elif a.get('uses_type') == 'RECHARGE': ab.append([a['name'].split(' (')[0], 'recharge', a['uses_param'] or 6])
        elif a.get('uses_type') == 'PER_DAY' and a.get('uses_param'): ab.append([a['name'], 'day', a['uses_param']])
    rec['uses'] = ab
    out.append(rec)
out.sort(key=lambda r: r['n'].lower())

raw = json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
gz = gzip.compress(raw, 9, mtime=0)
b64 = base64.b64encode(gz).decode('ascii')
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data', 'srd-monsters.js')
with open(dest, 'w', encoding='utf-8') as fh:
    fh.write('/* ' + str(len(out)) + ' creatures from the System Reference Document 5.2.1 (CC-BY 4.0), made by tools/build-srd.py. Do not edit.\n')
    fh.write('   This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at\n')
    fh.write('   https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at\n')
    fh.write('   https://creativecommons.org/licenses/by/4.0/legalcode. */\n')
    fh.write('export const SRD_COUNT = ' + str(len(out)) + ';\n')
    fh.write("export const SRD_GZ_B64 = '" + b64 + "';\n")
print('%d creatures, %d bytes of JSON, %d gzipped, %d as text' % (len(out), len(raw), len(gz), len(b64)))
