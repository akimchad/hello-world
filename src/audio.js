// Sound engine: synthesized effects plus optional sampled audio (layered,
// pitch-randomized), stage ambience loops, character grunts, a procedural
// music loop and a speech-synthesis announcer. Samples are optional: drop
// files into assets/audio/ (see README) and they replace the synth layers.

export class Audio {
  constructor() {
    this.ctx = null;
    this.settings = { master: 0.8, music: 0, sfx: 0.85, voice: true };
    this.musicOn = false;
    this.musicMode = 'menu';
    this.step = 0;
    this.nextTime = 0;
    this._pitch = 1;
    this.buffers = {};
    this.lastGrunt = {};
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
      this.ambGain = c.createGain();
      this.ambGain.connect(this.master);
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
    if (this.pendingAmb) { const id = this.pendingAmb; this.pendingAmb = null; this.startAmbience(id); }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.master;
    this.musicGain.gain.value = s.music * 0.55;
    this.sfxGain.gain.value = s.sfx;
    this.ambGain.gain.value = s.sfx * 0.45;
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
    const pm = out ? 1 : this._pitch;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0 * pm, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1 * pm, t + dur);
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    src.connect(f).connect(g).connect(out || this.sfxGain);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + attack + 0.05);
  }
  tone(t, { type = 'sine', f0 = 200, f1 = null, dur = 0.15, gain = 0.5, attack = 0.003, out, detune = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    const pm = out ? 1 : this._pitch;
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0 * pm, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1 * pm, t + dur);
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    o.connect(g).connect(out || this.sfxGain);
    o.start(t); o.stop(t + dur + attack + 0.05);
  }

  // ---------- sound effects ----------
  play(name, vol = 1, pitchVar = 0.05) {
    if (!this.ctx) return;
    this._pitch = 1 + (Math.random() * 2 - 1) * pitchVar;
    this._play(name, vol);
    this._pitch = 1;
  }

  _play(name, vol = 1) {
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

  // ---------- sampled audio ----------
  async preload() {
    const files = {
      hit_sharp: 'assets/audio/hit_sharp.wav', heavy_bass: 'assets/audio/heavy_bass.wav', stage_ambience: 'assets/audio/stage_ambience.mp3',
      whoosh: 'assets/audio/whoosh.wav',
    };
    const m = this.manifest ? await this.manifest() : null;
    if (m && m.audio) for (const [k, v] of Object.entries(m.audio)) files[k] = 'assets/' + v.replace(/^assets\//, '');
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) return;
    const dec = new AC(2, 44100, 44100);
    await Promise.all(Object.entries(files).map(async ([k, url]) => {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok || (r.headers.get('content-type') || '').includes('text/html')) return;
        this.buffers[k] = await dec.decodeAudioData(await r.arrayBuffer());
      } catch (e) { /* missing or undecodable: synth fallback */ }
    }));
    if (Object.keys(this.buffers).length) console.info('[audio] samples loaded:', Object.keys(this.buffers).join(', '));
  }

  playBuffer(key, { vol = 1, pitch = 1, when = 0, out = null, loop = false } = {}) {
    const buf = this.buffers[key];
    if (!buf || !this.ctx) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = loop;
    src.playbackRate.value = pitch;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g).connect(out || this.sfxGain);
    src.start(this.ctx.currentTime + 0.003 + when);
    return { src, g };
  }

  // a connecting strike: sharp transient + body thud + sub-bass, each layer with its own ±5% pitch
  hit(kind = 'light', vol = 1, flavor = null) {
    if (!this.ctx) return;
    const r = () => 1 + (Math.random() * 2 - 1) * 0.05;
    const w = { light: [0.8, 0.35, 0.25], medium: [0.9, 0.6, 0.55], heavy: [1, 0.9, 1], special: [0.9, 0.7, 0.8], ult: [0.8, 0.6, 0.7] }[kind] || [0.8, 0.5, 0.4];
    const t = this.ctx.currentTime + 0.004;
    // high: sharp slap
    if (this.buffers.hit_sharp) this.playBuffer('hit_sharp', { vol: w[0] * vol, pitch: r() });
    else { this._pitch = r(); this.noiseHit(t, { dur: 0.045, type: 'highpass', f0: 2600, gain: 0.7 * w[0] * vol }); this.noiseHit(t, { dur: 0.08, type: 'bandpass', f0: 1800, f1: 700, q: 1.2, gain: 0.5 * w[0] * vol }); }
    // mid: body thud
    this._pitch = r();
    this.tone(t, { f0: 190, f1: 70, dur: 0.1 + w[1] * 0.08, gain: 0.6 * w[1] * vol });
    this.noiseHit(t, { dur: 0.12, f0: 900, f1: 180, gain: 0.45 * w[1] * vol });
    // low: sub-bass boom
    if (this.buffers.heavy_bass) this.playBuffer('heavy_bass', { vol: w[2] * vol, pitch: r() });
    else if (w[2] > 0.3) { this._pitch = r(); this.tone(t, { f0: 85, f1: 32, dur: 0.18 + w[2] * 0.2, gain: 0.9 * w[2] * vol }); if (kind === 'heavy') this.tone(t, { type: 'square', f0: 60, f1: 30, dur: 0.12, gain: 0.18 * vol }); }
    this._pitch = 1;
    if (flavor && flavor !== 'light' && flavor !== 'heavy') this.play(flavor, 0.8 * vol);
  }

  // swing whoosh, timed to land just before the hit
  whoosh(delay = 0, strength = 1) {
    if (!this.ctx) return;
    const r = 1 + (Math.random() * 2 - 1) * 0.05;
    if (this.buffers.whoosh) { this.playBuffer('whoosh', { vol: 0.6 * strength, pitch: r * (1.15 - strength * 0.2), when: delay }); return; }
    const t = this.ctx.currentTime + 0.004 + delay;
    this._pitch = r;
    this.noiseHit(t, { dur: 0.1 + strength * 0.1, type: 'bandpass', f0: 450, f1: 2200, q: 1.4, gain: 0.25 * strength, attack: 0.04 + strength * 0.03 });
    this.noiseHit(t, { dur: 0.08 + strength * 0.08, type: 'bandpass', f0: 900, f1: 3500, q: 2, gain: 0.12 * strength, attack: 0.05 });
    this._pitch = 1;
  }

  // vocal grunts: sampled if provided (grunt_hurt, grunt_effort, grunt_ko[_n]), otherwise formant-synthesized
  grunt(hero, type = 'hurt', vol = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const key = hero.id + type;
    if (now - (this.lastGrunt[hero.id] || 0) < (type === 'ko' ? 0 : 0.35)) return;
    this.lastGrunt[hero.id] = now;
    const sampled = Object.keys(this.buffers).filter((k) => k === 'grunt_' + type || k.startsWith('grunt_' + type + '_') || k === hero.id + '_' + type);
    if (sampled.length) { this.playBuffer(sampled[Math.floor(Math.random() * sampled.length)], { vol, pitch: 1 + (Math.random() * 2 - 1) * 0.05 }); return; }
    void key;
    const V = { hulk: [72, 0.9, 1], doom: [92, 0.4, 0.7], thor: [105, 0.3, 0.6], cap: [118, 0.15, 0.5], ironman: [112, 0.2, 0.5], spiderman: [135, 0.1, 0.45], sentry: [115, 0.2, 0.55], gamora: [215, 0.05, 0.4] }[hero.id] || [120, 0.2, 0.5];
    const [base, grit, breath] = V;
    const f0 = base * (1 + (Math.random() * 2 - 1) * 0.06) * (type === 'effort' ? 1.08 : type === 'ko' ? 0.9 : 1.15);
    const dur = type === 'ko' ? 0.7 : type === 'effort' ? 0.22 : 0.26;
    const formants = type === 'effort' ? [[620, 6], [1080, 8], [2400, 10]] : type === 'ko' ? [[520, 6], [900, 8], [2300, 10]] : [[700, 5], [1150, 7], [2500, 10]];
    const c = this.ctx, t = now + 0.005;
    const out = c.createGain(); out.connect(this.sfxGain);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.025); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const src = c.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0 * 1.15, t); src.frequency.exponentialRampToValueAtTime(f0 * (type === 'ko' ? 0.6 : 0.8), t + dur);
    const vib = c.createOscillator(); vib.frequency.value = 28 + grit * 30; const vg = c.createGain(); vg.gain.value = f0 * grit * 0.25; vib.connect(vg).connect(src.frequency);
    const mix = c.createGain(); mix.gain.value = 0.35;
    for (const [fq, q] of formants) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq * (hero.id === 'gamora' ? 1.18 : 1); bp.Q.value = q; src.connect(bp).connect(mix); }
    let tail = mix;
    if (hero.id === 'ironman' || hero.id === 'doom') { const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1400; hp.Q.value = 0.8; mix.connect(hp); tail = hp; } // helmet / mask
    tail.connect(out);
    this.noiseHit(t, { dur: dur * 0.8, type: 'bandpass', f0: 1600, q: 0.7, gain: 0.12 * breath * vol, attack: 0.02, out });
    src.start(t); vib.start(t); src.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  // looping stage ambience: sampled loop if provided, otherwise synthesized per stage
  startAmbience(stageId) {
    this.stopAmbience();
    if (!this.ctx) { this.pendingAmb = stageId; return; }
    const c = this.ctx, out = c.createGain(); out.connect(this.ambGain); out.gain.value = 0;
    out.gain.linearRampToValueAtTime(1, c.currentTime + 1.5);
    const nodes = [];
    const own = this.buffers['ambience_' + stageId] ? 'ambience_' + stageId : (this.buffers.stage_ambience ? 'stage_ambience' : null);
    if (own) { const p = this.playBuffer(own, { vol: 0.8, out, loop: true }); nodes.push(p.src); }
    else {
      const noise = (type, f, q, g) => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gg = c.createGain(); gg.gain.value = g; s.connect(fl).connect(gg).connect(out); s.start(); nodes.push(s); return { fl, gg }; };
      const drone = (f, g, type = 'sawtooth') => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 220; const gg = c.createGain(); gg.gain.value = g; o.connect(fl).connect(gg).connect(out); o.start(); nodes.push(o); };
      if (stageId === 'rooftop') { noise('lowpass', 1800, 0.4, 0.55); noise('highpass', 5000, 0.5, 0.12); drone(48, 0.12, 'sine'); }
      else if (stageId === 'space') { drone(41, 0.25); drone(41.6, 0.2); drone(82.5, 0.08); noise('lowpass', 300, 0.6, 0.18); }
      else { const w = noise('bandpass', 500, 0.6, 0.35); const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lg = c.createGain(); lg.gain.value = 250; lfo.connect(lg).connect(w.fl.frequency); lfo.start(); nodes.push(lfo); drone(110, 0.03, 'sine'); drone(164.8, 0.025, 'sine'); }
    }
    this.amb = { out, nodes };
  }
  stopAmbience() {
    if (!this.amb || !this.ctx) { this.amb = null; return; }
    const { out, nodes } = this.amb; const t = this.ctx.currentTime;
    out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => { nodes.forEach((n) => { try { n.stop(); } catch (e) { /* already stopped */ } }); out.disconnect(); }, 700);
    this.amb = null;
  }
  thunder() { if (!this.ctx) return; this._pitch = 0.9 + Math.random() * 0.2; const t = this.ctx.currentTime; this.noiseHit(t, { dur: 2.2, f0: 300, f1: 60, gain: 0.5, attack: 0.08, out: this.ambGain }); this.tone(t, { f0: 50, f1: 28, dur: 1.8, gain: 0.4, out: this.ambGain }); this._pitch = 1; }

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
