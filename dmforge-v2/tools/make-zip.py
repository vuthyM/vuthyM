#!/usr/bin/env python3
"""Builds DM-Forge-V2.zip from the project (run `node build.mjs` first).
   python3 tools/make-zip.py [output.zip]"""
import os, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), 'DM-Forge-V2.zip')
TOP = 'DM-Forge V2/'

def add(z, src, arc, mode=0o644):
    zi = zipfile.ZipInfo(arc)
    zi.external_attr = (mode | 0o100000) << 16
    zi.compress_type = zipfile.ZIP_DEFLATED
    with open(src, 'rb') as f:
        z.writestr(zi, f.read())

with zipfile.ZipFile(OUT, 'w') as z:
    add(z, os.path.join(ROOT, 'dist', 'DM-Forge.html'), TOP + 'DM-Forge.html')
    add(z, os.path.join(ROOT, 'helper', 'Start DM Forge.command'), TOP + 'Start DM Forge.command', 0o755)
    add(z, os.path.join(ROOT, 'helper', 'dmforge-server.py'), TOP + 'dmforge-server.py', 0o755)
    add(z, os.path.join(ROOT, 'README.md'), TOP + 'README.md')
    add(z, os.path.join(ROOT, 'SUNDAY-CHECKLIST.md'), TOP + 'SUNDAY-CHECKLIST.md')
    add(z, os.path.join(ROOT, 'VERSION'), TOP + 'VERSION')
    for dp, _, fn in os.walk(os.path.join(ROOT, 'src')):
        for f in fn:
            p = os.path.join(dp, f)
            add(z, p, TOP + 'source/' + os.path.relpath(p, ROOT))
    for f in ('build.mjs', 'package.json', 'VERSION'):
        add(z, os.path.join(ROOT, f), TOP + 'source/' + f)
    for f in sorted(os.listdir(os.path.join(ROOT, 'test'))):
        if f.endswith(('.mjs', '.js', '.py')) and 'debug' not in f and 'smoke' not in f:
            add(z, os.path.join(ROOT, 'test', f), TOP + 'source/test/' + f)
    # V3: the server, its tests and the Docker files (the helper and DM-Forge.html above are what V2 uses; these are extra)
    for f in sorted(os.listdir(os.path.join(ROOT, 'server'))):
        if f.endswith(('.py', '.js')):
            add(z, os.path.join(ROOT, 'server', f), TOP + 'source/server/' + f)
    for f in ('Dockerfile', 'docker-compose.yml', '.dockerignore', '.env.example', 'package-lock.json', 'V3-PLAN.md'):
        if os.path.exists(os.path.join(ROOT, f)):
            add(z, os.path.join(ROOT, f), TOP + 'source/' + f)
    add(z, os.path.join(ROOT, 'deploy', 'DEPLOY-V3.md'), TOP + 'source/deploy/DEPLOY-V3.md')
    add(z, os.path.join(ROOT, 'tools', 'make-zip.py'), TOP + 'source/tools/make-zip.py')
    add(z, os.path.join(ROOT, 'tools', 'build-srd.py'), TOP + 'source/tools/build-srd.py')
    add(z, os.path.join(ROOT, 'tools', 'build-srd-spells.py'), TOP + 'source/tools/build-srd-spells.py')
    add(z, os.path.join(ROOT, 'tools', 'build-srd-chars.py'), TOP + 'source/tools/build-srd-chars.py')
    add(z, os.path.join(ROOT, 'tools', 'gen-fonts.py'), TOP + 'source/tools/gen-fonts.py')
print(OUT, os.path.getsize(OUT))
