#!/usr/bin/env python3
"""Export the verified creature zoo to src/lib/lenia/creatures.ts"""
import pickle, json
from fractions import Fraction

CHOSEN = [
    # (name, ru, kind, desc)
    ('Orbium unicaudatus', 'Орбий', 'glider',
     'Первооткрыватель Lenia — непрерывный потомок глайдера Конвея. Ровно скользит по тору.'),
    ('Orbium phantasma', 'Призрак', 'glider',
     'Самый быстрый бегун зоопарка — полупрозрачный и стремительный.'),
    ('Scutium valvatus', 'Щит', 'glider',
     'Плотный «бронированный» глайдер с характерной створкой.'),
    ('Scutium serratus fluens', 'Пила', 'glider',
     'Зубчатый пловец с плавниками по краю тела.'),
    ('Aerogeminium repens', 'Близнецы', 'replicator',
     'Самовоспроизводящийся организм: медленно перетягивается и делится. В тесном мире дочерние особи нередко сливаются вновь — честная борьба за индивидуальность.'),
    ('Hydrogeminium saliens', 'Гидроблизнецы', 'replicator',
     'Самый крупный организм зоопарка (R=27). Наблюдайте цитокинезу: тело перетягивается и распадается на две — без единой лишней строчки кода.'),
    ('Helicium solidus', 'Спираль', 'oscillator',
     'Закрученная волна-солитон; медленно вращается на месте.'),
    ('Gyrorbium gyrans', 'Волчок', 'rotator',
     'Крутится вокруг своей оси, почти не смещаясь.'),
    ('Florakronium arcus', 'Цветок', 'glider',
     'Структура с «лепестками»; плывёт мягкими дугами.'),
    ('Vagorbium undulatus', 'Странник', 'glider',
     'Вечно в движении — петляет по миру, огибая невидимые преграды.'),
    ('Lobster (diagonal c/7)', 'Лобстер', 'glider',
     'Формой напоминает лобстера; шагает по диагонали, как глайдер из «Жизни».'),
    ('Bug (smaller)', 'Жук', 'glider',
     'Компактное «насекомое»; хорошо подходит для экспериментов со столкновениями.'),
    ('Galaxy (oscillator)', 'Галактика', 'oscillator',
     'Осциллятор: пульсирует на месте, не перемещаясь.'),
    ('Kronium solidus', 'Крониум', 'glider',
     'Массивный и очень стабильный тяжеловес.'),
]

KIND_RU = {
    'glider': 'глайдер', 'oscillator': 'осциллятор',
    'replicator': 'репликатор', 'rotator': 'ротатор',
}

zoo = pickle.load(open('/tmp/zoo.pkl', 'rb'))
by_name = {z['name']: z for z in zoo}

out = []
for name, ru, kind, desc in CHOSEN:
    z = by_name[name]
    p = z['params']
    b = [float(Fraction(x)) for x in str(p['b']).split(',')]
    cells = [round(float(v), 4) for v in z['cells'].ravel()]
    out.append({
        'id': z['code'], 'name': name, 'ru': ru, 'desc': desc,
        'kind': kind, 'kindRu': KIND_RU[kind],
        'speed': round(z['speed'], 2),
        'R': p['R'], 'T': p['T'], 'b': b, 'm': p['m'], 's': p['s'],
        'kn': p.get('kn') or 1, 'gn': p.get('gn') or 1,
        'w': z['shape'][1], 'h': z['shape'][0], 'cells': cells,
    })
    print(f"{z['code']:>6} {name:<28} R={p['R']} T={p['T']} b={b} m={p['m']} s={p['s']} "
          f"kn={p.get('kn') or 1} gn={p.get('gn') or 1} {z['shape']} speed={z['speed']:.2f}")

hdr = '''// Автоматически сгенерировано из оригинальной библиотеки существ Lenia
// (Bert Wang-Chak Chan, github.com/Chakazul/Lenia, Python/animals.json).
// Каждое существо проверено эталонной симуляцией (NumPy): выживает и сохраняет форму.
export interface Creature {
  id: string;
  name: string;
  ru: string;
  desc: string;
  kind: 'glider' | 'oscillator' | 'replicator' | 'rotator';
  kindRu: string;
  speed: number; // клеток за единицу времени (0 = на месте)
  R: number; T: number; b: number[]; m: number; s: number; kn: number; gn: number;
  w: number; h: number;
  cells: number[]; // row-major, значения 0..1
}

'''
body = 'export const CREATURES: Creature[] = ' + json.dumps(out, ensure_ascii=False, indent=2) + ';\n'
body += '''
export const CREATURE_BY_ID: Record<string, Creature> = Object.fromEntries(
  CREATURES.map((c) => [c.id, c]),
);
'''
with open('/home/z/my-project/src/lib/lenia/creatures.ts', 'w') as f:
    f.write(hdr + body)
print('\nwritten src/lib/lenia/creatures.ts,', len(out), 'creatures')
