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
  hulk: { heavy: { pose: ['smashW', 'smash'], startup: 0.28, recovery: 0.34, dmg: 12, x1: 1.25, y0: 0.2, height: 'overhead', armor: true, knockdown: true, shake: 0.5 } },
  gamora: {
    jab: { x1: 1.25, sfx: 'slash' }, cross: { x1: 1.3, sfx: 'slash' },
    heavy: { pose: ['slashW', 'slash'], x1: 1.75, dmg: 11, sfx: 'slash', color: 0x8fdcff },
  },
  cap: { heavy: { sfx: 'shield', color: 0xbfd6ff } },
  ironman: { heavy: { color: 0x8fe0ff } },
  spiderman: { kick: { x1: 1.38 } },
  doom: { heavy: { color: 0x7dff6a, zap: true, dmg: 11.5 } },
  sentry: { heavy: { dmg: 12, color: 0xffd060, x1: 1.2 }, cross: { color: 0xffd060 } },
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

  webPull: {
    update(f, g, t) {
      if (t < 0.12) f.setPose('castW');
      else {
        f.setPose('cast');
        if (!f.fired) {
          f.fired = true;
          const p = handPos(f);
          const web = line3(0xf2f2f2, 0.018);
          g.fx.group.add(web);
          const proj = g.spawnProjectile({ owner: f, x: p.x, y: p.y, vx: f.facing * 20, r: 0.26, life: 0.52, mesh: glowOrb(0xffffff, 0.16), trail: 0xffffff,
            hit: { dmg: 5, height: 'mid', stun: 0.75, blockstun: 0.2, push: 0, pull: true, kind: 'special', sfx: 'web', color: 0xffffff },
            onUpdate: (pr) => { web.setEnds(handPos(f), new THREE.Vector3(pr.x, pr.y, 0)); },
            onEnd: (pr, hitTarget) => {
              if (hitTarget) {
                g.fx.timed(web, 0.28, (m) => m.setEnds(handPos(f), new THREE.Vector3(hitTarget.x, hitTarget.y + 1.2 * hitTarget.scale, 0)));
              } else { g.fx.group.remove(web); web.geometry.dispose(); }
            } });
          g.audio.play('web');
          void proj;
        }
      }
      return t < 0.48;
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

  groundSmash: {
    update(f, g, t) {
      if (t < 0.32) { f.setPose('smashW'); f.armor = true; }
      else {
        f.setPose('smash', 30); f.armor = false;
        if (!f.fired) {
          f.fired = true;
          g.audio.play('boom', 0.7); g.audio.play('roar', 0.5); g.shake(0.55);
          const x0 = f.x + f.facing * 1.3 * f.scale;
          g.fx.ring(new THREE.Vector3(x0, 0.05, 0), 0xffb070, 2.2, 0.35);
          g.fx.dust(new THREE.Vector3(x0, 0.1, 0), 24);
          const mesh = new THREE.Group();
          const rockM = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 1, flatShading: true });
          for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.15, 0), rockM); r.position.set((Math.random() - 0.5) * 0.6, Math.random() * 0.3, (Math.random() - 0.5) * 0.6); r.castShadow = true; mesh.add(r); }
          g.spawnProjectile({ owner: f, x: x0, y: 0.25, vx: f.facing * 11.5, r: 0.55, life: 0.95, mesh, ground: true, clash: false,
            hit: { dmg: 11, height: 'low', stun: 0.5, blockstun: 0.26, push: 3, knockdown: true, kind: 'special', sfx: 'heavy', color: 0xffb070 },
            onUpdate: (pr, dt) => {
              mesh.children.forEach((r, i) => { r.position.y = Math.abs(Math.sin(pr.age * 18 + i)) * 0.5; r.rotation.x += dt * 8; });
              if (Math.random() < 0.7) g.fx.dust(new THREE.Vector3(pr.x, 0.1, 0), 2);
            } });
        }
      }
      return t < 0.8;
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
};

// ------------------------------------------------------------------
// ULTIMATES — run after the cinematic freeze. Same contract as specials.
// ------------------------------------------------------------------
function lockCombo(f, g, t, steps) {
  const opp = g.opponentOf(f);
  return seq(f, steps, t - f.lockT, (s) => {
    if (s.pose) f.setPose(s.pose, 40);
    if (s.reposition) s.reposition(f, opp);
    if (s.dmg) {
      g.directHit(f, opp, { id: newHitId(), dmg: s.dmg, stun: 0.6, push: 0, kind: 'ult', sfx: s.sfx || 'light', color: s.color || 0xffd27a, launch: s.launch, knockdown: s.knockdown, keepLock: !s.final, spark: s.final ? 2 : 1 });
      if (s.final) { g.shake(0.8); g.hitstop(0.18); }
    }
    s.fx && s.fx(f, opp);
  });
}

function startLock(f, g, opp) {
  f.lockT = f.ultT;
  f.seqIdx = 0;
  f.locked = true;
  opp.lockBy(f);
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

  theVoid: {
    update(f, g, t) {
      const opp = g.opponentOf(f);
      const V3 = THREE.Vector3;
      f.rig.setVoid(1);
      if (f.rig.aura) { f.rig.aura.color.set(0x8a10ff); f.rig.aura.intensity = 6 + Math.sin(t * 20) * 2; }
      if (!f.tendrils) {
        f.tendrils = [];
        const m = new THREE.MeshStandardMaterial({ color: 0x020103, emissive: 0x24003c, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.2 });
        for (let i = 0; i < 7; i++) { const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m); mesh.castShadow = true; g.fx.group.add(mesh); f.tendrils.push({ mesh, i }); }
        g.audio.play('roar', 1.2); g.audio.play('ultstart', 0.5); g.shake(0.6);
      }
      g.fx.emit(f.chestPos(), { count: 3, color: 0x6a10c0, color2: 0xff2040, speed: 3, life: 0.6, size: 0.4, jitter: 1.2 });
      const base = f.chestPos().add(new V3(-f.facing * 0.2, 0.15, -0.2));
      let target, reach = 1;
      if (!f.locked) {
        f.setPose(t < 0.35 ? 'charge' : 'castBoth');
        reach = THREE.MathUtils.clamp((t - 0.35) / 0.3, 0, 1) * (t > 1.0 ? Math.max(0, 1 - (t - 1.0) / 0.35) : 1);
        target = opp.chestPos();
        if (t > 0.62 && !f.fired) {
          f.fired = true;
          const x1 = f.x + f.facing * 10;
          const r = g.zoneHit(f, { x0: Math.min(f.x, x1), x1: Math.max(f.x, x1), y0: 0, y1: 3 }, { id: newHitId(), dmg: 4, height: 'mid', stun: 0.9, blockstun: 0.4, push: 2, kind: 'ult', sfx: 'heavy', color: 0x9a20ff });
          if (r === 'hit' && opp.hp > 0) { startLock(f, g, opp); g.audio.play('boom', 0.7); }
        }
        if (!f.locked && t > 1.4) { ULTIMATES.theVoid.cleanup(f, g); return false; }
      } else {
        f.setPose('castBoth');
        const lt = t - f.lockT;
        // lift and slam three times, then hurl
        if (opp.state === 'locked') {
          const k = Math.min(2, Math.floor(lt / 0.5)), ph = lt - k * 0.5;
          const y = lt < 1.5 ? (ph < 0.3 ? (ph / 0.3) * 2.6 : Math.max(0, 2.6 * (1 - (ph - 0.3) / 0.1))) : 0;
          opp.onGround = false; opp.y = y; opp.x = THREE.MathUtils.clamp(f.x + f.facing * 2.3, -g.bounds, g.bounds);
        }
        target = opp.chestPos();
        const slam = () => { const p = new V3(opp.x, 0.05, 0); g.fx.ring(p, 0x9a20ff, 3, 0.4); g.fx.dust(p, 30); g.shake(0.7); g.audio.play('boom', 0.9); };
        const done = lockCombo(f, g, t, [
          { at: 0.4, dmg: 6, sfx: 'heavy', color: 0x9a20ff, fx: slam }, { at: 0.9, dmg: 6, sfx: 'heavy', color: 0x9a20ff, fx: slam }, { at: 1.4, dmg: 6, sfx: 'heavy', color: 0x9a20ff, fx: slam },
          { at: 1.75, dmg: 9, sfx: 'heavy', launch: 12, final: true, color: 0xff2040, fx: () => { g.fx.ring(opp.chestPos(), 0xff2040, 4, 0.4, 'face'); } },
          { at: 2.3 },
        ]);
        if (done) { ULTIMATES.theVoid.cleanup(f, g); return false; }
      }
      // tendrils: writhing tubes from the back to the target
      const tt = performance.now() * 0.001;
      for (const tn of f.tendrils) {
        const i = tn.i;
        const spread = new V3(Math.sin(i * 1.7) * 0.5, Math.cos(i * 2.3) * 0.45, Math.sin(i * 0.9) * 0.4);
        const end = base.clone().lerp(target.clone().add(spread.clone().multiplyScalar(0.6)), reach);
        const mid1 = base.clone().lerp(end, 0.33).add(new V3(0, 0.7 + Math.sin(tt * 6 + i) * 0.35, Math.cos(tt * 5 + i) * 0.5 - 0.3)).add(spread);
        const mid2 = base.clone().lerp(end, 0.7).add(new V3(0, 0.35 + Math.sin(tt * 7 + i * 2) * 0.3, Math.sin(tt * 4 + i) * 0.4));
        const curve = new THREE.CatmullRomCurve3([base.clone().add(spread.clone().multiplyScalar(0.3)), mid1, mid2, end]);
        tn.mesh.geometry.dispose();
        tn.mesh.geometry = new THREE.TubeGeometry(curve, 24, 0.045 + (i % 3) * 0.01, 6, false);
      }
      return true;
    },
    cleanup(f, g) {
      if (f.tendrils) { for (const tn of f.tendrils) { g.fx.group.remove(tn.mesh); tn.mesh.geometry.dispose(); } f.tendrils[0] && f.tendrils[0].mesh.material.dispose(); f.tendrils = null; }
      f.rig.setVoid(0);
      if (f.rig.aura) { f.rig.aura.color.set(0xffd070); f.rig.aura.intensity = 0; }
    },
  },


  webBarrage: {
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
            onHitResult: (res, target) => { if (res === 'hit' && target.hp > 0) startLock(f, g, target); } });
        }
        return t < 0.9;
      }
      const flip = (a, b) => (ff, o) => { ff.x = o.x - ff.facing * 1.0; g.fx.emit(new THREE.Vector3(o.x, o.y + 1.2, 0), { count: 10, color: 0xffffff, speed: 4, life: 0.4, size: 0.2 }); };
      const done = lockCombo(f, g, t, [
        { at: 0.05, reposition: flip(), pose: 'jab', dmg: 3.5, fx: () => g.audio.play('web', 0.6) },
        { at: 0.2, pose: 'cross', dmg: 3.5 },
        { at: 0.35, pose: 'kick', dmg: 4, sfx: 'heavy' },
        { at: 0.5, pose: 'hook', dmg: 4, sfx: 'heavy' },
        { at: 0.68, pose: 'jab', dmg: 3.5, reposition: flip() },
        { at: 0.82, pose: 'upperW' },
        { at: 0.95, pose: 'upper', dmg: 8, sfx: 'heavy', launch: 13, final: true },
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

  hulkSmash: {
    update(f, g, t) {
      const opp = g.opponentOf(f);
      if (t < 0.28) { f.setPose('crouch'); f.vx = 0; if (!f.chargeFx) { f.chargeFx = true; g.audio.play('roar'); } return true; }
      if (!f.leapt) {
        f.leapt = true;
        const tx = THREE.MathUtils.clamp(opp.x, -g.bounds, g.bounds);
        f.vy = 14; f.onGround = false; f.noPush = true;
        f.vx = (tx - f.x) / (2 * 14 / g.gravity);
        g.audio.play('jump'); g.fx.dust(new THREE.Vector3(f.x, 0.1, 0), 20);
      }
      if (!f.onGround) { f.setPose('smashW'); return true; }
      if (!f.slammed) {
        f.slammed = true; f.slamT = t; f.vx = 0; f.noPush = false;
        f.setPose('smash', 40);
        g.audio.play('boom', 1.3); g.shake(1.3); g.hitstop(0.1);
        const p = new THREE.Vector3(f.x, 0.05, 0);
        g.fx.ring(p, 0xffb070, 5, 0.5); g.fx.ring(p, 0xffffff, 3, 0.3);
        g.fx.dust(p, 50);
        g.fx.emit(new THREE.Vector3(f.x, 0.3, 0), { count: 40, color: 0xffc080, speed: 10, life: 0.6, size: 0.2, up: 5, gravity: -16 });
        g.fx.flashLight(new THREE.Vector3(f.x, 1, 0), 0xffa060, 18, 0.3);
        g.zoneHit(f, { x0: f.x - 2.8, x1: f.x + 2.8, y0: 0, y1: 2.4 }, { id: newHitId(), dmg: 30, height: 'mid', stun: 0.6, blockstun: 0.5, push: 8, launch: 10, kind: 'ult', sfx: 'heavy', color: 0xffb070, srcX: f.x, chip: 0.3, spark: 2.5 });
      }
      f.setPose('smash');
      return t - f.slamT < 0.65;
    },
  },

  shieldStorm: {
    update(f, g, t) {
      const opp = g.opponentOf(f);
      if (!f.locked) {
        if (t < 0.15) { f.setPose('dash'); return true; }
        if (t < 0.65) {
          f.setPose('dash'); f.vx = f.facing * 16;
          if (!f.hitId) { f.hitId = newHitId(); g.audio.play('whoosh'); }
          g.fx.emit(new THREE.Vector3(f.x, 1.1, 0), { count: 2, color: 0xbfd6ff, speed: 0.5, life: 0.3, size: 0.45 });
          const x0 = f.x, x1 = f.x + f.facing * 1.1;
          const r = g.zoneHit(f, { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: 0.3, y1: 1.9 }, { id: f.hitId, dmg: 4, height: 'mid', stun: 0.8, blockstun: 0.35, push: 2, kind: 'ult', sfx: 'shield', color: 0xbfd6ff });
          if (r === 'hit' && opp.hp > 0) { f.vx = 0; startLock(f, g, opp); }
          else if (r === 'blocked') { f.vx = 0; f.ultT = 0.65; }
          return true;
        }
        f.vx *= 0.8; f.setPose('idle');
        return t < 1.0;
      }
      f.vx = 0;
      const done = lockCombo(f, g, t, [
        { at: 0.08, pose: 'hook', dmg: 4, sfx: 'shield', color: 0xbfd6ff },
        { at: 0.24, pose: 'cross', dmg: 4, sfx: 'shield', color: 0xbfd6ff },
        { at: 0.4, pose: 'kick', dmg: 4.5, sfx: 'heavy' },
        { at: 0.56, pose: 'hook', dmg: 4.5, sfx: 'shield', color: 0xbfd6ff },
        { at: 0.72, pose: 'upperW' },
        { at: 0.86, pose: 'upper', dmg: 9, sfx: 'shield', launch: 13, final: true, color: 0xbfd6ff, fx: () => g.audio.play('heavy') },
        { at: 1.5 },
      ]);
      return !done;
    },
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
};
