#!/usr/bin/env python3
"""Emergence experiments for the Lenia demo redesign.

Q1: Does orbium physics + smooth random noise self-organize into gliders?
    Which noise feature scale works best / fastest?
Q2: Do emerged gliders have DIFFERENT headings (not one direction)?
Q3: Do collisions happen (population changes, new blobs appear)?
Q4: Does a 'shower' scene (random pos + random rotations) give instant action?
"""
import math
import sys
import numpy as np
from scipy import ndimage

sys.path.insert(0, '/home/z/my-project/scripts')
from verify_lenia import rle2cells, build_kernel, FIELD_FUNC, place
import json

N = 256
ORB_PARAMS = dict(R=13, T=10, m=0.15, s=0.015, b='1', kn=1, gn=1)


def load_orbium():
    data = json.load(open('/tmp/animals.json'))
    for a in data:
        if a['name'] == 'Orbium unicaudatus':
            return np.array(a['cells'], dtype=float).reshape(a['h'], a['w'])
    raise RuntimeError('orbium not found')


def make_fft(params):
    b = [float(x) for x in str(params['b']).split(',')]
    K = build_kernel(N, params['R'], b, params.get('kn') or 1)
    return np.fft.rfft2(np.fft.ifftshift(K))


def step(world, KF, params):
    dt = 1.0 / params['T']
    g = FIELD_FUNC[(params.get('gn') or 1) - 1]
    U = np.fft.irfft2(KF * np.fft.rfft2(world), s=(N, N))
    return np.clip(world + dt * g(U, params['m'], params['s']), 0, 1)


def blobs(A, thr=0.12, min_size=30, max_size=4000):
    """Connected components above threshold: list of (cy, cx, mass)."""
    M, n = ndimage.label(A > thr)
    out = []
    for i in range(1, n + 1):
        ys, xs = np.where(M == i)
        mass = A[ys, xs].sum()
        if min_size <= len(ys) <= max_size:
            w = A[ys, xs]
            out.append(((ys * w).sum() / w.sum(), (xs * w).sum() / w.sum(), mass, len(ys)))
    return out


def torus_d(a, b):
    dy = (b[0] - a[0] + N / 2) % N - N / 2
    dx = (b[1] - a[1] + N / 2) % N - N / 2
    return math.hypot(dy, dx), dx, dy


def smooth_noise(scale, seed):
    """Bilinear-upsampled random grid, feature size ~N/scale pixels, values in [0,1]."""
    rng = np.random.default_rng(seed)
    small = rng.random((scale, scale))
    img = np.array(__import__('PIL.Image', fromlist=['Image']).fromarray(
        (small * 255).astype(np.uint8)).resize((N, N), 2), dtype=float) / 255.0
    return img


def track(world, KF, params, steps, checkpoints, label=''):
    """Run sim, at each checkpoint record blobs; match between consecutive to get velocities."""
    hist = []
    t = 0
    cp_set = sorted(checkpoints)
    bi = 0
    while t < steps:
        if bi < len(cp_set) and t == cp_set[bi]:
            hist.append((t, blobs(world)))
            bi += 1
        world = step(world, KF, params)
        t += 1
    if bi < len(cp_set) and t == cp_set[bi]:
        hist.append((t, blobs(world)))
    print(f'\n=== {label} ===')
    prev = None
    for t, bb in hist:
        heads = []
        if prev is not None:
            pt, pb = prev
            used = [False] * len(pb)
            for (cy, cx, m, sz) in bb:
                best, bd = -1, 25  # max match distance over gap
                for j, (py, px, pm, psz) in enumerate(pb):
                    if used[j]:
                        continue
                    d, dx, dy = torus_d((py, px), (cy, cx))
                    if d < bd:
                        bd, best = d, j
                if best >= 0:
                    used[best] = True
                    d, dx, dy = torus_d(pb[best][:2], (cy, cx))
                    gap = t - pt
                    if d > 1.5:  # moved
                        heads.append((math.degrees(math.atan2(dy, dx)), d / gap, m))
        print(f'  t={t:<5} blobs={len(bb):<3} mass={sum(b[2] for b in bb):7.1f}', end='')
        if heads:
            dirs = [round(h[0]) for h in heads]
            print(f'  moving={len(heads)} headings={dirs} speeds={[round(h[1],2) for h in heads]}', end='')
        print()
        prev = (t, bb)
    return world


def main():
    orbium = load_orbium()
    KF = make_fft(ORB_PARAMS)
    print(f'orbium pattern mass = {orbium.sum():.1f} (for reference)')

    # ---- Q1/Q2/Q3: emergence from noise at several feature scales ----
    for scale in [4, 6, 8, 12, 16, 24]:
        world = smooth_noise(scale, seed=42)
        m0 = world.sum()
        # quick 1500-step probe: does anything survive?
        w = world.copy()
        for i in range(1500):
            w = step(w, KF, ORB_PARAMS)
        bb = blobs(w)
        print(f'noise scale 1/{scale:<2} ({N//scale}px features): mass {m0:.0f} -> {w.sum():.0f}, blobs={len(bb)}')

    print('\n--- deep run with best-looking scale ---')
    # pick scale by max blob count at 1500
    best_scale, best_count = None, -1
    for scale in [4, 6, 8, 12, 16, 24]:
        w = smooth_noise(scale, seed=7)
        for i in range(1500):
            w = step(w, KF, ORB_PARAMS)
        c = len(blobs(w))
        if c > best_count:
            best_count, best_scale = c, scale
    print(f'best scale = 1/{best_scale} ({best_count} blobs @t=1500)')

    for seed in [1, 2, 3]:
        world = smooth_noise(best_scale, seed=seed)
        track(world, KF, ORB_PARAMS, 6000,
              [0, 200, 500, 1000, 2000, 3000, 4000, 5000, 6000],
              label=f'emergence scale=1/{best_scale} seed={seed}')

    # ---- Q4: shower scene: 10 orbiums, random positions & rotations ----
    print('\n--- shower scene (random pos+rot) ---')
    rng = np.random.default_rng(99)
    world = np.zeros((N, N))
    for k in range(10):
        rot = rng.integers(0, 4)
        cells = np.rot90(orbium, k)
        place(world, cells, rng.integers(30, N - 30), rng.integers(30, N - 30))
    track(world, KF, ORB_PARAMS, 5000, [0, 100, 300, 600, 1000, 2000, 3000, 4000, 5000],
          label='shower 10 random orbiums')


if __name__ == '__main__':
    main()
