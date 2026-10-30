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
    this.crowdOn = on;
    if (this.bedG) this.bedG.gain.setTargetAtTime(on ? CROWD_BED : 0, this.ac.currentTime, 0.5);
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
