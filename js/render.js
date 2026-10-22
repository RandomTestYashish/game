// Draws a Game into the projected court, plus the in-play HUD.

import { W, ctx, PAL, rect, disc, ring, rrect, text, textW, serif, serifW, icon } from './gfx.js';
import { proj, drawBlock, drawBrick, drawBall, drawPaddle, drawShadow, MAT, toolColor } from './scene.js';
import { WW, WH, TOOL_TIME, START_LIVES, RACKET_RING, comboMult } from './game.js';

// The formation is a mix: it is split into a few groups (mirrored left and
// right), alternating bricks and players. Each group of players has one size,
// small, medium or big, and stands neatly: everyone on the left half faces
// right, everyone on the right half faces left, rackets toward the middle.
// Visual only; every block plays the same.
const SIZES = [0.85, 1, 1.5];
const mix = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function lookOf(g, b) {
  if (b.look) return b.look;
  const rows = g.level.rows;
  const cols = rows[0].length;
  const gw = Math.max(2, Math.round(cols / 4));
  const gh = Math.max(2, Math.round(rows.length / 3));
  const gx = Math.floor(Math.min(b.c, cols - 1 - b.c) / gw);
  const gy = Math.floor(b.r / gh);
  const seed = [...String(g.level.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const brick = (gx + gy + (mix(seed, 1, 1) < 0.5 ? 0 : 1)) % 2 === 0;
  b.look = { brick, size: SIZES[Math.floor(mix(seed, gx + 11, gy + 11) * SIZES.length)], flip: b.c > (cols - 1) / 2 };
  return b.look;
}

export function drawGame(g, time) {
  const frozen = g.fx.freeze > 0;
  const items = [];

  // Ground shadows first so nothing sorts underneath them.
  for (const b of g.blocks) {
    if (!b.alive || b.delay > 0) continue;
    const a = proj(b.x, b.y + b.d);
    const a2 = proj(b.x + b.w, b.y + b.d);
    ctx.globalAlpha = 0.3 * Math.max(0.25, 1 - b.z / 170);
    rect(a.x + 1, a.y, a2.x - a.x, 2 + Math.round(b.bob * 0.6), '#0a1a0c');
    ctx.globalAlpha = 1;
    items.push({ k: b.y + b.d, b });
  }

  if (g.shield) {
    const l = proj(0, WH - 3);
    const r = proj(WW, WH - 3);
    ctx.globalAlpha = 0.35;
    rect(l.x, l.y - 2, r.x - l.x, 5, '#9fe8ff');
    ctx.globalAlpha = 1;
    const off = Math.floor(time * 20) % 6;
    for (let x = l.x - off; x < r.x; x += 6) rect(Math.max(l.x, x), l.y, 4, 1, '#eafaff');
  }

  for (const d of g.drops) items.push({ k: d.y, d });
  for (const q of g.parts) items.push({ k: q.y, q });
  for (const ball of g.balls) items.push({ k: ball.y, ball });
  items.push({ k: g.paddle.y, paddle: g.paddle });
  items.sort((a, b) => a.k - b.k);

  const hot = g.fx.smash > 0;
  for (const it of items) {
    if (it.b) {
      const b = it.b;
      const a = proj(b.x, b.y + b.d);
      const a2 = proj(b.x + b.w, b.y + b.d);
      const f = proj(b.x, b.y);
      const f2 = proj(b.x + b.w, b.y);
      const lift = (b.z + b.bob) * a.s;
      const look = lookOf(g, b);
      (look.brick ? drawBrick : drawBlock)(a.x, a2.x, a.y - lift, f.x, f2.x, f.y - lift, b.hz * a.s, b.hz * f.s, b.type, b.seed, {
        damage: 1 - b.hp / b.max,
        frozen,
        flash: b.flash,
        size: look.size,
        flip: look.flip,
      });
    } else if (it.q) {
      const q = it.q;
      const p = proj(q.x, q.y, q.z);
      const m = MAT[q.type];
      const c = q.type === 'dust' ? '#cfd8b0' : q.type === 'spark' ? PAL.yellow : q.brick ? [m.top, m.front, m.hi][q.shade] : m.bits[q.shade];
      ctx.globalAlpha = Math.min(1, q.life / 0.25);
      rect(p.x, p.y - q.size, q.size, q.size, c);
      ctx.globalAlpha = 1;
    } else if (it.d) {
      const d = it.d;
      const g0 = proj(d.x, d.y);
      const p = proj(d.x, d.y, 7 + Math.sin(d.t * 6) * 2);
      drawShadow(g0.x, g0.y, 6, 2, 0.3);
      const tc = toolColor(d.type);
      disc(p.x, p.y - 7, 8, PAL.ink);
      disc(p.x, p.y - 7, 7, PAL.panel);
      ctx.globalAlpha = 0.28;
      disc(p.x, p.y - 7, 6, tc); // tinted face
      ctx.globalAlpha = 1;
      ring(p.x, p.y - 7, 7, tc);
      icon(d.type, p.x - 5, p.y - 12, tc);
    } else if (it.ball) {
      const ball = it.ball;
      const n = ball.trail.length;
      for (let i = n % 2; i < n; i += 2) {
        const t = ball.trail[i];
        const p = proj(t.x, t.y, t.z + 4);
        ctx.globalAlpha = 0.25 + 0.6 * (i / n);
        rect(p.x, p.y, i > n - 5 ? 2 : 1, i > n - 5 ? 2 : 1, hot ? '#ffb347' : '#eef58a');
      }
      ctx.globalAlpha = 1;
      const g0 = proj(ball.x, ball.y);
      const r = Math.max(2.4, ball.r * g0.s * 1.05);
      drawShadow(g0.x, g0.y, r, Math.max(1, r * 0.4), 0.35);
      if (ball.stuck) {
        const off = (time * 14) % 7;
        for (let i = 0; i < 6; i++) {
          const p = proj(ball.x, ball.y - 10 - i * 7 - off, ball.z + 4);
          ctx.globalAlpha = 1 - i / 6;
          rect(p.x, p.y, 1, 2, PAL.yellow);
        }
        ctx.globalAlpha = 1;
      }
      drawBall(g0.x, g0.y - ball.z * g0.s - r, r, hot);
    } else if (it.paddle) {
      const pd = it.paddle;
      const p = proj(pd.x, pd.y + pd.d / 2);
      // Where a ball resting on the racket has its underside (ball radius 4, resting 5 up).
      const touch = proj(pd.x, pd.y - pd.d / 2 - 4, 5);
      drawPaddle(p.x, p.y, (pd.w / 2) * p.s, g.fx.expand > 0, g.racket && { k: 1 - g.racket.t / RACKET_RING, off: g.racket.off }, touch.y);
    }
  }

  for (const f of g.floaters) {
    const p = proj(f.x, f.y, f.z);
    ctx.globalAlpha = Math.min(1, f.life / 0.3);
    text(f.text, p.x, p.y - 7, f.tool ? toolColor(f.tool) : PAL.yellowHi, { align: 'center', shadow: PAL.ink });
    ctx.globalAlpha = 1;
  }
}

// A dark HUD box with a pale rim, as in the scoreboard.
function frame(x, y, w, h) {
  rrect(x - 2, y - 2, w + 4, h + 5, 6, PAL.ink);
  rrect(x - 1, y - 1, w + 2, h + 2, 5, '#5f7a64');
  rrect(x, y, w, h, 4, '#0d1f16');
  rect(x + 4, y + 1, w - 8, 1, '#1d3a2a');
}

// Spacing for the narrow phone canvas (240 wide): the place tag, the
// court-cleared note and the "you beat" note sit a row lower so they clear
// the court name and the combo line.
export const hudRows = () => (W < 300 ? { tag: 46, note: 64, toast: 66 } : { tag: 38, note: 56, toast: 58 });

export function drawHUD(g, levelLabel) {
  // Centred, unless the court label on the left would touch it.
  const x = Math.round(Math.max(W / 2 - 54, 5 + textW(levelLabel, 1, 2) + 12 + 6));
  frame(x, 5, 108, 24);
  text('LIVES', x + 9, 8, PAL.white, { sp: 2 });
  for (let i = 0; i < START_LIVES; i++) {
    const cx = x + 11 + i * 8;
    if (i < g.lives) {
      disc(cx, 22, 3, PAL.yellow);
      rect(cx - 1, 20, 1, 1, PAL.yellowHi);
    } else {
      ring(cx, 22, 3, PAL.yellowLo);
    }
  }
  rect(x + 52, 9, 1, 16, PAL.dim);
  const sc = String(g.score);
  serif(sc, x + 80 - serifW(sc, 16) / 2, 11, 16, PAL.white);

  const lw = textW(levelLabel, 1, 2) + 12;
  frame(5, 6, lw, 15);
  text(levelLabel, 11, 10, PAL.white, { sp: 2 });
  if (g.combo >= 2 && g.state === 'play') {
    text('COMBO X' + comboMult(g.combo), W / 2, 34, PAL.yellowHi, { align: 'center', shadow: PAL.ink });
  }

  // Active tools with their remaining time.
  let ty = 27;
  const badge = (id, frac) => {
    const tc = toolColor(id);
    disc(13, ty + 7, 8, PAL.ink);
    disc(13, ty + 7, 7, PAL.panel);
    ring(13, ty + 7, 7, tc);
    icon(id, 8, ty + 2, tc);
    if (frac != null) {
      rect(5, ty + 17, 17, 3, PAL.ink);
      rect(6, ty + 18, Math.ceil(15 * frac), 1, tc);
    }
    ty += 23;
  };
  if (g.shield) badge('shield', null);
  for (const id in g.fx) if (g.fx[id] > 0) badge(id, g.fx[id] / TOOL_TIME[id]);
}
