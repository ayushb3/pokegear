/**
 * Height budget (design principle 1: design at --u = 1px, 375x812, phone).
 *   .bottom-screen interior = 176u; .pad = 72u; gap 4u -> .overlay = 100u
 *   .overlay border 1u x2 + padding 4u x2 -> content 90u tall x ~226u wide
 *
 *   BOARD:  title bar (OverlayFrame)  18u   TICKER ... [SIM] 10:00
 *           3 symbol rows            54u   (3 x 18u: ticker, price, change %, 12u sparkline)
 *           copy line                18u   "Simulated prices. Not real quotes."
 *           ----------------------------
 *           total                    90u   (== the content box; nothing spare, nothing clipped)
 *   CHART (bottom screen): bar 18u + the selected row 18u + copy (<= 2 lines, 36u) = 72u <= 90u
 *   CHART (top screen, 256x192): border 1u x2 + padding 4u x2 = 10u -> 182u:
 *           bar 18u + high / low line 18u + candles 124u + last line 18u = 178u
 *
 * Font size is only ever 16u (the pixel font is built on a 16px em). Every box, rect and offset is a whole number of
 * native units. At --u = 2 or more the bottom box only gets taller.
 */
const u = (n: number) => `calc(var(--u) * ${n})`;

export const MONITOR_CSS = `
.overlay.mon{contain:inline-size;min-width:0}

/* ── title bar extras: SIM tag + clock ── */
.mon-aside{display:flex;align-items:center;gap:${u(4)};flex:none}
.mon-tag{box-sizing:border-box;height:${u(14)};line-height:${u(12)};padding:0 ${u(3)};background:#f3dd86;color:#22222c;border:${u(1)} solid #22222c;text-shadow:none}
.mon-clock{min-width:${u(40)};text-align:right}

/* ── a symbol row (board, and the selected line in the chart view) ── */
.mon-rows{display:flex;flex-direction:column;flex:none}
.mon-row{display:flex;align-items:center;width:100%;height:${u(18)};line-height:${u(18)};padding:0;margin:0;font:inherit;color:inherit;background:none;border:0;text-align:left;cursor:pointer;white-space:nowrap;flex:none}
.mon-row.sel{background:#cfe3f7}
.mon-cur{flex:none;width:${u(10)}}
.mon-sym{flex:none;width:${u(40)}}
.mon-px{flex:none;width:${u(56)}}
.mon-pct{flex:none;width:${u(48)}}
.mon-up{color:#2f7d4a}
.mon-down{color:#c0392b}
.mon-spark{flex:none;display:block;width:${u(40)};height:${u(12)};margin-left:auto;margin-right:${u(2)}}
.mon-spark rect{shape-rendering:crispEdges}
.mon-copy{flex:none;display:block;line-height:${u(18)};color:#555}

/* ── top screen candle chart ── */
.mon-top{display:flex;flex-direction:column;font-size:${u(16)};line-height:${u(18)}}
.mon-top .mon-line{flex:none;height:${u(18)};line-height:${u(18)};white-space:nowrap;display:flex;justify-content:space-between}
.mon-chart{display:block;flex:none;width:${u(234)};height:${u(124)};margin:0 auto}
.mon-chart rect{shape-rendering:crispEdges}
`;
