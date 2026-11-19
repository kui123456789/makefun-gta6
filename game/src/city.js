// Solmar Bay itself: a sun-soaked coastal city on a road grid, built once from a seed.
// Roads run every 400 px; the blocks between them hold buildings, trees and props. The
// south edge is a beach and the sea; the east edge is the container port; the centre is
// downtown towers. Everything the simulation needs to ask the city — is this point on a
// road, does this circle hit a building, where is the nearest road — lives here.
import { ROAD, WORLD, ZONES, PALETTE } from './config.js';
import { chance, int, pick, range } from './random.js';

const ROOFS = [PALETTE.roofA, PALETTE.roofB, PALETTE.roofC, PALETTE.roofD, PALETTE.roofE];
const CONTAINERS = [PALETTE.containerA, PALETTE.containerB, PALETTE.containerC];

function roadLines() {
  const vertical = [];
  const horizontal = [];
  for (let x = ROAD.first; x < WORLD.width; x += ROAD.spacing) vertical.push(x);
  for (let y = ROAD.first; y < ZONES.beach.y0; y += ROAD.spacing) horizontal.push(y);
  return { vertical, horizontal };
}

function onRoad(city, x, y) {
  const half = ROAD.width / 2;
  for (const rx of city.roads.vertical) if (Math.abs(x - rx) < half) return true;
  for (const ry of city.roads.horizontal) if (Math.abs(y - ry) < half) return true;
  return false;
}

/** The nearest point on a road centre line, for keeping traffic on the grid. */
function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of city.roads.vertical) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y, vertical: true }; }
  }
  for (const ry of city.roads.horizontal) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x, y: ry, vertical: false }; }
  }
  return best;
}

/** Push a circle out of every building and the world edge; returns corrected {x, y}. */
function collideCircle(city, x, y, radius) {
  let cx = x;
  let cy = y;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
    const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
    const dx = cx - nx;
    const dy = cy - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        cx = nx + (dx / d) * radius;
        cy = ny + (dy / d) * radius;
      } else {
        // Dead centre of a building: shove out along the shortest side.
        const left = cx - b.x;
        const right = b.x + b.w - cx;
        const top = cy - b.y;
        const bottom = b.y + b.h - cy;
        const m = Math.min(left, right, top, bottom);
        if (m === left) cx = b.x - radius;
        else if (m === right) cx = b.x + b.w + radius;
        else if (m === top) cy = b.y - radius;
        else cy = b.y + b.h + radius;
      }
    }
  }
  cx = Math.max(radius, Math.min(WORLD.width - radius, cx));
  cy = Math.max(radius, Math.min(WORLD.height - radius, cy));
  return { x: cx, y: cy };
}

function circleHitsBuilding(city, x, y, radius) {
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < radius * radius) return b;
  }
  return null;
}

/** A point on a road, picked at random: a spawn spot for cars and pedestrians. */
function randomRoadPoint(rng, city) {
  if (chance(rng, 0.5)) {
    const rx = pick(rng, city.roads.vertical);
    return { x: rx + range(rng, -24, 24), y: range(rng, ROAD.first, ZONES.beach.y0 - 100), vertical: true };
  }
  const ry = pick(rng, city.roads.horizontal);
  return { x: range(rng, ROAD.first, WORLD.width - 100), y: ry + range(rng, -24, 24), vertical: false };
}

export function buildCity(rng) {
  const roads = roadLines();
  const buildings = [];
  const trees = [];
  const containers = [];
  const half = ROAD.width / 2;

  // One building (or a pair) per block between the roads.
  for (let gx = 0; gx < roads.vertical.length - 1; gx += 1) {
    for (let gy = 0; gy < roads.horizontal.length - 1; gy += 1) {
      const x0 = roads.vertical[gx] + half + 14;
      const x1 = roads.vertical[gx + 1] - half - 14;
      const y0 = roads.horizontal[gy] + half + 14;
      const y1 = roads.horizontal[gy + 1] - half - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // The port blocks hold containers, not buildings.
      if (x0 > ZONES.port.x0 && y0 < ZONES.port.y1) {
        for (let i = 0; i < 5; i += 1) {
          containers.push({
            x: range(rng, x0, x1 - 90), y: range(rng, y0, y1 - 40),
            w: 84, h: 34, color: pick(rng, CONTAINERS),
          });
        }
        continue;
      }
      const downtown = x0 > ZONES.downtown.x0 && x0 < ZONES.downtown.x1 && y0 > ZONES.downtown.y0 && y0 < ZONES.downtown.y1;
      const count = downtown ? 1 : chance(rng, 0.45) ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const w = range(rng, 110, Math.min(240, x1 - x0));
        const h = range(rng, 100, Math.min(220, y1 - y0));
        const bx = count === 1 ? x0 + (x1 - x0 - w) / 2 : x0 + (i * (x1 - x0 - w)) / Math.max(1, count - 1);
        const by = y0 + (y1 - y0 - h) / 2 + range(rng, -20, 20);
        buildings.push({
          x: bx, y: by, w, h,
          color: pick(rng, ROOFS),
          height: downtown ? int(rng, 26, 54) : int(rng, 6, 18),
          downtown,
        });
      }
      // A couple of palms or street trees per block.
      for (let i = 0; i < 2; i += 1) {
        trees.push({ x: range(rng, x0, x1), y: range(rng, y0, y1), r: range(rng, 9, 15) });
      }
    }
  }

  // The beach strip: palms along the sand, no buildings.
  for (let i = 0; i < 26; i += 1) {
    trees.push({ x: range(rng, 80, WORLD.width - 80), y: range(rng, ZONES.beach.y0 + 20, ZONES.beach.waterY - 30), r: range(rng, 10, 16) });
  }

  // Named places the missions use, all on roads so cars can reach them.
  const places = {
    garage: { x: 1500, y: 1500, label: "Mara's Garage" },
    motel: { x: 700, y: 1900, label: 'Seabreeze Motel' },
    dock: { x: 3300, y: 700, label: 'Harbor Dock' },
    safehouse: { x: 300, y: 300, label: 'Safehouse' },
    rivalBlock: { x: 700, y: 700, label: 'Rival Turf' },
    bank: { x: 1900, y: 1100, label: 'Solmar Bank' },
    port: { x: 3300, y: 300, label: 'Container Port' },
    warehouse: { x: 3100, y: 1900, label: 'Warehouse 9' },
    hospital: { x: 1100, y: 1900, label: 'St. Anselm Hospital' },
    beach: { x: 1900, y: 2560, label: 'Solmar Beach' },
  };

  return {
    width: WORLD.width,
    height: WORLD.height,
    roads,
    buildings,
    trees,
    containers,
    places,
    onRoad: (x, y) => onRoad({ roads }, x, y),
    nearestRoadPoint: (x, y) => nearestRoadPoint({ roads }, x, y),
    collideCircle: (x, y, radius) => collideCircle({ buildings }, x, y, radius),
    circleHitsBuilding: (x, y, radius) => circleHitsBuilding({ buildings }, x, y, radius),
    randomRoadPoint: () => randomRoadPoint(rng, { roads }),
  };
}
