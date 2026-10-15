import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { WorldView, currentRoom, objects, reactives, onEvent, onRoom, freeze, resume, playObjectAnim, playReaction, showEmote, isNight, isShiny, type RoomId } from '../world/api';
import { useAsset } from '../assets/useAsset';
import { initAudio, isMuted, playSfx } from '../audio/audio';
import { findEntry } from '../content/pokedex';
import { OBJECT_ACTIONS } from '../content/actions';
import { DECOR_REACTIONS, dropOverride, rollDrop } from '../content/reactions';
import followerContent from '../content/follower.json' with { type: 'json' };
import BottomScreen from './BottomScreen';
import QuickLinks from './QuickLinks';
import { OverlayHost, useOverlay } from './overlay/OverlayHost';
import TitleScreen from './TitleScreen';
import Lid from './Lid';
import { shouldShowTitle, parseTitleParams, readShown, markShown } from './titleScreenLogic';
import { overlayForOpen, openForOverlay, setOpenParam } from './deeplink';
import resumeMeta from '../content/resume.json';
import './app.css';

/** Emote slot per context. */
const EMOTE_SHINY = 'emote.exclaim';
const EMOTE_NIGHT = 'emote.ellipsis';
const EMOTE_DOWNSTAIRS = 'emote.heart';
const EMOTE_DEFAULT = 'emote.note';

// rotate index for the generic lines (deterministic: increments per open this session)
let followerRotateIdx = 0;

/**
 * Pick a follower dialogue line and emote slot by context.
 * Rules (priority order):
 *   0. Shiny, first talk this load → the shiny line + exclaim
 *   1. Night → sleepy line + ellipsis
 *   2. Downstairs → kitchen line + heart
 *   3. Otherwise → rotate through the generic lines + note emote
 */
function pickFollowerLine(room: RoomId): { line: string; emoteSlot: string } {
  if (isShiny() && followerRotateIdx === 0) {
    followerRotateIdx++;
    return { line: followerContent.lines.shiny, emoteSlot: EMOTE_SHINY };
  }
  if (isNight()) return { line: followerContent.lines.night, emoteSlot: EMOTE_NIGHT };
  if (room === 'downstairs') return { line: followerContent.lines.downstairs, emoteSlot: EMOTE_DOWNSTAIRS };
  const rotate = followerContent.lines.rotate;
  const line = rotate[followerRotateIdx % rotate.length] as string;
  followerRotateIdx++;
  return { line, emoteSlot: EMOTE_DEFAULT };
}

/**
 * Reactive decor pieces that already reacted this session, as `<room>:<decorKey>` (a reaction's `again` lines play from then on).
 * In memory + sessionStorage; every storage access in try/catch (it may be blocked), like the Pokédex "seen" set.
 */
const REACTED_KEY = 'reacted';
const reacted = new Set<string>();
try {
  const v: unknown = JSON.parse(sessionStorage.getItem(REACTED_KEY) ?? '[]');
  if (Array.isArray(v)) v.forEach((k) => typeof k === 'string' && reacted.add(k));
} catch {
  /* no storage (SSR, blocked): memory only */
}
/** Mark a piece as reacted; returns whether it had already reacted this session. */
function markReacted(k: string): boolean {
  const had = reacted.has(k);
  reacted.add(k);
  try {
    sessionStorage.setItem(REACTED_KEY, JSON.stringify([...reacted]));
  } catch {
    /* storage blocked: lasts until reload */
  }
  return had;
}

/** ?open=projects/<slug> -> slug if valid. Read once, synchronously, so the world can start at the PC. */
function deepLinkSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const m = /^projects\/([\w-]+)$/.exec(new URLSearchParams(window.location.search).get('open') ?? '');
  return findEntry(m?.[1]) ? (m?.[1] as string) : null;
}

/** ?open=card -> true. Opens the Trainer Card over the room (player stays at the start tile). */
function deepLinkCard(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('open') === 'card';
}

/** ?open=townmap|piano|journal|monitor|radio|phone|photos|food -> overlay id. Opens over the room at the start tile, like the card. */
function deepLinkOverlay(): string | null {
  if (typeof window === 'undefined') return null;
  return overlayForOpen(new URLSearchParams(window.location.search).get('open'));
}

/** Wires world events + the deep links to overlays. */
function Wiring({ slug, card, overlay }: { slug: string | null; card: boolean; overlay: string | null }) {
  const host = useOverlay();
  const hostRef = useRef(host);
  hostRef.current = host;

  useEffect(() => {
    initAudio();
    return onEvent((e) => {
      if (e.type === 'follower-talk') {
        const { line, emoteSlot } = pickFollowerLine(currentRoom());
        showEmote('follower', emoteSlot, 2000);
        hostRef.current.open('dialogue', { lines: [line] });
        return;
      }
      if (e.type === 'react') {
        const reaction = DECOR_REACTIONS[e.id];
        if (!reaction) return;
        const again = markReacted(`${currentRoom()}:${e.key}`);
        // a drop table (optional) may turn this watering into a found item; randomness is injected here, `?debug&drop=<id|none>` forces it
        const drop = rollDrop(reaction.drop, Math.random, dropOverride(window.location.search));
        const lines = drop && reaction.drop ? [...reaction.drop.lead, ...drop.lines] : again && reaction.again ? reaction.again : reaction.lines;
        if (reaction.sfx) playSfx(reaction.sfx);
        if (reaction.emote) showEmote(reaction.emote.actor, reaction.emote.slot, reaction.emote.ms);
        const openDialogue = () => {
          if (drop && reaction.drop) showEmote(reaction.drop.emote.actor, drop.emote ?? reaction.drop.emote.slot, reaction.drop.emote.ms); // Oshawott reacts as the item lands
          hostRef.current.open('dialogue', { lines });
        };
        if (reaction.anim || drop) {
          freeze(); // hold still while the piece reacts; the dialogue overlay then owns freeze/resume (as for objects)
          void playReaction(e.key, { ms: reaction.anim?.ms ?? 0, burst: reaction.anim?.burst, drop: drop ? { slot: drop.slot } : undefined }).then(openDialogue);
        } else openDialogue();
        return;
      }
      if (e.type === 'encounter') {
        // tall grass: the battle overlay freezes the world, wipes the top screen and runs the fight
        hostRef.current.open('battle');
        return;
      }
      if (e.type !== 'interact') return;
      const action = OBJECT_ACTIONS[e.objectId];
      if (!action) return;
      if (action.sfx) playSfx(action.sfx);
      if (action.emote) showEmote('follower', action.emote, 900); // Oshawott reacts to what you opened (static under reduced motion, handled by showEmote)
      const muted = isMuted() && action.whenMuted;
      const lines = muted ? [...action.lines, action.whenMuted!.line] : action.lines;
      const openDialogue = () =>
        hostRef.current.open('dialogue', {
          lines,
          icons: muted && action.whenMuted!.icon ? { [lines.length - 1]: action.whenMuted!.icon } : undefined,
          after: action.after,
          before: action.before,
          next: action.next,
        });
      if (action.anim) {
        freeze(); // the player holds still while the object animates; the dialogue overlay then owns freeze/resume
        void playObjectAnim(e.objectId, action.anim.ms).then(openDialogue);
      } else openDialogue();
    });
  }, []);

  useEffect(() => {
    if (slug) hostRef.current.open('pokedex', { slug });
  }, [slug]);

  useEffect(() => {
    if (card) hostRef.current.open('trainer-card');
  }, [card]);

  useEffect(() => {
    if (overlay) hostRef.current.open(overlay);
  }, [overlay]);

  // the URL follows the open overlay for the deep-linkable ones (pokedex and the card manage their own); `/` once closed
  const openId = host.current?.id ?? null;
  const managed = useRef(false);
  useEffect(() => {
    const value = openForOverlay(openId);
    if (value) {
      managed.current = true;
      setOpenParam(value);
    } else if (managed.current) {
      managed.current = false;
      if (overlayForOpen(new URLSearchParams(window.location.search).get('open'))) setOpenParam(null);
    }
  }, [openId]);
  return null;
}

/** What the top screen is, for screen readers: computed per room, so it follows the player up and down the stairs. */
const ROOM_NOUN: Record<RoomId, string> = { bedroom: 'bedroom', downstairs: 'kitchen and living room', yard: 'front yard' };
/** Reactive decor, grouped by label: "a plant" / "2 plants". */
const reactiveAria = (room: RoomId) => {
  const counts = new Map<string, number>();
  for (const r of reactives(room)) counts.set(r.label.toLowerCase(), (counts.get(r.label.toLowerCase()) ?? 0) + 1);
  return [...counts].map(([label, n]) => (n > 1 ? `${n} ${label}s` : `a ${label}`));
};
const roomAria = (room: RoomId) => {
  const extra = reactiveAria(room);
  return `Pixel-art ${ROOM_NOUN[room]} containing ${objects(room)
    .map((o) => o.label.toLowerCase())
    .join(', ')}${extra.length ? `, and ${extra.join(', ')}` : ''}. Use the object buttons below, or A and the arrow keys, to look around.`;
};

export default function App() {
  const { asset: font, ready: fontReady } = useAsset('font.ui');
  const gameRef = useRef<HTMLDivElement>(null);
  const room = useSyncExternalStore(onRoom, currentRoom, () => 'bedroom' as const);

  // lazy ref: computed once on the client, never changes rendered markup
  const slugRef = useRef<string | null | undefined>(undefined);
  if (slugRef.current === undefined) slugRef.current = deepLinkSlug();
  const slug = slugRef.current;
  const cardRef = useRef<boolean | undefined>(undefined);
  if (cardRef.current === undefined) cardRef.current = deepLinkCard();
  const overlayRef = useRef<string | null | undefined>(undefined);
  if (overlayRef.current === undefined) overlayRef.current = deepLinkOverlay();

  /**
   * Title screen: shown once per session on a fresh visit.
   *
   * HIGH 1 — hydration safety: the server always renders titleVisible=false (no title screen),
   * and useLayoutEffect (browser-only, before first paint) sets it to true if needed.
   * This avoids an SSR/client mismatch that would discard server markup and cause a flash.
   *
   * `titleFreezeRef` tracks whether the title is holding a freeze so we only call resume()
   * for the freeze WE placed (MED 6: don't resume if an overlay opened simultaneously).
   *
   * `forceTitleRef` is set by ?title=1 (passed as noAuto to TitleScreen) to disable the
   * auto-dismiss timer, keeping e2e tests stable (HIGH 2).
   */
  const [titleVisible, setTitleVisible] = useState(false);
  const titleFreezeRef = useRef(false);
  const forceTitleRef = useRef(false);

  useLayoutEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const parsed = parseTitleParams(search);
    forceTitleRef.current = parsed.forceTitle;
    const show = shouldShowTitle({ ...parsed, reducedMotion, alreadyShown: readShown() });
    if (show) {
      markShown(); // mark immediately so a fast reload / duplicate tab doesn't double-show
      freeze();
      titleFreezeRef.current = true;
      setTitleVisible(true);
    }
  }, []); // intentionally empty: run once, synchronously before paint

  const dismissTitle = useCallback(() => {
    setTitleVisible(false);
    if (titleFreezeRef.current) {
      titleFreezeRef.current = false;
      resume();
    }
    gameRef.current?.focus({ preventScroll: true });
  }, []); // stable: deps accessed via ref

  // Default focus target: the game area (whenever the title is not showing)
  useEffect(() => {
    if (!titleVisible) gameRef.current?.focus({ preventScroll: true });
  }, [titleVisible]);

  return (
    <OverlayHost focusRef={gameRef}>
      <Wiring slug={slug} card={cardRef.current} overlay={overlayRef.current} />
      <div className={`shell${fontReady ? ' font-ready' : ''}`} style={{ ['--ui-font' as string]: `"${font.family}"` }}>
        <QuickLinks />
        <div className="fit" />
        <div className="screens">
          <h1 className="sr-only">Ayush Basu — portfolio</h1>
          <Lid titleVisible={titleVisible}>
            <div className="top-screen" ref={gameRef} tabIndex={-1}>
              {/* role=img on its own box: the Pokédex layer is a sibling, so its buttons and links stay accessible */}
              <div className="world-view" role="img" aria-label={roomAria(room)}>
                <WorldView startAt={slug ? 'pc' : undefined} />
              </div>
            </div>
          </Lid>
          <div className="hinge" aria-hidden="true" />
          <BottomScreen />
          {/* Title screen: absolutely covers .screens (top+hinge+bottom), below QuickLinks */}
          {titleVisible && (
            <TitleScreen
              name={resumeMeta.name}
              onDismiss={dismissTitle}
              noAuto={forceTitleRef.current}
            />
          )}
        </div>
      </div>
    </OverlayHost>
  );
}
