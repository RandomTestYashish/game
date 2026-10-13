// Online leaderboard: READ ONLY. This file only ever asks the database for
// the top scores. It never sends a score, and the database is set up to
// refuse one (see README, "Online leaderboard").

import { CONFIG, onlineEnabled } from './config.js';
import { cleanName, BOARD_SIZE } from './save.js';

const TIMEOUT_MS = 6000;

// Returns { ok: true, rows } or { ok: false, error }. Never throws.
export async function fetchTopScores(limit = BOARD_SIZE) {
  if (!onlineEnabled()) return { ok: false, error: 'not-configured' };
  const base = CONFIG.supabaseUrl.replace(/\/+$/, '');
  const url = `${base}/rest/v1/${encodeURIComponent(CONFIG.table)}?select=name,score,court&order=score.desc&limit=${limit}`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { apikey: CONFIG.supabaseAnonKey, Authorization: 'Bearer ' + CONFIG.supabaseAnonKey },
      signal: abort.signal,
    });
    if (!res.ok) return { ok: false, error: 'http-' + res.status };
    const data = await res.json();
    if (!Array.isArray(data)) return { ok: false, error: 'bad-response' };
    return { ok: true, rows: data.map(cleanRow).filter(Boolean).slice(0, limit) };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

// Never trust what comes back: keep only well-formed rows, in the same shape
// and with the same name rules as local scores.
function cleanRow(r) {
  if (!r || typeof r !== 'object') return null;
  const score = Math.floor(Number(r.score));
  if (!isFinite(score) || score < 0) return null;
  const court = Math.floor(Number(r.court));
  return { name: cleanName(r.name) || 'PLAYER', score, court: isFinite(court) && court > 0 ? court : 1 };
}
