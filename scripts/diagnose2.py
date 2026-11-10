#!/usr/bin/env python3
"""Раунд 2 (параллельно по одному тесту): python3 diagnose2.py A|B|C|E"""
import json, math, sys
import numpy as np
sys.path.insert(0, '/home/z/my-project/scripts')
from verify_lenia import FIELD_FUNC, build_kernel
from diagnose_demo import Sim, place_app, rot90_cw, ZOO, N, creature

from scipy import ndimage

def blobs(w):
    mask = w > 0.1
    return ndimage.label(mask)[1] if mask.any() else 0

rng = np.random.default_rng(42)
def soup_world(n_drops=46):
    w = np.zeros((N, N))
    for _ in range(n_drops):
        cx, cy = rng.integers(0, N, 2)
        r = rng.uniform(4, 11)
        amp = rng.uniform(0.3, 1.0)
        yy, xx = np.mgrid[0:N, 0:N]
        dy = (yy - cy + N/2) % N - N/2
        dx = (xx - cx + N/2) % N - N/2
        w = np.maximum(w, amp * np.exp(-(dy**2 + dx**2) / (2 * r * r)))
    return w

def droplet(w):
    cx, cy = rng.integers(20, N-20, 2)
    r = rng.uniform(5, 10)
    amp = rng.uniform(0.5, 1.0)
    yy, xx = np.mgrid[0:N, 0:N]
    dy = (yy - cy + N/2) % N - N/2
    dx = (xx - cx + N/2) % N - N/2
    return np.maximum(w, amp * np.exp(-(dy**2 + dx**2) / (2*r*r)))

SOUP = dict(R=12, T=10, b=[1], m=0.28, s=0.05, kn=1, gn=1)
STEPS = 30000
test = sys.argv[1]

if test == 'A':
    print('=== A. Бульон БЕЗ подкачки ===')
    sim = Sim(SOUP); sim.world = soup_world()
    for i in range(STEPS):
        sim.step()
        if i % 1500 == 0 or i == STEPS-1:
            print(f'  t={i*sim.dt:7.1f}  mass={sim.mass():8.1f}  blobs={blobs(sim.world)}', flush=True)

elif test == 'B':
    print('=== B. Бульон С метеоритами (каждые 80 t.u.) ===')
    sim = Sim(SOUP); sim.world = soup_world()
    for i in range(STEPS):
        sim.step()
        if i > 0 and i % 800 == 0:
            sim.world = droplet(sim.world)
        if i % 1500 == 0 or i == STEPS-1:
            print(f'  t={i*sim.dt:7.1f}  mass={sim.mass():8.1f}  blobs={blobs(sim.world)}', flush=True)

elif test == 'C':
    print('=== C. Параллельная стая: 6 орбиев, курс 40° ===')
    orb = ZOO['Orbium unicaudatus']
    cells = np.array(orb['cells']).reshape(orb['h'], orb['w'])
    sim = Sim(creature(orb))
    for (x, y) in [(60, 40), (110, 70), (160, 100), (210, 130), (85, 160), (135, 190)]:
        place_app(sim.world, rot90_cw(cells, 1), x, y)
    for i in range(STEPS):
        sim.step()
        if i % 1500 == 0 or i == STEPS-1:
            print(f'  t={i*sim.dt:7.1f}  mass={sim.mass():8.1f}  blobs={blobs(sim.world)}', flush=True)

elif test == 'E':
    print('=== E. Орбий + Кроний под физикой орбия ===')
    orb = ZOO['Orbium unicaudatus']
    cells = np.array(orb['cells']).reshape(orb['h'], orb['w'])
    kron = ZOO['Kronium solidus']
    kcells = np.array(kron['cells']).reshape(kron['h'], kron['w'])
    sim = Sim(creature(orb))
    place_app(sim.world, cells, 70, 70)
    place_app(sim.world, rot90_cw(cells, 2), 186, 186)
    place_app(sim.world, kcells, 128, 128)
    for i in range(STEPS):
        sim.step()
        if i % 1500 == 0 or i == STEPS-1:
            print(f'  t={i*sim.dt:7.1f}  mass={sim.mass():8.1f}  blobs={blobs(sim.world)}', flush=True)
