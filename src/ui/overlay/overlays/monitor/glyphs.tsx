/** Pixel glyphs the HGSS font lacks (tick, cross, arrow): drawn as SVG rects so they stay crisp at any --px. */
const PIX = {
  tick: ['.....#.', '....##.', '#..##..', '.###...', '..#....'],
  cross: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  // chart mark: 3x3 cells drawn at 2u per cell (strokes are 2 texels wide, readable at 1x)
  mark: ['#.#', '.#.', '#.#'],
  arrow: ['....#...', '.....#..', '########', '.....#..', '....#...'],
} as const;

/** `cell` = native units per glyph cell (default: one --px per cell, for inline text glyphs). */
export function Glyph({ g, cell }: { g: keyof typeof PIX; cell?: number }) {
  const rows = PIX[g];
  const w = (rows[0] as string).length;
  return (
    <svg
      className={`glyph ${g}`}
      viewBox={`0 0 ${w} ${rows.length}`}
      shapeRendering="crispEdges"
      aria-label={g === 'tick' ? 'kept' : g === 'cross' || g === 'mark' ? 'broken' : undefined}
      role={g === 'arrow' ? undefined : 'img'}
      aria-hidden={g === 'arrow' ? true : undefined}
      style={cell ? { width: `calc(var(--u) * ${w * cell})`, height: `calc(var(--u) * ${rows.length * cell})` } : { width: `calc(var(--px, 2px) * ${w})`, height: `calc(var(--px, 2px) * ${rows.length})` }}
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === '#' ? <rect key={`${x},${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)),
      )}
    </svg>
  );
}
