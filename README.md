# The Court

A 2.5D pixel-art block-breaker set on a garden tennis court at dusk. Five courts, six tools, local saves, synthesised sound. Plain HTML, CSS and JavaScript modules: no build step, no dependencies, no image or audio files.

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
| Menus | Click | Tap | `Enter` confirms, `Esc` goes back |

The game pauses itself when the tab or window loses focus.

## How it plays

- Clear every block to finish a court. You have three balls; stars equal the balls you have left.
- Terracotta and limestone break in one hit, hedge in two, slate in three. On later courts some rows slide.
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

## Architecture

```
index.html        one <canvas>, loads js/main.js
css/style.css     page chrome and pixel-perfect scaling
js/main.js        boot, screen flow, input, frame loop
js/game.js        rules and physics (no DOM)
js/levels.js      level layouts
js/scene.js       camera projection, background layers, block/ball/paddle sprites
js/render.js      draws a Game into the court, plus the HUD
js/ui.js          buttons, sliders, tilting panels
js/gfx.js         low-res canvas, drawing primitives, fonts, icons
js/audio.js       Web Audio effects and music
js/save.js        save data, migration, storage adapter
tests/e2e.py      browser test
```

- **Rendering.** Everything is drawn in code onto a 240-pixel-wide canvas, 320 to 520 pixels tall depending on the screen shape, then scaled up with nearest-neighbour sampling. That one canvas is the whole responsive layout.
- **2.5D.** The simulation is flat: `game.js` works in court coordinates (200 x 240). `scene.js` projects those through a perspective camera with one parameter, `cam`, from 0 (low menu view) to 1 (raised play view). Screen changes tween `cam`, so the court, net and parallax layers move together; panels tilt up from the grass; blocks drop in from above.
- **Screens.** `main.js` holds a small state machine: `loading → title → intro → courts → tools → countdown → play ⇄ paused → complete | gameover`. Each screen is one function that draws itself and registers its hit regions every frame.
- **Game and view are separate.** `Game` knows nothing about drawing, sound or storage. It reports what happened through an `emit(event)` callback, and takes its random source as an argument, which is what makes it testable.
- **Adding a level.** Append an entry to `LEVELS` in `js/levels.js`. The courts screen, unlocking and saving pick it up.

## Save data

One JSON document in `localStorage` under `the-court.save`:

```json
{
  "version": 1,
  "updatedAt": 1791901112459,
  "settings": { "music": 0.6, "sfx": 0.8, "muted": false },
  "progress": { "unlocked": 2, "levels": { "baseline": { "best": 610, "stars": 2 } } },
  "stats": { "plays": 3, "wins": 1, "blocks": 51 }
}
```

It is written when a rally ends and when sound settings change. `migrate()` validates whatever it loads, so a damaged or older save falls back to defaults field by field. If `localStorage` is blocked, the game keeps the save in memory for the session. "Erase save data" in the Sound panel clears progress and keeps sound settings.

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
stats    (player_id PK/FK, plays INT, wins INT, blocks INT)
```

5. **Do not trust client scores** if they become public. Today the score is computed in the browser; a leaderboard would need the server to validate or replay a rally.

Bump `SAVE_VERSION` and extend `migrate()` whenever the document shape changes.

## Tests

```sh
pip install playwright
python tests/e2e.py
```

Runs the game in headless Chrome (it uses your installed Google Chrome) at desktop, tablet and phone sizes. It clicks through every screen, checks mouse, keyboard and touch control, the rules and each tool, sound settings, saving across a reload, and plays all five courts through to the end. Pass a folder path as an argument to keep screenshots.

Adding `?debug` to the URL exposes the game state as `window.__court`, which is what the test drives.
