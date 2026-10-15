# Design Principles

Eight principles every overlay, page, and component in this portfolio must follow.

1. **Phone-first, 1x-first**: design every overlay at `--u = 1px`, 375x812. Bottom box content is about 96 native px tall (~5 lines of 16px font). If it fits at 1x it fits everywhere. Budget heights explicitly in a comment.
2. **Everything pages or scrolls; nothing clips.** Text longer than one line goes through `TextPages`; lists through `ScrollList`. `overflow:hidden` is a bug report. Single-line labels: `text-overflow: ellipsis` + `title`.
3. **Integer pixels only**: font sizes 16/32px, offsets `calc(var(--u) * n)`, art dimensions even, no fractional centring, never scale art by a non-integer.
4. **One header treatment**: the HGSS cream box with a red title bar; no bespoke chrome per overlay.
5. **A = forward, B = back**, one level at a time; at most two levels per overlay; A never re-triggers the object; A/B labels say what they do.
6. **Facts or marked placeholders, never filler.** Placeholder text is prefixed "Sample:" and flagged in a `draft`/`placeholder`/`sample` key a test can assert on. Never invent facts about Ayush; no client names, codenames, colleague names; no course/education material beyond the degree.
7. **The room teaches by cue, not by text** (sparkle, glow, labels); never a tutorial modal.
8. **Game is the reward, not the gate**: every piece of content has a zero-JS plain-page twin.
