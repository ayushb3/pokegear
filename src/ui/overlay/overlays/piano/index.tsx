import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Speaker from '../../../Speaker';
import { audioContext, isMuted, setMuted, subscribeMuted } from '../../../../audio/audio';
import { getAsset } from '../../../../assets/useAsset';
import piano from '../../../../content/piano.json';
import { useOverlay, useOverlayInput, type OverlayComponentProps } from '../../context';
import { FIRST, KEYMAP, KEYS, LABEL_BY_MIDI, LAST, WHITE_COUNT, foldToRange, moveCursor, noteName } from './keys';
import { activeAt, lengthOf, toEvents, type NoteEvent } from './score';
import { noteOn, type Playing } from './synth';
import { PIANO_CSS } from './styles';

/**
 * Piano overlay. Tap / click keys, play from the computer keyboard (A S D F G H J K = white, W E T Y U = black,
 * continuing L ; ' / O P), or move the key cursor with the arrows and press A. B closes.
 * "Ayush's piece" plays the MIDI in `music.piece` through the same 8-bit synth; the keys light up as it goes.
 * Sound is OFF by default (the speaker toggle): while muted nothing is created or played, the keys still light.
 */
const W = 16; // native px per white key
const BW = 10; // black key width
const KEYS_H = 36; // native px (see the budget in styles.ts)
const BLACK_H = 22; // ~60% of KEYS_H, integer px
const MIN_LIT_MS = 110; // a quick tap still shows

type Held = { midi: number; at: number; playing: Playing | null };

const sz = (n: number) => ({ width: `calc(var(--u)*${n})`, height: `calc(var(--u)*${n})` });

/** The pixel font has no music note: a small pixel note. */
function Note() {
  return (
    <svg className="glyph" viewBox="0 0 8 8" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true" focusable="false" style={sz(8)}>
      <rect x="3" y="0" width="5" height="2" />
      <rect x="6" y="2" width="2" height="4" />
      <rect x="1" y="5" width="5" height="3" />
    </svg>
  );
}
function Arrow() {
  return (
    <svg className="glyph" viewBox="0 0 8 8" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true" focusable="false" style={sz(8)}>
      <rect x="0" y="3" width="6" height="2" />
      <rect x="4" y="1" width="1" height="6" />
      <rect x="5" y="2" width="1" height="4" />
      <rect x="6" y="3" width="1" height="2" />
    </svg>
  );
}

/** Parse the MIDI at `music.piece` once (the parser is loaded only when someone asks for the piece). */
let pieceLoad: Promise<NoteEvent[]> | null = null;
function loadPiece(): Promise<NoteEvent[]> {
  pieceLoad ??= (async () => {
    const [{ Midi }, res] = await Promise.all([import('@tonejs/midi'), fetch(getAsset('music.piece').path)]);
    if (!res.ok) throw new Error(`piece ${res.status}`);
    return toEvents(new Midi(await res.arrayBuffer()));
  })().catch((e) => {
    pieceLoad = null;
    throw e;
  });
  return pieceLoad;
}

export default function PianoOverlay({ ctx }: OverlayComponentProps) {
  const { announce } = useOverlay();
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => true);
  const [cursor, setCursor] = useState(60);
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set());
  const [pieceLit, setPieceLit] = useState<ReadonlySet<number>>(new Set());
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const heldRef = useRef(new Map<string, Held>());
  const pieceNotes = useRef<Playing[]>([]);
  const timer = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;
  const alive = useRef(true);

  const syncHeld = () => setHeld(new Set([...heldRef.current.values()].map((h) => h.midi)));

  const down = useCallback((id: string, midi: number) => {
    if (heldRef.current.has(id)) return;
    let playing: Playing | null = null;
    const ac = audioContext();
    if (ac) playing = noteOn(ac, 'pulse', midi, ac.currentTime, 0.85);
    heldRef.current.set(id, { midi, at: performance.now(), playing });
    setCursor(midi);
    syncHeld();
  }, []);
  const up = useCallback((id: string) => {
    const h = heldRef.current.get(id);
    if (!h) return;
    h.playing?.release(); // synth clamps to the end of the attack: a very quick tap still sounds
    const wait = Math.max(0, MIN_LIT_MS - (performance.now() - h.at));
    const done = () => {
      if (heldRef.current.get(id) === h) heldRef.current.delete(id);
      if (alive.current) syncHeld();
    };
    if (wait) setTimeout(done, wait);
    else done();
  }, []);
  /** a press with no release event (A on the cursor key) */
  const tap = useCallback(
    (midi: number) => {
      const id = `tap${performance.now()}`;
      down(id, midi);
      setTimeout(() => up(id), 220);
    },
    [down, up],
  );

  const stopPiece = useCallback(() => {
    window.clearInterval(timer.current);
    for (const p of pieceNotes.current) p.kill();
    pieceNotes.current = [];
    if (alive.current) {
      setPieceLit(new Set());
      setStatus((s) => (s === 'error' ? s : 'idle'));
    }
  }, []);

  const startPiece = useCallback(async () => {
    if (statusRef.current === 'loading') return;
    statusRef.current = 'loading';
    setStatus('loading');
    const ac = audioContext(); // still inside the tap: the unlocking gesture
    let events: NoteEvent[];
    try {
      events = await loadPiece();
    } catch {
      statusRef.current = 'error';
      if (alive.current) setStatus('error');
      return;
    }
    if (!alive.current || statusRef.current !== 'loading') return;
    const lead = 0.12;
    const t0 = performance.now() + lead * 1000;
    if (ac && !isMuted()) {
      const base = ac.currentTime + lead;
      pieceNotes.current = events.map((e) => {
        const p = noteOn(ac, e.voice, e.midi, base + e.t, e.vel);
        p.release(base + e.t + e.dur);
        return p;
      });
    }
    const total = lengthOf(events) + 0.3;
    statusRef.current = 'playing';
    setStatus('playing');
    announce("Playing Ayush's piece");
    timer.current = window.setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      if (t > total) {
        stopPiece();
        return;
      }
      const on = new Set(activeAt(events, t).map((e) => foldToRange(e.midi)));
      setPieceLit((prev) => (prev.size === on.size && [...on].every((m) => prev.has(m)) ? prev : on));
    }, 33);
  }, [announce, stopPiece]);

  // muting mid-piece silences it (the keys keep lighting); leaving the overlay stops everything
  useEffect(() => {
    if (!muted) return;
    for (const p of pieceNotes.current) p.kill();
    pieceNotes.current = [];
    for (const h of heldRef.current.values()) h.playing?.kill();
  }, [muted]);
  useEffect(() => {
    alive.current = true;
    const heldNotes = heldRef.current;
    return () => {
      alive.current = false;
      window.clearInterval(timer.current);
      for (const p of pieceNotes.current) p.kill();
      for (const h of heldNotes.values()) h.playing?.kill();
    };
  }, []);

  // computer keyboard: captured BEFORE the host, because the host treats A / S / D / W as movement keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent, isDown: boolean) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const midi = KEYMAP[e.code];
      if (midi === undefined) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isDown) {
        if (!e.repeat) down(e.code, midi);
      } else up(e.code);
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', kd, { capture: true });
    window.addEventListener('keyup', ku, { capture: true });
    return () => {
      window.removeEventListener('keydown', kd, { capture: true });
      window.removeEventListener('keyup', ku, { capture: true });
    };
  }, [down, up]);

  useOverlayInput({
    a: () => tap(cursor),
    b: ctx.close,
    left: () => setCursor((c) => moveCursor(c, -1)),
    right: () => setCursor((c) => moveCursor(c, 1)),
    up: () => setCursor((c) => Math.min(LAST, c + 12)),
    down: () => setCursor((c) => Math.max(FIRST, c - 12)),
    labels: { a: 'Play', b: 'Close' },
  });

  const lit = (m: number) => held.has(m) || pieceLit.has(m);
  const playing = status === 'playing';
  const credit: { title: string; composer: string; source: string; arranger?: string; url?: string } = piano.pieceCredit;
  const prac: { text: string; placeholder?: boolean } = piano.nowPracticing;
  const toggle = () => (playing ? stopPiece() : void startPiece());

  return (
    <section className="overlay pn" data-testid="piano">
      <style>{PIANO_CSS}</style>
      <div className={`row${piano.videoUrl ? ' v' : ''}`}>
        <button
          type="button"
          className={`pbtn${playing ? ' on' : ''}`}
          data-testid="piano-piece"
          aria-pressed={playing}
          onPointerDown={(e) => {
            e.preventDefault();
            toggle();
          }}
          onClick={(e) => {
            if (e.detail === 0) toggle();
          }}
        >
          <Note />
          <span>{playing ? 'Stop' : status === 'loading' ? 'Loading' : status === 'error' ? 'Try again' : "Ayush's piece"}</span>
        </button>
        {piano.videoUrl && (
          <a className="pbtn" data-testid="piano-video" href={piano.videoUrl} target="_blank" rel="noopener noreferrer">
            <span>Watch me play</span>
            <Arrow />
          </a>
        )}
        {muted && (
          <button
            type="button"
            className="mute"
            data-testid="piano-muted"
            aria-label="Sound is off. Turn sound on."
            onPointerDown={(e) => {
              e.preventDefault();
              setMuted(false);
            }}
            onClick={(e) => {
              if (e.detail === 0) setMuted(false);
            }}
          >
            <Speaker on={false} size={0} className="glyph" />
            <span className="t">Sound off</span>
          </button>
        )}
      </div>
      {playing ? (
        <div className="line cr" data-testid="piano-credit" title={`${credit.title}, ${credit.composer} (${credit.source})${credit.arranger ? `. Arrangement: ${credit.arranger}` : ''}`}>
          {credit.title}, {credit.composer}
          {credit.url && (
            <>
              .{' '}
              <a data-testid="piano-credit-link" href={credit.url} target="_blank" rel="noopener noreferrer">
                Arrangement
              </a>
            </>
          )}
        </div>
      ) : (
        <div className="line" data-testid="piano-practicing" title={`Now practicing: ${prac.text}`}>
          Now practicing: <span className={prac.placeholder ? 'ph' : undefined}>{prac.text}</span>
        </div>
      )}
      <div className="keys" role="group" aria-label="Piano keys, C4 to B5" style={{ width: `calc(var(--u)*${WHITE_COUNT * W})`, height: `calc(var(--u)*${KEYS_H})` }} data-testid="piano-keys">
        {KEYS.map((k) => (
          <button
            key={k.midi}
            type="button"
            tabIndex={-1}
            className={`k ${k.black ? 'b' : 'w'}${lit(k.midi) ? ' lit' : ''}${cursor === k.midi ? ' sel' : ''}`}
            data-testid={`piano-key-${k.midi}`}
            data-lit={lit(k.midi) ? '1' : undefined}
            aria-label={noteName(k.midi)}
            style={{
              left: `calc(var(--u)*${k.black ? (k.white + 1) * W - BW / 2 : k.white * W})`,
              width: `calc(var(--u)*${k.black ? BW : W})`,
              height: `calc(var(--u)*${k.black ? BLACK_H : KEYS_H})`,
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              down(`p${e.pointerId}`, k.midi);
            }}
            onPointerUp={(e) => up(`p${e.pointerId}`)}
            onPointerCancel={(e) => up(`p${e.pointerId}`)}
            onPointerLeave={(e) => up(`p${e.pointerId}`)}
          >
            {LABEL_BY_MIDI[k.midi] && <span className="lbl">{LABEL_BY_MIDI[k.midi]}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
