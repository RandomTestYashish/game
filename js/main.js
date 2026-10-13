// Boot, screen flow, input and the frame loop.

import { W, H, ctx, PAL, initCanvas, setHeight, setTarget, makeLayer, rect, disc, text, serif, icon, clamp, lerp, easeOut, easeInOut, easeBack, checker } from './gfx.js';
import { P, setCam, buildLayers, drawScene, proj, unprojX, drawBlock, drawBall, drawShadow } from './scene.js';
import { Game, TOOLS } from './game.js';
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

const CAM = { loading: 0, title: 0, intro: 0.14, courts: 0.38, tools: 0.5, countdown: 1, play: 1, paused: 1, complete: 0.82, gameover: 0.82 };
const GAME_SCREENS = new Set(['countdown', 'play', 'paused', 'complete', 'gameover']);
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
  overlay: false,
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
}

let lastLand = 0;
function onGameEvent(type, arg) {
  if (type === 'land') {
    if (S.time - lastLand < 0.06) return;
    lastLand = S.time;
  }
  audio.sfx(type, arg);
  if (type === 'win' || type === 'over') finish(type === 'win');
}

function startLevel(i) {
  S.level = clamp(i, 0, LEVELS.length - 1);
  S.game = new Game(LEVELS[S.level], onGameEvent);
  S.ending = 0;
  if (S.screen === 'countdown') enter('countdown');
  else go('countdown');
}

function finish(won) {
  const g = S.game;
  const res = save.recordResult(S.level, LEVELS[S.level].id, LEVELS.length, {
    won,
    score: g.score,
    stars: g.stars,
    blocks: g.total - g.remaining,
  });
  S.result = {
    won,
    score: g.score,
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

function pause() {
  if (S.screen === 'play' && !S.leaving && !S.ending) go('paused');
}

function play() {
  if (!S.introSeen) go('intro');
  else go('courts');
}

function openSound() {
  S.overlay = true;
  S.eraseArmed = 0;
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
  S.titleVis = step(S.titleVis, S.screen === 'title' && !S.leaving, S.screen === 'title' ? 1.5 : 3.5);
  if (S.eraseArmed > 0) S.eraseArmed -= dt;

  if (S.screen === 'loading' && S.ready && S.t > 1.5) go('title');
  if (S.screen === 'intro' && S.t > 2.6) go('courts');

  const g = S.game;
  if (g && !GAME_SCREENS.has(S.next || S.screen) && S.gameVis <= 0) S.game = null;
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
      g.launch();
    }
  }

  if (S.ending > 0 && S.screen === 'play') {
    S.ending -= dt;
    if (S.ending <= 0) {
      S.ending = 0;
      go(S.result.won ? 'complete' : 'gameover');
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
  const base = H - 60;
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
}

function drawIntroBall(t) {
  const u = clamp(t / 1.9, 0, 1);
  const at = (v) => {
    const a = 1 - v;
    return {
      x: a * a * 178 + 2 * a * v * 30 + v * v * 196,
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
    const top = Math.round(P.wb * 0.16) - Math.round((1 - k) * 10);
    ctx.globalAlpha = k;
    serif('THE', W / 2 + 3, top, 15, PAL.cream, { align: 'center', sp: 5, shadow: PAL.ink });
    serif('COURT', W / 2 + 2, top + 20, 40, PAL.cream, { align: 'center', sp: 3, shadow: PAL.ink });
    rect(W / 2 - 22, top + 58, 44, 1, PAL.cream);
    const y = H - 50 + Math.round((1 - k) * 8);
    pill('play', 'PLAY', W / 2, y, 118, 23, play, { scale: 2, sp: 3 });
    ghost('courts', 'COURTS', W / 2 - 31, H - 19, 56, 13, () => go('courts'));
    ghost('sound', 'SOUND', W / 2 + 31, H - 19, 56, 13, openSound);
    ctx.globalAlpha = 1;
    S.primary = play;
  },

  intro(k) {
    ctx.globalAlpha = k;
    const y = Math.round(P.wb * 0.42);
    serif('ELEVATED', W - 20, y, 15, PAL.cream, { align: 'right', sp: 3, shadow: PAL.ink });
    serif('RALLY', W - 20, y + 18, 15, PAL.cream, { align: 'right', sp: 3, shadow: PAL.ink });
    rect(W - 66, y + 36, 30, 1, PAL.cream);
    ctx.globalAlpha = 1;
    drawIntroBall(S.t);
    const skip = () => go('courts');
    region('skip', 0, 0, W, H, skip);
    S.primary = skip;
    S.back = () => go('title');
  },

  courts(k) {
    const rowH = 27;
    const h = 46 + LEVELS.length * rowH + 30;
    const x = 20;
    const w = W - 40;
    const y = Math.round((H - h) / 2);
    const unlocked = save.data.progress.unlocked;
    const back = () => go('title');
    panel(k, x, y, w, h, 'dark', () => {
      serif('COURTS', W / 2 + 2, y + 14, 16, PAL.cream, { align: 'center', sp: 4 });
      rect(W / 2 - 14, y + 32, 28, 1, PAL.cream);
      LEVELS.forEach((lv, i) => {
        const ry = y + 42 + i * rowH;
        const open = i < unlocked;
        const id = 'court' + i;
        const on = open && (ui.hover === id || ui.pressed === id);
        rect(x + 10, ry, w - 20, rowH - 4, on ? PAL.panelHi : '#0c2016');
        rect(x + 10, ry + rowH - 5, w - 20, 1, '#06120c');
        const col = open ? PAL.cream : '#56695a';
        serif(String(i + 1), x + 17, ry + 5, 15, open ? PAL.yellow : '#56695a');
        text(lv.name, x + 36, ry + 4, col, { sp: 2 });
        const rec = save.data.progress.levels[lv.id];
        if (!open) {
          icon('lock', x + w - 27, ry + 6, '#56695a');
          text('LOCKED', x + 36, ry + 14, '#56695a');
        } else {
          for (let s = 0; s < 3; s++) icon('star', x + w - 50 + s * 12, ry + 2, rec && s < rec.stars ? PAL.yellow : '#2c4a36');
          text(rec ? 'BEST ' + rec.best : 'NOT PLAYED', x + 36, ry + 14, PAL.dim);
          region(id, x + 10, ry, w - 20, rowH - 4, () => {
            S.level = i;
            go('tools');
          });
        }
      });
      ghost('back', 'BACK', W / 2, y + h - 26, 60, 14, back);
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
    const x = (W - w) / 2;
    const y = Math.round((H - h) / 2);
    const begin = () => startLevel(S.level);
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
    if (g && g.state === 'serve' && Math.floor(S.time * 2.5) % 3 !== 0) {
      const p = proj(g.paddle.x, g.paddle.y);
      text(S.touch ? 'TAP TO SERVE' : 'CLICK OR SPACE TO SERVE', W / 2, p.y - 46, PAL.white, { align: 'center', shadow: PAL.ink });
    }
    S.primary = () => g && g.launch();
    S.back = pause;
  },

  paused(k) {
    const w = 150;
    const h = 150;
    const x = (W - w) / 2;
    const y = Math.round((H - h) / 2);
    const resume = () => go('play');
    panel(k, x, y, w, h, 'dark', () => {
      serif('PAUSED', W / 2 + 2, y + 15, 16, PAL.cream, { align: 'center', sp: 4 });
      rect(W / 2 - 12, y + 33, 24, 1, PAL.cream);
      pill('resume', 'RESUME', W / 2, y + 46, 104, 19, resume);
      ghost('restart', 'RESTART', W / 2, y + 76, 104, 15, () => startLevel(S.level));
      ghost('sound', 'SOUND', W / 2, y + 97, 104, 15, openSound);
      ghost('home', 'HOME', W / 2, y + 118, 104, 15, () => go('title'));
    });
    S.primary = resume;
    S.back = resume;
  },

  complete(k) {
    const r = S.result;
    if (!r) return;
    const w = 184;
    const h = 176;
    const x = (W - w) / 2;
    const y = Math.round((H - h) / 2) - 4;
    const next = () => startLevel(S.level + 1);
    const replay = () => startLevel(S.level);
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
      const xs = r.hasNext ? [-54, 0, 54] : [-30, 30];
      roundBtn('replay', 'replay', 'REPLAY', W / 2 + xs[0], y + 132, replay);
      roundBtn('home', 'home', 'HOME', W / 2 + xs[1], y + 132, () => go('title'));
      if (r.hasNext) roundBtn('next', 'next', 'NEXT', W / 2 + xs[2], y + 132, next);
    });
    S.primary = r.hasNext ? next : replay;
    S.back = () => go('title');
  },

  gameover(k) {
    const r = S.result;
    if (!r) return;
    const w = 184;
    const h = 160;
    const x = (W - w) / 2;
    const y = Math.round((H - h) / 2) - 4;
    const retry = () => startLevel(S.level);
    panel(k, x, y, w, h, 'cream', () => {
      serif('RALLY', W / 2 + 1, y + 14, 22, PAL.ink, { align: 'center', sp: 2 });
      serif('OVER', W / 2 + 1, y + 36, 22, PAL.ink, { align: 'center', sp: 2 });
      rect(W / 2 - 16, y + 59, 32, 1, PAL.ink);
      text('SCORE ' + r.score, W / 2, y + 68, PAL.ink, { align: 'center', sp: 2 });
      text(r.cleared + ' OF ' + r.total + ' BLOCKS CLEARED', W / 2, y + 80, '#7d7354', { align: 'center' });
      roundBtn('retry', 'replay', 'RETRY', W / 2 - 30, y + 116, retry);
      roundBtn('home', 'home', 'HOME', W / 2 + 30, y + 116, () => go('title'));
    });
    S.primary = retry;
    S.back = () => go('title');
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
  const x = (W - w) / 2;
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

// ---------------------------------------------------------------- draw

let gameLayer = null;

function draw() {
  setCam(S.cam);
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
      if (!gameLayer || gameLayer.canvas.height !== H) gameLayer = makeLayer(W, H);
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
    drawSoundOverlay(S.overlayT);
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

function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const h = clamp(Math.round((W * vh) / vw), 320, 520);
  if (h !== H || !S.ready) {
    setHeight(h);
    buildLayers();
  }
  let scale = Math.min(vw / W, vh / h);
  if (scale >= 2 && Math.floor(scale) / scale > 0.9) scale = Math.floor(scale); // crisp whole pixels on big screens
  canvas.style.width = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(h * scale) + 'px';
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

if (debug) window.__court = { S, save, audio, ui, LEVELS, go, startLevel, proj };

boot();
