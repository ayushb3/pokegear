import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { freeze, interact, resume } from '../../world/api';
import { Ctx, DEFAULT_LABELS, useOverlay, type Current, type HostApi, type InputHandlers } from './context';
import { KEY_A, KEY_B, KEY_DIR } from './keys';
export { useOverlay };
import { OVERLAYS } from './registry';

/**
 * OVERLAY CONTRACT (copy this for phase 1)
 *  - OverlayHost shows at most ONE overlay at a time (the "slot" in the bottom screen).
 *  - open() while nothing is open calls freeze(); close() calls resume(). replace() swaps the
 *    overlay without unfreezing (e.g. dialogue -> pokedex).
 *  - Return trip: replace(id, { ..., returnTo: { id: <caller>, props: <caller's saved state> } }); the callee's top-level B
 *    calls closeOrReturn() (context.ts), which replace()s back to the caller instead of closing (town map -> corkboard -> map).
 *  - B / Esc / X / Backspace / the on-screen B closes (an overlay may intercept B first, e.g.
 *    detail -> list). The player stays on the same tile facing the same way (the world is frozen).
 *  - Focus: whatever had focus before opening gets it back on close (fallback: the game area).
 *  - Overlays are React components registered by id in ./registry.ts and receive
 *    { props, ctx }. They declare key handling with useOverlayInput().
 */

export function OverlayHost({ children, focusRef }: { children: ReactNode; focusRef: RefObject<HTMLElement | null> }) {
  const [current, setCurrent] = useState<Current | null>(null);
  const currentRef = useRef<Current | null>(null);
  const handlers = useRef<InputHandlers>({});
  const prevFocus = useRef<Element | null>(null);
  const openedAt = useRef(0);
  const [live, setLive] = useState('');
  const [labels, setLabels] = useState<{ a: string; b: string }>({ ...DEFAULT_LABELS });
  const announce = useCallback((text: string) => setLive(text), []);

  const open = useCallback((id: string, props: Record<string, unknown> = {}) => {
    if (currentRef.current) {
      currentRef.current = { id, props };
      handlers.current = {};
      setCurrent(currentRef.current);
      return;
    }
    freeze();
    prevFocus.current = document.activeElement;
    openedAt.current = performance.now();
    handlers.current = {};
    currentRef.current = { id, props };
    setCurrent(currentRef.current);
  }, []);

  const close = useCallback(() => {
    if (!currentRef.current) return;
    currentRef.current = null;
    handlers.current = {};
    setCurrent(null);
    setLive('');
    setLabels((l) => (l.a === DEFAULT_LABELS.a && l.b === DEFAULT_LABELS.b ? l : { ...DEFAULT_LABELS }));
    resume();
    const prev = prevFocus.current;
    prevFocus.current = null;
    const target = prev instanceof HTMLElement && prev.isConnected && prev !== document.body ? prev : focusRef.current;
    if (target) target.focus({ preventScroll: true });
  }, [focusRef]);

  const pressA = useCallback(() => {
    if (currentRef.current) handlers.current.a?.();
    else interact();
  }, []);
  const pressB = useCallback(() => {
    if (!currentRef.current) return;
    if (handlers.current.b) handlers.current.b();
    else close();
  }, [close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!currentRef.current) {
        if (e.code === 'KeyM' && !e.repeat) {
          e.preventDefault();
          open('start-menu');
        }
        return;
      }
      // the very key press that opened the overlay must not also act inside it
      if (e.timeStamp < openedAt.current) return;
      // Enter / Space on a focused real button activates that button (its click), not A
      if (KEY_A.has(e.code) && (t?.tagName === 'BUTTON' || (t?.tagName === 'A' && e.code !== 'Space'))) return;
      const dir = KEY_DIR[e.code];
      if (dir) {
        e.preventDefault();
        handlers.current[dir]?.();
      } else if (KEY_A.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) handlers.current.a?.();
      } else if (KEY_B.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) pressB();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, pressB]);

  const api = useMemo<HostApi>(
    () => ({
      current,
      open,
      replace: open,
      close,
      pressA,
      pressB,
      setHandlers: (h) => {
        handlers.current = h;
        const a = h.labels?.a ?? DEFAULT_LABELS.a;
        const b = h.labels?.b ?? DEFAULT_LABELS.b;
        setLabels((l) => (l.a === a && l.b === b ? l : { a, b }));
      },
      announce,
      live,
      labels,
    }),
    [current, open, close, pressA, pressB, announce, live, labels],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Renders the single active overlay (if any) in place. */
export function OverlaySlot() {
  const host = useOverlay();
  if (!host.current) return null;
  const Comp = OVERLAYS[host.current.id];
  if (!Comp) return null;
  return <Comp key={host.current.id + JSON.stringify(host.current.props)} props={host.current.props} ctx={{ replace: host.replace, close: host.close }} />;
}
