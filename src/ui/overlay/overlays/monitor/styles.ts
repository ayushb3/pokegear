/**
 * Height budget (design principle 1: design at --u = 1px, 375x812, phone).
 *   .bottom-screen interior = 176u; .pad = 72u; gap 4u -> .overlay = 100u
 *   .overlay border 1u x2 + padding 4u x2 -> content 90u tall x ~226u wide
 *
 * Both pages share the title bar (OverlayFrame, 18u): the page tabs (Market | Journal) are its heading, so switching pages
 * costs no height.
 *
 *   MARKET board:  title bar  18u   [Market] Journal ... [SIM] 10:00
 *           3 symbol rows            54u   (3 x 18u: ticker, price, change %, 12u sparkline)
 *           copy line                18u   "Simulated prices. Not real quotes."
 *           ----------------------------
 *           total                    90u   (== the content box; nothing spare, nothing clipped)
 *   MARKET chart (bottom screen): bar 18u + the selected row 18u + copy (<= 2 lines, 36u) = 72u <= 90u
 *   MARKET chart (top screen, 256x192): border 1u x2 + padding 4u x2 = 10u -> 182u:
 *           bar 18u + high / low line 18u + candles 124u + last line 18u = 178u
 *
 *   JOURNAL chart:  title bar  18u  Market [Journal] ... Oct 2026 [Sample data]
 *           gap              2u  (room for the selected-day outline above the chart)
 *           chart           25u  (HALF_U 12: zero line at 12u; bars <= 5u; marks 6u; see journal.tsx)
 *           gap              2u  (room for the selected-day outline, which grows 2u outside its column)
 *           stat tiles      26u  (2 text lines at a tight 14u / 10u leading + 1u borders)
 *           gap              1u
 *           readout         16u  (one text line, ellipsis + title)
 *           ---------------------
 *           total           90u
 *   JOURNAL day: title bar 18u + TextPages 72u (whole lines, pages on).
 *
 * Font size is only ever 16u (the pixel font is built on a 16px em). Every box, rect and offset is a whole number of
 * native units. At --u = 2 or more the bottom box only gets taller. Journal chart columns are an even integer width with a
 * 2u gap, offset by whole units, so the selected-day outline (2u) stays inside the 4u+ side padding.
 */
const u = (n: number) => `calc(var(--u) * ${n})`;

export const MONITOR_CSS = `
.overlay.mon{contain:inline-size;min-width:0}

/* ── title bar: page tabs (the heading) + extras (SIM tag + clock / month + sample tag) ── */
.mon-tabs{display:flex;align-items:center;gap:${u(2)};flex:none}
.mon-tab{box-sizing:border-box;height:${u(14)};line-height:${u(12)};padding:0 ${u(3)};margin:0;font:inherit;color:inherit;text-shadow:inherit;background:none;border:${u(1)} solid transparent;cursor:pointer;white-space:nowrap}
.mon-tab.sel{background:var(--frame-fill);color:var(--frame-line);border-color:var(--frame-bar-line);text-shadow:none}
.mon-tab:focus-visible{outline:${u(2)} solid #3a7bd5;outline-offset:${u(1)}}
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

/* ── JOURNAL page ── */
/* ── bar chart ───────────────────────────────────────────────────── */
/* Fixed height = 2*HALF_U+1 = 25u (HALF_U=12); zero line is a full-width child at y=HALF_U. Width and left offset are set inline (whole units). */
.mon .chart{
  flex-shrink:0;
  margin-top:calc(var(--u)*2);
  height:calc(var(--u)*25);
  position:relative;
  display:flex;
  flex-direction:row;
  align-items:stretch;
  gap:calc(var(--u)*2);
  margin-bottom:calc(var(--u)*2);
}

/* full-width zero line behind all bars */
.mon .chart-zero{
  position:absolute;
  left:0;right:0;
  top:calc(var(--u)*12);
  height:calc(var(--u)*1);
  background:#22222c;
  pointer-events:none;
  z-index:0;
}

/* one column per weekday: fixed height, relative for absolute children */
.mon .bar-col{
  flex:none;
  min-width:0;
  position:relative;
  height:calc(var(--u)*25);
  cursor:pointer;
}

.mon .bar-abs{position:absolute;left:0;right:0}
.mon .bar-g{background:#58b873}
.mon .bar-r{background:#e0524a}
.mon .bar-f{background:#b4b4bc}

/* flat: 2u stub; top set inline from HALF_U */
.mon .bar-flat-stub{position:absolute;left:0;right:0;height:calc(var(--u)*2)}

/* no-trade: hollow 6u box with a 2u outline; top set inline (HALF_U-3) */
.mon .bar-none{position:absolute;left:0;right:0;height:calc(var(--u)*6);border:calc(var(--u)*2) solid #82828c;background:none;box-sizing:border-box}

/* cross glyph: absolutely positioned just beyond the bar tip */
.mon .bar-cross-pos{position:absolute;left:0;right:0;display:flex;justify-content:center}
.mon .bar-cross-pos .glyph{margin:0}

/* selection outline */
.mon .bar-col.sel{outline:calc(var(--u)*2) solid #22222c;outline-offset:0;z-index:2}

/* ── stat tiles row ──────────────────────────────────────────────── */
.mon .stat-row{
  display:flex;
  flex-direction:row;
  gap:calc(var(--u)*2);
  flex-shrink:0;
  height:calc(var(--u)*26);
  margin-bottom:calc(var(--u)*1);
}
.mon .stat-tile{
  flex:1;
  min-width:0;
  border:calc(var(--u)) solid #22222c;
  box-sizing:border-box;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:calc(var(--u)*1) 0;
}
.mon .stat-val{line-height:calc(var(--u)*14);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mon .stat-lbl{line-height:calc(var(--u)*10);color:#555;white-space:nowrap}
.mon .stat-g{color:#2f7d4a}
.mon .stat-r{color:#c0392b}

/* ── footer readout ─────────────────────────────────────────────── */
.mon .foot{
  display:block;
  width:100%;
  text-align:left;
  font:inherit;
  color:inherit;
  background:none;
  border:0;
  padding:0 calc(var(--u)*2);
  cursor:pointer;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  height:calc(var(--u)*16);
  line-height:calc(var(--u)*16);
  flex-shrink:0;
}
.mon .foot.sel{background:#cfe3f7}

/* ── glyphs ──────────────────────────────────────────────────────── */
.mon .glyph{display:inline-block;vertical-align:middle;margin:0 calc(var(--u)*1)}
.mon .glyph.tick{color:#2f7d4a}
.mon .glyph.cross,.mon .glyph.mark{color:#c0392b}
`;
