/** Pixel speaker (16x16 native grid, crisp). `on` draws sound waves, off draws a cross. Colour = currentColor. */
export default function Speaker({ on, size = 16, className }: { on: boolean; size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" fill="currentColor" aria-hidden="true" focusable="false">
      <rect x="1" y="6" width="3" height="4" />
      <rect x="4" y="5" width="1" height="6" />
      <rect x="5" y="4" width="1" height="8" />
      <rect x="6" y="3" width="1" height="10" />
      <rect x="7" y="2" width="1" height="12" />
      {on ? (
        <>
          <rect x="10" y="6" width="1" height="4" />
          <rect x="12" y="4" width="1" height="8" />
          <rect x="14" y="2" width="1" height="12" opacity="0.55" />
        </>
      ) : (
        <>
          <rect x="10" y="5" width="1" height="1" />
          <rect x="11" y="6" width="1" height="1" />
          <rect x="12" y="7" width="1" height="2" />
          <rect x="11" y="9" width="1" height="1" />
          <rect x="10" y="10" width="1" height="1" />
          <rect x="13" y="6" width="1" height="1" />
          <rect x="14" y="5" width="1" height="1" />
          <rect x="13" y="9" width="1" height="1" />
          <rect x="14" y="10" width="1" height="1" />
        </>
      )}
    </svg>
  );
}
