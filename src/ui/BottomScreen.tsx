import { useEffect, useMemo, useState, useSyncExternalStore, type MouseEvent, type PointerEvent } from 'react';
import { currentRoom, emphasisObject, goTo, objects, onRoom, onEvent, roomLabel, rooms, type RoomId } from '../world/api';
import { DESC } from './bagCopy';
import { stepRoom, tabKeyStep, tabText } from './bagTabs';
import { keyHintLines } from './overlay/keys';
import Speaker from './Speaker';
import { isMuted, setMuted, subscribeMuted } from '../audio/audio';
import { getIconPath } from '../assets/useAsset';
import { OverlaySlot, useOverlay } from './overlay/OverlayHost';
import resumeMeta from '../content/resume.json';

// pointerdown + preventDefault: instant response, and no focus stolen from the game.
// click with detail 0 = keyboard activation (Enter / Space on a focused button).
const press = (fn: () => void) => ({
  onPointerDown: (e: PointerEvent) => {
    e.preventDefault();
    fn();
  },
  onClick: (e: MouseEvent) => {
    if (e.detail === 0) fn();
  },
});

const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);

/**
 * Subscribes to { type: 'tour', line } world events and exposes the current narrator line.
 * Returns null when no tour is running or it has ended/been cancelled.
 * Also clears the line when an overlay opens (tour was cancelled by that interaction).
 */
function useTourLine(overlayOpen: boolean): string | null {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    return onEvent((e) => {
      if (e.type === 'tour') setLine(e.line);
    });
  }, []);
  useEffect(() => {
    if (overlayOpen) setLine(null);
  }, [overlayOpen]);
  return line;
}

/** One short line, shown once: gone after the first overlay, step or tap. Never comes back after B. */
function useHint(overlayOpen: boolean): { lines: string[] | null; gone: boolean } {
  const [lines, setLines] = useState<string[] | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    setLines([`${resumeMeta.name}: ${resumeMeta.title}.`]);
    const dismiss = (e: Event) => {
      if (e instanceof KeyboardEvent && !MOVE_KEYS.has(e.code)) return;
      setGone(true);
    };
    window.addEventListener('keydown', dismiss);
    window.addEventListener('pointerdown', dismiss);
    return () => {
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('pointerdown', dismiss);
    };
  }, []);
  useEffect(() => {
    if (overlayOpen) setGone(true);
  }, [overlayOpen]);
  return { lines: gone ? null : lines, gone };
}

/** First visit: true until the room's `emphasis` object (the PC) has been opened. A projects deep link counts as opened, like the glow. */
function useEmphasisPending(emph: string | null): boolean {
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (/^projects\//.test(new URLSearchParams(window.location.search).get('open') ?? '')) emph && setSeen((s) => new Set(s).add(emph));
    return onEvent((e) => {
      if (e.type === 'interact') setSeen((s) => (s.has(e.objectId) ? s : new Set(s).add(e.objectId)));
    });
  }, [emph]);
  return !!emph && !seen.has(emph);
}

/** Sound on/off. Off by default; the press is the user gesture that unlocks audio. */
function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => true);
  return (
    <button type="button" className="btn-sound" data-testid="sound" aria-label="Sound" aria-pressed={!muted} title={muted ? 'Sound: off' : 'Sound: on'} {...press(() => setMuted(!muted))}>
      <Speaker on={!muted} size={16} className="sound-icon" />
    </button>
  );
}

/** A bag slot, like an HGSS item cell: a 16x16 pixel icon, name in aria-label and title. Never disabled:
 *  the grid is only mounted while nothing else is open, so there is no locked state to show. */
function Slot({ id, label, aria, selected, onSelect, onPress, testId }: { id: string; label: string; aria: string; selected: boolean; onSelect: (id: string | null) => void; onPress: () => void; testId?: string }) {
  const src = getIconPath(id);
  const [bump, setBump] = useState(false);
  return (
    <button
      type="button"
      className={`slot${selected ? ' sel' : ''}${bump ? ' bump' : ''}`}
      data-testid={testId}
      data-slot={id}
      aria-label={aria}
      title={label}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onSelect(id)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onSelect(null)}
      onFocus={() => onSelect(id)}
      onBlur={() => onSelect(null)}
      {...press(() => {
        onSelect(id); // stays selected during the walk, so the description is shown on touch too
        setBump(true);
        window.setTimeout(() => setBump(false), 200);
        onPress();
      })}
    >
      {src ? <img className="chip-icon" src={src} alt="" width={16} height={16} draggable={false} /> : label}
    </button>
  );
}

/** Bottom screen: ONE frame. The text box is the same size and place in every state (idle bag, dialogue, overlays). */
export default function BottomScreen() {
  const host = useOverlay();
  const { lines: hint, gone: hintGone } = useHint(!!host.current);
  const tourLine = useTourLine(!!host.current);
  const [sel, setSel] = useState<string | null>(null);
  // the bag lists the room the player is in; the location line is HGSS-style and names that room
  const room = useSyncExternalStore(onRoom, currentRoom, () => 'bedroom' as const);
  useEffect(() => {
    if (host.current) setSel(null); // the grid is covered; it comes back with nothing selected
  }, [host.current]);
  // the bag lists the room of the SELECTED TAB: the player's room on open and whenever the player changes room, else the tab picked
  const [view, setView] = useState<RoomId>(room);
  useEffect(() => {
    setView(room);
    setSel(null);
  }, [room]);
  useEffect(() => setSel(null), [view]);
  const tabs = useMemo(() => rooms(), []);
  // L / R (Q / E, PageUp / PageDown) switch tabs while the bag shows; the arrows keep walking the player
  const bagShown = !host.current;
  useEffect(() => {
    if (!bagShown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const step = tabKeyStep(e.code);
      if (!step) return;
      e.preventDefault();
      setView((v) => stepRoom(tabs.map((r) => r.id), v, step));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bagShown, tabs]);
  const cardIcon = getIconPath('card');
  // first visit: once the hint line is gone, the bag rests on the glowing object (the PC) and shows what it is, until it has been opened
  const emph = emphasisObject(view);
  const pending = useEmphasisPending(emph);
  const rest = pending && hintGone && sel === null ? emph : null;
  const shown = sel ?? rest;
  const selLabel = shown ? DESC[shown] ?? shown : null;
  return (
    <>
      <section className="bottom-screen" aria-label="Controls and text">
        <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live">
          {host.live}
        </div>
        <div className="main">
          {host.current ? (
            <OverlaySlot />
          ) : (
            <div className="idle-box" data-testid="idle-box">
              {tourLine ? (
                <div className="idle-loc" data-testid="idle-loc">
                  {tourLine}
                </div>
              ) : (
                <div className="bag-tabs" role="tablist" aria-label="Rooms" aria-keyshortcuts="Q E">
                  {tabs.map((r) => {
                    const on = r.id === view;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="tab"
                        className={`bag-tab${on ? ' on' : ''}`}
                        data-testid={`tab-${r.id}`}
                        data-room={r.id}
                        aria-selected={on}
                        title={r.label}
                        {...press(() => setView(r.id))}
                      >
                        <span className="bag-tab-text" data-testid={on ? 'idle-loc' : undefined}>
                          {tabText(r.id, r.label, on)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="bag" role="group" aria-label={`Walk to an object: ${roomLabel(view)}`}>
                {objects(view).map((o) => (
                  <Slot key={o.id} id={o.id} label={o.label} aria={`Walk to the ${o.label}`} selected={shown === o.id} onSelect={setSel} onPress={() => goTo(o.id)} />
                ))}
              </div>
              <div className="idle-desc" data-testid="idle-desc">
                {selLabel ?? hint?.[0] ?? '\u00a0'}
              </div>
            </div>
          )}
        </div>
        <div className="pad">
          <div className="pad-left">
            {host.current && (
              <div className="key-hint" aria-hidden="true" data-testid="key-hint">
                {keyHintLines(host.labels).map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            )}
            <button
              type="button"
              className="btn-start"
              data-testid="start"
              aria-label="Start, menu"
              {...press(() => {
                if (!host.current) host.open('start-menu');
              })}
            >
              <span className="nub" aria-hidden="true" />
              <span aria-hidden="true">START</span>
            </button>
            <SoundToggle />
          </div>
          <div className="pad-mid">
            <button
              type="button"
              className="btn-card"
              data-testid="btn-card"
              aria-label="Open the Trainer Card"
              title="Trainer Card"
              {...press(() => {
                if (!host.current) host.open('trainer-card');
              })}
            >
              {cardIcon ? <img className="chip-icon" src={cardIcon} alt="" width={16} height={16} draggable={false} /> : 'Card'}
            </button>
            <span className="lbl-card" aria-hidden="true">
              Card
            </span>
          </div>
          <div className="face">
            <span className="lbl lbl-b" aria-hidden="true" data-testid="lbl-b">
              {host.labels.b}
            </span>
            <button type="button" className="btn btn-b" aria-label={`B, ${host.labels.b}`} data-testid="btn-b" {...press(host.pressB)}>
              B
            </button>
            <button type="button" className="btn btn-a" aria-label={`A, ${host.labels.a}`} data-testid="btn-a" {...press(host.pressA)}>
              A
            </button>
            <span className="lbl lbl-a" aria-hidden="true" data-testid="lbl-a">
              {host.labels.a}
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
