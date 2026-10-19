// Visual effects: pooled additive particles, shockwave rings, lightning
// bolts, beams and a fixed pool of point lights (a fixed light count avoids
// shader recompiles mid-fight).
import * as THREE from 'three';

const MAX_P = 2400;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    // particles
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_P * 3);
    this.pCol = new Float32Array(MAX_P * 3);
    this.pSize = new Float32Array(MAX_P);
    this.pAlpha = new Float32Array(MAX_P);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    const pm = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if(r>0.5) discard;
          float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vC * (1.0 + a*1.5), a*vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, pm);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX_P; i++) this.parts.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), life: 0, max: 1, size: 1, g: 0, drag: 0, grow: 0 });
    this.next = 0;
    this.items = []; // rings, bolts, misc meshes with update fns
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 12, 2);
      l.position.set(0, -50, 0);
      scene.add(l);
      this.lights.push({ l, life: 0, max: 1, peak: 0 });
    }
  }

  setScale(h) { this.points.material.uniforms.uScale.value = h * 0.45; }

  emit(pos, o = {}) {
    const n = o.count ?? 12;
    const col = new THREE.Color(o.color ?? 0xffffff);
    const col2 = o.color2 !== undefined ? new THREE.Color(o.color2) : null;
    for (let i = 0; i < n; i++) {
      const q = this.parts[this.next];
      this.next = (this.next + 1) % MAX_P;
      q.alive = true;
      q.p.copy(pos);
      if (o.jitter) q.p.add(new THREE.Vector3((Math.random() - 0.5) * o.jitter, (Math.random() - 0.5) * o.jitter, (Math.random() - 0.5) * o.jitter * 0.5));
      const sp = (o.speed ?? 5) * (0.35 + Math.random() * 0.65);
      if (o.dir) {
        q.v.copy(o.dir).normalize();
        const s = o.spread ?? 0.6;
        q.v.x += (Math.random() - 0.5) * s; q.v.y += (Math.random() - 0.5) * s; q.v.z += (Math.random() - 0.5) * s * 0.6;
        q.v.normalize().multiplyScalar(sp);
      } else {
        q.v.set(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.6).normalize().multiplyScalar(sp);
        if (o.up) q.v.y = Math.abs(q.v.y) + o.up;
      }
      q.c.copy(col);
      if (col2) q.c.lerp(col2, Math.random());
      q.max = q.life = (o.life ?? 0.4) * (0.6 + Math.random() * 0.6);
      q.size = (o.size ?? 0.25) * (0.6 + Math.random() * 0.8);
      q.g = o.gravity ?? 0;
      q.drag = o.drag ?? 2.5;
      q.grow = o.grow ?? 0;
    }
  }

  hitSpark(pos, color, power = 1, blocked = false) {
    if (blocked) {
      this.emit(pos, { count: 14, color: 0x9fd8ff, color2: 0xffffff, speed: 7, life: 0.22, size: 0.16, drag: 4 });
      this.ring(pos, 0x8fd0ff, 0.9, 0.18, 'face');
      return;
    }
    this.emit(pos, { count: Math.round(14 + 18 * power), color: 0xffffff, color2: color, speed: 9 * (0.7 + power * 0.4), life: 0.3, size: 0.2 + 0.08 * power, drag: 4, gravity: -6 });
    this.emit(pos, { count: 6, color, speed: 2, life: 0.18, size: 0.9 + power * 0.6, drag: 8 });
    this.ring(pos, color, 0.7 + power * 0.6, 0.2, 'face');
    this.flashLight(pos, color, 6 * power, 0.15);
  }

  dust(pos, n = 10) {
    this.emit(pos, { count: n, color: 0x8a7f73, color2: 0x4a443e, speed: 2.5, life: 0.6, size: 0.35, drag: 3, gravity: 0.6, up: 0.3, grow: 0.8 });
  }

  ring(pos, color, radius, life, kind = 'ground', thickness = 0.12) {
    const geo = new THREE.RingGeometry(0.8, 1, 48);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(pos);
    if (kind === 'ground') mesh.rotation.x = -Math.PI / 2;
    this.group.add(mesh);
    let t = 0;
    this.items.push({ mesh, update: (dt) => {
      t += dt; const k = t / life;
      const r = 0.1 + radius * (1 - Math.pow(1 - k, 3));
      mesh.scale.setScalar(r);
      m.opacity = 0.9 * (1 - k);
      return k < 1;
    } });
  }

  flashLight(pos, color, intensity, life) {
    let best = this.lights[0];
    for (const L of this.lights) if (L.life <= 0 || L.life < best.life) best = L;
    best.l.color.set(color); best.l.position.copy(pos); best.l.position.z += 0.6;
    best.life = best.max = life; best.peak = intensity;
  }

  bolt(from, to, color = 0x9fd8ff, life = 0.25, width = 0.12, branches = 3) {
    const pts = jagged(from, to, 5, from.distanceTo(to) * 0.12);
    const meshes = [];
    const addRibbon = (p, w, col, op) => {
      const geo = ribbon(p, w);
      const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, m); this.group.add(mesh); meshes.push(mesh);
    };
    addRibbon(pts, width * 3.2, color, 0.45);
    addRibbon(pts, width, 0xffffff, 1);
    for (let b = 0; b < branches; b++) {
      const i = 1 + Math.floor(Math.random() * (pts.length - 3));
      const a = pts[i];
      const end = a.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.2, -Math.random() * 1.4, 0));
      addRibbon(jagged(a, end, 3, 0.25), width * 0.6, color, 0.8);
    }
    let t = 0;
    this.items.push({ mesh: null, update: (dt) => {
      t += dt; const k = t / life;
      const flick = Math.random() > 0.25 ? 1 : 0.2;
      for (const m of meshes) m.material.opacity = (m.material.color.getHex() === 0xffffff ? 1 : 0.6) * (1 - k) * flick;
      if (k >= 1) { for (const m of meshes) { this.group.remove(m); m.geometry.dispose(); m.material.dispose(); } return false; }
      return true;
    } });
    this.flashLight(to.clone().lerp(from, 0.2), color, 14, life * 1.2);
  }

  // generic timed mesh (caller supplies update(k, dt)); removed and disposed after life
  timed(mesh, life, fn) {
    this.group.add(mesh);
    let t = 0;
    this.items.push({ mesh, update: (dt) => {
      t += dt; const k = Math.min(1, t / life);
      fn && fn(mesh, k, dt);
      return k < 1;
    } });
  }

  update(dt) {
    const P = this.parts;
    for (let i = 0; i < MAX_P; i++) {
      const q = P[i];
      const i3 = i * 3;
      if (!q.alive) { this.pAlpha[i] = 0; continue; }
      q.life -= dt;
      if (q.life <= 0) { q.alive = false; this.pAlpha[i] = 0; continue; }
      q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
      q.v.y += q.g * dt;
      q.p.addScaledVector(q.v, dt);
      const k = q.life / q.max;
      this.pPos[i3] = q.p.x; this.pPos[i3 + 1] = q.p.y; this.pPos[i3 + 2] = q.p.z;
      this.pCol[i3] = q.c.r; this.pCol[i3 + 1] = q.c.g; this.pCol[i3 + 2] = q.c.b;
      this.pSize[i] = q.size * (q.grow ? (1 + (1 - k) * q.grow * 2) : (0.4 + 0.6 * k));
      this.pAlpha[i] = Math.min(1, k * 1.6);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true;

    this.items = this.items.filter((it) => {
      const keep = it.update(dt);
      if (!keep && it.mesh) { this.group.remove(it.mesh); it.mesh.geometry && it.mesh.geometry.dispose(); if (it.mesh.material && it.mesh.material.dispose) it.mesh.material.dispose(); }
      return keep;
    });
    for (const L of this.lights) {
      if (L.life > 0) { L.life -= dt; L.l.intensity = L.peak * Math.max(0, L.life / L.max); }
      else L.l.intensity = 0;
    }
  }

  clear() {
    for (const q of this.parts) q.alive = false;
    for (const it of this.items) { if (it.mesh) this.group.remove(it.mesh); }
    // bolts remove themselves via update; force-finish them
    for (let i = 0; i < 5; i++) this.items = this.items.filter((it) => it.update(10));
    this.items = [];
    for (const L of this.lights) { L.life = 0; L.l.intensity = 0; }
  }
}

function jagged(a, b, depth, disp) {
  let pts = [a.clone(), b.clone()];
  let d = disp;
  for (let k = 0; k < depth; k++) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const mid = p.clone().lerp(q, 0.5);
      const dir = q.clone().sub(p);
      const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
      mid.addScaledVector(perp, (Math.random() - 0.5) * 2 * d);
      mid.z += (Math.random() - 0.5) * d * 0.5;
      out.push(p, mid);
    }
    out.push(pts[pts.length - 1]);
    pts = out; d *= 0.55;
  }
  return pts;
}

function ribbon(pts, w) {
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y; const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l * w * 0.5, ny = dx / l * w * 0.5;
    pos.push(a.x - nx, a.y - ny, a.z, a.x + nx, a.y + ny, a.z, b.x + nx, b.y + ny, b.z);
    pos.push(a.x - nx, a.y - ny, a.z, b.x + nx, b.y + ny, b.z, b.x - nx, b.y - ny, b.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
