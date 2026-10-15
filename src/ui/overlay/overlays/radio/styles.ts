/**
 * Radio overlay CSS.
 *
 * Phone budget (--u = 1px, bottom box ~96 native px of content):
 *   h2 title:           18px + 2px margin = 20px
 *   dial row:           18px (SVG + track)
 *   station name:       18px
 *   station desc:       18px
 *   Total radio panel:  74px  ✓ well under 96px limit
 *
 * List sub-view: h2 + ScrollList fills the remaining space.
 *
 * FM top-screen portal (256x192 native):
 *   .radio-fm-frame explicit height = 192 - 2*4 border - 20 attribution row = 164px
 *   Attribution row (20px) is always reserved below the frame, never overlaps it.
 */
const u = (n: number) => `calc(var(--u) * ${n})`;

export const RADIO_CSS = `
/* ── main panel ── */
.radio-panel {
  display: flex;
  flex-direction: column;
  gap: ${u(2)};
  flex: 1;
  min-height: 0;
}

/* ── tuning dial ── */
.radio-dial-row {
  display: flex;
  align-items: center;
  gap: ${u(4)};
  height: ${u(18)};
  flex: none;
}
.radio-dial-btn {
  flex: none;
  width: ${u(16)};
  height: ${u(16)};
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  line-height: 1;
}
.radio-dial-btn:focus-visible {
  outline: 2px solid #1c4fb0;
  outline-offset: 1px;
}
/* Flip ▶ (U+25B6) horizontally to stand in for ◀ (U+25C0, not in font) */
.radio-dial-btn-left span {
  display: inline-block;
  transform: scaleX(-1);
}
.radio-dial-track {
  flex: 1;
  min-width: 0;
  height: ${u(10)};
  position: relative;
  /* HGSS-style dark channel */
  background: #4a3c28;
  border: ${u(1)} solid #22222c;
  box-shadow: inset 0 ${u(1)} 0 #2a2018;
}
.radio-dial-marker {
  position: absolute;
  top: ${u(1)};
  bottom: ${u(1)};
  width: ${u(2)};
  background: #9a8a6a;
}
/* active station needle */
.radio-dial-needle {
  position: absolute;
  top: ${u(-2)};
  bottom: ${u(-2)};
  width: ${u(2)};
  background: #f0b030;
  box-shadow: 0 0 0 ${u(1)} #22222c;
  transform: translateX(-50%);
  transition: left 0.12s steps(4);
}

/* ── station info ── */
.radio-station-name {
  flex: none;
  height: ${u(18)};
  line-height: ${u(18)};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: ${u(16)};
}
.radio-station-desc {
  flex: none;
  height: ${u(18)};
  line-height: ${u(18)};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: ${u(16)};
  color: #6a5a44;
}

/* ── list sub-view ── */
.radio-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* ── Ayush FM top-screen layer ── */
/* Layout: full screen (256×192), flex column, frame then attribution row.
   Frame height = 192 - 2*(4px border) - 20px attr row = 164px native. */
.radio-fm {
  position: absolute;
  inset: 0;
  z-index: 4;
  box-sizing: border-box;
  padding: ${u(4)};
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #1a1a2e;
  font-size: ${u(16)};
  font-kerning: none;
  text-rendering: optimizeSpeed;
  -webkit-font-smoothing: none;
  color: #e9e4cf;
  --lh: ${u(18)};
}
/* pixel border around the embed.
   Frame height: 192 - 2*(4px padding) - 20px attr = 164px native */
.radio-fm-frame {
  box-sizing: border-box;
  width: 100%;
  flex: 1;               /* takes all space above the attribution row */
  min-height: 0;
  border: ${u(2)} solid #f0b030;
  box-shadow:
    inset 0 0 0 ${u(1)} #22222c,
    0 0 0 ${u(1)} #22222c;
  overflow: hidden;
  background: #000;
}
.radio-fm-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: ${u(18)};
}
/* Static station card (before A): centred name, sub line, hint. */
.radio-fm-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  align-items: flex-start;
  justify-content: center;
  gap: ${u(6)};
  padding-left: ${u(16)};
  text-align: left;
  background: #22223a;
}
.radio-fm-card-name { font-size: ${u(32)}; line-height: ${u(34)}; color: #f0b030; }
.radio-fm-card-sub { line-height: ${u(18)}; }
.radio-fm-card-hint { line-height: ${u(18)}; color: #8d8da0; }
/* Attribution row: always 20px tall, never overlaps the frame */
.radio-fm-attr {
  flex: none;
  height: ${u(20)};
  line-height: ${u(20)};
  text-align: center;
  width: 100%;
  font-size: ${u(16)};
  color: #8d8da0;
}
.radio-fm-attr a {
  color: #a0b0e0;
}
`;
