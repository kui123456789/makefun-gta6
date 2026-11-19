// The story: five jobs for Mara Quinn, the fixer who runs Solmar Bay's night work.
// Each mission is a list of objectives the player works through in order. An objective
// is one of: go somewhere, steal a car, survive a chase, defeat a number of rivals, or
// wait out a timer. Completing the last objective pays out and opens the next job.
export const MISSION_COUNT = 5;

function place(city, name) {
  return city.places[name];
}

export function missionList() {
  return [
    { id: 0, name: 'First Wheels', giver: 'Mara Quinn', reward: 200,
      brief: 'You need wheels, Danny. Take any car on the street and bring it to my garage. The city will notice — drive like you mean it.' },
    { id: 1, name: 'The Package', giver: 'Mara Quinn', reward: 400,
      brief: 'A crate is waiting at the harbor dock. Pick it up and drop it at the Seabreeze Motel. The port crew will not ask questions. The cops might.' },
    { id: 2, name: 'Getaway Driver', giver: 'Mara Quinn', reward: 700,
      brief: 'My crew is hitting the Solmar Bank. You drive. Get to the bank, then get us all to the safehouse with the whole city on your tail.' },
    { id: 3, name: 'Rival Turf', giver: 'Mara Quinn', reward: 1000,
      brief: 'The Vipers took our corner on the west side. Go there, clear them out, and come home. Bring ammo.' },
    { id: 4, name: 'The Harbor Job', giver: 'Mara Quinn', reward: 2000,
      brief: 'One last job. An armored van is parked at the container port. Take it and bring it to Warehouse 9. Every cop in Solmar Bay will be after you. Make it count.' },
  ];
}

/** Build the objectives for a mission, in world coordinates, from the city's places. */
export function buildObjectives(id, city) {
  const p = (name) => place(city, name);
  switch (id) {
    case 0:
      return [
        { type: 'steal', label: 'Steal a car (walk up to one and press E)' },
        { type: 'goto', x: p('garage').x, y: p('garage').y, r: 90, label: "Drive to Mara's Garage" },
      ];
    case 1:
      return [
        { type: 'goto', x: p('dock').x, y: p('dock').y, r: 80, label: 'Pick up the package at the Harbor Dock' },
        { type: 'hold', x: p('dock').x, y: p('dock').y, r: 80, seconds: 2, label: 'Loading the package…' },
        { type: 'goto', x: p('motel').x, y: p('motel').y, r: 90, label: 'Deliver the package to the Seabreeze Motel' },
      ];
    case 2:
      return [
        { type: 'goto', x: p('bank').x, y: p('bank').y, r: 90, label: 'Get to the Solmar Bank' },
        { type: 'chase', label: 'Lose the heat — reach the safehouse' },
        { type: 'goto', x: p('safehouse').x, y: p('safehouse').y, r: 100, label: 'Reach the Safehouse' },
      ];
    case 3:
      return [
        { type: 'goto', x: p('rivalBlock').x, y: p('rivalBlock').y, r: 140, label: 'Go to the Vipers’ corner' },
        { type: 'defeat', count: 5, label: 'Clear out the Vipers (0/5)' },
        { type: 'goto', x: p('garage').x, y: p('garage').y, r: 90, label: "Report back to Mara's Garage" },
      ];
    case 4:
      return [
        { type: 'goto', x: p('port').x, y: p('port').y, r: 110, label: 'Get to the Container Port' },
        { type: 'stealVan', label: 'Steal the armored van (press E)' },
        { type: 'goto', x: p('warehouse').x, y: p('warehouse').y, r: 110, label: 'Deliver the van to Warehouse 9' },
      ];
    default:
      return [];
  }
}

export function createMissionState() {
  return {
    index: -1, // -1: no job yet; 0..4: a job; 5: story complete
    active: false,
    objectives: [],
    objectiveIndex: 0,
    timer: 0,
    holdTime: 0,
    defeatCount: 0,
    defeatTotal: 0,
    banner: '',
    bannerTime: 0,
    completed: [],
  };
}

export function currentObjective(missions) {
  if (!missions.active) return null;
  return missions.objectives[missions.objectiveIndex] ?? null;
}

export function objectiveLabel(missions) {
  const obj = currentObjective(missions);
  if (!obj) return '';
  if (obj.type === 'defeat') return `Clear out the Vipers (${missions.defeatCount}/${missions.defeatTotal})`;
  if (obj.type === 'hold') return obj.label;
  return obj.label;
}

/** Start job `index`: fresh objectives, a banner, and any setup the job needs. */
export function startMission(missions, index, city, state) {
  missions.index = index;
  missions.active = true;
  missions.objectives = buildObjectives(index, city);
  missions.objectiveIndex = 0;
  missions.timer = 0;
  missions.holdTime = 0;
  missions.defeatCount = 0;
  missions.defeatTotal = missions.objectives.find((o) => o.type === 'defeat')?.count ?? 0;
  const def = missionList()[index];
  missions.banner = `${def.name} — ${def.giver}`;
  missions.bannerTime = 4;
  // Job 2 starts the heat the moment the crew leaves the bank; job 4 at the port.
  if (index === 2) missions.armedAtBank = true;
  if (index === 4) missions.vanStolen = false;
  return def;
}

/** Advance to the next objective; returns 'done' when the job is finished. */
export function advanceObjective(missions, state) {
  missions.objectiveIndex += 1;
  missions.holdTime = 0;
  if (missions.objectiveIndex >= missions.objectives.length) {
    const def = missionList()[missions.index];
    state.player.money += def.reward;
    missions.completed.push(missions.index);
    missions.active = false;
    missions.banner = `Job done — ${def.name} paid $${def.reward}`;
    missions.bannerTime = 5;
    state.audio.mission();
    return 'done';
  }
  const next = currentObjective(missions);
  if (next && next.type === 'chase') {
    // The bank job: the heat jumps to 3 stars the moment the crew is in the car.
    state.wanted.stars = 3;
    state.wanted.lastCrime = state.time;
    state.audio.wantedUp();
  }
  return 'next';
}

/**
 * One step of the mission tracker. Checks the current objective against the world
 * and advances it when met. Returns 'done' when the job pays out, 'fail' when the
 * job's timer runs out, else ''.
 */
export function stepMission(missions, state, dt) {
  if (!missions.active) return '';
  if (missions.bannerTime > 0) missions.bannerTime -= dt;
  const obj = currentObjective(missions);
  if (!obj) return '';
  const px = state.player.inCar && state.playerCar ? state.playerCar.x : state.player.x;
  const py = state.player.inCar && state.playerCar ? state.playerCar.y : state.player.y;
  const dist = Math.hypot(obj.x - px, obj.y - py);
  switch (obj.type) {
    case 'goto':
      if (dist < obj.r) return advanceObjective(missions, state);
      break;
    case 'hold':
      if (dist < obj.r) {
        missions.holdTime += dt;
        if (missions.holdTime >= obj.seconds) return advanceObjective(missions, state);
      } else {
        missions.holdTime = 0;
      }
      break;
    case 'steal':
      if (state.player.inCar) return advanceObjective(missions, state);
      break;
    case 'stealVan':
      if (state.playerCar && state.playerCar.isVan) return advanceObjective(missions, state);
      break;
    case 'chase':
      // Reach the safehouse while the heat is on: the next objective handles arrival.
      return advanceObjective(missions, state);
    case 'defeat':
      if (missions.defeatCount >= missions.defeatTotal) return advanceObjective(missions, state);
      break;
    default:
      break;
  }
  return '';
}

/** The world position the waypoint arrow should point at, or null. */
export function missionTarget(missions) {
  const obj = currentObjective(missions);
  if (!obj || obj.x === undefined) return null;
  return { x: obj.x, y: obj.y };
}
