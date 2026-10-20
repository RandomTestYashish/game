// Level data: five hand-made courts, then generated ones up to COUNT.
// Blocks shrink court by court and the grid grows to fill the space: 7 cells
// by up to 7 rows on court 1, up to 10 by 9 on court 120 (see grid()).
//   T terracotta (1 hit)   L limestone (1 hit)
//   H hedge (2 hits)       S slate slab (3 hits)
// Per level:
//   move   row indexes that slide side to side (their outer cells stay empty)
//   speed  ball speed, paddle  paddle width, drop  chance a block drops a tool
//   drift  how far the formation advances toward the player and back
//   wave   height of the floating motion

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

// Block size and grid width for court n (0-based). Cells shrink a little on
// every court; as they do, more of them fit across the court.
export function grid(n) {
  const t = n / (COUNT - 1);
  const cell = 28 - 10 * t; // 28 wide on court 1, 18 on court 120
  const row = 20 - 5 * t; // 20 deep, down to 15
  const cols = Math.min(10, Math.floor(196 / cell));
  return { cell, row, cols };
}

// Deterministic hash -> [0, 1), so every device generates the same courts.
function hash(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function generate(n) {
  const hard = n / (COUNT - 1);
  const C = grid(n).cols;
  const R = Math.max(4, Math.min(9, 4 + Math.floor(hash(n, 1, 1) * 1.6 + hard * 4.6)));
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
        const slate = 0.04 + hard * 0.3;
        row.push(roll < slate ? 'S' : roll < slate + 0.2 + hard * 0.22 ? 'H' : band % 2 ? 'L' : 'T');
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

  // Courts get fuller as they go: a shape too sparse for this court falls
  // back to a filled field.
  const least = Math.round(14 + hard * 40);
  let cells = build(SHAPES[Math.floor(hash(n, 4, 4) * SHAPES.length)]);
  let move = slide(cells);
  if (cells.flat().filter((c) => c !== '.').length < least) {
    cells = build(SHAPES[0]);
    move = slide(cells);
  }

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
  lv.speed = Math.round(168 + n * 1.15);
  lv.paddle = Math.max(36, Math.round(52 - n * 0.14));
  lv.drop = Math.max(0.09, 0.16 - n * 0.0006);
  lv.wave = 1.5 + hash(n, 8, 8) * 2;
  LEVELS.push(lv);
}
