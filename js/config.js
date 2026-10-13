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
// The key to use starts with "sb_publishable_" (or is the older "anon" key).
// NEVER put a secret key here: nothing starting "sb_secret_", and not "service_role".

const DEFAULTS = {
  supabaseUrl: 'https://cbbdhnzbqocckyyymszc.supabase.co',
  supabaseAnonKey: 'sb_publishable_-i24A5KT1-sMIuI8_f38mA_V3eYeQSm',
  table: 'thecourt',
};

// window.COURT_CONFIG, if a page sets it before the game loads, wins (used by the tests).
export const CONFIG = { ...DEFAULTS, ...(globalThis.COURT_CONFIG || {}) };

// A secret key pasted here by mistake keeps the online board off rather than shipping it to every visitor.
export const onlineEnabled = () => /^https?:\/\//.test(CONFIG.supabaseUrl) && CONFIG.supabaseAnonKey.length > 0 && !CONFIG.supabaseAnonKey.startsWith('sb_secret_');
