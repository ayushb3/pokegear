import type { Game } from './actors';
import type { Dir } from './grid';

const DIR_KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};
const A_KEYS = new Set(['Space', 'Enter', 'NumpadEnter', 'KeyZ']);
const B_KEYS = new Set(['Escape', 'KeyX', 'Backspace']);
const RUN_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'KeyX']);

function typingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Keyboard -> Game. Directions are applied on the keydown event itself. Returns an unbind function. */
export function bindKeyboard(game: Game): () => void {
  const runHeld = new Set<string>();
  const down = (e: KeyboardEvent) => {
    if (typingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    // Enter / Space on a focused real button belongs to that button (its click)
    if (A_KEYS.has(e.code) && (e.target as HTMLElement | null)?.tagName === 'BUTTON') return;
    const dir = DIR_KEYS[e.code];
    if (dir) {
      e.preventDefault();
      if (!e.repeat) game.pressDir(dir);
      return;
    }
    if (RUN_KEYS.has(e.code)) {
      runHeld.add(e.code);
      game.setRun(true);
    }
    if (A_KEYS.has(e.code)) {
      // an overlay (registered on the same window) that already took this press (e.g. A closing the last dialogue line) has
      // preventDefault()ed it: the world must not also act on it, or the player would re-interact with the object just closed
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (!e.repeat) game.interact();
    } else if (B_KEYS.has(e.code)) {
      e.preventDefault(); // B has no world action yet; X doubles as the run key
    }
  };
  const up = (e: KeyboardEvent) => {
    const dir = DIR_KEYS[e.code];
    if (dir) game.releaseDir(dir);
    if (RUN_KEYS.has(e.code)) {
      runHeld.delete(e.code);
      game.setRun(runHeld.size > 0);
    }
  };
  const reset = () => {
    runHeld.clear();
    game.releaseAll();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', reset);
    document.removeEventListener('visibilitychange', reset);
  };
}
