// Drawing only: the world state and the current screen in, pixels out. The camera
// follows the player; the world is drawn in world coordinates and the HUD, minimap and
// menus in screen coordinates. Warm, sun-soaked colours: the whole city is lit like a
// late afternoon on the coast.
import { CAR, FONT, GAME_NAME, GAME_SUBTITLE, PALETTE, PLAYER, ROAD, WORLD, ZONES } from './config.js';
import { missionTarget, objectiveLabel, missionList } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_HOWTO = 'howto';
export const SCREEN_MISSIONS = 'missions';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BRIEF = 'brief';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_COMPLETE = 'complete';

const VIEW_W = 1280;
const VIEW_H = 720;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { cssW: 1280, cssH: 720, dpr: 1, scale: 1 };
  const fonts = new Map();

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    view.dpr = dpr;
    view.cssW = window.innerWidth;
    view.cssH = window.innerHeight;
    canvas.width = Math.round(view.cssW * dpr);
    canvas.height = Math.round(view.cssH * dpr);
    view.scale = Math.min(view.cssW / VIEW_W, view.cssH / VIEW_H);
  }

  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = weight + size;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function measure(value, size, weight = '') {
    const key = weight + size;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    return ctx.measureText(value).width;
  }

  /** The camera position, clamped so the view never shows outside the world. */
  function clampedCamera(state) {
    const scale = view.scale * state.camera.zoom;
    const halfW = view.cssW / 2 / scale;
    const halfH = view.cssH / 2 / scale;
    const cx = halfW * 2 >= WORLD.width ? WORLD.width / 2 : Math.max(halfW, Math.min(WORLD.width - halfW, state.camera.x));
    const cy = halfH * 2 >= WORLD.height ? WORLD.height / 2 : Math.max(halfH, Math.min(WORLD.height - halfH, state.camera.y));
    return { x: cx, y: cy, scale };
  }

  /** Screen (CSS) pixels -> world coordinates, through the current camera. */
  function screenToWorld(state, mx, my) {
    const { x, y, scale } = clampedCamera(state);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    return {
      x: (mx - view.cssW / 2) / scale + x + shakeX,
      y: (my - view.cssH / 2) / scale + y + shakeY,
    };
  }

  function applyWorldTransform(state) {
    const { x, y, scale } = clampedCamera(state);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.setTransform(view.dpr * scale, 0, 0, view.dpr * scale,
      view.dpr * (view.cssW / 2 - x * scale + shakeX * scale),
      view.dpr * (view.cssH / 2 - y * scale + shakeY * scale));
  }

  function applyScreenTransform() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  }

  // ---------- World ----------
  function drawGround(state) {
    const city = state.city;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    // Beach and sea along the south edge.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, ZONES.beach.y0, WORLD.width, ZONES.beach.y1 - ZONES.beach.y0);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, ZONES.beach.waterY, WORLD.width, WORLD.height - ZONES.beach.waterY);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < WORLD.width; x += 260) {
      ctx.fillRect(x + ((state.time * 24) % 260), ZONES.beach.waterY + 40, 120, 5);
    }
    // Roads.
    for (const ry of city.roads.horizontal) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(0, ry - ROAD.width / 2 - 8, WORLD.width, ROAD.width + 16);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(0, ry - ROAD.width / 2, WORLD.width, ROAD.width);
      ctx.fillStyle = PALETTE.lane;
      for (let x = 20; x < WORLD.width; x += 90) ctx.fillRect(x, ry - 2, 46, 4);
    }
    for (const rx of city.roads.vertical) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(rx - ROAD.width / 2 - 8, 0, ROAD.width + 16, ZONES.beach.y0);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(rx - ROAD.width / 2, 0, ROAD.width, ZONES.beach.y0);
      ctx.fillStyle = PALETTE.lane;
      for (let y = 20; y < ZONES.beach.y0; y += 90) ctx.fillRect(rx - 2, y, 4, 46);
    }
    // Port apron.
    ctx.fillStyle = '#8a8f99';
    ctx.fillRect(ZONES.port.x0, ZONES.port.y0, ZONES.port.x1 - ZONES.port.x0, ZONES.port.y1 - ZONES.port.y0);
  }

  function drawBuildings(state) {
    const city = state.city;
    for (const b of city.buildings) {
      ctx.fillStyle = PALETTE.buildingShadow;
      ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x, b.y, b.w, 10);
      // Rooftop details: a darker inset and a few vents.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 10, b.y + 12, b.w - 20, b.h - 24);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(b.x + 14, b.y + 16, 14, 10);
      if (b.downtown) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let i = 0; i < 4; i += 1) ctx.fillRect(b.x + 12 + i * 18, b.y + b.h - 22, 10, 12);
      }
    }
    for (const c of city.containers) {
      ctx.fillStyle = PALETTE.buildingShadow;
      ctx.fillRect(c.x + 4, c.y + 4, c.w, c.h);
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(c.x, c.y, c.w, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 1; i < 5; i += 1) ctx.fillRect(c.x + (i * c.w) / 5, c.y, 2, c.h);
    }
    for (const t of city.trees) {
      ctx.fillStyle = PALETTE.buildingShadow;
      ctx.beginPath();
      ctx.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.treeDark;
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    // Place labels, small and quiet.
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = 'rgba(20,26,40,0.75)';
    ctx.textAlign = 'center';
    for (const key of Object.keys(city.places)) {
      const p = city.places[key];
      ctx.fillText(p.label, p.x, p.y - 58);
    }
  }

  function drawSkids(state) {
    ctx.strokeStyle = 'rgba(20,20,24,0.4)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const s of state.skids) {
      ctx.globalAlpha = Math.min(1, s.life);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPickups(state) {
    for (const p of state.pickups) {
      const bob = Math.sin(p.bob) * 3;
      if (p.kind === 'cash') {
        ctx.fillStyle = '#2f9e4f';
        roundRect(ctx, p.x - 12, p.y - 8 + bob, 24, 16, 3);
        ctx.fill();
        ctx.fillStyle = PALETTE.cash;
        ctx.font = `700 12px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('$', p.x, p.y + 4 + bob);
      } else if (p.kind === 'ammo') {
        ctx.fillStyle = '#8a6d1f';
        roundRect(ctx, p.x - 11, p.y - 11 + bob, 22, 22, 3);
        ctx.fill();
        ctx.fillStyle = PALETTE.marker;
        ctx.font = `700 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('A', p.x, p.y + 5 + bob);
      } else {
        ctx.fillStyle = '#e8e8e8';
        roundRect(ctx, p.x - 11, p.y - 11 + bob, 22, 22, 4);
        ctx.fill();
        ctx.fillStyle = '#e5534b';
        ctx.fillRect(p.x - 3, p.y - 8 + bob, 6, 16);
        ctx.fillRect(p.x - 8, p.y - 3 + bob, 16, 6);
      }
    }
  }

  function drawMissionMarker(state) {
    const target = missionTarget(state.missions);
    if (!target) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.12;
    const r = 34 * pulse;
    ctx.strokeStyle = PALETTE.marker;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(target.x, target.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.marker;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,217,74,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(target.x, target.y, r + 14, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawCarShape(car, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const len = car.isVan ? 58 : 46;
    const wid = car.isVan ? 30 : 24;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, -len / 2 + 3, -wid / 2 + 4, len, wid, 8);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(ctx, -len / 2, -wid / 2, len, wid, 8);
    ctx.fill();
    // Windshield and rear window.
    ctx.fillStyle = 'rgba(20,30,50,0.85)';
    roundRect(ctx, len / 2 - 16, -wid / 2 + 3, 10, wid - 6, 3);
    ctx.fill();
    roundRect(ctx, -len / 2 + 6, -wid / 2 + 3, 8, wid - 6, 3);
    ctx.fill();
    // Roof.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, -8, -wid / 2 + 4, 16, wid - 8, 4);
    ctx.fill();
    if (car.kind === 'police') {
      ctx.fillStyle = '#1d4fa3';
      ctx.fillRect(-6, -wid / 2, 12, wid);
      const flash = Math.floor(performance.now() / 350) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#3b82ff';
      ctx.beginPath();
      ctx.arc(-2, -wid / 2 - 1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#3b82ff' : '#ff3b30';
      ctx.beginPath();
      ctx.arc(-2, wid / 2 + 1, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.isVan) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `700 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('ARMORED', 0, 3);
    }
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(len / 2 - 1, -wid / 2 + 5, 3, 0, Math.PI * 2);
    ctx.arc(len / 2 - 1, wid / 2 - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    if (isPlayer) {
      ctx.strokeStyle = 'rgba(242,201,76,0.9)';
      ctx.lineWidth = 2.5;
      roundRect(ctx, -len / 2 - 3, -wid / 2 - 3, len + 6, wid + 6, 10);
      ctx.stroke();
    }
    ctx.restore();
    // Smoke from a dying car.
    if (car.hp < 35 && !car.dead && Math.random() < 0.3) {
      ctx.fillStyle = 'rgba(120,120,130,0.45)';
      ctx.beginPath();
      ctx.arc(car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18, 8 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPerson(x, y, angle, color, opts = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(2, 3, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = opts.flash ? '#ffffff' : color;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(3, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    if (opts.gun) {
      ctx.strokeStyle = '#1f2a44';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(24, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorld(state) {
    drawGround(state);
    drawBuildings(state);
    drawSkids(state);
    drawPickups(state);
    drawMissionMarker(state);
    for (const car of state.cars) if (!car.dead) drawCarShape(car, false);
    if (state.van && !state.van.dead) drawCarShape(state.van, false);
    for (const car of state.policeCars) if (!car.dead) drawCarShape(car, false);
    if (state.playerCar && !state.playerCar.dead) drawCarShape(state.playerCar, true);
    for (const ped of state.peds) {
      if (ped.dead) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.color, { flash: ped.hitFlash > 0 });
    }
    for (const cop of state.cops) {
      if (cop.dead) continue;
      drawPerson(cop.x, cop.y, cop.angle, PALETTE.cop, { flash: cop.hitFlash > 0 });
      ctx.fillStyle = '#0f2a5e';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y - 4, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const r of state.rivals) {
      if (r.dead) continue;
      drawPerson(r.x, r.y, r.angle, PALETTE.rival, { gun: true, flash: r.hitFlash > 0 });
    }
    const p = state.player;
    if (!p.inCar) {
      drawPerson(p.x, p.y, p.aimAngle, PALETTE.player, { gun: true });
      // Aim line, faint.
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.aimAngle) * 26, p.y + Math.sin(p.aimAngle) * 26);
      ctx.lineTo(p.x + Math.cos(p.aimAngle) * 70, p.y + Math.sin(p.aimAngle) * 70);
      ctx.stroke();
    }
    // Bullets as tracers.
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of state.particles) {
      const a = Math.max(0, pt.life / pt.maxLife);
      if (pt.kind === 'flash') {
        ctx.globalAlpha = a;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (0.5 + a), 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.kind === 'smoke') {
        ctx.globalAlpha = a * 0.6;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (1.6 - a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * a + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- HUD ----------
  function drawMinimap(state) {
    const mw = 210;
    const mh = 158;
    const mx = view.cssW - mw - 16;
    const my = 16;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    ctx.fillStyle = '#5d8a4a';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(mx, my + ZONES.beach.y0 * sy, mw, mh - ZONES.beach.y0 * sy);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(mx, my + ZONES.beach.waterY * sy, mw, mh - ZONES.beach.waterY * sy);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    for (const rx of state.city.roads.vertical) {
      ctx.beginPath();
      ctx.moveTo(mx + rx * sx, my);
      ctx.lineTo(mx + rx * sx, my + mh);
      ctx.stroke();
    }
    for (const ry of state.city.roads.horizontal) {
      ctx.beginPath();
      ctx.moveTo(mx, my + ry * sy);
      ctx.lineTo(mx + mw, my + ry * sy);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const b of state.city.buildings) ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    const target = missionTarget(state.missions);
    if (target) {
      const pulse = 3 + Math.sin(state.time * 5) * 1.5;
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(mx + target.x * sx, my + target.y * sy, pulse + 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of state.cars) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(mx + car.x * sx - 1, my + car.y * sy - 1, 2, 2);
    }
    for (const car of state.policeCars) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const px = mx + state.player.x * sx;
    const py = my + state.player.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Wanted stars under the map.
    const starY = my + mh + 24;
    for (let i = 0; i < 5; i += 1) {
      drawStar(mx + 12 + i * 26, starY, 10, i < state.wanted.stars ? PALETTE.star : PALETTE.starEmpty);
    }
    text('WANTED', mx + 138, starY + 5, 13, PALETTE.hudDim, 'left', '700');
  }

  function drawStar(cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const ang = (i * Math.PI) / 5 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawHud(state) {
    // Top-left: cash, health, ammo.
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, 16, 16, 330, 86, 8);
    ctx.fill();
    text(`$${state.player.money.toLocaleString('en-US')}`, 30, 46, 26, PALETTE.cash, 'left', '800');
    const hpW = 200;
    const hpFrac = Math.max(0, state.player.health / PLAYER.health);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, 30, 58, hpW, 12, 6);
    ctx.fill();
    ctx.fillStyle = hpFrac < 0.3 ? PALETTE.healthLow : PALETTE.health;
    if (hpFrac > 0) {
      roundRect(ctx, 30, 58, hpW * hpFrac, 12, 6);
      ctx.fill();
    }
    text(`AMMO ${state.player.ammo}`, 30, 92, 15, PALETTE.hudDim, 'left', '700');
    text(state.player.inCar ? 'IN CAR — E to exit' : 'ON FOOT — E to steal a car', 130, 92, 13, PALETTE.hudDim, 'left');

    drawMinimap(state);

    // Objective, bottom-left.
    const obj = state.missions.active ? objectiveLabel(state.missions) : '';
    if (state.missions.active) {
      const def = missionList()[state.missions.index];
      ctx.fillStyle = PALETTE.hudPanel;
      const labelW = Math.min(520, measure(obj, 17) + 130);
      roundRect(ctx, 16, view.cssH - 86, labelW, 70, 8);
      ctx.fill();
      text(`JOB ${state.missions.index + 1}/5 — ${def.name}`, 30, view.cssH - 58, 15, PALETTE.marker, 'left', '800');
      text(obj, 30, view.cssH - 32, 17, PALETTE.objective, 'left', '600');
    } else if (state.missions.completed.length < missionList().length) {
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(ctx, 16, view.cssH - 66, 430, 50, 8);
      ctx.fill();
      text(`Next job at Mara's Garage — walk there to take it`, 30, view.cssH - 34, 16, PALETTE.hudDim, 'left', '600');
    }

    // Speed and car health, bottom-right.
    if (state.player.inCar && state.playerCar) {
      const mph = Math.round(Math.abs(state.playerCar.speed) * 0.09);
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(ctx, view.cssW - 196, view.cssH - 86, 180, 70, 8);
      ctx.fill();
      text(`${mph}`, view.cssW - 30, view.cssH - 40, 34, PALETTE.hud, 'right', '800');
      text('MPH', view.cssW - 96, view.cssH - 40, 15, PALETTE.hudDim, 'right', '700');
      const cf = Math.max(0, state.playerCar.hp / (state.playerCar.isVan ? 220 : CAR.hp));
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(ctx, view.cssW - 180, view.cssH - 30, 148, 10, 5);
      ctx.fill();
      ctx.fillStyle = cf < 0.3 ? PALETTE.healthLow : PALETTE.health;
      if (cf > 0) {
        roundRect(ctx, view.cssW - 180, view.cssH - 30, 148 * cf, 10, 5);
        ctx.fill();
      }
    }

    // Banners and messages, centre-top.
    if (state.missions.bannerTime > 0) {
      ctx.globalAlpha = Math.min(1, state.missions.bannerTime);
      text(state.missions.banner, view.cssW / 2, 64, 30, PALETTE.marker, 'center', '800');
      ctx.globalAlpha = 1;
    }
    if (state.messageTime > 0) {
      ctx.globalAlpha = Math.min(1, state.messageTime);
      text(state.message, view.cssW / 2, 96, 19, PALETTE.hud, 'center', '600');
      ctx.globalAlpha = 1;
    }

    // Waypoint arrow at the screen edge when the target is off-screen.
    const target = missionTarget(state.missions);
    if (target) {
      const w = screenToWorld(state, view.cssW / 2, view.cssH / 2);
      const d = Math.hypot(target.x - w.x, target.y - w.y);
      const cam = clampedCamera(state);
      const dx = (target.x - cam.x) * cam.scale;
      const dy = (target.y - cam.y) * cam.scale;
      if (Math.abs(dx) > view.cssW / 2 - 60 || Math.abs(dy) > view.cssH / 2 - 60) {
        const ang = Math.atan2(dy, dx);
        const ex = view.cssW / 2 + Math.cos(ang) * (Math.min(view.cssW, view.cssH) / 2 - 70);
        const ey = view.cssH / 2 + Math.sin(ang) * (Math.min(view.cssW, view.cssH) / 2 - 70);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.fillStyle = PALETTE.waypoint;
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-10, -11);
        ctx.lineTo(-10, 11);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        text(`${Math.round(d / 40)}m`, ex, ey + 30, 14, PALETTE.waypoint, 'center', '700');
      }
    }
  }

  // ---------- Menus ----------
  function drawBackdrop(state) {
    applyWorldTransform(state);
    drawWorld(state);
    applyScreenTransform();
    ctx.fillStyle = 'rgba(8,12,22,0.55)';
    ctx.fillRect(0, 0, view.cssW, view.cssH);
  }

  function drawMenuPanel(title, subtitle, lines, prompt, selected = -1) {
    const w = 640;
    const lineH = 30;
    const h = 190 + lines.length * lineH;
    const x = (view.cssW - w) / 2;
    const y = (view.cssH - h) / 2;
    ctx.fillStyle = PALETTE.menuBg;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,217,74,0.5)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 12);
    ctx.stroke();
    text(title, view.cssW / 2, y + 66, 44, PALETTE.menuTitle, 'center', '800');
    if (subtitle) text(subtitle, view.cssW / 2, y + 100, 19, PALETTE.hudDim, 'center', '600');
    for (let i = 0; i < lines.length; i += 1) {
      const ly = y + 140 + i * lineH;
      const isSel = i === selected;
      text(lines[i], view.cssW / 2, ly, 20, isSel ? PALETTE.marker : PALETTE.hud, 'center', isSel ? '800' : '400');
      if (isSel) text('›', view.cssW / 2 - measure(lines[i], 20, '800') / 2 - 24, ly, 20, PALETTE.marker, 'center', '800');
    }
    if (prompt) text(prompt, view.cssW / 2, y + h - 26, 16, PALETTE.hudDim, 'center', '600');
  }

  function drawTitle(state, ui) {
    drawBackdrop(state);
    const items = ui.menuItems;
    const lines = items.map((it) => it.label);
    drawMenuPanel(GAME_NAME, GAME_SUBTITLE, lines, '↑ ↓ to choose — Enter to play — M for missions, H for controls', ui.menuIndex);
    text(`Jobs done: ${state.missions.completed.length}/5   •   Cash: $${state.player.money.toLocaleString('en-US')}`, view.cssW / 2, view.cssH - 56, 16, PALETTE.hudDim, 'center', '600');
    text('An original game. No affiliation with any existing franchise.', view.cssW / 2, view.cssH - 30, 13, 'rgba(185,194,204,0.7)', 'center');
  }

  function drawHowTo(state) {
    drawBackdrop(state);
    const lines = [
      'W A S D / Arrows — walk or drive',
      'Mouse — aim   •   Hold left click — shoot',
      'E — steal a car / get out / take a job',
      'Shift — sprint   •   Space — handbrake (in a car)',
      'P / Esc — pause   •   Wanted stars bring the police',
      'Finish Mara’s five jobs to complete the story.',
      'Your progress saves automatically at the garage.',
    ];
    drawMenuPanel('HOW TO PLAY', 'Solmar Bay in one minute', lines, 'Esc to go back');
  }

  function drawMissionsList(state) {
    drawBackdrop(state);
    const defs = missionList();
    const lines = defs.map((d, i) => {
      const done = state.missions.completed.includes(i);
      const active = state.missions.active && state.missions.index === i;
      return `${done ? '✓' : active ? '►' : '·'}  ${i + 1}. ${d.name} — $${d.reward}${done ? ' (done)' : active ? ' (in progress)' : ''}`;
    });
    drawMenuPanel('JOBS', 'Five jobs for Mara Quinn', lines, 'Esc to go back');
  }

  function drawBrief(state, ui) {
    drawBackdrop(state);
    const def = ui.brief;
    if (!def) return;
    const lines = [def.brief, '', `Reward: $${def.reward}`];
    drawMenuPanel(`JOB ${def.id + 1} — ${def.name}`, `From ${def.giver}`, lines, 'Enter to accept — Esc to wait');
  }

  function drawPaused(state, ui) {
    drawBackdrop(state);
    drawMenuPanel('PAUSED', 'Solmar Bay waits for no one. Except now.', ui.menuItems.map((it) => it.label), '↑ ↓ to choose — Enter to confirm', ui.menuIndex);
  }

  function drawEnd(state, title, subtitle) {
    drawBackdrop(state);
    drawMenuPanel(title, subtitle, [], 'Press Enter to continue');
  }

  function drawComplete(state) {
    drawBackdrop(state);
    const lines = [
      `Cash earned: $${state.player.money.toLocaleString('en-US')}`,
      `Cars stolen: ${state.stats.carsStolen}   •   Kills: ${state.stats.kills}`,
      'The harbor job is done. Solmar Bay is yours — for now.',
    ];
    drawMenuPanel('STORY COMPLETE', 'All five jobs done. Free roam is open.', lines, 'Enter to keep playing');
  }

  /** Paint one frame. `ui` carries the menu state for the current screen. */
  function draw(state, screen, ui) {
    applyScreenTransform();
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, view.cssW, view.cssH);
    if (screen === SCREEN_TITLE) { drawTitle(state, ui); return; }
    if (screen === SCREEN_HOWTO) { drawHowTo(state); return; }
    if (screen === SCREEN_MISSIONS) { drawMissionsList(state); return; }
    if (screen === SCREEN_BRIEF) { drawBrief(state, ui); return; }
    if (screen === SCREEN_COMPLETE) { drawComplete(state); return; }
    applyWorldTransform(state);
    drawWorld(state);
    applyScreenTransform();
    // Warm afternoon light + vignette.
    const glow = ctx.createRadialGradient(view.cssW * 0.2, view.cssH * 0.12, 40, view.cssW * 0.2, view.cssH * 0.12, Math.max(view.cssW, view.cssH) * 0.75);
    glow.addColorStop(0, 'rgba(255,214,140,0.10)');
    glow.addColorStop(1, 'rgba(10,16,32,0.22)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, view.cssW, view.cssH);
    if (screen === SCREEN_PLAY) drawHud(state);
    else if (screen === SCREEN_PAUSED) drawPaused(state, ui);
    else if (screen === SCREEN_WASTED) drawEnd(state, 'WASTED', 'The hospital patched you up. The job is gone — and so is 15% of your cash.');
    else if (screen === SCREEN_BUSTED) drawEnd(state, 'BUSTED', 'The Solmar Bay police took you in. The job is gone — and so is 15% of your cash.');
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld, view: () => ({ w: view.cssW, h: view.cssH }) };
}
