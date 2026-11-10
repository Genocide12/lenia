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

interface Preset {
  id: string;
  label: string;
  desc: string;
}

const PRESETS: Preset[] = [
  {
    id: 'meet',
    label: 'Орбии навстречу',
    desc: 'Четыре орбия ползут в разные стороны. Столкновения запускают взрыв колонии — дайте сцене минуту.',
  },
  {
    id: 'division',
    label: 'Деление клетки',
    desc: 'Гидроблизнецы: тело перетягивается и делится на два организма. На скорости ×8 это занимает считанные секунды.',
  },
  {
    id: 'soup',
    label: 'Первичный бульон',
    desc: 'Случайные капли в «жизнепригодной» физике (μ=0.28, σ=0.05): рождаются и гибнут десятки организмов.',
  },
  {
    id: 'headon',
    label: 'Лоб в лоб',
    desc: 'Два орбия на одной прямой. Столкновения в Lenia непредсказуемы: существа могут разойтись, слиться или погибнуть.',
  },
];

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

  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(4);
  const [params, setParams] = useState<LeniaParams>(() => creatureParams(ORBIUM));
  const [paletteId, setPaletteId] = useState('bio');
  const [armed, setArmed] = useState<Creature | null>(null);
  const [rot, setRot] = useState(0);
  const [presetId, setPresetId] = useState('meet');
  const [physicsLabel, setPhysicsLabel] = useState('Орбий · Orbium unicaudatus');
  const [brush, setBrush] = useState({ radius: 10, strength: 0.85, erase: false });
  const [stats, setStats] = useState({ t: 0, mass: 0, fps: 0 });
  const paramsRef = useRef(params);

  const applyParams = useCallback((patch: Partial<LeniaParams>, label?: string) => {
    setParams((prev) => {
      const next = { ...prev, ...patch };
      engineRef.current?.setParams(patch);
      return next;
    });
    setPhysicsLabel(label ?? 'кастомная (ползунки)');
  }, []);

  /** Seed one of the curated scenes. Returns nothing; resets world + physics. */
  const seedPreset = useCallback((id: string, eng: LeniaEngine) => {
    eng.clear();
    simTimeRef.current = 0;
    armedRef.current = null;
    setArmed(null);
    setRot(0);
    rotRef.current = 0;
    if (id === 'division') {
      eng.setParams(creatureParams(HYDROGEMINIUM));
      setParams(creatureParams(HYDROGEMINIUM));
      setPhysicsLabel(`Гидроблизнецы · ${HYDROGEMINIUM.name}`);
      eng.placeCells(HYDROGEMINIUM.w, HYDROGEMINIUM.h, Float32Array.from(HYDROGEMINIUM.cells), N / 2, N / 2);
      setSpeed(8);
      speedRef.current = 8;
    } else if (id === 'soup') {
      eng.setParams(SOUP_PARAMS);
      setParams(SOUP_PARAMS);
      setPhysicsLabel('бульон · μ=0.28, σ=0.05, R=12');
      eng.randomize();
      setSpeed(6);
      speedRef.current = 6;
    } else if (id === 'headon') {
      eng.setParams(creatureParams(ORBIUM));
      setParams(creatureParams(ORBIUM));
      setPhysicsLabel('Орбий · Orbium unicaudatus');
      const a = rotateCells(ORBIUM.cells, ORBIUM.w, ORBIUM.h, 0);
      const b = rotateCells(ORBIUM.cells, ORBIUM.w, ORBIUM.h, 2);
      eng.placeCells(a.w, a.h, Float32Array.from(a.cells), 88, N / 2);
      eng.placeCells(b.w, b.h, Float32Array.from(b.cells), 168, N / 2);
      setSpeed(4);
      speedRef.current = 4;
    } else {
      // 'meet' — default
      eng.setParams(creatureParams(ORBIUM));
      setParams(creatureParams(ORBIUM));
      setPhysicsLabel('Орбий · Orbium unicaudatus');
      const spots: Array<[number, number, number]> = [
        [76, 96, 0],
        [184, 150, 2],
        [168, 62, 1],
        [66, 198, 3],
      ];
      for (const [x, y, r] of spots) {
        const rc = rotateCells(ORBIUM.cells, ORBIUM.w, ORBIUM.h, r);
        eng.placeCells(rc.w, rc.h, Float32Array.from(rc.cells), x, y);
      }
      setSpeed(4);
      speedRef.current = 4;
    }
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
    queueMicrotask(() => seedPreset('meet', engine));

    const loop = (now: number) => {
      const eng = engineRef.current;
      if (eng) {
        try {
          if (lastFrameRef.current) {
            const dtms = now - lastFrameRef.current;
            if (dtms > 0 && dtms < 500) {
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
          if (frameCountRef.current % 20 === 0) {
            setStats({
              t: simTimeRef.current,
              mass: eng.getMass(),
              fps: fpsRef.current,
            });
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
  }, [seedPreset]);

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
        engineRef.current?.randomize();
      } else if (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') {
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

  const presetDesc = PRESETS.find((p) => p.id === presetId)?.desc ?? '';

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
                14 существ из оригинальной библиотеки
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
                  onClick={() => engineRef.current?.randomize()}
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  aria-label="Случайное поле"
                >
                  <Dices className="h-4 w-4" />
                  Случайное
                </Button>
                <Button
                  onClick={() => engineRef.current?.clear()}
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
                    if (eng) seedPreset(presetId, eng);
                  }}
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  aria-label="Перезапустить сцену"
                >
                  <RotateCcw className="h-4 w-4" />
                  Сцену заново
                </Button>

                <div className="ml-auto flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <span>t = {stats.t.toFixed(0)}</span>
                  <span className="text-emerald-500/60">·</span>
                  <span>M = {stats.mass.toFixed(0)}</span>
                  <span className="text-emerald-500/60">·</span>
                  <span>{stats.fps.toFixed(0)} FPS</span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-xs text-muted-foreground">Сцена</span>
                  <Select
                    value={presetId}
                    onValueChange={(v) => {
                      const eng = engineRef.current;
                      if (eng) seedPreset(v, eng);
                    }}
                  >
                    <SelectTrigger className="h-8 w-44" aria-label="Сцена-пресет">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESETS.map((p) => (
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
                    max={8}
                    step={1}
                    aria-label="Скорость симуляции"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-xs text-muted-foreground">Палитра</span>
                  <Select value={paletteId} onValueChange={setPaletteId}>
                    <SelectTrigger className="h-8 w-44" aria-label="Цветовая палитра">
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
                Внимание: у каждого вида своя физика — существа «чужих» законов обычно
                погибают, это не баг, а суть Lenia.
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
                              {c.speed >= 0.5 ? ` · ~${c.speed.toFixed(1)} кл/с` : ''}
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
