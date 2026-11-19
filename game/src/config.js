// Solmar Bay — every tuning number and colour in one place.
// The world is one big top-down map (3600 x 2800 px); the camera shows a window of it.
// Nothing here depends on the screen size: the renderer scales the view to fit.
export const WORLD = { width: 3600, height: 2800 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Roads run on a 400 px grid; each road is 96 px wide with a sidewalk edge. */
export const ROAD = { spacing: 400, width: 96, first: 300 };

/** City zones, in world coordinates. */
export const ZONES = {
  beach: { y0: 2500, y1: 2800, waterY: 2640 },
  port: { x0: 3150, y0: 200, x1: 3600, y1: 1100 },
  downtown: { x0: 1300, y0: 500, x1: 2500, y1: 1700 },
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  sprintSpeed: 350,
  health: 100,
  regenDelay: 6,
  regenRate: 4,
  pistolDamage: 34,
  pistolRange: 560,
  pistolRate: 0.22,
  ammoStart: 48,
  ammoMax: 120,
};

export const CAR = {
  radius: 19,
  accel: 560,
  brake: 900,
  reverseMax: 240,
  maxSpeed: 640,
  policeMaxSpeed: 600,
  turnRate: 2.6,
  grip: 6.0,
  handbrakeGrip: 1.6,
  drag: 0.35,
  hp: 100,
};

export const TRAFFIC = { count: 14, minSpeed: 130, maxSpeed: 210 };
export const PEDS = { count: 26 };
export const BULLET = { speed: 980, life: 0.62, radius: 3 };

export const WANTED = {
  max: 5,
  steal: 1,
  shoot: 1,
  hitPed: 1,
  killPed: 2,
  decaySeconds: 16,
  decayRange: 420,
};

export const PICKUP = { cashValue: 60, ammoValue: 24, healthValue: 40 };

export const PALETTE = {
  backdrop: '#1a2233',
  grass: '#7fae5a',
  sand: '#e8cf96',
  water: '#2e7fb8',
  waterDeep: '#1d5f92',
  road: '#3a3f4a',
  roadEdge: '#565d6d',
  lane: '#e8d44d',
  sidewalk: '#9aa0ab',
  roofA: '#c96f4a',
  roofB: '#4a7fb5',
  roofC: '#8a6fb5',
  roofD: '#b5a04a',
  roofE: '#5ab58a',
  containerA: '#c94a4a',
  containerB: '#4a8ac9',
  containerC: '#c9a24a',
  tree: '#3f7d3a',
  treeDark: '#2f6130',
  buildingShadow: 'rgba(0,0,0,0.28)',
  player: '#f2c94c',
  playerDark: '#1f2a44',
  cop: '#2f6fd0',
  copCar: '#e8e8e8',
  rival: '#c94a6e',
  hud: '#f5f1e6',
  hudDim: '#b9c2cc',
  hudPanel: 'rgba(12,18,32,0.72)',
  star: '#ffd94a',
  starEmpty: 'rgba(255,255,255,0.25)',
  health: '#58d68d',
  healthLow: '#e5534b',
  cash: '#7ee787',
  marker: '#ffd94a',
  waypoint: '#ffd94a',
  objective: '#ffffff',
  menuTitle: '#ffd94a',
  menuBg: 'rgba(10,14,24,0.82)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const SAVE_KEY = 'solmar-bay.save.v1';
export const GAME_NAME = 'SOLMAR BAY';
export const GAME_SUBTITLE = 'A Sun Coast Crime Story';
