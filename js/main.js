// Boot, screen flow, input and the frame loop.

import { W, H, ctx, PAL, initCanvas, setSize, setTarget, makeLayer, rect, rrect, disc, text, textW, wrap, serif, serifW, icon, clamp, lerp, easeOut, easeInOut, easeBack, checker } from './gfx.js';
import { P, setCam, buildLayers, drawScene, proj, unprojX, drawBlock, drawBall, drawShadow } from './scene.js';
import { Game, TOOLS, MAX_LIVES, START_LIVES } from './game.js';
import { sections } from './rules.js';
import { LEVELS } from './levels.js';
import { drawGame, drawHUD } from './render.js';
import { ui, beginUI, region, hitTest, pill, ghost, roundBtn, iconBtn, slider, panel } from './ui.js';
import { AudioSys } from './audio.js';
import { Save } from './save.js';

const canvas = document.getElementById('court');
initCanvas(canvas);

const save = new Save();
const audio = new AudioSys(save.data.settings);
const debug = new URLSearchParams(location.search).has('debug');

const CAM = { loading: 0, title: 0, intro: 0.14, courts: 0.38, tools: 0.5, countdown: 1, play: 1, paused: 1, complete: 0.82, name: 0.82, scores: 0.55 };
const GAME_SCREENS = new Set(['countdown', 'play', 'paused', 'complete', 'name']);
const PER_PAGE = 20;
const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-';
const LEAVE = 0.2;
const BEAT = 0.75; // seconds per countdown number

const S = {
  screen: 'loading',
  t: 0,
  time: 0,
  leaving: null,
  next: null,
  cam: 0,
  camFrom: 0,
  camTo: 0,
  camT: 1,
  ready: false,
  level: 0,
  game: null,
  gameVis: 0,
  titleVis: 0,
  landing: 1, // 1 on the first screen (no net or canopy yet), easing to 0 after Play
  overlay: false, // false | 'sound' | 'rules'
  overlayKind: 'sound',
  rulesTab: 0,
  rulesFits: true,
  overlayT: 0,
  tool: 0,
  count: 0,
  beat: 0,
  result: null,
  ending: 0,
  introSeen: false,
  eraseArmed: 0,
  touch: false,
  left: false,
  right: false,
  primary: null,
  back: null,
  timeScale: 1,
  shift: 0,
  run: null, // { lives, score, saved } carried from court to court
  page: 0,
  name: '',
  nameTitle: 'RALLY OVER',
  board: { rank: -1, fromRun: false },
  coach: null, // first-time guided rally: { step, t, moved, lastX, toolSeen }
};

// ---------------------------------------------------------------- flow

function go(name) {
  if (S.leaving || name === S.screen) return;
  S.leaving = { name: S.screen, t: 0 };
  S.next = name;
  aimCam(CAM[name]);
}

function aimCam(to) {
  if (to === S.camTo) return;
  S.camFrom = S.cam;
  S.camTo = to;
  S.camT = 0;
}

function enter(name) {
  S.screen = name;
  S.t = 0;
  if (name === 'countdown') {
    S.count = BEAT * 3;
    S.beat = 4;
  }
  if (name === 'intro') S.introSeen = true;
  if (name === 'courts') S.page = Math.floor((Math.min(save.data.progress.unlocked, LEVELS.length) - 1) / PER_PAGE);
  if (name === 'name') S.name = save.data.lastName;
}

let lastLand = 0;
function onGameEvent(type, arg) {
  if (type === 'land') {
    if (S.time - lastLand < 0.06) return;
    lastLand = S.time;
  }
  audio.sfx(type, arg);
  if (S.coach) coachEvent(type);
  if (type === 'win' || type === 'over') finish(type === 'win');
}

// A run starts on any court and carries score and lives forward until the
// player loses, stops, or clears the last court.
function beginRun(i) {
  if (S.coach) return firstRally(); // restarting mid-tutorial restarts the tutorial
  S.run = { lives: START_LIVES, score: 0, saved: false };
  startLevel(i);
}

// ---- first-time journey ---------------------------------------------------
// A new player skips the court grid and tools briefing and goes straight into
// a gentler court 1 with a few hints. Everything else is the normal game.

function afterIntro() {
  if (save.data.onboarded) go('courts');
  else firstRally();
}

function firstRally() {
  S.coach = { step: 'move', t: 0, moved: 0, lastX: null, toolSeen: false };
  S.run = { lives: START_LIVES, score: 0, saved: false };
  startLevel(0, { ...LEVELS[0], speed: Math.round(LEVELS[0].speed * 0.8) }, { firstTool: 'expand' });
}

function endCoach() {
  S.coach = null;
  if (!save.data.onboarded) {
    save.data.onboarded = true;
    save.commit();
  }
}

function coachEvent(type) {
  const c = S.coach;
  const to = (step) => {
    c.step = step;
    c.t = 0;
  };
  if (type === 'serve') to(c.step === 'lost' ? 'idle' : c.step === 'move' || c.step === 'serve' ? 'break' : c.step);
  else if (type === 'drop' && !c.toolSeen) {
    c.toolSeen = true;
    to('tool');
  } else if (type === 'power' && c.step === 'tool') to('caught');
  else if (type === 'lost') to('lost');
}

function coachText() {
  const serve = S.touch ? 'TAP TO SERVE' : 'CLICK OR PRESS SPACE TO SERVE';
  return {
    move: S.touch ? 'DRAG ANYWHERE TO MOVE' : 'MOVE THE MOUSE OR USE ARROW KEYS',
    serve: 'NOW ' + serve,
    break: 'KEEP THE BALL UP. CLEAR EVERY BLOCK.',
    tool: 'A TOOL IS FALLING. CATCH IT!',
    caught: 'WIDER PADDLE FOR A WHILE',
    lost: 'BALL LOST. ' + serve,
  }[S.coach.step];
}

function startLevel(i, level, extra) {
  S.level = clamp(i, 0, LEVELS.length - 1);
  S.game = new Game(level || LEVELS[S.level], onGameEvent, Math.random, { lives: S.run.lives, score: S.run.score, ...extra });
  S.ending = 0;
  if (S.screen === 'countdown') enter('countdown');
  else go('countdown');
}

function nextLevel() {
  S.run.lives = Math.min(MAX_LIVES, S.game.lives + 1);
  startLevel(S.level + 1);
}

function finish(won) {
  const g = S.game;
  const score = g.score - g.startScore;
  const res = save.recordResult(S.level, LEVELS[S.level].id, LEVELS.length, {
    won,
    score,
    stars: g.stars,
    blocks: g.total - g.remaining,
  });
  S.run.score = g.score;
  if (S.coach) endCoach(); // the first rally is over, win or lose
  S.result = {
    won,
    score,
    run: g.score,
    bonus: g.bonus,
    stars: won ? g.stars : 0,
    cleared: g.total - g.remaining,
    total: g.total,
    best: res.best,
    newBest: res.newBest,
    hasNext: won && S.level + 1 < LEVELS.length,
  };
  S.ending = won ? 1.2 : 0.9;
}

// The player is done: offer the leaderboard if there is a score to post.
function endRun(title) {
  if (S.run && S.game) S.run.score = S.game.score; // a run stopped mid-court still counts
  if (S.run && S.run.score > 0 && !S.run.saved) {
    S.nameTitle = title;
    go('name');
  } else {
    go('title');
  }
  S.coach = null; // leaving mid-tutorial: it will be offered again next time
}

function saveScore() {
  S.run.saved = true;
  S.board = { rank: save.addScore(S.name, S.run.score, S.level + 1), fromRun: true };
  go('scores');
}

function typeKey(ch) {
  if (ch === 'del') S.name = S.name.slice(0, -1);
  else if (S.name.length < 8) S.name += ch;
}

function pause() {
  if (S.screen === 'play' && !S.leaving && !S.ending) go('paused');
}

function play() {
  if (!S.introSeen) go('intro');
  else afterIntro();
}

function openSound() {
  S.overlay = S.overlayKind = 'sound';
  S.eraseArmed = 0;
}

function openRules() {
  S.overlay = S.overlayKind = 'rules';
}

function closeRules() {
  S.overlay = false;
}

function turnRules(d) {
  S.rulesTab = (S.rulesTab + d + sections().length) % sections().length;
}

function closeSound() {
  S.overlay = false;
  save.commit();
}

function setSetting(key, v) {
  save.data.settings[key] = v;
  audio.apply();
}

function toggleMute() {
  setSetting('muted', !save.data.settings.muted);
  save.commit();
}

// ---------------------------------------------------------------- update

function update(dt) {
  S.time += dt;
  S.t += dt;

  if (S.leaving) {
    S.leaving.t += dt;
    if (S.leaving.t >= LEAVE) {
      const n = S.next;
      S.leaving = null;
      S.next = null;
      enter(n);
    }
  }

  if (S.camT < 1) {
    S.camT = Math.min(1, S.camT + dt / 0.9);
    S.cam = lerp(S.camFrom, S.camTo, easeInOut(S.camT));
  }
  const step = (v, on, rate) => clamp(v + (on ? dt : -dt) * rate, 0, 1);
  S.overlayT = step(S.overlayT, S.overlay, 4);
  S.gameVis = step(S.gameVis, GAME_SCREENS.has(S.screen), 4);
  S.landing = step(S.landing, (S.next || S.screen) === 'title' || S.screen === 'loading', 1.6);
  S.titleVis = step(S.titleVis, S.screen === 'title' && !S.leaving, S.screen === 'title' ? 1.5 : 3.5);
  if (S.eraseArmed > 0) S.eraseArmed -= dt;

  if (S.screen === 'loading' && S.ready && S.t > 1.5) go('title');
  if (S.screen === 'intro' && S.t > 2.6 && !S.leaving) afterIntro();

  const g = S.game;
  if (g && !GAME_SCREENS.has(S.next || S.screen) && S.gameVis <= 0) S.game = null;

  // Camera truck: follows the paddle in play, idles gently in the menus.
  const inPlay = g && (S.screen === 'play' || S.screen === 'countdown');
  const want = inPlay ? (g.paddle.x - 100) * 0.22 : Math.sin(S.time * 0.25) * 7;
  S.shift += (want - S.shift) * Math.min(1, dt * 3);
  if (!g) return;

  const frozen = S.overlay || S.screen === 'paused' || S.next === 'paused';
  if (frozen) return;
  const steer = S.screen === 'play' || S.screen === 'countdown';
  g.update(dt, steer ? (S.right ? 1 : 0) - (S.left ? 1 : 0) : 0);

  if (S.screen === 'countdown' && !S.leaving) {
    S.count -= dt;
    const n = Math.ceil(S.count / BEAT);
    if (n !== S.beat && n > 0) {
      S.beat = n;
      audio.sfx('count');
    }
    if (S.count <= 0 && g.ready) {
      S.screen = 'play';
      S.t = 0;
      audio.sfx('go');
      // A first-timer serves by hand, once they have found the paddle.
      if (!(S.coach && S.coach.step === 'move')) g.launch();
    }
  }

  const c = S.coach;
  if (c && S.screen === 'play') {
    c.t += dt;
    if (c.lastX !== null) c.moved += Math.abs(g.paddle.x - c.lastX);
    c.lastX = g.paddle.x;
    if (c.step === 'move' && c.moved > 40) (c.step = 'serve'), (c.t = 0);
    if ((c.step === 'break' && c.t > 4) || (c.step === 'tool' && c.t > 7) || (c.step === 'caught' && c.t > 2.5)) c.step = 'idle';
  }

  if (S.ending > 0 && S.screen === 'play') {
    S.ending -= dt;
    if (S.ending <= 0) {
      S.ending = 0;
      if (S.result.won) go('complete');
      else {
        S.nameTitle = 'RALLY OVER';
        go('name');
      }
    }
  }
}

// ---------------------------------------------------------------- screens

const PYRAMID = [
  ['T', 'H', 'L', 'S'],
  ['H', 'H', 'L'],
  ['T', 'L'],
];

function drawPyramid(vis) {
  const base = P.wb + 46;
  drawShadow(W / 2, base + 1, 50, 4, 0.3 * vis);
  let i = 0;
  PYRAMID.forEach((row, r) => {
    const bw = 23;
    const x0 = Math.round(W / 2 - (row.length * bw) / 2);
    row.forEach((type, c) => {
      const k = clamp(vis * 2 - i * 0.09, 0, 1);
      i++;
      if (k <= 0) return;
      const lift = Math.round((1 - easeOut(k)) * 70);
      const h = type === 'S' ? 7 : 12;
      const yn = base - r * 13 - lift;
      const xl = x0 + c * bw;
      ctx.globalAlpha = Math.min(1, k * 2);
      drawBlock(xl, xl + bw - 1, yn, xl + 1, xl + bw - 2, yn - 5, h, h, type, 1000 + i * 7919);
      ctx.globalAlpha = 1;
    });
  });

  // A tennis ball resting on top, glinting now and then.
  const k = clamp(vis * 2 - 1, 0, 1);
  if (k <= 0) return;
  const cx = Math.round(W / 2) - 1;
  const cy = base - 49 - Math.round((1 - easeOut(k)) * 60);
  ctx.globalAlpha = Math.min(1, k * 2);
  drawBall(cx, cy, 7);
  for (const [dx, dy] of [[-4, -4], [-3, -2], [-3, 0], [-3, 2], [-4, 4], [4, -4], [3, -2], [3, 0], [3, 2], [4, 4]]) rect(cx + dx, cy + dy, 1, 1, '#f6ffa6');
  ctx.globalAlpha = 1;
  if (k >= 1) {
    [[-11, -6], [10, -8], [-8, -11], [12, -1], [0, -13], [-13, 1]].forEach(([dx, dy], n) => {
      const tw = Math.sin(S.time * 2.4 + n * 1.9);
      if (tw > 0.55) rect(cx + dx, cy + dy, 1, 1, tw > 0.9 ? '#ffffff' : PAL.cream);
    });
  }
}

function drawIntroBall(t) {
  const u = clamp(t / 1.9, 0, 1);
  const at = (v) => {
    const a = 1 - v;
    return {
      x: W / 2 + a * a * 58 + 2 * a * v * -90 + v * v * 76,
      y: a * a * (H - 12) + 2 * a * v * (P.wb + (H - P.wb) * 0.3) + v * v * (P.wb - 54),
    };
  };
  for (let v = 0; v < u; v += 0.035) {
    const p = at(v);
    const big = v < 0.5;
    rect(p.x, p.y, big ? 2 : 1, big ? 2 : 1, PAL.yellow);
  }
  const p = at(u);
  drawBall(p.x, p.y, lerp(6, 3.4, u));
}

const SCREENS = {
  loading(k) {
    const cy = P.wb + (H - P.wb) * 0.42;
    ctx.globalAlpha = k;
    const lead = Math.floor(S.time * 10) % 12;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const age = (lead - i + 12) % 12;
      const c = age < 4 ? PAL.yellow : age < 8 ? PAL.yellowLo : '#5a6b2e';
      rect(W / 2 + Math.cos(a) * 13 - 1, cy + Math.sin(a) * 13 - 1, 2, 2, c);
    }
    text('PREPARING', W / 2 + 2, cy + 26, PAL.white, { align: 'center', sp: 5, shadow: PAL.ink });
    rect(W / 2 - 11, cy + 40, 22, 1, PAL.white);
    ctx.globalAlpha = 1;
  },

  title(k) {
    const wb = P.wb;
    const top = Math.max(Math.round(wb * 0.16), Math.min(Math.round(H * 0.24), wb - 176)) - Math.round((1 - k) * 10);
    ctx.globalAlpha = k;
    serif('THE', W / 2 + 3, top, 15, PAL.cream, { align: 'center', sp: 5, shadow: PAL.ink });
    serif('COURT', W / 2 + 2, top + 20, 40, PAL.cream, { align: 'center', sp: 3, shadow: PAL.ink });
    // A thin glint crosses the letters every few seconds: a stepped diagonal
    // band, clipped to whole pixels, redrawing the glyphs a shade brighter.
    const sweep = (S.time % 5) / 1.3;
    if (sweep < 1) {
      const tw = serifW('COURT', 40, 3);
      const bx = W / 2 + 2 - tw / 2 - 16 + sweep * (tw + 32);
      ctx.save();
      ctx.beginPath();
      for (let r = 0; r < 34; r++) {
        const rx = Math.round(bx - r * 0.5);
        ctx.rect(rx, top + 17 + r, 3, 1);
        if (r & 1) ctx.rect(rx + 4, top + 17 + r, 1, 1);
      }
      ctx.clip();
      serif('COURT', W / 2 + 2, top + 20, 40, '#ffffff', { align: 'center', sp: 3 });
      ctx.restore();
    }
    rect(W / 2 - 22, top + 58, 44, 1, PAL.cream);
    const y = wb + 46 + Math.round(H * 0.04) + Math.round((1 - k) * 8);
    pill('play', 'PLAY', W / 2, y, 118, 23, play, { scale: 2, sp: 3, pulse: S.time });
    ctx.globalAlpha = 1;
    S.primary = play;
  },

  intro(k) {
    ctx.globalAlpha = k;
    const y = Math.round(P.wb * 0.42);
    serif('ELEVATED', W / 2 + 100, y, 15, PAL.cream, { align: 'right', sp: 3, shadow: PAL.ink });
    serif('RALLY', W / 2 + 100, y + 18, 15, PAL.cream, { align: 'right', sp: 3, shadow: PAL.ink });
    rect(W / 2 + 54, y + 36, 30, 1, PAL.cream);
    ctx.globalAlpha = 1;
    drawIntroBall(S.t);
    const skip = afterIntro;
    region('skip', 0, 0, W, H, skip);
    S.primary = skip;
    S.back = () => go('title');
  },

  courts(k) {
    const w = 212;
    const h = 250;
    const x = Math.round((W - w) / 2);
    const y = Math.round((H - h) / 2);
    const unlocked = save.data.progress.unlocked;
    const pages = Math.ceil(LEVELS.length / PER_PAGE);
    const back = () => go('title');
    const turn = (d) => (S.page = clamp(S.page + d, 0, pages - 1));
    panel(k, x, y, w, h, 'dark', () => {
      serif('COURTS', W / 2 + 2, y + 13, 16, PAL.cream, { align: 'center', sp: 4 });
      const first = S.page * PER_PAGE;
      const last = Math.min(LEVELS.length, first + PER_PAGE);
      text(first + 1 + ' - ' + last + ' OF ' + LEVELS.length, W / 2, y + 32, PAL.dim, { align: 'center' });
      for (let i = first; i < last; i++) {
        const cx = x + 11 + ((i - first) % 4) * 48;
        const cy = y + 44 + Math.floor((i - first) / 4) * 33;
        const open = i < unlocked;
        const id = 'court' + i;
        const on = open && (ui.hover === id || ui.pressed === id);
        rect(cx, cy, 46, 30, on ? PAL.panelHi : '#0c2016');
        rect(cx, cy + 29, 46, 1, '#06120c');
        if (!open) {
          serif(String(i + 1), cx + 23, cy + 5, 13, '#3f5545', { align: 'center' });
          icon('lock', cx + 18, cy + 17, '#3f5545');
          continue;
        }
        const rec = save.data.progress.levels[LEVELS[i].id];
        serif(String(i + 1), cx + 23, cy + 5, 13, rec ? PAL.cream : PAL.yellow, { align: 'center' });
        for (let st = 0; st < 3; st++) text('*', cx + 12 + st * 8, cy + 19, rec && st < rec.stars ? PAL.yellow : '#2c4a36');
        region(id, cx, cy, 46, 30, () => {
          S.level = i;
          go('tools');
        });
      }
      if (S.page > 0) ghost('prev', '<', x + 34, y + 29, 26, 13, () => turn(-1));
      if (S.page < pages - 1) ghost('nextpage', '>', x + w - 34, y + 29, 26, 13, () => turn(1));
      // Leaderboard and sound live here so the landing screen can stay bare.
      ghost('scores', 'SCORES', W / 2 - 75, y + h - 28, 46, 15, () => {
        S.board = { rank: -1, fromRun: false };
        go('scores');
      }, { sp: 0 });
      ghost('rules', 'RULES', W / 2 - 25, y + h - 28, 46, 15, openRules, { sp: 0 });
      ghost('sound', 'SOUND', W / 2 + 25, y + h - 28, 46, 15, openSound, { sp: 0 });
      ghost('back', 'BACK', W / 2 + 75, y + h - 28, 46, 15, back, { sp: 0 });
    });
    S.back = back;
    S.primary = () => {
      S.level = Math.min(unlocked, LEVELS.length) - 1;
      go('tools');
    };
  },

  tools(k) {
    const w = 204;
    const h = 214;
    const x = Math.round((W - w) / 2);
    const y = Math.round((H - h) / 2);
    const begin = () => beginRun(S.level);
    const back = () => go('courts');
    panel(k, x, y, w, h, 'dark', () => {
      serif('TOOLS', W / 2 + 3, y + 14, 16, PAL.cream, { align: 'center', sp: 5 });
      rect(W / 2 - 12, y + 32, 24, 1, PAL.cream);
      TOOLS.forEach((t, i) => {
        const cx = x + 38 + (i % 3) * 64;
        const cy = y + 58 + Math.floor(i / 3) * 52;
        const sel = S.tool === i;
        const id = 'tool' + i;
        disc(cx, cy, 17, sel || ui.hover === id ? PAL.yellow : PAL.cream);
        disc(cx, cy, 16, PAL.panel);
        if (sel) disc(cx, cy, 14, PAL.panelHi);
        icon(t.id, cx - 11, cy - 11, PAL.yellow, 2);
        text(t.name, cx, cy + 22, sel ? PAL.yellow : PAL.cream, { align: 'center', sp: t.name.length > 9 ? 0 : 1 });
        region(id, cx - 24, cy - 20, 48, 50, () => (S.tool = i));
      });
      const t = TOOLS[S.tool];
      text(t.desc[0], W / 2, y + 144, PAL.dim, { align: 'center' });
      text(t.desc[1], W / 2, y + 154, PAL.dim, { align: 'center' });
      pill('begin', 'BEGIN', W / 2 + 22, y + h - 40, 112, 21, begin, { scale: 2, sp: 3 });
      ghost('back', 'BACK', x + 36, y + h - 36, 44, 15, back);
    });
    S.primary = begin;
    S.back = back;
  },

  countdown(k) {
    const n = Math.max(1, Math.ceil(S.count / BEAT));
    const f = 1 - (S.count / BEAT - (n - 1)); // 0..1 within this beat
    const size = f < 0.12 ? 64 : 54;
    const cy = Math.round(proj(0, 186).y) - 8;
    ctx.globalAlpha = k * (f > 0.85 ? 0.5 : 1);
    serif(String(n), W / 2, cy - Math.round(size * 0.35), size, PAL.cream, { align: 'center', shadow: PAL.ink });
    ctx.globalAlpha = k;
    text(LEVELS[S.level].name, W / 2, 34, PAL.white, { align: 'center', sp: 3, shadow: PAL.ink });
    ctx.globalAlpha = 1;
    iconBtn('pause', 'pause', W - 23, 7, null);
    S.back = () => go('title');
  },

  play() {
    iconBtn('pause', 'pause', W - 23, 7, pause);
    const g = S.game;
    if (g && S.coach) {
      // Guided first rally: one short hint at a time, above the paddle.
      const p = proj(g.paddle.x, g.paddle.y);
      const msg = !S.ending && coachText();
      if (msg) {
        const w = textW(msg) + 16;
        const y = Math.round(p.y) - 58;
        rrect(W / 2 - w / 2 - 1, y - 1, w + 2, 17, 5, PAL.ink);
        rrect(W / 2 - w / 2, y, w, 15, 4, PAL.panel);
        text(msg, W / 2, y + 4, PAL.cream, { align: 'center' });
      }
      if (S.coach.step === 'move') {
        const hw = (g.paddle.w / 2) * p.s;
        const bob = Math.floor(S.time * 3) % 2;
        text('<', p.x - hw - 10 - bob, p.y - 9, PAL.yellow, { align: 'center', shadow: PAL.ink });
        text('>', p.x + hw + 10 + bob, p.y - 9, PAL.yellow, { align: 'center', shadow: PAL.ink });
      }
      ghost('skiptips', 'SKIP TIPS', W - 36, 32, 60, 13, endCoach);
    } else if (g && g.state === 'serve' && Math.floor(S.time * 2.5) % 3 !== 0) {
      const p = proj(g.paddle.x, g.paddle.y);
      text(S.touch ? 'TAP TO SERVE' : 'CLICK OR SPACE TO SERVE', W / 2, p.y - 46, PAL.white, { align: 'center', shadow: PAL.ink });
    }
    S.primary = () => g && g.launch();
    S.back = pause;
  },

  paused(k) {
    const w = 150;
    const h = 171;
    const x = Math.round((W - w) / 2);
    const y = Math.round((H - h) / 2);
    const resume = () => go('play');
    panel(k, x, y, w, h, 'dark', () => {
      serif('PAUSED', W / 2 + 2, y + 15, 16, PAL.cream, { align: 'center', sp: 4 });
      rect(W / 2 - 12, y + 33, 24, 1, PAL.cream);
      pill('resume', 'RESUME', W / 2, y + 46, 104, 19, resume);
      ghost('restart', 'RESTART', W / 2, y + 76, 104, 15, () => beginRun(S.level));
      ghost('sound', 'SOUND', W / 2, y + 97, 104, 15, openSound);
      ghost('rules', 'HOW TO PLAY', W / 2, y + 118, 104, 15, openRules);
      ghost('home', 'HOME', W / 2, y + 139, 104, 15, () => endRun('RALLY ENDED'));
    });
    S.primary = resume;
    S.back = resume;
  },

  complete(k) {
    const r = S.result;
    if (!r) return;
    const w = 184;
    const h = 188;
    const x = Math.round((W - w) / 2);
    const y = Math.round((H - h) / 2) - 4;
    const replay = () => beginRun(S.level);
    const home = () => endRun('WELL PLAYED');
    panel(k, x, y, w, h, 'cream', () => {
      serif('RALLY', W / 2 + 1, y + 14, 22, PAL.ink, { align: 'center', sp: 2 });
      serif('COMPLETE', W / 2 + 1, y + 36, 22, PAL.ink, { align: 'center', sp: 1 });
      rect(W / 2 - 16, y + 59, 32, 1, PAL.ink);
      for (let s = 0; s < 3; s++) {
        const lit = s < r.stars && S.t > 0.45 + s * 0.22;
        icon('star', W / 2 - 34 + s * 24, y + 64, lit ? '#d9a514' : PAL.creamLo, 2);
      }
      text('SCORE ' + r.score, W / 2, y + 90, PAL.ink, { align: 'center', sp: 2 });
      text(r.newBest ? 'NEW BEST!' : 'BEST ' + r.best, W / 2, y + 101, r.newBest ? '#b3541e' : '#7d7354', { align: 'center' });
      text('RUN TOTAL ' + r.run + (r.hasNext ? '  +1 LIFE' : ''), W / 2, y + 112, '#7d7354', { align: 'center' });
      const xs = r.hasNext ? [-54, 0, 54] : [-30, 30];
      roundBtn('replay', 'replay', 'REPLAY', W / 2 + xs[0], y + 144, replay);
      roundBtn('home', 'home', 'HOME', W / 2 + xs[1], y + 144, home);
      if (r.hasNext) roundBtn('next', 'next', 'NEXT', W / 2 + xs[2], y + 144, nextLevel);
    });
    S.primary = r.hasNext ? nextLevel : home;
    S.back = home;
  },

  // End of a run: enter a name for the leaderboard.
  name(k) {
    const run = S.run;
    if (!run) return;
    const scored = run.score > 0;
    const w = 206;
    const h = scored ? 200 : 150;
    const x = Math.round((W - w) / 2);
    const y = Math.round((H - h) / 2) - 2;
    const retry = () => beginRun(S.level);
    const skip = () => {
      S.board = { rank: -1, fromRun: true };
      go('scores');
    };
    panel(k, x, y, w, h, 'cream', () => {
      serif(S.nameTitle, W / 2 + 1, y + 13, 20, PAL.ink, { align: 'center', sp: 1 });
      text('SCORE ' + run.score + '   COURT ' + (S.level + 1), W / 2, y + 37, PAL.ink, { align: 'center', sp: 1 });
      if (!scored) {
        text('NO POINTS THIS TIME', W / 2, y + 52, '#7d7354', { align: 'center' });
        roundBtn('retry', 'replay', 'RETRY', W / 2 - 30, y + 96, retry);
        roundBtn('home', 'home', 'HOME', W / 2 + 30, y + 96, () => go('title'));
        return;
      }
      text('YOUR NAME FOR THE LEADERBOARD', W / 2, y + 49, '#7d7354', { align: 'center' });
      rect(W / 2 - 58, y + 60, 116, 21, PAL.ink);
      rect(W / 2 - 57, y + 61, 114, 19, PAL.panel);
      const shown = S.name + (S.name.length < 8 && Math.floor(S.time * 2.5) % 2 ? '_' : '');
      text(shown || ' ', W / 2 - 50, y + 64, PAL.yellow, { scale: 2, sp: 1 });
      [...KEYS, 'del'].forEach((ch, i) => {
        const kx = x + 12 + (i % 7) * 26;
        const ky = y + 88 + Math.floor(i / 7) * 19;
        const id = 'key' + ch;
        const on = ui.hover === id || ui.pressed === id;
        rect(kx, ky, 25, 18, PAL.creamLo);
        rect(kx, ky, 25, 17, on ? PAL.yellow : '#f8f2dd');
        text(ch === 'del' ? '<' : ch, kx + 13, ky + 5, PAL.ink, { align: 'center' });
        region(id, kx, ky, 26, 19, () => typeKey(ch));
      });
      ghost('skip', 'SKIP', x + 38, y + h - 30, 50, 17, skip);
      pill('save', 'SAVE SCORE', W / 2 + 28, y + h - 31, 118, 18, saveScore);
    });
    S.primary = scored ? saveScore : retry;
    S.back = scored ? skip : () => go('title');
  },

  scores(k) {
    const w = 206;
    const h = 250;
    const x = Math.round((W - w) / 2);
    const y = Math.round((H - h) / 2);
    const board = save.data.leaderboard;
    const again = () => beginRun(S.level);
    const home = () => go('title');
    panel(k, x, y, w, h, 'dark', () => {
      serif('LEADERBOARD', W / 2 + 1, y + 14, 14, PAL.cream, { align: 'center', sp: 2 });
      rect(W / 2 - 14, y + 30, 28, 1, PAL.cream);
      if (!board.length) {
        text('NO SCORES YET', W / 2, y + 86, PAL.cream, { align: 'center', sp: 2 });
        text('FINISH A RALLY TO ADD YOURS', W / 2, y + 100, PAL.dim, { align: 'center' });
      }
      // Ten rows; if the new score ranks lower, slide the window down to it.
      const top = clamp(S.board.rank - 9, 0, Math.max(0, board.length - 10));
      board.slice(top, top + 10).forEach((e, i) => {
        const ry = y + 38 + i * 16;
        const mine = top + i === S.board.rank;
        if (mine) rect(x + 10, ry - 1, w - 20, 15, PAL.panelHi);
        const c = mine ? PAL.yellow : PAL.cream;
        text(String(top + i + 1), x + 28, ry + 3, mine ? PAL.yellow : PAL.dim, { align: 'right' });
        text(e.name, x + 36, ry + 3, c, { sp: 2 });
        text('C' + e.court, x + 122, ry + 3, PAL.dim);
        text(String(e.score), x + w - 16, ry + 3, c, { align: 'right' });
      });
      text('SAVED ON THIS DEVICE', W / 2, y + 202, '#56695a', { align: 'center' });
      if (S.board.fromRun) {
        ghost('home', 'HOME', x + 38, y + h - 31, 50, 17, home);
        pill('again', 'PLAY AGAIN', W / 2 + 28, y + h - 32, 118, 18, again);
      } else {
        ghost('back', 'BACK', W / 2, y + h - 31, 60, 17, home);
      }
    });
    S.primary = S.board.fromRun ? again : home;
    S.back = home;
  },
};

function drawSoundOverlay(k) {
  ctx.globalAlpha = 0.55 * k;
  rect(0, 0, W, H, '#06120c');
  ctx.globalAlpha = 1;
  checker(0, 0, W, H, 'rgba(6,18,12,' + (0.35 * k).toFixed(2) + ')');
  const s = save.data.settings;
  const w = 176;
  const h = 178;
  const x = Math.round((W - w) / 2);
  const y = Math.round((H - h) / 2);
  panel(easeBack(k), x, y, w, h, 'dark', () => {
    serif('SOUND', W / 2 + 3, y + 14, 16, PAL.cream, { align: 'center', sp: 5 });
    rect(W / 2 - 12, y + 32, 24, 1, PAL.cream);
    text('MUSIC', x + 18, y + 44, PAL.cream, { sp: 2 });
    text(Math.round(s.music * 100) + '%', x + w - 18, y + 44, PAL.dim, { align: 'right' });
    slider('music', x + 20, y + 57, w - 40, s.music, (v) => setSetting('music', Math.round(v * 20) / 20));
    text('EFFECTS', x + 18, y + 76, PAL.cream, { sp: 2 });
    text(Math.round(s.sfx * 100) + '%', x + w - 18, y + 76, PAL.dim, { align: 'right' });
    slider('sfx', x + 20, y + 89, w - 40, s.sfx, (v) => {
      const q = Math.round(v * 20) / 20;
      if (q !== s.sfx) {
        setSetting('sfx', q);
        audio.sfx('click');
      }
    });
    ghost('mute', s.muted ? 'SOUND IS OFF' : 'SOUND IS ON', W / 2, y + 108, w - 40, 15, toggleMute, s.muted ? { color: PAL.dim, line: PAL.dim } : {});
    const armed = S.eraseArmed > 0;
    ghost('erase', armed ? 'TAP AGAIN TO ERASE' : 'ERASE SAVE DATA', W / 2, y + 129, w - 40, 15, () => {
      if (armed) {
        S.eraseArmed = 0;
        save.erase();
      } else {
        S.eraseArmed = 3;
      }
    }, armed ? { color: '#ff9c7a', line: '#ff9c7a' } : { color: PAL.dim, line: '#3c5a48' });
    pill('done', 'DONE', W / 2, y + h - 27, 80, 17, closeSound);
  });
  S.primary = closeSound;
  S.back = closeSound;
}

function drawRulesOverlay(k) {
  ctx.globalAlpha = 0.55 * k;
  rect(0, 0, W, H, '#06120c');
  ctx.globalAlpha = 1;
  checker(0, 0, W, H, 'rgba(6,18,12,' + (0.35 * k).toFixed(2) + ')');
  const all = sections();
  const sec = all[S.rulesTab];
  const w = 216;
  const h = 284;
  const x = Math.round((W - w) / 2);
  const y = Math.round((H - h) / 2);
  panel(easeBack(k), x, y, w, h, 'dark', () => {
    serif('HOW TO PLAY', W / 2 + 1, y + 12, 14, PAL.cream, { align: 'center', sp: 2 });
    all.forEach((t, i) => {
      const on = i === S.rulesTab;
      ghost('tab' + i, t.tab, x + 28 + i * 40, y + 32, 37, 13, () => (S.rulesTab = i), on ? { fill: PAL.yellow, color: PAL.ink, line: PAL.yellow, sp: 0 } : { sp: 0 });
    });
    let cy = y + 54;
    for (const r of sec.rows) {
      if (r.kind === 'brick') {
        const bh = r.type === 'S' ? 5 : 9;
        drawBlock(x + 13, x + 35, cy + 16, x + 14, x + 34, cy + 12, bh, bh, r.type, 4242);
        text(r.name, x + 43, cy + 2, PAL.cream, { sp: 2 });
        text(r.left, x + 43, cy + 12, PAL.dim);
        text(r.right, x + w - 13, cy + 7, PAL.yellow, { align: 'right' });
        cy += 23;
      } else {
        disc(x + 20, cy + 9, 8, PAL.cream);
        disc(x + 20, cy + 9, 7, PAL.panel);
        icon(r.id, x + 15, cy + 4, PAL.yellow);
        text(r.name, x + 34, cy + 1, PAL.cream, { sp: 1 });
        text(r.left, x + 34, cy + 11, PAL.dim, { sp: 0 });
        text(r.right, x + w - 13, cy + 1, PAL.yellow, { align: 'right' });
        cy += 22;
      }
    }
    if (sec.rows.length) cy += 3;
    for (const para of sec.lines) {
      for (const ln of wrap(para, w - 28)) {
        text(ln, x + 14, cy, PAL.cream);
        cy += 10;
      }
      cy += 5;
    }
    S.rulesFits = cy - 5 <= y + h - 32; // checked by the tests at every screen size
    pill('done', 'DONE', W / 2, y + h - 27, 80, 17, closeRules);
  });
  S.primary = closeRules;
  S.back = closeRules;
}

// ---------------------------------------------------------------- draw

let gameLayer = null;

function draw() {
  // The camera never sits quite still: a slow pitch drift, plus a lean toward the ball.
  const g0 = S.game;
  const ball = g0 && S.screen === 'play' && g0.balls[0];
  const pitch = Math.sin(S.time * 0.45) * 0.014 + (ball ? (ball.y - 120) / 240 * 0.02 : 0);
  S.pitch = (S.pitch || 0) + (pitch - (S.pitch || 0)) * 0.05;
  P.landing = easeInOut(S.landing);
  setCam(S.cam + S.pitch, S.shift);
  beginUI();
  S.primary = null;
  S.back = null;

  const g = S.game;
  const shake = g && g.shake > 0 ? Math.round(Math.sin(S.time * 90) * g.shake * 8) : 0;
  ctx.setTransform(1, 0, 0, 1, shake, 0);
  drawScene(S.time);

  if (S.titleVis > 0.01) drawPyramid(S.titleVis);

  if (g && S.gameVis > 0.01) {
    if (S.gameVis >= 1) {
      drawGame(g, S.time);
    } else {
      if (!gameLayer || gameLayer.canvas.height !== H || gameLayer.canvas.width !== W) gameLayer = makeLayer(W, H);
      gameLayer.clearRect(0, 0, W, H);
      setTarget(gameLayer);
      drawGame(g, S.time);
      setTarget(null);
      ctx.globalAlpha = S.gameVis;
      ctx.drawImage(gameLayer.canvas, 0, 0);
      ctx.globalAlpha = 1;
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const hud = S.leaving ? S.leaving.name : S.screen;
  if (g && (hud === 'countdown' || hud === 'play' || hud === 'paused')) drawHUD(g, 'COURT ' + (S.level + 1));

  if (S.leaving) {
    ui.live = false;
    SCREENS[S.leaving.name](1 - easeOut(S.leaving.t / LEAVE));
  } else {
    const k = easeOut(S.t / 0.4);
    ui.live = k > 0.9 && S.overlayT <= 0;
    SCREENS[S.screen](k);
  }
  ui.live = true;

  if (S.overlayT > 0) {
    beginUI();
    ui.live = S.overlay && S.overlayT >= 1;
    if (S.overlayKind === 'rules') drawRulesOverlay(S.overlayT);
    else drawSoundOverlay(S.overlayT);
    ui.live = true;
  }
}

// ---------------------------------------------------------------- input

let ptr = null;

function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
}

const steering = () => (S.screen === 'play' || S.screen === 'countdown') && S.game && !S.overlay && !S.leaving;

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audio.unlock();
  S.touch = e.pointerType !== 'mouse';
  const p = toLogical(e);
  const r = hitTest(p.x, p.y);
  ptr = { id: e.pointerId, x: p.x, moved: 0, t: S.time, region: r ? r.id : null };
  if (r) {
    ui.pressed = r.id;
    if (r.drag) r.drag(p.x, p.y);
  } else if (steering() && !S.touch) {
    S.game.movePaddleTo(unprojX(p.x, S.game.paddle.y));
  }
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* synthetic events have no active pointer to capture */
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = toLogical(e);
  const r = hitTest(p.x, p.y);
  ui.hover = e.pointerType === 'mouse' && r ? r.id : null;
  canvas.style.cursor = ui.hover ? 'pointer' : 'default';
  if (ptr && ptr.region) {
    const held = ui.regions.find((q) => q.id === ptr.region);
    if (held && held.drag) held.drag(p.x, p.y);
    return;
  }
  if (!steering()) return;
  const g = S.game;
  if (e.pointerType === 'mouse') {
    g.movePaddleTo(unprojX(p.x, g.paddle.y));
  } else if (ptr) {
    // Touch steers relatively so a thumb never has to cover the paddle.
    const dx = p.x - ptr.x;
    ptr.moved += Math.abs(dx);
    ptr.x = p.x;
    g.movePaddleTo(g.paddle.x + (dx / proj(0, g.paddle.y).s) * 1.3);
  }
});

function release(e, cancelled) {
  if (!ptr) return;
  const p = toLogical(e);
  if (ptr.region) {
    const r = hitTest(p.x, p.y);
    if (!cancelled && r && r.id === ptr.region && r.fn) {
      audio.sfx('click');
      r.fn();
    } else if (r && r.drag) {
      save.commit();
    }
  } else if (!cancelled && S.screen === 'play' && !S.overlay && ptr.moved < 6 && S.time - ptr.t < 0.5 * S.timeScale) {
    S.game.launch();
  }
  ui.pressed = null;
  ptr = null;
}
canvas.addEventListener('pointerup', (e) => release(e, false));
canvas.addEventListener('pointercancel', (e) => release(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  audio.unlock();
  if (S.overlay === 'rules' && (k === 'arrowleft' || k === 'arrowright')) {
    turnRules(k === 'arrowleft' ? -1 : 1);
    e.preventDefault();
    return;
  }
  if (S.screen === 'name' && !S.leaving && !S.overlay && S.run && S.run.score > 0) {
    // Typing a name: letters are text here, not shortcuts.
    if (k === 'backspace') typeKey('del');
    else if (k === 'enter') S.primary && S.primary();
    else if (k === 'escape') S.back && S.back();
    else if (k.length === 1 && KEYS.includes(k.toUpperCase())) typeKey(k.toUpperCase());
    else return;
    e.preventDefault();
    return;
  }
  if (S.screen === 'courts' && !S.leaving && !S.overlay && (k === 'arrowleft' || k === 'arrowright')) {
    S.page = clamp(S.page + (k === 'arrowleft' ? -1 : 1), 0, Math.ceil(LEVELS.length / PER_PAGE) - 1);
    e.preventDefault();
    return;
  }
  if (k === 'arrowleft' || k === 'a') S.left = true;
  else if (k === 'arrowright' || k === 'd') S.right = true;
  else if (k === ' ' || k === 'enter' || k === 'arrowup') {
    if (!e.repeat && S.primary && !S.leaving) S.primary();
  } else if (k === 'escape' || k === 'p') {
    if (!e.repeat && S.back && !S.leaving) S.back();
  } else if (k === 'm') {
    if (!e.repeat) toggleMute();
  } else return;
  e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') S.left = false;
  if (k === 'arrowright' || k === 'd') S.right = false;
});

window.addEventListener('blur', () => {
  S.left = S.right = false;
  pause();
});

document.addEventListener('visibilitychange', () => {
  audio.hold(document.hidden);
  if (document.hidden) pause();
});

// ---------------------------------------------------------------- layout

// The canvas fills the window. One game pixel is sized so that at least
// 240 x 320 of them fit; any spare room becomes more court and garden.
function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const unit = Math.min(vw / 240, vh / 320);
  const w = clamp(Math.floor(vw / unit), 240, 760);
  const h = clamp(Math.floor(vh / unit), 320, 520);
  if (w !== W || h !== H || !S.ready) {
    setSize(w, h);
    buildLayers();
  }
  const scale = Math.min(vw / w, vh / h);
  canvas.style.width = Math.round(w * scale) + 'px';
  canvas.style.height = Math.round(h * scale) + 'px';
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- loop

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * S.timeScale;
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

async function boot() {
  resize();
  requestAnimationFrame(frame);
  canvas.dataset.ready = '1';
  await save.init();
  audio.settings = save.data.settings;
  S.ready = true;
}

if (debug) window.__court = { S, save, audio, ui, LEVELS, go, beginRun, proj, size: () => [W, H] };

boot();
