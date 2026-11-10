'use client';

import { useMemo } from 'react';
import { growthFunc, kernelAt } from '@/lib/lenia/engine';

interface PlotProps {
  R: number;
  b: number[];
  kn: number;
  m: number;
  s: number;
  gn: number;
}

function pathFrom(points: [number, number][], w: number, h: number, maxY: number): string {
  const n = points.length;
  return points
    .map(([x, y], i) => {
      const px = (i / (n - 1)) * w;
      const py = h - (Math.max(0, Math.min(y, maxY)) / maxY) * h;
      return `${i === 0 ? 'M' : 'L'}${px.toFixed(2)},${py.toFixed(2)}`;
    })
    .join(' ');
}

/** Live plot of the ring kernel K(r) for the current parameters. */
export function KernelPlot({ R, b, kn }: { R: number; b: number[]; kn: number }) {
  const W = 260;
  const H = 110;
  const { path, shells } = useMemo(() => {
    const pts: [number, number][] = [];
    const N = 200;
    let max = 1e-9;
    for (let i = 0; i <= N; i++) {
      const r = i / N;
      const v = kernelAt(r, R, b, kn);
      max = Math.max(max, v);
      pts.push([r, v]);
    }
    return { path: pathFrom(pts, W, H, max * 1.05), shells: b.length };
  }, [R, b, kn]);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="График ядра K(r)">
        <rect x={0} y={0} width={W} height={H} fill="hsl(160 30% 6%)" rx={6} />
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={g * W} y1={0} x2={g * W} y2={H} stroke="hsl(160 15% 20%)" strokeDasharray="3 4" />
        ))}
        <path d={path} fill="none" stroke="hsl(158 70% 55%)" strokeWidth={2} />
        <line x1={0} y1={H - 1} x2={W} y2={H - 1} stroke="hsl(160 15% 25%)" />
      </svg>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
        Ядро K(r) — вес соседа на расстоянии r·R клеток{shells > 1 ? ` · колец: ${shells}` : ''}
      </p>
    </div>
  );
}

/** Live plot of the growth function G(u) with the current μ and σ. */
export function GrowthPlot({ m, s, gn }: { m: number; s: number; gn: number }) {
  const W = 260;
  const H = 110;
  const { path, muX, band } = useMemo(() => {
    const pts: [number, number][] = [];
    const N = 240;
    const umax = Math.max(0.5, m + 4 * s);
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * umax;
      pts.push([u, growthFunc(u, m, s, gn)]);
    }
    return {
      path: pathFrom(pts, W, H, 1.05),
      muX: (m / umax) * W,
      band: ((m - s) / umax) * W,
    };
  }, [m, s, gn]);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="График функции роста G(u)">
        <rect x={0} y={0} width={W} height={H} fill="hsl(160 30% 6%)" rx={6} />
        <rect x={band} y={0} width={Math.max(0, muX + (muX - band))} height={H} fill="hsl(158 60% 45% / 0.12)" />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="hsl(160 15% 25%)" strokeDasharray="3 4" />
        <line x1={muX} y1={0} x2={muX} y2={H} stroke="hsl(158 70% 55%)" strokeDasharray="4 3" />
        <path d={path} fill="none" stroke="hsl(158 70% 55%)" strokeWidth={2} />
      </svg>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
        Рост G(u): при концентрации u ≈ μ жизнь растёт (+1), вдали — гаснет (−1)
      </p>
    </div>
  );
}
