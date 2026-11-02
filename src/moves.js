// Normal attack tables plus scripted specials and ultimates for each hero.
// Times are seconds at attackSpeed 1; reach/heights are in meters at scale 1
// and relative to the fighter's feet.
import * as THREE from 'three';

const BASE = {
  jab:      { pose: ['jabW', 'jab'], startup: 0.07, active: 0.06, recovery: 0.14, dmg: 4, x0: 0.15, x1: 0.95, y0: 1.28, y1: 1.75, height: 'high', stun: 0.3, blockstun: 0.16, push: 1.6, kind: 'light', sfx: 'light', next: 'cross', chainWindow: 0.22 },
  cross:    { pose: ['crossW', 'cross'], startup: 0.08, active: 0.06, recovery: 0.17, dmg: 5, x0: 0.15, x1: 1.02, y0: 1.25, y1: 1.75, height: 'high', stun: 0.32, blockstun: 0.17, push: 2.0, kind: 'light', sfx: 'light', next: 'kick', chainWindow: 0.24 },
  kick:     { pose: ['kickW', 'kick'], startup: 0.11, active: 0.08, recovery: 0.25, dmg: 7, x0: 0.2, x1: 1.28, y0: 0.75, y1: 1.5, height: 'mid', stun: 0.42, blockstun: 0.2, push: 4.8, kind: 'medium', sfx: 'heavy' },
  heavy:    { pose: ['hookW', 'hook'], startup: 0.2, active: 0.08, recovery: 0.32, dmg: 11, x0: 0.15, x1: 1.15, y0: 1.05, y1: 1.75, height: 'mid', stun: 0.5, blockstun: 0.24, push: 6.5, kind: 'heavy', sfx: 'heavy' },
  sweep:    { pose: ['sweepW', 'sweep'], startup: 0.12, active: 0.1, recovery: 0.3, dmg: 6, x0: 0.2, x1: 1.35, y0: 0.0, y1: 0.45, height: 'low', stun: 0.4, blockstun: 0.2, push: 2.5, knockdown: true, kind: 'medium', sfx: 'heavy', crouch: true },
  upper:    { pose: ['upperW', 'upper'], startup: 0.14, active: 0.09, recovery: 0.42, dmg: 12, x0: 0.1, x1: 1.0, y0: 0.6, y1: 2.15, height: 'mid', stun: 0.5, blockstun: 0.26, push: 2.0, launch: 11.5, kind: 'heavy', sfx: 'heavy', crouch: true },
  airLight: { pose: ['jump', 'airKick'], startup: 0.06, active: 0.2, recovery: 0.1, dmg: 6, x0: 0.1, x1: 1.05, y0: -0.1, y1: 0.95, height: 'overhead', stun: 0.38, blockstun: 0.18, push: 2.2, kind: 'light', sfx: 'light', air: true },
  airHeavy: { pose: ['jump', 'diveKick'], startup: 0.1, active: 0.22, recovery: 0.12, dmg: 9, x0: 0.1, x1: 1.15, y0: -0.3, y1: 0.85, height: 'overhead', stun: 0.48, blockstun: 0.22, push: 3.2, kind: 'medium', sfx: 'heavy', air: true },
};

const OVERRIDES = {
  thor: { heavy: { pose: ['overheadW', 'overhead'], startup: 0.24, dmg: 13, x1: 1.45, y0: 0.6, height: 'overhead', color: 0x8fd0ff, sfx: 'heavy', zap: true } },
  // fast, heavy punch; two-handed overhead smash
  hulk: {
    jab: { startup: 0.09, dmg: 5.5, x1: 1.1, push: 2.6, sfx: 'heavy' }, cross: { dmg: 6, x1: 1.12, push: 3 },
    heavy: { pose: ['smashW', 'smash'], startup: 0.28, recovery: 0.34, dmg: 13, x1: 1.3, y0: 0.2, height: 'overhead', armor: true, knockdown: true, push: 7, shake: 0.6 },
  },
  gamora: {
    jab: { x1: 1.25, sfx: 'slash' }, cross: { x1: 1.3, sfx: 'slash' },
    heavy: { pose: ['slashW', 'slash'], x1: 1.75, dmg: 11, sfx: 'slash', color: 0x8fdcff },
  },
  // driving shield slam: rocks back, then lunges in shoulder-first and carries through the foe
  cap: { heavy: { pose: ['shieldBashW', 'shieldBash'], startup: 0.24, active: 0.1, recovery: 0.3, dmg: 12, x0: 0.1, x1: 1.2, y0: 0.6, y1: 1.85, push: 8.5, lunge: 5.5, shake: 0.5, sfx: 'shield', color: 0xbfd6ff } },
  ironman: { heavy: { color: 0x8fe0ff } },
  // web-assisted jab chain; spinning heel kick
  spiderman: {
    jab: { startup: 0.06, webFlick: true }, kick: { x1: 1.38 },
    heavy: { pose: ['spinKickW', 'spinKick'], startup: 0.15, active: 0.09, recovery: 0.26, dmg: 10, x0: 0.1, x1: 1.45, y0: 0.8, y1: 1.85, push: 6.2 },
  },
  doom: { heavy: { color: 0x7dff6a, zap: true, dmg: 11.5 } },
  // superhuman punches; the heavy launches the foe backwards
  sentry: { jab: { dmg: 5, color: 0xffd060 }, cross: { dmg: 5.5, color: 0xffd060 }, heavy: { dmg: 12, color: 0xffd060, x1: 1.2, push: 9, knockdown: true, shake: 0.5 } },
  // branch arms: long reach, slow, heavy horizontal swing
  groot: {
    jab: { startup: 0.1, dmg: 5, x1: 1.4, stretch: 1.45, sfx: 'heavy', color: 0xc8a060 }, cross: { startup: 0.11, dmg: 5.5, x1: 1.45, stretch: 1.5, color: 0xc8a060 },
    heavy: { pose: ['hookW', 'hook'], startup: 0.26, active: 0.1, recovery: 0.38, dmg: 12, x0: 0, x1: 2.0, y0: 0.5, y1: 2.1, push: 8.5, knockdown: true, stretch: 1.9, sfx: 'heavy', color: 0xc8a060, shake: 0.5 },
  },
  // claws, then a symbiote-swollen haymaker with a big reaction
  venom: {
    jab: { dmg: 5, x1: 1.1, sfx: 'slash', color: 0x9aa8ff }, cross: { dmg: 5.5, x1: 1.12, sfx: 'slash', color: 0x9aa8ff },
    heavy: { startup: 0.21, recovery: 0.34, dmg: 13.5, x1: 1.3, push: 9, knockdown: true, shake: 0.55, color: 0x6a74ff },
  },
  // quick katana pokes; spinning kick with short recovery
  deadpool: {
    jab: { startup: 0.05, dmg: 3.6, x1: 1.15, sfx: 'slash', color: 0xd8dcff }, cross: { startup: 0.06, dmg: 4.4, x1: 1.2, sfx: 'slash', color: 0xd8dcff },
    heavy: { pose: ['spinKickW', 'spinKick'], startup: 0.12, active: 0.1, recovery: 0.2, dmg: 9.5, x0: 0.1, x1: 1.4, y0: 0.8, y1: 1.85, push: 5 },
  },
};

export function movesFor(heroId) {
  const out = {};
  for (const [k, v] of Object.entries(BASE)) out[k] = Object.assign({ name: k }, v, (OVERRIDES[heroId] || {})[k] || {});
  return out;
}

// ------------------------------------------------------------------
// helpers used by scripts
// ------------------------------------------------------------------
let uid = 1;
export const newHitId = () => 'h' + (uid++);

function glowOrb(color, r) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })));
  return g;
}

function line3(color, radius = 0.025) {
  const geo = new THREE.CylinderGeometry(radius, radius, 1, 6, 1, true);
  geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  m.setEnds = (a, b) => { m.position.copy(a); m.lookAt(b); m.scale.set(1, 1, Math.max(0.01, a.distanceTo(b))); };
  return m;
}

function handPos(f, which = 'cast') {
  const j = f.rig.anchors && f.rig.anchors[which];
  if (!j) return new THREE.Vector3(f.x + f.facing * 0.6, f.y + 1.35 * f.scale, 0.2);
  j.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  j.getWorldPosition(v);
  return v;
}

// run fn after `delay` seconds of game time (stops with the effects when the match ends)
function setTimeoutGame(g, delay, fn) {
  const holder = new THREE.Object3D();
  let done = false;
  g.fx.timed(holder, delay, (m, k) => { if (k >= 1 && !done) { done = true; fn(); } });
}

// a mesh that rides on a fighter for `life` seconds, then is removed and disposed
function attachFx(g, target, mesh, life, fn) {
  mesh.userData.disposeTree = true;
  g.fx.timed(mesh, life, (m, k, dt) => { m.position.set(target.x, target.y, 0); fn && fn(m, k, dt); });
}

// web strands wrapped around a pinned foe
function webWrap(g, target, life) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6, transparent: true });
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.3 * target.scale, 0.014, 4, 18), mat.clone());
    r.position.y = (0.25 + i * 0.32) * target.scale; r.rotation.x = Math.PI / 2 + (i % 2 ? 0.25 : -0.25); r.scale.set(1, 0.75, 1);
    grp.add(r);
  }
  attachFx(g, target, grp, life, (m, k) => m.children.forEach((c) => { c.material.opacity = k > 0.75 ? (1 - k) * 4 : 1; }));
}

// gnarled roots: a cluster of tapered, bent cones
const BARK = () => new THREE.MeshStandardMaterial({ color: 0x5a3e22, roughness: 0.95, flatShading: true });
function rootCluster(n, spread, height, mat = BARK()) {
  const grp = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const h = height * (0.6 + Math.random() * 0.6);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.07 + Math.random() * 0.06, h, 5, 3), mat);
    c.geometry.translate(0, h / 2, 0);
    const pos = c.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) { const y = pos.getY(v) / h; pos.setX(v, pos.getX(v) + Math.sin(y * 3 + i) * 0.08 * y); }
    c.geometry.computeVertexNormals();
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    c.position.set(Math.cos(a) * spread * Math.random(), 0, Math.sin(a) * spread * 0.6 * Math.random());
    c.rotation.set((Math.random() - 0.5) * 0.7, Math.random() * 6, (Math.random() - 0.5) * 0.7);
    c.castShadow = true;
    grp.add(c);
  }
  return grp;
}
// roots erupt out of the ground, hold, then sink back
function rootBurst(g, x, life, { n = 7, spread = 0.5, height = 1.0, follow = null } = {}) {
  const grp = rootCluster(n, spread, height);
  grp.position.set(x, 0, 0);
  grp.scale.set(1, 0.01, 1);
  grp.userData.disposeTree = true;
  g.fx.timed(grp, life, (m, k) => {
    if (follow) m.position.x = follow.x;
    m.scale.y = k < 0.15 ? k / 0.15 : k > 0.8 ? Math.max(0.01, (1 - k) / 0.2) : 1;
  });
  g.fx.dust(new THREE.Vector3(x, 0.1, 0), 8);
  g.fx.emit(new THREE.Vector3(x, 0.4, 0), { count: 6, color: 0x5fa83a, color2: 0x9ad860, speed: 3, life: 0.8, size: 0.16, up: 2, gravity: -5 });
}

// writhing symbiote tendrils: tubes from `base` toward targets, rebuilt every frame
function tendrilSet(g, n) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x05050a, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.5, sheenColor: new THREE.Color(0x4a5aa0) });
  const list = [];
  for (let i = 0; i < n; i++) { const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m); mesh.castShadow = true; g.fx.group.add(mesh); list.push({ mesh, i }); }
  return { list, m };
}
function drawTendrils(set, base, targetFn, reach, thick = 0.05) {
  const V3 = THREE.Vector3, tt = performance.now() * 0.001;
  for (const tn of set.list) {
    const i = tn.i;
    const spread = new V3(Math.sin(i * 1.7) * 0.5, Math.cos(i * 2.3) * 0.45, Math.sin(i * 0.9) * 0.4);
    const end = base.clone().lerp(targetFn(i).add(spread.clone().multiplyScalar(0.5)), reach);
    const mid1 = base.clone().lerp(end, 0.33).add(new V3(0, 0.5 + Math.sin(tt * 6 + i) * 0.3, Math.cos(tt * 5 + i) * 0.45 - 0.25)).add(spread.clone().multiplyScalar(0.6));
    const mid2 = base.clone().lerp(end, 0.7).add(new V3(0, 0.25 + Math.sin(tt * 7 + i * 2) * 0.25, Math.sin(tt * 4 + i) * 0.35));
    tn.mesh.geometry.dispose();
    tn.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([base.clone().add(spread.clone().multiplyScalar(0.25)), mid1, mid2, end]), 20, thick * (1 - (i % 3) * 0.18), 6, false);
  }
}
function removeTendrils(g, set) {
  if (!set) return;
  for (const tn of set.list) { g.fx.group.remove(tn.mesh); tn.mesh.geometry.dispose(); }
  set.m.dispose();
}

// grow or shrink a fighter's whole model (Groot's giant form, Venom's swell)
function growTo(f, k, dt, rate = 6) { const s = f.root.scale.x + (k - f.root.scale.x) * Math.min(1, dt * rate); f.root.scale.setScalar(s); }

function seq(f, steps, t, run) {
  while (f.seqIdx < steps.length && t >= steps[f.seqIdx].at) { run(steps[f.seqIdx], f.seqIdx); f.seqIdx++; }
  return f.seqIdx >= steps.length;
}

// ------------------------------------------------------------------
// SPECIALS — start(f, g) then update(f, g, t, dt) returns false when done
// ------------------------------------------------------------------
export const SPECIALS = {
  doomBolt: {
    update(f, g, t) {
      const GREEN = 0x7dff6a;
      if (t < 0.18) {
        f.setPose('castW');
        if (Math.random() < 0.5) { const h = handPos(f); g.fx.bolt(h, h.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.5, 0)), GREEN, 0.06, 0.02, 0); }
        return true;
      }
      f.setPose('cast');
      if (!f.fired) {
        f.fired = true;
        const p = handPos(f);
        g.spawnProjectile({ owner: f, x: p.x + f.facing * 0.2, y: p.y, vx: f.facing * 17, r: 0.32, life: 1.1, mesh: glowOrb(0x4aff4a, 0.3), trail: GREEN,
          hit: { dmg: 10, height: 'mid', stun: 0.45, blockstun: 0.22, push: 4, kind: 'special', sfx: 'zap', sfxVol: 0.6, color: GREEN },
          onUpdate: (pr) => { if (Math.random() < 0.5) { const a = new THREE.Vector3(pr.x, pr.y, 0); g.fx.bolt(a, a.clone().add(new THREE.Vector3(-pr.vx * 0.03 + (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, 0)), GREEN, 0.05, 0.025, 0); } } });
        g.audio.play('zap', 0.7); g.audio.play('blast', 0.5);
        g.fx.emit(p, { count: 18, color: 0xc8ffc0, color2: GREEN, speed: 6, life: 0.25, size: 0.25 });
      }
      return t < 0.5;
    },
  },

  solarFlare: {
    update(f, g, t) {
      if (t < 0.2) { f.setPose('castW'); if (f.rig.aura) f.rig.aura.intensity = t * 30; return true; }
      f.setPose('castBoth');
      if (!f.fired) {
        f.fired = true;
        const p = f.chestPos().add(new THREE.Vector3(f.facing * 0.5, 0, 0));
        g.spawnProjectile({ owner: f, x: p.x, y: p.y, vx: f.facing * 15, r: 0.46, life: 1.2, mesh: glowOrb(0xffc840, 0.42), trail: 0xffd060,
          hit: { dmg: 11, height: 'mid', stun: 0.5, blockstun: 0.26, push: 4.5, kind: 'special', sfx: 'heavy', color: 0xffd060 } });
        g.audio.play('blast'); g.audio.play('beam', 0.35);
        g.fx.emit(p, { count: 30, color: 0xffffff, color2: 0xffc840, speed: 7, life: 0.3, size: 0.3 });
        g.fx.flashLight(p, 0xffd060, 12, 0.25);
      }
      if (f.rig.aura) f.rig.aura.intensity = Math.max(0, 6 - (t - 0.2) * 20);
      return t < 0.55;
    },
  },

  repulsor: {
    update(f, g, t) {
      if (t < 0.16) { f.setPose('castW'); if (f.rig.glowMat) f.rig.glowMat.emissiveIntensity = 3 + t * 30; }
      else {
        f.setPose('cast');
        if (!f.fired) {
          f.fired = true;
          if (f.rig.glowMat) f.rig.glowMat.emissiveIntensity = 3;
          const p = handPos(f);
          g.spawnProjectile({ owner: f, x: p.x + f.facing * 0.2, y: p.y, vx: f.facing * 19, r: 0.3, life: 1.0, mesh: glowOrb(0x7fd8ff, 0.3), trail: 0x7fd8ff,
            hit: { dmg: 9, height: 'mid', stun: 0.42, blockstun: 0.22, push: 3.8, kind: 'special', sfx: 'heavy', color: 0x7fd8ff } });
          g.audio.play('blast');
          g.fx.emit(p, { count: 16, color: 0xbfefff, speed: 6, life: 0.2, size: 0.25 });
          g.fx.flashLight(p, 0x7fd8ff, 8, 0.2);
        }
      }
      return t < 0.46;
    },
  },

  // web projectile: pins the foe briefly (roots them), then slows them
  webShot: {
    update(f, g, t) {
      if (t < 0.1) { f.setPose('castW'); return true; }
      f.setPose('cast');
      if (!f.fired) {
        f.fired = true;
        const p = handPos(f);
        const web = line3(0xf2f2f2, 0.014);
        g.fx.group.add(web);
        g.spawnProjectile({ owner: f, x: p.x, y: p.y, vx: f.facing * 22, r: 0.3, life: 0.6, mesh: glowOrb(0xffffff, 0.2), trail: 0xffffff,
          hit: { dmg: 5, height: 'mid', stun: 0.35, blockstun: 0.18, push: 0.6, root: 0.8, slow: 1.6, kind: 'special', sfx: 'web', color: 0xffffff },
          onUpdate: (pr) => { web.setEnds(handPos(f), new THREE.Vector3(pr.x, pr.y, 0)); },
          onHitResult: (res, target) => { if (res === 'hit') webWrap(g, target, 0.85); },
          onEnd: () => { g.fx.group.remove(web); web.geometry.dispose(); web.material.dispose(); } });
        g.audio.play('web');
      }
      return t < 0.42;
    },
  },

  lightning: {
    update(f, g, t) {
      const opp = g.opponentOf(f);
      if (t < 0.22) f.setPose('skyW');
      else f.setPose('sky');
      if (t >= 0.22 && f.targetX === undefined) {
        f.targetX = THREE.MathUtils.clamp(opp.x + opp.vx * 0.2, -g.bounds, g.bounds);
        const mark = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        mark.rotation.x = -Math.PI / 2; mark.position.set(f.targetX, 0.03, 0);
        g.fx.timed(mark, 0.36, (m, k) => { m.scale.setScalar(1.4 - k * 0.6); m.material.opacity = 0.4 + 0.5 * Math.sin(k * 30); });
        g.fx.bolt(handPos(f), handPos(f).add(new THREE.Vector3(0, 3, 0)), 0x9fd8ff, 0.2, 0.06, 1);
        g.audio.play('whoosh');
      }
      if (t >= 0.58 && !f.fired) {
        f.fired = true;
        const x = f.targetX;
        g.fx.bolt(new THREE.Vector3(x + (Math.random() - 0.5), 16, -0.5), new THREE.Vector3(x, 0, 0), 0x9fd8ff, 0.35, 0.16, 4);
        g.fx.emit(new THREE.Vector3(x, 0.2, 0), { count: 40, color: 0xffffff, color2: 0x6fc0ff, speed: 9, life: 0.4, size: 0.22, up: 3, gravity: -12 });
        g.fx.ring(new THREE.Vector3(x, 0.05, 0), 0x8fd0ff, 2.4, 0.35);
        g.audio.play('zap'); g.shake(0.45);
        g.zoneHit(f, { x0: x - 0.85, x1: x + 0.85, y0: 0, y1: 14 }, { id: newHitId(), dmg: 12, height: 'mid', stun: 0.55, blockstun: 0.28, push: 3, kind: 'special', sfx: 'heavy', color: 0x8fd0ff, srcX: x });
      }
      return t < 0.82;
    },
  },

  // slam the floor: a local shockwave around the impact that staggers and slows (block low)
  groundBreaker: {
    update(f, g, t) {
      if (t < 0.3) { f.setPose('smashW'); f.armor = true; return true; }
      f.setPose('smash', 30); f.armor = false;
      if (!f.fired) {
        f.fired = true;
        const x = THREE.MathUtils.clamp(f.x + f.facing * 1.1 * f.scale, -g.bounds, g.bounds);
        const p = new THREE.Vector3(x, 0.05, 0);
        g.audio.play('boom', 0.85); g.audio.play('roar', 0.4); g.shake(0.75); g.hitstop(0.06);
        g.fx.ring(p, 0xffb070, 3.3, 0.42); g.fx.ring(p, 0xffffff, 1.9, 0.25); g.fx.dust(p, 36);
        g.fx.flashLight(new THREE.Vector3(x, 0.6, 0), 0xffa060, 10, 0.25);
        // chunks of floor kicked up around the crater
        const rockM = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 1, flatShading: true });
        const rocks = new THREE.Group(); rocks.userData.disposeTree = true; rocks.position.copy(p);
        for (let i = 0; i < 9; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + Math.random() * 0.14, 0), rockM); r.userData.v = new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random() * 4, (Math.random() - 0.5) * 3); r.castShadow = true; rocks.add(r); }
        g.fx.timed(rocks, 0.9, (m, k, dt) => m.children.forEach((r) => { r.userData.v.y -= 22 * dt; r.position.addScaledVector(r.userData.v, dt); if (r.position.y < 0) { r.position.y = 0; r.userData.v.multiplyScalar(0.3); } r.rotation.x += dt * 9; }));
        g.zoneHit(f, { x0: x - 2.3, x1: x + 2.3, y0: 0, y1: 1.4 }, { id: newHitId(), dmg: 11, height: 'low', stun: 0.55, blockstun: 0.26, push: 3.5, slow: 1.2, kind: 'special', sfx: 'heavy', color: 0xffb070, srcX: f.x });
      }
      return t < 0.75;
    },
  },

  shieldThrow: {
    canStart(f) { return !f.shieldOut; },
    update(f, g, t) {
      if (t < 0.12) f.setPose('castW');
      else {
        f.setPose('cast');
        if (!f.fired) {
          f.fired = true;
          f.shieldOut = true;
          if (f.rig.shield) f.rig.shield.visible = false;
          const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 28), f.rig.shield ? f.rig.shield.children[0].material : new THREE.MeshBasicMaterial({ color: 0xc0c0c0 }));
          disc.rotation.x = Math.PI / 2;
          const holder = new THREE.Group(); holder.add(disc);
          const p = handPos(f);
          let returning = false;
          const startX = p.x;
          g.spawnProjectile({ owner: f, x: p.x, y: p.y, vx: f.facing * 17, r: 0.34, life: 3.5, mesh: holder, trail: 0xbfd6ff, persistent: true, keepMesh: true,
            hit: { dmg: 7, height: 'mid', stun: 0.4, blockstun: 0.2, push: 3, kind: 'special', sfx: 'shield', color: 0xbfd6ff },
            onUpdate: (pr, dt) => {
              holder.rotation.z += dt * 25;
              if (!returning && (Math.abs(pr.x - startX) > 9 || Math.abs(pr.x) > g.bounds + 1 || pr.hitCount > 0)) {
                returning = true; pr.resetHits(); g.audio.play('shield', 0.6);
              }
              if (returning) {
                const h = handPos(f);
                const dx = h.x - pr.x, dy = h.y - pr.y; const d = Math.hypot(dx, dy) || 1;
                pr.vx = dx / d * 19; pr.vy = dy / d * 19;
                if (d < 0.6) pr.kill();
              }
            },
            onEnd: () => {
              f.shieldOut = false;
              if (f.rig.shield) f.rig.shield.visible = true;
            } });
          g.audio.play('whoosh');
        }
      }
      return t < 0.42;
    },
  },

  dashSlash: {
    update(f, g, t, dt) {
      if (t < 0.1) { f.setPose('slashW'); f.vx = 0; }
      else if (t < 0.3) {
        if (!f.fired) { f.fired = true; f.hitId = newHitId(); g.audio.play('slash'); }
        f.setPose('slash', 30);
        f.vx = f.facing * 21; f.noPush = true;
        g.fx.emit(new THREE.Vector3(f.x, f.y + 1.1, 0), { count: 3, color: 0x6fd0ff, speed: 0.5, life: 0.25, size: 0.5, drag: 6 });
        const x0 = f.x - f.facing * 0.3, x1 = f.x + f.facing * 1.4;
        g.zoneHit(f, { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: 0.5, y1: 1.85 }, { id: f.hitId, dmg: 11, height: 'mid', stun: 0.55, blockstun: 0.25, push: 4.5, kind: 'special', sfx: 'slash', color: 0x8fdcff, srcX: f.x - f.facing });
      } else {
        f.noPush = false;
        f.vx *= Math.max(0, 1 - 14 * dt);
        f.setPose('slash');
      }
      return t < 0.56;
    },
  },

  // roots race along the floor; a hit binds the foe's feet for a follow-up
  rootSnare: {
    update(f, g, t) {
      if (t < 0.24) { f.setPose('smashW'); f.reachWant = 1.3; return true; }
      f.setPose('smash', 30); f.reachWant = 1.6;
      if (!f.fired) {
        f.fired = true;
        const x0 = f.x + f.facing * 0.9 * f.scale;
        g.audio.play('wood'); g.fx.dust(new THREE.Vector3(x0, 0.05, 0), 10);
        const head = rootCluster(5, 0.25, 0.7);
        let trail = 0;
        g.spawnProjectile({ owner: f, x: x0, y: 0.3, vx: f.facing * 12, r: 0.5, life: 0.8, mesh: head, ground: true, clash: false,
          hit: { dmg: 7, height: 'low', stun: 0.45, blockstun: 0.22, push: 1, root: 1.0, slow: 0.6, kind: 'special', sfx: 'heavy', color: 0xc8a060 },
          onUpdate: (pr, dt) => {
            head.position.y = -0.3; head.rotation.y += dt * 4;
            trail -= dt;
            if (trail <= 0) { trail = 0.07; rootBurst(g, pr.x, 0.55, { n: 3, spread: 0.25, height: 0.45 }); }
          },
          onHitResult: (res, target) => { if (res === 'hit') { rootBurst(g, target.x, 1.05, { n: 9, spread: 0.35, height: 0.9 * target.scale, follow: target }); g.audio.play('wood', 0.8); } } });
      }
      return t < 0.6;
    },
  },

  // a tendril whips out to medium range; readable windup, clear hit or miss
  symbioteLash: {
    update(f, g, t) {
      const END = 0.56;
      if (t < 0.2) { f.setPose('castW'); if (!f.chargeFx) { f.chargeFx = true; g.audio.play('squelch', 0.7); } return true; }
      f.setPose('cast');
      if (!f.lash) f.lash = tendrilSet(g, 2);
      const reach = 3.4 * f.scale;
      const ext = t < 0.32 ? (t - 0.2) / 0.12 : Math.max(0, 1 - (t - 0.36) / 0.18);
      const base = handPos(f);
      const tip = new THREE.Vector3(base.x + f.facing * reach, base.y - 0.1, 0.2);
      drawTendrils(f.lash, base, () => tip.clone(), ext, 0.045);
      if (t >= 0.3 && !f.fired) {
        f.fired = true;
        const x1 = f.x + f.facing * (reach + 0.4);
        const r = g.zoneHit(f, { x0: Math.min(f.x, x1), x1: Math.max(f.x, x1), y0: 0.6, y1: 1.9 }, { id: newHitId(), dmg: 9, height: 'mid', stun: 0.5, blockstun: 0.24, push: 4, kind: 'special', sfx: 'slash', color: 0x9aa8ff, srcX: f.x });
        g.audio.play(r === 'hit' ? 'squelch' : 'whoosh', 0.9);
      }
      if (t >= END) { SPECIALS.symbioteLash.cleanup(f, g); return false; }
      return true;
    },
    cleanup(f, g) { removeTendrils(g, f.lash); f.lash = null; },
  },

  // two quick pistol shots
  quickdraw: {
    update(f, g, t) {
      if (t < 0.08) { f.setPose('castW'); return true; }
      const shoot = (which) => {
        const p = handPos(f, which);
        g.spawnProjectile({ owner: f, x: p.x + f.facing * 0.15, y: p.y, vx: f.facing * 34, r: 0.18, life: 0.45, mesh: glowOrb(0xffd27a, 0.07), trail: 0xffe0a0,
          hit: { dmg: 3.6, height: 'mid', stun: 0.28, blockstun: 0.14, push: 1.4, kind: 'special', sfx: 'light', color: 0xffe080 } });
        g.audio.play('gun');
        g.fx.emit(p, { count: 10, color: 0xffffff, color2: 0xffb040, dir: new THREE.Vector3(f.facing, 0, 0), speed: 6, spread: 0.4, life: 0.12, size: 0.18 });
        g.fx.flashLight(p, 0xffc070, 6, 0.08);
      };
      if (!f.fired) { f.fired = 1; f.setPose('cast', 40); shoot('cast'); }
      if (t >= 0.2 && f.fired === 1) { f.fired = 2; shoot('cast2'); }
      f.setPose(t < 0.2 ? 'cast' : 'castBoth', 40);
      return t < 0.42;
    },
  },
};

// ------------------------------------------------------------------
// ULTIMATES — run after the cinematic freeze. Same contract as specials.
// ------------------------------------------------------------------
function lockCombo(f, g, t, steps) {
  const opp = g.opponentOf(f);
  // a step's pose holds until the next step changes it (poses are cleared every frame)
  const done = seq(f, steps, t - f.lockT, (s) => {
    if (s.pose) f.comboPose = s.pose;
    if (s.reposition) s.reposition(f, opp);
    if (s.dmg) {
      g.directHit(f, opp, { id: newHitId(), dmg: s.dmg, stun: 0.6, push: 0, kind: 'ult', sfx: s.sfx || 'light', color: s.color || 0xffd27a, launch: s.launch, knockdown: s.knockdown, keepLock: !s.final, spark: s.spark ?? (s.final ? 2 : 1), noFlash: s.noFlash });
      if (s.final) { g.shake(0.8); g.hitstop(0.18); }
    }
    s.fx && s.fx(f, opp);
  });
  if (f.comboPose) f.setPose(f.comboPose, 40);
  return done;
}

function startLock(f, g, opp) {
  f.lockT = f.ultT;
  f.seqIdx = 0;
  f.locked = true;
  opp.lockBy(f);
}

// one blow inside a locked ultimate (same contract as a lockCombo step)
function ultHit(f, g, opp, s) {
  g.directHit(f, opp, { id: newHitId(), dmg: s.dmg, stun: 0.6, push: 0, kind: 'ult', sfx: s.sfx || 'light', color: s.color || 0xffd27a, launch: s.launch, knockdown: s.knockdown, keepLock: !s.final, spark: s.spark ?? (s.final ? 2 : 1), noFlash: s.noFlash, shake: s.shake });
  if (s.final) { g.shake(0.8); g.hitstop(0.18); }
}

// a dark pit with cracks radiating across the floor; fades out after `life`
function crater(g, x, radius, life, color = 0x0b0907) {
  const grp = new THREE.Group(); grp.userData.disposeTree = true;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
  const pit = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.45, 18), mat);
  pit.rotation.x = -Math.PI / 2; grp.add(pit);
  for (let i = 0; i < 10; i++) {
    const len = radius * (0.6 + Math.random() * 0.9);
    const geo = new THREE.PlaneGeometry(len, 0.03 + Math.random() * 0.035);
    geo.translate(len / 2 + radius * 0.3, 0, 0); geo.rotateX(-Math.PI / 2);
    const c = new THREE.Mesh(geo, mat); c.rotation.y = (i / 10) * Math.PI * 2 + Math.random() * 0.5; grp.add(c);
  }
  grp.position.set(x, 0.012, 0);
  g.fx.timed(grp, life, (m, k) => { m.scale.setScalar(Math.min(1, k * 25)); mat.opacity = k > 0.6 ? 0.85 * (1 - k) / 0.4 : 0.85; });
}

// Captain America's shield: painted disc (rings, blue field, white star) for throws
let shieldTex = null;
function shieldDisc() {
  if (!shieldTex) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    [[128, '#b8141c'], [104, '#e8e8ec'], [80, '#b8141c'], [56, '#1c3c8c']].forEach(([r, col]) => { x.fillStyle = col; x.beginPath(); x.arc(128, 128, r, 0, Math.PI * 2); x.fill(); });
    x.fillStyle = '#f4f4f8'; x.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 20 : 50; x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); }
    x.fill();
    shieldTex = new THREE.CanvasTexture(c); shieldTex.colorSpace = THREE.SRGBColorSpace;
  }
  const face = new THREE.MeshStandardMaterial({ map: shieldTex, metalness: 0.55, roughness: 0.3 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 32), [new THREE.MeshStandardMaterial({ color: 0x9a9aa4, metalness: 0.9, roughness: 0.25 }), face, face]);
  disc.rotation.x = Math.PI / 2;
  const holder = new THREE.Group(); holder.add(disc); holder.userData.disposeTree = true;
  return holder;
}
// the shield hand: the built-in Cap carries it on the forearm, the imported model in the left hand
function shieldHand(f) { return f.rig.anchors && f.rig.anchors.shield ? 'shield' : 'cast2'; }
// hide or show the shield Cap is holding (built-in group, or the model's shield material)
function capShield(f, on) {
  if (f.rig.shield) { f.rig.shield.visible = on; return; }
  f.rig.root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (/shield/i.test(m.name || '')) m.visible = on; });
}

// Venom's symbiote greatsword: a long, jagged, glossy-black blade (+Y from the grip)
function venomBlade() {
  const L = 1.55, s = new THREE.Shape();
  const left = [[-0.07, 0], [-0.13, 0.12], [-0.09, 0.26], [-0.16, 0.45], [-0.1, 0.62], [-0.15, 0.82], [-0.08, 1.02], [-0.12, 1.2], [-0.05, 1.38]];
  const right = [[0.07, 0], [0.12, 0.16], [0.08, 0.32], [0.15, 0.5], [0.09, 0.7], [0.14, 0.9], [0.07, 1.08], [0.1, 1.26], [0.04, 1.4]];
  s.moveTo(...left[0]); for (const p of left.slice(1)) s.lineTo(...p);
  s.lineTo(0, L); for (const p of right.slice().reverse()) s.lineTo(...p);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 1 });
  geo.translate(0, 0, -0.0175);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x04040a, roughness: 0.18, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.6, sheenColor: new THREE.Color(0x4a5aa0), emissive: 0x0c1440, emissiveIntensity: 0.6 });
  const blade = new THREE.Mesh(geo, mat); blade.castShadow = true;
  // biomass knotted around the hand where the arm becomes the blade
  const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), mat); knot.scale.set(1, 1.5, 0.8);
  const grp = new THREE.Group(); grp.add(blade); grp.add(knot);
  return grp;
}

export const ULTIMATES = {
  doomWrath: {
    update(f, g, t) {
      const opp = g.opponentOf(f);
      const GREEN = 0x7dff6a;
      if (!f.locked) {
        f.setPose(t < 0.22 ? 'castW' : 'castBoth');
        if (t >= 0.22 && !f.fired) {
          f.fired = true;
          g.audio.play('zap', 1.1);
          const reach = f.x + f.facing * 9;
          g.fx.bolt(handPos(f), opp.chestPos(), GREEN, 0.35, 0.1, 3);
          const r = g.zoneHit(f, { x0: Math.min(f.x, reach), x1: Math.max(f.x, reach), y0: 0.2, y1: 2.4 }, { id: newHitId(), dmg: 3, height: 'mid', stun: 0.8, blockstun: 0.35, push: 1, kind: 'ult', sfx: 'zap', color: GREEN });
          if (r === 'hit' && opp.hp > 0) startLock(f, g, opp);
        }
        return t < 0.9;
      }
      f.setPose('castBoth');
      // levitate the foe and pour green lightning into them
      if (opp.state === 'locked') { opp.onGround = false; opp.y = Math.min(1.6, opp.y + g.dt * 2.4); }
      if (Math.random() < 0.85) { g.fx.bolt(handPos(f), opp.chestPos(), GREEN, 0.06, 0.07, 1); g.fx.bolt(handPos(f, 'cast2'), opp.chestPos(), 0xb0ff9a, 0.06, 0.05, 1); }
      g.fx.emit(opp.chestPos(), { count: 3, color: GREEN, color2: 0xffffff, speed: 4, life: 0.3, size: 0.25 });
      const blast = () => { const c = opp.chestPos(); g.fx.ring(c.clone().setZ(0.3), GREEN, 4, 0.45, 'face'); g.fx.emit(c, { count: 90, color: 0xffffff, color2: GREEN, speed: 16, life: 0.6, size: 0.35 }); g.fx.flashLight(c, GREEN, 30, 0.4); g.audio.play('boom', 1.2); };
      const done = lockCombo(f, g, t, [
        { at: 0.15, dmg: 4, sfx: 'zap', color: GREEN }, { at: 0.42, dmg: 4, sfx: 'zap', color: GREEN },
        { at: 0.69, dmg: 4, sfx: 'zap', color: GREEN }, { at: 0.96, dmg: 4, sfx: 'zap', color: GREEN },
        { at: 1.25, dmg: 9, sfx: 'heavy', launch: 10, final: true, color: GREEN, fx: blast },
        { at: 1.8 },
      ]);
      return !done;
    },
  },

  // THE VOID — SHADOW ERASURE: Sentry turns into the Void, the arena dims, shadow creeps across
  // the floor and the foe is turned to a silhouette, dissolved, and returned (only visually —
  // the fighter, its health and controls stay intact throughout)
  voidErasure: {
    update(f, g, t, dt) {
      const opp = g.opponentOf(f);
      const PURPLE = 0x5a1a8a;
      f.rig.setVoid(1);
      if (f.rig.aura) { f.rig.aura.color.set(0x6a10c0); f.rig.aura.intensity = 3 + Math.sin(t * 14) * 1.2; }
      if (!f.started) {
        f.started = true;
        g.setDark(0.75, 3.4);
        g.audio.play('void', 1.1); g.shake(0.3);
        f.tide = new THREE.Group(); f.tide.userData.disposeTree = true; g.fx.group.add(f.tide);
        const blot = new THREE.MeshBasicMaterial({ color: 0x020005, transparent: true, opacity: 0.88, depthWrite: false });
        for (let i = 0; i < 26; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.35 + Math.random() * 0.35, 12), blot); d.rotation.x = -Math.PI / 2; d.position.set(i * 0.38, 0.012 + i * 0.0004, (Math.random() - 0.5) * 0.9); d.scale.setScalar(0.001); f.tide.add(d); }
      }
      // shadow smoke curling off the Void
      g.fx.emit(f.chestPos().add(new THREE.Vector3(0, (Math.random() - 0.5) * 1.2, 0)), { dark: true, count: 3, color: 0x050208, color2: 0x1a0828, speed: 1.2, life: 0.9, size: 0.5, up: 0.8, jitter: 0.6, grow: 0.6 });
      // the shadow tide spreads along the floor toward the foe, then recedes
      const reachX = Math.min(Math.abs(opp.x - f.x) + 1.2, 9.5);
      const spreadK = THREE.MathUtils.clamp((t - 0.45) / 0.45, 0, 1) * (f.recede !== undefined ? Math.max(0, 1 - (t - f.recede) / 0.5) : 1);
      f.tide.position.set(f.x, 0, 0); f.tide.scale.x = f.facing;
      f.tide.children.forEach((d, i) => { const at = i * 0.38; const on = at <= reachX * spreadK; d.scale.setScalar(THREE.MathUtils.lerp(d.scale.x, on ? 1 + Math.sin(t * 3 + i) * 0.08 : 0.001, Math.min(1, dt * 10))); });
      if (!f.locked) {
        f.setPose(t < 0.45 ? 'charge' : t < 0.82 ? 'castW' : 'cast', t < 0.82 ? 14 : 30);
        if (t >= 0.86 && !f.fired) {
          // the Void reaches out: anything standing in the shadow is taken
          f.fired = true;
          const x1 = f.x + f.facing * reachX;
          const r = g.zoneHit(f, { x0: Math.min(f.x, x1), x1: Math.max(f.x, x1), y0: 0, y1: 2.6 }, { id: newHitId(), dmg: 3, height: 'mid', stun: 0.9, blockstun: 0.45, push: 1.5, kind: 'ult', sfx: 'heavy', color: PURPLE, chip: 0.25 });
          if (r === 'hit' && opp.hp > 0) { startLock(f, g, opp); opp.frozen = true; f.erasing = true; g.focusOn(opp, 1.9, { dx: 1.3, dz: 3.2, dy: -0.5 }); }
          else f.recede = t;
        }
        if (f.recede !== undefined && t > f.recede + 0.6) { ULTIMATES.voidErasure.cleanup(f, g); return false; }
        return true;
      }
      const lt = t - f.lockT;
      f.setPose(lt < 1.7 ? 'cast' : 'castBoth');
      if (f.erasing) {
        // freeze → silhouette → dissolve to drifting shadow → gone → return
        opp.rig.setVoid(lt < 1.45 ? 1 : 0);
        const fade = lt < 0.6 ? 1 : lt < 1.25 ? 1 - (lt - 0.6) / 0.65 : lt < 1.5 ? 0 : Math.min(1, (lt - 1.5) / 0.3);
        opp.rig.setFade(fade);
        if (lt > 0.45 && lt < 1.35) {
          // the body comes apart into drifting flakes of shadow
          for (let i = 0; i < 9; i++) g.fx.emit(new THREE.Vector3(opp.x + (Math.random() - 0.5) * 0.7 * opp.scale, opp.y + Math.random() * 1.9 * opp.scale, 0.15), { dark: true, count: 1, color: 0x020104, color2: 0x1c0a2c, dir: new THREE.Vector3(-f.facing * 0.4, 1, 0), speed: 1.2, spread: 1.4, life: 1.3, size: 0.3, grow: 0.7, drag: 0.8 });
        }
        if (lt >= 0.6 && !f.erasedSfx) { f.erasedSfx = true; g.audio.play('erase', 1); }
        if (lt >= 1.5 && !f.returned) { f.returned = true; g.fx.emit(opp.chestPos(), { dark: true, count: 40, color: 0x050208, speed: -3, life: 0.4, size: 0.4, jitter: 1.5 }); }
      }
      const done = lockCombo(f, g, t, [
        { at: 0.7, dmg: 5, sfx: 'heavy', color: 0x1a0828, noFlash: true, spark: 0.3 },
        { at: 1.0, dmg: 5, sfx: 'heavy', color: 0x1a0828, noFlash: true, spark: 0.3 },
        { at: 1.3, dmg: 6, sfx: 'heavy', color: 0x1a0828, noFlash: true, spark: 0.3 },
        { at: 1.85, dmg: 9, sfx: 'heavy', knockdown: true, launch: 7, final: true, color: 0x8a40ff, fx: () => { opp.frozen = false; f.erasing = false; opp.rig.setFade(1); opp.rig.setVoid(0); g.fx.ring(opp.chestPos(), 0x6a20c0, 3.5, 0.4, 'face'); g.camFocus = null; f.recede = t; } },
        { at: 2.4 },
      ]);
      if (done) { ULTIMATES.voidErasure.cleanup(f, g); return false; }
      return true;
    },
    cleanup(f, g) {
      const opp = g.opponentOf(f);
      if (f.tide) { g.fx.group.remove(f.tide); f.tide.traverse((o) => { o.geometry && o.geometry.dispose(); }); f.tide.children[0] && f.tide.children[0].material.dispose(); f.tide = null; }
      f.rig.setVoid(0);
      if (f.rig.aura) { f.rig.aura.color.set(0xffd070); f.rig.aura.intensity = 0; }
      g.setDark(0, 0);
      if (opp) { opp.rig.setFade(1); opp.rig.setVoid(0); opp.frozen = false; if (g.camFocus && g.camFocus.f === opp) g.camFocus = null; }
      f.erasing = false; f.started = false; f.recede = undefined; f.returned = false; f.erasedSfx = false;
    },
  },

  // WEB-SLINGING TAKEDOWN: web-snare the foe, swing around them on web lines striking from both
  // sides, then a web-assisted dive kick slam
  webTakedown: {
    update(f, g, t) {
      const opp = g.opponentOf(f);
      if (!f.locked) {
        if (t < 0.1) { f.setPose('castW'); return true; }
        f.setPose('castBoth');
        if (!f.fired) {
          f.fired = true;
          g.audio.play('web');
          const p = handPos(f);
          g.spawnProjectile({ owner: f, x: p.x, y: p.y, vx: f.facing * 26, r: 0.42, life: 0.55, mesh: glowOrb(0xffffff, 0.28), trail: 0xffffff,
            hit: { dmg: 3, height: 'mid', stun: 0.8, blockstun: 0.3, push: 1, kind: 'ult', sfx: 'web', color: 0xffffff },
            onHitResult: (res, target) => { if (res === 'hit' && target.hp > 0) { startLock(f, g, target); webWrap(g, target, 1.6); } } });
        }
        return t < 0.9;
      }
      // swing to one side of the foe on a web line anchored high above
      const swing = (side, pop = 5) => (ff, o) => {
        const anchor = new THREE.Vector3(o.x - side * 0.6, 6.5, -0.4);
        ff.x = THREE.MathUtils.clamp(o.x + side * 1.15 * o.scale, -g.bounds, g.bounds);
        ff.vy = pop; ff.onGround = false;
        ff.facing = ff.x < o.x ? 1 : -1; ff.snapFacing();
        g.fx.timed(line3(0xf2f2f2, 0.012), 0.22, (m) => m.setEnds(handPos(ff), anchor));
        g.audio.play('web', 0.6);
        g.fx.emit(new THREE.Vector3(ff.x, ff.y + 1.2, 0), { count: 8, color: 0xffffff, speed: 3, life: 0.3, size: 0.18 });
      };
      const slam = () => { const p = new THREE.Vector3(opp.x, 0.05, 0); g.fx.ring(p, 0xffffff, 3, 0.4); g.fx.dust(p, 28); g.audio.play('boom', 0.8); f.vy = -14; };
      const done = lockCombo(f, g, t, [
        { at: 0.05, reposition: swing(-1), pose: 'jab', dmg: 3.5 },
        { at: 0.22, reposition: swing(1), pose: 'kick', dmg: 4, sfx: 'heavy' },
        { at: 0.4, reposition: swing(-1), pose: 'spinKick', dmg: 4, sfx: 'heavy' },
        { at: 0.58, reposition: swing(1), pose: 'hook', dmg: 4, sfx: 'heavy' },
        { at: 0.76, reposition: swing(-1, 10), pose: 'jump' },
        { at: 1.0, pose: 'diveKick', dmg: 9, sfx: 'heavy', knockdown: true, final: true, fx: slam },
        { at: 1.6 },
      ]);
      return !done;
    },
  },

  unibeam: {
    update(f, g, t) {
      const glow = f.rig.glowMat;
      if (t < 0.4) {
        f.setPose('charge');
        if (glow) glow.emissiveIntensity = 3 + t * 20;
        if (!f.chargeFx) { f.chargeFx = true; g.audio.play('beam'); }
        const c = f.chestPos();
        g.fx.emit(c, { count: 3, color: 0x9fe8ff, speed: -3, life: 0.3, size: 0.2, jitter: 2.0 });
        return true;
      }
      f.setPose('charge');
      const c = f.chestPos();
      const end = f.facing > 0 ? g.bounds + 6 : -g.bounds - 6;
      if (!f.beam) {
        const geo = new THREE.CylinderGeometry(0.42, 0.42, 1, 20, 1, true); geo.translate(0, 0.5, 0); geo.rotateZ(-Math.PI / 2);
        const outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x5fc8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
        const inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
        inner.scale.set(1, 0.45, 0.45);
        f.beam = new THREE.Group(); f.beam.add(outer, inner);
        g.fx.group.add(f.beam);
        f.beamTick = 0; f.beamHits = 0; f.seqIdx = 0;
        g.shake(0.4);
      }
      const len = Math.abs(end - c.x);
      f.beam.position.set(c.x, c.y, c.z);
      f.beam.scale.set(len * f.facing, 1 + Math.sin(t * 60) * 0.12, 1 + Math.cos(t * 50) * 0.12);
      g.fx.flashLight(c.clone().add(new THREE.Vector3(f.facing * 2, 0, 0)), 0x7fd8ff, 10, 0.06);
      if (Math.random() < 0.8) g.fx.emit(c, { count: 2, color: 0xffffff, color2: 0x5fc8ff, dir: new THREE.Vector3(f.facing, 0, 0), speed: 18, spread: 0.2, life: 0.4, size: 0.3 });
      f.beamTick -= g.dt;
      if (f.beamTick <= 0 && t < 1.6) {
        f.beamTick = 0.1;
        f.beamHits++;
        const final = f.beamHits >= 12;
        g.zoneHit(f, { x0: Math.min(c.x, end), x1: Math.max(c.x, end), y0: c.y - 0.5, y1: c.y + 0.5 },
          { id: newHitId(), dmg: final ? 4 : 2.3, height: 'mid', stun: 0.3, blockstun: 0.14, push: final ? 5 : 0.9, knockdown: final, kind: 'ult', sfx: 'light', sfxVol: 0.5, color: 0x7fd8ff, srcX: c.x, chip: 0.25, spark: 0.6 });
      }
      if (t >= 1.62) {
        g.fx.group.remove(f.beam); f.beam.children.forEach((m) => { m.material.dispose(); }); f.beam.children[0].geometry.dispose(); f.beam = null;
        if (glow) glow.emissiveIntensity = 3;
        return false;
      }
      return true;
    },
    cleanup(f, g) { if (f.beam) { g.fx.group.remove(f.beam); f.beam = null; } if (f.rig.glowMat) f.rig.glowMat.emissiveIntensity = 3; },
  },

  thunderstorm: {
    update(f, g, t) {
      const opp = g.opponentOf(f);
      f.setPose(t < 0.2 ? 'skyW' : 'sky');
      if (Math.random() < 0.5) {
        const h = handPos(f, 'hammer');
        g.fx.bolt(h, h.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, 0)), 0x9fd8ff, 0.08, 0.04, 0);
      }
      if (f.seqIdx === undefined) f.seqIdx = 0;
      const strike = (s) => {
        const x = THREE.MathUtils.clamp(opp.x + (s.final ? 0 : (Math.random() - 0.5) * 0.5), -g.bounds, g.bounds);
        g.fx.bolt(new THREE.Vector3(x + (Math.random() - 0.5) * 2, 17, -0.6), new THREE.Vector3(x, 0, 0), 0x9fd8ff, s.final ? 0.5 : 0.25, s.final ? 0.32 : 0.14, s.final ? 6 : 3);
        g.fx.emit(new THREE.Vector3(x, 0.3, 0), { count: s.final ? 70 : 25, color: 0xffffff, color2: 0x6fc0ff, speed: s.final ? 13 : 8, life: 0.45, size: 0.24, up: 3, gravity: -12 });
        g.fx.ring(new THREE.Vector3(x, 0.05, 0), 0x8fd0ff, s.final ? 4 : 2, 0.35);
        g.audio.play('zap', s.final ? 1.2 : 0.8);
        g.shake(s.final ? 1.0 : 0.35);
        g.zoneHit(f, { x0: x - (s.final ? 1.4 : 0.8), x1: x + (s.final ? 1.4 : 0.8), y0: 0, y1: 14 },
          { id: newHitId(), dmg: s.final ? 10 : 4.4, height: 'mid', stun: 0.45, blockstun: 0.25, push: s.final ? 6 : 0.5, knockdown: s.final, launch: s.final ? 9 : 0, kind: 'ult', sfx: 'heavy', color: 0x8fd0ff, srcX: f.x, chip: 0.25, spark: s.final ? 2 : 1 });
        if (s.final) g.hitstop(0.12);
      };
      const done = seq(f, [{ at: 0.3 }, { at: 0.5 }, { at: 0.7 }, { at: 0.9 }, { at: 1.1 }, { at: 1.45, final: true }, { at: 1.9, end: true }], t, (s) => { if (!s.end) strike(s); });
      return !done;
    },
  },

  // HULK SMASH: leap onto the foe, a flurry of haymakers, then a massive slam whose shockwave
  // rolls across the whole arena
  // WORLD-BREAKER THUNDERCLAP: a roar, an unstoppable lunge and a grab; Hulk turns and slams the
  // foe into the floor behind him, swings them by the ankles into the ground three times, hurls
  // them across the arena, leaps after them and claps both palms together in their face
  worldBreaker: {
    update(f, g, t, dt) {
      const opp = g.opponentOf(f);
      const GREEN = 0x7dff6a, dir = f.facing;
      if (!f.locked) {
        f.superArmor = true;
        if (t < 0.5) {
          f.setPose('charge'); f.vx = 0;
          if (!f.started) {
            f.started = true;
            g.audio.play('roar', 1.3); g.shake(0.6); g.rumble(0.6, 400);
            const h = f.headPos();
            g.fx.ring(h.clone().setZ(0.4), 0xd8ffd0, 2.6, 0.45, 'face', 0.06);
            g.fx.ring(new THREE.Vector3(f.x, 0.05, 0), GREEN, 2.2, 0.5);
            g.fx.dust(new THREE.Vector3(f.x, 0.05, 0), 18);
            if (g.post) { const v = h.clone().project(g.camera); g.post.impactAt(new THREE.Vector2(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5), 0.09); }
          }
          return true;
        }
        if (t < 1.0) {
          f.setPose('grab', 30); f.vx = dir * 20; f.noPush = true;
          if (!f.hitId) { f.hitId = newHitId(); g.audio.play('whoosh', 1.2); g.fx.dust(new THREE.Vector3(f.x, 0.05, 0), 12); }
          const x0 = f.x, x1 = f.x + dir * 1.4 * f.scale;
          const r = g.zoneHit(f, { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: 0.3, y1: 2.4 }, { id: f.hitId, dmg: 3, height: 'mid', stun: 0.9, blockstun: 0.45, push: 2, kind: 'ult', sfx: 'heavy', color: GREEN });
          if (r === 'hit' && opp.hp > 0) { f.vx = 0; f.noPush = false; f.superArmor = false; startLock(f, g, opp); opp.frozen = true; f.hold = { x: opp.x, y: 0 }; }
          else if (r === 'blocked' || Math.abs(f.x) >= g.bounds - 0.05) { f.vx = 0; f.noPush = false; f.ultT = Math.max(f.ultT, 1.0); }
          return true;
        }
        f.superArmor = false; f.noPush = false; f.vx *= 0.8; f.setPose('idle');
        return t < 1.35;
      }
      const lt = t - f.lockT;
      const sw = f.swing || (f.swing = { hits: 0 });
      // the foe as a ragdoll: feet at `piv`, body pointing along angle `phi` (0 = toward where
      // Hulk faces, PI = behind him), rolled in the screen plane
      const hang = (px, py, phi) => {
        opp.x = THREE.MathUtils.clamp(px, -g.bounds - 0.5, g.bounds + 0.5); opp.y = Math.max(0, py); opp.onGround = true;
        opp.root.rotation.order = 'ZYX';
        opp.root.rotation.z = Math.atan2(-dir * Math.cos(phi), Math.sin(phi));
      };
      // angle at which a body hung from 0.6 m reaches the floor, in front and behind
      const FRONT = -Math.asin(Math.min(0.95, 0.5 / (1.75 * opp.scale))), BACK = Math.PI - FRONT;
      const impact = (x, k = 1) => {
        const p = new THREE.Vector3(x, 0.05, 0);
        g.audio.play('boom', 0.9 + 0.2 * k); g.audio.play('land', 1.2);
        g.fx.dust(p, 30); g.fx.ring(p, 0xffc890, 2.4 * k, 0.4);
        g.fx.emit(p.clone().setY(0.2), { count: 14, color: 0x6a625a, color2: 0x2e2a26, speed: 6, life: 0.7, size: 0.14, up: 4, gravity: 14 });
        crater(g, x, 0.9 * k, 2.2);
        g.shake(0.7 * k); g.rumble(0.85, 220);
      };
      const smash = (i) => {
        const phi = i % 2 ? BACK : FRONT;
        ultHit(f, g, opp, { dmg: 3.5, sfx: 'heavy', color: GREEN, shake: 0.7 });
        impact(f.x + dir * Math.cos(phi) * (0.45 + 1.7 * opp.scale), i === 2 ? 1.2 : 1);
        g.hitstop(0.05);
      };
      // ---- phase 1: seize by the head, hop and turn, slam them into the floor behind
      if (lt < 0.3) {
        f.setPose('lift', 18); f.vx = 0;
        const k = lt / 0.3;
        opp.x = THREE.MathUtils.lerp(f.hold.x, f.x + dir * 0.75 * f.scale, k); opp.y = 1.1 * k; opp.onGround = true;
      } else if (lt < 0.55) {
        if (!sw.hop) { sw.hop = true; f.vy = 5.5; f.onGround = false; g.audio.play('whoosh', 1.1); }
        f.setPose('smashBack', 16);
        const u = (lt - 0.3) / 0.25, phi = THREE.MathUtils.lerp(Math.PI * 0.45, BACK, u);
        hang(f.x + dir * Math.cos(phi) * 0.5, 1.6 - 0.9 * u, phi);
      } else if (lt < 0.95) {
        if (!sw.slam1) { sw.slam1 = true; ultHit(f, g, opp, { dmg: 4, sfx: 'heavy', color: GREEN, shake: 0.9 }); impact(f.x - dir * 1.3, 1.1); g.hitstop(0.07); }
        f.setPose('smashBack', 20);
        const b = Math.sin(Math.min(1, (lt - 0.55) / 0.3) * Math.PI) * 0.45; // bounce off the floor
        hang(f.x - dir * 0.5, 0.6 + b, BACK - b * 0.6);
      // ---- phase 2: by the ankles, smashed into the ground front, back, front
      } else if (lt < 2.05) {
        const u = (lt - 0.95) / 0.36, n = Math.min(2, Math.floor(u)), w = Math.min(1, u - n);
        const to = n % 2 ? BACK : FRONT, from = n % 2 ? FRONT : BACK; // behind → front → behind → front
        const e = w * w * (3 - 2 * w), phi = THREE.MathUtils.lerp(from, to, e);
        f.setPose(w < 0.25 ? (from === BACK ? 'smashBack' : 'smash') : w < 0.75 ? 'lift' : (to === BACK ? 'smashBack' : 'smash'), 26);
        hang(f.x + dir * Math.cos(phi) * 0.45, 0.6 + 1.7 * Math.max(0, Math.sin(phi)), phi);
        // a frame can skip past the floor: count every smash that has been reached
        const reached = n + (w >= 0.98 ? 1 : 0);
        while (sw.hits < reached) smash(sw.hits++);
      // ---- phase 3: hurl them, leap after them, THUNDERCLAP
      } else {
        if (!sw.thrown) {
          while (sw.hits < 3) smash(sw.hits++);
          sw.thrown = true; sw.t0 = lt;
          sw.fromX = opp.x; sw.landX = THREE.MathUtils.clamp(f.x + dir * 6.5, -g.bounds + 0.3, g.bounds - 0.3);
          opp.root.rotation.z = 0; g.audio.play('whoosh', 1.4); g.audio.play('roar', 0.9);
        }
        const ft = lt - sw.t0;
        // the foe tumbles through the air and lands dazed
        const k = Math.min(1, ft / 0.55);
        opp.x = THREE.MathUtils.lerp(sw.fromX, sw.landX, k); opp.y = Math.sin(k * Math.PI) * 2.4 + (1 - k) * 0.6; opp.onGround = true;
        opp.root.rotation.order = 'ZYX'; opp.root.rotation.z = k < 1 ? -dir * k * Math.PI * 2 : 0;
        if (k >= 1 && !sw.oppDown) { sw.oppDown = true; opp.frozen = false; g.fx.dust(new THREE.Vector3(opp.x, 0.05, 0), 16); g.audio.play('land', 1.2); }
        if (ft < 0.2) { f.setPose('crouch', 20); f.vx = 0; return true; }
        if (!sw.leapt) {
          sw.leapt = true;
          const tx = sw.landX - dir * 1.05 * f.scale, T = 2 * 12 / g.gravity;
          f.vy = 12; f.onGround = false; f.noPush = true; f.vx = (tx - f.x) / T;
          g.setDark(0.55, 1.1); g.audio.play('jump', 1.2); g.fx.dust(new THREE.Vector3(f.x, 0.05, 0), 26); g.shake(0.5);
        }
        if (!f.onGround) {
          f.setPose('clapW', 12);
          g.fx.emit(f.chestPos(), { count: 3, color: 0xffffff, color2: GREEN, dir: new THREE.Vector3(-Math.sign(f.vx || dir), -0.2, 0), spread: 0.25, speed: 12, life: 0.2, size: 0.12, drag: 2 });
          if (g.post) g.post.motion(Math.sign(f.vx || dir), 0.016);
          return true;
        }
        if (sw.landT === undefined) { sw.landT = lt; f.vx = 0; f.noPush = false; g.fx.dust(new THREE.Vector3(f.x, 0.05, 0), 20); g.shake(0.6); }
        const ct = lt - sw.landT;
        f.facing = opp.x > f.x ? 1 : -1;
        if (ct < 0.22) { f.setPose('clapW', 18); return true; }
        f.setPose('clap', 60);
        if (!sw.clapped) {
          sw.clapped = true;
          const c = opp.chestPos(), d = f.facing;
          opp.frozen = false;
          ultHit(f, g, opp, { dmg: 11, sfx: 'heavy', color: 0xffffff, launch: 13, knockdown: true, final: true, spark: 3 });
          opp.vx = d * 16; opp.vy = Math.max(opp.vy, 9); // blown clear across the arena
          const mid = f.chestPos().lerp(c, 0.5);
          g.fx.ring(mid.clone().setZ(0.5), 0xffffff, 9, 0.55, 'face', 0.05);
          g.fx.ring(mid.clone().setZ(0.45), GREEN, 6.5, 0.7, 'face', 0.08);
          g.fx.ring(new THREE.Vector3(mid.x, 0.05, 0), 0xd8ffd0, 10, 0.7);
          g.fx.flashLight(mid, 0xe8ffe0, 45, 0.45);
          g.fx.emit(mid, { count: 90, color: 0xffffff, color2: GREEN, dir: new THREE.Vector3(d, 0.12, 0), spread: 0.35, speed: 28, life: 0.5, size: 0.11, drag: 1.5 });
          g.fx.emit(mid, { count: 50, color: 0xffffff, color2: 0xb8ffb0, speed: 14, life: 0.4, size: 0.2 });
          for (let i = 0; i < 10; i++) g.fx.streak(mid.clone().add(new THREE.Vector3(0, (Math.random() - 0.5) * 2, 0.2)), new THREE.Vector3(d, (Math.random() - 0.5) * 0.2, 0), 0xffffff, 2.5 + Math.random() * 2, 0.22);
          g.audio.play('boom', 1.7); g.audio.play('blast', 1.2);
          g.shake(1.7); g.rumble(1, 650); g.hitstop(0.12);
          g.hud.shatter && g.hud.shatter(opp.side);
          if (g.post) { g.post.impact(1); const v = mid.clone().project(g.camera); g.post.impactAt(new THREE.Vector2(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5), 0.14); g.post.motion(d, 0.025); }
        }
        return ct < 0.85;
      }
      return true;
    },
    cleanup(f, g) { f.superArmor = false; f.swing = null; const o = g.opponentOf(f); if (o) o.frozen = false; },
  },

  // STAR-SPANGLED BLITZ: a bullet-dash with the shield as a battering ram; on contact a street-
  // fight string (shield ricochet off the floor, spinning back kick, edge chop, rising shield
  // smash), then Cap leaps and brings the shield's edge down in a ground pound that cracks a crater
  freedomStrike: {
    update(f, g, t, dt) {
      const opp = g.opponentOf(f);
      const BLUE = 0xbfd6ff;
      if (!f.locked) {
        if (t < 0.2) { f.setPose('shieldBashW', 20); f.vx = -f.facing * 1.5; return true; }
        if (t < 0.75) {
          f.setPose('shieldBash', 40); f.vx = f.facing * 30; f.noPush = true;
          if (!f.hitId) { f.hitId = newHitId(); g.audio.play('whoosh', 1.4); g.fx.dust(new THREE.Vector3(f.x, 0.05, 0), 16); g.shake(0.3); }
          g.fx.emit(new THREE.Vector3(f.x + f.facing * 0.5, f.y + 1.25 * f.scale, 0.15), { count: 4, color: BLUE, color2: 0xffffff, dir: new THREE.Vector3(-f.facing, 0, 0), spread: 0.15, speed: 16, life: 0.2, size: 0.11, drag: 2 });
          if (g.post) g.post.motion(f.facing, 0.02);
          const x0 = f.x, x1 = f.x + f.facing * 1.25 * f.scale;
          const r = g.zoneHit(f, { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: 0.3, y1: 1.95 }, { id: f.hitId, dmg: 4, height: 'mid', stun: 0.9, blockstun: 0.4, push: 2.5, kind: 'ult', sfx: 'shield', color: BLUE, shake: 0.55 });
          if (r === 'hit' && opp.hp > 0) { f.vx = 0; f.noPush = false; startLock(f, g, opp); f.blitz = { dir: f.facing }; }
          else if (r === 'blocked' || Math.abs(f.x) >= g.bounds - 0.05) { f.vx = 0; f.noPush = false; f.ultT = Math.max(f.ultT, 0.75); }
          return true;
        }
        f.vx *= 0.8; f.noPush = false; f.setPose('idle');
        return t < 1.05;
      }
      const lt = t - f.lockT, B = f.blitz, d = B.dir;
      // root motion: every blow drives the foe back and Cap follows through
      const drive = (dist) => { opp.x = THREE.MathUtils.clamp(opp.x + d * dist, -g.bounds, g.bounds); };
      const gap = B.gap ?? 1.0;
      if (!B.air) { f.vx = 0; f.x += (THREE.MathUtils.clamp(opp.x - d * gap * f.scale, -g.bounds, g.bounds) - f.x) * Math.min(1, dt * 14); }
      opp.onGround = true;
      // the foe pops off the floor on the ricochet and rides the rising smash up
      if (B.popT !== undefined) opp.y = Math.max(0, Math.sin(Math.min(1, (lt - B.popT) / 0.3) * Math.PI) * 0.45);
      if (B.liftT !== undefined) { const k = Math.min(1, (lt - B.liftT) / 0.32); opp.y = 2.3 * Math.sin(k * Math.PI / 2); }
      if (B.dropT !== undefined) { const k = Math.min(1, (lt - B.dropT) / 0.2); opp.y = 2.3 * (1 - k * k); }
      if (B.disc) {
        // the thrown shield: hand → floor → foe's chin → back to the hand
        const k = (lt - B.discT) / 0.45, hand = handPos(f, shieldHand(f));
        const floor = new THREE.Vector3((f.x + opp.x) / 2 + d * 0.2, 0.05, 0.15), chin = opp.chestPos().add(new THREE.Vector3(0, 0.35, 0));
        const p = k < 0.35 ? B.from.clone().lerp(floor, k / 0.35) : k < 0.6 ? floor.clone().lerp(chin, (k - 0.35) / 0.25) : chin.clone().lerp(hand, Math.min(1, (k - 0.6) / 0.4));
        B.disc.position.copy(p); B.disc.rotation.z += dt * 30;
        if (k >= 0.35 && !B.bounced) { B.bounced = true; g.fx.hitSpark(floor, BLUE, 0.9); g.audio.play('shield', 0.8); g.fx.ring(floor, BLUE, 1.0, 0.25); }
        if (k >= 1) { g.fx.group.remove(B.disc); B.disc = null; capShield(f, true); }
      }
      const done = lockCombo(f, g, t, [
        { at: 0.0, pose: 'shieldBash', fx: () => drive(0.5) },
        { at: 0.16, pose: 'jabW' },
        { at: 0.26, pose: 'jab', fx: () => { B.from = handPos(f, shieldHand(f)); B.disc = shieldDisc(); B.discT = 0.26; g.fx.group.add(B.disc); capShield(f, false); g.audio.play('whoosh'); } },
        { at: 0.42, dmg: 3.5, sfx: 'shield', color: BLUE, fx: () => { B.popT = 0.42; drive(0.3); } },
        { at: 0.6, pose: 'backKickW' },
        { at: 0.74, pose: 'backKick', dmg: 4.5, sfx: 'heavy', fx: () => { drive(0.9); g.shake(0.45); g.fx.dust(new THREE.Vector3(opp.x, 0.05, 0), 10); } },
        { at: 0.9, pose: 'chopW' },
        { at: 1.02, pose: 'chop', dmg: 4, sfx: 'shield', color: BLUE, fx: () => { drive(0.4); g.fx.streak(opp.chestPos().add(new THREE.Vector3(0, 0.3, 0.3)), new THREE.Vector3(d * 0.4, -1, 0), 0xffffff, 1.2, 0.15); } },
        { at: 1.16, pose: 'upperW' },
        { at: 1.26, pose: 'upper', dmg: 4.5, sfx: 'shield', color: BLUE, fx: () => { B.liftT = 1.26; B.air = true; f.vy = 10.5; f.onGround = false; f.vx = d * 0.6; g.audio.play('whoosh', 1.1); } },
        { at: 1.52, pose: 'smashW', fx: () => { B.liftT = undefined; B.dropT = 1.52; f.vy = 0; } },
        { at: 1.62, pose: 'smash', fx: () => { f.vy = -26; f.vx = (opp.x - d * 0.9 * f.scale - f.x) / 0.12; } },
        { at: 1.74, pose: 'smash', dmg: 10, sfx: 'shield', knockdown: true, launch: 8, final: true, color: BLUE, spark: 2.6, fx: () => {
          const p = new THREE.Vector3(opp.x - d * 0.4, 0.05, 0);
          f.vx = 0; B.air = false;
          g.audio.play('boom', 1.5); g.audio.play('shield', 1.1);
          g.fx.ring(p, 0xffffff, 6, 0.5); g.fx.ring(p, BLUE, 3.6, 0.4); g.fx.ring(p.clone().setY(1), BLUE, 2.4, 0.3, 'face', 0.08);
          g.fx.dust(p, 50); crater(g, p.x, 1.5, 3);
          g.fx.emit(p.clone().setY(0.25), { count: 40, color: 0x6e665c, color2: 0x2e2a26, speed: 9, life: 0.9, size: 0.15, up: 6, gravity: 16 });
          g.fx.flashLight(p.clone().setY(1), 0xd0e4ff, 30, 0.35);
          g.shake(1.4); g.rumble(1, 450);
          if (g.post) { const v = p.clone().project(g.camera); g.post.impactAt(new THREE.Vector2(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5), 0.1); }
        } },
        { at: 2.35 },
      ]);
      if (done) { ULTIMATES.freedomStrike.cleanup(f, g); return false; }
      return true;
    },
    cleanup(f, g) { const B = f.blitz; if (B && B.disc) g.fx.group.remove(B.disc); f.blitz = null; capShield(f, true); },
  },
  bladeFury: {
    update(f, g, t) {
      const opp = g.opponentOf(f);
      if (!f.locked) {
        if (t < 0.1) { f.setPose('slashW'); return true; }
        if (t < 0.4) {
          f.setPose('slash'); f.vx = f.facing * 24; f.noPush = true;
          if (!f.hitId) { f.hitId = newHitId(); g.audio.play('slash'); }
          g.fx.emit(new THREE.Vector3(f.x, 1.1, 0), { count: 3, color: 0x6fd0ff, speed: 0.5, life: 0.3, size: 0.5 });
          const x0 = f.x - f.facing * 0.3, x1 = f.x + f.facing * 1.4;
          const r = g.zoneHit(f, { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: 0.4, y1: 1.9 }, { id: f.hitId, dmg: 3, height: 'mid', stun: 0.8, blockstun: 0.35, push: 2, kind: 'ult', sfx: 'slash', color: 0x8fdcff });
          if (r === 'hit' && opp.hp > 0) { f.vx = 0; f.noPush = false; startLock(f, g, opp); }
          return true;
        }
        f.noPush = false; f.vx *= 0.8; f.setPose('idle');
        return t < 0.8;
      }
      f.vx = 0;
      const side = (s) => (ff, o) => {
        g.fx.emit(new THREE.Vector3(ff.x, ff.y + 1.1, 0), { count: 14, color: 0x6fd0ff, speed: 3, life: 0.3, size: 0.35 });
        ff.x = THREE.MathUtils.clamp(o.x + s * 1.15, -g.bounds, g.bounds); ff.facing = ff.x < o.x ? 1 : -1; ff.snapFacing();
      };
      const slashFx = () => g.fx.ring(new THREE.Vector3(opp.x, opp.y + 1.2, 0.2), 0x8fdcff, 1.2, 0.18, 'face');
      const done = lockCombo(f, g, t, [
        { at: 0.04, reposition: side(-1), pose: 'slash', dmg: 3.2, sfx: 'slash', color: 0x8fdcff, fx: slashFx },
        { at: 0.16, reposition: side(1), pose: 'slash', dmg: 3.2, sfx: 'slash', color: 0x8fdcff, fx: slashFx },
        { at: 0.28, reposition: side(-1), pose: 'slash', dmg: 3.2, sfx: 'slash', color: 0x8fdcff, fx: slashFx },
        { at: 0.4, reposition: side(1), pose: 'slash', dmg: 3.2, sfx: 'slash', color: 0x8fdcff, fx: slashFx },
        { at: 0.52, reposition: side(-1), pose: 'slash', dmg: 3.2, sfx: 'slash', color: 0x8fdcff, fx: slashFx },
        { at: 0.64, reposition: side(1), pose: 'slash', dmg: 3.2, sfx: 'slash', color: 0x8fdcff, fx: slashFx },
        { at: 0.82, pose: 'slashW' },
        { at: 0.98, pose: 'slash', dmg: 9, sfx: 'slash', knockdown: true, launch: 8, final: true, color: 0x8fdcff, fx: slashFx },
        { at: 1.55 },
      ]);
      return !done;
    },
  },

  // I AM GROOT — ANCIENT FOREST: grows to giant size, a forest of roots erupts around the foe,
  // a long-reach wooden strike, then a root shockwave along the floor
  ancientForest: {
    update(f, g, t, dt) {
      const opp = g.opponentOf(f);
      const big = !f.shrink ? 1.45 : 1;
      growTo(f, big, dt, 5);
      if (Math.random() < 0.4) g.fx.emit(f.chestPos().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.2, 0)), { count: 1, color: 0x5fa83a, color2: 0xa0d860, speed: 1.5, life: 1.2, size: 0.18, gravity: -1.5 });
      if (!f.locked) {
        if (!f.started) { f.started = true; g.audio.play('wood', 1.1); g.audio.play('roar', 0.6); g.shake(0.4); }
        f.setPose(t < 0.45 ? 'charge' : 'smash', t < 0.45 ? 10 : 30);
        if (t >= 0.5 && !f.fired) {
          f.fired = true;
          const x = THREE.MathUtils.clamp(opp.x, -g.bounds, g.bounds);
          rootBurst(g, x, 2.3, { n: 14, spread: 0.7, height: 1.6 * opp.scale, follow: opp });
          for (const dx of [-1.1, 1.1]) rootBurst(g, x + dx, 2.0, { n: 6, spread: 0.4, height: 1.1 });
          g.audio.play('wood', 1);
          const r = g.zoneHit(f, { x0: x - 1.3, x1: x + 1.3, y0: 0, y1: 2.6 }, { id: newHitId(), dmg: 4, height: 'mid', stun: 0.9, blockstun: 0.45, push: 1, kind: 'ult', sfx: 'heavy', color: 0xc8a060, srcX: f.x, chip: 0.25 });
          if (r === 'hit' && opp.hp > 0) startLock(f, g, opp);
          else f.shrink = true;
        }
        if (f.shrink && t > 1.3) { ULTIMATES.ancientForest.cleanup(f, g); return false; }
        return true;
      }
      const lt = t - f.lockT;
      if (lt > 0.4 && lt < 0.85) f.reachWant = 2.3;
      const wave = () => {
        g.audio.play('wood', 1.2); g.audio.play('boom', 0.9); g.shake(1.1);
        g.fx.ring(new THREE.Vector3(f.x, 0.05, 0), 0x8fd060, 5.5, 0.5);
        for (let i = 1; i <= 7; i++) for (const sd of [-1, 1]) {
          const x = f.x + sd * i * 1.25;
          if (Math.abs(x) > g.bounds + 0.5) continue;
          setTimeoutGame(g, i * 0.05, () => rootBurst(g, x, 0.9, { n: 4, spread: 0.35, height: 0.9 }));
        }
      };
      const done = lockCombo(f, g, t, [
        { at: 0.15, dmg: 4, sfx: 'heavy', color: 0xc8a060, fx: () => g.audio.play('wood', 0.7) },
        { at: 0.45, pose: 'hookW' },
        { at: 0.68, pose: 'hook', dmg: 8, sfx: 'heavy', color: 0xc8a060, fx: () => g.shake(0.6) },
        { at: 1.0, pose: 'smashW' },
        { at: 1.25, pose: 'smash', dmg: 9, sfx: 'heavy', knockdown: true, launch: 8, final: true, color: 0x8fd060, fx: wave },
        { at: 1.6, fx: () => { f.shrink = true; } },
        { at: 2.1 },
      ]);
      if (done) { ULTIMATES.ancientForest.cleanup(f, g); return false; }
      return true;
    },
    cleanup(f) { f.root.scale.setScalar(1); f.shrink = false; f.reachWant = 1; },
  },

  // SYMBIOTE OVERDRIVE: the symbiote swells into a monstrous form, lunges, then claws and
  // sweeping tendrils before a crushing slam
  // WE ARE VENOM: a screech and a lunge; tendrils seize the foe by the throat and slam them
  // down, Venom bites into their head and tears back, then his arm swells into a jagged
  // symbiote greatsword that he drives straight down through them
  venomFeast: {
    update(f, g, t, dt) {
      const opp = g.opponentOf(f);
      const INK = 0x020206, dir = f.facing;
      if (!f.tend) { f.tend = tendrilSet(g, 6); g.audio.play('roar', 1.25); g.audio.play('squelch', 1.1); g.shake(0.45); g.rumble(0.5, 300); }
      g.fx.emit(f.chestPos(), { dark: true, count: 2, color: INK, color2: 0x10142a, speed: 1.5, life: 0.6, size: 0.35, jitter: 1 });
      const base = f.chestPos().add(new THREE.Vector3(-dir * 0.15, 0.15, -0.2));
      const idle = (i) => base.clone().add(new THREE.Vector3(dir * (0.6 + i * 0.12), 0.4 + Math.sin(t * 6 + i) * 0.4, -0.3 + (i % 3) * 0.3));
      if (!f.locked) {
        if (t < 0.35) { f.setPose('charge'); drawTendrils(f.tend, base, idle, 0.6); return true; }
        if (t < 0.8) {
          f.setPose('grab', 30); f.vx = dir * 20; f.noPush = true;
          if (!f.hitId) { f.hitId = newHitId(); g.audio.play('whoosh', 1.2); }
          drawTendrils(f.tend, base, (i) => base.clone().add(new THREE.Vector3(dir * (1.6 + i * 0.1), (i - 2.5) * 0.12, 0)), 1);
          const x0 = f.x, x1 = f.x + dir * 1.5 * f.scale;
          const r = g.zoneHit(f, { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: 0.4, y1: 2.1 }, { id: f.hitId, dmg: 3, height: 'mid', stun: 0.9, blockstun: 0.4, push: 2, kind: 'ult', sfx: 'slash', color: 0x9aa8ff });
          if (r === 'hit' && opp.hp > 0) { f.vx = 0; f.noPush = false; startLock(f, g, opp); opp.frozen = true; f.feast = { x0: opp.x }; }
          else if (r === 'blocked' || Math.abs(f.x) >= g.bounds - 0.05) { f.vx = 0; f.noPush = false; f.ultT = Math.max(f.ultT, 0.8); }
          return true;
        }
        f.vx *= 0.8; f.noPush = false; f.setPose('idle');
        drawTendrils(f.tend, base, idle, Math.max(0.05, 1 - (t - 0.8) * 3));
        if (t > 1.1) { ULTIMATES.venomFeast.cleanup(f, g); return false; }
        return true;
      }
      f.vx = 0;
      const lt = t - f.lockT, F = f.feast;
      // pinned on the floor: feet away from Venom, head just in front of him
      const lieX = f.x + dir * (0.6 + 1.75 * opp.scale);
      const lie = (k) => { opp.root.rotation.order = 'ZYX'; opp.root.rotation.z = dir * Math.PI / 2 * k; };
      const headAt = () => new THREE.Vector3(f.x + dir * 0.7, 0.25, 0.1);
      opp.onGround = true;
      if (lt < 0.4) {
        // throat seized and hoisted
        const k = lt / 0.4;
        opp.x = THREE.MathUtils.lerp(F.x0, f.x + dir * 1.05 * f.scale, k); opp.y = 0.75 * k;
        f.setPose('grab', 20);
        drawTendrils(f.tend, base, (i) => opp.headPos().add(new THREE.Vector3(0, -0.18 - (i % 3) * 0.05, 0)), 1, 0.06);
      } else if (lt < 0.58) {
        // slammed down onto their back
        const k = (lt - 0.4) / 0.18, e = k * k;
        opp.x = THREE.MathUtils.lerp(f.x + dir * 1.05 * f.scale, lieX, e); opp.y = THREE.MathUtils.lerp(0.75, 0.14, e); lie(e);
        f.setPose('smash', 30);
        drawTendrils(f.tend, base, (i) => opp.chestPos().add(new THREE.Vector3(0, (i - 2.5) * 0.1, 0)), 1, 0.06);
      } else {
        opp.x = lieX; opp.y = 0.14; lie(1);
        // tendrils pin the body to the floor
        drawTendrils(f.tend, base, (i) => new THREE.Vector3(f.x + dir * (0.9 + i * 0.28), 0.05, (i % 2 ? 0.3 : -0.3)), 1, 0.05);
      }
      // the greatsword: biomass swells off the right hand into a jagged blade
      if (F.blade) {
        const hand = handPos(f, 'cast');
        const grow = Math.min(1, (lt - F.bladeT) / 0.45);
        const tip = F.stuck ? F.stuck : null;
        const want = tip ? tip.clone().sub(hand).normalize() : lt < 1.95 ? new THREE.Vector3(dir * 0.15, 1, 0).normalize() : new THREE.Vector3(dir * 0.35, -1, 0).normalize();
        F.dirV = F.dirV ? F.dirV.lerp(want, Math.min(1, dt * 18)).normalize() : want.clone();
        F.blade.position.copy(hand);
        const x = new THREE.Vector3().crossVectors(F.dirV, new THREE.Vector3(0, 0, 1)).normalize();
        F.blade.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, F.dirV, new THREE.Vector3().crossVectors(x, F.dirV)));
        const fade = F.dissolveT !== undefined ? Math.max(0.001, 1 - (lt - F.dissolveT) / 0.35) : 1;
        F.blade.scale.set((0.4 + 0.6 * grow) * fade, grow * fade, fade).multiplyScalar(f.scale);
        F.blade.children[0].material.emissiveIntensity = 0.6 + Math.sin(lt * 18) * 0.35;
        if (grow < 1 || Math.random() < 0.3) g.fx.emit(hand, { dark: true, count: 3, color: INK, color2: 0x1a2040, speed: 2, life: 0.4, size: 0.25, jitter: 0.4 });
      }
      const splatter = (p, n, spd) => g.fx.emit(p, { dark: true, count: n, color: INK, color2: 0x1c1430, speed: spd, life: 0.8, size: 0.2, up: 3, gravity: 10, jitter: 0.2 });
      const done = lockCombo(f, g, t, [
        { at: 0.12, dmg: 3, sfx: 'slash', color: 0x9aa8ff, fx: () => g.audio.play('squelch', 0.9) },
        { at: 0.56, dmg: 4, sfx: 'heavy', color: 0x6a74ff, fx: () => { const p = new THREE.Vector3(lieX - dir * 0.9, 0.05, 0); g.fx.dust(p, 30); crater(g, p.x, 1.0, 2.6); g.audio.play('boom', 1); g.shake(0.8); g.rumble(0.8, 250); } },
        { at: 0.62, pose: 'bite' },
        { at: 0.86, dmg: 4.5, sfx: 'slash', color: 0x6a74ff, fx: () => { splatter(headAt(), 30, 4); g.audio.play('squelch', 1.2); g.shake(0.4); } },
        { at: 1.02, pose: 'biteRip', fx: () => { splatter(headAt().add(new THREE.Vector3(-dir * 0.2, 0.3, 0)), 24, 5); g.audio.play('slash', 0.8); } },
        { at: 1.25, pose: 'swordRaise', fx: () => { F.blade = venomBlade(); F.bladeT = 1.25; F.blade.userData.disposeTree = true; g.fx.group.add(F.blade); g.audio.play('squelch', 1.3); g.audio.play('roar', 0.7); g.setDark(0.35, 1.4); } },
        { at: 1.95, pose: 'stab' },
        { at: 2.05, pose: 'stab', dmg: 11, sfx: 'slash', knockdown: true, final: true, color: 0x6a74ff, spark: 2.4, fx: () => {
          const p = new THREE.Vector3(f.x + dir * 1.25 * f.scale, 0.05, 0);
          F.stuck = p.clone();
          g.audio.play('boom', 1.4); g.audio.play('squelch', 1.4);
          g.shake(1.5); g.rumble(1, 500); g.hitstop(0.12);
          splatter(p.clone().setY(0.3), 70, 9);
          g.fx.emit(p.clone().setY(0.2), { dark: true, count: 40, color: INK, color2: 0x10142a, dir: new THREE.Vector3(0, 0.25, 0), spread: 2.2, speed: 12, life: 0.6, size: 0.18, drag: 2 });
          crater(g, p.x, 1.6, 3, 0x020208);
          g.fx.ring(p, 0x6a74ff, 4, 0.45);
          if (g.post) { const v = p.clone().project(g.camera); g.post.impactAt(new THREE.Vector2(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5), 0.1); }
        } },
        { at: 2.45, fx: () => { F.dissolveT = t - f.lockT; g.audio.play('squelch', 0.7); } },
        { at: 2.85 },
      ]);
      if (done) { ULTIMATES.venomFeast.cleanup(f, g); return false; }
      return true;
    },
    cleanup(f, g) {
      removeTendrils(g, f.tend); f.tend = null;
      if (f.feast && f.feast.blade) { g.fx.group.remove(f.feast.blade); f.feast.blade.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      f.feast = null;
      const o = g.opponentOf(f); if (o) o.frozen = false;
    },
  },

  // MERC WITH A MOUTH: katana dash, a blur of cuts and kicks, a word to the audience, then a finisher
  mercMouth: {
    update(f, g, t) {
      const opp = g.opponentOf(f);
      if (!f.locked) {
        if (t < 0.12) { f.setPose('slashW'); return true; }
        if (t < 0.42) {
          f.setPose('slash'); f.vx = f.facing * 22; f.noPush = true;
          if (!f.hitId) { f.hitId = newHitId(); g.audio.play('slash'); }
          g.fx.emit(new THREE.Vector3(f.x, 1.1, 0), { count: 3, color: 0xff3040, speed: 0.5, life: 0.25, size: 0.4 });
          const x0 = f.x - f.facing * 0.3, x1 = f.x + f.facing * 1.4;
          const r = g.zoneHit(f, { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: 0.4, y1: 1.9 }, { id: f.hitId, dmg: 3, height: 'mid', stun: 0.9, blockstun: 0.35, push: 2, kind: 'ult', sfx: 'slash', color: 0xd8dcff });
          if (r === 'hit' && opp.hp > 0) { f.vx = 0; f.noPush = false; startLock(f, g, opp); }
          return true;
        }
        f.noPush = false; f.vx *= 0.8; f.setPose('idle');
        return t < 0.8;
      }
      f.vx = 0;
      const side = (s) => (ff, o) => {
        g.fx.emit(new THREE.Vector3(ff.x, ff.y + 1.1, 0), { count: 12, color: 0xff3040, color2: 0xffffff, speed: 3, life: 0.3, size: 0.3 });
        ff.x = THREE.MathUtils.clamp(o.x + s * 1.1, -g.bounds, g.bounds); ff.facing = ff.x < o.x ? 1 : -1; ff.snapFacing();
      };
      const cut = () => g.fx.ring(new THREE.Vector3(opp.x, opp.y + 1.2, 0.2), 0xd8dcff, 1.1, 0.16, 'face');
      const LINES = ['Is this thing on?', 'Hi, Mom!', 'Kids, don\'t try this at home.', 'Am I the main character now?', 'Remember to stretch!'];
      const quip = () => {
        // fourth wall: turn to the camera for a moment, then straight back to work
        f.faceCam = true; g.focusOn(f, 0.85, { dx: 0.15, dz: 1.5, dy: -0.15 });
        g.hud.announce(LINES[Math.floor(Math.random() * LINES.length)], 'quip', 0.9);
        g.audio.grunt(f.hero, 'effort', 0.9);
      };
      const back = () => { f.faceCam = false; if (g.camFocus && g.camFocus.f === f) g.camFocus = null; };
      const done = lockCombo(f, g, t, [
        { at: 0.04, reposition: side(-1), pose: 'slash', dmg: 3, sfx: 'slash', color: 0xd8dcff, fx: cut },
        { at: 0.15, reposition: side(1), pose: 'spinKick', dmg: 3, sfx: 'heavy' },
        { at: 0.26, reposition: side(-1), pose: 'slash', dmg: 3, sfx: 'slash', color: 0xd8dcff, fx: cut },
        { at: 0.37, reposition: side(1), pose: 'jab', dmg: 2.5, sfx: 'light' },
        { at: 0.52, pose: 'wave', fx: quip },
        { at: 1.38, pose: 'slashW', fx: back },
        { at: 1.52, pose: 'slash', dmg: 10, sfx: 'slash', knockdown: true, launch: 8, final: true, color: 0xff3040, fx: () => { cut(); g.fx.ring(new THREE.Vector3(opp.x, opp.y + 1.2, 0.25), 0xff3040, 2.4, 0.25, 'face'); } },
        { at: 2.0 },
      ]);
      if (done) { back(); return false; }
      return true;
    },
    cleanup(f, g) { f.faceCam = false; if (g.camFocus && g.camFocus.f === f) g.camFocus = null; },
  },
};
