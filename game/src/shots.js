// The screenshot scenes behind ?shot=cover|chase|mission|start. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a scripted
// input, so the frame is what a short game really looks like — and the same seed always
// gives the same frame. The audio is silenced: screenshots take no user gesture.
import { STEP } from './config.js';
import { stepGame } from './world.js';
import { startMission } from './missions.js';
import { createCar, KIND_POLICE } from './vehicles.js';
import { createCop } from './people.js';
import { fireBullet, muzzle } from './combat.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SILENT_AUDIO = {
  unlock() {}, setMuted() {}, click() {}, confirm() {}, shot() {}, enemyShot() {},
  hit() {}, explosion() {}, pickup() {}, cash() {}, mission() {}, fail() {},
  wantedUp() {}, engine() {}, siren() {}, music() {},
};

function scriptedInput(overrides = {}) {
  return {
    throttle: () => overrides.throttle ?? 0,
    steer: () => overrides.steer ?? 0,
    move: () => overrides.move ?? { x: 0, y: 0 },
    sprint: () => false,
    handbrake: () => overrides.handbrake ?? false,
    shooting: () => overrides.shooting ?? false,
    takeActions: () => 0,
    mouse: () => ({ x: 0, y: 0 }),
  };
}

function runSteps(state, input, seconds, aimWorld) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) stepGame(state, STEP, input, aimWorld);
}

/** Put the player in a car on a road, already moving. */
function putPlayerInCar(state, x, y, angle, speed, color) {
  const car = createCar('player', x, y, angle, color ?? '#f2c94c');
  car.speed = speed;
  state.playerCar = car;
  state.player.inCar = true;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  state.camera.x = x;
  state.camera.y = y;
  return car;
}

function addPoliceBehind(state, x, y, angle, count) {
  for (let i = 0; i < count; i += 1) {
    const car = createCar(KIND_POLICE, x - Math.cos(angle) * (140 + i * 130), y - Math.sin(angle) * (140 + i * 130), angle, '#e8e8e8');
    car.speed = 380 + i * 40;
    state.policeCars.push(car);
  }
}

/**
 * Set `state` to the named scene and return the screen to draw over it.
 * Names: cover (driving downtown, heat on), chase (on foot, police closing in),
 * mission (a job in progress), start (the title screen).
 */
export function stageShot(name, state) {
  state.audio = SILENT_AUDIO;
  const city = state.city;
  if (name === 'cover') {
    // Job 1 accepted; Danny is driving west through downtown toward Mara's garage,
    // two patrol cars on his tail and traffic all around.
    startMission(state.missions, 0, city, state);
    state.missions.objectiveIndex = 1; // already stole the car
    putPlayerInCar(state, 2600, 1500, Math.PI, 380, '#f2c94c');
    addPoliceBehind(state, 2600, 1500, Math.PI, 2);
    state.wanted.stars = 2;
    state.wanted.lastCrime = state.time;
    runSteps(state, scriptedInput({ throttle: 1, steer: 0 }), 1.2);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    // On foot at a downtown intersection, four stars, patrol cars and foot cops
    // closing in, one shot just fired.
    state.player.x = 1500;
    state.player.y = 1500;
    state.player.aimAngle = Math.PI / 4;
    state.camera.x = 1500;
    state.camera.y = 1500;
    state.wanted.stars = 4;
    state.wanted.lastCrime = state.time;
    addPoliceBehind(state, 1500, 1500, Math.PI / 2, 2);
    state.policeCars.push(createCar(KIND_POLICE, 1760, 1500, Math.PI, '#e8e8e8'));
    state.policeCars[2].speed = 300;
    state.cops.push(createCop(1420, 1560));
    state.cops.push(createCop(1580, 1420));
    for (const ped of state.peds) {
      if (Math.hypot(ped.x - 1500, ped.y - 1500) < 500) ped.panic = 2.5;
    }
    runSteps(state, scriptedInput({}), 0.4, { x: 1900, y: 1900 });
    // A shot mid-flight, toward the nearest cop, with its muzzle flash.
    const cop = state.cops[0];
    const ang = Math.atan2(cop.y - state.player.y, cop.x - state.player.x);
    fireBullet(state.bullets, state.player.x + Math.cos(ang) * 30, state.player.y + Math.sin(ang) * 30, ang, 34, true);
    muzzle(state.particles, state.player.x, state.player.y, ang);
    runSteps(state, scriptedInput({}), 0.12, { x: cop.x, y: cop.y });
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    // Job 2: the package run. Danny drives toward the harbor dock, waypoint live.
    startMission(state.missions, 1, city, state);
    putPlayerInCar(state, 2700, 700, 0, 380, '#4f9fd9');
    runSteps(state, scriptedInput({ throttle: 1, steer: 0 }), 1.1);
    return { screen: SCREEN_PLAY };
  }
  // Anything else is the title screen.
  return { screen: SCREEN_TITLE };
}
