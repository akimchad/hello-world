// Procedural 3D arenas. Fighters move along X at Z = 0; the floor is Y = 0.
import * as THREE from 'three';
import { makeCanvas, toTex, normalCanvas, heightCanvas, noiseCanvas, overlayNoise, rng } from './textures.js';

export const STAGES = [
  { id: 'rooftop', name: 'Tower Rooftop', desc: 'Midnight over a neon skyline, searchlights sweeping the clouds.' },
  { id: 'space', name: 'Knowhere Outpost', desc: 'A mining platform adrift at the edge of the galaxy.' },
  { id: 'bifrost', name: 'Rainbow Bridge', desc: 'The shimmering bridge before the golden city.' },
];

function skyDome(top, mid, bottom, extra = '') {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, bottom: { value: new THREE.Color(bottom) }, time: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform float time; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
      void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(mid, top, pow(clamp(y*1.6,0.0,1.0), 0.7)) : mix(mid, bottom, clamp(-y*4.0,0.0,1.0));
        ${extra}
        gl_FragColor = vec4(c, 1.0); }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(400, 32, 20), m);
}

function stars(n, r, size = 1.2, color = 0xffffff) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    p[i * 3] = Math.cos(th) * s * r; p[i * 3 + 1] = Math.abs(u) * r * 0.9 + 5; p[i * 3 + 2] = -Math.abs(Math.sin(th) * s * r);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
}

function keyLights(group, o) {
  const hemi = new THREE.HemisphereLight(o.sky, o.ground, o.hemi ?? 0.6);
  group.add(hemi);
  const key = new THREE.DirectionalLight(o.key, o.keyI ?? 2.2);
  key.position.set(o.keyPos?.[0] ?? 6, o.keyPos?.[1] ?? 14, o.keyPos?.[2] ?? 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 10; sc.bottom = -4; sc.near = 1; sc.far = 50;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  group.add(key); group.add(key.target);
  const rim = new THREE.DirectionalLight(o.rim, o.rimI ?? 2.5);
  rim.position.set(-4, 6, -12);
  group.add(rim);
  const fill = new THREE.DirectionalLight(o.fill ?? 0xffffff, o.fillI ?? 0.5);
  fill.position.set(-8, 3, 10);
  group.add(fill);
  const panels = [
    { color: new THREE.Color(o.key).multiplyScalar((o.keyI ?? 2.2) * 0.9), dir: key.position.clone().normalize() },
    { color: new THREE.Color(o.rim).multiplyScalar((o.rimI ?? 2.5) * 0.6), dir: rim.position.clone().normalize() },
    { color: new THREE.Color(o.fill ?? 0xffffff).multiplyScalar((o.fillI ?? 0.5) * 1.5), dir: fill.position.clone().normalize() },
  ];
  return { hemi, key, rim, panels };
}

// Image-based lighting so metals (armor, gold, shields) reflect the arena.
export function makeEnvironment(renderer, arena) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(arena.sky.geometry, arena.sky.material);
  sky.scale.setScalar(0.2);
  s.add(sky);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 24), new THREE.MeshBasicMaterial({ color: arena.envFloor ?? 0x222228 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -6; s.add(floor);
  for (const p of arena.lights.panels) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide }));
    m.position.copy(p.dir).multiplyScalar(55); m.lookAt(0, 0, 0); s.add(m);
  }
  const rt = pm.fromScene(s, 0.035, 0.1, 200);
  pm.dispose();
  s.traverse((o) => { if (o.isMesh && o !== sky) { o.geometry.dispose(); o.material.dispose(); } });
  return rt;
}


// ------------------------------------------------------------------
// shared building blocks
// ------------------------------------------------------------------
function pbr({ size = 1024, paint, height, rough, repeat = [1, 1], strength = 3, metal = 0, roughness = 0.8, emissive = null, color = 0xffffff, envI = 1 }) {
  const c = makeCanvas(size, size, (g) => paint(g, size, size));
  const m = new THREE.MeshStandardMaterial({ map: toTex(c, { repeat }), metalness: metal, roughness, color, envMapIntensity: envI });
  if (height) m.normalMap = toTex(normalCanvas(heightCanvas(size, size, (g) => height(g, size, size)), strength), { srgb: false, repeat });
  if (rough) { m.roughnessMap = toTex(makeCanvas(size, size, (g) => rough(g, size, size)), { srgb: false, repeat }); m.roughness = 1; }
  if (emissive) { m.emissiveMap = toTex(makeCanvas(size, size, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, size, size); emissive(g, size, size); }), { repeat }); m.emissive = new THREE.Color(0xffffff); }
  return m;
}
const add = (parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, shadow = true) => {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz);
  o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o;
};

class Rain {
  constructor(group, n = 1600, area = [-18, 18, -10, 6], top = 16) {
    this.n = n; this.area = area; this.top = top;
    const pos = new Float32Array(n * 6);
    this.d = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) this.respawn(i, Math.random() * top);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ color: 0xa8c0e0, transparent: true, opacity: 0.32, depthWrite: false }));
    this.lines.frustumCulled = false;
    group.add(this.lines);
    const sp = new Float32Array(240 * 3);
    this.splash = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)), new THREE.PointsMaterial({ color: 0x9fb4d0, size: 0.03, transparent: true, opacity: 0.35, depthWrite: false }));
    this.splash.frustumCulled = false; this.si = 0;
    group.add(this.splash);
  }
  respawn(i, y) { const [x0, x1, z0, z1] = this.area; this.d[i * 4] = x0 + Math.random() * (x1 - x0); this.d[i * 4 + 1] = y; this.d[i * 4 + 2] = z0 + Math.random() * (z1 - z0); this.d[i * 4 + 3] = 13 + Math.random() * 5; }
  update(dt) {
    const p = this.geo.attributes.position.array, sp = this.splash.geometry.attributes.position.array;
    for (let i = 0; i < this.n; i++) {
      const k = i * 4;
      this.d[k + 1] -= this.d[k + 3] * dt; this.d[k] -= 1.5 * dt;
      if (this.d[k + 1] < 0) {
        if (this.d[k + 2] > -9 && Math.random() < 0.5) { const s = (this.si++ % 240) * 3; sp[s] = this.d[k]; sp[s + 1] = 0.03; sp[s + 2] = this.d[k + 2]; }
        this.respawn(i, this.top + Math.random() * 2);
      }
      const x = this.d[k], y = this.d[k + 1], z = this.d[k + 2];
      p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z; p[i * 6 + 3] = x + 0.04; p[i * 6 + 4] = y + 0.38; p[i * 6 + 5] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.splash.geometry.attributes.position.needsUpdate = true;
  }
}

function motes(group, n, area, color, size, speed = 0.3) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = area[0] + Math.random() * (area[1] - area[0]); pos[i * 3 + 1] = Math.random() * area[4]; pos[i * 3 + 2] = area[2] + Math.random() * (area[3] - area[2]); }
  const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  group.add(pts);
  return (dt, t) => {
    for (let i = 0; i < n; i++) { pos[i * 3 + 1] += speed * dt * (0.5 + (i % 5) * 0.2); pos[i * 3] += Math.sin(t * 0.5 + i) * dt * 0.1; if (pos[i * 3 + 1] > area[4]) pos[i * 3 + 1] = 0; }
    pts.geometry.attributes.position.needsUpdate = true;
  };
}

function windowTexture(seed, { cols = 12, rows = 28, lit = 0.33, frame = '#1a1d26', warm = 0.7 } = {}) {
  const R = rng(seed);
  return makeCanvas(256, 512, (g, w, h) => {
    g.fillStyle = '#0d0f16'; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * cw + 2, y = r * ch + 2, ww = cw - 4, hh = ch - 5;
      const on = R() < lit;
      if (on) {
        const warmC = R() < warm;
        const b = 0.55 + R() * 0.45;
        g.fillStyle = warmC ? `rgba(255,${(190 + R() * 40) | 0},${(110 + R() * 50) | 0},${b})` : `rgba(${(150 + R() * 40) | 0},${(200 + R() * 30) | 0},255,${b})`;
        g.fillRect(x, y, ww, hh);
        if (R() < 0.4) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + ww * R(), y, ww * 0.35, hh); }
      } else { g.fillStyle = `rgba(40,50,70,${0.25 + R() * 0.3})`; g.fillRect(x, y, ww, hh); }
    }
    g.fillStyle = frame; for (let c = 0; c <= cols; c++) g.fillRect(c * cw - 1, 0, 2, h);
  });
}

// ------------------------------------------------------------------
// TOWER ROOFTOP — rainy night
// ------------------------------------------------------------------
function buildRooftop() {
  const group = new THREE.Group();
  const updaters = [];
  const sky = skyDome(0x04060f, 0x221a33, 0x0a0a12, `
    float glow = exp(-abs(y-0.02)*8.0); c += vec3(1.0,0.45,0.22)*glow*0.4;
    vec2 q = vec2(atan(vP.x, vP.z)*3.0, y*8.0); float cl = fbm(q + vec2(time*0.03,0.0));
    c = mix(c, c*0.6 + vec3(0.16,0.12,0.18), smoothstep(0.45,0.8,cl)*smoothstep(0.0,0.35,y));
    c += vec3(0.7,0.75,1.0) * flash * smoothstep(0.4,0.8,cl) * smoothstep(0.0,0.3,y);`);
  sky.material.uniforms.flash = { value: 0 };
  sky.material.fragmentShader = sky.material.fragmentShader.replace('uniform float time;', 'uniform float time; uniform float flash;');
  group.add(sky);
  group.add(stars(500, 380, 1.2));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 20), new THREE.MeshBasicMaterial({ color: 0xfff1d0, fog: false }));
  moon.position.set(80, 95, -280); group.add(moon);

  // wet concrete floor
  const floorM = pbr({ size: 1024, repeat: [6, 3], strength: 1.6, roughness: 1,
    paint: (g, w, h) => {
      g.fillStyle = '#4a4b50'; g.fillRect(0, 0, w, h);
      overlayNoise(g, w, h, noiseCanvas(256, 8, 61, 5, 1.4), 0.5);
      overlayNoise(g, w, h, noiseCanvas(256, 64, 62, 2), 0.25);
      const R = rng(5); for (let i = 0; i < 26; i++) { const x = R() * w, y = R() * h, r = 20 + R() * 90; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(20,18,16,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      g.strokeStyle = 'rgba(15,15,18,0.8)'; g.lineWidth = 4; for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * w / 2, 0); g.lineTo(k * w / 2, h); g.stroke(); g.beginPath(); g.moveTo(0, k * h / 2); g.lineTo(w, k * h / 2); g.stroke(); }
      cracksA(g, w, h, 8, 'rgba(10,10,12,0.7)');
    },
    height: (g, w, h) => { overlayNoise(g, w, h, noiseCanvas(256, 16, 62, 3), 0.35); g.strokeStyle = '#303030'; g.lineWidth = 5; for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * w / 2, 0); g.lineTo(k * w / 2, h); g.stroke(); g.beginPath(); g.moveTo(0, k * h / 2); g.lineTo(w, k * h / 2); g.stroke(); } cracksA(g, w, h, 8, '#404040'); },
    rough: (g, w, h) => { g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h); const nz = noiseCanvas(256, 4, 63, 4, 1.6); g.globalAlpha = 0.5; g.globalCompositeOperation = 'multiply'; g.drawImage(nz, 0, 0, w, h); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; const R = rng(9); for (let i = 0; i < 7; i++) { const x = R() * w, y = R() * h, r = 30 + R() * 80; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, '#101010'); gr.addColorStop(0.7, '#202020'); gr.addColorStop(1, 'rgba(60,60,60,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.6, R() * 3, 0, Math.PI * 2); g.fill(); } } });
  const floor = add(group, new THREE.PlaneGeometry(48, 24), floorM, 0, 0, -4, -Math.PI / 2, 0, 0, 1, 1, 1, false);
  // helipad decal
  const decal = makeCanvas(1024, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(225,185,60,0.85)'; g.lineWidth = 34; g.beginPath(); g.arc(w / 2, h / 2, 430, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(235,232,220,0.8)'; g.font = 'bold 560px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', w / 2, h / 2 + 30);
    g.globalCompositeOperation = 'destination-out'; overlayNoise(g, w, h, noiseCanvas(256, 32, 64, 3, 2), 0.55, 'destination-out');
  });
  const decalM = new THREE.MeshStandardMaterial({ map: toTex(decal), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  add(group, new THREE.PlaneGeometry(9, 9), decalM, 0, 0.01, -3.2, -Math.PI / 2, 0, 0, 1, 1, 1, false);
  const padLights = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; padLights.push(add(group, new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7fd0ff }), Math.cos(a) * 4.7, 0.04, -3.2 + Math.sin(a) * 4.7, 0, 0, 0, 1, 1, 1, false)); }
  updaters.push((dt, t) => padLights.forEach((l, i) => { l.visible = ((t * 2 + i / 16) % 1) < 0.5; }));

  // parapet, railing
  const concrete = pbr({ size: 512, repeat: [8, 1], strength: 3, roughness: 0.9, paint: (g, w, h) => { g.fillStyle = '#3a3b40'; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(256, 16, 71, 5), 0.5); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, h * 0.85, w, h * 0.15); }, height: (g, w, h) => overlayNoise(g, w, h, noiseCanvas(256, 32, 72, 3), 0.6) });
  add(group, new THREE.BoxGeometry(48, 1.1, 0.7), concrete, 0, 0.55, -10.5);
  add(group, new THREE.BoxGeometry(48, 0.08, 0.8), new THREE.MeshStandardMaterial({ color: 0x55575c, roughness: 0.5, metalness: 0.6 }), 0, 1.12, -10.5);
  const railM = new THREE.MeshStandardMaterial({ color: 0x6a6c72, roughness: 0.35, metalness: 0.85 });
  for (let x = -22; x <= 22; x += 1.6) add(group, new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), railM, x, 1.65, -10.5);
  add(group, new THREE.CylinderGeometry(0.035, 0.035, 44, 8), railM, 0, 2.15, -10.5, 0, 0, Math.PI / 2);
  add(group, new THREE.CylinderGeometry(0.025, 0.025, 44, 8), railM, 0, 1.6, -10.5, 0, 0, Math.PI / 2);
  for (const x of [-17, 17]) add(group, new THREE.BoxGeometry(0.7, 1.1, 16), concrete, x, 0.55, -3);

  // water tower
  const wood = pbr({ size: 512, repeat: [3, 1], strength: 3, roughness: 0.85, paint: (g, w, h) => { g.fillStyle = '#5a3f2a'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 24) { g.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.2})`; g.fillRect(x, 0, 2, h); g.fillStyle = `rgba(255,220,180,${Math.random() * 0.06})`; g.fillRect(x + 2, 0, 22, h); } overlayNoise(g, w, h, noiseCanvas(128, 8, 81, 4), 0.4); }, height: (g, w, h) => { for (let x = 0; x < w; x += 24) { g.fillStyle = '#404040'; g.fillRect(x, 0, 2, h); } } });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.55, metalness: 0.8 });
  const wt = new THREE.Group(); wt.position.set(-11, 0, -8); group.add(wt);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(wt, new THREE.CylinderGeometry(0.08, 0.1, 4.2, 8), steel, x * 1.3, 2.1, z * 1.3);
  for (const y of [1.2, 2.8]) for (const r of [0, Math.PI / 2]) add(wt, new THREE.BoxGeometry(2.7, 0.06, 0.06), steel, 0, y, 0, 0, r, 0.6);
  add(wt, new THREE.CylinderGeometry(1.75, 1.75, 3.2, 32), wood, 0, 5.8, 0);
  for (const y of [4.6, 5.4, 6.2, 7.0]) add(wt, new THREE.TorusGeometry(1.77, 0.03, 6, 40), steel, 0, y, 0, Math.PI / 2);
  add(wt, new THREE.ConeGeometry(1.95, 1.3, 32), new THREE.MeshStandardMaterial({ color: 0x2f2a26, roughness: 0.8 }), 0, 8.05, 0);
  add(wt, new THREE.CylinderGeometry(1.8, 1.8, 0.1, 32), steel, 0, 4.2, 0);

  // stairwell bulkhead with a lit door
  const brick = pbr({ size: 512, repeat: [2, 1.4], strength: 4, roughness: 0.9, paint: (g, w, h) => { g.fillStyle = '#5a3a30'; g.fillRect(0, 0, w, h); for (let y = 0, r = 0; y < h; y += 22, r++) for (let x = (r % 2) * 32; x < w + 64; x += 64) { g.fillStyle = `rgb(${(110 + Math.random() * 40) | 0},${(55 + Math.random() * 20) | 0},${(40 + Math.random() * 15) | 0})`; g.fillRect(x - 64 + 2, y + 2, 60, 18); } overlayNoise(g, w, h, noiseCanvas(128, 16, 91, 4), 0.35); }, height: (g, w, h) => { g.fillStyle = '#b0b0b0'; for (let y = 0, r = 0; y < h; y += 22, r++) for (let x = (r % 2) * 32; x < w + 64; x += 64) g.fillRect(x - 64 + 2, y + 2, 60, 18); } });
  const bk = new THREE.Group(); bk.position.set(11.5, 0, -7.6); group.add(bk);
  add(bk, new THREE.BoxGeometry(3.6, 3, 2.8), brick, 0, 1.5, 0);
  add(bk, new THREE.BoxGeometry(3.9, 0.15, 3.1), steel, 0, 3.05, 0);
  add(bk, new THREE.BoxGeometry(1.0, 2.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x2a3a3f, roughness: 0.5, metalness: 0.6 }), -0.5, 1.05, 1.42);
  add(bk, new THREE.BoxGeometry(0.35, 0.12, 0.14), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffd080, emissiveIntensity: 4 }), -0.5, 2.35, 1.46);
  const doorLight = new THREE.PointLight(0xffc880, 6, 7, 2); doorLight.position.set(11, 2.2, -6); group.add(doorLight);

  // HVAC units with fan grilles and ducts
  const grille = makeCanvas(256, 256, (g, w, h) => { g.fillStyle = '#1a1b1e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6a6c70'; g.lineWidth = 6; for (let r = 20; r < 128; r += 18) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); } for (let a = 0; a < 6.28; a += 0.785) { g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128); g.stroke(); } });
  const unitM = pbr({ size: 512, repeat: [1, 1], strength: 2, metal: 0.6, roughness: 0.5, paint: (g, w, h) => { g.fillStyle = '#7a7d82'; g.fillRect(0, 0, w, h); for (let y = 20; y < h; y += 26) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(20, y, w - 40, 6); } overlayNoise(g, w, h, noiseCanvas(128, 8, 95, 4), 0.35); g.fillStyle = 'rgba(80,40,10,0.3)'; g.fillRect(0, h * 0.8, w, h * 0.2); }, height: (g, w, h) => { for (let y = 20; y < h; y += 26) { g.fillStyle = '#505050'; g.fillRect(20, y, w - 40, 6); } } });
  for (const [x, z] of [[-14.5, -4], [14.6, -2.6]]) {
    const u = new THREE.Group(); u.position.set(x, 0, z); group.add(u);
    add(u, new THREE.BoxGeometry(2.2, 1.5, 2.4), unitM, 0, 0.75, 0);
    const fan = add(u, new THREE.CircleGeometry(0.8, 32), new THREE.MeshStandardMaterial({ map: toTex(grille), roughness: 0.5, metalness: 0.7 }), 0, 1.51, 0, -Math.PI / 2);
    void fan;
    add(u, new THREE.CylinderGeometry(0.28, 0.28, 3, 16), steel, 0, 0.35, -2.6, Math.PI / 2);
  }

  // skyline: layered buildings with framed, varied windows
  const bMats = [1, 2, 3, 4].map((sd) => { const t = toTex(windowTexture(sd), { repeat: [2, 2] }); return new THREE.MeshStandardMaterial({ color: 0x1a1d25, roughness: 0.4, metalness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.3, map: t }); });
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const R = rng(77);
  for (let i = 0; i < 90; i++) {
    const near = i < 18;
    const w = 7 + R() * 12, h = (near ? 25 : 15) + Math.pow(R(), 1.5) * (near ? 40 : 85), d = 7 + R() * 10;
    const x = near ? -60 + R() * 120 : -170 + R() * 340, z = near ? -32 - R() * 12 : -55 - R() * 120;
    const base = -40;
    const b = new THREE.Mesh(bGeo, bMats[i % 4]); b.scale.set(w, h, d); b.position.set(x, base + h / 2, z); group.add(b);
    if (R() < 0.45) { const s2 = new THREE.Mesh(bGeo, bMats[(i + 1) % 4]); s2.scale.set(w * 0.65, h * 0.18, d * 0.65); s2.position.set(x, base + h + h * 0.09, z); group.add(s2); }
    if (R() < 0.25) { const sp = new THREE.Mesh(new THREE.ConeGeometry(1.2, 14, 8), steel); sp.position.set(x, base + h + 7, z); group.add(sp); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); tip.position.set(x, base + h + 14.3, z); group.add(tip); }
  }
  // neon signs on nearby buildings
  const neon = (text, color, w, h, font) => makeCanvas(1024, 256, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 256); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = color; g.shadowBlur = 30; g.fillStyle = color; g.fillText(text, 512, 135); g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.7; g.fillText(text, 512, 135); });
  const sign1 = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), new THREE.MeshBasicMaterial({ map: toTex(neon('MIDTOWN NEWS', '#ff3a6a', 0, 0, 'bold 150px Arial')), transparent: true, blending: THREE.AdditiveBlending, fog: false }));
  sign1.position.set(-18, 14, -31); group.add(sign1);
  const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: toTex(neon('HOTEL', '#3ad6ff', 0, 0, 'bold 190px Arial')), transparent: true, blending: THREE.AdditiveBlending, fog: false }));
  sign2.position.set(24, 20, -33); group.add(sign2);
  updaters.push((dt, t) => { sign1.material.opacity = (Math.sin(t * 13) > -0.95 || (t % 7) > 0.4) ? 1 : 0.3; });
  // searchlights
  const beamM = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (const [x, ph] of [[-60, 0], [45, 2.1]]) {
    const geo = new THREE.ConeGeometry(6, 170, 24, 1, true); geo.translate(0, 85, 0);
    const beam = new THREE.Mesh(geo, beamM); beam.position.set(x, -30, -120); group.add(beam);
    updaters.push((dt, t) => { beam.rotation.z = Math.sin(t * 0.25 + ph) * 0.5; beam.rotation.x = -0.25 + Math.cos(t * 0.2 + ph) * 0.1; });
  }
  const rain = new Rain(group);
  updaters.push((dt) => rain.update(dt));
  const lights = keyLights(group, { sky: 0x6a7cff, ground: 0x1a1220, hemi: 0.5, key: 0xd8e4ff, keyI: 2.0, keyPos: [-5, 14, 9], rim: 0x5fb8ff, rimI: 2.6, fill: 0xff7a4a, fillI: 0.5 });
  // occasional lightning in the clouds
  let next = 4, flashT = 0;
  updaters.push((dt, t) => {
    if (t > next) { flashT = 0.35; next = t + 7 + Math.random() * 9; }
    flashT = Math.max(0, flashT - dt);
    const f = flashT > 0 ? (Math.sin(flashT * 60) > 0 ? 1 : 0.3) * flashT * 3 : 0;
    sky.material.uniforms.flash.value = f;
    sky.material.uniforms.time.value = t;
    lights.hemi.intensity = 0.5 + f * 1.5;
  });
  void floor;
  return { group, updaters, fog: new THREE.FogExp2(0x15122a, 0.0105), exposure: 1.05, lights, sky, envFloor: 0x2a2b30 };
}

function cracksA(g, w, h, seed, color) {
  const R = rng(seed); g.strokeStyle = color; g.lineWidth = 1.5;
  for (let i = 0; i < 18; i++) { let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); const a0 = R() * 6.28; for (let k = 0; k < 9; k++) { const a = a0 + (R() - 0.5) * 1.4; x += Math.cos(a) * 12; y += Math.sin(a) * 12; g.lineTo(x, y); } g.stroke(); }
}

// ------------------------------------------------------------------
// KNOWHERE OUTPOST — mining platform in space
// ------------------------------------------------------------------
function buildSpace() {
  const group = new THREE.Group();
  const updaters = [];
  const sky = skyDome(0x02030a, 0x070414, 0x02020a, `
    vec2 q = vec2(atan(vP.x, vP.z)*2.0, y*3.0);
    float neb = fbm(q*1.3 + vec2(time*0.01, 0.0));
    float neb2 = fbm(q*2.7 + 4.0);
    c += vec3(0.55,0.12,0.6)*smoothstep(0.45,0.9,neb)*0.7 + vec3(0.1,0.35,0.7)*smoothstep(0.5,0.95,neb2)*0.6;`);
  group.add(sky);
  updaters.push((dt, t) => { sky.material.uniforms.time.value = t; });
  group.add(stars(2500, 380, 1.4));
  group.add(stars(500, 380, 2.4, 0xbcd6ff));
  // ringed planet
  const pTex = makeCanvas(1024, 512, (g, w, h) => {
    for (let y = 0; y < h; y++) { const k = y / h; const r = 150 + 70 * Math.sin(k * 23) + 30 * Math.sin(k * 71); g.fillStyle = `rgb(${r | 0},${(r * 0.55) | 0},${(90 + 60 * Math.sin(k * 9)) | 0})`; g.fillRect(0, y, w, 1); }
    overlayNoise(g, w, h, noiseCanvas(256, 16, 101, 5), 0.35);
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 40), new THREE.MeshStandardMaterial({ map: toTex(pTex), roughness: 0.9, fog: false }));
  planet.position.set(-90, 35, -240); planet.rotation.z = 0.35; group.add(planet);
  const ringT = makeCanvas(512, 32, (g, w, h) => { for (let x = 0; x < w; x++) { const a = 0.4 + 0.5 * Math.abs(Math.sin(x * 0.07) * Math.sin(x * 0.013)); g.fillStyle = `rgba(230,200,170,${a})`; g.fillRect(x, 0, 1, h); } });
  const ringGeo = new THREE.RingGeometry(75, 115, 96, 1);
  const uv = ringGeo.attributes.uv, pp = ringGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) { const r = Math.hypot(pp.getX(i), pp.getY(i)); uv.setXY(i, (r - 75) / 40, 0.5); }
  const ringM = new THREE.MeshBasicMaterial({ map: toTex(ringT), transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false });
  const ringMesh = new THREE.Mesh(ringGeo, ringM); ringMesh.position.copy(planet.position); ringMesh.rotation.set(1.25, 0.2, 0.35); group.add(ringMesh);
  const sunLight = new THREE.DirectionalLight(0xffc9a0, 1.2); sunLight.position.set(80, 40, -100); group.add(sunLight);
  updaters.push((dt) => { planet.rotation.y += dt * 0.01; });

  // the giant skull-like celestial head (Knowhere)
  const skullTex = makeCanvas(1024, 512, (g, w, h) => {
    g.fillStyle = '#3a3430'; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(256, 12, 111, 5, 1.6), 0.6);
  });
  const skullEm = makeCanvas(1024, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const R2 = rng(4);
    for (let i = 0; i < 900; i++) { const x = R2() * w, y = h * 0.3 + R2() * h * 0.5; g.fillStyle = R2() < 0.7 ? '#ffb060' : '#80e0ff'; g.fillRect(x, y, 2, 2); }
  });
  const skullGeo = new THREE.SphereGeometry(55, 64, 48);
  const sp2 = skullGeo.attributes.position; const vv = new THREE.Vector3();
  for (let i = 0; i < sp2.count; i++) {
    vv.fromBufferAttribute(sp2, i).normalize();
    let r = 1 + 0.08 * Math.sin(vv.x * 9) * Math.sin(vv.y * 7) + 0.06 * Math.sin(vv.z * 13);
    for (const s of [-1, 1]) { const dx = vv.x - 0.35 * s, dy = vv.y - 0.15, dz = vv.z - 0.88; r -= 0.28 * Math.exp(-(dx * dx + dy * dy + dz * dz) / 0.04); }
    if (vv.y < -0.3) r *= 0.85 + 0.15 * (vv.z > 0.3 ? 1 : 0);
    sp2.setXYZ(i, vv.x * 55 * r, vv.y * 62 * r, vv.z * 50 * r);
  }
  skullGeo.computeVertexNormals();
  const skull = new THREE.Mesh(skullGeo, new THREE.MeshStandardMaterial({ map: toTex(skullTex), emissiveMap: toTex(skullEm), emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.95 }));
  skull.position.set(95, 8, -210); skull.rotation.set(0.15, -0.7, 0.1); group.add(skull);

  // deck: steel plates, rivets, hazard edge, light strips
  const deckM = pbr({ size: 1024, repeat: [4, 4], strength: 3, metal: 0.3, roughness: 1, envI: 0.45,
    paint: (g, w, h) => {
      g.fillStyle = '#3a3e46'; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(256, 16, 121, 4), 0.35);
      for (let x = 0; x < w; x += 256) for (let y = 0; y < h; y += 256) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.07})`; g.fillRect(x + 4, y + 4, 248, 248); }
      g.strokeStyle = '#15171c'; g.lineWidth = 6; for (let k = 0; k <= w; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
      g.fillStyle = '#5a5e68'; for (let x = 0; x < w; x += 256) for (let y = 0; y < h; y += 256) for (const [dx, dy] of [[16, 16], [240, 16], [16, 240], [240, 240]]) { g.beginPath(); g.arc(x + dx, y + dy, 6, 0, 6.28); g.fill(); }
      // grate panel
      g.fillStyle = '#1a1c22'; g.fillRect(256 + 30, 512 + 30, 196, 196); g.strokeStyle = '#4a4e58'; g.lineWidth = 4; for (let i = 0; i < 196; i += 14) { g.beginPath(); g.moveTo(286 + i, 542); g.lineTo(286 + i, 738); g.stroke(); }
      g.fillStyle = 'rgba(120,70,30,0.25)'; for (let i = 0; i < 20; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 30 + Math.random() * 60, 10 + Math.random() * 20, Math.random() * 3, 0, 6.28); g.fill(); }
    },
    height: (g, w, h) => { g.strokeStyle = '#303030'; g.lineWidth = 8; for (let k = 0; k <= w; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); } g.fillStyle = '#e8e8e8'; for (let x = 0; x < w; x += 256) for (let y = 0; y < h; y += 256) for (const [dx, dy] of [[16, 16], [240, 16], [16, 240], [240, 240]]) { g.beginPath(); g.arc(x + dx, y + dy, 6, 0, 6.28); g.fill(); } g.fillStyle = '#505050'; g.fillRect(286, 542, 196, 196); },
    rough: (g, w, h) => { g.fillStyle = '#909090'; g.fillRect(0, 0, w, h); overlayNoise(g, w, h, noiseCanvas(256, 8, 122, 4, 2), 0.6); },
    emissive: (g, w, h) => { g.fillStyle = '#2fc6ff'; for (let k = 128; k < w; k += 512) g.fillRect(k - 2, 0, 4, h); },
  });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(17, 15, 1.4, 72), [
    new THREE.MeshStandardMaterial({ color: 0x1b1d24, metalness: 0.8, roughness: 0.45 }), deckM, new THREE.MeshStandardMaterial({ color: 0x111218 }),
  ]);
  plate.position.set(0, -0.7, -3); plate.receiveShadow = true; group.add(plate);
  const hazard = makeCanvas(512, 32, (g, w, h) => { for (let x = -32; x < w; x += 32) { g.fillStyle = '#e8b81a'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, h); g.fill(); } });
  const hz = new THREE.Mesh(new THREE.RingGeometry(16.2, 16.9, 96), new THREE.MeshStandardMaterial({ map: toTex(hazard, { repeat: [40, 1] }), roughness: 0.6, color: 0xffffff }));
  hz.rotation.x = -Math.PI / 2; hz.position.set(0, 0.006, -3); hz.receiveShadow = true; group.add(hz);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(17, 0.08, 8, 128), new THREE.MeshBasicMaterial({ color: 0x2fc6ff })); edge.rotation.x = Math.PI / 2; edge.position.set(0, 0, -3); group.add(edge);
  // support struts under the deck
  const strutM = new THREE.MeshStandardMaterial({ color: 0x2a2d35, metalness: 0.85, roughness: 0.4 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(group, new THREE.CylinderGeometry(0.5, 0.3, 14, 8), strutM, Math.cos(a) * 11, -8, -3 + Math.sin(a) * 11, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }

  // cargo containers
  const crate = (col, label) => pbr({ size: 512, strength: 4, metal: 0.5, roughness: 0.6, paint: (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 20) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 0, 4, h); } overlayNoise(g, w, h, noiseCanvas(128, 8, 131, 4), 0.4); g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = 'bold 70px Arial'; g.fillText(label, 40, h * 0.6); g.fillStyle = 'rgba(120,60,20,0.35)'; g.fillRect(0, h * 0.85, w, h * 0.15); }, height: (g, w, h) => { for (let x = 0; x < w; x += 20) { g.fillStyle = '#e0e0e0'; g.fillRect(x + 4, 0, 14, h); } } });
  const cA = crate('#8a3a1a', 'KN-07'), cB = crate('#2a5a6a', 'ORE'), cC = crate('#6a6a2a', 'TIVAN');
  for (const [x, y, z, m, ry] of [[-12, 1.3, -9, cA, 0.1], [-12.4, 3.9, -9.2, cB, -0.05], [-8.8, 1.3, -10.5, cC, 0.3], [12.5, 1.3, -8.5, cB, -0.2], [9.5, 1.3, -10.8, cA, 0.15]]) add(group, new THREE.BoxGeometry(4.2, 2.6, 2.4), m, x, y, z, 0, ry, 0);
  // fuel tanks + pipes
  const tankM = new THREE.MeshStandardMaterial({ color: 0x8a8e96, metalness: 0.85, roughness: 0.3 });
  for (const x of [-4, 0.5]) { add(group, new THREE.CapsuleGeometry(1.0, 3.2, 8, 24), tankM, x, 1.1, -12.5, 0, 0, Math.PI / 2); add(group, new THREE.TorusGeometry(1.02, 0.06, 8, 32), strutM, x - 1.2, 1.1, -12.5, 0, Math.PI / 2, 0); add(group, new THREE.TorusGeometry(1.02, 0.06, 8, 32), strutM, x + 1.2, 1.1, -12.5, 0, Math.PI / 2, 0); }
  add(group, new THREE.CylinderGeometry(0.15, 0.15, 12, 12), strutM, -2, 2.4, -11.4, 0, 0, Math.PI / 2);
  // gantry crane over the back
  for (const x of [-7, 7]) add(group, new THREE.BoxGeometry(0.6, 9, 0.6), strutM, x, 4.5, -14);
  add(group, new THREE.BoxGeometry(15, 0.7, 0.7), strutM, 0, 9, -14);
  const hook = add(group, new THREE.CylinderGeometry(0.03, 0.03, 4, 6), strutM, 2, 7, -14);
  updaters.push((dt, t) => { hook.position.x = 2 + Math.sin(t * 0.3) * 3; });
  // holographic consoles
  const holo = makeCanvas(256, 160);
  const holoTex = toTex(holo);
  const holoM = new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  for (const [x, z, ry] of [[-14, -2, 0.9], [14.2, -1.2, -0.9]]) {
    add(group, new THREE.BoxGeometry(1.4, 1.1, 0.8), strutM, x, 0.55, z, 0, ry, 0);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), holoM); scr.position.set(x, 1.85, z); scr.rotation.y = ry; group.add(scr);
  }
  let hT = 0;
  updaters.push((dt, t) => {
    hT += dt; if (hT < 0.12) return; hT = 0;
    const g = holo.getContext('2d'); g.fillStyle = 'rgba(0,20,30,0.9)'; g.fillRect(0, 0, 256, 160);
    g.strokeStyle = '#4fe0ff'; g.lineWidth = 2; g.strokeRect(4, 4, 248, 152);
    g.beginPath(); for (let x = 0; x < 240; x += 4) g.lineTo(8 + x, 100 + Math.sin(x * 0.08 + t * 4) * 20 + Math.sin(x * 0.21 + t * 7) * 8); g.stroke();
    g.fillStyle = '#4fe0ff'; for (let i = 0; i < 8; i++) g.fillRect(12 + i * 29, 50 - Math.abs(Math.sin(t * 2 + i)) * 30, 20, Math.abs(Math.sin(t * 2 + i)) * 30);
    g.font = '14px monospace'; g.fillText('ORE YIELD ' + (80 + Math.sin(t) * 10).toFixed(1), 12, 145);
    holoTex.needsUpdate = true;
  });
  // antenna masts with orbs
  const orbM = new THREE.MeshBasicMaterial({ color: 0xff5ad1 });
  const orbs = [];
  for (const [x, z, hh] of [[-15.5, -12, 9], [15.5, -11, 7.5]]) { add(group, new THREE.CylinderGeometry(0.18, 0.4, hh, 8), strutM, x, hh / 2, z); const o = add(group, new THREE.OctahedronGeometry(0.55), orbM, x, hh + 0.8, z, 0, 0, 0, 1, 1, 1, false); orbs.push(o); }
  updaters.push((dt, t) => { orbs.forEach((o, i) => { o.rotation.y = t * 1.5 + i; o.visible = ((t + i * 0.5) % 1.2) < 0.9; }); });
  // asteroids and passing ships
  const rockM = new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 0.95, flatShading: true });
  const rocks = [];
  for (let i = 0; i < 26; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 3.2, 1), rockM); r.position.set(-80 + Math.random() * 160, -15 + Math.random() * 45, -35 - Math.random() * 90); r.rotation.set(Math.random() * 3, Math.random() * 3, 0); group.add(r); rocks.push({ r, s: (Math.random() - 0.5) * 0.4 }); }
  updaters.push((dt) => { for (const k of rocks) { k.r.rotation.x += k.s * dt; k.r.rotation.y += k.s * 0.7 * dt; } });
  const ships = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group();
    add(s, new THREE.ConeGeometry(0.8, 3.5, 6), new THREE.MeshStandardMaterial({ color: 0x8a8e96, metalness: 0.8, roughness: 0.3 }), 0, 0, 0, 0, 0, -Math.PI / 2, 1, 1, 1, false);
    add(s, new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 }), -1.9, 0, 0, 0, 0, 0, 1, 1, 1, false);
    s.position.set(-120 + i * 80, 25 + i * 9, -90 - i * 25); group.add(s); ships.push(s);
  }
  updaters.push((dt) => ships.forEach((s, i) => { s.position.x += (6 + i * 3) * dt; if (s.position.x > 150) s.position.x = -150; }));
  updaters.push(motes(group, 160, [-16, 16, -12, 5, 8], 0x9fd8ff, 0.05, 0.25));
  const lights = keyLights(group, { sky: 0x8a6cff, ground: 0x0a0812, hemi: 0.45, key: 0xfff0e6, keyI: 2.2, keyPos: [-6, 14, 8], rim: 0x9a7cff, rimI: 1.3, fill: 0x3fc8ff, fillI: 0.6 });
  const consoleLight = new THREE.PointLight(0x4fe0ff, 4, 6, 2); consoleLight.position.set(-14, 2, -1.5); group.add(consoleLight);
  return { group, updaters, fog: new THREE.FogExp2(0x070414, 0.0055), exposure: 1.0, lights, sky, envFloor: 0x1b1d24 };
}

// ------------------------------------------------------------------
// RAINBOW BRIDGE — crystal bridge before the golden city
// ------------------------------------------------------------------
function buildBifrost() {
  const group = new THREE.Group();
  const updaters = [];
  const sky = skyDome(0x081236, 0x34448e, 0x0b1020, `
    float band = sin(atan(vP.x, vP.z)*3.0 + y*6.0 + time*0.2);
    float aur = smoothstep(0.1, 0.5, y) * smoothstep(0.75, 0.35, y) * (0.5+0.5*band) * fbm(vec2(atan(vP.x,vP.z)*4.0 + time*0.05, y*2.0));
    c += vec3(0.2,0.9,0.7)*aur*0.6 + vec3(0.7,0.3,0.9)*aur*aur*0.5;
    c += vec3(1.0,0.72,0.4)*exp(-abs(y-0.03)*10.0)*0.4;`);
  group.add(sky);
  updaters.push((dt, t) => { sky.material.uniforms.time.value = t; });
  group.add(stars(1400, 380, 1.3));
  for (const [x, y, z, r, c] of [[-160, 120, -300, 14, 0xd8e0ff], [140, 95, -320, 7, 0xffd8b0]]) { const mo = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), new THREE.MeshBasicMaterial({ color: c, fog: false })); mo.position.set(x, y, z); group.add(mo); }

  // crystal rainbow bridge
  const bridgeM = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float time; varying vec3 vW; varying vec3 vN;
      vec3 hsv(float h){ return clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec2 p = vW.xz;
        // crystal facets
        vec2 cell = floor(p*vec2(1.2,1.6)); float f = hash(cell);
        float h = fract(vW.z*0.06 + vW.x*0.012 + time*0.04 + f*0.08);
        vec3 c = hsv(h) * (0.22 + 0.16*f);
        vec2 fp = fract(p*vec2(1.2,1.6)); float edge = smoothstep(0.04,0.0,min(min(fp.x,1.0-fp.x),min(fp.y,1.0-fp.y)));
        c += hsv(h+0.15) * edge * 0.45;
        float streak = smoothstep(0.93, 1.0, fract(vW.x*0.2 - time*0.5)) * 0.5;
        c += vec3(1.0)*streak*hsv(h+0.3);
        float spark = step(0.996, hash(floor(p*14.0) + floor(time*6.0))); c += vec3(1.0)*spark*1.5;
        vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - max(dot(V, normalize(vN)), 0.0), 3.0);
        c += vec3(0.6,0.7,1.0)*fr*0.15;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  updaters.push((dt, t) => { bridgeM.uniforms.time.value = t; });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(240, 0.6, 9), bridgeM);
  bridge.position.set(0, -0.3, -1.5); group.add(bridge);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(240, 9), new THREE.ShadowMaterial({ opacity: 0.55 }));
  sc.rotation.x = -Math.PI / 2; sc.position.set(0, 0.005, -1.5); sc.receiveShadow = true; group.add(sc);
  // ornate golden rails
  const goldM = new THREE.MeshStandardMaterial({ color: 0xc89a48, metalness: 0.7, roughness: 0.45 });
  for (const z of [-6]) {
    add(group, new THREE.BoxGeometry(240, 0.12, 0.18), goldM, 0, 0.75, z);
    add(group, new THREE.BoxGeometry(240, 0.06, 0.12), goldM, 0, 0.35, z);
    for (let x = -60; x <= 60; x += 3) { add(group, new THREE.CylinderGeometry(0.06, 0.09, 0.8, 8), goldM, x, 0.4, z); add(group, new THREE.SphereGeometry(0.11, 10, 8), goldM, x, 0.85, z); }
  }
  add(group, new THREE.BoxGeometry(240, 0.1, 0.12), goldM, 0, 0.02, 3.0);
  // ocean with mist
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x03060f, roughness: 0.6, metalness: 0.2 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -14; group.add(sea);
  const mistT = makeCanvas(512, 512, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.drawImage(noiseCanvas(256, 4, 141, 5, 1.8), 0, 0, w, h); });
  const mistTex = toTex(mistT, { repeat: [3, 3] });
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(600, 300), new THREE.MeshBasicMaterial({ color: 0x8090c0, alphaMap: mistTex, transparent: true, opacity: 0.35, depthWrite: false }));
  mist.rotation.x = -Math.PI / 2; mist.position.set(0, -9, -120); group.add(mist);
  updaters.push((dt) => { mistTex.offset.x += dt * 0.005; });
  // golden city: tiered spires around a central palace
  const winBand = makeCanvas(128, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 16) for (let x = 4; x < w; x += 12) if (Math.random() < 0.45) { g.fillStyle = `rgba(255,${(200 + Math.random() * 40) | 0},130,${0.4 + Math.random() * 0.6})`; g.fillRect(x, y, 4, 6); } });
  const cityM = new THREE.MeshStandardMaterial({ color: 0xe8b860, metalness: 0.55, roughness: 0.45, emissive: 0xffffff, emissiveMap: toTex(winBand, { repeat: [4, 3] }), emissiveIntensity: 0.9, fog: false });
  const tipM = new THREE.MeshBasicMaterial({ color: 0xfff0b0, fog: false });
  const spire = (x, z, h, r) => {
    const s = new THREE.Group(); s.position.set(x, -14, z); group.add(s);
    let y = 0, rr = r;
    for (let k = 0; k < 3; k++) { const hh = h * (0.45 - k * 0.1); add(s, new THREE.CylinderGeometry(rr * 0.85, rr, hh, 12), cityM, 0, y + hh / 2, 0, 0, 0, 0, 1, 1, 1, false); add(s, new THREE.TorusGeometry(rr * 0.9, rr * 0.08, 6, 16), cityM, 0, y + hh, 0, Math.PI / 2, 0, 0, 1, 1, 1, false); y += hh; rr *= 0.7; }
    add(s, new THREE.ConeGeometry(rr, h * 0.35, 12), cityM, 0, y + h * 0.175, 0, 0, 0, 0, 1, 1, 1, false);
    add(s, new THREE.SphereGeometry(rr * 0.35, 8, 6), tipM, 0, y + h * 0.36, 0, 0, 0, 0, 1, 1, 1, false);
  };
  const R = rng(19);
  spire(-10, -300, 150, 9); spire(-34, -290, 105, 6); spire(16, -295, 115, 6.5);
  for (let i = 0; i < 30; i++) spire(-300 + R() * 600, -250 - R() * 110, 35 + Math.pow(R(), 1.4) * 70, 1.6 + R() * 3.2);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(28, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), cityM); dome.position.set(-10, -14 + 20, -300); group.add(dome);
  // waterfalls pouring off the edge of the world
  const fallT = makeCanvas(128, 512, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { const x = Math.random() * w; g.strokeStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); g.moveTo(x, Math.random() * h); g.lineTo(x + (Math.random() - 0.5) * 3, Math.random() * h); g.stroke(); } });
  const fallTex = toTex(fallT, { repeat: [4, 1] });
  const fallM = new THREE.MeshBasicMaterial({ color: 0xbfd8ff, alphaMap: fallTex, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  for (const [x, z, w2] of [[-120, -150, 60], [90, -160, 45]]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(w2, 60), fallM); f.position.set(x, -40, z); group.add(f); }
  updaters.push((dt) => { fallTex.offset.y += dt * 0.6; });
  // observatory with spinning rings
  const obs = new THREE.Group(); obs.position.set(-125, 0, -1.5); group.add(obs);
  add(obs, new THREE.SphereGeometry(10, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), goldM, 0, -1, 0, 0, 0, 0, 1, 1, 1, false);
  const rings = [0, 1, 2].map((i) => add(obs, new THREE.TorusGeometry(13 + i * 2.2, 0.25, 8, 64), goldM, 0, 6, 0, 0, 0, 0, 1, 1, 1, false));
  updaters.push((dt, t) => rings.forEach((r, i) => { r.rotation.x = t * (0.2 + i * 0.1); r.rotation.y = t * (0.15 + i * 0.07); }));
  // mountains
  const mtM = new THREE.MeshStandardMaterial({ color: 0x1a2340, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(30 + Math.random() * 30, 40 + Math.random() * 50, 7), mtM); m.position.set(-260 + i * 40, -14, -290 - Math.random() * 40); group.add(m); }
  updaters.push(motes(group, 180, [-16, 16, -6, 3, 6], 0xffe8b0, 0.06, 0.35));
  const lights = keyLights(group, { sky: 0x9ab4ff, ground: 0x402a60, hemi: 0.6, key: 0xfff0d0, keyI: 2.2, rim: 0xffcf7a, rimI: 2.4, fill: 0x9f6bff, fillI: 0.6 });
  return { group, updaters, fog: new THREE.FogExp2(0x1a2550, 0.0038), exposure: 1.05, lights, sky, envFloor: 0x6a4a9a };
}

const BUILDERS = { rooftop: buildRooftop, space: buildSpace, bifrost: buildBifrost };

export function buildArena(id) {
  const a = (BUILDERS[id] || buildRooftop)();
  a.id = id;
  a.bounds = 10.5;
  a.update = (dt, t) => { for (const u of a.updaters) u(dt, t); };
  a.dispose = () => {
    if (a.envRT) a.envRT.dispose();
    a.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'alphaMap'].forEach((k) => m[k] && m[k].dispose()); m.dispose(); });
    });
  };
  return a;
}
