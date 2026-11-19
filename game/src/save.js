// Saving: the whole campaign state in one localStorage key — money, health, jobs
// finished, where the player stands and what he drives. Loading restores it; a corrupt
// or missing save simply starts a new story.
import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      money: state.player.money,
      health: state.player.health,
      ammo: state.player.ammo,
      x: state.player.x,
      y: state.player.y,
      angle: state.player.angle,
      wanted: state.wanted.stars,
      missionsCompleted: state.missions.completed,
      nextMission: state.missions.active ? state.missions.index : state.missions.completed.length,
      kills: state.stats.kills,
      carsStolen: state.stats.carsStolen,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}
