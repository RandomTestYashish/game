"""End-to-end test for The Court. Drives the real game in headless Chrome.

    pip install playwright
    python tests/e2e.py            # uses the installed Google Chrome

It serves the repo on a free local port, then checks every screen, the
controls (mouse, keyboard, touch), the rules, sound settings, the save
system, and that each level can be played through to "Rally Complete".
"""

import functools
import http.server
import json
import pathlib
import sys
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("  ok   " if ok else "  FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# In-page helper: steers with synthetic pointer events on the canvas, so the
# game's own input handlers do the work. mode 'win' tracks the ball, 'lose'
# keeps the paddle away from it.
BOT = """
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

# Pure rules checks, run in the page against a fresh Game with a seeded RNG.
RULES = """
async () => {
  const { Game, WW, WH, TOOL_TIME } = await import('/js/game.js');
  const { LEVELS } = await import('/js/levels.js');
  const out = {};
  const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const fresh = (i = 0) => { const g = new Game(LEVELS[i], () => {}, rng(7 + i)); for (let k = 0; k < 200; k++) g.update(1 / 60); return g; };
  const run = (g, secs) => { for (let k = 0; k < secs * 120; k++) g.update(1 / 120); };

  let g = fresh();
  out.blocksLand = g.ready && g.state === 'serve' && g.balls[0].stuck;
  out.launch = g.launch() && g.state === 'play' && !g.balls[0].stuck;

  // Paddle bounce
  g = fresh(); g.launch(); let b = g.balls[0];
  Object.assign(b, { x: g.paddle.x + 10, y: g.paddle.y - 14, vx: 0, vy: 1 }); run(g, 0.2);
  out.paddleBounce = b.vy < 0 && b.vx > 0;

  // Walls keep the ball in court
  g = fresh(); g.launch(); b = g.balls[0];
  Object.assign(b, { x: 20, y: 200, vx: -0.9, vy: -0.436 }); run(g, 0.4);
  out.wallBounce = b.vx > 0 && b.x >= b.r;

  // Block collision: damage, score and reflection
  g = fresh(); g.launch(); b = g.balls[0];
  let blk = g.blocks.filter(q => q.type === 'L').sort((p, q) => q.y - p.y)[0];
  Object.assign(b, { x: blk.x + blk.w / 2, y: blk.y + blk.d + 12, vx: 0, vy: -1 }); run(g, 0.2);
  out.blockBreak = !blk.alive && g.score === 15 && b.vy > 0 && g.remaining === g.total - 1;
  blk = g.blocks.find(q => q.type === 'H' && q.alive);
  for (const q of g.blocks) if (q !== blk && q.r >= blk.r) q.alive = false;
  Object.assign(b, { x: blk.x + blk.w / 2, y: blk.y + blk.d + 12, vx: 0, vy: -1 }); run(g, 0.2);
  out.hedgeTakesTwo = blk.alive && blk.hp === 1;

  // Lives and game over
  g = fresh(); const ev = []; g.emit = (t) => ev.push(t);
  for (let i = 0; i < 3; i++) { g.launch(); Object.assign(g.balls[0], { x: 5, y: WH, vx: 0, vy: 1 }); g.movePaddleTo(190); run(g, 0.5); }
  out.livesAndGameOver = g.lives === 0 && g.state === 'over' && ev.filter(t => t === 'lost').length === 2 && ev.includes('over');

  // Win
  g = fresh(); g.launch(); g.emit = (t) => ev.push(t);
  g.blocks.slice(1).forEach(q => (q.alive = false)); g.remaining = 1; blk = g.blocks[0]; b = g.balls[0];
  Object.assign(b, { x: blk.x + blk.w / 2, y: blk.y + blk.d + 10, vx: 0, vy: -1 }); run(g, 0.2);
  out.win = g.state === 'won' && g.bonus === 300 && g.stars === 3 && ev.includes('win');

  // A run carries score and lives into the next court
  g = new Game(LEVELS[1], () => {}, rng(3), { lives: 4, score: 900 });
  out.runCarries = g.lives === 4 && g.score === 900 && g.startScore === 900;

  // 3D motion: blocks float on every court, and drifting formations advance
  g = fresh(0); run(g, 0.4);
  out.blocksFloat = g.blocks.some(q => q.bob > 0.3);
  const di = LEVELS.findIndex(l => l.drift > 0); g = fresh(di); const y0 = g.blocks[0].y; run(g, 3);
  out.formationDrifts = g.blocks[0].y > y0 + 1;

  // Level set
  const ids = new Set(LEVELS.map(l => l.id)), names = new Set(LEVELS.map(l => l.name));
  out.levelCount = LEVELS.length >= 100 && ids.size === LEVELS.length && names.size === LEVELS.length;
  out.levelsWellFormed = LEVELS.every(l => l.rows.length >= 4 && l.rows.length <= 7 && l.rows.every(r => /^[.TLHS]{7}$/.test(r))
    && l.rows.join('').replace(/\./g, '').length >= 14 && (l.move || []).every(r => l.rows[r][0] === '.' && l.rows[r][6] === '.'));
  out.getsHarder = LEVELS[119].speed > LEVELS[0].speed * 1.6 && LEVELS[119].paddle < LEVELS[0].paddle - 10 && LEVELS[0].speed >= 160;

  // Tools
  g = fresh(); g.launch(); g.applyTool('shield'); b = g.balls[0];
  Object.assign(b, { x: 10, y: WH - 12, vx: 0, vy: 1 }); g.movePaddleTo(190); run(g, 0.3);
  out.shield = !g.shield && b.vy < 0 && g.balls.length === 1 && g.lives === 3;

  g = fresh(); g.launch(); g.applyTool('multiball');
  out.multiball = g.balls.length === 3 && g.balls.every(q => Math.abs(Math.hypot(q.vx, q.vy) - 1) < 1e-6);

  g = fresh(); g.launch(); g.applyTool('smash'); b = g.balls[0];
  blk = g.blocks.find(q => q.type === 'H' && q.c === 1);
  const before = g.remaining;
  Object.assign(b, { x: blk.x + blk.w / 2, y: blk.y + blk.d + 10, vx: 0, vy: -1 }); run(g, 0.35);
  out.smash = !blk.alive && g.remaining <= before - 2 && b.y < blk.y;
  run(g, TOOL_TIME.smash); out.smashExpires = g.fx.smash === 0;

  g = fresh(2); g.launch(); const mover = g.blocks.find(q => q.amp); const x0 = mover.x;
  run(g, 0.3); const moved = mover.x !== x0;
  g.applyTool('freeze'); const x1 = mover.x; b = g.balls[0];
  blk = g.blocks.find(q => q.type === 'S');
  for (const q of g.blocks) if (q !== blk && q !== mover) q.alive = false;
  Object.assign(b, { x: blk.x + blk.w / 2, y: blk.y + blk.d + 10, vx: 0, vy: -1 }); run(g, 0.2);
  out.freeze = moved && mover.x === x1 && !blk.alive;

  g = fresh(); g.launch(); g.balls[0].y = 60; g.applyTool('expand'); run(g, 1);
  const wide = g.paddle.w; run(g, TOOL_TIME.expand + 1);
  out.expand = wide === LEVELS[0].paddle + 26 && g.paddle.w === LEVELS[0].paddle;

  const fall = (tool) => { const q = fresh(); q.blocks.forEach(k => (k.alive = false)); q.launch(); if (tool) q.applyTool(tool);
    Object.assign(q.balls[0], { x: 100, y: 20, vx: 0, vy: 1 }); q.movePaddleTo(27); run(q, 0.4); return q.balls[0].y - 20; };
  out.lowgrav = Math.abs(fall('lowgrav') / fall(null) - 0.6) < 0.02;

  // Tool pickup
  g = fresh(); g.launch(); g.balls[0].y = 40; const tok = { type: 'expand', x: g.paddle.x, y: g.paddle.y - 20, t: 0 }; g.drops.push(tok); run(g, 0.4);
  out.pickup = g.fx.expand > 0 && !g.drops.includes(tok);

  // Long soak on every level: a simple bot must be able to clear it, the ball
  // must stay finite and in bounds, and tools must actually drop.
  out.levels = [];
  for (let i = 0; i < LEVELS.length; i++) {
    g = new Game(LEVELS[i], () => {}, rng(100 + i));
    let bad = false, drops = 0, t = 0;
    g.emit = (e) => { if (e === 'drop') drops++; };
    while (t < 900 && g.state !== 'won' && g.state !== 'over') {
      if (g.state === 'serve' && g.ready) g.launch();
      const low = g.balls.filter(q => q.vy > 0).sort((p, q) => q.y - p.y)[0];
      if (low) g.movePaddleTo(low.x + Math.sin(t * 1.7) * g.paddle.w * 0.3);
      g.update(1 / 60); t += 1 / 60;
      for (const q of g.balls) if (!isFinite(q.x + q.y) || q.x < 0 || q.x > WW || q.y < 0) bad = true;
    }
    out.levels.push({ n: i + 1, state: g.state, secs: Math.round(t), drops, bad });
  }
  return out;
}
"""


# The main suites run as a returning player, so they see the normal menus.
RETURNING = "if(!localStorage.getItem('the-court.save')) localStorage.setItem('the-court.save', JSON.stringify({version:3,onboarded:true}))"


class Driver:
    def __init__(self, page):
        self.pg = page
        self.errors = []
        page.on("console", lambda m: self.errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: self.errors.append("PAGEERROR " + str(e)))

    def ev(self, js):
        return self.pg.evaluate(js)

    def wait(self, js, timeout=15000):
        self.pg.wait_for_function(js, timeout=timeout)

    def screen(self, name, settle=0.5, timeout=15000):
        self.wait(f"__court.S.screen==='{name}' && !__court.S.leaving && __court.S.t>{settle}", timeout)

    def point(self, rid):
        self.wait(f"__court.ui.regions.some(r=>r.id==='{rid}')")
        return self.ev(
            "(()=>{const r=__court.ui.regions.find(r=>r.id==='%s');const c=document.getElementById('court').getBoundingClientRect();"
            "const k=c.width/document.getElementById('court').width;return [c.left+(r.x+r.w/2)*k,c.top+(r.y+r.h/2)*k]})()" % rid
        )

    def click(self, rid):
        x, y = self.point(rid)
        self.pg.mouse.click(x, y)

    def tap(self, rid):
        x, y = self.point(rid)
        self.pg.touchscreen.tap(x, y)

    def shot(self, name):
        if SHOTS:
            self.pg.screenshot(path=str(SHOTS / f"{name}.png"))

    def saved(self):
        return json.loads(self.ev("localStorage.getItem('the-court.save')") or "null")


def desktop(browser, url):
    print("desktop 1280x800 - mouse and keyboard")
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    ctx.add_init_script(RETURNING)
    d = Driver(ctx.new_page())
    pg = d.pg
    pg.goto(url)
    d.wait("window.__court && __court.S.screen==='loading'")
    d.shot("01-preparing")
    check("loading screen shows first", True)
    d.screen("title", 1.4)
    d.shot("02-title")
    ids = d.ev("__court.ui.regions.map(r=>r.id).join()")
    check("landing screen is minimal: Play is the only control", ids == "play", ids)

    # --- sound controls (reached from the courts screen)
    d.click("play")
    d.screen("courts", 0.6)
    d.click("sound")
    d.wait("__court.S.overlayT>=1")
    x, y = d.point("music")
    pg.mouse.move(x, y)
    pg.mouse.down()
    pg.mouse.move(x - 400, y, steps=5)
    pg.mouse.up()
    check("music slider drags to 0", d.ev("__court.save.data.settings.music") == 0)
    pg.mouse.move(x, y)
    pg.mouse.down()
    pg.mouse.move(x + 20, y, steps=3)
    pg.mouse.up()
    music = d.ev("__court.save.data.settings.music")
    check("music slider sets a mid value", 0.4 < music < 0.9, music)
    x, y = d.point("sfx")
    pg.mouse.click(x - 30, y)
    sfx = d.ev("__court.save.data.settings.sfx")
    check("effects slider responds to a click", 0.05 < sfx < 0.5, sfx)
    time.sleep(0.3)
    gains = d.ev("[__court.audio.ac.state, __court.audio.musicG.gain.value, __court.audio.sfxG.gain.value, __court.audio.master.gain.value]")
    check("audio graph follows the sliders", gains[0] == "running" and abs(gains[1] - music * 0.5) < 0.02 and abs(gains[2] - sfx * 0.6) < 0.02 and gains[3] > 0.95, gains)
    d.click("mute")
    time.sleep(0.3)
    check("mute button silences master", d.ev("__court.save.data.settings.muted") and d.ev("__court.audio.master.gain.value") < 0.02)
    d.shot("03-sound")
    pg.keyboard.press("m")
    time.sleep(0.3)
    check("M key unmutes", not d.ev("__court.save.data.settings.muted") and d.ev("__court.audio.master.gain.value") > 0.95)
    d.click("done")
    d.wait("__court.S.overlayT<=0")
    s = d.saved()
    check("sound settings are saved", s and s["settings"]["music"] == music and s["settings"]["sfx"] == sfx and s["settings"]["muted"] is False, s and s["settings"])
    check("music is scheduled", d.ev("__court.audio.playing && __court.audio.step>0"))
    pg.keyboard.press("Escape")
    d.screen("title")
    d.ev("__court.S.introSeen=false")

    # --- menu flow
    d.click("play")
    d.screen("intro", 0.9)
    d.shot("04-elevated-rally")
    check("intro screen (Elevated Rally)", True)
    d.screen("courts", 0.6)
    d.shot("05-courts")
    locked = d.ev("__court.ui.regions.filter(r=>/^court\\d+$/.test(r.id)).map(r=>r.id).join()")
    check("courts screen: only court 1 unlocked on a fresh save", locked == "court0", locked)
    d.click("nextpage")
    time.sleep(0.2)
    check("courts screen pages through 120 courts", d.ev("__court.S.page") == 1 and d.ev("__court.LEVELS.length") == 120)
    pg.keyboard.press("ArrowLeft")
    time.sleep(0.2)
    d.click("court0")
    d.screen("tools", 0.6)
    d.click("tool2")
    check("tools screen: selecting a tool", d.ev("__court.S.tool") == 2)
    d.shot("06-tools")
    d.click("back")
    d.screen("courts")
    pg.keyboard.press("Escape")
    d.screen("title")
    check("back navigation (button and Escape)", True)
    d.click("play")
    d.screen("courts", 0.6)
    d.click("court0")
    d.screen("tools", 0.6)
    d.click("begin")
    d.screen("countdown", 0.4)
    d.shot("07-countdown")
    check("countdown screen", d.ev("__court.S.game.balls[0].stuck"))
    d.screen("play", 0.2)
    check("ball auto-serves after the countdown", d.ev("__court.S.game.state==='play'"))

    # --- real mouse steering
    box = d.ev("(()=>{const r=document.getElementById('court').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()")
    pg.mouse.move(box[0] + box[2] * 0.3, box[1] + box[3] * 0.8)
    time.sleep(0.8)
    left = d.ev("[__court.S.game.paddle.x, __court.proj(100,0).x, __court.S.shift]")
    pg.mouse.move(box[0] + box[2] * 0.7, box[1] + box[3] * 0.8)
    time.sleep(0.8)
    right = d.ev("[__court.S.game.paddle.x, __court.proj(100,0).x, __court.S.shift]")
    check("mouse moves the paddle", left[0] < 60 and right[0] > 140, (round(left[0]), round(right[0])))
    check("3D camera trucks with the paddle (far court slides against near)", right[1] - left[1] > 4 and left[2] < -5 and right[2] > 5, (left[1], right[1]))

    # --- pause / resume
    pg.keyboard.press("p")
    d.screen("paused", 0.5)
    a = d.ev("[__court.S.game.balls[0].x, __court.S.game.balls[0].y]")
    time.sleep(0.4)
    b = d.ev("[__court.S.game.balls[0].x, __court.S.game.balls[0].y]")
    check("P pauses and the ball holds still", a == b)
    d.shot("08-paused")
    d.click("resume")
    d.screen("play", 0.1)
    time.sleep(0.2)
    c = d.ev("[__court.S.game.balls.length ? __court.S.game.balls[0].y : -1, __court.S.game.t]")
    check("resume continues play", d.ev("__court.S.screen") == "play" and c != b)
    d.click("pause")
    d.screen("paused", 0.5)
    check("pause button works", True)
    d.click("restart")
    d.screen("countdown", 0.05)
    check("restart from pause gives a fresh rally", d.ev("__court.S.game.score===0 && __court.S.game.lives===3 && __court.S.game.remaining===__court.S.game.total"))
    d.screen("play", 0.1)

    # --- keyboard steering and serving
    d.ev("(()=>{const g=__court.S.game; g.balls=[]; g.loseLife();})()")
    check("losing a ball costs a life", d.ev("__court.S.game.lives") == 2 and d.ev("__court.S.game.state") == "serve")
    pg.mouse.move(box[0] + box[2] * 0.5, box[1] + box[3] * 0.8)
    x0 = d.ev("__court.S.game.paddle.x")
    pg.keyboard.down("ArrowLeft")
    time.sleep(0.25)
    pg.keyboard.up("ArrowLeft")
    x1 = d.ev("__court.S.game.paddle.x")
    pg.keyboard.down("d")
    time.sleep(0.4)
    pg.keyboard.up("d")
    x2 = d.ev("__court.S.game.paddle.x")
    check("arrow keys and A/D move the paddle", x1 < x0 - 30 and x2 > x1 + 50, (round(x0), round(x1), round(x2)))
    d.shot("09-serve")
    pg.keyboard.press("Space")
    check("Space serves", d.ev("__court.S.game.state") == "play")

    # --- play court 1 to the end with the bot, through the real frame loop
    pg.evaluate(BOT)
    d.ev("__court.S.timeScale=3; __bot.on=true")
    d.wait("__court.S.game.score>100", 60000)
    d.shot("10-play")
    check("blocks break and score climbs", True)
    d.screen("complete", 1.4, 240000)
    d.shot("11-rally-complete")
    r = d.ev("__court.S.result")
    check("court 1 completes -> Rally Complete", r["won"] and r["score"] > 300 and r["newBest"], r)
    s = d.saved()
    check("win is saved (best score, stars, next court unlocked)", s["progress"]["unlocked"] == 2 and s["progress"]["levels"]["baseline"]["best"] == r["score"] and s["progress"]["levels"]["baseline"]["stars"] == r["stars"], s["progress"])

    # --- Next carries the run; then lose on purpose
    lives = d.ev("__court.S.game.lives")
    d.click("next")
    d.screen("play", 0.1, 20000)
    g = d.ev("[__court.S.level, __court.S.game.score, __court.S.game.lives]")
    check("Next carries score and adds a ball", g[0] == 1 and g[1] >= r["run"] and g[2] == min(5, lives + 1), g)
    d.ev("__bot.mode='lose'")
    d.screen("name", 1.0, 240000)
    run = d.ev("__court.S.run.score")
    check("losing every ball ends the run on the name screen", d.ev("__court.S.game.lives") == 0 and run >= r["run"], run)

    # --- leaderboard: type a name, save, see it listed
    pg.keyboard.type("pando")
    pg.keyboard.press("Backspace")
    d.click("keyA")
    check("name entry by keyboard and on-screen keys", d.ev("__court.S.name") == "PANDA", d.ev("__court.S.name"))
    d.shot("12-name-entry")
    d.click("save")
    d.screen("scores", 0.8)
    d.shot("13-leaderboard")
    s2 = d.saved()
    top = s2["leaderboard"][0]
    check("score is added to the leaderboard and saved", len(s2["leaderboard"]) == 1 and top["name"] == "PANDA" and top["score"] == run and top["court"] == 2 and d.ev("__court.S.board.rank") == 0, top)
    check("a loss keeps progress and counts the play", s2["progress"] == s["progress"] and s2["stats"]["plays"] == 2 and s2["stats"]["wins"] == 1, s2["stats"])
    d.click("again")
    d.screen("play", 0.1, 20000)
    check("Play Again starts a fresh run with 3 balls", d.ev("__court.S.game.lives===3 && __court.S.game.score===0 && __court.S.level===1"))

    # --- stopping mid-run from the pause menu also offers the leaderboard
    d.ev("__bot.mode='win'")
    d.wait("__court.S.game.score>60", 60000)
    pg.keyboard.press("Escape")
    d.screen("paused", 0.5)
    d.click("home")
    d.screen("name", 0.8)
    check("Home mid-run asks for a name", d.ev("__court.S.nameTitle") == "RALLY ENDED" and d.ev("__court.S.name") == "PANDA")
    pg.keyboard.press("Enter")
    d.screen("scores", 0.8)
    check("second score is ranked", len(d.saved()["leaderboard"]) == 2 and d.saved()["leaderboard"][0]["score"] >= d.saved()["leaderboard"][1]["score"])
    d.click("home")
    d.screen("title", 0.6)
    check("Home returns to the title", True)

    # --- a run with no points skips name entry
    d.ev("__bot.mode='lose'; __court.beginRun(0)")
    d.screen("name", 0.8, 240000)
    if d.ev("__court.S.run.score") == 0:
        check("a scoreless run offers Retry instead of name entry", d.ev("__court.ui.regions.some(r=>r.id==='retry') && !__court.ui.regions.some(r=>r.id==='save')"))
        d.click("home")
    else:
        d.click("skip")
        d.screen("scores", 0.6)
        check("Skip leaves the leaderboard unchanged", len(d.saved()["leaderboard"]) == 2)
        d.click("home")
    d.screen("title", 0.6)

    # --- persistence across a reload
    pg.reload()
    d.screen("title", 1.4)
    check("save survives a reload", d.ev("__court.save.data.progress.unlocked") == 2 and d.ev("__court.save.data.settings.music") == music and d.ev("__court.save.data.leaderboard.length") == 2)
    d.click("play")
    d.screen("courts", 0.6)
    d.click("scores")
    d.screen("scores", 0.6)
    check("leaderboard opens from the courts screen", d.ev("__court.ui.regions.some(r=>r.id==='back')"))
    pg.keyboard.press("Escape")
    d.screen("title", 0.6)
    d.click("play")
    d.screen("courts", 0.6)
    check("court 2 is now selectable", d.ev("__court.ui.regions.some(r=>r.id==='court1') && !__court.ui.regions.some(r=>r.id==='court2')"))

    # --- animated background
    pg.keyboard.press("Escape")
    d.screen("title", 0.6)
    grab = "(()=>{const c=document.getElementById('court');return Array.from(c.getContext('2d').getImageData(0,0,c.width,Math.floor(c.height*0.3)).data).reduce((a,v,i)=>(a+v*(i%251+1))%1000003,0)})()"
    a1 = d.ev(grab)
    time.sleep(1.2)
    check("background is in motion (sky changes between frames)", d.ev(grab) != a1)

    # --- a spread of later courts, each played through in the browser
    pg.evaluate(BOT)
    for i in (2, 39, 79, 119):
        won = False
        for attempt in range(5):
            d.ev(f"__court.S.timeScale=2; __bot.mode='win'; __bot.on=true; __court.save.data.progress.unlocked=120; __court.beginRun({i})")
            d.wait(f"__court.S.level==={i} && __court.S.screen==='play'", 30000)
            d.wait("(__court.S.screen==='complete'||__court.S.screen==='name') && !__court.S.leaving && __court.S.t>1", 400000)
            if d.ev("__court.S.screen") == "complete":
                won = True
                break
        d.shot(f"14-court-{i + 1}")
        r = d.ev("__court.S.result")
        check(f"court {i + 1} plays through to Rally Complete", won, {"score": r["score"], "stars": r["stars"], "attempts": attempt + 1})
    check("last court offers no Next button", d.ev("!__court.ui.regions.some(r=>r.id==='next') && __court.ui.regions.some(r=>r.id==='replay')"))
    d.ev("__bot.on=false; __court.S.timeScale=1")
    d.click("home")
    d.screen("name", 0.6)
    pg.keyboard.press("Escape")
    d.screen("scores", 0.6)
    d.click("home")
    d.screen("title", 0.6)

    # --- erase save
    d.click("play")
    d.screen("courts", 0.6)
    d.click("sound")
    d.wait("__court.S.overlayT>=1")
    d.click("erase")
    time.sleep(0.15)
    check("erase needs a second tap", d.ev("__court.save.data.progress.unlocked") == 120)
    d.click("erase")
    time.sleep(0.3)
    s = d.saved()
    check("erase clears progress and leaderboard but keeps sound settings", s["progress"]["unlocked"] == 1 and s["progress"]["levels"] == {} and s["leaderboard"] == [] and s["settings"]["music"] == music and s["onboarded"] is False, s)
    pg.keyboard.press("Escape")
    d.wait("__court.S.overlayT<=0")

    # --- rules, in isolation
    out = pg.evaluate(RULES)
    for k, v in out.items():
        if k != "levels":
            check("rules: " + k, v)
    bad = [lv for lv in out["levels"] if lv["state"] != "won" or lv["bad"] or lv["drops"] == 0]
    secs = [lv["secs"] for lv in out["levels"]]
    check(f"rules: all {len(out['levels'])} courts clearable, ball stays in court, tools drop", not bad, bad[:3] or f"{min(secs)}-{max(secs)}s of play each")

    fit = d.ev("(()=>{const r=document.getElementById('court').getBoundingClientRect();return [r.width,r.height,innerWidth,innerHeight].concat(__court.size())})()")
    check("desktop: canvas fills the whole window and the court view widens", fit[0] >= fit[2] * 0.98 and fit[1] >= fit[3] * 0.98 and fit[4] > 400, fit)
    check("no console errors (desktop)", not d.errors, d.errors[:3])
    ctx.close()


def touch_device(browser, url, name, w, h):
    print(f"{name} {w}x{h} - touch")
    ctx = browser.new_context(viewport={"width": w, "height": h}, has_touch=True, is_mobile=True, device_scale_factor=2)
    ctx.add_init_script(RETURNING)
    d = Driver(ctx.new_page())
    pg = d.pg
    pg.goto(url)
    d.screen("title", 1.4)
    fit = d.ev("(()=>{const r=document.getElementById('court').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,innerWidth,innerHeight,document.documentElement.scrollWidth,document.documentElement.scrollHeight]})()")
    inside = fit[0] >= 0 and fit[1] >= 0 and fit[2] <= fit[4] + 0.5 and fit[3] <= fit[5] + 0.5 and fit[6] <= fit[4] and fit[7] <= fit[5]
    fills = (fit[2] - fit[0]) >= fit[4] * 0.98 and (fit[3] - fit[1]) >= fit[5] * 0.98
    check(f"{name}: canvas fits the viewport with no scrolling", inside and fills, [round(v) for v in fit])
    d.shot(f"{name}-title")
    d.tap("play")
    d.screen("intro", 0.3)
    pg.touchscreen.tap(w / 2, h / 2)
    d.screen("courts", 0.6)
    check(f"{name}: tapping skips the intro", True)
    d.tap("court0")
    d.screen("tools", 0.6)
    d.shot(f"{name}-tools")
    d.tap("begin")
    d.screen("play", 0.3)
    d.shot(f"{name}-play")
    check(f"{name}: touch reaches gameplay", d.ev("__court.S.touch") is True)

    # Relative drag steering through raw touch events.
    cdp = ctx.new_cdp_session(pg)
    d.ev("(()=>{const g=__court.S.game; g.balls=[]; g.loseLife(); g.movePaddleTo(100)})()")

    def touch(kind, x, y):
        pts = [] if kind == "touchEnd" else [{"x": x, "y": y, "id": 1}]
        cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": pts})

    y = h * 0.6
    touch("touchStart", w * 0.3, y)
    for i in range(1, 9):
        touch("touchMove", w * 0.3 + w * 0.25 * i / 8, y)
        time.sleep(0.016)
    touch("touchEnd", 0, 0)
    time.sleep(0.1)
    px = d.ev("__court.S.game.paddle.x")
    check(f"{name}: dragging steers the paddle", px > 130 and d.ev("__court.S.game.state") == "serve", round(px))
    pg.touchscreen.tap(w * 0.5, h * 0.5)
    time.sleep(0.1)
    check(f"{name}: tap serves", d.ev("__court.S.game.state") == "play")
    d.tap("pause")
    d.screen("paused", 0.5)
    d.shot(f"{name}-paused")
    check(f"{name}: pause button", True)
    d.tap("sound")
    d.wait("__court.S.overlayT>=1")
    d.tap("mute")
    check(f"{name}: sound toggle by touch", d.ev("__court.save.data.settings.muted") is True)
    d.tap("done")
    d.wait("__court.S.overlayT<=0")
    d.ev("__court.S.game.score=420; __court.S.run.score=420")
    d.tap("home")
    d.screen("name", 0.8)
    for key in ("keyT", "keyA", "keyP", "keyP", "keydel"):
        d.tap(key)
        time.sleep(0.05)
    d.shot(f"{name}-name")
    d.tap("save")
    d.screen("scores", 0.8)
    d.shot(f"{name}-leaderboard")
    top = d.saved()["leaderboard"][0]
    check(f"{name}: name typed on the on-screen keys reaches the leaderboard", top["name"] == "TAP" and top["score"] == 420, top)
    d.tap("home")
    d.screen("title", 0.6)

    # Rotate / resize while running.
    pg.set_viewport_size({"width": h, "height": w})
    time.sleep(0.5)
    fit = d.ev("(()=>{const r=document.getElementById('court').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,innerWidth,innerHeight]})()")
    check(f"{name}: refills the screen after rotating to landscape", fit[0] >= 0 and fit[2] <= fit[4] + 0.5 and fit[3] <= fit[5] + 0.5 and (fit[3] - fit[1]) >= fit[5] * 0.98 and (fit[2] - fit[0]) >= fit[4] * 0.98, [round(v) for v in fit])
    d.shot(f"{name}-landscape")
    d.tap("play")
    d.wait("__court.S.screen==='courts' || __court.S.screen==='intro'")
    check(f"{name}: still interactive in landscape", True)
    check(f"no console errors ({name})", not d.errors, d.errors[:3])
    ctx.close()


def first_time(browser, url):
    print("first-time journey - new and returning players")
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    d = Driver(ctx.new_page())
    pg = d.pg
    pg.goto(url)
    d.screen("title", 1.4)
    check("new user: no save yet, not onboarded", d.saved() is None and d.ev("__court.save.data.onboarded") is False)
    d.click("play")
    d.screen("intro", 0.3)
    d.wait("__court.S.screen==='countdown' || __court.S.screen==='courts' || __court.S.screen==='tools'", 15000)
    check("new user: Play goes intro -> court 1, skipping courts and tools", d.ev("__court.S.screen") == "countdown" and d.ev("__court.S.level") == 0)
    d.screen("play", 0.4)
    g = d.ev("[__court.S.game.state, __court.S.coach.step, __court.S.game.level.speed, __court.LEVELS[0].speed, __court.ui.regions.some(r=>r.id==='skiptips')]")
    check("new user: ball waits on the paddle with a 'move' hint and a slower ball", g[0] == "serve" and g[1] == "move" and g[2] < g[3] and g[4], g)
    d.shot("ftue-1-move")
    time.sleep(1.0)
    check("new user: nothing happens until they act", d.ev("__court.S.game.state") == "serve")
    box = d.ev("(()=>{const r=document.getElementById('court').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()")
    pg.mouse.move(box[0] + box[2] * 0.4, box[1] + box[3] * 0.8)
    pg.mouse.move(box[0] + box[2] * 0.6, box[1] + box[3] * 0.8, steps=8)
    time.sleep(0.2)
    check("new user: moving the paddle advances to the 'serve' hint", d.ev("__court.S.coach.step") == "serve")
    d.shot("ftue-2-serve")
    pg.keyboard.press("Space")
    time.sleep(0.2)
    check("new user: serving advances to the 'break' hint", d.ev("__court.S.game.state") == "play" and d.ev("__court.S.coach.step") == "break")
    pg.evaluate(BOT)
    d.ev("__court.S.timeScale=2; __bot.on=true")
    d.wait("__court.S.coach && __court.S.coach.step==='tool'", 60000)
    check("new user: the first tool is Expand, with a hint", d.ev("__court.S.game.drops[0].type") == "expand")
    d.shot("ftue-3-tool")
    check("new user: still not marked onboarded mid-rally", d.ev("__court.save.data.onboarded") is False)
    d.wait("(__court.S.screen==='complete'||__court.S.screen==='name') && !__court.S.leaving && __court.S.t>1", 300000)
    s = d.saved()
    check("new user: finishing the first rally marks them onboarded and saves it", s["onboarded"] is True and d.ev("__court.S.coach") is None, s["onboarded"])
    if d.ev("__court.S.screen") == "complete":
        d.click("next")
        d.screen("play", 0.3, 20000)
        check("after the tutorial, court 2 is the normal game (auto-serve, full speed, no hints)", d.ev("__court.S.game.state==='play' && __court.S.game.level.speed===__court.LEVELS[1].speed && !__court.ui.regions.some(r=>r.id==='skiptips')"))
    d.ev("__bot.on=false; __court.S.timeScale=1")

    # Returning: same browser after a reload.
    pg.reload()
    d.screen("title", 1.4)
    d.click("play")
    d.screen("courts", 0.5, 20000)
    check("returning user: Play goes to the court grid, as before", d.ev("__court.S.coach") is None)
    ctx.close()

    # Skipping the tips.
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    d = Driver(ctx.new_page())
    d.pg.goto(url)
    d.screen("title", 1.4)
    d.tap("play")
    d.screen("intro", 0.3)
    d.pg.touchscreen.tap(195, 400)
    d.screen("play", 0.4, 20000)
    check("new user on touch: hint uses touch wording", d.ev("__court.S.coach.step") == "move" and d.ev("__court.S.touch") is True)
    d.shot("ftue-4-mobile")
    d.tap("skiptips")
    time.sleep(0.3)
    check("Skip Tips ends the tutorial, saves it, and leaves the rally running", d.ev("__court.S.coach") is None and d.saved()["onboarded"] is True and d.ev("__court.S.game.state") == "serve")
    d.pg.touchscreen.tap(195, 400)
    time.sleep(0.2)
    check("after skipping, tap still serves", d.ev("__court.S.game.state") == "play")
    check("no console errors (first-time, touch)", not d.errors, d.errors[:3])
    ctx.close()

    # Returning player whose save predates the tutorial.
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    ctx.add_init_script("if(!localStorage.getItem('the-court.save')) localStorage.setItem('the-court.save', JSON.stringify({version:2,settings:{music:0.3,sfx:0.8,muted:false},progress:{unlocked:3,levels:{baseline:{best:500,stars:2}}},stats:{plays:4,wins:2,blocks:60},leaderboard:[{name:'OLD',score:900,court:2,at:1}]}))")
    d = Driver(ctx.new_page())
    d.pg.goto(url)
    d.screen("title", 1.4)
    old = d.ev("[__court.save.data.onboarded, __court.save.data.progress.unlocked, __court.save.data.settings.music, __court.save.data.leaderboard[0].name]")
    check("older save: treated as returning, progress and leaderboard intact", old == [True, 3, 0.3, "OLD"], old)
    d.click("play")
    d.screen("courts", 0.5, 20000)
    check("older save: Play goes to the court grid", d.ev("__court.ui.regions.some(r=>r.id==='court2')"))
    check("no console errors (first-time, desktop)", not d.errors, d.errors[:3])
    ctx.close()


def main():
    srv = serve()
    url = f"http://127.0.0.1:{srv.server_address[1]}/?debug=1"
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        try:
            first_time(browser, url)
            desktop(browser, url)
            touch_device(browser, url, "tablet", 820, 1180)
            touch_device(browser, url, "mobile", 390, 844)
        finally:
            browser.close()
            srv.shutdown()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
