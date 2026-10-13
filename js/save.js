// Local save system. All persistence goes through a store with three async
// methods (load / save / clear), so a remote database store can replace
// LocalStore without touching the game. See README "Database upgrade path".

const KEY = 'the-court.save';
export const SAVE_VERSION = 1;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    updatedAt: 0,
    settings: { music: 0.6, sfx: 0.8, muted: false },
    progress: { unlocked: 1, levels: {} }, // levels[id] = { best, stars }
    stats: { plays: 0, wins: 0, blocks: 0 },
  };
}

// Bring any older or partial save up to the current shape.
export function migrate(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const num = (v, fallback, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback);
  const s = raw.settings || {};
  d.settings.music = num(s.music, d.settings.music, 0, 1);
  d.settings.sfx = num(s.sfx, d.settings.sfx, 0, 1);
  d.settings.muted = !!s.muted;
  const p = raw.progress || {};
  d.progress.unlocked = Math.floor(num(p.unlocked, 1, 1, 999));
  for (const [id, v] of Object.entries(p.levels || {})) {
    if (!v || typeof v !== 'object') continue;
    d.progress.levels[id] = { best: Math.floor(num(v.best, 0, 0, 1e9)), stars: Math.floor(num(v.stars, 0, 0, 3)) };
  }
  const st = raw.stats || {};
  for (const k of Object.keys(d.stats)) d.stats[k] = Math.floor(num(st[k], 0, 0, 1e12));
  d.updatedAt = num(raw.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER);
  return d;
}

export class LocalStore {
  constructor(key = KEY) {
    this.key = key;
    this.memory = null; // fallback when localStorage is blocked (private mode, file sandbox)
  }

  async load() {
    try {
      const txt = localStorage.getItem(this.key);
      return txt ? JSON.parse(txt) : this.memory;
    } catch {
      return this.memory;
    }
  }

  async save(data) {
    this.memory = data;
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch {
      /* keep the in-memory copy */
    }
  }

  async clear() {
    this.memory = null;
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* nothing stored */
    }
  }
}

export class Save {
  constructor(store = new LocalStore()) {
    this.store = store;
    this.data = defaultSave();
  }

  async init() {
    this.data = migrate(await this.store.load());
    return this.data;
  }

  commit() {
    this.data.updatedAt = Date.now();
    return this.store.save(this.data);
  }

  // Records a finished rally. Returns what changed so the UI can celebrate.
  recordResult(levelIndex, levelId, levelCount, { won, score, stars, blocks }) {
    const { progress, stats } = this.data;
    stats.plays++;
    stats.blocks += blocks;
    const prev = progress.levels[levelId] || { best: 0, stars: 0 };
    let newBest = false;
    if (won) {
      stats.wins++;
      newBest = score > prev.best;
      progress.levels[levelId] = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, stars) };
      progress.unlocked = Math.max(progress.unlocked, Math.min(levelCount, levelIndex + 2));
    }
    this.commit();
    return { newBest, best: (progress.levels[levelId] || prev).best };
  }

  async erase() {
    const settings = this.data.settings; // keep the player's sound setup
    await this.store.clear();
    this.data = defaultSave();
    this.data.settings = settings;
    return this.commit();
  }
}
