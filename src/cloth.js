// Verlet cloth for capes: pinned to the chest bone, collides with the body
// and floor, simulated in world space and drawn in the rig's local space.
import * as THREE from 'three';

const V = THREE.Vector3;

export class Cloth {
  constructor(rig, { width = 0.62, length = 1.25, cols = 9, rows = 13, material, anchorY = 0.2, anchorZ = -0.13, flare = 0.4 }) {
    this.rig = rig;
    const s = rig.dims.scale;
    this.cols = cols; this.rows = rows;
    this.dx = width * s / (cols - 1); this.dy = length * s / (rows - 1);
    this.flare = flare;
    this.anchors = [];
    for (let c = 0; c < cols; c++) {
      const t = c / (cols - 1) - 0.5;
      // anchors sweep around the back of the shoulders
      this.anchors.push(new V(t * width, anchorY - Math.abs(t) * 0.04, anchorZ - (0.25 - t * t) * 0.12 + 0.03));
    }
    const n = cols * rows;
    this.p = Array.from({ length: n }, () => new V());
    this.q = Array.from({ length: n }, () => new V());
    this.geo = new THREE.PlaneGeometry(1, 1, cols - 1, rows - 1);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    rig.root.add(this.mesh);
    this.inited = false;
    this.inv = new THREE.Matrix4();
    this.tmp = new V(); this.tmp2 = new V();
    this.lastAnchor = new V();
  }

  anchorWorld(c, out) { return this.rig.J.chest.localToWorld(out.copy(this.anchors[c])); }

  reset() {
    const a = new V();
    for (let c = 0; c < this.cols; c++) {
      this.anchorWorld(c, a);
      const back = this.backDir();
      for (let r = 0; r < this.rows; r++) {
        const i = r * this.cols + c;
        this.p[i].copy(a).addScaledVector(back, r * this.dy * 0.15).add(new V(0, -r * this.dy * 0.98, 0));
        this.q[i].copy(this.p[i]);
      }
    }
    this.inited = true;
  }

  backDir() {
    const q = new THREE.Quaternion();
    this.rig.J.chest.getWorldQuaternion(q);
    return new V(0, 0, -1).applyQuaternion(q).setY(0).normalize();
  }

  colliders() {
    const J = this.rig.J, s = this.rig.dims.scale, d = this.rig.dims;
    const w = (b, y = 0) => b.localToWorld(new V(0, y, 0));
    const r = 0.17 * s * d.chestK * d.depthK;
    return [
      [w(J.hips, -0.05), w(J.chest, 0.22), r],
      [w(J.lHip), w(J.lKnee), 0.1 * s * d.legK], [w(J.rHip), w(J.rKnee), 0.1 * s * d.legK],
      [w(J.lKnee), w(J.lFoot), 0.08 * s * d.legK], [w(J.rKnee), w(J.rFoot), 0.08 * s * d.legK],
    ];
  }

  update(dt) {
    if (dt <= 0) return;
    const a = this.tmp;
    this.anchorWorld(Math.floor(this.cols / 2), a);
    if (!this.inited || a.distanceTo(this.lastAnchor) > 1.5) this.reset();
    this.lastAnchor.copy(a);
    const steps = Math.min(4, Math.max(1, Math.ceil(dt / (1 / 90))));
    const h = Math.min(dt, 1 / 30) / steps;
    const grav = -11 * h * h;
    const cols = this.colliders();
    const P = this.p, Q = this.q, C = this.cols, Rn = this.rows;
    const t = performance.now() * 0.001;
    for (let s = 0; s < steps; s++) {
      for (let i = C; i < P.length; i++) {
        const p = P[i], q = Q[i];
        const vx = (p.x - q.x) * 0.985, vy = (p.y - q.y) * 0.985, vz = (p.z - q.z) * 0.985;
        q.copy(p);
        p.x += vx + Math.sin(t * 2.1 + i * 0.3) * 0.00004; p.y += vy + grav; p.z += vz + Math.cos(t * 1.7 + i) * 0.00004;
      }
      for (let c = 0; c < C; c++) { this.anchorWorld(c, P[c]); Q[c].copy(P[c]); }
      for (let it = 0; it < 5; it++) {
        for (let r = 0; r < Rn; r++) for (let c = 0; c < C; c++) {
          const i = r * C + c;
          const flare = 1 + this.flare * (r / (Rn - 1));
          if (c < C - 1) this.solve(i, i + 1, this.dx * flare, r === 0);
          if (r < Rn - 1) this.solve(i, i + C, this.dy, r === 0);
          if (r < Rn - 2) this.solve(i, i + 2 * C, this.dy * 2, r === 0, 0.3);
        }
        for (let i = C; i < P.length; i++) {
          const p = P[i];
          for (const [s0, s1, rad] of cols) this.collide(p, s0, s1, rad + 0.03);
          if (p.y < 0.02) p.y = 0.02;
        }
      }
    }
    // write geometry in root-local space
    this.inv.copy(this.rig.root.matrixWorld).invert();
    const pos = this.geo.attributes.position;
    for (let i = 0; i < P.length; i++) { a.copy(P[i]).applyMatrix4(this.inv); pos.setXYZ(i, a.x, a.y, a.z); }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  solve(i, j, rest, pinA, k = 1) {
    const a = this.p[i], b = this.p[j];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    const diff = (d - rest) / d * k;
    if (pinA) { b.x -= dx * diff; b.y -= dy * diff; b.z -= dz * diff; return; }
    const h = diff * 0.5;
    a.x += dx * h; a.y += dy * h; a.z += dz * h;
    b.x -= dx * h; b.y -= dy * h; b.z -= dz * h;
  }

  collide(p, s0, s1, r) {
    const ab = this.tmp2.copy(s1).sub(s0);
    const dot = (p.x - s0.x) * ab.x + (p.y - s0.y) * ab.y + (p.z - s0.z) * ab.z;
    const t = Math.max(0, Math.min(1, dot / (ab.lengthSq() || 1)));
    const cx = s0.x + ab.x * t, cy = s0.y + ab.y * t, cz = s0.z + ab.z * t;
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    const d = Math.hypot(dx, dy, dz);
    if (d < r && d > 1e-6) { const k = r / d; p.set(cx + dx * k, cy + dy * k, cz + dz * k); }
  }
}
