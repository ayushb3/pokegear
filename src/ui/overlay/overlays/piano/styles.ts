/**
 * All CSS for the piano overlay (1 native pixel = var(--u), set by .bottom-screen). Keys are drawn at integer native sizes.
 *
 * Height budget at --u=1px (375x812, scale 1, the tightest viewport):
 *   .bottom-screen interior 176u; .pad 72u; gap 4u  ->  .overlay = 100u
 *   .overlay border 1u x2 + the base padding 4u x2 (the dialogue box's padding, NOT overridden) -> content 90u x 226u
 *
 *   .row   piece button + sound toggle   18u  (button = 1u border + one 16u line + 1u border)
 *   .line  "Now practicing" / credit     32u  (2 x 16u lines, line-clamp 2 + ellipsis + title)
 *   gap    (margin-top:auto of the keys)  4u
 *   .keys  keyboard                      36u  (white 16 x 36, black 10 x 22; bottom edge 3u / 2u thick)
 *   --------------------------------------
 *   total                                90u  (== the content box; the keys end 4u of padding above the frame)
 *
 * The sound hint lives in the .row (right end) instead of a row of its own: the speaker glyph + "Sound off" while
 * muted; icon only when "Watch me play" shares the row. Labels hidden on touch (pointer:coarse).
 */
export const PIANO_CSS = `
.overlay.pn{contain:inline-size;min-width:0;gap:0;align-items:center;text-shadow:none}
.pn .row{width:100%;display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u)*4);white-space:nowrap;height:calc(var(--u)*18);flex:none;box-sizing:border-box}
.pn .pbtn{display:inline-flex;align-items:center;gap:calc(var(--u)*3);height:calc(var(--u)*18);padding:0 calc(var(--u)*4);margin:0;font:inherit;line-height:calc(var(--u)*16);color:inherit;background:#f3dd86;border:calc(var(--u)) solid #22222c;box-shadow:0 calc(var(--u)) 0 #a5a5ad;cursor:pointer;box-sizing:border-box;text-decoration:none;text-shadow:none}
.pn .pbtn:active,.pn .pbtn.on{background:#cfe3f7;transform:translateY(calc(var(--u)))}
.pn .pbtn:focus-visible,.pn .keys .k:focus-visible{outline:calc(var(--u)*2) solid #2f6fa8;outline-offset:calc(var(--u)*1)}
.pn .tag{color:#52525a}
.pn .line{width:100%;flex:none;box-sizing:border-box;line-height:calc(var(--u)*16);height:calc(var(--u)*32);overflow:hidden;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;text-overflow:ellipsis}
.pn .line .ph{color:#52525a}
.pn .cr{color:#52525a}
.pn .cr a{color:#2f6fa8;text-decoration:underline;text-underline-offset:calc(var(--u)*1)}
.pn .cr a:focus-visible{outline:calc(var(--u)*2) solid #2f6fa8;outline-offset:calc(var(--u)*1)}
.pn .mute{flex:none;display:inline-flex;align-items:center;gap:calc(var(--u)*3);height:calc(var(--u)*18);padding:0;margin:0;font:inherit;line-height:calc(var(--u)*16);color:#2f6fa8;background:none;border:0;cursor:pointer;white-space:nowrap;box-sizing:border-box;text-shadow:none}
.pn .mute:focus-visible{outline:calc(var(--u)*2) solid #2f6fa8;outline-offset:calc(var(--u)*1)}
.pn .row.v .mute .t{display:none}
.pn .glyph{display:inline-block;flex:none}
.pn .mute .glyph{width:calc(var(--u)*16);height:calc(var(--u)*16)}
.pn .keys{position:relative;flex:none;margin-top:auto;touch-action:none}
.pn .k{position:absolute;top:0;display:flex;align-items:flex-end;justify-content:center;margin:0;padding:0 0 calc(var(--u)*1);font:inherit;line-height:1;cursor:pointer;box-sizing:border-box;text-shadow:none;-webkit-tap-highlight-color:transparent}
.pn .k.w{background:#fff;border:calc(var(--u)) solid #22222c;border-bottom-width:calc(var(--u)*3);color:#82828c}
.pn .k.b{background:#22222c;border:calc(var(--u)) solid #22222c;border-bottom-width:calc(var(--u)*2);color:#b4b4bc;z-index:1}
.pn .k.w.lit{background:#7fb9ea;border-bottom-color:#2f6fa8}
.pn .k.b.lit{background:#3f7fc0}
.pn .k.sel::after{content:'';position:absolute;left:50%;margin-left:calc(var(--u)*-2);bottom:calc(var(--u)*-2);width:calc(var(--u)*4);height:calc(var(--u)*4);background:#e8a33a;box-shadow:0 0 0 calc(var(--u)) #22222c}
.pn .k.b.sel::after{bottom:calc(var(--u)*3)}
.pn .k.lit{transform:translateY(calc(var(--u)))}
.pn .lbl{pointer-events:none}
@media (pointer:coarse){.pn .lbl{display:none}}
@media (prefers-reduced-motion:reduce){.pn .k.lit,.pn .pbtn:active,.pn .pbtn.on{transform:none}}
`;
