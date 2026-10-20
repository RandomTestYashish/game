// Synthesised sound effects and a small generative music loop (Web Audio).
// Nothing is created until the first user gesture calls unlock().

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ---------------------------------------------------------------- songs
// One calm, looping piece per country, played in eighth-note steps. Each
// song's step() is called once per step with the step number and its time.
// Phrases are written out (not random), so a court always sounds the same.
// A Black Court plays the same song slower, darker and sparser ("night").

export const SONGS = {
  // Koto plucks over a low drone, a breathy flute line, a woodblock now and then.
  japan: {
    bpm: 64,
    level: 0.75, // songs are evened out to about the same loudness
    cutoff: 2600,
    step(a, s, at, n) {
      const bar = Math.floor(s / 8) % 8;
      const i = s % 8;
      const root = [38, 38, 43, 43, 36, 36, 41, 45][bar];
      if (i === 0) a.drone(NOTE(root), a.beat * 8, 0.12, at);
      const scale = [62, 63, 67, 69, 72, 74, 75, 79];
      const koto = [[0, 2, 4, 3], [1, 3, 5, 4], [2, 4, 6, 5], [0, 3, 2, 1]][bar % 4];
      if (i % 2 === 0 && !(n && i === 6)) a.pluck(NOTE(scale[koto[i / 2]]), 1.4, 0.11, at, { type: 'triangle', cutoff: 2400 });
      const flute = [
        [[0, 74, 6], [6, 72, 2]],
        [[0, 69, 4], [4, 67, 4]],
        [[2, 72, 6]],
        [[0, 63, 3], [3, 62, 5]],
      ][Math.floor(s / 8) % 4];
      if (Math.floor(s / 32) % 2 === 1 && !n) for (const [st, note, len] of flute) if (st === i) a.flute(NOTE(note), a.beat * len, 0.05, at);
      if (i === 0 && bar % 2 === 1) a.wood(at, 0.08);
    },
  },
  // Lo-fi jazz: soft electric piano on a ii-V-I, walking bass, brushed hats, swing.
  newyork: {
    bpm: 76,
    level: 1.4,
    swing: 0.62,
    cutoff: 2200,
    step(a, s, at, n) {
      const bar = Math.floor(s / 8) % 4;
      const i = s % 8;
      const chords = [
        [50, [53, 57, 60, 64]], // Dm9
        [43, [53, 57, 59, 64]], // G13
        [48, [52, 55, 59, 62]], // Cmaj9
        [45, [55, 58, 61, 64]], // A7b9
      ];
      const [root, notes] = chords[bar];
      if (i === 0 || i === 3) for (const m of notes) a.keys(NOTE(m), a.beat * (i === 0 ? 2.6 : 1.4), i === 0 ? 0.045 : 0.03, at);
      const walk = [[0, 3, 7, 5], [0, 4, 7, 9], [0, 7, 4, 2], [0, 4, 7, 6]][bar];
      if (i % 2 === 0) a.bass(NOTE(root - 12 + walk[i / 2]), a.beat * 1.8, 0.2, at);
      if (!n && i % 2 === 1) a.hat(at, i === 3 || i === 7 ? 0.035 : 0.02);
      if (!n && i === 2) a.hat(at, 0.05, true);
      const horn = [[[2, 69, 3], [5, 72, 3]], [[1, 71, 2], [4, 67, 4]], [[0, 64, 6]], [[2, 64, 2], [4, 61, 4]]][bar];
      if (Math.floor(s / 32) % 2 === 1) for (const [st, note, len] of horn) if (st === i) a.horn(NOTE(note), a.beat * len, n ? 0.025 : 0.04, at);
    },
  },
  // A slow baroque garden: harpsichord broken chords over a held cello line,
  // with the Westminster quarter chime drifting in every other time round.
  london: {
    bpm: 68,
    level: 1.35,
    cutoff: 2800,
    step(a, s, at, n) {
      const bar = Math.floor(s / 8) % 8;
      const i = s % 8;
      const prog = [
        [45, [57, 60, 64]], // Am
        [50, [57, 62, 65]], // Dm
        [43, [55, 59, 62]], // G
        [48, [55, 60, 64]], // C
        [41, [57, 60, 65]], // F
        [50, [57, 62, 65]], // Dm
        [40, [56, 59, 64]], // E
        [45, [57, 60, 64]], // Am
      ];
      const [root, ch] = prog[bar];
      if (i === 0) a.cello(NOTE(root), a.beat * 7.6, 0.1, at);
      const order = [0, 1, 2, 1, 0, 2, 1, 2];
      if (!(n && i % 2 === 1)) a.harpsi(NOTE(ch[order[i]] + (i >= 4 ? 12 : 0)), 0.5, 0.05, at);
      if (bar === 6 && Math.floor(s / 64) % 2 === 1) {
        const chime = { 0: 68, 2: 66, 4: 64, 6: 59 }[i];
        if (chime) a.bell(NOTE(chime), 2.2, 0.06, at);
      }
    },
  },
  // Tanpura drone, a sitar-like line that bends into its notes, soft tabla.
  india: {
    bpm: 70,
    level: 2.1,
    cutoff: 2400,
    step(a, s, at, n) {
      const i = s % 8;
      const cyc = Math.floor(s / 8);
      const drone = [45, 50, 50, 38]; // Pa Sa Sa low-Sa
      if (i % 2 === 0) a.tanpura(NOTE(drone[(i / 2) % 4]), a.beat * 3.2, 0.07, at);
      // Raga Bhupali on D: D E F# A B.
      const phrases = [
        [[0, 62, 2], [2, 64, 2], [4, 66, 4]],
        [[0, 69, 3], [3, 66, 1], [4, 64, 4]],
        [[0, 71, 2], [2, 69, 2], [4, 66, 2], [6, 64, 2]],
        [[0, 62, 8]],
      ];
      const phrase = phrases[cyc % 4];
      if (cyc % 8 >= 2) for (const [st, note, len] of phrase) if (st === i) a.sitar(NOTE(note), a.beat * len, n ? 0.04 : 0.06, at);
      // Keherwa: dha ge na ti | na ka dhi na
      const theka = ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhi', 'na'][i];
      if (cyc % 8 >= 1) a.tabla(theka, at, n ? 0.5 : 1);
    },
  },
};

export class AudioSys {
  constructor(settings) {
    this.settings = settings; // { music, sfx, muted } - shared with the save data
    this.ac = null;
    this.playing = false;
    this.timer = null;
    this.song = 'japan';
    this.night = false;
  }

  // Pick the music for a theme. A change fades the old song out and the new
  // one in over about a second; the step counter restarts with the new song.
  setSong(id, night) {
    if (!SONGS[id]) return;
    if (id === this.song && night === this.night) return;
    const changeSong = id !== this.song;
    this.song = id;
    this.night = night;
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const song = SONGS[id];
    this.tone_.frequency.setTargetAtTime(night ? song.cutoff * 0.55 : song.cutoff, t, 0.4);
    if (changeSong) {
      this.songG.gain.cancelScheduledValues(t);
      this.songG.gain.setTargetAtTime(0, t, 0.15);
      this.songG.gain.setTargetAtTime(song.level, t + 0.6, 0.3);
      this.switchAt = t + 0.6;
    }
  }

  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.musicG = this.ac.createGain();
      this.sfxG = this.ac.createGain();
      this.musicG.connect(this.master);
      this.sfxG.connect(this.master);
      // Music: song bus -> soft low-pass -> music volume, with a quiet echo for space.
      this.songG = this.ac.createGain();
      this.tone_ = this.ac.createBiquadFilter();
      this.tone_.type = 'lowpass';
      this.tone_.frequency.value = 2400;
      this.songG.connect(this.tone_);
      this.tone_.connect(this.musicG);
      this.echo = this.ac.createDelay(1);
      this.echo.delayTime.value = 0.42;
      const fb = this.ac.createGain();
      fb.gain.value = 0.32;
      const wet = this.ac.createGain();
      wet.gain.value = 0.28;
      this.tone_.connect(this.echo);
      this.echo.connect(fb);
      fb.connect(this.echo);
      this.echo.connect(wet);
      wet.connect(this.musicG);
      this.master.connect(this.ac.destination);
      const len = this.ac.sampleRate * 0.5;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.apply();
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
    g.connect(o.out || this.sfxG);
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
    g.connect(o.out || this.sfxG);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  sfx(name, arg) {
    if (!this.ac || this.settings.muted || this.settings.sfx <= 0 || this.ac.state !== 'running') return;
    switch (name) {
      case 'click':
        this.tone(660, 0.05, 'square', 0.12);
        break;
      case 'paddle':
        this.tone(196, 0.1, 'triangle', 0.5, { to: 330 });
        this.noise(0.04, 0.12, 1800);
        break;
      case 'wall':
        this.tone(150, 0.05, 'triangle', 0.3);
        break;
      case 'hit':
        this.tone(300, 0.07, 'square', 0.14, { to: 220 });
        break;
      case 'break': {
        const f = 420 * Math.pow(1.06, Math.min(arg || 1, 12));
        this.tone(f, 0.11, 'square', 0.14, { to: f * 0.6 });
        this.noise(0.14, 0.3, 2600);
        break;
      }
      case 'land':
        this.noise(0.06, 0.1, 500);
        break;
      case 'drop':
        this.tone(880, 0.08, 'sine', 0.14, { to: 1320 });
        break;
      case 'power':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'square', 0.12, { delay: i * 0.06 }));
        break;
      case 'shield':
        this.tone(988, 0.2, 'sine', 0.3, { to: 494 });
        break;
      case 'serve':
        this.tone(262, 0.1, 'triangle', 0.4, { to: 523 });
        break;
      case 'lost':
        this.tone(330, 0.45, 'sawtooth', 0.16, { to: 70 });
        break;
      case 'count':
        this.tone(440, 0.12, 'square', 0.14);
        break;
      case 'go':
        this.tone(880, 0.25, 'square', 0.14);
        break;
      case 'win':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.22, 'square', 0.13, { delay: i * 0.11 }));
        break;
      case 'over':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.3, { delay: i * 0.17 }));
        break;
    }
  }

  startMusic() {
    if (this.playing || !this.ac) return;
    this.playing = true;
    this.step = 0;
    this.nextT = this.ac.currentTime + 0.1;
    const song = SONGS[this.song];
    this.tone_.frequency.value = this.night ? song.cutoff * 0.55 : song.cutoff;
    this.songG.gain.value = song.level;
    this.timer = setInterval(() => this.schedule(), 90);
  }

  schedule() {
    if (!this.ac || this.ac.state !== 'running') return;
    if (this.nextT < this.ac.currentTime) this.nextT = this.ac.currentTime + 0.05;
    this.fill(this.ac.currentTime + 0.3);
  }

  // Queue every step that starts before `until` (seconds on the audio clock).
  fill(until) {
    while (this.nextT < until) {
      if (this.switchAt && this.nextT >= this.switchAt) {
        this.switchAt = 0;
        this.step = 0; // the new song starts from its first bar
      }
      const song = SONGS[this.song];
      const bpm = song.bpm * (this.night ? 0.92 : 1);
      this.beat = 60 / bpm / 2; // one eighth note
      const sw = song.swing ? (this.step % 2 ? (1 - song.swing) * 2 : song.swing * 2) : 1;
      song.step(this, this.step, this.nextT, this.night);
      this.step++;
      this.nextT += this.beat * sw;
    }
  }

  // ---- instruments (all quiet, all through the song bus) ----

  voice(type, freq, at, dur, vol, o = {}) {
    const osc = this.ac.createOscillator();
    const g = this.ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(o.from || freq, at);
    if (o.from) osc.frequency.exponentialRampToValueAtTime(freq, at + (o.glide || 0.08));
    if (o.vib) {
      const lfo = this.ac.createOscillator();
      const lg = this.ac.createGain();
      lfo.frequency.value = o.vib;
      lg.gain.setValueAtTime(0, at);
      lg.gain.linearRampToValueAtTime(freq * 0.012, at + dur * 0.5);
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + dur + 0.1);
    }
    if (o.detune) osc.detune.value = o.detune;
    let node = osc;
    if (o.cutoff) {
      const f = this.ac.createBiquadFilter();
      f.type = o.band ? 'bandpass' : 'lowpass';
      f.frequency.setValueAtTime(o.cutoff, at);
      if (o.close) f.frequency.exponentialRampToValueAtTime(o.close, at + dur);
      if (o.q) f.Q.value = o.q;
      osc.connect(f);
      node = f;
    }
    const atk = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + atk);
    if (o.hold) g.gain.setValueAtTime(vol, at + Math.max(atk, dur - o.hold));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    node.connect(g);
    g.connect(this.songG);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  pluck(f, dur, vol, at, o = {}) {
    this.voice(o.type || 'triangle', f, at, dur, vol, { cutoff: o.cutoff || 2000, close: 300 });
    this.voice('sine', f * 2, at, dur * 0.4, vol * 0.3);
  }
  drone(f, dur, vol, at) {
    this.voice('sine', f, at, dur, vol, { attack: 0.8, hold: dur * 0.5 });
    this.voice('triangle', f * 1.5, at, dur, vol * 0.25, { attack: 1.2, hold: dur * 0.4, cutoff: 900 });
  }
  flute(f, dur, vol, at) {
    this.voice('sine', f, at, dur, vol, { attack: 0.18, hold: dur * 0.4, vib: 5, from: f * 0.97, glide: 0.15 });
    this.noise(Math.min(0.3, dur), vol * 0.25, 3000, { at, out: this.songG, type: 'bandpass' });
  }
  wood(at, vol) {
    this.voice('sine', 880, at, 0.08, vol, { from: 1200, glide: 0.02 });
  }
  keys(f, dur, vol, at) {
    this.voice('sine', f, at, dur, vol, { attack: 0.01 });
    this.voice('triangle', f, at, dur * 0.6, vol * 0.35, { detune: 6, cutoff: 1800, close: 500 });
  }
  bass(f, dur, vol, at) {
    this.voice('triangle', f, at, dur, vol, { attack: 0.01, cutoff: 600 });
  }
  hat(at, vol, snare) {
    this.noise(snare ? 0.12 : 0.05, vol, snare ? 1800 : 7000, { at, out: this.songG, type: snare ? 'bandpass' : 'highpass' });
  }
  horn(f, dur, vol, at) {
    this.voice('sawtooth', f, at, dur, vol, { attack: 0.06, hold: dur * 0.3, cutoff: 1100, vib: 4.5 });
  }
  cello(f, dur, vol, at) {
    this.voice('sawtooth', f, at, dur, vol, { attack: 0.5, hold: dur * 0.5, cutoff: 700, vib: 4 });
  }
  harpsi(f, dur, vol, at) {
    this.voice('square', f, at, dur, vol, { cutoff: 3200, close: 600 });
    this.voice('sawtooth', f * 2, at, dur * 0.3, vol * 0.25, { cutoff: 4000, close: 900 });
  }
  bell(f, dur, vol, at) {
    for (const [m, v] of [[1, 1], [2.76, 0.35], [5.4, 0.15]]) this.voice('sine', f * m, at, dur / m ** 0.3, vol * v);
  }
  tanpura(f, dur, vol, at) {
    this.voice('sawtooth', f, at, dur, vol, { attack: 0.02, cutoff: 1400, close: 400, q: 2 });
    this.voice('sine', f * 2, at, dur * 0.8, vol * 0.4, { attack: 0.3 });
  }
  sitar(f, dur, vol, at) {
    this.voice('sawtooth', f, at, dur, vol, { from: f * 0.94, glide: 0.12, cutoff: 1600, band: true, q: 3, vib: 6 });
    this.voice('triangle', f * 2, at, dur * 0.5, vol * 0.3, { cutoff: 2600, close: 700 });
  }
  tabla(bol, at, k) {
    const low = bol === 'dha' || bol === 'ge' || bol === 'dhi';
    if (low) this.voice('sine', 95, at, 0.35, 0.16 * k, { from: 160, glide: 0.08 });
    if (bol !== 'ge') this.voice('sine', bol === 'ti' || bol === 'ka' ? 520 : 380, at, 0.12, 0.05 * k, { from: 640, glide: 0.03 });
  }
}
