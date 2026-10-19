// Procedural texture toolkit: tileable noise, canvas painting helpers and
// height → normal map conversion. Everything is generated at load time.
import * as THREE from 'three';

function hash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function vnoise(x, y, p, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = (i) => ((i % p) + p) % p;
  const a = hash(w(ix), w(iy), seed), b = hash(w(ix + 1), w(iy), seed);
  const c = hash(w(ix), w(iy + 1), seed), d = hash(w(ix + 1), w(iy + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, period, seed, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x * f, y * f, period * f, seed + o * 17); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (draw) draw(g, w, h);
  return c;
}

const noiseCache = new Map();
// tileable grayscale fbm noise canvas
export function noiseCanvas(size = 256, cells = 8, seed = 1, oct = 4, contrast = 1) {
  const key = [size, cells, seed, oct, contrast].join(',');
  if (noiseCache.has(key)) return noiseCache.get(key);
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = fbm(x / size * cells, y / size * cells, cells, seed, oct);
    v = Math.min(1, Math.max(0, (v - 0.5) * contrast + 0.5));
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  noiseCache.set(key, c);
  return c;
}

// overlay a tiled noise canvas onto a context
export function overlayNoise(g, w, h, noise, alpha, mode = 'overlay', scale = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = mode;
  const pat = g.createPattern(noise, 'repeat');
  if (scale !== 1) pat.setTransform(new DOMMatrix().scale(scale));
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  g.restore();
}

// height canvas (gray: 128 = flat, brighter = raised) → normal map canvas
export function normalCanvas(src, strength = 2) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const og = out.getContext('2d');
  const img = og.createImageData(w, h);
  const H = (x, y) => sd[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4;
    img.data[i] = (dx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return out;
}

export function toTex(canvas, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

// paint a height canvas starting from flat gray
export function heightCanvas(w, h, draw) {
  return makeCanvas(w, h, (g) => { g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h); draw && draw(g, w, h); });
}

export const hex = (n) => '#' + new THREE.Color(n).getHexString();
export function shade(n, k) { const c = new THREE.Color(n); c.multiplyScalar(k); return '#' + c.getHexString(); }
export function mixHex(a, b, t) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString(); }
