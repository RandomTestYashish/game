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
export const RUSH_TEMPO = 1.08; // Power Rush plays the music a touch faster
const TRACK_GAIN = 0.55; // the files are mastered loud; this sits them under the effects
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
      this.musicG.connect(this.master);
      this.sfxG.connect(this.master);

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
      case 'cheer': {
        // A crowd roar: a swell of filtered noise, a few whoops and claps.
        const big = Math.min(arg || 1, 3);
        const t = this.ac.currentTime;
        const roar = (cut, vol, dur) => {
          const src = this.ac.createBufferSource();
          src.buffer = this.noiseBuf;
          src.loop = true;
          const f = this.ac.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = cut;
          f.Q.value = 0.8;
          const g = this.ac.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(vol, t + 0.12);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          src.connect(f);
          f.connect(g);
          g.connect(this.sfxG);
          src.start(t);
          src.stop(t + dur + 0.05);
        };
        roar(900, 0.16 + big * 0.04, 0.7 + big * 0.25);
        roar(2200, 0.08 + big * 0.02, 0.5 + big * 0.2);
        for (let i = 0; i < 2 + big; i++) {
          const f = 600 + Math.random() * 500;
          this.tone(f, 0.22, 'triangle', 0.07, { to: f * 1.6, delay: 0.05 + i * 0.09 + Math.random() * 0.05 });
        }
        for (let i = 0; i < 4 + big * 3; i++) this.noise(0.03, 0.12, 3000, { type: 'highpass', delay: 0.1 + i * 0.07 + Math.random() * 0.04 });
        break;
      }
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
