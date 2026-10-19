// Fully synthesized audio: sound effects, a procedural music loop, and a
// speech-synthesis announcer. No audio files are needed.

export class Audio {
  constructor() {
    this.ctx = null;
    this.settings = { master: 0.8, music: 0, sfx: 0.85, voice: true };
    this.musicOn = false;
    this.musicMode = 'menu';
    this.step = 0;
    this.nextTime = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.master = c.createGain();
      this.musicGain = c.createGain();
      this.sfxGain = c.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.comp).connect(c.destination);
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.timer = setInterval(() => this.schedule(), 25);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.master;
    this.musicGain.gain.value = s.music * 0.55;
    this.sfxGain.gain.value = s.sfx;
  }

  // ---------- building blocks ----------
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  noiseHit(t, { dur = 0.1, type = 'lowpass', f0 = 2000, f1 = null, q = 0.8, gain = 0.6, attack = 0.002, out } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    src.connect(f).connect(g).connect(out || this.sfxGain);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + attack + 0.05);
  }
  tone(t, { type = 'sine', f0 = 200, f1 = null, dur = 0.15, gain = 0.5, attack = 0.003, out, detune = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    o.connect(g).connect(out || this.sfxGain);
    o.start(t); o.stop(t + dur + attack + 0.05);
  }

  // ---------- sound effects ----------
  play(name, vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    const v = vol;
    switch (name) {
      case 'light':
        this.noiseHit(t, { dur: 0.07, f0: 2200, f1: 600, gain: 0.55 * v });
        this.tone(t, { f0: 170, f1: 60, dur: 0.09, gain: 0.7 * v });
        break;
      case 'heavy':
        this.noiseHit(t, { dur: 0.16, f0: 1400, f1: 200, gain: 0.8 * v });
        this.tone(t, { f0: 120, f1: 38, dur: 0.22, gain: 0.95 * v });
        this.tone(t, { type: 'square', f0: 80, f1: 40, dur: 0.08, gain: 0.25 * v });
        break;
      case 'block':
        this.noiseHit(t, { dur: 0.05, type: 'bandpass', f0: 3200, q: 3, gain: 0.6 * v });
        this.tone(t, { type: 'triangle', f0: 1400, f1: 900, dur: 0.07, gain: 0.25 * v });
        break;
      case 'whoosh':
        this.noiseHit(t, { dur: 0.14, type: 'bandpass', f0: 500, f1: 1800, q: 1.2, gain: 0.22 * v, attack: 0.03 });
        break;
      case 'jump':
        this.noiseHit(t, { dur: 0.12, type: 'bandpass', f0: 700, f1: 1500, q: 1, gain: 0.12 * v, attack: 0.02 });
        break;
      case 'land':
        this.tone(t, { f0: 90, f1: 40, dur: 0.1, gain: 0.35 * v });
        this.noiseHit(t, { dur: 0.06, f0: 600, gain: 0.2 * v });
        break;
      case 'web':
        this.noiseHit(t, { dur: 0.16, type: 'bandpass', f0: 4200, f1: 700, q: 2, gain: 0.5 * v });
        this.tone(t, { type: 'triangle', f0: 1600, f1: 300, dur: 0.12, gain: 0.18 * v });
        break;
      case 'blast':
        this.tone(t, { type: 'sawtooth', f0: 1500, f1: 160, dur: 0.28, gain: 0.32 * v });
        this.tone(t, { type: 'square', f0: 760, f1: 120, dur: 0.22, gain: 0.12 * v });
        this.noiseHit(t, { dur: 0.2, f0: 5000, f1: 800, gain: 0.25 * v });
        break;
      case 'zap':
        for (let i = 0; i < 6; i++) this.noiseHit(t + i * 0.035 + Math.random() * 0.02, { dur: 0.06, type: 'highpass', f0: 2500 + Math.random() * 2500, gain: 0.45 * v });
        this.tone(t, { type: 'sawtooth', f0: 90, f1: 50, dur: 0.5, gain: 0.3 * v });
        this.noiseHit(t + 0.05, { dur: 0.6, f0: 400, f1: 60, gain: 0.6 * v });
        break;
      case 'boom':
        this.noiseHit(t, { dur: 0.9, f0: 900, f1: 60, gain: 0.95 * v, attack: 0.005 });
        this.tone(t, { f0: 70, f1: 25, dur: 0.8, gain: 0.95 * v });
        break;
      case 'shield':
        [520, 1310, 2230, 3170].forEach((f, i) => this.tone(t, { type: 'sine', f0: f, dur: 0.6 - i * 0.1, gain: 0.16 * v }));
        this.noiseHit(t, { dur: 0.05, type: 'highpass', f0: 3000, gain: 0.3 * v });
        break;
      case 'slash':
        this.noiseHit(t, { dur: 0.13, type: 'highpass', f0: 1500, f1: 6000, gain: 0.4 * v, attack: 0.02 });
        this.tone(t + 0.03, { type: 'triangle', f0: 2600, f1: 2200, dur: 0.25, gain: 0.08 * v });
        break;
      case 'roar':
        this.tone(t, { type: 'sawtooth', f0: 110, f1: 70, dur: 0.7, gain: 0.35 * v, attack: 0.05 });
        this.tone(t, { type: 'sawtooth', f0: 113, f1: 66, dur: 0.7, gain: 0.3 * v, attack: 0.05 });
        this.noiseHit(t, { dur: 0.7, type: 'bandpass', f0: 600, f1: 300, q: 2, gain: 0.4 * v, attack: 0.05 });
        break;
      case 'beam':
        for (let i = 0; i < 3; i++) this.tone(t, { type: 'sawtooth', f0: 180 + i * 90, f1: 140 + i * 60, dur: 1.3, gain: 0.12 * v, attack: 0.05, detune: i * 7 });
        this.noiseHit(t, { dur: 1.2, type: 'bandpass', f0: 1800, f1: 900, q: 0.8, gain: 0.3 * v, attack: 0.05 });
        break;
      case 'ultstart':
        this.tone(t, { type: 'sawtooth', f0: 80, f1: 600, dur: 0.6, gain: 0.25 * v, attack: 0.02 });
        this.noiseHit(t, { dur: 0.6, type: 'bandpass', f0: 300, f1: 4000, q: 1, gain: 0.35 * v, attack: 0.4 });
        this.tone(t + 0.6, { f0: 60, f1: 30, dur: 0.6, gain: 0.8 * v });
        break;
      case 'ko':
        this.play('boom', 1.1);
        this.tone(t, { type: 'sawtooth', f0: 400, f1: 50, dur: 1.2, gain: 0.25 * v });
        break;
      case 'select':
        this.tone(t, { type: 'square', f0: 880, dur: 0.05, gain: 0.08 * v });
        break;
      case 'confirm':
        [440, 660, 880].forEach((f, i) => this.tone(t + i * 0.04, { type: 'square', f0: f, dur: 0.16, gain: 0.07 * v }));
        this.tone(t, { f0: 90, f1: 40, dur: 0.3, gain: 0.5 * v });
        break;
      case 'back':
        this.tone(t, { type: 'square', f0: 500, f1: 300, dur: 0.08, gain: 0.07 * v });
        break;
      case 'count':
        this.tone(t, { f0: 110, f1: 50, dur: 0.35, gain: 0.6 * v });
        this.noiseHit(t, { dur: 0.25, f0: 1200, f1: 200, gain: 0.3 * v });
        break;
    }
  }

  // ---------- announcer ----------
  say(text) {
    if (!this.settings.voice || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.82; u.pitch = 0.35; u.volume = Math.min(1, this.settings.master * 1.2);
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find((x) => /Daniel|Alex|Fred|Google UK English Male|Male/i.test(x.name)) || voices.find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch (e) { /* speech is optional */ }
  }

  // ---------- music ----------
  setMusic(mode) { this.musicMode = mode; this.musicOn = mode !== 'off'; }

  schedule() {
    if (!this.ctx || !this.musicOn || this.settings.music <= 0 || this.ctx.state !== 'running') return;
    const c = this.ctx;
    const fight = this.musicMode === 'fight';
    const bpm = fight ? 132 : 92;
    const stepDur = 60 / bpm / 4;
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, fight, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(s, t, fight, sd) {
    const out = this.musicGain;
    const bar = Math.floor(s / 16) % 4;
    const i = s % 16;
    // D minor-ish progression: D, Bb, C, A
    const roots = [36.71, 29.14, 32.7, 27.5];
    const root = roots[bar];
    if (fight) {
      if (i % 4 === 0 || i === 10) { // kick
        this.tone(t, { f0: 150, f1: 42, dur: 0.18, gain: 0.9, out });
      }
      if (i === 4 || i === 12) { // snare
        this.noiseHit(t, { dur: 0.14, type: 'bandpass', f0: 1800, q: 0.7, gain: 0.5, out });
        this.tone(t, { type: 'triangle', f0: 220, f1: 160, dur: 0.08, gain: 0.25, out });
      }
      if (i % 2 === 1) this.noiseHit(t, { dur: 0.03, type: 'highpass', f0: 8000, gain: 0.12, out });
      // driving bass
      const pat = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 2, 1.5];
      const m = pat[i];
      if (m) this.bass(t, root * 2 * m, sd * 0.9, 0.32, out);
      if (i === 0) this.pad(t, root * 4, sd * 16, 0.05, out);
    } else {
      if (i === 0 || i === 8) this.tone(t, { f0: 90, f1: 40, dur: 0.4, gain: 0.5, out });
      if (i % 4 === 2) this.noiseHit(t, { dur: 0.05, type: 'highpass', f0: 7000, gain: 0.05, out });
      if (i === 0) this.pad(t, root * 4, sd * 16, 0.07, out);
      if (i % 4 === 0) this.bass(t, root * 2, sd * 3, 0.2, out);
    }
  }

  bass(t, f, dur, gain, out) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 6;
    fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(140, t + dur);
    const g = c.createGain(); this.env(g, t, 0.005, gain, dur);
    o.connect(fl).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  pad(t, f, dur, gain, out) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1200;
    fl.connect(g).connect(out);
    [1, 1.189, 1.498].forEach((r, k) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * r; o.detune.value = (k - 1) * 8;
      o.connect(fl); o.start(t); o.stop(t + dur + 0.05);
    });
  }
}
