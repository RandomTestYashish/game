// Level data: five hand-made courts, then generated ones up to COUNT.
// Every court has more, smaller blocks than the one before: 24 blocks 28
// wide on court 1, up to 1000 blocks about 5 wide on court 120 (see grid()).
//   T terracotta (1 hit)   L limestone (1 hit)
//   H hedge (2 hits)       S slate slab (3 hits)
// Per level:
//   move   row indexes that slide side to side (their outer cells stay empty)
//   speed  ball speed, paddle  paddle width, drop  chance a block drops a tool
//   drift  how far the formation advances toward the player and back
//   wave   height of the floating motion

import { PADDLE_Y } from './game.js';

export const COUNT = 120;

const HAND = [
  { id: 'baseline', name: 'BASELINE', rows: ['.TTTTT.', 'LLLLLLL', 'THTLTHT', '.LLLLL.'] },
  { id: 'topiary', name: 'TOPIARY', rows: ['...H...', '..HLH..', '.HLTLH.', 'HLT.TLH', '.HLTLH.', '..HLH..'] },
  { id: 'terrace', name: 'TERRACE', rows: ['SS.T.SS', '.LLLLL.', 'TTHHHTT', '.......', '.TLHLT.', 'LL...LL'], move: [1, 4] },
  { id: 'colonnade', name: 'COLONNADE', rows: ['LSLSLSL', 'T.T.T.T', 'H.H.H.H', 'T.T.T.T', '.HLTLH.', 'S..L..S'], move: [4] },
  { id: 'grandslam', name: 'GRAND SLAM', rows: ['HSHSHSH', '.TLTLT.', 'LHTSTHL', '.LTLTL.', 'THLHLHT', '.S...S.'], move: [1, 3] },
];

const ADJ = ['EMERALD', 'GOLDEN', 'SILENT', 'ROYAL', 'MIDNIGHT', 'IVORY', 'WILD', 'AMBER', 'SECRET', 'GRAND', 'CRIMSON', 'VELVET'];
const NOUN = ['LAWN', 'GARDEN', 'TERRACE', 'ARCADE', 'PAVILION', 'ORCHARD', 'CLOISTER', 'PROMENADE', 'CONSERVATORY', 'FINAL'];

// Shapes, as functions of column, row, row count and column count. d is the
// distance from the middle column, scaled so shapes keep their look on
// wider grids (d runs 0-3 whatever the width).
const SHAPES = [
  () => true,
  (c, r) => (c + r) % 2 === 0,
  (c, r, R, d) => d + (Math.abs(r - (R - 1) / 2) * 7) / R <= 3.5,
  (c, r, R, d) => d <= (r * 6) / Math.max(1, R - 1),
  (c, r, R, d) => d <= ((R - 1 - r) * 6) / Math.max(1, R - 1),
  (c) => c % 2 === 0,
  (c, r) => r % 2 === 0,
  (c, r, R, d, C) => c === 0 || c === C - 1 || r === 0 || r === R - 1,
  (c, r, R, d, C) => Math.abs(c - (C - 1) / 2) < 1 || r === Math.floor(R / 2) || ((c === 1 || c === C - 2) && r % 2 === 0),
  (c, r, R, d) => d >= ((Math.abs(r - (R - 1) / 2) * 7) / R) * 0.9,
  (c, r, R, d, C) => Math.round(Math.abs(c - (C - 1) / 2)) % 2 === r % 2,
  (c, r, R, d) => Math.abs(d - 1.5) + (Math.abs(r - (R - 1) / 2) * 7) / R <= 2.2,
];

export const MAX_BLOCKS = 1000;
// The formation's depth. Everything stays in the first FIELD units past the
// far wall, plus any drift, so there is always room to see the ball coming:
// at least ROOM units between the deepest block and the paddle.
const FIELD = 118;
export const ROOM = 58;

// Block count, block size and grid size for court n (0-based). The count
// grows on every court, from 24 to MAX_BLOCKS on the last one, and the blocks
// shrink to make room: the grid has a little over twice as many cells as
// there are blocks (the empty lanes between groups take some), inside a field
// 196 wide and FIELD deep.
export function grid(n) {
  const blocks = 24 + Math.round(((MAX_BLOCKS - 24) * n) / (COUNT - 1));
  const room = 1.8 + 0.6 * Math.max(0, 1 - blocks / 200); // small courts lose more of their grid to lanes
  const cell = Math.min(28, Math.sqrt((196 * FIELD) / (0.72 * room * blocks)));
  const row = Math.min(20, cell * 0.72);
  let cols = Math.floor(196 / cell);
  if (n < HAND.length && cols % 2 === 0) cols--; // the 7-wide hand-made designs stay centred
  const most = Math.floor(FIELD / row); // rows that fit before the paddle's space
  return { cell, row, cols, most, blocks };
}

// Deterministic hash -> [0, 1), so every device generates the same courts.
function hash(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Bricks come in groups: empty lanes, one cell wide, split the court into
// blocks of bricks. Lane columns are counted from both edges, so the groups
// mirror left and right; lane rows split it front to back.
function lanes(C, R) {
  const gw = Math.max(2, Math.round(C / 5)); // group width, in cells
  const gh = Math.max(2, Math.round(R / 3)); // group depth, in rows
  return (r, c) => Math.min(c, C - 1 - c) % (gw + 1) === gw || (r % (gh + 1) === gh && r < R - 1);
}

// Make the court grouped and holding exactly `want` blocks: add empty rows at
// the back until the groups have room, clear the lanes, then fit().
function groupUp(cells, want, move, n, most) {
  const C = cells[0].length;
  const room = (R) => {
    const lane = lanes(C, R);
    let k = 0;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!lane(r, c) && !(move.includes(r) && (c === 0 || c === C - 1))) k++;
    return k;
  };
  while (cells.length < most && room(cells.length) < want) cells.push(Array(C).fill('.'));
  const lane = lanes(C, cells.length);
  cells.forEach((row, r) => row.forEach((_, c) => lane(r, c) && (row[c] = '.')));
  fit(cells, want, move, n, lane);
}

// Add or take away blocks until the court has exactly `want`. Cells are
// visited in a fixed hashed order and changed in mirrored pairs where that
// fits, so courts stay symmetrical; the outer cells of sliding rows and the
// lanes between groups stay empty.
function fit(cells, want, move, n, lane = () => false) {
  const R = cells.length;
  const C = cells[0].length;
  let have = cells.flat().filter((c) => c !== '.').length;
  const order = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) order.push([r, c, hash(n, r + 90, c + 90)]);
  order.sort((a, b) => a[2] - b[2]);
  const near = (r, c) => {
    for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const v = cells[r + dr] && cells[r + dr][c + dc];
      if (v && v !== '.') return v;
    }
    return r % 2 ? 'L' : 'T';
  };
  for (const pairs of [true, false]) {
    for (const [r, c] of order) {
      const diff = want - have;
      if (diff === 0) return;
      const m = C - 1 - c;
      if (pairs && m < c) continue; // each pair once, from its left cell
      const spots = pairs && m !== c ? [c, m] : [c];
      if (spots.length > Math.abs(diff)) continue;
      const add = diff > 0;
      const free = (x) => cells[r][x] === '.' && !lane(r, x) && !(move.includes(r) && (x === 0 || x === C - 1));
      if (!spots.every((x) => (add ? free(x) : cells[r][x] !== '.'))) continue;
      const type = add && near(r, c);
      for (const x of spots) cells[r][x] = add ? type : '.';
      have += add ? spots.length : -spots.length;
    }
  }
}

function generate(n) {
  const hard = n / (COUNT - 1);
  const { cols: C, most, blocks } = grid(n);
  // A starting depth; groupUp() adds rows at the back if the groups need them.
  const R = Math.max(4, Math.min(most, Math.max(4 + Math.floor(hash(n, 1, 1) * 1.6 + hard * 4.6), Math.ceil((blocks * 1.6) / C))));
  const mid = (C - 1) / 2;
  const scheme = Math.floor(hash(n, 2, 2) * 4);
  const holes = hash(n, 3, 3) * 0.14;

  const build = (shape) => {
    const grid = [];
    for (let r = 0; r < R; r++) {
      const row = [];
      for (let c = 0; c < C; c++) {
        const m = Math.min(c, C - 1 - c); // mirror left and right
        const d = (Math.abs(c - mid) * 3) / mid;
        if (!shape(c, r, R, d, C) || hash(n, m + 10, r + 10) < holes) {
          row.push('.');
          continue;
        }
        const band = [r, Math.round(d), Math.round(d) + r, Math.floor(hash(n, m + 40, r + 40) * 9)][scheme];
        const roll = hash(n, m + 70, r + 70);
        // Tougher blocks grow slowly: by court 120 about 1 in 6 takes three
        // hits and 1 in 3 two (was 1 in 3 and 1 in 2).
        const slate = 0.03 + hard * 0.14;
        row.push(roll < slate ? 'S' : roll < slate + 0.18 + hard * 0.14 ? 'H' : band % 2 ? 'L' : 'T');
      }
      grid.push(row);
    }
    return grid;
  };

  // Pick rows to slide, clearing their outer cells so they have room.
  const slide = (grid) => {
    const move = [];
    const want = Math.min(3, 1 + Math.floor(hard * 3 + hash(n, 5, 5)));
    for (let k = 0; k < R && move.length < want; k++) {
      const r = Math.floor(hash(n, 6, k) * R);
      if (move.includes(r) || grid[r].slice(1, C - 1).filter((c) => c !== '.').length < 2) continue;
      grid[r][0] = '.';
      grid[r][C - 1] = '.';
      move.push(r);
    }
    return move;
  };

  // A shape far too sparse for this court starts from a filled field instead.
  let cells = build(SHAPES[Math.floor(hash(n, 4, 4) * SHAPES.length)]);
  let move = slide(cells);
  if (cells.flat().filter((c) => c !== '.').length < blocks / 2) {
    cells = build(SHAPES[0]);
    move = slide(cells);
  }
  groupUp(cells, blocks, move, n, most);

  return {
    id: 'court' + (n + 1),
    name: ADJ[n % ADJ.length] + ' ' + NOUN[Math.floor(n / ADJ.length)],
    rows: cells.map((row) => row.join('')),
    move,
    drift: n >= 8 && hash(n, 7, 7) < 0.6 ? Math.round(3 + hard * 8) : 0,
  };
}

export const LEVELS = [];
for (let n = 0; n < COUNT; n++) {
  const lv = n < HAND.length ? { ...HAND[n] } : generate(n);
  Object.assign(lv, grid(n));
  if (n < HAND.length) {
    // The hand-made courts are grouped and topped up to their court's count
    // too: the drawn pattern stays in the middle, widened as needed.
    const side = Math.max(0, lv.cols - 7);
    const pad = (r) => '.'.repeat(Math.floor(side / 2)) + r + '.'.repeat(side - Math.floor(side / 2));
    const cells = lv.rows.map((r) => pad(r).split(''));
    groupUp(cells, lv.blocks, lv.move || [], n, lv.most);
    lv.rows = cells.map((r) => r.join(''));
  }
  // Gentle growth: court 120 serves at 220 (was 305), which stays playable
  // with up to 1000 small blocks; the paddle narrows only a little.
  lv.speed = Math.round(165 + n * 0.46);
  lv.paddle = Math.max(42, Math.round(52 - n * 0.085));
  lv.drop = Math.max(0.09, 0.16 - n * 0.0006);
  lv.wave = 1.5 + hash(n, 8, 8) * 2;
  // The drift toward the player never eats into the ROOM in front of the paddle.
  const R = lv.rows.length;
  const bottom = 30 + Math.max(0, 6 - R) * 6 + R * lv.row;
  lv.drift = Math.max(0, Math.min(lv.drift || 0, Math.floor(PADDLE_Y - ROOM - bottom)));
  LEVELS.push(lv);
}
