// Synthesised sound effects and a small generative music loop (Web Audio).
// Nothing is created until the first user gesture calls unlock().

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Four bars: Am7 - Fmaj7 - C - G
const CHORDS = [
  { bass: 45, arp: [57, 60, 64, 67] },
  { bass: 41, arp: [57, 60, 65, 69] },
  { bass: 48, arp: [55, 60, 64, 67] },
  { bass: 43, arp: [55, 59, 62, 67] },
];
const MELODY = [76, 0, 72, 0, 0, 69, 0, 0, 72, 0, 77, 0, 76, 0, 0, 0, 79, 0, 76, 0, 0, 72, 0, 0, 74, 0, 71, 0, 67, 0, 0, 0];
const STEP = 60 / 104 / 2;

export class AudioSys {
  constructor(settings) {
    this.settings = settings; // { music, sfx, muted } - shared with the save data
    this.ac = null;
    this.playing = false;
    this.timer = null;
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
    this.timer = setInterval(() => this.schedule(), 90);
  }

  schedule() {
    if (!this.ac || this.ac.state !== 'running') return;
    if (this.nextT < this.ac.currentTime) this.nextT = this.ac.currentTime + 0.05;
    while (this.nextT < this.ac.currentTime + 0.3) {
      const s = this.step;
      const bar = CHORDS[Math.floor(s / 8) % 4];
      const at = this.nextT;
      const out = this.musicG;
      this.tone(NOTE(bar.arp[[0, 1, 2, 3, 2, 1, 2, 3][s % 8]]), STEP * 1.6, 'triangle', 0.16, { at, out, attack: 0.01 });
      if (s % 4 === 0) this.tone(NOTE(bar.bass), STEP * 3.6, 'sine', 0.3, { at, out, attack: 0.02 });
      const m = MELODY[s % 32];
      if (m && Math.floor(s / 32) % 2 === 1) this.tone(NOTE(m), STEP * 1.8, 'square', 0.045, { at, out, attack: 0.02 });
      if (s % 2 === 1) this.noise(0.03, 0.035, 6000, { at, out, type: 'highpass' });
      this.step++;
      this.nextT += STEP;
    }
  }
}
