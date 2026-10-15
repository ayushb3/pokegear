import { useRef, useState } from 'react';
import OverlayFrame from '../../OverlayFrame';
import TextPages, { type TextBlock, type TextPagesHandle } from '../../TextPages';
import { useOverlayInput, type OverlayComponentProps } from '../../context';
import { getAsset, type AssetSlot } from '../../../../assets/useAsset';
import { groupByProject, latestEntries, type JournalEntry } from './parse';

const files = import.meta.glob('../../../../content/journal/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const TABS = groupByProject(latestEntries(files, 200));

const LABELS: Record<string, string> = { bubblychef: 'BubblyChef', portfolio: 'Portfolio', tradedesk: 'TradeDesk' };
const labelOf = (p: string) => LABELS[p] ?? (p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Notes');
const iconOf = (p: string) => {
  const slot = `icon.journal.${p}` as AssetSlot;
  return (getAsset(slot) ?? getAsset('icon.journal.default') as { path: string }) as { path: string };
};
const ARROW = getAsset('journal.arrow').path;

/* Height budget at --u = 1px (375x812): the OverlayFrame (.overlay: 1u outline + 4u padding top and bottom) leaves
 * a content box of 90u x 226u.
 *   .oframe-bar  "COMMIT LOG" + project tabs  18u  (1u outline included, no margin)               = 18u
 *   .scrn        the entry                    56u  (flex: 1; 2u top padding under the bar)
 *     .ph        project + date               16u  (+1u rule, +1u margin) = 18u
 *     TextPages                               36u  (two 18u lines)
 *   .nav         older / newer arrows + dots  16u  (its own row; the buttons' 1u outline sits in the gaps)
 *   ------------------------------------------------
 *   total                                     90u  (== the content box)
 * At --u >= 2px the box is taller, so it fits there too; e2e/objects/journal.spec.ts checks both viewports. */
const CSS = `
.journal .nb { box-shadow: calc(var(--u) * -1) 0 0 var(--bc), var(--u) 0 0 var(--bc), 0 calc(var(--u) * -1) 0 var(--bc), 0 var(--u) 0 var(--bc); }
.journal .tabs { flex: none; display: flex; gap: calc(var(--u) * 6); min-width: 0; margin-right: calc(var(--u) * 1); }
.journal .tab { position: relative; width: calc(var(--u) * 30); height: calc(var(--u) * 14); padding: 0; border: 0; border-radius: 0; font: inherit; background: #e0a49c; --bc: var(--frame-bar-line); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.journal .tab img { opacity: 0.6; }
.journal .tab.on { background: var(--frame-hi); --bc: var(--frame-line); }
.journal .tab.on img { opacity: 1; }
.journal .tab img, .journal .btn img { display: block; image-rendering: pixelated; }
.journal .tab img { width: calc(var(--u) * 12); height: calc(var(--u) * 12); }
.journal .scrn { flex: 1; min-height: 0; display: flex; flex-direction: column; padding-top: calc(var(--u) * 2); }
.journal .swap { flex: 1; min-height: 0; display: flex; flex-direction: column; animation: jswap 80ms steps(1) both; }
@keyframes jswap { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .journal .swap { animation: none; } }
.journal .ph { flex: none; display: flex; justify-content: space-between; align-items: center; gap: calc(var(--u) * 4); height: calc(var(--u) * 16); border-bottom: var(--u) solid #b9b295; margin-bottom: calc(var(--u) * 1); white-space: nowrap; }
.journal .ph b { font-weight: 400; color: #2f6fa8; text-transform: uppercase; }
.journal .ph i { font-style: normal; color: #52525a; }
.journal .nav { flex: none; height: calc(var(--u) * 16); display: flex; align-items: center; justify-content: space-between; padding: 0 calc(var(--u) * 1); }
/* the global .btn (the A/B console buttons) is position:absolute: reset it, or both arrows stack at the left edge */
.journal .btn { position: static; width: calc(var(--u) * 30); height: calc(var(--u) * 14); padding: 0; border: 0; border-radius: 0; background: #52525a; --bc: var(--frame-line); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.journal .btn:active { transform: none; }
.journal .btn[disabled] { opacity: 0.35; cursor: default; }
.journal .btn img { width: calc(var(--u) * 5); height: calc(var(--u) * 9); }
.journal .btn.l img { transform: scaleX(-1); }
.journal .dots { display: flex; gap: calc(var(--u) * 8); }
.journal .dots s { display: block; width: calc(var(--u) * 6); height: calc(var(--u) * 6); background: #dcd6b8; box-shadow: calc(var(--u) * -1) 0 0 #b9b295, var(--u) 0 0 #b9b295, 0 calc(var(--u) * -1) 0 #b9b295, 0 var(--u) 0 #b9b295; }
.journal .dots s.on { background: var(--frame-bar); box-shadow: calc(var(--u) * -1) 0 0 var(--frame-bar-line), var(--u) 0 0 var(--frame-bar-line), 0 calc(var(--u) * -1) 0 var(--frame-bar-line), 0 var(--u) 0 var(--frame-bar-line); }
`;

function blocksFor(e: JournalEntry): TextBlock[] {
  return [{ label: e.placeholder ? `${e.title} (sample)` : e.title }, ...e.paragraphs.map((text) => ({ text }))];
}

/** Journal overlay: a Pokégear-style device, one tab per project (tab 0 = the project with the newest entry).
 *  Left/right (or the arrow buttons) move through THAT project's entries, newest first, and stop at either end.
 *  Up/down (or a tap on a tab) switch project and show its newest entry. A pages through the entry text (TextPages)
 *  and, on its last page, steps to the next-older entry; B closes. */
export default function Journal({ ctx }: OverlayComponentProps) {
  const [tab, setTab] = useState(0);
  const [idx, setIdx] = useState(0);
  const text = useRef<TextPagesHandle>(null);
  const t = TABS[tab];
  const n = t?.entries.length ?? 0;
  const go = (d: number) => {
    const i = idx + d;
    if (i < 0 || i >= n) return;
    setIdx(i);
  };
  const pick = (k: number) => {
    const m = TABS.length;
    if (!m) return;
    const next = ((k % m) + m) % m;
    if (next === tab) return;
    setTab(next);
    setIdx(0);
  };
  useOverlayInput({ left: () => go(-1), right: () => go(1), up: () => pick(tab - 1), down: () => pick(tab + 1), a: () => text.current?.advance(), b: () => ctx.close(), labels: { a: 'Next', b: 'Close' } });

  const e = t?.entries[idx];
  if (!t || !e) {
    return (
      <OverlayFrame title="COMMIT LOG" className="journal" data-testid="journal" role="region" aria-label="Commit log">
        <style>{CSS}</style>
        <div className="scrn">The pages are blank.</div>
      </OverlayFrame>
    );
  }
  return (
    <OverlayFrame
      title="COMMIT LOG"
      className="journal"
      data-testid="journal"
      role="region"
      aria-label="Commit log"
      aside={
        <div className="tabs" role="tablist" aria-label="Projects">
          {TABS.map((x, k) => (
            <button
              key={x.project}
              type="button"
              role="tab"
              tabIndex={-1}
              className={`tab nb${k === tab ? ' on' : ''}`}
              aria-selected={k === tab}
              aria-label={labelOf(x.project)}
              data-testid="journal-tab"
              data-project={x.project}
              onPointerDown={(ev) => {
                ev.preventDefault();
                pick(k);
              }}
            >
              <img src={iconOf(x.project).path} alt="" draggable={false} />
            </button>
          ))}
        </div>
      }
    >
      <style>{CSS}</style>
      <div className="scrn">
        <div key={`${t.project}/${e.id}`} className="swap" data-testid="journal-page">
          <div className="ph">
            <b data-testid="journal-project">{labelOf(t.project)}</b>
            <i>{e.date}</i>
          </div>
          <TextPages key={e.id} ref={text} blocks={blocksFor(e)} onDone={() => go(1)} />
        </div>
      </div>
      <div className="nav">
        <button
          type="button"
          tabIndex={-1}
          className="btn l nb"
          aria-label="Newer entry"
          disabled={idx === 0}
          onPointerDown={(ev) => {
            ev.preventDefault();
            go(-1);
          }}
        >
          <img src={ARROW} alt="" draggable={false} />
        </button>
        <div className="dots" data-testid="journal-indicator" data-index={idx + 1} data-count={n} role="img" aria-label={`Entry ${idx + 1} of ${n}`}>
          {t.entries.map((x, k) => (
            <s key={x.id} className={k === idx ? 'on' : ''} />
          ))}
        </div>
        <button
          type="button"
          tabIndex={-1}
          className="btn r nb"
          aria-label="Older entry"
          disabled={idx >= n - 1}
          onPointerDown={(ev) => {
            ev.preventDefault();
            go(1);
          }}
        >
          <img src={ARROW} alt="" draggable={false} />
        </button>
      </div>
    </OverlayFrame>
  );
}
