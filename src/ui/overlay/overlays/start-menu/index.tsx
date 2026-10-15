import { useState } from 'react';
import ScrollList from '../../ScrollList';
import { useOverlayInput, type OverlayComponentProps } from '../../context';

/** Start menu (the Pokégear: 5 entries, the list scrolls). Entries open other overlays by registry id. */
const ENTRIES: { label: string; overlay: string; props?: Record<string, unknown> }[] = [
  { label: 'Pokédex', overlay: 'pokedex', props: { mode: 'list' } },
  { label: 'Radio', overlay: 'radio' },
  { label: 'Trainer Card', overlay: 'trainer-card' },
  { label: 'Map', overlay: 'townmap' },
  { label: 'Phone', overlay: 'phone' },
];

export default function StartMenu({ ctx }: OverlayComponentProps) {
  const [idx, setIdx] = useState(0);
  const choose = (i: number) => {
    const e = ENTRIES[i];
    if (e) ctx.replace(e.overlay, e.props);
  };
  useOverlayInput({
    up: () => setIdx((i) => (i + ENTRIES.length - 1) % ENTRIES.length),
    down: () => setIdx((i) => (i + 1) % ENTRIES.length),
    a: () => choose(idx),
    b: ctx.close,
    labels: { a: 'Open', b: 'Close' },
  });
  return (
    <div className="overlay start-menu" data-testid="start-menu">
      <h2>Menu</h2>
      <ScrollList
        items={ENTRIES.map((e) => ({ key: e.label, label: e.label }))}
        selected={idx}
        onActivate={(i) => {
          setIdx(i);
          choose(i);
        }}
      />
    </div>
  );
}
