import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface ScrollItem {
  key: string;
  label: ReactNode;
}

/**
 * Cursor list that always keeps the selected row visible. USE THIS for any overlay list that can
 * exceed the box. Shows up/down arrows when rows are hidden above / below. The overlay owns the
 * selection (up/down via useOverlayInput); a tap on a row calls `onActivate(i)`.
 *
 *   <ScrollList items={[{ key: 'a', label: 'Alpha' }]} selected={idx} onActivate={(i) => { setIdx(i); choose(i); }} />
 */
export default function ScrollList({ items, selected, onActivate }: { items: ScrollItem[]; selected: number; onActivate: (i: number) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(items.length); // visible rows; all until measured
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const row = root.querySelector<HTMLElement>('.sl-row');
      const rh = row?.getBoundingClientRect().height;
      if (!rh || root.clientHeight <= 0) return;
      setN(Math.max(1, Math.floor(root.clientHeight / rh + 0.02)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [items.length]);

  const max = Math.max(0, items.length - n);
  let t = top;
  if (selected < t) t = selected;
  else if (selected >= t + n) t = selected - n + 1;
  t = Math.min(Math.max(0, t), max);
  useLayoutEffect(() => {
    if (t !== top) setTop(t);
  });

  const rows = items.slice(t, t + n);
  return (
    <div className="sl" ref={rootRef} data-testid="scroll-list">
      <ul>
        {rows.map((it, k) => {
          const i = t + k;
          return (
            <li key={it.key}>
              <button
                type="button"
                tabIndex={-1}
                className={`sl-row${i === selected ? ' sel' : ''}`}
                aria-current={i === selected || undefined}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onActivate(i);
                }}
              >
                <span className="cur">{i === selected ? '▶' : ''}</span>
                {it.label}
              </button>
            </li>
          );
        })}
      </ul>
      {/* ▲ (U+25B2) is not in the HGSS font; flip ▼ (U+25BC, which is) instead */}
      <span className={`sl-cue sl-up${t > 0 ? ' on' : ''}`} aria-hidden="true" style={{ display: 'inline-block', transform: 'scaleY(-1)' }}>
        ▼
      </span>
      <span className={`sl-cue sl-down${t + n < items.length ? ' on' : ''}`} aria-hidden="true">
        ▼
      </span>
    </div>
  );
}
