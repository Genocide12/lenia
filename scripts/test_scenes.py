#!/usr/bin/env python3
"""Scene tests: rotated orbium survival, 4-direction scene, head-on collision."""
import pickle, importlib.util
import numpy as np
from fractions import Fraction
from scipy import ndimage

spec = importlib.util.spec_from_file_location('vl', '/home/z/my-project/scripts/verify_lenia.py')
vl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vl)

zoo = pickle.load(open('/tmp/zoo.pkl', 'rb'))
orb = next(z for z in zoo if z['name'] == 'Orbium unicaudatus')
rep = next(z for z in zoo if z['name'] == 'Aerogeminium repens')
p = orb['params']
b = [float(Fraction(x)) for x in str(p['b']).split(',')]
N = 256

def make_runner(params):
    bb = [float(Fraction(x)) for x in str(params['b']).split(',')]
    K = vl.build_kernel(N, params['R'], bb, params.get('kn') or 1)
    KF = np.fft.rfft2(np.fft.ifftshift(K))
    gfunc = vl.FIELD_FUNC[(params.get('gn') or 1) - 1]
    dt = 1 / params['T']
    m, s = params['m'], params['s']
    def run(w, steps):
        for _ in range(steps):
            U = np.fft.irfft2(KF * np.fft.rfft2(w), s=(N, N))
            w = np.clip(w + dt * gfunc(U, m, s), 0, 1)
        return w
    return run

run_orb = make_runner(p)

def blobs(w, thr=0.1, min_px=50):
    lbl, n = ndimage.label(w > thr)
    if n == 0:
        return []
    sizes = ndimage.sum(w > thr, lbl, range(1, n + 1))
    return [x for x in sizes if x >= min_px]

print('=== 1) Rotated orbium survival (600 steps) ===')
base = orb['cells'].sum()
for k in (0, 1, 2, 3):
    cells = np.rot90(orb['cells'], k)
    w = np.zeros((N, N))
    vl.place(w, cells, 128, 128)
    w = run_orb(w, 600)
    bl = blobs(w)
    print(f'  rot {k*90:>3}: mass {w.sum():6.1f} (base {base:.0f}), blobs>=50px: {len(bl)} -> {"ALIVE" if 0.3*base < w.sum() < 1500 and bl else "dead"}')

print('=== 2) Scene: 4 orbiums in 4 directions (up to 4000 steps) ===')
w = np.zeros((N, N))
for (x, y, k) in [(76, 96, 0), (184, 150, 2), (168, 62, 1), (66, 198, 3)]:
    vl.place(w, np.rot90(orb['cells'], k), y, x)
for t in (500, 1000, 2000, 4000):
    # incremental: run 500 at a time
    pass
w2 = w.copy()
for i in range(8):
    w2 = run_orb(w2, 500)
    if (i + 1) * 500 in (500, 1000, 2000, 4000):
        print(f'  t={(i+1)*500}: mass {w2.sum():7.1f}, blobs: {len(blobs(w2))}')

print('=== 3) Head-on collision (k=0 right vs k=2 left, 80 apart) ===')
w = np.zeros((N, N))
vl.place(w, np.rot90(orb['cells'], 0), 128, 88)
vl.place(w, np.rot90(orb['cells'], 2), 128, 168)
w2 = w.copy()
for i in range(6):
    w2 = run_orb(w2, 500)
    bl = blobs(w2)
    print(f'  t={(i+1)*500}: mass {w2.sum():7.1f}, blobs: {len(bl)}')

print('=== 4) Repens division timing (fresh, exact params) ===')
run_rep = make_runner(rep['params'])
w = np.zeros((N, N))
vl.place(w, rep['cells'], 128, 128)
w2 = w.copy()
for i in range(8):
    w2 = run_rep(w2, 500)
    print(f'  t={(i+1)*500}: mass {w2.sum():7.1f}, blobs: {len(blobs(w2, min_px=80))}')
