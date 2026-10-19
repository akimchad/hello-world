// The roster: sculpted, skinned 3D heroes with painted costumes, props,
// hair, capes and faces — plus gameplay stats and ability descriptions.
// Fan-made likenesses generated in code; no external assets.
import * as THREE from 'three';
import { buildHeroRig, partMaterial, mapper } from './anatomy.js';
import { Cloth } from './cloth.js';
import { hairMaterial, MOUTH_POLAR } from './face.js';
import { makeCanvas, toTex, noiseCanvas, overlayNoise, normalCanvas, heightCanvas, rng } from './textures.js';

const TAU = Math.PI * 2;
const tMap = (w, h) => mapper(w, h, -0.15, 0.66);
const aMap = (d) => (w, h) => mapper(w, h, -(d.upper + d.fore + 0.01), 0.075);
const lMap = (d) => (w, h) => mapper(w, h, -(d.thigh + d.shin + 0.01), 0.07);
const rgb = (c) => { const k = new THREE.Color(c); k.convertLinearToSRGB(); return [k.r * 255, k.g * 255, k.b * 255]; };

// per-pixel region painter: fn(theta, y) → color or null
function regions(g, w, h, M, fn) {
  const img = g.getImageData(0, 0, w, h);
  const D = img.data;
  for (let py = 0; py < h; py++) {
    const y = M.yAt(py + 0.5);
    for (let px = 0; px < w; px++) {
      const c = fn(M.thAt(px + 0.5), y);
      if (c) { const i = (py * w + px) * 4; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; }
    }
  }
  g.putImageData(img, 0, 0);
}
// draw only inside a region (via a transparent layer)
function masked(g, w, h, M, inside, draw) {
  const layer = makeCanvas(w, h);
  const lg = layer.getContext('2d');
  const img = lg.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    const y = M.yAt(py + 0.5);
    for (let px = 0; px < w; px++) if (inside(M.thAt(px + 0.5), y)) { const i = (py * w + px) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = img.data[i + 3] = 255; }
  }
  lg.putImageData(img, 0, 0);
  lg.globalCompositeOperation = 'source-atop';
  draw(lg);
  g.drawImage(layer, 0, 0);
}
function webLines(lg, w, h, color, lw = 2, sx = 26, sy = 22) {
  lg.strokeStyle = color; lg.lineWidth = lw;
  for (let x = 0; x <= w; x += sx) { lg.beginPath(); lg.moveTo(x, 0); lg.lineTo(x, h); lg.stroke(); }
  for (let y = sy / 2; y < h + sy; y += sy) { lg.beginPath(); for (let x = 0; x <= w; x += sx) lg.quadraticCurveTo(x + sx / 2, y + sy * 0.35, x + sx, y); lg.stroke(); }
}
function line(g, M, pts, color, lw) { g.strokeStyle = color; g.lineWidth = lw; g.beginPath(); pts.forEach(([t, y], i) => (i ? g.lineTo(M.X(t), M.Y(y)) : g.moveTo(M.X(t), M.Y(y)))); g.stroke(); }
function ring(g, M, y, color, lw) { g.fillStyle = color; g.fillRect(0, M.Y(y) - lw / 2, M.w, lw); }
function star(g, cx, cy, r, color, sy = 1) {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sy); }
  g.closePath(); g.fill();
}
function spider(g, x, y, s, color) {
  g.fillStyle = color; g.strokeStyle = color; g.lineWidth = s * 0.09; g.lineCap = 'round';
  g.beginPath(); g.ellipse(x, y - s * 0.32, s * 0.16, s * 0.2, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(x, y + s * 0.18, s * 0.2, s * 0.38, 0, 0, TAU); g.fill();
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
    const by = y - s * 0.3 + i * s * 0.18;
    g.beginPath(); g.moveTo(x, by); g.lineTo(x + sd * s * 0.55, by - s * (0.45 - i * 0.25)); g.lineTo(x + sd * s * 0.8, by + s * (i < 2 ? -0.6 + i * 0.4 : 0.3 + (i - 2) * 0.35)); g.stroke();
  }
}
function seams(g, M, list, color, lw) { for (const pts of list) line(g, M, pts, color, lw); }
function scales(g, w, h, color, size = 14) {
  g.strokeStyle = color; g.lineWidth = 1.4;
  for (let y = 0, r = 0; y < h + size; y += size * 0.6, r++) for (let x = (r % 2) * size / 2; x < w + size; x += size) { g.beginPath(); g.arc(x, y, size / 2, 0, Math.PI); g.stroke(); }
}
function veins(g, w, h, seed, color, n = 18, lw = 2.2) {
  const R = rng(seed); g.strokeStyle = color; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = R() * w, y = R() * h; g.lineWidth = lw * (0.6 + R() * 0.8); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += (R() - 0.5) * 30; y += 10 + R() * 26; g.lineTo(x, y); if (R() < 0.25) { g.stroke(); g.beginPath(); g.moveTo(x, y); } }
    g.stroke();
  }
}
function cracks(g, w, h, seed, color, n = 40, lw = 1.6) {
  const R = rng(seed); g.strokeStyle = color; g.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    let x = R() * w, y = R() * h; g.lineWidth = lw * (0.5 + R()); g.beginPath(); g.moveTo(x, y);
    const a0 = R() * TAU;
    for (let k = 0; k < 6; k++) { const a = a0 + (R() - 0.5) * 1.6; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
    g.stroke();
  }
}
function stitches(g, M, pts, color) { g.setLineDash([3, 4]); line(g, M, pts, color, 1.2); g.setLineDash([]); }

// physical materials for props
const metal = (c, r = 0.3, m = 0.9, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: r, metalness: m, clearcoat: o.cc ?? 0.3, ...o.extra });
const cloth = (c, r = 0.8, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: r, sheen: o.sheen ?? 0.6, sheenColor: new THREE.Color(o.sheenColor ?? 0xffffff), sheenRoughness: 0.5, side: o.side ?? THREE.FrontSide, map: o.map || null, normalMap: o.normalMap || null });
const glowM = (c, i = 3) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3 });
const mesh = (geo, m, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
};

// fabric texture for capes
function capeMaterial(key, base, lining, trim) {
  const c = makeCanvas(256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(128, 24, 9, 3), 0.25); if (trim) { g.fillStyle = trim; g.fillRect(0, h - 10, w, 10); g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h); } });
  const hc = heightCanvas(256, 256, (g, w, h) => { for (let x = 0; x < w; x += 3) { g.fillStyle = x % 6 ? '#8a8a8a' : '#767676'; g.fillRect(x, 0, 1, h); } overlayNoise(g, w, h, noiseCanvas(64, 8, 4, 3), 0.5); });
  return cloth(0xffffff, 0.75, { map: toTex(c), normalMap: toTex(normalCanvas(hc, 2), { srgb: false }), side: THREE.DoubleSide, sheenColor: lining });
}

// hair helpers ------------------------------------------------------
function hairCap(rig, color, { front = 0.95, back = 2.1, side = 1.45, vol = 0.06, clump = 0.05, tip = null, seed = 1, earCut = true } = {}) {
  const f = rig.face;
  const hl = (ph) => front + (back - front) * (1 - Math.cos(ph)) / 2 + (Math.abs(Math.abs(ph) - 1.57) < 0.4 && earCut ? Math.min(0, side - (front + (back - front) * 0.5)) : 0);
  const geo = f.shell(1.0, { thMin: 0, thMax: back + 0.1, rows: 36, seg: 56, push: (ph, th) => vol + clump * (fbmLike(ph * 3 + seed, th * 6) - 0.5) - Math.max(0, th - hl(ph)) * 0.5 });
  const mask = f.alphaMask(256, 128, (u, yy) => { const ph = (u - 0.5) * TAU, th = yy * (back + 0.1); return th < hl(ph) + Math.sin(ph * 40) * 0.025; });
  const m = hairMaterial('cap' + color + tip, color, tip, { alphaMap: mask });
  return mesh(geo, m, rig.J.head);
}
function fbmLike(x, y) { return 0.5 + 0.25 * Math.sin(x * 1.7 + Math.sin(y * 1.3)) + 0.25 * Math.sin(y * 2.3 + x * 0.7); }
function hairSheet(rig, color, tip, { length = 0.42, spread = 1.9, start = 2.0, flare = 0.35 } = {}) {
  const R = rig.dims.headR, hc = rig.headCenter, rows = 14, seg = 22;
  const pos = [], uv = [], idx = [];
  const top = rig.face.local(0, Math.cos(start), -Math.sin(start));
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = top.y - length * t;
    const r = R * (1.02 + flare * t) ;
    for (let j = 0; j <= seg; j++) {
      const ph = Math.PI - spread + 2 * spread * j / seg;
      pos.push(Math.sin(ph) * r * 0.95, y, hc.z + Math.cos(ph) * r * (0.9 + 0.3 * t) - 0.02 * t);
      uv.push(j / seg, 1 - t);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, b, b + 1, a, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const mask = rig.face.alphaMask(128, 128, (u, yy) => yy < 0.82 + 0.16 * Math.abs(Math.sin(u * 37)) && Math.abs(u - 0.5) < 0.49);
  return mesh(g, hairMaterial('sheet' + color + tip, color, tip, { alphaMap: mask }), rig.J.head);
}

// ------------------------------------------------------------------
// SPIDER-MAN
// ------------------------------------------------------------------
function buildSpider(alt) {
  const RED = alt ? '#141418' : '#b3141c', BLUE = alt ? '#0d0d12' : '#1b3c94', LINE = alt ? '#4a4a5c' : '#25040a';
  const K = 'spidey' + (alt ? 'A' : '');
  const S = { rough: 0.5, sheen: 0.7, sheenColor: alt ? 0x9090a8 : 0xff9090, strength: 4 };
  const redTorso = (th, y) => {
    const a = Math.abs(th);
    if (y > -0.02 && y < 0.03) return true; // belt line
    if (y < 0.03) return false;
    const front = 0.5 + 2.6 * Math.max(0, (y - 0.04) / 0.46) ** 1.6;
    const backA = Math.PI - a;
    const back = 0.35 + 2.8 * Math.max(0, (y - 0.12) / 0.4) ** 1.4;
    return a < front || backA < back;
  };
  const webbedPart = (key, M, inside, emblem) => partMaterial(key, {
    ...S,
    paint: (g, w, h) => {
      const m = M(w, h);
      g.fillStyle = BLUE; g.fillRect(0, 0, w, h);
      overlayNoise(g, w, h, noiseCanvas(128, 32, 4, 2), 0.15);
      masked(g, w, h, m, inside, (lg) => { lg.fillStyle = RED; lg.fillRect(0, 0, w, h); webLines(lg, w, h, LINE, 2.2); });
      emblem && emblem(g, m);
    },
    height: (g, w, h) => {
      const m = M(w, h);
      masked(g, w, h, m, inside, (lg) => { lg.fillStyle = '#8c8c8c'; lg.fillRect(0, 0, w, h); webLines(lg, w, h, '#e0e0e0', 2.6); });
      overlayNoise(g, w, h, noiseCanvas(128, 64, 8, 1), 0.2);
    },
  });
  return buildHeroRig({
    dims: { shoulderW: 0.232, chestK: 1.0, waistK: 0.9, hipK: 0.94, armK: 0.9, legK: 0.94, muscle: 1.1, headR: 0.112, neckK: 0.95 },
    materials: (d) => ({
      torso: webbedPart(K + 't', tMap, redTorso, (g, m) => { spider(g, m.X(0), m.Y(0.43), 34, alt ? '#e8e8e8' : '#0b0b0b'); spider(g, m.X(Math.PI), m.Y(0.38), 56, alt ? '#d0d0d0' : '#8a0c12'); }),
      neck: webbedPart(K + 'n', (w, h) => mapper(w, h, 0, 1), () => true),
      arm: (s) => webbedPart(K + 'a', aMap(d), (th, y) => y > -0.035 || y < -(d.upper + d.fore * 0.78) || (Math.abs(th - s * 0) < 0.35 && y > -d.upper * 0.85 && false)),
      leg: () => webbedPart(K + 'l', lMap(d), (th, y) => y < -(d.thigh + 0.1 + 0.03 * Math.cos(th))),
      hand: () => cloth(alt ? 0x141418 : 0xa8121a, 0.55, { sheenColor: 0xff8080 }),
      foot: () => cloth(alt ? 0x141418 : 0xa8121a, 0.6),
      sole: cloth(0x1a1a1a, 0.8),
    }),
    head: {
      type: 'lens', key: K, skin: alt ? 0x141418 : 0xb3141c, nose: 0.35, socket: 0, lips: 0.15, brow: 0.35, cheek: 0.6, chin: 0.9, rough: 0.5, sheen: 0.7,
      lensFrame: alt ? '#d8d8d8' : '#0a0a0a',
      paint: (g, w, h, H) => {
        g.fillStyle = alt ? '#141418' : '#b3141c'; g.fillRect(0, 0, w, h);
        const [cx, cy] = H.at(0, -0.15, 0.98);
        g.strokeStyle = LINE; g.lineWidth = 2;
        for (let a = 0; a < TAU; a += Math.PI / 9) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 600, cy + Math.sin(a) * 600); g.stroke(); }
        for (let r = 16; r < 420; r += 18) { g.beginPath(); for (let a = 0; a <= TAU + 0.01; a += Math.PI / 9) { const rr = r + 4 * Math.sin(a * 9); a ? g.quadraticCurveTo(cx + Math.cos(a - Math.PI / 18) * rr * 0.92, cy + Math.sin(a - Math.PI / 18) * rr * 0.92, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : g.moveTo(cx + rr, cy); } g.stroke(); }
        g.drawImage(g.canvas, -w, 0); g.drawImage(g.canvas, w, 0);
      },
      height: (g, w, h, H) => { const [cx, cy] = H.at(0, -0.15, 0.98); g.strokeStyle = '#dcdcdc'; g.lineWidth = 2.4; for (let a = 0; a < TAU; a += Math.PI / 9) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 600, cy + Math.sin(a) * 600); g.stroke(); } for (let r = 16; r < 420; r += 18) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); } },
    },
    decorate(rig, { J, d }) {
      for (const S2 of ['l', 'r']) mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.035, 14), metal(0x9aa0aa, 0.35, 0.9), J[S2 + 'El'], 0, -d.fore + 0.03, 0);
      rig.anchors = { cast: J.rHand, cast2: J.lHand };
    },
  });
}

// ------------------------------------------------------------------
// IRON MAN
// ------------------------------------------------------------------
function buildIron(alt) {
  const RED = alt ? '#4b5058' : '#9a1016', GOLD = alt ? '#23262b' : '#c9952e', SEAM = alt ? '#1c1e22' : '#3a0406';
  const K = 'iron' + (alt ? 'A' : '');
  const S = { rough: 0.32, metal: 0.85, clearcoat: 1, strength: 5, grain: 0.06 };
  const part = (key, M, paint, hpaint) => partMaterial(key, { ...S, paint: (g, w, h) => paint(g, w, h, M(w, h)), height: (g, w, h) => hpaint(g, w, h, M(w, h)) });
  const torsoSeams = (m) => [
    [[-1.2, 0.3], [-0.6, 0.36], [0, 0.32], [0.6, 0.36], [1.2, 0.3]],
    [[-0.95, 0.52], [-0.5, 0.49], [-0.12, 0.38], [0, 0.34]], [[0.95, 0.52], [0.5, 0.49], [0.12, 0.38], [0, 0.34]],
    [[0, 0.3], [0, 0.0]], [[-0.9, 0.2], [0.9, 0.2]], [[-0.9, 0.1], [0.9, 0.1]], [[-1.4, 0.0], [1.4, 0.0]],
    [[2.6, 0.55], [2.6, 0.05]], [[-2.6, 0.55], [-2.6, 0.05]], [[Math.PI, 0.6], [Math.PI, -0.1]],
  ];
  return buildHeroRig({
    dims: { shoulderW: 0.265, chestK: 1.12, waistK: 1.0, hipK: 1.0, armK: 1.08, legK: 1.06, muscle: 0.6, depthK: 1.08, headR: 0.122, handK: 1.12, footK: 1.18 },
    materials: (d) => ({
      torso: part(K + 't', tMap, (g, w, h, m) => {
        g.fillStyle = RED; g.fillRect(0, 0, w, h);
        regions(g, w, h, m, (th, y) => (Math.abs(th) < 0.95 && y > -0.02 && y < 0.3 ? rgb(GOLD) : null));
        overlayNoise(g, w, h, noiseCanvas(128, 8, 2, 3), 0.12);
        seams(g, m, torsoSeams(m), SEAM, 3);
      }, (g, w, h, m) => { seams(g, m, torsoSeams(m), '#303030', 4); }),
      neck: part(K + 'n', (w, h) => mapper(w, h, 0, 1), (g, w, h) => { g.fillStyle = GOLD; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 40) { g.fillStyle = SEAM; g.fillRect(0, y, w, 3); } }, (g, w, h) => { for (let y = 0; y < h; y += 40) { g.fillStyle = '#404040'; g.fillRect(0, y, w, 4); } }),
      arm: () => part(K + 'a', aMap(d), (g, w, h, m) => {
        g.fillStyle = RED; g.fillRect(0, 0, w, h);
        regions(g, w, h, m, (th, y) => (y < -0.06 && y > -(d.upper - 0.04) ? rgb(GOLD) : null));
        [-0.06, -(d.upper - 0.04), -(d.upper + 0.04), -(d.upper + d.fore - 0.06)].forEach((y) => ring(g, m, y, SEAM, 3));
        line(g, m, [[0, -(d.upper + 0.06)], [0, -(d.upper + d.fore - 0.08)]], SEAM, 3);
      }, (g, w, h, m) => { [-0.06, -(d.upper - 0.04), -(d.upper + 0.04), -(d.upper + d.fore - 0.06)].forEach((y) => ring(g, m, y, '#303030', 4)); }),
      leg: () => part(K + 'l', lMap(d), (g, w, h, m) => {
        g.fillStyle = RED; g.fillRect(0, 0, w, h);
        regions(g, w, h, m, (th, y) => (y < -0.04 && y > -(d.thigh - 0.07) ? rgb(GOLD) : null));
        [-0.04, -(d.thigh - 0.07), -(d.thigh + 0.06), -(d.thigh + d.shin * 0.7)].forEach((y) => ring(g, m, y, SEAM, 3));
        line(g, m, [[0, -(d.thigh + 0.08)], [0, -(d.thigh + d.shin * 0.68)]], SEAM, 3);
      }, (g, w, h, m) => { [-0.04, -(d.thigh - 0.07), -(d.thigh + 0.06), -(d.thigh + d.shin * 0.7)].forEach((y) => ring(g, m, y, '#303030', 4)); }),
      hand: () => metal(alt ? 0x4b5058 : 0x9a1016, 0.3, 0.85, { cc: 1 }),
      foot: () => metal(alt ? 0x4b5058 : 0x9a1016, 0.3, 0.85, { cc: 1 }),
      sole: metal(0x2a2a2e, 0.5, 0.8),
    }),
    head: { type: 'helmet', key: K, skin: alt ? 0x4b5058 : 0x9a1016, metal: 0.85, rough: 0.3, clearcoat: 1, sheen: 0, nose: 0.2, socket: 0.2, lips: 0, chin: 1.1, jaw: 1.3, taper: 0.18,
      paint: (g, w, h, H) => { g.fillStyle = RED; g.fillRect(0, 0, w, h); g.strokeStyle = SEAM; g.lineWidth = 3; g.beginPath(); g.moveTo(0, h * 0.55); g.lineTo(w, h * 0.55); g.stroke(); },
    },
    decorate(rig, { J, d }) {
      const red = metal(alt ? 0x4b5058 : 0x9a1016, 0.28, 0.85, { cc: 1 });
      const gold = metal(alt ? 0x23262b : 0xc9952e, 0.25, 0.95, { cc: 1 });
      const glow = glowM(0xbfefff, 3.2);
      rig.glowMat = glow;
      // faceplate following the face
      const plate = rig.face.shell(1.045, { thMin: 0.62, thMax: 2.75, phMin: -1.05, phMax: 1.05, rows: 28, seg: 32 });
      const fp = mesh(plate, gold, J.head);
      const shellG = rig.face.shell(1.06, { thMin: 0, thMax: 2.55, rows: 30, seg: 48 });
      const shellMask = rig.face.alphaMask(128, 64, (u, yy) => { const ph = (u - 0.5) * TAU; const th = yy * 2.55; return !(Math.abs(ph) < 0.98 && th > 0.68); });
      const hm = red.clone(); hm.alphaMap = shellMask; hm.alphaTest = 0.5; hm.side = THREE.DoubleSide;
      mesh(shellG, hm, J.head);
      for (const s of [1, -1]) {
        const e = rig.face.local(0.33 * s, 0.14, 0.95, 1.07);
        mesh(new THREE.BoxGeometry(d.headR * 0.42, d.headR * 0.07, 0.01), glow, J.head, e.x, e.y, e.z, 0, s * 0.35, s * -0.12);
      }
      const mouth = rig.face.local(0, -0.47, 0.92, 1.065);
      mesh(new THREE.BoxGeometry(d.headR * 0.45, d.headR * 0.02, 0.008), metal(0x2a1a08, 0.5, 0.8), J.head, mouth.x, mouth.y, mouth.z);
      rig.face.glowMat = glow;
      // arc reactor
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 24), glow, J.chest, 0, 0.11, 0.135, Math.PI / 2);
      mesh(new THREE.TorusGeometry(0.058, 0.012, 8, 24), gold, J.chest, 0, 0.11, 0.137);
      // pauldrons and gauntlets
      for (const s of [1, -1]) {
        const S2 = s > 0 ? 'l' : 'r';
        mesh(new THREE.SphereGeometry(0.115, 20, 14, 0, TAU, 0, Math.PI * 0.55), red, J[S2 + 'Sh'], s * 0.012, 0.02, 0, 0, 0, s * -0.25, 1.05, 0.95, 1.05);
        mesh(new THREE.SphereGeometry(0.102, 20, 14, 0, TAU, 0, Math.PI * 0.45), gold, J[S2 + 'Sh'], s * 0.015, 0.0, 0, 0, 0, s * -0.4, 1, 0.9, 1);
        mesh(new THREE.CylinderGeometry(0.058, 0.07, 0.17, 18), red, J[S2 + 'El'], 0, -d.fore + 0.11, 0);
        mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 20), gold, J[S2 + 'El'], 0, -d.fore + 0.04, 0, Math.PI / 2);
        mesh(new THREE.CircleGeometry(0.022, 16), glow, J[S2 + 'Hand'], s * -0.032, -0.055, 0, 0, s * -Math.PI / 2);
        mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.11, 16), red, J[S2 + 'Knee'], 0, -d.shin + 0.08, 0);
        mesh(new THREE.SphereGeometry(0.06, 14, 10), gold, J[S2 + 'Knee'], 0, 0, 0.035, 0, 0, 0, 1, 0.9, 0.6);
        mesh(new THREE.CircleGeometry(0.03, 16), glowM(0x9fe0ff, 2), J[S2 + 'Foot'], 0, -0.077, 0.04, Math.PI / 2);
      }
      rig.anchors = { cast: J.rHand, cast2: J.lHand, core: J.chest };
    },
  });
}

// ------------------------------------------------------------------
// THOR
// ------------------------------------------------------------------
function buildThor(alt) {
  const ARM = alt ? '#3a2c1c' : '#23262e', LEATH = '#1c1a1d', SKIN = 0xd6a07c;
  const K = 'thor' + (alt ? 'A' : '');
  const armorPaint = (g, w, h, m) => {
    g.fillStyle = ARM; g.fillRect(0, 0, w, h);
    overlayNoise(g, w, h, noiseCanvas(128, 16, 6, 4), 0.35);
    for (const y of [0.04, 0.1, 0.16, 0.22]) line(g, m, [[-1.1, y], [-0.4, y - 0.01], [0, y + 0.005], [0.4, y - 0.01], [1.1, y]], '#0c0d10', 3);
    line(g, m, [[-1.3, 0.28], [-0.5, 0.33], [0, 0.29], [0.5, 0.33], [1.3, 0.28]], '#0c0d10', 3);
    line(g, m, [[0, 0.29], [0, 0.62]], '#0c0d10', 3);
    ring(g, m, 0.0, '#4a3a22', 14);
  };
  const armorH = (g, w, h, m) => {
    for (const y of [0.04, 0.1, 0.16, 0.22]) line(g, m, [[-1.1, y], [-0.4, y - 0.01], [0, y + 0.005], [0.4, y - 0.01], [1.1, y]], '#303030', 5);
    line(g, m, [[-1.3, 0.28], [-0.5, 0.33], [0, 0.29], [0.5, 0.33], [1.3, 0.28]], '#303030', 5);
    line(g, m, [[0, 0.29], [0, 0.62]], '#303030', 4);
  };
  return buildHeroRig({
    dims: { shoulderW: 0.27, chestK: 1.18, waistK: 1.05, hipK: 1.02, armK: 1.18, legK: 1.1, muscle: 1.35, depthK: 1.08, neckK: 1.15, headR: 0.118 },
    materials: (d) => ({
      torso: partMaterial(K + 't', { rough: 0.55, metal: 0.25, sheen: 0.3, strength: 4, paint: (g, w, h) => armorPaint(g, w, h, tMap(w, h)), height: (g, w, h) => armorH(g, w, h, tMap(w, h)) }),
      neck: partMaterial(K + 'n', { rough: 0.55, sheen: 0.4, sheenColor: 0xffc0a0, paint: (g, w, h) => { g.fillStyle = '#d6a07c'; g.fillRect(0, 0, w, h); } }),
      arm: () => partMaterial(K + 'a', { rough: 0.55, sheen: 0.4, sheenColor: 0xffc0a0, strength: 3,
        paint: (g, w, h) => { const m = aMap(d)(w, h); g.fillStyle = '#d6a07c'; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(128, 24, 3, 3), 0.2);
          regions(g, w, h, m, (th, y) => (y < -(d.upper + 0.03) ? rgb(LEATH) : y > 0.02 ? rgb(ARM) : null));
          for (let y = -(d.upper + 0.06); y > -(d.upper + d.fore - 0.03); y -= 0.035) for (let t = -3; t < 3.2; t += 0.5) { g.fillStyle = '#9aa0a8'; g.beginPath(); g.arc(m.X(t), m.Y(y), 3, 0, TAU); g.fill(); }
          ring(g, m, -(d.upper - 0.1), '#2a1e14', 10); },
        height: (g, w, h) => { const m = aMap(d)(w, h); veins(g, w, h, 4, '#9a9a9a', 8, 2); for (let y = -(d.upper + 0.06); y > -(d.upper + d.fore - 0.03); y -= 0.035) for (let t = -3; t < 3.2; t += 0.5) { g.fillStyle = '#f0f0f0'; g.beginPath(); g.arc(m.X(t), m.Y(y), 3, 0, TAU); g.fill(); } } }),
      leg: () => partMaterial(K + 'l', { rough: 0.7, sheen: 0.4, strength: 3,
        paint: (g, w, h) => { const m = lMap(d)(w, h); g.fillStyle = LEATH; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(128, 16, 5, 4), 0.3); stitches(g, m, [[2.2, 0], [2.2, -0.8]], '#3a3a3a'); stitches(g, m, [[-2.2, 0], [-2.2, -0.8]], '#3a3a3a');
          regions(g, w, h, m, (th, y) => (y < -(d.thigh + 0.12) ? rgb('#141215') : null)); ring(g, m, -(d.thigh + 0.12), '#2a2a2a', 6); },
        height: (g, w, h) => { const m = lMap(d)(w, h); ring(g, m, -(d.thigh + 0.12), '#e0e0e0', 6); } }),
      hand: () => cloth(SKIN, 0.55, { sheenColor: 0xffc0a0 }),
      foot: () => cloth(0x141215, 0.7),
      sole: cloth(0x0c0c0c, 0.9),
    }),
    head: { type: 'skin', key: K, skin: SKIN, iris: 0x3a78c8, brows: alt ? 0x2a1d14 : 0xb08a3a, lip: 0xa86a5a, jaw: 1.25, chin: 1.1, brow: 1.2, taper: 0.2, stubble: 0 },
    decorate(rig, { J, d }) {
      const silver = metal(0xc8ccd4, 0.22, 0.95, { cc: 0.6 });
      const hairC = alt ? '#2a1d14' : '#c8a050';
      for (let r = 0; r < 3; r++) for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.018, 20), silver, J.chest, s * 0.07, 0.17 - r * 0.075, 0.138 - r * 0.004, Math.PI / 2 - 0.15);
      for (const s of [1, -1]) {
        const S2 = s > 0 ? 'l' : 'r';
        mesh(new THREE.SphereGeometry(0.11, 18, 12, 0, TAU, 0, Math.PI * 0.5), metal(alt ? 0x3a2c1c : 0x2b2e36, 0.35, 0.7), J[S2 + 'Sh'], s * 0.01, 0.03, 0, 0, 0, s * -0.3, 1.1, 0.9, 1.05);
      }
      // hammer
      const hammer = new THREE.Group(); J.rHand.add(hammer);
      const leather = cloth(0x3a2616, 0.7);
      mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.36, 12), leather, hammer, 0, -0.14, 0);
      for (let i = 0; i < 6; i++) mesh(new THREE.TorusGeometry(0.022, 0.004, 4, 12), leather, hammer, 0, -0.02 - i * 0.05, 0, Math.PI / 2);
      const head = mesh(new THREE.BoxGeometry(0.15, 0.15, 0.26), metal(0xb8bcc4, 0.35, 0.95), hammer, 0, -0.35, 0);
      for (const z of [-0.13, 0.13]) mesh(new THREE.BoxGeometry(0.16, 0.16, 0.02), metal(0x8a8e96, 0.3, 0.95), hammer, 0, -0.35, z);
      mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12), leather, hammer, 0, 0.05, 0);
      // cape (cloth sim)
      const cm = capeMaterial(K + 'cape', alt ? '#1d4f2a' : '#8e0e12', alt ? 0x3fa060 : 0xff6060, null);
      rig.cloths.push(new Cloth(rig, { width: 0.58, length: 1.3, material: cm }));
      // hair & beard
      hairCap(rig, hairC, { front: 0.82, back: 2.25, vol: 0.07, clump: 0.08, seed: 3 });
      hairSheet(rig, hairC, null, { length: 0.4, spread: 1.7, start: 1.95, flare: 0.5 });
      const beard = rig.face.shell(1.03, { thMin: MOUTH_POLAR + 0.03, thMax: 2.85, phMin: -1.5, phMax: 1.5, rows: 18, seg: 30, push: (ph, th) => 0.05 * Math.max(0, 1 - Math.abs(ph) / 1.5) * Math.min(1, (th - MOUTH_POLAR) * 2) });
      beard.translate(-J.jaw.position.x, -J.jaw.position.y, -J.jaw.position.z);
      const bm = rig.face.alphaMask(128, 64, (u, yy) => { const ph = (u - 0.5) * 3.0; const th = yy; return !(Math.abs(ph) < 0.35 && th < 0.18) && Math.abs(ph) < 1.45 - yy * 0.3; });
      mesh(beard, hairMaterial('beard' + hairC, hairC, null, { alphaMap: bm }), J.jaw);
      const must = rig.face.shell(1.03, { thMin: MOUTH_POLAR - 0.32, thMax: MOUTH_POLAR - 0.02, phMin: -0.65, phMax: 0.65, rows: 8, seg: 16, push: () => 0.02 });
      const mm = rig.face.alphaMask(64, 32, (u, yy) => yy > 0.35 - Math.abs(u - 0.5) * 0.6);
      mesh(must, hairMaterial('must' + hairC, hairC, null, { alphaMap: mm }), J.head);
      rig.anchors = { cast: J.rHand, hammer: head };
    },
  });
}

// ------------------------------------------------------------------
// HULK
// ------------------------------------------------------------------
function buildHulk(alt) {
  const SKIN = alt ? '#8a8f96' : '#4f8a2c', DARK = alt ? '#5a5e66' : '#2f5a18', SHORTS = alt ? '#22222c' : '#4a2a6e';
  const K = 'hulk' + (alt ? 'A' : '');
  const skinPart = (key, M, extra) => partMaterial(key, { rough: 0.6, sheen: 0.45, sheenColor: alt ? 0xb0b0c0 : 0xa0ff80, strength: 5,
    paint: (g, w, h) => { g.fillStyle = SKIN; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(128, 12, 21, 4), 0.35); veins(g, w, h, 9, 'rgba(40,70,40,0.35)', 14, 2.5); extra && extra(g, w, h, M(w, h)); },
    height: (g, w, h) => { veins(g, w, h, 9, '#c8c8c8', 14, 3); overlayNoise(g, w, h, noiseCanvas(128, 24, 22, 2), 0.08); } });
  const shortsT = (th, y) => y < 0.02 + 0.015 * Math.sin(th * 7);
  return buildHeroRig({
    dims: { scale: 1.28, shoulderW: 0.3, hipW: 0.12, chestK: 1.5, waistK: 1.3, hipK: 1.2, armK: 1.6, legK: 1.42, neckK: 1.7, depthK: 1.28, muscle: 1.9, headR: 0.113, handK: 1.5, footK: 1.3, upper: 0.29, fore: 0.27, thigh: 0.41, shin: 0.4 },
    materials: (d) => ({
      torso: skinPart(K + 't', tMap, (g, w, h, m) => { regions(g, w, h, m, (th, y) => (shortsT(th, y) ? rgb(SHORTS) : null)); ring(g, m, 0.0, 'rgba(0,0,0,0.3)', 3); }),
      neck: skinPart(K + 'n', (w, h) => mapper(w, h, 0, 1)),
      arm: () => skinPart(K + 'a', aMap(d)),
      leg: () => skinPart(K + 'l', lMap(d), (g, w, h, m) => regions(g, w, h, m, (th, y) => (y > -0.22 + 0.04 * Math.sin(th * 9) + 0.02 * Math.sin(th * 23) ? rgb(SHORTS) : null))),
      hand: () => cloth(new THREE.Color(SKIN).getHex(), 0.6, { sheenColor: 0xa0ff80 }),
      foot: () => cloth(new THREE.Color(SKIN).getHex(), 0.65),
      sole: cloth(new THREE.Color(DARK).getHex(), 0.8),
    }),
    head: { type: 'skin', key: K, skin: new THREE.Color(SKIN).getHex(), lip: new THREE.Color(DARK).getHex(), iris: alt ? 0x6a7a8a : 0x4a8a3a, brows: 0x101010, browThick: 1.6, brow: 2.0, jaw: 2.0, chin: 1.4, taper: 0.1, cheek: 1.4, nose: 1.15, wK: 0.9, rough: 0.6, sheen: 0.4 },
    decorate(rig, { J }) {
      hairCap(rig, '#121212', { front: 0.78, back: 2.05, vol: 0.06, clump: 0.12, seed: 5 });
      for (let i = 0; i < 9; i++) {
        const a = -0.9 + i * 0.22;
        const p = rig.face.local(Math.sin(a) * 0.6, 0.7, Math.cos(a) * 0.4, 1.05);
        mesh(new THREE.ConeGeometry(0.02, 0.07, 6), new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.8 }), J.head, p.x, p.y, p.z, 0.6, 0, -a * 0.6);
      }
      rig.anchors = { cast: J.rHand };
    },
  });
}

// ------------------------------------------------------------------
// CAPTAIN AMERICA
// ------------------------------------------------------------------
function buildCap(alt) {
  const BLUE = alt ? '#262a31' : '#1d3577', RED = alt ? '#6b5a3a' : '#a3141c', WHITE = '#ecebe6';
  const K = 'cap' + (alt ? 'A' : '');
  const S = { rough: 0.6, sheen: 0.55, sheenColor: 0xb0c8ff, strength: 2.2 };
  return buildHeroRig({
    dims: { shoulderW: 0.262, chestK: 1.14, waistK: 0.95, hipK: 0.98, armK: 1.08, legK: 1.04, muscle: 1.3, depthK: 1.04, headR: 0.116 },
    materials: (d) => ({
      torso: partMaterial(K + 't', { ...S,
        paint: (g, w, h) => {
          const m = tMap(w, h);
          g.fillStyle = BLUE; g.fillRect(0, 0, w, h); scales(g, w, h, 'rgba(0,0,0,0.16)', 9);
          regions(g, w, h, m, (th, y) => (Math.abs(th) < 1.05 && y > 0.02 && y < 0.27 ? (Math.floor((th + 1.05) / 0.21) % 2 ? rgb(WHITE) : rgb(RED)) : null));
          star(g, m.X(0), m.Y(0.44), 30, WHITE, 0.9);
          ring(g, m, 0.0, '#5a3a20', 16);
        },
        height: (g, w, h) => { const m = tMap(w, h); regions(g, w, h, m, (th, y) => (y > 0.27 || y < 0.0 || Math.abs(th) > 1.05 ? null : [128, 128, 128])); scales(g, w, h, '#a8a8a8', 9); g.strokeStyle = '#e0e0e0'; star(g, m.X(0), m.Y(0.44), 31, '#d8d8d8', 0.9); } }),
      neck: partMaterial(K + 'n', { ...S, paint: (g, w, h) => { g.fillStyle = BLUE; g.fillRect(0, 0, w, h); scales(g, w, h, 'rgba(0,0,0,0.16)', 9); }, height: (g, w, h) => scales(g, w, h, '#a8a8a8', 9) }),
      arm: () => partMaterial(K + 'a', { ...S,
        paint: (g, w, h) => { const m = aMap(d)(w, h); g.fillStyle = BLUE; g.fillRect(0, 0, w, h); scales(g, w, h, 'rgba(0,0,0,0.16)', 9); regions(g, w, h, m, (th, y) => (y < -(d.upper + d.fore * 0.55) ? rgb(RED) : null)); ring(g, m, -(d.upper + d.fore * 0.55), '#2a0a0a', 3); },
        height: (g, w, h) => { scales(g, w, h, '#a8a8a8', 9); } }),
      leg: () => partMaterial(K + 'l', { ...S,
        paint: (g, w, h) => { const m = lMap(d)(w, h); g.fillStyle = BLUE; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(128, 32, 4, 2), 0.15); regions(g, w, h, m, (th, y) => (y < -(d.thigh + 0.1 + 0.02 * Math.cos(th)) ? rgb(RED) : null)); stitches(g, m, [[1.57, 0], [1.57, -0.5]], '#0a1430'); stitches(g, m, [[-1.57, 0], [-1.57, -0.5]], '#0a1430'); },
        height: (g, w, h) => { const m = lMap(d)(w, h); ring(g, m, -(d.thigh + 0.1), '#e0e0e0', 5); } }),
      hand: () => cloth(alt ? 0x6b5a3a : 0x9a1218, 0.6), foot: () => cloth(alt ? 0x6b5a3a : 0x8e1016, 0.6), sole: cloth(0x1a1410, 0.9),
      cuff: () => cloth(alt ? 0x6b5a3a : 0x9a1218, 0.6),
    }),
    head: { type: 'skin', key: K, skin: 0xd9a88c, iris: 0x4a7ab8, brows: alt ? 0x262a31 : 0x1d3577, lip: 0xc07a6a, jaw: 1.3, chin: 1.25, taper: 0.22,
      paint: (g, w, h, H) => {
        // cowl: everything above the brow and the sides/back, leaving the face open
        const img = g.getImageData(0, 0, w, h); const D = img.data; const c = rgb(BLUE);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const th = y / h * Math.PI, ph = (x / w - 0.5) * TAU;
          const open = (ph / 0.74) ** 2 + ((th - 1.98) / 0.72) ** 2 < 1;
          if (!open && th < 2.55) { const i = (y * w + x) * 4; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; }
        }
        g.putImageData(img, 0, 0);
        g.fillStyle = WHITE; g.font = 'bold 46px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const [ax, ay] = H.at(0, 0.62, 0.78); g.fillText('A', ax, ay);
      },
      height: (g, w, h, H) => { g.fillStyle = '#d8d8d8'; g.font = 'bold 46px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; const [ax, ay] = H.at(0, 0.62, 0.78); g.fillText('A', ax, ay); },
    },
    decorate(rig, { J, d }) {
      const white = cloth(0xf0f0f0, 0.5);
      for (const s of [1, -1]) {
        const p = rig.face.local(0.86 * s, 0.32, 0.25, 1.03);
        const wing = new THREE.Group(); wing.position.copy(p); wing.rotation.set(0, s * 0.3, s * 0.15); J.head.add(wing);
        for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(0.012, 0.075 - i * 0.012, 4), white, wing, 0, 0.012 - i * 0.016, -0.02 - i * 0.008, -Math.PI / 2 + 0.2, 0, 0, 1, 1, 0.4);
      }
      const leather = cloth(0x4a3018, 0.6);
      const belt = mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 40), leather, J.hips, 0, 0.0, -0.005, Math.PI / 2, 0, 0, 1.0 * d.hipK, 0.74 * d.depthK * 1.0, 1);
      for (const a of [-0.9, -0.45, 0.45, 0.9, 2.6, -2.6]) mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), leather, J.hips, Math.sin(a) * 0.175, -0.005, Math.cos(a) * 0.13, 0, a, 0);
      mesh(new THREE.BoxGeometry(0.06, 0.04, 0.012), metal(0xc8b070, 0.3, 0.9), J.hips, 0, 0, 0.135);
      void belt;
      // shield on the left forearm
      const shieldG = new THREE.Group(); shieldG.position.set(0.075, -0.15, 0.02); J.lEl.add(shieldG);
      const tex = toTex(makeCanvas(256, 256, (g, w) => {
        const c = w / 2;
        [[128, '#b8141c'], [104, '#e9e9e9'], [80, '#b8141c'], [56, '#1d3b8f']].forEach(([r, col]) => { g.fillStyle = col; g.beginPath(); g.arc(c, c, r, 0, TAU); g.fill(); });
        star(g, c, c + 3, 48, '#f4f4f4');
        overlayNoise(g, w, w, noiseCanvas(128, 16, 31, 3), 0.15);
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; for (let i = 0; i < 25; i++) { const a = Math.random() * TAU, r0 = Math.random() * 120; g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r0 + 12, c + Math.sin(a) * r0 + 4); g.stroke(); }
      }));
      const face = new THREE.MeshPhysicalMaterial({ map: tex, metalness: 0.75, roughness: 0.32, clearcoat: 0.8 });
      const backM = new THREE.MeshPhysicalMaterial({ color: 0x8a8e96, metalness: 0.9, roughness: 0.4, side: THREE.BackSide });
      const rim = metal(0xa8121a, 0.35, 0.8);
      const disc = new THREE.Mesh(new THREE.SphereGeometry(0.4, 40, 12, 0, TAU, 0, 0.9), face);
      // the shield face is a shallow dome; flatten and orient outward (+X)
      const back = new THREE.Mesh(disc.geometry, backM);
      const shield = new THREE.Group(); shield.add(disc); shield.add(back); disc.scale.set(1, 0.32, 1); back.scale.copy(disc.scale); disc.position.y = -0.36 * 0.32 * Math.cos(0.9); back.position.copy(disc.position);
      mesh(new THREE.BoxGeometry(0.03, 0.02, 0.2), cloth(0x3a2616, 0.7), shield, 0, 0.02, 0, 0, 0, 0);
      disc.castShadow = true;
      const rimM = new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.012, 8, 48), rim); rimM.rotation.x = Math.PI / 2; rimM.position.y = 0.4 * Math.cos(0.9) * 0.32 - 0.005; shield.add(rimM);
      shield.rotation.z = -Math.PI / 2;
      shieldG.add(shield);
      rig.shield = shieldG;
      rig.anchors = { cast: J.lHand, shield: shieldG };
    },
  });
}

// ------------------------------------------------------------------
// GAMORA
// ------------------------------------------------------------------
function buildGamora(alt) {
  const SUIT = alt ? '#3a0f1f' : '#221a29', TRIM = alt ? '#c8a050' : '#9aa0ae', SKIN = alt ? 0x6e4fa0 : 0x4a9468;
  const K = 'gamora' + (alt ? 'A' : '');
  const leather = (key, M, extra) => partMaterial(key, { rough: 0.48, metal: 0.1, sheen: 0.5, sheenColor: 0xb090c0, clearcoat: 0.3, strength: 4,
    paint: (g, w, h) => { const m = M(w, h); g.fillStyle = SUIT; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(128, 20, 13, 4), 0.3); extra && extra(g, w, h, m); },
    height: (g, w, h) => { const m = M(w, h); extra && extra(g, w, h, m, true); overlayNoise(g, w, h, noiseCanvas(128, 48, 14, 2), 0.25); } });
  return buildHeroRig({
    dims: { shoulderW: 0.205, hipW: 0.095, chestK: 0.9, waistK: 0.76, hipK: 1.1, armK: 0.8, legK: 0.93, muscle: 0.55, depthK: 0.92, neckK: 0.85, female: true, headR: 0.108, handK: 0.88, footK: 0.92, upper: 0.29, fore: 0.26, thigh: 0.46, shin: 0.45 },
    materials: (d) => ({
      torso: leather(K + 't', tMap, (g, w, h, m, H) => {
        const c = H ? '#303030' : '#0c080e';
        seams(g, m, [[[-0.7, 0.62], [-0.35, 0.3], [-0.5, 0.0]], [[0.7, 0.62], [0.35, 0.3], [0.5, 0.0]], [[-1.4, 0.36], [1.4, 0.36]].map((p) => p)], c, 3);
        line(g, m, [[-0.35, 0.3], [0, 0.22], [0.35, 0.3]], H ? '#e0e0e0' : TRIM, 4);
        if (!H) ring(g, m, 0.0, '#3a3040', 14);
      }),
      neck: partMaterial(K + 'n', { rough: 0.5, sheen: 0.4, paint: (g, w, h) => { g.fillStyle = '#' + new THREE.Color(SKIN).getHexString(); g.fillRect(0, 0, w, h); } }),
      arm: () => leather(K + 'a', aMap(d), (g, w, h, m, H) => {
        if (!H) regions(g, w, h, m, (th, y) => (y > -0.12 ? rgb('#' + new THREE.Color(SKIN).getHexString()) : null));
        ring(g, m, -0.12, H ? '#e0e0e0' : TRIM, 5);
        ring(g, m, -(d.upper + d.fore * 0.5), H ? '#e0e0e0' : TRIM, 4);
      }),
      leg: () => leather(K + 'l', lMap(d), (g, w, h, m, H) => { stitches(g, m, [[1.57, 0], [1.57, -0.9]], H ? '#e0e0e0' : '#5a4a60'); ring(g, m, -(d.thigh - 0.04), H ? '#e0e0e0' : '#0c080e', 4); }),
      hand: () => cloth(SKIN, 0.5), foot: () => cloth(alt ? 0x2a0a14 : 0x15101a, 0.45), sole: cloth(0x0a0a0a, 0.9),
    }),
    head: { type: 'skin', key: K, skin: SKIN, lip: alt ? 0x4a2a6a : 0x2e4a3a, iris: 0x8a5a2a, brows: 0x1a1020, browThick: 0.75, jaw: 0.8, chin: 0.85, taper: 0.32, brow: 0.6, nose: 0.85, cheek: 1.3, wK: 0.8,
      paint: (g, w, h, H) => { g.strokeStyle = TRIM; g.lineWidth = 2; for (const s of [-1, 1]) { const [x1, y1] = H.at(0.62 * s, 0.05, 0.78), [x2, y2] = H.at(0.45 * s, -0.25, 0.86); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); const [x3, y3] = H.at(0.55 * s, 0.32, 0.77), [x4, y4] = H.at(0.68 * s, 0.12, 0.72); g.beginPath(); g.moveTo(x3, y3); g.lineTo(x4, y4); g.stroke(); } } },
    decorate(rig, { J, d }) {
      const silver = metal(0xb8bcc6, 0.25, 0.95);
      for (const s of [1, -1]) {
        const S2 = s > 0 ? 'l' : 'r';
        mesh(new THREE.SphereGeometry(0.085, 18, 12, 0, TAU, 0, Math.PI * 0.5), silver, J[S2 + 'Sh'], s * 0.01, 0.025, 0, 0, 0, s * -0.3, 1.1, 0.8, 1);
        mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.12, 16), silver, J[S2 + 'El'], 0, -0.1, 0);
      }
      mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 40), metal(0x6a6a74, 0.4, 0.8), J.hips, 0, 0.0, 0, Math.PI / 2, 0, 0, 1.08, 0.74, 1);
      // Godslayer sword
      const sword = new THREE.Group(); sword.rotation.x = 0.25; J.rHand.add(sword);
      const blade = metal(0xdfe8ff, 0.12, 1.0, { cc: 1, extra: { emissive: new THREE.Color(alt ? 0xffa040 : 0x6fd0ff), emissiveIntensity: 0.25 } });
      mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.17, 8), cloth(0x1a1018, 0.7), sword, 0, -0.07, -0.02, Math.PI / 2);
      mesh(new THREE.BoxGeometry(0.045, 0.11, 0.025), silver, sword, 0, -0.07, 0.065);
      const bladeShape = new THREE.Shape(); bladeShape.moveTo(0, 0); bladeShape.lineTo(0.03, 0.05); bladeShape.lineTo(0.026, 0.82); bladeShape.lineTo(-0.01, 0.96); bladeShape.lineTo(-0.024, 0.8); bladeShape.lineTo(-0.02, 0.05); bladeShape.closePath();
      const bg = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
      mesh(bg, blade, sword, 0.003, -0.07, 0.07, Math.PI / 2, Math.PI / 2, 0);
      hairCap(rig, '#140c18', { front: 0.9, back: 2.2, vol: 0.06, clump: 0.05, seed: 8 });
      hairSheet(rig, '#140c18', alt ? '#e8b030' : '#c2246e', { length: 0.5, spread: 1.9, start: 1.85, flare: 0.25 });
      rig.anchors = { cast: J.rHand, sword: sword.children[2] };
    },
  });
}

// ------------------------------------------------------------------
// DOOMSDAY
// ------------------------------------------------------------------
function buildDoomsday(alt) {
  const SKIN = alt ? '#5a5048' : '#86837e', DARK = alt ? '#2a221c' : '#4a4743', RAG = alt ? '#2a1a12' : '#2c3626';
  const K = 'doom' + (alt ? 'A' : '');
  const rock = (key, M, extra) => partMaterial(key, { rough: 0.8, sheen: 0, strength: 3.2,
    paint: (g, w, h) => { const m = M(w, h); g.fillStyle = SKIN; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(128, 10, 41, 5, 1.6), 0.55); cracks(g, w, h, 3, DARK, 60, 2); extra && extra(g, w, h, m); },
    height: (g, w, h) => { overlayNoise(g, w, h, noiseCanvas(128, 10, 41, 5, 1.3), 0.4); cracks(g, w, h, 3, '#303030', 60, 3); } });
  const boneM = () => new THREE.MeshPhysicalMaterial({ color: alt ? 0xb8a890 : 0xe6e0cc, roughness: 0.45, clearcoat: 0.2 });
  return buildHeroRig({
    dims: { scale: 1.32, shoulderW: 0.3, hipW: 0.12, chestK: 1.5, waistK: 1.2, hipK: 1.15, armK: 1.55, legK: 1.42, neckK: 1.8, depthK: 1.3, muscle: 2.0, headR: 0.112, handK: 1.5, footK: 1.3, upper: 0.3, fore: 0.28, thigh: 0.41, shin: 0.4 },
    materials: (d) => ({
      torso: rock(K + 't', tMap, (g, w, h, m) => regions(g, w, h, m, (th, y) => (y < 0.03 + 0.03 * Math.sin(th * 11) ? rgb(RAG) : null))),
      neck: rock(K + 'n', (w, h) => mapper(w, h, 0, 1)),
      arm: () => rock(K + 'a', aMap(d)),
      leg: () => rock(K + 'l', lMap(d), (g, w, h, m) => regions(g, w, h, m, (th, y) => (y > -(d.thigh + 0.14) + 0.05 * Math.sin(th * 13) ? rgb(RAG) : null))),
      hand: () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(SKIN), roughness: 0.8 }),
      foot: () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(SKIN), roughness: 0.85 }),
      sole: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(DARK), roughness: 0.9 }),
    }),
    head: { type: 'skin', key: K, skin: new THREE.Color(SKIN).getHex(), lip: new THREE.Color(DARK).getHex(), iris: 0xff2a10, eyeGlow: 0xff2010, brows: new THREE.Color(DARK).getHex(), browThick: 1.8, brow: 2.4, jaw: 2.2, chin: 1.2, taper: 0.08, cheek: 1.6, nose: 0.8, ridges: 0.05, teeth: 'fangs', rough: 0.85, sheen: 0.1, ears: false,
      paint: (g, w, h) => { overlayNoise(g, w, h, noiseCanvas(128, 10, 41, 5, 1.6), 0.5); cracks(g, w, h, 5, DARK, 30, 1.5); },
      height: (g, w, h) => cracks(g, w, h, 5, '#303030', 30, 2.5) },
    decorate(rig, { J, d }) {
      const bone = boneM();
      const spike = (parent, x, y, z, rx, rz, len = 0.12, r = 0.03) => mesh(new THREE.ConeGeometry(r, len, 8), bone, parent, x, y, z, rx, 0, rz);
      for (const s of [1, -1]) {
        const S2 = s > 0 ? 'l' : 'r';
        for (let i = 0; i < 3; i++) spike(J[S2 + 'Sh'], s * (0.05 + i * 0.02), 0.06 + i * 0.01, -0.03 + i * 0.03, -0.3 + i * 0.2, -s * (0.5 + i * 0.25), 0.16 - i * 0.03, 0.035);
        spike(J[S2 + 'El'], s * 0.03, 0.0, -0.06, -2.2, 0, 0.12, 0.028);
        for (let i = 0; i < 3; i++) spike(J[S2 + 'El'], s * 0.065, -0.07 - i * 0.06, 0.0, 0, -s * 1.3, 0.09, 0.022);
        spike(J[S2 + 'Knee'], 0, 0.0, 0.075, 1.2, 0, 0.1, 0.03);
        spike(J[S2 + 'Hand'], 0.0, -0.11, 0.0, Math.PI, 0, 0.05, 0.015);
        const band = metal(0x55585e, 0.45, 0.9);
        mesh(new THREE.TorusGeometry(0.08, 0.016, 8, 24), band, J[S2 + 'El'], 0, -d.fore + 0.06, 0, Math.PI / 2);
        mesh(new THREE.TorusGeometry(0.105, 0.018, 8, 24), band, J[S2 + 'Sh'], 0, -0.14, 0, Math.PI / 2);
      }
      for (let i = 0; i < 6; i++) spike(J.chest, 0, -0.1 + i * 0.075, -0.15 - Math.sin(i * 0.5) * 0.01, -1.9, 0, 0.12, 0.028);
      // head ridges + cheek spikes
      for (const [x, y, z, rx, rz] of [[0.25, 0.62, 0.7, -0.6, -0.4], [-0.25, 0.62, 0.7, -0.6, 0.4], [0, 0.8, 0.45, -0.9, 0], [0.45, 0.45, 0.72, -0.4, -0.9], [-0.45, 0.45, 0.72, -0.4, 0.9], [0.7, -0.2, 0.5, 0, -1.6], [-0.7, -0.2, 0.5, 0, 1.6]]) {
        const p = rig.face.local(x, y, z, 1.0); spike(J.head, p.x, p.y, p.z, rx, rz, 0.07, 0.02);
      }
      // white dreadlocks
      const dreadM = new THREE.MeshPhysicalMaterial({ color: alt ? 0x3a3530 : 0xd8d4c8, roughness: 0.75, sheen: 0.4 });
      for (let i = 0; i < 26; i++) {
        const a = Math.PI + (i / 25 - 0.5) * 3.4;
        const el = 0.25 + (i % 3) * 0.15;
        const root = rig.face.local(Math.sin(a) * Math.cos(el), Math.sin(el) + 0.2, Math.cos(a) * Math.cos(el), 0.98);
        const out = root.clone().sub(rig.headCenter).normalize();
        const len = 0.22 + (i % 4) * 0.05;
        const pts = [root, root.clone().addScaledVector(out, 0.05), root.clone().addScaledVector(out, 0.08).add(new THREE.Vector3(0, -len * 0.5, -0.03)), root.clone().addScaledVector(out, 0.07).add(new THREE.Vector3(0, -len, -0.06))];
        mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.013, 6, false), dreadM, J.head);
      }
      rig.anchors = { cast: J.rHand };
    },
  });
}

// ------------------------------------------------------------------
// SENTRY
// ------------------------------------------------------------------
function buildSentry(alt) {
  const GOLD = alt ? '#cfd3da' : '#d8a422', BLUE = alt ? '#1a1a22' : '#1c3a8c', K = 'sentry' + (alt ? 'A' : '');
  const S = { rough: 0.42, metal: 0.15, sheen: 0.8, sheenColor: 0xfff0b0, clearcoat: 0.25, strength: 4 };
  const panel = (th, y) => Math.abs(Math.abs(th) - 1.75) < 0.42 + 0.25 * Math.max(0, 0.3 - y);
  return buildHeroRig({
    dims: { shoulderW: 0.255, chestK: 1.12, waistK: 0.9, hipK: 0.96, armK: 1.05, legK: 1.02, muscle: 1.25, depthK: 1.02, headR: 0.115 },
    materials: (d) => ({
      torso: partMaterial(K + 't', { ...S,
        paint: (g, w, h) => { const m = tMap(w, h); g.fillStyle = GOLD; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(128, 24, 51, 3), 0.15);
          regions(g, w, h, m, (th, y) => (panel(th, y) || y < 0.02 ? rgb(BLUE) : null));
          // radiant chest emblem
          const cx = m.X(0), cy = m.Y(0.43); g.fillStyle = BLUE; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - 0.12) * 44, cy + Math.sin(a - 0.12) * 40); g.lineTo(cx + Math.cos(a + 0.12) * 44, cy + Math.sin(a + 0.12) * 40); g.fill(); }
          g.fillStyle = GOLD; g.beginPath(); g.arc(cx, cy, 18, 0, TAU); g.fill(); g.fillStyle = BLUE; g.beginPath(); g.arc(cx, cy, 10, 0, TAU); g.fill();
          ring(g, m, 0.02, '#e8c060', 6); },
        height: (g, w, h) => { const m = tMap(w, h); line(g, m, [[1.33, 0.6], [1.33, 0.0]], '#e0e0e0', 3); line(g, m, [[-1.33, 0.6], [-1.33, 0.0]], '#e0e0e0', 3); g.fillStyle = '#d8d8d8'; g.beginPath(); g.arc(m.X(0), m.Y(0.43), 20, 0, TAU); g.fill(); } }),
      neck: partMaterial(K + 'n', { ...S, paint: (g, w, h) => { g.fillStyle = GOLD; g.fillRect(0, 0, w, h); } }),
      arm: () => partMaterial(K + 'a', { ...S, paint: (g, w, h) => { const m = aMap(d)(w, h); g.fillStyle = GOLD; g.fillRect(0, 0, w, h); regions(g, w, h, m, (th, y) => (y < -(d.upper + d.fore * 0.45) ? rgb(BLUE) : null)); ring(g, m, -(d.upper + d.fore * 0.45), '#e8c060', 5); } }),
      leg: () => partMaterial(K + 'l', { ...S, paint: (g, w, h) => { const m = lMap(d)(w, h); g.fillStyle = GOLD; g.fillRect(0, 0, w, h); regions(g, w, h, m, (th, y) => (y < -(d.thigh + 0.08) || Math.abs(Math.abs(th) - 1.57) < 0.25 ? rgb(BLUE) : null)); } }),
      hand: () => cloth(alt ? 0x1a1a22 : 0x1c3a8c, 0.5), foot: () => cloth(alt ? 0x1a1a22 : 0x1c3a8c, 0.5), sole: cloth(0x0c0c14, 0.8),
    }),
    head: { type: 'skin', key: K, skin: 0xe2ad8a, iris: 0x2a6ae0, brows: 0xa8802a, lip: 0xb87060, jaw: 1.2, chin: 1.2, cheek: 1.1, taper: 0.22 },
    decorate(rig, { J }) {
      const hair = '#e2b448';
      hairCap(rig, hair, { front: 0.75, back: 2.0, vol: 0.09, clump: 0.1, seed: 12 });
      for (let i = 0; i < 5; i++) { const p = rig.face.local(-0.2 + i * 0.1, 0.78, 0.55, 1.08); mesh(new THREE.SphereGeometry(0.035, 10, 8), hairMaterial('quiff', hair), J.head, p.x, p.y, p.z, -0.6, 0, 0, 1, 0.6, 1.6); }
      const cm = capeMaterial(K + 'cape', alt ? '#2a2a34' : '#1c3a8c', 0xffd060, alt ? '#cfd3da' : '#d8a422');
      rig.cloths.push(new Cloth(rig, { width: 0.6, length: 1.35, material: cm, flare: 0.5 }));
      mesh(new THREE.TorusGeometry(0.165, 0.02, 8, 40), metal(alt ? 0x9aa0aa : 0xd8a422, 0.3, 0.9), J.hips, 0, 0.0, 0, Math.PI / 2, 0, 0, 1.02, 0.76, 1);
      const aura = new THREE.PointLight(0xffd070, 0, 3, 2); aura.position.set(0, 0.2, 0.3); J.chest.add(aura); rig.aura = aura;
      rig.anchors = { cast: J.rHand, cast2: J.lHand };
    },
  });
}

// ------------------------------------------------------------------
// Roster definitions (gameplay)
// ------------------------------------------------------------------
export const HEROES = [
  { id: 'spiderman', name: 'Spider-Man', title: 'Friendly Neighborhood Hero', color: '#e2232b', build: buildSpider,
    hp: 95, speed: 4.7, jump: 11.8, airJumps: 1, power: 0.95, defense: 1.0, attackSpeed: 0.9, weight: 0.9,
    stats: { Power: 3, Speed: 5, Defense: 2, Range: 3 },
    special: { id: 'webPull', name: 'Web Pull', cd: 3.0, desc: 'Web line that yanks the foe in close' },
    ultimate: { id: 'webBarrage', name: 'Web Barrage', desc: 'Web-wrap and a flurry of acrobatic strikes' }, passive: 'Double jump' },
  { id: 'ironman', name: 'Iron Man', title: 'Armored Avenger', color: '#d6a23a', build: buildIron,
    hp: 100, speed: 3.9, jump: 9.8, airJumps: 0, power: 1.0, defense: 0.95, attackSpeed: 1.0, weight: 1.05,
    stats: { Power: 3, Speed: 3, Defense: 3, Range: 5 },
    special: { id: 'repulsor', name: 'Repulsor Blast', cd: 2.0, desc: 'Fast energy blast from the palm' },
    ultimate: { id: 'unibeam', name: 'Unibeam', desc: 'Full-screen chest beam' }, passive: 'Hover (hold Jump while falling)' },
  { id: 'thor', name: 'Thor', title: 'God of Thunder', color: '#5fb3ff', build: buildThor,
    hp: 110, speed: 3.7, jump: 9.8, airJumps: 0, power: 1.1, defense: 0.95, attackSpeed: 1.05, weight: 1.15,
    stats: { Power: 4, Speed: 3, Defense: 3, Range: 4 },
    special: { id: 'lightning', name: 'Lightning Strike', cd: 3.4, desc: 'Calls a bolt down onto the foe' },
    ultimate: { id: 'thunderstorm', name: 'God of Thunder', desc: 'A storm of lightning bolts' }, passive: 'Hammer heavy is an overhead' },
  { id: 'hulk', name: 'Hulk', title: 'The Strongest There Is', color: '#4e8a2b', build: buildHulk,
    hp: 130, speed: 3.3, jump: 10.2, airJumps: 0, power: 1.24, defense: 0.86, attackSpeed: 1.22, weight: 1.6,
    stats: { Power: 5, Speed: 2, Defense: 5, Range: 2 },
    special: { id: 'groundSmash', name: 'Ground Smash', cd: 3.4, desc: 'Shockwave along the floor (block low!)' },
    ultimate: { id: 'hulkSmash', name: 'Hulk Smash', desc: 'Leaps across the arena and slams down' }, passive: 'Armor: no flinch from light hits while attacking' },
  { id: 'cap', name: 'Captain America', title: 'The First Avenger', color: '#3a6bd8', build: buildCap,
    hp: 105, speed: 4.2, jump: 10.2, airJumps: 0, power: 1.0, defense: 1.0, attackSpeed: 0.97, weight: 1.05,
    stats: { Power: 3, Speed: 4, Defense: 4, Range: 3 },
    special: { id: 'shieldThrow', name: 'Shield Throw', cd: 2.4, desc: 'Ricocheting shield that returns' },
    ultimate: { id: 'shieldStorm', name: 'Avengers Assemble', desc: 'Charging shield combo' }, passive: 'Shield block: takes almost no chip damage' },
  { id: 'gamora', name: 'Gamora', title: 'Deadliest Woman in the Galaxy', color: '#3f8f62', build: buildGamora,
    hp: 90, speed: 4.9, jump: 10.8, airJumps: 0, power: 1.05, defense: 1.05, attackSpeed: 0.82, weight: 0.85,
    stats: { Power: 4, Speed: 5, Defense: 2, Range: 4 },
    special: { id: 'dashSlash', name: 'Godslayer Dash', cd: 2.6, desc: 'Lightning-fast dashing slash' },
    ultimate: { id: 'bladeFury', name: 'Blade Fury', desc: 'Blinding multi-slash combo' }, passive: 'Sword gives longer light attacks' },
  { id: 'doomsday', name: 'Doomsday', title: 'The Unstoppable Monster', color: '#9a9690', build: buildDoomsday,
    hp: 130, speed: 3.15, jump: 9.8, airJumps: 0, power: 1.2, defense: 0.88, attackSpeed: 1.2, weight: 1.7, regen: true,
    stats: { Power: 5, Speed: 2, Defense: 5, Range: 2 },
    special: { id: 'boneCharge', name: 'Bone Charge', cd: 3.2, desc: 'Armored shoulder charge that floors the foe' },
    ultimate: { id: 'doomRampage', name: 'Extinction Rampage', desc: 'Grab, pummel and a crater-making slam' }, passive: 'Regenerates when not hit for a few seconds' },
  { id: 'sentry', name: 'Sentry', title: 'Power of a Million Suns', color: '#e8b830', build: buildSentry,
    hp: 105, speed: 4.6, jump: 11.2, airJumps: 2, power: 1.12, defense: 0.95, attackSpeed: 0.92, weight: 1.0,
    stats: { Power: 4, Speed: 4, Defense: 3, Range: 4 },
    special: { id: 'solarFlare', name: 'Solar Flare', cd: 2.6, desc: 'Heavy golden energy blast' },
    ultimate: { id: 'millionSuns', name: 'Million Exploding Suns', desc: 'Arena-wide golden nova' }, passive: 'Flight: triple jump' },
];

export function heroById(id) { return HEROES.find((h) => h.id === id) || HEROES[0]; }
