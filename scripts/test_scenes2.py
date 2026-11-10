#!/usr/bin/env python3
"""Extra tests: Hydrogeminium division (exact params), soup physics candidates, explosion structure."""
import json, pickle, importlib.util
import numpy as np
from fractions import Fraction
from scipy import ndimage

spec = importlib.util.spec_from_file_location('vl', '/home/z/my-project/scripts/verify_lenia.py')
vl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vl)

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

def blobs(w, thr=0.1, min_px=60):
    lbl, n = ndimage.label(w > thr)
    if n == 0:
        return []
    sizes = ndimage.sum(w > thr, lbl, range(1, n + 1))
    return sorted((x for x in sizes if x >= min_px), reverse=True)

data = json.load(open('/tmp/animals.json'))
hyd = next(a for a in data if a.get('name') == 'Hydrogeminium saliens')
print('Hydrogeminium saliens params:', hyd['params'])
cells = vl.rle2cells(hyd['cells'])
print('  shape:', cells.shape, 'mass:', cells.sum())

run_hyd = make_runner(hyd['params'])
w = np.zeros((N, N))
vl.place(w, cells, 128, 128)
w2 = w.copy()
print('=== Hydrogeminium saliens division (exact params) ===')
for i in range(10):
    w2 = run_hyd(w2, 400)
    bl = blobs(w2)
    print(f'  t={(i+1)*400}: mass {w2.sum():7.1f}, blobs: {len(bl)} (top sizes: {bl[:4]})')

print('=== Soup physics candidates (random blobs, like engine randomize) ===')
rng = np.random.default_rng(42)
def make_soup():
    # mirror of engine.randomize(): smooth low-res noise + gaussian droplets
    L = 36
    low = rng.random((L, L))
    x = np.arange(N)
    fx = x / N * (L - 1)
    ix = np.floor(fx).astype(int)
    tx = fx - ix
    sx = tx * tx * (3 - 2 * tx)
    lowx = low[:, ix] * (1 - sx) + low[:, (ix + 1) % L] * sx
    data2 = lowx[ix, :] * (1 - sx[:, None]) + lowx[(ix + 1) % L, :] * sx[:, None]
    w = np.maximum(0, (data2 - 0.45) * 1.4)
    for k in range(46):
        cx, cy = rng.random() * N, rng.random() * N
        rad = 3 + rng.random() * 9
        amp = 0.5 + rng.random() * 0.5
        yy, xx = np.mgrid[0:N, 0:N]
        dy = (yy - cy + N / 2) % N - N / 2
        dx = (xx - cx + N / 2) % N - N / 2
        d2 = (dx * dx + dy * dy) / (rad * rad)
        w = np.minimum(1, w + amp * np.exp(-d2 / 2))
    return w

CANDS = {
    'A m.34 s.07 R10': dict(R=10, T=10, b='1', m=0.34, s=0.07, kn=1, gn=1),
    'B m.28 s.05 R12': dict(R=12, T=10, b='1', m=0.28, s=0.05, kn=1, gn=1),
    'C m.31 s.0575 R15 b.5,1': dict(R=15, T=10, b='1/2,1', m=0.31, s=0.0575, kn=1, gn=1),
}
for name, params in CANDS.items():
    run_c = make_runner(params)
    w2 = make_soup()
    line = f'  {name}: '
    for t in (500, 2000, 4000):
        w2 = run_c(w2, t - (0 if t == 500 else (500 if t == 2000 else 2000)))
        line += f't{t}: m={w2.sum():6.0f} bl={len(blobs(w2, min_px=40))}  '
    print(line)

print('=== Explosion structure (4-direction scene at t=4000) ===')
zoo = pickle.load(open('/tmp/zoo.pkl', 'rb'))
orb = next(z for z in zoo if z['name'] == 'Orbium unicaudatus')
p = orb['params']
run_orb = make_runner(p)
w = np.zeros((N, N))
for (x, y, k) in [(76, 96, 0), (184, 150, 2), (168, 62, 1), (66, 198, 3)]:
    vl.place(w, np.rot90(orb['cells'], k), y, x)
w2 = run_orb(w, 4000)
bl = blobs(w2, min_px=60)
cov = (w2 > 0.5).mean()
print(f'  mass {w2.sum():.0f}, blobs {len(bl)}, top sizes {bl[:6]}, coverage>0.5: {cov:.3f}')
np.save('/tmp/explosion.npy', w2)
