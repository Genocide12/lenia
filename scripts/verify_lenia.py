#!/usr/bin/env python3
"""Decode Lenia animals.json, verify creatures with a reference numpy simulation."""
import json, math, re, sys, time
from fractions import Fraction
import numpy as np

DIM_DELIM = {0: '', 1: '$', 2: '%', 3: '#'}
DELIMS = list(DIM_DELIM.values())

def ch2val(c):
    if c in '.b': return 0
    if c == 'o': return 255
    if len(c) == 1: return ord(c) - ord('A') + 1
    return (ord(c[0]) - ord('p')) * 24 + (ord(c[1]) - ord('A') + 25)

def append_stack(list1, list2, count, is_repeat):
    list1.append(list2)
    if count != '':
        repeated = list2 if is_repeat else []
        list1.extend([repeated] * (int(count) - 1))

def rle2cells(st):
    stacks = [[], []]
    last, count = '', ''
    st = st.rstrip('!') + '$'
    for ch in st:
        if ch.isdigit():
            count += ch
        elif ch in 'pqrstuvwxy@':
            last = ch
        else:
            if last + ch not in DELIMS:
                append_stack(stacks[0], ch2val(last + ch) / 255.0, count, True)
            else:
                dim = DELIMS.index(last + ch)
                for d in range(dim):
                    append_stack(stacks[d + 1], stacks[d], count, False)
                    stacks[d] = []
                if dim + 2 > len(stacks):
                    stacks.append([])
            last, count = '', ''
    rows = stacks[1] if stacks[1] else stacks[0]
    if not rows:
        return np.zeros((1, 1))
    w = max(len(r) for r in rows)
    A = np.zeros((len(rows), w))
    for i, r in enumerate(rows):
        if len(r):
            A[i, :len(r)] = r
    return A

KERNEL_CORE = {
    0: lambda r: (4 * r * (1 - r)) ** 4,
    1: lambda r: np.exp(4 - 1 / (r * (1 - r))),
    2: lambda r, q=0.25: ((r >= q) & (r <= 1 - q)).astype(float),
    3: lambda r, q=0.25: ((r >= q) & (r <= 1 - q)).astype(float) + (r < q) * 0.5,
}
FIELD_FUNC = {
    0: lambda n, m, s: np.maximum(0, 1 - (n - m) ** 2 / (9 * s ** 2)) ** 4 * 2 - 1,
    1: lambda n, m, s: np.exp(-(n - m) ** 2 / (2 * s ** 2)) * 2 - 1,
    2: lambda n, m, s: (np.abs(n - m) <= s) * 2 - 1,
}

def kernel_shell(r, weights, kn):
    B = len(weights)
    Br = B * r
    idx = np.minimum(np.floor(Br).astype(int), B - 1)
    b = np.asarray(weights)[idx]
    kfunc = KERNEL_CORE[kn - 1]
    frac = np.minimum(np.mod(Br, 1), 1)
    with np.errstate(divide='ignore', invalid='ignore'):
        core = kfunc(frac)
    core = np.nan_to_num(core)
    return (r < 1) * core * b

def build_kernel(N, R, b, kn):
    I, J = np.meshgrid(np.arange(N), np.arange(N))
    D = np.sqrt((I - N // 2) ** 2 + (J - N // 2) ** 2) / R
    K = kernel_shell(D, b, kn)
    s = K.sum()
    return (K / s if s != 0 else K)

def place(world, cells, cy, cx):
    h, w = cells.shape
    ys = (np.arange(h) + cy - h // 2) % world.shape[0]
    xs = (np.arange(w) + cx - w // 2) % world.shape[1]
    world[np.ix_(ys, xs)] = np.maximum(world[np.ix_(ys, xs)], cells)

def mass_center(A):
    idx = np.argwhere(A > 0.05)
    if len(idx) == 0:
        return None
    w = A[idx[:, 0], idx[:, 1]]
    return (idx[:, 0] * w).sum() / w.sum(), (idx[:, 1] * w).sum() / w.sum()

def torus_delta(a, b, N):
    dy = (b[0] - a[0] + N / 2) % N - N / 2
    dx = (b[1] - a[1] + N / 2) % N - N / 2
    return math.hypot(dy, dx)

def simulate(cells, params, N=192, steps=400, dt_frac=1.0):
    """Returns dict with survival info."""
    b = [float(Fraction(x)) for x in str(params['b']).split(',')]
    R, T = params['R'], params['T']
    m, s = params['m'], params['s']
    kn = params.get('kn') or 1
    gn = params.get('gn') or 1
    dt = (1.0 / T) * dt_frac
    K = build_kernel(N, R, b, kn)
    KF = np.fft.rfft2(np.fft.ifftshift(K))  # center kernel at origin -> aligned circular conv
    gfunc = FIELD_FUNC[gn - 1]
    world = np.zeros((N, N))
    place(world, cells, N // 2, N // 2)
    m0 = world.sum()
    c0 = mass_center(world)
    masses = []
    for i in range(steps):
        U = np.fft.irfft2(KF * np.fft.rfft2(world), s=(N, N))
        world = np.clip(world + dt * gfunc(U, m, s), 0, 1)
        if i % 50 == 49:
            masses.append(world.sum())
    m1 = world.sum()
    c1 = mass_center(world)
    dist = torus_delta(c0, c1, N) if (c0 and c1) else 0
    return {
        'mass0': m0, 'mass1': m1, 'mass_min': min(masses) if masses else m1,
        'mass_max': max(masses) if masses else m1,
        'dist': dist, 'speed': dist / (steps * dt),
        'alive': 0.3 * m0 < m1 < 0.25 * N * N,
    }

def main():
    data = json.load(open('/tmp/animals.json'))
    creatures = []
    for a in data:
        if not a.get('cells'):
            continue
        p = a.get('params')
        if not isinstance(p, dict):
            continue  # multi-channel
        if isinstance(a['cells'], list):
            continue
        creatures.append(a)
    print(f'total single-channel creatures: {len(creatures)}')

    # curated candidate patterns
    pats = [
        r'^Orbium unicaudatus$', r'^Orbium bicaudatus$', r'^Scutium solidus$',
        r'^Scutium valvatus$', r'^Scutium serratus fluens$', r'^Scutium ferratum$',
        r'^Aerogeminium volitans$', r'^Aerogeminium repens$', r'^Geminium natans$',
        r'^Triceratops', r'^Dolphin', r'^Hydra', r'^Butterfly', r'^Pteranodon',
        r'^Caterpillar', r'^Rotator', r'^Pufferfish', r'^Bomber', r'^Duck',
        r'^Flagellata', r'^Mermaid', r'^Dragon', r'^Scorpion', r'^Sphenodon',
    ]
    sel, seen = [], set()
    for pat in pats:
        for a in creatures:
            if re.search(pat, a['name']) and a['name'] not in seen:
                sel.append(a); seen.add(a['name'])
    print(f'candidates: {len(sel)}')

    results = []
    t0 = time.time()
    for a in sel:
        try:
            cells = rle2cells(a['cells'])
            if cells.shape[0] > 100 or cells.shape[1] > 100:
                print(f"  SKIP {a['name']}: too big {cells.shape}"); continue
            r = simulate(cells, a['params'])
            r['name'] = a['name']; r['code'] = a['code']; r['shape'] = cells.shape
            r['cells'] = cells; r['params'] = a['params']
            results.append(r)
            print(f"  {a['name']:<38} shape={cells.shape} mass {r['mass0']:.1f}->{r['mass1']:.1f} "
                  f"(min {r['mass_min']:.1f} max {r['mass_max']:.0f}) dist={r['dist']:.1f} "
                  f"alive={r['alive']}")
        except Exception as e:
            print(f"  FAIL {a['name']}: {e}")
    print(f'elapsed {time.time()-t0:.1f}s')
    import pickle
    good = [r for r in results if r['alive']]
    with open('/tmp/verified.pkl', 'wb') as f:
        pickle.dump([{k: r[k] for k in ('name', 'code', 'shape', 'cells', 'params', 'mass0', 'mass1', 'dist', 'speed')} for r in good], f)
    print(f'\nalive: {len(good)}/{len(results)}')
    for r in good:
        print(f"  OK {r['name']:<38} speed {r['speed']:.2f} cells/s shape {r['shape']}")

if __name__ == '__main__':
    main()
