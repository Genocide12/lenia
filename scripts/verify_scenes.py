#!/usr/bin/env python3
"""Финальная верификация сцен в конвенции нового placeCells (gy = y вверх от низа).
Новая placeCells: паттерн (row 0 = верх) центрируется в (gx, gy_up):
  texture row r = экранная y-up координата r.
  y0 = round(gy - h/2) — нижняя строка паттерна в текстуре.
  src = flip(rows) — src row 0 = низ паттерна; src row j -> texture row y0+j."""
import math, sys
import numpy as np
sys.path.insert(0, '/home/z/my-project/scripts')
from diagnose_demo import Sim, ZOO, N, creature
from verify_lenia import build_kernel
from scipy import ndimage

def rot90_cw(cells, turns):
    out = cells.copy()
    for _ in range(((turns % 4) + 4) % 4):
        out = np.rot90(out, k=-1)
    return out

def place_new(world, cells, gx, gy):
    """Зеркало нового engine.placeCells: gy — y вверх от низа экрана."""
    flipped = cells[::-1, :]  # src: row 0 = низ паттерна
    h, w = flipped.shape
    x0 = (round(gx - w / 2)) % N
    y0 = (round(gy - h / 2)) % N  # texture row = y-up
    ys = (np.arange(y0, y0 + h)) % N
    xs = (np.arange(x0, x0 + w)) % N
    world[np.ix_(ys, xs)] = np.maximum(world[np.ix_(ys, xs)], flipped)

def blobs(w):
    m = w > 0.1
    return ndimage.label(m)[1] if m.any() else 0

orb = ZOO['Orbium unicaudatus']
cells = np.array(orb['cells']).reshape(orb['h'], orb['w'])

C = np.array([128.0, 128.0])

def run(name, world_seed, steps=30000, every=3000):
    print(f'=== {name} ===')
    sim = Sim(creature(orb))
    sim.world = world_seed
    for i in range(steps):
        sim.step()
        if i % every == 0 or i == steps - 1:
            print(f'  t={i*sim.dt:6.0f}  mass={sim.mass():7.1f}  blobs={blobs(sim.world)}', flush=True)


def main():
    # ИСТИННЫЕ курсы (y-up): rot1 = (-0.927, -0.373), rot3 = антипараллелен, rot0 = (0.373, -0.927)
    u = np.array([-0.927, -0.373])   # курс rot1
    p = np.array([0.373, -0.927])    # перпендикуляр
    C = np.array([128.0, 128.0])

    # 1. Стая 3x3, все rot1
    w0 = np.zeros((N, N))
    for q in (-26, 0, 26):
        for s in (-48, 0, 48):
            pos = (C + q * p + s * u) % N
            place_new(w0, rot90_cw(cells, 1), pos[0], pos[1])
    run('Стая 3x3 (9 орбиев rot1)', w0)

    # 2. Встречное движение: 2 дорожки rot1 + 2 дорожки rot3
    w0 = np.zeros((N, N))
    for q, r in [(-30, 1), (30, 1), (98, 3), (158, 3)]:
        base = C + q * p
        d = u if r == 1 else -u
        for s in (-40, 40):
            pos = (base + s * d) % N
            place_new(w0, rot90_cw(cells, r), pos[0], pos[1])
    run('Встречное движение (4+4)', w0, steps=15000, every=1000)

    # 3. Лоб в лоб: rot0 и rot2 на одной геодезической
    d0 = np.array([0.373, -0.927])
    w0 = np.zeros((N, N))
    A = np.array([88.0, 128.0])
    B = A + 90 * d0
    place_new(w0, rot90_cw(cells, 0), A[0], A[1])
    place_new(w0, rot90_cw(cells, 2), B[0] % N, B[1] % N)
    run('Лоб в лоб (rot0 + rot2)', w0, steps=5000, every=250)


if __name__ == '__main__':
    main()
