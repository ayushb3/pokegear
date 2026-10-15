import { stackScale } from './scale';

/**
 * Measures the free area (`.fit`, an invisible box inside the safe area) and publishes the
 * integer device-pixel scale as CSS vars: --px (CSS px per native pixel) and --world-w.
 * Everything (canvas, bottom screen, pixel font) derives from --px, so all stay crisp.
 */
/** Quick-links bar: in-flow height (CSS px) and the side margin it needs to float in the corner instead. */
export const BAR_H = 28;
export const BAR_W = 248;

export function applyStackLayout(): { scale: number; dpr: number } {
  const dpr = window.devicePixelRatio || 1;
  const fit = document.querySelector<HTMLElement>('.fit');
  const rootEl = document.documentElement;
  const root = rootEl.style;
  const measure = () => ({ w: fit?.clientWidth || window.innerWidth, h: fit?.clientHeight || window.innerHeight });
  // Where there is side room the bar floats in the top-right corner and takes no height. Otherwise it is in flow,
  // and its height comes out of the space the scale is picked from.
  root.setProperty('--bar-h', '0px');
  let { w, h } = measure();
  const side = (w - (256 * stackScale(w, h, dpr)) / dpr) / 2 >= BAR_W;
  if (side) rootEl.dataset.bar = 'side';
  else {
    delete rootEl.dataset.bar;
    root.setProperty('--bar-h', `${BAR_H}px`);
    ({ w, h } = measure());
  }
  const scale = stackScale(w, h, dpr);
  root.setProperty('--px', `${scale / dpr}px`);
  root.setProperty('--world-w', `${(256 * scale) / dpr}px`);
  return { scale, dpr };
}
