// The "How to play" text. Every number here is read from the game's own
// constants, so the rules screen cannot drift from what the game does.

import { BLOCKS, TOOLS, TOOL_TIME, START_LIVES, MAX_BALLS, MAX_DROPS, RUSH_AT, LIFE_BONUS, COMBO_STEP, COMBO_CAP, SPEED_UP, SPEED_CAP, comboMult, brickPoints } from './game.js';
import { COUNT } from './levels.js';
import { BOARD_SIZE } from './save.js';

const BRICK_NAMES = { T: 'TERRACOTTA', L: 'LIMESTONE', H: 'HEDGE', S: 'SLATE' };
const TOOL_TEXT = {
  shield: 'SAVES ONE BALL',
  multiball: 'EACH BALL SPLITS IN 3',
  smash: 'BALL GOES THROUGH BRICKS',
  freeze: 'ROWS STOP. 1 HIT BREAKS.',
  expand: 'WIDER PADDLE',
  lowgrav: 'BALLS AND TOOLS FALL SLOWER',
};
const nth = (n) => n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH');

// The raw values, for the screen below and for the tests.
export function facts() {
  return {
    bricks: Object.fromEntries(Object.entries(BLOCKS).map(([t, b]) => [t, { name: BRICK_NAMES[t], hits: b.hp, pts: b.pts }])),
    comboStep: COMBO_STEP,
    comboMax: comboMult(COMBO_CAP + 1),
    comboMaxAt: COMBO_CAP + 1,
    lifeBonus: LIFE_BONUS,
    startLives: START_LIVES,
    maxBalls: MAX_BALLS,
    maxDrops: MAX_DROPS,
    rushPct: Math.round(RUSH_AT * 100),
    toolTime: { ...TOOL_TIME },
    speedUpPct: Math.round((SPEED_UP - 1) * 100),
    speedCap: SPEED_CAP,
    courts: COUNT,
    boardSize: BOARD_SIZE,
  };
}

// Each tab is a short stack of numbered cards plus a tip. A card may show the
// tab's rows (the brick or tool table), a small picture (art), and text lines.
export function sections() {
  const f = facts();
  const tabs = [
    {
      tab: 'BRICKS',
      rows: Object.entries(f.bricks).map(([type, b]) => ({ kind: 'brick', type, name: b.name, left: b.hits + (b.hits === 1 ? ' HIT' : ' HITS') + ' TO BREAK', right: b.pts + ' PTS' })),
      cards: [
        { title: 'BRICK TYPES', showRows: true, lines: [] },
        { title: 'BRICK BEHAVIOUR', art: 'crack', lines: ['CRACKS SHOW A DAMAGED BRICK.', 'SOME ROWS SLIDE SIDEWAYS. SOME FORMATIONS MOVE TOWARD YOU AND BACK.'] },
        { title: 'FLOATING BRICKS', art: 'float', lines: ['THE FLOATING IS FOR SHOW: BRICKS ARE HIT AT GROUND LEVEL.'] },
      ],
      tip: 'SLATE IS WORTH THE MOST. BREAK IT WHILE YOUR COMBO IS HIGH.',
    },
    {
      tab: 'SCORE',
      rows: [],
      cards: [
        { title: 'POINTS', lines: ['POINTS = BRICK VALUE X COMBO, ROUNDED TO THE NEAREST 5.', `EXAMPLE: HEDGE AS THE 5TH BRICK = ${f.bricks.H.pts} X ${comboMult(5)} = ${brickPoints('H', 5)}.`] },
        {
          title: 'COMBO',
          lines: [
            `COMBO STARTS AT X1 AND GROWS ${f.comboStep} WITH EACH BRICK BROKEN, UP TO X${f.comboMax} FROM THE ${nth(f.comboMaxAt)}.`,
            'IT RESETS WHEN A BALL TOUCHES THE PADDLE, OR WHEN YOUR LAST BALL IN PLAY IS LOST.',
          ],
        },
        { title: 'BONUS AND STARS', lines: [`CLEARING A COURT: +${f.lifeBonus} FOR EACH LIFE LEFT.`, 'STARS: 3, MINUS 1 PER LIFE LOST ON THAT COURT, NEVER BELOW 1.'] },
      ],
      tip: 'EVERY PADDLE TOUCH RESETS THE COMBO. KEEP THE BALL UP AMONG THE BRICKS.',
    },
    {
      tab: 'TOOLS',
      rows: TOOLS.map((t) => ({
        kind: 'tool',
        id: t.id,
        name: t.name,
        left: TOOL_TEXT[t.id],
        right: f.toolTime[t.id] ? f.toolTime[t.id] + ' SEC' : t.id === 'multiball' ? 'MAX ' + f.maxBalls : 'ONE USE',
      })),
      cards: [
        { title: 'THE SIX TOOLS', showRows: true, lines: [] },
        { title: 'CATCHING THEM', lines: [`BROKEN BRICKS SOMETIMES DROP A TOOL. CATCH IT WITH THE PADDLE. NO MORE THAN ${f.maxDrops} FALL AT ONCE.`, `POWER RUSH: WITH ${f.rushPct}% OF A COURT LEFT, TOOLS DROP FROM MOST BRICKS.`, 'LOSING A LIFE CLEARS EVERY ACTIVE TOOL.'] },
      ],
      tip: 'FREEZE BREAKS ANY BRICK IN ONE HIT, EVEN SLATE.',
    },
    {
      tab: 'RUNS',
      rows: [],
      cards: [
        { title: 'COURTS', lines: [`CLEAR A COURT TO UNLOCK THE NEXT. THERE ARE ${f.courts}.`, `COURTS GET FASTER, WITH A SMALLER PADDLE AND FEWER TOOLS. THE BALL ALSO SPEEDS UP ${f.speedUpPct}% ON EACH PADDLE HIT, UP TO ${f.speedCap}X.`] },
        {
          title: 'LIVES',
          lines: [
            `A RUN STARTS WITH ${f.startLives} LIVES ON ANY UNLOCKED COURT.`,
            'NEXT KEEPS YOUR SCORE AND THE LIVES YOU HAVE LEFT. A LOST LIFE NEVER COMES BACK.',
            `REPLAY, RETRY AND RESTART BEGIN A NEW RUN: ${f.startLives} LIVES, SCORE 0.`,
          ],
        },
        { title: 'LEADERBOARD', lines: [`A RUN ENDS WHEN YOUR LAST LIFE IS LOST OR YOU GO HOME. ITS TOTAL CAN GO ON THE TOP ${f.boardSize} LEADERBOARD.`] },
      ],
      tip: 'LIVES DO NOT COME BACK, SO PLAY SAFE EARLY IN A RUN.',
    },
    {
      tab: 'KEYS',
      rows: [],
      cards: [
        { title: 'MOUSE', lines: ['MOVE TO STEER. CLICK TO SERVE.'] },
        { title: 'TOUCH', lines: ['DRAG ANYWHERE TO STEER. TAP TO SERVE.'] },
        { title: 'KEYBOARD', lines: ['ARROWS OR A AND D TO STEER. SPACE OR ENTER TO SERVE.', 'P OR ESC PAUSES. M MUTES.', 'IN MENUS: ENTER CONFIRMS, ESC GOES BACK.'] },
        { title: 'AUTO PAUSE', lines: ['THE GAME PAUSES ITSELF WHEN YOU LEAVE THE TAB.'] },
      ],
      tip: 'ON A PHONE YOUR THUMB NEED NOT COVER THE PADDLE: DRAG ANYWHERE.',
    },
  ];
  for (const t of tabs) t.lines = t.cards.flatMap((c) => c.lines);
  return tabs;
}
