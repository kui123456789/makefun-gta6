// The simulation: one state object, one fixed step. The player walks or drives, traffic
// and pedestrians fill the city, police respond to the wanted level, missions advance,
// and the camera follows. The loop in main.js only feeds it input and draws the result.
import { CAR, PLAYER, TRAFFIC, PEDS, WANTED, WORLD } from './config.js';
import { buildCity } from './city.js';
import { createRandom, pick, range } from './random.js';
import { createCar, driveCar, driveTraffic, drivePolice, spawnTrafficCar, spawnPoliceCar, KIND_TRAFFIC, KIND_POLICE } from './vehicles.js';
import { createPed, createCop, walkPlayer, stepPeds, stepCops, scarePeds, createWanted, addWanted, decayWanted } from './people.js';
import { fireBullet, stepBullets, enemyFire, stepParticles, collectPickups, explode, muzzle, smoke, addPickup, EVENT_KILL, EVENT_PLAYER_HIT, EVENT_EXPLOSION } from './combat.js';
import { createMissionState, startMission, stepMission, currentObjective, missionList } from './missions.js';
import { ACTION_ENTER } from './input.js';

export const EVENT_WASTED = 1;
export const EVENT_BUSTED = 2;

function makePlayer(city) {
  const g = city.places.garage;
  return {
    x: g.x - 40, y: g.y + 60, angle: -Math.PI / 2,
    health: PLAYER.health,
    money: 0,
    ammo: PLAYER.ammoStart,
    inCar: false,
    lastHurt: -999,
    aimAngle: -Math.PI / 2,
    shootCooldown: 0,
    sprinting: false,
  };
}

export function createGame(seed) {
  const rng = createRandom(seed);
  const city = buildCity(rng);
  const state = {
    time: 0,
    seed,
    rng,
    city,
    player: makePlayer(city),
    playerCar: null,
    cars: [],
    policeCars: [],
    cops: [],
    peds: [],
    rivals: [],
    bullets: [],
    particles: [],
    pickups: [],
    skids: [],
    wanted: createWanted(),
    missions: createMissionState(),
    camera: { x: 0, y: 0, zoom: 1 },
    shake: 0,
    stats: { kills: 0, carsStolen: 0 },
    pendingBrief: null,
    briefCooldown: 0,
    van: null,
    audio: null,
    message: '',
    messageTime: 0,
  };
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  resetWorld(state);
  return state;
}

/** Fresh world: traffic, pedestrians and pickups scattered near the player. */
export function resetWorld(state) {
  const { city, rng, player } = state;
  state.cars = [];
  state.policeCars = [];
  state.cops = [];
  state.peds = [];
  state.rivals = [];
  state.bullets = [];
  state.particles = [];
  state.pickups = [];
  state.skids = [];
  state.van = null;
  for (let i = 0; i < TRAFFIC.count; i += 1) state.cars.push(spawnTrafficCar(rng, city, player));
  for (let i = 0; i < PEDS.count; i += 1) state.peds.push(createPed(rng, city, player));
  // A few pickups near the start so the player learns what they are.
  addPickup(state.pickups, 'health', city.places.hospital.x, city.places.hospital.y - 60);
  addPickup(state.pickups, 'ammo', city.places.garage.x + 60, city.places.garage.y - 90);
  addPickup(state.pickups, 'cash', city.places.beach.x, city.places.beach.y);
}

/** The nearest drivable car to a point (traffic, police excluded), within maxDist. */
export function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestD = maxDist * maxDist;
  const all = [...state.cars];
  if (state.van && !state.van.dead) all.push(state.van);
  for (const car of all) {
    if (car.dead) continue;
    const d2 = (car.x - x) * (car.x - x) + (car.y - y) * (car.y - y);
    if (d2 < bestD) { bestD = d2; best = car; }
  }
  return best;
}

function stealCar(state, car) {
  const { player } = state;
  state.cars = state.cars.filter((c) => c !== car);
  if (state.van === car) state.van = null;
  car.kind = 'player';
  car.hp = Math.max(car.hp, 60);
  state.playerCar = car;
  player.inCar = true;
  player.x = car.x;
  player.y = car.y;
  state.stats.carsStolen += 1;
  addWanted(state.wanted, WANTED.steal, state.time);
  state.audio.wantedUp();
  state.message = car.isVan ? 'You took the armored van!' : `You took the ${car.name}. The heat is on.`;
  state.messageTime = 3;
  state.audio.confirm();
}

function exitCar(state) {
  const { player, playerCar } = state;
  if (!playerCar) return;
  const side = playerCar.angle + Math.PI / 2;
  const x = playerCar.x + Math.cos(side) * 34;
  const y = playerCar.y + Math.sin(side) * 34;
  const fixed = state.city.collideCircle(x, y, PLAYER.radius);
  player.x = fixed.x;
  player.y = fixed.y;
  player.angle = playerCar.angle;
  player.inCar = false;
  // The car stays where it is, now just traffic again.
  playerCar.kind = KIND_TRAFFIC;
  playerCar.speed = 0;
  state.cars.push(playerCar);
  state.playerCar = null;
}

function spawnRivals(state) {
  const p = state.city.places.rivalBlock;
  state.rivals = [];
  for (let i = 0; i < 5; i += 1) {
    state.rivals.push({
      kind: 'rival',
      x: p.x + range(state.rng, -110, 110),
      y: p.y + range(state.rng, -110, 110),
      angle: 0,
      speed: 150,
      health: 100,
      dead: false,
      hitFlash: 0,
      shootTimer: range(state.rng, 0.4, 1.2),
    });
  }
  state.message = 'The Vipers are here. Clear them out.';
  state.messageTime = 4;
}

function spawnVan(state) {
  const p = state.city.places.port;
  const van = createCar(KIND_TRAFFIC, p.x, p.y - 40, Math.PI / 2, '#3a3f4a');
  van.isVan = true;
  van.name = 'Armored Van';
  van.hp = 220;
  van.speed = 0;
  state.van = van;
  state.message = 'There it is — the armored van.';
  state.messageTime = 4;
}

function maintainPopulation(state, dt) {
  const { rng, city, camera } = state;
  // Traffic: keep the count up, spawning near the camera.
  state.cars = state.cars.filter((c) => !c.dead);
  while (state.cars.length < TRAFFIC.count) {
    state.cars.push(spawnTrafficCar(rng, city, camera));
  }
  for (const car of state.cars) {
    const d = Math.hypot(car.x - camera.x, car.y - camera.y);
    if (d > 1600) {
      const fresh = spawnTrafficCar(rng, city, camera);
      car.x = fresh.x; car.y = fresh.y; car.angle = fresh.angle;
      car.roadVertical = fresh.roadVertical; car.roadLine = fresh.roadLine; car.roadDir = fresh.roadDir;
    }
  }
  // Pedestrians: same idea.
  state.peds = state.peds.filter((p) => !p.dead);
  while (state.peds.length < PEDS.count) state.peds.push(createPed(rng, city, camera));
  for (const ped of state.peds) {
    const d = Math.hypot(ped.x - camera.x, ped.y - camera.y);
    if (d > 1500) {
      const fresh = createPed(rng, city, camera);
      ped.x = fresh.x; ped.y = fresh.y;
    }
  }
  // Police presence follows the wanted level — but only while the player is spotted:
  // a fresh crime, or a police unit close by. Go quiet and break contact and the
  // heat stops coming, which is what lets the wanted level decay.
  state.policeCars = state.policeCars.filter((c) => !c.dead);
  state.cops = state.cops.filter((c) => !c.dead);
  const nearestPoliceNow = Math.min(
    ...state.policeCars.map((c) => Math.hypot(c.x - state.player.x, c.y - state.player.y)),
    ...state.cops.map((c) => Math.hypot(c.x - state.player.x, c.y - state.player.y)),
    Infinity,
  );
  const spotted = state.time - state.wanted.lastCrime < 20 || nearestPoliceNow < 420;
  const wantedCars = state.wanted.stars === 0 || !spotted ? 0 : Math.min(3, state.wanted.stars) + (state.wanted.stars >= 4 ? 1 : 0);
  while (state.policeCars.length < wantedCars) {
    state.policeCars.push(spawnPoliceCar(rng, city, state.player.inCar && state.playerCar ? state.playerCar : state.player, camera));
  }
  while (state.policeCars.length > wantedCars) state.policeCars.pop();
  const wantedCops = !state.player.inCar && state.wanted.stars >= 2 ? Math.min(3, state.wanted.stars - 1) : 0;
  // Foot cops who lost the player far behind drop out of the chase.
  state.cops = state.cops.filter((c) => Math.hypot(c.x - state.player.x, c.y - state.player.y) < 900);
  while (state.cops.length < wantedCops) {
    const car = state.policeCars[0];
    state.cops.push(createCop(car ? car.x + range(rng, -40, 40) : state.player.x + range(rng, -300, 300), car ? car.y + range(rng, -40, 40) : state.player.y + range(rng, -300, 300)));
  }
  while (state.cops.length > wantedCops) state.cops.pop();
  // Occasional pickups near the player.
  if (state.pickups.length < 6 && rng() < dt * 0.25) {
    const kind = pick(rng, ['cash', 'cash', 'ammo', 'health']);
    addPickup(state.pickups, kind, camera.x + range(rng, -500, 500), camera.y + range(rng, -350, 350));
  }
}

function collideCars(state, dt) {
  // Player car vs traffic and police: bump, damage, slow down.
  const pc = state.playerCar;
  if (!pc || pc.dead) return;
  const all = [...state.cars, ...state.policeCars];
  for (const other of all) {
    if (other.dead) continue;
    const dx = pc.x - other.x;
    const dy = pc.y - other.y;
    const d2 = dx * dx + dy * dy;
    const min = CAR.radius * 2;
    if (d2 < min * min && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = (min - d) / 2;
      pc.x += nx * overlap;
      pc.y += ny * overlap;
      other.x -= nx * overlap;
      other.y -= ny * overlap;
      const impact = Math.abs(pc.speed - other.speed);
      if (impact > 120) {
        // One thump per half second, not a damage hose: rams hurt, they do not shred.
        if (state.time - (pc.lastBump ?? -99) > 0.5) {
          pc.hp -= impact * 0.015;
          other.hp -= impact * 0.015;
          pc.lastBump = state.time;
        }
        pc.speed *= 0.6;
        other.speed *= 0.6;
        state.shake = Math.min(10, state.shake + impact * 0.01);
        state.audio.hit();
      }
    }
  }
}

function carHitsPeds(state) {
  const pc = state.playerCar;
  if (!pc || pc.dead || Math.abs(pc.speed) < 60) return;
  for (const ped of state.peds) {
    if (ped.dead) continue;
    const dx = ped.x - pc.x;
    const dy = ped.y - pc.y;
    if (dx * dx + dy * dy < (CAR.radius + 12) * (CAR.radius + 12)) {
      ped.dead = true;
      state.stats.kills += 1;
      addWanted(state.wanted, WANTED.hitPed, state.time);
      scarePeds(state.peds, pc.x, pc.y, 420);
      state.audio.hit();
    }
  }
}

function respawnAfterTrouble(state, busted) {
  const h = state.city.places.hospital;
  const { player } = state;
  player.x = h.x;
  player.y = h.y + 80;
  player.health = PLAYER.health;
  player.ammo = Math.max(player.ammo, 24);
  player.inCar = false;
  if (state.playerCar) {
    state.playerCar.dead = true;
    state.playerCar = null;
  }
  player.money = Math.floor(player.money * 0.85);
  state.wanted.stars = 0;
  state.wanted.quietTime = 0;
  state.policeCars = [];
  state.cops = [];
  state.bullets = [];
  // The job fails; it can be taken again at the garage.
  if (state.missions.active) {
    state.missions.active = false;
    state.missions.banner = busted ? 'Busted — the job failed.' : 'Wasted — the job failed.';
    state.missions.bannerTime = 5;
    state.audio.fail();
  }
  state.camera.x = player.x;
  state.camera.y = player.y;
}

/**
 * One fixed step of the whole game. `input` is the input device, `aimWorld` is the
 * mouse position in world coordinates (for aiming on foot). Returns EVENT_* flags.
 */
export function stepGame(state, dt, input, aimWorld) {
  const { player, city } = state;
  state.time += dt;
  let events = 0;
  const actions = input.takeActions();

  // Mission setup that only happens once per job.
  const obj = currentObjective(state.missions);
  if (state.missions.active && obj && obj.type === 'defeat' && state.rivals.length === 0) spawnRivals(state);
  if (state.missions.active && state.missions.index === 4 && !state.van && !(state.playerCar && state.playerCar.isVan)) {
    const o = currentObjective(state.missions);
    if (o && (o.type === 'stealVan' || o.type === 'goto')) spawnVan(state);
  }

  // --- Player ---
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  if (player.inCar && state.playerCar) {
    const car = state.playerCar;
    const skidding = driveCar(car, input.throttle(), input.steer(), input.handbrake(), dt, city);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    if (skidding) {
      const bx = car.x - Math.cos(car.angle) * 16;
      const by = car.y - Math.sin(car.angle) * 16;
      state.skids.push({ x1: bx, y1: by, x2: bx - Math.cos(car.angle) * 6, y2: by - Math.sin(car.angle) * 6, life: 1.4 });
      if (state.rng() < dt * 8) smoke(state.particles, bx, by);
    }
    if (actions & ACTION_ENTER) exitCar(state); // E to get out
    if (car.hp <= 0 && !car.dead) {
      car.dead = true;
      explode(state.particles, car.x, car.y);
      state.audio.explosion();
      state.shake = 14;
      player.inCar = false;
      player.health -= 40;
      player.lastHurt = state.time;
      state.playerCar = null;
      events |= EVENT_EXPLOSION;
    }
  } else {
    const move = input.move();
    player.sprinting = walkPlayer(player, move, input.sprint(), dt, city);
    if (aimWorld) player.aimAngle = Math.atan2(aimWorld.y - player.y, aimWorld.x - player.x);
    // Shooting: mouse held, pistol pace, costs ammo.
    if (input.shooting() && player.shootCooldown <= 0 && player.ammo > 0) {
      player.ammo -= 1;
      player.shootCooldown = PLAYER.pistolRate;
      const gx = player.x + Math.cos(player.aimAngle) * 22;
      const gy = player.y + Math.sin(player.aimAngle) * 22;
      fireBullet(state.bullets, gx, gy, player.aimAngle + (state.rng() - 0.5) * 0.05, PLAYER.pistolDamage, true);
      muzzle(state.particles, player.x, player.y, player.aimAngle);
      state.audio.shot();
      scarePeds(state.peds, player.x, player.y, 380);
      if (state.wanted.stars === 0) {
        // The first shot in the open draws the heat.
        addWanted(state.wanted, WANTED.shoot, state.time);
        state.audio.wantedUp();
      }
    }
    // Enter a car.
    if (actions & ACTION_ENTER) {
      const car = nearestCar(state, player.x, player.y, 64);
      if (car) {
        stealCar(state, car);
      }
    }
    // Walking into Mara's garage offers the next job (no key needed).
    if (state.briefCooldown > 0) state.briefCooldown -= dt;
    if (!state.missions.active && state.pendingBrief === null && state.briefCooldown <= 0 &&
        state.missions.completed.length < missionList().length) {
      const g = city.places.garage;
      if (Math.hypot(player.x - g.x, player.y - g.y) < 110) {
        state.pendingBrief = state.missions.completed.length;
      }
    }
  }

  // --- Traffic, pedestrians, police ---
  for (const car of state.cars) driveTraffic(car, dt, city, state.rng, state.playerCar);
  stepPeds(state.peds, dt, city, state.rng, player);
  for (const car of state.policeCars) {
    const target = player.inCar && state.playerCar ? state.playerCar : player;
    const dist = Math.hypot(car.x - target.x, car.y - target.y);
    // A patrol that cannot close in for 8 seconds loses the trail and goes back
    // to cruising the roads as ordinary traffic.
    if (dist > 520) car.searchTime = (car.searchTime ?? 0) + dt;
    else car.searchTime = 0;
    if (car.searchTime > 8) {
      car.kind = KIND_TRAFFIC;
      const np = city.nearestRoadPoint(car.x, car.y);
      car.roadVertical = np.vertical;
      car.roadLine = np.vertical ? np.x : np.y;
      car.roadDir = 1;
      car.speed = 160;
      car.gaveUp = true;
      state.cars.push(car);
      continue;
    }
    drivePolice(car, dt, city, target);
    if (!player.inCar && Math.hypot(car.x - player.x, car.y - player.y) < 70) {
      car.speed = 0;
    }
  }
  state.policeCars = state.policeCars.filter((c) => !c.gaveUp);
  const busted = stepCops(state.cops, dt, city, player);
  if (busted === 'busted') {
    respawnAfterTrouble(state, true);
    return EVENT_BUSTED;
  }

  // Rivals close in and shoot — but they hold a firing line about 140 px out,
  // backing off if the player rushes them, so they never pile onto the player.
  for (const r of state.rivals) {
    if (r.dead) continue;
    r.hitFlash = Math.max(0, r.hitFlash - dt * 5);
    const dx = player.x - r.x;
    const dy = player.y - r.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      r.angle = Math.atan2(dy, dx);
      if (d > 150 && d < 560) {
        const next = city.collideCircle(r.x + (dx / d) * r.speed * dt, r.y + (dy / d) * r.speed * dt, PLAYER.radius);
        r.x = next.x;
        r.y = next.y;
      } else if (d < 120) {
        const next = city.collideCircle(r.x - (dx / d) * r.speed * 0.8 * dt, r.y - (dy / d) * r.speed * 0.8 * dt, PLAYER.radius);
        r.x = next.x;
        r.y = next.y;
      }
    }
  }
  enemyFire(state, dt, state.rng);

  // --- Bullets, pickups, collisions ---
  const bulletEvents = stepBullets(state, dt);
  if (bulletEvents & EVENT_KILL) {
    // A rival kill counts toward the job; a civilian kill draws more heat.
    const before = state.missions.defeatCount;
    for (const r of state.rivals) {
      if (r.dead && !r.counted) { r.counted = true; state.missions.defeatCount += 1; }
    }
    if (state.missions.defeatCount === before) {
      state.stats.kills += 1;
      addWanted(state.wanted, WANTED.killPed, state.time);
    }
  }
  if (bulletEvents & EVENT_PLAYER_HIT) state.audio.hit();
  if (bulletEvents & EVENT_EXPLOSION) {
    state.shake = Math.min(16, state.shake + 8);
    state.audio.explosion();
  }
  collideCars(state, dt);
  carHitsPeds(state);
  collectPickups(state);
  state.particles = stepParticles(state.particles, dt);
  for (const s of state.skids) s.life -= dt;
  state.skids = state.skids.filter((s) => s.life > 0);

  // --- Wanted decay, health regen, mission progress ---
  const nearestPolice = Math.min(
    ...state.policeCars.map((c) => Math.hypot(c.x - player.x, c.y - player.y)),
    ...state.cops.map((c) => Math.hypot(c.x - player.x, c.y - player.y)),
    Infinity,
  );
  decayWanted(state.wanted, dt, state.time, nearestPolice);
  if (state.time - player.lastHurt > PLAYER.regenDelay && player.health > 0) {
    player.health = Math.min(PLAYER.health, player.health + PLAYER.regenRate * dt);
  }
  stepMission(state.missions, state, dt);
  maintainPopulation(state, dt);

  // --- Camera: follow the player with a little look-ahead, zoom out at speed ---
  const focus = player.inCar && state.playerCar ? state.playerCar : player;
  const speed = player.inCar && state.playerCar ? Math.abs(state.playerCar.speed) : 0;
  const targetZoom = player.inCar ? 0.82 - Math.min(0.14, (speed / 640) * 0.14) : 1.0;
  const lookX = player.inCar ? Math.cos(player.angle) * speed * 0.22 : 0;
  const lookY = player.inCar ? Math.sin(player.angle) * speed * 0.22 : 0;
  const tx = focus.x + lookX;
  const ty = focus.y + lookY;
  const k = 1 - Math.exp(-5 * dt);
  state.camera.x += (tx - state.camera.x) * k;
  state.camera.y += (ty - state.camera.y) * k;
  state.camera.zoom += (targetZoom - state.camera.zoom) * (1 - Math.exp(-2.5 * dt));
  state.shake = Math.max(0, state.shake - dt * 26);
  if (state.messageTime > 0) state.messageTime -= dt;

  // --- Wasted ---
  if (player.health <= 0) {
    respawnAfterTrouble(state, false);
    return EVENT_WASTED;
  }
  return events;
}

/** Start the job the player just accepted at the garage. */
export function beginPendingMission(state) {
  if (state.pendingBrief === null) return null;
  const index = state.pendingBrief;
  state.pendingBrief = null;
  return startMission(state.missions, index, state.city, state);
}

/** Apply a loaded save on top of a fresh world. */
export function applySave(state, save) {
  state.player.money = save.money;
  state.player.health = save.health;
  state.player.ammo = save.ammo;
  state.player.x = save.x;
  state.player.y = save.y;
  state.player.angle = save.angle;
  state.wanted.stars = save.wanted;
  state.missions.completed = [...save.missionsCompleted];
  state.stats.kills = save.kills ?? 0;
  state.stats.carsStolen = save.carsStolen ?? 0;
  state.camera.x = save.x;
  state.camera.y = save.y;
}
