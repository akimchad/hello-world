// Optional high-fidelity GLB characters with Mixamo animations.
//
// Drop files into assets/ and they are picked up automatically:
//   assets/models/spiderman_realistic.glb  (or spiderman.glb)
//   assets/models/sentry_realistic.glb     (or sentry.glb)
//   assets/manifest.json (optional) to add models for any hero, e.g.
//     { "models": { "thor": "models/thor.glb" },
//       "animations": { "idle": "animations/Idle.glb", "punch": "animations/Punch.glb" } }
// Animations can be embedded in the model GLB or loaded from separate GLBs that
// share the same (Mixamo) skeleton. Heroes without a model keep the procedural rig.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Rig } from './rig.js';
import { enhanceRig } from './enhance.js';
import { makeCanvas, normalCanvas, heightCanvas, overlayNoise, noiseCanvas, toTex } from './textures.js';

const DEFAULT_MODELS = {
  spiderman: ['assets/models/spiderman_realistic.glb', 'assets/models/spiderman.glb'],
  sentry: ['assets/models/sentry_realistic.glb', 'assets/models/sentry.glb'],
};
const HEIGHTS = { hulk: 2.35, doom: 1.9, thor: 1.92, cap: 1.88, gamora: 1.78, spiderman: 1.8, sentry: 1.9, ironman: 1.9 };

// game animation keys → clip-name search lists (first match wins)
const CHAINS = {
  idle: ['fight idle', 'fighting idle', 'boxing idle', 'idle', 'stance'],
  walk: ['walk forward', 'walking forward', 'fight walk', 'walking', 'walk'],
  walkBack: ['walk back', 'walking backward', 'walk backward', 'walking', 'walk'],
  crouch: ['crouch idle', 'crouching idle', 'crouch'],
  block: ['block', 'guard', 'body block'],
  jump: ['jump'],
  punch: ['jab', 'lead jab', 'punch'],
  punch2: ['cross', 'cross punch', 'punch 2', 'punch', 'jab'],
  kick: ['roundhouse', 'mma kick', 'kick'],
  heavy: ['hook', 'heavy', 'uppercut', 'punch'],
  sweep: ['sweep', 'leg sweep', 'low kick', 'kick'],
  uppercut: ['uppercut', 'hook', 'punch'],
  airKick: ['flying kick', 'jump kick', 'kick'],
  special: ['special', 'cast', 'spell', 'fireball', 'hadouken', 'punch'],
  hit: ['hit reaction', 'head hit', 'body hit', 'hit', 'react'],
  knockdown: ['knockdown', 'knocked down', 'knocked out', 'fall', 'death', 'dying'],
  down: ['knocked down', 'knockdown', 'death', 'dying'],
  getup: ['getting up', 'get up', 'stand up'],
  ko: ['death', 'dying', 'knocked out', 'knockdown'],
  victory: ['victory', 'cheer', 'win', 'celebrat'],
  taunt: ['taunt', 'victory', 'idle'],
};
const LOOP = new Set(['idle', 'walk', 'walkBack', 'crouch', 'block', 'taunt', 'victory']);
const CLAMP = new Set(['knockdown', 'down', 'ko']);

const loader = new GLTFLoader();
const buffers = new Map();    // heroId → ArrayBuffer
const sharedClips = [];        // clips from assets/animations
const report = { models: {}, animations: 0, errors: [] };

async function fetchBuffer(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('text/html')) return null;
    return await r.arrayBuffer();
  } catch (e) { return null; }
}
const parse = (buf) => new Promise((res, rej) => loader.parse(buf, '', res, rej));

let manifestP = null;
export function getManifest() {
  if (!manifestP) manifestP = fetch('assets/manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return manifestP;
}

export async function preloadModels() {
  const manifest = await getManifest();
  const wanted = { ...DEFAULT_MODELS };
  if (manifest && manifest.models) for (const [id, p] of Object.entries(manifest.models)) wanted[id] = ['assets/' + p.replace(/^assets\//, ''), ...(wanted[id] || [])];
  await Promise.all(Object.entries(wanted).map(async ([id, list]) => {
    for (const url of list) {
      const buf = await fetchBuffer(url);
      if (buf) { buffers.set(id, buf); report.models[id] = url; break; }
    }
  }));
  if (buffers.size && manifest && manifest.animations) {
    for (const [key, p] of Object.entries(manifest.animations)) {
      const buf = await fetchBuffer('assets/' + p.replace(/^assets\//, ''));
      if (!buf) continue;
      try {
        const g = await parse(buf);
        g.animations.forEach((c) => { if (!c.name || /mixamo\.com|take 001|^animation/i.test(c.name)) c.name = key; sharedClips.push(c); });
      } catch (e) { report.errors.push(p + ': ' + e.message); }
    }
  }
  report.animations = sharedClips.length;
  return report;
}

export function hasModel(id) { return buffers.has(id); }
export function modelReport() { return report; }

// ------------------------------------------------------------------
const boneKey = (n) => n.replace(/^mixamorig[:_]?/i, '').replace(/[:_\s]/g, '').toLowerCase();

function inPlace(clip, hipsName) {
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => {
    if (!t.name.endsWith('.position')) return true;
    const bone = t.name.slice(0, -'.position'.length);
    if (bone !== hipsName) return false;
    // keep vertical bob, remove horizontal travel
    const v = t.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    return true;
  });
  return c;
}

let detailNormal = null;
function microNormal() {
  if (!detailNormal) detailNormal = toTex(normalCanvas(heightCanvas(256, 256, (g, w, h) => overlayNoise(g, w, h, noiseCanvas(256, 64, 77, 2), 0.6)), 1.2), { srgb: false, repeat: [6, 6] });
  return detailNormal;
}

function upgradeMaterial(m, meshName) {
  const name = ((m.name || '') + ' ' + (meshName || '')).toLowerCase();
  const p = new THREE.MeshPhysicalMaterial();
  for (const k of ['color', 'map', 'normalMap', 'normalScale', 'roughness', 'roughnessMap', 'metalness', 'metalnessMap', 'aoMap', 'aoMapIntensity', 'emissive', 'emissiveMap', 'emissiveIntensity', 'alphaMap', 'transparent', 'opacity', 'alphaTest', 'side']) {
    if (m[k] !== undefined && m[k] !== null) { if (m[k] && m[k].isColor) p[k].copy(m[k]); else if (m[k] && m[k].isVector2) p[k].copy(m[k]); else p[k] = m[k]; }
  }
  p.name = m.name;
  if (!p.normalMap) { p.normalMap = microNormal(); p.normalScale.set(0.35, 0.35); }
  const isSkin = /skin|face|head|body|flesh|arm|hand|neck/.test(name) && !/suit|armor|armour|metal|cloth|costume|mask|helmet/.test(name);
  const isHair = /hair|beard|brow/.test(name);
  const isMetal = /metal|armor|armour|gold|steel|chrome|helmet/.test(name) || (p.metalness > 0.5);
  if (isSkin) { p.userData.skin = true; p.sheen = 0.3; p.sheenColor = new THREE.Color(0xffc8b0); p.sheenRoughness = 0.5; p.clearcoat = 0.04; p.clearcoatRoughness = 0.35; }
  else if (isHair) { p.sheen = 0.6; p.sheenColor = new THREE.Color(0xffffff); p.roughness = Math.max(0.4, p.roughness); }
  else if (isMetal) { p.clearcoat = 0.4; p.clearcoatRoughness = 0.2; p.envMapIntensity = 1.4; }
  else { p.sheen = 0.25; p.sheenColor = new THREE.Color(0xd0d8ff); p.sheenRoughness = 0.6; } // fabric stays matte
  return p;
}

class ModelRig extends Rig {
  constructor(gltf, hero, alt) {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const model = gltf.scene;
    body.add(model);
    // measure in bind pose and normalise: feet on the floor, centred, target height
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const h = Math.max(0.01, box.max.y - box.min.y);
    const target = HEIGHTS[hero.id] || 1.85;
    const s = target / h;
    model.scale.multiplyScalar(s);
    model.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(model, true);
    const c = box2.getCenter(new THREE.Vector3());
    model.position.x -= c.x; model.position.z -= c.z; model.position.y -= box2.min.y;
    // bones
    const bones = {};
    model.traverse((o) => { if (o.isBone) bones[boneKey(o.name)] = o; });
    const find = (...names) => { for (const n of names) if (bones[n]) return bones[n]; return null; };
    const hips = find('hips', 'pelvis', 'root');
    const chest = find('spine2', 'spine1', 'chest', 'upperchest', 'spine') || hips;
    const head = find('head') || chest;
    const lHand = find('lefthand', 'handl', 'lhand') || chest, rHand = find('righthand', 'handr', 'rhand') || chest;
    const J = { hips: hips || model, chest: chest || model, lHand, rHand, lFoot: find('leftfoot') || hips, rFoot: find('rightfoot') || hips };
    // a proxy at the centre of the head, ~10 cm above the head bone in world units
    const headAnchor = new THREE.Object3D();
    if (head) {
      head.add(headAnchor);
      model.updateMatrixWorld(true);
      const ws = new THREE.Vector3(); head.getWorldScale(ws);
      headAnchor.position.set(0, 0.09 / (ws.y || 1), 0.02 / (ws.z || 1));
    }
    J.head = headAnchor;
    super(root, body, J, { scale: target / 1.85, thigh: 0.45, shin: 0.44, headR: 0.115 });
    this.isModel = true;
    this.headCenter = new THREE.Vector3();
    this.anchors = { cast: rHand, cast2: lHand };
    // materials: PBR upgrade, shadows, alt tint for mirror matches
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const up = mats.map((m) => { const n = upgradeMaterial(m, o.name); if (alt) n.color.offsetHSL(0.5, -0.15, -0.1); return n; });
      o.material = Array.isArray(o.material) ? up : up[0];
    });
    // animations: embedded clips plus shared Mixamo clips, all made in-place
    const hipsName = hips ? hips.name : '';
    const clips = [...gltf.animations, ...sharedClips].map((cl) => inPlace(cl, hipsName));
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = clips;
    this.actions = new Map();
    this.current = null; this.currentKey = null; this.token = null;
    this.hasAnims = clips.length > 0;
    if (hero.id === 'sentry') { const aura = new THREE.PointLight(0xffd070, 0, 3, 2); chest.add(aura); this.aura = aura; }
    this.collectFlashMaterials();
    enhanceRig(this);
    this.setAnim('idle');
    this.mixer.update(0.01);
  }

  clipFor(key) {
    const list = CHAINS[key] || [key];
    for (const want of list) {
      const c = this.clips.find((cl) => cl.name.toLowerCase().includes(want));
      if (c) return c;
    }
    return key === 'idle' ? this.clips[0] : this.clipFor('idle');
  }

  // play a game animation key with a crossfade; token restarts one-shot clips
  setAnim(key, { duration = null, token = null } = {}) {
    if (!this.hasAnims) return;
    if (key === this.currentKey && token === this.token) return;
    const clip = this.clipFor(key);
    if (!clip) return;
    let action = this.actions.get(clip);
    if (!action) { action = this.mixer.clipAction(clip); this.actions.set(clip, action); }
    const once = !LOOP.has(key);
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.timeScale = duration && once ? THREE.MathUtils.clamp(clip.duration / duration, 0.5, 3) : 1;
    const fade = once ? (CLAMP.has(key) ? 0.18 : 0.1) : 0.25;
    if (this.current && this.current !== action) {
      action.reset().setEffectiveWeight(1).play();
      this.current.crossFadeTo(action, fade, false);
    } else if (this.current === action) {
      action.reset().play();
    } else {
      action.reset().fadeIn(fade).play();
    }
    this.current = action; this.currentKey = key; this.token = token;
  }

  update(pose, dt) { this.mixer.update(dt); }
}

// deep-clone a skinned scene and rebind each skeleton to the cloned bones
function parallelTraverse(a, b, cb) { cb(a, b); for (let i = 0; i < a.children.length; i++) parallelTraverse(a.children[i], b.children[i], cb); }
function cloneSkinned(source) {
  const srcOf = new Map(), cloneOf = new Map();
  const clone = source.clone();
  parallelTraverse(source, clone, (a, b) => { srcOf.set(b, a); cloneOf.set(a, b); });
  clone.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const src = srcOf.get(node);
    const skeleton = src.skeleton.clone();
    skeleton.bones = src.skeleton.bones.map((b) => cloneOf.get(b));
    node.bind(skeleton, src.bindMatrix.clone());
  });
  return clone;
}

const parsed = new Map(); // heroId → parsed gltf (never added to a scene directly)
export async function prepareParsed() {
  for (const [id, buf] of buffers) {
    try { parsed.set(id, await parse(buf.slice(0))); }
    catch (e) { report.errors.push(id + ': ' + e.message); buffers.delete(id); }
  }
}

export function buildModelRig(hero, alt) {
  const gltf = parsed.get(hero.id);
  if (!gltf) return null;
  const rig = new ModelRig({ scene: cloneSkinned(gltf.scene), animations: gltf.animations }, hero, alt);
  if (!rig.hasAnims) { report.errors.push(hero.id + ': model has no animations, using the built-in hero instead'); parsed.delete(hero.id); return null; }
  return rig;
}

// swap hero builders over to their GLB models where available
export function installModelBuilders(heroes) {
  for (const h of heroes) {
    if (!parsed.has(h.id)) continue;
    const procedural = h.build;
    h.build = (alt) => buildModelRig(h, alt) || procedural(alt);
    h.usesModel = true;
  }
}

// test hook: register an in-memory {scene, animations} as a hero's model
export function registerModel(id, gltf) { parsed.set(id, gltf); report.models[id] = '(registered in memory)'; }
