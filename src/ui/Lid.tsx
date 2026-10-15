import { useEffect, useRef, useState, type ReactNode } from 'react';
import { freeze, resume, showEmote } from '../world/api';
import { useOverlay } from './overlay/OverlayHost';
import { lidTransition } from './lidLogic';

/**
 * The DS lid. Wraps the top screen. When the tab is hidden the lid folds down over the bottom screen (CSS 3D fold,
 * `data-closed`; a cut under prefers-reduced-motion) and shows its shell with the sleep LED. When the tab comes back it
 * opens again and Oshawott yawns (an ellipsis emote). The world is frozen while closed, unless something else (an
 * overlay, the title) already holds the freeze: the lid only ever releases a freeze it placed itself.
 */
export default function Lid({ children, titleVisible }: { children: ReactNode; titleVisible: boolean }) {
  const host = useOverlay();
  const others = useRef(false); // someone else holds the freeze right now
  others.current = !!host.current || titleVisible;
  const [closed, setClosed] = useState(false);
  const owns = useRef(false);
  useEffect(() => {
    let was = document.visibilityState === 'hidden';
    const apply = (first: boolean) => {
      const hidden = document.visibilityState === 'hidden';
      const t = lidTransition({ was, hidden, first, ownsFreeze: owns.current, othersHold: others.current });
      was = hidden;
      setClosed(hidden);
      if (t.freeze) {
        freeze();
        owns.current = true;
      }
      if (t.resume) {
        owns.current = false;
        resume();
      }
      if (t.yawn) showEmote('follower', 'emote.ellipsis', 1500);
    };
    apply(true);
    const onChange = () => apply(false);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return (
    <div className="lid" data-testid="lid" data-closed={closed ? '' : undefined}>
      {children}
      <div className="lid-shell" aria-hidden="true">
        <span className="lid-led" />
      </div>
    </div>
  );
}
