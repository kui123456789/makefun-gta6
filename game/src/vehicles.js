// Cars: the player's arcade driving physics, the traffic that follows the road grid,
// and the police cars that hunt the player. A car is a point with a heading and a speed;
// its velocity is split into forward and sideways parts every step, so steering, grip
// and the handbrake all fall out of one small update.
import { CAR, TRAFFIC, WORLD } from './config.js';
import { angleDiff, clamp, pick, range } from './random.js';

export const KIND_TRAFFIC = 'traffic';
export const KIND_POLICE = 'police';
export const KIND_PLAYER = 'player';

const TRAFFIC_COLORS = ['#d94f4f', '#4f7fd9', '#e8e8e8', '#3a3f4a', '#d9a24f', '#7fb069', '#8a6fb5', '#c9c9c9'];
const TRAFFIC_NAMES = ['Comet', 'Sandpiper', 'Marlin', 'Gull', 'Pelican', 'Tropicana', 'Sunrunner', 'Bayliner'];

/** A fresh car at a place and heading. `kind` is traffic, police or player. */
export function createCar(kind, x, y, angle, color) {
  return {
    kind,
    x, y,
    angle,
    speed: 0,
    steer: 0,
    color: color ?? '#d94f4f',
    name: kind === KIND_TRAFFIC ? TRAFFIC_NAMES[Math.floor(Math.random() * TRAFFIC_NAMES.length)] : kind,
    hp: CAR.hp,
    dead: false,
    // Traffic AI state: which road it is on and which way it drives.
    roadVertical: false,
    roadLine: 0,
    roadDir: 1,
    turnCooldown: 0,
    honk: 0,
    // Render state.
    skid: 0,
    flash: 0,
  };
}

/**
 * One step of the player's car. `throttle` is -1..1, `steer` is -1..1, `handbrake`
 * loosens the grip for a slide. Returns true when the tyres are skidding.
 */
export function driveCar(car, throttle, steer, handbrake, dt, city) {
  const maxForward = car.kind === KIND_POLICE ? CAR.policeMaxSpeed : CAR.maxSpeed;
  if (throttle > 0) car.speed += CAR.accel * throttle * dt;
  else if (throttle < 0) {
    car.speed += (car.speed > 20 ? -CAR.brake : CAR.accel * 0.45 * throttle) * dt;
  }
  car.speed -= car.speed * CAR.drag * dt;
  car.speed = clamp(car.speed, -CAR.reverseMax, maxForward);

  const turning = steer * CAR.turnRate * clamp(Math.abs(car.speed) / 220, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += turning * dt;
  car.steer = steer;

  // Split velocity into forward and sideways; grip kills the sideways part.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let vx = fx * car.speed;
  let vy = fy * car.speed;
  // The sideways part is whatever is left after the forward part is accounted for:
  // with full grip the car goes where it points; with the handbrake it slides.
  const grip = handbrake ? CAR.handbrakeGrip : CAR.grip;
  const slide = Math.exp(-grip * dt);
  const px = -fy;
  const py = fx;
  const side = (vx * px + vy * py) * slide;
  const forward = vx * fx + vy * fy;
  vx = fx * forward + px * side;
  vy = fy * forward + py * side;
  car.speed = forward;

  const next = city.collideCircle(car.x + vx * dt, car.y + vy * dt, CAR.radius);
  const hitWall = next.x !== car.x + vx * dt || next.y !== car.y + vy * dt;
  if (hitWall) {
    car.speed *= 0.55;
    // Scraping a wall hurts, but only in spaced-out thumps, not every frame.
    car.wallCooldown = Math.max(0, (car.wallCooldown ?? 0) - dt);
    if (car.wallCooldown <= 0 && Math.abs(forward) > 140) {
      car.hp -= Math.min(3, Math.abs(forward) * 0.008);
      car.wallCooldown = 0.6;
    }
  } else {
    car.wallCooldown = Math.max(0, (car.wallCooldown ?? 0) - dt);
  }
  car.x = next.x;
  car.y = next.y;
  car.skid = handbrake && Math.abs(car.speed) > 240 ? 1 : Math.max(0, car.skid - dt * 3);
  return handbrake && Math.abs(car.speed) > 240;
}

/** Traffic: follow the road grid, turn at intersections, keep off the player's car. */
export function driveTraffic(car, dt, city, rng, playerCar) {
  car.turnCooldown -= dt;
  const line = car.roadLine;
  const dir = car.roadDir;
  // Where the car is heading along its road.
  let tx;
  let ty;
  if (car.roadVertical) {
    tx = line;
    ty = car.y + dir * 160;
  } else {
    tx = car.x + dir * 160;
    ty = line;
  }
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, want);
  car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
  const targetSpeed = TRAFFIC.minSpeed + (car.seedSpeed ?? 0);
  car.speed += clamp(targetSpeed - car.speed, -300 * dt, 200 * dt);

  // At an intersection, sometimes turn onto the crossing road.
  const nearV = city.roads.vertical.some((rx) => Math.abs(car.x - rx) < 26);
  const nearH = city.roads.horizontal.some((ry) => Math.abs(car.y - ry) < 26);
  if (car.turnCooldown <= 0 && nearV && nearH && rng() < 0.5) {
    if (car.roadVertical) {
      car.roadVertical = false;
      car.roadLine = city.roads.horizontal.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a));
      car.roadDir = rng() < 0.5 ? 1 : -1;
    } else {
      car.roadVertical = true;
      car.roadLine = city.roads.vertical.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
      car.roadDir = rng() < 0.5 ? 1 : -1;
    }
    car.turnCooldown = 2.5;
  }

  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  const next = city.collideCircle(car.x + vx * dt, car.y + vy * dt, CAR.radius);
  if (next.x !== car.x + vx * dt || next.y !== car.y + vy * dt) {
    // Bumped into a building (should not happen on roads): turn around.
    car.roadDir *= -1;
    car.angle += Math.PI;
  }
  car.x = next.x;
  car.y = next.y;

  // Keep a little distance from the player's car.
  if (playerCar && !playerCar.dead) {
    const dx = car.x - playerCar.x;
    const dy = car.y - playerCar.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 90 * 90 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      car.x = playerCar.x + (dx / d) * 90;
      car.y = playerCar.y + (dy / d) * 90;
    }
  }
}

/** Police: steer straight at the player, ram, and never give up while wanted. */
export function drivePolice(car, dt, city, target) {
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = angleDiff(car.angle, want);
  car.angle += clamp(diff, -3.4 * dt, 3.4 * dt);
  const dist = Math.hypot(target.x - car.x, target.y - car.y);
  // Pull up alongside the player to make the arrest, not kamikaze into him:
  // brake hard up close, cruise at half speed in the near zone, full speed far away.
  const targetSpeed = dist < 90 ? 0 : dist < 260 ? CAR.policeMaxSpeed * 0.45 : CAR.policeMaxSpeed;
  car.speed += clamp(targetSpeed - car.speed, -600 * dt, 520 * dt);
  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  const next = city.collideCircle(car.x + vx * dt, car.y + vy * dt, CAR.radius);
  if (next.x !== car.x + vx * dt || next.y !== car.y + vy * dt) {
    car.speed *= 0.5;
    car.angle += 0.6 * dt * (car.speed > 0 ? 1 : -1);
  }
  car.x = next.x;
  car.y = next.y;
}

/** A traffic car on a random road, facing along it. */
export function spawnTrafficCar(rng, city, near) {
  const p = city.randomRoadPoint();
  const car = createCar(KIND_TRAFFIC, p.x, p.y, p.vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI), pick(rng, TRAFFIC_COLORS));
  car.roadVertical = p.vertical;
  car.roadLine = p.vertical ? p.x : p.y;
  car.roadDir = rng() < 0.5 ? 1 : -1;
  car.seedSpeed = range(rng, 0, TRAFFIC.maxSpeed - TRAFFIC.minSpeed);
  car.turnCooldown = range(rng, 1, 4);
  if (near) {
    car.x = near.x + range(rng, -500, 500);
    car.y = near.y + range(rng, -400, 400);
    const np = city.nearestRoadPoint(car.x, car.y);
    car.x = np.x;
    car.y = np.y;
    car.roadVertical = np.vertical;
    car.roadLine = np.vertical ? np.x : np.y;
    car.angle = np.vertical ? (car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.roadDir > 0 ? 0 : Math.PI);
  }
  return car;
}

/** A police car at the edge of the view, already pointing at the player. */
export function spawnPoliceCar(rng, city, target, camera) {
  const angle = range(rng, 0, Math.PI * 2);
  const dist = 720;
  let x = target.x + Math.cos(angle) * dist;
  let y = target.y + Math.sin(angle) * dist;
  x = Math.max(60, Math.min(WORLD.width - 60, x));
  y = Math.max(60, Math.min(WORLD.height - 60, y));
  const np = city.nearestRoadPoint(x, y);
  const car = createCar(KIND_POLICE, np.x, np.y, Math.atan2(target.y - np.y, target.x - np.x), '#e8e8e8');
  car.speed = 320;
  return car;
}
