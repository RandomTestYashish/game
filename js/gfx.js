// Low-resolution pixel canvas, drawing primitives, bitmap font and icon sprites.

export let W = 240;
export let H = 270;
export let ctx = null;

let main = null;
let canvasEl = null;

export function initCanvas(canvas) {
  canvasEl = canvas;
  canvas.width = W;
  canvas.height = H;
  main = canvas.getContext('2d', { alpha: false });
  main.imageSmoothingEnabled = false;
  ctx = main;
}

export function setSize(w, h) {
  W = w;
  H = h;
  canvasEl.width = w;
  canvasEl.height = h;
  main.imageSmoothingEnabled = false;
}

export function setTarget(c) {
  ctx = c || main;
}

export function makeLayer(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return x;
}

export const PAL = {
  frame: '#0c1f16',
  panel: '#10261b',
  panelHi: '#1a3a28',
  cream: '#efe6c8',
  creamLo: '#cbbd92',
  creamSpeck: '#e2d7b2',
  ink: '#16241a',
  yellow: '#f5e663',
  yellowHi: '#fbf3a0',
  yellowLo: '#b9a93a',
  white: '#f4f1de',
  dim: '#8fa48c',
  ice: '#bfe8ff',
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = (t) => {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeBack = (t) => {
  t = clamp(t, 0, 1);
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

// ---------------------------------------------------------------- primitives

export function rect(x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function disc(cx, cy, r, c) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  ctx.fillStyle = c;
  const rr = (r + 0.4) * (r + 0.4);
  const n = Math.ceil(r);
  for (let dy = -n; dy <= n; dy++) {
    const q = rr - dy * dy;
    if (q < 0) continue;
    const hw = Math.floor(Math.sqrt(q));
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

export function ring(cx, cy, r, c) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  ctx.fillStyle = c;
  const steps = Math.ceil(r * 9);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}

export function ellipse(cx, cy, rx, ry, c) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  ctx.fillStyle = c;
  const n = Math.ceil(ry);
  for (let dy = -n; dy <= n; dy++) {
    const q = 1 - (dy * dy) / ((ry + 0.4) * (ry + 0.4));
    if (q < 0) continue;
    const hw = Math.floor(Math.sqrt(q) * rx);
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

export function line(x0, y0, x1, y1, c, thick = 1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  ctx.fillStyle = c;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 2000; guard++) {
    ctx.fillRect(x0, y0, thick, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// Scanline trapezoid between two horizontal edges.
export function trap(yT, xlT, xrT, yB, xlB, xrB, c) {
  yT = Math.round(yT);
  yB = Math.round(yB);
  ctx.fillStyle = c;
  const n = yB - yT;
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    const xl = Math.round(lerp(xlT, xlB, t));
    const xr = Math.round(lerp(xrT, xrB, t));
    ctx.fillRect(xl, yT + i, xr - xl, 1);
  }
}

export function rrect(x, y, w, h, r, c) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  r = Math.min(r, Math.floor(h / 2), Math.floor(w / 2));
  ctx.fillStyle = c;
  for (let i = 0; i < h; i++) {
    const k = i < r ? r - i - 0.5 : i >= h - r ? i - (h - r) + 0.5 : 0;
    const inset = k ? Math.round(r - Math.sqrt(Math.max(0, r * r - k * k))) : 0;
    ctx.fillRect(x + inset, y + i, w - inset * 2, 1);
  }
}

export function checker(x, y, w, h, c, phase = 0) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = c;
  for (let j = 0; j < h; j++) {
    for (let i = (j + phase + x + y) & 1; i < w; i += 2) ctx.fillRect(x + i, y + j, 1, 1);
  }
}

// ---------------------------------------------------------------- bitmap font

const FONT = {
  A: '.XXX./X...X/X...X/XXXXX/X...X/X...X/X...X',
  B: 'XXXX./X...X/X...X/XXXX./X...X/X...X/XXXX.',
  C: '.XXX./X...X/X..../X..../X..../X...X/.XXX.',
  D: 'XXXX./X...X/X...X/X...X/X...X/X...X/XXXX.',
  E: 'XXXXX/X..../X..../XXXX./X..../X..../XXXXX',
  F: 'XXXXX/X..../X..../XXXX./X..../X..../X....',
  G: '.XXX./X...X/X..../X.XXX/X...X/X...X/.XXXX',
  H: 'X...X/X...X/X...X/XXXXX/X...X/X...X/X...X',
  I: 'XXX/.X./.X./.X./.X./.X./XXX',
  J: '..XXX/...X./...X./...X./...X./X..X./.XX..',
  K: 'X...X/X..X./X.X../XX.../X.X../X..X./X...X',
  L: 'X..../X..../X..../X..../X..../X..../XXXXX',
  M: 'X...X/XX.XX/X.X.X/X.X.X/X...X/X...X/X...X',
  N: 'X...X/XX..X/X.X.X/X..XX/X...X/X...X/X...X',
  O: '.XXX./X...X/X...X/X...X/X...X/X...X/.XXX.',
  P: 'XXXX./X...X/X...X/XXXX./X..../X..../X....',
  Q: '.XXX./X...X/X...X/X...X/X.X.X/X..X./.XX.X',
  R: 'XXXX./X...X/X...X/XXXX./X.X../X..X./X...X',
  S: '.XXXX/X..../X..../.XXX./....X/....X/XXXX.',
  T: 'XXXXX/..X../..X../..X../..X../..X../..X..',
  U: 'X...X/X...X/X...X/X...X/X...X/X...X/.XXX.',
  V: 'X...X/X...X/X...X/X...X/X...X/.X.X./..X..',
  W: 'X...X/X...X/X...X/X.X.X/X.X.X/XX.XX/X...X',
  X: 'X...X/X...X/.X.X./..X../.X.X./X...X/X...X',
  Y: 'X...X/X...X/.X.X./..X../..X../..X../..X..',
  Z: 'XXXXX/....X/...X./..X../.X.../X..../XXXXX',
  0: '.XXX./X...X/X..XX/X.X.X/XX..X/X...X/.XXX.',
  1: '.X./XX./.X./.X./.X./.X./XXX',
  2: '.XXX./X...X/....X/...X./..X../.X.../XXXXX',
  3: 'XXXX./....X/....X/.XXX./....X/....X/XXXX.',
  4: '...X./..XX./.X.X./X..X./XXXXX/...X./...X.',
  5: 'XXXXX/X..../XXXX./....X/....X/X...X/.XXX.',
  6: '.XXX./X..../X..../XXXX./X...X/X...X/.XXX.',
  7: 'XXXXX/....X/...X./..X../.X.../.X.../.X...',
  8: '.XXX./X...X/X...X/.XXX./X...X/X...X/.XXX.',
  9: '.XXX./X...X/X...X/.XXXX/....X/....X/.XXX.',
  ' ': '.../.../.../.../.../.../...',
  '.': './././././X/X',
  ',': '../../../../../.X/X.',
  ':': './X/X/././X/X',
  '!': 'X/X/X/X/X/./X',
  '?': '.XXX./X...X/....X/...X./..X../...../..X..',
  '-': '..../..../..../XXXX/..../..../....',
  '+': '...../..X../..X../XXXXX/..X../..X../.....',
  '=': '..../..../XXXX/..../XXXX/..../....',
  '/': '....X/....X/...X./..X../.X.../X..../X....',
  "'": 'X/X/././././.',
  '%': 'XX..X/XX..X/...X./..X../.X.../X..XX/X..XX',
  '<': '...X/..X./.X../X.../.X../..X./...X',
  '>': 'X.../.X../..X./...X/..X./.X../X...',
  '*': '...../..X../X.X.X/.XXX./X.X.X/..X../.....',
};
for (const k in FONT) FONT[k] = FONT[k].split('/');

export function textW(str, scale = 1, sp = 1) {
  str = String(str).toUpperCase();
  let w = 0;
  for (const ch of str) w += ((FONT[ch] || FONT['?'])[0].length + sp) * scale;
  return Math.max(0, w - sp * scale);
}

function glyphs(str, x, y, c, sc, sp) {
  ctx.fillStyle = c;
  for (const ch of str) {
    const g = FONT[ch] || FONT['?'];
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      for (let i = 0; i < row.length; i++) {
        if (row[i] === 'X') ctx.fillRect(x + i * sc, y + r * sc, sc, sc);
      }
    }
    x += (g[0].length + sp) * sc;
  }
}

// Break a string into lines no wider than maxW (bitmap font, scale 1).
export function wrap(str, maxW) {
  const lines = [];
  let cur = '';
  for (const word of String(str).split(' ')) {
    const next = cur ? cur + ' ' + word : word;
    if (cur && textW(next) > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// opts: scale, sp (letter spacing), align ('left' | 'center' | 'right'), shadow
export function text(str, x, y, c, o = {}) {
  const sc = o.scale || 1;
  const sp = o.sp ?? 1;
  str = String(str).toUpperCase();
  const w = textW(str, sc, sp);
  if (o.align === 'center') x -= w / 2;
  else if (o.align === 'right') x -= w;
  x = Math.round(x);
  y = Math.round(y);
  if (o.shadow) glyphs(str, x, y + sc, o.shadow, sc, sp);
  glyphs(str, x, y, c, sc, sp);
  return w;
}

// ---------------------------------------------------------------- pixel serif
// Display type: a system serif rasterised small and thresholded into hard pixels.

const serifCache = new Map();
const SERIF = "bold %px Georgia, 'Times New Roman', Times, serif";
// Georgia's numerals are old-style (they dip below the baseline); use lining figures.
const SERIF_DIGITS = "bold %px 'Times New Roman', Times, serif";

function serifGlyph(ch, size, color) {
  const key = ch + '|' + size + '|' + color;
  let g = serifCache.get(key);
  if (g) return g;
  const font = (ch >= '0' && ch <= '9' ? SERIF_DIGITS : SERIF).replace('%', size);
  const probe = makeLayer(4, 4);
  probe.font = font;
  const adv = Math.max(1, Math.round(probe.measureText(ch).width));
  const pad = 2;
  const lay = makeLayer(adv + pad * 2 + 2, Math.ceil(size * 1.45));
  lay.font = font;
  lay.textBaseline = 'alphabetic';
  lay.fillStyle = '#fff';
  lay.fillText(ch, pad, size);
  const img = lay.getImageData(0, 0, lay.canvas.width, lay.canvas.height);
  const d = img.data;
  const r = parseInt(color.slice(1, 3), 16);
  const gg = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] > 105;
    d[i] = r;
    d[i + 1] = gg;
    d[i + 2] = b;
    d[i + 3] = on ? 255 : 0;
  }
  lay.putImageData(img, 0, 0);
  g = { canvas: lay.canvas, adv, pad };
  serifCache.set(key, g);
  return g;
}

export function serifW(str, size, sp = 0) {
  let w = 0;
  for (const ch of String(str)) w += serifGlyph(ch, size, '#ffffff').adv + sp;
  return w - sp;
}

// y is the top of the capital letters. opts: align, sp, shadow
export function serif(str, x, y, size, color, o = {}) {
  str = String(str);
  const sp = o.sp || 0;
  const w = serifW(str, size, sp);
  if (o.align === 'center') x -= w / 2;
  else if (o.align === 'right') x -= w;
  x = Math.round(x);
  const top = Math.round(y + Math.round(size * 0.7) - size);
  for (const ch of str) {
    if (o.shadow) {
      const s = serifGlyph(ch, size, o.shadow);
      ctx.drawImage(s.canvas, x - s.pad, top + Math.max(1, Math.round(size / 14)));
    }
    const g = serifGlyph(ch, size, color);
    ctx.drawImage(g.canvas, x - g.pad, top);
    x += g.adv + sp;
  }
  return w;
}

// ---------------------------------------------------------------- icons

const ICONS = {
  shield: '.#########./.#########./.####.####./.###...###./.####.####./.#########./..#######../..#######../...#####.../....###..../.....#.....',
  multiball: '....###..../...#####.../...#####.../....###..../.........../.###...###./#####.#####/#####.#####/#####.#####/.###...###./...........',
  smash: '.....#...../.....#...../..#.###.#../...#####.../..#######../###########/..#######../...#####.../..#.###.#../.....#...../.....#.....',
  freeze: '.....#...../...#.#.#.../....###..../.#...#...#./#.#..#..#.#/.#########./#.#..#..#.#/.#...#...#./....###..../...#.#.#.../.....#.....',
  expand: '.........../.........../..#.....#../.##.....##./###########/###########/.##.....##./..#.....#../.........../.........../...........',
  lowgrav: '.........../....###..../...#####..#/..#######.#/..######.#./..####.###./.#.#.#####./#.#######../#..#####.../....###..../...........',
  replay: '...#####.#./..##...###./.##...####./.#........./.#.......#./.#.......#./.##.....##./..##...##../...#####.../.........../...........',
  home: '.....#...../....###..../...#####.../..#######../.#########./###########/..#######../..###.###../..###.###../..###.###../...........',
  next: '.........../..##......./..####...../..######.../..########./..#########/..########./..######.../..####...../..##......./...........',
  back: '.........../....#....../...##....../..###....../.##########/###########/.##########/..###....../...##....../....#....../...........',
  pause: '.........../..###.###../..###.###../..###.###../..###.###../..###.###../..###.###../..###.###../..###.###../.........../...........',
  sound: '.....#...../....##..#../...###...#./######.#.#./######.#.#./######.#.#./######.#.#./...###...#./....##..#../.....#...../...........',
  lock: '...#####.../..##...##../..#.....#../..#.....#../.#########./.#########./.####.####./.####.####./.#########./.#########./...........',
  star: '.....#...../.....#...../....###..../.#########./..#######../...#####.../...#####.../..###.###../..#.....#../.........../...........',
};
for (const k in ICONS) ICONS[k] = ICONS[k].split('/');

export function icon(name, x, y, c, scale = 1) {
  const g = ICONS[name];
  if (!g) return;
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = c;
  for (let r = 0; r < g.length; r++) {
    const row = g[r];
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '#') ctx.fillRect(x + i * scale, y + r * scale, scale, scale);
    }
  }
}
