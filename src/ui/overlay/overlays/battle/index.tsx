import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { clearWipe, isShiny, startWipe } from '../../../../world/api';
import { BATTLE } from '../../../../content/battle';
import resumeMeta from '../../../../content/resume.json';
import ScrollList from '../../ScrollList';
import TextPages, { type TextPagesHandle } from '../../TextPages';
import { useOverlay, useOverlayInput, type OverlayComponentProps } from '../../context';
import { BAG_ITEMS, MENU, bagLabel, battleReducer, initialState, type BattleEvent, type BattleState } from './logic';
import Scene from './top';
import { CSS } from './styles';

const RESUME_PDF = '/resume.pdf';
/** Where "RECRUITER wants to connect!" leads: the public links from resume.json plus the résumé. */
const LINKS = [
  { key: 'linkedin', label: 'LinkedIn', href: resumeMeta.linkedin },
  { key: 'resume', label: 'Résumé', href: RESUME_PDF },
  { key: 'github', label: 'GitHub', href: resumeMeta.github },
  { key: 'email', label: 'Email', href: `mailto:${resumeMeta.email}` },
];

const press = (fn: () => void) => ({
  onPointerDown: (e: { preventDefault(): void }) => {
    e.preventDefault();
    fn();
  },
});

/**
 * A wild RECRUITER appeared! Opened by the `encounter` world event (a step in the yard's tall grass).
 * The world is frozen and wiped to black (startWipe); the scene is a DOM layer over the TOP screen (portal, like the
 * Pokédex); the BOTTOM screen is the HGSS battle menu. Closing fades the world back in (clearWipe) and `resume()` ends
 * the encounter hold in the Game. Moves are the résumé (src/content/battle.json); see logic.ts for the state machine.
 */
export default function Battle({ ctx }: OverlayComponentProps) {
  const [state, dispatch] = useReducer((s: BattleState, e: BattleEvent) => battleReducer(s, e, BATTLE), BATTLE, initialState);
  const pages = useRef<TextPagesHandle>(null);
  const [linkIdx, setLinkIdx] = useState(0);
  const { announce } = useOverlay();
  const screen = state.screen;

  // the transition: two blinks, the spiral, then the scene
  useEffect(() => {
    let alive = true;
    void startWipe().then(() => alive && dispatch({ type: 'introDone' }));
    return () => {
      alive = false;
    };
  }, []);

  // leaving: the scene unmounts with the overlay, the world fades back in from black
  const closedRef = useRef(false);
  useEffect(() => {
    if (screen.kind !== 'closed' || closedRef.current) return;
    closedRef.current = true;
    void clearWipe();
    ctx.close();
  }, [screen.kind, ctx]);
  useEffect(() => () => void clearWipe(), []); // never leave the world black (e.g. the overlay replaced from outside)

  const openLink = (i: number) => {
    const l = LINKS[i];
    if (!l) return;
    if (l.href.startsWith('mailto:')) window.location.assign(l.href);
    else window.open(l.href, '_blank', 'noopener,noreferrer');
    announce(`Opened ${l.label}.`);
  };
  // The résumé is only ever opened from the final links screen, by the visitor's own choice: the bag just plays the turn.
  const useBag = () => dispatch({ type: 'a' });

  const isText = screen.kind === 'text';
  const a = () => {
    if (isText) pages.current?.advance();
    else if (screen.kind === 'links') openLink(linkIdx);
    else if (screen.kind === 'bag') useBag();
    else dispatch({ type: 'a' });
  };
  const b = () => {
    if (isText) pages.current?.advance();
    else dispatch({ type: 'b' });
  };
  const dir = (d: 'up' | 'down' | 'left' | 'right') => {
    if (screen.kind === 'links') {
      if (d === 'up') setLinkIdx((i) => (i + LINKS.length - 1) % LINKS.length);
      if (d === 'down') setLinkIdx((i) => (i + 1) % LINKS.length);
      return;
    }
    dispatch({ type: 'dir', dir: d });
  };
  useOverlayInput({
    a,
    b,
    up: () => dir('up'),
    down: () => dir('down'),
    left: () => dir('left'),
    right: () => dir('right'),
    labels:
      screen.kind === 'intro'
        ? { a: '', b: '' }
        : isText
          ? { a: 'Next', b: 'Next' }
          : screen.kind === 'menu'
            ? { a: 'Pick', b: 'Run' }
            : screen.kind === 'links'
              ? { a: 'Open', b: 'Close' }
              : { a: 'Use', b: 'Back' },
  });

  const topEl = typeof document !== 'undefined' ? document.querySelector('.top-screen') : null;

  let body: ReactNode;
  if (screen.kind === 'intro' || screen.kind === 'closed') body = <div className="bt-wait" />;
  else if (screen.kind === 'text')
    body = <TextPages key={screen.lines.join('|') + screen.then} ref={pages} blocks={screen.lines.map((text) => ({ text }))} onDone={() => dispatch({ type: 'textDone' })} />;
  else if (screen.kind === 'menu')
    body = (
      <div className="bt-grid" role="group" aria-label="Battle menu" data-testid="battle-menu">
        {MENU.map((m, i) => (
          <button key={m} type="button" tabIndex={-1} className={`bt-cell${i === screen.cursor ? ' sel' : ''}`} aria-current={i === screen.cursor || undefined} data-testid={`battle-menu-${i}`} {...press(() => dispatch({ type: 'select', index: i }))}>
            <span className="cur">{i === screen.cursor ? '▶' : ''}</span>
            {m}
          </button>
        ))}
      </div>
    );
  else if (screen.kind === 'moves') {
    const m = BATTLE.moves[screen.cursor]!;
    body = (
      <>
        <div className="bt-grid" role="group" aria-label="Moves" data-testid="battle-moves">
          {BATTLE.moves.map((mv, i) => (
            <button
              key={mv.name}
              type="button"
              tabIndex={-1}
              className={`bt-cell${i === screen.cursor ? ' sel' : ''}`}
              aria-current={i === screen.cursor || undefined}
              data-spent={(state.pp[i] ?? 0) <= 0 ? '' : undefined}
              data-testid={`battle-move-${i}`}
              title={mv.name}
              {...press(() => dispatch({ type: 'select', index: i }))}
            >
              <span className="cur">{i === screen.cursor ? '▶' : ''}</span>
              {mv.name}
            </button>
          ))}
        </div>
        <div className="bt-info" data-testid="battle-move-info">
          <span>PP {state.pp[screen.cursor] ?? 0}/1</span>
          <span>TYPE/{m.type}</span>
        </div>
      </>
    );
  } else if (screen.kind === 'bag')
    body = (
      <ScrollList
        items={BAG_ITEMS.map((it, i) => {
          const n = state.bag[i] ?? 0;
          return { key: it.name, label: <span className="bt-item" data-testid={`battle-bag-${i}`} data-count={n} data-spent={n <= 0 ? '' : undefined}>{bagLabel(i, n)}</span> };
        })}
        selected={0}
        onActivate={(i) => dispatch({ type: 'select', index: i })}
      />
    );
  else
    body = (
      <ScrollList
        items={LINKS.map((l) => ({ key: l.key, label: l.label }))}
        selected={linkIdx}
        onActivate={(i) => {
          setLinkIdx(i);
          openLink(i);
        }}
      />
    );

  return (
    <>
      <style>{CSS}</style>
      {topEl && screen.kind !== 'intro' && screen.kind !== 'closed' && createPortal(<Scene state={state} data={BATTLE} shiny={isShiny()} />, topEl)}
      <div className="overlay battle" data-testid="battle" data-screen={screen.kind} data-text={screen.kind === 'text' ? screen.lines[0] : undefined}>
        {body}
      </div>
    </>
  );
}
