import type { Ref } from 'react';
import OverlayFrame from '../../OverlayFrame';
import ScrollList from '../../ScrollList';
import TextPages, { type TextBlock, type TextPagesHandle } from '../../TextPages';
import { DEX, dexNo, linksFor, type DexEntry } from '../../../../content/pokedex';
import { Ball, LockIcon, RotomIcon, Sprite, spriteSize, TypeChip } from './art';

/** The pages of one entry: 0 entry page, 1 what got built, 2 how it was built (the process), 3 what was learned, 4 links. */
export const PAGES = ['Entry', 'What got built', 'How it was built', 'What I learned', 'Links'] as const;
export const LAST_PAGE = PAGES.length - 1;

const press = (fn: () => void) => ({
  onPointerDown: (e: { preventDefault(): void }) => {
    e.preventDefault();
    fn();
  },
});

const ROTOM_FIT = { w: 180, h: 130 };

/** Rotom pops out of the PC (a short DOM animation over the dimmed world), then hovers. */
export function Intro({ from, phase }: { from: { x: number; y: number } | null; phase: 'pop' | 'say' }) {
  // offset from the final spot (just below screen centre) back to the PC, in native px
  const dx = (from?.x ?? 144) - 128;
  const dy = (from?.y ?? 36) - 110;
  // half the drawn sprite, rounded down to whole native px, so the pop box sits on the pixel grid
  const sz = spriteSize('sprite.dex.rotom', ROTOM_FIT);
  return (
    <div className="dx dx-intro" data-testid="dex-intro" data-phase={phase}>
      <div className="dx-rotom-wrap" style={{ ['--dx' as string]: dx, ['--dy' as string]: dy, ['--rw' as string]: Math.floor(sz.w / 2), ['--rh' as string]: Math.floor(sz.h / 2) }}>
        <div className="dx-rotom-pop" data-pop={phase === 'pop' ? '' : undefined}>
          <Sprite slot="sprite.dex.rotom" fit={ROTOM_FIT} />
        </div>
        <span className="dx-bzzt" aria-hidden="true">
          Bzzt!
        </span>
      </div>
    </div>
  );
}

/** PC-box grid: 2 x 2 slots, 3 filled. d-pad moves the selection; a tap selects, a second tap opens. */
export function Grid({ sel, seen, onSelect, onOpen }: { sel: number; seen: string[]; onSelect: (i: number) => void; onOpen: (i: number) => void }) {
  const e = DEX[sel]!;
  return (
    <OverlayFrame placement="top" title="BOX 1" className="dx dx-grid" data-testid="dex-grid">
      <div className="dx-box">
        {[0, 1, 2, 3].map((i) => {
          const x = DEX[i];
          if (!x) return <div key={i} className="dx-slot dx-empty" aria-hidden="true" />;
          const isSeen = seen.includes(x.slug);
          return (
            <button
              key={x.slug}
              type="button"
              tabIndex={-1}
              className={`dx-slot${i === sel ? ' sel' : ''}`}
              data-testid={`dex-slot-${x.slug}`}
              aria-label={`${dexNo(x)} ${x.name}${isSeen ? ', seen' : ''}`}
              aria-current={i === sel || undefined}
              {...press(() => (i === sel ? onOpen(i) : onSelect(i)))}
            >
              <Sprite slot={x.sprite} fit={{ w: 114, h: 66 }} />
              {isSeen && <Ball />}
            </button>
          );
        })}
      </div>
      <div className="dx-foot">
        <span className="dx-no">{dexNo(e)}</span> <span>{e.name}</span>
      </div>
    </OverlayFrame>
  );
}

/** HGSS dex list (Start menu): rows on the left with seen marks, preview on the right. */
export function List({ sel, seen, onSelect }: { sel: number; seen: string[]; onSelect: (i: number) => void }) {
  const e = DEX[sel]!;
  return (
    <div className="dx dx-list" data-testid="dex-list">
      <div className="dx-head">
        <span className="dx-title">POKéDEX</span>
      </div>
      <div className="dx-list-body">
        <div className="dx-list-rows">
          <ScrollList
            items={DEX.map((x) => ({
              key: x.slug,
              label: (
                <span className="dx-row">
                  <span className="dx-no">{String(x.no).padStart(3, '0')}</span>
                  <span className="dx-rowname">{x.name}</span>
                  {seen.includes(x.slug) ? <Ball label="Seen" /> : null}
                </span>
              ),
            }))}
            selected={sel}
            onActivate={onSelect}
          />
        </div>
        <div className="dx-preview">
          <div className="dx-preview-art">
            <Sprite slot={e.sprite} fit={{ w: 100, h: 100 }} />
          </div>
          <div className="dx-preview-name">{e.name}</div>
          <div className="dx-preview-cat">{e.category}</div>
        </div>
      </div>
    </div>
  );
}

export function Ribbon({ e }: { e: DexEntry }) {
  return (
    <div className={`dx-ribbon dx-ribbon-${e.ribbon.icon}`} data-testid="dex-ribbon">
      {e.ribbon.icon === 'rotom' ? <RotomIcon /> : <LockIcon />}
      <span>{e.ribbon.text.replaceAll(' · ', ' · ')}</span>
    </div>
  );
}

function Head({ e, page }: { e: DexEntry; page: number }) {
  return (
    <div className="dx-head">
      <span className="dx-title">
        <span className="dx-no">{dexNo(e)}</span> {e.name}
      </span>
      <span className="dx-sub">{PAGES[page]}</span>
    </div>
  );
}

function EntryPage({ e }: { e: DexEntry }) {
  return (
    <div className="dx dx-entry" data-testid="dex-entry-page">
      <div className="dx-art">
        <Sprite slot={e.sprite} fit={{ w: 96, h: 96 }} />
      </div>
      <div className="dx-info">
        <div className="dx-nameline">
          <span className="dx-no">{dexNo(e)}</span> <span className="dx-name">{e.name}</span>
        </div>
        <div className="dx-cat">{e.category}</div>
        <div className="dx-types">
          {e.types.map((t, i) => (
            <TypeChip key={t} label={t} i={i} seed={e.no} />
          ))}
        </div>
        <dl className="dx-stats">
          {e.stats.map((s) => (
            <div key={s.k}>
              <dt>{s.k}:</dt>
              <dd>{s.v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="dx-flavour">
        {e.flavour[0]}
        <br />
        {e.flavour[1]}
      </p>
      <Ribbon e={e} />
    </div>
  );
}

function blocksFor(e: DexEntry, page: number): TextBlock[] {
  if (page === 1) {
    const b: TextBlock[] = [
      { label: 'What', text: e.what },
      { label: 'How', text: e.how },
      { label: 'Result', text: e.impact },
    ];
    if (e.builtWith?.length) b.push({ label: 'Built this way', text: e.builtWith.join(', ') });
    return b;
  }
  const list = page === 3 ? e.learned : e.built;
  return list.map((x, i) => ({ label: `${i + 1}. ${x.title}`, text: x.text }));
}

/** At 1x the box fits three 44px buttons. With more links, the ones between the first and
 *  Plain page share rows of two, so nothing clips. */
function linkRows<T>(links: T[]): T[][] {
  if (links.length <= 3) return links.map((l) => [l]);
  const rows: T[][] = [[links[0]!]];
  const mid = links.slice(1, -1);
  for (let i = 0; i < mid.length; i += 2) rows.push(mid.slice(i, i + 2));
  rows.push([links[links.length - 1]!]);
  return rows;
}

function LinksPage({ e, onGo }: { e: DexEntry; onGo: (slug: string) => void }) {
  const links = linksFor(e);
  const live = links.find((l) => l.external);
  return (
    <div className="dx dx-page" data-testid="dex-links">
      <Head e={e} page={LAST_PAGE} />
      <div className="dx-body dx-links">
        {linkRows(links).map((row) => (
          <div key={row[0]!.href} className="dx-link-row">
            {row.map((l) => (
              <a
                key={l.href}
                className="dx-btn"
                href={l.href}
                title={l.label}
                data-testid={`dex-link-${l.entry ?? (l.external ? (l === live ? 'live' : 'ext') : 'plain')}`}
                {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                onClick={(ev) => {
                  if (l.entry) {
                    ev.preventDefault();
                    onGo(l.entry);
                  }
                }}
              >
                <span>{l.label}</span>
                <span aria-hidden="true">▶</span>
              </a>
            ))}
          </div>
        ))}
        {e.slug === 'tradedesk' && <p className="dx-note">Repo is private, so there is no repo link.</p>}
        {e.slug === 'stave' && <p className="dx-note">Local project, not deployed, so there is no public link.</p>}
      </div>
    </div>
  );
}

/** One entry, one page at a time. Pages 1 and 2 are TextPages (nothing can clip); A pages on through them. */
export function Entry({ e, page, pagesRef, onDone, onGo }: { e: DexEntry; page: number; pagesRef: Ref<TextPagesHandle>; onDone: () => void; onGo: (slug: string) => void }) {
  if (page === 0) return <EntryPage e={e} />;
  if (page === LAST_PAGE) return <LinksPage e={e} onGo={onGo} />;
  return (
    <div className="dx dx-page" data-testid={page === 1 ? 'dex-what' : page === 2 ? 'dex-built' : 'dex-learned'}>
      <Head e={e} page={page} />
      <div className="dx-body">
        <TextPages key={`${e.slug}-${page}`} ref={pagesRef} blocks={blocksFor(e, page)} onDone={onDone} />
      </div>
    </div>
  );
}
