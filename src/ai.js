// A CPU opponent that drives a fighter through the same input interface as
// a human player (held/take/peek).
const LEVELS = {
  easy:   { think: [0.28, 0.5], block: 0.2, react: 0.3, combo: 0.25, aggro: 0.45, antiAir: 0.15 },
  normal: { think: [0.16, 0.32], block: 0.5, react: 0.18, combo: 0.55, aggro: 0.6, antiAir: 0.4 },
  hard:   { think: [0.08, 0.18], block: 0.8, react: 0.1, combo: 0.85, aggro: 0.72, antiAir: 0.7 },
};
const RANGED = new Set(['repulsor', 'webPull', 'lightning', 'shieldThrow', 'groundSmash', 'solarFlare', 'doomBolt']);

export class CpuInput {
  constructor(level = 'normal') {
    this.setLevel(level);
    this.time = 0;
    this.holds = new Map();
    this.buffer = {};
    this.queue = [];
    this.nextThink = 0.5;
    this.threatSeen = null;
  }
  setLevel(l) { this.L = LEVELS[l] || LEVELS.normal; }
  held(a) { const u = this.holds.get(a); return u !== undefined && u > this.time; }
  take(a) { const t = this.buffer[a]; if (t !== undefined && this.time - t < 0.2) { delete this.buffer[a]; return true; } return false; }
  peek(a) { const t = this.buffer[a]; return t !== undefined && this.time - t < 0.2; }
  notePress() {}
  clear() { this.buffer = {}; this.holds.clear(); this.queue = []; }
  press(a, delay = 0) { this.queue.push({ at: this.time + delay, a }); }
  hold(a, dur) { this.holds.set(a, this.time + dur); }
  release(a) { this.holds.delete(a); }

  update(dt, me, opp, game) {
    this.time += dt;
    for (const q of this.queue) if (q.at <= this.time) this.buffer[q.a] = this.time;
    this.queue = this.queue.filter((q) => q.at > this.time);
    if (!me || !game || game.phase !== 'fight' || game.cine) { if (game && game.phase !== 'fight') this.holds.clear(); return; }
    const L = this.L;
    const dist = Math.abs(opp.x - me.x);
    const toward = opp.x > me.x ? 'right' : 'left';
    const away = toward === 'right' ? 'left' : 'right';

    // ---- defense: react to threats ----
    const threat = this.findThreat(me, opp, game, dist);
    if (threat && threat.key !== this.threatSeen) {
      this.threatSeen = threat.key;
      this.threatDecision = Math.random() < L.block;
      this.threatAt = this.time + L.react * (0.6 + Math.random() * 0.8);
      this.threatLow = threat.low;
    }
    if (threat && this.threatDecision && this.time >= this.threatAt && me.isFree()) {
      this.release('left'); this.release('right');
      this.hold('block', 0.3);
      if (this.threatLow) this.hold('down', 0.3); else this.release('down');
      return;
    }
    if (!threat) this.threatSeen = null;

    // follow up on hits
    if (me.state === 'attack' && me.moveHit === 'hit' && Math.random() < L.combo * dt * 12) {
      if (me.move.next) this.press('light');
      else if (me.specialCd <= 0 && Math.random() < 0.5) this.press('special');
      else if (me.ult >= 100) this.press('ult');
    }

    // anti-air
    if (!opp.onGround && opp.state === 'attack' && dist < 2.4 && me.isFree() && Math.random() < L.antiAir * dt * 10) {
      this.hold('down', 0.25); this.press('heavy', 0.02);
      return;
    }

    if (this.time < this.nextThink) return;
    this.nextThink = this.time + L.think[0] + Math.random() * (L.think[1] - L.think[0]);
    if (!me.isFree()) return;
    this.release('block');
    if (!this.held('down')) this.release('down');

    const sp = me.hero.special.id;
    if (me.ult >= 100 && opp.state !== 'down' && opp.state !== 'ko' && (dist < 3.2 || ['unibeam', 'thunderstorm', 'doomWrath', 'theVoid'].includes(me.hero.ultimate.id)) && Math.random() < 0.6) {
      this.press('ult'); return;
    }
    if (opp.state === 'down' || opp.state === 'getup') {
      if (dist < 2) this.hold(away, 0.2);
      return;
    }
    const r = Math.random();
    if (dist > 4.2) {
      if (RANGED.has(sp) && me.specialCd <= 0 && r < 0.35) { this.release('left'); this.release('right'); this.press('special'); return; }
      if (r < 0.07) { this.hold(toward, 0.25); this.press('up'); return; }
      this.hold(toward, 0.35); this.release(away);
      return;
    }
    if (dist > 1.7) {
      if ((sp === 'dashSlash') && me.specialCd <= 0 && r < 0.3) { this.press('special'); return; }
      if ((sp === 'groundSmash' || sp === 'lightning' || sp === 'webPull') && me.specialCd <= 0 && r < 0.2) { this.press('special'); return; }
      if (r < 0.1 * L.aggro) { this.hold(toward, 0.3); this.press('up'); this.press(Math.random() < 0.5 ? 'light' : 'heavy', 0.32); return; }
      if (r > 0.92) { this.hold(away, 0.25); return; }
      this.hold(toward, 0.25); this.release(away);
      return;
    }
    // close range
    this.release('left'); this.release('right');
    if (r < L.aggro) {
      const pick = Math.random();
      if (pick < 0.42) { this.press('light'); if (Math.random() < L.combo) { this.press('light', 0.18); this.press('light', 0.38); } }
      else if (pick < 0.62) this.press('heavy');
      else if (pick < 0.78) { this.hold('down', 0.25); this.press('light', 0.03); }
      else if (pick < 0.9) { this.hold('down', 0.25); this.press('heavy', 0.03); }
      else if (me.specialCd <= 0) this.press('special');
    } else if (r < L.aggro + 0.15) {
      this.hold('block', 0.35);
    } else {
      this.hold(away, 0.22);
    }
  }

  findThreat(me, opp, game, dist) {
    if (opp.state === 'attack' && opp.move) {
      const m = opp.move;
      const reach = m.x1 * opp.scale + 0.7;
      if (dist < reach && opp.stateT < (m.startup + m.active) * opp.hero.attackSpeed) return { key: opp.hitId, low: m.height === 'low' };
    }
    if ((opp.state === 'special' || opp.state === 'ultimate') && dist < 7) return { key: 'sp' + opp.stateT.toFixed(0) + opp.state, low: opp.hero.special.id === 'groundSmash' && opp.state === 'special' };
    for (const p of game.projectiles) {
      if (p.owner === opp && p.alive && Math.sign(me.x - p.x) === Math.sign(p.vx) && Math.abs(me.x - p.x) < 5) return { key: p.id, low: !!p.ground };
    }
    return null;
  }
}
