#!/usr/bin/env python3
"""Диагностика проблем демо: направления, смерть мира, стабильность сцен.

Использует ТОЧНО те же данные, что и приложение (дамп из creatures.ts),
и ту же математику (verify_lenia.py)."""
import json, math
import numpy as np
import sys
sys.path.insert(0, '/home/z/my-project/scripts')
from verify_lenia import KERNEL_CORE, FIELD_FUNC, build_kernel, mass_center, torus_delta

ZOO = {c['name']: c for c in json.load(open('/tmp/zoo_dump.json'))}
N = 256

def rot90_cw(cells: np.ndarray, turns: int) -> np.ndarray:
    """Точная копия rotateCells из page.tsx (поворот на 90° по часовой в экранных координатах)."""
    out = cells.copy()
    for _ in range(((turns % 4) + 4) % 4):
        out = np.rot90(out, k=-1)  # clockwise
    return out

def place_app(world, cells, gx, gy):
    """Копия engine.placeCells: row-flip + тороидальная расстановка.
    cells — паттерн как в TS (row 0 = верх экрана)."""
    flipped = cells[::-1, :]  # texture row 0 = bottom
    h, w = flipped.shape
    x0 = (round(gx - w / 2)) % N
    y_top = round(gy - h / 2)
    y0 = (N - (y_top + h)) % N
    ys = (np.arange(y0, y0 + h)) % N
    xs = (np.arange(x0, x0 + w)) % N
    world[np.ix_(ys, xs)] = np.maximum(world[np.ix_(ys, xs)], flipped)

class Sim:
    def __init__(self, p):
        b = p['b']; R = p['R']; T = p['T']
        self.dt = 1.0 / T
        self.m, self.s = p['m'], p['s']
        K = build_kernel(N, R, b, p.get('kn', 1))
        self.KF = np.fft.rfft2(np.fft.ifftshift(K))
        self.g = FIELD_FUNC[p.get('gn', 1) - 1]
        self.world = np.zeros((N, N))

    def step(self):
        U = np.fft.irfft2(self.KF * np.fft.rfft2(self.world), s=(N, N))
        self.world = np.clip(self.world + self.dt * self.g(U, self.m, self.s), 0, 1)

    def mass(self):
        return self.world.sum()

def track_blob(sim, label, n_steps, every=200):
    """Следит за массой и числом блобов (связных областей > 0.1)."""
    from scipy import ndimage
    hist = []
    for i in range(n_steps):
        sim.step()
        if i % every == 0 or i == n_steps - 1:
            mask = sim.world > 0.1
            cnt = ndimage.label(mask)[1] if mask.any() else 0
            hist.append((i * sim.dt, sim.mass(), cnt))
    print(f'  {label}:')
    for t, m, c in hist:
        print(f'    t={t:7.1f}  mass={m:8.1f}  blobs={c}')
    return hist

def creature(c):
    return dict(R=c['R'], T=c['T'], b=c['b'], m=c['m'], s=c['s'], kn=c['kn'], gn=c['gn'])


def main():
    orb = ZOO['Orbium unicaudatus']
    orb_cells = np.array(orb['cells']).reshape(orb['h'], orb['w'])

    print('=== 1. Проверка rotateCells: орбий с поворотами 0..3 ===')
    vels = {}
    for r in range(4):
        cells = rot90_cw(orb_cells, r)
        sim = Sim(creature(orb))
        place_app(sim.world, cells, N // 2, N // 2)
        m0 = sim.mass()
        c0 = mass_center(sim.world)
        for _ in range(300):
            sim.step()
        m1 = sim.mass()
        c1 = mass_center(sim.world)
        # скорость в координатах текстуры (row, col); экран: x=col вправо, y=row ВВЕРХ
        dy_tex = (c1[0] - c0[0] + N / 2) % N - N / 2
        dx_tex = (c1[1] - c0[1] + N / 2) % N - N / 2
        vels[r] = (dy_tex, dx_tex)
        print(f'  rot {r}: mass {m0:.0f}->{m1:.0f} alive={0.3*m0 < m1 < 0.25*N*N}  '
              f'v_tex=(row{dy_tex:+.1f}, col{dx_tex:+.1f}) per 30 t.u.  '
              f'| экран: x{dx_tex:+.1f} y{-dy_tex:+.1f} (y вверх), угол {math.degrees(math.atan2(-dy_tex, dx_tex)):.0f}°')

    print()
    print('=== 2. Сцена "meet" (как в приложении сейчас), 30000 шагов = 3000 t.u. ===')
    sim = Sim(creature(orb))
    for x, y, r in [(76, 96, 0), (184, 150, 2), (168, 62, 1), (66, 198, 3)]:
        place_app(sim.world, rot90_cw(orb_cells, r), x, y)
    track_blob(sim, 'meet', 30000, every=2000)

    print()
    print('=== 3. Репликатор Aerogeminium repens, 30000 шагов ===')
    aero = ZOO['Aerogeminium repens']
    aero_cells = np.array(aero['cells']).reshape(aero['h'], aero['w'])
    sim = Sim(creature(aero))
    place_app(sim.world, aero_cells, N // 2, N // 2)
    track_blob(sim, 'aerogeminium', 30000, every=2000)

    print()
    print('=== 4. Репликатор Hydrogeminium saliens, 30000 шагов ===')
    hyd = ZOO['Hydrogeminium saliens']
    hyd_cells = np.array(hyd['cells']).reshape(hyd['h'], hyd['w'])
    sim = Sim(creature(hyd))
    place_app(sim.world, hyd_cells, N // 2, N // 2)
    track_blob(sim, 'hydrogeminium', 30000, every=2000)

    print()
    print('=== 5. Карусель: 6 орбиев по кольцу, курс по касательной ===')
    # базовый угол движения rot0 в экранных координатах
    dy0, dx0 = vels[0]
    ang0 = math.atan2(-dy0, dx0)  # экран, y вверх
    sim = Sim(creature(orb))
    R_ring = 80
    for k in range(6):
        th = 2 * math.pi * k / 6
        x = N / 2 + R_ring * math.cos(th)
        y = N / 2 + R_ring * math.sin(th)
        tang = th + math.pi / 2  # касательная (против часовой)
        need = math.degrees(tang - ang0)  # на сколько градусов повернуть курс
        r = round(need / 90) % 4
        place_app(sim.world, rot90_cw(orb_cells, r), x, y)
        print(f'    орбий {k}: pos=({x:.0f},{y:.0f}) rot={r}')
    track_blob(sim, 'carousel', 30000, every=2000)

    print()
    print('=== 6. Сосуществование видов под физикой орбия (R13 m0.15 s0.015) ===')
    for name in ['Gyrorbium gyrans', 'Scutium valvatus', 'Helicium solidus', 'Kronium solidus']:
        c = ZOO[name]
        cells = np.array(c['cells']).reshape(c['h'], c['w'])
        sim = Sim(creature(orb))  # физика орбия!
        place_app(sim.world, cells, N // 2, N // 2)
        m0 = sim.mass()
        for _ in range(400):
            sim.step()
        m1 = sim.mass()
        print(f'  {name:<26} под физикой орбия: mass {m0:.0f} -> {m1:.0f}  alive={0.3*m0 < m1 < 0.25*N*N}')


if __name__ == '__main__':
    main()
