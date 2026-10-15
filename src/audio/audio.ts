import { getSfxPath, sfxSlots } from '../assets/useAsset';

/**
 * Tiny Web Audio sfx player. The AudioContext is created/resumed on the first
 * pointerdown/keydown (browser unlock). Files are fetched on load and decoded once the
 * context exists. No silent-<audio> workaround: the iPhone silent switch is respected.
 */
const raw = new Map<string, ArrayBuffer>();
const buffers = new Map<string, AudioBuffer>();
let ctx: AudioContext | null = null;
let started = false;
/** Sound is OFF by default; the visitor's choice is remembered (localStorage, best effort). */
const KEY = 'portfolio.sound';
let muted = true;
let loaded = false;
const subs = new Set<() => void>();
function load() {
  if (loaded) return;
  loaded = true;
  try {
    muted = window.localStorage.getItem(KEY) !== 'on';
  } catch {
    muted = true;
  }
}
export function isMuted(): boolean {
  load();
  return muted;
}
/** Turning sound ON is a user gesture: the next gesture event (this one's click / pointerup) unlocks the AudioContext. Never autoplays. */
export function setMuted(m: boolean) {
  load();
  muted = m;
  try {
    window.localStorage.setItem(KEY, m ? 'off' : 'on');
  } catch {
    /* private mode / blocked storage: the choice just lasts for this visit */
  }
  if (!m && started) unlock(); // the toggle press is the user gesture that unlocks audio
  subs.forEach((f) => f());
}
export function subscribeMuted(f: () => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

/** Slots asked to play before their buffer finished decoding. */
const queued = new Set<string>();

function decodePending() {
  if (!ctx) return;
  for (const [slot, data] of [...raw]) {
    raw.delete(slot);
    ctx.decodeAudioData(data).then(
      (buf) => {
        buffers.set(slot, buf);
        // Requested while decoding (e.g. the unlocking tap was the interaction itself)? Play now.
        if (queued.delete(slot)) playSfx(slot);
      },
      () => undefined,
    );
  }
}

function unlock() {
  if (isMuted()) return; // nothing creates or resumes audio while muted
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx ??= new Ctor();
  if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  decodePending();
}

export function initAudio() {
  if (started || typeof window === 'undefined') return;
  started = true;
  for (const slot of sfxSlots()) {
    const path = getSfxPath(slot);
    if (!path) continue;
    fetch(path)
      .then((r) => r.arrayBuffer())
      .then((data) => {
        raw.set(slot, data);
        decodePending();
      })
      .catch(() => undefined);
  }
  // Touch pointerdown is NOT a user activation in Chrome/Android; pointerup, touchend and
  // click are. Listen to all of them so the first tap unlocks on every platform.
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, unlock, { capture: true });
  }
}

/**
 * The shared AudioContext for synthesis (the piano), or null while sound is off / unavailable.
 * Creating or resuming it is only ever done from a user-gesture handler, and never while muted.
 */
export function audioContext(): AudioContext | null {
  if (isMuted()) return null;
  unlock();
  return ctx;
}

/** Play an sfx slot from assets.json. Silently does nothing until unlocked and decoded. */
export function playSfx(slot: string): boolean {
  if (isMuted()) return false;
  const buf = buffers.get(slot);
  if (!ctx) return false;
  if (!buf) {
    queued.add(slot);
    return false;
  }
  // Still suspended (unlock gesture rejected)? Try again; the source plays once it resumes.
  if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  return true;
}
