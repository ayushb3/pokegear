import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { applyStackLayout } from './layout';
import { bus } from './bus';
import { COLS, ROOM_X, ROOM_Y, ROWS, SCREEN_H, SCREEN_W, TILE } from './grid';
import { isShiny } from './shiny';
import { nightByHour } from './clock';

/** Mounts the Pixi canvas. Pixi is imported lazily so the server render never loads it. */
export default function World({ startAt }: { startAt?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // reserve the final size immediately (before Pixi loads) so nothing jumps
  useLayoutEffect(() => {
    applyStackLayout();
    window.addEventListener('resize', applyStackLayout);
    return () => window.removeEventListener('resize', applyStackLayout);
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    bus.setDimTarget(box);
    const params = new URLSearchParams(window.location.search);
    const debug = params.has('debug');
    // ?night=1 forces night immediately (no fade); ?day=1 forces day. Useful for screenshots / dev.
    const override = params.has('night') ? params.get('night') !== '0' : params.has('day') ? false : undefined;
    // no override: the visitor's clock decides (HGSS window), except under ?debug where it stays DAY so e2e never depends on the runner's clock
    const nightOverride = override ?? (debug ? undefined : nightByHour(new Date().getHours()));

    import('./render').then(async ({ createWorld }) => {
      // ?debug: encounters never roll early (only the certain step fires), so e2e walks are deterministic
      const handle = await createWorld(box, { emit: (e) => bus.emit(e), debugGrid: debug, startAt, startNight: nightOverride, shiny: isShiny(), rng: debug ? () => 1 : undefined });
      if (cancelled) {
        handle.destroy();
        return;
      }
      bus.bind(handle.game, handle);
      setReady(true);
      if (debug) {
        // Extend the game object with a live tourState getter so e2e can observe it.
        const gameWithTour = Object.defineProperty(handle.game as object, 'tourState', {
          get: () => handle.getTourState(),
          configurable: true,
        });
        Object.defineProperty(gameWithTour, 'shiny', { get: () => handle.isShiny(), configurable: true });
        Object.defineProperty(gameWithTour, 'grass', { get: () => handle.getGrass(), configurable: true });
        (window as unknown as { __game?: unknown }).__game = gameWithTour; // ?debug only: poke from the console
      }
      // debug readout is plain DOM, updated outside React
      let timer: number | undefined;
      let el: HTMLDivElement | null = null;
      if (debug) {
        el = document.createElement('div');
        el.className = 'debug-line';
        document.body.appendChild(el);
        const dl = el;
        timer = window.setInterval(() => {
          const d = handle.getDebug();
          dl.textContent = `dpr ${d.dpr} · scale ${d.scale}x · ${Math.round(d.fps)} fps`;
        }, 500);
      }
      cleanup = () => {
        window.clearInterval(timer);
        el?.remove();
        bus.bind(null);
        handle.destroy();
      };
    });

    return () => {
      cancelled = true;
      bus.setDimTarget(null);
      cleanup?.();
    };
  }, []);

  return (
    <div
      className="world-box"
      ref={boxRef}
      onPointerDown={(e) => {
        if (ready) return; // the canvas handles taps once it exists
        // tapped before load: remember the tile, walk there when the world appears
        const r = e.currentTarget.getBoundingClientRect();
        const tx = Math.floor((((e.clientX - r.left) / r.width) * SCREEN_W - ROOM_X) / TILE);
        const ty = Math.floor((((e.clientY - r.top) / r.height) * SCREEN_H - ROOM_Y) / TILE);
        if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return; // the dark surround
        // `ready` lags the world by a React render: if the game is already bound, act now instead of dropping the tap
        bus.runOrDefer((g) => g.walkTo(tx, ty));
      }}
    >
      {!ready && <div className="world-loading">Loading…</div>}
    </div>
  );
}
