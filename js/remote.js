// Online leaderboard. Reads the top scores, and posts a finished run's score
// through the database function submit_score (supabase/submit_score.sql).
// The public key cannot write to the table directly; only that function can,
// and it checks every value first.

import { CONFIG, onlineEnabled } from './config.js';
import { cleanName, BOARD_SIZE } from './save.js';

const TIMEOUT_MS = 6000;

const headers = () => ({ apikey: CONFIG.supabaseAnonKey, Authorization: 'Bearer ' + CONFIG.supabaseAnonKey });
const base = () => CONFIG.supabaseUrl.replace(/\/+$/, '');

// Returns { ok: true, rows } or { ok: false, error }. Never throws.
export async function fetchTopScores(limit = BOARD_SIZE) {
  if (!onlineEnabled()) return { ok: false, error: 'not-configured' };
  const url = `${base()}/rest/v1/${encodeURIComponent(CONFIG.table)}?select=name,score,court&order=score.desc&limit=${limit}`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: headers(),
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

// Is this name already on the online board? A read, like fetchTopScores.
// Returns { ok: true, taken } or { ok: false, error }. Never throws.
export async function nameTaken(name) {
  if (!onlineEnabled()) return { ok: false, error: 'not-configured' };
  const clean = cleanName(name);
  if (!clean) return { ok: true, taken: false };
  const url = `${base()}/rest/v1/${encodeURIComponent(CONFIG.table)}?select=name&name=eq.${encodeURIComponent(clean)}&limit=1`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: headers(), signal: abort.signal });
    if (!res.ok) return { ok: false, error: 'http-' + res.status };
    const data = await res.json();
    if (!Array.isArray(data)) return { ok: false, error: 'bad-response' };
    return { ok: true, taken: data.length > 0 };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

// Post one score. Returns { ok: true } or { ok: false, error }. Never throws.
export async function submitScore(name, score, court) {
  if (!onlineEnabled()) return { ok: false, error: 'not-configured' };
  const body = { p_name: cleanName(name) || 'PLAYER', p_score: Math.floor(score), p_court: Math.floor(court) };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}/rest/v1/rpc/submit_score`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
    return res.ok ? { ok: true } : { ok: false, error: 'http-' + res.status };
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
