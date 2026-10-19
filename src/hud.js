// In-fight HUD (DOM overlay).
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hp: [$('hp1'), $('hp2')], lag: [$('hp1-lag'), $('hp2-lag')], name: [$('hud-name1'), $('hud-name2')],
      pips: [$('pips1'), $('pips2')], sp: [$('sp1'), $('sp2')], ult: [$('ult1'), $('ult2')], ultLabel: [$('ult1-label'), $('ult2-label')],
      combo: [$('combo1'), $('combo2')], timer: $('timer'), announce: $('announce'), banner: $('ult-banner'),
    };
    this.comboT = [0, 0];
    this.announceT = 0;
    this.last = {};
  }

  setup(match) {
    match.fighters.forEach((f, i) => { this.el.name[i].textContent = f.hero.name.toUpperCase() + (f.cpu ? ' (CPU)' : ''); });
    this.pips(match);
    this.el.combo.forEach((c) => c.classList.remove('show'));
    this.el.announce.className = 'announce';
    this.el.banner.classList.remove('show');
    this.introCard(null);
    this.last = {};
  }

  pips(match) {
    match.fighters.forEach((f, i) => {
      const box = this.el.pips[i];
      box.innerHTML = '';
      for (let k = 0; k < match.roundsToWin; k++) {
        const p = document.createElement('div');
        p.className = 'pip' + (k < f.roundWins ? ' won' : '');
        box.appendChild(p);
      }
    });
  }

  update(match, dt) {
    match.fighters.forEach((f, i) => {
      const pct = Math.max(0, f.hp / f.maxHp) * 100;
      const key = pct.toFixed(1);
      if (this.last['hp' + i] !== key) {
        this.last['hp' + i] = key;
        this.el.hp[i].style.width = pct + '%';
        this.el.lag[i].style.width = pct + '%';
        this.el.hp[i].className = 'hp-fill' + (pct < 20 ? ' crit' : pct < 45 ? ' low' : '');
      }
      const cd = f.hero.special.cd;
      const sp = f.shieldOut ? 0 : (1 - f.specialCd / cd) * 100;
      this.el.sp[i].style.width = sp + '%';
      this.el.sp[i].parentElement.classList.toggle('ready', sp >= 100);
      this.el.ult[i].style.width = f.ult + '%';
      const ready = f.ult >= 100;
      this.el.ult[i].parentElement.classList.toggle('ready', ready);
      this.el.ultLabel[i].textContent = ready ? 'ULTIMATE READY!' : 'ULTIMATE';
      if (this.comboT[i] > 0) { this.comboT[i] -= dt; if (this.comboT[i] <= 0) this.el.combo[i].classList.remove('show'); }
    });
    const t = match.roundTime > 0 ? Math.ceil(match.timer) : '∞';
    if (this.last.timer !== t) { this.last.timer = t; this.el.timer.textContent = t; this.el.timer.classList.toggle('warn', match.roundTime > 0 && match.timer <= 10); }
    if (this.announceT > 0) { this.announceT -= dt; if (this.announceT <= 0) this.el.announce.className = 'announce'; }
  }

  announce(text, cls = '', dur = 1.2, sub = '') {
    const a = this.el.announce;
    a.className = 'announce';
    a.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    void a.offsetWidth; // restart animation
    a.className = 'announce show ' + cls;
    this.announceT = dur;
  }

  combo(side, n, praise) {
    const c = this.el.combo[side];
    c.innerHTML = `${n} HITS${praise ? `<small>${praise}</small>` : ''}`;
    c.classList.add('show');
    this.comboT[side] = 1.3;
  }

  introCard(hero, side) {
    const c = document.getElementById('intro-card');
    if (!hero) { c.classList.remove('show'); return; }
    document.getElementById('ic-name').textContent = hero.name.toUpperCase();
    document.getElementById('ic-title').textContent = hero.title;
    c.classList.toggle('right', side === 1);
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
  }

  ultBanner(name) {
    const b = this.el.banner;
    if (!name) { b.classList.remove('show'); return; }
    b.textContent = name.toUpperCase();
    b.classList.add('show');
  }
}
