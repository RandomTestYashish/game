"""Local test server for The Court: the game against the DEV Supabase project.

    python3 scripts/dev-server.py [port]        (default port 8020)

Serves this folder read-only on 127.0.0.1 only, and as it sends index.html
adds the local settings as window.COURT_CONFIG (which js/config.js merges
over its defaults). The settings come from files outside the repository:

    ~/.config/thecourt/dev.json   {"supabaseUrl": "https://<ref>.supabase.co", ...}
    ~/.config/thecourt/mp-key     the dev project's publishable key (sb_publishable_...)

The dev project serves both multiplayer and its own copy of the Rally board.
PostHog stays off. No key is ever printed or logged (nor are query strings,
where invite codes live). Refuses to start for the live leaderboard project
or for anything but a publishable key. Files are never written.
"""

import functools
import http.server
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONF = pathlib.Path.home() / ".config" / "thecourt"
LIVE_LEADERBOARD_REF = "cbbdhnzbqocckyyymszc"  # never used here
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8020

try:
    url = json.loads((CONF / "dev.json").read_text())["supabaseUrl"].strip().rstrip("/")
    key = (CONF / "mp-key").read_text().strip()
except (OSError, KeyError, ValueError) as e:
    sys.exit(f"Missing local settings in {CONF}: {type(e).__name__}. See README (Local testing).")
m = re.fullmatch(r"https://([a-z0-9]{20})\.supabase\.co", url)
if not m or m.group(1) == LIVE_LEADERBOARD_REF:
    sys.exit("Refusing: dev.json does not hold a development project URL.")
if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]{10,}", key):
    sys.exit("Refusing: mp-key does not hold a publishable key.")

override = {
    "supabaseUrl": url, "supabaseAnonKey": key,  # the dev copy of the Rally board
    "mpSupabaseUrl": url, "mpSupabaseAnonKey": key,  # multiplayer
    "multiplayer": True, "posthogKey": "",
}
SNIPPET = ("<script>window.COURT_CONFIG = Object.assign(window.COURT_CONFIG || {}, "
           + json.dumps(override).replace("</", "<\\/") + ");</script>\n    ").encode()
MARK = b'<script type="module" src="js/main.js"'


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):  # read-only: GET and HEAD only
        self.send_error(405)

    do_PUT = do_DELETE = do_PATCH = do_POST

    def send_head(self):
        path = self.path.split("?", 1)[0]
        if any(part.startswith(".") for part in path.split("/") if part):  # no .git, .env...
            self.send_error(404)
            return None
        if path in ("/", "/index.html"):
            body = (ROOT / "index.html").read_bytes()
            if MARK not in body:
                self.send_error(500, "index.html changed: game script not found")
                return None
            body = body.replace(MARK, SNIPPET + MARK, 1)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return io.BytesIO(body)
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # no query strings (invite codes) in the log
        sys.stderr.write("%s %s\n" % (self.command, self.path.split("?", 1)[0]))


server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Handler, directory=str(ROOT)))
print(f"The Court dev server: http://127.0.0.1:{PORT}/  (dev project {m.group(1)[:4]}..., multiplayer on, analytics off)", flush=True)
server.serve_forever()
