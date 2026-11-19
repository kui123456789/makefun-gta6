// People: the player on foot, the pedestrians who fill the sidewalks, and the foot
// police who chase and arrest. Pedestrians walk the sidewalks and run from gunfire;
// foot cops run the player down and hold him to bust him when the heat is on.
import { PEDS, PLAYER, WANTED } from './config.js';
import { chance, int, pick, range } from './random.js';

const PED_COLORS = ['#e8b04b', '#7fb069', '#d97fb0', '#6fb5d9', '#c96f4a', '#9a8fd9', '#e8e8e8', '#5ab58a'];
const PED_NAMES = ['tourist', 'jogger', 'shopper', 'fisherman', 'student', 'worker', 'surfer', 'vendor'];

/** A pedestrian ambling along a sidewalk. */
export function createPed(rng, city, near) {
  const p = city.randomRoadPoint();
  const ped = {
    kind: 'ped',
    x: p.x + range(rng, -70, 70),
    y: p.y + range(rng, -70, 70),
    angle: range(rng, 0, Math.PI * 2),
    speed: range(rng, 45, 85),
    color: pick(rng, PED_COLORS),
    name: pick(rng, PED_NAMES),
    state: 'walk',
    panic: 0,
    targetX: p.x,
    targetY: p.y,
    wait: range(rng, 0, 3),
    dead: false,
    hitFlash: 0,
  };
  if (near) {
    ped.x = near.x + range(rng, -450, 450);
    ped.y = near.y + range(rng, -350, 350);
  }
  const fixed = city.collideCircle(ped.x, ped.y, PLAYER.radius);
  ped.x = fixed.x;
  ped.y = fixed.y;
  return ped;
}

/** A foot cop: same shape as a pedestrian, but it hunts. */
export function createCop(x, y) {
  return {
    kind: 'cop',
    x, y,
    angle: 0,
    speed: 265,
    color: '#2f6fd0',
    state: 'chase',
    holdTime: 0,
    dead: false,
    hitFlash: 0,
  };
}

/** Walk the player on foot. Returns true when the player is sprinting. */
export function walkPlayer(player, move, sprint, dt, city) {
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const len = Math.hypot(move.x, move.y);
  let sprinting = false;
  if (len > 0) {
    const nx = move.x / len;
    const ny = move.y / len;
    const next = city.collideCircle(player.x + nx * speed * dt, player.y + ny * speed * dt, PLAYER.radius);
    player.x = next.x;
    player.y = next.y;
    player.angle = Math.atan2(ny, nx);
    sprinting = sprint;
  }
  return sprinting;
}

/** One step for every pedestrian: walk, wait, or run from trouble. */
export function stepPeds(peds, dt, city, rng, danger) {
  for (const ped of peds) {
    if (ped.dead) continue;
    ped.hitFlash = Math.max(0, ped.hitFlash - dt * 5);
    if (ped.panic > 0) {
      ped.panic -= dt;
      // Run away from the danger point.
      const away = Math.atan2(ped.y - danger.y, ped.x - danger.x);
      ped.angle = away;
      const next = city.collideCircle(ped.x + Math.cos(away) * 190 * dt, ped.y + Math.sin(away) * 190 * dt, PLAYER.radius);
      ped.x = next.x;
      ped.y = next.y;
      ped.state = 'run';
      continue;
    }
    ped.state = 'walk';
    if (ped.wait > 0) {
      ped.wait -= dt;
      continue;
    }
    const dx = ped.targetX - ped.x;
    const dy = ped.targetY - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) {
      ped.wait = range(rng, 1, 4);
      const p = city.randomRoadPoint();
      ped.targetX = p.x;
      ped.targetY = p.y;
      continue;
    }
    ped.angle = Math.atan2(dy, dx);
    const next = city.collideCircle(ped.x + (dx / d) * ped.speed * dt, ped.y + (dy / d) * ped.speed * dt, PLAYER.radius);
    ped.x = next.x;
    ped.y = next.y;
  }
}

/** Foot cops run at the player; holding contact for 2 s busts him. Returns 'busted' or ''. */
export function stepCops(cops, dt, city, player) {
  for (const cop of cops) {
    if (cop.dead) continue;
    cop.hitFlash = Math.max(0, cop.hitFlash - dt * 5);
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) continue;
    cop.angle = Math.atan2(dy, dx);
    const next = city.collideCircle(cop.x + (dx / d) * cop.speed * dt, cop.y + (dy / d) * cop.speed * dt, PLAYER.radius);
    cop.x = next.x;
    cop.y = next.y;
    if (d < 30) {
      cop.holdTime += dt;
      if (cop.holdTime > 2) return 'busted';
    } else {
      cop.holdTime = Math.max(0, cop.holdTime - dt * 2);
    }
  }
  return '';
}

/** Scare every pedestrian near a point (gunfire, explosions, a speeding car). */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.dead) continue;
    const d2 = (ped.x - x) * (ped.x - x) + (ped.y - y) * (ped.y - y);
    if (d2 < radius * radius) ped.panic = 2.5;
  }
}

/** The wanted level: how many stars the player has, and how they fade. */
export function createWanted() {
  return { stars: 0, quietTime: 0, lastCrime: -999 };
}

export function addWanted(wanted, amount, time) {
  wanted.stars = Math.min(WANTED.max, wanted.stars + amount);
  wanted.lastCrime = time;
  wanted.quietTime = 0;
  return wanted.stars;
}

/** Fade one star after quietSeconds with no police close by. Returns true on a change. */
export function decayWanted(wanted, dt, time, nearestPoliceDist) {
  if (wanted.stars === 0) return false;
  if (time - wanted.lastCrime < 4) return false;
  if (nearestPoliceDist < WANTED.decayRange) {
    wanted.quietTime = 0;
    return false;
  }
  wanted.quietTime += dt;
  if (wanted.quietTime >= WANTED.decaySeconds) {
    wanted.stars -= 1;
    wanted.quietTime = 0;
    return true;
  }
  return false;
}
