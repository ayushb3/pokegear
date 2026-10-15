import { useEffect, useRef, useState } from 'react';
import Speaker from '../../../Speaker';
import { rest } from '../../../../world/api';
import { useOverlay, useOverlayInput, type OverlayComponentProps } from '../../context';

export const CHARS_PER_SEC = 60;

export interface DialogueProps {
  lines: string[];
  /** overlay to swap to after the last line (the world stays frozen) */
  next?: { overlay: string; props?: Record<string, unknown> };
  /** world effect to run after the last line, before closing */
  after?: 'rest';
  /** world effect to run BEFORE the first line (fade first, then the text) */
  before?: 'rest';
  /** icon shown before the text of a line (by line index), e.g. the speaker */
  icons?: Record<number, 'speaker'>;
}

/** Typewriter dialogue. A / tap completes the line instantly; next A / tap advances, then closes. */
export default function Dialogue({ props, ctx }: OverlayComponentProps<DialogueProps>) {
  const { lines, next, after, before, icons } = props;
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!before);
  const textRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  // refs mirror state so two quick presses between renders still act on the latest values
  const doneRef = useRef(false);
  const indexRef = useRef(0);
  const busyRef = useRef(!!before);
  const line = lines[index] ?? '';
  const icon = icons?.[index];
  // the pixel font has no music note: with an icon, the icon stands in for a leading note
  const vis = icon ? line.replace(/^♪\s*/, '') : line;
  const { announce } = useOverlay();
  useEffect(() => (ready ? announce(line) : undefined), [line, announce, ready]);

  // `before: 'rest'`: run the fade first; the text starts only once the screen is back
  useEffect(() => {
    if (before !== 'rest') return;
    let alive = true;
    void rest().then(() => {
      if (!alive) return;
      busyRef.current = false;
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [before]);

  useEffect(() => {
    if (!ready) return;
    shown.current = 0;
    doneRef.current = false;
    setDone(false);
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const n = Math.min(vis.length, Math.floor(((performance.now() - start) * CHARS_PER_SEC) / 1000));
      if (n !== shown.current && textRef.current) {
        shown.current = n;
        textRef.current.textContent = vis.slice(0, n);
      }
      if (n >= vis.length) {
        doneRef.current = true;
        setDone(true);
      }
      else raf = requestAnimationFrame(tick);
    };
    if (textRef.current) textRef.current.textContent = '';
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [vis, ready]);

  const advance = () => {
    if (busyRef.current) return;
    if (!doneRef.current) {
      if (textRef.current) textRef.current.textContent = vis;
      shown.current = vis.length;
      doneRef.current = true;
      setDone(true);
      return;
    }
    if (indexRef.current < lines.length - 1) {
      indexRef.current += 1;
      doneRef.current = false;
      setIndex(indexRef.current);
    } else if (next) {
      busyRef.current = true;
      ctx.replace(next.overlay, next.props);
    } else if (after === 'rest') {
      busyRef.current = true;
      setBusy(true);
      void rest().then(ctx.close);
    } else {
      busyRef.current = true;
      ctx.close();
    }
  };
  // B also advances/finishes dialogue (never strands the player in a frozen world)
  useOverlayInput({ a: advance, b: advance, labels: { a: 'Next', b: 'Skip' } });

  return (
    <div
      className="overlay dialogue-box"
      data-testid="dialogue"
      onPointerDown={(e) => {
        e.preventDefault();
        advance();
      }}
    >
      {icon === 'speaker' && <Speaker on size={0} className="dlg-icon" />}
      <span ref={textRef} />
      <span className={`more${done && !busy ? ' on' : ''}`} aria-hidden="true">
        ▼
      </span>
    </div>
  );
}
