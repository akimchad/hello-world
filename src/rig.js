// Articulated 3D hero rigs built from primitives, plus a pose library and a
// blending animator. The model faces +Z locally; +X is the hero's left side.
import * as THREE from 'three';

export const JOINTS = ['hips', 'spine', 'chest', 'head', 'lSh', 'lEl', 'rSh', 'rEl', 'lHip', 'lKnee', 'rHip', 'rKnee'];

// ---------- pose library ----------
const Z = [0, 0, 0];
function P(o) {
  const p = { hipY: 0, lie: 0, bodyX: 0, bodyY: 0, cape: 0 };
  for (const j of JOINTS) p[j] = o[j] ? o[j].slice() : Z.slice();
  for (const k of ['hipY', 'lie', 'bodyX', 'bodyY', 'cape']) if (o[k] !== undefined) p[k] = o[k];
  return p;
}

const LEGS_STANCE = { lHip: [-0.45, 0, 0.12], lKnee: [0.6, 0, 0], rHip: [0.28, 0, -0.12], rKnee: [0.5, 0, 0] };
const LEGS_CROUCH = { lHip: [-1.45, 0, 0.25], lKnee: [2.1, 0, 0], rHip: [-0.6, 0, -0.25], rKnee: [2.0, 0, 0] };
const GUARD = { lSh: [-1.0, 0, 0.35], lEl: [-1.75, 0, 0], rSh: [-0.75, 0, -0.3], rEl: [-2.0, 0, 0] };

export const POSES = {
  idle: P({ spine: [0.12, -0.15, 0], chest: [0.05, -0.1, 0], head: [-0.08, 0.25, 0], ...GUARD, ...LEGS_STANCE }),
  crouch: P({ spine: [0.45, -0.1, 0], head: [-0.4, 0.2, 0], ...GUARD, ...LEGS_CROUCH }),
  block: P({ spine: [0.3, -0.1, 0], head: [0.15, 0.2, 0], lSh: [-1.75, 0, 0.55], lEl: [-2.2, 0, 0], rSh: [-1.7, 0, -0.55], rEl: [-2.2, 0, 0], ...LEGS_STANCE }),
  crouchBlock: P({ spine: [0.55, -0.1, 0], head: [-0.1, 0.2, 0], lSh: [-1.75, 0, 0.55], lEl: [-2.2, 0, 0], rSh: [-1.7, 0, -0.55], rEl: [-2.2, 0, 0], ...LEGS_CROUCH }),
  jump: P({ spine: [0.25, 0, 0], head: [-0.2, 0.2, 0], ...GUARD, lHip: [-1.3, 0, 0.1], lKnee: [1.8, 0, 0], rHip: [-0.9, 0, -0.1], rKnee: [1.5, 0, 0] }),
  fall: P({ spine: [0.1, 0, 0], head: [-0.1, 0.2, 0], lSh: [-1.3, 0, 0.6], lEl: [-1.2, 0, 0], rSh: [-1.0, 0, -0.6], rEl: [-1.4, 0, 0], lHip: [-0.6, 0, 0.1], lKnee: [0.9, 0, 0], rHip: [-0.2, 0, -0.1], rKnee: [0.6, 0, 0] }),
  // attacks: each has a windup and a strike pose
  jabW: P({ spine: [0.15, 0.1, 0], head: [-0.1, 0.1, 0], lSh: [-1.2, 0, 0.3], lEl: [-1.9, 0, 0], rSh: [-0.8, 0, -0.3], rEl: [-2.0, 0, 0], ...LEGS_STANCE }),
  jab: P({ spine: [0.2, -0.45, 0], head: [-0.1, 0.45, 0], lSh: [-1.6, 0, 0.05], lEl: [-0.08, 0, 0], rSh: [-0.8, 0, -0.3], rEl: [-2.1, 0, 0], ...LEGS_STANCE }),
  crossW: P({ spine: [0.15, -0.4, 0], head: [-0.1, 0.4, 0], lSh: [-1.1, 0, 0.4], lEl: [-1.8, 0, 0], rSh: [-0.5, 0, -0.5], rEl: [-1.9, 0, 0], ...LEGS_STANCE }),
  cross: P({ spine: [0.25, 0.45, 0], head: [-0.15, -0.2, 0], lSh: [-1.0, 0, 0.4], lEl: [-1.9, 0, 0], rSh: [-1.6, 0, -0.05], rEl: [-0.08, 0, 0], lHip: [-0.6, 0, 0.12], lKnee: [0.7, 0, 0], rHip: [0.45, 0, -0.12], rKnee: [0.2, 0, 0] }),
  kickW: P({ spine: [-0.1, 0.2, 0], head: [0.05, 0.1, 0], ...GUARD, lHip: [-0.1, 0, 0.1], lKnee: [0.3, 0, 0], rHip: [-1.4, 0, -0.2], rKnee: [2.0, 0, 0] }),
  kick: P({ spine: [-0.35, 0.3, 0], head: [0.25, 0.1, 0], ...GUARD, lHip: [0.1, 0, 0.1], lKnee: [0.2, 0, 0], rHip: [-1.65, 0, -0.15], rKnee: [0.05, 0, 0] }),
  hookW: P({ spine: [0.1, -0.6, 0], head: [-0.1, 0.5, 0], lSh: [-1.1, 0, 0.4], lEl: [-1.8, 0, 0], rSh: [-0.6, 0, -1.3], rEl: [-1.3, 0, 0], lHip: [-0.3, 0, 0.12], lKnee: [0.5, 0, 0], rHip: [0.4, 0, -0.12], rKnee: [0.6, 0, 0] }),
  hook: P({ spine: [0.35, 0.7, 0], head: [-0.25, -0.3, 0], lSh: [-0.7, 0, 0.5], lEl: [-1.6, 0, 0], rSh: [-1.55, 0, -0.1], rEl: [-0.15, 0, 0], lHip: [-0.9, 0, 0.12], lKnee: [0.9, 0, 0], rHip: [0.6, 0, -0.12], rKnee: [0.15, 0, 0] }),
  overheadW: P({ spine: [-0.3, -0.2, 0], head: [0.2, 0.2, 0], lSh: [-2.6, 0, 0.3], lEl: [-0.8, 0, 0], rSh: [-3.0, 0, -0.2], rEl: [-0.7, 0, 0], ...LEGS_STANCE }),
  overhead: P({ spine: [0.6, 0.2, 0], head: [-0.4, 0, 0], lSh: [-1.0, 0, 0.3], lEl: [-0.6, 0, 0], rSh: [-1.0, 0, -0.1], rEl: [-0.1, 0, 0], lHip: [-0.9, 0, 0.12], lKnee: [1.0, 0, 0], rHip: [0.5, 0, -0.12], rKnee: [0.3, 0, 0] }),
  sweepW: P({ spine: [0.5, -0.2, 0], head: [-0.4, 0.2, 0], ...GUARD, ...LEGS_CROUCH }),
  sweep: P({ spine: [0.3, 0.3, 0], head: [-0.2, 0.0, 0], lSh: [-0.9, 0, 0.6], lEl: [-1.5, 0, 0], rSh: [-0.4, 0, -0.7], rEl: [-1.4, 0, 0], lHip: [-1.6, 0, 0.3], lKnee: [2.2, 0, 0], rHip: [-1.5, 0, -0.35], rKnee: [0.05, 0, 0] }),
  upperW: P({ spine: [0.55, -0.3, 0], head: [-0.4, 0.3, 0], lSh: [-1.0, 0, 0.35], lEl: [-1.7, 0, 0], rSh: [-0.1, 0, -0.4], rEl: [-1.1, 0, 0], ...LEGS_CROUCH }),
  upper: P({ spine: [-0.15, 0.4, 0], head: [0.25, -0.2, 0], lSh: [-0.7, 0, 0.5], lEl: [-1.6, 0, 0], rSh: [-2.95, 0, -0.1], rEl: [-0.35, 0, 0], lHip: [-0.2, 0, 0.1], lKnee: [0.2, 0, 0], rHip: [0.2, 0, -0.1], rKnee: [0.4, 0, 0], hipY: 0.05 }),
  airKick: P({ spine: [-0.2, 0.2, 0], head: [0.1, 0.1, 0], ...GUARD, lHip: [-1.0, 0, 0.1], lKnee: [1.7, 0, 0], rHip: [-1.35, 0, -0.1], rKnee: [0.05, 0, 0] }),
  diveKick: P({ spine: [0.3, 0.3, 0], head: [-0.3, 0, 0], lSh: [-0.6, 0, 0.8], lEl: [-1.2, 0, 0], rSh: [-0.5, 0, -0.8], rEl: [-1.2, 0, 0], lHip: [-1.3, 0, 0.1], lKnee: [1.9, 0, 0], rHip: [-0.75, 0, -0.1], rKnee: [0.0, 0, 0] }),
  castW: P({ spine: [0.1, -0.5, 0], head: [-0.1, 0.5, 0], lSh: [-1.2, 0, 0.3], lEl: [-1.6, 0, 0], rSh: [-0.5, 0, -0.6], rEl: [-1.4, 0, 0], ...LEGS_STANCE }),
  cast: P({ spine: [0.15, 0.45, 0], head: [-0.1, -0.2, 0], lSh: [-1.2, 0, 0.35], lEl: [-1.0, 0, 0], rSh: [-1.6, 0, 0.05], rEl: [-0.02, 0, 0], lHip: [-0.55, 0, 0.12], lKnee: [0.65, 0, 0], rHip: [0.4, 0, -0.12], rKnee: [0.35, 0, 0] }),
  castBoth: P({ spine: [0.15, 0, 0], head: [-0.1, 0, 0], lSh: [-1.57, 0, -0.15], lEl: [-0.02, 0, 0], rSh: [-1.57, 0, 0.15], rEl: [-0.02, 0, 0], lHip: [-0.6, 0, 0.12], lKnee: [0.7, 0, 0], rHip: [0.45, 0, -0.12], rKnee: [0.35, 0, 0] }),
  skyW: P({ spine: [-0.3, 0, 0], head: [0.4, 0, 0], lSh: [-0.6, 0, 0.6], lEl: [-0.4, 0, 0], rSh: [-2.6, 0, -0.3], rEl: [-0.4, 0, 0], ...LEGS_STANCE }),
  sky: P({ spine: [-0.4, 0, 0], head: [0.5, 0, 0], lSh: [-0.5, 0, 0.9], lEl: [-0.3, 0, 0], rSh: [-3.1, 0, -0.1], rEl: [-0.05, 0, 0], lHip: [0, 0, 0.18], lKnee: [0.1, 0, 0], rHip: [0, 0, -0.18], rKnee: [0.1, 0, 0], hipY: 0.03 }),
  smashW: P({ spine: [-0.4, 0, 0], head: [0.3, 0, 0], lSh: [-3.0, 0, 0.3], lEl: [-0.5, 0, 0], rSh: [-3.0, 0, -0.3], rEl: [-0.5, 0, 0], lHip: [0, 0, 0.2], lKnee: [0.2, 0, 0], rHip: [0, 0, -0.2], rKnee: [0.2, 0, 0], hipY: 0.03 }),
  smash: P({ spine: [0.9, 0, 0], head: [-0.6, 0, 0], lSh: [-1.0, 0, -0.1], lEl: [-0.1, 0, 0], rSh: [-1.0, 0, 0.1], rEl: [-0.1, 0, 0], lHip: [-1.3, 0, 0.3], lKnee: [1.8, 0, 0], rHip: [-0.4, 0, -0.3], rKnee: [1.4, 0, 0] }),
  dash: P({ spine: [0.55, 0.1, 0], head: [-0.4, 0, 0], lSh: [-1.5, 0, 0.3], lEl: [-1.3, 0, 0], rSh: [0.4, 0, -0.4], rEl: [-0.6, 0, 0], lHip: [-1.0, 0, 0.1], lKnee: [0.8, 0, 0], rHip: [0.7, 0, -0.1], rKnee: [0.4, 0, 0] }),
  slashW: P({ spine: [0.1, -0.7, 0], head: [-0.1, 0.6, 0], lSh: [-1.0, 0, 0.4], lEl: [-1.6, 0, 0], rSh: [-2.2, 0, -1.2], rEl: [-0.8, 0, 0], ...LEGS_STANCE }),
  slash: P({ spine: [0.35, 0.8, 0], head: [-0.2, -0.4, 0], lSh: [-0.6, 0, 0.6], lEl: [-1.4, 0, 0], rSh: [-1.1, 0, 0.2], rEl: [-0.1, 0, 0], lHip: [-0.9, 0, 0.12], lKnee: [0.9, 0, 0], rHip: [0.6, 0, -0.12], rKnee: [0.15, 0, 0] }),
  charge: P({ spine: [-0.35, 0, 0], head: [0.35, 0, 0], lSh: [-0.4, 0, 1.25], lEl: [-0.6, 0, 0], rSh: [-0.4, 0, -1.25], rEl: [-0.6, 0, 0], lHip: [-0.2, 0, 0.25], lKnee: [0.5, 0, 0], rHip: [0.15, 0, -0.25], rKnee: [0.5, 0, 0], cape: 0.6 }),
  hit: P({ spine: [-0.5, 0.2, 0], head: [-0.45, 0, 0], lSh: [-0.5, 0, 0.7], lEl: [-0.7, 0, 0], rSh: [-0.3, 0, -0.7], rEl: [-0.7, 0, 0], lHip: [-0.2, 0, 0.12], lKnee: [0.6, 0, 0], rHip: [0.35, 0, -0.12], rKnee: [0.5, 0, 0] }),
  hitLow: P({ spine: [0.6, 0, 0], head: [-0.2, 0, 0], lSh: [-0.6, 0, 0.5], lEl: [-0.8, 0, 0], rSh: [-0.6, 0, -0.5], rEl: [-0.8, 0, 0], lHip: [-0.9, 0, 0.15], lKnee: [1.3, 0, 0], rHip: [-0.1, 0, -0.15], rKnee: [1.0, 0, 0] }),
  airHit: P({ spine: [-0.6, 0, 0], head: [-0.5, 0, 0], lSh: [-2.2, 0, 0.9], lEl: [-0.4, 0, 0], rSh: [-2.0, 0, -0.9], rEl: [-0.4, 0, 0], lHip: [-0.9, 0, 0.1], lKnee: [1.1, 0, 0], rHip: [-0.3, 0, -0.1], rKnee: [0.8, 0, 0], bodyX: -0.6 }),
  down: P({ spine: [0.05, 0, 0], head: [0.15, 0.4, 0], lSh: [-0.2, 0, 1.3], lEl: [-0.3, 0, 0], rSh: [-0.3, 0, -1.1], rEl: [-0.6, 0, 0], lHip: [-0.1, 0, 0.2], lKnee: [0.3, 0, 0], rHip: [-0.5, 0, -0.15], rKnee: [0.9, 0, 0], lie: 1 }),
  getup: P({ spine: [0.7, 0, 0], head: [-0.3, 0, 0], lSh: [-0.6, 0, 0.5], lEl: [-0.8, 0, 0], rSh: [-0.6, 0, -0.5], rEl: [-0.8, 0, 0], ...LEGS_CROUCH }),
  victory: P({ spine: [-0.1, 0.2, 0], head: [0.15, -0.1, 0], lSh: [-0.25, 0, 0.55], lEl: [-1.9, 0, 0], rSh: [-3.0, 0, -0.15], rEl: [-0.25, 0, 0], lHip: [0, 0, 0.16], lKnee: [0.05, 0, 0], rHip: [0, 0, -0.16], rKnee: [0.05, 0, 0] }),
  taunt: P({ spine: [-0.1, 0, 0], head: [0.1, 0, 0], lSh: [-0.2, 0, 0.45], lEl: [-1.9, 0, 0], rSh: [-0.2, 0, -0.45], rEl: [-1.9, 0, 0], lHip: [0, 0, 0.18], lKnee: [0.05, 0, 0], rHip: [0, 0, -0.18], rKnee: [0.05, 0, 0] }),
};

export function lerpPose(a, b, t, out = null) {
  const o = out || P({});
  for (const j of JOINTS) {
    const x = a[j], y = b[j], r = o[j];
    r[0] = x[0] + (y[0] - x[0]) * t; r[1] = x[1] + (y[1] - x[1]) * t; r[2] = x[2] + (y[2] - x[2]) * t;
  }
  for (const k of ['hipY', 'lie', 'bodyX', 'bodyY', 'cape']) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}
export function clonePose(p) { return lerpPose(p, p, 0); }
export function addTo(p, joint, x = 0, y = 0, z = 0) { p[joint][0] += x; p[joint][1] += y; p[joint][2] += z; return p; }

// ---------- texture helpers ----------
export function canvasTexture(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// ---------- rig ----------
export function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.05, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, map: o.map ?? null, side: o.side ?? THREE.FrontSide });
}

export class Rig {
  constructor(root, body, J, dims) {
    this.root = root; this.body = body; this.J = J; this.dims = dims;
    this.cur = clonePose(POSES.idle);
    this.capeGroup = null;
    this.cloths = [];
    this.parts = {};
    this.flashMats = [];
  }

  collectFlashMaterials() {
    const all = [];
    this.root.traverse((o) => { if (o.isMesh && o.material) for (const m of [].concat(o.material)) if (m.emissive) all.push(m); });
    this.flashMats = [...new Set(all)];
    this.baseEmissive = this.flashMats.map((mm) => mm.emissive.clone());
    this.baseEI = this.flashMats.map((mm) => mm.emissiveIntensity);
  }

  // after the root transform is final for this frame: face + cloth
  lateUpdate(dt) {
    this.applyVoid(dt);
    if (this.face) this.face.update(dt);
    if (this.hairSims) for (const h of this.hairSims) h(dt);
    if (this.cloths.length) {
      this.root.updateMatrixWorld(true);
      for (const c of this.cloths) c.update(dt);
    }
  }

  setExpression(name) { if (this.face) this.face.set(name); }

  // darken every material toward a shadow form (Sentry's Void)
  setVoid(v) { this.voidTarget = v; }
  applyVoid(dt) {
    const target = this.voidTarget || 0;
    if (this.voidAmt === undefined) this.voidAmt = 0;
    if (this.voidAmt === target && !this.voidMats) return;
    if (!this.voidMats) {
      const all = new Set();
      this.root.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.color && all.add(m)); });
      this.voidMats = [...all].map((m) => ({ m, c: m.color.clone(), sh: m.sheen || 0, cc: m.clearcoat || 0, env: m.envMapIntensity ?? 1 }));
    }
    this.voidAmt += (target - this.voidAmt) * Math.min(1, dt * 5);
    if (Math.abs(this.voidAmt - target) < 0.003) this.voidAmt = target;
    const k = this.voidAmt;
    const dark = new THREE.Color(0x07040c);
    for (const { m, c, sh, cc, env } of this.voidMats) {
      m.color.copy(c).lerp(dark, k * 0.96);
      if (m.sheen !== undefined) m.sheen = sh * (1 - k);
      if (m.clearcoat !== undefined) m.clearcoat = cc * (1 - k * 0.6);
      if (m.envMapIntensity !== undefined) m.envMapIntensity = env * (1 - k * 0.7);
    }
    if (this.face && this.face.eyeMat) { this.face.eyeMat.emissive.setRGB(k * 1.0, 0, k * 0.05); this.face.eyeMat.emissiveIntensity = 1 + k * 4; this.face.eyeMat.emissiveMap = k > 0.01 ? null : this.face.eyeMat.userData.emap; this.face.eyeMat.needsUpdate = this.face.eyeMat.userData.hadMap !== (k <= 0.01); this.face.eyeMat.userData.hadMap = k <= 0.01; }
  }

  // blend toward a target pose and apply it to the joints
  update(target, dt, rate = 16) {
    const k = 1 - Math.exp(-rate * dt);
    lerpPose(this.cur, target, k, this.cur);
    const c = this.cur, J = this.J, d = this.dims;
    for (const j of JOINTS) J[j].rotation.set(c[j][0], c[j][1], c[j][2]);
    // keep feet flat relative to the ground
    for (const s of ['l', 'r']) {
      J[s + 'Foot'].rotation.x = -(c.hips[0] + c[s + 'Hip'][0] + c[s + 'Knee'][0]) * (1 - c.lie);
    }
    // auto-ground: hips height from the most extended leg
    const drop = (s) => {
      const a = c.hips[0] + c[s + 'Hip'][0], b = c[s + 'Knee'][0];
      return Math.cos(c[s + 'Hip'][2]) * (d.thigh * Math.cos(a) + d.shin * Math.cos(a + b));
    };
    const legDrop = Math.max(drop('l'), drop('r')) + (d.groundOffset ?? 0.06);
    const standY = legDrop + c.hipY;
    J.hips.position.y = standY * (1 - c.lie) + 0.16 * c.lie;
    this.body.rotation.x = -Math.PI / 2 * c.lie + c.bodyX;
    this.body.rotation.y = c.bodyY;
    this.body.position.z = -0.0 * c.lie;
    if (this.capeGroup) this.capeGroup.rotation.x = 0.12 + c.cape + Math.max(0, -c.spine[0]) * 0.5;
  }

  flash(color, amount) {
    if (amount <= 0 && !this.flashing) return;
    this.flashing = amount > 0;
    for (let i = 0; i < this.flashMats.length; i++) {
      const mm = this.flashMats[i];
      if (amount > 0) { mm.emissive.copy(this.baseEmissive[i]).lerp(color, amount); mm.emissiveIntensity = Math.max(this.baseEI[i], amount * 1.4); }
      else { mm.emissive.copy(this.baseEmissive[i]); mm.emissiveIntensity = this.baseEI[i]; }
    }
  }

  worldOf(joint, offset = null) {
    const v = offset ? offset.clone() : new THREE.Vector3();
    this.J[joint].updateWorldMatrix(true, false);
    return this.J[joint].localToWorld(v);
  }
}
