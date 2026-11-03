// A fighter: state machine, physics, attacks, and pose selection.
import * as THREE from 'three';
import { POSES, lerpPose, clonePose, addTo } from './rig.js';
import { movesFor, SPECIALS, ULTIMATES, newHitId } from './moves.js';
import { setSweat } from './enhance.js';

const GRAVITY = 32;
const FACE_ANGLE = Math.PI / 2 - 0.38; // turned slightly toward the camera
const FREE = new Set(['idle', 'air']);
const MAX_VX = 18, MAX_VY = 16, CEILING = 6.5; // launch caps and the arena's invisible ceiling
const WALK_SWING = 0.48; // hip swing (rad) either side in the walk cycle
const STRIDE = 2 * 0.89 * Math.sin(WALK_SWING); // metres per step at scale 1 (driver leg length)
const LOOK_AT_FOE = new Set(['idle', 'air', 'attack', 'blockstun', 'special']);
const STUNNED = new Set(['hit', 'locked', 'down', 'ko']);

export class Fighter {
  constructor(hero, side, alt) {
    this.hero = hero;
    this.side = side;
    this.rig = hero.build(alt);
    this.root = this.rig.root;
    this.scale = this.rig.dims.scale;
    this.moves = movesFor(hero.id);
    this.maxHp = hero.hp;
    this.ctrl = null;
    this.roundWins = 0;
    this.tmpPose = clonePose(POSES.idle);
    this.target = clonePose(POSES.idle);
    this.stats = { dmg: 0, hits: 0, maxCombo: 0, blocked: 0 };
    this.reset(side === 0 ? -3 : 3);
  }

  reset(x) {
    if (this.script && this.script.cleanup && this.game) this.script.cleanup(this, this.game);
    this.script = null;
    if (this.rig.setVoid) { this.rig.setVoid(0); this.rig.voidAmt = this.rig.voidMats ? 0.0001 : 0; }
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = this.side === 0 ? 1 : -1;
    this.hp = this.maxHp;
    this.ult = this.ult ?? 0;
    this.specialCd = 0;
    this.slowT = 0; this.rootT = 0; this.rootImmune = 0; this.frozen = false; this.faceCam = false;
    if (this.rig.setFade) this.rig.setFade(1);
    if (this.root) this.root.scale.setScalar(1);
    this.state = 'intro';
    this.stateT = 0;
    this.onGround = true;
    this.airJumps = this.hero.airJumps;
    this.crouching = false;
    this.blocking = false;
    this.move = null;
    this.hitIds = new Set();
    this.combo = 0;
    this.invuln = 0;
    this.freezeT = 0; this.freezeAmp = 0; // per-fighter hit-stop (see Match.hitstopPair)
    this.flashT = 0; this.flashColor = new THREE.Color(1, 1, 1);
    this.noPush = false;
    this.armor = false;
    this.stunT = 0;
    this.walkPhase = 0;
    this.poseName = null; this.poseRate = 16;
    this.lockedBy = null;
    this.exprOverride = null;
    this.sinceHit = 0;
    this.shieldOut = false;
    if (this.rig.shield) this.rig.shield.visible = true;
    this.resetScript();
    this.snapFacing();
    this.root.position.set(this.x, 0, 0);
  }

  resetScript() {
    this.ultT = 0; this.fired = false; this.targetX = undefined; this.hitId = null; this.locked = false; this.lockT = 0;
    this.seqIdx = 0; this.leapt = false; this.slammed = false; this.slamT = 0; this.chargeFx = false; this.beamTick = 0; this.beamHits = 0;
    this.noPush = false; this.armor = false; this.superArmor = false; this.comboPose = null;
    this.started = false; this.recede = undefined; this.erasing = false; this.returned = false; this.erasedSfx = false; this.engaged = false; this.quipped = false;
  }

  snapFacing() { this.root.rotation.y = this.facing * FACE_ANGLE; }
  setPose(name, rate = 22) { this.poseName = name; this.poseRate = rate; }
  isFree() { return FREE.has(this.state); }
  isStunned() { return STUNNED.has(this.state); }
  headPos() { const J = this.rig.J; return J.head.localToWorld(this.rig.headCenter.clone()); }
  chestPos() { return new THREE.Vector3(this.x + this.facing * 0.25 * this.scale, this.y + 1.38 * this.scale, 0.1); }

  hurtbox() {
    if (this.state === 'down' || this.state === 'getup') return null;
    const w = 0.34 * this.scale;
    let h = 1.85 * this.scale;
    if (this.crouching || (this.state === 'attack' && this.move && this.move.crouch && this.stateT < this.moveTotal() * 0.6)) h = 1.12 * this.scale;
    if (!this.onGround) h = 1.6 * this.scale;
    return { x0: this.x - w, x1: this.x + w, y0: this.y, y1: this.y + h };
  }

  canBlock() {
    return (this.state === 'idle' && this.blocking) || this.state === 'blockstun';
  }

  moveTime(m) { return this.hero.attackSpeed; }
  moveTotal() { const m = this.move, s = this.hero.attackSpeed; return (m.startup + m.active + m.recovery) * s; }

  startMove(name) {
    this.move = this.moves[name];
    this.state = 'attack';
    this.stateT = 0;
    this.hitId = newHitId();
    this.moveHit = false;
    this.flicked = false; this.lunged = false; this.lungeStop = false;
    this.crouching = !!this.move.crouch;
    this.blocking = false;
    if (this.onGround && !this.move.air) this.vx *= 0.3;
    const strength = { light: 0.7, medium: 0.9, heavy: 1.15 }[this.move.kind] || 0.8;
    this.game.audio.whoosh(Math.max(0, this.move.startup * this.hero.attackSpeed - 0.07), strength);
    if (this.move.kind !== 'light' && Math.random() < 0.6) this.game.audio.grunt(this.hero, 'effort', 0.7);
  }

  startSpecial() {
    const sp = SPECIALS[this.hero.special.id];
    if (!sp || this.specialCd > 0 || (sp.canStart && !sp.canStart(this))) return false;
    this.resetScript();
    this.state = 'special'; this.stateT = 0;
    this.script = sp;
    this.specialCd = this.hero.special.cd;
    this.game.audio.grunt(this.hero, 'effort', 0.8);
    this.crouching = false; this.blocking = false;
    this.vx = 0;
    return true;
  }

  startUltimate() {
    const u = ULTIMATES[this.hero.ultimate.id];
    if (!u || this.ult < 100) return false;
    const opp = this.game.opponentOf(this);
    if (opp.state === 'ko') return false;
    this.ult = 0;
    this.resetScript();
    this.state = 'ultimate'; this.stateT = 0;
    this.script = u;
    this.crouching = false; this.blocking = false;
    this.vx = 0;
    this.game.ultCinematic(this);
    return true;
  }

  lockBy(att) {
    this.state = 'locked'; this.stateT = 0; this.lockedBy = att;
    this.vx = 0; this.vy = 0; this.crouching = false; this.blocking = false;
    this.move = null;
  }

  enterBlockstun(t, push) {
    this.state = 'blockstun'; this.stateT = 0; this.stunT = t; this.vx = push;
    this.flash(0x7fc8ff, 0.12);
  }

  flash(color, t) { this.flashColor.set(color); this.flashT = t; this.flashMax = t; }

  // apply a successful hit's reaction (damage already applied by the game)
  takeHit(hit, dir) {
    const opp = this.game.opponentOf(this);
    this.sinceHit = 0;
    this.hitCount = (this.hitCount || 0) + 1;
    this.sweat = Math.min(1, (this.sweat || 0) + 0.025 + (hit.dmg || 0) * 0.004);
    const kick = new THREE.Vector3(dir * (2 + (hit.push || 0) * 0.6), 1.5 + (hit.launch ? 3 : 0), (Math.random() - 0.5) * 2);
    for (const c of this.rig.cloths) c.impulse(kick);
    if (!hit.noFlash) this.flash(0xffffff, 0.1);
    // head and torso snap along the blow: away from the attacker, at the height it landed
    const front = Math.sign(opp.x - this.x) === this.facing ? 1 : -1;
    this.recoil = { t: 0, front, h: hit.height || 'mid', amp: Math.min(1, 0.45 + (hit.dmg || 0) * 0.05), twist: Math.random() < 0.5 ? -1 : 1 };
    if (this.hp <= 0) {
      this.state = 'ko'; this.stateT = 0;
      this.vy = Math.max(9, hit.launch || 0); this.vx = dir * 7.5; this.onGround = false; this.crouching = false;
      return;
    }
    if (this.state === 'locked' && hit.keepLock) { this.stateT = 0; return; }
    // status effects: roots/webs pin the feet (with immunity afterwards so they can't chain), slows linger
    if (hit.slow) { this.slowT = Math.max(this.slowT, Math.min(hit.slow, 2)); this.slowColor = hit.color ?? 0xffffff; }
    if (hit.root && this.rootImmune <= 0) { this.rootT = Math.min(hit.root, 1.2); this.rootImmune = this.rootT + 2; }
    if (this.armor && hit.kind === 'light' && this.onGround) return; // super armor
    if (this.superArmor && hit.kind !== 'ult') return; // unstoppable (takes the damage, never flinches)
    const airborne = !this.onGround;
    this.crouching = false; this.blocking = false; this.move = null;
    this.script && this.script.cleanup && this.script.cleanup(this, this.game);
    this.script = null;
    this.lockedBy = null;
    if (hit.pull) {
      this.state = 'hit'; this.stateT = 0; this.stunT = hit.stun;
      const target = opp.x + opp.facing * 1.0 * opp.scale;
      this.pulled = 0.18; this.vx = (target - this.x) / this.pulled;
      return;
    }
    if (hit.launch) {
      this.state = 'hit'; this.stateT = 0; this.stunT = 99;
      this.vy = hit.launch / Math.sqrt(this.hero.weight); this.vx = dir * 2.2; this.onGround = false;
    } else if (hit.knockdown) {
      this.state = 'hit'; this.stateT = 0; this.stunT = 99;
      this.vy = 6.5; this.vx = dir * (hit.push || 4) * 0.9 / this.hero.weight; this.onGround = false;
    } else if (airborne) {
      this.state = 'hit'; this.stateT = 0; this.stunT = 99;
      this.vy = Math.max(this.vy, 5.5); this.vx = dir * 2.6;
    } else {
      this.state = 'hit'; this.stateT = 0; this.stunT = hit.stun;
      this.vx = dir * (hit.push || 1.5) / this.hero.weight;
      this.hitLow = hit.height === 'low';
    }
  }

  // while frozen by hit-stop the simulation is skipped; the struck fighter just vibrates in place
  freezeVisual() {
    const a = this.freezeAmp;
    this.root.position.set(this.x + (a ? (Math.random() - 0.5) * a * 2 : 0), this.y + (a ? (Math.random() - 0.5) * a : 0), 0);
  }

  // ---------------------------------------------------------------
  update(dt, opp) {
    const g = this.game;
    const c = this.ctrl;
    this.stateT += dt;
    if (this.specialCd > 0 && !(this.state === 'special')) this.specialCd = Math.max(0, this.specialCd - dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.slowT > 0) { this.slowT -= dt; if (Math.random() < dt * 14) g.fx.emit(new THREE.Vector3(this.x + (Math.random() - 0.5) * 0.4, this.y + Math.random() * 1.6 * this.scale, 0.2), { count: 1, color: this.slowColor ?? 0xffffff, speed: 0.4, life: 0.4, size: 0.14 }); }
    if (this.rootT > 0) this.rootT -= dt;
    if (this.rootImmune > 0) this.rootImmune -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    this.poseName = null;
    this.reachWant = 1;
    this.sinceHit = (this.sinceHit || 0) + dt;
    if (g.phase === 'fight') { this.sweat = Math.min(1, (this.sweat || 0) + dt * 0.006); if ((this._sweatT = (this._sweatT || 0) + dt) > 0.25) { this._sweatT = 0; setSweat(this.rig, this.sweat); } }
    if (this.hero.regen && this.sinceHit > 3 && this.hp > 0 && this.hp < this.maxHp * 0.5 && g.phase === 'fight') this.hp = Math.min(this.maxHp * 0.5, this.hp + 1.5 * dt);

    const free = this.isFree();
    if (free && this.onGround && this.state !== 'ko') {
      const want = opp.x >= this.x ? 1 : -1;
      if (want !== this.facing && Math.abs(opp.x - this.x) > 0.05) this.facing = want;
    }

    switch (this.state) {
      case 'intro':
      case 'wait':
        this.vx = 0;
        break;

      case 'idle': {
        this.crouching = c.held('down');
        this.blocking = c.held('block');
        if (c.take('ult') && this.startUltimate()) break;
        if (c.take('special') && this.startSpecial()) break;
        if (c.take('light')) { this.startMove(this.crouching ? 'sweep' : 'jab'); break; }
        if (c.take('heavy')) { this.startMove(this.crouching ? 'upper' : 'heavy'); break; }
        if (!this.crouching && !this.blocking && this.rootT <= 0 && c.take('up')) { this.jump(c); break; }
        let dir = (c.held('right') ? 1 : 0) - (c.held('left') ? 1 : 0);
        if (this.crouching || this.blocking || this.rootT > 0) dir = 0;
        if (dir) {
          const back = dir !== this.facing;
          const target = dir * this.hero.speed * (back ? 0.78 : 1) * (this.slowT > 0 ? 0.5 : 1);
          this.vx += (target - this.vx) * Math.min(1, dt * 18);
          // stride matched to ground speed so planted feet don't skate: a half cycle (one step)
          // covers the distance the foot sweeps, 2 · leg · sin(swing)
          this.walkPhase += dt * Math.PI * Math.abs(this.vx) / (STRIDE * this.scale) * (back ? -1 : 1);
        } else {
          this.vx *= Math.max(0, 1 - dt * 16);
        }
        break;
      }

      case 'air':
        if (c.take('light')) { this.startMove('airLight'); break; }
        if (c.take('heavy')) { this.startMove('airHeavy'); break; }
        if (this.airJumps > 0 && c.take('up')) { this.airJumps--; this.vy = this.hero.jump * 0.85; const d = (c.held('right') ? 1 : 0) - (c.held('left') ? 1 : 0); if (d) this.vx = d * this.hero.speed; g.audio.play('jump'); g.fx.ring(new THREE.Vector3(this.x, this.y + 0.2, 0), 0xffffff, 0.8, 0.25, 'ground'); }
        {
          const d = (c.held('right') ? 1 : 0) - (c.held('left') ? 1 : 0);
          if (d) this.vx += d * dt * 6;
          this.vx = THREE.MathUtils.clamp(this.vx, -this.hero.speed * 1.05, this.hero.speed * 1.05);
        }
        break;

      case 'attack': {
        const m = this.move, s = this.hero.attackSpeed;
        const st = m.startup * s, act = m.active * s, tot = this.moveTotal();
        if (m.webFlick && !this.flicked && this.stateT >= st) {
          // web-assisted jab: a short strand snaps from the wrist
          this.flicked = true;
          const hand = this.rig.anchors && this.rig.anchors.cast2;
          const a = hand ? hand.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(this.x + this.facing * 0.5, this.y + 1.4 * this.scale, 0.2);
          const b = a.clone().add(new THREE.Vector3(this.facing * 0.9 * this.scale, 0.05, 0));
          const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 4), new THREE.MeshBasicMaterial({ color: 0xf4f4f4, transparent: true }));
          strand.position.copy(a).lerp(b, 0.5); strand.rotation.z = Math.PI / 2; strand.scale.y = a.distanceTo(b);
          g.fx.timed(strand, 0.14, (o, k) => { o.material.opacity = 1 - k; });
        }
        if (this.stateT >= st && this.stateT <= st + act && !this.moveHit) {
          const sc = this.scale, f = this.facing;
          // reach scales with the attacker, but strike height is aimed at the foe: a giant's
          // jab is at head height for whoever it's thrown at, not over a smaller fighter's head
          const ys = Math.min(sc, opp ? opp.scale : sc);
          const xa = this.x + f * m.x0 * sc, xb = this.x + f * m.x1 * sc;
          const box = { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: this.y + m.y0 * ys, y1: this.y + m.y1 * ys };
          const r = g.zoneHit(this, box, Object.assign({}, m, { id: this.hitId, srcX: this.x }));
          if (r) { this.moveHit = r; this.connectT = 0; }
        }
        if (m.armor && this.stateT < st + act) this.armor = true; else this.armor = false;
        // driving moves: weight rocks back in the wind-up, then the body carries forward through the strike
        if (m.lunge && this.onGround) {
          if (this.stateT < st * 0.4) this.vx = -this.facing * m.lunge * 0.12;
          else if (this.stateT < st + act && !this.moveHit) {
            if (!this.lunged) { this.lunged = true; g.fx.dust(new THREE.Vector3(this.x - this.facing * 0.3, 0.05, 0), 8); }
            this.vx = this.facing * m.lunge;
          } else if (this.moveHit === 'hit' && !this.lungeStop) { this.lungeStop = true; this.vx *= 0.15; }
        }
        // chain cancels on hit / block
        if (this.moveHit && this.stateT > st) {
          if (m.next && c.take('light')) { this.startMove(m.next); break; }
          if (c.peek('special') && this.hero.special && this.specialCd <= 0 && this.onGround) { c.take('special'); if (this.startSpecial()) break; }
          if (c.peek('ult') && this.ult >= 100 && this.onGround) { c.take('ult'); if (this.startUltimate()) break; }
          if (!m.air && c.take('heavy') && m.kind === 'light') { this.startMove(this.crouching ? 'upper' : 'heavy'); break; }
        }
        if (this.onGround && !m.air && !(m.lunge && this.stateT < st + act)) this.vx *= Math.max(0, 1 - dt * 10);
        if (this.stateT >= tot) {
          this.move = null; this.armor = false;
          this.state = this.onGround ? 'idle' : 'air';
        }
        break;
      }

      case 'special':
      case 'ultimate': {
        this.ultT += dt;
        const running = this.script && this.script.update(this, g, this.ultT, dt);
        if (!running) {
          this.script = null; this.noPush = false; this.armor = false; this.locked = false;
          this.state = this.onGround ? 'idle' : 'air';
        }
        if (this.onGround && this.state === 'special' && !this.noPush) this.vx *= Math.max(0, 1 - dt * 8);
        break;
      }

      case 'blockstun':
        this.vx *= Math.max(0, 1 - dt * 10);
        this.blocking = true;
        if (this.stateT >= this.stunT) this.state = 'idle';
        break;

      case 'hit':
        if (this.pulled > 0) { this.pulled -= dt; if (this.pulled <= 0) this.vx = 0; }
        else if (this.onGround) this.vx *= Math.max(0, 1 - dt * 9);
        if (this.onGround && this.stateT >= this.stunT) { this.state = 'idle'; this.hitLow = false; }
        break;

      case 'locked':
        this.vx = 0; this.vy = 0;
        if (!this.lockedBy || (this.lockedBy.state !== 'ultimate') || this.stateT > 3) {
          this.state = 'hit'; this.stunT = 0.3; this.stateT = 0; this.lockedBy = null;
        }
        break;

      case 'down':
        this.vx *= Math.max(0, 1 - dt * 8);
        if (this.stateT > 0.75) { this.state = 'getup'; this.stateT = 0; }
        break;

      case 'getup':
        if (this.stateT > 0.38) { this.state = 'idle'; this.invuln = 0.3; }
        break;

      case 'ko':
      case 'victory':
        if (this.onGround) this.vx *= Math.max(0, 1 - dt * 6);
        break;
    }

    // physics
    if (this.state !== 'locked') {
      // nothing unheld floats: above the floor means airborne, so gravity always brings it down;
      // speeds are capped so no blow can fling a fighter out of the arena
      if (this.y > 0.001 && this.onGround) this.onGround = false;
      if (this.state === 'hit' || this.state === 'ko') { this.vx = THREE.MathUtils.clamp(this.vx, -MAX_VX, MAX_VX); this.vy = Math.min(this.vy, MAX_VY); }
      if (!this.onGround) {
        const fallMul = (this.hero.id === 'ironman' && this.vy < 0 && this.state === 'air' && this.ctrl.held('up')) ? 0.35 : 1;
        this.vy -= GRAVITY * dt * fallMul;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    if (this.y <= 0) {
      this.y = 0;
      if (!this.onGround) this.land();
    }
    // arena walls (and a ceiling): a fighter knocked into a wall bounces off it with a thud
    const b = g.bounds;
    if (Math.abs(this.x) > b) {
      const side = Math.sign(this.x);
      this.x = side * b;
      if (this.state === 'hit' || this.state === 'ko' || this.state === 'blockstun') {
        if (side * this.vx > 6 && !this.onGround) { this.vx = -this.vx * 0.3; g.shake(0.3); g.fx.dust(new THREE.Vector3(this.x, this.y + 1, 0), 10); g.audio.play('land', 1.1); }
        else this.vx = side > 0 ? Math.min(0, this.vx) : Math.max(0, this.vx);
      }
    }
    if (this.y > CEILING) { this.y = CEILING; this.vy = Math.min(0, this.vy); }

    this.animate(dt);
  }

  jump(c) {
    const d = (c.held('right') ? 1 : 0) - (c.held('left') ? 1 : 0);
    const slow = this.slowT > 0 ? 0.8 : 1;
    this.vy = this.hero.jump * slow;
    this.vx = d * this.hero.speed * 1.05 * slow;
    this.onGround = false;
    this.state = 'air'; this.stateT = 0;
    this.crouching = false; this.blocking = false;
    this.game.audio.play('jump');
    this.game.fx.dust(new THREE.Vector3(this.x, 0.1, 0), 6);
  }

  land() {
    this.onGround = true;
    this.vy = 0;
    this.airJumps = this.hero.airJumps;
    const g = this.game;
    if (this.state === 'air') { this.state = 'idle'; this.vx *= 0.3; g.audio.play('land', 0.6); g.fx.dust(new THREE.Vector3(this.x, 0.05, 0), 5); }
    else if (this.state === 'attack' && this.move && this.move.air) { this.state = 'idle'; this.move = null; this.vx *= 0.2; g.audio.play('land', 0.6); }
    else if (this.state === 'hit' && this.stunT > 50) {
      this.state = 'down'; this.stateT = 0; this.vx *= 0.4;
      g.audio.play('land', 1.2); g.fx.dust(new THREE.Vector3(this.x, 0.05, 0), 18); g.shake(0.25);
    } else if (this.state === 'ko') {
      this.vx *= 0.4; g.audio.play('land', 1.3); g.fx.dust(new THREE.Vector3(this.x, 0.05, 0), 24); g.fx.ring(new THREE.Vector3(this.x, 0.05, 0), 0xffffff, 2.4, 0.4, 'ground'); g.shake(0.4);
    } else if (this.state === 'hit') { this.vx *= 0.5; }
  }

  // animation clip key for GLB/Mixamo models (procedural rigs use poses)
  animKey() {
    switch (this.state) {
      case 'intro': return [this.game.phase === 'intro' ? 'taunt' : 'idle', {}];
      case 'idle':
        if (this.blocking) return ['block', {}];
        if (this.crouching) return ['crouch', {}];
        if (Math.abs(this.vx) > 0.4) return [Math.sign(this.vx) === this.facing ? 'walk' : 'walkBack', {}];
        return ['idle', {}];
      case 'air': return ['jump', {}];
      case 'attack': {
        const map = { jab: 'punch', cross: 'punch2', kick: 'kick', heavy: 'heavy', sweep: 'sweep', upper: 'uppercut', airLight: 'airKick', airHeavy: 'airKick' };
        return [map[this.move.name] || 'punch', { duration: this.moveTotal(), token: this.hitId }];
      }
      case 'special': return ['special', { duration: 0.6, token: 'sp' + this.specialCd.toFixed(2) }];
      // ultimates play their own scripted poses; only full clip sets (no retargeting) borrow 'special'
      case 'ultimate': return [this.rig.hasAnims ? 'special' : 'ultimate', { duration: 0.9 }];
      case 'blockstun': return ['block', {}];
      case 'hit': return [(!this.onGround || this.stunT > 50) ? 'knockdown' : 'hit', { token: (this.stunT > 50 ? 'kd' : 'h') + this.hitCount }];
      case 'locked': return ['hit', {}];
      case 'down': return ['down', {}];
      case 'getup': return ['getup', { duration: 0.4 }];
      case 'ko': return ['ko', {}];
      case 'victory': return ['victory', {}];
      default: return ['idle', {}];
    }
  }

  expression() {
    const t = this.stateT;
    const calm = this.hero.id === 'doom' ? 'grit' : 'focus';
    switch (this.state) {
      case 'idle': return this.blocking ? 'effort' : calm;
      case 'air': return 'grit';
      case 'attack': return t < this.move.startup * this.hero.attackSpeed ? 'grit' : 'shout';
      case 'special': case 'ultimate': return 'shout';
      case 'blockstun': return 'effort';
      case 'hit': case 'locked': return 'pain';
      case 'down': return 'daze';
      case 'getup': return 'grit';
      case 'ko': return 'ko';
      case 'victory': return (t % 3 < 1.6) ? 'smile' : 'laugh';
      default: return calm;
    }
  }

  // ---------------------------------------------------------------
  // additive body mechanics on top of the chosen pose: breathing and micro-motion, the
  // anticipation / drive / follow-through of strikes, recoil on connect, and hit recoil
  layer(base, dt) {
    const p = lerpPose(base, base, 0, this.layerPose || (this.layerPose = clonePose(base)));
    const st = this.state;
    // breathing: faster and deeper as the fight wears on (sweat tracks fatigue)
    const tired = Math.min(1, this.sweat || 0);
    this.breathT = (this.breathT || 0) + dt * (1 + tired * 0.8);
    if (this.onGround && (st === 'idle' || st === 'blockstun' || st === 'intro' || st === 'wait' || st === 'victory')) {
      const T = this.breathT, ph = this.side * 1.7;
      const b = Math.sin(T * 2.1 + ph) * (1 + tired * 0.6);
      const drift = Math.sin(T * 0.71 + ph) * Math.sin(T * 0.43 + 2); // slow, irregular weight shifts
      addTo(p, 'chest', -b * 0.03); addTo(p, 'spine', b * 0.008, drift * 0.04, 0);
      addTo(p, 'lSh', -b * 0.03, 0, b * 0.025 + drift * 0.03); addTo(p, 'rSh', -b * 0.03, 0, -b * 0.025 + drift * 0.02);
      addTo(p, 'lEl', Math.sin(T * 1.3 + ph) * 0.04); addTo(p, 'rEl', Math.sin(T * 1.1 + ph + 1) * 0.04);
      addTo(p, 'head', b * 0.015, drift * 0.04, 0);
      addTo(p, 'hips', 0, 0, drift * 0.02);
      p.hipY += b * 0.005;
    }
    // strikes: sink and coil in the wind-up, drive up from the floor through the hips on the
    // strike, then carry through; a short kick back through the body when the blow connects
    const m = st === 'attack' && this.move;
    if (m && this.onGround && !m.air) {
      const s = this.hero.attackSpeed, sT = m.startup * s, aT = m.active * s, t = this.stateT;
      const amp = m.kind === 'light' ? 0.55 : 1;
      if (t < sT) {
        const k = Math.sin(Math.min(1, t / sT) * Math.PI / 2) * amp;
        p.hipY -= 0.035 * k; addTo(p, 'lKnee', 0.16 * k); addTo(p, 'rKnee', 0.16 * k); addTo(p, 'spine', -0.06 * k); addTo(p, 'chest', -0.05 * k);
      } else {
        const span = aT + m.recovery * s * 0.6, u = Math.min(1, (t - sT) / span), k = (1 - u) * (1 - u) * amp;
        p.hipY -= 0.02 * k; addTo(p, 'spine', 0.12 * k); addTo(p, 'chest', 0.06 * k); addTo(p, 'rHip', 0.14 * k); addTo(p, 'lKnee', 0.14 * k); addTo(p, 'rKnee', -0.08 * k);
      }
    }
    if (this.connectT !== undefined) {
      this.connectT += dt;
      const k = Math.exp(-14 * this.connectT);
      if (st === 'attack' && k > 0.02) { addTo(p, 'spine', -0.08 * k); addTo(p, 'chest', -0.07 * k); addTo(p, 'head', -0.06 * k); }
    }
    // hit recoil: a damped snap along the blow (high hits whip the head, body blows fold the
    // trunk, low hits buckle the knees); much smaller through a block
    const R = this.recoil;
    if (R) {
      R.t += dt;
      const react = st === 'hit' || st === 'locked' || st === 'blockstun';
      const k = Math.exp(-9 * R.t) * R.amp * (st === 'blockstun' ? 0.35 : 1);
      if (!react || k < 0.01) this.recoil = null;
      else {
        const f = R.front, w = Math.sin(Math.min(1, R.t * 30) * Math.PI / 2); // reaches full snap in ~2 frames
        const q = k * w;
        if (R.h === 'high' || R.h === 'overhead') { addTo(p, 'head', -0.6 * q * f, 0.3 * q * R.twist, 0.15 * q * R.twist); addTo(p, 'chest', -0.22 * q * f); addTo(p, 'spine', -0.1 * q * f); }
        else if (R.h === 'low') { addTo(p, 'spine', 0.3 * q); addTo(p, 'head', 0.2 * q); addTo(p, 'lKnee', 0.35 * q); addTo(p, 'rKnee', 0.35 * q); p.hipY -= 0.05 * q; }
        else { addTo(p, 'spine', -0.3 * q * f); addTo(p, 'chest', -0.25 * q * f, 0.15 * q * R.twist, 0); addTo(p, 'head', 0.3 * q * f); }
      }
    }
    return p;
  }

  // gaze: head, neck and upper chest track the opponent through neutral, walking, blocking and
  // attacks, and the camera in the intro and on a win; let go while reeling
  gaze(dt) {
    const g = this.game, opp = g.opponentOf(this);
    let want = 0, cam = false;
    if (g.phase === 'intro' || this.state === 'victory' || this.faceCam) { want = 0.9; cam = true; }
    else if (LOOK_AT_FOE.has(this.state) && opp) want = 1;
    else if (this.state === 'ultimate' && opp) want = 0.5;
    this.lookW = (this.lookW ?? 0) + (want - (this.lookW ?? 0)) * Math.min(1, dt * 6);
    if (this.lookW < 0.01) return;
    const goal = cam ? g.camera.position : opp ? opp.headPos() : null;
    if (!goal) return;
    this.lookPt = this.lookPt || goal.clone();
    this.lookPt.lerp(goal, Math.min(1, dt * 8));
    this.rig.lookAt(this.lookPt, this.lookW);
  }

  // pose selection
  animate(dt) {
    const P = POSES;
    let rate = 16;
    let pose;
    const t = this.stateT;
    switch (this.state) {
      case 'intro': pose = this.game.phase === 'intro' ? P.taunt : P.idle; rate = 8; break;
      case 'wait': pose = P.idle; break;
      case 'idle':
        if (this.blocking) pose = this.crouching ? P.crouchBlock : P.block;
        else if (this.crouching) pose = P.crouch;
        else if (Math.abs(this.vx) > 0.4) {
          pose = lerpPose(P.idle, P.idle, 0, this.tmpPose);
          const s = Math.sin(this.walkPhase), cc = Math.cos(this.walkPhase);
          const heavy = Math.min(1, Math.max(0, (this.hero.weight || 1) - 1)); // big bodies roll more
          // legs leave the staggered fight stance for a symmetric gait around a slightly
          // forward-set, soft-kneed base, so both legs step alike
          pose.lHip[0] = -0.1 + s * WALK_SWING; pose.rHip[0] = -0.1 - s * WALK_SWING; pose.lHip[2] = 0.1; pose.rHip[2] = -0.1;
          // swing leg folds at the knee; the stance leg keeps a soft knee to take the weight
          // (a hip angle that is falling is the leg travelling forward: that one lifts)
          pose.lKnee[0] = Math.max(0, -cc) * 0.65 + 0.12; pose.rKnee[0] = Math.max(0, cc) * 0.65 + 0.12;
          // heel strike (toes up) on the leading foot, toe-off (heel up) on the trailing one
          pose.lFt = -s * 0.32 + Math.max(0, -cc) * 0.25; pose.rFt = s * 0.32 + Math.max(0, cc) * 0.25;
          // weight transfer: hips drop as each heel lands and rise passing over the stance leg,
          // the pelvis turns with the leading leg and dips toward the swing side, shoulders counter
          const land = 1 - Math.abs(cc);
          pose.hipY = -0.012 - land * (0.035 + 0.02 * heavy);
          addTo(pose, 'hips', land * 0.03, s * (0.12 + 0.06 * heavy), cc * (0.05 + 0.04 * heavy));
          addTo(pose, 'spine', 0.02 * land, -s * (0.09 + 0.05 * heavy), -cc * 0.03);
          addTo(pose, 'lSh', s * 0.12); addTo(pose, 'rSh', -s * 0.12);
          rate = 40; // track the cycle tightly: a lagging blend shortens the step and the feet skate
        } else {
          pose = P.idle; // breathing and micro-motion come from layer()
        }
        break;
      case 'air': pose = this.vy > 2 ? P.jump : P.fall; rate = 12; break;
      case 'attack': {
        const m = this.move, s = this.hero.attackSpeed;
        const st = m.startup * s, act = m.active * s;
        if (t < st) { pose = P[m.pose[0]]; rate = 26; }
        else if (t < st + act + m.recovery * s * 0.4) { pose = P[m.pose[1]]; rate = 45; }
        else { pose = this.onGround ? (m.crouch ? P.crouch : P.idle) : P.fall; rate = 12; }
        break;
      }
      case 'special': case 'ultimate':
        pose = P[this.poseName] || P.idle; rate = this.poseRate; break;
      case 'blockstun': pose = this.crouching ? P.crouchBlock : P.block; rate = 30; break;
      case 'hit':
        if (!this.onGround || this.stunT > 50) pose = P.airHit;
        else pose = this.hitLow ? P.hitLow : P.hit;
        rate = 30; break;
      case 'locked': pose = this.frozen ? P.hit : (Math.floor(t * 8) % 2) ? P.hit : P.airHit; rate = this.frozen ? 3 : 25; break;
      case 'down': pose = P.down; rate = 14; break;
      case 'getup': pose = P.getup; rate = 12; break;
      case 'ko': pose = this.onGround ? P.down : P.airHit; rate = 10; break;
      case 'victory': pose = (t % 3 < 1.6) ? P.victory : P.taunt; rate = 6; break;
      default: pose = P.idle;
    }
    pose = this.layer(pose, dt);
    if (this.rig.isModel) { const [key, opts] = this.animKey(); this.rig.setAnim(key, opts); }
    this.rig.update(pose, dt, rate);
    if (this.rig.setReach) {
      // extending limbs: moves with `stretch` reach out during their strike, scripts set reachWant
      const m = this.state === 'attack' && this.move;
      if (m && m.stretch) { const s = this.hero.attackSpeed, st = m.startup * s; if (this.stateT > st * 0.5 && this.stateT < st + m.active * s + m.recovery * s * 0.4) this.reachWant = m.stretch; }
      this.rig.setReach(this.reachWant, dt);
    }

    this.root.position.set(this.x, this.y, 0);
    if (this.state !== 'locked' && (this.root.rotation.z || this.root.rotation.x)) { this.root.rotation.z = 0; this.root.rotation.x = 0; this.root.rotation.order = 'XYZ'; }
    const targetRot = this.faceCam ? 0 : this.facing * FACE_ANGLE;
    if (this.state === 'hit' || this.state === 'down' || this.state === 'ko' || this.state === 'locked') {
      // keep current orientation while reeling
    } else {
      let d = targetRot - this.root.rotation.y;
      this.root.rotation.y += d * Math.min(1, dt * 18);
    }
    this.gaze(dt);
    // facial expression and eye look
    if (this.rig.face) {
      this.rig.setExpression(this.exprOverride || this.expression());
      const c = this.rig.cur;
      const yaw = c.head[1] + c.chest[1] + c.spine[1];
      this.rig.face.look = THREE.MathUtils.clamp(0.38 * this.facing - yaw, -0.45, 0.45);
    }
    this.rig.lateUpdate(dt);
    if (this.flashT > 0) this.rig.flash(this.flashColor, Math.max(0, this.flashT / (this.flashMax || 0.1)) * 0.9);
    else if (this.invuln > 0) this.rig.flash(this.flashColor.set(0xffffff), (Math.sin(performance.now() * 0.05) * 0.5 + 0.5) * 0.25);
    else this.rig.flash(this.flashColor, 0);
  }
}

export { GRAVITY };
