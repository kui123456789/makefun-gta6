// Keyboard and mouse input. Held keys give movement and driving axes; one-shot presses
// (confirm, pause, enter/exit car, interact) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice. The mouse
// position is kept in screen pixels; the renderer converts it to world aim.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_INTERACT = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE', 'KeyF']);
const INTERACT = new Set(['KeyE']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const HANDBRAKE = new Set(['Space']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function onKey(event, down) {
    const code = event.code;
    if (UP.has(code) || DOWN.has(code) || LEFT.has(code) || RIGHT.has(code) ||
        SPRINT.has(code) || HANDBRAKE.has(code)) {
      if (down) held.add(code);
      else held.delete(code);
      event.preventDefault();
      return;
    }
    if (!down || event.repeat) return;
    if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(code)) actions |= ACTION_ENTER;
    else if (INTERACT.has(code)) actions |= ACTION_INTERACT;
    else return;
    event.preventDefault();
  }

  window.addEventListener('keydown', (event) => onKey(event, true));
  window.addEventListener('keyup', (event) => onKey(event, false));
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });

  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    if (event.button === 0) actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  // Keep the page from scrolling or selecting while the game is played.
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Steering axis: -1 left, 1 right. */
    steer() {
      return (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
    },
    /** Forward axis: -1 back, 1 forward. */
    throttle() {
      return (has(UP) ? 1 : 0) - (has(DOWN) ? 1 : 0);
    },
    /** Movement axis for walking: {x, y} each in -1..1, screen-relative. */
    move() {
      return {
        x: (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0),
        y: (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0),
      };
    },
    sprint() {
      return has(SPRINT);
    },
    handbrake() {
      return has(HANDBRAKE);
    },
    shooting() {
      return mouseDown;
    },
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The queued one-shot presses, without clearing them. */
    peekActions() {
      return actions;
    },
  };
}
