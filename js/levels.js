// Level data: five hand-made courts, then generated ones up to COUNT.
// Each row is 7 cells wide, at most 7 rows.
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

// Shapes, as functions of column (0-6), row and row count.
const SHAPES = [
  () => true,
  (c, r) => (c + r) % 2 === 0,
  (c, r, R) => Math.abs(c - 3) + Math.abs(r - (R - 1) / 2) <= 3.5,
  (c, r) => Math.abs(c - 3) <= r,
  (c, r, R) => Math.abs(c - 3) <= R - 1 - r,
  (c) => c % 2 === 0,
  (c, r) => r % 2 === 0,
  (c, r, R) => c === 0 || c === 6 || r === 0 || r === R - 1,
  (c, r, R) => c === 3 || r === Math.floor(R / 2) || ((c === 1 || c === 5) && r % 2 === 0),
  (c, r, R) => Math.abs(c - 3) >= Math.abs(r - (R - 1) / 2) * 0.9,
  (c, r) => Math.abs(c - 3) % 2 === r % 2,
  (c, r, R) => Math.abs(Math.abs(c - 3) - 1.5) + Math.abs(r - (R - 1) / 2) <= 2.2,
];

// Deterministic hash -> [0, 1), so every device generates the same courts.
function hash(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function generate(n) {
  const hard = n / (COUNT - 1);
  const R = Math.max(4, Math.min(7, 4 + Math.floor(hash(n, 1, 1) * 1.6 + hard * 2.6)));
  const scheme = Math.floor(hash(n, 2, 2) * 4);
  const holes = hash(n, 3, 3) * 0.14;

  const build = (shape) => {
    const grid = [];
    for (let r = 0; r < R; r++) {
      const row = [];
      for (let c = 0; c < 7; c++) {
        const m = Math.min(c, 6 - c); // mirror left and right
        if (!shape(c, r, R) || hash(n, m + 10, r + 10) < holes) {
          row.push('.');
          continue;
        }
        const band = [r, Math.abs(c - 3), Math.abs(c - 3) + r, Math.floor(hash(n, m + 40, r + 40) * 9)][scheme];
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
      if (move.includes(r) || grid[r].slice(1, 6).filter((c) => c !== '.').length < 2) continue;
      grid[r][0] = '.';
      grid[r][6] = '.';
      move.push(r);
    }
    return move;
  };

  let grid = build(SHAPES[Math.floor(hash(n, 4, 4) * SHAPES.length)]);
  let move = slide(grid);
  if (grid.flat().filter((c) => c !== '.').length < 14) {
    // Too sparse to be a court: fall back to a filled field.
    grid = build(SHAPES[0]);
    move = slide(grid);
  }

  return {
    id: 'court' + (n + 1),
    name: ADJ[n % ADJ.length] + ' ' + NOUN[Math.floor(n / ADJ.length)],
    rows: grid.map((row) => row.join('')),
    move,
    drift: n >= 8 && hash(n, 7, 7) < 0.6 ? Math.round(3 + hard * 8) : 0,
  };
}

export const LEVELS = [];
for (let n = 0; n < COUNT; n++) {
  const lv = n < HAND.length ? { ...HAND[n] } : generate(n);
  lv.speed = Math.round(168 + n * 1.15);
  lv.paddle = Math.max(36, Math.round(52 - n * 0.14));
  lv.drop = Math.max(0.09, 0.16 - n * 0.0006);
  lv.wave = 1.5 + hash(n, 8, 8) * 2;
  LEVELS.push(lv);
}
