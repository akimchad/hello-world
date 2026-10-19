// Skinned, sculpted hero bodies. The torso, neck, arms and legs are lofted
// meshes with muscle bulges, skinned to a bone skeleton so joints bend
// smoothly. Costume detail comes from painted color + normal maps.
import * as THREE from 'three';
import { Rig } from './rig.js';
import { buildHead } from './face.js';
import { makeCanvas, normalCanvas, toTex, heightCanvas, noiseCanvas, overlayNoise } from './textures.js';

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Catmull-Rom through keys [[y, v1, v2...]] (any order)
function profileFn(keys) {
  const k = keys.slice().sort((a, b) => a[0] - b[0]);
  const n = k.length;
  return (y) => {
    if (y <= k[0][0]) return k[0].slice(1);
    if (y >= k[n - 1][0]) return k[n - 1].slice(1);
    let i = 0; while (i < n - 2 && y > k[i + 1][0]) i++;
    const k0 = k[Math.max(0, i - 1)], k1 = k[i], k2 = k[i + 1], k3 = k[Math.min(n - 1, i + 2)];
    const t = (y - k1[0]) / (k2[0] - k1[0]), t2 = t * t, t3 = t2 * t;
    const out = [];
    for (let j = 1; j < k1.length; j++) {
      const p0 = k0[j], p1 = k1[j], p2 = k2[j], p3 = k3[j];
      out.push(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
    }
    return out;
  };
}

// Loft along +Y. theta = 0 faces +Z (front), +PI/2 faces +X. u = 0.5 is the front.
export function loftGeometry({ y0, y1, rings = 40, seg = 32, profile, bumps = [], center = null, capTop = 0.01, capBot = 0.01 }) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const y = y0 + (y1 - y0) * v;
    const [rx, rz] = profile(y);
    const [cx, cz] = center ? center(y) : [0, 0];
    for (let j = 0; j <= seg; j++) {
      const u = j / seg;
      const th = (u - 0.5) * TAU;
      let b = 0;
      for (const bp of bumps) {
        const dy = (y - bp.y) / bp.sy, dt = angDiff(th, bp.th) / bp.st;
        b += bp.a * Math.exp(-dy * dy - dt * dt);
      }
      pos.push(cx + (rx + b) * Math.sin(th), y, cz + (rz + b) * Math.cos(th));
      uv.push(u, v);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  // caps
  const [cb0, cb1] = center ? center(y0) : [0, 0];
  const bot = pos.length / 3; pos.push(cb0, y0 - capBot, cb1); uv.push(0.5, 0);
  for (let j = 0; j < seg; j++) idx.push(bot, j + 1, j);
  const [ct0, ct1] = center ? center(y1) : [0, 0];
  const top = pos.length / 3; pos.push(ct0, y1 + capTop, ct1); uv.push(0.5, 1);
  const tr = rings * row;
  for (let j = 0; j < seg; j++) idx.push(top, tr + j, tr + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld the seam normals
  const n = g.attributes.normal;
  for (let i = 0; i <= rings; i++) {
    const a = i * row, b = a + seg;
    const x = n.getX(a) + n.getX(b), yy = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, yy, z) || 1;
    n.setXYZ(a, x / l, yy / l, z / l); n.setXYZ(b, x / l, yy / l, z / l);
  }
  return g;
}

// attach skin weights from weightFn(x, y, z) → [[boneIndex, weight], ...] (≤ 4)
export function skin(geo, material, skeleton, weightFn) {
  const p = geo.attributes.position;
  const si = new Uint16Array(p.count * 4), sw = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const ws = weightFn(p.getX(i), p.getY(i), p.getZ(i), i).filter((w) => w[1] > 0.0001).slice(0, 4);
    let sum = ws.reduce((s, w) => s + w[1], 0) || 1;
    ws.forEach((w, k) => { si[i * 4 + k] = w[0]; sw[i * 4 + k] = w[1] / sum; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const m = new THREE.SkinnedMesh(geo, material);
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  return m;
}

// blend between two bones across a boundary height
const blend2 = (y, yb, w, above, below) => { const t = sstep(yb - w, yb + w, y); return [[above, t], [below, 1 - t]]; };

// ------------------------------------------------------------------
// painted part materials (cached per hero/part)
// ------------------------------------------------------------------
const texCache = new Map();
export function partMaterial(key, opt) {
  // opt: { w, h, paint(g,w,h), height(g,w,h), strength, rough, metal, sheen, sheenColor, clearcoat, emissive, emissiveMap }
  let tex = texCache.get(key);
  if (!tex) {
    const w = opt.w || 512, h = opt.h || 512;
    const color = makeCanvas(w, h, (g) => { opt.paint(g, w, h); });
    const hc = heightCanvas(w, h, (g) => { opt.height && opt.height(g, w, h); overlayNoise(g, w, h, noiseCanvas(128, 32, 7, 2), opt.grain ?? 0.07, 'overlay'); });
    tex = { map: toTex(color), normalMap: toTex(normalCanvas(hc, (opt.strength ?? 3) * 0.6), { srgb: false }) };
    if (opt.emissivePaint) tex.emissiveMap = toTex(makeCanvas(w, h, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); opt.emissivePaint(g, w, h); }));
    if (opt.roughPaint) tex.roughnessMap = toTex(makeCanvas(w, h, (g) => opt.roughPaint(g, w, h)), { srgb: false });
    texCache.set(key, tex);
  }
  const m = new THREE.MeshPhysicalMaterial({
    map: tex.map, normalMap: tex.normalMap, roughness: opt.rough ?? 0.6, metalness: opt.metal ?? 0.0,
    sheen: opt.sheen ?? 0, sheenRoughness: 0.6, sheenColor: new THREE.Color(opt.sheenColor ?? 0xffffff),
    clearcoat: opt.clearcoat ?? 0, clearcoatRoughness: 0.25,
    emissive: new THREE.Color(opt.emissive ?? (tex.emissiveMap ? 0xffffff : 0x000000)), emissiveMap: tex.emissiveMap || null, emissiveIntensity: opt.ei ?? 1,
    roughnessMap: tex.roughnessMap || null, side: opt.side ?? THREE.FrontSide,
  });
  m.normalScale.set(1, 1);
  return m;
}

// painter coordinate helpers for lofted parts
export function mapper(w, h, y0, y1) {
  return {
    w, h,
    y0, y1,
    X: (th) => (th / TAU + 0.5) * w,          // angle → px (front = center)
    Y: (y) => (1 - (y - y0) / (y1 - y0)) * h, // body height → px
    thAt: (px) => (px / w - 0.5) * TAU,
    yAt: (py) => y0 + (1 - py / h) * (y1 - y0),
    band(g, ya, yb, color) { const a = this.Y(Math.max(ya, yb)), b = this.Y(Math.min(ya, yb)); g.fillStyle = color; g.fillRect(0, a, w, b - a); },
  };
}

// ------------------------------------------------------------------
// fists and feet (rigid, attached to bones)
// ------------------------------------------------------------------
export function buildFist(side, mat, k = 1, opts = {}) {
  const g = new THREE.Group();
  const s = side; // +1 left (outer = +x), -1 right
  const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, m = mat) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x * k, y * k, z * k); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o;
  };
  const palm = new THREE.SphereGeometry(0.05 * k, 16, 12);
  add(palm, 0, -0.05, 0.004, 0, 0, 0, 0.72, 1.12, 1.0);
  // four curled fingers: knuckle row spread front-to-back, curling toward the palm side (-x for left hand)
  const seg = new THREE.CapsuleGeometry(0.0115 * k, 0.026 * k, 4, 8);
  const tip = new THREE.CapsuleGeometry(0.0105 * k, 0.016 * k, 4, 8);
  for (let i = 0; i < 4; i++) {
    const z = (0.03 - i * 0.02) * (i === 3 ? 0.95 : 1);
    const len = i === 3 ? 0.85 : 1;
    add(seg, 0.002 * s, -0.098 * len, z, 0, 0, 0, 1, len, 1);
    add(tip, -0.022 * s, -0.098 * len, z, 0, 0, Math.PI / 2, 1, len, 1);
  }
  // thumb wraps over the front
  add(new THREE.CapsuleGeometry(0.013 * k, 0.034 * k, 4, 8), -0.018 * s, -0.072, 0.05, 0.5, 0, 0.9 * s, 1, 1, 1);
  if (opts.glove) {
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.047 * k, 0.05 * k, 0.05 * k, 16), opts.glove);
    cuff.position.y = 0.01 * k; cuff.castShadow = true; g.add(cuff);
  }
  return g;
}

export function buildFoot(mat, k = 1, opts = {}) {
  const g = new THREE.Group();
  const toe = new THREE.Mesh(new THREE.CapsuleGeometry(0.046 * k, 0.15 * k, 6, 14), mat);
  toe.rotation.x = Math.PI / 2; toe.scale.set(1.0, 1, 0.72); toe.position.set(0, -0.032 * k, 0.065 * k); toe.castShadow = true; g.add(toe);
  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.05 * k, 14, 10), mat);
  heel.scale.set(0.95, 0.9, 1); heel.position.set(0, -0.02 * k, -0.025 * k); heel.castShadow = true; g.add(heel);
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.094 * k, 0.022 * k, 0.27 * k), opts.sole || mat);
  sole.position.set(0, -0.064 * k, 0.05 * k); sole.castShadow = true; g.add(sole);
  if (opts.cuff) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.062 * k, 0.058 * k, 0.07 * k, 16), opts.cuff);
    c.position.y = 0.02 * k; c.castShadow = true; g.add(c);
  }
  return g;
}

// ------------------------------------------------------------------
// the body
// ------------------------------------------------------------------
const DEFAULT_DIMS = {
  scale: 1, shoulderW: 0.25, hipW: 0.1, upper: 0.3, fore: 0.27, thigh: 0.45, shin: 0.44, headR: 0.118,
  muscle: 1, chestK: 1, waistK: 1, hipK: 1, armK: 1, legK: 1, neckK: 1, depthK: 1, female: false, handK: 1, footK: 1,
};

export function buildHeroRig(spec) {
  const d = Object.assign({}, DEFAULT_DIMS, spec.dims || {});
  d.groundOffset = 0.09;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const J = {};
  const bones = [];
  const B = (name, parent, x = 0, y = 0, z = 0) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); parent.add(b); J[name] = b; bones.push(b); return b; };

  const legLen = d.thigh + d.shin + 0.07;
  const R = d.headR;
  B('hips', body, 0, legLen, 0);
  B('spine', J.hips, 0, 0.05, 0);
  B('chest', J.spine, 0, 0.27, 0);
  B('head', J.chest, 0, 0.365, 0.008);
  B('lSh', J.chest, d.shoulderW, 0.17, -0.005);
  B('rSh', J.chest, -d.shoulderW, 0.17, -0.005);
  B('lEl', J.lSh, 0, -d.upper, 0);
  B('rEl', J.rSh, 0, -d.upper, 0);
  B('lHand', J.lEl, 0, -d.fore, 0);
  B('rHand', J.rEl, 0, -d.fore, 0);
  B('lHip', J.hips, d.hipW, -0.02, 0);
  B('rHip', J.hips, -d.hipW, -0.02, 0);
  B('lKnee', J.lHip, 0, -d.thigh, 0);
  B('rKnee', J.rHip, 0, -d.thigh, 0);
  B('lFoot', J.lKnee, 0, -d.shin, 0);
  B('rFoot', J.rKnee, 0, -d.shin, 0);
  // face bones (head-local; head center sits R*0.9 above the head bone)
  const hc = new V3(0, R * 0.95, 0.014);
  B('jaw', J.head, hc.x, hc.y - 0.12 * R, hc.z - 0.12 * R);
  B('lC', J.head, hc.x + 0.27 * R, hc.y - 0.47 * R, hc.z + 0.86 * R);
  B('rC', J.head, hc.x - 0.27 * R, hc.y - 0.47 * R, hc.z + 0.86 * R);

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const bi = (name) => bones.indexOf(J[name]);
  const W = (name) => J[name].getWorldPosition(new V3());
  const rig = new Rig(root, body, J, d);
  rig.skeleton = skeleton;
  rig.headCenter = hc;
  const mats = spec.materials(d);
  rig.mats = mats;
  const addSkinned = (geo, mat, fn) => { const m = skin(geo, mat, skeleton, fn); root.add(m); m.bind(skeleton); return m; };
  const M = d.muscle;

  // ---------- torso ----------
  const hipsY = W('hips').y, spineY = W('spine').y, chestY = W('chest').y;
  const T = rig.torsoRange = [-0.15, 0.66];
  const ck = d.chestK, wk = d.waistK, hk = d.hipK, dk = d.depthK;
  const torsoKeys = [
    [-0.15, 0.085 * hk, 0.08 * dk],
    [-0.1, 0.15 * hk, 0.11 * dk],
    [-0.02, 0.163 * hk, 0.118 * dk],
    [0.08, 0.148 * wk, 0.108 * dk],
    [0.18, 0.153 * (wk + ck) / 2, 0.11 * dk],
    [0.3, 0.175 * ck, 0.124 * dk],
    [0.41, 0.192 * ck, 0.133 * dk],
    [0.5, 0.2 * ck, 0.128 * dk],
    [0.555, 0.188 * ck, 0.11 * dk],
    [0.6, 0.135 * Math.max(1, d.neckK * 0.85), 0.088 * dk],
    [0.635, 0.075 * d.neckK, 0.066 * d.neckK],
    [0.66, 0.05 * d.neckK, 0.05 * d.neckK],
  ];
  const tb = [
    // pecs
    { y: 0.44, th: 0.5, sy: 0.06, st: 0.42, a: (d.female ? 0.012 : 0.022) * M },
    { y: 0.44, th: -0.5, sy: 0.06, st: 0.42, a: (d.female ? 0.012 : 0.022) * M },
    // lats / shoulder blades / traps / glutes
    { y: 0.36, th: 1.85, sy: 0.1, st: 0.45, a: 0.018 * M }, { y: 0.36, th: -1.85, sy: 0.1, st: 0.45, a: 0.018 * M },
    { y: 0.46, th: Math.PI - 0.65, sy: 0.06, st: 0.4, a: 0.012 * M }, { y: 0.46, th: -Math.PI + 0.65, sy: 0.06, st: 0.4, a: 0.012 * M },
    { y: 0.57, th: Math.PI, sy: 0.045, st: 0.9, a: 0.014 * M },
    { y: -0.07, th: Math.PI - 0.42, sy: 0.07, st: 0.38, a: 0.03 * (d.female ? 1.3 : 1) }, { y: -0.07, th: -Math.PI + 0.42, sy: 0.07, st: 0.38, a: 0.03 * (d.female ? 1.3 : 1) },
    // spine groove, sternum groove, inguinal V
    { y: 0.25, th: Math.PI, sy: 0.25, st: 0.07, a: -0.008 }, { y: 0.43, th: 0, sy: 0.06, st: 0.07, a: -0.007 * M },
    { y: 0.02, th: 0.62, sy: 0.04, st: 0.12, a: -0.007 * M }, { y: 0.02, th: -0.62, sy: 0.04, st: 0.12, a: -0.007 * M },
  ];
  if (d.female) tb.push({ y: 0.415, th: 0.42, sy: 0.055, st: 0.32, a: 0.032 }, { y: 0.415, th: -0.42, sy: 0.055, st: 0.32, a: 0.032 });
  if (!d.female) for (const sd of [-1, 1]) {
    tb.push({ y: 0.375, th: 0.5 * sd, sy: 0.018, st: 0.4, a: -0.012 * M });            // lower pec fold
    for (let k = 0; k < 3; k++) tb.push({ y: 0.3 + k * 0.045, th: 1.2 * sd, sy: 0.016, st: 0.1, a: 0.006 * M }); // serratus
    tb.push({ y: 0.1, th: 0.95 * sd, sy: 0.07, st: 0.25, a: 0.01 * M });                 // obliques
  }
  tb.push({ y: 0.29, th: 0, sy: 0.13, st: 0.045, a: -0.005 * M });                       // linea alba
  for (const yy of [0.1, 0.165, 0.23, 0.29]) for (const s of [-1, 1]) tb.push({ y: yy, th: 0.16 * s, sy: 0.021, st: 0.1, a: 0.0075 * M * (d.female ? 0.35 : 1) });
  const torsoGeo = loftGeometry({ y0: T[0], y1: T[1], rings: 64, seg: 56, profile: profileFn(torsoKeys), bumps: tb, center: (y) => [0, -0.004 + sstep(0.5, 0.66, y) * -0.012] });
  torsoGeo.translate(0, hipsY, 0);
  const sb = bi('spine'), cb = bi('chest'), hb = bi('hips');
  rig.parts = {};
  rig.parts.torso = addSkinned(torsoGeo, mats.torso, (x, y) => {
    const ry = y - hipsY;
    const tHips = 1 - sstep(0.0, 0.12, ry);
    const tChest = sstep(0.24, 0.36, ry);
    return [[hb, tHips], [sb, Math.max(0, 1 - tHips - tChest)], [cb, tChest]];
  });

  // ---------- neck ----------
  const headY = W('head').y;
  const nk = d.neckK;
  const neckGeo = loftGeometry({ y0: chestY + 0.2, y1: headY + 0.11, rings: 14, seg: 24,
    profile: profileFn([[chestY + 0.2, 0.09 * nk, 0.075 * nk], [chestY + 0.28, 0.064 * nk, 0.062 * nk], [headY + 0.04, 0.056 * nk, 0.058 * nk], [headY + 0.11, 0.05 * nk, 0.05 * nk]]),
    bumps: [{ y: headY - 0.02, th: 0.5, sy: 0.04, st: 0.25, a: 0.006 }, { y: headY - 0.02, th: -0.5, sy: 0.04, st: 0.25, a: 0.006 }],
    center: (y) => [0, -0.012 + (y - chestY) * 0.02] });
  rig.parts.neck = addSkinned(neckGeo, mats.neck, (x, y) => blend2(y, headY + 0.005, 0.04, bi('head'), cb));

  // ---------- arms ----------
  const ak = d.armK;
  for (const side of [1, -1]) {
    const S = side > 0 ? 'l' : 'r';
    const sh = W(S + 'Sh');
    const u = d.upper, f = d.fore;
    const out = Math.PI / 2 * side;
    const armKeys = [
      [0.075, 0.035 * ak], [0.05, 0.072 * ak], [0.0, 0.092 * ak], [-0.07, 0.083 * ak], [-0.16, 0.077 * ak],
      [-(u - 0.04), 0.06 * ak], [-u, 0.056 * ak], [-(u + 0.05), 0.064 * ak], [-(u + f * 0.55), 0.05 * ak], [-(u + f - 0.01), 0.039 * ak], [-(u + f + 0.01), 0.036 * ak],
    ];
    const pf = profileFn(armKeys);
    const ab = [
      { y: -0.17, th: 0, sy: 0.05, st: 0.55, a: 0.017 * M * ak },          // biceps
      { y: -0.12, th: Math.PI, sy: 0.07, st: 0.6, a: 0.015 * M * ak },     // triceps
      { y: -0.015, th: out, sy: 0.055, st: 0.9, a: 0.012 * M * ak },       // deltoid
      { y: -(u + 0.07), th: out * 0.5, sy: 0.05, st: 0.5, a: 0.011 * M * ak }, // forearm
      { y: -0.075, th: out * 0.8, sy: 0.012, st: 0.6, a: -0.006 * M },             // deltoid insertion
      { y: -(u - 0.02), th: 0, sy: 0.02, st: 0.5, a: -0.006 * M },                 // elbow crease
      { y: -(u + 0.04), th: out * 1.4, sy: 0.04, st: 0.35, a: 0.008 * M * ak },     // brachioradialis
    ];
    const geo = loftGeometry({ y0: -(u + f + 0.01), y1: 0.075, rings: 48, seg: 32, profile: (y) => { const [r] = pf(y); return [r, r * 0.96]; }, bumps: ab,
      center: (y) => [side * sstep(-0.05, 0.07, y) * -0.012, 0] });
    geo.translate(sh.x, sh.y, sh.z);
    const shB = bi(S + 'Sh'), elB = bi(S + 'El'), haB = bi(S + 'Hand');
    rig.parts[S + 'Arm'] = addSkinned(geo, mats.arm(side), (x, y) => {
      const ry = y - sh.y;
      const tEl = 1 - sstep(-u - 0.035, -u + 0.035, ry);
      const tHand = 1 - sstep(-(u + f) - 0.02, -(u + f) + 0.03, ry);
      const tChest = sstep(0.02, 0.08, ry) * 0.45;
      return [[shB, Math.max(0, 1 - tEl - tChest)], [cb, tChest], [elB, tEl * (1 - tHand)], [haB, tHand * tEl]];
    });
    const fist = buildFist(side, mats.hand(side), d.handK, { glove: mats.cuff ? mats.cuff(side) : null });
    J[S + 'Hand'].add(fist);
  }

  // ---------- legs ----------
  const lk = d.legK;
  for (const side of [1, -1]) {
    const S = side > 0 ? 'l' : 'r';
    const hp = W(S + 'Hip');
    const t = d.thigh, s = d.shin;
    const inner = -Math.PI / 2 * side;
    const legKeys = [
      [0.07, 0.07 * lk], [0.03, 0.106 * lk], [-0.05, 0.116 * lk], [-0.18, 0.1 * lk], [-(t - 0.1), 0.081 * lk], [-(t - 0.02), 0.068 * lk], [-t, 0.066 * lk],
      [-(t + 0.07), 0.07 * lk], [-(t + 0.15), 0.074 * lk], [-(t + s * 0.65), 0.052 * lk], [-(t + s - 0.03), 0.043 * lk], [-(t + s + 0.01), 0.04 * lk],
    ];
    const pf = profileFn(legKeys);
    const lb = [
      { y: -0.2, th: 0.15 * side, sy: 0.08, st: 0.5, a: 0.014 * M * lk },
      { y: -(t - 0.07), th: inner * 0.55, sy: 0.045, st: 0.35, a: 0.012 * M * lk },
      { y: -0.22, th: Math.PI, sy: 0.09, st: 0.6, a: 0.01 * M * lk },
      { y: -(t + 0.13), th: Math.PI, sy: 0.07, st: 0.6, a: 0.022 * M * lk },
      { y: -(t + 0.13), th: Math.PI + inner * 0.3, sy: 0.06, st: 0.4, a: 0.008 * M * lk },
      { y: -t, th: 0, sy: 0.025, st: 0.35, a: 0.01 },
    ];
    const geo = loftGeometry({ y0: -(t + s + 0.01), y1: 0.07, rings: 52, seg: 32, profile: (y) => { const [r] = pf(y); return [r * 0.95, r * 1.04]; }, bumps: lb,
      center: (y) => [side * sstep(-0.1, 0.07, y) * -0.012, sstep(-0.1, 0.05, y) * -0.006] });
    geo.translate(hp.x, hp.y, hp.z);
    const hpB = bi(S + 'Hip'), knB = bi(S + 'Knee');
    rig.parts[S + 'Leg'] = addSkinned(geo, mats.leg(side), (x, y) => {
      const ry = y - hp.y;
      const tKn = 1 - sstep(-t - 0.04, -t + 0.04, ry);
      const tH = sstep(-0.02, 0.07, ry) * 0.4;
      return [[hpB, Math.max(0, 1 - tKn - tH)], [hb, tH], [knB, tKn]];
    });
    J[S + 'Foot'].add(buildFoot(mats.foot(side), d.footK, { sole: mats.sole, cuff: mats.bootCuff ? mats.bootCuff(side) : null }));
  }

  // ---------- head ----------
  rig.face = buildHead(rig, spec.head || {}, { skeleton, bones, bi, addSkinned });

  if (spec.decorate) spec.decorate(rig, { THREE, J, d, mats });
  root.scale.setScalar(d.scale);
  rig.collectFlashMaterials();
  return rig;
}
