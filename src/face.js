// Sculpted, skinned heads with an expression rig: jaw, mouth corners,
// eyelids, brows and eye look. Supports bare faces, lens masks and helmets.
import * as THREE from 'three';
import { makeCanvas, toTex, heightCanvas, normalCanvas, noiseCanvas, overlayNoise, fbm } from './textures.js';

const TAU = Math.PI * 2;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const MOUTH_POLAR = Math.acos(-0.47);

export const EXPRESSIONS = {
  neutral: { brow: 0.15, inner: 0, lid: 0, squint: 0.1, jaw: 0, smile: 0 },
  focus:   { brow: 0.55, inner: 0, lid: 0, squint: 0.3, jaw: 0, smile: -0.15 },
  grit:    { brow: 0.85, inner: 0, lid: 0, squint: 0.45, jaw: 0.1, smile: -0.4 },
  shout:   { brow: 0.95, inner: 0, lid: 0, squint: 0.35, jaw: 0.75, smile: -0.2 },
  roar:    { brow: 1, inner: 0, lid: 0, squint: 0.6, jaw: 1, smile: -0.35 },
  effort:  { brow: 0.7, inner: 0.2, lid: 0, squint: 0.55, jaw: 0.04, smile: -0.45 },
  pain:    { brow: -0.2, inner: 1, lid: 0.85, squint: 0.3, jaw: 0.45, smile: -0.6 },
  daze:    { brow: -0.1, inner: 0.5, lid: 0.55, squint: 0, jaw: 0.3, smile: -0.25 },
  ko:      { brow: -0.1, inner: 0.2, lid: 1, squint: 0, jaw: 0.32, smile: -0.1 },
  smile:   { brow: 0.05, inner: 0, lid: 0, squint: 0.3, jaw: 0.06, smile: 1 },
  laugh:   { brow: -0.15, inner: 0, lid: 0, squint: 0.55, jaw: 0.5, smile: 1 },
};

// head surface point for a unit direction (head-local, relative to head center)
export function headPoint(x, y, z, p, out = new THREE.Vector3()) {
  const G = (cx, cy, cz, s) => { const dx = x - cx, dy = y - cy, dz = z - cz; return Math.exp(-(dx * dx + dy * dy + dz * dz) / (s * s)); };
  const G3 = (cx, cy, cz, sx, sy, sz) => { const a = (x - cx) / sx, b = (y - cy) / sy, c = (z - cz) / sz; return Math.exp(-(a * a + b * b + c * c)); };
  let r = 1;
  r += p.brow * 0.05 * (G(0.27, 0.33, 0.92, 0.2) + G(-0.27, 0.33, 0.92, 0.2) + 0.6 * G(0, 0.32, 0.95, 0.15));
  r -= p.socket * 0.065 * (G(0.33, 0.13, 0.93, 0.15) + G(-0.33, 0.13, 0.93, 0.15));
  r += p.nose * (0.045 * G3(0, 0.1, 0.99, 0.07, 0.12, 0.2) + 0.075 * G3(0, -0.06, 0.99, 0.08, 0.12, 0.2) + 0.12 * G3(0, -0.2, 0.98, 0.09, 0.07, 0.2) + 0.045 * (G(0.11, -0.24, 0.96, 0.07) + G(-0.11, -0.24, 0.96, 0.07)));
  r += p.cheek * 0.045 * (G(0.5, -0.02, 0.84, 0.2) + G(-0.5, -0.02, 0.84, 0.2));
  r += 0.035 * G3(0, -0.45, 0.9, 0.3, 0.22, 0.3);
  r += p.lips * (0.022 * G3(0, -0.41, 0.93, 0.17, 0.05, 0.2) + 0.028 * G3(0, -0.53, 0.9, 0.15, 0.05, 0.2));
  r -= 0.012 * G3(0, -0.47, 0.92, 0.22, 0.02, 0.3);
  r += p.chin * 0.06 * G3(0, -0.8, 0.58, 0.2, 0.18, 0.25);
  r += p.jaw * 0.045 * (G(0.62, -0.55, 0.4, 0.25) + G(-0.62, -0.55, 0.4, 0.25));
  r += 0.04 * G(0, 0.35, -0.9, 0.5);
  r -= 0.03 * (G(0.78, 0.3, 0.35, 0.22) + G(-0.78, 0.3, 0.35, 0.22));
  if (p.ridges) r += p.ridges * (G(0.25, 0.55, 0.75, 0.12) + G(-0.25, 0.55, 0.75, 0.12) + G(0, 0.7, 0.6, 0.12));
  let px = x * r * p.wK, py = y * r * p.hK, pz = z * r * p.dK;
  if (y < 0) px *= 1 - p.taper * sstep(0, -0.95, y);
  return out.set(px * p.R, py * p.R, pz * p.R);
}

const DEF = { type: 'skin', wK: 0.84, hK: 1.0, dK: 0.94, brow: 1, socket: 1, nose: 1, cheek: 1, lips: 1, chin: 1, jaw: 1, taper: 0.26, ridges: 0,
  skin: 0xd9a07a, lip: 0xb06a5a, iris: 0x5a7a9a, brows: 0x3a2a1a, browThick: 1, ears: true, teeth: 'normal', eyeGlow: null, rough: 0.55, sheen: 0.35 };

function headGeometry(p, rows = 58, seg = 64) {
  let polars = [];
  for (let i = 0; i <= rows; i++) polars.push(i / rows * Math.PI);
  let k = 0, best = 9;
  polars.forEach((t, i) => { if (Math.abs(t - MOUTH_POLAR) < best) { best = Math.abs(t - MOUTH_POLAR); k = i; } });
  polars[k] = MOUTH_POLAR;
  polars.splice(k + 1, 0, MOUTH_POLAR);
  const pos = [], uv = [], dirs = [], ringOf = [];
  const v = new THREE.Vector3();
  polars.forEach((th, i) => {
    for (let j = 0; j <= seg; j++) {
      const ph = (j / seg - 0.5) * TAU;
      const x = Math.sin(th) * Math.sin(ph), y = Math.cos(th), z = Math.sin(th) * Math.cos(ph);
      headPoint(x, y, z, p, v);
      pos.push(v.x, v.y, v.z); uv.push(j / seg, 1 - th / Math.PI); dirs.push(x, y, z, ph); ringOf.push(i);
    }
  });
  const row = seg + 1, idx = [];
  for (let i = 0; i < polars.length - 1; i++) {
    if (i === k) continue; // the mouth slit
    for (let j = 0; j < seg; j++) {
      const a = i * row + j, b = a + row;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const avg = (a, b) => { const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b); const l = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); };
  for (let j = 0; j <= seg; j++) avg(k * row + j, (k + 1) * row + j);
  for (let i = 0; i < polars.length; i++) avg(i * row, i * row + seg);
  return { g, dirs, ringOf, k };
}

// a shell over part of the head (hair caps, beards, helmets): mask(ph, th) → keep
function shellGeometry(p, scale, { thMin = 0, thMax = Math.PI, phMin = -Math.PI, phMax = Math.PI, rows = 36, seg = 48, push = null }) {
  const pos = [], uv = [], idx = [];
  const v = new THREE.Vector3();
  for (let i = 0; i <= rows; i++) {
    const th = thMin + (thMax - thMin) * i / rows;
    for (let j = 0; j <= seg; j++) {
      const ph = phMin + (phMax - phMin) * j / seg;
      const x = Math.sin(th) * Math.sin(ph), y = Math.cos(th), z = Math.sin(th) * Math.cos(ph);
      headPoint(x, y, z, p, v);
      const s = scale + (push ? push(ph, th) : 0);
      pos.push(v.x * s, v.y * s, v.z * s); uv.push(j / seg, 1 - i / rows);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) { const a = i * row + j, b = a + row; idx.push(a, b, b + 1, a, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// head texture mapper: phi (0 = front) and polar angle (0 = top)
function headMapper(w, h) {
  return {
    w, h,
    X: (ph) => (ph / TAU + 0.5) * w,
    Y: (th) => th / Math.PI * h,
    at(x, y, z) { const th = Math.acos(Math.max(-1, Math.min(1, y))); const ph = Math.atan2(x, z); return [this.X(ph), this.Y(th)]; },
  };
}

const hairTexCache = new Map();
export function hairMaterial(key, color, tipColor = null, opts = {}) {
  let t = hairTexCache.get(key);
  if (!t) {
    const w = 256, h = 256;
    const col = makeCanvas(w, h, (g) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const x = Math.random() * w; const l = 20 + Math.random() * 60; const y = Math.random() * h;
        g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.22)'; g.lineWidth = 1 + Math.random();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 6, y + l); g.stroke();
      }
      if (tipColor) { const gr = g.createLinearGradient(0, h * 0.55, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, tipColor); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    });
    const hc = heightCanvas(w, h, (g) => { for (let i = 0; i < 1400; i++) { const x = Math.random() * w; g.strokeStyle = Math.random() < 0.5 ? '#9a9a9a' : '#5a5a5a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, Math.random() * h); g.lineTo(x + (Math.random() - 0.5) * 4, Math.random() * h); g.stroke(); } });
    t = { map: toTex(col), normalMap: toTex(normalCanvas(hc, 4), { srgb: false }) };
    hairTexCache.set(key, t);
  }
  return new THREE.MeshPhysicalMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.55, sheen: 0.35, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.5, side: THREE.DoubleSide, alphaTest: opts.alphaMap ? 0.5 : 0, alphaMap: opts.alphaMap || null });
}

function alphaMask(w, h, fn) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d'); const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = fn(x / w, y / h) ? 255 : 0; const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = a; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTex(c, { srgb: false });
}

// ------------------------------------------------------------------
export function buildHead(rig, spec, ctx) {
  const p = Object.assign({}, DEF, spec);
  const R = rig.dims.headR;
  p.R = R;
  const J = rig.J;
  const hc = rig.headCenter;
  const face = { type: p.type, cur: { ...EXPRESSIONS.neutral }, target: { ...EXPRESSIONS.neutral }, blinkT: 2 + Math.random() * 2, blink: 0, look: 0, p };

  // ---------- skin material ----------
  const key = 'head-' + (spec.key || 'x');
  const skinMat = (() => {
    let tex = rig.constructor.headTex?.get(key);
    if (!tex) {
      const w = 512, h = 256, H = headMapper(w, h);
      const col = makeCanvas(w, h, (g) => {
        g.fillStyle = '#' + new THREE.Color(p.skin).getHexString(); g.fillRect(0, 0, w, h);
        overlayNoise(g, w, h, noiseCanvas(128, 16, 3, 4), 0.1, 'overlay');
        if (p.type === 'skin') {
          // cheeks, eye shadow, lips
          const [cx, cy] = H.at(0, -0.47, 0.88);
          const blush = (x, y, r, c) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
          for (const s of [-1, 1]) { const [ex, ey] = H.at(0.33 * s, 0.13, 0.93); blush(ex, ey, 26, 'rgba(60,25,20,0.45)'); const [bx, by] = H.at(0.5 * s, -0.15, 0.85); blush(bx, by, 30, 'rgba(200,60,50,0.12)'); }
          g.fillStyle = '#' + new THREE.Color(p.lip).getHexString();
          g.globalAlpha = 0.85;
          g.beginPath(); g.ellipse(cx, cy - 2, 21, 5, 0, Math.PI, 0); g.fill();
          g.beginPath(); g.ellipse(cx, cy + 1, 19, 7, 0, 0, Math.PI); g.fill();
          g.globalAlpha = 1;
          g.fillStyle = 'rgba(60,20,20,0.45)'; g.fillRect(cx - 21, cy - 1, 42, 1.5);
          if (p.stubble) { const [jx, jy] = H.at(0, -0.72, 0.68); const gr = g.createRadialGradient(jx, jy, 10, jx, jy, 80); gr.addColorStop(0, `rgba(40,30,25,${p.stubble})`); gr.addColorStop(1, 'rgba(40,30,25,0)'); g.fillStyle = gr; g.fillRect(jx - 90, jy - 90, 180, 180); }
        }
        spec.paint && spec.paint(g, w, h, H);
      });
      const hcv = heightCanvas(w, h, (g) => { overlayNoise(g, w, h, noiseCanvas(128, 64, 5, 1), 0.05, 'overlay'); spec.height && spec.height(g, w, h, H); });
      tex = { map: toTex(col), normalMap: toTex(normalCanvas(hcv, 1.4), { srgb: false }) };
      if (spec.emissivePaint) tex.emissiveMap = toTex(makeCanvas(w, h, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); spec.emissivePaint(g, w, h, H); }));
      rig.constructor.headTex = rig.constructor.headTex || new Map();
      rig.constructor.headTex.set(key, tex);
    }
    return new THREE.MeshPhysicalMaterial({ map: tex.map, normalMap: tex.normalMap, roughness: p.rough, metalness: p.metal || 0, sheen: p.sheen, sheenColor: new THREE.Color(0xffd0c0), sheenRoughness: 0.5, clearcoat: p.clearcoat || 0, emissive: new THREE.Color(tex.emissiveMap ? 0xffffff : 0), emissiveMap: tex.emissiveMap || null });
  })();
  face.skinMat = skinMat;
  const plainSkin = new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.6 });

  // ---------- skinned head ----------
  const { g, dirs, ringOf, k } = headGeometry(p);
  const headBoneM = J.head.matrixWorld.clone();
  g.translate(hc.x, hc.y, hc.z);
  g.applyMatrix4(headBoneM);
  const hb = ctx.bi('head'), jb = ctx.bi('jaw'), lcb = ctx.bi('lC'), rcb = ctx.bi('rC');
  const canTalk = p.type !== 'helmet';
  const headMesh = ctx.addSkinned(g, skinMat, (X, Y, Z, i) => {
    if (!canTalk) return [[hb, 1]];
    const x = dirs[i * 4], y = dirs[i * 4 + 1], z = dirs[i * 4 + 2], ph = dirs[i * 4 + 3];
    const ring = ringOf[i];
    const mouthMask = sstep(0.45, 0.22, Math.abs(ph));
    const zfac = sstep(-0.35, 0.15, z);
    let jaw = 0;
    if (ring === k && p.type === 'lens') jaw = mouthMask;
    else if (ring === k + 1) jaw = mouthMask;
    else if (ring > k + 1) jaw = Math.max(mouthMask, sstep(-0.47, -0.64, y)) * zfac;
    const cg = (cx) => { const dx = x - cx, dy = y + 0.47, dz = z - 0.86; return 0.7 * Math.exp(-(dx * dx + dy * dy + dz * dz) / 0.02); };
    const lc = cg(0.27), rc = cg(-0.27);
    return [[hb, Math.max(0, 1 - jaw - lc - rc)], [jb, jaw], [lcb, lc], [rcb, rc]];
  });
  rig.parts.head = headMesh;
  face.mesh = headMesh;

  const local = (x, y, z, s = 1) => headPoint(x, y, z, p).multiplyScalar(s).add(hc);

  // ---------- mouth interior & teeth ----------
  if (canTalk && p.type !== 'lens') {
    const lip = local(0, -0.47, 0.9);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(R * 0.36, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2a0b0b, roughness: 0.9 }));
    inner.position.set(0, lip.y - R * 0.04, lip.z - R * 0.42); inner.scale.set(1.15, 0.7, 1); J.head.add(inner);
    const toothM = new THREE.MeshPhysicalMaterial({ color: p.teeth === 'fangs' ? 0xd8d0b0 : 0xf2efe6, roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide });
    const tr = R * 0.4;
    const mkTeeth = (fangs) => {
      const grp = new THREE.Group();
      const band = new THREE.Mesh(new THREE.CylinderGeometry(tr, tr * 0.95, R * 0.07, 20, 1, true, -0.62, 1.24), toothM); grp.add(band);
      if (fangs) for (let i = -3; i <= 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(R * 0.022, R * 0.09, 6), toothM); const a = i * 0.17; f.position.set(Math.sin(a) * tr, -R * 0.06, Math.cos(a) * tr); f.rotation.x = Math.PI; grp.add(f); }
      return grp;
    };
    const up = mkTeeth(p.teeth === 'fangs'); up.position.set(0, lip.y - R * 0.012, lip.z - tr - R * 0.035); J.head.add(up);
    const jawPos = J.jaw.position;
    const lo = mkTeeth(p.teeth === 'fangs'); lo.rotation.z = Math.PI; lo.rotation.y = 0;
    lo.position.set(0, lip.y - R * 0.075 - jawPos.y, lip.z - tr - R * 0.045 - jawPos.z); lo.scale.set(0.95, 1, 0.95); J.jaw.add(lo);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 12, 8), new THREE.MeshStandardMaterial({ color: 0x9a3a3a, roughness: 0.5 }));
    tongue.scale.set(1, 0.35, 1.2); tongue.position.set(0, lip.y - R * 0.1 - jawPos.y, lip.z - R * 0.3 - jawPos.z); J.jaw.add(tongue);
  }

  // ---------- eyes, lids, brows ----------
  face.eyes = []; face.lids = []; face.lower = []; face.brows = [];
  if (p.type === 'skin') {
    const eyeR = R * (p.eyeSize || 0.135);
    const irisTex = (() => {
      const c = makeCanvas(256, 128, (g2) => {
        g2.fillStyle = '#f4f1ea'; g2.fillRect(0, 0, 256, 128);
        const cx = 64, cy = 64;
        const ir = 20;
        const iris = '#' + new THREE.Color(p.iris).getHexString();
        const gr = g2.createRadialGradient(cx, cy, 2, cx, cy, ir); gr.addColorStop(0, '#000'); gr.addColorStop(0.35, '#000'); gr.addColorStop(0.4, iris); gr.addColorStop(0.9, iris); gr.addColorStop(1, '#111');
        g2.fillStyle = gr; g2.beginPath(); g2.ellipse(cx, cy, ir, ir, 0, 0, TAU); g2.fill();
        g2.strokeStyle = 'rgba(180,60,60,0.25)'; for (let i = 0; i < 14; i++) { g2.beginPath(); g2.moveTo(160 + Math.random() * 80, Math.random() * 128); g2.lineTo(120 + Math.random() * 40, 64 + (Math.random() - 0.5) * 60); g2.stroke(); }
      });
      return toTex(c);
    })();
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: irisTex, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, emissive: p.eyeGlow ? new THREE.Color(p.eyeGlow) : new THREE.Color(0), emissiveMap: p.eyeGlow ? irisTex : null, emissiveIntensity: p.eyeGlow ? 2.5 : 1 });
    for (const s of [1, -1]) {
      const dir = new THREE.Vector3(0.33 * s, 0.13, 0.935).normalize();
      const surf = local(dir.x, dir.y, dir.z);
      const center = surf.clone().sub(hc).normalize().multiplyScalar(-eyeR * 0.72).add(surf);
      const eg = new THREE.Group(); eg.position.copy(center); J.head.add(eg);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 24, 16), eyeMat);
      const look = new THREE.Group(); look.add(ball); eg.add(look);
      face.eyes.push(look);
      const lidM = plainSkin;
      const lid = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.1, 20, 10, 0, TAU, 0, Math.PI / 2), lidM);
      const lidG = new THREE.Group(); lidG.add(lid); eg.add(lidG); face.lids.push(lidG);
      const low = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.08, 20, 10, 0, TAU, Math.PI / 2, Math.PI / 2), lidM);
      const lowG = new THREE.Group(); lowG.add(low); eg.add(lowG); face.lower.push(lowG);
      // brow: a tube following the brow ridge
      const pts = [];
      for (let t = 0; t <= 1.0001; t += 0.125) {
        const bx = s * (0.1 + 0.4 * t), by = 0.34 + 0.05 * Math.sin(Math.PI * t) - 0.04 * t;
        const bd = new THREE.Vector3(bx, by, Math.sqrt(Math.max(0, 1 - bx * bx - by * by)));
        pts.push(local(bd.x, bd.y, bd.z, 1.03));
      }
      const mid = pts[4].clone();
      const curve = new THREE.CatmullRomCurve3(pts.map((q) => q.clone().sub(mid)));
      const brow = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, R * 0.022 * p.browThick, 6, false), new THREE.MeshStandardMaterial({ color: p.brows, roughness: 0.8 }));
      brow.scale.set(1, 1, 0.6);
      const bg = new THREE.Group(); bg.position.copy(mid); bg.add(brow); J.head.add(bg);
      bg.userData.base = mid.clone(); bg.userData.side = s;
      face.brows.push(bg);
    }
  } else if (p.type === 'lens') {
    face.lenses = [];
    const lensTex = (fill, border) => toTex(makeCanvas(128, 128, (g2) => {
      g2.clearRect(0, 0, 128, 128);
      const path = () => { g2.beginPath(); g2.moveTo(110, 18); g2.quadraticCurveTo(122, 90, 70, 112); g2.quadraticCurveTo(14, 118, 12, 70); g2.quadraticCurveTo(20, 30, 110, 18); g2.closePath(); };
      g2.fillStyle = border; path(); g2.fill();
      g2.save(); g2.translate(64, 66); g2.scale(0.78, 0.74); g2.translate(-64, -66); g2.fillStyle = fill; path(); g2.fill(); g2.restore();
    }), { srgb: true });
    for (const s of [1, -1]) {
      const tex = lensTex('#f6f6f6', p.lensFrame || '#0a0a0a');
      const m = new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, alphaTest: 0.3, roughness: 0.2, clearcoat: 1, emissive: 0xffffff, emissiveIntensity: 0.12, emissiveMap: tex });
      const dir = new THREE.Vector3(0.36 * s, 0.17, 0.92).normalize();
      const c = local(dir.x, dir.y, dir.z, 1.012);
      const lg = new THREE.Group(); lg.position.copy(c);
      lg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), c.clone().sub(hc).normalize());
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(R * 0.62, R * 0.62, 6, 6), m);
      // bend the plane to the head curvature
      const pa = plane.geometry.attributes.position;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setZ(i, -(x * x + y * y) / (2 * R * 0.95)); }
      plane.geometry.computeVertexNormals();
      plane.scale.x = s; // mirror the teardrop
      const lg2 = new THREE.Group(); lg2.add(plane); lg.add(lg2);
      J.head.add(lg);
      face.lenses.push({ g: lg2, s });
    }
  } else if (p.type === 'helmet') {
    face.glow = [];
  }

  // ---------- ears ----------
  if (p.ears && p.type === 'skin') {
    for (const s of [1, -1]) {
      const pos = local(0.97 * s, 0.02, -0.1, 0.98);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 14, 10), plainSkin);
      ear.scale.set(0.35, 1.15, 0.75); ear.position.copy(pos); ear.rotation.y = s * 0.3; ear.castShadow = true; J.head.add(ear);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(R * 0.11, 10, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color(p.skin).multiplyScalar(0.6), roughness: 0.7 }));
      inner.scale.set(0.35, 1.1, 0.7); inner.position.copy(pos).add(new THREE.Vector3(s * R * 0.05, 0, 0)); J.head.add(inner);
    }
  }

  // ---------- API ----------
  face.local = local;
  face.headPoint = (x, y, z, s) => local(x, y, z, s);
  face.shell = (scale, o) => { const geo = shellGeometry(p, scale, o); geo.translate(hc.x, hc.y, hc.z); return geo; };
  face.alphaMask = alphaMask;
  face.set = (name) => { const e = EXPRESSIONS[name]; if (e) face.target = e; face.exprName = name; };
  face.update = (dt) => {
    const c = face.cur, t = face.target;
    const k2 = 1 - Math.exp(-dt * 14);
    for (const key2 in t) c[key2] += (t[key2] - c[key2]) * k2;
    face.blinkT -= dt;
    if (face.blinkT <= 0) { face.blink = 1; face.blinkT = 2.2 + Math.random() * 3.5; }
    face.blink = Math.max(0, face.blink - dt * 9);
    const blinkAmt = face.blink > 0.5 ? (1 - face.blink) * 2 : face.blink * 2;
    if (canTalk) {
      J.jaw.rotation.x = c.jaw * 0.5;
      for (const [b, s] of [[J.lC, 1], [J.rC, -1]]) {
        if (!b.userData.base) b.userData.base = b.position.clone();
        b.position.copy(b.userData.base).add(new THREE.Vector3(s * c.smile * R * 0.035, c.smile * R * 0.06 - c.jaw * R * 0.02, -Math.abs(c.smile) * R * 0.01));
      }
    }
    const close = Math.min(1, Math.max(c.lid, blinkAmt, c.squint * 0.42));
    face.lids.forEach((l) => { l.rotation.x = -0.42 + close * 1.2; });
    face.lower.forEach((l) => { l.rotation.x = 0.55 - c.squint * 0.35 - c.lid * 0.2; });
    face.eyes.forEach((e) => { e.rotation.y = face.look; });
    face.brows.forEach((b) => {
      const s = b.userData.side;
      b.position.copy(b.userData.base).add(new THREE.Vector3(0, (-c.brow * 0.025 + c.inner * 0.02) * R, 0));
      b.rotation.z = s * (c.brow * 0.32 - c.inner * 0.32);
    });
    if (face.lenses) face.lenses.forEach(({ g: lg, s }) => {
      const sq = Math.min(1, c.squint + c.brow * 0.25 + Math.max(c.lid, blinkAmt * 0.6) * 0.8);
      lg.scale.set(1 + c.jaw * 0.08, 1 - sq * 0.42, 1);
      lg.rotation.z = s * c.brow * 0.22;
    });
    if (face.glow && face.glowMat) face.glowMat.emissiveIntensity = 3 + c.brow * 2 + c.jaw * 3;
  };
  return face;
}
