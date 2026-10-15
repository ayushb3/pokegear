/**
 * Height budget (design principle 1: design at --u = 1px, 375x812, phone).
 *   .bottom-screen interior = 192 - 4 (border) - 12 (padding) = 176u; .pad = 72u; gap 4u  ->  .overlay = 100u
 *   .overlay border 1u x2 + padding 4u x2 (the base .overlay padding, same as the dialogue box) -> content 90u x 226u
 *
 *   header          16u  (one text line: month + "Sample data" tag)
 *   gap              2u  (room for the selected-day outline, which grows 2u outside its column)
 *   chart           27u  (HALF_U 13: zero line at 13u; bars <= 6u; marks 6u; see index.tsx)
 *   gap              2u  (outline again)
 *   stat tiles      26u  (2 text lines at a tight 14u / 10u leading + 1u borders)
 *   gap              1u
 *   readout         16u  (one text line, ellipsis + title)
 *   ---------------------
 *   total           90u  (== the content box; nothing spare, nothing clipped)
 *
 * At --u = 2px or more the box only gets taller (124u at 2x), so it fits everywhere. The e2e spec asserts that
 * every descendant sits inside the box and scrollHeight <= clientHeight at both viewports.
 * Chart columns are an even integer width with a 2u gap (even width: the 6u mark centres on whole pixels), and the
 * chart is offset by whole units, so the selected-day outline (2u) stays inside the 4u+ side padding.
 */
export const MONITOR_CSS = `
/* ── container ─────────────────────────────────────────────────── */
.overlay.mon{contain:inline-size;min-width:0}

/* ── header ─────────────────────────────────────────────────────── */
.mon header{display:flex;justify-content:space-between;align-items:center;gap:calc(var(--u)*3);white-space:nowrap;height:calc(var(--u)*16);flex-shrink:0;margin-bottom:calc(var(--u)*2)}
.mon .tag{border:calc(var(--u)) solid #22222c;background:#f3dd86;padding:0 calc(var(--u)*2);line-height:calc(var(--u)*14);height:calc(var(--u)*14);box-sizing:content-box;flex-shrink:0}

/* ── bar chart ───────────────────────────────────────────────────── */
/* Fixed height = 2*HALF_U+1 = 27u (HALF_U=13); zero line is a full-width child at y=HALF_U. Width and left offset are set inline (whole units). */
.mon .chart{
  flex-shrink:0;
  height:calc(var(--u)*27);
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
  top:calc(var(--u)*13);
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
  height:calc(var(--u)*27);
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
