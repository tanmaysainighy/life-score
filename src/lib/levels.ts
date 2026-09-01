/**
 * Level curve. Configured here, never recomputed inside a component.
 *
 * The first five levels are the published progression (0 / 100 / 250 / 500 /
 * 800); past that each gap grows 12% and rounds to a clean number.
 */

function buildThresholds(maxLevel: number): number[] {
  const thresholds = [0, 100, 250, 500, 800];
  let gap = 300;
  while (thresholds.length < maxLevel) {
    gap = Math.round((gap * 1.12) / 10) * 10;
    thresholds.push(thresholds[thresholds.length - 1] + gap);
  }
  return thresholds;
}

const LEVEL_THRESHOLDS = buildThresholds(100);
const MAX_LEVEL = LEVEL_THRESHOLDS.length;

/** Level 1 at 0 XP. Binary search so this stays cheap at any XP. */
export function getLevelFromXP(xp: number): number {
  const total = Math.max(0, Math.floor(xp));
  let low = 0;
  let high = LEVEL_THRESHOLDS.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (LEVEL_THRESHOLDS[mid] <= total) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

/** Total lifetime XP required to reach `level`. */
function getXPForLevel(level: number): number {
  const index = Math.min(Math.max(1, Math.floor(level)), MAX_LEVEL) - 1;
  return LEVEL_THRESHOLDS[index];
}

/** Total lifetime XP required to reach the level after `level`. */
function getXPForNextLevel(level: number): number | null {
  if (level >= MAX_LEVEL) return null;
  return LEVEL_THRESHOLDS[level];
}

export type LevelProgress = {
  level: number;
  levelFloor: number;
  nextLevelAt: number | null;
  xpIntoLevel: number;
  xpForLevel: number;
  xpToNext: number;
  percent: number;
  isMax: boolean;
};

/** Everything the progress bar needs, computed once on the server. */
export function getLevelProgress(xp: number): LevelProgress {
  const total = Math.max(0, Math.floor(xp));
  const level = getLevelFromXP(total);
  const levelFloor = getXPForLevel(level);
  const nextLevelAt = getXPForNextLevel(level);

  if (nextLevelAt === null) {
    return {
      level, levelFloor, nextLevelAt: null, xpIntoLevel: total - levelFloor,
      xpForLevel: 0, xpToNext: 0, percent: 100, isMax: true,
    };
  }

  const xpForLevel = nextLevelAt - levelFloor;
  const xpIntoLevel = total - levelFloor;
  return {
    level,
    levelFloor,
    nextLevelAt,
    xpIntoLevel,
    xpForLevel,
    xpToNext: nextLevelAt - total,
    percent: Math.min(100, Math.round((xpIntoLevel / xpForLevel) * 100)),
    isMax: false,
  };
}
