'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipForward, Dices, Trash2, RotateCcw, Brush, Eraser, RotateCcwSquare, RotateCwSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CREATURES, type Creature } from '@/lib/lenia/creatures';
import {
  LeniaEngine,
  PALETTES,
  KERNEL_NAMES,
  GROWTH_NAMES,
  type LeniaParams,
  type Palette,
} from '@/lib/lenia/engine';
import { CreatureThumb } from '@/components/lenia/CreatureThumb';
import { KernelPlot, GrowthPlot } from '@/components/lenia/Plots';
import { HowItWorks } from '@/components/lenia/HowItWorks';

const N = 256;
const ORBIUM = CREATURES[0]; // Orbium unicaudatus
const HYDROGEMINIUM = CREATURES.find((c) => c.name === 'Hydrogeminium saliens')!;

/** «Жизнепригодная» физика для первичного бульона (проверено эталонной симуляцией). */
const SOUP_PARAMS: LeniaParams = { R: 12, dt: 0.1, m: 0.28, s: 0.05, b: [1], kn: 1, gn: 1 };

interface SceneDef {
  id: string;
  label: string;
  desc: string;
  speed: number;
  /** Порог массы, ниже которого сцена считается погибшей (авто-возрождение). */
  deadBelow: number;
  /** Порог популяционного коллапса (например, стычки в «встречке»). */
  collapseBelow?: number;
}

const SCENES: SceneDef[] = [
  {
    id: 'school',
    label: 'Стая орбиев',
    desc: 'Девять орбиев одним курсом. У параллельных траекторий на торе расстояния постоянны — соседи по стае не столкнутся никогда. Проверено эталонной симуляцией: 3000 единиц времени без единой гибели.',
    speed: 2,
    deadBelow: 15,
  },
  {
    id: 'counter',
    label: 'Встречное движение',
    desc: 'Две четвёрки навстречу друг другу. Встречные курсы на торе неизбежно пересекаются: стычки, слияния, гибели. Когда население падает, мир заселяет сцену заново.',
    speed: 2,
    deadBelow: 15,
    collapseBelow: 260,
  },
  {
    id: 'division',
    label: 'Деление клетки',
    desc: 'Гидроблизнецы: организм перетягивается и делится надвое, потомки расходятся и встречаются вновь. Цикл повторяется неограниченно долго.',
    speed: 8,
    deadBelow: 100,
  },
  {
    id: 'headon',
    label: 'Лоб в лоб',
    desc: 'Два орбия на одной геодезической. Исход закономерен — полная аннигиляция до последней капли вещества. Мир возрождает пару — со слегка другими начальными условиями.',
    speed: 2,
    deadBelow: 15,
  },
  {
    id: 'soup',
    label: 'Первичный бульон',
    desc: 'Случайные капли в «жизнепригодной» физике (μ=0.28, σ=0.05): из хаоса собираются организмы, живут и гибнут, а поле постепенно кристаллизуется в узор — тогда мир получает новую порцию органики.',
    speed: 3,
    deadBelow: 15,
  },
];

/** Точный курс орбия при rot=1 (выверен эталонной симуляцией), экранные координаты. */
const ORB_U: readonly [number, number] = [-0.927, -0.373];
const ORB_P: readonly [number, number] = [0.373, -0.927];
const CENTER = 128;

function creatureParams(c: Creature): LeniaParams {
  return { R: c.R, dt: 1 / c.T, m: c.m, s: c.s, b: c.b, kn: c.kn, gn: c.gn };
}

/** Rotate a creature pattern by 90° increments (Lenia is rotation-equivariant). */
function rotateCells(cells: number[], w: number, h: number, quarterTurns: number): { cells: number[]; w: number; h: number } {
  let cur = cells.slice();
  let cw = w;
  let ch = h;
  for (let t = 0; t < ((quarterTurns % 4) + 4) % 4; t++) {
    const next = new Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        next[x * ch + (ch - 1 - y)] = cur[y * cw + x];
      }
    }
    cur = next;
    const tmp = cw;
    cw = ch;
    ch = tmp;
  }
  return { cells: cur, w: cw, h: ch };
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<LeniaEngine | null>(null);
  const rafRef = useRef<number>(0);
  const runningRef = useRef(true);
  const speedRef = useRef(4);
  const simTimeRef = useRef(0);
  const armedRef = useRef<Creature | null>(null);
  const rotRef = useRef(0);
  const brushRef = useRef({ radius: 10, strength: 0.85, erase: false });
  const paintingRef = useRef(false);
  const lastPtRef = useRef<[number, number] | null>(null);
  const frameCountRef = useRef(0);
  const fpsRef = useRef(0);
  const lastFrameRef = useRef(0);
  /** Состояние авто-возрождения: счётчик «тощих» замеров, льготный период после посева, снимок для замера «замершего» мира. */
  const reviveStateRef = useRef({ lowFrames: 0, grace: 140, snapMass: -1, snapCx: 0, snapCy: 0, snapM2: 0 });
  const autoReviveRef = useRef(true);
  const presetIdRef = useRef('school');

  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [params, setParams] = useState<LeniaParams>(() => creatureParams(ORBIUM));
  const [paletteId, setPaletteId] = useState('bio');
  const [armed, setArmed] = useState<Creature | null>(null);
  const [rot, setRot] = useState(0);
  const [presetId, setPresetId] = useState('school');
  const [physicsLabel, setPhysicsLabel] = useState('Орбий · Orbium unicaudatus');
  const [brush, setBrush] = useState({ radius: 10, strength: 0.85, erase: false });
  const [stats, setStats] = useState({ t: 0, mass: 0, fps: 0 });
  const [autoRevive, setAutoRevive] = useState(true);
  const [revives, setRevives] = useState(0);
  const paramsRef = useRef(params);

  /** Ручная правка мира отключает авто-возрождение (не спорим с пользователем). */
  const manualEdit = useCallback(() => {
    autoReviveRef.current = false;
    setAutoRevive(false);
  }, []);

  const applyParams = useCallback((patch: Partial<LeniaParams>, label?: string) => {
    manualEdit();
    setParams((prev) => {
      const next = { ...prev, ...patch };
      engineRef.current?.setParams(patch);
      return next;
    });
    setPhysicsLabel(label ?? 'кастомная (ползунки)');
  }, []);

  /** Seed one of the curated scenes. `vary` adds jitter so revived scenes differ. */
  const seedScene = useCallback((id: string, eng: LeniaEngine, vary = false) => {
    eng.clear();
    simTimeRef.current = 0;
    armedRef.current = null;
    setArmed(null);
    setRot(0);
    rotRef.current = 0;
    const scene = SCENES.find((s) => s.id === id) ?? SCENES[0];
    if (id === 'division') {
      eng.setParams(creatureParams(HYDROGEMINIUM));
      setParams(creatureParams(HYDROGEMINIUM));
      setPhysicsLabel(`Гидроблизнецы · ${HYDROGEMINIUM.name}`);
      eng.placeCells(HYDROGEMINIUM.w, HYDROGEMINIUM.h, Float32Array.from(HYDROGEMINIUM.cells), N / 2, N / 2);
    } else if (id === 'soup') {
      eng.setParams(SOUP_PARAMS);
      setParams(SOUP_PARAMS);
      setPhysicsLabel('бульон · μ=0.28, σ=0.05, R=12');
      eng.randomize();
    } else if (id === 'headon') {
      eng.setParams(creatureParams(ORBIUM));
      setParams(creatureParams(ORBIUM));
      setPhysicsLabel('Орбий · Orbium unicaudatus');
      // Пара на одной геодезической; при возрождении меняем ось и добавляем сдвиг
      // ось rot0: (0.373, -0.927), пара rot0/rot2; ось rot1: (-0.927, -0.373), пара rot1/rot3
      const useRot1Axis = vary && Math.random() < 0.5;
      const ux = useRot1Axis ? ORB_U[0] : 0.373;
      const uy = useRot1Axis ? ORB_U[1] : -0.927;
      const aRot = useRot1Axis ? 1 : 0;
      const bRot = useRot1Axis ? 3 : 2;
      const jx = vary ? (Math.random() - 0.5) * 8 : 0;
      const jy = vary ? (Math.random() - 0.5) * 8 : 0;
      const ax = 88 + jx;
      const ay = 128 + jy;
      const bx = ((ax + 240 * ux) % N + N) % N;
      const by = ((ay + 240 * uy) % N + N) % N;
      const a = rotateCells(ORBIUM.cells, ORBIUM.w, ORBIUM.h, aRot);
      const b = rotateCells(ORBIUM.cells, ORBIUM.w, ORBIUM.h, bRot);
      eng.placeCells(a.w, a.h, Float32Array.from(a.cells), ax, ay);
      eng.placeCells(b.w, b.h, Float32Array.from(b.cells), bx, by);
    } else if (id === 'counter') {
      eng.setParams(creatureParams(ORBIUM));
      setParams(creatureParams(ORBIUM));
      setPhysicsLabel('Орбий · Orbium unicaudatus');
      // Две группы на параллельных «дорожках», курс — навстречу
      for (const [q, r] of [[-60, 1], [-20, 1], [68, 3], [108, 3]] as const) {
        const dsign = r === 1 ? 1 : -1;
        for (const s of [-40, 40]) {
          const jx = vary ? (Math.random() - 0.5) * 6 : 0;
          const jy = vary ? (Math.random() - 0.5) * 6 : 0;
          const x = CENTER + q * ORB_P[0] + s * dsign * ORB_U[0] + jx;
          const y = CENTER + q * ORB_P[1] + s * dsign * ORB_U[1] + jy;
          const rc = rotateCells(ORBIUM.cells, ORBIUM.w, ORBIUM.h, r);
          eng.placeCells(rc.w, rc.h, Float32Array.from(rc.cells), x, y);
        }
      }
    } else {
      // 'school' — умолчание: 9 орбиев строем, параллельные курсы
      eng.setParams(creatureParams(ORBIUM));
      setParams(creatureParams(ORBIUM));
      setPhysicsLabel('Орбий · Orbium unicaudatus');
      for (const q of [-34, 0, 34]) {
        for (const s of [-56, 0, 56]) {
          const x = CENTER + q * ORB_P[0] + s * ORB_U[0];
          const y = CENTER + q * ORB_P[1] + s * ORB_U[1];
          const rc = rotateCells(ORBIUM.cells, ORBIUM.w, ORBIUM.h, 1);
          eng.placeCells(rc.w, rc.h, Float32Array.from(rc.cells), x, y);
        }
      }
    }
    setSpeed(scene.speed);
    speedRef.current = scene.speed;
    reviveStateRef.current = { lowFrames: 0, grace: 140, snapMass: -1, snapCx: 0, snapCy: 0, snapM2: 0 };
    // явная смена/перезапуск сцены возвращает демо-режим с авто-возрождением
    autoReviveRef.current = true;
    setAutoRevive(true);
    setPresetId(id);
    setRunning(true);
    runningRef.current = true;
  }, []);

  // Engine lifecycle + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: LeniaEngine;
    try {
      engine = new LeniaEngine(canvas, N, creatureParams(ORBIUM), PALETTES[0]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      queueMicrotask(() => setError(msg));
      return;
    }
    engineRef.current = engine;
    queueMicrotask(() => seedScene('school', engine));

    const loop = (now: number) => {
      const eng = engineRef.current;
      if (eng) {
        try {
          if (lastFrameRef.current) {
            const dtms = now - lastFrameRef.current;
            if (dtms > 0 && dtms < 2000) {
              fpsRef.current = fpsRef.current === 0 ? 1000 / dtms : fpsRef.current * 0.9 + (1000 / dtms) * 0.1;
            }
          }
          lastFrameRef.current = now;
          if (runningRef.current) {
            const spd = speedRef.current;
            for (let i = 0; i < spd; i++) eng.step();
            simTimeRef.current += spd * paramsRef.current.dt;
          }
          eng.render();
          frameCountRef.current++;
          const fc = frameCountRef.current;
          // льготный период после посева тикает каждый кадр, а не каждый замер
          if (reviveStateRef.current.grace > 0) reviveStateRef.current.grace--;
          if (fc % 20 === 0) {
            const st = eng.getStats();
            setStats({
              t: simTimeRef.current,
              mass: st.mass,
              fps: fpsRef.current,
            });
            // — Авто-возрождение мира —
            const rv = reviveStateRef.current;
            const scene = SCENES.find((s) => s.id === presetIdRef.current) ?? SCENES[0];
            if (autoReviveRef.current && runningRef.current && !paintingRef.current) {
              const dead = st.mass < scene.deadBelow;
              const collapsed = scene.collapseBelow !== undefined && st.mass < scene.collapseBelow;
              if (dead || collapsed) {
                rv.lowFrames++;
              } else {
                rv.lowFrames = 0;
              }
              // замерший мир: масса, центроид и разброс массы почти не меняются 4 с подряд
              if (rv.snapMass >= 0) {
                const dx = Math.min(Math.abs(st.cx - rv.snapCx), N - Math.abs(st.cx - rv.snapCx));
                const dy = Math.min(Math.abs(st.cy - rv.snapCy), N - Math.abs(st.cy - rv.snapCy));
                const frozen =
                  Math.abs(st.mass - rv.snapMass) < 0.8 &&
                  Math.hypot(dx, dy) < 2.5 &&
                  Math.abs(st.mom2 - rv.snapM2) < 25 &&
                  st.mass > 30;
                if (frozen) rv.lowFrames += 20; // замер — возрождаем без промедления
              }
              if (rv.snapMass < 0 || fc % 240 === 0) {
                rv.snapMass = st.mass;
                rv.snapCx = st.cx;
                rv.snapCy = st.cy;
                rv.snapM2 = st.mom2;
              }
              if (rv.lowFrames >= 15) {
                // ~3 с подряд мир тощ или замер — пересеваем с вариациями
                seedScene(presetIdRef.current, eng, true);
                setRevives((n) => n + 1);
              }
            }
          }
        } catch (err) {
          runningRef.current = false;
          const msg = err instanceof Error ? err.message : String(err);
          queueMicrotask(() => {
            setError(msg);
            setRunning(false);
          });
          return; // stop the loop on error instead of dying silently
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      engine.destroy();
      engineRef.current = null;
    };
  }, [seedScene]);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    autoReviveRef.current = autoRevive;
  }, [autoRevive]);
  useEffect(() => {
    presetIdRef.current = presetId;
  }, [presetId]);
  useEffect(() => {
    brushRef.current = brush;
  }, [brush]);
  useEffect(() => {
    rotRef.current = rot;
  }, [rot]);

  // Palette
  useEffect(() => {
    const pal = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];
    engineRef.current?.setPalette(pal);
  }, [paletteId]);

  // Wheel over canvas rotates the armed creature (non-passive to prevent page scroll)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      if (!armedRef.current) return;
      e.preventDefault();
      setRot((r) => (r + (e.deltaY > 0 ? 90 : -90) + 360) % 360);
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setRunning((r) => !r);
      } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        manualEdit();
        engineRef.current?.randomize();
      } else if (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') {
        manualEdit();
        engineRef.current?.clear();
      } else if (e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й') {
        if (armedRef.current) setRot((r) => (r + 270) % 360);
      } else if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') {
        if (armedRef.current) setRot((r) => (r + 90) % 360);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toGrid = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const gx = ((e.clientX - rect.left) / rect.width) * N;
    const gy = (1 - (e.clientY - rect.top) / rect.height) * N;
    return [gx, gy];
  };

  const paintStroke = (from: [number, number], to: [number, number], erase: boolean) => {
    const eng = engineRef.current;
    if (!eng) return;
    const { radius, strength } = brushRef.current;
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      eng.paint(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, radius, strength, erase);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toGrid(e);
    const c = armedRef.current;
    if (c) {
      const rc = rotateCells(c.cells, c.w, c.h, rotRef.current / 90);
      engineRef.current?.placeCells(rc.w, rc.h, Float32Array.from(rc.cells), pt[0], pt[1]);
      if (!e.shiftKey) {
        armedRef.current = null;
        setArmed(null);
      }
      return;
    }
    paintingRef.current = true;
    manualEdit();
    lastPtRef.current = pt;
    paintStroke(pt, pt, brushRef.current.erase || e.button === 2);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current) return;
    const pt = toGrid(e);
    const last = lastPtRef.current ?? pt;
    paintStroke(last, pt, brushRef.current.erase || e.buttons === 2);
    lastPtRef.current = pt;
  };

  const onPointerUp = () => {
    paintingRef.current = false;
    lastPtRef.current = null;
  };

  const armCreature = (c: Creature) => {
    armedRef.current = c;
    setArmed(c);
    setRot(0);
    rotRef.current = 0;
    applyParams(creatureParams(c), `${c.ru} · ${c.name}`);
  };

  const presetDesc = SCENES.find((p) => p.id === presetId)?.desc ?? '';

  return (
    <div
      className="dark flex min-h-screen flex-col text-neutral-100"
      style={
        {
          '--background': '#05090b',
          '--card': '#0b1210',
          '--popover': '#0d1512',
          '--border': 'rgba(255,255,255,0.09)',
          '--input': 'rgba(255,255,255,0.12)',
          '--muted': '#101915',
          '--muted-foreground': '#8ba79a',
          '--secondary': '#0f1a15',
          '--secondary-foreground': '#d7efe2',
          '--accent': '#122019',
          '--accent-foreground': '#d7efe2',
          '--primary': '#10b981',
          '--primary-foreground': '#032015',
          '--ring': '#10b981',
        } as React.CSSProperties
      }
    >
      <header className="border-b border-white/5">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="bg-gradient-to-r from-emerald-300 via-teal-200 to-lime-200 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-6xl">
                Lenia
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Непрерывная «Жизнь» Конвея: гладкое поле вместо клеток, дифференциальное
                время вместо тактов — и цифровые организмы, которые ползут, делятся и
                умирают по-настоящему. Всё считается в вашем браузере (WebGL2).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-emerald-800/60 text-emerald-400">
                256×256 · тор
              </Badge>
              <Badge variant="outline" className="border-emerald-800/60 text-emerald-400">
                {CREATURES.length} существ из оригинальной библиотеки
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
        {error ? (
          <Card className="border-destructive/40 p-6">
            <p className="font-medium text-destructive">Симуляция остановлена из-за ошибки</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_370px]">
            {/* Canvas column */}
            <div>
              <Card className="overflow-hidden border-white/10 p-2 sm:p-3">
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    className={`aspect-square w-full touch-none select-none ${armed ? 'cursor-crosshair' : 'cursor-cell'}`}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-label="Поле симуляции Lenia"
                  />
                  {armed && (
                    <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
                      <div className="rounded-full border border-emerald-500/40 bg-black/70 px-3 py-1 text-xs font-medium text-emerald-300 backdrop-blur">
                        «{armed.ru}» · клик — посадить{` `}
                        <span className="text-emerald-500/70">(Shift — несколько)</span>
                        {` · поворот ${rot}°`}
                      </div>
                      <div className="pointer-events-auto flex gap-1">
                        <button
                          onClick={() => setRot((r) => (r + 270) % 360)}
                          className="rounded-full border border-emerald-500/40 bg-black/70 p-1.5 text-emerald-300 backdrop-blur transition-colors hover:bg-emerald-950/60"
                          aria-label="Повернуть против часовой стрелки"
                        >
                          <RotateCcwSquare className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setRot((r) => (r + 90) % 360)}
                          className="rounded-full border border-emerald-500/40 bg-black/70 p-1.5 text-emerald-300 backdrop-blur transition-colors hover:bg-emerald-950/60"
                          aria-label="Повернуть по часовой стрелке"
                        >
                          <RotateCwSquare className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Toolbar */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => setRunning((r) => !r)}
                  variant={running ? 'secondary' : 'default'}
                  size="sm"
                  className="gap-1.5"
                  aria-label={running ? 'Пауза' : 'Продолжить'}
                >
                  {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {running ? 'Пауза' : 'Пуск'}
                </Button>
                <Button
                  onClick={() => {
                    if (!running) {
                      engineRef.current?.step();
                      simTimeRef.current += paramsRef.current.dt;
                    }
                  }}
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  disabled={running}
                  aria-label="Один шаг"
                >
                  <SkipForward className="h-4 w-4" />
                  Шаг
                </Button>
                <Button
                  onClick={() => {
                    manualEdit();
                    engineRef.current?.randomize();
                  }}
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  aria-label="Случайное поле"
                >
                  <Dices className="h-4 w-4" />
                  Случайное
                </Button>
                <Button
                  onClick={() => {
                    manualEdit();
                    engineRef.current?.clear();
                  }}
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  aria-label="Очистить поле"
                >
                  <Trash2 className="h-4 w-4" />
                  Очистить
                </Button>
                <Button
                  onClick={() => {
                    const eng = engineRef.current;
                    if (eng) seedScene(presetIdRef.current, eng);
                  }}
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  aria-label="Перезапустить сцену"
                >
                  <RotateCcw className="h-4 w-4" />
                  Сцену заново
                </Button>

                <div
                  className="ml-auto flex items-center gap-2 font-mono text-xs text-muted-foreground"
                  data-testid="stats"
                >
                  <span>t = {stats.t.toFixed(0)}</span>
                  <span className="text-emerald-500/60">·</span>
                  <span>M = {stats.mass.toFixed(0)}</span>
                  <span className="text-emerald-500/60">·</span>
                  <span>{stats.fps.toFixed(0)} FPS</span>
                  {revives > 0 && (
                    <span className="text-emerald-400/80" title="Сколько раз мир сам пересеял погибшую или замершую сцену">
                      ↻ {revives}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-xs text-muted-foreground">Сцена</span>
                  <Select
                    value={presetId}
                    onValueChange={(v) => {
                      const eng = engineRef.current;
                      if (eng) seedScene(v, eng);
                    }}
                  >
                    <SelectTrigger className="h-8 w-44" aria-label="Сцена-пресет">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCENES.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-52 flex-1 items-center gap-3">
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    Скорость ×{speed}
                  </span>
                  <Slider
                    value={[speed]}
                    onValueChange={([v]) => setSpeed(v)}
                    min={1}
                    max={16}
                    step={1}
                    aria-label="Скорость симуляции"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap text-xs text-muted-foreground">Палитра</span>
                    <Select value={paletteId} onValueChange={setPaletteId}>
                      <SelectTrigger className="h-8 w-36" aria-label="Цветовая палитра">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PALETTES.map((p: Palette) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div
                    className="flex cursor-pointer select-none items-center gap-2"
                    title="Если мир вымер или застыл — пересеять сцену заново. Ручные правки поля отключают возрождение"
                  >
                    <span
                      id="auto-revive-label"
                      className="whitespace-nowrap text-xs text-muted-foreground"
                    >
                      Возрождение
                    </span>
                    <Switch
                      checked={autoRevive}
                      onCheckedChange={setAutoRevive}
                      aria-labelledby="auto-revive-label"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-x-4">
                <Badge variant="outline" className="w-fit max-w-full truncate border-emerald-900/60 font-normal text-emerald-300/90">
                  физика мира: {physicsLabel}
                </Badge>
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {presetDesc}
                </p>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Кисть: тяните мышью — рисуете живое вещество, правая кнопка — стираете.
                Пробел — пауза, R — случайное поле, C — очистить, Q/E — поворот существа.
                У каждого вида своя физика: существа «чужих» законов обычно погибают —
                это не баг, а суть Lenia.
              </p>
            </div>

            {/* Side panel */}
            <Card className="h-fit border-white/10 p-4">
              <Tabs defaultValue="creatures">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="creatures">Существа</TabsTrigger>
                  <TabsTrigger value="physics">Физика</TabsTrigger>
                  <TabsTrigger value="brush">Кисть</TabsTrigger>
                </TabsList>

                <TabsContent value="creatures" className="mt-4">
                  <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                    Кликните по существу, затем по полю — физика мира подстроится под него.
                    Колесо мыши или Q/E поворачивает существо перед посадкой.{' '}
                    <span className="text-amber-400/90">
                      Виды с разной физикой несовместимы: посадка «чужака» обрекает
                      прежних обитателей.
                    </span>
                  </p>
                  <ScrollArea className="max-h-[560px] pr-3">
                    <div className="grid grid-cols-2 gap-2">
                      {CREATURES.map((c) => (
                        <button
                          key={c.name}
                          onClick={() => armCreature(c)}
                          className={`group flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                            armed?.id === c.id
                              ? 'border-emerald-500/70 bg-emerald-950/40'
                              : 'border-white/10 bg-white/[0.02] hover:border-emerald-900/60 hover:bg-emerald-950/20'
                          }`}
                          aria-pressed={armed?.id === c.id}
                        >
                          <CreatureThumb creature={c} size={52} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{c.ru}</span>
                            <span className="block truncate text-[11px] italic text-muted-foreground">
                              {c.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] uppercase tracking-wide text-emerald-500/80">
                              {c.kindRu}
                              {c.speed >= 0.5 ? ` · ~${c.speed.toFixed(1)} кл/t.u.` : ''}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                  {armed && (
                    <p className="mt-3 rounded-md border border-emerald-900/40 bg-emerald-950/20 p-2.5 text-xs leading-relaxed text-emerald-200/90">
                      {armed.desc}
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="physics" className="mt-4 space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor="mu" className="text-xs">μ — центр роста</Label>
                      <span className="font-mono text-xs text-emerald-400">{params.m.toFixed(3)}</span>
                    </div>
                    <Slider
                      id="mu"
                      value={[params.m]}
                      onValueChange={([v]) => applyParams({ m: v })}
                      min={0.05}
                      max={0.45}
                      step={0.001}
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor="sigma" className="text-xs">σ — ширина роста</Label>
                      <span className="font-mono text-xs text-emerald-400">{params.s.toFixed(3)}</span>
                    </div>
                    <Slider
                      id="sigma"
                      value={[params.s]}
                      onValueChange={([v]) => applyParams({ s: v })}
                      min={0.005}
                      max={0.08}
                      step={0.001}
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor="R" className="text-xs">R — радиус ядра</Label>
                      <span className="font-mono text-xs text-emerald-400">{params.R}</span>
                    </div>
                    <Slider
                      id="R"
                      value={[params.R]}
                      onValueChange={([v]) => applyParams({ R: Math.round(v) })}
                      min={5}
                      max={30}
                      step={1}
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor="dt" className="text-xs">Δt — шаг времени</Label>
                      <span className="font-mono text-xs text-emerald-400">{params.dt.toFixed(3)}</span>
                    </div>
                    <Slider
                      id="dt"
                      value={[params.dt]}
                      onValueChange={([v]) => applyParams({ dt: v })}
                      min={0.02}
                      max={0.25}
                      step={0.005}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Ядро</Label>
                      <Select
                        value={String(params.kn)}
                        onValueChange={(v) => applyParams({ kn: Number(v) })}
                      >
                        <SelectTrigger className="mt-1.5 h-8 w-full" aria-label="Форма ядра">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(KERNEL_NAMES).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Рост</Label>
                      <Select
                        value={String(params.gn)}
                        onValueChange={(v) => applyParams({ gn: Number(v) })}
                      >
                        <SelectTrigger className="mt-1.5 h-8 w-full" aria-label="Функция роста">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(GROWTH_NAMES).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <KernelPlot R={params.R} b={params.b} kn={params.kn} />
                    </div>
                    <div>
                      <GrowthPlot m={params.m} s={params.s} gn={params.gn} />
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Ползунки меняют законы природы на лету. Слишком большой Δt «взбалтывает»
                    мир, маленькая σ делает организмы хрупкими, а μ задаёт плотность, при
                    которой жизнь вообще возможна. Сдвинули — и вернуться к «родной» физике
                    вида можно, посадив его заново.
                  </p>
                </TabsContent>

                <TabsContent value="brush" className="mt-4 space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor="brushR" className="text-xs">Радиус кисти</Label>
                      <span className="font-mono text-xs text-emerald-400">{brush.radius} кл.</span>
                    </div>
                    <Slider
                      id="brushR"
                      value={[brush.radius]}
                      onValueChange={([v]) => setBrush((b) => ({ ...b, radius: v }))}
                      min={2}
                      max={40}
                      step={1}
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor="brushS" className="text-xs">Сила</Label>
                      <span className="font-mono text-xs text-emerald-400">{brush.strength.toFixed(2)}</span>
                    </div>
                    <Slider
                      id="brushS"
                      value={[brush.strength]}
                      onValueChange={([v]) => setBrush((b) => ({ ...b, strength: v }))}
                      min={0.1}
                      max={1}
                      step={0.05}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {brush.erase ? (
                        <Eraser className="h-4 w-4 text-amber-400" />
                      ) : (
                        <Brush className="h-4 w-4 text-emerald-400" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{brush.erase ? 'Ластик' : 'Рисование'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {brush.erase ? 'стирает вещество с поля' : 'добавляет живое вещество'}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={brush.erase}
                      onCheckedChange={(v) => setBrush((b) => ({ ...b, erase: v }))}
                      aria-label="Режим ластика"
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Порисуйте поверх существа — и посмотрите, как оно{' '}
                    <span className="text-emerald-300">самовосстанавливается</span>: Lenia-организмы
                    умеют залечивать раны, если повреждение не слишком велико.
                  </p>
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        )}

        <HowItWorks />
      </main>

      <footer className="mt-auto border-t border-white/5">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground">
          <span>
            Lenia — проект Bert Wang-Chak Chan · существа и формулы из оригинальной
            библиотеки
          </span>
          <span>
            Реконструкция: Next.js + WebGL2 · проверено эталонной симуляцией (NumPy)
          </span>
        </div>
      </footer>
    </div>
  );
}
