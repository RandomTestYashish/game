# The Court

A fast 2.5D pixel-art block-breaker set on a garden tennis court at dusk. 120 courts, six tools, a leaderboard, local saves, synthesised sound. Plain HTML, CSS and JavaScript modules: no build step, no dependencies, no image or audio files.

## Setup

Browsers will not load JavaScript modules from a page opened as a file, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Any static host works (GitHub Pages, Netlify, an S3 bucket): upload the folder as it is.

## Controls

| | Mouse | Touch | Keyboard |
|---|---|---|---|
| Move paddle | Move the pointer | Drag anywhere | `←` `→` or `A` `D` |
| Serve | Click | Tap | `Space` / `Enter` |
| Pause | Pause button | Pause button | `P` / `Esc` |
| Mute | Sound panel | Sound panel | `M` |
| Menus | Click | Tap | `Enter` confirms, `Esc` goes back, `←` `→` turn court pages |
| Name entry | On-screen keys | On-screen keys | Type, `Backspace`, `Enter` saves |

The game pauses itself when the tab or window loses focus.

## How it plays

- Clear every block to finish a court. Stars are three minus the balls you lost on it.
- A run starts on any unlocked court with three lives. Next carries your score and your remaining lives forward: a lost life never comes back, and nothing is refilled between courts. The run ends when you lose your last life or go Home, and its total goes on the leaderboard under the name you enter. Replay, Retry and Restart begin a new run: three lives again, score back to 0.
- There are 120 courts: five hand-made, the rest generated from a fixed recipe so they are the same on every device. Each one is faster than the last, the paddle shrinks, tools get rarer, and slate gets more common.
- Terracotta and limestone break in one hit, hedge in two, slate in three. Some rows slide sideways, and on many courts the whole formation advances toward you and back.
- The ball speeds up 3% on every paddle hit, up to 1.55 times the court's speed.
- Breaking several blocks between paddle touches builds a combo, up to x3. Each ball left at the end is worth 100.
- Broken blocks sometimes drop a tool. Catch it with the paddle:

| Tool | Effect |
|---|---|
| Shield | A barrier behind the paddle saves one ball |
| Multiball | Every ball in play splits into three |
| Smash | The ball goes straight through blocks (7 s) |
| Freeze | Blocks stop sliding and break in one hit (8 s) |
| Expand | Wider paddle (14 s) |
| Low Gravity | Balls and tools come down slowly (10 s) |

## How to Play screen

"Rules" on the courts screen and "How to play" in the pause menu open a five-tab reference: Bricks, Score, Tools, Runs and Keys. Its numbers are not typed in: `js/rules.js` reads them from the constants `js/game.js` plays by (`BLOCKS`, `comboMult`, `TOOL_TIME`, `LIFE_BONUS` and so on), and the test measures each one in a simulated rally and compares it with what the screen shows.

## First-time journey

A player with no save is not sent through the court grid and tools briefing. Play goes from the intro straight into court 1 with a ball 20% slower, and the ball waits on the paddle instead of serving itself. Short hints appear one at a time: move, serve, clear the blocks, catch the tool (the first tool is always Expand), and what to do after losing a ball. "Skip tips" ends it at once.

The tutorial is marked done (`onboarded` in the save) when that first rally ends or is skipped; from then on the game is exactly the normal one. Saves from before this feature count as returning if they show any play. "Erase save data" brings the tutorial back.

## Architecture

```
index.html        one <canvas>, loads js/main.js
css/style.css     page chrome and pixel-perfect scaling
js/main.js        boot, screen flow, input, frame loop
js/game.js        rules and physics (no DOM)
js/levels.js      hand-made courts and the generator for the rest
js/scene.js       camera projection, background layers, block/ball/paddle sprites
js/render.js      draws a Game into the court, plus the HUD
js/ui.js          buttons, sliders, tilting panels
js/gfx.js         low-res canvas, drawing primitives, fonts, icons
js/audio.js       Web Audio effects and music
js/rules.js       How to Play text, built from the game's constants
js/config.js      online leaderboard settings (empty = off)
js/remote.js      read-only fetch of online scores
js/save.js        save data, migration, storage adapter
tests/e2e.py      browser test
```

- **Rendering and layout.** Everything is drawn in code onto one low-resolution canvas that fills the window and is scaled up with nearest-neighbour sampling. A game pixel is sized so that at least 240 x 320 of them fit; spare room becomes more court and garden (up to 760 wide or 520 tall), so phones, tablets and wide desktops all get a full-bleed view. Screens centre their panels on the canvas width.
- **2.5D.** The simulation is flat: `game.js` works in court coordinates (200 x 240). `scene.js` projects those through a perspective camera with one parameter, `cam`, from 0 (low menu view) to 1 (raised play view). Screen changes tween `cam`, so the court, net and parallax layers move together; panels tilt up from the grass; blocks drop in from above. During play the camera also trucks sideways with the paddle (`shift`), keeping the paddle's depth fixed while nearer and farther layers slide against it, and blocks float above their shadows.
- **Background motion.** Clouds drift, stars twinkle, a flock crosses the sky, fireflies and petals move, lanterns flicker and the canopy sways. All of it is drawn per frame in `drawScene`.
- **Screens.** `main.js` holds a small state machine: `loading → title → intro → courts → tools → countdown → play ⇄ paused → complete → name → scores`. Each screen is one function that draws itself and registers its hit regions every frame.
- **Game and view are separate.** `Game` knows nothing about drawing, sound or storage. It reports what happened through an `emit(event)` callback, and takes its random source as an argument, which is what makes it testable.
- **Adding levels.** Raise `COUNT` in `js/levels.js` for more generated courts, or add to `HAND` for hand-made ones. The courts screen, unlocking and saving pick them up.

## Save data

One JSON document in `localStorage` under `the-court.save`:

```json
{
  "version": 3,
  "updatedAt": 1791901112459,
  "onboarded": true,
  "settings": { "music": 0.6, "sfx": 0.8, "muted": false },
  "progress": { "unlocked": 2, "levels": { "baseline": { "best": 610, "stars": 2 } } },
  "stats": { "plays": 3, "wins": 1, "blocks": 51 },
  "leaderboard": [{ "name": "PANDA", "score": 1730, "court": 2, "at": 1791901112459 }],
  "lastName": "PANDA"
}
```

It is written when a rally ends, when a score is posted and when sound settings change. The leaderboard keeps the best 20 runs **on that device only**: each browser has its own list. `migrate()` validates whatever it loads, so a damaged or older save falls back to defaults field by field. If `localStorage` is blocked, the game keeps the save in memory for the session. "Erase save data" in the Sound panel clears progress and the leaderboard and keeps sound settings.

## Online leaderboard (read-only, optional)

Off by default. With `js/config.js` empty the game makes no network calls and the leaderboard is the device one. Fill in two values and the Scores screen gains an **Online** tab that reads the top 20 from a Supabase table. The game does not send scores yet, and the table below does not allow it.

**1. Create the table.** In Supabase: SQL Editor, paste, Run.

```sql
create table public.scores (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 8),
  score      integer not null check (score >= 0),
  court      integer not null default 1 check (court between 1 and 9999),
  created_at timestamptz not null default now()
);
create index scores_top on public.scores (score desc, created_at asc);

alter table public.scores enable row level security;

-- Anyone may read. There is deliberately NO insert, update or delete policy,
-- so the public key cannot change the table.
create policy "public read" on public.scores for select to anon using (true);

-- A few rows to see on screen (the SQL editor bypasses the policy):
insert into public.scores (name, score, court) values ('AANYA', 9100, 14), ('RAVI', 7200, 9), ('MEERA', 6100, 7);
```

**2. Get the two values.** Project Settings, API: copy the **Project URL** and the **anon public** key. Never use the `service_role` key.

**3. Put them in the game.** A static site has no environment variables at run time (the browser cannot read them), so they are written into `js/config.js`:

```sh
SUPABASE_URL=https://YOUR-PROJECT.supabase.co SUPABASE_ANON_KEY=YOUR-ANON-KEY sh scripts/write-config.sh
```

or open `js/config.js` and paste them by hand. Then serve the folder as in Setup and open Scores.

**4. Hosting (GitHub Pages).** Pages serves the files in the repo, so commit `js/config.js` after step 3 and push. Both values are meant to be public; the policy above is what protects the table. To switch the online board off, run the script with no variables and push.

`js/remote.js` is the only file that talks to the database. It sends one GET, gives up after 6 seconds, and cleans every row (name rules, whole-number scores) before it is shown. Any failure shows a message with Try Again and leaves the rest of the game working.

## Database upgrade path

The game never touches `localStorage` directly. `Save` talks to a store with three async methods, and `LocalStore` is the only implementation today:

```js
class LocalStore {
  async load()      // -> save document or null
  async save(data)  // persist the whole document
  async clear()
}
```

To move saves to a server:

1. **Add an API** with `GET /save`, `PUT /save` and `DELETE /save` for the signed-in player. This needs accounts or at least an anonymous device token; the game has neither yet.
2. **Write `RemoteStore`** with the same three methods using `fetch`, and pass it in `main.js`: `new Save(new RemoteStore())`. Nothing else in the game changes, because every call site already awaits the store.
3. **Keep local as a cache.** Wrap both in a store that reads local first, then fetches remote and merges: take the higher `best` and `stars` per level, the higher `unlocked`, and the settings from whichever document has the later `updatedAt`. Write to local immediately and to remote in the background, so play continues offline.
4. **Store it** as one JSON column to start, or normalised if you want leaderboards:

```sql
players  (id PK, created_at)
settings (player_id PK/FK, music REAL, sfx REAL, muted BOOL, updated_at)
progress (player_id FK, level_id TEXT, best INT, stars INT, updated_at, PRIMARY KEY (player_id, level_id))
scores   (id PK, player_id FK, name TEXT, score INT, court INT, created_at)   -- shared leaderboard: top N by score
stats    (player_id PK/FK, plays INT, wins INT, blocks INT)
```

A shared leaderboard is the smallest useful first step: it needs only the `scores` table, an insert when `Save.addScore` runs and a "top 20" read on the scores screen. A hosted database with a browser client (Supabase, Firebase) can do that with no server of your own.

5. **Do not trust client scores** if they become public. Today the score is computed in the browser; a leaderboard would need the server to validate or replay a rally.

Bump `SAVE_VERSION` and extend `migrate()` whenever the document shape changes.

## Tests

```sh
pip install playwright
python tests/e2e.py
```

Runs the game in headless Chrome (it uses your installed Google Chrome) at desktop, tablet and phone sizes. It clicks through every screen, checks mouse, keyboard and touch control, the rules and each tool, sound settings, name entry and the leaderboard, and saving across a reload. It plays five courts through in the browser (1, 3, 40, 80 and 120) and simulates all 120 to confirm each can be cleared. Pass a folder path as an argument to keep screenshots.

Adding `?debug` to the URL exposes the game state as `window.__court`, which is what the test drives.
