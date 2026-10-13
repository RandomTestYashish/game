#!/bin/sh
# Fills js/config.js from two environment variables. A plain static site has
# no environment at runtime, so this is how the values get into the game.
#
#   SUPABASE_URL=https://abcd1234.supabase.co \
#   SUPABASE_ANON_KEY=sb_publishable_... \
#   SUPABASE_TABLE=scores \
#   sh scripts/write-config.sh
#
# Run it with neither variable set to switch the online board off again.
set -e
cd "$(dirname "$0")/.."
case "$SUPABASE_ANON_KEY" in *service_role*|sb_secret_*) echo "Refusing: that is a secret key. Use the publishable (anon) key." >&2; exit 1;; esac
python3 - "$SUPABASE_URL" "$SUPABASE_ANON_KEY" "${SUPABASE_TABLE:-scores}" <<'PY'
import json, re, sys
url, key, table = sys.argv[1], sys.argv[2], sys.argv[3]
p = 'js/config.js'
s = open(p).read()
s = re.sub(r"supabaseUrl: '[^']*'", "supabaseUrl: " + json.dumps(url).replace('"', "'"), s, 1)
s = re.sub(r"supabaseAnonKey: '[^']*'", "supabaseAnonKey: " + json.dumps(key).replace('"', "'"), s, 1)
s = re.sub(r"table: '[^']*'", "table: " + json.dumps(table).replace('"', "'"), s, 1)
open(p, 'w').write(s)
print('js/config.js:', 'online board ON for ' + url + ' table ' + table if url and key else 'online board OFF (device-only leaderboard)')
PY
