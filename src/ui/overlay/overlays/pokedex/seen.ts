const KEY = 'pokedex-seen';

/** Slugs opened this visit (sessionStorage; every access in try/catch, it may be blocked). */
export function readSeen(): string[] {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markSeen(slug: string): string[] {
  const next = [...new Set([...readSeen(), slug])];
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: marks last until the overlay closes */
  }
  return next;
}

const INTRO_KEY = 'pokedex-rotom-intro';

/** Has Rotom's pop + line already played this browser session? Storage blocked -> false (behave as first time). */
export function introShown(): boolean {
  try {
    return sessionStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroShown(): void {
  try {
    sessionStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* storage blocked: Rotom simply plays again next open */
  }
}
