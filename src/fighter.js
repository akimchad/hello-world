// A fighter: state machine, physics, attacks, and pose selection.
import * as THREE from 'three';
import { POSES, lerpPose, clonePose, addTo } from './rig.js';
import { movesFor, SPECIALS, ULTIMATES, newHitId } from './moves.js';

const GRAVITY = 32;
const FACE_ANGLE = Math.PI / 2 - 0.38; // turned slightly toward the camera
const FREE = new Set(['idle', 'air']);
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
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = this.side === 0 ? 1 : -1;
    this.hp = this.maxHp;
    this.ult = this.ult ?? 0;
    this.specialCd = 0;
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
    this.noPush = false; this.armor = false;
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
    this.crouching = !!this.move.crouch;
    this.blocking = false;
    if (this.onGround && !this.move.air) this.vx *= 0.3;
    this.game.audio.play('whoosh', 0.7);
  }

  startSpecial() {
    const sp = SPECIALS[this.hero.special.id];
    if (!sp || this.specialCd > 0 || (sp.canStart && !sp.canStart(this))) return false;
    this.resetScript();
    this.state = 'special'; this.stateT = 0;
    this.script = sp;
    this.specialCd = this.hero.special.cd;
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
    this.flash(0xffffff, 0.1);
    if (this.hp <= 0) {
      this.state = 'ko'; this.stateT = 0;
      this.vy = Math.max(7, hit.launch || 0); this.vx = dir * 5; this.onGround = false; this.crouching = false;
      return;
    }
    if (this.state === 'locked' && hit.keepLock) { this.stateT = 0; return; }
    if (this.armor && hit.kind === 'light' && this.onGround) return; // super armor
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

  // ---------------------------------------------------------------
  update(dt, opp) {
    const g = this.game;
    const c = this.ctrl;
    this.stateT += dt;
    if (this.specialCd > 0 && !(this.state === 'special')) this.specialCd = Math.max(0, this.specialCd - dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    this.poseName = null;
    this.sinceHit = (this.sinceHit || 0) + dt;
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
        if (!this.crouching && !this.blocking && c.take('up')) { this.jump(c); break; }
        let dir = (c.held('right') ? 1 : 0) - (c.held('left') ? 1 : 0);
        if (this.crouching || this.blocking) dir = 0;
        if (dir) {
          const back = dir !== this.facing;
          const target = dir * this.hero.speed * (back ? 0.78 : 1);
          this.vx += (target - this.vx) * Math.min(1, dt * 18);
          this.walkPhase += dt * this.hero.speed * 2.6 * (back ? -1 : 1);
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
        if (this.stateT >= st && this.stateT <= st + act && !this.moveHit) {
          const sc = this.scale, f = this.facing;
          const xa = this.x + f * m.x0 * sc, xb = this.x + f * m.x1 * sc;
          const box = { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: this.y + m.y0 * sc, y1: this.y + m.y1 * sc };
          const r = g.zoneHit(this, box, Object.assign({}, m, { id: this.hitId, srcX: this.x }));
          if (r) this.moveHit = r;
        }
        if (m.armor && this.stateT < st + act) this.armor = true; else this.armor = false;
        // chain cancels on hit / block
        if (this.moveHit && this.stateT > st) {
          if (m.next && c.take('light')) { this.startMove(m.next); break; }
          if (c.peek('special') && this.hero.special && this.specialCd <= 0 && this.onGround) { c.take('special'); if (this.startSpecial()) break; }
          if (c.peek('ult') && this.ult >= 100 && this.onGround) { c.take('ult'); if (this.startUltimate()) break; }
          if (!m.air && c.take('heavy') && m.kind === 'light') { this.startMove(this.crouching ? 'upper' : 'heavy'); break; }
        }
        if (this.onGround && !m.air) this.vx *= Math.max(0, 1 - dt * 10);
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
    const b = g.bounds;
    if (this.x < -b) { this.x = -b; if (this.state === 'hit' || this.state === 'blockstun') this.vx = Math.max(0, this.vx); }
    if (this.x > b) { this.x = b; if (this.state === 'hit' || this.state === 'blockstun') this.vx = Math.min(0, this.vx); }

    this.animate(dt);
  }

  jump(c) {
    const d = (c.held('right') ? 1 : 0) - (c.held('left') ? 1 : 0);
    this.vy = this.hero.jump;
    this.vx = d * this.hero.speed * 1.05;
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
      this.vx *= 0.4; g.audio.play('land', 1.3); g.fx.dust(new THREE.Vector3(this.x, 0.05, 0), 24); g.shake(0.4);
    } else if (this.state === 'hit') { this.vx *= 0.5; }
  }

  expression() {
    const t = this.stateT;
    const calm = this.hero.id === 'doomsday' ? 'grit' : 'focus';
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
          addTo(pose, 'lHip', s * 0.42); addTo(pose, 'rHip', -s * 0.42);
          addTo(pose, 'lKnee', Math.max(0, cc) * 0.55); addTo(pose, 'rKnee', Math.max(0, -cc) * 0.55);
          pose.hipY = Math.abs(cc) * 0.03 - 0.02;
          rate = 20;
        } else {
          pose = lerpPose(P.idle, P.idle, 0, this.tmpPose);
          const br = Math.sin(performance.now() * 0.004 + this.side) * 0.04;
          addTo(pose, 'spine', br); addTo(pose, 'lEl', -br * 2); addTo(pose, 'rEl', br * 2);
          pose.hipY = br * 0.4;
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
      case 'locked': pose = (Math.floor(t * 8) % 2) ? P.hit : P.airHit; rate = 25; break;
      case 'down': pose = P.down; rate = 14; break;
      case 'getup': pose = P.getup; rate = 12; break;
      case 'ko': pose = this.onGround ? P.down : P.airHit; rate = 10; break;
      case 'victory': pose = (t % 3 < 1.6) ? P.victory : P.taunt; rate = 6; break;
      default: pose = P.idle;
    }
    this.rig.update(pose, dt, rate);

    this.root.position.set(this.x, this.y, 0);
    const targetRot = this.facing * FACE_ANGLE;
    if (this.state === 'hit' || this.state === 'down' || this.state === 'ko' || this.state === 'locked') {
      // keep current orientation while reeling
    } else {
      let d = targetRot - this.root.rotation.y;
      this.root.rotation.y += d * Math.min(1, dt * 18);
    }
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
