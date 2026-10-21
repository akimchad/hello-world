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
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { Rig, JOINTS } from './rig.js';
import { enhanceRig } from './enhance.js';
import { autoRig, boxUVs } from './autorig.js';
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
const urls = new Map();       // heroId → source url (glb, fbx or mkm)
const opts = new Map();       // heroId → manifest options { textures, autorig, upAxis, flip, turn }
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

// Raimi-style suit fallbacks (used when a material's textures are missing)
const PALETTE = {
  suit: { color: 0xa30c12, roughness: 0.5, metalness: 0, sheen: 0.35 }, web: { color: 0x26262b, roughness: 0.32, metalness: 0.6 },
  webblack: { color: 0x080808, roughness: 0.4, metalness: 0.3 }, soles: { color: 0x3a0c08, roughness: 0.75 },
  backlogo: { color: 0x5a0306, roughness: 0.45 }, backlogorim: { color: 0x200102, roughness: 0.4 },
  lens: { color: 0xdfe4ec, roughness: 0.1, metalness: 0.95, clearcoat: 1 }, frames: { color: 0x0c0c0c, roughness: 0.35, metalness: 0.4 },
  glass: { color: 0x000000, roughness: 0.03, metalness: 0, clearcoat: 1, opacity: 0.18 },
};

async function parseFBX(buf, url, textures = null) {
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  const manager = new THREE.LoadingManager();
  let started = false, finish;
  const settled = new Promise((r) => { finish = r; });
  manager.onStart = () => { started = true; };
  manager.onLoad = () => finish();
  manager.onError = () => {};
  const fl = new FBXLoader(manager);
  fl.setResourcePath(textures ? 'assets/' + textures.replace(/^assets\//, '') : dir + 'textures/');
  const obj = fl.parse(buf, dir);
  if (started) await Promise.race([settled, new Promise((r) => setTimeout(r, 20000))]);
  // drop maps whose image never arrived; wire Roughness/Metallic siblings when textures exist
  const tl = new THREE.TextureLoader();
  const jobs = [];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      for (const k of ['map', 'normalMap', 'specularMap', 'bumpMap', 'emissiveMap', 'aoMap']) if (m[k] && !(m[k].image && m[k].image.width)) m[k] = null;
      const key = (m.name || '').toLowerCase().replace(/[^a-z]/g, '');
      m.userData.pbr = PALETTE[key] || null;
      m.userData.hasBaseMap = !!m.map;
      const src = m.map && m.map.image && m.map.image.src;
      if (src && /_BaseColor/i.test(src)) {
        for (const [kind, prop] of [['Roughness', 'roughnessMap'], ['Metallic', 'metalnessMap']]) {
          jobs.push(tl.loadAsync(src.replace(/_BaseColor/i, '_' + kind)).then((t) => { t.flipY = m.map.flipY; m.userData[prop] = t; }).catch(() => {}));
        }
      }
    }
  });
  await Promise.all(jobs);
  return { scene: obj, animations: obj.animations || [] };
}

let manifestP = null;
export function getManifest() {
  if (!manifestP) manifestP = fetch('assets/manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return manifestP;
}

export async function preloadModels() {
  const manifest = await getManifest();
  const wanted = { ...DEFAULT_MODELS };
  if (manifest && manifest.models) for (const [id, p] of Object.entries(manifest.models)) {
    const o = typeof p === 'string' ? { url: p } : p;
    opts.set(id, o);
    wanted[id] = ['assets/' + o.url.replace(/^assets\//, ''), ...(wanted[id] || [])];
  }
  await Promise.all(Object.entries(wanted).map(async ([id, list]) => {
    for (const url of list) {
      const buf = await fetchBuffer(url.split('/').map(encodeURIComponent).join('/'));
      if (buf) { buffers.set(id, buf); urls.set(id, url); report.models[id] = url; break; }
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

let skinPores = null, weave = null;
function heroDetail(kind) {
  if (kind === 'pores') return skinPores || (skinPores = toTex(normalCanvas(heightCanvas(512, 512, (g, w, h) => { overlayNoise(g, w, h, noiseCanvas(256, 96, 501, 2), 0.7); overlayNoise(g, w, h, noiseCanvas(256, 12, 502, 4), 0.5); }), 2.2), { srgb: false }));
  return weave || (weave = toTex(normalCanvas(heightCanvas(256, 256, (g, w, h) => { for (let x = 0; x < w; x += 4) { g.fillStyle = x % 8 ? '#9a9a9a' : '#6a6a6a'; g.fillRect(x, 0, 2, h); } for (let y = 0; y < h; y += 4) { g.fillStyle = y % 8 ? 'rgba(160,160,160,0.6)' : 'rgba(90,90,90,0.6)'; g.fillRect(0, y, w, 2); } overlayNoise(g, w, h, noiseCanvas(128, 16, 503, 3), 0.4); }), 2.5), { srgb: false }));
}

// per-hero material recipes for imported models
function heroRecipe(heroId, p) {
  const n = (p.name || '').toLowerCase();
  if (heroId === 'hulk') {
    if (n === 'hulk_skin') {
      p.color.set(0x2e7d32); p.roughness = 0.6; p.metalness = 0; p.normalMap = heroDetail('pores'); p.normalScale.set(0.6, 0.6);
      p.sheen = 0.35; p.sheenColor = new THREE.Color(0x9cff9c); p.sheenRoughness = 0.5; p.clearcoat = 0.05; p.clearcoatRoughness = 0.35; p.userData.skin = true;
    } else if (n === 'hulk_pants') {
      p.color.set(0x3a1d6e); p.roughness = 0.92; p.metalness = 0; p.normalMap = heroDetail('weave'); p.normalScale.set(0.8, 0.8);
      p.sheen = 0.5; p.sheenColor = new THREE.Color(0x9a7ad8); p.sheenRoughness = 0.7;
    }
    return true;
  }
  if (heroId === 'ironman') {
    if (/arc/.test(n)) { p.color.set(0xd8f6ff); p.emissive = new THREE.Color(0x9fe8ff); p.emissiveIntensity = 5; p.roughness = 0.2; p.metalness = 0; }
    else if (/red/.test(n)) { p.color.set(0x8c0d0a); p.metalness = 0.85; p.roughness = 0.22; p.clearcoat = 1; p.clearcoatRoughness = 0.08; p.envMapIntensity = 1.5; }
    else if (/yellow|gold/.test(n)) { p.color.set(0xd4a020); p.metalness = 0.9; p.roughness = 0.2; p.clearcoat = 1; p.clearcoatRoughness = 0.08; p.envMapIntensity = 1.5; }
    else if (/white|silver/.test(n)) { p.color.set(0xd6dae0); p.metalness = 0.9; p.roughness = 0.18; p.envMapIntensity = 1.4; }
    else if (/gl/.test(n)) { p.color.set(0x0a0c10); p.metalness = 0.2; p.roughness = 0.05; p.clearcoat = 1; p.transparent = true; p.opacity = 0.6; }
    p.normalMap = null;
    return true;
  }
  if (heroId === 'spiderman') {
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (p[k]) p[k].anisotropy = 8;
    if (p.normalMap && p.normalMap !== microNormal()) p.normalScale.set(1.15, 1.15);
    if (!/lens|glass|frames/.test(n)) { p.sheen = Math.max(p.sheen || 0, 0.3); p.sheenColor = new THREE.Color(0xffb8b8); p.clearcoat = Math.max(p.clearcoat || 0, 0.12); p.clearcoatRoughness = 0.3; }
    return false;
  }
  return false;
}

function upgradeMaterial(m, meshName, heroId = null) {
  const name = ((m.name || '') + ' ' + (meshName || '')).toLowerCase();
  const p = new THREE.MeshPhysicalMaterial();
  for (const k of ['color', 'map', 'normalMap', 'normalScale', 'roughness', 'roughnessMap', 'metalness', 'metalnessMap', 'aoMap', 'aoMapIntensity', 'emissive', 'emissiveMap', 'emissiveIntensity', 'alphaMap', 'transparent', 'opacity', 'alphaTest', 'side']) {
    if (m[k] !== undefined && m[k] !== null) { if (m[k] && m[k].isColor) p[k].copy(m[k]); else if (m[k] && m[k].isVector2) p[k].copy(m[k]); else p[k] = m[k]; }
  }
  p.name = m.name;
  if (m.isMeshPhongMaterial) { p.roughness = 0.55; p.metalness = 0; }
  const pal = m.userData && m.userData.pbr;
  if (pal) {
    if (!m.userData.hasBaseMap && pal.color !== undefined) p.color.set(pal.color);
    if (pal.roughness !== undefined) p.roughness = pal.roughness;
    if (pal.metalness !== undefined) p.metalness = pal.metalness;
    if (pal.clearcoat) { p.clearcoat = pal.clearcoat; p.clearcoatRoughness = 0.05; }
    if (pal.opacity !== undefined) { p.transparent = true; p.opacity = pal.opacity; p.depthWrite = false; }
    if (pal.sheen) { p.sheen = pal.sheen; p.sheenColor = new THREE.Color(0xffb0b0); p.sheenRoughness = 0.5; }
  }
  if (m.userData && m.userData.roughnessMap) { p.roughnessMap = m.userData.roughnessMap; p.roughness = 1; }
  if (m.userData && m.userData.metalnessMap) { p.metalnessMap = m.userData.metalnessMap; p.metalness = 1; }
  if (m.userData && m.userData.hasBaseMap) p.color.set(0xffffff);
  if (heroId && heroRecipe(heroId, p)) return p;
  if (!p.normalMap) { p.normalMap = microNormal(); p.normalScale.set(0.35, 0.35); }
  if (pal) return p;
  const isSkin = /skin|face|head|body|flesh|arm|hand|neck/.test(name) && !/suit|armor|armour|metal|cloth|costume|mask|helmet/.test(name);
  const isHair = /hair|beard|brow/.test(name);
  const isMetal = /metal|armor|armour|gold|steel|chrome|helmet/.test(name) || (p.metalness > 0.5);
  if (isSkin) { p.userData.skin = true; p.sheen = 0.3; p.sheenColor = new THREE.Color(0xffc8b0); p.sheenRoughness = 0.5; p.clearcoat = 0.04; p.clearcoatRoughness = 0.35; }
  else if (isHair) { p.sheen = 0.6; p.sheenColor = new THREE.Color(0xffffff); p.roughness = Math.max(0.4, p.roughness); }
  else if (isMetal) { p.clearcoat = 0.4; p.clearcoatRoughness = 0.2; p.envMapIntensity = 1.4; }
  else { p.sheen = 0.25; p.sheenColor = new THREE.Color(0xd0d8ff); p.sheenRoughness = 0.6; } // fabric stays matte
  return p;
}

// game joint → Mixamo bone (keys are normalised by boneKey)
const RETARGET = [['hips', 'hips'], ['spine', 'spine'], ['chest', 'spine2'], ['head', 'head'],
  ['lSh', 'leftarm'], ['lEl', 'leftforearm'], ['lHand', 'lefthand'], ['rSh', 'rightarm'], ['rEl', 'rightforearm'], ['rHand', 'righthand'],
  ['lHip', 'leftupleg'], ['lKnee', 'leftleg'], ['lFoot', 'leftfoot'], ['rHip', 'rightupleg'], ['rKnee', 'rightleg'], ['rFoot', 'rightfoot']];

// an invisible skeleton with the same layout as the procedural heroes, driven by the pose library
function makeDriver() {
  const d = { scale: 1, shoulderW: 0.25, hipW: 0.1, upper: 0.3, fore: 0.27, thigh: 0.45, shin: 0.44, groundOffset: 0.09 };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const J = {};
  const B = (n, p, x, y, z = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); p.add(o); J[n] = o; };
  const legLen = d.thigh + d.shin + 0.07;
  B('hips', body, 0, legLen); B('spine', J.hips, 0, 0.05); B('chest', J.spine, 0, 0.27); B('head', J.chest, 0, 0.365, 0.008);
  B('lSh', J.chest, d.shoulderW, 0.17, -0.005); B('rSh', J.chest, -d.shoulderW, 0.17, -0.005);
  B('lEl', J.lSh, 0, -d.upper); B('rEl', J.rSh, 0, -d.upper); B('lHand', J.lEl, 0, -d.fore); B('rHand', J.rEl, 0, -d.fore);
  B('lHip', J.hips, d.hipW, -0.02); B('rHip', J.hips, -d.hipW, -0.02);
  B('lKnee', J.lHip, 0, -d.thigh); B('rKnee', J.rHip, 0, -d.thigh); B('lFoot', J.lKnee, 0, -d.shin); B('rFoot', J.rKnee, 0, -d.shin);
  return new Rig(root, body, J, d);
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
    const box = new THREE.Box3().setFromObject(model, false);
    const h = Math.max(0.01, box.max.y - box.min.y);
    const target = HEIGHTS[hero.id] || 1.85;
    const s = target / h;
    model.scale.multiplyScalar(s);
    model.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(model, false);
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
      const up = mats.map((m) => { const n = upgradeMaterial(m, o.name, hero.id); if (alt) n.color.offsetHSL(0.5, -0.15, -0.1); return n; });
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
    // no clips: retarget the procedural pose library onto the Mixamo skeleton
    this.retarget = null;
    const pairs = RETARGET.map(([dj, mb]) => [dj, bones[mb]]).filter(([, b]) => b);
    if (!this.hasAnims && pairs.length >= 12 && hips) {
      const drv = makeDriver();
      root.add(drv.root);
      for (const j of JOINTS) drv.J[j].rotation.set(0, 0, 0);
      const calib = gltf.calib;
      if (calib) {
        // match the mesh's own rest pose (measured by the auto-rigger)
        const down = new THREE.Vector3(0, -1, 0);
        drv.J.lSh.quaternion.setFromUnitVectors(down, calib.lArm); drv.J.rSh.quaternion.setFromUnitVectors(down, calib.rArm);
        drv.J.lHip.quaternion.setFromUnitVectors(down, calib.lLeg); drv.J.rHip.quaternion.setFromUnitVectors(down, calib.rLeg);
      } else { drv.J.lSh.rotation.z = Math.PI / 2; drv.J.rSh.rotation.z = -Math.PI / 2; } // the model's T-pose
      root.updateMatrixWorld(true);
      const cal = pairs.map(([dj, mb]) => ({ drv: drv.J[dj], mb, rdInv: drv.J[dj].getWorldQuaternion(new THREE.Quaternion()).invert(), rm: mb.getWorldQuaternion(new THREE.Quaternion()) }));
      const mRest = root.worldToLocal(hips.getWorldPosition(new THREE.Vector3()));
      const dRest = root.worldToLocal(drv.J.hips.getWorldPosition(new THREE.Vector3()));
      // fists: curl the finger bones a little
      const fingers = [];
      model.traverse((o) => { if (o.isBone && /hand(index|middle|ring|pinky)[123]$/i.test(boneKey(o.name))) fingers.push(o); });
      this.retarget = { drv, cal, mRest, dRest, ratio: mRest.y / dRest.y, fingers, q: new THREE.Quaternion(), pq: new THREE.Quaternion(), v: new THREE.Vector3() };
    }
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

  update(pose, dt, rate = 16) {
    if (this.hasAnims) { this.mixer.update(dt); return; }
    const R = this.retarget;
    if (!R) return;
    R.drv.update(pose, dt, rate);
    this.root.updateMatrixWorld(true);
    // hips: follow the driver's hips, scaled to the model's proportions
    const hips = R.cal[0].mb;
    const d = this.root.worldToLocal(R.drv.J.hips.getWorldPosition(R.v));
    d.sub(R.dRest).multiplyScalar(R.ratio).add(R.mRest);
    d.y += 0.1 * (R.drv.cur.lie || 0);
    hips.position.copy(hips.parent.worldToLocal(this.root.localToWorld(d)));
    hips.updateMatrixWorld(true);
    // joints: transfer each driver bone's world rotation (relative to its T-pose) onto the model bone
    for (const c of R.cal) {
      c.drv.getWorldQuaternion(R.q).multiply(c.rdInv).multiply(c.rm);
      c.mb.parent.getWorldQuaternion(R.pq);
      c.mb.quaternion.copy(R.pq.invert().multiply(R.q));
      c.mb.updateMatrixWorld(true);
    }
    if (!R.curled) { R.curled = true; for (const f of R.fingers) f.rotation.z += /left/i.test(f.name) ? 1.1 : -1.1; }
  }
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
// compact indexed mesh written by tools/decimate_stl.py
function parseMKM(buf) {
  const dv = new DataView(buf);
  const nv = dv.getUint32(4, true), nt = dv.getUint32(8, true);
  const pos = new Float32Array(buf.slice(12, 12 + nv * 12));
  const idx = new Uint32Array(buf.slice(12 + nv * 12, 12 + nv * 12 + nt * 12));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'skin' }));
  const scene = new THREE.Group(); scene.add(mesh);
  return { scene, animations: [] };
}

export async function prepareParsed() {
  for (const [id, buf] of buffers) {
    try {
      const url = urls.get(id) || '', o = opts.get(id) || {};
      let g = /\.fbx$/i.test(url) ? await parseFBX(buf, url, o.textures) : /\.mkm$/i.test(url) ? parseMKM(buf) : await parse(buf.slice(0));
      let hasBones = false; g.scene.traverse((n) => { if (n.isBone) hasBones = true; });
      if (o.autorig || !hasBones) {
        const r = autoRig(g.scene, { height: HEIGHTS[id] || 1.85, upAxis: o.upAxis || 'y', flip: !!o.flip, turn: o.turn || 0, weldedArms: !!o.weldedArms });
        if (!r) throw new Error('no meshes to rig');
        g = r;
        report.models[id] += ' (auto-rigged)';
      }
      if (id === 'hulk') hulkMaterials(g);
      parsed.set(id, g);
    } catch (e) { report.errors.push(id + ': ' + e.message); buffers.delete(id); }
  }
}

// Hulk sculpt has no materials or UVs: split skin and torn pants by bone, add box-projected detail
function hulkMaterials(g) {
  const H = g.height || 2.35;
  g.scene.traverse((m) => {
    if (!m.isSkinnedMesh) return;
    const geo = m.geometry;
    boxUVs(geo, 7);
    const si = geo.attributes.skinIndex, pos = geo.attributes.position;
    const bones = m.skeleton.bones.map((b) => b.name);
    const isPants = (i) => { const b = bones[si.getX(i)] || ''; const y = pos.getY(i); return (/UpLeg/.test(b) && y > 0.27 * H + 0.012 * H * Math.sin(pos.getX(i) * 60)) || (/Hips/.test(b) && y < 0.56 * H); };
    const idx = geo.index.array, pants = [], skin = [];
    for (let t = 0; t < idx.length; t += 3) { const n = isPants(idx[t]) + isPants(idx[t + 1]) + isPants(idx[t + 2]); (n >= 2 ? pants : skin).push(idx[t], idx[t + 1], idx[t + 2]); }
    geo.setIndex([...skin, ...pants]);
    geo.clearGroups(); geo.addGroup(0, skin.length, 0); geo.addGroup(skin.length, pants.length, 1);
    m.material = [new THREE.MeshStandardMaterial({ name: 'hulk_skin' }), new THREE.MeshStandardMaterial({ name: 'hulk_pants' })];
  });
}

export function buildModelRig(hero, alt) {
  const gltf = parsed.get(hero.id);
  if (!gltf) return null;
  const rig = new ModelRig({ scene: cloneSkinned(gltf.scene), animations: gltf.animations, calib: gltf.calib }, hero, alt);
  if (!rig.hasAnims && !rig.retarget) { report.errors.push(hero.id + ': model has no animations or Mixamo skeleton, using the built-in hero instead'); parsed.delete(hero.id); return null; }
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
