---
name: Object
about: Add an interactable object to the room
title: "Object: <name>"
labels: object
---

## Content
<!-- What does the visitor read / see? Third-person narrator lines, any overlay copy. -->

## The moment
<!-- The one-sentence feeling of interacting with it. Small delight, never a gate. -->

## Asset slots
<!-- assets.json slots: object.<id>, sfx.*, sprites. Art ready, or placeholder: true? -->

## Overlay (id / reuse)
<!-- Registry id of an existing overlay to reuse, or a new `src/ui/overlay/overlays/<id>/index.tsx` (auto-registered). -->

## Acceptance tests
- [ ] Open -> B closes it; player on the same tile, facing the same way
- [ ] Keyboard focus is restored to the game area
- [ ] Open -> B loop (runs automatically from the object table); extras in `e2e/objects/<id>.spec.ts`
- [ ] Works at 375x812 and 1440x900
- [ ] `npm run build`, `npm test`, `npm run test:e2e` pass

## Out of scope
