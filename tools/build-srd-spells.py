#!/usr/bin/env python3
"""Builds src/data/srd-spells.js from the Open5e data for the System Reference Document 5.2 (CC-BY 4.0).

Usage:  python3 tools/build-srd-spells.py DIR      (DIR holds Spell.json)
Get it from https://raw.githubusercontent.com/open5e/open5e-api/staging/data/v2/wizards-of-the-coast/srd-2024/Spell.json

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/legalcode.
"""
import base64, gzip, json, os, sys

src = sys.argv[1] if len(sys.argv) > 1 else '.'
spells = json.load(open(os.path.join(src, 'Spell.json'), encoding='utf-8'))

CT = {'action': 'Action', 'bonus-action': 'Bonus Action', 'reaction': 'Reaction', '1minute': '1 minute', '10minutes': '10 minutes', '1hour': '1 hour'}
out = []
for s in spells:
    f = s['fields']
    comps = [c for c, on in (('V', f.get('verbal')), ('S', f.get('somatic')), ('M', f.get('material'))) if on]
    mat = (f.get('material_specified') or '').strip()
    comp = ', '.join(comps) + (' (' + mat + ')' if 'M' in comps and mat else '')
    ct = CT.get(f['casting_time'], f['casting_time'])
    if f['casting_time'] == 'reaction' and f.get('reaction_condition'):
        ct += ', ' + f['reaction_condition'].strip()
    dur = (f.get('duration') or '').strip()
    out.append({
        'id': s['pk'].split('_', 1)[1], 'n': f['name'], 'lv': f['level'], 'sc': f['school'].title(),
        'ct': ct, 'rg': f.get('range_text') or '', 'cp': comp,
        'du': ('Concentration, up to ' + dur) if f.get('concentration') and dur and dur != 'instantaneous' else (dur[:1].upper() + dur[1:] if dur else ''),
        'cn': bool(f.get('concentration')), 'ri': bool(f.get('ritual')),
        'ds': f['desc'].strip(), 'up': (f.get('higher_level') or '').strip(),
        'cl': sorted(c.split('_', 1)[1].title() for c in f.get('classes', [])),
        'dm': f.get('damage_roll') or '', 'sv': (f.get('saving_throw_ability') or '').title(),
    })
out.sort(key=lambda r: r['n'].lower())
raw = json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
gz = gzip.compress(raw, 9, mtime=0)
b64 = base64.b64encode(gz).decode('ascii')
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data', 'srd-spells.js')
with open(dest, 'w', encoding='utf-8') as fh:
    fh.write('/* ' + str(len(out)) + ' spells from the System Reference Document 5.2.1 (CC-BY 4.0), made by tools/build-srd-spells.py. Do not edit.\n')
    fh.write('   This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at\n')
    fh.write('   https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at\n')
    fh.write('   https://creativecommons.org/licenses/by/4.0/legalcode. */\n')
    fh.write('export const SPELL_COUNT = ' + str(len(out)) + ';\n')
    fh.write("export const SPELLS_GZ_B64 = '" + b64 + "';\n")
print('%d spells, %d bytes of JSON, %d gzipped, %d as text' % (len(out), len(raw), len(gz), len(b64)))
