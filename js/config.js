// Online leaderboard settings.
//
// Leave both values empty and the game runs exactly as before, with the
// leaderboard kept on this device only.
//
// To switch the online board on, paste your Supabase project's URL and its
// "anon public" key below (Supabase dashboard -> Project Settings -> API), or
// run scripts/write-config.sh to fill this file from environment variables.
//
// These two values are safe to publish: every visitor's browser receives them
// anyway. What protects the data is the table's Row Level Security policy.
// NEVER put the "service_role" key here.

const DEFAULTS = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  table: 'scores',
};

// window.COURT_CONFIG, if a page sets it before the game loads, wins (used by the tests).
export const CONFIG = { ...DEFAULTS, ...(globalThis.COURT_CONFIG || {}) };

export const onlineEnabled = () => /^https?:\/\//.test(CONFIG.supabaseUrl) && CONFIG.supabaseAnonKey.length > 0;
