// Imported character models for the roster.
//
// assets/manifest.json lists one model per hero (GLB, FBX or a decimated .mkm
// sculpt). Rigged models are recognised whatever their skeleton naming
// (Mixamo, 3ds Max Biped, Unreal/Fortnite, Rigify); static meshes are
// auto-rigged. Every model is turned to face +Z, scaled to the hero's height
// with its feet on the floor, and driven by the game's pose library through an
// invisible driver skeleton. Optional per-hero clips (e.g. the MUA attack
// animations) play over the retargeted pose. Example entry:
//   "cap": { "url": "models/cap/cap.fbx", "textures": "models/cap/textures/",
//            "maps": { "emissiveMap": "glow.png" }, "clips": { "punch": "attack_light1" } }
// A full Mixamo clip set ("animations" in the manifest) replaces retargeting.
// Heroes without a model keep their procedural rig.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { Rig, JOINTS } from './rig.js';
import { enhanceRig } from './enhance.js';
import { autoRig, boxUVs, segDist } from './autorig.js';
import { normalCanvas, heightCanvas, overlayNoise, noiseCanvas, toTex } from './textures.js';

const V = THREE.Vector3, Q = THREE.Quaternion;
const DEFAULT_MODELS = {
  spiderman: ['assets/models/spiderman_realistic.glb', 'assets/models/spiderman.glb'],
  sentry: ['assets/models/sentry_realistic.glb', 'assets/models/sentry.glb'],
};
// standing height in metres: sets the model scale, hurtbox and attack reach
const HEIGHTS = { hulk: 2.55, doom: 1.96, thor: 1.95, ironman: 1.92, sentry: 1.92, cap: 1.88, gamora: 1.78, spiderman: 1.76 };

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
const opts = new Map();       // heroId → manifest options
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
const assetPath = (p) => 'assets/' + p.replace(/^assets\//, '');

// Raimi-style suit fallbacks (used when a material's textures are missing)
const PALETTE = {
  suit: { color: 0xa30c12, roughness: 0.5, metalness: 0, sheen: 0.35 }, web: { color: 0x26262b, roughness: 0.32, metalness: 0.6 },
  webblack: { color: 0x080808, roughness: 0.4, metalness: 0.3 }, soles: { color: 0x3a0c08, roughness: 0.75 },
  backlogo: { color: 0x5a0306, roughness: 0.45 }, backlogorim: { color: 0x200102, roughness: 0.4 },
  lens: { color: 0xdfe4ec, roughness: 0.1, metalness: 0.95, clearcoat: 1 }, frames: { color: 0x0c0c0c, roughness: 0.35, metalness: 0.4 },
  glass: { color: 0x000000, roughness: 0.03, metalness: 0, clearcoat: 1, opacity: 0.18 },
};

// textures named in the manifest that the model file doesn't reference itself
async function loadMaps(maps, base) {
  const tl = new THREE.TextureLoader(), out = {};
  await Promise.all(Object.entries(maps).map(async ([k, file]) => {
    try {
      const t = await tl.loadAsync(base + file);
      if (k === 'map' || k === 'emissiveMap') t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      out[k] = t;
    } catch (e) { report.errors.push('texture missing: ' + base + file); }
  }));
  return out;
}

async function parseFBX(buf, url, o = {}) {
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  const texDir = o.textures ? assetPath(o.textures) : dir + 'textures/';
  const manager = new THREE.LoadingManager();
  let started = false, finish;
  const settled = new Promise((r) => { finish = r; });
  manager.onStart = () => { started = true; };
  manager.onLoad = () => finish();
  manager.onError = () => {};
  const fl = new FBXLoader(manager);
  fl.setResourcePath(texDir);
  const obj = fl.parse(buf, dir);
  if (started) await Promise.race([settled, new Promise((r) => setTimeout(r, 20000))]);
  const extra = o.maps ? await loadMaps(o.maps, texDir) : {};
  // rig widgets and other empty helper meshes
  const empty = [];
  obj.traverse((n) => { if (n.isMesh && !(n.geometry.attributes.position && n.geometry.attributes.position.count)) empty.push(n); });
  empty.forEach((n) => n.removeFromParent());
  // drop maps whose image never arrived; add manifest maps; wire Roughness/Metallic siblings when textures exist
  const tl = new THREE.TextureLoader();
  const jobs = [];
  obj.traverse((n) => {
    if (!n.isMesh) return;
    for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
      for (const k of ['map', 'normalMap', 'specularMap', 'bumpMap', 'emissiveMap', 'aoMap']) if (m[k] && !(m[k].image && m[k].image.width)) m[k] = null;
      for (const [k, t] of Object.entries(extra)) if (!m[k]) m[k] = t;
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

export async function preloadModels(progress = () => {}) {
  const manifest = await getManifest();
  const wanted = { ...DEFAULT_MODELS };
  if (manifest && manifest.models) for (const [id, p] of Object.entries(manifest.models)) {
    const o = typeof p === 'string' ? { url: p } : p;
    opts.set(id, o);
    wanted[id] = [assetPath(o.url), ...(wanted[id] || [])];
  }
  let done = 0;
  const total = Object.keys(wanted).length;
  await Promise.all(Object.entries(wanted).map(async ([id, list]) => {
    for (const url of list) {
      const buf = await fetchBuffer(url.split('/').map(encodeURIComponent).join('/'));
      if (buf) { buffers.set(id, buf); urls.set(id, url); report.models[id] = url; break; }
    }
    progress(++done, total);
  }));
  if (buffers.size && manifest && manifest.animations) {
    for (const [key, p] of Object.entries(manifest.animations)) {
      const buf = await fetchBuffer(assetPath(p));
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

// ------------------------------------------------------------------ skeletons
const boneKey = (n) => n.replace(/^mixamorig[:_]?/i, '').replace(/[:_\s.\-]/g, '').toLowerCase();

// Mixamo, 3ds Max Biped (Bip01 L UpperArm), Unreal/Fortnite (upperarm_l, spine_03)
// and Rigify (upper_arm.L) bone names → one Mixamo-style key ('leftarm', 'spine2'…)
const LIMB = { clavicle: 'shoulder', upperarm: 'arm', forearm: 'forearm', lowerarm: 'forearm', hand: 'hand', thigh: 'upleg', calf: 'leg', shin: 'leg', foot: 'foot', toe0: 'toebase', ball: 'toebase' };
const TRUNK = { pelvis: 'hips', spine01: 'spine', spine02: 'spine1', spine03: 'spine2', spine04: 'spine3', spine05: 'spine4', neck01: 'neck' };
function canonBone(name) {
  const k = boneKey(name.replace(/^.*[:|]/, '').replace(/^(def|org|mch)[-_]/i, ''));
  let m = k.match(/^bip0*1(l|r)?(.*)$/);
  if (m) return m[1] && LIMB[m[2]] ? (m[1] === 'l' ? 'left' : 'right') + LIMB[m[2]] : TRUNK[m[2]] || m[2] || k;
  m = k.match(/^(clavicle|upperarm|lowerarm|forearm|hand|thigh|calf|shin|foot|ball)(l|r)$/);
  if (m) return (m[2] === 'l' ? 'left' : 'right') + LIMB[m[1]];
  return TRUNK[k] || k;
}

// game joint → model bone, filled per model in ModelRig
const RETARGET = ['hips', 'spine', 'chest', 'head', 'lSh', 'lEl', 'lHand', 'rSh', 'rEl', 'rHand', 'lHip', 'lKnee', 'lFoot', 'rHip', 'rKnee', 'rFoot'];

// stand a rigged model up: head above hips → +Y, left arm → +X, so it faces +Z
function orient(model, B) {
  model.updateMatrixWorld(true);
  const P = (b) => b.getWorldPosition(new V());
  const up = P(B.head).sub(P(B.hips)).normalize();
  const lat = P(B.lSh).sub(P(B.rSh));
  lat.addScaledVector(up, -lat.dot(up)).normalize();
  const fwd = new V().crossVectors(lat, up);
  const q = new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(lat, up, fwd)).invert();
  model.quaternion.premultiply(q);
  model.position.applyQuaternion(q);
  model.updateMatrixWorld(true);
}

// strip horizontal travel from Mixamo clips (only the hips keep a position track)
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

// a clip layered over the retargeted pose: rotations, plus positions on the hips and the
// bones above it (needed to rebuild the clip's hips placement)
function overlayClip(clip, roots) {
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => {
    const dot = t.name.lastIndexOf('.'), prop = t.name.slice(dot + 1);
    return prop === 'quaternion' || (prop === 'position' && roots.has(t.name.slice(0, dot)));
  });
  return c;
}

// ------------------------------------------------------------------ materials
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

// legacy specular map → roughness (G) + metalness (B) map: shiny texels get smoother and,
// above the metal threshold, metallic
const specCache = new Map();
function specPBR(spec, rough, metal) {
  const key = spec.uuid + rough.join() + (metal ? metal.join() : '');
  if (specCache.has(key)) return specCache.get(key);
  const img = spec.image;
  const k = Math.min(1, 1024 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const s = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255;
    px[i] = 255;
    px[i + 1] = 255 * (rough[0] + (rough[1] - rough[0]) * s);
    px[i + 2] = metal ? 255 * THREE.MathUtils.smoothstep(s, metal[0], metal[1]) : 0;
    px[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = spec.flipY; t.wrapS = spec.wrapS; t.wrapT = spec.wrapT; t.anisotropy = 8;
  specCache.set(key, t);
  return t;
}

// game-ripped normal maps (e.g. MUA's green ones) that aren't standard tangent-space RGB:
// re-centre X/Y on the map's own flat value and rebuild Z
const normalCache = new Map();
function standardNormal(tex) {
  if (normalCache.has(tex.uuid)) return normalCache.get(tex.uuid);
  const img = tex.image;
  let out = tex;
  if (img && img.width) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
    let r = 0, gr = 0, b = 0;
    const n = px.length / 4;
    for (let i = 0; i < px.length; i += 4) { r += px[i]; gr += px[i + 1]; b += px[i + 2]; }
    r /= n; gr /= n; b /= n;
    if (b < 200 || Math.abs(r - 128) > 20 || Math.abs(gr - 128) > 20) {
      for (let i = 0; i < px.length; i += 4) {
        const x = THREE.MathUtils.clamp((px[i] - r) / 127, -1, 1), y = THREE.MathUtils.clamp((px[i + 1] - gr) / 127, -1, 1);
        const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        px[i] = (x * 0.5 + 0.5) * 255; px[i + 1] = (y * 0.5 + 0.5) * 255; px[i + 2] = (z * 0.5 + 0.5) * 255; px[i + 3] = 255;
      }
      g.putImageData(d, 0, 0);
      out = new THREE.CanvasTexture(c);
      out.flipY = tex.flipY; out.wrapS = tex.wrapS; out.wrapT = tex.wrapT; out.anisotropy = 8;
    }
  }
  normalCache.set(tex.uuid, out);
  return out;
}

// per-hero PBR recipes for imported models; true = the material is fully set up
function heroRecipe(heroId, p, src) {
  const n = (p.name || '').toLowerCase();
  const tint = (c) => new THREE.Color(c);
  const fromSpec = (rough, metal = null) => {
    if (src.specularMap && src.specularMap.image) {
      const t = specPBR(src.specularMap, rough, metal);
      p.roughnessMap = t; p.roughness = 1;
      if (metal) { p.metalnessMap = t; p.metalness = 1; } else p.metalness = 0;
    }
    else { p.roughness = (rough[0] + rough[1]) / 2; p.metalness = 0; }
  };
  const fabric = (rough, sheen, sc) => { p.roughness = rough; p.metalness = 0; p.sheen = sheen; p.sheenColor = tint(sc); p.sheenRoughness = 0.6; if (!p.normalMap) { p.normalMap = microNormal(); p.normalScale.set(0.45, 0.45); } };
  const metal = (rough, coat, env = 1.5) => { p.metalness = 0.9; p.roughness = rough; p.clearcoat = coat; p.clearcoatRoughness = 0.15; p.envMapIntensity = env; if (!p.normalMap) { p.normalMap = microNormal(); p.normalScale.set(0.2, 0.2); } };
  const skin = (sc = 0xffc8b0) => { p.userData.skin = true; p.metalness = 0; p.roughness = 0.52; p.sheen = 0.3; p.sheenColor = tint(sc); p.sheenRoughness = 0.5; p.clearcoat = 0.04; p.clearcoatRoughness = 0.35; if (!p.normalMap) { p.normalMap = heroDetail('pores'); p.normalScale.set(0.35, 0.35); } };
  const hair = () => { p.metalness = 0; p.roughness = 0.45; p.sheen = 0.6; p.sheenColor = tint(0xffffff); p.sheenRoughness = 0.35; };
  const leather = (rough = 0.5) => { p.metalness = 0; p.roughness = rough; p.clearcoat = 0.25; p.clearcoatRoughness = 0.4; p.sheen = 0.15; p.sheenColor = tint(0xffffff); if (!p.normalMap) { p.normalMap = microNormal(); p.normalScale.set(0.3, 0.3); } };
  const glow = (c, k) => { if (p.emissiveMap) { p.emissive.set(c); p.emissiveIntensity = k; } };
  switch (heroId) {
    case 'hulk': {
      const painted = p.vertexColors; // the sculpt's own paint carries the colour
      if (n === 'hulk_skin') {
        if (!painted) p.color.set(0x2e7d32);
        p.roughness = 0.55; p.metalness = 0; p.normalMap = heroDetail('pores'); p.normalScale.set(0.7, 0.7);
        p.sheen = 0.35; p.sheenColor = tint(0x9cff9c); p.sheenRoughness = 0.5; p.clearcoat = 0.06; p.clearcoatRoughness = 0.35; p.userData.skin = true;
      } else if (n === 'hulk_pants') {
        if (!painted) p.color.set(0x3a1d6e);
        p.roughness = 0.92; p.metalness = 0; p.normalMap = heroDetail('weave'); p.normalScale.set(0.8, 0.8);
        p.sheen = 0.5; p.sheenColor = tint(0x9a7ad8); p.sheenRoughness = 0.7;
      } else if (n === 'hulk_hair') { hair(); p.color.set(painted ? 0xffffff : 0x10140c); }
      else if (n === 'hulk_eye') { p.roughness = 0.08; p.clearcoat = 1; p.clearcoatRoughness = 0.05; p.color.set(0xe8ffe0); p.emissive.set(0x5cff3a); p.emissiveIntensity = 0.35; }
      return true;
    }
    case 'ironman':
      if (p.map) { // textured Mark VII: painted metal, glowing arc reactor and eyes from the emissive map
        fromSpec([0.42, 0.14]); p.metalness = 0.85; p.clearcoat = 0.8; p.clearcoatRoughness = 0.08; p.envMapIntensity = 1.6;
        glow(0xffffff, 6);
      } else if (/arc/.test(n)) { p.color.set(0xd8f6ff); p.emissive = tint(0x9fe8ff); p.emissiveIntensity = 5; p.roughness = 0.2; p.metalness = 0; }
      else if (/red/.test(n)) { p.color.set(0x8c0d0a); p.metalness = 0.85; p.roughness = 0.22; p.clearcoat = 1; p.clearcoatRoughness = 0.08; p.envMapIntensity = 1.5; }
      else if (/yellow|gold/.test(n)) { p.color.set(0xd4a020); p.metalness = 0.9; p.roughness = 0.2; p.clearcoat = 1; p.clearcoatRoughness = 0.08; p.envMapIntensity = 1.5; }
      else if (/white|silver/.test(n)) { p.color.set(0xd6dae0); p.metalness = 0.9; p.roughness = 0.18; p.envMapIntensity = 1.4; }
      else if (/gl/.test(n)) { p.color.set(0x0a0c10); p.metalness = 0.2; p.roughness = 0.05; p.clearcoat = 1; p.transparent = true; p.opacity = 0.6; }
      return true;
    case 'cap':
      if (/shield/.test(n)) { fromSpec([0.55, 0.12], [0.25, 0.6]); p.clearcoat = 0.7; p.clearcoatRoughness = 0.1; p.envMapIntensity = 1.5; } // painted vibranium
      else { fromSpec([0.88, 0.32], [0.62, 0.9]); p.sheen = 0.35; p.sheenColor = tint(0xd0dcff); p.sheenRoughness = 0.55; p.clearcoat = 0.08; } // scale-mail suit, leather straps
      glow(0xffffff, 1.4);
      return true;
    case 'thor':
      if (/hammer/.test(n)) { fromSpec([0.6, 0.16], [0.2, 0.55]); p.clearcoat = 0.3; p.envMapIntensity = 1.6; } // Mjolnir: uru metal, leather grip
      else { fromSpec([0.86, 0.26], [0.5, 0.8]); p.sheen = 0.3; p.sheenColor = tint(0xffe0d0); p.sheenRoughness = 0.55; } // armour discs, cape, skin
      return true;
    case 'gamora':
      if (/head/.test(n)) skin(0xd8ffc8);
      else if (/faceacc|hair/.test(n)) hair();
      else if (/backpack|cape/.test(n)) fabric(0.75, 0.5, 0xffd0e0);
      else if (/female|sword|blade/.test(n)) metal(0.22, 0.4, 1.7); // Godslayer
      else leather(0.45); // armoured bodysuit
      return true;
    case 'doom':
      if (/s01_2$/.test(n)) metal(0.3, 0.25, 1.6); // steel mask, gauntlets and greaves
      else if (/s01_5$/.test(n)) { p.color.set(0x2b3038); metal(0.45, 0.1, 1.2); } // dark mail
      else if (/s01_3|default/.test(n)) { p.transparent = false; metal(0.28, 0.4, 1.5); } // brass clasps
      else if (/material\.002|material_[23]/.test(n)) leather(0.5); // belt and straps
      else fabric(0.88, 0.28, 0x5f8f5f); // tunic, hood and cape
      return true;
    case 'sentry':
      if (/skin/.test(n)) skin();
      else if (/hair/.test(n)) hair();
      else if (/eye/.test(n)) { p.roughness = 0.08; p.clearcoat = 1; p.clearcoatRoughness = 0.05; }
      else if (/yellow/.test(n)) { fromSpec([0.55, 0.22]); p.sheen = 0.6; p.sheenColor = tint(0xffe080); p.clearcoat = 0.3; p.clearcoatRoughness = 0.2; } // gold trim
      else { fromSpec([0.6, 0.3]); p.sheen = 0.45; p.sheenColor = tint(0xb0c8ff); p.sheenRoughness = 0.5; p.clearcoat = 0.18; p.clearcoatRoughness = 0.3; } // blue suit
      glow(0xffe9a0, 1.6);
      return true;
    case 'spiderman':
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (p[k]) p[k].anisotropy = 8;
      if (p.normalMap && p.normalMap !== microNormal()) p.normalScale.set(1.15, 1.15);
      if (!/lens|glass|frames/.test(n)) { p.sheen = Math.max(p.sheen || 0, 0.3); p.sheenColor = tint(0xffb8b8); p.clearcoat = Math.max(p.clearcoat || 0, 0.12); p.clearcoatRoughness = 0.3; }
      if (!m_pal(src)) { p.roughness = 0.55; p.metalness = 0; }
      return false;
  }
  return false;
}
const m_pal = (m) => !!(m.userData && m.userData.pbr);

function upgradeMaterial(m, meshName, heroId = null) {
  const name = ((m.name || '') + ' ' + (meshName || '')).toLowerCase();
  const p = new THREE.MeshPhysicalMaterial();
  for (const k of ['color', 'map', 'normalMap', 'normalScale', 'roughness', 'roughnessMap', 'metalness', 'metalnessMap', 'aoMap', 'aoMapIntensity', 'emissive', 'emissiveMap', 'emissiveIntensity', 'alphaMap', 'transparent', 'opacity', 'alphaTest', 'side', 'vertexColors']) {
    if (m[k] !== undefined && m[k] !== null) { if (m[k] && m[k].isColor) p[k].copy(m[k]); else if (m[k] && m[k].isVector2) p[k].copy(m[k]); else p[k] = m[k]; }
  }
  p.name = m.name;
  if (m.isMeshPhongMaterial) { p.roughness = 0.55; p.metalness = 0; }
  if (p.normalMap && p.normalMap.image) p.normalMap = standardNormal(p.normalMap);
  // FBX exporters flag opaque materials as transparent: cut out by the map's alpha instead
  if (p.transparent && p.opacity >= 1 && !p.alphaMap) { p.transparent = false; p.alphaTest = 0.5; }
  if (p.emissiveMap && p.emissive.getHex() === 0) p.emissive.set(0xffffff);
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
  if ((m.userData && m.userData.hasBaseMap) || p.vertexColors) p.color.set(0xffffff);
  if (heroId && heroRecipe(heroId, p, m)) return p;
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

// ------------------------------------------------------------------ rig
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
    // bones under one naming scheme; FBX nests duplicated bones, the outermost copy drives the rest
    const bones = {};
    model.traverse((o) => { if (o.isBone) { const k = canonBone(o.name); if (!bones[k]) bones[k] = o; } });
    const hips = bones.hips || null;
    // chest = where the arms attach (Biped hangs the clavicles off the neck)
    let chest = bones.leftarm && bones.leftarm.parent;
    if (chest && /shoulder$/.test(canonBone(chest.name))) chest = chest.parent;
    while (chest && chest.isBone && /^neck/.test(canonBone(chest.name))) chest = chest.parent;
    if (!(chest && chest.isBone)) chest = bones.spine2 || bones.spine1 || bones.spine || hips;
    let spine = chest;
    while (spine && spine.parent && spine.parent !== hips && spine.parent.isBone) spine = spine.parent;
    if (!spine || spine === chest || spine.parent !== hips) spine = null;
    const head = bones.head || null;
    const B = { hips, spine, chest, head, lSh: bones.leftarm, lEl: bones.leftforearm, lHand: bones.lefthand, rSh: bones.rightarm, rEl: bones.rightforearm, rHand: bones.righthand,
      lHip: bones.leftupleg, lKnee: bones.leftleg, lFoot: bones.leftfoot, rHip: bones.rightupleg, rKnee: bones.rightleg, rFoot: bones.rightfoot };
    // stand it up facing +Z, then normalise in the rest pose: target height, feet on the floor, centred
    if (hips && head && B.lSh && B.rSh) orient(model, B);
    const target = HEIGHTS[hero.id] || 1.85;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, false);
    const s = target / Math.max(0.01, box.max.y - box.min.y);
    model.scale.multiplyScalar(s);
    model.position.multiplyScalar(s);
    model.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(model, false);
    const c = box2.getCenter(new V());
    model.position.x -= c.x; model.position.z -= c.z; model.position.y -= box2.min.y - (gltf.lift || 0);
    model.updateMatrixWorld(true);
    const lHand = B.lHand || chest, rHand = B.rHand || chest;
    const J = { hips: hips || model, chest: chest || model, lHand, rHand, lFoot: B.lFoot || hips, rFoot: B.rFoot || hips };
    // a proxy at the centre of the head, ~9 cm above the head bone whatever the bone's axes
    const headAnchor = new THREE.Object3D();
    if (head) {
      head.add(headAnchor);
      const at = head.getWorldPosition(new V()).add(new V(0, 0.09, 0.02).multiplyScalar(target / 1.85));
      headAnchor.position.copy(head.worldToLocal(at));
    }
    J.head = headAnchor;
    super(root, body, J, { scale: target / 1.85, thigh: 0.45, shin: 0.44, headR: 0.115 });
    this.isModel = true;
    this.headCenter = new V();
    this.anchors = { cast: rHand, cast2: lHand };
    // materials: PBR upgrade, shadows, alt tint for mirror matches
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const up = mats.map((m) => {
        const n = upgradeMaterial(m, o.name, hero.id);
        if (alt) { if (n.vertexColors) n.color.set(0xa0a6a0); else n.color.offsetHSL(0.5, -0.15, -0.1); }
        return n;
      });
      o.material = Array.isArray(o.material) ? up : up[0];
    });
    // a full clip set (Mixamo pack) plays directly; otherwise the pose library is retargeted
    const own = (gltf.animations || []).filter((cl) => cl.duration > 0.1 && cl.tracks.length);
    const all = [...own, ...sharedClips];
    const covers = (k) => CHAINS[k].some((w) => all.some((cl) => cl.name.toLowerCase().includes(w)));
    this.clips = all.map((cl) => inPlace(cl, hips ? hips.name : ''));
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = new Map();
    this.current = null; this.currentKey = null; this.token = null;
    this.hasAnims = !gltf.clipMap && all.length > 0 && ['punch', 'kick', 'hit', 'knockdown'].every(covers);
    this.retarget = null;
    const pairs = RETARGET.map((j) => [j, B[j]]).filter(([, b]) => b);
    if (!this.hasAnims && pairs.length >= 12 && hips) {
      const drv = makeDriver();
      root.add(drv.root);
      for (const j of JOINTS) drv.J[j].rotation.set(0, 0, 0);
      // match the driver's rest pose to the model's own (T-pose, A-pose or relaxed): limb directions
      root.updateMatrixWorld(true);
      const P = (b) => b.getWorldPosition(new V());
      const down = new V(0, -1, 0);
      const aim = (dj, from, to) => {
        if (!from || !to) return;
        const dir = P(to).sub(P(from)).normalize();
        const parentQ = drv.J[dj].parent.getWorldQuaternion(new Q());
        drv.J[dj].quaternion.copy(parentQ.invert().multiply(new Q().setFromUnitVectors(down, dir)));
        drv.J[dj].updateMatrixWorld(true);
      };
      aim('lSh', B.lSh, B.lEl); aim('lEl', B.lEl, B.lHand); aim('rSh', B.rSh, B.rEl); aim('rEl', B.rEl, B.rHand);
      aim('lHip', B.lHip, B.lKnee); aim('lKnee', B.lKnee, B.lFoot); aim('rHip', B.rHip, B.rKnee); aim('rKnee', B.rKnee, B.rFoot);
      root.updateMatrixWorld(true);
      const cal = pairs.map(([dj, mb]) => ({ drv: drv.J[dj], mb, rdInv: drv.J[dj].getWorldQuaternion(new Q()).invert(), rm: mb.getWorldQuaternion(new Q()) }));
      const mRest = root.worldToLocal(hips.getWorldPosition(new V()));
      const dRest = root.worldToLocal(drv.J.hips.getWorldPosition(new V()));
      // fists: curl the (Mixamo-named) finger bones a little
      const fingers = [];
      model.traverse((o) => { if (o.isBone && /hand(index|middle|ring|pinky)[123]$/i.test(boneKey(o.name))) fingers.push(o); });
      // torso half-depth: how high the trunk bones must stay above the floor when lying down
      const cy = root.worldToLocal(chest.getWorldPosition(new V())).y, cv = new V();
      let zMin = Infinity, zMax = -Infinity;
      model.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const n = o.geometry.attributes.position.count, step = Math.max(1, Math.floor(n / 4000));
        for (let i = 0; i < n; i += step) {
          root.worldToLocal(o.localToWorld(o.getVertexPosition(i, cv)));
          if (Math.abs(cv.y - cy) < 0.06 * target && Math.abs(cv.x) < 0.18 * target) { zMin = Math.min(zMin, cv.z); zMax = Math.max(zMax, cv.z); }
        }
      });
      const bodyR = THREE.MathUtils.clamp((zMax - zMin) / 2, 0.08 * target / 1.85, 0.4);
      const trunk = [hips, spine, chest, head].filter(Boolean);
      this.retarget = { drv, cal, mRest, dRest, ratio: mRest.y / dRest.y, fingers, bodyR, trunk, q: new Q(), pq: new Q(), v: new V() };
      if (gltf.clipMap && own.length) this.overlay = this.makeOverlay(model, hips, own, gltf.clipMap, new Set(pairs.map(([, b]) => b)));
    }
    if (hero.id === 'sentry') { const aura = new THREE.PointLight(0xffd070, 0, 3, 2); chest.add(aura); this.aura = aura; }
    this.collectFlashMaterials();
    enhanceRig(this);
    this.setAnim('idle');
    this.mixer.update(0.01);
  }

  // hero-specific clips (e.g. MUA attacks) blended over the retargeted pose
  makeOverlay(model, hips, own, clipMap, driven) {
    // bones above the hips (Biped's Bip01, MUA's ActorRoot) stay at rest: their clip values use
    // a different root convention, so only the resulting hips placement is carried over
    const anc = [];
    for (let b = hips.parent; b && b !== model; b = b.parent) if (b.isBone) anc.push({ b, rest: b.quaternion.clone(), restP: b.position.clone() });
    const roots = new Set([hips.name, ...anc.map((a) => a.b.name)]);
    const map = new Map();
    for (const [key, want] of Object.entries(clipMap)) {
      const w = String(want).toLowerCase();
      const cl = own.find((x) => x.name.toLowerCase() === w) || own.find((x) => x.name.toLowerCase().includes(w));
      if (!cl) { report.errors.push('clip not found: ' + want); continue; }
      const clip = overlayClip(cl, roots);
      const samp = clip.tracks.map((t) => {
        const dot = t.name.lastIndexOf('.'), b = model.getObjectByName(t.name.slice(0, dot));
        return b && { b, quat: t.name.slice(dot + 1) === 'quaternion', interp: t.createInterpolant() };
      }).filter(Boolean);
      map.set(key, { clip, samp });
    }
    if (!map.size) return null;
    const names = new Set();
    for (const { clip } of map.values()) for (const t of clip.tracks) names.add(t.name.slice(0, t.name.lastIndexOf('.')));
    const slots = [];
    for (const nm of names) {
      if (roots.has(nm)) continue;
      const b = model.getObjectByName(nm);
      if (b) slots.push({ b, driven: driven.has(b), rest: b.quaternion.clone(), restP: b.position.clone(), q: new Q(), p: new V() });
    }
    return { map, cur: null, prev: null, fade: 0, key: null, token: null, want: false, w: 0,
      slots, anc, hips, hq: new Q(), hp: new V(), cq: new Q(), cp: new V(), pq: new Q(), tq: new Q(), tp: new V() };
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
    if (!this.hasAnims) { this.setOverlay(key, duration, token); return; }
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

  setOverlay(key, duration, token) {
    const O = this.overlay;
    if (!O) return;
    const e = O.map.get(key);
    if (!e) { O.want = false; return; }
    if (O.want && key === O.key && token === O.token) return;
    const once = !LOOP.has(key);
    const play = { e, t: 0, once, speed: duration && once ? THREE.MathUtils.clamp(e.clip.duration / duration, 0.5, 3) : 1 };
    O.prev = O.cur && O.w > 0 ? O.cur : null; O.fade = 0; // short crossfade between clips
    O.cur = play; O.key = key; O.token = token; O.want = true;
  }

  update(pose, dt, rate = 16) {
    if (this.hasAnims) { this.mixer.update(dt); return; }
    const R = this.retarget;
    if (!R) return;
    const O = this.overlay;
    // clip-only bones go back to rest so the retarget sees the rest hierarchy
    if (O && O.cur) for (const s of O.slots) if (!s.driven) { s.b.quaternion.copy(s.rest); s.b.position.copy(s.restP); }
    R.drv.update(pose, dt, rate);
    this.root.updateMatrixWorld(true);
    // hips: follow the driver's hips, scaled to the model's proportions
    const hips = R.cal[0].mb;
    const d = this.root.worldToLocal(R.drv.J.hips.getWorldPosition(R.v));
    d.sub(R.dRest).multiplyScalar(R.ratio).add(R.mRest);
    d.y += 0.1 * (R.drv.cur.lie || 0);
    hips.position.copy(hips.parent.worldToLocal(this.root.localToWorld(d)));
    hips.updateMatrixWorld(true);
    // joints: transfer each driver bone's world rotation (relative to its rest) onto the model bone
    for (const c of R.cal) {
      c.drv.getWorldQuaternion(R.q).multiply(c.rdInv).multiply(c.rm);
      c.mb.parent.getWorldQuaternion(R.pq);
      c.mb.quaternion.copy(R.pq.invert().multiply(R.q));
      c.mb.updateMatrixWorld(true);
    }
    // lying down: bulky models are thicker than the driver, keep the trunk on top of the floor
    const lie = Math.min(1, R.drv.cur.lie || 0);
    if (lie > 0.05) {
      let low = Infinity;
      for (const b of R.trunk) low = Math.min(low, this.root.worldToLocal(b.getWorldPosition(R.v)).y);
      const lift = (R.bodyR - low) * lie;
      if (lift > 0) {
        const w = this.root.worldToLocal(hips.getWorldPosition(R.v));
        w.y += lift;
        hips.position.copy(hips.parent.worldToLocal(this.root.localToWorld(w)));
        hips.updateMatrixWorld(true);
      }
    }
    if (!R.curled) { R.curled = true; for (const f of R.fingers) f.rotation.z += /left/i.test(f.name) ? 1.1 : -1.1; }
    if (O) this.updateOverlay(dt);
  }

  // sample a clip straight onto the bones (k < 1 blends toward it from what is there)
  applyClip(play, k) {
    const O = this.overlay, dur = play.e.clip.duration;
    const t = play.once ? Math.min(play.t, dur) : play.t % dur;
    for (const s of play.e.samp) {
      const v = s.interp.evaluate(t);
      if (s.quat) { O.tq.fromArray(v); if (k >= 1) s.b.quaternion.copy(O.tq); else s.b.quaternion.slerp(O.tq, k); }
      else { O.tp.fromArray(v); if (k >= 1) s.b.position.copy(O.tp); else s.b.position.lerp(O.tp, k); }
    }
  }

  updateOverlay(dt) {
    const O = this.overlay, H = O.hips;
    O.w = THREE.MathUtils.clamp(O.w + (O.want ? dt / 0.1 : -dt / 0.16), 0, 1);
    if (!O.cur) return;
    const rest = () => { for (const a of O.anc) { a.b.quaternion.copy(a.rest); a.b.position.copy(a.restP); } };
    if (O.w === 0) { O.cur = O.prev = null; rest(); return; }
    for (const s of O.slots) { s.q.copy(s.b.quaternion); s.p.copy(s.b.position); }
    O.hq.copy(H.quaternion); O.hp.copy(H.position); // procedural hips, local to the rest parent
    O.cur.t += dt * O.cur.speed;
    if (O.prev) {
      O.prev.t += dt * O.prev.speed;
      O.fade = Math.min(1, O.fade + dt / 0.08);
      this.applyClip(O.prev, 1);
      this.applyClip(O.cur, O.fade);
      if (O.fade >= 1) O.prev = null;
    } else this.applyClip(O.cur, 1);
    // the clip's hips in world space; then the root chain goes back to rest and the hips take
    // that rotation, the clip's height and the procedural horizontal placement
    H.updateWorldMatrix(true, false);
    H.getWorldQuaternion(O.cq); H.getWorldPosition(O.cp);
    rest();
    H.parent.updateWorldMatrix(true, false);
    const clipY = this.root.worldToLocal(O.cp).y;
    const target = this.root.worldToLocal(H.parent.localToWorld(O.tp.copy(O.hp)));
    target.y = clipY;
    H.parent.worldToLocal(this.root.localToWorld(target));
    const w = O.w * O.w * (3 - 2 * O.w);
    H.quaternion.copy(O.hq).slerp(H.parent.getWorldQuaternion(O.pq).invert().multiply(O.cq), w);
    H.position.copy(O.hp).lerp(target, w);
    for (const s of O.slots) {
      O.tq.copy(s.b.quaternion); s.b.quaternion.copy(s.q).slerp(O.tq, w);
      O.tp.copy(s.b.position); s.b.position.copy(s.p).lerp(O.tp, w);
    }
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

// FBX skin data isn't always self-consistent: some exports store bind matrices from another
// space (a missing bind pose, a unit scale or a turn applied to only the mesh or only the bones).
// If the bones as placed in the file line up with the mesh better than the stored bind pose
// does, re-bind the mesh to them.
function fixSkinBinding(scene) {
  const meshes = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) return null;
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4(), v = new V();
  // how far head, hips and feet sit from where they belong along the body (0.88 / 0.53 / 0.04 of
  // the mesh's extent from the feet up): small = the skeleton lines up with the mesh
  const fit = (useBind) => {
    const at = {};
    for (const m of meshes) m.skeleton.bones.forEach((b, i) => {
      const k = canonBone(b.name);
      if (at[k] || !/^(hips|head|leftfoot|rightfoot)$/.test(k)) return;
      at[k] = useBind ? new V().setFromMatrixPosition(inv.copy(m.skeleton.boneInverses[i]).invert()) : b.getWorldPosition(new V());
    });
    if (!at.hips || !at.head || !at.leftfoot || !at.rightfoot) return Infinity;
    const feet = at.leftfoot.clone().add(at.rightfoot).multiplyScalar(0.5), axis = at.head.clone().sub(feet).normalize();
    let lo = Infinity, hi = -Infinity;
    for (const m of meshes) {
      const pos = m.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 4000));
      for (let i = 0; i < pos.count; i += step) { const d = v.fromBufferAttribute(pos, i).applyMatrix4(useBind ? m.bindMatrix : m.matrixWorld).dot(axis); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    }
    const t = (p) => (p.dot(axis) - lo) / (hi - lo || 1);
    return Math.abs(t(at.head) - 0.88) + Math.abs(t(at.hips) - 0.53) + Math.abs(t(feet) - 0.04);
  };
  const fBind = fit(true), fNow = fit(false);
  if (fNow >= fBind - 0.2) return null;
  for (const m of meshes) { m.skeleton.calculateInverses(); m.bind(m.skeleton, m.matrixWorld.clone()); }
  return 'rebound to its skeleton';
}

// bone chains rigged outside the body hierarchy (Doom's cape hangs off the scene root) would
// stay put while the body moves: hang them on the nearest body bone, keeping their placement
function attachLooseBones(scene) {
  let hips = null;
  scene.traverse((o) => { if (!hips && o.isBone && canonBone(o.name) === 'hips') hips = o; });
  if (!hips) return 0;
  const body = [], above = new Set();
  hips.traverse((o) => { if (o.isBone && MAJOR.test(canonBone(o.name))) body.push(o); });
  for (let p = hips.parent; p; p = p.parent) above.add(p);
  const aboveNames = new Set([...above].map((p) => p.name));
  const loose = [];
  scene.traverse((o) => {
    if (!o.isBone || o === hips || above.has(o) || aboveNames.has(o.name) || o.name === hips.name) return; // FBX duplicates follow their originals
    if (o.parent && o.parent.isBone && !above.has(o.parent)) return;
    let inBody = false;
    for (let p = o.parent; p; p = p.parent) if (p === hips) inBody = true;
    if (!inBody) loose.push(o);
  });
  scene.updateMatrixWorld(true);
  const a = new V(), b = new V();
  for (const o of loose) {
    o.getWorldPosition(a);
    let best = null, bd = Infinity;
    for (const k of body) { const d = k.getWorldPosition(b).distanceToSquared(a); if (d < bd) { bd = d; best = k; } }
    if (best) best.attach(o);
  }
  return loose.length;
}

// unskinned parts of a rigged model (belts, clasps) ride rigidly on the nearest body bone
const MAJOR = /^(hips|spine\d?|neck|head|(left|right)(shoulder|arm|forearm|hand|upleg|leg|foot))$/;
function bindStaticParts(scene) {
  let skel = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && (!skel || o.skeleton.bones.length > skel.bones.length)) skel = o.skeleton; });
  const statics = [];
  scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !(o.parent && o.parent.isBone)) statics.push(o); });
  if (!skel || !statics.length) return;
  scene.updateMatrixWorld(true);
  const segs = [];
  skel.bones.forEach((b, i) => {
    if (!MAJOR.test(canonBone(b.name))) return;
    const a = b.getWorldPosition(new V());
    const kids = b.children.filter((k) => k.isBone && MAJOR.test(canonBone(k.name)));
    if (!kids.length) segs.push({ i, a, b: a });
    for (const k of kids) segs.push({ i, a, b: k.getWorldPosition(new V()) });
  });
  if (!segs.length) return;
  const sk = new THREE.Skeleton(skel.bones); // inverses from the pose the meshes are shown in
  for (const m of statics) {
    const geo = m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    const pos = geo.attributes.position, n = pos.count, p = new V();
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) {
      p.fromBufferAttribute(pos, v);
      let best = 0, bd = Infinity;
      for (const s of segs) { const d = segDist(p, s.a, s.b); if (d < bd) { bd = d; best = s.i; } }
      si[v * 4] = best; sw[v * 4] = 1;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const sm = new THREE.SkinnedMesh(geo, m.material);
    sm.name = m.name;
    m.removeFromParent();
    scene.add(sm);
    sm.updateMatrixWorld(true);
    sm.bind(sk, sm.matrixWorld.clone());
  }
}

const parsed = new Map(); // heroId → parsed gltf (never added to a scene directly)
// compact indexed meshes from tools/decimate_stl.py (MKM1: one part) and
// tools/glb_to_mkm.py (MKM2: named parts with sRGB vertex paint)
function parseMKM(buf) {
  const dv = new DataView(buf);
  const tag = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  const scene = new THREE.Group();
  const part = (name, pos, idx, col) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'skin', vertexColors: !!col }));
    mesh.name = name;
    scene.add(mesh);
  };
  if (tag === 'MKM1') {
    const nv = dv.getUint32(4, true), nt = dv.getUint32(8, true);
    part('body', new Float32Array(buf.slice(12, 12 + nv * 12)), new Uint32Array(buf.slice(12 + nv * 12, 12 + nv * 12 + nt * 12)));
  } else {
    let o = 8;
    const n = dv.getUint32(4, true);
    for (let i = 0; i < n; i++) {
      const len = dv.getUint8(o); o += 1;
      const name = new TextDecoder().decode(new Uint8Array(buf, o, len)); o += len;
      const nv = dv.getUint32(o, true), nt = dv.getUint32(o + 4, true), hasColor = dv.getUint8(o + 8); o += 9;
      const pos = new Float32Array(buf.slice(o, o + nv * 12)); o += nv * 12;
      let col = null;
      if (hasColor) {
        const raw = new Uint8Array(buf, o, nv * 3); o += nv * 3;
        col = new Float32Array(nv * 3);
        for (let k = 0; k < col.length; k++) col[k] = Math.pow(raw[k] / 255, 2.2);
      }
      const idx = new Uint32Array(buf.slice(o, o + nt * 12)); o += nt * 12;
      part(name, pos, idx, col);
    }
  }
  return { scene, animations: [] };
}

export async function prepareParsed(progress = () => {}) {
  let done = 0;
  for (const [id, buf] of buffers) {
    try {
      const url = urls.get(id) || '', o = opts.get(id) || {};
      let g = /\.fbx$/i.test(url) ? await parseFBX(buf, url, o) : /\.mkm$/i.test(url) ? parseMKM(buf) : await parse(buf.slice(0));
      let hasBones = false;
      g.scene.traverse((n) => { if (n.isBone) hasBones = true; });
      if (o.autorig || !hasBones) {
        const r = autoRig(g.scene, { height: HEIGHTS[id] || 1.85, upAxis: o.upAxis || 'y', flip: !!o.flip, turn: o.turn || 0, weldedArms: !!o.weldedArms });
        if (!r) throw new Error('no meshes to rig');
        g = r;
        report.models[id] += ' (auto-rigged)';
      } else {
        const fixed = fixSkinBinding(g.scene);
        if (fixed) report.models[id] += ' (' + fixed + ')';
        attachLooseBones(g.scene);
        bindStaticParts(g.scene);
      }
      if (id === 'hulk') hulkMaterials(g);
      g.clipMap = o.clips || null;
      g.lift = o.lift || 0;
      parsed.set(id, g);
    } catch (e) { report.errors.push(id + ': ' + e.message); buffers.delete(id); }
    buffers.delete(id); // parsed now; the raw file is no longer needed
    progress(++done);
    await new Promise((r) => setTimeout(r, 0)); // let the loading screen repaint
  }
}

// Hulk sculpt: no UVs or materials. Split skin / torn purple pants / hair / eyes by the
// sculpt's own vertex paint (or by bone for unpainted meshes) and add box-projected detail.
function hulkMaterials(g) {
  const H = g.height || 2.55;
  const mats = ['hulk_skin', 'hulk_pants', 'hulk_hair', 'hulk_eye'].map((name) => new THREE.MeshStandardMaterial({ name }));
  g.scene.traverse((m) => {
    if (!m.isSkinnedMesh) return;
    const geo = m.geometry, col = geo.attributes.color, pos = geo.attributes.position;
    boxUVs(geo, 7);
    const bones = m.skeleton.bones.map((b) => b.name), si = geo.attributes.skinIndex;
    const eye = /eye/i.test(m.name);
    const kind = col
      ? (i) => { const r = col.getX(i), gr = col.getY(i), b = col.getZ(i); if (b > gr && b > 0.7 * r) return 1; if (r + gr + b < 0.045) return 2; return 0; }
      : (i) => { const b = bones[si.getX(i)] || '', y = pos.getY(i); return (/UpLeg/.test(b) && y > 0.27 * H + 0.012 * H * Math.sin(pos.getX(i) * 60)) || (/Hips/.test(b) && y < 0.56 * H) ? 1 : 0; };
    const kinds = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) kinds[i] = eye ? 3 : kind(i);
    const idx = geo.index.array, lists = [[], [], [], []];
    for (let t = 0; t < idx.length; t += 3) {
      const a = kinds[idx[t]], b = kinds[idx[t + 1]], c = kinds[idx[t + 2]];
      lists[a === b || a === c ? a : b === c ? b : a].push(idx[t], idx[t + 1], idx[t + 2]);
    }
    if (col) {
      // the sculpt paints denim-blue shorts and lime skin: classic purple pants, deeper gamma-green skin
      const c = new THREE.Color(), hsl = {};
      for (let i = 0; i < pos.count; i++) {
        if (kinds[i] > 1) continue;
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).getHSL(hsl);
        if (kinds[i] === 1) c.setHSL(0.77, Math.max(hsl.s, 0.55), hsl.l * 0.72);
        else c.setHSL(0.31 + (hsl.h - 0.25) * 0.5, Math.min(1, hsl.s * 1.05), hsl.l * 0.62);
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    }
    geo.setIndex(lists.flat());
    geo.clearGroups();
    let start = 0;
    lists.forEach((l, i) => { if (l.length) geo.addGroup(start, l.length, i); start += l.length; });
    if (col) mats.forEach((mm) => { mm.vertexColors = true; });
    m.material = mats;
  });
}

export function buildModelRig(hero, alt) {
  const gltf = parsed.get(hero.id);
  if (!gltf) return null;
  const rig = new ModelRig({ scene: cloneSkinned(gltf.scene), animations: gltf.animations, clipMap: gltf.clipMap, lift: gltf.lift }, hero, alt);
  if (!rig.hasAnims && !rig.retarget) { report.errors.push(hero.id + ': model has no animations or recognisable skeleton, using the built-in hero instead'); parsed.delete(hero.id); return null; }
  return rig;
}

// swap hero builders over to their imported models where available
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
