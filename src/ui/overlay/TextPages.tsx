import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { useOverlay } from './context';

/** One run of text. `label` sits on its own line (coloured); `text` follows. A block with only a label is a heading. */
export interface TextBlock {
  label?: string;
  text?: string;
  /** render `text` as an external link */
  href?: string;
  muted?: boolean;
}

export interface TextPagesHandle {
  /** Next page; on the last page calls `onDone`. Wire this to the overlay's `a`. */
  advance(): void;
  /** true while more pages follow */
  hasMore(): boolean;
}

/**
 * HGSS-style paged text. USE THIS for any overlay text that can exceed the box.
 *
 * The text is laid out once at the box width and sliced into pages of a whole number of lines,
 * so a page never cuts a glyph. Shows a blinking down-arrow while more follows. A / tap advances,
 * A on the last page calls `onDone` (continue / end). Labels never strand on the last line of a page, the last page
 * never holds a single line (it is rebalanced to two; in a 2-line box it repeats the previous page's last line), and the right edge is reserved for the down-arrow so it never covers a word.
 * The full text is mirrored to the screen-reader live region.
 *
 *   const pages = useRef<TextPagesHandle>(null);
 *   useOverlayInput({ a: () => pages.current?.advance(), b: ctx.close });
 *   <TextPages ref={pages} blocks={[{ label: 'What', text: '...' }]} onDone={ctx.close} />
 */
export default function TextPages({ blocks, onDone, onMore, onPage, ref }: { blocks: TextBlock[]; onDone?: () => void; /** called when "more pages follow" changes, so the host can relabel A (Next / Flip) */ onMore?: (more: boolean) => void; /** called with the 1-based sub-page and the sub-page count whenever either changes, so the host can show where it is */ onPage?: (page: number, pages: number) => void; ref?: Ref<TextPagesHandle> }) {
  const host = useOverlay();
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [m, setM] = useState<{ pages: number; lh: number; starts: number[]; counts: number[] }>({ pages: 1, lh: 0, starts: [0], counts: [0] });
  const pageRef = useRef(0);
  const pagesRef = useRef(1);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const measure = useCallback(() => {
    const root = rootRef.current;
    const view = viewRef.current;
    const flow = flowRef.current;
    if (!root || !view || !flow) return;
    const lh = parseFloat(getComputedStyle(flow).lineHeight);
    if (!lh || root.clientHeight <= 0) return;
    const n = Math.max(1, Math.floor(root.clientHeight / lh + 0.02));
    // links are tap targets >= 44 CSS px, in whole lines so the page grid holds
    flow.querySelectorAll<HTMLElement>('.tp-link').forEach((a) => (a.style.minHeight = `${Math.ceil(44 / lh) * lh}px`));
    const labels = flow.querySelectorAll<HTMLElement>('.tp-label[data-lead]');
    labels.forEach((el) => (el.style.marginTop = ''));
    // a label never sits alone on the last line of a page
    labels.forEach((el) => {
      const line = Math.round(el.offsetTop / lh);
      if (n > 1 && line % n === n - 1) el.style.marginTop = `${lh}px`;
    });
    const lines = Math.max(1, Math.round(flow.scrollHeight / lh));
    const pages = Math.max(1, Math.ceil(lines / n));
    // page p starts at line p*n. If that leaves a lone line on the last page, the last page starts one line
    // earlier (two lines) and the page before it shows one line fewer, so nothing repeats.
    const starts = Array.from({ length: pages }, (_, p) => p * n);
    const counts = starts.map((st) => Math.min(n, lines - st));
    // (with a 2-line box the page before cannot give a line up, so the last page repeats one line of it instead)
    if (pages > 1 && lines - starts[pages - 1]! === 1 && n >= 2) {
      starts[pages - 1] = lines - 2;
      counts[pages - 1] = 2;
      if (n > 2) counts[pages - 2] = n - 1;
    }
    pagesRef.current = pages;
    if (pageRef.current > pages - 1) {
      pageRef.current = pages - 1;
      setPage(pageRef.current);
    }
    const key = (o: { starts: number[]; counts: number[]; lh: number }) => `${o.lh}|${o.starts}|${o.counts}`;
    setM((o) => (key(o) === key({ starts, counts, lh }) ? o : { pages, lh, starts, counts }));
  }, []);

  useLayoutEffect(measure, [measure, blocks]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    void document.fonts?.ready.then(measure);
    document.fonts?.addEventListener?.('loadingdone', measure);
    return () => {
      ro.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', measure);
    };
  }, [measure]);

  const advance = useCallback(() => {
    if (pageRef.current < pagesRef.current - 1) {
      pageRef.current += 1;
      setPage(pageRef.current);
    } else onDoneRef.current?.();
  }, []);
  const more = page < m.pages - 1;
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;
  useEffect(() => onMoreRef.current?.(more), [more]);
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;
  useEffect(() => onPageRef.current?.(page + 1, m.pages), [page, m.pages]);
  const plain = blocks.map((b) => [b.label, b.text].filter(Boolean).join(': ')).join('. ');
  useEffect(() => host.announce(plain), [plain, host.announce]); // eslint-disable-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({ advance, hasMore: () => pageRef.current < pagesRef.current - 1 }), [advance]);

  return (
    <div
      className="tp"
      ref={rootRef}
      data-testid="text-pages"
      data-page={page + 1}
      data-pages={m.pages}
      onPointerDown={(e) => {
        e.preventDefault();
        advance();
      }}
    >
      <div className="tp-view" ref={viewRef} style={m.lh ? { height: (m.counts[page] ?? 1) * m.lh } : undefined}>
        <div className="tp-flow" ref={flowRef} style={{ transform: `translateY(${-(m.starts[page] ?? 0) * m.lh}px)` }}>
          {blocks.map((b, i) => (
            <div key={i} className={`tp-block${b.muted ? ' note' : ''}`}>
              {b.label ? (
                <div className="tp-label" data-lead={b.text ? '' : undefined}>
                  {b.label}
                </div>
              ) : null}
              {b.text ? (
                b.href ? (
                  <a className="tp-text tp-link" href={b.href} target="_blank" rel="noopener noreferrer" tabIndex={-1} onPointerDown={(e) => e.stopPropagation()}>
                    {b.text}
                  </a>
                ) : (
                  <div className="tp-text">{b.text}</div>
                )
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <span className={`more tp-more${page < m.pages - 1 ? ' on' : ''}`} aria-hidden="true">
        ▼
      </span>
    </div>
  );
}
