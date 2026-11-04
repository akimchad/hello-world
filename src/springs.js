// Secondary motion for imported models: capes, hair and loose gear simulated as spring-bone
// chains. Each simulated bone's child is a Verlet particle in world space (so the fighter's
// own movement gives the cloth its inertia), pulled by gravity, damped by air drag, nudged by
// wind, sprung back toward the animated pose, kept at bone length and pushed out of capsules
// around the torso and legs; the bone is then turned to point at its particle.
import * as THREE from 'three';

const V = THREE.Vector3, Q = THREE.Quaternion;
const _a = new V(), _b = new V(), _c = new V(), _d = new V(), _e = new V(), _f = new V(), _q = new Q(), _q2 = new Q();

// cape cloth hangs heavy and drapes; hair is lighter but springier
export const CLOTH = { stiff: 3, drag: 2.2, gravity: 7.5, wind: 0.9, inertia: 1, back: true };
export const HAIR = { stiff: 9, drag: 4, gravity: 3, wind: 0.35, inertia: 0.8 };

export class SpringBones {
  // groups: [{ bones: [Bone...] (parents before children), params }], capsules: () => [{ a, b, r }]
  constructor(root, groups, capsules) {
    this.root = root;
    this.capsules = capsules;
    this.links = [];
    for (const g of groups) for (const b of g.bones) {
      const kid = b.children.filter((c) => c.isBone).sort((x, y) => count(y) - count(x))[0];
      if (!kid) continue;
      // zero-length links (control bones sitting on their child) have no direction to swing:
      // turning them from a zero vector spins them at random, which threw Gamora's hair upward
      const len = kid.position.length() * worldScale(b);
      if (len < 0.01) continue;
      this.links.push({ b, kid, rest: b.quaternion.clone(), len, p: new V(), prev: new V(), init: false, P: g.params });
    }
    this.t = 0;
  }

  update(dt) {
    if (!this.links.length || dt <= 0) return;
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    for (const l of this.links) l.b.quaternion.copy(l.rest); // back to the animated (rest) pose
    this.root.updateMatrixWorld(true);
    const caps = this.capsules();
    // capes stay behind the body: the facing direction, flattened, from the root's rotation
    const fwd = _e.set(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(_q)); fwd.y = 0; fwd.normalize();
    const fx = fwd.x, fz = fwd.z;
    const wind = _d.set(Math.sin(this.t * 1.3) * 0.6 + Math.sin(this.t * 3.7) * 0.25, 0, Math.cos(this.t * 0.9) * 0.5);
    for (const l of this.links) {
      const P = l.P;
      l.b.updateWorldMatrix(true, false);
      const head = l.b.getWorldPosition(_a);
      const goal = l.kid.getWorldPosition(_b); // where the animation alone puts the child
      if (!l.init || l.p.distanceToSquared(goal) > 4) { l.p.copy(goal); l.prev.copy(goal); l.init = true; }
      // Verlet step: inertia (damped by drag), gravity, wind, spring toward the animated pose
      const vel = _c.copy(l.p).sub(l.prev).multiplyScalar(Math.max(0, 1 - P.drag * dt) * P.inertia);
      l.prev.copy(l.p);
      l.p.add(vel);
      l.p.y -= P.gravity * dt * dt;
      l.p.addScaledVector(wind, P.wind * dt * dt);
      l.p.lerp(goal, 1 - Math.exp(-P.stiff * dt));
      // keep the bone's length, then stay outside the body
      const len = l.len || head.distanceTo(goal);
      l.p.sub(head).setLength(len).add(head);
      for (const c of caps) pushOut(l.p, c);
      // back-plane: cloth may swing out sideways and up, but never further forward than the
      // animated pose puts it (plus a little slack)
      if (P.back) { const over = (l.p.x - goal.x) * fx + (l.p.z - goal.z) * fz - 0.08; if (over > 0) { l.p.x -= fx * over; l.p.z -= fz * over; } }
      l.p.sub(head).setLength(len).add(head);
      // turn the bone so its child sits on the particle
      const from = goal.sub(head), to = _c.copy(l.p).sub(head);
      if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) continue;
      from.normalize(); to.normalize();
      const dq = _q.setFromUnitVectors(from, to);
      const wq = l.b.getWorldQuaternion(_q2);
      const pq = l.b.parent.getWorldQuaternion(new Q()).invert();
      l.b.quaternion.copy(pq.multiply(dq.multiply(wq)));
      l.b.updateMatrixWorld(true);
    }
  }
}

function count(b) { let n = 0; b.traverse((o) => { if (o.isBone) n++; }); return n; }
function worldScale(b) { b.updateWorldMatrix(true, false); return b.getWorldScale(new V()).x; }

// push p out of the capsule segment a–b of radius r
function pushOut(p, { a, b, r }) {
  const ab = _e.copy(b).sub(a), t = THREE.MathUtils.clamp(_f.copy(p).sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
  const closest = ab.multiplyScalar(t).add(a);
  const off = _f.copy(p).sub(closest), dist = off.length();
  if (dist < r && dist > 1e-6) p.copy(closest).addScaledVector(off, r / dist);
}

// collect bone chains whose names match `re` (whole subtrees, parents first)
export function bonesMatching(model, re) {
  const out = [];
  model.traverse((o) => { if (o.isBone && re.test(o.name)) out.push(o); });
  return out;
}

// Give an unrigged cape mesh (skinned rigidly to the spine) a grid of hanging bones: `cols`
// chains of `rows` bones from its top edge, parented to `anchor`, and re-skin each vertex
// bilinearly onto its nearest chains and rows. Returns the new bones, parents first.
export function rigCape(mesh, anchor, cols = 3, rows = 4) {
  mesh.updateMatrixWorld(true);
  mesh.geometry = mesh.geometry.clone(); // the source geometry is shared by every clone
  const geo = mesh.geometry, pos = geo.attributes.position, n = pos.count;
  const world = [], v = new V();
  const box = new THREE.Box3();
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, v); // skinned rest position, mesh space
    const w = v.clone().applyMatrix4(mesh.matrixWorld);
    world.push(w); box.expandByPoint(w);
  }
  const top = box.max.y, bot = box.min.y, H = top - bot;
  const zMid = (box.min.z + box.max.z) / 2;
  // column x positions across the cape, row heights down it
  const xs = [...Array(cols)].map((_, c) => THREE.MathUtils.lerp(box.min.x, box.max.x, (c + 0.5) / cols));
  const ys = [...Array(rows + 1)].map((_, r) => top - (H * r) / rows);
  const bones = [], grid = [];
  for (let c = 0; c < cols; c++) {
    const col = [];
    let parent = null;
    for (let r = 0; r <= rows; r++) {
      const bone = new THREE.Bone(); bone.name = `cape_gen_${c}_${r}`;
      const wp = new V(xs[c], ys[r], zMid);
      if (!parent) { anchor.add(bone); anchor.updateWorldMatrix(true, false); bone.position.copy(anchor.worldToLocal(wp.clone())); }
      else { parent.add(bone); parent.updateWorldMatrix(true, false); bone.position.copy(parent.worldToLocal(wp.clone())); }
      bone.updateMatrixWorld(true);
      col.push(bone); bones.push(bone); parent = bone;
    }
    grid.push(col);
  }
  // weights: two nearest columns × two nearest rows
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const index = new Map(bones.map((b, i) => [b, i]));
  for (let i = 0; i < n; i++) {
    const w = world[i];
    const fc = THREE.MathUtils.clamp((w.x - box.min.x) / Math.max(1e-6, box.max.x - box.min.x) * cols - 0.5, 0, cols - 1);
    const fr = THREE.MathUtils.clamp((top - w.y) / Math.max(1e-6, H) * rows, 0, rows);
    const c0 = Math.floor(fc), c1 = Math.min(cols - 1, c0 + 1), tc = fc - c0;
    const r0 = Math.floor(fr), r1 = Math.min(rows, r0 + 1), tr = fr - r0;
    const ws = [[grid[c0][r0], (1 - tc) * (1 - tr)], [grid[c1][r0], tc * (1 - tr)], [grid[c0][r1], (1 - tc) * tr], [grid[c1][r1], tc * tr]];
    ws.forEach(([b, wt], k) => { si[i * 4 + k] = index.get(b); sw[i * 4 + k] = wt; });
  }
  // rebind: vertices back into mesh space at the current (rest) pose, inverses from the new bones.
  // Normals follow their vertex's dominant old bone (recomputing them would cancel out on a
  // thin two-sided cape and turn it black)
  const inv = mesh.matrixWorld.clone().invert();
  const nrm = geo.attributes.normal, osi = geo.attributes.skinIndex, osw = geo.attributes.skinWeight, sk = mesh.skeleton;
  const nmCache = new Map(), m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    if (nrm && osi && sk) {
      let best = 0; for (let k = 1; k < 4; k++) if (osw.getComponent(i, k) > osw.getComponent(i, best)) best = k;
      const bi = osi.getComponent(i, best);
      if (!nmCache.has(bi)) { m4.multiplyMatrices(sk.bones[bi].matrixWorld, sk.boneInverses[bi]).premultiply(inv).multiply(mesh.bindMatrix); nmCache.set(bi, new THREE.Matrix3().getNormalMatrix(m4)); }
      v.fromBufferAttribute(nrm, i).applyMatrix3(nmCache.get(bi)).normalize(); nrm.setXYZ(i, v.x, v.y, v.z);
    }
    const p = world[i].clone().applyMatrix4(inv); pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true; if (nrm) nrm.needsUpdate = true;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  mesh.bind(new THREE.Skeleton(bones), mesh.matrixWorld);
  return bones;
}
