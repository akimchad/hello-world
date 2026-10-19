// App bootstrap: renderer, screens/menus, character & stage select with 3D
// previews, settings, key rebinding, and the match lifecycle.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HEROES, heroById } from './heroes.js';
import { STAGES, buildArena, makeEnvironment } from './arenas.js';
import { POSES, lerpPose, clonePose, addTo } from './rig.js';
import { Keyboard, PlayerInput, DEFAULT_BINDINGS, ACTIONS, ACTION_LABELS, keyLabel } from './input.js';
import { CpuInput } from './ai.js';
import { Audio } from './audio.js';
import { Match } from './game.js';
import { HUD } from './hud.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('mk-' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('mk-' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

// ---------------------------------------------------------------- settings
const DEFAULT_SETTINGS = { master: 0.8, music: 0, sfx: 0.85, voice: true, time: 99, rounds: 2, quality: 'high', shake: true, cpu: 'normal' };
const settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));
const bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
const savedBind = store.get('bindings', null);
if (savedBind) for (const p of ['p1', 'p2']) for (const a of ACTIONS) if (savedBind[p] && Array.isArray(savedBind[p][a])) bindings[p][a] = savedBind[p][a].slice(0, 2);

// ---------------------------------------------------------------- renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const msaaTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, msaaTarget);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.5, 0.88);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.55 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float vignette; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(l), col, 1.03); col = (col - 0.5) * 1.05 + 0.5;
      col *= vec3(1.02, 1.0, 0.98);
      vec2 d = vUv - 0.5; col *= 1.0 - vignette * dot(d, d) * 1.5;
      float n = fract(sin(dot(vUv * 937.0 + time, vec2(12.9898, 78.233))) * 43758.5453); col += (n - 0.5) * 0.022;
      gl_FragColor = vec4(col, c.a); }`,
});
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(grade);

function applyQuality() {
  const q = settings.quality;
  const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = q !== 'low';
  renderer.shadowMap.needsUpdate = true;
  bloom.enabled = q === 'high';
  // materials must recompile when shadows toggle
  for (const s of [showcase && showcase.scene, match && match.scene]) if (s) s.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
}

// ---------------------------------------------------------------- systems
const audio = new Audio();
Object.assign(audio.settings, { master: settings.master, music: settings.music, sfx: settings.sfx, voice: settings.voice });
const kb = new Keyboard();
kb.setBindings(bindings);
const hud = new HUD();
const humanInputs = [new PlayerInput(kb, bindings.p1), new PlayerInput(kb, bindings.p2)];

const app = {
  screen: 'menu', mode: 'pvp', paused: false, overlays: [],
  picks: [0, 1], cursor: [0, 1], locked: [false, false], stage: 0,
  lastMatch: null, focus: {},
};
let showcase = null;
let match = null;
window.__game = { app, get match() { return match; }, get showcase() { return showcase; }, settings, bindings, audio, kb };

// ---------------------------------------------------------------- showcase scene (menus)
class Showcase {
  constructor(stageId) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 1200);
    this.arena = buildArena(stageId);
    this.scene.add(this.arena.group);
    this.scene.fog = this.arena.fog;
    this.arena.envRT = makeEnvironment(renderer, this.arena);
    this.scene.environment = this.arena.envRT.texture;
    this.rigs = [null, null];
    this.ids = [null, null];
    this.pose = [clonePose(POSES.idle), clonePose(POSES.idle)];
    this.celebrate = [0, 0];
    this.mode = 'menu';
    this.t = 0;
    this.camPos = new THREE.Vector3(0, 2, 9);
  }
  setHero(side, id, alt = false) {
    if (this.ids[side] === id + alt) return;
    this.ids[side] = id + alt;
    if (this.rigs[side]) { this.scene.remove(this.rigs[side].root); disposeTree(this.rigs[side].root); }
    const rig = heroById(id).build(alt);
    rig.heroId = id;
    rig.root.position.set(side === 0 ? -1.75 : 1.75, 0, 0);
    rig.root.rotation.y = side === 0 ? 0.75 : -0.75;
    this.scene.add(rig.root);
    this.rigs[side] = rig;
    for (let i = 0; i < 30; i++) rig.update(POSES.idle, 0.05, 30);
  }
  clearHero(side) { if (this.rigs[side]) { this.scene.remove(this.rigs[side].root); disposeTree(this.rigs[side].root); } this.rigs[side] = null; this.ids[side] = null; }
  cheer(side) { this.celebrate[side] = 1.6; }
  update(dt) {
    this.t += dt;
    this.arena.update(dt, this.t);
    this.rigs.forEach((rig, i) => {
      if (!rig) return;
      let base = POSES.idle;
      if (this.celebrate[i] > 0) { this.celebrate[i] -= dt; base = POSES.victory; }
      const p = lerpPose(base, base, 0, this.pose[i]);
      const br = Math.sin(this.t * 2.4 + i * 1.7) * 0.05;
      addTo(p, 'spine', br); addTo(p, 'lEl', -br * 2); addTo(p, 'rEl', br * 2); p.hipY = br * 0.5;
      rig.update(p, dt, this.celebrate[i] > 0 ? 10 : 8);
      rig.setExpression(this.exprOverride || (this.celebrate[i] > 0 ? 'laugh' : (rig.heroId === 'doom' ? 'grit' : 'focus')));
      if (rig.face) rig.face.look = i === 0 ? 0.3 : -0.3;
      rig.root.updateMatrixWorld(true);
      rig.lateUpdate(dt);
    });
    const look = new THREE.Vector3(0, 1.0, 0);
    let pos;
    if (this.mode === 'menu') pos = new THREE.Vector3(Math.sin(this.t * 0.12) * 3 + 2.5, 1.5, 7.4);
    else if (this.mode === 'select') { pos = new THREE.Vector3(0, 1.45, 7.6); look.set(0, 0.55, 0); }
    else { pos = new THREE.Vector3(Math.sin(this.t * 0.15) * 9, 3.2 + Math.sin(this.t * 0.2), 13 + Math.cos(this.t * 0.15) * 2); look.set(0, 1.5, -2); }
    if (this.debugCam) { pos = this.debugCam.pos; look.copy(this.debugCam.look); this.camPos.copy(pos); }
    this.camPos.lerp(pos, 1 - Math.exp(-3 * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(look);
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  dispose() { this.arena.dispose(); this.rigs.forEach((r) => r && disposeTree(r.root)); }
}

function disposeTree(o) {
  o.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); }); } });
}

function setShowcaseStage(id) {
  if (showcase && showcase.arena.id === id) return;
  const prev = showcase;
  showcase = new Showcase(id);
  if (prev) {
    showcase.mode = prev.mode;
    showcase.camPos.copy(prev.camPos);
    prev.ids.forEach((key, i) => { if (key) { const alt = key.endsWith('true'); showcase.setHero(i, key.replace(/(true|false)$/, ''), alt); } });
    prev.dispose();
  }
  showcase.resize(innerWidth, innerHeight);
}

// ---------------------------------------------------------------- portraits
function renderPortraits() {
  const W = 192, H = 232;
  let r;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); }
  catch (e) { return; }
  r.setSize(W, H, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const cards = document.querySelectorAll('.card canvas');
  HEROES.forEach((h, i) => {
    const scene = new THREE.Scene();
    const col = new THREE.Color(h.color);
    scene.background = col.clone().multiplyScalar(0.22);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x202030, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(2, 3, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(col, 4); rim.position.set(-3, 2, -3); scene.add(rim);
    const pm = new THREE.PMREMGenerator(r); const envScene = new THREE.Scene(); envScene.background = new THREE.Color(0x404858); const envRT = pm.fromScene(envScene, 0.04); scene.environment = envRT.texture;
    const rig = h.build(false);
    rig.root.rotation.y = 0.45;
    scene.add(rig.root);
    rig.setExpression(h.id === 'doom' ? 'roar' : 'grit');
    for (let k = 0; k < 30; k++) { rig.update(POSES.idle, 0.05, 30); rig.root.updateMatrixWorld(true); rig.lateUpdate(0.05); }
    if (rig.face) { rig.face.blink = 0; rig.face.blinkT = 9; rig.face.update(0.0001); }
    const head = rig.J.head.localToWorld(rig.headCenter.clone());
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
    const s = rig.dims.scale;
    cam.position.set(head.x + 0.28 * s, head.y - 0.05 * s, head.z + 0.95 * s);
    cam.lookAt(head.x + 0.02, head.y - 0.12 * s, head.z);
    r.render(scene, cam);
    const c = cards[i];
    if (c) { c.width = W; c.height = H; c.getContext('2d').drawImage(r.domElement, 0, 0); }
    disposeTree(rig.root);
    envRT.dispose(); pm.dispose();
  });
  r.dispose();
  r.forceContextLoss && r.forceContextLoss();
}

// ---------------------------------------------------------------- screens
const SCREENS = ['menu', 'select', 'stage', 'hud', 'pause', 'victory', 'settings', 'controls'];
function showScreen(name, on = true) { $('screen-' + name).classList.toggle('active', on); }
function setMain(name) {
  app.screen = name;
  for (const s of ['menu', 'select', 'stage', 'hud', 'pause', 'victory']) showScreen(s, false);
  if (name === 'fight') showScreen('hud');
  else showScreen(name);
  focusFirst();
}

function topScreenEl() {
  if (app.overlays.length) return $('screen-' + app.overlays[app.overlays.length - 1]);
  if (app.screen === 'fight' && app.paused) return $('screen-pause');
  if (app.screen === 'victory') return $('screen-victory');
  return $('screen-' + app.screen);
}
function focusFirst() {
  const el = topScreenEl();
  const btns = el ? [...el.querySelectorAll('.menu-btn')] : [];
  document.querySelectorAll('.menu-btn.focus').forEach((b) => b.classList.remove('focus'));
  if (btns[0]) { btns[0].classList.add('focus'); }
}
function moveFocus(d) {
  const el = topScreenEl();
  const btns = [...el.querySelectorAll('.menu-btn')];
  if (!btns.length) return;
  let i = btns.findIndex((b) => b.classList.contains('focus'));
  btns.forEach((b) => b.classList.remove('focus'));
  i = (i + d + btns.length) % btns.length;
  btns[i].classList.add('focus');
  audio.play('select');
}
function activateFocus() {
  const el = topScreenEl();
  const b = el && el.querySelector('.menu-btn.focus');
  if (b) b.click();
}

function openOverlay(name) {
  app.overlays.push(name);
  showScreen(name);
  if (name === 'settings') loadSettingsUI();
  if (name === 'controls') buildControlsUI();
  focusFirst();
}
function closeOverlay() {
  const name = app.overlays.pop();
  if (name) showScreen(name, false);
  focusFirst();
}

function goMenu() {
  endMatch();
  app.overlays.forEach((o) => showScreen(o, false)); app.overlays = [];
  app.paused = false;
  setShowcaseStage('rooftop');
  showcase.mode = 'menu';
  const a = HEROES[Math.floor(Math.random() * HEROES.length)];
  let b = HEROES[Math.floor(Math.random() * HEROES.length)];
  if (b === a) b = HEROES[(HEROES.indexOf(a) + 1) % HEROES.length];
  showcase.setHero(0, a.id); showcase.setHero(1, b.id);
  setMain('menu');
  audio.setMusic('menu');
}

function goSelect() {
  endMatch();
  app.overlays.forEach((o) => showScreen(o, false)); app.overlays = [];
  app.paused = false;
  setShowcaseStage(STAGES[app.stage].id);
  showcase.mode = 'select';
  app.locked = [false, false];
  app.cursor = app.picks.slice();
  $('p2-cpu-tag').textContent = app.mode === 'cpu' ? '(CPU)' : '';
  $('p2-ready').innerHTML = app.mode === 'cpu' ? 'P1 picks for the CPU after locking in' : 'Press <kbd>Num 1</kbd>/<kbd>K</kbd> to lock in';
  setMain('select');
  refreshSelect();
  audio.setMusic('menu');
}

function goStage() {
  setMain('stage');
  showcase.mode = 'stage';
  buildStageList();
}

// ---------------------------------------------------------------- character select
function buildRoster() {
  const roster = $('roster');
  roster.innerHTML = '';
  HEROES.forEach((h, i) => {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = `<canvas></canvas><div class="card-name">${h.name}</div>`;
    c.addEventListener('mouseenter', () => { const s = activeSelector(); if (s >= 0) { app.cursor[s] = i; refreshSelect(); } });
    c.addEventListener('click', () => { const s = activeSelector(); if (s >= 0) { app.cursor[s] = i; lockPick(s); } });
    roster.appendChild(c);
  });
}
function activeSelector() {
  if (app.mode === 'cpu') return app.locked[0] ? (app.locked[1] ? -1 : 1) : 0;
  return app.locked[0] ? (app.locked[1] ? -1 : 1) : 0;
}
function lockPick(s) {
  if (app.locked[s]) return;
  app.locked[s] = true;
  app.picks[s] = app.cursor[s];
  audio.play('confirm');
  audio.say(HEROES[app.cursor[s]].name);
  showcase.cheer(s);
  refreshSelect();
  if (app.locked[0] && app.locked[1]) setTimeout(() => { if (app.screen === 'select' && app.locked[0] && app.locked[1]) goStage(); }, 900);
}
function unlockPick(s) {
  if (app.locked[s]) { app.locked[s] = false; audio.play('back'); refreshSelect(); }
}
function refreshSelect() {
  const cards = [...document.querySelectorAll('.card')];
  cards.forEach((c, i) => {
    c.classList.toggle('p1', app.cursor[0] === i);
    c.classList.toggle('p2', app.cursor[1] === i);
    c.querySelectorAll('.tag').forEach((t) => t.remove());
    if (app.cursor[0] === i) c.insertAdjacentHTML('beforeend', '<span class="tag t1">P1</span>');
    if (app.cursor[1] === i) c.insertAdjacentHTML('beforeend', `<span class="tag t2">${app.mode === 'cpu' ? 'CPU' : 'P2'}</span>`);
  });
  for (const s of [0, 1]) {
    const h = HEROES[app.cursor[s]];
    const n = s + 1;
    $(`p${n}-name`).textContent = h.name;
    $(`p${n}-title`).textContent = h.title;
    $(`p${n}-stats`).innerHTML = Object.entries(h.stats).map(([k, v]) => `<span>${k}</span><div class="stat-bar"><i style="width:${v * 20}%"></i></div>`).join('');
    $(`p${n}-abil`).innerHTML = `<b>Special:</b> ${h.special.name} — ${h.special.desc}<br><b>Ultimate:</b> ${h.ultimate.name} — ${h.ultimate.desc}<br><b>Trait:</b> ${h.passive}`;
    const rd = $(`p${n}-ready`);
    if (app.locked[s]) { rd.textContent = 'LOCKED IN'; rd.classList.add('locked'); }
    else {
      rd.classList.remove('locked');
      rd.innerHTML = s === 0 ? 'Press <kbd>F</kbd> to lock in' : (app.mode === 'cpu' ? (app.locked[0] ? 'P1: pick the CPU fighter, <kbd>F</kbd> to lock' : 'Waiting for P1…') : 'Press <kbd>Num 1</kbd>/<kbd>K</kbd> to lock in');
    }
    const mirror = app.cursor[0] === app.cursor[1] && s === 1;
    showcase.setHero(s, h.id, mirror);
  }
}
function selectKey(code) {
  const cols = 4;
  const n = HEROES.length;
  const moveCursor = (s, d) => { if (app.locked[s]) return; app.cursor[s] = (app.cursor[s] + d + n) % n; audio.play('select'); refreshSelect(); };
  const p1 = bindings.p1, p2 = bindings.p2;
  const is = (b, a) => b[a].includes(code);
  // in CPU mode, P1's keys drive whichever slot is active
  const s1 = app.mode === 'cpu' ? Math.max(0, activeSelector()) : 0;
  if (is(p1, 'left')) moveCursor(s1, -1);
  else if (is(p1, 'right')) moveCursor(s1, 1);
  else if (is(p1, 'up')) moveCursor(s1, -cols);
  else if (is(p1, 'down')) moveCursor(s1, cols);
  else if (is(p1, 'light') || (code === 'Enter' && app.mode === 'cpu')) lockPick(s1);
  else if (is(p1, 'heavy')) { if (app.mode === 'cpu' && app.locked[0] && !app.locked[1]) unlockPick(0); else unlockPick(s1); }
  if (app.mode !== 'cpu') {
    if (is(p2, 'left')) moveCursor(1, -1);
    else if (is(p2, 'right')) moveCursor(1, 1);
    else if (is(p2, 'up')) moveCursor(1, -cols);
    else if (is(p2, 'down')) moveCursor(1, cols);
    else if (is(p2, 'light') || code === 'Enter') lockPick(code === 'Enter' && !app.locked[0] ? 0 : 1);
    else if (is(p2, 'heavy')) unlockPick(1);
  }
}

// ---------------------------------------------------------------- stage select
function buildStageList() {
  const list = $('stage-list');
  list.innerHTML = '';
  STAGES.forEach((s, i) => {
    const c = document.createElement('div');
    c.className = 'stage-card' + (i === app.stage ? ' sel' : '');
    c.innerHTML = `<h3>${s.name}</h3><p>${s.desc}</p>`;
    c.addEventListener('mouseenter', () => setStage(i));
    c.addEventListener('click', () => { setStage(i); startMatch(); });
    list.appendChild(c);
  });
  setStage(app.stage, true);
}
function setStage(i, silent) {
  if (i !== app.stage && !silent) audio.play('select');
  app.stage = i;
  document.querySelectorAll('.stage-card').forEach((c, k) => c.classList.toggle('sel', k === i));
  setShowcaseStage(STAGES[i].id);
  showcase.mode = 'stage';
}
function stageKey(code) {
  const n = STAGES.length;
  const p1 = bindings.p1, p2 = bindings.p2;
  const any = (a) => p1[a].includes(code) || p2[a].includes(code);
  if (any('left')) setStage((app.stage - 1 + n) % n);
  else if (any('right')) setStage((app.stage + 1) % n);
  else if (any('light') || code === 'Enter') startMatch();
  else if (any('heavy')) goSelect();
}

// ---------------------------------------------------------------- match lifecycle
const cpuInputs = [new CpuInput(settings.cpu), new CpuInput(settings.cpu)];
function startMatch(opts = {}) {
  endMatch();
  app.overlays.forEach((o) => showScreen(o, false)); app.overlays = [];
  app.paused = false;
  const cpu = opts.cpu || [false, app.mode === 'cpu'];
  const heroes = [HEROES[app.picks[0]], HEROES[app.picks[1]]];
  cpuInputs.forEach((c) => { c.setLevel(settings.cpu); c.clear(); });
  humanInputs.forEach((h) => h.clear());
  const inputs = [cpu[0] ? cpuInputs[0] : humanInputs[0], cpu[1] ? cpuInputs[1] : humanInputs[1]];
  app.lastMatch = { cpu };
  match = new Match({
    heroes, stageId: STAGES[app.stage].id, cpu, settings: { ...settings }, audio, inputs, hud, renderer,
    onEnd: (res) => setTimeout(() => showVictory(res), 1600),
  });
  match.resize(innerWidth, innerHeight);
  setMain('fight');
  audio.play('confirm');
}
function endMatch() {
  if (match) { match.dispose(); match = null; }
  window.speechSynthesis && window.speechSynthesis.cancel();
}
function showVictory(res) {
  if (!match || match !== res.match) return;
  app.screen = 'victory';
  const w = res.winner, l = res.loser;
  $('victory-sub').textContent = (w.cpu ? 'CPU' : `Player ${w.side + 1}`) + ' · ' + w.hero.title;
  $('victory-name').textContent = `${w.hero.name} wins`;
  $('victory-flawless').textContent = res.flawless ? 'FLAWLESS VICTORY' : '';
  $('victory-stats').innerHTML = `Rounds ${w.roundWins}–${l.roundWins} · Damage dealt ${Math.round(w.stats.dmg)} · Hits ${w.stats.hits} · Best combo ${w.stats.maxCombo}`;
  showScreen('victory');
  focusFirst();
}

function togglePause(on) {
  if (app.screen !== 'fight' || !match) return;
  app.paused = on;
  showScreen('pause', on);
  if (on) { focusFirst(); audio.play('back'); } else { humanInputs.forEach((h) => h.clear()); }
}

// ---------------------------------------------------------------- settings UI
function loadSettingsUI() {
  $('set-master').value = Math.round(settings.master * 100);
  $('set-music').value = Math.round(settings.music * 100);
  $('set-sfx').value = Math.round(settings.sfx * 100);
  $('set-voice').checked = settings.voice;
  $('set-time').value = String(settings.time);
  $('set-rounds').value = String(settings.rounds);
  $('set-quality').value = settings.quality;
  $('set-shake').checked = settings.shake;
  $('set-cpu').value = settings.cpu;
}
function bindSettingsUI() {
  const save = () => {
    settings.master = $('set-master').value / 100;
    settings.music = $('set-music').value / 100;
    settings.sfx = $('set-sfx').value / 100;
    settings.voice = $('set-voice').checked;
    settings.time = +$('set-time').value;
    settings.rounds = +$('set-rounds').value;
    const q = $('set-quality').value; const qChanged = q !== settings.quality; settings.quality = q;
    settings.shake = $('set-shake').checked;
    settings.cpu = $('set-cpu').value;
    Object.assign(audio.settings, { master: settings.master, music: settings.music, sfx: settings.sfx, voice: settings.voice });
    audio.applyVolumes();
    if (match) { match.settings.shake = settings.shake; }
    cpuInputs.forEach((c) => c.setLevel(settings.cpu));
    if (qChanged) applyQuality();
    store.set('settings', settings);
  };
  ['set-master', 'set-music', 'set-sfx'].forEach((id) => $(id).addEventListener('input', save));
  ['set-voice', 'set-time', 'set-rounds', 'set-quality', 'set-shake', 'set-cpu'].forEach((id) => $(id).addEventListener('change', save));
  $('set-sfx').addEventListener('change', () => audio.play('heavy'));
}

// ---------------------------------------------------------------- controls UI
let listening = null;
function buildControlsUI() {
  const grid = $('controls-grid');
  grid.innerHTML = '';
  for (const [p, label] of [['p1', 'Player 1'], ['p2', 'Player 2']]) {
    const col = document.createElement('div');
    col.innerHTML = `<h4 class="${p}">${label}</h4>`;
    for (const a of ACTIONS) {
      const row = document.createElement('div');
      row.className = 'ctrl-row';
      row.innerHTML = `<span>${ACTION_LABELS[a]}</span>`;
      for (const slot of [0, 1]) {
        const b = document.createElement('button');
        b.className = 'keybtn';
        b.textContent = keyLabel(bindings[p][a][slot]);
        b.title = slot ? 'Alternate key (Backspace clears)' : 'Main key';
        b.addEventListener('click', () => {
          document.querySelectorAll('.keybtn.listening').forEach((x) => x.classList.remove('listening'));
          b.classList.add('listening'); b.textContent = 'press…';
          listening = { p, a, slot, b };
        });
        row.appendChild(b);
      }
      col.appendChild(row);
    }
    grid.appendChild(col);
  }
}
kb.listeners.push((e) => {
  if (!listening) return false;
  const { p, a, slot } = listening;
  if (e.code === 'Escape') { listening = null; buildControlsUI(); return true; }
  if ((e.code === 'Backspace' || e.code === 'Delete') && slot === 1) { bindings[p][a][1] = null; }
  else {
    // remove this key anywhere else so one key never drives two actions
    for (const pp of ['p1', 'p2']) for (const aa of ACTIONS) for (const s of [0, 1]) if (bindings[pp][aa][s] === e.code) bindings[pp][aa][s] = null;
    bindings[p][a][slot] = e.code;
  }
  listening = null;
  saveBindings();
  buildControlsUI();
  audio.play('confirm');
  return true;
});
function saveBindings() {
  humanInputs[0].bindings = bindings.p1; humanInputs[1].bindings = bindings.p2;
  kb.setBindings(bindings);
  store.set('bindings', bindings);
}

// ---------------------------------------------------------------- actions & keys
function handleAction(action) {
  audio.unlock();
  switch (action) {
    case 'play': app.mode = 'pvp'; goSelect(); break;
    case 'play-cpu': app.mode = 'cpu'; goSelect(); break;
    case 'select': goSelect(); break;
    case 'settings': openOverlay('settings'); break;
    case 'controls': openOverlay('controls'); break;
    case 'back': closeOverlay(); break;
    case 'resume': togglePause(false); break;
    case 'restart': case 'rematch': startMatch({ cpu: app.lastMatch && app.lastMatch.cpu }); break;
    case 'quit': goMenu(); break;
    case 'reset-keys':
      for (const p of ['p1', 'p2']) for (const a of ACTIONS) bindings[p][a] = DEFAULT_BINDINGS[p][a].slice();
      saveBindings(); buildControlsUI(); break;
  }
  if (['play', 'play-cpu', 'select', 'settings', 'controls'].includes(action)) audio.play('confirm');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.menu-btn');
  if (b && b.dataset.action) handleAction(b.dataset.action);
});
document.addEventListener('mouseover', (e) => {
  const b = e.target.closest('.menu-btn');
  if (b) { document.querySelectorAll('.menu-btn.focus').forEach((x) => x.classList.remove('focus')); b.classList.add('focus'); }
});
window.addEventListener('pointerdown', () => { audio.unlock(); audio.setMusic(app.screen === 'fight' ? 'fight' : 'menu'); }, { once: true });

const NAV_UP = ['KeyW', 'ArrowUp'], NAV_DOWN = ['KeyS', 'ArrowDown'], NAV_OK = ['Enter', 'Space', 'KeyF', 'Numpad1', 'KeyK'];
kb.onPress = (code) => {
  audio.unlock();
  if (!audio.musicOn) audio.setMusic(app.screen === 'fight' ? 'fight' : 'menu');
  // fight input
  if (app.screen === 'fight' && !app.paused && !app.overlays.length) {
    if (code === 'Escape') { togglePause(true); return; }
    humanInputs[0].notePress(code); humanInputs[1].notePress(code);
    return;
  }
  const menuLike = app.overlays.length || app.screen === 'menu' || app.paused || app.screen === 'victory';
  if (code === 'Escape') {
    if (app.overlays.length) closeOverlay();
    else if (app.paused) togglePause(false);
    else if (app.screen === 'select') { if (app.locked[1]) unlockPick(1); else if (app.locked[0]) unlockPick(0); else goMenu(); }
    else if (app.screen === 'stage') goSelect();
    else if (app.screen === 'victory') goMenu();
    return;
  }
  if (menuLike) {
    if (app.overlays[app.overlays.length - 1] === 'controls' || app.overlays[app.overlays.length - 1] === 'settings') {
      if (code === 'Enter') activateFocus();
      return;
    }
    if (NAV_UP.includes(code) || code === 'KeyA' || code === 'ArrowLeft') moveFocus(-1);
    else if (NAV_DOWN.includes(code) || code === 'KeyD' || code === 'ArrowRight') moveFocus(1);
    else if (NAV_OK.includes(code)) activateFocus();
    return;
  }
  if (app.screen === 'select') selectKey(code);
  else if (app.screen === 'stage') stageKey(code);
};

// ---------------------------------------------------------------- loop
let last = performance.now();
let fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { window.__game.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  for (const h of humanInputs) h.update(dt);
  let scene, camera;
  if (match && (app.screen === 'fight' || app.screen === 'victory')) {
    if (!app.paused && !app.overlays.length) match.update(dt);
    scene = match.scene; camera = match.camera;
    renderer.toneMappingExposure = match.arena.exposure || 1;
  } else if (showcase) {
    showcase.update(dt);
    scene = showcase.scene; camera = showcase.camera;
    renderer.toneMappingExposure = showcase.arena.exposure || 1;
  }
  if (!scene) return;
  grade.uniforms.time.value = (now * 0.001) % 100;
  if (settings.quality !== 'low') { renderPass.scene = scene; renderPass.camera = camera; composer.render(dt); }
  else renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  showcase && showcase.resize(innerWidth, innerHeight);
  match && match.resize(innerWidth, innerHeight);
});

// debug/test hook: frame a showcase hero (side 0/1) — 'face' or 'body'
window.__game.inspect = (heroIndex, framing = 'face', side = 0, expr = null, turn = 0) => {
  showcase.setHero(side, HEROES[heroIndex].id);
  const rig = showcase.rigs[side];
  rig.root.rotation.y = (side === 0 ? 0.75 : -0.75) + turn;
  showcase.exprOverride = expr;
  rig.root.updateMatrixWorld(true);
  const h = rig.J.head.localToWorld(rig.headCenter.clone());
  const s = rig.dims.scale;
  if (framing === 'face') showcase.debugCam = { pos: h.clone().add(new THREE.Vector3(0.0, 0.0, 0.75 * s)), look: h.clone() };
  else if (framing === 'body') showcase.debugCam = { pos: new THREE.Vector3(rig.root.position.x, 1.1 * s, 4.2 * s), look: new THREE.Vector3(rig.root.position.x, 0.95 * s, 0) };
  else showcase.debugCam = null;
};
window.__game.freezeCelebrate = (v) => { showcase.celebrate = [v, v]; };

// debug/test hook: __game.quickMatch([p1HeroIndex, p2HeroIndex], stageIndex, [cpu1, cpu2])
window.__game.quickMatch = (picks = [0, 1], stage = 0, cpu = [true, true]) => {
  app.picks = picks.slice(); app.stage = stage; app.mode = cpu[1] ? 'cpu' : 'pvp';
  startMatch({ cpu });
};

// ---------------------------------------------------------------- boot
buildRoster();
bindSettingsUI();
applyQuality();
goMenu();
requestAnimationFrame((t) => { last = t; frame(t); });
setTimeout(() => { renderPortraits(); $('loading').classList.add('hidden'); }, 30);
