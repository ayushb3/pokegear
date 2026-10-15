/** Pokédex CSS (kept in this folder, like the other overlays). Everything is in native pixels x --u (CSS px per native
 *  pixel, an integer scale) so the pixel font and sprites stay crisp. Top-screen layer = `.dx`; bottom = `.dex-ctl`. */
const u = (n: number) => `calc(var(--u) * ${n})`;

export const CSS = `
.dx {
  position: absolute;
  inset: 0;
  z-index: 4;
  box-sizing: border-box;
  overflow: hidden;
  font-size: ${u(16)};
  line-height: 1;
  font-kerning: none;
  text-rendering: optimizeSpeed;
  -webkit-font-smoothing: none;
  color: #22222c;
  --lh: ${u(18)};
  --row: ${u(22)};
  background: conic-gradient(#c23c34 25%, #b8352e 0 50%, #c23c34 0 75%, #b8352e 0) 0 0 / ${u(8)} ${u(8)};
}
.dx .dx-no { color: #7a1f1a; }
.dx-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: ${u(20)};
  padding: 0 ${u(6)};
  background: #6e1a16;
  color: #f4efd8;
  border-bottom: ${u(1)} solid #22222c;
}
.dx-head .dx-no { color: #f0b9a8; }
.dx-sub { color: #f0b9a8; }

/* ---- Rotom intro ---- */
.dx-intro { background: transparent; pointer-events: none; }
.dx-rotom-wrap {
  position: absolute;
  left: 50%;
  top: ${u(110)};
  width: 0;
  height: 0;
}
.dx-rotom-pop {
  position: absolute;
  /* integer offsets from the wrap's centre: half the sprite (--rw / --rh, native px set by Intro), no % on pixel art */
  left: calc(var(--u) * var(--rw) * -1);
  top: calc(var(--u) * var(--rh) * -1);
}
.dx-rotom-pop > picture, .dx-rotom-pop img { display: block; }
.dx-rotom-pop[data-pop] {
  animation: dx-pop 520ms steps(8, end) both;
}
.dx-intro[data-phase='say'] .dx-rotom-pop {
  animation: dx-hover 1.6s steps(4, end) infinite alternate;
}
@keyframes dx-pop {
  0% { transform: translate(calc(var(--u) * var(--dx)), calc(var(--u) * var(--dy))) scale(0.2); opacity: 0; }
  35% { opacity: 1; }
  100% { transform: translate(0, 0) scale(1); opacity: 1; }
}
@keyframes dx-hover {
  from { transform: translate(0, 0); }
  to { transform: translate(0, ${u(-3)}); }
}
.dx-bzzt {
  position: absolute;
  left: ${u(40)};
  top: ${u(-84)};
  padding: ${u(2)} ${u(5)};
  background: #f8d030;
  color: #22222c;
  border: ${u(1)} solid #22222c;
  white-space: nowrap;
  opacity: 0;
  transform: rotate(-4deg);
}
.dx-intro[data-phase='pop'] .dx-bzzt { animation: dx-zap 520ms steps(6, end) both; }
@keyframes dx-zap {
  0% { opacity: 0; }
  30%, 80% { opacity: 1; }
  100% { opacity: 0; }
}

/* ---- PC box grid: an OverlayFrame (placement 'top') filling the top screen ----
 * Budget (native px): 192 tall - 1 outline x2 - 4 padding x2 = 182 = bar 18 | box 144 | 2 | foot 18.
 *   box = 2 padding + 2 rows of 68 + 4 gap + 2 padding = 144;  256 wide - 1 x2 - 6 x2 = 242 = 2 + 117 + 4 + 117 + 2.
 * Slots are 117 x 68 (115 x 66 inside their 1px border), so the tallest sprite (Meowth, 65) fits at 1x (fit box 114 x 66).
 * The box keeps the PC-box red checker "wallpaper" behind the slots. e2e/objects/pc.spec.ts checks the fit at 375x812. */
.dx.dx-grid { background: var(--frame-fill); }
.dx-box {
  flex: none;
  display: grid;
  grid-template-columns: repeat(2, ${u(117)});
  grid-template-rows: repeat(2, ${u(68)});
  gap: ${u(4)};
  padding: ${u(2)};
  background: conic-gradient(#c23c34 25%, #b8352e 0 50%, #c23c34 0 75%, #b8352e 0) 0 0 / ${u(8)} ${u(8)};
}
.dx-slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  background: #dcd6b8;
  border: ${u(1)} solid #b9b295;
  border-radius: ${u(3)};
  cursor: pointer;
}
.dx-slot.sel {
  background: #cfe3f7;
  border-color: #22222c;
  box-shadow: inset 0 0 0 ${u(1)} #fff, 0 0 0 ${u(1)} #d9473f;
  z-index: 1;
}
.dx-empty { cursor: default; background: #e6e0c6; border-style: dashed; }
.dx-slot .dx-ball { position: absolute; right: ${u(3)}; top: ${u(3)}; }
.dx-foot {
  flex: none;
  height: ${u(18)};
  margin-top: ${u(2)};
  display: flex;
  align-items: center;
  padding: 0 ${u(2)};
  gap: ${u(6)};
  white-space: nowrap;
  text-shadow: ${u(1)} ${u(1)} 0 #a5a5ad;
}

/* ---- dex list ---- */
.dx-list { display: flex; flex-direction: column; }
.dx-list-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: ${u(5)};
  margin: ${u(5)};
}
.dx-list-rows {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: ${u(3)} ${u(4)};
  background: #f4efd8;
  border: ${u(1)} solid #22222c;
  box-shadow: inset 0 0 0 ${u(1)} #b9b295;
}
.dx-list .sl-row.sel { background: #cfe3f7; }
.dx-row { display: inline-flex; align-items: center; gap: ${u(5)}; width: calc(100% - ${u(8)}); }
.dx-rowname { flex: 1; }
.dx-preview {
  flex: none;
  width: ${u(108)};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${u(4)};
  background: #f4efd8;
  border: ${u(1)} solid #22222c;
  box-shadow: inset 0 0 0 ${u(1)} #b9b295;
}
.dx-preview-art {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(#cfe3f7 25%, #bcd6ee 0 50%, #cfe3f7 0 75%, #bcd6ee 0) 0 0 / ${u(8)} ${u(8)};
  border: ${u(1)} solid #22222c;
}
.dx-preview-name { margin-top: ${u(3)}; line-height: ${u(18)}; }
.dx-preview-cat { color: #52525a; line-height: ${u(16)}; text-align: center; font-size: 1em; }

/* ---- entry page ---- */
.dx-art {
  position: absolute;
  left: ${u(5)};
  top: ${u(5)};
  width: ${u(100)};
  height: ${u(98)};
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(#cfe3f7 25%, #bcd6ee 0 50%, #cfe3f7 0 75%, #bcd6ee 0) 0 0 / ${u(8)} ${u(8)};
  border: ${u(1)} solid #22222c;
  box-shadow: inset 0 0 0 ${u(1)} #fff;
}
.dx-sprite { image-rendering: pixelated; image-rendering: crisp-edges; image-rendering: pixelated; display: block; max-width: none; }
.dx-info {
  position: absolute;
  left: ${u(109)};
  right: ${u(5)};
  top: ${u(5)};
  height: ${u(98)};
  display: flex;
  flex-direction: column;
  gap: ${u(1)};
  padding: ${u(2)} ${u(4)};
  box-sizing: border-box;
  background: #f4efd8;
  border: ${u(1)} solid #22222c;
  box-shadow: inset 0 0 0 ${u(1)} #b9b295;
}
.dx-nameline, .dx-cat, .dx-stats > div { height: ${u(17)}; line-height: ${u(17)}; white-space: nowrap; }
.dx-cat { height: ${u(16)}; line-height: ${u(16)}; }
.dx-cat { color: #52525a; }
.dx-types { display: flex; flex-wrap: wrap; gap: ${u(3)}; align-items: center; height: ${u(19)}; }
.dx-chip {
  display: inline-block;
  height: ${u(16)};
  line-height: ${u(16)};
  padding: 0 ${u(4)};
  color: #fff;
  border: ${u(1)} solid rgba(0, 0, 0, 0.55);
  border-radius: ${u(4)};
  text-shadow: ${u(1)} ${u(1)} 0 rgba(0, 0, 0, 0.45);
  white-space: nowrap;
}
.dx-stats { margin: 0; flex: none; }
.dx-stats > div { display: flex; gap: ${u(4)}; }
.dx-stats dt { color: #2f6fa8; }
.dx-stats dd { margin: 0; }
.dx-flavour {
  position: absolute;
  left: ${u(5)};
  right: ${u(5)};
  top: ${u(106)};
  height: ${u(38)};
  margin: 0;
  padding: ${u(1)} ${u(5)};
  box-sizing: border-box;
  line-height: ${u(18)};
  white-space: nowrap;
  background: #f4efd8;
  border: ${u(1)} solid #22222c;
  box-shadow: inset 0 0 0 ${u(1)} #b9b295;
}
.dx-ribbon {
  position: absolute;
  left: ${u(5)};
  right: ${u(5)};
  top: ${u(147)};
  height: ${u(40)};
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: ${u(6)};
  padding: ${u(1)} ${u(6)};
  line-height: ${u(16)};
  color: #f4efd8;
  background: #3b2f63;
  border: ${u(1)} solid #22222c;
  box-shadow: inset 0 0 0 ${u(1)} #6a5aa8;
}
.dx-ribbon .dx-icon { flex: none; }
.dx-ribbon span { text-wrap: balance; }
.dx-ribbon-lock { background: #52525a; box-shadow: inset 0 0 0 ${u(1)} #8a8a94; }

/* ---- text pages + links ---- */
.dx-page { display: flex; flex-direction: column; }
.dx-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin: ${u(5)};
  padding: ${u(4)} ${u(6)};
  background: #f4efd8;
  border: ${u(1)} solid #22222c;
  box-shadow: inset 0 0 0 ${u(1)} #b9b295;
  line-height: var(--lh);
}
.dx-body .tp-label { color: #2f6fa8; }
.dx-links { gap: ${u(6)}; justify-content: center; }
.dx-link-row { display: flex; gap: ${u(6)}; }
.dx-link-row > .dx-btn { flex: 1 1 0; min-width: 0; }
.dx-btn > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dx-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: max(44px, ${u(26)});
  box-sizing: border-box;
  padding: 0 ${u(8)};
  color: #fff;
  text-decoration: none;
  background: #d9473f;
  border: ${u(2)} solid #22222c;
  border-radius: ${u(4)};
  box-shadow: 0 ${u(2)} 0 #22222c;
}
.dx-btn:hover { background: #e2574f; }
.dx-btn:active { transform: translateY(${u(1)}); box-shadow: 0 ${u(1)} 0 #22222c; }
.dx-btn:focus-visible { outline: 3px solid #1c4fb0; outline-offset: 2px; }
.dx-note { margin: 0; color: #52525a; line-height: var(--lh); }
.dx-icon { display: inline-block; flex: none; image-rendering: pixelated; }

/* ---- bottom screen: controls ---- */
.dex-ctl {
  padding: ${u(4)} ${u(6)};
  gap: ${u(2)};
  justify-content: space-between;
  user-select: none;
}
.dex-ctl-name { flex: 1; min-width: 0; line-height: ${u(18)}; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: clip; }
.dex-entry-sw { display: flex; align-items: center; gap: ${u(4)}; }
.dex-sw {
  flex: none;
  width: ${u(70)};
  height: max(36px, ${u(24)});
  font: inherit;
  color: #22222c;
  background: #f8d030;
  border: ${u(2)} solid #22222c;
  border-radius: ${u(5)};
  box-shadow: 0 ${u(2)} 0 #22222c;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${u(4)};
  white-space: nowrap;
}
.dex-sw:active { transform: translateY(${u(1)}); box-shadow: 0 ${u(1)} 0 #22222c; }
.dex-sw:focus-visible { outline: 3px solid #1c4fb0; outline-offset: 2px; }
.dex-ctl .dex-no { color: #7a1f1a; }
.dex-ctl-row { flex: 1; min-height: 0; display: flex; align-items: center; gap: ${u(6)}; }
/* .dex-nav is the HIT AREA (>= 44 css px, transparent); the drawn frame is .dex-nav-face in --u multiples. */
.dex-nav {
  flex: none;
  width: max(44px, ${u(36)});
  height: max(44px, ${u(30)});
  padding: 0;
  font: inherit;
  font-size: ${u(16)};
  color: #fff;
  background: none;
  border: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dex-nav-face {
  width: ${u(36)};
  height: ${u(30)};
  box-sizing: border-box;
  background: #3f6fd9;
  border: ${u(2)} solid #22222c;
  border-radius: ${u(5)};
  box-shadow: 0 ${u(2)} 0 #22222c;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dex-nav:active .dex-nav-face { transform: translateY(${u(1)}); box-shadow: 0 ${u(1)} 0 #22222c; }
.dex-nav:focus-visible { outline: 3px solid #1c4fb0; outline-offset: 2px; }
.dex-flip { display: inline-block; transform: scaleX(-1); }
.dex-pager { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: ${u(2)}; text-align: center; }
.dex-page-title { line-height: ${u(16)}; }
.dex-page-no { line-height: ${u(14)}; color: #52525a; }
.dex-dots { display: flex; gap: ${u(4)}; }
.dex-dot { width: ${u(8)}; height: ${u(8)}; box-sizing: border-box; background: #dcd6b8; border: ${u(1)} solid #22222c; }
.dex-dot.on { background: #d9473f; }
.dex-info { line-height: ${u(18)}; text-align: left; overflow-wrap: anywhere; }
.dex-say { position: relative; flex: 1; cursor: pointer; line-height: var(--lh); }
.dex-say .more { position: absolute; right: 0; bottom: 0; opacity: 0; }
.dex-say .more.on { opacity: 1; animation: blink 0.8s steps(2) infinite; }
.dex-who { color: #d9473f; }

@media (prefers-reduced-motion: reduce) {
  .dx-rotom-pop[data-pop], .dx-intro[data-phase='say'] .dx-rotom-pop, .dx-intro[data-phase='pop'] .dx-bzzt { animation: none; }
  .dx-intro .dx-bzzt { opacity: 1; }
  .dex-say .more.on { animation: none; }
}
`;
