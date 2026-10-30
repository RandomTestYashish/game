// Synthesised sound effects and a small generative music loop (Web Audio).
// Nothing is created until the first user gesture calls unlock().

// Background music: CC0 tracks by Juhani Junkala ("Chiptune Adventures" and
// "5 Chiptunes (Action)", opengameart.org), as AAC files in assets/music.
// They are fetched after the first tap and loop seamlessly.
export const TRACKS = {
  select: 'assets/music/select.m4a', // menus
  stage1: 'assets/music/stage1.m4a',
  stage2: 'assets/music/stage2.m4a',
  action1: 'assets/music/action1.m4a',
  action2: 'assets/music/action2.m4a',
  action3: 'assets/music/action3.m4a',
  boss: 'assets/music/boss.m4a', // every Black Court
};
// The courts take turns through these, so the music changes every court.
export const COURT_TRACKS = ['action1', 'stage1', 'action2', 'stage2', 'action3'];
// A court's music builds from mellow to full power: the low-pass cutoff (Hz)
// opens, the bass shelf (dB) comes up and the level rises a touch.
// The crowd: real recordings from "Free Crowd Cheering Sounds" by Gregor
// Quendel (CC-BY 4.0, see assets/sfx/CREDITS.txt). Short moments are cut
// from them as they play, so no two reactions sound quite the same.
export const CROWD = {
  bed: 'assets/sfx/crowd-bed.m4a', // a stadium's murmur, looped under play
  cheer: 'assets/sfx/crowd-cheer.m4a', // a big roar
  soft: 'assets/sfx/crowd-soft.m4a', // "ooh", "yeah", applause
  wave: 'assets/sfx/crowd-wave.m4a', // rhythmic cheering for the wave
};
const CROWD_BED_VOL = 0.45; // the murmur's level, under everything
// The court's width in game units, for placing sounds left to right.
const COURT_W = 200;
// The note each tool's falling chime starts on.
const TOOL_NOTE = { shield: 660, multiball: 880, smash: 440, freeze: 1320, expand: 587, lowgrav: 523 };
const BUILD = { cutFrom: 650, cutTo: 20000, bassFrom: -2, bassTo: 9, gainFrom: 0.78 };
export const RUSH_TEMPO = 1.08; // Power Rush plays the music a touch faster
const TRACK_GAIN = 0.33; // the files are mastered loud; this sits them well under the crowd and effects
const CROWD_BED = 0.07; // the crowd's constant murmur on the courts
const DUCK = 0.45; // the music drops to this while the crowd roars
const XFADE = 0.9; // seconds to cross-fade from one track to the next

export class AudioSys {
  constructor(settings) {
    this.settings = settings; // { music, sfx, muted } - shared with the save data
    this.ac = null;
    this.playing = false;
    this.timer = null;
    this.want = 'select'; // the track the game wants now
    this.current = null; // the track actually playing
    this.buffers = {};
    this.samples = {}; // the crowd recordings, once loaded
    this.loading = {};
  }

  // Ask for a track; a change cross-fades as soon as it has loaded.
  setTrack(name) {
    if (!TRACKS[name]) return;
    this.want = name;
    if (this.ac && this.playing && name !== this.current) this.play(name);
  }

  // The crowd's murmur under everything on the courts: two bands of noise
  // that rise and fall slowly, like a stadium talking among itself.
  startCrowdBed() {
    this.bedG = this.ac.createGain();
    this.bedG.gain.value = 0;
    this.bedG.connect(this.sfxG);
    [[420, 0.13], [1100, 0.07]].forEach(([cut, rate], i) => {
      const src = this.ac.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.playbackRate.value = 0.9 + i * 0.13; // the two loops never line up
      const f = this.ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = cut;
      f.Q.value = 0.7;
      const g = this.ac.createGain();
      g.gain.value = i ? 0.5 : 1;
      const lfo = this.ac.createOscillator();
      const depth = this.ac.createGain();
      lfo.frequency.value = rate;
      depth.gain.value = i ? 0.2 : 0.35;
      lfo.connect(depth);
      depth.connect(g.gain);
      src.connect(f);
      f.connect(g);
      g.connect(this.bedG);
      src.start();
      lfo.start();
    });
    this.setCrowd(this.crowdOn || false);
  }

  setCrowd(on) {
    if (on === this.crowdOn && (this.bedLive || !this.samples.bed)) return;
    this.crowdOn = on;
    if (!this.ac) return;
    const t = this.ac.currentTime;
    // The recording, once it has loaded; the synthesised murmur until then.
    if (this.samples.bed && !this.bedLive) {
      const src = this.ac.createBufferSource();
      src.buffer = this.samples.bed;
      src.loop = true;
      this.bedLiveG = this.ac.createGain();
      this.bedLiveG.gain.value = 0;
      src.connect(this.bedLiveG);
      this.bedLiveG.connect(this.sfxG);
      src.start(t, Math.random() * 10);
      this.bedLive = src;
      if (this.bedG) this.bedG.gain.setTargetAtTime(0, t, 0.3);
    }
    if (this.bedLive) this.bedLiveG.gain.setTargetAtTime(on ? CROWD_BED_VOL : 0, t, 0.6);
    else if (this.bedG) this.bedG.gain.setTargetAtTime(on ? CROWD_BED : 0, t, 0.5);
  }

  loadCrowd() {
    for (const name in CROWD) {
      fetch(CROWD[name])
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status))))
        .then((data) => new Promise((ok, bad) => this.ac.decodeAudioData(data, ok, bad)))
        .then((buf) => {
          this.samples[name] = buf;
          if (name === 'bed') this.setCrowd(this.crowdOn);
        })
        .catch(() => {}); // the synthesised crowd stays in
    }
  }

  // Play a slice of a crowd recording: from `at` seconds for `dur`, faded in
  // and out, at `vol`, `rate` (pitch) and `pan`; o.lowpass muffles it.
  slice(name, o) {
    const buf = this.samples[name];
    if (!buf) return false;
    const t = this.ac.currentTime + (o.delay || 0);
    const dur = Math.min(o.dur, buf.duration);
    const at = Math.max(0, Math.min(o.at ?? Math.random() * (buf.duration - dur), buf.duration - dur));
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate || 1;
    const g = this.ac.createGain();
    const fadeIn = o.fadeIn ?? 0.08;
    const fadeOut = o.fadeOut ?? Math.min(0.6, dur * 0.4);
    const len = dur / (o.rate || 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + fadeIn);
    g.gain.setValueAtTime(o.vol, t + Math.max(fadeIn, len - fadeOut));
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    let node = src;
    if (o.lowpass) {
      const f = this.ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      src.connect(f);
      node = f;
    }
    node.connect(g);
    let out = g;
    if (this.ac.createStereoPanner && (o.pan != null || o.sweep)) {
      const pan = this.ac.createStereoPanner();
      pan.pan.setValueAtTime(o.sweep ? -0.8 : o.pan, t);
      if (o.sweep) pan.pan.linearRampToValueAtTime(0.8, t + len);
      g.connect(pan);
      out = pan;
    }
    out.connect(this.sfxG);
    src.start(t, at, dur);
    return true;
  }

  // The crowd's reactions, from the recordings. False if they haven't loaded.
  crowdSound(name, arg, info) {
    const pan = info.x != null ? Math.max(-0.7, Math.min(0.7, (info.x / COURT_W) * 1.4 - 0.7)) : null;
    switch (name) {
      case 'ooh': // a quick "ooh"/"yeah" from that side of the stands
        return this.slice('soft', { dur: 0.9, vol: 0.65 + (arg || 0.7) * 0.4, rate: arg >= 1 ? 1.05 + Math.random() * 0.1 : 0.9 + Math.random() * 0.08, pan, fadeIn: 0.05, fadeOut: 0.45 });
      case 'clap': // a round of applause
        if (!this.slice('soft', { dur: 2.2, vol: 1.1 })) return false;
        this.duck(1.2);
        return true;
      case 'cheer': { // the roar
        const big = Math.min(arg || 1, 3);
        const dur = 2.2 + big * 0.9;
        if (!this.slice('cheer', { at: Math.random() * 2, dur, vol: 1.4 + big * 0.25, fadeIn: 0.12, fadeOut: 1.0 })) return false;
        this.duck(dur * 0.8);
        return true;
      }
      case 'wave': { // rhythmic cheering travelling left to right
        const len = arg || 3.6;
        if (!this.slice('wave', { dur: len + 0.6, vol: 1.0, sweep: true, fadeIn: 0.4, fadeOut: 0.8 })) return false;
        this.duck(len);
        return true;
      }
      case 'groan': // "awww": the crowd slowed down and muffled, sinking
        if (!this.slice('soft', { dur: 1.4, vol: 1.0, rate: 0.6, lowpass: 900, fadeIn: 0.06, fadeOut: 0.9 })) return false;
        this.roar(720, 0.26, 1.2, { to: 300, q: 1.4, attack: 0.1 });
        this.duck(1.0);
        return true;
    }
    return false;
  }

  // Drop the music under a crowd roar for a moment, then bring it back.
  duck(dur) {
    if (!this.musicDuck) return;
    const g = this.musicDuck.gain;
    const t = this.ac.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(DUCK, t + 0.12);
    g.setValueAtTime(DUCK, t + dur);
    g.linearRampToValueAtTime(1, t + dur + 0.8);
  }

  // A swell of crowd noise in one band; o.to slides the band (a groan falls).
  roar(cut, vol, dur, o = {}) {
    const t = this.ac.currentTime + (o.delay || 0);
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(cut, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q || 0.8;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxG);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // Applause: many short claps, scattered.
  claps(n, spread, vol, delay = 0) {
    for (let i = 0; i < n; i++) this.noise(0.025 + Math.random() * 0.02, vol * (0.6 + Math.random() * 0.4), 2200 + Math.random() * 1800, { type: 'highpass', delay: delay + Math.random() * spread });
  }

  // How far the court's music has built, 0 (mellow) to 1 (full power).
  setBuild(k, now = false) {
    k = Math.max(0, Math.min(1, k));
    if (!now && this.build != null && (k === this.build || (Math.abs(k - this.build) < 0.01 && k > 0 && k < 1))) return;
    this.build = k;
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const ease = now ? 0.01 : 0.6;
    const cut = BUILD.cutFrom * Math.pow(BUILD.cutTo / BUILD.cutFrom, k);
    this.musicLP.frequency.setTargetAtTime(cut, t, ease);
    this.musicBass.gain.setTargetAtTime(BUILD.bassFrom + (BUILD.bassTo - BUILD.bassFrom) * k * k, t, ease);
    this.musicLift.gain.setTargetAtTime(BUILD.gainFrom + (1 - BUILD.gainFrom) * k, t, ease);
  }

  // Speed the music up a little (Power Rush) or back to normal.
  setRate(rate) {
    if (this.rate === rate) return;
    this.rate = rate;
    if (this.voice && this.ac) this.voice.src.playbackRate.setTargetAtTime(rate, this.ac.currentTime, 0.3);
  }

  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.musicG = this.ac.createGain();
      this.sfxG = this.ac.createGain();
      // The court's build-up: music starts mellow (high notes muffled, bass
      // light) and opens out with heavy bass as the court is cleared.
      this.musicLP = this.ac.createBiquadFilter();
      this.musicLP.type = 'lowpass';
      this.musicLP.Q.value = 0.9;
      this.musicBass = this.ac.createBiquadFilter();
      this.musicBass.type = 'lowshelf';
      this.musicBass.frequency.value = 140;
      this.musicLift = this.ac.createGain();
      this.musicG.connect(this.musicBass);
      this.musicBass.connect(this.musicLP);
      this.musicLP.connect(this.musicLift);
      this.musicDuck = this.ac.createGain();
      this.musicLift.connect(this.musicDuck);
      this.musicDuck.connect(this.master);
      this.sfxG.connect(this.master);

      this.master.connect(this.ac.destination);
      const len = this.ac.sampleRate * 0.5;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.apply();
      this.setBuild(this.build ?? 1, true);
      this.startCrowdBed();
      this.loadCrowd();
    }
    // 'suspended' is the normal locked state; iOS also uses 'interrupted' after a call or alarm.
    if (this.ac.state !== 'running' && !this.held) this.ac.resume().catch(() => {});
    this.keepAwake();
    this.startMusic();
  }

  // iPhones and iPads silence Web Audio while the ring/silent switch is on
  // silent. Playing an (inaudible) media element alongside it moves the page
  // into the "playback" audio category, which the switch does not mute.
  keepAwake() {
    if (this.settings.muted || this.held) return;
    if (!this.silent) {
      const n = 4000; // half a second of 8-bit silence at 8 kHz
      const wav = new Uint8Array(44 + n).fill(128);
      const head = new DataView(wav.buffer);
      const put = (at, str) => [...str].forEach((ch, i) => (wav[at + i] = ch.charCodeAt(0)));
      put(0, 'RIFF');
      head.setUint32(4, 36 + n, true);
      put(8, 'WAVEfmt ');
      head.setUint32(16, 16, true);
      head.setUint16(20, 1, true);
      head.setUint16(22, 1, true);
      head.setUint32(24, 8000, true);
      head.setUint32(28, 8000, true);
      head.setUint16(32, 1, true);
      head.setUint16(34, 8, true);
      put(36, 'data');
      head.setUint32(40, n, true);
      this.silent = new Audio(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
      this.silent.loop = true;
      this.silent.setAttribute('playsinline', '');
    }
    if (this.silent.paused) this.silent.play().catch(() => {});
  }

  apply() {
    if (!this.ac) return;
    const s = this.settings;
    const t = this.ac.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 1, t, 0.02);
    this.musicG.gain.setTargetAtTime(s.music * 0.5, t, 0.02);
    this.sfxG.gain.setTargetAtTime(s.sfx * 0.6, t, 0.02);
    if (this.silent && s.muted) this.silent.pause();
  }

  // Suspend while the tab is hidden.
  hold(on) {
    this.held = on;
    if (!this.ac) return;
    if (on) {
      this.ac.suspend();
      if (this.silent) this.silent.pause();
    } else {
      this.ac.resume().catch(() => {});
    }
  }

  tone(freq, dur, type, vol, o = {}) {
    const t = (o.at ?? this.ac.currentTime) + (o.delay || 0);
    const osc = this.ac.createOscillator();
    const g = this.ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(o.out || this.out || this.sfxG);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol, cutoff, o = {}) {
    const t = (o.at ?? this.ac.currentTime) + (o.delay || 0);
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ac.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.out || this.out || this.sfxG);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // Every element has its own sound. info.x (where on the court, 0..WW)
  // places it left or right; arg carries the detail (which brick, which tool,
  // where on the racket, how long the combo).
  sfx(name, arg, info = {}) {
    if (!this.ac || this.settings.muted || this.settings.sfx <= 0 || this.ac.state !== 'running') return;
    this.out = null;
    if (info.x != null && this.ac.createStereoPanner) {
      const pan = this.ac.createStereoPanner();
      pan.pan.value = Math.max(-0.8, Math.min(0.8, (info.x / COURT_W) * 1.6 - 0.8));
      pan.connect(this.sfxG);
      this.out = pan;
    }
    if (!this.crowdSound(name, arg, info)) this.play1(name, arg, info);
    this.out = null;
  }

  play1(name, arg, info) {
    const T = (f, d, w, v, o) => this.tone(f, d, w, v, o);
    const N = (d, v, c, o) => this.noise(d, v, c, o);
    switch (name) {
      // ---- menus
      case 'click': // a button
        T(880, 0.04, 'square', 0.1);
        T(1320, 0.03, 'sine', 0.08, { delay: 0.02 });
        break;
      case 'confirm': // play, save, again: two notes up
        T(660, 0.07, 'square', 0.11);
        T(990, 0.1, 'square', 0.11, { delay: 0.06 });
        break;
      case 'back': // close, home, back: two notes down
        T(660, 0.06, 'triangle', 0.16);
        T(440, 0.09, 'triangle', 0.16, { delay: 0.05 });
        break;
      case 'key': { // a typewriter tick, a little different for every letter
        const f = 1400 + ((arg || 'A').charCodeAt(0) % 12) * 60;
        N(0.025, 0.2, f, { type: 'bandpass' });
        T(f / 2, 0.03, 'square', 0.05);
        break;
      }
      case 'tab':
        T(520, 0.05, 'sine', 0.18, { to: 780 });
        break;
      case 'toggle':
        T(arg ? 520 : 780, 0.08, 'sine', 0.2, { to: arg ? 780 : 520 });
        break;
      case 'beat': // passed someone on the leaderboard
        [784, 988, 1175].forEach((f, i) => T(f, 0.1, 'square', 0.1, { delay: i * 0.07 }));
        break;

      // ---- the rally
      case 'paddle': {
        // The racket: the pitch follows where the ball meets it (left low,
        // right high); an edge hit adds a bright ping; a fast ball hits harder.
        const off = arg || 0;
        const f = 220 * Math.pow(2, off * 0.3);
        const hard = Math.min(1.4, info.speed || 1);
        T(f, 0.1, 'triangle', 0.45 * hard, { to: f * 1.6 });
        N(0.05, 0.14 * hard, 1600);
        if (Math.abs(off) > 0.7) T(f * 4, 0.08, 'square', 0.07, { to: f * 3 });
        break;
      }
      case 'wall':
        if (arg === 'back') {
          // The far wall: a deep thud and the banner's rattle.
          T(110, 0.12, 'triangle', 0.32, { to: 80 });
          N(0.08, 0.12, 2400, { type: 'bandpass' });
        } else {
          // A side wall: a dry wooden knock.
          T(170, 0.05, 'triangle', 0.28);
          N(0.03, 0.12, 900, { type: 'bandpass' });
        }
        break;
      case 'hit': // a brick cracked but still standing
        if (arg === 'S') {
          T(1250, 0.06, 'square', 0.07);
          T(1870, 0.08, 'triangle', 0.07, { delay: 0.01 });
        } else if (arg === 'H') {
          N(0.09, 0.22, 3200, { type: 'bandpass' });
          T(260, 0.05, 'triangle', 0.14);
        } else {
          T(300, 0.07, 'square', 0.14, { to: 220 });
        }
        break;
      case 'break': {
        // Each brick breaks in its own voice; the combo raises the pitch.
        const up = Math.pow(1.06, Math.min(arg || 1, 12));
        const type = info.type || 'T';
        if (type === 'T') {
          // Terracotta: a clay crack.
          T(420 * up, 0.11, 'square', 0.12, { to: 250 * up });
          N(0.14, 0.3, 2400);
        } else if (type === 'L') {
          // Light stone: a soft pop.
          T(640 * up, 0.09, 'sine', 0.3, { to: 320 * up });
          N(0.08, 0.18, 1500);
        } else if (type === 'H') {
          // Hedge: a leafy crunch.
          N(0.2, 0.3, 3600, { type: 'bandpass' });
          N(0.12, 0.2, 700);
          T(330 * up, 0.08, 'triangle', 0.18, { to: 200 * up });
        } else {
          // Slate: a heavy shatter with a ring.
          T(90, 0.16, 'triangle', 0.4, { to: 55 });
          N(0.22, 0.32, 3800, { type: 'highpass' });
          T(1180 * up, 0.18, 'square', 0.06, { delay: 0.02 });
          T(1770 * up, 0.14, 'triangle', 0.07, { delay: 0.04 });
        }
        break;
      }
      case 'land': // a brick drops into place as the court builds
        N(0.06, arg === 'S' ? 0.16 : 0.09, arg === 'S' ? 380 : 600);
        break;
      case 'drop': {
        // A tool falls: a chime pitched for that tool.
        const f = TOOL_NOTE[arg] || 880;
        T(f, 0.08, 'sine', 0.14, { to: f * 1.5 });
        T(f * 2, 0.06, 'sine', 0.05, { delay: 0.05 });
        break;
      }
      case 'power':
        // Catching a tool: each one has its own little tune.
        if (arg === 'shield') {
          T(330, 0.3, 'sine', 0.25, { to: 990 });
          [1320, 1760].forEach((f, i) => T(f, 0.1, 'triangle', 0.08, { delay: 0.2 + i * 0.06 }));
        } else if (arg === 'multiball') {
          [660, 880, 1100].forEach((f, i) => T(f, 0.09, 'square', 0.11, { delay: i * 0.06 }));
          [660, 880, 1100].forEach((f, i) => T(f * 1.5, 0.07, 'sine', 0.06, { delay: 0.03 + i * 0.06 }));
        } else if (arg === 'smash') {
          T(110, 0.35, 'sawtooth', 0.16, { to: 220 });
          N(0.3, 0.28, 900);
          T(880, 0.12, 'square', 0.09, { delay: 0.22 });
        } else if (arg === 'freeze') {
          [2093, 1760, 1568, 1319, 1175].forEach((f, i) => T(f, 0.12, 'triangle', 0.09, { delay: i * 0.05 }));
          N(0.3, 0.08, 6000, { type: 'highpass' });
        } else if (arg === 'expand') {
          T(260, 0.4, 'sine', 0.26, { to: 780 });
          T(390, 0.4, 'triangle', 0.1, { to: 1170 });
        } else if (arg === 'lowgrav') {
          T(700, 0.55, 'sine', 0.22, { to: 240 });
          T(705, 0.55, 'sine', 0.12, { to: 236, delay: 0.04 });
        } else {
          [523, 659, 784, 1047].forEach((f, i) => T(f, 0.12, 'square', 0.12, { delay: i * 0.06 }));
        }
        break;
      case 'shield': // the barrier saves a ball: a glassy ping
        T(988, 0.22, 'sine', 0.3, { to: 494 });
        T(1976, 0.12, 'triangle', 0.06);
        break;
      case 'serve': // a whoosh off the racket
        N(0.18, 0.14, 1200, { type: 'bandpass' });
        T(262, 0.1, 'triangle', 0.36, { to: 523 });
        break;
      case 'rush': // Power Rush: a siren rising twice
        T(440, 0.3, 'sawtooth', 0.08, { to: 880 });
        T(440, 0.3, 'sawtooth', 0.08, { to: 1047, delay: 0.3 });
        [1047, 1319, 1568].forEach((f, i) => T(f, 0.1, 'square', 0.08, { delay: 0.62 + i * 0.06 }));
        break;
      case 'lost':
        T(330, 0.45, 'sawtooth', 0.16, { to: 70 });
        break;
      case 'count':
        T(440, 0.12, 'square', 0.14);
        break;
      case 'go':
        T(880, 0.25, 'square', 0.14);
        T(1320, 0.25, 'sine', 0.08);
        break;
      case 'win':
        [523, 659, 784, 1047, 1319].forEach((f, i) => T(f, 0.22, 'square', 0.13, { delay: i * 0.11 }));
        break;
      case 'cheer': {
        // The crowd roars: a big swell, whoops and a long round of applause.
        const big = Math.min(arg || 1, 3);
        const len = 1.1 + big * 0.4;
        this.duck(len * 0.7);
        this.roar(800, 0.3 + big * 0.07, len, { attack: 0.15 });
        this.roar(1900, 0.14 + big * 0.04, len * 0.8, { attack: 0.2 });
        this.roar(350, 0.16 + big * 0.04, len * 0.9, { attack: 0.25 });
        for (let i = 0; i < 3 + big * 2; i++) {
          const f = 550 + Math.random() * 600;
          this.tone(f, 0.25, 'triangle', 0.08, { to: f * 1.7, delay: 0.05 + i * 0.12 + Math.random() * 0.08 });
        }
        this.claps(14 + big * 10, len, 0.18, 0.1);
        break;
      }
      case 'ooh': {
        // A brick hit: a quick "ooh" (a crack) or "yeah" (a break) from the
        // fans on that side, a little different each time.
        const f = (arg >= 1 ? 900 : 560) * (0.85 + Math.random() * 0.3);
        this.roar(f, 0.05 + (arg || 0.7) * 0.04, 0.35, { to: arg >= 1 ? f * 1.25 : f * 0.8, q: 2.2, attack: 0.06 });
        break;
      }
      case 'wave': {
        // The Mexican wave: a rising "whooo" that travels left to right
        // round the stands, timed with the crest.
        const len = arg || 3.6;
        const t = this.ac.currentTime;
        const src = this.ac.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const f = this.ac.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 1.6;
        f.frequency.setValueAtTime(500, t);
        for (let i = 1; i <= 6; i++) f.frequency.linearRampToValueAtTime(i % 2 ? 1100 : 650, t + (len * i) / 6);
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.4);
        g.gain.setValueAtTime(0.16, t + len - 0.5);
        g.gain.linearRampToValueAtTime(0.0001, t + len);
        src.connect(f);
        f.connect(g);
        let out = g;
        if (this.ac.createStereoPanner) {
          const pan = this.ac.createStereoPanner();
          pan.pan.setValueAtTime(-0.8, t);
          pan.pan.linearRampToValueAtTime(0.8, t + len);
          g.connect(pan);
          out = pan;
        }
        out.connect(this.sfxG);
        src.start(t);
        src.stop(t + len + 0.05);
        this.claps(18, len, 0.08, 0.3);
        break;
      }
      case 'clap':
        // A warm round of applause with a little murmur of approval.
        this.duck(0.7);
        this.roar(700, 0.12, 1.0, { attack: 0.2 });
        this.claps(16, 0.9, 0.16);
        break;
      case 'groan':
        // "Awww": the crowd's voice sinks.
        this.duck(0.8);
        this.roar(720, 0.26, 1.2, { to: 300, q: 1.4, attack: 0.1 });
        this.roar(1500, 0.08, 0.9, { to: 700, q: 1.2, attack: 0.1 });
        break;
      case 'over':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.3, { delay: i * 0.17 }));
        break;
    }
  }

  startMusic() {
    if (this.playing || !this.ac) return;
    this.playing = true;
    this.play(this.want);
    // Fetch the rest in the background so later changes are instant.
    for (const name in TRACKS) this.load(name);
  }

  load(name) {
    if (!this.loading[name]) {
      this.loading[name] = fetch(TRACKS[name])
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status))))
        .then((data) => new Promise((ok, bad) => this.ac.decodeAudioData(data, ok, bad)))
        .then((buf) => (this.buffers[name] = { buf, ...loopPoints(buf) }))
        .catch(() => {
          delete this.loading[name]; // try again next time it is asked for
          return null;
        });
    }
    return this.loading[name];
  }

  async play(name) {
    const track = this.buffers[name] || (await this.load(name));
    if (!track || name !== this.want || name === this.current || !this.ac) return;
    const t = this.ac.currentTime;
    if (this.voice) {
      const old = this.voice;
      old.g.gain.cancelScheduledValues(t);
      old.g.gain.setValueAtTime(old.g.gain.value, t);
      old.g.gain.linearRampToValueAtTime(0, t + XFADE);
      old.src.stop(t + XFADE + 0.05);
    }
    const src = this.ac.createBufferSource();
    src.buffer = track.buf;
    src.loop = true;
    src.loopStart = track.start;
    src.loopEnd = track.end;
    src.playbackRate.value = this.rate || 1;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(TRACK_GAIN, t + (this.voice ? XFADE : 0.4));
    src.connect(g);
    g.connect(this.musicG);
    src.start(t, track.start);
    this.voice = { src, g, name };
    this.current = name;
  }
}

// AAC files carry a little encoder silence at each end; loop between the
// first and last audible samples so the loop has no gap.
function loopPoints(buf) {
  const d = buf.getChannelData(0);
  const quiet = 0.0008;
  const most = Math.round(buf.sampleRate * 0.08); // encoder padding only, never a musical rest
  let a = 0;
  while (a < most && Math.abs(d[a]) < quiet) a++;
  let b = d.length - 1;
  while (b > d.length - 1 - most && Math.abs(d[b]) < quiet) b--;
  if (b - a < buf.sampleRate) return { start: 0, end: buf.duration };
  return { start: a / buf.sampleRate, end: (b + 1) / buf.sampleRate };
}
