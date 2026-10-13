// Immediate-mode widgets. Screens call these every frame; each widget paints
// itself and registers a hit region that the pointer handlers consult.

import { W, H, ctx, PAL, makeLayer, setTarget, rect, rrect, disc, ring, text, textW, icon, clamp, mulberry } from './gfx.js';

export const ui = {
  regions: [],
  live: true, // false while a screen is animating in or out
  pressed: null,
  hover: null,
};

export function beginUI() {
  ui.regions.length = 0;
}

// fn fires on release; drag (optional) fires continuously while held.
export function region(id, x, y, w, h, fn, drag) {
  if (ui.live) ui.regions.push({ id, x, y, w, h, fn, drag });
}

export function hitTest(x, y) {
  for (let i = ui.regions.length - 1; i >= 0; i--) {
    const r = ui.regions[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
  }
  return null;
}

const down = (id) => ui.pressed === id;
const hot = (id) => ui.hover === id && ui.live;

// Primary yellow pill.
export function pill(id, label, cx, y, w, h, fn, o = {}) {
  const x = Math.round(cx - w / 2);
  const d = down(id) ? 2 : 0;
  if (o.pulse != null) {
    // Idle pulse: a soft halo that swells and fades, in whole pixels.
    const p = 0.5 + 0.5 * Math.sin(o.pulse * 2.6);
    ctx.globalAlpha *= 0.1 + 0.2 * p;
    rrect(x - 5, y - 5, w + 10, h + 12, 11, PAL.yellow);
    if (p > 0.5) rrect(x - 3, y - 3, w + 6, h + 8, 9, PAL.yellowHi);
    ctx.globalAlpha = 1;
  }
  rrect(x - 1, y - 1, w + 2, h + 4, 7, PAL.ink);
  rrect(x, y + 2, w, h, 6, PAL.yellowLo);
  rrect(x, y + d, w, h, 6, hot(id) ? PAL.yellowHi : PAL.yellow);
  if (!d) rect(x + 5, y + 1, w - 10, 1, PAL.yellowHi);
  const sc = o.scale || 1;
  text(label, cx, y + d + Math.round((h - 7 * sc) / 2), PAL.ink, { align: 'center', scale: sc, sp: o.sp ?? 2 });
  region(id, x - 2, y - 2, w + 4, h + 6, fn);
}

// Quiet secondary button.
export function ghost(id, label, cx, y, w, h, fn, o = {}) {
  const x = Math.round(cx - w / 2);
  const on = hot(id) || down(id);
  rrect(x - 1, y - 1, w + 2, h + 2, 5, on ? PAL.yellow : o.line || PAL.cream);
  rrect(x, y, w, h, 4, down(id) ? PAL.panelHi : o.fill || PAL.panel);
  const ink = on && !o.fill ? PAL.yellow : o.color || PAL.cream;
  if (o.icon) {
    // Icon on the left, label after it.
    icon(o.icon, x + 4, y + Math.round((h - 11) / 2), ink);
    text(label, x + 17 + Math.round((w - 20 - textW(label, 1, o.sp ?? 1)) / 2), y + Math.round((h - 7) / 2), ink, { sp: o.sp ?? 1 });
  } else {
    text(label, cx, y + Math.round((h - 7) / 2), ink, { align: 'center', sp: o.sp ?? 1 });
  }
  region(id, x - 2, y - 2, w + 4, h + 4, fn);
}

// Round icon button with a caption underneath.
export function roundBtn(id, name, label, cx, cy, fn, o = {}) {
  const r = o.r || 16;
  const d = down(id) ? 1 : 0;
  disc(cx, cy + 2, r + 1, o.shadow || PAL.creamLo);
  disc(cx, cy + d, r + 1, PAL.ink);
  disc(cx, cy + d, r, hot(id) ? PAL.panelHi : PAL.panel);
  ring(cx, cy + d, r - 2, o.ring || PAL.creamLo);
  icon(name, cx - 11, cy - 11 + d, PAL.yellow, 2);
  if (label) text(label, cx, cy + r + 6, o.color || PAL.ink, { align: 'center' });
  region(id, cx - r - 3, cy - r - 3, r * 2 + 6, r * 2 + 18, fn);
}

// Small square icon button (HUD).
export function iconBtn(id, name, x, y, fn) {
  rrect(x - 1, y - 1, 19, 19, 5, PAL.ink);
  rrect(x, y, 17, 17, 4, hot(id) || down(id) ? PAL.panelHi : PAL.panel);
  icon(name, x + 3, y + 3, PAL.yellow);
  region(id, x - 4, y - 4, 25, 25, fn);
}

export function slider(id, x, y, w, v, set) {
  rrect(x - 1, y - 1, w + 2, 8, 4, PAL.cream);
  rrect(x, y, w, 6, 3, '#07140d');
  const fill = Math.round((w - 2) * clamp(v, 0, 1));
  if (fill > 0) rrect(x + 1, y + 1, fill, 4, 2, PAL.yellow);
  const kx = x + 1 + fill;
  rrect(kx - 4, y - 4, 8, 14, 3, PAL.ink);
  rrect(kx - 3, y - 3, 6, 12, 2, down(id) ? PAL.yellowHi : PAL.cream);
  const drag = (px) => set(clamp((px - x - 1) / (w - 2), 0, 1));
  region(id, x - 8, y - 8, w + 16, 22, null, drag);
}

// ---------------------------------------------------------------- panels

let off = null;

function paintPanel(x, y, w, h, style) {
  if (style === 'cream') {
    rrect(x - 1, y - 1, w + 2, h + 5, 6, PAL.ink);
    rrect(x, y + 3, w, h, 5, PAL.creamLo);
    rrect(x, y, w, h, 5, PAL.cream);
    const rnd = mulberry(77);
    for (let i = 0; i < (w * h) / 60; i++) rect(x + 3 + rnd() * (w - 6), y + 3 + rnd() * (h - 6), 1, 1, PAL.creamSpeck);
    rect(x + 4, y + 3, w - 8, 1, PAL.creamLo);
    rect(x + 4, y + h - 4, w - 8, 1, PAL.creamLo);
    rect(x + 3, y + 4, 1, h - 8, PAL.creamLo);
    rect(x + w - 4, y + 4, 1, h - 8, PAL.creamLo);
  } else {
    rrect(x - 1, y - 1, w + 2, h + 5, 4, '#06120c');
    rrect(x, y, w, h + 3, 3, '#0a1a12');
    rrect(x, y, w, h, 3, PAL.panel);
    // Thin cream frame with notched corners.
    rect(x + 6, y + 3, w - 12, 1, PAL.cream);
    rect(x + 6, y + h - 4, w - 12, 1, PAL.cream);
    rect(x + 3, y + 6, 1, h - 12, PAL.cream);
    rect(x + w - 4, y + 6, 1, h - 12, PAL.cream);
    for (const [cx, cy] of [[x + 4, y + 4], [x + w - 6, y + 4], [x + 4, y + h - 6], [x + w - 6, y + h - 6]]) {
      rect(cx, cy, 2, 2, PAL.cream);
    }
  }
}

// A board that tilts up from the grass: k = 0 lying flat, k = 1 upright.
// Widgets inside only become interactive once it has fully risen.
export function panel(k, x, y, w, h, style, draw) {
  const full = k >= 0.999;
  const wasLive = ui.live;
  if (!full) {
    if (k <= 0.01) return;
    if (!off || off.canvas.height !== H || off.canvas.width !== W) off = makeLayer(W, H);
    off.clearRect(0, 0, W, H);
    setTarget(off);
    ui.live = false;
  }
  paintPanel(x, y, w, h, style);
  draw();
  ui.live = wasLive;
  if (full) return;
  setTarget(null);

  const sx = x - 3;
  const sw = w + 6;
  const sTop = y - 2;
  const sH = h + 8;
  const dH = Math.max(1, Math.round(sH * k));
  const dTop = sTop + sH - dH;
  const cx = x + w / 2;
  ctx.globalAlpha = Math.min(1, k * 1.8);
  for (let i = 0; i < dH; i++) {
    const t = i / dH;
    const ws = 1 - (1 - k) * 0.34 * (1 - t);
    const dw = Math.round(sw * ws);
    ctx.drawImage(off.canvas, sx, sTop + Math.floor((i * sH) / dH), sw, 1, Math.round(cx - dw / 2), dTop + i, dw, 1);
  }
  ctx.globalAlpha = 1;
}
