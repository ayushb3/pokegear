import type { ReactNode } from 'react';
import { getAsset } from '../../../../assets/useAsset';

/** Tiny pixel icons drawn as SVG rects (no image files). One char = one native pixel. */
function PixelArt({ rows, colors, label, className }: { rows: string[]; colors: Record<string, string>; label?: string; className?: string }) {
  const w = rows[0]!.length;
  const rects: ReactNode[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const fill = colors[c];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }),
  );
  return (
    <svg
      className={`dx-icon ${className ?? ''}`}
      viewBox={`0 0 ${w} ${rows.length}`}
      style={{ width: `calc(var(--u) * ${w})`, height: `calc(var(--u) * ${rows.length})` }}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {rects}
    </svg>
  );
}

export function Ball({ label }: { label?: string }) {
  return (
    <PixelArt
      className="dx-ball"
      label={label}
      colors={{ o: '#22222c', r: '#d9473f', w: '#f6f3e4', h: '#f08a82' }}
      rows={['..oooooo..', '.orrrrrro.', 'orhhrrrrro', 'orrrrrrrro', 'oooowwoooo', 'oooowwoooo', 'owwwwwwwwo', 'owwwwwwwwo', '.owwwwwwo.', '..oooooo..']}
    />
  );
}

export function RotomIcon() {
  return (
    <PixelArt
      className="dx-rotom-icon"
      colors={{ o: '#22222c', r: '#e8553a', y: '#f8d030', w: '#ffffff', k: '#22222c' }}
      rows={['.y..oooo..y.', '..yoorrooy..', '.orrrrrrrro.', 'orrwwrrwwrro', 'orrwkrrwkrro', 'orrrrrrrrrro', '.orrrooorro.', '..oorrrroo..', '....oooo....']}
    />
  );
}

export function LockIcon() {
  return (
    <PixelArt
      className="dx-lock-icon"
      colors={{ o: '#22222c', y: '#f8d030' }}
      rows={['..oooo..', '.o....o.', '.o....o.', 'oooooooo', 'oyyyyyyo', 'oyyooyyo', 'oyyooyyo', 'oyyyyyyo', 'oooooooo']}
    />
  );
}

/** Drawn size of a dex sprite: the integer multiple of its native size that `Sprite` uses for the same `fit`. */
export function spriteSize(slot: string, fit?: { w: number; h: number }): { w: number; h: number } {
  const a = getAsset(slot as 'sprite.dex.rotom') as unknown as { w: number; h: number };
  const s = fit ? Math.max(1, Math.floor(Math.min(fit.w / a.w, fit.h / a.h))) : 1;
  return { w: a.w * s, h: a.h * s };
}

/** A dex sprite at an integer multiple of its native size (largest that fits `fit`, min 1x). Animated GIF; the still
 *  frame under prefers-reduced-motion. */
export function Sprite({ slot, fit, className }: { slot: string; fit?: { w: number; h: number }; className?: string }) {
  const a = getAsset(slot as 'sprite.dex.rotom') as unknown as { path: string; still: string; w: number; h: number };
  const s = spriteSize(slot, fit).w / a.w;
  return (
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={a.still} />
      <img
        className={`dx-sprite ${className ?? ''}`}
        src={a.path}
        alt=""
        draggable={false}
        style={{ width: `calc(var(--u) * ${a.w * s})`, height: `calc(var(--u) * ${a.h * s})` }}
      />
    </picture>
  );
}

const TYPE_COLORS = ['#d8a810', '#4c9a3c', '#4a72d0', '#d86a28', '#8a3a98', '#a08a28', '#3a9aa8'];
/** HGSS-style type label. Colour is stable per entry + position. */
export function TypeChip({ label, i, seed }: { label: string; i: number; seed: number }) {
  return (
    <span className="dx-chip" style={{ background: TYPE_COLORS[(seed * 2 + i) % TYPE_COLORS.length] }}>
      {label}
    </span>
  );
}
