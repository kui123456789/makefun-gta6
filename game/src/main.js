// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between screens: title, how to play, missions, play, paused,
// mission brief, wasted, busted and story complete.
//
// ?seed=N fixes the city and the traffic. ?shot=cover|chase|mission|start (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createGame, stepGame, beginPendingMission, applySave, EVENT_WASTED, EVENT_BUSTED } from './world.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER } from './input.js';
import { createRenderer, SCREEN_TITLE, SCREEN_HOWTO, SCREEN_MISSIONS, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BRIEF, SCREEN_WASTED, SCREEN_BUSTED, SCREEN_COMPLETE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { missionList } from './missions.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();
let state = createGame(seed);
state.audio = audio;

function runShot(name) {
  const scene = stageShot(name, state);
  const ui = { menuIndex: 0, menuItems: titleItems(), brief: null };
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function titleItems() {
  const items = [{ id: 'new', label: 'New Game' }];
  if (hasSave()) items.push({ id: 'continue', label: 'Continue' });
  items.push({ id: 'howto', label: 'How to Play' });
  items.push({ id: 'missions', label: 'Jobs' });
  return items;
}

function pauseItems() {
  return [
    { id: 'resume', label: 'Resume' },
    { id: 'restart', label: 'Restart Current Job' },
    { id: 'howto', label: 'How to Play' },
    { id: 'quit', label: 'Save & Quit to Title' },
  ];
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let menuIndex = 0;
  let menuItems = titleItems();
  let briefDef = null;
  let accumulator = 0;
  let last = performance.now();
  let prevMoveY = 0;
  let completedCount = state.missions.completed.length;
  let completeShown = false;
  let saveTimer = 0;
  let returnTo = SCREEN_TITLE;

  // For the test hook and the screen reader: what the game is doing right now.
  window.__game = {
    state,
    screen: () => screen,
    menuIndex: () => menuIndex,
    // Test-only: start job i at once, as if the player took it at the garage.
    debugStart: (index) => {
      state.pendingBrief = index;
      return beginPendingMission(state);
    },
  };

  function announce(message) {
    status.textContent = message;
  }

  function newGame() {
    state = createGame(Math.floor(Math.random() * 4294967296));
    state.audio = audio;
    window.__game.state = state;
    clearSave();
    completedCount = 0;
    completeShown = false;
    menuItems = titleItems();
    screen = SCREEN_PLAY;
    audio.music(true);
    announce('New game. Find Mara’s garage and take the first job.');
  }

  function continueGame() {
    const save = loadGame();
    if (!save) return;
    state = createGame(seed);
    state.audio = audio;
    applySave(state, save);
    window.__game.state = state;
    completedCount = state.missions.completed.length;
    screen = SCREEN_PLAY;
    audio.music(true);
    announce('Continued. Jobs done: ' + completedCount + ' of 5.');
  }

  function toTitle() {
    saveGame(state);
    menuItems = titleItems();
    menuIndex = 0;
    screen = SCREEN_TITLE;
    audio.music(false);
    audio.engine(0, false);
    audio.siren(false);
    announce('Solmar Bay. Press Enter to play.');
  }

  function moveMenu(delta) {
    menuIndex = (menuIndex + delta + menuItems.length) % menuItems.length;
    audio.click();
  }

  function chooseTitle() {
    const id = menuItems[menuIndex].id;
    audio.unlock();
    audio.confirm();
    if (id === 'new') newGame();
    else if (id === 'continue') continueGame();
    else if (id === 'howto') { returnTo = SCREEN_TITLE; screen = SCREEN_HOWTO; }
    else if (id === 'missions') { returnTo = SCREEN_TITLE; screen = SCREEN_MISSIONS; }
  }

  function choosePaused() {
    const id = menuItems[menuIndex].id;
    audio.confirm();
    if (id === 'resume') {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (id === 'restart') {
      if (state.missions.active) {
        state.missions.active = false;
        state.missions.banner = 'Job restarted.';
        state.missions.bannerTime = 3;
      }
      const g = state.city.places.garage;
      state.player.x = g.x;
      state.player.y = g.y + 60;
      state.player.inCar = false;
      state.playerCar = null;
      state.wanted.stars = 0;
      state.policeCars = [];
      state.cops = [];
      state.camera.x = g.x;
      state.camera.y = g.y;
      screen = SCREEN_PLAY;
    } else if (id === 'howto') {
      returnTo = SCREEN_PAUSED;
      screen = SCREEN_HOWTO;
    } else if (id === 'quit') {
      toTitle();
    }
  }

  function handleMenuKeys() {
    const move = input.move();
    if (move.y !== prevMoveY) {
      if (move.y === -1) moveMenu(-1);
      else if (move.y === 1) moveMenu(1);
      prevMoveY = move.y;
    }
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) chooseTitle();
      else if (screen === SCREEN_PAUSED) choosePaused();
      else if (screen === SCREEN_BRIEF) {
        const def = beginPendingMission(state);
        if (def) {
          audio.mission();
          announce(def.name + '. ' + def.brief);
        }
        screen = SCREEN_PLAY;
      } else if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) {
        screen = SCREEN_PLAY;
      } else if (screen === SCREEN_COMPLETE) {
        screen = SCREEN_PLAY;
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_HOWTO || screen === SCREEN_MISSIONS) {
        screen = returnTo;
        if (returnTo === SCREEN_PAUSED) {
          menuItems = pauseItems();
          menuIndex = 0;
        } else {
          menuItems = titleItems();
          menuIndex = 0;
        }
      } else if (screen === SCREEN_BRIEF) {
        state.pendingBrief = null;
        state.briefCooldown = 5;
        screen = SCREEN_PLAY;
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
      }
    }
    // Any click on the title screen also starts the game on the selected item.
    if (screen === SCREEN_TITLE && (actions & ACTION_CONFIRM)) chooseTitle();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    if (screen === SCREEN_PLAY) {
      // Peek for pause without eating the E key the world needs to steal cars.
      if (input.peekActions() & ACTION_PAUSE) {
        input.takeActions();
        menuItems = pauseItems();
        menuIndex = 0;
        screen = SCREEN_PAUSED;
        audio.music(false);
        announce('Paused.');
      } else {
        const mouse = input.mouse();
        const aimWorld = renderer.screenToWorld(state, mouse.x, mouse.y);
        while (accumulator >= STEP) {
          const events = stepGame(state, STEP, input, aimWorld);
          accumulator -= STEP;
          if (events & EVENT_WASTED) {
            screen = SCREEN_WASTED;
            audio.fail();
            announce('Wasted. The hospital patched you up.');
            break;
          }
          if (events & EVENT_BUSTED) {
            screen = SCREEN_BUSTED;
            audio.fail();
            announce('Busted. The police took you in.');
            break;
          }
        }
        // A job was taken at the garage: show its brief.
        if (state.pendingBrief !== null) {
          briefDef = missionList()[state.pendingBrief];
          screen = SCREEN_BRIEF;
        }
        // A job finished: save, and celebrate the story's end once.
        if (state.missions.completed.length !== completedCount) {
          completedCount = state.missions.completed.length;
          saveGame(state);
          if (completedCount >= missionList().length && !completeShown) {
            completeShown = true;
            screen = SCREEN_COMPLETE;
            audio.mission();
          }
        }
        // Autosave every 30 s of play.
        saveTimer += 1 / 60;
        if (saveTimer > 30) {
          saveTimer = 0;
          saveGame(state);
        }
        // Sound follows the drive.
        const speed01 = state.playerCar ? Math.abs(state.playerCar.speed) / 640 : 0;
        audio.engine(speed01, !!state.playerCar);
        audio.siren(state.wanted.stars >= 2);
      }
    } else if (screen === SCREEN_TITLE || screen === SCREEN_PAUSED || screen === SCREEN_BRIEF ||
        screen === SCREEN_WASTED || screen === SCREEN_BUSTED || screen === SCREEN_COMPLETE ||
        screen === SCREEN_HOWTO || screen === SCREEN_MISSIONS) {
      accumulator = 0;
      handleMenuKeys();
    }

    renderer.draw(state, screen, { menuIndex, menuItems, brief: briefDef });
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      menuItems = pauseItems();
      menuIndex = 0;
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // First gesture unlocks audio (browsers require it).
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Solmar Bay. Press Enter to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
