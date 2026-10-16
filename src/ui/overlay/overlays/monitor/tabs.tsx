/**
 * The monitor's two pages and the tab row that switches them. The tabs ARE the OverlayFrame title (the red bar), so they
 * cost no height: each page keeps its whole 90u budget (see styles.ts). Tap a tab, or L / R (Q / E, PageUp / PageDown) from
 * the keyboard: the d-pad stays with the page (the Journal steps its bars with left / right).
 */
export const PAGES = [
  { id: 'market', label: 'Market' },
  { id: 'journal', label: 'Journal' },
] as const;
export type PageId = (typeof PAGES)[number]['id'];

/** The page `step` tabs away from `cur`, wrapping round (like the bag's pockets). */
export function stepPage(cur: PageId, step: number): PageId {
  const i = PAGES.findIndex((p) => p.id === cur);
  const n = PAGES.length;
  return PAGES[(((i + step) % n) + n) % n]!.id;
}

export function PageTabs({ page, onPick }: { page: PageId; onPick: (p: PageId) => void }) {
  return (
    <span className="mon-tabs" role="tablist" aria-label="Monitor pages" aria-keyshortcuts="Q E">
      {PAGES.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={p.id === page}
          className={`mon-tab${p.id === page ? ' sel' : ''}`}
          data-testid={`monitor-tab-${p.id}`}
          // a tap must not move focus onto the tab (Space / Enter on a focused button would click it instead of pressing A)
          onPointerDown={(e) => {
            e.preventDefault();
            onPick(p.id);
          }}
          onClick={(e) => {
            if (e.detail === 0) onPick(p.id); // keyboard (Tab to it, then Enter / Space)
          }}
        >
          {p.label}
        </button>
      ))}
    </span>
  );
}
