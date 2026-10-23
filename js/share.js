// Score sharing: a branded score card drawn in the browser (no server), then
// handed to the device's share sheet, or downloaded with the link copied
// where there is no share sheet. The card reuses the game's own art: the
// court theme's scenery, the pixel and serif fonts, the palette.

import { ctx, PAL, makeLayer, setTarget, rect, rrect, text, textW, serif, sparkle } from './gfx.js';
import { drawThemePreview } from './scene.js';

// 1ST, 2ND, 3RD, 4TH... (the pixel font has no '#').
export const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');

// Drawn small in pixels, then scaled up 5x without smoothing: 1080 x 1350.
const CW = 216;
const CH = 270;
const ZOOM = 5;

// The page a shared card links to: the site it was made on, tagged so new
// players arriving from shares can be counted (PostHog reads UTM tags).
export function shareUrl() {
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set('utm_source', 'score_share');
  u.searchParams.set('utm_medium', 'social');
  u.searchParams.set('utm_campaign', 'score_card');
  return u.toString();
}

export function shareText({ score, court, rank }) {
  const place = rank >= 0 ? ` and I'm #${rank + 1} on the leaderboard` : '';
  return `I scored ${score} on Court ${court} in The Court${place}. Can you beat me?`;
}

// The card itself, as a canvas.
export function drawCard({ name, score, court, rank, theme }) {
  const low = makeLayer(CW, CH);
  const was = ctx;
  setTarget(low);
  drawThemePreview(theme, 0, 0, CW, CH);
  // Title over the sky.
  serif('THE', CW / 2 + 2, 14, 12, PAL.cream, { align: 'center', sp: 3, shadow: PAL.ink });
  serif('COURT', CW / 2 + 2, 28, 26, PAL.cream, { align: 'center', sp: 2, shadow: PAL.ink });
  // The score on a dark board, as in the game's panels.
  const bx = 22;
  const by = 84;
  const bw = CW - 44;
  const bh = 104;
  rrect(bx - 1, by - 1, bw + 2, bh + 5, 5, '#06120c');
  rrect(bx, by, bw, bh, 4, PAL.panel);
  rect(bx + 6, by + 3, bw - 12, 1, PAL.cream);
  rect(bx + 6, by + bh - 4, bw - 12, 1, PAL.cream);
  text((name || 'PLAYER') + ' SCORED', CW / 2, by + 12, PAL.cream, { align: 'center', sp: 2 });
  const s = String(score);
  const sc = textW(s, 4, 2) <= bw - 20 ? 4 : 3;
  text(s, CW / 2, by + 28, PAL.yellow, { align: 'center', scale: sc, sp: 2, shadow: PAL.ink });
  text('ON COURT ' + court, CW / 2, by + 28 + 7 * sc + 8, PAL.cream, { align: 'center', sp: 2 });
  if (rank >= 0) text(ordinal(rank + 1) + ' ON THE LEADERBOARD', CW / 2, by + bh - 20, PAL.yellow, { align: 'center', sp: 1 });
  sparkle(bx + 10, by + 30, 2);
  sparkle(bx + bw - 12, by + 40, 1, '#ff6fa8');
  // Where to play: the address, on two lines if it is too long for one.
  const full = (location.host + location.pathname).replace(/\/$/, '').toUpperCase();
  const lines = textW(full, 1, 1) <= CW - 24 ? [full] : [location.host.toUpperCase(), location.pathname.replace(/\/$/, '').toUpperCase()];
  // The call to play sits above the address.
  const py = CH - 66 - (lines.length - 1) * 10;
  rrect(CW / 2 - 71, py - 1, 142, 24, 7, PAL.ink);
  rrect(CW / 2 - 70, py + 2, 140, 20, 6, PAL.yellowLo);
  rrect(CW / 2 - 70, py, 140, 20, 6, PAL.yellow);
  rect(CW / 2 - 65, py + 1, 130, 1, PAL.yellowHi);
  text('CAN YOU BEAT ME?', CW / 2, py + 7, PAL.ink, { align: 'center', sp: 2 });
  const lw = Math.max(...lines.map((l) => textW(l, 1, 1)));
  const ly = CH - 26 - lines.length * 10;
  rrect(CW / 2 - lw / 2 - 6, ly - 3, lw + 12, lines.length * 10 + 3, 4, 'rgba(6,18,12,0.75)');
  lines.forEach((l, i) => text(l, CW / 2, ly + i * 10, PAL.cream, { align: 'center', sp: 1 }));
  text('CRAFTED BY YASHISH', CW / 2, CH - 14, PAL.dim, { align: 'center', sp: 1, shadow: PAL.ink });
  setTarget(was);
  const big = document.createElement('canvas');
  big.width = CW * ZOOM;
  big.height = CH * ZOOM;
  const b = big.getContext('2d');
  b.imageSmoothingEnabled = false;
  b.drawImage(low.canvas, 0, 0, big.width, big.height);
  return big;
}

const toBlob = (canvas) => new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('no image'))), 'image/png'));

// Share a run. report(event, props) is told each step; it resolves with what
// finally happened: 'shared' (the share sheet handed it on), 'cancelled',
// 'saved' (downloaded and the link copied), 'downloaded' (the card only) or
// 'failed'.
export async function shareScore(run, report) {
  let file;
  try {
    const blob = await toBlob(drawCard(run));
    file = new File([blob], `the-court-${run.score}.png`, { type: 'image/png' });
  } catch (e) {
    report('share_card_failed', { reason: (e && e.name) || 'error' });
    return 'failed';
  }
  const url = shareUrl();
  const msg = shareText(run);
  const kind = navigator.canShare && navigator.canShare({ files: [file] }) ? 'image' : navigator.share ? 'link' : null;
  if (kind) {
    report('share_sheet_opened', { kind });
    try {
      await navigator.share(kind === 'image' ? { files: [file], title: 'The Court', text: `${msg} ${url}` } : { title: 'The Court', text: msg, url });
      report('share_completed', { kind }); // the share sheet resolved: the user chose where to send it
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') {
        report('share_cancelled', { kind });
        return 'cancelled';
      }
      report('share_failed', { kind, reason: (e && e.name) || 'error' });
      // Fall through to saving it instead.
    }
  }
  // No share sheet (most desktops): download the card and copy the link.
  let copied = false;
  try {
    await navigator.clipboard.writeText(`${msg} ${url}`);
    copied = true;
  } catch {
    /* not allowed here: the download alone */
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  report('share_card_saved', { link_copied: copied });
  return copied ? 'saved' : 'downloaded';
}
