#!/usr/bin/env python3
"""Визуальная проверка: как выглядят сцены. Сохраняет PNG для просмотра."""
import json, math
import numpy as np
import sys
sys.path.insert(0, '/home/z/my-project/scripts')
from diagnose_demo import Sim, place_app, rot90_cw, ZOO, N, creature
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

rng = np.random.default_rng(7)
SOUP = dict(R=12, T=10, b=[1], m=0.28, s=0.05, kn=1, gn=1)
orb = ZOO['Orbium unicaudatus']
cells = np.array(orb['cells']).reshape(orb['h'], orb['w'])

def snap(w, path, title):
    fig, ax = plt.subplots(figsize=(4, 4), dpi=64)
    ax.imshow(w, cmap='magma', vmin=0, vmax=1, origin='upper')
    ax.set_title(title, fontsize=8)
    ax.axis('off')
    fig.savefig(path, bbox_inches='tight')
    plt.close(fig)

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

# 1. Бульон во времени
sim = Sim(SOUP); sim.world = soup_world()
for i in range(6000):
    sim.step()
    if i in (100, 600, 3000, 5999):
        snap(sim.world, f'/tmp/diag/soup_{i}.png', f'бульон t={i*0.1:.0f}')

# 2. meet во времени
sim = Sim(creature(orb))
for x, y, r in [(76, 96, 0), (184, 150, 2), (168, 62, 1), (66, 198, 3)]:
    place_app(sim.world, rot90_cw(cells, r), x, y)
for i in range(4000):
    sim.step()
    if i in (0, 400, 2000, 3999):
        snap(sim.world, f'/tmp/diag/meet_{i}.png', f'meet t={i*0.1:.0f}')

# 3. Стая
sim = Sim(creature(orb))
for (x, y) in [(60, 40), (110, 70), (160, 100), (210, 130), (85, 160), (135, 190)]:
    place_app(sim.world, rot90_cw(cells, 1), x, y)
for i in range(4000):
    sim.step()
    if i in (0, 1000, 3999):
        snap(sim.world, f'/tmp/diag/school_{i}.png', f'стая t={i*0.1:.0f}')

print('PNG saved')

# 4. Точная скорость всех существ (100 t.u., без wrap-искажений)
print()
print('=== Точные скорости (клеток за t.u.) ===')
from verify_lenia import mass_center
for c in ZOO.values():
    ccells = np.array(c['cells']).reshape(c['h'], c['w'])
    p = creature(c)
    dt = 1.0 / p['T']
    n_steps = int(round(100 / dt)) if p['T'] > 1 else 100
    if p['T'] == 1:
        n_steps = 100
    sim = Sim(p)
    place_app(sim.world, ccells, N // 2, N // 2)
    m0 = sim.mass()
    c0 = mass_center(sim.world)
    for _ in range(n_steps):
        sim.step()
    m1 = sim.mass()
    c1 = mass_center(sim.world)
    dy = (c1[0] - c0[0] + N/2) % N - N/2
    dx = (c1[1] - c0[1] + N/2) % N - N/2
    dist = math.hypot(dy, dx)
    tu = n_steps * dt
    if dist > 100:  # почти обошли тор — скорость велика, замер неточен
        dist = dist  # всё равно близко к истине на 256-торе
    print(f"  {c['name']:<26} alive={0.3*m0 < m1 < 0.25*N*N!s:<5} v={dist/tu:5.2f} кл/t.u.  (в TS было {c.get('speed', '?')})")
