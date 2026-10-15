/**
 * Lid decisions, pure so they can be unit-tested.
 *   closing (visible -> hidden): freeze the world, but only if nothing else holds the freeze (an overlay, the title)
 *   opening (hidden -> visible): release the freeze if the lid placed it; Oshawott yawns
 *   first look while hidden (a tab opened in the background): closed, frozen if free; no yawn later? yes: it yawns on the first open
 */
export interface LidInput {
  /** the state before this change */
  was: boolean;
  hidden: boolean;
  /** the initial read on mount (no transition happened) */
  first: boolean;
  ownsFreeze: boolean;
  othersHold: boolean;
}
export interface LidTransition {
  freeze: boolean;
  resume: boolean;
  yawn: boolean;
}
export function lidTransition(i: LidInput): LidTransition {
  if (i.hidden) return { freeze: !i.ownsFreeze && !i.othersHold, resume: false, yawn: false };
  if (i.first) return { freeze: false, resume: false, yawn: false };
  return { freeze: false, resume: i.ownsFreeze, yawn: i.was };
}
