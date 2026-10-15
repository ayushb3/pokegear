import type { HTMLAttributes, ReactNode } from 'react';

/**
 * The ONE overlay header treatment (design principle 4): the HGSS cream box with a red title bar.
 *
 * Frame = the shared HGSS menu frame in `app.css` (`.oframe`, the same tokens as the dialogue box, the idle box and the
 * title screen's Skip button): cream fill, 1u dark outline, pale / purple / pale inner lines (the highlight), 4u radius.
 * Title bar = `.oframe-bar`: red, cream text, 1u dark-red outline, exactly 18u tall (one --lh at 1x, outline included,
 * no margin). Inside it the heading (`h2.oframe-heading`) holds `title` (any node: the fridge puts its filter arrows
 * there); `aside` (tabs, a count) is a SIBLING of the heading, so the heading's accessible name is only the title.
 * No title and no aside = no bar.
 *
 * `placement`:
 *  - 'bottom' (default): the overlay root in the bottom screen; it also carries `.overlay` (flex column, padding,
 *    `--lh` line metrics, and the `.bottom-screen .overlay` e2e hook).
 *  - 'top': a layer that fills the top screen (portalled into `.top-screen`), e.g. the Pokédex PC-box grid.
 */
export interface OverlayFrameProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  aside?: ReactNode;
  placement?: 'bottom' | 'top';
  /** props for the title bar element, e.g. an extra className */
  barProps?: HTMLAttributes<HTMLDivElement> & { [k: `data-${string}`]: string | undefined };
  children?: ReactNode;
}

export function frameClass(placement: 'bottom' | 'top', className?: string): string {
  return [placement === 'bottom' ? 'overlay' : null, 'oframe', placement === 'top' ? 'oframe-top' : null, className].filter(Boolean).join(' ');
}

const empty = (n: ReactNode) => n === undefined || n === null || n === false || n === '';

export default function OverlayFrame({ title, aside, placement = 'bottom', className, barProps, children, ...rest }: OverlayFrameProps) {
  const { className: barClass, ...bar } = barProps ?? {};
  const hasBar = !empty(title) || !empty(aside);
  return (
    <div className={frameClass(placement, className)} {...rest}>
      {hasBar && (
        <div className={barClass ? `oframe-bar ${barClass}` : 'oframe-bar'} {...bar}>
          <h2 className="oframe-heading">{typeof title === 'string' ? <span className="oframe-title">{title}</span> : title}</h2>
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}
