// The garden court: camera projection, parallax background layers and the
// shared sprite painters (blocks, ball, paddle).

import { W, H, ctx, PAL, makeLayer, setTarget, rect, disc, ellipse, line, trap, rrect, lerp, mulberry, bayer } from './gfx.js';
import { WW, WH, PADDLE_Y } from './game.js';
import { COUNTRIES } from './themes.js';

// ---------------------------------------------------------------- projection
// cam 0 = low view from behind the baseline (menus), cam 1 = raised play view.
// shift trucks the camera sideways: the paddle's depth stays put on screen and
// everything nearer or farther slides against it.

// landing 1 = the bare first screen (no net, no overhanging canopy).
export const P = { cam: 0, wb: 0, hor: 0, G: 1, dFar: 1.45, kx: 1.16, cx: W / 2, shift: 0, sRef: 1, landing: 0 };

export function setCam(cam, shift = 0) {
  P.cam = cam;
  P.cx = W / 2;
  P.shift = shift;
  P.wb = Math.round(lerp(0.58 * H, 0.3 * H, cam));
  const yTop = P.wb + lerp(3, 7, cam);
  const yBot = H - lerp(2, 6, cam);
  P.dFar = lerp(2.3, 1.45, cam);
  P.G = (yBot - yTop) / (1 - 1 / P.dFar);
  P.hor = yBot - P.G;
  P.sRef = P.kx / depth(PADDLE_Y);
}

const depth = (wy) => P.dFar + (1 - P.dFar) * (wy / WH);

export function proj(wx, wy, wz = 0) {
  const d = depth(wy);
  const s = P.kx / d;
  return { x: P.cx + (wx - WW / 2) * s - P.shift * (s - P.sRef), y: P.hor + P.G / d - wz * s, s };
}

export function unprojX(sx, wy) {
  const s = P.kx / depth(wy);
  return (sx - P.cx + P.shift * (s - P.sRef)) / s + WW / 2;
}

function unprojY(sy) {
  const d = P.G / (sy - P.hor);
  return (WH * (d - P.dFar)) / (1 - P.dFar);
}

// ---------------------------------------------------------------- layers
// Each court theme (js/themes.js) gets its own set of background layers,
// built the first time it is shown and kept until the window is resized.

const M = 26; // spare layer width each side, revealed as the camera trucks
const WALL_H = 14;
const LAYER_H = 64;
const HILL_H = 64;
const LAND_H = 90;
let lanterns = [];
let speckles = [];
let flies = [];
let petals = [];
let cache = {};
let theme = null; // the theme being drawn
let L = null; // its layers

export function buildLayers() {
  const rnd = mulberry(20261013);
  cache = {};
  lanterns = [M + W / 2 - 82, M + W / 2 + 81].map(Math.round);
  speckles = [];
  const reach = W / 2 / 0.5; // world half-width visible at the far edge of the low view
  for (let i = 0; i < Math.round(W * 1.3); i++) {
    speckles.push({ x: WW / 2 + (rnd() - 0.5) * 2 * reach, y: -40 + rnd() * (WH + 60), light: rnd() < 0.5, wide: rnd() < 0.3 });
  }
  flies = [];
  for (let i = 0; i < Math.round(W / 22); i++) flies.push({ x: rnd() * W, y: rnd(), p: rnd() * 6.28, f: 0.5 + rnd() });
  petals = [];
  for (let i = 0; i < Math.round(W / 14); i++) petals.push({ x: rnd() * W, y: rnd(), p: rnd() * 6.28, v: 5 + rnd() * 7, k: rnd() });
  // Build every country now, so none is built in the middle of a frame later.
  for (const c of COUNTRIES) layersFor({ countryId: c.id, backgroundPalette: c.bg });
  if (theme) L = layersFor(theme);
}

export function layersFor(t) {
  return cache[t.countryId] || (cache[t.countryId] = makeLayers(t.countryId, t.backgroundPalette));
}

// Switch theme. A change of country or surface cross-fades over ~350 ms.
// Both scenes are drawn live during the fade, from the same camera, so
// nothing slides or ghosts while the camera is moving.
const FADE = 0.35;
let prev = null;
let fadeLayer = null;
let fadeT = 1;
let lastT = null;
export function setTheme(t) {
  if (theme && t.key === theme.key) return;
  if (theme) {
    prev = theme;
    fadeT = 0;
  }
  theme = t;
  L = layersFor(t);
}
export const currentTheme = () => theme;

// A small picture of a theme for the theme picker: its sky, landmarks and
// trees, and a little court in its normal colours.
export function drawThemePreview(t, x, y, w, h) {
  const Lt = layersFor(t);
  const mid = M + Math.round(W / 2);
  const gy = Math.round(y + h * 0.6);
  const skyH = Lt.sky.height;
  ctx.drawImage(Lt.sky, 0, skyH * 0.25, W, skyH * 0.75, x, y, w, gy - y);
  const span = 230;
  const sc = w / span;
  const hh = Math.round(HILL_H * sc);
  ctx.drawImage(Lt.hills, mid - span / 2, 0, span, HILL_H, x, gy - hh + 3, w, hh);
  const lh = Math.round(LAND_H * sc);
  ctx.drawImage(Lt.land, mid - span / 2, 0, span, LAND_H, x, gy - lh + 2, w, lh);
  const th = Math.round(96 * sc);
  ctx.drawImage(Lt.trees, mid - span / 2, 0, span, 96, x, gy - th + 4, w, th);
  const cp = t.courtPalette;
  for (let yy = gy; yy < y + h; yy++) rect(x, yy, w, 1, Math.floor((yy - gy) / 3) % 2 ? cp.alt : cp.court);
  const cx = x + w / 2;
  const top = Math.round(w * 0.26);
  const bot = Math.round(w * 0.44);
  line(cx - top, gy + 1, cx - bot, y + h - 1, t.courtLineColor);
  line(cx + top, gy + 1, cx + bot, y + h - 1, t.courtLineColor);
  rect(cx - top, gy + 1, top * 2, 1, t.courtLineColor);
  rect(cx, gy + 1, 1, Math.round((y + h - gy) * 0.5), t.courtLineColor);
}

function makeLayers(id, T) {
  // Building draws into scratch layers; put back whatever was being drawn to
  // (a panel mid-animation, say), or the rest of that frame lands elsewhere.
  const was = ctx;
  const rnd = mulberry(20261013 + id.length * 977);
  const out = {};
  const LW = W + M * 2;
  const mid = M + Math.round(W / 2);

  // Sky: banded dusk gradient with dithered seams.
  const SKY = T.sky;
  const skyH = Math.round(0.58 * H) + 14;
  // Written straight into pixels: drawing it one rectangle per pixel froze
  // the game for a moment the first time a country appeared.
  const sky = makeLayer(W, skyH);
  const img = sky.createImageData(W, skyH);
  const px = new Uint32Array(img.data.buffer);
  const rgba = SKY.map((hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16); // little-endian ABGR
  });
  for (let y = 0; y < skyH; y++) {
    const f = Math.pow(y / (skyH - 1), 1.25) * (SKY.length - 1);
    const i = Math.min(SKY.length - 2, Math.floor(f));
    const frac = Math.max(0, Math.min(1, (f - i - 0.3) / 0.4));
    for (let x = 0; x < W; x++) px[y * W + x] = bayer(x, y) < frac ? rgba[i + 1] : rgba[i];
  }
  sky.putImageData(img, 0, 0);
  out.sky = sky.canvas;
  out.stars = [];
  for (let i = 0; i < Math.round(W / 14); i++) out.stars.push({ x: rnd() * W, y: rnd() * skyH * 0.32, p: rnd() * 6.28, f: 0.6 + rnd() * 1.6 });

  // Clouds drift on their own wrapping strip.
  const cw = W + 90;
  const clouds = makeLayer(cw, skyH);
  setTarget(clouds);
  for (let i = 0; i < Math.round(cw / 34); i++) {
    const y = 6 + rnd() * skyH * 0.62;
    const len = 18 + rnd() * 46;
    const x = rnd() * (cw - len);
    const c = y / skyH > 0.4 ? T.clouds[1] : T.clouds[0];
    rect(x, y, len, 1, c);
    rect(x + 4, y + 1, len - 10, 1, c);
    if (rnd() < 0.5) rect(x + 10, y - 1, len - 22, 1, c);
  }
  out.clouds = clouds.canvas;

  // Distant hills, and whatever stands far off on them.
  const hills = makeLayer(LW, HILL_H);
  setTarget(hills);
  if (id === 'japan') fuji(mid + 34, HILL_H, T);
  for (let x = 0; x < LW; x++) {
    const a = 14 + Math.sin(x * 0.035 + 1) * 6 + Math.sin(x * 0.09) * 3;
    rect(x, HILL_H - a - 10, 1, a + 10, T.hills[0]);
    const b = 10 + Math.sin(x * 0.05 + 4) * 5 + Math.sin(x * 0.13 + 2) * 2;
    rect(x, HILL_H - b, 1, b, T.hills[1]);
  }
  if (id === 'india') hillFort(mid + 70, HILL_H - 26, T, rnd);
  out.hills = hills.canvas;

  // Landmarks, between the hills and the trees.
  const land = makeLayer(LW, LAND_H);
  setTarget(land);
  if (id === 'japan') {
    pagoda(mid - 58, LAND_H);
    torii(mid + 62, LAND_H);
  } else if (id === 'newyork') {
    skyline(LW, LAND_H, rnd, mid);
  } else if (id === 'london') {
    westminster(mid, LAND_H, rnd);
  } else if (id === 'india') {
    palace(mid, LAND_H, rnd);
  }
  out.land = land.canvas;

  // Trees: kept to the sides so the landmarks show between them.
  const trees = makeLayer(LW, 96);
  setTarget(trees);
  const tc = T.trees;
  const cypress = (x, h, w) => {
    for (let i = 0; i < h; i++) {
      const t = i / h;
      const half = Math.max(0, Math.round(w * Math.min(1, Math.pow(t * 1.9, 0.75)) * (t > 0.86 ? 1 - (t - 0.86) * 2 : 1)));
      rect(x - half, 96 - h + i, half * 2 + 1, 1, tc.dark);
      if (half > 1 && rnd() < 0.55) rect(x + half - 1, 96 - h + i, 1, 1, tc.hi);
      if (half > 2 && rnd() < 0.3) rect(x - half + 1 + rnd() * half, 96 - h + i, 1, 1, tc.shade);
    }
  };
  const bush = (x, y, r, c1 = tc.bush, c2 = tc.bushHi, sp = [tc.hi, tc.shade]) => {
    disc(x, y, r, c1);
    disc(x - r * 0.3, y - r * 0.3, r * 0.6, c2);
    for (let i = 0; i < r * 2; i++) {
      const a = rnd() * 6.28;
      const d = rnd() * r;
      rect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, 1, sp[rnd() < 0.5 ? 0 : 1]);
    }
  };
  const side = (x) => Math.abs(x - mid) > Math.min(110, W * 0.3);
  for (let x = 10; x < LW; x += 34) bush(x + rnd() * 10, 86 - rnd() * 6, 10 + rnd() * 5);
  if (id === 'japan') {
    for (let x = 6; x < LW; x += 26 + rnd() * 16) if (side(x)) blossomTree(x, 96, 18 + rnd() * 8, T.blossom, rnd);
    for (let x = 8; x < LW; x += 40 + rnd() * 20) if (side(x) && rnd() < 0.5) cypress(x, 46 + rnd() * 20, 3 + rnd() * 2);
  } else if (id === 'india') {
    for (let x = 6; x < LW; x += 22 + rnd() * 18) if (side(x)) palm(x, 96, 40 + rnd() * 22, rnd() < 0.5 ? -1 : 1, tc);
    for (let x = 12; x < LW; x += 36) if (side(x)) bush(x + rnd() * 8, 82, 9 + rnd() * 4);
  } else if (id === 'london') {
    for (let x = 4; x < LW; x += 24 + rnd() * 12) if (side(x)) { bush(x, 60 + rnd() * 10, 14 + rnd() * 6); bush(x + 8, 50 + rnd() * 10, 10 + rnd() * 5); }
    for (let x = 8; x < LW; x += 30 + rnd() * 14) if (side(x) && rnd() < 0.6) cypress(x, 56 + rnd() * 24, 4 + rnd() * 2);
  } else {
    for (let x = 8, i = 0; x < LW; x += 18 + rnd() * 14, i++) if (side(x)) cypress(x, 48 + rnd() * 34 - (i % 3) * 6, 4 + rnd() * 3);
  }
  out.trees = trees.canvas;

  // Hedge, wall, lantern pillars and flowering planters.
  const wc = T.wall;
  const wall = makeLayer(LW, LAYER_H);
  setTarget(wall);
  const wy = LAYER_H - WALL_H;
  for (let x = 0; x < LW; x++) {
    const top = wy - 24 + Math.round(Math.sin(x * 0.4) * 0.6 + rnd() * 1.4);
    rect(x, top, 1, wy - top + 2, '#1c4427');
  }
  for (let i = 0; i < LW * 1.75; i++) rect(rnd() * LW, wy - 23 + rnd() * 24, 1, 1, rnd() < 0.55 ? '#2a5f35' : '#133120');
  for (let x = 0; x < LW; x += 2) if (rnd() < 0.5) rect(x, wy - 24, 1, 1, '#34743f');
  rect(0, wy, LW, WALL_H, wc.base);
  rect(0, wy, LW, 2, wc.top);
  rect(0, wy + 2, LW, 1, wc.top2);
  for (let r = 0; r < 3; r++) {
    const y = wy + 5 + r * 4;
    rect(0, y, LW, 1, wc.line);
    for (let x = (r % 2) * 6; x < LW; x += 12) rect(x, y - 3, 1, 3, wc.line);
  }
  for (let i = 0; i < LW / 4; i++) rect(rnd() * LW, wy + 3 + rnd() * 10, 1, 1, wc.speck[rnd() < 0.5 ? 0 : 1]);
  rect(0, LAYER_H - 1, LW, 1, '#35322e');
  for (const lx of lanterns) {
    rect(lx - 5, wy - 4, 11, WALL_H + 4, wc.pillar);
    rect(lx - 6, wy - 5, 13, 2, wc.pillarTop);
    rect(lx - 5, LAYER_H - 1, 11, 1, '#35322e');
    rect(lx + 4, wy - 3, 1, WALL_H + 2, wc.line);
    rect(lx - 3, wy - 15, 7, 10, '#231f1a');
    rect(lx - 2, wy - 13, 5, 7, T.lamp);
    rect(lx - 1, wy - 12, 3, 5, '#fff3b8');
    rect(lx - 4, wy - 16, 9, 1, '#231f1a');
    rect(lx - 1, wy - 18, 3, 2, '#231f1a');
  }
  const flowers = T.blossom ? [T.blossom[2], T.blossom[3]] : ['#f1eedd', '#c9d3b6'];
  const beds = [M + 12, M + W - 12];
  for (let x = W / 2 - 150; x > 40; x -= 70) beds.push(M + x, M + W - x);
  for (const bx of beds) {
    for (let i = 0; i < 6; i++) {
      const x = bx + (rnd() - 0.5) * 34;
      const y = wy - 2 + (rnd() - 0.5) * 12;
      const r = 6 + rnd() * 5;
      disc(x, y, r, '#214a2b');
      disc(x - 1, y - 2, r * 0.6, '#2c6238');
      for (let k = 0; k < 7; k++) {
        const a = rnd() * 6.28;
        const d = rnd() * r;
        rect(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd() < 0.3 ? 2 : 1, 1, rnd() < 0.7 ? flowers[0] : flowers[1]);
      }
    }
  }
  out.wall = wall.canvas;

  // Foreground canopy framing the top corners (blossom in Japan).
  const fore = makeLayer(LW, 190);
  setTarget(fore);
  const leaf = T.blossom ? ['#7a2f57', '#b8507f', T.blossom[2], '#5c2242'] : ['#102b1b', '#17402a', '#245a34', '#0b2014'];
  const canopy = (cx, cy, n, spread) => {
    for (let i = 0; i < n; i++) {
      const x = cx + (rnd() - 0.5) * spread;
      const y = cy + (rnd() - 0.5) * spread * 0.9;
      const r = 7 + rnd() * 9;
      disc(x, y, r, leaf[0]);
      disc(x - 2, y - 2, r * 0.55, leaf[1]);
      for (let k = 0; k < r; k++) {
        const a = rnd() * 6.28;
        const d = rnd() * r;
        rect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, 1, rnd() < 0.5 ? leaf[2] : leaf[3]);
      }
    }
  };
  canopy(M - 4, 20, 22, 74);
  canopy(LW - M + 4, 26, 24, 80);
  const low = 60 + Math.round(H * 0.12);
  canopy(M - 14, low, 12, 34);
  canopy(LW - M + 14, low + 6, 12, 34);
  out.fore = fore.canvas;

  // Bushes in the bottom corners, drawn over the grass during play.
  const bushes = makeLayer(80, 44);
  setTarget(bushes);
  for (let i = 0; i < 9; i++) {
    const x = 6 + rnd() * 44;
    const y = 18 + rnd() * 26 + x * 0.25;
    const r = 7 + rnd() * 8;
    disc(x, y, r, '#0f2a19');
    disc(x - 2, y - 2, r * 0.6, '#1b4428');
    for (let k = 0; k < r * 1.5; k++) {
      const a = rnd() * 6.28;
      const d = rnd() * r;
      rect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, 1, T.blossom && rnd() < 0.3 ? T.blossom[1] : rnd() < 0.5 ? '#2f6b3d' : '#0a1f12');
    }
  }
  out.bushes = bushes.canvas;

  setTarget(was);
  return out;
}

// ---- landmark painters (all draw upward from a ground line y0) -------------

function fuji(cx, y0, T) {
  const h = 46;
  for (let i = 0; i < h; i++) {
    const half = 6 + Math.round(i * 2.1 + (i > h * 0.6 ? (i - h * 0.6) * 1.2 : 0));
    const y = y0 - h - 6 + i;
    rect(cx - half, y, half, 1, '#3d3a6a');
    rect(cx, y, half, 1, '#4a4578');
    if (i < 11 + ((cx + i) % 3)) {
      rect(cx - half, y, half * 2, 1, i < 3 ? '#ffffff' : '#e6e1f0');
    } else if (i < 15 && (i + Math.floor(half / 3)) % 2 === 0) {
      rect(cx - half + 2, y, 3, 1, '#d8d2e8');
      rect(cx + half - 5, y, 3, 1, '#d8d2e8');
    }
  }
  void T;
}

function pagoda(cx, y0) {
  let y = y0 - 4;
  for (let i = 0; i < 5; i++) {
    const bw = 22 - i * 3;
    const bh = i === 0 ? 9 : 6;
    rect(cx - bw / 2, y - bh, bw, bh, '#6b2a2a');
    rect(cx - bw / 2 + 2, y - bh + 2, bw - 4, 2, '#ffcf7a');
    for (let k = cx - bw / 2 + 4; k < cx + bw / 2 - 3; k += 4) rect(k, y - bh + 2, 1, 2, '#6b2a2a');
    y -= bh;
    const rw = bw + 12;
    rect(cx - rw / 2, y - 2, rw, 2, '#2b1a24');
    rect(cx - rw / 2 + 2, y - 4, rw - 4, 2, '#3a2230');
    rect(cx - rw / 2 - 1, y - 3, 2, 1, '#2b1a24');
    rect(cx + rw / 2 - 1, y - 3, 2, 1, '#2b1a24');
    y -= 4;
  }
  rect(cx - 1, y - 10, 2, 10, '#2b1a24');
  for (let k = 0; k < 4; k++) rect(cx - 2, y - 3 - k * 2, 4, 1, '#3a2230');
}

function torii(cx, y0) {
  const red = '#c8352e';
  const dark = '#7c1f1c';
  rect(cx - 15, y0 - 34, 3, 34, red);
  rect(cx + 12, y0 - 34, 3, 34, red);
  rect(cx - 15, y0 - 34, 1, 34, dark);
  rect(cx + 12, y0 - 34, 1, 34, dark);
  rect(cx - 19, y0 - 27, 38, 3, red);
  rect(cx - 22, y0 - 37, 44, 3, red);
  rect(cx - 24, y0 - 39, 48, 2, '#2b1a24');
  rect(cx - 25, y0 - 40, 3, 1, '#2b1a24');
  rect(cx + 22, y0 - 40, 3, 1, '#2b1a24');
  rect(cx - 1, y0 - 34, 2, 7, red);
}

function skyline(LW, y0, rnd, mid) {
  const body = '#141C2C';
  const lit = (x, y, w, h) => {
    for (let wy = y + 3; wy < y0 - 6; wy += 4) {
      for (let wx = x + 2; wx < x + w - 2; wx += 3) if (rnd() < 0.28) rect(wx, wy, 1, 2, rnd() < 0.75 ? '#FFC76A' : '#ff9b4a');
    }
  };
  // Bridge off to one side: two towers, cables, a deck.
  const bx = mid + 74;
  rect(bx - 40, y0 - 22, 80, 2, '#1d2638');
  for (const tx of [bx - 26, bx + 22]) {
    rect(tx, y0 - 48, 4, 48, '#1d2638');
    rect(tx - 1, y0 - 48, 6, 2, '#2a3550');
    rect(tx + 1, y0 - 42, 2, 6, '#0c1220');
  }
  for (let x = bx - 40; x <= bx + 40; x++) {
    const d = Math.min(Math.abs(x - (bx - 24)), Math.abs(x - (bx + 24)));
    const sag = x > bx - 24 && x < bx + 24 ? 26 - Math.round(((48 - Math.abs(x - bx) * 2) / 48) * 18) : 26 - Math.min(18, d);
    rect(x, y0 - 22 - sag, 1, 1, '#3a4664');
    if (x % 4 === 0) rect(x, y0 - 22 - sag, 1, sag, '#232d44');
  }
  // Towers across the rest of the view.
  for (let x = 0; x < LW; ) {
    const w = 8 + Math.round(rnd() * 12);
    if (x > bx - 44 && x < bx + 44) {
      x += w;
      continue;
    }
    const near = Math.abs(x - (mid - 30)) < 60;
    const h = 22 + Math.round(rnd() * (near ? 46 : 30));
    rect(x, y0 - h, w, h, body);
    rect(x, y0 - h, w, 1, '#222c42');
    lit(x, y0 - h, w, h);
    x += w + (rnd() < 0.3 ? 2 : 0);
  }
  // A stepped tower with a spire, and a statue on a plinth.
  const ex = mid - 26;
  rect(ex - 8, y0 - 62, 16, 62, body);
  rect(ex - 5, y0 - 70, 10, 8, body);
  rect(ex - 3, y0 - 76, 6, 6, body);
  rect(ex - 1, y0 - 86, 2, 10, '#222c42');
  lit(ex - 8, y0 - 62, 16, 62);
  const sx = mid - 92;
  rect(sx - 4, y0 - 14, 9, 14, '#24343a');
  rect(sx - 2, y0 - 26, 5, 12, '#3f6b62');
  rect(sx - 1, y0 - 30, 3, 4, '#3f6b62');
  rect(sx + 2, y0 - 36, 1, 10, '#3f6b62');
  rect(sx + 1, y0 - 38, 3, 2, '#ffc76a');
}

function westminster(mid, y0, rnd) {
  const stone = '#34353A';
  // Long hall with a row of small spires and lit windows.
  const x0 = mid - 70;
  const x1 = mid + 90;
  rect(x0, y0 - 26, x1 - x0, 26, stone);
  for (let x = x0; x < x1; x += 7) {
    rect(x, y0 - 30, 2, 4, stone);
    rect(x, y0 - 33, 1, 3, '#44454b');
  }
  for (let x = x0 + 3; x < x1 - 3; x += 5) if (rnd() < 0.55) rect(x, y0 - 20, 2, 3, '#ffc66b');
  rect(mid + 52, y0 - 44, 14, 44, stone);
  rect(mid + 54, y0 - 50, 10, 6, stone);
  rect(mid + 58, y0 - 58, 2, 8, '#44454b');
  // The clock tower.
  const tx = mid - 34;
  rect(tx - 7, y0 - 74, 14, 74, stone);
  rect(tx - 7, y0 - 74, 2, 74, '#44454b');
  rect(tx - 8, y0 - 76, 16, 3, '#44454b');
  disc(tx, y0 - 66, 5, '#e8e4c9');
  rect(tx, y0 - 69, 1, 3, '#2a2a2e');
  rect(tx, y0 - 66, 3, 1, '#2a2a2e');
  rect(tx - 5, y0 - 84, 10, 8, stone);
  rect(tx - 3, y0 - 90, 6, 6, stone);
  rect(tx - 1, y0 - 96 + 6, 2, 4, '#44454b');
  for (let y = y0 - 56; y < y0 - 4; y += 7) rect(tx - 3, y, 2, 3, '#ffc66b');
  // A bridge in front, low.
  rect(mid - 110, y0 - 10, 220, 3, '#2c2d31');
  for (let x = mid - 104; x < mid + 110; x += 22) rect(x, y0 - 7, 3, 7, '#2c2d31');
}

function palace(mid, y0, rnd) {
  const sand = '#B97750';
  const hi = '#E0AE78';
  const arch = '#5a2f22';
  const x0 = mid - 84;
  const x1 = mid + 84;
  rect(x0, y0 - 30, x1 - x0, 30, sand);
  rect(x0, y0 - 31, x1 - x0, 2, hi);
  for (let x = x0 + 2; x < x1; x += 4) rect(x, y0 - 33, 2, 2, hi);
  // Two storeys of arches.
  for (const [row, ay] of [[0, y0 - 26], [1, y0 - 14]]) {
    for (let x = x0 + 4; x < x1 - 6; x += 9) {
      rect(x, ay + 2, 5, 7, row && rnd() < 0.3 ? '#ffc96b' : arch);
      rect(x + 1, ay + 1, 3, 1, arch);
    }
  }
  // Central block and dome.
  rect(mid - 22, y0 - 46, 44, 16, sand);
  rect(mid - 22, y0 - 47, 44, 2, hi);
  for (let x = mid - 18; x < mid + 18; x += 9) rect(x, y0 - 42, 5, 9, arch);
  for (let i = 0; i < 16; i++) {
    const half = Math.round(Math.sin((i / 16) * Math.PI * 0.95 + 0.15) * 15);
    rect(mid - half, y0 - 47 - 16 + i, half * 2, 1, i < 4 ? hi : sand);
  }
  rect(mid - 1, y0 - 70, 2, 7, hi);
  rect(mid - 2, y0 - 68, 4, 2, hi);
  // Small domed pavilions on the corners.
  for (const cx of [x0 + 10, x1 - 10, mid - 46, mid + 46]) {
    rect(cx - 6, y0 - 40, 12, 9, sand);
    rect(cx - 4, y0 - 37, 3, 6, arch);
    rect(cx + 1, y0 - 37, 3, 6, arch);
    for (let i = 0; i < 6; i++) {
      const half = Math.round(Math.sin((i / 6) * Math.PI * 0.9 + 0.2) * 6);
      rect(cx - half, y0 - 46 + i, half * 2, 1, i < 2 ? hi : sand);
    }
    rect(cx, y0 - 49, 1, 3, hi);
  }
}

function hillFort(cx, y, T, rnd) {
  rect(cx - 30, y, 60, 6, T.hills[0]);
  for (let x = cx - 30; x < cx + 30; x += 4) rect(x, y - 2, 2, 2, T.hills[0]);
  for (const tx of [cx - 30, cx + 26, cx - 4]) rect(tx, y - 7, 5, 7, T.hills[0]);
  void rnd;
}

function blossomTree(x, y0, h, B, rnd) {
  rect(x - 1, y0 - h, 3, h, '#3a2228');
  rect(x + 1, y0 - h + 6, 4, 1, '#3a2228');
  for (let i = 0; i < 7; i++) {
    const bx = x + (rnd() - 0.5) * 22;
    const by = y0 - h - 4 + (rnd() - 0.5) * 14;
    const r = 5 + rnd() * 5;
    disc(bx, by, r, B[0]);
    disc(bx - 1, by - 1, r * 0.7, B[1]);
    for (let k = 0; k < r * 1.5; k++) {
      const a = rnd() * 6.28;
      const d = rnd() * r;
      rect(bx + Math.cos(a) * d, by + Math.sin(a) * d, 1, 1, rnd() < 0.5 ? B[2] : B[3]);
    }
  }
}

function palm(x, y0, h, lean, tc) {
  let px = x;
  for (let i = 0; i < h; i++) {
    const t = i / h;
    px = x + lean * Math.round(t * t * 8);
    rect(px - 1, y0 - i, 2, 1, i % 3 ? '#4a3524' : '#3a2a1c');
  }
  const top = y0 - h;
  for (let f = 0; f < 7; f++) {
    const a = Math.PI * (0.1 + (0.8 * f) / 6);
    for (let k = 1; k < 13; k++) {
      const fx = px + Math.round(-Math.cos(a) * k);
      const fy = top + Math.round(-Math.sin(a) * k * 0.5 + (k * k) / 26);
      rect(fx, fy, 2, 1, k > 9 ? tc.hi : tc.dark);
    }
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

const wrap = (v, n) => ((v % n) + n) % n;

// Sky, stars, drifting clouds and the occasional flock. ref is the horizon
// height the flock keeps clear of.
// The whole gradient is fitted between the top of the screen and the
// horizon, so each theme's sunset colours show in play as well as in menus.
function drawSky(time, skyY, ref, horizon) {
  const sh = L.sky.height;
  const dh = Math.max(40, Math.round(horizon - skyY));
  const k = dh / sh;
  ctx.drawImage(L.sky, 0, 0, W, sh, 0, skyY, W, dh);
  drawSun(horizon);
  for (const s of L.stars) {
    const tw = Math.sin(time * s.f + s.p);
    const sy = Math.round(s.y * k) + skyY;
    if (tw > -0.3) rect(s.x, sy, 1, 1, tw > 0.75 ? '#ffffff' : '#cdbfe0');
    if (tw > 0.93) rect(s.x - 1, sy, 3, 1, '#cdbfe0');
  }
  const cw = L.clouds.width;
  const cx0 = -wrap(time * 3.6 - P.shift * P.sRef, cw);
  ctx.drawImage(L.clouds, 0, 0, cw, sh, Math.round(cx0), skyY, cw, dh);
  ctx.drawImage(L.clouds, 0, 0, cw, sh, Math.round(cx0) + cw, skyY, cw, dh);
  const bt = wrap(time, 23);
  if (bt < 14) {
    const flap = Math.floor(time * 5) & 1;
    for (let i = 0; i < 4; i++) {
      const bx = -20 + (bt / 14) * (W + 60) - i * 9 - (i & 1) * 3;
      const by = ref * 0.22 + Math.sin(time * 0.9 + i) * 3 + i * 4 + skyY;
      rect(bx, by, 1, 1, '#2a1f33');
      rect(bx - 1, by - (flap ? 1 : -1), 1, 1, '#2a1f33');
      rect(bx + 1, by - (flap ? 1 : -1), 1, 1, '#2a1f33');
    }
  }
}

export function drawScene(time) {
  const dt = lastT == null ? 0 : Math.max(0, Math.min(0.1, time - lastT));
  lastT = time;
  if (fadeT < 1 && prev) {
    fadeT = Math.min(1, fadeT + dt / FADE);
    if (!fadeLayer || fadeLayer.canvas.width !== W || fadeLayer.canvas.height !== H) fadeLayer = makeLayer(W, H);
    const now = theme;
    const nowL = L;
    const was = ctx;
    theme = prev;
    L = layersFor(prev);
    setTarget(fadeLayer);
    fadeLayer.setTransform(1, 0, 0, 1, 0, 0);
    fadeLayer.clearRect(0, 0, W, H);
    drawSceneOnce(time);
    setTarget(was);
    theme = now;
    L = nowL;
    drawSceneOnce(time);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1 - fadeT;
    ctx.drawImage(fadeLayer.canvas, 0, 0);
    ctx.restore();
    if (fadeT >= 1) prev = null;
    return;
  }
  drawSceneOnce(time);
}

function drawSceneOnce(time) {
  const cam = P.cam;
  const wb = P.wb;
  const sFar = P.kx / P.dFar;
  // How far each depth slides as the camera trucks sideways.
  const wallS = Math.round(P.shift * (P.sRef - sFar));
  const treeS = Math.round(P.shift * (P.sRef - sFar * 0.6));
  const hillS = Math.round(P.shift * (P.sRef - sFar * 0.3));

  drawSky(time, Math.round(-cam * 12), wb, wb - WALL_H - 18);

  const wallTop = wb - WALL_H;
  ctx.drawImage(L.hills, -M + hillS, Math.round(wallTop - HILL_H - 30 + cam * 16));
  const landS = Math.round(P.shift * (P.sRef - sFar * 0.45));
  ctx.drawImage(L.land, -M + landS, Math.round(wallTop - LAND_H - 22 + cam * 4));
  ctx.drawImage(L.trees, -M + treeS, Math.round(wallTop - 96 - 12 + cam * 9));
  ctx.drawImage(L.wall, -M + wallS, wb - LAYER_H);

  // Grass with mowing stripes.
  const cp = theme.courtPalette;
  for (let y = wb; y < H; y++) {
    const wy = unprojY(y + 0.5);
    const stripe = Math.floor((wy + 2000) / 22) & 1;
    ctx.fillStyle = stripe ? cp.alt : cp.court;
    ctx.fillRect(0, y, W, 1);
  }
  rect(0, wb, W, 2, shade(cp.court, -0.25));
  const spLight = shade(cp.alt, 0.18);
  const spDark = shade(cp.court, -0.18);
  for (const s of speckles) {
    const p = proj(s.x, s.y);
    if (p.y < wb + 2 || p.y >= H) continue;
    rect(p.x, p.y, s.wide && p.s > 0.8 ? 2 : 1, 1, s.light ? spLight : spDark);
  }

  // Court markings.
  ctx.globalAlpha = 0.82;
  for (const [x0, y0, x1, y1] of COURT_LINES) {
    const a = proj(x0, y0);
    const b = proj(x1, y1);
    if (y0 === y1) rect(a.x, a.y, b.x - a.x, a.s > 0.95 ? 2 : 1, theme.courtLineColor);
    else line(a.x, Math.max(a.y, wb + 2), b.x, b.y, theme.courtLineColor, b.s > 0.95 ? 2 : 1);
  }
  ctx.globalAlpha = 1;

  // Low box-hedge borders mark the side walls once play is in view.
  if (cam > 0.45) {
    ctx.globalAlpha = Math.min(1, (cam - 0.45) / 0.3);
    for (const side of [-1, 1]) {
      const wx = side < 0 ? -3 : WW + 3;
      const a = proj(wx, -6);
      const b = proj(wx, WH + 40);
      line(a.x - 1, wb + 2, b.x - 2, b.y, '#1c4427', 4);
      line(a.x - (side < 0 ? -1 : 0), wb + 2, b.x - (side < 0 ? -1 : 1), b.y, '#34743f', 1);
    }
    ctx.globalAlpha = 1;
  }

  // Fences and lamp posts down both sides once play is in view.
  if (cam > 0.45 && P.landing < 1) {
    ctx.globalAlpha = Math.min(1, (cam - 0.45) / 0.3);
    drawSides(time);
    ctx.globalAlpha = 1;
  }

  // The net lowers out of the way as the camera rises.
  if (cam < 0.55) {
    const k = (1 - cam / 0.55) * (1 - P.landing);
    const nh = Math.round(13 * k);
    const y0 = wb + 7;
    const nx = Math.round(W / 2 - 98) + wallS;
    if (nh > 1) {
      ctx.globalAlpha = 0.3;
      rect(nx, y0, 196, 2, '#000');
      ctx.globalAlpha = 1;
      ctx.globalAlpha = 0.6;
      rect(nx, y0 - nh, 196, nh, '#162019');
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0c130e';
      for (let y = y0 - nh + 2; y < y0; y += 2) {
        for (let x = nx + (y & 2 ? 1 : 0); x < nx + 196; x += 2) ctx.fillRect(x, y, 1, 1);
      }
      rect(nx, y0 - nh, 196, 2, '#ecefdc');
      rect(nx + 97, y0 - nh, 2, nh, '#d9dcc8');
    }
    if (nh > 1) {
      rect(nx - 2, y0 - nh - 2, 2, nh + 3, '#22241f');
      rect(nx + 196, y0 - nh - 2, 2, nh + 3, '#22241f');
    }
  }

  // Lantern glow.
  const flick = Math.sin(time * 7) > 0.6 ? 1 : 0;
  for (const l of lanterns) {
    const lx = l - M + wallS;
    const ly = wb - WALL_H - 10;
    ctx.globalAlpha = 0.14;
    disc(lx, ly, 9 + flick, theme.backgroundPalette.lamp);
    ctx.globalAlpha = 0.22;
    disc(lx, ly, 5, '#ffe08a');
    ctx.globalAlpha = 0.1;
    ellipse(lx, wb + 5, 14, 3, '#ffe08a');
    ctx.globalAlpha = 1;
  }

  // Fireflies along the hedge.
  for (const f of flies) {
    const glow = Math.sin(time * f.f * 1.7 + f.p);
    if (glow < 0) continue;
    const x = wrap(f.x + Math.sin(time * 0.4 * f.f + f.p) * 16 + wallS, W);
    const y = wb - 34 + f.y * 30 + Math.cos(time * 0.6 * f.f + f.p) * 5;
    ctx.globalAlpha = 0.25 * glow;
    rect(x - 1, y - 1, 3, 3, '#fff3a0');
    ctx.globalAlpha = glow;
    rect(x, y, 1, 1, '#fffbd0');
    ctx.globalAlpha = 1;
  }

  // Petals drifting across the whole view.
  const amb = theme.ambientEffects;
  if (amb.petals) {
    for (const q of petals) {
      if (q.k * 2 > amb.petalRate) continue; // denser in Japan, sparse elsewhere
      const y = wrap(q.y * H + time * q.v, H + 10) - 5;
      const x = wrap(q.x + time * q.v * 0.7 + Math.sin(time * 1.3 + q.p) * 6, W + 10) - 5;
      rect(x, y, 1, 1, amb.petals);
      if (Math.sin(time * 3 + q.p) > 0) rect(x + 1, y, 1, 1, amb.petalsHi);
    }
  }

  if (cam > 0.45 && P.landing < 1) {
    ctx.globalAlpha = Math.min(1, (cam - 0.45) / 0.3);
    const bh = L.bushes.height;
    ctx.drawImage(L.bushes, -12, H - bh + 6);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(L.bushes, -W - 12, H - bh + 8);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  const sway = Math.round(Math.sin(time * 0.8) * 1.4);
  if (P.landing < 1) ctx.drawImage(L.fore, -M + sway - Math.round(P.shift * 0.5), Math.round(-cam * 34 - 4 - P.landing * 110));
}

// A low sun on the horizon (or a moon high up on a Black Court).
function drawSun(horizon) {
  const sun = theme.backgroundPalette.sun;
  if (theme.isBlackCourt) {
    const mx = Math.round(W * 0.78 + P.shift * 0.1);
    const my = Math.round(Math.max(14, horizon * 0.3));
    ctx.globalAlpha = 0.18;
    disc(mx, my, 9, '#f4f0d8');
    ctx.globalAlpha = 1;
    disc(mx, my, 5, '#f4f0d8');
    rect(mx + 1, my - 2, 2, 1, '#d8d2b4');
    rect(mx - 2, my + 1, 1, 1, '#d8d2b4');
    return;
  }
  if (!sun) return;
  const sx = Math.round(W / 2 + sun.x + P.shift * 0.05);
  const sy = Math.round(horizon - sun.lift);
  ctx.globalAlpha = 0.22;
  disc(sx, sy, sun.r + 5, sun.glow);
  ctx.globalAlpha = 1;
  disc(sx, sy, sun.r, sun.c);
  for (let i = 2; i < sun.r; i += 3) rect(sx - sun.r, sy + i, sun.r * 2 + 1, 1, sun.band);
}

// Lighten (k > 0) or darken (k < 0) a #rrggbb colour.
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('');
}

// Chain-link fences just outside the hedge borders, and lamp posts whose
// heads glow and flicker.
const LAMPS = [8, 92, 176, 260];
function drawSides(time) {
  const a0 = ctx.globalAlpha;
  for (const side of [-1, 1]) {
    const fx = side < 0 ? -10 : WW + 10;
    const far = -14;
    const near = WH + 40;
    // Mesh: a dark see-through band between the ground and the top rail.
    const g0 = proj(fx, far);
    const g1 = proj(fx, near);
    const t0 = proj(fx, far, 12);
    const t1 = proj(fx, near, 12);
    ctx.globalAlpha = a0 * 0.32;
    ctx.fillStyle = '#0b1a12';
    ctx.beginPath();
    ctx.moveTo(g0.x, g0.y);
    ctx.lineTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(g1.x, g1.y);
    ctx.fill();
    ctx.globalAlpha = a0;
    for (let wy = far; wy <= near; wy += 22) {
      const b = proj(fx, wy);
      const t = proj(fx, wy, 12);
      line(b.x, b.y, t.x, t.y, '#1b2a22', b.s > 1 ? 2 : 1);
    }
    line(t0.x, t0.y, t1.x, t1.y, '#2b3d31', 1);
  }
  // Lamp posts, far to near so nearer ones overlap.
  for (const ly of LAMPS) {
    for (const side of [-1, 1]) {
      const lx = side < 0 ? -18 : WW + 18;
      const b = proj(lx, ly);
      const t = proj(lx, ly, 36);
      if (b.y < P.wb) continue;
      const pw = Math.max(1, Math.round(1.6 * b.s));
      rect(Math.round(b.x - pw / 2), t.y, pw, b.y - t.y, '#24221f');
      rect(Math.round(b.x - pw / 2), t.y, 1, b.y - t.y, '#4a4640');
      const hw = Math.max(2, Math.round(3 * t.s));
      const hh = Math.max(3, Math.round(5 * t.s));
      const flick = Math.sin(time * 6 + ly + side) > 0.8 ? 1 : 0;
      ctx.globalAlpha = a0 * 0.16;
      disc(t.x, t.y - hh / 2, Math.round(10 * t.s) + flick, theme.backgroundPalette.lamp);
      ctx.globalAlpha = a0 * 0.28;
      disc(t.x, t.y - hh / 2, Math.round(5 * t.s), '#ffe08a');
      ctx.globalAlpha = a0;
      rect(t.x - hw - 1, t.y - hh - 1, hw * 2 + 3, hh + 2, '#231f1a');
      rect(t.x - hw, t.y - hh, hw * 2 + 1, hh, theme.backgroundPalette.lamp);
      rect(t.x - hw + 1, t.y - hh + 1, hw * 2 - 1, hh - 2, '#fff3b8');
      rect(t.x - hw - 1, t.y - hh - 2, hw * 2 + 3, 1, '#231f1a');
    }
  }
}

// ---------------------------------------------------------------- sprites

// Block materials: the bricks on the landing screen use top/hi/front/lo;
// `bits` are the pieces that fly off a hit player (jersey, its shade, skin).
export const MAT = {
  T: { top: '#cf6f4f', hi: '#e79069', front: '#a04d37', lo: '#733324', bits: ['#e0403a', '#a82a26', '#f2c39a'] },
  L: { top: '#ece3c8', hi: '#fbf6e2', front: '#c9bd9c', lo: '#9d906d', bits: ['#f2c230', '#c08f14', '#f2c39a'] },
  H: { top: '#3f7d38', hi: '#68ab52', front: '#2b5b29', lo: '#193a1b', bits: ['#3a72d8', '#26509e', '#f2c39a'] },
  S: { top: '#454a54', hi: '#69707c', front: '#272b32', lo: '#14171b', bits: ['#8a4fd0', '#5f2f9c', '#f2c39a'] },
};

// ---------------------------------------------------------------- players
// In play the blocks are little tennis players standing on their spot: one
// 20x21 pixel sprite (plus a 1-pixel outline), scaled to the block's width.
// Every player wears the same white headband; the jersey says how many hits
// they take.

const KIT = {
  T: { c: '#e0403a', C: '#f26b5e', d: '#a82a26', L: '#ffffff' }, // red, 1 hit
  L: { c: '#f2c230', C: '#ffe07a', d: '#c08f14', L: '#28324a' }, // yellow, 1 hit
  H: { c: '#3a72d8', C: '#6b9cf0', d: '#26509e', L: '#ffffff' }, // blue, 2 hits
  S: { c: '#8a4fd0', C: '#b07ef0', d: '#5f2f9c', L: '#f2c230' }, // purple with gold trim, 3 hits
};
const PLAYER = [
  '.....oooooo.........',
  '....oOOoooooo.......',
  '...ooooooooooo..rrr.',
  '...bbbbbbbbbbb.rtttr',
  '...ossssssssso.rtttr',
  '...ossesssesso.rtttr',
  '...ossesssesso.rtttr',
  '...ospssssspso.rtttr',
  '...ossssmsssso.rtttr',
  '....SsssssssS...rrr.',
  '.......sss.......a..',
  '....CccLLLccc....g..',
  '...SCcccLcccdS...g..',
  '...sLLLLLLLLLssssss.',
  '...sCcccccccdS......',
  '....ddddddddd.......',
  '....wwwwwwwww.......',
  '....wwww.wwww.......',
  '.....kk...kk........',
  '.....qq...qq........',
  '....ffF..ffF........',
];
const SKIN = {
  o: '#2a1a12', O: '#5a3a26', b: '#f4f4ee', s: '#f2c39a', S: '#d9a074', e: '#1d1410', p: '#f09a8a', m: '#a5523c',
  w: '#f4f3ec', k: '#e5ac7c', q: '#ffffff', f: '#2e3138', F: '#6b7280', r: '#3b3f46', t: '#cfd5dc', a: '#9aa1ab', g: '#7a4a26',
};
const PW = PLAYER[0].length + 2; // with the outline
const PH = PLAYER.length + 2;
const sprites = new Map();

// v: '' as new, 'hurt' after a hit (a drop of sweat), 'hurt2' after two
// (headband gone too), 'ice' when frozen, 'flash' (white) for the hit flash.
// flip mirrors it, racket on the left.
function playerSprite(type, v, flip) {
  const key = type + v + (flip ? '<' : '>');
  let canvas = sprites.get(key);
  if (canvas) return canvas;
  const col = { ...SKIN, ...KIT[type] };
  if (v === 'hurt2') col.b = SKIN.o;
  const x = makeLayer(PW, PH);
  const at = (i) => (flip ? PLAYER[0].length - 1 - i : i) + 1;
  x.fillStyle = '#14201a'; // outline first, then the pixels over it
  PLAYER.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && x.fillRect(at(i) - 1, j, 3, 3)));
  PLAYER.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === '.') return;
      x.fillStyle = col[ch];
      x.fillRect(at(i), j + 1, 1, 1);
    }),
  );
  if (v === 'hurt' || v === 'hurt2') {
    x.fillStyle = '#9fdcff';
    x.fillRect(at(2), 5, 1, 2);
    if (v === 'hurt2') x.fillRect(at(1), 8, 1, 2);
  }
  if (v === 'ice' || v === 'flash') {
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = v === 'ice' ? 'rgba(191,232,255,0.6)' : '#ffffff';
    x.fillRect(0, 0, PW, PH);
  }
  canvas = x.canvas;
  sprites.set(key, canvas);
  return canvas;
}

// Same arguments as a brick: (xl,xr,yn) is the near ground edge, (xlf,xrf,yf)
// the far one. The player stands on the near edge, as wide as the block.
export function drawBlock(xl, xr, yn, xlf, xrf, yf, h, hf, type, seed, o = {}) {
  if (!KIT[type]) return;
  const w = xr - xl;
  if (w < 2) return;
  const sw = Math.max(3, Math.round((w * PW) / (PW - 2)));
  const sh = Math.round((sw * PH) / PW);
  const x = Math.round((xl + xr) / 2 - sw / 2);
  const y = Math.round(yn) - sh + 1;
  const flip = (seed >>> 3) % 2 === 1;
  const v = o.frozen ? 'ice' : o.damage >= 0.6 ? 'hurt2' : o.damage > 0 ? 'hurt' : '';
  ctx.drawImage(playerSprite(type, v, flip), x, y, sw, sh);
  if (o.flash > 0) {
    ctx.globalAlpha = Math.min(0.8, o.flash * 6);
    ctx.drawImage(playerSprite(type, 'flash', flip), x, y, sw, sh);
    ctx.globalAlpha = 1;
  }
}

// A brick: a cuboid seen from the front and above (the landing screen keeps
// these).  (xl,xr,yn) is the near ground edge,
// (xlf,xrf,yf) the far ground edge; h/hf are the wall heights at each edge.
export function drawBrick(xl, xr, yn, xlf, xrf, yf, h, hf, type, seed, o = {}) {
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
  // Fewer speckles on small blocks: they would not show, and big courts draw a thousand.
  const n = Math.round((leafy ? 22 : type === 'S' ? 4 : 7) * Math.min(1, (w * h) / 200));
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

// hit, right after the ball strikes: { k: 1 fading to 0, off: -1 left end ..
// 1 right end }. The racket gives like a spring: it dips and bounces back, the
// strings dent round the impact and ripple out, and the frame flashes.
export function drawPaddle(cx, y, hw, glow = false, hit = null) {
  cx = Math.round(cx);
  y = Math.round(y);
  hw = Math.round(hw);
  const k = hit ? Math.max(0, Math.min(1, hit.k)) : 0;
  const wob = k * Math.sin((1 - k) * Math.PI * 5); // a damped spring, 2.5 bounces
  const shadowY = y;
  y += Math.round(wob * 4);
  // A tennis racket lying across the paddle's width: strung head on the
  // left, throat, then the handle with its grip and a red band.
  const left = cx - hw;
  const len = hw * 2;
  const th = Math.max(7, Math.min(20, Math.round(len * 0.26))) | 1; // head height, odd for a centre line
  const mid = y - 4;
  const headW = Math.round(len * 0.44);
  const hx = left + Math.floor(headW / 2);
  const rx = Math.floor(headW / 2);
  const ry = (th - 1) / 2;
  ctx.globalAlpha = 0.32;
  rrect(left + 1, shadowY - 2, len, 6, 3, '#07140a');
  ctx.globalAlpha = 1;
  const ix = cx + Math.round((hit ? hit.off : 0) * hw); // where the ball struck
  const onHead = k > 0 && Math.abs(ix - hx) < rx - 2;
  const frame = glow ? PAL.yellowHi : k > 0.75 ? '#fff2a8' : '#e3b341';
  // Handle and shaft first, so the head sits over the join.
  const shaftL = left + headW - 2;
  const handleL = left + Math.round(len * 0.6);
  const right = left + len;
  rect(shaftL, mid - 2, handleL - shaftL, 5, '#1a1206');
  rect(shaftL, mid - 1, handleL - shaftL, 3, frame);
  rect(handleL, mid - 3, right - handleL, 7, '#1a1206');
  rect(handleL + 1, mid - 2, right - handleL - 2, 5, '#9a6a3a');
  for (let gx = handleL + 5; gx < right - 3; gx += 3) rect(gx, mid - 2, 1, 5, '#6e4724'); // grip wrap
  rect(handleL + 1, mid - 2, 2, 5, '#c8352e'); // red band
  rect(right - 3, mid - 2, 2, 5, '#e3b341'); // butt cap
  rect(handleL + 1, mid - 2, right - handleL - 2, 1, 'rgba(255,255,255,0.18)');
  // Head: dark rim, gold frame, strung face.
  ellipse(hx, mid, rx + 1, ry + 1, '#1a1206');
  ellipse(hx, mid, rx, ry, frame);
  ellipse(hx, mid, rx - 2, ry - 2, '#262b31');
  // Strings. Struck, they dent round the impact (most at the point, less
  // further off) and spring back with the racket, lit up where the ball hit.
  const spread = Math.max(4, rx * 0.45);
  const dent = (x) => (onHead ? wob * Math.max(3, ry * 0.6) * Math.exp(-((x - ix) * (x - ix)) / (spread * spread)) : 0);
  const lit = (x) => onHead && k > 0.3 && Math.abs(x - ix) < spread * 0.8;
  for (let dx = -rx + 3; dx <= rx - 3; dx += 2) {
    const half = Math.floor((ry - 2) * Math.sqrt(Math.max(0, 1 - (dx * dx) / ((rx - 2) * (rx - 2)))));
    if (half <= 0) continue;
    const x = hx + dx;
    const sag = Math.round(dent(x));
    ctx.fillStyle = lit(x) ? '#eef3f8' : '#8b939e';
    ctx.fillRect(x, mid - half + Math.max(0, sag), 1, half * 2 + 1 - Math.abs(sag));
  }
  for (let dy = -ry + 3; dy <= ry - 3; dy += 2) {
    const half = Math.floor((rx - 2) * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry - 2) * (ry - 2)))));
    if (half <= 0) continue;
    if (!onHead) {
      ctx.fillStyle = '#8b939e';
      ctx.fillRect(hx - half, mid + dy, half * 2 + 1, 1);
      continue;
    }
    // Pixel by pixel, so the string can bow.
    const edge = 1 - Math.abs(dy) / ry; // the middle strings give the most
    for (let x = hx - half; x <= hx + half; x++) {
      ctx.fillStyle = lit(x) ? '#eef3f8' : '#8b939e';
      ctx.fillRect(x, mid + dy + Math.round(dent(x) * edge), 1, 1);
    }
  }
  if (k > 0) {
    // A ring rippling out from the strike, and a few lines of force under it.
    const r = 2 + (1 - k) * (onHead ? rx * 0.9 : 8);
    ctx.globalAlpha = k * 0.9;
    ctx.fillStyle = '#fff6c8';
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2;
      ctx.fillRect(Math.round(ix + Math.cos(t) * r), Math.round(mid + Math.sin(t) * r * 0.55), 1, 1);
    }
    if (k > 0.45) {
      ctx.fillStyle = '#ffffff';
      for (const d of [-4, 0, 4]) ctx.fillRect(ix + d, mid + ry + 3 + Math.round((1 - k) * 4), 1, 3);
    }
    ctx.globalAlpha = 1;
  }
  rect(hx - Math.round(rx * 0.5), mid - ry, Math.round(rx), 1, glow ? '#fff6c8' : '#f6d77a'); // shine on the frame
}
