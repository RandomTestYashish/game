"""Live check of the deployed sites: the main (production) site and the test link.

Plays a short run on each with a bot, then reports page errors, the Supabase
leaderboard read, and every PostHog event the page sends (name, deployment
tag, project key; and that no player names go out).

Safe to run against production: score writes are blocked, and production
PostHog events are captured and NOT sent. Test-link events ARE sent (tagged
deployment=test) to prove PostHog accepts them.

PostHog drops events from automated browsers (navigator.webdriver), so this
hides that flag; real players are unaffected.

    python tests/live_check.py
"""
import sys, json, gzip, base64, urllib.parse, re
from playwright.sync_api import sync_playwright
BOT = r"""
window.__bot = { mode: 'win', on: false };
(function loop() {
  const c = window.__court, cv = document.getElementById('court'), bot = window.__bot;
  const g = c.S.game;
  if (bot.on && g && c.S.screen === 'play' && !c.S.leaving) {
    const r = cv.getBoundingClientRect();
    const fire = (type, x) => cv.dispatchEvent(new PointerEvent(type, {
      clientX: r.left + x * r.width / cv.width, clientY: r.top + r.height * 0.8,
      pointerType: 'mouse', pointerId: 1, bubbles: true, cancelable: true }));
    let target = g.paddle.x;
    const live = g.balls.filter(b => !b.stuck);
    if (live.length) {
      const b = live.reduce((a, q) => (q.vy > 0 ? q.y : -q.y - 999) > (a.vy > 0 ? a.y : -a.y - 999) ? q : a);
      let x = b.x;
      if (b.vy > 0) {
        x = b.x + b.vx * (g.paddle.y - b.y) / b.vy;
        for (let i = 0; i < 6 && (x < 4 || x > 196); i++) x = x < 4 ? 8 - x : 392 - x;
      }
      target = bot.mode === 'win' ? x + Math.sin(c.S.time * 1.7) * g.paddle.w * 0.3 : (x < 100 ? 180 : 20);
    }
    const sx = c.proj(Math.max(0, Math.min(200, target)), g.paddle.y).x;
    fire('pointermove', sx);
    if (g.state === 'serve') { fire('pointerdown', sx); fire('pointerup', sx); }
  }
  requestAnimationFrame(loop);
})();
"""
SITES = [("MAIN (production)", "https://randomtestyashish.github.io/game/?debug=1", False, "production"),
         ("TEST LINK", "https://randomtestyashish.github.io/game-code-2/?debug=1", True, "test")]

def decode(req):
    raw = req.post_data_buffer or b""
    url = req.url
    try:
        if raw[:2] == b"\x1f\x8b": raw = gzip.decompress(raw)
    except Exception: pass
    txt = raw.decode("utf-8", "replace")
    if txt.startswith("data="):
        txt = base64.b64decode(urllib.parse.unquote(txt[5:])).decode("utf-8", "replace")
    try: j = json.loads(txt)
    except Exception: return []
    if isinstance(j, dict) and "batch" in j: j = j["batch"]
    return j if isinstance(j, list) else [j]

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    for name, url, let_through, dep in SITES:
        ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1')
        ctx.add_init_script("Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false}); localStorage.setItem('the-court.save', JSON.stringify({version:3,onboarded:true,lastName:'ME',names:['ME']}))")
        events, statuses, writes = [], [], []
        def ph(route, req, let_through=let_through):
            if req.method == "POST" and re.search(r"/(e|i/v0/e|batch|capture)/?", urllib.parse.urlparse(req.url).path):
                events.extend(decode(req))
                if let_through:
                    r = route.fetch(); statuses.append(r.status); route.fulfill(response=r)
                else:
                    route.abort()
            else:
                route.continue_()
        ctx.route("**/*.posthog.com/**", ph)
        ctx.route("https://cbbdhnzbqocckyyymszc.supabase.co/**", lambda r: (writes.append(r.request.url), r.abort()) if r.request.method != "GET" else r.continue_())
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(url)
        pg.wait_for_function("window.__court && __court.S.screen==='title' && __court.S.t>1", timeout=30000)
        pg.evaluate(BOT)
        pg.evaluate("__court.S.introSeen=true; __court.S.timeScale=3; __bot.mode='lose'; __bot.on=true; __court.beginRun(0)")
        pg.wait_for_function("__court.S.screen==='name' && !__court.S.leaving", timeout=240000)
        pg.evaluate("__bot.on=false; __court.S.timeScale=1; __court.S.run.saved=true; __court.S.board={rank:-1,fromRun:true}; __court.S.post={state:'idle',error:'',entry:null}; __court.go('scores')")
        pg.wait_for_function("__court.S.screen==='scores' && __court.S.online.state==='ok'", timeout=30000)
        rows = pg.evaluate("__court.S.online.rows.length")
        pg.wait_for_timeout(6000)  # let PostHog flush its queue
        try: pg.evaluate("window.posthog && posthog.flush && posthog.flush()")
        except Exception: pass
        pg.wait_for_timeout(2500)
        print("==", name)
        print("  page errors:", errs or "none")
        print("  leaderboard read from Supabase:", rows, "rows")
        print("  score writes attempted (blocked by me):", len(writes))
        names = [e.get("event") for e in events]
        print("  PostHog events captured:", sorted(set(names)))
        deps = sorted({(e.get("properties") or {}).get("deployment") for e in events})
        tok = sorted({(e.get("properties") or {}).get("token") for e in events})
        print("  deployment property:", deps, "| project key:", [t[:10] + "..." for t in tok if t])
        bad = [e.get("event") for e in events if any(k in (e.get("properties") or {}) for k in ("name", "player", "player_name"))]
        print("  events carrying a player name (should be none):", bad or "none")
        if let_through: print("  PostHog server responses:", sorted(set(statuses)), "x%d" % len(statuses))
        else: print("  (production events were captured and NOT sent, so real analytics stay clean)")
        ctx.close()
    b.close()
