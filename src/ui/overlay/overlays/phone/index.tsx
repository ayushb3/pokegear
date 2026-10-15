import { useState } from 'react';
import ScrollList from '../../ScrollList';
import { useOverlay, useOverlayInput, type OverlayComponentProps } from '../../context';
import { CONTACTS } from './contacts';

/**
 * Phone: the Pokégear contact list. A opens the selected contact (mailto: here, a new tab for the rest), B closes.
 * Real <a> elements for every contact sit in a visually hidden list, so the links work for screen readers
 * and without the game; the visible rows are the shared ScrollList.
 *
 * Height budget (bottom box at 1x, 375x812: ~96u inside the .overlay frame, --lh 18u, --row 22u):
 *   h2 "Phone" 18u + 2u margin = 20u
 *   detail line (selected value, one line, ellipsis) = 18u
 *   ScrollList takes the rest = ~58u = 2 whole rows (it scrolls; arrows show hidden rows)
 *   total 20 + 18 + 58 = 96u
 */
export default function Phone({ ctx }: OverlayComponentProps) {
  const [idx, setIdx] = useState(0);
  const { announce } = useOverlay();
  const open = (i: number) => {
    const c = CONTACTS[i];
    if (!c) return;
    if (c.external) {
      window.open(c.href, '_blank', 'noopener,noreferrer');
      announce(`Opened ${c.label} in a new tab.`);
    } else window.location.assign(c.href);
  };
  useOverlayInput({
    up: () => setIdx((i) => (i + CONTACTS.length - 1) % CONTACTS.length),
    down: () => setIdx((i) => (i + 1) % CONTACTS.length),
    a: () => open(idx),
    b: ctx.close,
    labels: { a: 'Open', b: 'Close' },
  });
  return (
    <div className="overlay phone" data-testid="phone">
      <h2>Phone</h2>
      <ScrollList
        items={CONTACTS.map((c) => ({ key: c.key, label: c.label }))}
        selected={idx}
        onActivate={(i) => {
          setIdx(i);
          open(i);
        }}
      />
      <div
        data-testid="phone-detail"
        title={CONTACTS[idx]?.shown}
        style={{ flex: 'none', height: 'calc(var(--u) * 18)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#2f6fa8' }}
      >
        {CONTACTS[idx]?.shown}
      </div>
      <ul className="sr-only" data-testid="phone-links">
        {CONTACTS.map((c) => (
          <li key={c.key}>
            <a href={c.href} {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {c.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
