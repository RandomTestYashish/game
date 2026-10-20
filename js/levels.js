// Level data: five hand-made courts, then generated ones up to COUNT.
// Courts come in steps of four: every court in a step has the same block
// size and the same number of blocks, and each step has more, smaller ones
// (24 blocks 28 wide on courts 1-4, up to 82 blocks 18 wide; see grid()).
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

export const STEP = 4;

// Block size, grid width and block count for court n (0-based). All change
// once every STEP courts: smaller blocks, so more fit across the court.
export function grid(n) {
  const k = Math.floor(n / STEP);
  const t = k / (Math.ceil(COUNT / STEP) - 1);
  const cell = 28 - 10 * t; // 28 wide on courts 1-4, 18 on the last step
  const row = 20 - 6 * t; // 20 deep, down to 14
  const cols = Math.min(10, Math.floor(196 / cell));
  const most = Math.min(9, Math.floor(150 / row)); // rows that fit before the paddle's space
  return { cell, row, cols, most, blocks: 24 + 2 * k };
}

// Deterministic hash -> [0, 1), so every device generates the same courts.
function hash(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Add or take away blocks until the court has exactly `want`. Cells are
// visited in a fixed hashed order and changed in mirrored pairs where that
// fits, so courts stay symmetrical; the outer cells of sliding rows stay empty.
function fit(cells, want, move, n) {
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
      const free = (x) => cells[r][x] === '.' && !(move.includes(r) && (x === 0 || x === C - 1));
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
  // Enough rows to hold this step's blocks, plus room for sliding rows.
  const R = Math.max(4, Math.min(most, Math.max(4 + Math.floor(hash(n, 1, 1) * 1.6 + hard * 4.6), Math.ceil((blocks + 6) / C))));
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

  // A shape far too sparse for this step starts from a filled field instead.
  let cells = build(SHAPES[Math.floor(hash(n, 4, 4) * SHAPES.length)]);
  let move = slide(cells);
  if (cells.flat().filter((c) => c !== '.').length < blocks / 2) {
    cells = build(SHAPES[0]);
    move = slide(cells);
  }
  fit(cells, blocks, move, n);

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
    // The hand-made courts are trimmed or topped up to their step's count too.
    const cells = lv.rows.map((r) => r.split(''));
    fit(cells, lv.blocks, lv.move || [], n);
    lv.rows = cells.map((r) => r.join(''));
  }
  lv.speed = Math.round(168 + n * 1.15);
  lv.paddle = Math.max(36, Math.round(52 - n * 0.14));
  lv.drop = Math.max(0.09, 0.16 - n * 0.0006);
  lv.wave = 1.5 + hash(n, 8, 8) * 2;
  LEVELS.push(lv);
}
