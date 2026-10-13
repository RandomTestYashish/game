// Level data. Each row is 7 cells wide, at most 6 rows.
//   T terracotta (1 hit)   L limestone (1 hit)
//   H hedge (2 hits)       S slate slab (3 hits)
// `move` lists row indexes that slide side to side; those rows keep their
// outer cells empty so they have room to travel.

export const LEVELS = [
  {
    id: 'baseline',
    name: 'BASELINE',
    speed: 132,
    rows: ['.TTTTT.', 'LLLLLLL', 'THTLTHT', '.LLLLL.'],
  },
  {
    id: 'topiary',
    name: 'TOPIARY',
    speed: 142,
    rows: ['...H...', '..HLH..', '.HLTLH.', 'HLT.TLH', '.HLTLH.', '..HLH..'],
  },
  {
    id: 'terrace',
    name: 'TERRACE',
    speed: 152,
    rows: ['SS.T.SS', '.LLLLL.', 'TTHHHTT', '.......', '.TLHLT.', 'LL...LL'],
    move: [1, 4],
  },
  {
    id: 'colonnade',
    name: 'COLONNADE',
    speed: 162,
    rows: ['LSLSLSL', 'T.T.T.T', 'H.H.H.H', 'T.T.T.T', '.HLTLH.', 'S..L..S'],
    move: [4],
  },
  {
    id: 'grandslam',
    name: 'GRAND SLAM',
    speed: 172,
    rows: ['HSHSHSH', '.TLTLT.', 'LHTSTHL', '.LTLTL.', 'THLHLHT', '.S...S.'],
    move: [1, 3],
  },
];
