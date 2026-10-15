/** Battle CSS, kept in this folder. Native px x --u throughout. Top-screen scene = `.bt`; bottom controls = `.battle`. */
const u = (n: number) => `calc(var(--u) * ${n})`;

export const CSS = `
/* ---- top screen: the battle scene (256 x 192 native) ---- */
.bt {
  position: absolute;
  inset: 0;
  z-index: 4;
  overflow: hidden;
  font-size: ${u(16)};
  line-height: 1;
  font-kerning: none;
  text-rendering: optimizeSpeed;
  -webkit-font-smoothing: none;
  color: #22222c;
  /* sky bands, then the lawn */
  background: linear-gradient(#78c0f8 0 ${u(56)}, #a8dcf8 0 ${u(104)}, #58a848 0 ${u(176)}, #3c8434 0);
}
.bt-platform {
  position: absolute;
  width: ${u(96)};
  height: ${u(24)};
  image-rendering: pixelated;
  background-size: 100% 100%;
}
.bt-platform-enemy { left: ${u(148)}; top: ${u(96)}; }
.bt-platform-player { left: ${u(8)}; top: ${u(150)}; }
.bt-enemy {
  position: absolute;
  left: ${u(168)};
  top: ${u(28)};
  width: ${u(64)};
  height: ${u(80)};
  image-rendering: pixelated;
  background-size: 100% 100%;
}
.bt-enemy[data-hit] { animation: bt-flinch 360ms steps(6) both; }
.bt-player {
  position: absolute;
  left: ${u(24)};
  top: ${u(104)};
  width: ${u(64)};
  height: ${u(64)};
  image-rendering: pixelated;
  background-repeat: no-repeat;
  /* the follower sheet (64 x 128 native) at 2x: the "up" row (row 2), standing frame (col 0) */
  background-size: ${u(128)} ${u(256)};
  background-position: 0 ${u(-128)};
}
.bt-player[data-hit] { animation: bt-flinch 360ms steps(6) both; }
.bt-enemy[data-lunge] { animation: bt-lunge-left 300ms steps(4) both; }
.bt-player[data-lunge] { animation: bt-lunge-right 300ms steps(4) both; }
@keyframes bt-flinch { 0%, 40%, 80% { opacity: 1; } 20%, 60% { opacity: 0; } 100% { opacity: 1; } }
@keyframes bt-lunge-right { 0% { transform: none; } 50% { transform: translateX(${u(8)}); } 100% { transform: none; } }
@keyframes bt-lunge-left { 0% { transform: none; } 50% { transform: translateX(${u(-8)}); } 100% { transform: none; } }
.bt-won .bt-enemy { animation: bt-bob 1.2s steps(2) infinite; }
@keyframes bt-bob { 50% { transform: translateY(${u(-2)}); } }
/* HGSS HP boxes: cream, dark rounded border */
.bt-box {
  position: absolute;
  box-sizing: border-box;
  width: ${u(120)};
  padding: ${u(2)} ${u(6)};
  background: #fff6dc;
  border: ${u(2)} solid #2a2a36;
  border-radius: ${u(4)};
  box-shadow: inset 0 0 0 ${u(1)} #fffdf2, ${u(2)} ${u(2)} 0 rgba(0, 0, 0, 0.25);
  text-shadow: ${u(1)} ${u(1)} 0 #c8c0a8;
}
.bt-box-enemy { left: ${u(8)}; top: ${u(12)}; }
.bt-box-player { right: ${u(8)}; top: ${u(132)}; }
.bt-name { display: flex; justify-content: space-between; white-space: nowrap; line-height: ${u(16)}; }
.bt-lv { color: #6a5a30; }
.bt-hp-row { display: flex; align-items: center; gap: ${u(4)}; height: ${u(16)}; }
.bt-hp-label { color: #d8a020; text-shadow: ${u(1)} ${u(1)} 0 #6a5a30; }
.bt-bar {
  flex: 1;
  height: ${u(6)};
  box-sizing: border-box;
  border: ${u(1)} solid #2a2a36;
  background: #5a5a66;
}
.bt-bar-fill { height: 100%; background: #48d050; transition: width 500ms steps(10, end); }
.bt-bar-fill[data-level='mid'] { background: #f0c020; }
.bt-bar-fill[data-level='low'] { background: #e04030; }
.bt-hp-num { text-align: right; line-height: ${u(16)}; }
.bt-won .bt-box-enemy { display: none; }
@media (prefers-reduced-motion: reduce) {
  .bt-enemy, .bt-player, .bt-won .bt-enemy { animation: none; }
  .bt-bar-fill { transition: none; }
}

/* ---- bottom screen: the controls ----
 * Budget at --u = 1px: the overlay box content is ~90 px tall (see fridge/index.tsx).
 *   text screens: TextPages (whole lines, pages as needed)
 *   menu / moves: 2 x 2 grid of 22 px rows (44 px) + one 18 px info line = 62 px
 *   bag / links: ScrollList
 */
.battle { padding: ${u(4)} ${u(6)}; }
.battle .bt-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: var(--row);
  flex: none;
}
.battle .bt-cell {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  line-height: var(--row);
}
.battle .bt-cell.sel { background: #cfe3f7; }
.battle .bt-cell[data-spent], .battle .bt-item[data-spent] { color: #8a8a96; }
.battle .bt-info { display: flex; justify-content: space-between; white-space: nowrap; margin-top: ${u(2)}; color: #3a3a46; }
.battle .bt-wait { flex: 1; }
`;
