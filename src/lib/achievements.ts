/**
 * Achievements are derived from stats the dashboard already computes, so
 * awarding them costs no extra queries.
 */

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
};

export type AchievementStats = {
  lifetimeXp: number;
  currentStreak: number;
  longestStreak: number;
  totalEntries: number;
  distinctActivities: number;
  level: number;
};

export const ACHIEVEMENTS: (Achievement & { earned: (s: AchievementStats) => boolean })[] = [
  { id: "first_log", name: "First Steps", description: "Log your first activity", icon: "🌱", earned: (s) => s.totalEntries >= 1 },
  { id: "xp_100", name: "Getting Going", description: "Earn 100 lifetime XP", icon: "⚡", earned: (s) => s.lifetimeXp >= 100 },
  { id: "xp_1000", name: "Four Digits", description: "Earn 1,000 lifetime XP", icon: "🔷", earned: (s) => s.lifetimeXp >= 1000 },
  { id: "xp_10000", name: "Five Digits", description: "Earn 10,000 lifetime XP", icon: "💎", earned: (s) => s.lifetimeXp >= 10000 },
  { id: "streak_3", name: "Warming Up", description: "Hold a 3 day streak", icon: "🔥", earned: (s) => s.longestStreak >= 3 },
  { id: "streak_7", name: "Full Week", description: "Hold a 7 day streak", icon: "🗓️", earned: (s) => s.longestStreak >= 7 },
  { id: "streak_30", name: "Unbroken", description: "Hold a 30 day streak", icon: "🏔️", earned: (s) => s.longestStreak >= 30 },
  { id: "level_5", name: "Level 5", description: "Reach level 5", icon: "⭐", earned: (s) => s.level >= 5 },
  { id: "level_10", name: "Level 10", description: "Reach level 10", icon: "🌟", earned: (s) => s.level >= 10 },
  { id: "level_20", name: "Level 20", description: "Reach level 20", icon: "👑", earned: (s) => s.level >= 20 },
  { id: "entries_50", name: "Consistent", description: "Log 50 activities", icon: "📚", earned: (s) => s.totalEntries >= 50 },
  { id: "variety_10", name: "Well Rounded", description: "Log 10 different activities", icon: "🎨", earned: (s) => s.distinctActivities >= 10 },
];

export function evaluateAchievements(stats: AchievementStats): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.earned(stats)).map(({ earned: _earned, ...rest }) => rest);
}
