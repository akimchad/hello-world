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
  isDown(code) { return this.down.has(code); }
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
