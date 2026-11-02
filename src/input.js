// Keyboard input for two players on one keyboard.
// Uses KeyboardEvent.code so bindings are physical keys (layout independent).

export const ACTIONS = ['left', 'right', 'up', 'down', 'light', 'heavy', 'special', 'block', 'ult'];
export const ACTION_LABELS = {
  left: 'Move left', right: 'Move right', up: 'Jump', down: 'Crouch',
  light: 'Light attack', heavy: 'Heavy attack', special: 'Special', block: 'Block', ult: 'Ultimate',
};

export const DEFAULT_BINDINGS = {
  p1: {
    left: ['KeyA', null], right: ['KeyD', null], up: ['KeyW', null], down: ['KeyS', null],
    light: ['KeyF', null], heavy: ['KeyG', null], special: ['KeyH', null], block: ['KeyR', null], ult: ['KeyT', null],
  },
  p2: {
    left: ['ArrowLeft', null], right: ['ArrowRight', null], up: ['ArrowUp', null], down: ['ArrowDown', null],
    light: ['Numpad1', 'KeyK'], heavy: ['Numpad2', 'KeyL'], special: ['Numpad3', 'Semicolon'],
    block: ['Numpad4', 'KeyO'], ult: ['Numpad5', 'KeyP'],
  },
};

const BUFFER = 0.16; // seconds an attack press is remembered while the fighter is busy

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const map = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Semicolon: ';', Quote: "'",
    Comma: ',', Period: '.', Slash: '/', Space: 'Space', ShiftLeft: 'L Shift', ShiftRight: 'R Shift',
    ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Enter: 'Enter',
  };
  return map[code] || code;
}

export class Keyboard {
  constructor() {
    this.down = new Set();
    this.padDown = new Set(); // keys currently held through a gamepad
    this.listeners = [];
    this.captureGameKeys = false;
    this.gameCodes = new Set();
    window.addEventListener('keydown', (e) => {
      // Let a rebind capture take the key first
      for (const fn of this.listeners) if (fn(e) === true) { e.preventDefault(); return; }
      if (this.gameCodes.has(e.code) || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.onPress && this.onPress(e.code, e);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => this.down.clear());
  }
  setBindings(bindings) {
    this.gameCodes = new Set();
    for (const p of ['p1', 'p2']) for (const a of ACTIONS) for (const c of bindings[p][a]) if (c) this.gameCodes.add(c);
  }
  isDown(code) { return this.down.has(code) || this.padDown.has(code); }
}

// PlayStation (and other "standard" layout) controllers. Pad 1 plays as player 1, pad 2 as
// player 2: buttons press that player's bound keys, so menus, character select, pause and
// fights all work with no separate gamepad code paths.
//   Square = normal hit, Triangle = stronger hit, L1/R1 = special, L2/R2 = ultimate,
//   Cross = jump (confirm in menus), Circle = block (back in menus), Options = pause,
//   D-pad / left stick = move.
export class Gamepads {
  constructor(keyboard, getBindings, inMenu) {
    this.kb = keyboard;
    this.getBindings = getBindings;
    this.inMenu = inMenu;
    this.prev = [new Set(), new Set()];
    this.connected = 0;
  }
  poll() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : [];
    this.connected = pads.length;
    const menu = this.inMenu();
    for (let i = 0; i < 2; i++) {
      const pad = pads[i], now = new Set();
      if (pad) {
        const b = this.getBindings()['p' + (i + 1)];
        const key = (a) => b[a] && (b[a][0] || b[a][1]);
        const on = (n) => !!pad.buttons[n] && (pad.buttons[n].pressed || pad.buttons[n].value > 0.5);
        const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
        if (on(14) || ax < -0.5) now.add(key('left'));
        if (on(15) || ax > 0.5) now.add(key('right'));
        if (on(12) || ay < -0.6) now.add(key('up'));
        if (on(13) || ay > 0.6) now.add(key('down'));
        if (on(2)) now.add(key('light'));
        if (on(3)) now.add(key('heavy'));
        if (on(4) || on(5)) now.add(key('special'));
        if (on(6) || on(7)) now.add(key('ult'));
        if (menu) { if (on(0)) now.add('Enter'); if (on(1)) now.add('Escape'); }
        else { if (on(0)) now.add(key('up')); if (on(1)) now.add(key('block')); }
        if (on(9)) now.add('Escape');
      }
      now.delete(null); now.delete(undefined);
      const prev = this.prev[i];
      for (const c of now) if (!prev.has(c)) { this.kb.padDown.add(c); this.kb.onPress && this.kb.onPress(c); }
      for (const c of prev) if (!now.has(c)) this.kb.padDown.delete(c);
      this.prev[i] = now;
    }
  }
}

// A human player's view of the keyboard
export class PlayerInput {
  constructor(keyboard, bindings) {
    this.kb = keyboard;
    this.bindings = bindings;
    this.buffer = {};
    this.time = 0;
  }
  held(action) {
    const keys = this.bindings[action];
    return !!keys && keys.some((k) => k && this.kb.isDown(k));
  }
  // called by the game when a key goes down
  notePress(code) {
    for (const a of ACTIONS) if (this.bindings[a].includes(code)) this.buffer[a] = this.time;
  }
  // true once if the action was pressed within the buffer window
  take(action) {
    const t = this.buffer[action];
    if (t !== undefined && this.time - t <= BUFFER) { delete this.buffer[action]; return true; }
    return false;
  }
  peek(action) {
    const t = this.buffer[action];
    return t !== undefined && this.time - t <= BUFFER;
  }
  update(dt) { this.time += dt; }
  clear() { this.buffer = {}; }
}
