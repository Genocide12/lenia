#!/usr/bin/env python3
"""Broader creature selection with longer runs; export the chosen zoo to JSON."""
import json, re, time, pickle
import numpy as np
import importlib.util
spec = importlib.util.spec_from_file_location('vl', '/home/z/my-project/scripts/verify_lenia.py')
vl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vl)

def main():
    data = json.load(open('/tmp/animals.json'))
    creatures = [a for a in data if a.get('cells') and isinstance(a.get('params'), dict)
                 and not isinstance(a['cells'], list)]
    pats = [
        r'^Orbium unicaudatus$', r'^Orbium bicaudatus$', r'^Orbium phantasma$',
        r'^Scutium solidus$', r'^Scutium valvatus$', r'^Scutium serratus fluens$',
        r'^Aerogeminium volitans$', r'^Aerogeminium repens$', r'^Hydrogeminium',
        r'^Helicium', r'^Gyrorbium', r'^Kronium', r'^Florakronium', r'^Vagorbium',
        r'^Bug', r'^Lobster', r'^Star', r'^Galaxy', r'^Circobullium', r'^Circoechinium',
        r'^Trigonium', r'^Bifolium', r'^Discutium', r'^Echinium', r'^Catenohelicium',
        r'^Dolphin', r'^Duck', r'^Butterfly', r'^Caterpillar', r'^Rotator', r'^Bomber',
    ]
    sel, seen = [], set()
    for pat in pats:
        for a in creatures:
            if re.search(pat, a['name']) and a['name'] not in seen:
                sel.append(a); seen.add(a['name'])
                break  # first species per pattern
    print(f'candidates: {len(sel)}')
    good = []
    for a in sel:
        try:
            cells = vl.rle2cells(a['cells'])
            if max(cells.shape) > 90:
                print(f"  SKIP {a['name']}: big {cells.shape}"); continue
            r = vl.simulate(cells, a['params'], N=192, steps=800)
            r['name'] = a['name']; r['code'] = a['code']; r['shape'] = cells.shape
            r['cells'] = cells; r['params'] = a['params']
            tag = 'OK ' if r['alive'] else 'DEAD'
            print(f"  {tag} {a['name']:<40} shape={cells.shape} mass {r['mass0']:.0f}->{r['mass1']:.0f} "
                  f"(min {r['mass_min']:.0f} max {r['mass_max']:.0f}) dist={r['dist']:.0f} speed={r['speed']:.2f}")
            if r['alive']:
                good.append(r)
        except Exception as e:
            print(f"  FAIL {a['name']}: {e}")
    with open('/tmp/zoo.pkl', 'wb') as f:
        pickle.dump([{k: r[k] for k in ('name', 'code', 'shape', 'cells', 'params',
                                        'mass0', 'mass1', 'dist', 'speed')} for r in good], f)
    print(f'\nalive: {len(good)}/{len(sel)}')

if __name__ == '__main__':
    main()
