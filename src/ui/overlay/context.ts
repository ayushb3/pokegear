import { createContext, useContext, useLayoutEffect } from 'react';

export type Dir4 = 'up' | 'down' | 'left' | 'right';
export interface InputHandlers {
  a?: () => void;
  b?: () => void;
  up?: () => void;
  down?: () => void;
  left?: () => void;
  right?: () => void;
  /** L / R shoulder keys (Q / E, also PageUp / PageDown): switch an overlay's pages without touching its d-pad navigation */
  l?: () => void;
  r?: () => void;
  /** tiny labels under the on-screen A / B buttons for the current screen ("Next", "Close"...). Default: Talk / Back. */
  labels?: ButtonLabels;
}
export interface ButtonLabels {
  a?: string;
  b?: string;
}
export const DEFAULT_LABELS = { a: 'Talk', b: 'Back' } as const;
export interface OverlayCtx {
  replace(id: string, props?: Record<string, unknown>): void;
  close(): void;
}
export interface OverlayComponentProps<P = Record<string, unknown>> {
  props: P;
  ctx: OverlayCtx;
}

export interface Current {
  id: string;
  props: Record<string, unknown>;
}
export interface HostApi {
  current: Current | null;
  open(id: string, props?: Record<string, unknown>): void;
  replace: OverlayCtx['replace'];
  close(): void;
  /** A button / key: confirms in an overlay, else interacts with the faced object */
  pressA(): void;
  /** B button / key: back/close in an overlay, else nothing */
  pressB(): void;
  setHandlers(h: InputHandlers): void;
  /** mirror text into the aria-live region (screen readers); overlays showing text should call this */
  announce(text: string): void;
  /** current live-region text */
  live: string;
  /** labels for the A / B buttons (the open overlay's, else the defaults) */
  labels: { a: string; b: string };
}

export const Ctx = createContext<HostApi | null>(null);

export function useOverlay(): HostApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOverlay outside OverlayHost');
  return v;
}

/** Overlay components call this each render to declare what A/B/d-pad do. B defaults to close. */
export function useOverlayInput(h: InputHandlers) {
  const host = useOverlay();
  // layout effect: handlers are live before the browser can deliver the next key event
  useLayoutEffect(() => {
    host.setHandlers(h);
  });
}


/**
 * A return trip between overlays: overlay X opens Y with `ctx.replace('y', { ..., returnTo: { id: 'x', props } })`,
 * and Y's top-level B calls `closeOrReturn(ctx, props)`, which re-opens X with `props` (its saved state) instead of closing.
 * `replace()` never unfreezes, so the world stays frozen the whole trip and the final close still restores focus.
 */
export interface ReturnTo {
  id: string;
  props?: Record<string, unknown>;
}

/** The `returnTo` in an overlay's props, if it is well formed. */
export function returnToOf(props: Record<string, unknown> | undefined): ReturnTo | null {
  const r = props?.returnTo as ReturnTo | undefined;
  return r && typeof r === 'object' && typeof r.id === 'string' ? r : null;
}

/** Top-level B: go back to the overlay we came from (if any), else close. */
export function closeOrReturn(ctx: OverlayCtx, props: Record<string, unknown> | undefined): void {
  const r = returnToOf(props);
  if (r) ctx.replace(r.id, r.props ?? {});
  else ctx.close();
}
