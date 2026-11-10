'use client';

import { useEffect, useRef } from 'react';
import type { Creature } from '@/lib/lenia/creatures';
import { PALETTES, paletteColor } from '@/lib/lenia/engine';

const STOPS = PALETTES[0].stops;

export function CreatureThumb({ creature, size = 56 }: { creature: Creature; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const { w, h, cells } = creature;
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const t = Math.pow(cells[i], 0.75);
      const [r, g, b] = paletteColor(STOPS, t);
      img.data[i * 4] = Math.round(r * 255);
      img.data[i * 4 + 1] = Math.round(g * 255);
      img.data[i * 4 + 2] = Math.round(b * 255);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [creature]);

  return (
    <canvas
      ref={ref}
      aria-label={`Миниатюра: ${creature.ru}`}
      className="rounded-md bg-black"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}
