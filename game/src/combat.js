// Combat: bullets, explosions and the particles they leave behind, plus the pickups
// the city scatters — cash, ammo and health. Nothing here knows about screens; it only
// moves things and reports what happened as events.
import { BULLET, CAR, PLAYER, PICKUP } from './config.js';
import { chance, range } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_SHOT = 1;
export const EVENT_KILL = 2;
export const EVENT_PLAYER_HIT = 4;
export const EVENT_EXPLOSION = 8;
export const EVENT_PICKUP = 16;

/** A bullet in flight: who fired it, where it is going, how much it hurts. */
export function fireBullet(bullets, x, y, angle, damage, friendly) {
  bullets.push({
    x, y,
    vx: Math.cos(angle) * BULLET.speed,
    vy: Math.sin(angle) * BULLET.speed,
    life: BULLET.life,
    damage,
    friendly,
    dead: false,
  });
}

function burst(particles, x, y, color, count, speed, life, size) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: life * (0.5 + Math.random() * 0.5),
      maxLife: life,
      size: size * (0.6 + Math.random() * 0.8),
      color,
      kind: 'dot',
    });
  }
}

export function explode(particles, x, y) {
  burst(particles, x, y, '#ff9a3c', 26, 320, 0.7, 7);
  burst(particles, x, y, '#e5534b', 18, 200, 0.9, 9);
  burst(particles, x, y, '#3a3f4a', 14, 90, 1.6, 12);
  particles.push({ x, y, vx: 0, vy: 0, life: 0.35, maxLife: 0.35, size: 90, color: '#fff3c9', kind: 'flash' });
}

export function muzzle(particles, x, y, angle) {
  particles.push({
    x: x + Math.cos(angle) * 22, y: y + Math.sin(angle) * 22,
    vx: 0, vy: 0, life: 0.06, maxLife: 0.06, size: 14, color: '#ffe9a8', kind: 'flash',
  });
  burst(particles, x + Math.cos(angle) * 20, y + Math.sin(angle) * 20, '#ffd94a', 3, 160, 0.18, 3);
}

export function blood(particles, x, y) {
  burst(particles, x, y, '#c94a4a', 8, 140, 0.5, 4);
}

export function smoke(particles, x, y) {
  particles.push({ x, y, vx: range(Math.random, -14, 14), vy: range(Math.random, -30, -10), life: 1.1, maxLife: 1.1, size: 10, color: 'rgba(120,120,130,0.5)', kind: 'smoke' });
}

export function addPickup(pickups, kind, x, y) {
  pickups.push({ kind, x, y, bob: 0, dead: false });
}

/** Move bullets, test them against buildings, cars, people and the player. */
export function stepBullets(state, dt) {
  const { bullets, city, cars, peds, cops, player, particles } = state;
  let events = EVENT_NONE;
  for (const b of bullets) {
    if (b.dead) continue;
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0) { b.dead = true; continue; }
    if (city.circleHitsBuilding(b.x, b.y, BULLET.radius)) {
      burst(particles, b.x, b.y, '#c9c9c9', 4, 120, 0.3, 3);
      b.dead = true;
      continue;
    }
    // Cars.
    for (const car of cars) {
      if (car.dead) continue;
      const dx = b.x - car.x;
      const dy = b.y - car.y;
      if (dx * dx + dy * dy < (CAR.radius + 4) * (CAR.radius + 4)) {
        car.hp -= b.damage;
        burst(particles, b.x, b.y, '#ffd94a', 5, 150, 0.3, 3);
        b.dead = true;
        if (car.hp <= 0 && !car.dead) {
          car.dead = true;
          explode(particles, car.x, car.y);
          events |= EVENT_EXPLOSION;
          if (car === state.playerCar) events |= EVENT_PLAYER_HIT;
        }
        break;
      }
    }
    if (b.dead) continue;
    // Pedestrians, cops and rivals (only friendly fire hurts them).
    // Civilians and cops go down in one shot; rivals are tougher and
    // take three pistol hits (34 damage against 100 health).
    const folks = [...peds, ...cops, ...(state.rivals ?? [])];
    for (const f of folks) {
      if (f.dead) continue;
      const dx = b.x - f.x;
      const dy = b.y - f.y;
      if (dx * dx + dy * dy < (PLAYER.radius + 4) * (PLAYER.radius + 4)) {
        if (b.friendly) {
          if (f.kind === 'rival') {
            f.health -= b.damage;
            f.hitFlash = 1;
            if (f.health > 0) { b.dead = true; break; }
          }
          f.dead = true;
          blood(particles, f.x, f.y);
          events |= EVENT_KILL;
          if (chance(Math.random, 0.5)) addPickup(state.pickups, 'cash', f.x, f.y);
        }
        b.dead = true;
        break;
      }
    }
    if (b.dead) continue;
    // The player (enemy bullets only).
    if (!b.friendly && !player.inCar) {
      const dx = b.x - player.x;
      const dy = b.y - player.y;
      if (dx * dx + dy * dy < (PLAYER.radius + 4) * (PLAYER.radius + 4)) {
        player.health -= b.damage;
        player.lastHurt = state.time;
        blood(particles, player.x, player.y);
        events |= EVENT_PLAYER_HIT;
        b.dead = true;
      }
    }
  }
  state.bullets = bullets.filter((b) => !b.dead);
  return events;
}

/** Enemies (rivals) shoot at the player when they can see him. */
export function enemyFire(state, dt, rng) {
  for (const r of state.rivals) {
    if (r.dead) continue;
    r.shootTimer -= dt;
    const dx = state.player.x - r.x;
    const dy = state.player.y - r.y;
    const d = Math.hypot(dx, dy);
    if (d > 520 || r.shootTimer > 0) continue;
    // Line of sight: no building between them.
    if (state.city.circleHitsBuilding((r.x + state.player.x) / 2, (r.y + state.player.y) / 2, 26)) continue;
    const spread = range(rng, -0.14, 0.14);
    const angle = Math.atan2(dy, dx) + spread;
    fireBullet(state.bullets, r.x + Math.cos(angle) * 20, r.y + Math.sin(angle) * 20, angle, 7, false);
    muzzle(state.particles, r.x, r.y, angle);
    r.shootTimer = range(rng, 1.2, 2.0);
    state.audio.enemyShot();
  }
}

/** Move and age particles; drop the dead ones. */
export function stepParticles(particles, dt) {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.2 * dt;
    p.vy *= 1 - 2.2 * dt;
  }
  return particles.filter((p) => p.life > 0);
}

/** The player walks over a pickup: take it. Returns the kind taken, or ''. */
export function collectPickups(state) {
  const { player, pickups, particles } = state;
  for (const p of pickups) {
    if (p.dead) continue;
    p.bob += 0.08;
    const dx = player.x - p.x;
    const dy = player.y - p.y;
    if (dx * dx + dy * dy < 30 * 30) {
      p.dead = true;
      if (p.kind === 'cash') {
        player.money += PICKUP.cashValue;
        state.audio.cash();
      } else if (p.kind === 'ammo') {
        player.ammo = Math.min(PLAYER.ammoMax, player.ammo + PICKUP.ammoValue);
        state.audio.pickup();
      } else if (p.kind === 'health') {
        player.health = Math.min(PLAYER.health, player.health + PICKUP.healthValue);
        state.audio.pickup();
      }
      burst(particles, p.x, p.y, '#7ee787', 8, 120, 0.4, 4);
      return p.kind;
    }
  }
  state.pickups = pickups.filter((p) => !p.dead);
  return '';
}
