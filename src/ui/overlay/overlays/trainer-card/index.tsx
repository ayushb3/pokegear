import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { setOpenParam } from '../../../deeplink';
import { card, hrefOf, labelOf, roleTitleLine, roleEmployerLine, type CardLink } from '../../../../content/trainer-card';
import { getAsset } from '../../../../assets/useAsset';
import TextPages, { type TextPagesHandle } from '../../TextPages';
import { useOverlayInput, type OverlayComponentProps } from '../../context';

const CSS = `
.trainer-card { padding: 0; display: flex; flex-direction: column; }
.trainer-card .tc-band { background: #d9473f; color: #fff; text-shadow: none; display: flex; justify-content: space-between; flex: none; }
.trainer-card .tc-band { align-items: center; padding: 0 calc(var(--u) * 6); }
/* tc-body: 2u vertical padding (not the default 4u) so the 3-line id block fits.
   The .overlay class sets line-height: var(--lh) = 18px; tc-name overrides to 16px.
   Budget at --u=1px:
     overlay clientH = 98px; band = 44px → tc-body clientH = 54px
     tc-body content  = 54 - padTop(2) - padBot(2) = 50px
     tc-id text block = 3 × 16px = 48px → fits in 50px with 2px to spare.
     Desktop body is much taller; chips are measured in when space allows. */
.trainer-card .tc-body { position: relative; padding: calc(var(--u) * 2) calc(var(--u) * 6); flex: 1; min-height: 0; display: flex; flex-direction: column; }
.trainer-card .tc-id { display: flex; gap: calc(var(--u) * 4); align-items: center; }
.trainer-card .tc-sprite { width: calc(var(--u) * 32); height: calc(var(--u) * 32); flex: none; image-rendering: pixelated; background-repeat: no-repeat; }
/* tc-name: explicit 16px line-height (overrides the inherited 18px from .overlay) and zero margin.
   3 lines × 16px = 48px, which fits in the 50px content area. Single-line ellipsis. */
.trainer-card .tc-name { margin: 0; line-height: calc(var(--u) * 16); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.trainer-card .sample { opacity: 0.6; border-bottom: 1px dashed currentColor; }
.trainer-card .tc-sep { height: calc(var(--u) * 4); flex: none; }
/* tc-label: when shown alongside chips on the id page */
.trainer-card .tc-label { opacity: 0.7; margin: 0 0 calc(var(--u) * 1); line-height: calc(var(--u) * 16); }
.trainer-card .tc-chips { display: flex; flex-wrap: wrap; gap: calc(var(--u) * 2); }
/* tc-chip: explicit 16px line-height + 1u padding → chip height = 16 + 2×1(pad) + 2×2(border) = 24px.
   Budget at --u=1px, badges-only page (content = 50px):
     2 rows × 24px + 2px gap = 50px → fills content exactly, no label row needed.
   When chips appear on the id page alongside the id block, the label is shown above them. */
.trainer-card .tc-chip { background: #cfe3f7; border: 2px solid #22222c; border-radius: 6px; padding: calc(var(--u) * 1) calc(var(--u) * 3); line-height: calc(var(--u) * 16); }
.trainer-card .tc-links { display: grid; grid-template-columns: 1fr 1fr; gap: calc(var(--u) * 2); }
/* tc-measure-wrap: zero-height clipping wrapper so probes don't inflate parent scrollHeight */
.trainer-card .tc-measure-wrap { position: absolute; top: 0; left: calc(var(--u) * 6); right: calc(var(--u) * 6); height: 0; overflow: hidden; pointer-events: none; }
.trainer-card .tc-measure { visibility: hidden; }
.trainer-card .tc-btn { display: block; box-sizing: border-box; min-height: 44px; width: 100%; padding: 0 calc(var(--u) * 4); font: inherit; color: inherit; text-align: left; text-decoration: none; line-height: 40px; background: #cfe3f7; border: 2px solid #22222c; border-radius: 6px; cursor: pointer; text-shadow: none; }
.trainer-card .tc-btn[disabled] { background: #e4e4e4; opacity: 0.65; cursor: default; border-style: dashed; }
.trainer-card .tc-flip { min-height: 44px; min-width: 44px; padding: 0 0 0 calc(var(--u) * 4); font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-shadow: none; }
`;

function Sample({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? <span className="sample">{children} (sample)</span> : <>{children}</>;
}

/** Trainer sprite from the sprite.player slot: standing, facing down. */
function Sprite() {
  const a = getAsset('sprite.player');
  const row = a.rowOrder.indexOf('down');
  const col = a.colOrder.indexOf('stand');
  return (
    <div
      className="tc-sprite"
      role="img"
      aria-label="Trainer sprite"
      style={{
        backgroundImage: `url(${a.path})`,
        backgroundSize: `calc(var(--u) * ${a.cell * a.cols}) calc(var(--u) * ${a.cell * a.rows})`,
        backgroundPosition: `calc(var(--u) * ${-col * a.cell}) calc(var(--u) * ${-row * a.cell})`,
      }}
    />
  );
}

function LinkButton({ l }: { l: CardLink }) {
  const href = hrefOf(l);
  const label = labelOf(l);
  if (!href) {
    return (
      <button type="button" className="tc-btn" disabled tabIndex={-1} data-testid={`card-${l.id}`}>
        {label}
      </button>
    );
  }
  const ext = l.kind !== 'mailto';
  return (
    <a className="tc-btn" href={href} data-testid={`card-${l.id}`} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {label}
    </a>
  );
}

/**
 * Pages:
 *   'id'      — name, title, employer line (+ stack chips if they fit via measurement)
 *   'pitch'   — TextPages pitch
 *   'badges'  — stack chips (only when they didn't fit on 'id')
 *   'links'   — all 4 links (when they fit in one page, desktop)
 *   'linksA'  — first 2 links (phone)
 *   'linksB'  — last 2 links (phone)
 *
 * The measurement logic runs in useLayoutEffect and drives two booleans:
 *   chipsOnId   — chips fit below the id block on the same page
 *   splitLinks  — links need to be split 2+2
 */
type PageId = 'id' | 'pitch' | 'badges' | 'links' | 'linksA' | 'linksB';

const groupsFor = (chipsOnId: boolean, splitLinks: boolean): PageId[][] => [
  chipsOnId ? ['id', 'badges'] : ['id'],
  ['pitch'],
  ...(chipsOnId ? [] : [['badges'] as PageId[]]),
  ...(splitLinks ? [['linksA'] as PageId[], ['linksB'] as PageId[]] : [['links'] as PageId[]]),
];

/** Trainer Card: A (or the corner button) flips to the next page, B closes. */
export default function TrainerCard({ ctx }: OverlayComponentProps) {
  const [chipsOnId, setChipsOnId] = useState(false);
  const [splitLinks, setSplitLinks] = useState(false);
  const groups = groupsFor(chipsOnId, splitLinks);
  const bodyRef = useRef<HTMLDivElement>(null);
  const idProbeRef = useRef<HTMLDivElement>(null);   // hidden copy of the id+chips block
  const linkProbeRef = useRef<HTMLDivElement>(null); // hidden copy of the 2×2 link grid

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const idProbe = idProbeRef.current;
    const linkProbe = linkProbeRef.current;
    if (!body || !idProbe || !linkProbe) return;

    const check = () => {
      const bodyH = body.clientHeight;
      const cs = getComputedStyle(body);
      const vPad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const available = bodyH - vPad;

      // Can chips fit below the id block?
      setChipsOnId(idProbe.offsetHeight <= available);

      // Do all 4 links fit on one page?
      const linkNeed = parseFloat(getComputedStyle(linkProbe).marginTop || '0') + linkProbe.offsetHeight;
      setSplitLinks(vPad + linkNeed > bodyH + 1);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(body);
    return () => ro.disconnect();
  }, []);

  // the open card is mirrored in the URL (shareable); cleaned on close
  useEffect(() => {
    setOpenParam('card');
    return () => setOpenParam(null);
  }, []);

  const [page, setPage] = useState(0);
  const cur = page % groups.length;
  const has = (id: PageId) => groups[cur]?.includes(id);
  const pitch = useRef<TextPagesHandle>(null);
  const [more, setMore] = useState(false);
  const [sub, setSub] = useState<[number, number]>([1, 1]);
  const onPitch = has('pitch');
  const flip = () => setPage((p) => (p + 1) % groups.length);
  const flipBack = () => setPage((p) => (p + groups.length - 1) % groups.length);
  useOverlayInput({ a: () => (onPitch && pitch.current ? pitch.current.advance() : flip()), b: ctx.close, left: flipBack, right: flip, labels: { a: onPitch && more ? 'Next' : 'Flip', b: 'Close' } });

  const isLinks = has('links') || has('linksA') || has('linksB');

  return (
    <div className="overlay trainer-card" data-testid="trainer-card" data-page={cur}>
      <style>{CSS}</style>
      <div className="tc-band">
        <span>TRAINER CARD</span>
        <button
          type="button"
          className="tc-flip"
          tabIndex={-1}
          aria-label="Flip card"
          data-testid="card-flip"
          onPointerDown={(e) => {
            e.preventDefault();
            flip();
          }}
        >
          {cur + 1}/{groups.length}{onPitch && sub[1] > 1 ? ` (${sub[0]}/${sub[1]})` : ''} A▸
        </button>
      </div>

      <div ref={bodyRef} className="tc-body" data-testid={isLinks ? 'card-back' : 'card-front'}>
        {/* ── Hidden probes for measurement ──
            Wrapped in a zero-height clipping div so they never inflate tc-body scrollHeight. */}
        <div className="tc-measure-wrap" aria-hidden="true" inert>
          {/* Probe: id block + chips together — measures whether chips fit on the id page */}
          <div ref={idProbeRef} className="tc-measure">
            <div className="tc-id">
              <div className="tc-sprite" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="tc-name">{card.name}</p>
                <p className="tc-name">{roleTitleLine(card.role)}</p>
                <p className="tc-name">{roleEmployerLine(card.role)}</p>
              </div>
            </div>
            <div className="tc-sep" />
            <p className="tc-label">Badges</p>
            <div className="tc-chips">
              {card.stack.map((s) => (
                <span key={s} className="tc-chip">{s}</span>
              ))}
            </div>
          </div>
          {/* Probe: all 4 link buttons — measures whether they fit on one page */}
          <div ref={linkProbeRef} className="tc-links tc-measure">
            {card.links.map((l) => (
              <span key={l.id} className="tc-btn">{labelOf(l)}</span>
            ))}
          </div>
        </div>

        {/* ── Page: identity (name + title + employer, chips when they fit) ── */}
        {has('id') && (
          <div className="tc-id">
            <Sprite />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="tc-name" title={card.name}>{card.name}</p>
              {/* Line 1: title only — avoids implying the title has been held since `since` */}
              <p className="tc-name" title={roleTitleLine(card.role)}>
                <Sample on={card.role.placeholder}>{roleTitleLine(card.role)}</Sample>
              </p>
              {/* Line 2: employer + start year as context, not a claimed tenure for this exact title */}
              <p className="tc-name" title={roleEmployerLine(card.role)}>
                <Sample on={card.role.placeholder}>{roleEmployerLine(card.role)}</Sample>
              </p>
            </div>
          </div>
        )}

        {/* ── Page: badges (stack chips) ──
            On the id page (chipsOnId=true): show separator + label + chips.
            On its own page (chipsOnId=false): chips only — no label, because
            2 rows × 24px + 2px gap = 50px fills the 50px content area exactly,
            leaving no room for a label row. The page context is obvious. */}
        {has('badges') && (
          <>
            {has('id') && <><div className="tc-sep" /><p className="tc-label">Badges</p></>}
            <div className="tc-chips">
              {card.stack.map((s) => (
                <span key={s} className="tc-chip">{s}</span>
              ))}
            </div>
          </>
        )}

        {/* ── Page: pitch ── */}
        {has('pitch') && (
          <TextPages
            ref={pitch}
            blocks={card.pitch.lines.map((l, i) => ({ text: card.pitch.placeholder && i === card.pitch.lines.length - 1 ? `${l} (sample)` : l }))}
            onMore={setMore}
            onPage={(p, n) => setSub((o) => (o[0] === p && o[1] === n ? o : [p, n]))}
            onDone={flip}
          />
        )}

        {/* ── Pages: links ── */}
        {isLinks && (
          <div className="tc-links">
            {card.links.slice(has('linksB') ? 2 : 0, has('linksA') ? 2 : 4).map((l) => (
              <LinkButton key={l.id} l={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
