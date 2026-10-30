// Haptics: a short buzz for each thing that happens, shaped to match it.
// Android browsers have navigator.vibrate. iPhones (Safari 17.4+) don't, but
// toggling a hidden "switch" checkbox through its label gives one light tick,
// so there a pattern plays as a tick per pulse.

// Each pattern is [buzz, pause, buzz, ...] in milliseconds.
export const HAPTICS = {
  tap: [8], // a button
  key: [5], // a letter on the name keyboard
  back: [6, 30, 6], // close / back
  paddle: [14],
  paddleEdge: [22], // a sharp hit off the racket's edge
  wall: [4],
  hit: [6], // a brick cracked but still standing
  breakT: [10],
  breakL: [12],
  breakH: [18],
  breakS: [26],
  drop: [6],
  power: [18, 40, 28],
  shield: [30, 30, 30],
  serve: [10],
  lost: [70, 50, 70],
  over: [120, 60, 120, 60, 200],
  rush: [20, 30, 20, 30, 40],
  cheer: [16, 40, 16, 40, 16],
  win: [30, 40, 30, 40, 30, 40, 120],
  count: [8],
  go: [24],
};

const vibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? navigator.vibrate.bind(navigator) : null;
let tick = null; // the iPhone fallback, made on first use

function iosTick() {
  if (!tick) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(label);
    tick = label;
  }
  tick.click();
}

const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent) && !vibrate;
let last = 0;

export const haptics = {
  on: true,
  // Play a named pattern; k (0..1+) scales it for stronger moments.
  play(name, k = 1) {
    if (!this.on) return;
    const p = HAPTICS[name];
    if (!p) return;
    const now = performance.now();
    if (now - last < 35 && p.length === 1) return; // never a constant buzz
    last = now;
    this.last = name; // for tests
    if (vibrate) {
      vibrate(p.map((ms, i) => (i % 2 ? ms : Math.round(Math.min(200, ms * k)))));
    } else if (isIOS) {
      let at = 0;
      p.forEach((ms, i) => {
        if (i % 2 === 0) setTimeout(iosTick, at);
        at += ms;
      });
    }
  },
};
