// The garden court: camera projection, parallax background layers and the
// shared sprite painters (blocks, ball, paddle).

import { W, H, ctx, PAL, makeLayer, setTarget, rect, disc, ellipse, line, trap, rrect, lerp, mulberry, bayer } from './gfx.js';
import { WW, WH } from './game.js';

// ---------------------------------------------------------------- projection
// cam 0 = low view from behind the baseline (menus), cam 1 = raised play view.

export const P = { cam: 0, wb: 0, hor: 0, G: 1, dFar: 1.45, kx: 1.16, cx: W / 2 };

export function setCam(cam) {
  P.cam = cam;
  P.wb = Math.round(lerp(0.58 * H, 0.3 * H, cam));
  const yTop = P.wb + lerp(3, 7, cam);
  const yBot = H - lerp(2, 6, cam);
  P.dFar = lerp(2.3, 1.45, cam);
  P.G = (yBot - yTop) / (1 - 1 / P.dFar);
  P.hor = yBot - P.G;
}

const depth = (wy) => P.dFar + (1 - P.dFar) * (wy / WH);

export function proj(wx, wy, wz = 0) {
  const d = depth(wy);
  const s = P.kx / d;
  return { x: P.cx + (wx - WW / 2) * s, y: P.hor + P.G / d - wz * s, s };
}

export function unprojX(sx, wy) {
  return (sx - P.cx) / (P.kx / depth(wy)) + WW / 2;
}

function unprojY(sy) {
  const d = P.G / (sy - P.hor);
  return (WH * (d - P.dFar)) / (1 - P.dFar);
}

// ---------------------------------------------------------------- layers

const L = {};
const LANTERNS = [38, 201];
const WALL_H = 14;
const LAYER_H = 64;
let speckles = [];

const SKY = ['#2b2547', '#4a3560', '#7d4668', '#b85a5e', '#e07f52', '#f2a85c', '#f6c873'];

export function buildLayers() {
  const rnd = mulberry(20261013);

  // Sky: banded dusk gradient with dithered seams.
  const skyH = Math.round(0.58 * H) + 14;
  const sky = makeLayer(W, skyH);
  setTarget(sky);
  for (let y = 0; y < skyH; y++) {
    const f = Math.pow(y / (skyH - 1), 1.25) * (SKY.length - 1);
    const i = Math.min(SKY.length - 2, Math.floor(f));
    const frac = Math.max(0, Math.min(1, (f - i - 0.3) / 0.4));
    for (let x = 0; x < W; x++) {
      sky.fillStyle = bayer(x, y) < frac ? SKY[i + 1] : SKY[i];
      sky.fillRect(x, y, 1, 1);
    }
  }
  for (let i = 0; i < 9; i++) {
    const y = 6 + rnd() * skyH * 0.6;
    const len = 18 + rnd() * 46;
    const x = rnd() * (W + 40) - 20;
    const c = y / skyH > 0.4 ? '#c96a5a' : '#5a3a66';
    rect(x, y, len, 1, c);
    rect(x + 4, y + 1, len - 10, 1, c);
    if (rnd() < 0.5) rect(x + 10, y - 1, len - 22, 1, c);
  }
  for (let i = 0; i < 14; i++) rect(rnd() * W, rnd() * skyH * 0.3, 1, 1, '#cdbfe0');
  L.sky = sky.canvas;

  // Distant hills.
  const hills = makeLayer(W, 40);
  setTarget(hills);
  for (let x = 0; x < W; x++) {
    const a = 14 + Math.sin(x * 0.035 + 1) * 6 + Math.sin(x * 0.09) * 3;
    rect(x, 40 - a - 10, 1, a + 10, '#2c3d4b');
    const b = 10 + Math.sin(x * 0.05 + 4) * 5 + Math.sin(x * 0.13 + 2) * 2;
    rect(x, 40 - b, 1, b, '#20372f');
  }
  L.hills = hills.canvas;

  // Cypress and broadleaf silhouettes.
  const trees = makeLayer(W, 96);
  setTarget(trees);
  const cypress = (x, h, w) => {
    for (let i = 0; i < h; i++) {
      const t = i / h;
      const half = Math.max(0, Math.round(w * Math.min(1, Math.pow(t * 1.9, 0.75)) * (t > 0.86 ? 1 - (t - 0.86) * 2 : 1)));
      rect(x - half, 96 - h + i, half * 2 + 1, 1, '#15301f');
      if (half > 1 && rnd() < 0.55) rect(x + half - 1, 96 - h + i, 1, 1, '#2c5a38');
      if (half > 2 && rnd() < 0.3) rect(x - half + 1 + rnd() * half, 96 - h + i, 1, 1, '#0f2417');
    }
  };
  const bush = (x, y, r) => {
    disc(x, y, r, '#1a3d26');
    disc(x - r * 0.3, y - r * 0.3, r * 0.6, '#225030');
    for (let i = 0; i < r * 2; i++) {
      const a = rnd() * 6.28;
      const d = rnd() * r;
      rect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, 1, rnd() < 0.5 ? '#2f6b3d' : '#122c1b');
    }
  };
  for (let i = 0; i < 7; i++) bush(20 + i * 34 + rnd() * 10, 84 - rnd() * 8, 12 + rnd() * 7);
  [14, 30, 52, 96, 118, 150, 172, 196, 226].forEach((x, i) => cypress(x + rnd() * 6, 48 + rnd() * 40 - (i % 3) * 6, 4 + rnd() * 3));
  L.trees = trees.canvas;

  // Hedge, stone wall, lantern pillars and flowering planters.
  const wall = makeLayer(W, LAYER_H);
  setTarget(wall);
  const wy = LAYER_H - WALL_H;
  for (let x = 0; x < W; x++) {
    const top = wy - 24 + Math.round(Math.sin(x * 0.4) * 0.6 + rnd() * 1.4);
    rect(x, top, 1, wy - top + 2, '#1c4427');
  }
  for (let i = 0; i < 420; i++) {
    rect(rnd() * W, wy - 23 + rnd() * 24, 1, 1, rnd() < 0.55 ? '#2a5f35' : '#133120');
  }
  for (let x = 0; x < W; x += 2) if (rnd() < 0.5) rect(x, wy - 24, 1, 1, '#34743f');
  rect(0, wy, W, WALL_H, '#5c5852');
  rect(0, wy, W, 2, '#8c877c');
  rect(0, wy + 2, W, 1, '#716c64');
  for (let r = 0; r < 3; r++) {
    const y = wy + 5 + r * 4;
    rect(0, y, W, 1, '#48443f');
    for (let x = (r % 2) * 6; x < W; x += 12) rect(x, y - 3, 1, 3, '#48443f');
  }
  for (let i = 0; i < 60; i++) rect(rnd() * W, wy + 3 + rnd() * 10, 1, 1, rnd() < 0.5 ? '#6a655d' : '#524e48');
  rect(0, LAYER_H - 1, W, 1, '#35322e');
  for (const lx of LANTERNS) {
    rect(lx - 5, wy - 4, 11, WALL_H + 4, '#6f6a62');
    rect(lx - 6, wy - 5, 13, 2, '#958f84');
    rect(lx - 5, LAYER_H - 1, 11, 1, '#35322e');
    rect(lx + 4, wy - 3, 1, WALL_H + 2, '#57534d');
    rect(lx - 3, wy - 15, 7, 10, '#231f1a');
    rect(lx - 2, wy - 13, 5, 7, '#ffcf5a');
    rect(lx - 1, wy - 12, 3, 5, '#fff3b8');
    rect(lx - 4, wy - 16, 9, 1, '#231f1a');
    rect(lx - 1, wy - 18, 3, 2, '#231f1a');
  }
  for (const side of [0, 1]) {
    const bx = side ? W - 14 : 14;
    for (let i = 0; i < 6; i++) {
      const x = bx + (rnd() - 0.5) * 30;
      const y = wy - 2 + (rnd() - 0.5) * 12;
      const r = 6 + rnd() * 5;
      disc(x, y, r, '#214a2b');
      disc(x - 1, y - 2, r * 0.6, '#2c6238');
      for (let k = 0; k < 7; k++) {
        const a = rnd() * 6.28;
        const d = rnd() * r;
        rect(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd() < 0.3 ? 2 : 1, 1, rnd() < 0.7 ? '#f1eedd' : '#c9d3b6');
      }
    }
    rect(side ? W - 22 : 0, LAYER_H - 7, 22, 7, '#77726a');
    rect(side ? W - 22 : 0, LAYER_H - 7, 22, 1, '#9a948a');
    rect(side ? W - 22 : 0, LAYER_H - 1, 22, 1, '#35322e');
  }
  L.wall = wall.canvas;

  // Foreground canopy framing the top corners.
  const fore = makeLayer(W, 120);
  setTarget(fore);
  const canopy = (cx, cy, n, spread) => {
    for (let i = 0; i < n; i++) {
      const x = cx + (rnd() - 0.5) * spread;
      const y = cy + (rnd() - 0.5) * spread * 0.9;
      const r = 7 + rnd() * 9;
      disc(x, y, r, '#102b1b');
      disc(x - 2, y - 2, r * 0.55, '#17402a');
      for (let k = 0; k < r; k++) {
        const a = rnd() * 6.28;
        const d = rnd() * r;
        rect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, 1, rnd() < 0.5 ? '#245a34' : '#0b2014');
      }
    }
  };
  canopy(4, 22, 16, 62);
  canopy(W - 2, 28, 18, 68);
  rect(0, 40, 3, 80, '#2a2018');
  rect(3, 46, 1, 74, '#3a2c20');
  L.fore = fore.canvas;

  setTarget(null);

  speckles = [];
  for (let i = 0; i < 300; i++) {
    speckles.push({ x: -90 + rnd() * (WW + 180), y: -40 + rnd() * (WH + 60), light: rnd() < 0.5, wide: rnd() < 0.3 });
  }
}

const COURT_LINES = [
  [6, -30, 6, WH + 40],
  [194, -30, 194, WH + 40],
  [30, -30, 30, WH + 40],
  [170, -30, 170, WH + 40],
  [100, -30, 100, 120],
  [30, 120, 170, 120],
  [6, WH - 26, 194, WH - 26],
];

export function drawScene(time) {
  const cam = P.cam;
  const wb = P.wb;

  ctx.drawImage(L.sky, 0, Math.round(-cam * 12));
  const wallTop = wb - WALL_H;
  ctx.drawImage(L.hills, 0, Math.round(wallTop - 40 - 30 + cam * 16));
  ctx.drawImage(L.trees, 0, Math.round(wallTop - 96 - 12 + cam * 9));
  ctx.drawImage(L.wall, 0, wb - LAYER_H);

  // Grass with mowing stripes.
  for (let y = wb; y < H; y++) {
    const wy = unprojY(y + 0.5);
    const stripe = Math.floor((wy + 2000) / 22) & 1;
    ctx.fillStyle = stripe ? '#3f7a34' : '#376e2e';
    ctx.fillRect(0, y, W, 1);
  }
  rect(0, wb, W, 2, '#2a5526');
  for (const s of speckles) {
    const p = proj(s.x, s.y);
    if (p.y < wb + 2 || p.y >= H) continue;
    rect(p.x, p.y, s.wide && p.s > 0.8 ? 2 : 1, 1, s.light ? '#4c8f3e' : '#2e5f29');
  }

  // Court markings.
  ctx.globalAlpha = 0.82;
  for (const [x0, y0, x1, y1] of COURT_LINES) {
    const a = proj(x0, y0);
    const b = proj(x1, y1);
    if (y0 === y1) rect(a.x, a.y, b.x - a.x, a.s > 0.95 ? 2 : 1, '#e4ecd0');
    else line(a.x, Math.max(a.y, wb + 2), b.x, b.y, '#e4ecd0', b.s > 0.95 ? 2 : 1);
  }
  ctx.globalAlpha = 1;

  // The net lowers out of the way as the camera rises.
  if (cam < 0.55) {
    const k = 1 - cam / 0.55;
    const nh = Math.round(13 * k);
    const y0 = wb + 7;
    ctx.globalAlpha = 0.3;
    rect(22, y0, 196, 2, '#000');
    ctx.globalAlpha = 1;
    if (nh > 1) {
      ctx.globalAlpha = 0.6;
      rect(22, y0 - nh, 196, nh, '#162019');
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0c130e';
      for (let y = y0 - nh + 2; y < y0; y += 2) {
        for (let x = 22 + (y & 2 ? 1 : 0); x < 218; x += 2) ctx.fillRect(x, y, 1, 1);
      }
      rect(22, y0 - nh, 196, 2, '#ecefdc');
      rect(119, y0 - nh, 2, nh, '#d9dcc8');
    }
    rect(20, y0 - nh - 2, 2, nh + 3, '#22241f');
    rect(218, y0 - nh - 2, 2, nh + 3, '#22241f');
  }

  // Lantern glow.
  const flick = Math.sin(time * 7) > 0.6 ? 1 : 0;
  for (const lx of LANTERNS) {
    const ly = wb - WALL_H - 10;
    ctx.globalAlpha = 0.14;
    disc(lx, ly, 9 + flick, '#ffcf5a');
    ctx.globalAlpha = 0.22;
    disc(lx, ly, 5, '#ffe08a');
    ctx.globalAlpha = 0.1;
    ellipse(lx, wb + 5, 14, 3, '#ffe08a');
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(L.fore, 0, Math.round(-cam * 34 - 4));
}

// ---------------------------------------------------------------- sprites

export const MAT = {
  T: { top: '#cf6f4f', hi: '#e79069', front: '#a04d37', lo: '#733324', bits: ['#cf6f4f', '#a04d37', '#e79069'] },
  L: { top: '#ece3c8', hi: '#fbf6e2', front: '#c9bd9c', lo: '#9d906d', bits: ['#ece3c8', '#c9bd9c', '#fbf6e2'] },
  H: { top: '#3f7d38', hi: '#68ab52', front: '#2b5b29', lo: '#193a1b', bits: ['#3f7d38', '#2b5b29', '#68ab52'] },
  S: { top: '#454a54', hi: '#69707c', front: '#272b32', lo: '#14171b', bits: ['#454a54', '#272b32', '#69707c'] },
};

// A cuboid seen from the front and above. (xl,xr,yn) is the near ground edge,
// (xlf,xrf,yf) the far ground edge; h/hf are the wall heights at each edge.
export function drawBlock(xl, xr, yn, xlf, xrf, yf, h, hf, type, seed, o = {}) {
  const m = MAT[type];
  xl = Math.round(xl);
  xr = Math.round(xr);
  yn = Math.round(yn);
  h = Math.max(2, Math.round(h));
  const topN = yn - h;
  const topF = Math.min(topN - 2, Math.round(yf - hf));
  const w = xr - xl;
  if (w < 2) return;

  trap(topF, xlf, xrf, topN, xl, xr, m.top);
  rect(xl, topN, w, h, m.front);
  rect(xl, topN, w, 1, m.hi);
  rect(xl, yn - 1, w, 1, m.lo);
  rect(xr - 1, topN + 1, 1, h - 1, m.lo);
  trap(topF, xlf, xrf, topF + 1, xlf, xrf, m.hi);

  const rnd = mulberry(seed);
  const leafy = type === 'H';
  const n = leafy ? 22 : type === 'S' ? 4 : 7;
  const th = topN - topF;
  for (let i = 0; i < n; i++) {
    const u = rnd();
    const v = rnd();
    const dark = rnd() < 0.5;
    if (rnd() < 0.45) {
      const y = topF + 1 + Math.floor(v * (th - 1));
      const t = th > 1 ? (y - topF) / th : 1;
      const a = lerp(xlf, xl, t) + 1;
      const b = lerp(xrf, xr, t) - 2;
      rect(lerp(a, b, u), y, leafy || rnd() < 0.5 ? 1 : 2, 1, dark ? m.front : m.hi);
    } else {
      rect(xl + 1 + u * (w - 3), topN + 1 + v * (h - 3), leafy || rnd() < 0.5 ? 1 : 2, 1, dark ? m.lo : m.top);
    }
  }

  if (o.damage > 0) {
    // Cracks spreading across the front and over the top edge.
    const crack = mulberry(seed ^ 0x9e3779b9);
    const count = Math.round(o.damage * 3);
    for (let c = 0; c < count; c++) {
      let x = xl + 3 + crack() * (w - 6);
      for (let y = topN - 2; y < yn - 1; y++) {
        rect(x, y, 1, 1, m.lo);
        x += crack() < 0.5 ? -1 : crack() < 0.6 ? 1 : 0;
        x = Math.max(xl + 1, Math.min(xr - 2, x));
        if (crack() < 0.12) break;
      }
    }
  }

  if (o.frozen) {
    ctx.globalAlpha = 0.5;
    for (let y = topF; y < yn; y++) {
      const t = y < topN ? (y - topF) / Math.max(1, th) : 1;
      const a = Math.round(lerp(xlf, xl, t));
      const b = Math.round(lerp(xrf, xr, t));
      ctx.fillStyle = PAL.ice;
      for (let x = a + ((y + a) & 1); x < b; x += 2) ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
    rect(xl + 2, topN + 2, 2, 1, '#ffffff');
    rect(xl + 2, topN + 3, 1, 1, '#ffffff');
  }

  if (o.flash > 0) {
    ctx.globalAlpha = Math.min(0.8, o.flash * 6);
    trap(topF, xlf, xrf, topN, xl, xr, '#ffffff');
    rect(xl, topN, w, h, '#ffffff');
    ctx.globalAlpha = 1;
  }
}

export function drawShadow(x, y, rx, ry, a = 0.3) {
  ctx.globalAlpha = a;
  ellipse(x, y, rx, ry, '#0a1a0c');
  ctx.globalAlpha = 1;
}

export function drawBall(cx, cy, r, hot = false) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  const base = hot ? '#ffb347' : '#d8f04a';
  const hi = hot ? '#fff2b0' : '#f6ffa6';
  const lo = hot ? '#d9662c' : '#9db52e';
  disc(cx, cy, r, lo);
  disc(cx - 0.6, cy - 0.6, r - 0.9, base);
  if (r >= 3) {
    rect(cx - Math.round(r * 0.5), cy - Math.round(r * 0.55), Math.max(1, Math.round(r * 0.45)), 1, hi);
    rect(cx - Math.round(r * 0.6), cy - Math.round(r * 0.3), 1, Math.max(1, Math.round(r * 0.4)), hi);
  }
}

export function drawPaddle(cx, y, hw, glow = false) {
  cx = Math.round(cx);
  y = Math.round(y);
  hw = Math.round(hw);
  ctx.globalAlpha = 0.32;
  rrect(cx - hw + 1, y - 2, hw * 2, 8, 4, '#07140a');
  ctx.globalAlpha = 1;
  rrect(cx - hw, y - 11, hw * 2, 14, 6, '#0d0f12');
  rrect(cx - hw + 1, y - 11, hw * 2 - 2, 9, 5, '#22262d');
  rect(cx - hw + 5, y - 10, hw * 2 - 10, 1, '#4a505b');
  rect(cx - hw + 3, y - 3, hw * 2 - 6, 1, glow ? PAL.yellowHi : PAL.yellow);
  if (glow) rect(cx - hw + 3, y - 4, hw * 2 - 6, 1, PAL.yellowLo);
}
