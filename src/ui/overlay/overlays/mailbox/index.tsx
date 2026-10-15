import { useState } from 'react';
import ScrollList from '../../ScrollList';
import { useOverlay, useOverlayInput, type OverlayComponentProps } from '../../context';
import resumeMeta from '../../../../content/resume.json';

/** The mailbox in the yard: how to reach Ayush. The addresses come from resume.json (nothing new). A opens one, B closes. */
const WAYS = [
  { key: 'email', label: 'Email', href: `mailto:${resumeMeta.email}` },
  { key: 'linkedin', label: 'LinkedIn', href: resumeMeta.linkedin },
  { key: 'github', label: 'GitHub', href: resumeMeta.github },
];

export default function Mailbox({ ctx }: OverlayComponentProps) {
  const [idx, setIdx] = useState(0);
  const { announce } = useOverlay();
  const open = (i: number) => {
    const w = WAYS[i];
    if (!w) return;
    if (w.href.startsWith('mailto:')) window.location.assign(w.href);
    else {
      window.open(w.href, '_blank', 'noopener,noreferrer');
      announce(`Opened ${w.label} in a new tab.`);
    }
  };
  useOverlayInput({
    up: () => setIdx((i) => (i + WAYS.length - 1) % WAYS.length),
    down: () => setIdx((i) => (i + 1) % WAYS.length),
    a: () => open(idx),
    b: ctx.close,
    labels: { a: 'Open', b: 'Close' },
  });
  return (
    <div className="overlay mailbox" data-testid="mailbox">
      <h2>Mailbox</h2>
      <ScrollList
        items={WAYS.map((w) => ({ key: w.key, label: w.label }))}
        selected={idx}
        onActivate={(i) => {
          setIdx(i);
          open(i);
        }}
      />
    </div>
  );
}
