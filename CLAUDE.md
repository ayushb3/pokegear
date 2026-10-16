# CLAUDE.md

Portfolio site as a Pokemon HGSS-style house you walk around: a bedroom, down the stairs a kitchen and living room, and out the front door a yard with tall grass (a wild RECRUITER battle). Astro + ONE React island
(`client:load`) + TypeScript strict + PixiJS v8. npm only.

**Design principles**: [`docs/design-principles.md`](docs/design-principles.md) — follow these in every overlay, page, and component.

Agent loop (implement → verify → fresh review → PR) and its accumulated lessons: `docs/agents/loop-brief.md`. Read it before delegating work to subagents.

## Boundary (do not break)
- React owns all UI. Pixi only draws the top screen and is never touched from React.
- UI code imports ONLY `src/world/api.ts` from `src/world/` (`interact, freeze, resume, goTo,
  onEvent, rest, isNight, showEmote, playObjectAnim, playReaction, objects, reactives, currentRoom, roomLabel, onRoom, WorldView`). Per-frame game state never goes through React state.
  onEvent, rest, isNight, showEmote, startWipe, clearWipe, isShiny, objects, emphasisObject, currentRoom, roomLabel, rooms, onRoom, WorldView`). Per-frame game state never goes through React state.
- Positions render at integer DEVICE pixels (see `render.ts`, `scale.ts`). Keep the crisp-pixel setup.
- Layout is ONE DS unit on every viewport: top screen, a 4-native-px hinge, bottom screen, same width, centred vertically (the object dock below mirrors above). `layout.ts`
  picks the largest integer scale `s` at which both fit (`stackScale`) and publishes `--px` (CSS px per native
  pixel). Both screens are 256x192 native px (`calc(var(--u) * 256)`), so the pixel font stays an integer multiple.

## Layout
- `src/world/`: `grid.ts` (`ROOMS`: each room's object table, `DECOR` table and warps), `path.ts` (BFS), `actors.ts` (Game: movement,
  follower, rooms), `fx.ts` (day/night + fade), `render.ts`, `input.ts`, `World.tsx`, `api.ts`, `bus.ts` (internal).
- `src/ui/`: `App.tsx`, `BottomScreen.tsx`, `overlay/` (host, registry, overlays).
- `src/content/`: `pokedex.json` + `pokedex.ts` (the Pokédex entries; also feed `/projects/[slug]`), `actions.ts` (type + glob collector), `objects/<id>.ts` (what each object does, one module per object).
- `src/assets/assets.json`: every asset slot. `scripts/slice-sprites.py` builds `public/assets/` from the raw pack.

## Rooms (the house)
- `ROOMS` in `grid.ts` is the source of truth: `Room = { id, label, furniture, decor, warps, start, floor, wall }`. Rooms: `bedroom` ("Ayush's room"),
  `downstairs` ("Downstairs": fridge, TV, corkboard, Mom) and `yard` ("Front yard": mailbox, sign, tall grass). `FURNITURE`, `DECOR` and `PLAYER_START` are aliases of the BEDROOM's tables (old imports keep working);
  `ALL_FURNITURE` is every object of every room. Object ids are unique across the house; `roomOfObject(id)` finds the room.
- **Every room is 14 x 10** (back wall = rows 0-1), so `ROOM_X`/`ROOM_Y`, the surround and the tap maths never change. A room's `floor` / `wall` are its palette (`drawRoom`).
- **Warps** are the stairs: `{ x, y, to, arrive: { x, y, facing } }`. A warp tile is walkable, sits under NON-solid decor (`decor.stairs-*`), is never a standing spot, and its
  arrival tile is walkable and not a warp. Every warp needs a return warp. Bedroom (2,9) <-> downstairs (12,2); you land on (12,3) facing down / (2,8) facing up.
  The front door: the downstairs door mat (6,9) <-> the yard's door mat (6,2); you land on (6,3) facing down / (6,8) facing up.
  BFS never walks THROUGH a warp tile (a warp can only be the end of a path), so stairs are never a shortcut.
- `Game` (actors.ts) holds every room's grid and the active room. Stepping onto a warp sets `warping` (input ignored) and calls `onWarp`; the renderer runs
  `fx.fadeThrough(() => { swap view; game.enterRoom(...) })`. `enterRoom` places the player and the follower (behind), clears path and keys, emits `{ type: 'room' }`.
  Without `onWarp` (unit tests) it enters at once. `freeze()` (an overlay opening) drops a pending walk but never cancels a fade in flight.
- `goTo(id)` works across rooms, any number of hops: `Game.nextHop` BFSes the house (rooms = nodes, warps = edges), walks to the warp into the next room, enters,
  then `goTo` again (`after`) until the object's room. Bedroom -> yard is two hops (stairs, then the door). The bag and tapping a stairs tile use it.
- `render.ts` builds one `RoomView` per room at load and toggles `visible` (never rebuild: it leaks Pixi objects). The player and follower sprites move into the new room's `spriteLayer`.
- React reads the room with `useSyncExternalStore(onRoom, currentRoom)`: the bag lists ONLY the CURRENT room's objects (the Card is not a bag slot, see Trainer Card button), the selected bag tab shows `roomLabel()` (see Bag room tabs), the world's aria-label is per room.
  The stairs have no bag slot (the bedroom bag is full); touch players tap the stairs tile or use the Town Map.
- Tests: `content.test.ts` loops the layout rules over `ROOMS` (reachability from the start tile AND every arrival tile, <= 7 objects per room, warp rules above); `world.test.ts` has a two-room fixture;
  `e2e/house.spec.ts` walks the stairs. E2E: poll `__game.room` (`waitRoom` in `e2e/helpers.ts`), never sleep around a fade.
- Add a room: a `Room` in `ROOMS` + its `RoomId`, `decor.*` / `object.*` slots appended to `assets.json`, a warp each way, and the objects' modules. The 7-object rule is PER ROOM.

## Trainer Card button (bottom bar)
- The Card has its own round button (`.btn-card`, `data-testid=btn-card`, aria-label "Open the Trainer Card") in the middle of the pad, between START / sound (left) and B / A (right), with a "Card" caption (`.lbl-card`) like the A/B captions. It shows `icon.card` (the player head) and opens the `trainer-card` overlay exactly like START opens the menu (no-op while an overlay is open; B closes; focus returns to the button).
- DOM / Tab order: START, sound, Card, B, A. No key shortcut (none existed for the card). `/?open=card` is unchanged.
- Geometry at 375x812 (1x): the gap between the left group and the face block is only ~50px, so START is `min-width: 44px` and the left group has no gap. `.pad` is a flex row (left group | `.pad-mid` flex:1 | face), so the button is centred in the gap at every scale with no magic offset. The button is `max(44px, 24u)` so its 16u icon stays inside the ring at 3x. `e2e/card-button.spec.ts` asserts no overlap, size, centring, icon inside, caption and Tab order.
- The bag is objects only (4-7 slots per room). Old selectors `slot-card` / `[data-slot=card]` / `DESC.card` are gone.
- **Bag room tabs** (`.bag-tabs`, `bagTabs.ts`): the 18u strip above the slots is a tab row `Bedroom / Downstairs / Yard` (`rooms()` in `api.ts`, house order; `role=tablist`, `data-testid=tab-<room>`), so the bag keeps its two slot rows. The SELECTED tab shows the location name (`roomLabel`: "Ayush's room"; it carries `data-testid=idle-loc`), the others the short name, so all three fit 240u at 16u. The listed room starts as the player's room and follows it on every room change; tapping a tab or **Q / E** (also PageUp / PageDown: the arrows and WASD walk, Z/X/Enter/Esc are A/B) switches it (wraps; only while the bag shows). Picking an object of another room tab calls the cross-room `goTo(id)`. The first-visit PC cursor is `emphasisObject(<listed room>)`, so it rests on the bedroom tab only. A running tour line replaces the tab row. Tap areas: a tab reaches from the box edge to the slot rows (25 px tall, min 44 px wide; the 100u box cannot give 44 next to the slots), so the top slot row only reaches up to the tab edge (~25 px; the bottom row still gets 44+ over the description).
- First visit bag: until the room's `emphasis` object (the PC) has been opened, once the hint line is gone the bag rests on that slot (selected look, description in `idle-desc`). `emphasisObject(room)` in `api.ts`.

## Title screen
- `src/ui/TitleScreen.tsx` + `src/ui/titleScreenLogic.ts` (logic) + `src/ui/titleScreenLogic.test.ts`.
- Shown once per session (sessionStorage key `title-shown`) on `/` only, when none of: `?open=` (deep link), `?debug` without `?title=1`, `prefers-reduced-motion`.
  - `?title=1` overrides `?debug` and forces the title on — used for e2e tests. It also sets `noAuto=true` on the component, disabling the auto-dismiss timer (`AUTO_MS`) so tests are not racing.
- Layout: full-DS overlay (`position:absolute; inset:0`) inside `.screens`, which is `position:relative`. QuickLinks live outside `.screens`, so they are never blocked.
- Top screen (settled): "Ayush Basu" wordmark (pixel font, 32u, yellow, top 60u), Oshawott follower below it (112u, 100u; bobbing), seven twinkling stars. No subtitle.
- Intro "Night walk" (`INTRO_MS = 3200`, all CSS animations with `animation-delay`, no JS per frame; base styles = the settled frame): stars pop in 0-600 ms; Oshawott walks in from the left facing right 300-2000 (4u steps) and turns to face down; "!" (`emote.exclaim`) above it 2300-2800 (gone before the name lands); the name drops in 2600-3000 (6 x 16u steps, 2u overshoot). The root carries `data-phase="intro"`, then `"settled"` at `INTRO_MS` (PRESS START appears and blinks, the follower bobs). Auto-dismiss `AUTO_MS = INTRO_MS + 2500`. Both constants live in `titleScreenLogic.ts`.
- Bottom screen: blinking "PRESS START" (`visibility: hidden` during the intro) and, with `SHOW_SKIP_BUTTON = true`, a visible "Skip" (bottom-right, 16u text, min 44px tap target; `aria-hidden`, `tabIndex=-1`) next to the always-present sr-only "Skip intro" (the screen shows one Skip). The Skip is an HGSS menu button (the shared frame rule and `--frame-*` tokens in `app.css`: overlay cream, 1u dark outline, pale/purple inner lines, 4u radius; no title bar), on the native grid at every scale (`e2e` checks whole `--u` multiples). `.title-bottom` is `box-sizing: border-box`, so it is exactly the real bottom screen's 256x192 box. Every dismiss path skips the WHOLE title, at any point of the intro.
- Background tab (a link opened in a new tab): the intro and auto-dismiss timers only run while `document.visibilityState` is visible; when a hidden tab is first looked at (or looked at again mid-intro) `epoch` re-keys `.title-top`, so every CSS beat restarts from 0 with the timer (`data-epoch` on the root). A settled title stays settled. This also means the title can never auto-dismiss under the closed DS lid (PR #59): the lid reads `titleVisible` and never takes the title's freeze.
- Freeze/resume: `useLayoutEffect` (browser-only, before paint) freezes the world and sets `titleVisible=true`. Dismiss calls `resume()` ONLY if the title owns the freeze (`titleFreezeRef`). No SSR mismatch: server renders `false`, first layout effect sets `true`.
- Dismiss paths: any keydown (capture-phase, `preventDefault + stopImmediatePropagation` to block Enter/A/arrows/Esc from the game; Tab excluded so keyboard users can reach Skip; browser shortcuts excluded too: any Ctrl/Meta/Alt combo, F-keys and IME composition pass through untouched), click anywhere on the DS, auto after `AUTO_MS` (intro + 2.5 s hold of VISIBLE time; off when `noAuto`).
- a11y: `role=dialog`, no `aria-modal`. The dialog itself (`tabIndex=-1`, `outline: none`) receives focus on mount, so screen readers hear its label and NO focus ring shows on load (script focus matches `:focus-visible` in Chromium, so focusing a button would ring it for every visitor). The first Tab lands on the **visually-hidden** (`.sr-only`) "Skip intro" button; with `SHOW_SKIP_BUTTON` its `:focus-visible` ring is drawn on the visible Skip (2u, site blue, 1u off the frame); with `showSkip={false}` the sr-only button reveals itself when focused. "PRESS START" is `aria-hidden`.
- e2e: `/?debug` must NOT show it; `/?debug&title=1` MUST show it. Tests for key dismiss, click dismiss, dialog focus + Tab to the sr-only Skip (Enter activates), shortcut pass-through, the hidden-tab hold (init-script `visibilityState` override + fake clock), noAuto (fake clock), the intro (walk, `data-phase` intro -> settled, visible Skip frame on the grid, reduced motion = no title), and QuickLinks clickability are in `e2e/title-screen.spec.ts`. Wait on `data-phase`, never sleep through the intro.

## Quick-links bar
- `QuickLinks.tsx` (rendered by `App.tsx`) is a bar of plain links for recruiters. On wide viewports (`data-bar='side'` on `:root`) it floats in the side margin of the DS unit and takes no height; otherwise it sits in flow above the DS unit.
- `layout.ts` subtracts its height (`--bar-h`, `BAR_H`) from the available height ONLY when the bar is in flow; in side mode `--bar-h` is 0 (`BAR_W` is the margin width needed), so it never costs a scale step.

## Room size and the dark surround
- Each room is **14 x 10 tiles** (224 x 160 native px; back wall = rows 0-1). The DS top screen stays 256 x 192, so the room is centred
  in it (`ROOM_X`/`ROOM_Y` = 16 px) and the rest is a dark surround with a wall frame (`drawSurround` in `render.ts`).
- Grid coordinates are ROOM-local, (0,0) = the room's top-left tile. Everything inside the `room` container in `render.ts` uses room-local px;
  anything that needs top-screen px (e.g. `objectBox`, pointer maths) adds `ROOM_X`/`ROOM_Y`. Taps on the surround do nothing.

## Decor (non-interactive decoration)
- A separate table, `DECOR` in `grid.ts`, NOT `FURNITURE`. A decor row has no `id`, so it never gets a chip or a standing spot, and (unless it carries `react`, see "Reactive decor") no sparkle cue or action.
  Fields: `label, slot (decor.*), x, y, w, h, solid, dy?, lit?`.
- Same layering as furniture (`PIECES` in `render.ts`): art is bottom-centre anchored on the footprint; for a `solid` piece the part above the footprint
  goes to the foreground layer, so the player walks BEHIND tall pieces. `solid: false` for rugs and wall pieces (they never block). Solid decor blocks movement
  only on its footprint tiles. `dy` nudges the art in px. `lit: true` (the window) draws a blue-tinted copy above the night tint, so it stays brighter than the room at night.
- A decor row may carry `react: '<id>'` to react to A / a tap without becoming an object: see "Reactive decor" below.
- Current decor, bedroom: rug, stairs down, window, bookshelf, 2 plants. Downstairs: rug, stairs up, door mat, sink, stove, table, 2 plants. All pieces have
  real art (no placeholders). Stair art: ThatsSoWitty native 16 px tiles, enclosed red-brick box (down 36x40: the 32 px body padded 2 px on the left so it stays centred and the shadow hangs right; up 32x40, the mat beside it dropped). Rugs are ThatsSoWitty native 64x38 (`decor.rug` blue in the bedroom, `decor.rug-beige` downstairs, both `dy: -5`: art is bottom-anchored on the 48 px footprint, so -5 centres the 38 px art). Kitchen counter line on the back wall: sink x 0-1 (y 1-2), stove x 2-3 (w 2), fridge x 4. Sink and stove are ThatsSoWitty 16 px
- A separate table, `DECOR` in `grid.ts`, NOT `FURNITURE`. A decor row has no `id`, so it never gets the sparkle cue, a chip, an action or a standing spot.
  Fields: `label, slot (decor.*), x, y, w, h, solid, dy?, lit?, encounter?` (`encounter: true` = tall grass, see the yard section).
- Same layering as furniture (`PIECES` in `render.ts`): art is bottom-centre anchored on the footprint; for a `solid` piece the part above the footprint
  goes to the foreground layer, so the player walks BEHIND tall pieces. `solid: false` for rugs and wall pieces (they never block). Solid decor blocks movement
  only on its footprint tiles. `dy` nudges the art in px. `lit: true` (the window) draws a blue-tinted copy above the night tint, so it stays brighter than the room at night.
- Current decor, bedroom: rug, stairs down, window, bookshelf, 2 plants. Downstairs: rug, stairs up, door mat, sink, stove, table, 2 plants. Yard: path,
  the lawn, 2 tall-grass patches, the front door, a door mat, 2 windows, 4 trees (lawn and tall grass are cut from the ThatsSoWitty OUTDOOR tileset by `yard_grass()` in `scripts/slice-sprites.py`; the rest is drawn by `scripts/objects/yard.py`). All pieces have real art (no placeholders). Stair art: ThatsSoWitty native 16 px tiles, enclosed red-brick box (down 36x40: the 32 px body padded 2 px on the left so it stays centred and the shadow hangs right; up 32x40, the mat beside it dropped). Rugs are ThatsSoWitty native 64x38 (`decor.rug` blue in the bedroom, `decor.rug-beige` downstairs, both `dy: -5`: art is bottom-anchored on the 48 px footprint, so -5 centres the 38 px art). Kitchen counter line on the back wall: sink x 0-1 (y 1-2), stove x 2-3 (w 2), fridge x 4. Sink and stove are ThatsSoWitty 16 px
  native crops. The table is halved 2:1 nearest-neighbour from the Mew RMXP 32 px sheet (48x36 native).
- Slots live in `assets.json` as `decor.<name>`; art is cut from the tile packs by `decor()` in `scripts/slice-sprites.py` into `public/assets/decor/`.

### Add decor
1. Art: add a crop box to `decor()` in `scripts/slice-sprites.py`, run it, and add a `decor.<name>` slot (`kind: object`, `path`, `w`, `h`, `color`) at the END of `assets.json`.
2. Add a row to `DECOR` in `grid.ts`. Keep it OFF every standing spot (the tile next to an object) and never wall off a floor tile:
   `content.test.ts` ("room size and decor") checks bounds, overlap, reachability of every object and of every floor tile. Back wall pieces use rows 0-1, non-solid.

## Night tint
- `tintLayer` (a `0x06102e` overlay at the room's `nightAlpha`) darkens `bg`; the layers ABOVE it (`spriteLayer`: actors, poses, grass tips; `fg`) get a `ColorMatrixFilter` doing the same maths, `p*(1-a) + overlay*a` (`src/world/nightTint.ts`), attached only while `a > 0`. A plain `tint` can't (no additive term: tall pieces show a seam at the footprint line). The grass tips therefore need no tint of their own. Cues, drops, bursts, emotes and `litLayer` stay untinted. Sprites inside a light pool are tinted like the rest (the pools light the floor only). `e2e/night-tint.spec.ts` reads the player's pixels day vs night.

## Asset-slot rule
- No asset path strings anywhere except `assets.json`. Code asks for a slot name (`getAsset('sprite.player')`).
- No art yet? Mark the slot `"placeholder": true` (with a `color`); the renderer draws a coloured block.
  Swapping real art in = editing assets.json (e.g. pointing `sprite.player` at `lyra.png` just works).
- Raw pack (private repo `ayushb3/portfolio-assets`) is read-only; slice into `public/assets/` via the script. On a new machine: `gh repo clone ayushb3/portfolio-assets ../portfolio-assets` (next to this repo), or set `PORTFOLIO_ASSETS`. `scripts/raw_assets.py` finds it (also from a `portfolio-wt/<name>` worktree). Only needed to re-slice art; `public/assets/` is committed.

## Overlay contract
- `OverlayHost` shows at most ONE overlay at a time, in the bottom screen. (The Pokédex also draws a DOM layer over the top screen, see below.)
- Opening (from nothing) calls `freeze()`; B / Esc / X / Backspace / on-screen B closes it and calls
  `resume()`. `replace()` swaps overlays without unfreezing (dialogue -> pokedex).
- The player stays on the same tile facing the same way; focus returns to where it was (game area).
- Overlays are components auto-registered by folder name from `src/ui/overlay/overlays/<id>/index.tsx` (default export; `registry.ts` globs them, never edit it); they declare A/B/d-pad via
  `useOverlayInput({a,b,up,down,left,right,labels:{a:'Next',b:'Close'}})`; `labels` are the tiny captions under the on-screen A / B (default Talk / Back). An overlay may intercept B (detail -> list) but must end in `ctx.close()`.
- **One frame + header (`src/ui/overlay/OverlayFrame.tsx`)**: `<OverlayFrame title aside? placement? barProps?>` = the shared HGSS frame (cream `--frame-fill`, 1u `--frame-line` outline, pale/purple/pale highlight lines, 4u radius: the same `--frame-*` tokens in `app.css` as the dialogue box, the idle box and the title Skip) + the red title bar `.oframe-bar` (exactly 18u incl. its 1u outline, no margin: one `--lh` of the 1x budget; the `h2` holds only `title`, `aside` sits beside it; no title and no aside = no bar). `placement='bottom'` (default) is the `.overlay` root; `'top'` fills the top screen (a portal layer). Used by the Pokédex grid (BOX 1; the slots keep the PC-box red checker wallpaper), the Commit log, the fridge (list and open view). A new overlay with a header uses it; no bespoke title chrome.
- **Desktop key hint** (`.key-hint`, `keys.ts`): while an overlay is open, `BottomScreen` draws two lines `Z <A label>` / `X <B label>` (the overlay's own `useOverlayInput` labels, via `host.labels`) in the pad's top-left corner above START (88x28u at 1x, 58x28u on the wider 2x layout, the only empty native-px corner: the overlay frame is full, so it is NOT inside the frame). Only under `@media (hover: hover) and (pointer: fine)`, never on touch. Keys come from `keys.ts` (`KEY_A` / `KEY_B` / `KEY_DIR`, shared with `OverlayHost`; Enter/Space and Esc/Backspace work too). Font stays 16u (line height 14u). The pixel font has no arrow glyphs (only ▶ ▼), so the d-pad is not listed. `keyHint.test.ts` checks every overlay label against the font glyph set (and <= 11 chars), `e2e/key-hints.spec.ts` the fit at 1440x900 / 1024x700 and the absence on touch.

## Pokédex (Rotom hosts the projects)
Overlay `src/ui/overlay/overlays/pokedex/`. The ENTRY takes over the TOP screen: a DOM layer portalled into `.top-screen` (a sibling of
the `role=img` world box, so its links stay accessible); the world dims (`dim(on)` in `api.ts`) and stays frozen. React never touches Pixi.
The BOTTOM screen is the controls (HGSS style): big ◀ ▶ (keys left / right) turn the PAGES of the open entry and wrap round (never disabled); page dots and "Page n/5" sit between them. Smaller yellow ▲ ▼ "No." buttons (keys up / down) switch ENTRY and show the previous / next number. A = next page (wraps from the last page), B = back.
- From the PC: narrator line -> Rotom pops out of the monitor (DOM, 520 ms, none under reduced motion) -> Rotom's line -> PC-box grid.
  From Start > Pokédex: the list. Deep link / town map / monitor: the entry directly.
- B steps back one level: entry -> grid/list -> closed. Pages: Entry, What got built (What / How / Result), How it was built (the process), What I learned (all TextPages), Links. Lead with what was built and how, then learnings; cost is not the story (no $ figures). Missing facts are `Placeholder: ...` text, flagged in `draft`. Keep tech chips to 2-3.
- Voice: Rotom ("Bzzt!", short and friendly) inside the dex; the third-person narrator for world and object lines.
- "Seen" Poké Ball = entry opened this visit (sessionStorage, try/catch). No totals, no "complete".
- Sprites are Black/White GIFs, only ever inside the dex. Slots `sprite.dex.*` in `assets.json` (`path`, `still`, native `w`/`h`);
  render at an integer multiple of native size, `image-rendering: pixelated`; `still` under `prefers-reduced-motion`.

### Add a dex entry
1. `src/content/pokedex.json`: append an object (see `DexEntry` in `pokedex.ts`): `slug`, `no`, `name`, `title`, `category`, `sprite`,
   2-3 `types`, 2 `stats`, 2 `flavour` lines, `ribbon`, `what` / `how` / `impact`, 3 `built` beats (process), 2-3 `learned` items, `links`, and a `draft` map
   (set a key to `true` for every copy field Ayush has not signed off; a content test requires it until the content pass).
2. Art: `scripts/pokedex-assets.py` (add the GIF to `SPRITES`, run it), then a `sprite.dex.<name>` slot at the END of `assets.json`.
3. That is all: the grid (2 x 2 slots, keep it <= 4 or extend `Grid` in `top.tsx`), the list, the deep link `/?open=projects/<slug>`
   and the plain page `/projects/<slug>` all read the same file. Never mention or show course / education material.
4. Facts only: invent nothing. Private repo: no repo link, say so in `ribbon`.

## Overlay text primitives (REQUIRED)
The bottom screen box is small (a handful of lines). Overlays MUST use these for any text or list that can
exceed the box; never rely on `overflow` or hope it fits.
- `src/ui/overlay/TextPages.tsx`: `<TextPages ref blocks={[{label,text,href?,muted?}]} onDone />`. Slices text into
  whole-line pages (the right edge is reserved for the down-arrow; the last page never holds a single line), blinking down-arrow while more follows, tap / `ref.current.advance()` (wire to `a`) pages on, A on
  the last page calls `onDone`. Labels sit on their own line. Mirrors text to the aria-live region.
- `src/ui/overlay/ScrollList.tsx`: `<ScrollList items={[{key,label}]} selected onActivate />`. Keeps the selected row
  visible and shows up/down cues. The overlay owns `selected` (up/down via `useOverlayInput`).
- Dialogue: keep each entry of `lines` to roughly 3 lines; use `before: 'rest'` to fade first, `after: 'rest'` after.
- Call `useOverlay().announce(text)` for anything else a screen reader should hear.

## Discoverability cues (render.ts, generic from the object table)
- `emphasis: true` on a FURNITURE row (the PC) = soft pulsing glow until that object has been opened once this visit
  (a deep link counts as opened). Never hard-code an id.
- Every interactable (any row with an `id`) shares one sparkle cue, shown when the player is adjacent or the mouse
  hovers it. Reactive decor (`react`, keyed by `decorKey`) shares it; plain decoration (`id: null`, no `react`) has none. `prefers-reduced-motion` gets static cues.

## Objects (all are already laid out)
The bedroom has 7 objects: pc, piano, bed, journal, monitor, townmap, gym. The yard has 2: mailbox (overlay: Email / LinkedIn / GitHub from `resume.json`) and sign (lines only: the one hint about the grass). Downstairs has 4: fridge (food log overlay, see "Fridge" below), tv, corkboard (a photo board, see Photo board), mom
(generic lines only: never invent facts about Ayush). The cap is 7 PER ROOM. Footprints, standing spots and
placeholder asset slots for ALL of them are already in `grid.ts` / `assets.json`. Groups (Common Region):
tech at the desk (PC, monitor), commit log (journal: next to bookshelf, x:2 back wall), music (piano), rest (bed), gym corner, town map on the back wall.
A follow-up PR that builds one object must NOT touch `grid.ts`, `registry.ts`, `App.tsx`, `smoke.spec.ts`
or anyone else's files; it only creates/edits files named after its own id (below). This is what keeps
parallel PRs conflict-free.

## Photo board (corkboard, downstairs)
- Overlay `overlays/corkboard/` (+ `board.ts` = pure paging maths, `src/content/photos.ts` = shared content helpers). `src/content/photos.json` = `{ photos: [{ id, place, where, slot, caption?, wall? }] }`, grouped by `place` (a `places.json` id) in file order. `where` is a short label ("Kyoto"); the optional `caption` overrides it. The board shows `caption ?? where`, plus the country name when it differs ("Kyoto, Japan"). No `sample` flag.
- Board: ONE ROW of 4 near-square cells per page (52x48u, whole native px: 4 x 52 + 3 x 6 gap = the 226u grid), caption bottom left, page `n/N` bottom right (tap = next page), never a shrunk font. Thumbnails `object-fit: cover`; ONLY the current page's 4 images are rendered. A enlarges the photo onto the top screen (DOM portal + `dim`, `object-fit: contain`); A, right or a tap there = next photo, left = previous; B = back to the grid.
- **Place filter** = the h2 bar `◀ ALL 83 ▶` / `◀ UNITED STATES 26 ▶` (`filtersOf` in `board.ts`: ALL first, then places in order of FIRST APPEARANCE in `photos.json`, i.e. trip order, newest first; names from `PLACES`). Keys: **up / down** change the filter (wrapping; announced via `announce`; resets the selection to photo 1; ignored while enlarged), **left / right** step one photo through the FILTERED list and turn pages. The bar arrows are tap shortcuts. Captions, enlarge, paging and `n/N` all work inside the filter.
- **Page-change rule**: any page change (a jump, or stepping right past a page's end) lands on the FIRST photo of the new page; the one exception is stepping left from a page's first photo, which lands on the LAST photo of the previous page. Never keep the column (`move` in `board.ts`; up/down on the board are filter keys, the page counter tap uses `move(sel,'down')`).
- **Return trip (generic, `ctx` / OverlayHost)**: `ctx.replace(id, { ..., returnTo: { id, props } })`; the callee's top-level B calls `closeOrReturn(ctx, props)` (`context.ts`), which `replace()`s back to `returnTo` with its saved `props`, else `close()`. `replace()` never unfreezes, so the world stays frozen the whole trip and the last B closes + restores focus. Town Map -> Photos passes `props.place` (preselects that filter) and `returnTo: { id: 'townmap', props: { nav: navPath(state) } }`; the Town Map rebuilds its state with `restoreNav` (replays the index path: same level, selection and parent stack). The board's B label reads "Map" when it has a `returnTo`, "Close" otherwise (opened from the room: B closes).
- **Town Map "Photos"** (`photoPlace` in `nav.ts`): A is Zoom when the entry is zoomable, else "Photos" when the selected PLACE has photos, else Next. A **region pin never offers Photos** (A zooms; pick a country inside it, where A = Photos). City level: A stays Next, so a place with cities is zoomable and its photos are not offered (no place has cities today; revisit then). The name row shows "Name · N photos".
- Plain-page twin: `/photos` (`src/pages/photos.astro`, zero JS, grouped by country, `<img width height loading=lazy>`).
- Add a photo: a <=512px metadata-free (no EXIF/GPS) JPEG in `public/assets/photos/<place>-<n>.jpg`, a `photo.<place>-<n>` slot (`kind: object`, `path`, `w`, `h`) at the END of `assets.json`, an entry in `photos.json` next to its place's other photos. `content` tests check ids, places, slots, paths and that exactly 3 photos carry `wall: true`.
- Wall art: three equal pixel polaroids (48x24) from the three `wall: true` photos, drawn by `corkboard()` in `scripts/draw-objects.py` (reads `photos.json` + the committed JPEGs, writes `public/assets/objects/corkboard.png`). The corkboard footprint is 3 tiles wide (x:6, y:1, non-solid). Change the wall photos = change `wall` in `photos.json`, rerun `python scripts/draw-objects.py`.
## Fridge (`overlays/fridge/`)
The food log as a fridge door. TOP screen = DOM portal into `.top-screen` (world dimmed, like the Pokédex): pale-blue door, magnets, and the SELECTED entry's polaroid, which follows the cursor (alt = the entry title); entries without a photo (want to try) show a blank note card. Opening an entry makes the polaroid large (224x176) with the title under it in a 40 px caption strip: line-height 16, at most 2 whole lines, centred vertically. Portrait photos are shown whole (contain, no crop) in a box of their own aspect centred on polaroid-paper (`#fffdf2`), never between dark bars.
BOTTOM screen (an `OverlayFrame`), list: red title bar `◀ filter ▶ count` (All notes / Cooking / Hall of Fame / Want to try; left/right keys switch, only in the list; the filter and count are announced on mount and on every change), then colour-coded sticky-note rows (yellow cooking, pink hall of fame, blue want to try): title (ellipsis) + short date. Newest first with MONTH HEADER rows ("AUG 2026"; not selectable, up/down skip them); real entries with no date go under UNDATED (no header when there are none). SAMPLE entries sort LAST regardless of date, under one "SAMPLES" header. The list is the overlay's own (ScrollList has no non-selectable rows): rows are 20 px, headers 14 px, it snaps to whole rows, clips the leftover sliver, and refits on resize (ResizeObserver). At 1x the 68 px list shows 2 rows with a header between, or 3 rows.
Open view: the title bar shows the section label + "n of N" in the current filter, then one TextPages with the place on its own line, the date on its own line, then the note (each wraps, never truncated; a missing place or date leaves no empty line or dangling " ·"). The title is NOT repeated in the bottom text (the polaroid caption has it); the open view announces it once to the aria-live region. Notes describe the dish or the place's food only (never facts about Ayush). A pages, and on the last page opens the NEXT entry in the current filter (wraps); up/down switch entries while open; B goes back to the list, B again closes. Labels: A "Next" (list: "Open"), B "Back" (list: "Close"). The neighbouring photos are preloaded. List moves announce "title, place, long date".
- Data: `src/content/fridge.json` = `{ entries: [...] }` (no top-level flag). Entry: `{ date: "YYYY-MM-DD" | null, section: cooking|hallOfFame|wantToTry, title, note?, noteDraft?, place?, photo?, sample? }`. `sample: true` only on the 3 placeholder want-to-try entries: `date: null` (never invent a date), every string starts with "Sample:" (test enforced), the bar shows a "Sample" tag while one is selected, and `/food` leaves them out. All strings must pass the pixel-font glyph guard in `content.test.ts`.
- `noteDraft: true` marks an AI-generated placeholder `note` (dish/place description only, <= ~90 chars, no facts about Ayush, no visible label on the site): Ayush rewrites the note and deletes the flag; a content test requires a non-empty note on every `noteDraft` entry.
- Add an entry by hand: (1) re-encode the photo with NO metadata (no EXIF/GPS), long side <= 512 px, JPEG; (2) save it as `public/assets/fridge/<n>.jpg`; (3) add a `fridge.photo.<n>` slot (`kind: object`, `path`, `w`, `h`, `color`) at the END of `assets.json`; (4) append the entry to `fridge.json` (code sorts). Never commit originals.
- Logic (sort, month headers, filters, date formats) is in `helpers.ts` with unit tests; `/food` (`src/pages/food.astro`) is the zero-JS twin (entries by section, lazy photos), linked from `/about` and the home page `<noscript>` list.
## Front yard, tall grass and the wild RECRUITER battle
- Room `yard` (`grid.ts`): rows 0-1 are the front of the house (roof, siding, the door at (6,0)), the path runs down from the door mat (6,2), tall grass on both sides
  (`decor.grass` x 0-4 and 9-13, y 4-9, `encounter: true`) over a `decor.lawn` tile (224x128, rows 2-9, drawn first, non-solid; the yard `floor` colours are its greens), mailbox (8,3), sign (4,3), four trees on row 2. A porch light pool at night.
- **Encounters** (`actors.ts`): the grid knows grass tiles (`Grid.encounterAt`). Every step that lands on grass counts (`grassSteps`; leaving the grass or changing room
  resets it); `encounterRoll(steps, rng)`: never before step 3, a 40% chance on 3-5, certain on step 6. `RoomsOpts.rng` injects the source: `?debug` passes `() => 1`, so
  under `?debug` only the certain 6th step fires (e2e walks are deterministic). A hit: `startEncounter()` drops every queued move, sets `inEncounter` (like `warping`:
  input, taps, goTo and interact are all ignored) and emits `{ type: 'encounter' }`. `resume()` clears `inEncounter`, so the overlay's close ends it: no extra API.
- **The wipe** (`fx.ts`): `Fx.startWipe(instant)` = two black blinks (320 ms) then a spiral of 16 px cells closes in (`spiralOrder`, 640 ms) and the screen STAYS black
  (`phase 'held'`) until `clearWipe(instant)` fades back in. `instant` (reduced motion) cuts. The renderer draws the spiral on a stage Graphics from `fx.wipe` (0..1).
  A `fadeThrough` asked while held runs its `mid` at once. `api.ts`: `startWipe()`, `clearWipe()`.
- **The battle** = overlay `overlays/battle/` opened by `App.tsx` on the `encounter` event. `logic.ts` is a pure reducer (`battleReducer`, unit-tested): intro (the wipe)
  -> "A wild RECRUITER appeared!" -> menu FIGHT / BAG / POKéMON / RUN (2 x 2, `gridMove`) -> moves (2 x 2 + "PP n/1  TYPE/x" line). Each move has 1 PP and its power
  sums to the recruiter's HP (`battle.json`), so winning means every line was shown once. After a move the recruiter answers (12 damage, three generic lines about
  Oshawott only; it can never take OSHAWOTT to 0). A move whose own text already says "It's super effective!" is not given the generic line twice (`effect()` in `logic.ts`). Win -> "RECRUITER was convinced!" -> "wants to connect!" -> links (LinkedIn, Résumé, GitHub, Email). BAG = RÉSUMÉ ×1
  (costs a turn and opens NOTHING). The count is real: `state.bag` (per `BAG_ITEMS` entry, restocked by `initialState`, i.e. every new battle) drops to 0 on use;
  at ×0 the row stays, greyed (`data-spent`), and choosing it says "There are no RÉSUMÉS left!" and returns to the bag WITHOUT a recruiter turn. Moves' PP works the same way (spent = refused, no turn). **Résumé gate:** nothing opens or downloads the résumé before the final links screen; there `Résumé` is a row the visitor chooses (`logic.test.ts` guards the source, `e2e/yard.spec.ts` spies `window.open` and requests). B at the menu = RUN ("Got away safely!"), so B always ends in `ctx.close()`. The scene (`top.tsx`) is a DOM portal into
  `.top-screen` (like the Pokédex): recruiter (`battle.recruiter`, 32x40 at 2x) on a platform, Oshawott's back (the follower sheet's "up" row at 2x), HP boxes;
  `data-enemy-hp` / `data-player-hp` for tests. Text goes through `TextPages`; `data-text` on the overlay = the first line of the current run (e2e `readThrough`).
- **Content** `src/content/battle.json` (+ `battle.ts` types): every move `text` is a résumé fact in Pokémon-style wording (names GOLDEN JUDGE, SWARM MIND, SELF-BUILD, LOOK FIRST; `logic.test.ts` checks key phrases in the line AND the same facts in `resume/resume.typ`; names <= 14 chars);
  the recruiter's lines never mention Ayush. Zero-JS twin: `/resume` (and the noscript list on `/`). Add a move = another résumé-backed entry whose power keeps the sum = HP.
- **Tall-grass effects** (generic, any decor slot declaring `field`; logic `src/world/grass.ts`, Pixi `src/world/grassView.ts`, two hooks in `render.ts`):
  - Rustle: when the player or the follower ENTERS a grass tile (its `Actor.settled` tile changes to one, so it starts as the step begins; a room change never
    rustles), that tile plays frames 1-3 of `field.rustle` (`frameMs` 100 = 300 ms) then rests. Drawn by one hidden-at-rest sprite per tile in the room's bg,
    covering the tile plus `head` (4) px above it for the leaf pixels.
  - Legs hidden: one `field.tips` sprite per tile in the y-sorted sprite layer at zIndex `(y + 1) * TILE + 0.02` (above an actor on that tile, player tie-break
    included; below anyone on the tile beneath), shown only on the tiles an actor's feet are in (`tipsTiles`: both tiles while walking sideways, the lower tile
    while walking vertically). At rest its pixels ARE the patch's (rows 8-15 of each tile, top 3 rows cut to the blade silhouette), so it only shows over legs;
    while the tile rustles it follows the rustle frame. At night the spriteLayer's filter darkens it exactly like the patch under it (see "Night tint"); it has no tint of its own.
  - Art: the raw pack has NO rustle / field-effect frames, so `grass_fx()` in `scripts/slice-sprites.py` derives `decor/grass-rustle.png` (frames 1-3 per tile:
    blades part and lean out, spring back with 3 leaf pixels, overshoot in; gaps filled with the tile's darkest green) and `decor/grass-tips.png` (frames 0-3)
    from the sliced patch. Requires the decor art to cover its footprint exactly. No step sfx (none in the pack).
  - Reduced motion: no rustle; the tips stay. `?debug`: `__game.grass` = `{ rustling: [{ x, y, frame }], tips: [{ x, y }] }` (read-only).
- Tests: `src/world/encounter.test.ts` (rule, Game hold, three-room goTo, wipe, spiral, shiny roll), `overlays/battle/logic.test.ts` (incl. the bag count and spent PP),
  `src/world/grass.test.ts` (which tiles rustle, frame timing, tips tiles, sort order, night tint), `e2e/yard.spec.ts` (door both ways,
  the sign, a full win, spent PP + RUN, a second résumé use refused, walking into grass: rustle then tips).

## Shiny follower
- `src/world/shiny.ts`: `rollShiny(search, rng)`: 1 in `SHINY_ODDS` (64) per PAGE LOAD (refreshing is the hunt); `?shiny=1` forces, `?shiny=0` prevents, `?debug`
  turns the roll off unless `?shiny=1`. `isShiny()` memoises the roll; `api.ts` re-exports it and `World.tsx` passes it to `createWorld` (`__game.shiny` under `?debug`).
- Art: `sprite.follower-shiny` = `scripts/objects/shiny.py` palette-swaps `oshawott.png` (paler, greener blues). The world loads that sheet instead of `sprite.follower`;
  the battle scene and the title screen read the same slot (`isShiny()`).
- Cue: a burst of 7 sparkles around the follower on load and on every room entry (`shinyBurst` in render.ts; static alpha under reduced motion); `.world-box[data-shiny]`
  = `yes` -> `burst` -> `done`. The first follower talk of a shiny load is `follower.json` `lines.shiny` with `emote.exclaim` (then the usual rules).
- Tests: the roll in `encounter.test.ts`; `e2e/shiny.spec.ts`.

## The DS lid (tab hidden)
- `src/ui/Lid.tsx` wraps the top screen (`.lid` > `.top-screen` + `.lid-shell`). On `visibilitychange` to hidden the lid gets `data-closed`: CSS folds it around the
  hinge (`transform-origin` bottom, `rotateX(-180deg)`, `perspective` on `.screens`) so it lands face-down over the bottom screen and shows its shell with a blinking
  sleep LED; a cut under reduced motion. Back to visible: it opens and Oshawott yawns (`showEmote('follower', 'emote.ellipsis')`).
- Freeze: `lidLogic.ts` (`lidTransition`, unit-tested) freezes the world on close ONLY if nothing else holds the freeze (an open overlay, the title) and releases only
  a freeze the lid placed. The Pokédex / battle portals live inside `.top-screen`, so they fold with it. `blur` is deliberately NOT a trigger (clicking into the
  Spotify embed blurs the window).
- Tests: `src/ui/lidLogic.test.ts`; `e2e/lid.spec.ts` (overrides `document.visibilityState` and dispatches the event).

## Town Map (`overlays/townmap/`)
Shows places Ayush has been on a pixel-art world map (256×192 equirectangular PNG at
`public/assets/townmap/world.png`, generated by `scripts/draw-world-map.py`). The MAP takes over the
TOP screen (DOM portal into `.top-screen`, same as the Pokédex), the world dims and stays frozen.

- **Data**: `src/content/places.json` + `src/content/places.ts` (`PLACES`, `PLACES_DATA`, `REGIONS`).
  Shape: `{ sample: bool, regions?: [...], places: [...] }`. `sample: true` shows a "Sample" tag.
  Never invent places or cities. `photo` is an asset slot key (e.g. `"photo.japan"`); omit when absent.
- **Hierarchy**: `regions` lists group definitions (`id, name, bbox, map`). A place may carry `region: "<id>"`.
  Grouped places collapse to a single "stacked pin" (two offset squares) at their centroid. At world level,
  `buildWorldEntries(PLACES, REGIONS)` in `nav.ts` returns the collapsed list. A place may also carry
  `bbox`, `map` (asset slot key), and `cities: [...]` for a deeper zoom level. City level is fully implemented;
  adding `bbox`, `map`, `cities` data to a place plus the PNG + asset slots is all that is needed.
  Current region: `mediterranean` (France, Spain, Portugal, Italy, Morocco, Tunisia, Greece).
- **Bottom-screen fit** (budget at 1x, 375x812): the box is 100u. World level: pager row, name row (+ "· N photos" on a place with photos), detail row. Region level: breadcrumb (4u top padding + 16u) + list (58u = 3 whole 16u rows + 10u spare) + entry line (16u + 4u air below) = 98u, so it shows 3 rows, never a clipped 4th, and the entry line stays clear of the inner frame line (clean interior is 92u: 3u frame inset each side). There are NO "N places" counters (top label is "TOWN MAP", region name row is the bare name). `e2e/objects/townmap.spec.ts` checks every child box sits inside the overlay at world, region and a country with photos, at both viewports.
- **Navigation**: world → region (A on region stub, or A on world-level place with cities) → city (A on place with cities in region) → B up each level → B at world closes.
  Top screen always shows the world map; at sub-levels a yellow bbox frame is drawn around the region, and
  the selected world pin stays highlighted. Bottom screen at sub-levels: breadcrumb + inset map (64×48) + ScrollList.
  A = "Zoom" when entry is zoomable, "Next" otherwise. B = "Up" below world, "Close" at world.
  World-map pin tap uses `toWorld` action — works from any sub-level without a component-side back.
- **Projection**: `src/ui/overlay/overlays/townmap/projection.ts`. `project(lon,lat)` → world-map pixel.
  `projectRegion(lon,lat,rawBbox)` → inset-map pixel (auto-pads bbox to 4:3 via `padBbox()`).
  `projectBbox(lon,lat,lonW,latS,lonE,latN)` → pixel in any pre-padded bbox. Unit tests in `townmap.test.ts`.
- **Maps**: generated by `scripts/draw-world-map.py` (world, 256×192) and `scripts/draw-region-map.py`
  (regions/countries, any size). Both use the 1:50m Natural Earth land GeoJSON (NOT committed; keep it outside the repo).
  Currently: `public/assets/townmap/world.png`, `mediterranean.png` (256×192), `mediterranean-inset.png` (64×48).
  Asset slots: `townmap.world`, `townmap.mediterranean`, `townmap.mediterranean-inset` in `assets.json`.
- **Nav state**: `nav.ts` exports a pure reducer (`navReducer`), `buildWorldEntries`, `initWorld`, and `{ type: 'toWorld', idx }`.
  The reducer is self-contained: `back` pops a parent stack stored in state (no sentinel states, no component patching).
  Unit tests cover world → region → place-with-cities → B → B → B (full entries at each step), and `toWorld` from city level.
- **Asset-slot content test**: `townmap.test.ts` verifies that every region's `map` slot and its `-inset` slot exist in
  `assets.json`, and likewise for every place that carries a `map`.
- **Old subway map**: the station/line overlay (`route.ts`, `font.ts`, `townmap.json`) has been removed.
  Do not re-add walk-to-object actions from the town map.

### Add a region
1. Add a `Region` object to `regions` in `places.json` (`id, name, bbox: [lonW, latS, lonE, latN], map: "townmap.<id>"`).
2. Tag each place with `region: "<id>"`.
3. Render the region PNG: `python3 -I scripts/draw-region-map.py <ne_50m_land.geojson> <id> <lonW> <latS> <lonE> <latN>` (full 256×192).
4. Render the inset PNG: `python3 -I scripts/draw-region-map.py <ne_50m_land.geojson> <id>-inset <lonW> <latS> <lonE> <latN> 64 48`.
5. Add `townmap.<id>` and `townmap.<id>-inset` slots at the END of `assets.json`.

### Add cities to a place (real data from Ayush required)
1. Add `bbox: [lonW, latS, lonE, latN]`, `map: "townmap.<place-id>"`, and `cities: [{ id, name, line, lat, lon }]` to the place in `places.json`.
2. Render PNG for the place bbox (same as region steps 3–5 above, using the place id, e.g. `townmap.japan`).
3. Add `townmap.<place-id>` and `townmap.<place-id>-inset` slots at the END of `assets.json`.
4. The city level is fully implemented; adding the data above is sufficient.

## Add / build an object (touch only these, `<id>` = the object id)
1. `src/content/objects/<id>.ts`: default-export an `ObjectAction` (third-person narrator `lines`,
   optional `sfx`, `next: { overlay: '<overlay id>' }`, `after`). Collected by glob; the file name is the id.
2. Optional overlay: `src/ui/overlay/overlays/<id>/index.tsx` (default export; the folder name is the
   overlay id; keep all its helpers/CSS-in-JS inside that folder). Auto-registered by glob.
3. Art: edit ONLY the value of your own slot `object.<id>` in `src/assets/assets.json` (swap
   `placeholder: true` for `path`/`w`/`h`; the slot already exists, do not add or reorder keys). Art that comes from
   the raw pack: `scripts/slice-sprites.py`; hand-drawn: `scripts/draw-objects.py`. New `sfx.*` slots are the one
   unavoidable shared-file edit in `assets.json`; add them at the END of the file in one commit.
4. Extra e2e assertions: `e2e/objects/<id>.spec.ts` (helpers in `e2e/helpers.ts`). The open -> B loop for
   every object in the table already runs from `e2e/smoke.spec.ts`: no edit needed.
5. Only to ADD a brand-new object beyond a room's 7 (needs a design decision, spec says <= 7 per room): a row in that room's furniture in
   `src/world/grid.ts` + slot in `assets.json`. `content.test.ts` checks wiring, overlap and reachability.

## Piano (overlay `overlays/piano/`)
Playable pixel keys (C4-B5) + "Ayush's piece": a MIDI at slot `music.piece` parsed with `@tonejs/midi` (`score.ts` -> note events, `synth.ts` = pulse / triangle / noise on Web Audio).
Sound stays behind the speaker toggle (`audioContext()` in `audio.ts` is null while muted; the keys still light). Text slots in `src/content/piano.json` (`videoUrl`, `nowPracticing`, `pieceCredit`: replaces the nowPracticing line while the piece plays (the box has no spare height), its `url` is optional and renders the "Arrangement" link only when set).
Swap the piece: export `.mid`, put it in `public/assets/music/`, point `music.piece` at it, drop `placeholder`. Placeholder is generated by `node scripts/make-piece.mjs`.

## Animated objects (one generic capability, render.ts)
- Slot in `assets.json`: `frames` (> 1) = horizontal strip, each frame `w` wide, frame 0 = resting pose. Optional `frameMs` = ambient
  forward loop (monitor ticker). No `frameMs` = still until an action plays it.
- Object action: `anim: { ms }` plays the slot's frames (ping-pong, ~500ms/rep) for `ms` BEFORE the dialogue (gym reps); the world is
  frozen meanwhile. `before: 'rest'` fades first. Both are skipped / static under `prefers-reduced-motion`.
- Scripted pose (generic): an object slot may carry `pose` (`path`, `frames`, `w`/`h` = same cell as the object art, `foot` = object-space px where the
  player's feet land). While `anim` plays, the WORLD walks the player onto `foot`, hides the player sprite, draws the pose overlay (its frames follow the
  object's frames), then gets up and walks back (follower waits). The UI just awaits `playObjectAnim`. Gym: `scripts/objects/gym_pose.py` derives
  `ethan-bench.png` from the Ethan sheet. `anim.ms` is the reps only; walking adds ~1s. Skipped under reduced motion.
- Never add per-object animation code; declare `frames`/`frameMs`/`pose` and `anim`.

## Emote bubbles (generic capability, render.ts)
- Slots in `assets.json` with `"kind": "emote"`, `"w": 15, "h": 16, "frames": 2` (a 30×16 horizontal strip: frame 0 = first pose, frame 1 = alternate pose). Sliced from `characters/emotions.png` by `emotes()` in `scripts/slice-sprites.py`; output in `public/assets/emotes/`. Source sheet is 140×130 px with 4px orange margins; cells are 15×16 px with 1–3px orange gaps between them.
- Current slots: `emote.exclaim` (`!`), `emote.note` (`♪`), `emote.ellipsis` (`…`), `emote.heart`, `emote.question`.
- `showEmote(actor, slot, ms)` on `WorldHandle`: displays the bubble above the given actor (`'player'` or `'follower'`) for `ms` milliseconds. Loads the texture lazily (cached by PixiJS `Assets`). Pop-in animation: scale + alpha 0→1 over 150 ms with quadratic ease-out; frame 0→1 on pop completion. Static (frame 1, no animation) under `prefers-reduced-motion`. Emote sprite lives on `app.stage` (above the room, below overlays). A new `showEmote` call replaces any in-flight emote.
- `getEmoteAsset(slot)` in `src/assets/useAsset.ts` returns `{ kind: 'emote', path, w, h, frames }` or `null` if the slot doesn't exist / isn't an emote kind.
- Emote position: horizontally centred on the actor's tile, anchored at bottom-centre, placed 2 px above the sprite top (32 px tall sprite, feet at tile bottom).
- Object emotes: `emote?: string` on `ObjectAction` (an `emote.*` slot); when that object is used, `App.tsx` calls `showEmote('follower', emote, 900)` (pc exclaim, piano note, townmap ellipsis, fridge heart, monitor question). `content.test.ts` checks the slot.

## Tests
- CI (`.github/workflows/ci.yml`) runs `npm test`, `npm run build` and the full e2e suite on every PR and push to master. Locally, run only the specs a change touches.
- `npm test` (vitest): logic (BFS, movement, follower, Fx, wiring, room layout + decor rules). `npm run build` runs `astro check`.
- `npm run test:e2e` (Playwright, chromium, 375x812 and 1440x900, own build+static-server on :4399).
  The webServer is `scripts/e2e-server.mjs`: it runs `astro build` (skip with `E2E_SKIP_BUILD=1`) then serves
  `dist/` in-process in the foreground — this avoids the "process exited early" failure that `astro preview`
  (which daemonizes) caused. Set `E2E_PORT` locally if :4399 is taken by another worktree.
  The smoke test loops over `ALL_FURNITURE`, every room (open -> B: overlay appears, B closes it, same tile AND room, focus restored), so new objects are covered automatically.
  Tests use `/?debug`, which exposes `window.__game` (read player tile; `goTo(id)`; `walkTo(x, y)`; `isInEncounter`; `shiny`; `tourState`; `grass`).
- Never test "before the world exists" by firing events right after `goto` (they land before or after hydration, depending on machine speed). Hold the lazy
  `render` chunk with `page.route`, wait for hydration, then act (`holdWorld` in `smoke.spec.ts`). Taps in that window go through `bus.runOrDefer`.
- Don't kill the dev server on :4321 if one is running; use other ports.

## Town Map — places (visited countries and cities)

- `src/content/places.json`: the approved list of visited countries and cities that appear on the Town Map. Schema:
  `{ places: [{ id, name, cities: [{ id, name, lat, lon, line, photos? }] }] }`.
  `id` is a kebab-case slug. `lat`/`lon` rounded to 2 decimals. `line` is the short label shown on the Town Map (e.g. "City of Light"). `photos` is an optional list of `place.photo.*` asset slot names.
- Photo asset slots: `place.photo.<city-id>-<n>` in `assets.json`, appended at the END. Photos live in `public/assets/places/`. All EXIF/GPS must be stripped before commit (enforced by the pipeline).
- **Offline pipeline: `scripts/takeout/`** — turns Google Maps Timeline + Photos Takeout into approved `places.json` data without uploading anything. Full docs: [`scripts/takeout/README.md`](scripts/takeout/README.md).
  - Primary path (seconds): `python3 scripts/takeout/trips.py --timeline <Timeline.json> --out <review_dir>` → open `review.html` → approve → `apply.py <approve.json>`.
  - Photos path: `python3 scripts/takeout/pick.py <approve.json>` (uses Google Photos Picker API; see README for one-time Cloud setup).
  - Incremental scan: `python3 scripts/takeout/scan.py <archive.zip> --out <dir> --state <dir>/state.json` (zip-by-zip, no extraction of media).
  - `review_dir` must be OUTSIDE the repo (enforced); raw Takeout data and the review artefacts are never committed.
  - `apply.py --photos-dir` writes the photo board's data, not `places.json`: `public/assets/photos/<place>-<n>.jpg`, a row `{id, place, where, slot}` in `src/content/photos.json` and a `photo.<place>-<n>` slot appended to `assets.json` (idempotent; places.json gets places/cities only).
  - Tests: `python3 -m pytest scripts/takeout/tests/test_takeout.py` (offline, fixture data in `scripts/takeout/fixtures/`).

## Idle attract tour
- `src/world/tour.ts`: `Tour` class + `tourShouldRun` / `tourWaitMs` / `bindTourCancelListeners` helpers. Instantiated once in `createWorld` (render.ts) and updated each ticker frame alongside the game. Exposes nothing through `api.ts`.
- Sequence (bedroom only, once per session): wait 8 s → walk to `pc` (pause 1.2 s) → `piano` (pause) → `townmap` (pause) → return to the bedroom start tile. Uses `game.walkToObject(id)` (walk adjacent, no interact) and `game.walkTo(x,y)` (plain path). Never opens overlays.
- At each pause: `showEmote(follower, emote.*, PAUSE_MS)` shows a bubble above the follower (`emote.exclaim` at PC, `emote.note` at piano, `emote.ellipsis` at townmap). The tour also emits `{ type: 'tour', line }` via `WorldEvent`; `BottomScreen` subscribes via `onEvent` and temporarily replaces the `idle-loc` text with the third-person narrator line. Emits `{ type: 'tour', line: null }` on cancel/done/return to clear it.
- Guards: `prefers-reduced-motion` (checked live each tick), `?open=...` (deep link), `?debug` without `?tour=1` (value must be exactly `'1'`), sessionStorage flag (`idle-tour-done`), world warping, not in the bedroom. Freeze during the wait phase resets the timer (does not cancel); freeze while active (walking/pausing/returning) cancels the tour.
- Cancellation: any `keydown`, `pointerdown`, `touchstart`, or `wheel` on `window` (capture phase) calls `tour.cancel()`, which calls `game.dropPath()` (clears the queued path; the in-flight step still finishes). The sessionStorage flag is written when walking starts AND when cancelled/done, so a reload never replays. The window listeners unbind themselves immediately on cancel or done (no listener leak).
- `Game` additions: `walkToObject(id)` (same as `goTo` but `interact: false`), `dropPath()` (clear path/arrive/after), `isIdle` getter.
- `WorldHandle.getTourState()` returns `'off'` when no tour was created, else the Tour's state. Under `?debug`, `window.__game.tourState` exposes this live.
- Narrator lines: `TourStop.line` — third-person present, one sentence, no facts beyond what the overlays show. Current: PC "Ayush checks on his projects.", piano "Ayush hums his piece.", townmap "Ayush looks at where he's been."
- Tests: `src/world/tour.test.ts` (sequencing, cancellation, pause timing, guards, emote scheduling, narrator lines emitted/cleared). E2E: `e2e/tour.spec.ts` (`/?debug&tour=1`; idle line at PC stop, cancel restores room name, bag-slot cancel, `tourState === 'off'` on plain `/?debug`).

## Reactive decor (the plants: "Oshawott used Water Gun!")
Decor that reacts to A / a tap WITHOUT being an object: no `id`, no bag slot, no overlay, does not count toward the 7-per-room cap. Generic; the plants are the first use.
- Declare: a `DECOR` row carries `react: '<reaction id>'` (several pieces may share one id; the four `decor.plant` rows all say `react: 'plant'`). The piece must be `solid` and off the wall rows (`content.test.ts` "reactive decor").
- Content: `src/content/reactions/<id>.ts` default-exports a `DecorReaction` (`lines`, optional `again` = lines shown once that piece has already reacted this session, `emote: { actor, slot, ms }`, `anim: { ms, burst? }`, `sfx?`, `drop?`), collected by glob in `src/content/reactions.ts` (`DECOR_REACTIONS`) exactly like `objects/`. Narrator voice; no facts about Ayush; glyph-guarded.
- World: `Grid.reactAt(x, y)` / `grid.reactives`; `Game.interact()` checks it after the follower and after furniture (an object always wins) and emits `{ type: 'react', id, key }`; `key` = `decorKey(d)` = `"x,y"` (room-local instance key). `walkTo` on a reactive tile paths adjacent, faces it and interacts (tap parity), via `findPathAdjacent` in `path.ts`.
- Renderer: reactive pieces get the shared adjacency/hover sparkle (their anchor is keyed by `decorKey`), and every decor anim slot is keyed by `decorKey` too. `playReaction(key, { ms, burst })` (api.ts) plays the piece's `frames` as a one-shot ping-pong and, if `burst` (a `#rrggbb` string) is set, a procedural shower of 2x2 px drops in that colour onto the art for `ms`. Both skipped under `prefers-reduced-motion`. `container.dataset.anim = key` while it plays.
- UI (`App.tsx` Wiring): on `react`, pick `lines` or `again` (`reacted` set in memory + sessionStorage, keyed `room:key`), `showEmote`, `freeze()` + `playReaction`, then the `dialogue` overlay (which owns freeze/resume from there). The world aria-label ends with "and 2 plants" (`reactives(room)` in api.ts).
- **Drop tables** (a reaction may drop an item): `drop?: { chance, lead, emote, items: [{ slot, lines, weight?, emote?, draft? }] }` on the `DecorReaction` (types in `src/content/reactions.ts`). Generic: the world, renderer and `api.ts` never name plants, berries or medals; any reaction can declare one. Each reaction rolls `rollDrop(table, rnd, force)` (pure; `rnd` is injected, Math.random in `App.tsx`): the first `rnd()` `< chance` decides a drop (plants: `1 / 3`), the second picks an item by `weight` (default 1; any piece can drop any item). No drop = the normal `lines` / `again`. A drop replaces them with `lead` + the item's `lines` (about 3 dialogue lines).
  - Item art = `item.*` asset slots (`kind: object`, even `w`/`h`, PNGs in `public/assets/items/`). Nothing in the raw pack fits (no berry / medal / plush art), so ALL six are drawn by `scripts/draw-items.py` (ASCII maps + palette; edit and re-run): Oran / Pecha / Cheri berries, medal, Labubu, Jellycat-style bunny. New item = a map in that script, an `item.<id>` slot at the END of `assets.json`, a row in the table (`dropId` = the slot minus `item.`).
  - Presentation: `playReaction(key, { ms, burst, drop: { slot } })` shakes the piece, then the item pops out (arc + one small settle, `drop.ts`, ~620 ms) and comes to rest hovering just above the piece's art (never where the player or Oshawott stand, so it reads at 1x). It stays up while the world is frozen (the dialogue) and fades out when the world resumes; `container.dataset.drop` = the slot meanwhile. Oshawott's `drop.emote` (item `emote` overrides the slot) shows as it lands. Reduced motion: no shake or arc, the item is just placed (static) and removed on resume. No inventory, counters or totals.
  - Debug override: `/?debug&drop=<item id>` always drops that item, `/?debug&drop=none` never drops (any other value rolls normally). Ignored without `?debug` (`dropOverride`). The plants e2e specs load with `&drop=none` so the 1-in-3 roll never makes them flaky.
  - DRAFT lines: every item line that speaks for Ayush (medal, Labubu, Jellycat) carries `draft: true` in `src/content/reactions/plant.ts` (with a TODO at the top); `content.test.ts` fails if a line mentioning Ayush lacks it. Ayush fills in the specifics there, then drops the flag. Never invent events, years, placings or plush names.
- Tests: `content.test.ts` (ids wired both ways, solid + off-wall, unique keys, a reachable walkable neighbour from the start tile and every arrival tile, emote/sfx/burst validity, glyphs), `src/world/react.test.ts` (interact / walkTo / frozen / unreachable), `src/content/drop.test.ts` (`rollDrop` with injected randomness, the override), `src/world/drop.test.ts` (arc maths), `e2e/objects/plants.spec.ts` (keyboard A, tap via `__game.walkTo`, again-line, downstairs, B restores the tile; forced drop of every item, forced no-drop, reduced motion).
- Add a reactive piece: `react: '<id>'` on its decor row + `src/content/reactions/<id>.ts`. Its slot needs `frames > 1` for the shake (frame 0 = rest); the burst needs no art.

## Follower talk (Oshawott)
- When the player faces the follower's tile and presses A (or taps the follower's sprite on canvas), the follower turns toward the player, an emote bubble pops above it, and a one-line third-person dialogue opens in the bottom screen.
- `Game.interact()` checks the follower tile before furniture. `Game.interactFollower()` is also called directly from the canvas tap handler; if the player is not adjacent, it is a no-op and the tap is ignored (never falls through to `walkTo` onto the follower tile).
- Line and emote selection (in `App.tsx`, `pickFollowerLine`): (1) night → sleepy line + `emote.ellipsis`; (2) downstairs → kitchen line + `emote.heart`; (3) otherwise → rotate through `followerContent.lines.rotate` + `emote.note`. Rotate index is session-local (`followerRotateIdx`, increments per open).
- Content lives in `src/content/follower.json`: `{ lines: { night, downstairs, rotate: [...] } }`. Every line must start with `"Oshawott "` (enforced by `content.test.ts` glyph guard). 3–6 rotate entries. No invented facts about Ayush.
- `api.ts` exports `showEmote(actor, slot, ms)` (delegates to `bus.fx.showEmote`; also listed in the Boundary). The bus `Fx` type includes `showEmote`. `interactFollower` is NOT in `api.ts` — only `Game` and `render.ts` call it internally.
- The follower has no sparkle cue, no bag slot, no standing-spot rules, and no furniture table row — it is a separate interaction target.
- Tests: `src/world/follower.test.ts` (facing detection, line schema, frozen/busy/non-adjacent guards). `src/content/content.test.ts` pixel-font glyph guard: smoke-checks all follower lines against the font glyph set AND asserts each line matches `/^Oshawott /`. E2E: `e2e/objects/follower.spec.ts` (A-key; `interactFollower()` tap; B closes + world resumes; non-adjacent tap does nothing). Debug: `window.__game.follower` exposes `{ x, y, facing, moving }` in `?debug` mode.

## Commands
- `npm run dev -- --host` dev server (LAN-visible). `npm run build`, `npm test`, `npm run test:e2e`.
- `python scripts/pokedex-assets.py` copies the Pokédex Black/White GIFs (+ a still frame each) into `public/assets/dex/`.
- `python scripts/slice-sprites.py` regenerate sprites/objects/sfx from the raw pack; `python scripts/draw-objects.py` draws art with no raw source (piano); `python scripts/draw-items.py` draws the plant drop items; `python scripts/build-font.py` builds the HGSS font.
- Deep links: `/?open=projects/<slug>` (player at the PC, that Pokédex entry open on the top screen) and `/?open=card` (Trainer Card over the room, player stays at the start tile; `/about` is its plain page). The URL follows the open entry
  (`history.replaceState`) and is cleaned to `/` when back on the grid/list or closed. `/projects/<slug>` is plain HTML (zero JS).
- More deep links (`OPEN_OVERLAYS` in `src/ui/deeplink.ts`): `?open=townmap|piano|journal|monitor|radio|phone|photos|food` (`photos` = the corkboard overlay, `food` = the fridge). Rule: they open the overlay OVER THE ROOM at the start tile, like `card` (the player is NOT walked to the object; only `projects/<slug>` places the player at the PC). `Wiring` in `App.tsx` does it generically and keeps the URL in step with whichever mapped overlay is open (`setOpenParam`, cleaned to `/` on close); no overlay folder is touched. Unknown values load normally. Any `?open=` suppresses the title screen. `e2e/deeplinks.spec.ts`.
- Real clock: with no `?night` / `?day`, `World.tsx` starts at night when `nightByHour(new Date().getHours())` (`src/world/clock.ts`, `hour >= 20 || hour < 6`, the HGSS window). Under `?debug` with no override it stays DAY (e2e must not depend on the runner's clock). The bed still toggles day/night until reload. The title screen's intro does not follow the hour yet. Backlog: the title intro should follow the same `nightByHour` rule (follow-up; `TitleScreen.tsx` was out of lane).
- `node scripts/og-image.mjs [baseUrl]` regenerates `public/og.png` (1200x630) from a running site.
- E2E port: `E2E_PORT=4405 npm run test:e2e` (default 4399).

## Radio (Start menu -> Radio)
Overlay `src/ui/overlay/overlays/radio/` (no room object; opened from the Start menu).
- `src/content/radio.json`: top-level `sample: boolean` + `stations[]`. Each station: `id`, `kind` (`'list'|'playlist'|'object'`), `name`, `desc`, and kind-specific fields:
  - `list` → `tracks[]: { title, artist, note?, spotifyUrl }`. A opens a ScrollList; A on a track opens Spotify in a new tab.
  - `playlist` → `spotifyPlaylistUrl`. A shows a static STATION CARD on the TOP screen via `createPortal` into `.top-screen` (same pattern as Pokédex; world dims via `dim(on)`): station name, the gold `.radio-fm-frame` border (reused, not new pixel art), lines left-aligned at a whole 16u inset (never centred: odd text widths land on half pixels), "A: load player" and a real "Open in Spotify" link (`radio-fm-open`) built from the validated ID only. The Spotify iframe is mounted only on the SECOND A (`fmLoaded`; no third-party frame loads until asked); A again opens Spotify in a new tab; B returns to the dial (and unloads). If the URL is `"placeholder"`, a "Playlist coming" frame is shown instead (no card, no iframe).
  - `object` → `objectId` (supported in code and tests but no station uses it today; the Piano redirect was removed). A closes the overlay and calls `goTo(objectId)` (cross-room safe).
- `sample: true` → every content string (name, desc, track title/artist/note) must be prefixed `"Sample:"` (test enforced). Exception: `kind='object'` stations may use real names.
- Layout (bottom screen, phone budget ~96 native px): h2 "RADIO" (20px) + dial row (18px) + station name (18px) + desc (18px) = 74px total.
- Tuning dial: CSS pixel-art dark track with station marker lines and a sliding gold needle; ◀ is ▶ flipped with `scaleX(-1)` (◀ not in the HGSS font); ▶ uses U+25B6.
- URL validation: `playlistId(url)` in `stations.ts` accepts only `https://open.spotify.com/playlist/<22-char id>` — anything else (http, other host, javascript:, extra segments, ../tricks) returns null and the FM frame shows "Playlist coming" instead of an iframe. Track URLs go through `trackUrl()` (same host rules, `/track/` or `/album/` path). The embed `src` and "Open in Spotify" href are built only from the validated ID, never from the raw input.
- Add a station: append an entry to `radio.json` (no code changes needed for new `list`/`playlist`/`object` stations); `content.test.ts` validates shape, URLs, and the sample guard.

## Résumé
- Source of truth: `resume/resume.typ` (Typst; edit guide and gotchas in `resume/README.md`). Shared fields (name, title, email, linkedin, github) live in `src/content/resume.json`, which Typst reads via `json()` and the site reads for the Trainer Card role, the idle-box line and the SEO description. Never copy them elsewhere.
- Outputs: `/resume.pdf` and `/resume` (minimal zero-JS page: download link plus an embedded `<object>` of the PDF). The PDF is never committed: it comes from one place, the prerendered Astro endpoint `src/pages/resume.pdf.ts`, which compiles the Typst with the pinned npm devDependency `@myriaddreamin/typst-ts-node-compiler` (native binary per platform, installed by `npm ci`; no Typst CLI on PATH, so hosted builds work). `astro build` emits `dist/resume.pdf`; `astro dev` compiles it on each request, so it works in dev too. There is no separate post-build step.
- Facts only; the employer may be named, clients and codenames may not (`resume.test.ts` guards this). No phone number.
- Update: edit `resume.typ` (and `resume.json` for shared fields), run `npm test` and `npm run build`, open `dist/resume.pdf` (or `/resume.pdf` under `astro dev`).
- Trainer Card employer/since: `role.employer` and `role.since` in `src/content/trainer-card.json` are literal values (client bundle must stay fs-free). `trainer-card.test.ts` guards them: it calls `rolesFromTypst` / `earliestNonInternYear` from `about.ts` on the live `resume.typ` and asserts they match. When experience changes, update `trainer-card.json` and run `npm test`.
