// A versus match: scene, fighters, projectiles, hit resolution, camera,
// round flow and cinematics.
import * as THREE from 'three';
import { Fighter, GRAVITY } from './fighter.js';
import { buildArena, makeEnvironment } from './arenas.js';
import { Effects } from './effects.js';
import { POSES } from './rig.js';
import { setRim } from './enhance.js';

const DAMAGE_SCALE = 0.85; // global pacing knob: lower = longer rounds
const PRAISE =['', '', 'NICE', 'GREAT', 'SUPERB', 'BRUTAL', 'OUTSTANDING', 'LEGENDARY'];

function overlap(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }

export class Match {
  constructor({ heroes, stageId, cpu, settings, audio, inputs, hud, onEnd, renderer, cine }) {
    this.post = cine || null;
    this.settings = settings;
    this.audio = audio;
    this.hud = hud;
    this.onEnd = onEnd;
    this.gravity = GRAVITY;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 1200);
    this.arena = buildArena(stageId);
    this.scene.add(this.arena.group);
    this.scene.fog = this.arena.fog;
    if (renderer) { this.arena.envRT = makeEnvironment(renderer, this.arena); this.scene.environment = this.arena.envRT.texture; }
    setRim(this.arena.rimColor ?? 0x7fb8ff, this.arena.rimStrength ?? 0.5);
    const key = this.arena.lights.key;
    this.keyBase = key.position.clone();
    if (settings.quality === 'high' || settings.quality === 'ultra') { key.shadow.mapSize.set(2048, 2048); }
    const sc = key.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 7; sc.bottom = -3; sc.updateProjectionMatrix();
    this.bounds = this.arena.bounds;
    this.fx = new Effects(this.scene);
    const mirror = heroes[0].id === heroes[1].id;
    this.fighters = heroes.map((h, i) => {
      const f = new Fighter(h, i, mirror && i === 1);
      f.game = this;
      f.ctrl = inputs[i];
      f.cpu = cpu[i];
      this.scene.add(f.root);
      return f;
    });
    this.fighters.forEach((f) => { f.ult = 0; });
    this.projectiles = [];
    this.round = 1;
    this.roundsToWin = settings.rounds;
    this.roundTime = settings.time;
    this.timer = this.roundTime || 99;
    this.phase = 'intro';
    this.phaseT = 0;
    this.time = 0;
    this.stopT = 0;
    this.slowT = 0;
    this.timeScale = 1;
    this.shakeAmt = 0;
    this.cine = null;
    this.dt = 0;
    this.camPos = new THREE.Vector3(0, 5, 22);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    this.camera.position.copy(this.camPos);
    this.positionFighters();
    hud.setup(this);
    this.audio.setMusic('fight');
  }

  opponentOf(f) { return f === this.fighters[0] ? this.fighters[1] : this.fighters[0]; }

  positionFighters() {
    const [a, b] = this.fighters;
    a.reset(-2.8); b.reset(2.8);
    for (const p of this.projectiles) this.killProjectile(p);
    this.projectiles = [];
    this.fx.clear();
  }

  // ---------------- hit resolution ----------------
  zoneHit(att, box, hit) {
    const def = this.opponentOf(att);
    if (def.state === 'ko' || this.phase !== 'fight') return null;
    const hb = def.hurtbox();
    if (!hb || !overlap(box, hb)) return null;
    if (!def.gotHits) def.gotHits = new Set();
    if (def.gotHits.has(hit.id)) return null;
    def.gotHits.add(hit.id);
    if (def.gotHits.size > 200) def.gotHits = new Set([hit.id]);
    const cy = THREE.MathUtils.clamp((Math.max(box.y0, hb.y0) + Math.min(box.y1, hb.y1)) / 2, def.y + 0.25, def.y + 1.75 * def.scale);
    return this.applyHit(att, def, hit, cy);
  }

  directHit(att, def, hit) {
    if (def.state === 'ko' || this.phase !== 'fight') return null;
    return this.applyHit(att, def, Object.assign({ unblockable: true }, hit), def.y + 1.2 * def.scale);
  }

  applyHit(att, def, hit, contactY) {
    if (def.invuln > 0 && !hit.unblockable) return null;
    const src = hit.srcX ?? att.x;
    const dir = Math.sign(def.x - src) || att.facing;
    const heightOk = !(hit.height === 'low' && !def.crouching) && !(hit.height === 'overhead' && def.crouching);
    const blocked = !hit.unblockable && def.canBlock() && def.facing === -dir && heightOk;
    const contact = new THREE.Vector3(def.x - dir * 0.3 * def.scale, contactY, 0.35);
    if (blocked) {
      let chip = hit.chip ?? 0.12;
      if (def.hero.id === 'cap' && !def.shieldOut) chip *= 0.3;
      if (def.hero.id === 'doom') chip *= 0.5;
      const dmg = hit.dmg * att.hero.power * chip;
      def.hp = hit.kind === 'ult' ? Math.max(0, def.hp - dmg) : Math.max(Math.min(def.hp, 1), def.hp - dmg);
      def.enterBlockstun(hit.blockstun ?? 0.18, dir * ((hit.push ?? 2) * 0.55 + 0.8) / def.hero.weight);
      def.ult = Math.min(100, def.ult + 2.5);
      att.ult = Math.min(100, att.ult + 1.5);
      def.stats.blocked++;
      this.fx.hitSpark(contact, 0x9fd8ff, 0.5, true);
      this.audio.play(def.hero.id === 'cap' ? 'shield' : 'block', 0.9);
      this.hitstop(0.04);
      if (def.hp <= 0) this.onKO(att, def);
      return 'blocked';
    }
    const comboing = def.isStunned();
    att.combo = comboing ? att.combo + 1 : 1;
    const mul = 1 + Math.min(att.combo - 1, 6) * 0.04;
    const dmg = hit.dmg * att.hero.power * def.hero.defense * mul * DAMAGE_SCALE;
    def.hp = Math.max(0, def.hp - dmg);
    if (att.state !== 'ultimate') att.ult = Math.min(100, att.ult + dmg * (1.05 + att.combo * 0.05));
    def.ult = Math.min(100, def.ult + dmg * 0.6);
    att.stats.dmg += dmg; att.stats.hits++; att.stats.maxCombo = Math.max(att.stats.maxCombo, att.combo);
    def.takeHit(hit, dir);
    const power = hit.spark ?? ({ light: 0.6, medium: 1, heavy: 1.5, special: 1.3, ult: 1.2 }[hit.kind] || 1);
    this.fx.hitSpark(contact, hit.color ?? 0xffa040, power);
    if (hit.zap) this.fx.bolt(contact.clone().add(new THREE.Vector3(0, 1.2, 0)), contact, 0x9fd8ff, 0.15, 0.07, 1);
    this.audio.play(hit.sfx || 'light', hit.sfxVol ?? 1);
    const k = hit.kind;
    this.shake(hit.shake ?? (k === 'heavy' ? 0.35 : k === 'medium' ? 0.18 : k === 'special' ? 0.3 : k === 'ult' ? 0.25 : 0.08));
    this.hitstop(k === 'heavy' ? 0.1 : k === 'medium' ? 0.065 : k === 'special' ? 0.08 : k === 'ult' ? 0.05 : 0.045);
    if (this.post) {
      const amt = { light: 0.0, medium: 0.025, heavy: 0.05, special: 0.04, ult: 0.03 }[k] ?? 0.02;
      if (amt > 0) { const v = contact.clone().project(this.camera); this.post.impactAt(new THREE.Vector2(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5), amt * (hit.final ? 2 : 1)); }
      if (hit.launch || hit.knockdown) this.post.motion(dir, 0.012);
    }
    if (att.combo >= 2) this.hud.combo(att.side, att.combo, PRAISE[Math.min(att.combo, PRAISE.length - 1)]);
    if (def.hp <= 0) this.onKO(att, def);
    return 'hit';
  }

  // ---------------- projectiles ----------------
  spawnProjectile(o) {
    const p = Object.assign({ vy: 0, age: 0, alive: true, hitCount: 0, clash: true, hitTargets: new Set(), id: Math.random() }, o);
    p.hit = Object.assign({}, o.hit);
    p.resetHits = () => { p.hitTargets.clear(); p.hitId = Math.random().toString(36); };
    p.hitId = Math.random().toString(36);
    p.kill = (target) => this.killProjectile(p, target);
    if (p.mesh) { p.mesh.position.set(p.x, p.y, 0); this.scene.add(p.mesh); }
    this.projectiles.push(p);
    return p;
  }

  killProjectile(p, target = null) {
    if (!p.alive) return;
    p.alive = false;
    if (p.mesh) {
      this.scene.remove(p.mesh);
      if (!p.keepMesh) p.mesh.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose && m.material.dispose(); } });
    }
    p.onEnd && p.onEnd(p, target);
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.mesh) { p.mesh.position.set(p.x, p.y, 0); if (!p.ground) p.mesh.rotation.y += dt * 4; }
      if (p.trail && Math.random() < 0.9) this.fx.emit(new THREE.Vector3(p.x, p.y, 0), { count: 2, color: p.trail, speed: 0.6, life: 0.25, size: 0.28, drag: 4 });
      p.onUpdate && p.onUpdate(p, dt);
      if (!p.alive) continue;
      if (p.age > p.life || Math.abs(p.x) > this.bounds + 4) { this.killProjectile(p); continue; }
      const def = this.opponentOf(p.owner);
      const hb = def.hurtbox();
      if (hb && !p.hitTargets.has(def) && def.state !== 'ko' && this.phase === 'fight') {
        const cx = THREE.MathUtils.clamp(p.x, hb.x0, hb.x1), cy = THREE.MathUtils.clamp(p.y, hb.y0, hb.y1);
        if (Math.hypot(p.x - cx, p.y - cy) < p.r) {
          p.hitTargets.add(def);
          const dirX = Math.sign(p.vx) || p.owner.facing;
          const res = this.applyHit(p.owner, def, Object.assign({ id: p.hitId, srcX: p.x - dirX * 2 }, p.hit), THREE.MathUtils.clamp(p.y, def.y + 0.3, def.y + 1.7));
          if (res) {
            p.hitCount++;
            p.onHitResult && p.onHitResult(res, def);
            if (!p.persistent) { this.killProjectile(p, def); continue; }
          } else p.hitTargets.delete(def);
        }
      }
    }
    // clashes
    for (let i = 0; i < this.projectiles.length; i++) for (let j = i + 1; j < this.projectiles.length; j++) {
      const a = this.projectiles[i], b = this.projectiles[j];
      if (!a.alive || !b.alive || a.owner === b.owner || !a.clash || !b.clash) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) {
        const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, 0.3);
        this.fx.hitSpark(mid, 0xffffff, 1.4);
        this.audio.play('blast', 0.7);
        if (!a.persistent) this.killProjectile(a); else a.vx = -a.vx;
        if (!b.persistent) this.killProjectile(b); else b.vx = -b.vx;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  // ---------------- feel ----------------
  shake(a) { if (this.settings.shake) this.shakeAmt = Math.max(this.shakeAmt, a); }
  hitstop(t) { this.stopT = Math.max(this.stopT, t); }

  ultCinematic(f) {
    this.cine = { f, t: 0, dur: 0.95 };
    if (this.post) this.post.impact(0.35);
    this.hud.ultBanner(f.hero.ultimate.name, f.side);
    this.audio.play('ultstart');
    this.audio.say(f.hero.ultimate.name);
  }

  onKO(att, def) {
    if (this.phase !== 'fight') return;
    this.phase = 'ko'; this.phaseT = 0;
    this.roundWinner = att;
    this.slowT = 1.4;
    this.hud.announce('K.O.', 'red', 1.8);
    if (this.post) this.post.impact(1);
    this.audio.play('ko');
    this.audio.say('K.O.');
    this.shake(1);
  }

  // ---------------- update ----------------
  update(rawDt) {
    const realDt = Math.min(rawDt, 1 / 20);
    this.time += realDt;
    this.phaseT += realDt;
    this.arena.update(realDt, this.time);
    for (const f of this.fighters) f.ctrl.update(realDt, f, this.opponentOf(f), this);

    if (this.slowT > 0) { this.slowT -= realDt; this.timeScale = 0.3; } else this.timeScale = 1;
    let dt = realDt * this.timeScale;

    if (this.cine) {
      const c = this.cine;
      c.t += realDt;
      c.f.rig.update(POSES.charge, realDt, 8);
      c.f.rig.setExpression('roar');
      c.f.rig.lateUpdate(realDt);
      const col = new THREE.Color(c.f.hero.color);
      this.fx.emit(c.f.chestPos(), { count: 4, color: col, color2: 0xffffff, speed: 5, life: 0.5, size: 0.3, jitter: 0.8 });
      if (c.t >= c.dur) { this.cine = null; this.hud.ultBanner(null); }
      dt = 0;
    } else if (this.stopT > 0) {
      this.stopT -= realDt;
      dt = 0;
    }
    this.dt = dt;

    this.updatePhase(realDt);

    if (dt > 0) {
      const [a, b] = this.fighters;
      a.update(dt, b); b.update(dt, a);
      this.resolvePush(a, b);
      if (this.post) for (const f of this.fighters) if (Math.abs(f.vx) > 9 && (f.state === 'special' || f.state === 'ultimate' || f.state === 'attack')) this.post.motion(Math.sign(f.vx), Math.min(0.016, Math.abs(f.vx) * 0.0007));
      this.updateProjectiles(dt);
      for (const f of this.fighters) { if (!this.opponentOf(f).isStunned() && f.combo) { f.combo = 0; } }
    }
    this.fx.update(realDt * (this.slowT > 0 ? 0.5 : 1));
    this.updateCamera(realDt);
    this.hud.update(this, realDt);
  }

  resolvePush(a, b) {
    const skip = (f) => f.noPush || f.state === 'down' || f.state === 'ko' || f.state === 'getup';
    if (!skip(a) && !skip(b)) {
      const vOverlap = a.y < b.y + 1.5 * b.scale && b.y < a.y + 1.5 * a.scale;
      const minD = 0.36 * a.scale + 0.36 * b.scale;
      let dx = b.x - a.x;
      if (vOverlap && Math.abs(dx) < minD) {
        const s = Math.sign(dx) || a.facing;
        const over = minD - Math.abs(dx);
        let pa = over / 2, pb = over / 2;
        if (a.x - s * pa < -this.bounds || a.x - s * pa > this.bounds) { pb += pa; pa = 0; }
        if (b.x + s * pb < -this.bounds || b.x + s * pb > this.bounds) { pa += pb; pb = 0; }
        a.x -= s * pa; b.x += s * pb;
      }
    }
    // keep both on screen
    const maxSep = 14;
    const sep = b.x - a.x;
    if (Math.abs(sep) > maxSep) {
      const fix = (Math.abs(sep) - maxSep) / 2 * Math.sign(sep);
      a.x += fix; b.x -= fix;
    }
    for (const f of [a, b]) f.x = THREE.MathUtils.clamp(f.x, -this.bounds, this.bounds);
  }

  updatePhase(dt) {
    const [a, b] = this.fighters;
    const H = this.hud;
    switch (this.phase) {
      case 'intro': {
        const T = this.phaseT;
        if (!this.introStep) { this.introStep = 1; H.introCard(a.hero, 0); a.exprOverride = 'shout'; this.audio.say(a.hero.name); this.audio.play('roar', 0.3); }
        if (this.introStep === 1 && T > 0.7) { this.introStep = 2; a.exprOverride = a.hero.id === 'doom' ? 'roar' : 'smile'; }
        if (this.introStep === 2 && T > 1.5) { this.introStep = 3; a.exprOverride = null; H.introCard(b.hero, 1); b.exprOverride = 'shout'; this.audio.say(b.hero.name); this.audio.play('roar', 0.3); }
        if (this.introStep === 3 && T > 2.2) { this.introStep = 4; b.exprOverride = b.hero.id === 'doom' ? 'roar' : 'smile'; }
        if (T > 3.0) { b.exprOverride = null; H.introCard(null); this.phase = 'ready'; this.phaseT = 0; this.readyStep = 0; }
        break;
      }
      case 'ready':
        if (this.readyStep === 0) {
          this.readyStep = 1;
          const final = a.roundWins === this.roundsToWin - 1 && b.roundWins === this.roundsToWin - 1 && this.roundsToWin > 1;
          H.announce(final ? 'FINAL ROUND' : `ROUND ${this.round}`, '', 1.1);
          H.roundLabel(final ? 'FINAL ROUND' : `ROUND ${this.round}`);
          this.audio.say(final ? 'Final round' : `Round ${this.round}`);
          this.audio.play('count');
        }
        if (this.readyStep === 1 && this.phaseT > 1.25) {
          this.readyStep = 2;
          H.announce('FIGHT!', 'red', 0.8);
          this.audio.say('Fight!');
          this.audio.play('boom', 0.6);
        }
        if (this.phaseT > 1.55) {
          this.phase = 'fight'; this.phaseT = 0;
          for (const f of this.fighters) { f.state = 'idle'; f.stateT = 0; f.ctrl.clear(); }
        }
        break;
      case 'fight':
        if (this.roundTime > 0 && !this.cine) {
          this.timer -= dt * this.timeScale;
          if (this.timer <= 0) {
            this.timer = 0;
            this.phase = 'timeout'; this.phaseT = 0;
            const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
            this.roundWinner = Math.abs(ra - rb) < 0.001 ? null : (ra > rb ? a : b);
            H.announce('TIME', 'red', 1.5);
            this.audio.say('Time');
            for (const f of this.fighters) if (f.state !== 'ko') { f.state = 'wait'; f.stateT = 0; }
          }
        }
        break;
      case 'ko':
      case 'timeout':
        if (this.phaseT > 2.0 && !this.winnerShown) {
          this.winnerShown = true;
          const w = this.roundWinner;
          if (w) {
            w.roundWins++;
            if (w.onGround && w.state !== 'ko') { w.state = 'victory'; w.stateT = 0; w.vx = 0; }
            const flawless = w.hp >= w.maxHp - 0.01;
            H.announce(`${w.hero.name.toUpperCase()} WINS`, '', 2.0, flawless ? 'FLAWLESS VICTORY' : '');
            this.audio.say(`${w.hero.name} wins${flawless ? '. Flawless victory' : ''}`);
            this.lastFlawless = flawless;
          } else { H.announce('DRAW', '', 2.0); this.audio.say('Draw'); }
          H.pips(this);
        }
        if (this.roundWinner && this.winnerShown && this.roundWinner.state !== 'victory' && this.roundWinner.onGround && this.roundWinner.isFree()) {
          this.roundWinner.state = 'victory'; this.roundWinner.stateT = 0;
        }
        if (this.phaseT > 4.4) {
          this.winnerShown = false;
          const w = this.roundWinner;
          if (w && w.roundWins >= this.roundsToWin) {
            this.phase = 'over'; this.phaseT = 0;
            this.onEnd && this.onEnd({ winner: w, loser: this.opponentOf(w), flawless: this.lastFlawless, match: this });
          } else {
            this.round++;
            this.timer = this.roundTime || 99;
            this.positionFighters();
            this.phase = 'ready'; this.phaseT = 0; this.readyStep = 0;
          }
        }
        break;
      case 'over':
        break;
    }
  }

  updateCamera(dt) {
    const [a, b] = this.fighters;
    let pos = new THREE.Vector3(), look = new THREE.Vector3();
    let rate = 5;
    const midX = (a.x + b.x) / 2;
    const sep = Math.abs(a.x - b.x);
    const midY = (a.y + b.y) / 2;
    const aspect = innerWidth / innerHeight;
    const aspectK = THREE.MathUtils.clamp(1.78 / aspect, 0.8, 2.2);
    const maxY = Math.max(a.y, b.y);
    const dist = THREE.MathUtils.clamp(6.8 + sep * 0.9 * aspectK + maxY * 1.1, 8.5, 19 * aspectK);
    pos.set(midX, 1.75 + dist * 0.07 + maxY * 0.55, dist);
    look.set(midX, 1.2 + maxY * 0.6, 0);
    const faceShot = (f, dx, dz, dy = 0) => {
      const h = f.headPos();
      pos.set(h.x + f.facing * dx, h.y + dy, h.z + dz);
      look.set(h.x, h.y - 0.04 * f.scale, h.z);
    };
    if (this.phase === 'intro') {
      const T = this.phaseT;
      if (T < 1.5) { faceShot(a, 0.6 + T * 0.15, (1.15 + T * 0.2) * a.scale, -0.08); rate = T < 0.1 ? 60 : 6; }
      else if (T < 3.0) { faceShot(b, 0.6 + (T - 1.5) * 0.15, (1.15 + (T - 1.5) * 0.2) * b.scale, -0.08); rate = T < 1.6 ? 60 : 6; }
      else rate = 4;
    }
    this.cineActive = !!this.cine && !!this.cine.f;
    if (this.cine && this.cine.f) {
      const f = this.cine.f;
      const t = this.cine.t;
      faceShot(f, 0.9 - t * 0.25, 1.15 * f.scale + 0.4 - t * 0.35, -0.05);
      rate = 7;
    } else if ((this.phase === 'ko' || this.phase === 'timeout') && this.phaseT > 2.0 && this.roundWinner) {
      const w = this.roundWinner;
      const t = this.phaseT - 2;
      faceShot(w, 0.95 + Math.sin(t * 0.5) * 0.35, 2.1 * w.scale, -0.2 * w.scale);
      rate = 3;
    } else if (this.phase === 'over' && this.roundWinner) {
      const w = this.roundWinner;
      const t = this.phaseT;
      faceShot(w, 1.0 + Math.sin(t * 0.3) * 0.5, 2.5 * w.scale, -0.3 * w.scale);
      rate = 2;
    }
    const k = 1 - Math.exp(-rate * dt);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.post) {
      const close = this.phase === 'intro' || this.cineActive || (this.phase === 'ko' || this.phase === 'timeout') && this.phaseT > 2 || this.phase === 'over';
      this.post.setFocus(this.camPos.distanceTo(this.camLook), close ? 2.2 : 7);
      this.post.letterbox(!!(this.phase === 'intro' || this.cineActive || this.phase === 'over' || ((this.phase === 'ko' || this.phase === 'timeout') && this.phaseT > 2)));
    }
    const key = this.arena.lights.key;
    key.position.set(this.keyBase.x + midX, this.keyBase.y, this.keyBase.z);
    key.target.position.set(midX, 0, 0);
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shakeAmt *= Math.exp(-9 * dt);
    }
    this.camera.lookAt(this.camLook);
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  dispose() {
    for (const p of this.projectiles) this.killProjectile(p);
    this.fx.clear();
    this.arena.dispose();
    this.scene.traverse((o) => { if (o.isMesh) { o.geometry && o.geometry.dispose(); } });
  }
}
