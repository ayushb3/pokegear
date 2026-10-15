# Portfolio agent loop: shared brief

Read by every implementing agent before it starts. The loop: backlog item, implement (Sonnet, isolated worktree), verify (npm test, build, e2e, headless screenshots at 375x812 and 1440x900), fresh-context review, at most 3 fix rounds, PR, Ayush merges. Lessons at the bottom are appended when the loop hits a mistake worth remembering.

Repo: GitHub ayushb3/pokegear (public; never commit personal data, secrets, or raw photos). Pokemon HGSS-style portfolio. Read CLAUDE.md in your worktree fully before coding.

## Your workflow
1. You are already running in your own isolated git worktree (your cwd), branched from master. Do NOT create other worktrees and do NOT write outside your cwd (writes elsewhere are blocked or collide with other agents). First: `git fetch -q origin && git switch -c <branch> origin/master` (start from latest master), then `npm ci`.
2. Implement + add tests. Keep the diff focused on your item.
3. Run `npm test` and `npm run build` in your worktree; both must pass. Do not run Playwright unless your brief says so.
4. Commit early and often (sessions can end abruptly). Every commit message ends with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push with `-u origin <branch>`. Do NOT open a PR, do NOT merge.
5. Start a dev server for visual review: `npm run dev -- --port <port>` in your worktree (it daemonizes and returns; confirm it listens with lsof).
6. Return a compact summary: what changed (files), test/build result, commit SHAs, port, anything rough, and any LESSON worth recording (a mistake future agents in this repo should avoid).

## Design principles (from the design director; follow them)
1. Phone-first, 1x-first: design every overlay at --u = 1px, 375x812. Bottom box content is about 96 native px tall (~5 lines of 16px font). If it fits at 1x it fits everywhere. Budget heights explicitly in a comment.
2. Everything pages or scrolls; nothing clips. Text longer than one line goes through TextPages; lists through ScrollList. overflow:hidden is a bug report. Single-line labels: text-overflow: ellipsis + title.
3. Integer pixels only: font sizes 16/32px, offsets calc(var(--u) * n), art dimensions even, no fractional centring, never scale art by a non-integer.
4. One header treatment: the HGSS cream box with a red title bar; no bespoke chrome per overlay.
5. A = forward, B = back, one level at a time; at most two levels per overlay; A never re-triggers the object; A/B labels say what they do.
6. Facts or marked placeholders, never filler. Placeholder text is prefixed "Sample:" and flagged in a draft/placeholder/sample key a test can assert on. Never invent facts about Ayush; no client names, codenames, colleague names; no course/education material beyond the degree.
7. The room teaches by cue, not by text (sparkle, glow, labels); never a tutorial modal.
8. Game is the reward, not the gate: every piece of content has a zero-JS plain-page twin.

## Lessons (mistakes already made here)
- Phones render at scale 1 (--u = 1px), not 2. Two overlays shipped with content clipped below the box because the budget assumed 120u. Measure against ~96u.
- Scaling art by 0.5/0.64 destroyed it. 2x-upscaled sources (e.g. ripped overworld sheets) must be halved losslessly on even offsets; native sources are never scaled. Player sprite cells are 32px native.
- astro dev / astro preview daemonize and return immediately; stop with `npx astro dev stop` in the same worktree. A stale Vite dep cache causes "_jsxDEV is not a function": `rm -rf node_modules/.vite` and restart.
- Stacked PRs strand if the parent merges first: base on master.
- Agents can only write inside their own session/worktree. An agent told to create ../portfolio-wt/<name> instead wrote into the parent session's checkout and collided with others. Use the worktree you were started in.
- Running vitest / astro build in a worktree while its astro dev server is up corrupts the Vite dep cache ("_jsxDEV is not a function"). After tests/build, restart the dev server with a clean node_modules/.vite before visual review.
- Pixel font is built on a 16px em: only font-size calc(var(--u)*16) (or 32) is crisp. Never shrink text to 12u/14u to fit; remove a row or page instead.
- Node 24: e2e specs (and any module they import) need `with { type: 'json' }` on JSON imports, or Playwright can't even collect the spec. Vite and vitest accept the attribute.
- A card or list that "should fit" often doesn't: overlays inherit `line-height: var(--lh)` (18px), and absolutely-positioned measure probes inflate scrollHeight unless their wrapper is `height:0; overflow:hidden`. Verify fit with an e2e scrollHeight check at 375x812, not arithmetic.
- Facts from résumé dates: "since <year>" must use the earliest full-time role, not an internship, and must not attach the year to a title the person didn't hold then.
- The in-app browser pane can throttle animation frames and stall loads; for visual review use headless Playwright screenshots (375x812 and 1440x900) instead.
- One Playwright suite at a time on this machine (`pgrep -f "playwright test"` before running).
- Measure the current layout (boundingBox with every animation frozen) before trusting a brief's "current" numbers; one brief had the title's name and sprite rows swapped.
- A button focused by script on load matches `:focus-visible` in Chromium, so an "sr-only focus ring" is seen by every visitor on load, not only keyboard users. Focus the dialog (`tabIndex=-1`, `outline: none`) instead and let the first Tab reach the button: the ring then only ever follows a keypress.
- Timers and CSS animations keep running in a background tab (a link opened in a new tab). An intro or auto-dismiss that starts at mount plays unseen; gate the timers on `document.visibilityState` and re-key the animated subtree when the tab is first looked at. In e2e, override `visibilityState` from `page.addInitScript` and dispatch `visibilitychange` by hand (as `lid.spec.ts` does).
- A frame drawn with `border` on a fixed-height box needs `box-sizing: border-box`, or it is 2u wider and 4u taller than the screen it mimics (`.title-bottom` shipped that way once). Measure the overlay's box against the real screen's box in e2e.
- Exact animation frames / assertions: `el.getAnimations()`, `pause()`, set `currentTime = t` (counts from when the animation started, i.e. mount, delay included), read `getComputedStyle`; never time screenshots or sleep.
- The full e2e suite runs in GitHub Actions on every PR (`.github/workflows/ci.yml`). Locally run only the specs your change touches (plus `smoke.spec.ts`), once; never the whole suite or `--repeat-each` loops: parallel agents running full suites peg the machine.
- A cloud box can have a Playwright browser build that does not match the pinned `@playwright/test` ("Executable doesn't exist at .../chromium_headless_shell-NNNN"). Do not run `playwright install`: write a local config next to `playwright.config.ts` that spreads it and sets `launchOptions.executablePath` to the installed `chrome` under `/opt/pw-browsers`, keep it out of git (`.git/info/exclude`), and run `playwright test -c` that file.
- `goTo` across more than one room needs the room graph (`Game.nextHop`): a warp lookup by `to === target` alone silently fails from two rooms away, and the smoke test (which starts every object from the bedroom) is what catches it.
