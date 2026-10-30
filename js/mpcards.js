// Multiplayer images, drawn in the browser like the score card (js/share.js):
// small in pixels, then scaled up without smoothing. Nothing is stored.
//   invite card  1080 x 1350  "<HOST> CHALLENGED YOU TO THE COURT!"
//   result story 1080 x 1920  (9:16, for an Instagram or WhatsApp story)

import { ctx, PAL, makeLayer, setTarget, rect, rrect, text, textW, serif, sparkle, racket } from './gfx.js';
import { drawThemePreview } from './scene.js';

const ZOOM = 5;

function scaleUp(low, w, h) {
  const big = document.createElement('canvas');
  big.width = w * ZOOM;
  big.height = h * ZOOM;
  const b = big.getContext('2d');
  b.imageSmoothingEnabled = false;
  b.drawImage(low.canvas, 0, 0, big.width, big.height);
  return big;
}

function title(cw, y) {
  serif('THE', cw / 2 + 2, y, 12, PAL.cream, { align: 'center', sp: 3, shadow: PAL.ink });
  serif('COURT', cw / 2 + 2, y + 14, 26, PAL.cream, { align: 'center', sp: 2, shadow: PAL.ink });
}

function board(x, y, w, h) {
  rrect(x - 1, y - 1, w + 2, h + 5, 5, '#06120c');
  rrect(x, y, w, h, 4, PAL.panel);
  rect(x + 6, y + 3, w - 12, 1, PAL.cream);
  rect(x + 6, y + h - 4, w - 12, 1, PAL.cream);
}

function lines(str, max) {
  const words = str.split(' ');
  const out = [];
  let cur = '';
  for (const wd of words) {
    const next = cur ? cur + ' ' + wd : wd;
    if (textW(next, 1, 1) > max && cur) {
      out.push(cur);
      cur = wd;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function address(cw, ch, url) {
  const u = new URL(url);
  const full = (u.host + u.pathname).replace(/\/$/, '').toUpperCase();
  const ls = textW(full, 1, 1) <= cw - 24 ? [full] : [u.host.toUpperCase(), u.pathname.replace(/\/$/, '').toUpperCase()];
  const lw = Math.max(...ls.map((l) => textW(l, 1, 1)));
  const ly = ch - 26 - ls.length * 10;
  rrect(cw / 2 - lw / 2 - 6, ly - 3, lw + 12, ls.length * 10 + 3, 4, 'rgba(6,18,12,0.75)');
  ls.forEach((l, i) => text(l, cw / 2, ly + i * 10, PAL.cream, { align: 'center', sp: 1 }));
  text('CRAFTED BY YASHISH', cw / 2, ch - 14, PAL.dim, { align: 'center', sp: 1, shadow: PAL.ink });
  return ly;
}

// The invite card: the host's challenge, two rackets and a ball, and how long it lasts.
export function drawInviteCard({ host, theme, url }) {
  const CW = 216;
  const CH = 270;
  const low = makeLayer(CW, CH);
  const was = ctx;
  setTarget(low);
  drawThemePreview(theme, 0, 0, CW, CH);
  title(CW, 14);
  const bx = 18;
  const by = 72;
  const bw = CW - 36;
  const bh = 112;
  board(bx, by, bw, bh);
  const msg = lines(`${host} CHALLENGED YOU TO THE COURT!`, bw - 20);
  msg.forEach((l, i) => text(l, CW / 2, by + 12 + i * 11, i === 0 ? PAL.yellow : PAL.cream, { align: 'center', sp: 1 }));
  // A rally between two rackets.
  const ry = by + 12 + msg.length * 11 + 22;
  racket(CW / 2 - 44, ry, 1);
  racket(CW / 2 + 44, ry, -1);
  for (let i = 0; i < 5; i++) rect(CW / 2 - 24 + i * 10, ry - 8 - Math.round(Math.sin((i / 4) * Math.PI) * 9), 2, 2, '#eef58a');
  rect(CW / 2 + 22, ry - 9, 4, 4, '#d8f04a');
  text('TWO PLAYERS. THREE LIVES EACH.', CW / 2, by + bh - 24, PAL.dim, { align: 'center' });
  text('HIGHEST SCORE WINS', CW / 2, by + bh - 14, PAL.cream, { align: 'center', sp: 1 });
  sparkle(bx + 10, by + 28, 2);
  sparkle(bx + bw - 12, by + 40, 1, '#ff6fa8');
  const py = CH - 72;
  rrect(CW / 2 - 71, py - 1, 142, 24, 7, PAL.ink);
  rrect(CW / 2 - 70, py + 2, 140, 20, 6, PAL.yellowLo);
  rrect(CW / 2 - 70, py, 140, 20, 6, PAL.yellow);
  rect(CW / 2 - 65, py + 1, 130, 1, PAL.yellowHi);
  text('TAP THE LINK TO PLAY', CW / 2, py + 7, PAL.ink, { align: 'center', sp: 1 });
  text('THE INVITE LASTS 1 HOUR', CW / 2, py + 26, PAL.cream, { align: 'center', sp: 1, shadow: PAL.ink });
  address(CW, CH, url);
  setTarget(was);
  return scaleUp(low, CW, CH);
}

// The result story (9:16).
export function drawResultStory({ me, opp, result, theme, url }) {
  const CW = 216;
  const CH = 384;
  const low = makeLayer(CW, CH);
  const was = ctx;
  setTarget(low);
  drawThemePreview(theme, 0, 0, CW, CH);
  title(CW, 24);
  const headline = result === 'draw' ? "IT'S A DRAW!" : (result === 'won' ? me.name : opp.name) + ' WINS!';
  const bx = 16;
  const by = 92;
  const bw = CW - 32;
  const bh = 168;
  board(bx, by, bw, bh);
  const hs = textW(headline, 2, 2) <= bw - 16 ? 2 : 1;
  text(headline, CW / 2, by + 14, PAL.yellow, { align: 'center', scale: hs, sp: 2, shadow: PAL.ink });
  // The two players, side by side.
  const col = (p, cx, won) => {
    text(p.name, cx, by + 52, won ? PAL.yellow : PAL.cream, { align: 'center', sp: 1 });
    const s = String(p.score);
    const sc = textW(s, 3, 1) <= bw / 2 - 12 ? 3 : 2;
    text(s, cx, by + 68, won ? PAL.yellow : PAL.white, { align: 'center', scale: sc, sp: 1, shadow: PAL.ink });
    text('COURT ' + p.court, cx, by + 68 + 7 * sc + 8, PAL.dim, { align: 'center' });
  };
  col(me, CW / 2 - bw / 4, result === 'won');
  col(opp, CW / 2 + bw / 4, result === 'lost');
  rect(CW / 2, by + 48, 1, 60, '#2f6b47');
  text('VS', CW / 2, by + 74, PAL.dim, { align: 'center' });
  racket(CW / 2 - 30, by + 136, 1);
  racket(CW / 2 + 30, by + 136, -1);
  rect(CW / 2 - 2, by + 126, 4, 4, '#d8f04a');
  text('VERIFIED RESULT', CW / 2, by + bh - 16, PAL.dim, { align: 'center', sp: 1 });
  sparkle(bx + 10, by + 34, 2);
  sparkle(bx + bw - 12, by + 30, 1, '#ff6fa8');
  const py = CH - 86;
  rrect(CW / 2 - 81, py - 1, 162, 24, 7, PAL.ink);
  rrect(CW / 2 - 80, py + 2, 160, 20, 6, PAL.yellowLo);
  rrect(CW / 2 - 80, py, 160, 20, 6, PAL.yellow);
  rect(CW / 2 - 75, py + 1, 150, 1, PAL.yellowHi);
  text('CAN YOU BEAT YOUR FRIEND?', CW / 2, py + 7, PAL.ink, { align: 'center', sp: 1 });
  address(CW, CH, url);
  setTarget(was);
  return scaleUp(low, CW, CH);
}

export const toBlob = (canvas) => new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('no image'))), 'image/png'));
